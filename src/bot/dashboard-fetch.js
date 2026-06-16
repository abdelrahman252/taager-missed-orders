"use strict";

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const {
  addChromeFingerprintSpoofing,
  launchPersistentChromeContext,
} = require("./chrome-launch");
const { addLocalDays, resolveSafeTaagerExportRange } = require("./taager-date-range");
const {
  normalizeTaagerCountry,
  taagerUrl,
  TAAGER_COUNTRY_NAMES: NORMALIZED_TAAGER_COUNTRY_NAMES,
} = require("./taager-country");
const { createEasyOrdersExportFlow } = require("./easy-orders-export");
const { createTaagerOrdersExportFlow } = require("./taager-orders-export-flow");
const {
  installTaagerInterruptionAutoDismiss,
  clearTaagerInterruption,
  waitForTaagerTarget,
  safeTaagerClick,
  isProbablyPopupBlockerError,
} = require("./taager-interruption-guard");
const {
  tryAutomatedGooglePopupLogin,
  waitForManualGoogleLogin,
} = require("./google-login-handshake");

const config = JSON.parse(process.env.BOT_CONFIG || "{}");
const log = (msg) => process.stdout.write(msg + "\n");
const emitStage = (stage, status, message, extra = {}) => {
  process.send && process.send({ type: "stage", flow: "dashboard", stage, status, message, ...extra });
};
const easyOrdersFlow = createEasyOrdersExportFlow({
  config,
  log,
  emit: (message) => process.send && process.send(message),
});
const TAAGER_COUNTRY = normalizeTaagerCountry(config.taagerCountry || config.taagerCountry || "sa");
const taagerCountryUrl = (pathname) => taagerUrl(TAAGER_COUNTRY, pathname);
const TAAGER_COUNTRY_CART_CODES = { sa: "SAU", eg: "EGY", ae: "ARE", iq: "IRQ", om: "OMN" };
const TAAGER_COUNTRY_NAMES = {
  sa: ["السعودية", "المملكة العربية السعودية"],
  eg: ["مصر"],
  ae: ["الإمارات", "الامارات", "الإمارات العربية المتحدة"],
  iq: ["العراق"],
  om: ["عمان"],
};
const DASHBOARD_ENRICHMENT_PROVIDER = String(config.dashboardEnrichmentProvider || "none").toLowerCase();
const EASY_ORDERS_LOOKBACK_DAYS = Number(config.easyOrdersLookbackDays || 60) > 0 ? Number(config.easyOrdersLookbackDays || 60) : 60;
const MAX_TAAGER_ORDERS_EXPORT_ATTEMPTS = 3;
const TAAGER_POPUP_RETRY_WAIT_MS = 0;
const TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR = [
  "#orders-search-button",
  'button:has-text("Search")',
  'button:has-text("بحث")',
].join(", ");
const TAAGER_ORDERS_SEARCH_ENABLED_SELECTOR = [
  "#orders-search-button:not([disabled])",
  'button:has-text("Search"):not([disabled])',
  'button:has-text("بحث"):not([disabled])',
].join(", ");
const TAAGER_EXPORT_BUTTON_SELECTOR = [
  "#export-to-excel-button",
  'button:has-text("Export")',
  'button:has-text("Excel")',
  'button:has-text("تصدير")',
  'button:has-text("إكسل")',
  'button:has-text("اكسل")',
].join(", ");
let dashboardSheetProcessingFns = null;
let activeContext = null;
let activePage = null;
let taagerIdentityVerified = false;

function processDashboardSheets(...args) {
  if (!dashboardSheetProcessingFns) dashboardSheetProcessingFns = require("./dashboard-sheet-processing");
  return dashboardSheetProcessingFns.processDashboardSheets(...args);
}

function findChrome() {
  const { execSync } = require("child_process");
  if (process.platform === "win32") {
    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
    ].filter(Boolean);
    for (const p of paths) if (fs.existsSync(p)) return p;
    try { return execSync("where chrome", { encoding: "utf8" }).trim().split("\n")[0]; } catch (_) {}
  } else if (process.platform === "darwin") {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (fs.existsSync(chrome)) return chrome;
  }
  throw new Error("Chrome not found - install Google Chrome and try again.");
}

function parseConfigDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const [y, m, d] = String(value).split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(value) {
  if (!value || isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatDataDay(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function isNetworkNavigationError(error) {
  const message = String(error && error.message || error || "");
  return message.includes("ERR_CONNECTION") ||
    message.includes("net::") ||
    message.toLowerCase().includes("timeout");
}

async function gotoWithNetworkRetries(page, url, label, options = {}) {
  const attempts = options.attempts || 3;
  const timeout = options.timeout || 45000;
  const waitMs = options.waitMs || 5000;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      log(`[NAV] -> ${url}${attempt > 1 ? ` (retry ${attempt}/${attempts})` : ""}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      return;
    } catch (error) {
      if (!isNetworkNavigationError(error) || attempt >= attempts) throw error;
      log(`Network issue while loading ${label} (${attempt}/${attempts}): ${error.message} - retrying in ${Math.round(waitMs / 1000)}s...`);
      await page.waitForTimeout(waitMs);
    }
  }
}

async function reloadWithNetworkRetries(page, label, options = {}) {
  const attempts = options.attempts || 3;
  const timeout = options.timeout || 45000;
  const waitMs = options.waitMs || 5000;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      log(`Reloading ${label}${attempt > 1 ? ` (retry ${attempt}/${attempts})` : ""}...`);
      await page.reload({ waitUntil: "domcontentloaded", timeout });
      return;
    } catch (error) {
      if (!isNetworkNavigationError(error) || attempt >= attempts) throw error;
      log(`Network issue while reloading ${label} (${attempt}/${attempts}): ${error.message} - retrying in ${Math.round(waitMs / 1000)}s...`);
      await page.waitForTimeout(waitMs);
    }
  }
}

async function withTaagerStepTimeout(label, timeoutMs, fn) {
  let timer = null;
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`TAAGER_STEP_TIMEOUT: ${label} exceeded ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function clearTaagerInterruptionBounded(page, where = "taager", timeoutMs = 7000) {
  return withTaagerStepTimeout(
    `clear interruption at ${where}`,
    timeoutMs,
    () => clearTaagerInterruption(page, { log })
  ).catch((error) => {
    log(`Taager interruption clear at ${where} did not finish cleanly: ${error.message}`);
    return { cleared: false, method: "timeout" };
  });
}

function isOnLoginPage(url) {
  return (
    url.includes("/login") ||
    url.includes("/auth/login") ||
    url.includes("#/login") ||
    url.includes("/auth")
  );
}

async function debugScreenshot(page, label) {
  try {
    const ts = Date.now();
    const p = require("os").tmpdir() + `/kbot-debug-${label}-${ts}.png`;
    await page.screenshot({ path: p, fullPage: false });
    log(`📸 [DEBUG] Screenshot saved: ${p}`);
    process.send && process.send({ type: "debug-screenshot", path: p, label });
  } catch (_) {}
}

async function launchDashboardContext(profilePath, chromePath) {
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const context = await launchPersistentChromeContext(chromium, profilePath, {
        executablePath: chromePath,
        windowSize: "1400,900",
      });
      await addChromeFingerprintSpoofing(context);
      await installTaagerInterruptionAutoDismiss(context, { log });
      const page = context.pages()[0] || (await context.newPage());
      await installTaagerInterruptionAutoDismiss(page, { log });
      page.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
      activeContext = context;
      activePage = page;
      return { context, page };
    } catch (error) {
      lastError = error;
      if (attempt >= 6) break;
      log(`Chrome profile is still busy. Close the Google login Chrome window, then waiting to retry (${attempt}/6)...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw new Error(`Could not reopen bot Chrome profile. Close the Google login Chrome window and retry. Last error: ${lastError ? lastError.message : "unknown"}`);
}

async function closeActiveContextForManualGoogle() {
  if (!activeContext) return;
  const context = activeContext;
  activeContext = null;
  activePage = null;
  await context.close().catch(() => {});
}

function isClosedAutomationPage(page) {
  return !page || (typeof page.isClosed === "function" && page.isClosed());
}

async function relaunchTaagerAutomationPage(stage, targetPath) {
  const profilePath = config.profilePath;
  if (!profilePath) throw new Error(`TAAGER_PAGE_CLOSED: cannot recover ${stage}; profilePath is missing`);
  log(`Taager ${stage}: browser page is closed or crashed - relaunching Chrome profile and reopening ${targetPath}`);
  await closeActiveContextForManualGoogle();
  const relaunched = await launchDashboardContext(profilePath, config.chromePath || findChrome());
  const page = relaunched.page;
  await gotoWithNetworkRetries(page, taagerCountryUrl(targetPath), `Taager ${stage} relaunch`, { attempts: 3, timeout: 45000, waitMs: 5000 });
  await page.waitForTimeout(1000).catch(() => {});
  return page;
}

function assertUsableTaagerPage(page, where = "taager") {
  if (!page) throw new Error(`TAAGER_PAGE_INVALID at ${where}: page is missing`);
  for (const method of ["setExtraHTTPHeaders", "goto", "locator"]) {
    if (typeof page[method] !== "function") {
      throw new Error(`TAAGER_PAGE_INVALID at ${where}: page.${method} is not available`);
    }
  }
  if (typeof page.isClosed === "function" && page.isClosed()) {
    throw new Error(`TAAGER_PAGE_INVALID at ${where}: page is closed`);
  }
  return page;
}

async function assertTaagerSession(page) {
  assertUsableTaagerPage(page, "session");
  const url = page.url();
  if (isOnLoginPage(url)) throw new Error(`SESSION_EXPIRED: on login page (${url})`);
  const authDomPresent = await page.evaluate(() => {
    const selectors = [
      "#change-language-btn",
      "#complaints-suggestions-link",
      "#shipping-info-link",
      "#taager-course-link",
      "#suggest-product-btn",
      "#orders-search-button",
      "#multipleCustomers-tab-btn",
      "#upload-file-btn",
      "#confirm-bulk-orders",
      "[data-affiliate-id]",
      "[data-user]",
      "[data-email]",
      "header a[href]:not([href*='login']):not([href*='auth'])",
    ];
    return selectors.some((selector) => document.querySelector(selector));
  }).catch(() => false);
  if (!authDomPresent) {
    const title = await page.title().catch(() => "");
    throw new Error(`SESSION_UNVERIFIED: URL ok (${url}) but no auth DOM found | title: "${title}"`);
  }
}

async function withSessionGuard(page, actionFn, reloginFn, siteName) {
  try {
    const result = await actionFn();
    const urlAfter = page.url();
    if (isOnLoginPage(urlAfter)) {
      log(`⚠️ ${siteName}: action succeeded but page landed on login — SESSION_DESYNC detected`);
      process.send && process.send({ type: "session-event", site: siteName, event: "session-desync-post-action", url: urlAfter });
      await debugScreenshot(page, `${siteName}-desync`);
      await reloginFn();
      log(`🔄 ${siteName}: retrying after re-login (desync recovery)...`);
      return await actionFn();
    }
    return result;
  } catch (err) {
    const url = page.url();
    const isLoggedOut = isOnLoginPage(url);
    if (isLoggedOut) {
      log(`⚠️ ${siteName}: session expired mid-run — re-logging in...`);
      process.send && process.send({ type: "session-event", site: siteName, event: "session-expired", url });
      await debugScreenshot(page, `${siteName}-session-expired`);
      await reloginFn();
      log(`🔄 ${siteName}: retrying after re-login...`);
      return await actionFn();
    }
    throw err;
  }
}

function normalizeIdentityText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function ensureEasyOrdersEnglish(page) {
  try {
    let langLabel = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      langLabel = await page.$eval('[aria-label="language-switcher"] p', (el) => el.innerText.trim()).catch(() => null);
      if (langLabel !== null) break;
      if (attempt < 2) await page.waitForTimeout(1500);
    }
    if (langLabel && langLabel !== "en") {
      await page.click('[aria-label="language-switcher"]');
      await page.waitForTimeout(800);
      const clicked =
        await page.locator('[role="menuitem"][aria-label="english"]').click().then(() => true).catch(() => false) ||
        await page.locator('[role="menuitem"]:has-text("English")').click().then(() => true).catch(() => false) ||
        await page.locator('[role="menuitem"]:has-text("en")').click().then(() => true).catch(() => false);
      if (clicked) await page.waitForTimeout(1500);
      else await page.keyboard.press("Escape").catch(() => {});
    }
  } catch (e) {
    log(`EasyOrders language check skipped: ${e.message}`);
  }
}

async function easyOrdersLogin(page) {
  if (!config.easyEmail || !config.easyPassword) {
    throw new Error("EasyOrders credentials missing for dashboard enrichment");
  }
  await gotoWithNetworkRetries(page, "https://app.easy-orders.net/", "EasyOrders root");
  await page.waitForTimeout(2000);

  if (page.url().includes("login")) {
    await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/login", "EasyOrders login");
    await page.waitForSelector("#username", { timeout: 15000 });
    await page.fill("#username", "");
    await page.fill("#username", config.easyEmail);
    await page.fill("#password", "");
    await page.fill("#password", config.easyPassword);
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.waitFor({ state: "visible", timeout: 5000 });
    await submitBtn.click();
    await page.waitForTimeout(4000);
  }

  await ensureEasyOrdersEnglish(page);
  if (page.url().includes("store-selection")) {
    const storeName = normalizeIdentityText(config.easyStore || "");
    if (!storeName) throw new Error("EasyOrders store name is required for dashboard enrichment");
    const cards = page.locator(".MuiCard-root");
    const count = await cards.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const cardName = normalizeIdentityText(await card.locator("h6").innerText().catch(() => ""));
      if (cardName === storeName) {
        await card.click();
        found = true;
        break;
      }
    }
    if (!found) throw new Error(`EasyOrders store not found: ${config.easyStore}`);
    await page.waitForFunction(() => !window.location.href.includes("store-selection"), { timeout: 15000 });
    await page.waitForTimeout(1500);
    await ensureEasyOrdersEnglish(page);
  }
}

async function pickDateInEasyOrdersCalendar(page, targetDt) {
  const targetMonth = targetDt.getMonth();
  const targetYear = targetDt.getFullYear();
  const dayClass = String(targetDt.getDate()).padStart(3, "0");
  const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  await page.waitForSelector(".react-datepicker", { timeout: 8000 });
  for (let i = 0; i < 24; i++) {
    const headerText = await page.$eval(".react-datepicker__current-month", (el) => el.innerText.trim()).catch(() => "");
    const parts = headerText.trim().split(/\s+/);
    const shownMonth = monthNamesEn.indexOf(parts[0]);
    const yearToken = parts.find((p) => /^\d{4}$/.test(p));
    const shownYear = yearToken ? parseInt(yearToken, 10) : NaN;
    if (!isNaN(shownYear) && shownYear === targetYear && shownMonth === targetMonth) break;
    const shownTotal = isNaN(shownYear) ? -1 : shownYear * 12 + shownMonth;
    const targetTotal = targetYear * 12 + targetMonth;
    if (shownTotal === -1 || targetTotal < shownTotal) await page.click(".react-datepicker__navigation--previous");
    else await page.click(".react-datepicker__navigation--next");
    await page.waitForTimeout(300);
  }
  await page.click(`.react-datepicker__day--${dayClass}:not(.react-datepicker__day--outside-month)`);
  await page.waitForTimeout(400);
}

async function downloadToBuffer(page, url) {
  const response = await page.context().request.get(url, { timeout: 60000 });
  const body = await response.body();
  return Buffer.from(body);
}

async function exportEasyOrdersOrders(page, exportFromDate) {
  await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/orders", "EasyOrders orders page");
  await page.waitForTimeout(1500);
  await ensureEasyOrdersEnglish(page);

  const pageExportBtn = page.locator('button.MuiButton-outlined:has-text("Export")').first();
  await pageExportBtn.waitFor({ state: "visible", timeout: 10000 });
  await page.keyboard.press("Escape").catch(() => {});
  await pageExportBtn.click();
  const dialog = page.locator('div[role="dialog"]').first();
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  const dateInputs = dialog.locator(".react-datepicker-wrapper input");
  await dateInputs.first().click();
  await page.waitForTimeout(500);
  await pickDateInEasyOrdersCalendar(page, exportFromDate);
  await dialog.locator("h2").click().catch(() => {});
  await page.waitForTimeout(500);
  const dialogExportBtn = dialog.locator(".MuiDialogActions-root button");
  await dialogExportBtn.waitFor({ state: "visible", timeout: 5000 });
  await dialogExportBtn.click();
  await dialog.waitFor({ state: "hidden", timeout: 8000 });

  await page.waitForTimeout(1500);
  if (!page.url().includes("notifications")) {
    await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/notifications", "EasyOrders notifications");
  }
  await reloadWithNetworkRetries(page, "EasyOrders notifications", { attempts: 3, timeout: 30000, waitMs: 5000 });
  await page.waitForTimeout(2500);
  await reloadWithNetworkRetries(page, "EasyOrders notifications", { attempts: 3, timeout: 30000, waitMs: 5000 });
  await page.waitForTimeout(2500);

  const result = await page.evaluate(() => {
    function shortText(el) {
      return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    }
    const cards = Array.from(document.querySelectorAll("a[href], .MuiCard-root, [role='button']"));
    for (const card of cards) {
      const text = shortText(card).toLowerCase();
      const href = card.href || card.querySelector && card.querySelector("a[href]") && card.querySelector("a[href]").href;
      const isOrdersExport = text.includes("orders exported") ||
        text.includes("orders export") ||
        text.includes("created orders excel") ||
        text.includes("ملف اكسل للطلبات") ||
        text.includes("ملف إكسل للطلبات") ||
        text.includes("انشاء ملف اكسل") ||
        text.includes("إنشاء ملف إكسل");
      const isMissed = text.includes("missed orders") || text.includes("الطلبات الفائتة");
      if (href && isOrdersExport && !isMissed) return { href, text };
    }
    return null;
  });
  if (!result || !result.href) throw new Error("EasyOrders export notification was not found");
  return downloadToBuffer(page, result.href);
}

function normalizeTaagerCode(value) {
  return String(value || "").trim().toLowerCase();
}

async function readTaagerIdentity(page) {
  if (isOnLoginPage(page.url())) {
    throw new Error("SESSION_EXPIRED: cannot read identity from login page");
  }
  let identity = await page.evaluate(() => {
    const href = document.querySelector("#complaints-suggestions-link")?.getAttribute("href") || "";
    let merchantId = "";
    let merchantEmail = "";
    let merchantName = "";
    try {
      const url = new URL(href, location.origin);
      merchantId = url.searchParams.get("merchantId") || "";
      merchantEmail = url.searchParams.get("merchantEmail") || "";
      merchantName = url.searchParams.get("merchantName") || "";
    } catch (_) {}
    const country = (location.pathname.match(/^\/([a-z]{2})(?:\/|$)/i) || [])[1] || "";
    return {
      affiliateCode: merchantId.trim(),
      email: merchantEmail.trim().toLowerCase(),
      name: merchantName.trim(),
      country,
    };
  });

  if (identity.affiliateCode) return identity;

  const originalUrl = page.url();
  try {
    await ensureTaagerArabic(page);
    await page.goto(taagerCountryUrl("/profile"), { waitUntil: "domcontentloaded" });
    await ensureTaagerArabic(page);
    await page.waitForSelector("#taager-id-input", { timeout: 15000 });
    identity = await page.evaluate(() => {
      const valueOf = (selector) => {
        const el = document.querySelector(selector);
        return String((el && (el.value || el.textContent)) || "").trim();
      };
      const country = (location.pathname.match(/^\/([a-z]{2})(?:\/|$)/i) || [])[1] || "";
      return {
        affiliateCode: valueOf("#taager-id-input"),
        email: valueOf("#email-input").toLowerCase(),
        name: valueOf("#full-name-input"),
        phone: valueOf("#phone-number-input"),
        country,
      };
    });
  } finally {
    if (originalUrl && originalUrl !== "about:blank" && !originalUrl.includes("/profile")) {
      await page.goto(originalUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await ensureTaagerArabic(page).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});
    }
  }
  return identity;
}

async function verifyTaagerIdentity(page, where) {
  const expectedCountry = normalizeTaagerCountry(config.taagerCountry || TAAGER_COUNTRY || "sa");
  const expectedCode = normalizeTaagerCode(config.taagerAffiliateCode);
  if (!expectedCode) {
    throw new Error("TAAGER_IDENTITY_CONFIG_MISSING: Taager merchant ID is not set for this account");
  }
  const identity = await readTaagerIdentity(page);
  const actualCountry = String(identity.country || "").toLowerCase();
  const actualCode = normalizeTaagerCode(identity.affiliateCode);
  log(`Taager identity ${where}: expected country=${expectedCountry}, expected merchant=${expectedCode || "(first-bind)"}, detected country=${actualCountry || "unknown"}, detected merchant=${actualCode || "unknown"}`);
  if (actualCountry && actualCountry !== expectedCountry) {
    throw new Error(`TAAGER_IDENTITY_MISMATCH: expected country ${expectedCountry}, detected ${actualCountry}`);
  }
  if (expectedCode && expectedCode !== actualCode) {
    throw new Error(`TAAGER_IDENTITY_MISMATCH: expected merchant ${expectedCode}, detected ${actualCode || "unknown"}`);
  }
  if (!actualCode) {
    throw new Error("TAAGER_IDENTITY_UNVERIFIED: merchant ID was not visible in header or profile");
  }
  taagerIdentityVerified = true;
  process.send && process.send({
    type: "session-event",
    site: "taager",
    event: "identity-verified",
    affiliateCode: actualCode,
    country: actualCountry || expectedCountry,
    email: identity.email || "",
    name: identity.name || "",
    where,
  });
}

async function readTaagerCountryState(page) {
  return page.evaluate(() => {
    const pathCountry = (location.pathname.match(/^\/([a-z]{2})(?:\/|$)/i) || [])[1] || "";
    const countrySelect = Array.from(document.querySelectorAll("select")).find((select) =>
      Array.from(select.options || []).some((option) => ["SAU", "EGY", "ARE", "IRQ", "OMN"].includes(option.value))
    );
    const selectedCode = countrySelect ? countrySelect.value : "";
    const button = document.querySelector("#country-input") || (countrySelect && countrySelect.previousElementSibling);
    const buttonText = button ? String(button.innerText || button.textContent || "").replace(/\s+/g, " ").trim() : "";
    return { pathCountry, selectedCode, buttonText };
  }).catch(() => ({ pathCountry: "", selectedCode: "", buttonText: "" }));
}

async function ensureTaagerCountrySelected(page, where = "taager") {
  const expectedCountry = TAAGER_COUNTRY;
  const expectedCartCode = TAAGER_COUNTRY_CART_CODES[expectedCountry];
  if (!expectedCartCode) throw new Error(`UNSUPPORTED_TAAGER_COUNTRY: ${expectedCountry}`);
  const expectedNames = (TAAGER_COUNTRY_NAMES[expectedCountry] || [])
    .concat(NORMALIZED_TAAGER_COUNTRY_NAMES[expectedCountry] || [])
    .concat([expectedCountry.toUpperCase(), expectedCartCode]);
  let state = await readTaagerCountryState(page);
  const pathOk = !state.pathCountry || state.pathCountry.toLowerCase() === expectedCountry;
  const selectOk = !state.selectedCode || state.selectedCode === expectedCartCode;
  const buttonOk = !state.buttonText || expectedNames.some((name) => state.buttonText.includes(name));
  if (pathOk && selectOk && buttonOk) {
    log(`Taager country ${where}: verified ${expectedCountry}/${expectedCartCode}`);
    return;
  }

  log(`Taager country ${where}: mismatch path=${state.pathCountry || "?"} select=${state.selectedCode || "?"} button="${state.buttonText || "?"}" expected=${expectedCountry}/${expectedCartCode}; attempting switch`);
  const switched = await page.evaluate((expected) => {
    const select = Array.from(document.querySelectorAll("select")).find((item) =>
      Array.from(item.options || []).some((option) => option.value === expected)
    );
    if (!select) return false;
    select.value = expected;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, expectedCartCode).catch(() => false);
  if (switched) await page.waitForTimeout(1500);

  state = await readTaagerCountryState(page);
  const finalPathOk = !state.pathCountry || state.pathCountry.toLowerCase() === expectedCountry;
  const finalSelectOk = !state.selectedCode || state.selectedCode === expectedCartCode;
  const finalButtonOk = !state.buttonText || expectedNames.some((name) => state.buttonText.includes(name));
  if (finalPathOk && finalSelectOk && finalButtonOk) {
    log(`Taager country ${where}: corrected to ${expectedCountry}/${expectedCartCode}`);
    return;
  }
  throw new Error(`TAAGER_COUNTRY_MISMATCH: expected ${expectedCountry}/${expectedCartCode}, detected path=${state.pathCountry || "unknown"}, select=${state.selectedCode || "unknown"}, button="${state.buttonText || "unknown"}"`);
}

async function pickDateInTaagerCalendarLegacy(page, targetDate) {
  const targetDataDay = formatDataDay(targetDate);
  await page.waitForSelector('[role="grid"]', { timeout: 10000 });
  for (let i = 0; i < 24; i++) {
    if ((await page.locator(`[data-day="${targetDataDay}"]`).count()) > 0) break;
    const firstCell = await page.locator("[data-day]").first().getAttribute("data-day").catch(() => null);
    if (!firstCell) break;
    const goBack = new Date(targetDataDay) < new Date(firstCell);
    const selector = goBack ? 'button[name="previous-month"]' : 'button[name="next-month"]';
    const clicked = await page.locator(selector).click().then(() => true).catch(() => false);
    if (!clicked) {
      const buttons = page.locator('[role="grid"]').locator("..").locator("button");
      await (goBack ? buttons.first() : buttons.last()).click();
    }
    await page.waitForTimeout(250);
  }
  await page.locator(`[data-day="${targetDataDay}"]`).first().click();
}

async function clickTaagerMonthNav(page, direction) {
  const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
  const exactSelector = direction === "previous"
    ? 'button[name="previous-month"], button[aria-label*="Previous Month"], button[aria-label*="Previous"]'
    : 'button[name="next-month"], button[aria-label*="Next Month"], button[aria-label*="Next"]';
  const exact = visibleDialog.locator(exactSelector).first();
  if ((await exact.count()) > 0) {
    await exact.click();
    return;
  }

  const navButtons = visibleDialog.locator('nav button');
  const count = await navButtons.count();
  if (count >= 2) {
    await (direction === "previous" ? navButtons.first() : navButtons.nth(count - 1)).click();
    return;
  }

  throw new Error(`Could not find Taager ${direction} month button`);
}

async function pickDateInTaagerCalendar(page, targetDate) {
  const targetDataDay = formatDataDay(targetDate);
  await page.waitForSelector('[role="grid"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  for (let i = 0; i < 24; i++) {
    const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
    const targetButton = visibleDialog
      .locator(`[role="gridcell"][data-day="${targetDataDay}"]:not([data-outside]):not([data-disabled]) button:not([disabled])`)
      .first();
    if ((await targetButton.count()) > 0) {
      await targetButton.click();
      await page.waitForTimeout(400);
      return;
    }

    const inMonthCells = visibleDialog.locator('[role="gridcell"][data-day]:not([data-outside])');
    const firstCell = await inMonthCells.first().getAttribute("data-day").catch(() => null);
    const lastCell = await inMonthCells.last().getAttribute("data-day").catch(() => null);
    if (!firstCell || !lastCell) break;

    const goBack = targetDataDay < firstCell;
    if (!goBack && targetDataDay <= lastCell) break;

    await clickTaagerMonthNav(page, goBack ? "previous" : "next");
    await page.waitForTimeout(300);
  }

  const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
  const disabledTarget = await visibleDialog
    .locator(`[role="gridcell"][data-day="${targetDataDay}"][data-disabled], [role="gridcell"][data-day="${targetDataDay}"] button[disabled]`)
    .count();
  if (disabledTarget > 0) {
    throw new Error(`Taager date ${targetDataDay} is disabled in the calendar`);
  }
  throw new Error(`Could not find Taager date ${targetDataDay} in the visible calendar`);
}

async function clickTaagerDateRangeButton(page, kind) {
  const selectors = kind === "from"
    ? [
        'button[aria-haspopup="dialog"]:has-text("من تاريخ")',
        'button[aria-haspopup="dialog"]:has-text("From")',
        'button[aria-haspopup="dialog"]:has-text("Date from")',
      ]
    : [
        'button[aria-haspopup="dialog"]:has-text("إلى تاريخ")',
        'button[aria-haspopup="dialog"]:has-text("الى تاريخ")',
        'button[aria-haspopup="dialog"]:has-text("To")',
        'button[aria-haspopup="dialog"]:has-text("Date to")',
      ];
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 700 }).catch(() => false)) {
      await clearTaagerInterruptionBounded(page, `date-${kind}-button`);
      await target.click({ timeout: 3000 }).catch(async () => {
        await target.evaluate((el) => el.click()).catch(() => {});
      });
      return true;
    }
  }
  const dateButtons = page.locator('button[aria-haspopup="dialog"]');
  const index = kind === "from" ? 0 : 1;
  const fallback = dateButtons.nth(index);
  if (await fallback.isVisible({ timeout: 1000 }).catch(() => false)) {
    await clearTaagerInterruptionBounded(page, `date-${kind}-fallback-button`);
    await fallback.click({ timeout: 3000 }).catch(async () => {
      await fallback.evaluate((el) => el.click()).catch(() => {});
    });
    return true;
  }
  return false;
}

async function pickTaagerDateRange(page, dateFrom, dateTo) {
  if (!await clickTaagerDateRangeButton(page, "from")) {
    throw new Error("TAAGER_DATE_BUTTON_MISSING: could not find the from-date button");
  }
  await pickDateInTaagerCalendar(page, dateFrom);
  await page.waitForTimeout(300);

  const now = new Date();
  const isDateToToday = dateTo &&
    dateTo.getFullYear() === now.getFullYear() &&
    dateTo.getMonth() === now.getMonth() &&
    dateTo.getDate() === now.getDate();

  if (dateTo && !isDateToToday) {
    if (!await clickTaagerDateRangeButton(page, "to")) {
      throw new Error("TAAGER_DATE_BUTTON_MISSING: could not find the to-date button");
    }
    await pickDateInTaagerCalendar(page, dateTo);
    await page.waitForTimeout(300);
  } else {
    log(`Taager pickDateRange: dateTo is today (${dateTo ? formatDataDay(dateTo) : "none"}) or empty, leaving "to date" empty.`);
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function pickTaagerDateRangeLegacy(page, dateFrom, dateTo) {
  const fromButton = page.locator('button[aria-haspopup="dialog"]:has-text("من تاريخ")').first();
  const toButton = page.locator('button[aria-haspopup="dialog"]:has-text("إلى تاريخ")').first();
  const dateButtons = page.locator('button[aria-haspopup="dialog"]');
  if ((await fromButton.count()) > 0) await fromButton.click();
  else await dateButtons.first().click();
  await pickDateInTaagerCalendar(page, dateFrom);
  await page.waitForTimeout(300);

  const now = new Date();
  const isDateToToday = dateTo &&
    dateTo.getFullYear() === now.getFullYear() &&
    dateTo.getMonth() === now.getMonth() &&
    dateTo.getDate() === now.getDate();

  if (dateTo && !isDateToToday) {
    if ((await toButton.count()) > 0) await toButton.click();
    else await dateButtons.nth(1).click();
    await pickDateInTaagerCalendar(page, dateTo);
    await page.waitForTimeout(300);
  } else {
    log(`Taager pickDateRange: dateTo is today (${dateTo ? formatDataDay(dateTo) : "none"}) or empty, leaving "to date" empty.`);
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function readTaagerLanguageButtonText(page) {
  assertUsableTaagerPage(page, "read-language");
  const button = page.locator("#change-language-btn:visible").first();
  if (!await button.isVisible({ timeout: 1200 }).catch(() => false)) return "";
  return String(await button.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
}

function isTaagerAlreadyArabicLanguageText(text) {
  return /^english$/i.test(String(text || "").trim());
}

function isTaagerSwitchToArabicLanguageText(text) {
  return /^عربي$/.test(String(text || "").trim()) || /^arabic$/i.test(String(text || "").trim());
}

async function taagerLogin(page) {
  assertUsableTaagerPage(page, "login-start");
  await installTaagerInterruptionAutoDismiss(page, { log });
  await clearTaagerInterruptionBounded(page, "login-start");
  await ensureTaagerArabic(page, "before-login", { requireButton: false });
  await gotoWithNetworkRetries(page, taagerCountryUrl("/auth/login"), "Taager login", { attempts: 3, timeout: 45000, waitMs: 5000 });
  await page.waitForTimeout(1500);
  const loginClear = await clearTaagerInterruptionBounded(page, "login-after-navigation").catch((error) => {
    log(`Taager login: popup clear after navigation failed: ${error.message}`);
    return { cleared: false, method: "error" };
  });
  log(`Taager login: popup clear after navigation -> cleared=${!!loginClear.cleared} method=${loginClear.method || "none"} url=${page.url()}`);
  await ensureTaagerArabic(page, "login-page", { requireButton: false });
  await clearTaagerInterruptionBounded(page, "login-page");
  if (!page.url().includes("/login") && !page.url().includes("/auth")) {
    log("Taager: already logged in");
    await ensureTaagerArabic(page, "login-reused", { requireButton: true });
    await assertTaagerSession(page);
    await verifyTaagerIdentity(page, "login-reused");
    return page;
  }

  const method = config.taagerLoginMethod || config.taagerLoginMethod || "email";
  const email = config.taagerEmail || config.taagerEmail || "";
  const phone = config.taagerPhone || config.taagerPhone || "";
  const password = config.taagerPassword || config.taagerPassword || "";

  if (method === "google") {
    log("[GoogleLogin] Dashboard fetch needs Taager Google login");
    if (await tryAutomatedGooglePopupLogin(page, email, log)) {
      process.send && process.send({ type: "google-login-complete" });
      await ensureTaagerArabic(page, "login-confirmed", { requireButton: true });
      await assertTaagerSession(page);
      await verifyTaagerIdentity(page, "login-confirmed");
      return page;
    }
    log("[GoogleLogin][Auto] saved-account popup automation did not complete login; falling back to manual Chrome");
    await closeActiveContextForManualGoogle();
    await waitForManualGoogleLogin({
      config,
      country: TAAGER_COUNTRY,
      chromePath: config.chromePath || findChrome(),
      timeoutMs: 10 * 60 * 1000,
      log,
    });
    const relaunched = await launchDashboardContext(config.profilePath, config.chromePath || findChrome());
    page = relaunched.page;
    await ensureTaagerArabic(page, "google-manual-relaunch", { requireButton: false });
    await gotoWithNetworkRetries(page, taagerCountryUrl("/home"), "Taager home after Google login", { attempts: 3, timeout: 45000, waitMs: 5000 });
    await page.waitForTimeout(1500);
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      throw new Error("Google login not detected. Log in with Google in the opened Chrome window, close it, then click 'I finished Google login'.");
    }
    process.send && process.send({ type: "google-login-complete" });
    await ensureTaagerArabic(page, "login-confirmed", { requireButton: true });
    await assertTaagerSession(page);
    await verifyTaagerIdentity(page, "login-confirmed");
    return page;
  } else if (method === "phone") {
    if (!phone || !password) throw new Error("Taager phone/password credentials are missing");
    await clearTaagerInterruptionBounded(page, "phone-login-before-phone");
    await page.waitForSelector('input[name="phoneNumber"]', { timeout: 15000 });
    await clearTaagerInterruptionBounded(page, "phone-login-before-fill");
    await page.fill('input[name="phoneNumber"]', phone);
    await page.fill("#password", password);
    await clearTaagerInterruptionBounded(page, "phone-login-before-submit");
    await page.click("#phone-login-submit-btn");
  } else {
    if (!email || !password) throw new Error("Taager email/password credentials are missing");
    await clearTaagerInterruptionBounded(page, "email-login-before-register");
    await page.waitForSelector("#register", { timeout: 15000 });
    await clearTaagerInterruptionBounded(page, "email-login-before-register-click");
    await page.click("#register");
    await page.waitForSelector("#email", { timeout: 10000 });
    await clearTaagerInterruptionBounded(page, "email-login-before-fill");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await clearTaagerInterruptionBounded(page, "email-login-before-submit");
    await page.click("#loginByPhoneNumber");
  }

  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await page.waitForTimeout(3000);
    await clearTaagerInterruptionBounded(page, "login-confirmation-loop");
    const url = page.url();
    if (url.includes("/home") || url.includes("/orders") || url.includes("/products")) {
      log("Taager login confirmed");
      await ensureTaagerArabic(page, "login-confirmed", { requireButton: true });
      await assertTaagerSession(page);
      await verifyTaagerIdentity(page, "login-confirmed");
      return page;
    }
  }
  throw new Error("Taager login timeout after 5 minutes");
}

async function ensureTaagerArabic(page, where = "taager", options = {}) {
  assertUsableTaagerPage(page, `arabic-${where}`);
  await withTaagerStepTimeout(
    `install Taager interruption guard at ${where}`,
    8000,
    () => installTaagerInterruptionAutoDismiss(page, { log })
  ).catch((error) => log(`Taager language prep: guard install skipped at ${where}: ${error.message}`));
  await withTaagerStepTimeout(
    `set Taager language headers at ${where}`,
    5000,
    () => page.setExtraHTTPHeaders({ "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.5" })
  ).catch(() => {});
  await withTaagerStepTimeout(`prime Taager Arabic locale at ${where}`, 5000, () => page.evaluate(() => {
    try {
      localStorage.setItem("i18nextLng", "ar");
      localStorage.setItem("language", "ar");
      localStorage.setItem("locale", "ar");
      document.documentElement.lang = "ar";
      document.documentElement.dir = "rtl";
    } catch (_) {}
  })).catch((error) => log(`Taager language prep: locale prime skipped at ${where}: ${error.message}`));
  await page.waitForTimeout(300).catch(() => {});
  await clearTaagerInterruptionBounded(page, where);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await withTaagerStepTimeout(
      `read Taager language button at ${where}`,
      5000,
      () => readTaagerLanguageButtonText(page)
    ).catch((error) => {
      log(`Taager language prep: could not read language button at ${where}: ${error.message}`);
      return "";
    });
    if (!text) {
      if (options.requireButton) {
        throw new Error(`TAAGER_LANGUAGE_BUTTON_MISSING: #change-language-btn not visible at ${where}`);
      }
      return page;
    }
    if (isTaagerAlreadyArabicLanguageText(text)) return page;
    if (!isTaagerSwitchToArabicLanguageText(text)) {
      if (options.requireButton) {
        throw new Error(`TAAGER_LANGUAGE_UNKNOWN: change-language button shows "${text}" at ${where}`);
      }
      return page;
    }

    log(`Taager language is English at ${where} - switching to Arabic`);
    await clearTaagerInterruptionBounded(page, `${where}-before-language-click`);
    const langBtn = page.locator("#change-language-btn:visible").first();
    await withTaagerStepTimeout(
      `click Taager language button at ${where}`,
      7000,
      () => langBtn.click({ timeout: 5000 })
    ).catch(async () => {
      await withTaagerStepTimeout(
        `fallback click Taager language button at ${where}`,
        3000,
        () => langBtn.evaluate((el) => el.click())
      ).catch(() => {});
    });
    await page.waitForTimeout(1500).catch(() => {});
    const afterText = await withTaagerStepTimeout(
      `read Taager language button after switch at ${where}`,
      5000,
      () => readTaagerLanguageButtonText(page)
    ).catch(() => "");
    if (isTaagerAlreadyArabicLanguageText(afterText)) return page;
    if (attempt === 1) {
      log(`Taager language switch did not settle at ${where}; reloading and retrying`);
      await reloadWithNetworkRetries(page, `Taager language switch ${where}`, { attempts: 1, timeout: 45000, waitMs: 3000 }).catch(() => {});
    }
  }
  await debugScreenshot(page, `taager-language-not-arabic-${where}`).catch(() => {});
  throw new Error(`TAAGER_LANGUAGE_NOT_ARABIC: change-language button still offers Arabic at ${where}`);
}

async function waitBeforeTaagerOrdersRetry(page, error, attempt, maxAttempts, options = {}) {
  const waitSeconds = Math.ceil(TAAGER_POPUP_RETRY_WAIT_MS / 1000);
  const reason = error && error.message ? error.message : String(error || "unknown error");
  const stageLabel = options.stageLabel || "Dashboard Taager export";
  log(`${stageLabel} attempt ${attempt}/${maxAttempts} blocked: ${reason}`);
  log(waitSeconds > 0
    ? `Reloading ${stageLabel} and retrying in ${waitSeconds}s...`
    : `Reloading ${stageLabel} and retrying now...`);
  process.send && process.send({
    type: "taager-restart",
    reason,
    attempt,
    maxAttempts,
    waitSeconds,
    stage: options.stage || "dashboard-orders-export",
    recovery: options.recovery || "taager-recovery",
  });
  await page.waitForTimeout(TAAGER_POPUP_RETRY_WAIT_MS).catch(() => {});
}

function isDangerousTaagerError(error) {
  const message = String(error && error.message || error || "");
  return message.includes("TAAGER_IDENTITY_MISMATCH") ||
    message.includes("TAAGER_IDENTITY_CONFIG_MISSING") ||
    message.includes("TAAGER_COUNTRY_MISMATCH") ||
    message.includes("UNSUPPORTED_TAAGER_COUNTRY") ||
    message.includes("credentials are missing");
}

function isRecoverableTaagerError(error, page) {
  if (isDangerousTaagerError(error)) return false;
  const message = String(error && error.message || error || "");
  const url = page && typeof page.url === "function" ? page.url() : "";
  return isNetworkNavigationError(error) ||
    isProbablyPopupBlockerError(error) ||
    isOnLoginPage(url) ||
    message.includes("SESSION_EXPIRED") ||
    message.includes("SESSION_UNVERIFIED") ||
    message.includes("TAAGER_STEP_TIMEOUT") ||
    message.includes("TAAGER_LANGUAGE_NOT_ARABIC") ||
    message.includes("TAAGER_LANGUAGE_BUTTON_MISSING") ||
    message.includes("TAAGER_TARGET_TIMEOUT") ||
    message.includes("TAAGER_PAGE_CLOSED") ||
    message.toLowerCase().includes("download") ||
    message.includes("Target page, context or browser has been closed") ||
    message.toLowerCase().includes("page closed") ||
    message.toLowerCase().includes("browser has been closed");
}

async function recoverTaagerForRetry(page, stage, targetPath, error, attempt, maxAttempts) {
  let recoveryPage = page;
  const reason = error && error.message ? error.message : String(error || "unknown error");
  log(`Taager ${stage} attempt ${attempt}/${maxAttempts} failed: ${reason}`);
  if (!isClosedAutomationPage(recoveryPage)) {
    await debugScreenshot(recoveryPage, `taager-${stage}-attempt-${attempt}`).catch(() => {});
  }
  if (!isRecoverableTaagerError(error, recoveryPage)) throw error;
  if (attempt >= maxAttempts) return recoveryPage;
  await waitBeforeTaagerOrdersRetry(recoveryPage || activePage || { waitForTimeout: async () => {} }, error, attempt, maxAttempts, {
    stage,
    stageLabel: `Taager ${stage}`,
  });

  if (isClosedAutomationPage(recoveryPage)) {
    log(`Taager ${stage}: recovery page is closed; relaunching and reopening ${targetPath}`);
    recoveryPage = await relaunchTaagerAutomationPage(stage, targetPath);
  } else {
    assertUsableTaagerPage(recoveryPage, `${stage}-recovery`);
    log(`Taager ${stage}: clearing interruptions before recovery reload (url=${recoveryPage.url()})`);
    const clearResult = await clearTaagerInterruptionBounded(recoveryPage, `${stage}-before-recovery-reload`).catch((clearError) => {
      log(`Taager ${stage}: interruption clear before reload failed: ${clearError.message}`);
      return { cleared: false, method: "error" };
    });
    log(`Taager ${stage}: interruption clear before reload -> cleared=${!!clearResult.cleared} method=${clearResult.method || "none"}`);
    log(`Taager ${stage}: reloading current page for recovery`);
    await reloadWithNetworkRetries(recoveryPage, `Taager ${stage} recovery`, { attempts: 2, timeout: 45000, waitMs: 5000 }).catch(async () => {
      log(`Taager ${stage}: reload recovery failed; navigating directly to ${targetPath}`);
      await gotoWithNetworkRetries(recoveryPage, taagerCountryUrl(targetPath), `Taager ${stage} recovery fallback`, { attempts: 2, timeout: 45000, waitMs: 5000 });
    });
    await recoveryPage.waitForTimeout(1000).catch(() => {});
    if (!isOnLoginPage(recoveryPage.url()) && targetPath) {
      log(`Taager ${stage}: re-opening ${targetPath} after recovery reload`);
      await gotoWithNetworkRetries(recoveryPage, taagerCountryUrl(targetPath), `Taager ${stage} recovery target`, { attempts: 2, timeout: 45000, waitMs: 5000 });
      await recoveryPage.waitForTimeout(1000).catch(() => {});
    }
    log(`Taager ${stage}: recovery navigation settled (url=${recoveryPage.url()})`);
  }

  if (isOnLoginPage(recoveryPage.url())) {
    log(`Taager ${stage}: recovery landed on login - re-logging in`);
    recoveryPage = await taagerLogin(recoveryPage);
  }
  await ensureTaagerArabic(recoveryPage, `${stage}-recovery`, { requireButton: false }).catch((languageError) => {
    log(`Taager ${stage}: language prep during recovery was skipped: ${languageError.message}`);
  });
  if (!isOnLoginPage(recoveryPage.url())) {
    await assertTaagerSession(recoveryPage);
    if (taagerIdentityVerified) {
      log(`Taager ${stage}: identity already verified this run; skipping duplicate recovery scrape`);
    } else {
      await verifyTaagerIdentity(recoveryPage, `${stage}-recovery`);
    }
    await ensureTaagerCountrySelected(recoveryPage, `${stage}-recovery`);
    if (String(targetPath || "").includes("/orders")) {
      log(`Taager ${stage}: checking orders page after recovery before next attempt`);
      const clearResult = await clearTaagerInterruptionBounded(recoveryPage, `${stage}-after-recovery`).catch((clearError) => {
        log(`Taager ${stage}: interruption clear after recovery failed: ${clearError.message}`);
        return { cleared: false, method: "error" };
      });
      log(`Taager ${stage}: interruption clear after recovery -> cleared=${!!clearResult.cleared} method=${clearResult.method || "none"}`);
      await waitForTaagerTarget(
        recoveryPage,
        TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR,
        `Taager ${stage} recovery orders page ready`,
        { timeout: 15000, blockingOverlayTimeout: 5000, log }
      );
      log(`Taager ${stage}: recovery page is ready for the next export attempt (url=${recoveryPage.url()})`);
    }
  }
  activePage = recoveryPage;
  return recoveryPage;
}

async function readDownloadToBuffer(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return Buffer.concat(chunks);
}

async function gotoDashboardTaagerOrders(page) {
  assertUsableTaagerPage(page, "dashboard-orders-export");
  log("Dashboard Taager export: ensuring Arabic before /orders navigation");
  await ensureTaagerArabic(page, "before-orders-export", { requireButton: false });
  log(`Dashboard Taager export: navigating to ${taagerCountryUrl("/orders")}`);
  await gotoWithNetworkRetries(page, taagerCountryUrl("/orders"), "Taager dashboard orders", { attempts: 3, timeout: 45000, waitMs: 5000 });
  log(`Dashboard Taager export: /orders navigation settled (url=${page.url()})`);
  if (!page.url().includes("/login") && !page.url().includes("/auth")) {
    log("Dashboard Taager export: fast-checking orders controls");
    const clearResult = await clearTaagerInterruptionBounded(page, "dashboard-orders-fast-check").catch((clearError) => {
      log(`Dashboard Taager export: interruption clear failed during fast-check: ${clearError.message}`);
      return { cleared: false, method: "error" };
    });
    log(`Dashboard Taager export: fast-check interruption clear -> cleared=${!!clearResult.cleared} method=${clearResult.method || "none"}`);
    const searchReady = await page.locator(TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR).first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (searchReady) {
      log("Dashboard Taager export: orders controls visible; skipping slow post-navigation checks");
      return page;
    }
    log("Dashboard Taager export: orders controls not visible yet; falling back to full verification");
  }
  await ensureTaagerArabic(page, "orders-export", { requireButton: true });
  log("Dashboard Taager export: verifying session, identity, and country");
  await assertTaagerSession(page);
  if (taagerIdentityVerified) {
    log("Dashboard Taager export: identity already verified this run; skipping duplicate profile/header scrape");
  } else {
    await verifyTaagerIdentity(page, "orders-export");
  }
  await ensureTaagerCountrySelected(page, "orders-export");
  const clearResult = await clearTaagerInterruptionBounded(page, "dashboard-orders-before-ready-wait").catch((clearError) => {
    log(`Dashboard Taager export: interruption clear failed before page-ready wait: ${clearError.message}`);
    return { cleared: false, method: "error" };
  });
  log(`Dashboard Taager export: interruption clear before page-ready wait -> cleared=${!!clearResult.cleared} method=${clearResult.method || "none"}`);
  return page;
}

async function stabilizeDashboardTaagerOrdersBeforeDateRange(page, meta = {}) {
  assertUsableTaagerPage(page, "dashboard-orders-stabilize-before-date-range");
  const attempt = Number(meta.attempt || 1);
  const maxAttempts = Number(meta.maxAttempts || MAX_TAAGER_ORDERS_EXPORT_ATTEMPTS);
  log(`Dashboard Taager export stabilization attempt ${attempt}/${maxAttempts}: reloading /orders before date selection`);

  await clearTaagerInterruptionBounded(page, "dashboard-orders-stabilize-before-reload");
  await reloadWithNetworkRetries(page, "Dashboard Taager orders stabilization", {
    attempts: 1,
    timeout: 45000,
    waitMs: 3000,
  }).catch(async (error) => {
    log(`Dashboard Taager export stabilization reload failed (${error.message}); reopening /orders`);
    await gotoWithNetworkRetries(page, taagerCountryUrl("/orders"), "Dashboard Taager orders stabilization fallback", {
      attempts: 2,
      timeout: 45000,
      waitMs: 5000,
    });
  });
  await page.waitForTimeout(1000).catch(() => {});

  if (isOnLoginPage(page.url())) {
    log("Dashboard Taager export stabilization landed on login - re-logging in");
    page = await taagerLogin(page);
    await gotoWithNetworkRetries(page, taagerCountryUrl("/orders"), "Dashboard Taager orders stabilization after re-login", {
      attempts: 2,
      timeout: 45000,
      waitMs: 5000,
    });
    await page.waitForTimeout(1000).catch(() => {});
  }

  const clearResult = await clearTaagerInterruptionBounded(page, "dashboard-orders-stabilize-after-reload").catch((clearError) => {
    log(`Dashboard Taager export stabilization: interruption clear after reload failed: ${clearError.message}`);
    return { cleared: false, method: "error" };
  });
  log(`Dashboard Taager export stabilization: interruption clear after reload -> cleared=${!!clearResult.cleared} method=${clearResult.method || "none"}`);
  await waitForTaagerTarget(
    page,
    TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR,
    "Dashboard Taager orders page ready after stabilization reload",
    { timeout: 15000, blockingOverlayTimeout: 5000, log }
  );
  log("Dashboard Taager export stabilization complete: orders controls visible");
  return page;
}

function createDashboardTaagerOrdersExportFlow() {
  return createTaagerOrdersExportFlow({
    flow: "dashboard",
    log,
    emitStage: (message) => process.send && process.send(message),
    formatDataDay,
    clearTaagerInterruption: (page) => clearTaagerInterruptionBounded(page, "dashboard-orders-export"),
    waitForTaagerTarget,
    safeTaagerClick,
    pickDateRange: pickTaagerDateRange,
    gotoOrders: gotoDashboardTaagerOrders,
    stabilizeBeforeDateRange: stabilizeDashboardTaagerOrdersBeforeDateRange,
    recoverForRetry: (page, error, attempt, maxAttempts) =>
      recoverTaagerForRetry(page, "dashboard-orders-export", "/orders", error, attempt, maxAttempts),
    readDownloadToBuffer,
    maxAttempts: MAX_TAAGER_ORDERS_EXPORT_ATTEMPTS,
    searchButtonSelector: TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR,
    searchEnabledSelector: TAAGER_ORDERS_SEARCH_ENABLED_SELECTOR,
    exportButtonSelector: TAAGER_EXPORT_BUTTON_SELECTOR,
    finalErrorPrefix: "TAAGER_POPUP_RECOVERY_FAILED: Taager dashboard export failed",
  });
}

async function exportTaagerOrdersAttempt(page, dateFrom, dateTo, attempt, maxAttempts) {
  return createDashboardTaagerOrdersExportFlow().exportAttempt(page, dateFrom, dateTo, attempt, maxAttempts);
}

async function exportTaagerOrders(page, dateFrom, dateTo) {
  return createDashboardTaagerOrdersExportFlow().exportOrders(page, dateFrom, dateTo);
}

(async () => {
  const profilePath = config.profilePath;
  if (!profilePath) return process.send && process.send({ type: "error", error: "profilePath not set in config" });

  const method = config.taagerLoginMethod || config.taagerLoginMethod || "email";
  const hasTaagerLoginIdentity = method === "google" || !!(method === "phone" ? config.taagerPhone : (config.taagerEmail || config.taagerEmail));
  const hasTaagerPassword = method === "google" || !!(config.taagerPassword || config.taagerPassword);
  if (!hasTaagerLoginIdentity || !hasTaagerPassword) {
    return process.send && process.send({ type: "error", error: "Taager credentials missing for this account. Re-save the account, then retry dashboard update." });
  }

  if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
  const chromePath = config.chromePath || findChrome();
  log(`Using Chrome: ${chromePath}`);

  let context = await launchPersistentChromeContext(chromium, profilePath, {
    executablePath: chromePath,
    windowSize: "1400,900",
  });

  await addChromeFingerprintSpoofing(context);
  await installTaagerInterruptionAutoDismiss(context, { log });

  let page = context.pages()[0] || (await context.newPage());
  await installTaagerInterruptionAutoDismiss(page, { log });
  page.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
  activeContext = context;
  activePage = page;

  try {
    emitStage("dashboard.fetch.start", "started", "Preparing dashboard date range");
    const now = new Date();
    const requestedFrom = parseConfigDate(config.dashboardDateFrom);
    const requestedTo = parseConfigDate(config.dashboardDateTo);
    const dateFrom = requestedFrom || new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const dateTo = requestedTo || new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const { exportDateFrom, exportDateTo } = resolveSafeTaagerExportRange(dateFrom, dateTo, { today: now });

    log(`Dashboard fetch - Taager ${formatDataDay(exportDateFrom)} -> ${formatDataDay(exportDateTo)} (saving created-date range ${formatDataDay(dateFrom)} -> ${formatDataDay(dateTo)})`);
    emitStage("taager.login", "started", "Logging into Taager");
    page = await taagerLogin(page);
    emitStage("taager.login", "ok", "Taager login confirmed");
    emitStage("taager.orders.export", "started", "Exporting Taager orders");
    const buffer = await withSessionGuard(
      page,
      () => exportTaagerOrders(page, exportDateFrom, exportDateTo),
      async () => { page = await taagerLogin(page); },
      "Taager"
    );
    emitStage("taager.orders.export", "ok", `Taager export downloaded ${buffer.length} bytes`, { bytes: buffer.length });
    let easyBuffer = null;
    let enrichmentError = "";
    if (DASHBOARD_ENRICHMENT_PROVIDER === "easyorders") {
      const easyFrom = addLocalDays(dateFrom, -EASY_ORDERS_LOOKBACK_DAYS);
      try {
        emitStage("easyorders.enrichment", "started", `Exporting EasyOrders enrichment from ${formatDataDay(easyFrom)}`);
        log(`Dashboard enrichment - EasyOrders ${formatDataDay(easyFrom)} -> ${formatDataDay(dateTo)} (product names + payment only)`);
        await easyOrdersFlow.login(page);
        easyBuffer = await easyOrdersFlow.exportOrders(page, easyFrom);
        emitStage("easyorders.enrichment", "ok", `EasyOrders enrichment export downloaded ${easyBuffer.length} bytes`, { bytes: easyBuffer.length });
      } catch (enrichmentErr) {
        enrichmentError = enrichmentErr.message || String(enrichmentErr);
        log(`Dashboard enrichment - EasyOrders failed, continuing with Taager-only data: ${enrichmentErr.message}`);
        emitStage("easyorders.enrichment", "warning", `Continuing Taager-only: ${enrichmentError}`);
      }
    } else {
      emitStage("easyorders.enrichment", "ok", "EasyOrders enrichment disabled for this account");
    }

    const sheetOptions = {
      taagerBuffer: buffer,
      easyOrdersBuffer: easyBuffer,
      dateFrom: toDateKey(dateFrom),
      dateTo: toDateKey(dateTo),
      country: TAAGER_COUNTRY,
      enrichmentEnabled: DASHBOARD_ENRICHMENT_PROVIDER === "easyorders",
      easyOrdersLookbackDays: EASY_ORDERS_LOOKBACK_DAYS,
      skuNameCache: config.dashboardSkuNameCache || {},
    };
    let processed;
    try {
      emitStage("dashboard.parse", "started", "Parsing dashboard sheets");
      processed = processDashboardSheets(sheetOptions);
    } catch (sheetError) {
      if (!easyBuffer) throw sheetError;
      log(`Dashboard enrichment - EasyOrders parse failed, continuing with Taager-only data: ${sheetError.message}`);
      emitStage("dashboard.parse", "warning", `EasyOrders parse failed; retrying Taager-only: ${sheetError.message}`);
      processed = processDashboardSheets({ ...sheetOptions, easyOrdersBuffer: null });
    }
    emitStage("dashboard.parse", "ok", `Parsed ${processed.rows.length} dashboard rows`, { rows: processed.rows.length });
    if (processed.enrichmentDiagnostics.status === "ok") {
      log(`Dashboard enrichment - EasyOrders named ${processed.enrichmentDiagnostics.productNameMatches || 0} rows, cache hits ${processed.enrichmentDiagnostics.cacheHits || 0}, learned ${processed.enrichmentDiagnostics.learnedSkuNames || 0} SKUs, and matched ${processed.enrichmentDiagnostics.paymentMatches || 0} payment rows`);
    }
    if (enrichmentError) {
      processed.enrichmentDiagnostics = Object.assign({}, processed.enrichmentDiagnostics, { error: enrichmentError });
    }

    emitStage("dashboard.result", "started", "Sending dashboard result to main process");
    emitStage("dashboard.result", "ok", "Dashboard result ready");
    process.send && process.send({
      type: "dashboard-result",
      rows: processed.rows,
      learnedSkuNameMap: processed.learnedSkuNameMap || {},
      parseDiagnostics: processed.parseDiagnostics,
      enrichmentDiagnostics: processed.enrichmentDiagnostics,
      snapshotMonth: processed.snapshotMonth,
      dateFrom: processed.dateFrom,
      dateTo: processed.dateTo,
      exportDateFrom: toDateKey(exportDateFrom),
      exportDateTo: toDateKey(exportDateTo),
    });
  } catch (err) {
    log(`FATAL: ${err.message}`);
    emitStage("dashboard.fetch", "failed", err.message || String(err));
    process.send && process.send({ type: "error", error: err.message });
  } finally {
    await (activeContext || context).close().catch(() => {});
  }
})();
