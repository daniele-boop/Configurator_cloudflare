// functions/_lib/admin.js
// La chiave del pannello di amministrazione.
//
// Prima la password stava dentro il catalogo, e il catalogo lo serve
// /api/get-catalog senza chiedere niente a nessuno: bastava aprire quell
// indirizzo per leggerla. Adesso la password non sta più in nessun file
// scaricabile — sta fra i Secret di Cloudflare — e a confrontarla è il server.
//
// Chi indovina la password riceve un BIGLIETTO: una stringa firmata che vale
// otto ore e che le funzioni di salvataggio sanno riconoscere. Così l'ADMIN_TOKEN
// non lo digita più nessuno e non passa più dal browser.

const DURATA = 8 * 60 * 60 * 1000;   // il biglietto vale una giornata di lavoro
const TENTATIVI = 10;                // per indirizzo IP
const FINESTRA = 15 * 60;            // secondi

const enc = new TextEncoder();

/** Confronto che non si ferma al primo carattere diverso: il tempo di
 *  risposta non deve raccontare quanto ci si è andati vicino. */
function pariPari(a, b) {
  const x = enc.encode(String(a || "")), y = enc.encode(String(b || ""));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function firma(chiave, testo) {
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(chiave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(testo)));
}

/** Il biglietto: scadenza in chiaro più la sua firma. Senza la chiave non si
 *  fabbrica, e cambiando la scadenza a mano la firma non torna più. */
export async function creaBiglietto(env) {
  const exp = Date.now() + DURATA;
  return exp + "." + await firma(env.ADMIN_TOKEN, "cfg:" + exp);
}

export async function bigliettoValido(env, biglietto) {
  if (!env.ADMIN_TOKEN || !biglietto) return false;
  const p = String(biglietto).split(".");
  if (p.length !== 2) return false;
  const exp = Number(p[0]);
  if (!exp || exp < Date.now()) return false;
  return pariPari(p[1], await firma(env.ADMIN_TOKEN, "cfg:" + exp));
}

/** Autorizza una richiesta di scrittura: biglietto oppure, per compatibilità
 *  con la versione vecchia del pannello, l'ADMIN_TOKEN scritto a mano. */
export async function puoScrivere(env, payload) {
  if (payload && payload.ticket && await bigliettoValido(env, payload.ticket)) return true;
  if (payload && payload.token && env.ADMIN_TOKEN && pariPari(payload.token, env.ADMIN_TOKEN)) return true;
  return false;
}

/** Dieci tentativi ogni quarto d'ora per indirizzo. Non ferma un attacco vero,
 *  ma toglie di mezzo chi prova le password a mano o con uno script banale. */
export async function troppiTentativi(env, ip) {
  if (!env.CATALOG || !ip) return false;
  const k = "login:" + ip;
  let n = 0;
  try { n = Number(await env.CATALOG.get(k)) || 0; } catch { return false; }
  if (n >= TENTATIVI) return true;
  try { await env.CATALOG.put(k, String(n + 1), { expirationTtl: FINESTRA }); } catch {}
  return false;
}

export const passwordGiusta = (env, data) =>
  !!env.ADMIN_PASSWORD && pariPari(data, env.ADMIN_PASSWORD);

/** Il catalogo che esce di casa non porta con sé la password, nemmeno se per
 *  sbaglio qualcuno la rimettesse dentro salvando da una versione vecchia. */
export function senzaSegreti(catalogo) {
  if (!catalogo || typeof catalogo !== "object") return catalogo;
  const { password, ...resto } = catalogo;
  return resto;
}

/**
 * Chi arriva passando da Cloudflare Access porta con sé il biglietto che Access
 * gli ha messo in tasca. Non lo verifichiamo contro le chiavi del team — per
 * quello basta Access, che è davanti — ma la sua ASSENZA dice una cosa utile:
 * questa richiesta non è passata dal portone.
 *
 * Serve perché ogni deploy di Pages ha anche un suo indirizzo con l'hash
 * davanti, e quegli indirizzi Access non li copre. Da lì usciva il catalogo
 * intero.
 */
export const dentroAccess = request =>
  !!(request && request.headers && request.headers.get("Cf-Access-Jwt-Assertion"));

/**
 * Il catalogo per chi non è passato da Access: struttura sì, soldi no.
 *
 * Restano prodotti, cabinet, misure e schede tecniche — servono a comporre una
 * parete e non sono un segreto. Spariscono i **prezzi** (che sono i nostri
 * costi d'acquisto) e i **codici Odoo** (che dicono da chi compriamo). Una
 * pagina aperta da lì compone la parete e non mostra il totale, ed è giusto
 * così: meglio un prezzo che non compare di un costo che gira.
 */
export function senzaSoldi(catalogo) {
  const c = senzaSegreti(catalogo);
  if (!c || typeof c !== "object") return c;
  const via = ({ price, prices, codes, code, cost, ...resto }) => resto;
  return {
    ...c,
    products: (c.products || []).map(p => ({
      ...p,
      cabinets: (p.cabinets || []).map(via),
      flightcases: p.flightcases
        ? { ...p.flightcases, cases: (p.flightcases.cases || []).map(via) } : p.flightcases,
      accessories: p.accessories
        ? { ...p.accessories, items: (p.accessories.items || []).map(via) } : p.accessories
    })),
    controllers: (c.controllers || []).map(via),
    __ridotto: true
  };
}
