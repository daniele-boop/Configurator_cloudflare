// functions/api/odoo-quote.js  ->  POST /api/odoo-quote
//
// Riceve l'offerta esportata dal configuratore e crea una quotation (sale.order)
// bozza in Odoo tramite JSON-RPC (endpoint /jsonrpc, metodo execute_kw).
//
// PREREQUISITI
// - Piano Odoo con API esterna attiva (es. "Custom").
// - Un utente Odoo con una API key.
// - I prodotti già presenti in Odoo, ognuno con il "Riferimento interno"
//   (default_code) uguale al codice inserito nel configuratore.
//
// VARIABILI / SEGRETI su Cloudflare Pages (Settings -> Variables and Secrets):
//   ODOO_URL           es. https://nseled-europe.odoo.com   (senza slash finale)
//   ODOO_DB            nome del database (di solito il sottodominio)
//   ODOO_LOGIN         login dell'utente (email)
//   ODOO_API_KEY       la API key                              [secret]
//   ODOO_PARTNER_ID    (opzionale) id di un cliente esistente da usare sempre
//   ODOO_PARTNER_NAME  (opzionale) cliente segnaposto, default "Cliente da definire"
//   ODOO_OBJECT_FIELD  (opzionale) nome tecnico del campo personalizzato "Oggetto"
//                      (es. x_studio_oggetto)
//   ALLOW_ORIGIN       (opzionale) origine consentita per il CORS

import { corsHeaders, json, preflight, odooClient, odooConfigured } from "../_lib/odoo.js";

export async function onRequestOptions({ env }) { return preflight(env); }

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);

  if (!odooConfigured(env)) {
    return json({ ok: false, error: "Connettore non configurato: mancano le variabili d'ambiente Odoo." }, 500, headers);
  }

  let offer;
  try { offer = await request.json(); }
  catch { return json({ ok: false, error: "JSON non valido" }, 400, headers); }

  const lines = Array.isArray(offer.lines) ? offer.lines : [];
  if (!lines.length) return json({ ok: false, error: "Nessuna riga nell'offerta" }, 400, headers);

  const { kw } = odooClient(env);

  try {
    // 1) cliente: partner passato / ODOO_PARTNER_ID, altrimenti trova-o-crea il segnaposto
    let partnerId = Number(offer.partner_id) || Number(env.ODOO_PARTNER_ID) || 0;
    if (!partnerId) {
      const name = env.ODOO_PARTNER_NAME || "Cliente da definire";
      const ex = await kw("res.partner", "search_read", [[["name", "=", name]]], { fields: ["id"], limit: 1 });
      partnerId = ex.length ? ex[0].id : await kw("res.partner", "create", [{ name, is_company: true, customer_rank: 1 }]);
    }

    // 2) risolve TUTTI i codici in una sola query (meno sottorichieste, più veloce)
    const codes = [];
    for (const l of lines) {
      const c = (l.code || "").trim();
      if (!c) return json({ ok: false, error: "Riga senza codice Odoo: " + (l.label || "(senza etichetta)") }, 422, headers);
      if (!codes.includes(c)) codes.push(c);
    }
    const recs = await kw("product.product", "search_read",
      [[["default_code", "in", codes]]], { fields: ["id", "default_code"] });

    const byCode = {};
    (recs || []).forEach(r => { if (r.default_code) byCode[r.default_code] = r.id; });

    const missing = codes.filter(c => !byCode[c]);
    if (missing.length) {
      return json({ ok: false, error: "Codici non trovati in Odoo: " + missing.join(", ") }, 422, headers);
    }

    // 3) righe: prima la RIGA SEZIONE, poi i prodotti.
    //    Il prezzo NON viene forzato: lo calcola Odoo dal listino.
    const orderLines = [];
    const sectionText = (offer.section || "").trim();
    if (sectionText) {
      orderLines.push([0, 0, { display_type: "line_section", name: sectionText }]);
    }
    for (const l of lines) {
      orderLines.push([0, 0, { product_id: byCode[(l.code || "").trim()], product_uom_qty: l.qty }]);
    }

    // 4) crea la quotation in bozza
    const summary = sectionText ||
      (`Configuratore parete LED — ${offer.product || ""} · ${offer.size ? offer.size.w + "×" + offer.size.h + " mm" : ""}` +
       (offer.resolution ? ` · ${offer.resolution.label}` : ""));

    const orderRef = (offer.object && offer.object.trim()) ? offer.object.trim() : summary;

    let note = "";
    if (typeof offer.previewPng === "string" && offer.previewPng.startsWith("data:image")) {
      note += `<p><b>Schema tecnico (vista piatta)</b><br/><img src="${offer.previewPng}" alt="Schema parete LED" style="max-width:100%;height:auto;"/></p>`;
    }
    if (typeof offer.wall3dPng === "string" && offer.wall3dPng.startsWith("data:image")) {
      note += `<p><b>Vista 3D</b><br/><img src="${offer.wall3dPng}" alt="Vista 3D parete LED" style="max-width:100%;height:auto;"/></p>`;
    }

    const orderVals = {
      partner_id: partnerId,
      order_line: orderLines,
      client_order_ref: orderRef,
      note: note
    };
    if (env.ODOO_OBJECT_FIELD && offer.object && offer.object.trim()) {
      orderVals[env.ODOO_OBJECT_FIELD] = offer.object.trim();
    }

    const orderId = await kw("sale.order", "create", [orderVals]);

    const info = await kw("sale.order", "read", [[orderId]], { fields: ["name"] });
    const name = info && info[0] ? info[0].name : ("SO/" + orderId);
    const url = `${env.ODOO_URL}/odoo/sales/${orderId}`;

    // 5) allega le schede tecniche (PNG) come ir.attachment collegati al preventivo
    const serial = (offer.serial && String(offer.serial).trim()) ? String(offer.serial).trim() : String(orderId);
    let attached = 0; const attachErrors = [];

    const attach = async (dataUrl, label, opts) => {
      opts = opts || {};
      if (typeof dataUrl !== "string" || dataUrl.indexOf("base64,") < 0) { if(!opts.optional) attachErrors.push(label + ":assente"); return; }
      const b64 = dataUrl.substring(dataUrl.indexOf("base64,") + 7);
      try {
        const aid = await kw("ir.attachment", "create", [{
          name: (opts.prefix || "Scheda") + `_${label}_${serial}.png`,
          type: "binary",
          datas: b64,
          res_model: "sale.order",
          res_id: orderId,
          mimetype: "image/png"
        }]);
        if (aid) attached++;
        try { await kw("sale.order", "message_post", [orderId], { body: (opts.body || `Scheda tecnica ${label}`), attachment_ids: [aid] }); } catch (e) {}
      } catch (e) {
        attachErrors.push(label + ":" + String(e.message || e).slice(0, 160));
      }
    };
    await attach(offer.sheetItaPng, "ITA");
    await attach(offer.sheetEngPng, "ENG");
    // istantanea 3D: allegata solo se presente (la vista 3D è opzionale)
    await attach(offer.wall3dPng, "3D", { prefix: "Parete", body: "Vista 3D della parete", optional: true });

    return json({ ok: true, order_id: orderId, name, url, attached, attachErrors }, 200, headers);
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500, headers);
  }
}
