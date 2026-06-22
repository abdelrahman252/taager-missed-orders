const { contextBridge, ipcRenderer } = require("electron");

function safeMonitoringContext(context) {
  if (!context || typeof context !== "object") return {};
  const copy = { ...context };
  ["password", "easyPassword", "taagerPassword", "token", "licenseKey", "key", "apikey"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(copy, key)) copy[key] = "[Filtered]";
  });
  return copy;
}

function serializeMonitoringError(errorLike) {
  if (errorLike && typeof errorLike === "object") {
    return {
      name: errorLike.name || "Error",
      message: errorLike.message || errorLike.reason || errorLike.error || JSON.stringify(errorLike),
      stack: errorLike.stack || "",
    };
  }
  return { name: "Error", message: String(errorLike == null ? "Unknown error" : errorLike), stack: "" };
}

function sendMonitoring(channel, payload) {
  try { ipcRenderer.send(channel, payload); } catch (_) {}
}

function capturePageException(errorLike, context) {
  sendMonitoring("taager-monitoring:capture-exception", {
    error: serializeMonitoringError(errorLike),
    context: {
      process: "renderer",
      bridge: "preload",
      ...safeMonitoringContext(context),
    },
  });
}

function capturePageMessage(message, level, context) {
  sendMonitoring("taager-monitoring:capture-message", {
    message: String(message),
    level: level || "info",
    context: {
      process: "renderer",
      bridge: "preload",
      ...safeMonitoringContext(context),
    },
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
    const message = err && err.message ? err.message : String(err);
    const mainAlreadyCaptured = message.includes("Error invoking remote method");
    if (!mainAlreadyCaptured) {
      capturePageException(err, {
        operation: "ipc.invoke",
        channel,
        durationMs: Date.now() - start,
        argCount: args.length,
      });
    }
    throw err;
  });
}

contextBridge.exposeInMainWorld("monitoring", {
  captureException: (errorLike, context) => capturePageException(errorLike, context),
  captureMessage: (message, level, context) => capturePageMessage(message, level, context),
  addBreadcrumb: (breadcrumb) => sendMonitoring("taager-monitoring:add-breadcrumb", safeMonitoringContext(breadcrumb)),
  setUserContext: (user) => sendMonitoring("taager-monitoring:set-user", safeMonitoringContext(user)),
  setContext: (key, value) => sendMonitoring("taager-monitoring:set-context", { key: String(key), value: safeMonitoringContext(value) }),
  setTag: (key, value) => sendMonitoring("taager-monitoring:set-tag", { key: String(key), value: String(value) }),
  reportIpcFailure: (channel, errorLike, context) => capturePageException(errorLike, {
    operation: "ipc.invoke",
    channel,
    ...safeMonitoringContext(context),
  }),
  getMeta: () => ({ appVersion: "1.0.5" }),
});

if (process.defaultApp || process.env.SENTRY_ENABLE_TESTS === "1") {
  contextBridge.exposeInMainWorld("monitoringTests", {
    rendererError: () => setTimeout(() => { throw new Error("SENTRY_TEST_RENDERER_ERROR"); }, 0),
    asyncRejection: () => Promise.reject(new Error("SENTRY_TEST_RENDERER_ASYNC_REJECTION")),
    mainError: () => monitoredInvoke("sentry-test-main-error"),
    mainAsyncRejection: () => monitoredInvoke("sentry-test-async-rejection"),
    reactRenderFailure: () => {
      const error = new Error("SENTRY_TEST_REACT_RENDER_FAILURE");
      capturePageException(error, { operation: "react.error-boundary.test" });
      throw error;
    },
  });
}

contextBridge.exposeInMainWorld("api", {
  // Window
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close:    () => ipcRenderer.send("window-close"),
  getAppZoom:      () => monitoredInvoke("get-app-zoom"),
  increaseAppZoom: () => ipcRenderer.send("increase-app-zoom"),
  decreaseAppZoom: () => ipcRenderer.send("decrease-app-zoom"),
  resetAppZoom:    () => ipcRenderer.send("reset-app-zoom"),
  onAppZoomChanged: (cb) => ipcRenderer.on("app-zoom-changed", (_, percent) => cb(percent)),

  // License
  checkLicense:        () => monitoredInvoke("check-license"),
  checkLicenseNocache: () => monitoredInvoke("check-license-nocache"),
  submitLicense:       (key) => monitoredInvoke("submit-license", key),
  getLicenseCredentialBackupStatus: () => monitoredInvoke("get-license-credential-backup-status"),
  getLicenseCredentialBackupPromptStatus: () => monitoredInvoke("get-license-credential-backup-prompt-status"),
  backupLicenseCredentialsNow: () => monitoredInvoke("backup-license-credentials-now"),
  restoreLicenseCredentials: () => monitoredInvoke("restore-license-credentials"),

  // Credentials
  getCredentials:      () => monitoredInvoke("get-credentials"),
  getStartupState:     () => monitoredInvoke("get-startup-state"),
  saveCredentials:     (creds) => monitoredInvoke("save-credentials", creds),
  saveAllAccounts:     (accounts) => monitoredInvoke("save-all-accounts", accounts),
  updateAccount:       (data) => monitoredInvoke("update-account", data),
  unlockSingleAccount: (data) => monitoredInvoke("unlock-single-account", data),
  relockAccount:       (data) => monitoredInvoke("relock-account", data),
  clearAllData:        () => monitoredInvoke("clear-all-data"),
  clearResetFlag:      () => monitoredInvoke("clear-reset-flag"),

  // Settings
  setAutoRun:         (val)  => monitoredInvoke("set-auto-run", val),
  setAutoRunInterval: (mins) => monitoredInvoke("set-auto-run-interval", mins),
  setAutoRunAccounts:  (ids)  => monitoredInvoke("set-auto-run-accounts", ids),
  setLaunchMinimized: (val)  => monitoredInvoke("set-launch-minimized", val),
  setAutoConfirm:     (val)  => monitoredInvoke("set-auto-confirm", val),
  getAutoRunProgress: ()     => monitoredInvoke("get-auto-run-progress"),
  killBot:            ()     => ipcRenderer.send("kill-bot"),
  openFolder:         (folder) => monitoredInvoke("open-folder", folder),
  getProfilePath:      ()     => monitoredInvoke("get-profile-path"),

  // Bot
  runBot:          (params) => monitoredInvoke("run-bot", params),
  completeGoogleLogin: (requestId) => monitoredInvoke("complete-google-login", requestId),
  botStarted:      () => ipcRenderer.send("bot-started"),
  botFinished:     () => ipcRenderer.send("bot-finished"),
  onBotLog:        (cb) => ipcRenderer.on("bot-log",           (_, msg)  => cb(msg)),
  on2faNeeded:     (cb) => ipcRenderer.on("bot-2fa-needed",    (_, data) => cb(data)),
  onNeedsConfirm:  (cb) => ipcRenderer.on("bot-needs-confirm", ()        => cb()),
  onPreview:       (cb) => ipcRenderer.on("bot-preview",       (_, data) => cb(data)),
  onOrderProgress: (cb) => ipcRenderer.on("bot-order-progress",(_, data) => cb(data)),
  onAutoRunTick:   (cb) => ipcRenderer.on("auto-run-tick",     (_, data) => cb(data)),
  onLicenseExpired:(cb) => ipcRenderer.on("license-expired",   ()        => cb()),
  onGoogleLoginNeeded:   (cb) => ipcRenderer.on("bot-google-login-needed",   (_, data) => cb(data)),
  onGoogleLoginComplete: (cb) => ipcRenderer.on("bot-google-login-complete", (_, data) => cb(data)),
  onDashboardLog:   (cb) => ipcRenderer.on("bot-dashboard-log",   (_, data) => cb(data)),
  onDashboardStage: (cb) => ipcRenderer.on("bot-dashboard-stage", (_, data) => cb(data)),
  on:              (ch, cb) => ipcRenderer.on(ch, (_, data) => cb(data)),
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),

  // Settings (theme + lang)
  getSettings:  () => monitoredInvoke("get-settings"),
  saveSettings: (s) => monitoredInvoke("save-settings", s),

  // Output
  saveOutputFile: (data) => monitoredInvoke("save-output-file", data),

  // Analytics
  saveRunAnalytics:      (payload) => monitoredInvoke("save-run-analytics",      payload),
  getAnalyticsRuns:      (filter)  => monitoredInvoke("get-analytics-runs",      filter),
  clearAnalyticsData:    ()        => monitoredInvoke("clear-analytics-data"),
  getAnalyticsSettings:  ()        => monitoredInvoke("get-analytics-settings"),
  saveAnalyticsSettings: (s)       => monitoredInvoke("save-analytics-settings", s),

  // Dashboard
  runDashboardFetch:     (params)          => monitoredInvoke("run-dashboard-fetch",     params),
  inspectStaticDashboardUpdate: (params)   => monitoredInvoke("inspect-static-dashboard-update", params),
  applyStaticDashboardUpdate:   (params)   => monitoredInvoke("apply-static-dashboard-update", params),
  saveDashboardSnapshot: (accountId, data) => monitoredInvoke("save-dashboard-snapshot", accountId, data),
  getDashboardSnapshot:  (accountId, knownRevision) => monitoredInvoke("get-dashboard-snapshot", accountId, knownRevision),
  getDashboardQueryFlags:( )                => monitoredInvoke("get-dashboard-query-flags"),
  queryDashboardData:    (payload)          => monitoredInvoke("query-dashboard-data", payload),
  exportDashboardOrdersQuery: (payload)     => monitoredInvoke("export-dashboard-orders-query", payload),
  getDashboardAutoTs:    (accountId)       => monitoredInvoke("get-dashboard-auto-ts",   accountId),
  setDashboardAutoTs:    (accountId, ts)   => monitoredInvoke("set-dashboard-auto-ts",   accountId, ts),
  clearDashboardData:    ()                => monitoredInvoke("clear-dashboard-data"),
  getDashboardEnabled:   ()                => monitoredInvoke("get-dashboard-enabled"),
  getMarketingStatus:    (accountId, platform, options) => monitoredInvoke("get-marketing-status", accountId, platform, options),
  connectMarketing:      (accountId, platform) => monitoredInvoke("connect-marketing-platform", accountId, platform),
  claimMarketingSourceAccount: (accountId, platform, sourceAccountId) => monitoredInvoke("claim-marketing-source-account", accountId, platform, sourceAccountId),
  releaseMarketingSourceAccount: (accountId, platform, sourceAccountId) => monitoredInvoke("release-marketing-source-account", accountId, platform, sourceAccountId),
  saveMarketingMapping:  (accountId, platform, sourceAccountIds) => monitoredInvoke("save-marketing-mapping", accountId, platform, sourceAccountIds),
  saveAllMarketingMappings: (platform, mappings) => monitoredInvoke("save-all-marketing-mappings", platform, mappings),
  syncMarketingData:     (accountId, platform, range) => monitoredInvoke("sync-marketing-data", accountId, platform, range),
  syncAllMarketingData:  (platform, range) => monitoredInvoke("sync-all-marketing-data", platform, range),
  openExternalUrl:       (url)             => monitoredInvoke("open-external-url", url),
  dashboardAiQuery:      (payload)         => monitoredInvoke("dashboard-ai-query", payload),
  onDashboardAiProgress: (requestId, cb)   => {
    const wanted = String(requestId || "");
    const handler = (_event, payload) => {
      if (!payload || String(payload.requestId || "") !== wanted) return;
      cb(payload);
    };
    ipcRenderer.on("dashboard-ai-progress", handler);
    return () => ipcRenderer.removeListener("dashboard-ai-progress", handler);
  },
  getDashboardAiMirror:  (mirrorKey)       => monitoredInvoke("get-dashboard-ai-mirror", mirrorKey),
  saveDashboardAiMirror: (payload)         => monitoredInvoke("save-dashboard-ai-mirror", payload),
  getAiAdminAnalytics:   ()                => monitoredInvoke("get-ai-admin-analytics"),
  debugGeminiPing:       ()                => monitoredInvoke("debug-gemini-ping"),
  getAiAssistantMemory:  ()                => monitoredInvoke("get-ai-assistant-memory"),
  saveAiAssistantMemory: (delta)           => monitoredInvoke("save-ai-assistant-memory", delta),
  clearAiAssistantMemory:(scope)           => monitoredInvoke("clear-ai-assistant-memory", scope),

  // Auto-updater
  getAppVersion:        ()    => monitoredInvoke("get-app-version"),
  checkForUpdates:      ()    => monitoredInvoke("check-for-updates"),
  downloadUpdate:       ()    => monitoredInvoke("download-update"),
  installUpdate:        ()    => monitoredInvoke("install-update"),
  onUpdateAvailable:    (cb) => ipcRenderer.on("update-available",     (_e, info) => cb(info)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on("update-not-available", ()         => cb()),
  onUpdateProgress:     (cb) => ipcRenderer.on("update-progress",      (_e, p)    => cb(p)),
  onUpdateDownloaded:   (cb) => ipcRenderer.on("update-downloaded",    ()         => cb()),
  onUpdateError:        (cb) => ipcRenderer.on("update-error",         (_e, err)  => cb(err)),
});
