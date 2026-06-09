(function () {
  "use strict";

  var flagsPromise = null;
  var resolvedFlags = null;
  var requestSeq = {};
  var latest = {};

  function loadFlags() {
    if (flagsPromise) return flagsPromise;
    flagsPromise = window.api && typeof window.api.getDashboardQueryFlags === "function"
      ? window.api.getDashboardQueryFlags().catch(function () { return {}; })
      : Promise.resolve({});
    return flagsPromise.then(function (result) {
      resolvedFlags = Object.assign({
        shadow: false,
        orders: false,
        products: false,
        campaigns: false,
        cities: false,
        lazyMarketing: true
      }, result || {});
      return resolvedFlags;
    });
  }

  function scopePayload(data) {
    var meta = data && data.meta || {};
    var period = window.DashboardPeriodState && typeof window.DashboardPeriodState.get === "function"
      ? window.DashboardPeriodState.get()
      : {};
    var deliveredDateMode = window.DashboardDeliveredDateState && typeof window.DashboardDeliveredDateState.get === "function"
      ? (window.DashboardDeliveredDateState.get() === "expected" ? "expected" : "actual")
      : (meta.deliveredDateMode === "expected" ? "expected" : "actual");
    var ndrPeriod = deliveredDateMode === "expected" && window.DashboardExpectedNdrRangeState && typeof window.DashboardExpectedNdrRangeState.get === "function"
      ? window.DashboardExpectedNdrRangeState.get()
      : (meta.ndrPeriod || period || {});
    var activeId = String(meta.activeAccountId || (window.getActiveAccountId ? window.getActiveAccountId() : "__all__") || "__all__");
    var accountIds = activeId === "__all__"
      ? (meta.accountOptions || window.dashboardAccountsList || []).filter(function (account) {
          return account && account.id && account.id !== "__all__";
        }).map(function (account) { return account.id; })
      : [activeId];
    return {
      accountIds: accountIds,
      dateFrom: period.dateFrom || period.from || "",
      dateTo: period.dateTo || period.to || "",
      deliveredDateMode: deliveredDateMode,
      ndrDateFrom: ndrPeriod.dateFrom || ndrPeriod.from || "",
      ndrDateTo: ndrPeriod.dateTo || ndrPeriod.to || "",
      reportingCurrency: meta.reportingCurrency || meta.activeCurrency || window.dashboardActiveCurrency || "SAR",
      exchangeRates: Object.assign({}, meta.exchangeRates || {}),
      exchangeRatesUpdatedAt: meta.exchangeRatesUpdatedAt || "",
      exchangeRateSource: meta.exchangeRateSource || ""
    };
  }

  function query(kind, params, data) {
    if (!window.api || typeof window.api.queryDashboardData !== "function") {
      return Promise.resolve({ ok: false, error: "DASHBOARD_QUERY_UNAVAILABLE" });
    }
    var requestKey = kind + "|" + String(params && params.requestChannel || "active");
    var seq = (requestSeq[requestKey] || 0) + 1;
    requestSeq[requestKey] = seq;
    var payload = Object.assign({ kind: kind }, scopePayload(data), params || {});
    return window.api.queryDashboardData(payload).then(function (result) {
      if (requestSeq[requestKey] !== seq) return { ok: false, stale: true };
      if (result && result.ok) latest[kind] = result;
      return result;
    });
  }

  function number(value) {
    var parsed = Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
    return isFinite(parsed) ? parsed : 0;
  }

  function moneyMinor(value) {
    return Math.round(number(value) * 100);
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function stableIdentity(row) {
    if (!row) return "";
    var accountId = text(row.accountId || row.dashboardAccountId || row.account || "");
    var direct = text(row.orderScopeKey || row.key || row.legacyKey || row.campaignId || row.id || row.taagerOrderNumber || row.orderNumber || row.sku || row.name || row.campaign || "");
    if (direct && accountId && direct.indexOf(accountId + "|") === 0) return direct;
    return [accountId, direct].join("|");
  }

  function pushMismatch(list, section, field, legacy, queryValue, rowIdentity) {
    list.push({
      section: section,
      field: field,
      legacy: legacy,
      query: queryValue,
      rowIdentity: rowIdentity || ""
    });
  }

  function compareValue(list, section, field, legacy, queryValue, rowIdentity) {
    if (String(legacy) !== String(queryValue)) pushMismatch(list, section, field, legacy, queryValue, rowIdentity);
  }

  function compareNumber(list, section, field, legacy, queryValue, rowIdentity) {
    if (Math.abs(number(legacy) - number(queryValue)) > 0.0001) {
      pushMismatch(list, section, field, number(legacy), number(queryValue), rowIdentity);
    }
  }

  function compareMoney(list, section, field, legacy, queryValue, rowIdentity) {
    var legacyMinor = moneyMinor(legacy);
    var queryMinor = moneyMinor(queryValue);
    if (legacyMinor !== queryMinor) pushMismatch(list, section, field, legacyMinor, queryMinor, rowIdentity);
  }

  function statusBucket(row) {
    var explicit = text(row && (row.statusBucket || row.orderStatusBucket || row.exactStatusBucket));
    if (explicit) return explicit;
    var status = text(row && (row.orderStatus || row.status)).toLowerCase();
    if (status.indexOf("canceled_by_you") !== -1) return "canceled_by_you";
    if (status.indexOf("delivered") !== -1) return "delivered";
    if (status.indexOf("shipping") !== -1) return "shipping";
    if (status.indexOf("confirmed") !== -1) return "confirmed";
    if (status.indexOf("received") !== -1 || status.indexOf("pending") !== -1) return "received";
    if (status.indexOf("failed") !== -1 || status.indexOf("return") !== -1) return "failed";
    return status || "other";
  }

  function orderValue(row) {
    return number(row && (row.dashboardTotalPrice != null ? row.dashboardTotalPrice : row.totalPrice != null ? row.totalPrice : row.total != null ? row.total : row.orderValue));
  }

  function orderProfit(row) {
    return number(row && (row.profitAfterTax != null ? row.profitAfterTax : row.taagerProfit != null ? row.taagerProfit : row.commission));
  }

  function orderIdentity(row, index) {
    var accountId = text(row && (row.accountId || row.dashboardAccountId || row.account || ""));
    var direct = text(row && (row.orderScopeKey || row.taagerOrderNumber || row.orderNumber || row.orderId || row.id || row.reference || ""));
    if (direct && accountId && direct.indexOf(accountId + "|") === 0) return direct;
    if (direct && direct.indexOf("id:") !== 0) direct = "id:" + direct;
    return accountId + "|" + (direct || "row:" + index);
  }

  function listSignature(rows, limit, sorter) {
    var list = (rows || []).slice();
    if (typeof sorter === "function") list.sort(sorter);
    return list.slice(0, limit || 25).map(stableIdentity).join("|");
  }

  function identitySetSignature(rows, limit) {
    return (rows || []).slice(0, limit || rows.length).map(stableIdentity).sort().join("|");
  }

  function productRankIdentity(row) {
    var sku = text(row && (row.sku || row.legacyKey));
    if (!sku) {
      var key = text(row && (row.key || row.id || row.name));
      var parts = key.split("|");
      sku = parts.length ? parts[parts.length - 1] : key;
      if (sku.indexOf("sku:") === 0) sku = sku.slice(4);
      if (sku.indexOf("name:") === 0) sku = sku.slice(5);
    }
    return sku.toLowerCase();
  }

  function breakdownSignature(value) {
    var source = value || {};
    return Object.keys(source).sort().map(function (key) {
      var value = number(source[key]);
      return value ? key + ":" + value : "";
    }).filter(Boolean).join("|");
  }

  function compareOrderShadow(data, result) {
    var rawLegacyRows = Array.isArray(data && data.orders) ? data.orders : [];
    var queryRows = Array.isArray(result && result.rows) ? result.rows : [];
    var querySummary = result && result.summary || {};
    var mismatches = [];
    var grouped = {};
    rawLegacyRows.forEach(function (row, index) {
      var key = orderIdentity(row, index);
      if (!grouped[key]) {
        grouped[key] = Object.assign({}, row, {
          accountId: text(row.accountId || row.dashboardAccountId || row.account || ""),
          orderScopeKey: key,
          dashboardTotalPrice: 0,
          profitAfterTax: 0
        });
      }
      grouped[key].dashboardTotalPrice += orderValue(row);
      grouped[key].profitAfterTax += orderProfit(row);
    });
    var legacyRows = Object.keys(grouped).map(function (key) {
      var row = grouped[key];
      row.statusBucket = statusBucket(row);
      return row;
    }).filter(function (row) {
      return statusBucket(row) !== "canceled_by_you";
    });
    var statusBreakdown = {};
    var totalValue = 0;
    var totalProfit = 0;
    legacyRows.forEach(function (row) {
      var bucket = statusBucket(row);
      statusBreakdown[bucket] = (statusBreakdown[bucket] || 0) + 1;
      totalValue += orderValue(row);
      totalProfit += orderProfit(row);
    });
    compareNumber(mismatches, "orders", "pagination.total", legacyRows.length, result && result.pagination && result.pagination.total);
    compareNumber(mismatches, "orders", "summary.rawOrders", legacyRows.length, querySummary.rawOrders);
    compareMoney(mismatches, "orders", "summary.totalValue", totalValue, querySummary.totalValue);
    compareMoney(mismatches, "orders", "summary.totalProfit", totalProfit, querySummary.totalProfit);
    compareValue(mismatches, "orders", "summary.statusBreakdown", breakdownSignature(statusBreakdown), breakdownSignature(querySummary.statusBreakdown));
    compareValue(mismatches, "orders", "rowIdentity.set", identitySetSignature(legacyRows), identitySetSignature(queryRows));
    return mismatches;
  }

  function compareProductShadow(data, result) {
    var products = data && data.products || {};
    var legacySummary = products.summary || {};
    var legacyRows = Array.isArray(products.rankedList) ? products.rankedList : [];
    var querySummary = result.summary || {};
    var mismatches = [];
    var legacyDelivered = legacyRows.reduce(function (sum, row) {
      return sum + Number(row.deliveredCount || row.units || 0);
    }, 0);
    [
      ["uniqueProducts", Number(legacySummary.uniqueProducts || legacyRows.length), Number(querySummary.uniqueProducts || 0)],
      ["totalOrders", Number(legacySummary.totalOrders || 0), Number(querySummary.totalOrders || 0)],
      ["totalPieces", Number(legacySummary.totalPieces || 0), Number(querySummary.totalPieces || 0)],
      ["deliveredOrders", legacyDelivered, Number(querySummary.deliveredOrders || 0)]
    ].forEach(function (pair) {
      compareNumber(mismatches, "products", "summary." + pair[0], pair[1], pair[2]);
    });
    compareMoney(mismatches, "products", "summary.totalCommission", legacySummary.totalComm || 0, querySummary.totalCommission || 0);
    var legacyTop = legacyRows.slice(0, 10).map(productRankIdentity).join("|");
    var queryTop = (result.rows || []).slice(0, 10).map(productRankIdentity).join("|");
    compareValue(mismatches, "products", "topRanking", legacyTop, queryTop);
    return mismatches;
  }

  function campaignReportingSettings(data) {
    var meta = data && data.meta || {};
    var accountId = String(meta.activeAccountId || (window.getActiveAccountId ? window.getActiveAccountId() : "__all__") || "__all__");
    var rateSnapshot = window.TaagerCurrency && typeof window.TaagerCurrency.snapshot === "function"
      ? window.TaagerCurrency.snapshot()
      : null;
    var fallback = {
      currency: meta.activeCurrency || meta.reportingCurrency || window.dashboardActiveCurrency || "SAR",
      egpRate: data && data.roi && data.roi.egpRate || 52
    };
    var settings = window.DashboardRoiState && typeof window.DashboardRoiState.get === "function"
      ? window.DashboardRoiState.get(accountId, fallback)
      : fallback;
    return {
      currency: text(settings && settings.currency || fallback.currency || "SAR").toUpperCase(),
      egpRate: number(rateSnapshot && rateSnapshot.rates && rateSnapshot.rates.EGP || settings && settings.egpRate || fallback.egpRate || 52) || 52,
      exchangeRates: Object.assign({}, rateSnapshot && rateSnapshot.rates || meta.exchangeRates || {}),
      exchangeRateSource: rateSnapshot && rateSnapshot.source || meta.exchangeRateSource || "",
      exchangeRatesUpdatedAt: rateSnapshot && rateSnapshot.updatedAt || meta.exchangeRatesUpdatedAt || ""
    };
  }

  function compareCampaignShadow(data, result) {
    var intelligence = window.TaagerCampaignIntelligence || window.KhodCampaignIntelligence;
    if (!intelligence || typeof intelligence.build !== "function") return [];
    var legacy = intelligence.build({ data: data, platform: "all" }) || {};
    var legacyTotals = legacy.totals || {};
    var queryTotals = result.totals || {};
    var legacyCampaignRows = legacy.campaigns || legacy.allCampaigns || legacy.topSpendCampaigns || [];
    var legacyProductRows = legacy.productGroups || legacy.allProductGroups || legacy.topProductGroups || [];
    var legacyDecisionCounts = legacy.decisionCounts || legacyProductRows.reduce(function (out, row) {
      var decision = row && row.decision || "watch";
      out[decision] = (out[decision] || 0) + 1;
      return out;
    }, {});
    var countFields = ["campaignCount", "taagerOrders", "taagerDelivered"];
    var moneyFields = ["spend", "matchedSpend", "unmatchedSpend", "taagerProfit", "netProfit"];
    var mismatches = [];
    countFields.forEach(function (field) {
      compareNumber(mismatches, "campaigns", "totals." + field, legacyTotals[field], queryTotals[field]);
    });
    moneyFields.forEach(function (field) {
      compareMoney(mismatches, "campaigns", "totals." + field, legacyTotals[field], queryTotals[field]);
    });
    compareValue(mismatches, "campaigns", "objectiveMix", breakdownSignature((legacy.objectiveMix || []).reduce(function (out, row) {
      out[row.objective || "unknown"] = row.spend || 0;
      return out;
    }, {})), breakdownSignature((result.objectiveMix || []).reduce(function (out, row) {
      out[row.objective || "unknown"] = row.spend || 0;
      return out;
    }, {})));
    compareValue(mismatches, "campaigns", "decisionCounts", breakdownSignature(legacyDecisionCounts), breakdownSignature(result.decisionCounts));
    compareValue(mismatches, "campaigns", "campaignRows.firstPage", listSignature(legacyCampaignRows, 50), listSignature(result.campaignRows || [], 50));
    compareValue(mismatches, "campaigns", "productRows.firstPage", listSignature(legacyProductRows, 50), listSignature(result.productRows || [], 50));
    return mismatches;
  }

  function compareCampaignAiShadow(result) {
    var mismatches = [];
    var productActions = Array.isArray(result && result.productActions) ? result.productActions : [];
    var topSpendCampaigns = Array.isArray(result && result.topSpendCampaigns) ? result.topSpendCampaigns : [];
    if (productActions.length > 20) pushMismatch(mismatches, "campaigns", "aiContext.productActionsLimit", "<=20", productActions.length);
    if (topSpendCampaigns.length > 20) pushMismatch(mismatches, "campaigns", "aiContext.topSpendCampaignsLimit", "<=20", topSpendCampaigns.length);
    return mismatches;
  }

  function emitShadow(sectionId, result, mismatches) {
    var payload = {
      section: sectionId,
      scope: result && result.scope || {},
      period: result && result.scope ? { dateFrom: result.scope.dateFrom || "", dateTo: result.scope.dateTo || "" } : {},
      durationMs: result && result.durationMs,
      mismatchCount: mismatches.length,
      mismatches: mismatches
    };
    if (mismatches.length) console.warn("[DashboardQuery][shadow] rollout mismatch", payload);
    else console.info("[DashboardQuery][shadow] rollout verified", payload);
  }

  function observe(sectionId, data) {
    if (["orders", "products", "campaigns"].indexOf(sectionId) === -1) return;
    loadFlags().then(function (flags) {
      if (!flags.shadow) return;
      var queryKind = sectionId === "campaigns" ? "campaign-overview" : sectionId;
      var campaignSettings = sectionId === "campaigns" ? campaignReportingSettings(data) : null;
      var params = {
        page: 1,
        pageSize: sectionId === "campaigns" ? 50 : 25,
        campaignPage: 1,
        productPage: 1,
        requestChannel: "shadow",
        reportingCurrency: sectionId === "campaigns"
          ? campaignSettings.currency
          : data && data.meta && (data.meta.activeCurrency || data.meta.reportingCurrency) || window.dashboardActiveCurrency || "SAR"
      };
      if (sectionId === "campaigns") {
        params.egpRate = campaignSettings.egpRate;
        params.exchangeRates = campaignSettings.exchangeRates;
        params.exchangeRateSource = campaignSettings.exchangeRateSource;
        params.exchangeRatesUpdatedAt = campaignSettings.exchangeRatesUpdatedAt;
        params.productSortBy = "taagerOrders";
        params.productSortDir = "desc";
      }
      if (sectionId === "orders" || sectionId === "products") params.allRows = true;
      return query(queryKind, params, data).then(function (result) {
        if (!result || !result.ok) return;
        var mismatches = [];
        if (sectionId === "orders") mismatches = compareOrderShadow(data, result);
        if (sectionId === "products") mismatches = compareProductShadow(data, result);
        if (sectionId === "campaigns") mismatches = compareCampaignShadow(data, result);
        if (sectionId !== "campaigns") {
          emitShadow(sectionId, result, mismatches);
          return;
        }
        return query("campaign-ai-context", {
          requestChannel: "shadow-ai",
          reportingCurrency: params.reportingCurrency,
          egpRate: params.egpRate,
          productSortBy: params.productSortBy,
          productSortDir: params.productSortDir
        }, data).then(function (aiResult) {
          if (aiResult && aiResult.ok) {
            mismatches = mismatches.concat(compareCampaignAiShadow(aiResult));
          } else {
            pushMismatch(mismatches, "campaigns", "aiContext.query", "ok", aiResult && aiResult.error || "failed");
          }
          emitShadow(sectionId, result, mismatches);
        }).catch(function (error) {
          pushMismatch(mismatches, "campaigns", "aiContext.query", "ok", error && error.message ? error.message : String(error));
          emitShadow(sectionId, result, mismatches);
          });
      });
    }).catch(function (error) {
      console.warn("[DashboardQuery][shadow] failed", sectionId, error && error.message ? error.message : error);
    });
  }

  window.DashboardQueryRuntime = {
    flags: loadFlags,
    isEnabled: function (kind) { return !!(resolvedFlags && resolvedFlags[kind]); },
    query: query,
    observe: observe,
    latest: function (kind) { return latest[kind] || null; },
    exportOrders: function (params, data) {
      if (!window.api || typeof window.api.exportDashboardOrdersQuery !== "function") {
        return Promise.resolve({ ok: false, error: "DASHBOARD_QUERY_EXPORT_UNAVAILABLE" });
      }
      return window.api.exportDashboardOrdersQuery(Object.assign({}, scopePayload(data), params || {}));
    },
    cancel: function (kind) {
      Object.keys(requestSeq).forEach(function (key) {
        if (key.indexOf(kind + "|") === 0) requestSeq[key] = (requestSeq[key] || 0) + 1;
      });
    }
  };
  loadFlags();
})();
