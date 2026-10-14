"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const XLSX = require("xlsx");
const { processDashboardSheets, validateTaagerWorkbook } = require("../src/bot/dashboard-sheet-processing");

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

function easyBuffer(rows, headers = [
  "Created_At", "Phone", "Product_Name", "SKU", "Payment Method",
  "Order ID", "External Order ID", "UTM_Source", "UTM_Campaign",
]) {
  return workbookBuffer([headers].concat(rows));
}

function bySku(rows, sku) {
  const row = rows.find((item) => item.sku === sku);
  assert(row, `expected row for ${sku}`);
  return row;
}

assert.doesNotThrow(() => validateTaagerWorkbook(workbookBuffer([[
  "رقم الطلب", "الحالة", "تاريخ الإنشاء", "المنتجات",
], ["AR-1", "Delivered", "2026-05-01", "SKU-AR"]])), "canonical header matching must preserve Arabic letters");
assert.throws(() => validateTaagerWorkbook(workbookBuffer([
  ["", "   ", "", ""], ["AR-EMPTY", "Delivered", "2026-05-01", "SKU-EMPTY"],
])), /Missing required columns/, "empty headers must not match nonempty English or Arabic candidates");

const taager = taagerBuffer([
  ["T-OLD", "Old SKU", "Delivered", "2026-05-05", "2026-05-05", "0500000001", "Addr", "Riyadh", 100, 10, "", "", 5, 30, "", "", "SKU-OLD", 1, 90, "", "", "", "MAY-OLD", ""],
  ["T-ID", "Exact ID", "Delivered", "2026-05-06", "2026-05-06", "0500000002", "Addr", "Riyadh", 120, 10, "", "", 6, 36, "", "", "SKU-ID", 1, 110, "", "", "", "EXT-ID", ""],
  ["T-PHONE", "Phone SKU", "Delivered", "2026-05-07", "2026-05-07", "0500000003", "Addr", "Riyadh", 130, 10, "", "", 7, 37, "", "", "SKU-PHONE", 1, 120, "", "", "", "", ""],
  ["T-AMB", "Ambiguous", "Delivered", "2026-05-08", "2026-05-08", "0500000004", "Addr", "Riyadh", 140, 10, "", "", 8, 38, "", "", "SKU-AMB", 1, 130, "", "", "", "", ""],
  ["T-CACHE", "Cached", "Delivered", "2026-05-09", "2026-05-09", "0500000005", "Addr", "Riyadh", 150, 10, "", "", 9, 39, "", "", "SKU-CACHE", 1, 140, "", "", "", "", ""],
  ["T-TAAGER", "Taager Pay", "Delivered", "2026-05-10", "2026-05-10", "0500000006", "Addr", "Riyadh", 160, 10, "", "", 10, 40, "", "", "SKU-TAAGER", 1, 150, "", "", "", "EXT-TAAGER", "cod"],
  ["T-UNKNOWN", "Unknown", "Delivered", "2026-05-11", "2026-05-11", "0500000007", "Addr", "Riyadh", 170, 10, "", "", 11, 41, "", "", "SKU-UNKNOWN", 1, 160, "", "", "", "", ""],
  ["T-DUP-ID", "Duplicate ID", "Delivered", "2026-05-12", "2026-05-12", "0500000008", "Addr", "Riyadh", 180, 10, "", "", 12, 42, "", "", "SKU-DUP-ID", 1, 170, "", "", "", "DUP-EXT", ""],
]);

const easy = easyBuffer([
  ["2026-04-15", "0500000001", "Old Learned Name", "SKU-OLD", "card", "APR-OLD", "APR-OLD", "tiktok", "old-campaign"],
  ["2026-05-06", "0500000002", "Exact Name", "SKU-ID", "card", "EO-ID", "EXT-ID", "tiktok", "exact-campaign"],
  ["2026-05-07", "0500000003", "Phone Name", "SKU-PHONE", "card", "EO-PHONE", "", "snapchat", "phone-campaign"],
  ["2026-05-08", "0500000004", "Ambiguous Name", "SKU-AMB", "card", "EO-AMB-1", "", "tiktok", "amb-a"],
  ["2026-05-08", "0500000004", "Ambiguous Name", "SKU-AMB", "cod", "EO-AMB-2", "", "facebook", "amb-b"],
  ["2026-05-10", "0500000006", "Taager Name", "SKU-TAAGER", "card", "EO-TAAGER", "EXT-TAAGER", "facebook", "taager-campaign"],
  ["2026-05-12", "0500000008", "Duplicate ID Name", "SKU-DUP-ID", "card", "EO-DUP-1", "DUP-EXT", "tiktok", "dup-a"],
  ["2026-05-12", "0500000008", "Duplicate ID Name", "SKU-DUP-ID", "card", "EO-DUP-2", "DUP-EXT", "snapchat", "dup-b"],
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

assert.strictEqual(bySku(result.rows, "SKU-OLD").easyOrdersPlatformMatched, undefined, "April platform source must not affect May row");
assert.strictEqual(bySku(result.rows, "SKU-ID").easyOrdersPlatformSource, "TikTok", "May exact order-id platform should match");
assert.strictEqual(bySku(result.rows, "SKU-ID").easyOrdersUtmSource, "tiktok", "the matched row should retain the original EasyOrders source value");
assert.strictEqual(bySku(result.rows, "SKU-ID").easyOrdersUtmCampaign, "exact-campaign", "UTM campaign should be copied for exact platform matches");
assert.strictEqual(bySku(result.rows, "SKU-PHONE").easyOrdersPlatformSource, "Snapchat", "May phone+SKU platform should match when unambiguous");
assert.strictEqual(bySku(result.rows, "SKU-AMB").easyOrdersPlatformMatched, undefined, "Conflicting phone+SKU platform sources should not match");
assert.strictEqual(bySku(result.rows, "SKU-DUP-ID").easyOrdersPlatformMatched, undefined, "conflicting duplicate external IDs must not invent a single platform source");

assert.strictEqual(bySku(result.rows, "SKU-CACHE").productName, "Cached Name", "cached SKU name should be used when export has no name");
assert.strictEqual(bySku(result.rows, "SKU-UNKNOWN").productName, "SKU-UNKNOWN", "unknown SKU should remain the product-name fallback");

const sourceFallbackResult = processDashboardSheets({
  taagerBuffer: taager,
  easyOrdersBuffer: easyBuffer([
    ["2026-05-06", "0500000002", "Exact Name", "SKU-ID", "card", "EO-ID", "EXT-ID", "tiktok", "compact-campaign"],
  ], ["CreatedAt", "Phone", "Product Name", "SKU", "Payment Method", "Order ID", "External Order ID", "Source", "Campaign"]),
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  country: "sa",
  enrichmentEnabled: true,
});
assert.strictEqual(bySku(sourceFallbackResult.rows, "SKU-ID").easyOrdersPlatformSource, "TikTok", "generic Source column should be accepted as EasyOrders UTM fallback");
assert.strictEqual(bySku(sourceFallbackResult.rows, "SKU-ID").easyOrdersUtmCampaign, "compact-campaign", "compact Campaign header should be recognized");

const taagerKnownPayment = bySku(result.rows, "SKU-TAAGER");
assert.strictEqual(taagerKnownPayment.paymentClassification, "cod", "Taager payment column should win over EasyOrders");
assert.strictEqual(taagerKnownPayment.paymentEvidenceSource, "taager-payment-column", "Taager payment source should be preserved");
assert.strictEqual(taagerKnownPayment.easyOrdersPlatformSource, "Facebook", "Platform source should still attach when Taager payment data wins");

const diagnostics = result.enrichmentDiagnostics;
assert.strictEqual(diagnostics.nameDateFrom, "2026-03-02");
assert.strictEqual(diagnostics.paymentDateFrom, "2026-05-01");
assert(diagnostics.nameRowsScanned > diagnostics.paymentRowsScanned, "name lookback should scan more rows than payment window");
assert(diagnostics.cacheHits >= 1, "cache hit should be counted");
assert.strictEqual(diagnostics.platformMatches, 3, "three Taager rows should receive platform metadata");
assert.strictEqual(diagnostics.platformSourceMatches, 3, "all matched platform rows in the fixture have a UTM source");
assert.strictEqual(diagnostics.platformMatchConflicts, 2, "conflicting phone+SKU and duplicate-ID platform candidates should be counted");

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

async function verifyRendererSourceSections() {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const window = {
    _kbotLang: "en", _kbotTheme: "dark", addEventListener: () => {}, removeEventListener: () => {},
    dashboardAccountsList: [], currentActiveAccountLabel: "account",
    api: {
      getDashboardSnapshot: async () => ({ ok: true, revision: "1", data: { account: { snapshot: result.rows, botSnapshotTimestamp: Date.now() } } }),
      getCredentials: async () => ({ accounts: [{ id: "account", easyEmail: "account@example.com", label: "account", country: "sa" }] }),
    },
    dashboardI18n: {
      t: (value) => value, raw: (value) => String(value || ""), number: String,
      formatTimestamp: () => "", formatMonth: () => "May 2026", monthName: () => "May",
      locale: () => "en-US", isRtl: () => false,
    },
    localStorage: storage,
  };
  window.window = window;
  const context = vm.createContext({
    window, localStorage: storage,
    document: { documentElement: { getAttribute: () => "en" } },
    console, Promise, Date, Math, Number, String, Array, Object, JSON, RegExp,
    parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
  });
  for (const file of [
    "src/renderer/pages/taager-product-names.js",
    "src/renderer/pages/taager-status.js",
    "src/renderer/pages/dashboard/dashboard-filter-bus.js",
    "src/renderer/pages/dashboard/dashboard-aggregator-score.js",
    "src/renderer/pages/dashboard/dashboard-aggregator-geo.js",
    "src/renderer/pages/dashboard/dashboard-insight-engine.js",
    "src/renderer/pages/dashboard/dashboard-aggregator.js",
    "src/renderer/pages/dashboard/sections/section-order-sources.js",
    "src/renderer/pages/dashboard/sections/section-product-sources.js",
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  window.DashboardPeriodState.setCustomRange("2026-05-01", "2026-05-31");
  window.DashboardDeliveredDateState.set("actual");
  window.invalidateDashboardCache();
  const dashboard = await new Promise((resolve, reject) => {
    window.runDashboardAggregator((value) => value ? resolve(value) : reject(new Error("Missing dashboard result")));
  });
  const sourceNames = dashboard.platformSources.sources.map((source) => source.label).sort();
  assert.deepStrictEqual(sourceNames, ["Facebook", "Snapchat", "TikTok"], "Order Sources platform aggregation should expose only uniquely matched EasyOrders UTMs");
  assert.equal(dashboard.platformSources.summary.netOrders, 3, "date-filtered platform aggregation should exclude older lookback rows and ambiguous matches");
  assert.equal(dashboard.platformProductSources.type, "platform", "Products by Source should receive its platform model");
  assert.deepStrictEqual(
    dashboard.platformProductSources.sources.map((source) => source.label).sort(),
    ["Facebook", "Snapchat", "TikTok", "Unmatched / Unknown"],
    "Products by Source should group matched products by EasyOrders platform and leave unmatched orders explicit",
  );
  for (const source of dashboard.platformProductSources.sources) {
    assert(source.products.length > 0, `${source.label} should have a product row`);
  }

  function renderMount() {
    return {
      innerHTML: "",
      addEventListener: () => {},
      contains: () => false,
      querySelector: () => null,
    };
  }
  const sectionData = {
    orderSources: dashboard.orderSources,
    platformSources: dashboard.platformSources,
    productSources: dashboard.productSources,
    platformProductSources: dashboard.platformProductSources,
  };
  const orderMount = renderMount();
  orderMount._orderSourcesMode = "platform";
  window.renderSectionOrderSources(orderMount, sectionData, { data: sectionData });
  assert(orderMount.innerHTML.includes("TikTok") && orderMount.innerHTML.includes("Facebook"), "Order Sources section should render platform model labels");
  const productMount = renderMount();
  productMount._productSourcesMode = "platform";
  window.renderSectionProductSources(productMount, sectionData, { data: sectionData });
  assert(productMount.innerHTML.includes("TikTok") && productMount.innerHTML.includes("Snapchat"), "Products by Source section should render platform product groups");
}

verifyRendererSourceSections().then(() => {
  console.log("Dashboard EasyOrders enrichment and source aggregation OK");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
