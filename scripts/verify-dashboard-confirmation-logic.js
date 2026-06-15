"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { parseFullMonthSnapshot } = require("../src/bot/parser");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

const ROOT = path.resolve(__dirname, "..");
const WORKBOOK = path.join(ROOT, "new may orders-.xlsx");
const PERIOD = { preset: "custom", dateFrom: "2026-05-01", dateTo: "2026-05-31" };
const CONFIRMATION_EXCLUDED = new Set([
  "received",
  "customer_refused_confirmation",
  "on_hold",
  "out_of_stock",
  "canceled_by_you",
]);

function orderKey(row, index) {
  return String(row.taagerOrderNumber || row.orderNumber || row.orderId || row.id || index);
}

function uniqueOrders(rows) {
  const orders = new Map();
  rows.forEach((row, index) => {
    const key = orderKey(row, index);
    if (!orders.has(key)) orders.set(key, row);
  });
  return Array.from(orders.values());
}

function createStorage() {
  const values = Object.create(null);
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
  };
}

async function runAggregator(rows) {
  const storage = createStorage();
  storage.setItem("taager_active_account_id", "__all__");
  const window = {
    _kbotLang: "en",
    _kbotTheme: "dark",
    dashboardAccountsList: [],
    currentActiveAccountLabel: "All accounts",
    api: {
      getDashboardSnapshot: async () => ({
        ok: true,
        data: { may: { snapshot: rows, snapshotMonth: "2026-05" } },
      }),
      getCredentials: async () => ({
        accounts: [{ id: "may", easyEmail: "may@example.com", taagerEmail: "may@example.com", label: "May" }],
      }),
    },
  };
  window.window = window;
  window.addEventListener = () => {};
  window.removeEventListener = () => {};
  window.localStorage = storage;
  window.dashboardI18n = {
    t: (key) => key,
    raw: (value) => String(value || ""),
    number: (value) => String(value || 0),
    formatTimestamp: () => "",
    formatMonth: () => "May 2026",
    monthName: () => "May",
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
  window.invalidateDashboardCache();
  return new Promise((resolve, reject) => {
    window.runDashboardAggregator((result) => result ? resolve(result) : reject(new Error("No dashboard result")));
  });
}

function expectedStatusRates(confirmed, canceled, pending, total) {
  if (!total) return { confirmationPct: 0, cancelPct: 0, pendingPct: 0 };
  const confirmationPct = Number((confirmed / total * 100).toFixed(1));
  const cancelPct = Number((canceled / total * 100).toFixed(1));
  return {
    confirmationPct,
    cancelPct,
    pendingPct: Number((100 - confirmationPct - cancelPct).toFixed(1)),
  };
}

function verifyStatusSplitRows(rows, label) {
  rows.forEach((row) => {
    const total = Number(row.statusTotalCount !== undefined ? row.statusTotalCount : (row.totalOrderCount || row.count || row.placedCount || 0));
    const confirmed = Number(
      row.confirmationStatusCount != null
        ? row.confirmationStatusCount
        : (row.confirmedCount != null ? row.confirmedCount : row.confirmed || 0)
    );
    const canceled = Number(row.cancelStatusCount != null ? row.cancelStatusCount : row.canceledCount || 0);
    const pending = Number(row.pendingStatusCount != null ? row.pendingStatusCount : row.pendingCount || 0);
    assert.equal(confirmed + canceled + pending, total, label + " status groups cover every order");
    const expected = expectedStatusRates(confirmed, canceled, pending, total);
    assert.equal(Number(Number(row.confirmationPct || 0).toFixed(1)), expected.confirmationPct, label + " confirmation share");
    assert.equal(Number(Number(row.cancelPct || 0).toFixed(1)), expected.cancelPct, label + " cancel share");
    assert.equal(Number(Number(row.pendingPct || 0).toFixed(1)), expected.pendingPct, label + " pending share");
    assert.equal(
      Number((Number(row.confirmationPct || 0) + Number(row.cancelPct || 0) + Number(row.pendingPct || 0)).toFixed(1)),
      total > 0 ? 100 : 0,
      label + " status shares total 100%"
    );
  });
}

function verifyConfirmationRateRows(rows, label) {
  rows.forEach((row) => {
    const net = Number(row.netOrderCount != null ? row.netOrderCount : row.count || row.placedCount || 0);
    const confirmed = Number(row.confirmedCount != null ? row.confirmedCount : row.confirmed || 0);
    const expected = net > 0 ? Number((confirmed / net * 100).toFixed(1)) : 0;
    assert.equal(Number(Number(row.confirmationPct || 0).toFixed(1)), expected, label + " uses confirmed / net orders");
  });
}

(async function main() {
  assert.ok(fs.existsSync(WORKBOOK), "May workbook exists");
  const rows = parseFullMonthSnapshot(fs.readFileSync(WORKBOOK), PERIOD);
  const orders = uniqueOrders(rows);
  const netOrders = orders.filter((row) => row.orderStatusBucket !== "canceled_by_you");
  const confirmedOrders = orders.filter((row) => !CONFIRMATION_EXCLUDED.has(row.orderStatusBucket));
  const receivedOrders = orders.filter((row) => row.orderStatusBucket === "received");

  assert.equal(orders.length, 1306, "May raw orders");
  assert.equal(netOrders.length, 1163, "May net orders");
  assert.equal(confirmedOrders.length, 677, "May confirmed/progressed orders");
  assert.ok(receivedOrders.length > 0, "May workbook contains received orders");

  const result = await runAggregator(rows);
  assert.equal(result.overview.totalOrders.value, 1163, "Overview net orders");
  assert.equal(result.pipeline.metrics.confirmedCount, 677, "Pipeline confirmed/progressed orders");
  assert.equal(result.overview.confirmationRate.value, 58.2, "Overview confirmation rate");
  assert.equal(result.pipeline.metrics.confirmationRate, 58.2, "Pipeline confirmation rate");
  const receivedStage = result.pipeline.legacyStages.find((stage) => stage.id === "received");
  assert.equal(receivedStage.count, receivedOrders.length, "Order received populates the pending/received pipeline stage");

  assert.ok(result.products.rankedList.some((product) => product.pendingCount > 0), "Product pending counters include received orders");
  verifyStatusSplitRows(result.products.rankedList, "Product");
  result.products.rankedList.forEach((product) => {
    verifyStatusSplitRows(product.cityBreakdown || [], "Product city");
    verifyStatusSplitRows(product.piecesBreakdown || [], "Product quantity");
    (product.quantityCityBreakdown || []).forEach((quantity) => verifyStatusSplitRows(quantity.cities || [], "Quantity city"));
  });
  verifyConfirmationRateRows(result.cod.cities || [], "City");

  const queryRows = rows.map((row) => Object.assign({}, row, { accountId: "may" }));
  const service = createDashboardQueryService({
    getAccounts: () => ({ may: { snapshot: queryRows } }),
    getAllowedAccountIds: () => ["may"],
    getRevision: () => 1,
  });
  const products = service.query({ kind: "products", accountIds: ["may"], allRows: true, dateFrom: PERIOD.dateFrom, dateTo: PERIOD.dateTo });
  assert.ok(products.rows.some((product) => product.pendingCount > 0), "Query product pending counters include received orders");
  verifyStatusSplitRows(products.rows, "Query product");
  const details = service.query({
    kind: "product-details",
    accountIds: ["may"],
    productKeys: products.rows.map((product) => product.key),
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
  });
  Object.values(details.details).forEach((detail) => {
    verifyStatusSplitRows(detail.cityBreakdown || [], "Query product city");
    (detail.quantityCityBreakdown || []).forEach((quantity) => verifyStatusSplitRows(quantity.cities || [], "Query quantity city"));
  });

  console.log(`[PASS] May status logic: ${receivedOrders.length} received orders populate pending, and all product status shares total 100%`);
}()).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
