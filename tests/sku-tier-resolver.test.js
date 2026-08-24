"use strict";

const assert = require("assert");

process.env.BOT_CONFIG = JSON.stringify({ taagerCountry: "sa" });

const {
  buildSkuTierProfiles,
  resolveSkuPriceTier,
} = require("../src/bot/parser");
const { resolveMonthlyTaagerExportRange, formatDataDay } = require("../src/bot/taager-date-range");

function profilesFor(taagerCatalog, trustedCatalog = {}) {
  return buildSkuTierProfiles({}, taagerCatalog, trustedCatalog);
}

const trustedProfiles = profilesFor({
  "SA030109RTB199": {
    sku: "SA030109RTB199",
    productName: "SA030109RTB199",
    prices: { 1: 80, 2: 130 },
    qtyCounts: { 1: 1, 2: 2 },
    source: "taager",
  },
});

const resolved = resolveSkuPriceTier({
  sku: "SA030109RTB199",
  easyQty: 1,
  subtotal: 130,
  sourceType: "real",
  tierProfiles: trustedProfiles,
});
assert.strictEqual(resolved.resolved, true);
assert.strictEqual(resolved.qty, 2);
assert.strictEqual(resolved.subtotal, 130);
assert.strictEqual(resolved.priceSource, "taager_sku_subtotal_tier");

const weakProfiles = profilesFor({
  "WEAK-SKU": {
    sku: "WEAK-SKU",
    productName: "WEAK-SKU",
    prices: { 1: 100, 2: 150 },
    qtyCounts: { 1: 1, 2: 1 },
    source: "taager",
  },
});
const weak = resolveSkuPriceTier({
  sku: "WEAK-SKU",
  easyQty: 1,
  subtotal: 150,
  sourceType: "real",
  tierProfiles: weakProfiles,
});
assert.strictEqual(weak.resolved, true);
assert.strictEqual(weak.qty, 2);
assert.strictEqual(weak.subtotal, 150);

const sharedSubtotalProfiles = profilesFor({
  "AMB-SKU": {
    sku: "AMB-SKU",
    productName: "AMB-SKU",
    prices: { 1: 130, 2: 130 },
    qtyCounts: { 1: 3, 2: 3 },
    source: "taager",
  },
});
const ambiguous = resolveSkuPriceTier({
  sku: "AMB-SKU",
  easyQty: 1,
  subtotal: 130,
  sourceType: "real",
  tierProfiles: sharedSubtotalProfiles,
});
assert.strictEqual(ambiguous.uncertain, true);
assert.strictEqual(ambiguous.reason, "ambiguous_sku_price_tier");

const noSubtotalNoBundle = resolveSkuPriceTier({
  sku: "SA030109RTB199",
  sourceType: "missed",
  tierProfiles: trustedProfiles,
  allowDominantTierWithoutSubtotal: true,
  productText: "Regular missed product title",
});
assert.strictEqual(noSubtotalNoBundle.uncertain, true);
assert.strictEqual(noSubtotalNoBundle.reason, "quantity_inference_requires_manual_review");

const noSubtotalBundle = resolveSkuPriceTier({
  sku: "SA030109RTB199",
  sourceType: "missed",
  tierProfiles: trustedProfiles,
  allowDominantTierWithoutSubtotal: true,
  productText: "2 pieces Regular missed product title",
});
assert.strictEqual(noSubtotalBundle.resolved, true);
assert.strictEqual(noSubtotalBundle.qty, 2);
assert.strictEqual(noSubtotalBundle.subtotal, 130);

const tooHigh = resolveSkuPriceTier({
  sku: "SA030109RTB199",
  easyQty: 97,
  subtotal: 130,
  sourceType: "real",
  tierProfiles: trustedProfiles,
});
assert.strictEqual(tooHigh.uncertain, true);
assert.strictEqual(tooHigh.reason, "quantity_above_safe_limit");

const persistedProfiles = profilesFor({}, {
  "persisted:SA050301IA0099": {
    sku: "SA050301IA0099",
    productName: "عرض 2 حبه من لعبة الكرة الطائرة السحرية",
    prices: { 2: 130, 4: 170 },
    qtyCounts: { 2: 4, 4: 3 },
    source: "persistent_catalog",
  },
});
const persistedResolved = resolveSkuPriceTier({
  sku: "SA050301IA0099",
  easyQty: 4,
  subtotal: 170,
  sourceType: "real",
  tierProfiles: persistedProfiles,
});
assert.strictEqual(persistedResolved.resolved, true);
assert.strictEqual(persistedResolved.qty, 4);
assert.strictEqual(persistedResolved.subtotal, 170);
assert.strictEqual(persistedResolved.priceSource, "persistent_catalog_sku_subtotal_tier");

const shippingIncludedProfiles = profilesFor({
  "SHIP-SKU": {
    sku: "SHIP-SKU",
    productName: "SHIP-SKU",
    prices: { 1: 199, 2: 260 },
    qtyCounts: { 1: 4, 2: 4 },
    source: "taager",
  },
});
const shippingIncluded = resolveSkuPriceTier({
  sku: "SHIP-SKU",
  easyQty: 1,
  subtotal: 227,
  sourceType: "real",
  tierProfiles: shippingIncludedProfiles,
});
assert.strictEqual(shippingIncluded.resolved, true);
assert.strictEqual(shippingIncluded.qty, 1);
assert.strictEqual(shippingIncluded.subtotal, 199);
assert.strictEqual(shippingIncluded.originalSubtotal, 227);
assert.strictEqual(shippingIncluded.shippingOffset, 28);
assert.strictEqual(shippingIncluded.reason, "sku_subtotal_tier_verified_after_shipping_removed");
assert.strictEqual(shippingIncluded.priceSource, "taager_sku_subtotal_tier_shipping_removed");

const shippingIncludedTwoPiece = resolveSkuPriceTier({
  sku: "SHIP-SKU",
  easyQty: 1,
  subtotal: 288,
  sourceType: "real",
  tierProfiles: shippingIncludedProfiles,
});
assert.strictEqual(shippingIncludedTwoPiece.resolved, true);
assert.strictEqual(shippingIncludedTwoPiece.qty, 2);
assert.strictEqual(shippingIncludedTwoPiece.subtotal, 260);
assert.strictEqual(shippingIncludedTwoPiece.originalSubtotal, 288);
assert.strictEqual(shippingIncludedTwoPiece.shippingOffset, 28);

const easyOrdersShippingIncludedProfiles = buildSkuTierProfiles({
  "EO-SHIP-SKU": {
    sku: "EO-SHIP-SKU",
    productName: "EO-SHIP-SKU",
    prices: { 1: 199 },
    qtyCounts: { 1: 331 },
    source: "easyorders",
  },
}, {}, {});
const easyOrdersShippingIncluded = resolveSkuPriceTier({
  sku: "EO-SHIP-SKU",
  easyQty: 1,
  subtotal: 227,
  unitPrice: 227,
  priceSource: "easyorders_export_product_cost",
  sourceType: "real",
  tierProfiles: easyOrdersShippingIncludedProfiles,
});
assert.strictEqual(easyOrdersShippingIncluded.resolved, true);
assert.strictEqual(easyOrdersShippingIncluded.qty, 1);
assert.strictEqual(easyOrdersShippingIncluded.subtotal, 199);
assert.strictEqual(easyOrdersShippingIncluded.originalSubtotal, 227);
assert.strictEqual(easyOrdersShippingIncluded.shippingOffset, 28);
assert.strictEqual(easyOrdersShippingIncluded.priceSource, "easyorders_sku_subtotal_tier_shipping_removed");

const changedPriceProfiles = profilesFor({
  "SA050301ULE499": {
    sku: "SA050301ULE499",
    productName: "طائرة الدرون A30",
    prices: { 1: 199 },
    priceCounts: { 1: { 199: 20, 260: 3 } },
    priceLatestSeen: {
      1: {
        199: "2026-08-15 09:00",
        260: "2026-08-24 13:30",
      },
    },
    qtyCounts: { 1: 23 },
    source: "taager",
  },
});
const changedPriceDominant = resolveSkuPriceTier({
  sku: "SA050301ULE499",
  sourceType: "missed",
  allowDominantTierWithoutSubtotal: true,
  allowSingleSampleDominance: true,
  productText: "طائرة الدرون A30",
  tierProfiles: changedPriceProfiles,
});
assert.strictEqual(changedPriceDominant.resolved, true);
assert.strictEqual(changedPriceDominant.qty, 1);
assert.strictEqual(changedPriceDominant.subtotal, 260);
assert.strictEqual(changedPriceDominant.priceSource, "taager_sku_subtotal_tier");

const changedPriceOverridesOldSubtotal = resolveSkuPriceTier({
  sku: "SA050301ULE499",
  easyQty: 1,
  subtotal: 227,
  shippingCost: 28,
  sourceType: "real",
  tierProfiles: changedPriceProfiles,
});
assert.strictEqual(changedPriceOverridesOldSubtotal.resolved, true);
assert.strictEqual(changedPriceOverridesOldSubtotal.qty, 1);
assert.strictEqual(changedPriceOverridesOldSubtotal.subtotal, 260);
assert.strictEqual(changedPriceOverridesOldSubtotal.originalSubtotal, 227);
assert.strictEqual(changedPriceOverridesOldSubtotal.reason, "sku_price_updated_to_latest_tier");
assert.strictEqual(changedPriceOverridesOldSubtotal.priceSource, "taager_sku_subtotal_tier_latest");

const currentMonthRange = resolveMonthlyTaagerExportRange({ today: new Date(2026, 7, 20) });
assert.strictEqual(formatDataDay(currentMonthRange.exportDateFrom), "2026-07-30");
assert.strictEqual(formatDataDay(currentMonthRange.exportDateTo), "2026-08-20");
const previousMonthRange = resolveMonthlyTaagerExportRange({ today: new Date(2026, 8, 1) });
assert.strictEqual(formatDataDay(previousMonthRange.exportDateFrom), "2026-07-30");
assert.strictEqual(formatDataDay(previousMonthRange.exportDateTo), "2026-09-01");
const earlyMonthRange = resolveMonthlyTaagerExportRange({ today: new Date(2026, 8, 5) });
assert.strictEqual(formatDataDay(earlyMonthRange.exportDateFrom), "2026-07-30");
assert.strictEqual(formatDataDay(earlyMonthRange.exportDateTo), "2026-09-05");
const afterEarlyMonthRange = resolveMonthlyTaagerExportRange({ today: new Date(2026, 8, 6) });
assert.strictEqual(formatDataDay(afterEarlyMonthRange.exportDateFrom), "2026-08-30");
assert.strictEqual(formatDataDay(afterEarlyMonthRange.exportDateTo), "2026-09-06");

console.log("SKU tier resolver verification passed.");
