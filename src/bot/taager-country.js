"use strict";

const COUNTRY_ALIASES = {
  sa: "sa",
  sau: "sa",
  ksa: "sa",
  saudi: "sa",
  saudiarabia: "sa",
  saudiarabiasa: "sa",
  eg: "eg",
  egy: "eg",
  egypt: "eg",
  masr: "eg",
  iq: "iq",
  irq: "iq",
  iraq: "iq",
  ae: "ae",
  are: "ae",
  uae: "ae",
  emirates: "ae",
  unitedarabemirates: "ae",
  om: "om",
  omn: "om",
  oman: "om",
};

const TAAGER_COUNTRY_CART_CODES = {
  sa: "SAU",
  eg: "EGY",
  ae: "ARE",
  iq: "IRQ",
  om: "OMN",
};

const TAAGER_COUNTRY_NAMES = {
  sa: ["السعودية", "المملكة العربية السعودية", "Saudi Arabia", "KSA", "SA", "SAU"],
  eg: ["مصر", "Egypt", "EG", "EGY"],
  ae: ["الإمارات", "الامارات", "الإمارات العربية المتحدة", "United Arab Emirates", "UAE", "AE", "ARE"],
  iq: ["العراق", "Iraq", "IQ", "IRQ"],
  om: ["عمان", "Oman", "OM", "OMN"],
};

function normalizeTaagerCountry(value, fallback = "sa") {
  const raw = String(value || fallback || "sa").trim().toLowerCase();
  const compact = raw.replace(/[^a-z0-9]+/g, "");
  return COUNTRY_ALIASES[compact] || COUNTRY_ALIASES[raw] || compact || "sa";
}

function taagerUrl(country, pathname) {
  return `https://taager.com/${normalizeTaagerCountry(country)}${pathname}`;
}

module.exports = {
  normalizeTaagerCountry,
  taagerUrl,
  TAAGER_COUNTRY_CART_CODES,
  TAAGER_COUNTRY_NAMES,
};
