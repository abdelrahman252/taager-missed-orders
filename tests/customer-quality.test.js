"use strict";

const assert = require("assert");
const XLSX = require("xlsx");

process.env.BOT_CONFIG = JSON.stringify({ taagerCountry: "sa" });

const {
  assessCustomerName,
  assessCustomerOrder,
  assessCustomerPhone,
} = require("../src/bot/customer-quality");
const {
  buildProductCatalog,
  parseMissedOrders,
  parseRealOrders,
  resolveMissedOrders,
} = require("../src/bot/parser");

assert.strictEqual(assessCustomerPhone("0555555555", "555555555").ok, false);
assert(assessCustomerName("sfhsdfasdfsdf").issues.includes("latin_keyboard_smash"));
assert(assessCustomerName("منبتسيابنتسيابمش").issues.includes("long_single_token_low_variety"));
assert.strictEqual(assessCustomerOrder({ name: "أحمد محمد علي", rawPhone: "0536679002", normPhone: "536679002" }).ok, true);
assert.strictEqual(assessCustomerOrder({ name: "Test User", rawPhone: "0536679002", normPhone: "536679002" }).ok, false);

const realHeader = [
  "ID", "Status", "FullName", "Phone", "City", "Address", "Total Cost", "Product Cost", "Shipping Cost", "Coupon",
  "Coupon Discount", "Product Name", "Variant", "Quantity", "SKU", "Item Price", "CreatedAt", "Extra Data",
  "Extra Data2", "Alt Phone", "Note", "Ref", "Utm Source", "Utm Campaign", "Payment Method", "Payment Status",
  "Funnel ID", "Order ID", "Referral Code", "External Order ID",
];
const realSheet = XLSX.utils.aoa_to_sheet([
  realHeader,
  [1, "pending", "sfhsdfasdfsdf", "0536679002", "Riyadh", "Address", 128, 100, 28, "", 0, "Valid Product", "", 1, "VALID-SKU", 100, "2026-08-12", "", "", "", "", "", "", "", "cod", "", "", "EO-FAKE-NAME", "", ""],
  [2, "pending", "Valid Customer", "0555555555", "Riyadh", "Address", 128, 100, 28, "", 0, "Valid Product", "", 1, "VALID-SKU", 100, "2026-08-12", "", "", "", "", "", "", "", "cod", "", "", "EO-FAKE-PHONE", "", ""],
  [3, "pending", "Valid Customer", "0536679002", "Riyadh", "Address", 128, 100, 28, "", 0, "Valid Product", "", 1, "VALID-SKU", 100, "2026-08-12", "", "", "", "", "", "", "", "cod", "", "", "EO-VALID", "", ""],
]);
const realBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(realBook, realSheet, "Orders");
const realRows = parseRealOrders(
  XLSX.write(realBook, { type: "buffer", bookType: "xlsx" }),
  new Date(2026, 7, 1),
  new Date(2026, 7, 20),
);
assert.strictEqual(realRows.length, 3);
assert.strictEqual(realRows.find((row) => row.orderId === "EO-FAKE-NAME").manualReview, true);
assert.strictEqual(realRows.find((row) => row.orderId === "EO-FAKE-PHONE").reason, "invalid_customer_data");
assert.strictEqual(realRows.find((row) => row.orderId === "EO-VALID").manualReview, undefined);

const catalog = buildProductCatalog(realRows);
assert.strictEqual(catalog["Valid Product"].totalSamples, 1, "manual-review customer rows must not teach SKU/price history");

const missedHeader = ["Is Completed", "Created At", "Products", "Phone", "Full Name", "Government", "Address", "UTM Campaign"];
const missedSheet = XLSX.utils.aoa_to_sheet([
  missedHeader,
  ["false", "2026-08-12", "[Valid Product]", "0536679002", "منبتسيابنتسيابمش", "Riyadh", "Address", ""],
]);
const missedBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(missedBook, missedSheet, "Missed");
const missedParsed = parseMissedOrders(
  XLSX.write(missedBook, { type: "buffer", bookType: "xlsx" }),
  new Date(2026, 7, 1),
  new Date(2026, 7, 20),
);
assert.strictEqual(missedParsed.orders.length, 1);
const missedResolved = resolveMissedOrders(missedParsed.orders, catalog, {});
assert.strictEqual(missedResolved.resolved.length, 0);
assert.strictEqual(missedResolved.skippedOrders[0].reason, "invalid_customer_data");

console.log("Customer quality verification passed.");
