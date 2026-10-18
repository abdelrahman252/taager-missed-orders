"use strict";

const assert = require("assert");
const { mergeTaagerOrderKeySets } = require("../src/bot/taager-order-key-set");

const base = new Set(["966555000111|SKU-A"]);
base.taagerOrderCount = 3;
base.taagerStatusByKey = new Map([["966555000111|SKU-A", [{ status: "Pending", repeatAllowed: false }]]]);
base.taagerBlockingPhones = new Set(["966555000111"]);
base.taagerPhones = new Set(["966555000111"]);
base.taagerDeliveredOnlyPhones = ["966555000333"];
base.taagerSourceOrderIds = new Set(["source-a"]);

const supplemental = new Set(["966555000222|SKU-B"]);
supplemental.taagerOrderCount = 1;
supplemental.taagerStatusByKey = new Map([["966555000222|SKU-B", [{ status: "Under Review", repeatAllowed: false }]]]);
supplemental.taagerBlockingPhones = new Set(["966555000222"]);
supplemental.taagerPhones = new Set(["966555000222"]);
supplemental.taagerRepeatAllowedOnlyPhones = ["966555000444"];
supplemental.taagerSourceOrderIds = new Set(["source-b"]);

const merged = mergeTaagerOrderKeySets(base, supplemental);
assert.deepStrictEqual([...merged].sort(), ["966555000111|SKU-A", "966555000222|SKU-B"]);
assert.strictEqual(merged.taagerOrderCount, 3, "selected-range reporting count is preserved");
assert.deepStrictEqual([...merged.taagerBlockingPhones].sort(), ["966555000111", "966555000222"]);
assert.deepStrictEqual([...merged.taagerPhones].sort(), ["966555000111", "966555000222"]);
assert.deepStrictEqual([...merged.taagerDeliveredOnlyPhones], ["966555000333"]);
assert.deepStrictEqual([...merged.taagerRepeatAllowedOnlyPhones], ["966555000444"]);
assert.deepStrictEqual([...merged.taagerSourceOrderIds].sort(), ["source-a", "source-b"]);
assert.deepStrictEqual(merged.taagerStatusByKey.get("966555000222|SKU-B"), [{ status: "Under Review", repeatAllowed: false }]);

console.log("Taager order key set merge tests passed.");
