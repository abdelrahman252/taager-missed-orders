"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

const ROOT = path.resolve(__dirname, "..");
const PERIOD = { dateFrom: "2026-06-01", dateTo: "2026-06-30" };

function order(number, status, overrides = {}) {
  return {
    taagerOrderNumber: number,
    createdAt: "2026-06-05",
    orderStatusBucket: status,
    orderStatus: status,
    taagerCountry: "sa",
    sku: "SKU-NET",
    products: "Net Product",
    city: "Riyadh",
    qty: 1,
    dashboardTotalPrice: 100,
    profitAfterTax: 20,
    paymentMethod: "cod",
    ...overrides,
  };
}

const delivered = order("SHARED-ORDER", "delivered");
const canceled = Array.from({ length: 9 }, (_, index) =>
  order("CANCELED-" + (index + 1), "canceled_by_you", {
    dashboardTotalPrice: 900,
    profitAfterTax: 90,
  })
);
const accounts = {
  accountA: {
    country: "sa",
    snapshot: [delivered, { ...delivered }, ...canceled],
    marketing: {
      facebook: {
        summary: {
          campaignBreakdown: [
            { campaign: "Scale SKU-NET", spend: 50, currency: "SAR" },
          ],
        },
      },
    },
  },
  accountB: {
    country: "sa",
    snapshot: [
      order("SHARED-ORDER", "confirmed", {
        city: "Jeddah",
        dashboardTotalPrice: 200,
        profitAfterTax: 40,
      }),
    ],
  },
};

function createService(sourceAccounts) {
  return createDashboardQueryService({
    getAccounts: () => sourceAccounts,
    getAllowedAccountIds: () => Object.keys(sourceAccounts),
    getRevision: () => 1,
  });
}

function createStorage() {
  const values = Object.create(null);
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
  };
}

async function runRenderer(sourceAccounts, adSpend) {
  const storage = createStorage();
  storage.setItem("taager_active_account_id", "__all__");
  storage.setItem("taager_roi_settings___all__", JSON.stringify({
    adSpend,
    currency: "SAR",
    egpRate: 52,
  }));
  const accountCredentials = Object.keys(sourceAccounts).map((id) => ({
    id,
    easyEmail: id + "@example.com",
    label: id,
    country: "sa",
  }));
  const window = {
    _kbotLang: "en",
    _kbotTheme: "dark",
    addEventListener: () => {},
    removeEventListener: () => {},
    dashboardAccountsList: [],
    currentActiveAccountLabel: "All Accounts",
    api: {
      getDashboardSnapshot: async () => ({ ok: true, data: sourceAccounts }),
      getCredentials: async () => ({ accounts: accountCredentials }),
    },
  };
  window.window = window;
  window.localStorage = storage;
  window.dashboardI18n = {
    t: (key) => key,
    raw: (value) => String(value || ""),
    number: (value) => String(value || 0),
    formatTimestamp: () => "",
    formatMonth: () => "June 2026",
    monthName: () => "June",
    locale: () => "en-US",
    isRtl: () => false,
  };
  const context = vm.createContext({
    window,
    localStorage: storage,
    document: { documentElement: { getAttribute: () => "en" } },
    console,
    Promise,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    RegExp,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    setTimeout,
    clearTimeout,
  });
  [
    "src/renderer/pages/taager-product-names.js",
    "src/renderer/pages/taager-status.js",
    "src/renderer/pages/dashboard/dashboard-filter-bus.js",
    "src/renderer/pages/dashboard/dashboard-aggregator-score.js",
    "src/renderer/pages/dashboard/dashboard-aggregator-geo.js",
    "src/renderer/pages/dashboard/dashboard-insight-engine.js",
    "src/renderer/pages/dashboard/dashboard-aggregator.js",
  ].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  });
  window.DashboardPeriodState.setCustomRange(PERIOD.dateFrom, PERIOD.dateTo);
  window.DashboardDeliveredDateState.set("actual");
  window.invalidateDashboardCache();
  return new Promise((resolve, reject) => {
    window.runDashboardAggregator((result) => result ? resolve(result) : reject(new Error("No dashboard result")));
  });
}

function verifyBackend() {
  const service = createService(accounts);
  const result = service.query({
    kind: "products",
    accountIds: ["accountA", "accountB"],
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
    reportingCurrency: "SAR",
    productFinancialCurrency: "SAR",
    page: 1,
    pageSize: 10,
  });
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  const product = result.rows[0];
  assert.equal(product.totalOrderCount, 11, "Raw count includes canceled orders but removes duplicate rows");
  assert.equal(product.totalOrders, 11, "Legacy raw alias remains informational");
  assert.equal(product.netOrderCount, 2, "Same order number in two accounts counts twice");
  assert.equal(product.placedCount, 2, "Placed count is the net-order compatibility alias");
  assert.equal(product.deliveredCount, 1);
  assert.equal(product.ndrPct, 50);
  assert.equal(product.cpa, 25, "CPA uses spend / net orders");
  assert.equal(product.averageProfit, 20, "Average profit uses earned profit / delivered orders");
  assert.equal(product.breakEvenCpa, 10, "Break-even CPA uses average profit x NDR");
  assert.equal(product.netProfit, -30);
  assert.equal(product.profitLoss, -30);

  const cities = service.query({
    kind: "cities",
    accountIds: ["accountA", "accountB"],
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
  });
  const riyadh = cities.cities.find((city) => city.name === "Riyadh");
  assert.ok(riyadh, "City query returns Riyadh");
  assert.equal(riyadh.netOrderCount, 1, "City order count uses unique net orders");
  assert.equal(riyadh.totalRevenue, 100, "City revenue counts each unique net order once");
  assert.equal(riyadh.deliveredOrders, 1);
  assert.equal(riyadh.earnedProfitAfterTax, 20);
  assert.equal(riyadh.averageProfit, 20, "City average profit uses delivered profit / delivered orders");

  const campaign = service.query({
    kind: "campaign-overview",
    accountIds: ["accountA", "accountB"],
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
    reportingCurrency: "SAR",
    pageSize: 10,
  });
  assert.equal(campaign.ok, true);
  assert.equal(campaign.totals.taagerOrders, 1, "Campaign attribution uses the matched account's unique net order");
  assert.equal(campaign.productRows[0].netOrderCount || campaign.productRows[0].orders, 1);

  const allCanceled = createService({
    canceled: { snapshot: canceled },
  }).query({
    kind: "products",
    accountIds: ["canceled"],
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
    page: 1,
    pageSize: 10,
  });
  assert.equal(allCanceled.rows.length, 0, "Zero-net products cannot enter financial calculations");
}

function verifyStaticGuards() {
  const files = {
    aggregator: "src/renderer/pages/dashboard/dashboard-aggregator.js",
    query: "src/main/dashboard-query-service.js",
    campaign: "src/renderer/pages/dashboard/dashboard-campaign-query-core.js",
    ai: "src/renderer/pages/dashboard/dashboard-ai-context.js",
    calculator: "src/renderer/pages/dashboard/sections/section7-calculator.js",
    accountCalculator: "src/renderer/pages/dashboard/sections/section8-master.js",
    cities: "src/renderer/pages/dashboard/sections/section-cities.js",
    forecast: "src/renderer/pages/dashboard/sections/section9-product-forecast.js",
  };
  const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [
    key,
    fs.readFileSync(path.join(ROOT, file), "utf8"),
  ]));
  [
    [source.query, /product\.cpa\s*=\s*product\.placedCount/, "Backend CPA cannot use the legacy raw placed count"],
    [source.aggregator, /placedCount:\s*p\.totalOrderCount/, "Renderer products cannot expose raw orders as placed count"],
    [source.campaign, /row\.placedCount\s*\?\?\s*row\.orders/, "Campaign normalization must prefer net orders"],
    [source.ai, /\/\s*Number\(roi\.totalOrders/, "AI CPA cannot divide by the legacy total-orders alias"],
    [source.aggregator, /var totalForShare = rawTotalOrders;/, "Ordinary pipeline shares cannot use raw orders"],
  ].forEach(([text, forbidden, message]) => assert.equal(forbidden.test(text), false, message));
  assert.match(source.query, /product\.cpa\s*=\s*productFinancials\.cpa/);
  assert.match(source.query, /netOrders:\s*product\.netOrderCount/);
  assert.match(source.calculator, /DashboardOrderMetrics\.netOrders/);
  assert.match(source.accountCalculator, /DashboardOrderMetrics\.netOrders/);
  assert.match(source.cities, /DashboardOrderMetrics\.netOrders/);
  assert.match(source.forecast, /DashboardOrderMetrics\.netOrders/);
}

(async function main() {
  verifyBackend();
  verifyStaticGuards();

  const renderer = await runRenderer(accounts, 50);
  assert.equal(renderer.overview.totalOrders.totalOrderCount, 11);
  assert.equal(renderer.overview.totalOrders.netOrderCount, 2);
  assert.equal(renderer.overview.totalOrders.value, 2);
  assert.equal(renderer.pipeline.metrics.netOrderCount, 2);
  assert.equal(renderer.pipeline.metrics.totalOrderCount, 11);
  assert.equal(renderer.products.summary.netOrderCount, 2);
  assert.equal(renderer.products.summary.totalOrderCount, 11);
  assert.equal(renderer.roi.netOrderCount, 2);
  assert.equal(renderer.roi.totalOrderCount, 11);
  assert.equal(renderer.roi.deliveredCount, 1);
  assert.equal(renderer.roi.ndrPct, 50);
  assert.equal(renderer.roi.avgCPA, 25);
  assert.equal(renderer.roi.averageProfit, 20);
  assert.equal(renderer.overview.totalSales.value, 300, "Net sales exclude canceled orders and duplicate rows");
  assert.equal(renderer.overview.overallAov.value, 150);
  assert.equal(renderer.overview.totalDeliveredSales.value, 100);
  assert.equal(renderer.overview.deliveredAov.value, 100);
  assert.equal(renderer.roi.netRoas, 2);
  assert.equal(renderer.roi.averageProfit * (renderer.roi.ndrPct / 100), 10);
  assert.equal((renderer.roi.averageProfit * renderer.roi.deliveredCount) - renderer.roi.adSpend, -30);
  assert.equal((((renderer.roi.averageProfit * renderer.roi.deliveredCount) - renderer.roi.adSpend) / renderer.roi.adSpend) * 100, -60);

  const zeroRenderer = await runRenderer({
    canceled: { country: "sa", snapshot: canceled },
  }, 50);
  assert.equal(zeroRenderer.roi.netOrderCount, 0);
  assert.equal(zeroRenderer.roi.deliveredCount, 0);
  assert.equal(zeroRenderer.roi.avgCPA, 0);
  assert.equal(zeroRenderer.roi.averageProfit, 0);
  assert.equal(zeroRenderer.roi.netRoas, 0);
  [
    zeroRenderer.roi.ndrPct,
    zeroRenderer.roi.avgCPA,
    zeroRenderer.roi.averageProfit,
    zeroRenderer.roi.netRoas,
  ].forEach((value) => assert.equal(Number.isFinite(value), true, "Zero-volume metrics remain finite"));

  console.log("[PASS] Net-order contract: unique account orders, cancellations, duplicate rows, products, campaigns, CPA, NDR, break-even, sales, AOV, profit, ROI, ROAS, and zero-volume guards");
}()).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
