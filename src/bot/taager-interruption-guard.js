"use strict";

const KNOWN_CLOSE_SELECTORS = [
  '[onclick*="MoeOsm.dismissMessage"]',
  '[onclick*="MoeOsm.trackDismiss"]',
  '.brz-popup2__close[data-custom-id$="--close"]',
  '[data-name="close-popup"]',
  '[data-type="editor"][data-name="close-popup"]',
  ".brz-popup2__close",
  ".brz-popup2__inner .brz-popup2__close",
  '[data-custom-id$="--close"]',
  '[class*="popup" i] [class*="close" i]',
  '[class*="modal" i] [class*="close" i]',
  '[class*="moe" i] [class*="close" i]',
];

function withInterruptionTimeout(label, timeoutMs, fn) {
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

async function safeInterruptionStep(page, label, timeoutMs, fn, fallback, log) {
  try {
    return await withInterruptionTimeout(label, timeoutMs, fn);
  } catch (error) {
    if (log) log(`Taager interruption guard: ${label} timed out/failed: ${error.message}`);
    return fallback;
  }
}

function taagerPopupAutoDismissScript() {
  if (window.__taagerPopupAutoDismissInstalled) return;
  window.__taagerPopupAutoDismissInstalled = true;

  const isTaagerPage = () => /(^|\.)taager\.com$/i.test(location.hostname || "");
  const visible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || 1) > 0.01 &&
      rect.width > 0 &&
      rect.height > 0;
  };
  const fireClick = (el) => {
    const PointerCtor = typeof window.PointerEvent === "function" ? window.PointerEvent : MouseEvent;
    el.dispatchEvent(new PointerCtor("pointerdown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new PointerCtor("pointerup", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    if (typeof el.click === "function") el.click();
  };
  const dismissViaClose = () => {
    const closeSelectors = [
      '.brz-popup2__close[data-custom-id$="--close"]',
      ".brz-popup2__close",
      '[onclick*="MoeOsm.dismissMessage"]',
      '[onclick*="MoeOsm.trackDismiss"]',
      '[data-custom-id$="--close"]',
      '[data-name="close-popup"]',
      '[data-type="editor"][data-name="close-popup"]',
    ];
    const close = closeSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((el) => el.closest(".brz-popup2__close, [onclick], button, [role='button'], [tabindex]") || el)
      .find(visible);
    if (!close) return false;

    const onclick = String(close.getAttribute("onclick") || "");
    const messageIdMatch = onclick.match(/MoeOsm\.(?:dismissMessage|trackDismiss)\(['"]([^'"]+)['"]\)/);
    const messageId = messageIdMatch && messageIdMatch[1] ? messageIdMatch[1] : "";
    fireClick(close);
    if (messageId && window.MoeOsm) {
      try {
        if (typeof window.MoeOsm.trackDismiss === "function") window.MoeOsm.trackDismiss(messageId);
        if (typeof window.MoeOsm.dismissMessage === "function") window.MoeOsm.dismissMessage(messageId);
      } catch (_) {}
    }
    return true;
  };
  const hideShells = () => {
    const roots = Array.from(document.querySelectorAll(
      ".brz-popup2, .brz-popup2__inner, [class*='brz-popup'], [class*='moengage' i], [class*='moe-' i]"
    )).filter((el) =>
      visible(el) &&
      (el.matches(".brz-popup2, .brz-popup2__inner, [class*='brz-popup']") ||
        el.querySelector('.brz-popup2__close, [onclick*="MoeOsm.dismissMessage"], [data-name="close-popup"]'))
    );
    const shells = new Set();
    for (const root of roots) {
      let shell = root;
      for (let node = root; node && node !== document.body; node = node.parentElement) {
        const cls = String(node.className || "");
        const style = window.getComputedStyle(node);
        if (/\b(brz-popup|moe|moengage)\b/i.test(cls) || style.position === "fixed") shell = node;
      }
      shells.add(shell);
    }
    for (const shell of shells) {
      shell.setAttribute("aria-hidden", "true");
      shell.style.setProperty("pointer-events", "none", "important");
      shell.style.setProperty("display", "none", "important");
      shell.style.setProperty("visibility", "hidden", "important");
    }
    return shells.size;
  };
  const tick = () => {
    if (!isTaagerPage()) return;
    dismissViaClose();
    window.setTimeout(hideShells, 120);
  };
  const start = () => {
    tick();
    if (document.body && !window.__taagerPopupAutoDismissObserver) {
      window.__taagerPopupAutoDismissObserver = new MutationObserver(tick);
      window.__taagerPopupAutoDismissObserver.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "aria-hidden"],
      });
    }
    window.setInterval(tick, 700);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

async function installTaagerInterruptionAutoDismiss(target, options = {}) {
  const log = typeof options.log === "function" ? options.log : null;
  if (!target) return false;
  const script = taagerPopupAutoDismissScript;
  if (typeof target.addInitScript === "function") {
    await target.addInitScript(script).catch((error) => {
      if (log) log(`Taager interruption guard: auto-dismiss init install failed: ${error.message}`);
    });
  }
  if (typeof target.pages === "function" && typeof target.on === "function" && !target.__taagerAutoDismissPageListener) {
    target.__taagerAutoDismissPageListener = true;
    target.on("page", (page) => {
      page.evaluate(script).catch(() => {});
      page.on("domcontentloaded", () => page.evaluate(script).catch(() => {}));
    });
  }
  const pages = typeof target.pages === "function" ? target.pages() : [target];
  for (const page of pages) {
    if (!page || typeof page.evaluate !== "function" || page.isClosed && page.isClosed()) continue;
    await page.evaluate(script).catch(() => {});
    if (typeof page.on === "function" && !page.__taagerAutoDismissDomListener) {
      page.__taagerAutoDismissDomListener = true;
      page.on("domcontentloaded", () => page.evaluate(script).catch(() => {}));
    }
  }
  if (log) log("Taager interruption guard: auto-dismiss installed");
  return true;
}

function waitForPageQuiet(page, ms = 250) {
  return page.waitForTimeout(ms).catch(() => {});
}

function isProbablyPopupBlockerError(error) {
  const message = String(error && error.message || error || "").toLowerCase();
  return message.includes("taager_blocking_overlay") ||
    message.includes("timeout") ||
    message.includes("intercepts pointer events") ||
    message.includes("not visible") ||
    message.includes("not enabled") ||
    message.includes("element is outside of the viewport") ||
    message.includes("element is not attached") ||
    message.includes("target closed");
}

async function dismissKnownMarketingPopup(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || 1) > 0.01 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const fireClick = (el) => {
      const PointerCtor = typeof window.PointerEvent === "function" ? window.PointerEvent : MouseEvent;
      el.dispatchEvent(new PointerCtor("pointerdown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new PointerCtor("pointerup", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (typeof el.click === "function") el.click();
    };
    const closeSelectors = [
      '.brz-popup2__close[data-custom-id$="--close"]',
      ".brz-popup2__close",
      '[onclick*="MoeOsm.dismissMessage"]',
      '[onclick*="MoeOsm.trackDismiss"]',
      '[data-custom-id$="--close"]',
      '[data-name="close-popup"]',
      '[data-type="editor"][data-name="close-popup"]',
    ];
    const close = closeSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((el) => el.closest(".brz-popup2__close, [onclick], button, [role='button'], [tabindex]") || el)
      .find(visible);
    if (!close) return { clicked: false, api: false, selector: "" };

    const onclick = String(close.getAttribute("onclick") || "");
    const messageIdMatch = onclick.match(/MoeOsm\.(?:dismissMessage|trackDismiss)\(['"]([^'"]+)['"]\)/);
    const messageId = messageIdMatch && messageIdMatch[1] ? messageIdMatch[1] : "";

    fireClick(close);

    let api = false;
    if (messageId && window.MoeOsm) {
      try {
        if (typeof window.MoeOsm.trackDismiss === "function") window.MoeOsm.trackDismiss(messageId);
        if (typeof window.MoeOsm.dismissMessage === "function") window.MoeOsm.dismissMessage(messageId);
        api = true;
      } catch (_) {}
    }

    return {
      clicked: true,
      api,
      selector: close.className ? `.${String(close.className).trim().split(/\s+/).join(".")}` : close.tagName.toLowerCase(),
    };
  }).catch(() => ({ clicked: false, api: false, selector: "" }));
}

async function hideKnownMarketingPopupShell(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || 1) > 0.01 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const roots = Array.from(document.querySelectorAll(
      ".brz-popup2, .brz-popup2__inner, [class*='brz-popup'], [class*='moengage' i], [class*='moe-' i]"
    )).filter((el) =>
      visible(el) &&
      (el.matches(".brz-popup2, .brz-popup2__inner, [class*='brz-popup']") ||
        el.querySelector('.brz-popup2__close, [onclick*="MoeOsm.dismissMessage"], [data-name="close-popup"]'))
    );
    const removable = new Set();
    for (const root of roots) {
      let shell = root;
      for (let node = root; node && node !== document.body; node = node.parentElement) {
        const cls = String(node.className || "");
        const style = window.getComputedStyle(node);
        if (/\b(brz-popup|moe|moengage)\b/i.test(cls) || style.position === "fixed") {
          shell = node;
        }
      }
      removable.add(shell);
    }
    for (const root of removable) {
      root.setAttribute("aria-hidden", "true");
      root.style.pointerEvents = "none";
      root.style.display = "none";
      if (root.parentElement &&
        root.parentElement !== document.body &&
        root.parentElement !== document.documentElement &&
        root.parentElement.children.length === 1) {
        root.parentElement.style.pointerEvents = "none";
        root.parentElement.style.display = "none";
      }
    }
    return removable.size;
  }).catch(() => 0);
}

async function clickFirstVisible(page, selectors, timeout = 700) {
  for (const selector of selectors) {
    const locator = page.locator(selector).filter({
      hasNot: page.locator('[role="grid"]'),
    }).first();
    if (await locator.isVisible({ timeout }).catch(() => false)) {
      await locator.evaluate((el) => {
        const clickable = el.closest(".brz-popup2__close, [onclick], button, [role='button'], [tabindex]") || el;
        clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }).catch(async () => {
        await locator.click({ timeout: 1500, force: true }).catch(() => {});
      });
      return selector;
    }
  }
  return "";
}

function visibleOverlayPredicateSource() {
  return `
    (el) => {
      if (!el || el.querySelector('[role="grid"]') || el.closest('[role="dialog"]:has([role="grid"])')) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const z = Number(style.zIndex);
      if (style.visibility === "hidden" ||
        style.display === "none" ||
        style.pointerEvents === "none" ||
        el.getAttribute("aria-hidden") === "true" ||
        el.inert ||
        Number(style.opacity || 1) <= 0.01 ||
        rect.width <= 0 ||
        rect.height <= 0) {
        return false;
      }
      const className = String(el.className || "");
      const isKnownPopup = /\\b(brz-popup|moe|moengage)\\b/i.test(className) ||
        !!el.querySelector('.brz-popup2__close, [onclick*="MoeOsm.dismissMessage"], [data-name="close-popup"]');
      return isKnownPopup ||
        rect.width > window.innerWidth * 0.35 &&
        rect.height > window.innerHeight * 0.25 &&
        (style.position === "fixed" || style.position === "sticky" || Number.isFinite(z) && z >= 1000);
    }
  `;
}

async function clickCloseLookingOverlayControl(page) {
  return page.evaluate(() => {
    const CLOSE_TEXTS = ["close", "x", "\u00d7", "\u0625\u063a\u0644\u0627\u0642", "\u0627\u063a\u0644\u0627\u0642"];
    const visible = (el) => {
      if (!el || el.closest('[role="dialog"]:has([role="grid"])')) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || 1) > 0.01 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const isOverlayish = (el) => {
      if (!el || el.closest('[role="dialog"]:has([role="grid"])')) return false;
      const style = window.getComputedStyle(el);
      const z = Number(style.zIndex);
      return style.position === "fixed" ||
        style.position === "sticky" ||
        Number.isFinite(z) && z >= 1000 ||
        /\b(popup|modal|overlay|brz-popup|moe|moengage)\b/i.test(el.className || "");
    };
    const insideOverlay = (el) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (isOverlayish(node)) return true;
      }
      return false;
    };
    const closeLike = (el) => {
      const text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const label = String(el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
      const cls = String(el.className || "").toLowerCase();
      return CLOSE_TEXTS.some((item) => text === item || label.includes(item)) ||
        /\b(close|dismiss)\b/i.test(cls);
    };
    const candidates = Array.from(document.querySelectorAll("button, [role='button'], a, div, span, svg"))
      .filter((el) => visible(el) && closeLike(el) && insideOverlay(el));
    if (!candidates.length) return "";
    candidates[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return candidates[0].outerHTML.slice(0, 160);
  }).catch(() => "");
}

async function clickTopRightOverlayClose(page) {
  const point = await page.evaluate((predicateSource) => {
    const visible = eval(predicateSource);
    const overlays = Array.from(document.querySelectorAll("body *"))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, area: rect.width * rect.height };
      })
      .sort((a, b) => b.area - a.area);
    const overlay = overlays[0];
    if (!overlay) return null;
    const x = Math.max(overlay.left + 12, Math.min(overlay.right - 22, window.innerWidth - 12));
    const y = Math.max(overlay.top + 12, Math.min(overlay.top + 22, window.innerHeight - 12));
    return { x, y };
  }, visibleOverlayPredicateSource()).catch(() => null);
  if (!point) return false;
  await page.mouse.click(point.x, point.y).catch(() => {});
  return true;
}

async function hasVisibleOverlayWithoutCalendar(page) {
  return page.evaluate((predicateSource) => {
    const visible = eval(predicateSource);
    return Array.from(document.querySelectorAll("body *")).some(visible);
  }, visibleOverlayPredicateSource()).catch(() => false);
}

async function overlayStillVisible(page) {
  await waitForPageQuiet(page);
  return hasVisibleOverlayWithoutCalendar(page);
}

async function clearTaagerInterruption(page, options = {}) {
  const log = typeof options.log === "function" ? options.log : null;

  const marketingDismiss = await safeInterruptionStep(
    page,
    "dismiss known marketing popup",
    3000,
    () => dismissKnownMarketingPopup(page),
    { clicked: false, api: false, selector: "" },
    log
  );
  if (marketingDismiss.clicked) {
    await waitForPageQuiet(page, 500);
    if (!await safeInterruptionStep(page, "check overlay after marketing close", 2500, () => overlayStillVisible(page), true, log)) {
      if (log) log(`Taager interruption guard: closed marketing popup via ${marketingDismiss.selector || "known close"}${marketingDismiss.api ? " + MoeOsm API" : ""}`);
      return { cleared: true, method: "marketing-popup" };
    }
    const hiddenCount = await safeInterruptionStep(page, "hide marketing popup shell", 2500, () => hideKnownMarketingPopupShell(page), 0, log);
    if (hiddenCount) {
      await waitForPageQuiet(page);
      if (!await safeInterruptionStep(page, "check overlay after hiding marketing shell", 2500, () => overlayStillVisible(page), true, log)) {
        if (log) log(`Taager interruption guard: hid stale marketing popup shell (${hiddenCount})`);
        return { cleared: true, method: "marketing-popup-shell" };
      }
    }
    if (log) log("Taager interruption guard: marketing popup close was clicked, but an overlay is still visible");
  }

  const knownSelector = await safeInterruptionStep(page, "click known popup close", 3000, () => clickFirstVisible(page, KNOWN_CLOSE_SELECTORS), "", log);
  if (knownSelector) {
    await waitForPageQuiet(page, 400);
    if (!await safeInterruptionStep(page, "check overlay after known close", 2500, () => overlayStillVisible(page), true, log)) {
      if (log) log(`Taager interruption guard: closed popup via ${knownSelector}`);
      return { cleared: true, method: knownSelector };
    }
    const hiddenCount = await safeInterruptionStep(page, "hide popup shell after known close", 2500, () => hideKnownMarketingPopupShell(page), 0, log);
    if (hiddenCount) {
      await waitForPageQuiet(page);
      if (!await safeInterruptionStep(page, "check overlay after hiding known shell", 2500, () => overlayStillVisible(page), true, log)) {
        if (log) log(`Taager interruption guard: hid stale popup shell after ${knownSelector} (${hiddenCount})`);
        return { cleared: true, method: "known-popup-shell" };
      }
    }
    if (log) log(`Taager interruption guard: clicked ${knownSelector}, but overlay is still visible`);
  }

  if (!await safeInterruptionStep(page, "check visible overlay", 2500, () => hasVisibleOverlayWithoutCalendar(page), false, log)) {
    return { cleared: false, method: "" };
  }

  await page.keyboard.press("Escape").catch(() => {});
  await waitForPageQuiet(page);
  if (!await safeInterruptionStep(page, "check overlay after Escape", 2500, () => overlayStillVisible(page), true, log)) {
    if (log) log("Taager interruption guard: closed popup via Escape");
    return { cleared: true, method: "escape" };
  }

  const closeControl = await safeInterruptionStep(page, "click close-looking overlay control", 3000, () => clickCloseLookingOverlayControl(page), "", log);
  if (closeControl) {
    await waitForPageQuiet(page, 400);
    if (!await safeInterruptionStep(page, "check overlay after close-looking control", 2500, () => overlayStillVisible(page), true, log)) {
      if (log) log("Taager interruption guard: clicked close-looking overlay control");
      return { cleared: true, method: "close-looking-control" };
    }
    if (log) log("Taager interruption guard: close-looking overlay control did not clear overlay");
  }

  if (await safeInterruptionStep(page, "check overlay before top-right close", 2500, () => hasVisibleOverlayWithoutCalendar(page), false, log)) {
    const clickedTopRight = await safeInterruptionStep(page, "click top-right overlay close", 3000, () => clickTopRightOverlayClose(page), false, log);
    if (clickedTopRight) {
      await waitForPageQuiet(page, 500);
      if (!await safeInterruptionStep(page, "check overlay after top-right close", 2500, () => overlayStillVisible(page), true, log)) {
        if (log) log("Taager interruption guard: closed popup via top-right overlay X");
        return { cleared: true, method: "top-right-overlay-x" };
      }
      if (log) log("Taager interruption guard: top-right overlay click did not clear overlay");
    }
  }

  if (!options.skipOutsideClick && await safeInterruptionStep(page, "check overlay before outside click", 2500, () => hasVisibleOverlayWithoutCalendar(page), false, log)) {
    await page.mouse.click(10, 10).catch(() => {});
    await waitForPageQuiet(page, 400);
    if (!await safeInterruptionStep(page, "check overlay after outside click", 2500, () => overlayStillVisible(page), true, log)) {
      if (log) log("Taager interruption guard: closed popup via outside click");
      return { cleared: true, method: "outside-click" };
    }
    if (log) log("Taager interruption guard: tried outside click, but overlay is still visible");
    return { cleared: false, method: "outside-click", blocked: true };
  }

  return { cleared: false, method: "" };
}

async function waitForTaagerTarget(page, selector, label, options = {}) {
  const timeout = options.timeout || 30000;
  const interval = options.interval || 1500;
  const state = options.state || "visible";
  const blockingOverlayTimeout = options.blockingOverlayTimeout || 5000;
  const started = Date.now();
  let lastError = null;
  let blockingOverlaySince = 0;

  while (Date.now() - started < timeout) {
    await safeInterruptionStep(page, `clear interruption before ${label || selector}`, 4000, () => clearTaagerInterruption(page, options), { cleared: false }, options.log);
    const hasBlockingOverlay = !options.allowBlockingOverlay &&
      await safeInterruptionStep(page, `check blocking overlay before ${label || selector}`, 2500, () => hasVisibleOverlayWithoutCalendar(page), false, options.log);
    if (hasBlockingOverlay) {
      if (!blockingOverlaySince) blockingOverlaySince = Date.now();
      const blockedFor = Date.now() - blockingOverlaySince;
      lastError = new Error(`TAAGER_BLOCKING_OVERLAY: ${label || selector} is blocked by a popup overlay for ${Math.round(blockedFor / 1000)}s`);
      if (blockedFor >= blockingOverlayTimeout) throw lastError;
      await page.waitForTimeout(Math.min(500, interval)).catch(() => {});
      continue;
    }
    blockingOverlaySince = 0;
    try {
      await page.locator(selector).first().waitFor({ state, timeout: Math.min(interval, timeout) });
      const overlayAfterTarget = !options.allowBlockingOverlay &&
        await safeInterruptionStep(page, `check blocking overlay after ${label || selector}`, 2500, () => hasVisibleOverlayWithoutCalendar(page), false, options.log);
      if (overlayAfterTarget) {
        lastError = new Error(`TAAGER_BLOCKING_OVERLAY: ${label || selector} is visible but a popup overlay is still blocking Taager`);
        await page.waitForTimeout(500).catch(() => {});
        continue;
      }
      return page.locator(selector).first();
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250).catch(() => {});
    }
  }

  throw new Error(`TAAGER_TARGET_TIMEOUT: ${label || selector} was not ${state} after ${timeout}ms${lastError ? ` (${lastError.message})` : ""}`);
}

async function safeTaagerClick(page, selector, label, options = {}) {
  await safeInterruptionStep(page, `clear interruption before click ${label || selector}`, 4000, () => clearTaagerInterruption(page, options), { cleared: false }, options.log);
  const target = await waitForTaagerTarget(page, selector, label, options);
  try {
    await target.click({ timeout: options.clickTimeout || 5000, noWaitAfter: !!options.noWaitAfter });
  } catch (error) {
    if (!isProbablyPopupBlockerError(error)) throw error;
    await safeInterruptionStep(page, `clear interruption after blocked click ${label || selector}`, 4000, () => clearTaagerInterruption(page, options), { cleared: false }, options.log);
    await target.click({ timeout: options.clickTimeout || 5000, noWaitAfter: !!options.noWaitAfter });
  }
}

module.exports = {
  installTaagerInterruptionAutoDismiss,
  clearTaagerInterruption,
  waitForTaagerTarget,
  safeTaagerClick,
  isProbablyPopupBlockerError,
  hasVisibleOverlayWithoutCalendar,
};
