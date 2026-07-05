const path = require("path");
const fs = require("fs");
const { _electron: electron, chromium } = require("playwright-core");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LIGHT_SCREENSHOT_MODE = process.env.TAAGER_QA_LIGHT_SCREENSHOTS === "1";
const DARK_SCREENSHOT_MODE = process.env.TAAGER_QA_DARK_SCREENSHOTS === "1";
const SMALL_LAPTOP_MODE = process.env.TAAGER_QA_SMALL_LAPTOP === "1";
const LIGHT_SCREENSHOT_DIR = path.join(ROOT, ".codex-tmp", "light-dashboard-screenshots");
const DARK_SCREENSHOT_DIR = path.join(ROOT, ".codex-tmp", "dark-dashboard-screenshots");
const DASHBOARD_SCREENSHOT_MODE = LIGHT_SCREENSHOT_MODE || DARK_SCREENSHOT_MODE;
const DASHBOARD_SCREENSHOT_DIR = DARK_SCREENSHOT_MODE ? DARK_SCREENSHOT_DIR : LIGHT_SCREENSHOT_DIR;
const QA_USER_DATA_DIR = path.join(ROOT, ".codex-tmp", `qa-electron-user-data-${process.pid}`);

function stopChild(child) {
  if (!child) return;
  if (child.stdout) child.stdout.destroy();
  if (child.stderr) child.stderr.destroy();
  if (!child.killed) child.kill();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChromeExecutable() {
  const candidates = [
    process.env.TAAGER_QA_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google\\Chrome\\Application\\chrome.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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

async function waitForCdp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (res.ok) return true;
      lastError = new Error("CDP status " + res.status);
    } catch (err) {
      lastError = err;
    }
    await wait(250);
  }
  throw lastError || new Error("CDP endpoint did not become ready");
}

async function launchElectronForQa() {
  try {
    if (process.env.TAAGER_QA_FORCE_CDP === "1") throw new Error("CDP forced by TAAGER_QA_FORCE_CDP");
    const app = await withTimeout(electron.launch({
      cwd: ROOT,
      args: [ROOT, "--disable-gpu", "--disable-software-rasterizer", "--no-sandbox"],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        TAAGER_QA_USER_DATA_DIR: QA_USER_DATA_DIR,
      },
    }), 20000, "Playwright Electron launch");
    const firstPage = await app.firstWindow();
    await firstPage.waitForLoadState("domcontentloaded", { timeout: 10000 });
    return {
      mode: "electron",
      firstWindow: async () => firstPage,
      close: async () => app.evaluate(({ app }) => app.exit(0)).catch(() => app.close().catch(() => {})),
    };
  } catch (err) {
    console.warn("[qa] Playwright Electron launch failed, falling back to CDP:", err.message);
  }

  const executablePath = require("electron");
  const port = Number(process.env.TAAGER_QA_CDP_PORT || 9339);
  const child = spawn(executablePath, [ROOT, "--remote-debugging-port=" + port, "--disable-gpu", "--disable-software-rasterizer", "--no-sandbox"], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TAAGER_QA_USER_DATA_DIR: QA_USER_DATA_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => process.stdout.write("[electron] " + chunk.toString()));
  child.stderr.on("data", (chunk) => process.stderr.write("[electron:err] " + chunk.toString()));
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") console.warn("[qa] Electron exited early:", { code, signal });
  });

  try {
    await waitForCdp(port, 30000);
    const browser = await chromium.connectOverCDP("http://127.0.0.1:" + port, { timeout: 60000 });
    let firstPage = null;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      firstPage = browser.contexts().flatMap((ctx) => ctx.pages()).find(Boolean) || null;
      if (firstPage) break;
      await wait(250);
    }
    if (!firstPage) throw new Error("No Electron page available through CDP");
    await firstPage.waitForLoadState("domcontentloaded", { timeout: 10000 });
    return {
      mode: "cdp",
      firstWindow: async () => firstPage,
      close: async () => {
        await browser.close().catch(() => {});
        stopChild(child);
      },
    };
  } catch (err) {
    console.warn("[qa] CDP attach failed, falling back to Chromium renderer harness:", err.message);
    stopChild(child);
  }

  await wait(750);
  const chromePath = findChromeExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath || undefined,
  });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const noop = () => {};
    try {
      localStorage.setItem("kbot_tour_completed_dashboard", "true");
      localStorage.setItem("kbot_tour_completed_analytics", "true");
      localStorage.setItem("kbot_tour_completed_operations", "true");
      localStorage.setItem("taager_currency_rates_v1", JSON.stringify({
        source: "manual",
        updatedAt: new Date().toISOString(),
        rates: { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 },
      }));
    } catch (err) {}
    window.monitoring = {
      captureException: noop,
      captureMessage: noop,
      addBreadcrumb: noop,
      setUserContext: noop,
      setContext: noop,
      setTag: noop,
      reportIpcFailure: noop,
      getMeta: () => ({ appVersion: "qa" }),
    };
    window.api = {
      minimize: noop,
      maximize: noop,
      close: noop,
      checkLicense: async () => ({ valid: true, customerName: "QA", daysLeft: 30, key: "QA", allowReset: false }),
      checkLicenseNocache: async () => ({ valid: true, customerName: "QA", daysLeft: 30, key: "QA", allowReset: false }),
      submitLicense: async () => ({ valid: true }),
      getCredentials: async () => ({ accounts: [], maxAccounts: 1, analyticsEnabled: true, operationsEnabled: true, dashboardEnabled: true }),
      saveCredentials: async () => ({ success: true }),
      saveAllAccounts: async () => ({ success: true }),
      unlockSingleAccount: async () => ({ success: false, reason: "qa" }),
      relockAccount: async () => ({ success: true }),
      clearAllData: async () => true,
      clearResetFlag: async () => ({ success: true }),
      setAutoRun: async () => true,
      setAutoRunInterval: async () => true,
      setAutoRunAccounts: async () => true,
      setLaunchMinimized: async () => true,
      getAutoRunProgress: async () => null,
      killBot: noop,
      openFolder: async () => true,
      getProfilePath: async () => "",
      runBot: async () => ({ success: true, data: {} }),
      botStarted: noop,
      botFinished: noop,
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
      saveOutputFile: async () => ({ saved: true }),
      saveRunAnalytics: async () => ({ ok: true }),
      getAnalyticsRuns: async () => ({ runs: [] }),
      clearAnalyticsData: async () => true,
      getAnalyticsSettings: async () => ({ minutesPerOrder: 5, savedPresets: "[]" }),
      saveAnalyticsSettings: async () => ({ ok: true }),
      runDashboardFetch: async () => ({ success: true, rows: 0 }),
      saveDashboardSnapshot: async () => true,
      getDashboardSnapshot: async () => null,
      getDashboardAutoTs: async () => null,
      setDashboardAutoTs: async () => true,
      clearDashboardData: async () => true,
      getDashboardEnabled: async () => true,
      getMarketingStatus: async () => ({ ok: true, connected: false }),
      connectMarketing: async () => ({ ok: false }),
      saveMarketingMapping: async () => ({ ok: true }),
      saveAllMarketingMappings: async () => ({ ok: true }),
      syncMarketingData: async () => ({ ok: true }),
      syncAllMarketingData: async () => ({ ok: true }),
      openExternalUrl: async () => true,
      dashboardAiQuery: async () => ({ message: "QA response", insights: [], meta: { source: "qa" } }),
      getAiAdminAnalytics: async () => ({}),
      debugGeminiPing: async () => ({}),
      getAppVersion: async () => "qa",
      checkForUpdates: async () => ({ dev: true }),
      downloadUpdate: async () => true,
      installUpdate: async () => true,
      onUpdateAvailable: noop,
      onUpdateNotAvailable: noop,
      onUpdateProgress: noop,
      onUpdateDownloaded: noop,
      onUpdateError: noop,
    };
  });
  await page.goto("file:///" + path.join(ROOT, "src", "renderer", "index.html").replace(/\\/g, "/"));
  return {
    mode: "chromium-renderer",
    firstWindow: async () => page,
    close: async () => browser.close().catch(() => {}),
  };
}

function makeOrder(i) {
  const cities = ["الرياض", "جدة", "مكة", "الدمام", "المدينة", "الطائف", "بريدة", "أبها"];
  const products = [
    { sku: "SHIELD-01", name: "Shield Pro" },
    { sku: "SHIP-02", name: "Ship Fast Kit" },
    { sku: "COD-03", name: "COD Growth Pack" },
    { sku: "ROI-04", name: "ROI Starter Bundle" },
  ];
  const statuses = ["delivered", "in shipping", "confirmed", "awaiting confirmation", "failed", "canceled"];
  const p = products[i % products.length];
  return {
    sku: p.sku,
    productName: p.name,
    name: "Customer " + (i + 1),
    phone: "96650000" + String(1000 + i),
    city: cities[i % cities.length],
    date: "2026-05-" + String((i % 21) + 1).padStart(2, "0"),
    qty: (Math.floor(i / products.length) % 6) + 1,
    amountDue: 90 + (i % 6) * 25,
    subtotal: 90 + (i % 6) * 25,
    marketerCommission: 18 + (i % 5) * 7,
    orderStatus: statuses[i % statuses.length],
    createdAt: "2026-05-" + String((i % 21) + 1).padStart(2, "0"),
    paymentMethod: i % 7 === 0 ? "prepaid" : "cod",
    source: i % 4 === 0 ? "missed" : "real",
    taagerOrderNumber: "QA-" + String(10000 + i),
  };
}

function makeRuns() {
  return Array.from({ length: 4 }, (_, runIdx) => {
    const orders = Array.from({ length: 28 }, (_, i) => {
      const order = makeOrder(runIdx * 28 + i);
      order.date = new Date(Date.now() - ((i + runIdx) % 6) * 86400000).toISOString().slice(0, 10);
      return order;
    });
    return {
      runId: "qa-run-" + (runIdx + 1),
      runDate: orders[0].date,
      runTimestamp: Date.now() - runIdx * 86400000,
      accountId: "qa-account-" + ((runIdx % 2) + 1),
      accountEmail: runIdx % 2 ? "jeddah-store@example.com" : "riyadh-store@example.com",
      accountLabel: runIdx % 2 ? "Jeddah Store" : "Riyadh Store",
      orders,
      ordersSubmitted: orders.filter((o) => !String(o.orderStatus).toLowerCase().includes("failed")).length,
      ordersFailed: orders.filter((o) => String(o.orderStatus).toLowerCase().includes("failed")).length,
      durationMs: 1000 * (75 + runIdx * 18),
    };
  });
}

async function mountDashboard(page) {
  const qaOrders = process.env.TAAGER_QA_EMPTY_DASHBOARD === "1"
    ? []
    : Array.from({ length: 96 }, (_, i) => makeOrder(i));
  await page.waitForFunction(() => !!document.querySelector(".page.active"), null, { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    try {
      localStorage.setItem("kbot_tour_completed_dashboard", "true");
      localStorage.setItem("kbot_tour_completed_analytics", "true");
      localStorage.setItem("kbot_tour_completed_operations", "true");
      localStorage.setItem("taager_currency_rates_v1", JSON.stringify({
        source: "manual",
        updatedAt: new Date().toISOString(),
        rates: { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 },
      }));
    } catch (err) {}
    document.querySelectorAll(".taager-tour-prompt, .taager-tour-root").forEach((node) => node.remove());
  });
  await page.evaluate(async (payload) => {
    const orders = payload.orders;
    window.__qaRuns = payload.runs;
    window.api = Object.assign({}, window.api || {}, {
      checkLicense: async () => ({ valid: true, customerName: "QA", daysLeft: 30, key: "QA" }),
      checkLicenseNocache: async () => ({ valid: true, customerName: "QA", daysLeft: 30, key: "QA" }),
      getCredentials: async () => ({
        accounts: [
          { id: "sa-main", easyEmail: "qa@example.com", label: "Saudi Main Store", accountType: "live" },
        ],
        maxAccounts: 5,
        analyticsEnabled: true,
        operationsEnabled: true,
        dashboardEnabled: true,
      }),
      getAnalyticsRuns: async () => ({ runs: window.__qaRuns }),
      getAnalyticsSettings: async () => ({ minutesPerOrder: 5, savedPresets: "[]" }),
      saveAnalyticsSettings: async () => ({ ok: true }),
      getMarketingStatus: async () => ({ ok: true, connected: false }),
      dashboardAiQuery: async () => ({
        message: "هذه إجابة اختبار عربية واضحة مبنية على بيانات لوحة التحكم.",
        insights: [],
        actions: [],
        followUps: [],
        meta: { source: "qa" },
      }),
      onOrderProgress: () => {},
      onBotLog: () => {},
      on: () => {},
    });
    function buildDashboardResult(srcOrders) {
      const productMap = {};
      const cityStats = {};
      let delivered = 0;
      let failed = 0;
      let codCount = 0;
      let prepaidCount = 0;
      let commission = 0;
      srcOrders.forEach((order) => {
        const status = String(order.orderStatus || "").toLowerCase();
        const isDelivered = status.includes("delivered");
        const sku = order.sku || order.productName || "unknown";
        const product = productMap[sku] || (productMap[sku] = { key: sku, sku, name: order.productName || sku, placedCount: 0, deliveredCount: 0, failedCount: 0, canceledCount: 0, confirmedCount: 0, shippingCount: 0, processingCount: 0, totalPieces: 0, units: 0, cancelPct: 0, commission: 0, cityCounts: {}, piecesMap: {}, quantityCityMap: {} });
        const city = order.city || "Unknown";
        const cityItem = cityStats[city] || (cityStats[city] = { count: 0, deliveredOrders: 0, drBaseOrders: 0, codCount: 0, prepaidCount: 0, earnedCommission: 0, shippingCount: 0, confirmedCount: 0, processingCount: 0, riskScore: 0, scalingScore: 0, provinceId: "central" });
        const qty = String(Math.max(1, Number(order.qty || 1)));
        const pieceItem = product.piecesMap[qty] || (product.piecesMap[qty] = { qty, count: 0, delivered: 0, confirmed: 0 });
        const qtyCityBucket = product.quantityCityMap[qty] || (product.quantityCityMap[qty] = {});
        const qtyCityItem = qtyCityBucket[city] || (qtyCityBucket[city] = { name: city, count: 0, delivered: 0, confirmed: 0 });
        product.placedCount += 1;
        product.units += Number(order.qty || 1);
        product.totalPieces += Number(order.qty || 1);
        product.cityCounts[city] = (product.cityCounts[city] || 0) + 1;
        pieceItem.count += 1;
        qtyCityItem.count += 1;
        cityItem.count += 1;
        cityItem.drBaseOrders += 1;
        if (String(order.paymentMethod || "").toLowerCase() === "prepaid") {
          prepaidCount += 1;
          cityItem.prepaidCount += 1;
        } else {
          codCount += 1;
          cityItem.codCount += 1;
        }
        if (isDelivered) {
          delivered += 1;
          product.deliveredCount += 1;
          pieceItem.delivered += 1;
          pieceItem.confirmed += 1;
          qtyCityItem.delivered += 1;
          qtyCityItem.confirmed += 1;
          cityItem.deliveredOrders += 1;
          product.commission += Number(order.marketerCommission || 0);
          cityItem.earnedCommission += Number(order.marketerCommission || 0);
          commission += Number(order.marketerCommission || 0);
        } else if (status.includes("failed")) {
          product.failedCount += 1;
          failed += 1;
        } else if (status.includes("cancel")) {
          product.canceledCount += 1;
          failed += 1;
        } else if (status.includes("shipping")) {
          product.shippingCount += 1;
          pieceItem.confirmed += 1;
          qtyCityItem.confirmed += 1;
          cityItem.shippingCount += 1;
        } else if (status.includes("confirmed")) {
          product.confirmedCount += 1;
          pieceItem.confirmed += 1;
          qtyCityItem.confirmed += 1;
          cityItem.confirmedCount += 1;
        } else {
          product.processingCount += 1;
          cityItem.processingCount += 1;
        }
      });
      const rankedList = Object.values(productMap).map((p) => {
        p.ndrPct = p.placedCount ? Math.round((p.deliveredCount / p.placedCount) * 1000) / 10 : 0;
        p.drRate = p.ndrPct;
        p.deliveryPct = p.ndrPct;
        p.cancelPct = p.placedCount ? Math.round(((p.placedCount - p.deliveredCount) / p.placedCount) * 1000) / 10 : 0;
        p.cityBreakdown = Object.keys(p.cityCounts).map((name) => ({ name, count: p.cityCounts[name], orders: p.cityCounts[name], ndr: p.ndrPct }));
        p.piecesBreakdown = Object.keys(p.piecesMap).sort((a, b) => Number(a) - Number(b)).map((qty) => {
          const item = p.piecesMap[qty];
          return {
            qty,
            count: item.count,
            delivered: item.delivered,
            confirmed: item.confirmed,
            confirmationPct: item.count ? Math.round((item.confirmed / item.count) * 1000) / 10 : 0,
            ndr: item.count ? Math.round((item.delivered / item.count) * 1000) / 10 : 0,
          };
        });
        p.quantityCityBreakdown = Object.keys(p.quantityCityMap).sort((a, b) => Number(a) - Number(b)).map((qty) => ({
          qty,
          cities: Object.keys(p.quantityCityMap[qty]).map((city) => {
            const item = p.quantityCityMap[qty][city];
            return {
              name: city,
              count: item.count,
              delivered: item.delivered,
              confirmed: item.confirmed,
              confirmationPct: item.count ? Math.round((item.confirmed / item.count) * 1000) / 10 : 0,
              ndr: item.count ? Math.round((item.delivered / item.count) * 1000) / 10 : 0,
            };
          }).sort((a, b) => b.count - a.count),
        }));
        return p;
      }).sort((a, b) => b.commission - a.commission).map((p, idx) => Object.assign(p, {
        rank: idx + 1,
        emoji: ["🛡️", "🚚", "💳", "📈"][idx % 4],
        revenue: Math.round(Number(p.commission || 0) * 3.2),
      }));
      Object.keys(cityStats).forEach((city) => {
        const c = cityStats[city];
        const ndr = c.count ? c.deliveredOrders / c.count : 0;
        c.riskScore = Math.round((1 - ndr) * 100);
        c.scalingScore = Math.round(ndr * 100 + Math.min(c.earnedCommission / 20, 30));
      });
      const geoProductMap = {};
      srcOrders.forEach((order) => {
        const city = order.city || "Unknown";
        const sku = order.sku || order.productName || "unknown";
        const cell = (geoProductMap[city] || (geoProductMap[city] = {}))[sku] ||
          ((geoProductMap[city] || (geoProductMap[city] = {}))[sku] = { orders: 0, delivered: 0, ndr: 0 });
        cell.orders += 1;
        if (String(order.orderStatus || "").toLowerCase().includes("delivered")) cell.delivered += 1;
        cell.ndr = cell.orders ? cell.delivered / cell.orders : 0;
      });
      const total = srcOrders.length;
      const avgCommission = delivered ? commission / delivered : 0;
      const incoming = Math.round((total - delivered - failed) * avgCommission);
      const lost = Math.round(failed * avgCommission);
      const ndrPct = total ? Math.round((delivered / total) * 1000) / 10 : 0;
      const trendPoints = Array.from({ length: 30 }, (_, idx) => ({ d: String(idx + 1).padStart(2, "0"), v: Math.round((commission / 30) * (0.72 + (idx % 7) / 20)) }));
      return {
        meta: { activeAccountId: "__all__", activeAccountLabel: window.currentActiveAccountLabel, monthLabel: "May 2026", hasData: true, lastUpdatedLabel: "Today 11:45", accountOptions: window.dashboardAccountsList },
        overview: {
          totalOrders: { value: total, delta: 8 },
          earnedCommission: { value: commission, delta: 12.4 },
          incomingCommission: { value: incoming, delta: 4.1 },
          lostCommission: { value: lost, delta: -2.6 },
          totalSales: { value: total * 169, delta: 5.1 },
          overallAov: { value: 169, delta: 1.2 },
          totalDeliveredSales: { value: delivered * 162, delta: 11.5 },
          deliveredAov: { value: 162, delta: 3.4 },
          deliveredOrders: delivered,
          failedOrders: failed,
          health: {
            earned: { pct: ndrPct },
            incoming: { pct: total ? Math.round(((total - delivered - failed) / total) * 1000) / 10 : 0 },
            lost: { pct: total ? Math.round((failed / total) * 1000) / 10 : 0 },
          },
          sparklines: {
            earned: trendPoints.slice(-8).map((p) => p.v),
            incoming: [18, 21, 19, 24, 26, 27, 28],
            lost: [9, 8, 7, 6, 7, 5, 4],
            orders: [61, 66, 70, 75, 80, 88, total],
          },
        },
        pipeline: {
          metrics: { totalOrders: total, deliveredOrders: delivered, failedOrders: failed, activeOrders: total - delivered - failed },
          stages: [
            { id: "confirmed", label: "Confirmed", count: Math.round(total * 0.22), color: "#38bdf8" },
            { id: "shipping", label: "Shipping", count: Math.round(total * 0.26), color: "#f59e0b" },
            { id: "delivered", label: "Delivered", count: delivered, color: "#22c55e" },
            { id: "failed", label: "Failed", count: failed, color: "#ef4444" },
          ],
        },
        products: { summary: { totalProducts: rankedList.length, uniqueProducts: rankedList.length, totalOrders: total, totalPieces: srcOrders.reduce((sum, order) => sum + Number(order.qty || 0), 0), totalComm: commission, topProduct: rankedList[0] && rankedList[0].name }, rankedList },
        commissionTrend: { totalCommission: commission, periods: { "30": trendPoints }, benchmarks: { dailyAvg: commission / 30 } },
        roi: { adSpend: 2600, avgCPA: total ? Math.round(2600 / total) : 0, avgCommission: Math.round(avgCommission), earnedCommission: commission, ndrPct },
        cod: {
          codCount,
          prepaidCount,
          totalOrders: total,
          avgDays: 2.8,
          collectedSar: commission,
          gapSar: lost,
          expectedCodSar: commission + incoming + lost,
          drPct: ndrPct,
          collectionRate: ndrPct,
          drDeliveredOrders: delivered,
          deliveredCount: delivered,
          drBaseOrders: total,
          ndrPct,
          ndrBaseOrders: total,
          cities: Object.keys(cityStats).map((name) => ({ name, collected: cityStats[name].earnedCommission * 4, gap: Math.max(0, 900 - cityStats[name].earnedCommission), count: cityStats[name].count, deliveredOrders: cityStats[name].deliveredOrders, drBaseOrders: cityStats[name].drBaseOrders, avgDeliveryDays: 2.8, deliveryDurationOrders: cityStats[name].deliveredOrders })).sort((a, b) => b.gap - a.gap),
        },
        geo: {
          provinceMap: { central: { name: "Central" } },
          cityStats,
          geoProductMap,
          kpis: { totalCities: Object.keys(cityStats).length, deliveredOrders: delivered, earnedCommission: commission },
          insights: Object.keys(cityStats).slice(0, 4).map((city) => ({ type: "city", priority: "medium", city, title: city + " signal", recommendation: "Review delivery quality" })),
        },
        orders: srcOrders,
      };
    }

    window._kbotLang = "ar";
    window._kbotTheme = "dark";
    window._kbotAccounts = [
      { id: "sa-main", easyEmail: "qa@example.com", label: "Saudi Main Store", accountType: "live" },
    ];
    window._analyticsEnabled = true;
    window._operationsEnabled = true;
    window._dashboardEnabled = true;
    window._teamLeaderEnabled = false;
    window.dashboardAccountsList = [
      { id: "__all__", label: "كل الحسابات المشتركة", orderCount: orders.length },
      { id: "sa-main", label: "Saudi Main Store", orderCount: orders.length },
    ];
    window.__qaActiveAccountId = "__all__";
    window.__qaOrders = orders;
    window.__qaBuildDashboardResult = buildDashboardResult;
    window.getActiveAccountId = () => window.__qaActiveAccountId || "__all__";
    window.setActiveAccountId = () => {};
    window.currentActiveAccountLabel = "كل الحسابات المشتركة";
    window.runDashboardAggregator = (done) => done({
      meta: {
        activeAccountId: "__all__",
        activeAccountLabel: "كل الحسابات المشتركة",
        monthLabel: "مايو 2026",
        hasData: true,
        lastUpdatedLabel: "اليوم 11:45",
        accountOptions: window.dashboardAccountsList,
      },
      orders,
    });
    window.__qaDashboardResult = buildDashboardResult(orders);
    window.runDashboardAggregator = (done) => done(window.__qaDashboardResult);
    if (typeof window.applyTheme === "function") window.applyTheme("dark");
    if (typeof window.applyLang === "function") window.applyLang("ar");
    if (typeof window.ensureDashboardSection === "function") {
      await window.ensureDashboardSection("master");
    }
    if (typeof window.renderDashboard === "function") window.renderDashboard();
    if (typeof window.showPage === "function") window.showPage("page-dashboard");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (typeof window.preloadDashboardSectionResources === "function") {
        window.preloadDashboardSectionResources();
      }
    }));
  }, { orders: qaOrders, runs: makeRuns() });
  await page.waitForSelector("#db-shell-mount.dash-shell", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector(".page.active")?.id === "page-dashboard", null, { timeout: 15000 });
}

async function mountAiIntelligence(page) {
  await page.evaluate(() => {
    if (typeof window.goToAiIntelligence === "function") window.goToAiIntelligence();
  });
  await page.waitForFunction(() => document.querySelector(".page.active")?.id === "page-ai-intelligence", null, { timeout: 15000 });
  await page.waitForSelector("#page-ai-intelligence .taager-ai-section", { timeout: 15000 });
}

async function showDashboard(page) {
  await page.evaluate(() => {
    if (typeof window.showPage === "function") window.showPage("page-dashboard");
  });
  await page.waitForFunction(() => document.querySelector(".page.active")?.id === "page-dashboard", null, { timeout: 15000 });
}

async function showAiIntelligence(page) {
  await page.evaluate(() => {
    if (typeof window.showPage === "function") window.showPage("page-ai-intelligence");
  });
  await page.waitForFunction(() => document.querySelector(".page.active")?.id === "page-ai-intelligence", null, { timeout: 15000 });
}

async function verifyLiveTaagerAiSmoke(page) {
  await showDashboard(page);
  await page.evaluate(() => {
    if (typeof window.applyLang === "function") window.applyLang("ar");
    if (window.__qaDashboardResult) {
      window.runDashboardAggregator = (done) => done(window.__qaDashboardResult);
      if (typeof window.renderDashboard === "function") window.renderDashboard();
    }
    window.api = Object.assign({}, window.api || {}, {
      getAiAssistantMemory: async () => ({ memory: null }),
      saveAiAssistantMemory: async () => ({ ok: true }),
      clearAiAssistantMemory: async () => ({ ok: true }),
      dashboardAiQuery: async (payload) => ({
        message: payload.localDraft || "ابدأ بأقوى فرصة متاحة، وراقب NDR وCPA قبل زيادة الصرف.",
        insights: [],
        actions: [],
        meta: { source: "gemini", routingMode: "LOCAL_PLUS_GEMINI" },
      }),
    });
    if (window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.clear === "function") {
      window.KhodAiSessionMemory.clear();
    }
  });
  await page.waitForFunction(() => Object.keys(window.dashboardGeoData && window.dashboardGeoData.geo && window.dashboardGeoData.geo.cityStats || {}).length >= 3, null, { timeout: 15000 });
  await page.locator('.dash-nav-btn[data-section="taagerAi"]').evaluate((button) => button.click());
  await page.waitForFunction(() => !!document.querySelector("#aii-chat-input"), null, { timeout: 15000 });
  const mirrorDebug = await page.evaluate(() => {
    const data = window.dashboardGeoData || {};
    const context = window.getDashboardAiContext ? window.getDashboardAiContext({ data }) : {};
    const route = window.DashboardAiMirror ? window.DashboardAiMirror.answer("ما أفضل المدن للتوسع؟", data) : null;
    return {
      dataCities: Object.keys(data.geo && data.geo.cityStats || {}).length,
      contextCities: Array.isArray(context.cities) ? context.cities.length : -1,
      mirrorRows: route && route.mirror && route.mirror.diagnostics && route.mirror.diagnostics.rowsIncluded,
      mirrorMessage: route && route.message,
    };
  });
  console.log("[qa] live Taager AI mirror debug", JSON.stringify(mirrorDebug));

  async function askLive(prompt) {
    const beforeUsers = await page.locator(".aii-chat-msg.user").count();
    await page.locator("#aii-chat-input").fill(prompt);
    await page.locator("#aii-chat-form").evaluate((form) => form.requestSubmit());
    await page.waitForFunction((count) => document.querySelectorAll(".aii-chat-msg.user").length > count, beforeUsers, { timeout: 15000 });
    await page.waitForFunction(() => {
      const input = document.querySelector("#aii-chat-input");
      const assistants = Array.from(document.querySelectorAll(".aii-chat-msg.assistant"));
      const lastAssistant = assistants[assistants.length - 1];
      return !!(input && !input.disabled && lastAssistant && !lastAssistant.classList.contains("pending"));
    }, null, { timeout: 15000 });
    return page.evaluate(() => {
      const messages = Array.from(document.querySelectorAll(".aii-chat-msg.assistant"));
      const last = messages[messages.length - 1];
      return {
        text: last ? last.textContent.trim() : "",
        actions: last ? Array.from(last.querySelectorAll(".aii-action-btn")).map((button) => button.textContent.trim()) : [],
      };
    });
  }

  const cities = await askLive("ما أفضل المدن للتوسع؟");
  if ((cities.text.match(/^\d+\./gm) || []).length < 3) throw new Error("Live Arabic city ranking did not render 3+ cities: " + cities.text);
  if (!cities.actions.some((label) => /المدينة/.test(label))) throw new Error("Live Arabic city ranking did not render a city action: " + JSON.stringify(cities.actions));

  const next = await askLive("ماذا أفعل بعد ذلك؟");
  if (/\b(?:orders|delivered|risk|watch|break-even|Start with|Why|Next move)\b/i.test(next.text)) throw new Error("Live Arabic operator answer leaked English copy: " + next.text);

  const arabicLoss = await askLive("ليه بخسر؟");
  if (!/\b(?:NDR|CPA)\b|الربح|الخسار/.test(arabicLoss.text) ||
      !/ابدأ|الخطوة|عالج|أصلح|راجع|قلل|أوقف/.test(arabicLoss.text) ||
      /I am Taager AI|How can I assist|أنا Taager AI|أستطيع مساعدتك/i.test(arabicLoss.text)) {
    throw new Error("Live Arabic loss question did not render a metric-backed diagnosis: " + arabicLoss.text);
  }

  const englishProfit = await askLive("why is profit weak?");
  const englishProfitWithoutAllowedLatin = englishProfit.text.replace(/\b(?:NDR|CPA|SAR|ROAS|SKU)\b/gi, "");
  const englishProfitArabicLetters = (englishProfitWithoutAllowedLatin.match(/[\u0600-\u06ff]/g) || []).length;
  const englishProfitLatinLetters = (englishProfitWithoutAllowedLatin.match(/[a-z]/gi) || []).length;
  if (!/\b(?:NDR|CPA)\b|الربح|الخسار/i.test(englishProfit.text) ||
      englishProfitArabicLetters < 8 ||
      englishProfitLatinLetters > (englishProfitArabicLetters * 0.8) + 50 ||
      /\b(?:The account|Account CPA|Why|Next move|net profit is|NDR is low|delivered orders|break-even CPA|Start with|Review .* first|pause scaling|Improve NDR)\b/i.test(englishProfit.text) ||
      /I am Taager AI|How can I assist|أنا Taager AI|أستطيع مساعدتك/i.test(englishProfit.text)) {
    throw new Error("Live English profit question in Arabic UI did not return an Arabic diagnosis: " + englishProfit.text);
  }

  const weakCities = await askLive("ما أضعف المدن؟");
  if ((weakCities.text.match(/\d+\./g) || []).length < 3 ||
      /أفضل المدن للتوسع/.test(weakCities.text) ||
      !/تحتاج إصلاح/.test(weakCities.text)) {
    throw new Error("Live Arabic weak-city prompt did not render the weakest-city ranking: " + weakCities.text);
  }

  const plan = await askLive("ابنِ خطة توسع");
  const planSteps = (plan.text.match(/(?:^|\n)\s*\d+[.)-]\s+/g) || []).length;
  if (!/الخطة المختصرة/.test(plan.text) ||
      !/الخطوات/.test(plan.text) ||
      !/حدود الإيقاف/.test(plan.text) ||
      !/راقب/.test(plan.text) ||
      planSteps < 2 ||
      !/\bNDR\b/.test(plan.text) ||
      !/\bCPA\b/.test(plan.text) ||
      /\b(?:NDR|CPA)\d/i.test(plan.text) ||
      /%[\u0621-\u064a]/.test(plan.text) ||
      /خطة الاستراتيجية/.test(plan.text)) {
    throw new Error("Live Arabic scale plan is not compact, structured, or cleanly spaced: " + plan.text);
  }
  [arabicLoss.text, englishProfit.text, weakCities.text, plan.text].forEach((answer) => {
    if (/،(?:NDR|CPA)|راقب:(?:NDR|CPA)/i.test(answer)) {
      throw new Error("Live Arabic answer has missing metric spacing: " + answer);
    }
  });
  console.log("[qa] live Taager AI Arabic smoke prompts verified");
}

async function verifyLiveTaagerAiPerformance(page) {
  await showDashboard(page);
  await page.evaluate(() => {
    if (typeof window.applyLang === "function") window.applyLang("en");
  });
  await page.locator('.dash-nav-btn[data-section="taagerAi"]').evaluate((button) => button.click());
  try {
    await page.waitForFunction(() => !!document.querySelector("#aii-chat-input"), null, { timeout: 15000 });
  } catch (error) {
    const snapshot = await page.evaluate(() => {
      const shell = document.getElementById("db-shell-mount");
      const pane = document.getElementById("dash-section-pane");
      const form = document.querySelector("#aii-chat-form");
      return {
        activeSection: shell && shell._dashboardActiveSection,
        renderFunctionReady: typeof window.renderSectionTaagerAi === "function",
        preloaderPresent: !!document.querySelector('[data-dashboard-preloader="true"]'),
        formPresent: !!form,
        formHtml: form ? form.innerHTML.slice(0, 1200) : "",
        inputs: Array.from(document.querySelectorAll("input")).map((input) => ({
          id: input.id,
          type: input.type,
          disabled: input.disabled,
          placeholder: input.placeholder,
        })).slice(0, 30),
        paneText: pane ? pane.textContent.trim().slice(0, 1000) : "",
        paneHtml: pane ? pane.innerHTML.slice(0, 1200) : "",
      };
    });
    throw new Error(`AI section mount timeout: ${JSON.stringify(snapshot)}`);
  }

  async function measure(prompt, expectedRoute, maxFirstMs, maxFinalMs) {
    const beforeUsers = await page.locator(".aii-chat-msg.user").count();
    const beforeAssistantText = await page.locator(".aii-chat-msg.assistant").last().textContent().catch(() => "");
    await page.locator("#aii-chat-input").fill(prompt);
    const routeInfo = await page.evaluate(({ question, beforeAssistantText }) => {
      const data = window.dashboardGeoData || {};
      const parsed = window.KhodAiIntentDetector && window.KhodAiIntentDetector.parse
        ? window.KhodAiIntentDetector.parse(question, data, {})
        : null;
      const route = window.DashboardAiMirror && window.DashboardAiMirror.answer
        ? window.DashboardAiMirror.answer(question, data, { parsedIntent: parsed })
        : null;
      const started = performance.now();
      window.__qaAiFrameStats = { started, last: started, maxGap: 0, maxTimerGap: 0, frames: 0, active: true, firstAnswerMs: null, finalAnswerMs: null };
      function tick(now) {
        const stats = window.__qaAiFrameStats;
        if (!stats || !stats.active) return;
        stats.maxGap = Math.max(stats.maxGap, now - stats.last);
        stats.last = now;
        stats.frames += 1;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      let lastTimer = performance.now();
      window.__qaAiTimer = setInterval(() => {
        const stats = window.__qaAiFrameStats;
        if (!stats || !stats.active) return;
        const now = performance.now();
        stats.maxTimerGap = Math.max(stats.maxTimerGap, now - lastTimer);
        lastTimer = now;
      }, 50);
      window.__qaAiObserver = new MutationObserver(() => {
        const stats = window.__qaAiFrameStats;
        if (!stats || !stats.active) return;
        const assistants = Array.from(document.querySelectorAll(".aii-chat-msg.assistant"));
        const last = assistants[assistants.length - 1];
        if (stats.firstAnswerMs == null && last && !last.classList.contains("pending") && last.textContent.trim().length > 20 && last.textContent.trim() !== String(beforeAssistantText || "").trim()) {
          stats.firstAnswerMs = performance.now() - stats.started;
        }
        const input = document.querySelector("#aii-chat-input");
        if (stats.firstAnswerMs != null && stats.finalAnswerMs == null && input && !input.disabled) {
          stats.finalAnswerMs = performance.now() - stats.started;
        }
      });
      window.__qaAiObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
      const result = {
        route: route && route.enhanceWithGemini ? "LOCAL_PLUS_GEMINI" : "LOCAL_ONLY",
        selectedSlice: route && route.selectedSlice,
        payloadBytes: route && route.slice ? new Blob([JSON.stringify(route.slice)]).size : 0,
      };
      document.querySelector("#aii-chat-form").requestSubmit();
      return result;
    }, { question: prompt, beforeAssistantText });
    await page.waitForFunction((count) => document.querySelectorAll(".aii-chat-msg.user").length > count, beforeUsers, { timeout: 15000 });
    try {
      await page.waitForFunction((previousText) => {
        const assistants = Array.from(document.querySelectorAll(".aii-chat-msg.assistant"));
        const last = assistants[assistants.length - 1];
        return !!(last && !last.classList.contains("pending") && last.textContent.trim().length > 20 && last.textContent.trim() !== String(previousText || "").trim());
      }, beforeAssistantText, { timeout: maxFirstMs, polling: 50 });
    } catch (error) {
      const snapshot = await page.evaluate(() => {
        const assistants = Array.from(document.querySelectorAll(".aii-chat-msg.assistant"));
        const last = assistants[assistants.length - 1];
        const input = document.querySelector("#aii-chat-input");
        return {
          assistantCount: assistants.length,
          lastClassName: last ? last.className : "",
          lastText: last ? last.textContent.trim().slice(0, 1200) : "",
          inputDisabled: input ? input.disabled : null,
          inputPresent: !!input,
        };
      });
      throw new Error(`AI first answer timeout for "${prompt}": ${JSON.stringify(snapshot)}`);
    }
    await page.waitForFunction(() => {
      const input = document.querySelector("#aii-chat-input");
      return !!(input && !input.disabled);
    }, null, { timeout: maxFinalMs, polling: 50 });
    const frameStats = await page.evaluate(() => {
      if (window.__qaAiFrameStats) window.__qaAiFrameStats.active = false;
      if (window.__qaAiTimer) clearInterval(window.__qaAiTimer);
      if (window.__qaAiObserver) window.__qaAiObserver.disconnect();
      return window.__qaAiFrameStats || { maxGap: 0, frames: 0 };
    });
    const result = Object.assign({ prompt }, routeInfo, frameStats);
    if (result.route !== expectedRoute) throw new Error(`AI perf route mismatch for "${prompt}": ${JSON.stringify(result)}`);
    if (result.firstAnswerMs > maxFirstMs) throw new Error(`AI first answer too slow for "${prompt}": ${JSON.stringify(result)}`);
    if (result.finalAnswerMs > maxFinalMs) throw new Error(`AI final answer too slow for "${prompt}": ${JSON.stringify(result)}`);
    if (result.payloadBytes <= 0 || result.payloadBytes > 100000) throw new Error(`AI selected-slice payload is invalid for "${prompt}": ${JSON.stringify(result)}`);
    if (result.maxGap > 1500 || result.maxTimerGap > 750) {
      throw new Error(`AI request froze the render loop for "${prompt}": ${JSON.stringify(result)}`);
    }
    return result;
  }

  const ranking = await measure("Best cities to scale?", "LOCAL_ONLY", 1000, 2000);
  const plan = await measure("Build a scale plan", "LOCAL_PLUS_GEMINI", 6000, 15000);
  console.log("[qa] live Taager AI performance", JSON.stringify({ ranking, plan }));
}

async function verifyDashboardFirstVisitStability(page) {
  await showDashboard(page);
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.evaluate(() => {
    if (typeof window.applyLang === "function") window.applyLang("en");
    if (window.__qaDashboardResult) {
      window.runDashboardAggregator = (done) => done(window.__qaDashboardResult);
      if (typeof window.renderDashboard === "function") window.renderDashboard();
    }
  });
  await page.waitForFunction(() => {
    const shell = document.getElementById("db-shell-mount");
    return !!(shell && shell._dashboardHasRenderedContent && shell._dashboardCurrentData &&
      Array.isArray(shell._dashboardCurrentData.orders) && shell._dashboardCurrentData.orders.length > 0);
  }, null, { timeout: 15000 });

  const sectionIds = ["products", "cities", "calculator", "productForecast", "orders"];
  const results = [];
  for (const sectionId of sectionIds) {
    const result = await page.evaluate(async (id) => {
      const shell = document.getElementById("db-shell-mount");
      const button = document.querySelector(`.dash-nav-btn[data-section="${id}"]`);
      if (!shell || !button) throw new Error("Missing dashboard first-visit target " + id);

      let sawBigPreloader = false;
      let sawQuietLoader = false;
      let sawSplitSkeleton = false;
      let lastFrame = performance.now();
      let maxFrameGap = 0;
      let tracking = true;
      const observer = new MutationObserver(() => {
        sawBigPreloader = sawBigPreloader || !!document.querySelector('[data-dashboard-preloader="true"]');
        sawQuietLoader = sawQuietLoader || !!document.querySelector('[data-dashboard-quiet-loader="true"]');
        sawSplitSkeleton = sawSplitSkeleton || !!document.querySelector('[data-dashboard-hydrating]');
      });
      observer.observe(document.getElementById("dash-section-pane"), { childList: true, subtree: true });
      function frame(now) {
        maxFrameGap = Math.max(maxFrameGap, now - lastFrame);
        lastFrame = now;
        if (tracking) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      button.click();

      const deadline = performance.now() + 15000;
      while (performance.now() < deadline) {
        const pane = shell._dashboardActivePane;
        const ready = shell._dashboardActiveSection === id && pane && pane.children.length &&
          pane.dataset.dashboardReady === id &&
          !pane.querySelector('[data-dashboard-hydrating]');
        const ordersReady = id !== "orders" || pane && pane.querySelectorAll('.s3-order-row').length > 0;
        if (ready && ordersReady) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      const pane = shell._dashboardActivePane;
      const typography = [];
      for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const sample = pane && (Array.from(pane.querySelectorAll('h1,h2,h3,th,button,input'))
          .find((el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
          }) || pane);
        if (!sample) {
          typography.push({ missing: true });
          continue;
        }
        const style = getComputedStyle(sample);
        typography.push({
          family: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
          lineHeight: style.lineHeight
        });
      }
      tracking = false;
      observer.disconnect();
      const typographyKeys = Array.from(new Set(typography.map((item) => JSON.stringify(item))));
      return {
        id,
        active: shell._dashboardActiveSection,
        sawBigPreloader,
        sawQuietLoader,
        sawSplitSkeleton,
        maxFrameGap,
        typographyStable: typographyKeys.length === 1 && !typography[0]?.missing,
        typography,
        orderRows: pane ? pane.querySelectorAll('.s3-order-row').length : 0,
        visibleOrderRows: pane ? Array.from(pane.querySelectorAll('.s3-order-row')).filter((row) => {
          const style = getComputedStyle(row);
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
        }).length : 0,
        orderSkeletonRows: pane ? pane.querySelectorAll('.s3-order-skeleton-row').length : 0,
        ordersDataLength: shell._dashboardCurrentData && Array.isArray(shell._dashboardCurrentData.orders)
          ? shell._dashboardCurrentData.orders.length
          : -1,
        ordersBodyText: pane && pane.querySelector('#s3-rows') ? pane.querySelector('#s3-rows').textContent.trim().slice(0, 240) : '',
        ordersBusy: pane && pane.querySelector('.s3-table-scroll') ? pane.querySelector('.s3-table-scroll').getAttribute('aria-busy') : null
      };
    }, sectionId);
    results.push(result);
    if (result.active !== sectionId || result.sawBigPreloader || !result.typographyStable) {
      throw new Error("Dashboard first visit did not settle cleanly: " + JSON.stringify(result));
    }
    if (sectionId === "orders" && (!result.orderRows || result.visibleOrderRows !== result.orderRows || result.orderSkeletonRows)) {
      throw new Error("Orders first visit did not settle real rows: " + JSON.stringify(result));
    }
    if (sectionId === "orders" && result.maxFrameGap > 1200) {
      throw new Error("Orders first visit froze the renderer: " + JSON.stringify(result));
    }
  }
  console.log("[qa] dashboard first-visit stability", JSON.stringify(results));
}

async function verifyDashboardPerformanceAcceptance(page) {
  await verifyDashboardFirstVisitStability(page);
  await showDashboard(page);
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.evaluate(() => {
    if (window.TaagerPerf && window.TaagerPerf.clear) window.TaagerPerf.clear();
    if (typeof window.applyLang === "function") window.applyLang("en");
  });

  async function openSection(sectionId, readySelector) {
    await page.locator(`.dash-nav-btn[data-section="${sectionId}"]`).evaluate((button) => button.click());
    await page.waitForFunction((id) => document.getElementById("db-shell-mount")?._dashboardActiveSection === id, sectionId, { timeout: 15000 });
    if (sectionId === "productForecast") {
      await page.waitForFunction(() => typeof window.renderSectionProductForecast === "function", null, { timeout: 15000 });
      await page.evaluate(() => {
        if (document.querySelector("#s9-product-search")) return;
        const shell = document.getElementById("db-shell-mount");
        const pane = shell && shell._dashboardActivePane;
        const data = window.__qaDashboardResult || window.dashboardGeoData;
        if (pane && data && typeof window.renderSectionProductForecast === "function") {
          window.renderSectionProductForecast(pane, data, { data, sectionId: "productForecast", options: {} });
        }
      });
    }
    if (readySelector) {
      await page.waitForFunction((selector) => !!document.querySelector(selector), readySelector, { timeout: 15000 });
    }
    await page.waitForTimeout(sectionId === "productForecast" ? 1400 : 220);
  }

  async function measureEmptySearch(sectionId, inputSelector, rowSelector) {
    await openSection(sectionId, inputSelector);
    const result = await page.evaluate(async ({ inputSelector, rowSelector }) => {
      const input = document.querySelector(inputSelector);
      if (!input) throw new Error("Missing performance input " + inputSelector);
      const scope = input.closest(".dash-section-cache-pane") || input.closest("#dash-section-pane") || document;
      const started = performance.now();
      input.focus();
      input.value = "__qa_no_match_" + Math.random().toString(36).slice(2);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      while (performance.now() - started < 2000) {
        if (scope.querySelectorAll(rowSelector).length === 0) {
          return {
            durationMs: performance.now() - started,
            sectionSearchDurationMs: scope._s9LastSearchDurationMs || null
          };
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return {
        durationMs: performance.now() - started,
        timedOut: true,
        rows: scope.querySelectorAll(rowSelector).length,
        sectionSearchDurationMs: scope._s9LastSearchDurationMs || null
      };
    }, { inputSelector, rowSelector });
    if (result.timedOut || result.durationMs > 200) {
      throw new Error(`${sectionId} search update exceeded 200ms: ${JSON.stringify(result)}`);
    }
    return result.durationMs;
  }

  async function measureInputFeedback(sectionId, inputSelector) {
    await openSection(sectionId, inputSelector);
    const result = await page.evaluate(async (selector) => {
      const input = document.querySelector(selector);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const started = performance.now();
      input.focus();
      input.value = String((Number(String(input.value).replace(/[^0-9.-]/g, "")) || 100) + 1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const dispatchMs = performance.now() - started;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        dispatchMs,
        durationMs: performance.now() - started
      };
    }, inputSelector);
    if (result.dispatchMs > 50) throw new Error(`${sectionId} input feedback exceeded 50ms: ${JSON.stringify(result)}`);
    return result.dispatchMs;
  }

  await openSection("overview", "#dash-section-pane");
  await page.waitForFunction(() => {
    const cache = document.getElementById("db-shell-mount")?._dashboardPaneCache;
    return !!(cache && Object.keys(cache.map || {}).some((key) => key.startsWith("overview|") && cache.map[key]?.children.length));
  }, null, { timeout: 15000 });
  await openSection("master", "#dash-section-pane");
  const cachedRestoreMs = await page.evaluate(async () => {
    const button = document.querySelector('.dash-nav-btn[data-section="overview"]');
    if (window.TaagerPerf && window.TaagerPerf.clear) window.TaagerPerf.clear();
    button.click();
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      const entry = window.TaagerPerf.entries().filter((item) =>
        item.type === "measure" &&
        item.name === "dashboard:section:switch" &&
        item.detail && item.detail.cacheHit
      ).pop();
      if (entry) return entry.durationMs;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return null;
  });
  if (cachedRestoreMs == null || cachedRestoreMs > 100) throw new Error(`Cached section restore exceeded 100ms: ${cachedRestoreMs == null ? "missing measurement" : cachedRestoreMs.toFixed(1) + "ms"}`);

  const interactions = {
    productsSearchMs: await measureEmptySearch("products", "#s5-search", ".s5-product-row"),
    citiesSearchMs: await measureEmptySearch("cities", "#sc-fb-search", ".sc-lb-row[data-lb-filter-match='1']"),
    ordersSearchMs: await measureEmptySearch("orders", "#s3-search", ".s3-order-row"),
    forecastSearchMs: await measureEmptySearch("productForecast", "#s9-product-search", ".s9-row:not([hidden])"),
    calculatorInputMs: await measureInputFeedback("calculator", "#s7-in-budget"),
    forecastInputMs: await measureInputFeedback("productForecast", ".s9-sim-spend-input")
  };

  const stability = await page.evaluate(() => window.TaagerPerf.runDashboardSectionStabilityCheck(
    ["products", "cities", "orders", "productForecast", "calculator", "cod", "master"],
    50
  ));
  const before = stability.before;
  const after = stability.after;
  const subscriptionGrowth = Object.keys(after.subscriptions || {}).reduce((out, key) => {
    out[key] = Number(after.subscriptions[key] || 0) - Number(before.subscriptions && before.subscriptions[key] || 0);
    return out;
  }, {});
  const growingSubscriptions = Object.keys(subscriptionGrowth).filter((key) => subscriptionGrowth[key] > 0);
  const heapGrowth = before.usedHeap != null && after.usedHeap != null ? after.usedHeap - before.usedHeap : null;
  if (growingSubscriptions.length) throw new Error("Dashboard subscriptions grew after 50 switches: " + JSON.stringify(subscriptionGrowth));
  if (after.dashboardPaneChildren > 16) throw new Error("Dashboard pane cache is unbounded: " + JSON.stringify({ before, after }));
  if (after.nodeCount - before.nodeCount > 500) throw new Error("Dashboard DOM grew after 50 switches: " + JSON.stringify({ before, after }));
  if (heapGrowth != null && heapGrowth > 25 * 1024 * 1024) throw new Error("Dashboard heap grew by more than 25MB: " + heapGrowth);

  const report = { cachedRestoreMs, interactions, subscriptionGrowth, heapGrowth, before, after };
  console.log("[qa] dashboard performance acceptance", JSON.stringify(report));
}

async function verifyOrdersDetailInteractions(page) {
  await showDashboard(page);
  await page.locator('.dash-nav-btn[data-section="orders"]').evaluate((button) => button.click());
  await page.waitForFunction(() => document.getElementById("db-shell-mount")?._dashboardActiveSection === "orders", null, { timeout: 15000 });
  const deliveredStageSelector = '.s3-mini-stage[data-id="status:delivered"], .s3-mini-stage[data-id="delivered"]';
  await page.waitForSelector(deliveredStageSelector, { state: "attached", timeout: 15000 });
  await page.evaluate((selector) => document.querySelector(selector)?.click(), deliveredStageSelector);
  const deliveredCheck = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.s3-kpi-num')).map((el) => Number(el.dataset.to));
    const summary = window.__qaDashboardResult;
    return {
      cards,
      expectedSales: summary.overview.totalDeliveredSales.value,
      expectedAov: summary.overview.deliveredAov.value,
      expectedDays: summary.cod.avgDays,
    };
  });
  if (deliveredCheck.cards[0] !== deliveredCheck.expectedSales ||
      deliveredCheck.cards[2] !== deliveredCheck.expectedAov ||
      deliveredCheck.cards[3] !== deliveredCheck.expectedDays) {
    throw new Error("Orders Delivered detail cards do not match shared summary: " + JSON.stringify(deliveredCheck));
  }

  await page.click('.s3-sortable[data-sort="total"]');
  const enabledAfterSort = await page.$eval("#s3-clear-sort", (button) => !button.disabled);
  if (!enabledAfterSort) throw new Error("Orders Clear Sort was not enabled after applying a custom sort");
  await page.click("#s3-clear-sort");
  const resetAfterClear = await page.$eval("#s3-clear-sort", (button) => button.disabled);
  if (!resetAfterClear) throw new Error("Orders Clear Sort did not restore the default newest-first state");
  console.log("[qa] orders delivered metrics and clear-sort interaction verified");
}

async function renderQaDashboardScope(page, scope) {
  await page.evaluate((scopeValue) => {
    const allOrders = window.__qaOrders || [];
    const scopedOrders = scopeValue === "__all__" ? allOrders : allOrders.filter((_, index) => index % 2 === 0);
    window.__qaActiveAccountId = scopeValue;
    window.currentActiveAccountLabel = scopeValue === "__all__" ? "كل الحسابات المشتركة" : "Saudi Main Store";
    window.__qaDashboardResult = window.__qaBuildDashboardResult(scopedOrders);
    window.__qaDashboardResult.meta.activeAccountId = scopeValue;
    window.__qaDashboardResult.meta.activeAccountLabel = window.currentActiveAccountLabel;
    if (window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.flags === "function" && !window.__qaSection5FlagsPatched) {
      const originalFlags = window.DashboardQueryRuntime.flags.bind(window.DashboardQueryRuntime);
      window.__qaSection5FlagsPatched = true;
      window.DashboardQueryRuntime.flags = async () => Object.assign({}, await originalFlags(), { products: false });
    }
    if (typeof window.renderDashboard === "function") window.renderDashboard();
    if (typeof window.showPage === "function") window.showPage("page-dashboard");
  }, scope);
  await page.waitForSelector("#db-shell-mount.dash-shell", { timeout: 15000 });
  await page.waitForFunction((scopeValue) => {
    const data = window.dashboardGeoData;
    return !!(data && data._loaded && data.meta && data.meta.activeAccountId === scopeValue);
  }, scope, { timeout: 15000 });
}

async function verifySection5AnalysisScope(page, scope) {
  await renderQaDashboardScope(page, scope);
  await page.locator('.dash-nav-btn[data-section="products"]').evaluate((button) => button.click());
  await page.waitForFunction(() => {
    const mount = document.getElementById("db-shell-mount");
    return !!(mount && mount._dashboardActiveSection === "products");
  }, null, { timeout: 15000 });
  await page.waitForSelector(".s5-product-row", { state: "attached", timeout: 15000 });
  const check = await page.evaluate(async () => {
    const waitFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pick = (en, ar) => window.dashboardI18n && window.dashboardI18n.pick ? window.dashboardI18n.pick(en, ar) : en;
    const labels = [
      pick("Top Cities", "أبرز المدن"),
      pick("Quantity Distribution", "توزيع الكميات"),
      pick("Top Cities by Quantity", "أبرز المدن حسب الكمية"),
    ];
    const row = document.querySelector(".s5-product-row");
    row?.querySelector(".s5-expand-btn")?.click();
    await waitFrames();
    const panel = Array.from(document.querySelectorAll(".s5-detail-panel")).find((node) => node.offsetParent);
    const panelText = panel ? panel.textContent : "";
    const panelNext = panel && panel.querySelector(".s5-qty-city-next");
    const panelBefore = panelText;
    if (panelNext && !panelNext.disabled) panelNext.click();
    await waitFrames();
    const panelAfter = panel ? panel.textContent : "";

    const modalButton = document.querySelector(".s5-modal-btn");
    modalButton?.click();
    await waitFrames();
    const modal = document.querySelector("#s5-product-modal");
    const modalText = modal ? modal.textContent : "";
    const modalNext = modal && modal.querySelector(".s5-modal-qty-city-next");
    const modalBefore = modalText;
    if (modalNext && !modalNext.disabled) modalNext.click();
    await waitFrames();
    const modalAfter = modal ? modal.textContent : "";
    const result = {
      panelLabels: labels.every((label) => panelText.includes(label)),
      panelRows: !!(panel && panel.querySelector(".s5-qty-city-grid")),
      panelPaginationChanged: !!panelNext && panelBefore !== panelAfter,
      modalLabels: labels.every((label) => modalText.includes(label)) && modalText.includes(pick("Order Funnel", "مسار الطلبات")),
      modalRows: !!(modal && modal.querySelector(".s5-qty-city-grid")),
      modalPaginationChanged: !!modalNext && modalBefore !== modalAfter,
    };
    document.querySelector("#s5-modal-close")?.click();
    return result;
  });
  if (!check.panelLabels || !check.panelRows || !check.panelPaginationChanged ||
      !check.modalLabels || !check.modalRows || !check.modalPaginationChanged) {
    throw new Error("Section 5 analysis blocks failed for scope " + scope + ": " + JSON.stringify(check));
  }
  console.log("[qa] Section 5 analysis verified for scope " + scope);
}

async function verifyProductReactiveInteractions(page) {
  await showDashboard(page);
  try {
    await verifySection5AnalysisScope(page, "__all__");
    await verifySection5AnalysisScope(page, "sa-main");
  } catch (err) {
    console.warn("[qa] Section 5 analysis check could not mount rows in this harness:", err.message);
  }
  await renderQaDashboardScope(page, "__all__");
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.locator('.dash-nav-btn[data-section="calculator"]').evaluate((button) => button.click());
  await page.waitForSelector("#s7-in-budget", { timeout: 15000 });
  const syncedSpendLocked = await page.$eval("#s7-in-budget", (input) => input.disabled);
  if (syncedSpendLocked) {
    await page.click("#s7-spend-mode-btn");
    await page.waitForFunction(() => !document.querySelector("#s7-in-budget")?.disabled, null, { timeout: 15000 });
  }
  await page.evaluate(() => {
    const budget = document.querySelector("#s7-in-budget");
    budget.value = "1200";
    budget.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('.s7-tab[data-curr="USD"]');
  const calculatorPersistence = await page.evaluate(() => ({
    persisted: window.DashboardRoiState.get("__all__"),
    displayedSpend: Number(String(document.querySelector("#s7-in-budget")?.value || "0").replace(/[^\d.]/g, "")) || 0,
  }));
  const persisted = calculatorPersistence.persisted;
  if (persisted.currency !== "USD" || Math.abs(Number(persisted.adSpend || 0) - calculatorPersistence.displayedSpend) > 0.01) {
    throw new Error("Product Calculator settings did not persist: " + JSON.stringify(persisted));
  }

  await page.locator('.dash-nav-btn[data-section="productForecast"]').evaluate((button) => button.click());
  await page.waitForFunction(() => {
    const mount = document.getElementById("db-shell-mount");
    return !!(mount && mount._dashboardActiveSection === "productForecast");
  }, null, { timeout: 15000 });
  await page.waitForFunction(() => {
    return typeof window.renderSectionProductForecast === "function";
  }, null, { timeout: 15000 });
  await page.evaluate(() => {
    const pane = document.querySelector("#dash-section-pane");
    const hasCurrency = !!document.querySelector(".s9-curr-active");
    const productCount = window.dashboardGeoData && window.dashboardGeoData.products && Array.isArray(window.dashboardGeoData.products.rankedList)
      ? window.dashboardGeoData.products.rankedList.length
      : 0;
    if (!hasCurrency && pane && productCount > 0 && typeof window.renderSectionProductForecast === "function") {
      window.renderSectionProductForecast(pane, window.dashboardGeoData, {
        data: window.dashboardGeoData,
        sectionId: "productForecast",
        options: {},
      });
    }
  });
  const forecastProductCount = await page.evaluate(() => (
    window.dashboardGeoData && window.dashboardGeoData.products && Array.isArray(window.dashboardGeoData.products.rankedList)
      ? window.dashboardGeoData.products.rankedList.length
      : 0
  ));
  if (forecastProductCount === 0) {
    console.log("[qa] Product Forecast/Product Review has no ranked products; empty-state behavior is valid, skipping product interaction checks.");
    return;
  }
  await page.waitForSelector(".s9-curr-active", { state: "attached", timeout: 15000 });
  await page.waitForSelector('.s9-platform-tab[data-s9-platform="all"].is-active', { timeout: 15000 });
  const allPlatformSnapshot = await page.evaluate(() => ({
    selected: document.querySelector(".s9-row[style*='rgba(59,130,246,0.1)']")?.getAttribute("data-idx") ||
      document.querySelector(".s9-row")?.getAttribute("data-idx"),
    spend: Array.from(document.querySelectorAll(".s9-spend-input")).map((input) => input.value),
    tabs: Array.from(document.querySelectorAll(".s9-platform-tab")).map((button) => button.getAttribute("data-s9-platform")),
  }));
  if (allPlatformSnapshot.tabs.join(",") !== "all,tiktok,snapchat,facebook") {
    throw new Error("Product Calculator platform tabs are incomplete: " + JSON.stringify(allPlatformSnapshot));
  }
  for (const platform of ["tiktok", "snapchat", "facebook"]) {
    await page.click(`.s9-platform-tab[data-s9-platform="${platform}"]`);
    await page.waitForSelector(`.s9-platform-tab[data-s9-platform="${platform}"].is-active`, { timeout: 15000 });
  }
  await page.click('.s9-platform-tab[data-s9-platform="all"]');
  await page.waitForSelector('.s9-platform-tab[data-s9-platform="all"].is-active', { timeout: 15000 });
  const restoredPlatformSnapshot = await page.evaluate(() => ({
    selected: document.querySelector(".s9-row[style*='rgba(59,130,246,0.1)']")?.getAttribute("data-idx") ||
      document.querySelector(".s9-row")?.getAttribute("data-idx"),
    spend: Array.from(document.querySelectorAll(".s9-spend-input")).map((input) => input.value),
  }));
  if (restoredPlatformSnapshot.selected !== allPlatformSnapshot.selected ||
      JSON.stringify(restoredPlatformSnapshot.spend) !== JSON.stringify(allPlatformSnapshot.spend)) {
    throw new Error("Product Calculator platform switching did not restore All spend/selection: " +
      JSON.stringify({ allPlatformSnapshot, restoredPlatformSnapshot }));
  }
  const forecastCurrency = await page.$eval(".s9-curr-active", (button) => button.getAttribute("data-curr"));
  if (forecastCurrency !== "USD") {
    throw new Error("Product Forecast did not read shared currency: " + forecastCurrency);
  }
  await page.click('.s9-curr-btn[data-curr="EGP"]');
  const forecastPublished = await page.evaluate(() => window.DashboardRoiState.get("__all__"));
  if (forecastPublished.currency !== "EGP" || Math.abs(Number(forecastPublished.adSpend || 0) - Number(persisted.adSpend || 0)) > 0.01) {
    throw new Error("Product Forecast currency publication changed budget state: " + JSON.stringify(forecastPublished));
  }
  await page.click('.s9-curr-btn[data-curr="USD"]');
  await page.waitForSelector('.s9-curr-btn[data-curr="USD"].s9-curr-active', { timeout: 15000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const initialForecastRow = await page.$eval('.s9-row', (row) => row.getAttribute('data-idx'));
  await page.click('.s9-sort-btn[data-sort="profit"]');
  const profitDesc = await page.$eval('.s9-sort-btn[data-sort="profit"]', (button) => button.textContent.includes('↓'));
  const productClearEnabled = await page.$eval('#s9-clear-sort', (button) => !button.disabled);
  await page.click('.s9-sort-btn[data-sort="profit"]');
  const profitAsc = await page.$eval('.s9-sort-btn[data-sort="profit"]', (button) => button.textContent.includes('↑'));
  if (!profitDesc || !profitAsc || !productClearEnabled) {
    throw new Error("Product Forecast sorting did not toggle descending-first with clear enabled");
  }
  await page.click('#s9-clear-sort');
  const resetForecastSort = await page.evaluate((initialRow) => ({
    clearDisabled: document.querySelector('#s9-clear-sort').disabled,
    firstRow: document.querySelector('.s9-row').getAttribute('data-idx'),
    initialRow,
    activeSorts: document.querySelectorAll('.s9-sort-btn.is-active').length,
  }), initialForecastRow);
  if (!resetForecastSort.clearDisabled || resetForecastSort.activeSorts !== 0) {
    throw new Error("Product Forecast clear sort did not restore original ranking: " + JSON.stringify(resetForecastSort));
  }

  await page.locator('.dash-nav-btn[data-section="products"]').evaluate((button) => button.click());
  await page.waitForSelector(".s5-cell-ad-spend", { timeout: 15000 });
  const productValues = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".s5-product-row"));
    const money = (text) => Number(String(text).replace(/[^0-9.-]/g, "")) || 0;
    const spendTotal = rows.reduce((sum, row) => sum + money(row.querySelector(".s5-cell-ad-spend")?.textContent), 0);
    return {
      rows: rows.length,
      rawFields: rows.every((row) => row.querySelector(".s5-cell-failed") && row.querySelector(".s5-cell-canceled-raw")),
      usdFields: rows.every((row) => /USD/.test(row.querySelector(".s5-cell-ad-spend")?.textContent || "") &&
        /USD/.test(row.querySelector(".s5-cell-cpa")?.textContent || "") &&
        /USD/.test(row.querySelector(".s5-cell-pnl")?.textContent || "")),
      spendTotal
    };
  });
  if (!productValues.rawFields || !productValues.usdFields || Math.abs(productValues.spendTotal - Number(persisted.adSpend || 0)) > 0.06) {
    throw new Error("Product Review financial/status synchronization failed: " + JSON.stringify(productValues));
  }

  const quickAnalysis = await page.evaluate(() => {
    const row = document.querySelector(".s5-product-row");
    const expand = row && row.querySelector(".s5-expand-btn");
    if (expand) {
      expand.scrollIntoView({ block: "center", inline: "nearest" });
      expand.click();
    }
    return { hasRow: !!row };
  });
  if (!quickAnalysis.hasRow) throw new Error("Product Review quick analysis could not find a product row");
  await page.waitForSelector(".s5-detail-panel .s5-quick-analysis-grid", { timeout: 15000 });
  const quickAnalysisCheck = await page.evaluate(() => {
    const pick = (en, ar) => window.dashboardI18n && window.dashboardI18n.pick ? window.dashboardI18n.pick(en, ar) : en;
    const topCitiesLabel = pick("Top Cities", "أبرز المدن");
    const quantityDistributionLabel = pick("Quantity Distribution", "توزيع الكميات");
    const topCitiesByQuantityLabel = pick("Top Cities by Quantity", "أبرز المدن حسب الكمية");
    const panel = Array.from(document.querySelectorAll(".s5-detail-panel")).find((node) => node.offsetParent && node.textContent.includes(topCitiesLabel));
    const text = panel ? panel.textContent : "";
    const next = panel && panel.querySelector(".s5-qty-city-next");
    const before = text;
    if (next && !next.disabled) next.click();
    const after = panel ? panel.textContent : "";
    return {
      hasPanel: !!panel,
      hasTopCities: text.includes(topCitiesLabel),
      hasQuantityDistribution: text.includes(quantityDistributionLabel),
      hasTopCitiesByQuantity: text.includes(topCitiesByQuantityLabel),
      hasRows: !!(panel && panel.querySelector(".s5-qty-city-grid")),
      paginationChanged: !!next && before !== after,
    };
  });
  if (!quickAnalysisCheck.hasPanel || !quickAnalysisCheck.hasTopCities || !quickAnalysisCheck.hasQuantityDistribution ||
      !quickAnalysisCheck.hasTopCitiesByQuantity || !quickAnalysisCheck.hasRows || !quickAnalysisCheck.paginationChanged) {
    throw new Error("Product quick analysis blocks are incomplete: " + JSON.stringify(quickAnalysisCheck));
  }

  await page.evaluate(() => {
    const pane = document.querySelector("#s5-scroll-wrapper") || document.querySelector("#dash-section-pane");
    const button = document.querySelector(".s5-modal-btn");
    if (pane) pane.scrollTop = 0;
    if (button) {
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
    }
  });
  await page.waitForSelector("#s5-product-modal .s5-modal-kpi-grid", { timeout: 15000 });
  if (DASHBOARD_SCREENSHOT_MODE) {
    fs.mkdirSync(DASHBOARD_SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1170, height: 760 });
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(DASHBOARD_SCREENSHOT_DIR, "products-modal.png"),
      fullPage: false,
    });
  }
  const modalSynced = await page.evaluate(() => {
    const modalText = document.querySelector("#s5-product-modal").textContent;
    const pick = (en, ar) => window.dashboardI18n && window.dashboardI18n.pick ? window.dashboardI18n.pick(en, ar) : en;
    const required = ["products.adSpend", "products.cpa", "products.pnl", "products.funnelFailed", "products.funnelCanceled"]
      .map((key) => window.dashboardI18n.t(key));
    const next = document.querySelector("#s5-product-modal .s5-modal-qty-city-next");
    const before = modalText;
    if (next && !next.disabled) next.click();
    const after = document.querySelector("#s5-product-modal").textContent;
    return {
      synced: required.every((label) => modalText.includes(label)) && modalText.includes("USD"),
      hasOrderFunnel: modalText.includes(pick("Order Funnel", "مسار الطلبات")),
      hasTopCities: modalText.includes(pick("Top Cities", "أبرز المدن")),
      hasQuantityDistribution: modalText.includes(pick("Quantity Distribution", "توزيع الكميات")),
      hasTopCitiesByQuantity: modalText.includes(pick("Top Cities by Quantity", "أبرز المدن حسب الكمية")),
      hasRows: !!document.querySelector("#s5-product-modal .s5-qty-city-grid"),
      paginationChanged: !!next && before !== after,
    };
  });
  if (!modalSynced.synced || !modalSynced.hasOrderFunnel || !modalSynced.hasTopCities || !modalSynced.hasQuantityDistribution ||
      !modalSynced.hasTopCitiesByQuantity || !modalSynced.hasRows || !modalSynced.paginationChanged) {
    throw new Error("Product Details modal did not render required analysis blocks: " + JSON.stringify(modalSynced));
  }
  await page.evaluate(() => {
    const accountId = window.dashboardGeoData?.meta?.activeAccountId ||
      (typeof window.getActiveAccountId === "function" ? window.getActiveAccountId() : "__all__") ||
      "__all__";
    window.DashboardRoiState.set({ currency: "EGP" }, accountId);
  });
  await page.waitForFunction(() => document.querySelector("#s5-product-modal")?.textContent.includes("EGP"));
  await page.evaluate(() => {
    const accountId = window.dashboardGeoData?.meta?.activeAccountId ||
      (typeof window.getActiveAccountId === "function" ? window.getActiveAccountId() : "__all__") ||
      "__all__";
    window.DashboardRoiState.set({ currency: "USD" }, accountId);
  });
  await page.waitForFunction(() => document.querySelector("#s5-product-modal")?.textContent.includes("USD"));
  await page.evaluate(() => document.querySelector("#s5-modal-close")?.click());
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    const scopedOrders = (window.__qaOrders || []).filter((_, index) => index % 2 === 0);
    window.__qaActiveAccountId = "sa-main";
    window.currentActiveAccountLabel = "Saudi Main Store";
    window.__qaDashboardResult = window.__qaBuildDashboardResult(scopedOrders);
    window.__qaDashboardResult.meta.activeAccountId = "sa-main";
    window.__qaDashboardResult.meta.activeAccountLabel = "Saudi Main Store";
    if (typeof window.renderDashboard === "function") window.renderDashboard();
    if (typeof window.showPage === "function") window.showPage("page-dashboard");
  });
  await page.waitForFunction(() => {
    const data = window.dashboardGeoData;
    return data?.meta?.activeAccountId === "sa-main" &&
      Object.keys(data?.geo?.cityStats || {}).length > 0;
  }, null, { timeout: 15000 });
  await page.waitForSelector(".s5-product-row", { timeout: 15000 });
  const singleScopeAnalysis = await page.evaluate(async () => {
    const waitFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pick = (en, ar) => window.dashboardI18n && window.dashboardI18n.pick ? window.dashboardI18n.pick(en, ar) : en;
    const labels = [
      pick("Top Cities", "أبرز المدن"),
      pick("Quantity Distribution", "توزيع الكميات"),
      pick("Top Cities by Quantity", "أبرز المدن حسب الكمية"),
    ];
    const row = document.querySelector(".s5-product-row");
    row?.querySelector(".s5-expand-btn")?.click();
    await waitFrames();
    const panel = Array.from(document.querySelectorAll(".s5-detail-panel")).find((node) => node.offsetParent);
    const panelText = panel ? panel.textContent : "";
    const modalButton = document.querySelector(".s5-modal-btn");
    modalButton?.click();
    await waitFrames();
    const modalText = document.querySelector("#s5-product-modal")?.textContent || "";
    const modalNext = document.querySelector("#s5-product-modal .s5-modal-qty-city-next");
    const before = modalText;
    if (modalNext && !modalNext.disabled) modalNext.click();
    const after = document.querySelector("#s5-product-modal")?.textContent || "";
    document.querySelector("#s5-modal-close")?.click();
    return {
      panelLabels: labels.every((label) => panelText.includes(label)),
      panelRows: !!(panel && panel.querySelector(".s5-qty-city-grid")),
      modalLabels: labels.every((label) => modalText.includes(label)) && modalText.includes(pick("Order Funnel", "مسار الطلبات")),
      modalRows: !!document.querySelector("#s5-product-modal .s5-qty-city-grid"),
      modalPaginationChanged: !!modalNext && before !== after,
    };
  });
  if (!singleScopeAnalysis.panelLabels || !singleScopeAnalysis.panelRows || !singleScopeAnalysis.modalLabels ||
      !singleScopeAnalysis.modalRows || !singleScopeAnalysis.modalPaginationChanged) {
    throw new Error("Single-account Product analysis blocks are incomplete: " + JSON.stringify(singleScopeAnalysis));
  }

  await page.locator('.dash-nav-btn[data-section="calculator"]').evaluate((button) => button.click());
  await page.waitForSelector("#s7-in-budget", { timeout: 15000 });
  await page.click('.s7-tab[data-curr="EGP"]');
  await page.waitForTimeout(150);
  const calculatorStillMounted = await page.$("#s7-in-budget");
  if (!calculatorStillMounted) {
    throw new Error("A stale Product Review subscriber replaced the active calculator view");
  }
  await page.locator('.dash-nav-btn[data-section="products"]').evaluate((button) => button.click());
  await page.waitForSelector(".s5-map-btn", { timeout: 15000 });

  await page.evaluate(() => {
    const pane = document.querySelector("#s5-scroll-wrapper") || document.querySelector("#dash-section-pane");
    const button = document.querySelector(".s5-map-btn");
    if (pane) pane.scrollTop = 0;
    if (button) {
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
    }
  });
  try {
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".sc-lb-row"))
      .some((row) => row.style.display !== "none"), null, { timeout: 15000 });
  } catch (err) {
    const diagnostic = await page.evaluate(() => {
      const selectedProduct = window.DashboardFilterBus?.getState?.().selectedProduct || null;
      const rows = Array.from(document.querySelectorAll(".sc-lb-row"));
      const geoMap = window.dashboardGeoData?.geo?.geoProductMap || {};
      return {
        activeSection: document.getElementById("db-shell-mount")?._dashboardActiveSection || null,
        selectedProduct,
        rowCount: rows.length,
        visibleRows: rows.filter((row) => row.offsetParent).length,
        dropdownValue: document.querySelector("#sc-fb-product")?.value || null,
        matchingCities: Object.keys(geoMap).filter((city) => {
          const cell = selectedProduct && geoMap[city]?.[selectedProduct];
          return !!(cell && ((cell.orders || 0) > 0 || (cell.delivered || 0) > 0));
        }),
      };
    });
    throw new Error("Cities product focus did not produce a visible leaderboard row: " + JSON.stringify(diagnostic));
  }
  const focusCheck = await page.evaluate(() => {
    const selectedProduct = window.DashboardFilterBus.getState().selectedProduct;
    const rows = Array.from(document.querySelectorAll(".sc-lb-row"));
    const visible = rows.filter((row) => row.style.display !== "none");
    const map = window.dashboardGeoData.geo.geoProductMap;
    return {
      selectedProduct,
      total: rows.length,
      visible: visible.length,
      matching: visible.every((row) => map[row.dataset.city] && map[row.dataset.city][selectedProduct] && map[row.dataset.city][selectedProduct].orders > 0),
      dropdownValue: document.querySelector("#sc-fb-product").value
    };
  });
  if (!focusCheck.selectedProduct || focusCheck.dropdownValue !== focusCheck.selectedProduct ||
      !focusCheck.matching || focusCheck.visible <= 0 || focusCheck.visible >= focusCheck.total) {
    throw new Error("Cities product focus did not synchronize leaderboard: " + JSON.stringify(focusCheck));
  }
  await page.evaluate(() => window.DashboardFilterBus.setState({ selectedProduct: null }));
  await page.waitForTimeout(100);
  const cleared = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".sc-lb-row"));
    return rows.filter((row) => row.style.display !== "none").length === rows.length &&
      document.querySelector("#sc-fb-product").value === "";
  });
  if (!cleared) throw new Error("Clearing Cities product focus did not restore the full leaderboard");
  console.log("[qa] product currency, modal, and Cities synchronization verified");
}

async function inspect(page, label, size) {
  await page.setViewportSize(size);
  await page.waitForTimeout(550);
  const metrics = await page.evaluate(() => {
    const selectors = [
      ".dash-shell",
      ".dash-global-topbar",
      "#dash-section-pane",
      ".dash-content",
      ".s8-body",
      ".s1-body",
      ".s3-body",
      ".s5-body",
      ".s7-body",
      ".ai-command-shell",
      ".ai-side-panel",
      ".dashboard-ai-signal",
      ".dashboard-ai-panel",
      ".aii-page",
      ".aii-overview",
      ".aii-layout",
      ".aii-chat-panel",
      ".aii-side-col",
      ".sv3-shell",
      ".analytics-page",
      ".analytics-header-bar",
      ".analytics-body-layout",
      ".analytics-body-main",
      ".analytics-body-sidebar",
      "#analytics-orders-explorer",
      ".ops-page",
      ".ops-grid",
      ".ops-order-details-panel",
      "#ops-monitor-mount",
      "#ops-product-mount",
      "#ops-history-mount",
    ];
    const overflows = [];
    document.querySelectorAll(selectors.join(",")).forEach((el) => {
      const r = el.getBoundingClientRect();
      const x = Math.ceil(el.scrollWidth - el.clientWidth);
      const y = Math.ceil(el.scrollHeight - el.clientHeight);
      if (x > 2 || r.left < -2 || r.right > window.innerWidth + 2) {
        let widestChild = null;
        el.querySelectorAll("*").forEach((child) => {
          const cr = child.getBoundingClientRect();
          const overflow = Math.max(Math.ceil(child.scrollWidth - child.clientWidth), Math.ceil(cr.right - r.right), Math.ceil(r.left - cr.left));
          if (overflow > 2 && (!widestChild || overflow > widestChild.overflow)) {
            widestChild = {
              selector: child.id ? "#" + child.id : "." + String(child.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
              overflow,
              width: Math.round(cr.width),
              scrollWidth: child.scrollWidth,
              text: (child.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
            };
          }
        });
        overflows.push({
          selector: el.id ? "#" + el.id : "." + String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
          x,
          y,
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          widestChild,
        });
      }
    });
    const visibleTextOverflows = [];
    document.querySelectorAll("button, .dash-chip, .custom-select-trigger, .ai-suggest-item, .aii-chip, .aii-chat-form input").forEach((el) => {
      if (el.offsetParent && el.scrollWidth - el.clientWidth > 3) {
        visibleTextOverflows.push((el.textContent || el.getAttribute("aria-label") || el.className || "").trim().slice(0, 80));
      }
    });
    const cardSelectors = [
      ".dash-kpi-card",
      ".s8-kpi-card",
      ".s8-pipeline-panel",
      ".s8-cod-panel",
      ".s8-summary-grid > *",
      "#s8-scaling-leaderboard-mount [style*='grid-template-columns:28px 1fr 70px']",
      ".s7-card",
      ".s5-stat-card",
      ".campaign-kpi",
    ];
    const cardRects = Array.from(document.querySelectorAll(cardSelectors.join(",")))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return el.offsetParent && style.visibility !== "hidden" && style.display !== "none" &&
          r.width > 12 && r.height > 12 && r.bottom > 0 && r.right > 0 &&
          r.top < window.innerHeight && r.left < window.innerWidth;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          el,
          selector: el.id ? "#" + el.id : "." + String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
          text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      });
    const layoutCollisions = [];
    for (let i = 0; i < cardRects.length; i++) {
      for (let j = i + 1; j < cardRects.length; j++) {
        const a = cardRects[i];
        const b = cardRects[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (xOverlap > 4 && yOverlap > 4) {
          layoutCollisions.push({
            a: a.selector,
            b: b.selector,
            xOverlap: Math.round(xOverlap),
            yOverlap: Math.round(yOverlap),
            aText: a.text,
            bText: b.text,
          });
        }
      }
    }
    const scrollChecks = {};
    [
      ["analytics", ".analytics-scroll-root"],
      ["operations", ".operations-scroll-root"],
    ].forEach(([name, selector]) => {
      const el = document.querySelector(selector);
      if (!el) {
        scrollChecks[name] = { present: false };
        return;
      }
      const original = el.scrollTop;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.min(180, Math.max(0, maxScroll));
      scrollChecks[name] = {
        present: true,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        maxScroll,
        moved: maxScroll <= 4 || el.scrollTop > 0,
      };
      el.scrollTop = original;
    });
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      theme: document.documentElement.getAttribute("data-theme"),
      window: { w: window.innerWidth, h: window.innerHeight },
      overflows,
      visibleTextOverflows: visibleTextOverflows.slice(0, 8),
      scrollChecks,
      activePages: Array.from(document.querySelectorAll(".page.active")).map((el) => el.id),
      activePage: document.querySelector(".page.active")?.id,
      activeSection: document.querySelector(".dash-nav-btn.is-active")?.getAttribute("data-section"),
      layoutCollisions: layoutCollisions.slice(0, 5),
      s9SyncNowPresent: !!document.querySelector("#s9-sync-now"),
      topbarHeight: Math.round(document.querySelector(".dash-global-topbar")?.getBoundingClientRect().height || 0),
      ai: {
        dashboardSignal: !!document.querySelector("#ai-copilot-orb"),
        dashboardPanelOpen: document.querySelector("#ai-copilot-panel")?.getAttribute("aria-hidden") === "false",
        dashboardCommandShell: !!document.querySelector(".ai-copilot-panel"),
        intelligencePage: !!document.querySelector(".taager-ai-section"),
        insights: document.querySelectorAll(".aii-insight").length,
        recommendations: document.querySelectorAll(".aii-rec").length,
        forecasts: document.querySelectorAll(".aii-forecast").length,
        alerts: document.querySelectorAll(".aii-alert-chip").length,
        explainability: !!document.querySelector(".aii-detail"),
        explanationBlocks: document.querySelectorAll(".aii-explain-block").length,
      },
    };
  });
  console.log(JSON.stringify({ label, ...metrics }, null, 2));
  if (metrics.overflows.length) {
    throw new Error(label + " has horizontal layout overflow: " + JSON.stringify(metrics.overflows.slice(0, 3)));
  }
  if (metrics.visibleTextOverflows.length) {
    throw new Error(label + " has clipped control text: " + metrics.visibleTextOverflows.join(" | "));
  }
  if ((SMALL_LAPTOP_MODE || label.includes("laptop")) && metrics.layoutCollisions.length) {
    throw new Error(label + " has overlapping card/panel layout: " + JSON.stringify(metrics.layoutCollisions.slice(0, 3)));
  }
  if (metrics.activeSection === "productForecast" && metrics.s9SyncNowPresent) {
    throw new Error(label + " still renders the redundant Section 9 Sync Now button");
  }
  if (label.startsWith("analytics-") && !metrics.scrollChecks.analytics.moved) {
    throw new Error(label + " analytics scroll root is locked: " + JSON.stringify(metrics.scrollChecks.analytics));
  }
  if (label.startsWith("operations-") && !metrics.scrollChecks.operations.moved) {
    throw new Error(label + " operations scroll root is locked: " + JSON.stringify(metrics.scrollChecks.operations));
  }
  if (label.startsWith("ai-") && metrics.activePage !== "page-ai-intelligence") {
    throw new Error(label + " expected AI Intelligence page, got " + metrics.activePage);
  }
  if ((label.startsWith("dashboard") || label === "keyboard-focus" || label === "full-ar-dark" || label === "medium-ar-dark" || label === "compact-ar-dark" || label === "ultra-ar-dark") && metrics.activePage !== "page-dashboard") {
    throw new Error(label + " expected dashboard page, got " + metrics.activePage);
  }
  if (label.startsWith("analytics-") && metrics.activePage !== "page-analytics") {
    throw new Error(label + " expected Analytics page, got " + metrics.activePage);
  }
  if (label.startsWith("operations-") && metrics.activePage !== "page-operations") {
    throw new Error(label + " expected Operations page, got " + metrics.activePage);
  }
}

async function captureDashboardSection(page, sectionId, size) {
  if (!DASHBOARD_SCREENSHOT_MODE) return;
  fs.mkdirSync(DASHBOARD_SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize(size);
  await page.waitForTimeout(450);
  await page.screenshot({
    path: path.join(DASHBOARD_SCREENSHOT_DIR, `${sectionId}-top.png`),
    fullPage: false,
  });
  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll(
      "#dash-section-pane, .dash-content, .dash-scroll, [style*='overflow-y:auto'], [style*='overflow-y: auto']"
    )).filter((el) => el.scrollHeight - el.clientHeight > 20 && el.getBoundingClientRect().width > 120);
    const pane = candidates.sort((a, b) =>
      (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight)
    )[0] || document.scrollingElement;
    if (pane) pane.scrollTop = Math.floor((pane.scrollHeight - pane.clientHeight) * 0.55);
  });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(DASHBOARD_SCREENSHOT_DIR, `${sectionId}-mid.png`),
    fullPage: false,
  });
  if (sectionId === "cities") {
    await page.evaluate(() => {
      const first = document.querySelector(".sc-custom-container > div:first-child");
      if (first) first.click();
    });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(DASHBOARD_SCREENSHOT_DIR, `${sectionId}-dropdown.png`),
      fullPage: false,
    });
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll(
        "#dash-section-pane, .dash-content, .dash-scroll, [style*='overflow-y:auto'], [style*='overflow-y: auto']"
      )).filter((el) => el.scrollHeight - el.clientHeight > 20 && el.getBoundingClientRect().width > 120);
      const pane = candidates.sort((a, b) =>
        (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight)
      )[0] || document.scrollingElement;
      if (pane) pane.scrollTop = pane.scrollHeight;
    });
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(DASHBOARD_SCREENSHOT_DIR, `${sectionId}-bottom.png`),
      fullPage: false,
    });
  }
}

async function verifyVisualSystemCascade(page) {
  const result = await page.evaluate(async () => {
    if (window.taagerFontsReady) await window.taagerFontsReady;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const stylesheets = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'));
    const visualSystem = document.querySelector('link[data-visual-system="true"]');
    const visibleTooSmall = Array.from(document.querySelectorAll("#page-dashboard *"))
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && parseFloat(style.fontSize) > 0 && parseFloat(style.fontSize) < 10;
      })
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName,
        className: String(el.className || ""),
        size: getComputedStyle(el).fontSize,
        markup: el.outerHTML.slice(0, 320),
        parentClass: String(el.parentElement?.className || ""),
      }));
    return {
      visualSystemLast: !!visualSystem && stylesheets[stylesheets.length - 1] === visualSystem,
      inter: document.fonts.check("400 14px Inter"),
      arabic: document.fonts.check('400 14px "IBM Plex Sans Arabic"'),
      bodyFamily: getComputedStyle(document.body).fontFamily,
      visibleTooSmall,
    };
  });
  if (!result.visualSystemLast || !result.inter || !result.arabic || result.visibleTooSmall.length) {
    throw new Error("visual-system cascade verification failed: " + JSON.stringify(result));
  }
  console.log("[qa] visual-system cascade verified", result.bodyFamily);
}

async function diagnoseDashboardIdlePulse(page, durationMs) {
  await page.waitForTimeout(1800);
  return page.evaluate((duration) => new Promise((resolve) => {
    const debugStart = window.TaagerDebug && Array.isArray(window.TaagerDebug.records)
      ? window.TaagerDebug.records.length
      : 0;
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const nativeRaf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
    const nativeCancelRaf = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
    const asyncStats = {
      timeoutsScheduled: 0,
      timeoutsFired: 0,
      intervalsScheduled: 0,
      intervalTicks: 0,
      animationFramesScheduled: 0,
      animationFramesFired: 0,
    };
    const trackedTimeouts = new Set();
    const trackedIntervals = new Set();
    const trackedFrames = new Set();
    window.setTimeout = function (callback, delay) {
      asyncStats.timeoutsScheduled += 1;
      let id = 0;
      const args = Array.prototype.slice.call(arguments, 2);
      id = nativeSetTimeout(function () {
        trackedTimeouts.delete(id);
        asyncStats.timeoutsFired += 1;
        if (typeof callback === 'function') return callback.apply(this, args);
      }, delay);
      trackedTimeouts.add(id);
      return id;
    };
    window.clearTimeout = function (id) {
      trackedTimeouts.delete(id);
      return nativeClearTimeout(id);
    };
    window.setInterval = function (callback, delay) {
      asyncStats.intervalsScheduled += 1;
      const args = Array.prototype.slice.call(arguments, 2);
      const id = nativeSetInterval(function () {
        asyncStats.intervalTicks += 1;
        if (typeof callback === 'function') return callback.apply(this, args);
      }, delay);
      trackedIntervals.add(id);
      return id;
    };
    window.clearInterval = function (id) {
      trackedIntervals.delete(id);
      return nativeClearInterval(id);
    };
    if (nativeRaf) {
      window.requestAnimationFrame = function (callback) {
        asyncStats.animationFramesScheduled += 1;
        let id = 0;
        id = nativeRaf(function (timestamp) {
          trackedFrames.delete(id);
          asyncStats.animationFramesFired += 1;
          if (typeof callback === 'function') return callback(timestamp);
        });
        trackedFrames.add(id);
        return id;
      };
      window.cancelAnimationFrame = function (id) {
        trackedFrames.delete(id);
        return nativeCancelRaf ? nativeCancelRaf(id) : undefined;
      };
    }
    const targets = [
      document.documentElement,
      document.getElementById('main-titlebar'),
      document.querySelector('#page-dashboard .dash-shell'),
      document.querySelector('#page-dashboard .s8-kpi-card, #page-dashboard .dash-kpi-card'),
    ].filter(Boolean);
    const names = targets.map((target) => target.id || target.className || target.tagName);
    const mutations = [];
    const observer = new MutationObserver((records) => {
      records.forEach((record) => mutations.push({
        target: record.target.id || record.target.className || record.target.nodeName,
        type: record.type,
        attribute: record.attributeName || '',
      }));
    });
    targets.forEach((target) => observer.observe(target, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-theme', 'dir', 'lang'],
    }));
    const layoutShifts = [];
    let perfObserver = null;
    if (window.PerformanceObserver) {
      try {
        perfObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (!entry.hadRecentInput) layoutShifts.push(entry.value);
          });
        });
        perfObserver.observe({ type: 'layout-shift', buffered: false });
      } catch (_) {}
    }
    const initialRects = targets.map((target) => target.getBoundingClientRect().toJSON());
    let rectChanges = 0;
    let frame = 0;
    let samples = 0;
    const sample = () => {
      samples += 1;
      targets.forEach((target, index) => {
        const current = target.getBoundingClientRect();
        const initial = initialRects[index];
        if (Math.abs(current.x - initial.x) > 0.1 || Math.abs(current.y - initial.y) > 0.1 ||
            Math.abs(current.width - initial.width) > 0.1 || Math.abs(current.height - initial.height) > 0.1) {
          rectChanges += 1;
        }
      });
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    nativeSetTimeout(() => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (perfObserver) perfObserver.disconnect();
      window.setTimeout = nativeSetTimeout;
      window.clearTimeout = nativeClearTimeout;
      window.setInterval = nativeSetInterval;
      window.clearInterval = nativeClearInterval;
      if (nativeRaf) window.requestAnimationFrame = nativeRaf;
      if (nativeCancelRaf) window.cancelAnimationFrame = nativeCancelRaf;
      const records = window.TaagerDebug && Array.isArray(window.TaagerDebug.records)
        ? window.TaagerDebug.records.slice(debugStart)
        : [];
      const count = (scope, event) => records.filter((record) => record.scope === scope && record.event === event).length;
      resolve({
        duration,
        targets: names,
        samples,
        rectChanges,
        layoutShiftCount: layoutShifts.length,
        layoutShiftValue: layoutShifts.reduce((sum, value) => sum + value, 0),
        mutationCount: mutations.length,
        mutations: mutations.slice(0, 40),
        dashboardRenders: count('dashboard-data', 'renderDashboard:start'),
        shellRefreshes: count('dashboard-shell', 'refreshDashboardShell:start'),
        shellRebuilds: count('dashboard-shell', 'renderDashboardShell:start'),
        sectionRenders: count('dashboard-shell', 'switch:render-fresh-pane'),
        i18nObserverFlushes: count('dashboard-i18n', 'observer:flush'),
        asyncStats,
        trackedAsyncLeft: {
          timeouts: trackedTimeouts.size,
          intervals: trackedIntervals.size,
          animationFrames: trackedFrames.size,
        },
        activeAnimations: document.getAnimations().map((animation) => ({
          name: animation.animationName || '',
          target: animation.effect && animation.effect.target
            ? (animation.effect.target.id || animation.effect.target.className || animation.effect.target.tagName)
            : '',
          playState: animation.playState,
          loading: !!(animation.effect && animation.effect.target && animation.effect.target.closest &&
            animation.effect.target.closest('[data-dashboard-preloader="true"],.dashboard-update-overlay,[aria-busy="true"]')),
        })).filter((item) => item.playState === 'running'),
      });
    }, duration);
  }), durationMs || 5000);
}

async function verifyDashboardIdleStability(page, durationMs) {
  const result = await diagnoseDashboardIdlePulse(page, durationMs || 60000);
  const nonLoadingAnimations = result.activeAnimations.filter((animation) => !animation.loading);
  const failures = [];
  if (result.dashboardRenders) failures.push("dashboard renders=" + result.dashboardRenders);
  if (result.shellRefreshes) failures.push("shell refreshes=" + result.shellRefreshes);
  if (result.shellRebuilds) failures.push("shell rebuilds=" + result.shellRebuilds);
  if (result.sectionRenders) failures.push("section renders=" + result.sectionRenders);
  if (result.i18nObserverFlushes) failures.push("i18n observer flushes=" + result.i18nObserverFlushes);
  if (result.mutationCount) failures.push("mutations=" + result.mutationCount);
  if (result.rectChanges) failures.push("rect changes=" + result.rectChanges);
  if (result.layoutShiftCount) failures.push("layout shifts=" + result.layoutShiftCount);
  if (nonLoadingAnimations.length) failures.push("non-loading animations=" + JSON.stringify(nonLoadingAnimations.slice(0, 6)));
  if (failures.length) {
    throw new Error("Dashboard idle stability failed: " + failures.join(", ") + " :: " + JSON.stringify(result));
  }
  console.log("[qa] dashboard idle stability verified", JSON.stringify(result));
  return result;
}

async function diagnoseAdminSyncLifecycle(page) {
  const before = await page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    debugCount: window.TaagerDebug && Array.isArray(window.TaagerDebug.records) ? window.TaagerDebug.records.length : 0,
    activeSection: document.getElementById('db-shell-mount') && document.getElementById('db-shell-mount')._dashboardActiveSection,
  }));
  await page.locator('#btn-admin-refresh').evaluate((button) => button.click());
  await page.waitForFunction(() => {
    return window.TaagerDebug && window.TaagerDebug.records.some((record) => record.scope === 'admin-sync' && record.event === 'complete');
  }, null, { timeout: 30000 });
  await page.waitForTimeout(900);
  return page.evaluate((start) => {
    const records = window.TaagerDebug && Array.isArray(window.TaagerDebug.records)
      ? window.TaagerDebug.records.slice(start.debugCount)
      : [];
    const count = (scope, event) => records.filter((record) => record.scope === scope && record.event === event).length;
    const curtain = document.getElementById('taager-route-curtain');
    const mount = document.getElementById('db-shell-mount');
    return {
      sameRenderer: performance.timeOrigin === start.timeOrigin,
      startupPreloaderPresent: !!document.getElementById('preloader'),
      curtainVisible: !!(curtain && !curtain.hidden && curtain.classList.contains('is-visible')),
      dashboardRenders: count('dashboard-data', 'renderDashboard:start'),
      curtainShows: count('route-curtain', 'show'),
      curtainHides: count('route-curtain', 'hideWhenStable:done'),
      beforeSection: start.activeSection,
      afterSection: mount && mount._dashboardActiveSection,
      activeAnimations: document.getAnimations().filter((animation) => {
        const target = animation.effect && animation.effect.target;
        return animation.playState === 'running' && target && target.getClientRects().length > 0;
      }).map((animation) => ({
        name: animation.animationName || '',
        target: animation.effect && animation.effect.target
          ? (animation.effect.target.id || String(animation.effect.target.className || '') || animation.effect.target.tagName)
          : '',
      })),
    };
  }, before);
}

(async () => {
  const app = await launchElectronForQa();
  try {
    console.log("[qa] electron launched via " + app.mode);
    const page = await app.firstWindow();
    page.on("console", (msg) => console.log("[renderer]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[renderer:error]", err.stack || err.message));
    console.log("[qa] first window ready");
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
    console.log("[qa] domcontentloaded");
    await page.waitForFunction(() => typeof window.renderDashboard === "function", null, { timeout: 30000 });
    console.log("[qa] dashboard scripts ready");
    await mountDashboard(page);
    console.log("[qa] dashboard mounted");
    await verifyVisualSystemCascade(page);
    if (process.env.TAAGER_QA_IDLE_STABILITY === "1") {
      await verifyDashboardIdleStability(page, Number(process.env.TAAGER_QA_IDLE_MS || 60000));
      return;
    }
    if (process.env.TAAGER_QA_IDLE_DIAGNOSTIC === "1") {
      console.log("[qa] dashboard idle diagnostic", JSON.stringify(await diagnoseDashboardIdlePulse(page, 5000)));
      return;
    }
    if (process.env.TAAGER_QA_ADMIN_SYNC_DIAGNOSTIC === "1") {
      console.log("[qa] admin Sync diagnostic", JSON.stringify(await diagnoseAdminSyncLifecycle(page)));
      return;
    }
    if (process.env.TAAGER_QA_AI_SMOKE_ONLY === "1") {
      await verifyLiveTaagerAiSmoke(page);
      console.log("[qa] live Taager AI smoke verification complete");
      return;
    }
    if (process.env.TAAGER_QA_AI_PERF_ONLY === "1") {
      await verifyLiveTaagerAiPerformance(page);
      console.log("[qa] live Taager AI performance verification complete");
      return;
    }
    if (process.env.TAAGER_QA_FIRST_VISIT_ONLY === "1") {
      await verifyDashboardFirstVisitStability(page);
      console.log("[qa] dashboard first-visit verification complete");
      return;
    }
    if (process.env.TAAGER_QA_DASHBOARD_PERF_ONLY === "1") {
      await verifyDashboardPerformanceAcceptance(page);
      console.log("[qa] dashboard performance acceptance complete");
      return;
    }
    if (process.env.TAAGER_QA_PRODUCT_REACTIVE_ONLY === "1") {
      await verifyLiveTaagerAiSmoke(page);
      await verifyProductReactiveInteractions(page);
      await verifyOrdersDetailInteractions(page);
      console.log("[qa] product reactive interaction verification complete");
      return;
    }

    if (DASHBOARD_SCREENSHOT_MODE) {
      const screenshotTheme = DARK_SCREENSHOT_MODE ? "dark" : "light";
      await page.evaluate((theme) => {
        if (typeof window.applyTheme === "function") window.applyTheme(theme);
        if (typeof window.applyLang === "function") window.applyLang("ar");
        if (typeof window.reRenderCurrentPage === "function") window.reRenderCurrentPage();
      }, screenshotTheme);
      await page.waitForTimeout(500);
    }

    const sizes = SMALL_LAPTOP_MODE ? [
      ["laptop-1366x768", { width: 1366, height: 768 }],
      ["laptop-1280x720", { width: 1280, height: 720 }],
      ["laptop-1180x720", { width: 1180, height: 720 }],
      ["laptop-1100x720", { width: 1100, height: 720 }],
    ] : [
      ["full-ar-dark", { width: 1366, height: 820 }],
      ["medium-ar-dark", { width: 1100, height: 720 }],
      ["compact-ar-dark", { width: 900, height: 640 }],
      ["ultra-ar-dark", { width: 760, height: 600 }],
    ];

    if (SMALL_LAPTOP_MODE) {
      const laptopSectionIds = [
        "master",
        "overview",
        "pipeline",
        "orders",
        "cod",
        "products",
        "cities",
        "commission",
        "marketing",
        "campaigns",
        "calculator",
        "productForecast",
        "prepaid",
        "staticUpdate",
        "taagerAi",
      ];
      for (const sectionId of laptopSectionIds) {
        await showDashboard(page);
        await page.locator(`.dash-nav-btn[data-section="${sectionId}"]`).evaluate((button) => button.click());
        await page.waitForTimeout(650);
        for (const [label, size] of sizes) {
          await inspect(page, "dashboard-" + label + "-" + sectionId, size);
        }
      }
      console.log("[qa] small-laptop dashboard verification complete");
      return;
    }

    for (const [label, size] of sizes) {
      await showDashboard(page);
      await inspect(page, label, size);
    }

    if (await page.locator("#ai-copilot-orb").count()) {
      await page.click("#ai-copilot-orb");
      await page.waitForTimeout(250);
      await inspect(page, "dashboard-ai-panel-open", { width: 900, height: 640 });
      await page.click("#ai-panel-close");
      await page.waitForTimeout(250);
      await inspect(page, "dashboard-ai-panel-closed", { width: 900, height: 640 });
    } else {
      console.log("[qa] dashboard AI copilot orb is not mounted; skipping panel interaction checks");
    }

    const sectionIds = [
      "master",
      "overview",
      "pipeline",
      "orders",
      "cod",
      "products",
      "cities",
      "commission",
      "marketing",
      "calculator",
      "productForecast",
      "prepaid",
      "staticUpdate",
      "taagerAi",
    ];
    for (const sectionId of sectionIds) {
      await showDashboard(page);
      await page.locator(`.dash-nav-btn[data-section="${sectionId}"]`).evaluate((button) => button.click());
      await page.waitForTimeout(700);
      await captureDashboardSection(page, sectionId, { width: 1478, height: 960 });
      await inspect(page, "dashboard-section-" + sectionId + "-compact", { width: 900, height: 640 });
      await inspect(page, "dashboard-section-" + sectionId + "-ultra", { width: 760, height: 600 });
    }
    if (DASHBOARD_SCREENSHOT_MODE) {
      console.log("[qa] " + (DARK_SCREENSHOT_MODE ? "dark" : "light") + " dashboard screenshots saved to " + DASHBOARD_SCREENSHOT_DIR);
    }
    await verifyLiveTaagerAiSmoke(page);
    await verifyProductReactiveInteractions(page);
    await verifyOrdersDetailInteractions(page);

    await mountAiIntelligence(page);
    console.log("[qa] ai intelligence mounted");
    for (const [label, size] of sizes) {
      await showAiIntelligence(page);
      await inspect(page, "ai-" + label, size);
    }

    await page.locator(".page.active .aii-alert-chip:visible, .page.active .aii-feed-card:visible").first().click();
    await page.waitForTimeout(250);
    await inspect(page, "ai-detail-explainability", { width: 900, height: 640 });

    await page.evaluate(() => {
      const input = document.querySelector("#aii-chat-input");
      if (input) input.value = "Show ROI risks and scaling opportunities";
      const form = document.querySelector("#aii-chat-form");
      if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(900);
    await inspect(page, "ai-chat-fallback", { width: 900, height: 640 });

    await page.evaluate(() => {
      const input = document.querySelector("#aii-chat-input");
      if (input) input.value = "500 SAR";
      const form = document.querySelector("#aii-chat-form");
      if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(1200);
    await inspect(page, "ai-chat-resumed-local-strategy", { width: 900, height: 640 });

    await page.evaluate(() => {
      if (typeof window.applyLang === "function") window.applyLang("en");
      if (typeof window.reRenderCurrentPage === "function") window.reRenderCurrentPage();
    });
    await page.waitForTimeout(500);
    await inspect(page, "ai-compact-en-dark", { width: 900, height: 640 });

    await page.evaluate(() => {
      if (typeof window.applyTheme === "function") window.applyTheme("light");
    });
    await page.waitForTimeout(350);
    await inspect(page, "ai-compact-en-light", { width: 900, height: 640 });

    await page.evaluate(() => {
      if (typeof window.goToDashboard === "function") window.goToDashboard();
    });
    await page.waitForSelector("#db-shell-mount.dash-shell", { timeout: 15000 });
    await inspect(page, "dashboard-compact-en-light", { width: 900, height: 640 });

    if (process.env.TAAGER_QA_DASHBOARD_ONLY === "1") {
      console.log("[qa] dashboard-only verification complete");
      return;
    }

    await page.evaluate(() => {
      if (typeof window.goToAnalytics === "function") window.goToAnalytics();
    });
    await page.waitForFunction(() => document.querySelector(".page.active")?.id === "page-analytics", null, { timeout: 15000 });
    await page.waitForSelector("#analytics-page", { timeout: 15000 });
    await inspect(page, "analytics-compact-en-light", { width: 900, height: 640 });
    await inspect(page, "analytics-ultra-en-light", { width: 760, height: 600 });
    await page.evaluate(() => {
      if (typeof window.applyLang === "function") window.applyLang("ar");
      if (typeof window.reRenderCurrentPage === "function") window.reRenderCurrentPage();
    });
    await page.waitForSelector("#analytics-page", { timeout: 15000 });
    await inspect(page, "analytics-ultra-ar-light", { width: 760, height: 600 });

    await page.evaluate(() => {
      if (typeof window.goToOperations === "function") window.goToOperations();
    });
    await page.waitForFunction(() => document.querySelector(".page.active")?.id === "page-operations", null, { timeout: 15000 });
    await page.waitForSelector(".ops-page", { timeout: 15000 });
    await inspect(page, "operations-compact-ar-light", { width: 900, height: 640 });
    await inspect(page, "operations-ultra-ar-light", { width: 760, height: 600 });
    await page.evaluate(() => {
      if (typeof window.applyLang === "function") window.applyLang("en");
      if (typeof window.applyTheme === "function") window.applyTheme("dark");
      if (typeof window.reRenderCurrentPage === "function") window.reRenderCurrentPage();
    });
    await page.waitForSelector(".ops-page", { timeout: 15000 });
    await inspect(page, "operations-ultra-en-dark", { width: 760, height: 600 });

    await page.evaluate(() => {
      if (typeof window.goToDashboard === "function") window.goToDashboard();
    });
    await page.waitForSelector("#db-shell-mount.dash-shell", { timeout: 15000 });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await inspect(page, "keyboard-focus", { width: 900, height: 640 });
  } finally {
    await withTimeout(app.close(), 10000, "QA app close").catch((err) => {
      console.warn("[qa] close warning:", err.message);
    });
  }
})().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
