"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const utils = require("./sentry.utils");

try {
  require("@sentry/electron/preload");
} catch (err) {
  console.warn("[Sentry] preload IPC setup failed:", err && err.message ? err.message : err);
}

let initialized = false;
let appMeta = {};

function initPreloadMonitoring(meta) {
  if (initialized) return null;
  initialized = true;
  appMeta = meta || {};
  return null;
}

function serializeError(errorLike) {
  const err = utils.normalizeError(errorLike);
  return {
    name: err.name || "Error",
    message: err.message || String(errorLike),
    stack: err.stack || "",
  };
}

function sendMonitoring(channel, payload) {
  try {
    ipcRenderer.send(channel, payload);
  } catch (_) {}
}

function capturePageException(errorLike, context) {
  sendMonitoring("taager-monitoring:capture-exception", {
    error: serializeError(errorLike),
    context: {
      process: "renderer",
      bridge: "page",
      ...utils.safeContext(context),
    },
  });
}

function capturePageMessage(message, level, context) {
  sendMonitoring("taager-monitoring:capture-message", {
    message: String(message),
    level: level || "info",
    context: {
      process: "renderer",
      bridge: "page",
      ...utils.safeContext(context),
    },
  });
}

function exposeMonitoringBridge() {
  contextBridge.exposeInMainWorld("monitoring", {
    captureException: (errorLike, context) => capturePageException(errorLike, context),
    captureMessage: (message, level, context) => capturePageMessage(message, level, context),
    addBreadcrumb: (breadcrumb) => sendMonitoring("taager-monitoring:add-breadcrumb", utils.safeContext(breadcrumb)),
    setUserContext: (user) => sendMonitoring("taager-monitoring:set-user", utils.safeContext(user)),
    setContext: (key, value) => sendMonitoring("taager-monitoring:set-context", { key: String(key), value: utils.safeContext(value) }),
    setTag: (key, value) => sendMonitoring("taager-monitoring:set-tag", { key: String(key), value: String(value) }),
    reportIpcFailure: (channel, errorLike, context) => capturePageException(errorLike, {
      operation: "ipc.invoke",
      channel,
      ...utils.safeContext(context),
    }),
    getMeta: () => ({ ...appMeta }),
  });
}

function monitoredInvoke(channel, ...args) {
  const start = Date.now();
  sendMonitoring("taager-monitoring:add-breadcrumb", {
    category: "ipc",
    message: channel,
    level: "info",
    data: { direction: "renderer-to-main" },
  });
  return ipcRenderer.invoke(channel, ...args).catch((err) => {
    capturePageException(err, {
      operation: "ipc.invoke",
      channel,
      durationMs: Date.now() - start,
      argCount: args.length,
    });
    throw err;
  });
}

module.exports = {
  capturePageException,
  exposeMonitoringBridge,
  initPreloadMonitoring,
  monitoredInvoke,
};
