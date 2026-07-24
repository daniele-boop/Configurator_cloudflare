// functions/api/odoo-prices.js  ->  POST /api/odoo-prices
// Riceve una lista di codici (default_code) e restituisce il prezzo di listino
// (list_price) del prodotto corrispondente in Odoo. Sola lettura.

import { corsHeaders, json, preflight, odooClient, odooConfigured } from "../_lib/odoo.js";

export async function onRequestOptions({ env }) { return preflight(env); }

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);

  if (!odooConfigured(env)) {
    return json({ ok: false, error: "Connettore non configurato." }, 500, headers);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "JSON non valido" }, 400, headers); }

  const codes = Array.isArray(body.codes) ? body.codes.map(c => String(c).trim()).filter(Boolean) : [];
  if (!codes.length) return json({ ok: false, error: "Nessun codice fornito" }, 400, headers);

  const { kw } = odooClient(env);

  try {
    const uniq = [...new Set(codes)];
    const recs = await kw("product.product", "search_read",
      [[["default_code", "in", uniq]]], { fields: ["default_code", "list_price"] });

    const prices = {};
    (recs || []).forEach(r => { if (r.default_code) prices[r.default_code] = r.list_price; });

    const missing = uniq.filter(c => !(c in prices));

    return json({ ok: true, prices, missing }, 200, headers);
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500, headers);
  }
}
