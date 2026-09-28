"use strict";
const assert = require("node:assert/strict");
const core = require("../src/renderer/pages/dashboard/dashboard-financial-core.js");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service.js");
const estimate = (count, delivered, unsuccessful) => core.calculateOutForDeliveryEstimate({ outForDeliveryCount: count, deliveredOutcomes: delivered, unsuccessfulOutcomes: unsuccessful });
assert.equal(estimate(111, 107, 893).expectedDeliveredFromOutForDeliveryDisplay, 12);
assert.equal(estimate(111, 179, 821).expectedDeliveredFromOutForDeliveryDisplay, 20);
assert.equal(estimate(4, 0, 20).expectedDeliveredFromOutForDeliveryDisplay, 0);
assert.equal(estimate(4, 0, 19).unavailable, true);

const account = { snapshot: [] };
function add(id, month, day, bucket, sku = "SKU-MAIN") {
  account.snapshot.push({ taagerOrderNumber: id, createdAt: `2026-${month}-${String(day).padStart(2, "0")}`, orderStatusBucket: bucket, products: sku === "SKU-MAIN" ? "Main Product" : "Fallback Product", sku, city: "Riyadh", qty: 1, dashboardTotalPrice: 100, profitAfterTax: 20 });
}
for (let day = 1; day <= 20; day++) {
  add(`H-${day}`, "05", day, day <= 8 ? "delivered" : (day <= 14 ? "failed" : "return_verified"));
  add(`A-${day}`, "06", day, day <= 5 ? "delivered" : (day <= 15 ? "failed" : "return_verified"));
}
add("PRE-SHIP-H", "05", 20, "customer_refused_confirmation");
add("PRE-SHIP-A", "06", 20, "out_of_stock");
for (let day = 21; day <= 24; day++) {
  add(`M-${day}`, "06", day, "shipping");
  add(`F-${day}`, "06", day, "shipping", "SKU-FALLBACK");
}
const service = createDashboardQueryService({ getAccounts: () => ({ account }), getAllowedAccountIds: () => ["account"], getRevision: () => 1 });
for (const [mode, exact, display] of [["actual", 1, 1], ["expected", 1.6, 2]]) {
  const result = service.query({ kind: "products", accountIds: ["account"], dateFrom: "2026-06-01", dateTo: "2026-06-30", deliveredDateMode: mode, ndrDateFrom: "2026-05-01", ndrDateTo: "2026-05-20", page: 1, pageSize: 10 });
  assert.equal(result.ok, true);
  for (const sku of ["SKU-MAIN", "SKU-FALLBACK"]) {
    const row = result.rows.find((item) => item.sku === sku);
    assert.ok(row, sku);
    assert.equal(row.outForDeliveryCount, 4);
    assert.ok(Math.abs(row.expectedDeliveredFromOutForDeliveryExact - exact) < 1e-10);
    assert.equal(row.expectedDeliveredFromOutForDeliveryDisplay, display);
  }
}
console.log("Resolved-shipment estimates passed for rounding, zero, minimum sample, Actual/Expected cohorts, and product/account fallback.");
