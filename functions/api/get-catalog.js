// functions/api/get-catalog.js  ->  GET /api/get-catalog
// Restituisce il catalogo salvato lato server (Workers KV).
// Se non è ancora stato salvato nulla risponde 404 e il sito ricade sul catalog.json statico.
//
// Questo indirizzo non chiede niente a nessuno, quindi quello che esce da qui
// è pubblico per definizione: la password del pannello non ci passa più.

import { senzaSegreti, senzaSoldi, dentroAccess } from "../_lib/admin.js";

export async function onRequestOptions({ env }) {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": (env.ALLOW_ORIGIN || "*") } });
}

export async function onRequestGet({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*"
  };
  try {
    if (!env.CATALOG) {
      return new Response(JSON.stringify({ ok: false, error: "Binding KV 'CATALOG' non configurato." }), { status: 500, headers });
    }
    const data = await env.CATALOG.get("catalog", { type: "json" });
    if (!data) return new Response(JSON.stringify({ ok: false }), { status: 404, headers });
    // Access sta davanti al dominio, ma non davanti agli indirizzi con l'hash
    // che Pages assegna a ogni deploy. Da lì il catalogo esce comunque: che
    // esca senza prezzi e senza codici.
    const pieno = dentroAccess(request);
    const fuori = pieno ? senzaSegreti(data) : senzaSoldi(data);
    return new Response(JSON.stringify(fuori), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), { status: 500, headers });
  }
}
