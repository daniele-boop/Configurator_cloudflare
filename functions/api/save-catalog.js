// functions/api/save-catalog.js  ->  POST /api/save-catalog
// Salva il catalogo lato server (Workers KV), protetto da un token.
//
// SEGRETO da impostare su Cloudflare Pages (Settings -> Variables and Secrets):
//   ADMIN_TOKEN = una stringa segreta a tua scelta (NON è la password del pannello)
//
// Il pannello chiede questo token al momento del salvataggio e lo invia una sola volta.
// Il token vero vive solo tra i secret di Cloudflare, mai nel codice del sito.

import { corsHeaders, json, preflight } from "../_lib/odoo.js";

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

  if (!payload.token || payload.token !== env.ADMIN_TOKEN) {
    return json({ ok: false, error: "Token non valido." }, 401, headers);
  }

  const catalog = payload.catalog;
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
