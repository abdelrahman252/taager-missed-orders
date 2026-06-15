"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

const ROOT = path.resolve(__dirname, "..");
const AGGREGATOR = path.join(ROOT, "src", "renderer", "pages", "dashboard", "dashboard-aggregator.js");
const PERIOD = { preset: "custom", dateFrom: "2026-06-01", dateTo: "2026-06-30" };

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

async function runAggregator(rows) {
  const storage = {
    getItem: (key) => key === "taager_active_account_id" ? "__all__" : null,
    setItem: () => {},
  };
  const window = {
    _kbotLang: "en",
    DashboardPeriodState: { get: () => PERIOD },
    DashboardDeliveredDateState: { get: () => "createdAt" },
    api: {
      getDashboardSnapshot: async () => ({
        ok: true,
        data: {
          account: {
            snapshot: rows,
            snapshotMonth: "2026-06",
            manualFetchTimestamp: "2026-06-11T00:00:00Z",
          },
        },
      }),
      getCredentials: async () => ({
        accounts: [{ id: "account", taagerEmail: "average-profit@example.com" }],
      }),
    },
  };
  const context = vm.createContext({
    window,
    localStorage: storage,
    console,
    Promise,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    parseFloat,
    parseInt,
    isNaN,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(fs.readFileSync(AGGREGATOR, "utf8"), context, { filename: AGGREGATOR });
  return new Promise((resolve, reject) => {
    window.runDashboardAggregator((result) => {
      if (!result) reject(new Error("Aggregator returned no result"));
      else resolve(result);
    });
  });
}

function row(order, status, fields) {
  return Object.assign({
    taagerOrderNumber: order,
    createdAt: "2026-06-05",
    lastUpdatedAt: "2026-06-06",
    orderStatusBucket: status,
    orderStatus: status,
    products: "Average Profit Product",
    sku: "AVG-1",
    city: "Cairo",
    qty: 1,
    dashboardTotalPrice: 100,
  }, fields || {});
}

(async function verifyAverageProfitContract() {
  const deliveredRows = [
    row("D-1", "delivered", { profit: 100, taxProfit: 20 }),
    row("D-2", "delivered", { profitAfterTax: 40 }),
    row("C-1", "confirmed", { profit: 500, taxProfit: 0 }),
  ];
  const dashboard = await runAggregator(deliveredRows);
  assert.equal(dashboard.pipeline.metrics.businessDeliveredCount, 2);
  assert.equal(dashboard.overview.earnedCommission.value, 120);
  assert.equal(dashboard.roi.averageProfit, 60);
  assert.equal(dashboard.roi.avgCommission, 60);

  const noDeliveryDashboard = await runAggregator([
    row("C-2", "confirmed", { profit: 500, taxProfit: 0 }),
  ]);
  assert.equal(noDeliveryDashboard.pipeline.metrics.businessDeliveredCount, 0);
  assert.equal(noDeliveryDashboard.overview.earnedCommission.value, 0);
  assert.equal(noDeliveryDashboard.roi.averageProfit, 0);

  const service = createDashboardQueryService({
    getAccounts: () => ({ account: { snapshot: deliveredRows } }),
    getAllowedAccountIds: () => ["account"],
    getRevision: () => 1,
  });
  const products = service.query({
    kind: "products",
    accountIds: ["account"],
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
    page: 1,
    pageSize: 10,
  });
  assert.equal(products.rows.length, 1);
  assert.equal(products.rows[0].deliveredCount, 2);
  assert.equal(products.rows[0].commission, 120);
  assert.equal(products.rows[0].averageProfit, 60);

  const expectedProducts = service.query({
    kind: "products",
    accountIds: ["account"],
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
    deliveredDateMode: "expected",
    ndrDateFrom: PERIOD.dateFrom,
    ndrDateTo: PERIOD.dateTo,
    page: 1,
    pageSize: 10,
  });
  assert.equal(expectedProducts.rows[0].actualDeliveredCount, 2);
  assert.equal(expectedProducts.rows[0].actualCommission, 120);
  assert.equal(expectedProducts.rows[0].averageProfit, 60, "Expected mode preserves actual delivered-order average profit");

  const noDeliveryService = createDashboardQueryService({
    getAccounts: () => ({
      account: { snapshot: [row("C-3", "confirmed", { profit: 500, taxProfit: 0 })] },
    }),
    getAllowedAccountIds: () => ["account"],
    getRevision: () => 1,
  });
  const noDeliveryProducts = noDeliveryService.query({
    kind: "products",
    accountIds: ["account"],
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
    page: 1,
    pageSize: 10,
  });
  assert.equal(noDeliveryProducts.rows[0].deliveredCount, 0);
  assert.equal(noDeliveryProducts.rows[0].commission, 0);
  assert.equal(noDeliveryProducts.rows[0].averageProfit, 0);

  const aggregatorSource = source("src/renderer/pages/dashboard/dashboard-aggregator.js");
  const forecastSource = source("src/renderer/pages/dashboard/sections/section9-product-forecast.js");
  const masterSource = source("src/renderer/pages/dashboard/sections/section8-master.js");
  const commissionSource = source("src/renderer/pages/dashboard/sections/section6-commission.js");
  const aiSource = source("src/renderer/pages/ai-intelligence/ai-intelligence-data.js");

  assert.ok(aggregatorSource.includes("averageProfit: avgCommission, avgCommission: avgCommission"));
  assert.ok(aggregatorSource.includes("averageProfit: avgCommission,"));
  assert.ok(!aggregatorSource.includes("totalPlacedCommission / placedCount"));
  assert.ok(!forecastSource.includes("totalPlacedComm / placed"));
  assert.ok(!forecastSource.includes(": 35;"));
  assert.ok(!masterSource.includes("d.roi.avgCommission  : 40"));
  assert.ok(!commissionSource.includes("breakEven > 0 ? breakEven : 50"));
  assert.ok(aiSource.includes("deliveredProfitTotal / deliveredOrderTotal"));

  console.log("[PASS] Average profit uses delivered profit after tax / delivered orders in every audited path.");
}()).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
