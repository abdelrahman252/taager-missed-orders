"use strict";

const { COUNTRY_CONFIG } = require("./phone");
const { normalizeTaagerCountry } = require("./taager-country");

function normalizeText(value) {
  return String(value == null ? "" : value)
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function digitsOnly(value) {
  return normalizeText(value).replace(/\D/g, "");
}

function letterCount(value) {
  return (normalizeText(value).match(/\p{L}/gu) || []).length;
}

function digitCount(value) {
  return (normalizeText(value).match(/\d/g) || []).length;
}

function uniqueCharRatio(value) {
  const compact = compactText(value);
  if (!compact) return 0;
  return new Set(Array.from(compact)).size / compact.length;
}

function hasRepeatedGarbage(value, minRun = 4) {
  const compact = compactText(value);
  if (!compact) return false;
  const re = new RegExp(`(.)\\1{${Math.max(1, minRun - 1)},}`, "u");
  return re.test(compact);
}

function hasUnsafeSymbols(value) {
  return /https?:|www\.|@|[<>{}\[\]|]/i.test(normalizeText(value));
}

function hasEmoji(value) {
  return /\p{Extended_Pictographic}/u.test(normalizeText(value));
}

function isPlaceholder(value) {
  const text = normalizeText(value).toLowerCase();
  const compact = compactText(value).toLowerCase();
  return /^(test|testing|asdf|qwerty|xxx|none|null|na|n\/a|no name|noname|no address|لا|لا يوجد|لايوجد|مافي|مفيش)$/.test(text) ||
    /^(test|testing|asdf|qwerty|xxx|none|null|na|noname|noaddress|لا|لايوجد|مافي|مفيش)$/.test(compact);
}

function textContainsPhone(value, rawPhone, normPhone) {
  const textDigits = digitsOnly(value);
  if (!textDigits) return false;
  const rawDigits = digitsOnly(rawPhone);
  const normalized = digitsOnly(normPhone);
  return Boolean(
    normalized && (textDigits.includes(normalized) || normalized.includes(textDigits)) ||
    rawDigits && (textDigits.includes(rawDigits) || rawDigits.includes(textDigits))
  );
}

function textContainsLongPhone(value, rawPhone, normPhone, minDigits = 7) {
  const textDigits = digitsOnly(value);
  if (textDigits.length < minDigits) return false;
  const candidates = [digitsOnly(normPhone), digitsOnly(rawPhone)].filter((phone) => phone.length >= minDigits);
  return candidates.some((phone) => textDigits.includes(phone) || phone.includes(textDigits));
}

function assessCustomerName(value, options = {}) {
  const text = normalizeText(value);
  const compact = compactText(text);
  const issues = [];
  const strong = [];

  if (!text) strong.push("missing");
  if (isPlaceholder(text)) strong.push("placeholder");
  if (hasUnsafeSymbols(text)) strong.push("unsafe_symbols");
  if (hasEmoji(text)) strong.push("emoji");
  if (hasRepeatedGarbage(text, 4)) strong.push("repeated_chars");

  const letters = letterCount(text);
  const digits = digitCount(text);
  if (digits > 0 && digits >= Math.max(1, letters)) strong.push("mostly_digits");
  else if (digits > 0 && letters > 0) strong.push("mixed_letters_digits");
  if (textContainsPhone(text, options.rawPhone, options.normPhone)) strong.push("phone_like");
  if (text.length > 55) strong.push("too_long");

  if (compact && compact.length <= 2 && letters < 2) issues.push("too_short");
  if (compact.length >= 8 && uniqueCharRatio(compact) < 0.28) issues.push("low_variety");

  const bad = strong.length > 0 || issues.length >= 2;
  return {
    ok: !bad,
    issues: [...strong, ...issues],
    severity: strong.length ? "strong" : (issues.length ? "weak" : "ok"),
  };
}

function assessCustomerAddress(value, options = {}) {
  const text = normalizeText(value);
  const compact = compactText(text);
  const issues = [];
  const strong = [];

  if (!text) strong.push("missing");
  if (isPlaceholder(text)) strong.push("placeholder");
  if (hasUnsafeSymbols(text)) strong.push("unsafe_symbols");
  if (hasEmoji(text)) strong.push("emoji");
  if (hasRepeatedGarbage(text, 5)) strong.push("repeated_chars");
  if (textContainsLongPhone(text, options.rawPhone, options.normPhone)) strong.push("phone_like");
  if (options.name && compact && compact === compactText(options.name)) strong.push("same_as_name");

  const letters = letterCount(text);
  const digits = digitCount(text);
  if (text && digits > 0 && digits >= Math.max(1, letters)) strong.push("mostly_digits");
  if (text.length > 160) issues.push("too_long");
  if (compact.length >= 20 && uniqueCharRatio(compact) < 0.18) strong.push("low_variety");
  else if (compact.length >= 10 && uniqueCharRatio(compact) < 0.25) issues.push("low_variety");

  const bad = strong.length > 0 || issues.length >= 2;
  return {
    ok: !bad,
    issues: [...strong, ...issues],
    severity: strong.length ? "strong" : (issues.length ? "weak" : "ok"),
  };
}

function phoneNameFallback(normPhone, country = "sa") {
  const phone = digitsOnly(normPhone);
  if (!phone) return "عميل";
  const cc = normalizeTaagerCountry(country || "sa");
  const cfg = COUNTRY_CONFIG[cc] || COUNTRY_CONFIG.sa;
  const prefix = cfg && cfg.domesticPrefix ? cfg.domesticPrefix : "";
  return prefix && !phone.startsWith(prefix) ? prefix + phone : phone;
}

function sanitizeCustomerFields(order, options = {}) {
  const country = options.country || order.country || "sa";
  const rawName = normalizeText(order.name);
  const rawAddress = normalizeText(order.address);
  const city = normalizeText(order.resolvedCity || order.city || options.cityFallback || "");
  const nameQuality = assessCustomerName(rawName, {
    rawPhone: order.rawPhone || order.phone,
    normPhone: order.normPhone,
  });
  const safeName = nameQuality.ok ? rawName : phoneNameFallback(order.normPhone, country);
  const addressQuality = assessCustomerAddress(rawAddress, {
    name: rawName,
    rawPhone: order.rawPhone || order.phone,
    normPhone: order.normPhone,
  });
  const safeAddress = addressQuality.ok ? rawAddress : city;

  return {
    ...order,
    rawCustomerName: rawName,
    rawCustomerAddress: rawAddress,
    name: safeName,
    address: safeAddress || rawAddress || null,
    customerQuality: {
      name: nameQuality,
      address: addressQuality,
      nameChanged: safeName !== rawName,
      addressChanged: (safeAddress || "") !== rawAddress,
    },
  };
}

module.exports = {
  normalizeText,
  compactText,
  assessCustomerName,
  assessCustomerAddress,
  phoneNameFallback,
  sanitizeCustomerFields,
};

