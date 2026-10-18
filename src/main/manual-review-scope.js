"use strict";

function validateManualReviewScope({ manualReviewMode, rows, accountIds, accounts } = {}) {
  if (manualReviewMode !== true) return { ok: true, accountId: null };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "MANUAL_REVIEW_ORDERS_REQUIRED" };
  }

  if (!Array.isArray(accountIds) || accountIds.length !== 1 || typeof accountIds[0] !== "string" || !accountIds[0].trim()) {
    return { ok: false, error: "MANUAL_REVIEW_ACCOUNT_REQUIRED" };
  }

  const accountId = accountIds[0].trim();
  const savedAccounts = Array.isArray(accounts) ? accounts : [];
  if (savedAccounts.length === 0) {
    return accountId === "legacy"
      ? { ok: true, accountId }
      : { ok: false, error: "MANUAL_REVIEW_ACCOUNT_INVALID" };
  }

  const account = savedAccounts.find((candidate) => candidate && candidate.id === accountId);
  if (!account || account.accountType === "static") {
    return { ok: false, error: "MANUAL_REVIEW_ACCOUNT_INVALID" };
  }

  return { ok: true, accountId };
}

module.exports = { validateManualReviewScope };
