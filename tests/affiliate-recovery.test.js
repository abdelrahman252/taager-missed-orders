"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

process.env.BOT_CONFIG = JSON.stringify({ taagerCountry: "sa" });

const {
  groupRealRecoveryCandidates,
  isSuspiciousQuantity,
  quantityFromReferencePrice,
  quantityFromSuspiciousReference,
  quantityEditDecision,
  resolveLiveTierItemsForCandidate,
  parseTaagerFailedOrders,
  classifyRecoveryAttempts,
  filterFailedRowsForAttempts,
  buildAffiliateRecoveryResult,
} = require("../src/bot/easy-orders-affiliate-recovery-data");

const existingKeys = new Set(["966500000001|SKU-OLD"]);
existingKeys.taagerOrderCount = 1;

const realRows = [
  {
    source: "real",
    uploadGroupKey: "real-1",
    orderId: "c599bb65-68c6-4de2-a4ab-28fc1a8dfbf8",
    normPhone: "966500000001",
    sku: "SKU-OLD",
    productName: "Old Product",
    qty: 1,
    unitPrice: 100,
    subtotal: 100,
    easyCreatedAt: "2026-07-19 01:00:00",
  },
  {
    source: "real",
    uploadGroupKey: "real-2",
    orderId: "b7c804a2-80fe-4ae9-961a-0fb2aec74e74",
    normPhone: "966500000002",
    sku: "SKU-NEW",
    productName: "New Product",
    qty: 2,
    unitPrice: 62.5,
    subtotal: 125,
    easyCreatedAt: "2026-07-19 02:00:00",
  },
];

const grouped = groupRealRecoveryCandidates(realRows, existingKeys, { country: "sa" });
assert.strictEqual(grouped.skippedAlready.length, 1, "existing phone+SKU should be skipped");
assert.strictEqual(grouped.attempted.length, 1, "missing phone+SKU should be attempted");
assert.strictEqual(grouped.attempted[0].easyOrderUuid, "b7c804a2-80fe-4ae9-961a-0fb2aec74e74");
assert.deepStrictEqual(grouped.attempted[0].keys, ["966500000002|SKU-NEW"]);

const bundleReference = {
  qty: 1,
  subtotal: 170,
  unitPrice: 170,
  priceOptions: [
    { qty: 1, subtotal: 170, unitPrice: 170 },
    { qty: 2, subtotal: 440, unitPrice: 220 },
    { qty: 3, subtotal: 600, unitPrice: 200 },
  ],
};
assert.strictEqual(quantityFromReferencePrice(bundleReference, 440), 2, "bundle subtotal 440 should infer quantity 2");
assert.strictEqual(quantityFromReferencePrice(bundleReference, 220), 2, "bundle unit price 220 should infer quantity 2");
assert.strictEqual(quantityFromReferencePrice(bundleReference, 999), null, "unknown modal price should not force a quantity");
const cameraReference = {
  sku: "CAM-4G",
  productName: "\u0643\u0627\u0645\u064a\u0631\u0627 \u0639\u064a\u0646 \u0627\u0644\u0635\u0642\u0631 \u0627\u0644\u0634\u0645\u0633\u064a\u0629 4G - \u062a\u0639\u0645\u0644 \u0628\u062f\u0648\u0646 \u0643\u0647\u0631\u0628\u0627\u0621 | \u0634\u0631\u064a\u062d\u0629 \u0627\u062a\u0635\u0627\u0644 + \u0648\u0627\u064a \u0641\u0627\u064a + \u0631\u0624\u064a\u0629 \u0644\u064a\u0644\u064a\u0629 | \u0636\u0645\u0627\u0646 \u0633\u0646\u0629",
  qty: 3,
  unitPrice: 249,
  subtotal: 747,
  quantitySource: "repaired_quantity",
  quantityRepair: { source: "easyorders_history", reason: "sku_product_history_min_quantity" },
  referenceSource: "easyorders-real-export",
};
const unsafeCameraDecision = quantityEditDecision(cameraReference, { qty: 1, price: 249 });
assert.strictEqual(unsafeCameraDecision.manualReview, true, "inferred camera quantity must not overwrite modal qty without tier-price proof");
assert.strictEqual(unsafeCameraDecision.reason, "quantity_tier_price_not_verified");
const tierVerifiedCameraDecision = quantityEditDecision({
  ...cameraReference,
  unitPrice: 166,
  subtotal: 498,
  priceOptions: [
    { qty: 1, subtotal: 249, unitPrice: 249 },
    { qty: 3, subtotal: 498, unitPrice: 166 },
  ],
}, { qty: 1, price: 166 });
assert.strictEqual(tierVerifiedCameraDecision.manualReview, false, "verified tier unit price can allow an inferred quantity edit");
assert.strictEqual(tierVerifiedCameraDecision.shouldEditQuantity, true);
assert.strictEqual(tierVerifiedCameraDecision.expectedUnitPrice, 166);
const liveSubtotalTierDecision = quantityEditDecision({
  sku: "SA030101SATY99",
  productName: "\u0634\u0631\u064a\u0637 \u0627\u0644\u0623\u0644\u0648\u0645\u0646\u064a\u0648\u0645 \u0627\u0644\u0639\u0627\u0632\u0644 3 \u0641\u064a 1",
  qty: 2,
  subtotal: 98,
  unitPrice: 49,
  quantitySource: "affiliate_recovery_live_modal_pending",
  referenceSource: "easyorders-catalog",
  priceOptions: [
    { qty: 2, subtotal: 98, unitPrice: 49 },
    { qty: 4, subtotal: 160, unitPrice: 40 },
  ],
}, { qty: 1, price: 98 });
assert.strictEqual(liveSubtotalTierDecision.manualReview, false, "affiliate recovery should use live modal subtotal to select a trusted tier");
assert.strictEqual(liveSubtotalTierDecision.expectedQty, 2);
assert.strictEqual(liveSubtotalTierDecision.expectedUnitPrice, 49);
assert.strictEqual(liveSubtotalTierDecision.shouldEditQuantity, true);
assert.strictEqual(liveSubtotalTierDecision.shouldEditPrice, true);
assert.strictEqual(liveSubtotalTierDecision.reason, "live_modal_subtotal_matched_trusted_tier");
const readOnlyLiveResolution = resolveLiveTierItemsForCandidate({
  source: "missed",
  normPhone: "966555400499",
  name: "\u0634\u0631\u0642\u0639 \u0628\u0646 \u0634\u062e\u0628\u064a\u0637 \u0627\u0644\u0642\u0631\u0646\u0628\u0639\u0627\u0648\u064a",
  city: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0634\u0631\u0642\u064a\u0629",
  items: [{
    sku: "SA030101SATY99",
    productName: "\u0634\u0631\u064a\u0637 \u0627\u0644\u0623\u0644\u0648\u0645\u0646\u064a\u0648\u0645 \u0627\u0644\u0639\u0627\u0632\u0644 3 \u0641\u064a 1",
    qty: 2,
    subtotal: 98,
    unitPrice: 49,
    trusted: true,
    referenceSource: "easyorders-catalog",
    priceOptions: [
      { qty: 2, subtotal: 98, unitPrice: 49 },
      { qty: 4, subtotal: 160, unitPrice: 40 },
    ],
  }],
}, [{
  productName: "\u0634\u0631\u064a\u0637 \u0627\u0644\u0623\u0644\u0648\u0645\u0646\u064a\u0648\u0645 \u0627\u0644\u0639\u0627\u0632\u0644 3 \u0641\u064a 1 (\u0639\u0632\u0644 \u0645\u0627\u0626\u064a\u060c \u0639\u0632\u0644 \u062d\u0631\u0627\u0631\u064a)",
  qty: 1,
  price: 98,
  subtotal: 98,
}], { country: "sa" });
assert.strictEqual(readOnlyLiveResolution.resolved, true, "read-only cart enrichment should resolve live EasyOrders subtotal against trusted tiers");
assert.strictEqual(readOnlyLiveResolution.resolvedItems[0].qty, 2);
assert.strictEqual(readOnlyLiveResolution.resolvedItems[0].unitPrice, 49);
assert.strictEqual(readOnlyLiveResolution.resolvedItems[0].subtotal, 98);
assert.strictEqual(readOnlyLiveResolution.resolvedItems[0].priceSource, "live_modal_subtotal_matched_trusted_tier");
const readOnlyShippingIncludedResolution = resolveLiveTierItemsForCandidate({
  source: "real",
  normPhone: "966512822720",
  name: "\u0633\u0644\u0637\u0627\u0646 \u0627\u0644\u062d\u0627\u0631\u062b\u064a",
  items: [{
    sku: "SA050301ULE499",
    productName: "\u0637\u0627\u0626\u0631\u0629 \u0627\u0644\u062f\u0631\u0648\u0646 A30",
    qty: 1,
    subtotal: 199,
    unitPrice: 199,
    trusted: true,
    referenceSource: "taager-catalog",
    priceOptions: [
      { qty: 1, subtotal: 199, unitPrice: 199 },
      { qty: 2, subtotal: 260, unitPrice: 130 },
    ],
  }],
}, [{
  productName: "\u0637\u0627\u0626\u0631\u0629 \u0627\u0644\u062f\u0631\u0648\u0646 A30",
  qty: 1,
  price: 227,
  subtotal: 227,
}], { country: "sa" });
assert.strictEqual(readOnlyShippingIncludedResolution.resolved, true, "read-only cart enrichment should remove Saudi shipping from live totals before tier matching");
assert.strictEqual(readOnlyShippingIncludedResolution.resolvedItems[0].qty, 1);
assert.strictEqual(readOnlyShippingIncludedResolution.resolvedItems[0].unitPrice, 199);
assert.strictEqual(readOnlyShippingIncludedResolution.resolvedItems[0].subtotal, 199);
assert.strictEqual(readOnlyShippingIncludedResolution.resolvedItems[0].priceSource, "live_modal_subtotal_matched_trusted_tier_after_shipping_removed");
const latestPreparedPriceDecision = quantityEditDecision({
  sku: "SA050301ULE499",
  productName: "\u0637\u0627\u0626\u0631\u0629 \u0627\u0644\u062f\u0631\u0648\u0646 A30",
  qty: 1,
  subtotal: 260,
  unitPrice: 260,
  trusted: true,
  referenceSource: "taager-catalog",
  priceSource: "taager_sku_subtotal_tier_latest",
  reason: "sku_price_updated_to_latest_tier",
  priceOptions: [
    { qty: 1, subtotal: 199, unitPrice: 199, latestSeen: "2026-08-12 10:00" },
    { qty: 1, subtotal: 260, unitPrice: 260, latestSeen: "2026-08-24 12:00" },
  ],
}, {
  qty: 1,
  price: 227,
  subtotal: 227,
});
assert.strictEqual(latestPreparedPriceDecision.manualReview, false, "latest prepared trusted SKU price should remain uploadable");
assert.strictEqual(latestPreparedPriceDecision.expectedQty, 1);
assert.strictEqual(latestPreparedPriceDecision.expectedUnitPrice, 260);
assert.strictEqual(latestPreparedPriceDecision.shouldEditPrice, true, "affiliate recovery should edit old shipping-included modal price to the latest prepared price");
assert.strictEqual(latestPreparedPriceDecision.reason, "matched_normal_flow_prepared_order");
const readOnlyShippingIncludedTwoPiece = resolveLiveTierItemsForCandidate({
  source: "missed",
  normPhone: "966541873359",
  name: "Sujon",
  items: [{
    sku: "SA050301ULE499",
    productName: "\u0637\u0627\u0626\u0631\u0629 \u0627\u0644\u062f\u0631\u0648\u0646 A30",
    qty: 1,
    subtotal: 199,
    unitPrice: 199,
    trusted: true,
    referenceSource: "taager-catalog",
    priceOptions: [
      { qty: 1, subtotal: 199, unitPrice: 199 },
      { qty: 2, subtotal: 260, unitPrice: 130 },
    ],
  }],
}, [{
  productName: "\u0637\u0627\u0626\u0631\u0629 \u0627\u0644\u062f\u0631\u0648\u0646 A30",
  qty: 1,
  price: 288,
  subtotal: 288,
}], { country: "sa" });
assert.strictEqual(readOnlyShippingIncludedTwoPiece.resolved, true, "shipping-included 288 should resolve to the 260 two-piece tier");
assert.strictEqual(readOnlyShippingIncludedTwoPiece.resolvedItems[0].qty, 2);
assert.strictEqual(readOnlyShippingIncludedTwoPiece.resolvedItems[0].unitPrice, 130);
assert.strictEqual(readOnlyShippingIncludedTwoPiece.resolvedItems[0].subtotal, 260);
assert.strictEqual(isSuspiciousQuantity({ maxQty: 3 }, 44), true, "44 should be suspicious when known max quantity is 3");
assert.strictEqual(isSuspiciousQuantity({ maxQty: 3 }, 8), false, "small quantities should not trip the suspicious guard");
assert.strictEqual(
  quantityFromSuspiciousReference({ dominantQty: 1, totalSamples: 5, dominantQtyConfidence: 0.8, maxQty: 3 }, 44),
  1,
  "very large modal quantity should fall back to dominant quantity only with strong history"
);
assert.strictEqual(
  quantityFromSuspiciousReference({ dominantQty: 2, totalSamples: 4, dominantQtyConfidence: 0.75, maxQty: 3 }, 44),
  2,
  "dominant quantity can be a bundle quantity, not always one"
);
assert.strictEqual(
  quantityFromSuspiciousReference({ dominantQty: 1, totalSamples: 2, dominantQtyConfidence: 1, maxQty: 1 }, 44),
  null,
  "two samples are not enough to rewrite a suspicious quantity"
);
assert.strictEqual(
  quantityFromSuspiciousReference({ dominantQty: 1, totalSamples: 5, dominantQtyConfidence: 0.6, maxQty: 3 }, 44),
  null,
  "weak dominant confidence should not rewrite a suspicious quantity"
);
assert.strictEqual(
  quantityFromSuspiciousReference({ dominantQty: 1, totalSamples: 5, dominantQtyConfidence: 0.8, maxQty: 3 }, 4),
  null,
  "normal-looking quantity should not be rewritten by history fallback"
);

const failedHeader = [];
failedHeader[0] = "اسم المستلم";
failedHeader[6] = "رقم الهاتف";
failedHeader[8] = "كود سبب الفشل";
failedHeader[9] = "المنتجات في الطلب";
failedHeader[10] = "المنتجات";
failedHeader[11] = "الكميات";
failedHeader[12] = "الأسعار";
failedHeader[14] = "كود الطلب للمتجر";
const failedSheet = XLSX.utils.aoa_to_sheet([
  failedHeader,
  ["Customer", "", "", "", "", "", "0500000002", "", "price_low_error", "المنتج: SKU-WRONG - الكمية: 1", "SKU-NEW", "44", "62.5", "", "1944783_b7c804a2-80fe-4ae9-961a-0fb2aec74e74"],
]);
const failedBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(failedBook, failedSheet, "الطلبات");
const failedRows = parseTaagerFailedOrders(XLSX.write(failedBook, { type: "buffer", bookType: "xlsx" }), "sa");
assert.strictEqual(failedRows.length, 1);
assert.strictEqual(failedRows[0].failureCode, "price_low_error");
assert.deepStrictEqual(failedRows[0].skus, ["SKU-NEW"]);
assert.strictEqual(failedRows[0].easyOrderUuid, "b7c804a2-80fe-4ae9-961a-0fb2aec74e74");

const verifiedKeys = new Set();
const classifiedFailed = classifyRecoveryAttempts(grouped.attempted, verifiedKeys, failedRows, { country: "sa" });
assert.strictEqual(classifiedFailed.failedInTaager.length, 1, "failed workbook UUID should classify unresolved attempts");
assert.strictEqual(classifiedFailed.failedInTaager[0].failureCode, "price_low_error");
const matchedFailedRows = filterFailedRowsForAttempts(failedRows, grouped.attempted, { country: "sa" });
assert.strictEqual(matchedFailedRows.length, 1, "failed diagnosis rows should be filterable to the current attempted orders");
const unmatchedFailedRows = filterFailedRowsForAttempts(failedRows, [{
  recoverySource: "missed",
  normPhone: "966599999999",
  items: [{ sku: "SKU-OTHER" }],
}], { country: "sa" });
assert.strictEqual(unmatchedFailedRows.length, 0, "raw Taager failed history must not appear as current-run diagnosis when it does not match attempts");
const failedRecoveryOnlyResult = buildAffiliateRecoveryResult({
  realAttempts: grouped.attempted,
  missedAttempts: [],
  verified: [],
  failedInTaager: classifiedFailed.failedInTaager,
  unresolved: [],
  skippedAlready: [],
  skippedCompleted: [],
  skippedManual: [],
}, "sa");
assert.strictEqual(failedRecoveryOnlyResult.failedRows.length, 1, "true Taager failed export rows should still be reported as failed");
assert.strictEqual(failedRecoveryOnlyResult.failedRows[0].failureCode, "price_low_error");

verifiedKeys.add("966500000002|SKU-NEW");
const classifiedVerified = classifyRecoveryAttempts(grouped.attempted, verifiedKeys, failedRows, { country: "sa" });
assert.strictEqual(classifiedVerified.verified.length, 1, "normal Taager export verification wins");
assert.strictEqual(classifiedVerified.failedInTaager.length, 0);

const alreadyRealAttempt = {
  ...grouped.attempted[0],
  actionStatus: "already_in_real_orders_unverified",
  actionMessage: "Convert to Order button not available; likely already moved from missed orders to real orders",
  missingConvertNeedsRealRetry: true,
};
const classifiedAlreadyReal = classifyRecoveryAttempts([alreadyRealAttempt], new Set(), failedRows, { country: "sa" });
assert.strictEqual(classifiedAlreadyReal.failedInTaager.length, 0, "missing Convert button should not be overridden by failed export matching");
assert.strictEqual(classifiedAlreadyReal.unresolved.length, 1, "missing Convert button should remain a verification uncertainty");
assert.strictEqual(classifiedAlreadyReal.unresolved[0].finalStatus, "already_in_real_orders_unverified");

const orderSentAttempt = {
  ...grouped.attempted[0],
  actionStatus: "sent",
  actionMessage: "Order Sent",
};
const classifiedOrderSent = classifyRecoveryAttempts([orderSentAttempt], new Set(), failedRows, { country: "sa" });
assert.strictEqual(classifiedOrderSent.failedInTaager.length, 0, "Order Sent should wait for Taager verification instead of being rejected");
assert.strictEqual(classifiedOrderSent.unresolved.length, 1);
assert.strictEqual(classifiedOrderSent.unresolved[0].finalStatus, "awaiting_taager_verification");
const orderSentRecoveryResult = buildAffiliateRecoveryResult({
  realAttempts: [orderSentAttempt],
  missedAttempts: [],
  verified: [],
  failedInTaager: classifiedOrderSent.failedInTaager,
  unresolved: classifiedOrderSent.unresolved,
  skippedAlready: [],
  skippedCompleted: [],
  skippedManual: [],
}, "sa");
assert.strictEqual(orderSentRecoveryResult.failedRows.length, 0, "Order Sent should not appear in failed/rejected rows without Taager failed-export proof");
assert.strictEqual(orderSentRecoveryResult.manualReviewRows.length, 0, "Order Sent without Taager verification should not inflate manual-review rows");
assert.strictEqual(orderSentRecoveryResult.unresolvedRows.length, 1, "Order Sent without Taager verification should appear in unresolved attempted rows");
assert.strictEqual(orderSentRecoveryResult.unresolvedRows[0].recoveryStatus, "awaiting_taager_verification");
assert.strictEqual(orderSentRecoveryResult.unresolvedRows[0].reason, "awaiting_taager_verification");

const alreadyRealRecoveryResult = buildAffiliateRecoveryResult({
  realAttempts: [],
  missedAttempts: [alreadyRealAttempt],
  verified: [],
  failedInTaager: [],
  unresolved: classifiedAlreadyReal.unresolved,
  skippedAlready: [],
  skippedCompleted: [],
  skippedManual: [],
}, "sa");
assert.strictEqual(alreadyRealRecoveryResult.failedRows.length, 0, "missing Convert button should not be reported as rejected by Taager");
assert.strictEqual(alreadyRealRecoveryResult.manualReviewRows.length, 0, "unverified already-real missed rows should not inflate manual-review rows");
assert.strictEqual(alreadyRealRecoveryResult.unresolvedRows.length, 1, "unverified already-real missed rows should appear in unresolved attempted rows");

const recoveryResult = buildAffiliateRecoveryResult({
  realAttempts: grouped.attempted,
  missedAttempts: [],
  verified: classifiedVerified.verified,
  failedInTaager: [],
  unresolved: [],
  skippedAlready: grouped.skippedAlready,
  skippedCompleted: [{ source: "missed", status: "Completed" }],
  skippedManual: [{
    source: "real",
    name: "Needs Review",
    rawPhone: "0500000004",
    normalizedPhone: "966500000004",
    productName: "Review Product",
    reason: "normal_flow_prepared_quantity_is_suspicious",
    actionMessage: "quantity 44",
  }, {
    source: "missed",
    name: "No History",
    rawPhone: "0500000003",
    normalizedPhone: "966500000003",
    productName: "Unknown Product",
    reason: "no_trusted_product_reference",
    actionMessage: "Product was not found in EasyOrders/Taager history",
  }],
}, "sa");
assert.strictEqual(recoveryResult.enabled, true);
assert.strictEqual(recoveryResult.verifiedCount, 1);
assert.strictEqual(recoveryResult.sentAsIsCount, 0);
assert.strictEqual(recoveryResult.skippedCompletedCount, 1);
assert(recoveryResult.skippedRows.some((row) => row.rawPhone === "0500000004" && row.normalizedPhone === "966500000004" && row.reason === "normal_flow_prepared_quantity_is_suspicious"), "skipped recovery rows should preserve raw phone, normalized phone, and reason");
assert(recoveryResult.manualReviewRows.some((row) => row.normalizedPhone === "966500000003" && row.reason === "no_trusted_product_reference"), "no-history products should appear in uncertain/manual recovery rows");
assert.strictEqual(recoveryResult.blockedReviewRows.length, 2, "blocked manual-review rows should be exposed separately from unresolved attempted rows");

const root = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "src", "main", "preload.js"), "utf8");
const runnerSource = fs.readFileSync(path.join(root, "src", "bot", "runner.js"), "utf8");
const setupSource = fs.readFileSync(path.join(root, "src", "renderer", "pages", "setup.js"), "utf8");
const runSource = fs.readFileSync(path.join(root, "src", "renderer", "pages", "run.js"), "utf8");
const uiRecoverySource = fs.readFileSync(path.join(root, "src", "bot", "easy-orders-ui-recovery.js"), "utf8");
const flowSource = fs.readFileSync(path.join(root, "src", "bot", "easy-orders-affiliate-recovery-flow.js"), "utf8");
const failedFlowSource = fs.readFileSync(path.join(root, "src", "bot", "taager-failed-orders-export-flow.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "src", "renderer", "pages", "results.js"), "utf8");

assert(mainSource.includes("easyOrdersAffiliateRecoveryEnabled"), "main process should persist and pass affiliate recovery toggle");
assert(mainSource.includes("save-settings") && mainSource.includes("easyOrdersAffiliateRecoveryEnabled"), "settings IPC should persist affiliate recovery toggle");
assert(preloadSource.includes("setEasyOrdersAffiliateRecoveryEnabled"), "preload should expose affiliate recovery setup toggle");
assert(runnerSource.includes("createEasyOrdersAffiliateRecoveryFlow"), "runner should include affiliate recovery branch");
assert(runnerSource.includes("enrichCartRowsFromEasyOrdersLive"), "normal cart should enrich ambiguous real/missed rows from EasyOrders live detail before Taager upload");
assert(runnerSource.indexOf("await enrichCartRowsFromEasyOrdersLive") < runnerSource.indexOf("const dedupeResult = mergeAndDeduplicate"), "cart live enrichment must happen before Taager duplicate filtering and upload");
assert(runSource.includes("easyOrdersAffiliateRecoveryEnabled"), "run page should pass affiliate recovery toggle into runBot payload");
assert(runnerSource.includes("const recoveryPreparedOrders = buildGroupedCartOrders(orders)") && runnerSource.includes("preparedOrders: recoveryPreparedOrders"), "runner should pass only trusted normal-flow grouped orders into recovery");
assert(runnerSource.includes("no_trusted_product_reference"), "recovery mode should move no-history products to uncertain instead of submitting them");
assert(runnerSource.includes("taagerBlockingPhones"), "recovery uncertainty logic should still avoid phone-only duplicates that are already active in Taager");
assert(runnerSource.includes("fallbackProvince: taagerAnalyticsMap.provinceFallback"), "runner should pass delivered-order province fallback into recovery");
assert(runnerSource.includes("fallbackProvinceBySku: taagerAnalyticsMap.provinceFallbackBySku"), "runner should pass SKU province fallback into recovery");
assert(runnerSource.indexOf("const dedupeResult = mergeAndDeduplicate") < runnerSource.indexOf("recoveryFlow.run"), "affiliate recovery should run after normal-flow dedupe");
assert(uiRecoverySource.includes("matched_normal_flow_prepared_order"), "affiliate recovery edits should be driven by the normal-flow prepared order");
assert(uiRecoverySource.includes("normalizePhoneWithMeta"), "affiliate recovery should detect rescued/uncertain modal phone values");
assert(uiRecoverySource.includes("COUNTRY_PHONE_RULES"), "affiliate recovery should format EasyOrders modal phone values from shared country phone rules");
assert(uiRecoverySource.includes("phone_rescued_trailing_zero_rewrite"), "affiliate recovery should rewrite short EasyOrders phone values instead of treating rescued normalization as clean");
assert(uiRecoverySource.includes("phone_display_rewrite"), "affiliate recovery should rewrite ugly-but-normalizable EasyOrders phone values before resending");
assert(uiRecoverySource.includes("normal_flow_prepared_quantity_is_suspicious"), "affiliate recovery should stop unsafe prepared quantities for manual review");
assert(uiRecoverySource.includes("quantity_tier_price_not_verified"), "affiliate recovery should stop inferred quantity edits when tier price is not verified");
assert(uiRecoverySource.includes("pending prepared targets"), "missed recovery should only open prepared missed targets");
assert(uiRecoverySource.includes("enrichMissedOrdersReadOnly"), "EasyOrders UI helper should expose read-only missed-order enrichment for cart flow");
assert(uiRecoverySource.includes("enrichRealOrdersReadOnly"), "EasyOrders UI helper should expose read-only real-order enrichment for cart flow");
assert(uiRecoverySource.includes("inspectDetailItems"), "read-only cart enrichment should read visible detail product rows without opening the edit modal");
assert(uiRecoverySource.includes("fillInputValue(page, `cart_items[${modalItem.index}].price`"), "affiliate recovery should edit price from the normal-flow prepared order");
assert(uiRecoverySource.includes("waitForEasyOrdersDetail"), "affiliate recovery should wait for detail controls before checking action buttons");
assert(uiRecoverySource.includes("no_trusted_product_reference"), "unknown modal products should be blocked as uncertain instead of sent as-is");
assert(uiRecoverySource.includes("expectedOrder.address || expectedCity"), "affiliate recovery should fill missing EasyOrders address from city like the old Taager flow");
assert(uiRecoverySource.includes("withEasyOrdersOrderRetry"), "affiliate recovery should retry transient EasyOrders UI failures per order");
assert(uiRecoverySource.includes("reloadEasyOrdersPage"), "affiliate recovery should reload EasyOrders before retrying a crashed/timeout order");
assert(uiRecoverySource.includes("completed_waiting_verification"), "completed missed orders should wait for Taager verification before real-order resend");
assert(uiRecoverySource.includes("processCompletedMissedAsReal"), "unresolved completed missed orders should be recovered from the converted real order detail on retry");
assert(uiRecoverySource.includes("completedNeedsRealRetry"), "completed missed retries should search/resend through the real order detail URL");
assert(flowSource.includes("ui.retryAttempts(page, retryTargets, { fromDate, toDate })"), "completed missed retry lookup needs the selected EasyOrders date range");
assert(flowSource.includes("attempt.uploadGroupKey || attempt.easyOrderUuid || attempt.detailUrl"), "retry results should merge back into the original normal-flow recovery group");
assert(uiRecoverySource.includes("processed ${i + 1}/${list.length}; pausing briefly"), "large EasyOrders recovery batches should pause briefly for stability");
assert(uiRecoverySource.includes("onAttemptResult"), "affiliate recovery should report per-order progress to the run page");
assert(flowSource.includes("progressTotal") && flowSource.includes("reportAttemptResult"), "affiliate recovery should maintain progress counters across first pass and retry");
assert(flowSource.includes("item.address || order.address || city"), "affiliate recovery prepared orders should carry address fallback from city");
assert(flowSource.includes("fallbackCityForOrder"), "affiliate recovery should reuse delivered-order city fallback logic");
assert(flowSource.includes("fallbackNameForOrder"), "affiliate recovery should fill empty names from phone before editing EasyOrders");
assert(flowSource.includes("dedupePreparedRealOrders"), "affiliate recovery should de-dupe real EasyOrders UUIDs before UI processing");
assert(flowSource.includes("duplicate_easyorders_uuid_conflicting_phone"), "conflicting phones for one EasyOrders UUID should go to manual review");
assert(failedFlowSource.includes("orders-search-button"), "failed-orders diagnosis should use the stable Taager search button id");
assert(failedFlowSource.includes("export-to-excel-button"), "failed-orders diagnosis should use the stable Taager Excel export button id");
assert(failedFlowSource.includes('[data-day="${target}"]'), "failed-orders diagnosis should select calendar days by stable data-day");
assert(failedFlowSource.includes("leaving to date empty"), "failed-orders diagnosis should leave the end date empty like normal Taager orders export");
assert(runnerSource.includes("recoveryPreview: true"), "affiliate recovery should send a run-page preview table");
assert(runnerSource.includes("config.autoConfirm !== true") && runnerSource.includes("preview_only_auto_confirm_off"), "affiliate recovery should stop after preview when Auto-Confirm is OFF");
assert(runnerSource.includes("Auto-confirm is OFF - affiliate recovery stopped after preview"), "affiliate recovery preview-only safeguard should be logged clearly");
assert(runnerSource.includes('mode: "affiliate-recovery"'), "affiliate recovery progress should be tagged for the run page");
assert(setupSource.includes("sv3-btn-affiliate-recovery"), "setup should render affiliate recovery run toggle");
assert(!setupSource.includes("sv3-affiliate-recovery-enabled"), "affiliate recovery should not be an account-form checkbox");
assert(setupSource.indexOf("saveSettings({ easyOrdersAffiliateRecoveryEnabled") < setupSource.indexOf("setEasyOrdersAffiliateRecoveryEnabled(next)"), "setup should save via existing settings IPC before custom IPC fallback");
assert(setupSource.includes("is-recovery"), "setup should use a distinct recovery visual tone");
assert(
  setupSource.indexOf("sv3-btn-autoconfirm") < setupSource.indexOf("sv3-btn-affiliate-recovery") &&
  setupSource.indexOf("sv3-btn-affiliate-recovery") < setupSource.indexOf("sv3-btn-missing-orders"),
  "affiliate recovery toggle should sit between Auto-Confirm and Route Missed Orders"
);
assert(resultsSource.includes("affiliateRecovery"), "results should render affiliate recovery details");
assert(resultsSource.includes("message_awaiting_taager_verification") && resultsSource.includes("message_already_in_real_orders_unverified"), "results should label recovery uncertainty instead of rejected/failed");
assert(resultsSource.includes("buildRecoveryUnresolvedHtml") && resultsSource.includes("blockedReviewRows"), "results should split unresolved attempted rows from blocked manual-review rows");
assert(resultsSource.includes("rawRowCount") && resultsSource.includes("matchedRows"), "failed-order diagnosis should display matched current-run rows without losing raw download/count context");
assert(resultsSource.includes("recovery_verification_rate") && resultsSource.includes("recovery_pending_title"), "affiliate recovery results should not show 100% uploaded while orders are still unresolved");
assert(resultsSource.includes("recovery_preview_only_title") && resultsSource.includes("reason_preview_only_auto_confirm_off"), "results should show affiliate recovery preview-only state when Auto-Confirm is OFF");
assert(resultsSource.includes("manualReviewStaticField(\"productName\""), "manual-review product names should be read-only, not editable upload inputs");
assert(resultsSource.includes("skip-col-message") && resultsSource.includes("normalizedRecoveryReasonKey"), "manual-review tables should have readable message width and normalized translated reasons");
assert(resultsSource.includes("manualReviewQualitySort"), "manual-review rows should be sorted so more actionable rows appear before fake/low-quality rows");
assert(resultsSource.includes('source === "real"') && resultsSource.includes('source === "missed"'), "manual-review rows should put real-order source rows before missed-order source rows");
assert(resultsSource.includes("manualReviewHiddenField(\"subtotal\"") && !resultsSource.includes("manualReviewInput(\"subtotal\""), "manual-review subtotal should be hidden metadata, not a visible editable column");
assert(runSource.includes("run.recovery_preview_header") && runSource.includes("run.recovery_progress_title"), "run page should label affiliate recovery preview and progress distinctly");
assert(runSource.includes("progressLastOrderText"), "run page progress should show last recovery order product/customer/status details");
assert(runSource.includes("previewDestinationLabel"), "run page preview tables should label affiliate recovery rows as Recovery");
assert(runSource.includes('data?.accountId ? accountStates.find(a => a.id === data.accountId)') && runSource.includes('msg?.accountId ? accountStates.find(a => a.id === msg.accountId)'), "multi-account preview/progress should route by accountId before falling back");

console.log("Affiliate recovery verification passed.");
