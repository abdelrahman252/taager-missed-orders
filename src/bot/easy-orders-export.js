"use strict";

const os = require("os");
const path = require("path");
const { isRetryableNetworkError } = require("./network-retry");
const {
  closeExportDatePicker,
  clickExportDialogSubmit,
  waitForExportOrdersDialog,
} = require("./easy-orders-export-dialog");

const EASY_ORDERS_AUTH_DOM_SELECTOR = [
  ".MuiAppBar-root",
  '[aria-label="language-switcher"]',
  '[aria-label="Open menu"]',
  '[aria-label="افتح القائمة"]',
  '[aria-label="User settings"]',
  '[aria-label="اعدادات المستخدم"]',
  '[data-testid="user-avatar"]',
  '[class*="Dashboard"]',
  '[class*="OrderList"]',
  ".MuiDrawer-root",
  ".MuiCard-root",
  'a[href="#/orders"]',
  'a[href="#/notifications"]',
].join(", ");

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
  // A single accepted export must never be submitted again just because its
  // notification is late. Re-triggering creates duplicate files and makes a
  // run appear frozen behind EasyOrders' five-minute rate limit.
  const exportAttempts = Math.max(1, Number(options.exportAttempts || 1));
  const exportNotificationPolls = Math.max(1, Number(options.exportNotificationPolls || 12));
  const exportNotificationPollMs = Math.max(250, Number(options.exportNotificationPollMs || 1200));
  const exportNotificationRefreshMs = Math.max(1200, Number(options.exportNotificationRefreshMs || 4000));
  // EasyOrders can update the notification list in two separate React passes.
  // Always perform the two proven refreshes, but wait for the table state rather
  // than sleeping for several seconds between them.
  const requiredNotificationRefreshes = 2;
  const exportNotificationMaxWaitMs = Math.max(
    15000,
    Number(options.exportNotificationMaxWaitMs || 45000)
  );
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

  function isExecutionContextNavigationError(error) {
    return /execution context was destroyed|cannot find context with specified id|most likely because of a navigation/i
      .test(String(error && error.message || error || ""));
  }

  async function evaluateWithNavigationRetry(page, label, evaluate) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await evaluate();
      } catch (error) {
        if (!isExecutionContextNavigationError(error) || attempt >= 2 || (page.isClosed && page.isClosed())) {
          if (isExecutionContextNavigationError(error) && attempt >= 2 && !(page.isClosed && page.isClosed())) {
            log(`EasyOrders ${label}: scan skipped after repeated navigation races: ${error.message}`);
            return null;
          }
          throw error;
        }
        log(`EasyOrders ${label}: page navigated during scan; waiting for the new document (${attempt}/2).`);
        await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(350).catch(() => {});
      }
    }
    return null;
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
        const interrupted = /interrupted by another navigation|navigation is interrupted/i.test(String(error && error.message || error));
        log(`Network issue while loading ${label} (${attempt}/${attempts}): ${error.message}`);
        if (interrupted) {
          // A competing SPA navigation is already in progress. Let it settle
          // instead of waiting the full network retry delay and starting a
          // second navigation that interrupts it again.
          await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(350).catch(() => {});
        } else {
          await page.waitForTimeout(waitMs);
        }
      }
    }
  }

  async function reloadWithNetworkRetries(page, label, opts = {}) {
    const attempts = Math.max(1, Number(opts.attempts || 3));
    const timeout = Math.max(1000, Number(opts.timeout || 30000));
    const waitMs = Math.max(250, Number(opts.waitMs || 5000));
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await page.reload({ waitUntil: opts.waitUntil || "domcontentloaded", timeout });
        return;
      } catch (error) {
        if (!isNetworkNavigationError(error) || attempt >= attempts) throw error;
        const interrupted = /interrupted by another navigation|navigation is interrupted/i.test(String(error && error.message || error));
        log(`Network issue while reloading ${label} (${attempt}/${attempts}): ${error.message}`);
        if (interrupted) {
          await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(350).catch(() => {});
        } else {
          await page.waitForTimeout(waitMs);
        }
      }
    }
  }

  async function readLanguageState(page) {
    return page.evaluate(() => {
      const switcher = document.querySelector(
        '[aria-label="language-switcher"], [aria-label="Change language"], [aria-label="تغيير اللغة"]'
      );
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

    const languageSelectors = [
      '[aria-label="language-switcher"]',
      '[aria-label="Change language"]',
      '[aria-label="تغيير اللغة"]',
    ];
    const findVisibleLanguageSwitcher = async () => {
      for (const selector of languageSelectors) {
        const candidate = page.locator(selector).first();
        const visible = typeof candidate.isVisible === "function"
          ? await candidate.isVisible({ timeout: 1000 }).catch(() => false)
          : await candidate.count().then((count) => count > 0).catch(() => false);
        if (visible) return candidate;
      }
      return null;
    };

    let switcher = await findVisibleLanguageSwitcher();
    if (!switcher) {
      const sidebarToggle = page.locator(
        '[aria-label="Open menu"], [aria-label="افتح القائمة"]'
      ).first();
      if (await sidebarToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sidebarToggle.click({ timeout: 5000 });
        await page.waitForTimeout(400);
      }
      switcher = await findVisibleLanguageSwitcher();
    }
    if (!switcher) {
      throw new Error("EASY_ORDERS_ENGLISH_REQUIRED: language switcher was not available");
    }

    const expanded = typeof switcher.getAttribute === "function"
      ? await switcher.getAttribute("aria-expanded").catch(() => null)
      : null;
    if (expanded !== "true") {
      await switcher.click();
    }
    await page.waitForTimeout(800);
    const englishMenu = typeof page.getByRole === "function"
      ? page.getByRole("menuitem", { name: /^English$/i }).first()
      : page.locator('[role="menuitem"]:has-text("English")').first();
    const clicked =
      await englishMenu.click().then(() => true).catch(() => false) ||
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
      'button[aria-label="User settings"]',
      'button[aria-label="اعدادات المستخدم"]',
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
    const authDomPresent = await page.$(EASY_ORDERS_AUTH_DOM_SELECTOR) !== null;
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
    return await page.$(EASY_ORDERS_AUTH_DOM_SELECTOR) !== null;
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
    const monthNames = new Map([
      ["january", 0], ["jan", 0], ["يناير", 0],
      ["february", 1], ["feb", 1], ["فبراير", 1],
      ["march", 2], ["mar", 2], ["مارس", 2],
      ["april", 3], ["apr", 3], ["أبريل", 3], ["ابريل", 3],
      ["may", 4], ["مايو", 4],
      ["june", 5], ["jun", 5], ["يونيو", 5],
      ["july", 6], ["jul", 6], ["يوليو", 6],
      ["august", 7], ["aug", 7], ["أغسطس", 7], ["اغسطس", 7],
      ["september", 8], ["sep", 8], ["sept", 8], ["سبتمبر", 8],
      ["october", 9], ["oct", 9], ["أكتوبر", 9], ["اكتوبر", 9],
      ["november", 10], ["nov", 10], ["نوفمبر", 10],
      ["december", 11], ["dec", 11], ["ديسمبر", 11],
    ]);
    const normalizeMonthToken = (value) => String(value || "")
      .replace(/[\u200E\u200F\u061C]/g, "")
      .replace(/[،,]/g, " ")
      .trim()
      .toLowerCase();
    const readShownMonthYear = async () => {
      const header = await page.$eval(".react-datepicker__current-month", (el) => el.innerText.trim()).catch(() => "");
      const cleanHeader = String(header || "").replace(/[\u200E\u200F\u061C]/g, "").trim();
      const shownYear = Number((cleanHeader.match(/\d{4}/) || [])[0]);
      const tokens = cleanHeader.split(/\s+/).map(normalizeMonthToken).filter(Boolean);
      const shownMonth = tokens.reduce((found, token) => (
        found >= 0 ? found : monthNames.has(token) ? monthNames.get(token) : -1
      ), -1);
      return { header: cleanHeader, shownMonth, shownYear };
    };
    log(`EasyOrders date picker: waiting for calendar for ${formatDataDay(targetDate)}`);
    await page.waitForSelector(".react-datepicker", { timeout: 8000 });
    for (let i = 0; i < 24; i++) {
      const { header, shownMonth, shownYear } = await readShownMonthYear();
      log(`EasyOrders date picker: visible month "${header || "empty"}" parsed as ${shownYear}-${String(shownMonth + 1).padStart(2, "0")}`);
      if (!Number.isFinite(shownYear) || shownMonth < 0) {
        throw new Error(`EASY_ORDERS_EXPORT_DATE_HEADER_UNREADABLE: "${header || "empty"}"`);
      }
      const shownTotal = shownYear * 12 + shownMonth;
      const targetTotal = targetDate.getFullYear() * 12 + targetDate.getMonth();
      if (shownTotal === targetTotal) break;
      log(`EasyOrders date picker: moving ${targetTotal < shownTotal ? "previous" : "next"} toward ${formatDataDay(targetDate)}`);
      await page.click(
        targetTotal < shownTotal ? ".react-datepicker__navigation--previous" : ".react-datepicker__navigation--next",
        { timeout: 2500 }
      );
      await page.waitForTimeout(300);
    }
    const dayClass = String(targetDate.getDate()).padStart(3, "0");
    log(`EasyOrders date picker: clicking day ${targetDate.getDate()} (${dayClass})`);
    await page.click(`.react-datepicker__day--${dayClass}:not(.react-datepicker__day--outside-month)`, { timeout: 2500 });
    log(`EasyOrders date picker: selected ${formatDataDay(targetDate)}`);
  }

  async function clickExportButton(page, exportButton, keyword) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await exportButton.waitFor({ state: "visible", timeout: 2500 });
        await exportButton.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
        if (!(await exportButton.isEnabled().catch(() => true))) {
          await page.waitForTimeout(250);
          continue;
        }
        await exportButton.click({ timeout: 2500 });
        return;
      } catch (error) {
        lastError = error;
        const clicked = await exportButton.evaluate((element) => {
          if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
          element.scrollIntoView({ block: "center", inline: "nearest" });
          element.click();
          return true;
        }).catch(() => false);
        if (clicked) return;
        await page.waitForTimeout(150);
      }
    }
    throw new Error(`EASY_ORDERS_EXPORT_BUTTON_UNAVAILABLE: ${keyword}: ${lastError && lastError.message || "Export button was not actionable"}`);
  }

  async function readOptionalExportToast(page) {
    const toastLocator = page.locator('[role="alert"], .MuiSnackbarContent-root, .Toastify__toast').first();
    if (!(await toastLocator.isVisible({ timeout: 1200 }).catch(() => false))) return "";
    return toastLocator.innerText({ timeout: 1200 }).catch(() => "");
  }

  async function refreshNotificationsForPoll(page, poll) {
    try {
      await reloadWithNetworkRetries(page, "EasyOrders notifications", {
        attempts: 1,
        timeout: 8000,
        waitMs: 500,
        waitUntil: "commit",
      });
      await page.waitForLoadState("domcontentloaded", { timeout: 12000 });
      await page.locator("body").waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(350);
      return true;
    } catch (error) {
      log(`EasyOrders notifications refresh ${poll} skipped after bounded wait: ${error.message || error}`);
      // page.reload can time out after navigation has already committed. Do
      // not evaluate the old document's DOM while Chromium is replacing its
      // execution context; wait for the new document to settle first.
      const settled = await page.waitForLoadState("domcontentloaded", { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (!settled || (page.isClosed && page.isClosed())) return false;
      await page.locator("body").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350).catch(() => {});
      log(`EasyOrders notifications refresh ${poll}: navigation settled after the reload timeout.`);
      return true;
    }
  }

  async function collectExistingExportLinks(page, keyword) {
    return page.evaluate(({ keyword }) => {
      const normalize = (value) => String(value || "")
        .replace(/[\u200E\u200F\u061C]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const hrefFor = (row) => Array.from(row.querySelectorAll("a[href]"))
        .map((link) => String(link.href || link.getAttribute("href") || ""))
        .find((href) => href && href.toLowerCase().includes(".xlsx")) || "";
      const rows = Array.from(document.querySelectorAll("table tbody tr, table tr, [role='row']"));
      return rows.map((row) => {
        const href = hrefFor(row);
        const text = normalize(row.innerText || row.textContent || "");
        const isMissed = href.toLowerCase().includes("missed-orders") || text.includes("missed orders report") || text.includes("missed order report") || text.includes("الطلبات الفائتة") || text.includes("تقرير الطلبات الفائتة");
        const matches = keyword === "missed-orders" ? isMissed : !!href && !isMissed && (text.includes("orders") || text.includes("excel") || text.includes("اكسل") || text.includes("إكسل"));
        return matches ? href : "";
      }).filter(Boolean);
    }, { keyword }).catch(() => []);
  }

  async function findExportLink(page, keyword, ignoredHrefs = []) {
    return evaluateWithNavigationRetry(page, "notification link scan", () => page.evaluate(({ keyword, ignoredHrefs }) => {
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
      // EasyOrders renders notifications as table rows. The old implementation
      // expanded every action into up to eight ancestor candidates, which made
      // the same notification appear many times and could select a stale card
      // from elsewhere on the page. Read one row per notification and use the
      // first matching row in the page's newest-first order.
      const rowSelector = "table tbody tr, table tr, [role='row']";
      const candidates = Array.from(document.querySelectorAll(rowSelector))
        .filter((element) => visible(element))
        .map((element) => {
          const text = normalize(element.innerText || element.textContent || "");
          const rect = element.getBoundingClientRect();
          return { element, text, top: rect.top };
        })
        .filter((item) => item.text && item.text.length >= 8 && item.text.length <= 2000)
        .sort((a, b) => a.top - b.top);

      for (const row of candidates) {
        const text = row.text;
        if (kind(text) !== keyword) continue;
        const href = hrefOf(row.element);
        const lowerHref = href.toLowerCase();
        if (keyword === "missed-orders" && !lowerHref.includes("missed-orders")) continue;
        if (keyword === "orders" && lowerHref.includes("missed-orders")) continue;
        if (ignoredHrefs.includes(href)) continue;
        if (href) return { href, text };
      }
      return null;
    }, { keyword, ignoredHrefs }));
  }

  async function summarizeNotifications(page, keyword) {
    const summary = await evaluateWithNavigationRetry(page, "notification summary", () => page.evaluate(({ keyword }) => {
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
      const rows = Array.from(document.querySelectorAll("table tbody tr, table tr, [role='row']"))
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
        .sort((a, b) => a.top - b.top || a.length - b.length);
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
    }, { keyword }));
    if (summary) return summary;
    return { error: "EasyOrders notification summary skipped during navigation" };
  }

  async function waitForExportLink(page, keyword, attempt, ignoredHrefs = []) {
    let lastSummary = null;
    let lastRefreshAt = 0;
    let firstMatchingResult = null;
    const startedAt = Date.now();
    for (let poll = 1; poll <= exportNotificationPolls; poll++) {
      if (Date.now() - startedAt >= exportNotificationMaxWaitMs) break;
      stage("easyorders.notifications", "started", `Checking notifications ${poll}/${exportNotificationPolls}`, {
        attempt,
        maxAttempts: exportAttempts,
        poll,
        maxPolls: exportNotificationPolls,
      });
      // EasyOrders can finish the export between the first and second
      // notifications-page load. Keep that proven two-load fallback, then
      // avoid reloading on every subsequent DOM poll.
      const needsRefresh = poll <= requiredNotificationRefreshes || (Date.now() - lastRefreshAt) >= exportNotificationRefreshMs;
      if (needsRefresh) {
        const refreshed = await refreshNotificationsForPoll(page, poll);
        lastRefreshAt = Date.now();
        if (!refreshed) {
          log(`EasyOrders notification poll ${poll} skipped because the page is still navigating.`);
          await page.waitForTimeout(exportNotificationPollMs).catch(() => {});
          continue;
        }
      }
      await page.waitForTimeout(exportNotificationPollMs);
      if (poll === 1) {
        await ensureEnglish(page).catch((error) => {
          log(`EasyOrders notification language check skipped: ${error.message}`);
        });
      }
      const result = await findExportLink(page, keyword, ignoredHrefs);
      lastSummary = await summarizeNotifications(page, keyword);
      log(`EasyOrders notifications poll ${poll}/${exportNotificationPolls} for ${keyword}: ` +
        `matches=${lastSummary && lastSummary.matchingCount != null ? lastSummary.matchingCount : "?"}, ` +
        `rows=${lastSummary && lastSummary.rowCount != null ? lastSummary.rowCount : "?"}, url=${page.url()}`);
      if (lastSummary && Array.isArray(lastSummary.firstMatchingRows) && lastSummary.firstMatchingRows.length) {
        log(`EasyOrders notification candidates: ${lastSummary.firstMatchingRows.join(" | ")}`);
      } else if (lastSummary && Array.isArray(lastSummary.firstRows) && lastSummary.firstRows.length) {
        log(`EasyOrders notification visible rows: ${lastSummary.firstRows.join(" | ")}`);
      }
      if (result && result.href && poll < requiredNotificationRefreshes) {
        // Keep the first candidate only as a fallback. The required second
        // refresh must still happen before accepting the workbook.
        firstMatchingResult = result;
        continue;
      }
      if (result && result.href) {
        log(`EasyOrders selected ${keyword} notification after refresh ${poll}: ${result.href}`);
        stage("easyorders.notifications", "ok", "Export notification link found", {
          attempt,
          poll,
          notificationText: result.text || "",
          refreshes: poll,
        });
        return { href: result.href, summary: lastSummary };
      }
      if (poll >= requiredNotificationRefreshes && firstMatchingResult) {
        // A notification can briefly disappear while the second table render
        // settles. The second refresh was completed, so use the validated first
        // candidate instead of waiting through the full notification timeout.
        log(`EasyOrders selected ${keyword} notification from refresh 1 fallback after refresh ${poll}: ${firstMatchingResult.href}`);
        stage("easyorders.notifications", "ok", "Export notification link found", {
          attempt,
          poll,
          notificationText: firstMatchingResult.text || "",
          refreshes: poll,
          fallback: true,
        });
        return { href: firstMatchingResult.href, summary: lastSummary };
      }
    }
    log(`EasyOrders notification wait ended for ${keyword} after ${Date.now() - startedAt}ms without a matching card.`);
    return { href: "", summary: lastSummary };
  }

  async function triggerExport(page, exportFromDate, keyword) {
    const pageUrl = keyword === "missed-orders" ? "https://app.easy-orders.net/#/missed-orders" : "https://app.easy-orders.net/#/orders";
    let existingNotificationHrefs = [];
    // Do not accept an older same-day workbook while EasyOrders is still
    // generating the new one. The notification page keeps many real/missed
    // cards with identical report dates, so the baseline must be captured
    // before submitting this export request.
    try {
      if (!page.url().includes("notifications")) {
        await gotoWithNetworkRetries(page, "https://app.easy-orders.net/#/notifications", "EasyOrders notification baseline");
      }
      existingNotificationHrefs = await collectExistingExportLinks(page, keyword);
      log(`EasyOrders notification baseline for ${keyword}: ${existingNotificationHrefs.length} existing workbook link(s).`);
    } catch (error) {
      log(`EasyOrders notification baseline unavailable for ${keyword}; continuing with first matching card only: ${error.message || error}`);
    }
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
      // Login already establishes English. Re-check the current DOM without
      // forcing the language menu open on every real/missed export; reopening
      // that menu adds latency and can interrupt the export button on the new
      // EasyOrders layout.
      await ensureEnglish(page);
      stage("easyorders.export.dialog", "started", `Opening export dialog for ${keyword}`);
      // The page-level control is the outlined button beside Create Order.
      // Keep it outside the dialog flow; the modal's submit button is a text
      // button and must be resolved only after the dialog is visible.
      const exportButton = page.locator('button.MuiButton-outlined:visible').filter({ hasText: /^\s*Export\s*$/i }).first();
      await exportButton.waitFor({ state: "visible", timeout: 15000 });
      await clickExportButton(page, exportButton, keyword);
      const dialog = await waitForExportOrdersDialog(page, keyword);
      // EasyOrders now renders the datepicker inputs directly inside the
      // dialog; the old `.react-datepicker-wrapper input` wrapper is gone.
      const dateInputs = dialog.locator('input[type="text"]');
      if ((await dateInputs.count().catch(() => 0)) < 1) {
        throw new Error("EASY_ORDERS_EXPORT_DATE_INPUT_UNAVAILABLE: no text date input found in export dialog");
      }
      await dateInputs.first().click({ timeout: 5000 });
      stage("easyorders.export.date", "started", `Selecting export start date ${formatDataDay(exportFromDate)}`);
      await pickDate(page, exportFromDate);
      log(`EasyOrders export date selected for ${keyword}; closing calendar`);
      // Wait for the date picker to actually disappear before locating the
      // modal submit button; Escape returning does not mean the UI has settled.
      await closeExportDatePicker(page, keyword);
      log(`EasyOrders export calendar close attempted for ${keyword}; submitting dialog`);
      await clickExportDialogSubmit(page, dialog, keyword);
      log(`EasyOrders export submit clicked for ${keyword}; waiting for dialog to close`);
      await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
      log(`EasyOrders export dialog close wait finished for ${keyword}`);
      await page.waitForTimeout(1000);
      const toast = await readOptionalExportToast(page);
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
      const linkResult = rateLimited ? { href: "", summary: await summarizeNotifications(page, keyword) } : await waitForExportLink(page, keyword, attempt, existingNotificationHrefs);
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
      // The request was already accepted when there is no rate-limit toast.
      // Do not submit the same export again after a missing/late notification.
      // If EasyOrders explicitly rate-limited the request, surface that state
      // immediately so the user can retry later without blocking the app.
      const errorCode = rateLimited
        ? "EASY_ORDERS_EXPORT_RATE_LIMITED"
        : "EASY_ORDERS_NOTIFICATION_TIMEOUT";
      throw new Error(`${errorCode}: ${keyword} export was not downloadable after the bounded notification wait. ${lastFailure}`);
    }
    throw new Error(`EASY_ORDERS_EXPORT_STUCK: ${keyword} failed after ${exportAttempts} attempts. Last state: ${lastFailure || "unknown"}`);
  }

  async function download(page, url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        stage("easyorders.download", "started", `Downloading EasyOrders export (${attempt}/3)`);
        let buffer;
        // The notification link is a signed object-storage URL. Download it
        // with the process HTTP client so a page/context closing during the
        // export cannot dispose the Playwright API request context underneath
        // this operation.
        if (typeof fetch === "function") {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 60000);
          try {
            const response = await fetch(url, { redirect: "follow", signal: controller.signal });
            if (!response.ok) {
              const error = new Error(`EASY_ORDERS_DOWNLOAD_HTTP_${response.status}: ${url}`);
              error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
              throw error;
            }
            buffer = Buffer.from(await response.arrayBuffer());
          } finally {
            clearTimeout(timer);
          }
        } else {
          const response = await page.context().request.get(url, { timeout: 60000 });
          const status = response.status();
          if (!response.ok()) {
            const error = new Error(`EASY_ORDERS_DOWNLOAD_HTTP_${status}: ${url}`);
            error.retryable = status === 408 || status === 429 || status >= 500;
            throw error;
          }
          buffer = Buffer.from(await response.body());
        }
        if (!buffer.length) throw new Error(`EASY_ORDERS_DOWNLOAD_EMPTY: ${url}`);
        stage("easyorders.download", "ok", `Downloaded ${buffer.length} bytes`, { bytes: buffer.length });
        return buffer;
      } catch (error) {
        stage("easyorders.download", attempt >= 3 ? "failed" : "retry", error.message || String(error), { attempt, maxAttempts: 3 });
        if (!(isNetworkNavigationError(error) || error.retryable === true) || attempt >= 3) throw error;
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

