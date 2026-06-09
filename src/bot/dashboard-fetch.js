"use strict";

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const {
  addChromeFingerprintSpoofing,
  launchPersistentChromeContext,
} = require("./chrome-launch");
const { addLocalDays, resolveSafeTaagerExportRange } = require("./taager-date-range");
const { createEasyOrdersExportFlow } = require("./easy-orders-export");

const config = JSON.parse(process.env.BOT_CONFIG || "{}");
const log = (msg) => process.stdout.write(msg + "\n");
const easyOrdersFlow = createEasyOrdersExportFlow({
  config,
  log,
  emit: (message) => process.send && process.send(message),
});
const TAAGER_COUNTRY = (config.taagerCountry || config.taagerCountry || "sa").toLowerCase();
const taagerUrl = (pathname) => `https://taager.com/${TAAGER_COUNTRY}${pathname}`;
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
let dashboardSheetProcessingFns = null;

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
    await page.goto(taagerUrl("/profile"), { waitUntil: "domcontentloaded" });
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
  const expectedCountry = String(config.taagerCountry || TAAGER_COUNTRY || "sa").toLowerCase();
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
  const expectedNames = TAAGER_COUNTRY_NAMES[expectedCountry] || [];
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

async function pickTaagerDateRange(page, dateFrom, dateTo) {
  const fromButton = page.locator('button[aria-haspopup="dialog"]:has-text("من تاريخ")').first();
  const toButton = page.locator('button[aria-haspopup="dialog"]:has-text("إلى تاريخ")').first();
  const dateButtons = page.locator('button[aria-haspopup="dialog"]');
  if ((await fromButton.count()) > 0) await fromButton.click();
  else await dateButtons.first().click();
  await pickDateInTaagerCalendar(page, dateFrom);
  await page.waitForTimeout(300);

  if (dateTo) {
    if ((await toButton.count()) > 0) await toButton.click();
    else await dateButtons.nth(1).click();
    await pickDateInTaagerCalendar(page, dateTo);
    await page.waitForTimeout(300);
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function taagerLogin(page) {
  await ensureTaagerArabic(page);
  await page.goto(taagerUrl("/auth/login"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await ensureTaagerArabic(page);
  if (!page.url().includes("/login") && !page.url().includes("/auth")) {
    log("Taager: already logged in");
    await verifyTaagerIdentity(page, "login-reused");
    return;
  }

  const method = config.taagerLoginMethod || config.taagerLoginMethod || "email";
  const email = config.taagerEmail || config.taagerEmail || "";
  const phone = config.taagerPhone || config.taagerPhone || "";
  const password = config.taagerPassword || config.taagerPassword || "";

  if (method === "google") {
    process.send && process.send({ type: "google-login-needed" });
  } else if (method === "phone") {
    if (!phone || !password) throw new Error("Taager phone/password credentials are missing");
    await page.waitForSelector('input[name="phoneNumber"]', { timeout: 15000 });
    await page.fill('input[name="phoneNumber"]', phone);
    await page.fill("#password", password);
    await page.click("#phone-login-submit-btn");
  } else {
    if (!email || !password) throw new Error("Taager email/password credentials are missing");
    await page.waitForSelector("#register", { timeout: 15000 });
    await page.click("#register");
    await page.waitForSelector("#email", { timeout: 10000 });
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click("#loginByPhoneNumber");
  }

  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await page.waitForTimeout(3000);
    const url = page.url();
    if (url.includes("/home") || url.includes("/orders") || url.includes("/products")) {
      log("Taager login confirmed");
      await verifyTaagerIdentity(page, "login-confirmed");
      return;
    }
  }
  throw new Error("Taager login timeout after 5 minutes");
}

async function ensureTaagerArabic(page) {
  await page.setExtraHTTPHeaders({ "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.5" }).catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.setItem("i18nextLng", "ar");
      localStorage.setItem("language", "ar");
      localStorage.setItem("locale", "ar");
      document.documentElement.lang = "ar";
      document.documentElement.dir = "rtl";
    } catch (_) {}
  }).catch(() => {});
  await page.waitForTimeout(300).catch(() => {});
  const langBtn = page.locator("#change-language-btn:visible").filter({ hasText: /^عربي$/ }).first();
  if (await langBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    log("Taager language is English - switching to Arabic");
    await langBtn.click();
    await page.waitForTimeout(1500);
  }
  const stillEnglish = await page.locator("#change-language-btn:visible").filter({ hasText: /^عربي$/ }).first().isVisible({ timeout: 500 }).catch(() => false);
  if (stillEnglish) {
    throw new Error("TAAGER_LANGUAGE_NOT_ARABIC: change-language button still shows عربي");
  }
}

async function exportTaagerOrders(page, dateFrom, dateTo) {
  await ensureTaagerArabic(page);
  await page.goto(taagerUrl("/orders"), { waitUntil: "domcontentloaded" });
  await ensureTaagerArabic(page);
  await verifyTaagerIdentity(page, "orders-export");
  await ensureTaagerCountrySelected(page, "orders-export");
  await page.waitForSelector("#orders-search-button", { timeout: 30000 });
  await pickTaagerDateRange(page, dateFrom, dateTo);
  await page.waitForSelector("#orders-search-button:not([disabled])", { timeout: 15000 });
  await page.click("#orders-search-button");
  await page.waitForSelector("#orders-search-button:not([disabled])", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(500);

  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.click("#export-to-excel-button");
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return Buffer.concat(chunks);
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

  const context = await launchPersistentChromeContext(chromium, profilePath, {
    executablePath: chromePath,
    windowSize: "1400,900",
  });

  await addChromeFingerprintSpoofing(context);

  const page = context.pages()[0] || (await context.newPage());
  page.setViewportSize({ width: 1400, height: 900 }).catch(() => {});

  try {
    const now = new Date();
    const requestedFrom = parseConfigDate(config.dashboardDateFrom);
    const requestedTo = parseConfigDate(config.dashboardDateTo);
    const dateFrom = requestedFrom || new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const dateTo = requestedTo || new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const { exportDateFrom, exportDateTo } = resolveSafeTaagerExportRange(dateFrom, dateTo, { today: now });

    log(`Dashboard fetch - Taager ${formatDataDay(exportDateFrom)} -> ${formatDataDay(exportDateTo)} (saving created-date range ${formatDataDay(dateFrom)} -> ${formatDataDay(dateTo)})`);
    await taagerLogin(page);
    const buffer = await withSessionGuard(
      page,
      () => exportTaagerOrders(page, exportDateFrom, exportDateTo),
      () => taagerLogin(page),
      "Taager"
    );
    let easyBuffer = null;
    let enrichmentError = "";
    if (DASHBOARD_ENRICHMENT_PROVIDER === "easyorders") {
      const easyFrom = addLocalDays(dateFrom, -EASY_ORDERS_LOOKBACK_DAYS);
      try {
        log(`Dashboard enrichment - EasyOrders ${formatDataDay(easyFrom)} -> ${formatDataDay(dateTo)} (product names + payment only)`);
        await easyOrdersFlow.login(page);
        easyBuffer = await easyOrdersFlow.exportOrders(page, easyFrom);
      } catch (enrichmentErr) {
        enrichmentError = enrichmentErr.message || String(enrichmentErr);
        log(`Dashboard enrichment - EasyOrders failed, continuing with Taager-only data: ${enrichmentErr.message}`);
      }
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
      processed = processDashboardSheets(sheetOptions);
    } catch (sheetError) {
      if (!easyBuffer) throw sheetError;
      log(`Dashboard enrichment - EasyOrders parse failed, continuing with Taager-only data: ${sheetError.message}`);
      processed = processDashboardSheets({ ...sheetOptions, easyOrdersBuffer: null });
    }
    if (processed.enrichmentDiagnostics.status === "ok") {
      log(`Dashboard enrichment - EasyOrders named ${processed.enrichmentDiagnostics.productNameMatches || 0} rows, cache hits ${processed.enrichmentDiagnostics.cacheHits || 0}, learned ${processed.enrichmentDiagnostics.learnedSkuNames || 0} SKUs, and matched ${processed.enrichmentDiagnostics.paymentMatches || 0} payment rows`);
    }
    if (enrichmentError) {
      processed.enrichmentDiagnostics = Object.assign({}, processed.enrichmentDiagnostics, { error: enrichmentError });
    }

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
    process.send && process.send({ type: "error", error: err.message });
  } finally {
    await context.close();
  }
})();
