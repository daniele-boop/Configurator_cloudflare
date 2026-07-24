// functions/api/save-config.js  ->  POST /api/save-config
// Salva uno "snapshot" della configurazione nel database D1 e restituisce un
// numero progressivo (CFG-0001, CFG-0002, …).
//
// Il numero deriva dalla chiave primaria AUTOINCREMENT di SQLite: è il database
// a garantirne l'unicità, quindi due salvataggi simultanei non possono ricevere
// lo stesso numero (limite che invece avrebbe un contatore su KV).
//
// I prezzi sono congelati perché lo snapshot include il prodotto e i controller
// così com'erano al momento del salvataggio.

import { corsHeaders, json, preflight } from "../_lib/odoo.js";

export async function onRequestOptions({ env }) { return preflight(env); }

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);

  if (!env.DB) return json({ ok: false, error: "Binding D1 'DB' non configurato." }, 500, headers);

  let snap;
  try { snap = await request.json(); }
  catch { return json({ ok: false, error: "JSON non valido" }, 400, headers); }

  if (!snap.productId || !snap.selWc || !snap.selHc) {
    return json({ ok: false, error: "Configurazione incompleta" }, 400, headers);
  }

  try {
    const now = new Date().toISOString();

    // 1) inserisce il record: SQLite assegna il progressivo in modo atomico
    const ins = await env.DB
      .prepare("INSERT INTO configs (created_at, data) VALUES (?1, ?2)")
      .bind(now, JSON.stringify(snap))
      .run();

    const n = ins.meta && ins.meta.last_row_id;
    if (!n) throw new Error("Impossibile determinare il numero progressivo.");

    const serial = "CFG-" + String(n).padStart(4, "0");

    // 2) riscrive il record completo di numero di serie
    snap.serial = serial;
    snap.createdAt = now;
    await env.DB
      .prepare("UPDATE configs SET serial = ?1, data = ?2 WHERE n = ?3")
      .bind(serial, JSON.stringify(snap), n)
      .run();

    return json({ ok: true, serial }, 200, headers);
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500, headers);
  }
}
