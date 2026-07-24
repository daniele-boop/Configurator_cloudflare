// functions/api/get-config.js  ->  GET /api/get-config?id=CFG-0001
// Restituisce lo snapshot di una configurazione salvata, dato il numero di serie.

export async function onRequestOptions({ env }) {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*" } });
}

export async function onRequestGet({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*"
  };

  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!id) return new Response(JSON.stringify({ ok: false, error: "id mancante" }), { status: 400, headers });
  if (!env.DB) return new Response(JSON.stringify({ ok: false, error: "Binding D1 'DB' non configurato." }), { status: 500, headers });

  try {
    const row = await env.DB
      .prepare("SELECT data FROM configs WHERE serial = ?1")
      .bind(id)
      .first();

    if (!row || !row.data) {
      return new Response(JSON.stringify({ ok: false, error: "Configurazione non trovata" }), { status: 404, headers });
    }
    // il campo data contiene già lo snapshot completo in JSON
    return new Response(row.data, { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), { status: 500, headers });
  }
}
