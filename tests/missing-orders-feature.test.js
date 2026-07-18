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
  resolveMissedOrders,
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
assert.strictEqual(taagerFallbackResult.resolved.length, 1, "missed product should resolve from Taager fallback catalog");
assert.strictEqual(taagerFallbackResult.resolved[0].sku, "TAAGER-SKU-1");
assert.strictEqual(taagerFallbackResult.resolved[0].qty, 2);
assert.strictEqual(taagerFallbackResult.resolved[0].subtotal, 300);
assert.strictEqual(taagerFallbackResult.resolved[0].catalogSource, "taager");
const missingEverywhereResult = resolveMissedOrders([
  { ...missedA, sku: null, qty: null, productName: "Unknown Product" },
], {}, taagerCatalog);
const taagerExistingHeader = Array(19).fill("");
taagerExistingHeader[0] = "Order Number";
taagerExistingHeader[5] = "Phone Number";
taagerExistingHeader[16] = "Products";
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
const partialExisting = new Set(["966500000005|SKU-A"]);
const partialDedupeResult = mergeAndDeduplicate([
  { source: "real", normPhone: "966500000005", sku: "SKU-A", productName: "Product A", uploadGroupKey: "multi-partial" },
  { source: "real", normPhone: "966500000005", sku: "SKU-B", productName: "Product B", uploadGroupKey: "multi-partial" },
], [], partialExisting);
assert.strictEqual(partialDedupeResult.orders.length, 0, "partial existing grouped order should not create another shipping order");
assert.strictEqual(partialDedupeResult.skippedOrders[0].reason, "partial_order_already_in_taager");
assert.strictEqual(missingEverywhereResult.skippedOrders[0].reason, "product_not_in_easyorders_or_taager");
const skippedWorkbook = XLSX.read(buildSkippedExcel(missingEverywhereResult.skippedOrders), { type: "buffer" });
const skippedRows = XLSX.utils.sheet_to_json(skippedWorkbook.Sheets["Warnings & Skipped"], { header: 1, defval: "" });
assert.strictEqual(skippedRows[1][10], "product_not_in_easyorders_or_taager");
assert.strictEqual(skippedRows[1][11], "المنتج غير موجود في شيت EasyOrders أو شيت Taager");

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
assert(!runnerSource.includes("buildGroupedCartOrders"), "cart upload should not group multi-product rows because Taager rejects grouped product cells");
assert(rendererAppSource.includes("function confirmedAnalyticsRows"), "analytics save must explicitly select confirmed Taager rows");
assert(rendererAppSource.includes("orders:          confirmedRows"), "analytics/operations stored order rows must be confirmed-only");
assert(rendererAppSource.includes("analyticsOrdersSource: \"taager-confirmed\""), "analytics save must mark confirmed-only runs");
assert(rendererAppSource.includes("buffer:          null"), "analytics save must not allow upload workbook fallback for confirmed-only runs");
assert(mainSource.includes("confirmedOnlyAnalytics") && mainSource.includes("analyticsOrdersSource === \"taager-confirmed\""), "main process must not parse attempted workbook rows for confirmed-only analytics runs");

console.log("Missing Orders feature verification passed.");
