"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const main = read("src/main/main.js");
const preload = read("src/main/preload.js");
const app = read("src/renderer/app.js");
const index = read("src/renderer/index.html");

for (const marker of [
  'ipcMain.handle("get-app-zoom"',
  'ipcMain.on("increase-app-zoom"',
  'ipcMain.on("decrease-app-zoom"',
  'ipcMain.on("reset-app-zoom"',
  "installAppZoomControls(mainWindow)",
]) {
  assert(main.includes(marker), `Main zoom marker missing: ${marker}`);
}

for (const marker of ["getAppZoom", "increaseAppZoom", "decreaseAppZoom", "resetAppZoom", "onAppZoomChanged"]) {
  assert(preload.includes(marker), `Preload zoom API missing: ${marker}`);
}

for (const id of ["btn-zoom-out", "btn-zoom-reset", "btn-zoom-in"]) {
  assert(index.includes(`id="${id}"`), `Titlebar zoom control missing: ${id}`);
}
assert(index.includes(".tb-zoom-control"), "Zoom control styling must exist");
assert(app.includes("updateAppZoomDisplay"), "Renderer must update the zoom display");

const adminRefresh = (app.match(/async function adminRefresh\(\) \{[\s\S]*?\n\}/) || [""])[0];
assert(adminRefresh.includes("window.api.checkLicenseNocache()"), "Top Sync must keep the no-cache license refresh path");
assert(adminRefresh.includes("await window.api.getCredentials()"), "Top Sync must refresh credentials");
assert(app.includes('addEventListener("click", adminRefresh)'), "Top Sync must remain wired to adminRefresh");
assert(!adminRefresh.includes("window.location.reload()"), "Top Sync must not be replaced by app reload");

console.log("Stage 2 zoom and Sync recovery verification passed.");
