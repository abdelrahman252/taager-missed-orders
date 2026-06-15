"use strict";

const { buildCampaignIntelligence, filterAndPage } = require("../renderer/pages/dashboard/dashboard-campaign-query-core");
const productAttribution = require("../renderer/pages/dashboard/dashboard-product-attribution-core");
const currencyCore = require("../renderer/pages/dashboard/dashboard-currency-core");
const financialCore = require("../renderer/pages/dashboard/dashboard-financial-core");

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function text(value) {
  return String(value == null ? "" : value).trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function sanitizeProductNameOverrides(value) {
  const out = {};
  Object.entries(value && typeof value === "object" ? value : {}).slice(0, 1000).forEach(([sku, name]) => {
    const cleanSku = text(sku).slice(0, 160);
    const cleanName = text(name).slice(0, 240);
    if (cleanSku && cleanName) out[cleanSku] = cleanName;
  });
  return out;
}

function productNameOverride(sku, fallback, overrides) {
  const wanted = lower(sku);
  if (!wanted) return text(fallback);
  const key = Object.keys(overrides || {}).find((candidate) => lower(candidate) === wanted);
  return text(key && overrides[key]) || text(fallback);
}

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value) {
  if (!value) return "";
  // Use local-timezone date formatting to match the legacy aggregator's normalizeDateKey,
  // which uses localDateKey(d) (getFullYear/getMonth/getDate). Using toISOString() would
  // produce UTC dates and shift rows near midnight relative to the legacy date filter.
  function localDateStr(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  if (value instanceof Date && !isNaN(value.getTime())) return localDateStr(value);
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? "" : localDateStr(parsed);
}

function cleanCurrency(value, fallback = "SAR") {
  return currencyCore.cleanCurrency(value, fallback);
}

function countryCurrency(country, fallback = "SAR") {
  return currencyCore.countryCurrency(country, fallback);
}

function convertMoney(value, from, to, input) {
  return currencyCore.convert(value, from, to, {
    rates: input && input.exchangeRates || {},
    egpRate: input && input.egpRate,
  });
}

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function canonicalCacheInput(input) {
  const copy = { ...(input || {}) };
  if (Array.isArray(copy.accountIds)) {
    copy.accountIds = Array.from(new Set(copy.accountIds.map(text).filter(Boolean))).sort();
  }
  if (copy.exchangeRates && typeof copy.exchangeRates === "object") {
    copy.exchangeRates = Object.keys(copy.exchangeRates).sort().reduce((out, key) => {
      out[cleanCurrency(key, key)] = number(copy.exchangeRates[key]);
      return out;
    }, {});
  }
  copy.reportingCurrency = cleanCurrency(copy.reportingCurrency || copy.currency || "SAR", "SAR");
  return copy;
}

function orderKey(row, fallback) {
  const direct = row.taagerOrderNumber || row.orderNumber || row.orderId || row.id || row.reference;
  const accountId = text(row.accountId || row.dashboardAccountId || "");
  if (direct) return accountId + "|id:" + text(direct);
  // Sig key matches legacy aggregator's orderOnlyKey: deduplicates by phone+date+status,
  // same as legacy does. The fallback index is intentionally omitted so rows without
  // an order number but with the same phone/date/status collapse to one order.
  return [accountId, "sig", row.phone || row.phone1 || row.phone2 || "", dateKey(row.createdAt || row.date), row.orderStatus || row.status || ""].join("|");
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

function isFailedBucket(bucket) {
  return ["failed", "return_verified", "customer_refused_confirmation", "on_hold", "out_of_stock", "after_sales_done"].includes(bucket);
}

const CONFIRMED_BUCKETS = new Set([
  "confirmed",
  "waiting",
  "shipping",
  "delivery_suspended",
  "processing",
  "delivered",
  "failed",
  "return_verified",
  "after_sales_progress",
  "after_sales_done",
]);

function isConfirmedBucket(bucket) {
  return CONFIRMED_BUCKETS.has(bucket);
}

function isIncomingBucket(bucket) {
  return ["shipping", "confirmed", "processing", "waiting", "pending", "received"].includes(bucket);
}

const PRODUCT_CONFIRMATION_BUCKETS = new Set([
  "confirmed",
  "waiting",
  "shipping",
  "delivery_suspended",
  "after_sales_progress",
  "processing",
  "delivered",
  "failed",
  "return_verified",
  "after_sales_done",
]);
const PRODUCT_CANCEL_BUCKETS = new Set([
  "customer_refused_confirmation",
  "on_hold",
  "out_of_stock",
]);

function productStatusGroup(bucket) {
  if (bucket === "canceled_by_you") return "excluded";
  if (PRODUCT_CONFIRMATION_BUCKETS.has(bucket)) return "confirmation";
  if (PRODUCT_CANCEL_BUCKETS.has(bucket)) return "cancel";
  return "pending";
}

function productStatusPercentages(confirmationCount, cancelCount, pendingCount, totalCount) {
  let total = number(totalCount);
  const confirmation = number(confirmationCount);
  const cancel = number(cancelCount);
  const pending = number(pendingCount);
  if (total <= 0) total = confirmation + cancel + pending;
  if (total <= 0) return { confirmationPct: 0, cancelPct: 0, pendingPct: 0 };
  const confirmationPct = Math.round(confirmation / total * 1000) / 10;
  const cancelPct = Math.round(cancel / total * 1000) / 10;
  const countsCoverTotal = Math.abs((confirmation + cancel + pending) - total) < 0.0001;
  const pendingPct = countsCoverTotal
    ? Math.round((100 - confirmationPct - cancelPct) * 10) / 10
    : Math.round(pending / total * 1000) / 10;
  return { confirmationPct, cancelPct, pendingPct: Math.max(0, pendingPct) };
}

function boundedProductRatePct(deliveredCount, baseCount, context) {
  const delivered = number(deliveredCount);
  const base = number(baseCount);
  if (base <= 0) return 0;
  if (delivered < 0 || delivered > base) {
    console.warn("[DashboardRateIntegrity] Invalid product rate counts", {
      context: context || "unknown",
      delivered,
      base,
    });
  }
  return Math.round(Math.max(0, Math.min(1, delivered / base)) * 1000) / 10;
}

function boundedExpectedDeliveries(netOrders, ndrRate, context) {
  const net = Math.max(0, Math.round(number(netOrders)));
  const rate = Math.max(0, Math.min(1, number(ndrRate)));
  const projected = Math.round(net * rate);
  if (projected > net) {
    console.warn("[DashboardRateIntegrity] Expected deliveries exceed net orders", {
      context: context || "unknown",
      projected,
      netOrders: net,
      ndrRate: rate,
    });
  }
  return Math.min(net, Math.max(0, projected));
}

function rowTotal(row) {
  return number(row.dashboardTotalPrice ?? row.totalPrice ?? row.total ?? row.orderValue);
}

function rowProfit(row) {
  if (row && row.dashboardCommission != null) return number(row.dashboardCommission);
  const orderProfit = number(row && (row.profit != null ? row.profit : (row.orderProfit != null ? row.orderProfit : row.profitBeforeTax)));
  let taxProfit = number(row && (row.taxProfit != null ? row.taxProfit : (row.taagerTaxProfit != null ? row.taagerTaxProfit : row.taagerFees)));
  if (orderProfit > 0 && taxProfit > orderProfit) {
    while (taxProfit > orderProfit && taxProfit >= 1) taxProfit = taxProfit / 10;
  }
  if (orderProfit > 0 || taxProfit > 0) return orderProfit - taxProfit;
  return number(row && (row.profitAfterTax ?? row.taagerProfit ?? row.profitAfterFees ?? row.commission ?? row.marketerCommission));
}

  function rowProduct(row) {
    return text(row.productName || row.product || row.products);
}

function rowSku(row) {
  return text(row.sku || row.skuNumber);
}

function rowCity(row) {
  return text(row.city || row.customerCity || row.province);
}

const PREPAID_METHODS = ['prepaid', 'online', 'card', 'visa', 'mada', 'apple pay', 'applepay', 'stc pay', 'stcpay', 'tabby', 'tabi', 'tamara', 'paymob', 'network', 'taager'];
const COD_METHODS = ['cod', 'cash', 'الدفع عند الاستلام', 'كاش'];

function normalizePaymentText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyRowPayment(row) {
  if (!row) return { classification: 'unknown', source: '', effectiveCod: true };
  const stored = String(row.paymentClassification || '').trim().toLowerCase();
  if (stored === 'prepaid' || stored === 'cod' || stored === 'unknown') {
    return {
      classification: stored,
      source: row.paymentEvidenceSource || row.paymentMethodSource || '',
      effectiveCod: stored !== 'prepaid'
    };
  }
  if (typeof row.isPrepaid === 'boolean' && (row.paymentEvidenceSource || row.paymentMethodSource || row.paymentSource)) {
    return {
      classification: row.isPrepaid ? 'prepaid' : 'cod',
      source: row.paymentEvidenceSource || row.paymentMethodSource || row.paymentSource,
      effectiveCod: !row.isPrepaid
    };
  }
  if (row.paymentMethod) {
    const pm = String(row.paymentMethod).toLowerCase().trim();
    for (let i = 0; i < PREPAID_METHODS.length; i++) {
      if (pm.includes(PREPAID_METHODS[i])) {
        return { classification: 'prepaid', source: row.paymentMethodSource || 'structured-payment', effectiveCod: false };
      }
    }
    for (let j = 0; j < COD_METHODS.length; j++) {
      if (pm.includes(COD_METHODS[j])) {
        return { classification: 'cod', source: row.paymentMethodSource || 'structured-payment', effectiveCod: true };
      }
    }
  }
  return { classification: 'unknown', source: '', effectiveCod: true };
}

function isRowPrepaid(row) {
  return !classifyRowPayment(row).effectiveCod;
}

function rowAmountDue(row) {
  if (!row) return 0;
  const keys = ['dashboardAmountDue', 'amountDueRaw', 'amountDue', 'orderValue', 'cod', 'cashOnDelivery'];
  for (let i = 0; i < keys.length; i++) {
    if (row[keys[i]] != null) {
      const n = number(row[keys[i]]);
      if (n > 0) return n;
    }
  }
  return 0;
}

const PROVINCE_MAP = [
  { id: 'riyadh',  keys: ['الرياض', 'الخرج', 'المجمعة', 'الدوادمي', 'riyadh'] },
  { id: 'eastern', keys: ['الشرقية', 'الدمام', 'الخبر', 'الأحساء', 'eastern'] },
  { id: 'mecca',   keys: ['مكة', 'جدة', 'الطائف', 'الغربية', 'mecca'] },
  { id: 'jazan',   keys: ['جيزان', 'جازان', 'jazan', 'gizan'] },
  { id: 'baha',    keys: ['الباحة', 'baha'] },
  { id: 'madinah', keys: ['المدينة', 'ينبع', 'madinah'] },
  { id: 'aseer',   keys: ['عسير', 'أبها', 'خميس', 'aseer'] },
  { id: 'qassim',  keys: ['القصيم', 'بريدة', 'عنيزة', 'qassim'] },
  { id: 'tabuk',    keys: ['تبوك', 'tabuk'] },
  { id: 'hail',     keys: ['حائل', 'hail'] },
  { id: 'najran',   keys: ['نجران', 'najran'] },
  { id: 'jawf',     keys: ['الجوف', 'سكاكا', 'jawf', 'jouf'] },
  { id: 'northern', keys: ['الحدود الشمالية', 'عرعر', 'northern', 'arar'] }
];

function resolveProvince(cityName, country) {
  if (!cityName) return 'other';
  const lowerCity = String(cityName).toLowerCase();
  for (let i = 0; i < PROVINCE_MAP.length; i++) {
    const prov = PROVINCE_MAP[i];
    for (let j = 0; j < prov.keys.length; j++) {
      if (lowerCity.includes(prov.keys[j])) return prov.id;
    }
  }
  return 'other';
}

function normalizeScope(input, allowedIds) {
  const requestedAccountIds = Array.from(new Set((Array.isArray(input.accountIds) ? input.accountIds : []).map(text).filter(Boolean)));
  const allowed = new Set((allowedIds || []).map(text).filter(Boolean));
  const resolved = requestedAccountIds.length ? requestedAccountIds.filter((id) => allowed.has(id)) : Array.from(allowed);
  const ignoredAccountIds = requestedAccountIds.filter((id) => !allowed.has(id));
  const ids = Array.from(new Set(resolved)).sort();
  return {
    accountIds: ids,
    requestedAccountIds,
    ignoredAccountIds,
    accountCount: ids.length,
    dateFrom: dateKey(input.dateFrom),
    dateTo: dateKey(input.dateTo),
    deliveredDateMode: text(input.deliveredDateMode) === "expected" ? "expected" : "actual",
  };
}

function inRange(row, scope) {
  const bucket = statusBucket(row);
  const key = bucket === "delivered" && scope.deliveredDateMode === "actual"
    ? dateKey(row.deliveredAt || row.lastUpdatedAt || row.updatedAt || row.dashboardDate || row.createdAt || row.date)
    : dateKey(row.createdAt || row.date || row.dashboardDate);
  if (scope.dateFrom && (!key || key < scope.dateFrom)) return false;
  if (scope.dateTo && (!key || key > scope.dateTo)) return false;
  return true;
}

function inCreatedRange(row, scope) {
  const key = dateKey(row.createdAt || row.date || row.dashboardDate);
  if (scope.dateFrom && (!key || key < scope.dateFrom)) return false;
  if (scope.dateTo && (!key || key > scope.dateTo)) return false;
  return true;
}

// Bug B fix: check whether a row falls within the NDR cohort period.
// The frontend aggregator supports "Expected NDR" mode where DR is calculated
// using a separate earlier date range (ndrPeriod) so cohort-based delivery
// rates can be computed correctly.  Without this the backend always uses the
// primary date range and DR == NDR when there are no pending orders.
function inNdrRange(row, ndrFrom, ndrTo) {
  if (!ndrFrom && !ndrTo) return true; // no ndrPeriod set — behave as before
  const key = dateKey(row.createdAt || row.date || row.dashboardDate);
  if (ndrFrom && (!key || key < ndrFrom)) return false;
  if (ndrTo && (!key || key > ndrTo)) return false;
  return true;
}

function pageInfo(input, total) {
  const pageSize = input.allRows
    ? Math.max(1, total)
    : Math.min(MAX_PAGE_SIZE, Math.max(1, Number(input.pageSize) || DEFAULT_PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(input.page) || 1));
  const start = (page - 1) * pageSize;
  return { page, pageSize, total, totalPages, start, end: Math.min(start + pageSize, total) };
}

function compareRows(sortBy, sortDir) {
  const field = sortBy === "default" ? "rank" : sortBy;
  const factor = sortDir === "asc" ? 1 : -1;
  return (a, b) => {
    const av = a[field];
    const bv = b[field];
    let result = 0;
    if (typeof av === "number" || typeof bv === "number") result = (number(av) - number(bv)) * factor;
    else result = String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv)) * factor;
    if (result) return result;
    return stableRowIdentity(a).localeCompare(stableRowIdentity(b));
  };
}

function stableRowIdentity(row) {
  return text(row && (row._stableKey || row.orderScopeKey || row.key || row.campaignId || row.id || row.taagerOrderNumber || row.orderNumber)) +
    "|" + text(row && (row.accountId || row.dashboardAccountId));
}

function accountCountry(account, row) {
  return text(row && (row.taagerCountry || row.country) || account && account.country || account && account.taagerCountry || "sa").toLowerCase();
}

function normalizeOrderMoney(row, account, input) {
  const reportingCurrency = cleanCurrency(input && (input.reportingCurrency || input.currency) || row.reportingCurrency || "SAR", "SAR");
  const nativeCurrency = cleanCurrency(row.nativeCurrency || row.orderCurrency || row.currency || countryCurrency(accountCountry(account, row)), reportingCurrency);
  const rowReportingCurrency = cleanCurrency(row.reportingCurrency || reportingCurrency, reportingCurrency);
  const nativeTotalPrice = row.nativeTotalPrice != null
    ? number(row.nativeTotalPrice)
    : (row.dashboardTotalPrice != null && rowReportingCurrency === nativeCurrency ? number(row.dashboardTotalPrice) : rowTotal(row));
  const nativeProfit = row.nativeCommission != null
    ? number(row.nativeCommission)
    : (row.nativeProfitAfterTax != null ? number(row.nativeProfitAfterTax) : rowProfit(row));
  const reportingTotalPrice = row.dashboardTotalPrice != null && rowReportingCurrency === reportingCurrency
    ? number(row.dashboardTotalPrice)
    : convertMoney(nativeTotalPrice, nativeCurrency, reportingCurrency, input);
  const reportingProfit = row.dashboardCommission != null && rowReportingCurrency === reportingCurrency
    ? number(row.dashboardCommission)
    : convertMoney(nativeProfit, nativeCurrency, reportingCurrency, input);
  return {
    ...row,
    nativeCurrency,
    reportingCurrency,
    nativeTotalPrice,
    nativeCommission: nativeProfit,
    nativeProfitAfterTax: nativeProfit,
    dashboardTotalPrice: reportingTotalPrice,
    totalPrice: reportingTotalPrice,
    dashboardCommission: reportingProfit,
    profitAfterTax: reportingProfit,
    taagerProfit: reportingProfit,
    commission: reportingProfit,
  };
}

function createDashboardQueryService(options) {
  const getAccounts = options.getAccounts;
  const getAllowedAccountIds = options.getAllowedAccountIds;
  const getRevision = options.getRevision;
  const getMarketingRevision = options.getMarketingRevision || (() => 0);
  const cache = new Map();
  let cacheRevision = "";

  function cached(kind, input, build) {
    if (input && input.allRows) return build();
    const revision = String(getRevision()) + "|" + String(getMarketingRevision());
    if (revision !== cacheRevision) {
      cache.clear();
      cacheRevision = revision;
    }
    const key = kind + "|" + revision + "|" + stableStringify(canonicalCacheInput(input || {}));
    if (cache.has(key)) return cache.get(key);
    const value = build();
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
  }

  function scopedRows(input, options = {}) {
    const accounts = getAccounts() || {};
    const scope = normalizeScope(input || {}, getAllowedAccountIds());
    const includeNdrUnion = !!options.includeNdrUnion;
    const includeCreatedUnion = !!options.includeCreatedUnion;
    const deliveredDateMode = text(input && input.deliveredDateMode) === "expected" ? "expected" : "actual";
    const ndrFrom = dateKey((input && (input.ndrDateFrom || input.ndrFrom)) || "");
    const ndrTo = dateKey((input && (input.ndrDateTo || input.ndrTo)) || "");
    const rows = [];
    scope.accountIds.forEach((accountId) => {
      const snapshot = accounts[accountId] && accounts[accountId].snapshot;
      (Array.isArray(snapshot) ? snapshot : []).forEach((row) => {
        const inPrimaryRange = inRange(row, scope);
        const inCreatedDateRange = includeCreatedUnion && inCreatedRange(row, scope);
        const inExpectedNdrRange = includeNdrUnion && deliveredDateMode === "expected" && !!(ndrFrom && ndrTo) && inNdrRange(row, ndrFrom, ndrTo);
        if (!inPrimaryRange && !inCreatedDateRange && !inExpectedNdrRange) return;
        const account = accounts[accountId] || {};
        rows.push(normalizeOrderMoney({
          ...row,
          accountId,
          dashboardAccountId: accountId,
          accountLabel: text(row.accountLabel || row.accountEmail || account.label || account.easyEmail || accountId),
        }, account, input || {}));
      });
    });
    return { rows, scope, accounts };
  }

  function scopedCampaigns(scope, accounts, requestedPlatform, input) {
    const campaigns = [];
    const reportingCurrency = cleanCurrency(input && (input.reportingCurrency || input.currency) || "SAR", "SAR");
    scope.accountIds.forEach((accountId) => {
      const marketing = accounts[accountId] && accounts[accountId].marketing || {};
      Object.keys(marketing).forEach((platform) => {
        if (requestedPlatform && requestedPlatform !== "all" && requestedPlatform !== platform) return;
        const status = marketing[platform] || {};
        const rows = status.summary && status.summary.campaignBreakdown;
        (Array.isArray(rows) ? rows : []).forEach((row, index) => {
          const sourceCurrency = cleanCurrency(row.rawCurrency || row.currency || row.account_currency || status.summary && status.summary.currency || status.currency || "SAR", "SAR");
          const hasNativeSpend = (row.rawSpend != null && row.rawSpend !== "") || (row.spend != null && row.spend !== "");
          const sourceSpend = hasNativeSpend ? number(row.rawSpend ?? row.spend) : number(row.convertedSpend);
          const rawCurrency = hasNativeSpend ? sourceCurrency : reportingCurrency;
          const rawSpend = sourceSpend;
          const spend = convertMoney(rawSpend, rawCurrency, reportingCurrency, input || {});
          campaigns.push({
            ...row,
            accountId,
            dashboardAccountId: accountId,
            country: row.country || accounts[accountId] && (accounts[accountId].country || accounts[accountId].taagerCountry) || "",
            nativeRawCurrency: sourceCurrency,
            nativeRawSpend: sourceSpend,
            rawCurrency,
            currency: reportingCurrency,
            rawSpend,
            spend,
            platform: row.platform || platform,
            _stableKey: [accountId, platform, row.campaignId || row.id || row.campaign || row.name || index].map(text).join("|"),
          });
        });
      });
    });
    return campaigns;
  }

  function assignCampaignProducts(campaigns, products, productNameOverrides) {
    const overrides = sanitizeProductNameOverrides(productNameOverrides);
    const index = productAttribution.createProductIndex(products, { productNameOverrides: overrides });

    return campaigns.map((campaign) => {
      const result = productAttribution.matchCampaign(campaign, index);
      const match = result.status === "matched" ? result.product : null;
      return match ? {
        ...campaign,
        productKey: match.key,
        product: productNameOverride(match.sku, match.name, overrides),
        productSku: match.sku,
        attributionVerified: true,
        matchMethod: result.method,
        matchDetail: result.matchDetail,
        matchConfidence: result.confidence,
        matchedSku: result.matchedSku,
        candidateIds: result.candidateIds,
      } : {
        ...campaign,
        attributionVerified: false,
        matchMethod: result.method,
        matchDetail: result.matchDetail,
        matchConfidence: "none",
        matchedSku: "",
        candidateIds: result.candidateIds,
      };
    });
  }

  function campaignProductRows(rows, productNameOverrides) {
    const overrides = sanitizeProductNameOverrides(productNameOverrides);
    const products = new Map();
    const seen = new Set();
    rows.forEach((row, index) => {
      const sku = rowSku(row);
      const name = productNameOverride(sku, rowProduct(row) || sku || "Unknown product", overrides);
      const productKeyValue = String(sku || name).toLowerCase();
      if (!productKeyValue) return;
      const country = lower(row.taagerCountry || row.country || "unknown");
      const key = [text(row.accountId || row.dashboardAccountId), country, productKeyValue].join("|");
      if (!products.has(key)) {
        products.set(key, {
          key,
          accountId: text(row.accountId || row.dashboardAccountId),
          country,
          currency: cleanCurrency(row.reportingCurrency || "SAR", "SAR"),
          sku,
          name,
          placedCount: 0,
          totalOrderCount: 0,
          statusTotalCount: 0,
          confirmationStatusCount: 0,
          cancelStatusCount: 0,
          pendingStatusCount: 0,
          deliveredCount: 0,
          ndrBaseCount: 0,
          ndrDeliveredCount: 0,
          confirmedCount: 0,
          canceledCount: 0,
          failedCount: 0,
          pendingCount: 0,
          shippingCount: 0,
          processingCount: 0,
          waitingCount: 0,
          commission: 0,
          totalSales: 0,
          deliveredSales: 0,
          cityBreakdown: [],
        });
      }
      const product = products.get(key);
      const bucket = statusBucket(row);
      const uniqueOrderKey = key + ":" + orderKey(row, index);
      const netOrder = bucket !== "canceled_by_you";
      if (!seen.has("campaignTotal:" + uniqueOrderKey)) {
        seen.add("campaignTotal:" + uniqueOrderKey);
        product.totalOrderCount += 1;
        if (bucket === "canceled_by_you") {
          product.canceledCount += 1;
        } else {
          product.statusTotalCount += 1;
          const group = productStatusGroup(bucket);
          if (group === "confirmation") product.confirmationStatusCount += 1;
          else if (group === "cancel") product.cancelStatusCount += 1;
          else product.pendingStatusCount += 1;
        }
      }
      if (netOrder && !seen.has("campaignPlaced:" + uniqueOrderKey)) {
        seen.add("campaignPlaced:" + uniqueOrderKey);
        product.placedCount += 1;
        if (isConfirmedBucket(bucket)) product.confirmedCount += 1;
        if (isFailedBucket(bucket)) product.failedCount += 1;
        else if (isIncomingBucket(bucket)) {
          if (bucket === "shipping") product.shippingCount += 1;
          else if (bucket === "processing") product.processingCount += 1;
          else if (bucket === "waiting") product.waitingCount += 1;
          else if (bucket === "pending" || bucket === "received") product.pendingCount += 1;
        }
      }
      if (netOrder && !seen.has("campaignNdr:" + uniqueOrderKey)) {
        seen.add("campaignNdr:" + uniqueOrderKey);
        product.ndrBaseCount += 1;
      }
      if (netOrder && !seen.has("campaignSales:" + uniqueOrderKey)) {
        seen.add("campaignSales:" + uniqueOrderKey);
        product.totalSales += rowTotal(row);
      }
      if (bucket === "delivered" && netOrder && !seen.has("campaignNdrDelivered:" + uniqueOrderKey)) {
        seen.add("campaignNdrDelivered:" + uniqueOrderKey);
        product.ndrDeliveredCount += 1;
      }
      if (bucket === "delivered" && netOrder) {
        if (!seen.has("campaignDeliveredSales:" + uniqueOrderKey)) {
          seen.add("campaignDeliveredSales:" + uniqueOrderKey);
          product.deliveredSales += rowTotal(row);
        }
        if (!seen.has("campaignDelivered:" + uniqueOrderKey)) {
          seen.add("campaignDelivered:" + uniqueOrderKey);
          product.commission += rowProfit(row);
          product.deliveredCount += 1;
        }
      }
    });
    return Array.from(products.values()).map((product) => {
      const ndrBase = product.ndrBaseCount || product.placedCount;
      const ndrDelivered = product.ndrDeliveredCount != null ? product.ndrDeliveredCount : product.deliveredCount;
      const confirmed = product.confirmedCount || 0;
      const statusTotal = product.statusTotalCount !== undefined ? product.statusTotalCount : (product.placedCount || 0);
      const statusRates = productStatusPercentages(
        product.confirmationStatusCount,
        product.cancelStatusCount,
        product.pendingStatusCount,
        statusTotal
      );
      return {
        ...product,
        orders: product.placedCount,
        netOrderCount: product.placedCount,
        delivered: product.deliveredCount,
        confirmationPct: statusRates.confirmationPct,
        cancelPct: statusRates.cancelPct,
        pendingPct: statusRates.pendingPct,
        ndrPct: ndrBase ? ndrDelivered / ndrBase * 100 : 0,
        drPct: confirmed ? ndrDelivered / confirmed * 100 : 0,
      };
    }).sort((a, b) => (b.placedCount - a.placedCount) || (b.commission - a.commission) || String(a.key || "").localeCompare(String(b.key || "")));
  }

  function orderRows(input) {
    return cached("orders", input, () => {
      const { rows, scope, accounts } = scopedRows(input);
      const grouped = new Map();
      rows.forEach((row, index) => {
        const key = orderKey(row, index);
        if (!grouped.has(key)) {
          const commission = rowProfit(row);
          grouped.set(key, {
            ...row,
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
          });
        }
        const order = grouped.get(key);
        order.nativeTotalPrice += number(row.nativeTotalPrice);
        order.dashboardTotalPrice += rowTotal(row);
        order.totalPrice = order.dashboardTotalPrice;
        order.itemCount += 1;
        if (rowProduct(row)) order.products.push(rowProduct(row));
        if (rowSku(row)) order.skus.push(rowSku(row));
      });
      let orders = Array.from(grouped.values()).map((row) => ({
        ...row,
        products: row.products.join(", "),
        sku: row.skus.join(", "),
        statusBucket: statusBucket(row),
        dashboardDate: dateKey(row.createdAt || row.date || row.dashboardDate),
        nativeCurrency: row.nativeCurrency,
        reportingCurrency: row.reportingCurrency,
      }));
      if (!input.includeCanceled) orders = orders.filter((row) => statusBucket(row) !== "canceled_by_you");
      const filters = input.filters || {};
      const query = lower(filters.search);
      orders = orders.filter((row) => {
        if (filters.status && statusBucket(row) !== filters.status && text(row.orderStatus || row.status) !== text(filters.status)) return false;
        if (filters.product && rowProduct(row) !== text(filters.product)) return false;
        if (filters.city && rowCity(row) !== text(filters.city)) return false;
        if (!query) return true;
        return lower([
          row.taagerOrderNumber, row.orderNumber, row.customerName, row.name, row.phone, row.phone1,
          row.products, row.sku, rowCity(row), row.accountLabel,
        ].join(" ")).includes(query);
      });
      const statusBreakdown = {};
      const accountBreakdown = {};
      let delivered = 0;
      let canceledByYou = 0;
      let totalValue = 0;
      let totalProfit = 0;
      orders.forEach((row) => {
        const bucket = statusBucket(row);
        statusBreakdown[bucket] = (statusBreakdown[bucket] || 0) + 1;
        const accountId = text(row.accountId || "__unknown__");
        if (!accountBreakdown[accountId]) {
          accountBreakdown[accountId] = { accountId, accountLabel: row.accountLabel || accountId, rawOrders: 0, delivered: 0, totalValue: 0, totalProfit: 0 };
        }
        accountBreakdown[accountId].rawOrders += 1;
        if (bucket === "delivered") delivered++;
        if (bucket === "delivered") accountBreakdown[accountId].delivered += 1;
        if (bucket === "canceled_by_you") canceledByYou++;
        totalValue += rowTotal(row);
        totalProfit += rowProfit(row);
        accountBreakdown[accountId].totalValue += rowTotal(row);
        accountBreakdown[accountId].totalProfit += rowProfit(row);
      });
      const sortBy = text(input.sortBy) || "dashboardDate";
      orders.sort(compareRows(sortBy, input.sortDir === "asc" ? "asc" : "desc"));
      const pagination = pageInfo(input, orders.length);
      return {
        ok: true,
        kind: "orders",
        scope,
        summary: {
          rawOrders: orders.length,
          netOrders: Math.max(0, orders.length - canceledByYou),
          delivered,
          canceledByYou,
          totalValue,
          totalProfit,
          statusBreakdown,
          accountBreakdown: Object.values(accountBreakdown).sort(compareRows("accountId", "asc")),
          currency: cleanCurrency(input.reportingCurrency || input.currency || "SAR", "SAR"),
        },
        rows: orders.slice(pagination.start, pagination.end),
        pagination,
      };
    });
  }

  function productRows(input) {
    return cached("products", input, () => {
      const { rows, scope, accounts } = scopedRows(input, { includeNdrUnion: true, includeCreatedUnion: true });
      const products = new Map();
      const globalOrderKeys = new Set();
      const globalNetOrderKeys = new Set();
      const globalDeliveredOrderKeys = new Set();
      const globalConfirmedOrderKeys = new Set();
      const globalNdrOrderKeys = new Set();
      const globalNdrConfirmedOrderKeys = new Set();
      const globalNdrDeliveredOrderKeys = new Set();
      let globalDeliveredCommission = 0;
      const reportingCurrency = cleanCurrency(input && (input.reportingCurrency || input.currency) || "SAR", "SAR");
      const financialCurrency = cleanCurrency(input && (input.productFinancialCurrency || input.financialCurrency) || reportingCurrency, reportingCurrency);
      const financialInput = {
        ...(input || {}),
        egpRate: number(input && (input.productFinancialEgpRate || input.egpRate)) || (input && input.egpRate),
      };
      // Bug B fix: extract ndrPeriod from input so we can filter the DR base
      // using a separate cohort range (matching "Expected NDR" mode in the frontend).
      const ndrFrom = dateKey((input && (input.ndrDateFrom || input.ndrFrom)) || "");
      const ndrTo   = dateKey((input && (input.ndrDateTo   || input.ndrTo))   || "");

      rows.forEach((row, index) => {
        const sku = rowSku(row);
        const name = productNameOverride(
          sku,
          rowProduct(row) || "Unknown Product",
          sanitizeProductNameOverrides(input && input.productNameOverrides)
        );
        const country = lower(row.taagerCountry || row.country || "unknown");
        // Key matches country-aware SKU scheme to keep countries separate
        // while combining same-country duplicate accounts.
        const key = sku ? country + "|sku:" + lower(sku) : row.accountId + "|name:" + lower(name);
        if (!products.has(key)) {
          products.set(key, {
            key, legacyKey: sku || name, sku, name, country,
            totalOrderCount: 0, netOrderCount: 0, deliveredCount: 0, totalPieces: 0, commission: 0, revenue: 0,
            calculatorDeliveredCount: 0, calculatorEarnedProfitAfterTax: 0,
            statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
            failedCount: 0, canceledCount: 0, confirmedCount: 0, shippingCount: 0,
            processingCount: 0, waitingCount: 0, pendingCount: 0,
            // Bug B fix: track ndr-cohort counts separately from total counts
            ndrBaseCount: 0, ndrConfirmedCount: 0, ndrDeliveredCount: 0,
            accounts: {}, cities: {}, orderKeys: new Set(), deliveredOrderKeys: new Set(),
            calculatorOrderKeys: new Set(), ndrOrderKeys: new Set()
          });
        }
        const product = products.get(key);
        const bucket = statusBucket(row);
        const productOrderKey = orderKey(row, index);
        const inPrimaryPeriod = inRange(row, scope);
        const inCreatedPeriod = inCreatedRange(row, scope);
        if (inCreatedPeriod) globalOrderKeys.add(productOrderKey);
        if (inCreatedPeriod && bucket !== "canceled_by_you") globalNetOrderKeys.add(productOrderKey);
        if (inCreatedPeriod && isConfirmedBucket(bucket)) globalConfirmedOrderKeys.add(productOrderKey);
        if (inPrimaryPeriod && bucket === "delivered" && !globalDeliveredOrderKeys.has(productOrderKey)) {
          globalDeliveredOrderKeys.add(productOrderKey);
          globalDeliveredCommission += rowProfit(row);
        }
        const isNewOrder = !product.orderKeys.has(productOrderKey);
        if (inCreatedPeriod && isNewOrder) {
          product.orderKeys.add(productOrderKey);
          product.totalOrderCount += 1;
          if (bucket !== "canceled_by_you") {
            product.netOrderCount += 1;
            product.statusTotalCount += 1;
            const group = productStatusGroup(bucket);
            if (group === "confirmation") product.confirmationStatusCount += 1;
            else if (group === "cancel") product.cancelStatusCount += 1;
            else product.pendingStatusCount += 1;
          }
          if (bucket === "canceled_by_you") product.canceledCount += 1;
          if (isFailedBucket(bucket)) product.failedCount += 1;
          if (isConfirmedBucket(bucket)) product.confirmedCount += 1;
          if (bucket === "shipping") product.shippingCount += 1;
          if (bucket === "processing") product.processingCount += 1;
          if (bucket === "waiting") product.waitingCount += 1;
          if (bucket === "received" || bucket === "pending") product.pendingCount += 1;
        }
        if (inPrimaryPeriod && bucket === "delivered" && !product.deliveredOrderKeys.has(productOrderKey)) {
          product.deliveredOrderKeys.add(productOrderKey);
          product.deliveredCount += 1;
          product.commission += rowProfit(row);
        }
        if (inCreatedPeriod && bucket === "delivered" && !product.calculatorOrderKeys.has(productOrderKey)) {
          product.calculatorOrderKeys.add(productOrderKey);
          product.calculatorDeliveredCount += 1;
          product.calculatorEarnedProfitAfterTax += rowProfit(row);
        }
        // Bug B fix: track DR base and delivered count within the NDR cohort period
        const inNdrCohort = inNdrRange(row, ndrFrom, ndrTo);
        if (inNdrCohort && bucket !== "canceled_by_you") {
          globalNdrOrderKeys.add(productOrderKey);
          if (isConfirmedBucket(bucket)) globalNdrConfirmedOrderKeys.add(productOrderKey);
          if (bucket === "delivered") globalNdrDeliveredOrderKeys.add(productOrderKey);
        }
        if (inNdrCohort && bucket !== "canceled_by_you" && !product.ndrOrderKeys.has(productOrderKey)) {
          product.ndrOrderKeys.add(productOrderKey);
          product.ndrBaseCount += 1;
          if (isConfirmedBucket(bucket)) product.ndrConfirmedCount += 1;
          if (bucket === "delivered") product.ndrDeliveredCount += 1;
        }
        if (inCreatedPeriod && isNewOrder && bucket !== "canceled_by_you") {
          product.totalPieces += Math.max(1, number(row.qty || row.quantity || 1));
          product.revenue += rowTotal(row);
        }
        product.accounts[row.accountId] = (product.accounts[row.accountId] || 0) + 1;
        const city = rowCity(row);
        if (city) product.cities[city] = (product.cities[city] || 0) + 1;
      });
      const isExpected = text(input && input.deliveredDateMode) === "expected";
      let globalExpectedNdrRate = 0;
      let globalExpectedDrRate = 0;
      let globalNdrDelivered = 0;
      let globalNdrBase = 0;
      let globalDrBase = 0;
      if (isExpected) {
        const hasNdrPeriod = !!(ndrFrom && ndrTo);
        globalNdrDelivered = hasNdrPeriod ? globalNdrDeliveredOrderKeys.size : globalDeliveredOrderKeys.size;
        globalNdrBase = hasNdrPeriod ? globalNdrOrderKeys.size : globalNetOrderKeys.size;
        globalDrBase = hasNdrPeriod ? globalNdrConfirmedOrderKeys.size : globalConfirmedOrderKeys.size;
        if (globalNdrBase > 0) {
          globalExpectedNdrRate = globalNdrDelivered / globalNdrBase;
        }
        if (globalDrBase > 0) {
          globalExpectedDrRate = Math.max(0, Math.min(1, globalNdrDelivered / globalDrBase));
        }
      }

      let list = Array.from(products.values()).filter((product) => product.netOrderCount > 0).map((product) => {
        // Bug A fix: use confirmedCount (orders in CONFIRMED_BUCKETS) as the DR denominator,
        // matching the frontend aggregator. The old formula (totalOrders - pendingCount)
        // collapses to totalOrders when there are no pending orders, making DR == NDR.
        const confirmationBase = product.confirmedCount;
        const statusTotal = product.statusTotalCount !== undefined ? product.statusTotalCount : (product.netOrderCount || 0);
        const clean = { ...product };
        delete clean.orderKeys;
        delete clean.deliveredOrderKeys;
        delete clean.ndrOrderKeys;
        delete clean.calculatorOrderKeys;
        const statusRates = productStatusPercentages(
          product.confirmationStatusCount,
          product.cancelStatusCount,
          product.pendingStatusCount,
          statusTotal
        );
        // Bug B fix: use ndr-cohort counts when an ndrPeriod was provided,
        // otherwise fall back to totalOrders (matching original behaviour).
        const hasNdrPeriod = !!(ndrFrom && ndrTo);
        const productNdrBase = isExpected && hasNdrPeriod ? product.ndrBaseCount : product.netOrderCount;
        const productDrBase = isExpected && hasNdrPeriod ? product.ndrConfirmedCount : confirmationBase;
        const productNdrDelivered = isExpected && hasNdrPeriod ? product.ndrDeliveredCount : product.deliveredCount;
        const usesGlobalNdrFallback = isExpected && productNdrBase <= 0;
        const usesGlobalDrFallback = isExpected && productDrBase <= 0;
        const ndrBase = usesGlobalNdrFallback ? globalNdrBase : productNdrBase;
        const drBase = usesGlobalDrFallback ? globalDrBase : productDrBase;
        const ndrDelivered = usesGlobalNdrFallback ? globalNdrDelivered : productNdrDelivered;
        const drDelivered = usesGlobalDrFallback ? globalNdrDelivered : productNdrDelivered;
        const ndrRate = ndrBase > 0
          ? Math.max(0, Math.min(1, ndrDelivered / ndrBase))
          : (isExpected ? globalExpectedNdrRate : 0);
        const drRate = drBase > 0
          ? Math.max(0, Math.min(1, drDelivered / drBase))
          : (isExpected ? globalExpectedDrRate : 0);
        const projection = financialCore.calculate({
          mode: isExpected ? "expected" : "actual",
          netOrders: product.netOrderCount,
          actualDeliveredOrders: product.calculatorDeliveredCount,
          actualEarnedProfitAfterTax: product.calculatorEarnedProfitAfterTax,
          currentTotalSales: product.revenue,
          expectedNdrRate: ndrRate,
          adSpend: 0,
          insufficientHistory: isExpected && productNdrBase <= 0 && globalNdrBase <= 0,
        });

        const deliveriesVal = isExpected ? projection.expectedDeliveriesDisplay : product.deliveredCount;
        const commissionVal = isExpected ? projection.expectedTotalProfitBeforeAdSpend : product.commission;

        const ndrPctVal = deliveriesVal > 0
          ? (boundedProductRatePct(ndrDelivered, ndrBase, product.key + ":ndr") ||
            (isExpected && ndrBase <= 0 ? Math.round(globalExpectedNdrRate * 1000) / 10 : 0))
          : 0;
        const drRateVal = boundedProductRatePct(drDelivered, drBase, product.key + ":dr") ||
          (isExpected && drBase <= 0 ? Math.round(globalExpectedDrRate * 1000) / 10 : 0);
        const deliveryPctVal = boundedProductRatePct(deliveriesVal, product.netOrderCount, product.key + ":display-delivery");

        return {
          ...clean,
          placedCount: product.netOrderCount,
          totalOrders: product.totalOrderCount,
          totalOrderCount: product.totalOrderCount,
          actualDeliveredCount: product.calculatorDeliveredCount,
          actualCommission: product.calculatorEarnedProfitAfterTax,
          actualEarnedProfitAfterTax: product.calculatorEarnedProfitAfterTax,
          deliveries: deliveriesVal,
          deliveredCount: deliveriesVal,
          expectedDeliveriesExact: projection.expectedDeliveriesExact,
          expectedDeliveriesDisplay: projection.expectedDeliveriesDisplay,
          expectedTotalProfitBeforeAdSpend: projection.expectedTotalProfitBeforeAdSpend,
          expectedDeliveredSales: projection.expectedDeliveredSales,
          expectedNdrRate: ndrRate,
          revenue: commissionVal,
          commission: commissionVal,
          totalSales: product.revenue,
          ndrPct: ndrPctVal,
          drRate: drRateVal,
          deliveryPct: deliveryPctVal,
          ndrBaseOrders: ndrBase,
          ndrDeliveredOrders: ndrDelivered,
          drBaseOrders: drBase,
          drDeliveredOrders: drDelivered,
          rateMode: isExpected ? "historical_cohort" : "actual",
          rateSource: productNdrBase <= 0 && globalNdrBase <= 0 ? "insufficient_history" : (usesGlobalNdrFallback || usesGlobalDrFallback ? "global_fallback" : "product"),
          insufficientHistory: isExpected && productNdrBase <= 0 && globalNdrBase <= 0,
          netOrderCount: product.netOrderCount,
          confirmationPct: statusRates.confirmationPct,
          cancelPct: statusRates.cancelPct,
          pendingPct: statusRates.pendingPct,
          accountCount: Object.keys(product.accounts).length,
          cityCount: Object.keys(product.cities).length,
          adSpend: 0,
          allocatedAdSpend: 0,
          financialCurrency,
          campaignCount: 0,
        };
      });
      assignCampaignProducts(
        scopedCampaigns(scope, accounts, "all", input),
        list,
        input && input.productNameOverrides
      ).forEach((campaign) => {
        if (!campaign.attributionVerified) return;
        const product = list.find((item) => item.key === campaign.productKey);
        if (!product) return;
        product.adSpend += number(campaign.spend ?? campaign.convertedSpend ?? campaign.rawSpend);
        product.campaignCount += 1;
      });
      list.forEach((product) => {
        const financialSpend = convertMoney(product.adSpend, reportingCurrency, financialCurrency, financialInput);
        const financialCommission = convertMoney(product.commission, reportingCurrency, financialCurrency, financialInput);
        const actualFinancialCommission = convertMoney(product.actualCommission, reportingCurrency, financialCurrency, financialInput);
        const financialSales = convertMoney(product.totalSales, reportingCurrency, financialCurrency, financialInput);
        const productFinancials = financialCore.calculate({
          mode: isExpected ? "expected" : "actual",
          netOrders: product.netOrderCount,
          actualDeliveredOrders: product.actualDeliveredCount,
          actualEarnedProfitAfterTax: actualFinancialCommission,
          currentTotalSales: financialSales,
          expectedNdrRate: product.expectedNdrRate,
          adSpend: financialSpend,
          insufficientHistory: product.insufficientHistory,
        });
        product.allocatedAdSpend = financialSpend;
        product.cpa = productFinancials.cpa;
        product.averageProfit = productFinancials.averageProfit;
        product.breakEvenCpa = productFinancials.breakEvenCpa;
        product.expectedDeliveredCpa = productFinancials.expectedDeliveredCpa;
        product.expectedNetProfit = productFinancials.expectedNetProfit;
        product.expectedProfitRoas = productFinancials.expectedProfitRoas;
        product.expectedRoi = productFinancials.expectedRoi;
        product.expectedSalesRoas = productFinancials.expectedSalesRoas;
        product.netProfit = isExpected ? productFinancials.expectedNetProfit : financialCommission - financialSpend;
        product.profitLoss = product.netProfit;
        product.scalingScore = Math.round(Math.max(0, Math.min(100, product.ndrPct + product.drRate)));
      });
      const query = lower(input.filters && input.filters.search);
      if (query) list = list.filter((product) => lower(product.name + " " + product.sku).includes(query));
      const statusKey = text(input.filters && input.filters.statusKey);
      if (statusKey && statusKey !== "all") {
        const field = {
          delivered: "deliveredCount",
          failed: "failedCount",
          canceled: "canceledCount",
          shipping: "shippingCount",
          processing: "processingCount",
        }[statusKey];
        if (field) list = list.filter((product) => number(product[field]) > 0);
      }
      // Sort matches legacy aggregator: deliveredCount desc, commission desc, key as alphabetical tie-breaker.
      const productRankCompare = (a, b) => (number(b.deliveredCount) - number(a.deliveredCount)) || (number(b.commission) - number(a.commission)) || String(a.key || "").localeCompare(String(b.key || ""));
      const defaultRanked = list.slice().sort(productRankCompare);
      const ranks = new Map(defaultRanked.map((product, index) => [product.key, index + 1]));
      list.forEach((product) => { product.rank = ranks.get(product.key) || 0; });
      const sortBy = text(input.sortBy) || "deliveredCount";
      list.sort(sortBy === "deliveredCount" && input.sortDir !== "asc" ? productRankCompare : compareRows(sortBy, input.sortDir === "asc" ? "asc" : "desc"));
      const pagination = pageInfo(input, list.length);
      return {
        ok: true,
        kind: "products",
        scope,
        summary: {
          uniqueProducts: list.length,
          totalOrders: globalNetOrderKeys.size,
          netOrderCount: globalNetOrderKeys.size,
          totalOrderCount: globalOrderKeys.size,
          rawTotalOrders: globalOrderKeys.size,
          totalPieces: list.reduce((sum, product) => sum + product.totalPieces, 0),
          totalCommission: isExpected ? list.reduce((sum, p) => sum + p.commission, 0) : globalDeliveredCommission,
          deliveredOrders: list.reduce((sum, product) => sum + product.deliveredCount, 0),
          campaignSpend: list.reduce((sum, product) => sum + product.allocatedAdSpend, 0),
          ndrPct: list.reduce((sum, product) => sum + product.netOrderCount, 0)
            ? list.reduce((sum, product) => sum + product.deliveredCount, 0) /
              list.reduce((sum, product) => sum + product.netOrderCount, 0) * 100
            : 0,
        },
        rows: list.slice(pagination.start, pagination.end).map(({ accounts, cities, ...product }) => product),
        pagination,
      };
    });
  }

  function productDetails(input) {
    return cached("product-details", input, () => {
      const keys = new Set((input.productKeys || []).map(text));
      const { rows } = scopedRows(input, { includeNdrUnion: true });
      const details = {};
      rows.forEach((row, index) => {
        const sku = rowSku(row);
        const name = rowProduct(row) || "Unknown Product";
        const country = lower(row.taagerCountry || row.country || "unknown");
        // Key must match productRows key scheme (country-aware SKU).
        const key = sku ? country + "|sku:" + lower(sku) : row.accountId + "|name:" + lower(name);
        if (!keys.has(key)) return;
        if (!details[key]) details[key] = { key, accounts: {}, cities: {}, quantities: {}, pieces: {}, orders: [], seenOrders: {} };
        const detail = details[key];
        detail.accounts[row.accountId] = (detail.accounts[row.accountId] || 0) + 1;
        const city = rowCity(row);
        const bucket = statusBucket(row);
        const uniqueOrderKey = orderKey(row, index);
        if (city && !detail.seenOrders[city + "|" + uniqueOrderKey]) {
          detail.seenOrders[city + "|" + uniqueOrderKey] = true;
          if (!detail.cities[city]) detail.cities[city] = {
            name: city, count: 0, delivered: 0, confirmed: 0, canceled: 0, pending: 0,
            statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
            commission: 0
          };
          if (bucket !== "canceled_by_you") {
            detail.cities[city].count += 1;
            detail.cities[city].statusTotalCount += 1;
            const group = productStatusGroup(bucket);
            if (group === "confirmation") {
              detail.cities[city].confirmed += 1;
              detail.cities[city].confirmationStatusCount += 1;
            } else if (group === "cancel") {
              detail.cities[city].canceled += 1;
              detail.cities[city].cancelStatusCount += 1;
            } else {
              detail.cities[city].pending += 1;
              detail.cities[city].pendingStatusCount += 1;
            }
          }
          if (bucket === "delivered") detail.cities[city].delivered += 1;
          if (bucket === "delivered") detail.cities[city].commission += rowProfit(row);
        }
        const qty = String(Math.max(1, number(row.qty || row.quantity || 1)));
        if (!detail.quantities[qty]) detail.quantities[qty] = {};
        if (city && !detail.quantities[qty][city]) detail.quantities[qty][city] = {
          name: city, count: 0, delivered: 0, confirmed: 0, canceled: 0, pending: 0,
          statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0
        };
        const quantitySeenKey = "quantity|" + qty + "|" + city + "|" + uniqueOrderKey;
        if (city && !detail.seenOrders[quantitySeenKey]) {
          detail.seenOrders[quantitySeenKey] = true;
          if (bucket !== "canceled_by_you") {
            detail.quantities[qty][city].count += 1;
            detail.quantities[qty][city].statusTotalCount += 1;
            const group = productStatusGroup(bucket);
            if (group === "confirmation") {
              detail.quantities[qty][city].confirmed += 1;
              detail.quantities[qty][city].confirmationStatusCount += 1;
            } else if (group === "cancel") {
              detail.quantities[qty][city].canceled += 1;
              detail.quantities[qty][city].cancelStatusCount += 1;
            } else {
              detail.quantities[qty][city].pending += 1;
              detail.quantities[qty][city].pendingStatusCount += 1;
            }
          }
          if (bucket === "delivered") detail.quantities[qty][city].delivered += 1;
        }
        if (!detail.pieces[qty]) {
          detail.pieces[qty] = {
            qty, count: 0, delivered: 0, confirmed: 0, canceled: 0, pending: 0,
            statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0
          };
        }
        const pieceSeenKey = "piece|" + qty + "|" + uniqueOrderKey;
        if (!detail.seenOrders[pieceSeenKey]) {
          detail.seenOrders[pieceSeenKey] = true;
          if (bucket !== "canceled_by_you") {
            detail.pieces[qty].count += 1;
            detail.pieces[qty].statusTotalCount += 1;
            const group = productStatusGroup(bucket);
            if (group === "confirmation") {
              detail.pieces[qty].confirmed += 1;
              detail.pieces[qty].confirmationStatusCount += 1;
            } else if (group === "cancel") {
              detail.pieces[qty].canceled += 1;
              detail.pieces[qty].cancelStatusCount += 1;
            } else {
              detail.pieces[qty].pending += 1;
              detail.pieces[qty].pendingStatusCount += 1;
            }
          }
          if (bucket === "delivered") detail.pieces[qty].delivered += 1;
        }
        if (detail.orders.length < 50) detail.orders.push(row);
      });
      Object.keys(details).forEach((key) => {
        const detail = details[key];
        detail.cityBreakdown = Object.values(detail.cities).map((city) => {
          const statusRates = productStatusPercentages(
            city.confirmationStatusCount,
            city.cancelStatusCount,
            city.pendingStatusCount,
            city.statusTotalCount
          );
          return {
            ...city,
            count: city.statusTotalCount,
            netOrderCount: city.count,
            confirmationPct: statusRates.confirmationPct,
            cancelPct: statusRates.cancelPct,
            pendingPct: statusRates.pendingPct,
            ndr: city.count ? city.delivered / city.count * 100 : 0,
          };
        }).sort((a, b) => b.count - a.count);
        detail.quantityCityBreakdown = Object.keys(detail.quantities).map((qty) => ({
          qty,
          cities: Object.values(detail.quantities[qty]).map((city) => {
            const statusRates = productStatusPercentages(
              city.confirmationStatusCount,
              city.cancelStatusCount,
              city.pendingStatusCount,
              city.statusTotalCount
            );
            return {
              ...city,
              count: city.statusTotalCount,
              netOrderCount: city.count,
              confirmationPct: statusRates.confirmationPct,
              cancelPct: statusRates.cancelPct,
              pendingPct: statusRates.pendingPct,
              ndr: city.count ? city.delivered / city.count * 100 : 0,
            };
          }).sort((a, b) => b.count - a.count),
        })).sort((a, b) => number(a.qty) - number(b.qty));
        detail.piecesBreakdown = Object.values(detail.pieces).map((item) => {
          const statusRates = productStatusPercentages(
            item.confirmationStatusCount,
            item.cancelStatusCount,
            item.pendingStatusCount,
            item.statusTotalCount
          );
          return {
            ...item,
            count: item.statusTotalCount,
            netOrderCount: item.count,
            confirmationPct: statusRates.confirmationPct,
            cancelPct: statusRates.cancelPct,
            pendingPct: statusRates.pendingPct,
            ndr: item.count ? item.delivered / item.count * 100 : 0,
          };
        }).sort((a, b) => number(a.qty) - number(b.qty));
        delete detail.cities;
        delete detail.quantities;
        delete detail.pieces;
        delete detail.seenOrders;
      });
      return { ok: true, kind: "product-details", scope: normalizeScope(input || {}, getAllowedAccountIds()), details };
    });
  }

  function campaignRows(input) {
    return cached("campaigns", input, () => {
      const { rows: rawOrderRows, scope, accounts } = scopedRows(input);
      const requestedPlatform = text(input.platform);
      const productNameOverrides = sanitizeProductNameOverrides(input.productNameOverrides);
      const productMap = new Map();
      rawOrderRows.forEach((row) => {
        const sku = rowSku(row);
        if (!sku) return;
        const country = lower(row.taagerCountry || row.country || "unknown");
        // Must match productRows key scheme so campaign.productKey lookups resolve correctly.
        const key = country + "|sku:" + lower(sku);
        if (!productMap.has(key)) {
          productMap.set(key, {
            key,
            sku,
            name: productNameOverride(sku, rowProduct(row), productNameOverrides),
            country,
            accounts: {},
          });
        }
        productMap.get(key).accounts[row.accountId] = true;
      });
      let rows = assignCampaignProducts(
        scopedCampaigns(scope, accounts, requestedPlatform, input),
        Array.from(productMap.values()),
        productNameOverrides
      );
      const filters = input.filters || {};
      const query = lower(filters.search);
      rows = rows.filter((row) => {
        if (filters.objective && filters.objective !== "all" && text(row.objective) !== text(filters.objective)) return false;
        if (!query) return true;
        return lower([row.campaign, row.campaignId, row.objective, row.status, row.platform, row.accountId].join(" ")).includes(query);
      });
      rows.sort(compareRows(text(input.sortBy) || "spend", input.sortDir === "asc" ? "asc" : "desc"));
      const pagination = pageInfo(input, rows.length);
      return {
        ok: true,
        kind: "campaigns",
        scope,
        summary: {
          campaignCount: rows.length,
          spend: rows.reduce((sum, row) => sum + number(row.spend ?? row.convertedSpend ?? row.rawSpend), 0),
          rawSpendByCurrency: rows.reduce((out, row) => {
            const currency = cleanCurrency(row.rawCurrency || row.currency || "SAR", "SAR");
            out[currency] = (out[currency] || 0) + number(row.rawSpend ?? row.spend);
            return out;
          }, {}),
          clicks: rows.reduce((sum, row) => sum + number(row.clicks), 0),
          impressions: rows.reduce((sum, row) => sum + number(row.impressions), 0),
        },
        rows: rows.slice(pagination.start, pagination.end),
        pagination,
      };
    });
  }

  function campaignOverview(input) {
    return cached("campaign-overview", input, () => {
      const { rows, scope, accounts } = scopedRows(input);
      const platform = text(input.platform) || "all";
      const productNameOverrides = sanitizeProductNameOverrides(input.productNameOverrides);
      const intel = cached("campaign-base", {
        attributionVersion: productAttribution.VERSION,
        accountIds: scope.accountIds,
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        platform,
        reportingCurrency: input.reportingCurrency || "SAR",
        orderCurrency: input.orderCurrency || input.reportingCurrency || "SAR",
        egpRate: input.egpRate,
        exchangeRates: input.exchangeRates || {},
        exchangeRatesUpdatedAt: input.exchangeRatesUpdatedAt || "",
        productNameOverrides,
      }, () => buildCampaignIntelligence({
          orderRows: rows,
          products: campaignProductRows(rows, productNameOverrides),
          campaignRows: scopedCampaigns(scope, accounts, platform, input),
          reportingCurrency: input.reportingCurrency || "SAR",
          orderCurrency: input.orderCurrency || input.reportingCurrency || "SAR",
          egpRate: input.egpRate,
          exchangeRates: input.exchangeRates || {},
          productNameOverrides,
        }));
      const pages = filterAndPage(intel, input);
      const lastSyncAt = scope.accountIds.reduce((latest, accountId) => {
        const marketing = accounts[accountId] && accounts[accountId].marketing || {};
        Object.keys(marketing).forEach((key) => {
          if (platform !== "all" && key !== platform) return;
          const value = marketing[key] && (marketing[key].lastSyncAt || marketing[key].summary && marketing[key].summary.lastSyncAt);
          if (value && (!latest || new Date(value) > new Date(latest))) latest = value;
        });
        return latest;
      }, "");
      return {
        ok: true,
        kind: "campaign-overview",
        scope,
        currency: intel.currency,
        periodLabel: [scope.dateFrom, scope.dateTo].filter(Boolean).join(" - ") || "Synced dashboard period",
        sourceOfTruth: "Product decisions use unified SKU or unique-name campaign attribution with Taager orders, delivery, and profit. Campaign rows retain native ad-account money.",
        lastSyncAt,
        totals: intel.totals,
        objectiveMix: intel.objectiveMix,
        objectives: intel.objectives,
        decisionCounts: intel.decisionCounts,
        creativeSummary: intel.creativeSummary,
        campaignRows: pages.campaignPage.rows,
        campaignPagination: pages.campaignPage.pagination,
        productRows: pages.productPage.rows,
        productPagination: pages.productPage.pagination,
      };
    });
  }

  function campaignAiContext(input) {
    return cached("campaign-ai-context", input, () => {
      const overview = campaignOverview({
        ...input,
        kind: "campaign-overview",
        campaignPage: 1,
        productPage: 1,
        pageSize: 50,
        campaignFilters: {},
        productFilters: {},
        campaignSortBy: "spend",
        campaignSortDir: "desc",
        productSortBy: "aiPriority",
        productSortDir: "desc",
      });
      return {
        ok: overview.ok,
        kind: "campaign-ai-context",
        currency: overview.currency,
        periodLabel: overview.periodLabel,
        sourceOfTruth: overview.sourceOfTruth,
        lastSyncAt: overview.lastSyncAt,
        totals: overview.totals,
        productActions: (overview.productRows || []).slice(0, 20),
        topSpendCampaigns: (overview.campaignRows || []).slice(0, 20),
        creativeSummary: overview.creativeSummary,
      };
    });
  }

  function campaignPageQuery(input, mode) {
    const overview = campaignOverview({
      ...input,
      kind: "campaign-overview",
      campaignPage: mode === "campaigns" ? input.page : 1,
      productPage: mode === "products" ? input.page : 1,
      campaignSortBy: mode === "campaigns" ? input.sortBy : input.campaignSortBy,
      campaignSortDir: mode === "campaigns" ? input.sortDir : input.campaignSortDir,
      productSortBy: mode === "products" ? input.sortBy : input.productSortBy,
      productSortDir: mode === "products" ? input.sortDir : input.productSortDir,
      campaignFilters: mode === "campaigns" ? (input.filters || input.campaignFilters) : input.campaignFilters,
      productFilters: mode === "products" ? (input.filters || input.productFilters) : input.productFilters,
    });
    return mode === "campaigns"
      ? { ok: overview.ok, kind: "campaign-rows", scope: overview.scope, rows: overview.campaignRows, pagination: overview.campaignPagination, totals: overview.totals }
      : { ok: overview.ok, kind: "campaign-product-actions", scope: overview.scope, rows: overview.productRows, pagination: overview.productPagination, totals: overview.totals };
  }

  function citiesQuery(input) {
      return cached("cities", input, () => {
        const { rows, scope, accounts } = scopedRows(input, { includeNdrUnion: true });
        const cityStats = {};
        const reportingCurrency = cleanCurrency(input && (input.reportingCurrency || input.currency) || "SAR", "SAR");
      
      const ndrFrom = dateKey((input && (input.ndrDateFrom || input.ndrFrom)) || "");
      const ndrTo   = dateKey((input && (input.ndrDateTo   || input.ndrTo))   || "");

        rows.forEach((row, index) => {
          const rowCountry = lower(row.taagerCountry || row.country || "sa");
        const cityName = text(row.city || row.customerCity || row.province || "");
        if (!cityName) return;

        const isMixedCountry = !!input.isMixedCountry;
        const cityKeyName = isMixedCountry ? (rowCountry + '|' + cityName) : cityName;

        if (!cityStats[cityKeyName]) {
          cityStats[cityKeyName] = {
            name: cityName,
            country: rowCountry,
            due: 0, collected: 0, gap: 0, count: 0, ndrBaseOrders: 0,
            deliveredOrders: 0, ndrDeliveredOrders: 0, drBaseOrders: 0, drDeliveredOrders: 0,
            canceledCount: 0, shippingCount: 0, confirmedCount: 0, processingCount: 0,
            statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
            earnedProfitAfterTax: 0,
            earnedCommission: 0, incomingCommission: 0, lostCommission: 0,
            totalRevenue: 0,
            prepaidCount: 0, codCount: 0,
            prepaidDeliveredCount: 0, codDeliveredCount: 0,
            prepaidCanceledCount: 0, codCanceledCount: 0,
            prepaidNdrBaseOrders: 0, codNdrBaseOrders: 0,
            prepaidDrBaseOrders: 0, prepaidDrDeliveredOrders: 0,
            codDrBaseOrders: 0, codDrDeliveredOrders: 0,
            deliveryDays: [],
            provinceId: (isMixedCountry ? rowCountry + '-' : '') + resolveProvince(cityName, rowCountry),
            productMap: {}
          };
        }

        const cs = cityStats[cityKeyName];
        const bucket = statusBucket(row);
        const uniqueOrderKey = orderKey(row, index);
        const rowIsCanceledByYou = bucket === "canceled_by_you";
        const rowIsNetOrder = bucket !== "canceled_by_you";
        const rowIsPrepaid = isRowPrepaid(row);
        const rowInConfirmedBase = isConfirmedBucket(bucket);
        
        const inPrimaryPeriod = inRange(row, scope);
        const inNdrCohort = inNdrRange(row, ndrFrom, ndrTo);
        const isDeliveredInPeriod = inPrimaryPeriod && bucket === "delivered";
        const isDeliveredInNdrCohort = inNdrCohort && bucket === "delivered";
        const isLost = isFailedBucket(bucket);
        const isIncoming = isIncomingBucket(bucket);

        const priceVal = rowTotal(row);
        const commissionVal = rowProfit(row);
        const dueVal = rowAmountDue(row);

        if (!cs._seenKeys) {
          cs._seenKeys = new Set();
        }
        
        const addOnce = (lbl) => {
          if (cs._seenKeys.has(lbl)) return false;
          cs._seenKeys.add(lbl);
          return true;
        };

        if (inPrimaryPeriod && !rowIsCanceledByYou && addOnce('status:' + uniqueOrderKey)) {
          cs.statusTotalCount++;
          const group = productStatusGroup(bucket);
          if (group === 'confirmation') cs.confirmationStatusCount++;
          else if (group === 'cancel') cs.cancelStatusCount++;
          else cs.pendingStatusCount++;
        }

        if (inPrimaryPeriod && rowIsNetOrder && addOnce('placed:' + uniqueOrderKey)) {
          cs.count++;
          if (rowIsPrepaid) {
            cs.prepaidCount++;
          } else {
            cs.codCount++;
          }
        }

        if (inPrimaryPeriod && rowIsNetOrder && addOnce('financial:' + uniqueOrderKey)) {
          cs.totalRevenue += priceVal;
        }

        if (inNdrCohort && rowIsNetOrder && addOnce('ndr:' + uniqueOrderKey)) {
          cs.ndrBaseOrders++;
          if (rowIsPrepaid) cs.prepaidNdrBaseOrders++;
          else cs.codNdrBaseOrders++;
        }

        if (rowInConfirmedBase && addOnce('dr:' + uniqueOrderKey)) {
          cs.drBaseOrders++;
          if (rowIsPrepaid) cs.prepaidDrBaseOrders++;
          else cs.codDrBaseOrders++;
        }

        if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce('ndrDelivered:' + uniqueOrderKey)) {
          cs.ndrDeliveredOrders++;
          if (rowInConfirmedBase) cs.drDeliveredOrders++;
        }

        if (isDeliveredInPeriod && rowIsNetOrder) {
          if (addOnce('delivered:' + uniqueOrderKey)) {
            if (!rowIsPrepaid) {
              cs.due += dueVal;
              cs.collected += dueVal;
            }
            cs.deliveredOrders++;
            cs.earnedProfitAfterTax += commissionVal;
            cs.earnedCommission += commissionVal;
            
            let span = null;
            if (row.createdAt && row.deliveredAt) {
              const cTime = new Date(row.createdAt).getTime();
              const dTime = new Date(row.deliveredAt).getTime();
              if (!isNaN(cTime) && !isNaN(dTime)) {
                span = Math.round((dTime - cTime) / 86400000);
              }
            }
            if (span !== null && span >= 0 && span <= 60) {
              cs.deliveryDays.push(span);
            }

            if (rowIsPrepaid) {
              cs.prepaidDeliveredCount++;
              cs.prepaidDrDeliveredOrders++;
            } else {
              cs.codDeliveredCount++;
              cs.codDrDeliveredOrders++;
            }
          }
        } else if (isLost && inPrimaryPeriod && rowIsNetOrder) {
          if (addOnce('lost:' + uniqueOrderKey)) {
            cs.canceledCount++;
            cs.lostCommission += commissionVal;

            if (rowIsPrepaid) {
              cs.prepaidCanceledCount++;
            } else {
              cs.codCanceledCount++;
            }
          }
        } else if (isIncoming && inPrimaryPeriod && rowIsNetOrder) {
          if (addOnce('incoming:' + uniqueOrderKey)) {
            if (bucket === 'shipping')   cs.shippingCount++;
            if (bucket === 'confirmed')  cs.confirmedCount++;
            if (bucket === 'processing') cs.processingCount++;

            cs.incomingCommission += commissionVal;
            if (!rowIsPrepaid) {
              cs.due += dueVal;
              cs.gap += dueVal;
            }
          }
        }

        // Product Breakdown per City
        const cityProductName = rowProduct(row) || 'Unknown Product';
        const cityProductSku = rowSku(row);
        const cityProductKey = (cityProductSku || cityProductName || '').toLowerCase();

        if (cityProductKey) {
          if (!cs.productMap[cityProductKey]) {
            cs.productMap[cityProductKey] = {
              sku: cityProductSku || '',
              name: cityProductName,
              orders: 0, delivered: 0, canceled: 0, commission: 0, revenue: 0,
              activeOrders: 0, ndrBaseOrders: 0, confirmed: 0,
              statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
              prepaidCount: 0, codCount: 0,
              prepaidNdrBaseOrders: 0, codNdrBaseOrders: 0,
              prepaidDelivered: 0, prepaidCanceled: 0,
              codDelivered: 0, codCanceled: 0
            };
          }
          const cp = cs.productMap[cityProductKey];

          if (inPrimaryPeriod && !rowIsCanceledByYou && addOnce('cityProductStatus:' + cityProductKey + ':' + uniqueOrderKey)) {
            cp.statusTotalCount++;
            const group = productStatusGroup(bucket);
            if (group === 'confirmation') cp.confirmationStatusCount++;
            else if (group === 'cancel') cp.cancelStatusCount++;
            else cp.pendingStatusCount++;
          }
          if (inPrimaryPeriod && rowIsNetOrder && addOnce('cityProductPlaced:' + cityProductKey + ':' + uniqueOrderKey)) {
            cp.orders++;
            if (rowIsPrepaid) cp.prepaidCount++;
            else cp.codCount++;
          }
          if (inPrimaryPeriod && rowIsNetOrder && addOnce('cityProductFinancial:' + cityProductKey + ':' + uniqueOrderKey)) {
            cp.revenue += priceVal;
          }
          if (inNdrCohort && rowIsNetOrder && addOnce('cityProductNdr:' + cityProductKey + ':' + uniqueOrderKey)) {
            cp.ndrBaseOrders++;
            if (rowIsPrepaid) cp.prepaidNdrBaseOrders++;
            else cp.codNdrBaseOrders++;
          }
          if (rowInConfirmedBase && addOnce('cityProductDr:' + cityProductKey + ':' + uniqueOrderKey)) {
            cp.activeOrders++;
            if (rowIsPrepaid) cp.prepaidDrBaseOrders++;
            else cp.codDrBaseOrders++;
          }
          if (isDeliveredInPeriod && rowIsNetOrder) {
            if (addOnce('cityProductDelivered:' + cityProductKey + ':' + uniqueOrderKey)) {
              cp.delivered++;
              cp.commission += commissionVal;
              if (rowIsPrepaid) {
                cp.prepaidDelivered++;
              } else {
                cp.codDelivered++;
              }
            }
          } else if (isLost && inPrimaryPeriod && rowIsNetOrder) {
            if (addOnce('cityProductLost:' + cityProductKey + ':' + uniqueOrderKey)) {
              cp.canceled++;
              if (rowIsPrepaid) {
                cp.prepaidCanceled++;
              } else {
                cp.codCanceled++;
              }
            }
          }
        }
      });

      const citiesExpectedMode = text(input && input.deliveredDateMode) === "expected";
      const globalCityNdrBase = Object.values(cityStats).reduce((sum, stat) => sum + number(stat.ndrBaseOrders), 0);
      const globalCityNdrDelivered = Object.values(cityStats).reduce((sum, stat) => sum + number(stat.ndrDeliveredOrders), 0);
      const sortedCities = Object.keys(cityStats).map((keyName) => {
        const stat = cityStats[keyName];
        delete stat._seenKeys;

        const rateResolution = citiesExpectedMode
          ? financialCore.resolveExpectedRate(stat.ndrDeliveredOrders, stat.ndrBaseOrders, globalCityNdrDelivered, globalCityNdrBase)
          : { rate: stat.count > 0 ? stat.deliveredOrders / stat.count : 0, source: "actual", insufficientHistory: false };
        const cityNdrBase = citiesExpectedMode ? stat.ndrBaseOrders : stat.count;
        const cityNdrDelivered = citiesExpectedMode ? stat.ndrDeliveredOrders : stat.deliveredOrders;
        const drPctCity = stat.drBaseOrders > 0
          ? (stat.drDeliveredOrders / stat.drBaseOrders * 100)
          : 0;
        const cityProjection = financialCore.calculate({
          mode: citiesExpectedMode ? "expected" : "actual",
          netOrders: stat.count,
          actualDeliveredOrders: stat.deliveredOrders,
          actualEarnedProfitAfterTax: stat.earnedProfitAfterTax,
          currentTotalSales: stat.totalRevenue,
          expectedNdrRate: rateResolution.rate,
          adSpend: 0,
          insufficientHistory: rateResolution.insufficientHistory,
        });
        const displayedCityDeliveries = citiesExpectedMode ? cityProjection.expectedDeliveriesDisplay : stat.deliveredOrders;
        const ndrPctCity = displayedCityDeliveries > 0 ? rateResolution.rate * 100 : 0;

        const prepaidPctCity = stat.count > 0 ? (stat.prepaidCount / stat.count * 100) : 0;
        const codPctCity = stat.count > 0 ? (stat.codCount / stat.count * 100) : 0;
        const avgOrderValue = stat.count > 0 ? (stat.totalRevenue / stat.count) : 0;
        
        let avgDeliveryDays = null;
        if (stat.deliveryDays.length > 0) {
          const sum = stat.deliveryDays.reduce((s, v) => s + v, 0);
          avgDeliveryDays = sum / stat.deliveryDays.length;
        }

        const cityStatusRates = productStatusPercentages(
          stat.confirmationStatusCount,
          stat.cancelStatusCount,
          stat.pendingStatusCount,
          stat.statusTotalCount
        );

        return {
          key: keyName,
          name: stat.name,
          country: stat.country,
          due: stat.due,
          collected: stat.collected,
          gap: stat.gap,
          sar: stat.gap,
          count: stat.count,
          netOrderCount: stat.count,
          statusTotalCount: stat.statusTotalCount,
          confirmationStatusCount: stat.confirmationStatusCount,
          cancelStatusCount: stat.cancelStatusCount,
          pendingStatusCount: stat.pendingStatusCount,
          confirmationPct: cityStatusRates.confirmationPct,
          cancelPct: cityStatusRates.cancelPct,
          pendingPct: cityStatusRates.pendingPct,
          ndrBaseOrders: cityNdrBase,
          deliveredOrders: displayedCityDeliveries,
          actualDeliveredOrders: stat.deliveredOrders,
          expectedDeliveriesExact: cityProjection.expectedDeliveriesExact,
          expectedDeliveriesDisplay: cityProjection.expectedDeliveriesDisplay,
          ndrDeliveredOrders: cityNdrDelivered,
          drBaseOrders: stat.drBaseOrders,
          drDeliveredOrders: stat.drDeliveredOrders,
          pct: drPctCity,
          provinceId: stat.provinceId,
          totalRevenue: stat.totalRevenue,
          avgOrderValue,
          earnedProfitAfterTax: citiesExpectedMode ? cityProjection.expectedTotalProfitBeforeAdSpend : stat.earnedProfitAfterTax,
          earnedCommission: citiesExpectedMode ? cityProjection.expectedTotalProfitBeforeAdSpend : stat.earnedProfitAfterTax,
          actualEarnedProfitAfterTax: stat.earnedProfitAfterTax,
          expectedTotalProfitBeforeAdSpend: cityProjection.expectedTotalProfitBeforeAdSpend,
          expectedDeliveredSales: cityProjection.expectedDeliveredSales,
          averageProfit: stat.deliveredOrders > 0 ? stat.earnedProfitAfterTax / stat.deliveredOrders : 0,
          incomingCommission: stat.incomingCommission,
          lostCommission: stat.lostCommission,
          canceledCount: stat.canceledCount,
          shippingCount: stat.shippingCount,
          confirmedCount: stat.confirmedCount,
          processingCount: stat.processingCount,
          ndrPct: ndrPctCity,
          rateSource: rateResolution.source,
          insufficientHistory: rateResolution.insufficientHistory,
          drPct: drPctCity,
          avgDeliveryDays,
          deliveryDurationOrders: stat.deliveryDays.length,
          prepaidCount: stat.prepaidCount,
          codCount: stat.codCount,
          prepaidDeliveredCount: stat.prepaidDeliveredCount,
          codDeliveredCount: stat.codDeliveredCount,
          prepaidCanceledCount: stat.prepaidCanceledCount,
          codCanceledCount: stat.codCanceledCount,
          prepaidNdrBaseOrders: stat.prepaidNdrBaseOrders,
          codNdrBaseOrders: stat.codNdrBaseOrders,
          prepaidDrBaseOrders: stat.prepaidDrBaseOrders,
          codDrBaseOrders: stat.codDrBaseOrders,
          prepaidDrDeliveredOrders: stat.prepaidDrDeliveredOrders,
          codDrDeliveredOrders: stat.codDrDeliveredOrders,
          prepaidPct: prepaidPctCity,
          codPct: codPctCity,
          productMap: stat.productMap
        };
      }).sort((a, b) => b.gap - a.gap);

      return {
          ok: true,
          kind: "cities",
          scope,
        cities: sortedCities
        };
    });
  }

  function query(input = {}) {
    if (input.kind === "orders") return orderRows(input);
    if (input.kind === "products") return productRows(input);
    if (input.kind === "cities") return citiesQuery(input);
    if (input.kind === "product-options") {
      const result = productRows({ ...input, kind: "products", allRows: true, page: 1, filters: {} });
      return {
        ok: result.ok,
        kind: "product-options",
        scope: result.scope,
        rows: (result.rows || []).map((product) => ({
          key: product.key,
          sku: product.sku,
          name: product.name,
          rank: product.rank,
        })),
      };
    }
    if (input.kind === "product-details") return productDetails(input);
    if (input.kind === "campaign-overview") return campaignOverview(input);
    if (input.kind === "campaign-rows") return campaignPageQuery(input, "campaigns");
    if (input.kind === "campaign-product-actions") return campaignPageQuery(input, "products");
    if (input.kind === "campaign-ai-context") return campaignAiContext(input);
    if (input.kind === "campaigns") return campaignRows(input);
    return { ok: false, error: "UNSUPPORTED_DASHBOARD_QUERY" };
  }

  return { query, clearCache: () => { cache.clear(); cacheRevision = ""; } };
}

module.exports = { createDashboardQueryService };
