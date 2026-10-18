"use strict";

const assert = require("assert");
const {
  createEasyOrdersAffiliateRecoveryFlow,
  recoveryVerificationRange,
  unresolvedAfterClassification,
} = require("../src/bot/easy-orders-affiliate-recovery-flow");
const { classifyRecoveryAttempts } = require("../src/bot/easy-orders-affiliate-recovery-data");
const { candidateKeys } = require("../src/bot/easy-orders-affiliate-recovery-data");

async function main() {
  const from = new Date(2026, 9, 1);
  const selectedTo = new Date(2026, 9, 5);
  const today = new Date(2026, 9, 18, 21, 30);
  const range = recoveryVerificationRange(from, selectedTo, today);
  assert.strictEqual(range.from.getDate(), 1);
  assert.strictEqual(range.to.getDate(), 18,
    "verification should cover orders created today even when the source order range ended earlier");

  const exportCalls = [];
  const recovery = createEasyOrdersAffiliateRecoveryFlow({
    now: () => today,
    exportTaagerOrders: async (_page, exportFrom, exportTo) => {
      exportCalls.push({ from: new Date(exportFrom), to: new Date(exportTo) });
      return Buffer.from("verification fixture");
    },
    parseTaagerOrderKeys: () => new Set(),
  });
  await recovery.run({}, {
    preparedOrders: [],
    skippedOrders: [],
    fromDate: new Date(2026, 9, 2),
    toDate: selectedTo,
    taagerFromDate: from,
    taagerToDate: selectedTo,
  });
  assert.strictEqual(exportCalls.length, 1);
  assert.strictEqual(exportCalls[0].from.getDate(), 1);
  assert.strictEqual(exportCalls[0].to.getDate(), 18,
    "flow must pass the widened verification end date to its Taager export callback");

  const manualCandidate = {
    source: "missed",
    recoverySource: "missed",
    normPhone: "966555000222",
    items: [{ sku: "SKU-MANUAL", qty: 1, unitPrice: 20, subtotal: 20 }],
  };
  const currentKeys = new Set(candidateKeys(manualCandidate, "sa"));
  let manualActionCalls = 0;
  let manualPreflightExports = 0;
  const manualFlow = createEasyOrdersAffiliateRecoveryFlow({
    now: () => today,
    exportTaagerOrders: async () => { manualPreflightExports += 1; return Buffer.from("manual preflight fixture"); },
    parseTaagerOrderKeys: () => currentKeys,
    uiRecovery: {
      processRealOrders: async (_page, orders) => { manualActionCalls += orders.length; return { attempted: [] }; },
      processMissedOrders: async (_page, orders) => { manualActionCalls += orders.length; return { attempted: [] }; },
      retryAttempts: async () => { manualActionCalls += 1; return []; },
    },
  });
  const manualResult = await manualFlow.run({}, {
    preparedOrders: [manualCandidate],
    skippedOrders: [],
    manualReviewMode: true,
    fromDate: from,
    toDate: selectedTo,
    taagerFromDate: from,
    taagerToDate: selectedTo,
  });
  assert.strictEqual(manualPreflightExports, 1, "manual recovery must fetch a fresh Taager key baseline before any EasyOrders action");
  assert.strictEqual(manualActionCalls, 0, "a matching current phone/SKU key must block manual Convert/Resend handlers");
  assert.strictEqual(manualResult.skippedAlreadyCount, 1, "the blocked duplicate remains visible as already present");
  assert.strictEqual(manualResult.skippedRows[0].recoveryStatus, "already_in_taager");

  let actionsAfterPreflightFailure = 0;
  const failedManualPreflight = createEasyOrdersAffiliateRecoveryFlow({
    now: () => today,
    exportTaagerOrders: async () => { throw new Error("preflight unavailable"); },
    parseTaagerOrderKeys: () => new Set(),
    uiRecovery: {
      processRealOrders: async (_page, orders) => { actionsAfterPreflightFailure += orders.length; return { attempted: [] }; },
      processMissedOrders: async (_page, orders) => { actionsAfterPreflightFailure += orders.length; return { attempted: [] }; },
      retryAttempts: async () => { actionsAfterPreflightFailure += 1; return []; },
    },
  });
  await assert.rejects(() => failedManualPreflight.run({}, {
    preparedOrders: [manualCandidate], skippedOrders: [], manualReviewMode: true,
    fromDate: from, toDate: selectedTo, taagerFromDate: from, taagerToDate: selectedTo,
  }), /preflight unavailable/);
  assert.strictEqual(actionsAfterPreflightFailure, 0, "failed duplicate preflight must fail closed before any EasyOrders action");

  let actionsForLegacyAccepted = 0;
  const legacyAcceptedFlow = createEasyOrdersAffiliateRecoveryFlow({
    now: () => today,
    exportTaagerOrders: async () => Buffer.from("current export without pending row"),
    parseTaagerOrderKeys: () => new Set(),
    uiRecovery: {
      processRealOrders: async (_page, orders) => { actionsForLegacyAccepted += orders.length; return { attempted: [] }; },
      processMissedOrders: async (_page, orders) => { actionsForLegacyAccepted += orders.length; return { attempted: [] }; },
      retryAttempts: async (_page, orders) => { actionsForLegacyAccepted += orders.length; return []; },
    },
  });
  const legacyAcceptedResult = await legacyAcceptedFlow.run({}, {
    preparedOrders: [{ ...manualCandidate, actionStatus: "converted" }],
    skippedOrders: [],
    manualReviewMode: true,
    fromDate: from,
    toDate: selectedTo,
    taagerFromDate: from,
    taagerToDate: selectedTo,
  });
  assert.strictEqual(actionsForLegacyAccepted, 0, "a legacy payload marked converted must not be replayed even when today's export has no matching key");
  assert.strictEqual(legacyAcceptedResult.skippedRows[0].recoveryStatus, "awaiting_taager_verification", "legacy accepted status remains visible as pending verification");

  let freshManualExportCount = 0;
  let retriesAfterFreshManualAction = 0;
  const eligibleManualFlow = createEasyOrdersAffiliateRecoveryFlow({
    now: () => today,
    exportTaagerOrders: async () => {
      freshManualExportCount += 1;
      return Buffer.from(`manual export ${freshManualExportCount}`);
    },
    parseTaagerOrderKeys: (_buffer) => freshManualExportCount >= 2 ? currentKeys : new Set(),
    uiRecovery: {
      processRealOrders: async () => ({ attempted: [] }),
      processMissedOrders: async (_page, orders) => ({ attempted: orders.map((order) => ({ ...order, actionStatus: "converted" })) }),
      retryAttempts: async () => { retriesAfterFreshManualAction += 1; return []; },
    },
  });
  const eligibleManualResult = await eligibleManualFlow.run({}, {
    preparedOrders: [manualCandidate], skippedOrders: [], manualReviewMode: true,
    fromDate: from, toDate: selectedTo, taagerFromDate: from, taagerToDate: selectedTo,
  });
  assert.strictEqual(freshManualExportCount, 2, "eligible manual action must be checked against a post-action export, not the preflight snapshot");
  assert.strictEqual(eligibleManualResult.verifiedCount, 1, "post-action current Taager key verifies the manual recovery");
  assert.strictEqual(retriesAfterFreshManualAction, 0, "verified manual recovery must not be retried");

  const acceptedConversion = classifyRecoveryAttempts([{
    source: "missed",
    recoverySource: "missed",
    actionStatus: "converted",
    normPhone: "966555000111",
    items: [{ sku: "SKU-TEST", qty: 1 }],
  }], new Set(), [], { country: "sa" });
  assert.strictEqual(acceptedConversion.unresolved[0].finalStatus, "awaiting_taager_verification");
  assert.deepStrictEqual(unresolvedAfterClassification(acceptedConversion), [],
    "an accepted conversion not yet present in the export must remain pending without a duplicate Convert retry");

  const actionNotConfirmed = classifyRecoveryAttempts([{
    source: "missed",
    recoverySource: "missed",
    actionStatus: "not_started",
    normPhone: "966555000111",
    items: [{ sku: "SKU-TEST", qty: 1 }],
  }], new Set(), [], { country: "sa" });
  assert.strictEqual(unresolvedAfterClassification(actionNotConfirmed).length, 1,
    "unresolved actions without accepted/sent status may still use the existing bounded retry path");

  console.log("Affiliate recovery verification window tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
