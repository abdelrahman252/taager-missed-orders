"use strict";

const KNOWN_CLOSE_SELECTORS = [
  '[onclick*="MoeOsm.dismissMessage"]',
  '[onclick*="MoeOsm.trackDismiss"]',
  '[data-name="close-popup"]',
  '[data-type="editor"][data-name="close-popup"]',
  ".brz-popup2__close",
  ".brz-popup2__inner .brz-popup2__close",
  '[data-custom-id$="--close"]',
  '[class*="popup" i] [class*="close" i]',
  '[class*="modal" i] [class*="close" i]',
  '[class*="moe" i] [class*="close" i]',
];

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
  await page.waitForTimeout(250).catch(() => {});
  return hasVisibleOverlayWithoutCalendar(page);
}

async function clearTaagerInterruption(page, options = {}) {
  const log = typeof options.log === "function" ? options.log : null;

  const knownSelector = await clickFirstVisible(page, KNOWN_CLOSE_SELECTORS);
  if (knownSelector) {
    await page.waitForTimeout(400).catch(() => {});
    if (!await overlayStillVisible(page)) {
      if (log) log(`Taager interruption guard: closed popup via ${knownSelector}`);
      return { cleared: true, method: knownSelector };
    }
    if (log) log(`Taager interruption guard: clicked ${knownSelector}, but overlay is still visible`);
  }

  if (!await hasVisibleOverlayWithoutCalendar(page)) {
    return { cleared: false, method: "" };
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250).catch(() => {});
  if (!await overlayStillVisible(page)) {
    if (log) log("Taager interruption guard: closed popup via Escape");
    return { cleared: true, method: "escape" };
  }

  const closeControl = await clickCloseLookingOverlayControl(page);
  if (closeControl) {
    await page.waitForTimeout(400).catch(() => {});
    if (!await overlayStillVisible(page)) {
      if (log) log("Taager interruption guard: clicked close-looking overlay control");
      return { cleared: true, method: "close-looking-control" };
    }
    if (log) log("Taager interruption guard: close-looking overlay control did not clear overlay");
  }

  if (await hasVisibleOverlayWithoutCalendar(page)) {
    const clickedTopRight = await clickTopRightOverlayClose(page);
    if (clickedTopRight) {
      await page.waitForTimeout(500).catch(() => {});
      if (!await overlayStillVisible(page)) {
        if (log) log("Taager interruption guard: closed popup via top-right overlay X");
        return { cleared: true, method: "top-right-overlay-x" };
      }
      if (log) log("Taager interruption guard: top-right overlay click did not clear overlay");
    }
  }

  if (!options.skipOutsideClick && await hasVisibleOverlayWithoutCalendar(page)) {
    await page.mouse.click(10, 10).catch(() => {});
    await page.waitForTimeout(400).catch(() => {});
    if (!await overlayStillVisible(page)) {
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
    await clearTaagerInterruption(page, options).catch(() => ({ cleared: false }));
    if (!options.allowBlockingOverlay && await hasVisibleOverlayWithoutCalendar(page)) {
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
      if (!options.allowBlockingOverlay && await hasVisibleOverlayWithoutCalendar(page)) {
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
  await clearTaagerInterruption(page, options).catch(() => ({ cleared: false }));
  const target = await waitForTaagerTarget(page, selector, label, options);
  try {
    await target.click({ timeout: options.clickTimeout || 5000, noWaitAfter: !!options.noWaitAfter });
  } catch (error) {
    if (!isProbablyPopupBlockerError(error)) throw error;
    await clearTaagerInterruption(page, options).catch(() => ({ cleared: false }));
    await target.click({ timeout: options.clickTimeout || 5000, noWaitAfter: !!options.noWaitAfter });
  }
}

module.exports = {
  clearTaagerInterruption,
  waitForTaagerTarget,
  safeTaagerClick,
  isProbablyPopupBlockerError,
  hasVisibleOverlayWithoutCalendar,
};
