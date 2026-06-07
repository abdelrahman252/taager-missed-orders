"use strict";

const os = require("os");
const path = require("path");

function createEasyOrdersExportFlow(options = {}) {
  const config = options.config || {};
  const log = typeof options.log === "function" ? options.log : () => {};
  const emit = typeof options.emit === "function" ? options.emit : () => {};

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

  async function debugScreenshot(page, label) {
    try {
      const filePath = path.join(os.tmpdir(), `kbot-debug-${label}-${Date.now()}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      log(`[DEBUG] Screenshot saved: ${filePath}`);
      emit({ type: "debug-screenshot", path: filePath, label });
    } catch (_) {}
  }

  async function gotoWithNetworkRetries(page, url, label, opts = {}) {
    const attempts = opts.attempts || 3;
    const timeout = opts.timeout || 45000;
    const waitMs = opts.waitMs || 5000;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        log(`[NAV] -> ${url}${attempt > 1 ? ` (retry ${attempt}/${attempts})` : ""}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        return;
      } catch (error) {
        if (!isNetworkNavigationError(error) || attempt >= attempts) throw error;
        log(`Network issue while loading ${label} (${attempt}/${attempts}): ${error.message}`);
        await page.waitForTimeout(waitMs);
      }
    }
  }

  async function reloadWithNetworkRetries(page, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
        return;
      } catch (error) {
        if (!isNetworkNavigationError(error) || attempt >= 3) throw error;
        log(`Network issue while reloading ${label} (${attempt}/3): ${error.message}`);
        await page.waitForTimeout(5000);
      }
    }
  }

  async function ensureEnglish(page) {
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
        return clicked;
      }
    } catch (error) {
      log(`EasyOrders language check skipped: ${error.message}`);
    }
    return false;
  }

  async function collectIdentityEmails(page) {
    return page.evaluate(() => {
      const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
      const hits = [];
      const seen = new Set();
      const add = (source, text) => {
        const matches = String(text || "").match(emailRe) || [];
        matches.forEach((raw) => {
          const email = raw.trim().toLowerCase();
          const key = `${source}|${email}`;
          if (!seen.has(key)) {
            seen.add(key);
            hits.push({ source, email });
          }
        });
      };
      const scanJwt = (source, text) => {
        const tokens = String(text || "").match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
        tokens.forEach((token) => {
          try {
            const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            add(`${source}:jwt`, atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
          } catch (_) {}
        });
      };
      add("document", document.body ? document.body.innerText : "");
      add("title", document.title || "");
      Array.from(document.querySelectorAll("[title], [aria-label], [data-email], [href]")).forEach((el) => {
        add("dom-attr", [
          el.getAttribute("title"),
          el.getAttribute("aria-label"),
          el.getAttribute("data-email"),
          el.getAttribute("href"),
        ].filter(Boolean).join(" "));
      });
      [localStorage, sessionStorage].forEach((storage) => {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          const value = `${key || ""} ${storage.getItem(key) || ""}`;
          add("storage", value);
          scanJwt("storage", value);
        }
      });
      add("cookie", document.cookie || "");
      scanJwt("cookie", document.cookie || "");
      return hits;
    });
  }

  async function revealIdentityMenu(page) {
    const selectors = [
      'button[aria-label="app_bar.user_settings"]',
      '[data-testid="user-avatar"]',
      'button:has(.MuiAvatar-root)',
      '.MuiAvatar-root',
      '.MuiAppBar-root button[aria-label*="account" i]',
      '.MuiAppBar-root button[aria-label*="user" i]',
    ];
    for (const selector of selectors) {
      const target = page.locator(selector).first();
      if (await target.count().catch(() => 0)) {
        try {
          await target.click({ timeout: 1200 });
          await page.waitForTimeout(800);
          return true;
        } catch (_) {}
      }
    }
    return false;
  }

  async function readCurrentStore(page, expectedEmail) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await revealIdentityMenu(page);
      await page.waitForTimeout(attempt === 1 ? 800 : 1500);
      try {
        const currentStore = await page.evaluate((email) => {
          const normalize = (value) => String(value || "")
            .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
            .replace(/[\u200E\u200F\u061C]/g, "")
            .replace(/\s+/g, " ").trim().toLowerCase();
          const menuRoot = document.querySelector(
            '[class*="MuiPopover-paper"], [role="menu"], [role="dialog"], [role="presentation"] [class*="MuiPaper-root"]'
          );
          const texts = Array.from((menuRoot || document).querySelectorAll("p, span, h1, h2, h3, h4, h5, h6"))
            .map((el) => (el.innerText || el.textContent || "").trim())
            .filter(Boolean);
          const emailIndex = texts.findIndex((text) => normalize(text) === normalize(email));
          if (emailIndex > 0) return normalize(texts[emailIndex - 1]);
          const storesIndex = texts.findIndex((text) => normalize(text).replace(/:$/, "") === "stores");
          if (storesIndex >= 0) {
            const candidate = texts.slice(storesIndex + 1).find((text) => !/@/.test(text) && normalize(text) !== "add store");
            if (candidate) return normalize(candidate);
          }
          return "";
        }, expectedEmail);
        if (currentStore) return currentStore;
      } finally {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300).catch(() => {});
      }
    }
    return "";
  }

  async function selectExpectedStore(page) {
    const expectedStore = normalizeIdentityText(config.easyStore);
    const returnUrl = page.url();
    await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/store-selection", "EasyOrders store selection");
    await page.waitForTimeout(1500);
    if (page.url().includes("login")) return false;

    const cards = page.locator(".MuiCard-root");
    await cards.first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
    for (let i = 0; i < await cards.count(); i++) {
      const card = cards.nth(i);
      if (normalizeIdentityText(await card.locator("h6").innerText().catch(() => "")) !== expectedStore) continue;
      await card.click();
      await page.waitForFunction(() => !window.location.href.includes("store-selection"), { timeout: 15000 });
      await ensureEnglish(page);
      if (returnUrl && returnUrl.startsWith("https://app.easy-orders.net/") && returnUrl !== page.url()) {
        await gotoWithNetworkRetries(page, returnUrl, "EasyOrders return after store verification");
        await page.waitForTimeout(1200);
      }
      return true;
    }
    return false;
  }

  async function verifyIdentity(page, where) {
    const expectedEmail = normalizeEmail(config.easyEmail);
    const expectedStore = normalizeIdentityText(config.easyStore);
    if (!expectedEmail) throw new Error("EASY_ORDERS_IDENTITY_CONFIG_MISSING: easyEmail is not set");
    if (!expectedStore) throw new Error("EASY_ORDERS_STORE_CONFIG_MISSING: easyStore is required");
    let hits = await collectIdentityEmails(page).catch(() => []);
    let detected = [...new Set(hits.map((hit) => normalizeEmail(hit.email)).filter(Boolean))];
    if (!detected.includes(expectedEmail) && await revealIdentityMenu(page).catch(() => false)) {
      hits = hits.concat(await collectIdentityEmails(page).catch(() => []));
      detected = [...new Set(hits.map((hit) => normalizeEmail(hit.email)).filter(Boolean))];
      await page.keyboard.press("Escape").catch(() => {});
    }
    if (!detected.includes(expectedEmail)) {
      await debugScreenshot(page, `easy-orders-identity-${where}`);
      throw new Error(detected.length
        ? `EASY_ORDERS_IDENTITY_MISMATCH: expected ${expectedEmail}, detected ${detected.join(", ")}`
        : `EASY_ORDERS_IDENTITY_UNVERIFIED: expected ${expectedEmail}`);
    }
    let currentStore = await readCurrentStore(page, expectedEmail).catch(() => "");
    if (!currentStore) {
      log(`EasyOrders store label was not readable at ${where}; selecting configured store "${config.easyStore}" explicitly.`);
      if (await selectExpectedStore(page).catch(() => false)) currentStore = expectedStore;
    }
    if (currentStore !== expectedStore) {
      await debugScreenshot(page, `easy-orders-store-mismatch-${where}`);
      throw new Error(currentStore
        ? `EASY_ORDERS_STORE_MISMATCH: expected "${expectedStore}", detected "${currentStore}"`
        : `EASY_ORDERS_STORE_UNVERIFIED: could not verify or select expected store "${expectedStore}"`);
    }
    emit({ type: "session-event", site: "easy-orders", event: "identity-verified", email: expectedEmail, store: config.easyStore, where });
  }

  async function assertSession(page) {
    const url = page.url();
    if (url.includes("login")) throw new Error(`SESSION_EXPIRED: on login page (${url})`);
    const authDomPresent = await page.$('.MuiAppBar-root, [aria-label="language-switcher"], [class*="Dashboard"], [class*="OrderList"], .MuiDrawer-root, .MuiCard-root') !== null;
    if (!authDomPresent) throw new Error(`SESSION_UNVERIFIED: no authenticated EasyOrders DOM at ${url}`);
    await verifyIdentity(page, "assert");
  }

  async function verificationCodeVisible(page) {
    return page.evaluate(() => {
      const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const otpInputs = Array.from(document.querySelectorAll('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[type="tel"]')).filter(visible);
      if (otpInputs.length > 0) return true;
      const visibleInputs = Array.from(document.querySelectorAll("input")).filter(visible);
      const text = String(document.body && document.body.innerText || "").toLowerCase();
      return visibleInputs.length >= 4 && (
        text.includes("verification code") ||
        text.includes("enter verification") ||
        text.includes("رمز التحقق") ||
        text.includes("ادخل رمز")
      );
    }).catch(() => false);
  }

  async function authenticatedLanding(page) {
    if (await verificationCodeVisible(page)) return false;
    const url = page.url();
    if (url.includes("store-selection")) return true;
    if (url.includes("login")) return false;
    return await page.$('.MuiAppBar-root, [aria-label="language-switcher"], [class*="Dashboard"], [class*="OrderList"], .MuiDrawer-root, .MuiCard-root') !== null;
  }

  async function waitForLoginCompletion(page) {
    emit({ type: "2fa-needed", site: "easy-orders" });
    log("EasyOrders: complete two-step verification in the browser if requested (5 min max).");
    const startedAt = Date.now();
    const maxWaitMs = 5 * 60 * 1000;
    while (Date.now() - startedAt < maxWaitMs) {
      if (await authenticatedLanding(page)) {
        emit({ type: "session-event", site: "easy-orders", event: "login-confirmed", method: "dom-verified", url: page.url() });
        return;
      }
      await page.waitForTimeout(3000);
    }
    await debugScreenshot(page, "easy-orders-login-timeout");
    throw new Error("EASY_ORDERS_LOGIN_TIMEOUT: complete the verification code in the browser within 5 minutes");
  }

  async function doLogin(page) {
    if (!config.easyEmail || !config.easyPassword) throw new Error("EasyOrders credentials missing");
    await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/login", "EasyOrders login");
    await page.waitForSelector("#username", { timeout: 15000 });
    await page.fill("#username", config.easyEmail);
    await page.fill("#password", config.easyPassword);
    await page.locator('button[type="submit"]').click();
    await waitForLoginCompletion(page);
  }

  async function login(page) {
    await gotoWithNetworkRetries(page, "https://app.easy-orders.net/", "EasyOrders root");
    await page.waitForTimeout(2000);
    const verificationVisible = await verificationCodeVisible(page);
    if (verificationVisible) await waitForLoginCompletion(page);
    else if (!await authenticatedLanding(page)) await doLogin(page);
    await ensureEnglish(page);
    await page.waitForTimeout(1500);
    if (page.url().includes("store-selection")) {
      const expectedStore = normalizeIdentityText(config.easyStore);
      if (!expectedStore) throw new Error("EASY_ORDERS_STORE_CONFIG_MISSING: easyStore is required");
      const cards = page.locator(".MuiCard-root");
      let found = false;
      for (let i = 0; i < await cards.count(); i++) {
        const card = cards.nth(i);
        if (normalizeIdentityText(await card.locator("h6").innerText().catch(() => "")) === expectedStore) {
          await card.click();
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`EasyOrders store not found: ${config.easyStore}`);
      await page.waitForFunction(() => !window.location.href.includes("store-selection"), { timeout: 15000 });
      await ensureEnglish(page);
    }
    await verifyIdentity(page, "login");
  }

  async function pickDate(page, targetDate) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    await page.waitForSelector(".react-datepicker", { timeout: 8000 });
    for (let i = 0; i < 24; i++) {
      const header = await page.$eval(".react-datepicker__current-month", (el) => el.innerText.trim()).catch(() => "");
      const parts = header.split(/\s+/);
      const shownMonth = monthNames.indexOf(parts[0]);
      const shownYear = Number(parts.find((part) => /^\d{4}$/.test(part)));
      const shownTotal = shownYear * 12 + shownMonth;
      const targetTotal = targetDate.getFullYear() * 12 + targetDate.getMonth();
      if (shownTotal === targetTotal) break;
      await page.click(targetTotal < shownTotal ? ".react-datepicker__navigation--previous" : ".react-datepicker__navigation--next");
      await page.waitForTimeout(300);
    }
    const dayClass = String(targetDate.getDate()).padStart(3, "0");
    await page.click(`.react-datepicker__day--${dayClass}:not(.react-datepicker__day--outside-month)`);
  }

  async function findExportLink(page, keyword) {
    return page.evaluate(({ keyword }) => {
      const kind = (text) => {
        const value = String(text || "").toLowerCase();
        if (value.includes("missed orders report") || value.includes("missed order report") || value.includes("الطلبات الفائتة")) return "missed-orders";
        if (value.includes("orders exported") ||
            value.includes("orders export") ||
            value.includes("created orders excel") ||
            value.includes("ملف اكسل للطلبات") ||
            value.includes("ملف إكسل للطلبات") ||
            value.includes("انشاء ملف اكسل") ||
            value.includes("إنشاء ملف إكسل")) return "orders";
        return "";
      };
      for (const row of Array.from(document.querySelectorAll("tr, [role='row'], li, .MuiCard-root"))) {
        const text = (row.innerText || row.textContent || "").replace(/\s+/g, " ").trim();
        if (kind(text) !== keyword) continue;
        const link = Array.from(row.querySelectorAll("a[href]")).find((item) => String(item.href || "").startsWith("https://"));
        if (link) return { href: link.href, text };
      }
      return null;
    }, { keyword });
  }

  async function triggerExport(page, exportFromDate, keyword) {
    const pageUrl = keyword === "missed-orders" ? "https://app.easy-orders.net/#/missed-orders" : "https://app.easy-orders.net/#/orders";
    for (let attempt = 1; attempt <= 3; attempt++) {
      await gotoWithNetworkRetries(page, pageUrl, `EasyOrders ${keyword}`);
      await page.waitForTimeout(1500);
      try {
        await assertSession(page);
      } catch (_) {
        await login(page);
        await gotoWithNetworkRetries(page, pageUrl, `EasyOrders ${keyword} after login`);
      }
      await ensureEnglish(page);
      const exportButton = page.locator('button.MuiButton-outlined:has-text("Export"), main button:has-text("Export"), button:has-text("Export")').first();
      await exportButton.waitFor({ state: "visible", timeout: 15000 });
      await exportButton.click();
      const dialog = page.locator('div[role="dialog"]').first();
      await dialog.waitFor({ state: "visible", timeout: 8000 });
      const dateInputs = dialog.locator(".react-datepicker-wrapper input");
      await dateInputs.first().click();
      await pickDate(page, exportFromDate);
      await dialog.locator("h2").click().catch(() => {});
      await dialog.locator(".MuiDialogActions-root button").click();
      await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const toast = await page.locator('[role="alert"], .MuiSnackbarContent-root, .Toastify__toast').innerText().catch(() => "");
      const rateLimited = /5 minutes|5 دقائق|every|abuse/i.test(String(toast || ""));
      if (!page.url().includes("notifications")) {
        await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/notifications", "EasyOrders notifications");
      }
      await reloadWithNetworkRetries(page, "EasyOrders notifications");
      await page.waitForTimeout(2500);
      await reloadWithNetworkRetries(page, "EasyOrders notifications");
      await page.waitForTimeout(2500);
      const result = rateLimited ? null : await findExportLink(page, keyword);
      if (result && result.href) {
        emit({ type: "export-timestamp", timestamp: Date.now() });
        return result.href;
      }
      if (attempt < 3) {
        const waitMs = 6 * 60 * 1000;
        emit({ type: "cooldown", seconds: waitMs / 1000, attempt, maxAttempts: 3 });
        await page.waitForTimeout(waitMs);
      }
    }
    throw new Error(`EasyOrders export failed after 3 attempts for "${keyword}"`);
  }

  async function download(page, url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await page.context().request.get(url, { timeout: 60000 });
        return Buffer.from(await response.body());
      } catch (error) {
        if (!isNetworkNavigationError(error) || attempt >= 3) throw error;
        await page.waitForTimeout(8000);
      }
    }
  }

  async function exportReport(page, exportFromDate, keyword = "orders") {
    const url = await triggerExport(page, exportFromDate, keyword);
    const buffer = await download(page, url);
    log(`EasyOrders ${keyword} downloaded: ${buffer.length} bytes from ${formatDataDay(exportFromDate)}`);
    return buffer;
  }

  return {
    login,
    assertSession,
    ensureEnglish,
    exportReport,
    exportOrders: (page, exportFromDate) => exportReport(page, exportFromDate, "orders"),
  };
}

module.exports = { createEasyOrdersExportFlow };
