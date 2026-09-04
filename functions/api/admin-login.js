// functions/api/admin-login.js  ->  POST /api/admin-login
// Apre il pannello di amministrazione.
//
// SEGRETO da impostare su Cloudflare Pages (Settings -> Variables and Secrets):
//   ADMIN_PASSWORD = la password del pannello
//
// Serve anche ADMIN_TOKEN, che c'era già: da qui in avanti non si digita più,
// è la chiave con cui il server firma il biglietto.

import { corsHeaders, json, preflight } from "../_lib/odoo.js";
import { creaBiglietto, passwordGiusta, troppiTentativi } from "../_lib/admin.js";

export async function onRequestOptions({ env }) { return preflight(env); }

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);

  if (!env.ADMIN_PASSWORD || !env.ADMIN_TOKEN) {
    return json({ ok: false, error: "Pannello non configurato: mancano ADMIN_PASSWORD o ADMIN_TOKEN su Cloudflare." }, 500, headers);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await troppiTentativi(env, ip)) {
    return json({ ok: false, error: "Troppi tentativi. Riprova fra un quarto d'ora." }, 429, headers);
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  if (!passwordGiusta(env, body.password)) {
    return json({ ok: false, error: "Password non valida." }, 401, headers);
  }

  return json({ ok: true, ticket: await creaBiglietto(env) }, 200, headers);
}
