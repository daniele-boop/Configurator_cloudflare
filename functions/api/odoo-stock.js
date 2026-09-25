// functions/api/odoo-stock.js  ->  POST /api/odoo-stock
// Riceve una lista di codici (default_code) e restituisce la giacenza disponibile
// (qty_available) del prodotto corrispondente in Odoo. Sola lettura.
//
// Serve al configuratore per mostrare un pallino verde nella tendina delle
// risoluzioni: verde = i cabinet di quella risoluzione sono a magazzino.
// NB: qty_available e' la disponibilita' attuale, non una prenotazione.

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
      [[["default_code", "in", uniq]]], { fields: ["default_code", "qty_available"] });

    const stock = {};
    (recs || []).forEach(r => { if (r.default_code) stock[r.default_code] = Number(r.qty_available) || 0; });

    const missing = uniq.filter(c => !(c in stock));

    return json({ ok: true, stock, missing }, 200, headers);
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500, headers);
  }
}
