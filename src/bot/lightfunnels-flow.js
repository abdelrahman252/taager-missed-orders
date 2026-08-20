"use strict";

const os = require("os");
const path = require("path");
const { isRetryableNetworkError } = require("./network-retry");

const LIGHTFUNNELS_AUTH_URL = "https://app.lightfunnels.com/admin/auth";
const LIGHTFUNNELS_CHOOSE_ACCOUNT_URL = "https://app.lightfunnels.com/admin/choose-account";
const LIGHTFUNNELS_ADMIN_URL = "https://app.lightfunnels.com/admin";
const ARABIC_LANGUAGE_LABEL = "\u0627\u0644\u0639\u0631\u0628\u064a\u0629";

function createLightFunnelsFlow(options = {}) {
  const config = options.config || {};
  const log = typeof options.log === "function" ? options.log : () => {};
  const emit = typeof options.emit === "function" ? options.emit : () => {};
  const waitForManualGoogleLogin = options.waitForManualGoogleLogin;
  const closeForManualGoogle = typeof options.closeForManualGoogle === "function" ? options.closeForManualGoogle : null;
  const relaunchAfterManualGoogle = typeof options.relaunchAfterManualGoogle === "function" ? options.relaunchAfterManualGoogle : null;
  const chromePathProvider = typeof options.chromePathProvider === "function" ? options.chromePathProvider : () => config.chromePath;

  let identityCache = {
    verified: false,
    accountName: "",
    where: "",
  };

  function stage(stageName, status, message, extra = {}) {
    emit({ type: "stage", flow: "lightfunnels", stage: stageName, status, message, ...extra });
  }

  function normalizeIdentityText(value) {
    return String(value || "")
      .replace(/[\u200E\u200F\u061C]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function expectedAccountName() {
    return normalizeIdentityText(config.lightfunnelsAccountName || config.lightfunnelsStore || config.lightfunnelsAccount || "");
  }

  function lightfunnelsLoginMethod() {
    return String(config.lightfunnelsLoginMethod || "email").trim().toLowerCase() === "google" ? "google" : "email";
  }

  function isEnglishLanguageState(state) {
    if (!state) return false;
    if (state.lang && state.lang.startsWith("en")) return true;
    if (state.dir === "ltr") return true;
    if (state.englishLogin || state.englishAdmin) return true;
    return false;
  }

  function clearIdentityCache(reason) {
    if (identityCache.verified) log(`LightFunnels identity cache cleared: ${reason}`);
    identityCache = { verified: false, accountName: "", where: "" };
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

  function isAuthUrl(url) {
    const value = String(url || "");
    return value.includes("/admin/auth");
  }

  function isChooseAccountUrl(url) {
    const value = String(url || "");
    return value.includes("/admin/choose-account");
  }

  function isAdminUrl(url) {
    const value = String(url || "");
    return value.includes("/admin") && !isAuthUrl(value) && !isChooseAccountUrl(value);
  }

  async function readLanguageState(page) {
    return page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const bodyText = clean(document.body && document.body.innerText || "");
      return {
        dir: String(document.documentElement && document.documentElement.dir || "").trim().toLowerCase(),
        lang: String(document.documentElement && document.documentElement.lang || "").trim().toLowerCase(),
        bodyText: bodyText.slice(0, 1200),
        englishLogin: bodyText.includes("Log in to your account") || bodyText.includes("Choose Account"),
        englishAdmin: ["Home", "Dashboard", "Orders", "Products", "Customers", "Settings", "Create New Order", "New Order"]
          .some((marker) => bodyText.includes(marker)),
        footerLanguage: Array.from(document.querySelectorAll("div, span, button, a"))
          .map((el) => clean(el.innerText || el.textContent))
          .find((text) => text === "English" || text === "Arabic" || text.includes("العربية") || text.includes("English")) || "",
      };
    }).catch(() => ({ dir: "", lang: "", bodyText: "", englishLogin: false, englishAdmin: false, footerLanguage: "" }));
  }

  async function clickVisibleText(page, texts) {
    return page.evaluate((labels) => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const expected = labels.map(normalize).filter(Boolean);
      const visible = (el) => {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const nodes = Array.from(document.querySelectorAll("button, a, [role='button'], [role='menuitem'], div, span"));
      for (const node of nodes) {
        if (!visible(node)) continue;
        const text = normalize(node.innerText || node.textContent);
        if (!expected.some((label) => text === label || text.includes(label))) continue;
        const clickable = node.closest("button, a, [role='button'], [role='menuitem']") ||
          Array.from(function* ancestors(el) {
            for (let item = el; item; item = item.parentElement) yield item;
          }(node)).find((el) => visible(el) && window.getComputedStyle(el).cursor === "pointer") ||
          node;
        clickable.click();
        return true;
      }
      return false;
    }, texts).catch(() => false);
  }

  async function clickBottomLanguageControl(page, texts) {
    return page.evaluate((labels) => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const expected = labels.map(normalize).filter(Boolean);
      const visible = (el) => {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], [role='menuitem'], div, span"))
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ node, rect }) => visible(node) && rect.top > window.innerHeight * 0.45)
        .sort((a, b) => b.rect.top - a.rect.top);
      for (const { node } of candidates) {
        const text = normalize(node.innerText || node.textContent);
        if (!expected.some((label) => text === label || text.includes(label))) continue;
        let clickable = node.closest("button, a, [role='button'], [role='menuitem']");
        for (let el = node; !clickable && el; el = el.parentElement) {
          if (visible(el) && window.getComputedStyle(el).cursor === "pointer") clickable = el;
        }
        (clickable || node).click();
        return true;
      }
      return false;
    }, texts).catch(() => false);
  }

  async function ensureEnglish(page, opts = {}) {
    const requireEnglish = opts.require === true;
    let state = await readLanguageState(page);
    if ((state.lang && state.lang.startsWith("en")) || state.dir === "ltr" || state.englishLogin) return true;

    log(`LightFunnels language check: current lang="${state.lang || "unknown"}" dir="${state.dir || "unknown"}"; trying English.`);
    const opened = await clickVisibleText(page, ["English", "العربية", "Arabic"]);
    if (opened) {
      await page.waitForTimeout(700).catch(() => {});
      await clickVisibleText(page, ["English", "en"]);
      await page.waitForTimeout(1200).catch(() => {});
    }

    state = await readLanguageState(page);
    const english = (state.lang && state.lang.startsWith("en")) || state.dir === "ltr" || state.englishLogin;
    if (!english && requireEnglish) {
      await debugScreenshot(page, "lightfunnels-language");
      throw new Error(`LIGHTFUNNELS_ENGLISH_REQUIRED: detected lang="${state.lang || "unknown"}" dir="${state.dir || "unknown"}"`);
    }
    if (!english) log("LightFunnels language could not be confirmed as English; continuing with stable input/name selectors.");
    return english;
  }

  async function ensureLightFunnelsEnglish(page, opts = {}) {
    const requireEnglish = opts.require === true;
    let state = await readLanguageState(page);
    if (isEnglishLanguageState(state)) return true;

    log(`LightFunnels language check: current lang="${state.lang || "unknown"}" dir="${state.dir || "unknown"}"; trying English.`);
    const labels = ["English", ARABIC_LANGUAGE_LABEL, "Arabic"];
    const opened = await clickBottomLanguageControl(page, labels) || await clickVisibleText(page, labels);
    if (opened) {
      await page.waitForTimeout(700).catch(() => {});
      await clickVisibleText(page, ["English", "en"]);
      await page.waitForTimeout(1200).catch(() => {});
    }

    state = await readLanguageState(page);
    const english = isEnglishLanguageState(state);
    if (!english && requireEnglish) {
      await debugScreenshot(page, "lightfunnels-language");
      throw new Error(`LIGHTFUNNELS_ENGLISH_REQUIRED: detected lang="${state.lang || "unknown"}" dir="${state.dir || "unknown"}"`);
    }
    if (!english) log("LightFunnels language could not be confirmed as English; continuing with stable input/name selectors.");
    return english;
  }

  async function waitForAuthLanding(page, label = "login") {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5 * 60 * 1000) {
      const url = page.url();
      if (isChooseAccountUrl(url) || isAdminUrl(url)) return url;
      if (await verificationOrErrorVisible(page)) {
        stage("lightfunnels.login", "waiting", "Waiting for LightFunnels verification or account confirmation");
      }
      await page.waitForTimeout(2500);
    }
    await debugScreenshot(page, `lightfunnels-${label}-timeout`);
    throw new Error("LIGHTFUNNELS_LOGIN_TIMEOUT: login did not reach account selection or admin within 5 minutes");
  }

  async function verificationOrErrorVisible(page) {
    return page.evaluate(() => {
      const text = String(document.body && document.body.innerText || "").toLowerCase();
      return text.includes("verification") ||
        text.includes("two-factor") ||
        text.includes("2fa") ||
        text.includes("incorrect") ||
        text.includes("invalid") ||
        text.includes("رمز");
    }).catch(() => false);
  }

  async function emailPasswordLogin(page) {
    if (!config.lightfunnelsEmail || !config.lightfunnelsPassword) {
      throw new Error("LIGHTFUNNELS_CREDENTIALS_MISSING: email/password login requires lightfunnelsEmail and lightfunnelsPassword");
    }

    await gotoWithNetworkRetries(page, LIGHTFUNNELS_AUTH_URL, "LightFunnels auth");
    await ensureLightFunnelsEnglish(page);
    await page.waitForSelector('input[name="email"]', { timeout: 30000 });
    await page.fill('input[name="email"]', config.lightfunnelsEmail);
    await page.fill('input[name="password"]', config.lightfunnelsPassword);

    const clicked = await page.locator('button:has-text("Login")').click({ timeout: 10000 }).then(() => true).catch(() => false) ||
      await clickVisibleText(page, ["Login"]);
    if (!clicked) {
      await debugScreenshot(page, "lightfunnels-login-button-missing");
      throw new Error("LIGHTFUNNELS_LOGIN_BUTTON_MISSING: could not find Login button");
    }
    await waitForAuthLanding(page, "email-login");
  }

  async function googleLogin(page) {
    if (typeof waitForManualGoogleLogin !== "function") {
      throw new Error("LIGHTFUNNELS_GOOGLE_LOGIN_UNAVAILABLE: manual Google handshake is not configured");
    }
    if (closeForManualGoogle) await closeForManualGoogle();
    await waitForManualGoogleLogin({
      config: {
        ...config,
        googleLoginUrl: LIGHTFUNNELS_AUTH_URL,
        accountLabel: config.lightfunnelsAccountName || config.label || "LightFunnels account",
      },
      chromePath: config.chromePath || chromePathProvider(),
      timeoutMs: 10 * 60 * 1000,
      log,
    });
    if (relaunchAfterManualGoogle) {
      page = await relaunchAfterManualGoogle("lightfunnels-google-login", LIGHTFUNNELS_ADMIN_URL);
    }
    await gotoWithNetworkRetries(page, LIGHTFUNNELS_ADMIN_URL, "LightFunnels admin after Google login", { attempts: 2 });
    await page.waitForTimeout(1500).catch(() => {});
    await ensureLightFunnelsEnglish(page).catch((error) => {
      log(`LightFunnels language check after Google login skipped: ${error.message || error}`);
    });
    if (isAuthUrl(page.url())) {
      throw new Error("LIGHTFUNNELS_GOOGLE_LOGIN_NOT_DETECTED: still on auth after manual Google login");
    }
    return page;
  }

  async function readChooseAccountOptions(page) {
    return page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const visible = (el) => {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const ignored = new Set(["ACCOUNTS:", "PARTNER ACCOUNT:", "Create New Account", "Back to login", "Choose Account", "Choose an account to log into."]);
      const values = [];
      const nodes = Array.from(document.querySelectorAll("div, span, button, a"));
      for (const node of nodes) {
        if (!visible(node)) continue;
        const text = clean(node.innerText || node.textContent);
        if (!text || ignored.has(text) || text.length > 80) continue;
        if (/^(accounts|partner account):?$/i.test(text)) continue;
        const style = window.getComputedStyle(node);
        const clickable = style.cursor === "pointer" || !!node.closest("button, a, [role='button']");
        if (clickable && !values.includes(text)) values.push(text);
      }
      return values;
    }).catch(() => []);
  }

  async function clickConfiguredAccount(page) {
    const expected = expectedAccountName();
    if (!expected) throw new Error("LIGHTFUNNELS_ACCOUNT_CONFIG_MISSING: lightfunnelsAccountName is required");

    const result = await page.evaluate((expectedName) => {
      const normalize = (value) => String(value || "")
        .replace(/[\u200E\u200F\u061C]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const visible = (el) => {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const badText = /create new account|back to login|partner account|choose account/i;
      const nodes = Array.from(document.querySelectorAll("div, span, button, a"));
      const available = [];
      for (const node of nodes) {
        if (!visible(node)) continue;
        const text = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
        const normalized = normalize(text);
        if (text && text.length <= 80 && !badText.test(text) && !available.includes(text)) {
          const cursor = window.getComputedStyle(node).cursor;
          if (cursor === "pointer" || node.closest("button, a, [role='button']")) available.push(text);
        }
        if (normalized !== expectedName) continue;
        let clickable = node.closest("button, a, [role='button']");
        for (let el = node; !clickable && el; el = el.parentElement) {
          if (visible(el) && window.getComputedStyle(el).cursor === "pointer") clickable = el;
        }
        if (!clickable || !visible(clickable)) continue;
        clickable.click();
        return { clicked: true, available };
      }
      return { clicked: false, available };
    }, expected).catch((error) => ({ clicked: false, available: [], error: error.message || String(error) }));

    if (!result.clicked) {
      const options = result.available && result.available.length ? result.available : await readChooseAccountOptions(page);
      await debugScreenshot(page, "lightfunnels-account-not-found");
      throw new Error(`LIGHTFUNNELS_ACCOUNT_NOT_FOUND: expected "${config.lightfunnelsAccountName}", available: ${options.join(", ") || "none"}`);
    }

    await page.waitForFunction(
      () => window.location.href.includes("/admin") && !window.location.href.includes("/choose-account") && !window.location.href.includes("/auth"),
      { timeout: 45000 }
    );
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200).catch(() => {});
  }

  async function readAdminIdentity(page) {
    return page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const visible = (el) => {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const title = clean(document.title || "");
      const headerText = Array.from(document.querySelectorAll("header, [class*='top'], [class*='actions'], [class*='t7z2X'], div, span"))
        .filter(visible)
        .map((el) => clean(el.innerText || el.textContent))
        .filter((text) => text && text.length <= 160)
        .slice(0, 80);
      return {
        title,
        headerText,
        h1h2: Array.from(document.querySelectorAll("h1,h2,h3")).map((el) => clean(el.textContent)).filter(Boolean).slice(0, 20),
        url: window.location.href,
      };
    }).catch(() => ({ title: "", headerText: [], h1h2: [], url: page.url() }));
  }

  async function verifyIdentity(page, where) {
    const expected = expectedAccountName();
    if (!expected) throw new Error("LIGHTFUNNELS_ACCOUNT_CONFIG_MISSING: lightfunnelsAccountName is required");
    if (!isAdminUrl(page.url())) {
      throw new Error(`LIGHTFUNNELS_SESSION_UNVERIFIED: expected admin URL, got ${page.url()}`);
    }

    const identity = await readAdminIdentity(page);
    const titleAccount = normalizeIdentityText(String(identity.title || "").split("|")[0]);
    const headerMatch = (identity.headerText || []).some((text) => normalizeIdentityText(text) === expected || normalizeIdentityText(text).includes(expected));
    const titleMatch = titleAccount === expected || normalizeIdentityText(identity.title).includes(expected);
    if (!titleMatch && !headerMatch) {
      await debugScreenshot(page, `lightfunnels-identity-${where}`);
      throw new Error(
        `LIGHTFUNNELS_ACCOUNT_MISMATCH: expected "${config.lightfunnelsAccountName}", title="${identity.title || ""}"`
      );
    }

    identityCache = { verified: true, accountName: expected, where };
    log(`LightFunnels identity verified for this session: ${config.lightfunnelsAccountName} at ${where}`);
    emit({
      type: "session-event",
      site: "lightfunnels",
      event: "identity-verified",
      accountName: config.lightfunnelsAccountName,
      where,
      url: page.url(),
    });
  }

  async function ensureExpectedAccount(page) {
    const expected = expectedAccountName();
    if (!expected) throw new Error("LIGHTFUNNELS_ACCOUNT_CONFIG_MISSING: lightfunnelsAccountName is required");

    if (isAdminUrl(page.url())) {
      try {
        await verifyIdentity(page, "admin-existing");
        await ensureLightFunnelsEnglish(page).catch((error) => {
          log(`LightFunnels admin language check skipped: ${error.message || error}`);
        });
        return page;
      } catch (error) {
        log(`LightFunnels active account mismatch or unreadable (${error.message}); opening account selection.`);
        clearIdentityCache("admin identity mismatch");
      }
    }

    if (!isChooseAccountUrl(page.url())) {
      await gotoWithNetworkRetries(page, LIGHTFUNNELS_CHOOSE_ACCOUNT_URL, "LightFunnels choose account");
      await page.waitForTimeout(1000).catch(() => {});
    }
    if (isAuthUrl(page.url())) return page;
    await clickConfiguredAccount(page);
    await verifyIdentity(page, "account-selected");
    await ensureLightFunnelsEnglish(page).catch((error) => {
      log(`LightFunnels admin language check skipped after account selection: ${error.message || error}`);
    });
    return page;
  }

  async function login(page) {
    clearIdentityCache("login/session check started");
    const expected = expectedAccountName();
    if (!expected) throw new Error("LIGHTFUNNELS_ACCOUNT_CONFIG_MISSING: lightfunnelsAccountName is required");

    stage("lightfunnels.login", "started", `Opening LightFunnels for ${config.lightfunnelsAccountName}`);
    await gotoWithNetworkRetries(page, LIGHTFUNNELS_ADMIN_URL, "LightFunnels admin");
    await page.waitForTimeout(1500).catch(() => {});

    if (isAdminUrl(page.url()) || isChooseAccountUrl(page.url())) {
      page = await ensureExpectedAccount(page);
      stage("lightfunnels.login", "ok", `LightFunnels account selected: ${config.lightfunnelsAccountName}`);
      return page;
    }

    if (lightfunnelsLoginMethod() === "google") {
      stage("lightfunnels.login", "started", "Waiting for LightFunnels Google login");
      page = await googleLogin(page);
    } else {
      stage("lightfunnels.login", "started", "Logging into LightFunnels with email/password");
      await emailPasswordLogin(page);
    }

    page = await ensureExpectedAccount(page);
    stage("lightfunnels.login", "ok", `LightFunnels account selected: ${config.lightfunnelsAccountName}`);
    return page;
  }

  async function assertSession(page) {
    if (identityCache.verified && identityCache.accountName === expectedAccountName()) {
      await ensureLightFunnelsEnglish(page).catch((error) => {
        log(`LightFunnels admin language check skipped during cached session assert: ${error.message || error}`);
      });
      return;
    }
    await verifyIdentity(page, "assert");
    await ensureLightFunnelsEnglish(page).catch((error) => {
      log(`LightFunnels admin language check skipped during session assert: ${error.message || error}`);
    });
  }

  return {
    login,
    assertSession,
    verifyIdentity,
    ensureEnglish: ensureLightFunnelsEnglish,
    readChooseAccountOptions,
    constants: {
      LIGHTFUNNELS_AUTH_URL,
      LIGHTFUNNELS_CHOOSE_ACCOUNT_URL,
      LIGHTFUNNELS_ADMIN_URL,
    },
  };
}

module.exports = {
  createLightFunnelsFlow,
  LIGHTFUNNELS_AUTH_URL,
  LIGHTFUNNELS_CHOOSE_ACCOUNT_URL,
  LIGHTFUNNELS_ADMIN_URL,
};
