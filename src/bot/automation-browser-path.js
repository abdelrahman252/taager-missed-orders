"use strict";

const fs = require("fs");
const path = require("path");

const PINNED_BROWSER_VERSION = "151.0.7922.34";

function pinnedAutomationBrowserPath(options = {}) {
  if ((options.platform || process.platform) !== "win32") return null;
  const localAppData = options.localAppData === undefined ? process.env.LOCALAPPDATA : options.localAppData;
  const resourcesPath = options.resourcesPath === undefined ? process.resourcesPath : options.resourcesPath;
  const projectRoot = options.projectRoot || path.resolve(__dirname, "../..");
  const candidates = [
    options.overridePath === undefined ? process.env.TAAGER_AUTOMATION_BROWSER_PATH : options.overridePath,
    resourcesPath && path.join(resourcesPath, "automation-browser", "chrome-win64", "chrome.exe"),
    path.join(projectRoot, "vendor", "automation-browser", "chrome-win64", "chrome.exe"),
    localAppData && path.join(localAppData, "ms-playwright", "chromium-1234", "chrome-win64", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

module.exports = { PINNED_BROWSER_VERSION, pinnedAutomationBrowserPath };
