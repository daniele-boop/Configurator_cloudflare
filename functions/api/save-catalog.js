// functions/api/save-catalog.js  ->  POST /api/save-catalog
// Salva il catalogo lato server (Workers KV), protetto da un token.
//
// SEGRETI da impostare su Cloudflare Pages (Settings -> Variables and Secrets):
//   ADMIN_PASSWORD = la password del pannello
//   ADMIN_TOKEN    = una stringa segreta a tua scelta, con cui il server firma i biglietti
//
// Il pannello non chiede più il token a mano: entra con la password, riceve un
// biglietto firmato che vale otto ore e lo allega ai salvataggi. Il token
// scritto a mano continua a funzionare, per non rompere una scheda già aperta.

import { corsHeaders, json, preflight } from "../_lib/odoo.js";
import { puoScrivere, senzaSegreti } from "../_lib/admin.js";

export async function onRequestOptions({ env }) { return preflight(env); }

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);

  if (!env.ADMIN_TOKEN) {
    return json({ ok: false, error: "ADMIN_TOKEN non configurato su Cloudflare." }, 500, headers);
  }
  if (!env.CATALOG) {
    return json({ ok: false, error: "Binding KV 'CATALOG' non configurato." }, 500, headers);
  }

  let payload;
  try { payload = await request.json(); }
  catch { return json({ ok: false, error: "JSON non valido" }, 400, headers); }

  if (!await puoScrivere(env, payload)) {
    return json({ ok: false, error: "Sessione scaduta: richiudi e riapri il pannello." }, 401, headers);
  }

  // la password non entra nel catalogo nemmeno se arriva da un pannello vecchio
  const catalog = senzaSegreti(payload.catalog);
  if (!catalog || !Array.isArray(catalog.products) || !catalog.products.length) {
    return json({ ok: false, error: "Catalogo assente o senza prodotti." }, 400, headers);
  }

  try {
    await env.CATALOG.put("catalog", JSON.stringify(catalog));
    return json({ ok: true, savedAt: new Date().toISOString() }, 200, headers);
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500, headers);
  }
}
