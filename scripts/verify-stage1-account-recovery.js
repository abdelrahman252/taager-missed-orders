"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const setup = read("src/renderer/pages/setup.js");
const main = read("src/main/main.js");
const preload = read("src/main/preload.js");
const run = read("src/renderer/pages/run.js");
const runner = read("src/bot/runner.js");
const dashboardFetch = read("src/bot/dashboard-fetch.js");
const handshakePath = path.join(root, "src/bot/google-login-handshake.js");

assert(fs.existsSync(handshakePath), "Google login handshake module must exist");

assert(
  setup.includes('const usesEmail = method === "email" || method === "google";'),
  "Google login must show and require the Taager email field"
);
assert(
  setup.includes("const hasTaagerLoginIdentity = needsPhone ? !!nextTaagerPhone : !!nextTaagerEmail;"),
  "Google login must require Taager email identity"
);
assert(
  setup.includes('const needsPassword = taagerLoginMethod !== "google";'),
  "Google login must not require Taager password"
);
assert(
  setup.includes('const needsEasyOrdersCredentials = !isTeamLeaderMode || dashboardEnrichmentProvider === "easyorders";'),
  "Setup EasyOrders rule must depend on Team Leader mode and dashboard provider"
);

assert(
  main.includes('const needsEasyOrdersCredentials = !teamLeaderEnabled || a.dashboardEnrichmentProvider === "easyorders";'),
  "Main-process EasyOrders validation must match setup"
);
assert(
  main.includes('if (method === "phone" ? !(a.taagerPhone || "").trim() : !(a.taagerEmail || "").trim())'),
  "Main-process validation must require email for Google accounts"
);
assert(
  main.includes('if (method !== "google" && !taagerPassword)'),
  "Main-process validation must not require Taager password for Google"
);

for (const [name, source] of [["runner", runner], ["dashboard fetch", dashboardFetch]]) {
  assert(source.includes('require("./google-login-handshake")'), `${name} must load Google handshake`);
  assert(source.includes("tryAutomatedGooglePopupLogin(page, email, log)"), `${name} must try automated Google login first`);
  assert(source.includes("waitForManualGoogleLogin({"), `${name} must fall back to manual Google login`);
}
assert(runner.includes("page = activePage || page;"), "Full run must continue on the relaunched Google-login page");
assert(dashboardFetch.includes("page = await taagerLogin(page);"), "Dashboard refresh must continue on the relaunched Google-login page");

assert(preload.includes('completeGoogleLogin: (requestId) => monitoredInvoke("complete-google-login", requestId)'), "Preload must expose Google login completion");
assert(main.includes('ipcMain.handle("complete-google-login"'), "Main must register Google login completion IPC");
assert(main.includes('child.send({ type: "google-login-finished", requestId'), "Main must resume child after Google login");
assert(run.includes('id="btn-google-login-done"'), "Run UI must include Google login completion control");

console.log("Stage 1 account recovery verification passed.");
