"use strict";

const assert = require("assert");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

const snapshot = [];
for (let index = 0; index < 6000; index += 1) {
  const productIndex = index % 120;
  snapshot.push({
    taagerOrderNumber: "SORT-CACHE-" + index,
    createdAt: "2026-06-" + String((index % 28) + 1).padStart(2, "0"),
    orderStatusBucket: index % 3 === 0 ? "delivered" : "confirmed",
    products: "Product " + productIndex,
    sku: "SKU-" + productIndex,
    city: "City " + (index % 10),
    qty: 1,
    dashboardTotalPrice: 100 + productIndex,
    profitAfterTax: 10 + productIndex,
    country: "sa",
  });
}

const accounts = {
  account: {
    snapshot,
    country: "sa",
    currency: "SAR",
    marketing: {},
  },
};

let revision = 1;
let accountSnapshotReads = 0;
const service = createDashboardQueryService({
  getAccounts: () => {
    accountSnapshotReads += 1;
    return accounts;
  },
  getAllowedAccountIds: () => ["account"],
  getRevision: () => revision,
});

const baseQuery = {
  kind: "products",
  accountIds: ["account"],
  dateFrom: "2026-06-01",
  dateTo: "2026-06-30",
  page: 1,
  pageSize: 10,
  reportingCurrency: "SAR",
  productFinancialCurrency: "SAR",
};

const firstPage = service.query({
  ...baseQuery,
  sortBy: "deliveredCount",
  sortDir: "desc",
});
assert.equal(firstPage.ok, true);
assert.equal(firstPage.pagination.total, 120);
assert.equal(firstPage.rows.length, 10);

const readsAfterBaseAggregation = accountSnapshotReads;
const ascendingCommission = service.query({
  ...baseQuery,
  sortBy: "commission",
  sortDir: "asc",
});
assert.equal(accountSnapshotReads, readsAfterBaseAggregation,
  "changing sort must reuse the product aggregation");
assert.ok(ascendingCommission.rows.every((row, index, rows) =>
  index === 0 || rows[index - 1].commission <= row.commission),
"ascending sort must still be applied to cached products");

const filteredSecondPage = service.query({
  ...baseQuery,
  page: 2,
  filters: { statusKey: "delivered" },
  sortBy: "profitLoss",
  sortDir: "desc",
});
assert.equal(accountSnapshotReads, readsAfterBaseAggregation,
  "filtering and pagination must reuse the product aggregation");
assert.ok(filteredSecondPage.rows.every((row) => row.deliveredCount > 0));

revision += 1;
service.query({ ...baseQuery, sortBy: "commission", sortDir: "desc" });
assert.ok(accountSnapshotReads > readsAfterBaseAggregation,
  "a data revision must invalidate the product aggregation");

console.log("[PASS] Product sorting, filtering, and pagination reuse the cached aggregation");
