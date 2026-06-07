"use strict";

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

function _normalizeCore(phone, country) {
  if (!phone) return null;

  const cc = String(country || DEFAULT_COUNTRY).trim().toLowerCase();
  const cfg = COUNTRY_CONFIG[cc];
  if (!cfg) return null;

  let digits = toWesternDigits(phone).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(cfg.dialCode)) digits = digits.slice(cfg.dialCode.length);
  if (cfg.domesticPrefix && digits.startsWith(cfg.domesticPrefix)) {
    digits = digits.slice(cfg.domesticPrefix.length);
  }

  if (cc === "sa" && digits.length === 10 && digits.endsWith("0")) {
    digits = digits.slice(0, 9);
  }

  const validStart = !cfg.startsWith.length || cfg.startsWith.some((prefix) => digits.startsWith(prefix));
  if (validStart && digits.length === cfg.length) return { digits, uncertain: false };
  if (cfg.rescueTrailingZero && validStart && digits.length === cfg.length - 1) {
    return { digits: digits + "0", uncertain: true };
  }

  if (cfg.startsWith.length) {
    let raw = toWesternDigits(phone).replace(/\D/g, "");
    if (raw.startsWith("00")) raw = raw.slice(2);
    if (raw.startsWith(cfg.dialCode)) raw = raw.slice(cfg.dialCode.length);
    if (cfg.domesticPrefix && raw.startsWith(cfg.domesticPrefix)) raw = raw.slice(cfg.domesticPrefix.length);

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

function formatPhone(phone, country) {
  const cc = String(country || DEFAULT_COUNTRY).trim().toLowerCase();
  const cfg = COUNTRY_CONFIG[cc];
  if (!cfg) return null;
  const core = normalizePhone(phone, cc);
  return core ? cfg.dialCode + core : null;
}

function formatPhone966(phone) {
  return formatPhone(phone, "sa");
}

module.exports = { normalizePhone, normalizePhoneWithMeta, formatPhone, formatPhone966, COUNTRY_CONFIG, COUNTRY_PHONE_RULES };
