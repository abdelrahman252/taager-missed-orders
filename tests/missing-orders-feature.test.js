"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

process.env.BOT_CONFIG = JSON.stringify({ taagerCountry: "sa" });
delete require.cache[require.resolve("../src/bot/output")];

const { buildMissingOrdersExcel } = require("../src/bot/output");
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
assert.strictEqual(normalizeMissedOrdersDestination("", { legacyEnabled: true }), "legacy_missing_orders");
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
assert(runnerSource.includes("runSecondTaagerCartUpload"), "runner must support a second Taager cart destination");
assert(runnerSource.includes('mode: "second-taager-cart-upload"'), "runner must launch a Taager-only worker for second cart uploads");

console.log("Missing Orders feature verification passed.");
