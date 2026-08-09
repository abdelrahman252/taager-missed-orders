// DOTENV - load .env if present (dev or packaged extraResources)
(function loadEnv() {
  const path = require("path");
  const fs = require("fs");
  const devLocalPath = path.join(__dirname, "../../.env.local");
  const devPath = path.join(__dirname, "../../.env");
  const prodPath = process.resourcesPath ? path.join(process.resourcesPath, ".env") : null;
  const dotenv = require("dotenv");
  const baseEnvPath = fs.existsSync(devPath)
    ? devPath
    : (prodPath && fs.existsSync(prodPath) ? prodPath : null);
  if (baseEnvPath) dotenv.config({ path: baseEnvPath });
  if (fs.existsSync(devLocalPath)) dotenv.config({ path: devLocalPath, override: true });
})();

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, clipboard, session } = require("electron");
app.setAppUserModelId("com.taagerbot.orders");
const path = require("path");
const Store = require("electron-store");
const fs = require("fs");
const crypto = require("crypto");
const zlib = require("zlib");
const os = require("os");
const https = require("https");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");
const monitoring = require("../monitoring/sentry.main");
const { normalizePhone } = require("../bot/phone");
const { processDashboardSheets } = require("../bot/dashboard-sheet-processing");
const { createDashboardQueryService } = require("./dashboard-query-service");
const { findNewDuplicateConflict } = require("./account-duplicates");
const { fetchActiveAdminNotification } = require("./admin-notifications");
const { evaluateCachedLicense, isInsideWarningWindow } = require("./license-expiry-policy");
const {
  normalizeSettings: normalizeProductAlertSettings,
  publicSettings: publicProductAlertSettings,
  evaluateProducts: evaluateProductAlerts,
  filterCooldown: filterProductAlertCooldown,
  markSent: markProductAlertsSent,
} = require("./notifications/product-alert-engine");
const {
  buildProductAlertMessage,
  buildTestMessage: buildProductAlertTestMessage,
} = require("./notifications/product-alert-message");
const {
  sendTelegram,
  createTelegramBackendConnection,
  getTelegramBackendConnectionStatus,
} = require("./notifications/telegram-notifier");
const {
  replaceRowsInDateRange,
  validateCurrentYearDashboardRange,
} = require("./dashboard-range-utils");
const XLSX = require("xlsx");
const {
  askDashboardAi,
  getAiGatewayState,
  getAiAdminAnalytics,
  configureAiGateway,
  validateDashboardAiPayload,
  debugGeminiPing,
} = require("./dashboard-ai-service");
const {
  MONTHLY_DATA_CLEANUP_DAY,
  createMonthlyCleanupScheduler,
  monthlyCleanupCutoff,
  monthlyCleanupEligible,
  monthlyCleanupMonthKey,
  nextMonthlyCleanupDateKey,
  pruneAnalyticsRunsForCurrentMonth,
  pruneDashboardAccountsForCurrentMonth,
} = require("./monthly-data-cleanup");

function pathEquals(left, right) {
  return path.resolve(String(left || "")).toLowerCase() === path.resolve(String(right || "")).toLowerCase();
}

function copyIfMissing(source, target) {
  try {
    if (!source || !target || !fs.existsSync(source) || fs.existsSync(target)) return false;
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
      fs.cpSync(source, target, { recursive: true, errorOnExist: false });
    } else {
      fs.copyFileSync(source, target);
    }
    return true;
  } catch (error) {
    log.warn("[UserData] Could not migrate item:", source, "->", target, error && error.message ? error.message : error);
    return false;
  }
}

function migrateUserDataSource(sourceDir, targetDir) {
  try {
    if (!sourceDir || !targetDir || pathEquals(sourceDir, targetDir) || !fs.existsSync(sourceDir)) return 0;
    fs.mkdirSync(targetDir, { recursive: true });

    let copied = 0;
    const encryptedStoreNames = ["machine-id.json", "license.json", "credentials.json"];
    const targetHasMachineId = fs.existsSync(path.join(targetDir, "machine-id.json"));
    const sourceHasMachineId = fs.existsSync(path.join(sourceDir, "machine-id.json"));

    // Encrypted stores are only useful with their matching machine-id.json.
    if (!targetHasMachineId && sourceHasMachineId) {
      for (const name of encryptedStoreNames) {
        if (copyIfMissing(path.join(sourceDir, name), path.join(targetDir, name))) copied++;
      }
    }

    for (const name of ["analytics.json", "dashboard.json", "bot-profile"]) {
      if (copyIfMissing(path.join(sourceDir, name), path.join(targetDir, name))) copied++;
    }

    for (const name of fs.readdirSync(sourceDir)) {
      if (!name.startsWith("bot-profile-")) continue;
      if (copyIfMissing(path.join(sourceDir, name), path.join(targetDir, name))) copied++;
    }

    if (copied > 0) log.info(`[UserData] Migrated ${copied} item(s) from ${sourceDir} to ${targetDir}`);
    return copied;
  } catch (error) {
    log.warn("[UserData] Migration failed:", error && error.message ? error.message : error);
    return 0;
  }
}

function configureStableUserDataPath() {
  if (!app.isPackaged || process.env.TAAGER_QA_USER_DATA_DIR) return;
  try {
    const appData = app.getPath("appData");
    const currentUserData = app.getPath("userData");
    const stableUserData = path.join(appData, "Taager Orders");
    const candidates = Array.from(new Set([
      currentUserData,
      path.join(appData, "taager-orders"),
      path.join(appData, "Taager.Orders"),
      path.join(appData, "com.taagerbot.orders"),
    ].filter(Boolean)));

    for (const candidate of candidates) {
      migrateUserDataSource(candidate, stableUserData);
    }

    if (!pathEquals(currentUserData, stableUserData)) {
      fs.mkdirSync(stableUserData, { recursive: true });
      app.setPath("userData", stableUserData);
      log.info("[UserData] Using stable userData path:", stableUserData);
    }
  } catch (error) {
    log.warn("[UserData] Could not configure stable userData path:", error && error.message ? error.message : error);
  }
}

configureStableUserDataPath();

if (process.env.TAAGER_QA_USER_DATA_DIR) {
  try {
    fs.mkdirSync(process.env.TAAGER_QA_USER_DATA_DIR, { recursive: true });
    app.setPath("userData", process.env.TAAGER_QA_USER_DATA_DIR);
  } catch (error) {
    log.warn("[QA] Could not set isolated userData path:", error && error.message ? error.message : error);
  }
}

monitoring.initMainMonitoring();
monitoring.patchIpcMonitoring();
monitoring.registerRendererMonitoringBridge();

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// [Taager Bot DEBUG] - remove once AI is confirmed working
setTimeout(function () {
  const keyLoaded = process.env.GEMINI_API_KEY;
  log.info("[TaagerAI-Debug] Gemini config:", {
    keyPresent: !!keyLoaded,
    keyLength: keyLoaded ? keyLoaded.length : 0,
    forcedOff: String(process.env.TAAGER_AI_FORCE_GEMINI_OFF || "") === "1",
    freeTierHint: "Check getAiAdminAnalytics().gemini for attempts, successes, failures, and fallback reasons.",
  });
}, 0);
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// STARTUP PERFORMANCE FLAGS
// Must be set before app is ready.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Disable GPU process sandbox (reduces process spawn overhead on Windows)
app.commandLine.appendSwitch("disable-gpu-sandbox");
// Skip GPU info collection on startup (saves ~50Ã¢â‚¬â€œ150 ms)
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
// Use hardware acceleration but skip slow software rasterizer fallback
app.commandLine.appendSwitch("enable-gpu-rasterization");
// Reduce IPC overhead on renderer startup
app.commandLine.appendSwitch("renderer-process-limit", "1");
// V8 code cache: reuse compiled JS across launches (saves 20Ã¢â‚¬â€œ60 ms per launch)
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=256");

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
try {
  autoUpdater.verifyUpdateCodeSignature = false;
} catch (_) {}
autoUpdater.logger = {
  info:  (...a) => log.info("[AutoUpdate]", ...a),
  warn:  (...a) => log.warn("[AutoUpdate]", ...a),
  error: (...a) => log.error("[AutoUpdate]", ...a),
  debug: (...a) => log.debug("[AutoUpdate]", ...a),
};

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SUPABASE CONFIG
// Primary source: .env file (dev) or extraResources/.env (packaged).
// No hardcoded fallback Ã¢â‚¬â€ missing config produces a clear warning rather than
// silently using stale credentials baked into the source.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const SUPABASE_URL             = process.env.SUPABASE_URL             || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SAUDIIPICK_MARKETING_API_BASE = (process.env.SAUDIIPICK_MARKETING_API_BASE || "https://saudiipick.com").replace(/\/+$/, "");

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  log.warn("[App] Supabase config missing Ã¢â‚¬â€ license checks will fail until .env is configured.");
}

const SUPABASE_TIMEOUT_MS = 180_000; // 180 s (3 minutes) Ã¢â‚¬â€ enough for slow connections and multi-account syncs

function buildSupabaseAuthHeaders(key) {
  const headers = { apikey: key };
  // Legacy anon/service-role keys are JWTs and can be used as Bearer tokens.
  // New sb_publishable_* keys are API keys only; sending them as Bearer causes
  // PostgREST to reject the request before the RPC runs.
  if (/^eyJ/.test(key)) headers.Authorization = "Bearer " + key;
  return headers;
}

function supabaseRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      reject(new Error("supabase_config_missing"));
      return;
    }
    const baseUrl = SUPABASE_URL.replace(/\/+$/, "");
    const url = new URL(baseUrl + endpoint);
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "return=representation" : "",
      ...buildSupabaseAuthHeaders(SUPABASE_PUBLISHABLE_KEY),
    };
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method, headers,
      timeout: SUPABASE_TIMEOUT_MS,
    };
    if (bodyStr) options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { settle(resolve, { status: res.statusCode, data: JSON.parse(data) }); }
        catch { settle(resolve, { status: res.statusCode, data }); }
      });
    });
    req.on("timeout", () => { req.destroy(); settle(reject, new Error("supabase_timeout")); });
    req.on("error", (e) => settle(reject, e));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function supabaseRpc(fn, body) {
  const res = await supabaseRequest("POST", `/rest/v1/rpc/${fn}`, body || {});
  if (res.status >= 400) {
    const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(`supabase_rpc_${fn}_failed_${res.status}: ${msg}`);
  }
  return res.data;
}

function supabaseFunctionRequest(fn, body) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      reject(new Error("supabase_config_missing"));
      return;
    }
    const baseUrl = SUPABASE_URL.replace(/\/+$/, "");
    const url = new URL(`${baseUrl}/functions/v1/${fn}`);
    const bodyStr = JSON.stringify(body || {});
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...buildSupabaseAuthHeaders(SUPABASE_PUBLISHABLE_KEY),
      },
      timeout: SUPABASE_TIMEOUT_MS,
    };
    let settled = false;
    const settle = (fnSettle, value) => {
      if (!settled) {
        settled = true;
        fnSettle(value);
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { error: data || "invalid_function_response" }; }
        if (res.statusCode >= 400) {
          settle(reject, new Error(parsed.error || parsed.message || `function_${fn}_failed_${res.statusCode}`));
          return;
        }
        settle(resolve, parsed);
      });
    });
    req.on("timeout", () => { req.destroy(); settle(reject, new Error("supabase_function_timeout")); });
    req.on("error", (error) => settle(reject, error));
    req.write(bodyStr);
    req.end();
  });
}

function httpsJsonRequest(method, requestUrl, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(requestUrl);
    const bodyStr = body ? JSON.stringify(body) : "";
    const headers = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };
    if (bodyStr) headers["Content-Length"] = Buffer.byteLength(bodyStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers,
      timeout: SUPABASE_TIMEOUT_MS,
    };
    let settled = false;
    const settle = (fnSettle, value) => {
      if (!settled) {
        settled = true;
        fnSettle(value);
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { error: data || "invalid_json_response" }; }
        if (res.statusCode >= 400) {
          settle(reject, new Error(parsed.errorDescription || parsed.error || parsed.message || `request_failed_${res.statusCode}`));
          return;
        }
        settle(resolve, parsed);
      });
    });
    req.on("timeout", () => { req.destroy(); settle(reject, new Error("request_timeout")); });
    req.on("error", (error) => settle(reject, error));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function getIconPath() {
  // DEV:     assets/ is two levels up from src/main/
  // PACKAGED: extraResources copies assets/ Ã¢â€ â€™ resources/assets/ (real disk, outside asar)
  //           so nativeImage.createFromPath() can always read it on any customer's PC
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "..", "..", "assets");
  if (process.platform === "win32") return path.join(base, "icon.ico");
  if (process.platform === "darwin") return path.join(base, "icon.icns");
  return path.join(base, "icon.png");
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// STORE ENCRYPTION KEYS
// Derived at runtime from a stable machine UUID so each machine gets a unique
// key Ã¢â‚¬â€ a static hardcoded string is trivially reversible once someone has the
// source. Two salts produce different keys for the two stores.
// NOTE: We now use a stable, unencrypted machine-id.json to break the chicken-and-egg
// problem where we couldn't read the UUID from the encrypted license.json.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
let _cachedMachineUUID = "";

function getStableMachineUUID() {
  if (_cachedMachineUUID) return _cachedMachineUUID;
  try {
    const userData = app.getPath("userData");
    const filePath = require("path").join(userData, "machine-id.json");
    if (require("fs").existsSync(filePath)) {
      const raw = JSON.parse(require("fs").readFileSync(filePath, "utf8"));
      if (raw && raw.machineUUID) {
        _cachedMachineUUID = raw.machineUUID;
        return _cachedMachineUUID;
      }
    }
  } catch (e) {
    log.error("[MachineUUID] Error reading machine-id.json:", e);
  }
  return "";
}

function initializeUserDataAndStoreKeys() {
  try {
    const userData = app.getPath("userData");
    const machineIdPath = require("path").join(userData, "machine-id.json");
    let machineUUID = "";

    // 1. Try to read from machine-id.json
    if (require("fs").existsSync(machineIdPath)) {
      try {
        const raw = JSON.parse(require("fs").readFileSync(machineIdPath, "utf8"));
        if (raw && raw.machineUUID) {
          machineUUID = raw.machineUUID;
          _cachedMachineUUID = machineUUID;
        }
      } catch (e) {
        log.error("[Migration] Error reading machine-id.json:", e);
      }
    }

    // 2. If not found, check if we have a legacy configuration we can migrate
    if (!machineUUID) {
      const legacyBase = require("os").hostname() + require("os").cpus()[0].model;
      const legacyLicenseKey = require("crypto").createHash("sha256").update("taager-license-v1::" + legacyBase).digest("hex").slice(0, 32);

      try {
        const tempStore = new Store({ encryptionKey: legacyLicenseKey, name: "license" });
        const existingUUID = tempStore.get("machineUUID", "");
        if (existingUUID) {
          machineUUID = existingUUID;
          _cachedMachineUUID = machineUUID;
          log.info("[Migration] Migrating legacy machineUUID to machine-id.json:", machineUUID);
          require("fs").writeFileSync(machineIdPath, JSON.stringify({ machineUUID }, null, 2), "utf8");

          // Copy data from legacy license store
          const licenseData = tempStore.store;

          // Copy data from legacy credentials store if it exists
          let credentialsData = {};
          const legacyCredsKey = require("crypto").createHash("sha256").update("taager-creds-v1::" + legacyBase).digest("hex").slice(0, 32);
          try {
            const tempCredsStore = new Store({ encryptionKey: legacyCredsKey, name: "credentials" });
            credentialsData = tempCredsStore.store || {};
          } catch (credsErr) {
            log.warn("[Migration] Could not read legacy credentials store:", credsErr.message);
          }

          // Deriving the new keys based on machineUUID
          const newLicenseKey = require("crypto").createHash("sha256").update("taager-license-v1::" + machineUUID).digest("hex").slice(0, 32);
          const newCredsKey = require("crypto").createHash("sha256").update("taager-creds-v1::" + machineUUID).digest("hex").slice(0, 32);

          // Delete the legacy files to avoid decryption conflicts on next Store instantiations
          try {
            const licFile = require("path").join(userData, "license.json");
            if (require("fs").existsSync(licFile)) require("fs").unlinkSync(licFile);
          } catch (e) {
            log.error("[Migration] Failed to delete old license.json:", e);
          }
          try {
            const credsFile = require("path").join(userData, "credentials.json");
            if (require("fs").existsSync(credsFile)) require("fs").unlinkSync(credsFile);
          } catch (e) {
            log.error("[Migration] Failed to delete old credentials.json:", e);
          }

          // Write new encrypted files
          const newLicenseStore = new Store({ encryptionKey: newLicenseKey, name: "license" });
          newLicenseStore.store = licenseData;

          const newCredsStore = new Store({ encryptionKey: newCredsKey, name: "credentials" });
          newCredsStore.store = credentialsData;

          log.info("[Migration] Re-encryption successful!");
        }
      } catch (err) {
        log.warn("[Migration] Legacy decryption failed or no legacy UUID found:", err.message);
      }
    }

    // 3. If still no machineUUID (fresh install), generate a new one
    if (!machineUUID) {
      machineUUID = require("crypto").randomUUID ? require("crypto").randomUUID() : require("crypto").createHash("sha256").update(require("crypto").randomBytes(16)).digest("hex");
      _cachedMachineUUID = machineUUID;
      try {
        require("fs").writeFileSync(machineIdPath, JSON.stringify({ machineUUID }, null, 2), "utf8");
        log.info("[Migration] Generated new stable machineUUID:", machineUUID);
      } catch (err) {
        log.error("[Migration] Failed to write new machineUUID to disk:", err);
      }
    }
  } catch (globalErr) {
    log.error("[Migration] Global error in initializeUserDataAndStoreKeys:", globalErr);
  }
}

// Run the migration/initialization first
initializeUserDataAndStoreKeys();

function deriveStoreKey(salt) {
  try {
    let uuid = getStableMachineUUID();
    const base = uuid || (require("os").hostname() + require("os").cpus()[0].model);
    return require("crypto").createHash("sha256").update(salt + "::" + base).digest("hex").slice(0, 32);
  } catch {
    return salt.length > 8 ? salt : salt + "-taager-bot-2025-fallback";
  }
}

function createStore(options) {
  try {
    return new Store(options);
  } catch (e) {
    // Corrupted store file Ã¢â‚¬â€ wipe it and recreate clean
    try {
      const filePath = path.join(app.getPath("userData"), options.name + ".json");
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      log.warn(`[store] Corrupted store "${options.name}" deleted and recreated.`);
    } catch (_) {}
    return new Store(options);
  }
}

const store          = createStore({ encryptionKey: deriveStoreKey("taager-creds-v1"),   name: "credentials" });
const licenseStore   = createStore({ encryptionKey: deriveStoreKey("taager-license-v1"), name: "license" });
const analyticsStore = createStore({ name: "analytics" }); // unencrypted Ã¢â‚¬â€ run history only
const dashboardStore = createStore({ name: "dashboard" }); // unencrypted Ã¢â‚¬â€ monthly snapshots
const RUN_RESULTS_INDEX_KEY = "runResults.index.v1";
const RUN_RESULTS_DETAIL_DIR = "run-results";
const AI_MIRROR_STORE_KEY = "aiMirrors.v1";
const AI_MIRROR_STORE_LIMIT = 8;
const dashboardQueryService = createDashboardQueryService({
  getAccounts: () => dashboardStore.get("accounts", {}),
  getAllowedAccountIds: () => {
    const configured = (store.get("accounts", []) || []).map((account) => account && account.id).filter(Boolean);
    return configured.length ? configured : Object.keys(dashboardStore.get("accounts", {}) || {});
  },
  getRevision: () => Number(dashboardStore.get("snapshotRevision", 0) || 0),
  getMarketingRevision: () => Number(dashboardStore.get("marketingRevision", 0) || 0),
});
const PRODUCT_ALERT_SETTINGS_KEY = "productAlertNotifications.v1";
const PRODUCT_ALERT_STATE_KEY = "productAlertNotificationsState.v1";
const PRODUCT_ALERT_SCHEDULER_INTERVAL_MS = 4 * 60 * 60 * 1000;
let productAlertSchedulerTimer = null;

function readProductAlertSettings() {
  return normalizeProductAlertSettings(store.get(PRODUCT_ALERT_SETTINGS_KEY, null));
}

function writeProductAlertSettings(input) {
  const current = readProductAlertSettings();
  const merged = {
    ...current,
    ...(input || {}),
    telegram: {
      ...(current.telegram || {}),
      ...((input && input.telegram) || {}),
    },
    rule: {
      ...(current.rule || {}),
      ...((input && input.rule) || {}),
    },
  };
  if (input && Array.isArray(input.cases)) {
    merged.cases = input.cases;
  }
  if (merged.telegram && merged.telegram.botToken === "********") {
    merged.telegram.botToken = current.telegram && current.telegram.botToken || "";
  }
  const next = normalizeProductAlertSettings(merged);
  store.set(PRODUCT_ALERT_SETTINGS_KEY, next);
  return next;
}

function readProductAlertState() {
  const saved = dashboardStore.get(PRODUCT_ALERT_STATE_KEY, null);
  return {
    version: 1,
    sent: saved && saved.sent && typeof saved.sent === "object" ? saved.sent : {},
    history: Array.isArray(saved && saved.history) ? saved.history : [],
  };
}

function writeProductAlertState(next) {
  dashboardStore.set(PRODUCT_ALERT_STATE_KEY, {
    version: 1,
    sent: next && next.sent && typeof next.sent === "object" ? next.sent : {},
    history: Array.isArray(next && next.history) ? next.history.slice(0, 50) : [],
  });
}

function productAlertAllowedAccountIds(settings, overrideAccountIds) {
  const configured = (store.get("accounts", []) || []).map((account) => account && account.id).filter(Boolean);
  const available = configured.length ? configured : Object.keys(dashboardStore.get("accounts", {}) || {});
  const allowed = new Set(available.map(String));
  const selected = settings.scope === "selected" ? (settings.accountIds || []) : available;
  const selectedSet = new Set(selected.map(String));
  const requested = Array.isArray(overrideAccountIds) && overrideAccountIds.length
    ? overrideAccountIds.filter((id) => settings.scope !== "selected" || selectedSet.has(String(id)))
    : selected;
  return Array.from(new Set((requested || []).map(String).filter((id) => allowed.has(id))));
}

function queryProductAlertRows(settings, options = {}) {
  const accountIds = productAlertAllowedAccountIds(settings, options.accountIds);
  const reportingCurrency = String(options.reportingCurrency || options.currency || "USD").toUpperCase();
  const financialCurrency = String(options.productFinancialCurrency || options.financialCurrency || reportingCurrency).toUpperCase();
  if (settings.scope === "selected" && !accountIds.length) {
    return {
      result: { ok: true, rows: [], scope: { accountIds: [], accountCount: 0 } },
      accountIds,
      payload: {
        dateFrom: options.dateFrom || "",
        dateTo: options.dateTo || "",
        reportingCurrency,
        productFinancialCurrency: financialCurrency,
      },
    };
  }
  const payload = {
    kind: "products",
    accountIds,
    allRows: true,
    page: 1,
    filters: {},
    sortBy: "profitLoss",
    sortDir: "asc",
    requestChannel: "product-alerts",
    currency: reportingCurrency,
    reportingCurrency,
    productFinancialCurrency: financialCurrency,
  };
  if (options.dateFrom) payload.dateFrom = options.dateFrom;
  if (options.dateTo) payload.dateTo = options.dateTo;
  if (options.exchangeRates && typeof options.exchangeRates === "object") payload.exchangeRates = options.exchangeRates;
  if (options.exchangeRatesUpdatedAt) payload.exchangeRatesUpdatedAt = options.exchangeRatesUpdatedAt;
  if (options.egpRate) payload.egpRate = options.egpRate;
  const result = dashboardQueryService.query(payload);
  return { result, accountIds, payload };
}

function productAlertCaseKey(product) {
  const alertCase = product && product.alertCase || {};
  return String(alertCase.id || alertCase.label || "__default__");
}

function groupProductAlertFreshMatches(freshMatches) {
  const groups = [];
  const byKey = new Map();
  (freshMatches || []).forEach((item) => {
    const product = item && item.product || {};
    const key = productAlertCaseKey(product);
    if (!byKey.has(key)) {
      const group = {
        key,
        alertCase: product.alertCase || null,
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).items.push(item);
  });
  return groups;
}

function productAlertBackendOptions() {
  return {
    request: supabaseFunctionRequest,
    functionName: process.env.TAAGER_PRODUCT_ALERT_FUNCTION || "customer-product-alert",
    licenseKey: licenseStore.get("licenseKey", ""),
    machineUuid: _getOrCreateMachineUUID(),
    deviceId: getDeviceFingerprint(),
  };
}

async function previewProductAlerts(settingsInput, options = {}) {
  const settings = normalizeProductAlertSettings(settingsInput || readProductAlertSettings());
  const { result, accountIds, payload } = queryProductAlertRows(settings, options);
  if (!result || !result.ok) return { ok: false, error: result && result.error || "PRODUCT_ALERT_QUERY_FAILED" };
  const evaluation = evaluateProductAlerts(result.rows || [], settings);
  return {
    ok: true,
    settings: publicProductAlertSettings(settings),
    accountIds,
    period: { dateFrom: payload.dateFrom || "", dateTo: payload.dateTo || "" },
    totalProducts: evaluation.totalProducts,
    cases: evaluation.cases || [],
    matches: evaluation.matches,
  };
}

async function runProductAlerts(options = {}) {
  const settings = readProductAlertSettings();
  if (!settings.enabled && !options.force) return { ok: true, skipped: true, reason: "DISABLED" };
  const preview = await previewProductAlerts(settings, options);
  if (!preview.ok) return preview;
  if (!preview.matches.length) return { ok: true, sent: false, matches: [], skipped: 0, reason: "NO_MATCHES" };

  const state = readProductAlertState();
  const scope = {
    accountKey: (preview.accountIds || []).join(",") || "all",
    dateFrom: preview.period.dateFrom || "",
    dateTo: preview.period.dateTo || "",
  };
  const cooldown = options.ignoreCooldown
    ? { fresh: preview.matches.map((product) => ({ product, key: "" })), skipped: [] }
    : filterProductAlertCooldown(preview.matches, settings, state, scope);
  if (!cooldown.fresh.length) {
    return { ok: true, sent: false, matches: preview.matches, skipped: cooldown.skipped.length, reason: "COOLDOWN" };
  }

  const limit = Math.max(1, Number(settings.maxProductsPerMessage) || 10);
  const chunks = [];
  groupProductAlertFreshMatches(cooldown.fresh).forEach((group) => {
    const groupChunkTotal = Math.max(1, Math.ceil(group.items.length / limit));
    for (let i = 0; i < group.items.length; i += limit) {
      chunks.push({
        group,
        items: group.items.slice(i, i + limit),
        groupChunkIndex: Math.floor(i / limit),
        groupChunkTotal,
        groupOffset: i,
      });
    }
  });
  if (!chunks.length) {
    return { ok: true, sent: false, matches: preview.matches, skipped: cooldown.skipped.length, reason: "NO_FRESH_CHUNKS" };
  }
  const deliveries = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const products = chunk.items.map((item) => item.product);
    const cases = chunk.group.alertCase ? [chunk.group.alertCase] : preview.cases;
    const message = buildProductAlertMessage({
      products,
      totalMatches: chunk.group.items.length,
      rule: settings.rule,
      cases,
      period: preview.period,
      lang: options.lang || "en",
      chunkIndex: chunk.groupChunkIndex,
      chunkTotal: chunk.groupChunkTotal,
      chunkOffset: chunk.groupOffset,
      showHiddenNote: false,
    });
    const delivery = await sendTelegram(settings.telegram, message, productAlertBackendOptions());
    if (!delivery || !delivery.ok) return { ok: false, sent: false, error: delivery && delivery.error || "TELEGRAM_SEND_FAILED", deliveries };
    deliveries.push(delivery);
  }

  const sentItems = cooldown.fresh;
  const nextState = markProductAlertsSent(state, sentItems, {
    trigger: options.trigger || "manual",
    dateFrom: preview.period.dateFrom || "",
    dateTo: preview.period.dateTo || "",
  });
  writeProductAlertState(nextState);
  return { ok: true, sent: true, sentCount: sentItems.length, totalMatchedFresh: sentItems.length, matches: sentItems.map((item) => item.product), skipped: cooldown.skipped.length, deliveries };
}

function runProductAlertsAfterSnapshot(accountId, data, source) {
  const settings = readProductAlertSettings();
  if (!settings.enabled) return;
  runProductAlerts({
    accountIds: accountId ? [accountId] : undefined,
    dateFrom: data && data.dateFrom || "",
    dateTo: data && data.dateTo || "",
    currency: "USD",
    reportingCurrency: "USD",
    productFinancialCurrency: "USD",
    trigger: source || "dashboard-refresh",
  }).catch((error) => {
    log.warn("[ProductAlerts] non-blocking alert run failed", error && error.message ? error.message : error);
    monitoring.captureException(error, { operation: "productAlerts.afterSnapshot", extra: { accountId } });
  });
}

function startProductAlertScheduler() {
  if (productAlertSchedulerTimer) clearInterval(productAlertSchedulerTimer);
  productAlertSchedulerTimer = setInterval(() => {
    runProductAlerts({ currency: "USD", reportingCurrency: "USD", productFinancialCurrency: "USD", trigger: "interval-4h" }).catch((error) => {
      log.warn("[ProductAlerts] scheduled alert run failed", error && error.message ? error.message : error);
      monitoring.captureException(error, { operation: "productAlerts.scheduler" });
    });
  }, PRODUCT_ALERT_SCHEDULER_INTERVAL_MS);
  if (productAlertSchedulerTimer && typeof productAlertSchedulerTimer.unref === "function") productAlertSchedulerTimer.unref();
}

function stopProductAlertScheduler() {
  if (productAlertSchedulerTimer) {
    clearInterval(productAlertSchedulerTimer);
    productAlertSchedulerTimer = null;
  }
}

let analyticsRunsCache = null;
let analyticsRunsCacheDirty = true;
let analyticsSnapshotSyncCacheKey = "";

function bumpDashboardSnapshotRevision() {
  const next = Number(dashboardStore.get("snapshotRevision", 0) || 0) + 1;
  dashboardStore.set("snapshotRevision", next);
  dashboardQueryService.clearCache();
  return next;
}

function bumpDashboardMarketingRevision() {
  const next = Number(dashboardStore.get("marketingRevision", 0) || 0) + 1;
  dashboardStore.set("marketingRevision", next);
  dashboardQueryService.clearCache();
  return next;
}

function defaultAiAssistantMemory() {
  return {
    version: 1,
    businessMemoryByAccount: {},
    sessionSummariesById: {},
    knownInputs: {
      accountSpend: null,
      productSpend: {},
      currency: null,
    },
    lastDiagnosis: null,
    activeWorkflow: null,
    userPreferences: { mediaBuying: {} },
    pendingLearningSuggestion: null,
    updatedAt: null,
  };
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compactAiText(value, max = 600) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeAiAssistantMemory(value) {
  const src = plainObject(value);
  const known = plainObject(src.knownInputs);
  return {
    version: 1,
    businessMemoryByAccount: plainObject(src.businessMemoryByAccount),
    sessionSummariesById: plainObject(src.sessionSummariesById),
    knownInputs: {
      accountSpend: known.accountSpend && typeof known.accountSpend === "object" ? known.accountSpend : null,
      productSpend: plainObject(known.productSpend),
      currency: compactAiText(known.currency, 12) || null,
    },
    lastDiagnosis: src.lastDiagnosis && typeof src.lastDiagnosis === "object" ? src.lastDiagnosis : null,
    activeWorkflow: src.activeWorkflow && typeof src.activeWorkflow === "object" ? src.activeWorkflow : null,
    userPreferences: Object.assign({ mediaBuying: {} }, plainObject(src.userPreferences)),
    pendingLearningSuggestion: src.pendingLearningSuggestion && typeof src.pendingLearningSuggestion === "object" ? src.pendingLearningSuggestion : null,
    updatedAt: src.updatedAt || null,
  };
}

function mergeAiAssistantMemory(base, delta) {
  const current = sanitizeAiAssistantMemory(base);
  const src = plainObject(delta);
  const next = sanitizeAiAssistantMemory(Object.assign({}, current, src));
  next.businessMemoryByAccount = Object.assign({}, current.businessMemoryByAccount, plainObject(src.businessMemoryByAccount));
  next.sessionSummariesById = Object.assign({}, current.sessionSummariesById, plainObject(src.sessionSummariesById));
  next.knownInputs = Object.assign({}, current.knownInputs, plainObject(src.knownInputs));
  next.knownInputs.productSpend = Object.assign({}, current.knownInputs.productSpend, plainObject(src.knownInputs && src.knownInputs.productSpend));
  next.userPreferences = Object.assign({}, current.userPreferences, plainObject(src.userPreferences));
  next.userPreferences.mediaBuying = Object.assign({}, plainObject(current.userPreferences && current.userPreferences.mediaBuying), plainObject(src.userPreferences && src.userPreferences.mediaBuying));
  next.pendingLearningSuggestion = src.pendingLearningSuggestion === null ? null : (src.pendingLearningSuggestion || current.pendingLearningSuggestion);
  next.lastDiagnosis = src.lastDiagnosis === null ? null : (src.lastDiagnosis || current.lastDiagnosis);
  next.activeWorkflow = src.activeWorkflow === null ? null : (src.activeWorkflow || current.activeWorkflow);
  next.updatedAt = new Date().toISOString();
  return sanitizeAiAssistantMemory(next);
}

function invalidateAnalyticsRunsCache() {
  analyticsRunsCache = null;
  analyticsRunsCacheDirty = true;
}

function runResultsBaseDir() {
  return path.join(app.getPath("userData"), RUN_RESULTS_DETAIL_DIR);
}

function ensureRunResultsBaseDir() {
  const dir = runResultsBaseDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeRunResultId(value) {
  const raw = String(value || "").trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9@._-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  if (cleaned) return cleaned;
  return crypto.createHash("sha1").update(raw || String(Date.now())).digest("hex").slice(0, 16);
}

function monthKeyFromTimestamp(ts) {
  const d = new Date(Number(ts) || Date.now());
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 7);
  return d.toISOString().slice(0, 7);
}

function previousMonthKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return d.toISOString().slice(0, 7);
}

function resolveRunResultDetailPath(relativePath) {
  const base = runResultsBaseDir();
  const resolved = path.resolve(base, String(relativePath || ""));
  const normalizedBase = path.resolve(base) + path.sep;
  if (!resolved.startsWith(normalizedBase)) return null;
  return resolved;
}

function readRunResultsIndex() {
  const rows = analyticsStore.get(RUN_RESULTS_INDEX_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

function writeRunResultsIndex(rows) {
  analyticsStore.set(RUN_RESULTS_INDEX_KEY, Array.isArray(rows) ? rows : []);
}

function runResultWithinRange(run, dateFrom, dateTo) {
  const ts = Number(run && run.runTimestamp);
  if (!Number.isFinite(ts)) return false;
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    if (Number.isFinite(from) && ts < from) return false;
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime() + (86400000 - 1);
    if (Number.isFinite(to) && ts > to) return false;
  }
  return true;
}

function pruneOldRunResultDetails(indexRows) {
  try {
    const keep = new Set([monthKeyFromTimestamp(Date.now()), previousMonthKey(new Date())]);
    const rows = Array.isArray(indexRows) ? indexRows : [];
    for (const run of rows) {
      const month = monthKeyFromTimestamp(run && run.runTimestamp);
      if (keep.has(month)) continue;
      const abs = resolveRunResultDetailPath(run && run.detailPath);
      if (abs && fs.existsSync(abs)) fs.rmSync(abs, { force: true });
    }
  } catch (err) {
    log.warn("[RunResults] prune failed:", err && err.message ? err.message : err);
  }
}

function clearRunResultsFiles() {
  try {
    const dir = runResultsBaseDir();
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
  } catch (err) {
    log.warn("[RunResults] clear files failed:", err && err.message ? err.message : err);
  }
}

configureAiGateway({
  loadState: () => dashboardStore.get("aiGatewayState", {}),
  saveState: (state) => dashboardStore.set("aiGatewayState", state || {}),
  logEvent: (event) => log.info("[TaagerAI-Event]", JSON.stringify(event)),
});

let mainWindow, tray, autoRunTimer = null, autoRunEnabled = false, botRunning = false;

const APP_ZOOM_LEVELS = [75, 90, 100, 110, 125, 150];
const DEFAULT_APP_ZOOM = 100;

function normalizeAppZoom(value) {
  const numeric = Number(value);
  return APP_ZOOM_LEVELS.includes(numeric) ? numeric : DEFAULT_APP_ZOOM;
}

function getSavedAppZoom() {
  return normalizeAppZoom(store.get("appZoom", DEFAULT_APP_ZOOM));
}

function broadcastAppZoom(percent) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("app-zoom-changed", percent);
}

function applyAppZoom(percent, options = {}) {
  const next = normalizeAppZoom(percent);
  if (!mainWindow || mainWindow.isDestroyed()) return next;
  mainWindow.webContents.setZoomFactor(next / 100);
  if (options.persist !== false) store.set("appZoom", next);
  broadcastAppZoom(next);
  return next;
}

function stepAppZoom(direction) {
  const current = normalizeAppZoom(
    Math.round((mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.getZoomFactor() : 1) * 100)
  );
  const currentIndex = APP_ZOOM_LEVELS.indexOf(current);
  const nextIndex = Math.max(0, Math.min(APP_ZOOM_LEVELS.length - 1, currentIndex + direction));
  return applyAppZoom(APP_ZOOM_LEVELS[nextIndex]);
}

function installAppZoomControls(window) {
  const contents = window.webContents;
  contents.on("did-finish-load", () => {
    applyAppZoom(getSavedAppZoom(), { persist: false });
  });
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || (!input.control && !input.meta)) return;
    const key = String(input.key || "").toLowerCase();
    const code = String(input.code || "").toLowerCase();
    if (key === "0" || code === "digit0" || code === "numpad0") {
      event.preventDefault();
      applyAppZoom(DEFAULT_APP_ZOOM);
    } else if (key === "+" || key === "=" || key === "add" || code === "equal" || code === "numpadadd") {
      event.preventDefault();
      stepAppZoom(1);
    } else if (key === "-" || key === "_" || key === "subtract" || code === "minus" || code === "numpadsubtract") {
      event.preventDefault();
      stepAppZoom(-1);
    }
  });
}

let lastExportTimestamp = 0;

// Ã¢â€â‚¬Ã¢â€â‚¬ Chrome path cache Ã¢â‚¬â€ resolved once at startup so dashboard fetch skips discovery Ã¢â€â‚¬Ã¢â€â‚¬
let _cachedChromePath = null;
function getCachedChromePath() {
  if (_cachedChromePath) return _cachedChromePath;
  const { execSync } = require("child_process");
  try {
    if (process.platform === "win32") {
      const candidates = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google\\Chrome\\Application\\chrome.exe"),
      ].filter(Boolean);
      for (const p of candidates) { if (fs.existsSync(p)) { _cachedChromePath = p; return p; } }
      try {
        const reg = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve', { encoding: "utf8", timeout: 2000 });
        const m = reg.match(/REG_SZ\s+(.+)/);
        if (m && fs.existsSync(m[1].trim())) { _cachedChromePath = m[1].trim(); return _cachedChromePath; }
      } catch {}
    } else if (process.platform === "darwin") {
      const p = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      if (fs.existsSync(p)) { _cachedChromePath = p; return p; }
    } else {
      const p = execSync("which google-chrome || which chromium-browser || which chromium", { encoding: "utf8", timeout: 2000 }).trim().split("\n")[0];
      if (p) { _cachedChromePath = p; return p; }
    }
  } catch {}
  return null; // dashboard-fetch will fall back to its own findChrome()
}
// Warm up the cache immediately on process start (non-blocking)
setImmediate(() => { try { getCachedChromePath(); } catch {} });

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// DEVICE FINGERPRINT Ã¢â‚¬â€ stable across reboots, updates, VPN, network changes
// Uses: CPU model + platform/arch + CPU count + RAM bucket (rounded to 4 GB)
//
// WHY hostname was REMOVED:
//   macOS silently renames the host after system updates or Bonjour conflicts
//   Windows may rename after domain join/leave or certain Windows Update passes
//   That was the #1 cause of unexpected "different device" kicks on Mac/Windows
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function _getOrCreateMachineUUID() {
  const stableUuid = getStableMachineUUID();
  if (stableUuid) {
    try {
      if (licenseStore.get("machineUUID") !== stableUuid) {
        licenseStore.set("machineUUID", stableUuid);
      }
    } catch (_) {}
    return stableUuid;
  }
  let uuid = licenseStore.get("machineUUID", "");
  if (!uuid) {
    uuid = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    try {
      licenseStore.set("machineUUID", uuid);
    } catch (_) {}
  }
  return uuid;
}

function getDeviceFingerprint() {
  try {
    const cpus      = os.cpus();
    const cpuModel  = cpus && cpus.length ? cpus[0].model.trim() : "unknown-cpu";
    const platform  = `${process.platform}-${process.arch}`;
    const cpuCount  = String(cpus && cpus.length ? cpus.length : 1);
    // Math.max(1, ...) guards against <4 GB machines producing "0GB"
    const rawGB     = os.totalmem() / (4 * 1024 * 1024 * 1024);
    const memBucket = String(Math.max(1, Math.round(rawGB)) * 4) + "GB";
    const raw = `${cpuModel}::${platform}::${cpuCount}::${memBucket}`;
    return crypto.createHash("sha256").update(raw).digest("hex").toUpperCase().slice(0, 16);
  } catch {
    // Last-resort: use the stable machine UUID so the fingerprint survives
    // corrupted os.cpus() calls (rare but seen on some VMs)
    const uuid = _getOrCreateMachineUUID();
    return crypto.createHash("sha256").update(uuid).digest("hex").toUpperCase().slice(0, 16);
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Account slot hash Ã¢â‚¬â€ includes account id so two accounts with identical
//    emails still get distinct hashes and count as separate slots in DB.
function taagerLoginMethodOf(acc) {
  const method = (acc && (acc.taagerLoginMethod || acc.taagerLoginMethod) || "email").toLowerCase().trim();
  return ["email", "phone", "google"].includes(method) ? method : "email";
}

function secondTaagerLoginMethodOf(acc) {
  const method = String(acc && acc.secondTaagerLoginMethod || "email").toLowerCase().trim();
  return ["email", "phone", "google"].includes(method) ? method : "email";
}

function missedOrdersDestinationOf(acc, legacyEnabled = false) {
  const clean = String(acc && acc.missedOrdersDestination || "").trim().toLowerCase();
  if (clean === "legacy_missing_orders" || clean === "missing-orders" || clean === "legacy") return "legacy_missing_orders";
  if (clean === "second_taager_cart" || clean === "second-taager-cart" || clean === "second_cart") return "second_taager_cart";
  if (clean === "primary_cart" || clean === "cart" || clean === "normal") return "primary_cart";
  if (acc && acc.secondTaagerCartEnabled === true) return "second_taager_cart";
  return "primary_cart";
}

function secondTaagerCartEnabledOf(acc) {
  return missedOrdersDestinationOf(acc) === "second_taager_cart" || !!(acc && acc.secondTaagerCartEnabled === true);
}

function isStaticAccount(acc) {
  return !!acc && acc.accountType === "static";
}

function cmsProviderOf(acc) {
  if (isStaticAccount(acc)) return "static";
  const provider = String(acc && acc.cmsProvider || "easyorders").trim().toLowerCase();
  return provider === "lightfunnels" ? "lightfunnels" : "easyorders";
}

function lightfunnelsLoginMethodOf(acc) {
  const method = String(acc && acc.lightfunnelsLoginMethod || "email").trim().toLowerCase();
  return method === "google" ? "google" : "email";
}

function dashboardEnrichmentProviderOf(acc) {
  const provider = String(acc && acc.dashboardEnrichmentProvider || "").trim().toLowerCase();
  if (provider === "lightfunnels") return "lightfunnels";
  if (provider === "easyorders") return "easyorders";
  return "none";
}

function cmsEmailOf(acc) {
  return cmsProviderOf(acc) === "lightfunnels"
    ? String(acc && acc.lightfunnelsEmail || "").trim().toLowerCase()
    : String(acc && acc.easyEmail || "").trim().toLowerCase();
}

function cmsAccountNameOf(acc) {
  return cmsProviderOf(acc) === "lightfunnels"
    ? String(acc && acc.lightfunnelsAccountName || "").replace(/\s+/g, " ").trim().toLowerCase()
    : String(acc && acc.easyStore || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function cmsDisplayNameOf(acc) {
  return cmsProviderOf(acc) === "lightfunnels"
    ? String(acc && acc.lightfunnelsAccountName || "").replace(/\s+/g, " ").trim()
    : String(acc && acc.easyStore || "").replace(/\s+/g, " ").trim();
}

function cmsLicenseStoreOf(acc) {
  const name = cmsAccountNameOf(acc);
  if (isStaticAccount(acc)) {
    return String(acc.label || acc.memberName || "Static account").replace(/\s+/g, " ").trim().toLowerCase();
  }
  return cmsProviderOf(acc) === "lightfunnels" && name ? `lightfunnels:${name}` : name;
}

function staticAccountIdentityOf(acc) {
  if (!isStaticAccount(acc)) return "";
  const id = String(acc.id || "").trim().toLowerCase();
  return id ? `static:${id}` : "";
}

function licenseEasyStoreOf(acc) {
  return cmsLicenseStoreOf(acc);
}

function taagerMerchantIdentityOf(acc) {
  const merchantId = String(acc && acc.taagerAffiliateCode || "").trim().toLowerCase();
  const country = String(acc && acc.taagerCountry || "sa").trim().toLowerCase();
  if (merchantId) return `${country}:${merchantId}`;
  return "";
}

function licenseRowMerchantIdentity(row) {
  const rowEmail = String(row && row.taager_email || "").trim().toLowerCase();
  return /^[a-z]{2}:[a-z0-9_-]+$/i.test(rowEmail) ? rowEmail : "";
}

function taagerLoginIdentityOf(acc) {
  const staticIdentity = staticAccountIdentityOf(acc);
  if (staticIdentity) return staticIdentity;
  const merchantIdentity = taagerMerchantIdentityOf(acc);
  if (merchantIdentity) return merchantIdentity;
  const method = taagerLoginMethodOf(acc);
  const country = String(acc && acc.taagerCountry || "sa").trim().toLowerCase();
  if (method === "phone") return normalizePhone(acc && (acc.taagerPhone || acc.taagerPhone) || "", country);
  return (acc && (acc.taagerEmail || acc.taagerEmail) || "").toLowerCase().trim();
}

function secondTaagerMerchantIdentityOf(acc) {
  const merchantId = String(acc && acc.secondTaagerAffiliateCode || "").trim().toLowerCase();
  const country = String(acc && acc.secondTaagerCountry || acc && acc.taagerCountry || "sa").trim().toLowerCase();
  if (merchantId) return `${country}:${merchantId}`;
  return "";
}

function secondTaagerLoginIdentityOf(acc) {
  if (!secondTaagerCartEnabledOf(acc)) return "";
  const merchantIdentity = secondTaagerMerchantIdentityOf(acc);
  if (merchantIdentity) return merchantIdentity;
  const method = secondTaagerLoginMethodOf(acc);
  const country = String(acc && acc.secondTaagerCountry || acc && acc.taagerCountry || "sa").trim().toLowerCase();
  if (method === "phone") return normalizePhone(acc && acc.secondTaagerPhone || "", country);
  return String(acc && acc.secondTaagerEmail || "").toLowerCase().trim();
}

function taagerMarketingKeyOf(acc) {
  const merchantId = String(acc && acc.taagerAffiliateCode || "").trim().toLowerCase();
  const country = String(acc && acc.taagerCountry || "sa").trim().toLowerCase();
  if (merchantId) return `taager:${country}:${merchantId}`;
  const method = taagerLoginMethodOf(acc);
  const identity = taagerLoginIdentityOf(acc);
  if (!identity) return "";
  return method === "phone" ? `phone:${identity}` : identity;
}

function accountIdentityKey(acc) {
  const staticIdentity = staticAccountIdentityOf(acc);
  if (staticIdentity) return staticIdentity;
  const cmsProvider = cmsProviderOf(acc);
  const cmsEmail = cmsEmailOf(acc);
  const cmsAccount = cmsLicenseStoreOf(acc);
  const method = taagerLoginMethodOf(acc);
  const merchantId = String(acc && acc.taagerAffiliateCode || "").trim().toLowerCase();
  const country = String(acc && acc.taagerCountry || "sa").trim().toLowerCase();
  const loginIdentity = method === "phone" ? `phone:${taagerLoginIdentityOf(acc)}` : `email:${taagerLoginIdentityOf(acc)}`;
  const taagerIdentity = merchantId ? `merchant:${country}:${merchantId}` : loginIdentity;
  return `cms:${cmsProvider}|email:${cmsEmail}|account:${cmsAccount}|taager:${method}:${taagerIdentity}`;
}

function accountHash(acc) {
  const identityKey = accountIdentityKey(acc);
  if (acc && acc.licenseAccountHash && acc.licenseIdentityKey === identityKey) {
    return acc.licenseAccountHash;
  }
  const id = (acc.id || "").trim();
  return crypto.createHash("sha256").update(`${id}|${identityKey}`).digest("hex");
}

function licenseRowMatchesAccount(row, acc) {
  if (!row || !acc) return false;
  const easy = cmsEmailOf(acc);
  const rowEasy = String(row.easy_email || "").toLowerCase().trim();
  if (easy && rowEasy && easy !== rowEasy) return false;
  const easyStore = licenseEasyStoreOf(acc);
  const rowEasyStore = String(row.easy_store || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (easyStore && easy && rowEasyStore && rowEasyStore !== easyStore) return false;

  const accountMerchant = taagerMerchantIdentityOf(acc);
  const rowMerchant = licenseRowMerchantIdentity(row);
  if (accountMerchant || rowMerchant) return !!accountMerchant && rowMerchant === accountMerchant;

  const method = taagerLoginMethodOf(acc);
  const rowMethod = String(row.taager_login_method || "").toLowerCase().trim();
  if (rowMethod && rowMethod !== method) return false;

  const country = String(acc.taagerCountry || "sa").toLowerCase().trim();
  const identity = taagerLoginIdentityOf(acc);
  const rowEmail = String(row.taager_email || "").toLowerCase().trim();
  const rowPhone = normalizePhone(row.taager_phone || "", country);
  const identityPhone = normalizePhone(identity || "", country);
  return !!identity && (rowEmail === identity || rowPhone === identityPhone);
}

function summarizeRemoteLicenseAccounts(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    count: list.length,
    lockedCount: list.filter(row => !row || row.unlocked !== true).length,
    accounts: list.slice(0, 10).map((row) => ({
      easyEmail: String(row && row.easy_email || "").trim(),
      easyStore: String(row && row.easy_store || "").trim(),
      taagerIdentity: String(row && (row.taager_email || row.taager_phone) || "").trim(),
      taagerLoginMethod: String(row && row.taager_login_method || "").trim() || "email",
      unlocked: row && row.unlocked === true,
    })),
  };
}

function licenseAccountRpcFields(account) {
  const dest = missedOrdersDestinationOf(account);
  const secondEnabled = dest === "second_taager_cart";
  const secondMethod = secondTaagerLoginMethodOf(account);
  const secondCountry = String(account && account.secondTaagerCountry || account && account.taagerCountry || "sa").trim().toLowerCase();
  return {
    p_easy_email: cmsEmailOf(account) || null,
    p_easy_store: licenseEasyStoreOf(account) || null,
    p_taager_email: taagerLoginIdentityOf(account) || null,
    p_taager_login_method: taagerLoginMethodOf(account),
    p_missed_orders_destination: dest,
    p_second_taager_email: secondEnabled && secondMethod !== "phone"
      ? String(account && account.secondTaagerEmail || "").toLowerCase().trim() || null
      : null,
    p_second_taager_phone: secondEnabled && secondMethod === "phone"
      ? normalizePhone(account && account.secondTaagerPhone || "", secondCountry) || null
      : null,
    p_second_taager_login_method: secondEnabled ? secondMethod : null,
    p_second_taager_country: secondEnabled ? secondCountry : null,
    p_second_taager_merchant_id: secondEnabled ? secondTaagerMerchantIdentityOf(account) || null : null,
  };
}


function isSupabaseRpcSignatureMismatch(error) {
  const message = String(error && error.message || error || "").toLowerCase();
  return message.includes("pgrst202") ||
    message.includes("could not find the function") ||
    message.includes("schema cache") ||
    message.includes("no function matches") ||
    message.includes("function") && message.includes("not found");
}

function legacyLicenseAccountRpcBody(body) {
  const src = body && typeof body === "object" ? body : {};
  const keep = [
    "p_license_key", "p_account_hash", "p_old_account_hash", "p_new_account_hash",
    "p_easy_email", "p_easy_store", "p_taager_email", "p_taager_login_method", "p_unlocked",
  ];
  return keep.reduce((next, key) => {
    if (Object.prototype.hasOwnProperty.call(src, key)) next[key] = src[key];
    return next;
  }, {});
}

async function supabaseLicenseAccountRpc(fn, body, legacyBody) {
  try {
    return await supabaseRpc(fn, body);
  } catch (error) {
    const fallbackBody = legacyBody || legacyLicenseAccountRpcBody(body);
    if (!fallbackBody || !Object.keys(fallbackBody).length || !isSupabaseRpcSignatureMismatch(error)) throw error;
    log.warn(`[Accounts] ${fn} rejected extended license payload, retrying legacy payload:`, error && error.message ? error.message : error);
    return supabaseRpc(fn, fallbackBody);
  }
}

function licenseAccountSyncSignature(account) {
  return JSON.stringify(licenseAccountRpcFields(account));
}

function _buildAccountIdents() {
  try {
    const accounts = store.get("accounts", []);
    return accounts.map(a => ({
      easy_email: cmsEmailOf(a),
      easy_store: licenseEasyStoreOf(a),
      cms_provider: cmsProviderOf(a),
      taager_email: staticAccountIdentityOf(a) || (a.taagerEmail || a.taagerEmail || "").toLowerCase().trim(),
      taager_phone: normalizePhone(a.taagerPhone || a.taagerPhone || "", a.taagerCountry || "sa"),
      taager_merchant_id: String(a.taagerAffiliateCode || "").trim().toLowerCase(),
      taager_country: String(a.taagerCountry || "sa").trim().toLowerCase(),
      taager_login_method: taagerLoginMethodOf(a),
      missed_orders_destination: missedOrdersDestinationOf(a, store.get("missingOrdersUploadEnabled", false) === true),
      second_taager_email: String(a.secondTaagerEmail || "").toLowerCase().trim(),
      second_taager_phone: normalizePhone(a.secondTaagerPhone || "", a.secondTaagerCountry || a.taagerCountry || "sa"),
      second_taager_merchant_id: String(a.secondTaagerAffiliateCode || "").trim().toLowerCase(),
      second_taager_country: String(a.secondTaagerCountry || a.taagerCountry || "sa").trim().toLowerCase(),
      second_taager_login_method: secondTaagerLoginMethodOf(a),
    })).filter(x => x.easy_email || x.easy_store || x.taager_email || x.taager_phone || x.taager_merchant_id);
  } catch { return []; }
}

const LICENSE_CREDENTIAL_BACKUP_VERSION = 1;
const LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION = 1;
const LICENSE_CREDENTIAL_BACKUP_AAD = Buffer.from("taager-license-credentials-v1");

function deriveLicenseCredentialBackupKey(licenseKey, salt) {
  return crypto.pbkdf2Sync(
    String(licenseKey || "").trim().toUpperCase(),
    `taager-license-credentials-v1:${salt}`,
    100000,
    32,
    "sha256"
  );
}

function encryptLicenseCredentialBackup(payload, licenseKey) {
  const salt = crypto.randomBytes(16).toString("base64");
  const iv = crypto.randomBytes(12);
  const key = deriveLicenseCredentialBackupKey(licenseKey, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(LICENSE_CREDENTIAL_BACKUP_AAD);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    alg: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: 100000,
    salt,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function decryptLicenseCredentialBackup(envelope, licenseKey) {
  if (!envelope || envelope.v !== 1 || envelope.alg !== "aes-256-gcm") {
    throw new Error("unsupported_credential_backup");
  }
  const key = deriveLicenseCredentialBackupKey(licenseKey, envelope.salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(LICENSE_CREDENTIAL_BACKUP_AAD);
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

function backupString(value, max = 512) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function accountForCredentialBackup(account) {
  const id = backupString(account && account.id, 80);
  return {
    id,
    accountType: isStaticAccount(account) ? "static" : "live",
    memberName: backupString(account && account.memberName, 120),
    label: backupString(account && account.label, 160),
    licenseAccountHash: backupString(account && account.licenseAccountHash, 160),
    licenseIdentityKey: backupString(account && account.licenseIdentityKey, 512),
    cmsProvider: cmsProviderOf(account),
    easyEmail: backupString(account && account.easyEmail, 320),
    easyPassword: id ? store.get(`pwd_easy_${id}`, "") : "",
    easyStore: backupString(account && account.easyStore, 180),
    lightfunnelsAccountName: backupString(account && account.lightfunnelsAccountName, 180),
    lightfunnelsLoginMethod: lightfunnelsLoginMethodOf(account),
    lightfunnelsEmail: backupString(account && account.lightfunnelsEmail, 320),
    lightfunnelsPassword: id ? store.get(`pwd_lightfunnels_${id}`, "") : "",
    dashboardEnrichmentProvider: ["easyorders", "lightfunnels"].includes(String(account && account.dashboardEnrichmentProvider || "").toLowerCase()) ? String(account.dashboardEnrichmentProvider).toLowerCase() : "none",
    easyOrdersLookbackDays: Number(account && account.easyOrdersLookbackDays || 60),
    taagerLoginMethod: taagerLoginMethodOf(account),
    taagerEmail: backupString(account && account.taagerEmail, 320),
    taagerPhone: backupString(account && account.taagerPhone, 80),
    taagerPassword: id ? store.get(`pwd_taager_${id}`, "") : "",
    taagerCountry: backupString(account && account.taagerCountry || "sa", 12).toLowerCase() || "sa",
    taagerAffiliateCode: backupString(account && account.taagerAffiliateCode, 80),
    missedOrdersDestination: missedOrdersDestinationOf(account),
    secondTaagerCartEnabled: secondTaagerCartEnabledOf(account),
    secondTaagerLoginMethod: secondTaagerLoginMethodOf(account),
    secondTaagerEmail: backupString(account && account.secondTaagerEmail, 320),
    secondTaagerPhone: backupString(account && account.secondTaagerPhone, 80),
    secondTaagerPassword: id ? store.get(`pwd_second_taager_${id}`, "") : "",
    secondTaagerCountry: backupString(account && (account.secondTaagerCountry || account.taagerCountry) || "sa", 12).toLowerCase() || "sa",
    secondTaagerAffiliateCode: backupString(account && account.secondTaagerAffiliateCode, 80),
  };
}

function legacyAccountForCredentialBackup() {
  const easyEmail = backupString(store.get("easyEmail", ""), 320);
  if (!easyEmail) return null;
  const id = "__single__";
  return {
    id,
    memberName: "",
    label: backupString(store.get("easyStore", "") || easyEmail, 160),
    licenseAccountHash: "",
    licenseIdentityKey: "",
    cmsProvider: "easyorders",
    easyEmail,
    easyPassword: String(store.get("easyPassword", "") || ""),
    easyStore: backupString(store.get("easyStore", ""), 180),
    dashboardEnrichmentProvider: store.get("dashboardEnrichmentProvider", "none") === "easyorders" ? "easyorders" : "none",
    easyOrdersLookbackDays: Number(store.get("easyOrdersLookbackDays", 60) || 60),
    taagerLoginMethod: store.get("taagerLoginMethod", "email") || "email",
    taagerEmail: backupString(store.get("taagerEmail", ""), 320),
    taagerPhone: backupString(store.get("taagerPhone", ""), 80),
    taagerPassword: String(store.get("taagerPassword", "") || ""),
    taagerCountry: backupString(store.get("taagerCountry", "sa") || "sa", 12).toLowerCase() || "sa",
    taagerAffiliateCode: backupString(store.get("taagerAffiliateCode", ""), 80),
  };
}

function localCredentialBackupAccountCount() {
  const accounts = store.get("accounts", []) || [];
  if (accounts.length) return accounts.length;
  return legacyAccountForCredentialBackup() ? 1 : 0;
}

function buildLicenseCredentialBackupPayload() {
  let accounts = (store.get("accounts", []) || []).map(accountForCredentialBackup).filter(a => a.id);
  if (!accounts.length) {
    const legacy = legacyAccountForCredentialBackup();
    if (legacy) accounts = [legacy];
  }
  return {
    version: LICENSE_CREDENTIAL_BACKUP_VERSION,
    updatedAt: new Date().toISOString(),
    accounts,
  };
}

function normalizeRestoredCredentialAccount(raw, index) {
  const src = raw && typeof raw === "object" ? raw : {};
  const fallbackId = `account_${Date.now()}_${index}`;
  const id = backupString(src.id || fallbackId, 80).replace(/[^\w-]/g, "_") || fallbackId;
  const restored = {
    id,
    accountType: src.accountType === "static" ? "static" : "live",
    memberName: backupString(src.memberName, 120),
    label: backupString(src.label, 160),
    cmsProvider: src.cmsProvider === "lightfunnels" ? "lightfunnels" : "easyorders",
    easyEmail: backupString(src.easyEmail, 320),
    easyPassword: String(src.easyPassword || ""),
    easyStore: backupString(src.easyStore, 180),
    lightfunnelsAccountName: backupString(src.lightfunnelsAccountName, 180),
    lightfunnelsLoginMethod: lightfunnelsLoginMethodOf(src),
    lightfunnelsEmail: backupString(src.lightfunnelsEmail, 320),
    lightfunnelsPassword: String(src.lightfunnelsPassword || ""),
    dashboardEnrichmentProvider: ["easyorders", "lightfunnels"].includes(String(src.dashboardEnrichmentProvider || "").toLowerCase()) ? String(src.dashboardEnrichmentProvider).toLowerCase() : "none",
    easyOrdersLookbackDays: Number(src.easyOrdersLookbackDays || 60),
    taagerLoginMethod: taagerLoginMethodOf(src),
    taagerEmail: backupString(src.taagerEmail, 320),
    taagerPhone: backupString(src.taagerPhone, 80),
    taagerPassword: String(src.taagerPassword || ""),
    taagerCountry: backupString(src.taagerCountry || "sa", 12).toLowerCase() || "sa",
    taagerAffiliateCode: backupString(src.taagerAffiliateCode, 80),
    missedOrdersDestination: missedOrdersDestinationOf(src),
    secondTaagerCartEnabled: missedOrdersDestinationOf(src) === "second_taager_cart" || src.secondTaagerCartEnabled === true,
    secondTaagerLoginMethod: secondTaagerLoginMethodOf(src),
    secondTaagerEmail: backupString(src.secondTaagerEmail, 320),
    secondTaagerPhone: backupString(src.secondTaagerPhone, 80),
    secondTaagerPassword: String(src.secondTaagerPassword || ""),
    secondTaagerCountry: backupString(src.secondTaagerCountry || src.taagerCountry || "sa", 12).toLowerCase() || "sa",
    secondTaagerAffiliateCode: backupString(src.secondTaagerAffiliateCode, 80),
  };
  const identityKey = accountIdentityKey(restored);
  if (src.licenseAccountHash && src.licenseIdentityKey === identityKey) {
    restored.licenseAccountHash = backupString(src.licenseAccountHash, 160);
    restored.licenseIdentityKey = identityKey;
  }
  return restored;
}

async function getLicenseCredentialBackupStatus() {
  const licKey = licenseStore.get("licenseKey", "");
  if (!licKey) return { ok: false, available: false, reason: "no_license" };
  try {
    const status = await supabaseRpc("taager_get_license_credential_backup_status", {
      p_license_key: licKey,
      p_machine_uuid: _getOrCreateMachineUUID(),
      p_device_id: getDeviceFingerprint(),
    });
    return {
      ok: status && status.ok === true,
      available: status && status.available === true,
      accountCount: Number(status && status.account_count || 0),
      updatedAt: status && status.updated_at || null,
      reason: status && status.reason || "",
    };
  } catch (error) {
    log.warn("[LicenseCredentials] Backup status failed:", error && error.message ? error.message : error);
    return { ok: false, available: false, reason: "backup_status_failed" };
  }
}

async function getLicenseCredentialBackupPromptStatus() {
  const licKey = licenseStore.get("licenseKey", "");
  const accountCount = localCredentialBackupAccountCount();
  if (!licKey) return { show: false, reason: "no_license", version: LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION };
  if (!accountCount) return { show: false, reason: "no_accounts", version: LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION };
  if (store.get("licenseCredentialBackupPromptDoneVersion", 0) >= LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION) {
    return { show: false, reason: "already_done", version: LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION };
  }
  const status = await getLicenseCredentialBackupStatus();
  if (status && status.ok === false) {
    return {
      show: false,
      reason: status.reason || "backup_status_unavailable",
      version: LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION,
      accountCount,
    };
  }
  if (status && status.available) {
    store.set("licenseCredentialBackupPromptDoneVersion", LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION);
    return {
      show: false,
      reason: "backup_exists",
      version: LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION,
      accountCount: status.accountCount || accountCount,
      updatedAt: status.updatedAt || null,
    };
  }
  return {
    show: true,
    reason: status && status.reason || "backup_missing",
    version: LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION,
    accountCount,
  };
}

async function syncLicenseCredentialsBackup(reason = "credentials-updated") {
  const licKey = licenseStore.get("licenseKey", "");
  if (!licKey) return { ok: false, reason: "no_license" };
  const payload = buildLicenseCredentialBackupPayload();
  if (!payload.accounts.length) return { ok: false, reason: "no_accounts" };
  const encrypted = encryptLicenseCredentialBackup(payload, licKey);
  try {
    const result = await supabaseRpc("taager_upsert_license_credential_backup", {
      p_license_key: licKey,
      p_machine_uuid: _getOrCreateMachineUUID(),
      p_device_id: getDeviceFingerprint(),
      p_payload_version: LICENSE_CREDENTIAL_BACKUP_VERSION,
      p_encrypted_payload: encrypted,
      p_account_count: payload.accounts.length,
      p_account_hashes: payload.accounts.map(a => accountHash(a)),
    });
    if (!result || result.ok !== true) {
      log.warn("[LicenseCredentials] Backup rejected:", result && result.reason || "unknown");
      return { ok: false, reason: result && result.reason || "backup_rejected" };
    }
    log.info("[LicenseCredentials] Credential backup synced:", { reason, accounts: payload.accounts.length });
    return { ok: true, accountCount: payload.accounts.length };
  } catch (error) {
    log.warn("[LicenseCredentials] Backup sync failed:", error && error.message ? error.message : error);
    return { ok: false, reason: "backup_sync_failed" };
  }
}

async function backupLicenseCredentialsNow() {
  const result = await syncLicenseCredentialsBackup("manual-backup-prompt");
  if (result && result.ok === true) {
    store.set("licenseCredentialBackupPromptDoneVersion", LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION);
  }
  return Object.assign({ version: LICENSE_CREDENTIAL_BACKUP_PROMPT_VERSION }, result || { ok: false, reason: "backup_failed" });
}
function looksLikeEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function accountDisplayName(acc, fallback = "Account") {
  if (!acc) return fallback;
  return (acc.memberName || acc.lightfunnelsAccountName || acc.easyStore || acc.storeName || acc.label || acc.name || acc.lightfunnelsEmail || acc.easyEmail || acc.email || acc.taagerEmail || fallback || "Account").trim();
}

function accountContactEmail(acc) {
  return String((acc && (acc.lightfunnelsEmail || acc.easyEmail || acc.email || acc.taagerEmail)) || "").trim();
}

const ADMIN_ERROR_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const adminErrorAlertRecent = new Map();

function compactAdminAlertText(value, max = 600) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function adminAlertAccountInfo(account, fallbackId) {
  const id = String(account && account.id || fallbackId || "__single__");
  const stored = account || getStoredAccountById(id) || {};
  return {
    accountId: id,
    accountLabel: accountDisplayName(stored, id === "__single__" || id === "legacy" ? "Account 1" : id),
    accountEmail: compactAdminAlertText(accountContactEmail(stored), 180),
    taagerCountry: compactAdminAlertText(stored.taagerCountry || store.get("taagerCountry", "sa") || "sa", 32),
  };
}

function notifyAdminErrorAlert(details = {}) {
  const errorText = compactAdminAlertText(details.error || details.message || "Unknown error", 900);
  if (!errorText || errorText === "LICENSE_INVALID") return;

  const licenseKey = compactAdminAlertText(licenseStore.get("licenseKey", ""), 80);
  const customerName = compactAdminAlertText(licenseStore.get("customerName", ""), 180);
  const account = adminAlertAccountInfo(details.account || null, details.accountId);
  const flow = compactAdminAlertText(details.flow || "app", 80);
  const operation = compactAdminAlertText(details.operation || "", 120);
  const dedupeKey = [licenseKey, customerName, flow, operation, account.accountId, errorText.slice(0, 220)].join("|");
  const now = Date.now();
  const previous = adminErrorAlertRecent.get(dedupeKey) || 0;
  if (now - previous < ADMIN_ERROR_ALERT_COOLDOWN_MS) return;
  adminErrorAlertRecent.set(dedupeKey, now);

  const recentLogs = Array.isArray(details.recentLogs)
    ? details.recentLogs.slice(-8).map((line) => compactAdminAlertText(line, 240)).filter(Boolean)
    : [];

  supabaseFunctionRequest("admin-error-alert", {
    licenseKey,
    customerName,
    flow,
    operation,
    error: errorText,
    account,
    dateFrom: compactAdminAlertText(details.dateFrom || "", 32),
    dateTo: compactAdminAlertText(details.dateTo || "", 32),
    lastStage: compactAdminAlertText(details.lastStage || "", 180),
    recentLogs,
    appVersion: app.getVersion(),
    timestamp: new Date().toISOString(),
  }).catch((error) => {
    log.warn("[AdminAlert] WhatsApp alert failed:", error && error.message ? error.message : error);
  });
}

function getStoredAccountById(accountId) {
  if (!accountId || accountId === "__single__" || accountId === "legacy") {
    const easyEmail = store.get("easyEmail", "");
    return easyEmail ? {
      id: accountId || "__single__",
      label: "Account 1",
      easyEmail,
    } : null;
  }
  const accounts = store.get("accounts", []) || [];
  return accounts.find(a => a.id === accountId) || null;
}

function getStoredAccountsMap() {
  const accounts = store.get("accounts", []) || [];
  return new Map(accounts.map(a => [a.id, a]));
}

function normalizeAnalyticsRun(run, accountsById) {
  const accountId = run.accountId || "__single__";
  const storedAccount = (accountId === "__single__" || accountId === "legacy")
    ? getStoredAccountById(accountId)
    : accountsById?.get(accountId);
  const storedEmail = (storedAccount?.easyEmail || "").trim();
  const payloadEmail = (run.accountEmail || "").trim();
  const payloadLabel = (run.accountLabel || "").trim();
  const email = storedEmail || (looksLikeEmail(payloadEmail) ? payloadEmail : "") || (looksLikeEmail(payloadLabel) ? payloadLabel : "") || payloadEmail;
  const label = accountDisplayName(storedAccount, payloadLabel || email || payloadEmail || "");
  const taagerCountry = String(run.taagerCountry || storedAccount?.taagerCountry || store.get("taagerCountry", "sa") || "sa").trim().toLowerCase();

  return {
    ...run,
    accountId,
    accountEmail: email,
    accountLabel: label,
    taagerCountry,
    orders: Array.isArray(run.orders)
      ? run.orders.map((order) => ({ ...order, taagerCountry: order.taagerCountry || taagerCountry }))
      : run.orders,
  };
}

function parseOrderRowsFromOutputBuffer(bufferLike) {
  try {
    if (!bufferLike) return [];
    const buffer = Buffer.isBuffer(bufferLike)
      ? bufferLike
      : Buffer.from(bufferLike instanceof ArrayBuffer ? new Uint8Array(bufferLike) : bufferLike);
    if (!buffer.length) return [];

    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets.Orders || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).slice(1);

    return rows
      .filter(row => row && row.some(cell => String(cell || "").trim()))
      .map(row => ({
        qty: Number(row[0]) || 1,
        productName: String(row[1] || ""),
        sku: "",
        unitPrice: "",
        subtotal: Number(row[2]) || 0,
        date: String(row[3] || ""),
        city: String(row[4] || ""),
        region: String(row[5] || ""),
        address: String(row[6] || ""),
        name: String(row[7] || ""),
        phone: String(row[8] || ""),
        source: "real",
        orderStatus: "Under processing",
        amountDue: 0,
        marketerCommission: 0,
        taagerOrderNumber: "",
      }));
  } catch (err) {
    console.warn("[Analytics] Failed to parse order rows from output buffer:", err.message);
    return [];
  }
}

function countryOfRow(row, fallback = "sa") {
  return String(row?.taagerCountry || row?.country || fallback || "sa").trim().toLowerCase();
}

function taagerRowKey(row, fallbackCountry = "sa") {
  const sku = (row?.sku || "").toString().trim();
  if (!sku) return null;
  const country = countryOfRow(row, fallbackCountry);
  const phone = normalizePhone(row.phone, country) || normalizePhone(row.phone1, country) || normalizePhone(row.phone2, country);
  return phone ? `${phone}|${sku}` : null;
}

function analyticsOrderKey(order, fallbackCountry = "sa") {
  const sku = (order?.sku || "").toString().trim();
  if (!sku) return null;
  const country = countryOfRow(order, fallbackCountry);
  const phone = normalizePhone(order.phone || order.rawPhone || order.normPhone || "", country);
  return phone ? `${phone}|${sku}` : null;
}

function parseDashboardMoney(value) {
  if (value == null || value === "") return 0;
  let text = String(value).trim()
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06F0))
    .replace(/[\u066B\u00B7]/g, ".")
    .replace(/[\u066C\u060C]/g, ",");
  const sign = /^\s*\(.*\)\s*$/.test(text) || /-/.test(text) ? -1 : 1;
  text = text.replace(/[^\d.,-]/g, "").replace(/-/g, "");
  if (!text) return 0;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastComma > lastDot && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    text = text.replace(/,/g, "");
  } else if (lastComma > lastDot && text.split(",").length === 2 && text.split(",")[1].length <= 2) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  const n = Number(text);
  return Number.isFinite(n) ? sign * n : 0;
}

function mergeTaagerRowIntoOrder(order, taagerRow) {
  if (!taagerRow) return order;
  const next = { ...order };
  if (taagerRow.orderStatus) next.orderStatus = taagerRow.orderStatus;
  const statusBucket = taagerRow.orderStatusBucket || taagerRow.exactStatusBucket || taagerRow.statusBucket;
  if (statusBucket) {
    next.orderStatusBucket = statusBucket;
    next.exactStatusBucket = statusBucket;
    next.statusBucket = statusBucket;
  }
  if (taagerRow.taagerOrderNumber) next.taagerOrderNumber = taagerRow.taagerOrderNumber;
  const amountDue = parseDashboardMoney(taagerRow.amountDueRaw || taagerRow.amountDue);
  const marketerCommission = parseDashboardMoney(taagerRow.marketerCommission);
  const totalPrice = parseDashboardMoney(taagerRow.totalPriceRaw || taagerRow.totalPrice);
  if (amountDue > 0) next.amountDue = amountDue;
  if (marketerCommission > 0) next.marketerCommission = marketerCommission;
  if (totalPrice > 0) next.subtotal = totalPrice;
  if (taagerRow.city && !next.city) next.city = taagerRow.city;
  if (taagerRow.createdAt && !next.date) next.date = taagerRow.createdAt;
  return next;
}

function dashboardRowKey(row) {
  if (!row) return null;
  const direct = row.taagerOrderNumber || row.orderNumber || row.orderId || row.id;
  if (direct) {
    const sku = (row.sku || row.productSku || row.products || "").toString().trim();
    const itemIndex = row.orderItemIndex != null ? String(row.orderItemIndex) : "";
    const qty = (row.qty || "").toString().trim();
    return `id:${String(direct).trim()}|${sku}|${itemIndex || qty}`;
  }
  const sku = (row.sku || row.productSku || "").toString().trim();
  const country = countryOfRow(row);
  const phone = normalizePhone(row.phone || row.phone1 || row.phone2 || row.rawPhone || "", country);
  const date = (row.createdAt || row.date || row.lastUpdatedAt || "").toString().slice(0, 10);
  if (phone || sku || date) return `sig:${phone}|${sku}|${date}`;
  return null;
}

function normalizeDashboardDateKey(value) {
  if (!value) return "";
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function dashboardRowDateKey(row) {
  if (!row) return "";
  return normalizeDashboardDateKey(row.createdAt || row.date || row.dashboardDate || row.lastUpdatedAt || row.updatedAt);
}

function dashboardOrderOnlyKey(row, fallbackIndex = 0) {
  if (!row) return `idx:${fallbackIndex}`;
  const direct = row.taagerOrderNumber || row.orderNumber || row.orderId || row.id || row.reference;
  if (direct) return `id:${String(direct).trim()}`;
  const country = countryOfRow(row);
  const phone = normalizePhone(row.phone || row.phone1 || row.phone2 || row.rawPhone || "", country);
  const date = normalizeDashboardDateKey(row.createdAt || row.date || row.dashboardDate);
  const status = String(row.orderStatusBucket || row.statusBucket || row.orderStatus || row.status || "");
  return `sig:${phone}|${date}|${status}|${fallbackIndex}`;
}

function dashboardExactStatusBucket(row) {
  const bucket = String(row?.orderStatusBucket || row?.exactStatusBucket || row?.statusBucket || "").trim();
  if (bucket) return bucket;
  const status = String(row?.orderStatus || row?.status || "").trim();
  if (/canceled_by_you|Ã˜Â·Ã™â€žÃ˜Â¨ Ã™â€¦Ã™â€žÃ˜ÂºÃ™Å  Ã˜Â¨Ã™Ë†Ã˜Â§Ã˜Â³Ã˜Â·Ã˜ÂªÃ™Æ’/.test(status)) return "canceled_by_you";
  if (/delivered|Ã˜ÂªÃ™â€¦ Ã˜Â§Ã™â€žÃ˜ÂªÃ™Ë†Ã˜ÂµÃ™Å Ã™â€ž/.test(status)) return "delivered";
  if (/customer_refused_confirmation|Ã˜Â±Ã™ÂÃ˜Â¶/.test(status)) return "customer_refused_confirmation";
  if (/on_hold|Ã™â€¦Ã˜Â¹Ã™â€žÃ™â€š/.test(status)) return "on_hold";
  if (/received|Ã˜Â§Ã˜Â³Ã˜ÂªÃ™â€žÃ˜Â§Ã™â€¦/.test(status)) return "received";
  return status || "other";
}

function dashboardSummaryForRange(rows, dateFrom, dateTo) {
  const from = normalizeDashboardDateKey(dateFrom);
  const to = normalizeDashboardDateKey(dateTo);
  const orders = new Map();
  let itemRows = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = dashboardRowDateKey(row);
    if (from && to && (!key || key < from || key > to)) continue;
    itemRows++;
    const orderKey = dashboardOrderOnlyKey(row, itemRows);
    if (!orders.has(orderKey)) orders.set(orderKey, row);
  }
  const statusBreakdown = {};
  let canceledByYou = 0;
  let delivered = 0;
  let confirmed = 0;
  for (const row of orders.values()) {
    const bucket = dashboardExactStatusBucket(row);
    statusBreakdown[bucket] = (statusBreakdown[bucket] || 0) + 1;
    const isCanceled = bucket === "canceled_by_you";
    if (isCanceled) {
      canceledByYou++;
      continue;
    }
    if (bucket === "delivered") delivered++;
    if ([
      "confirmed", "waiting", "shipping", "delivery_suspended", "processing",
      "delivered", "failed", "return_verified", "after_sales_progress", "after_sales_done",
    ].includes(bucket)) confirmed++;
  }
  return {
    itemRows,
    rawOrders: orders.size,
    canceledByYou,
    netOrders: Math.max(0, orders.size - canceledByYou),
    delivered,
    confirmed,
    statusBreakdown,
  };
}

function dashboardIsIncomingBucket(bucket) {
  return bucket === "received" ||
    bucket === "shipping" ||
    bucket === "delivery_suspended" ||
    bucket === "confirmed" ||
    bucket === "waiting" ||
    bucket === "on_hold" ||
    bucket === "after_sales_progress";
}

function dashboardIsLostBucket(bucket) {
  return bucket === "failed" ||
    bucket === "return_verified" ||
    bucket === "customer_refused_confirmation" ||
    bucket === "out_of_stock" ||
    bucket === "after_sales_done";
}

function dashboardProfitValue(row) {
  return parseDashboardMoney(
    row && (
      row.profitAfterTax ??
      row.taagerProfit ??
      row.profitAfterFees ??
      row.commission ??
      row.marketerCommission ??
      0
    )
  );
}

function normalizeDashboardProfitFields(row) {
  if (!row) return row;
  const next = { ...row };
  const orderProfit = parseDashboardMoney(next.profitRaw ?? next.orderProfitRaw ?? next.profit ?? next.orderProfit ?? next.profitBeforeTax ?? next.grossProfit ?? 0);
  let taxProfit = parseDashboardMoney(next.taxProfitRaw ?? next.taagerTaxProfitRaw ?? next.taxProfit ?? next.taagerTaxProfit ?? next.taagerFees ?? next.tax ?? 0);
  if (orderProfit > 0 && taxProfit > orderProfit) {
    while (taxProfit > orderProfit && taxProfit >= 1) taxProfit = taxProfit / 10;
  }
  if (orderProfit > 0 || taxProfit > 0) {
    const profitAfterTax = orderProfit - taxProfit;
    next.profit = orderProfit;
    next.taxProfit = taxProfit;
    next.taagerTaxProfit = taxProfit;
    next.taagerFees = taxProfit;
    next.profitAfterTax = profitAfterTax;
    next.profitAfterFees = profitAfterTax;
    next.taagerProfit = profitAfterTax;
    next.commission = profitAfterTax;
    next.marketerCommission = profitAfterTax;
  }
  return next;
}

function normalizeDashboardProfitRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeDashboardProfitFields);
}

function normalizeSkuNameCacheMap(value) {
  const map = {};
  Object.entries(value || {}).forEach(([sku, name]) => {
    const cleanSku = String(sku || "").trim();
    const cleanName = String(name || "").trim().replace(/\s+/g, " ");
    if (cleanSku && cleanName) map[cleanSku] = cleanName;
  });
  return map;
}

function dashboardSkuNameCacheKey(accountId) {
  const safeId = String(accountId || "__single__").trim().replace(/[.$[\]#/\\]/g, "_") || "__single__";
  return `skuNameCache.v1.${safeId}`;
}

function getDashboardSkuNameCache(accountId) {
  return normalizeSkuNameCacheMap(dashboardStore.get(dashboardSkuNameCacheKey(accountId), {}));
}

function mergeDashboardSkuNameCache(accountId, learnedMap) {
  const learned = normalizeSkuNameCacheMap(learnedMap);
  const keys = Object.keys(learned);
  if (!keys.length) {
    const existing = getDashboardSkuNameCache(accountId);
    return { added: 0, updated: 0, total: Object.keys(existing).length };
  }
  const existing = getDashboardSkuNameCache(accountId);
  let added = 0;
  let updated = 0;
  keys.forEach((sku) => {
    if (!existing[sku]) added++;
    else if (existing[sku] !== learned[sku]) updated++;
    existing[sku] = learned[sku];
  });
  dashboardStore.set(dashboardSkuNameCacheKey(accountId), existing);
  return { added, updated, total: Object.keys(existing).length };
}

function dashboardRowSku(row) {
  return String(row && (row.sku || row.products) || "").trim();
}

function cleanDashboardProductName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hasExplicitDashboardProductName(row) {
  const sku = dashboardRowSku(row);
  const name = cleanDashboardProductName(row && row.productName);
  const products = cleanDashboardProductName(row && row.products);
  return !!name && name !== sku && name !== products;
}

function productNameMapFromDashboardRows(rows) {
  const map = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const sku = dashboardRowSku(row);
    if (!sku || map[sku] || !hasExplicitDashboardProductName(row)) return;
    map[sku] = cleanDashboardProductName(row.productName);
  });
  return map;
}

function preserveExistingDashboardProductNames(rows, existingRows) {
  const existingNames = productNameMapFromDashboardRows(existingRows);
  if (!Object.keys(existingNames).length) return rows;
  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (hasExplicitDashboardProductName(row)) return row;
    const sku = dashboardRowSku(row);
    const name = sku ? existingNames[sku] : "";
    return name ? { ...row, productName: name } : row;
  });
}

function normalizeDashboardAccountSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot || null;
  const next = { ...snapshot };
  next.snapshot = normalizeDashboardProfitRows(next.snapshot || []);
  return next;
}

function normalizeDashboardAccountsSnapshot(accounts) {
  const normalized = {};
  for (const [id, snapshot] of Object.entries(accounts || {})) {
    normalized[id] = normalizeDashboardAccountSnapshot(snapshot);
  }
  return normalized;
}

function dashboardAccountIdentityMeta(account, fallbackId = "") {
  if (!account || typeof account !== "object") return null;
  const id = String(account.id || fallbackId || "").trim();
  return {
    id,
    identityKey: accountIdentityKey(account),
    marketingKey: taagerMarketingKeyOf(account),
    taagerMerchantIdentity: taagerMerchantIdentityOf(account),
    taagerLoginIdentity: taagerLoginIdentityOf(account),
    cmsProvider: cmsProviderOf(account),
    cmsEmail: cmsEmailOf(account),
    cmsAccount: cmsLicenseStoreOf(account),
    taagerCountry: String(account.taagerCountry || "sa").trim().toLowerCase(),
    label: accountDisplayName(account, id || "Account"),
  };
}

function dashboardIdentityMatchScore(left, right) {
  if (!left || !right) return 0;
  let score = 0;
  if (left.identityKey && right.identityKey && left.identityKey === right.identityKey) score += 100;
  if (left.marketingKey && right.marketingKey && left.marketingKey === right.marketingKey) score += 80;
  if (left.taagerMerchantIdentity && right.taagerMerchantIdentity && left.taagerMerchantIdentity === right.taagerMerchantIdentity) score += 70;
  if (left.taagerLoginIdentity && right.taagerLoginIdentity && left.taagerLoginIdentity === right.taagerLoginIdentity) score += 40;
  if (left.cmsEmail && right.cmsEmail && left.cmsEmail === right.cmsEmail) score += 15;
  if (left.cmsAccount && right.cmsAccount && left.cmsAccount === right.cmsAccount) score += 15;
  if (left.taagerCountry && right.taagerCountry && left.taagerCountry === right.taagerCountry) score += 5;
  return score;
}

function latestDashboardTimestamp(...values) {
  return values.map((value) => Number(value || 0)).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0) || null;
}

function mergeDashboardSnapshotRows(primaryRows, secondaryRows) {
  const merged = [];
  const seen = new Set();
  for (const row of [...(Array.isArray(primaryRows) ? primaryRows : []), ...(Array.isArray(secondaryRows) ? secondaryRows : [])]) {
    const key = dashboardRowKey(row) || `idx:${merged.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

function mergeDashboardAccountSnapshots(primary, secondary, identityMeta) {
  const base = primary && typeof primary === "object" ? primary : {};
  const extra = secondary && typeof secondary === "object" ? secondary : {};
  return {
    ...extra,
    ...base,
    snapshot: mergeDashboardSnapshotRows(base.snapshot, extra.snapshot),
    snapshotMonth: base.snapshotMonth || extra.snapshotMonth || "",
    accountIdentity: identityMeta || base.accountIdentity || extra.accountIdentity || null,
    accountLabel: (identityMeta && identityMeta.label) || base.accountLabel || extra.accountLabel || "",
    autoFetchTimestamp: latestDashboardTimestamp(base.autoFetchTimestamp, extra.autoFetchTimestamp),
    manualFetchTimestamp: latestDashboardTimestamp(base.manualFetchTimestamp, extra.manualFetchTimestamp),
    staticUploadTimestamp: latestDashboardTimestamp(base.staticUploadTimestamp, extra.staticUploadTimestamp),
    botSnapshotTimestamp: latestDashboardTimestamp(base.botSnapshotTimestamp, extra.botSnapshotTimestamp),
  };
}

function reconcileDashboardSnapshotsWithAccounts() {
  const accounts = dashboardStore.get("accounts", {});
  if (!accounts || typeof accounts !== "object") return accounts || {};
  const storedAccounts = store.get("accounts", []) || [];
  if (!Array.isArray(storedAccounts) || !storedAccounts.length) return accounts;

  const currentById = new Map(storedAccounts.filter(Boolean).map((account) => [String(account.id || ""), account]));
  const currentIdentityById = new Map();
  storedAccounts.forEach((account) => {
    const id = String(account && account.id || "");
    if (id) currentIdentityById.set(id, dashboardAccountIdentityMeta(account, id));
  });

  let changed = false;
  const next = { ...accounts };

  for (const [snapshotId, snapshot] of Object.entries(accounts)) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const currentAccount = currentById.get(snapshotId);
    if (currentAccount) {
      if (!snapshot.accountIdentity) {
        next[snapshotId] = {
          ...snapshot,
          accountIdentity: currentIdentityById.get(snapshotId),
          accountLabel: snapshot.accountLabel || accountDisplayName(currentAccount, snapshotId),
        };
        changed = true;
      }
      continue;
    }

    const snapshotIdentity = snapshot.accountIdentity || null;
    if (!snapshotIdentity) continue;

    let best = null;
    for (const [accountId, identity] of currentIdentityById.entries()) {
      const score = dashboardIdentityMatchScore(snapshotIdentity, identity);
      if (score >= 70 && (!best || score > best.score)) best = { accountId, identity, score };
    }
    if (!best || best.accountId === snapshotId) continue;

    next[best.accountId] = mergeDashboardAccountSnapshots(next[best.accountId], snapshot, best.identity);
    delete next[snapshotId];
    changed = true;
    log.info(`[Dashboard] Migrated snapshot from stale account id ${snapshotId} to ${best.accountId}.`);
  }

  if (changed) {
    dashboardStore.set("accounts", next);
    bumpDashboardSnapshotRevision();
  }
  return next;
}

function dashboardDebugSummaryForRange(rows, dateFrom, dateTo, diagnostics) {
  const base = dashboardSummaryForRange(rows, dateFrom, dateTo);
  const from = normalizeDashboardDateKey(dateFrom);
  const to = normalizeDashboardDateKey(dateTo);
  const orderProfitRows = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const dateKey = dashboardRowDateKey(row);
    if (from && to && (!dateKey || dateKey < from || dateKey > to)) continue;
    const orderKey = dashboardOrderOnlyKey(row, orderProfitRows.size);
    if (!orderProfitRows.has(orderKey)) orderProfitRows.set(orderKey, row);
  }

  const profitBuckets = { earned: 0, incoming: 0, lost: 0, ignoredCanceledByYou: 0 };
  const highProfitExamples = [];
  for (const [orderKey, row] of orderProfitRows.entries()) {
    const bucket = dashboardExactStatusBucket(row);
    const profit = dashboardProfitValue(row);
    if (bucket === "canceled_by_you") {
      profitBuckets.ignoredCanceledByYou += profit;
      continue;
    }
    if (bucket === "delivered") profitBuckets.earned += profit;
    else if (dashboardIsLostBucket(bucket)) profitBuckets.lost += profit;
    else if (dashboardIsIncomingBucket(bucket)) profitBuckets.incoming += profit;

    if (Math.abs(profit) >= 5000) {
      highProfitExamples.push({
        order: String(row.taagerOrderNumber || row.orderNumber || row.orderId || orderKey).slice(0, 80),
        status: bucket,
        profitAfterTax: profit,
        price: parseDashboardMoney(row.totalPriceRaw || row.totalPrice || row.priceNoShipping || row.orderValue || 0),
        createdAt: dashboardRowDateKey(row)
      });
    }
  }

  highProfitExamples.sort((a, b) => Math.abs(b.profitAfterTax) - Math.abs(a.profitAfterTax));
  return {
    ...base,
    parseDiagnostics: diagnostics || null,
    profitBuckets,
    highProfitExamples: highProfitExamples.slice(0, 8)
  };
}

function dashboardDebugLines(label, rangeFrom, rangeTo, exportFrom, exportTo, existingSummary, incomingSummary, savedSummary) {
  const diag = incomingSummary && incomingSummary.parseDiagnostics || {};
  const enrichment = diag.enrichment || {};
  const highProfit = (incomingSummary.highProfitExamples || []).map((x) =>
    `${x.order}:${x.status}:${x.profitAfterTax}`
  ).join(", ") || "none";
  return [
    `[Dashboard Debug:${label}] selected=${rangeFrom || "?"}..${rangeTo || "?"} export=${exportFrom || "?"}..${exportTo || "?"}`,
    `[Dashboard Debug:${label}] parse sourceRows=${diag.sourceRows ?? "?"} parsedItems=${diag.parsedItemRows ?? "?"} parsedOrders=${diag.parsedOrderCount ?? "?"} skippedNoSku=${diag.skippedNoSku ?? "?"} skippedOutOfRange=${diag.skippedOutOfRange ?? "?"} expandedItems=${diag.expandedItemRows ?? "?"}`,
    `[Dashboard Debug:${label}] easyorders provider=${enrichment.provider || "none"} status=${enrichment.status || "n/a"} nameRows=${enrichment.nameRowsScanned ?? "?"} paymentRows=${enrichment.paymentRowsScanned ?? "?"} learnedSku=${enrichment.learnedSkuNames ?? "?"} cacheHits=${enrichment.cacheHits ?? "?"} paymentMatches=${enrichment.paymentMatches ?? "?"}`,
    `[Dashboard Debug:${label}] incoming raw=${incomingSummary.rawOrders} net=${incomingSummary.netOrders} canceledByYou=${incomingSummary.canceledByYou} delivered=${incomingSummary.delivered} confirmed=${incomingSummary.confirmed} itemRows=${incomingSummary.itemRows}`,
    `[Dashboard Debug:${label}] existing raw=${existingSummary.rawOrders} net=${existingSummary.netOrders} canceledByYou=${existingSummary.canceledByYou} delivered=${existingSummary.delivered} confirmed=${existingSummary.confirmed} itemRows=${existingSummary.itemRows}`,
    `[Dashboard Debug:${label}] saved raw=${savedSummary.rawOrders} net=${savedSummary.netOrders} canceledByYou=${savedSummary.canceledByYou} delivered=${savedSummary.delivered} confirmed=${savedSummary.confirmed} itemRows=${savedSummary.itemRows}`,
    `[Dashboard Debug:${label}] status incoming=${JSON.stringify(incomingSummary.statusBreakdown || {})}`,
    `[Dashboard Debug:${label}] profit incoming earned=${Math.round(incomingSummary.profitBuckets.earned)} incoming=${Math.round(incomingSummary.profitBuckets.incoming)} lost=${Math.round(incomingSummary.profitBuckets.lost)} ignoredCanceledByYou=${Math.round(incomingSummary.profitBuckets.ignoredCanceledByYou)}`,
    `[Dashboard Debug:${label}] highProfitExamples=${highProfit}`
  ];
}

function validateDashboardSnapshotReplacement(existingRows, incomingRows, dateFrom, dateTo, diagnostics) {
  const incoming = dashboardSummaryForRange(incomingRows, dateFrom, dateTo);
  const existing = dashboardSummaryForRange(existingRows, dateFrom, dateTo);
  const hasComparableExisting = existing.rawOrders >= 50;
  const rawDrop = existing.rawOrders - incoming.rawOrders;
  const netDrop = existing.netOrders - incoming.netOrders;
  const itemDrop = existing.itemRows - incoming.itemRows;
  const suspicious = hasComparableExisting && (rawDrop > 0 || netDrop > 0 || itemDrop > Math.max(2, Math.ceil(existing.itemRows * 0.005)));
  return {
    ok: true,
    suspicious,
    warning: suspicious
      ? `Dashboard snapshot count changed for ${dateFrom || "?"} - ${dateTo || "?"}. Existing raw/net/items ${existing.rawOrders}/${existing.netOrders}/${existing.itemRows}, incoming ${incoming.rawOrders}/${incoming.netOrders}/${incoming.itemRows}.`
      : "",
    existing,
    incoming,
    diagnostics: diagnostics || null
  };
}

function staticDashboardPeriodMismatch(processed) {
  const diagnostics = processed && processed.parseDiagnostics || {};
  const sourceRows = Number(diagnostics.sourceRows || 0);
  const datedRows = Number(diagnostics.datedSourceRows || 0);
  const skippedOutOfRange = Number(diagnostics.skippedOutOfRange || 0);
  const parsedItems = Number(diagnostics.parsedItemRows || 0);
  const sourceDateFrom = diagnostics.sourceDateFrom || "";
  const sourceDateTo = diagnostics.sourceDateTo || "";
  const dateFrom = processed && processed.dateFrom || diagnostics.dateFrom || "";
  const dateTo = processed && processed.dateTo || diagnostics.dateTo || "";
  const allDatedRowsOutsideRange = sourceRows > 0 &&
    datedRows > 0 &&
    parsedItems === 0 &&
    skippedOutOfRange >= datedRows &&
    sourceDateFrom &&
    sourceDateTo &&
    dateFrom &&
    dateTo;
  if (!allDatedRowsOutsideRange) return null;
  return {
    selectedDateFrom: dateFrom,
    selectedDateTo: dateTo,
    sourceDateFrom,
    sourceDateTo,
    sourceRows,
    datedRows,
    skippedOutOfRange,
    message: `The uploaded Taager sheet contains orders dated ${sourceDateFrom} - ${sourceDateTo}, but the selected dashboard period is ${dateFrom} - ${dateTo}. Select the matching period, then upload/update again.`,
  };
}

function replaceDashboardRowsInRange(existingRows, incomingRows, dateFrom, dateTo) {
  const from = normalizeDashboardDateKey(dateFrom);
  const to = normalizeDashboardDateKey(dateTo);
  return replaceRowsInDateRange(existingRows, incomingRows, from, to, {
    rowKey: dashboardRowKey,
    rowDateKey: dashboardRowDateKey,
  });
}

function isUploadedAnalyticsOrder(order) {
  const source = String(order && order.source || "real").trim().toLowerCase();
  return source === "missed" || source === "real";
}

function analyticsRunWithinRange(run, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const ts = Number(run && run.runTimestamp) || 0;
  if (!ts) return false;
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    if (Number.isFinite(from) && ts < from) return false;
  }
  if (dateTo) {
    const toDate = new Date(dateTo);
    if (Number.isFinite(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      if (ts > toDate.getTime()) return false;
    }
  }
  return true;
}

function enrichAnalyticsRunsFromTaagerRows(accountId, rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const taagerMap = new Map();
  for (const row of rows) {
    const key = taagerRowKey(row);
    if (key) taagerMap.set(key, row);
  }
  if (taagerMap.size === 0) return 0;

  const storedRuns = analyticsStore.get("runs", []);
  let changed = 0;
  const accountsById = getStoredAccountsMap();
  const runs = storedRuns.map(run => normalizeAnalyticsRun(run, accountsById)).map((run) => {
    if (accountId && run.accountId !== accountId) return run;
    if (!analyticsRunWithinRange(run, options.dateFrom, options.dateTo)) return run;
    if (!Array.isArray(run.orders) || run.orders.length === 0) return run;

    let runChanged = false;
    const orders = run.orders.map((order) => {
      if (options.uploadedOnly && !isUploadedAnalyticsOrder(order)) return order;
      const taagerRow = taagerMap.get(analyticsOrderKey(order, run.taagerCountry));
      if (!taagerRow) return order;
      const merged = mergeTaagerRowIntoOrder(order, taagerRow);
      if (JSON.stringify(merged) !== JSON.stringify(order)) {
        runChanged = true;
        changed++;
      }
      return merged;
    });

    return runChanged ? { ...run, orders } : run;
  });

  if (changed > 0) {
    analyticsStore.set("runs", runs);
    invalidateAnalyticsRunsCache();
  }
  return changed;
}

function normalizeTaagerSnapshotEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return null;
    const key = String(entry[0] || "");
    const parts = key.split("|");
    const row = entry[1] || {};
    return {
      ...row,
      phone: parts[0] || row.phone || row.phone1 || row.phone2 || "",
      sku: parts[1] || row.sku || row.productSku || "",
    };
  }).filter(Boolean);
}

function enrichOrdersFromTaagerRows(orders, taagerRows, fallbackCountry = "sa") {
  if (!Array.isArray(orders) || orders.length === 0 || !Array.isArray(taagerRows) || taagerRows.length === 0) {
    return { orders: Array.isArray(orders) ? orders : [], changed: 0 };
  }
  const taagerMap = new Map();
  for (const row of taagerRows) {
    const key = taagerRowKey(row, fallbackCountry);
    if (key) taagerMap.set(key, row);
  }
  if (taagerMap.size === 0) return { orders, changed: 0 };

  let changed = 0;
  const enriched = orders.map((order) => {
    const taagerRow = taagerMap.get(analyticsOrderKey(order, order.taagerCountry || fallbackCountry));
    if (!taagerRow) return order;
    const merged = mergeTaagerRowIntoOrder(order, taagerRow);
    if (JSON.stringify(merged) !== JSON.stringify(order)) changed++;
    return merged;
  });
  return { orders: enriched, changed };
}

function isOperationsSuiteEnabled() {
  return licenseStore.get("analyticsEnabled", true) !== false ||
    licenseStore.get("operationsEnabled", true) !== false;
}

function isReportingDataEnabled() {
  return isOperationsSuiteEnabled() || licenseStore.get("dashboardEnabled", false) === true;
}

function persistDashboardSnapshot(accountId, data, options = {}) {
  if (!accountId || !data || !Array.isArray(data.snapshot)) throw new Error("Dashboard snapshot data is invalid.");
  const rows = normalizeDashboardProfitRows(data.snapshot || []);
  const accounts = dashboardStore.get("accounts", {});
  const storedAccount = getStoredAccountById(accountId) || staticDashboardAccount(accountId);
  const identityMeta = dashboardAccountIdentityMeta(storedAccount, accountId);
  if (!accounts[accountId]) accounts[accountId] = {};
  const rangeFrom = data.dateFrom || "";
  const rangeTo = data.dateTo || "";
  const validation = validateDashboardSnapshotReplacement(accounts[accountId].snapshot, rows, rangeFrom, rangeTo, data.parseDiagnostics);
  if (validation.suspicious) console.warn(`[Dashboard] ${validation.warning}`);
  const requiresConfirmation = validation.suspicious || rows.length === 0;
  if (requiresConfirmation && options.requireConfirmation && !options.allowSuspiciousReplacement) {
    return { saved: false, requiresConfirmation, rows, validation, warnings: data.warnings || [] };
  }
  const mergedRows = replaceDashboardRowsInRange(accounts[accountId].snapshot, rows, rangeFrom, rangeTo);
  accounts[accountId].snapshot = mergedRows;
  accounts[accountId].snapshotMonth = data.snapshotMonth || "";
  accounts[accountId].accountIdentity = identityMeta;
  accounts[accountId].accountLabel = identityMeta && identityMeta.label || accounts[accountId].accountLabel || "";
  accounts[accountId].enrichmentDiagnostics = data.enrichmentDiagnostics || data.parseDiagnostics?.enrichment || null;
  accounts[accountId].lastFetchRange = {
    dateFrom: rangeFrom,
    dateTo: rangeTo,
    exportDateFrom: data.exportDateFrom || "",
    exportDateTo: data.exportDateTo || "",
    rows: rows.length,
    source: options.source || "bot",
    validation,
    parseDiagnostics: data.parseDiagnostics || null,
    enrichment: data.enrichmentDiagnostics || data.parseDiagnostics?.enrichment || null,
  };
  accounts[accountId][options.timestampKey || "botSnapshotTimestamp"] = Date.now();
  dashboardStore.set("accounts", accounts);
  bumpDashboardSnapshotRevision();
  analyticsSnapshotSyncCacheKey = "";
  const enriched = options.enrichAnalytics === false ? 0 : enrichAnalyticsRunsFromTaagerRows(accountId, rows);
  runProductAlertsAfterSnapshot(accountId, data, options.source || "dashboard-refresh");
  return { saved: true, requiresConfirmation, rows, validation, mergedRows, enriched, warnings: data.warnings || [] };
}

function saveDashboardSnapshotRows(accountId, data, source) {
  if (!accountId || !data || !Array.isArray(data.snapshot)) return 0;
  return persistDashboardSnapshot(accountId, data, { source: source || "bot" }).rows.length;
}

function syncAnalyticsFromDashboardSnapshots() {
  const accounts = dashboardStore.get("accounts", {});
  const cacheKey = JSON.stringify(Object.entries(accounts || {}).map(([accountId, snap]) => [
    accountId,
    Array.isArray(snap?.snapshot) ? snap.snapshot.length : 0,
    snap?.updatedAt || snap?.lastUpdatedAt || snap?.timestamp || "",
  ]));
  if (cacheKey && cacheKey === analyticsSnapshotSyncCacheKey) return 0;
  let total = 0;
  for (const [accountId, snap] of Object.entries(accounts || {})) {
    total += enrichAnalyticsRunsFromTaagerRows(accountId, snap?.snapshot || []);
  }
  analyticsSnapshotSyncCacheKey = cacheKey;
  if (total > 0) console.log(`[Analytics] Synced ${total} stored orders from dashboard snapshots`);
  return total;
}

const MONTHLY_DATA_CLEANUP_LAST_RUN_KEY = "monthlyDataCleanupLastRun";
const MONTHLY_DATA_CLEANUP_LAST_RESULT_KEY = "monthlyDataCleanupLastResult";

function getMonthlyCleanupStatus(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const cutoff = monthlyCleanupCutoff(now);
  const lastRunMonth = String(dashboardStore.get(MONTHLY_DATA_CLEANUP_LAST_RUN_KEY, "") || "");
  return {
    ok: true,
    cleanupDay: MONTHLY_DATA_CLEANUP_DAY,
    currentMonth: monthlyCleanupMonthKey(now),
    cutoffDate: cutoff.cutoffDateKey,
    lastRunMonth,
    eligible: monthlyCleanupEligible({
      now,
      cleanupDay: MONTHLY_DATA_CLEANUP_DAY,
      lastRunMonth,
      force: false,
    }),
    nextEligibleDate: nextMonthlyCleanupDateKey({
      now,
      cleanupDay: MONTHLY_DATA_CLEANUP_DAY,
      lastRunMonth,
    }),
    lastResult: dashboardStore.get(MONTHLY_DATA_CLEANUP_LAST_RESULT_KEY, null),
  };
}

function runMonthlyDataCleanup(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const force = options.force === true;
  const status = getMonthlyCleanupStatus({ now });
  if (!force && !status.eligible) {
    return { ok: true, skipped: true, reason: "not_eligible", status };
  }

  const cutoff = monthlyCleanupCutoff(now);
  const analyticsPrune = pruneAnalyticsRunsForCurrentMonth(
    analyticsStore.get("runs", []),
    cutoff.cutoffTime
  );
  const dashboardPrune = pruneDashboardAccountsForCurrentMonth(
    dashboardStore.get("accounts", {}),
    cutoff.cutoffDateKey,
    dashboardRowDateKey
  );

  if (analyticsPrune.removed > 0) {
    analyticsStore.set("runs", analyticsPrune.runs);
    invalidateAnalyticsRunsCache();
  }

  if (dashboardPrune.changed) {
    dashboardStore.set("accounts", dashboardPrune.accounts);
    bumpDashboardSnapshotRevision();
  }

  const changed = analyticsPrune.removed > 0 || dashboardPrune.removedRows > 0;
  if (changed) {
    analyticsSnapshotSyncCacheKey = "";
    dashboardQueryService.clearCache();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("reset-cache");
    }
  }

  const result = {
    ok: true,
    skipped: false,
    cleanupDay: MONTHLY_DATA_CLEANUP_DAY,
    monthKey: cutoff.monthKey,
    cutoffDate: cutoff.cutoffDateKey,
    analyticsRunsRemoved: analyticsPrune.removed,
    analyticsRunsKept: analyticsPrune.runs.length,
    dashboardRowsRemoved: dashboardPrune.removedRows,
    dashboardAccountsTouched: dashboardPrune.touchedAccounts,
    changed,
    ranAt: now.toISOString(),
  };

  dashboardStore.set(MONTHLY_DATA_CLEANUP_LAST_RUN_KEY, cutoff.monthKey);
  dashboardStore.set(MONTHLY_DATA_CLEANUP_LAST_RESULT_KEY, result);
  if (changed) {
    log.info(`[MonthlyCleanup] Removed ${analyticsPrune.removed} analytics runs and ${dashboardPrune.removedRows} dashboard rows before ${cutoff.cutoffDateKey}.`);
  } else {
    log.info(`[MonthlyCleanup] Checked ${cutoff.monthKey}; no old reporting data found.`);
  }
  return result;
}

const monthlyDataCleanupScheduler = createMonthlyCleanupScheduler({
  runCleanup: () => runMonthlyDataCleanup(),
  onError: (error) => {
    log.error("[MonthlyCleanup] Scheduled cleanup failed:", error && error.message ? error.message : error);
    monitoring.captureException(error, { operation: "monthlyDataCleanup.scheduled" });
  },
});

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// LICENSE Ã¢â‚¬â€ server-only, random key, auto device lock
// Format: TAAGER-XXXX-XXXX-XXXX-XXXX
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Short-lived in-memory cache Ã¢â‚¬â€ shared by isLicenseValid() (auto-run timer)
// and the check-license IPC handler to prevent redundant Supabase calls.
// Busted by submit-license and clear-reset-flag.
let _licenseCache = null;
let _licenseCacheAt = 0;
const LICENSE_CACHE_TTL_MS = 60 * 1000; // 60 seconds
let adminNotificationRpcWarned = false;
const LICENSE_PRESENCE_INTERVAL_MS = 60 * 1000;
let licensePresenceTimer = null;
let licensePresenceRpcWarned = false;

function isValidKeyFormat(key) {
  return /^TAAGER-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim().toUpperCase());
}

async function getActiveAdminNotification(licenseKey) {
  try {
    return await fetchActiveAdminNotification(supabaseRpc, licenseKey);
  } catch (error) {
    if (!adminNotificationRpcWarned) {
      adminNotificationRpcWarned = true;
      log.warn("[AdminNotification] Fetch failed:", error && error.message ? error.message : error);
    }
    return null;
  }
}

async function isLicenseValid() {
  const key = licenseStore.get("licenseKey", "");
  if (!key) return false;
  if (_licenseCache && (Date.now() - _licenseCacheAt) < LICENSE_CACHE_TTL_MS) {
    const cached = evaluateCachedLicense(_licenseCache);
    if (cached.expired) {
      _licenseCache = null;
      _licenseCacheAt = 0;
      return false;
    }
    _licenseCache = cached.result;
    return _licenseCache.valid === true;
  }
  try {
    const r = await supabaseRpc("taager_check_license_with_identity", {
      p_license_key:    key,
      p_machine_uuid:   _getOrCreateMachineUUID(),
      p_device_id:      getDeviceFingerprint(),
      p_account_idents: _buildAccountIdents(),
    });
    if (!r || !r.valid) {
      if (!r || r.reason === "License not found on server.") {
        log.warn(`[License] Key "${key}" not found on server. Clearing local licenseKey.`);
        licenseStore.delete("licenseKey");
      }
      return false;
    }
    if (r.force_flush) _handleForceFlush();
    if (r.reset_cache) _handleResetCache();
    const expiresAt = r.expires_at || null;
    const expiry = evaluateCachedLicense({ valid: true, key, expiresAt });
    _saveLastValidResult(expiry.result);
    return true;
  } catch {
    return !!_getOfflineGraceResult();
  }
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// TRAY
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
async function recordLicensePresence() {
  const key = licenseStore.get("licenseKey", "");
  if (!key) return false;
  try {
    const result = await supabaseRpc("taager_record_license_presence", {
      p_license_key: key,
      p_machine_uuid: _getOrCreateMachineUUID(),
      p_device_id: getDeviceFingerprint(),
    });
    return result && result.ok === true;
  } catch (error) {
    const message = error && error.message ? error.message : String(error || "");
    if (!licensePresenceRpcWarned) {
      licensePresenceRpcWarned = true;
      log.warn("[LicensePresence] Heartbeat failed:", message);
    }
    return false;
  }
}

function startLicensePresenceHeartbeat() {
  stopLicensePresenceHeartbeat();
  recordLicensePresence();
  licensePresenceTimer = setInterval(() => {
    recordLicensePresence();
  }, LICENSE_PRESENCE_INTERVAL_MS);
}

function stopLicensePresenceHeartbeat() {
  if (licensePresenceTimer) {
    clearInterval(licensePresenceTimer);
    licensePresenceTimer = null;
  }
}

function createTray() {
  const iconPath = getIconPath();
  console.log("[tray] icon path:", iconPath, "| exists:", require("fs").existsSync(iconPath));
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) console.warn("[tray] nativeImage loaded empty Ã¢â‚¬â€ check path and file validity");
    if (process.platform === "win32" && !icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  } catch (e) {
    console.error("[tray] failed to load icon:", e.message);
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip("Taager Bot");
  updateTrayMenu();
  tray.on("click", () => { if (mainWindow.isVisible()) mainWindow.hide(); else { mainWindow.show(); mainWindow.focus(); } });
}
function updateTrayMenu() {
  if (!tray) return;
  const label = autoRunEnabled && autoRunTimer ? "Auto-Run: ON" : "Auto-Run: OFF";
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Taager Bot", enabled: false }, { type: "separator" },
    { label, enabled: false }, { type: "separator" },
    { label: "Show Window", click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: "separator" }, { label: "Quit", click: () => { app.quit(); } },
  ]));
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// WINDOW
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function createWindow() {
  // Read saved theme synchronously so we can pass the correct backgroundColor
  // before the window is shown Ã¢â‚¬â€ prevents a white/dark flash during startup.
  const savedTheme = store.get("theme", "dark");
  const bgColor = savedTheme === "light" ? "#f0f2f7" : "#0f1117";
  const launchMinimized = store.get("launchMinimized", false) === true;
  const autoRunOn = store.get("autoRun", false) === true;
  const startHiddenInTray = launchMinimized && autoRunOn;

  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 760, minHeight: 560,
    frame: false, titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // V8 snapshot: reuse compiled bytecode across launches
      v8CacheOptions: "bypassHeatCheck",
      // Disable spell check Ã¢â‚¬â€ saves renderer init time for a non-document app
      spellcheck: false,
    },
    backgroundColor: bgColor, icon: getIconPath(), show: false,
  });
  monitoring.monitorWindow(mainWindow, "main");
  installAppZoomControls(mainWindow);
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    log.error("[Preload] preload-error:", preloadPath, error && error.stack ? error.stack : error);
    monitoring.captureException(error, { operation: "preload.error", extra: { preloadPath } });
  });
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.once("ready-to-show", () => {
    if (startHiddenInTray) {
      mainWindow.hide();
      return;
    }
    mainWindow.show();
    mainWindow.maximize();
    mainWindow.focus();
  });
  mainWindow.on("close", (e) => {
    if (app.isQuitting) return;
    if (!mainWindow.isVisible()) {
      app.isQuitting = true;
      app.quit();
      return;
    }
    e.preventDefault();
    const autoRunOn = store.get("autoRun", false);
    const { response } = dialog.showMessageBoxSync(mainWindow, {
      type: "question", buttons: ["Minimize to Tray", "Close App"],
      defaultId: 0, cancelId: 0, title: "Close Taager Bot?",
      message: autoRunOn ? "Auto-Run is active" : "Keep running in tray?",
      detail: autoRunOn
        ? "Auto-Run is active Ã¢â‚¬â€ minimizing to tray keeps the bot running every " + autoRunIntervalLabel() + "."
        : "The app will keep running in the system tray. Click the tray icon to reopen it.",
    });
    if (response === 0) mainWindow.hide();
    else { clearAutoRun(); app.isQuitting = true; app.quit(); }
  });
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// AUTO-RUN
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function todayStr() { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-"); }
function autoRunIntervalLabel() {
  const m = store.get("autoRunInterval", 30);
  return m < 60 ? m + " min" : (m / 60) + " hr";
}

// Declared BEFORE app.whenReady so it is always defined when scheduleAutoRun() is called.
let autoRunStartedAt = 0;

function scheduleAutoRun() {
  clearAutoRun();
  autoRunStartedAt = Date.now();
  const intervalMs = store.get("autoRunInterval", 30) * 60 * 1000;

  // Recursive setTimeout: each tick recalculates remaining time from wall clock.
  // Unlike setInterval this doesn't drift, and survives sleep/wake correctly.
  function scheduleTick() {
    const remaining = Math.max(0, intervalMs - (Date.now() - autoRunStartedAt));
    autoRunTimer = setTimeout(async () => {
      if (botRunning) {
        // Bot still running Ã¢â‚¬â€ check again in 10 s without resetting the cycle
        autoRunTimer = setTimeout(scheduleTick, 10000);
        return;
      }
      if (!(await isLicenseValid())) {
        mainWindow.webContents.send("license-expired");
        autoRunStartedAt = Date.now();
        scheduleTick();
        return;
      }
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
        autoRunStartedAt = Date.now();
        scheduleTick();
        return;
      }
      autoRunStartedAt = Date.now();
      mainWindow.webContents.send("auto-run-tick", { dateFrom: todayStr(), dateTo: todayStr() });
      scheduleTick();
    }, remaining);
  }

  scheduleTick();
  updateTrayMenu();
}

function getAutoRunProgress() {
  if (!autoRunEnabled || !autoRunTimer) return null;
  const intervalMs = store.get("autoRunInterval", 30) * 60 * 1000;
  const remaining  = Math.max(0, intervalMs - (Date.now() - autoRunStartedAt));
  return { remainingMs: remaining, intervalMs };
}

function clearAutoRun() {
  if (autoRunTimer) { clearTimeout(autoRunTimer); autoRunTimer = null; }
  updateTrayMenu();
}


app.whenReady().then(() => {
  createWindow();
  createTray();
  startLicensePresenceHeartbeat();
  autoRunEnabled = store.get("autoRun", false);
  if (autoRunEnabled) scheduleAutoRun();
  monthlyDataCleanupScheduler.start();
  startProductAlertScheduler();

  if (app.isPackaged) {
    setTimeout(() => {
      log.info("[AutoUpdate] Startup auto-update check triggered (3s delay)");
      autoUpdater.checkForUpdates().catch(err => {
        log.error("[AutoUpdate] Startup checkForUpdates failed:", err.message);
        monitoring.captureException(err, { operation: "autoUpdater.startupCheck" });
      });
    }, 3000);
  } else {
    log.info("[AutoUpdate] Skipping startup update check - app is not packaged");
  }
});
app.on("before-quit", () => {
  app.isQuitting = true;
  stopLicensePresenceHeartbeat();
  stopProductAlertScheduler();
  monthlyDataCleanupScheduler.stop();
});

app.on("window-all-closed", () => {});

autoUpdater.on("checking-for-update", () => {
  log.info("[AutoUpdate] Checking for update...");
});

autoUpdater.on("update-available", (info) => {
  log.info(`[AutoUpdate] Update available - version=${info.version} releaseDate=${info.releaseDate}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-available", { version: info.version });
  }
});

autoUpdater.on("update-not-available", (info) => {
  log.info(`[AutoUpdate] No update available - latestVersion=${info?.version}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-not-available");
  }
});

autoUpdater.on("download-progress", (progress) => {
  log.info(`[AutoUpdate] Download progress - ${Math.round(progress.percent)}%`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  }
});

autoUpdater.on("update-downloaded", (info) => {
  log.info(`[AutoUpdate] Update downloaded - version=${info.version}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-downloaded");
  }
});

autoUpdater.on("error", (err) => {
  log.error(`[AutoUpdate] AutoUpdater error: ${err.message}`, err.stack || "");
  monitoring.captureException(err, { operation: "autoUpdater.error" });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-error", { message: err.message });
  }
});

ipcMain.handle("check-for-updates", async () => {
  log.info("[AutoUpdate] IPC check-for-updates received");
  if (!app.isPackaged) {
    log.warn("[AutoUpdate] App is not packaged - skipping update check");
    return { dev: true };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    log.error(`[AutoUpdate] autoUpdater.checkForUpdates() threw: ${e.message}`, e.stack || "");
    monitoring.captureException(e, { operation: "autoUpdater.manualCheck" });
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("download-update", () => {
  log.info("[AutoUpdate] IPC download-update received - starting download");
  autoUpdater.downloadUpdate();
  return { ok: true };
});

ipcMain.handle("install-update", () => {
  log.info("[AutoUpdate] IPC install-update received - launching installer independently");

  // Ã¢â€â‚¬Ã¢â€â‚¬ Why quitAndInstall() alone doesn't work with a tray app Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  // quitAndInstall() relies on Electron's app.quit() flow, which fires
  // will-quit, before-quit, window-all-closed, etc.  When the app lives in
  // the tray (window hidden, process still running) those events don't
  // cleanly terminate all native handles fast enough.  NSIS checks for the
  // running process right after spawning and shows "cannot be closed" if it
  // finds it still alive.
  //
  // Solution: find the already-downloaded installer in electron-updater's
  // temp cache, spawn it as a fully detached independent process, then
  // hard-exit THIS process immediately.  The installer runs on its own Ã¢â‚¬â€
  // it no longer needs this process to be alive.
  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  const { spawn } = require("child_process");
  const os = require("os");

  // electron-updater stores the downloaded installer in the OS temp dir.
  // The file name matches the artifactName pattern from package.json.
  // We search for it rather than hardcode the version.
  function findDownloadedInstaller() {
    // Ask electron-updater for the cached path via its internal
    // _downloadedUpdateHelper (works for electron-updater v6.x). On macOS this
    // is usually the downloaded zip; on Windows it can be the NSIS installer.
    try {
      const helper = autoUpdater._downloadedUpdateHelper;
      if (helper && helper.downloadedFileInfo && helper.downloadedFileInfo.path) {
        return helper.downloadedFileInfo.path;
      }
    } catch (_) {}

    if (process.platform === "win32") {
      const tmpDir = os.tmpdir();
      try {
        const files = fs.readdirSync(tmpDir);
        // Match e.g. "Taager.Orders.Setup.1.0.15.exe"
        const match = files
          .filter(f => /^Taager\.Orders\.Setup\.\d+\.\d+\.\d+\.exe$/i.test(f))
          .sort() // take the highest version if multiple
          .pop();
        if (match) return path.join(tmpDir, match);
      } catch (_) {}
    }

    return null;
  }

  function uniqueDownloadPath(filename) {
    const downloadsDir = app.getPath("downloads") || path.join(os.homedir(), "Downloads");
    fs.mkdirSync(downloadsDir, { recursive: true });
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = path.join(downloadsDir, filename);
    let i = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(downloadsDir, `${base}-${i++}${ext}`);
    }
    return candidate;
  }

  function killChildProcess(child) {
    if (!child || child.killed) return;
    try { child.kill("SIGKILL"); } catch (_) {}
  }

  function launchInstallerAfterExit(installerPath) {
    if (process.platform !== "win32") {
      const child = spawn(installerPath, ["--updated"], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      child.unref();
      return child;
    }

    // Start NSIS from a detached helper after this process has disappeared.
    // Launching the installer directly races NSIS's "is the app still open?"
    // check and intermittently shows "Taager Orders cannot be closed".
    const comspec = process.env.ComSpec || "cmd.exe";
    const quotedInstaller = `"${String(installerPath).replace(/"/g, '""')}"`;
    const command = `ping 127.0.0.1 -n 3 > nul & start "" ${quotedInstaller} --updated`;
    const child = spawn(comspec, ["/d", "/s", "/c", command], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return child;
  }

  if (process.platform === "darwin") {
    const installerPath = findDownloadedInstaller();
    log.info("[AutoUpdate] macOS downloaded update path:", installerPath || "NOT FOUND");
    if (installerPath && fs.existsSync(installerPath)) {
      try {
        const sourceName = path.basename(installerPath);
        const ext = path.extname(sourceName) || ".zip";
        const targetName = /^Taager\.Orders/i.test(sourceName)
          ? sourceName
          : `Taager.Orders-${app.getVersion()}-mac-update${ext}`;
        const targetPath = uniqueDownloadPath(targetName);
        fs.copyFileSync(installerPath, targetPath);
        shell.showItemInFolder(targetPath);
        log.info("[AutoUpdate] macOS update copied to Downloads:", targetPath);
        return {
          ok: true,
          manual: true,
          platform: "darwin",
          path: targetPath,
          fileName: path.basename(targetPath),
        };
      } catch (copyErr) {
        log.error("[AutoUpdate] macOS update copy failed:", copyErr.message);
        monitoring.captureException(copyErr, { operation: "autoUpdater.macManualCopy" });
        return { ok: false, error: copyErr.message };
      }
    }

    try {
      log.warn("[AutoUpdate] macOS cached update not found; falling back to quitAndInstall");
      autoUpdater.quitAndInstall(false, true);
      return { ok: true, fallbackQuitAndInstall: true, platform: "darwin" };
    } catch (installErr) {
      log.error("[AutoUpdate] macOS quitAndInstall fallback failed:", installErr.message);
      monitoring.captureException(installErr, { operation: "autoUpdater.macQuitAndInstallFallback" });
      return { ok: false, error: installErr.message };
    }
  }

  // 1. Tear everything down
  app.isQuitting = true;
  app.__sentryFlushed = true;
  clearAutoRun();

  const toKill = botChildren.length ? botChildren : (currentBotChild ? [currentBotChild] : []);
  for (const child of toKill) killChildProcess(child);
  if (typeof dashboardFetchChildren !== "undefined") {
    for (const child of dashboardFetchChildren) killChildProcess(child);
    dashboardFetchChildren.clear();
  }
  if (typeof manualChromeChildren !== "undefined") {
    for (const child of manualChromeChildren) killChildProcess(child);
    manualChromeChildren.clear();
  }
  if (typeof pendingGoogleLoginRequests !== "undefined") {
    pendingGoogleLoginRequests.clear();
  }
  currentBotChild = null;
  botChildren = [];
  botRunning = false;

  try {
    if (tray && !tray.isDestroyed()) {
      tray.removeAllListeners();
      tray.destroy();
    }
  } catch (_) {}
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeAllListeners("close");
      mainWindow.destroy();
    }
  } catch (_) {}

  // 2. Try to find and launch the installer ourselves (detached, independent)
  const installerPath = findDownloadedInstaller();
  log.info("[AutoUpdate] Installer path found:", installerPath || "NOT FOUND Ã¢â‚¬â€ falling back to quitAndInstall");

  if (installerPath && fs.existsSync(installerPath)) {
    try {
      // "--updated" tells electron-builder's NSIS script this was launched by
      // the app, while the helper delays the actual installer start until exit.
      launchInstallerAfterExit(installerPath);
      log.info("[AutoUpdate] Delayed installer helper spawned, exiting now");
    } catch (spawnErr) {
      log.error("[AutoUpdate] Failed to spawn installer:", spawnErr.message);
      // Fall through to quitAndInstall below
    }
    // Hard-exit immediately; the helper will start the installer after exit.
    process.exit(0);
    return;
  }

  // 3. Fallback: couldn't find installer file, use quitAndInstall + hard exit
  log.warn("[AutoUpdate] Installer file not found, falling back to quitAndInstall");
  try { autoUpdater.quitAndInstall(false, true); } catch (_) {}
  setTimeout(() => process.exit(0), 500);
});

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-app-platform", () => process.platform);

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// IPC Ã¢â‚¬â€ Window
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
ipcMain.on("window-minimize", () => mainWindow.minimize());
ipcMain.on("window-maximize", () => { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
ipcMain.on("window-close", () => mainWindow.hide());
ipcMain.handle("get-app-zoom", () => getSavedAppZoom());
ipcMain.on("increase-app-zoom", () => stepAppZoom(1));
ipcMain.on("decrease-app-zoom", () => stepAppZoom(-1));
ipcMain.on("reset-app-zoom", () => applyAppZoom(DEFAULT_APP_ZOOM));

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// IPC Ã¢â‚¬â€ License (server-based, auto device lock)
// Handlers registered below after _checkLicenseImpl is defined.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// IPC Ã¢â‚¬â€ Credentials Ã¢â‚¬â€ Multi-Account Edition
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

const OFFLINE_GRACE_MS = 48 * 60 * 60 * 1000;
const STARTUP_LICENSE_FAST_PATH_MS = 6 * 60 * 60 * 1000;
const LICENSE_WARNING_DAYS = 3;

function _saveLastValidResult(result) {
  const previous = licenseStore.get("lastValidResult", null);
  const { adminNotification, ...nextResult } = result || {};
  const canMerge = previous && previous.key && nextResult.key && previous.key === nextResult.key;
  const persistedResult = canMerge ? { ...previous, ...nextResult } : nextResult;
  licenseStore.set("lastValidResult", persistedResult);
  licenseStore.set("lastValidAt", Date.now());
}

function _getOfflineGraceResult() {
  const lastValidAt = licenseStore.get("lastValidAt", 0);
  const lastResult  = licenseStore.get("lastValidResult", null);
  if (!lastResult || !lastResult.valid) return null;
  const age = Date.now() - lastValidAt;
  if (age > OFFLINE_GRACE_MS) return null;
  const cached = evaluateCachedLicense(lastResult);
  if (cached.expired) {
    log.warn("[License] Offline grace rejected because the known license expiry has passed.");
    return null;
  }
  // Old installs did not persist expiresAt. Never extend an unverifiable
  // result through offline grace; require one authoritative check first.
  if (!cached.hasKnownExpiry) {
    log.warn("[License] Offline grace rejected for legacy cache without expiry metadata.");
    return null;
  }
  const hoursLeft = Math.ceil((OFFLINE_GRACE_MS - age) / 3600000);
  log.warn(`[License] Offline grace active - last valid ${Math.round(age / 60000)} min ago, ${hoursLeft}h left`);
  return { ...cached.result, offline: true };
}

function _getStartupCachedLicenseResult() {
  const key = licenseStore.get("licenseKey", "");
  const lastValidAt = licenseStore.get("lastValidAt", 0);
  const lastResult = licenseStore.get("lastValidResult", null);
  if (!key || !lastResult || !lastResult.valid || lastResult.key !== key) return null;
  if ((Date.now() - lastValidAt) > STARTUP_LICENSE_FAST_PATH_MS) return null;
  const cached = evaluateCachedLicense(lastResult);
  if (cached.expired) return null;
  if (!cached.hasKnownExpiry) return null;
  // A license near its boundary must be checked before rendering so the UI
  // never shows a stale renewal warning and then replaces it with Expired.
  if (isInsideWarningWindow(cached, LICENSE_WARNING_DAYS)) return null;
  return { ...cached.result, startupCached: true };
}

const ADMIN_COMMAND_REFRESH_MIN_INTERVAL_MS = 15 * 1000;
let adminCommandRefreshInFlight = false;
let adminCommandRefreshLastAt = 0;

function _scheduleAdminCommandRefresh(reason = "cached-license") {
  if (adminCommandRefreshInFlight) return;
  if (Date.now() - adminCommandRefreshLastAt < ADMIN_COMMAND_REFRESH_MIN_INTERVAL_MS) return;
  adminCommandRefreshInFlight = true;
  setTimeout(() => {
    _checkLicenseImpl(true)
      .catch((err) => log.warn("[License] Background admin command check failed:", err?.message || err))
      .finally(() => {
        adminCommandRefreshLastAt = Date.now();
        adminCommandRefreshInFlight = false;
      });
  }, 0);
  log.info("[License] Scheduled background admin command check", { reason });
}

function _handleForceFlush() {
  log.warn("[License] Force flush received Ã¢â‚¬â€ wiping all local data per admin request.");
  try { store.clear(); } catch (_) {}
  try { analyticsStore.clear(); } catch (_) {}
  try { dashboardStore.clear(); } catch (_) {}
  clearRunResultsFiles();
  // licenseStore intentionally NOT cleared Ã¢â‚¬â€ customer can re-enter their existing key
  // Bust in-memory caches
  _licenseCache = null; _licenseCacheAt = 0;
  _credCache = null; _credCacheAt = 0;
  // Wipe bot profiles
  const userData = app.getPath("userData");
  try {
    const legacy = path.join(userData, "bot-profile");
    if (fs.existsSync(legacy)) fs.rmSync(legacy, { recursive: true, force: true });
  } catch (_) {}
  try {
    fs.readdirSync(userData)
      .filter(f => f.startsWith("bot-profile-"))
      .forEach(f => { try { fs.rmSync(path.join(userData, f), { recursive: true, force: true }); } catch (_) {} });
  } catch (_) {}
  // Notify renderer Ã¢â‚¬â€ it handles navigation to the license screen
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("force-flush");
  }
}

const RUNTIME_CACHE_RESET_TARGETS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "Shared Dictionary",
  "ShaderCache",
  "GrShaderCache",
  "blob_storage",
];

function _clearRuntimeCacheFolders(reason = "admin-cache-reset") {
  const userData = app.getPath("userData");
  const cleared = [];
  const failed = [];
  for (const name of RUNTIME_CACHE_RESET_TARGETS) {
    const target = path.join(userData, name);
    try {
      if (!fs.existsSync(target)) continue;
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
      cleared.push(name);
    } catch (err) {
      failed.push({ name, error: err?.message || String(err) });
    }
  }
  log.warn("[License] Runtime cache repair finished", { reason, userData, cleared, failed });
  return { userData, cleared, failed };
}

function _handleResetCache(reason = "admin-cache-reset") {
  log.warn("[License] Reset cache received - wiping local metrics, dashboard cache, and runtime cache.", { reason });
  try { analyticsStore.clear(); } catch (_) {}
  try { dashboardStore.clear(); } catch (_) {}
  clearRunResultsFiles();
  invalidateAnalyticsRunsCache();
  analyticsSnapshotSyncCacheKey = "";
  dashboardQueryService.clearCache();
  _clearRuntimeCacheFolders(reason);
  try {
    session.defaultSession.clearCache().catch((err) => {
      log.warn("[License] Electron cache clear failed:", err?.message || err);
    });
  } catch (err) {
    log.warn("[License] Electron cache clear unavailable:", err?.message || err);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("reset-cache");
  }
}

async function _checkLicenseImpl(bustCache) {
  const key = licenseStore.get("licenseKey", "");
  if (!key) return { valid: false, reason: "No license key." };
  if (!bustCache && _licenseCache && (Date.now() - _licenseCacheAt) < LICENSE_CACHE_TTL_MS) {
    const cached = evaluateCachedLicense(_licenseCache);
    if (!cached.expired) {
      _licenseCache = cached.result;
      _scheduleAdminCommandRefresh("memory-license-cache");
      return _licenseCache;
    }
    _licenseCache = null;
    _licenseCacheAt = 0;
  }
  if (!bustCache) {
    const startupCached = _getStartupCachedLicenseResult();
    if (startupCached) {
      _licenseCache = startupCached;
      _licenseCacheAt = Date.now();
      _scheduleAdminCommandRefresh("startup-license-cache");
      return startupCached;
    }
  }
  if (bustCache) {
    _licenseCache = null;
    _licenseCacheAt = 0;
    _credCache = null;
    _credCacheAt = 0;
  }

  try {
    const r = await supabaseRpc("taager_check_license_with_identity", {
      p_license_key:    key,
      p_machine_uuid:   _getOrCreateMachineUUID(),
      p_device_id:      getDeviceFingerprint(),
      p_account_idents: _buildAccountIdents(),
    });
    if (!r || !r.valid) {
      if (!r || r.reason === "License not found on server.") {
        log.warn(`[License] Key "${key}" not found on server. Clearing local licenseKey.`);
        licenseStore.delete("licenseKey");
      }
      return {
        valid: false,
        key,
        customerName: licenseStore.get("customerName", "") || null,
        daysLeft: licenseStore.get("daysLeft", null),
        reason: r?.reason || "License not found on server.",
      };
    }

    // Handle force flush: wipe local data and notify renderer.
    // Return valid:true here so the IPC caller doesn't also trigger the expired overlay Ã¢â‚¬â€
    // the renderer navigates to the license screen exclusively via the force-flush event.
    if (r.force_flush) {
      _handleForceFlush();
      return { valid: true, forceFlush: true };
    }
    if (r.reset_cache) {
      _handleResetCache();
      return { valid: true, resetCache: true };
    }

    const expiresAt = r.expires_at || null;
    const daysLeft = evaluateCachedLicense({ expiresAt }).result.daysLeft ?? null;
    const customerName = r.customer_name || null;
    if (customerName) licenseStore.set("customerName", customerName);
    if (daysLeft !== null) licenseStore.set("daysLeft", daysLeft);
    licenseStore.set("allowReset", false);
    if (r.max_accounts) licenseStore.set("maxAccounts", r.max_accounts);
    if (r.max_devices) licenseStore.set("maxDevices", r.max_devices);
    if (r.active_devices !== undefined) licenseStore.set("activeDevices", r.active_devices);
    const operationsSuiteEnabled = r.analytics_enabled !== false || r.operations_enabled !== false;
    const teamLeaderEnabled = r.team_leader_enabled === true;
    licenseStore.set("analyticsEnabled",  operationsSuiteEnabled);
    licenseStore.set("operationsEnabled", operationsSuiteEnabled);
    licenseStore.set("dashboardEnabled",  r.dashboard_enabled === true || teamLeaderEnabled);
    licenseStore.set("teamLeaderEnabled", teamLeaderEnabled);
    const adminNotification = await getActiveAdminNotification(key);
    const result = {
      valid: true, key, daysLeft, expiresAt, customerName, allowReset: false,
      maxDevices: r.max_devices || licenseStore.get("maxDevices", 1),
      activeDevices: r.active_devices || licenseStore.get("activeDevices", 1),
      analyticsEnabled:  operationsSuiteEnabled,
      operationsEnabled: operationsSuiteEnabled,
      dashboardEnabled:  r.dashboard_enabled === true || teamLeaderEnabled,
      teamLeaderEnabled,
      adminNotification,
    };
    _licenseCache = result;
    _licenseCacheAt = Date.now();
    _saveLastValidResult(result);
    return result;
  } catch (e) {
    log.warn("[License] License check failed:", e.message);
    const grace = _getOfflineGraceResult();
    if (grace) return grace;
    const cached = evaluateCachedLicense(licenseStore.get("lastValidResult", null));
    return {
      valid: false,
      key,
      customerName: licenseStore.get("customerName", "") || null,
      daysLeft: cached.expired ? 0 : licenseStore.get("daysLeft", null),
      reason: cached.expired
        ? "License expired. Please renew."
        : "Cannot reach license server. Check your internet connection.",
    };
  }
}

ipcMain.handle("check-license", async () => _checkLicenseImpl(false));
ipcMain.handle("check-license-nocache", async () => _checkLicenseImpl(true));
ipcMain.handle("repair-local-cache", async () => {
  _handleResetCache("local-clear-cache");
  return { ok: true };
});
ipcMain.handle("get-license-credential-backup-status", async () => getLicenseCredentialBackupStatus());
ipcMain.handle("get-license-credential-backup-prompt-status", async () => getLicenseCredentialBackupPromptStatus());
ipcMain.handle("backup-license-credentials-now", async () => backupLicenseCredentialsNow());
ipcMain.handle("restore-license-credentials", async () => restoreLicenseCredentialsFromBackup());
ipcMain.handle("submit-license", async (_, key) => {
  const clean = key.trim().toUpperCase();
  if (!isValidKeyFormat(clean)) return { success: false, reason: "Invalid format. Keys look like: TAAGER-XXXX-XXXX-XXXX-XXXX" };
  try {
    const r = await supabaseRpc("taager_check_license_with_identity", {
      p_license_key:    clean,
      p_machine_uuid:   _getOrCreateMachineUUID(),
      p_device_id:      getDeviceFingerprint(),
      p_account_idents: _buildAccountIdents(),
    });
    if (!r || !r.valid) return { success: false, reason: r?.reason || "License key not found. Contact support." };
    const expiresAt = r.expires_at || null;
    const daysLeft = evaluateCachedLicense({ expiresAt }).result.daysLeft ?? null;
    const customerName = r.customer_name || null;
    licenseStore.set("licenseKey", clean);
    if (customerName) licenseStore.set("customerName", customerName);
    if (daysLeft !== null) licenseStore.set("daysLeft", daysLeft);
    if (r.max_accounts) licenseStore.set("maxAccounts", r.max_accounts);
    if (r.max_devices) licenseStore.set("maxDevices", r.max_devices);
    if (r.active_devices !== undefined) licenseStore.set("activeDevices", r.active_devices);
    const operationsSuiteEnabled = r.analytics_enabled !== false || r.operations_enabled !== false;
    const teamLeaderEnabled = r.team_leader_enabled === true;
    licenseStore.set("analyticsEnabled",  operationsSuiteEnabled);
    licenseStore.set("operationsEnabled", operationsSuiteEnabled);
    licenseStore.set("dashboardEnabled",  r.dashboard_enabled === true || teamLeaderEnabled);
    licenseStore.set("teamLeaderEnabled", teamLeaderEnabled);
    _licenseCache = null;
    _licenseCacheAt = 0;
    _saveLastValidResult({ valid: true, key: clean, daysLeft, expiresAt, customerName });
    recordLicensePresence();
    return {
      success: true,
      daysLeft,
      customerName,
      maxDevices: r.max_devices || licenseStore.get("maxDevices", 1),
      activeDevices: r.active_devices || licenseStore.get("activeDevices", 1),
    };
  } catch {
    return { success: false, reason: "Cannot reach server. Check your internet connection." };
  }
});

// Helper: get max accounts allowed by this license
async function getMaxAccounts() {
  const key = licenseStore.get("licenseKey", "");
  if (!key) return 1;
  try {
    const res = await supabaseRpc("taager_get_max_accounts", { p_license_key: key });
    if (res && res.max_accounts) return res.max_accounts;
  } catch {}
  return licenseStore.get("maxAccounts", 1);
}

// Short-lived in-memory cache for get-credentials Ã¢â‚¬â€ eliminates the duplicate
// Supabase request when init() and afterLicense() both call it within milliseconds.
let _credCache = null;
let _credCacheAt = 0;
const CRED_CACHE_TTL_MS = 15 * 1000; // 15 seconds

function removeAccountLocalArtifacts(accountId) {
  const id = String(accountId || "").trim();
  if (!id || id === "__single__" || id === "legacy") return;
  try { store.delete(`pwd_easy_${id}`); } catch (_) {}
  try { store.delete(`pwd_lightfunnels_${id}`); } catch (_) {}
  try { store.delete(`pwd_taager_${id}`); } catch (_) {}
  try {
    const accounts = dashboardStore.get("accounts", {});
    if (accounts && accounts[id]) {
      delete accounts[id];
      dashboardStore.set("accounts", accounts);
      bumpDashboardSnapshotRevision();
    }
  } catch (_) {}
  try {
    const runs = analyticsStore.get("runs", []);
    if (Array.isArray(runs)) {
      const filtered = runs.filter(run => String(run && run.accountId || "") !== id);
      if (filtered.length !== runs.length) {
        analyticsStore.set("runs", filtered);
        invalidateAnalyticsRunsCache();
      }
    }
  } catch (_) {}
  try {
    const memory = dashboardStore.get("aiAssistantState.v1", null);
    if (memory && memory.businessMemoryByAccount && memory.businessMemoryByAccount[id]) {
      delete memory.businessMemoryByAccount[id];
      dashboardStore.set("aiAssistantState.v1", memory);
    }
  } catch (_) {}
  try {
    const profilePath = path.join(app.getPath("userData"), `bot-profile-${id}`);
    if (fs.existsSync(profilePath)) fs.rmSync(profilePath, { recursive: true, force: true });
  } catch (_) {}
}

function persistAccountsAfterAdminDelete(nextAccounts) {
  const accounts = Array.isArray(nextAccounts) ? nextAccounts : [];
  store.set("accounts", accounts);
  const remainingIds = accounts.map(a => a.id);
  const runnableIds = accounts.filter(a => !isStaticAccount(a)).map(a => a.id);
  const savedAutoRunIds = store.get("autoRunAccountIds", []);
  if (Array.isArray(savedAutoRunIds)) {
    store.set("autoRunAccountIds", savedAutoRunIds.filter(id => runnableIds.includes(id)));
  }
  store.set("unlockedAccountIds", store.get("unlockedAccountIds", []).filter(id => remainingIds.includes(id)));

  const first = accounts[0];
  if (first) {
    const firstCmsProvider = cmsProviderOf(first);
    const firstIsEasyOrders = firstCmsProvider === "easyorders";
    const firstIsLightFunnels = firstCmsProvider === "lightfunnels";
    store.set("cmsProvider", firstCmsProvider);
    store.set("easyEmail", firstIsEasyOrders ? first.easyEmail || "" : "");
    store.set("easyPassword", firstIsEasyOrders ? store.get(`pwd_easy_${first.id}`, "") : "");
    store.set("easyStore", firstIsEasyOrders ? first.easyStore || "" : "");
    store.set("lightfunnelsEmail", firstIsLightFunnels ? first.lightfunnelsEmail || "" : "");
    store.set("lightfunnelsPassword", firstIsLightFunnels ? store.get(`pwd_lightfunnels_${first.id}`, "") : "");
    store.set("lightfunnelsAccountName", firstIsLightFunnels ? first.lightfunnelsAccountName || "" : "");
    store.set("lightfunnelsLoginMethod", firstIsLightFunnels ? lightfunnelsLoginMethodOf(first) : "email");
    store.set("taagerLoginMethod", first.taagerLoginMethod || "email");
    store.set("taagerEmail", first.taagerEmail || "");
    store.set("taagerPhone", first.taagerPhone || "");
    store.set("taagerPassword", store.get(`pwd_taager_${first.id}`, ""));
    store.set("taagerCountry", first.taagerCountry || "sa");
    store.set("taagerAffiliateCode", first.taagerAffiliateCode || "");
  } else {
    ["cmsProvider", "easyEmail", "easyPassword", "easyStore", "lightfunnelsEmail", "lightfunnelsPassword", "lightfunnelsAccountName", "lightfunnelsLoginMethod", "taagerLoginMethod", "taagerEmail", "taagerPhone", "taagerPassword", "taagerCountry", "taagerAffiliateCode"].forEach(key => {
      store.delete(key);
    });
  }
  invalidateAnalyticsRunsCache();
}

function getLocalCredentialsSnapshot() {
  const rawAccounts = store.get("accounts", null);
  let accounts = rawAccounts || [];
  const unlockedAccountIds = store.get("unlockedAccountIds", []);
  const accountsWithStatus = accounts.map(a => ({ ...a, locked: !unlockedAccountIds.includes(a.id) && accounts.length > 0 }));
  const hasAny = accountsWithStatus.length > 0;
  return {
    hasCredentials:   hasAny,
    accounts:         accountsWithStatus,
    remoteAccountSlots: null,
    maxAccounts:      licenseStore.get("maxAccounts", 1),
    analyticsEnabled:  licenseStore.get("analyticsEnabled",  true),
    operationsEnabled: licenseStore.get("operationsEnabled", true),
    dashboardEnabled:  licenseStore.get("dashboardEnabled",  false),
    teamLeaderEnabled: licenseStore.get("teamLeaderEnabled", false),
    // Only return legacy flat fields when real accounts exist Ã¢â‚¬â€ avoids ghost account resurrection
    easyEmail:        hasAny ? store.get("easyEmail",       "") : "",
    easyStore:        hasAny ? store.get("easyStore",       "") : "",
    taagerEmail:      hasAny ? store.get("taagerEmail",     store.get("taagerEmail", "")) : "",
    taagerPhone:      hasAny ? store.get("taagerPhone",     "") : "",
    taagerCountry:    hasAny ? store.get("taagerCountry",   store.get("taagerCountry", "sa")) : "sa",
    taagerLoginMethod: hasAny ? store.get("taagerLoginMethod", "email") : "email",
    taagerAffiliateCode: hasAny ? store.get("taagerAffiliateCode", "") : "",
    autoRun:          store.get("autoRun",         false),
    autoRunInterval:  store.get("autoRunInterval", 30),
    autoRunAccountIds: store.get("autoRunAccountIds", []),
    launchMinimized:  store.get("launchMinimized", false),
    autoConfirm:      store.get("autoConfirm",     false),
    missingOrdersUploadEnabled: store.get("missingOrdersUploadEnabled", false),
    easyOrdersAffiliateRecoveryEnabled: store.get("easyOrdersAffiliateRecoveryEnabled", false),
    startupCached:    true,
  };
}

ipcMain.handle("get-startup-state", async () => {
  const license = await _checkLicenseImpl(false);
  const credentials = getLocalCredentialsSnapshot();
  _credCache = credentials;
  _credCacheAt = Date.now();
  return {
    settings: {
      theme: store.get("theme", "dark"),
      lang:  store.get("lang",  "ar"),
      appZoom: getSavedAppZoom(),
    },
    license,
    credentials,
  };
});

ipcMain.handle("get-credentials", async () => {
  // Serve from cache if fresh
  if (_credCache && (Date.now() - _credCacheAt) < CRED_CACHE_TTL_MS) {
    return _credCache;
  }

  const rawAccounts = store.get("accounts", null);
  const maxAccounts = await getMaxAccounts();
  const legacyEmail = store.get("easyEmail", "");
  let accounts = rawAccounts || [];
  let remoteAccountSlots = null;

  // Fetch per-account lock status from license_accounts table
  let licenseRows = null;
  let lockedHashes = [];
  let unlockedAccountIds = store.get("unlockedAccountIds", []); // admin-unlocked accounts (local cache)
  const licKey = licenseStore.get("licenseKey", "");
  if (licKey) {
    try {
      const rows = await supabaseRpc("taager_get_license_accounts", { p_license_key: licKey });
      if (Array.isArray(rows)) {
        licenseRows = rows;
        if (accounts.length === 0 && rows.length > 0) {
          remoteAccountSlots = summarizeRemoteLicenseAccounts(rows);
        }
        if (accounts.length > 0) {
          const keptAccounts = [];
          const deletedAccounts = [];
          for (const account of accounts) {
            const hash = accountHash(account);
            const hasServerSlot = rows.some(row => row.account_hash === hash || licenseRowMatchesAccount(row, account));
            if (hasServerSlot) keptAccounts.push(account);
            else deletedAccounts.push(account);
          }
          if (deletedAccounts.length > 0) {
            for (const account of deletedAccounts) removeAccountLocalArtifacts(account.id);
            accounts = keptAccounts;
            persistAccountsAfterAdminDelete(accounts);
          }
        }
        lockedHashes = rows.filter(r => !r.unlocked).map(r => r.account_hash);
        // Update local cache of unlocked accounts
        unlockedAccountIds = accounts
          .filter(a => {
            const hash = accountHash(a);
            const exactRow = rows.find(r => r.account_hash === hash);
            if (exactRow) return !!exactRow.unlocked;
            const identityRows = rows.filter(r => licenseRowMatchesAccount(r, a));
            return identityRows.length > 0 && identityRows.every(r => !!r.unlocked);
          })
          .map(a => a.id);
        store.set("unlockedAccountIds", unlockedAccountIds);

        // If DB returned zero rows but local accounts exist with credentials,
        // it means admin used "Clear All Slots" Ã¢â‚¬â€ treat all existing accounts as locked
        // so they can't be edited until admin explicitly unlocks them.
        if (rows.length === 0 && accounts.length > 0) {
          lockedHashes = accounts.map(a => accountHash(a));
          unlockedAccountIds = [];
          store.set("unlockedAccountIds", []);
        }
      }
    } catch {
      // Offline: use local cache
    }
  }

  // Enrich accounts with lock status
  const accountsWithStatus = accounts.map(a => {
    const hash = accountHash(a);
    if (Array.isArray(licenseRows)) {
      const exactRow = licenseRows.find(r => r.account_hash === hash);
      if (exactRow) return { ...a, locked: !exactRow.unlocked };
      const identityRows = licenseRows.filter(r => licenseRowMatchesAccount(r, a));
      if (identityRows.length) {
        const hasLockedDuplicate = identityRows.some(r => !r.unlocked);
        return { ...a, locked: hasLockedDuplicate };
      }
      return { ...a, locked: accounts.length > 0 };
    }
    const isLocked = lockedHashes.includes(hash);
    const isUnlocked = unlockedAccountIds.includes(a.id);
    return { ...a, locked: isLocked && !isUnlocked };
  });

  const result = {
    hasCredentials:   accountsWithStatus.length > 0 || !!legacyEmail,
    accounts:         accountsWithStatus,
    remoteAccountSlots,
    maxAccounts,
    analyticsEnabled:  licenseStore.get("analyticsEnabled",  true),
    operationsEnabled: licenseStore.get("operationsEnabled", true),
    dashboardEnabled:  licenseStore.get("dashboardEnabled",  false),
    teamLeaderEnabled: licenseStore.get("teamLeaderEnabled", false),
    // Suppress legacy flat fields when accounts array is empty Ã¢â‚¬â€ if we still return
    // easyEmail here, the renderer's loadAccounts() will resurrect a ghost account.
    easyEmail:        accountsWithStatus.length > 0 ? store.get("easyEmail",       "") : "",
    easyStore:        accountsWithStatus.length > 0 ? store.get("easyStore",       "") : "",
    taagerEmail:      accountsWithStatus.length > 0 ? store.get("taagerEmail",     store.get("taagerEmail", "")) : "",
    taagerCountry:    accountsWithStatus.length > 0 ? store.get("taagerCountry",   store.get("taagerCountry", "sa")) : "sa",
    taagerLoginMethod: accountsWithStatus.length > 0 ? store.get("taagerLoginMethod", "email") : "email",
    taagerPhone:      accountsWithStatus.length > 0 ? store.get("taagerPhone",     "") : "",
    taagerAffiliateCode: accountsWithStatus.length > 0 ? store.get("taagerAffiliateCode", "") : "",
    autoRun:          store.get("autoRun",         false),
    autoRunInterval:  store.get("autoRunInterval", 30),
    autoRunAccountIds: store.get("autoRunAccountIds", []),
    launchMinimized:  store.get("launchMinimized", false),
    autoConfirm:      store.get("autoConfirm",     false),
    missingOrdersUploadEnabled: store.get("missingOrdersUploadEnabled", false),
    easyOrdersAffiliateRecoveryEnabled: store.get("easyOrdersAffiliateRecoveryEnabled", false),
  };
  _credCache = result;
  _credCacheAt = Date.now();
  return result;
});

// Legacy single-account save (kept for backward compat with any older calls)
ipcMain.handle("save-credentials", async (_, creds) => {
  store.set("easyEmail",    creds.easyEmail    || "");
  store.set("easyPassword", creds.easyPassword || "");
  store.set("easyStore",    creds.easyStore    || "");
  store.set("taagerEmail",    creds.taagerEmail    || "");
  store.set("taagerPassword", creds.taagerPassword || "");
  store.set("taagerCountry",  creds.taagerCountry  || "sa");
  // taager* keys remain only as storage/licensing compatibility aliases.
  // New Taager wiring reads the explicit taager* fields below.
  store.set("taagerLoginMethod", creds.taagerLoginMethod || creds.taagerLoginMethod || "email");
  store.set("taagerEmail",    creds.taagerEmail    || creds.taagerEmail    || "");
  store.set("taagerPhone",    creds.taagerPhone    || creds.taagerPhone    || "");
  store.set("taagerPassword", creds.taagerPassword || creds.taagerPassword || "");
  store.set("taagerCountry",  creds.taagerCountry  || creds.taagerCountry  || "sa");
  store.set("taagerAffiliateCode", creds.taagerAffiliateCode || "");
  invalidateAnalyticsRunsCache();
  syncLicenseCredentialsBackup("save-credentials").catch(() => {});
  return { success: true };
});

function validateAccountCredentialsForSave(a) {
  if (isStaticAccount(a)) {
    return String(a.label || a.memberName || "").trim()
      ? { success: true }
      : { success: false, reason: "static_name_required" };
  }
  const method = taagerLoginMethodOf(a);
  const cmsProvider = cmsProviderOf(a);
  const easyPassword = a.easyPassword || (a.id ? store.get(`pwd_easy_${a.id}`, "") : "");
  const lightfunnelsPassword = a.lightfunnelsPassword || (a.id ? store.get(`pwd_lightfunnels_${a.id}`, "") : "");
  const taagerPassword = a.taagerPassword || (a.id ? store.get(`pwd_taager_${a.id}`, "") : "");
  const teamLeaderEnabled = licenseStore.get("teamLeaderEnabled", false) === true;
  const dashboardProvider = dashboardEnrichmentProviderOf(a);
  const needsCmsCredentials = !teamLeaderEnabled || dashboardProvider === cmsProvider;
  if (needsCmsCredentials && cmsProvider === "lightfunnels") {
    if (!(a.lightfunnelsAccountName || "").trim() || !(a.lightfunnelsEmail || "").trim()) {
      return { success: false, reason: "lightfunnels_credentials_required" };
    }
    if (lightfunnelsLoginMethodOf(a) === "email" && !lightfunnelsPassword) {
      return { success: false, reason: "lightfunnels_credentials_required" };
    }
  } else if (needsCmsCredentials && (!(a.easyStore || "").trim() || !(a.easyEmail || "").trim() || !easyPassword)) {
    return { success: false, reason: "easy_credentials_required" };
  }
  if (!(a.taagerAffiliateCode || "").trim()) {
    return { success: false, reason: "taager_merchant_id_required" };
  }
  if (method === "phone" ? !(a.taagerPhone || "").trim() : !(a.taagerEmail || "").trim()) {
    return { success: false, reason: method === "phone" ? "taager_phone_required" : "taager_email_required" };
  }
  if (method !== "google" && !taagerPassword) {
    return { success: false, reason: "taager_password_required" };
  }
  if (missedOrdersDestinationOf(a) === "second_taager_cart") {
    const secondMethod = secondTaagerLoginMethodOf(a);
    const secondPassword = a.secondTaagerPassword || (a.id ? store.get(`pwd_second_taager_${a.id}`, "") : "");
    const primaryMerchant = taagerMerchantIdentityOf(a);
    const secondMerchant = secondTaagerMerchantIdentityOf(a);
    if (!(a.secondTaagerAffiliateCode || "").trim()) {
      return { success: false, reason: "second_taager_merchant_id_required" };
    }
    if (primaryMerchant && secondMerchant && primaryMerchant === secondMerchant) {
      return { success: false, reason: "second_taager_same_as_primary" };
    }
    if (secondMethod === "phone" ? !(a.secondTaagerPhone || "").trim() : !(a.secondTaagerEmail || "").trim()) {
      return { success: false, reason: secondMethod === "phone" ? "second_taager_phone_required" : "second_taager_email_required" };
    }
    if (secondMethod !== "google" && !secondPassword) {
      return { success: false, reason: "second_taager_password_required" };
    }
  }
  return { success: true };
}

function safeAccountForStorage(a) {
  const cmsProvider = cmsProviderOf(a);
  const dashboardProvider = dashboardEnrichmentProviderOf(a);
  return {
    id:         a.id,
    accountType: isStaticAccount(a) ? "static" : "live",
    memberName: String(a.memberName || "").trim(),
    label:      a.label || cmsDisplayNameOf(a) || cmsEmailOf(a) || a.taagerEmail || a.taagerPhone || "",
    licenseAccountHash: a.licenseAccountHash && a.licenseIdentityKey === accountIdentityKey(a) ? a.licenseAccountHash : "",
    licenseIdentityKey: a.licenseAccountHash && a.licenseIdentityKey === accountIdentityKey(a) ? a.licenseIdentityKey : "",
    cmsProvider,
    easyEmail:  a.easyEmail,
    easyStore:  a.easyStore  || "",
    missingOrdersStoreName: String(a.missingOrdersStoreName || "").trim(),
    lightfunnelsAccountName: a.lightfunnelsAccountName || "",
    lightfunnelsLoginMethod: lightfunnelsLoginMethodOf(a),
    lightfunnelsEmail: a.lightfunnelsEmail || "",
    dashboardEnrichmentProvider: dashboardProvider === "lightfunnels" || dashboardProvider === "easyorders" ? dashboardProvider : "none",
    easyOrdersLookbackDays: Number(a.easyOrdersLookbackDays || 60),
    taagerEmail:  a.taagerEmail,
    taagerAffiliateCode: a.taagerAffiliateCode || "",
    taagerCountry: a.taagerCountry || "sa",
    taagerLoginMethod: a.taagerLoginMethod || "email",
    taagerEmail: a.taagerEmail || a.taagerEmail || "",
    taagerPhone: a.taagerPhone || "",
    taagerCountry: a.taagerCountry || a.taagerCountry || "sa",
    missedOrdersDestination: missedOrdersDestinationOf(a),
    secondTaagerCartEnabled: missedOrdersDestinationOf(a) === "second_taager_cart",
    secondTaagerLoginMethod: secondTaagerLoginMethodOf(a),
    secondTaagerEmail: a.secondTaagerEmail || "",
    secondTaagerPhone: a.secondTaagerPhone || "",
    secondTaagerCountry: a.taagerCountry || "sa",
    secondTaagerAffiliateCode: a.secondTaagerAffiliateCode || "",
  };
}

function persistAccountsWithoutDeleting(accounts, maxAccounts) {
  store.set("accounts", accounts.map(safeAccountForStorage));

  const remainingIds = accounts.map(a => a.id);
  const runnableIds = accounts.filter(a => !isStaticAccount(a)).map(a => a.id);
  const savedAutoRunIds = store.get("autoRunAccountIds", []);
  if (Array.isArray(savedAutoRunIds)) {
    store.set("autoRunAccountIds", savedAutoRunIds.filter(id => runnableIds.includes(id)));
  }
  const cachedUnlocked = store.get("unlockedAccountIds", []).filter(id => remainingIds.includes(id));
  store.set("unlockedAccountIds", cachedUnlocked);

  for (const a of accounts) {
    if (a.easyPassword) store.set(`pwd_easy_${a.id}`, a.easyPassword);
    if (a.lightfunnelsPassword) store.set(`pwd_lightfunnels_${a.id}`, a.lightfunnelsPassword);
    if (a.taagerPassword) store.set(`pwd_taager_${a.id}`, a.taagerPassword);
    if (a.taagerPassword || a.taagerPassword) store.set(`pwd_taager_${a.id}`, a.taagerPassword || a.taagerPassword);
    if (a.secondTaagerPassword) store.set(`pwd_second_taager_${a.id}`, a.secondTaagerPassword);
  }

  if (accounts[0]) {
    const first = accounts[0];
    const firstCmsProvider = cmsProviderOf(first);
    const firstIsEasyOrders = firstCmsProvider === "easyorders";
    const firstIsLightFunnels = firstCmsProvider === "lightfunnels";
    store.set("cmsProvider", firstCmsProvider);
    store.set("easyEmail",    firstIsEasyOrders ? first.easyEmail    || "" : "");
    store.set("easyPassword", firstIsEasyOrders ? first.easyPassword || store.get(`pwd_easy_${first.id}`, "") : "");
    store.set("easyStore",    firstIsEasyOrders ? first.easyStore    || "" : "");
    store.set("lightfunnelsEmail", firstIsLightFunnels ? first.lightfunnelsEmail || "" : "");
    store.set("lightfunnelsPassword", firstIsLightFunnels ? first.lightfunnelsPassword || store.get(`pwd_lightfunnels_${first.id}`, "") : "");
    store.set("lightfunnelsAccountName", firstIsLightFunnels ? first.lightfunnelsAccountName || "" : "");
    store.set("lightfunnelsLoginMethod", firstIsLightFunnels ? lightfunnelsLoginMethodOf(first) : "email");
    store.set("taagerEmail",    accounts[0].taagerEmail    || "");
    store.set("taagerPassword", accounts[0].taagerPassword || store.get(`pwd_taager_${accounts[0].id}`, ""));
    store.set("taagerCountry",  accounts[0].taagerCountry  || "sa");
    store.set("taagerLoginMethod", accounts[0].taagerLoginMethod || "email");
    store.set("taagerEmail",    accounts[0].taagerEmail    || accounts[0].taagerEmail || "");
    store.set("taagerPhone",    accounts[0].taagerPhone    || "");
    store.set("taagerPassword", accounts[0].taagerPassword || accounts[0].taagerPassword || store.get(`pwd_taager_${accounts[0].id}`, ""));
    store.set("taagerCountry",  accounts[0].taagerCountry  || accounts[0].taagerCountry || "sa");
  } else {
    ["easyEmail", "easyPassword", "easyStore", "taagerEmail", "taagerPassword",
     "taagerCountry", "taagerLoginMethod", "taagerPhone", "taagerAffiliateCode",
     "cmsProvider", "lightfunnelsEmail", "lightfunnelsPassword", "lightfunnelsAccountName",
     "lightfunnelsLoginMethod"].forEach(k => store.delete(k));
  }

  licenseStore.set("maxAccounts", maxAccounts);
  _credCache = null;
  _credCacheAt = 0;
  invalidateAnalyticsRunsCache();
}

async function syncRestoredAccountLicenseSlots(accounts, maxAccounts) {
  const licKey = licenseStore.get("licenseKey", "");
  if (!licKey) return { success: true };
  const dbRows = await supabaseRpc("taager_get_license_accounts", { p_license_key: licKey }) || [];
  const dbHashes = dbRows.map(r => r.account_hash);
  const missingAccounts = [];

  for (const account of accounts) {
    if (account.licenseAccountHash && dbHashes.includes(account.licenseAccountHash)) continue;
    const matchingRow = dbRows.find(row => licenseRowMatchesAccount(row, account));
    if (matchingRow && matchingRow.account_hash) {
      account.licenseAccountHash = matchingRow.account_hash;
      account.licenseIdentityKey = accountIdentityKey(account);
      continue;
    }
    const hash = accountHash(account);
    if (!dbHashes.includes(hash)) missingAccounts.push(account);
  }

  if (dbHashes.length + missingAccounts.length > maxAccounts) {
    return { success: false, reason: "remote_slots_full", remoteAccountSlots: summarizeRemoteLicenseAccounts(dbRows) };
  }

  for (const account of missingAccounts) {
    const hash = accountHash(account);
    const insertRes = await supabaseLicenseAccountRpc("taager_insert_license_account", {
      p_license_key: licKey,
      p_account_hash: hash,
      ...licenseAccountRpcFields(account),
      p_unlocked: false,
    });
    if (insertRes && insertRes.success === false) {
      return { success: false, reason: insertRes.reason || "license_account_sync_failed" };
    }
    account.licenseAccountHash = hash;
    account.licenseIdentityKey = accountIdentityKey(account);
  }

  return { success: true };
}

async function restoreLicenseCredentialsFromBackup() {
  const licKey = licenseStore.get("licenseKey", "");
  if (!licKey) return { success: false, reason: "no_license" };
  if ((store.get("accounts", []) || []).length > 0) {
    return { success: false, reason: "local_credentials_exist" };
  }

  const license = await _checkLicenseImpl(true);
  if (!license || !license.valid) return { success: false, reason: license && license.reason || "license_invalid" };

  let remote;
  try {
    remote = await supabaseRpc("taager_get_license_credential_backup", {
      p_license_key: licKey,
      p_machine_uuid: _getOrCreateMachineUUID(),
      p_device_id: getDeviceFingerprint(),
    });
  } catch (error) {
    log.warn("[LicenseCredentials] Restore fetch failed:", error && error.message ? error.message : error);
    return { success: false, reason: "restore_fetch_failed" };
  }

  if (!remote || remote.ok !== true) return { success: false, reason: remote && remote.reason || "restore_not_allowed" };
  if (remote.available !== true || !remote.encrypted_payload) return { success: false, reason: "no_backup" };

  let payload;
  try {
    payload = decryptLicenseCredentialBackup(remote.encrypted_payload, licKey);
  } catch (error) {
    log.warn("[LicenseCredentials] Restore decrypt failed:", error && error.message ? error.message : error);
    return { success: false, reason: "restore_decrypt_failed" };
  }

  if (!payload || payload.version !== LICENSE_CREDENTIAL_BACKUP_VERSION || !Array.isArray(payload.accounts)) {
    return { success: false, reason: "invalid_backup" };
  }

  const maxAccounts = await getMaxAccounts();
  const restoredAccounts = payload.accounts
    .slice(0, Math.max(0, maxAccounts))
    .map(normalizeRestoredCredentialAccount);

  if (!restoredAccounts.length) return { success: false, reason: "no_backup_accounts" };
  if (payload.accounts.length > maxAccounts) return { success: false, reason: "limit_reached" };

  for (const account of restoredAccounts) {
    const validation = validateAccountCredentialsForSave(account);
    if (!validation.success) return validation;
  }

  try {
    const slotSync = await syncRestoredAccountLicenseSlots(restoredAccounts, maxAccounts);
    if (!slotSync.success) return slotSync;
  } catch (error) {
    log.warn("[LicenseCredentials] Restore slot sync failed:", error && error.message ? error.message : error);
    return { success: false, reason: "license_account_sync_failed" };
  }

  persistAccountsWithoutDeleting(restoredAccounts, maxAccounts);
  _credCache = null;
  _credCacheAt = 0;
  log.info("[LicenseCredentials] Restored credential backup:", { accounts: restoredAccounts.length });
  return { success: true, accountCount: restoredAccounts.length };
}
async function syncSingleEditedAccountLicenseSlot(oldAccount, newAccount, maxAccounts) {
  const licKey = licenseStore.get("licenseKey", "");
  if (!licKey) return { success: true };

  try {
    const dbRows = await supabaseRpc("taager_get_license_accounts", { p_license_key: licKey }) || [];
    const dbHashes = dbRows.map(r => r.account_hash);
    const oldH = accountHash(oldAccount);

    if (!(newAccount.licenseAccountHash && dbHashes.includes(newAccount.licenseAccountHash))) {
      const matchingRow = dbRows.find(r => licenseRowMatchesAccount(r, newAccount));
      if (matchingRow && matchingRow.account_hash) {
        newAccount.licenseAccountHash = matchingRow.account_hash;
        newAccount.licenseIdentityKey = accountIdentityKey(newAccount);
      }
    }

    const newH = accountHash(newAccount);

    if (newH === oldH && dbHashes.includes(newH)) {
      const currentRow = dbRows.find(row => row.account_hash === newH);
      const syncRes = await supabaseLicenseAccountRpc("taager_insert_license_account", {
        p_license_key: licKey,
        p_account_hash: newH,
        ...licenseAccountRpcFields(newAccount),
        p_unlocked: !!currentRow?.unlocked,
      });
      if (syncRes && syncRes.success === false) {
        return { success: false, reason: syncRes.reason || "license_account_sync_failed" };
      }
      return { success: true };
    }

    if (oldH && dbHashes.includes(oldH)) {
      const oldRow = dbRows.find(r => r.account_hash === oldH);
      const wasUnlocked = oldRow ? !!oldRow.unlocked : false;
      if (!wasUnlocked) return { success: false, reason: "account_locked" };
      const replaceRes = await supabaseLicenseAccountRpc("taager_replace_license_account", {
        p_license_key: licKey,
        p_old_account_hash: oldH,
        p_new_account_hash: newH,
        ...licenseAccountRpcFields(newAccount),
      });
      if (replaceRes && replaceRes.success === false) {
        return { success: false, reason: replaceRes.reason || "license_account_sync_failed" };
      }
      return { success: true };
    }

    if (!dbHashes.includes(newH)) {
      if (dbHashes.length + 1 > maxAccounts) {
        return { success: false, reason: "limit_reached", remoteAccountSlots: summarizeRemoteLicenseAccounts(dbRows) };
      }
      const insertRes = await supabaseLicenseAccountRpc("taager_insert_license_account", {
        p_license_key: licKey,
        p_account_hash: newH,
        ...licenseAccountRpcFields(newAccount),
        p_unlocked: false,
      });
      if (insertRes && insertRes.success === false) {
        return { success: false, reason: insertRes.reason || "license_account_sync_failed", remoteAccountSlots: summarizeRemoteLicenseAccounts(dbRows) };
      }
    }
    return { success: true };
  } catch (error) {
    log.warn("[Accounts] Could not sync edited license account slot:", error && error.message ? error.message : error);
    return { success: false, reason: "license_account_sync_failed" };
  }
}

function buildAccountPatchForUpdate(patch) {
  const src = patch && typeof patch === "object" ? patch : {};
  const next = {};
  [
    "memberName", "label", "cmsProvider", "easyEmail", "easyStore", "missingOrdersStoreName",
    "lightfunnelsAccountName", "lightfunnelsLoginMethod", "lightfunnelsEmail",
    "dashboardEnrichmentProvider",
    "easyOrdersLookbackDays", "taagerLoginMethod", "taagerEmail", "taagerPhone",
    "taagerCountry", "taagerAffiliateCode", "missedOrdersDestination",
    "secondTaagerCartEnabled", "secondTaagerLoginMethod", "secondTaagerEmail",
    "secondTaagerPhone", "secondTaagerCountry", "secondTaagerAffiliateCode"
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(src, key)) next[key] = src[key];
  });
  if (src.easyPassword) next.easyPassword = src.easyPassword;
  if (src.lightfunnelsPassword) next.lightfunnelsPassword = src.lightfunnelsPassword;
  if (src.taagerPassword) next.taagerPassword = src.taagerPassword;
  if (src.secondTaagerPassword) next.secondTaagerPassword = src.secondTaagerPassword;
  return next;
}

ipcMain.handle("update-account", async (_, data = {}) => {
  const accountId = String(data.accountId || "").trim();
  if (!accountId) return { success: false, reason: "account_not_found" };

  const accounts = store.get("accounts", []) || [];
  const idx = accounts.findIndex(a => a.id === accountId);
  if (idx < 0) return { success: false, reason: "account_not_found" };

  const maxAccounts = await getMaxAccounts();
  const oldAccount = { ...accounts[idx] };
  const updatedAccount = {
    ...oldAccount,
    ...buildAccountPatchForUpdate(data.patch || {}),
    id: oldAccount.id,
  };
  const nextAccounts = accounts.map((a, i) => i === idx ? updatedAccount : { ...a });

  const duplicateConflict = findNewDuplicateConflict(accounts, nextAccounts);
  if (duplicateConflict) {
    return {
      success: false,
      reason: "duplicate_account",
      conflictAccountId: duplicateConflict.conflict.id || "",
      conflictAccountLabel: accountDisplayName(duplicateConflict.conflict, "Account"),
    };
  }

  const validation = validateAccountCredentialsForSave(updatedAccount);
  if (!validation.success) return validation;

  const licenseSync = await syncSingleEditedAccountLicenseSlot(oldAccount, updatedAccount, maxAccounts);
  if (!licenseSync.success) return licenseSync;

  persistAccountsWithoutDeleting(nextAccounts, maxAccounts);
  syncLicenseCredentialsBackup("update-account").catch(() => {});
  return { success: true };
});

// Ã¢â€â‚¬Ã¢â€â‚¬ NEW: save full accounts array Ã¢â€â‚¬Ã¢â€â‚¬
ipcMain.handle("save-all-accounts", async (_, accounts) => {
  const licKey = licenseStore.get("licenseKey", "");
  const maxAccounts = await getMaxAccounts();
  const storedAccountsBeforeSave = store.get("accounts", []);

  const duplicateConflict = findNewDuplicateConflict(storedAccountsBeforeSave, accounts);
  if (duplicateConflict) {
    return {
      success: false,
      reason: "duplicate_account",
      conflictAccountId: duplicateConflict.conflict.id || "",
      conflictAccountLabel: accountDisplayName(duplicateConflict.conflict, "Account"),
    };
  }

  if (accounts.length > maxAccounts)
    return { success: false, reason: "limit_reached" };

  for (const a of accounts) {
    const validation = validateAccountCredentialsForSave(a);
    if (!validation.success) return validation;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Per-account lock check via license_accounts table Ã¢â€â‚¬Ã¢â€â‚¬
  if (licKey) {
    try {
      const dbRows      = await supabaseRpc("taager_get_license_accounts", { p_license_key: licKey }) || [];
      const dbHashes    = dbRows.map(r => r.account_hash);

      // Build a map of accountId Ã¢â€ â€™ old hash using the CURRENTLY stored accounts
      // (before we overwrite them). This lets us detect when an edit changed emails.
      const oldHashById = {};
      const oldAccountById = {};
      for (const a of storedAccountsBeforeSave) {
        oldAccountById[a.id] = a;
        oldHashById[a.id] = accountHash(a);
      }

      for (const a of accounts) {
        if (a.licenseAccountHash && dbHashes.includes(a.licenseAccountHash)) continue;
        const matchingRow = dbRows.find(r => licenseRowMatchesAccount(r, a));
        if (matchingRow && matchingRow.account_hash) {
          a.licenseAccountHash = matchingRow.account_hash;
          a.licenseIdentityKey = accountIdentityKey(a);
        }
      }

      const newHashes = accounts.map(a => accountHash(a));

      for (const a of accounts) {
        const newH = accountHash(a);
        const oldH = oldHashById[a.id]; // undefined for brand-new accounts
        const oldAccount = oldAccountById[a.id] || null;
        const licenseFieldsChanged = oldAccount
          ? licenseAccountSyncSignature(oldAccount) !== licenseAccountSyncSignature(a)
          : false;
        const shouldSyncAccount = !oldAccount || newH !== oldH || licenseFieldsChanged;

        if (!shouldSyncAccount) continue;

        // Case 1: hash unchanged, but license fields changed - update the DB row
        if (newH === oldH && dbHashes.includes(newH)) {
          const currentRow = dbRows.find(row => row.account_hash === newH);
          const syncRes = await supabaseLicenseAccountRpc("taager_insert_license_account", {
            p_license_key: licKey,
            p_account_hash: newH,
            ...licenseAccountRpcFields(a),
            p_unlocked: !!currentRow?.unlocked,
          });
          if (syncRes && syncRes.success === false) {
            return { success: false, reason: syncRes.reason || "license_account_sync_failed" };
          }
          continue;
        }

        // Case 2: this is an edit that changed the email Ã¢â‚¬â€ swap old hash for new hash
        if (oldH && dbHashes.includes(oldH)) {
          // Preserve the unlocked state from the old row
          const oldRow   = dbRows.find(r => r.account_hash === oldH);
          const wasUnlocked = oldRow ? !!oldRow.unlocked : false;
          // Server-side guard: reject the edit if the account is still locked
          if (!wasUnlocked) return { success: false, reason: "account_locked" };
          // Replace atomically so a duplicate rejection cannot remove the old slot.
          const newAccObj = accounts.find(a => accountHash(a) === newH);
          const replaceRes = await supabaseLicenseAccountRpc("taager_replace_license_account", {
            p_license_key:  licKey,
            p_old_account_hash: oldH,
            p_new_account_hash: newH,
            ...licenseAccountRpcFields(newAccObj),
          });
          if (replaceRes && replaceRes.success === false) {
            return { success: false, reason: replaceRes.reason || "license_account_sync_failed" };
          }
          continue;
        }

        // Case 3: genuinely new account Ã¢â‚¬â€ check slot limit then register
        if (!dbHashes.includes(newH)) {
          const hashesNeedingInsert = new Set();
          for (const b of accounts) {
            const bNewH = accountHash(b);
            if (dbHashes.includes(bNewH)) continue;
            const bOldAccount = oldAccountById[b.id] || null;
            const bOldH = oldHashById[b.id];
            const bLicenseFieldsChanged = bOldAccount
              ? licenseAccountSyncSignature(bOldAccount) !== licenseAccountSyncSignature(b)
              : false;
            const bShouldSyncAccount = !bOldAccount || bNewH !== bOldH || bLicenseFieldsChanged;
            if (!bShouldSyncAccount) continue;
            if (bOldH && dbHashes.includes(bOldH)) continue;
            hashesNeedingInsert.add(bNewH);
          }
          if (dbHashes.length + hashesNeedingInsert.size > maxAccounts) {
            return {
              success: false,
              reason: storedAccountsBeforeSave.length === 0 && dbHashes.length > 0 ? "remote_slots_full" : "limit_reached",
              remoteAccountSlots: summarizeRemoteLicenseAccounts(dbRows),
            };
          }
          const newAccForInsert = accounts.find(a => accountHash(a) === newH);
          const insertRes = await supabaseLicenseAccountRpc("taager_insert_license_account", {
            p_license_key:  licKey,
            p_account_hash: newH,
            ...licenseAccountRpcFields(newAccForInsert),
            p_unlocked:     false,
          });
          if (insertRes && insertRes.success === false) {
            return {
              success: false,
              reason: insertRes.reason === "limit_reached" && storedAccountsBeforeSave.length === 0 && dbHashes.length > 0
                ? "remote_slots_full"
                : (insertRes.reason || "license_account_sync_failed"),
              remoteAccountSlots: summarizeRemoteLicenseAccounts(dbRows),
            };
          }
        }
      }

      // Remove only local accounts the user actually deleted. Remote-only slots can
      // exist after an interrupted save or admin action and must not break adds.
      const storedOldHashes = Object.values(oldHashById).filter(Boolean);
      const swappedOldHashes = accounts
        .map(a => oldHashById[a.id])
        .filter(h => h && dbHashes.includes(h) && !newHashes.includes(h));
      const deletedHashes = storedOldHashes.filter(h => dbHashes.includes(h) && !newHashes.includes(h) && !swappedOldHashes.includes(h));
      for (const h of deletedHashes) {
        // Server-side guard: never delete a locked account slot Ã¢â‚¬â€ only unlocked ones can be removed
        const row = dbRows.find(r => r.account_hash === h);
        if (row && !row.unlocked) return { success: false, reason: "account_locked" };
        try {
          const deleteRes = await supabaseRpc("taager_delete_license_account", { p_license_key: licKey, p_account_hash: h });
          if (deleteRes && deleteRes.success === false) {
            return { success: false, reason: deleteRes.reason || "license_account_sync_failed" };
          }
        } catch (error) {
          log.warn("[Accounts] Could not delete license account slot:", error && error.message ? error.message : error);
          return { success: false, reason: "license_account_sync_failed" };
        }
      }
    } catch (error) {
      log.warn("[Accounts] Could not sync license account slots before save:", error && error.message ? error.message : error);
      return { success: false, reason: "license_account_sync_failed" };
    }
  }

  // Encrypt passwords in store Ã¢â‚¬â€ store accounts without plaintext passwords, keep passwords separately keyed
  const nextAccountIds = new Set(accounts.map(a => a.id));
  for (const oldAccount of storedAccountsBeforeSave) {
    if (!nextAccountIds.has(oldAccount.id)) removeAccountLocalArtifacts(oldAccount.id);
  }

  const safeAccounts = accounts.map(safeAccountForStorage);
  store.set("accounts", safeAccounts);

  // Prune local unlockedAccountIds cache Ã¢â‚¬â€ remove IDs that no longer exist
  const remainingIds = accounts.map(a => a.id);
  const runnableIds = accounts.filter(a => !isStaticAccount(a)).map(a => a.id);
  const savedAutoRunIds = store.get("autoRunAccountIds", []);
  if (Array.isArray(savedAutoRunIds)) {
    store.set("autoRunAccountIds", savedAutoRunIds.filter(id => runnableIds.includes(id)));
  }
  const cachedUnlocked = store.get("unlockedAccountIds", []).filter(id => remainingIds.includes(id));
  store.set("unlockedAccountIds", cachedUnlocked);

  // Store passwords per account id
  for (const a of accounts) {
    if (a.easyPassword) store.set(`pwd_easy_${a.id}`, a.easyPassword);
    if (a.lightfunnelsPassword) store.set(`pwd_lightfunnels_${a.id}`, a.lightfunnelsPassword);
    if (a.taagerPassword) store.set(`pwd_taager_${a.id}`, a.taagerPassword);
    if (a.taagerPassword || a.taagerPassword) store.set(`pwd_taager_${a.id}`, a.taagerPassword || a.taagerPassword);
  }

  // Also update legacy flat fields from first account (for any code still reading them)
  if (accounts[0]) {
    const first = accounts[0];
    const firstCmsProvider = cmsProviderOf(first);
    const firstIsEasyOrders = firstCmsProvider === "easyorders";
    const firstIsLightFunnels = firstCmsProvider === "lightfunnels";
    store.set("cmsProvider", firstCmsProvider);
    store.set("easyEmail",    firstIsEasyOrders ? first.easyEmail    || "" : "");
    store.set("easyPassword", firstIsEasyOrders ? first.easyPassword || store.get(`pwd_easy_${first.id}`, "") : "");
    store.set("easyStore",    firstIsEasyOrders ? first.easyStore    || "" : "");
    store.set("lightfunnelsEmail", firstIsLightFunnels ? first.lightfunnelsEmail || "" : "");
    store.set("lightfunnelsPassword", firstIsLightFunnels ? first.lightfunnelsPassword || store.get(`pwd_lightfunnels_${first.id}`, "") : "");
    store.set("lightfunnelsAccountName", firstIsLightFunnels ? first.lightfunnelsAccountName || "" : "");
    store.set("lightfunnelsLoginMethod", firstIsLightFunnels ? lightfunnelsLoginMethodOf(first) : "email");
    store.set("taagerEmail",    first.taagerEmail    || "");
    store.set("taagerPassword", first.taagerPassword || store.get(`pwd_taager_${first.id}`, ""));
    store.set("taagerCountry",  first.taagerCountry  || "sa");
    store.set("taagerLoginMethod", first.taagerLoginMethod || "email");
    store.set("taagerEmail",    first.taagerEmail    || first.taagerEmail || "");
    store.set("taagerPhone",    first.taagerPhone    || "");
    store.set("taagerPassword", first.taagerPassword || first.taagerPassword || store.get(`pwd_taager_${first.id}`, ""));
    store.set("taagerCountry",  first.taagerCountry  || first.taagerCountry || "sa");
  } else {
    // All accounts deleted Ã¢â‚¬â€ clear legacy flat fields so the renderer can't
    // resurrect a ghost account from stale easyEmail / taagerEmail values
    ["cmsProvider", "easyEmail", "easyPassword", "easyStore", "lightfunnelsEmail",
     "lightfunnelsPassword", "lightfunnelsAccountName", "lightfunnelsLoginMethod",
     "taagerEmail", "taagerPassword", "taagerCountry", "taagerLoginMethod",
     "taagerPhone", "taagerAffiliateCode"].forEach(k => store.delete(k));
  }
  // Cache maxAccounts locally
  licenseStore.set("maxAccounts", maxAccounts);
  // Bust credentials cache so next get-credentials reflects the new accounts
  _credCache = null;
  _credCacheAt = 0;
  invalidateAnalyticsRunsCache();
  syncLicenseCredentialsBackup("save-all-accounts").catch(() => {});
  return { success: true };
});


// Ã¢â€â‚¬Ã¢â€â‚¬ ADMIN: unlock a single account (called when admin unlocks via panel) Ã¢â€â‚¬Ã¢â€â‚¬
// The app polls this on startup Ã¢â‚¬â€ when admin sets unlocked=true in DB,
// unlockedAccountIds is updated locally so UI re-enables edit button.
ipcMain.handle("unlock-single-account", async (_, { accountId }) => {
  return { success: false, reason: "admin_only" };
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Re-lock after user saves new credentials for an account Ã¢â€â‚¬Ã¢â€â‚¬
ipcMain.handle("relock-account", async (_, { accountId }) => {
  const accounts = store.get("accounts", []);
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) return { success: true };
  const licKey = licenseStore.get("licenseKey", "");
  const hash = accountHash(acc);
  if (licKey) {
    try {
      await supabaseRpc("taager_set_license_account_unlocked", {
        p_license_key: licKey,
        p_account_hash: hash,
        p_unlocked: false,
      });
    } catch {}
  }
  const unlocked = store.get("unlockedAccountIds", []).filter(id => id !== accountId);
  store.set("unlockedAccountIds", unlocked);
  return { success: true };
});

function bindTaagerAffiliateCode(accountId, code) {
  const cleanCode = String(code || "").trim();
  if (!accountId || !cleanCode || accountId === "__single__" || accountId === "legacy") return;
  const accounts = store.get("accounts", []) || [];
  const idx = accounts.findIndex(a => a.id === accountId);
  if (idx < 0) return;
  const current = String(accounts[idx].taagerAffiliateCode || "").trim();
  if (current && current === cleanCode) return;
  return;
}
ipcMain.handle("get-settings", () => ({
  theme: store.get("theme", "dark"),
  lang:  store.get("lang",  "ar"),
  appZoom: getSavedAppZoom(),
  easyOrdersAffiliateRecoveryEnabled: store.get("easyOrdersAffiliateRecoveryEnabled", false),
}));
ipcMain.handle("save-settings", (_, { theme, lang, easyOrdersAffiliateRecoveryEnabled }) => {
  if (theme !== undefined) store.set("theme", theme);
  if (lang  !== undefined) store.set("lang",  lang);
  if (easyOrdersAffiliateRecoveryEnabled !== undefined) {
    store.set("easyOrdersAffiliateRecoveryEnabled", easyOrdersAffiliateRecoveryEnabled === true);
    _credCache = null;
    _credCacheAt = 0;
  }
  return true;
});

ipcMain.handle("open-folder", (_, p) => { shell.openPath(p); return true; });
ipcMain.handle("set-auto-run", (_, v) => { autoRunEnabled = v; store.set("autoRun", v); if (v) scheduleAutoRun(); else clearAutoRun(); return true; });
ipcMain.handle("set-auto-run-interval", (_, m) => { store.set("autoRunInterval", m); if (autoRunEnabled) scheduleAutoRun(); return true; });
ipcMain.handle("set-auto-run-accounts", (_, ids) => {
  const accounts = store.get("accounts", []) || [];
  const validIds = accounts.filter(a => !isStaticAccount(a)).map(a => a.id);
  const selected = Array.isArray(ids) ? ids.filter(id => validIds.includes(id)) : [];
  store.set("autoRunAccountIds", selected);
  return selected;
});
ipcMain.handle("get-auto-run-progress", () => getAutoRunProgress());
ipcMain.handle("set-launch-minimized", (_, v) => { store.set("launchMinimized", v); return true; });
ipcMain.handle("set-auto-confirm", (_, v) => { store.set("autoConfirm", v); return true; });
ipcMain.handle("set-missing-orders-upload-enabled", (_, v) => {
  store.set("missingOrdersUploadEnabled", v === true);
  _credCache = null;
  _credCacheAt = 0;
  return true;
});
ipcMain.handle("set-easyorders-affiliate-recovery-enabled", (_, v) => {
  store.set("easyOrdersAffiliateRecoveryEnabled", v === true);
  _credCache = null;
  _credCacheAt = 0;
  return true;
});

let currentBotChild = null;
const pendingGoogleLoginRequests = new Map();
const dashboardFetchChildren = new Set();
const manualChromeChildren = new Set();
ipcMain.on("bot-started", () => { botRunning = true; });
ipcMain.on("bot-finished", () => { botRunning = false; currentBotChild = null; botChildren = []; });
ipcMain.handle("kill-bot", async () => {
  log.info("[Bot] Stop requested by user");
  const result = await stopRunningBots();
  log.info(`[Bot] Stop complete - children=${result.stopped}, forced=${result.forced}`);
  return result;
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Analytics IPC Handlers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function openManualGoogleLoginChrome(message, child, fallback = {}) {
  const requestId = String(message && message.requestId || "");
  const profilePath = String(message && message.profilePath || "");
  const loginUrl = String(message && message.loginUrl || "");
  const chromePath = String(message && message.chromePath || getCachedChromePath() || "");
  if (!requestId || !profilePath || !loginUrl || !chromePath) {
    const error = "GOOGLE_LOGIN_OPEN_FAILED: missing requestId/profilePath/loginUrl/chromePath";
    log.warn("[GoogleLogin] malformed manual Chrome request", {
      requestId,
      hasProfilePath: !!profilePath,
      hasLoginUrl: !!loginUrl,
      hasChromePath: !!chromePath,
    });
    if (requestId && child && !child.killed) {
      try { child.send({ type: "google-login-failed", requestId, error }); } catch (_) {}
    }
    return null;
  }

  const { spawn } = require("child_process");
  const accountLabel = message.accountLabel || fallback.accountLabel || "Taager account";
  const args = [
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    loginUrl,
  ];
  const chrome = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  manualChromeChildren.add(chrome);
  chrome.once("error", (error) => {
    manualChromeChildren.delete(chrome);
    pendingGoogleLoginRequests.delete(requestId);
    try {
      child.send({ type: "google-login-failed", requestId, error: error && error.message || String(error) });
    } catch (_) {}
    mainWindow.webContents.send("bot-log", `[GoogleLogin] [${accountLabel}] Could not open Chrome for Google login: ${error && error.message || error}`);
  });
  chrome.unref();

  const payload = {
    ...message,
    accountId: message.accountId || fallback.accountId || "__single__",
    accountLabel,
  };
  const chromeStartedAt = Date.now();
  pendingGoogleLoginRequests.set(requestId, { child, payload, chromeStartedAt });
  chrome.once("exit", () => {
    manualChromeChildren.delete(chrome);
    const pending = pendingGoogleLoginRequests.get(requestId);
    if (!pending || pending.child !== child) return;
    if (Date.now() - chromeStartedAt < 3000 || child.killed) return;
    try {
      child.send({ type: "google-login-finished", requestId });
      pendingGoogleLoginRequests.delete(requestId);
    } catch (_) {}
  });
  mainWindow.webContents.send("bot-google-login-needed", payload);
  mainWindow.webContents.send("bot-log", `[GoogleLogin] [${payload.accountLabel}] Chrome opened with bot profile. Log in with Google, then close Chrome.`);
  return payload;
}

ipcMain.handle("complete-google-login", async (_, requestId) => {
  const id = String(requestId || "");
  const pending = pendingGoogleLoginRequests.get(id);
  if (!pending || !pending.child || pending.child.killed) {
    return { ok: false, error: "GOOGLE_LOGIN_REQUEST_NOT_FOUND" };
  }
  pending.child.send({ type: "google-login-finished", requestId: id });
  pendingGoogleLoginRequests.delete(id);
  return { ok: true };
});

ipcMain.handle("save-run-analytics", async (_, payload) => {
  try {
    // Extract taagerSnapshot before storing (don't persist it Ã¢â‚¬â€ it's only for enrichment)
    const { taagerSnapshot, taagerDashboardSnapshot, buffer, ...rawRunData } = payload;
    const confirmedOnlyAnalytics = rawRunData.analyticsOrdersSource === "taager-confirmed";
    if (!confirmedOnlyAnalytics && (!Array.isArray(rawRunData.orders) || rawRunData.orders.length === 0) && buffer) {
      rawRunData.orders = parseOrderRowsFromOutputBuffer(buffer);
    }
    const runData = normalizeAnalyticsRun(rawRunData);

    // Normal order runs should not refresh dashboard snapshots. Dashboard rows
    // are updated only by the manual Dashboard Update flow.
    const dashboardRowsSaved = 0;
    const runs = analyticsStore.get("runs", []);
    const alreadyExists = runs.some(r => r.runId === runData.runId);
    if (alreadyExists) return { ok: true, duplicate: true, dashboardRowsSaved };

    // Ã¢â€â‚¬Ã¢â€â‚¬ Enrichment pass: update previous stored runs with current Taager statuses Ã¢â€â‚¬Ã¢â€â‚¬
    // On every new bot run, we get a fresh Taager export. Any order from a previous run
    // whose phone+SKU now appears in the Taager sheet gets its status/amounts updated.
    // This is how "Under processing" Ã¢â€ â€™ "Delivered" / "Failed" transitions happen.
    let enrichedCount = 0;
    const taagerRows = normalizeTaagerSnapshotEntries(taagerSnapshot?.entries);
    if (taagerRows.length) {
      const currentRunMerge = enrichOrdersFromTaagerRows(runData.orders, taagerRows, runData.taagerCountry);
      runData.orders = currentRunMerge.orders;
      enrichedCount += currentRunMerge.changed;

      for (const run of runs) {
        if (runData.accountId && run.accountId && run.accountId !== runData.accountId) continue;
        if (!Array.isArray(run.orders)) continue;
        const merged = enrichOrdersFromTaagerRows(run.orders, taagerRows, run.taagerCountry || runData.taagerCountry);
        if (merged.changed > 0) {
          run.orders = merged.orders;
          enrichedCount += merged.changed;
        }
      }
      if (enrichedCount > 0) {
        console.log(`[Analytics] Enriched ${enrichedCount} orders from Taager snapshot`);
      }
    }

    runs.push(runData);
    analyticsStore.set("runs", runs);
    invalidateAnalyticsRunsCache();
    return { ok: true, enrichedCount, dashboardRowsSaved };
  } catch (err) {
    console.error("[Analytics] save-run-analytics error:", err.message);
    monitoring.captureException(err, { operation: "analytics.saveRun", extra: { runId: payload && payload.runId } });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-analytics-runs", async (_, { dateFrom, dateTo, accountId } = {}) => {
  try {
    syncAnalyticsFromDashboardSnapshots();
    if (!analyticsRunsCache || analyticsRunsCacheDirty) {
      const storedRuns = analyticsStore.get("runs", []);
      const accountsById = getStoredAccountsMap();
      let dirty = false;
      analyticsRunsCache = storedRuns.map(run => {
        const n = normalizeAnalyticsRun(run, accountsById);
        if (n.accountId !== run.accountId || n.accountEmail !== run.accountEmail || n.accountLabel !== run.accountLabel) dirty = true;
        return n;
      });
      analyticsRunsCacheDirty = false;
      if (dirty) analyticsStore.set("runs", analyticsRunsCache);
    }
    let runs = analyticsRunsCache;
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      runs = runs.filter(r => r.runTimestamp >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + (86400000 - 1);
      runs = runs.filter(r => r.runTimestamp <= to);
    }
    if (accountId && accountId !== "__all__") {
      runs = runs.filter(r => r.accountId === accountId || r.accountEmail === accountId);
    }
    return { ok: true, runs };
  } catch (err) {
    monitoring.captureException(err, { operation: "analytics.getRuns" });
    return { ok: false, runs: [], error: err.message };
  }
});

ipcMain.handle("clear-analytics-data", async () => {
  try {
    analyticsStore.set("runs", []);
    invalidateAnalyticsRunsCache();
    return { ok: true };
  } catch (err) {
    monitoring.captureException(err, { operation: "analytics.clear" });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("save-run-results", async (_, payload) => {
  try {
    if (!payload || typeof payload !== "object") return { ok: false, error: "INVALID_PAYLOAD" };
    const runId = String(payload.runId || "").trim();
    if (!runId) return { ok: false, error: "MISSING_RUN_ID" };

    const summary = payload.summary && typeof payload.summary === "object" ? payload.summary : {};
    const timestamp = Number(payload.runTimestamp) || Date.now();
    const monthKey = monthKeyFromTimestamp(timestamp);
    const safeId = safeRunResultId(runId);
    const relativePath = path.join(monthKey, `${safeId}.json.gz`).replace(/\\/g, "/");
    const absPath = path.join(ensureRunResultsBaseDir(), monthKey, `${safeId}.json.gz`);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });

    const detail = {
      schemaVersion: 1,
      runId,
      account: payload.account || {
        id: payload.accountId || "__single__",
        label: payload.accountLabel || "",
        country: payload.taagerCountry || "sa",
      },
      range: payload.range || { from: payload.dateFrom || "", to: payload.dateTo || "" },
      summary: {
        attempted: Number(summary.attempted) || 0,
        confirmed: Number(summary.confirmed) || 0,
        uncertain: Number(summary.uncertain) || 0,
        failed: Number(summary.failed) || 0,
      },
      orders: Array.isArray(payload.orders) ? payload.orders : [],
      artifacts: payload.artifacts || {},
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(absPath, zlib.gzipSync(Buffer.from(JSON.stringify(detail), "utf8")));

    const indexEntry = {
      schemaVersion: 1,
      runId,
      accountId: payload.accountId || detail.account.id || "__single__",
      accountLabel: payload.accountLabel || detail.account.label || "",
      taagerCountry: payload.taagerCountry || detail.account.country || "sa",
      dateFrom: payload.dateFrom || detail.range.from || "",
      dateTo: payload.dateTo || detail.range.to || "",
      runTimestamp: timestamp,
      status: payload.status || (detail.summary.failed > 0 ? "failed" : (detail.summary.uncertain > 0 ? "needs_review" : "all_ok")),
      summary: detail.summary,
      detailPath: relativePath,
    };

    const previous = readRunResultsIndex();
    const exists = previous.some((run) => String(run && run.runId) === runId);
    const next = previous
      .filter((run) => String(run && run.runId) !== runId)
      .concat(indexEntry)
      .sort((a, b) => (Number(b.runTimestamp) || 0) - (Number(a.runTimestamp) || 0));
    writeRunResultsIndex(next);
    pruneOldRunResultDetails(next);
    return { ok: true, duplicate: exists, runId };
  } catch (err) {
    log.error("[RunResults] save failed:", err && err.message ? err.message : err);
    monitoring.captureException(err, { operation: "runResults.save", extra: { runId: payload && payload.runId } });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-run-results-index", async (_, filter = {}) => {
  try {
    let runs = readRunResultsIndex();
    if (filter && typeof filter === "object") {
      if (filter.dateFrom || filter.dateTo) {
        runs = runs.filter((run) => runResultWithinRange(run, filter.dateFrom, filter.dateTo));
      }
      if (filter.accountId && filter.accountId !== "__all__") {
        runs = runs.filter((run) => run.accountId === filter.accountId || run.accountLabel === filter.accountId);
      }
    }
    runs = runs.slice().sort((a, b) => (Number(b.runTimestamp) || 0) - (Number(a.runTimestamp) || 0));
    return { ok: true, runs };
  } catch (err) {
    monitoring.captureException(err, { operation: "runResults.getIndex" });
    return { ok: false, runs: [], error: err.message };
  }
});

ipcMain.handle("get-run-result-detail", async (_, runId) => {
  try {
    const wanted = String(runId || "");
    const entry = readRunResultsIndex().find((run) => String(run && run.runId) === wanted);
    if (!entry) return { ok: false, error: "RUN_RESULT_NOT_FOUND" };
    const abs = resolveRunResultDetailPath(entry.detailPath);
    if (!abs || !fs.existsSync(abs)) return { ok: false, error: "RUN_RESULT_DETAIL_NOT_FOUND", entry };
    const detail = JSON.parse(zlib.gunzipSync(fs.readFileSync(abs)).toString("utf8"));
    return { ok: true, entry, detail };
  } catch (err) {
    monitoring.captureException(err, { operation: "runResults.getDetail", extra: { runId } });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("clear-run-results-data", async () => {
  try {
    writeRunResultsIndex([]);
    clearRunResultsFiles();
    return { ok: true };
  } catch (err) {
    monitoring.captureException(err, { operation: "runResults.clear" });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-analytics-settings", async () => ({
  minutesPerOrder: store.get("analyticsMinutesPerOrder", 5),
  purgeDays:       store.get("analyticsPurgeDays",       30),
  defaultDate:     store.get("analyticsDefaultDate",     "today"),
  defaultAccount:  store.get("analyticsDefaultAccount",  ""),
  showMissed:      store.get("analyticsShowMissed",      true),
  showInsights:    store.get("analyticsShowInsights",    true),
}));

ipcMain.handle("save-analytics-settings", async (_, { minutesPerOrder, purgeDays, defaultDate, defaultAccount, showMissed, showInsights }) => {
  if (minutesPerOrder != null) store.set("analyticsMinutesPerOrder", minutesPerOrder);
  if (purgeDays       != null) store.set("analyticsPurgeDays",       purgeDays);
  if (defaultDate     != null) store.set("analyticsDefaultDate",     defaultDate);
  if (defaultAccount  != null) store.set("analyticsDefaultAccount",  defaultAccount);
  if (showMissed      != null) store.set("analyticsShowMissed",      showMissed);
  if (showInsights    != null) store.set("analyticsShowInsights",    showInsights);
  return { ok: true };
});

const DASHBOARD_FETCH_ACCOUNT_TIMEOUT_MS = 8 * 60 * 1000;
const DASHBOARD_FETCH_EASYORDERS_TIMEOUT_MS = 24 * 60 * 1000;
const DASHBOARD_FETCH_IDLE_NOTICE_MS = 90 * 1000;

// Ã¢â€â‚¬Ã¢â€â‚¬ Dashboard Fetch Ã¢â‚¬â€ spawn dashboard-fetch.js (Taager + optional EasyOrders enrichment) Ã¢â€â‚¬Ã¢â€â‚¬
ipcMain.handle("run-dashboard-fetch", async (_, { accountId, dateFrom, dateTo, analyticsOnly, uploadedOnly } = {}) => {
  if (!(await isLicenseValid())) return { success: false, error: "LICENSE_INVALID" };
  if (analyticsOnly) {
    if (!isOperationsSuiteEnabled()) return { success: false, error: "ANALYTICS_NOT_ENABLED" };
  } else if (!licenseStore.get("dashboardEnabled", false)) {
    return { success: false, error: "DASHBOARD_NOT_ENABLED" };
  }
  const rangeValidation = validateCurrentYearDashboardRange(dateFrom, dateTo);
  if (!rangeValidation.ok) return { success: false, error: rangeValidation.error };

  const { fork } = require("child_process");
  const allAccounts = store.get("accounts", null);
  const legacyEmail = store.get("easyEmail", "");

  let acc;
  if (allAccounts && allAccounts.length > 0) {
    if (accountId) {
      acc = allAccounts.find(a => a.id === accountId);
      if (!acc) {
        notifyAdminErrorAlert({
          flow: "dashboard-fetch",
          operation: "preflight",
          accountId,
          error: `Dashboard account not found: ${accountId}`,
          dateFrom,
          dateTo,
        });
        return { success: false, error: `Dashboard account not found: ${accountId}` };
      }
    } else {
      acc = allAccounts[0];
    }
  } else {
    acc = {
      easyEmail:    legacyEmail,
      easyPassword: store.get("easyPassword", ""),
      taagerEmail:    store.get("taagerEmail", ""),
      taagerPassword: store.get("taagerPassword", ""),
      easyStore:    store.get("easyStore", ""),
    };
  }

  if (!acc) {
    notifyAdminErrorAlert({
      flow: "dashboard-fetch",
      operation: "preflight",
      accountId: accountId || "__single__",
      error: "No account found",
      dateFrom,
      dateTo,
    });
    return { success: false, error: "No account found" };
  }
  if (isStaticAccount(acc)) {
    notifyAdminErrorAlert({
      flow: "dashboard-fetch",
      operation: "preflight",
      account: acc,
      accountId: accountId || acc.id || "__single__",
      error: "STATIC_ACCOUNT_OFFLINE",
      dateFrom,
      dateTo,
    });
    return { success: false, error: "STATIC_ACCOUNT_OFFLINE" };
  }

  const userData = app.getPath("userData");
  const dashboardAccountId = accountId || acc.id || "__single__";
  const taagerLoginMethod = taagerLoginMethodOf(acc);
  const requestedDashboardProvider = dashboardEnrichmentProviderOf(acc);
  const dashboardEnrichmentProvider = !analyticsOnly && (requestedDashboardProvider === "easyorders" || requestedDashboardProvider === "lightfunnels")
    ? requestedDashboardProvider
    : "none";
  const taagerEmail = acc.taagerEmail || store.get("taagerEmail", "");
  const taagerPassword = acc.taagerPassword || (acc.id ? store.get(`pwd_taager_${acc.id}`, "") : "") || store.get("taagerPassword", "");
  const taagerPhone = acc.taagerPhone || store.get("taagerPhone", "");
  const easyPassword = acc.easyPassword || (acc.id ? store.get(`pwd_easy_${acc.id}`, "") : "") || store.get("easyPassword", "");
  const lightfunnelsPassword = acc.lightfunnelsPassword || (acc.id ? store.get(`pwd_lightfunnels_${acc.id}`, "") : "") || store.get("lightfunnelsPassword", "");
  const accountTimeoutMs = dashboardEnrichmentProvider === "easyorders" || dashboardEnrichmentProvider === "lightfunnels"
    ? DASHBOARD_FETCH_EASYORDERS_TIMEOUT_MS
    : DASHBOARD_FETCH_ACCOUNT_TIMEOUT_MS;
  if (taagerLoginMethod !== "google" && !taagerEmail && !taagerPhone) {
    const label = accountDisplayName(acc, dashboardAccountId);
    notifyAdminErrorAlert({
      flow: "dashboard-fetch",
      operation: "preflight",
      account: acc,
      accountId: dashboardAccountId,
      error: `Taager credentials missing for ${label}. Re-save this account, then retry dashboard update.`,
      dateFrom,
      dateTo,
    });
    return { success: false, error: `Taager credentials missing for ${label}. Re-save this account, then retry dashboard update.` };
  }
  if (!String(acc.taagerAffiliateCode || "").trim()) {
    const label = accountDisplayName(acc, dashboardAccountId);
    notifyAdminErrorAlert({
      flow: "dashboard-fetch",
      operation: "preflight",
      account: acc,
      accountId: dashboardAccountId,
      error: `Taager merchant ID missing for ${label}. Re-save this account and add the merchant ID from Taager profile.`,
      dateFrom,
      dateTo,
    });
    return { success: false, error: `Taager merchant ID missing for ${label}. Re-save this account and add the merchant ID from Taager profile.` };
  }
  const profilePath = path.join(userData, `bot-profile${acc.id ? `-${acc.id}` : ""}`);
  if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });

  const creds = {
    ...acc,
    profilePath,
    launchMinimized: store.get("launchMinimized", false),
    easyPassword,
    lightfunnelsPassword,
    taagerEmail,
    taagerPassword,
    taagerLoginMethod,
    taagerPhone,
    taagerCountry: acc.taagerCountry || store.get("taagerCountry", "sa"),
    taagerAffiliateCode: acc.taagerAffiliateCode || "",
    dashboardEnrichmentProvider,
    easyOrdersLookbackDays: Number(acc.easyOrdersLookbackDays || 60),
    dashboardSkuNameCache: getDashboardSkuNameCache(dashboardAccountId),
    dashboardDateFrom: dateFrom || "",
    dashboardDateTo: dateTo || "",
    chromePath: getCachedChromePath() || undefined,
  };

  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, "../bot/dashboard-fetch.js"), [], {
      env: { ...process.env, BOT_CONFIG: JSON.stringify(creds) },
      silent: true,
      execArgv: ["--max-old-space-size=256"],
    });
    dashboardFetchChildren.add(child);

    const accountLabel = accountDisplayName(acc, dashboardAccountId);

    let resolved = false;
    let lastStage = "dashboard.fetch.spawned";
    let killedByWatchdog = false;
    let lastChildActivityAt = Date.now();
    const childLogTail = [];

    const forwardDashboardLog = (text, options = {}) => {
      const message = String(text || "");
      lastChildActivityAt = Date.now();
      childLogTail.push(message);
      if (childLogTail.length > 30) childLogTail.shift();
      if (options.stream === "stderr") log.warn(`[Dashboard:${accountLabel}] ${message}`);
      else log.info(`[Dashboard:${accountLabel}] ${message}`);
      let logFilePath = "";
      try {
        logFilePath = log.transports && log.transports.file && typeof log.transports.file.getFile === "function"
          ? (log.transports.file.getFile().path || "")
          : "";
      } catch (_) {}
      const payload = {
        accountId: dashboardAccountId,
        accountLabel,
        message,
        stream: options.stream || "stdout",
        timestamp: Date.now(),
        logFilePath,
      };
      mainWindow.webContents.send("bot-dashboard-log", payload);
      mainWindow.webContents.send("bot-log", `[Dashboard:${accountLabel}]${options.stream === "stderr" ? "[ERR]" : ""} ${message}`);
    };

    child.stdout.on("data", (d) => {
      forwardDashboardLog(d.toString(), { stream: "stdout" });
    });
    child.stderr.on("data", (d) => {
      forwardDashboardLog(d.toString(), { stream: "stderr" });
    });

    const idleNotice = setInterval(() => {
      if (resolved) return;
      const idleMs = Date.now() - lastChildActivityAt;
      if (idleMs < DASHBOARD_FETCH_IDLE_NOTICE_MS) return;
      const seconds = Math.round(idleMs / 1000);
      const message = `Still waiting for dashboard fetch. No child update for ${seconds}s; last stage: ${lastStage}`;
      lastChildActivityAt = Date.now();
      const payload = {
        type: "stage",
        flow: "dashboard",
        stage: lastStage,
        status: "waiting",
        message,
        accountId: dashboardAccountId,
        accountLabel,
        lastStage,
        timestamp: Date.now(),
      };
      log.warn(`[Dashboard:${accountLabel}] ${message}`);
      mainWindow.webContents.send("bot-dashboard-stage", payload);
      mainWindow.webContents.send("bot-dashboard-log", {
        accountId: dashboardAccountId,
        accountLabel,
        message,
        stream: "watchdog",
        timestamp: Date.now(),
      });
    }, 30 * 1000);

    const watchdog = setTimeout(() => {
      killedByWatchdog = true;
      const error = `DASHBOARD_FETCH_TIMEOUT: last stage was ${lastStage}; timeout=${Math.round(accountTimeoutMs / 1000)}s; recent logs=${childLogTail.slice(-5).join(" | ")}`;
      forwardDashboardLog(error, { stream: "stderr" });
      notifyAdminErrorAlert({
        flow: "dashboard-fetch",
        operation: "watchdog-timeout",
        account: acc,
        accountId: dashboardAccountId,
        error,
        dateFrom,
        dateTo,
        lastStage,
        recentLogs: childLogTail.slice(-10),
      });
      try { child.kill(); } catch (_) {}
      safeResolve({ success: false, error, lastStage, recentLogs: childLogTail.slice(-10) });
    }, accountTimeoutMs);

    const safeResolve = (v) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(watchdog);
        clearInterval(idleNotice);
        dashboardFetchChildren.delete(child);
        resolve(v);
      }
    };

    child.on("message", async (msg) => {
      lastChildActivityAt = Date.now();
      if (msg.type === "stage") {
        lastStage = msg.stage || lastStage;
        const payload = {
          ...msg,
          accountId: dashboardAccountId,
          accountLabel,
          lastStage,
          timestamp: Date.now(),
        };
        mainWindow.webContents.send("bot-dashboard-stage", payload);
        if (msg.message) {
          forwardDashboardLog(`[stage:${msg.status || "info"}] ${msg.stage || lastStage} - ${msg.message}`);
        }
      } else if (msg.type === "dashboard-result") {
        let rows = normalizeDashboardProfitRows(msg.rows || []);
        try {
          const rangeFrom = msg.dateFrom || dateFrom || "";
          const rangeTo = msg.dateTo || dateTo || "";
          let enriched = 0;
          if (analyticsOnly) {
            enriched = enrichAnalyticsRunsFromTaagerRows(dashboardAccountId, rows, {
              uploadedOnly: uploadedOnly !== false,
              dateFrom: rangeFrom,
              dateTo: rangeTo,
            });
            console.log(`[Analytics] Uploaded-order status update for ${dashboardAccountId}: ${rows.length} Taager rows fetched, ${enriched} stored orders changed`);
          } else {
            const skuCacheUpdate = mergeDashboardSkuNameCache(dashboardAccountId, msg.learnedSkuNameMap || {});
            if (msg.enrichmentDiagnostics && msg.enrichmentDiagnostics.provider === "easyorders") {
              msg.enrichmentDiagnostics = {
                ...msg.enrichmentDiagnostics,
                skuNameCacheAdded: skuCacheUpdate.added,
                skuNameCacheUpdated: skuCacheUpdate.updated,
                skuNameCacheTotal: skuCacheUpdate.total,
              };
              if (msg.parseDiagnostics && msg.parseDiagnostics.enrichment) {
                msg.parseDiagnostics.enrichment = msg.enrichmentDiagnostics;
              }
            }
            const existingRows = dashboardStore.get(`accounts.${dashboardAccountId}.snapshot`, []);
            rows = preserveExistingDashboardProductNames(rows, existingRows);
            const existingDebugSummary = dashboardDebugSummaryForRange(existingRows, rangeFrom, rangeTo, null);
            const incomingDebugSummary = dashboardDebugSummaryForRange(rows, rangeFrom, rangeTo, msg.parseDiagnostics);
            const persisted = persistDashboardSnapshot(dashboardAccountId, {
              snapshot: rows,
              dateFrom: rangeFrom,
              dateTo: rangeTo,
              exportDateFrom: msg.exportDateFrom || "",
              exportDateTo: msg.exportDateTo || "",
              snapshotMonth: msg.snapshotMonth || "",
              parseDiagnostics: msg.parseDiagnostics || null,
              enrichmentDiagnostics: msg.enrichmentDiagnostics || null,
            }, { source: "live-fetch", timestampKey: "autoFetchTimestamp" });
            enriched = persisted.enriched || 0;
            const savedDebugSummary = dashboardDebugSummaryForRange(persisted.mergedRows, rangeFrom, rangeTo, null);
            const debugLines = dashboardDebugLines(
              accountLabel,
              rangeFrom,
              rangeTo,
              msg.exportDateFrom || "",
              msg.exportDateTo || "",
              existingDebugSummary,
              incomingDebugSummary,
              savedDebugSummary
            );
            debugLines.forEach((line) => {
              console.log(line);
              mainWindow.webContents.send("bot-log", line);
            });
            console.log(`[Dashboard] Snapshot replaced ${rangeFrom || "?"}..${rangeTo || "?"} for ${dashboardAccountId}: ${rows.length} fetched, ${persisted.mergedRows.length} stored`);
            if (skuCacheUpdate.added || skuCacheUpdate.updated) {
              console.log(`[Dashboard] SKU name cache updated for ${dashboardAccountId}: +${skuCacheUpdate.added}, changed=${skuCacheUpdate.updated}, total=${skuCacheUpdate.total}`);
            }
            if (persisted.enriched > 0) console.log(`[Analytics] Enriched ${persisted.enriched} stored orders from dashboard fetch`);
          }
          msg._analyticsEnriched = enriched;
        } catch (e) {
          console.error("[Dashboard] Failed to save snapshot:", e.message);
          monitoring.captureException(e, { operation: "dashboard.fetch.saveSnapshot", extra: { accountId: dashboardAccountId } });
          notifyAdminErrorAlert({
            flow: "dashboard-fetch",
            operation: "save-snapshot",
            account: acc,
            accountId: dashboardAccountId,
            error: e.message,
            dateFrom,
            dateTo,
            lastStage,
            recentLogs: childLogTail.slice(-10),
          });
        }
        safeResolve({
          success: true,
          rows: rows.length,
          enriched: Number(msg._analyticsEnriched || 0),
          snapshotMonth: msg.snapshotMonth,
          parseDiagnostics: msg.parseDiagnostics || null,
          enrichmentDiagnostics: msg.enrichmentDiagnostics || (msg.parseDiagnostics && msg.parseDiagnostics.enrichment) || null,
          debugSummary: dashboardDebugSummaryForRange(rows, msg.dateFrom || dateFrom || "", msg.dateTo || dateTo || "", msg.parseDiagnostics),
          lastStage,
          recentLogs: childLogTail.slice(-10)
        });
      } else if (msg.type === "error") {
        notifyAdminErrorAlert({
          flow: "dashboard-fetch",
          operation: "child-message",
          account: acc,
          accountId: dashboardAccountId,
          error: msg.error,
          dateFrom,
          dateTo,
          lastStage,
          recentLogs: childLogTail.slice(-10),
        });
        safeResolve({ success: false, error: msg.error, lastStage, recentLogs: childLogTail.slice(-10) });
      } else if (msg.type === "export-timestamp") {
        lastExportTimestamp = msg.timestamp || Date.now();
      } else if (msg.type === "debug-screenshot") {
        const message = `Debug screenshot saved for ${msg.label || "dashboard fetch"}: ${msg.path || ""}`;
        forwardDashboardLog(message, { stream: "debug" });
      } else if (msg.type === "taager-restart") {
        mainWindow.webContents.send("bot-log", `[Dashboard:${accountLabel}] Restarting export after ${msg.waitSeconds}s. Reason: ${msg.reason || "export retry"}`);
        mainWindow.webContents.send("bot-taager-restart", { ...msg, accountId: dashboardAccountId, accountLabel });
      } else if (msg.type === "cooldown") {
        mainWindow.webContents.send("bot-log", `[Dashboard:${accountLabel}] Waiting for Taager export file. Attempt ${msg.attempt}/${msg.maxAttempts}.`);
        mainWindow.webContents.send("bot-cooldown", { ...msg, accountId: dashboardAccountId, accountLabel });
      } else if (msg.type === "2fa-needed") {
        mainWindow.webContents.send("bot-2fa-needed", { ...msg, accountId: dashboardAccountId, accountLabel });
      } else if (msg.type === "google-login-needed") {
        openManualGoogleLoginChrome({ ...msg, accountId: dashboardAccountId, accountLabel }, child, {
          accountId: dashboardAccountId,
          accountLabel,
        });
      } else if (msg.type === "google-login-complete") {
        mainWindow.webContents.send("bot-google-login-complete", { ...msg, accountId: dashboardAccountId, accountLabel });
      } else if (msg.type === "session-event") {
        if (msg.site === "taager" && msg.event === "identity-verified") {
          bindTaagerAffiliateCode(dashboardAccountId, msg.affiliateCode);
        }
        mainWindow.webContents.send("bot-session-event", { ...msg, accountId: dashboardAccountId, accountLabel });
      }
    });

    child.on("error", (err) => {
      monitoring.captureException(err, { operation: "dashboard.fetch.childProcess", extra: { accountId: dashboardAccountId } });
      notifyAdminErrorAlert({
        flow: "dashboard-fetch",
        operation: "child-process",
        account: acc,
        accountId: dashboardAccountId,
        error: err.message,
        dateFrom,
        dateTo,
        lastStage,
        recentLogs: childLogTail.slice(-10),
      });
      safeResolve({ success: false, error: err.message, lastStage, recentLogs: childLogTail.slice(-10) });
    });
    child.on("exit", (code) => {
      if (!resolved && !killedByWatchdog) {
        const error = `Process exited with code ${code}`;
        notifyAdminErrorAlert({
          flow: "dashboard-fetch",
          operation: "child-exit",
          account: acc,
          accountId: dashboardAccountId,
          error,
          dateFrom,
          dateTo,
          lastStage,
          recentLogs: childLogTail.slice(-10),
        });
        safeResolve({ success: false, error, lastStage, recentLogs: childLogTail.slice(-10) });
      }
    });
  });
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Dashboard IPC Handlers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function staticDashboardAccount(accountId) {
  const accounts = store.get("accounts", []) || [];
  const account = accounts.find((item) => item && item.id === accountId);
  if (account) return account;
  if (accountId === "__single__" || (!accountId && !accounts.length)) {
    return {
      id: "__single__",
      taagerCountry: store.get("taagerCountry", "sa"),
      dashboardEnrichmentProvider: store.get("dashboardEnrichmentProvider", "none"),
      easyOrdersLookbackDays: store.get("easyOrdersLookbackDays", 60),
    };
  }
  return null;
}

function prepareStaticDashboardUpdate(payload = {}) {
  const accountId = String(payload.accountId || "").trim();
  const account = staticDashboardAccount(accountId);
  if (!account) throw new Error(`Dashboard account not found: ${accountId || "unknown"}`);
  const processed = processDashboardSheets({
    taagerBuffer: payload.taagerBuffer,
    easyOrdersBuffer: payload.easyOrdersBuffer || null,
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    country: account.taagerCountry || "sa",
    enrichmentEnabled: account.dashboardEnrichmentProvider === "easyorders" || account.dashboardEnrichmentProvider === "lightfunnels",
    easyOrdersLookbackDays: Number(account.easyOrdersLookbackDays || 60),
    skuNameCache: getDashboardSkuNameCache(accountId),
  });
  let normalizedRows = normalizeDashboardProfitRows(processed.rows);
  const existingRows = dashboardStore.get("accounts", {})[accountId]?.snapshot || [];
  normalizedRows = preserveExistingDashboardProductNames(normalizedRows, existingRows);
  const validation = validateDashboardSnapshotReplacement(existingRows, normalizedRows, processed.dateFrom, processed.dateTo, processed.parseDiagnostics);
  const periodMismatch = staticDashboardPeriodMismatch({ ...processed, rows: normalizedRows });
  if (periodMismatch) {
    processed.warnings = [
      ...(processed.warnings || []),
      periodMismatch.message,
    ];
  }
  return {
    accountId,
    processed: { ...processed, rows: normalizedRows },
    validation,
    periodMismatch,
    requiresConfirmation: validation.suspicious || normalizedRows.length === 0,
  };
}

function staticDashboardResult(prepared, extra = {}) {
  return {
    ok: true,
    accountId: prepared.accountId,
    rows: prepared.processed.rows.length,
    orders: prepared.validation.incoming.rawOrders,
    rawOrders: prepared.validation.incoming.rawOrders,
    netOrders: prepared.validation.incoming.netOrders,
    canceledByYou: prepared.validation.incoming.canceledByYou,
    dateFrom: prepared.processed.dateFrom,
    dateTo: prepared.processed.dateTo,
    snapshotMonth: prepared.processed.snapshotMonth,
    warnings: prepared.processed.warnings || [],
    parseDiagnostics: prepared.processed.parseDiagnostics,
    enrichmentDiagnostics: prepared.processed.enrichmentDiagnostics,
    validation: prepared.validation,
    periodMismatch: prepared.periodMismatch,
    canApply: !prepared.periodMismatch,
    blockedReason: prepared.periodMismatch ? prepared.periodMismatch.message : "",
    requiresConfirmation: prepared.requiresConfirmation,
    ...extra,
  };
}

ipcMain.handle("inspect-static-dashboard-update", async (_, payload) => {
  try {
    if (!(await isLicenseValid())) return { ok: false, error: "LICENSE_INVALID" };
    if (!licenseStore.get("dashboardEnabled", false)) return { ok: false, error: "DASHBOARD_NOT_ENABLED" };
    return staticDashboardResult(prepareStaticDashboardUpdate(payload));
  } catch (error) {
    monitoring.captureException(error, { operation: "dashboard.static.inspect", extra: { accountId: payload?.accountId } });
    return { ok: false, accountId: payload?.accountId || "", error: error.message };
  }
});

ipcMain.handle("apply-static-dashboard-update", async (_, payload) => {
  try {
    if (!(await isLicenseValid())) return { ok: false, error: "LICENSE_INVALID" };
    if (!licenseStore.get("dashboardEnabled", false)) return { ok: false, error: "DASHBOARD_NOT_ENABLED" };
    const prepared = prepareStaticDashboardUpdate(payload);
    if (prepared.periodMismatch) {
      return staticDashboardResult(prepared, {
        ok: false,
        saved: false,
        blocked: true,
        error: prepared.periodMismatch.message,
      });
    }
    const persisted = persistDashboardSnapshot(prepared.accountId, {
      snapshot: prepared.processed.rows,
      dateFrom: prepared.processed.dateFrom,
      dateTo: prepared.processed.dateTo,
      snapshotMonth: prepared.processed.snapshotMonth,
      parseDiagnostics: prepared.processed.parseDiagnostics,
      enrichmentDiagnostics: prepared.processed.enrichmentDiagnostics,
      warnings: prepared.processed.warnings,
    }, {
      source: "static-upload",
      timestampKey: "staticUploadTimestamp",
      requireConfirmation: true,
      allowSuspiciousReplacement: payload.allowSuspiciousReplacement === true,
    });
    if (!persisted.saved) return staticDashboardResult(prepared, { saved: false });
    const skuCacheUpdate = mergeDashboardSkuNameCache(prepared.accountId, prepared.processed.learnedSkuNameMap || {});
    if (prepared.processed.enrichmentDiagnostics && prepared.processed.enrichmentDiagnostics.provider === "easyorders") {
      prepared.processed.enrichmentDiagnostics = {
        ...prepared.processed.enrichmentDiagnostics,
        skuNameCacheAdded: skuCacheUpdate.added,
        skuNameCacheUpdated: skuCacheUpdate.updated,
        skuNameCacheTotal: skuCacheUpdate.total,
      };
      if (prepared.processed.parseDiagnostics && prepared.processed.parseDiagnostics.enrichment) {
        prepared.processed.parseDiagnostics.enrichment = prepared.processed.enrichmentDiagnostics;
      }
    }
    return staticDashboardResult(prepared, {
      saved: true,
      storedRows: persisted.mergedRows.length,
      enriched: persisted.enriched,
    });
  } catch (error) {
    monitoring.captureException(error, { operation: "dashboard.static.apply", extra: { accountId: payload?.accountId } });
    return { ok: false, accountId: payload?.accountId || "", error: error.message };
  }
});

ipcMain.handle("save-dashboard-snapshot", async (_, accountId, data) => {
  try {
    const persisted = persistDashboardSnapshot(accountId, data, { source: "manual-snapshot", timestampKey: "manualFetchTimestamp" });
    return { ok: true, enriched: persisted.enriched };
  } catch (err) {
    console.error("[Dashboard] save-dashboard-snapshot error:", err.message);
    monitoring.captureException(err, { operation: "dashboard.saveSnapshot", extra: { accountId } });
    return { ok: false, error: err.message };
  }
});

function getDashboardSnapshotResult(accountId, knownRevision) {
  try {
    const allowedIds = (store.get("accounts", []) || []).map((account) => account && account.id).filter(Boolean);
    const accounts = reconcileDashboardSnapshotsWithAccounts();
    const revision = String(Number(dashboardStore.get("snapshotRevision", 0) || 0)) + "|" + allowedIds.join(",");
    if (knownRevision != null && String(knownRevision) === revision) {
      return { ok: true, unchanged: true, revision, data: null };
    }
    if (accountId && accountId !== "__all__") {
      return { ok: true, revision, data: normalizeDashboardAccountSnapshot(accounts[accountId]) };
    }
    if (allowedIds.length) {
      const filtered = {};
      allowedIds.forEach((id) => {
        if (accounts[id]) filtered[id] = normalizeDashboardAccountSnapshot(accounts[id]);
      });
      Object.keys(accounts || {}).forEach((id) => {
        if (filtered[id]) return;
        const snapshot = accounts[id] && accounts[id].snapshot;
        if (Array.isArray(snapshot) && snapshot.length) filtered[id] = normalizeDashboardAccountSnapshot(accounts[id]);
      });
      return { ok: true, revision, data: filtered };
    }
    // Return all accounts
    return { ok: true, revision, data: normalizeDashboardAccountsSnapshot(accounts) };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.getSnapshot", extra: { accountId } });
    return { ok: false, data: null, error: err.message };
  }
}

const dashboardSnapshotTransportCache = new Map();
function getDashboardSnapshotTransport(accountId, knownRevision) {
  const totalStartedAt = Date.now();
  const resultStartedAt = Date.now();
  const result = getDashboardSnapshotResult(accountId, knownRevision);
  const resultMs = Date.now() - resultStartedAt;
  if (!result || !result.ok) {
    return {
      result,
      json: JSON.stringify(result),
      cacheHit: false,
      timings: { resultMs, stringifyMs: 0, gzipMs: 0, totalMs: Date.now() - totalStartedAt }
    };
  }
  const key = String(accountId || "__all__") + "|" + String(result.revision || "") + "|" + (result.unchanged ? "unchanged" : "data");
  let cached = dashboardSnapshotTransportCache.get(key);
  let cacheHit = true;
  if (!cached) {
    cacheHit = false;
    const stringifyStartedAt = Date.now();
    const json = JSON.stringify(result);
    const stringifyMs = Date.now() - stringifyStartedAt;
    const gzipStartedAt = Date.now();
    const gzipBytes = zlib.gzipSync(json, { level: 1 });
    const gzipMs = Date.now() - gzipStartedAt;
    cached = {
      json,
      gzipBytes,
      timings: { stringifyMs, gzipMs }
    };
    if (dashboardSnapshotTransportCache.size >= 2) dashboardSnapshotTransportCache.clear();
    dashboardSnapshotTransportCache.set(key, cached);
  }
  return {
    result,
    json: cached.json,
    gzipBytes: cached.gzipBytes,
    cacheHit,
    timings: {
      resultMs,
      stringifyMs: cacheHit ? 0 : cached.timings.stringifyMs,
      gzipMs: cacheHit ? 0 : cached.timings.gzipMs,
      totalMs: Date.now() - totalStartedAt
    }
  };
}

ipcMain.handle("get-dashboard-snapshot", async (_, accountId, knownRevision) => {
  return getDashboardSnapshotResult(accountId, knownRevision);
});

ipcMain.handle("get-dashboard-snapshot-json", async (_, accountId, knownRevision) => {
  return getDashboardSnapshotTransport(accountId, knownRevision).json;
});

ipcMain.handle("get-dashboard-snapshot-gzip", async (_, accountId, knownRevision) => {
  const transport = getDashboardSnapshotTransport(accountId, knownRevision);
  const gzipBytes = transport.gzipBytes || zlib.gzipSync(transport.json, { level: 1 });
  return {
    encoding: "gzip",
    data: gzipBytes,
    revision: transport.result && transport.result.revision,
    unchanged: !!(transport.result && transport.result.unchanged),
    cacheHit: !!transport.cacheHit,
    timings: transport.timings || null
  };
});

ipcMain.handle("get-dashboard-query-flags", async () => ({
  ok: true,
  shadow: process.env.TAAGER_DASHBOARD_QUERY_SHADOW === "1",
  orders: process.env.TAAGER_DASHBOARD_QUERY_ORDERS === "1",
  products: process.env.TAAGER_DASHBOARD_QUERY_PRODUCTS === "1",
  campaigns: process.env.TAAGER_DASHBOARD_QUERY_CAMPAIGNS === "1",
  cities: process.env.TAAGER_DASHBOARD_QUERY_CITIES === "1" || process.env.TAAGER_DASHBOARD_QUERY_PRODUCTS === "1",
  lazyMarketing: process.env.TAAGER_DASHBOARD_LAZY_MARKETING !== "0",
  incrementalMarketing: marketingIncrementalSyncEnabled(),
}));

ipcMain.handle("query-dashboard-data", async (_, payload = {}) => {
  const startedAt = Date.now();
  try {
    const result = dashboardQueryService.query(payload);
    return { ...result, durationMs: Date.now() - startedAt, revision: Number(dashboardStore.get("snapshotRevision", 0) || 0) };
  } catch (error) {
    monitoring.captureException(error, { operation: "dashboard.query", extra: { kind: payload && payload.kind } });
    return { ok: false, error: error.message, durationMs: Date.now() - startedAt };
  }
});

ipcMain.handle("get-product-alert-settings", async () => {
  const settings = readProductAlertSettings();
  const state = readProductAlertState();
  let telegramConnection = { ok: true, connected: false, status: "unknown" };
  if (settings.telegram && settings.telegram.mode === "backend") {
    try {
      telegramConnection = await getTelegramBackendConnectionStatus(productAlertBackendOptions());
    } catch (error) {
      telegramConnection = { ok: false, connected: false, error: error.message };
    }
  }
  return {
    ok: true,
    settings: publicProductAlertSettings(settings),
    history: state.history || [],
    telegramConnection,
    accounts: (store.get("accounts", []) || []).map((account) => ({
      id: account && account.id,
      label: accountDisplayName(account, account && account.id),
    })).filter((account) => account.id),
  };
});

ipcMain.handle("save-product-alert-settings", async (_, payload = {}) => {
  try {
    const settings = writeProductAlertSettings(payload.settings || payload || {});
    return { ok: true, settings: publicProductAlertSettings(settings) };
  } catch (error) {
    monitoring.captureException(error, { operation: "productAlerts.saveSettings" });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("preview-product-alerts", async (_, payload = {}) => {
  try {
    return await previewProductAlerts(payload.settings || readProductAlertSettings(), payload.options || {});
  } catch (error) {
    monitoring.captureException(error, { operation: "productAlerts.preview" });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("test-product-alert-telegram", async (_, payload = {}) => {
  try {
    const current = readProductAlertSettings();
    const incoming = payload.settings || current;
    const incomingToken = incoming && incoming.telegram && Object.prototype.hasOwnProperty.call(incoming.telegram, "botToken")
      ? incoming.telegram.botToken
      : current.telegram && current.telegram.botToken;
    const settings = normalizeProductAlertSettings({
      ...current,
      ...incoming,
      telegram: {
        ...(current.telegram || {}),
        ...((incoming && incoming.telegram) || {}),
        botToken: incomingToken === "********"
          ? current.telegram && current.telegram.botToken || ""
          : incomingToken,
      },
      rule: {
        ...(current.rule || {}),
        ...((incoming && incoming.rule) || {}),
      },
    });
    const delivery = await sendTelegram(settings.telegram, buildProductAlertTestMessage({ lang: payload.options && payload.options.lang || "en" }), productAlertBackendOptions());
    return delivery && delivery.ok ? { ok: true, delivery } : { ok: false, error: delivery && delivery.error || "TELEGRAM_SEND_FAILED" };
  } catch (error) {
    monitoring.captureException(error, { operation: "productAlerts.testTelegram" });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("create-product-alert-telegram-connection", async () => {
  try {
    return await createTelegramBackendConnection(productAlertBackendOptions());
  } catch (error) {
    monitoring.captureException(error, { operation: "productAlerts.createTelegramConnection" });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("get-product-alert-telegram-connection-status", async () => {
  try {
    return await getTelegramBackendConnectionStatus(productAlertBackendOptions());
  } catch (error) {
    monitoring.captureException(error, { operation: "productAlerts.telegramConnectionStatus" });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("run-product-alerts-now", async (_, payload = {}) => {
  try {
    return await runProductAlerts({ ...(payload.options || {}), force: true, ignoreCooldown: payload.ignoreCooldown === true, trigger: "manual" });
  } catch (error) {
    monitoring.captureException(error, { operation: "productAlerts.runNow" });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("export-dashboard-orders-query", async (_, payload = {}) => {
  try {
    const result = dashboardQueryService.query({ ...payload, kind: "orders", allRows: true, page: 1 });
    if (!result || !result.ok) return result || { ok: false, error: "DASHBOARD_EXPORT_FAILED" };
    const rows = (result.rows || []).map((row) => ({
      Account: row.accountLabel || row.accountId || "",
      "Order Number": row.taagerOrderNumber || row.orderNumber || row.id || "",
      Customer: row.customerName || row.name || "",
      Phone: (row.phone || row.phone1 || row.phone2 || "").toString().replace(/[\s\-\+]/g, "").replace(/^966/, "0"),
      City: row.city || "",
      Products: row.products || "",
      SKUs: row.sku || "",
      Status: row.orderStatus || row.status || row.statusBucket || "",
      Date: row.createdAt || row.date || "",
      Total: row.dashboardTotalPrice || row.totalPrice || 0,
      "Profit After Tax": row.profitAfterTax || row.taagerProfit || 0,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Orders");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const filename = `dashboard-orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const { filePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: filename, filters: [{ name: "Excel", extensions: ["xlsx"] }] });
    if (!filePath) return { ok: true, saved: false };
    fs.writeFileSync(filePath, buffer);
    return { ok: true, saved: true, path: filePath, rows: rows.length };
  } catch (error) {
    monitoring.captureException(error, { operation: "dashboard.query.exportOrders" });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("get-dashboard-auto-ts", async (_, accountId) => {
  try {
    const accounts = dashboardStore.get("accounts", {});
    const ts = accounts[accountId]?.autoFetchTimestamp || null;
    return { ok: true, ts };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.getAutoTimestamp", extra: { accountId } });
    return { ok: false, ts: null, error: err.message };
  }
});

ipcMain.handle("set-dashboard-auto-ts", async (_, accountId, ts) => {
  try {
    const accounts = dashboardStore.get("accounts", {});
    if (!accounts[accountId]) accounts[accountId] = {};
    accounts[accountId].autoFetchTimestamp = ts;
    dashboardStore.set("accounts", accounts);
    return { ok: true };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.setAutoTimestamp", extra: { accountId } });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("clear-dashboard-data", async () => {
  try {
    dashboardStore.set("accounts", {});
    bumpDashboardSnapshotRevision();
    analyticsSnapshotSyncCacheKey = "";
    return { ok: true };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.clear" });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-dashboard-enabled", async () => {
  return licenseStore.get("dashboardEnabled", false);
});

function marketingAccountKey(accountId, allowAll = false) {
  const clean = String(accountId || "").trim();
  return clean && (allowAll || clean !== "__all__") ? clean : "";
}

function marketingStableAccountKey(accountId) {
  const clean = String(accountId || "").trim();
  if (!clean || clean === "__all__") return clean;
  const account = getStoredAccountById(clean);
  const stable = account && (taagerMarketingKeyOf(account) || account.taagerEmail || account.lightfunnelsEmail || account.easyEmail || account.lightfunnelsAccountName || account.label || "");
  return String(stable || clean).trim().toLowerCase();
}

function marketingAccountLookupKeys(accountId) {
  const clean = String(accountId || "").trim();
  const account = getStoredAccountById(clean);
  const values = [
    clean,
    account && taagerMarketingKeyOf(account),
    account && taagerLoginIdentityOf(account),
    account && account.taagerPhone,
    account && account.taagerEmail,
    account && account.lightfunnelsEmail,
    account && account.lightfunnelsAccountName,
    account && cmsDisplayNameOf(account),
    account && cmsEmailOf(account),
    account && account.easyEmail,
    account && account.email,
    account && account.label,
    account && account.name,
    account && account.memberName,
    accountDisplayName(account, ""),
  ];
  const keys = [];
  values.forEach((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (key && !keys.includes(key)) keys.push(key);
  });
  return keys;
}

function normalizeMarketingAccountSettings(settings = []) {
  const supplied = Array.isArray(settings) ? settings : [];
  const suppliedById = new Map();
  supplied.forEach((setting) => {
    const id = String(setting && setting.dashboardAccountId || "").trim();
    if (id) suppliedById.set(id, setting);
  });
  const accounts = store.get("accounts", []) || [];
  const base = accounts
    .map((account) => String(account && account.id || "").trim())
    .filter((id) => id && id !== "__all__");
  supplied.forEach((setting) => {
    const id = String(setting && setting.dashboardAccountId || "").trim();
    if (id && id !== "__all__" && !base.includes(id)) base.push(id);
  });
  return base.map((id) => {
    const setting = suppliedById.get(id) || {};
    const account = accounts.find((candidate) => String(candidate && candidate.id || "").trim() === id) || {};
    const countryCurrency = account.taagerCountry === "eg" ? "EGP" :
      account.taagerCountry === "ae" ? "AED" :
      account.taagerCountry === "iq" ? "IQD" :
      account.taagerCountry === "om" ? "OMR" : "SAR";
    const lookupKeys = marketingAccountLookupKeys(id);
    const explicitKeys = Array.isArray(setting.dashboardAccountKeys)
      ? setting.dashboardAccountKeys.map((key) => String(key || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const allKeys = [...new Set([...(explicitKeys || []), ...lookupKeys])];
    return {
      ...setting,
      dashboardAccountId: id,
      dashboardAccountKey: String(setting.dashboardAccountKey || marketingStableAccountKey(id) || id).trim().toLowerCase(),
      dashboardAccountKeys: allKeys,
      currency: setting.currency || countryCurrency,
      egpRate: Number(setting.egpRate) || 52,
      exchangeRates: normalizeMarketingRates(setting.exchangeRates, setting.egpRate),
    };
  });
}

const TAAGER_USD_RATES = { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };
const TAAGER_RATE_CURRENCIES = Object.keys(TAAGER_USD_RATES);

function marketingCurrency(value, fallback = "USD") {
  const cur = String(value || fallback || "USD").trim().toUpperCase();
  return TAAGER_USD_RATES[cur] ? cur : String(fallback || "USD").toUpperCase();
}

function convertMarketingAmount(amount, from, to, egpRate = 52, exchangeRates = null) {
  const source = marketingCurrency(from);
  const target = marketingCurrency(to, source);
  if (source === target) return Number(amount || 0) || 0;
  const rates = normalizeMarketingRates(exchangeRates, egpRate);
  return ((Number(amount || 0) || 0) / Number(rates[source] || 1)) * Number(rates[target] || 1);
}

function normalizeMarketingRates(rawRates, egpRate) {
  const out = { ...TAAGER_USD_RATES };
  const source = rawRates && typeof rawRates === "object" ? rawRates : {};
  TAAGER_RATE_CURRENCIES.forEach((currency) => {
    const value = Number(source[currency]);
    if (Number.isFinite(value) && value > 0) out[currency] = value;
  });
  const explicitEgp = Number(egpRate);
  if (Number.isFinite(explicitEgp) && explicitEgp > 0) out.EGP = explicitEgp;
  out.USD = 1;
  return out;
}

function marketingIncrementalSyncEnabled() {
  return process.env.TAAGER_MARKETING_INCREMENTAL_SYNC !== "0";
}

function stripMarketingRateSettings(settings = []) {
  return (Array.isArray(settings) ? settings : []).map((setting) => {
    if (!setting || typeof setting !== "object") return setting;
    const { exchangeRates, egpRate, ...rest } = setting;
    return rest;
  });
}

function marketingRatesChanged(summary, range) {
  const current = normalizeMarketingRates(range && range.exchangeRates, range && range.egpRate);
  const cached = summary && summary.exchangeRates
    ? normalizeMarketingRates(summary.exchangeRates, summary.egpRate)
    : normalizeMarketingRates(null, summary && summary.egpRate);
  return TAAGER_RATE_CURRENCIES.some((currency) => {
    return Math.abs(Number(cached[currency] || 0) - Number(current[currency] || 0)) >= 0.0001;
  });
}

function mergeMarketingSourceAccounts(...lists) {
  const byId = new Map();
  lists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((account) => {
      const id = String(account && account.id || "").trim();
      if (!id) return;
      byId.set(id, { ...(byId.get(id) || {}), ...account, id });
    });
  });
  return Array.from(byId.values());
}

function mergeMarketingMappings(...items) {
  const out = {};
  items.forEach((mappings) => {
    if (!mappings || typeof mappings !== "object") return;
    Object.keys(mappings).forEach((key) => {
      out[key] = mergeMarketingSourceAccounts(out[key], mappings[key]);
    });
  });
  return out;
}

function mappedMarketingSourcesForKeys(mappings, keys) {
  const source = mappings && typeof mappings === "object" ? mappings : {};
  const lookup = (Array.isArray(keys) ? keys : [])
    .map((key) => String(key || "").trim().toLowerCase())
    .filter(Boolean);
  for (const key of lookup) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function marketingSourceAccountSignature(list) {
  return (Array.isArray(list) ? list : [])
    .map((source) => String(source && source.id || "").trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

function marketingDiagnosticFingerprint(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return crypto.createHash("sha256").update(clean).digest("hex").slice(0, 12);
}

function marketingDiagnosticAccountIds(list) {
  const ids = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const id = String(item && (
      item.id ||
      item.accountId ||
      item.account_id ||
      item.sourceAccountId ||
      item.source_account_id ||
      item.adAccountId ||
      item.ad_account_id ||
      item.account ||
      ""
    ) || "").trim();
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

function marketingDiagnosticMappingIds(mappings) {
  const out = {};
  if (!mappings || typeof mappings !== "object") return out;
  Object.keys(mappings).forEach((key) => {
    out[key] = marketingDiagnosticAccountIds(mappings[key]);
  });
  return out;
}

function marketingDiagnosticUrlFingerprints(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return {};
  try {
    const parsed = new URL(value);
    const fingerprints = {};
    parsed.searchParams.forEach((paramValue, paramName) => {
      const lower = String(paramName || "").toLowerCase();
      if (/(^|_)(access|refresh)?token($|_)|authorization|code|state|secret|key/.test(lower)) {
        fingerprints[paramName] = marketingDiagnosticFingerprint(paramValue);
      }
    });
    return {
      host: parsed.hostname,
      path: parsed.pathname,
      paramFingerprints: fingerprints,
    };
  } catch (_) {
    return { malformed: true, fingerprint: marketingDiagnosticFingerprint(value) };
  }
}

function marketingSensitiveDiagnosticKey(key) {
  const lower = String(key || "").toLowerCase();
  if (!lower) return false;
  if (lower.includes("fingerprint") || lower.endsWith("present") || lower.endsWith("count")) return false;
  return lower.includes("access_token") ||
    lower.includes("refresh_token") ||
    lower.includes("authorizationurl") ||
    lower.includes("authorization_url") ||
    lower === "token" ||
    lower.endsWith("token") ||
    lower.includes("secret") ||
    lower.includes("apikey") ||
    lower.includes("api_key");
}

function sanitizeMarketingDiagnostics(value, key = "") {
  if (marketingSensitiveDiagnosticKey(key)) {
    return { present: !!value, fingerprint: marketingDiagnosticFingerprint(value) };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeMarketingDiagnostics(item));
  if (!value || typeof value !== "object") return value;
  const out = {};
  Object.keys(value).forEach((childKey) => {
    out[childKey] = sanitizeMarketingDiagnostics(value[childKey], childKey);
  });
  return out;
}

function marketingStatusAccountIdSnapshot(status) {
  return {
    linked: marketingDiagnosticAccountIds(status && status.linkedAccounts),
    mapped: marketingDiagnosticAccountIds(status && status.mappedAccounts),
    available: marketingDiagnosticAccountIds(status && status.availableAccounts),
    claimable: marketingDiagnosticAccountIds(status && status.claimableAccounts),
    mappings: marketingDiagnosticMappingIds(status && status.mappings),
  };
}

function marketingResultLogSummary(result) {
  const summary = result && result.summary && typeof result.summary === "object" ? result.summary : null;
  const diagnostics = result && result.diagnostics && typeof result.diagnostics === "object" ? result.diagnostics : {};
  return {
    ok: !!(result && result.ok),
    status: result && result.status || "",
    error: result && result.error || "",
    linkedAccountCount: result && result.linkedAccountCount || 0,
    mappedAccountCount: result && Array.isArray(result.mappedAccounts) ? result.mappedAccounts.length : 0,
    availableAccountCount: result && Array.isArray(result.availableAccounts) ? result.availableAccounts.length : 0,
    claimableAccountCount: result && Array.isArray(result.claimableAccounts) ? result.claimableAccounts.length : 0,
    cacheStatus: result && result.cache && result.cache.status || "",
    providerRequestCount: result && result.cache && result.cache.providerRequestCount || diagnostics.providerRequestCount || 0,
    diagnostics: {
      clientRequestId: diagnostics.clientRequestId || "",
      accountConnected: diagnostics.accountConnected,
      accountConnectionVerified: diagnostics.accountConnectionVerified,
      authorizationPending: diagnostics.authorizationPending,
      discoveredAccountCount: diagnostics.discoveredAccountCount,
      sessionAccountCount: diagnostics.sessionAccountCount,
      staleMappingPrunedCount: diagnostics.staleMappingPrunedCount,
      staleMappingPruneReason: diagnostics.staleMappingPruneReason,
      providerGroupCount: diagnostics.providerGroupCount,
      providerRefs: diagnostics.providerRefs,
      sourceProviderRefs: diagnostics.sourceProviderRefs,
      providerOwnershipCorrectedCount: diagnostics.providerOwnershipCorrectedCount,
      claimProviderKeyId: diagnostics.claimProviderKeyId,
      claimProviderChanged: diagnostics.claimProviderChanged,
      releaseProviderKeyId: diagnostics.releaseProviderKeyId,
    },
    summary: summary ? {
      adSpend: summary.adSpend,
      currency: summary.currency,
      rowCount: summary.rowCount,
      campaignCount: summary.campaignCount,
    } : null,
  };
}

function marketingDiagnosticTokenFingerprintFromDiagnostics(diagnostics) {
  const source = diagnostics && typeof diagnostics === "object" ? diagnostics : {};
  const candidates = [
    source.tokenFingerprint,
    source.accessTokenFingerprint,
    source.access_token_fingerprint,
    source.storedTokenFingerprint,
    source.previousTokenFingerprint,
    source.previousStoredTokenFingerprint,
  ];
  for (const candidate of candidates) {
    const clean = String(candidate || "").trim();
    if (clean) return clean;
  }
  return "";
}

function getCachedMarketingStatus(accountId, platform) {
  const accounts = dashboardStore.get("accounts", {});
  if (accountId === "__all__") {
    const storedAll = accounts.__all__?.marketing?.[platform] || null;
    const individualStatuses = Object.keys(accounts)
      .filter((id) => id !== "__all__" && id !== "__connection__")
      .map((id) => accounts[id]?.marketing?.[platform])
      .filter(Boolean);

    if (individualStatuses.length === 0) return storedAll;

    const connectedStatuses = individualStatuses.filter((s) => s.status === "connected");
    if (connectedStatuses.length === 0) {
      return {
        platform,
        status: storedAll && (storedAll.status === "connected" || storedAll.status === "pending") ? storedAll.status : "disconnected",
        lastSyncAt: storedAll && storedAll.lastSyncAt || null,
        summary: storedAll && storedAll.summary || null,
        linkedAccounts: storedAll && Array.isArray(storedAll.linkedAccounts) ? storedAll.linkedAccounts : [],
        mappedAccounts: storedAll && Array.isArray(storedAll.mappedAccounts) ? storedAll.mappedAccounts : [],
        availableAccounts: storedAll && Array.isArray(storedAll.availableAccounts) ? storedAll.availableAccounts : [],
        mappings: storedAll && storedAll.mappings || {},
        limits: storedAll && storedAll.limits || null,
        diagnostics: storedAll && storedAll.diagnostics || null,
        statusCheckedAt: storedAll && storedAll.statusCheckedAt || null,
      };
    }

    const allSummary = connectedStatuses.reduce((summary, s) => {
      const source = s.summary || {};
      summary.adSpend += convertMarketingAmount(source.adSpend || 0, source.currency || "USD", "USD", source.egpRate || 52, source.exchangeRates || null);
      summary.impressions += Number(source.impressions || 0);
      summary.clicks += Number(source.clicks || 0);
      summary.campaignCount += Number(source.campaignCount || 0);
      summary.rowCount += Number(source.rowCount || 0);
      summary.sourceBreakdown = summary.sourceBreakdown.concat(Array.isArray(source.sourceBreakdown) ? source.sourceBreakdown : []);
      summary.campaignBreakdown = summary.campaignBreakdown.concat(Array.isArray(source.campaignBreakdown) ? source.campaignBreakdown : []);
      return summary;
    }, {
      adSpend: 0,
      currency: "USD",
      impressions: 0,
      clicks: 0,
      campaignCount: 0,
      rowCount: 0,
      dateFrom: "",
      dateTo: "",
      sourceBreakdown: [],
      campaignBreakdown: [],
    });

    allSummary.adSpend = Number(allSummary.adSpend.toFixed(2));

    let latestSyncAt = null;
    let oldestStatusCheckedAt = null;
    let minDateFrom = "";
    let maxDateTo = "";
    connectedStatuses.forEach((s) => {
      if (s.lastSyncAt) {
        if (!latestSyncAt || new Date(s.lastSyncAt) > new Date(latestSyncAt)) {
          latestSyncAt = s.lastSyncAt;
        }
      }
      if (s.statusCheckedAt) {
        if (!oldestStatusCheckedAt || new Date(s.statusCheckedAt) < new Date(oldestStatusCheckedAt)) {
          oldestStatusCheckedAt = s.statusCheckedAt;
        }
      }
      const source = s.summary || {};
      if (source.dateFrom) {
        if (!minDateFrom || new Date(source.dateFrom) < new Date(minDateFrom)) {
          minDateFrom = source.dateFrom;
        }
      }
      if (source.dateTo) {
        if (!maxDateTo || new Date(source.dateTo) > new Date(maxDateTo)) {
          maxDateTo = source.dateTo;
        }
      }
    });

    allSummary.dateFrom = minDateFrom;
    allSummary.dateTo = maxDateTo;

    const linkedAccountsMap = new Map();
    const combinedMappings = {};
    individualStatuses.forEach((s) => {
      if (Array.isArray(s.linkedAccounts)) {
        s.linkedAccounts.forEach((acc) => {
          if (acc && acc.id) linkedAccountsMap.set(acc.id, acc);
        });
      }
      if (s.mappings) {
        Object.assign(combinedMappings, s.mappings);
      }
    });

    return {
      platform,
      status: "connected",
      lastSyncAt: latestSyncAt,
      summary: allSummary,
      sourceAccountName: `${connectedStatuses.length} synced accounts`,
      sourceAccountId: "",
      linkedAccounts: mergeMarketingSourceAccounts(storedAll && storedAll.linkedAccounts, Array.from(linkedAccountsMap.values())),
      mappedAccounts: mergeMarketingSourceAccounts(storedAll && storedAll.mappedAccounts),
      selectedSourceAccounts: mergeMarketingSourceAccounts(storedAll && storedAll.selectedSourceAccounts),
      selectedSourceAccountIds: storedAll && Array.isArray(storedAll.selectedSourceAccountIds) ? storedAll.selectedSourceAccountIds : [],
      availableAccounts: mergeMarketingSourceAccounts(storedAll && storedAll.availableAccounts),
      mappings: mergeMarketingMappings(storedAll && storedAll.mappings, combinedMappings),
      limits: storedAll && storedAll.limits || null,
      diagnostics: storedAll && storedAll.diagnostics || null,
      statusCheckedAt: oldestStatusCheckedAt,
    };
  }

  const account = accounts[accountId] || {};
  const marketing = account.marketing || {};
  return marketing[platform] || null;
}

function stableMarketingValue(value) {
  if (Array.isArray(value)) return value.map(stableMarketingValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = stableMarketingValue(value[key]);
    return out;
  }, {});
}

function marketingRevisionValue(status) {
  const mappings = status && status.mappings && typeof status.mappings === "object" ? status.mappings : {};
  return JSON.stringify(stableMarketingValue({
    status: status && status.status || "disconnected",
    summary: status && status.summary || null,
    sourceAccountId: status && status.sourceAccountId || "",
    linkedAccounts: status && status.linkedAccounts || [],
    mappedAccounts: status && status.mappedAccounts || [],
    selectedSourceAccounts: status && status.selectedSourceAccounts || [],
    selectedSourceAccountIds: status && status.selectedSourceAccountIds || [],
    availableAccounts: status && status.availableAccounts || [],
    mappings,
    reconnectRequired: !!(status && status.reconnectRequired),
    partial: !!(status && status.partial),
    errors: status && status.errors || [],
    accountErrors: status && status.accountErrors || [],
    accountHealth: status && status.accountHealth || [],
  }));
}

function hasMarketingConnectionPayload(status) {
  return !!(status && (
    status.summary ||
    (Array.isArray(status.linkedAccounts) && status.linkedAccounts.length) ||
    (Array.isArray(status.mappedAccounts) && status.mappedAccounts.length) ||
    (Array.isArray(status.availableAccounts) && status.availableAccounts.length) ||
    (status.mappings && typeof status.mappings === "object" && Object.keys(status.mappings).length)
  ));
}

function isPendingMarketingStatus(status) {
  const state = String(status && status.status || "").toLowerCase();
  return !!(status && (state === "pending" || status.authorizationUrl || status.awaitingAuthorization));
}

function saveCachedMarketingStatus(accountId, platform, status) {
  if (!accountId || !status) return;
  const accounts = dashboardStore.get("accounts", {});
  if (!accounts[accountId]) accounts[accountId] = {};
  if (!accounts[accountId].marketing) accounts[accountId].marketing = {};
  const previous = accounts[accountId].marketing[platform] || null;
  const preservePreviousPayload = hasMarketingConnectionPayload(previous) &&
    isPendingMarketingStatus(status) &&
    !hasMarketingConnectionPayload(status);
  const next = {
    platform,
    provider: status.provider || previous && previous.provider || "",
    status: status.status || (isPendingMarketingStatus(status) ? "pending" : "disconnected"),
    statusCheckedAt: status.statusCheckedAt || previous && previous.statusCheckedAt || null,
    lastSyncAt: preservePreviousPayload ? previous.lastSyncAt || null : status.lastSyncAt || null,
    summary: preservePreviousPayload ? previous.summary || null : status.summary || null,
    sourceAccountName: status.sourceAccountName || preservePreviousPayload && previous.sourceAccountName || "",
    sourceAccountId: status.sourceAccountId || preservePreviousPayload && previous.sourceAccountId || "",
    linkedAccounts: preservePreviousPayload ? previous.linkedAccounts || [] : Array.isArray(status.linkedAccounts) ? status.linkedAccounts : [],
    mappedAccounts: preservePreviousPayload ? previous.mappedAccounts || [] : Array.isArray(status.mappedAccounts) ? status.mappedAccounts : [],
    selectedSourceAccounts: preservePreviousPayload ? previous.selectedSourceAccounts || [] : Array.isArray(status.selectedSourceAccounts) ? status.selectedSourceAccounts : [],
    selectedSourceAccountIds: preservePreviousPayload ? previous.selectedSourceAccountIds || [] : Array.isArray(status.selectedSourceAccountIds) ? status.selectedSourceAccountIds : [],
    availableAccounts: preservePreviousPayload ? previous.availableAccounts || [] : Array.isArray(status.availableAccounts) ? status.availableAccounts : [],
    diagnostics: status.diagnostics || null,
    reconnectRequired: !!status.reconnectRequired,
    error: status.error || "",
    limit: status.limit || null,
    limits: status.limits || null,
    mappings: preservePreviousPayload ? previous.mappings || {} : status.mappings || {},
    cache: status.cache || null,
    partial: !!status.partial,
    errors: Array.isArray(status.errors) ? status.errors.slice() : [],
    accountErrors: Array.isArray(status.accountErrors) ? status.accountErrors.slice() : [],
    accountHealth: Array.isArray(status.accountHealth) ? status.accountHealth.slice() : [],
    stale: !!status.stale,
  };
  accounts[accountId].marketing[platform] = next;
  dashboardStore.set("accounts", accounts);
  const changed = marketingRevisionValue(previous) !== marketingRevisionValue(next);
  if (changed) bumpDashboardMarketingRevision();
  return changed;
}

function saveCachedAllMarketingMappingStatus(platform, result, options = {}) {
  if (!result || !result.ok) return;
  saveCachedMarketingStatus("__all__", platform, result);
  const mappings = result.mappings && typeof result.mappings === "object" ? result.mappings : {};
  const knownAccounts = mergeMarketingSourceAccounts(result.availableAccounts, result.linkedAccounts, result.mappedAccounts);
  const settings = normalizeMarketingAccountSettings([]);
  settings.forEach((setting) => {
    const sourceAccounts = mappedMarketingSourcesForKeys(mappings, [
      setting.dashboardAccountId,
      setting.dashboardAccountKey,
      ...(Array.isArray(setting.dashboardAccountKeys) ? setting.dashboardAccountKeys : []),
    ]);
    const previous = getCachedMarketingStatus(setting.dashboardAccountId, platform);
    const sameSources = marketingSourceAccountSignature(previous && previous.mappedAccounts) === marketingSourceAccountSignature(sourceAccounts);
    const preserveSummary = !!options.preserveExistingSummary && sameSources && sourceAccounts.length > 0;
    saveCachedMarketingStatus(setting.dashboardAccountId, platform, {
      platform,
      status: sourceAccounts.length ? "connected" : "disconnected",
      linkedAccounts: sourceAccounts,
      mappedAccounts: sourceAccounts,
      availableAccounts: sourceAccounts.length ? [] : knownAccounts,
      mappings,
      limit: result.limits && result.limits[setting.dashboardAccountId] || null,
      summary: preserveSummary ? previous && previous.summary || null : null,
      lastSyncAt: preserveSummary ? previous && previous.lastSyncAt || null : null,
      statusCheckedAt: result.statusCheckedAt || null,
      cache: result.cache || null,
    });
  });
}

async function callMarketingBackend(action, accountId, platform, range) {
  const requestStartedAt = Date.now();
  const dashboardAccountId = marketingAccountKey(accountId, action !== "sync");
  if (!dashboardAccountId) return { ok: false, error: "SELECT_SINGLE_ACCOUNT" };
  if (!["tiktok", "snapchat", "facebook"].includes(platform)) return { ok: false, error: "PLATFORM_NOT_AVAILABLE" };
  if (!(await isLicenseValid())) return { ok: false, error: "LICENSE_INVALID" };

  const licenseKey = licenseStore.get("licenseKey", "");
  const account = getStoredAccountById(dashboardAccountId);
  const dashboardAccountKey = marketingStableAccountKey(dashboardAccountId);
  const clientRequestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const previousStatus = getCachedMarketingStatus(dashboardAccountId, platform);
  const previousDiagnostics = previousStatus && previousStatus.diagnostics || {};
  const connectSnapshotIds = marketingStatusAccountIdSnapshot(previousStatus);
  const previousTokenFingerprint = marketingDiagnosticTokenFingerprintFromDiagnostics(previousDiagnostics);
  log.info("[Marketing][Main] request", {
    clientRequestId,
    action,
    mode: range && range.mode ? range.mode : "",
    platform,
    dashboardAccountId,
    dashboardAccountKey,
    sourceAccountId: range && range.sourceAccountId ? range.sourceAccountId : "",
    sourceAccountIds: range && Array.isArray(range.sourceAccountIds) ? range.sourceAccountIds : [],
    sourceAccounts: range && Array.isArray(range.sourceAccounts) ? range.sourceAccounts : [],
    mappings: range && Array.isArray(range.mappings) ? range.mappings : [],
    targetCurrency: range && range.targetCurrency ? range.targetCurrency : "",
    egpRate: range && range.egpRate ? range.egpRate : null,
    exchangeRates: range && range.exchangeRates && typeof range.exchangeRates === "object"
      ? normalizeMarketingRates(range.exchangeRates, range.egpRate)
      : null,
    accountSettings: range && Array.isArray(range.accountSettings) ? range.accountSettings : [],
    dateFrom: range && range.dateFrom ? range.dateFrom : "",
    dateTo: range && range.dateTo ? range.dateTo : "",
  });
  if (action === "connect" || action === "status") {
    log.info("[Marketing][Diagnostics] before request", {
      clientRequestId,
      action,
      mode: range && range.mode ? range.mode : "",
      platform,
      dashboardAccountId,
      previousTokenFingerprint,
      connectSnapshotIds,
      mappedIds: connectSnapshotIds.mappings,
    });
  }
  const includeRatePayload = action === "sync" || action === "sync_all";
  const accountSettingsPayload = range && Array.isArray(range.accountSettings)
    ? (includeRatePayload ? range.accountSettings : stripMarketingRateSettings(range.accountSettings))
    : (action === "status" && dashboardAccountId === "__all__" ? stripMarketingRateSettings(normalizeMarketingAccountSettings([])) : []);
  const result = await supabaseFunctionRequest("windsor-marketing", {
    clientRequestId,
    diagnosticsRequested: true,
    action,
    mode: range && range.mode ? range.mode : undefined,
    platform,
    dashboardAccountId,
    dashboardAccountKey,
    dashboardAccountLabel: accountDisplayName(account, dashboardAccountId),
    sourceAccountId: range && range.sourceAccountId ? range.sourceAccountId : "",
    sourceAccountIds: range && Array.isArray(range.sourceAccountIds) ? range.sourceAccountIds : [],
    sourceAccounts: range && Array.isArray(range.sourceAccounts) ? range.sourceAccounts : [],
    mappings: range && Array.isArray(range.mappings) ? range.mappings : [],
    targetCurrency: range && range.targetCurrency ? range.targetCurrency : "",
    egpRate: includeRatePayload && range && range.egpRate ? range.egpRate : null,
    exchangeRates: includeRatePayload && range && range.exchangeRates && typeof range.exchangeRates === "object"
      ? normalizeMarketingRates(range.exchangeRates, range.egpRate)
      : null,
    accountSettings: accountSettingsPayload,
    dateFrom: range && range.dateFrom ? range.dateFrom : "",
    dateTo: range && range.dateTo ? range.dateTo : "",
    identity: {
      licenseKey,
      machineUuid: _getOrCreateMachineUUID(),
      deviceId: getDeviceFingerprint(),
      accountIdents: _buildAccountIdents(),
    },
  });
  if (result && result.diagnostics) {
    result.diagnostics = sanitizeMarketingDiagnostics(result.diagnostics);
  }
  const responseSnapshotIds = marketingStatusAccountIdSnapshot(result);
  const authorizationUrlDiagnostics = marketingDiagnosticUrlFingerprints(result && result.authorizationUrl);
  if (result && typeof result === "object") {
    result.diagnostics = {
      ...(result.diagnostics && typeof result.diagnostics === "object" ? result.diagnostics : {}),
      clientRequestId,
      previousStoredTokenFingerprint: previousTokenFingerprint,
      generatedAuthorizationUrl: authorizationUrlDiagnostics,
      connectSnapshotIdsBeforeAuth: connectSnapshotIds,
      responseAccountIds: responseSnapshotIds,
      mappedIds: responseSnapshotIds.mappings,
      timings: {
        ...(result.diagnostics && result.diagnostics.timings && typeof result.diagnostics.timings === "object" ? result.diagnostics.timings : {}),
        desktopRequestMs: Date.now() - requestStartedAt,
      },
    };
  }
  if (action === "connect" || action === "status") {
    log.info("[Marketing][Diagnostics] after response", {
      clientRequestId,
      action,
      mode: range && range.mode ? range.mode : "",
      platform,
      dashboardAccountId,
      previousTokenFingerprint,
      generatedAuthorizationUrl: authorizationUrlDiagnostics,
      connectSnapshotIdsBeforeAuth: connectSnapshotIds,
      responseAccountIds: responseSnapshotIds,
      mappedIds: responseSnapshotIds.mappings,
      backendDiagnostics: marketingResultLogSummary(result).diagnostics,
    });
  }
  log.info("[Marketing][Main] response", {
    clientRequestId,
    action,
    ...marketingResultLogSummary(result),
  });
  return result;
}

function getSaudiIPickDesktopToken() {
  return String(dashboardStore.get("saudiIPickMarketing.desktopToken", "") || process.env.SAUDIIPICK_DESKTOP_TOKEN || "").trim();
}

function maskToken(value) {
  const clean = String(value || "");
  if (!clean) return "";
  return `${clean.slice(0, 7)}...${clean.slice(-4)}`;
}

function normalizeNativeSourceAccount(source, fallbackCurrency = "SAR", platform = "snapchat") {
  const id = String(source && (source.id || source.sourceAccountId || source.adAccountId) || "").trim();
  if (!id) return null;
  const health = source && source.connectionHealth && typeof source.connectionHealth === "object" ? source.connectionHealth : null;
  const fallback = platform === "tiktok" ? "UNKNOWN" : fallbackCurrency || "SAR";
  return {
    id,
    name: String(source && (source.name || source.sourceAccountName || source.adAccountName) || id),
    currency: String(source && (source.rawCurrency || source.nativeRawCurrency || source.sourceCurrency || source.accountCurrency || source.account_currency || source.currency) || fallback).toUpperCase(),
    platform,
    provider: "saudiipick",
    organizationName: String(source && source.organizationName || ""),
    connectionId: String(source && (source.connectionId || source.connection_id) || ""),
    connectionStatus: String(source && (source.connectionStatus || source.connection_status) || health && health.status || ""),
    connectionHealth: health,
    usable: health ? health.usable !== false : !(source && source.usable === false),
    error: source && source.error || "",
    errorDescription: source && (source.errorDescription || source.error_description) || health && health.message || "",
    canManageCampaigns: !!(source && source.canManageCampaigns),
  };
}

function nativeMarketingNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nativeMarketingSourceId(value) {
  return String(value && (value.accountId || value.id || value.sourceAccountId || value.adAccountId || value.advertiserId) || "").trim();
}

function nativeMarketingUsableAccountIds(result) {
  const ids = new Set();
  ["selectedSourceAccounts", "mappedAccounts", "linkedAccounts", "availableAccounts", "accounts"].forEach((key) => {
    (Array.isArray(result && result[key]) ? result[key] : []).forEach((source) => {
      const id = nativeMarketingSourceId(source);
      if (id && !(source && source.usable === false)) ids.add(id);
    });
  });
  const summary = result && result.summary || {};
  ["sourceBreakdown", "campaignBreakdown"].forEach((key) => {
    (Array.isArray(summary[key]) ? summary[key] : []).forEach((row) => {
      const id = nativeMarketingSourceId(row);
      if (id) ids.add(id);
    });
  });
  return ids;
}

function nativeMarketingSanitizeAccountHealth(result) {
  if (!result || typeof result !== "object") return result;
  const usableIds = nativeMarketingUsableAccountIds(result);
  const isStaleConnectionError = (error) => {
    const id = nativeMarketingSourceId(error);
    return !!(id && usableIds.has(id) && String(error && error.endpoint || "") === "connection");
  };
  const originalAccountErrors = Array.isArray(result.accountErrors) ? result.accountErrors : [];
  const originalErrors = Array.isArray(result.errors) ? result.errors : [];
  const accountErrors = originalAccountErrors.filter((error) => !isStaleConnectionError(error));
  const errors = originalErrors.filter((error) => !isStaleConnectionError(error));
  const healthById = new Map();
  (Array.isArray(result.accountHealth) ? result.accountHealth : []).forEach((health) => {
    const id = nativeMarketingSourceId(health);
    if (!id) return;
    const current = healthById.get(id);
    if (!current || current.usable === false && health.usable !== false) healthById.set(id, health);
  });
  const next = {
    ...result,
    accountErrors,
    errors,
    accountHealth: Array.from(healthById.values()),
  };
  if (result.partial && originalAccountErrors.length && !accountErrors.length && !errors.length && !(result.diagnostics && result.diagnostics.accountSpendFallbackUsed)) {
    next.partial = false;
  } else if (accountErrors.length || errors.length) {
    next.partial = true;
  }
  return next;
}

function nativeMarketingCurrency(value) {
  return String(value || "").trim().toUpperCase();
}

function nativeMarketingRowCurrency(row, source, fallbackCurrency, sourceMatched) {
  const sourceCurrency = sourceMatched ? nativeMarketingCurrency(source && source.currency) : "";
  const rowCurrency = nativeMarketingCurrency(row && (row.rawCurrency || row.nativeRawCurrency || row.sourceCurrency || row.accountCurrency || row.account_currency || row.currency));
  const fallback = nativeMarketingCurrency(fallbackCurrency);
  return sourceCurrency || rowCurrency || (fallback && fallback !== "MIXED" ? fallback : "SAR");
}

function nativeMarketingRawSpendByCurrency(sourceBreakdown, fallbackCurrency = "") {
  const totals = {};
  (Array.isArray(sourceBreakdown) ? sourceBreakdown : []).forEach((row) => {
    const currency = nativeMarketingCurrency(row && (row.rawCurrency || row.currency) || fallbackCurrency);
    if (!currency || currency === "MIXED") return;
    const amount = nativeMarketingNumber(row && (row.rawSpend ?? row.nativeRawSpend ?? row.spend ?? row.adSpend));
    if (amount <= 0) return;
    totals[currency] = nativeMarketingNumber(totals[currency]) + amount;
  });
  Object.keys(totals).forEach((currency) => {
    totals[currency] = Number(totals[currency].toFixed(2));
  });
  return totals;
}

function normalizeNativeMarketingSummary(summary, sourceAccounts, dashboardAccountId, platform = "snapchat") {
  if (!summary || typeof summary !== "object") return summary || null;
  const selected = (Array.isArray(sourceAccounts) ? sourceAccounts : [])
    .map((source) => normalizeNativeSourceAccount(source, summary.currency || "SAR", platform))
    .filter(Boolean);
  const byId = new Map(selected.map((source) => [source.id, source]));
  const fallbackSource = selected[0] || null;
  const fallbackCurrency = fallbackSource && fallbackSource.currency || String(summary.currency || "SAR").toUpperCase();

  const campaignBreakdown = (Array.isArray(summary.campaignBreakdown) ? summary.campaignBreakdown : []).map((row) => {
    const sourceId = String(row && (row.sourceAccountId || row.adAccountId || row.accountId) || fallbackSource && fallbackSource.id || "");
    const source = byId.get(sourceId) || fallbackSource || {};
    const sourceMatched = byId.has(sourceId);
    const rawCurrency = nativeMarketingRowCurrency(row, source, fallbackCurrency, sourceMatched);
    const rawSpend = nativeMarketingNumber(row && (row.rawSpend ?? row.nativeRawSpend ?? row.spend ?? row.adSpend ?? row.cost));
    return {
      ...row,
      provider: "saudiipick",
      platform,
      dashboardAccountId: row && row.dashboardAccountId || dashboardAccountId,
      sourceAccountId: sourceId,
      sourceAccountName: row && row.sourceAccountName || source.name || sourceId,
      rawSpend,
      rawCurrency,
      currency: rawCurrency,
      spend: rawSpend,
      adSpend: rawSpend,
    };
  });

  let sourceBreakdown = (Array.isArray(summary.sourceBreakdown) ? summary.sourceBreakdown : []).map((row) => {
    const sourceId = String(row && (row.sourceAccountId || row.id || row.adAccountId || row.accountId) || fallbackSource && fallbackSource.id || "");
    const source = byId.get(sourceId) || fallbackSource || {};
    const sourceMatched = byId.has(sourceId);
    const rawCurrency = nativeMarketingRowCurrency(row, source, fallbackCurrency, sourceMatched);
    const rawSpend = nativeMarketingNumber(row && (row.rawSpend ?? row.nativeRawSpend ?? row.spend ?? row.adSpend ?? row.cost));
    return {
      ...row,
      id: sourceId,
      name: row && row.name || row && row.sourceAccountName || source.name || sourceId,
      provider: "saudiipick",
      platform,
      dashboardAccountId: row && row.dashboardAccountId || dashboardAccountId,
      sourceAccountId: sourceId,
      sourceAccountName: row && row.sourceAccountName || source.name || sourceId,
      rawSpend,
      rawCurrency,
      currency: rawCurrency,
      spend: rawSpend,
      adSpend: rawSpend,
    };
  });

  if (!sourceBreakdown.length && campaignBreakdown.length) {
    const grouped = new Map();
    campaignBreakdown.forEach((row) => {
      const sourceId = String(row.sourceAccountId || fallbackSource && fallbackSource.id || "");
      if (!sourceId) return;
      const source = byId.get(sourceId) || fallbackSource || {};
      const current = grouped.get(sourceId) || {
        id: sourceId,
        name: source.name || row.sourceAccountName || sourceId,
        provider: "saudiipick",
        platform,
        dashboardAccountId,
        sourceAccountId: sourceId,
        sourceAccountName: source.name || row.sourceAccountName || sourceId,
        rawSpend: 0,
        rawCurrency: nativeMarketingRowCurrency(row, source, fallbackCurrency, byId.has(sourceId)),
        currency: nativeMarketingRowCurrency(row, source, fallbackCurrency, byId.has(sourceId)),
        spend: 0,
        adSpend: 0,
      };
      current.rawSpend += nativeMarketingNumber(row.rawSpend);
      current.spend = current.rawSpend;
      current.adSpend = current.rawSpend;
      grouped.set(sourceId, current);
    });
    sourceBreakdown = Array.from(grouped.values()).map((row) => ({
      ...row,
      rawSpend: Number(row.rawSpend.toFixed(2)),
      spend: Number(row.spend.toFixed(2)),
      adSpend: Number(row.adSpend.toFixed(2)),
    }));
  }

  if (!sourceBreakdown.length && selected.length === 1 && nativeMarketingNumber(summary.adSpend) > 0) {
    const source = selected[0];
    sourceBreakdown = [{
      id: source.id,
      name: source.name,
      provider: "saudiipick",
      platform,
      dashboardAccountId,
      sourceAccountId: source.id,
      sourceAccountName: source.name,
      rawSpend: nativeMarketingNumber(summary.adSpend),
      rawCurrency: source.currency || fallbackCurrency,
      currency: source.currency || fallbackCurrency,
      spend: nativeMarketingNumber(summary.adSpend),
      adSpend: nativeMarketingNumber(summary.adSpend),
    }];
  }

  const normalizedRawSpendByCurrency = nativeMarketingRawSpendByCurrency(sourceBreakdown, fallbackCurrency);
  const normalizedCurrencies = Object.keys(normalizedRawSpendByCurrency);
  const normalizedCurrency = normalizedCurrencies.length === 1
    ? normalizedCurrencies[0]
    : (normalizedCurrencies.length > 1 ? "MIXED" : nativeMarketingCurrency(summary.currency || fallbackCurrency || "SAR"));

  return {
    ...summary,
    provider: "saudiipick",
    platform,
    currency: normalizedCurrency,
    sourceCurrency: normalizedCurrency,
    currencyMixed: normalizedCurrency === "MIXED",
    rawSpendByCurrency: normalizedCurrencies.length ? normalizedRawSpendByCurrency : (summary.rawSpendByCurrency || {}),
    sourceBreakdown,
    campaignBreakdown,
    rowCount: Number(summary.rowCount || campaignBreakdown.length || sourceBreakdown.length || 0),
    campaignCount: Number(summary.campaignCount || campaignBreakdown.length || 0),
  };
}

function mergeNativeMarketingMappings(previous, dashboardAccountId, dashboardAccountKey, sourceAccounts, platform = "snapchat") {
  const mappings = previous && previous.mappings && typeof previous.mappings === "object" ? { ...previous.mappings } : {};
  const sources = (Array.isArray(sourceAccounts) ? sourceAccounts : [])
    .map((source) => normalizeNativeSourceAccount(source, "SAR", platform))
    .filter(Boolean);
  mappings[dashboardAccountId] = sources;
  if (dashboardAccountKey) mappings[dashboardAccountKey] = sources;
  return mappings;
}

async function callSaudiIPickMarketing(action, accountId, platform = "snapchat", range = {}) {
  const dashboardAccountId = marketingAccountKey(accountId, action !== "sync");
  if (!dashboardAccountId) return { ok: false, error: "SELECT_SINGLE_ACCOUNT" };
  if (!["snapchat", "tiktok"].includes(platform)) return { ok: false, error: "PLATFORM_NOT_AVAILABLE" };
  if (!(await isLicenseValid())) return { ok: false, error: "LICENSE_INVALID" };

  const token = getSaudiIPickDesktopToken();
  const connectUrl = `${SAUDIIPICK_MARKETING_API_BASE}/dashboard/settings`;
  if (!token) {
    return {
      ok: false,
      provider: "saudiipick",
      platform,
      status: "disconnected",
      error: "SAUDIIPICK_TOKEN_REQUIRED",
      authorizationUrl: connectUrl,
    };
  }

  const account = getStoredAccountById(dashboardAccountId);
  const dashboardAccountKey = marketingStableAccountKey(dashboardAccountId);
  const previous = getCachedMarketingStatus(dashboardAccountId, platform);
  const payload = {
    action,
    platform,
    dashboardAccountId,
    dashboardAccountKey,
    dashboardAccountLabel: accountDisplayName(account, dashboardAccountId),
    range: range || {},
    sourceAccounts: range && Array.isArray(range.sourceAccounts) ? range.sourceAccounts : [],
    mappings: range && Array.isArray(range.mappings) ? range.mappings : [],
    identity: {
      licenseKey: licenseStore.get("licenseKey", ""),
      machineUuid: _getOrCreateMachineUUID(),
      deviceId: getDeviceFingerprint(),
      accountIdents: _buildAccountIdents(),
    },
  };

  log.info("[SaudiIPick][Marketing] request", {
    action,
    platform,
    dashboardAccountId,
    sourceAccountIds: payload.sourceAccounts.map((source) => source && (source.id || source.sourceAccountId)).filter(Boolean),
    token: maskToken(token),
  });

  const result = await httpsJsonRequest("POST", `${SAUDIIPICK_MARKETING_API_BASE}/api/desktop/marketing/${platform}`, payload, {
    Authorization: `Bearer ${token}`,
  });

  log.info("[SaudiIPick][Marketing] response", {
    action,
    platform,
    dashboardAccountId,
    ok: !!(result && result.ok),
    status: result && result.status || "",
    error: result && result.error || "",
    availableAccountCount: Array.isArray(result && result.availableAccounts) ? result.availableAccounts.length : 0,
    mappedAccountCount: Array.isArray(result && result.mappedAccounts) ? result.mappedAccounts.length : 0,
    selectedAccountCount: Array.isArray(result && result.selectedSourceAccounts) ? result.selectedSourceAccounts.length : 0,
    summaryAdSpend: result && result.summary ? result.summary.adSpend : null,
    summaryCurrency: result && result.summary ? result.summary.currency : "",
    partial: !!(result && result.partial),
  });

  const merged = nativeMarketingSanitizeAccountHealth({
    ...result,
    provider: "saudiipick",
    platform,
    mappings: result.mappings && Object.keys(result.mappings).length ? result.mappings : previous && previous.mappings || {},
  });

  if (action === "sync" && merged.ok) {
    const requestedSources = (Array.isArray(range && range.sourceAccounts) ? range.sourceAccounts : [])
      .map((source) => normalizeNativeSourceAccount(source, merged.summary && merged.summary.currency || "SAR", platform))
      .filter(Boolean);
    const responseSources = (Array.isArray(merged.selectedSourceAccounts) && merged.selectedSourceAccounts.length
      ? merged.selectedSourceAccounts
      : Array.isArray(merged.mappedAccounts) && merged.mappedAccounts.length
      ? merged.mappedAccounts
      : Array.isArray(merged.linkedAccounts) && merged.linkedAccounts.length
      ? merged.linkedAccounts
      : [])
      .map((source) => normalizeNativeSourceAccount(source, merged.summary && merged.summary.currency || "SAR", platform))
      .filter((source) => source && source.usable !== false);
    const summarySources = responseSources.length ? responseSources : requestedSources.filter((source) => source.usable !== false);
    if (merged.summary) {
      const summaryRatePayload = {
        ...merged.summary,
        targetCurrency: range && range.targetCurrency || merged.summary.targetCurrency || null,
        egpRate: Number(range && range.egpRate) || merged.summary.egpRate || 52,
        exchangeRates: range && range.exchangeRates && typeof range.exchangeRates === "object"
          ? normalizeMarketingRates(range.exchangeRates, range.egpRate)
          : merged.summary.exchangeRates || null,
      };
      merged.summary = normalizeNativeMarketingSummary(summaryRatePayload, summarySources, dashboardAccountId, platform);
    }
    if (requestedSources.length || responseSources.length) {
      merged.status = responseSources.length || merged.summary ? "connected" : "disconnected";
      merged.mappedAccounts = responseSources;
      merged.selectedSourceAccounts = responseSources;
      merged.availableAccounts = Array.isArray(merged.availableAccounts) && merged.availableAccounts.length
        ? merged.availableAccounts
        : previous && Array.isArray(previous.availableAccounts) && previous.availableAccounts.length
        ? previous.availableAccounts
        : responseSources.length ? responseSources : requestedSources;
      merged.linkedAccounts = Array.isArray(merged.linkedAccounts) && merged.linkedAccounts.length
        ? merged.linkedAccounts
        : previous && Array.isArray(previous.linkedAccounts) && previous.linkedAccounts.length
        ? previous.linkedAccounts
        : merged.availableAccounts;
      merged.mappings = mergeNativeMarketingMappings(previous, dashboardAccountId, dashboardAccountKey, requestedSources, platform);
    }
    saveCachedMarketingStatus(dashboardAccountId, platform, merged);
  }

  if (action === "status" && merged.ok) {
    const stableStatus = {
      ...merged,
      summary: previous && previous.summary || null,
      lastSyncAt: previous && previous.lastSyncAt || null,
      mappedAccounts: previous && previous.mappedAccounts && previous.mappedAccounts.length ? previous.mappedAccounts : merged.mappedAccounts,
      selectedSourceAccounts: previous && previous.selectedSourceAccounts && previous.selectedSourceAccounts.length ? previous.selectedSourceAccounts : merged.selectedSourceAccounts,
      mappings: previous && previous.mappings || merged.mappings || {},
    };
    const stableSources = Array.isArray(stableStatus.selectedSourceAccounts) && stableStatus.selectedSourceAccounts.length
      ? stableStatus.selectedSourceAccounts
      : (Array.isArray(stableStatus.mappedAccounts) ? stableStatus.mappedAccounts : []);
    if (stableStatus.summary) {
      stableStatus.summary = normalizeNativeMarketingSummary(stableStatus.summary, stableSources, dashboardAccountId, platform);
    }
    if ((Array.isArray(stableStatus.selectedSourceAccounts) && stableStatus.selectedSourceAccounts.length) ||
      (Array.isArray(stableStatus.mappedAccounts) && stableStatus.mappedAccounts.length) ||
      stableStatus.summary) {
      stableStatus.status = "connected";
    }
    saveCachedMarketingStatus(dashboardAccountId, platform, stableStatus);
    return stableStatus;
  }

  return merged;
}

const MARKETING_STATUS_TTL_MS = 15 * 60 * 1000;

function marketingStatusIsFresh(status) {
  const checkedAt = status && status.statusCheckedAt ? new Date(status.statusCheckedAt).getTime() : 0;
  return checkedAt > 0 && Date.now() - checkedAt < MARKETING_STATUS_TTL_MS;
}

function marketingSyncShouldRetry(result) {
  if (!result || result.ok || result.reconnectRequired) return false;
  const text = String(result.error || result.message || "").toUpperCase();
  return text === "WINDSOR_AUTH_FAILED" ||
    text.includes("TIMEOUT") ||
    text.includes("ECONNRESET") ||
    text.includes("FETCH");
}

function delayMarketingRetry(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle("get-marketing-status", async (_, accountId, platform = "tiktok", options = {}) => {
  const dashboardAccountId = marketingAccountKey(accountId, true);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_ACCOUNT" };
  const mode = ["cached", "revalidate", "force"].includes(options && options.mode) ? options.mode : "revalidate";
  const cached = getCachedMarketingStatus(dashboardAccountId, platform);
  if (cached && mode === "cached") {
    return { ok: true, ...cached, cache: { ...(cached.cache || {}), status: "local", providerRequestCount: 0 } };
  }
  // A cached lookup is deliberately local-only. Dashboard startup uses this
  // mode to decide whether marketing work exists at all; contacting Windsor
  // here made brand-new, disconnected accounts wait on three remote requests
  // before the dashboard could become usable.
  if (!cached && mode === "cached") {
    return {
      ok: true,
      accountId: dashboardAccountId,
      platform,
      status: "disconnected",
      statusCheckedAt: new Date().toISOString(),
      linkedAccounts: [],
      mappedAccounts: [],
      mappings: {},
      selectedSourceAccounts: [],
      summary: null,
      cache: { status: "local-miss", providerRequestCount: 0 },
    };
  }
  if (cached && mode === "revalidate" && marketingStatusIsFresh(cached) && cached.status !== "disconnected") {
    return { ok: true, ...cached, cache: { ...(cached.cache || {}), status: "local", providerRequestCount: 0 } };
  }
  try {
    const result = await callMarketingBackend("status", dashboardAccountId, platform, { mode });
    if (result && result.ok) {
      if (dashboardAccountId === "__all__") {
        saveCachedAllMarketingMappingStatus(platform, result, { preserveExistingSummary: true });
      } else {
        saveCachedMarketingStatus(dashboardAccountId, platform, result);
      }
    } else if (result && result.reconnectRequired) {
      return result;
    } else {
      const cached = getCachedMarketingStatus(dashboardAccountId, platform);
      if (cached) return { ok: true, ...cached, offline: true, error: result && result.error || "STATUS_UNAVAILABLE" };
    }
    return result;
  } catch (error) {
    log.error("[Marketing][Main] status failed", { accountId: dashboardAccountId, platform, error: error.message });
    const cached = getCachedMarketingStatus(dashboardAccountId, platform);
    if (cached) return { ok: true, ...cached, offline: true, error: error.message };
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("connect-marketing-platform", async (_, accountId, platform = "tiktok") => {
  try {
    return await callMarketingBackend("connect", accountId, platform);
  } catch (error) {
    log.error("[Marketing][Main] connect failed", { accountId, platform, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("claim-marketing-source-account", async (_, accountId, platform = "tiktok", sourceAccountId = "") => {
  const dashboardAccountId = marketingAccountKey(accountId, true);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_ACCOUNT" };
  try {
    const result = await callMarketingBackend("claim_source_account", dashboardAccountId, platform, { sourceAccountId });
    if (result && result.ok) saveCachedMarketingStatus(dashboardAccountId, platform, result);
    return result;
  } catch (error) {
    log.error("[Marketing][Main] claim failed", { accountId: dashboardAccountId, platform, sourceAccountId, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("release-marketing-source-account", async (_, accountId, platform = "tiktok", sourceAccountId = "") => {
  const dashboardAccountId = marketingAccountKey(accountId, true);
  if (!dashboardAccountId || dashboardAccountId === "__all__") return { ok: false, error: "SELECT_ACCOUNT_TO_RELEASE" };
  try {
    const result = await callMarketingBackend("release_source_account", dashboardAccountId, platform, { sourceAccountId });
    if (result && result.ok) saveCachedMarketingStatus(dashboardAccountId, platform, result);
    return result;
  } catch (error) {
    log.error("[Marketing][Main] release failed", { accountId: dashboardAccountId, platform, sourceAccountId, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("save-marketing-mapping", async (_, accountId, platform = "tiktok", sourceAccountIds = []) => {
  const dashboardAccountId = marketingAccountKey(accountId);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_ACCOUNT_TO_MAP" };
  try {
    const sourceAccounts = Array.isArray(sourceAccountIds) ? sourceAccountIds.map((source) =>
      typeof source === "string" ? { id: source } : source) : [];
    const result = await callMarketingBackend("save_mapping", dashboardAccountId, platform, { sourceAccounts });
    if (result && result.ok) saveCachedMarketingStatus(dashboardAccountId, platform, result);
    return result;
  } catch (error) {
    log.error("[Marketing][Main] mapping save failed", { accountId: dashboardAccountId, platform, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("save-all-marketing-mappings", async (_, platform = "tiktok", mappings = []) => {
  try {
    const result = await callMarketingBackend("save_mappings", "__all__", platform, { mappings });
    if (result && result.ok) saveCachedAllMarketingMappingStatus(platform, result);
    return result;
  } catch (error) {
    log.error("[Marketing][Main] all mappings save failed", { platform, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("sync-marketing-data", async (_, accountId, platform = "tiktok", range = {}) => {
  const dashboardAccountId = marketingAccountKey(accountId);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_SINGLE_ACCOUNT" };
  try {
    const incrementalEnabled = marketingIncrementalSyncEnabled();
    const requestedMode = range && range.mode === "full" ? "full" : "incremental";
    const cached = getCachedMarketingStatus(dashboardAccountId, platform);
    const cachedSummary = cached && cached.summary || {};
    const sameRange = String(cachedSummary.dateFrom || "") === String(range && range.dateFrom || "") &&
      String(cachedSummary.dateTo || "") === String(range && range.dateTo || "");
    const currencyChanged = String(cachedSummary.currency || "").toUpperCase() !== String(range && range.targetCurrency || "").toUpperCase() ||
      marketingRatesChanged(cachedSummary, range || {});
    let result = await callMarketingBackend("sync", dashboardAccountId, platform, {
      ...(range || {}),
      mode: incrementalEnabled ? requestedMode : undefined,
      recomposeOnly: incrementalEnabled && requestedMode === "incremental" && sameRange && currencyChanged,
    });
    if (marketingSyncShouldRetry(result)) {
      log.warn("[Marketing][Main] sync retrying after transient failure", {
        accountId: dashboardAccountId,
        platform,
        error: result && result.error || "",
      });
      await delayMarketingRetry(700);
      result = await callMarketingBackend("sync", dashboardAccountId, platform, {
        ...(range || {}),
        mode: incrementalEnabled ? requestedMode : undefined,
        recomposeOnly: incrementalEnabled && requestedMode === "incremental" && sameRange && currencyChanged,
      });
    }
    if (result && result.ok) saveCachedMarketingStatus(dashboardAccountId, platform, result);
    else if (result && result.reconnectRequired) return result;
    else {
      const cached = getCachedMarketingStatus(dashboardAccountId, platform);
      if (cached) return { ok: false, ...cached, error: result && result.error || "SYNC_FAILED" };
    }
    return result;
  } catch (error) {
    log.error("[Marketing][Main] sync failed", { accountId: dashboardAccountId, platform, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("sync-all-marketing-data", async (_, platform = "tiktok", range = {}) => {
  try {
    const incrementalEnabled = marketingIncrementalSyncEnabled();
    const requestedMode = range && range.mode === "full" ? "full" : "incremental";
    const accountSettings = normalizeMarketingAccountSettings(range && range.accountSettings);
    const cacheComparisons = accountSettings.map((setting) => {
      const cached = getCachedMarketingStatus(setting.dashboardAccountId, platform);
      const summary = cached && cached.summary || {};
      return {
        sameRange: String(summary.dateFrom || "") === String(range && range.dateFrom || "") &&
          String(summary.dateTo || "") === String(range && range.dateTo || ""),
        currencyChanged: String(summary.currency || "").toUpperCase() !== String(setting.currency || "").toUpperCase() ||
          marketingRatesChanged(summary, {
            exchangeRates: setting.exchangeRates,
            egpRate: setting.egpRate,
          }),
      };
    });
    let result = await callMarketingBackend("sync_all", "__all__", platform, {
      ...(range || {}),
      mode: incrementalEnabled ? requestedMode : undefined,
      recomposeOnly: incrementalEnabled && requestedMode === "incremental" &&
        cacheComparisons.length > 0 &&
        cacheComparisons.every((item) => item.sameRange) &&
        cacheComparisons.some((item) => item.currencyChanged),
      accountSettings,
    });
    if (marketingSyncShouldRetry(result)) {
      log.warn("[Marketing][Main] sync all retrying after transient failure", {
        platform,
        error: result && result.error || "",
      });
      await delayMarketingRetry(700);
      result = await callMarketingBackend("sync_all", "__all__", platform, {
        ...(range || {}),
        mode: incrementalEnabled ? requestedMode : undefined,
        recomposeOnly: incrementalEnabled && requestedMode === "incremental" &&
          cacheComparisons.length > 0 &&
          cacheComparisons.every((item) => item.sameRange) &&
          cacheComparisons.some((item) => item.currencyChanged),
        accountSettings,
      });
    }
    if (result && result.ok && result.accountStatuses) {
      Object.keys(result.accountStatuses).forEach((accountId) => {
        saveCachedMarketingStatus(accountId, platform, result.accountStatuses[accountId]);
      });
      saveCachedMarketingStatus("__all__", platform, result);
    }
    return result;
  } catch (error) {
    log.error("[Marketing][Main] sync all failed", { platform, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("get-saudiipick-marketing-token-status", async () => {
  const token = getSaudiIPickDesktopToken();
  return {
    ok: true,
    configured: !!token,
    tokenPreview: maskToken(token),
    connectUrl: `${SAUDIIPICK_MARKETING_API_BASE}/dashboard/settings`,
  };
});

ipcMain.handle("save-saudiipick-marketing-token", async (_, token) => {
  const clean = String(token || "").trim();
  if (!clean || !clean.startsWith("sipdt_")) {
    log.warn("[SaudiIPick][Marketing] rejected invalid desktop token", { hasToken: !!clean, tokenPreview: maskToken(clean) });
    return { ok: false, error: "INVALID_SAUDIIPICK_TOKEN" };
  }
  dashboardStore.set("saudiIPickMarketing.desktopToken", clean);
  log.info("[SaudiIPick][Marketing] desktop token saved", { tokenPreview: maskToken(clean) });
  return { ok: true, configured: true, tokenPreview: maskToken(clean) };
});

ipcMain.handle("clear-saudiipick-marketing-token", async () => {
  dashboardStore.delete("saudiIPickMarketing.desktopToken");
  return { ok: true, configured: false };
});

ipcMain.handle("get-saudiipick-marketing-status", async (_, accountId, platform = "snapchat", options = {}) => {
  const dashboardAccountId = marketingAccountKey(accountId, true);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_ACCOUNT" };
  const cached = getCachedMarketingStatus(dashboardAccountId, platform);
  if (cached && options && options.mode === "cached") {
    return { ok: true, ...cached, provider: cached.provider || "saudiipick", cache: { ...(cached.cache || {}), status: "local", providerRequestCount: 0 } };
  }
  try {
    const result = await callSaudiIPickMarketing("status", dashboardAccountId, platform, options || {});
    if (result && result.ok) {
      const nextCached = getCachedMarketingStatus(dashboardAccountId, platform) || {};
      return {
        ...result,
        ...nextCached,
        ok: true,
        provider: "saudiipick",
        availableAccounts: result.availableAccounts || nextCached.availableAccounts || [],
        linkedAccounts: result.linkedAccounts || nextCached.linkedAccounts || [],
      };
    }
    return cached ? { ok: true, ...cached, offline: true, error: result && result.error || "" } : result;
  } catch (error) {
    log.error("[SaudiIPick][Marketing] status failed", { accountId: dashboardAccountId, platform, error: error.message });
    if (cached) return { ok: true, ...cached, offline: true, error: error.message };
    return { ok: false, provider: "saudiipick", platform, error: error.message };
  }
});

ipcMain.handle("save-saudiipick-marketing-mapping", async (_, accountId, platform = "snapchat", sourceAccounts = []) => {
  const dashboardAccountId = marketingAccountKey(accountId);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_ACCOUNT_TO_MAP" };
  const previous = getCachedMarketingStatus(dashboardAccountId, platform) || {};
  const account = getStoredAccountById(dashboardAccountId);
  const dashboardAccountKey = marketingStableAccountKey(dashboardAccountId);
  const selected = (Array.isArray(sourceAccounts) ? sourceAccounts : [])
    .map((source) => normalizeNativeSourceAccount(source, "SAR", platform))
    .filter(Boolean);
  const next = {
    ...previous,
    ok: true,
    provider: "saudiipick",
    platform,
    status: selected.length ? "connected" : "disconnected",
    sourceAccountId: selected.length === 1 ? selected[0].id : "",
    sourceAccountName: selected.length === 1 ? selected[0].name : accountDisplayName(account, dashboardAccountId),
    mappedAccounts: selected,
    selectedSourceAccounts: selected,
    selectedSourceAccountIds: selected.map((source) => source.id),
    availableAccounts: previous.availableAccounts || selected,
    linkedAccounts: previous.linkedAccounts || selected,
    mappings: mergeNativeMarketingMappings(previous, dashboardAccountId, dashboardAccountKey, selected, platform),
    statusCheckedAt: new Date().toISOString(),
  };
  saveCachedMarketingStatus(dashboardAccountId, platform, next);
  return { ok: true, ...getCachedMarketingStatus(dashboardAccountId, platform), provider: "saudiipick" };
});

ipcMain.handle("sync-saudiipick-marketing-data", async (_, accountId, platform = "snapchat", range = {}) => {
  const dashboardAccountId = marketingAccountKey(accountId);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_SINGLE_ACCOUNT" };
  try {
    const previous = getCachedMarketingStatus(dashboardAccountId, platform) || {};
    const dashboardAccountKey = marketingStableAccountKey(dashboardAccountId);
    let sourceAccounts = Array.isArray(range && range.sourceAccounts) && range.sourceAccounts.length
      ? range.sourceAccounts
      : previous.selectedSourceAccounts || previous.mappedAccounts || [];
    if (!sourceAccounts.length && previous.mappings && typeof previous.mappings === "object") {
      sourceAccounts = previous.mappings[dashboardAccountId] || previous.mappings[dashboardAccountKey] || [];
    }
    const result = await callSaudiIPickMarketing("sync", dashboardAccountId, platform, {
      ...(range || {}),
      sourceAccounts,
    });
    return result;
  } catch (error) {
    log.error("[SaudiIPick][Marketing] sync failed", { accountId: dashboardAccountId, platform, error: error.message });
    const cached = getCachedMarketingStatus(dashboardAccountId, platform);
    if (cached) return { ok: false, ...cached, provider: "saudiipick", error: error.message };
    return { ok: false, provider: "saudiipick", platform, error: error.message };
  }
});

ipcMain.handle("open-external-url", async (_, externalUrl) => {
  try {
    const parsed = new URL(String(externalUrl || ""));
    if (parsed.protocol === "tg:" && parsed.hostname === "resolve") {
      const domain = String(parsed.searchParams.get("domain") || "");
      if (!/^[A-Za-z0-9_]{5,64}$/.test(domain)) {
        return { ok: false, error: "URL_NOT_ALLOWED" };
      }
      await shell.openExternal(parsed.toString());
      return { ok: true };
    }
    const allowedHosts = new Set([
      "onboard.windsor.ai",
      "saudiipick.com",
      "www.saudiipick.com",
      "taager.com",
      "www.taager.com",
      "wa.me",
      "api.whatsapp.com",
      "web.whatsapp.com",
      "t.me",
      "telegram.me",
      "www.telegram.me",
    ]);
    if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname)) {
      return { ok: false, error: "URL_NOT_ALLOWED" };
    }
    await shell.openExternal(parsed.toString());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("copy-text", async (_, value) => {
  try {
    clipboard.writeText(String(value == null ? "" : value));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("get-ai-assistant-memory", async () => {
  try {
    const saved = dashboardStore.get("aiAssistantState.v1", null);
    return { ok: true, memory: saved ? sanitizeAiAssistantMemory(saved) : defaultAiAssistantMemory() };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.getAiAssistantMemory" });
    return { ok: false, memory: defaultAiAssistantMemory(), error: err.message };
  }
});

ipcMain.handle("save-ai-assistant-memory", async (_, delta) => {
  try {
    const saved = dashboardStore.get("aiAssistantState.v1", null);
    const next = mergeAiAssistantMemory(saved || defaultAiAssistantMemory(), delta || {});
    dashboardStore.set("aiAssistantState.v1", next);
    return { ok: true, memory: next };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.saveAiAssistantMemory" });
    return { ok: false, memory: defaultAiAssistantMemory(), error: err.message };
  }
});

ipcMain.handle("clear-ai-assistant-memory", async (_, scope) => {
  try {
    const cleanScope = String(scope || "all").toLowerCase();
    if (cleanScope === "all") {
      const empty = defaultAiAssistantMemory();
      dashboardStore.set("aiAssistantState.v1", empty);
      return { ok: true, memory: empty };
    }
    const saved = dashboardStore.get("aiAssistantState.v1", null);
    const next = sanitizeAiAssistantMemory(saved || defaultAiAssistantMemory());
    if (cleanScope === "workflow") next.activeWorkflow = null;
    if (cleanScope === "diagnosis") next.lastDiagnosis = null;
    if (cleanScope === "inputs") next.knownInputs = defaultAiAssistantMemory().knownInputs;
    next.updatedAt = new Date().toISOString();
    dashboardStore.set("aiAssistantState.v1", next);
    return { ok: true, memory: next };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.clearAiAssistantMemory" });
    return { ok: false, memory: defaultAiAssistantMemory(), error: err.message };
  }
});

function sanitizeDashboardAiMirror(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const pick = (obj, keys) => {
    const out = {};
    keys.forEach((key) => {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
    });
    return out;
  };
  const limitRows = (rows, limit) => (Array.isArray(rows) ? rows : [])
    .slice(0, limit)
    .map((row) => row && typeof row === "object" ? pick(row, [
      "id", "name", "sku", "city", "orders", "delivered", "ndrPct", "drPct", "cancelPct",
      "deliveredSales", "aov", "cpa", "breakEvenCpa", "netProfit", "profitLoss",
      "earnedProfitAfterTax", "earnedCommission", "riskScore", "scalingScore",
      "scaleScore", "decision", "nextAction", "matchedProduct", "objective", "status",
      "spend", "currency", "deliveredCpa", "roi", "action"
    ]) : null)
    .filter(Boolean);
  const mirrorKey = String(value.mirrorKey || "").slice(0, 500);
  if (!mirrorKey) return null;
  return {
    version: Number(value.version || 1),
    mirrorKey,
    builtAt: String(value.builtAt || new Date().toISOString()).slice(0, 80),
    freshness: String(value.freshness || "persisted").slice(0, 40),
    accountSummary: value.accountSummary && typeof value.accountSummary === "object" ? pick(value.accountSummary, [
      "activeAccountId", "activeAccountLabel", "periodLabel", "deliveredDateMode",
      "totalOrders", "delivered", "ndrPct", "drPct", "cpa", "spend", "deliveredSales",
      "aov", "earnedProfitAfterTax", "lostProfitAfterTax", "netProfit", "breakEvenCpa",
      "currency", "healthLevel", "growthLevel"
    ]) : {},
    productScorecards: limitRows(value.productScorecards, 40),
    cityScorecards: limitRows(value.cityScorecards, 40),
    campaignScorecards: limitRows(value.campaignScorecards, 25),
    rankings: value.rankings && typeof value.rankings === "object" ? value.rankings : {},
    decisions: value.decisions && typeof value.decisions === "object" ? value.decisions : {},
    planInputs: value.planInputs && typeof value.planInputs === "object" ? value.planInputs : {},
    diagnostics: value.diagnostics && typeof value.diagnostics === "object" ? value.diagnostics : {},
  };
}

function readDashboardAiMirrorStore() {
  const saved = dashboardStore.get(AI_MIRROR_STORE_KEY, null);
  const items = saved && saved.items && typeof saved.items === "object" ? saved.items : {};
  const order = Array.isArray(saved && saved.order) ? saved.order.map((key) => String(key || "")).filter(Boolean) : Object.keys(items);
  const migrated = dashboardStore.get("aiMirror.v1", null);
  if (migrated && migrated.mirrorKey && !items[migrated.mirrorKey]) {
    const mirror = sanitizeDashboardAiMirror(migrated);
    if (mirror) {
      items[mirror.mirrorKey] = mirror;
      order.unshift(mirror.mirrorKey);
    }
  }
  const cleanOrder = [];
  order.forEach((key) => {
    if (items[key] && cleanOrder.indexOf(key) === -1) cleanOrder.push(key);
  });
  Object.keys(items).forEach((key) => {
    if (cleanOrder.indexOf(key) === -1) cleanOrder.push(key);
  });
  while (cleanOrder.length > AI_MIRROR_STORE_LIMIT) {
    const oldKey = cleanOrder.pop();
    delete items[oldKey];
  }
  return { version: 1, items, order: cleanOrder };
}

function writeDashboardAiMirrorStore(next) {
  const items = next && next.items && typeof next.items === "object" ? next.items : {};
  const order = Array.isArray(next && next.order) ? next.order : Object.keys(items);
  dashboardStore.set(AI_MIRROR_STORE_KEY, {
    version: 1,
    savedAt: new Date().toISOString(),
    items,
    order: order.slice(0, AI_MIRROR_STORE_LIMIT),
  });
}

ipcMain.handle("get-dashboard-ai-mirror", async (_, mirrorKey) => {
  const key = String(mirrorKey || "");
  const cache = readDashboardAiMirrorStore();
  const saved = cache.items[key] || null;
  if (!saved || saved.mirrorKey !== key) return null;
  cache.order = [key].concat(cache.order.filter((item) => item !== key));
  writeDashboardAiMirrorStore(cache);
  return { ok: true, mirror: saved };
});

ipcMain.handle("save-dashboard-ai-mirror", async (_, payload) => {
  const mirror = sanitizeDashboardAiMirror(payload && payload.mirror || payload);
  if (!mirror) return { ok: false, error: "invalid_mirror" };
  const cache = readDashboardAiMirrorStore();
  mirror.savedAt = new Date().toISOString();
  cache.items[mirror.mirrorKey] = mirror;
  cache.order = [mirror.mirrorKey].concat(cache.order.filter((key) => key !== mirror.mirrorKey));
  while (cache.order.length > AI_MIRROR_STORE_LIMIT) {
    const oldKey = cache.order.pop();
    delete cache.items[oldKey];
  }
  writeDashboardAiMirrorStore(cache);
  return { ok: true, mirrorKey: mirror.mirrorKey, builtAt: mirror.builtAt };
});

ipcMain.handle("dashboard-ai-query", async (event, payload) => {
  const _aiRequestStartedAt = Date.now();
  const _aiRequestId = payload && payload.requestId ? String(payload.requestId).slice(0, 120) : "";
  const emitAiProgress = (done, error) => {
    if (!_aiRequestId || !event || !event.sender || event.sender.isDestroyed()) return;
    event.sender.send("dashboard-ai-progress", {
      requestId: _aiRequestId,
      done: !!done,
      error: !!error,
    });
  };
  // [Taager Bot DEBUG] ---------------------------------------------
  const _cmd = payload && payload.command ? String(payload.command).slice(0, 80) : "(no command)";
  const _ctxBytes = payload && payload.context ? Buffer.byteLength(JSON.stringify(payload.context), "utf8") : 0;
  log.info("[TaagerAI] gateway state:", getAiGatewayState());
  const _ctxKB    = (_ctxBytes / 1024).toFixed(1);
  log.info("[TaagerAI-Debug] dashboard-ai-query Ã¢â€ â€™ command:", _cmd);
  log.info("[TaagerAI-Debug] context payload size:", _ctxKB + " KB (" + _ctxBytes + " bytes)");
  if (_ctxBytes > 150000) {
    log.warn("[TaagerAI-Debug] Ã¢Å¡Â Ã¯Â¸Â  Context is VERY LARGE (" + _ctxKB + " KB) Ã¢â‚¬â€ likely to hit Gemini input token limit!");
  }
  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  try {
    const validation = validateDashboardAiPayload(payload || {});
    if (!validation.ok) {
      emitAiProgress(true, false);
      return {
        message: validation.message || "Invalid AI request.",
        insights: [],
        recommendations: [],
        forecasts: [],
        alerts: [],
        actions: [],
        meta: { source: "local-guard", blocked: true, code: validation.code, mainProcessDurationMs: Date.now() - _aiRequestStartedAt },
      };
    }
    const _result = await askDashboardAi(payload || {}, {
      onProgress: () => emitAiProgress(false, false),
    });
    emitAiProgress(true, false);
    if (_result && typeof _result === "object") {
      _result.meta = Object.assign({}, _result.meta || {}, {
        mainProcessDurationMs: Date.now() - _aiRequestStartedAt
      });
    }
    // [Taager Bot DEBUG]
    log.info("[TaagerAI-Debug] AI response message:", _result && _result.message ? _result.message.slice(0, 120) : "(empty)");
    log.info("[TaagerAI-Debug] AI insights count:", _result && _result.insights ? _result.insights.length : 0);
    if (_result && _result.insights && _result.insights.length > 0) {
      log.info("[TaagerAI-Debug] First insight:", JSON.stringify(_result.insights[0]).slice(0, 200));
    }
    return _result;
  } catch (err) {
    emitAiProgress(true, true);
    log.error("[TaagerAI-Debug] dashboard-ai-query THREW unexpectedly:", err && err.message ? err.message : String(err));
    monitoring.captureException(err, { operation: "dashboard.aiQuery", extra: { command: _cmd, contextBytes: _ctxBytes } });
    return {
      message: "AI service failed.",
      insights: [err && err.message ? err.message : String(err)],
      actions: [],
      meta: { source: "fallback", error: true, mainProcessDurationMs: Date.now() - _aiRequestStartedAt },
    };
  }
});

ipcMain.handle("get-ai-admin-analytics", async () => {
  return getAiAdminAnalytics();
});

ipcMain.handle("debug-gemini-ping", async () => {
  return debugGeminiPing();
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

if (!app.isPackaged || process.env.SENTRY_ENABLE_TESTS === "1") {
  ipcMain.handle("sentry-test-main-error", async () => {
    throw new Error("SENTRY_TEST_MAIN_ERROR");
  });
  ipcMain.handle("sentry-test-async-rejection", async () => {
    await Promise.reject(new Error("SENTRY_TEST_MAIN_ASYNC_REJECTION"));
  });
}

ipcMain.handle("clear-all-data", () => {
  store.clear(); clearAutoRun();
  // licenseStore NOT cleared Ã¢â‚¬â€ device lock and key survive reset
  // Clear all bot profiles (single legacy + all per-account profiles)
  const userData = app.getPath("userData");
  const legacy = path.join(userData, "bot-profile");
  if (fs.existsSync(legacy)) fs.rmSync(legacy, { recursive: true, force: true });
  // Also delete any per-account profiles: bot-profile-<id>
  try {
    fs.readdirSync(userData)
      .filter(f => f.startsWith("bot-profile-"))
      .forEach(f => fs.rmSync(path.join(userData, f), { recursive: true, force: true }));
  } catch(e) {}
  return true;
});

// After a successful reset, admin must flip allow_reset back to false so the button re-locks
ipcMain.handle("clear-reset-flag", async () => {
  const key = licenseStore.get("licenseKey", "");
  if (!key) return { success: false };
  try {
    await supabaseRpc("taager_clear_reset_flag", { p_license_key: key });
    licenseStore.set("allowReset", false);
    // Bust cache so next check-license reflects the change
    _licenseCache = null; _licenseCacheAt = 0;
    return { success: true };
  } catch { return { success: false }; }
});
ipcMain.handle("get-profile-path", () => path.join(app.getPath("userData"), "bot-profile"));
ipcMain.handle("save-output-file", async (_, { buffer, filename }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: filename, filters: [{ name: "Excel", extensions: ["xlsx"] }] });
  if (filePath) { fs.writeFileSync(filePath, Buffer.from(buffer)); return { saved: true, path: filePath }; }
  return { saved: false };
});

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// IPC Ã¢â‚¬â€ Bot runner (license-gated)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Ã¢â€â‚¬Ã¢â€â‚¬ Helper: spawn one bot child for one account Ã¢â€â‚¬Ã¢â€â‚¬
function spawnBotChild(creds) {
  const { fork } = require("child_process");
  const botPath = path.join(__dirname, "../bot/runner.js");
  return fork(botPath, [], {
    env: { ...process.env, BOT_CONFIG: JSON.stringify(creds) },
    silent: true,
    execArgv: ["--max-old-space-size=512"],
  });
}

let botChildren = []; // track all running children

function waitForBotChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

function forceKillBotProcessTree(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform === "win32") {
    const { spawn } = require("child_process");
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => {
        try { child.kill("SIGKILL"); } catch (_) {}
        resolve();
      });
      killer.once("exit", (code) => {
        if (code !== 0) {
          try { child.kill("SIGKILL"); } catch (_) {}
        }
        resolve();
      });
    });
  }
  try { child.kill("SIGKILL"); } catch (_) {}
  return Promise.resolve();
}

async function stopRunningBots() {
  botRunning = false;
  const children = Array.from(new Set([
    ...botChildren,
    ...(currentBotChild ? [currentBotChild] : []),
  ])).filter((child) => child && child.exitCode === null && child.signalCode === null);
  const manualChildren = Array.from(manualChromeChildren)
    .filter((child) => child && child.exitCode === null && child.signalCode === null);

  for (const child of children) {
    try {
      if (child.connected) child.send({ type: "stop" });
    } catch (_) {}
  }

  // Manual Google-login Chrome is spawned by the main process, not Playwright.
  await Promise.all(manualChildren.map(forceKillBotProcessTree));
  if (manualChildren.length) {
    await Promise.all(manualChildren.map((child) => waitForBotChildExit(child, 2500)));
  }
  manualChromeChildren.clear();
  pendingGoogleLoginRequests.clear();

  const graceful = await Promise.all(children.map((child) => waitForBotChildExit(child, 4000)));
  const stuck = children.filter((_child, index) => !graceful[index]);
  await Promise.all(stuck.map(forceKillBotProcessTree));
  if (stuck.length) await Promise.all(stuck.map((child) => waitForBotChildExit(child, 2500)));

  botChildren = [];
  currentBotChild = null;
  return {
    success: true,
    stopped: children.length + manualChildren.length,
    forced: stuck.length + manualChildren.length,
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Helper: auto-save failed orders xlsx to %APPDATA%/taager-order-bot/failed-orders/{easyEmail}/ Ã¢â€â‚¬Ã¢â€â‚¬
function saveFailedOrdersFile(easyEmail, buffer) {
  try {
    // Sanitise the email so it's safe as a folder name (replace @ and special chars)
    const safeEmail = (easyEmail || "unknown").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    // Build timestamp: YYYY-MM-DD_HH-MM-SS (local time)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    // %APPDATA% on Windows; fallback to userData on other platforms
    const appdata = process.env.APPDATA || app.getPath("userData");
    const dir = path.join(appdata, "taager-order-bot", "failed-orders", safeEmail);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `failed-${ts}.xlsx`);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { dir, filePath };
  } catch (e) {
    console.error("[saveFailedOrdersFile] error:", e.message);
    return { dir: "", filePath: "" };
  }
}

function safeFilePart(value) {
  return String(value || "unknown").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 80);
}

function createBotRunLogWriter(account, dateFrom, dateTo, suffix = "") {
  const appdata = process.env.APPDATA || app.getPath("userData");
  const dir = path.join(appdata, "taager-orders", "run-logs");
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const accountPart = safeFilePart(accountContactEmail(account) || accountDisplayName(account, account && account.id || "account"));
  const filePath = path.join(dir, `bot-run-${ts}-${accountPart}${suffix ? "-" + safeFilePart(suffix) : ""}.log`);
  const header = [
    `Run started: ${now.toISOString()}`,
    `Account: ${accountDisplayName(account, accountPart)}`,
    `Email: ${accountContactEmail(account) || ""}`,
    `Date range: ${dateFrom || ""} -> ${dateTo || ""}`,
    "",
  ].join(os.EOL);
  fs.writeFileSync(filePath, header, "utf8");
  const write = (line) => {
    const text = String(line || "").trimEnd();
    if (!text) return;
    try {
      fs.appendFileSync(filePath, `[${new Date().toISOString()}] ${text}${os.EOL}`, "utf8");
    } catch (error) {
      log.warn("[BotRunLog] append failed:", error.message);
    }
  };
  return { filePath, write };
}

ipcMain.handle("run-bot", async (_, { dateFrom, dateTo, accountIds, easyOrdersAffiliateRecoveryEnabled: runAffiliateRecoveryEnabled } = {}) => {
  if (!(await isLicenseValid())) return { success: false, error: "LICENSE_INVALID" };
  if (licenseStore.get("teamLeaderEnabled", false) === true) {
    return { success: false, error: "TEAM_LEADER_DASHBOARD_ONLY" };
  }
  const operationsSuiteEnabled = isOperationsSuiteEnabled();
  const dashboardEnabled = licenseStore.get("dashboardEnabled", false) === true;
  const reportingDataEnabled = operationsSuiteEnabled || dashboardEnabled;

  // Reset export timestamp so each run's inter-account cooldown is anchored
  // only to exports from this run.
  lastExportTimestamp = 0;
  const autoConfirm = store.get("autoConfirm", false);
  const missingOrdersUploadEnabled = store.get("missingOrdersUploadEnabled", false) === true;
  const easyOrdersAffiliateRecoveryEnabled = runAffiliateRecoveryEnabled === true || store.get("easyOrdersAffiliateRecoveryEnabled", false) === true;
  const secondTaagerProfilePathFor = (accountId) => path.join(app.getPath("userData"), `bot-profile-${accountId}-second-taager-cart`);
  const accountRunConfig = (acc) => {
    const missedOrdersDestination = missedOrdersDestinationOf(acc, missingOrdersUploadEnabled);
    return {
      ...acc,
      missedOrdersDestination,
      missingOrdersUploadEnabled: missedOrdersDestination === "legacy_missing_orders",
      secondTaagerCartEnabled: missedOrdersDestination === "second_taager_cart",
      easyOrdersAffiliateRecoveryEnabled,
      secondTaagerPassword: acc.secondTaagerPassword || (acc.id ? store.get(`pwd_second_taager_${acc.id}`, "") : ""),
      secondTaagerProfilePath: acc.id ? secondTaagerProfilePathFor(acc.id) : "",
    };
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ Build account list to run Ã¢â€â‚¬Ã¢â€â‚¬
  const allAccounts = store.get("accounts", null);
  let accountsToRun = [];

  if (allAccounts && allAccounts.length > 0) {
    // Multi-account: filter by selected ids (if provided), else run all
    const selected = Array.isArray(accountIds) && accountIds.length > 0 ? accountIds : allAccounts.map(a => a.id);
    accountsToRun = allAccounts
      .filter(a => selected.includes(a.id) && !isStaticAccount(a))
      .map(a => ({
        ...a,
        easyPassword: store.get(`pwd_easy_${a.id}`, ""),
        lightfunnelsPassword: store.get(`pwd_lightfunnels_${a.id}`, ""),
        taagerPassword: store.get(`pwd_taager_${a.id}`, ""),
        taagerPassword: store.get(`pwd_taager_${a.id}`, store.get(`pwd_taager_${a.id}`, "")),
        autoConfirm,
      }))
      .map(accountRunConfig);
  }

  // Fallback to legacy single-account
  if (accountsToRun.length === 0 && (!allAccounts || allAccounts.length === 0)) {
    accountsToRun = [{
      id: "legacy",
      label: "Account 1",
      easyEmail:    store.get("easyEmail",    ""),
      easyPassword: store.get("easyPassword", ""),
      easyStore:    store.get("easyStore",    ""),
      taagerEmail:    store.get("taagerEmail",    ""),
      taagerPassword: store.get("taagerPassword", ""),
      taagerCountry:  store.get("taagerCountry",  "sa"),
      taagerLoginMethod: store.get("taagerLoginMethod", "email"),
      taagerEmail:   store.get("taagerEmail", store.get("taagerEmail", "")),
      taagerPhone:   store.get("taagerPhone", ""),
      taagerPassword: store.get("taagerPassword", store.get("taagerPassword", "")),
      taagerCountry: store.get("taagerCountry", store.get("taagerCountry", "sa")),
      taagerAffiliateCode: store.get("taagerAffiliateCode", ""),
      autoConfirm,
    }].map(accountRunConfig);
  }

  if (accountsToRun.length === 0) {
    notifyAdminErrorAlert({
      flow: "runner",
      operation: "preflight",
      error: "STATIC_ACCOUNTS_CANNOT_RUN",
      dateFrom,
      dateTo,
    });
    return { success: false, error: "STATIC_ACCOUNTS_CANNOT_RUN" };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Single account: original flow Ã¢â€â‚¬Ã¢â€â‚¬
  const merchantIdMissingMessage = (acc) => {
    const label = accountDisplayName(acc, acc.id || "Account");
    return `Taager merchant ID missing for ${label}. Re-save this account and add the merchant ID from Taager profile.`;
  };
  const secondMerchantIdMissingMessage = (acc) => {
    const label = accountDisplayName(acc, acc.id || "Account");
    return `Second Taager cart merchant ID missing for ${label}. Re-save this account and configure the second Taager cart merchant ID.`;
  };
  const missingMerchantAccounts = accountsToRun.filter((acc) =>
    !String(acc.taagerAffiliateCode || "").trim() ||
    (missedOrdersDestinationOf(acc) === "second_taager_cart" && !String(acc.secondTaagerAffiliateCode || "").trim())
  );
  const preflightFailures = [];

  if (missingMerchantAccounts.length && accountsToRun.length > 1) {
    for (const acc of missingMerchantAccounts) {
      const message = !String(acc.taagerAffiliateCode || "").trim()
        ? merchantIdMissingMessage(acc)
        : secondMerchantIdMissingMessage(acc);
      notifyAdminErrorAlert({
        flow: "runner",
        operation: "preflight",
        account: acc,
        accountId: acc.id || "__single__",
        error: message,
        dateFrom,
        dateTo,
      });
      const now = Date.now();
      preflightFailures.push({
        success: false,
        error: message,
        accountId: acc.id || "__single__",
        accountEmail: accountContactEmail(acc),
        accountLabel: accountDisplayName(acc, "Account"),
        runStartedAt: now,
        runEndedAt: now,
        runtimeMs: 0,
      });
    }
    accountsToRun = accountsToRun.filter((acc) =>
      String(acc.taagerAffiliateCode || "").trim() &&
      !(missedOrdersDestinationOf(acc) === "second_taager_cart" && !String(acc.secondTaagerAffiliateCode || "").trim())
    );
  }

  const missingMerchant = accountsToRun.find((acc) => !String(acc.taagerAffiliateCode || "").trim());
  const missingSecondMerchant = accountsToRun.find((acc) =>
    missedOrdersDestinationOf(acc) === "second_taager_cart" && !String(acc.secondTaagerAffiliateCode || "").trim()
  );
  if (missingMerchant) {
    const message = merchantIdMissingMessage(missingMerchant);
    notifyAdminErrorAlert({
      flow: "runner",
      operation: "preflight",
      account: missingMerchant,
      accountId: missingMerchant.id || "__single__",
      error: message,
      dateFrom,
      dateTo,
    });
    return { success: false, error: message };
  }
  if (missingSecondMerchant) {
    const message = secondMerchantIdMissingMessage(missingSecondMerchant);
    notifyAdminErrorAlert({
      flow: "runner",
      operation: "preflight",
      account: missingSecondMerchant,
      accountId: missingSecondMerchant.id || "__single__",
      error: message,
      dateFrom,
      dateTo,
    });
    return { success: false, error: message };
  }

  if (accountsToRun.length === 0 && preflightFailures.length > 0) {
    mainWindow.webContents.send("bot-run-complete");
    return { success: false, multiAccount: true, results: preflightFailures };
  }

  if (accountsToRun.length === 1 && preflightFailures.length === 0) {
    const acc = accountsToRun[0];
    const profilePath = path.join(app.getPath("userData"), `bot-profile-${acc.id}`);
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });

    const creds = {
      ...acc,
      profilePath,
      dateFrom,
      dateTo,
      launchMinimized: store.get("launchMinimized", false),
      autoConfirm,
      missingOrdersUploadEnabled,
      easyOrdersAffiliateRecoveryEnabled,
      needsSnapshot: false,
      operationsSuiteEnabled,
      dashboardEnabled,
      reportingDataEnabled,
      chromePath: getCachedChromePath() || undefined,
    };
    return new Promise((resolve) => {
      const runStartedAt = Date.now();
      const finishTiming = () => {
        const runEndedAt = Date.now();
        return { runStartedAt, runEndedAt, runtimeMs: Math.max(0, runEndedAt - runStartedAt) };
      };
      const child = spawnBotChild(creds);
      currentBotChild = child;
      botChildren = [child];
      const logs = []; let resolved = false;
      const runLog = createBotRunLogWriter(acc, dateFrom, dateTo);
      mainWindow.webContents.send("bot-log", `[Run Log] Saved to: ${runLog.filePath}`);
      const safeResolve = (v) => { if (!resolved) { resolved = true; resolve(v); } };
      child.stdout.on("data", (d) => { const m = d.toString().trim(); if (m) { logs.push(m); runLog.write(m); mainWindow.webContents.send("bot-log", m); } });
      child.stderr.on("data", (d) => {
        const m = d.toString().trim(); if (!m) return;
        if (m.includes("CHROME_NOT_FOUND")) {
          runLog.write("ERR: " + m);
          mainWindow.webContents.send("bot-log", "Ã¢ÂÅ’ Google Chrome Ã˜ÂºÃ™Å Ã˜Â± Ã™â€¦Ã˜Â«Ã˜Â¨Ã˜Âª Ã˜Â¹Ã™â€žÃ™â€° Ã˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²Ã™Æ’.");
          mainWindow.webContents.send("bot-log", "Ã°Å¸â€˜â€° Ã˜Â­Ã™â€¦Ã™â€˜Ã™â€ž Chrome Ã™â€¦Ã™â€ : https://www.google.com/chrome");
          mainWindow.webContents.send("bot-log", "Ã¢Å“â€¦ Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â«Ã˜Â¨Ã™Å Ã˜Âª Ã˜Â§Ã™ÂÃ˜ÂªÃ˜Â­ Ã˜Â§Ã™â€žÃ˜Â¨Ã˜Â±Ã™â€ Ã˜Â§Ã™â€¦Ã˜Â¬ Ã™â€¦Ã™â€  Ã˜Â¬Ã˜Â¯Ã™Å Ã˜Â¯.");
        } else { runLog.write("ERR: " + m); mainWindow.webContents.send("bot-log", "ERR: " + m); }
      });
      child.on("message", (msg) => {
        if (msg.type === "result") {
          // Auto-save failed orders to per-email folder before resolving
          const data = msg.data || {};
          if (data.failedOrders?.buffer && data.failedOrders.buffer.length > 0) {
            const email = accountContactEmail(acc) || "unknown";
            const { dir, filePath } = saveFailedOrdersFile(email, data.failedOrders.buffer);
            data.failedOrders.failedDir  = dir;
            data.failedOrders.failedPath = filePath;
          }
          mainWindow.webContents.send("bot-run-complete");
          safeResolve({
            success: true,
            data,
            ...finishTiming(),
            runLogPath: runLog.filePath,
            accountId: acc.id || "__single__",
            accountEmail: accountContactEmail(acc),
            accountLabel: accountDisplayName(acc, "Account 1"),
          });
        }
        if (msg.type === "error") {
          notifyAdminErrorAlert({
            flow: "runner",
            operation: "child-message",
            account: acc,
            accountId: acc.id || "__single__",
            error: msg.error,
            dateFrom,
            dateTo,
            recentLogs: logs.slice(-10),
          });
          mainWindow.webContents.send("bot-run-complete");
          safeResolve({
            success: false,
            error: msg.error,
            ...finishTiming(),
            runLogPath: runLog.filePath,
            accountId: acc.id || "__single__",
            accountEmail: accountContactEmail(acc),
            accountLabel: accountDisplayName(acc, "Account 1"),
          });
        }
        if (msg.type === "export-timestamp") {
          lastExportTimestamp = msg.timestamp;
        }
        if (msg.type === "debug-screenshot") {
          runLog.write(`[Debug] Screenshot saved for ${msg.label || "bot"}: ${msg.path || ""}`);
          mainWindow.webContents.send("bot-log", `[Debug] Screenshot saved for ${msg.label || "bot"}: ${msg.path || ""}`);
          log.info(`[Bot] Debug screenshot saved for ${msg.label || "bot"}: ${msg.path || ""}`);
        }
        if (msg.type === "stage") {
          const stageLine = `[Stage:${msg.flow || "runner"}] ${msg.stage || "unknown"} ${msg.status ? `(${msg.status})` : ""}${msg.message ? ` - ${msg.message}` : ""}`;
          runLog.write(stageLine);
          mainWindow.webContents.send("bot-log", stageLine);
        }
        if (msg.type === "2fa-needed")     mainWindow.webContents.send("bot-2fa-needed");
        if (msg.type === "needs-confirm")  mainWindow.webContents.send("bot-needs-confirm");
        if (msg.type === "cooldown")       mainWindow.webContents.send("bot-cooldown", msg);
        if (msg.type === "preview") {
          mainWindow.webContents.send("bot-preview", {
            ...msg,
            accountId: acc.id || "__single__",
            accountEmail: accountContactEmail(acc),
            accountLabel: accountDisplayName(acc, "Account 1"),
            accountIdx: 0,
            totalAccounts: 1,
          });
        }
        if (msg.type === "order-progress") {
          mainWindow.webContents.send("bot-order-progress", {
            ...msg,
            accountId: acc.id || "__single__",
            accountEmail: accountContactEmail(acc),
            accountLabel: accountDisplayName(acc, "Account 1"),
            accountIdx: 0,
            totalAccounts: 1,
          });
        }
        if (msg.type === "taager-restart")   mainWindow.webContents.send("bot-taager-restart", msg);
        if (msg.type === "google-login-needed") {
          openManualGoogleLoginChrome(msg, child, {
            accountId: acc.id || "__single__",
            accountLabel: accountDisplayName(acc, "Account 1"),
          });
        }
        if (msg.type === "google-login-complete") {
          mainWindow.webContents.send("bot-google-login-complete", {
            accountId: acc.id || "__single__",
            accountLabel: accountDisplayName(acc, "Account 1"),
          });
        }
        if (msg.type === "session-event") {
          if (msg.site === "taager" && msg.event === "identity-verified") {
            bindTaagerAffiliateCode(acc.id || "__single__", msg.affiliateCode);
          }
          mainWindow.webContents.send("bot-session-event", msg);
        }
      });
      child.on("error", (err) => {
        monitoring.captureException(err, { operation: "bot.childProcess", extra: { accountId: acc.id || "__single__" } });
        notifyAdminErrorAlert({
          flow: "runner",
          operation: "child-process",
          account: acc,
          accountId: acc.id || "__single__",
          error: err.message,
          dateFrom,
          dateTo,
          recentLogs: logs.slice(-10),
        });
        mainWindow.webContents.send("bot-run-complete");
        safeResolve({
          success: false,
          error: err.message,
          logs,
          ...finishTiming(),
          runLogPath: runLog.filePath,
          accountId: acc.id || "__single__",
          accountEmail: accountContactEmail(acc),
          accountLabel: accountDisplayName(acc, "Account 1"),
        });
      });
      child.on("exit", (code) => {
        if (!resolved && code !== 0) {
          notifyAdminErrorAlert({
            flow: "runner",
            operation: "child-exit",
            account: acc,
            accountId: acc.id || "__single__",
            error: "Bot exited with code " + code,
            dateFrom,
            dateTo,
            recentLogs: logs.slice(-10),
          });
        }
        mainWindow.webContents.send("bot-run-complete");
        safeResolve({
          success: code === 0,
          error: code !== 0 ? "Bot exited with code " + code : null,
          logs,
          ...finishTiming(),
          runLogPath: runLog.filePath,
          accountId: acc.id || "__single__",
          accountEmail: accountContactEmail(acc),
          accountLabel: accountDisplayName(acc, "Account 1"),
        });
      });
    });
  }

  // Multiple accounts use a fixed 6-minute start stagger. A later account can run
  // while the previous account is still finishing non-export work.
  mainWindow.webContents.send("bot-log",
    `Ã°Å¸Å¡â‚¬ Ã˜ÂªÃ˜Â´Ã˜ÂºÃ™Å Ã™â€ž ${accountsToRun.length} Ã˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨Ã˜Â§Ã˜Âª Ã˜Â¨Ã˜Â´Ã™Æ’Ã™â€ž Ã˜ÂªÃ˜Â³Ã™â€žÃ˜Â³Ã™â€žÃ™Å  Ã¢â‚¬â€ Ã˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨ Ã™Ë†Ã˜Â§Ã˜Â­Ã˜Â¯ Ã™ÂÃ™Å  Ã™Æ’Ã™â€ž Ã™â€¦Ã˜Â±Ã˜Â©...`);

  const accountExportTimestamps = new Array(accountsToRun.length).fill(0);
  mainWindow.webContents.send("bot-log", "Multi-account mode: account starts are staggered by 6 minutes to stay beyond the EasyOrders 5-minute limit; later phases may overlap.");

  function runOneAccount(acc, idx) {
    const profilePath = path.join(app.getPath("userData"), `bot-profile-${acc.id}`);
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
    const creds = {
      ...acc,
      profilePath,
      dateFrom,
      dateTo,
      launchMinimized: store.get("launchMinimized", false),
      autoConfirm,
      missingOrdersUploadEnabled,
      easyOrdersAffiliateRecoveryEnabled,
      needsSnapshot: false,
      operationsSuiteEnabled,
      dashboardEnabled,
      reportingDataEnabled,
      chromePath: getCachedChromePath() || undefined,
    };
    const prefix = `[${accountDisplayName(acc, "Account " + (idx + 1))}] `;

    return new Promise((resolve) => {
      const runStartedAt = Date.now();
      const finishTiming = () => {
        const runEndedAt = Date.now();
        return { runStartedAt, runEndedAt, runtimeMs: Math.max(0, runEndedAt - runStartedAt) };
      };
      const child = spawnBotChild(creds);
      botChildren.push(child);
      currentBotChild = child;
      const logs = [];
      const runLog = createBotRunLogWriter(acc, dateFrom, dateTo, "account-" + (idx + 1));
      mainWindow.webContents.send("bot-log", `${prefix}[Run Log] Saved to: ${runLog.filePath}`);
      let resolved = false;
      const safeResolve = (v) => { if (!resolved) { resolved = true; resolve(v); } };

      child.stdout.on("data", (d) => {
        const m = d.toString().trim();
        if (m) { logs.push(m); runLog.write(prefix + m); mainWindow.webContents.send("bot-log", prefix + m); }
      });

      child.stderr.on("data", (d) => {
        const m = d.toString().trim();
        if (!m) return;
        runLog.write(prefix + "ERR: " + m);
        if (m.includes("CHROME_NOT_FOUND")) {
          mainWindow.webContents.send("bot-log", prefix + "Ã¢ÂÅ’ Google Chrome Ã˜ÂºÃ™Å Ã˜Â± Ã™â€¦Ã˜Â«Ã˜Â¨Ã˜Âª Ã˜Â¹Ã™â€žÃ™â€° Ã˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²Ã™Æ’.");
          mainWindow.webContents.send("bot-log", prefix + "Ã°Å¸â€˜â€° Ã˜Â­Ã™â€¦Ã™â€˜Ã™â€ž Chrome Ã™â€¦Ã™â€ : https://www.google.com/chrome");
          mainWindow.webContents.send("bot-log", prefix + "Ã¢Å“â€¦ Ã˜Â¨Ã˜Â¹Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â«Ã˜Â¨Ã™Å Ã˜Âª Ã˜Â§Ã™ÂÃ˜ÂªÃ˜Â­ Ã˜Â§Ã™â€žÃ˜Â¨Ã˜Â±Ã™â€ Ã˜Â§Ã™â€¦Ã˜Â¬ Ã™â€¦Ã™â€  Ã˜Â¬Ã˜Â¯Ã™Å Ã˜Â¯.");
        } else {
          mainWindow.webContents.send("bot-log", prefix + "ERR: " + m);
        }
      });

      child.on("message", (msg) => {
        const accountId    = acc.id;
        const accountEmail = accountContactEmail(acc);
        const accountLabel = accountDisplayName(acc, accountEmail || ("Account " + (idx + 1)));

        if (msg.type === "result") {
          const data = msg.data || {};
          if (data.failedOrders?.buffer && data.failedOrders.buffer.length > 0) {
            const email = accountContactEmail(acc) || acc.label || ("account-" + (idx + 1));
            const { dir, filePath } = saveFailedOrdersFile(email, data.failedOrders.buffer);
            data.failedOrders.failedDir  = dir;
            data.failedOrders.failedPath = filePath;
          }
          safeResolve({ success: true, data, ...finishTiming(), runLogPath: runLog.filePath, accountId, accountEmail, accountLabel });
        }
        if (msg.type === "error") {
          notifyAdminErrorAlert({
            flow: "runner",
            operation: "child-message",
            account: acc,
            accountId,
            error: msg.error,
            dateFrom,
            dateTo,
            recentLogs: logs.slice(-10),
          });
          safeResolve({ success: false, error: msg.error, ...finishTiming(), runLogPath: runLog.filePath, accountId, accountEmail, accountLabel });
        }

        if (msg.type === "export-timestamp") {
          lastExportTimestamp = msg.timestamp;
          accountExportTimestamps[idx] = msg.timestamp;
        }
        if (msg.type === "debug-screenshot") {
          runLog.write(`${prefix}[Debug] Screenshot saved for ${msg.label || "bot"}: ${msg.path || ""}`);
          mainWindow.webContents.send("bot-log", `${prefix}[Debug] Screenshot saved for ${msg.label || "bot"}: ${msg.path || ""}`);
          log.info(`${prefix}[Bot] Debug screenshot saved for ${msg.label || "bot"}: ${msg.path || ""}`);
        }
        const tagged = { ...msg, accountId, accountEmail, accountLabel, accountIdx: idx, totalAccounts: accountsToRun.length };
        if (msg.type === "stage") {
          const stageLine = `${prefix}[Stage:${msg.flow || "runner"}] ${msg.stage || "unknown"} ${msg.status ? `(${msg.status})` : ""}${msg.message ? ` - ${msg.message}` : ""}`;
          runLog.write(stageLine);
          mainWindow.webContents.send("bot-log", stageLine);
        }
        if (msg.type === "2fa-needed")     mainWindow.webContents.send("bot-2fa-needed",     tagged);
        if (msg.type === "needs-confirm")  mainWindow.webContents.send("bot-needs-confirm",  tagged);
        if (msg.type === "cooldown")       mainWindow.webContents.send("bot-cooldown",       tagged);
        if (msg.type === "preview")        mainWindow.webContents.send("bot-preview",        tagged);
        if (msg.type === "order-progress") mainWindow.webContents.send("bot-order-progress", tagged);
        if (msg.type === "taager-restart")   mainWindow.webContents.send("bot-taager-restart",   tagged);
        if (msg.type === "google-login-needed") {
          openManualGoogleLoginChrome(tagged, child, {
            accountId,
            accountLabel,
          });
        }
        if (msg.type === "google-login-complete") {
          mainWindow.webContents.send("bot-google-login-complete", tagged);
        }
        if (msg.type === "session-event") {
          if (msg.site === "taager" && msg.event === "identity-verified") {
            bindTaagerAffiliateCode(accountId, msg.affiliateCode);
          }
          mainWindow.webContents.send("bot-session-event", tagged);
        }
      });

      child.on("error", (err) => {
        monitoring.captureException(err, { operation: "bot.childProcess", extra: { accountId: acc.id } });
        notifyAdminErrorAlert({
          flow: "runner",
          operation: "child-process",
          account: acc,
          accountId: acc.id,
          error: err.message,
          dateFrom,
          dateTo,
          recentLogs: logs.slice(-10),
        });
        safeResolve({
          success: false,
          error: `${prefix}${err.message}`,
          logs,
          ...finishTiming(),
          runLogPath: runLog.filePath,
          accountId:    acc.id,
          accountEmail: accountContactEmail(acc),
          accountLabel: accountDisplayName(acc, "Account " + (idx + 1)),
        });
      });

      child.on("exit", (code) => {
        if (!resolved && code !== 0) {
          notifyAdminErrorAlert({
            flow: "runner",
            operation: "child-exit",
            account: acc,
            accountId: acc.id,
            error: `${prefix}exited with code ${code}`,
            dateFrom,
            dateTo,
            recentLogs: logs.slice(-10),
          });
        }
        safeResolve({
          success: code === 0,
          error: code !== 0 ? `${prefix}exited with code ${code}` : null,
          logs,
          ...finishTiming(),
          runLogPath: runLog.filePath,
          accountId:    acc.id,
          accountEmail: accountContactEmail(acc),
          accountLabel: accountDisplayName(acc, "Account " + (idx + 1)),
        });
      });
    });
  }

  botChildren = [];

  const INTER_ACCOUNT_COOLDOWN_MS = 6 * 60 * 1000; // Start the next account 6 minutes after the previous account launch.
  const INTER_ACCOUNT_COOLDOWN_LOG_INTERVAL_MS = 60 * 1000;

  async function waitForExportCooldown(previousAccountIndex, nextAccountIndex, previousResultPromise) {
    const previousLabel = accountDisplayName(accountsToRun[previousAccountIndex], `Account ${previousAccountIndex + 1}`);
    const label = `Account ${nextAccountIndex + 1}`;
    const launchTimestamp = accountExportTimestamps[previousAccountIndex];

    if (launchTimestamp) {
      let remainingMs = Math.max(0, INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - launchTimestamp));
      if (remainingMs > 0) {
        let remainingSec = Math.ceil(remainingMs / 1000);
        mainWindow.webContents.send("bot-log",
          `\nÃ¢ÂÂ¸Ã¯Â¸Â  [Account schedule] Waiting ${Math.floor(remainingSec / 60)} min ${remainingSec % 60}s before starting ${label} after ${previousLabel}...`);

        let nextLogAt = Date.now() + INTER_ACCOUNT_COOLDOWN_LOG_INTERVAL_MS;
        while (remainingMs > 0 && botRunning) {
          const elapsed = Date.now() - launchTimestamp;
          if (elapsed >= INTER_ACCOUNT_COOLDOWN_MS) break;
          const waitTime = Math.min(1000, INTER_ACCOUNT_COOLDOWN_MS - elapsed);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          remainingMs = INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - launchTimestamp);

          if (!botRunning) break;
          const now = Date.now();
          if (now >= nextLogAt) {
            while (nextLogAt <= now) nextLogAt += INTER_ACCOUNT_COOLDOWN_LOG_INTERVAL_MS;
            const remSec = Math.max(0, Math.ceil(remainingMs / 1000));
            mainWindow.webContents.send("bot-log",
              `Ã¢ÂÂ¸Ã¯Â¸Â  [Account schedule] Waiting ${Math.floor(remSec / 60)} min ${remSec % 60}s before starting ${label}...`);
          }
        }
      }
      return;
    }

    mainWindow.webContents.send("bot-log",
      `\nÃ¢ÂÂ³  [${label}] Ã™ÂÃ™Å  Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨ Ã˜Â§Ã™â€žÃ˜Â³Ã˜Â§Ã˜Â¨Ã™â€š Ã™â€šÃ˜Â¨Ã™â€ž Ã˜Â¨Ã˜Â¯Ã˜Â¡ Ã˜Â§Ã™â€žÃ˜Â¹Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ™â€ Ã˜Â§Ã˜Â²Ã™â€žÃ™Å ...`);

    let previousFinished = false;
    previousResultPromise.finally(() => { previousFinished = true; }).catch(() => {});

    while (botRunning && !accountExportTimestamps[previousAccountIndex] && !previousFinished) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!botRunning) return;

    const exportTimestamp = accountExportTimestamps[previousAccountIndex];
    if (!exportTimestamp) {
      const previousResult = previousFinished
        ? await previousResultPromise.catch((error) => ({ error: error && error.message ? error.message : String(error) }))
        : null;
      const previousError = String(previousResult && previousResult.error || "");
      const shouldWaitAfterNoExport = previousError.includes("ERR_CONNECTION") ||
        previousError.includes("net::") ||
        previousError.toLowerCase().includes("timeout") ||
        previousError.includes("INTERNET_ISSUE");

      if (shouldWaitAfterNoExport) {
        let remainingMs = INTER_ACCOUNT_COOLDOWN_MS;
        let remainingSec = Math.ceil(remainingMs / 1000);
        mainWindow.webContents.send("bot-log",
          `\nÃ¢ÂÂ¸Ã¯Â¸Â  [Ã˜ÂªÃ˜Â¬Ã™â€ Ã˜Â¨ Ã˜Â­Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â±] ${previousLabel} Ã™ÂÃ˜Â´Ã™â€ž Ã™â€šÃ˜Â¨Ã™â€ž Ã˜Â§Ã™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â± Ã˜Â¨Ã˜Â³Ã˜Â¨Ã˜Â¨ Ã˜Â§Ã™â€žÃ˜Â´Ã˜Â¨Ã™Æ’Ã˜Â© Ã¢â‚¬â€ Ã˜Â§Ã™â€žÃ˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± ${Math.floor(remainingSec / 60)} Ã˜Â¯Ã™â€šÃ™Å Ã™â€šÃ˜Â© Ã™Ë† ${remainingSec % 60} Ã˜Â«Ã˜Â§Ã™â€ Ã™Å Ã˜Â© Ã™â€šÃ˜Â¨Ã™â€ž Ã˜Â¨Ã˜Â¯Ã˜Â¡ ${label}...`);

        let nextLogAt = Date.now() + INTER_ACCOUNT_COOLDOWN_LOG_INTERVAL_MS;
        while (remainingMs > 0 && botRunning) {
          const tick = Math.min(1000, remainingMs);
          await new Promise(resolve => setTimeout(resolve, tick));
          remainingMs -= tick;
          if (!botRunning) break;
          const now = Date.now();
          if (now >= nextLogAt) {
            while (nextLogAt <= now) nextLogAt += INTER_ACCOUNT_COOLDOWN_LOG_INTERVAL_MS;
            const remSec = Math.ceil(remainingMs / 1000);
            mainWindow.webContents.send("bot-log",
              `Ã¢ÂÂ¸Ã¯Â¸Â  [Ã˜ÂªÃ˜Â¬Ã™â€ Ã˜Â¨ Ã˜Â­Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â±] Ã˜Â§Ã™â€žÃ˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã™â€žÃ™â€¦Ã˜Â¯Ã˜Â© ${Math.floor(remSec / 60)} Ã˜Â¯Ã™â€šÃ™Å Ã™â€šÃ˜Â© Ã™Ë† ${remSec % 60} Ã˜Â«Ã˜Â§Ã™â€ Ã™Å Ã˜Â© Ã™â€šÃ˜Â¨Ã™â€ž Ã˜Â¨Ã˜Â¯Ã˜Â¡ ${label}...`);
          }
        }
        return;
      }

      mainWindow.webContents.send("bot-log",
        `\n[${label}] ${previousLabel} Ã˜Â§Ã™â€ Ã˜ÂªÃ™â€¡Ã™â€° Ã™â€šÃ˜Â¨Ã™â€ž Ã˜Â§Ã™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â±Ã˜â€º Ã˜Â¨Ã˜Â¯Ã˜Â¡ Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â§Ã™â€žÃ™Å  Ã˜Â¨Ã˜Â¯Ã™Ë†Ã™â€  Ã˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â±.`);
      return;
    }

    let remainingMs = Math.max(0, INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - exportTimestamp));
    if (remainingMs > 0) {
      const remainingSec = Math.ceil(remainingMs / 1000);
      mainWindow.webContents.send("bot-log",
        `\nÃ¢ÂÂ¸Ã¯Â¸Â  [Ã˜ÂªÃ˜Â¬Ã™â€ Ã˜Â¨ Ã˜Â­Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â±] Ã˜Â§Ã™â€žÃ˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã™â€žÃ™â€¦Ã˜Â¯Ã˜Â© ${Math.floor(remainingSec / 60)} Ã˜Â¯Ã™â€šÃ™Å Ã™â€šÃ˜Â© Ã™Ë† ${remainingSec % 60} Ã˜Â«Ã˜Â§Ã™â€ Ã™Å Ã˜Â© Ã™â€šÃ˜Â¨Ã™â€ž Ã˜Â¨Ã˜Â¯Ã˜Â¡ ${label}...`);

      let nextLogAt = Date.now() + INTER_ACCOUNT_COOLDOWN_LOG_INTERVAL_MS;
      while (remainingMs > 0 && botRunning) {
        const currentElapsed = Date.now() - exportTimestamp;
        if (currentElapsed >= INTER_ACCOUNT_COOLDOWN_MS) break;
        const waitTime = Math.min(1000, INTER_ACCOUNT_COOLDOWN_MS - currentElapsed);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        remainingMs = INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - exportTimestamp);
        if (!botRunning) break;

        const now = Date.now();
        if (now >= nextLogAt) {
          while (nextLogAt <= now) nextLogAt += INTER_ACCOUNT_COOLDOWN_LOG_INTERVAL_MS;
          const remSec = Math.ceil(remainingMs / 1000);
          mainWindow.webContents.send("bot-log",
            `Ã¢ÂÂ¸Ã¯Â¸Â  [Ã˜ÂªÃ˜Â¬Ã™â€ Ã˜Â¨ Ã˜Â­Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â±] Ã˜Â§Ã™â€žÃ˜Â§Ã™â€ Ã˜ÂªÃ˜Â¸Ã˜Â§Ã˜Â± Ã™â€žÃ™â€¦Ã˜Â¯Ã˜Â© ${Math.floor(remSec / 60)} Ã˜Â¯Ã™â€šÃ™Å Ã™â€šÃ˜Â© Ã™Ë† ${remSec % 60} Ã˜Â«Ã˜Â§Ã™â€ Ã™Å Ã˜Â© Ã™â€šÃ˜Â¨Ã™â€ž Ã˜Â¨Ã˜Â¯Ã˜Â¡ ${label}...`);
        }
      }
    }
  }

  const resultPromises = [];
  for (let i = 0; i < accountsToRun.length; i++) {
    if (!botRunning) break;

    const acc = accountsToRun[i];
    const label = accountDisplayName(acc, `Account ${i + 1}`);

    if (i > 0) {
      await waitForExportCooldown(i - 1, i, resultPromises[i - 1]);
      if (!botRunning) break;
    }

    mainWindow.webContents.send("bot-log",
      `\nÃ¢â€“Â¶Ã¯Â¸Â  [${i + 1}/${accountsToRun.length}] Ã˜Â¨Ã˜Â¯Ã˜Â¡ Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨: ${label}`);

    accountExportTimestamps[i] = Date.now();

    const promise = runOneAccount(acc, i).then(result => {
      mainWindow.webContents.send("bot-log",
        `Ã¢Å“â€¦ [${i + 1}/${accountsToRun.length}] Ã˜Â§Ã™â€ Ã˜ÂªÃ™â€¡Ã™â€° Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â³Ã˜Â§Ã˜Â¨: ${label} Ã¢â‚¬â€ ${result.success ? "Ã™â€ Ã˜Â¬Ã˜Â­" : "Ã™ÂÃ˜Â´Ã™â€ž"}`);
      return result;
    });
    resultPromises.push(promise);
  }

  const results = preflightFailures.concat(await Promise.all(resultPromises));

  botChildren = [];
  mainWindow.webContents.send("bot-run-complete");
  const allOk = results.every(r => r.success);
  return { success: allOk, multiAccount: true, results };
});
