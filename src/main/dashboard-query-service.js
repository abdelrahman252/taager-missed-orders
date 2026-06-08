"use strict";

const { buildCampaignIntelligence, filterAndPage } = require("../renderer/pages/dashboard/dashboard-campaign-query-core");
const currencyCore = require("../renderer/pages/dashboard/dashboard-currency-core");

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

function dateKey(value) {
  if (!value) return "";
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
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
  return [accountId, "sig", row.phone || row.phone1 || row.phone2 || "", dateKey(row.createdAt || row.date), row.orderStatus || row.status || "", fallback].join("|");
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
  "canceled_by_you",
  "customer_refused_confirmation",
  "on_hold",
  "out_of_stock",
]);

function productStatusGroup(bucket) {
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
  return text(row.products || row.productName || row.product);
}

function rowSku(row) {
  return text(row.sku || row.skuNumber);
}

function rowCity(row) {
  return text(row.city || row.customerCity || row.province);
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
  };
}

function inRange(row, scope) {
  const key = dateKey(row.createdAt || row.date || row.dashboardDate);
  if (scope.dateFrom && (!key || key < scope.dateFrom)) return false;
  if (scope.dateTo && (!key || key > scope.dateTo)) return false;
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
  const factor = sortDir === "asc" ? 1 : -1;
  return (a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
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

  function scopedRows(input) {
    const accounts = getAccounts() || {};
    const scope = normalizeScope(input || {}, getAllowedAccountIds());
    const rows = [];
    scope.accountIds.forEach((accountId) => {
      const snapshot = accounts[accountId] && accounts[accountId].snapshot;
      (Array.isArray(snapshot) ? snapshot : []).forEach((row) => {
        if (!inRange(row, scope)) return;
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

  function assignCampaignProducts(campaigns, products) {
    const skuProducts = products.filter((product) => product.sku).sort((a, b) => b.sku.length - a.sku.length);
    return campaigns.map((campaign) => {
      const campaignText = lower(campaign.campaign || campaign.name);
      const campaignCountry = lower(campaign.country || "");
      const match = skuProducts.find((product) =>
        product.accounts && product.accounts[campaign.accountId] &&
        (!campaignCountry || !product.country || lower(product.country) === campaignCountry) &&
        campaignText.includes(lower(product.sku))
      );
      return match ? {
        ...campaign,
        productKey: match.key,
        product: match.name,
        productSku: match.sku,
        attributionVerified: true,
        matchMethod: "sku",
        matchConfidence: "high",
      } : {
        ...campaign,
        attributionVerified: false,
        matchMethod: "unmatched",
        matchConfidence: "none",
      };
    });
  }

  function campaignProductRows(rows) {
    const products = new Map();
    const seen = new Set();
    rows.forEach((row, index) => {
      const sku = rowSku(row);
      const name = rowProduct(row) || sku || "Unknown product";
      const productKeyValue = sku || name;
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
        product.statusTotalCount += 1;
        const group = productStatusGroup(bucket);
        if (group === "confirmation") product.confirmationStatusCount += 1;
        else if (group === "cancel") product.cancelStatusCount += 1;
        else product.pendingStatusCount += 1;
        if (bucket === "canceled_by_you") product.canceledCount += 1;
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
      if (netOrder) product.totalSales += rowTotal(row);
      if (bucket === "delivered" && netOrder && !seen.has("campaignNdrDelivered:" + uniqueOrderKey)) {
        seen.add("campaignNdrDelivered:" + uniqueOrderKey);
        product.ndrDeliveredCount += 1;
      }
      if (bucket === "delivered" && netOrder) {
        product.deliveredSales += rowTotal(row);
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
      const statusTotal = product.statusTotalCount !== undefined ? product.statusTotalCount : (product.totalOrderCount || product.placedCount || 0);
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
    }).sort((a, b) => (b.placedCount - a.placedCount) || (b.commission - a.commission));
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
      const { rows, scope, accounts } = scopedRows(input);
      const products = new Map();
      const globalOrderKeys = new Set();
      const globalDeliveredOrderKeys = new Set();
      let globalDeliveredCommission = 0;
      rows.forEach((row, index) => {
        const sku = rowSku(row);
        const name = rowProduct(row) || "Unknown Product";
        const country = lower(row.taagerCountry || row.country || "unknown");
        const key = sku ? country + "|sku:" + lower(sku) : row.accountId + "|name:" + lower(name);
        if (!products.has(key)) {
          products.set(key, {
            key, legacyKey: sku || name, sku, name, country,
            totalOrders: 0, deliveredCount: 0, totalPieces: 0, commission: 0, revenue: 0,
            statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
            failedCount: 0, canceledCount: 0, confirmedCount: 0, shippingCount: 0,
            processingCount: 0, waitingCount: 0, pendingCount: 0,
            accounts: {}, cities: {}, orderKeys: new Set()
          });
        }
        const product = products.get(key);
        const bucket = statusBucket(row);
        const productOrderKey = orderKey(row, index);
        if (bucket !== "canceled_by_you") globalOrderKeys.add(productOrderKey);
        if (bucket === "delivered" && !globalDeliveredOrderKeys.has(productOrderKey)) {
          globalDeliveredOrderKeys.add(productOrderKey);
          globalDeliveredCommission += rowProfit(row);
        }
        const isNewOrder = !product.orderKeys.has(productOrderKey);
        if (isNewOrder) {
          product.orderKeys.add(productOrderKey);
          product.statusTotalCount += 1;
          const group = productStatusGroup(bucket);
          if (group === "confirmation") product.confirmationStatusCount += 1;
          else if (group === "cancel") product.cancelStatusCount += 1;
          else product.pendingStatusCount += 1;
          if (bucket !== "canceled_by_you") product.totalOrders += 1;
          if (bucket === "delivered") product.deliveredCount += 1;
          if (bucket === "delivered") product.commission += rowProfit(row);
          if (bucket === "canceled_by_you") product.canceledCount += 1;
          if (isFailedBucket(bucket)) product.failedCount += 1;
          if (isConfirmedBucket(bucket)) product.confirmedCount += 1;
          if (bucket === "shipping") product.shippingCount += 1;
          if (bucket === "processing") product.processingCount += 1;
          if (bucket === "waiting") product.waitingCount += 1;
          if (bucket === "received" || bucket === "pending") product.pendingCount += 1;
        }
        if (bucket !== "canceled_by_you") {
          product.totalPieces += Math.max(1, number(row.qty || row.quantity || 1));
          product.revenue += rowTotal(row);
        }
        product.accounts[row.accountId] = (product.accounts[row.accountId] || 0) + 1;
        const city = rowCity(row);
        if (city) product.cities[city] = (product.cities[city] || 0) + 1;
      });
      let list = Array.from(products.values()).map((product) => {
        const confirmationBase = Math.max(0, product.totalOrders - product.pendingCount);
        const statusTotal = product.statusTotalCount !== undefined ? product.statusTotalCount : (product.totalOrders || 0);
        const clean = { ...product };
        delete clean.orderKeys;
        const statusRates = productStatusPercentages(
          product.confirmationStatusCount,
          product.cancelStatusCount,
          product.pendingStatusCount,
          statusTotal
        );
        return {
          ...clean,
          placedCount: product.totalOrders,
          deliveries: product.deliveredCount,
          ndrPct: product.totalOrders ? product.deliveredCount / product.totalOrders * 100 : 0,
          drRate: confirmationBase ? product.deliveredCount / confirmationBase * 100 : 0,
          netOrderCount: product.totalOrders,
          confirmationPct: statusRates.confirmationPct,
          cancelPct: statusRates.cancelPct,
          pendingPct: statusRates.pendingPct,
          accountCount: Object.keys(product.accounts).length,
          cityCount: Object.keys(product.cities).length,
          adSpend: 0,
          allocatedAdSpend: 0,
          campaignCount: 0,
        };
      });
      assignCampaignProducts(scopedCampaigns(scope, accounts, "all", input), list).forEach((campaign) => {
        if (!campaign.attributionVerified) return;
        const product = list.find((item) => item.key === campaign.productKey);
        if (!product) return;
        product.adSpend += number(campaign.spend ?? campaign.convertedSpend ?? campaign.rawSpend);
        product.campaignCount += 1;
      });
      list.forEach((product) => {
        product.allocatedAdSpend = product.adSpend;
        product.cpa = product.placedCount ? product.adSpend / product.placedCount : 0;
        product.averageProfit = product.deliveredCount ? product.commission / product.deliveredCount : 0;
        product.breakEvenCpa = product.averageProfit * (product.ndrPct / 100);
        product.netProfit = product.commission - product.adSpend;
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
      const productRankCompare = (a, b) => (number(b.deliveredCount) - number(a.deliveredCount)) || (number(b.commission) - number(a.commission)) || stableRowIdentity(a).localeCompare(stableRowIdentity(b));
      const defaultRanked = list.slice().sort(productRankCompare);
      const ranks = new Map(defaultRanked.map((product, index) => [product.key, index + 1]));
      list.forEach((product) => { product.rank = ranks.get(product.key) || 0; });
      const sortBy = text(input.sortBy) || "deliveredCount";
      list.sort((sortBy === "default" || sortBy === "deliveredCount") && input.sortDir !== "asc" ? productRankCompare : compareRows(sortBy, input.sortDir === "asc" ? "asc" : "desc"));
      const pagination = pageInfo(input, list.length);
      return {
        ok: true,
        kind: "products",
        scope,
        summary: {
          uniqueProducts: list.length,
          totalOrders: globalOrderKeys.size,
          totalPieces: list.reduce((sum, product) => sum + product.totalPieces, 0),
          totalCommission: globalDeliveredCommission,
          deliveredOrders: list.reduce((sum, product) => sum + product.deliveredCount, 0),
          campaignSpend: list.reduce((sum, product) => sum + product.adSpend, 0),
          ndrPct: list.reduce((sum, product) => sum + product.totalOrders, 0)
            ? list.reduce((sum, product) => sum + product.deliveredCount, 0) /
              list.reduce((sum, product) => sum + product.totalOrders, 0) * 100
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
      const { rows } = scopedRows(input);
      const details = {};
      rows.forEach((row, index) => {
        const sku = rowSku(row);
        const name = rowProduct(row) || "Unknown Product";
        const country = lower(row.taagerCountry || row.country || "unknown");
        const key = sku ? country + "|sku:" + lower(sku) : row.accountId + "|name:" + lower(name);
        if (!keys.has(key)) return;
        if (!details[key]) details[key] = { key, accounts: {}, cities: {}, quantities: {}, orders: [], seenOrders: {} };
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
          if (bucket !== "canceled_by_you") detail.cities[city].count += 1;
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
          if (bucket !== "canceled_by_you") detail.quantities[qty][city].count += 1;
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
          if (bucket === "delivered") detail.quantities[qty][city].delivered += 1;
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
        delete detail.cities;
        delete detail.quantities;
        delete detail.seenOrders;
      });
      return { ok: true, kind: "product-details", scope: normalizeScope(input || {}, getAllowedAccountIds()), details };
    });
  }

  function campaignRows(input) {
    return cached("campaigns", input, () => {
      const { rows: rawOrderRows, scope, accounts } = scopedRows(input);
      const requestedPlatform = text(input.platform);
      const productMap = new Map();
      rawOrderRows.forEach((row) => {
        const sku = rowSku(row);
        if (!sku) return;
        const country = lower(row.taagerCountry || row.country || "unknown");
        const key = country + "|sku:" + lower(sku);
        if (!productMap.has(key)) productMap.set(key, { key, sku, name: rowProduct(row), accounts: {} });
        productMap.get(key).accounts[row.accountId] = true;
      });
      let rows = assignCampaignProducts(scopedCampaigns(scope, accounts, requestedPlatform, input), Array.from(productMap.values()));
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
      const intel = cached("campaign-base", {
        accountIds: scope.accountIds,
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        platform,
        reportingCurrency: input.reportingCurrency || "SAR",
        orderCurrency: input.orderCurrency || input.reportingCurrency || "SAR",
        egpRate: input.egpRate,
        exchangeRates: input.exchangeRates || {},
        exchangeRatesUpdatedAt: input.exchangeRatesUpdatedAt || "",
      }, () => buildCampaignIntelligence({
          orderRows: rows,
          products: campaignProductRows(rows),
          campaignRows: scopedCampaigns(scope, accounts, platform, input),
          reportingCurrency: input.reportingCurrency || "SAR",
          orderCurrency: input.orderCurrency || input.reportingCurrency || "SAR",
          egpRate: input.egpRate,
          exchangeRates: input.exchangeRates || {},
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
        sourceOfTruth: "Product decisions use exact-SKU campaign spend with Taager orders, delivery, and profit. Campaign rows retain native ad-account money.",
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

  function query(input = {}) {
    if (input.kind === "orders") return orderRows(input);
    if (input.kind === "products") return productRows(input);
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
