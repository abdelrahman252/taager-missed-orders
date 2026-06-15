"use strict";

const assert = require("assert");
const XLSX = require("xlsx");
const { processDashboardSheets } = require("../src/bot/dashboard-sheet-processing");

function workbookBuffer(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function taagerBuffer(rows) {
  const header = [
    "Order Number", "Customer Name", "Status", "Created At", "Last Updated",
    "Phone", "Address", "Province", "Cash On Delivery", "Shipping", "Notes",
    "", "Tax Profit", "Order Profit", "", "", "Products", "Quantity", "Prices",
    "", "", "", "Order ID on your store", "Payment Method",
  ];
  return workbookBuffer([header].concat(rows));
}

function easyBuffer(rows) {
  return workbookBuffer([[
    "CreatedAt",
    "Phone",
    "Product Name",
    "SKU",
    "Payment Method",
    "Order ID",
    "External Order ID",
  ]].concat(rows));
}

function bySku(rows, sku) {
  const row = rows.find((item) => item.sku === sku);
  assert(row, `expected row for ${sku}`);
  return row;
}

const taager = taagerBuffer([
  ["T-OLD", "Old SKU", "Delivered", "2026-05-05", "2026-05-05", "0500000001", "Addr", "Riyadh", 100, 10, "", "", 5, 30, "", "", "SKU-OLD", 1, 90, "", "", "", "MAY-OLD", ""],
  ["T-ID", "Exact ID", "Delivered", "2026-05-06", "2026-05-06", "0500000002", "Addr", "Riyadh", 120, 10, "", "", 6, 36, "", "", "SKU-ID", 1, 110, "", "", "", "EXT-ID", ""],
  ["T-PHONE", "Phone SKU", "Delivered", "2026-05-07", "2026-05-07", "0500000003", "Addr", "Riyadh", 130, 10, "", "", 7, 37, "", "", "SKU-PHONE", 1, 120, "", "", "", "", ""],
  ["T-AMB", "Ambiguous", "Delivered", "2026-05-08", "2026-05-08", "0500000004", "Addr", "Riyadh", 140, 10, "", "", 8, 38, "", "", "SKU-AMB", 1, 130, "", "", "", "", ""],
  ["T-CACHE", "Cached", "Delivered", "2026-05-09", "2026-05-09", "0500000005", "Addr", "Riyadh", 150, 10, "", "", 9, 39, "", "", "SKU-CACHE", 1, 140, "", "", "", "", ""],
  ["T-TAAGER", "Taager Pay", "Delivered", "2026-05-10", "2026-05-10", "0500000006", "Addr", "Riyadh", 160, 10, "", "", 10, 40, "", "", "SKU-TAAGER", 1, 150, "", "", "", "EXT-TAAGER", "cod"],
  ["T-UNKNOWN", "Unknown", "Delivered", "2026-05-11", "2026-05-11", "0500000007", "Addr", "Riyadh", 170, 10, "", "", 11, 41, "", "", "SKU-UNKNOWN", 1, 160, "", "", "", "", ""],
]);

const easy = easyBuffer([
  ["2026-04-15", "0500000001", "Old Learned Name", "SKU-OLD", "card", "APR-OLD", "APR-OLD"],
  ["2026-05-06", "0500000002", "Exact Name", "SKU-ID", "card", "EO-ID", "EXT-ID"],
  ["2026-05-07", "0500000003", "Phone Name", "SKU-PHONE", "card", "EO-PHONE", ""],
  ["2026-05-08", "0500000004", "Ambiguous Name", "SKU-AMB", "card", "EO-AMB-1", ""],
  ["2026-05-08", "0500000004", "Ambiguous Name", "SKU-AMB", "cod", "EO-AMB-2", ""],
  ["2026-05-10", "0500000006", "Taager Name", "SKU-TAAGER", "card", "EO-TAAGER", "EXT-TAAGER"],
]);

const result = processDashboardSheets({
  taagerBuffer: taager,
  easyOrdersBuffer: easy,
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  country: "sa",
  enrichmentEnabled: true,
  easyOrdersLookbackDays: 60,
  skuNameCache: { "SKU-CACHE": "Cached Name", "SKU-OLD": "Older Cached Name" },
});

assert.strictEqual(bySku(result.rows, "SKU-OLD").productName, "Old Learned Name", "April row should teach SKU name");
assert.strictEqual(result.learnedSkuNameMap["SKU-OLD"], "Old Learned Name", "fresh EasyOrders name should overwrite an older cached name");
assert.strictEqual(bySku(result.rows, "SKU-OLD").paymentClassification, "unknown", "April payment must not affect May row");

assert.strictEqual(bySku(result.rows, "SKU-ID").paymentClassification, "prepaid", "May exact order-id payment should match");
assert.strictEqual(bySku(result.rows, "SKU-PHONE").paymentClassification, "prepaid", "May phone+SKU payment should match when unambiguous");
assert.strictEqual(bySku(result.rows, "SKU-AMB").paymentClassification, "unknown", "Ambiguous phone+SKU payment should not match");

assert.strictEqual(bySku(result.rows, "SKU-CACHE").productName, "Cached Name", "cached SKU name should be used when export has no name");
assert.strictEqual(bySku(result.rows, "SKU-UNKNOWN").productName, "SKU-UNKNOWN", "unknown SKU should remain the product-name fallback");

const taagerKnownPayment = bySku(result.rows, "SKU-TAAGER");
assert.strictEqual(taagerKnownPayment.paymentClassification, "cod", "Taager payment column should win over EasyOrders");
assert.strictEqual(taagerKnownPayment.paymentEvidenceSource, "taager-payment-column", "Taager payment source should be preserved");

const diagnostics = result.enrichmentDiagnostics;
assert.strictEqual(diagnostics.nameDateFrom, "2026-03-02");
assert.strictEqual(diagnostics.paymentDateFrom, "2026-05-01");
assert(diagnostics.nameRowsScanned > diagnostics.paymentRowsScanned, "name lookback should scan more rows than payment window");
assert(diagnostics.cacheHits >= 1, "cache hit should be counted");

const missingEasyOrders = processDashboardSheets({
  taagerBuffer: taager,
  easyOrdersBuffer: null,
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  country: "sa",
  enrichmentEnabled: true,
  easyOrdersLookbackDays: 60,
  skuNameCache: { "SKU-CACHE": "Cached Name", "SKU-OLD": "Last Successful Name" },
});

assert.strictEqual(missingEasyOrders.enrichmentDiagnostics.status, "missing", "missing EasyOrders export should remain visible in diagnostics");
assert.strictEqual(bySku(missingEasyOrders.rows, "SKU-CACHE").productName, "Cached Name", "missing EasyOrders export should preserve cached names");
assert.strictEqual(bySku(missingEasyOrders.rows, "SKU-OLD").productName, "Last Successful Name", "failed refresh should use the last successful product name");
assert.strictEqual(bySku(missingEasyOrders.rows, "SKU-UNKNOWN").productName, "SKU-UNKNOWN", "missing EasyOrders export should leave unknown SKUs unchanged");
assert.deepStrictEqual(missingEasyOrders.learnedSkuNameMap, {}, "missing EasyOrders export must not claim or overwrite learned names");

console.log("Dashboard EasyOrders enrichment split OK");
