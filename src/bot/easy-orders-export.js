"use strict";

const os = require("os");
const path = require("path");
const { isRetryableNetworkError } = require("./network-retry");

function parseEasyOrdersIdentityFromDocument() {
  // IMPORTANT FOR FUTURE MAINTENANCE:
  // The active EasyOrders store must be read from the account identity header
  // paired with the active email. Do not "simplify" this by reading the first
  // item under the "Stores:" list; that list contains available stores and can
  // be different from the currently active store.
  const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  const ignoredSectionLabels = new Set([
    "stores",
    "change to",
    "switch account",
    "switch accounts",
    "accounts",
  ]);
  const ignoredActionLabels = new Set([
    "add store",
    "add new account",
    "update info",
    "update your info",
    "sign out",
    "log out",
    "logout",
    "exit",
  ]);

  const normalize = (value) => String(value || "")
    .replace(/[\u200E\u200F\u061C]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]/gu, "")
    .replace(/\s+(?:\u00f0|\u00e2)[^\s]{1,8}\s*$/giu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const visible = (element) => {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  };

  const text = (element) => String(element && (element.innerText || element.textContent) || "").trim();
  const ownText = (element) => Array.from(element && element.childNodes || [])
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => String(node.textContent || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const labelText = (element) => ownText(element) || text(element);
  const normalizedText = (element) => normalize(text(element));
  const normalizedLabelText = (element) => normalize(labelText(element));
  const isEmail = (value) => emailPattern.test(normalize(value));
  const sectionLabel = (element) => normalizedText(element).replace(/:$/, "");

  const isLeafTextElement = (element) => {
    if (!visible(element) || !normalizedText(element)) return false;
    if (normalizedLabelText(element)) return true;
    return !Array.from(element.children).some((child) => visible(child) && normalizedText(child));
  };

  const isIgnoredAction = (element) => {
    const action = element.closest("a, button, [role='button'], [role='menuitem']");
    if (!action) return false;
    return ignoredActionLabels.has(normalizedText(action));
  };

  const isAfterIgnoredSectionHeading = (element, surface) => {
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const headings = Array.from(ancestor.querySelectorAll(
        "h1, h2, h3, h4, h5, h6, [role='heading'], p, span, strong, b"
      ));
      if (headings.some((heading) =>
        visible(heading) &&
        ignoredSectionLabels.has(sectionLabel(heading)) &&
        !!(heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      )) {
        return true;
      }
      if (ancestor === surface) break;
    }
    return false;
  };

  const findAdjacentLabel = (emailElement, surface) => {
    for (let container = emailElement.parentElement; container; container = container.parentElement) {
      const items = Array.from(container.querySelectorAll(
        "p, span, h1, h2, h3, h4, h5, h6, strong, b, small, div"
      )).filter(isLeafTextElement);
      const emailIndex = items.indexOf(emailElement);
      if (emailIndex >= 0) {
        for (let distance = 1; distance < items.length; distance++) {
          for (const index of [emailIndex - distance, emailIndex + distance]) {
            const candidate = items[index];
            if (!candidate) continue;
            const label = normalizedLabelText(candidate);
            if (!label || isEmail(label) || ignoredSectionLabels.has(label.replace(/:$/, ""))) continue;
            if (!/[\p{L}\p{N}]/u.test(label)) continue;
            if (ignoredActionLabels.has(label) || isIgnoredAction(candidate)) continue;
            return label;
          }
        }
      }
      if (container === surface) break;
    }
    return "";
  };

  const identitySurfaces = Array.from(document.querySelectorAll(
    "[role='menu'], [role='dialog'], [role='presentation'], [class*='MuiPopover-paper'], [class*='MuiMenu-paper']"
  )).filter(visible);
  const surfaces = identitySurfaces.length ? identitySurfaces : [document.body];

  for (const surface of surfaces) {
    const emailElements = Array.from(surface.querySelectorAll(
      "p, span, h1, h2, h3, h4, h5, h6, strong, b, small, div, [data-email]"
    )).filter((element) => isLeafTextElement(element) && isEmail(text(element)));

    for (const emailElement of emailElements) {
      if (isIgnoredAction(emailElement) || isAfterIgnoredSectionHeading(emailElement, surface)) continue;
      const store = findAdjacentLabel(emailElement, surface);
      if (store) {
        return {
          email: normalize(labelText(emailElement)),
          store,
          source: "account-popover-header",
        };
      }
    }
  }

  return null;
}

function createEasyOrdersExportFlow(options = {}) {
  const config = options.config || {};
  const log = typeof options.log === "function" ? options.log : () => {};
  const emit = typeof options.emit === "function" ? options.emit : () => {};
  const flow = options.flow || "easyorders";
  const exportAttempts = Number(options.exportAttempts || 3);
  const exportNotificationPolls = Number(options.exportNotificationPolls || 4);
  const exportNotificationPollMs = Number(options.exportNotificationPollMs || 2500);
  const exportCooldownMs = Number(options.exportCooldownMs || 6 * 60 * 1000);
  const storeSelectionNavigationTimeoutMs = Math.max(
    1000,
    Number(options.storeSelectionNavigationTimeoutMs) || 45000
  );
  let identityCache = {
    verified: false,
    email: "",
    store: "",
    where: "",
  };

  function stage(stageName, status, message, extra = {}) {
    emit({ type: "stage", flow, stage: stageName, status, message, ...extra });
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

  function clearIdentityCache(reason) {
    if (identityCache.verified) {
      log(`EasyOrders identity cache cleared: ${reason}`);
    }
    identityCache = {
      verified: false,
      email: "",
      store: "",
      where: "",
    };
  }

  function identityCacheMatchesExpected() {
    return identityCache.verified &&
      identityCache.email === normalizeEmail(config.easyEmail) &&
      identityCache.store === normalizeIdentityText(config.easyStore);
  }

  async function collectIdentityEvidence(page) {
    return page.evaluate(() => {
      const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
      const hits = [];
      const seen = new Set();

      function add(source, text) {
        if (text === undefined || text === null) return;
        const value = String(text);
        const decoded = (() => {
          try { return decodeURIComponent(value); } catch (_) { return ""; }
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
          const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
          return decodeURIComponent(
            Array.from(atob(padded), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
          );
        } catch (_) {
          try {
            const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
            return atob(padded);
          } catch (__) {
            return "";
          }
        }
      }

      function scanJwt(source, text) {
        const tokens = String(text || "").match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
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
    }).catch(() => []);
  }

  function formatDataDay(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function isNetworkNavigationError(error) {
    return isRetryableNetworkError(error);
  }

  async function debugScreenshot(page, label) {
    try {
      const filePath = path.join(os.tmpdir(), `kbot-debug-${label}-${Date.now()}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      log(`[DEBUG] Screenshot saved: ${filePath}`);
      emit({ type: "debug-screenshot", path: filePath, label });
      return filePath;
    } catch (_) {}
    return "";
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

  async function readLanguageState(page) {
    return page.evaluate(() => {
      const switcher = document.querySelector('[aria-label="language-switcher"]');
      const label = switcher && switcher.querySelector("p");
      return {
        label: String(label && (label.innerText || label.textContent) || "").trim().toLowerCase(),
        documentLanguage: String(document.documentElement.lang || "").trim().toLowerCase(),
      };
    }).catch(() => ({ label: "", documentLanguage: "" }));
  }

  async function ensureEnglish(page, options = {}) {
    const force = options.force === true;
    let state = { label: "", documentLanguage: "" };
    for (let attempt = 0; attempt < 3; attempt++) {
      state = await readLanguageState(page);
      if (state.label || state.documentLanguage) break;
      if (attempt < 2) await page.waitForTimeout(1500);
    }

    const alreadyEnglish = state.label === "en" || state.documentLanguage.startsWith("en");
    if (alreadyEnglish && !force) return true;
    if (!state.label && alreadyEnglish) return true;

    const switcher = page.locator('[aria-label="language-switcher"]').first();
    if (!await switcher.count().catch(() => 0)) {
      throw new Error("EASY_ORDERS_ENGLISH_REQUIRED: language switcher was not available");
    }

    await switcher.click();
    await page.waitForTimeout(800);
    const clicked =
      await page.locator('[role="menuitem"][aria-label="english"]').click().then(() => true).catch(() => false) ||
      await page.locator('[role="menuitem"]:has-text("English")').click().then(() => true).catch(() => false) ||
      await page.locator('[role="menuitem"]:has-text("en")').click().then(() => true).catch(() => false);
    if (!clicked) {
      await page.keyboard.press("Escape").catch(() => {});
      throw new Error("EASY_ORDERS_ENGLISH_REQUIRED: English language option was not available");
    }

    await page.waitForTimeout(1500);
    state = await readLanguageState(page);
    if (state.label !== "en" && !state.documentLanguage.startsWith("en")) {
      throw new Error(`EASY_ORDERS_ENGLISH_REQUIRED: detected language "${state.label || state.documentLanguage || "unknown"}"`);
    }
    return true;
  }

  async function revealIdentityMenu(page) {
    const selectors = [
      'button[aria-label="app_bar.user_settings"]',
      '.MuiAppBar-root button[aria-label*="settings" i]',
      '[data-testid="user-avatar"]',
      '.MuiAppBar-root button:has(svg[data-testid*="Account" i])',
      'button:has(.MuiAvatar-root)',
      '.MuiAvatar-root',
      '.MuiAppBar-root button[aria-label*="account" i]',
      '.MuiAppBar-root button[aria-label*="user" i]',
    ];
    for (const selector of selectors) {
      const target = page.locator(selector).first();
      if (await target.count().catch(() => 0)) {
        try {
          await target.click({ timeout: 5000 });
          const identitySurface = page.locator(
            '[role="menu"]:visible, [role="dialog"]:visible, [class~="MuiPopover-paper"]:visible'
          ).first();
          await identitySurface.waitFor({ state: "visible", timeout: 5000 });
          return true;
        } catch (_) {}
      }
    }
    return false;
  }

  async function readActiveIdentity(page) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await revealIdentityMenu(page);
      await page.waitForTimeout(attempt === 1 ? 800 : 1500);
      try {
        const identity = await page.evaluate(parseEasyOrdersIdentityFromDocument);
        if (identity && identity.email && identity.store) return identity;
      } finally {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300).catch(() => {});
      }
    }
    return null;
  }

  async function readCurrentStore(page, identity) {
    const activeIdentity = identity === undefined ? await readActiveIdentity(page) : identity;
    return activeIdentity ? normalizeIdentityText(activeIdentity.store) : "";
  }

  async function selectExpectedStore(page) {
    const expectedStore = normalizeIdentityText(config.easyStore);
    const returnUrl = page.url();
    const shouldReturn = returnUrl &&
      returnUrl.startsWith("https://app.easy-orders.net/") &&
      !returnUrl.includes("store-selection") &&
      !returnUrl.includes("login");
    const cards = page.locator(
      ":is(.MuiCard-root, button, [role='button']):has(h1, h2, h3, h4, h5, h6, [role='heading'])"
    );

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log(`EasyOrders store recovery ${attempt}/3: opening store selection for "${config.easyStore}".`);
        await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/store-selection", "EasyOrders store selection");
        if (page.url().includes("login")) return false;

        await cards.first().waitFor({ state: "visible", timeout: 30000 });
        const availableStores = [];
        let expectedCard = null;
        const cardCount = await cards.count();
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          const nameEl = card.locator("h1, h2, h3, h4, h5, h6, [role='heading']").first();
          const rawName = await nameEl.innerText().catch(() => "");
          const normalizedName = normalizeIdentityText(rawName);
          if (normalizedName) availableStores.push(normalizedName);
          if (normalizedName === expectedStore) expectedCard = card;
        }

        if (!expectedCard) {
          throw new Error(
            `configured store was not present; available stores: ${availableStores.join(", ") || "none"}`
          );
        }

        await expectedCard.click({ timeout: 10000 });
        await page.waitForFunction(
          () => !window.location.href.includes("store-selection"),
          { timeout: storeSelectionNavigationTimeoutMs }
        );
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
        if (shouldReturn && returnUrl !== page.url()) {
          await gotoWithNetworkRetries(page, returnUrl, "EasyOrders return after store verification");
        }
        await page.waitForTimeout(2500);
        return true;
      } catch (error) {
        lastError = error;
        log(`EasyOrders store recovery ${attempt}/3 failed: ${error.message || error}`);
        if (attempt < 3) {
          await page.waitForTimeout(2000);
          await reloadWithNetworkRetries(page, "EasyOrders store recovery").catch(() => {});
          await page.waitForTimeout(2500);
        }
      }
    }

    throw new Error(
      `EASY_ORDERS_STORE_SELECTION_FAILED: could not select "${expectedStore}" after 3 attempts` +
      (lastError ? ` (${lastError.message || lastError})` : "")
    );
  }

  async function rereadIdentityAfterRecovery(page, where) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (page.url().includes("store-selection")) {
        await gotoWithNetworkRetries(page, "https://app.easy-orders.net/", "EasyOrders recovery dashboard").catch(() => {});
      }
      await page.waitForTimeout(attempt === 1 ? 2500 : 4000);
      await ensureEnglish(page).catch((error) => {
        log(`EasyOrders language check during ${where} recovery ${attempt}/3 failed: ${error.message || error}`);
      });
      const identity = await readActiveIdentity(page).catch(() => null);
      if (identity && identity.email && identity.store) return identity;
      if (attempt < 3) {
        log(`EasyOrders identity still unreadable at ${where}; reloading before retry ${attempt + 1}/3.`);
        await reloadWithNetworkRetries(page, `EasyOrders identity recovery at ${where}`).catch(() => {});
      }
    }
    return null;
  }

  async function verifyIdentity(page, where) {
    const expectedEmail = normalizeEmail(config.easyEmail);
    const expectedStore = normalizeIdentityText(config.easyStore);
    if (!expectedEmail) throw new Error("EASY_ORDERS_IDENTITY_CONFIG_MISSING: easyEmail is not set");
    if (!expectedStore) throw new Error("EASY_ORDERS_STORE_CONFIG_MISSING: easyStore is required");
    let activeIdentity = await readActiveIdentity(page).catch(() => null);
    if (activeIdentity && normalizeEmail(activeIdentity.email) !== expectedEmail) {
      await debugScreenshot(page, `easy-orders-identity-${where}`);
      throw new Error(
        `EASY_ORDERS_IDENTITY_MISMATCH: expected ${expectedEmail}, detected ${normalizeEmail(activeIdentity.email)}`
      );
    }
    let currentStore = await readCurrentStore(page, activeIdentity).catch(() => "");
    if (!activeIdentity || !currentStore || currentStore !== expectedStore) {
      const reason = currentStore
        ? `active store "${currentStore}" did not match`
        : "active store header was not readable";
      log(`EasyOrders ${reason} at ${where}; selecting configured store "${config.easyStore}" explicitly.`);
      let selected = false;
      try {
        selected = await selectExpectedStore(page);
      } catch (error) {
        log(`EasyOrders explicit store selection did not complete at ${where}: ${error.message || error}`);
      }
      // Re-read even when the navigation wait timed out. EasyOrders may finish the
      // selection API call and reload just after our wait expires.
      activeIdentity = await rereadIdentityAfterRecovery(page, where);
      currentStore = await readCurrentStore(page, activeIdentity).catch(() => "");
      if (!selected && currentStore === expectedStore) {
        log(`EasyOrders store selection completed after the navigation timeout at ${where}; recovery verified it.`);
      }
      if (selected && !currentStore) {
        const evidence = await collectIdentityEvidence(page);
        const evidenceEmails = [...new Set(evidence.map((item) => normalizeEmail(item.email)).filter(Boolean))];
        const expectedEmailVisible = evidenceEmails.includes(expectedEmail);
        const onAuthenticatedPage = await authenticatedLanding(page).catch(() => false);
        if (expectedEmailVisible && onAuthenticatedPage && !page.url().includes("login") && !page.url().includes("store-selection")) {
          activeIdentity = {
            email: expectedEmail,
            store: expectedStore,
            source: "explicit-store-selection-with-email-evidence",
          };
          currentStore = expectedStore;
          const sources = [...new Set(evidence
            .filter((item) => normalizeEmail(item.email) === expectedEmail)
            .map((item) => item.source)
          )].join(", ") || "page";
          log(`EasyOrders selected "${config.easyStore}" but the identity header stayed unreadable at ${where}; accepting verified email evidence from ${sources}.`);
        }
      }
    }
    if (activeIdentity && normalizeEmail(activeIdentity.email) !== expectedEmail) {
      await debugScreenshot(page, `easy-orders-identity-${where}`);
      throw new Error(
        `EASY_ORDERS_IDENTITY_MISMATCH: expected ${expectedEmail}, detected ${normalizeEmail(activeIdentity.email)}`
      );
    }
    if (currentStore !== expectedStore) {
      await debugScreenshot(page, `easy-orders-store-mismatch-${where}`);
      throw new Error(currentStore
        ? `EASY_ORDERS_STORE_MISMATCH: expected "${expectedStore}", detected "${currentStore}"`
        : `EASY_ORDERS_STORE_UNVERIFIED: could not verify or select expected store "${expectedStore}"`);
    }
    identityCache = {
      verified: true,
      email: expectedEmail,
      store: expectedStore,
      where,
    };
    log(`EasyOrders identity verified for this session: ${expectedEmail} / ${config.easyStore} at ${where}`);
    emit({ type: "session-event", site: "easy-orders", event: "identity-verified", email: expectedEmail, store: config.easyStore, where });
  }

  async function assertSession(page) {
    const url = page.url();
    if (url.includes("login")) {
      clearIdentityCache("login page detected");
      throw new Error(`SESSION_EXPIRED: on login page (${url})`);
    }
    if (url.includes("store-selection")) {
      clearIdentityCache("store selection page detected");
      throw new Error(`SESSION_STORE_SELECTION: on store selection page (${url})`);
    }
    const authDomPresent = await page.$('.MuiAppBar-root, [aria-label="language-switcher"], [class*="Dashboard"], [class*="OrderList"], .MuiDrawer-root, .MuiCard-root') !== null;
    if (!authDomPresent) {
      clearIdentityCache("authenticated DOM missing");
      throw new Error(`SESSION_UNVERIFIED: no authenticated EasyOrders DOM at ${url}`);
    }
    if (identityCacheMatchesExpected()) {
      log(`EasyOrders identity already verified at ${identityCache.where || "login"}; skipping repeated identity check.`);
      return;
    }
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
    clearIdentityCache("login/session check started");
    await gotoWithNetworkRetries(page, "https://app.easy-orders.net/", "EasyOrders root");
    await page.waitForTimeout(2000);
    const verificationVisible = await verificationCodeVisible(page);
    if (verificationVisible) await waitForLoginCompletion(page);
    else if (!await authenticatedLanding(page)) await doLogin(page);
    await page.waitForTimeout(1500);
    if (page.url().includes("store-selection")) {
      if (!normalizeIdentityText(config.easyStore)) {
        throw new Error("EASY_ORDERS_STORE_CONFIG_MISSING: easyStore is required");
      }
      if (!await selectExpectedStore(page)) {
        throw new Error(`EasyOrders store not found: ${config.easyStore}`);
      }
    }
    await ensureEnglish(page, { force: true });
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
      const visible = (element) => {
        if (!element || !element.isConnected) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
      };
      const normalize = (value) => String(value || "")
        .replace(/[\u200E\u200F\u061C]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const kind = (text) => {
        const value = normalize(text).toLowerCase();
        if (value.includes("الطلبات الفائتة") || value.includes("تقرير الطلبات الفائتة")) return "missed-orders";
        if (value.includes("تم انشاء ملف اكسل للطلبات") || value.includes("تم إنشاء ملف إكسل للطلبات")) return "orders";
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
      const hrefOf = (element) => {
        const link = element && (element.matches?.("a[href]") ? element : element.querySelector?.("a[href]"));
        if (!link) return "";
        try {
          return new URL(String(link.getAttribute("href") || link.href || ""), window.location.href).href;
        } catch (_) {
          return String(link.href || link.getAttribute("href") || "");
        }
      };
      const candidateSet = new Set(Array.from(document.querySelectorAll(
        "tr, [role='row'], li, .MuiCard-root, .MuiPaper-root, [class*='notification'], [class*='Notification']"
      )));
      for (const action of Array.from(document.querySelectorAll("a[href], button, [role='button']"))) {
        let node = action;
        for (let depth = 0; node && node !== document.body && depth < 8; depth++, node = node.parentElement) {
          candidateSet.add(node);
        }
      }
      const candidates = Array.from(candidateSet)
        .filter((element) => visible(element))
        .map((element) => {
          const text = normalize(element.innerText || element.textContent || "");
          const rect = element.getBoundingClientRect();
          return { element, text, top: rect.top, length: text.length };
        })
        .filter((item) => item.text && item.length >= 8 && item.length <= 2000)
        .sort((a, b) => a.top - b.top || a.length - b.length);

      for (const row of candidates) {
        const text = row.text;
        if (kind(text) !== keyword) continue;
        const href = hrefOf(row.element);
        if (href) return { href, text };
      }
      return null;
    }, { keyword });
  }

  async function summarizeNotifications(page, keyword) {
    return page.evaluate(({ keyword }) => {
      const visible = (element) => {
        if (!element || !element.isConnected) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
      };
      const normalize = (value) => String(value || "")
        .replace(/[\u200E\u200F\u061C]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const lower = (value) => normalize(value).toLowerCase();
      const candidateSet = new Set(Array.from(document.querySelectorAll(
        "tr, [role='row'], li, .MuiCard-root, .MuiPaper-root, [class*='notification'], [class*='Notification']"
      )));
      for (const action of Array.from(document.querySelectorAll("a[href], button, [role='button']"))) {
        let node = action;
        for (let depth = 0; node && node !== document.body && depth < 8; depth++, node = node.parentElement) {
          candidateSet.add(node);
        }
      }
      const rows = Array.from(candidateSet)
        .filter((row) => visible(row))
        .map((row) => {
          const text = normalize(row.innerText || row.textContent || "");
          const links = Array.from(row.querySelectorAll("a[href]"))
            .map((link) => String(link.href || ""))
            .filter(Boolean);
          const rect = row.getBoundingClientRect();
          return { text, links, top: rect.top, length: text.length };
        })
        .filter((row) => row.text)
        .filter((row) => row.length >= 8 && row.length <= 2000)
        .sort((a, b) => a.top - b.top || a.length - b.length)
        .slice(0, 8);
      const matchingRows = rows.filter((row) => {
        const text = lower(row.text);
        if (keyword === "missed-orders") {
          return text.includes("missed orders") ||
            text.includes("missed order") ||
            text.includes("الطلبات الفائتة") ||
            text.includes("تقرير الطلبات الفائتة");
        }
        return text.includes("orders exported") ||
          text.includes("orders export") ||
          text.includes("created orders excel") ||
          text.includes("تم انشاء ملف اكسل للطلبات") ||
          text.includes("تم إنشاء ملف إكسل للطلبات") ||
          text.includes("excel") ||
          text.includes("orders");
      });
      return {
        url: window.location.href,
        title: document.title || "",
        rowCount: rows.length,
        matchingCount: matchingRows.length,
        firstRows: rows.slice(0, 5).map((row) => row.text.slice(0, 220)),
        firstMatchingRows: matchingRows.slice(0, 3).map((row) => row.text.slice(0, 260)),
      };
    }, { keyword }).catch((error) => ({
      error: error && error.message ? error.message : String(error || "notification summary failed"),
    }));
  }

  async function waitForExportLink(page, keyword, attempt) {
    let lastSummary = null;
    for (let poll = 1; poll <= exportNotificationPolls; poll++) {
      stage("easyorders.notifications", "started", `Checking notifications ${poll}/${exportNotificationPolls}`, {
        attempt,
        maxAttempts: exportAttempts,
        poll,
        maxPolls: exportNotificationPolls,
      });
      await reloadWithNetworkRetries(page, "EasyOrders notifications");
      await page.waitForTimeout(exportNotificationPollMs);
      await ensureEnglish(page).catch((error) => {
        log(`EasyOrders notification language check skipped: ${error.message}`);
      });
      const result = await findExportLink(page, keyword);
      lastSummary = await summarizeNotifications(page, keyword);
      log(`EasyOrders notifications poll ${poll}/${exportNotificationPolls} for ${keyword}: ` +
        `matches=${lastSummary && lastSummary.matchingCount != null ? lastSummary.matchingCount : "?"}, ` +
        `rows=${lastSummary && lastSummary.rowCount != null ? lastSummary.rowCount : "?"}, url=${page.url()}`);
      if (lastSummary && Array.isArray(lastSummary.firstMatchingRows) && lastSummary.firstMatchingRows.length) {
        log(`EasyOrders notification candidates: ${lastSummary.firstMatchingRows.join(" | ")}`);
      } else if (lastSummary && Array.isArray(lastSummary.firstRows) && lastSummary.firstRows.length) {
        log(`EasyOrders notification visible rows: ${lastSummary.firstRows.join(" | ")}`);
      }
      if (result && result.href) {
        stage("easyorders.notifications", "ok", "Export notification link found", {
          attempt,
          poll,
          notificationText: result.text || "",
        });
        return { href: result.href, summary: lastSummary };
      }
    }
    return { href: "", summary: lastSummary };
  }

  async function triggerExport(page, exportFromDate, keyword) {
    const pageUrl = keyword === "missed-orders" ? "https://app.easy-orders.net/#/missed-orders" : "https://app.easy-orders.net/#/orders";
    let lastFailure = "";
    for (let attempt = 1; attempt <= exportAttempts; attempt++) {
      stage("easyorders.export.attempt", "started", `Attempt ${attempt}/${exportAttempts} for ${keyword}`, {
        attempt,
        maxAttempts: exportAttempts,
        keyword,
        exportFromDate: formatDataDay(exportFromDate),
      });
      await gotoWithNetworkRetries(page, pageUrl, `EasyOrders ${keyword}`);
      await page.waitForTimeout(1500);
      try {
        await assertSession(page);
      } catch (_) {
        await login(page);
        await gotoWithNetworkRetries(page, pageUrl, `EasyOrders ${keyword} after login`);
      }
      await ensureEnglish(page, { force: true });
      stage("easyorders.export.dialog", "started", `Opening export dialog for ${keyword}`);
      const exportButton = page.locator('button.MuiButton-outlined:has-text("Export"), main button:has-text("Export"), button:has-text("Export")').first();
      await exportButton.waitFor({ state: "visible", timeout: 15000 });
      await exportButton.click();
      const dialog = page.locator('div[role="dialog"]').first();
      await dialog.waitFor({ state: "visible", timeout: 8000 });
      const dateInputs = dialog.locator(".react-datepicker-wrapper input");
      await dateInputs.first().click();
      stage("easyorders.export.date", "started", `Selecting export start date ${formatDataDay(exportFromDate)}`);
      await pickDate(page, exportFromDate);
      await dialog.locator("h2").click().catch(() => {});
      await dialog.locator(".MuiDialogActions-root button").click();
      await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const toast = await page.locator('[role="alert"], .MuiSnackbarContent-root, .Toastify__toast').innerText().catch(() => "");
      const rateLimited = /5 minutes|5 دقائق|every|abuse/i.test(String(toast || ""));
      if (toast) log(`EasyOrders export toast: ${String(toast).replace(/\s+/g, " ").trim()}`);
      stage(
        "easyorders.export.requested",
        rateLimited ? "warning" : "ok",
        rateLimited ? "EasyOrders asked us to wait before exporting again" : "Export request sent to EasyOrders",
        { attempt, toast: String(toast || "").slice(0, 300) }
      );
      if (!page.url().includes("notifications")) {
        await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/notifications", "EasyOrders notifications");
      }
      const linkResult = rateLimited ? { href: "", summary: await summarizeNotifications(page, keyword) } : await waitForExportLink(page, keyword, attempt);
      if (linkResult && linkResult.href) {
        emit({ type: "export-timestamp", timestamp: Date.now() });
        return linkResult.href;
      }
      const screenshotPath = await debugScreenshot(page, `easy-orders-${keyword}-notification-missing-attempt-${attempt}`);
      const summary = linkResult && linkResult.summary || {};
      lastFailure = rateLimited
        ? `rate limited by EasyOrders toast: ${String(toast || "unknown").replace(/\s+/g, " ").trim()}`
        : `notification link not found; rows=${summary.rowCount == null ? "?" : summary.rowCount}, matches=${summary.matchingCount == null ? "?" : summary.matchingCount}`;
      log(`EasyOrders export attempt ${attempt}/${exportAttempts} did not produce a download link for ${keyword}: ${lastFailure}${screenshotPath ? ` | screenshot=${screenshotPath}` : ""}`);
      stage("easyorders.notifications", attempt < exportAttempts ? "warning" : "failed", lastFailure, {
        attempt,
        maxAttempts: exportAttempts,
        screenshotPath,
        notificationSummary: summary,
      });
      if (attempt < exportAttempts) {
        const waitMs = exportCooldownMs;
        emit({ type: "cooldown", seconds: waitMs / 1000, attempt, maxAttempts: exportAttempts });
        await page.waitForTimeout(waitMs);
      }
    }
    throw new Error(`EASY_ORDERS_EXPORT_STUCK: ${keyword} failed after ${exportAttempts} attempts. Last state: ${lastFailure || "unknown"}`);
  }

  async function download(page, url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        stage("easyorders.download", "started", `Downloading EasyOrders export (${attempt}/3)`);
        const response = await page.context().request.get(url, { timeout: 60000 });
        const buffer = Buffer.from(await response.body());
        stage("easyorders.download", "ok", `Downloaded ${buffer.length} bytes`, { bytes: buffer.length });
        return buffer;
      } catch (error) {
        stage("easyorders.download", attempt >= 3 ? "failed" : "retry", error.message || String(error), { attempt, maxAttempts: 3 });
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

module.exports = {
  createEasyOrdersExportFlow,
  parseEasyOrdersIdentityFromDocument,
};

