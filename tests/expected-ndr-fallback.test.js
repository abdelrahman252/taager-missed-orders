const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

function order(id, date, status) {
  return {
    id,
    taagerOrderNumber: id,
    createdAt: date,
    orderStatus: status,
    sku: "SKU-1",
    productName: "Test product",
    city: "Riyadh",
    totalPrice: 100,
    profitAfterTax: 10,
  };
}

const accounts = {
  a1: {
    country: "sa",
    snapshot: [
      order("july-1", "2026-07-01", "delivered"),
      order("july-2", "2026-07-02", "delivered"),
      order("july-3", "2026-07-03", "failed"),
      order("july-4", "2026-07-04", "failed"),
    ],
  },
};

const service = createDashboardQueryService({
  getAccounts: () => accounts,
  getAllowedAccountIds: () => ["a1"],
  getRevision: () => "test",
});

const products = service.query({
  kind: "products",
  accountIds: ["a1"],
  dateFrom: "2026-07-01",
  dateTo: "2026-07-15",
  deliveredDateMode: "expected",
  ndrDateFrom: "2026-06-04",
  ndrDateTo: "2026-06-10",
  reportingCurrency: "SAR",
  allRows: true,
});

assert.strictEqual(products.ok, true);
assert.strictEqual(products.rows.length, 1);
assert.strictEqual(products.rows[0].expectedNdrFallbackUsed, true);
assert.strictEqual(products.rows[0].expectedNdrRateSource, "actual_period_fallback");
assert.strictEqual(products.rows[0].ndrBaseOrders, 4);
assert.strictEqual(products.rows[0].ndrDeliveredOrders, 2);
assert.strictEqual(products.rows[0].expectedNdrRate, 0.5);
assert.strictEqual(products.rows[0].deliveredCount, 2);
assert.strictEqual(products.rows[0].averageProfit, 10);
assert.strictEqual(products.rows[0].averageProfitSource, "delivered_orders");

const aggregatorSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer", "pages", "dashboard", "dashboard-aggregator.js"),
  "utf8"
);
const calculatorSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer", "pages", "dashboard", "sections", "section7-calculator-hydrated.js"),
  "utf8"
);

assert(aggregatorSource.includes("expectedNdrRateSource = 'actual_period_fallback'"));
assert(aggregatorSource.includes("expectedNdrSelectedBaseOrders"));
assert(aggregatorSource.includes("actualAverageProfit: actualAverageProfit"));
assert(aggregatorSource.includes("actualAverageProfitSource: actualAverageProfitSource"));
assert(calculatorSource.includes("d.expectedNdrRate != null"));
assert(calculatorSource.includes("d.expectedDeliveriesDisplay != null"));
assert(calculatorSource.includes("actualAverageProfitTotal / actualAverageDeliveredOrders"));
assert(calculatorSource.includes("d.actualAverageProfitSource === 'delivered_orders'"));

console.log("expected NDR fallback regression test passed");
