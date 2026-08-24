"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CATALOG_VERSION = 1;
const DEFAULT_FOLDER = "trusted-sku-tier-catalogs";
const MAX_PRODUCT_NAMES = 30;

function cleanText(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

function normalizeSku(value) {
  return cleanText(value).replace(/[-_.]+$/g, "");
}

function normalizeScopeText(value) {
  return cleanText(value).toLowerCase();
}

function hashScope(scope) {
  const payload = [
    scope.taagerCountry,
    scope.taagerIdentity,
    scope.easyIdentity,
    scope.easyEmail,
    scope.easyStore,
    scope.accountId,
  ].map((value) => normalizeScopeText(value)).join("|");
  return crypto.createHash("sha1").update(payload || "default").digest("hex").slice(0, 16);
}

function buildCatalogScope(config = {}, country = "sa") {
  const taagerCountry = normalizeScopeText(config.taagerCountry || country || "sa") || "sa";
  const taagerIdentity = normalizeScopeText(
    config.taagerAffiliateCode || config.taagerEmail || config.taagerPhone || config.taagerUsername || "taager"
  ) || "taager";
  const easyEmail = normalizeScopeText(config.easyEmail || "");
  const easyStore = normalizeScopeText(config.easyStore || config.easyStoreName || "");
  const easyIdentity = normalizeScopeText(easyStore || easyEmail || config.label || "easyorders") || "easyorders";
  return {
    version: CATALOG_VERSION,
    taagerCountry,
    taagerIdentity,
    easyIdentity,
    easyEmail,
    easyStore,
    accountId: normalizeScopeText(config.id || config.accountId || ""),
    label: cleanText(config.label || ""),
  };
}

function emptyCatalog(scope = {}) {
  const now = new Date().toISOString();
  return {
    version: CATALOG_VERSION,
    scope,
    createdAt: now,
    updatedAt: now,
    entries: {},
  };
}

function catalogPathForScope(scope = {}, options = {}) {
  const baseDir = cleanText(
    options.baseDir || options.profilePath || process.env.TAAGER_SKU_CATALOG_DIR || path.join(process.cwd(), ".cache")
  );
  const fileName = `sku-tier-catalog-${hashScope(scope)}.json`;
  return path.join(baseDir, DEFAULT_FOLDER, fileName);
}

function loadTrustedSkuTierCatalog(scope = {}, options = {}) {
  const filePath = catalogPathForScope(scope, options);
  if (!fs.existsSync(filePath)) return emptyCatalog(scope);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || parsed.version !== CATALOG_VERSION) {
      return emptyCatalog(scope);
    }
    return {
      ...emptyCatalog(scope),
      ...parsed,
      scope: parsed.scope || scope,
      entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
    };
  } catch (err) {
    const catalog = emptyCatalog(scope);
    catalog.loadError = err && err.message || String(err);
    return catalog;
  }
}

function saveTrustedSkuTierCatalog(catalog = {}, scope = {}, options = {}) {
  const filePath = catalogPathForScope(scope, options);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    ...catalog,
    version: CATALOG_VERSION,
    scope,
    updatedAt: new Date().toISOString(),
    entries: catalog.entries && typeof catalog.entries === "object" ? catalog.entries : {},
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

function sortedUniqueProductNames(existing = [], incoming = "") {
  const seen = new Set();
  const values = [];
  for (const name of [...existing, incoming]) {
    const clean = cleanText(name);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    values.push(clean);
  }
  return values.slice(-MAX_PRODUCT_NAMES);
}

function ensureSkuEntry(catalog, sku, productName, now) {
  if (!catalog.entries[sku]) {
    catalog.entries[sku] = {
      sku,
      productNames: [],
      tiers: {},
      qtyCounts: {},
      sourceCounts: {},
      firstSeen: now,
      lastSeen: now,
    };
  }
  const entry = catalog.entries[sku];
  entry.productNames = sortedUniqueProductNames(entry.productNames || [], productName);
  entry.tiers = entry.tiers && typeof entry.tiers === "object" ? entry.tiers : {};
  entry.qtyCounts = entry.qtyCounts && typeof entry.qtyCounts === "object" ? entry.qtyCounts : {};
  entry.sourceCounts = entry.sourceCounts && typeof entry.sourceCounts === "object" ? entry.sourceCounts : {};
  entry.lastSeen = now;
  return entry;
}

function addParserCatalogEntry(catalog, parserEntry, source, now) {
  const sku = normalizeSku(parserEntry && parserEntry.sku);
  if (!sku) return 0;
  const prices = parserEntry && parserEntry.prices && typeof parserEntry.prices === "object" ? parserEntry.prices : {};
  const qtyCounts = parserEntry && parserEntry.qtyCounts && typeof parserEntry.qtyCounts === "object" ? parserEntry.qtyCounts : {};
  const priceCounts = parserEntry && parserEntry.priceCounts && typeof parserEntry.priceCounts === "object" ? parserEntry.priceCounts : {};
  let added = 0;
  for (const [qtyText, subtotalValue] of Object.entries(prices)) {
    const qty = Number(qtyText) || 0;
    const subtotal = Number(subtotalValue) || 0;
    if (qty <= 0 || subtotal <= 0) continue;
    const roundedSubtotal = String(Math.round(subtotal * 100) / 100);
    const qtyPriceCounts = priceCounts[qtyText] || priceCounts[qty] || {};
    const sampleCount = Math.max(1, Number(qtyPriceCounts[roundedSubtotal] || qtyPriceCounts[subtotal] || qtyCounts[qtyText] || qtyCounts[qty] || 0) || 1);
    const entry = ensureSkuEntry(catalog, sku, parserEntry.productName || sku, now);
    const qtyKey = String(qty);
    const subtotalKey = roundedSubtotal;
    if (!entry.tiers[qtyKey]) entry.tiers[qtyKey] = {};
    if (!entry.tiers[qtyKey][subtotalKey]) {
      entry.tiers[qtyKey][subtotalKey] = {
        subtotal: Number(subtotalKey),
        count: 0,
        sources: {},
        firstSeen: now,
        lastSeen: now,
      };
    }
    const tier = entry.tiers[qtyKey][subtotalKey];
    const previousSourceCount = Number(tier.sources[source] || 0) || 0;
    const sourceCount = Math.max(previousSourceCount, sampleCount);
    const delta = sourceCount - previousSourceCount;
    tier.count += delta;
    tier.sources[source] = sourceCount;
    tier.lastSeen = now;
    entry.qtyCounts[qtyKey] = (Number(entry.qtyCounts[qtyKey] || 0) || 0) + delta;
    entry.sourceCounts[source] = (Number(entry.sourceCounts[source] || 0) || 0) + delta;
    added += delta;
  }
  return added;
}

function updateTrustedSkuTierCatalog(previousCatalog = {}, inputs = {}) {
  const scope = inputs.scope || previousCatalog.scope || {};
  const now = inputs.now || new Date().toISOString();
  const catalog = {
    ...emptyCatalog(scope),
    ...previousCatalog,
    version: CATALOG_VERSION,
    scope,
    entries: previousCatalog.entries && typeof previousCatalog.entries === "object" ? { ...previousCatalog.entries } : {},
    updatedAt: now,
  };
  let learnedSamples = 0;
  for (const entry of Object.values(inputs.easyordersCatalog || {})) {
    learnedSamples += addParserCatalogEntry(catalog, entry, "easyorders_real", now);
  }
  for (const entry of Object.values(inputs.taagerCatalog || {})) {
    learnedSamples += addParserCatalogEntry(catalog, entry, "taager_orders", now);
  }
  for (const entry of Object.values(inputs.manualReviewCatalog || {})) {
    learnedSamples += addParserCatalogEntry(catalog, entry, "manual_review_approved", now);
  }
  catalog.learnedSamples = learnedSamples;
  return catalog;
}

function tierSourcePriority(tier = {}) {
  const sources = tier.sources && typeof tier.sources === "object" ? tier.sources : {};
  if (Number(sources.manual_review_approved || 0) > 0) return 4;
  if (Number(sources.easyorders_real || 0) > 0) return 3;
  if (Number(sources.taager_orders || 0) > 0) return 2;
  return 1;
}

function winningSubtotal(tierMap = {}) {
  return Object.values(tierMap)
    .filter((tier) => Number(tier && tier.subtotal || 0) > 0)
    .sort((a, b) => {
      const manualPriorityDiff = tierSourcePriority(b) === 4 || tierSourcePriority(a) === 4
        ? tierSourcePriority(b) - tierSourcePriority(a)
        : 0;
      if (manualPriorityDiff) return manualPriorityDiff;
      const countDiff = (Number(b.count || 0) || 0) - (Number(a.count || 0) || 0);
      if (countDiff) return countDiff;
      const sourceDiff = tierSourcePriority(b) - tierSourcePriority(a);
      if (sourceDiff) return sourceDiff;
      return new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime();
    })[0] || null;
}

function trustedCatalogToParserCatalog(catalog = {}) {
  const result = {};
  const entries = catalog.entries && typeof catalog.entries === "object" ? catalog.entries : {};
  for (const entry of Object.values(entries)) {
    const sku = normalizeSku(entry && entry.sku);
    if (!sku) continue;
    const prices = {};
    const qtyCounts = {};
    const priceCounts = {};
    for (const [qtyText, tierMap] of Object.entries(entry.tiers || {})) {
      const qty = Number(qtyText) || 0;
      if (qty <= 0) continue;
      const winner = winningSubtotal(tierMap);
      if (!winner) continue;
      prices[String(qty)] = Number(winner.subtotal);
      qtyCounts[String(qty)] = Math.max(1, Number(entry.qtyCounts && entry.qtyCounts[qtyText] || 0) || Number(winner.count || 1) || 1);
      priceCounts[String(qty)] = {};
      for (const tier of Object.values(tierMap || {})) {
        const subtotal = Number(tier && tier.subtotal || 0) || 0;
        if (subtotal > 0) priceCounts[String(qty)][String(subtotal)] = Number(tier.count || 0) || 0;
      }
    }
    const qtys = Object.keys(prices).map(Number).filter((qty) => qty > 0).sort((a, b) => a - b);
    if (!qtys.length) continue;
    const totalSamples = Object.values(qtyCounts).reduce((sum, count) => sum + (Number(count) || 0), 0);
    const dominant = qtys
      .map((qty) => ({ qty, count: Number(qtyCounts[String(qty)] || 0) || 0 }))
      .sort((a, b) => (b.count - a.count) || (a.qty - b.qty))[0] || { qty: qtys[0], count: 0 };
    const productName = cleanText((entry.productNames || [])[0] || sku);
    result[`persisted:${sku}`] = {
      sku,
      productName,
      productNames: entry.productNames || [],
      minQty: qtys[0],
      maxQty: qtys[qtys.length - 1],
      prices,
      priceCounts,
      qtyCounts,
      totalSamples,
      dominantQty: dominant.qty,
      dominantQtyCount: dominant.count,
      dominantQtyConfidence: totalSamples > 0 ? dominant.count / totalSamples : 0,
      source: "persistent_catalog",
    };
  }
  return result;
}

function trustedCatalogStats(catalog = {}) {
  const entries = catalog.entries && typeof catalog.entries === "object" ? catalog.entries : {};
  let tiers = 0;
  let samples = 0;
  for (const entry of Object.values(entries)) {
    for (const [qty, tierMap] of Object.entries(entry.tiers || {})) {
      if (Number(qty) > 0) tiers += Object.keys(tierMap || {}).length;
    }
    samples += Object.values(entry.qtyCounts || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }
  return { entries: Object.keys(entries).length, tiers, samples };
}

module.exports = {
  CATALOG_VERSION,
  buildCatalogScope,
  catalogPathForScope,
  loadTrustedSkuTierCatalog,
  saveTrustedSkuTierCatalog,
  updateTrustedSkuTierCatalog,
  trustedCatalogStats,
  trustedCatalogToParserCatalog,
};
