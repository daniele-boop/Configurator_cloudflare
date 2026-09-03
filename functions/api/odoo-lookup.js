// functions/api/odoo-lookup.js  ->  POST /api/odoo-lookup
// Cerca un articolo su Odoo per riferimento interno o per pezzo di nome, e
// restituisce quello che Odoo sa: nome, listino, costo. Sola lettura.
//
// Serve al pannello Amministrazione per non far ridigitare a mano dati che
// esistono di là. Attenzione a cosa NON c'è: i limiti tecnici di un
// controller (pixel massimi, porte, 4K) su Odoo non esistono, stanno sulla
// scheda del produttore. Quelli restano da scrivere.

import { corsHeaders, json, preflight, odooClient, odooConfigured } from "../_lib/odoo.js";

const FIELDS = ["default_code", "name", "list_price", "standard_price", "active"];

const shape = r => ({
  code: (r.default_code || "").trim(),
  name: r.name || "",
  price: Number(r.list_price) || 0,
  cost: Number(r.standard_price) || 0,
  active: r.active !== false
});

export async function onRequestOptions({ env }) { return preflight(env); }

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);
  if (!odooConfigured(env)) {
    return json({ ok: false, error: "Connettore Odoo non configurato." }, 500, headers);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "JSON non valido" }, 400, headers); }

  const code = String(body.code || "").trim();
  const q = String(body.q || "").trim();
  if (!code && !q) return json({ ok: false, error: "Serve un codice o un testo da cercare." }, 400, headers);

  const { kw } = odooClient(env);

  try {
    if (code) {
      const recs = await kw("product.product", "search_read",
        [[["default_code", "=", code]]], { fields: FIELDS, limit: 5 });
      if (recs && recs.length) {
        const items = recs.map(shape);
        return json({ ok: true, found: true, item: items.find(i => i.active) || items[0], items }, 200, headers);
      }
      // niente di esatto: si propone quello che gli somiglia, così un refuso
      // si corregge sul posto invece di rimandare su Odoo
      const near = await kw("product.product", "search_read",
        [[["default_code", "ilike", code]]], { fields: FIELDS, limit: 12 });
      return json({
        ok: true, found: false, item: null, items: (near || []).map(shape),
        message: 'Nessun articolo con riferimento interno "' + code + '" su Odoo.'
      }, 200, headers);
    }

    const recs = await kw("product.product", "search_read",
      [["|", ["default_code", "ilike", q], ["name", "ilike", q]]],
      { fields: FIELDS, limit: 25 });
    const items = (recs || []).map(shape).filter(i => i.code);
    return json({
      ok: true, found: items.length > 0, item: null, items,
      message: items.length ? null : 'Nessun articolo trovato per "' + q + '".'
    }, 200, headers);
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500, headers);
  }
}
