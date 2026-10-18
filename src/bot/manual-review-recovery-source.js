"use strict";

const VALID_RECOVERY_SOURCES = new Set(["real", "missed"]);

function normalizeManualReviewRecoverySource(row) {
  const source = String(row && row.source || "").trim().toLowerCase();
  const recoverySource = String(row && row.recoverySource || "").trim().toLowerCase();
  const sourceIsValid = VALID_RECOVERY_SOURCES.has(source);
  const recoverySourceIsValid = VALID_RECOVERY_SOURCES.has(recoverySource);

  if (sourceIsValid && recoverySourceIsValid && source !== recoverySource) {
    throw new Error("MANUAL_REVIEW_RECOVERY_SOURCE_CONFLICT");
  }
  if (sourceIsValid) return source;
  if (recoverySourceIsValid) return recoverySource;
  throw new Error("MANUAL_REVIEW_RECOVERY_SOURCE_REQUIRED");
}

function normalizeManualReviewRecoveryOrigin(row, easyOrderUuid = "") {
  const source = normalizeManualReviewRecoverySource(row);
  const detailUrl = String(row && row.detailUrl || "").trim();
  if (!detailUrl) {
    return {
      source,
      detailUrl: easyOrderUuid
        ? `https://app.easy-orders.net/#/${source === "missed" ? "missed-orders" : "orders"}/${encodeURIComponent(easyOrderUuid)}`
        : "",
    };
  }

  let parsed;
  try {
    parsed = new URL(detailUrl, "https://app.easy-orders.net/");
  } catch (_) {
    throw new Error("MANUAL_REVIEW_RECOVERY_DETAIL_URL_INVALID");
  }
  const route = parsed.hash.replace(/^#/, "").split(/[?#]/, 1)[0];
  const detailSource = route.startsWith("/missed-orders/")
    ? "missed"
    : route.startsWith("/orders/") && !route.startsWith("/orders/create")
      ? "real"
      : "";
  if (parsed.hostname !== "app.easy-orders.net" || !detailSource) {
    throw new Error("MANUAL_REVIEW_RECOVERY_DETAIL_URL_INVALID");
  }
  if (detailSource !== source) {
    throw new Error("MANUAL_REVIEW_RECOVERY_DETAIL_URL_SOURCE_CONFLICT");
  }
  return { source, detailUrl };
}

function partitionManualReviewRecoveryRows(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    ...normalizeManualReviewRecoveryOrigin(row, row && (row.easyOrderUuid || row.orderUuid || row.orderId || row.id) || ""),
  }));
  return {
    real: normalized.filter((row) => row.source === "real"),
    missed: normalized.filter((row) => row.source === "missed"),
  };
}

module.exports = {
  normalizeManualReviewRecoverySource,
  normalizeManualReviewRecoveryOrigin,
  partitionManualReviewRecoveryRows,
};
