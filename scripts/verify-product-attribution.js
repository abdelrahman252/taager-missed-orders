"use strict";

const assert = require("assert");
const XLSX = require("xlsx");
const attribution = require("../src/renderer/pages/dashboard/dashboard-product-attribution-core");
const { parseFullMonthSnapshot } = require("../src/bot/parser");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

function match(name, products, extra, options) {
  const index = attribution.createProductIndex(products, options);
  return attribution.matchCampaign({ campaign: name, ...(extra || {}) }, index);
}

const nestedProducts = [
  { key: "base", sku: "SA050101VK0099", name: "Base Product", accountId: "a1", country: "sa" },
  { key: "xb", sku: "SA050101VK0099XB", name: "XB Product", accountId: "a1", country: "sa" },
  { key: "other", sku: "SA050301IA0099", name: "Portable Blender", accountId: "a1", country: "sa" },
];

assert.equal(match("Scale | SA050301IA0099 | Video", nestedProducts, { dashboardAccountId: "a1", country: "sa" }).matchDetail, "separated_sku");
assert.equal(match("ScaleSA050301IA0099Video", nestedProducts, { dashboardAccountId: "a1", country: "sa" }).matchDetail, "glued_sku");
assert.equal(match("scalesa050301ia0099video", nestedProducts, { dashboardAccountId: "a1", country: "sa" }).product.key, "other");
assert.equal(match("ScaleSA050101VK0099XBVideo", nestedProducts, { dashboardAccountId: "a1", country: "sa" }).product.key, "xb");

const multi = match(
  "ScaleSA050301IA0099AndSA050101VK0099XB",
  nestedProducts,
  { dashboardAccountId: "a1", country: "sa" }
);
assert.equal(multi.status, "ambiguous");
assert.equal(multi.method, "ambiguous");
assert.equal(multi.product, null);
assert.deepEqual(new Set(multi.candidateIds), new Set(["other", "xb"]));
const sameProductAliases = match(
  "Bundle SKU-OLD and SKU-NEW",
  [{ key: "same", skus: ["SKU-OLD", "SKU-NEW"], name: "Same Product" }]
);
assert.equal(sameProductAliases.status, "matched");
assert.equal(sameProductAliases.matchDetail, "multiple_skus_same_product");

assert.equal(
  match("ScaleSA050301IA0099", nestedProducts, { dashboardAccountId: "a2", country: "sa" }).status,
  "unmatched",
  "Account scope prevents cross-account attribution"
);
assert.equal(
  match("ScaleSA050301IA0099", nestedProducts, { dashboardAccountId: "a1", country: "eg" }).status,
  "unmatched",
  "Country scope prevents cross-country attribution"
);

const nameProducts = [
  { key: "blender", sku: "SKU-BLEND", name: "Portable Blender" },
  { key: "cream", sku: "SKU-CREAM", name: "Intensive Skin Cream" },
  { key: "other-cream", sku: "SKU-CREAM-2", name: "Daily Skin Cream" },
];
assert.equal(match("Portable Blender Scale", nameProducts).product.key, "blender");
assert.equal(match("Portable Blender Scale", nameProducts).method, "name");
assert.equal(match("Intensive Skin Launch", nameProducts).product.key, "cream");
assert.equal(match("Skin Campaign", nameProducts).status, "unmatched");

const overridden = match(
  "Rocket Mixer Launch",
  [{ key: "blender", sku: "SKU-BLEND", name: "SKU-BLEND" }],
  null,
  { productNameOverrides: { "SKU-BLEND": "Rocket Mixer" } }
);
assert.equal(overridden.product.key, "blender");
assert.equal(overridden.method, "name");

const arabic = match(
  "\u062d\u0645\u0644\u0629 \u0643\u0631\u064a\u0645 \u0627\u0644\u0639\u0646\u0627\u064a\u0629",
  [{ key: "arabic", sku: "SKU-AR", name: "\u0643\u0631\u064a\u0645 \u0627\u0644\u0639\u0646\u0627\u064a\u0629" }]
);
assert.equal(arabic.product.key, "arabic");

const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([
  [
    "Order Number", "Customer Name", "Status", "Created At", "Last Updated", "Phone Number",
    "Address", "City", "COD", "Shipping", "Notes", "Country", "Tax Profit", "Order Profit",
    "Page Name", "Page URL", "Products", "Quantity", "Prices", "Received By",
    "National Address", "Source", "Order ID on your store"
  ],
  [
    "ORDER-1", "Customer", "Delivered", "2026-06-01", "2026-06-02", "966500000000",
    "Address", "Riyadh", 200, 20, "", "Saudi Arabia", 5, 50,
    "", "", "SKU-A, SKU-B", "2, 1", "120, 60", "",
    "", "", "STORE-1"
  ]
]);
XLSX.utils.book_append_sheet(workbook, sheet, "Orders");
const parsedItems = parseFullMonthSnapshot(
  XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  { dateFrom: "2026-06-01", dateTo: "2026-06-30" }
);
assert.equal(parsedItems.length, 2);
assert.deepEqual(parsedItems.map((row) => row.sku), ["SKU-A", "SKU-B"]);
assert.deepEqual(parsedItems.map((row) => row.qty), [2, 1]);
assert.deepEqual(parsedItems.map((row) => row.totalPrice), [120, 60]);
assert.ok(parsedItems.every((row) => row.taagerOrderNumber === "ORDER-1"));
assert.deepEqual(parsedItems.map((row) => row.orderItemIndex), [0, 1]);
assert.ok(parsedItems.every((row) => row.orderItemCount === 2));

const service = createDashboardQueryService({
  getAccounts: () => ({
    a1: {
      country: "sa",
      snapshot: [
        {
          taagerOrderNumber: "A-1",
          taagerCountry: "sa",
          sku: "SKU-A",
          products: "Portable Blender",
          orderStatusBucket: "delivered",
          profitAfterTax: 50,
        },
        {
          taagerOrderNumber: "B-1",
          taagerCountry: "sa",
          sku: "SKU-B",
          products: "Other Product",
          orderStatusBucket: "confirmed",
          profitAfterTax: 20,
        },
      ],
      marketing: {
        tiktok: { summary: { campaignBreakdown: [
          { campaign: "ScaleSKU-AVideo", spend: 100, currency: "SAR" },
        ] } },
        snapchat: { summary: { campaignBreakdown: [
          { campaign: "Scale | SKU-B | Video", spend: 100, currency: "SAR" },
        ] } },
        facebook: { summary: { campaignBreakdown: [
          { campaign: "Portable Blender Launch", spend: 100, currency: "SAR" },
          { campaign: "Bundle SKU-A and SKU-B", spend: 100, currency: "SAR" },
        ] } },
      },
    },
  }),
  getAllowedAccountIds: () => ["a1"],
  getRevision: () => 1,
  getMarketingRevision: () => 1,
});
const overview = service.query({
  kind: "campaign-overview",
  accountIds: ["a1"],
  platform: "all",
  reportingCurrency: "SAR",
  campaignPage: 1,
  productPage: 1,
  pageSize: 20,
});
assert.equal(overview.ok, true);
assert.equal(overview.campaignRows.length, 4);
assert.equal(overview.totals.matchedSpend, 300);
assert.equal(overview.totals.unmatchedSpend, 100);
assert.equal(overview.totals.gluedSkuRows, 1);
assert.equal(overview.totals.separatedSkuRows, 1);
assert.equal(overview.totals.nameRows, 1);
assert.equal(overview.totals.ambiguousRows, 1);
assert.equal(overview.campaignRows.find((row) => row.platform === "tiktok").matchDetail, "glued_sku");
assert.equal(overview.campaignRows.find((row) => row.platform === "snapchat").matchDetail, "separated_sku");
assert.equal(overview.campaignRows.find((row) => row.campaign === "Portable Blender Launch").matchMethod, "name");
assert.equal(overview.campaignRows.find((row) => row.matchMethod === "ambiguous").attributionVerified, false);

console.log("[PASS] Unified product attribution core");
