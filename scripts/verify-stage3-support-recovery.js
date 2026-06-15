"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const support = read("src/renderer/support.js");
const index = read("src/renderer/index.html");
const app = read("src/renderer/app.js");
const supportSurfaces = [
  "src/renderer/pages/license.js",
  "src/renderer/pages/license-expiry-warning.js",
  "src/renderer/pages/expired-overlay.js",
  "src/renderer/pages/premium-preview.js",
].map(read);

assert(support.includes('SUPPORT_PHONE_E164 = "201129965148"'), "Support helper must use the approved WhatsApp number");
assert(support.includes('"https://wa.me/" + SUPPORT_PHONE_E164'), "Support helper must build a WhatsApp URL");
assert(support.includes("window.api.openExternalUrl(supportUrl())"), "Support helper must open WhatsApp through the preload API");

const supportScriptIndex = index.indexOf('<script src="support.js"></script>');
const licenseScriptIndex = index.indexOf('<script src="pages/license.js"></script>');
assert(supportScriptIndex !== -1, "Support helper script must be included");
assert(supportScriptIndex < licenseScriptIndex, "Support helper must load before support-button pages");

for (const surface of supportSurfaces) {
  assert(surface.includes("window.TaagerSupport"), "Every support surface must use the shared helper");
  assert(!surface.includes("https://taager.com/"), "Support surfaces must not use the old Taager homepage link");
}

assert(app.includes('id="${pageId}-support-btn"'), "Feature-locked pages must expose a support button");
assert(app.includes("window.TaagerSupport"), "Feature-locked support button must use the shared helper");

assert(!fs.existsSync(path.join(root, "src/shared/country-geo-core.js")), "Support-only Stage 3 must not restore country-geo-core.js");
assert(!index.includes("country-geo-core.js"), "Support-only Stage 3 must not load country-geo-core.js");

console.log("Stage 3 support-only recovery verification passed.");
