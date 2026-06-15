"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const financialCore = require("../src/renderer/pages/dashboard/dashboard-financial-core");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

const ROOT = path.resolve(__dirname, "..");

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message}: expected ${expected}, got ${actual}`);
}

const canonical = financialCore.calculate({
  mode: "expected",
  netOrders: 3,
  actualDeliveredOrders: 2,
  actualEarnedProfitAfterTax: 80,
  actualDeliveredSales: 300,
  currentTotalSales: 600,
  expectedNdrRate: 0.5,
  adSpend: 30,
});

close(canonical.averageProfit, 40, "Average profit");
close(canonical.expectedDeliveriesExact, 1.5, "Exact expected deliveries");
assert.equal(canonical.expectedDeliveriesDisplay, 2, "Expected deliveries are rounded only for display");
close(canonical.expectedTotalProfitBeforeAdSpend, 60, "Expected total profit uses exact deliveries");
close(canonical.expectedNetProfit, 30, "Expected net profit");
close(canonical.cpa, 10, "CPA");
close(canonical.expectedDeliveredCpa, 20, "Expected delivered CPA");
close(canonical.breakEvenCpa, 20, "Break-even CPA");
close(canonical.expectedRoi, 100, "Expected ROI");
close(canonical.expectedProfitRoas, 2, "Expected profit ROAS");
close(canonical.aov, 200, "AOV");
close(canonical.expectedDeliveredSales, 300, "Expected delivered sales");
close(canonical.expectedSalesRoas, 10, "Expected sales ROAS");

const noDelivered = financialCore.calculate({
  mode: "expected",
  netOrders: 5,
  actualDeliveredOrders: 0,
  actualEarnedProfitAfterTax: 0,
  currentTotalSales: 500,
  expectedNdrRate: 0.4,
  adSpend: 75,
});
assert.equal(noDelivered.averageProfit, 0);
assert.equal(noDelivered.breakEvenCpa, 0);
assert.equal(noDelivered.expectedTotalProfitBeforeAdSpend, 0);
assert.equal(noDelivered.expectedNetProfit, -75);

assert.deepEqual(
  financialCore.resolveExpectedRate(0, 0, 0, 0),
  { rate: 0, source: "insufficient_history", insufficientHistory: true }
);
assert.equal(financialCore.resolveExpectedRate(0, 0, 3, 6).rate, 0.5);
assert.equal(financialCore.resolveExpectedRate(2, 4, 3, 6).source, "specific");

const rows = [
  {
    taagerOrderNumber: "D-1",
    createdAt: "2026-06-05",
    orderStatusBucket: "delivered",
    orderStatus: "delivered",
    products: "Robust Product",
    sku: "ROBUST-1",
    dashboardTotalPrice: 100,
    profitAfterTax: 20,
  },
  {
    taagerOrderNumber: "P-1",
    createdAt: "2026-06-06",
    orderStatusBucket: "confirmed",
    orderStatus: "confirmed",
    products: "Robust Product",
    sku: "ROBUST-1",
    dashboardTotalPrice: 300,
    profitAfterTax: 100,
  },
];

const service = createDashboardQueryService({
  getAccounts: () => ({ account: { snapshot: rows } }),
  getAllowedAccountIds: () => ["account"],
  getRevision: () => 1,
});
const result = service.query({
  kind: "products",
  accountIds: ["account"],
  dateFrom: "2026-06-01",
  dateTo: "2026-06-30",
  deliveredDateMode: "expected",
  ndrDateFrom: "2026-06-01",
  ndrDateTo: "2026-06-30",
  page: 1,
  pageSize: 10,
});
const product = result.rows[0];
close(product.expectedDeliveriesExact, 1, "Backend exact expected deliveries");
close(product.averageProfit, 20, "Backend actual average profit");
close(product.expectedTotalProfitBeforeAdSpend, 20, "Pending potential profit cannot inflate expected profit");
close(product.commission, 20, "Compatibility commission alias");

const aggregator = fs.readFileSync(path.join(ROOT, "src/renderer/pages/dashboard/dashboard-aggregator.js"), "utf8");
const query = fs.readFileSync(path.join(ROOT, "src/main/dashboard-query-service.js"), "utf8");
const productsSection = fs.readFileSync(path.join(ROOT, "src/renderer/pages/dashboard/sections/section5-products.js"), "utf8");
const calculatorSection = fs.readFileSync(path.join(ROOT, "src/renderer/pages/dashboard/sections/section7-calculator.js"), "utf8");
const forecastSection = fs.readFileSync(path.join(ROOT, "src/renderer/pages/dashboard/sections/section9-product-forecast.js"), "utf8");
const aiContext = fs.readFileSync(path.join(ROOT, "src/renderer/pages/dashboard/dashboard-ai-context.js"), "utf8");
assert.ok(!aggregator.includes("earnedCommission = totalPlacedCommission * globalExpectedNdrRate"));
assert.ok(!aggregator.includes("p.commission = p.totalPlacedCommission * prodExpectedNdrRate"));
assert.ok(query.includes('require("../renderer/pages/dashboard/dashboard-financial-core")'));
assert.ok(productsSection.includes("product.expectedDeliveredCpa != null"), "Product comparison should prefer exact expected delivered CPA");
assert.ok(productsSection.includes("expected.allocatedAdSpend / exactDeliveries"), "Product comparison fallback should divide spend by exact expected deliveries");
assert.ok(productsSection.includes("expectedDeliveriesExact: Number(row.expectedDeliveriesExact"), "Backend product rows should preserve exact expected deliveries");
assert.ok(productsSection.includes("expectedDeliveredCpa: row.expectedDeliveredCpa"), "Backend product rows should preserve exact expected delivered CPA");
assert.ok(productsSection.includes("currentTotalSales: totalSalesValue(product)"), "Product expected fallback should project sales from total placed sales");
assert.ok(calculatorSection.includes("commRequired = expectedDeliveriesExact > 0"), "Calculator required profit should use exact expected deliveries");
assert.ok(forecastSection.includes("realTaagerProfitAfterTax = expectedDeliveriesExact * realComm"), "Forecast baseline profit should use exact expected deliveries");
assert.ok(forecastSection.includes("commRequired    = expectedDeliveriesExact > 0"), "Forecast required profit should use exact expected deliveries");
assert.ok(aiContext.includes("actualDelivered: actualDelivered"), "AI context should expose actual delivered separately from displayed deliveries");

console.log("[PASS] Expected NDR financial core, exact-decimal math, zero cases, fallback rates, and pending-profit regression.");
