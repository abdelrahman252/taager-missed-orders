"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

function evaluateCachedLicense(result, nowMs = Date.now()) {
  if (!result || typeof result !== "object") {
    return { result: null, hasKnownExpiry: false, expired: false };
  }

  const hasExpiryField = Object.prototype.hasOwnProperty.call(result, "expiresAt")
    || Object.prototype.hasOwnProperty.call(result, "expires_at");
  const rawExpiry = result.expiresAt ?? result.expires_at ?? null;
  if (hasExpiryField && rawExpiry == null) {
    return {
      result: { ...result, expiresAt: null, daysLeft: null },
      hasKnownExpiry: true,
      expired: false,
    };
  }
  const expiryMs = rawExpiry ? Date.parse(rawExpiry) : NaN;
  if (!Number.isFinite(expiryMs)) {
    return { result: { ...result }, hasKnownExpiry: false, expired: false };
  }

  const remainingMs = expiryMs - nowMs;
  const daysLeft = Math.max(0, Math.ceil(remainingMs / DAY_MS));
  return {
    result: {
      ...result,
      expiresAt: new Date(expiryMs).toISOString(),
      daysLeft,
    },
    hasKnownExpiry: true,
    expired: remainingMs <= 0,
  };
}

function isInsideWarningWindow(evaluation, warningDays) {
  if (!evaluation || !evaluation.result) return false;
  const rawDaysLeft = evaluation.result.daysLeft;
  if (rawDaysLeft == null) return false;
  const daysLeft = Number(rawDaysLeft);
  return Number.isFinite(daysLeft) && daysLeft <= warningDays;
}

module.exports = {
  evaluateCachedLicense,
  isInsideWarningWindow,
};
