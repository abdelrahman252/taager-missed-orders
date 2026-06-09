"use strict";

const { chromium } = require("playwright-core");
const fs   = require("fs");
const os   = require("os");
const path = require("path");
const {
  launchPersistentChromeContext,
} = require("./chrome-launch");
const { formatPhone } = require("./phone");
const { resolveSafeTaagerExportRange } = require("./taager-date-range");
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

let parserFns = null;
let outputFns = null;

function parser() {
  if (!parserFns) parserFns = require("./parser");
  return parserFns;
}

function output() {
  if (!outputFns) outputFns = require("./output");
  return outputFns;
}

function buildOutputExcel(...args) {
  return output().buildOutputExcel(...args);
}

function buildFailedExcel(...args) {
  return output().buildFailedExcel(...args);
}

function buildSkippedExcel(...args) {
  return output().buildSkippedExcel(...args);
}


// ════════════════════════════════════════
// FILE HELPERS
// ════════════════════════════════════════

/**
 * Build a filename like: skipped-orders-user_example_com-2025-06-01_14-32.xlsx
 * Uses config.easyEmail (sanitised) + local timestamp so files never overwrite each other.
 */
function accountFileBase(prefix) {
  const email = (config.easyEmail || "account")
    .replace(/[<>:"/\\|?*\x00-\x1F@]/g, "_");
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${prefix}-${email}-${ts}.xlsx`;
}

/**
 * Return a file path that does not yet exist.
 * If `dir/filename` is already taken, appends -1, -2, … until free.
 */
function uniqueFilePath(dir, filename) {
  let p = path.join(dir, filename);
  if (!fs.existsSync(p)) return p;
  const ext  = path.extname(filename);
  const base = path.basename(filename, ext);
  let i = 1;
  while (fs.existsSync(p)) {
    p = path.join(dir, `${base}-${i++}${ext}`);
  }
  return p;
}

// ════════════════════════════════════════
// SESSION HELPERS
// ════════════════════════════════════════

// Returns true if the current page URL looks like a login/auth page.
function isOnLoginPage(url) {
  return (
    url.includes("/login") ||
    url.includes("/auth/login") ||
    url.includes("#/login") ||
    url.includes("/auth")
  );
}

// Takes a debug screenshot and logs its path.  Non-fatal — never throws.
async function debugScreenshot(page, label) {
  try {
    const ts   = Date.now();
    const p    = require("os").tmpdir() + `/kbot-debug-${label}-${ts}.png`;
    await page.screenshot({ path: p, fullPage: false });
    log(`📸 [DEBUG] Screenshot saved: ${p}`);
    process.send && process.send({ type: "debug-screenshot", path: p, label });
  } catch (_) {}
}

// SESSION GUARD
// Wraps any page action.
//  • Catches thrown errors AND checks URL after the action in case the SPA
//    silently redirected to login without raising an exception.
//  • On session loss: re-authenticates and retries the action once.
async function withSessionGuard(page, actionFn, reloginFn, siteName) {
  try {
    const result = await actionFn();
    // Proactive check: even if no error was thrown, verify we're not on the login page
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
      return await actionFn(); // retry once
    }

    throw err; // not a session issue — bubble up normally
  }
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
      if (!isNetworkNavigationError(error) || attempt >= attempts) {
        throw error;
      }
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
      if (!isNetworkNavigationError(error) || attempt >= attempts) {
        throw error;
      }
      log(`Network issue while reloading ${label} (${attempt}/${attempts}): ${error.message} - retrying in ${Math.round(waitMs / 1000)}s...`);
      await page.waitForTimeout(waitMs);
    }
  }
}

function friendlyErrorMessage(error) {
  const message = String(error && error.message || error || "");
  if (isNetworkNavigationError(message)) {
    return "INTERNET_ISSUE: Internet connection or website timeout. Please check your internet, restart the app, and launch the run again.";
  }
  return message;
}

// ════════════════════════════════════════
// FIND REAL CHROME
// ════════════════════════════════════════
function findChrome() {
  const { execSync } = require("child_process");
  if (process.platform === "win32") {
    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      (process.env.PROGRAMFILES || "") + "\\Google\\Chrome\\Application\\chrome.exe",
    ];
    for (const p of paths) if (fs.existsSync(p)) return p;
    try {
      const reg = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve',
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      const m = reg.match(/REG_SZ\s+(.+)/);
      if (m && fs.existsSync(m[1].trim())) return m[1].trim();
    } catch {}
  } else if (process.platform === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of paths) if (fs.existsSync(p)) return p;
  }
  throw new Error(
    "CHROME_NOT_FOUND: Google Chrome is not installed or could not be found on this device.\n" +
    "Please install Google Chrome from https://www.google.com/chrome/ and try again.\n" +
    "If Chrome is installed in a non-standard location, contact support."
  );
}

// ════════════════════════════════════════
// DATE HELPERS
// ════════════════════════════════════════
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function subtractDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d;
}

function formatDataDay(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

// ════════════════════════════════════════
// EASY-ORDERS CALENDAR PICKER
// ════════════════════════════════════════
async function pickDateInEasyOrdersCalendar(page, targetDt) {
  const targetMonth = targetDt.getMonth();
  const targetYear  = targetDt.getFullYear();
  const dayClass    = String(targetDt.getDate()).padStart(3, "0");
  const monthNamesEn = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthNamesAr = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

  await page.waitForSelector(".react-datepicker", { timeout: 8000 });
  await page.waitForTimeout(300);

  // Detect Hijri calendar and try to switch to Gregorian
  const HIJRI_MONTHS = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الثانية","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
  const headerText0 = await page.$eval(".react-datepicker__current-month", (el) => el.innerText.trim()).catch(() => "");
  const isHijri = HIJRI_MONTHS.some(hm => headerText0.includes(hm));
  if (isHijri) {
    log("⚠️ Calendar showing Hijri dates — switching to Gregorian (ميلادي)...");
    const toggled = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("button, span, div"))
        .filter(el => {
          const t = el.innerText || "";
          return t.includes("ميلادي") || t.includes("م") || t.includes("Gregorian");
        });
      if (candidates.length > 0) { candidates[0].click(); return true; }
      return false;
    });
    if (toggled) {
      await page.waitForTimeout(800);
      log("✅ Switched to Gregorian calendar");
    } else {
      log("⚠️ No Gregorian toggle found — will navigate using Arabic month names");
    }
  }

  // Navigate to the correct month — handles both English and Arabic headers
  for (let i = 0; i < 24; i++) {
    const headerText = await page.$eval(".react-datepicker__current-month", (el) => el.innerText.trim()).catch(() => "");
    const parts = headerText.trim().split(/\s+/);

    let shownMonth = monthNamesEn.indexOf(parts[0]);
    if (shownMonth === -1) shownMonth = monthNamesAr.indexOf(parts[0]);

    // Year is the last 4-digit token in the header
    const yearToken = parts.find(p => /^\d{4}$/.test(p));
    const shownYear = yearToken ? parseInt(yearToken) : NaN;

    if (!isNaN(shownYear) && shownYear === targetYear && shownMonth === targetMonth) break;

    const shownTotal  = isNaN(shownYear) ? -1 : shownYear * 12 + shownMonth;
    const targetTotal = targetYear * 12 + targetMonth;

    if (shownTotal === -1 || targetTotal < shownTotal) await page.click(".react-datepicker__navigation--previous");
    else                                                await page.click(".react-datepicker__navigation--next");
    await page.waitForTimeout(300);
  }

  await page.click(`.react-datepicker__day--${dayClass}:not(.react-datepicker__day--outside-month)`);
  await page.waitForTimeout(400);
  log(`✅ Easy-orders calendar: ${targetDt.toDateString()}`);
}

// ════════════════════════════════════════
// TAAGER CALENDAR PICKER
// ════════════════════════════════════════
async function pickDateInTaagerCalendarLegacy(page, targetDt) {
  const targetDataDay = formatDataDay(targetDt);
  log(`📅 Taager calendar -> ${targetDataDay}`);

  await page.waitForSelector('[role="grid"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  for (let i = 0; i < 24; i++) {
    if ((await page.locator(`[data-day="${targetDataDay}"]`).count()) > 0) break;

    const firstCell = await page.locator("[data-day]").first().getAttribute("data-day").catch(() => null);
    if (!firstCell) break;

    const goBack = new Date(targetDataDay) < new Date(firstCell);
    if (goBack) {
      const ok = await page.locator('button[name="previous-month"]').click().then(() => true).catch(() => false);
      if (!ok) await page.locator('[role="grid"]').locator("..").locator("button").first().click();
    } else {
      const ok = await page.locator('button[name="next-month"]').click().then(() => true).catch(() => false);
      if (!ok) await page.locator('[role="grid"]').locator("..").locator("button").last().click();
    }
    await page.waitForTimeout(300);
  }

  await page.locator(`[data-day="${targetDataDay}"] button`).click();
  await page.waitForTimeout(400);
  log(`✅ Taager calendar: ${targetDataDay}`);
}

// ════════════════════════════════════════
// Robust Taager calendar picker for the current Radix/DayPicker markup.
// The calendar renders outside-month filler days, so month navigation must use
// only in-month cells and the real nav buttons.
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

async function pickDateInTaagerCalendar(page, targetDt) {
  const targetDataDay = formatDataDay(targetDt);
  log(`Taager calendar -> ${targetDataDay}`);

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
      log(`Taager calendar selected: ${targetDataDay}`);
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

// EASY-ORDERS EXPORT TRIGGER
//
// Flow: trigger export → Easy-Orders auto-redirects to notifications →
//       reload once → grab the FIRST card matching keyword by text content.
// ════════════════════════════════════════
async function triggerEasyOrdersExport(page, exportFromDate, keyword) {
  const MAX_ATTEMPTS = 3;
  const COOLDOWN_MS  = 6 * 60 * 1000; // Easy-Orders rate limit: ~1 export per 5 min

  const pageUrl = keyword === "missed-orders"
    ? "https://app.easy-orders.net/#/missed-orders"
    : "https://app.easy-orders.net/#/orders";

  // After a reload, grab the href of the FIRST card whose text matches `keyword`.
  // Text-based classification — never relies on filename suffix.
  const grabFirstMatchingCard = async () => {
    return await page.evaluate(({ keyword }) => {
      function shortText(el) {
        return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
      }
      function cardKind(text) {
        const t = String(text || "").toLowerCase();
        const missed =
          t.includes("missed orders report") ||
          t.includes("missed order report") ||
          t.includes("تقرير الطلبات الفائتة") ||
          t.includes("طلبات فائتة");
        if (missed) return "missed-orders";
        const orders =
          t.includes("ملف اكسل للطلبات") ||
          t.includes("ملف إكسل للطلبات") ||
          t.includes("انشاء ملف اكسل") ||
          t.includes("إنشاء ملف إكسل") ||
          t.includes("orders exported") ||
          t.includes("orders export") ||
          t.includes("created orders excel");
        return orders ? "orders" : "";
      }

      const rows = Array.from(document.querySelectorAll("tr, [role='row'], li"));
      for (const row of rows) {
        const text = shortText(row);
        if (cardKind(text) !== keyword) continue;
        const links = Array.from(row.querySelectorAll('a[href*=".xlsx"], a[href*="/excel/"]'));
        const fileLink = links.find(a => (a.href || "").startsWith("https://"));
        if (fileLink) {
          return { href: fileLink.href, text };
        }
      }
      return null;
    }, { keyword });
  };

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    log(`\n📤 Export attempt ${n}/${MAX_ATTEMPTS} for "${keyword}"...`);

    // ── 1. Navigate to the orders/missed-orders page ──
    log(`[NAV] → ${pageUrl}`);
    await gotoWithNetworkRetries(page, pageUrl, `Easy-Orders ${keyword} page`);
    await page.waitForTimeout(1500);

    const landedUrl = page.url();
    log(`[NAV] landed: ${landedUrl} | title: ${await page.title().catch(() => "?")}`);

    // ── Session probe ──
    try {
      await assertEasyOrdersSession(page);
    } catch (sessionErr) {
      log(`⚠️ Easy-Orders SESSION_DESYNC before export: ${sessionErr.message}`);
      await debugScreenshot(page, `easy-orders-export-session-fail-${n}`);
      await phase1_easyOrdersLogin(page);
      await gotoWithNetworkRetries(page, pageUrl, `Easy-Orders ${keyword} page after re-login`);
      await page.waitForTimeout(1500);
      const switchedDesync = await ensureEasyOrdersEnglish(page);
      if (switchedDesync) await page.waitForTimeout(2000);
    }

    const switchedLang = await ensureEasyOrdersEnglish(page);
    if (switchedLang) {
      log("⏳ Language switched — waiting for page to re-render...");
      await page.waitForTimeout(2000);
    }

    // ── Wait for table + export button (retry up to 3 page reloads) ──
    for (let reload = 1; reload <= 3; reload++) {
      try {
        await page.waitForSelector("table", { timeout: 15000 });
        await page.waitForSelector('.RaList-main button:has-text("Export"), main button:has-text("Export"), button:has-text("Export")', { timeout: 15000 });
        break;
      } catch (e) {
        log(`⚠️ Page not ready (reload ${reload}/3): ${e.message}`);
        if (reload < 3) {
          log(`🔄 Reloading page and trying again...`);
          await gotoWithNetworkRetries(page, pageUrl, `Easy-Orders ${keyword} reload`);
          await page.waitForTimeout(4000);
          const switched2 = await ensureEasyOrdersEnglish(page);
          if (switched2) await page.waitForTimeout(2000);
        } else {
          throw new Error(`Export page failed to load after 3 reloads for "${keyword}": ${e.message}`);
        }
      }
    }

    // ── 2. Open the export dialog ──
    // The Export button is MuiButton-outlined (Create Order is MuiButton-contained, an <a> tag).
    // This is the most specific stable selector we can use without relying on dynamic class hashes.
    log(`🖱️ Clicking page-level Export button to open dialog...`);
    const pageExportBtn = page.locator('button.MuiButton-outlined:has-text("Export")').first();
    await pageExportBtn.waitFor({ state: "visible", timeout: 10000 });
    const pageExportText = await pageExportBtn.innerText().catch(() => "?");
    log(`   Found page Export button — text: "${pageExportText.replace(/\s+/g, " ").trim()}" — clicking`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
    await pageExportBtn.click();
    await page.waitForTimeout(1500);

    // ── 3. Interact with the export dialog ──
    // MUST use state:"visible" — "attached" (the default) passes even for hidden dialogs
    // that React keeps in the DOM from a previous render cycle.
    log(`⏳ Waiting for export dialog to become visible...`);
    const dialog = page.locator('div[role="dialog"]').first();
    try {
      await dialog.waitFor({ state: "visible", timeout: 8000 });
    } catch {
      // Dialog did not appear — take a screenshot so we can see what went wrong
      await debugScreenshot(page, `export-dialog-not-visible-${keyword}-${n}`);
      throw new Error(`Export dialog did not appear after clicking Export button (keyword="${keyword}", attempt=${n})`);
    }

    const dialogTitle = await dialog.locator('h2, .MuiDialogTitle-root').innerText().catch(() => "?");
    log(`✅ Dialog is VISIBLE — title: "${dialogTitle.trim()}"`);

    // Confirm date inputs are visible inside the dialog
    const dateInputs = dialog.locator('.react-datepicker-wrapper input');
    const dateInputCount = await dateInputs.count();
    log(`   Date inputs in dialog: ${dateInputCount}`);

    const startValBefore = await dateInputs.first().inputValue().catch(() => "?");
    log(`   Start date current value: "${startValBefore}"`);

    // Click start date input and pick the date
    log(`🗓️ Clicking start date input...`);
    await dateInputs.first().click();
    await page.waitForTimeout(500);
    log(`🗓️ Picking start date: ${formatDataDay(exportFromDate)}`);
    await pickDateInEasyOrdersCalendar(page, exportFromDate);

    // DO NOT press Escape here — MUI dialogs listen for Escape and will close the whole dialog.
    // Clicking a date in the calendar already closes the calendar popup automatically.
    // Click the dialog title (h2) as a safe fallback to dismiss any lingering calendar overlay
    // without risking closing the dialog itself.
    await dialog.locator('h2').click().catch(() => {});
    await page.waitForTimeout(500);

    // Confirm start date was set
    const startValAfter = await dateInputs.first().inputValue().catch(() => "?");
    log(`✅ Start date set — value now: "${startValAfter}"`);

    // End date defaults to today — read and log it for debugging
    if (dateInputCount >= 2) {
      const endVal = await dateInputs.nth(1).inputValue().catch(() => "?");
      log(`   End date (default): "${endVal}"`);
    }

    // Verify the dialog is still open before clicking Export
    const dialogStillVisible = await dialog.isVisible().catch(() => false);
    if (!dialogStillVisible) {
      await debugScreenshot(page, `dialog-closed-before-export-btn-${keyword}-${n}`);
      throw new Error(`Dialog was closed before clicking the Export button — Escape may have dismissed it (keyword="${keyword}", attempt=${n})`);
    }

    // ── 4. Click the Export button inside the dialog ──
    const dialogExportBtn = dialog.locator('.MuiDialogActions-root button');
    await dialogExportBtn.waitFor({ state: "visible", timeout: 5000 });
    const dialogExportText = await dialogExportBtn.innerText().catch(() => "?");
    log(`🖱️ Dialog action button found — text: "${dialogExportText.replace(/\s+/g, " ").trim()}" — clicking...`);
    await dialogExportBtn.click();

    const triggeredAt = Date.now();
    log(`⏱️ Export button clicked at ${new Date(triggeredAt).toISOString()}`);

    // ── 5. Verify export was submitted — dialog must close ──
    log(`⏳ Waiting for dialog to close (confirms export was submitted)...`);
    try {
      await dialog.waitFor({ state: "hidden", timeout: 8000 });
      log(`✅ Dialog closed — export successfully submitted ✅`);
    } catch {
      // Dialog still open — might be a rate-limit message or error inside it
      const dialogBody = await dialog.innerText().catch(() => "");
      log(`⚠️ Dialog did NOT close after 8s — content: "${dialogBody.replace(/\s+/g, " ").trim().slice(0, 200)}"`);
      await debugScreenshot(page, `dialog-not-closed-${keyword}-${n}`);
      // Press Escape to dismiss and let the retry loop handle it
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(1000);
    }

    // ── 6. Check toast — detect rate limit before touching notifications ──
    await page.waitForTimeout(1000);
    const toastEl = await page.locator('[role="alert"], .MuiSnackbarContent-root, .Toastify__toast').innerText().catch(() => null);
    const toastText = toastEl ? toastEl.trim().replace(/\s+/g, " ") : "";

    const isRateLimited = toastText.includes("5 minutes") ||
                          toastText.includes("5 دقائق")   ||
                          toastText.includes("every")      ||
                          toastText.includes("abuse");

    if (toastText) {
      log(`📢 Toast: "${toastText}"`);
    } else {
      log(`   No toast detected`);
    }

    if (isRateLimited) {
      // Export was NOT submitted — grabbing a card now would return an old one. Skip.
      log(`⚠️ Rate limit confirmed — export did NOT create a new file. Skipping notification grab.`);
    } else {
      // ── 7. Ensure we are on the notifications page ──
      await page.waitForTimeout(1500);
      const urlAfterExport = page.url();
      log(`[NAV] URL after export: ${urlAfterExport}`);
      if (!urlAfterExport.includes("notifications")) {
        log(`[NAV] Not redirected automatically — navigating to notifications...`);
        await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/notifications", "Easy-Orders notifications");
        await page.waitForTimeout(1000);
        const switchedNotif = await ensureEasyOrdersEnglish(page);
        if (switchedNotif) await page.waitForTimeout(2000);
      } else {
        log(`[NAV] Easy-Orders redirected to notifications automatically ✅`);
      }

      // ── 8. Two guaranteed reloads before grabbing ──
      log(`🔄 Reload #1 of notifications...`);
      await reloadWithNetworkRetries(page, "Reload #1 of notifications", { attempts: 3, timeout: 30000, waitMs: 5000 });
      await page.waitForTimeout(2500);
      const switchedR1 = await ensureEasyOrdersEnglish(page);
      if (switchedR1) await page.waitForTimeout(2000);
      log(`✅ Reload #1 done — URL: ${page.url()}`);

      log(`🔄 Reload #2 of notifications...`);
      await reloadWithNetworkRetries(page, "Reload #2 of notifications", { attempts: 3, timeout: 30000, waitMs: 5000 });
      await page.waitForTimeout(2500);
      const switchedR2 = await ensureEasyOrdersEnglish(page);
      if (switchedR2) await page.waitForTimeout(2000);
      log(`✅ Reload #2 done — URL: ${page.url()}`);

      // ── 9. Grab the first matching card ──
      log(`🔍 Scanning notifications for first "${keyword}" card...`);
      const result = await grabFirstMatchingCard();
      if (result) {
        log(`✅ "${keyword}" card FOUND ✅`);
        log(`   Card text: "${result.text.slice(0, 120)}"`);
        log(`   Card URL:  ${result.href}`);
        // Notify parent process of successful export completion
        process.send && process.send({ type: "export-timestamp", timestamp: Date.now() });
        return result.href;
      }
      log(`⚠️ No "${keyword}" card found after 2 reloads — will wait cooldown and retry`);
    }

    // ── Rate limit / card not found — wait cooldown then retry ──
    if (n < MAX_ATTEMPTS) {
      const elapsed   = Date.now() - triggeredAt;
      const remaining = Math.max(0, COOLDOWN_MS - elapsed);
      const waitSecs  = Math.ceil(remaining / 1000);

      log(`\n⚠️ Export not ready after reloads — rate limit likely.`);
      log(`⏸️  Cooling down for ${waitSecs}s before re-triggering...`);
      process.send && process.send({ type: "cooldown", seconds: waitSecs, attempt: n, maxAttempts: MAX_ATTEMPTS });

      let left = remaining;
      while (left > 0) {
        const tick = Math.min(10000, left);
        await page.waitForTimeout(tick);
        left -= tick;
        if (left > 0) log(`⏳ Re-triggering in ${Math.ceil(left / 1000)}s...`);
      }
      log(`🔄 Cooldown done — re-triggering export now\n`);
    }
  }
  throw new Error(`Export failed after ${MAX_ATTEMPTS} attempts for "${keyword}"`);
}

// ════════════════════════════════════════
// DOWNLOAD URL TO BUFFER
// ════════════════════════════════════════
async function downloadToBuffer(page, url) {
  const MAX_DL_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_DL_ATTEMPTS; attempt++) {
    try {
      const response = await page.context().request.get(url, { timeout: 60000 });
      const body     = await response.body();
      return Buffer.from(body);
    } catch (e) {
      if (isNetworkNavigationError(e) && attempt < MAX_DL_ATTEMPTS) {
        log(`File download failed (attempt ${attempt}/${MAX_DL_ATTEMPTS}): ${e.message} - retrying in 8s...`);
        await new Promise(r => setTimeout(r, 8000));
      } else {
        throw e;
      }
    }
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentityText(value) {
  return String(value || "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u200E\u200F\u061C]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeAffiliateCode(value) {
  return String(value || "").replace(/[^\dA-Za-z_-]/g, "").trim();
}

function assertIdentityMatch(site, expectedLabel, expected, actual) {
  if (expected !== actual) {
    throw new Error(`${site}_IDENTITY_MISMATCH: expected ${expectedLabel} "${expected}", detected "${actual || "unknown"}"`);
  }
}

async function collectEasyOrdersIdentityEmails(page) {
  return await page.evaluate(() => {
    const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
    const hits = [];
    const seen = new Set();

    function add(source, text) {
      if (text === undefined || text === null) return;
      const value = String(text);
      const decoded = (() => {
        try { return decodeURIComponent(value); } catch { return ""; }
      })();
      const matches = `${value} ${decoded}`.match(EMAIL_RE) || [];
      for (const raw of matches) {
        const email = raw.trim().toLowerCase();
        const key = `${source}|${email}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({ source, email });
        }
      }
    }

    function decodeBase64Url(value) {
      try {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
        return decodeURIComponent(
          Array.from(atob(padded), c => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
        );
      } catch {
        try {
          const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
          return atob(padded);
        } catch {
          return "";
        }
      }
    }

    function scanJwt(source, text) {
      const value = String(text || "");
      const tokens = value.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
      for (const token of tokens) {
        const parts = token.split(".");
        if (parts.length >= 2) add(`${source}:jwt`, decodeBase64Url(parts[1]));
      }
    }

    add("document", document.body ? document.body.innerText : "");
    add("title", document.title || "");
    for (const el of Array.from(document.querySelectorAll("[title], [aria-label], [alt], [data-user], [data-email], [href]"))) {
      add("dom-attr", [
        el.getAttribute("title"),
        el.getAttribute("aria-label"),
        el.getAttribute("alt"),
        el.getAttribute("data-user"),
        el.getAttribute("data-email"),
        el.getAttribute("href"),
      ].filter(Boolean).join(" "));
    }

    for (const storage of [localStorage, sessionStorage]) {
      const storageName = storage === localStorage ? "localStorage" : "sessionStorage";
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        const value = storage.getItem(key);
        add(storageName, `${key || ""} ${value || ""}`);
        scanJwt(storageName, `${key || ""} ${value || ""}`);
      }
    }

    add("cookie", document.cookie || "");
    scanJwt("cookie", document.cookie || "");

    return hits;
  });
}

async function revealEasyOrdersIdentityMenu(page) {
  const selectors = [
    'button[aria-label="app_bar.user_settings"]',
    '[data-testid="user-avatar"]',
    'button:has(.MuiAvatar-root)',
    '.MuiAvatar-root',
    '.MuiAppBar-root button[aria-label*="account" i]',
    '.MuiAppBar-root button[aria-label*="user" i]',
    '.MuiToolbar-root button:has([data-testid="AccountCircleIcon"])',
  ];

  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.count().catch(() => 0)) {
      try {
        await target.click({ timeout: 1200 });
        await page.waitForTimeout(800);
        return true;
      } catch {}
    }
  }
  return false;
}

async function readEasyOrdersCurrentStore(page, expectedEmail) {
  // Do not use generated MUI class names like "muiltr-new-*".
  // They are build-generated and can change anytime; use aria-labels, text, roles, and stable structure only.
  await revealEasyOrdersIdentityMenu(page);
  await page.waitForTimeout(500);
  try {
    return await page.evaluate((email) => {
      const normalize = (value) => String(value || "")
        .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
        .replace(/[\u200E\u200F\u061C]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const expectedEmail = normalize(email);
      const texts = Array.from(document.querySelectorAll('[role="presentation"] p, [role="presentation"] span, [class*="MuiPopover-paper"] p, [class*="MuiPopover-paper"] span'))
        .map(el => (el.innerText || el.textContent || "").trim())
        .filter(Boolean);
      const emailIndex = texts.findIndex(text => normalize(text) === expectedEmail);
      if (emailIndex > 0) return normalize(texts[emailIndex - 1]);
      const storeHeadingIndex = texts.findIndex(text => normalize(text).replace(/:$/, "") === "stores");
      if (storeHeadingIndex >= 0) {
        const candidate = texts.slice(storeHeadingIndex + 1).find(text => !/@/.test(text) && normalize(text) !== "add store");
        if (candidate) return normalize(candidate);
      }
      return "";
    }, expectedEmail);
  } finally {
    // The store/account popover can sit above the page and intercept the next Export click.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300).catch(() => {});
  }
}

async function verifyEasyOrdersIdentity(page, where = "session") {
  const expected = normalizeEmail(config.easyEmail);
  const expectedStore = normalizeIdentityText(config.easyStore);
  if (!expected) {
    throw new Error("EASY_ORDERS_IDENTITY_CONFIG_MISSING: easyEmail is not set");
  }
  if (!expectedStore) {
    throw new Error("EASY_ORDERS_STORE_CONFIG_MISSING: easyStore is required for this licensed account slot");
  }

  let hits = await collectEasyOrdersIdentityEmails(page).catch(() => []);
  let detected = [...new Set(hits.map(h => normalizeEmail(h.email)).filter(Boolean))];

  if (!detected.includes(expected)) {
    const opened = await revealEasyOrdersIdentityMenu(page).catch(() => false);
    if (opened) {
      const menuHits = await collectEasyOrdersIdentityEmails(page).catch(() => []);
      hits = [...hits, ...menuHits];
      detected = [...new Set(hits.map(h => normalizeEmail(h.email)).filter(Boolean))];
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  if (detected.includes(expected)) {
    const sources = [...new Set(hits.filter(h => normalizeEmail(h.email) === expected).map(h => h.source))].join(", ") || "page";
    const currentStore = await readEasyOrdersCurrentStore(page, expected).catch(() => "");
    log(`[IDENTITY][Easy-Orders] expected email=${expected}, expected store=${expectedStore}, detected emails=${detected.join(", ") || "none"}, detected store=${currentStore || "unknown"}, where=${where}`);
    if (currentStore !== expectedStore) {
      await debugScreenshot(page, `easy-orders-store-mismatch-${where}`);
    }
    assertIdentityMatch("EASY_ORDERS", "store", expectedStore, currentStore);
    log(`✅ Easy-Orders identity verified: ${expected} (${sources})`);
    process.send && process.send({ type: "session-event", site: "easy-orders", event: "identity-verified", email: expected, store: config.easyStore, where });
    return true;
  }

  await debugScreenshot(page, `easy-orders-identity-${where}`);

  if (detected.length > 0) {
    throw new Error(`EASY_ORDERS_IDENTITY_MISMATCH: expected ${expected}, detected ${detected.join(", ")}`);
  }

  throw new Error(`EASY_ORDERS_IDENTITY_UNVERIFIED: expected ${expected}, but no Easy-Orders email was visible in page/storage/cookies`);
}

// ════════════════════════════════════════
// PHASE 1 — EASY-ORDERS LOGIN
// Selectors from real HTML:
//   Email:    #username  (type=email, name=username)
//   Password: #password  (type=password, name=password)
//   Button:   button[type="submit"]  text="تسجيل الدخول"
// ════════════════════════════════════════
async function phase1_easyOrdersLogin(page) {
  return easyOrdersFlow.login(page);
  /* Legacy inline implementation retained temporarily for reference. */
  log("\n═══════════════════════════════════════");
  log("  PHASE 1 — Easy-Orders Login");
  log("═══════════════════════════════════════\n");

  // Navigate to app root — if already logged in it redirects to dashboard/orders
  log(`[NAV] → https://app.easy-orders.net/`);
  await gotoWithNetworkRetries(page, "https://app.easy-orders.net/", "Easy-Orders root");
  await page.waitForTimeout(2000);

  const landedUrl = page.url();
  log(`[NAV] landed: ${landedUrl} | title: ${await page.title().catch(() => "?")}`);

  // ── Session probe on the persisted browser profile ──
  // Even if the URL looks authenticated, verify a real post-auth DOM element
  // before skipping login.  Prevents stale/revoked cookie false positives.
  const alreadyLoggedIn = !landedUrl.includes("login");
  if (alreadyLoggedIn) {
    // Give SPA extra time to hydrate before probing DOM
    await page.waitForTimeout(1500);
    const authDomPresent = await page.$(
      '.MuiAppBar-root, [aria-label="language-switcher"], [data-testid="user-avatar"], ' +
      '[class*="Dashboard"], [class*="OrderList"], .MuiDrawer-root, .MuiCard-root'
    ) !== null;
    if (authDomPresent) {
      log("✅ Easy-orders: already logged in (URL + DOM verified), skipping login\n");
      process.send && process.send({ type: "session-event", site: "easy-orders", event: "session-reused", method: "dom-verified", url: landedUrl });
    } else {
      log("⚠️ Easy-orders: URL looks authenticated but auth DOM not found — SESSION_PROBE failed, re-logging in");
      process.send && process.send({ type: "session-event", site: "easy-orders", event: "session-probe-failed", url: landedUrl });
      await debugScreenshot(page, "easy-orders-probe-fail");
      // Fall through to login block below
      await doEasyOrdersLogin(page);
    }
  } else {
    log("🔐 Easy-orders: session expired, logging in...");
    await doEasyOrdersLogin(page);
  }

  // ── Switch to English FIRST — before store selection and everything else ──
  await ensureEasyOrdersEnglish(page);

  // ── Store selection (if user has multiple stores) ──
  await page.waitForTimeout(1500);
  if (page.url().includes("store-selection")) {
    log("🏪 Store selection page detected...");

    const storeName = (config.easyStore || "").trim().toLowerCase();
    const cards = page.locator('.MuiCard-root');
    const count = await cards.count();

    if (!storeName) {
      throw new Error("EASY_ORDERS_STORE_CONFIG_MISSING: easyStore is required for this licensed account slot");
    } else {
      log(`🔍 Looking for store: "${config.easyStore}"`);

      let found   = false;

      for (let i = 0; i < count; i++) {
        const card     = cards.nth(i);
        const nameEl   = card.locator('h6');
        const cardName = (await nameEl.innerText().catch(() => "")).trim().toLowerCase();

        if (normalizeIdentityText(cardName) === normalizeIdentityText(storeName)) {
          log(`✅ Found store: "${cardName}" — clicking`);
          await card.click();
          found = true;
          break;
        }
      }

      if (!found) {
        throw new Error(`Store "${config.easyStore}" was not found in the store selection list!`);
      }
    }

    await page.waitForFunction(
      () => !window.location.href.includes("store-selection"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1500);
    log("✅ Store selected\n");

    await ensureEasyOrdersEnglish(page);
  }

  await verifyEasyOrdersIdentity(page, "phase1");
}

// ════════════════════════════════════════
// EASY-ORDERS LOGIN — INNER IMPLEMENTATION
// Separated so it can be called from both the "not logged in" and "probe failed" paths.
// ════════════════════════════════════════
async function doEasyOrdersLogin(page) {
  // Navigate to login page
  log(`[NAV] → https://app.easy-orders.net/#/login`);
  await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/login", "Easy-Orders login");

  // SPA needs time to mount the login form — wait for the actual input, not just DOM ready
  try {
    await page.waitForSelector('#username', { timeout: 15000 });
  } catch {
    log("⚠️ Login form didn't mount — reloading...");
    await reloadWithNetworkRetries(page, "Easy-Orders login page");
    await page.waitForSelector('#username', { timeout: 15000 });
  }

  await page.waitForTimeout(800);

  try {
    await page.fill('#username', '');
    await page.waitForTimeout(200);
    await page.fill('#username', config.easyEmail);
    await page.waitForTimeout(400);

    await page.fill('#password', '');
    await page.waitForTimeout(200);
    await page.fill('#password', config.easyPassword);
    await page.waitForTimeout(500);

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.waitFor({ state: "visible", timeout: 5000 });
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    if (isDisabled) {
      log("⚠️ Submit button is disabled — waiting for it to enable...");
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]')?.disabled,
        { timeout: 8000 }
      );
    }

    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    // Log submission — note: this only means the form was submitted, NOT that login succeeded
    log("✅ Easy-orders: credentials SUBMITTED (awaiting server confirmation...)");
  } catch (e) {
    log(`⚠️ Easy-orders login form error: ${e.message}`);
  }

  // 2FA signal + wait loop
  process.send && process.send({ type: "2fa-needed" });
  log("⏳ If 2FA is required, complete it in the browser (5 min max)...");

  const maxWait = 5 * 60 * 1000;
  const started = Date.now();
  let confirmed = false;

  while (Date.now() - started < maxWait) {
    await page.waitForTimeout(3000);
    const currentUrl   = page.url();
    const currentTitle = await page.title().catch(() => "");
    log(`[NAV] ${Math.round((Date.now() - started) / 1000)}s — url: ${currentUrl} | title: ${currentTitle}`);

    if (!currentUrl.includes("login")) {
      // Give SPA extra time to hydrate before checking DOM
      await page.waitForTimeout(1500);
      // URL moved off login — now perform DOM verification before declaring success
      // Use MuiAppBar which only appears in the authenticated dashboard, not the login page
      const authDomPresent = await page.$(
        '.MuiAppBar-root, [aria-label="language-switcher"], [class*="Dashboard"], ' +
        '[class*="OrderList"], .MuiDrawer-root, .MuiCard-root'
      ) !== null || currentUrl.includes("store-selection");
      if (authDomPresent) {
        confirmed = true;
        log(`✅ Easy-orders: login CONFIRMED (URL + DOM verified) — url: ${currentUrl} | title: ${currentTitle}`);
        process.send && process.send({ type: "session-event", site: "easy-orders", event: "login-confirmed", method: "dom-verified", url: currentUrl });
        await debugScreenshot(page, "easy-orders-login-confirmed");
        break;
      }
      log(`⏳ URL left login but auth DOM not yet present — waiting for SPA hydration...`);
    }
  }

  if (!confirmed) {
    await debugScreenshot(page, "easy-orders-login-timeout");
    throw new Error("Easy-orders login timeout after 5 minutes");
  }
  log("✅ Easy-orders login confirmed\n");
}

// ════════════════════════════════════════
// SWITCH EASY-ORDERS TO ENGLISH
// Must run BEFORE any export/navigation that depends on English button text.
// Called immediately after login (and after store selection if applicable).
// Returns true if a language switch was performed (caller may want to re-wait for render).
// ════════════════════════════════════════
async function ensureEasyOrdersEnglish(page) {
  try {
    // If switcher not in DOM yet (slow client), retry up to 3 times with short waits
    let langLabel = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      langLabel = await page.$eval(
        '[aria-label="language-switcher"] p',
        (el) => el.innerText.trim()
      ).catch(() => null);

      if (langLabel !== null) break;
      if (attempt < 2) {
        log(`⏳ Language switcher not found yet (attempt ${attempt + 1}/3) — waiting...`);
        await page.waitForTimeout(1500);
      }
    }

    if (langLabel === null) {
      log("⚠️ Language switcher not found after retries — continuing anyway");
      return false;
    }

    if (langLabel !== "en") {
      log("🌐 Easy-orders switched to non-English — forcing English...");
      await page.click('[aria-label="language-switcher"]');
      await page.waitForTimeout(800);
      const clicked =
        await page.locator('[role="menuitem"][aria-label="english"]').click().then(() => true).catch(() => false) ||
        await page.locator('[role="menuitem"]:has-text("English")').click().then(() => true).catch(() => false) ||
        await page.locator('[role="menuitem"]:has-text("en")').click().then(() => true).catch(() => false);
      if (clicked) {
        await page.waitForTimeout(1500);
        log("✅ Switched back to English");
        return true; // caller should re-wait for page re-render
      } else {
        log("⚠️ Could not find English menu item — continuing anyway");
        await page.keyboard.press("Escape");
      }
    }
  } catch (e) {
    log(`⚠️ Language check error: ${e.message}`);
  }
  return false;
}

// ════════════════════════════════════════
// PHASE 2 — REAL ORDERS EXPORT
// ════════════════════════════════════════
async function phase2_realOrders(page, exportFromDate) {
  log("\n═══════════════════════════════════════");
  log("  PHASE 2 — Real Orders Export");
  log("═══════════════════════════════════════\n");

  const buffer = await easyOrdersFlow.exportReport(page, exportFromDate, "orders");
  log(`✅ Real orders downloaded: ${buffer.length} bytes`);
  return buffer;
}

// ════════════════════════════════════════
// PHASE 3 — MISSED ORDERS EXPORT
// ════════════════════════════════════════
async function phase3_missedOrders(page, exportFromDate) {
  log("\n═══════════════════════════════════════");
  log("  PHASE 3 — Missed Orders Export");
  log("═══════════════════════════════════════\n");

  const buffer = await easyOrdersFlow.exportReport(page, exportFromDate, "missed-orders");
  log(`✅ Missed orders downloaded: ${buffer.length} bytes`);
  return buffer;
}

// ════════════════════════════════════════
// PHASE 4 - legacy affiliate disabled (Taager is the active affiliate)
//
// URL: legacy affiliate disabled
// Orders: legacy affiliate disabled
//
// Export flow (with full fallback/retry):
//   1. Login if needed
//   2. Navigate to orders list
//   3. Pick date range via flatpickr
//   4. Click فلترة (filter button)
//   5. Click استخراج اكسل (export button) → wait for download
//
// If ANY step fails → full page reload + restart from step 2.
// Retries: legacy disabled block only; active Taager retries live below.
// ════════════════════════════════════════
/*
const MAX_LEGACY_AFFILIATE_ATTEMPTS  = 5;
const TAAGER_RETRY_WAIT_MS = 6 * 60 * 1000; // 6 min (matches existing cooldown)

async function legacyAffiliateLogin_DISABLED(page) {
  log(`[NAV] -> legacy affiliate disabled`);
  await page.goto("about:blank", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const landedUrl   = page.url();
  const landedTitle = await page.title().catch(() => "?");
  log(`[NAV] landed: ${landedUrl} | title: ${landedTitle}`);

  // ── SESSION PROBE — verify URL + DOM before skipping login ──
  // URL check alone is unreliable: a stale/expired cookie in the persistent profile
  // can redirect away from /auth/login momentarily before the server invalidates it.
  const urlLooksAuthenticated = !landedUrl.includes("/auth/login") && !landedUrl.includes("/login");
  if (urlLooksAuthenticated) {
    // Use specific post-auth selectors only — generic nav/main/sidebar also exist on login page
    const authDomPresent = await page.evaluate(() => {
      // Legacy affiliate session probe disabled.
      const specific = [
        'a[href*="/legacy-affiliate-disabled"]',
        'a[href*="/legacy-affiliate-disabled"]',
        '[class*="affiliate-header"]',
        '[data-affiliate-id]',
        '[data-user]',
        '.user-dropdown',
        // The welcome bar visible in screenshot: "Welcome massage for affiliate ..."
        '[class*="welcome"]',
        // Avatar/profile in topbar that only appears post-login
        'header img[alt*="user"], header img[alt*="avatar"], header .avatar',
        // Statistics link that appears in the nav after login (see screenshot)
        'a[href*="statistics"]',
      ];
      return specific.some(sel => document.querySelector(sel) !== null);
    });
    if (authDomPresent) {
      log("Legacy affiliate disabled: already logged in (URL + DOM verified)");
      process.send && process.send({ type: "session-event", site: "taager", event: "session-reused", method: "dom-verified", url: landedUrl });
      return;
    }
    // URL moved but no auth DOM — stale cookie / redirect loop
    log("Legacy affiliate disabled: URL looks authenticated but auth DOM not found");
    process.send && process.send({ type: "session-event", site: "taager", event: "session-probe-failed", url: landedUrl });
    await debugScreenshot(page, "taager-probe-fail");
    // Clear sessionStorage to evict any stale client-side auth state
    await page.evaluate(() => { try { sessionStorage.clear(); } catch (_) {} });
    // Navigate to login page explicitly
    await page.goto("about:blank", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
  }

  const method = config.taagerLoginMethod || "email";
  log(`Legacy affiliate disabled: logging in via ${method}...`);

  // ── Validate required credentials before touching the form ──
  if (method === "google") {
    process.send && process.send({ type: "google-login-needed" });
    log("Legacy affiliate disabled: Google login required - please complete it in Chrome.");
  } else if (method === "phone" && !config.taagerPhone) {
    throw new Error("Legacy affiliate login method is 'phone' but taagerPhone is not set in config");
  }
  if (method !== "google" && method !== "phone" && !config.taagerEmail) {
    throw new Error("Legacy affiliate login method is 'email' but taagerEmail is not set in config");
  }

  // ── Fill credentials with reload fallback ──
  if (method !== "google") {
    for (let loginAttempt = 1; loginAttempt <= 3; loginAttempt++) {
      try {
        if (method === "phone") {
          await page.waitForSelector('input[name="phone"], input[name="phoneNumber"]', { timeout: 10000 });
          await page.fill('input[name="phone"], input[name="phoneNumber"]', config.taagerPhone);
          await page.waitForTimeout(400);
          await page.fill('input[name="password"]', config.taagerPassword);
          await page.waitForTimeout(400);
          await page.click('button[type="submit"]');
        } else {
          await page.waitForSelector('input[name="email"]', { timeout: 10000 });
          await page.fill('input[name="email"]', config.taagerEmail);
          await page.waitForTimeout(400);
          await page.fill('input[name="password"]', config.taagerPassword);
          await page.waitForTimeout(400);
          await page.click('button[type="submit"]');
        }
        await page.waitForTimeout(2000);
        // Log SUBMISSION separately from CONFIRMATION
        log("Legacy affiliate disabled: credentials submitted");
        break;
      } catch (e) {
        log(`Legacy affiliate login form attempt ${loginAttempt}/3 failed: ${e.message}`);
        if (loginAttempt < 3) {
          log(`Reloading legacy affiliate login page and retrying...`);
          await page.goto("about:blank", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(3000);
        } else {
          log("Legacy affiliate login form not found after 3 attempts");
        }
      }
    }
  }

  process.send && process.send({ type: "2fa-needed" });
  log("⏳ If 2FA required, complete it in the browser (5 min max)...");

  const maxWait = 5 * 60 * 1000;
  const started = Date.now();
  let confirmed = false;

  while (Date.now() - started < maxWait) {
    await page.waitForTimeout(3000);
    const currentUrl   = page.url();
    const currentTitle = await page.title().catch(() => "");
    log(`[NAV] ${Math.round((Date.now() - started) / 1000)}s — url: ${currentUrl} | title: ${currentTitle}`);

    const urlOffLogin = !currentUrl.includes("/login") && !currentUrl.includes("/auth");
    if (urlOffLogin) {
      // DOM-verify: look for specific post-auth elements — avoid generic nav/main that exist on login page
      // Give the SPA extra time to hydrate before checking
      await page.waitForTimeout(1500);
      const authDomPresent = await page.evaluate(() => {
        const specific = [
          'a[href*="/legacy-affiliate-disabled"]',
          'a[href*="/legacy-affiliate-disabled"]',
          '[class*="affiliate-header"]',
          '[data-affiliate-id]',
          '[data-user]',
          '.user-dropdown',
          '[class*="welcome"]',
          'a[href*="statistics"]',
          // Fallback: any link inside header/topbar that is NOT on a login form
          'header a[href]:not([href*="login"]):not([href*="auth"])',
        ];
        return specific.some(sel => document.querySelector(sel) !== null);
      });
      if (authDomPresent) {
        confirmed = true;
        log(`Legacy affiliate disabled: login confirmed - url: ${currentUrl} | title: ${currentTitle}`);
        process.send && process.send({ type: "session-event", site: "taager", event: "login-confirmed", method: "dom-verified", url: currentUrl });
        await debugScreenshot(page, "taager-login-confirmed");
        break;
      }
      // URL moved but SPA hasn't hydrated yet — keep waiting
      log(`⏳ URL left login but auth DOM not yet present — waiting for SPA hydration...`);
    }
  }

  if (!confirmed) {
    await debugScreenshot(page, "taager-login-timeout");
    throw new Error("Legacy affiliate login timeout after 5 minutes");
  }
  log("Legacy affiliate login confirmed");
}

// ════════════════════════════════════════
// SESSION PROBE - legacy affiliate disabled
// Asserts the page is in an authenticated state.
// Throws SESSION_DESYNC if the URL or DOM indicates the session is gone.
// ════════════════════════════════════════
*/
async function assertTaagerSession(page) {
  const url = page.url();
  if (isOnLoginPage(url)) {
    throw new Error(`SESSION_EXPIRED: on login page (${url})`);
  }
  // DOM-verify: look for specific post-auth elements only
  const authDomPresent = await page.evaluate(() => {
    const specific = [
      '#change-language-btn',
      '#complaints-suggestions-link',
      '#shipping-info-link',
      '#taager-course-link',
      '#suggest-product-btn',
      '#orders-search-button',
      '#multipleCustomers-tab-btn',
      '#upload-file-btn',
      '#confirm-bulk-orders',
      '[data-affiliate-id]',
      '[data-user]',
      '[data-email]',
      'header a[href]:not([href*="login"]):not([href*="auth"])',
    ];
    return specific.some(sel => document.querySelector(sel) !== null);
  });
  if (!authDomPresent) {
    const title = await page.title().catch(() => "");
    throw new Error(`SESSION_UNVERIFIED: URL ok (${url}) but no auth DOM found | title: "${title}"`);
  }
}

async function openTaagerAccountDropdown(page) {
  const trigger = page.locator('[data-hs-unfold-target="#accountNavbarDropdown"], .navbar-dropdown-account-wrapper').first();
  if (await trigger.count().catch(() => 0)) {
    await trigger.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function readTaagerIdentity(page) {
  await openTaagerAccountDropdown(page);
  return page.evaluate(() => {
    const root = document.querySelector("#accountNavbarDropdown") || document.body;
    const text = root.innerText || root.textContent || "";
    const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || "";
    const codeMatch = text.match(/(?:كود|code)\s*:?\s*([0-9A-Za-z_-]+)/i);
    const name = (root.querySelector(".card-title")?.textContent || "").trim();
    return { email: email.trim().toLowerCase(), affiliateCode: codeMatch ? codeMatch[1].trim() : "", name };
  });
}

async function readTaagerIdentityRobust(page) {
  await openTaagerAccountDropdown(page);
  const identity = await page.evaluate(() => {
    const values = [];
    const add = (value) => {
      const text = String(value || "").trim();
      if (text) values.push(text);
    };

    const roots = [
      document.querySelector("#accountNavbarDropdown"),
      document.querySelector("#complaints-suggestions-link"),
      document.body,
    ].filter(Boolean);

    for (const root of roots) {
      add(root.innerText || root.textContent || "");
      for (const attr of ["href", "title", "aria-label", "data-user", "data-email", "data-affiliate-id"]) {
        add(root.getAttribute && root.getAttribute(attr));
      }
    }

    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i) || "";
        const value = storage.getItem(key) || "";
        add(`${key} ${value}`);
      }
    }

    add(document.cookie || "");
    const all = values.join("\n");
    const email = (all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || "";
    const href = document.querySelector("#complaints-suggestions-link")?.getAttribute("href") || "";
    let merchantId = "";
    let merchantName = "";
    let merchantEmail = "";
    try {
      const url = new URL(href, location.origin);
      merchantId = url.searchParams.get("merchantId") || "";
      merchantName = url.searchParams.get("merchantName") || "";
      merchantEmail = url.searchParams.get("merchantEmail") || "";
    } catch (_) {}

    const codeMatch = all.match(/(?:code|merchantId|merchant_id|affiliateCode|affiliate_code)\s*[:=]?\s*([0-9A-Za-z_-]+)/i);
    const name = merchantName || (document.querySelector("#accountNavbarDropdown .card-title")?.textContent || "").trim();
    const country = (location.pathname.match(/^\/([a-z]{2})(?:\/|$)/i) || [])[1] || "";
    return {
      email: (merchantEmail || email).trim().toLowerCase(),
      affiliateCode: (merchantId || (codeMatch ? codeMatch[1] : "")).trim(),
      country,
      name,
    };
  });
  if (identity.affiliateCode) return identity;
  return readTaagerProfileIdentity(page, identity);
}

async function readTaagerProfileIdentity(page, fallbackIdentity = {}) {
  const originalUrl = page.url();
  const profileUrl = taagerUrl("/profile");
  try {
    await ensureTaagerArabic(page);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
    await ensureTaagerArabic(page);
    await page.waitForSelector("#taager-id-input", { timeout: 15000 });
    const profileIdentity = await page.evaluate(() => {
      const valueOf = (selector) => {
        const el = document.querySelector(selector);
        return String((el && (el.value || el.textContent)) || "").trim();
      };
      const country = (location.pathname.match(/^\/([a-z]{2})(?:\/|$)/i) || [])[1] || "";
      return {
        affiliateCode: valueOf("#taager-id-input"),
        name: valueOf("#full-name-input"),
        phone: valueOf("#phone-number-input"),
        email: valueOf("#email-input").toLowerCase(),
        country,
      };
    });
    return {
      ...fallbackIdentity,
      ...profileIdentity,
      email: profileIdentity.email || fallbackIdentity.email || "",
      affiliateCode: profileIdentity.affiliateCode || fallbackIdentity.affiliateCode || "",
      country: profileIdentity.country || fallbackIdentity.country || "",
      name: profileIdentity.name || fallbackIdentity.name || "",
    };
  } finally {
    if (originalUrl && originalUrl !== "about:blank" && !originalUrl.includes("/profile")) {
      await page.goto(originalUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await ensureTaagerArabic(page).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});
    }
  }
}

async function verifyTaagerIdentity(page, where = "session") {
  const expectedEmail = normalizeEmail(config.taagerEmail);
  const expectedCode = normalizeAffiliateCode(config.taagerAffiliateCode);
  const expectedCountry = String(config.taagerCountry || TAAGER_COUNTRY || "sa").toLowerCase();
  if (!expectedCode) throw new Error("TAAGER_IDENTITY_CONFIG_MISSING: Taager merchant ID is not set for this account");
  const identity = await readTaagerIdentityRobust(page);
  const actualEmail = normalizeEmail(identity.email);
  const actualCode = normalizeAffiliateCode(identity.affiliateCode);
  const actualCountry = String(identity.country || "").toLowerCase();
  log(`[IDENTITY][Taager] expected country=${expectedCountry}, expected email=${expectedEmail || "(not-set)"}, expected code=${expectedCode || "(first-bind)"}, detected country=${actualCountry || "unknown"}, detected email=${actualEmail || "unknown"}, detected code=${actualCode || "unknown"}, where=${where}`);
  if ((expectedCode && expectedCode !== actualCode) || !actualCode || (actualCountry && expectedCountry !== actualCountry)) {
    await debugScreenshot(page, `taager-identity-mismatch-${where}`);
  }
  if (actualCountry) assertIdentityMatch("TAAGER", "country", expectedCountry, actualCountry);
  if (expectedCode) assertIdentityMatch("TAAGER", "affiliate code", expectedCode, actualCode);
  if (!actualCode) throw new Error("TAAGER_IDENTITY_UNVERIFIED: merchant ID was not visible in header or profile");
  log(`Taager identity verified: ${actualCountry || expectedCountry} / ${actualEmail || "no-email"} / ${actualCode}`);
  process.send && process.send({
    type: "session-event",
    site: "taager",
    event: "identity-verified",
    email: actualEmail,
    affiliateCode: actualCode,
    country: actualCountry || expectedCountry,
    name: identity.name || "",
    where,
  });
  return identity;
}

/*
async function legacyAffiliateExportAttempt_DISABLED(page, exportFromDate, dateTo, attemptNum) {
  log(`\nLegacy affiliate export attempt ${attemptNum}/${MAX_TAAGER_ATTEMPTS}`);

  // ── Navigate to orders list with fallback reload ──
  log("Loading legacy affiliate orders page...");
  let pageLoaded = false;
  for (let reload = 1; reload <= 3; reload++) {
    try {
      log(`[NAV] -> legacy affiliate disabled`);
      await page.goto("about:blank", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      const landedUrl = page.url();
      log(`[NAV] landed: ${landedUrl} | title: ${await page.title().catch(() => "?")}`);

      // ── Session probe: URL + DOM check before loading protected resources ──
      // This runs BEFORE waitForSelector so we get a meaningful error, not
      // a cryptic "date picker not found" when the real issue is a lost session.
      try {
        await assertTaagerSession(page);
        await verifyTaagerIdentity(page, `export-attempt-${attemptNum}`);
        process.send && process.send({ type: "session-event", site: "taager", event: "session-probe-ok", url: landedUrl });
      } catch (sessionErr) {
        log(`Legacy affiliate SESSION_DESYNC before export attempt: ${sessionErr.message}`);
        process.send && process.send({ type: "session-event", site: "taager", event: "session-probe-failed", url: landedUrl, error: sessionErr.message });
        await debugScreenshot(page, `taager-export-session-fail-${attemptNum}`);
        await taagerLogin(page);
        log(`[NAV] -> legacy affiliate disabled (post re-login)`);
        await page.goto("about:blank", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        await assertTaagerSession(page);
        await verifyTaagerIdentity(page, `export-attempt-${attemptNum}-post-login`);
      }

      // ── Wait for date input to appear ──
      log("⌛ Waiting for date filter input...");
      try {
        await page.waitForSelector("#from_date + input", { timeout: 20000 });
      } catch (selectorErr) {
        // Before surfacing as a generic timeout, check if this is a session issue
        const isSession = isOnLoginPage(page.url()) ||
          (await page.$('input[name="email"], input[name="phone"]') !== null);
        if (isSession) {
          log(`🔐 Date picker missing — actually a session loss (URL: ${page.url()})`);
          await debugScreenshot(page, `taager-datepicker-session-fail-${attemptNum}`);
          await taagerLogin(page);
          await page.goto("about:blank", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(3000);
          await page.waitForSelector("#from_date + input", { timeout: 20000 });
        } else {
          await debugScreenshot(page, `taager-datepicker-missing-${attemptNum}`);
          throw selectorErr;
        }
      }

      pageLoaded = true;
      break;
    } catch (e) {
      log(`Legacy affiliate orders page not ready (reload ${reload}/3): ${e.message}`);
      if (reload < 3) {
        log(`Reloading legacy affiliate orders page...`);
        await page.waitForTimeout(4000);
      } else {
        await debugScreenshot(page, `legacy-affiliate-orders-page-fail-${attemptNum}`);
        throw new Error(`Legacy affiliate orders page failed to load after 3 reloads: ${e.message}`);
      }
    }
  }
  await page.waitForTimeout(1000);

  // ── Set date range via flatpickr ──
  log("📅 Picking date range...");
  await pickDateRangeInFlatpickr(page, exportFromDate, dateTo);

  // ── Click فلترة (filter) ──
  log("🔍 Clicking فلترة (filter)...");

  // Fallback selectors for filter button
  let filtered = false;
  const filterSelectors = [
    'button[name="filter"]',
    'button:has-text("فلترة")',
    'button:has-text("Filter")',
    'input[type="submit"][value*="فلتر"]',
    'form button[type="submit"]',
  ];
  for (const sel of filterSelectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        await page.locator(sel).first().click();
        filtered = true;
        log(`✅ Filter clicked via: ${sel}`);
        break;
      }
    } catch {}
  }
  if (!filtered) {
    // Last scan of all buttons to help debug
    const allBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button, input[type=submit]"))
        .map(el => (el.innerText || el.value || "").trim().slice(0, 60))
        .filter(Boolean)
    );
    log(`📋 All buttons on page: ${allBtns.join(" | ")}`);
    throw new Error(`Filter button (فلترة) not found — page may not have loaded correctly. Buttons: ${allBtns.join(" | ")}`);
  }

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(4000);

  let countAfter = "?";
  try { countAfter = await page.$eval(".badge.badge-soft-dark", (el) => el.innerText.trim()); } catch {}
  log(`📊 Orders after filter: ${countAfter}`);

  // ── Click استخراج اكسل (export) ──
  log("📥 Looking for استخراج اكسل (export) button...");
  process.send && process.send({ type: "cooldown", seconds: 600, attempt: attemptNum, maxAttempts: MAX_TAAGER_ATTEMPTS });

  // Multiple fallback selectors for export button
  const exportSelectors = [
    'button[name="export"]',
    'button:has-text("استخراج")',
    'button:has-text("اكسل")',
    'button:has-text("Excel")',
    'a[href*="export"]',
    'button:has-text("تصدير")',
    'input[type="submit"][value*="استخراج"]',
    'input[type="submit"][value*="اكسل"]',
  ];

  let exportFound = false;
  for (const sel of exportSelectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        log(`✅ Export button found via: ${sel}`);
        exportFound = true;

        const dlPromise = page.waitForEvent("download", { timeout: 15 * 60 * 1000 });
        await page.locator(sel).first().click({ noWaitAfter: true });
        log("Waiting for legacy affiliate to generate file");

        const dl = await dlPromise;
        const stream = await dl.createReadStream();
        const chunks = [];
        await new Promise((res, rej) => {
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", res);
          stream.on("error", rej);
        });
        const buffer = Buffer.concat(chunks);
        log(`Legacy affiliate orders downloaded: ${buffer.length} bytes`);
        return buffer;
      }
    } catch (e) {
      log(`⚠️ Selector "${sel}" failed: ${e.message}`);
    }
  }

  if (!exportFound) {
    // Last-resort: try to find ANY button that could be export by scanning all buttons
    log("🔎 Scanning all buttons on page for export button...");
    const allButtonTexts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("button, input[type=submit], a"))
        .map((el, i) => ({ i, text: (el.innerText || el.value || el.textContent || "").trim().slice(0, 60) }))
        .filter(b => b.text);
    });
    log(`📋 Buttons found: ${JSON.stringify(allButtonTexts.slice(0, 20))}`);
    throw new Error(`Export button not found. Buttons on page: ${allButtonTexts.map(b => b.text).join(" | ")}`);
  }
}

async function legacyAffiliatePhase4_DISABLED(page, exportFromDate, dateTo) {
  log("\n═══════════════════════════════════════");
  log("  PHASE 4 - Legacy Affiliate Disabled");
  log("═══════════════════════════════════════\n");

  // ── Login (once — session persists across retries) ──
  await taagerLogin(page);
  log("");

  // ── Ensure Arabic language is active BEFORE any export attempt ──
  // We always navigate to /lang/sa first — this is idempotent (safe if already Arabic)
  // and eliminates the selector-based language detection which fails on some client machines.
  log("Legacy affiliate disabled: ensuring Arabic language is active");
  try {
    await page.goto("about:blank", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    log("Legacy affiliate Arabic language confirmed");
  } catch (e) {
    log(`Legacy affiliate language set failed (non-fatal): ${e.message}`);
  }

  // ── Export with full fallback retry loop ──
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_TAAGER_ATTEMPTS; attempt++) {
    try {
      const buffer = await taagerExportAttempt(page, exportFromDate, dateTo, attempt);
      return buffer; // ✅ success
    } catch (err) {
      lastError = err;
      log(`\nLegacy affiliate export attempt ${attempt}/${MAX_TAAGER_ATTEMPTS} FAILED`);
      log(`   Reason: ${err.message}`);

      if (attempt < MAX_TAAGER_ATTEMPTS) {
        const waitSec = Math.ceil(TAAGER_RETRY_WAIT_MS / 1000);
        const waitMin = Math.floor(waitSec / 60);
        const waitSecRem = waitSec % 60;

        log(`\n⚠️ Please wait — restarting in ${waitMin}m ${waitSecRem}s...`);
        log(`   The page will refresh and try again automatically.`);

        // Notify UI with countdown
        process.send && process.send({
          type: "taager-restart",
          reason: err.message,
          attempt,
          maxAttempts: MAX_TAAGER_ATTEMPTS,
          waitSeconds: waitSec,
        });

        // Wait with live countdown ticks
        let remaining = TAAGER_RETRY_WAIT_MS;
        while (remaining > 0) {
          const tick = Math.min(15000, remaining);
          await page.waitForTimeout(tick);
          remaining -= tick;
          if (remaining > 0) {
            const secLeft = Math.ceil(remaining / 1000);
            log(`⏳ Restarting in ${Math.floor(secLeft / 60)}m ${secLeft % 60}s — please wait...`);
            process.send && process.send({
              type: "taager-restart",
              reason: err.message,
              attempt,
              maxAttempts: MAX_TAAGER_ATTEMPTS,
              waitSeconds: Math.ceil(remaining / 1000),
            });
          }
        }

        log(`\nRestarting legacy affiliate export (attempt ${attempt + 1}/${MAX_TAAGER_ATTEMPTS})...`);

        // Hard refresh before next attempt
        try {
          await page.goto("about:blank", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(3000);
        } catch {}

        // Re-login if session was lost
        try {
          const currentUrl = page.url();
          if (currentUrl.includes("/login") || currentUrl.includes("/auth")) {
            log("Session expired - re-logging into legacy affiliate...");
            await taagerLogin(page);
          }
        } catch {}

        // Always re-set Arabic after a re-login or page reload
        try {
          await page.goto("about:blank", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(2000);
          log("Legacy affiliate Arabic language re-confirmed before next attempt");
        } catch {}
      }
    }
  }

  throw new Error(`Legacy affiliate export failed after ${MAX_TAAGER_ATTEMPTS} attempts. Last error: ${lastError?.message}`);
}

// ════════════════════════════════════════
// FLATPICKR RANGE CALENDAR PICKER
//
// Taager uses flatpickr in range mode — one calendar handles both from + to.
// First click sets "from", second click sets "to".
//
// Selectors:
//   Open trigger : #from_date + input
//   Calendar     : .flatpickr-calendar.open
//   Day cells    : span.flatpickr-day[aria-label="April 19, 2026"]
//   Prev month   : .flatpickr-prev-month
//   Next month   : .flatpickr-next-month
//   Month select : .flatpickr-monthDropdown-months  (value = 0–11)
//   Year input   : .numInput.cur-year
// ════════════════════════════════════════
async function pickDateRangeInFlatpickr(page, dateFrom, dateTo) {
  const MONTH_NAMES = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];

  function ariaLabel(d) {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  log(`📅 Flatpickr: ${ariaLabel(dateFrom)} → ${ariaLabel(dateTo)}`);

  // Open calendar by clicking the visible text input
  await page.click("#from_date + input");
  await page.waitForSelector(".flatpickr-calendar.open", { timeout: 8000 });
  await page.waitForTimeout(400);

  // Navigate to dateFrom month and click it
  await navigateFlatpickrToMonth(page, dateFrom);
  await page.click(`span.flatpickr-day[aria-label="${ariaLabel(dateFrom)}"]:not(.prevMonthDay):not(.nextMonthDay)`);
  await page.waitForTimeout(400);
  log(`✅ From date clicked: ${ariaLabel(dateFrom)}`);

  // Navigate to dateTo month if different and click it
  if (dateFrom.getMonth() !== dateTo.getMonth() || dateFrom.getFullYear() !== dateTo.getFullYear()) {
    await navigateFlatpickrToMonth(page, dateTo);
  }
  await page.click(`span.flatpickr-day[aria-label="${ariaLabel(dateTo)}"]:not(.prevMonthDay):not(.nextMonthDay)`);
  await page.waitForTimeout(400);
  log(`✅ To date clicked: ${ariaLabel(dateTo)}`);

  // Close calendar
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

async function navigateFlatpickrToMonth(page, targetDate) {
  for (let i = 0; i < 24; i++) {
    const monthVal = await page.$eval(
      ".flatpickr-calendar.open .flatpickr-monthDropdown-months",
      (el) => parseInt(el.value)
    ).catch(() => -1);
    const yearVal = await page.$eval(
      ".flatpickr-calendar.open .numInput.cur-year",
      (el) => parseInt(el.value)
    ).catch(() => -1);

    if (monthVal === targetDate.getMonth() && yearVal === targetDate.getFullYear()) break;

    const shownTotal  = yearVal  * 12 + monthVal;
    const targetTotal = targetDate.getFullYear() * 12 + targetDate.getMonth();

    if (targetTotal < shownTotal) {
      await page.click(".flatpickr-calendar.open .flatpickr-prev-month");
    } else {
      await page.click(".flatpickr-calendar.open .flatpickr-next-month");
    }
    await page.waitForTimeout(300);
  }
}

// ════════════════════════════════════════
// CITY — keyword → canonical display text
// We match by visible text, NOT data-value (UUIDs change on every deploy)
// ════════════════════════════════════════
const CITY_KEYWORDS = [
  // Each entry: { keywords[], label }
  // label must be a substring of the actual <li> text in Easy-Orders
  { keywords: ["الرياض"],                          label: "منطقة الرياض" },
  { keywords: ["الغربية", "مكة", "جدة"],           label: "المنطقة الغربية" },
  { keywords: ["الشرقية", "الدمام"],               label: "المنطقة الشرقية" },
  { keywords: ["المدينة المنورة", "المدينة"],      label: "المدينة المنورة" },
  { keywords: ["القصيم", "قصيم"],                  label: "منطقة القصيم" },
  { keywords: ["عسير", "أبها", "ابها"],            label: "عسير" },
  { keywords: ["جيزان", "جازان"],                  label: "جيزان" },
  { keywords: ["نجران"],                           label: "نجران" },
  { keywords: ["تبوك"],                            label: "تبوك" },
  { keywords: ["حائل"],                            label: "حائل" },
  { keywords: ["سكاكا", "الجوف", "جوف"],           label: "سكاكا" },
  { keywords: ["عرعر", "الحدود الشمالية", "حدود"], label: "عرعر" },
  { keywords: ["الباحة", "باحة"],                  label: "الباحة" },
];

// DEFAULT_CITY is the single source of truth for all fallbacks.
const DEFAULT_CITY = "منطقة الرياض";

function resolveCityLabel(cityName) {
  if (!cityName) return DEFAULT_CITY;
  const clean = cityName.trim();
  for (const entry of CITY_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (clean.includes(kw) || kw.includes(clean)) return entry.label;
    }
  }
  log(`⚠️ City "${clean}" not matched — defaulting to ${DEFAULT_CITY}`);
  return DEFAULT_CITY;
}

// Clicks the city dropdown and selects by visible text (immune to UUID changes)
async function selectCityByText(page, cityName) {
  const label = resolveCityLabel(cityName);
  await page.locator('#government').click();
  await page.waitForTimeout(800);

  // The open MUI listbox — find the li whose text contains our label
  const listbox = page.locator('ul[role="listbox"]');
  await listbox.waitFor({ timeout: 10000 });

  // Try exact text first, then partial (handles extra text like "سكاكا ( الجوف )")
  const option = listbox.locator(`li:has-text("${label}")`).first();
  await option.waitFor({ timeout: 8000 });
  await option.click();
}

// ════════════════════════════════════════
// SESSION PROBE — EASY-ORDERS
// ════════════════════════════════════════
async function assertEasyOrdersSession(page) {
  const url = page.url();
  if (url.includes("login")) {
    throw new Error(`SESSION_EXPIRED: on login page (${url})`);
  }
  const authDomPresent = await page.$(
    '.MuiAppBar-root, [aria-label="language-switcher"], [class*="Dashboard"], [class*="OrderList"], .MuiDrawer-root, .MuiCard-root'
  ) !== null;
  if (!authDomPresent) {
    const title = await page.title().catch(() => "");
    throw new Error(`SESSION_UNVERIFIED: URL ok (${url}) but no auth DOM found | title: "${title}"`);
  }
  await verifyEasyOrdersIdentity(page, "assert");
}
*/
if (false) {
async function legacyEasyOrdersCreate_DISABLED(page, orders) {
  log("\n═══════════════════════════════════════");
  log("  PHASE 5 - Legacy create disabled");
  log(`  Total: ${orders.length} orders`);
  log("═══════════════════════════════════════\n");

  const results = { success: 0, failed: 0, failedOrders: [] };

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const orderNum = `[${i + 1}/${orders.length}]`;

    log(`\n${orderNum} Creating order for: ${order.name} | ${order.productName} | qty:${order.qty} | subtotal:${order.subtotal}`);

    try {
      await createSingleOrder(page, order, orderNum);
      results.success++;
      log(`${orderNum} ✅ Order created successfully`);

      // Report progress to UI
      process.send && process.send({
        type: "order-progress",
        current: i + 1,
        total: orders.length,
        success: results.success,
        failed: results.failed,
        lastOrder: { name: order.name, product: order.productName, sku: order.sku || "", city: order.city || "", phone: formatPhone(order.normPhone, TAAGER_COUNTRY) || "", uncertain: !!order.uncertain, orderStatus: order.orderStatus || "" },
      });

    } catch (err) {
      results.failed++;
      log(`${orderNum} ❌ FAILED: ${err.message}`);
      results.failedOrders.push({
        name:        order.name,
        product:     order.productName,
        sku:         order.sku         || "",
        phone:       formatPhone(order.normPhone, TAAGER_COUNTRY) || "",
        uncertain:   !!order.uncertain,
        source:      order.source      || "real",
        city:        order.city        || "",
        address:     order.address     || "",
        qty:         order.qty         || 1,
        subtotal:    order.subtotal    || 0,
        // ── Analytics fields ──
        orderStatus: order.orderStatus || "",
        amountDue:   order.amountDue   || 0,
        error:       err.message,
      });

      // Still report progress
      process.send && process.send({
        type: "order-progress",
        current: i + 1,
        total: orders.length,
        success: results.success,
        failed: results.failed,
        lastOrder: { name: order.name, product: order.productName, sku: order.sku || "", city: order.city || "", phone: formatPhone(order.normPhone, TAAGER_COUNTRY) || "", uncertain: !!order.uncertain, error: err.message },
      });

      // Navigate back to orders list to reset state before next order
      try {
        // Navigate back to reset React state; next iteration goes straight to /create
        await page.goto("https://app.easy-orders.net/#/orders", { waitUntil: "domcontentloaded" });
      } catch {}
    }

    // Brief pause between orders — server breathing room
    if (i < orders.length - 1) await page.waitForTimeout(800);
  }

  log(`\n✅ Phase 5 done — success:${results.success} failed:${results.failed}`);
  return results;
}

async function createSingleOrder(page, order, orderNum) {
  const MAX_ORDER_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ORDER_ATTEMPTS; attempt++) {
    try {
      await createSingleOrderAttempt(page, order, orderNum, attempt);
      return; // ✅ success
    } catch (err) {
      log(`${orderNum} ⚠️ Attempt ${attempt}/${MAX_ORDER_ATTEMPTS} failed: ${err.message}`);

      if (attempt < MAX_ORDER_ATTEMPTS) {
        log(`${orderNum} 🔄 Reloading page and retrying...`);
        try {
          // Hard reset: go to orders list first to fully clear React state
          await page.goto("https://app.easy-orders.net/#/orders", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(2000);
          // Re-login if session was lost during the attempt
          if (page.url().includes("login")) {
            log(`${orderNum} 🔐 Session expired — re-logging in before retry...`);
            await phase1_easyOrdersLogin(page);
          }
        } catch { /* non-fatal — next attempt will handle it */ }
        await page.waitForTimeout(1500);
      } else {
        // All attempts exhausted — rethrow so phase5 records it as failed
        throw err;
      }
    }
  }
}

async function createSingleOrderAttempt(page, order, orderNum, attempt) {
  // ── Resolve address/city ──
  console.log("PARSED CITY:", order.city);
  const finalCity    = (order.city    && order.city.trim())    ? order.city.trim()    : DEFAULT_CITY;
  const finalAddress = (order.address && order.address.trim()) ? order.address.trim() : finalCity;
  console.log("FINAL CITY:", finalCity);

  if (attempt > 1) log(`${orderNum} ↳ [Attempt ${attempt}] city="${finalCity}"`);
  else             log(`${orderNum} ↳ city="${finalCity}" address="${finalAddress}"`);

  // ── 1. Navigate directly to create page ──
  log(`[NAV] → https://app.easy-orders.net/#/orders/create`);
  await page.goto("https://app.easy-orders.net/#/orders/create", { waitUntil: "domcontentloaded" });

  // ── Session probe: DOM-verified check before loading any protected selectors ──
  try {
    await assertEasyOrdersSession(page);
  } catch (sessionErr) {
    log(`⚠️ Easy-Orders ${orderNum} SESSION_DESYNC: ${sessionErr.message}`);
    process.send && process.send({ type: "session-event", site: "easy-orders", event: "session-probe-failed", url: page.url(), error: sessionErr.message });
    await debugScreenshot(page, `easy-orders-session-fail`);
    await easyOrdersFlow.login(page);
    // Re-navigate to create page after re-login — the retry loop above will catch any
    // further failure and log the order as failed if all attempts are exhausted
    await page.goto("https://app.easy-orders.net/#/orders/create", { waitUntil: "domcontentloaded" });
    // Re-verify session is good now before proceeding
    await assertEasyOrdersSession(page);
  }

  await page.waitForSelector('button:has-text("Choose Products")', { timeout: 15000 });
  await page.waitForTimeout(800);

  // ── 2. Click "Choose Products" ──
  await page.click('button:has-text("Choose Products")');
  await page.waitForTimeout(1200);

  // ── 3. Search + select product (multi-strategy inside selectProductInModal) ──
  const productSelected = await selectProductInModal(page, order.productName, orderNum);
  if (!productSelected) {
    throw new Error(`Product not found in modal: "${order.productName}"`);
  }

  // ── 4. Click "Add Products" ──
  await page.waitForSelector('button:has-text("Add Products")', { timeout: 8000 });
  await page.click('button:has-text("Add Products")');
  // Wait for modal to close — detected by the qty input appearing
  const qtyInput = page.locator('div[aria-label="Quantity"] input[type="number"]');
  await qtyInput.waitFor({ timeout: 12000 });

  // ── 5. Set quantity ──
  const targetQty      = order.qty      || 1;
  const targetSubtotal = order.subtotal || 0;

  const currentQty = parseInt(await qtyInput.inputValue() || "1");
  if (currentQty !== targetQty) {
    await qtyInput.click({ clickCount: 3 });
    await qtyInput.fill(String(targetQty));
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);
    log(`${orderNum} ↳ Set qty: ${currentQty} → ${targetQty}`);
  }

  // ── 6. Verify / fix price ──
  const targetUnitPrice = targetSubtotal / targetQty;
  await verifyAndFixPrice(page, targetUnitPrice, targetSubtotal, orderNum);

  // ── 7. Fill customer info ──
  const nameInput = page.locator('input#full_name');
  await nameInput.waitFor({ timeout: 10000 });
  await nameInput.click({ clickCount: 3 });
  await nameInput.fill(order.name || "عميل");

  const phoneInput = page.locator('input#phone');
  await phoneInput.click({ clickCount: 3 });
  await phoneInput.fill(formatPhone(order.normPhone, TAAGER_COUNTRY) || "");

  await selectCityByText(page, finalCity);

  const addressInput = page.locator('textarea#address');
  await addressInput.click({ clickCount: 3 });
  await addressInput.fill(finalAddress);

  // ── 9. Final total check before submit ──
  const totalOk = await verifyFinalTotal(page, targetSubtotal, orderNum);
  if (!totalOk) {
    throw new Error(`Total mismatch — expected ${targetSubtotal} SAR, aborting order`);
  }

  // ── 10. Submit ──
  const submitBtn = page.locator('button[type="submit"]:has-text("Submit Order")');
  await submitBtn.waitFor({ timeout: 8000 });
  // Make sure the button is not disabled
  const isDisabled = await submitBtn.isDisabled();
  if (isDisabled) {
    throw new Error("Submit Order button is disabled — form may have validation errors");
  }
  await submitBtn.click();
  await page.waitForTimeout(1000);

  // ── 11. Wait for redirect back to orders list (up to 20s) ──
  const maxWait = 20000;
  const started = Date.now();
  while (Date.now() - started < maxWait) {
    const url = page.url();
    if (url.includes("#/orders") && !url.includes("/create")) {
      return; // ✅ success — page redirected to orders list
    }
    await page.waitForTimeout(600);
  }

  // Still on create page after timeout
  if (page.url().includes("/create")) {
    throw new Error("Order submit timed out — still on create page after 20s");
  }
}

// ════════════════════════════════════════
// PRODUCT SEARCH STRATEGIES
//
// Problem: Easy-Orders search is sensitive to mixed Arabic/English names.
// e.g. "splash بخاخ تقشير القدمين بزيت البرتقال" fails when searched in full
// because the English word "splash" at the start confuses the search index.
//
// Solution: try multiple search queries in order until one returns results.
//   1. Full product name (original)
//   2. Arabic words only (strip English/numbers) — handles mixed names
//   3. First 3 Arabic words — handles long names that get truncated
//   4. Longest single Arabic word — last-resort keyword search
// ════════════════════════════════════════
function buildSearchStrategies(productName) {
  const full = productName.trim();

  // Extract only Arabic words (Unicode Arabic block)
  const arabicWords = full.match(/[\u0600-\u06FF]+/g) || [];

  // Extract only English words
  const englishWords = full.match(/[a-zA-Z]+/g) || [];

  const strategies = [full]; // always try full name first

  if (arabicWords.length > 0) {
    strategies.push(arabicWords.join(" "));            // all Arabic words
    strategies.push(arabicWords.slice(0, 3).join(" ")); // first 3 Arabic words
    if (arabicWords.length > 3) {
      // Longest Arabic word — usually the most distinctive
      const longest = arabicWords.sort((a, b) => b.length - a.length)[0];
      strategies.push(longest);
    }
  }

  if (englishWords.length > 0) {
    strategies.push(englishWords[0]); // just the English brand name e.g. "splash"
  }

  // Deduplicate while preserving order
  return [...new Set(strategies)];
}

async function searchProductInModal(page, query, orderNum) {
  const searchInput = page.locator('input[name="name"]');
  await searchInput.waitFor({ timeout: 10000 });
  await searchInput.click({ clickCount: 3 });

  // Inject value via React synthetic event (same as before)
  await page.evaluate((text) => {
    const el = document.querySelector('input[name="name"]');
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, text);
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, query);

  await page.waitForTimeout(1200); // let React re-render results
}

async function selectProductInModal(page, productName, orderNum) {
  const strategies = buildSearchStrategies(productName);
  log(`${orderNum} 🔍 Product search strategies: ${strategies.map(s => `"${s}"`).join(" → ")}`);

  for (const query of strategies) {
    log(`${orderNum} 🔎 Trying search: "${query}"`);
    await searchProductInModal(page, query, orderNum);

    await page.waitForSelector('table tbody tr', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();

    if (count === 0) {
      log(`${orderNum} ↳ No results for "${query}" — trying next strategy`);
      continue;
    }

    // Try to find the best matching row
    const cleanTarget = productName.trim().toLowerCase();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const nameCell = row.locator('td[aria-label="product name"]');
      const cellText = (await nameCell.innerText().catch(() => "")).trim().toLowerCase();

      const isMatch =
        cellText === cleanTarget ||
        cellText.includes(cleanTarget) ||
        cleanTarget.includes(cellText) ||
        wordOverlap(cleanTarget, cellText) >= 0.5; // lowered from 0.6 → more forgiving

      if (isMatch) {
        log(`${orderNum} ✅ Product match via "${query}": "${cellText}"`);
        const checkbox = row.locator('td[aria-label="select"] input[type="checkbox"]');
        await checkbox.click();
        await page.waitForTimeout(300);
        return true;
      }
    }

    // Results exist but no match found — if this is the last strategy, use first result
    const isLastStrategy = query === strategies[strategies.length - 1];
    if (isLastStrategy) {
      log(`${orderNum} ⚠️ No name match — using first result as fallback`);
      const firstIsExpandButton = await rows.first().locator('button[title="Expand variants"]').count();
      const targetRow = firstIsExpandButton > 0 ? rows.nth(1) : rows.first();
      const checkbox = targetRow.locator('td[aria-label="select"] input[type="checkbox"]');
      await checkbox.click();
      await page.waitForTimeout(300);
      return true;
    }

    log(`${orderNum} ↳ Results found but no name match for "${query}" — trying next strategy`);
  }

  // All strategies exhausted with zero results each time
  log(`${orderNum} ❌ Product not found in modal after all search strategies: "${productName}"`);
  return false;
}

function wordOverlap(a, b) {
  const wordsA = new Set(a.split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  let common = 0;
  for (const w of wordsA) if (wordsB.has(w)) common++;
  const total = Math.max(wordsA.size, wordsB.size);
  return total === 0 ? 0 : common / total;
}

async function verifyAndFixPrice(page, targetUnitPrice, targetSubtotal, orderNum) {
  // Read current displayed total
  await page.waitForTimeout(500);

  // Get the edit (pencil) button for price
  const editPriceBtn = page.locator('.MuiInputAdornment-root button').first();

  // Read current total text from the product row
  const currentTotalText = await page.locator('p.MuiTypography-body1').filter({ hasText: "SAR" }).first().innerText().catch(() => "");
  const currentTotal = parseFloat(currentTotalText.replace(/[^\d.]/g, "")) || 0;

  log(`${orderNum} ↳ Price check: current total=${currentTotal} SAR, expected=${targetSubtotal} SAR`);

  if (Math.abs(currentTotal - targetSubtotal) < 0.1) {
    log(`${orderNum} ↳ Price ✅ already correct`);
    return;
  }

  // Price is wrong — click pencil to unlock price field
  log(`${orderNum} ↳ Price mismatch — editing unit price to ${targetUnitPrice} SAR`);
  await editPriceBtn.click();
  await page.waitForTimeout(500);

  // Now the price input should be enabled
  const priceInput = page.locator('input[type="number"][min="0"]').first();
  await priceInput.click({ clickCount: 3 });
  await priceInput.fill(String(targetUnitPrice));
  await page.waitForTimeout(600); // wait for total to recalculate

  // Verify total updated
  const newTotalText = await page.locator('p.MuiTypography-body1').filter({ hasText: "SAR" }).first().innerText().catch(() => "");
  const newTotal = parseFloat(newTotalText.replace(/[^\d.]/g, "")) || 0;
  log(`${orderNum} ↳ After edit: total=${newTotal} SAR`);
}

async function verifyFinalTotal(page, targetSubtotal, orderNum) {
  await page.waitForTimeout(500);
  // Read Products Total from the summary section at bottom
  const totalRows = page.locator('text=/Products Total/').first();
  let totalText = "";
  try {
    const parent = await totalRows.locator("..").innerText();
    const match = parent.match(/([\d.]+)\s*SAR/);
    totalText = match ? match[1] : "";
  } catch {}

  if (!totalText) {
    // Fallback: look for any SAR amount that matches
    const allSarTexts = await page.locator('p:has-text("SAR")').allInnerTexts().catch(() => []);
    for (const t of allSarTexts) {
      const n = parseFloat(t.replace(/[^\d.]/g, ""));
      if (Math.abs(n - targetSubtotal) < 0.1) {
        log(`${orderNum} ↳ Final total verified via fallback: ${n} SAR ✅`);
        return true;
      }
    }
    // Can't verify but proceed anyway with a warning
    log(`${orderNum} ⚠️ Could not read final total — proceeding with submit`);
    return true;
  }

  const actualTotal = parseFloat(totalText);
  if (Math.abs(actualTotal - targetSubtotal) < 0.1) {
    log(`${orderNum} ↳ Final total ✅ ${actualTotal} SAR`);
    return true;
  }

  log(`${orderNum} ❌ Final total mismatch: got ${actualTotal} SAR, expected ${targetSubtotal} SAR`);
  return false;
}

// ════════════════════════════════════════
}

// EasyOrders export guard retained from the fresh clone runner.
// It is not Taager affiliate logic; phase 2/3 still depend on it.
async function assertEasyOrdersSession(page) {
  const url = page.url();
  if (url.includes("login")) {
    throw new Error(`SESSION_EXPIRED: on login page (${url})`);
  }
  const authDomPresent = await page.$(
    '.MuiAppBar-root, [aria-label="language-switcher"], [class*="Dashboard"], [class*="OrderList"], .MuiDrawer-root, .MuiCard-root'
  ) !== null;
  if (!authDomPresent) {
    const title = await page.title().catch(() => "");
    throw new Error(`SESSION_UNVERIFIED: URL ok (${url}) but no auth DOM found | title: "${title}"`);
  }
  await verifyEasyOrdersIdentity(page, "assert");
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

async function taagerLogin(page) {
  log(`[NAV] -> ${taagerUrl("/auth/login")}`);
  await ensureTaagerArabic(page);
  await page.goto(taagerUrl("/auth/login"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await ensureTaagerArabic(page);

  if (!page.url().includes("/login") && !page.url().includes("/auth")) {
    log("Taager: already logged in");
    await ensureTaagerArabic(page);
    await verifyTaagerIdentity(page, "login-reused").catch((err) => {
      log(`Taager identity verification after reused login failed: ${err.message}`);
      throw err;
    });
    return;
  }

  const method = config.taagerLoginMethod || config.taagerLoginMethod || "email";
  const email = config.taagerEmail || config.taagerEmail || "";
  const phone = config.taagerPhone || config.taagerPhone || "";
  const password = config.taagerPassword || config.taagerPassword || "";
  log(`Taager: logging in via ${method}`);

  if (method === "google") {
    // Google blocks OAuth inside any Playwright/automated browser (CDP port detection).
    // Solution: navigate Playwright to a neutral waiting page, then tell main process
    // to open the Taager login page in the user's REAL system browser via shell.openExternal.
    // The user logs in there → session cookies are written to the shared persistent profile
    // folder → we poll until those cookies appear, then reload the page in Playwright.
    log("Google login required — opening Taager login in your system browser...");
    await page.goto("about:blank", { waitUntil: "domcontentloaded" }).catch(() => {});
    process.send && process.send({ type: "google-login-needed" });

    const GOOGLE_LOGIN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const started_google = Date.now();
    log("Waiting for Google login to complete in your browser...");
    while (Date.now() - started_google < GOOGLE_LOGIN_TIMEOUT_MS) {
      await page.waitForTimeout(3000);
      // Check if session cookies for Taager have appeared in the profile
      const cookies = await page.context().cookies("https://taager.com");
      const hasSession = cookies.some(
        (c) => c.name === "access_token" || c.name === "refresh_token" || c.name === "token" || c.name === "session"
      );
      if (hasSession) {
        log("✅ Google login detected via session cookies — continuing...");
        process.send && process.send({ type: "google-login-complete" });
        break;
      }
      // Also check by navigating to dashboard — if already there, session is live
      try {
        await page.goto(taagerUrl("/home"), { waitUntil: "domcontentloaded", timeout: 8000 });
        const url = page.url();
        if (!url.includes("/login") && !url.includes("/auth")) {
          log("✅ Google login detected via dashboard navigation — continuing...");
          process.send && process.send({ type: "google-login-complete" });
          await ensureTaagerArabic(page);
          await verifyTaagerIdentity(page, "login-confirmed");
          return;
        }
        // Still on login — go back to blank while waiting
        await page.goto("about:blank", { waitUntil: "domcontentloaded" }).catch(() => {});
      } catch (_) {}
      log(`${Math.round((Date.now() - started_google) / 1000)}s — waiting for Google login in system browser...`);
    }
    if (Date.now() - started_google >= GOOGLE_LOGIN_TIMEOUT_MS) {
      throw new Error("Google login timeout — no session detected after 10 minutes");
    }
    // Session cookies are now in the profile — navigate to dashboard
    await page.goto(taagerUrl("/home"), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
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
      await ensureTaagerArabic(page);
      await verifyTaagerIdentity(page, "login-confirmed");
      return;
    }
    log(`${Math.round((Date.now() - started) / 1000)}s - waiting for Taager login...`);
  }
  throw new Error("Taager login timeout after 5 minutes");
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
    log(`[COUNTRY] ${where}: verified ${expectedCountry}/${expectedCartCode}`);
    return;
  }

  log(`[COUNTRY] ${where}: mismatch path=${state.pathCountry || "?"} select=${state.selectedCode || "?"} button="${state.buttonText || "?"}" expected=${expectedCountry}/${expectedCartCode}; attempting switch`);

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
    log(`[COUNTRY] ${where}: corrected to ${expectedCountry}/${expectedCartCode}`);
    return;
  }

  await debugScreenshot(page, `taager-country-mismatch-${where}`).catch(() => {});
  throw new Error(`TAAGER_COUNTRY_MISMATCH: expected ${expectedCountry}/${expectedCartCode}, detected path=${state.pathCountry || "unknown"}, select=${state.selectedCode || "unknown"}, button="${state.buttonText || "unknown"}"`);
}

async function taagerGoto(page, pathnameOrUrl) {
  const url = pathnameOrUrl.startsWith("http") ? pathnameOrUrl : taagerUrl(pathnameOrUrl);
  await ensureTaagerArabic(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await ensureTaagerArabic(page);
  if (page.url().includes("/login") || page.url().includes("/auth")) {
    log("Taager session expired - re-logging in");
    await taagerLogin(page);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await ensureTaagerArabic(page);
  }
  await verifyTaagerIdentity(page, `goto-${pathnameOrUrl}`).catch((err) => {
    log(`Taager identity verification failed after navigation: ${err.message}`);
    throw err;
  });
  await ensureTaagerCountrySelected(page, `goto-${pathnameOrUrl}`);
}

async function phase4_taager(page, exportFromDate, dateTo) {
  log("\n========================================");
  log("  PHASE 4 - Taager Login & Export");
  log("========================================\n");
  await taagerLogin(page);
  await taagerGoto(page, "/orders");
  await page.waitForSelector("#orders-search-button", { timeout: 30000 });

  log(`Taager export from: ${formatDataDay(exportFromDate)} to ${formatDataDay(dateTo)}`);
  await pickTaagerDateRange(page, exportFromDate, dateTo);

  await page.waitForSelector("#orders-search-button:not([disabled])", { timeout: 15000 });
  await page.click("#orders-search-button");
  await page.waitForSelector("#orders-search-button:not([disabled])", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(500);

  log("Downloading Taager orders...");
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
  const buffer = Buffer.concat(chunks);
  log(`Taager orders downloaded: ${buffer.length} bytes`);
  return buffer;
}

function taagerFailedOrderFromCard(card, order, fallbackIndex) {
  return {
    row: Number.isFinite(card?.index) ? card.index + 1 : fallbackIndex + 1,
    name: order?.name || "",
    product: order?.productName || order?.product || card?.product || "",
    productName: order?.productName || order?.product || card?.product || "",
    sku: order?.sku || card?.sku || "",
    phone: card?.phone || (order ? formatPhone(order.normPhone || order.phone || "", TAAGER_COUNTRY) : ""),
    source: order?.source || "taager-upload",
    city: order?.city || "",
    address: order?.address || "",
    qty: order?.qty || 1,
    subtotal: order?.subtotal || "",
    uncertain: !!order?.uncertain,
    error: card?.error || "Taager upload failed",
  };
}

function scrapeTaagerCardFailures(cardStatuses, orders = []) {
  let fallbackIndex = 0;
  return (cardStatuses || []).filter((card) => !card.success).map((card) => {
    const exactOrder = Number.isFinite(card.index) ? orders[card.index] : null;
    const matchedOrder = exactOrder || orders.find((order) => {
      const cardPhone = String(card.phone || "").replace(/\D/g, "");
      const orderPhone = String(formatPhone(order.normPhone || order.phone || "", TAAGER_COUNTRY) || "").replace(/\D/g, "");
      const skuMatch = card.sku && order.sku && String(card.sku) === String(order.sku);
      const phoneMatch = cardPhone && orderPhone && (cardPhone.endsWith(orderPhone) || orderPhone.endsWith(cardPhone));
      return (skuMatch && phoneMatch) || phoneMatch || skuMatch;
    });
    return taagerFailedOrderFromCard(card, matchedOrder, fallbackIndex++);
  });
}

async function scrapeTaagerCartCardStatuses(page) {
  return page.$$eval("[id^='order-details-button']", (buttons) => buttons.map((button, index) => {
    const card = button.closest("[class*='rounded'][class*='border']") || button.parentElement?.parentElement;
    if (!card) return { index, success: true, error: "", phone: "", sku: "" };
    const errEl = card.querySelector("[class*='toast-secondary-error'], [class*='toast'][class*='error']");
    const cardText = (card.innerText || "").trim();
    const lowerText = cardText.toLowerCase();
    const explicitFailure = /failed|rejected|error|not available|unavailable|خطأ|فشل|مرفوض|غير متوفر|غير متاح/.test(lowerText);
    const explicitPending = /draft|pending|processing|مسودة|قيد|جاري/.test(lowerText);
    const error = errEl ? errEl.innerText.trim() : (explicitFailure ? cardText.split("\n").find((line) => /failed|rejected|error|not available|unavailable|خطأ|فشل|مرفوض|غير متوفر|غير متاح/i.test(line)) || "Taager upload failed" : "");
    const spans = Array.from(card.querySelectorAll("span"));
    const hasSuccessText = spans.some((span) => /تم استلام الطلب|تم انشاء الطلب|تم إنشاء الطلب|success|received|created/i.test(span.textContent || ""));
    const success = !errEl && !explicitFailure && (hasSuccessText || !explicitPending);
    const phoneEl = card.querySelector("p[dir='ltr']");
    const skuMatch = error.match(/Product\s+(\S+)\s+is not available/i);
    return { index, success, error, phone: phoneEl ? phoneEl.innerText.trim() : "", sku: skuMatch ? skuMatch[1] : "" };
  })).catch(() => []);
}

async function readTaagerCartUploadState(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const confirm = document.querySelector("#confirm-bulk-orders");
    const upload = document.querySelector("#upload-file-btn");
    return {
      spinnerVisible: Array.from(document.querySelectorAll(".animate-spin, [class*='spinner']")).some(isVisible),
      confirmVisible: isVisible(confirm),
      uploadDisabled: !!(upload && upload.disabled),
      cardCount: document.querySelectorAll("[id^='order-details-button']").length,
    };
  }).catch(() => ({ spinnerVisible: false, confirmVisible: false, uploadDisabled: false, cardCount: 0 }));
}

async function uploadToTaagerCartAttempt(page, orders, tempPath, attempt, maxAttempts) {
  log(`Taager cart upload attempt ${attempt}/${maxAttempts}`);
  await taagerGoto(page, "/cart");
  const bulkTab = page.locator("#multipleCustomers-tab-btn, button:has-text('إرسال إلى عدة عملاء')").first();
  await bulkTab.waitFor({ state: "visible", timeout: 30000 });
  await bulkTab.click();
  await page.waitForTimeout(500);

  const uploadButton = page.locator("#upload-file-btn, button:has-text('رفع الملف بعد التعديل')").first();
  await uploadButton.waitFor({ state: "visible", timeout: 15000 });

  const uploadInput = page.locator("#upload-file-input, input[type='file']").first();
  await uploadInput.waitFor({ state: "attached", timeout: 15000 });
  await uploadInput.setInputFiles(tempPath);
  log("Taager cart file selected - waiting for confirm button");
  process.send && process.send({ type: "order-progress", current: 0, total: orders.length, success: 0, failed: 0, lastOrder: null });

  try {
    await page.waitForSelector("#confirm-bulk-orders", { timeout: 90000 });
  } catch (error) {
    const state = await readTaagerCartUploadState(page);
    throw new Error(`Taager cart upload did not finish preparing the file within 90s (spinner=${state.spinnerVisible}, uploadDisabled=${state.uploadDisabled}, cards=${state.cardCount}). ${error.message}`);
  }

  if (config.autoConfirm === true) {
    log("Auto-confirm is ON - confirming Taager bulk orders");
    await page.click("#confirm-bulk-orders");
  } else {
    log("Auto-confirm is OFF - waiting for manual Taager confirmation");
    process.send && process.send({ type: "needs-confirm" });
    const started = Date.now();
    let confirmed = false;
    while (Date.now() - started < 10 * 60 * 1000) {
      await page.waitForTimeout(3000);
      const stillVisible = await page.locator("#confirm-bulk-orders").isVisible().catch(() => false);
      if (!stillVisible) {
        confirmed = true;
        break;
      }
    }
    if (!confirmed) throw new Error("Manual Taager confirmation was not completed within 10 minutes");
  }

  const processingTimeout = 3 * 60 * 1000;
  const processingStart = Date.now();
  let processingDone = false;

  try {
    await page.waitForSelector(".animate-spin", { timeout: 8000 });
    log("Taager cart processing spinner appeared");
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: processingTimeout }
    );
    processingDone = true;
  } catch (error) {
    log(`Taager spinner wait did not finish cleanly: ${error.message}`);
  }

  if (!processingDone) {
    try {
      const remaining = Math.max(10000, processingTimeout - (Date.now() - processingStart));
      await page.waitForFunction(
        () => {
          const spans = Array.from(document.querySelectorAll("span"));
          const hasReceived = spans.some((span) => span.textContent.includes("تم استلام الطلب"));
          const hasDraft = spans.some((span) => span.textContent.includes("مسودة"));
          return hasReceived || !hasDraft || !document.querySelector("#confirm-bulk-orders");
        },
        { timeout: remaining }
      );
      processingDone = true;
    } catch (error) {
      log(`Taager status/confirm wait did not finish cleanly: ${error.message}`);
    }
  }

  await page.waitForTimeout(1500);
  const stateAfterWait = await readTaagerCartUploadState(page);
  const cardStatuses = await scrapeTaagerCartCardStatuses(page);
  if (!processingDone && cardStatuses.length === 0 && (stateAfterWait.spinnerVisible || stateAfterWait.confirmVisible || stateAfterWait.uploadDisabled)) {
    throw new Error(`Taager cart is still loading after ${Math.round((Date.now() - processingStart) / 1000)}s (spinner=${stateAfterWait.spinnerVisible}, confirm=${stateAfterWait.confirmVisible}, uploadDisabled=${stateAfterWait.uploadDisabled}).`);
  }

  const total = cardStatuses.length || orders.length;
  const success = cardStatuses.length ? cardStatuses.filter((card) => card.success).length : orders.length;
  const failed = Math.max(0, total - success);
  const failedOrders = scrapeTaagerCardFailures(cardStatuses, orders);
  const lastOrder = failedOrders[0] || (orders[orders.length - 1]
    ? { name: orders[orders.length - 1].name, product: orders[orders.length - 1].productName, sku: orders[orders.length - 1].sku, phone: formatPhone(orders[orders.length - 1].normPhone, TAAGER_COUNTRY), error: "" }
    : null);
  process.send && process.send({ type: "order-progress", current: total, total, success, failed, lastOrder });
  log(`Taager upload done - success:${success} failed:${failed}`);
  return { success, failed, failedOrders, cardStatuses };
}

async function phase5_uploadToTaager(page, orders) {
  log("\n========================================");
  log("  PHASE 5 - Upload to Taager Cart");
  log(`  Total: ${orders.length} orders`);
  log("========================================\n");
  const outputBuffer = buildOutputExcel(orders);
  const tempPath = path.join(os.tmpdir(), `taager-upload-${Date.now()}.xlsx`);
  fs.writeFileSync(tempPath, outputBuffer);

  try {
    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await uploadToTaagerCartAttempt(page, orders, tempPath, attempt, maxAttempts);
      } catch (error) {
        lastError = error;
        log(`Taager cart upload attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
        await debugScreenshot(page, `taager-cart-upload-attempt-${attempt}`).catch(() => {});
        if (attempt >= maxAttempts) break;
        log("Reloading Taager cart and retrying upload...");
        await reloadWithNetworkRetries(page, "Taager cart upload retry", { attempts: 2, timeout: 45000, waitMs: 5000 }).catch(async () => {
          await page.goto(taagerUrl("/cart"), { waitUntil: "domcontentloaded", timeout: 45000 });
        });
        await page.waitForTimeout(5000);
      }
    }
    throw new Error(`Taager cart upload failed after ${maxAttempts} attempts: ${lastError ? lastError.message : "unknown error"}`);
  } finally {
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }
}

// MAIN
// ════════════════════════════════════════
(async () => {
  const dateFrom       = parseDate(config.dateFrom);
  const dateTo         = parseDate(config.dateTo);
  const exportFromDate = subtractDay(dateFrom); // -1 day so Easy-Orders export catches late-night orders and builds full product catalog
  const taagerExportRange = resolveSafeTaagerExportRange(dateFrom, dateTo);
  const taagerStartDate = taagerExportRange.exportDateFrom;
  const taagerEndDate = taagerExportRange.exportDateTo;

  log(`📅 Date range  : ${formatDataDay(dateFrom)} → ${formatDataDay(dateTo)}`);
  log(`📅 Export from : ${formatDataDay(exportFromDate)} (Easy-Orders) | Taager: ${formatDataDay(taagerStartDate)} → ${formatDataDay(taagerEndDate)}\n`);

  const profilePath = config.profilePath;
  if (!profilePath) throw new Error("profilePath not set in config — cannot persist sessions");

  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
    log(`📁 Created profile directory: ${profilePath}`);
  } else {
    log(`📁 Using existing profile: ${profilePath}`);
  }

  const chromePath = config.chromePath || findChrome();
  log(`🌐 Using Chrome: ${chromePath}`);

  // ════════════════════════════════════════════════════════════════
  // CHROME LAUNCH — REAL BROWSER MODE
  //
  // TASK 1 ✅ Remove --enable-automation (Playwright injects it by default)
  //           Done via ignoreDefaultArgs — this alone causes the banner.
  //
  // TASK 2 ✅ Remove --disable-blink-features=AutomationControlled
  //           Tells Chrome to hide the automation flag in Blink engine.
  //
  // TASK 3 ✅ Remove ALL flags that trigger "unsupported command-line flag" banner:
  //           --no-sandbox           → triggers warning in Chrome 120+
  //           --disable-dev-shm-usage → Linux-only, triggers on Windows
  //           --disable-extensions    → conflicts + triggers banner
  //           --use-mock-keychain     → macOS-only, triggers on Windows
  //           --password-store=basic  → triggers on newer Chrome
  //           --metrics-recording-only → deprecated, triggers warning
  //           --no-service-autorun    → deprecated, triggers warning
  //           --disable-extensions-except= → conflicts with real Chrome
  //
  // TASK 4 ✅ Keep only flags that real Chrome uses silently with no banners.
  //
  // TASK 5 ✅ Spoof navigator.webdriver + plugins via addInitScript so
  //           bot-detection JS on websites sees a real browser fingerprint.
  // ════════════════════════════════════════════════════════════════

  const context = await launchPersistentChromeContext(chromium, profilePath, {
    executablePath: chromePath,
    windowSize: "1280,800",

    args: [
      // ── Startup behaviour (all safe, no banners) ──
      "--no-first-run",
      "--no-default-browser-check",

      // ── Hide automation traces ──
      // NOTE: --disable-blink-features=AutomationControlled and --exclude-switches=enable-automation
      // are removed — they trigger the "unsupported command-line flag" banner in real Chrome.
      // Automation is hidden via addInitScript (navigator.webdriver spoof) below instead.

      // ── Performance / stability (safe, no banners) ──
      "--disable-background-networking",
      "--disable-client-side-phishing-detection",
      "--disable-default-apps",
      "--disable-hang-monitor",
      "--disable-popup-blocking",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--disable-translate",

      // ── Startup speed improvements ──
      // Limit disk cache to 50 MB — bot uses very few unique URLs, large cache wastes init time
      "--disk-cache-size=52428800",
      // Skip checking for Chrome updates on launch (saves ~200ms on first run)
      "--no-pings",
      // Disable background tab throttling — keeps bot pages responsive
      "--disable-background-timer-throttling",
      // Disable renderer backgrounding — prevents Playwright pages from being throttled
      "--disable-renderer-backgrounding",
      // Skip loading unused component extensions on startup
      "--disable-component-extensions-with-background-pages",
      // Faster V8 startup: skip idle GC tasks during launch
      "--disable-v8-idle-tasks",

      // ── Suppress Chrome UI overlays that cover the page ──
      // Prevents "Chrome didn't shut down correctly — Restore pages?" bubble
      // from appearing over the page when the profile had an unclean shutdown.
      "--hide-crash-restore-bubble",

      // ── Display (safe, no banners) ──
      "--force-device-scale-factor=1",
      "--window-size=1280,800",

      // ── Locale — force Gregorian calendar dates on Arabic OS (safe) ──
      "--lang=ar-SA",
      "--accept-lang=ar-SA,ar,en",
    ],

    viewport: null,
  });

  // ── TASK 5: Spoof browser fingerprint on every page before any JS runs ──
  // Hides all Playwright/automation traces from website bot-detection scripts.
  await context.addInitScript(() => {
    // Hide the webdriver flag (set by all automation tools)
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // Remove Playwright-specific window globals
    delete window.__playwright;
    delete window.__pw_manual;
    delete window.__PW_inspect;

    // Real Chrome always has plugins — empty array = detected as bot
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // Real Chrome reports languages — missing = detected as bot
    Object.defineProperty(navigator, "languages", {
      get: () => ["ar-SA", "ar", "en"],
    });
  });

  const page = context.pages()[0] || (await context.newPage());

  // ── Dismiss Chrome's "Restore pages?" crash-recovery dialog ──
  // This dialog appears in the Chrome UI (not the web page) when a profile was
  // previously closed uncleanly. It can appear as a web-overlay on chrome://settings
  // or as an infobar. We dismiss it by navigating away and marking the session as clean.
  try {
    await page.evaluate(() => {
      // Tell Chrome's SessionRestore that we don't want to restore — equivalent to
      // clicking "No thanks" on the "Restore pages?" infobar.
      try { sessionStorage.setItem("session_crashed", "dismissed"); } catch (_) {}
    });
    // Also dismiss via CDP: set a flag that Chrome checks on the new-tab page
    const cdpDismiss = await context.newCDPSession(page);
    await cdpDismiss.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
    await cdpDismiss.detach().catch(() => {});
  } catch (_) {}
  log(`🧹 Chrome crash-recovery dialog dismissed (if present)`);

  // Minimize the Chrome window via CDP if launchMinimized is set
  if (config.launchMinimized) {
    try {
      const cdp = await context.newCDPSession(page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
      await cdp.detach();
    } catch (e) {
      // CDP minimize failed — not critical, bot continues
      log(`⚠️ Could not minimize Chrome window: ${e.message}`);
    }
  }

  try {
    // Phase 1 — Easy-Orders login (unchanged)
    await phase1_easyOrdersLogin(page);

    // Phase 2 — Real orders export (unchanged)
    const realBuffer = await phase2_realOrders(page, exportFromDate);

    // Phase 3 — Missed orders export (unchanged)
    const missedBuffer = await phase3_missedOrders(page, exportFromDate);

    // Phase 4 - Taager login + export (dedup/status list).
    // The selected range is widened around the edges, but never past today because
    // Taager disables future calendar dates.
    const taagerBuffer = await phase4_taager(page, taagerStartDate, taagerEndDate);

    // ── Parse all sheets ──
    log("\n═══════════════════════════════════════");
    log("  PROCESSING DATA");
    log("═══════════════════════════════════════\n");

    const {
      parseTaagerOrderKeys,
      parseTaagerAnalyticsMap,
      parseRealOrders,
      parseMissedOrders,
      buildProductCatalog,
      resolveMissedOrders,
      mergeAndDeduplicate,
    } = parser();

    const taagerOrderKeys = parseTaagerOrderKeys(taagerBuffer);
    const taagerAnalyticsMap = parseTaagerAnalyticsMap(taagerBuffer);
    const realOrders         = parseRealOrders(realBuffer, dateFrom, dateTo);
    const { orders: missedOrders, skippedOrders: phoneFailedOrders } =
      parseMissedOrders(missedBuffer, dateFrom, dateTo);
    const catalog         = buildProductCatalog(realOrders);
    const { resolved: resolvedMissed, skippedOrders: catalogFailedOrders } =
      resolveMissedOrders(missedOrders, catalog);

    const baseSkippedOrders = [...phoneFailedOrders, ...catalogFailedOrders].map(o => ({
      ...o,
      accountEmail: config.easyEmail || "",
      accountLabel: config.label || "",
      taagerCountry: config.taagerCountry || config.taagerCountry || "sa",
    }));

    // Cross-reference Taager and Easy-Orders rows for analytics enrichment.
    // Saves learned pairs to disk — grows over time, never cleared.
    // If the file doesn't exist yet (first run or deleted) → starts fresh and works normally.
    const { orders, stats } = mergeAndDeduplicate(realOrders, resolvedMissed, taagerOrderKeys);
    const uncertainUploadWarnings = orders.filter(o => o.uncertain).map(o => ({
      ...o,
      reason: "phone_uncertain_zero_appended",
      uploadedWithWarning: true,
      normalizedPhone: formatPhone(o.normPhone, TAAGER_COUNTRY) || "",
      accountEmail: config.easyEmail || "",
      accountLabel: config.label || "",
      taagerCountry: TAAGER_COUNTRY,
    }));
    const allSkippedOrders = [...baseSkippedOrders, ...uncertainUploadWarnings];
    let skippedBuffer = null;
    let skippedFilePath = "";
    if (allSkippedOrders.length > 0) {
      skippedBuffer = buildSkippedExcel(allSkippedOrders);
      if (skippedBuffer) {
        const skippedDir = path.join(path.dirname(profilePath), "failed-orders");
        if (!fs.existsSync(skippedDir)) fs.mkdirSync(skippedDir, { recursive: true });
        skippedFilePath = uniqueFilePath(skippedDir, accountFileBase("skipped-orders"));
        fs.writeFileSync(skippedFilePath, skippedBuffer);
        log(`Warnings/skipped file saved: ${skippedFilePath}`);
      }
    }

    log(`\n✅ FINAL: ${orders.length} new orders to save`);

    if (orders.length === 0) {
      process.send && process.send({
        type: "result",
        data: {
          orders: 0,
          stats,
          buffer: null,
          productSummary: [],
          skippedOrders: {
            count: allSkippedOrders.length,
            rows: allSkippedOrders,
            buffer: skippedBuffer ? Array.from(skippedBuffer) : null,
            filePath: skippedFilePath,
          },
          taagerSnapshot: {
            entries:     Array.from(taagerAnalyticsMap.byPhoneSku.entries()),
            skuDefaults: taagerAnalyticsMap.skuDefaults,
          },
          taagerDashboardSnapshot: null,
        },
      });
      return;
    }

    // ── Build output Excel (kept for download / reference) ──
    const outputBuffer = buildOutputExcel(orders);
    log(`✅ Output Excel built: ${outputBuffer.length} bytes`);

    // ── Send preview to dashboard before starting upload ──
    const previewRows = orders.slice(0, 50).map(o => ({
      productName: o.productName || "",
      sku:         o.sku || "",
      qty:         o.qty || 1,
      unitPrice:   o.unitPrice || "",
      date:        o.date || "",
      city:        o.city || "",
      region:      o.region || "",
      address:     o.address || "",
      name:        o.name || "",
      phone:       formatPhone(o.normPhone, TAAGER_COUNTRY) || "",
      taagerCountry: TAAGER_COUNTRY,
      uncertain:   !!o.uncertain,
    }));
    process.send && process.send({
      type: "preview",
      rows: previewRows,
      total: orders.length,
      buffer: Array.from(outputBuffer),
    });
    log(`📋 Preview sent to dashboard (${orders.length} orders)`);

    // Phase 5 - upload orders to Taager cart.
    const uploadResults = await phase5_uploadToTaager(page, orders);
    const cardStatuses = Array.isArray(uploadResults.cardStatuses) ? uploadResults.cardStatuses : [];
    const successfulOrders = cardStatuses.length > 0
      ? orders.filter((_, index) => !!cardStatuses[index]?.success)
      : orders.slice(0, uploadResults.success);

    const buildResultOrderRow = (o) => {
      const taagerKey = `${o.normPhone}|${o.sku}`;
      const taagerExact = taagerAnalyticsMap.byPhoneSku.get(taagerKey);
      const taagerSku = taagerAnalyticsMap.skuDefaults[o.sku] || {};

      return {
        name:               o.name        || "",
        phone:              formatPhone(o.normPhone, TAAGER_COUNTRY) || "",
        taagerCountry:      TAAGER_COUNTRY,
        productName:        o.productName || "",
        sku:                o.sku         || "",
        qty:                o.qty         || 1,
        city:               o.city        || "",
        unitPrice:          o.unitPrice   || "",
        subtotal:           o.subtotal    || 0,
        date:               o.date        || "",
        createdAt:          o.createdAt   || "",
        source:             o.source      || "real",
        address:            o.address     || "",
        orderStatus:        taagerExact?.orderStatus        || o.orderStatus        || "Under processing",
        amountDue:          taagerExact?.amountDue          ?? taagerSku.amountDue    ?? o.amountDue    ?? 0,
        marketerCommission: taagerExact?.marketerCommission ?? taagerSku.marketerCommission ?? o.marketerCommission ?? 0,
        taagerOrderNumber:  taagerExact?.taagerOrderNumber  || o.taagerOrderNumber    || "",
      };
    };

    // ── Build product summary ──
    const productSummaryMap = {};
    for (const order of successfulOrders) {
      const key = order.productName || "Unknown";
      if (!productSummaryMap[key]) productSummaryMap[key] = { productName: key, count: 0, totalQty: 0 };
      productSummaryMap[key].count++;
      productSummaryMap[key].totalQty += order.qty || 1;
    }

    // ── Send final result ──
    const failedBuffer = uploadResults.failedOrders.length > 0
      ? buildFailedExcel(uploadResults.failedOrders)
      : null;

    process.send && process.send({
      type: "result",
      data: {
        orders: uploadResults.success,
        taagerCountry: TAAGER_COUNTRY,
        stats,
        productSummary: Object.values(productSummaryMap),
        buffer: Array.from(outputBuffer),
        orderRows: orders.map(o => {
          // Taager analytics enrichment.
          // 1st priority: exact phone+SKU match in current Taager export (update run status)
          // 2nd priority: SKU-level inference from other orders with same SKU (first-run estimate)
          // 3rd priority: Easy-Orders fallback already set in parser.js
          const taagerKey = `${o.normPhone}|${o.sku}`;
          const taagerExact = taagerAnalyticsMap.byPhoneSku.get(taagerKey);
          const taagerSku = taagerAnalyticsMap.skuDefaults[o.sku] || {};

          return {
            name:               o.name        || "",
            phone:              formatPhone(o.normPhone, TAAGER_COUNTRY) || "",
            taagerCountry:      TAAGER_COUNTRY,
            productName:        o.productName || "",
            sku:                o.sku         || "",
            qty:                o.qty         || 1,
            city:               o.city        || "",
            unitPrice:          o.unitPrice   || "",
            subtotal:           o.subtotal    || 0,
            date:               o.date        || "",
            createdAt:          o.createdAt   || "",
            source:             o.source      || "real",
            address:            o.address     || "",
            // ── Analytics fields (enriched) ──
            orderStatus:        taagerExact?.orderStatus        || o.orderStatus        || "Under processing",
            amountDue:          taagerExact?.amountDue          ?? taagerSku.amountDue    ?? o.amountDue    ?? 0,
            marketerCommission: taagerExact?.marketerCommission ?? taagerSku.marketerCommission ?? o.marketerCommission ?? 0,
            taagerOrderNumber:    taagerExact?.taagerOrderNumber    || o.taagerOrderNumber    || "",
          };
        }),
        orderRows: successfulOrders.map(buildResultOrderRow),
        attemptedOrderRows: orders.map(buildResultOrderRow),
        failedOrders: {
          count: uploadResults.failed,
          summary: uploadResults.failedOrders,
          errorRows: uploadResults.failedOrders,
          failedDir: "",
          failedPath: "",
          buffer: failedBuffer ? Array.from(failedBuffer) : null,
        },
        skippedOrders: {
          count: allSkippedOrders.length,
          rows: allSkippedOrders,
          buffer: skippedBuffer ? Array.from(skippedBuffer) : null,
          filePath: skippedFilePath,
        },
        // Taager analytics snapshot. Historical key names remain for stored-run compatibility.
        // Maps are serialized as entry arrays for JSON transport.
        taagerSnapshot: {
          entries:     Array.from(taagerAnalyticsMap.byPhoneSku.entries()),
          skuDefaults: taagerAnalyticsMap.skuDefaults,
        },
        taagerDashboardSnapshot: null,
      },
    });

  } catch (err) {
    const message = friendlyErrorMessage(err);
    log(`❌ FATAL: ${message}`);
    process.send && process.send({ type: "error", error: message });
  } finally {
    await context.close();
  }
})();