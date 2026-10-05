"use strict";

/**
 * A caught cart-worker exception may happen after a submit action has begun.
 * Keep those runs out of the "success" alert path so operators inspect Taager
 * before deciding whether another run is safe.
 */
function classifyRunnerAlert(data = {}) {
  const failedOrders = data.failedOrders || {};
  const failed = Math.max(0, Number(failedOrders.count) || 0);
  const source = String(failedOrders.source || data.failedSource || "").toLowerCase();
  const sources = source.split("+").map((value) => value.trim()).filter(Boolean);
  const summary = Array.isArray(failedOrders.summary) ? failedOrders.summary : [];
  const hasManualReviewRows = summary.some((row) => row && (
    row.manualReview === true || row.uncertain === true || row.verificationUnconfirmed === true
  ));
  const needsReview = sources.includes("cart-error") || sources.includes("uncertain-upload") ||
    hasManualReviewRows || (failed > 0 && sources.includes("verified-export"));
  if (!needsReview) return { kind: "success" };

  return {
    kind: "error",
    operation: "completed-needs-review",
    error: `Taager cart upload stopped with an unverified outcome (${failed} order row(s) retained). Check the Taager cart before rerunning; do not resubmit these orders until their status is confirmed.`,
  };
}

module.exports = { classifyRunnerAlert };
