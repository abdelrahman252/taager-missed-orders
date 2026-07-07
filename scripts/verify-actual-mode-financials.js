"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log("[PASS] " + label);
  } else {
    failed += 1;
    console.error("[FAIL] " + label);
  }
}

const financialCore = require(path.join(root, "src/renderer/pages/dashboard/dashboard-financial-core.js"));
const calculator = read("src/renderer/pages/dashboard/sections/section7-calculator-hydrated.js");
const campaigns = read("src/renderer/pages/dashboard/sections/section-campaigns-hydrated.js");

const actual = financialCore.calculate({
  mode: "actual",
  netOrders: 772,
  actualDeliveredOrders: 137,
  actualEarnedProfitAfterTax: 2292.01,
  actualDeliveredSales: 5769.2,
  currentTotalSales: 32550,
  expectedNdrRate: 136.62 / 772,
  adSpend: 3064.62,
});

const expected = financialCore.calculate({
  mode: "expected",
  netOrders: 772,
  actualDeliveredOrders: 137,
  actualEarnedProfitAfterTax: 2292.01,
  actualDeliveredSales: 5769.2,
  currentTotalSales: 32550,
  expectedNdrRate: 136.62 / 772,
  adSpend: 3064.62,
});

const fallback = financialCore.calculate({
  mode: "expected",
  netOrders: 20,
  actualDeliveredOrders: 0,
  actualEarnedProfitAfterTax: 0,
  netOrderProfitAfterTax: 600,
  expectedNdrRate: 0.35,
  adSpend: 100,
});

const deliveredWins = financialCore.calculate({
  mode: "expected",
  netOrders: 20,
  actualDeliveredOrders: 2,
  actualEarnedProfitAfterTax: 80,
  netOrderProfitAfterTax: 600,
  expectedNdrRate: 0.35,
  adSpend: 100,
});

const unavailable = financialCore.calculate({
  netOrders: 20,
  actualDeliveredOrders: 0,
  expectedNdrRate: 0.35,
});

check("financial core actual delivered uses sheet delivered count",
  actual.displayedDeliveredOrders === 137);
check("financial core actual profit before ads uses actual earned profit",
  actual.displayedTotalProfitBeforeAdSpend === 2292.01);
check("financial core actual net profit uses actual earned profit minus spend",
  Math.abs(actual.displayedNetProfit - (2292.01 - 3064.62)) < 0.0001);
check("financial core expected mode still uses exact expected deliveries",
  Math.abs(expected.displayedTotalProfitBeforeAdSpend - expected.expectedTotalProfitBeforeAdSpend) < 0.0001 &&
  expected.displayedDeliveredOrders === Math.round(expected.expectedDeliveriesExact));
check("average profit falls back to net orders only when delivered orders are zero",
  fallback.averageProfit === 30 && fallback.averageProfitSource === "net_orders_fallback");
check("delivered-order average remains authoritative when deliveries exist",
  deliveredWins.averageProfit === 40 && deliveredWins.averageProfitSource === "delivered_orders");
check("fallback drives projections without changing actual earned profit",
  fallback.expectedTotalProfitBeforeAdSpend === 210 && fallback.actualEarnedProfitAfterTax === 0);
check("missing net-order profit data is not mislabeled as an estimate",
  unavailable.averageProfit === 0 && unavailable.averageProfitSource === "unavailable");

check("account calculator prefers actual earned profit in actual mode",
  calculator.includes("d.actualEarnedProfitAfterTax != null") &&
  calculator.includes("var revSAR = isExpectedRateMode ? (realAvgCommission * realExpectedDvlExact) : realTaagerProfitAfterTax"));
check("account calculator actual delivered exact count is not replaced by expected deliveries",
  calculator.includes("var realExpectedDvlExact = isExpectedRateMode") &&
  calculator.includes(": realExpectedDvl;"));
check("account calculator actual tooltip names sheet delivered status",
  calculator.includes("counted from delivered sheet status") &&
  calculator.includes("totalProfitBeforeAdSpend = actualEarnedProfitAfterTax"));

check("campaign top KPIs do not expose SKU-matched profit/ROI/ROAS cards",
  !campaigns.includes('card("SKU-matched net profit"') &&
  !campaigns.includes('card("SKU-matched ROI"') &&
  !campaigns.includes('card("SKU-matched profit ROAS"'));
check("campaign top KPIs avoid product-order and product-CPA totals",
  !campaigns.includes('card("Matched product orders"') &&
  !campaigns.includes('card("Matched product CPA"') &&
  !campaigns.includes('card("SKU-matched net orders"'));
check("product actions label product-level order count",
  campaigns.includes('sortableTh("Product orders", "taagerOrders"') &&
  campaigns.includes("Product orders can differ from whole-account unique orders"));

console.log(`\nActual-mode financial verification: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
