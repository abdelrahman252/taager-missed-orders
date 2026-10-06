"use strict";

const path = require("node:path");

function loadAutoUpdater(platform, loadNative = () => require("electron-updater").autoUpdater) {
  return platform === "darwin" ? null : loadNative();
}

function createUpdatePlatformRoutes({
  platform,
  macUpdater,
  autoUpdater,
  sendUpdateEvent = () => {},
  showItemInFolder = () => {},
  fileExists = () => false,
}) {
  const isMac = platform === "darwin";
  return {
    async checkForUpdates() {
      if (!isMac) {
        await autoUpdater.checkForUpdates();
        return { ok: true };
      }
      const result = await macUpdater.checkForUpdate();
      sendUpdateEvent(result.available ? "update-available" : "update-not-available", { version: result.version, platform: "darwin" });
      return { ok: true, ...result };
    },
    async downloadUpdate() {
      if (!isMac) {
        autoUpdater.downloadUpdate();
        return { ok: true };
      }
      const result = await macUpdater.download();
      if (result.cancelled) sendUpdateEvent("update-download-cancelled");
      else if (result.ok) sendUpdateEvent("update-downloaded");
      else if (result.error) sendUpdateEvent("update-error", { message: result.error });
      return result;
    },
    cancelDownload() {
      return isMac ? macUpdater.cancel() : false;
    },
    revealDownloadedUpdate() {
      if (!isMac) return null;
      const updatePath = macUpdater.getDownloadedPath();
      if (!updatePath || !fileExists(updatePath)) {
        return { ok: false, error: "The Mac update DMG is not available. Download it again and retry." };
      }
      showItemInFolder(updatePath);
      return { ok: true, manual: true, platform: "darwin", path: updatePath, fileName: path.basename(updatePath) };
    },
  };
}

module.exports = { createUpdatePlatformRoutes, loadAutoUpdater };
