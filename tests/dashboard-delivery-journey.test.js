"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const financialCore = require("../src/renderer/pages/dashboard/dashboard-financial-core.js");
const { updateDeliveryJourneys } = require("../src/main/dashboard-delivery-journey.js");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service.js");
const { pruneDashboardAccountsForCurrentMonth } = require("../src/main/monthly-data-cleanup.js");

function row(id, bucket, sku = "SKU-MAIN", createdAt = "2026-06-05") {
  return { taagerOrderNumber: id, orderStatusBucket: bucket, orderStatus: bucket, createdAt, sku, products: sku, taagerCountry: "sa", city: "Riyadh", qty: 1, dashboardTotalPrice: 100, profitAfterTax: 20 };
}

let journeys = updateDeliveryJourneys({}, [], [row("A", "shipping"), row("A", "shipping", "SKU-SECOND"), row("B", "delivered")], 100);
assert.deepEqual(Object.keys(journeys), ["A"], "A delivered snapshot alone proves no Out for Delivery history");
assert.equal(journeys.A.events.length, 1, "multiple product lines create one order-level observation");
assert.equal(journeys.A.products.length, 2);
journeys = updateDeliveryJourneys(journeys, [row("A", "shipping")], [row("A", "shipping")], 200, 100);
assert.equal(journeys.A.events.length, 1, "repeated snapshots do not duplicate a transition");
const previousJourneys = journeys;
journeys = updateDeliveryJourneys(journeys, [row("A", "shipping")], [row("A", "delivered")], 300, 200);
assert.equal(previousJourneys.A.outcome, null, "an update does not mutate the prior persisted snapshot");
assert.equal(journeys.A.outcome, "delivered");
assert.equal(journeys.A.events.length, 2);
journeys = updateDeliveryJourneys(journeys, [row("A", "delivered")], [row("A", "return_verified")], 400, 300);
assert.equal(journeys.A.outcome, "unsuccessful", "a later verified return supersedes delivery");
assert.equal(journeys.A.events.length, 3);
const seeded = updateDeliveryJourneys({}, [row("LEGACY", "shipping")], [row("LEGACY", "delivered"), row("", "shipping")], 600, 500);
assert.equal(seeded.LEGACY.outcome, "delivered", "an existing Out for Delivery snapshot can be linked on the next refresh");
assert.equal(seeded.LEGACY.enteredOutForDeliveryAt, 500);
assert.equal(Object.keys(seeded).length, 1, "orders without a stable ID are not linked");
const arabicShipping = { ...row("AR", "shipping"), orderStatusBucket: "", orderStatus: "قيد التوصيل" };
const arabicDelivered = { ...row("AR", "delivered"), orderStatusBucket: "", orderStatus: "تم التوصيل" };
assert.equal(updateDeliveryJourneys({}, [arabicShipping], [arabicDelivered], 700, 650).AR.outcome, "delivered");
const pruned = pruneDashboardAccountsForCurrentMonth({ account: { snapshot: [], deliveryJourneys: { old: { createdAt: "2026-05-05" }, current: { createdAt: "2026-06-05" } } } }, "2026-06-01", (item) => item.createdAt);
assert.equal(pruned.removedJourneys, 1);
assert.deepEqual(Object.keys(pruned.accounts.account.deliveryJourneys), ["current"]);

const account = { snapshot: [], deliveryJourneys: {} };
for (let day = 1; day <= 20; day++) {
  const id = `OBS-${day}`;
  const date = `2026-06-${String(day).padStart(2, "0")}`;
  const shipping = row(id, "shipping", "SKU-MAIN", date);
  const final = row(id, day <= 15 ? "delivered" : "failed", "SKU-MAIN", date);
  account.deliveryJourneys = updateDeliveryJourneys(account.deliveryJourneys, [], [shipping], 1000 + day);
  account.deliveryJourneys = updateDeliveryJourneys(account.deliveryJourneys, [shipping], [final], 2000 + day, 1000 + day);
  account.snapshot.push(final);
}
for (let day = 21; day <= 24; day++) {
  account.snapshot.push(row(`PENDING-${day}`, "shipping", "SKU-MAIN", `2026-06-${day}`));
  account.snapshot.push(row(`FALLBACK-${day}`, "shipping", "SKU-FALLBACK", `2026-06-${day}`));
}
for (let day = 1; day <= 20; day++) {
  const id = `HIST-${day}`;
  const date = `2026-05-${String(day).padStart(2, "0")}`;
  const shipping = row(id, "shipping", "SKU-MAIN", date);
  const final = row(id, day <= 8 ? "delivered" : "failed", "SKU-MAIN", date);
  account.deliveryJourneys = updateDeliveryJourneys(account.deliveryJourneys, [], [shipping], 3000 + day);
  account.deliveryJourneys = updateDeliveryJourneys(account.deliveryJourneys, [shipping], [final], 4000 + day, 3000 + day);
  account.snapshot.push(final);
}
const service = createDashboardQueryService({ getAccounts: () => ({ account }), getAllowedAccountIds: () => ["account"], getRevision: () => 1 });
const result = service.query({ kind: "products", accountIds: ["account"], dateFrom: "2026-06-01", dateTo: "2026-06-30", deliveredDateMode: "actual", page: 1, pageSize: 10 });
assert.equal(result.ok, true);
for (const sku of ["SKU-MAIN", "SKU-FALLBACK"]) {
  const product = result.rows.find((item) => item.sku === sku);
  assert.ok(product);
  assert.equal(product.expectedDeliveredFromOutForDeliveryExact, 3, "4 current orders × 15/20 observed conversions");
  assert.equal(product.expectedDeliveredFromOutForDeliveryDisplay, 3);
  assert.equal(product.expectedDeliveredFromOutForDeliverySource, sku === "SKU-MAIN" ? "observed_product" : "observed_account");
  assert.equal(product.expectedDeliveredFromOutForDeliverySampleSize, 20);
}
const expected = service.query({ kind: "products", accountIds: ["account"], dateFrom: "2026-06-01", dateTo: "2026-06-30", deliveredDateMode: "expected", ndrDateFrom: "2026-05-01", ndrDateTo: "2026-05-20", page: 1, pageSize: 10 });
assert.equal(expected.ok, true);
for (const sku of ["SKU-MAIN", "SKU-FALLBACK"]) {
  const product = expected.rows.find((item) => item.sku === sku);
  assert.ok(Math.abs(product.expectedDeliveredFromOutForDeliveryExact - 1.6) < 1e-10, "Expected mode uses the selected May transition cohort");
  assert.equal(product.expectedDeliveredFromOutForDeliveryDisplay, 2);
  assert.equal(product.expectedDeliveredFromOutForDeliverySource, sku === "SKU-MAIN" ? "observed_product" : "observed_account");
}

test("renderer account and pipeline use the observed order journeys", async () => {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const window = {
    _kbotLang: "en", _kbotTheme: "dark", addEventListener: () => {}, removeEventListener: () => {},
    dashboardAccountsList: [], currentActiveAccountLabel: "account",
    TaagerDashboardFinancialCore: financialCore,
    api: { getDashboardSnapshot: async () => ({ ok: true, revision: "1", data: { account } }), getCredentials: async () => ({ accounts: [{ id: "account", easyEmail: "account@example.com", label: "account", country: "sa" }] }) },
    dashboardI18n: { t: (value) => value, raw: (value) => String(value || ""), number: String, formatTimestamp: () => "", formatMonth: () => "June 2026", monthName: () => "June", locale: () => "en-US", isRtl: () => false },
    localStorage: storage,
  };
  window.window = window;
  const context = vm.createContext({ window, localStorage: storage, document: { documentElement: { getAttribute: () => "en" } }, console, Promise, Date, Math, Number, String, Array, Object, JSON, RegExp, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout });
  for (const file of ["src/renderer/pages/taager-product-names.js", "src/renderer/pages/taager-status.js", "src/renderer/pages/dashboard/dashboard-filter-bus.js", "src/renderer/pages/dashboard/dashboard-aggregator-score.js", "src/renderer/pages/dashboard/dashboard-aggregator-geo.js", "src/renderer/pages/dashboard/dashboard-insight-engine.js", "src/renderer/pages/dashboard/dashboard-aggregator.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  window.DashboardPeriodState.setCustomRange("2026-06-01", "2026-06-30");
  window.DashboardDeliveredDateState.set("actual");
  window.invalidateDashboardCache();
  const result = await new Promise((resolve, reject) => window.runDashboardAggregator((value) => value ? resolve(value) : reject(new Error("Missing dashboard result"))));
  assert.equal(result.roi.shippingCount, 8);
  assert.equal(result.roi.expectedDeliveredFromOutForDeliveryExact, 6);
  assert.equal(result.roi.expectedDeliveredFromOutForDeliveryDisplay, 6);
  assert.equal(result.roi.expectedDeliveredFromOutForDeliverySource, "observed_account");
  const shippingStage = result.pipeline.stages.find((stage) => stage.id === "shipping");
  assert.equal(shippingStage.expectedDeliveredFromOutForDeliveryDisplay, 6);
  assert.equal(shippingStage.expectedDeliveredFromOutForDeliverySource, "observed_account");
  for (const sku of ["SKU-MAIN", "SKU-FALLBACK"]) {
    const product = result.products.rankedList.find((item) => item.sku === sku);
    assert.ok(product, sku);
    assert.equal(product.expectedDeliveredFromOutForDeliveryExact, 3);
    assert.equal(product.expectedDeliveredFromOutForDeliverySource, sku === "SKU-MAIN" ? "observed_product" : "observed_account");
  }
});
