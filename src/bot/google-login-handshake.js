"use strict";

const { normalizeTaagerCountry, taagerUrl } = require("./taager-country");

function createGoogleLoginRequestId() {
  return `google-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function tryAutomatedGooglePopupLoginV2(page, email, log) {
  const targetEmail = String(email || "").trim().toLowerCase();
  if (!targetEmail) {
    log && log("[GoogleLogin][Auto] skipped: no Google email saved for this account");
    return false;
  }

  try {
    log && log(`[GoogleLogin][Auto] trying saved Google account popup for ${targetEmail}`);
    const context = page.context();
    const pagesBefore = new Set(context.pages());
    const popupPromise = Promise.race([
      page.waitForEvent("popup", { timeout: 15000 }).catch(() => null),
      context.waitForEvent("page", { timeout: 15000 }).catch(() => null),
    ]);

    await page.locator("#login, button:has-text('Google')").first().click({ timeout: 10000 });

    let popup = await popupPromise;
    if (!popup) {
      popup = context.pages().find((candidate) => {
        return !pagesBefore.has(candidate) && /accounts\.google\.com|google/i.test(candidate.url());
      }) || null;
    }
    if (!popup) {
      log && log("[GoogleLogin][Auto] no Google popup was captured");
      return false;
    }

    await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    log && log(`[GoogleLogin][Auto] popup opened url=${popup.url()}`);

    let clickedAccount = false;
    for (let attempt = 1; attempt <= 20 && !clickedAccount; attempt++) {
      await popup.waitForTimeout(500).catch(() => {});
      clickedAccount = await popup.evaluate((expectedEmail) => {
        const norm = (value) => String(value || "").trim().toLowerCase();
        const exact = (value) => norm(value) === expectedEmail;
        const all = Array.from(document.querySelectorAll("[data-identifier], [data-email]"));
        let match = all.find((el) => exact(el.getAttribute("data-identifier")) || exact(el.getAttribute("data-email")));
        if (!match) match = all.find((el) => norm(el.innerText || el.textContent).includes(expectedEmail));
        if (!match) return false;

        const clickable = match.closest("[data-identifier], [role='link'], [role='button'], button, a, li") || match;
        clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        clickable.click();
        clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        return true;
      }, targetEmail).catch(() => false);

      if (!clickedAccount && attempt % 4 === 0) {
        const visibleCandidates = await popup.evaluate(() => {
          return Array.from(document.querySelectorAll("[data-identifier], [data-email]")).map((el) => ({
            identifier: el.getAttribute("data-identifier") || "",
            email: el.getAttribute("data-email") || "",
            text: String(el.innerText || el.textContent || "").trim().slice(0, 120),
          }));
        }).catch(() => []);
        log && log(`[GoogleLogin][Auto] waiting for saved account ${targetEmail}; visible candidates=${JSON.stringify(visibleCandidates)}`);
      }
    }

    if (!clickedAccount) {
      log && log(`[GoogleLogin][Auto] saved account ${targetEmail} was not visible in popup`);
      await popup.close().catch(() => {});
      return false;
    }
    log && log(`[GoogleLogin][Auto] clicked saved account ${targetEmail}`);

    for (let step = 1; step <= 8; step++) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      await popup.waitForTimeout(1000).catch(() => {});
      if (popup.isClosed()) break;

      const challenge = await popup.evaluate(() => {
        const text = String(document.body && document.body.innerText || "").toLowerCase();
        const hasVerificationInput = !!document.querySelector(
          'input[type="password"], input[autocomplete="current-password"], ' +
          'input[autocomplete="one-time-code"], input[inputmode="numeric"], ' +
          'input[type="tel"], [data-challengetype]'
        );
        const challengeText = [
          "2-step verification",
          "two-step verification",
          "verify it's you",
          "verify it’s you",
          "check your phone",
          "enter the code",
          "verification code",
          "get a verification code",
          "confirm your recovery",
          "tap yes on your phone",
          "use your passkey",
          "try another way",
          "security key",
        ].find((pattern) => text.includes(pattern)) || "";
        return {
          needed: hasVerificationInput || !!challengeText,
          reason: challengeText || (hasVerificationInput ? "verification input" : ""),
        };
      }).catch(() => ({ needed: false, reason: "" }));
      const challengeUrl = popup.url();
      if (challenge.needed || /\/signin\/.*challenge|\/challenge\//i.test(challengeUrl)) {
        log && log(`[GoogleLogin][Auto] Google verification challenge detected (${challenge.reason || challengeUrl}); falling back to manual Chrome`);
        await popup.close().catch(() => {});
        return false;
      }

      const blocked = await popup.evaluate(() => {
        const body = String(document.body && document.body.innerText || "");
        return /couldn'?t sign you in|not secure|browser.*not secure/i.test(body);
      }).catch(() => false);
      if (blocked) {
        log && log("[GoogleLogin][Auto] Google blocked automated browser; falling back to manual Chrome");
        await popup.close().catch(() => {});
        return false;
      }

      const clickedContinue = await popup.evaluate(() => {
        const textOf = (el) => String(el && (el.innerText || el.textContent || el.value) || "").trim().toLowerCase();
        const isVisible = (el) => {
          if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const patterns = [
          "continue",
          "allow",
          "next",
          "yes, continue",
          "متابعة",
          "السماح",
          "التالي",
          "تأكيد",
          "نعم، متابعة",
          "نعم، أوافق",
        ];
        const negativePatterns = ["cancel", "back", "use another", "إلغاء", "رجوع", "استخدام حساب آخر"];
        const controls = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit'], div[role='link']"));
        let btn = controls.find((el) => {
          const text = textOf(el);
          if (!text || !isVisible(el)) return false;
          if (negativePatterns.some((pattern) => text.includes(pattern))) return false;
          return patterns.some((pattern) => text.includes(pattern));
        });
        if (!btn) {
          const visibleControls = controls.filter((el) => {
            const text = textOf(el);
            if (!isVisible(el)) return false;
            if (negativePatterns.some((pattern) => text.includes(pattern))) return false;
            return true;
          });
          btn = visibleControls[visibleControls.length - 1] || null;
        }
        if (!btn) return false;
        btn.click();
        return true;
      }).catch(() => false);
      if (clickedContinue) log && log(`[GoogleLogin][Auto] clicked Google continue/allow step ${step}`);
    }

    await Promise.race([
      popup.waitForEvent("close", { timeout: 30000 }).catch(() => null),
      page.waitForURL((url) => !String(url).includes("/login") && !String(url).includes("/auth"), { timeout: 30000 }).catch(() => null),
    ]);

    if (!popup.isClosed()) await popup.close().catch(() => {});
    await page.waitForTimeout(2000).catch(() => {});
    const loggedIn = !page.url().includes("/login") && !page.url().includes("/auth");
    if (!loggedIn) {
      log && log("[GoogleLogin][Auto] popup automation did not finish login; manual Google flow will be used");
    }
    log && log(`[GoogleLogin][Auto] finished; loggedIn=${loggedIn} url=${page.url()}`);
    return loggedIn;
  } catch (error) {
    log && log(`[GoogleLogin][Auto] failed: ${error && error.message || error}`);
    return false;
  }
}

async function tryAutomatedGooglePopupLogin(page, email, log) {
  const targetEmail = String(email || "").trim().toLowerCase();
  if (!targetEmail) {
    log && log("[GoogleLogin][Auto] skipped: no Google email saved for this account");
    return false;
  }

  try {
    log && log(`[GoogleLogin][Auto] trying saved Google account popup for ${targetEmail}`);
    const popupPromise = page.waitForEvent("popup", { timeout: 10000 }).catch(() => null);
    await page.locator("#login, button:has-text('Google'), button:has-text('جوجل')").first().click({ timeout: 10000 });
    const popup = await popupPromise;
    if (!popup) {
      log && log("[GoogleLogin][Auto] no Google popup was captured");
      return false;
    }

    await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    log && log(`[GoogleLogin][Auto] popup opened url=${popup.url()}`);

    const clickedAccount = await popup.evaluate((email) => {
      const norm = (value) => String(value || "").trim().toLowerCase();
      const matchesEmail = (el) => {
        if (!el) return false;
        const attrs = ["data-email", "data-identifier", "aria-label", "title"];
        if (attrs.some((attr) => norm(el.getAttribute && el.getAttribute(attr)).includes(email))) return true;
        return norm(el.innerText || el.textContent).includes(email);
      };
      const nodes = Array.from(document.querySelectorAll("[data-email], [data-identifier], [role='link'], [role='button'], button, div, li"));
      const match = nodes.find(matchesEmail);
      if (!match) return false;
      const clickable = match.closest("[role='link'], [role='button'], button, a, li") || match;
      clickable.click();
      return true;
    }, targetEmail).catch(() => false);

    if (!clickedAccount) {
      log && log(`[GoogleLogin][Auto] saved account ${targetEmail} was not visible in popup`);
      await popup.close().catch(() => {});
      return false;
    }
    log && log(`[GoogleLogin][Auto] clicked saved account ${targetEmail}`);

    for (let step = 1; step <= 4; step++) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      await popup.waitForTimeout(1000).catch(() => {});
      if (popup.isClosed()) break;

      const blocked = await popup.evaluate(() => /couldn'?t sign you in|not secure|browser.*not secure|لا يمكن تسجيل دخولك/i.test(document.body && document.body.innerText || "")).catch(() => false);
      if (blocked) {
        log && log("[GoogleLogin][Auto] Google blocked automated browser; falling back to manual Chrome");
        await popup.close().catch(() => {});
        return false;
      }

      const clickedContinue = await popup.evaluate(() => {
        const textOf = (el) => String(el && (el.innerText || el.textContent || el.value) || "").trim().toLowerCase();
        const patterns = [
          "continue",
          "allow",
          "تأكيد",
          "متابعة",
          "السماح",
        ];
        const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"));
        const btn = buttons.find((el) => patterns.some((pattern) => textOf(el).includes(pattern)));
        if (!btn) return false;
        btn.click();
        return true;
      }).catch(() => false);
      if (clickedContinue) log && log(`[GoogleLogin][Auto] clicked Google continue/allow step ${step}`);
    }

    await Promise.race([
      popup.waitForEvent("close", { timeout: 30000 }).catch(() => null),
      page.waitForURL((url) => !String(url).includes("/login") && !String(url).includes("/auth"), { timeout: 30000 }).catch(() => null),
    ]);

    if (!popup.isClosed()) await popup.close().catch(() => {});
    await page.waitForTimeout(2000).catch(() => {});
    const loggedIn = !page.url().includes("/login") && !page.url().includes("/auth");
    log && log(`[GoogleLogin][Auto] finished; loggedIn=${loggedIn} url=${page.url()}`);
    return loggedIn;
  } catch (error) {
    log && log(`[GoogleLogin][Auto] failed: ${error && error.message || error}`);
    return false;
  }
}

function waitForManualGoogleLogin({ config, country, chromePath, timeoutMs, log }) {
  const requestId = createGoogleLoginRequestId();
  const profilePath = config.profilePath || "";
  const loginUrl = taagerUrl(normalizeTaagerCountry(country || "sa"), "/auth/login");
  const accountLabel = config.label || config.accountLabel || config.easyEmail || config.taagerEmail || "Taager account";
  const accountId = config.id || config.accountId || "__single__";

  if (!process.send) throw new Error("Google login requires app IPC, but process.send is unavailable");

  log && log(`[GoogleLogin] request created id=${requestId} account="${accountLabel}" url=${loginUrl}`);
  log && log("[GoogleLogin] asking app to open normal Chrome with the bot profile");
  process.send({
    type: "google-login-needed",
    requestId,
    profilePath,
    chromePath,
    loginUrl,
    accountId,
    accountLabel,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Google login timeout - click 'I finished Google login' after logging in, or retry the run."));
    }, timeoutMs || 10 * 60 * 1000);

    function cleanup() {
      clearTimeout(timer);
      process.off("message", onMessage);
    }

    function onMessage(message) {
      if (!message || message.requestId !== requestId) return;
      if (message.type === "google-login-failed") {
        log && log(`[GoogleLogin] Chrome open failed id=${requestId}: ${message.error || "unknown error"}`);
        cleanup();
        reject(new Error(message.error || "Google login Chrome window could not be opened"));
        return;
      }
      if (message.type !== "google-login-finished") return;
      log && log(`[GoogleLogin] user clicked done id=${requestId}; continuing verification`);
      cleanup();
      resolve({ requestId });
    }

    process.on("message", onMessage);
  });
}

module.exports = {
  tryAutomatedGooglePopupLogin: tryAutomatedGooglePopupLoginV2,
  waitForManualGoogleLogin,
};
