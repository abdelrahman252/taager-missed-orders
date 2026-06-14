"use strict";

const path = require("path");
const { _electron: electron } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const QA_USER_DATA_DIR = path.join(ROOT, ".codex-tmp", "qa-pages-electron-user-data");

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1180, height: 720 },
  { width: 1100, height: 720 },
];

const PAGE_TARGETS = [
  { key: "account", id: "page-setup", mount: "setupAccounts" },
  { key: "setup-run", id: "page-setup", mount: "setupRun" },
  { key: "run", id: "page-run", mount: "run" },
  { key: "results", id: "page-results", mount: "results" },
  { key: "analytics", id: "page-analytics", mount: "analytics" },
  { key: "operations", id: "page-operations", mount: "operations" },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + " timed out after " + ms + "ms")), ms);
    }),
  ]);
}

function makeOrder(i) {
  const statuses = ["delivered", "confirmed", "in shipping", "failed", "awaiting confirmation"];
  return {
    sku: "SKU-" + String(1000 + i),
    productName: ["Shield Pro Bundle", "COD Growth Pack", "Fast Shipping Kit", "ROI Starter Box"][i % 4],
    name: "Customer " + (i + 1),
    phone: "96650000" + String(1000 + i),
    city: ["Riyadh", "Jeddah", "Dammam", "Makkah"][i % 4],
    date: "2026-06-" + String((i % 10) + 1).padStart(2, "0"),
    qty: (i % 3) + 1,
    amountDue: 120 + i * 3,
    subtotal: 120 + i * 3,
    marketerCommission: 18 + (i % 5) * 4,
    orderStatus: statuses[i % statuses.length],
    createdAt: "2026-06-" + String((i % 10) + 1).padStart(2, "0"),
    paymentMethod: i % 5 === 0 ? "prepaid" : "cod",
    source: i % 4 === 0 ? "missed" : "real",
    taagerOrderNumber: "QA-" + String(20000 + i),
  };
}

function makeRuns() {
  return Array.from({ length: 6 }, (_, runIdx) => {
    const orders = Array.from({ length: 18 }, (_, i) => makeOrder(runIdx * 18 + i));
    return {
      runId: "qa-page-run-" + (runIdx + 1),
      runDate: orders[0].date,
      runTimestamp: Date.now() - runIdx * 86400000,
      accountId: runIdx % 2 ? "qa-jeddah" : "qa-riyadh",
      accountEmail: runIdx % 2 ? "jeddah-store@example.com" : "riyadh-store@example.com",
      accountLabel: runIdx % 2 ? "Jeddah Store" : "Riyadh Store",
      orders,
      ordersSubmitted: orders.filter((o) => !String(o.orderStatus).toLowerCase().includes("failed")).length,
      ordersFailed: orders.filter((o) => String(o.orderStatus).toLowerCase().includes("failed")).length,
      durationMs: 1000 * (70 + runIdx * 12),
    };
  });
}

function makeResultData() {
  const orders = Array.from({ length: 24 }, (_, i) => makeOrder(i));
  return {
    newOrders: orders.slice(0, 18),
    inTaager: orders.slice(18, 20),
    duplicates: orders.slice(20, 22),
    failedOnTaager: orders.slice(22),
    allOrders: orders,
    uploadedOrders: orders.slice(0, 16),
    failedOrders: {
      errorRows: orders.slice(22).map((order, index) => ({
        row: index + 1,
        sku: order.sku,
        product: order.productName,
        phone: order.phone,
        error: "QA rejection reason with a longer message",
      })),
      summary: [{ productName: "Shield Pro Bundle", count: 2 }],
    },
    skippedOrders: {
      count: 2,
      rows: orders.slice(20, 22).map((order) => ({
        name: order.name,
        rawPhone: order.phone,
        normalizedPhone: order.phone,
        productName: order.productName,
        reason: "phone_parse_failed",
        uploadedWithWarning: false,
      })),
    },
    productStats: {
      "Shield Pro Bundle": { ok: 7, fail: 1 },
      "COD Growth Pack": { ok: 6, fail: 1 },
      "Fast Shipping Kit": { ok: 5, fail: 0 },
    },
    _accountLabel: "QA Riyadh Store",
  };
}

async function launchApp() {
  const app = await withTimeout(electron.launch({
    cwd: ROOT,
    args: [ROOT],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TAAGER_QA_USER_DATA_DIR: QA_USER_DATA_DIR,
    },
  }), 20000, "Playwright Electron launch");
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  return {
    page,
    close: async () => app.evaluate(({ app }) => app.exit(0)).catch(() => app.close().catch(() => {})),
  };
}

async function installQaState(page) {
  await page.evaluate((payload) => {
    const noop = () => {};
    window._kbotLang = "ar";
    window._kbotTheme = "dark";
    window._teamLeaderEnabled = false;
    window._analyticsEnabled = true;
    window._operationsEnabled = true;
    window._dashboardEnabled = true;
    window._kbotUser = { customerName: "QA", daysLeft: 30 };
    window._kbotAccounts = payload.accounts;
    try {
      localStorage.setItem("kbot_tour_completed_analytics", "true");
      localStorage.setItem("kbot_tour_completed_operations", "true");
      localStorage.setItem("kbot_tour_completed_dashboard", "true");
    } catch (err) {}
    window.api = Object.assign({}, window.api || {}, {
      minimize: noop,
      maximize: noop,
      close: noop,
      checkLicense: async () => ({ valid: true, customerName: "QA", daysLeft: 30, key: "QA", allowReset: false }),
      checkLicenseNocache: async () => ({ valid: true, customerName: "QA", daysLeft: 30, key: "QA", allowReset: false }),
      getCredentials: async () => ({
        accounts: payload.accounts,
        maxAccounts: 4,
        analyticsEnabled: true,
        operationsEnabled: true,
        dashboardEnabled: true,
        launchMinimized: false,
        autoConfirm: false,
        autoRun: false,
        autoRunInterval: 30,
        autoRunAccountIds: [],
      }),
      saveCredentials: async () => ({ success: true }),
      saveAllAccounts: async () => ({ success: true }),
      unlockSingleAccount: async () => ({ success: false, reason: "qa" }),
      relockAccount: async () => ({ success: true }),
      setLaunchMinimized: async () => true,
      setAutoConfirm: async () => true,
      setAutoRun: async () => true,
      setAutoRunInterval: async () => true,
      setAutoRunAccounts: async () => true,
      getAutoRunProgress: async () => null,
      runBot: async () => ({ success: true, data: payload.resultData }),
      killBot: noop,
      openFolder: async () => true,
      saveOutputFile: async () => ({ saved: true }),
      saveRunAnalytics: async () => ({ ok: true }),
      getAnalyticsRuns: async () => ({ runs: payload.runs }),
      clearAnalyticsData: async () => true,
      getAnalyticsSettings: async () => ({ minutesPerOrder: 5, savedPresets: "[]" }),
      saveAnalyticsSettings: async () => ({ ok: true }),
      getOperationsRuns: async () => ({ runs: payload.runs }),
      getOperationsSettings: async () => ({ ok: true }),
      onBotLog: noop,
      on2faNeeded: noop,
      onNeedsConfirm: noop,
      onPreview: noop,
      onOrderProgress: noop,
      onAutoRunTick: noop,
      onLicenseExpired: noop,
      on: noop,
      removeAllListeners: noop,
      getSettings: async () => ({ theme: "dark", lang: "ar" }),
      saveSettings: async () => true,
      getAppVersion: async () => "qa",
      checkForUpdates: async () => ({ dev: true }),
      downloadUpdate: async () => true,
      installUpdate: async () => true,
    });
    if (typeof window.applyTheme === "function") window.applyTheme("dark");
    if (typeof window.applyLang === "function") window.applyLang("ar");
  }, {
    accounts: [
      { id: "qa-riyadh", memberName: "Riyadh Team", easyEmail: "riyadh-store@example.com", easyStore: "Riyadh Store", taagerEmail: "affiliate-riyadh@taager.com", taagerCountry: "sa", taagerAffiliateCode: "1944783", locked: true },
      { id: "qa-jeddah", memberName: "Jeddah Operations", easyEmail: "jeddah-store@example.com", easyStore: "Jeddah Store", taagerEmail: "affiliate-jeddah@taager.com", taagerCountry: "sa", taagerAffiliateCode: "2044783", locked: false },
    ],
    runs: makeRuns(),
    resultData: makeResultData(),
  });
}

async function mountTarget(page, target) {
  await page.evaluate(async ({ mount, resultData }) => {
    document.querySelectorAll(".taager-tour-prompt, .taager-tour-root, .premium-preview-overlay").forEach((node) => node.remove());
    const noop = () => {};
    if (mount === "setupAccounts" && typeof window.renderSetup === "function") {
      window.renderSetup(noop, "accounts");
      window.showPage("page-setup");
      return;
    }
    if (mount === "setupRun" && typeof window.renderSetup === "function") {
      window.renderSetup(noop, "run");
      window.showPage("page-setup");
      return;
    }
    if (mount === "run" && typeof window.renderRun === "function") {
      window.renderRun("2026-06-01", "2026-06-05", ["qa-riyadh", "qa-jeddah"], noop, noop);
      window.showPage("page-run");
      return;
    }
    if (mount === "results" && typeof window.renderResults === "function") {
      window.renderResults(resultData, "2026-06-01", "2026-06-05", noop, noop);
      window.showPage("page-results");
      return;
    }
    if (mount === "analytics") {
      if (typeof window.ensureFeatureScripts === "function") await window.ensureFeatureScripts("analytics");
      if (typeof window.renderAnalytics === "function") await window.renderAnalytics(noop);
      window.showPage("page-analytics");
      return;
    }
    if (mount === "operations") {
      if (typeof window.ensureFeatureScripts === "function") await window.ensureFeatureScripts("operations");
      if (typeof window.renderOperations === "function") await window.renderOperations(noop);
      window.showPage("page-operations");
    }
  }, { mount: target.mount, resultData: makeResultData() });
  await page.waitForFunction((id) => document.querySelector(".page.active")?.id === id, target.id, { timeout: 15000 });
  await page.waitForTimeout(450);
}

async function inspectPage(page, target, viewport) {
  return page.evaluate(({ target, viewport }) => {
    const active = document.querySelector(".page.active");
    const root = document.getElementById(target.id) || active || document.body;
    const rootRect = root.getBoundingClientRect();
    const doc = document.scrollingElement || document.documentElement;
    const pageOverflow = Math.max(
      0,
      doc.scrollWidth - document.documentElement.clientWidth,
      root.scrollWidth - Math.ceil(root.clientWidth || rootRect.width)
    );

    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0.01 &&
        rect.width > 3 &&
        rect.height > 3 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
    };

    const clipped = Array.from(root.querySelectorAll([
      "button",
      "select",
      ".btn",
      ".sv3-nav-item",
      ".sv3-tab-btn",
      ".sv3-date-mode-btn",
      ".analytics-tab-btn",
      ".ops-link-btn",
      ".custom-select-trigger",
      ".account-tab",
      ".badge",
    ].join(","))).filter(isVisible).map((el) => {
      const style = getComputedStyle(el);
      const allowsWrap = style.whiteSpace !== "nowrap";
      const clippedX = el.scrollWidth - el.clientWidth > 2;
      const clippedY = !allowsWrap && el.scrollHeight - el.clientHeight > 2;
      if (!clippedX && !clippedY) return null;
      return {
        text: (el.innerText || el.textContent || el.getAttribute("aria-label") || el.className || el.tagName).trim().slice(0, 90),
        selector: el.id ? "#" + el.id : el.className || el.tagName,
        clippedX,
        clippedY,
      };
    }).filter(Boolean);

    const nodes = Array.from(root.querySelectorAll([
      ".card",
      ".section-block",
      ".sv3-section",
      ".sv3-acc-card",
      ".sv3-add-card",
      ".sv3-setting-card",
      ".sv3-review-metric",
      ".summary-box",
      ".dash-stat-card",
      ".dash-section",
      ".kpi-card",
      ".chart-card",
      ".run-history-panel",
      ".ops-order-details-panel",
      ".ops-monitor-card",
      ".ops-perf-card",
      ".ops-insights-card",
      ".ops-product-card",
      ".ops-history-card",
      ".notice-box",
    ].join(","))).filter(isVisible).map((el, index) => {
      const rect = el.getBoundingClientRect();
      return {
        index,
        el,
        label: el.id ? "#" + el.id : String(el.className || el.tagName).slice(0, 80),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });

    const collisions = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 8 && overlapY > 8) {
          collisions.push({ a: a.label, b: b.label, overlapX: Math.round(overlapX), overlapY: Math.round(overlapY) });
        }
      }
    }

    return {
      page: target.key,
      viewport,
      activeId: active && active.id,
      pageOverflow,
      clipped,
      collisions: collisions.slice(0, 10),
      rootWidth: Math.round(rootRect.width),
      rootHeight: Math.round(rootRect.height),
    };
  }, { target, viewport });
}

(async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await installQaState(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await wait(100);
      for (const target of PAGE_TARGETS) {
        await mountTarget(page, target);
        const metrics = await inspectPage(page, target, viewport);
        console.log("[qa-pages-laptop]", JSON.stringify({
          page: metrics.page,
          viewport: metrics.viewport,
          overflow: metrics.pageOverflow,
          clipped: metrics.clipped.length,
          collisions: metrics.collisions.length,
          size: [metrics.rootWidth, metrics.rootHeight],
        }));
        if (metrics.activeId !== target.id) {
          throw new Error(`${target.key} did not activate ${target.id}; active=${metrics.activeId}`);
        }
        if (metrics.pageOverflow > 2) {
          throw new Error(`${target.key} has horizontal overflow at ${viewport.width}x${viewport.height}: ${metrics.pageOverflow}px`);
        }
        if (metrics.clipped.length) {
          throw new Error(`${target.key} has clipped control text at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics.clipped.slice(0, 3))}`);
        }
        if (metrics.collisions.length) {
          throw new Error(`${target.key} has visible card/control collisions at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics.collisions.slice(0, 3))}`);
        }
      }
    }
    console.log("[qa-pages-laptop] non-dashboard small-laptop verification complete");
  } finally {
    await app.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
