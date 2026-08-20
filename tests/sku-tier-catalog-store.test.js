"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildCatalogScope,
  catalogPathForScope,
  loadTrustedSkuTierCatalog,
  saveTrustedSkuTierCatalog,
  trustedCatalogStats,
  trustedCatalogToParserCatalog,
  updateTrustedSkuTierCatalog,
} = require("../src/bot/sku-tier-catalog-store");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "taager-sku-catalog-test-"));

const scope = buildCatalogScope({
  easyEmail: "seller@example.com",
  easyStore: "velura1",
  taagerEmail: "taager@example.com",
  taagerCountry: "sa",
}, "sa");
const otherScope = buildCatalogScope({
  easyEmail: "seller@example.com",
  easyStore: "another-store",
  taagerEmail: "taager@example.com",
  taagerCountry: "sa",
}, "sa");

assert.notStrictEqual(catalogPathForScope(scope, { baseDir: tempRoot }), catalogPathForScope(otherScope, { baseDir: tempRoot }));

let catalog = loadTrustedSkuTierCatalog(scope, { baseDir: tempRoot });
catalog = updateTrustedSkuTierCatalog(catalog, {
  scope,
  now: "2026-08-20T12:00:00.000Z",
  easyordersCatalog: {
    "عرض 2 حبه من لعبة الكرة الطائرة السحرية": {
      sku: "SA050301IA0099",
      productName: "عرض 2 حبه من لعبة الكرة الطائرة السحرية",
      prices: { 2: 130 },
      qtyCounts: { 2: 4 },
      source: "easyorders",
    },
  },
  taagerCatalog: {
    "SA050301IA0099": {
      sku: "SA050301IA0099",
      productName: "SA050301IA0099",
      prices: { 4: 170 },
      qtyCounts: { 4: 3 },
      source: "taager",
    },
  },
});

const savedPath = saveTrustedSkuTierCatalog(catalog, scope, { baseDir: tempRoot });
assert.ok(fs.existsSync(savedPath));

const loaded = loadTrustedSkuTierCatalog(scope, { baseDir: tempRoot });
const stats = trustedCatalogStats(loaded);
assert.strictEqual(stats.entries, 1);
assert.strictEqual(stats.tiers, 2);
assert.strictEqual(stats.samples, 7);

const parserCatalog = trustedCatalogToParserCatalog(loaded);
const persistedEntry = Object.values(parserCatalog).find((entry) => entry.sku === "SA050301IA0099");
assert.ok(persistedEntry);
assert.strictEqual(persistedEntry.source, "persistent_catalog");
assert.strictEqual(persistedEntry.prices[2], 130);
assert.strictEqual(persistedEntry.prices[4], 170);
assert.strictEqual(persistedEntry.qtyCounts[2], 4);
assert.strictEqual(persistedEntry.qtyCounts[4], 3);
assert.ok((persistedEntry.productNames || []).includes("عرض 2 حبه من لعبة الكرة الطائرة السحرية"));

const isolated = trustedCatalogStats(loadTrustedSkuTierCatalog(otherScope, { baseDir: tempRoot }));
assert.strictEqual(isolated.entries, 0);

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log("Trusted SKU tier catalog store verification passed.");
