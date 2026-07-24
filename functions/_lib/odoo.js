// functions/_lib/odoo.js
// Helper condivisi: CORS, risposte JSON e client JSON-RPC per Odoo.
// I file/cartelle che iniziano con "_" non diventano rotte pubbliche: sono solo moduli.

export function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": (env && env.ALLOW_ORIGIN) || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };
}

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, headers)
  });
}

export function preflight(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

// ---- client Odoo (JSON-RPC /jsonrpc, execute_kw) ----------------------------
export function odooClient(env) {
  const { ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY } = env;

  async function rpc(service, method, args) {
    const res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
        id: Date.now()
      })
    });
    const data = await res.json();
    if (data.error) {
      const msg = data.error.data && data.error.data.message ? data.error.data.message : data.error.message;
      throw new Error(msg || "Errore RPC Odoo");
    }
    return data.result;
  }

  let uid = null;
  async function auth() {
    if (uid) return uid;
    uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_LOGIN, ODOO_API_KEY, {}]);
    return uid;
  }

  async function kw(model, method, args, kwargs) {
    const id = await auth();
    if (!id) throw new Error("Autenticazione Odoo fallita (login/API key).");
    return rpc("object", "execute_kw", [ODOO_DB, id, ODOO_API_KEY, model, method, args, kwargs || {}]);
  }

  return { rpc, auth, kw };
}

export function odooConfigured(env) {
  return !!(env.ODOO_URL && env.ODOO_DB && env.ODOO_LOGIN && env.ODOO_API_KEY);
}
