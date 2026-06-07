"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TaagerDashboardCurrencyCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_RATES = { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };
  const SUPPORTED = Object.keys(DEFAULT_RATES);

  function number(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function cleanCurrency(value, fallback) {
    const currency = String(value || fallback || "SAR").trim().toUpperCase();
    return SUPPORTED.indexOf(currency) === -1 ? String(fallback || "SAR").toUpperCase() : currency;
  }

  function countryCurrency(country, fallback) {
    const key = String(country || "").trim().toLowerCase();
    if (key === "eg" || key.indexOf("egypt") !== -1) return "EGP";
    if (key === "ae" || key.indexOf("emirates") !== -1 || key.indexOf("uae") !== -1) return "AED";
    if (key === "iq" || key.indexOf("iraq") !== -1) return "IQD";
    if (key === "om" || key.indexOf("oman") !== -1) return "OMR";
    if (key === "sa" || key.indexOf("saudi") !== -1) return "SAR";
    return cleanCurrency(fallback || "SAR", "SAR");
  }

  function ratesWithOverrides(options) {
    const source = options && options.rates && typeof options.rates === "object" ? options.rates : {};
    const rates = { ...DEFAULT_RATES };
    Object.keys(source).forEach((key) => {
      const currency = cleanCurrency(key, "");
      const value = number(source[key]);
      if (currency && value > 0) rates[currency] = value;
    });
    const egpRate = number(options && options.egpRate);
    if (egpRate > 0) rates.EGP = egpRate;
    return rates;
  }

  function convert(value, from, to, options) {
    const amount = number(value);
    const source = cleanCurrency(from, "SAR");
    const target = cleanCurrency(to, "SAR");
    if (source === target) return amount;
    const rates = ratesWithOverrides(options || {});
    const sourceRate = number(rates[source]) || DEFAULT_RATES[source] || 1;
    const targetRate = number(rates[target]) || DEFAULT_RATES[target] || 1;
    return (amount / sourceRate) * targetRate;
  }

  function snapshotFrom(meta) {
    const source = meta && typeof meta === "object" ? meta : {};
    return {
      rates: { ...(source.exchangeRates || source.rates || {}) },
      source: source.exchangeRateSource || source.source || "defaults",
      updatedAt: source.exchangeRatesUpdatedAt || source.updatedAt || "",
    };
  }

  return {
    DEFAULT_RATES,
    cleanCurrency,
    countryCurrency,
    convert,
    number,
    snapshotFrom,
  };
});
