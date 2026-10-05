"use strict";

const MERCHANT_IDENTITY_RE = /^[a-z]{2}:[a-z0-9_-]+$/i;

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedStore(value) {
  return normalized(value).replace(/\s+/g, " ");
}

function normalizePhoneFallback(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Resolve the server-side license slot for a marketing account. */
function resolveMarketingLicenseSlot(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const computedHash = String(options.computedHash || "").trim();
  const cachedHash = String(options.cachedHash || "").trim();

  // An unchanged current hash is definitive. The caller only supplies cachedHash
  // after checking that its stored identity key still matches the account.
  for (const [hash, reason] of [[computedHash, "computed_hash"], [cachedHash, "cached_hash"]]) {
    if (!hash) continue;
    const exact = list.filter(row => row && String(row.account_hash || "").trim() === hash);
    if (exact.length === 1) return { ok: true, accountHash: hash, reason };
    if (exact.length > 1) return { ok: false, accountHash: "", reason: "dashboard_account_ambiguous" };
  }

  const cmsEmail = normalized(options.cmsEmail);
  const cmsStore = normalizedStore(options.cmsStore);
  const merchantIdentity = normalized(options.merchantIdentity);
  const loginMethod = normalized(options.loginMethod) || "email";
  const loginIdentity = normalized(options.loginIdentity);
  const loginPhone = String(options.loginPhone || "").trim();
  const phoneNormalizer = typeof options.normalizePhone === "function"
    ? options.normalizePhone
    : normalizePhoneFallback;
  const inputPhone = String(phoneNormalizer(loginPhone) || "").trim();

  const matches = list.filter(row => {
    if (!row) return false;
    const rowEmail = normalized(row.easy_email);
    const rowStore = normalizedStore(row.easy_store);
    if (cmsEmail && rowEmail && cmsEmail !== rowEmail) return false;
    if (cmsStore && rowStore && cmsStore !== rowStore) return false;

    const rowTaagerEmail = normalized(row.taager_email);
    const rowMerchantIdentity = MERCHANT_IDENTITY_RE.test(rowTaagerEmail) ? rowTaagerEmail : "";
    if (rowMerchantIdentity) return !!merchantIdentity && rowMerchantIdentity === merchantIdentity;

    const rowMethod = normalized(row.taager_login_method);
    if (rowMethod && rowMethod !== loginMethod) return false;
    if (loginMethod === "phone") {
      if (!inputPhone) return false;
      const rowPhone = String(phoneNormalizer(row.taager_phone || "") || "").trim();
      return !!rowPhone && rowPhone === inputPhone;
    }
    return !!loginIdentity && normalized(rowTaagerEmail) === normalized(loginIdentity);
  });

  if (matches.length !== 1 || !matches[0].account_hash) {
    return {
      ok: false,
      accountHash: "",
      reason: matches.length > 1 ? "dashboard_account_ambiguous" : "dashboard_account_not_licensed",
    };
  }
  return { ok: true, accountHash: String(matches[0].account_hash).trim(), reason: "identity_match" };
}

module.exports = { resolveMarketingLicenseSlot };
