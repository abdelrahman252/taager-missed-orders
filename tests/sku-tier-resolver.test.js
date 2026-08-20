"use strict";

const assert = require("assert");

process.env.BOT_CONFIG = JSON.stringify({ taagerCountry: "sa" });

const {
  buildSkuTierProfiles,
  resolveSkuPriceTier,
} = require("../src/bot/parser");
const { resolveMonthlyTaagerExportRange, formatDataDay } = require("../src/bot/taager-date-range");

function profilesFor(taagerCatalog) {
  return buildSkuTierProfiles({}, taagerCatalog);
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
assert.strictEqual(weak.uncertain, true);
assert.strictEqual(weak.reason, "sku_tier_profile_too_weak");

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

const currentMonthRange = resolveMonthlyTaagerExportRange({ today: new Date(2026, 7, 20) });
assert.strictEqual(formatDataDay(currentMonthRange.exportDateFrom), "2026-07-30");
assert.strictEqual(formatDataDay(currentMonthRange.exportDateTo), "2026-08-20");
const previousMonthRange = resolveMonthlyTaagerExportRange({ today: new Date(2026, 8, 1) });
assert.strictEqual(formatDataDay(previousMonthRange.exportDateFrom), "2026-07-30");
assert.strictEqual(formatDataDay(previousMonthRange.exportDateTo), "2026-08-31");

console.log("SKU tier resolver verification passed.");
