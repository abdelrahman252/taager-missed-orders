// operations-utils.js — shared helpers for the Operations page
// Plain globals — no import/export (Electron renderer)

window._opsLive = window._opsLive || {
  isRunning: false, startTime: null, submitted: 0, failed: 0,
  total: 0, currentAccount: "", currentAccountIdx: 0, totalAccounts: 1,
  currentOrder: null, activityFeed: [], progressPct: 0,
};

function _opsEmitLiveUpdate() {
  window.dispatchEvent(new CustomEvent("taager-ops-live-updated"));
}

function _opsStartLiveRun() {
  window._opsLive.isRunning = true;
  window._opsLive.startTime = Date.now();
  window._opsLive.submitted = 0;
  window._opsLive.failed = 0;
  window._opsLive.total = 0;
  window._opsLive.currentAccount = "";
  window._opsLive.currentAccountIdx = 0;
  window._opsLive.totalAccounts = 1;
  window._opsLive.currentOrder = null;
  window._opsLive.progressPct = 0;
  window._opsLive.activityFeed = [];
  _opsEmitLiveUpdate();
}

function _opsGlobalPushFeed(text, type) {
  if (!text) return;
  const feed = window._opsLive.activityFeed;
  feed.unshift({
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    text,
    type: type || "info",
  });
  if (feed.length > 100) feed.length = 100;
}

function _opsApplyOrderProgress(msg) {
  if (!msg) return;
  const live = window._opsLive;
  live.isRunning         = true;
  live.submitted         = msg.success         ?? live.submitted;
  live.failed            = msg.failed          ?? live.failed;
  live.total             = msg.total           ?? live.total;
  live.currentAccount    = msg.accountEmail || msg.accountLabel || live.currentAccount;
  live.currentAccountIdx = msg.accountIdx      ?? live.currentAccountIdx;
  live.totalAccounts     = msg.totalAccounts   ?? live.totalAccounts;
  live.progressPct       = live.total > 0 ? Math.round(((msg.current || 0) / live.total) * 100) : 0;
  if (!live.startTime) live.startTime = Date.now();

  if (msg.lastOrder) {
    live.currentOrder = msg.lastOrder;
    const isErr = !!msg.lastOrder.error;
    const orderName = msg.lastOrder.name || "-";
    const error = msg.lastOrder.error || "";
    const text = window.t_ops
      ? (isErr
          ? window.t_ops("liveMonitor.feed.orderFailed", { order: orderName, error })
          : window.t_ops("liveMonitor.feed.orderSubmitted", { order: orderName }))
      : (isErr ? `Order failed: ${orderName} ${error}` : `Order submitted: ${orderName}`);
    _opsGlobalPushFeed(text, isErr ? "error" : "success");
  }
}

function _opsApplyBotLog(msg) {
  const cleanMsg = String(msg || "").trim();
  if (!cleanMsg) return;
  const live = window._opsLive;
  live.isRunning = true;
  if (!live.startTime) live.startTime = Date.now();

  let type = "info";
  const lower = cleanMsg.toLowerCase();
  if (cleanMsg.includes("❌") || lower.includes("failed") || lower.includes("error")) {
    type = "error";
  } else if (cleanMsg.includes("✅") || lower.includes("success") || lower.includes("completed")) {
    type = "success";
  } else if (cleanMsg.includes("⚠") || cleanMsg.includes("⏳") || lower.includes("warning") || lower.includes("cooldown")) {
    type = "warn";
  }

  _opsGlobalPushFeed(cleanMsg, type);
}

function _opsEnsureLiveBindings() {
  if (window._opsLiveGlobalBound) return;
  window._opsLiveGlobalBound = true;

  window.api?.onOrderProgress?.((msg) => {
    _opsApplyOrderProgress(msg);
    _opsEmitLiveUpdate();
  });

  window.api?.onBotLog?.((msg) => {
    _opsApplyBotLog(msg);
    _opsEmitLiveUpdate();
  });

  window.api?.on?.("bot-run-complete", () => {
    window._opsLive.isRunning = false;
    const text = window.t_ops ? window.t_ops("liveMonitor.feed.runCompleted") : "Run completed";
    _opsGlobalPushFeed(text, "success");
    _opsEmitLiveUpdate();
  });
}

// Use electron store via IPC instead of localStorage
async function _opsGetPresets() {
  try {
    const s = await window.api.getAnalyticsSettings();
    return JSON.parse(s?.savedPresets || "[]");
  } catch { return []; }
}
async function _opsSavePresets(p) {
  try { await window.api.saveAnalyticsSettings({ savedPresets: JSON.stringify(p) }); } catch {}
}
async function _opsGetSettings() {
  try { return (await window.api.getAnalyticsSettings()) || {}; } catch { return {}; }
}
async function _opsSaveSettings(s) {
  try { await window.api.saveAnalyticsSettings(s); } catch {}
}

function _opsFmtSAR(n) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " SAR";
}
function _opsFmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function _opsFmtTimeShort(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function _opsFmtRelative(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1) return window.t_ops('utils.time.justNow'); 
  if (m < 60) return window.t_ops('utils.time.mAgo', { m });
  const h = Math.floor(m / 60); 
  if (h < 24) return window.t_ops('utils.time.hAgo', { h }); 
  return window.t_ops('utils.time.dAgo', { d: Math.floor(h / 24) });
}
function _opsFmtElapsed(ms) {
  if (!ms || ms < 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(v => String(v).padStart(2, "0")).join(":");
}
function _opsShortEmail(e) {
  if (!e || e === "__single__") return "—";
  return e.length > 26 ? e.slice(0, 24) + "…" : e;
}
function _opsAccountKey(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.accountId || item.accountEmail || "";
}
function _opsAccountDisplay(item) {
  if (!item) return "-";
  if (typeof item === "string") return item === "__single__" ? "-" : item;
  return item.accountLabel || item.accountEmail || item.accountId || "-";
}
function _opsAccountEmail(item) {
  if (!item || typeof item === "string") return "";
  return item.accountEmail || "";
}
function _opsAccountMatches(item, key) {
  if (!key) return true;
  return item && (item.accountId === key || item.accountEmail === key || _opsAccountKey(item) === key);
}
function _opsFlattenRuns(runs) {
  return (runs || []).flatMap(r => (r.orders || []).map(o => ({
    ...o, accountEmail: r.accountEmail || "", accountId: r.accountId || "",
    accountLabel: r.accountLabel || r.accountEmail || "", runId: r.runId || "", runTimestamp: r.runTimestamp || 0,
  })));
}
function _opsGroupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key] || "";
    if (!map[k]) map[k] = { key: k, items: [], count: 0, total: 0 };
    map[k].items.push(item); map[k].count++; map[k].total += Number(item.subtotal || 0);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// Taager dashboard/status/NDR migration: Operations uses the same Taager
// Arabic status map as Analytics and Dashboard for delivered/failed rates.
function _opsStatusBucket(orderOrStatus) {
  const status = orderOrStatus && typeof orderOrStatus === "object"
    ? orderOrStatus.orderStatus
    : orderOrStatus;
  if (window.TaagerStatus) return window.TaagerStatus.normalize(status).bucket;
  return String(status || "").toLowerCase();
}
function _opsIsDelivered(orderOrStatus) {
  const status = orderOrStatus && typeof orderOrStatus === "object"
    ? orderOrStatus.orderStatus
    : orderOrStatus;
  return window.TaagerStatus ? window.TaagerStatus.isDelivered(status) : _opsStatusBucket(status) === "delivered";
}
function _opsIsFailed(orderOrStatus) {
  const bucket = _opsStatusBucket(orderOrStatus);
  return bucket === "failed" || bucket === "return_verified" || bucket === "customer_refused_confirmation";
}
function _opsIsNdrEligible(orderOrStatus) {
  const status = orderOrStatus && typeof orderOrStatus === "object"
    ? orderOrStatus.orderStatus
    : orderOrStatus;
  return window.TaagerStatus ? window.TaagerStatus.isEligibleForNdr(status) : _opsStatusBucket(status) !== "canceled_by_you";
}
function _opsUniqueAccounts(runs) {
    const seen = new Set(), out = [];
    for (const r of (runs || [])) {
      const k = _opsAccountKey(r);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, label: _opsAccountDisplay(r), email: _opsAccountEmail(r), country: accountCountry(r) });
    }
    return out;
  }
function _opsApplyPresetFilter(orders, preset) {
  if (!preset) return orders;
  return orders.filter(o => {
    if (preset.status?.length && !preset.status.includes(o.orderStatus)) return false;
    if (preset.city?.length   && !preset.city.includes(o.city))          return false;
    if (preset.source         && o.source !== preset.source)              return false;
    if (preset.account        && !_opsAccountMatches(o, preset.account))  return false;
    if (preset.minAmount != null && (o.amountDue || 0) < preset.minAmount) return false;
    if (preset.maxAmount != null && (o.amountDue || 0) > preset.maxAmount) return false;
    return true;
  });
}
function _opsStatusColor(status) {
  // Taager dashboard/status/NDR migration:
  // Operations status badges use the same Taager Arabic status mapping as analytics/dashboard.
  if (typeof getStatusColor === "function") return getStatusColor(status);
  const M = {
    "Pending":          { bg: "#2a2820", text: "#c9a84c" },
    "Confirmed":        { bg: "#0f2218", text: "#34c97a" },
    "Waiting":          { bg: "#1a2535", text: "#5bc4f5" },
    "Under processing": { bg: "#1a2535", text: "#4fa8e8" },
    "In shipping":      { bg: "#2a1f10", text: "#e8963a" },
    "Delivered":        { bg: "#0f2a1e", text: "#2dd98a" },
    "Failed":           { bg: "#2a1010", text: "#ff5c5c" },
    "Canceled":         { bg: "#1e1e1e", text: "#888780" },
    "missed":           { bg: "#1e1a35", text: "#9b8ff0" },
    "":                 { bg: "#1e1e1e", text: "#888780" },
  };
  return M[status] || M[""];
}
