"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("src/renderer/index.html");
const typography = read("src/renderer/styles/typography.css");
const dashboardAi = read("src/renderer/pages/dashboard/dashboard-ai.css");
const mainProcess = read("src/main/main.js");
const renderer = read("src/renderer/app.js");
const expectedZoom = "[75, 90, 100, 110, 125, 150]";

assert(index.includes('href="styles/typography.css"'), "typography stylesheet is not loaded");
assert(!/fonts\.googleapis|fonts\.gstatic/i.test(index), "renderer still depends on remote fonts");
assert(!/font-display:\s*block/i.test(typography), "font loading can hide text and cause visible flicker");
assert.strictEqual((typography.match(/font-display:\s*swap/gi) || []).length, 13, "every local font face must render without a block period");
assert(!/document\.fonts\.ready\s*\.then/i.test(index), "font faces must start loading together, not in sequential batches");
assert(!/rel="preload"[^>]+as="font"/i.test(index), "file-protocol font preloads cannot be reused by Electron CSS font requests");
assert(!/animation\s*:\s*tb-(?:rotate|tilt)[^;]*infinite/i.test(index), "native titlebar icons must not trigger continuous whole-window repaints");
assert(!/animation\s*:\s*spin-once/i.test(index), "Sync feedback must not animate inside the native draggable titlebar");
assert(!/animation\s*:\s*ai-orb-breathe[^;]*infinite/i.test(dashboardAi), "fixed dashboard AI controls must not trigger continuous viewport repaints");
assert(mainProcess.includes(`APP_ZOOM_LEVELS = ${expectedZoom}`), "main-process zoom levels changed");
assert(renderer.includes(`APP_ZOOM_LEVELS = ${expectedZoom}`), "renderer zoom levels changed");

for (const id of ["main-titlebar", "btn-zoom-out", "btn-zoom-reset", "btn-zoom-in"]) {
  assert(index.includes(`id="${id}"`), `protected visual selector #${id} is missing`);
}

for (const token of [
  "--font-latin",
  "--font-arabic",
  "--font-data",
  "--font-mono",
  "--type-body",
  "--type-label",
  "--focus-ring",
]) {
  assert(typography.includes(token), `visual token ${token} is missing`);
}

assert(!/^\s*\*/m.test(typography), "visual system contains a blanket universal override");
assert(!/\[style\]/.test(typography), "visual system contains a blanket inline-style override");

const fontFiles = [
  "inter-latin-400-normal.woff2",
  "inter-latin-500-normal.woff2",
  "inter-latin-600-normal.woff2",
  "inter-latin-700-normal.woff2",
  "inter-latin-800-normal.woff2",
  "ibm-plex-sans-arabic-arabic-400-normal.woff2",
  "ibm-plex-sans-arabic-arabic-500-normal.woff2",
  "ibm-plex-sans-arabic-arabic-600-normal.woff2",
  "ibm-plex-sans-arabic-arabic-700-normal.woff2",
  "dm-mono-latin-400-normal.woff2",
  "dm-mono-latin-500-normal.woff2",
  "syne-latin-700-normal.woff2",
  "syne-latin-800-normal.woff2",
];

for (const name of fontFiles) {
  const fontPath = path.join(root, "src", "renderer", "assets", "fonts", name);
  assert(fs.existsSync(fontPath), `local font asset is missing: ${name}`);
  assert.strictEqual(fs.readFileSync(fontPath, { encoding: "ascii", flag: "r" }).slice(0, 4), "wOF2", `${name} is not WOFF2`);
}

console.log("[Visual System] local fonts, tokens, protected zoom controls, and safety contracts verified");
