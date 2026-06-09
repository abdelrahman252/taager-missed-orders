// -----------------------------------------------------------------------------
// section7-calculator.js — ROI Calculator + Smart Forecasting Engine
// Fully integrated: Calculator + Break-even Simulator + AI Insights
// -----------------------------------------------------------------------------

window.renderSection7 = function (mountEl, data, ctx) {
  "use strict";

  // -- Theme Observer ---------------------------------------------------------
  if (mountEl._s7ThemeObserver) {
    mountEl._s7ThemeObserver.disconnect();
    mountEl._s7ThemeObserver = null;
  }
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.attributeName === "data-theme") {
        window.renderSection7(mountEl, data, ctx);
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
    !marketingState.manualOverride
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
    console.log('[DIAGNOSTIC][S7] syncedSpendActive is active. Raw adSpend:', _rawSyncedSpend, 'Synced Currency:', _syncedCurrency, 'ROI Currency:', _roiCurrency);
    if (_syncedCurrency !== _roiCurrency) {
      if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
        _convertedSyncedSpend = window.TaagerCurrency.convert(_rawSyncedSpend, _syncedCurrency, _roiCurrency);
        console.log('[DIAGNOSTIC][S7] Conversion via window.TaagerCurrency.convert:', _convertedSyncedSpend);
      } else {
        var _rates = { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };
        var _fr = _rates[_syncedCurrency]; var _tr = _rates[_roiCurrency];
        if (_fr && _tr) _convertedSyncedSpend = (_rawSyncedSpend / _fr) * _tr;
        console.log('[DIAGNOSTIC][S7] Conversion via local rates fallback:', _convertedSyncedSpend);
      }
    }
    d = Object.assign({}, d, { adSpend: _convertedSyncedSpend });
  }
  var realTotalOrders = d.totalOrders != null ? Number(d.totalOrders) : 0;
  var realNdrPct = d.ndrPct != null ? Number(d.ndrPct) : 0;
  var realConfirmationRate = d.confirmationRate != null ? Number(d.confirmationRate) : 0;
  var realAvgCommission = d.avgCommission != null ? Number(d.avgCommission) : 0;
  var realTaagerProfitAfterTax = d.taagerProfitAfterTax != null
    ? Number(d.taagerProfitAfterTax)
    : realAvgCommission;
  var realExpectedDvl =
    d.deliveredCount != null
      ? Number(d.deliveredCount || 0)
      : Math.round((realNdrPct / 100) * realTotalOrders);

  // -- 2. State ----------------------------------------------------------------
  var nativeCurrency = window.dashboardActiveCurrency || (d && d.currency) || "SAR";
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
    adSpend: d.adSpend != null ? Number(d.adSpend) : 0,
    egpRate: d.egpRate != null ? d.egpRate : 52.0,
    viewCurrency: d.currency || nativeCurrency,
    _isModified: false,
  };

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
  function s7Num(value) {
    return Number(value || 0).toLocaleString(isAr ? "ar-SA" : "en-US");
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
        '<span style="font-size:9px;font-weight:700;letter-spacing:.04em;opacity:.75">' + currencyBadgeCode(currency) + '</span>' +
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

  function syncedBudgetInCurrency() {
    if (!sourceBreakdown.length)
      return Number(
        (marketingState &&
          marketingState.summary &&
          marketingState.summary.adSpend) ||
          0,
      );
    return Number(
      sourceBreakdown
        .reduce(function (total, source) {
          return (
            total +
            convert(
              Number(source.rawSpend || 0),
              source.currency || "SAR",
              state.currency,
            )
          );
        }, 0)
        .toFixed(2),
    );
  }

  function periodDate(value) {
    return String(value || "").slice(0, 10);
  }

  function periodRangeLabel(from, to) {
    if (from && to && from !== to) return from + " - " + to;
    if (from || to) return from || to;
    return s7Txt("Selected dashboard period", "???? ???? ?????? ???????");
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
      itemLabel: s7Txt("ad accounts", "?????? ???????"),
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
        var converted = convert(
          Number(source.rawSpend || 0),
          source.currency || "SAR",
          state.currency,
        );
        var hasSpend = source.rawSpend != null || source.convertedSpend != null;
        return (
          '<div class="s7-source-row">' +
          '<div class="s7-source-account"><strong>' +
          escapeSourceText(source.name || source.id) +
          "</strong><small>" +
          escapeSourceText(source.id) +
          "</small></div>" +
          "<div><span>" +
          s7Txt("Original spend", "??????? ??????") +
          "</span><strong>" +
          fmt(Number(source.rawSpend || 0), 2) +
          " " +
          escapeSourceText(source.currency || "") +
          "</strong></div>" +
          "<div><span>" +
          s7Txt("Converted for calculator", "??? ???????") +
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
      s7Txt("Advertising Sources", "????? ??????? ????????") +
      "</h3>" +
      "<p>" +
      s7Txt(
        "Original platform spend is converted into your calculator currency.",
        "????? ??? ??? ??? ?????? ??? ???? ???????.",
      ) +
      "</p></div>" +
      '<div class="s7-source-total"><span>' +
      s7Txt("Synced spend", "??????? ????????") +
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
        var converted = convert(
          Number(source.rawSpend || 0),
          source.currency || "SAR",
          state.currency,
        );
        var hasSpend = source.rawSpend != null || source.convertedSpend != null;
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
            ? fmt(Number(source.rawSpend || 0), 2) + " " + escapeSourceText(source.currency || "")
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
      s7Txt("Synced period", "?????? ?????????") +
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
    simState.adSpend = state.budget;
  }

  function fmt(n, dec) {
    dec = dec == null ? 1 : dec;
    return n.toLocaleString(undefined, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }

  // -- CurrencyBadge component helper ------------------------------------------
  function renderCurrencyBadge(containerEl, currency) {
    if (!containerEl) return;
    var cls = currency.toLowerCase();
    var label =
      currency === "SAR" ? s7Txt("SA", "?") : currency === "USD" ? "US" : "EG";

    var existingBadge = containerEl.querySelector(".s7-currency-badge");
    if (existingBadge) {
      if (existingBadge.dataset.curr === currency) return;
      existingBadge.className =
        "s7-currency-badge " + cls + " s7-currency-badge-animate";
      existingBadge.dataset.curr = currency;
      existingBadge.innerHTML =
        '<span style="font-size:8.5px;font-weight:800;letter-spacing:.02em;opacity:.75;margin-left:4px">' +
        label +
        "</span><span>" +
        currency +
        "</span>";

      existingBadge.style.animation = "none";
      existingBadge.offsetHeight; /* trigger reflow */
      existingBadge.style.animation = null;
    } else {
      containerEl.innerHTML =
        '<div class="s7-currency-badge ' +
        cls +
        ' s7-currency-badge-animate" data-curr="' +
        currency +
        '">' +
        '<span style="font-size:8.5px;font-weight:800;letter-spacing:.02em;opacity:.75;margin-left:4px">' +
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
    var deliveredSalesSAR = Number(d.totalDeliveredSales || d.deliveredSales || 0);
    var revSAR = realAvgCommission * realExpectedDvl;
    var netSAR = revSAR - spendSAR;
    var roi = spendSAR > 0 ? (netSAR / spendSAR) * 100 : 0;
    var returnPerSar = spendSAR > 0 ? revSAR / spendSAR : 0;
    var netRoas = spendSAR > 0 ? deliveredSalesSAR / spendSAR : 0;

    return {
      spendSAR,
      cpaSAR,
      breakEvenCpaSAR,
      cpa: convert(cpaSAR, "SAR", state.currency),
      breakEvenCpa: convert(breakEvenCpaSAR, "SAR", state.currency),
      profit: convert(revSAR, "SAR", state.currency),
      net: convert(netSAR, "SAR", state.currency),
      spend: convert(spendSAR, "SAR", state.currency),
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
    var projDvl = Math.round((realNdrPct / 100) * projOrders);
    var projRevSAR = projDvl * realAvgCommission;
    var projNetSAR = projRevSAR - budgetSAR;
    var projRoi = budgetSAR > 0 ? (projNetSAR / budgetSAR) * 100 : 0;
    return {
      orders: projOrders,
      revenue: projRevSAR,
      net: projNetSAR,
      roi: projRoi,
    };
  }

  // -- 4. Smart Forecast Compute (uses simState) -------------------------------
  function simConvert(valSAR, to) {
    return convert(valSAR, nativeCurrency || "SAR", to || simState.viewCurrency || nativeCurrency || "SAR");
  }
  function computeSim() {
    var s = simState;
    var deliveredOrders = Math.round(s.totalOrders * s.ndr);
    var revenue = deliveredOrders * s.avgCommission;
    var netProfit = revenue - s.adSpend;
    var roi = s.adSpend > 0 ? (netProfit / s.adSpend) * 100 : 0;
    var cpa = s.totalOrders > 0 ? s.adSpend / s.totalOrders : 0;
    var returnPerSar = s.adSpend > 0 ? revenue / s.adSpend : 0;
    var revenuePerDel = deliveredOrders > 0 ? revenue / deliveredOrders : 0;
    var ndrRequired =
      s.totalOrders > 0 && s.avgCommission > 0
        ? s.adSpend / (s.totalOrders * s.avgCommission)
        : null;
    var commRequired = deliveredOrders > 0 ? s.adSpend / deliveredOrders : null;
    var delivRequired =
      s.avgCommission > 0 ? Math.ceil(s.adSpend / s.avgCommission) : null;

    // Projected scenario at 2× budget
    var projBudget = s.adSpend * 2;
    var projOrders = cpa > 0 ? Math.round(projBudget / cpa) : 0;
    var projDelivered = Math.round(projOrders * s.ndr);
    var projRevenue = projDelivered * s.avgCommission;
    var projNet = projRevenue - projBudget;
    var projRoi = projBudget > 0 ? (projNet / projBudget) * 100 : 0;

    return {
      deliveredOrders,
      revenue,
      netProfit,
      roi,
      cpa,
      returnPerSar,
      revenuePerDel,
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
          '" font-size="11" font-weight="700" font-family="Cairo,sans-serif" direction="ltr">' +
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
      '" font-size="42" font-weight="900" font-family="Cairo,sans-serif" direction="ltr">' +
      formattedRoi +
      "</text>" +
      '<text x="' +
      cx +
      '" y="' +
      (cy + 62) +
      '" text-anchor="middle" fill="' +
      roiColor +
      '" font-size="13" font-weight="800" font-family="Cairo,sans-serif">? ' +
      (roi < 0
        ? s7Txt("Losing", "?????")
        : roi < 50
          ? s7Txt("Near break-even", "???? ?? ???????")
          : s7Txt("Profitable", "????")) +
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
      var bCurr = convert(b, "SAR", state.currency);
      var netCurr = convert(proj.net, "SAR", state.currency);

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
              "???? ????? ??????? (" + state.currency + ")",
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
            label: s7Txt("Total Expected Orders", "?????? ??????? ????????"),
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
        animation: { duration: 220 },
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
            titleFont: { family: "Cairo" },
            bodyFont: { family: "Cairo" },
            callbacks: {
              title: function (items) {
                var idx = items && items.length ? items[0].dataIndex : 0;
                return s7Txt("Budget", "?????????") + ": " + fmt(budgetData[idx] || 0, 0) + " " + state.currency;
              },
              label: function (ctx) {
                if (ctx.dataset && ctx.dataset.yAxisID === "yNet") {
                  return s7Txt("Net result", "???? ???????") + ": " + fmt(ctx.parsed.y || 0, 0) + " " + state.currency;
                }
                return s7Txt("Expected orders", "??????? ????????") + ": " + fmt(ctx.parsed.y || 0, 0);
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: theme.grid },
            title: {
              display: true,
              text: s7Txt("Budget multiplier vs current spend", "????? ????????? ?????? ???????? ??????"),
              color: theme.muted,
              font: { size: 11, family: "Cairo", weight: "700" },
            },
            ticks: { color: theme.label, font: { size: 10, family: "Cairo", weight: "700" } },
          },
          yNet: {
            position: "left",
            grid: { color: theme.grid },
            title: {
              display: true,
              text: s7Txt("Net result", "???? ???????"),
              color: netColor,
              font: { size: 11, family: "Cairo", weight: "700" },
            },
            ticks: {
              color: netColor,
              font: { size: 10, family: "Cairo" },
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
              text: s7Txt("Orders", "???????"),
              color: "#3b82f6",
              font: { size: 11, family: "Cairo", weight: "700" },
            },
            ticks: {
              color: "#3b82f6",
              font: { size: 10, family: "Cairo" },
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
        '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:10px">' +
        s7Txt("Please enter a valid budget", "???? ????? ??????? ?????") +
        "</div>";
      return;
    }
    var html = "";
    var scens = [
      {
        name: s7Txt("Half Budget", "??? ?????????"),
        color: "#ef4444",
        bud: baseSpendSAR * 0.5,
      },
      {
        name: s7Txt("Current", "???????"),
        color: "#0ea5e9",
        bud: baseSpendSAR,
      },
      {
        name: s7Txt("Increase 50%", "????? 50%"),
        color: "#10b981",
        bud: baseSpendSAR * 1.5,
      },
      {
        name: s7Txt("Double 2x", "?????? 2×"),
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
        ? "border:1px solid rgba(59,130,246,0.25);border-radius:8px;"
        : "border-bottom:1px solid " +
          (isLight ? "#cbd5e1" : "rgba(255,255,255,0.04)") +
          ";";

      var budVal = convert(sc.bud, "SAR", state.currency);
      var netVal = convert(proj.net, "SAR", state.currency);

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
        ";padding:3px 10px;border-radius:6px;font-weight:800;border:1px solid " +
        sc.color +
        '40;font-size:10px">' +
        sc.name +
        "</span></div>" +
        '<div style="color:' +
        textVal1 +
        ';font-weight:700">' +
        fmt(budVal, 0) +
        ' <span style="font-size:9px;color:' +
        textMuted +
        '">' +
        state.currency +
        "</span></div>" +
        '<div style="color:' +
        textVal2 +
        ';font-weight:700" dir="ltr">' +
        fmt(netVal, 0) +
        ' <span style="font-size:9px;color:' +
        textMuted +
        '">' +
        state.currency +
        "</span></div>" +
        '<div style="color:' +
        roiColor +
        ';font-weight:800" dir="ltr">' +
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
      var precise = abs.toLocaleString(undefined, {
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
      var badge = _tip(tipIcon || "??", tipTitle, tipDesc, tipFormula);
      var isLight =
        document.documentElement.getAttribute("data-theme") === "light";
      var cardBg = isLight ? "#ffffff" : "#111318";
      var cardBorder = isLight ? "#cbd5e1" : "rgba(255,255,255,0.07)";
      var valColor = isLight ? "#1e293b" : "#f0f1f3";
      var subColor = isLight ? "#64748b" : "#4d5066";
      return (
        '<div class="sfe-metric-card ' +
        cls +
        '" style="background:' +
        cardBg +
        ";border-color:" +
        cardBorder +
        '">' +
        '<div class="sfe-metric-label" style="display:flex;align-items:center;gap:4px;color:' +
        subColor +
        '">' +
        label +
        " " +
        badge +
        "</div>" +
        '<div class="sfe-metric-val" style="color:' +
        valColor +
        '">' +
        val + window.supposedBadgeHtml(label) +
        "</div>" +
        '<div class="sfe-metric-sub" style="color:' +
        subColor +
        '">' +
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
        "sfe-neutral",
        s7Txt("Total Orders", "?????? ???????"),
        s7Num(Math.round(s.totalOrders)),
        s7Txt("simulation input", "???? ??????"),
        s7Txt("Total Orders", "?????? ???????"),
        s7Txt(
          "Total orders entered in the simulation. You can edit it for testing.",
          "????? ????? ??????? ??????? ?? ???????? — ????? ?????? ???????.",
        ),
        null,
        "??",
      ) +
      card(
        "sfe-neutral",
        s7Txt("Delivered", "?? ???????"),
        s7Num(Math.round(c.deliveredOrders)),
        Math.round(s.ndr * 100) + "% NDR",
        s7Txt("Delivered Orders", "??????? ???????"),
        s7Txt(
          "Orders that reached the customer based on the simulated delivery rate.",
          "??? ??????? ???? ???? ?????? ????? ??? ???? ??????? ????????.",
        ),
        "delivered = totalOrders * NDR",
        "?",
      ) +
      card(
        "sfe-neutral",
        s7Txt("Revenue", "?????????"),
        sfeFmt(c.revenue),
        c.returnPerSar.toFixed(2) + s7Txt("x per ", "× ??? ") + sfeCurrLabel(),
        s7Txt("Revenue", "?????????"),
        s7Txt(
          "Total expected income from delivered orders multiplied by the average profit per delivered order.",
          "?????? ????? ??????? ?? ??????? ??????? ?????? ?? ????? ??? ????.",
        ),
        "revenue = deliveredOrders * taagerProfitPerDeliveredOrder",
        "??",
      ) +
      card(
        profCls,
        s7Txt("Net Profit", "???? ?????"),
        '<span style="color:' +
          (c.netProfit >= 0 ? greenColor : "#ff3b5c") +
          '">' +
          sfeFmt(c.netProfit) +
          "</span>",
        s7Txt("rev - spend", "??????? - ???????"),
        s7Txt("Net Profit", "????? ??????"),
        s7Txt(
          "Net profit or loss after subtracting ad spend from revenue.",
          "????? ?? ??????? ??????? ??? ??? ??????? ???????? ?? ?????????.",
        ),
        "netProfit = revenue - adSpend",
        "??",
      ) +
      card(
        roiCls,
        "ROI",
        '<span style="color:' +
          (c.roi >= 0 ? greenColor : "#ff3b5c") +
          '">' +
          c.roi.toFixed(1) +
          "%</span>",
        c.roi >= 0 ? s7Txt("profitable", "?????") : s7Txt("losing", "?????"),
        s7Txt("Return on Investment", "?????? ??? ?????????"),
        s7Txt(
          "Return percentage compared with spend. 100% means doubling your money.",
          "?????? ??????? ?????? ?????? ????????. 100% ???? ?????? ??????.",
        ),
        "ROI = (netProfit / adSpend) * 100%",
        "??",
      ) +
      card(
        "sfe-neutral",
        "CPA",
        sfeFmt(c.cpa, 2),
        s7Txt("per acquired order", "??? ??? ?????"),
        s7Txt("Cost per Order (CPA)", "????? ????? (CPA)"),
        s7Txt(
          "Cost to acquire one order. It should be lower than average profit per delivered order to stay profitable.",
          "????? ?????? ??? ??? ????. ??? ?? ???? ??? ?? ??? ???? ????? ?????.",
        ),
        "CPA = adSpend / totalOrders",
        "??",
      );
  }

  function renderSimScores(c) {
    var profScore = _calcProfitScore(c);
    var riskScore = _calcRiskScore(c);
    var isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    var safeColor = isLight ? "#10b981" : "#00e5a0";
    _renderScoreBlock(
      "sfe-profit-score",
      s7Txt("PROFITABILITY SCORE", "???? ???????"),
      profScore,
      profScore >= 60 ? safeColor : profScore >= 40 ? "#f5a623" : "#ff3b5c",
      profScore >= 70
        ? s7Txt("Strong", "????")
        : profScore >= 50
          ? s7Txt("Moderate", "??????")
          : profScore >= 30
            ? s7Txt("Weak", "?????")
            : s7Txt("Critical", "????"),
    );
    _renderScoreBlock(
      "sfe-risk-score",
      s7Txt("SCALING SAFETY", "???? ??????"),
      riskScore,
      riskScore >= 65 ? safeColor : riskScore >= 45 ? "#f5a623" : "#ff3b5c",
      riskScore >= 70
        ? s7Txt("Safe to scale", "??? ??????")
        : riskScore >= 50
          ? s7Txt("Caution", "????")
          : riskScore >= 30
            ? s7Txt("High risk", "?????? ?????")
            : s7Txt("Do not scale", "?? ???? ????"),
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
        s7Txt("? Break-even Achieved", "? ?? ?????? ????? ???????") +
        "</div>" +
        '<div class="sfe-be-subtitle" style="color:' +
        (document.documentElement.getAttribute("data-theme") === "light"
          ? "#10b981"
          : "#00e5a0") +
        '">' +
        s7Txt(
          "Campaign is profitable. Exceeds spend by ",
          "?????? ?????. ?????? ??????? ?????? ",
        ) +
        "<strong>" +
        sfeFmt(c.netProfit) +
        "</strong>. " +
        s7Txt("Scale with confidence.", "????? ?????? ????.") +
        "</div>";
      return;
    }
    var rows = "";
    if (c.ndrRequired !== null && c.ndrRequired <= 1) {
      rows += _beRow(
        s7Txt("Net Delivery Rate", "???? ???????"),
        Math.round(s.ndr * 100) + "%",
        Math.round(c.ndrRequired * 100) + "%",
        "+" + Math.round((c.ndrRequired - s.ndr) * 100) + "pp",
      );
    }
    if (c.commRequired !== null) {
      rows += _beRow(
        s7Txt("Average Profit", "متوسط الربح"),
        sfeFmt(s.avgCommission),
        sfeFmt(Math.ceil(c.commRequired)),
        "+" + sfeFmt(Math.ceil(c.commRequired - s.avgCommission)),
      );
    }
    if (c.delivRequired !== null) {
      rows += _beRow(
        s7Txt("Delivered Orders", "??????? ???????"),
        s7Num(Math.round(c.deliveredOrders)),
        s7Num(Math.round(c.delivRequired)),
        "+" + s7Num(Math.round(c.delivRequired - c.deliveredOrders)),
      );
    }
    el.innerHTML =
      '<div class="sfe-be-title">' +
      s7Txt("? Break-even Simulator", "? ????? ???? ???????") +
      "</div>" +
      '<div class="sfe-be-subtitle">' +
      s7Txt("To break even at ", "?????? ??? ??????? ??? ????? ") +
      "<strong>" +
      sfeFmt(s.adSpend) +
      "</strong>" +
      s7Txt(
        " spend, you need at least one of:",
        "? ????? ??? ???? ??? ????? ?? ?????:",
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
      '">?</span>' +
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
    var ndrPct = Math.round(s.ndr * 100);

    // 1. Core profitability state
    if (c.netProfit < 0) {
      insights.push({
        type: "critical",
        icon: "??",
        cat: s7Txt("PROFITABILITY BLOCKER", "???? ???????"),
        text:
          s7Txt(
            'Campaign is <span class="hi-red">losing ',
            '?????? <span class="hi-red">???? ',
          ) +
          sfeFmt(Math.abs(c.netProfit)) +
          s7Txt(
            "</span> net. Revenue of <strong>",
            "</span> ????. ????? <strong>",
          ) +
          sfeFmt(c.revenue) +
          s7Txt(
            "</strong> does not cover spend of <strong>",
            "</strong> ?? ???? ????? <strong>",
          ) +
          sfeFmt(s.adSpend) +
          "</strong>.",
      });
    } else {
      insights.push({
        type: "positive",
        icon: "??",
        cat: s7Txt("PROFITABILITY STATUS", "???? ???????"),
        text:
          s7Txt(
            'Campaign is <span class="hi-green">profitable</span> — net profit <strong>',
            '?????? <span class="hi-green">?????</span> — ???? ????? <strong>',
          ) +
          sfeFmt(c.netProfit) +
          s7Txt("</strong> on <strong>", "</strong> ?? ????? <strong>") +
          sfeFmt(c.revenue) +
          "</strong>.",
      });
    }

    // 2. Unit economics
    if (c.cpa > c.revenuePerDel && s.adSpend > 0) {
      insights.push({
        type: "negative",
        icon: "??",
        cat: s7Txt("UNIT ECONOMICS", "????????? ?????"),
        text:
          s7Txt(
            '<span class="hi-red">CPA (',
            '<span class="hi-red">????? ????? (',
          ) +
          sfeFmt(c.cpa, 2) +
          s7Txt(
            ")</span> exceeds revenue per delivered order <strong>(",
            ")</span> ???? ?? ????? ????? ?????? <strong>(",
          ) +
          sfeFmt(c.revenuePerDel, 2) +
          s7Txt(
            ")</strong>. Scaling will compound losses, not profits.",
            ")</strong>. ?????? ????? ??????? ?? ???????.",
          ),
      });
    } else if (c.revenuePerDel > 0 && s.adSpend > 0) {
      insights.push({
        type: "positive",
        icon: "??",
        cat: s7Txt("UNIT ECONOMICS", "????????? ?????"),
        text:
          s7Txt(
            'Revenue per delivered order <span class="hi-green">(',
            '????? ????? ?????? <span class="hi-green">(',
          ) +
          sfeFmt(c.revenuePerDel, 2) +
          s7Txt(
            ")</span> exceeds CPA <strong>(",
            ")</span> ???? ?? ????? ????? <strong>(",
          ) +
          sfeFmt(c.cpa, 2) +
          s7Txt(
            ")</strong>. Unit economics are positive — scaling is viable.",
            ")</strong>. ????????? ????? ??????? ??????? ????.",
          ),
      });
    }

    // 3. NDR analysis
    if (s.ndr < 0.20) {
      insights.push({
        type: "negative",
        icon: "??",
        cat: s7Txt("NDR ANALYSIS", "????? ???? ???????"),
        text:
          s7Txt(
            'NDR of <span class="hi-red">',
            '???? ??????? <span class="hi-red">',
          ) +
          ndrPct +
          s7Txt(
            "%</span> is critically below the danger threshold (20%). <strong>",
            "%</span> ??? ?? ?? ????? (20%). ???? <strong>",
          ) +
          s7Num(Math.round((1 - s.ndr) * s.totalOrders)) +
          s7Txt(
            " orders</strong> are failing — primary driver of losses.",
            " ???</strong> ??????? ???? ??? ????? ???????.",
          ),
      });
    } else if (s.ndr < 0.30) {
      insights.push({
        type: "warning",
        icon: "??",
        cat: s7Txt("NDR ANALYSIS", "????? ???? ???????"),
        text:
          s7Txt(
            'NDR of <span class="hi-yellow">',
            '???? ??????? <span class="hi-yellow">',
          ) +
          ndrPct +
          s7Txt(
            "%</span> is below healthy baseline (30%). Improving to 30%+ would materially impact profitability.",
            "%</span> ??? ?? ??????? ????? (30%). ????? ??? 30% ????? ??????? ?????.",
          ),
      });
    } else if (s.ndr >= 0.40) {
      insights.push({
        type: "positive",
        icon: "?",
        cat: s7Txt("NDR ANALYSIS", "????? ???? ???????"),
        text:
          s7Txt(
            'NDR of <span class="hi-cyan">',
            '???? ??????? <span class="hi-cyan">',
          ) +
          ndrPct +
          s7Txt(
            "%</span> reaches the top delivery tier (40%). Strong delivery enables confident budget scaling.",
            "%</span> ???? ?? ?? ?????? ????? (40%). ???? ??????? ??? ????? ??? ????????? ????.",
          ),
      });
    }

    // 4. Loss per delivery
    var lossPerDel =
      c.deliveredOrders > 0 ? (s.adSpend - c.revenue) / c.deliveredOrders : 0;
    if (lossPerDel > 0) {
      insights.push({
        type: "negative",
        icon: "??",
        cat: s7Txt("COST ANALYSIS", "????? ???????"),
        text:
          s7Txt(
            'You are losing <span class="hi-red">',
            '???? <span class="hi-red">',
          ) +
          sfeFmt(lossPerDel) +
          s7Txt(
            "</span> per delivered order. Doubling budget doubles losses.",
            "</span> ??? ??? ????. ?????? ????????? ?????? ???????.",
          ),
      });
    }

    // 5. Scaling safety
    if (c.projNet < 0 && c.netProfit < 0) {
      insights.push({
        type: "critical",
        icon: "??",
        cat: s7Txt("SCALING SAFETY", "???? ??????"),
        text:
          s7Txt(
            "Doubling budget to <strong>",
            "?????? ????????? ??? <strong>",
          ) +
          sfeFmt(c.projBudget) +
          s7Txt(
            '</strong> projects <span class="hi-red">',
            '</strong> ????? <span class="hi-red">',
          ) +
          sfeFmt(Math.abs(c.projNet)) +
          s7Txt(
            " loss</span>. Scaling losses, not profits. Fix unit economics first.",
            " ?????</span>. ???? ????????? ????? ??? ??????.",
          ),
      });
    } else if (c.projNet > 0 && c.netProfit > 0) {
      insights.push({
        type: "positive",
        icon: "??",
        cat: s7Txt("SCALING OPPORTUNITY", "???? ????"),
        text:
          s7Txt(
            'Scaling to 2× budget projects <span class="hi-green">',
            '?????? ??? ??? ????????? ????? <span class="hi-green">',
          ) +
          sfeFmt(c.projNet) +
          s7Txt(
            " net profit</span> at <strong>",
            " ???? ???</span> ??? <strong>",
          ) +
          c.projRoi.toFixed(1) +
          s7Txt(
            "% ROI</strong>. Safe to scale.",
            "% ROI</strong>. ?????? ???.",
          ),
      });
    }

    // 6. Average profit optimization. avgCommission is retained as a compatibility field.
    if (c.commRequired !== null && c.commRequired > s.avgCommission) {
      var lift = Math.ceil(c.commRequired - s.avgCommission);
      insights.push({
        type: "info",
        icon: "???",
        cat: s7Txt("AVERAGE PROFIT OPTIMIZATION", "تحسين متوسط الربح"),
        text:
          s7Txt(
            'Increasing average profit by <span class="hi-blue">',
            'زيادة متوسط الربح بمقدار <span class="hi-blue">',
          ) +
          lift +
          s7Txt(
            " " + state.currency + "</span> per delivery (from ",
            " " + state.currency + "</span> ??? ????? (?? ",
          ) +
          s.avgCommission +
          " ? " +
          Math.ceil(c.commRequired) +
          s7Txt(" " + state.currency + ") would achieve break-even.", " " + state.currency + ") ???? ???? ???????."),
      });
    }

    el.innerHTML = insights
      .slice(0, 6)
      .map(function (i) {
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
    var ndrBase = Math.round(s.ndr * 100);
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
        label: s7Txt("? Current", "? ??????"),
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
        label: s7Txt("Profit +20%", "????? +20%"),
        ndr: s.ndr,
        comm: Math.round(s.avgCommission * 1.2),
        orders: s.totalOrders,
        spend: s.adSpend,
      },
      {
        label: s7Txt("Orders ×2", "??????? ×2"),
        ndr: s.ndr,
        comm: s.avgCommission,
        orders: s.totalOrders * 2,
        spend: s.adSpend * 2,
      },
    ];
    var rows = scenarios
      .map(function (sc) {
        var del = Math.round(sc.orders * sc.ndr);
        var rev = del * sc.comm;
        var net = rev - sc.spend;
        var roi = sc.spend > 0 ? (net / sc.spend) * 100 : 0;
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
          Math.round(sc.ndr * 100) +
          "%</td>" +
          "<td>" +
          sfeFmt(sc.comm) +
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
      s7Txt("Scenario", "?????????") +
      "</th><th>NDR</th><th>" +
      s7Txt("Avg Profit", "????? ?????") +
      "</th><th>" +
      s7Txt("Delivered", "???????") +
      "</th><th>" +
      s7Txt("Revenue", "???????") +
      "</th><th>" +
      s7Txt("Net Profit", "???? ?????") +
      "</th><th>ROI</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table>";
  }

  function updateSimUI() {
    var c = computeSim();
    var delivEl = document.getElementById("sfe-delivered-display");
    if (delivEl) delivEl.innerHTML = s7Num(Math.round(c.deliveredOrders)) + window.supposedBadgeHtml('delivered');
    var ndrHint = document.getElementById("sfe-ndr-hint");
    var commHint = document.getElementById("sfe-comm-hint");
    if (ndrHint) ndrHint.textContent = Math.round(simState.ndr * 100) + "%";
    if (commHint) commHint.textContent = simState.avgCommission + " " + state.currency;
    var badge = document.getElementById("sfe-sim-badge");
    if (badge) badge.style.display = simState._isModified ? "flex" : "none";
    renderSimMetrics(c);
    renderSimScores(c);
    renderBreakeven(c);
    renderInsightsFeed(c);
    renderSimScenarioTable(c);
  }

  // -- 8. Main Calculator UI Update --------------------------------------------
  function updateCalcUI() {
    if (syncedSpendActive && sourceBreakdown.length) {
      state.budget = syncedBudgetInCurrency();
      d.adSpend = state.budget;
      var syncedBudgetInput = document.getElementById("s7-in-budget");
      if (syncedBudgetInput)
        syncedBudgetInput.value = Math.round(state.budget).toLocaleString(
          "en-US",
        );
    }
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
      breakEvenEl.innerHTML = fmt(res.breakEvenCpa, 2) + window.supposedBadgeHtml('breakeven');
      breakEvenEl.style.color = res.cpaSAR > res.breakEvenCpaSAR ? "#ef4444" : "#00e676";
    }
    document.getElementById("s7-out-revenue").innerHTML = fmt(res.profit) + window.supposedBadgeHtml('revenue');

    var netEl = document.getElementById("s7-out-net");
    if (netEl) {
      netEl.innerHTML = (res.net > 0 ? "+" : "") + fmt(res.net) + window.supposedBadgeHtml('profit');
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
          "??? 1 " + state.currency + " ?????",
        ) +
        " " +
        _tip(
          "??",
          s7Txt(
            "Return per Currency Unit (ROAS)",
            "?????? ??? ???? ???? (ROAS)",
          ),
          s7Txt(
            "For each unit spent, how much do you get back in revenue? More than 1 means revenue exceeds spend.",
            "??? ???? ???? ??????? ?? ???? ???? ??????? ???? ?? 1 ???? ?? ??????? ???? ?? ???????.",
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
      tipIcon = "??",
      tipTitle = s7Txt("Campaign Status", "???? ??????"),
      tipBg,
      tipBorder;
    if (res.roi < 0) {
      tip = s7Txt(
        "This budget is creating a loss. Improve targeting or increase delivery rate (NDR) before adding more spend.",
        "??? ????????? ????? ?? ?????. ???? ????? ????????? ?? ??? ???? ??????? (NDR) ??? ?? ??????.",
      );
      tipIcon = "??";
      tipBg = "rgba(239,68,68,0.1)";
      tipBorder = "rgba(239,68,68,0.2)";
      if (tipEl)
        tipEl.parentElement.querySelector("div:first-child").style.color =
          "#ef4444";
    } else if (res.roi < 50) {
      tip = s7Txt(
        "Weak performance close to break-even. Profit margin is thin. Improve performance before scaling.",
        "???? ???? ?????? ?? ???? ???????. ???? ????? ???? ????. ????? ????? ?????? ?????? ??????.",
      );
      tipIcon = "?";
      tipBg = "rgba(245,158,11,0.1)";
      tipBorder = "rgba(245,158,11,0.2)";
      if (tipEl)
        tipEl.parentElement.querySelector("div:first-child").style.color =
          "#f59e0b";
    } else {
      tip = s7Txt(
        "Excellent and profitable performance. Your campaign is generating a healthy return. Continue or raise budget carefully.",
        "???? ????? ?????. ????? ???? ?????? ?????. ???? ?????????? ?? ??? ????????? ????.",
      );
      tipIcon = "??";
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

    buildGrowthChart(res.cpaSAR, res.spendSAR);
    renderScenarios(res.cpaSAR, res.spendSAR);
  }

  // -- 9. Render HTML ----------------------------------------------------------
  function render() {
    mountEl.innerHTML =
      "<style>" +
      // Calculator styles
      ".s7-input-wrap{background:linear-gradient(135deg,rgba(17,24,39,0.7) 0%,rgba(15,23,42,0.8) 100%);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px 18px;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);display:flex;flex-direction:column;gap:6px;position:relative;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4),0 4px 20px rgba(0,0,0,0.15)}" +
      ".s7-input-wrap:hover{border-color:rgba(255,255,255,0.15);transform:translateY(-1px);box-shadow:inset 0 2px 4px rgba(0,0,0,0.4),0 6px 24px rgba(0,0,0,0.25)}" +
      ".s7-input-wrap:focus-within{border-color:#3b82f6;background:rgba(10,15,30,0.95);box-shadow:0 0 0 3px rgba(59,130,246,0.25),inset 0 2px 4px rgba(0,0,0,0.5);transform:scale(1.01) translateY(-1px)}" +
      ".s7-lbl{font-size:11.5px;color:rgba(156,163,175,0.8);font-weight:700;letter-spacing:0.03em;text-transform:uppercase;transition:color 0.3s}" +
      ".s7-input-wrap:focus-within .s7-lbl{color:#60a5fa}" +
      ".s7-input-num{background:transparent;border:none;color:#fff;font-family:Cairo,sans-serif;font-size:20px;font-weight:800;width:100%;outline:none;padding:0;margin:0;box-shadow:none;line-height:1.2;letter-spacing:0.02em}" +
      ".s7-input-num::-webkit-inner-spin-button,.s7-input-num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}" +
      ".s7-input-num{-moz-appearance:textfield}" +
      ".s7-input-num::placeholder{color:rgba(255,255,255,0.25);font-weight:500;font-style:italic;font-size:15px;font-family:Cairo,sans-serif}" +
      ".s7-rate-note,.sfe-global-rate-note{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.18);border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;gap:4px;color:rgba(255,255,255,.68);font-size:11px;font-weight:700;line-height:1.55}" +
      ".s7-rate-note strong,.sfe-global-rate-note strong{color:#93c5fd;font-size:12px;font-weight:900}" +
      ".s7-currency-badge{display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;border-radius:9999px;font-size:12px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1);border:1px solid rgba(255,255,255,0.1);box-shadow:0 4px 12px rgba(0,0,0,0.3),inset 0 1px 1px rgba(255,255,255,0.1);white-space:nowrap;cursor:default;user-select:none}" +
      ".s7-currency-badge.sar{background:linear-gradient(135deg,rgba(16,185,129,0.25) 0%,rgba(5,150,105,0.15) 100%);color:#34d399;border-color:rgba(52,211,153,0.35);box-shadow:0 4px 12px rgba(52,211,153,0.15),inset 0 1px 1px rgba(255,255,255,0.15)}" +
      ".s7-currency-badge.usd{background:linear-gradient(135deg,rgba(59,130,246,0.25) 0%,rgba(29,78,216,0.15) 100%);color:#60a5fa;border-color:rgba(96,165,250,0.35);box-shadow:0 4px 12px rgba(96,165,250,0.15),inset 0 1px 1px rgba(255,255,255,0.15)}" +
      ".s7-currency-badge.egp{background:linear-gradient(135deg,rgba(245,158,11,0.25) 0%,rgba(217,119,6,0.15) 100%);color:#fbbf24;border-color:rgba(251,191,36,0.35);box-shadow:0 4px 12px rgba(251,191,36,0.15),inset 0 1px 1px rgba(255,255,255,0.15)}" +
      "@keyframes badgeChange{0%{transform:scale(0.85);opacity:0.5}100%{transform:scale(1);opacity:1}}" +
      ".s7-currency-badge-animate{animation:badgeChange 0.35s cubic-bezier(0.34,1.56,0.64,1)}" +
      ".s7-card{background:linear-gradient(145deg,rgba(30,41,59,0.4),rgba(15,23,42,0.6));border:1px solid rgba(59,130,246,0.16);border-radius:14px;padding:20px 16px;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;position:relative;overflow:hidden;transition:.2s}" +
      ".s7-card:hover{border-color:rgba(255,255,255,0.15);transform:translateY(-2px)}" +
      ".s7-source-breakdown{margin:24px 30px 0;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#0b1120") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(45,212,191,.2)") +
      ";border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:15px}" +
      ".s7-source-head{display:flex;align-items:center;justify-content:space-between;gap:18px}" +
      ".s7-source-head h3{margin:0 0 4px;font-size:15px;font-weight:900;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#fff") +
      "}" +
      ".s7-source-head p{margin:0;font-size:11px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,.52)") +
      ";font-weight:600}" +
      ".s7-source-total{background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.24);border-radius:12px;padding:9px 13px;display:flex;flex-direction:column;gap:3px;align-items:flex-end;white-space:nowrap}" +
      ".s7-source-total span{color:rgba(255,255,255,.52);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}" +
      ".s7-source-total strong{color:#2dd4bf;font-size:16px;font-weight:900}" +
      ".s7-source-meta{margin-left:auto;display:flex;flex-direction:column;gap:3px;align-items:flex-end;min-width:150px}" +
      ".s7-source-meta span{font-size:10px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,.45)") +
      ";font-weight:800;text-transform:uppercase;letter-spacing:.08em}" +
      ".s7-source-meta strong{font-size:12px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f3f4f6") +
      ";white-space:nowrap}" +
      ".s7-source-sync{border:1px solid rgba(168,85,247,.45);background:rgba(168,85,247,.18);color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#7c3aed"
        : "#f8fafc") +
      ";border-radius:10px;padding:10px 13px;font-size:11px;font-weight:900;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap}" +
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
      ";border-radius:12px;padding:12px 14px}" +
      ".s7-source-row div{display:flex;flex-direction:column;gap:3px}" +
      ".s7-source-row span,.s7-source-account small{font-size:10px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,.48)") +
      ";font-weight:700}" +
      ".s7-source-row strong{font-size:13px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f3f4f6") +
      ";overflow-wrap:anywhere}" +
      ".s7-source-row .s7-source-converted{color:#2dd4bf}" +
      "@media(max-width:980px){.s7-source-row{grid-template-columns:1fr}.s7-source-head{align-items:flex-start;flex-direction:column}}" +
      ".s7-scen-row{display:grid;grid-template-columns:1.3fr 1fr 1fr 0.7fr;text-align:center;padding:10px 0;font-size:12px;align-items:center;transition:.2s}" +
      ".s7-tab{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:800;cursor:pointer;transition:all 0.25s cubic-bezier(0.4,0,0.2,1);border:1px solid transparent;background:transparent;color:" +
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
      ".sfe-curr-tab{display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:800;cursor:pointer;transition:all 0.25s cubic-bezier(0.4,0,0.2,1);border:1px solid transparent;background:transparent;color:" +
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
      ".s7-sync-period-range{font-size:11px;color:#f59e0b;font-weight:700;padding:8px 10px;background:rgba(245,158,11,0.08);border-radius:6px;border:1px solid rgba(245,158,11,0.15)}" +
      ".s7-sync-period-note{font-size:10px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light" ? "#7c3aed" : "rgba(240,241,243,0.85)") +
      " ;line-height:1.65;padding:9px 10px;background:rgba(59,130,246,0.08);border-radius:8px;border:1px solid rgba(59,130,246,0.14)}" +
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
      ".sfe-header-badge{font-size:10px;font-weight:600;letter-spacing:.14em;color:#00e5a0;background:rgba(0,229,160,0.08);border:1px solid rgba(0,229,160,0.2);border-radius:4px;padding:3px 8px;display:inline-block;margin-bottom:8px}" +
      ".sfe-header-title{font-size:20px;font-weight:700;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";letter-spacing:-.02em;line-height:1.2}" +
      ".sfe-header-sub{font-size:12px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";margin-top:6px}" +
      ".sfe-header-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px}" +
      ".sfe-sim-badge{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:500;letter-spacing:.1em;color:#f5a623;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:4px;padding:4px 10px}" +
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
      ";font-size:12px;font-weight:500;padding:6px 14px;border-radius:8px;cursor:pointer;transition:.2s;font-family:inherit}" +
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
      ";border-radius:10px;padding:14px;position:relative;overflow:hidden}" +
      '.sfe-metric-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--sfe-accent-bar,transparent);border-radius:10px 10px 0 0}' +
      ".sfe-metric-card.sfe-positive{--sfe-accent-bar:#00e5a0;border-color:rgba(0,229,160,.15)}" +
      ".sfe-metric-card.sfe-negative{--sfe-accent-bar:#ff3b5c;border-color:rgba(255,59,92,.15)}" +
      ".sfe-metric-card.sfe-neutral{--sfe-accent-bar:#4da6ff;border-color:rgba(77,166,255,.12)}" +
      ".sfe-metric-label{font-size:10px;font-weight:600;letter-spacing:.1em;color:#4d5066;text-transform:uppercase;margin-bottom:8px}" +
      ".sfe-metric-val{font-size:18px;font-weight:700;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";letter-spacing:-.03em;line-height:1;transition:color .3s}" +
      ".sfe-metric-sub{font-size:11px;color:#4d5066;margin-top:5px}" +
      ".sfe-body-grid{display:grid;grid-template-columns:320px 1fr;gap:16px;margin-bottom:24px}" +
      ".sfe-panel{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#111318") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";border-radius:12px;padding:20px}" +
      ".sfe-panel-label{font-size:10px;font-weight:700;letter-spacing:.13em;color:#4d5066;text-transform:uppercase;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-control-group{display:flex;flex-direction:column;gap:16px}" +
      ".sfe-control-row{display:flex;flex-direction:column;gap:6px}" +
      ".sfe-label{font-size:12px;font-weight:500;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";display:flex;align-items:center;gap:6px}" +
      ".sfe-label-hint{font-weight:700;color:#00e5a0;font-size:12px}" +
      ".sfe-input-wrap2{display:flex;align-items:center;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#161921") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.12)") +
      ";border-radius:8px;overflow:hidden;transition:border-color .2s}" +
      ".sfe-input-wrap2:focus-within{border-color:rgba(0,229,160,.4)}" +
      ".sfe-input2{background:transparent;border:none;outline:none;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";font-size:15px;font-weight:600;padding:9px 12px;width:100%;-moz-appearance:textfield}" +
      ".sfe-input2::-webkit-inner-spin-button,.sfe-input2::-webkit-outer-spin-button{-webkit-appearance:none}" +
      ".sfe-input-unit2{padding:0 12px;font-size:11px;font-weight:600;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#4d5066") +
      ";letter-spacing:.06em;white-space:nowrap;border-left:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-health-scale{height:5px;border-radius:999px;background:linear-gradient(90deg,#ff3b5c 0%,#ff3b5c 20%,#f5a623 20%,#f5a623 30%,#00e5a0 30%,#00e5a0 40%,#22d3ee 40%,#22d3ee 100%);opacity:.75;margin-top:4px;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)}" +
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
      ".sfe-marker{font-size:9px;font-weight:700;text-align:center;line-height:1.3}" +
      ".sfe-marker--danger{color:#ff3b5c}.sfe-marker--mid{color:#f5a623}.sfe-marker--safe{color:#22d3ee}" +
      ".sfe-derived-row{background:rgba(77,166,255,0.04);border:1px solid rgba(77,166,255,.1);border-radius:8px;padding:10px 12px}" +
      ".sfe-derived-value{font-size:22px;font-weight:700;color:#4da6ff;letter-spacing:-.03em}" +
      ".sfe-derived-note{font-size:10px;color:#4d5066;margin-top:2px}" +
      ".sfe-score-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}" +
      ".sfe-score-block{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#161921") +
      ";border-radius:10px;border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";padding:14px 16px}" +
      ".sfe-score-title{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4d5066;margin-bottom:10px}" +
      ".sfe-score-gauge{display:flex;align-items:center;gap:10px}" +
      ".sfe-gauge-bar-wrap{flex:1;height:6px;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,.06)") +
      ";border-radius:6px;overflow:hidden}" +
      ".sfe-gauge-bar{height:100%;border-radius:6px;transition:width .5s cubic-bezier(.4,0,.2,1),background .4s}" +
      ".sfe-score-num{font-size:22px;font-weight:700;min-width:36px;text-align:right;transition:color .3s}" +
      ".sfe-score-label{font-size:11px;font-weight:500;margin-top:6px}" +
      ".sfe-breakeven-panel{background:rgba(0,229,160,0.03);border:1px solid rgba(0,229,160,.12);border-radius:10px;padding:16px;margin-bottom:14px}" +
      ".sfe-be-title{font-size:12px;font-weight:700;letter-spacing:.1em;color:#00e5a0;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:6px}" +
      ".sfe-be-subtitle{font-size:12px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";margin-bottom:12px;line-height:1.5}" +
      ".sfe-be-options{display:flex;flex-direction:column;gap:8px}" +
      ".sfe-be-row{display:flex;align-items:center;gap:10px;padding:8px 10px;background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f8fafc"
        : "#111318") +
      ";border-radius:8px;border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      "}" +
      ".sfe-be-kpi{font-size:11px;font-weight:600;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";letter-spacing:.05em;min-width:120px;text-transform:uppercase}" +
      ".sfe-be-from{font-size:13px;font-weight:600;color:#ff3b5c;min-width:60px}" +
      ".sfe-be-arrow{font-size:14px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#94a3b8"
        : "#4d5066") +
      "}" +
      ".sfe-be-to{font-size:13px;font-weight:700;color:#00e5a0}" +
      ".sfe-be-delta{margin-left:auto;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(0,229,160,.1);color:#00e5a0;letter-spacing:.06em}" +
      ".sfe-insights-feed{display:flex;flex-direction:column;gap:8px}" +
      ".sfe-insight{display:flex;gap:10px;padding:11px 13px;border-radius:9px;border:1px solid transparent;animation:sfeIn .3s ease}" +
      "@keyframes sfeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}" +
      ".sfe-insight--positive{background:rgba(0,229,160,.05);border-color:rgba(0,229,160,.15)}" +
      ".sfe-insight--negative{background:rgba(255,59,92,.05);border-color:rgba(255,59,92,.15)}" +
      ".sfe-insight--warning{background:rgba(245,166,35,.05);border-color:rgba(245,166,35,.15)}" +
      ".sfe-insight--info{background:rgba(77,166,255,.05);border-color:rgba(77,166,255,.12)}" +
      ".sfe-insight--critical{background:rgba(255,59,92,.08);border-color:rgba(255,59,92,.3)}" +
      ".sfe-insight-icon{font-size:14px;flex-shrink:0;margin-top:1px}" +
      ".sfe-insight-category{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4d5066;margin-bottom:3px}" +
      ".sfe-insight-text{font-size:12px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "#8b8fa8") +
      ";line-height:1.55}" +
      ".sfe-insight-text strong{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      ";font-weight:600}" +
      ".sfe-insight-text .hi-green{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#10b981"
        : "#00e5a0") +
      ";font-weight:600}" +
      ".sfe-insight-text .hi-red{color:#ff3b5c;font-weight:600}" +
      ".sfe-insight-text .hi-cyan{color:#22d3ee;font-weight:600}" +
      ".sfe-insight-text .hi-yellow{color:#f5a623;font-weight:600}" +
      ".sfe-insight-text .hi-blue{color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#2563eb"
        : "#4da6ff") +
      ";font-weight:600}" +
      ".sfe-scenario-section{background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#ffffff"
        : "#111318") +
      ";border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ";border-radius:12px;padding:20px}" +
      ".sfe-table{width:100%;border-collapse:collapse;font-size:12px}" +
      ".sfe-table th{font-size:10px;font-weight:700;letter-spacing:.1em;color:" +
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
      ";font-size:12px;font-weight:500}" +
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
      ";font-weight:600}" +
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
      ";border:1px solid rgba(96,165,250,0.55);color:#93c5fd;font-size:11px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;cursor:help;transition:background .18s,border-color .18s,color .18s;font-family:system-ui,sans-serif;flex-shrink:0;vertical-align:middle;line-height:1;user-select:none}" +
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
      '[data-theme="light"] .sfe-table tr.sfe-row-current td:first-child{color:#7c3aed !important;font-weight:600 !important}' +
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
      ";font-family:Cairo,sans-serif;color:" +
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
      ';border-radius:16px;padding:24px">' +
      '<h3 style="margin:0 0 20px;font-size:15px;font-weight:900;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px">' +
      s7Txt("Enter your campaign data", "???? ?????? ?????") +
      " <span>???</span></h3>" +
      '<div style="display:flex;flex-direction:column;gap:14px">' +
      // Budget input
      '<div class="s7-input-wrap">' +
      '<div class="s7-lbl">' +
      s7Txt("AD SPEND", "???? ??????? ????????") +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<input type="text" inputmode="numeric" id="s7-in-budget" class="s7-input-num" placeholder="' +
      s7Txt("Enter campaign budget", "???? ??????? ??????") +
      '" />' +
      '<span id="s7-budget-curr-label" style="font-size:13px;font-weight:800;color:' +
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
      s7Txt("Exchange rates are global", "????? ????? ??????") +
      "</strong>" +
      '<span>' +
      s7Txt(
        "Use the Rates control in the dashboard top bar to refresh live rates or edit USD-based rates for all currencies.",
        "?????? ?? ????? ??????? ?? ?????? ?????? ?????? ????? ??????? ?????? ?? ????? ??????? ?????? ??????? ???????.",
      ) +
      "</span>" +
      "</div>" +
      // Marketing sync uses the one authoritative dashboard period selector in the top bar.
      '<div class="s7-sync-period">' +
      '<div class="s7-lbl">' +
      s7Txt("Marketing Spend Date Filter", "???? ????? ???????") +
      "</div>" +
      '<div class="s7-sync-period-range">' +
      escapeSourceText(selectedDashboardPeriodLabel()) +
      "</div>" +
      '<div class="s7-sync-period-note">' +
      s7Txt(
        "To change this period, select a date range from the top dashboard bar, click Update Dashboard, then click Sync Now.",
        "?????? ??? ??????? ???? ???? ??????? ?? ?????? ?????? ?????? ?? ???? ????? ???? ??????? ?? ?????? ????.",
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
      ';border-radius:16px;padding:24px">' +
      '<div style="font-size:13px;font-weight:900;display:flex;align-items:center;gap:8px;margin-bottom:16px"><span style="color:#f59e0b">?</span> ' +
      s7Txt("Real Bot Indicators", "?????? ????? ????????") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      // Taager dashboard/status/NDR migration:
      // Average profit comes from Taager order profit minus tax profit, not sales revenue.
      _kpiMiniTip(
        s7Txt("Total Orders", "?????? ???????"),
        s7Num(realTotalOrders),
        document.documentElement.getAttribute("data-theme") === "light"
          ? "#1e293b"
          : "#fff",
        "??",
        s7Txt("Total Orders", "?????? ???????"),
        s7Txt(
          "Total number of orders received from the bot during the selected period.",
          "????? ????? ??????? ??????? ?? ????? ???? ?????? ???????.",
        ),
        null,
      ) +
      _kpiMiniTip(
        s7Txt("Delivered Orders", "??????? ???????"),
        s7Num(realExpectedDvl),
        document.documentElement.getAttribute("data-theme") === "light"
          ? "#10b981"
          : "#00e676",
        "?",
        s7Txt("Delivered Orders", "??????? ???????"),
        s7Txt(
          "Orders that actually reached the customer. Calculated from total orders × delivery rate.",
          "??????? ???? ???? ?????? ??????. ???? ?? ?????? ??????? × ???? ???????.",
        ),
        "delivered = totalOrders * NDR%",
      ) +
      _kpiMiniTip(
        s7Txt("Delivery Rate NDR", "???? ??????? NDR"),
        realNdrPct.toFixed(1) + "%",
        "#f59e0b",
        "??",
        s7Txt("Delivery Rate (NDR)", "???? ??????? (NDR)"),
        s7Txt(
          "Percentage of orders delivered successfully. Healthy benchmark starts at 30%, with top tier at 40%+.",
          "?????? ??????? ??????? ???? ?? ??????? ?????. ??????? ????? ???? ?? 30%.",
        ),
        "NDR = deliveredOrders / totalOrders * 100",
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
        s7Txt("Average Profit", "متوسط الربح"),
        '<span id="s7-real-average-profit">' + realAvgCommission.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + nativeCurrency + "</span>",
        "#3b82f6",
        "??",
        s7Txt("Average Profit", "متوسط الربح"),
        s7Txt(
          "Average profit per delivered order in the selected period.",
          "متوسط الربح لكل طلب مسلم في الفترة المحددة.",
        ),
        "averageProfit = earnedProfitAfterTax / deliveredOrders",
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
      ';border-radius:16px;padding:20px">' +
      '<div style="font-size:13px;font-weight:900;margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:#3b82f6">??</span> ' +
      s7Txt("Quick Budget Scenarios", "?????????? ????? ?????????") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 0.7fr;text-align:center;padding-bottom:10px;border-bottom:1px solid ' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.08)") +
      ";font-size:11px;color:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.4)") +
      ';font-weight:800">' +
      "<span>" +
      s7Txt("Scenario", "???????") +
      "</span><span>" +
      s7Txt("Budget", "?????????") +
      "</span><span>" +
      s7Txt("Net Profit", "???? ?????") +
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
      ";padding:14px 22px;border-radius:16px;border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      '">' +
      '<div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:900;letter-spacing:-.01em">' +
      '<span style="color:#f5a623;font-size:15px">?</span>' +
      '<span style="color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      '">' +
      s7Txt("Budget Forecast Results", "????? ???? ?????????") +
      "</span>" +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;justify-content:flex-end">' +
      currencyTabsHtml("s7-tab", "active", "data-curr", state.currency) +
      "</div>" +
      "</div>" +
      // Top KPI cards
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px">' +
      '<div class="s7-card"><div style="font-size:12px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ';font-weight:700;display:flex;align-items:center;gap:5px">' +
      s7Txt("Total Spend", "?????? ???????") +
      " " +
      _tip(
        "??",
        s7Txt("Total Spend", "?????? ???????"),
        s7Txt(
          "Calculator spend after converting the entered or synced spend into the selected calculator currency.",
          "?????? ?????? ???????? ??? ????? ????????? ??????? ?? ??????? ??? ???? ?????? ??????.",
        ),
        "calculatorSpend = convert(spend, sourceCurrency -> calculatorCurrency)",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:22px;font-weight:900"><span>??</span><span id="s7-out-spend">--</span></div><div class="s7-curr-lbl" style="font-size:10px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:12px">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:12px;color:#a855f7;font-weight:700;display:flex;align-items:center;gap:5px">' +
      s7Txt("Cost per Order CPA", "????? ????? CPA") +
      " " +
      _tip(
        "??",
        s7Txt("Cost per Order (CPA)", "????? ????? (CPA)"),
        s7Txt(
          "Cost to acquire one order. Lower CPA means the campaign is more efficient.",
          "????? ?????? ??? ??? ????. ???? ?????? ???? ?????? ???? ?????.",
        ),
        "CPA = adSpend / totalOrders",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:22px;font-weight:900"><span style="color:#a855f7">??</span><span id="s7-out-cpa">--</span></div><div class="s7-curr-lbl" style="font-size:10px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:12px">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:12px;color:#f59e0b;font-weight:700;display:flex;align-items:center;gap:5px">' +
      s7Txt("Break-even CPA", "????? ???????") +
      " " +
      _tip(
        "??",
        s7Txt("Break-even CPA", "????? ???????? ??? ???????"),
        s7Txt(
          "Maximum CPA before the campaign starts losing money. This simulator uses the editable Taager profit per delivered order assumption multiplied by NDR.",
          "???? ????? ?????? ??? ?? ???? ?????? ????????. ???? ?? ????? ??? ???? ??? ??? ???? ?????? ?? ???? ??????? ??????.",
        ),
        "Break-even CPA = taagerProfitPerDeliveredOrder * NDR",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:22px;font-weight:900"><span style="color:#f59e0b">??</span><span id="s7-out-breakeven-cpa">--</span></div><div class="s7-curr-lbl" style="font-size:10px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:12px">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:12px;color:#3b82f6;font-weight:700;display:flex;align-items:center;gap:5px">' +
      s7Txt("Total Revenue", "?????? ?????????") +
      " " +
      _tip(
        "??",
        s7Txt("Total Revenue", "?????? ?????????"),
        s7Txt(
          "Expected income from delivered orders multiplied by the editable Taager profit per delivered order assumption.",
          "????? ??????? ?? ??????? ??????? × ????? ??? ????.",
        ),
        "revenue = deliveredOrders * taagerProfitPerDeliveredOrder",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:22px;font-weight:900"><span style="color:#3b82f6">??</span><span id="s7-out-revenue">--</span></div><div class="s7-curr-lbl" style="font-size:10px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:12px">' +
      state.viewCurrency +
      "</div></div>" +
      '<div class="s7-card"><div style="font-size:12px;color:#00e676;font-weight:700;display:flex;align-items:center;gap:5px">' +
      s7Txt("Net Profit", "????? ??????") +
      " " +
      _tip(
        "??",
        s7Txt("Net Profit", "????? ??????"),
        s7Txt(
          "Profit after subtracting ad costs from revenue. If negative, the campaign is losing money.",
          "???? ????? ??? ??? ?????? ??????? ?? ?????????. ??? ???? ?????? ????? ???? ?? ?????.",
        ),
        "netProfit = revenue - adSpend",
      ) +
      '</div><div style="display:flex;align-items:center;gap:8px;font-size:22px;font-weight:900"><span style="color:#00e676">??</span><span id="s7-out-net" dir="ltr">--</span></div><div class="s7-curr-lbl" style="font-size:10px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.5)") +
      ";background:" +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.08)") +
      ';padding:3px 10px;border-radius:12px">' +
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
      ';border-radius:16px;overflow:hidden">' +
      '<div style="flex:1;padding:24px;display:flex;flex-direction:column;align-items:center;position:relative">' +
      '<div style="font-size:15px;font-weight:900;margin-bottom:12px;display:flex;align-items:center;gap:8px">' +
      s7Txt("Return on Investment (ROI)", "?????? ??? ????????? (ROI)") +
      " " +
      _tip(
        "??",
        s7Txt("Return on Investment (ROI)", "?????? ??? ????????? (ROI)"),
        s7Txt(
          "Measures campaign profitability. Zero means break-even, positive means profit, negative means loss.",
          "???? ??? ????? ?????. ??? ???? ?????? ???? ???? ???? ???? ???? ?????.",
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
      '<div style="font-size:12px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.6)") +
      ';font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:5px" id="s7-roas-text">' +
      s7Txt("For each 1 ", "??? 1 ") + state.currency + s7Txt(" spent", " ?????") +
      " " +
      _tip(
        "??",
        s7Txt("Return per Currency Unit (ROAS)", "?????? ??? ???? (ROAS)"),
        s7Txt(
          "For each unit spent, how much revenue do you get back? More than 1 means revenue exceeds spend.",
          "??? ???? ?????? ?? ???? ???? ??????? ???? ?? 1 ???? ?? ??????? ???? ?? ???????.",
        ),
        "ROAS = revenue / adSpend",
      ) +
      "</div>" +
      '<div style="font-size:20px;font-weight:900;color:#00e676" id="s7-out-return">--</div>' +
      '<div style="font-size:13px;font-weight:900;color:#22d3ee;margin-top:6px;display:flex;align-items:center;gap:5px" id="s7-net-roas-row"><span id="s7-out-net-roas">--</span> ' +
      _tip(
        "??",
        s7Txt("Net ROAS", "?????? ?????? ??? ???????"),
        s7Txt(
          "Actual delivered sales divided by ad spend. This ignores pending and canceled orders.",
          "?????? ?????? ??????? ??????? ?????? ??? ??????? ????????. ?? ????? ??????? ??????? ?? ???????.",
        ),
        "Net ROAS = deliveredSales / adSpend",
      ) +
      "</div>" +
      "</div>" +
      '<div id="s7-smart-tip-wrap" style="background:linear-gradient(135deg,rgba(0,230,118,0.1),transparent);border:1px solid rgba(0,230,118,0.2);border-radius:12px;padding:14px;display:flex;gap:12px;align-items:flex-start">' +
      '<div style="font-size:20px;margin-top:2px">??</div>' +
      "<div>" +
      '<div style="font-size:12px;font-weight:900;color:#00e676;margin-bottom:4px">' +
      s7Txt("Campaign Status", "???? ??????") +
      "</div>" +
      '<div style="font-size:11px;color:' +
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
      ';border-radius:16px;padding:24px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:16px;flex-wrap:wrap">' +
      '<div><div style="font-size:15px;font-weight:900;display:flex;align-items:center;gap:8px"><span style="color:#00e676">??</span> ' +
      s7Txt("Budget Scenario Forecast", "?????? ?????????? ?????????") +
      "</div>" +
      '<div style="font-size:11px;color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#64748b"
        : "rgba(255,255,255,0.48)") +
      ';margin-top:4px">' +
      s7Txt("X-axis shows budget multiples. Hover any point to see the exact budget.", "???? ?????? ?????? ??????? ?????????. ??? ??? ?? ???? ????? ????????? ???????.") +
      "</div></div>" +
      '<div style="display:flex;gap:16px;font-size:11px;font-weight:700;min-height:22px;align-items:center">' +
      '<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:linear-gradient(135deg,#ef4444,#00e676);border-radius:3px;box-shadow:0 0 8px rgba(0,230,118,.35);display:inline-block"></span>' +
      s7Txt("Net Result", "???? ???????") +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:#3b82f6;border-radius:3px;box-shadow:0 0 8px #3b82f6;display:inline-block"></span>' +
      s7Txt("Orders", "???????") +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div style="position:relative;height:240px;width:100%"><canvas id="s7-growth-chart"></canvas></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      // -- SMART FORECASTING ENGINE SECTION --------------------------------
      '<div style="padding:0 30px 30px">' +
      '<div class="sfe-wrapper">' +
      // SFE Header — Budget Forecast Results bar + title
      '<div style="display:flex;align-items:center;justify-content:space-between;background:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#f1f5f9"
        : "rgba(255,255,255,0.03)") +
      ";padding:14px 22px;border-radius:14px;border:1px solid " +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#cbd5e1"
        : "rgba(255,255,255,0.07)") +
      ';margin-bottom:20px">' +
      '<div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:900;letter-spacing:-.01em">' +
      '<span style="color:#f5a623;font-size:15px">?</span>' +
      '<span style="color:' +
      (document.documentElement.getAttribute("data-theme") === "light"
        ? "#1e293b"
        : "#f0f1f3") +
      '">' +
      s7Txt("Budget Forecast Results", "????? ???? ?????????") +
      "</span>" +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;justify-content:flex-end">' +
      currencyTabsHtml("sfe-curr-tab", "sfe-curr-active", "data-sfecurr", state.currency) +
      "</div>" +
      "</div>" +
      '<div class="sfe-header">' +
      "<div>" +
      '<div class="sfe-header-badge">' +
      s7Txt("SMART FORECASTING ENGINE", "???? ?????? ?????") +
      "</div>" +
      '<div class="sfe-header-title">' +
      s7Txt("Profitability Optimization Studio", "??????? ????? ???????") +
      "</div>" +
      '<div class="sfe-header-sub">' +
      s7Txt(
        "Simulate KPI changes · Detect break-even thresholds · Validate scaling safety",
        "???? ??????? ?????? · ???? ???? ??????? · ???? ?? ???? ??????",
      ) +
      "</div>" +
      "</div>" +
      '<div class="sfe-header-right">' +
      '<div class="sfe-sim-badge" id="sfe-sim-badge" style="display:none">' +
      '<span class="sfe-sim-dot"></span>' +
      s7Txt("SIMULATION MODE — local only", "??? ???????? — ???? ???") +
      "</div>" +
      '<button class="sfe-reset-btn" id="sfe-reset-btn">? ' +
      s7Txt("Reset to Real Data", "?????? ???????? ????????") +
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
      s7Txt("SIMULATION CONTROLS", "????? ?????? ?? ????????") +
      "</div>" +
      '<div class="sfe-control-group">' +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Total Orders", "?????? ???????") +
      "</label>" +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-orders" class="sfe-input2" min="1" step="50"><span class="sfe-input-unit2">' +
      s7Txt("orders", "???") +
      "</span></div>" +
      "</div>" +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Ad Spend", "??????? ????????") +
      ' <span class="sfe-label-hint" style="font-size:10px;color:#8b8fa8">' +
      s7Txt("used for CPA & ROI", "?????? ????? CPA ? ROI") +
      "</span></label>" +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-adspend" class="sfe-input2" min="0" step="500"><span class="sfe-input-unit2" id="sfe-lbl-adspend-curr">' +
      state.currency +
      "</span></div>" +
      "</div>" +
      '<div class="sfe-global-rate-note">' +
      '<strong>' + s7Txt("Global exchange rates", "????? ????? ??????") + "</strong>" +
      '<span>' + s7Txt("Refresh or edit currency rates from the dashboard top bar.", "???? ?????? ?? ????? ??????? ?? ?????? ?????? ??????.") + "</span>" +
      "</div>" +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Net Delivery Rate", "???? ???????") +
      ' <span class="sfe-label-hint" id="sfe-ndr-hint">0%</span></label>' +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-ndr" class="sfe-input2" min="1" max="100" step="1" inputmode="decimal"><span class="sfe-input-unit2">%</span></div>' +
      '<div class="sfe-health-scale" aria-hidden="true"></div>' +
      '<div class="sfe-slider-markers">' +
      '<span class="sfe-marker sfe-marker--danger">' +
      s7Txt("DANGER", "???") +
      "<br>20%</span>" +
      '<span class="sfe-marker sfe-marker--mid">' +
      s7Txt("MARKET", "?????") +
      "<br>30%</span>" +
      '<span class="sfe-marker sfe-marker--safe">' +
      s7Txt("SAFE", "???") +
      "<br>40%+</span>" +
      "</div>" +
      "</div>" +
      '<div class="sfe-control-row">' +
      '<label class="sfe-label">' +
      s7Txt("Average Profit / Delivered Order", "متوسط الربح لكل طلب مسلم") +
      ' <span class="sfe-label-hint" id="sfe-comm-hint">0 ' + state.currency + '</span></label>' +
      '<div class="sfe-input-wrap2"><input type="number" id="sfe-comm" class="sfe-input2" min="0" step="0.5" inputmode="decimal"><span class="sfe-input-unit2">' + state.currency + '</span></div>' +
      "</div>" +
      '<div class="sfe-control-row sfe-derived-row">' +
      '<label class="sfe-label" style="color:#4d5066">' +
      s7Txt("Delivered Orders", "??????? ???????") +
      "</label>" +
      '<div class="sfe-derived-value" id="sfe-delivered-display">—</div>' +
      '<div class="sfe-derived-note">' +
      s7Txt("auto-calculated · Orders × NDR", "???? ???????? · ??????? × NDR") +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      // RIGHT: Intelligence Engine
      '<div class="sfe-panel">' +
      '<div class="sfe-panel-label">' +
      s7Txt("INTELLIGENCE ENGINE", "???? ??????? ?????") +
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
      s7Txt("ADVANCED SCENARIO PROJECTIONS", "?????? ???????????? ????????") +
      "</div>" +
      '<div style="overflow-x:auto" id="sfe-scenario-table"></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    wireCalcEvents();
    wireSimEvents();

    // Initialize premium caret-preserving MoneyInput on Ad Spend budget field
    var budgetInput = document.getElementById("s7-in-budget");
    initMoneyInput(budgetInput, state.budget, function (val) {
      if (syncedSpendActive) {
        state.budget = Number(d.adSpend || 0);
        budgetInput.value = Math.round(state.budget).toLocaleString("en-US");
        return;
      }
      state.budget = val;
      persistCalculatorSettings();
      updateCalcUI();
    });
    if (budgetInput && syncedSpendActive) {
      budgetInput.disabled = true;
      budgetInput.setAttribute(
        "aria-label",
        s7Txt(
          "Ad spend synced from marketing platforms and locked",
          "??????? ???????? ?????? ?? ??? ??? ?????",
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
          egpRate: state.egpRate || 52,
        });
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
      ';border-radius:12px;padding:14px;text-align:center">' +
      '<div style="font-size:11px;color:' +
      labelColor +
      ';margin-bottom:6px">' +
      label +
      "</div>" +
      '<div style="font-size:17px;font-weight:900;color:' +
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
      ';border-radius:12px;padding:14px;text-align:center;position:relative">' +
      '<div style="font-size:11px;color:' +
      labelColor +
      ';margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:5px">' +
      label +
      " " +
      _tip(icon, tipTitle, tipDesc, tipFormula) +
      "</div>" +
      '<div style="font-size:17px;font-weight:900;color:' +
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
      '">?</span>'
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
      "border-radius:13px;" +
      "padding:14px 16px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05) inset;" +
      "font-family:Cairo,sans-serif" +
      '">' +
      '<div id="s7-tip-title" style="font-size:11px;font-weight:800;letter-spacing:.05em;color:#93c5fd;margin-bottom:7px;display:flex;align-items:center;gap:5px;direction:rtl"></div>' +
      '<div id="s7-tip-desc"  style="font-size:12px;color:rgba(255,255,255,0.75);line-height:1.65; margin-bottom:0"></div>' +
      '<div id="s7-tip-flbl"  style="display:none;font-size:9px;font-weight:700;letter-spacing:.12em;color:rgba(255,255,255,0.25);text-transform:uppercase;margin-top:9px;margin-bottom:4px;direction:rtl"></div>' +
      '<div id="s7-tip-fbox"  style="display:none;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:7px;padding:7px 10px;font-size:11px;color:#60a5fa;font-family:Courier New,monospace;direction:ltr;line-height:1.5;word-break:break-all"></div>' +
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
        flbl.textContent = s7Txt("Formula", "????????");
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
        '<select id="s7-sel-currency" style="width:100%;background:#0b1120;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;padding:10px;font-size:13px;font-weight:700;font-family:Cairo,sans-serif">' +
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
          state.currency = val;
          state.viewCurrency = val;
          simState.viewCurrency = val;
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
      state.currency = val;
      state.viewCurrency = val;
      simState.viewCurrency = val;
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
    var inpSpend = document.getElementById("sfe-adspend");
    var inpNdr = document.getElementById("sfe-ndr");
    var inpComm = document.getElementById("sfe-comm");
    if (inpOrders) inpOrders.value = simState.totalOrders;

    // Display SFE simulation spend converted from SAR to state.currency
    if (inpSpend)
      inpSpend.value = Math.round(
        convert(simState.adSpend, "SAR", state.currency),
      );

    if (inpNdr) inpNdr.value = Math.round(simState.ndr * 100);
    if (inpComm) inpComm.value = simState.avgCommission;
  }

  // -- Wire Calculator Events --------------------------------------------------
  function wireCalcEvents() {
    // Budget input event is now handled reactively by initMoneyInput formatter.
    var tabs = mountEl.querySelectorAll(".s7-tab");
    tabs.forEach(function (t) {
      t.addEventListener("click", function (e) {
        var curr = e.currentTarget.dataset.curr;
        state.currency = curr;
        state.viewCurrency = curr;
        simState.viewCurrency = curr;
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
      simState._isModified = true;
      updateSimUI();
    }

    var ordersEl = document.getElementById("sfe-orders");
    var spendEl = document.getElementById("sfe-adspend");
    var ndrEl = document.getElementById("sfe-ndr");
    var commEl = document.getElementById("sfe-comm");
    var resetBtn = document.getElementById("sfe-reset-btn");

    if (ordersEl)
      ordersEl.addEventListener("input", function (e) {
        simState.totalOrders = Math.max(1, parseInt(e.target.value) || 1);
        onChange();
      });
    if (spendEl)
      spendEl.addEventListener("input", function (e) {
        // User typed value in state.currency (e.g. USD) -> convert back to SAR internally
        var valInCurr = parseFloat(e.target.value) || 0;
        simState.adSpend = Math.max(
          0,
          convert(valInCurr, state.currency, "SAR"),
        );
        onChange();
      });
    if (ndrEl)
      ndrEl.addEventListener("input", function (e) {
        var ndrPct = Math.max(
          1,
          Math.min(100, parseFloat(e.target.value) || 1),
        );
        simState.ndr = ndrPct / 100;
        onChange();
      });
    if (commEl)
      commEl.addEventListener("input", function (e) {
        simState.avgCommission = Math.max(0, parseFloat(e.target.value) || 0);
        onChange();
      });
    if (resetBtn)
      resetBtn.addEventListener("click", function () {
        simState.totalOrders = realTotalOrders;
        simState.ndr = realNdrPct / 100;
        simState.avgCommission = realAvgCommission;
        simState.adSpend = d.adSpend != null ? Number(d.adSpend) : 0;
        simState.egpRate = d.egpRate != null ? d.egpRate : 52.0;
        simState.viewCurrency = state.currency; // Keep in sync with main currency
        simState._isModified = false;
        initSimInputs();
        updateSimUI();
      });

    // SFE currency tab clicks
    mountEl.querySelectorAll(".sfe-curr-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var curr = tab.dataset.sfecurr;
        state.currency = curr;
        state.viewCurrency = curr;
        simState.viewCurrency = curr;
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
      window.renderSection7(mountEl, data, ctx);
    };
    window.DashboardMarketingState.subscribe(mountEl._s7MarketingListener);
    mountEl._dashboardSectionCleanup = function () {
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


