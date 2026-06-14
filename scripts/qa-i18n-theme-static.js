"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ALLOWED_AR_LATIN_TERMS = /\b(?:SKU|COD|NDR|CPA|ROI|ROAS|SAR|USD|EGP|KPI|TikTok|Snapchat|Facebook|Windsor|Easy-Orders|Taager|Whaat)\b/gi;

let pass = 0;
let fail = 0;

function ok(label, condition, details) {
  if (condition) {
    pass += 1;
    console.log("  PASS " + label);
  } else {
    fail += 1;
    console.error("  FAIL " + label + (details ? "\n    " + details : ""));
  }
}

function walkKeys(obj, prefix = "") {
  const keys = [];
  Object.entries(obj || {}).forEach(([key, value]) => {
    const next = prefix ? prefix + "." + key : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...walkKeys(value, next));
    } else {
      keys.push(next);
    }
  });
  return keys;
}

function loadLocales() {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  [
    "src/renderer/pages/dashboard/locales/en/dashboard-locale.js",
    "src/renderer/pages/dashboard/locales/ar/dashboard-locale.js",
    "src/renderer/locales/en/analytics.js",
    "src/renderer/locales/ar/analytics.js",
    "src/renderer/locales/en/operations.js",
    "src/renderer/locales/ar/operations.js",
  ].forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return context.window;
}

function visibleText(value) {
  return String(value || "")
    .replace(/\{\w+\}/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/#[a-z0-9_-]+/gi, "")
    .replace(ALLOWED_AR_LATIN_TERMS, "");
}

function visibleLatinLeaks(obj, prefix = "") {
  const leaks = [];
  Object.entries(obj || {}).forEach(([key, value]) => {
    const next = prefix ? prefix + "." + key : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      leaks.push(...visibleLatinLeaks(value, next));
    } else if (typeof value === "string" && /[A-Za-z]{2,}/.test(visibleText(value))) {
      leaks.push(next + " => " + value);
    }
  });
  return leaks;
}

console.log("\n[I18N + Theme Static QA]");

const win = loadLocales();
const dashboardEn = win.TAAGER_DASHBOARD_LOCALES.en.strings;
const dashboardAr = win.TAAGER_DASHBOARD_LOCALES.ar.strings;
const missingAr = Object.keys(dashboardEn).filter((key) => !(key in dashboardAr));
const missingEn = Object.keys(dashboardAr).filter((key) => !(key in dashboardEn));
ok("dashboard locale keys are complete in Arabic", missingAr.length === 0, missingAr.join(", "));
ok("dashboard locale keys are complete in English", missingEn.length === 0, missingEn.join(", "));

["analytics", "operations"].forEach((namespace) => {
  const enKeys = walkKeys(win.TAAGER_LOCALES.en[namespace]);
  const arKeys = walkKeys(win.TAAGER_LOCALES.ar[namespace]);
  const nsMissingAr = enKeys.filter((key) => !arKeys.includes(key));
  const nsMissingEn = arKeys.filter((key) => !enKeys.includes(key));
  ok(namespace + " locale keys are complete in Arabic", nsMissingAr.length === 0, nsMissingAr.join(", "));
  ok(namespace + " locale keys are complete in English", nsMissingEn.length === 0, nsMissingEn.join(", "));
});

const arabicLocaleLeaks = [
  ...visibleLatinLeaks(dashboardAr, "dashboard"),
  ...visibleLatinLeaks(win.TAAGER_LOCALES.ar.analytics, "analytics"),
  ...visibleLatinLeaks(win.TAAGER_LOCALES.ar.operations, "operations"),
];
ok("Arabic locales have no visible English fragments", arabicLocaleLeaks.length === 0, arabicLocaleLeaks.slice(0, 30).join("\n    "));

const taagerAi = read("src/renderer/pages/dashboard/sections/section-taager-ai.js");
ok("TAAGER AI metric labels are localized", ["aii.metric.health", "aii.metric.alerts", "aii.metric.opportunities"].every((key) => taagerAi.includes(key)));
ok("TAAGER AI disclaimer is localized", taagerAi.includes("aii.disclaimer.metrics") && taagerAi.includes("aii.disclaimer.scope"));

const marketingSection = read("src/renderer/pages/dashboard/sections/section-marketing-connections.js");
const marketingStyles = [
  read("src/renderer/pages/dashboard/dashboard-styles.css"),
  read("src/renderer/pages/dashboard/dashboard-marketing.css"),
].join("\n");
const usedMarketingKeys = [...marketingSection.matchAll(/tr\('([^']+)'/g)]
  .map((match) => match[1])
  .filter((key) => key.startsWith("marketing."));
const marketingKeys = [
  "marketing.accountGuideTitle",
  "marketing.connectNewAccount",
  "marketing.useExistingAccount",
  "marketing.disconnectFreeSlot",
  "marketing.disconnectConfirmBody",
  "marketing.advancedSettings",
];
ok("Marketing connection UX keys exist in English and Arabic",
  marketingKeys.every((key) => key in dashboardEn && key in dashboardAr));
ok("Every static Marketing Connections key exists in English and Arabic",
  usedMarketingKeys.every((key) => key in dashboardEn && key in dashboardAr),
  usedMarketingKeys.filter((key) => !(key in dashboardEn) || !(key in dashboardAr)).join(", "));
ok("Marketing connection renderer uses dashboard i18n",
  marketingSection.includes("window.dashboardI18n") && !marketingSection.includes("window.DashboardI18n"));
ok("Marketing disclosure UI uses dashboard theme tokens",
  marketingStyles.includes(".marketing-account-guide") &&
  marketingStyles.includes(".marketing-mapping-disclosure") &&
  marketingStyles.includes(".marketing-claim-disclosure") &&
  marketingStyles.includes("var(--dash-surface)") &&
  marketingStyles.includes("var(--dash-text)"));

const aiCss = read("src/renderer/pages/ai-intelligence/ai-intelligence.css");
ok("AI Intelligence CSS has light-theme overrides", aiCss.includes('[data-theme="light"] #page-ai-intelligence .taager-ai-section'));
ok("AI Intelligence CSS uses theme-aware text tokens", aiCss.includes("--aii-text: var(--text)") && aiCss.includes("color: var(--aii-text)"));
ok("AI Intelligence CSS has mobile breakpoint hardening", aiCss.includes("@media (max-width: 720px)") && aiCss.includes(".aii-system-metrics"));

console.log("\nResults: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
