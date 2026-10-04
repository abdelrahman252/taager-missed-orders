const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ADMIN_PANEL_PORT || 8787);
const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, "admin.env");

let supabaseUrl = cleanUrl(process.env.SUPABASE_URL || "");
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

loadLocalEnv();

function loadLocalEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key === "SUPABASE_URL" && !supabaseUrl) supabaseUrl = cleanUrl(value);
    if ((key === "SUPABASE_SERVICE_ROLE_KEY" || key === "SUPABASE_SERVICE_KEY") && !serviceRoleKey) serviceRoleKey = value;
  }
}

function cleanUrl(raw) {
  if (!raw) return "";
  try {
    return new URL(String(raw).trim()).origin;
  } catch {
    return String(raw).trim().replace(/\/rest\/v1\/?.*$/, "").replace(/\/$/, "");
  }
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function requireConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    const err = new Error("Admin server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    err.status = 400;
    throw err;
  }
}

function buildSupabaseAuthHeaders(key) {
  const headers = { apikey: key };
  if (/^eyJ/.test(key)) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function forwardSupabase(restPath, method, body) {
  requireConfig();
  if (!restPath || typeof restPath !== "string" || !restPath.startsWith("/")) {
    const err = new Error("Invalid Supabase path.");
    err.status = 400;
    throw err;
  }
  const headers = {
    "Content-Type": "application/json",
    ...buildSupabaseAuthHeaders(serviceRoleKey),
  };
  if (method === "POST") headers.Prefer = "return=representation";
  if (method === "PATCH") headers.Prefer = "return=minimal";

  const upstream = await fetch(`${supabaseUrl}/rest/v1${restPath}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await upstream.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { ok: upstream.ok, status: upstream.status, data };
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/config" && req.method === "GET") {
      return send(res, 200, { configured: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl });
    }

    if (url.pathname === "/api/connect" && req.method === "POST") {
      const body = await readJson(req);
      supabaseUrl = cleanUrl(body.supabaseUrl || supabaseUrl);
      serviceRoleKey = body.serviceRoleKey || serviceRoleKey;
      requireConfig();
      return send(res, 200, { ok: true, supabaseUrl });
    }

    if (url.pathname === "/api/rest" && req.method === "POST") {
      const body = await readJson(req);
      const method = String(body.method || "GET").toUpperCase();
      if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
        return send(res, 400, { ok: false, status: 400, data: "Unsupported method" });
      }
      const result = await forwardSupabase(body.path, method, body.body);
      return send(res, 200, result);
    }

    if (url.pathname === "/api/rpc" && req.method === "POST") {
      const body = await readJson(req);
      if (!body.fn || !/^[a-zA-Z0-9_]+$/.test(body.fn)) {
        return send(res, 400, { ok: false, status: 400, data: "Invalid RPC function" });
      }
      const result = await forwardSupabase(`/rpc/${body.fn}`, "POST", body.params || {});
      return send(res, 200, result);
    }

    return send(res, 404, { ok: false, status: 404, data: "Not found" });
  } catch (err) {
    return send(res, err.status || 500, {
      ok: false,
      status: err.status || 500,
      data: err.message || "Admin server error",
    });
  }
}

function serveStatic(req, res, url) {
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const abs = path.join(ROOT, filePath);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return send(res, 404, "Not found");
  }
  const ext = path.extname(abs).toLowerCase();
  const type = ext === ".html" ? "text/html; charset=utf-8"
    : ext === ".js" ? "application/javascript; charset=utf-8"
    : ext === ".css" ? "text/css; charset=utf-8"
    : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  fs.createReadStream(abs).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  return serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`Taager admin panel: http://${HOST}:${PORT}`);
  console.log(`Supabase config: ${supabaseUrl && serviceRoleKey ? "loaded" : "enter it in the page or admin.env"}`);
});
