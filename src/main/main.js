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

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const Store = require("electron-store");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const https = require("https");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");
const monitoring = require("../monitoring/sentry.main");
const { normalizePhone } = require("../bot/phone");
const { processDashboardSheets } = require("../bot/dashboard-sheet-processing");
const { createDashboardQueryService } = require("./dashboard-query-service");
const { findNewDuplicateConflict } = require("./account-duplicates");
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

// ════════════════════════════════════════
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
// ════════════════════════════════════════

// ════════════════════════════════════════
// STARTUP PERFORMANCE FLAGS
// Must be set before app is ready.
// ════════════════════════════════════════
// Disable GPU process sandbox (reduces process spawn overhead on Windows)
app.commandLine.appendSwitch("disable-gpu-sandbox");
// Skip GPU info collection on startup (saves ~50–150 ms)
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
// Use hardware acceleration but skip slow software rasterizer fallback
app.commandLine.appendSwitch("enable-gpu-rasterization");
// Reduce IPC overhead on renderer startup
app.commandLine.appendSwitch("renderer-process-limit", "1");
// V8 code cache: reuse compiled JS across launches (saves 20–60 ms per launch)
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=256");

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
try {
  autoUpdater.verifyUpdateCodeSignature = false;
} catch (_) {}
autoUpdater.logger = {
  info:  (...a) => log.info("[AutoUpdate]", ...a),
  warn:  (...a) => log.warn("[AutoUpdate]", ...a),
  error: (...a) => log.error("[AutoUpdate]", ...a),
  debug: (...a) => log.debug("[AutoUpdate]", ...a),
};

// ══════════════════════════════════════════════════════
// SUPABASE CONFIG
// Primary source: .env file (dev) or extraResources/.env (packaged).
// No hardcoded fallback — missing config produces a clear warning rather than
// silently using stale credentials baked into the source.
// ══════════════════════════════════════════════════════
const SUPABASE_URL             = process.env.SUPABASE_URL             || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  log.warn("[App] Supabase config missing — license checks will fail until .env is configured.");
}

const SUPABASE_TIMEOUT_MS = 180_000; // 180 s (3 minutes) — enough for slow connections and multi-account syncs

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

function getIconPath() {
  // DEV:     assets/ is two levels up from src/main/
  // PACKAGED: extraResources copies assets/ → resources/assets/ (real disk, outside asar)
  //           so nativeImage.createFromPath() can always read it on any customer's PC
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "..", "..", "assets");
  if (process.platform === "win32") return path.join(base, "icon.ico");
  if (process.platform === "darwin") return path.join(base, "icon.icns");
  return path.join(base, "icon.png");
}

// ══════════════════════════════════════════════════════
// STORE ENCRYPTION KEYS
// Derived at runtime from a stable machine UUID so each machine gets a unique
// key — a static hardcoded string is trivially reversible once someone has the
// source. Two salts produce different keys for the two stores.
// NOTE: We now use a stable, unencrypted machine-id.json to break the chicken-and-egg
// problem where we couldn't read the UUID from the encrypted license.json.
// ══════════════════════════════════════════════════════
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
    // Corrupted store file — wipe it and recreate clean
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
const analyticsStore = createStore({ name: "analytics" }); // unencrypted — run history only
const dashboardStore = createStore({ name: "dashboard" }); // unencrypted — monthly snapshots
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

// ── Chrome path cache — resolved once at startup so dashboard fetch skips discovery ──
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

// ══════════════════════════════════════════════════════
// DEVICE FINGERPRINT — stable across reboots, updates, VPN, network changes
// Uses: CPU model + platform/arch + CPU count + RAM bucket (rounded to 4 GB)
//
// WHY hostname was REMOVED:
//   macOS silently renames the host after system updates or Bonjour conflicts
//   Windows may rename after domain join/leave or certain Windows Update passes
//   That was the #1 cause of unexpected "different device" kicks on Mac/Windows
// ══════════════════════════════════════════════════════
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

// ── Account slot hash — includes account id so two accounts with identical
//    emails still get distinct hashes and count as separate slots in DB.
function taagerLoginMethodOf(acc) {
  const method = (acc && (acc.taagerLoginMethod || acc.taagerLoginMethod) || "email").toLowerCase().trim();
  return ["email", "phone", "google"].includes(method) ? method : "email";
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
  const merchantIdentity = taagerMerchantIdentityOf(acc);
  if (merchantIdentity) return merchantIdentity;
  const method = taagerLoginMethodOf(acc);
  const country = String(acc && acc.taagerCountry || "sa").trim().toLowerCase();
  if (method === "phone") return normalizePhone(acc && (acc.taagerPhone || acc.taagerPhone) || "", country);
  return (acc && (acc.taagerEmail || acc.taagerEmail) || "").toLowerCase().trim();
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
  const easy = (acc.easyEmail  || "").toLowerCase().trim();
  const method = taagerLoginMethodOf(acc);
  const merchantId = String(acc && acc.taagerAffiliateCode || "").trim().toLowerCase();
  const country = String(acc && acc.taagerCountry || "sa").trim().toLowerCase();
  const loginIdentity = method === "phone" ? `phone:${taagerLoginIdentityOf(acc)}` : `email:${taagerLoginIdentityOf(acc)}`;
  const taagerIdentity = merchantId ? `merchant:${country}:${merchantId}` : loginIdentity;
  return `${easy}|${method}|${taagerIdentity}`;
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
  const easy = (acc.easyEmail || "").toLowerCase().trim();
  const rowEasy = String(row.easy_email || "").toLowerCase().trim();
  if (easy && rowEasy && easy !== rowEasy) return false;
  const easyStore = String(acc.easyStore || "").replace(/\s+/g, " ").trim().toLowerCase();
  const rowEasyStore = String(row.easy_store || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (easyStore && easy && rowEasyStore !== easyStore) return false;

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

function _buildAccountIdents() {
  try {
    const accounts = store.get("accounts", []);
    return accounts.map(a => ({
      easy_email: (a.easyEmail || "").toLowerCase().trim(),
      taager_email: (a.taagerEmail || a.taagerEmail || "").toLowerCase().trim(),
      taager_phone: normalizePhone(a.taagerPhone || a.taagerPhone || "", a.taagerCountry || "sa"),
      taager_merchant_id: String(a.taagerAffiliateCode || "").trim().toLowerCase(),
      taager_country: String(a.taagerCountry || "sa").trim().toLowerCase(),
      taager_login_method: taagerLoginMethodOf(a),
    })).filter(x => x.easy_email || x.taager_email || x.taager_phone || x.taager_merchant_id);
  } catch { return []; }
}

function looksLikeEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function accountDisplayName(acc, fallback = "Account") {
  if (!acc) return fallback;
  return (acc.memberName || acc.easyEmail || acc.email || acc.taagerEmail || acc.easyStore || acc.storeName || acc.label || acc.name || fallback || "Account").trim();
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
  if (/canceled_by_you|طلب ملغي بواسطتك/.test(status)) return "canceled_by_you";
  if (/delivered|تم التوصيل/.test(status)) return "delivered";
  if (/customer_refused_confirmation|رفض/.test(status)) return "customer_refused_confirmation";
  if (/on_hold|معلق/.test(status)) return "on_hold";
  if (/received|استلام/.test(status)) return "received";
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
    bucket === "after_sales_progress";
}

function dashboardIsLostBucket(bucket) {
  return bucket === "failed" ||
    bucket === "return_verified" ||
    bucket === "customer_refused_confirmation" ||
    bucket === "on_hold" ||
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

function replaceDashboardRowsInRange(existingRows, incomingRows, dateFrom, dateTo) {
  const from = normalizeDashboardDateKey(dateFrom);
  const to = normalizeDashboardDateKey(dateTo);
  return replaceRowsInDateRange(existingRows, incomingRows, from, to, {
    rowKey: dashboardRowKey,
    rowDateKey: dashboardRowDateKey,
  });
}

function enrichAnalyticsRunsFromTaagerRows(accountId, rows) {
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
    if (!Array.isArray(run.orders) || run.orders.length === 0) return run;

    let runChanged = false;
    const orders = run.orders.map((order) => {
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

// ══════════════════════════════════════════════════════
// LICENSE — server-only, random key, auto device lock
// Format: TAAGER-XXXX-XXXX-XXXX-XXXX
// ══════════════════════════════════════════════════════
// Short-lived in-memory cache — shared by isLicenseValid() (auto-run timer)
// and the check-license IPC handler to prevent redundant Supabase calls.
// Busted by submit-license and clear-reset-flag.
let _licenseCache = null;
let _licenseCacheAt = 0;
const LICENSE_CACHE_TTL_MS = 60 * 1000; // 60 seconds

function isValidKeyFormat(key) {
  return /^TAAGER-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim().toUpperCase());
}

async function isLicenseValid() {
  const key = licenseStore.get("licenseKey", "");
  if (!key) return false;
  if (_licenseCache && (Date.now() - _licenseCacheAt) < LICENSE_CACHE_TTL_MS) {
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
    _saveLastValidResult({ valid: true, key });
    return true;
  } catch {
    return !!_getOfflineGraceResult();
  }
}

// ════════════════════════════════════════
// TRAY
// ════════════════════════════════════════
function createTray() {
  const iconPath = getIconPath();
  console.log("[tray] icon path:", iconPath, "| exists:", require("fs").existsSync(iconPath));
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) console.warn("[tray] nativeImage loaded empty — check path and file validity");
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

// ════════════════════════════════════════
// WINDOW
// ════════════════════════════════════════
function createWindow() {
  // Read saved theme synchronously so we can pass the correct backgroundColor
  // before the window is shown — prevents a white/dark flash during startup.
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
      // Disable spell check — saves renderer init time for a non-document app
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
        ? "Auto-Run is active — minimizing to tray keeps the bot running every " + autoRunIntervalLabel() + "."
        : "The app will keep running in the system tray. Click the tray icon to reopen it.",
    });
    if (response === 0) mainWindow.hide();
    else { clearAutoRun(); app.isQuitting = true; app.quit(); }
  });
}

// ════════════════════════════════════════
// AUTO-RUN
// ════════════════════════════════════════
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
        // Bot still running — check again in 10 s without resetting the cycle
        autoRunTimer = setTimeout(scheduleTick, 10000);
        return;
      }
      if (!(await isLicenseValid())) {
        mainWindow.webContents.send("license-expired");
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

// ── Analytics: auto-purge old runs on startup ──────────────────────────────
function purgeOldAnalyticsRuns(daysToKeep = 30) {
  const runs = analyticsStore.get("runs", []);
  const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  const filtered = runs.filter(r => r.runTimestamp >= cutoff);
  if (filtered.length < runs.length) {
    analyticsStore.set("runs", filtered);
    invalidateAnalyticsRunsCache();
    log.info(`[Analytics] Purged ${runs.length - filtered.length} old runs (>${daysToKeep}d)`);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  autoRunEnabled = store.get("autoRun", false);
  if (autoRunEnabled) scheduleAutoRun();
  purgeOldAnalyticsRuns(store.get("analyticsPurgeDays", 30));

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
app.on("before-quit", () => { app.isQuitting = true; });

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

  // ── Why quitAndInstall() alone doesn't work with a tray app ────────────
  // quitAndInstall() relies on Electron's app.quit() flow, which fires
  // will-quit, before-quit, window-all-closed, etc.  When the app lives in
  // the tray (window hidden, process still running) those events don't
  // cleanly terminate all native handles fast enough.  NSIS checks for the
  // running process right after spawning and shows "cannot be closed" if it
  // finds it still alive.
  //
  // Solution: find the already-downloaded installer in electron-updater's
  // temp cache, spawn it as a fully detached independent process, then
  // hard-exit THIS process immediately.  The installer runs on its own —
  // it no longer needs this process to be alive.
  // ─────────────────────────────────────────────────────────────────────────

  const { spawn } = require("child_process");
  const os = require("os");

  // electron-updater stores the downloaded installer in the OS temp dir.
  // The file name matches the artifactName pattern from package.json.
  // We search for it rather than hardcode the version.
  function findDownloadedInstaller() {
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

    // Fallback: ask electron-updater for the cached path via its internal
    // _downloadedUpdateHelper (works for electron-updater v6.x)
    try {
      const helper = autoUpdater._downloadedUpdateHelper;
      if (helper && helper.downloadedFileInfo && helper.downloadedFileInfo.path) {
        return helper.downloadedFileInfo.path;
      }
    } catch (_) {}

    return null;
  }

  // 1. Tear everything down
  app.isQuitting = true;
  app.__sentryFlushed = true;
  clearAutoRun();

  const toKill = botChildren.length ? botChildren : (currentBotChild ? [currentBotChild] : []);
  for (const child of toKill) { try { child.kill("SIGKILL"); } catch (_) {} }

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
  log.info("[AutoUpdate] Installer path found:", installerPath || "NOT FOUND — falling back to quitAndInstall");

  if (installerPath && fs.existsSync(installerPath)) {
    try {
      // Spawn the NSIS installer fully detached so it survives this process exiting.
      // "--updated" is the silent flag electron-builder's NSIS script looks for
      // to know it was launched by the app (triggers the "updated" finish screen).
      const child = spawn(installerPath, ["--updated"], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      child.unref(); // do NOT wait for it
      log.info("[AutoUpdate] Installer spawned detached, exiting now");
    } catch (spawnErr) {
      log.error("[AutoUpdate] Failed to spawn installer:", spawnErr.message);
      // Fall through to quitAndInstall below
    }
    // Hard-exit immediately — installer is running on its own
    setTimeout(() => process.exit(0), 200);
    return;
  }

  // 3. Fallback: couldn't find installer file, use quitAndInstall + hard exit
  log.warn("[AutoUpdate] Installer file not found, falling back to quitAndInstall");
  try { autoUpdater.quitAndInstall(false, true); } catch (_) {}
  setTimeout(() => process.exit(0), 500);
});

ipcMain.handle("get-app-version", () => app.getVersion());

// ════════════════════════════════════════
// IPC — Window
// ════════════════════════════════════════
ipcMain.on("window-minimize", () => mainWindow.minimize());
ipcMain.on("window-maximize", () => { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
ipcMain.on("window-close", () => mainWindow.hide());
ipcMain.handle("get-app-zoom", () => getSavedAppZoom());
ipcMain.on("increase-app-zoom", () => stepAppZoom(1));
ipcMain.on("decrease-app-zoom", () => stepAppZoom(-1));
ipcMain.on("reset-app-zoom", () => applyAppZoom(DEFAULT_APP_ZOOM));

// ════════════════════════════════════════
// IPC — License (server-based, auto device lock)
// Handlers registered below after _checkLicenseImpl is defined.
// ════════════════════════════════════════

// ════════════════════════════════════════
// IPC — Credentials — Multi-Account Edition
// ════════════════════════════════════════

const OFFLINE_GRACE_MS = 48 * 60 * 60 * 1000;
const STARTUP_LICENSE_FAST_PATH_MS = 6 * 60 * 60 * 1000;

function _saveLastValidResult(result) {
  licenseStore.set("lastValidResult", result);
  licenseStore.set("lastValidAt", Date.now());
}

function _getOfflineGraceResult() {
  const lastValidAt = licenseStore.get("lastValidAt", 0);
  const lastResult  = licenseStore.get("lastValidResult", null);
  if (!lastResult || !lastResult.valid) return null;
  const age = Date.now() - lastValidAt;
  if (age > OFFLINE_GRACE_MS) return null;
  const hoursLeft = Math.ceil((OFFLINE_GRACE_MS - age) / 3600000);
  log.warn(`[License] Offline grace active - last valid ${Math.round(age / 60000)} min ago, ${hoursLeft}h left`);
  return { ...lastResult, offline: true };
}

function _getStartupCachedLicenseResult() {
  const key = licenseStore.get("licenseKey", "");
  const lastValidAt = licenseStore.get("lastValidAt", 0);
  const lastResult = licenseStore.get("lastValidResult", null);
  if (!key || !lastResult || !lastResult.valid || lastResult.key !== key) return null;
  if ((Date.now() - lastValidAt) > STARTUP_LICENSE_FAST_PATH_MS) return null;
  return { ...lastResult, startupCached: true };
}

function _handleForceFlush() {
  log.warn("[License] Force flush received — wiping all local data per admin request.");
  try { store.clear(); } catch (_) {}
  try { analyticsStore.clear(); } catch (_) {}
  try { dashboardStore.clear(); } catch (_) {}
  // licenseStore intentionally NOT cleared — customer can re-enter their existing key
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
  // Notify renderer — it handles navigation to the license screen
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("force-flush");
  }
}

function _handleResetCache() {
  log.warn("[License] Reset cache received - wiping local metrics and dashboard cache.");
  try { analyticsStore.clear(); } catch (_) {}
  try { dashboardStore.clear(); } catch (_) {}
  invalidateAnalyticsRunsCache();
  analyticsSnapshotSyncCacheKey = "";
  dashboardQueryService.clearCache();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("reset-cache");
  }
}

async function _checkLicenseImpl(bustCache) {
  const key = licenseStore.get("licenseKey", "");
  if (!key) return { valid: false, reason: "No license key." };
  if (!bustCache && _licenseCache && (Date.now() - _licenseCacheAt) < LICENSE_CACHE_TTL_MS) return _licenseCache;
  if (!bustCache) {
    const startupCached = _getStartupCachedLicenseResult();
    if (startupCached) {
      _licenseCache = startupCached;
      _licenseCacheAt = Date.now();
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
      return { valid: false, reason: r?.reason || "License not found on server." };
    }

    // Handle force flush: wipe local data and notify renderer.
    // Return valid:true here so the IPC caller doesn't also trigger the expired overlay —
    // the renderer navigates to the license screen exclusively via the force-flush event.
    if (r.force_flush) {
      _handleForceFlush();
      return { valid: true, forceFlush: true };
    }
    if (r.reset_cache) {
      _handleResetCache();
      return { valid: true, resetCache: true };
    }

    const daysLeft = r.expires_at ? Math.max(0, Math.ceil((new Date(r.expires_at) - new Date()) / 86400000)) : null;
    const customerName = r.customer_name || null;
    if (customerName) licenseStore.set("customerName", customerName);
    if (daysLeft !== null) licenseStore.set("daysLeft", daysLeft);
    licenseStore.set("allowReset", false);
    if (r.max_accounts) licenseStore.set("maxAccounts", r.max_accounts);
    const operationsSuiteEnabled = r.analytics_enabled !== false || r.operations_enabled !== false;
    const teamLeaderEnabled = r.team_leader_enabled === true;
    licenseStore.set("analyticsEnabled",  operationsSuiteEnabled);
    licenseStore.set("operationsEnabled", operationsSuiteEnabled);
    licenseStore.set("dashboardEnabled",  r.dashboard_enabled === true || teamLeaderEnabled);
    licenseStore.set("teamLeaderEnabled", teamLeaderEnabled);
    const result = {
      valid: true, key, daysLeft, customerName, allowReset: false,
      analyticsEnabled:  operationsSuiteEnabled,
      operationsEnabled: operationsSuiteEnabled,
      dashboardEnabled:  r.dashboard_enabled === true || teamLeaderEnabled,
      teamLeaderEnabled,
    };
    _licenseCache = result;
    _licenseCacheAt = Date.now();
    _saveLastValidResult(result);
    return result;
  } catch (e) {
    log.warn("[License] License check failed:", e.message);
    const grace = _getOfflineGraceResult();
    if (grace) return grace;
    return { valid: false, reason: "Cannot reach license server. Check your internet connection." };
  }
}

ipcMain.handle("check-license", async () => _checkLicenseImpl(false));
ipcMain.handle("check-license-nocache", async () => _checkLicenseImpl(true));
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
    const daysLeft = r.expires_at ? Math.max(0, Math.ceil((new Date(r.expires_at) - new Date()) / 86400000)) : null;
    const customerName = r.customer_name || null;
    licenseStore.set("licenseKey", clean);
    if (customerName) licenseStore.set("customerName", customerName);
    if (daysLeft !== null) licenseStore.set("daysLeft", daysLeft);
    if (r.max_accounts) licenseStore.set("maxAccounts", r.max_accounts);
    const operationsSuiteEnabled = r.analytics_enabled !== false || r.operations_enabled !== false;
    const teamLeaderEnabled = r.team_leader_enabled === true;
    licenseStore.set("analyticsEnabled",  operationsSuiteEnabled);
    licenseStore.set("operationsEnabled", operationsSuiteEnabled);
    licenseStore.set("dashboardEnabled",  r.dashboard_enabled === true || teamLeaderEnabled);
    licenseStore.set("teamLeaderEnabled", teamLeaderEnabled);
    _licenseCache = null;
    _licenseCacheAt = 0;
    return { success: true, daysLeft, customerName };
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

// Short-lived in-memory cache for get-credentials — eliminates the duplicate
// Supabase request when init() and afterLicense() both call it within milliseconds.
let _credCache = null;
let _credCacheAt = 0;
const CRED_CACHE_TTL_MS = 15 * 1000; // 15 seconds

function removeAccountLocalArtifacts(accountId) {
  const id = String(accountId || "").trim();
  if (!id || id === "__single__" || id === "legacy") return;
  try { store.delete(`pwd_easy_${id}`); } catch (_) {}
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
  const savedAutoRunIds = store.get("autoRunAccountIds", []);
  if (Array.isArray(savedAutoRunIds)) {
    store.set("autoRunAccountIds", savedAutoRunIds.filter(id => remainingIds.includes(id)));
  }
  store.set("unlockedAccountIds", store.get("unlockedAccountIds", []).filter(id => remainingIds.includes(id)));

  const first = accounts[0];
  if (first) {
    store.set("easyEmail", first.easyEmail || "");
    store.set("easyPassword", store.get(`pwd_easy_${first.id}`, ""));
    store.set("easyStore", first.easyStore || "");
    store.set("taagerLoginMethod", first.taagerLoginMethod || "email");
    store.set("taagerEmail", first.taagerEmail || "");
    store.set("taagerPhone", first.taagerPhone || "");
    store.set("taagerPassword", store.get(`pwd_taager_${first.id}`, ""));
    store.set("taagerCountry", first.taagerCountry || "sa");
    store.set("taagerAffiliateCode", first.taagerAffiliateCode || "");
  } else {
    ["easyEmail", "easyPassword", "easyStore", "taagerLoginMethod", "taagerEmail", "taagerPhone", "taagerPassword", "taagerCountry", "taagerAffiliateCode"].forEach(key => {
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
    maxAccounts:      licenseStore.get("maxAccounts", 1),
    analyticsEnabled:  licenseStore.get("analyticsEnabled",  true),
    operationsEnabled: licenseStore.get("operationsEnabled", true),
    dashboardEnabled:  licenseStore.get("dashboardEnabled",  false),
    teamLeaderEnabled: licenseStore.get("teamLeaderEnabled", false),
    // Only return legacy flat fields when real accounts exist — avoids ghost account resurrection
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
        // it means admin used "Clear All Slots" — treat all existing accounts as locked
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
    maxAccounts,
    analyticsEnabled:  licenseStore.get("analyticsEnabled",  true),
    operationsEnabled: licenseStore.get("operationsEnabled", true),
    dashboardEnabled:  licenseStore.get("dashboardEnabled",  false),
    teamLeaderEnabled: licenseStore.get("teamLeaderEnabled", false),
    // Suppress legacy flat fields when accounts array is empty — if we still return
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
  return { success: true };
});

// ── NEW: save full accounts array ──
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

  const teamLeaderEnabled = licenseStore.get("teamLeaderEnabled", false) === true;
  for (const a of accounts) {
    const method = taagerLoginMethodOf(a);
    const easyPassword = a.easyPassword || (a.id ? store.get(`pwd_easy_${a.id}`, "") : "");
    const taagerPassword = a.taagerPassword || (a.id ? store.get(`pwd_taager_${a.id}`, "") : "");
    const needsEasyOrdersCredentials = !teamLeaderEnabled || a.dashboardEnrichmentProvider === "easyorders";
    if (needsEasyOrdersCredentials && (!(a.easyStore || "").trim() || !(a.easyEmail || "").trim() || !easyPassword)) {
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
  }

  // ── Per-account lock check via license_accounts table ──
  if (licKey) {
    try {
      const dbRows      = await supabaseRpc("taager_get_license_accounts", { p_license_key: licKey }) || [];
      const dbHashes    = dbRows.map(r => r.account_hash);

      // Build a map of accountId → old hash using the CURRENTLY stored accounts
      // (before we overwrite them). This lets us detect when an edit changed emails.
      const oldHashById = {};
      for (const a of storedAccountsBeforeSave) oldHashById[a.id] = accountHash(a);

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

        // Case 1: hash unchanged — already in DB, nothing to do
        if (newH === oldH && dbHashes.includes(newH)) {
          const oldAccount = storedAccountsBeforeSave.find(item => item.id === a.id);
          const oldStore = String(oldAccount?.easyStore || "").replace(/\s+/g, " ").trim().toLowerCase();
          const newStore = String(a.easyStore || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (oldStore !== newStore) {
            const currentRow = dbRows.find(row => row.account_hash === newH);
            const syncRes = await supabaseRpc("taager_insert_license_account", {
              p_license_key: licKey,
              p_account_hash: newH,
              p_easy_email: (a.easyEmail || "").toLowerCase().trim() || null,
              p_easy_store: newStore || null,
              p_taager_email: taagerLoginIdentityOf(a) || null,
              p_taager_login_method: taagerLoginMethodOf(a),
              p_unlocked: !!currentRow?.unlocked,
            });
            if (syncRes && syncRes.success === false) {
              return { success: false, reason: syncRes.reason || "license_account_sync_failed" };
            }
          }
          continue;
        }

        // Case 2: this is an edit that changed the email — swap old hash for new hash
        if (oldH && dbHashes.includes(oldH)) {
          // Preserve the unlocked state from the old row
          const oldRow   = dbRows.find(r => r.account_hash === oldH);
          const wasUnlocked = oldRow ? !!oldRow.unlocked : false;
          // Server-side guard: reject the edit if the account is still locked
          if (!wasUnlocked) return { success: false, reason: "account_locked" };
          // Replace atomically so a duplicate rejection cannot remove the old slot.
          const newAccObj = accounts.find(a => accountHash(a) === newH);
          const newTaagerIdentity = taagerLoginIdentityOf(newAccObj);
          const replaceRes = await supabaseRpc("taager_replace_license_account", {
            p_license_key:  licKey,
            p_old_account_hash: oldH,
            p_new_account_hash: newH,
            p_easy_email:   (newAccObj?.easyEmail || "").toLowerCase().trim() || null,
            p_easy_store:   String(newAccObj?.easyStore || "").replace(/\s+/g, " ").trim().toLowerCase() || null,
            // RPC/column name is legacy; value is the Taager lock identity.
            p_taager_email:   newTaagerIdentity || null,
            p_taager_login_method: taagerLoginMethodOf(newAccObj),
          });
          if (replaceRes && replaceRes.success === false) {
            return { success: false, reason: replaceRes.reason || "license_account_sync_failed" };
          }
          continue;
        }

        // Case 3: genuinely new account — check slot limit then register
        if (!dbHashes.includes(newH)) {
          // Count how many truly new hashes (not in DB and not an edit swap) we're adding
          const alreadyKnownOrSwapped = accounts
            .filter(b => { const bOld = oldHashById[b.id]; return bOld && dbHashes.includes(bOld); })
            .map(b => accountHash(b));
          const genuinelyNew = newHashes.filter(h => !dbHashes.includes(h) && !alreadyKnownOrSwapped.includes(h));
          if (dbHashes.length + genuinelyNew.length > maxAccounts)
            return { success: false, reason: "limit_reached" };
          const newAccForInsert = accounts.find(a => accountHash(a) === newH);
          const newTaagerIdentity = taagerLoginIdentityOf(newAccForInsert);
          const insertRes = await supabaseRpc("taager_insert_license_account", {
            p_license_key:  licKey,
            p_account_hash: newH,
            p_easy_email:   (newAccForInsert?.easyEmail || "").toLowerCase().trim() || null,
            p_easy_store:   String(newAccForInsert?.easyStore || "").replace(/\s+/g, " ").trim().toLowerCase() || null,
            // RPC/column name is legacy; value is the Taager lock identity.
            p_taager_email:   newTaagerIdentity || null,
            p_taager_login_method: taagerLoginMethodOf(newAccForInsert),
            p_unlocked:     false,
          });
          if (insertRes && insertRes.success === false) {
            return { success: false, reason: insertRes.reason || "license_account_sync_failed" };
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
        // Server-side guard: never delete a locked account slot — only unlocked ones can be removed
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

  // Encrypt passwords in store — store accounts without plaintext passwords, keep passwords separately keyed
  const nextAccountIds = new Set(accounts.map(a => a.id));
  for (const oldAccount of storedAccountsBeforeSave) {
    if (!nextAccountIds.has(oldAccount.id)) removeAccountLocalArtifacts(oldAccount.id);
  }

  const safeAccounts = accounts.map(a => ({
    id:         a.id,
    memberName: String(a.memberName || "").trim(),
    label:      a.label || a.easyStore || a.easyEmail || a.taagerEmail || a.taagerEmail || a.taagerPhone || "",
    licenseAccountHash: a.licenseAccountHash && a.licenseIdentityKey === accountIdentityKey(a) ? a.licenseAccountHash : "",
    licenseIdentityKey: a.licenseAccountHash && a.licenseIdentityKey === accountIdentityKey(a) ? a.licenseIdentityKey : "",
    easyEmail:  a.easyEmail,
    easyStore:  a.easyStore  || "",
    dashboardEnrichmentProvider: a.dashboardEnrichmentProvider === "easyorders" ? "easyorders" : "none",
    easyOrdersLookbackDays: Number(a.easyOrdersLookbackDays || 60),
    taagerEmail:  a.taagerEmail,
    taagerAffiliateCode: a.taagerAffiliateCode || "",
    taagerCountry: a.taagerCountry || "sa",
    taagerLoginMethod: a.taagerLoginMethod || "email",
    taagerEmail: a.taagerEmail || a.taagerEmail || "",
    taagerPhone: a.taagerPhone || "",
    taagerCountry: a.taagerCountry || a.taagerCountry || "sa",
  }));
  store.set("accounts", safeAccounts);

  // Prune local unlockedAccountIds cache — remove IDs that no longer exist
  const remainingIds = accounts.map(a => a.id);
  const savedAutoRunIds = store.get("autoRunAccountIds", []);
  if (Array.isArray(savedAutoRunIds)) {
    store.set("autoRunAccountIds", savedAutoRunIds.filter(id => remainingIds.includes(id)));
  }
  const cachedUnlocked = store.get("unlockedAccountIds", []).filter(id => remainingIds.includes(id));
  store.set("unlockedAccountIds", cachedUnlocked);

  // Store passwords per account id
  for (const a of accounts) {
    if (a.easyPassword) store.set(`pwd_easy_${a.id}`, a.easyPassword);
    if (a.taagerPassword) store.set(`pwd_taager_${a.id}`, a.taagerPassword);
    if (a.taagerPassword || a.taagerPassword) store.set(`pwd_taager_${a.id}`, a.taagerPassword || a.taagerPassword);
  }

  // Also update legacy flat fields from first account (for any code still reading them)
  if (accounts[0]) {
    store.set("easyEmail",    accounts[0].easyEmail    || "");
    store.set("easyPassword", accounts[0].easyPassword || store.get(`pwd_easy_${accounts[0].id}`, ""));
    store.set("easyStore",    accounts[0].easyStore    || "");
    store.set("taagerEmail",    accounts[0].taagerEmail    || "");
    store.set("taagerPassword", accounts[0].taagerPassword || store.get(`pwd_taager_${accounts[0].id}`, ""));
    store.set("taagerCountry",  accounts[0].taagerCountry  || "sa");
    store.set("taagerLoginMethod", accounts[0].taagerLoginMethod || "email");
    store.set("taagerEmail",    accounts[0].taagerEmail    || accounts[0].taagerEmail || "");
    store.set("taagerPhone",    accounts[0].taagerPhone    || "");
    store.set("taagerPassword", accounts[0].taagerPassword || accounts[0].taagerPassword || store.get(`pwd_taager_${accounts[0].id}`, ""));
    store.set("taagerCountry",  accounts[0].taagerCountry  || accounts[0].taagerCountry || "sa");
  } else {
    // All accounts deleted — clear legacy flat fields so the renderer can't
    // resurrect a ghost account from stale easyEmail / taagerEmail values
    ["easyEmail", "easyPassword", "easyStore", "taagerEmail", "taagerPassword",
     "taagerCountry", "taagerLoginMethod", "taagerPhone", "taagerAffiliateCode"].forEach(k => store.delete(k));
  }
  // Cache maxAccounts locally
  licenseStore.set("maxAccounts", maxAccounts);
  // Bust credentials cache so next get-credentials reflects the new accounts
  _credCache = null;
  _credCacheAt = 0;
  invalidateAnalyticsRunsCache();
  return { success: true };
});


// ── ADMIN: unlock a single account (called when admin unlocks via panel) ──
// The app polls this on startup — when admin sets unlocked=true in DB,
// unlockedAccountIds is updated locally so UI re-enables edit button.
ipcMain.handle("unlock-single-account", async (_, { accountId }) => {
  return { success: false, reason: "admin_only" };
});

// ── Re-lock after user saves new credentials for an account ──
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
}));
ipcMain.handle("save-settings", (_, { theme, lang }) => {
  if (theme !== undefined) store.set("theme", theme);
  if (lang  !== undefined) store.set("lang",  lang);
  return true;
});

ipcMain.handle("open-folder", (_, p) => { shell.openPath(p); return true; });
ipcMain.handle("set-auto-run", (_, v) => { autoRunEnabled = v; store.set("autoRun", v); if (v) scheduleAutoRun(); else clearAutoRun(); return true; });
ipcMain.handle("set-auto-run-interval", (_, m) => { store.set("autoRunInterval", m); if (autoRunEnabled) scheduleAutoRun(); return true; });
ipcMain.handle("set-auto-run-accounts", (_, ids) => {
  const accounts = store.get("accounts", []) || [];
  const validIds = accounts.map(a => a.id);
  const selected = Array.isArray(ids) ? ids.filter(id => validIds.includes(id)) : [];
  store.set("autoRunAccountIds", selected);
  return selected;
});
ipcMain.handle("get-auto-run-progress", () => getAutoRunProgress());
ipcMain.handle("set-launch-minimized", (_, v) => { store.set("launchMinimized", v); return true; });
ipcMain.handle("set-auto-confirm", (_, v) => { store.set("autoConfirm", v); return true; });

let currentBotChild = null;
const pendingGoogleLoginRequests = new Map();
ipcMain.on("bot-started", () => { botRunning = true; });
ipcMain.on("bot-finished", () => { botRunning = false; currentBotChild = null; botChildren = []; });
ipcMain.on("kill-bot", () => {
  const toKill = botChildren.length ? botChildren : (currentBotChild ? [currentBotChild] : []);
  for (const child of toKill) { try { child.kill("SIGKILL"); } catch {} }
  currentBotChild = null; botChildren = []; botRunning = false;
});

// ── Analytics IPC Handlers ─────────────────────────────────────────────────

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
  chrome.once("error", (error) => {
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
    // Extract taagerSnapshot before storing (don't persist it — it's only for enrichment)
    const { taagerSnapshot, taagerDashboardSnapshot, buffer, ...rawRunData } = payload;
    if ((!Array.isArray(rawRunData.orders) || rawRunData.orders.length === 0) && buffer) {
      rawRunData.orders = parseOrderRowsFromOutputBuffer(buffer);
    }
    const runData = normalizeAnalyticsRun(rawRunData);

    // Normal order runs should not refresh dashboard snapshots. Dashboard rows
    // are updated only by the manual Dashboard Update flow.
    const dashboardRowsSaved = 0;
    const runs = analyticsStore.get("runs", []);
    const alreadyExists = runs.some(r => r.runId === runData.runId);
    if (alreadyExists) return { ok: true, duplicate: true, dashboardRowsSaved };

    // ── Enrichment pass: update previous stored runs with current Taager statuses ──
    // On every new bot run, we get a fresh Taager export. Any order from a previous run
    // whose phone+SKU now appears in the Taager sheet gets its status/amounts updated.
    // This is how "Under processing" → "Delivered" / "Failed" transitions happen.
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

// ── Dashboard Fetch — spawn dashboard-fetch.js (Taager-only, no Easy-Orders) ──
ipcMain.handle("run-dashboard-fetch", async (_, { accountId, dateFrom, dateTo } = {}) => {
  if (!(await isLicenseValid())) return { success: false, error: "LICENSE_INVALID" };
  if (!licenseStore.get("dashboardEnabled", false)) return { success: false, error: "DASHBOARD_NOT_ENABLED" };
  const rangeValidation = validateCurrentYearDashboardRange(dateFrom, dateTo);
  if (!rangeValidation.ok) return { success: false, error: rangeValidation.error };

  const { fork } = require("child_process");
  const allAccounts = store.get("accounts", null);
  const legacyEmail = store.get("easyEmail", "");

  let acc;
  if (allAccounts && allAccounts.length > 0) {
    if (accountId) {
      acc = allAccounts.find(a => a.id === accountId);
      if (!acc) return { success: false, error: `Dashboard account not found: ${accountId}` };
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

  if (!acc) return { success: false, error: "No account found" };

  const userData = app.getPath("userData");
  const dashboardAccountId = accountId || acc.id || "__single__";
  const taagerLoginMethod = taagerLoginMethodOf(acc);
  const dashboardEnrichmentProvider = String(acc.dashboardEnrichmentProvider || "none").toLowerCase() === "easyorders" ? "easyorders" : "none";
  const taagerEmail = acc.taagerEmail || store.get("taagerEmail", "");
  const taagerPassword = acc.taagerPassword || (acc.id ? store.get(`pwd_taager_${acc.id}`, "") : "") || store.get("taagerPassword", "");
  const taagerPhone = acc.taagerPhone || store.get("taagerPhone", "");
  const easyPassword = acc.easyPassword || (acc.id ? store.get(`pwd_easy_${acc.id}`, "") : "") || store.get("easyPassword", "");
  if (taagerLoginMethod !== "google" && !taagerEmail && !taagerPhone) {
    const label = accountDisplayName(acc, dashboardAccountId);
    return { success: false, error: `Taager credentials missing for ${label}. Re-save this account, then retry dashboard update.` };
  }
  if (!String(acc.taagerAffiliateCode || "").trim()) {
    const label = accountDisplayName(acc, dashboardAccountId);
    return { success: false, error: `Taager merchant ID missing for ${label}. Re-save this account and add the merchant ID from Taager profile.` };
  }
  const profilePath = path.join(userData, `bot-profile${acc.id ? `-${acc.id}` : ""}`);
  if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });

  const creds = {
    ...acc,
    profilePath,
    launchMinimized: store.get("launchMinimized", false),
    easyPassword,
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

    const accountLabel = accountDisplayName(acc, dashboardAccountId);

    child.stdout.on("data", (d) => {
      const text = d.toString();
      mainWindow.webContents.send("bot-log", `[Dashboard:${accountLabel}] ${text}`);
    });
    child.stderr.on("data", (d) => {
      mainWindow.webContents.send("bot-log", `[Dashboard:${accountLabel}][ERR] ` + d.toString());
    });

    let resolved = false;
    const safeResolve = (v) => { if (!resolved) { resolved = true; resolve(v); } };

    child.on("message", async (msg) => {
      if (msg.type === "dashboard-result") {
        const rows = normalizeDashboardProfitRows(msg.rows || []);
        try {
          const rangeFrom = msg.dateFrom || dateFrom || "";
          const rangeTo = msg.dateTo || dateTo || "";
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
        } catch (e) {
          console.error("[Dashboard] Failed to save snapshot:", e.message);
          monitoring.captureException(e, { operation: "dashboard.fetch.saveSnapshot", extra: { accountId: dashboardAccountId } });
        }
        safeResolve({
          success: true,
          rows: rows.length,
          snapshotMonth: msg.snapshotMonth,
          parseDiagnostics: msg.parseDiagnostics || null,
          enrichmentDiagnostics: msg.enrichmentDiagnostics || (msg.parseDiagnostics && msg.parseDiagnostics.enrichment) || null,
          debugSummary: dashboardDebugSummaryForRange(rows, msg.dateFrom || dateFrom || "", msg.dateTo || dateTo || "", msg.parseDiagnostics)
        });
      } else if (msg.type === "error") {
        safeResolve({ success: false, error: msg.error });
      } else if (msg.type === "export-timestamp") {
        lastExportTimestamp = msg.timestamp || Date.now();
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
      safeResolve({ success: false, error: err.message });
    });
    child.on("exit", (code) => {
      if (!resolved) safeResolve({ success: false, error: `Process exited with code ${code}` });
    });
  });
});

// ── Dashboard IPC Handlers ─────────────────────────────────────────────────

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
    enrichmentEnabled: account.dashboardEnrichmentProvider === "easyorders",
    easyOrdersLookbackDays: Number(account.easyOrdersLookbackDays || 60),
    skuNameCache: getDashboardSkuNameCache(accountId),
  });
  const normalizedRows = normalizeDashboardProfitRows(processed.rows);
  const existingRows = dashboardStore.get("accounts", {})[accountId]?.snapshot || [];
  const validation = validateDashboardSnapshotReplacement(existingRows, normalizedRows, processed.dateFrom, processed.dateTo, processed.parseDiagnostics);
  return {
    accountId,
    processed: { ...processed, rows: normalizedRows },
    validation,
    requiresConfirmation: validation.suspicious || normalizedRows.length === 0,
  };
}

function staticDashboardResult(prepared, extra = {}) {
  return {
    ok: true,
    accountId: prepared.accountId,
    rows: prepared.processed.rows.length,
    orders: prepared.validation.incoming.rawOrders,
    dateFrom: prepared.processed.dateFrom,
    dateTo: prepared.processed.dateTo,
    snapshotMonth: prepared.processed.snapshotMonth,
    warnings: prepared.processed.warnings || [],
    parseDiagnostics: prepared.processed.parseDiagnostics,
    enrichmentDiagnostics: prepared.processed.enrichmentDiagnostics,
    validation: prepared.validation,
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

ipcMain.handle("get-dashboard-snapshot", async (_, accountId, knownRevision) => {
  try {
    const allowedIds = (store.get("accounts", []) || []).map((account) => account && account.id).filter(Boolean);
    const revision = String(Number(dashboardStore.get("snapshotRevision", 0) || 0)) + "|" + allowedIds.join(",");
    if (knownRevision != null && String(knownRevision) === revision) {
      return { ok: true, unchanged: true, revision, data: null };
    }
    const accounts = dashboardStore.get("accounts", {});
    if (accountId && accountId !== "__all__") {
      return { ok: true, revision, data: normalizeDashboardAccountSnapshot(accounts[accountId]) };
    }
    if (allowedIds.length) {
      const filtered = {};
      allowedIds.forEach((id) => {
        if (accounts[id]) filtered[id] = normalizeDashboardAccountSnapshot(accounts[id]);
      });
      return { ok: true, revision, data: filtered };
    }
    // Return all accounts
    return { ok: true, revision, data: normalizeDashboardAccountsSnapshot(accounts) };
  } catch (err) {
    monitoring.captureException(err, { operation: "dashboard.getSnapshot", extra: { accountId } });
    return { ok: false, data: null, error: err.message };
  }
});

ipcMain.handle("get-dashboard-query-flags", async () => ({
  ok: true,
  shadow: process.env.TAAGER_DASHBOARD_QUERY_SHADOW === "1",
  orders: process.env.TAAGER_DASHBOARD_QUERY_ORDERS === "1",
  products: process.env.TAAGER_DASHBOARD_QUERY_PRODUCTS === "1",
  campaigns: process.env.TAAGER_DASHBOARD_QUERY_CAMPAIGNS === "1",
  cities: process.env.TAAGER_DASHBOARD_QUERY_CITIES === "1" || process.env.TAAGER_DASHBOARD_QUERY_PRODUCTS === "1",
  lazyMarketing: process.env.TAAGER_DASHBOARD_LAZY_MARKETING !== "0",
  incrementalMarketing: process.env.TAAGER_MARKETING_INCREMENTAL_SYNC === "1",
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
  const stable = account && (taagerMarketingKeyOf(account) || account.taagerEmail || account.easyEmail || account.label || "");
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
    };
  });
}

const TAAGER_USD_RATES = { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };

function marketingCurrency(value, fallback = "USD") {
  const cur = String(value || fallback || "USD").trim().toUpperCase();
  return TAAGER_USD_RATES[cur] ? cur : String(fallback || "USD").toUpperCase();
}

function convertMarketingAmount(amount, from, to, egpRate = 52) {
  const source = marketingCurrency(from);
  const target = marketingCurrency(to, source);
  if (source === target) return Number(amount || 0) || 0;
  const rates = { ...TAAGER_USD_RATES, EGP: Number(egpRate) > 0 ? Number(egpRate) : TAAGER_USD_RATES.EGP };
  return ((Number(amount || 0) || 0) / Number(rates[source] || 1)) * Number(rates[target] || 1);
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
      summary.adSpend += convertMarketingAmount(source.adSpend || 0, source.currency || "USD", "USD", source.egpRate || 52);
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
    availableAccounts: status && status.availableAccounts || [],
    mappings,
    reconnectRequired: !!(status && status.reconnectRequired),
  }));
}

function saveCachedMarketingStatus(accountId, platform, status) {
  if (!accountId || !status) return;
  const accounts = dashboardStore.get("accounts", {});
  if (!accounts[accountId]) accounts[accountId] = {};
  if (!accounts[accountId].marketing) accounts[accountId].marketing = {};
  const previous = accounts[accountId].marketing[platform] || null;
  const next = {
    platform,
    status: status.status || "disconnected",
    statusCheckedAt: status.statusCheckedAt || previous && previous.statusCheckedAt || null,
    lastSyncAt: status.lastSyncAt || null,
    summary: status.summary || null,
    sourceAccountName: status.sourceAccountName || "",
    sourceAccountId: status.sourceAccountId || "",
    linkedAccounts: Array.isArray(status.linkedAccounts) ? status.linkedAccounts : [],
    mappedAccounts: Array.isArray(status.mappedAccounts) ? status.mappedAccounts : [],
    availableAccounts: Array.isArray(status.availableAccounts) ? status.availableAccounts : [],
    diagnostics: status.diagnostics || null,
    reconnectRequired: !!status.reconnectRequired,
    error: status.error || "",
    limit: status.limit || null,
    limits: status.limits || null,
    mappings: status.mappings || {},
    cache: status.cache || null,
    stale: !!status.stale,
  };
  accounts[accountId].marketing[platform] = next;
  dashboardStore.set("accounts", accounts);
  const changed = marketingRevisionValue(previous) !== marketingRevisionValue(next);
  if (changed) bumpDashboardMarketingRevision();
  return changed;
}

function saveCachedAllMarketingMappingStatus(platform, result) {
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
    saveCachedMarketingStatus(setting.dashboardAccountId, platform, {
      platform,
      status: sourceAccounts.length ? "connected" : "disconnected",
      linkedAccounts: sourceAccounts,
      mappedAccounts: sourceAccounts,
      availableAccounts: sourceAccounts.length ? [] : knownAccounts,
      mappings,
      limit: result.limits && result.limits[setting.dashboardAccountId] || null,
      summary: null,
      lastSyncAt: null,
      cache: result.cache || null,
    });
  });
}

async function callMarketingBackend(action, accountId, platform, range) {
  const dashboardAccountId = marketingAccountKey(accountId, action !== "sync");
  if (!dashboardAccountId) return { ok: false, error: "SELECT_SINGLE_ACCOUNT" };
  if (!["tiktok", "snapchat", "facebook"].includes(platform)) return { ok: false, error: "PLATFORM_NOT_AVAILABLE" };
  if (!(await isLicenseValid())) return { ok: false, error: "LICENSE_INVALID" };

  const licenseKey = licenseStore.get("licenseKey", "");
  const account = getStoredAccountById(dashboardAccountId);
  const dashboardAccountKey = marketingStableAccountKey(dashboardAccountId);
  log.info("[Marketing][Main] request", {
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
    accountSettings: range && Array.isArray(range.accountSettings) ? range.accountSettings : [],
    dateFrom: range && range.dateFrom ? range.dateFrom : "",
    dateTo: range && range.dateTo ? range.dateTo : "",
  });
  const result = await supabaseFunctionRequest("windsor-marketing", {
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
    egpRate: range && range.egpRate ? range.egpRate : null,
    accountSettings: range && Array.isArray(range.accountSettings)
      ? range.accountSettings
      : (action === "status" && dashboardAccountId === "__all__" ? normalizeMarketingAccountSettings([]) : []),
    dateFrom: range && range.dateFrom ? range.dateFrom : "",
    dateTo: range && range.dateTo ? range.dateTo : "",
    identity: {
      licenseKey,
      machineUuid: _getOrCreateMachineUUID(),
      deviceId: getDeviceFingerprint(),
      accountIdents: _buildAccountIdents(),
    },
  });
  log.info("[Marketing][Main] response", {
    action,
    ok: !!(result && result.ok),
    status: result && result.status || "",
    error: result && result.error || "",
    linkedAccountCount: result && result.linkedAccountCount || 0,
    mappedAccountCount: result && Array.isArray(result.mappedAccounts) ? result.mappedAccounts.length : 0,
    availableAccountCount: result && Array.isArray(result.availableAccounts) ? result.availableAccounts.length : 0,
    claimableAccountCount: result && Array.isArray(result.claimableAccounts) ? result.claimableAccounts.length : 0,
    diagnostics: result && result.diagnostics || null,
    summary: result && result.summary || null,
  });
  return result;
}

const MARKETING_STATUS_TTL_MS = 15 * 60 * 1000;

function marketingStatusIsFresh(status) {
  const checkedAt = status && status.statusCheckedAt ? new Date(status.statusCheckedAt).getTime() : 0;
  return checkedAt > 0 && Date.now() - checkedAt < MARKETING_STATUS_TTL_MS;
}

ipcMain.handle("get-marketing-status", async (_, accountId, platform = "tiktok", options = {}) => {
  const dashboardAccountId = marketingAccountKey(accountId, true);
  if (!dashboardAccountId) return { ok: false, error: "SELECT_ACCOUNT" };
  const mode = ["cached", "revalidate", "force"].includes(options && options.mode) ? options.mode : "revalidate";
  const cached = getCachedMarketingStatus(dashboardAccountId, platform);
  if (cached && mode === "cached") {
    return { ok: true, ...cached, cache: { ...(cached.cache || {}), status: "local", providerRequestCount: 0 } };
  }
  if (cached && mode === "revalidate" && (marketingStatusIsFresh(cached) || cached.status === "disconnected")) {
    return { ok: true, ...cached, cache: { ...(cached.cache || {}), status: "local", providerRequestCount: 0 } };
  }
  try {
    const result = await callMarketingBackend("status", dashboardAccountId, platform, { mode });
    if (result && result.ok) {
      saveCachedMarketingStatus(dashboardAccountId, platform, result);
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
    const incrementalEnabled = process.env.TAAGER_MARKETING_INCREMENTAL_SYNC === "1";
    const requestedMode = range && range.mode === "full" ? "full" : "incremental";
    const cached = getCachedMarketingStatus(dashboardAccountId, platform);
    const cachedSummary = cached && cached.summary || {};
    const sameRange = String(cachedSummary.dateFrom || "") === String(range && range.dateFrom || "") &&
      String(cachedSummary.dateTo || "") === String(range && range.dateTo || "");
    const currencyChanged = String(cachedSummary.currency || "").toUpperCase() !== String(range && range.targetCurrency || "").toUpperCase() ||
      Number(cachedSummary.egpRate || 52) !== Number(range && range.egpRate || 52);
    const result = await callMarketingBackend("sync", dashboardAccountId, platform, {
      ...(range || {}),
      mode: incrementalEnabled ? requestedMode : undefined,
      recomposeOnly: incrementalEnabled && requestedMode === "incremental" && sameRange && currencyChanged,
    });
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
    const incrementalEnabled = process.env.TAAGER_MARKETING_INCREMENTAL_SYNC === "1";
    const requestedMode = range && range.mode === "full" ? "full" : "incremental";
    const accountSettings = normalizeMarketingAccountSettings(range && range.accountSettings);
    const cacheComparisons = accountSettings.map((setting) => {
      const cached = getCachedMarketingStatus(setting.dashboardAccountId, platform);
      const summary = cached && cached.summary || {};
      return {
        sameRange: String(summary.dateFrom || "") === String(range && range.dateFrom || "") &&
          String(summary.dateTo || "") === String(range && range.dateTo || ""),
        currencyChanged: String(summary.currency || "").toUpperCase() !== String(setting.currency || "").toUpperCase() ||
          Number(summary.egpRate || 52) !== Number(setting.egpRate || 52),
      };
    });
    const result = await callMarketingBackend("sync_all", "__all__", platform, {
      ...(range || {}),
      mode: incrementalEnabled ? requestedMode : undefined,
      recomposeOnly: incrementalEnabled && requestedMode === "incremental" &&
        cacheComparisons.length > 0 &&
        cacheComparisons.every((item) => item.sameRange) &&
        cacheComparisons.some((item) => item.currencyChanged),
      accountSettings,
    });
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

ipcMain.handle("open-external-url", async (_, externalUrl) => {
  try {
    const parsed = new URL(String(externalUrl || ""));
    const allowedHosts = new Set(["onboard.windsor.ai", "taager.com", "www.taager.com"]);
    if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname)) {
      return { ok: false, error: "URL_NOT_ALLOWED" };
    }
    await shell.openExternal(parsed.toString());
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
  log.info("[TaagerAI-Debug] dashboard-ai-query → command:", _cmd);
  log.info("[TaagerAI-Debug] context payload size:", _ctxKB + " KB (" + _ctxBytes + " bytes)");
  if (_ctxBytes > 150000) {
    log.warn("[TaagerAI-Debug] ⚠️  Context is VERY LARGE (" + _ctxKB + " KB) — likely to hit Gemini input token limit!");
  }
  // ─────────────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────────────────────

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
  // licenseStore NOT cleared — device lock and key survive reset
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

// ════════════════════════════════════════
// IPC — Bot runner (license-gated)
// ════════════════════════════════════════
// ── Helper: spawn one bot child for one account ──
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

// ── Helper: auto-save failed orders xlsx to %APPDATA%/taager-order-bot/failed-orders/{easyEmail}/ ──
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

ipcMain.handle("run-bot", async (_, { dateFrom, dateTo, accountIds }) => {
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

  // ── Build account list to run ──
  const allAccounts = store.get("accounts", null);
  let accountsToRun = [];

  if (allAccounts && allAccounts.length > 0) {
    // Multi-account: filter by selected ids (if provided), else run all
    const selected = Array.isArray(accountIds) && accountIds.length > 0 ? accountIds : allAccounts.map(a => a.id);
    accountsToRun = allAccounts
      .filter(a => selected.includes(a.id))
      .map(a => ({
        ...a,
        easyPassword: store.get(`pwd_easy_${a.id}`, ""),
        taagerPassword: store.get(`pwd_taager_${a.id}`, ""),
        taagerPassword: store.get(`pwd_taager_${a.id}`, store.get(`pwd_taager_${a.id}`, "")),
        autoConfirm,
      }));
  }

  // Fallback to legacy single-account
  if (accountsToRun.length === 0) {
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
    }];
  }

  // ── Single account: original flow ──
  const missingMerchant = accountsToRun.find((acc) => !String(acc.taagerAffiliateCode || "").trim());
  if (missingMerchant) {
    const label = accountDisplayName(missingMerchant, missingMerchant.id || "Account");
    return { success: false, error: `Taager merchant ID missing for ${label}. Re-save this account and add the merchant ID from Taager profile.` };
  }

  if (accountsToRun.length === 1) {
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
      const safeResolve = (v) => { if (!resolved) { resolved = true; resolve(v); } };
      child.stdout.on("data", (d) => { const m = d.toString().trim(); if (m) { logs.push(m); mainWindow.webContents.send("bot-log", m); } });
      child.stderr.on("data", (d) => {
        const m = d.toString().trim(); if (!m) return;
        if (m.includes("CHROME_NOT_FOUND")) {
          mainWindow.webContents.send("bot-log", "❌ Google Chrome غير مثبت على جهازك.");
          mainWindow.webContents.send("bot-log", "👉 حمّل Chrome من: https://www.google.com/chrome");
          mainWindow.webContents.send("bot-log", "✅ بعد التثبيت افتح البرنامج من جديد.");
        } else { mainWindow.webContents.send("bot-log", "ERR: " + m); }
      });
      child.on("message", (msg) => {
        if (msg.type === "result") {
          // Auto-save failed orders to per-email folder before resolving
          const data = msg.data || {};
          if (data.failedOrders?.buffer && data.failedOrders.buffer.length > 0) {
            const email = acc.easyEmail || "unknown";
            const { dir, filePath } = saveFailedOrdersFile(email, data.failedOrders.buffer);
            data.failedOrders.failedDir  = dir;
            data.failedOrders.failedPath = filePath;
          }
          mainWindow.webContents.send("bot-run-complete");
          safeResolve({
            success: true,
            data,
            ...finishTiming(),
            accountId: acc.id || "__single__",
            accountEmail: acc.easyEmail || "",
            accountLabel: accountDisplayName(acc, "Account 1"),
          });
        }
        if (msg.type === "error") {
          mainWindow.webContents.send("bot-run-complete");
          safeResolve({
            success: false,
            error: msg.error,
            ...finishTiming(),
            accountId: acc.id || "__single__",
            accountEmail: acc.easyEmail || "",
            accountLabel: accountDisplayName(acc, "Account 1"),
          });
        }
        if (msg.type === "export-timestamp") {
          lastExportTimestamp = msg.timestamp;
        }
        if (msg.type === "2fa-needed")     mainWindow.webContents.send("bot-2fa-needed");
        if (msg.type === "needs-confirm")  mainWindow.webContents.send("bot-needs-confirm");
        if (msg.type === "cooldown")       mainWindow.webContents.send("bot-cooldown", msg);
        if (msg.type === "preview")        mainWindow.webContents.send("bot-preview", msg);
        if (msg.type === "order-progress") {
          mainWindow.webContents.send("bot-order-progress", {
            ...msg,
            accountId: acc.id || "__single__",
            accountEmail: acc.easyEmail || "",
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
        mainWindow.webContents.send("bot-run-complete");
        safeResolve({
          success: false,
          error: err.message,
          logs,
          ...finishTiming(),
          accountId: acc.id || "__single__",
          accountEmail: acc.easyEmail || "",
          accountLabel: accountDisplayName(acc, "Account 1"),
        });
      });
      child.on("exit", (code) => {
        mainWindow.webContents.send("bot-run-complete");
        safeResolve({
          success: code === 0,
          error: code !== 0 ? "Bot exited with code " + code : null,
          logs,
          ...finishTiming(),
          accountId: acc.id || "__single__",
          accountEmail: acc.easyEmail || "",
          accountLabel: accountDisplayName(acc, "Account 1"),
        });
      });
    });
  }

  // Multiple accounts — run fully sequential: account 1 finishes everything, then account 2, etc.
  mainWindow.webContents.send("bot-log",
    `🚀 تشغيل ${accountsToRun.length} حسابات بشكل تسلسلي — حساب واحد في كل مرة...`);

  const accountExportTimestamps = new Array(accountsToRun.length).fill(0);
  mainWindow.webContents.send("bot-log", "Multi-account mode: account starts are staggered by the Easy-Orders export cooldown; later phases may overlap.");

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
      let resolved = false;
      const safeResolve = (v) => { if (!resolved) { resolved = true; resolve(v); } };

      child.stdout.on("data", (d) => {
        const m = d.toString().trim();
        if (m) { logs.push(m); mainWindow.webContents.send("bot-log", prefix + m); }
      });

      child.stderr.on("data", (d) => {
        const m = d.toString().trim();
        if (!m) return;
        if (m.includes("CHROME_NOT_FOUND")) {
          mainWindow.webContents.send("bot-log", prefix + "❌ Google Chrome غير مثبت على جهازك.");
          mainWindow.webContents.send("bot-log", prefix + "👉 حمّل Chrome من: https://www.google.com/chrome");
          mainWindow.webContents.send("bot-log", prefix + "✅ بعد التثبيت افتح البرنامج من جديد.");
        } else {
          mainWindow.webContents.send("bot-log", prefix + "ERR: " + m);
        }
      });

      child.on("message", (msg) => {
        const accountId    = acc.id;
        const accountEmail = acc.easyEmail || "";
        const accountLabel = accountDisplayName(acc, accountEmail || ("Account " + (idx + 1)));

        if (msg.type === "result") {
          const data = msg.data || {};
          if (data.failedOrders?.buffer && data.failedOrders.buffer.length > 0) {
            const email = acc.easyEmail || acc.label || ("account-" + (idx + 1));
            const { dir, filePath } = saveFailedOrdersFile(email, data.failedOrders.buffer);
            data.failedOrders.failedDir  = dir;
            data.failedOrders.failedPath = filePath;
          }
          safeResolve({ success: true, data, ...finishTiming(), accountId, accountEmail, accountLabel });
        }
        if (msg.type === "error") safeResolve({ success: false, error: msg.error, ...finishTiming(), accountId, accountEmail, accountLabel });

        if (msg.type === "export-timestamp") {
          lastExportTimestamp = msg.timestamp;
          accountExportTimestamps[idx] = msg.timestamp;
        }
        const tagged = { ...msg, accountId, accountEmail, accountLabel, accountIdx: idx, totalAccounts: accountsToRun.length };
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
        safeResolve({
          success: false,
          error: `${prefix}${err.message}`,
          logs,
          ...finishTiming(),
          accountId:    acc.id,
          accountEmail: acc.easyEmail || "",
          accountLabel: accountDisplayName(acc, "Account " + (idx + 1)),
        });
      });

      child.on("exit", (code) => {
        safeResolve({
          success: code === 0,
          error: code !== 0 ? `${prefix}exited with code ${code}` : null,
          logs,
          ...finishTiming(),
          accountId:    acc.id,
          accountEmail: acc.easyEmail || "",
          accountLabel: accountDisplayName(acc, "Account " + (idx + 1)),
        });
      });
    });
  }

  botChildren = [];

  const INTER_ACCOUNT_COOLDOWN_MS = 6 * 60 * 1000; // Launch the next account 6 minutes after the previous account starts

  async function waitForExportCooldown(previousAccountIndex, nextAccountIndex, previousResultPromise) {
    const previousLabel = accountDisplayName(accountsToRun[previousAccountIndex], `Account ${previousAccountIndex + 1}`);
    const label = `Account ${nextAccountIndex + 1}`;
    const launchTimestamp = accountExportTimestamps[previousAccountIndex];

    if (launchTimestamp) {
      let remainingMs = Math.max(0, INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - launchTimestamp));
      if (remainingMs > 0) {
        let remainingSec = Math.ceil(remainingMs / 1000);
        mainWindow.webContents.send("bot-log",
          `\n⏸️  [Account schedule] Waiting ${Math.floor(remainingSec / 60)} min ${remainingSec % 60}s before starting ${label} after ${previousLabel}...`);

        while (remainingMs > 0 && botRunning) {
          const elapsed = Date.now() - launchTimestamp;
          if (elapsed >= INTER_ACCOUNT_COOLDOWN_MS) break;
          const waitTime = Math.min(1000, INTER_ACCOUNT_COOLDOWN_MS - elapsed);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          remainingMs = INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - launchTimestamp);

          if (!botRunning) break;
          const remSec = Math.max(0, Math.ceil(remainingMs / 1000));
          mainWindow.webContents.send("bot-log",
            `⏸️  [Account schedule] Waiting ${Math.floor(remSec / 60)} min ${remSec % 60}s before starting ${label}...`);
        }
      }
      return;
    }

    mainWindow.webContents.send("bot-log",
      `\n⏳  [${label}] في انتظار تصدير الحساب السابق قبل بدء العد التنازلي...`);

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
          `\n⏸️  [تجنب حد التصدير] ${previousLabel} فشل قبل التصدير بسبب الشبكة — الانتظار ${Math.floor(remainingSec / 60)} دقيقة و ${remainingSec % 60} ثانية قبل بدء ${label}...`);

        while (remainingMs > 0 && botRunning) {
          const tick = Math.min(1000, remainingMs);
          await new Promise(resolve => setTimeout(resolve, tick));
          remainingMs -= tick;
          if (!botRunning) break;
          const remSec = Math.ceil(remainingMs / 1000);
          mainWindow.webContents.send("bot-log",
            `⏸️  [تجنب حد التصدير] الانتظار لمدة ${Math.floor(remSec / 60)} دقيقة و ${remSec % 60} ثانية قبل بدء ${label}...`);
        }
        return;
      }

      mainWindow.webContents.send("bot-log",
        `\n[${label}] ${previousLabel} انتهى قبل التصدير؛ بدء الحساب التالي بدون انتظار تصدير.`);
      return;
    }

    let remainingMs = Math.max(0, INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - exportTimestamp));
    if (remainingMs > 0) {
      const remainingSec = Math.ceil(remainingMs / 1000);
      mainWindow.webContents.send("bot-log",
        `\n⏸️  [تجنب حد التصدير] الانتظار لمدة ${Math.floor(remainingSec / 60)} دقيقة و ${remainingSec % 60} ثانية قبل بدء ${label}...`);

      while (remainingMs > 0 && botRunning) {
        const currentElapsed = Date.now() - exportTimestamp;
        if (currentElapsed >= INTER_ACCOUNT_COOLDOWN_MS) break;
        const waitTime = Math.min(1000, INTER_ACCOUNT_COOLDOWN_MS - currentElapsed);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        remainingMs = INTER_ACCOUNT_COOLDOWN_MS - (Date.now() - exportTimestamp);
        if (!botRunning) break;

        const remSec = Math.ceil(remainingMs / 1000);
        mainWindow.webContents.send("bot-log",
          `⏸️  [تجنب حد التصدير] الانتظار لمدة ${Math.floor(remSec / 60)} دقيقة و ${remSec % 60} ثانية قبل بدء ${label}...`);
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
      `\n▶️  [${i + 1}/${accountsToRun.length}] بدء الحساب: ${label}`);

    accountExportTimestamps[i] = Date.now();

    const promise = runOneAccount(acc, i).then(result => {
      mainWindow.webContents.send("bot-log",
        `✅ [${i + 1}/${accountsToRun.length}] انتهى الحساب: ${label} — ${result.success ? "نجح" : "فشل"}`);
      return result;
    });
    resultPromises.push(promise);
  }

  const results = await Promise.all(resultPromises);

  botChildren = [];
  mainWindow.webContents.send("bot-run-complete");
  const allOk = results.every(r => r.success);
  return { success: allOk, multiAccount: true, results };
});
