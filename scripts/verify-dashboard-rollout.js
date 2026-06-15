"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");
const { buildCampaignIntelligence, filterAndPage } = require("../src/renderer/pages/dashboard/dashboard-campaign-query-core");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyMinor(value) {
  return Math.round(number(value) * 100);
}

function cleanCurrency(value, fallback = "SAR") {
  const next = text(value || fallback).toUpperCase();
  return ["USD", "SAR", "EGP", "AED", "IQD", "OMR"].includes(next) ? next : fallback;
}

function convert(value, from, to, input) {
  const source = cleanCurrency(from);
  const target = cleanCurrency(to, source);
  if (source === target) return number(value);
  const rates = Object.assign({ USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 }, input.exchangeRates || {});
  return number(value) / number(rates[source] || 1) * number(rates[target] || 1);
}

function countryCurrency(country) {
  const key = lower(country);
  if (key === "eg" || key.includes("egypt")) return "EGP";
  if (key === "ae" || key.includes("emirates")) return "AED";
  if (key === "iq" || key.includes("iraq")) return "IQD";
  if (key === "om" || key.includes("oman")) return "OMR";
  return "SAR";
}

function dateKey(value) {
  if (!value) return "";
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function statusBucket(row) {
  const explicit = text(row.orderStatusBucket || row.exactStatusBucket || row.statusBucket);
  if (explicit) return explicit;
  const status = lower(row.orderStatus || row.status);
  if (status.includes("canceled_by_you")) return "canceled_by_you";
  if (status.includes("delivered")) return "delivered";
  if (status.includes("shipping")) return "shipping";
  if (status.includes("confirmed")) return "confirmed";
  if (status.includes("received") || status.includes("pending")) return "received";
  if (status.includes("failed") || status.includes("return")) return "failed";
  return status || "other";
}

function rowProfit(row) {
  if (row && row.dashboardCommission != null) return number(row.dashboardCommission);
  const orderProfit = number(row && (row.profit != null ? row.profit : (row.orderProfit != null ? row.orderProfit : row.profitBeforeTax)));
  let taxProfit = number(row && (row.taxProfit != null ? row.taxProfit : (row.taagerTaxProfit != null ? row.taagerTaxProfit : row.taagerFees)));
  if (orderProfit > 0 && taxProfit > orderProfit) {
    while (taxProfit > orderProfit && taxProfit >= 1) taxProfit = taxProfit / 10;
  }
  if (orderProfit > 0 || taxProfit > 0) return orderProfit - taxProfit;
  return number(row && (row.profitAfterTax != null ? row.profitAfterTax : row.taagerProfit != null ? row.taagerProfit : row.commission));
}

function orderKey(row, fallback) {
  const accountId = text(row.accountId || row.dashboardAccountId);
  const direct = text(row.taagerOrderNumber || row.orderNumber || row.orderId || row.id || row.reference);
  return accountId + "|" + (direct ? "id:" + direct : "row:" + fallback);
}

function stableRow(row) {
  return [
    text(row.accountId || row.dashboardAccountId),
    text(row.orderScopeKey || row.key || row.legacyKey || row.campaignId || row.id || row.taagerOrderNumber || row.orderNumber || row.sku || row.name || row.campaign),
  ].join("|");
}

function compareRows(sortBy, sortDir) {
  const factor = sortDir === "asc" ? 1 : -1;
  return (a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    let result = 0;
    if (typeof av === "number" || typeof bv === "number") result = (number(av) - number(bv)) * factor;
    else result = text(av).localeCompare(text(bv)) * factor;
    return result || stableRow(a).localeCompare(stableRow(b));
  };
}

function normalizeScope(input, allowedIds) {
  const requestedAccountIds = Array.from(new Set((input.accountIds || []).map(text).filter(Boolean)));
  const allowed = new Set((allowedIds || []).map(text).filter(Boolean));
  const accountIds = Array.from(new Set((requestedAccountIds.length ? requestedAccountIds : Array.from(allowed)).filter((id) => allowed.has(id)))).sort();
  return {
    accountIds,
    requestedAccountIds,
    ignoredAccountIds: requestedAccountIds.filter((id) => !allowed.has(id)),
    accountCount: accountIds.length,
    dateFrom: dateKey(input.dateFrom),
    dateTo: dateKey(input.dateTo),
  };
}

function scopedRows(accounts, allowedIds, input) {
  const scope = normalizeScope(input, allowedIds);
  const rows = [];
  scope.accountIds.forEach((accountId) => {
    const account = accounts[accountId] || {};
    (account.snapshot || []).forEach((row) => {
      const rowDate = dateKey(row.createdAt || row.date || row.dashboardDate);
      if (scope.dateFrom && rowDate < scope.dateFrom) return;
      if (scope.dateTo && rowDate > scope.dateTo) return;
      const nativeCurrency = cleanCurrency(row.nativeCurrency || row.orderCurrency || row.currency || countryCurrency(row.taagerCountry || row.country || account.country));
      const reportingCurrency = cleanCurrency(input.reportingCurrency || input.currency || "SAR");
      const nativeTotalPrice = row.nativeTotalPrice != null ? number(row.nativeTotalPrice) : number(row.dashboardTotalPrice || row.totalPrice || row.total || row.orderValue);
      const nativeCommission = row.nativeCommission != null
        ? number(row.nativeCommission)
        : (row.nativeProfitAfterTax != null ? number(row.nativeProfitAfterTax) : rowProfit(row));
      rows.push(Object.assign({}, row, {
        accountId,
        dashboardAccountId: accountId,
        accountLabel: row.accountLabel || account.label || accountId,
        nativeCurrency,
        reportingCurrency,
        nativeTotalPrice,
        nativeCommission,
        dashboardTotalPrice: convert(nativeTotalPrice, nativeCurrency, reportingCurrency, input),
        totalPrice: convert(nativeTotalPrice, nativeCurrency, reportingCurrency, input),
        dashboardCommission: convert(nativeCommission, nativeCurrency, reportingCurrency, input),
        profitAfterTax: convert(nativeCommission, nativeCurrency, reportingCurrency, input),
        taagerProfit: convert(nativeCommission, nativeCurrency, reportingCurrency, input),
      }));
    });
  });
  return { rows, scope };
}

function paginate(rows, input) {
  if (input.allRows) return { page: 1, pageSize: Math.max(1, rows.length), total: rows.length, totalPages: 1, start: 0, end: rows.length };
  const pageSize = Math.min(100, Math.max(1, number(input.pageSize) || 25));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, number(input.page) || 1));
  const start = (page - 1) * pageSize;
  return { page, pageSize, total: rows.length, totalPages, start, end: Math.min(start + pageSize, rows.length) };
}

function legacyOrders(accounts, allowedIds, input) {
  const scoped = scopedRows(accounts, allowedIds, input);
  const grouped = new Map();
  scoped.rows.forEach((row, index) => {
    const key = orderKey(row, index);
    if (!grouped.has(key)) {
      const commission = rowProfit(row);
      grouped.set(key, Object.assign({}, row, {
        orderScopeKey: key,
        nativeTotalPrice: 0,
        nativeCommission: number(row.nativeCommission),
        dashboardCommission: commission,
        dashboardTotalPrice: 0,
        totalPrice: 0,
        profitAfterTax: commission,
        taagerProfit: commission,
        commission,
        products: [],
        skus: [],
        itemCount: 0,
      }));
    }
    const order = grouped.get(key);
    order.nativeTotalPrice += number(row.nativeTotalPrice);
    order.dashboardTotalPrice += number(row.dashboardTotalPrice);
    order.totalPrice = order.dashboardTotalPrice;
    order.itemCount += 1;
    if (row.products || row.productName || row.product) order.products.push(text(row.products || row.productName || row.product));
    if (row.sku || row.skuNumber) order.skus.push(text(row.sku || row.skuNumber));
  });
  let rows = Array.from(grouped.values()).map((row) => Object.assign({}, row, {
    products: row.products.join(", "),
    sku: row.skus.join(", "),
    statusBucket: statusBucket(row),
    dashboardDate: dateKey(row.createdAt || row.date || row.dashboardDate),
  }));
  if (!input.includeCanceled) rows = rows.filter((row) => statusBucket(row) !== "canceled_by_you");
  rows.sort(compareRows(input.sortBy || "dashboardDate", input.sortDir === "asc" ? "asc" : "desc"));
  const pagination = paginate(rows, input);
  const statusBreakdown = {};
  const accountBreakdown = {};
  rows.forEach((row) => {
    const bucket = statusBucket(row);
    statusBreakdown[bucket] = (statusBreakdown[bucket] || 0) + 1;
    if (!accountBreakdown[row.accountId]) accountBreakdown[row.accountId] = { accountId: row.accountId, rawOrders: 0, delivered: 0, totalValue: 0, totalProfit: 0 };
    accountBreakdown[row.accountId].rawOrders += 1;
    if (bucket === "delivered") accountBreakdown[row.accountId].delivered += 1;
    accountBreakdown[row.accountId].totalValue += number(row.dashboardTotalPrice);
    accountBreakdown[row.accountId].totalProfit += number(row.profitAfterTax);
  });
  return {
    scope: scoped.scope,
    summary: {
      rawOrders: rows.length,
      delivered: rows.filter((row) => statusBucket(row) === "delivered").length,
      totalValue: rows.reduce((sum, row) => sum + number(row.dashboardTotalPrice), 0),
      totalProfit: rows.reduce((sum, row) => sum + number(row.profitAfterTax), 0),
      statusBreakdown,
      accountBreakdown: Object.values(accountBreakdown).sort(compareRows("accountId", "asc")),
    },
    rows: rows.slice(pagination.start, pagination.end),
    pagination,
    allRows: rows,
  };
}

function legacyCampaignRows(accounts, scope, input) {
  const reportingCurrency = cleanCurrency(input.reportingCurrency || "SAR");
  const campaigns = [];
  scope.accountIds.forEach((accountId) => {
    const account = accounts[accountId] || {};
    const marketing = account.marketing || {};
    Object.keys(marketing).forEach((platform) => {
      if (input.platform && input.platform !== "all" && input.platform !== platform) return;
      const status = marketing[platform] || {};
      const rows = status.summary && status.summary.campaignBreakdown || [];
      rows.forEach((row, index) => {
        const rawCurrency = cleanCurrency(row.rawCurrency || row.currency || status.summary.currency || status.currency || "SAR");
        const rawSpend = number(row.rawSpend != null ? row.rawSpend : row.spend);
        campaigns.push(Object.assign({}, row, {
          accountId,
          dashboardAccountId: accountId,
          country: row.country || account.country || account.taagerCountry || "",
          platform,
          rawCurrency,
          rawSpend,
          currency: reportingCurrency,
          spend: convert(rawSpend, rawCurrency, reportingCurrency, input),
          _stableKey: [accountId, platform, row.campaignId || row.id || row.campaign || row.name || index].map(text).join("|"),
        }));
      });
    });
  });
  return campaigns;
}

function legacyCampaignOverview(accounts, allowedIds, input) {
  const scoped = scopedRows(accounts, allowedIds, input);
  const intel = buildCampaignIntelligence({
    orderRows: scoped.rows,
    campaignRows: legacyCampaignRows(accounts, scoped.scope, input),
    reportingCurrency: input.reportingCurrency || "SAR",
    orderCurrency: input.orderCurrency || input.reportingCurrency || "SAR",
    exchangeRates: input.exchangeRates || {},
  });
  const pages = filterAndPage(intel, input);
  return { scope: scoped.scope, intel, pages };
}

function assertMinorEqual(label, actual, expected) {
  assert.equal(moneyMinor(actual), moneyMinor(expected), label);
}

function assertSignature(label, actualRows, expectedRows) {
  assert.deepEqual(actualRows.map(stableRow), expectedRows.map(stableRow), label);
}

function assertBreakdown(label, actual, expected) {
  assert.deepEqual(
    Object.keys(actual || {}).sort().map((key) => [key, moneyMinor(actual[key])]),
    Object.keys(expected || {}).sort().map((key) => [key, moneyMinor(expected[key])]),
    label
  );
}

function fixtureAccounts() {
  return {
    sa: {
      country: "sa",
      label: "Saudi Account",
      snapshot: [
        { taagerOrderNumber: "DUP-1", createdAt: "2026-05-10", orderStatusBucket: "delivered", taagerCountry: "sa", sku: "SKU-1", products: "Product One", nativeCurrency: "SAR", nativeTotalPrice: 100, nativeCommission: 20, qty: 1, city: "Riyadh" },
        { taagerOrderNumber: "DUP-1", createdAt: "2026-05-10", orderStatusBucket: "delivered", taagerCountry: "sa", sku: "SKU-2", products: "Product Two", nativeCurrency: "SAR", nativeTotalPrice: 50, nativeCommission: 10, qty: 1, city: "Riyadh" },
        { taagerOrderNumber: "SA-2", createdAt: "2026-05-11", orderStatusBucket: "confirmed", taagerCountry: "sa", sku: "SKU-SAME", products: "Shared Saudi Product", nativeCurrency: "SAR", nativeTotalPrice: 200, nativeCommission: 40, qty: 2, city: "Jeddah" },
        { taagerOrderNumber: "SA-CANCEL", createdAt: "2026-05-12", orderStatusBucket: "canceled_by_you", taagerCountry: "sa", sku: "SKU-C", products: "Canceled Product", nativeCurrency: "SAR", nativeTotalPrice: 100, nativeCommission: 10, qty: 1, city: "Riyadh" },
      ],
      marketing: { facebook: { summary: { currency: "SAR", campaignBreakdown: [
        { campaignId: "c-sa-1", campaign: "Scale SKU-1", country: "sa", objective: "sales", spend: 100, currency: "SAR", clicks: 20, impressions: 1000 },
        { campaignId: "c-sa-wrong", campaign: "Scale SKU-EG", country: "eg", objective: "sales", spend: 40, currency: "SAR", clicks: 5, impressions: 500 },
      ] } } },
    },
    eg: {
      country: "eg",
      label: "Egypt Account",
      snapshot: [
        { taagerOrderNumber: "DUP-1", createdAt: "2026-05-10", orderStatusBucket: "delivered", taagerCountry: "eg", sku: "SKU-EG", products: "Egypt Product", nativeCurrency: "EGP", nativeTotalPrice: 520, nativeCommission: 52, qty: 1, city: "Cairo" },
        { taagerOrderNumber: "EG-2", createdAt: "2026-05-13", orderStatusBucket: "failed", taagerCountry: "eg", sku: "SKU-SAME", products: "Shared Egypt Product", nativeCurrency: "EGP", nativeTotalPrice: 260, nativeCommission: 26, qty: 1, city: "Giza" },
      ],
      marketing: { facebook: { summary: { currency: "EGP", campaignBreakdown: [
        { campaignId: "c-eg-1", campaign: "Scale SKU-EG", country: "eg", objective: "sales", spend: 520, currency: "EGP", clicks: 10, impressions: 800 },
        { campaignId: "c-eg-u", campaign: "Unknown campaign", country: "eg", objective: "leads", spend: 260, currency: "EGP", clicks: 4, impressions: 400 },
      ] } } },
    },
    sa2: {
      country: "sa",
      label: "Saudi Second",
      snapshot: [
        { taagerOrderNumber: "SA2-1", createdAt: "2026-05-14", orderStatusBucket: "delivered", taagerCountry: "sa", sku: "SKU-SAME", products: "Shared Saudi Product", nativeCurrency: "SAR", nativeTotalPrice: 90, nativeCommission: 15, qty: 1, city: "Dammam" },
      ],
      marketing: { tiktok: { summary: { currency: "USD", campaignBreakdown: [
        { campaignId: "c-sa2-1", campaign: "Scale SKU-SAME", country: "sa", objective: "sales", spend: 10, currency: "USD", clicks: 8, impressions: 700 },
      ] } } },
    },
  };
}

function compareOrders(service, accounts, allowedIds) {
  const input = {
    kind: "orders",
    accountIds: ["eg", "sa", "sa2", "not-allowed", "eg"],
    dateFrom: "2026-05-01",
    dateTo: "2026-05-31",
    reportingCurrency: "SAR",
    exchangeRates: { USD: 1, SAR: 3.75, EGP: 52 },
    sortBy: "dashboardTotalPrice",
    sortDir: "desc",
    page: 1,
    pageSize: 3,
  };
  const legacy = legacyOrders(accounts, allowedIds, input);
  const query = service.query(input);
  assert.equal(query.ok, true);
  assert.deepEqual(query.scope.accountIds, legacy.scope.accountIds, "Orders scope is canonical");
  assert.deepEqual(query.scope.ignoredAccountIds, ["not-allowed"], "Unauthorized account IDs are ignored and returned");
  assert.equal(query.pagination.total, legacy.pagination.total, "Orders total matches legacy");
  assert.equal(query.summary.rawOrders, legacy.summary.rawOrders, "Orders raw count matches legacy");
  assert.equal(query.summary.delivered, legacy.summary.delivered, "Orders delivered count matches legacy");
  assertMinorEqual("Orders total value matches legacy", query.summary.totalValue, legacy.summary.totalValue);
  assertMinorEqual("Orders total profit matches legacy", query.summary.totalProfit, legacy.summary.totalProfit);
  assertBreakdown("Orders status breakdown matches legacy", query.summary.statusBreakdown, legacy.summary.statusBreakdown);
  assertSignature("Orders global first page order matches legacy", query.rows, legacy.rows);
  assert.equal(query.pagination.total, 5, "Duplicate order numbers remain separate across accounts while same-account items merge");
  const exportQuery = service.query(Object.assign({}, input, { allRows: true, page: 1 }));
  assert.equal(exportQuery.rows.length, query.pagination.total, "Orders export returns every filtered row");
  assertSignature("Orders export keeps backend global order", exportQuery.rows, legacy.allRows);
  const changedRate = service.query(Object.assign({}, input, { exchangeRates: { USD: 1, SAR: 3.75, EGP: 26 } }));
  assert.notEqual(moneyMinor(changedRate.summary.totalValue), moneyMinor(query.summary.totalValue), "Exchange-rate changes invalidate cached totals");
}

function compareProducts(service, accounts, allowedIds) {
  const input = {
    kind: "products",
    accountIds: ["sa", "eg", "sa2"],
    reportingCurrency: "SAR",
    exchangeRates: { USD: 1, SAR: 3.75, EGP: 52 },
    sortBy: "deliveredCount",
    sortDir: "desc",
    allRows: true,
    page: 1,
  };
  const query = service.query(input);
  assert.equal(query.ok, true);
  const rowsByKey = new Map((query.rows || []).map((row) => [row.key, row]));
  const sharedSaudi = rowsByKey.get("sa|sku:sku-same");
  const sharedEgypt = rowsByKey.get("eg|sku:sku-same");
  assert.ok(sharedSaudi, "Products with the same Saudi SKU combine across accounts");
  assert.ok(sharedEgypt, "Products with the same SKU but different country stay separate");
  assert.equal(sharedSaudi.accountCount, 2, "Saudi duplicate SKU has two accounts");
  assert.equal(sharedSaudi.totalOrders, 2, "Saudi duplicate SKU totals match legacy aggregation");
  assert.equal(sharedEgypt.totalOrders, 1, "Egypt same SKU is isolated by country");
  assert.ok((rowsByKey.get("sa|sku:sku-1") || {}).adSpend > 0, "Matched campaign spend attaches to the matching product");
  assert.equal((rowsByKey.get("eg|sku:sku-eg") || {}).adSpend > 0, true, "EGP campaign spend attaches after reporting-currency conversion");
  const details = service.query({ kind: "product-details", accountIds: ["sa", "eg", "sa2"], productKeys: ["sa|sku:sku-same"], reportingCurrency: "SAR", exchangeRates: input.exchangeRates });
  assert.equal(details.ok, true);
  assert.ok(details.details["sa|sku:sku-same"], "Lazy product details are available for rollout comparison");
  const options = service.query({ kind: "product-options", accountIds: ["sa", "eg", "sa2"], reportingCurrency: "SAR", exchangeRates: input.exchangeRates });
  assert.equal(options.ok, true);
  assert.equal(options.rows.length, query.pagination.total, "Product options match product total");
}

function compareCampaigns(service, accounts, allowedIds) {
  const input = {
    kind: "campaign-overview",
    accountIds: ["sa", "eg", "sa2"],
    reportingCurrency: "SAR",
    exchangeRates: { USD: 1, SAR: 3.75, EGP: 52 },
    platform: "all",
    campaignPage: 1,
    productPage: 1,
    pageSize: 50,
  };
  const legacy = legacyCampaignOverview(accounts, allowedIds, input);
  const query = service.query(input);
  assert.equal(query.ok, true);
  assert.equal(query.campaignPagination.total, legacy.pages.campaignPage.pagination.total, "Campaign count matches legacy");
  assert.equal(query.productPagination.total, legacy.pages.productPage.pagination.total, "Product Action count matches legacy");
  ["campaignCount", "spend", "matchedSpend", "unmatchedSpend", "taagerOrders", "taagerDelivered", "taagerProfit", "netProfit"].forEach((field) => {
    assertMinorEqual("Campaign total " + field + " matches legacy", query.totals[field], legacy.intel.totals[field]);
  });
  assert.deepEqual(query.objectives, legacy.intel.objectives, "Campaign objectives match legacy");
  assertBreakdown("Campaign decision counts match legacy", query.decisionCounts, legacy.intel.decisionCounts);
  assertSignature("Campaign first page order matches legacy", query.campaignRows, legacy.pages.campaignPage.rows);
  assertSignature("Product Action first page order matches legacy", query.productRows, legacy.pages.productPage.rows);
  const wrongCountry = query.campaignRows.find((row) => row.campaignId === "c-sa-wrong");
  assert.equal(wrongCountry.attributionVerified, false, "Campaigns never match products from another account country");
  const nativeRow = query.campaignRows.find((row) => row.campaignId === "c-sa2-1");
  assert.equal(nativeRow.rawCurrency, "USD", "Native campaign currency is preserved");
  assertMinorEqual("USD campaign spend is normalized for reporting", nativeRow.spend, 37.5);
  const ai = service.query({ kind: "campaign-ai-context", accountIds: ["sa", "eg", "sa2"], reportingCurrency: "SAR", exchangeRates: input.exchangeRates });
  assert.equal(ai.ok, true);
  assert.ok(ai.productActions.length <= 20, "Campaign AI product context is capped at 20");
  assert.ok(ai.topSpendCampaigns.length <= 20, "Campaign AI campaign context is capped at 20");
}

function compareMarketingSource() {
  const main = read("src/main/main.js");
  const backend = read("supabase/functions/windsor-marketing/index.ts");
  const migration = read("supabase/migrations/202606060001_marketing_incremental_cache.sql");
  assert.ok(main.includes('TAAGER_MARKETING_INCREMENTAL_SYNC === "1"'), "Marketing incremental sync is manually feature flagged");
  assert.ok(backend.includes("syncDashboardAccountIncremental") && backend.includes("syncDashboardAccountLegacy"), "Marketing keeps incremental and legacy sync paths");
  assert.ok(backend.includes("recomposeOnly") && backend.includes("providerRequestCount"), "Marketing returns recomposition and provider diagnostics");
  assert.ok(migration.includes("marketing_daily_metrics"), "Marketing daily cache migration exists before enabling rollout");
}

function compareRuntimeSource() {
  const main = read("src/main/main.js");
  const runtime = read("src/renderer/pages/dashboard/dashboard-query-runtime.js");
  const orders = read("src/renderer/pages/dashboard/sections/section3-orders.js");
  const products = read("src/renderer/pages/dashboard/sections/section5-products.js");
  const campaigns = read("src/renderer/pages/dashboard/sections/section-campaigns.js");
  assert.ok(main.includes('TAAGER_DASHBOARD_QUERY_SHADOW === "1"'), "Shadow mode defaults off and requires explicit env flag");
  assert.ok(main.includes('TAAGER_DASHBOARD_QUERY_ORDERS === "1"'), "Orders rollout flag defaults off");
  assert.ok(main.includes('TAAGER_DASHBOARD_QUERY_PRODUCTS === "1"'), "Products rollout flag defaults off");
  assert.ok(main.includes('TAAGER_DASHBOARD_QUERY_CAMPAIGNS === "1"'), "Campaigns rollout flag defaults off");
  assert.ok(runtime.includes("rollout mismatch") && runtime.includes("rowIdentity") && runtime.includes("moneyMinor"), "Shadow mode logs structured rollout mismatches");
  assert.ok(runtime.includes("compareOrderShadow") && runtime.includes("compareProductShadow") && runtime.includes("compareCampaignShadow"), "Shadow mode compares all rollout sections");
  assert.ok(runtime.includes("campaign-ai-context") && runtime.includes("aiContext.productActionsLimit"), "Shadow mode verifies Campaign AI context limits");
  assert.ok(orders.includes("backendPage = null") && orders.includes("getFilteredAndSortedOrders()"), "Orders backend failure falls back to legacy rows");
  assert.ok(products.includes("backendProductsActive = false") && products.includes("backend query failed; using legacy data"), "Products backend failure falls back to legacy rows");
  assert.ok(campaigns.includes("_campaignBackendActive = false") && campaigns.includes("backend query failed; using legacy data"), "Campaigns backend failure falls back to legacy rows");
}

const accounts = fixtureAccounts();
const allowedIds = ["sa", "eg", "sa2"];
let revision = 1;
let marketingRevision = 1;
const service = createDashboardQueryService({
  getAccounts: () => accounts,
  getAllowedAccountIds: () => allowedIds,
  getRevision: () => revision,
  getMarketingRevision: () => marketingRevision,
});

compareOrders(service, accounts, allowedIds);
compareProducts(service, accounts, allowedIds);
compareCampaigns(service, accounts, allowedIds);
compareMarketingSource();
compareRuntimeSource();

revision += 1;
marketingRevision += 1;
assert.equal(service.query({ kind: "orders", accountIds: ["sa"], page: 1, pageSize: 10 }).ok, true, "Revision changes keep rollout queries usable");

console.log("[PASS] Dashboard rollout gate: shadow contracts, manual flags, fallback, export, marketing, and cross-account parity");
