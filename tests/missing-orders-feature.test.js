"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

process.env.BOT_CONFIG = JSON.stringify({ taagerCountry: "sa" });
delete require.cache[require.resolve("../src/bot/output")];

const { buildOutputExcel, buildMissingOrdersExcel, buildSkippedExcel } = require("../src/bot/output");
const {
  splitOrdersByDestination,
  groupMissingOrders,
  missingOrderUploadIdentity,
} = require("../src/bot/missing-orders");
const {
  SWITCH_TO_OLD_SELECTOR,
  MISSING_ORDERS_TAB_SELECTOR,
  MISSING_ORDERS_UPLOAD_SELECTOR,
  MISSING_ORDERS_ERROR_NOTICE_RE,
  MISSING_ORDERS_SUCCESS_NOTICE_RE,
} = require("../src/bot/missing-orders-upload-flow");
const {
  normalizeMissedOrdersDestination,
  splitOrdersByMissedDestination,
  destinationForOrder,
} = require("../src/bot/order-destinations");
const {
  buildTaagerProductCatalog,
  parseRealOrders,
  parseMissedOrders,
  repairOrderQuantitiesFromCatalog,
  resolveMissedOrders,
  extractSkuFromText,
  parseTaagerOrderKeys,
  mergeAndDeduplicate,
} = require("../src/bot/parser");

const real = { source: "real", normPhone: "966500000001", sku: "REAL-1" };
const missedA = {
  source: "missed",
  normPhone: "966500000002",
  sku: "MISS-1",
  productName: "First Product",
  unitPrice: 100,
  qty: 1,
  name: "Missing Customer",
  city: "Riyadh",
  address: "District 1",
  easyCreatedAt: "2026-07-06 10:30:00",
};
const missedB = { ...missedA, sku: "MISS-2", productName: "Second Product", unitPrice: 250, qty: 2 };

const disabled = splitOrdersByDestination([real, missedA], false);
assert.deepStrictEqual(disabled.cartOrders, [real, missedA]);
assert.deepStrictEqual(disabled.missingOrders, []);

const enabled = splitOrdersByDestination([real, missedA, missedB], true);
assert.deepStrictEqual(enabled.cartOrders, [real]);
assert.deepStrictEqual(enabled.missingOrders, [missedA, missedB]);
assert.strictEqual(groupMissingOrders([missedA, missedB]).length, 1);
assert.notStrictEqual(missingOrderUploadIdentity(missedA), missingOrderUploadIdentity(missedB));

assert.strictEqual(normalizeMissedOrdersDestination(""), "primary_cart");
assert.strictEqual(normalizeMissedOrdersDestination("", { legacyEnabled: true }), "primary_cart");
assert.strictEqual(normalizeMissedOrdersDestination("second-taager-cart"), "second_taager_cart");
const primaryRoute = splitOrdersByMissedDestination([real, missedA], "primary_cart");
assert.deepStrictEqual(primaryRoute.primaryCartOrders, [real, missedA]);
assert.deepStrictEqual(primaryRoute.legacyMissingOrders, []);
assert.deepStrictEqual(primaryRoute.secondTaagerCartOrders, []);
const legacyRoute = splitOrdersByMissedDestination([real, missedA], "legacy_missing_orders");
assert.deepStrictEqual(legacyRoute.primaryCartOrders, [real]);
assert.deepStrictEqual(legacyRoute.legacyMissingOrders, [missedA]);
assert.deepStrictEqual(legacyRoute.secondTaagerCartOrders, []);
const secondRoute = splitOrdersByMissedDestination([real, missedA], "second_taager_cart");
assert.deepStrictEqual(secondRoute.primaryCartOrders, [real]);
assert.deepStrictEqual(secondRoute.legacyMissingOrders, []);
assert.deepStrictEqual(secondRoute.secondTaagerCartOrders, [missedA]);
assert.strictEqual(destinationForOrder(missedA, "second_taager_cart"), "second-taager-cart");

const pipeProductHeader = ["Is Completed", "Created At", "Products", "Phone", "Full Name", "Government", "Address", "UTM Campaign"];
const pipeProducts = [
  "مروحة سقف بإنارة LED مع ريموت | 3 سرعات | 3 ألوان إضاءة",
  "كاميرا داش كام للسيارة | تسجيل قيادة HD | تشغيل تلقائي",
  "كاميرا عين الصقر الشمسية 4G - تعمل بدون كهرباء | شريحة اتصال + واي فاي + رؤية ليلية | ضمان سنة",
];
const pipeProductSheet = XLSX.utils.aoa_to_sheet([
  pipeProductHeader,
  ...pipeProducts.map((product, index) => [
    "false",
    "2026-07-06",
    `[${product}]`,
    `05000000${10 + index}`,
    `Pipe Product Customer ${index + 1}`,
    "Riyadh",
    "Address",
    "SA030109RTB199-منظف-standard-man-",
  ]),
]);
const pipeProductBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(pipeProductBook, pipeProductSheet, "Missed");
const pipeProductResult = parseMissedOrders(
  XLSX.write(pipeProductBook, { type: "buffer", bookType: "xlsx" }),
  new Date(2026, 6, 1),
  new Date(2026, 6, 19),
);
assert.strictEqual(pipeProductResult.orders.length, 3, "pipe-delimited product descriptions should stay one missed row each");
assert.deepStrictEqual(pipeProductResult.orders.map((order) => order.productName), pipeProducts);
assert(pipeProductResult.orders.every((order) => order.skuFromUtm === "SA030109RTB199"), "UTM SKU fallback should be preserved while product text remains unsplit");

const taagerCatalogHeader = Array(19).fill("");
taagerCatalogHeader[16] = "Products";
taagerCatalogHeader[17] = "Quantity";
taagerCatalogHeader[18] = "Prices";
const taagerCatalogSheet = XLSX.utils.aoa_to_sheet([
  taagerCatalogHeader,
  [...Array(16).fill(""), "TAAGER-SKU-1", "2", "150"],
]);
const taagerCatalogBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(taagerCatalogBook, taagerCatalogSheet, "Orders");
const taagerCatalog = buildTaagerProductCatalog(XLSX.write(taagerCatalogBook, { type: "buffer", bookType: "xlsx" }));
const taagerFallbackResult = resolveMissedOrders([
  { ...missedA, sku: null, qty: null, productName: "TAAGER-SKU-1" },
], {}, taagerCatalog);
assert.strictEqual(taagerFallbackResult.resolved.length, 0, "non-obvious missed product should not inherit catalog quantity > 1 automatically");
assert.strictEqual(taagerFallbackResult.skippedOrders.length, 1);
assert.strictEqual(taagerFallbackResult.skippedOrders[0].reason, "quantity_inference_requires_manual_review");
assert.strictEqual(taagerFallbackResult.skippedOrders[0].sku, "TAAGER-SKU-1");
assert.strictEqual(extractSkuFromText("SA030109RTB199-منظف-standard-man-"), "SA030109RTB199");
assert.strictEqual(extractSkuFromText("SA050301IA0099_foo"), "SA050301IA0099");
const tierCatalogHeader = Array(19).fill("");
tierCatalogHeader[16] = "المنتجات";
tierCatalogHeader[17] = "الكميات";
tierCatalogHeader[18] = "الأسعار";
const tierCatalogSheet = XLSX.utils.aoa_to_sheet([
  tierCatalogHeader,
  [...Array(16).fill(""), "SA030109RTB199", "2", "130"],
  [...Array(16).fill(""), "SA030109RTB199", "2", "130"],
  [...Array(16).fill(""), "SA030109RTB199", "0", "130"],
  [...Array(16).fill(""), "SA030109RTB199", "1", "80"],
]);
const tierCatalogBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(tierCatalogBook, tierCatalogSheet, "Orders");
const skuTierCatalog = buildTaagerProductCatalog(XLSX.write(tierCatalogBook, { type: "buffer", bookType: "xlsx" }));
const missedSkuTierResult = resolveMissedOrders([
  { ...missedA, sku: "SA030109RTB199", skuSource: "utm_campaign", qty: null, subtotal: null, productName: "Missed sheet product text" },
], {}, skuTierCatalog);
assert.strictEqual(missedSkuTierResult.resolved.length, 0, "missed SKU without subtotal or explicit bundle title should not infer multi-quantity");
assert.strictEqual(missedSkuTierResult.skippedOrders[0].reason, "quantity_inference_requires_manual_review");
const missedExplicitSkuTierResult = resolveMissedOrders([
  { ...missedA, sku: "SA030109RTB199", skuSource: "utm_campaign", qty: null, subtotal: null, productName: "2 pieces Missed sheet product text" },
], {}, skuTierCatalog);
assert.strictEqual(missedExplicitSkuTierResult.resolved.length, 1, "missed order with SKU in UTM and explicit bundle title should resolve from dominant SKU subtotal tier");
assert.strictEqual(missedExplicitSkuTierResult.resolved[0].qty, 2);
assert.strictEqual(missedExplicitSkuTierResult.resolved[0].subtotal, 130);
assert.strictEqual(
  missedExplicitSkuTierResult.resolved[0].productName,
  "2 pieces Missed sheet product text",
  "Taager SKU tier resolution must preserve the EasyOrders/missed product title for recovery modal matching",
);
assert.strictEqual(missedExplicitSkuTierResult.resolved[0].matchedProductName, "SA030109RTB199");
const realSkuTierRows = [{
  source: "real",
  normPhone: "500000011",
  sku: "SA030109RTB199",
  productName: "EasyOrders product text",
  qty: 1,
  unitPrice: 130,
  subtotal: 130,
}];
assert.strictEqual(repairOrderQuantitiesFromCatalog(realSkuTierRows, {}, skuTierCatalog), 1);
assert.strictEqual(realSkuTierRows[0].qty, 2, "SKU subtotal 130 should resolve to verified Taager qty 2");
assert.strictEqual(realSkuTierRows[0].subtotal, 130);
assert.strictEqual(realSkuTierRows[0].priceSource, "taager_sku_subtotal_tier");
assert(!realSkuTierRows[0].skuTierDecision.uncertain, "Taager qty 0 at subtotal 130 must not create an ambiguous qty 1 tier");
const unsafeQtyRows = [{
  source: "real",
  normPhone: "500000012",
  sku: "SA030109RTB199",
  productName: "Bad EasyOrders qty",
  qty: 97,
  unitPrice: 1,
  subtotal: 97,
}];
repairOrderQuantitiesFromCatalog(unsafeQtyRows, {}, skuTierCatalog);
assert.strictEqual(unsafeQtyRows[0].manualReview, true, "qty above 12 should be blocked before upload");
assert.strictEqual(unsafeQtyRows[0].reason, "quantity_above_safe_limit");
const productPrimaryCatalog = {
  "Matched Product": {
    sku: "SKU-FROM-PRODUCT",
    productName: "Matched Product",
    minQty: 1,
    prices: { 1: 99 },
    qtyCounts: { 1: 4 },
    source: "easyorders",
  },
};
const productPrimaryResult = resolveMissedOrders([
  { ...missedA, skuFromUtm: "", productName: "[ Matched Product ]" },
], productPrimaryCatalog, {});
assert.strictEqual(productPrimaryResult.resolved.length, 1, "missed product text should resolve SKU from real EasyOrders product name");
assert.strictEqual(productPrimaryResult.resolved[0].sku, "SKU-FROM-PRODUCT");
const trustedProductName = "عرض 2 حبه من لعبة الكرة الطائرة السحرية";
const trustedMissedResult = resolveMissedOrders([
  { ...missedA, skuFromUtm: "", productName: trustedProductName },
], {}, {}, {
  "persisted:SA050301IA0099": {
    sku: "SA050301IA0099",
    productName: trustedProductName,
    productNames: [trustedProductName],
    minQty: 2,
    maxQty: 4,
    prices: { 2: 130, 4: 170 },
    qtyCounts: { 2: 6, 4: 1 },
    totalSamples: 7,
    dominantQty: 2,
    dominantQtyCount: 6,
    dominantQtyConfidence: 6 / 7,
    source: "persistent_catalog",
  },
});
assert.strictEqual(trustedMissedResult.resolved.length, 1, "missed product should resolve from persisted product-name catalog when current sheets have no match");
assert.strictEqual(trustedMissedResult.resolved[0].sku, "SA050301IA0099");
assert.strictEqual(trustedMissedResult.resolved[0].qty, 2);
assert.strictEqual(trustedMissedResult.resolved[0].subtotal, 130);
assert.strictEqual(trustedMissedResult.resolved[0].catalogSource, "persistent_catalog");
const utmFallbackCatalog = {
  "SKU-FROM-UTM": {
    sku: "SKU-FROM-UTM",
    productName: "SKU-FROM-UTM",
    minQty: 1,
    prices: { 1: 88 },
    qtyCounts: { 1: 4 },
    source: "taager",
  },
};
const utmFallbackResult = resolveMissedOrders([
  { ...missedA, skuFromUtm: "SKU-FROM-UTM", productName: "No catalog name match" },
], {}, utmFallbackCatalog);
assert.strictEqual(utmFallbackResult.resolved.length, 1, "UTM SKU should be fallback when product-name match is unavailable");
assert.strictEqual(utmFallbackResult.resolved[0].sku, "SKU-FROM-UTM");
assert.strictEqual(
  utmFallbackResult.resolved[0].productName,
  "No catalog name match",
  "UTM/Taager fallback must not replace the EasyOrders modal product title with the SKU",
);
const skuConflictResult = resolveMissedOrders([
  { ...missedA, skuFromUtm: "OTHER-SKU", productName: "Matched Product" },
], productPrimaryCatalog, {});
assert.strictEqual(skuConflictResult.resolved.length, 1, "product-name SKU should win over conflicting UTM SKU");
assert.strictEqual(skuConflictResult.resolved[0].sku, "SKU-FROM-PRODUCT");
assert.strictEqual(skuConflictResult.resolved[0].skuSource, "product_name");
const explicitBundleCatalog = {
  "2 pieces TAAGER-SKU-1": {
    sku: "TAAGER-SKU-1",
    productName: "2 pieces TAAGER-SKU-1",
    minQty: 2,
    prices: { 2: 300 },
    source: "easyorders",
  },
};
const explicitCatalogResult = resolveMissedOrders([
  { ...missedA, sku: null, qty: null, productName: "2 pieces TAAGER-SKU-1" },
], explicitBundleCatalog, {});
assert.strictEqual(explicitCatalogResult.resolved.length, 1, "explicit bundle missed product can resolve from catalog");
assert.strictEqual(explicitCatalogResult.resolved[0].sku, "TAAGER-SKU-1");
assert.strictEqual(explicitCatalogResult.resolved[0].qty, 2);
assert.strictEqual(explicitCatalogResult.resolved[0].subtotal, 300);
assert.strictEqual(explicitCatalogResult.resolved[0].catalogSource, "easyorders");
const missingEverywhereResult = resolveMissedOrders([
  { ...missedA, sku: null, qty: null, productName: "Unknown Product" },
], {}, taagerCatalog);
const realPackageHeader = [
  "ID", "Status", "FullName", "Phone", "City", "Address", "Total Cost", "Product Cost", "Shipping Cost", "Coupon",
  "Coupon Discount", "Product Name", "Variant", "Quantity", "SKU", "Item Price", "CreatedAt", "Extra Data",
  "Extra Data2", "Alt Phone", "Note", "Ref", "Utm Source", "Utm Campaign", "Payment Method", "Payment Status",
  "Funnel ID", "Order ID", "Referral Code", "External Order ID",
];
const realPackageSheet = XLSX.utils.aoa_to_sheet([
  realPackageHeader,
  [
    1, "pending", "Bundle Customer", "0537583140", "منطقة مكة المكرمة", "Address", 90.5, 62.5, 28, "",
    0, "2 حبه مكنسة كهربائية لاسلكية محمولة باليد 3*1 ببطارية 1200 مللي أمبير بضمان عام", "", 1,
    "SA050106WA0099", 62.5, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-BUNDLE", "", "",
  ],
  [
    2, "pending", "Bundle Customer 2", "0537583141", "منطقة مكة المكرمة", "Address", 153, 125, 28, "",
    0, "2 حبه مكنسة كهربائية لاسلكية محمولة باليد 3*1 ببطارية 1200 مللي أمبير بضمان عام", "", 2,
    "SA050106WA0099", 62.5, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-BUNDLE-2", "", "",
  ],
  [
    3, "pending", "Bundle Customer 3", "0537583142", "منطقة مكة المكرمة", "Address", 153, 125, 28, "",
    0, "2 حبه مكنسة كهربائية لاسلكية محمولة باليد 3*1 ببطارية 1200 مللي أمبير بضمان عام", "", 2,
    "SA050106WA0099", 62.5, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-BUNDLE-3", "", "",
  ],
  [
    4, "pending", "Bundle Customer 4", "0537583143", "منطقة مكة المكرمة", "Address", 153, 125, 28, "",
    0, "2 حبه مكنسة كهربائية لاسلكية محمولة باليد 3*1 ببطارية 1200 مللي أمبير بضمان عام", "", 2,
    "SA050106WA0099", 62.5, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-BUNDLE-4", "", "",
  ],
]);
const realPackageBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(realPackageBook, realPackageSheet, "Sheet1");
const realPackageRows = parseRealOrders(
  XLSX.write(realPackageBook, { type: "buffer", bookType: "xlsx" }),
  new Date(2026, 6, 1),
  new Date(2026, 6, 19),
);
assert.strictEqual(realPackageRows.length, 4);
const repairedPackageRow = realPackageRows.find((row) => row.orderId === "EO-BUNDLE");
assert.strictEqual(repairedPackageRow.qty, 1, "SKU/product title/history alone must not repair exported quantity");
assert.strictEqual(repairedPackageRow.unitPrice, 62.5);
assert.strictEqual(repairedPackageRow.subtotal, 62.5);
assert.strictEqual(repairedPackageRow.quantityRepair, undefined);
const cameraProductName = "\u0643\u0627\u0645\u064a\u0631\u0627 \u0639\u064a\u0646 \u0627\u0644\u0635\u0642\u0631 \u0627\u0644\u0634\u0645\u0633\u064a\u0629 4G - \u062a\u0639\u0645\u0644 \u0628\u062f\u0648\u0646 \u0643\u0647\u0631\u0628\u0627\u0621 | \u0634\u0631\u064a\u062d\u0629 \u0627\u062a\u0635\u0627\u0644 + \u0648\u0627\u064a \u0641\u0627\u064a + \u0631\u0624\u064a\u0629 \u0644\u064a\u0644\u064a\u0629 | \u0636\u0645\u0627\u0646 \u0633\u0646\u0629";
const cameraHistorySheet = XLSX.utils.aoa_to_sheet([
  realPackageHeader,
  [1, "pending", "Camera Customer", "0537583190", "Riyadh", "Address", 277, 249, 28, "", 0, cameraProductName, "", 1, "CAM-4G", 249, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-CAM", "", ""],
  [2, "pending", "Camera Customer 2", "0537583191", "Riyadh", "Address", 775, 747, 28, "", 0, cameraProductName, "", 3, "CAM-4G", 249, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-CAM-2", "", ""],
  [3, "pending", "Camera Customer 3", "0537583192", "Riyadh", "Address", 775, 747, 28, "", 0, cameraProductName, "", 3, "CAM-4G", 249, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-CAM-3", "", ""],
  [4, "pending", "Camera Customer 4", "0537583193", "Riyadh", "Address", 775, 747, 28, "", 0, cameraProductName, "", 3, "CAM-4G", 249, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-CAM-4", "", ""],
]);
const cameraHistoryBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(cameraHistoryBook, cameraHistorySheet, "Sheet1");
const cameraHistoryRows = parseRealOrders(
  XLSX.write(cameraHistoryBook, { type: "buffer", bookType: "xlsx" }),
  new Date(2026, 6, 1),
  new Date(2026, 6, 19),
);
const cameraQtyOneRow = cameraHistoryRows.find((row) => row.orderId === "EO-CAM");
assert.strictEqual(cameraQtyOneRow.qty, 1, "non-obvious camera title should not be repaired to dominant qty 3 from history");
assert.strictEqual(cameraQtyOneRow.subtotal, 249);
assert.strictEqual(cameraQtyOneRow.quantityRepairSkipped, undefined);
const bundleTierSheet = XLSX.utils.aoa_to_sheet([
  realPackageHeader,
  [1, "pending", "Bundle Tier Customer", "0537583290", "Riyadh", "Address", 198, 170, 28, "", 0, "عرض 2 حبه من لعبة الكرة الطائرة السحرية", "", 4, "SA050301IA0099", 65, "2026-07-18", "", "", "", "", "", "", "", "cod", "", "", "EO-BUNDLE-TIER", "", ""],
]);
const bundleTierBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(bundleTierBook, bundleTierSheet, "Sheet1");
const bundleTierRows = parseRealOrders(
  XLSX.write(bundleTierBook, { type: "buffer", bookType: "xlsx" }),
  new Date(2026, 6, 1),
  new Date(2026, 6, 19),
);
assert.strictEqual(bundleTierRows[0].qty, 4);
assert.strictEqual(bundleTierRows[0].subtotal, 170, "real EasyOrders rows must trust Product Cost instead of multiplying Item Price by Quantity");
assert.strictEqual(bundleTierRows[0].unitPrice, 42.5);
assert.strictEqual(bundleTierRows[0].priceSource, "easyorders_export_product_cost");
const taagerQuantityFallback = {
  "TAAGER-QTY-SKU": {
    sku: "TAAGER-QTY-SKU",
    productName: "TAAGER-QTY-SKU",
    dominantQty: 2,
    dominantQtyCount: 5,
    dominantQtyConfidence: 1,
    totalSamples: 5,
    maxQty: 2,
    prices: { 2: 120 },
    source: "taager",
  },
};
const taagerQuantityRepairRows = [{
  source: "real",
  normPhone: "500000010",
  sku: "TAAGER-QTY-SKU",
  productName: "New EasyOrders Product Name",
  qty: 1,
  unitPrice: 60,
  subtotal: 60,
}];
assert.strictEqual(repairOrderQuantitiesFromCatalog(taagerQuantityRepairRows, {}, taagerQuantityFallback), 0);
assert.strictEqual(taagerQuantityRepairRows[0].qty, 1, "Taager SKU history should not repair non-obvious quantity automatically");
assert.strictEqual(taagerQuantityRepairRows[0].subtotal, 60);
assert.strictEqual(taagerQuantityRepairRows[0].manualReview, true, "subtotal mismatch should route to uncertain instead of repairing from history");
assert.strictEqual(taagerQuantityRepairRows[0].reason, "subtotal_not_in_sku_tiers");
const explicitTaagerQuantityRepairRows = [{
  ...taagerQuantityRepairRows[0],
  productName: "2 pieces New EasyOrders Product Name",
  quantityRepairSkipped: null,
}];
assert.strictEqual(repairOrderQuantitiesFromCatalog(explicitTaagerQuantityRepairRows, {}, taagerQuantityFallback), 0);
assert.strictEqual(explicitTaagerQuantityRepairRows[0].manualReview, true, "explicit title still cannot repair when subtotal does not match a verified tier");
assert.strictEqual(explicitTaagerQuantityRepairRows[0].reason, "subtotal_not_in_sku_tiers");
const taagerExistingHeader = Array(23).fill("");
taagerExistingHeader[0] = "Order Number";
taagerExistingHeader[2] = "Status";
taagerExistingHeader[3] = "Created At";
taagerExistingHeader[5] = "Phone Number";
taagerExistingHeader[16] = "Products";
taagerExistingHeader[22] = "Order ID on your store";
const taagerExistingSheet = XLSX.utils.aoa_to_sheet([
  taagerExistingHeader,
  ["T-1", "", "", "", "", "966500000003", "", "", "", "", "", "", "", "", "", "", "OLD-SKU"],
]);
const taagerExistingBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(taagerExistingBook, taagerExistingSheet, "Orders");
const existingKeys = parseTaagerOrderKeys(XLSX.write(taagerExistingBook, { type: "buffer", bookType: "xlsx" }));
const dedupeResult = mergeAndDeduplicate([
  { source: "real", normPhone: "500000003", sku: "OLD-SKU", uploadGroupKey: "order-old" },
  { source: "real", normPhone: "500000003", sku: "NEW-SKU", uploadGroupKey: "order-new" },
], [], existingKeys);
assert.strictEqual(dedupeResult.stats.realInTaager, 1, "same phone+same SKU should be treated as already in Taager");
assert.strictEqual(dedupeResult.stats.realNew, 1, "same phone+different SKU from a separate source order must still be uploaded");
assert.strictEqual(dedupeResult.orders[0].sku, "NEW-SKU");
const taagerDeliveredSheet = XLSX.utils.aoa_to_sheet([
  taagerExistingHeader,
  ["T-2", "", "\u062a\u0645 \u0627\u0644\u062a\u0648\u0635\u064a\u0644", "2026-07-06", "", "966500000007", "", "", "", "", "", "", "", "", "", "", "DELIVERED-SKU", "", "", "", "", "", "EO-OLD"],
]);
const taagerDeliveredBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(taagerDeliveredBook, taagerDeliveredSheet, "Orders");
const deliveredOnlyKeys = parseTaagerOrderKeys(XLSX.write(taagerDeliveredBook, { type: "buffer", bookType: "xlsx" }));
assert.strictEqual(deliveredOnlyKeys.size, 0, "delivered-only Taager phone+SKU should not block a fresh repeat order");
assert.strictEqual(deliveredOnlyKeys.taagerDeliveredOnlyPhoneSkuKeys, 1);
const deliveredSameSourceResult = mergeAndDeduplicate([
  { source: "real", normPhone: "500000007", sku: "DELIVERED-SKU", orderId: "EO-OLD", createdAt: "2026-07-06", uploadGroupKey: "same-delivered-order" },
], [], deliveredOnlyKeys);
assert.strictEqual(deliveredSameSourceResult.stats.realInTaager, 1, "same EasyOrders source order ID should stay skipped even if Taager status is delivered");
assert.strictEqual(deliveredSameSourceResult.orders.length, 0);
const deliveredSameDayResult = mergeAndDeduplicate([
  { source: "real", normPhone: "500000007", sku: "DELIVERED-SKU", createdAt: "2026-07-06", uploadGroupKey: "same-delivered-day" },
], [], deliveredOnlyKeys);
assert.strictEqual(deliveredSameDayResult.stats.realInTaager, 1, "same phone+SKU and same created day should stay skipped even if Taager status is delivered");
const deliveredFreshRepeatResult = mergeAndDeduplicate([
  { source: "real", normPhone: "500000007", sku: "DELIVERED-SKU", orderId: "EO-NEW", createdAt: "2026-07-07", uploadGroupKey: "new-order-after-delivery" },
], [], deliveredOnlyKeys);
assert.strictEqual(deliveredFreshRepeatResult.stats.realNew, 1, "delivered phone+SKU repeat should be allowed only when source identity/date proves it is a different order");
function assertRepeatAllowedStatus(status, bucketName) {
  const sheet = XLSX.utils.aoa_to_sheet([
    taagerExistingHeader,
    [`T-${bucketName}`, "", status, "2026-07-08", "", "966500000010", "", "", "", "", "", "", "", "", "", "", `${bucketName}-SKU`, "", "", "", "", "", `EO-${bucketName}-OLD`],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Orders");
  const repeatAllowedKeys = parseTaagerOrderKeys(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  assert.strictEqual(repeatAllowedKeys.size, 0, `${bucketName} phone+SKU should not block a proven fresh repeat order`);
  assert.strictEqual(repeatAllowedKeys.taagerRepeatAllowedOnlyPhoneSkuKeys, 1);
  const sameDayResult = mergeAndDeduplicate([
    { source: "real", normPhone: "500000010", sku: `${bucketName}-SKU`, createdAt: "2026-07-08", uploadGroupKey: `${bucketName}-same-day` },
  ], [], repeatAllowedKeys);
  assert.strictEqual(sameDayResult.stats.realInTaager, 1, `${bucketName} same phone+SKU and same created day should stay skipped`);
  const freshResult = mergeAndDeduplicate([
    { source: "real", normPhone: "500000010", sku: `${bucketName}-SKU`, orderId: `EO-${bucketName}-NEW`, createdAt: "2026-07-09", uploadGroupKey: `${bucketName}-new-day` },
  ], [], repeatAllowedKeys);
  assert.strictEqual(freshResult.stats.realNew, 1, `${bucketName} phone+SKU repeat should be allowed for a proven new source/date`);
}
assertRepeatAllowedStatus("\u0641\u0634\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645", "failed-delivery");
assertRepeatAllowedStatus("\u0637\u0644\u0628 \u0645\u0644\u063a\u064a \u0628\u0648\u0627\u0633\u0637\u062a\u0643", "canceled-by-you");
const conflictingSourceIdResult = mergeAndDeduplicate([
  { source: "real", normPhone: "500000008", sku: "SKU-CONFLICT", orderId: "EO-CONFLICT", uploadGroupKey: "conflict-a" },
  { source: "real", normPhone: "500000009", sku: "SKU-CONFLICT", orderId: "EO-CONFLICT", uploadGroupKey: "conflict-b" },
], [], new Set());
assert.strictEqual(conflictingSourceIdResult.orders.length, 0, "same EasyOrders source ID with conflicting phone candidates must not be uploaded");
assert.strictEqual(conflictingSourceIdResult.skippedOrders[0].reason, "duplicate_easyorders_uuid_conflicting_phone");
const ambiguousPhonePreferenceResult = mergeAndDeduplicate([
  {
    source: "real",
    normPhone: "512345678",
    rawPhone: "5012345678",
    sku: "SKU-AMB",
    orderId: "EO-AMB",
    phoneAmbiguous: true,
    phoneAmbiguityGroupId: "real-amb-1",
    phoneCandidateIndex: 1,
    phoneCandidateCount: 2,
    phoneCorrection: "misplaced_domestic_zero",
    uploadGroupKey: "amb-preferred",
  },
  {
    source: "real",
    normPhone: "501234567",
    rawPhone: "5012345678",
    sku: "SKU-AMB",
    orderId: "EO-AMB",
    phoneAmbiguous: true,
    phoneAmbiguityGroupId: "real-amb-1",
    phoneCandidateIndex: 2,
    phoneCandidateCount: 2,
    phoneCorrection: "trailing_extra_digits",
    uploadGroupKey: "amb-trimmed",
  },
], [], new Set());
assert.strictEqual(ambiguousPhonePreferenceResult.orders.length, 1, "ambiguous misplaced-zero phones should process only the preferred correction");
assert.strictEqual(ambiguousPhonePreferenceResult.orders[0].normPhone, "512345678");
assert.strictEqual(ambiguousPhonePreferenceResult.skippedOrders[0].normalizedPhone, "501234567");
assert.strictEqual(ambiguousPhonePreferenceResult.skippedOrders[0].reason, "ambiguous_phone_alternative_unselected");
const groupedDedupeResult = mergeAndDeduplicate([
  { source: "real", normPhone: "500000004", sku: "SKU-A", productName: "Product A", qty: 1, unitPrice: 100, subtotal: 100, uploadGroupKey: "multi-1" },
  { source: "real", normPhone: "500000004", sku: "SKU-B", productName: "Product B", qty: 2, unitPrice: 75, subtotal: 150, uploadGroupKey: "multi-1" },
], [], new Set());
assert.strictEqual(groupedDedupeResult.stats.realNew, 2, "multi-product source order should separate for Taager bulk cart upload because grouped product cells are rejected");
assert.strictEqual(groupedDedupeResult.orders.length, 2);
const groupedWorkbook = XLSX.read(buildOutputExcel(groupedDedupeResult.orders), { type: "buffer" });
const groupedRows = XLSX.utils.sheet_to_json(groupedWorkbook.Sheets.Cart, { header: 1, defval: "" });
assert.strictEqual(groupedRows.length, 3, "multi-product cart upload should write separate Taager rows when the cart cannot parse grouped products");
assert.strictEqual(groupedRows[1][0], "SKU-A");
assert.strictEqual(groupedRows[2][0], "SKU-B");
assert.strictEqual(groupedRows[2][3], 2);
const repeatedSkuResult = mergeAndDeduplicate([
  { source: "real", normPhone: "500000006", sku: "SKU-D", productName: "Product D", qty: 1, unitPrice: 50, subtotal: 50, uploadGroupKey: "multi-repeat" },
  { source: "real", normPhone: "500000006", sku: "SKU-D", productName: "Product D", qty: 2, unitPrice: 50, subtotal: 100, uploadGroupKey: "multi-repeat" },
  { source: "real", normPhone: "500000006", sku: "SKU-E", productName: "Product E", qty: 1, unitPrice: 80, subtotal: 80, uploadGroupKey: "multi-repeat" },
], [], new Set());
assert.strictEqual(repeatedSkuResult.orders.length, 2, "same source order should upload one row per unique SKU");
assert.strictEqual(repeatedSkuResult.orders[0].sku, "SKU-D");
assert.strictEqual(repeatedSkuResult.orders[0].qty, 3, "duplicate SKU lines in one source order should merge quantity");
assert.strictEqual(repeatedSkuResult.orders[0].subtotal, 150);
const repeatedSkuWorkbook = XLSX.read(buildOutputExcel(repeatedSkuResult.orders), { type: "buffer" });
const repeatedSkuRows = XLSX.utils.sheet_to_json(repeatedSkuWorkbook.Sheets.Cart, { header: 1, defval: "" });
assert.strictEqual(repeatedSkuRows.length, 3, "duplicate SKU merge should prevent duplicate Taager rows for the same phone+SKU");
assert.strictEqual(repeatedSkuRows[1][0], "SKU-D");
assert.strictEqual(repeatedSkuRows[1][3], 3);
assert.strictEqual(repeatedSkuRows[2][0], "SKU-E");
const partialExisting = new Set(["966500000005|SKU-A"]);
const partialDedupeResult = mergeAndDeduplicate([
  { source: "real", normPhone: "966500000005", sku: "SKU-A", productName: "Product A", uploadGroupKey: "multi-partial" },
  { source: "real", normPhone: "966500000005", sku: "SKU-B", productName: "Product B", uploadGroupKey: "multi-partial" },
], [], partialExisting);
assert.strictEqual(partialDedupeResult.orders.length, 0, "partial existing grouped order should not create another shipping order");
assert.strictEqual(partialDedupeResult.skippedOrders[0].reason, "partial_order_already_in_taager");
assert.strictEqual(missingEverywhereResult.skippedOrders[0].reason, "missing_sku_for_missed_product");
const skippedWorkbook = XLSX.read(buildSkippedExcel(missingEverywhereResult.skippedOrders), { type: "buffer" });
const skippedRows = XLSX.utils.sheet_to_json(skippedWorkbook.Sheets["Uncertain Orders"], { header: 1, defval: "" });
assert.strictEqual(skippedRows[1][18], "missing_sku_for_missed_product");

const workbook = XLSX.read(buildMissingOrdersExcel([missedA, missedB]), { type: "buffer" });
assert.deepStrictEqual(workbook.SheetNames, ["Missing Orders"]);
const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Missing Orders"], { header: 1, defval: "" });
assert.deepStrictEqual(rows[0], [
  "Customer Name", "Phone Number", "Phone Number 2", "Province", "Zone", "District",
  "Saudi National Address", "Note", "SKUs", "Product Names", "Prices", "Quantities",
]);
assert.strictEqual(rows.length, 2, "same EasyOrders missed submission should become one workbook row");
assert.strictEqual(rows[1][0], "Missing Customer");
assert.strictEqual(rows[1][1], "966500000002");
assert.strictEqual(rows[1][7], "District 1");
assert.strictEqual(rows[1][8], "MISS-1,MISS-2");
assert.strictEqual(rows[1][9], "", "SKU-backed upload should leave optional product names blank like Taager's template");
assert.strictEqual(rows[1][10], "100,250");
assert.strictEqual(rows[1][11], "1,2");

assert.strictEqual(SWITCH_TO_OLD_SELECTOR, "#switch-to-old-layout-btn");
assert.strictEqual(MISSING_ORDERS_TAB_SELECTOR, "#missing-orders");
assert.strictEqual(MISSING_ORDERS_UPLOAD_SELECTOR, "#upload-missing-orders-button");
assert(MISSING_ORDERS_ERROR_NOTICE_RE.test("\u0641\u0634\u0644 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641"));
assert(MISSING_ORDERS_ERROR_NOTICE_RE.test("\u062e\u0637\u0623: \u0627\u0644\u0645\u0644\u0641 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d"));
assert(MISSING_ORDERS_SUCCESS_NOTICE_RE.test("\u062a\u0645 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641"));
assert(MISSING_ORDERS_SUCCESS_NOTICE_RE.test("\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0628\u0646\u062c\u0627\u062d"));

const root = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
const runnerSource = fs.readFileSync(path.join(root, "src", "bot", "runner.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "src", "main", "preload.js"), "utf8");
const rendererAppSource = fs.readFileSync(path.join(root, "src", "renderer", "app.js"), "utf8");
const setupSource = fs.readFileSync(path.join(root, "src", "renderer", "pages", "setup.js"), "utf8");
assert(mainSource.includes('store.get("missingOrdersUploadEnabled", false)'), "feature must default OFF");
assert(mainSource.includes('ipcMain.handle("set-missing-orders-upload-enabled"'), "main process must persist the toggle");
assert(mainSource.includes("secondTaagerProfilePath"), "main process must pass a dedicated second Taager cart profile");
assert(mainSource.includes("pwd_second_taager_"), "second Taager cart password must use a separate encrypted store key");
assert(preloadSource.includes("setMissingOrdersUploadEnabled"), "preload must expose the toggle API");
assert(setupSource.includes('id="sv3-btn-missing-orders"'), "setup must render the toggle");
assert(setupSource.includes('id="sv3-missed-orders-destination"'), "account form must render the missed destination selector");
assert(setupSource.includes('id="sv3-second-taager-panel"'), "account form must render the second Taager cart configuration");
assert(runnerSource.includes("splitOrdersByMissedDestination"), "runner must use the enum-based destination split");
assert(runnerSource.includes('legacyEnabled: config.missingOrdersUploadEnabled === true'), "runner may receive the legacy toggle but blank destinations must still normalize to cart");
assert(runnerSource.includes("runSecondTaagerCartUpload"), "runner must support a second Taager cart destination");
assert(runnerSource.includes('mode: "second-taager-cart-upload"'), "runner must launch a Taager-only worker for second cart uploads");
assert(runnerSource.includes("const defaultMaxCycles = Math.max(12, list.length)"), "verified cart upload should scale reconciliation cycles to the pending order count by default");
assert(runnerSource.includes("cartVerificationNoProgressCycles"), "verified cart upload should stop on repeated no-progress cycles instead of pretending completion");
assert(runnerSource.includes("cartVerificationBatchSize"), "verified cart upload should submit controlled chunks instead of the whole pending list");
assert(runnerSource.includes("noProgressCycles >= maxNoProgressCycles"), "verified cart upload should have a no-progress brake");
assert(runnerSource.includes("hardFailed: true"), "Taager-declared failed rows should be marked as hard failures inside the current run");
assert(runnerSource.includes("hardFailed: false"), "export-unconfirmed rows should not be treated as Taager hard failures inside the current run");
assert(runnerSource.includes("cartVerificationKeys"), "verification should check every SKU key inside a grouped cart order");
assert(runnerSource.includes("await phase5_uploadToTaagerVerified(page, primaryCartOrders"), "normal cart upload should still receive raw destination rows because Taager rejects grouped product cells");
assert(!runnerSource.includes("await phase5_uploadToTaagerVerified(page, buildGroupedCartOrders"), "normal cart upload must not group multi-product rows");
assert(rendererAppSource.includes("function confirmedAnalyticsRows"), "analytics save must explicitly select confirmed Taager rows");
assert(rendererAppSource.includes("orders:          confirmedRows"), "analytics/operations stored order rows must be confirmed-only");
assert(rendererAppSource.includes("analyticsOrdersSource: \"taager-confirmed\""), "analytics save must mark confirmed-only runs");
assert(rendererAppSource.includes("buffer:          null"), "analytics save must not allow upload workbook fallback for confirmed-only runs");
assert(mainSource.includes("confirmedOnlyAnalytics") && mainSource.includes("analyticsOrdersSource === \"taager-confirmed\""), "main process must not parse attempted workbook rows for confirmed-only analytics runs");

console.log("Missing Orders feature verification passed.");
