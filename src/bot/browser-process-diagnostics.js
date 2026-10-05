"use strict";
const path = require("path");
const crypto = require("crypto");
const statesByPid = new Map();
const launching = new Set();
const closeReasonsByContext = new WeakMap();
let currentLaunch = null;
let installed = false;

function cleanToken(value, fallback, maxLength) {
  return String(value || fallback).replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, maxLength);
}
function browserProfileIdentity(profilePath) {
  const resolved = path.resolve(String(profilePath || ""));
  return crypto.createHash("sha256").update(process.platform === "win32" ? resolved.toLowerCase() : resolved).digest("hex").slice(0, 12);
}
function emit(state, pid, event) {
  try {
    if (typeof state.log !== "function") return;
    const reason = cleanToken(state.getCloseReason && state.getCloseReason(), "none", 48);
    const message = `[BrowserProcess] run=${state.runId} profile=${state.profileId} browser=${state.browser} pid=${pid || "unknown"} ${event} close=${reason}`;
    state.log(message);
    if (process.connected && typeof process.send === "function") {
      process.send({ type: "browser-process-diagnostic", message }, () => {});
    }
  } catch (_) { /* Diagnostics must never fail a browser operation. */ }
}
function onBrowserLog(message) {
  const value = String(message || "");
  if (value.startsWith("<launching> ")) {
    // Match profiles only in memory. Never emit command lines or browser output.
    const candidates = [...launching].filter((state) => value.includes(`--user-data-dir=${state.profilePath}`));
    currentLaunch = candidates.length === 1 ? candidates[0] : null;
    return;
  }
  const launched = /^<launched> pid=(\d+)$/.exec(value);
  if (launched) {
    if (currentLaunch) {
      statesByPid.set(launched[1], currentLaunch);
      emit(currentLaunch, launched[1], "event=launched");
    }
    currentLaunch = null;
    return;
  }
  const pidEvent = /^\[pid=(\d+)\]\s+(.+)$/.exec(value);
  if (!pidEvent) return;
  const state = statesByPid.get(pidEvent[1]);
  if (!state) return;
  const exit = /^<process did exit: exitCode=(-?\d+|null), signal=([\w-]+|null)>$/.exec(pidEvent[2]);
  if (exit) {
    emit(state, pidEvent[1], `event=exited exitCode=${exit[1]} signal=${exit[2]}`);
    statesByPid.delete(pidEvent[1]);
    return;
  }
  const close = /^<(gracefully close start|gracefully close end|forcefully close|kill|will force kill)>$/.exec(pidEvent[2]);
  if (close) emit(state, pidEvent[1], `event=${close[1].replace(/ /g, "-")}`);
}
function installCapture() {
  if (installed) return true;
  try {
    // Hook the locked Playwright logger before formatting, without enabling DEBUG.
    const logger = require("playwright-core/lib/utils").debugLogger;
    if (!logger || typeof logger.log !== "function") return false;
    const original = logger.log;
    logger.log = function (name, message, ...args) {
      if (name === "browser") {
        try { onBrowserLog(message); } catch (_) {}
        return;
      }
      return original.call(this, name, message, ...args);
    };
    installed = true;
    return true;
  } catch (_) { return false; }
}
function beginBrowserProcessDiagnostics(options = {}) {
  const state = {
    runId: cleanToken(options.runId, "unknown", 40),
    profileId: browserProfileIdentity(options.profilePath),
    profilePath: path.resolve(String(options.profilePath || "")),
    browser: cleanToken(options.browser, "automation", 24),
    log: options.log,
    getCloseReason: options.getCloseReason,
  };
  if (!installCapture()) emit(state, null, "event=capture-unavailable");
  else launching.add(state);
  const finishLaunch = () => {
    launching.delete(state);
    if (currentLaunch === state) currentLaunch = null;
  };
  return { launchFailed: finishLaunch, launchComplete: finishLaunch };
}
function registerBrowserProcessContext(context, closeReasonRef) {
  if (context) closeReasonsByContext.set(context, closeReasonRef);
}
function setBrowserProcessContextCloseReason(context, reason) {
  const ref = context && closeReasonsByContext.get(context);
  if (ref) ref.value = String(reason || "unspecified");
}
module.exports = { beginBrowserProcessDiagnostics, registerBrowserProcessContext, setBrowserProcessContextCloseReason, browserProfileIdentity };
