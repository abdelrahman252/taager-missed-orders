"use strict";

const { normalizeTaagerCountry } = require("./taager-country");

const COUNTRY_CONFIG = {
  sa: { dialCode: "966", domesticPrefix: "0", startsWith: ["5"], length: 9, rescueTrailingZero: true },
  eg: { dialCode: "20", domesticPrefix: "0", startsWith: ["10", "11", "12", "15"], length: 10, rescueTrailingZero: true },
  ae: { dialCode: "971", domesticPrefix: "0", startsWith: ["5"], length: 9, rescueTrailingZero: true },
  iq: { dialCode: "964", domesticPrefix: "0", startsWith: ["7"], length: 10, rescueTrailingZero: true },
  om: { dialCode: "968", domesticPrefix: "0", startsWith: [], length: 8, rescueTrailingZero: true },
};

const COUNTRY_PHONE_RULES = COUNTRY_CONFIG;

const DEFAULT_COUNTRY = "sa";

function toWesternDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
}

function _preparePhone(phone, country) {
  if (!phone) return null;

  const cc = normalizeTaagerCountry(country || DEFAULT_COUNTRY);
  const cfg = COUNTRY_CONFIG[cc];
  if (!cfg) return null;

  let digits = toWesternDigits(phone).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(cfg.dialCode)) digits = digits.slice(cfg.dialCode.length);
  if (cfg.domesticPrefix && digits.startsWith(cfg.domesticPrefix)) {
    digits = digits.slice(cfg.domesticPrefix.length);
  }

  return { cc, cfg, digits };
}

function _hasValidStart(digits, cfg) {
  return !cfg.startsWith.length || cfg.startsWith.some((prefix) => digits.startsWith(prefix));
}

function _isExactValid(digits, cfg) {
  return digits.length === cfg.length && _hasValidStart(digits, cfg);
}

function _trailingDialCodeCandidate(raw, cfg) {
  if (!raw || !cfg || !cfg.dialCode || !raw.endsWith(cfg.dialCode)) return null;
  let candidate = raw.slice(0, -cfg.dialCode.length);
  if (cfg.domesticPrefix && candidate.startsWith(cfg.domesticPrefix)) {
    candidate = candidate.slice(cfg.domesticPrefix.length);
  }
  return _isExactValid(candidate, cfg) ? candidate : null;
}

function _normalizeCore(phone, country) {
  const prepared = _preparePhone(phone, country);
  if (!prepared) return null;

  const { cc, cfg } = prepared;
  let digits = prepared.digits;

  const trailingDialCodeCandidate = _trailingDialCodeCandidate(digits, cfg);
  if (trailingDialCodeCandidate) {
    return { digits: trailingDialCodeCandidate, uncertain: false, correction: "trailing_dial_code" };
  }

  if (cc === "sa" && digits.length === 10 && digits.endsWith("0")) {
    digits = digits.slice(0, 9);
  }

  const validStart = _hasValidStart(digits, cfg);
  if (validStart && digits.length === cfg.length) return { digits, uncertain: false };
  if (cfg.rescueTrailingZero && validStart && digits.length === cfg.length - 1) {
    return { digits: digits + "0", uncertain: true };
  }

  if (cfg.startsWith.length) {
    const raw = prepared.digits;

    for (let i = raw.length - cfg.length; i >= 0; i--) {
      const candidate = raw.slice(i, i + cfg.length);
      if (candidate.length === cfg.length && cfg.startsWith.some((prefix) => candidate.startsWith(prefix))) {
        return { digits: candidate, uncertain: false };
      }
    }

    if (cfg.rescueTrailingZero) {
      for (let i = raw.length - (cfg.length - 1); i >= 0; i--) {
        const candidate = raw.slice(i, i + cfg.length - 1);
        if (candidate.length === cfg.length - 1 && cfg.startsWith.some((prefix) => candidate.startsWith(prefix))) {
          return { digits: candidate + "0", uncertain: true };
        }
      }
    }
  }

  return null;
}

function normalizePhone(phone, country) {
  const result = _normalizeCore(phone, country);
  return result ? result.digits : null;
}

function normalizePhoneWithMeta(phone, country) {
  return _normalizeCore(phone, country);
}

/**
 * Return the small set of plausible phones used when creating new orders.
 *
 * Existing normalization deliberately remains single-valued. Candidate expansion
 * is opt-in so historical Taager imports, dashboards, and account matching cannot
 * suddenly duplicate records.
 */
function normalizePhoneCandidatesWithMeta(phone, country) {
  const prepared = _preparePhone(phone, country);
  const legacy = _normalizeCore(phone, country);
  if (!prepared) return legacy ? [legacy] : [];

  const { cfg, digits: raw } = prepared;
  const excess = raw.length - cfg.length;
  const candidates = [];
  const seen = new Set();
  const add = (digits, correction, uncertain = false) => {
    if (!_isExactValid(digits, cfg) || seen.has(digits)) return;
    seen.add(digits);
    candidates.push({ digits, uncertain, correction });
  };

  const trailingDialCodeCandidate = _trailingDialCodeCandidate(raw, cfg);
  if (trailingDialCodeCandidate) {
    add(trailingDialCodeCandidate, "trailing_dial_code");
    if (candidates.length) return candidates;
  }

  // A common domestic-prefix correction typo:
  //   intended 058... -> typed 5, inserted 0, then continued -> 50...
  // Keep exactly two interpretations: remove that second 0, or trim the
  // trailing extra digit(s). Explicit left trimming avoids the legacy
  // right-to-left window search choosing an unintended Egypt/Oman window.
  if ((excess === 1 || excess === 2) && raw[1] === "0") {
    const withoutMisplacedZero = raw[0] + raw.slice(2);
    add(withoutMisplacedZero.slice(0, cfg.length), "misplaced_domestic_zero");
    add(raw.slice(0, cfg.length), "trailing_extra_digits");
    if (candidates.length) return candidates;
  }

  // For prefix-constrained countries, an overlong value can contain more than
  // one complete valid window. Preserve all distinct windows, capped naturally
  // at three because only one or two excess digits are considered here.
  if ((excess === 1 || excess === 2) && cfg.startsWith.length) {
    for (let i = 0; i <= excess; i++) {
      add(raw.slice(i, i + cfg.length), "valid_sliding_window");
    }
    if (candidates.length) return candidates;
  }

  if (legacy) add(legacy.digits, legacy.uncertain ? "trailing_zero_rescue" : "legacy", legacy.uncertain);
  return candidates;
}

function formatPhone(phone, country) {
  const cc = normalizeTaagerCountry(country || DEFAULT_COUNTRY);
  const cfg = COUNTRY_CONFIG[cc];
  if (!cfg) return null;
  const core = normalizePhone(phone, cc);
  return core ? cfg.dialCode + core : null;
}

function formatPhone966(phone) {
  return formatPhone(phone, "sa");
}

module.exports = {
  normalizePhone,
  normalizePhoneWithMeta,
  normalizePhoneCandidatesWithMeta,
  formatPhone,
  formatPhone966,
  COUNTRY_CONFIG,
  COUNTRY_PHONE_RULES,
};
