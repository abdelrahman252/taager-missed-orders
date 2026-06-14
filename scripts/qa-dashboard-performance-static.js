"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let pass = 0;
let fail = 0;

function ok(label, condition) {
  if (condition) {
    pass += 1;
    console.log("  ✓ " + label);
  } else {
    fail += 1;
    console.error("  ✗ " + label);
  }
}

console.log("\n[Dashboard Performance Static QA]");

const shell = read("src/renderer/pages/dashboard/dashboard-shell.js");
ok("section preloader is rendered by the shell", shell.includes("dash-section-preloader"));
ok("section rendering is deferred to the next paint", shell.includes("scheduleSectionRender") && shell.includes("requestAnimationFrame"));
ok("same section/data render is cached", shell.includes("_dashboardRenderKey") && shell.includes("getDataVersion"));
ok("loading state preserves the preloader until data arrives",
  /if \(!data \|\| !data\._loaded \|\| data\._loading\) \{\s*showSectionLoader\(pane, sectionId\);\s*return;/.test(shell));

const dashboard = read("src/renderer/pages/dashboard/dashboard.js");
ok("dashboard data carries a render version", dashboard.includes("dashVersion") && dashboard.includes("dashData._version"));

const shared = read("src/renderer/pages/dashboard/dashboard-shared.js");
ok("number animation duration is capped", shared.includes("Math.min(opts.duration || 520, 700)"));
ok("number animation respects reduced motion", shared.includes("prefers-reduced-motion: reduce"));
ok("number animation stops when the element is removed", shared.includes("!document.body.contains(el)"));

const styles = read("src/renderer/pages/dashboard/dashboard-styles.css");
ok("preloader skeleton styles exist", styles.includes(".dash-preloader-grid") && styles.includes("@keyframes dashSkeleton"));
ok("global dashboard transitions are fast", styles.includes("--dash-trans: 90ms ease"));
ok("reduced motion CSS safety exists", styles.includes("@media (prefers-reduced-motion: reduce)"));
ok("entrance animations are short", styles.includes(".fade-up { animation: fadeUp  0.22s ease-out both; }"));

const cities = read("src/renderer/pages/dashboard/sections/section-cities.js");
ok("cities visual debug block is disabled", /if \(false\) \{\s*\(function debugCitiesSection\(\)/.test(cities));
ok("cities payment updates no longer log on every row", !cities.includes("applyPaymentView called with payVal") && !cities.includes("Updated city:"));

const s6 = read("src/renderer/pages/dashboard/sections/section6-commission.js");
const s7 = read("src/renderer/pages/dashboard/sections/section7-calculator.js");
const s8 = read("src/renderer/pages/dashboard/sections/section8-master.js");
ok("Chart.js dashboard animations are short", [s6, s7, s8].every((src) => src.includes("animation: { duration: 260") || src.includes("animation: { duration: 220")));

console.log("\nResults: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
