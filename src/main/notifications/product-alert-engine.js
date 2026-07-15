"use strict";

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  channel: "telegram",
  scope: "all",
  accountIds: [],
  maxProductsPerMessage: 10,
  cooldownHours: 4,
  telegram: {
    mode: "backend",
    botToken: "",
    chatId: "",
  },
  rule: {
    enabled: true,
    ndrOperator: ">=",
    ndrThreshold: 20,
    minNetOrders: 20,
    profitStatus: "any",
  },
  cases: [
    {
      id: "case-high-ndr",
      label: "High NDR",
      enabled: true,
      rule: {
        enabled: true,
        ndrOperator: ">=",
        ndrThreshold: 20,
        minNetOrders: 20,
        profitStatus: "any",
      },
    },
    {
      id: "case-low-ndr",
      label: "Low NDR",
      enabled: false,
      rule: {
        enabled: true,
        ndrOperator: "<=",
        ndrThreshold: 10,
        minNetOrders: 20,
        profitStatus: "any",
      },
    },
  ],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function number(value, fallback = 0) {
  const parsed = Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeRule(input, fallback) {
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_SETTINGS.rule;
  const rule = input && typeof input === "object" ? input : {};
  return {
    enabled: rule.enabled !== false,
    ndrOperator: oneOf(text(rule.ndrOperator || base.ndrOperator), [">=", "<="], ">="),
    ndrThreshold: Math.min(100, Math.max(0, number(rule.ndrThreshold, base.ndrThreshold))),
    minNetOrders: Math.min(100000, Math.max(1, Math.round(number(rule.minNetOrders, base.minNetOrders)))),
    profitStatus: oneOf(text(rule.profitStatus || base.profitStatus), [
      "any",
      "profitable",
      "losing",
      "no_spend",
      "unknown",
    ], "any"),
  };
}

function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const settings = clone(DEFAULT_SETTINGS);
  settings.enabled = source.enabled === true;
  settings.channel = oneOf(text(source.channel || settings.channel), ["telegram"], "telegram");
  settings.scope = oneOf(text(source.scope || settings.scope), ["all", "selected"], "all");
  settings.accountIds = Array.isArray(source.accountIds) ? source.accountIds.map(text).filter(Boolean).slice(0, 100) : [];
  settings.maxProductsPerMessage = Math.min(20, Math.max(1, Math.round(number(source.maxProductsPerMessage, settings.maxProductsPerMessage))));
  settings.cooldownHours = Math.min(168, Math.max(1, Math.round(number(source.cooldownHours, settings.cooldownHours))));

  const telegram = source.telegram && typeof source.telegram === "object" ? source.telegram : {};
  settings.telegram = {
    mode: "backend",
    botToken: "",
    chatId: "",
  };

  settings.rule = normalizeRule(source.rule, settings.rule);

  const rawCases = Array.isArray(source.cases) && source.cases.length
    ? source.cases
    : DEFAULT_SETTINGS.cases.map((item, index) => index === 0 ? { ...item, rule: source.rule || item.rule } : item);
  settings.cases = rawCases.slice(0, 2).map((item, index) => {
    const fallback = DEFAULT_SETTINGS.cases[index] || DEFAULT_SETTINGS.cases[0];
    const caseRule = normalizeRule(item && item.rule || fallback.rule, fallback.rule);
    return {
      id: text(item && item.id) || fallback.id || `case-${index + 1}`,
      label: text(item && item.label) || fallback.label || `Case ${index + 1}`,
      enabled: item && item.enabled === true,
      rule: {
        ...caseRule,
        enabled: item && item.enabled === true,
      },
    };
  });
  while (settings.cases.length < 2) {
    const fallback = DEFAULT_SETTINGS.cases[settings.cases.length];
    settings.cases.push(clone(fallback));
  }
  if (!settings.cases.some((item) => item.enabled)) {
    settings.cases[0].enabled = true;
    settings.cases[0].rule.enabled = true;
  }
  settings.rule = clone(settings.cases[0].rule);

  return settings;
}

function publicSettings(settings) {
  const clean = normalizeSettings(settings);
  return {
    ...clean,
    telegram: {
      ...clean.telegram,
      botToken: clean.telegram.botToken ? "********" : "",
    },
  };
}

function classifySpend(product) {
  const spend = number(product && (product.allocatedAdSpend != null ? product.allocatedAdSpend : product.adSpend), 0);
  const campaignCount = number(product && product.campaignCount, 0);
  if (spend > 0) return "with_spend";
  if (campaignCount > 0) return "zero_spend";
  return "no_spend";
}

function classifyProfit(product) {
  const spendStatus = classifySpend(product);
  const netProfit = number(product && (product.netProfit != null ? product.netProfit : product.profitLoss), 0);
  if (spendStatus === "no_spend") return "no_spend";
  if (!Number.isFinite(netProfit)) return "unknown";
  if (netProfit > 0) return "profitable";
  if (netProfit < 0) return "losing";
  return "unknown";
}

function productNetOrders(product) {
  return number(product && (product.netOrderCount != null ? product.netOrderCount : (product.placedCount != null ? product.placedCount : product.totalOrders)), 0);
}

function productMatchesRule(product, rule) {
  const cleanRule = normalizeSettings({ rule }).rule;
  if (!cleanRule.enabled) return false;
  const netOrders = productNetOrders(product);
  if (netOrders < cleanRule.minNetOrders) return false;

  const ndr = number(product && product.ndrPct, 0);
  if (cleanRule.ndrOperator === ">=" && ndr < cleanRule.ndrThreshold) return false;
  if (cleanRule.ndrOperator === "<=" && ndr > cleanRule.ndrThreshold) return false;

  const profitStatus = classifyProfit(product);
  if (cleanRule.profitStatus !== "any" && profitStatus !== cleanRule.profitStatus) return false;
  return true;
}

function normalizeProduct(product) {
  const spend = number(product && (product.allocatedAdSpend != null ? product.allocatedAdSpend : product.adSpend), 0);
  const netProfit = number(product && (product.netProfit != null ? product.netProfit : product.profitLoss), 0);
  return {
    key: text(product && (product.key || product.id || product.sku || product.name)),
    name: text(product && (product.name || product.productName || product.product)) || "Unnamed product",
    sku: text(product && (product.sku || product.legacyKey || "")),
    country: text(product && product.country),
    netOrders: productNetOrders(product),
    delivered: number(product && (product.deliveredCount != null ? product.deliveredCount : product.deliveries), 0),
    ndrPct: number(product && product.ndrPct, 0),
    spend,
    spendStatus: classifySpend(product),
    cpa: number(product && product.cpa, 0),
    breakEvenCpa: number(product && product.breakEvenCpa, 0),
    averageProfit: number(product && product.averageProfit, 0),
    netProfit,
    profitStatus: classifyProfit(product),
    currency: text(product && (product.financialCurrency || product.currency)) || "SAR",
    campaignCount: number(product && product.campaignCount, 0),
  };
}

function normalizeMatchedProduct(product, alertCase) {
  const normalized = normalizeProduct(product);
  if (alertCase) {
    normalized.alertCase = {
      id: alertCase.id,
      label: alertCase.label,
      rule: alertCase.rule,
    };
  }
  return normalized;
}

function productSort(a, b) {
  return Math.abs(b.netProfit) - Math.abs(a.netProfit) || b.netOrders - a.netOrders || a.name.localeCompare(b.name);
}

function evaluateProducts(products, settings) {
  const clean = normalizeSettings(settings);
  const rows = Array.isArray(products) ? products : [];
  const activeCases = clean.cases.filter((item) => item && item.enabled);
  const matches = [];
  rows.forEach((product) => {
    activeCases.forEach((alertCase) => {
      if (productMatchesRule(product, alertCase.rule)) {
        matches.push(normalizeMatchedProduct(product, alertCase));
      }
    });
  });
  matches.sort(productSort);
  return {
    ok: true,
    rule: clean.rule,
    cases: activeCases,
    totalProducts: rows.length,
    matches,
  };
}

function productAlertKey(scope, product, rule) {
  const alertCase = product && product.alertCase || {};
  const ruleForKey = alertCase.rule || rule || {};
  const parts = [
    text(scope && scope.accountKey || "all"),
    text(scope && scope.dateFrom || ""),
    text(scope && scope.dateTo || ""),
    text(alertCase.id || ""),
    text(ruleForKey && ruleForKey.ndrOperator),
    String(number(ruleForKey && ruleForKey.ndrThreshold, 0)),
    String(number(ruleForKey && ruleForKey.minNetOrders, 0)),
    text(ruleForKey && ruleForKey.profitStatus),
    text(product && product.key),
    text(product && product.profitStatus),
    text(product && product.spendStatus),
  ];
  return parts.join("|");
}

function filterCooldown(matches, settings, state, scope, nowMs) {
  const clean = normalizeSettings(settings);
  const sent = state && state.sent && typeof state.sent === "object" ? state.sent : {};
  const cutoffMs = (nowMs || Date.now()) - clean.cooldownHours * 60 * 60 * 1000;
  const fresh = [];
  const skipped = [];
  matches.forEach((product) => {
    const key = productAlertKey(scope, product, clean.rule);
    const lastSentAt = Date.parse(sent[key] || "");
    if (lastSentAt && lastSentAt > cutoffMs) {
      skipped.push({ product, key, lastSentAt: sent[key] });
    } else {
      fresh.push({ product, key });
    }
  });
  return { fresh, skipped };
}

function markSent(state, sentItems, meta, nowIso) {
  const next = {
    version: 1,
    sent: { ...((state && state.sent) || {}) },
    history: Array.isArray(state && state.history) ? state.history.slice(0, 49) : [],
  };
  const sentAt = nowIso || new Date().toISOString();
  sentItems.forEach((item) => {
    if (item && item.key) next.sent[item.key] = sentAt;
  });
  next.history.unshift({
    id: "alert-" + Date.now(),
    sentAt,
    channel: "telegram",
    trigger: text(meta && meta.trigger || "manual"),
    period: {
      dateFrom: text(meta && meta.dateFrom || ""),
      dateTo: text(meta && meta.dateTo || ""),
    },
    productCount: sentItems.length,
    products: sentItems.slice(0, 10).map((item) => item.product || item),
  });
  next.history = next.history.slice(0, 50);
  return next;
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  publicSettings,
  classifySpend,
  classifyProfit,
  evaluateProducts,
  filterCooldown,
  markSent,
};
