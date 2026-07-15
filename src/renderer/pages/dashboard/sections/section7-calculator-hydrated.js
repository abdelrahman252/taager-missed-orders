// -----------------------------------------------------------------------------
// section7-calculator.js — ROI Calculator + Smart Forecasting Engine
// Fully integrated: Calculator + Break-even Simulator + AI Insights
// -----------------------------------------------------------------------------

window.renderSection7HydratedEntry = function (mountEl, data, ctx) {
  "use strict";

  // Unicode escapes keep icons stable if this file passes through a tool with
  // a different text encoding.
  var S7_ICONS = Object.freeze({
    info: "\u2139\uFE0F",
    orders: "\u{1F4E6}",
    delivered: "\u{1F69A}",
    spend: "\u{1F4B3}",
    cost: "\u{1F4B8}",
    money: "\u{1F4B0}",
    profit: "\u{1F4C8}",
    loss: "\u{1F4C9}",
    target: "\u{1F3AF}",
    warning: "\u26A0\uFE0F",
    critical: "\u{1F6A8}",
    rocket: "\u{1F680}",
    lightning: "\u26A1",
    idea: "\u{1F4A1}",
    receipt: "\u{1F9FE}",
    reset: "\u21BB",
  });

  var calcUpdateFrame = null;
  var calcUpdateTimer = null;
  var calcVisualTimer = null;
  var calcPersistTimer = null;
  function dashboardMotionDisabled() {
    return typeof window.TaagerDashboardMotionDisabledCheck === "function"
      ? window.TaagerDashboardMotionDisabledCheck()
      : window.TaagerDashboardMotionDisabled !== false;
  }
  function scheduleCalculatorSettingsPersist() {
    if (calcPersistTimer != null) clearTimeout(calcPersistTimer);
    calcPersistTimer = setTimeout(function () {
      calcPersistTimer = null;
      persistCalculatorSettings();
    }, 180);
  }
  function scheduleCalcUI() {
    if (calcUpdateFrame != null) cancelAnimationFrame(calcUpdateFrame);
    if (calcUpdateTimer != null) clearTimeout(calcUpdateTimer);
    if (calcVisualTimer != null) clearTimeout(calcVisualTimer);
    calcUpdateFrame = requestAnimationFrame(function () {
      calcUpdateFrame = null;
      if (!mountEl.isConnected || mountEl.hidden) { mountEl._dashboardNeedsRefresh = true; return; }
      calcUpdateTimer = setTimeout(function () {
        calcUpdateTimer = null;
        calcUpdateFrame = requestAnimationFrame(function () {
          calcUpdateFrame = null;
          if (mountEl.isConnected && !mountEl.hidden) updateCalcUI({ deferVisuals: true });
        });
      }, 120);
      calcVisualTimer = setTimeout(function () {
        calcVisualTimer = null;
        if (!mountEl.isConnected || mountEl.hidden) { mountEl._dashboardNeedsRefresh = true; return; }
        requestAnimationFrame(function () {
          if (!mountEl.isConnected || mountEl.hidden) { mountEl._dashboardNeedsRefresh = true; return; }
          var res = compute();
          buildGrowthChart(res.cpaSAR, res.spendSAR);
          renderScenarios(res.cpaSAR, res.spendSAR);
        });
      }, 260);
    });
  }

  // -- Theme Observer ---------------------------------------------------------
  if (mountEl._s7ThemeObserver) {
    mountEl._s7ThemeObserver.disconnect();
    mountEl._s7ThemeObserver = null;
  }
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.attributeName === "data-theme") {
        if (!mountEl.isConnected || mountEl.hidden) {
          mountEl._dashboardNeedsRefresh = true;
          return;
        }
        var refresh = function () {
          if (mountEl.isConnected && !mountEl.hidden) window.renderSection7HydratedEntry(mountEl, data, ctx);
        };
        if (window.TaagerAfterNextPaint) window.TaagerAfterNextPaint(refresh);
        else setTimeout(refresh, 0);
      }
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  mountEl._s7ThemeObserver = observer;

  // -- 1. Real Data ------------------------------------------------------------
  var d = data || {};
  var calculatorAccountId =
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.activeAccountId) ||
    (window.getActiveAccountId ? window.getActiveAccountId() : "__all__");
  var dashboardPeriod =
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.period) ||
    (data && data.meta && data.meta.period) ||
    (window.DashboardPeriodState &&
    typeof window.DashboardPeriodState.get === "function"
      ? window.DashboardPeriodState.get()
      : null) ||
    {};
  if (window.DashboardRoiState) {
    d = Object.assign(
      {},
      d,
      window.DashboardRoiState.get(calculatorAccountId, d),
    );
  }
  var marketingState = window.DashboardMarketingState
    ? window.DashboardMarketingState.get(calculatorAccountId)
    : null;
  var syncedSpendActive = !!(
    marketingState &&
    marketingState.status === "connected" &&
    marketingState.summary &&
    !marketingState.manualOverride &&
    Number(marketingState.summary.adSpend || 0) > 0
  );
  var sourceBreakdown =
    marketingState &&
    marketingState.summary &&
    Array.isArray(marketingState.summary.sourceBreakdown)
      ? marketingState.summary.sourceBreakdown
      : [];
  var assignedMarketingAccounts = sourceBreakdown.length
    ? sourceBreakdown
    : marketingState && Array.isArray(marketingState.linkedAccounts)
      ? marketingState.linkedAccounts
      : [];
  var MARKETING_SOURCE_PAGE_SIZE = 3;
  mountEl._s7MarketingSourcePage = Math.max(1, Number(mountEl._s7MarketingSourcePage) || 1);
  if (syncedSpendActive) {
    var _rawSyncedSpend = Number(marketingState.summary.adSpend || 0);
    var _syncedCurrency = String((marketingState.summary && marketingState.summary.currency) || 'SAR').toUpperCase();
    var _roiCurrency = String(d.currency || window.dashboardActiveCurrency || 'SAR').toUpperCase();
    var _convertedSyncedSpend = _rawSyncedSpend;
    if (window.DashboardMarketingSpend && typeof window.DashboardMarketingSpend.aggregateSummary === "function") {
      _convertedSyncedSpend = window.DashboardMarketingSpend.aggregateSummary(marketingState.summary, _roiCurrency, {
        egpRate: marketingState.summary.egpRate || d.egpRate || 52,
      }).spend;
    } else if (_syncedCurrency !== _roiCurrency) {
      if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
        _convertedSyncedSpend = window.TaagerCurrency.convert(_rawSyncedSpend, _syncedCurrency, _roiCurrency);
      } else {
        var _rates = { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };
        var _fr = _rates[_syncedCurrency]; var _tr = _rates[_roiCurrency];
        if (_fr && _tr) _convertedSyncedSpend = (_rawSyncedSpend / _fr) * _tr;
      }
    }
    d = Object.assign({}, d, { adSpend: _convertedSyncedSpend });
  }
  var realTotalOrders = window.DashboardOrderMetrics
    ? window.DashboardOrderMetrics.netOrders(d)
    : Number(d.netOrderCount != null ? d.netOrderCount : d.totalOrders || 0);
  // Account calculations use the exact aggregate ratio. The shared dashboard
  // NDR remains rounded for compact cards, but values such as 29.89 must not
  // become 30 inside this calculator.
  var realNdrPct = d.ndrPctExact != null ? Number(d.ndrPctExact) : (d.ndrPct != null ? Number(d.ndrPct) : 0);
  var realShippingOrders = d.shippingCount != null ? Number(d.shippingCount) : 0;
  var realConfirmationRate = d.confirmationRate != null ? Number(d.confirmationRate) : 0;
  var realConfirmedOrders =
    d.confirmationStatusCount != null ? Number(d.confirmationStatusCount)
    : d.confirmedCount != null ? Number(d.confirmedCount)
    : d.confirmedOrders != null ? Number(d.confirmedOrders)
    : Math.round(realTotalOrders * (realConfirmationRate / 100));
  if (!Number.isFinite(realConfirmedOrders)) {
    realConfirmedOrders = Math.round(realTotalOrders * (realConfirmationRate / 100));
  }
  var realAvgCommission = d.averageProfit != null
    ? Number(d.averageProfit)
    : (d.avgCommission != null ? Number(d.avgCommission) : 0);
  var realAverageProfitSource = d.averageProfitSource || (Number(d.actualDeliveredCount != null ? d.actualDeliveredCount : d.deliveredCount || 0) > 0 ? 'delivered_orders' : (realTotalOrders > 0 && d.netOrderProfitAfterTax != null ? 'net_orders_fallback' : 'unavailable'));
  var realTaagerProfitAfterTax = d.actualEarnedProfitAfterTax != null
    ? Number(d.actualEarnedProfitAfterTax)
    : (d.taagerProfitAfterTax != null ? Number(d.taagerProfitAfterTax) : realAvgCommission);
  var isExpectedRateMode = window.isExpectedNdrMode && window.isExpectedNdrMode();

  if (isExpectedRateMode) {
    var hasExplicitExpectedNdrRate = d.expectedNdrRate != null && Number.isFinite(Number(d.expectedNdrRate));
    var globalExpectedNdrRate = hasExplicitExpectedNdrRate
      ? Number(d.expectedNdrRate) * 100
      : Number.isFinite(Number(d.ndrPctExact))
      ? Number(d.ndrPctExact)
      : 35;
    if (!hasExplicitExpectedNdrRate && !Number.isFinite(Number(d.ndrPctExact)) && ctx && ctx.data && ctx.data.overview) {
      if (ctx.data.overview.deliveryRate != null) {
        globalExpectedNdrRate = Number(ctx.data.overview.deliveryRate);
      } else if (ctx.data.overview.ndrRate && ctx.data.overview.ndrRate.value != null) {
        globalExpectedNdrRate = Number(ctx.data.overview.ndrRate.value);
      }
    }
    realNdrPct = globalExpectedNdrRate;
  }

  var realExpectedDvl =
    isExpectedRateMode && d.expectedDeliveriesDisplay != null
      ? Number(d.expectedDeliveriesDisplay || 0)
      : !isExpectedRateMode &&
    (d.actualDeliveredCount != null || d.deliveredCount != null)
      ? Number(d.actualDeliveredCount != null ? d.actualDeliveredCount : d.deliveredCount || 0)
      : Math.round((realNdrPct / 100) * realTotalOrders);
  var realExpectedDvlExact = isExpectedRateMode
    ? (d.expectedDeliveriesExact != null
      ? Number(d.expectedDeliveriesExact || 0)
      : (realNdrPct / 100) * realTotalOrders)
    : realExpectedDvl;

  // -- 2. State ----------------------------------------------------------------
  var nativeCurrency = window.dashboardActiveCurrency || (d && d.currency) || "SAR";
  var overviewData = (ctx && ctx.data && ctx.data.overview) || {};
  var overviewCurrency =
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.activeCurrency) ||
    (overviewData.totalDeliveredSales && overviewData.totalDeliveredSales.unit) ||
    nativeCurrency;
  var overviewDeliveredSales = Number(
    overviewData.totalDeliveredSales && overviewData.totalDeliveredSales.value != null
      ? overviewData.totalDeliveredSales.value
      : (d.totalDeliveredSales != null ? d.totalDeliveredSales : d.deliveredSales || 0),
  ) || 0;
  var overviewDeliveredAov = Number(
    overviewData.deliveredAov && overviewData.deliveredAov.value != null
      ? overviewData.deliveredAov.value
      : (d.deliveredAov != null ? d.deliveredAov : 0),
  ) || 0;
  var state = {
    budget: d.adSpend != null ? d.adSpend : 250,
    currency: d.currency || nativeCurrency,
    egpRate: d.egpRate != null ? d.egpRate : 52.0,
    viewCurrency: d.currency || nativeCurrency,
  };

  // Simulation state — LOCAL ONLY, never persisted
  var simState = {
    totalOrders: realTotalOrders,
    ndr: realNdrPct / 100,
    avgCommission: realAvgCommission,
    adSpend: convert(Number(state.budget || 0), state.currency, nativeCurrency),
    egpRate: d.egpRate != null ? d.egpRate : 52.0,
    viewCurrency: d.currency || nativeCurrency,
    _isModified: false,
    _adSpendModified: false,
    _avgCommissionModified: false,
  };
  var overallAccountNdrPct = realNdrPct;
  var orderSourcesModel =
    (d && d.orderSources) ||
    (ctx && ctx.data && ctx.data.orderSources) ||
    null;
  var bestNdrCycleResult = window.DashboardBestNdrCycle && typeof window.DashboardBestNdrCycle.analyze === "function"
    ? window.DashboardBestNdrCycle.analyze((ctx && ctx.data) || {})
    : null;
  var preferredBestCycle = window.DashboardBestNdrCyclePreferred;
  var preferredBestCycleActive = !!(
    preferredBestCycle &&
    bestNdrCycleResult &&
    bestNdrCycleResult.status === "ready" &&
    bestNdrCycleResult.best &&
    preferredBestCycle.dateFrom === bestNdrCycleResult.best.dateFrom &&
    preferredBestCycle.dateTo === bestNdrCycleResult.best.dateTo
  );
  var orderNdrSourceKey = mountEl._s7OrderNdrSourceKey || (preferredBestCycleActive ? "best_cycle" : "overall");

  function persistCalculatorSettings() {
    var storedManual = window.DashboardRoiState
      ? window.DashboardRoiState.get(calculatorAccountId, d)
      : d;
    var settings = {
      adSpend: syncedSpendActive ? storedManual.adSpend : state.budget,
      currency: state.currency,
      egpRate: state.egpRate,
    };
    if (window.DashboardRoiState) {
      window.DashboardRoiState.set(settings, calculatorAccountId, d);
      return;
    }
    try {
      localStorage.setItem(
        "taager_roi_settings_" + calculatorAccountId,
        JSON.stringify(settings),
      );
    } catch (e) {
      console.warn("[Calculator] Unable to persist ROI settings:", e);
    }
  }

  var isAr =
    (document.documentElement.getAttribute("lang") ||
      window._kbotLang ||
      localStorage.getItem("kbot-lang") ||
      "ar") === "ar";
  function s7Txt(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTAAGER PROFIT\b/g, 'PROFIT')
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }
  function s7Esc(value) {
    if (window.TaagerUI && typeof window.TaagerUI.esc === "function") return window.TaagerUI.esc(value);
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }
  function orderSourceName(source) {
    var label = String(source && (source.label || source.rawSource) || "").trim();
    return label || s7Txt("Unknown source", "\u0645\u0635\u062f\u0631 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641");
  }
  function s7ShortDate(value) {
    var date = new Date(String(value || "").slice(0, 10) + "T00:00:00");
    if (isNaN(date.getTime())) return String(value || "");
    return date.toLocaleDateString(window.dashboardI18n ? window.dashboardI18n.locale() : "en-US", {
      month: "short",
      day: "numeric"
    });
  }
  function bestCycleRangeLabel(best) {
    return best && best.dateFrom && best.dateTo
      ? s7ShortDate(best.dateFrom) + " - " + s7ShortDate(best.dateTo)
      : "";
  }
  function bestCycleChoice() {
    if (!bestNdrCycleResult || bestNdrCycleResult.status !== "ready" || !bestNdrCycleResult.best) return null;
    var best = bestNdrCycleResult.best;
    return {
      key: "best_cycle",
      label: s7Txt("Best NDR Cycle", "Best NDR Cycle") + " - " + bestCycleRangeLabel(best),
      ndrPct: Number(best.ndrPct || 0),
      netOrders: Number(best.netOrders || 0),
      delivered: Number(best.delivered || 0),
      lowSample: false,
      bestCycle: best
    };
  }
  function orderNdrChoices() {
    var rows = orderSourcesModel && Array.isArray(orderSourcesModel.sources)
      ? orderSourcesModel.sources
      : [];
    var minSample = Number(orderSourcesModel && orderSourcesModel.minSample || 30);
    var choices = [{
      key: "overall",
      label: s7Txt("Overall account NDR", "\u0625\u062c\u0645\u0627\u0644\u064a NDR \u0644\u0644\u062d\u0633\u0627\u0628"),
      ndrPct: overallAccountNdrPct,
      netOrders: realTotalOrders,
      lowSample: false
    }];
    var bestChoice = bestCycleChoice();
    if (bestChoice) choices.push(bestChoice);
    rows.forEach(function (source, index) {
      choices.push({
        key: "source:" + index,
        label: orderSourceName(source),
        rawSource: source.rawSource,
        ndrPct: Number(source.ndr || 0),
        netOrders: Number(source.netOrders || 0),
        lowSample: Number(source.netOrders || 0) < minSample
      });
    });
    return choices;
  }
  function activeOrderNdrChoice() {
    var choices = orderNdrChoices();
    return choices.find(function (choice) { return choice.key === orderNdrSourceKey; }) || choices[0];
  }
  function applyOrderNdrChoice(syncSim) {
    var choice = activeOrderNdrChoice();
    orderNdrSourceKey = choice.key;
    mountEl._s7OrderNdrSourceKey = choice.key;
    if (syncSim || !simState._ndrModified) {
      simState.ndr = Number(choice.ndrPct || 0) / 100;
    }
    return choice;
  }
  function bestNdrCycleCardHtml() {
    var choice = bestCycleChoice();
    if (!choice || !choice.bestCycle) return "";
    var best = choice.bestCycle;
    var avg = bestNdrCycleResult.average || {};
    var uplift = Math.round(Number(best.upliftPts || 0) * 10) / 10;
    var upliftLabel = avg.ndrPct != null
      ? ((uplift > 0 ? "+" : "") + uplift + " " + s7Txt("pts vs avg", "pts vs avg"))
      : "";
    return '<div class="s7-best-ndr-cycle-card">' +
      '<div class="s7-best-ndr-cycle-copy">' +
        '<span class="s7-best-ndr-cycle-eyebrow">' + s7Txt("Best trustworthy cycle", "Best trustworthy cycle") + '</span>' +
        '<div class="s7-best-ndr-cycle-summary">' +
          '<strong>' + s7PctValue(best.ndrPct) + '% NDR</strong>' +
          '<em>' + s7Esc(bestCycleRangeLabel(best)) + '</em>' +
        '</div>' +
        '<div class="s7-best-ndr-cycle-meta">' +
          '<span><b>' + s7Num(best.delivered) + '</b> ' + s7Txt("delivered", "delivered") + '</span>' +
          '<span><b>' + s7Num(best.netOrders) + '</b> ' + s7Txt("net orders", "net orders") + '</span>' +
          (upliftLabel ? '<span class="s7-best-ndr-cycle-uplift">' + s7Esc(upliftLabel) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="s7-best-ndr-cycle-actions">' +
        '<button type="button" class="s7-best-ndr-cycle-primary" id="s7-use-best-ndr-cycle">' + s7Txt("Use best", "Use best") + '</button>' +
        '<button type="button" id="s7-use-actual-ndr-cycle">' + s7Txt("Reset", "Reset") + '</button>' +
      '</div>' +
    '</div>';
  }
  applyOrderNdrChoice(false);
  function s7Num(value) {
    return Number(value || 0).toLocaleString("en-US");
  }
  function s7ValueStack(valueHtml, labelKey, extraClass) {
    return '<span class="expected-value-stack ' + (extraClass || '') + '" dir="auto">' +
      '<span class="expected-value-main">' + valueHtml + '</span>' +
      window.supposedBadgeHtml(labelKey) +
      '</span>';
  }
  function supportedCurrencies() {
    return window.TaagerCurrency && Array.isArray(window.TaagerCurrency.supported)
      ? window.TaagerCurrency.supported
      : ["SAR", "USD", "EGP", "AED", "IQD", "OMR"];
  }
  function currencyBadgeCode(currency) {
    return ({ SAR: "SA", USD: "US", EGP: "EG", AED: "AE", IQD: "IQ", OMR: "OM" })[currency] || currency;
  }
  function currencyTabsHtml(className, activeClass, dataAttr, currentCurrency) {
    return supportedCurrencies().map(function (currency) {
      return '<div class="' + className + ' ' +
        (currentCurrency === currency ? activeClass : "") +
        '" ' + dataAttr + '="' + currency + '">' +
        '<span style="font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.04em;opacity:.75">' + currencyBadgeCode(currency) + '</span>' +
        '<span>' + currency + '</span>' +
      '</div>';
    }).join("");
  }

  // -- 3. Conversions & Compute ------------------------------------------------
  function convert(val, from, to) {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === "function") {
      return window.TaagerCurrency.convert(val, from, to);
    }
    if (from === to) return val;
    var rates = { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };
    from = String(from || nativeCurrency || "SAR").toUpperCase();
    to = String(to || nativeCurrency || "SAR").toUpperCase();
    if (!rates[from] || !rates[to]) return val;
    return (Number(val || 0) / rates[from]) * rates[to];
  }

  function escapeSourceText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function marketingSummarySpend(targetCurrency) {
    var summary = marketingState && marketingState.summary ? marketingState.summary : {};
    var target = targetCurrency || state.currency || nativeCurrency || window.dashboardActiveCurrency || "SAR";
    if (window.DashboardMarketingSpend && typeof window.DashboardMarketingSpend.aggregateSummary === "function") {
      return window.DashboardMarketingSpend.aggregateSummary(summary, target, {
        egpRate: summary.egpRate || state.egpRate || d.egpRate || 52,
      });
    }
    var spend = Number(summary.adSpend || 0);
    var from = String(summary.currency || target).toUpperCase();
    return {
      spend: convert(spend, from, target),
      currency: target,
      sourceBreakdown: sourceBreakdown,
      rawSpendByCurrency: {},
      hasSourceBreakdown: sourceBreakdown.length > 0,
    };
  }

  function marketingSourceSpend(source, targetCurrency) {
    var target = targetCurrency || state.currency || nativeCurrency || window.dashboardActiveCurrency || "SAR";
    if (window.DashboardMarketingSpend && typeof window.DashboardMarketingSpend.sourceSpend === "function") {
      return window.DashboardMarketingSpend.sourceSpend(source || {}, target, {
        egpRate: state.egpRate || d.egpRate || 52,
        summaryCurrency: marketingState && marketingState.summary && marketingState.summary.currency || target,
      });
    }
    var hasRaw = source && source.rawSpend != null && source.rawSpend !== "";
    var hasConverted = source && source.convertedSpend != null && source.convertedSpend !== "";
    var sourceAmount = Number(hasRaw ? source.rawSpend : (hasConverted ? source.convertedSpend : 0));
    var sourceCurrency = String(hasRaw ? (source.currency || source.rawCurrency || target) : (source.targetCurrency || target)).toUpperCase();
    var spend = convert(sourceAmount, sourceCurrency, target);
    return {
      spend: Number(spend.toFixed(2)),
      currency: target,
      sourceAmount: Number(sourceAmount.toFixed(2)),
      sourceCurrency: sourceCurrency,
      hasSpend: hasRaw || hasConverted,
      sourceKind: hasRaw ? "raw" : (hasConverted ? "converted" : "none"),
    };
  }

  function syncedBudgetInCurrency() {
    return Number(marketingSummarySpend(state.currency).spend || 0);
  }

  function realBudgetInNativeCurrency() {
    return convert(
      Number(state.budget || 0),
      state.currency,
      nativeCurrency || window.dashboardActiveCurrency || "SAR",
    );
  }

  function realAverageProfitInCalculatorCurrency() {
    return convert(
      Number(realAvgCommission || 0),
      nativeCurrency || window.dashboardActiveCurrency || "SAR",
      state.currency,
    );
  }

  function formatTwoDecimals(value) {
    return (Number(value) || 0).toFixed(2);
  }

  function updateSimModifiedFlag() {
    simState._isModified = !!(
      simState._adSpendModified ||
      simState._avgCommissionModified ||
      simState._ordersModified ||
      simState._ndrModified
    );
  }

  function syncSimFinancialsFromRealData(force) {
    if (force || !simState._adSpendModified) {
      simState.adSpend = realBudgetInNativeCurrency();
    }
    if (force || !simState._avgCommissionModified) {
      simState.avgCommission = Number(realAvgCommission || 0);
    }
  }

  function refreshSimInputValues() {
    var inpSpend = document.getElementById("sfe-adspend");
    var inpComm = document.getElementById("sfe-comm");
    if (inpSpend && !simState._adSpendModified) {
      inpSpend.value = Math.round(
        convert(simState.adSpend, nativeCurrency || window.dashboardActiveCurrency || "SAR", state.currency),
      );
    }
    if (inpComm && !simState._avgCommissionModified) {
      inpComm.value = formatTwoDecimals(realAverageProfitInCalculatorCurrency());
    }
  }

  function refreshBudgetInputValue(force) {
    var budgetInput = document.getElementById("s7-in-budget");
    if (!budgetInput) return;
    if (!force && document.activeElement === budgetInput) return;
    budgetInput.value = Math.round(Number(state.budget || 0)).toLocaleString("en-US");
  }

  function setCalculatorCurrency(nextCurrency) {
    var previousCurrency = state.currency || nativeCurrency || "SAR";
    var next = nextCurrency || previousCurrency;
    if (previousCurrency !== next) {
      state.budget = convert(Number(state.budget || 0), previousCurrency, next);
      d.adSpend = state.budget;
    }
    state.currency = next;
    state.viewCurrency = next;
    simState.viewCurrency = next;
    refreshBudgetInputValue(true);
  }

  function periodDate(value) {
    return String(value || "").slice(0, 10);
  }

  function periodRangeLabel(from, to) {
    if (from && to && from !== to) return from + " - " + to;
    if (from || to) return from || to;
    return s7Txt("Selected dashboard period", "فترة لوحة التحكم المحددة");
  }

  function selectedDashboardPeriodLabel() {
    return periodRangeLabel(
      periodDate(
        dashboardPeriod.dateFrom ||
          dashboardPeriod.from ||
          dashboardPeriod.start,
      ),
      periodDate(
        dashboardPeriod.dateTo || dashboardPeriod.to || dashboardPeriod.end,
      ),
    );
  }

  function syncedMarketingPeriodLabel() {
    var summary = (marketingState && marketingState.summary) || {};
    return periodRangeLabel(
      periodDate(
        summary.dateFrom ||
          dashboardPeriod.dateFrom ||
          dashboardPeriod.from ||
          dashboardPeriod.start,
      ),
      periodDate(
        summary.dateTo ||
          dashboardPeriod.dateTo ||
          dashboardPeriod.to ||
          dashboardPeriod.end,
      ),
    );
  }

  function marketingSourcePageInfo() {
    var total = assignedMarketingAccounts.length;
    var totalPages = Math.max(1, Math.ceil(total / MARKETING_SOURCE_PAGE_SIZE));
    var currentPage = Math.max(1, Math.min(totalPages, Number(mountEl._s7MarketingSourcePage) || 1));
    mountEl._s7MarketingSourcePage = currentPage;
    var start = (currentPage - 1) * MARKETING_SOURCE_PAGE_SIZE;
    var end = Math.min(start + MARKETING_SOURCE_PAGE_SIZE, total);
    return {
      rows: assignedMarketingAccounts.slice(start, end),
      currentPage: currentPage,
      totalPages: totalPages,
      total: total,
      start: total ? start + 1 : 0,
      end: end,
    };
  }

  function marketingSourcePaginationHtml(pageInfo) {
    if (!pageInfo || pageInfo.totalPages <= 1 || typeof window.renderDashboardPagination !== "function") return "";
    return window.renderDashboardPagination({
      id: "s7-source-pagination",
      currentPage: pageInfo.currentPage,
      totalPages: pageInfo.totalPages,
      totalItems: pageInfo.total,
      startItem: pageInfo.start,
      endItem: pageInfo.end,
      itemLabel: s7Txt("ad accounts", "حسابات إعلانية"),
      pageButtonClass: "s7-source-page-btn",
      prevClass: "s7-source-page-prev",
      nextClass: "s7-source-page-next",
      className: "dash-pagination-compact s7-source-pagination",
      pageWindow: 1,
    });
  }

  function bindMarketingSourcePagination() {
    var pager = mountEl.querySelector("#s7-source-pagination");
    if (!pager || typeof window.bindDashboardPagination !== "function") return;
    window.bindDashboardPagination(pager, {
      pageButtonSelector: ".s7-source-page-btn",
      prevSelector: ".s7-source-page-prev",
      nextSelector: ".s7-source-page-next",
      onPage: function (page) {
        mountEl._s7MarketingSourcePage = page;
        updateCalcUI();
      },
      onPrev: function () {
        mountEl._s7MarketingSourcePage = Math.max(1, (Number(mountEl._s7MarketingSourcePage) || 1) - 1);
        updateCalcUI();
      },
      onNext: function () {
        mountEl._s7MarketingSourcePage = (Number(mountEl._s7MarketingSourcePage) || 1) + 1;
        updateCalcUI();
      },
    });
  }

  function sourceBreakdownInnerHtml() {
    var pageInfo = marketingSourcePageInfo();
    var rows = pageInfo.rows
      .map(function (source) {
        var spendInfo = marketingSourceSpend(source, state.currency);
        var converted = Number(spendInfo.spend || 0);
        var hasSpend = spendInfo.hasSpend;
        return (
          '<div class="s7-source-row">' +
          '<div class="s7-source-account"><strong>' +
          escapeSourceText(source.name || source.id) +
          "</strong><small>" +
          escapeSourceText(source.id) +
          "</small></div>" +
          "<div><span>" +
          s7Txt("Original spend", "الإنفاق الأصلي") +
          "</span><strong>" +
          fmt(Number(spendInfo.sourceAmount || 0), 2) +
          " " +
          escapeSourceText(spendInfo.sourceCurrency || source.currency || "") +
          "</strong></div>" +
          "<div><span>" +
          s7Txt("Converted for calculator", "محول للحاسبة") +
          '</span><strong class="s7-source-converted">' +
          fmt(converted, 2) +
          " " +
          escapeSourceText(state.currency) +
          "</strong></div>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="s7-source-head"><div><h3>' +
      s7Txt("Advertising Sources", "مصادر الإنفاق الإعلاني") +
      "</h3>" +
      "<p>" +
      s7Txt(
        "Original platform spend is converted into your calculator currency.",
        "يتم تحويل إنفاق المنصة الأصلي إلى عملة الحاسبة.",
      ) +
      "</p></div>" +
      '<div class="s7-source-total"><span>' +
      s7Txt("Synced spend", "الإنفاق المتزامن") +
      " (" +
      escapeSourceText(state.currency) +
      ")</span><strong>" +
      fmt(syncedBudgetInCurrency(), 2) +
      " " +
      escapeSourceText(state.currency) +
      "</strong></div></div>" +
      '<div class="s7-source-rows">' +
      rows +
      "</div>" +
      marketingSourcePaginationHtml(pageInfo)
    );
  }

  function sourceBreakdownHtml() {
    if (!sourceBreakdown.length) return "";
    return (
      '<section class="s7-source-breakdown" id="s7-source-breakdown">' +
      sourceBreakdownInnerHtml() +
      "</section>"
    );
  }

  function accountSourcePanelInnerHtml() {
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var rowBg = isLight ? "#f8fafc" : "rgba(255,255,255,.025)";
    var rowBorder = isLight ? "#e2e8f0" : "rgba(255,255,255,.06)";
    var textColor = isLight ? "#1e293b" : "#f3f4f6";
    var mutedColor = isLight ? "#64748b" : "rgba(255,255,255,.48)";
    var syncColor = isLight ? "#7c3aed" : "#e9d5ff";
    var syncBg = isLight ? "rgba(124,58,237,0.08)" : "rgba(168,85,247,.18)";
    var syncBorder = isLight ? "rgba(124,58,237,0.3)" : "rgba(168,85,247,.45)";

    var pageInfo = marketingSourcePageInfo();
    var rows = pageInfo.rows
      .map(function (source) {
        var spendInfo = marketingSourceSpend(source, state.currency);
        var converted = Number(spendInfo.spend || 0);
        var hasSpend = spendInfo.hasSpend;
        return (
          '<div class="s7-source-row" style="background:' +
          rowBg +
          ";border:1px solid " +
          rowBorder +
          '">' +
          '<div class="s7-source-account"><strong style="color:' +
          textColor +
          '">' +
          escapeSourceText(source.name || source.id) +
          '</strong><small style="color:' +
          mutedColor +
          '">' +
          escapeSourceText(source.id) +
          "</small></div>" +
          '<div><span style="color:' +
          mutedColor +
          '">' +
          (hasSpend ? s7Txt("Original spend", "Original spend") : s7Txt("Currency", "Currency")) +
          '</span><strong style="color:' +
          textColor +
          '">' +
          (hasSpend
            ? fmt(Number(spendInfo.sourceAmount || 0), 2) + " " + escapeSourceText(spendInfo.sourceCurrency || source.currency || "")
            : escapeSourceText(source.currency || "--")) +
          "</strong></div>" +
          '<div><span style="color:' +
          mutedColor +
          '">' +
          s7Txt("Converted for calculator", "Converted for calculator") +
          '</span><strong class="s7-source-converted">' +
          (hasSpend
            ? fmt(converted, 2) + " " + escapeSourceText(state.currency)
            : "--") +
          "</strong></div>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="s7-source-head"><div><h3 style="color:' +
      (isLight ? "#1e293b" : "#fff") +
      '">' +
      s7Txt("Marketing ad accounts", "Marketing ad accounts") +
      "</h3>" +
      '<p style="color:' +
      (isLight ? "#64748b" : "rgba(255,255,255,.52)") +
      '">' +
      (syncedSpendActive
        ? s7Txt(
            "Spend synced for the selected dashboard period.",
            "Spend synced for the selected dashboard period.",
          )
        : s7Txt(
            "Assigned accounts are ready. Click Sync Now in Marketing Connections to pull spend.",
            "Assigned accounts are ready. Click Sync Now in Marketing Connections to pull spend.",
          )) +
      "</p></div>" +
      '<div class="s7-source-meta"><span style="color:' +
      (isLight ? "#64748b" : "rgba(255,255,255,.45)") +
      '">' +
      s7Txt("Synced period", "الفترة المتزامنة") +
      '</span><strong style="color:' +
      (isLight ? "#1e293b" : "#f3f4f6") +
      '">' +
      escapeSourceText(syncedMarketingPeriodLabel()) +
      "</strong></div>" +
      '<div class="s7-source-total"><span>' +
      s7Txt("Synced spend", "Synced spend") +
      " (" +
      escapeSourceText(state.currency) +
      ")</span><strong>" +
      (syncedSpendActive
        ? fmt(syncedBudgetInCurrency(), 2) +
          " " +
          escapeSourceText(state.currency)
        : "--") +
      "</strong></div>" +
      '<button type="button" class="s7-source-sync" id="s7-source-sync-now" style="color:' +
      syncColor +
      ";background:" +
      syncBg +
      ";border:1px solid " +
      syncBorder +
      '"' +
      (marketingState && marketingState.loading ? " disabled" : "") +
      ">" +
      escapeSourceText(
        marketingState && marketingState.loading
          ? s7Txt("Syncing...", "Syncing...")
          : s7Txt("Sync Now", "Sync Now"),
      ) +
      "</button></div>" +
      '<div class="s7-source-rows">' +
      rows +
      "</div>" +
      marketingSourcePaginationHtml(pageInfo)
    );
  }

  function accountSourcePanelHtml() {
    if (!assignedMarketingAccounts.length) return "";
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var panelBg = isLight ? "#ffffff" : "#0b1120";
    var panelBorder = isLight ? "#cbd5e1" : "rgba(45,212,191,.2)";
    return (
      '<section class="s7-source-breakdown" id="s7-source-breakdown" style="background:' +
      panelBg +
      ";border:1px solid " +
      panelBorder +
      '">' +
      accountSourcePanelInnerHtml() +
      "</section>"
    );
  }

  if (syncedSpendActive && sourceBreakdown.length) {
    state.budget = syncedBudgetInCurrency();
    d.adSpend = state.budget;
    syncSimFinancialsFromRealData(false);
  }

  function fmt(n, dec) {
    dec = dec == null ? 1 : dec;
    return n.toLocaleString("en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }
  function s7PctValue(value, decimals) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    return n.toFixed(decimals == null ? 2 : decimals)
      .replace(/(\.\d*?[1-9])0+$/, "$1")
      .replace(/\.0+$/, "");
  }
  function s7RatioPctValue(value, decimals) {
    return s7PctValue((Number(value) || 0) * 100, decimals);
  }

  // -- CurrencyBadge component helper ------------------------------------------
  function renderCurrencyBadge(containerEl, currency) {
    if (!containerEl) return;
    var cls = currency.toLowerCase();
    var label =
      currency === "SAR" ? s7Txt("SA", "\u0633") : currency === "USD" ? "US" : "EG";

    var existingBadge = containerEl.querySelector(".s7-currency-badge");
    if (existingBadge) {
      if (existingBadge.dataset.curr === currency) return;
      existingBadge.className =
        "s7-currency-badge " + cls + " s7-currency-badge-animate";
      existingBadge.dataset.curr = currency;
      existingBadge.innerHTML =
        '<span style="font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.02em;opacity:.75;margin-left:4px">' +
        label +
        "</span><span>" +
        currency +
        "</span>";

      if (!dashboardMotionDisabled()) {
        existingBadge.style.animation = "none";
        existingBadge.offsetHeight; /* trigger reflow */
        existingBadge.style.animation = null;
      }
    } else {
      containerEl.innerHTML =
        '<div class="s7-currency-badge ' +
        cls +
        ' s7-currency-badge-animate" data-curr="' +
        currency +
        '">' +
        '<span style="font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.02em;opacity:.75;margin-left:4px">' +
        label +
        "</span><span>" +
        currency +
        "</span>" +
        "</div>";
    }
  }

  // -- MoneyInput caretaker live formatter --------------------------------------
  function initMoneyInput(inputEl, initialValue, onValueChange) {
    if (!inputEl) return;

    if (initialValue > 0) {
      inputEl.value = Math.round(initialValue).toLocaleString("en-US");
    } else {
      inputEl.value = "";
    }

    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Backspace") {
        var start = inputEl.selectionStart;
        var end = inputEl.selectionEnd;
        if (start === end && start > 0 && inputEl.value[start - 1] === ",") {
          e.preventDefault();
          var val = inputEl.value;
          var newVal = val.slice(0, start - 2) + val.slice(start);
          inputEl.value = newVal;
          inputEl.setSelectionRange(start - 2, start - 2);
          inputEl.dispatchEvent(new Event("input"));
        }
      }
    });

    inputEl.addEventListener("input", function (e) {
      var val = inputEl.value;
      var selectionStart = inputEl.selectionStart;

      var digitsBeforeCursor = 0;
      for (var i = 0; i < selectionStart; i++) {
        if (/\d/.test(val[i])) {
          digitsBeforeCursor++;
        }
      }

      var rawVal = val.replace(/[^\d]/g, "");
      if (rawVal === "") {
        inputEl.value = "";
        onValueChange(0);
        return;
      }

      var num = parseInt(rawVal, 10) || 0;
      var formatted = num.toLocaleString("en-US");
      inputEl.value = formatted;

      var newCursorPos = 0;
      var digitCount = 0;
      for (var j = 0; j < formatted.length; j++) {
        if (digitCount === digitsBeforeCursor) {
          newCursorPos = j;
          break;
        }
        if (/\d/.test(formatted[j])) {
          digitCount++;
        }
      }
      if (digitCount === digitsBeforeCursor && newCursorPos === 0) {
        newCursorPos = formatted.length;
      }

      inputEl.setSelectionRange(newCursorPos, newCursorPos);
      onValueChange(num);
    });
  }

  function compute() {
    var spendSAR = convert(state.budget, state.currency, window.dashboardActiveCurrency || "SAR");
    var cpaSAR = realTotalOrders > 0 ? spendSAR / realTotalOrders : 0;
    var breakEvenCpaSAR = realAvgCommission * (realNdrPct / 100);
    var deliveredSalesSAR = Number(
      !isExpectedRateMode && d.actualDeliveredSales != null
        ? d.actualDeliveredSales
        : (d.totalDeliveredSales || d.deliveredSales || 0)
    );

    var actualDelivered = d.actualDeliveredCount != null ? Number(d.actualDeliveredCount) : (d.deliveredCount != null ? Number(d.deliveredCount) : 0);
    if (isExpectedRateMode) {
      if (actualDelivered > 0) {
        deliveredSalesSAR = deliveredSalesSAR * (realExpectedDvlExact / actualDelivered);
      } else {
        var totalSales = (ctx && ctx.data && ctx.data.overview && ctx.data.overview.totalSales && ctx.data.overview.totalSales.value != null)
          ? Number(ctx.data.overview.totalSales.value)
          : (d.totalSales || d.sales || 0);
        deliveredSalesSAR = totalSales * (realNdrPct / 100);
      }
    }

    var revSAR = isExpectedRateMode ? (realAvgCommission * realExpectedDvlExact) : realTaagerProfitAfterTax;
    var netSAR = revSAR - spendSAR;
    var roi = spendSAR > 0 ? (netSAR / spendSAR) * 100 : 0;
    var returnPerSar = spendSAR > 0 ? revSAR / spendSAR : 0;
    var netRoas = spendSAR > 0 ? deliveredSalesSAR / spendSAR : 0;

    var activeReportCurrency = window.dashboardActiveCurrency || "SAR";
    return {
      spendSAR,
      cpaSAR,
      breakEvenCpaSAR,
      cpa: convert(cpaSAR, activeReportCurrency, state.currency),
      breakEvenCpa: convert(breakEvenCpaSAR, activeReportCurrency, state.currency),
      profit: convert(revSAR, activeReportCurrency, state.currency),
      net: convert(netSAR, activeReportCurrency, state.currency),
      spend: convert(spendSAR, activeReportCurrency, state.currency),
      roi,
      returnPerSar,
      netRoas,
      netSAR,
      revSAR,
      deliveredSalesSAR,
    };
  }

  function computeProjection(budgetSAR, cpaSAR) {
    var projOrders = cpaSAR > 0 ? budgetSAR / cpaSAR : 0;
    var projection = window.TaagerDashboardFinancialCore.calculate({
      mode: "expected",
      netOrders: projOrders,
      actualDeliveredOrders: 1,
      actualEarnedProfitAfterTax: realAvgCommission,
      currentTotalSales: 0,
      expectedNdrRate: realNdrPct / 100,
      adSpend: budgetSAR,
    });
    return {
      orders: projOrders,
      deliveredOrders: projection.expectedDeliveriesDisplay,
      expectedDeliveriesExact: projection.expectedDeliveriesExact,
      revenue: projection.expectedTotalProfitBeforeAdSpend,
      net: projection.expectedNetProfit,
      roi: projection.expectedRoi,
    };
  }

  // -- 4. Smart Forecast Compute (uses simState) -------------------------------
  function simConvert(valSAR, to) {
    return convert(valSAR, nativeCurrency || "SAR", to || simState.viewCurrency || nativeCurrency || "SAR");
  }
  function computeSim() {
    var s = simState;
    var calculation = window.TaagerDashboardFinancialCore.calculate({
      mode: "expected",
      netOrders: s.totalOrders,
      actualDeliveredOrders: 1,
      actualEarnedProfitAfterTax: s.avgCommission,
      currentTotalSales: 0,
      expectedNdrRate: s.ndr,
      adSpend: s.adSpend,
    });
    var deliveredOrders = calculation.expectedDeliveriesDisplay;
    var expectedDeliveriesExact = calculation.expectedDeliveriesExact;
    var revenue = calculation.expectedTotalProfitBeforeAdSpend;
    var netProfit = calculation.expectedNetProfit;
    var roi = calculation.expectedRoi;
    var cpa = calculation.cpa;
    var returnPerSar = calculation.expectedProfitRoas;
    var revenuePerDel = calculation.averageProfit;
    var deliveredAovNative = convert(
      overviewDeliveredAov,
      overviewCurrency,
      nativeCurrency || window.dashboardActiveCurrency || "SAR",
    );
    var netTotalDeliveredSales = expectedDeliveriesExact * deliveredAovNative;
    var ndrRequired =
      s.totalOrders > 0 && s.avgCommission > 0
        ? s.adSpend / (s.totalOrders * s.avgCommission)
        : null;
    var commRequired = expectedDeliveriesExact > 0 ? s.adSpend / expectedDeliveriesExact : null;
    var delivRequired =
      s.avgCommission > 0 ? Math.ceil(s.adSpend / s.avgCommission) : null;

    // Projected scenario at 2× budget
    var projBudget = s.adSpend * 2;
    var projOrders = cpa > 0 ? Math.round(projBudget / cpa) : 0;
    var projected = window.TaagerDashboardFinancialCore.calculate({
      mode: "expected",
      netOrders: projOrders,
      actualDeliveredOrders: 1,
      actualEarnedProfitAfterTax: s.avgCommission,
      currentTotalSales: 0,
      expectedNdrRate: s.ndr,
      adSpend: projBudget,
    });
    var projDelivered = projected.expectedDeliveriesDisplay;
    var projRevenue = projected.expectedTotalProfitBeforeAdSpend;
    var projNet = projected.expectedNetProfit;
    var projRoi = projected.expectedRoi;

    return {
      deliveredOrders,
      expectedDeliveriesExact,
      revenue,
      netProfit,
      roi,
      cpa,
      returnPerSar,
      revenuePerDel,
      deliveredAovNative,
      netTotalDeliveredSales,
      ndrRequired,
      commRequired,
      delivRequired,
      projOrders,
      projDelivered,
      projRevenue,
      projNet,
      projRoi,
      projBudget,
    };
  }

  // -- 5. Gauge SVG ------------------------------------------------------------
  function gaugeHtml(roi) {
    var cx = 190,
      cy = 165,
      R = 120,
      SW = 24;
    var START = 225,
      SPAN = 270;
    function pt(r, deg) {
      var rad = ((deg - 90) * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    function strokeArc(s, e) {
      var p1 = pt(R, s),
        p2 = pt(R, e),
        lg = e - s > 180 ? 1 : 0;
      return (
        "M " +
        p1.x.toFixed(2) +
        " " +
        p1.y.toFixed(2) +
        " A " +
        R +
        " " +
        R +
        " 0 " +
        lg +
        " 1 " +
        p2.x.toFixed(2) +
        " " +
        p2.y.toFixed(2)
      );
    }
    var clamped = Math.min(Math.max(roi, -100), 300);
    var pct = (clamped + 100) / 400;
    var needleDeg = START + pct * SPAN;
    var tip = pt(R - 5, needleDeg),
      bl = pt(6, needleDeg + 90),
      br = pt(6, needleDeg - 90);
    var roiColor = roi < 0 ? "#ef4444" : roi < 50 ? "#f59e0b" : "#00e676";
    var formattedRoi =
      (roi < 0 ? "-" : roi > 0 ? "+" : "") + Math.abs(roi).toFixed(0) + "%";
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var needleFill = isLight ? "#1e293b" : "white";
    var needleShadow = isLight
      ? "drop-shadow(0 0 3px rgba(0,0,0,0.25))"
      : "drop-shadow(0 0 4px rgba(255,255,255,0.8))";
    var centerFill = isLight ? "#1e293b" : "#fff";
    var labelFill = isLight ? "rgba(30,41,59,0.6)" : "rgba(255,255,255,0.5)";
    var labelsHtml = [
      { pct: -100, text: "-100%", anchor: "end" },
      { pct: 0, text: "0%", anchor: "end" },
      { pct: 100, text: "100%", anchor: "middle" },
      { pct: 200, text: "200%", anchor: "start" },
      { pct: 300, text: "300%+", anchor: "start" },
    ]
      .map(function (lbl) {
        var deg = START + ((lbl.pct + 100) / 400) * SPAN;
        var p = pt(R + SW / 2 + 18, deg);
        return (
          '<text x="' +
          p.x.toFixed(2) +
          '" y="' +
          p.y.toFixed(2) +
          '" text-anchor="' +
          lbl.anchor +
          '" dominant-baseline="middle" fill="' +
          labelFill +
          '" font-size="11" font-weight="700" font-family="Inter, IBM Plex Sans Arabic, sans-serif" direction="ltr">' +
          lbl.text +
          "</text>"
        );
      })
      .join("");
    return (
      '<svg viewBox="0 0 380 250" width="100%" height="220" style="height:auto">' +
      '<defs><linearGradient id="s7g" x1="0%" y1="100%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#ef4444"/><stop offset="35%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#00e676"/>' +
      "</linearGradient></defs>" +
      '<path d="' +
      strokeArc(225, 495) +
      '" stroke="url(#s7g)" stroke-width="' +
      SW +
      '" fill="none" stroke-linecap="round"/>' +
      labelsHtml +
      '<polygon points="' +
      tip.x.toFixed(2) +
      "," +
      tip.y.toFixed(2) +
      " " +
      bl.x.toFixed(2) +
      "," +
      bl.y.toFixed(2) +
      " " +
      br.x.toFixed(2) +
      "," +
      br.y.toFixed(2) +
      '" fill="' +
      needleFill +
      '" style="filter:' +
      needleShadow +
      '"/>' +
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="8" fill="' +
      centerFill +
      '"/>' +
      '<text x="' +
      cx +
      '" y="' +
      (cy + 25) +
      '" text-anchor="middle" fill="' +
      roiColor +
      '" font-size="42" font-weight="700" font-family="Inter, IBM Plex Sans Arabic, sans-serif" direction="ltr">' +
      formattedRoi +
      "</text>" +
      '<text x="' +
      cx +
      '" y="' +
      (cy + 62) +
      '" text-anchor="middle" fill="' +
      roiColor +
      '" font-size="13" font-weight="700" font-family="Inter, IBM Plex Sans Arabic, sans-serif">' +
      (roi < 0
        ? s7Txt("Losing", "خاسر")
        : roi < 50
          ? s7Txt("Near break-even", "قريب من التعادل")
          : s7Txt("Profitable", "مربح")) +
      "</text>" +
      "</svg>"
    );
  }

  // -- 6. Charts ---------------------------------------------------------------
  function buildGrowthChart(cpaSAR, baseSpendSAR) {
    if (!cpaSAR || !baseSpendSAR) return;
    var canvas = document.getElementById("s7-growth-chart");
    if (!canvas) return;
    if (canvas._chartInstance) {
      canvas._chartInstance.destroy();
    }
    var labels = [],
      budgetData = [],
      netData = [],
      ordData = [];
    var step = baseSpendSAR * 0.2;
    for (var b = baseSpendSAR * 0.2; b <= baseSpendSAR * 2.0; b += step) {
      var proj = computeProjection(b, cpaSAR);
      var bCurr = convert(b, window.dashboardActiveCurrency || "SAR", state.currency);
      var netCurr = convert(proj.net, window.dashboardActiveCurrency || "SAR", state.currency);

      labels.push((b / baseSpendSAR).toFixed(1).replace(".0", "") + "x");
      budgetData.push(bCurr);
      netData.push(Number(netCurr.toFixed(1)));
      ordData.push(Number(proj.orders.toFixed(1)));
    }
    var chartCtx = canvas.getContext("2d");
    var theme = window.dashboardThemeColors
      ? window.dashboardThemeColors()
      : {
          surface: "#0f172a",
          borderSoft: "rgba(255,255,255,0.1)",
          text: "#fff",
          muted: "#94a3b8",
          grid: "rgba(255,255,255,0.05)",
          label: "rgba(255,255,255,0.4)",
        };
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var greenColor = isLight ? "#10b981" : "#00e676";
    var lossColor = "#ef4444";
    var warningColor = "#f59e0b";
    var netMin = Math.min.apply(null, netData);
    var netMax = Math.max.apply(null, netData);
    var netColor = netMax < 0 ? lossColor : (netMin < 0 ? warningColor : greenColor);
    var gG = chartCtx.createLinearGradient(0, 0, 0, 150);
    if (isLight) {
      gG.addColorStop(0, netColor === lossColor ? "rgba(239,68,68,0.16)" : "rgba(16,185,129,0.2)");
      gG.addColorStop(1, "rgba(16,185,129,0)");
    } else {
      gG.addColorStop(0, netColor === lossColor ? "rgba(239,68,68,0.16)" : "rgba(0,230,118,0.2)");
      gG.addColorStop(1, "rgba(0,230,118,0)");
    }
    var gB = chartCtx.createLinearGradient(0, 0, 0, 150);
    gB.addColorStop(0, "rgba(59,130,246,0.2)");
    gB.addColorStop(1, "rgba(59,130,246,0)");
    canvas._chartInstance = new Chart(chartCtx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: s7Txt(
              "Expected Net Result (" + state.currency + ")",
              "صافي النتيجة المتوقع (" + state.currency + ")",
            ),
            data: netData,
            borderColor: netColor,
            borderWidth: 2,
            backgroundColor: gG,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: netColor,
            pointBorderColor: theme.surface,
            pointBorderWidth: 2,
            yAxisID: "yNet",
            segment: {
              borderColor: function (ctx) {
                return ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0 ? lossColor : greenColor;
              },
            },
          },
          {
            label: s7Txt("Total Expected Orders", "إجمالي الطلبات المتوقعة"),
            data: ordData,
            borderColor: "#3b82f6",
            borderWidth: 2,
            backgroundColor: gB,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "#3b82f6",
            pointBorderColor: theme.surface,
            pointBorderWidth: 2,
            yAxisID: "yOrd",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.surface,
            titleColor: theme.muted,
            bodyColor: theme.text,
            borderColor: theme.borderSoft,
            borderWidth: 1,
            padding: 10,
            textDirection:
              window.dashboardI18n && window.dashboardI18n.isRtl()
                ? "rtl"
                : "ltr",
            titleFont: { family: "Inter, 'IBM Plex Sans Arabic', sans-serif" },
            bodyFont: { family: "Inter, 'IBM Plex Sans Arabic', sans-serif" },
            callbacks: {
              title: function (items) {
                var idx = items && items.length ? items[0].dataIndex : 0;
                return s7Txt("Budget", "الميزانية") + ": " + fmt(budgetData[idx] || 0, 0) + " " + state.currency;
              },
              label: function (ctx) {
                if (ctx.dataset && ctx.dataset.yAxisID === "yNet") {
                  return s7Txt("Net result", "صافي النتيجة") + ": " + fmt(ctx.parsed.y || 0, 0) + " " + state.currency;
                }
                return s7Txt("Expected orders", "الطلبات المتوقعة") + ": " + fmt(ctx.parsed.y || 0, 0);
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: theme.grid },
            title: {
              display: true,
              text: s7Txt("Budget multiplier vs current spend", "مضاعف الميزانية مقابل الإنفاق الحالي"),
              color: theme.muted,
              font: { size: 11, family: "Inter, 'IBM Plex Sans Arabic', sans-serif", weight: "700" },
            },
            ticks: { color: theme.label, font: { size: 10, family: "Inter, 'IBM Plex Sans Arabic', sans-serif", weight: "700" } },
          },
          yNet: {
            position: "left",
            grid: { color: theme.grid },
            title: {
              display: true,
              text: s7Txt("Net result", "صافي النتيجة"),
              color: netColor,
              font: { size: 11, family: "Inter, 'IBM Plex Sans Arabic', sans-serif", weight: "700" },
            },
            ticks: {
              color: netColor,
              font: { size: 10, family: "Inter, 'IBM Plex Sans Arabic', sans-serif" },
              callback: function (value) {
                return fmt(Number(value) || 0, 0);
              },
            },
          },
          yOrd: {
            position: "right",
            grid: { display: false },
            title: {
              display: true,
              text: s7Txt("Orders", "الطلبات"),
              color: "#3b82f6",
              font: { size: 11, family: "Inter, 'IBM Plex Sans Arabic', sans-serif", weight: "700" },
            },
            ticks: {
              color: "#3b82f6",
              font: { size: 10, family: "Inter, 'IBM Plex Sans Arabic', sans-serif" },
              callback: function (value) {
                return fmt(Number(value) || 0, 0);
              },
            },
          },
        },
      },
    });
  }

  function renderScenarios(cpaSAR, baseSpendSAR) {
    var list = document.getElementById("s7-scen-list");
    if (!list) return;
    if (baseSpendSAR <= 0) {
      list.innerHTML =
        '<div style="text-align:center;color:var(--dash-text-faint);padding:10px">' +
        s7Txt("Please enter a valid budget", "يرجى إدخال ميزانية صحيحة") +
        "</div>";
      return;
    }
    var html = "";
    var scens = [
      {
        name: s7Txt("Half Budget", "نصف الميزانية"),
        color: "#ef4444",
        bud: baseSpendSAR * 0.5,
      },
      {
        name: s7Txt("Current", "الحالي"),
        color: "#0ea5e9",
        bud: baseSpendSAR,
      },
      {
        name: s7Txt("Increase 50%", "زيادة 50%"),
        color: "#10b981",
        bud: baseSpendSAR * 1.5,
      },
      {
        name: s7Txt("Double 2x", "مضاعفة 2x"),
        color: "#8b5cf6",
        bud: baseSpendSAR * 2.0,
      },
    ];
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var textMuted = isLight ? "#64748b" : "rgba(255,255,255,0.4)";
    var textVal1 = isLight ? "#334155" : "rgba(255,255,255,0.7)";
    var textVal2 = isLight ? "#1e293b" : "rgba(255,255,255,0.9)";
    var greenColor = isLight ? "#10b981" : "#00e676";

    scens.forEach(function (sc) {
      var proj = computeProjection(sc.bud, cpaSAR);
      var r = proj.roi;
      var isActive = Math.abs(baseSpendSAR - sc.bud) < 1;
      var roiColor = r >= 50 ? greenColor : r >= 0 ? "#f59e0b" : "#ef4444";
      var bg = isActive ? "rgba(59,130,246,0.08)" : "transparent";
      var border = isActive
        ? "border:1px solid rgba(59,130,246,0.25);border-radius:var(--dash-radius-sm);"
        : "border-bottom:1px solid " +
          (isLight ? "#cbd5e1" : "rgba(255,255,255,0.04)") +
          ";";

      var budVal = convert(sc.bud, window.dashboardActiveCurrency || "SAR", state.currency);
      var netVal = convert(proj.net, window.dashboardActiveCurrency || "SAR", state.currency);

      html +=
        '<div class="s7-scen-row" style="background:' +
        bg +
        ";" +
        border +
        ";cursor:pointer;margin-bottom:4px\" onclick=\"document.getElementById('s7-in-budget').value='" +
        budVal.toFixed(0) +
        "';document.getElementById('s7-in-budget').dispatchEvent(new Event('input'));\">" +
        '<div><span style="background:' +
        sc.color +
        "20;color:" +
        sc.color +
        ";padding:3px 10px;border-radius:var(--dash-radius-sm);font-weight:var(--weight-semibold);border:1px solid " +
        sc.color +
        '40;font-size:var(--type-micro)">' +
        sc.name +
        "</span></div>" +
        '<div style="color:' +
        textVal1 +
        ';font-weight:var(--weight-semibold)">' +
        fmt(budVal, 0) +
        ' <span style="font-size:var(--type-micro);color:' +
        textMuted +
        '">' +
        state.currency +
        "</span></div>" +
        '<div style="color:' +
        textVal2 +
        ';font-weight:var(--weight-semibold)" dir="ltr">' +
        fmt(netVal, 0) +
        ' <span style="font-size:var(--type-micro);color:' +
        textMuted +
        '">' +
        state.currency +
        "</span></div>" +
        '<div style="color:' +
        roiColor +
        ';font-weight:var(--weight-semibold)" dir="ltr">' +
        (r > 0 ? "+" : "") +
        r.toFixed(0) +
        "%</div>" +
        "</div>";
    });
    list.innerHTML = html;
  }

  // -- 7. Smart Forecasting Engine Renderers -----------------------------------
  function sarFmt(n) {
    var curr = state.currency || nativeCurrency || "SAR";
    var value = convert(Number(n) || 0, nativeCurrency || "SAR", curr);
    var abs = Math.abs(value),
      sign = value < 0 ? "-" : "";
    if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1) + "M " + curr;
    if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + "K " + curr;
    return sign + Math.round(abs) + " " + curr;
  }

  // Currency-aware formatter for the SFE — converts SAR values to simState.viewCurrency
  function sfeFmt(sarVal, decimals) {
    var curr = simState.viewCurrency || "SAR";
    var v = simConvert(sarVal, curr);
    var abs = Math.abs(v),
      sign = v < 0 ? "-" : "";

    if (abs >= 1000000)
      return curr === "USD"
        ? sign + "$" + (abs / 1000000).toFixed(2) + "M"
        : sign + (abs / 1000000).toFixed(2) + "M " + curr;
    if (abs >= 1000)
      return curr === "USD"
        ? sign + "$" + (abs / 1000).toFixed(1) + "K"
        : sign + (abs / 1000).toFixed(1) + "K " + curr;
    if (decimals != null) {
      var precise = abs.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return curr === "USD" ? sign + "$" + precise : sign + precise + " " + curr;
    }
    return curr === "USD"
      ? sign + "$" + s7Num(Math.round(abs))
      : sign + s7Num(Math.round(abs)) + " " + curr;
  }

  function sfeCurrLabel() {
    return simState.viewCurrency || "SAR";
  }

  function renderSimMetrics(c) {
    var el = document.getElementById("sfe-metrics-strip");
    if (!el) return;
    var s = simState;
    var profCls = c.netProfit >= 0 ? "sfe-positive" : "sfe-negative";
    var roiCls = c.roi >= 0 ? "sfe-positive" : "sfe-negative";
    function card(
      cls,
      label,
      val,
      sub,
      tipTitle,
      tipDesc,
      tipFormula,
      tipIcon,
    ) {
      var badge = _tip(tipIcon || S7_ICONS.info, tipTitle, tipDesc, tipFormula);
      return (
        '<div class="sfe-metric-card ' +
        cls +
        '">' +
        '<div class="sfe-metric-label">' +
        '<span class="sfe-metric-label-text">' + label + "</span>" +
        " " +
        badge +
        "</div>" +
        '<div class="sfe-metric-val">' +
        s7ValueStack(val, label, "s7-expected-value-stack") +
        "</div>" +
        '<div class="sfe-metric-sub">' +
        sub +
        "</div>" +
        "</div>"
      );
    }
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var greenColor = isLight ? "#10b981" : "#00e5a0";
    el.innerHTML =
      card(
        "sfe-neutral sfe-metric-orders",
        s7Txt("Net Orders", "صافي الطلبات"),
        s7Num(Math.round(s.totalOrders)),
        s7Txt("simulation input", "مدخل المحاكاة"),
        s7Txt("Net Orders", "صافي الطلبات"),
        s7Txt(
          "Net orders entered in the simulation. You can edit it for testing.",
          "صافي الطلبات المدخل في المحاكاة. يمكنك تعديله للاختبار.",
        ),
        null,
        S7_ICONS.orders,
      ) +
      card(
        "sfe-neutral sfe-metric-delivered",
        s7Txt("Delivered", "تم التسليم"),
        s7Num(Math.round(c.deliveredOrders)),
        s7RatioPctValue(s.ndr) + "% NDR",
        s7Txt("Delivered Orders", "الطلبات المسلمة"),
        s7Txt(
          "Orders that reached the customer based on the simulated delivery rate.",
          "طلبات وصلت للعميل بناء على معدل التسليم في المحاكاة.",
        ),
        "delivered = netOrders * NDR",
        S7_ICONS.delivered,
      ) +
      card(
        "sfe-neutral sfe-metric-sales",
        s7Txt("Net Total Delivered Sales", "صافي إجمالي مبيعات الطلبات المسلمة"),
        sfeFmt(c.netTotalDeliveredSales, 2),
        s7Txt("based on real delivered AOV", "بناءً على متوسط قيمة الطلب المسلم الفعلي"),
        s7Txt("Net Total Delivered Sales", "صافي إجمالي مبيعات الطلبات المسلمة"),
        s7Txt(
          "Projected sales from the exact simulated delivered orders using the account's real delivered average order value.",
          "المبيعات المتوقعة من العدد الدقيق للطلبات المسلمة في المحاكاة باستخدام متوسط قيمة الطلب المسلم الفعلي للحساب.",
        ),
        "netTotalDeliveredSales = expectedDeliveriesExact * realDeliveredAOV",
        "↗",
      ) +
      card(
        "sfe-neutral sfe-metric-revenue",
        s7Txt("Revenue", "الإيرادات"),
        sfeFmt(c.revenue),
        c.returnPerSar.toFixed(2) + s7Txt("x per ", "x لكل ") + sfeCurrLabel(),
        s7Txt("Revenue", "الإيرادات"),
        s7Txt(
          "Total expected income from delivered orders multiplied by the average profit per delivered order.",
          "إجمالي الدخل المتوقع من الطلبات المسلمة مضروبا في متوسط الربح لكل طلب مسلم.",
        ),
        "totalProfitBeforeAdSpend = expectedDeliveriesExact * averageProfitPerDeliveredOrder",
        S7_ICONS.money,
      ) +
      card(
        profCls + " sfe-metric-profit",
        s7Txt("Net Profit", "صافي الربح"),
        '<span style="color:' +
          (c.netProfit >= 0 ? greenColor : "#ff3b5c") +
          '">' +
          sfeFmt(c.netProfit) +
          "</span>",
        s7Txt("rev - spend", "الإيرادات - الإنفاق"),
        s7Txt("Net Profit", "صافي الربح"),
        s7Txt(
          "Net profit or loss after subtracting ad spend from revenue.",
          "صافي الربح أو الخسارة بعد طرح الإنفاق الإعلاني من الإيرادات.",
        ),
        "netProfit = revenue - adSpend",
        S7_ICONS.profit,
      ) +
      card(
        roiCls + " sfe-metric-roi",
        "ROI",
        '<span style="color:' +
          (c.roi >= 0 ? greenColor : "#ff3b5c") +
          '">' +
          c.roi.toFixed(1) +
          "%</span>",
        c.roi >= 0 ? s7Txt("profitable", "مربح") : s7Txt("losing", "خاسر"),
        s7Txt("Return on Investment", "العائد على الاستثمار"),
        s7Txt(
          "Return percentage compared with spend. 100% means doubling your money.",
          "نسبة العائد مقارنة بالإنفاق. 100% تعني مضاعفة أموالك.",
        ),
        "ROI = (netProfit / adSpend) * 100%",
        S7_ICONS.target,
      ) +
      card(
        "sfe-neutral sfe-metric-cpa",
        "CPA",
        sfeFmt(c.cpa, 2),
        s7Txt("per acquired order", "لكل طلب مكتسب"),
        s7Txt("Cost per Order (CPA)", "تكلفة الطلب (CPA)"),
        s7Txt(
          "Cost to acquire one order. It should be lower than average profit per delivered order to stay profitable.",
          "تكلفة اكتساب طلب واحد. يجب أن تكون أقل من متوسط الربح لكل طلب مسلم للبقاء مربحا.",
        ),
        "CPA = adSpend / netOrders",
        S7_ICONS.cost,
      );
  }

  function focusSimulatorSectionIfRequested() {
    if (window.DashboardCalculatorFocusTarget !== "simulator") return;
    window.DashboardCalculatorFocusTarget = null;
    setTimeout(function () {
      var target = document.getElementById("s7-simulator-section");
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("sfe-wrapper-focus");
      setTimeout(function () {
        target.classList.remove("sfe-wrapper-focus");
      }, 1800);
    }, 120);
  }

  function renderSimScores(c) {
    var profScore = _calcProfitScore(c);
    var riskScore = _calcRiskScore(c);
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var safeColor = isLight ? "#10b981" : "#00e5a0";
    _renderScoreBlock(
      "sfe-profit-score",
      s7Txt("PROFITABILITY SCORE", "درجة الربحية"),
      profScore,
      profScore >= 60 ? safeColor : profScore >= 40 ? "#f5a623" : "#ff3b5c",
      profScore >= 70
        ? s7Txt("Strong", "قوي")
        : profScore >= 50
          ? s7Txt("Moderate", "متوسط")
          : profScore >= 30
            ? s7Txt("Weak", "ضعيف")
            : s7Txt("Critical", "حرج"),
    );
    _renderScoreBlock(
      "sfe-risk-score",
      s7Txt("SCALING SAFETY", "أمان التوسع"),
      riskScore,
      riskScore >= 65 ? safeColor : riskScore >= 45 ? "#f5a623" : "#ff3b5c",
      riskScore >= 70
        ? s7Txt("Safe to scale", "آمن للتوسع")
        : riskScore >= 50
          ? s7Txt("Caution", "تنبيه")
          : riskScore >= 30
            ? s7Txt("High risk", "مخاطر عالية")
            : s7Txt("Do not scale", "لا تتوسع"),
    );
  }

  function _calcProfitScore(c) {
    var s = simState;
    var score = 50;
    if (c.roi > 50) score += 25;
    else if (c.roi > 20) score += 15;
    else if (c.roi > 0) score += 5;
    else if (c.roi > -20) score -= 10;
    else score -= 25;
    if (s.ndr >= 0.40) score += 15;
    else if (s.ndr >= 0.30) score += 8;
    else if (s.ndr < 0.20) score -= 15;
    if (c.returnPerSar > 1.5) score += 10;
    else if (c.returnPerSar < 1) score -= 10;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function _calcRiskScore(c) {
    var s = simState;
    var risk = 70;
    if (c.roi < 0) risk -= 30;
    if (s.ndr < 0.20) risk -= 20;
    if (c.cpa > c.revenuePerDel) risk -= 15;
    if (c.projNet < 0) risk -= 10;
    if (s.ndr >= 0.40) risk += 15;
    if (c.roi > 30) risk += 10;
    return Math.max(0, Math.min(100, Math.round(risk)));
  }

  function _renderScoreBlock(id, title, score, color, label) {
    var el = document.getElementById(id);
    if (!el) return;
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var blockBg = isLight ? "#ffffff" : "#161921";
    var blockBorder = isLight ? "#cbd5e1" : "rgba(255,255,255,0.07)";
    var barWrapBg = isLight ? "#cbd5e1" : "rgba(255,255,255,.06)";
    el.innerHTML =
      '<div class="sfe-score-title">' +
      title +
      "</div>" +
      '<div class="sfe-score-gauge"><div class="sfe-gauge-bar-wrap" style="background:' +
      barWrapBg +
      '"><div class="sfe-gauge-bar" style="width:' +
      score +
      "%;background:" +
      color +
      '"></div></div>' +
      '<div class="sfe-score-num" style="color:' +
      color +
      '">' +
      score +
      "</div></div>" +
      '<div class="sfe-score-label" style="color:' +
      color +
      '">' +
      label +
      "</div>";
    el.style.background = blockBg;
    el.style.borderColor = blockBorder;
  }

  function renderBreakeven(c) {
    var el = document.getElementById("sfe-breakeven");
    if (!el) return;
    var s = simState;
    if (c.netProfit >= 0) {
      el.innerHTML =
        '<div class="sfe-be-title">' +
        s7Txt("Break-even Achieved", "تم تحقيق التعادل") +
        "</div>" +
        '<div class="sfe-be-subtitle" style="color:' +
        (document.documentElement.getAttribute("data-theme") === "light"
          ? "#10b981"
          : "#00e5a0") +
        '">' +
        s7Txt(
          "Campaign is profitable. Exceeds spend by ",
          "الحملة مربحة. تتجاوز الإنفاق بمقدار ",
        ) +
        "<strong>" +
        sfeFmt(c.netProfit) +
        "</strong>. " +
        s7Txt("Scale with confidence.", "توسع بثقة.") +
        "</div>";
      return;
    }
    var rows = "";
    if (c.ndrRequired !== null && c.ndrRequired <= 1) {
      rows += _beRow(
        s7Txt("Net Delivery Rate", "معدل التسليم الصافي"),
        s7RatioPctValue(s.ndr) + "%",
        s7RatioPctValue(c.ndrRequired) + "%",
        "+" + s7PctValue((c.ndrRequired - s.ndr) * 100) + "pp",
      );
    }
    if (c.commRequired !== null) {
      rows += _beRow(
        s7Txt("Average Profit", "متوسط الربح"),
        sfeFmt(s.avgCommission, 2),
        sfeFmt(Math.ceil(c.commRequired)),
        "+" + sfeFmt(Math.ceil(c.commRequired - s.avgCommission)),
      );
    }
    if (c.delivRequired !== null) {
      rows += _beRow(
        s7Txt("Delivered Orders", "الطلبات المسلمة"),
        s7Num(Math.round(c.deliveredOrders)),
        s7Num(Math.round(c.delivRequired)),
        "+" + s7Num(Math.round(c.delivRequired - c.deliveredOrders)),
      );
    }
    el.innerHTML =
      '<div class="sfe-be-title">' +
      s7Txt("Break-even Simulator", "محاكي نقطة التعادل") +
      "</div>" +
      '<div class="sfe-be-subtitle">' +
      s7Txt("To break even at ", "للوصول إلى التعادل عند ") +
      "<strong>" +
      sfeFmt(s.adSpend) +
      "</strong>" +
      s7Txt(
        " spend, you need at least one of:",
        " إنفاق، تحتاج إلى واحد على الأقل من الآتي:",
      ) +
      "</div>" +
      '<div class="sfe-be-options">' +
      rows +
      "</div>";
  }

  function _beRow(kpi, from, to, delta) {
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var rowBg = isLight ? "#f8fafc" : "#111318";
    var rowBorder = isLight ? "#cbd5e1" : "rgba(255,255,255,0.07)";
    var kpiColor = isLight ? "#64748b" : "#8b8fa8";
    var arrowColor = isLight ? "#94a3b8" : "#4d5066";
    return (
      '<div class="sfe-be-row" style="background:' +
      rowBg +
      ";border-color:" +
      rowBorder +
      '"><span class="sfe-be-kpi" style="color:' +
      kpiColor +
      '">' +
      kpi +
      "</span>" +
      '<span class="sfe-be-from">' +
      from +
      '</span><span class="sfe-be-arrow" style="color:' +
      arrowColor +
      '">' + (isAr ? "&larr;" : "&rarr;") + "</span>" +
      '<span class="sfe-be-to">' +
      to +
      '</span><span class="sfe-be-delta">' +
      delta +
      "</span></div>"
    );
  }

  function renderInsightsFeed(c) {
    var el = document.getElementById("sfe-insights-feed");
    if (!el) return;
    var s = simState;
    var insights = [];
    var ndrPct = s7RatioPctValue(s.ndr);

    // 1. Core profitability state
    if (c.netProfit < 0) {
      insights.push({
        type: "critical",
        icon: S7_ICONS.critical,
        cat: s7Txt("PROFITABILITY BLOCKER", "عائق الربحية"),
        text:
          s7Txt(
            'Campaign is <span class="hi-red">losing ',
            'الحملة <span class="hi-red">تخسر ',
          ) +
          sfeFmt(Math.abs(c.netProfit)) +
          s7Txt(
            "</span> net. Revenue of <strong>",
            "</span> صافي. إيرادات بقيمة <strong>",
          ) +
          sfeFmt(c.revenue) +
          s7Txt(
            "</strong> does not cover spend of <strong>",
            "</strong> لا تغطي إنفاقا بقيمة <strong>",
          ) +
          sfeFmt(s.adSpend) +
          "</strong>.",
      });
    } else {
      insights.push({
        type: "positive",
        icon: S7_ICONS.profit,
        cat: s7Txt("PROFITABILITY STATUS", "حالة الربحية"),
        text:
          s7Txt(
            'Campaign is <span class="hi-green">profitable</span> — net profit <strong>',
            'الحملة <span class="hi-green">مربحة</span> - صافي الربح <strong>',
          ) +
          sfeFmt(c.netProfit) +
          s7Txt("</strong> on <strong>", "</strong> على إيرادات <strong>") +
          sfeFmt(c.revenue) +
          "</strong>.",
      });
    }

    // 2. Unit economics
    if (c.cpa > c.revenuePerDel && s.adSpend > 0) {
      insights.push({
        type: "negative",
        icon: S7_ICONS.loss,
        cat: s7Txt("UNIT ECONOMICS", "اقتصاديات الوحدة"),
        text:
          s7Txt(
            '<span class="hi-red">CPA (',
            '<span class="hi-red">تكلفة الطلب (',
          ) +
          sfeFmt(c.cpa, 2) +
          s7Txt(
            ")</span> exceeds revenue per delivered order <strong>(",
            ")</span> أعلى من الإيراد لكل طلب مسلم <strong>(",
          ) +
          sfeFmt(c.revenuePerDel, 2) +
          s7Txt(
            ")</strong>. Scaling will compound losses, not profits.",
            ")</strong>. التوسع سيضاعف الخسائر لا الأرباح.",
          ),
      });
    } else if (c.revenuePerDel > 0 && s.adSpend > 0) {
      insights.push({
        type: "positive",
        icon: S7_ICONS.profit,
        cat: s7Txt("UNIT ECONOMICS", "اقتصاديات الوحدة"),
        text:
          s7Txt(
            'Revenue per delivered order <span class="hi-green">(',
            'الإيراد لكل طلب مسلم <span class="hi-green">(',
          ) +
          sfeFmt(c.revenuePerDel, 2) +
          s7Txt(
            ")</span> exceeds CPA <strong>(",
            ")</span> أعلى من تكلفة الطلب <strong>(",
          ) +
          sfeFmt(c.cpa, 2) +
          s7Txt(
            ")</strong>. Unit economics are positive — scaling is viable.",
            ")</strong>. اقتصاديات الوحدة إيجابية والتوسع ممكن.",
          ),
      });
    }

    // 3. NDR analysis
    if (s.ndr < 0.20) {
      insights.push({
        type: "negative",
        icon: S7_ICONS.critical,
        cat: s7Txt("NDR ANALYSIS", "تحليل معدل التسليم الصافي"),
        text:
          s7Txt(
            'NDR of <span class="hi-red">',
            'معدل التسليم الصافي <span class="hi-red">',
          ) +
          ndrPct +
          s7Txt(
            "%</span> is critically below the danger threshold (20%). <strong>",
            "%</span> أقل بكثير من حد الخطر (20%). <strong>",
          ) +
          s7Num(Math.round((1 - s.ndr) * s.totalOrders)) +
          s7Txt(
            " orders</strong> are failing — primary driver of losses.",
            " طلب</strong> تفشل وهي المحرك الأساسي للخسائر.",
          ),
      });
    } else if (s.ndr < 0.30) {
      insights.push({
        type: "warning",
        icon: S7_ICONS.warning,
        cat: s7Txt("NDR ANALYSIS", "تحليل معدل التسليم الصافي"),
        text:
          s7Txt(
            'NDR of <span class="hi-yellow">',
            'معدل التسليم الصافي <span class="hi-yellow">',
          ) +
          ndrPct +
          s7Txt(
            "%</span> is below healthy baseline (30%). Improving to 30%+ would materially impact profitability.",
            "%</span> أقل من خط الصحة الأساسي (30%). التحسن إلى 30% أو أكثر يؤثر بوضوح على الربحية.",
          ),
      });
    } else if (s.ndr >= 0.40) {
      insights.push({
        type: "positive",
        icon: S7_ICONS.delivered,
        cat: s7Txt("NDR ANALYSIS", "تحليل معدل التسليم الصافي"),
        text:
          s7Txt(
            'NDR of <span class="hi-cyan">',
            'معدل التسليم الصافي <span class="hi-cyan">',
          ) +
          ndrPct +
          s7Txt(
            "%</span> reaches the top delivery tier (40%). Strong delivery enables confident budget scaling.",
            "%</span> يصل إلى أعلى مستوى تسليم (40%). التسليم القوي يسمح بزيادة الميزانية بثقة.",
          ),
      });
    }

    // 4. Loss per delivery
    var lossPerDel =
      c.deliveredOrders > 0 ? (s.adSpend - c.revenue) / c.deliveredOrders : 0;
    if (lossPerDel > 0) {
      insights.push({
        type: "negative",
        icon: S7_ICONS.cost,
        cat: s7Txt("COST ANALYSIS", "تحليل التكلفة"),
        text:
          s7Txt(
            'You are losing <span class="hi-red">',
            'تخسر <span class="hi-red">',
          ) +
          sfeFmt(lossPerDel) +
          s7Txt(
            "</span> per delivered order. Doubling budget doubles losses.",
            "</span> لكل طلب مسلم. مضاعفة الميزانية تضاعف الخسائر.",
          ),
      });
    }

    // 5. Scaling safety
    if (c.projNet < 0 && c.netProfit < 0) {
      insights.push({
        type: "critical",
        icon: S7_ICONS.critical,
        cat: s7Txt("SCALING SAFETY", "أمان التوسع"),
        text:
          s7Txt(
            "Doubling budget to <strong>",
            "مضاعفة الميزانية إلى <strong>",
          ) +
          sfeFmt(c.projBudget) +
          s7Txt(
            '</strong> projects <span class="hi-red">',
            '</strong> تتوقع <span class="hi-red">',
          ) +
          sfeFmt(Math.abs(c.projNet)) +
          s7Txt(
            " loss</span>. Scaling losses, not profits. Fix unit economics first.",
            " خسارة</span>. هذا توسع للخسائر لا الأرباح. أصلح اقتصاديات الوحدة أولا.",
          ),
      });
    } else if (c.projNet > 0 && c.netProfit > 0) {
      insights.push({
        type: "positive",
        icon: S7_ICONS.rocket,
        cat: s7Txt("SCALING OPPORTUNITY", "فرصة التوسع"),
        text:
          s7Txt(
            'Scaling to 2× budget projects <span class="hi-green">',
            'التوسع إلى 2x من الميزانية يتوقع <span class="hi-green">',
          ) +
          sfeFmt(c.projNet) +
          s7Txt(
            " net profit</span> at <strong>",
            " صافي ربح</span> عند <strong>",
          ) +
          c.projRoi.toFixed(1) +
          s7Txt(
            "% ROI</strong>. Safe to scale.",
            "% ROI</strong>. آمن للتوسع.",
          ),
      });
    }

    // 6. Average profit optimization. avgCommission is retained as a compatibility field.
    if (c.commRequired !== null && c.commRequired > s.avgCommission) {
      var lift = Math.ceil(c.commRequired - s.avgCommission);
      insights.push({
        type: "info",
        icon: "i",
        cat: s7Txt("AVERAGE PROFIT OPTIMIZATION", "تحسين متوسط الربح"),
        text:
          s7Txt(
            'Increasing average profit by <span class="hi-blue">',
            'زيادة متوسط الربح بمقدار <span class="hi-blue">',
          ) +
          lift +
          s7Txt(
            " " + state.currency + "</span> per delivery (from ",
            " " + state.currency + "</span> لكل تسليم (من ",
          ) +
          s.avgCommission +
          " \u2192 " +
          Math.ceil(c.commRequired) +
          s7Txt(" " + state.currency + ") would achieve break-even.", " " + state.currency + ") تحقق التعادل."),
      });
    }

    el.innerHTML = insights
      .slice(0, 6)
      .map(function (i) {
        var trust = window.TaagerSmartInsights && window.TaagerSmartInsights.trustLabel
          ? window.TaagerSmartInsights.trustLabel(i.trust || "estimated")
          : "Estimated";
        return (
          '<div class="sfe-insight sfe-insight--' +
          i.type +
          '">' +
          '<span class="sfe-insight-icon">' +
          i.icon +
          "</span>" +
          '<div class="sfe-insight-body">' +
           '<div class="sfe-insight-category">' +
           i.cat +
          " · " +
          trust +
           "</div>" +
          '<div class="sfe-insight-text">' +
          i.text +
          "</div>" +
          "</div></div>"
        );
      })
      .join("");
  }

  function renderSimScenarioTable(c) {
    var el = document.getElementById("sfe-scenario-table");
    if (!el) return;
    var s = simState;
    var ndrBase = Number(s7RatioPctValue(s.ndr));
    var scenarios = [
      {
        label: "NDR -10pp",
        ndr: Math.max(1, ndrBase - 10) / 100,
        comm: s.avgCommission,
        orders: s.totalOrders,
        spend: s.adSpend,
      },
      {
        label: "NDR -5pp",
        ndr: Math.max(1, ndrBase - 5) / 100,
        comm: s.avgCommission,
        orders: s.totalOrders,
        spend: s.adSpend,
      },
      {
        label: s7Txt("Current", "الحالي"),
        ndr: s.ndr,
        comm: s.avgCommission,
        orders: s.totalOrders,
        spend: s.adSpend,
        current: true,
      },
      {
        label: "NDR +5pp",
        ndr: Math.min(100, ndrBase + 5) / 100,
        comm: s.avgCommission,
        orders: s.totalOrders,
        spend: s.adSpend,
      },
      {
        label: "NDR +10pp",
        ndr: Math.min(100, ndrBase + 10) / 100,
        comm: s.avgCommission,
        orders: s.totalOrders,
        spend: s.adSpend,
      },
      {
        label: s7Txt("Profit +20%", "الربح +20%"),
        ndr: s.ndr,
        comm: Number((s.avgCommission * 1.2).toFixed(2)),
        orders: s.totalOrders,
        spend: s.adSpend,
      },
      {
        label: s7Txt("Orders ×2", "الطلبات ×2"),
        ndr: s.ndr,
        comm: s.avgCommission,
        orders: s.totalOrders * 2,
        spend: s.adSpend,
      },
    ];
    var rows = scenarios
      .map(function (sc) {
        var calc = window.TaagerDashboardFinancialCore.calculate({
          mode: "expected",
          netOrders: sc.orders,
          actualDeliveredOrders: 1,
          actualEarnedProfitAfterTax: sc.comm,
          currentTotalSales: 0,
          expectedNdrRate: sc.ndr,
          adSpend: sc.spend,
        });
        var del = calc.expectedDeliveriesDisplay;
        var rev = calc.expectedTotalProfitBeforeAdSpend;
        var net = calc.expectedNetProfit;
        var roi = calc.expectedRoi;
        var nCls = net >= 0 ? "col-positive" : "col-negative";
        var rCls = roi >= 0 ? "col-positive" : "col-negative";
        return (
          '<tr class="' +
          (sc.current ? "sfe-row-current" : "") +
          '">' +
          "<td>" +
          sc.label +
          "</td>" +
          "<td>" +
          s7RatioPctValue(sc.ndr) +
          "%</td>" +
          "<td>" +
          sfeFmt(sc.comm, 2) +
          "</td>" +
          "<td>" +
          s7Num(del) +
          "</td>" +
          "<td>" +
          sfeFmt(rev) +
          "</td>" +
          '<td class="' +
          nCls +
          '">' +
          sfeFmt(net) +
          "</td>" +
          '<td class="' +
          rCls +
          '">' +
          roi.toFixed(1) +
          "%</td></tr>"
        );
      })
      .join("");
    el.innerHTML =
      '<table class="sfe-table">' +
      "<thead><tr><th>" +
      s7Txt("Scenario", "السيناريو") +
      "</th><th>NDR</th><th>" +
      s7Txt("Avg Profit", "متوسط الربح") +
      "</th><th>" +
      s7Txt("Delivered", "تم التسليم") +
      "</th><th>" +
      s7Txt("Revenue", "الإيرادات") +
      "</th><th>" +
      s7Txt("Net Profit", "صافي الربح") +
      "</th><th>ROI</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table>";
  }

  function updateSimUI() {
    var c = computeSim();
    var delivEl = document.getElementById("sfe-delivered-orders");
    if (delivEl && document.activeElement !== delivEl) delivEl.value = Math.round(c.deliveredOrders);
    var ndrEl = document.getElementById("sfe-ndr");
    if (ndrEl && document.activeElement !== ndrEl) ndrEl.value = s7RatioPctValue(simState.ndr);
    var ndrHint = document.getElementById("sfe-ndr-hint");
    var commHint = document.getElementById("sfe-comm-hint");
    var adSpendCurr = document.getElementById("sfe-lbl-adspend-curr");
    var commCurr = document.getElementById("sfe-lbl-comm-curr");
    if (ndrHint) ndrHint.textContent = s7RatioPctValue(simState.ndr) + "%";
    if (commHint) commHint.textContent = formatTwoDecimals(convert(simState.avgCommission, nativeCurrency || window.dashboardActiveCurrency || "SAR", state.currency)) + " " + state.currency;
    if (adSpendCurr) adSpendCurr.textContent = state.currency;
    if (commCurr) commCurr.textContent = state.currency;
    var badge = document.getElementById("sfe-sim-badge");
    if (badge) badge.style.display = simState._isModified ? "flex" : "none";
    renderSimMetrics(c);
    renderSimScores(c);
    renderBreakeven(c);
    renderInsightsFeed(c);
    renderSimScenarioTable(c);
  }

  // -- 8. Main Calculator UI Update --------------------------------------------
  function updateCalcUI(options) {
    options = options || {};
    if (syncedSpendActive && sourceBreakdown.length) {
      state.budget = syncedBudgetInCurrency();
      d.adSpend = state.budget;
      refreshBudgetInputValue(true);
    }
    syncSimFinancialsFromRealData(false);
    refreshSimInputValues();
    var realDeliveredEl = document.getElementById("s7-real-delivered-orders");
    if (realDeliveredEl) realDeliveredEl.textContent = s7Num(realExpectedDvl);
    var realNdrEl = document.getElementById("s7-real-ndr-pct");
    if (realNdrEl) realNdrEl.textContent = s7PctValue(realNdrPct) + "%";
    if (assignedMarketingAccounts.length) {
      var sourcePanel = document.getElementById("s7-source-breakdown");
      if (sourcePanel) {
        var isLight =
          document.documentElement.getAttribute("data-theme") === "light";
        sourcePanel.style.background = isLight ? "#ffffff" : "#0b1120";
        sourcePanel.style.borderColor = isLight
          ? "#cbd5e1"
          : "rgba(45,212,191,.2)";
        sourcePanel.innerHTML = accountSourcePanelInnerHtml();
        bindMarketingSourcePagination();
      }
    }
    var res = compute();
    var lblCurr = document.getElementById("s7-lbl-budget-curr");
    if (lblCurr) lblCurr.textContent = state.currency;

    // Update inline currency label next to Ad Spend input
    var budgCurrLbl = document.getElementById("s7-budget-curr-label");
    if (budgCurrLbl) budgCurrLbl.textContent = state.currency;

    // Update currency labels on forecast cards
    document.querySelectorAll(".s7-curr-lbl").forEach(function (lbl) {
      lbl.textContent = state.currency;
    });

    document.getElementById("s7-out-spend").textContent = fmt(res.spend);
    document.getElementById("s7-out-cpa").textContent = fmt(res.cpa, 2);
    var breakEvenEl = document.getElementById("s7-out-breakeven-cpa");
    if (breakEvenEl) {
      breakEvenEl.innerHTML = s7ValueStack(fmt(res.breakEvenCpa, 2), 'breakeven', 's7-expected-value-stack');
      breakEvenEl.style.color = res.cpaSAR > res.breakEvenCpaSAR ? "#ef4444" : "#00e676";
    }
    document.getElementById("s7-out-revenue").innerHTML = s7ValueStack(fmt(res.profit), 'revenue', 's7-expected-value-stack');

    var netEl = document.getElementById("s7-out-net");
    if (netEl) {
      netEl.innerHTML = s7ValueStack((res.net > 0 ? "+" : "") + fmt(res.net), 'profit', 's7-expected-value-stack');
      netEl.style.color =
        res.net < 0
          ? "#ef4444"
          : document.documentElement.getAttribute("data-theme") === "light"
            ? "#10b981"
            : "#00e676";
      if (netEl.parentElement && netEl.parentElement.parentElement) {
        netEl.parentElement.parentElement.style.borderColor =
          res.net < 0
            ? "rgba(239,68,68,0.2)"
            : document.documentElement.getAttribute("data-theme") === "light"
              ? "rgba(16,185,129,0.2)"
              : "rgba(0,230,118,0.2)";
      }
    }
    var deliveredSalesEl = document.getElementById("s7-out-delivered-sales");
    if (deliveredSalesEl) {
      var deliveredSalesConverted = convert(overviewDeliveredSales, overviewCurrency, state.currency);
      deliveredSalesEl.innerHTML = s7ValueStack(fmt(deliveredSalesConverted), 'sales', 's7-expected-value-stack');
    }
    var deliveredAovEl = document.getElementById("s7-out-delivered-aov");
    if (deliveredAovEl) {
      var deliveredAovConverted = convert(overviewDeliveredAov, overviewCurrency, state.currency);
      deliveredAovEl.innerHTML = s7ValueStack(fmt(deliveredAovConverted, 2), 'aov', 's7-expected-value-stack');
    }

    var gaugeWrap = document.getElementById("s7-gauge-wrap");
    if (gaugeWrap) gaugeWrap.innerHTML = gaugeHtml(res.roi);

    var retEl = document.getElementById("s7-out-return");
    if (retEl) {
      retEl.innerHTML =
        s7Txt("Return: ", "العائد: ") +
        res.returnPerSar.toFixed(2) +
        " " +
        state.currency + window.supposedBadgeHtml('roas');
      retEl.style.color =
        res.roi < 0
          ? "#ef4444"
          : document.documentElement.getAttribute("data-theme") === "light"
            ? "#10b981"
            : "#00e676";
    }
    var netRoasEl = document.getElementById("s7-out-net-roas");
    if (netRoasEl) {
      netRoasEl.innerHTML =
        s7Txt("Net ROAS: ", "صافي العائد: ") + res.netRoas.toFixed(2) + "x" + window.supposedBadgeHtml('roas');
      netRoasEl.style.color =
        res.netRoas >= 1
          ? document.documentElement.getAttribute("data-theme") === "light"
            ? "#10b981"
            : "#00e676"
          : "#ef4444";
    }

    // Dynamic currency update for ROAS hint text
    var roasTextEl = document.getElementById("s7-roas-text");
    if (roasTextEl) {
      roasTextEl.innerHTML =
        s7Txt(
          "For each 1 " + state.currency + " spent",
          "لكل 1 " + state.currency + " يتم إنفاقه",
        ) +
        " " +
        _tip(
          S7_ICONS.target,
          s7Txt(
            "Return per Currency Unit (ROAS)",
            "العائد لكل وحدة عملة (ROAS)",
          ),
          s7Txt(
            "For each unit spent, how much do you get back in revenue? More than 1 means revenue exceeds spend.",
            "لكل وحدة يتم إنفاقها، كم تحصل كإيراد؟ أكبر من 1 يعني أن الإيراد يتجاوز الإنفاق.",
          ),
          "ROAS = revenue / adSpend",
        );
    }

    // Dynamic conversion of real average profit indicator card.
    var realCommEl = document.getElementById("s7-real-average-profit");
    if (realCommEl) {
      var convertedComm = convert(realAvgCommission, nativeCurrency, state.currency);
      var sym = state.currency;
      if (state.currency === "USD") {
        realCommEl.textContent = "$" + convertedComm.toFixed(2);
      } else {
        realCommEl.textContent = fmt(convertedComm, 2) + " " + sym;
      }
    }

    // Smart tip
    var tipEl = document.getElementById("s7-smart-tip");
    var tipParent =
      tipEl && tipEl.parentElement && tipEl.parentElement.parentElement;
    var tip = "",
      tipIcon = S7_ICONS.info,
      tipTitle = s7Txt("Campaign Status", "حالة الحملة"),
      tipBg,
      tipBorder;
    if (res.roi < 0) {
      tip = s7Txt(
        "This budget is creating a loss. Improve targeting or increase delivery rate (NDR) before adding more spend.",
        "هذه الميزانية تسبب خسارة. حسّن الاستهداف أو ارفع معدل التسليم (NDR) قبل إضافة إنفاق أكبر.",
      );
      tipIcon = S7_ICONS.critical;
      tipBg = "rgba(239,68,68,0.1)";
      tipBorder = "rgba(239,68,68,0.2)";
      if (tipEl)
        tipEl.parentElement.querySelector("div:first-child").style.color =
          "#ef4444";
    } else if (res.roi < 50) {
      tip = s7Txt(
        "Weak performance close to break-even. Profit margin is thin. Improve performance before scaling.",
        "أداء ضعيف قريب من التعادل. هامش الربح محدود. حسّن الأداء قبل التوسع.",
      );
      tipIcon = S7_ICONS.warning;
      tipBg = "rgba(245,158,11,0.1)";
      tipBorder = "rgba(245,158,11,0.2)";
      if (tipEl)
        tipEl.parentElement.querySelector("div:first-child").style.color =
          "#f59e0b";
    } else {
      tip = s7Txt(
        "Excellent and profitable performance. Your campaign is generating a healthy return. Continue or raise budget carefully.",
        "أداء ممتاز ومربح. حملتك تحقق عائدا صحيا. استمر أو ارفع الميزانية بحذر.",
      );
      tipIcon = S7_ICONS.profit;
      tipBg =
        document.documentElement.getAttribute("data-theme") === "light"
          ? "rgba(16,185,129,0.1)"
          : "rgba(0,230,118,0.1)";
      tipBorder =
        document.documentElement.getAttribute("data-theme") === "light"
          ? "rgba(16,185,129,0.2)"
          : "rgba(0,230,118,0.2)";
      if (tipEl)
        tipEl.parentElement.querySelector("div:first-child").style.color =
          document.documentElement.getAttribute("data-theme") === "light"
            ? "#10b981"
            : "#00e676";
    }
    if (tipEl) tipEl.textContent = tip;
    if (tipParent) {
      tipParent.style.background =
        "linear-gradient(135deg, " + tipBg + " 0%, transparent 100%)";
      tipParent.style.borderColor = tipBorder;
      var iconEl = tipParent.querySelector("div:first-child");
      if (iconEl) iconEl.textContent = tipIcon;
    }

    if (!options.deferVisuals) {
      buildGrowthChart(res.cpaSAR, res.spendSAR);
      renderScenarios(res.cpaSAR, res.spendSAR);
    }
    updateSimUI();
  }

  // -- 9. Render HTML ----------------------------------------------------------
  function render() {
    mountEl.innerHTML =
      "<style>" +
      // Calculator styles
      ".s7-input-wrap{background:linear-gradient(135deg,rgba(17,24,39,0.7) 0%,rgba(15,23,42,0.8) 100%);border:1px solid var(--dash-border-soft);border-radius:var(--dash-radius-lg);padding:14px 18px;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);display:flex;flex-direction:column;gap:6px;position:relative;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4),0 4px 20px rgba(0,0,0,0.15)}" +
      ".s7-input-wrap:hover{border-color:rgba(255,255,255,0.15);transform:translateY(-1px);box-shadow:inset 0 2px 4px rgba(0,0,0,0.4),0 6px 24px rgba(0,0,0,0.25)}" +
      ".s7-input-wrap:focus-within{border-color:#3b82f6;background:rgba(10,15,30,0.95);box-shadow:0 0 0 3px rgba(59,130,246,0.25),inset 0 2px 4px rgba(0,0,0,0.5);transform:scale(1.01) translateY(-1px)}" +
      ".s7-lbl{font-size:var(--type-caption);color:rgba(156,163,175,0.8);font-weight:var(--weight-semibold);letter-spacing:0.03em;text-transform:uppercase;transition:color 0.3s}" +
      ".s7-input-wrap:focus-within .s7-lbl{color:#60a5fa}" +
      ".s7-input-num{background:transparent;border:none;color:#fff;font-family:var(--font-ui);font-size:var(--type-metric-sm);font-weight:var(--weight-bold);width:100%;outline:none;padding:0;margin:0;box-shadow:none;line-height:1.2;letter-spacing:0.02em}" +
      ".s7-input-num::-webkit-inner-spin-button,.s7-input-num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}" +
      ".s7-input-num{-moz-appearance:textfield}" +
      ".s7-input-num::placeholder{color:rgba(255,255,255,0.25);font-weight:var(--weight-medium);font-style:italic;font-size:var(--type-component-title);font-family:var(--font-ui)}" +
      '[data-theme="light"] .s7-input-wrap{background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%) !important;border-color:#cbd5e1 !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 10px 24px rgba(15,23,42,.07) !important}' +
      '[data-theme="light"] .s7-input-wrap:hover{border-color:#93c5fd !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 12px 28px rgba(59,130,246,.1) !important}' +
      '[data-theme="light"] .s7-input-wrap:focus-within{background:#ffffff !important;border-color:#3b82f6 !important;box-shadow:0 0 0 3px rgba(59,130,246,.14),0 12px 28px rgba(59,130,246,.12) !important}' +
      '[data-theme="light"] .s7-lbl{color:#64748b !important}' +
      '[data-theme="light"] .s7-input-wrap:focus-within .s7-lbl{color:#2563eb !important}' +
      '[data-theme="light"] .s7-input-num{color:#0f172a !important}' +
      '[data-theme="light"] .s7-input-num::placeholder{color:#64748b !important;opacity:1 !important}' +
      ".s7-rate-note,.sfe-global-rate-note{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.18);border-radius:var(--dash-radius-md);padding:11px 13px;display:flex;flex-direction:column;gap:4px;color:rgba(255,255,255,.68);font-size:var(--type-caption);font-weight:var(--weight-semibold);line-height:1.55}" +
      ".s7-rate-note strong,.sfe-global-rate-note strong{color:#93c5fd;font-size:var(--type-label);font-weight:var(--weight-semibold)}" +
      ".s7-currency-badge{display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;border-radius:var(--radius-pill);font-size:var(--type-label);font-weight:var(--weight-semibold);letter-spacing:0.05em;text-transform:uppercase;transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1);border:1px solid rgba(255,255,255,0.1);box-shadow:0 4px 12px rgba(0,0,0,0.3),inset 0 1px 1px rgba(255,255,255,0.1);white-space:nowrap;cursor:default;user-select:none}" +
      ".s7-currency-badge.sar{background:linear-gradient(135deg,rgba(16,185,129,0.25) 0%,rgba(5,150,105,0.15) 100%);color:#34d399;border-color:rgba(52,211,153,0.35);box-shadow:0 4px 12px rgba(52,211,153,0.15),inset 0 1px 1px rgba(255,255,255,0.15)}" +
      ".s7-currency-badge.usd{background:linear-gradient(135deg,rgba(59,130,246,0.25) 0%,rgba(29,78,216,0.15) 100%);color:#60a5fa;border-color:rgba(96,165,250,0.35);box-shadow:0 4px 12px rgba(96,165,250,0.15),inset 0 1px 1px rgba(255,255,255,0.15)}" +
      ".s7-currency-badge.egp{background:linear-gradient(135deg,rgba(245,158,11,0.25) 0%,rgba(217,119,6,0.15) 100%);color:#fbbf24;border-color:rgba(251,191,36,0.35);box-shadow:0 4px 12px rgba(251,191,36,0.15),inset 0 1px 1px rgba(255,255,255,0.15)}" +
      "@keyframes badgeChange{0%{transform:scale(0.85);opacity:0.5}100%{transform:scale(1);opacity:1}}" +
      ".s7-currency-badge-animate{animation:badgeChange 0.35s cubic-bezier(0.34,1.56,0.64,1)}" +
      ".s7-card{background:linear-gradient(145deg,rgba(30,41,59,0.4),rgba(15,23,42,0.6));border:1px solid rgba(59,130,246,0.16);border-radius:var(--dash-radius-lg);padding:20px 16px;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;position:relative;overflow:hidden;transition:.2s;min-width:0;text-align:center}" +
      ".s7-card>div{min-width:0}" +
      ".s7-card:hover{border-color:rgba(255,255,255,0.15);transform:translateY(-2px)}" +
      ".s7-source-breakdown{margin:24px 30px 0;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(45,212,191,.2)") +
      ";border-radius:var(--dash-radius-xl);padding:20px;display:flex;flex-direction:column;gap:15px}" +
      ".s7-source-head{display:flex;align-items:center;justify-content:space-between;gap:18px}" +
      ".s7-source-head h3{margin:0 0 4px;font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#fff") +
      "}" +
      ".s7-source-head p{margin:0;font-size:var(--type-caption);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,.52)") +
      ";font-weight:var(--weight-semibold)}" +
      ".s7-source-total{background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.24);border-radius:var(--dash-radius-md);padding:9px 13px;display:flex;flex-direction:column;gap:3px;align-items:flex-end;white-space:nowrap}" +
      ".s7-source-total span{color:rgba(255,255,255,.52);font-size:var(--type-micro);font-weight:var(--weight-semibold);text-transform:uppercase;letter-spacing:.08em}" +
      ".s7-source-total strong{color:#2dd4bf;font-size:var(--type-subtitle);font-weight:var(--weight-semibold)}" +
      ".s7-source-meta{margin-left:auto;display:flex;flex-direction:column;gap:3px;align-items:flex-end;min-width:150px}" +
      ".s7-source-meta span{font-size:var(--type-micro);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,.45)") +
      ";font-weight:var(--weight-semibold);text-transform:uppercase;letter-spacing:.08em}" +
      ".s7-source-meta strong{font-size:var(--type-label);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f3f4f6") +
      ";white-space:nowrap}" +
      ".s7-source-sync{border:1px solid rgba(168,85,247,.45);background:rgba(168,85,247,.18);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#7c3aed"
        : "#f8fafc") +
      ";border-radius:var(--dash-radius-md);padding:10px 13px;font-size:var(--type-caption);font-weight:var(--weight-semibold);cursor:pointer;font-family:var(--font-ui);white-space:nowrap}" +
      ".s7-source-sync:disabled{opacity:.55;cursor:not-allowed}" +
      ".s7-source-rows{display:flex;flex-direction:column;gap:8px}" +
      ".s7-source-row{display:grid;grid-template-columns:minmax(210px,1fr) 180px 180px;gap:12px;align-items:center;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f8fafc"
        : "rgba(255,255,255,.025)") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#e2e8f0"
        : "rgba(255,255,255,.06)") +
      ";border-radius:var(--dash-radius-md);padding:12px 14px}" +
      ".s7-source-row div{display:flex;flex-direction:column;gap:3px}" +
      ".s7-source-row span,.s7-source-account small{font-size:var(--type-micro);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,.48)") +
      ";font-weight:var(--weight-semibold)}" +
      ".s7-source-row strong{font-size:var(--type-control);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f3f4f6") +
      ";overflow-wrap:anywhere}" +
      ".s7-source-row .s7-source-converted{color:#2dd4bf}" +
      "@media(max-width:980px){.s7-source-row{grid-template-columns:1fr}.s7-source-head{align-items:flex-start;flex-direction:column}}" +
      ".s7-scen-row{display:grid;grid-template-columns:1.3fr 1fr 1fr 0.7fr;text-align:center;padding:10px 0;font-size:var(--type-label);align-items:center;transition:.2s}" +
      ".s7-tab{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--dash-radius-xl);font-size:var(--type-control);font-weight:var(--weight-semibold);cursor:pointer;transition:all 0.25s cubic-bezier(0.4,0,0.2,1);border:1px solid transparent;background:transparent;color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#64748b" : "rgba(240,241,243,0.4)") +
      ";user-select:none}" +
      ".s7-tab.active{background:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.10)" : "rgba(59,130,246,0.15)") +
      ";border-color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.45)" : "rgba(59,130,246,0.4)") +
      ";color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#7c3aed" : "#60a5fa") +
      ";box-shadow:0 4px 12px " +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.12)" : "rgba(59,130,246,0.15)") +
      "}" +
      ".s7-tab:not(.active):hover{background:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.06)" : "rgba(255,255,255,0.05)") +
      ";color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#7c3aed" : "rgba(240,241,243,0.85)") +
      ";border-color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.20)" : "rgba(255,255,255,0.05)") +
      "}" +
      ".sfe-curr-tab{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--dash-radius-xl);font-size:var(--type-control);font-weight:var(--weight-semibold);cursor:pointer;transition:all 0.25s cubic-bezier(0.4,0,0.2,1);border:1px solid transparent;background:transparent;color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#64748b" : "rgba(240,241,243,0.4)") +
      ";user-select:none}" +
      ".sfe-curr-tab.sfe-curr-active{background:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.10)" : "rgba(59,130,246,0.15)") +
      ";border-color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.45)" : "rgba(59,130,246,0.4)") +
      ";color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#7c3aed" : "#60a5fa") +
      ";box-shadow:0 4px 12px " +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.12)" : "rgba(59,130,246,0.15)") +
      "}" +
      ".sfe-curr-tab:not(.sfe-curr-active):hover{background:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.06)" : "rgba(255,255,255,0.05)") +
      ";color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#7c3aed" : "rgba(240,241,243,0.85)") +
      ";border-color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "rgba(124,58,237,0.20)" : "rgba(255,255,255,0.05)") +
      "}" +
      ".s7-sync-period{display:flex;flex-direction:column;gap:7px}" +
      ".s7-sync-period-range{font-size:var(--type-caption);color:#f59e0b;font-weight:var(--weight-semibold);padding:8px 10px;background:rgba(245,158,11,0.08);border-radius:var(--dash-radius-sm);border:1px solid rgba(245,158,11,0.15)}" +
      ".s7-sync-period-note{font-size:var(--type-micro);color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#7c3aed" : "rgba(240,241,243,0.85)") +
      " ;line-height:1.65;padding:9px 10px;background:rgba(59,130,246,0.08);border-radius:var(--dash-radius-sm);border:1px solid rgba(59,130,246,0.14)}" +
      // SFE (Smart Forecasting Engine) styles
      ".sfe-wrapper{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f8fafc"
        : "#0b0c0f") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";padding:28px;margin-top:28px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";overflow:hidden}" +
      ".sfe-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-header-badge{font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.14em;color:#00e5a0;background:rgba(0,229,160,0.08);border:1px solid rgba(0,229,160,0.2);border-radius:4px;padding:3px 8px;display:inline-block;margin-bottom:8px}" +
      ".sfe-header-title{font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";letter-spacing:-.02em;line-height:1.2}" +
      ".sfe-header-sub{font-size:var(--type-label);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";margin-top:6px}" +
      ".sfe-header-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px}" +
      ".sfe-sim-badge{display:flex;align-items:center;gap:6px;font-size:var(--type-micro);font-weight:var(--weight-medium);letter-spacing:.1em;color:#f5a623;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:4px;padding:4px 10px}" +
      ".sfe-sim-dot{width:6px;height:6px;border-radius:50%;background:#f5a623;box-shadow:0 0 8px #f5a623;animation:sfePulse 2s ease-in-out infinite}" +
      "@keyframes sfePulse{0%,100%{opacity:1}50%{opacity:.4}}" +
      ".sfe-reset-btn{background:transparent;border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.12)") +
      ";color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";font-size:var(--type-label);font-weight:var(--weight-medium);padding:6px 14px;border-radius:var(--dash-radius-sm);cursor:pointer;transition:.2s;font-family:inherit}" +
      ".sfe-reset-btn:hover{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.05)") +
      ";color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      "}" +
      ".sfe-metrics-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:24px}" +
      ".sfe-metric-card{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#111318") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";border-radius:var(--dash-radius-md);padding:14px;position:relative;overflow:hidden}" +
      '.sfe-metric-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--sfe-accent-bar,transparent);border-radius:var(--dash-radius-md) 10px 0 0}' +
      ".sfe-metric-card.sfe-positive{--sfe-accent-bar:#00e5a0;border-color:rgba(0,229,160,.15)}" +
      ".sfe-metric-card.sfe-negative{--sfe-accent-bar:#ff3b5c;border-color:rgba(255,59,92,.15)}" +
      ".sfe-metric-card.sfe-neutral{--sfe-accent-bar:#4da6ff;border-color:rgba(77,166,255,.12)}" +
      ".sfe-metric-label{font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.1em;color:#4d5066;text-transform:uppercase;margin-bottom:8px}" +
      ".sfe-metric-val{font-size:var(--type-section-title);font-weight:var(--weight-bold);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";letter-spacing:-.03em;line-height:1;transition:color .3s}" +
      ".sfe-metric-sub{font-size:var(--type-caption);color:#4d5066;margin-top:5px}" +
      ".sfe-body-grid{display:grid;grid-template-columns:320px 1fr;gap:16px;margin-bottom:24px}" +
      ".sfe-panel{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#111318") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";border-radius:var(--dash-radius-md);padding:20px}" +
      ".sfe-panel-label{font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.13em;color:#4d5066;text-transform:uppercase;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-control-group{display:flex;flex-direction:column;gap:16px}" +
      ".sfe-control-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      ".sfe-control-row{display:flex;flex-direction:column;gap:6px}" +
      ".sfe-label{font-size:var(--type-label);font-weight:var(--weight-medium);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";display:flex;align-items:center;gap:6px}" +
      ".sfe-label-hint{font-weight:var(--weight-semibold);color:#00e5a0;font-size:var(--type-label)}" +
      ".sfe-input-wrap2{display:flex;align-items:center;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#161921") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.12)") +
      ";border-radius:var(--dash-radius-sm);overflow:hidden;transition:border-color .2s}" +
      ".sfe-input-wrap2:focus-within{border-color:rgba(0,229,160,.4)}" +
      ".sfe-input2{background:transparent;border:none;outline:none;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";font-size:var(--type-component-title);font-weight:var(--weight-semibold);padding:9px 12px;width:100%;-moz-appearance:textfield}" +
      ".sfe-input2::-webkit-inner-spin-button,.sfe-input2::-webkit-outer-spin-button{-webkit-appearance:none}" +
      ".sfe-input-unit2{padding:0 12px;font-size:var(--type-caption);font-weight:var(--weight-semibold);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#4d5066") +
      ";letter-spacing:.06em;white-space:nowrap;border-left:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-health-scale{height:5px;border-radius:var(--radius-pill);background:linear-gradient(90deg,#ff3b5c 0%,#ff3b5c 20%,#f5a623 20%,#f5a623 30%,#00e5a0 30%,#00e5a0 40%,#22d3ee 40%,#22d3ee 100%);opacity:.75;margin-top:4px;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)}" +
      ".sfe-slider{-webkit-appearance:none;width:100%;height:4px;border-radius:4px;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#e2e8f0"
        : "#161921") +
      ";outline:none;cursor:pointer;border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#f0f1f3;border:2px solid #0b0c0f;box-shadow:0 0 0 2px #00e5a0;cursor:pointer;transition:box-shadow .2s}" +
      ".sfe-slider-thumb:hover{box-shadow:0 0 0 4px rgba(0,229,160,0.25)}" +
      ".sfe-slider-markers{display:flex;justify-content:space-between;margin-top:4px}" +
      ".sfe-marker{font-size:var(--type-micro);font-weight:var(--weight-semibold);text-align:center;line-height:1.3}" +
      ".sfe-marker--danger{color:#ff3b5c}.sfe-marker--mid{color:#f5a623}.sfe-marker--safe{color:#22d3ee}" +
      ".sfe-derived-row{background:rgba(77,166,255,0.04);border:1px solid rgba(77,166,255,.1);border-radius:var(--dash-radius-sm);padding:10px 12px}" +
      ".sfe-derived-value{font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:#4da6ff;letter-spacing:-.03em}" +
      ".sfe-derived-note{font-size:var(--type-micro);color:#4d5066;margin-top:2px}" +
      "@media (max-width:720px){.sfe-control-pair{grid-template-columns:1fr}}" +
      ".sfe-score-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}" +
      ".sfe-score-block{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#161921") +
      ";border-radius:var(--dash-radius-md);border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";padding:14px 16px}" +
      ".sfe-score-title{font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.12em;text-transform:uppercase;color:#4d5066;margin-bottom:10px}" +
      ".sfe-score-gauge{display:flex;align-items:center;gap:10px}" +
      ".sfe-gauge-bar-wrap{flex:1;height:6px;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,.06)") +
      ";border-radius:var(--dash-radius-sm);overflow:hidden}" +
      ".sfe-gauge-bar{height:100%;border-radius:var(--dash-radius-sm);transition:width .5s cubic-bezier(.4,0,.2,1),background .4s}" +
      ".sfe-score-num{font-size:var(--type-metric-sm);font-weight:var(--weight-bold);min-width:36px;text-align:right;transition:color .3s}" +
      ".sfe-score-label{font-size:var(--type-caption);font-weight:var(--weight-medium);margin-top:6px}" +
      ".sfe-breakeven-panel{background:rgba(0,229,160,0.03);border:1px solid rgba(0,229,160,.12);border-radius:var(--dash-radius-md);padding:16px;margin-bottom:14px}" +
      ".sfe-be-title{font-size:var(--type-label);font-weight:var(--weight-semibold);letter-spacing:.1em;color:#00e5a0;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:6px}" +
      ".sfe-be-subtitle{font-size:var(--type-label);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";margin-bottom:12px;line-height:1.5}" +
      ".sfe-be-options{display:flex;flex-direction:column;gap:8px}" +
      ".sfe-be-row{display:flex;align-items:center;gap:10px;padding:8px 10px;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f8fafc"
        : "#111318") +
      ";border-radius:var(--dash-radius-sm);border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-be-kpi{font-size:var(--type-caption);font-weight:var(--weight-semibold);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";letter-spacing:.05em;min-width:120px;text-transform:uppercase}" +
      ".sfe-be-from{font-size:var(--type-control);font-weight:var(--weight-semibold);color:#ff3b5c;min-width:60px}" +
      ".sfe-be-arrow{font-size:var(--type-body);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#94a3b8"
        : "#4d5066") +
      "}" +
      ".sfe-be-to{font-size:var(--type-control);font-weight:var(--weight-semibold);color:#00e5a0}" +
      ".sfe-be-delta{margin-left:auto;font-size:var(--type-micro);font-weight:var(--weight-semibold);padding:2px 7px;border-radius:4px;background:rgba(0,229,160,.1);color:#00e5a0;letter-spacing:.06em}" +
      ".sfe-insights-feed{display:flex;flex-direction:column;gap:8px}" +
      ".sfe-insight{display:flex;gap:10px;padding:11px 13px;border-radius:var(--dash-radius-sm);border:1px solid transparent;animation:sfeIn .3s ease}" +
      "@keyframes sfeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}" +
      ".sfe-insight--positive{background:rgba(0,229,160,.05);border-color:rgba(0,229,160,.15)}" +
      ".sfe-insight--negative{background:rgba(255,59,92,.05);border-color:rgba(255,59,92,.15)}" +
      ".sfe-insight--warning{background:rgba(245,166,35,.05);border-color:rgba(245,166,35,.15)}" +
      ".sfe-insight--info{background:rgba(77,166,255,.05);border-color:rgba(77,166,255,.12)}" +
      ".sfe-insight--critical{background:rgba(255,59,92,.08);border-color:rgba(255,59,92,.3)}" +
      ".sfe-insight-icon{font-size:var(--type-body);flex-shrink:0;margin-top:1px}" +
      ".sfe-insight-category{font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.12em;text-transform:uppercase;color:#4d5066;margin-bottom:3px}" +
      ".sfe-insight-text{font-size:var(--type-label);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";line-height:1.55}" +
      ".sfe-insight-text strong{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";font-weight:var(--weight-semibold)}" +
      ".sfe-insight-text .hi-green{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#10b981"
        : "#00e5a0") +
      ";font-weight:var(--weight-semibold)}" +
      ".sfe-insight-text .hi-red{color:#ff3b5c;font-weight:var(--weight-semibold)}" +
      ".sfe-insight-text .hi-cyan{color:#22d3ee;font-weight:var(--weight-semibold)}" +
      ".sfe-insight-text .hi-yellow{color:#f5a623;font-weight:var(--weight-semibold)}" +
      ".sfe-insight-text .hi-blue{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#2563eb"
        : "#4da6ff") +
      ";font-weight:var(--weight-semibold)}" +
      ".sfe-scenario-section{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#111318") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";border-radius:var(--dash-radius-md);padding:20px}" +
      ".sfe-table{width:100%;border-collapse:collapse;font-size:var(--type-label)}" +
      ".sfe-table th{font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.1em;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#4d5066") +
      ";text-transform:uppercase;padding:8px 14px;text-align:right;border-bottom:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-table th:first-child{text-align:left}" +
      ".sfe-table td{padding:10px 14px;text-align:right;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#8b8fa8") +
      ";border-bottom:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.03)") +
      ";font-size:var(--type-label);font-weight:var(--weight-medium)}" +
      ".sfe-table td:first-child{text-align:left;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#8b8fa8") +
      "}" +
      ".sfe-table tr.sfe-row-current td{background:rgba(0,229,160,.05);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#0f766e"
        : "#f0f1f3") +
      "}" +
      ".sfe-table tr.sfe-row-current td:first-child{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#0f766e"
        : "#00e5a0") +
      ";font-weight:var(--weight-semibold)}" +
      ".sfe-table .col-positive{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#10b981"
        : "#00e5a0") +
      "}.sfe-table .col-negative{color:#ff3b5c}" +
      // -- Tooltip styles ------------------------------------------------------
      ".s7-tip-badge{width:17px;height:17px;border-radius:50%;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "rgba(40, 79, 143, 0.28)"
        : "rgba(255,255,255,0.06)") +
      ";border:1px solid rgba(96,165,250,0.55);color:#93c5fd;font-size:0;font-weight:var(--weight-bold);display:inline-flex;align-items:center;justify-content:center;cursor:help;transition:background .18s,border-color .18s,color .18s;font-family:var(--font-ui);flex-shrink:0;vertical-align:middle;line-height:1;user-select:none}" +
      ".s7-tip-badge::before{content:'?';display:block;color:currentColor;font-size:var(--type-caption);font-weight:var(--weight-semibold);line-height:1}" +
      ".s7-tip-badge:hover{background:rgba(59,130,246,0.28);border-color:rgba(59,130,246,0.7);color:#93c5fd}" +
      // -- Light Theme Overrides ----------------------------------------------
      '[data-theme="light"] .s7-source-breakdown{background:#ffffff !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .s7-source-row{background:#f8fafc !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .s7-source-head h3{color:#1e293b !important}' +
      '[data-theme="light"] .s7-source-head p{color:#64748b !important}' +
      '[data-theme="light"] .s7-source-total span{color:#64748b !important}' +
      '[data-theme="light"] .s7-source-total strong{color:#0f766e !important}' +
      '[data-theme="light"] .s7-source-meta span{color:#64748b !important}' +
      '[data-theme="light"] .s7-source-meta strong{color:#1e293b !important}' +
      '[data-theme="light"] .s7-source-sync{color:#7c3aed !important;background:rgba(124,58,237,0.08) !important;border-color:rgba(124,58,237,0.3) !important}' +
      '[data-theme="light"] .s7-source-sync:hover{background:rgba(124,58,237,0.15) !important}' +
      '[data-theme="light"] .s7-source-row strong{color:#1e293b !important}' +
      '[data-theme="light"] .s7-source-row span,[data-theme="light"] .s7-source-account small{color:#64748b !important}' +
      '[data-theme="light"] .sfe-wrapper{background:#f8fafc !important;border-color:#cbd5e1 !important;color:#1e293b !important}' +
      '[data-theme="light"] .sfe-header{border-bottom-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-header-title{color:#1e293b !important}' +
      '[data-theme="light"] .sfe-header-sub{color:#64748b !important}' +
      '[data-theme="light"] .sfe-reset-btn{border-color:#cbd5e1 !important;color:#64748b !important}' +
      '[data-theme="light"] .sfe-reset-btn:hover{background:#f1f5f9 !important;color:#1e293b !important}' +
      '[data-theme="light"] .sfe-panel{background:#ffffff !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-panel-label{border-bottom-color:#cbd5e1 !important;color:#64748b !important}' +
      '[data-theme="light"] .sfe-label{color:#64748b !important}' +
      '[data-theme="light"] .sfe-input-wrap2{background:#ffffff !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-input-unit2{color:#64748b !important;border-left-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-score-block{background:#ffffff !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-gauge-bar-wrap{background:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-be-row{background:#f8fafc !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-be-kpi{color:#64748b !important}' +
      '[data-theme="light"] .sfe-be-arrow{color:#94a3b8 !important}' +
      '[data-theme="light"] .sfe-be-subtitle{color:#64748b !important}' +
      '[data-theme="light"] .sfe-scenario-section{background:#ffffff !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-table th{color:#64748b !important;border-bottom-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-table td{color:#1e293b !important;border-bottom-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-table td:first-child{color:#1e293b !important}' +
      '[data-theme="light"] .sfe-table tr.sfe-row-current td{background:rgba(124,58,237,0.06) !important;color:#7c3aed !important}' +
      '[data-theme="light"] .sfe-table tr.sfe-row-current td:first-child{color:#7c3aed !important;font-weight:var(--weight-semibold) !important}' +
      '[data-theme="light"] .sfe-insight-text{color:#64748b !important}' +
      '[data-theme="light"] .sfe-insight-text strong{color:#1e293b !important}' +
      '[data-theme="light"] .sfe-slider{background:#cbd5e1 !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-curr-tab{color:#64748b !important}' +
      '[data-theme="light"] .sfe-curr-tab:hover{background:#cbd5e1 !important;color:#1e293b !important;border-color:#cbd5e1 !important}' +
      '[data-theme="light"] .sfe-curr-tab.sfe-curr-active{background:rgba(124,58,237,0.08) !important;border-color:rgba(124,58,237,0.3) !important;color:#7c3aed !important;box-shadow:0 4px 12px rgba(124,58,237,0.15) !important}' +
      "</style>" +
      '<div class="s7-body dash-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "var(--bg)"
        : "#030712") +
      ";direction:" +
      (isAr ? "rtl" : "ltr") +
      ";font-family:var(--font-ui);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "var(--text)"
        : "#fff") +
      ';padding-bottom:40px">' +
      accountSourcePanelHtml() +
      // -- CALCULATOR SECTION ----------------------------------------------
      '<div style="display:flex;gap:24px;padding:24px 30px;align-items:flex-start">' +
      // Left: Inputs & Scenarios
      '<div style="width:360px;flex-shrink:0;display:flex;flex-direction:column;gap:20px">' +
      // Inputs Card
      '<div style="background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.06)") +
      ';border-radius:var(--dash-radius-xl);padding:24px">' +
      '<h3 style="margin:0 0 20px;font-size:var(--type-component-title);font-weight:var(--weight-semibold);text-align:center;display:flex;align-items:center;justify-content:center;gap:8px">' +
      s7Txt("Enter your campaign data", "أدخل بيانات حملتك") +
      ' <span aria-hidden="true">+</span></h3>' +
      '<div style="display:flex;flex-direction:column;gap:14px">' +
      // Budget input
      '<div class="s7-input-wrap">' +
      '<div class="s7-lbl">' +
      s7Txt("AD SPEND", "الإنفاق الإعلاني") +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<input type="text" inputmode="numeric" id="s7-in-budget" class="s7-input-num" placeholder="' +
      s7Txt("Enter campaign budget", "أدخل ميزانية الحملة") +
      '" />' +
      '<span id="s7-budget-curr-label" style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.4)") +
      ';letter-spacing:.06em;flex-shrink:0;min-width:36px">' +
      state.currency +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="s7-rate-note">' +
      '<strong>' +
      s7Txt("Exchange rates are global", "أسعار الصرف موحدة") +
      "</strong>" +
      '<span>' +
      s7Txt(
        "Use the Rates control in the dashboard top bar to refresh live rates or edit USD-based rates for all currencies.",
        "استخدم زر أسعار الصرف في شريط لوحة التحكم لتحديث الأسعار المباشرة أو تعديل أسعار الدولار لكل العملات.",
      ) +
      "</span>" +
      "</div>" +
      // Marketing sync uses the one authoritative dashboard period selector in the top bar.
      '<div class="s7-sync-period">' +
      '<div class="s7-lbl">' +
      s7Txt("Marketing Spend Date Filter", "فلتر تاريخ الإنفاق التسويقي") +
      "</div>" +
      '<div class="s7-sync-period-range">' +
      escapeSourceText(selectedDashboardPeriodLabel()) +
      "</div>" +
      '<div class="s7-sync-period-note">' +
      s7Txt(
        "Selecting a period from the top dashboard bar syncs connected marketing automatically. Update Dashboard also refreshes marketing after fetching live order data.",
        "اختيار فترة من شريط لوحة التحكم العلوي يزامن التسويق المتصل تلقائيا. تحديث لوحة التحكم يحدّث التسويق أيضا بعد جلب بيانات الطلبات المباشرة.",
      ) +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      // Real Bot Data
      '<div style="background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.06)") +
      ';border-radius:var(--dash-radius-xl);padding:24px">' +
      '<div style="font-size:var(--type-control);font-weight:var(--weight-semibold);display:flex;align-items:center;gap:8px;margin-bottom:16px"><span style="color:#f59e0b">' + S7_ICONS.delivered + '</span> ' +
      s7Txt("Real Bot Indicators", "مؤشرات البوت الحقيقية") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      // Taager dashboard/status/NDR migration:
      // Average profit comes from Taager order profit minus tax profit, not sales revenue.
      _kpiMiniTip(
        s7Txt("Net Orders", "صافي الطلبات"),
        s7Num(realTotalOrders),
        document.documentElement.getAttribute("data-theme") === "light"
          ? "#1e293b"
          : "#fff",
        S7_ICONS.orders,
        s7Txt("Net Orders", "صافي الطلبات"),
        s7Txt(
          "Total number of orders received from the bot during the selected period.",
          "إجمالي عدد الطلبات المستلمة من البوت خلال الفترة المحددة.",
        ),
        null,
      ) +
      _kpiMiniTip(
        s7Txt("Confirmed Orders", "الطلبات المؤكدة"),
        s7Num(realConfirmedOrders),
        "#3b82f6",
        "✓",
        s7Txt("Confirmed Orders", "الطلبات المؤكدة"),
        s7Txt(
          "Orders that passed confirmation and are part of the confirmation base.",
          "الطلبات التي تم تأكيدها وتدخل ضمن قاعدة التأكيد.",
        ),
        "confirmedOrders = netOrders * confirmationRate",
      ) +
      _kpiMiniTip(
        s7Txt("Delivered Orders", "الطلبات المسلمة"),
        '<span id="s7-real-delivered-orders">' + s7Num(realExpectedDvl) + '</span>',
        document.documentElement.getAttribute("data-theme") === "light"
          ? "#10b981"
          : "#00e676",
        S7_ICONS.delivered,
        s7Txt("Delivered Orders", "الطلبات المسلمة"),
        s7Txt(
          isExpectedRateMode
            ? "Forecast delivered orders from net orders x delivery rate."
            : "Orders that actually reached the customer, counted from delivered sheet status.",
          "طلبات وصلت للعميل بناء على معدل التسليم. محسوبة من صافي الطلبات × معدل التسليم.",
        ),
        isExpectedRateMode ? "delivered = netOrders * NDR%" : "delivered = sheet delivered status",
      ) +
      _kpiMiniTip(
        s7Txt("Orders Out for Delivery", "عدد الطلبات قيد التوصيل"),
        s7Num(realShippingOrders),
        "#14b8a6",
        "↗",
        s7Txt("Orders Out for Delivery", "عدد الطلبات قيد التوصيل"),
        s7Txt(
          "Orders whose exact current status is Out for delivery.",
          "عدد الطلبات التي حالتها الحالية قيد التوصيل.",
        ),
        "outForDeliveryOrders = count(status: shipping)",
      ) +
      _kpiMiniTip(
        s7Txt("Delivery Rate NDR", "معدل التسليم NDR"),
        '<span id="s7-real-ndr-pct">' + s7PctValue(realNdrPct) + "%</span>",
        "#f59e0b",
        S7_ICONS.target,
        s7Txt("Delivery Rate (NDR)", "معدل التسليم (NDR)"),
        s7Txt(
          "Percentage of orders delivered successfully. Healthy benchmark starts at 30%, with top tier at 40%+.",
          "نسبة الطلبات التي تم تسليمها بنجاح. يبدأ المعيار الصحي من 30%، والمستوى الأعلى عند 40% أو أكثر.",
        ),
        "NDR = deliveredOrders / netOrders * 100",
      ) +
      _kpiMiniTip(
        s7Txt("Confirmation Rate", "نسبة التأكيد"),
        realConfirmationRate.toFixed(1) + "%",
        "#22d3ee",
        "✓",
        s7Txt("Confirmation Rate", "نسبة التأكيد"),
        s7Txt(
          "Confirmed orders divided by net placed orders.",
          "الطلبات المؤكدة مقسومة على صافي الطلبات.",
        ),
        "confirmationRate = confirmedOrders / netOrders * 100",
      ) +
      _kpiMiniTip(
        s7Txt("Average Profit", "متوسط الربح") + (realAverageProfitSource === 'net_orders_fallback' ? ' · ' + s7Txt('Estimated from net orders', 'تقديري من صافي الطلبات') : ''),
        '<span id="s7-real-average-profit">' + realAvgCommission.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + nativeCurrency + "</span>",
        "#3b82f6",
        S7_ICONS.money,
        s7Txt("Average Profit", "متوسط الربح"),
        s7Txt(
          realAverageProfitSource === 'net_orders_fallback' ? "Estimated average profit from net orders because there are no delivered orders in the selected period." : "Average profit per delivered order in the selected period.",
          realAverageProfitSource === 'net_orders_fallback' ? "متوسط ربح تقديري من صافي الطلبات لعدم وجود طلبات مسلمة في الفترة المحددة." : "متوسط الربح لكل طلب مسلم في الفترة المحددة.",
        ),
        realAverageProfitSource === 'net_orders_fallback' ? "estimatedAverageProfit = netOrderProfitAfterTax / netOrders" : "averageProfit = earnedProfitAfterTax / deliveredOrders",
      ) +
      "</div>" +
      "</div>" +
      // Scenarios Table
      '<div style="background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.06)") +
      ';border-radius:var(--dash-radius-xl);padding:20px">' +
      '<div style="font-size:var(--type-control);font-weight:var(--weight-semibold);margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:#3b82f6">' + S7_ICONS.lightning + '</span> ' +
      s7Txt("Quick Budget Scenarios", "سيناريوهات ميزانية سريعة") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 0.7fr;text-align:center;padding-bottom:10px;border-bottom:1px solid ' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.08)") +
      ";font-size:var(--type-caption);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.4)") +
      ';font-weight:var(--weight-bold)">' +
      "<span>" +
      s7Txt("Scenario", "السيناريو") +
      "</span><span>" +
      s7Txt("Budget", "الميزانية") +
      "</span><span>" +
      s7Txt("Net Profit", "صافي الربح") +
      "</span><span>ROI</span>" +
      "</div>" +
      '<div id="s7-scen-list" style="margin-top:8px"></div>' +
      "</div>" +
      "</div>" +
      // Right: Results & Charts
      '<div style="flex:1;display:flex;flex-direction:column;gap:20px;min-width:0">' +
      // Header & Currency Tabs — exact match to screenshot
      '<div style="display:flex;align-items:center;justify-content:space-between;background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";padding:14px 22px;border-radius:var(--dash-radius-xl);border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      '">' +
      '<div style="display:flex;align-items:center;gap:9px;font-size:var(--type-component-title);font-weight:var(--weight-semibold);letter-spacing:-.01em">' +
      '<span style="color:#f5a623;font-size:var(--type-component-title)">' + S7_ICONS.target + '</span>' +
      '<span style="color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      '">' +
      s7Txt("Budget Forecast Results", "نتائج توقع الميزانية") +
      "</span>" +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;justify-content:flex-end">' +
      currencyTabsHtml("s7-tab", "active", "data-curr", state.currency) +
      "</div>" +
      "</div>" +
      // Top KPI cards
      '<div class="s7-kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px">' +
      '<div class="s7-card"><div style="font-size:var(--type-label);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ';font-weight:var(--weight-bold);display:flex;align-items:center;gap:5px">' +
      s7Txt("Total Spend", "إجمالي الإنفاق") +
      " " +
      _tip(
        S7_ICONS.spend,
        s7Txt("Total Spend", "إجمالي الإنفاق"),
        s7Txt(
          "Calculator spend after converting the entered or synced spend into the selected calculator currency.",
          "إنفاق الحاسبة بعد تحويل الإنفاق المدخل أو المتزامن إلى عملة الحاسبة المحددة.",
        ),
        "calculatorSpend = convert(spend, sourceCurrency -> calculatorCurrency)",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:var(--type-metric-sm);font-weight:var(--weight-semibold)"><span>' + S7_ICONS.spend + '</span><span id="s7-out-spend">--</span></div><div class="s7-curr-lbl" style="font-size:var(--type-micro);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:var(--dash-radius-md)">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:var(--type-label);color:#a855f7;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:5px">' +
      s7Txt("Cost per Order CPA", "تكلفة الطلب CPA") +
      " " +
      _tip(
        S7_ICONS.cost,
        s7Txt("Cost per Order (CPA)", "تكلفة الطلب (CPA)"),
        s7Txt(
          "Cost to acquire one order. Lower CPA means the campaign is more efficient.",
          "تكلفة اكتساب طلب واحد. انخفاض CPA يعني أن الحملة أكثر كفاءة.",
        ),
        "CPA = adSpend / netOrders",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:var(--type-metric-sm);font-weight:var(--weight-semibold)"><span style="color:#a855f7">' + S7_ICONS.cost + '</span><span id="s7-out-cpa">--</span></div><div class="s7-curr-lbl" style="font-size:var(--type-micro);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:var(--dash-radius-md)">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:var(--type-label);color:#f59e0b;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:5px">' +
      s7Txt("Break-even CPA", "تكلفة التعادل") +
      " " +
      _tip(
        S7_ICONS.target,
        s7Txt("Break-even CPA", "تكلفة التعادل"),
        s7Txt(
          "Maximum CPA before the campaign starts losing money. This simulator uses the editable Taager profit per delivered order assumption multiplied by NDR.",
          "أقصى تكلفة طلب قبل أن تبدأ الحملة في خسارة المال. يستخدم هذا المحاكي افتراض ربح Taager القابل للتعديل لكل طلب مسلم مضروبا في NDR.",
        ),
        "Break-even CPA = taagerProfitPerDeliveredOrder * NDR",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:var(--type-metric-sm);font-weight:var(--weight-semibold)"><span style="color:#f59e0b">' + S7_ICONS.target + '</span><span id="s7-out-breakeven-cpa">--</span></div><div class="s7-curr-lbl" style="font-size:var(--type-micro);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:var(--dash-radius-md)">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:var(--type-label);color:#3b82f6;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:5px">' +
      s7Txt("Total Profit Before Ad Spend", "إجمالي الربح قبل الإنفاق الإعلاني") +
      " " +
      _tip(
        S7_ICONS.money,
        s7Txt("Total Profit Before Ad Spend", "إجمالي الربح قبل الإنفاق الإعلاني"),
        s7Txt(
          isExpectedRateMode
            ? "Expected delivered orders multiplied by the editable average profit per delivered order."
            : "Actual earned profit after tax from delivered orders before subtracting synced ad spend.",
          "الطلبات المسلمة المتوقعة × متوسط الربح لكل طلب.",
        ),
        isExpectedRateMode
          ? "totalProfitBeforeAdSpend = expectedDeliveriesExact * averageProfitPerDeliveredOrder"
          : "totalProfitBeforeAdSpend = actualEarnedProfitAfterTax",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:var(--type-metric-sm);font-weight:var(--weight-semibold)"><span style="color:#3b82f6">' + S7_ICONS.money + '</span><span id="s7-out-revenue">--</span></div><div class="s7-curr-lbl" style="font-size:var(--type-micro);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:var(--dash-radius-md)">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:var(--type-label);color:#00e676;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:5px">' +
      s7Txt("Account Net Profit", "صافي ربح الحساب") +
      " " +
      _tip(
        S7_ICONS.profit,
        s7Txt("Account Net Profit", "صافي ربح الحساب"),
        s7Txt(
          "Whole-account profit after subtracting total synced ad spend. This can differ from SKU-matched Campaigns profit.",
          "ربح الحساب بالكامل بعد طرح إجمالي الإنفاق الإعلاني المتزامن. قد يختلف هذا عن ربح الحملات المطابق للمنتجات.",
        ),
        "netProfit = revenue - adSpend",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:var(--type-metric-sm);font-weight:var(--weight-semibold)"><span style="color:#00e676">' + S7_ICONS.profit + '</span><span id="s7-out-net" dir="ltr">--</span></div><div class="s7-curr-lbl" style="font-size:var(--type-micro);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:var(--dash-radius-md)">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:var(--type-label);color:#10b981;font-weight:var(--weight-semibold);display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap">' +
      s7Txt("Net Total Delivered Sales", "صافي مبيعات الطلبات المسلمة") +
      " " +
      _tip(
        S7_ICONS.money,
        s7Txt("Net Total Delivered Sales", "صافي مبيعات الطلبات المسلمة"),
        s7Txt(
          "Same dashboard metric used in the overview: net delivered sales for delivered net orders only.",
          "نفس مؤشر لوحة التحكم في النظرة العامة: صافي مبيعات الطلبات المسلمة للطلبات الصافية المسلمة فقط.",
        ),
        "netDeliveredSales = sum(delivered net order sales)",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:var(--type-metric-sm);font-weight:var(--weight-semibold);min-width:0"><span style="color:#10b981">' + S7_ICONS.money + '</span><span id="s7-out-delivered-sales" dir="ltr">--</span></div><div class="s7-curr-lbl" style="font-size:var(--type-micro);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:var(--dash-radius-md)">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:var(--type-label);color:#38bdf8;font-weight:var(--weight-semibold);display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap">' +
      s7Txt("Average Order Value (Delivered)", "متوسط قيمة الطلب المسلم") +
      " " +
      _tip(
        S7_ICONS.receipt,
        s7Txt("Average Order Value (Delivered)", "متوسط قيمة الطلب المسلم"),
        s7Txt(
          "Same dashboard metric used in the overview: net delivered sales divided by delivered orders.",
          "نفس مؤشر لوحة التحكم في النظرة العامة: صافي المبيعات المسلمة مقسوم على الطلبات المسلمة.",
        ),
        "deliveredAOV = netDeliveredSales / deliveredOrders",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:var(--type-metric-sm);font-weight:var(--weight-semibold);min-width:0"><span style="color:#38bdf8">' + S7_ICONS.receipt + '</span><span id="s7-out-delivered-aov" dir="ltr">--</span></div><div class="s7-curr-lbl" style="font-size:var(--type-micro);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:var(--dash-radius-md)">' +
      state.viewCurrency +
      "</div></div>" +
      "</div>" +
      // Gauge & Summary
      '<div style="display:flex;background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.06)") +
      ';border-radius:var(--dash-radius-xl);overflow:hidden">' +
      '<div style="flex:1;padding:24px;display:flex;flex-direction:column;align-items:center;position:relative">' +
      '<div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);margin-bottom:12px;display:flex;align-items:center;gap:8px">' +
      s7Txt("Return on Investment (ROI)", "العائد على الاستثمار (ROI)") +
      " " +
      _tip(
        S7_ICONS.target,
        s7Txt("Return on Investment (ROI)", "العائد على الاستثمار (ROI)"),
        s7Txt(
          "Measures campaign profitability. Zero means break-even, positive means profit, negative means loss.",
          "يقيس ربحية الحملة. الصفر يعني التعادل، والموجب يعني ربحا، والسالب يعني خسارة.",
        ),
        "ROI = (netProfit / adSpend) * 100%",
      ) +
      "</div>" +
      '<div id="s7-gauge-wrap" style="width:100%;max-width:340px"></div>' +
      "</div>" +
      '<div style="flex:1;padding:24px;border-left:1px solid ' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.06)") +
      ';display:flex;flex-direction:column;justify-content:center;gap:12px">' +
      '<div style="display:flex;flex-direction:column">' +
      '<div style="font-size:var(--type-label);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.6)") +
      ';font-weight:var(--weight-bold);margin-bottom:6px;display:flex;align-items:center;gap:5px" id="s7-roas-text">' +
      s7Txt("For each 1 ", "لكل 1 ") + state.currency + s7Txt(" spent", " يتم إنفاقه") +
      " " +
      _tip(
        S7_ICONS.profit,
        s7Txt("Return per Currency Unit (ROAS)", "العائد لكل وحدة عملة (ROAS)"),
        s7Txt(
          "For each unit spent, how much revenue do you get back? More than 1 means revenue exceeds spend.",
          "لكل وحدة يتم إنفاقها، كم إيرادا يعود لك؟ أكبر من 1 يعني أن الإيراد يتجاوز الإنفاق.",
        ),
        "ROAS = revenue / adSpend",
      ) +
      "</div>" +
      '<div style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:#00e676" id="s7-out-return">--</div>' +
      '<div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:#22d3ee;margin-top:6px;display:flex;align-items:center;gap:5px" id="s7-net-roas-row"><span id="s7-out-net-roas">--</span> ' +
      _tip(
        S7_ICONS.money,
        s7Txt("Net ROAS", "العائد الصافي على الإعلان"),
        s7Txt(
          "Actual delivered sales divided by ad spend. This ignores pending and canceled orders.",
          "المبيعات المسلمة الفعلية مقسومة على الإنفاق الإعلاني. يتجاهل هذا الطلبات المعلقة والملغاة.",
        ),
        "Net ROAS = deliveredSales / adSpend",
      ) +
      "</div>" +
      "</div>" +
      '<div id="s7-smart-tip-wrap" style="background:linear-gradient(135deg,rgba(0,230,118,0.1),transparent);border:1px solid rgba(0,230,118,0.2);border-radius:var(--dash-radius-md);padding:14px;display:flex;gap:12px;align-items:flex-start">' +
      '<div style="font-size:var(--type-metric-sm);margin-top:2px">' + S7_ICONS.idea + '</div>' +
      "<div>" +
      '<div style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:#00e676;margin-bottom:4px">' +
      s7Txt("Campaign Status", "حالة الحملة") +
      "</div>" +
      '<div style="font-size:var(--type-caption);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.7)") +
      ';line-height:1.7" id="s7-smart-tip">--</div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      // Growth Chart
      '<div style="background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.06)") +
      ';border-radius:var(--dash-radius-xl);padding:24px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:16px;flex-wrap:wrap">' +
      '<div><div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);display:flex;align-items:center;gap:8px"><span style="color:#00e676">' + S7_ICONS.profit + '</span> ' +
      s7Txt("Budget Scenario Forecast", "توقع سيناريو الميزانية") +
      "</div>" +
      '<div style="font-size:var(--type-caption);color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.48)") +
      ';margin-top:4px">' +
      s7Txt("X-axis shows budget multiples. Hover any point to see the exact budget.", "المحور الأفقي يعرض مضاعفات الميزانية. مرر على أي نقطة لرؤية الميزانية الدقيقة.") +
      "</div></div>" +
      '<div style="display:flex;gap:16px;font-size:var(--type-caption);font-weight:var(--weight-semibold);min-height:22px;align-items:center">' +
      '<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:linear-gradient(135deg,#ef4444,#00e676);border-radius:3px;box-shadow:0 0 8px rgba(0,230,118,.35);display:inline-block"></span>' +
      s7Txt("Net Result", "صافي النتيجة") +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:#3b82f6;border-radius:3px;box-shadow:0 0 8px #3b82f6;display:inline-block"></span>' +
      s7Txt("Orders", "الطلبات") +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div style="position:relative;height:240px;width:100%"><canvas id="s7-growth-chart"></canvas></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      // -- SMART FORECASTING ENGINE SECTION --------------------------------
      '<div style="padding:0 30px 30px">' +
      '<div id="s7-simulator-section" class="sfe-wrapper">' +
      // SFE Header — Budget Forecast Results bar + title
      '<div style="display:flex;align-items:center;justify-content:space-between;background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.03)") +
      ";padding:14px 22px;border-radius:var(--dash-radius-lg);border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ';margin-bottom:20px">' +
      '<div style="display:flex;align-items:center;gap:9px;font-size:var(--type-component-title);font-weight:var(--weight-semibold);letter-spacing:-.01em">' +
      '<span style="color:#f5a623;font-size:var(--type-component-title)">' + S7_ICONS.target + '</span>' +
      '<span style="color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      '">' +
      s7Txt("Budget Forecast Results", "نتائج توقع الميزانية") +
      "</span>" +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;justify-content:flex-end">' +
      currencyTabsHtml("sfe-curr-tab", "sfe-curr-active", "data-sfecurr", state.currency) +
      "</div>" +
      "</div>" +
      '<div class="sfe-header">' +
      "<div>" +
      '<div class="sfe-header-badge">' +
      s7Txt("SMART FORECASTING ENGINE", "محرك التوقع الذكي") +
      "</div>" +
      '<div class="sfe-header-title">' +
      s7Txt("Profitability Optimization Studio", "استوديو تحسين الربحية") +
      "</div>" +
      '<div class="sfe-header-sub">' +
      s7Txt(
        "Simulate KPI changes · Detect break-even thresholds · Validate scaling safety",
        "محاكاة تغييرات المؤشرات · اكتشاف حدود التعادل · التحقق من أمان التوسع",
      ) +
      "</div>" +
      "</div>" +
      '<div class="sfe-header-right">' +
      '<div class="sfe-sim-badge" id="sfe-sim-badge" style="display:none">' +
      '<span class="sfe-sim-dot"></span>' +
      s7Txt("SIMULATION MODE — local only", "وضع المحاكاة - محلي فقط") +
      "</div>" +
      '<button class="sfe-reset-btn" id="sfe-reset-btn">' + S7_ICONS.reset + ' ' +
      s7Txt("Reset to Real Data", "إعادة البيانات الحقيقية") +
      "</button>" +
      "</div>" +
      "</div>" +
      // SFE Metrics Strip
      '<div class="sfe-metrics-strip" id="sfe-metrics-strip"></div>' +
      // SFE Body: Controls + Intelligence
      '<div class="sfe-body-grid">' +
      // LEFT: Simulation Controls
      '<div class="sfe-panel">' +
      '<div class="sfe-panel-label">' +
      s7Txt("SIMULATION CONTROLS", "تحكم المحاكاة") +
      "</div>" +
      '<div class="sfe-control-group">' +
      '<div class="sfe-control-pair">' +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Net Orders", "صافي الطلبات") +
      "</label>" +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-orders" class="sfe-input2" min="1" step="1"><span class="sfe-input-unit2">' +
      s7Txt("orders", "طلبات") +
      "</span></div>" +
      "</div>" +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Delivered Orders", "الطلبات المسلمة") +
      "</label>" +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-delivered-orders" class="sfe-input2" min="0" step="1"><span class="sfe-input-unit2">' +
      s7Txt("orders", "طلبات") +
      "</span></div>" +
      "</div>" +
      "</div>" +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Ad Spend", "الإنفاق الإعلاني") +
      ' <span class="sfe-label-hint" style="font-size:var(--type-micro);color:#8b8fa8">' +
      s7Txt("used for CPA & ROI", "يستخدم في CPA و ROI") +
      "</span></label>" +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-adspend" class="sfe-input2" min="0" step="500"><span class="sfe-input-unit2" id="sfe-lbl-adspend-curr">' +
      state.currency +
      "</span></div>" +
      "</div>" +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Net Delivery Rate", "معدل التسليم الصافي") +
      ' <span class="sfe-label-hint" id="sfe-ndr-hint">0%</span></label>' +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-ndr" class="sfe-input2" min="0" max="100" step="any" inputmode="decimal"><span class="sfe-input-unit2">%</span></div>' +
      '<div class="sfe-health-scale" aria-hidden="true"></div>' +
      '<div class="sfe-slider-markers">' +
      '<span class="sfe-marker sfe-marker--danger">' +
      s7Txt("DANGER", "خطر") +
      "<br>20%</span>" +
      '<span class="sfe-marker sfe-marker--mid">' +
      s7Txt("MARKET", "السوق") +
      "<br>30%</span>" +
      '<span class="sfe-marker sfe-marker--safe">' +
      s7Txt("SAFE", "آمن") +
      "<br>40%+</span>" +
      "</div>" +
      bestNdrCycleCardHtml() +
      "</div>" +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Average Profit / Delivered Order", "متوسط الربح لكل طلب مسلم") +
      ' <span class="sfe-label-hint" id="sfe-comm-hint">0 ' + state.currency + '</span></label>' +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-comm" class="sfe-input2" min="0" step="0.5" inputmode="decimal"><span class="sfe-input-unit2" id="sfe-lbl-comm-curr">' + state.currency + '</span></div>' +
      "</div>" +
      '<div class="sfe-global-rate-note">' +
      '<strong>' + s7Txt("Global exchange rates", "أسعار الصرف العامة") + "</strong>" +
      '<span>' + s7Txt("Refresh or edit currency rates from the dashboard top bar.", "حدّث أو عدّل أسعار العملات من شريط لوحة التحكم العلوي.") + "</span>" +
      "</div>" +
      "</div>" +
      "</div>" +
      // RIGHT: Intelligence Engine
      '<div class="sfe-panel">' +
      '<div class="sfe-panel-label">' +
      s7Txt("INTELLIGENCE ENGINE", "محرك الذكاء") +
      "</div>" +
      '<div class="sfe-score-row">' +
      '<div class="sfe-score-block" id="sfe-profit-score"></div>' +
      '<div class="sfe-score-block" id="sfe-risk-score"></div>' +
      "</div>" +
      '<div class="sfe-breakeven-panel" id="sfe-breakeven"></div>' +
      '<div class="sfe-insights-feed" id="sfe-insights-feed"></div>' +
      "</div>" +
      "</div>" +
      // SFE Scenario Table
      '<div class="sfe-scenario-section">' +
      '<div class="sfe-panel-label">' +
      s7Txt("ADVANCED SCENARIO PROJECTIONS", "توقعات السيناريوهات المتقدمة") +
      "</div>" +
      '<div style="overflow-x:auto" id="sfe-scenario-table"></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    wireCalcEvents();
    wireSimEvents();
    focusSimulatorSectionIfRequested();

    // Initialize premium caret-preserving MoneyInput on Ad Spend budget field
    var budgetInput = document.getElementById("s7-in-budget");
    initMoneyInput(budgetInput, state.budget, function (val) {
      if (syncedSpendActive) {
        state.budget = Number(d.adSpend || 0);
        budgetInput.value = Math.round(state.budget).toLocaleString("en-US");
        return;
      }
      state.budget = val;
      scheduleCalculatorSettingsPersist();
      scheduleCalcUI();
    });
    if (budgetInput && syncedSpendActive) {
      budgetInput.disabled = true;
      budgetInput.setAttribute(
        "aria-label",
        s7Txt(
          "Ad spend synced from marketing platforms and locked",
          "الإنفاق الإعلاني متزامن من منصات التسويق ومقفل",
        ),
      );
    }
    var spendModeButton = document.getElementById("s7-spend-mode-btn");
    if (spendModeButton && window.DashboardMarketingState) {
      spendModeButton.addEventListener("click", function () {
        window.DashboardMarketingState.useManualSpend(
          syncedSpendActive,
          calculatorAccountId,
        );
      });
    }
    var sourceSyncButton = document.getElementById("s7-source-sync-now");
    if (
      sourceSyncButton &&
      window.DashboardMarketingState &&
      typeof window.DashboardMarketingState.sync === "function"
    ) {
      sourceSyncButton.addEventListener("click", function () {
        var period = dashboardPeriod || {};
        sourceSyncButton.disabled = true;
        sourceSyncButton.textContent = s7Txt("Syncing...", "Syncing...");
        window.DashboardMarketingState.sync(calculatorAccountId, {
          dateFrom: period.from || period.dateFrom || period.start || "",
          dateTo: period.to || period.dateTo || period.end || "",
          targetCurrency: state.currency || window.dashboardActiveCurrency || "SAR",
          egpRate: window.TaagerCurrency && typeof window.TaagerCurrency.rates === "function"
            ? Number((window.TaagerCurrency.rates() || {}).EGP) || state.egpRate || 52
            : state.egpRate || 52,
          exchangeRates: window.TaagerCurrency && typeof window.TaagerCurrency.rates === "function"
            ? window.TaagerCurrency.rates()
            : {},
        });
      });
    }
    var useBestCycleBtn = document.getElementById("s7-use-best-ndr-cycle");
    if (useBestCycleBtn) {
      useBestCycleBtn.addEventListener("click", function () {
        orderNdrSourceKey = "best_cycle";
        mountEl._s7OrderNdrSourceKey = "best_cycle";
        applyOrderNdrChoice(true);
        simState._ndrModified = false;
        var ndrInput = document.getElementById("sfe-ndr");
        if (ndrInput) ndrInput.value = s7RatioPctValue(simState.ndr);
        updateSimModifiedFlag();
        updateCalcUI();
        updateSimUI();
        scheduleCalcUI();
      });
    }
    var useActualCycleBtn = document.getElementById("s7-use-actual-ndr-cycle");
    if (useActualCycleBtn) {
      useActualCycleBtn.addEventListener("click", function () {
        window.DashboardBestNdrCyclePreferred = null;
        orderNdrSourceKey = "overall";
        mountEl._s7OrderNdrSourceKey = "overall";
        applyOrderNdrChoice(true);
        simState._ndrModified = false;
        var ndrInput = document.getElementById("sfe-ndr");
        if (ndrInput) ndrInput.value = s7RatioPctValue(simState.ndr);
        updateSimModifiedFlag();
        updateCalcUI();
        updateSimUI();
        scheduleCalcUI();
      });
    }

    updateCalcUI();
    initSimInputs();
    updateSimUI();
    initTooltips();
  }

  // -- Helper ------------------------------------------------------------------
  function _kpiMini(label, val, color) {
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var bg = isLight ? "#f8fafc" : "rgba(255,255,255,0.02)";
    var border = isLight ? "#cbd5e1" : "rgba(255,255,255,0.04)";
    var labelColor = isLight ? "#64748b" : "rgba(255,255,255,0.5)";
    return (
      '<div style="background:' +
      bg +
      ";border:1px solid " +
      border +
      ';border-radius:var(--dash-radius-md);padding:14px;text-align:center">' +
      '<div style="font-size:var(--type-caption);color:' +
      labelColor +
      ';margin-bottom:6px">' +
      label +
      "</div>" +
      '<div style="font-size:var(--type-section-title);font-weight:var(--weight-semibold);color:' +
      color +
      '">' +
      val +
      "</div>" +
      "</div>"
    );
  }

  function _kpiMiniTip(label, val, color, icon, tipTitle, tipDesc, tipFormula) {
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var bg = isLight ? "#f8fafc" : "rgba(255,255,255,0.02)";
    var border = isLight ? "#cbd5e1" : "rgba(255,255,255,0.04)";
    var labelColor = isLight ? "#64748b" : "rgba(255,255,255,0.5)";
    return (
      '<div style="background:' +
      bg +
      ";border:1px solid " +
      border +
      ';border-radius:var(--dash-radius-md);padding:14px;text-align:center;position:relative">' +
      '<div style="font-size:var(--type-caption);color:' +
      labelColor +
      ';margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:5px">' +
      label +
      " " +
      _tip(icon, tipTitle, tipDesc, tipFormula) +
      "</div>" +
      '<div style="font-size:var(--type-section-title);font-weight:var(--weight-semibold);color:' +
      color +
      '">' +
      val +
      "</div>" +
      "</div>"
    );
  }

  // -- Tooltip Helper — emits a badge only; JS positions tooltip from body ---
  function _tip(icon, title, desc, formula) {
    var f = formula ? formula : "";
    // Encode safely for HTML attribute (no single-quotes)
    function enc(s) {
      return s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    return (
      '<span class="s7-tip-badge" ' +
      'data-tip-icon="' +
      enc(icon) +
      '" ' +
      'data-tip-title="' +
      enc(title) +
      '" ' +
      'data-tip-desc="' +
      enc(desc) +
      '" ' +
      'data-tip-formula="' +
      enc(f) +
      '" aria-label="' +
      enc(title) +
      '"></span>'
    );
  }

  // -- Global tooltip engine (body-level, escapes overflow:hidden) ----------
  function initTooltips() {
    // Remove old instance if re-rendering
    var old = document.getElementById("s7-global-tooltip");
    if (old) old.parentNode.removeChild(old);
    if (mountEl._s7TooltipOver)
      document.removeEventListener("mouseover", mountEl._s7TooltipOver);
    if (mountEl._s7TooltipOut)
      document.removeEventListener("mouseout", mountEl._s7TooltipOut);

    // Build tooltip node with ALL styles inline — no CSS class dependency
    var tip = document.createElement("div");
    tip.id = "s7-global-tooltip";
    Object.assign(tip.style, {
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.18s ease, transform 0.18s ease",
      transform: "translateY(6px)",
      maxWidth: "270px",
      minWidth: "210px",
      display: "block",
      top: "0px",
      left: "0px",
      visibility: "visible",
    });

    tip.innerHTML =
      '<div id="s7-tip-inner" style="' +
      "background:rgba(8,12,24,0.98);" +
      "border:1px solid rgba(59,130,246,0.45);" +
      "border-radius:var(--dash-radius-lg);" +
      "padding:14px 16px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05) inset;" +
      "font-family:var(--font-ui);" +
      '">' +
      '<div id="s7-tip-title" style="font-size:var(--type-caption);font-weight:var(--weight-semibold);letter-spacing:.05em;color:#93c5fd;margin-bottom:7px;display:flex;align-items:center;gap:5px;direction:rtl"></div>' +
      '<div id="s7-tip-desc"  style="font-size:var(--type-label);color:rgba(255,255,255,0.75);line-height:1.65; margin-bottom:0"></div>' +
      '<div id="s7-tip-flbl"  style="display:none;font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.12em;color:rgba(255,255,255,0.25);text-transform:uppercase;margin-top:9px;margin-bottom:4px;direction:rtl"></div>' +
      '<div id="s7-tip-fbox"  style="display:none;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:var(--dash-radius-sm);padding:7px 10px;font-size:var(--type-caption);color:#60a5fa;font-family:var(--font-mono);direction:ltr;line-height:1.5;word-break:break-all"></div>' +
      "</div>" +
      '<div id="s7-tip-arrow" style="' +
      "position:absolute;" +
      "width:10px;height:10px;" +
      "background:rgba(8,12,24,0.98);" +
      "border-right:1px solid rgba(59,130,246,0.45);" +
      "border-bottom:1px solid rgba(59,130,246,0.45);" +
      "transform:rotate(45deg)" +
      '"></div>';

    document.body.appendChild(tip);

    var hideTimer;

    function showTip(badge) {
      clearTimeout(hideTimer);

      var icon = badge.getAttribute("data-tip-icon") || "";
      var title = badge.getAttribute("data-tip-title") || "";
      var desc = badge.getAttribute("data-tip-desc") || "";
      var formula = badge.getAttribute("data-tip-formula") || "";
      if (window.dashboardI18n) {
        icon = window.dashboardI18n.isQuestionMarkText && window.dashboardI18n.isQuestionMarkText(icon) ? "" : window.dashboardI18n.clean(icon);
        title = window.dashboardI18n.clean(title);
        desc = window.dashboardI18n.clean(desc);
        formula = window.dashboardI18n.clean(formula);
      }
      formula = formula
        .replace(/[\u00d7\u00c3\u2014]/g, "*")
        .replace(/[\u00f7\u00c3\u00b7]/g, "/")
        .replace(/[\u2212\u00e2\u02c6\u2019]/g, "-");

      var isLight =
        document.documentElement.getAttribute("data-theme") === "light";
      var tooltipBg = isLight ? "#ffffff" : "rgba(8,12,24,0.98)";
      var tooltipBorder = isLight ? "#3b82f6" : "rgba(59,130,246,0.45)";
      var tooltipTitleColor = isLight ? "#1d4ed8" : "#93c5fd";
      var tooltipDescColor = isLight ? "#334155" : "rgba(255,255,255,0.75)";
      var tooltipFlblColor = isLight ? "#64748b" : "rgba(255,255,255,0.25)";
      var tooltipFboxBg = isLight ? "#eff6ff" : "rgba(59,130,246,0.1)";
      var tooltipFboxBorder = isLight ? "#bfdbfe" : "rgba(59,130,246,0.25)";
      var tooltipFboxColor = isLight ? "#2563eb" : "#60a5fa";
      var tooltipShadow = isLight
        ? "0 12px 32px rgba(15,23,42,0.12)"
        : "0 12px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05) inset";

      var innerEl = document.getElementById("s7-tip-inner");
      var arrowEl = document.getElementById("s7-tip-arrow");
      var titleEl = document.getElementById("s7-tip-title");
      var descEl = document.getElementById("s7-tip-desc");
      var flbl = document.getElementById("s7-tip-flbl");
      var fbox = document.getElementById("s7-tip-fbox");

      if (innerEl) {
        innerEl.style.background = tooltipBg;
        innerEl.style.borderColor = tooltipBorder;
        innerEl.style.boxShadow = tooltipShadow;
      }
      if (arrowEl) {
        arrowEl.style.background = tooltipBg;
        arrowEl.style.borderRightColor = tooltipBorder;
        arrowEl.style.borderBottomColor = tooltipBorder;
      }
      if (titleEl) titleEl.style.color = tooltipTitleColor;
      if (descEl) descEl.style.color = tooltipDescColor;
      if (flbl) flbl.style.color = tooltipFlblColor;
      if (fbox) {
        fbox.style.background = tooltipFboxBg;
        fbox.style.borderColor = tooltipFboxBorder;
        fbox.style.color = tooltipFboxColor;
      }

      titleEl.textContent = (icon ? icon + " " : "") + title;
      descEl.textContent = desc;
      if (formula) {
        flbl.textContent = s7Txt("Formula", "المعادلة");
        flbl.style.display = "block";
        fbox.textContent = formula;
        fbox.style.display = "block";
        descEl.style.marginBottom = "0";
      } else {
        flbl.style.display = "none";
        fbox.style.display = "none";
      }

      // Reset to measure
      tip.style.opacity = "0";
      tip.style.transform = "translateY(6px)";
      tip.style.left = "0px";
      tip.style.top = "0px";

      requestAnimationFrame(function () {
        var br = badge.getBoundingClientRect();
        var tw = tip.offsetWidth || 240;
        var th = tip.offsetHeight || 120;
        var vw = window.innerWidth;
        var MARGIN = 12;
        var ARROW_H = 14;

        // Horizontal center on badge, clamped to viewport
        var cx = br.left + br.width / 2;
        var left = cx - tw / 2;
        if (left < MARGIN) left = MARGIN;
        if (left + tw > vw - MARGIN) left = vw - tw - MARGIN;

        // Prefer above; fall back to below
        var top = br.top - th - ARROW_H;
        var below = false;
        if (top < MARGIN) {
          top = br.bottom + ARROW_H;
          below = true;
        }

        tip.style.left = Math.round(left) + "px";
        tip.style.top = Math.round(top) + "px";

        // Arrow
        var arrow = document.getElementById("s7-tip-arrow");
        var arrowLeft = Math.max(10, Math.min(tw - 20, cx - left - 5));
        arrow.style.left = Math.round(arrowLeft) + "px";
        if (below) {
          arrow.style.bottom = "auto";
          arrow.style.top = "-5px";
          arrow.style.transform = "rotate(225deg)";
        } else {
          arrow.style.top = "auto";
          arrow.style.bottom = "-5px";
          arrow.style.transform = "rotate(45deg)";
        }

        // Show
        tip.style.opacity = "1";
        tip.style.transform = "translateY(0)";
      });
    }

    function hideTip() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        tip.style.opacity = "0";
        tip.style.transform = "translateY(6px)";
      }, 60);
    }

    // Single document-level listener — catches everything regardless of nesting
    mountEl._s7TooltipOver = function (e) {
      var badge = e.target.closest ? e.target.closest(".s7-tip-badge") : null;
      if (badge) showTip(badge);
    };
    mountEl._s7TooltipOut = function (e) {
      var badge = e.target.closest ? e.target.closest(".s7-tip-badge") : null;
      if (badge) hideTip();
    };
    document.addEventListener("mouseover", mountEl._s7TooltipOver);
    document.addEventListener("mouseout", mountEl._s7TooltipOut);
  }

  // -- Currency Select ---------------------------------------------------------
  function initCurrencySelect() {
    var wrap = document.getElementById("s7-currency-select");
    if (!wrap) return; // Currency select removed — currency controlled by tabs
    if (!wrap || typeof renderCustomSelect !== "function") {
      // Fallback: native select
      wrap.innerHTML =
        '<select id="s7-sel-currency" style="width:100%;background:var(--dash-surface);border:1px solid var(--dash-border-soft);border-radius:var(--dash-radius-sm);color:#fff;padding:10px;font-size:var(--type-control);font-weight:var(--weight-semibold);font-family:var(--font-ui)">' +
        supportedCurrencies().map(function (currency) {
          return '<option value="' + currency + '" ' +
            (state.currency === currency ? "selected" : "") +
            ">" + currency + "</option>";
        }).join("") +
        "</select>";
      document
        .getElementById("s7-sel-currency")
        .addEventListener("change", function (e) {
          var val = e.target.value;
          setCalculatorCurrency(val);
          persistCalculatorSettings();

          // Sync tabs classes
          mountEl.querySelectorAll(".s7-tab").forEach(function (tb) {
            tb.classList.toggle("active", tb.dataset.curr === val);
          });
          mountEl.querySelectorAll(".sfe-curr-tab").forEach(function (tfe) {
            tfe.classList.toggle(
              "sfe-curr-active",
              tfe.dataset.sfecurr === val,
            );
          });

          updateCalcUI();
          updateSimUI();
        });
      return;
    }
    var options = supportedCurrencies().map(function (currency) {
      return { value: currency, label: currency };
    });
    renderCustomSelect(wrap, options, state.currency, function (val) {
      setCalculatorCurrency(val);
      persistCalculatorSettings();

      // Update all main tab classes
      mountEl.querySelectorAll(".s7-tab").forEach(function (tb) {
        tb.classList.toggle("active", tb.dataset.curr === val);
      });

      // Update all SFE tabs classes
      mountEl.querySelectorAll(".sfe-curr-tab").forEach(function (tfe) {
        tfe.classList.toggle("sfe-curr-active", tfe.dataset.sfecurr === val);
      });

      updateCalcUI();
      updateSimUI();
    });
  }

  // -- Sim Inputs Init ---------------------------------------------------------
  function initSimInputs() {
    var inpOrders = document.getElementById("sfe-orders");
    var inpDelivered = document.getElementById("sfe-delivered-orders");
    var inpSpend = document.getElementById("sfe-adspend");
    var inpNdr = document.getElementById("sfe-ndr");
    var inpComm = document.getElementById("sfe-comm");
    if (inpOrders) inpOrders.value = simState.totalOrders;
    if (inpDelivered) inpDelivered.value = Math.round(computeSim().deliveredOrders);

    // Display SFE simulation spend converted from active currency to state.currency
    if (inpSpend)
      inpSpend.value = Math.round(
        convert(simState.adSpend, nativeCurrency || window.dashboardActiveCurrency || "SAR", state.currency),
      );

    if (inpNdr) inpNdr.value = s7RatioPctValue(simState.ndr);
    if (inpComm) inpComm.value = formatTwoDecimals(
      convert(simState.avgCommission, nativeCurrency || window.dashboardActiveCurrency || "SAR", state.currency),
    );
  }

  // -- Wire Calculator Events --------------------------------------------------
  function wireCalcEvents() {
    // Budget input event is now handled reactively by initMoneyInput formatter.
    var tabs = mountEl.querySelectorAll(".s7-tab");
    tabs.forEach(function (t) {
      t.addEventListener("click", function (e) {
        var curr = e.currentTarget.dataset.curr;
        setCalculatorCurrency(curr);
        persistCalculatorSettings();

        // Sync custom select
        initCurrencySelect();

        // Update all SFE tabs classes
        mountEl.querySelectorAll(".sfe-curr-tab").forEach(function (tfe) {
          tfe.classList.toggle("sfe-curr-active", tfe.dataset.sfecurr === curr);
        });

        // Update all main tab classes
        tabs.forEach(function (tb) {
          tb.classList.toggle("active", tb.dataset.curr === curr);
        });

        updateCalcUI();
        updateSimUI();
      });
    });
  }

  // -- Wire Simulation Events --------------------------------------------------
  function wireSimEvents() {
    function onChange() {
      updateSimModifiedFlag();
      updateSimUI();
    }

    var ordersEl = document.getElementById("sfe-orders");
    var deliveredEl = document.getElementById("sfe-delivered-orders");
    var spendEl = document.getElementById("sfe-adspend");
    var ndrEl = document.getElementById("sfe-ndr");
    var commEl = document.getElementById("sfe-comm");
    var resetBtn = document.getElementById("sfe-reset-btn");

    if (ordersEl)
      ordersEl.addEventListener("input", function (e) {
        simState.totalOrders = Math.max(1, parseInt(e.target.value) || 1);
        simState._ordersModified = true;
        onChange();
      });
    if (deliveredEl)
      deliveredEl.addEventListener("input", function (e) {
        var delivered = Math.max(0, Math.round(parseFloat(e.target.value) || 0));
        var total = Math.max(1, Number(simState.totalOrders) || 1);
        delivered = Math.min(total, delivered);
        simState.ndr = delivered / total;
        simState._ndrModified = true;
        if (String(e.target.value) !== String(delivered)) e.target.value = delivered;
        onChange();
      });
    if (spendEl)
      spendEl.addEventListener("input", function (e) {
        // User typed value in state.currency (e.g. USD) -> convert back to active currency internally
        var valInCurr = parseFloat(e.target.value) || 0;
        simState.adSpend = Math.max(
          0,
          convert(valInCurr, state.currency, nativeCurrency || window.dashboardActiveCurrency || "SAR"),
        );
        simState._adSpendModified = true;
        onChange();
      });
    if (ndrEl)
      ndrEl.addEventListener("input", function (e) {
        var ndrPct = Math.max(
          0,
          Math.min(100, parseFloat(e.target.value) || 0),
        );
        simState.ndr = ndrPct / 100;
        simState._ndrModified = true;
        onChange();
      });
    if (commEl)
      commEl.addEventListener("input", function (e) {
        var valueInCurrency = Math.max(0, parseFloat(e.target.value) || 0);
        simState.avgCommission = convert(
          valueInCurrency,
          state.currency,
          nativeCurrency || window.dashboardActiveCurrency || "SAR",
        );
        simState._avgCommissionModified = true;
        onChange();
      });
    if (resetBtn)
      resetBtn.addEventListener("click", function () {
        simState.totalOrders = realTotalOrders;
        simState.ndr = realNdrPct / 100;
        syncSimFinancialsFromRealData(true);
        simState.egpRate = d.egpRate != null ? d.egpRate : 52.0;
        simState.viewCurrency = state.currency; // Keep in sync with main currency
        simState._ordersModified = false;
        simState._ndrModified = false;
        simState._adSpendModified = false;
        simState._avgCommissionModified = false;
        simState._isModified = false;
        initSimInputs();
        updateSimUI();
      });

    // SFE currency tab clicks
    mountEl.querySelectorAll(".sfe-curr-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var curr = tab.dataset.sfecurr;
        setCalculatorCurrency(curr);
        persistCalculatorSettings();

        // Sync custom select
        initCurrencySelect();

        // Update all main tab classes
        mountEl.querySelectorAll(".s7-tab").forEach(function (tb) {
          tb.classList.toggle("active", tb.dataset.curr === curr);
        });

        // Update all SFE tabs classes
        mountEl.querySelectorAll(".sfe-curr-tab").forEach(function (tfe) {
          tfe.classList.toggle("sfe-curr-active", tfe.dataset.sfecurr === curr);
        });

        updateCalcUI();
        updateSimUI();
      });
    });
  }

  // -- Init --------------------------------------------------------------------
  render();
  if (window.DashboardMarketingState) {
    if (mountEl._s7MarketingListener) {
      window.DashboardMarketingState.unsubscribe(mountEl._s7MarketingListener);
    }
    mountEl._s7MarketingListener = function (next) {
      if (ctx && ctx.sectionId && ctx.sectionId !== "calculator") return;
      if (!next || String(next.accountId) !== String(calculatorAccountId))
        return;
      if (mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      window.renderSection7HydratedEntry(mountEl, data, ctx);
    };
    window.DashboardMarketingState.subscribe(mountEl._s7MarketingListener);
    mountEl._dashboardSectionCleanup = function () {
      if (calcUpdateFrame != null) {
        cancelAnimationFrame(calcUpdateFrame);
        calcUpdateFrame = null;
      }
      if (calcUpdateTimer != null) {
        clearTimeout(calcUpdateTimer);
        calcUpdateTimer = null;
      }
      if (calcVisualTimer != null) {
        clearTimeout(calcVisualTimer);
        calcVisualTimer = null;
      }
      if (calcPersistTimer != null) {
        clearTimeout(calcPersistTimer);
        calcPersistTimer = null;
        persistCalculatorSettings();
      }
      if (mountEl._s7MarketingListener) {
        window.DashboardMarketingState.unsubscribe(
          mountEl._s7MarketingListener,
        );
        mountEl._s7MarketingListener = null;
      }
      if (mountEl._s7ThemeObserver) {
        mountEl._s7ThemeObserver.disconnect();
        mountEl._s7ThemeObserver = null;
      }
      if (mountEl._s7TooltipOver) {
        document.removeEventListener("mouseover", mountEl._s7TooltipOver);
        mountEl._s7TooltipOver = null;
      }
      if (mountEl._s7TooltipOut) {
        document.removeEventListener("mouseout", mountEl._s7TooltipOut);
        mountEl._s7TooltipOut = null;
      }
      var tooltip = document.getElementById("s7-global-tooltip");
      if (tooltip && tooltip.parentNode)
        tooltip.parentNode.removeChild(tooltip);
    };
    if (
      calculatorAccountId !== "__all__" &&
      mountEl._s7MarketingLoadedAccount !== calculatorAccountId
    ) {
      mountEl._s7MarketingLoadedAccount = calculatorAccountId;
      window.DashboardMarketingState.load(calculatorAccountId);
    }
  }
};
