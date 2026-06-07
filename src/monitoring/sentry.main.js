"use strict";

const { app, ipcMain } = require("electron");
const Sentry = require("@sentry/electron/main");
const log = require("electron-log");
const { IPC_NAMESPACE, getCommonOptions, getRuntimeContext } = require("./sentry.shared");
const { addBreadcrumb, captureException, captureMessage, normalizeError, setUserContext } = require("./sentry.utils");

let initialized = false;
let ipcPatched = false;
let rendererBridgeRegistered = false;

function initMainMonitoring() {
  if (initialized) return Sentry;
  initialized = true;

  const appVersion = app.getVersion ? app.getVersion() : "0.0.0";
  const options = {
    ...getCommonOptions(appVersion, app.isPackaged),
    ipcNamespace: IPC_NAMESPACE,
    enableRendererAnrDetection: true,
    enableMainProcessSessionTracking: true,
    enableRendererProcessSessionTracking: true,
    initialScope: {
      tags: {
        process: "main",
        app: "taager-orders",
      },
      contexts: {
        runtime: getRuntimeContext(appVersion),
      },
    },
  };

  try {
    Sentry.init(options);
    addBreadcrumb(Sentry, {
      category: "app.lifecycle",
      message: "main monitoring initialized",
      level: "info",
      data: { enabled: options.enabled, release: options.release, environment: options.environment },
    });
  } catch (err) {
    log.warn("[Sentry] Main init failed:", err && err.message ? err.message : err);
  }

  app.on("render-process-gone", (_event, webContents, details) => {
    captureMessage(Sentry, "Renderer process gone", "fatal", {
      tags: { failure_type: "renderer-process-gone" },
      extra: { details, url: webContents && !webContents.isDestroyed() ? webContents.getURL() : "" },
    });
  });

  app.on("child-process-gone", (_event, details) => {
    captureMessage(Sentry, "Electron child process gone", "fatal", {
      tags: { failure_type: "child-process-gone" },
      extra: { details },
    });
  });

  return Sentry;
}

function patchIpcMonitoring() {
  if (ipcPatched) return;
  ipcPatched = true;

  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = function monitoredHandle(channel, listener) {
    return originalHandle(channel, async function monitoredIpcHandler(event, ...args) {
      const start = Date.now();
      addBreadcrumb(Sentry, {
        category: "ipc",
        message: channel,
        level: "info",
        data: {
          direction: "renderer-to-main",
          senderUrl: event && event.senderFrame ? event.senderFrame.url : "",
        },
      });
      try {
        return await listener(event, ...args);
      } catch (err) {
        captureException(Sentry, err, {
          operation: "ipc.handle",
          channel,
          durationMs: Date.now() - start,
          extra: { argCount: args.length },
        });
        throw err;
      }
    });
  };

  const originalOn = ipcMain.on.bind(ipcMain);
  ipcMain.on = function monitoredOn(channel, listener) {
    return originalOn(channel, function monitoredIpcEvent(event, ...args) {
      addBreadcrumb(Sentry, {
        category: "ipc",
        message: channel,
        level: "info",
        data: { direction: "renderer-to-main-event", argCount: args.length },
      });
      try {
        return listener(event, ...args);
      } catch (err) {
        captureException(Sentry, err, { operation: "ipc.on", channel });
        throw err;
      }
    });
  };
}

function registerRendererMonitoringBridge() {
  if (rendererBridgeRegistered) return;
  rendererBridgeRegistered = true;

  ipcMain.on("taager-monitoring:capture-exception", (_event, payload) => {
    const errorPayload = payload && payload.error ? payload.error : payload;
    const error = normalizeError(errorPayload);
    if (errorPayload && errorPayload.stack) error.stack = errorPayload.stack;
    captureException(Sentry, error, payload && payload.context);
  });

  ipcMain.on("taager-monitoring:capture-message", (_event, payload) => {
    captureMessage(Sentry, payload && payload.message, payload && payload.level, payload && payload.context);
  });

  ipcMain.on("taager-monitoring:add-breadcrumb", (_event, breadcrumb) => {
    addBreadcrumb(Sentry, breadcrumb || {});
  });

  ipcMain.on("taager-monitoring:set-user", (_event, user) => {
    setUserContext(Sentry, user || null);
  });

  ipcMain.on("taager-monitoring:set-context", (_event, payload) => {
    if (payload && payload.key && typeof Sentry.setContext === "function") {
      Sentry.setContext(payload.key, payload.value || {});
    }
  });

  ipcMain.on("taager-monitoring:set-tag", (_event, payload) => {
    if (payload && payload.key && typeof Sentry.setTag === "function") {
      Sentry.setTag(payload.key, payload.value);
    }
  });
}

function monitorWindow(win, name) {
  if (!win || !win.webContents) return;
  const windowName = name || "main";
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    captureMessage(Sentry, "Renderer did-fail-load", "error", {
      tags: { window: windowName },
      extra: { errorCode, errorDescription, validatedURL },
    });
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      addBreadcrumb(Sentry, {
        category: "renderer.console",
        message,
        level: level >= 3 ? "error" : "warning",
        data: { window: windowName, line, sourceId },
      });
    }
  });
  win.on("unresponsive", () => {
    captureMessage(Sentry, "BrowserWindow became unresponsive", "warning", { tags: { window: windowName } });
  });
  win.on("responsive", () => {
    addBreadcrumb(Sentry, { category: "window", message: "BrowserWindow responsive", level: "info", data: { window: windowName } });
  });
  win.on("closed", () => {
    addBreadcrumb(Sentry, { category: "window", message: "BrowserWindow closed", level: "info", data: { window: windowName } });
  });
}

function flushMainMonitoring(timeoutMs) {
  if (Sentry && typeof Sentry.flush === "function") {
    return Sentry.flush(timeoutMs || 2000).catch(() => false);
  }
  return Promise.resolve(false);
}

module.exports = {
  Sentry,
  addBreadcrumb: (breadcrumb) => addBreadcrumb(Sentry, breadcrumb),
  captureException: (error, context) => captureException(Sentry, error, context),
  captureMessage: (message, level, context) => captureMessage(Sentry, message, level, context),
  flushMainMonitoring,
  initMainMonitoring,
  monitorWindow,
  patchIpcMonitoring,
  registerRendererMonitoringBridge,
  setUserContext: (user) => setUserContext(Sentry, user),
};
