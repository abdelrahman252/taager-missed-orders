/* ------------------------------------------------------------------------------
   section8-master.js
   Renders Section 8 — الرؤى السريعة (Master Dashboard)

   window.renderSection8(mountEl, data, ctx)
     mountEl  — the <div> to inject HTML into (cleared first)
     data     — the full aggregated dashData object
     ctx      — { onNavigate(sectionId), accent, formatSAR }

   Depends on (loaded before this via <script>):
     dashboard-shared.js  ? s8KpiCard, animateNumber, runKpiAnimations,
                            cardIconHtml, COLOR_MAP
     dashboard-styles.css ? .fade-up, @keyframes fadeUp, .s8-kpi-card
 ------------------------------------------------------------------------------ */

window.renderSection8 = function (mountEl, data, ctx) {
  'use strict';

  // -- Theme Observer ---------------------------------------------------------
  // Re-render the whole section whenever the user switches light ? dark so that
  // all inline-style bg/color values are recomputed for the new theme.
  if (mountEl._s8ThemeObserver) {
    mountEl._s8ThemeObserver.disconnect();
    mountEl._s8ThemeObserver = null;
  }
  var _s8ThemeObs = new MutationObserver(function (mutations) {
    if (mountEl.hidden) {
      mountEl._dashboardNeedsRefresh = true;
      return;
    }
    mutations.forEach(function (m) {
      if (m.attributeName === 'data-theme') {
        window.renderSection8(mountEl, data, ctx);
      }
    });
  });
  _s8ThemeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mountEl._s8ThemeObserver = _s8ThemeObs;

  /* -- helpers ------------------------------------------------------------- */
  var onNavigate = (ctx && ctx.onNavigate) ? ctx.onNavigate : function () {};
  var fmt = (ctx && ctx.formatSAR) ? ctx.formatSAR
            : (window.formatSAR || function (n) { return Number(n).toLocaleString('en-US'); });
  var isAr = (document.documentElement.getAttribute('lang') || window._kbotLang || 'ar') === 'ar';
  function s8Txt(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }
  function tx(key, fallback) {
    var value = window.dashboardI18n ? window.dashboardI18n.t(key) : key;
    var output = value && value !== key ? value : (fallback || key);
    return window.dashboardI18n && window.dashboardI18n.clean
      ? window.dashboardI18n.clean(output)
      : output;
  }
  function escAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function tipAttr(text) {
    return text ? ' data-tooltip="' + escAttr(text) + '" tabindex="0"' : '';
  }
  function num(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }
  function fmtCount(value, decimals) {
    return num(value, 0).toLocaleString('en-US', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  }
  function fmtPct(value) {
    var n = num(value, 0);
    return s8PctValue(n) + '%';
  }
  function s8PctValue(value, decimals) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    return n.toFixed(decimals == null ? 2 : decimals)
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '');
  }
  function dayLabel(value) {
    return isAr ? (value + ' يوم') : (value + ' days');
  }

  var d = data || {};

  // -- 0. Pull live calculator settings from DashboardRoiState (written by Section 7)
  var _roiAccountId = (ctx && ctx.data && ctx.data.meta && ctx.data.meta.activeAccountId) ||
    (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');
  var _roiLiveRaw = (window.DashboardRoiState && window.DashboardRoiState.get(_roiAccountId, d.roi || d)) || d.roi || {};
  
  var marketingState = window.DashboardMarketingState
    ? window.DashboardMarketingState.get(_roiAccountId)
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
  
  var nativeCurrency = (data && data.meta && data.meta.activeCurrency) || window.dashboardActiveCurrency || _roiLiveRaw.currency || 'SAR';
  var targetCurrency = nativeCurrency || _roiLiveRaw.currency || 'SAR';
  var roiCurrency = _roiLiveRaw.currency || targetCurrency;
  var egpRate = _roiLiveRaw.egpRate != null ? _roiLiveRaw.egpRate : 52.0;

  function roiMoney(value, decimals) {
    decimals = decimals == null ? 0 : decimals;
    if (window.formatDashboardMoney) return window.formatDashboardMoney(value, targetCurrency, decimals);
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }) + ' ' + targetCurrency;
  }

  function convert(val, from, to) {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(val, from, to);
    }
    if (from === to) return val;
    var sar = val;
    if (from === "USD") sar = val * 3.75;
    else if (from === "EGP") sar = (val / egpRate) * 3.75;
    if (to === "SAR") return sar;
    if (to === "USD") return sar / 3.75;
    if (to === "EGP") return (sar / 3.75) * egpRate;
    return val;
  }

  var finalAdSpend = _roiLiveRaw.adSpend != null
    ? convert(Number(_roiLiveRaw.adSpend) || 0, roiCurrency, targetCurrency)
    : (d.roi ? convert(Number(d.roi.adSpend) || 0, d.roi.currency || roiCurrency, targetCurrency) : 250);
  if (syncedSpendActive) {
    if (window.DashboardMarketingSpend && typeof window.DashboardMarketingSpend.aggregateSummary === "function") {
      finalAdSpend = Number(window.DashboardMarketingSpend.aggregateSummary(marketingState.summary, targetCurrency, {
        egpRate: egpRate,
      }).spend || 0);
    } else if (!sourceBreakdown.length) {
      finalAdSpend = convert(
        Number((marketingState.summary && marketingState.summary.adSpend) || 0),
        (marketingState.summary && marketingState.summary.currency) || targetCurrency,
        targetCurrency
      );
    } else {
      var convertedTotal = sourceBreakdown.reduce(function (total, source) {
        var rawSpend = Number(source.rawSpend || source.nativeRawSpend || 0);
        var convertedSpend = Number(source.convertedSpend || 0);
        if (convertedSpend > 0 && rawSpend <= 0) {
          return total + convert(convertedSpend, source.targetCurrency || marketingState.summary.currency || targetCurrency, targetCurrency);
        }
        return total + convert(rawSpend, source.currency || source.rawCurrency || "SAR", targetCurrency);
      }, 0);
      finalAdSpend = Number(convertedTotal.toFixed(2));
    }
  }

  var roiNetOrderCount = _roiLiveRaw.netOrderCount != null
    ? _roiLiveRaw.netOrderCount
    : (_roiLiveRaw.totalOrders != null ? _roiLiveRaw.totalOrders : (d.roi ? (d.roi.netOrderCount != null ? d.roi.netOrderCount : d.roi.totalOrders) : null));
  var roiLive = {
    adSpend:        finalAdSpend,
    netOrderCount:  roiNetOrderCount,
    totalOrders:    roiNetOrderCount,
    deliveredCount: _roiLiveRaw.deliveredCount != null ? _roiLiveRaw.deliveredCount : (d.roi ? d.roi.deliveredCount : null),
    avgCommission:  d.roi && d.roi.averageProfit != null
      ? d.roi.averageProfit
      : (_roiLiveRaw.avgCommission != null ? _roiLiveRaw.avgCommission : (d.roi && d.roi.avgCommission != null ? d.roi.avgCommission : 0)),
    ndrPct:         _roiLiveRaw.ndrPct         != null ? _roiLiveRaw.ndrPct         : (d.roi ? d.roi.ndrPct         : 0)
  };

  // -- 1. Resolve live data structures -----------------------------------------
  var overview = d.overview || {};
  var pipeline = d.pipeline || {};
  var cod = d.cod || {};
  var trend = d.commissionTrend || {};
  var comparisonLabel = d.meta && d.meta.comparisonLabel
    ? d.meta.comparisonLabel
    : s8Txt('vs previous period', 'مقارنة بالفترة السابقة');

  var totalOrders = overview.totalOrders ? overview.totalOrders.value : 0;
  var rawTotalOrders = Number((overview.totalOrders && overview.totalOrders.rawValue != null) ? overview.totalOrders.rawValue : totalOrders) || 0;
  var netTotalOrders = Number(totalOrders || 0) || 0;
  var totalOrdersDisplay = rawTotalOrders.toLocaleString('en-US') + ' / ' + netTotalOrders.toLocaleString('en-US');
  var earnedCommission = overview.earnedCommission ? overview.earnedCommission.value : 0;
  var incomingCommission = overview.incomingCommission ? overview.incomingCommission.value : 0;
  var lostCommission = overview.lostCommission ? overview.lostCommission.value : 0;

  // KPI Cards mapping
  // Taager dashboard/status/NDR migration: commission-named values are Taager profit.
  var KPI_CARDS = [
    { label: s8Txt('Earned Profit After Tax', 'الربح المحصل بعد الضريبة'), value: earnedCommission, unit: nativeCurrency, delta: overview.earnedCommission ? overview.earnedCommission.delta : 0, color: 'green',  spark: (overview.sparklines && overview.sparklines.earned) || [0], iconType: 'green', tooltip: s8Txt('Earned Profit After Tax = sum(order profit - tax profit) for delivered orders.', 'الربح المحصل بعد الضريبة = مجموع (ربح الطلب - ضريبة الربح) للطلبات المسلمة.') },
    { label: s8Txt('Incoming Profit After Tax', 'الربح القادم بعد الضريبة'),    value: incomingCommission, unit: nativeCurrency, delta: overview.incomingCommission ? overview.incomingCommission.delta : 0, color: 'orange', spark: (overview.sparklines && overview.sparklines.incoming) || [0], iconType: 'orange', tooltip: s8Txt('Incoming Profit After Tax = sum(order profit - tax profit) for active non-delivered orders.', 'الربح القادم بعد الضريبة = مجموع (ربح الطلب - ضريبة الربح) للطلبات النشطة غير المسلمة.') },
    { label: s8Txt('Lost Profit After Tax', 'الربح المفقود بعد الضريبة'),   value: lostCommission, unit: nativeCurrency, delta: overview.lostCommission ? overview.lostCommission.delta : 0, color: 'red',    spark: (overview.sparklines && overview.sparklines.lost) || [0], iconType: 'red', tooltip: s8Txt('Lost Profit After Tax = sum(order profit - tax profit) for failed and canceled orders, excluding Canceled by you.', 'الربح المفقود بعد الضريبة = مجموع (ربح الطلب - ضريبة الربح) للطلبات الفاشلة والملغاة، مع استبعاد الملغي بواسطتك.') },
    { label: s8Txt('Total / Net Orders', 'إجمالي / صافي الطلبات'), value: netTotalOrders, displayValue: totalOrdersDisplay, staticDisplay: true, unit: s8Txt('orders', 'طلبات'), delta: overview.totalOrders ? overview.totalOrders.delta : 0, color: 'blue', spark: (overview.sparklines && overview.sparklines.orders) || [0], iconType: 'blue', tooltip: tx('kpi.orders.tooltip', 'Total / Net Orders = raw orders / orders after excluding Canceled by you. Business metrics use net orders.') },
  ];

  var deliveredSalesInTarget = convert((overview.totalDeliveredSales && overview.totalDeliveredSales.value) || 0, nativeCurrency, targetCurrency);
  var netRoasUnavailable = !(roiLive.adSpend > 0);
  var netRoas = netRoasUnavailable ? 0 : (deliveredSalesInTarget / roiLive.adSpend);
  var netRoasDelta = overview.netRoas && overview.netRoas.delta != null ? Number(overview.netRoas.delta || 0) : 0;

  var NEW_KPI_CARDS = [
    { label: s8Txt('Net Total Sales', 'صافي إجمالي المبيعات'), value: overview.totalSales ? overview.totalSales.value : 0, unit: nativeCurrency, delta: overview.totalSales ? overview.totalSales.delta : 0, color: 'green', spark: [], iconType: 'green', tooltip: tx('kpi.totalSales.tooltip', 'Net total sales = sum of prices for net orders only, excluding Canceled by you.') },
    { label: s8Txt('Average Order Value (AOV)', 'متوسط قيمة الطلب (AOV)'), value: overview.overallAov ? overview.overallAov.value : 0, unit: nativeCurrency, delta: overview.overallAov ? overview.overallAov.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.overallAov.tooltip', 'متوسط قيمة الطلب الإجمالي ويحسب بقسمة إجمالي المبيعات على إجمالي الطلبات في الفترة المحددة.') },
    { label: s8Txt('Net Total Delivered Sales', 'صافي مبيعات الطلبات المسلمة'), value: overview.totalDeliveredSales ? overview.totalDeliveredSales.value : 0, unit: nativeCurrency, delta: overview.totalDeliveredSales ? overview.totalDeliveredSales.delta : 0, color: 'green', spark: [], iconType: 'green', tooltip: tx('kpi.totalDeliveredSales.tooltip', 'Net total delivered sales = sum of prices for delivered net orders only, excluding Canceled by you.') },
    { label: s8Txt('Average Order Value (Delivered)', 'متوسط قيمة الطلب المسلم'), value: overview.deliveredAov ? overview.deliveredAov.value : 0, unit: nativeCurrency, delta: overview.deliveredAov ? overview.deliveredAov.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.deliveredAov.tooltip', 'Delivered AOV = net delivered sales / delivered orders.') },
    { label: s8Txt('Confirmation Rate', 'نسبة التأكيد'), value: overview.confirmationRate ? overview.confirmationRate.value : 0, unit: '%', delta: overview.confirmationRate ? overview.confirmationRate.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.confirmationRate.tooltip', 'Confirmation Rate = progressed statuses / all orders. Confirmation + cancel + pending = 100%.') },
    { label: s8Txt('DR Rate', 'نسبة DR'), value: overview.drRate ? overview.drRate.value : 0, unit: '%', delta: overview.drRate ? overview.drRate.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.drRate.tooltip', 'DR = delivered orders / confirmed orders.') },
    { label: s8Txt('NDR Rate', 'نسبة NDR'), value: overview.ndrRate ? overview.ndrRate.value : (cod.ndrPct != null ? num(cod.ndrPct, 0) : 0), unit: '%', delta: overview.ndrRate ? overview.ndrRate.delta : 0, color: 'orange', spark: [], iconType: 'orange', tooltip: tx('kpi.ndrRate.tooltip', 'NDR = delivered orders / net placed orders.') },
    { label: s8Txt('Net ROAS', 'العائد الصافي على الإعلان'), value: netRoasUnavailable ? 0 : netRoas.toFixed(2), displayValue: netRoasUnavailable ? '—' : netRoas.toFixed(2), unit: 'x', delta: netRoasDelta, hideDelta: netRoasUnavailable, color: 'purple', spark: [], iconType: 'purple', tooltip: tx('kpi.netRoas.tooltip', s8Txt('Net ROAS = delivered sales divided by ad spend. It uses only successfully delivered order revenue, so pending, canceled, and returned orders do not inflate ad performance.', 'العائد الصافي على الإعلان يساوي المبيعات المسلمة مقسومة على الإنفاق الإعلاني، ويستخدم فقط إيرادات الطلبات المسلمة بنجاح حتى لا تضخم الطلبات المعلقة أو الملغاة أو المرتجعة أداء الإعلانات.')) }
  ];

  // Keep Performance Overview balanced as two rows of six cards.
  KPI_CARDS = KPI_CARDS.concat(NEW_KPI_CARDS.splice(0, 2));

  var STAGES = pipeline.stages || [
    { id: 'received', label: s8Txt('Order received', 'تم استلام الطلب'), count: 0, pct: '0%',  color: '#3b82f6' },
    { label: s8Txt('Confirmed', 'مؤكد'),           count: 0, pct: '0%',  color: '#3b82f6' },
    { label: s8Txt('Processing', 'قيد المعالجة'),   count: 0, pct: '0%',  color: '#3b82f6' },
    { label: s8Txt('On Hold', 'قيد الانتظار'),   count: 0, pct: '0%',  color: '#64748b' },
    { label: s8Txt('Shipping', 'قيد الشحن'),      count: 0, pct: '0%', color: '#f59e0b', sar: '0' },
    { label: s8Txt('Delivered', 'تم التسليم'),     count: 0, pct: '0%', color: '#00e676', sar: '0', highlight: 'green' },
    { label: s8Txt('Failed', 'فشل'),    count: 0, pct: '0%', color: '#ef4444', sar: '0', highlight: 'red' },
  ];

  function stageCountBy(match) {
    return STAGES.reduce(function (sum, stage) {
      return match(stage) ? sum + Number(stage.count || 0) : sum;
    }, 0);
  }
  var shippingCount = stageCountBy(function (stage) { return stage.id === 'shipping' || stage.exactBucket === 'shipping' || stage.bucket === 'shipping'; });
  var deliveredCount = stageCountBy(function (stage) { return stage.id === 'delivered' || stage.exactBucket === 'delivered' || stage.bucket === 'delivered'; });
  var failedCount = stageCountBy(function (stage) { return stage.businessGroup === 'lost' || stage.id === 'failed' || stage.exactBucket === 'failed' || stage.bucket === 'failed'; });

  var pNdr = cod.ndrPct != null ? num(cod.ndrPct, 0) : (d.roi ? num(d.roi.ndrPct, 0) : 0);
  var pConfirmation = cod.confirmationRate != null ? num(cod.confirmationRate, 0) : (overview.confirmationRate ? num(overview.confirmationRate.value, 0) : 0);
  var pDr = cod.drPct != null ? num(cod.drPct, 0) : (overview.drRate ? num(overview.drRate.value, 0) : 0);
  var pNdrColor = window.dashboardRateColor ? window.dashboardRateColor(pNdr) : (pNdr >= 40 ? '#22d3ee' : pNdr >= 30 ? '#00e676' : pNdr >= 20 ? '#f59e0b' : '#ef4444');
  
  var PIPELINE_SUMMARY = [
    { label: s8Txt('Net Orders', 'صافي الطلبات'),  value: String(totalOrders),  color: '#fff'    },
    { label: s8Txt('Net Delivery Rate (NDR)', 'معدل التسليم الصافي (NDR)'),    value: s8PctValue(pNdr) + '%', color: pNdrColor },
    { label: s8Txt('Confirmation Rate', 'نسبة التأكيد'), value: s8PctValue(pConfirmation) + '%', color: '#3b82f6' },
    { label: s8Txt('DR Rate', 'نسبة DR'), value: s8PctValue(pDr) + '%', color: '#22d3ee' },
    { label: s8Txt('Average Delivery Time', 'متوسط وقت التسليم'), value: (cod.avgDays == null ? s8Txt('Unavailable', 'غير متاح') : s8Txt(cod.avgDays + ' days', cod.avgDays + ' يوم')), color: '#fff' },
  ];

  PIPELINE_SUMMARY[1].tooltip = s8Txt(
    'NDR = delivered orders divided by net placed orders in the NDR cohort. NDR-excluded statuses, including Canceled by you, are removed from the base.',
    'NDR = delivered orders divided by net placed orders in the NDR cohort. NDR-excluded statuses, including Canceled by you, are removed from the base.'
  );
  PIPELINE_SUMMARY[3].tooltip = s8Txt(
    'DR = delivered orders divided by confirmed base orders. The base excludes Canceled by you and statuses outside the active delivery outcome base.',
    'DR = delivered orders divided by confirmed base orders. The base excludes Canceled by you and statuses outside the active delivery outcome base.'
  );
  PIPELINE_SUMMARY[4].tooltip = s8Txt(
    'Average Delivery Time = average days from order creation date to last update date for delivered net orders. Rows over 60 days or without valid dates are ignored.',
    'Average Delivery Time = average days from order creation date to last update date for delivered net orders. Rows over 60 days or without valid dates are ignored.'
  );

  // COD Cash Gaps
  var collected = cod.collectedSar != null ? num(cod.collectedSar, 0) : num(cod.collected, 0);
  var remaining = cod.gapSar != null ? num(cod.gapSar, 0) : num(cod.remaining, 0);
  var totalDue = cod.expectedCodSar != null ? num(cod.expectedCodSar, 0) : num(cod.totalDue, 0);
  var drPct = cod.drPct != null ? num(cod.drPct, 0) : num(cod.collectionRate, 0);
  var drDeliveredOrders = cod.drDeliveredOrders != null ? num(cod.drDeliveredOrders, 0) : num(cod.deliveredCount, 0);
  var drBaseOrders = cod.drBaseOrders != null ? num(cod.drBaseOrders, 0) : 0;
  var codNdrPct = cod.ndrPct != null ? num(cod.ndrPct, 0) : 0;
  var ndrBaseOrders = cod.ndrBaseOrders != null ? num(cod.ndrBaseOrders, 0) : totalOrders;
  var remainingRate = totalDue > 0 ? parseFloat(((remaining / totalDue) * 100).toFixed(1)) : 0;
  var codDrColor = window.dashboardRateColor ? window.dashboardRateColor(drPct) : (drPct >= 40 ? '#22d3ee' : drPct >= 30 ? '#00e676' : drPct >= 20 ? '#f59e0b' : '#ef4444');
  var codNdrColor = window.dashboardRateColor ? window.dashboardRateColor(codNdrPct) : (codNdrPct >= 40 ? '#22d3ee' : codNdrPct >= 30 ? '#00e676' : codNdrPct >= 20 ? '#f59e0b' : '#ef4444');

  var COD_METRICS = [
    { label: 'DR', value: s8PctValue(drPct) + '%',  pct: drDeliveredOrders + ' / ' + drBaseOrders,  color: codDrColor, icon: 'box'    },
    { label: 'NDR', value: s8PctValue(codNdrPct) + '%', pct: drDeliveredOrders + ' / ' + ndrBaseOrders, color: codNdrColor, icon: 'box'    },
    { label: s8Txt('Collected', 'تم التحصيل'), value: fmt(collected), pct: s8Txt(drDeliveredOrders + ' orders', drDeliveredOrders + ' طلب'), color: '#00e676', icon: 'box'  },
    { label: s8Txt('Gap', 'الفجوة'),     value: fmt(remaining), pct: remainingRate.toFixed(1) + '%', color: '#ef4444', icon: 'xcircle'},
  ];
  COD_METRICS[0].tooltip = s8Txt('DR = delivered orders / confirmed base orders.', 'DR = delivered orders / confirmed base orders.');
  COD_METRICS[1].tooltip = s8Txt('NDR = delivered orders / net placed orders in the NDR cohort.', 'NDR = delivered orders / net placed orders in the NDR cohort.');
  COD_METRICS[2].tooltip = s8Txt(
    'Collected = sum of Amount Due for delivered COD orders in the selected delivered period. Prepaid and Canceled by you orders are excluded.',
    'Collected = sum of Amount Due for delivered COD orders in the selected delivered period. Prepaid and Canceled by you orders are excluded.'
  );
  COD_METRICS[3].tooltip = s8Txt(
    'Gap = incoming COD still in active pipeline statuses. Due = Collected + Gap, and failed/lost COD is excluded from this live gap.',
    'Gap = incoming COD still in active pipeline statuses. Due = Collected + Gap, and failed/lost COD is excluded from this live gap.'
  );

  // These lists are backed by lazy getters in the aggregator. Read them when
  // Section 8 renders so the master dashboard never paints empty detail cards.
  var citiesList = cod.cities || [];
  var maxCollected = citiesList.reduce(function (max, c) {
    return Math.max(max, num(c.collected, 0));
  }, 0) || 1;
  var CITIES = citiesList.slice().sort(function (a, b) {
    return num(b.collected, 0) - num(a.collected, 0);
  }).slice(0, 5).map(function (c) {
    var cityCollected = num(c.collected, 0);
    var collectedPct = maxCollected > 0 ? (cityCollected / maxCollected) * 100 : 0;
    return {
      name: c.name,
      sar: cityCollected,
      pct: parseFloat(collectedPct.toFixed(1))
    };
  });

  // Top Products
  var PRODUCTS = d.products ? (d.products.rankedList || []) : [];
  var RANK_META = {
    1: { bg: 'linear-gradient(135deg,#fbbf24,#d97706)', glow: 'rgba(251,191,36,0.55)', accent: '#fbbf24' },
    2: { bg: 'linear-gradient(135deg,#d1d5db,#9ca3af)', glow: 'rgba(209,213,219,0.3)', accent: '#9ca3af' },
    3: { bg: 'linear-gradient(135deg,#cd7f32,#92400e)', glow: 'rgba(205,127,50,0.45)', accent: '#cd7f32' },
    4: { bg: 'rgba(100,116,139,0.55)',                   glow: 'none',                  accent: '#64748b' },
    5: { bg: 'rgba(100,116,139,0.55)',                   glow: 'none',                  accent: '#64748b' },
  };

  // Taager profit trend period mapping. Commission-named keys are retained for compatibility.
  var s8CommissionType = mountEl._s8CommissionType || 'earned';
  var activePeriodsObj, displayCommissionVal, displayDeltaVal, displayColor, displayTitle;

  if (s8CommissionType === 'incoming') {
    activePeriodsObj = trend.incomingPeriods || {};
    displayCommissionVal = incomingCommission;
    displayDeltaVal = overview.incomingCommission ? overview.incomingCommission.delta : 0;
    displayColor = '#f59e0b';
    displayTitle = s8Txt('Incoming Taager Profit After Tax', 'الربح القادم بعد الضريبة');
  } else if (s8CommissionType === 'lost') {
    activePeriodsObj = trend.lostPeriods || {};
    displayCommissionVal = lostCommission;
    displayDeltaVal = overview.lostCommission ? overview.lostCommission.delta : 0;
    displayColor = '#ef4444';
    displayTitle = s8Txt('Lost Taager Profit After Tax', 'الربح المفقود بعد الضريبة');
  } else {
    activePeriodsObj = trend.periods || {};
    displayCommissionVal = earnedCommission;
    displayDeltaVal = overview.earnedCommission ? overview.earnedCommission.delta : 0;
    displayColor = '#22c55e';
    displayTitle = s8Txt('Earned Taager Profit After Tax', 'الربح المحصل بعد الضريبة');
  }

  var CHART_DATA = activePeriodsObj['30'] || [];
  
  // Recalculate benchmarks based on selected data
  var CHART_TOTAL = CHART_DATA.reduce(function(sum, x) { return sum + x.v; }, 0);
  var activeDays = CHART_DATA.filter(function(x) { return x.v > 0; }).length || 1;
  var CHART_AVG = Math.round(CHART_TOTAL / activeDays);
  var CHART_BEST = CHART_DATA.length > 0 ? Math.max.apply(null, CHART_DATA.map(function (x) { return x.v; })) : 0;
  var CHART_WORST = CHART_DATA.length > 0 ? Math.min.apply(null, CHART_DATA.map(function (x) { return x.v; })) : 0;
  var CHART_ABOVE = CHART_DATA.filter(function (x) { return x.v > CHART_AVG; }).length;
  
  var bestDayObj = CHART_DATA.find(function (x) { return x.v === CHART_BEST; });
  var CHART_BEST_DAY = bestDayObj ? bestDayObj.d : '—';
  
  var worstDayObj = CHART_DATA.find(function (x) { return x.v === CHART_WORST; });
  var CHART_WORST_DAY = worstDayObj ? worstDayObj.d : '—';
  
  var chartDeltaSign = displayDeltaVal >= 0 ? s8Txt('Upward', 'اتجاه صاعد') : s8Txt('Downward', 'اتجاه هابط');
  var chartDeltaColor = displayDeltaVal >= 0 ? '#22c55e' : '#ef4444';

  var CHART_STATS = [
    { label: s8Txt('Average Daily Profit', 'متوسط الربح اليومي'), value: CHART_AVG.toLocaleString("en-US") + ' ' + nativeCurrency, color: 'rgba(255,255,255,0.6)', sub: null             },
    { label: s8Txt('Best Day', 'أفضل يوم'),              value: CHART_BEST.toLocaleString("en-US") + ' ' + nativeCurrency, color: '#fbbf24',               sub: CHART_BEST_DAY   },
    { label: s8Txt('Worst Day', 'أضعف يوم'),              value: CHART_WORST.toLocaleString("en-US") + ' ' + nativeCurrency, color: '#ef4444',               sub: CHART_WORST_DAY  },
    { label: s8Txt('Days Above Average', 'أيام فوق المتوسط'),      value: s8Txt(CHART_ABOVE + ' days', CHART_ABOVE + ' يوم'),                color: '#3b82f6',               sub: null             },
    { label: s8Txt('General Trend', 'الاتجاه العام'),          value: chartDeltaSign,                      color: chartDeltaColor,         sub: null             },
  ];
  
  var topDisplayDeltaSign = displayDeltaVal >= 0 ? '+ ' : '- ';
  var topDisplayDeltaColor = displayDeltaVal >= 0 ? '#84cc16' : '#ef4444';


  // Quick Summary dynamic items
  var ndrPct = cod.ndrPct != null ? num(cod.ndrPct, 0) : (d.roi ? num(d.roi.ndrPct, 0) : 0);
  var avgCommission = num(roiLive.avgCommission, 0);
  var accountSpend = Math.max(0, num(roiLive.adSpend, 0));
  var accountOrders = Math.max(0, window.DashboardOrderMetrics
    ? window.DashboardOrderMetrics.netOrders(roiLive)
    : (roiLive.totalOrders != null ? num(roiLive.totalOrders, 0) : num(totalOrders, 0)));
  var accountNdrPct = roiLive.ndrPct != null ? num(roiLive.ndrPct, 0) : ndrPct;
  var accountDeliveredOrders = roiLive.deliveredCount != null
    ? Math.max(0, num(roiLive.deliveredCount, 0))
    : Math.max(0, Math.round(accountOrders * (accountNdrPct / 100)));
  var avgCommissionInTargetCurrency = convert(avgCommission, nativeCurrency, targetCurrency);
  var accountCpa = accountOrders > 0 ? accountSpend / accountOrders : 0;
  var accountBreakEvenCpa = avgCommissionInTargetCurrency * (accountNdrPct / 100);
  var accountRevenue = accountDeliveredOrders * avgCommissionInTargetCurrency;
  var accountNetProfit = accountRevenue - accountSpend;
  var averageDeliveredOrderValue = overview.deliveredAov ? num(overview.deliveredAov.value, 0) : 0;
  var deliveredSalesValue = overview.totalDeliveredSales ? num(overview.totalDeliveredSales.value, 0) : 0;
  var activeCitiesCount = cod.totalCitiesCount != null
    ? num(cod.totalCitiesCount, 0)
    : (cod.summary && cod.summary.totalCitiesCount != null ? num(cod.summary.totalCitiesCount, 0) : citiesList.length);
  var uniqueProductsCount = d.products && d.products.summary
    ? d.products.summary.uniqueProducts
    : 0;
  var top80PctProducts = (function () {
    var ranked = PRODUCTS;
    var totalCommission = ranked.reduce(function (sum, p) { return sum + num(p.commission, 0); }, 0);
    if (!ranked.length || totalCommission <= 0) return 0;
    var threshold = totalCommission * 0.8;
    var running = 0;
    for (var i = 0; i < ranked.length; i++) {
      running += num(ranked[i].commission, 0);
      if (running >= threshold) return i + 1;
    }
    return ranked.length;
  })();
  var avgShippingValue = cod.avgDays == null ? null : num(cod.avgDays, 0).toFixed(1);
  var ndrVal = s8PctValue(ndrPct) + '%';
  var ndrSub = s8Txt(deliveredCount + ' of ' + totalOrders, deliveredCount + ' من ' + totalOrders);
  var drVal = s8PctValue(drPct) + '%';
  var drSub = s8Txt(drDeliveredOrders + ' of ' + drBaseOrders, drDeliveredOrders + ' من ' + drBaseOrders);
  var ndrMetricColor = window.dashboardRateColor ? window.dashboardRateColor(ndrPct) : (ndrPct >= 40 ? '#22d3ee' : ndrPct >= 30 ? '#00e676' : ndrPct >= 20 ? '#f59e0b' : '#ef4444');
  var drMetricColor = window.dashboardRateColor ? window.dashboardRateColor(drPct) : (drPct >= 40 ? '#22d3ee' : drPct >= 30 ? '#00e676' : drPct >= 20 ? '#f59e0b' : '#ef4444');
  var earnedDelta = overview.earnedCommission ? overview.earnedCommission.delta : 0;
  var deltaSign = earnedDelta >= 0 ? '+ ' : '- ';
  var deltaColor = earnedDelta >= 0 ? '#84cc16' : '#ef4444';

  var SUMMARY_ITEMS = [
    { id: 1, label: s8Txt('Products driving 80% of Taager Profit After Tax', 'منتجات تحقق 80% من الربح بعد الضريبة'), iconColor: '#3b82f6', value: String(top80PctProducts), sub: s8Txt('products', 'منتجات'), iconType: 'pie' },
    { id: 2, label: s8Txt('Net delivery rate', 'معدل التسليم الصافي'), iconColor: ndrMetricColor, value: ndrVal, sub: ndrSub, iconType: 'shield' },
    { id: 3, label: s8Txt('Average delivery time', 'متوسط وقت التسليم'), iconColor: '#06b6d4', value: avgShippingValue == null ? '—' : avgShippingValue, sub: avgShippingValue == null ? s8Txt('Unavailable', 'غير متاح') : dayLabel(avgShippingValue), iconType: 'clock' },
    { id: 4, label: s8Txt('Average delivered order value', 'متوسط قيمة الطلب المسلم'), iconColor: '#8b5cf6', value: averageDeliveredOrderValue.toFixed(1), sub: null, suffix: nativeCurrency, iconType: 'tag' },
    { id: 5, label: s8Txt('Active cities', 'المدن النشطة'), iconColor: '#f59e0b', value: String(activeCitiesCount), sub: s8Txt('cities', 'مدن'), iconType: 'map' },
    { id: 6, label: s8Txt('Delivery Rate (DR)', 'معدل التسليم (DR)'), iconColor: drMetricColor, value: drVal, sub: drSub, iconType: 'shield' },
    { id: 7, label: s8Txt('Taager Profit After Tax growth', 'نمو الربح بعد الضريبة'), iconColor: '#84cc16', value: deltaSign + Math.abs(earnedDelta).toFixed(1) + '%', sub: s8Txt('vs previous period', 'مقارنة بالفترة السابقة'), valueColor: deltaColor, iconType: 'trend' },
    { id: 8, label: s8Txt('Delivered sales', 'المبيعات المسلمة'), iconColor: '#00e676', value: fmt(deliveredSalesValue), sub: null, iconType: 'money' },
  ];

  SUMMARY_ITEMS[1].tooltip = s8Txt(
    'NDR = delivered orders / net placed orders in the NDR cohort. Orders excluded from NDR, such as Canceled by you, are removed from the base.',
    'NDR = delivered orders / net placed orders in the NDR cohort. Orders excluded from NDR, such as Canceled by you, are removed from the base.'
  );
  SUMMARY_ITEMS[2].tooltip = s8Txt(
    'Average Delivery Time = average days from order creation date to last update date for delivered net orders. Rows over 60 days or without valid dates are ignored.',
    'Average Delivery Time = average days from order creation date to last update date for delivered net orders. Rows over 60 days or without valid dates are ignored.'
  );
  SUMMARY_ITEMS[5].tooltip = s8Txt(
    'DR = delivered orders / confirmed base orders. The confirmed base excludes Canceled by you and statuses outside the active delivery outcome base.',
    'DR = delivered orders / confirmed base orders. The confirmed base excludes Canceled by you and statuses outside the active delivery outcome base.'
  );

  /* --------------------------------------------------------------------------
     HTML BUILDER FUNCTIONS
  -------------------------------------------------------------------------- */

  function sectionBadge(num, title, color) {
    color = color || '#a855f7';
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;justify-content:flex-end;">' +
      '<span style="font-size:14px;font-weight:700;color:#fff;">' + title + '</span>' +
      '<div style="width:26px;height:26px;border-radius:50%;background:' + color + '22;border:1.5px solid ' + color + '80;' +
        'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:' + color + ';flex-shrink:0;">' +
        num +
      '</div>' +
    '</div>';
  }

  function summaryIcon(type, color, size) {
    size = size || 22;
    var s = 'stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    var icons = {
      pie:    '<circle cx="12" cy="12" r="10" ' + s + ' fill="none"/><path d="M12 2 A10 10 0 0 1 22 12 L12 12 Z" fill="' + color + '" stroke="none"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" ' + s + ' fill="none"/>',
      clock:  '<circle cx="12" cy="12" r="10" ' + s + ' fill="none"/><path d="M12 6v6l4 2" ' + s + '/>',
      tag:    '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" ' + s + ' fill="none"/><line x1="7" y1="7" x2="7.01" y2="7" ' + s + '/>',
      map:    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" ' + s + ' fill="none"/><circle cx="12" cy="10" r="3" ' + s + ' fill="none"/>',
      chat:   '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" ' + s + ' fill="none"/>',
      money:  '<rect x="2" y="6" width="20" height="12" rx="2" ' + s + ' fill="none"/><circle cx="12" cy="12" r="3" ' + s + ' fill="none"/><path d="M6 10h.01M18 14h.01" ' + s + '/>',
      trend:  '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18" ' + s + '/><polyline points="17 6 23 6 23 12" ' + s + '/>',
      star:   '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" ' + s + ' fill="' + color + '"/>',
    };
    var path = icons[type] || icons.star;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' + path + '</svg>';
  }

  function codMetricIcon(type, color) {
    var s = 'stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    if (type === 'check') return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" ' + s + '/></svg>';
    if (type === 'xcircle') return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" ' + s + '/><path d="M15 9l-6 6M9 9l6 6" ' + s + '/></svg>';
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" ' + s + '/></svg>';
  }

  function pipelineStageCard(s, isFirst, isLast) {
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var isGreen = s.highlight === 'green';
    var isRed   = s.highlight === 'red';
    
    // Glassmorphism background
    var bg = isLight ? 'rgba(255,255,255,0.92)' : '#0d1220';
    if (isGreen) bg = isLight ? 'rgba(0,200,100,0.07)' : 'rgba(0, 20, 10, 0.85)';
    if (isRed)   bg = isLight ? 'rgba(239,68,68,0.07)'  : 'rgba(30, 5, 5, 0.85)';
    
    // The continuous glowing track at the top
    var trackGlow = isLight
      ? 'box-shadow: inset 0 2px 8px ' + s.color + '30;'
      : 'box-shadow: inset 0 2px 10px ' + s.color + '10;';
    var topBorder = '';
    
    // Edges of the track
    var borderRadius = 'border-radius: 0;';
    if (isFirst && !isLast) {
      borderRadius = isAr ? 'border-top-right-radius: 12px; border-bottom-right-radius: 12px;' : 'border-top-left-radius: 12px; border-bottom-left-radius: 12px;';
    } else if (isLast && !isFirst) {
      borderRadius = isAr ? 'border-top-left-radius: 12px; border-bottom-left-radius: 12px;' : 'border-top-right-radius: 12px; border-bottom-right-radius: 12px;';
    } else if (isFirst && isLast) {
      borderRadius = 'border-radius: 12px;';
    }
    
    // Separator line
    var sideBorder = '';
    if (!isLast) {
      var sepColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)';
      sideBorder = isAr ? 'border-left: 1px solid ' + sepColor + ';' : 'border-right: 1px solid ' + sepColor + ';';
    }
    
    var pctColor = isGreen ? '#00e676' : isRed ? '#ef4444' : s.color;
    var countColor  = isLight ? '#1e293b' : '#fff';
    var labelColor  = isLight ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.7)';
    var hoverBg     = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
    var topTintOpacity = isLight ? '25' : '15'; // hex suffix: 25 ~= 15%, 15 ~= 8%
    
    var stageLabelTranslations = {
      // Arabic input keys -> display label (for data coming in as Arabic)
      'بانتظار التأكيد': s8Txt('Awaiting Confirmation', 'بانتظار التأكيد'),
      'قيد التأكيد':     s8Txt('Awaiting Confirmation', 'بانتظار التأكيد'),
      'مؤكد':            s8Txt('Confirmed', 'مؤكد'),
      'قيد المعالجة':    s8Txt('Processing', 'قيد المعالجة'),
      'قيد الانتظار':    s8Txt('Waiting', 'قيد الانتظار'),
      'قيد الشحن':       s8Txt('In Shipping', 'قيد الشحن'),
      'تم التوصيل':      s8Txt('Delivered', 'تم التوصيل'),
      'فشل / ملغي':      s8Txt('Failed', 'فشل'),
      'فشل / ملغى':      s8Txt('Failed', 'فشل'),
      'فشل':             s8Txt('Failed', 'فشل'),
      'ملغي بواسطتك':    s8Txt('Canceled by you', 'ملغي بواسطتك'),
      // English input keys -> display label (for data coming in as English from the server)
      'Awaiting Confirmation': s8Txt('Awaiting Confirmation', 'بانتظار التأكيد'),
      'Pending Confirmation':  s8Txt('Awaiting Confirmation', 'بانتظار التأكيد'),
      'Confirmed':             s8Txt('Confirmed', 'مؤكد'),
      'Processing':            s8Txt('Processing', 'قيد المعالجة'),
      'On Hold':               s8Txt('Waiting', 'قيد الانتظار'),
      'Waiting':               s8Txt('Waiting', 'قيد الانتظار'),
      'Shipping':              s8Txt('In Shipping', 'قيد الشحن'),
      'In Shipping':           s8Txt('In Shipping', 'قيد الشحن'),
      'Delivered':             s8Txt('Delivered', 'تم التوصيل'),
      'Failed / Canceled':     s8Txt('Failed', 'فشل'),
      'Failed':                s8Txt('Failed', 'فشل'),
      'Canceled by you':       s8Txt('Canceled by you', 'ملغي بواسطتك'),
      'Canceled':              s8Txt('Canceled by you', 'ملغي بواسطتك'),
    };
    var displayLabel = stageLabelTranslations[s.label] || s.label;

    var stageIcons = {
      'Pending Confirmation': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'Confirmed':           '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      'Processing':   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
      'On Hold':   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'Shipping':      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
      'Pending Confirmation': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'Confirmed':           '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      'Processing':   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
      'On Hold':   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'Shipping':      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
      'Delivered':     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
      'Failed / Canceled':    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      'Failed':    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      'Canceled by you':    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
      'بانتظار التأكيد': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'قيد التأكيد':     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'مؤكد':            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 0 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      'قيد المعالجة':    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
      'قيد الانتظار':    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'قيد الشحن':       '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
      'تم التوصيل':      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
      'فشل / ملغي':      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      'فشل':             '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      'ملغي بواسطتك':    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
    };
    var iconSvg = stageIcons[displayLabel] || stageIcons[s.label] || stageIcons['Pending Confirmation'];
    var sarLabel = s.sarLabel || '';
    if (!sarLabel && s.sar) {
      if (displayLabel === s8Txt('In Shipping', 'قيد الشحن') || displayLabel === s8Txt('Shipping', 'قيد الشحن')) {
        sarLabel = s8Txt('Incoming Profit After Tax', 'الربح القادم بعد الضريبة');
      } else if (displayLabel === s8Txt('Delivered', 'تم التوصيل')) {
        sarLabel = s8Txt('Earned Profit After Tax', 'الربح المحقق بعد الضريبة');
      } else if (displayLabel === s8Txt('Failed', 'فشل')) {
        sarLabel = s8Txt('Lost Profit After Tax', 'الربح الضائع بعد الضريبة');
      }
    }
    var sarHtml = '';
    if (s.sar) {
      sarHtml = '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1.05;">' +
        '<span style="font-family:\'Inter\', sans-serif;font-size:10px;font-weight:700;color:' + s.color + ';">' + s.sar + ' ' + nativeCurrency + '</span>' +
        (sarLabel ? '<span style="font-family:\'Inter\', sans-serif;font-size:7px;font-weight:600;color:rgba(255,255,255,0.42);text-align:center;max-width:72px;">' + sarLabel + '</span>' : '') +
      '</div>';
    }

    return '<div style="background:' + bg + ';' + topBorder + borderRadius + trackGlow + sideBorder +
      'padding:12px 4px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:6px;flex:1;min-width:60px;' +
      'cursor:pointer;transition:all 0.2s ease;box-sizing:border-box;position:relative;" ' +
      'onmouseenter="this.style.background=\'' + hoverBg + '\'; this.style.transform=\'translateY(-2px)\'; this.style.zIndex=\'10\';" ' +
      'onmouseleave="this.style.background=\'' + bg + '\'; this.style.transform=\'none\'; this.style.zIndex=\'1\';">' +
      
      '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:' + s.color + ';pointer-events:none;' + (isFirst && !isLast ? (isAr ? 'border-top-right-radius:12px;' : 'border-top-left-radius:12px;') : isLast && !isFirst ? (isAr ? 'border-top-left-radius:12px;' : 'border-top-right-radius:12px;') : isFirst && isLast ? 'border-radius:12px 12px 0 0;' : '') + '"></div>' +
      '<div style="position:absolute;top:3px;left:0;right:0;height:37px;background:linear-gradient(to bottom, ' + s.color + topTintOpacity + ', transparent);pointer-events:none;"></div>' +

      '<div style="font-family:\'Inter\', \'Cairo\', sans-serif;font-size:10px;color:' + labelColor + ';text-align:center;direction:' + (isAr ? 'rtl' : 'ltr') + ';line-height:1.2;min-height:24px;display:flex;align-items:center;justify-content:center;z-index:1;font-weight:600;">' + displayLabel + '</div>' +
      
      '<div style="width:30px;height:30px;border-radius:50%;background:' + s.color + '10;border:1px solid ' + s.color + '30;box-shadow:0 0 14px ' + s.color + '20;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1;color:' + s.color + ';">' +
        iconSvg +
      '</div>' +
      
      '<span style="font-family:\'Inter\', sans-serif;font-size:18px;font-weight:800;color:' + countColor + ';line-height:1;margin-top:2px;z-index:1;white-space:nowrap;">' + s.count + '</span>' +
      
      '<span style="font-family:\'Inter\', sans-serif;font-size:10px;font-weight:700;color:' + pctColor + ';background:' + pctColor + '15;padding:2px 6px;border-radius:6px;z-index:1;">' +
        ((typeof s.pct === 'string' && s.pct.indexOf('%') !== -1) ? s.pct : s.pct + '%') +
      '</span>' +
      
      '<div style="min-height:30px;display:flex;align-items:center;margin-top:2px;z-index:1;">' +
        sarHtml +
      '</div>' +
    '</div>';
  }

  function codDonutSvg(totalDue, collected, remaining, cx, cy, R, strokeWidth) {
    if (totalDue <= 0) totalDue = 1;
    var C = 2 * Math.PI * R;
    
    var blueLen = C / 2;
    var greenLen = (collected / totalDue) * (C / 2);
    var redLen = (remaining / totalDue) * (C / 2);
    
    var html = '';
    
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#3b82f6" stroke-width="' + strokeWidth + '" ' +
            'stroke-dasharray="' + blueLen + ' ' + C + '" stroke-dashoffset="0" ' +
            'transform="rotate(90 ' + cx + ' ' + cy + ')" style="filter:drop-shadow(0 0 12px rgba(59,130,246,0.65));" />';
            
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#00e676" stroke-width="' + strokeWidth + '" ' +
            'stroke-dasharray="' + greenLen + ' ' + C + '" stroke-dashoffset="-' + blueLen + '" ' +
            'transform="rotate(90 ' + cx + ' ' + cy + ')" style="filter:drop-shadow(0 0 12px rgba(0,230,118,0.65));" />';
            
    var redOffset = blueLen + greenLen;
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#ef4444" stroke-width="' + strokeWidth + '" ' +
            'stroke-dasharray="' + redLen + ' ' + C + '" stroke-dashoffset="-' + redOffset + '" ' +
            'transform="rotate(90 ' + cx + ' ' + cy + ')" style="filter:drop-shadow(0 0 12px rgba(239,68,68,0.65));" />';
            
    return html;
  }

  function roiGaugeSvg(roi) {
    var clamp = Math.min(Math.max(roi, -100), 300);
    var pct   = (clamp + 100) / 400;
    var W = 280, H = 170, cx = W / 2, cy = H - 22, R = 108, SW = 14;

    function gaugePoint(t, r) {
      var stdDeg = 180 - t * 180;
      var rad    = (stdDeg * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
    }
    function arcPath(t0, t1) {
      var s = gaugePoint(t0, R), e = gaugePoint(t1, R);
      var large = (t1 - t0) > 0.5 ? 1 : 0;
      return 'M ' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) +
             ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + e.x.toFixed(2) + ' ' + e.y.toFixed(2);
    }
    var needle = gaugePoint(pct, R - 10);
    var needleColor = roi < 0 ? '#ef4444' : roi < 50 ? '#f59e0b' : '#00e676';
    var roiLabel = (roi > 0 ? '+' : '') + roi.toFixed(1) + '%';
    var badgeLabel = roi >= 50 ? s8Txt('Profitable ROI', 'عائد مربح') : roi >= 0 ? s8Txt('Near break-even', 'قريب من التعادل') : s8Txt('Losing ROI', 'عائد خاسر');
    var ticks = [
      { t: 0,    l: '-100%' },
      { t: 0.25, l: '0%'    },
      { t: 0.50, l: '100%'  },
      { t: 0.75, l: '200%'  },
      { t: 1.00, l: '300%+' },
    ];
    var ticksSvg = ticks.map(function (tk) {
      var pt = gaugePoint(tk.t, R + SW / 2 + 12);
      var tickFill = isLight ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.4)';
      return '<text x="' + pt.x.toFixed(2) + '" y="' + (pt.y + 3).toFixed(2) + '" text-anchor="middle" fill="' + tickFill + '" font-size="8" font-weight="600">' + tk.l + '</text>';
    }).join('');
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var needleStroke  = isLight ? '#1e293b' : '#fff';
    var needleShadow  = isLight ? 'drop-shadow(0 0 3px rgba(0,0,0,0.3))' : 'drop-shadow(0 0 4px rgba(255,255,255,0.65))';
    var centerFill    = isLight ? '#1e293b' : '#fff';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="overflow:visible">' +
      '<defs><linearGradient id="s8-roi-gauge" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ef4444"/><stop offset="42%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#00e676"/></linearGradient></defs>' +
      '<path d="' + arcPath(0, 1) + '" fill="none" stroke="#1f2937" stroke-width="' + SW + '" stroke-linecap="round"/>' +
      '<path d="' + arcPath(0, 1) + '" fill="none" stroke="url(#s8-roi-gauge)" stroke-width="' + SW + '" stroke-linecap="round" opacity="0.9" style="filter:drop-shadow(0 0 10px ' + needleColor + '44)"/>' +
      ticksSvg +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + needle.x.toFixed(2) + '" y2="' + needle.y.toFixed(2) + '" stroke="' + needleStroke + '" stroke-width="3" stroke-linecap="round" style="filter:' + needleShadow + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + centerFill + '"/>' +
      '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" fill="' + needleColor + '" font-size="27" font-weight="900" font-family="Cairo">' + roiLabel + '</text>' +
      '</svg>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:-8px;">' +
        '<div style="width:6px;height:6px;border-radius:50%;background:' + needleColor + ';box-shadow:0 0 6px ' + needleColor + ';"></div>' +
        '<span style="font-size:11px;color:' + needleColor + ';font-weight:700;font-family:Cairo;">' + badgeLabel + '</span>' +
      '</div>';
  }

  function starsHtml(rating) {
    var full  = Math.floor(rating);
    var half  = rating - full >= 0.25 ? 1 : 0;
    var empty = 5 - full - half;
    var out = '<div style="display:flex;align-items:center;gap:3px;">';
    for (var i = 0; i < full; i++) {
      out += '<svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="1.5" style="filter:drop-shadow(0 0 4px #facc15);flex-shrink:0;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }
    if (half) {
      out += '<div style="position:relative;width:13px;height:13px;display:inline-flex;flex-shrink:0;">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="1.5" style="position:absolute;top:0;left:0;opacity:0.35;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '<div style="position:absolute;top:0;left:0;width:50%;overflow:hidden;">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="1.5" style="filter:drop-shadow(0 0 4px #facc15);"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '</div>' +
      '</div>';
    }
    for (var j = 0; j < empty; j++) {
      out += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="1.5" style="opacity:0.3;flex-shrink:0;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }
    return out + '</div>';
  }

  /* --------------------------------------------------------------------------
     BUILD THE FULL HTML
  -------------------------------------------------------------------------- */

  var kpiRowHtml = KPI_CARDS.map(function (c, i) {
    return '<div class="fade-up" style="flex:1 1 calc((100% - 50px) / 6);min-width:170px;animation-delay:' + (i * 100) + 'ms;">' +
      window.s8KpiCard({
        label: c.label, value: c.value, displayValue: c.displayValue, staticDisplay: c.staticDisplay, unit: c.unit, delta: c.delta, deltaLabel: comparisonLabel, hideDelta: c.hideDelta,
        color: c.color, sparklineData: c.spark, iconType: c.iconType,
        tooltip: c.tooltip
      }) +
    '</div>';
  }).join('');

  var newKpiRowHtml = NEW_KPI_CARDS.map(function (c, i) {
    return '<div class="fade-up" style="flex:1 1 calc((100% - 50px) / 6);min-width:170px;animation-delay:' + ((i + 6) * 100) + 'ms;">' +
      window.s8KpiCard({
        label: c.label, value: c.value, displayValue: c.displayValue, staticDisplay: c.staticDisplay, unit: c.unit, delta: c.delta, deltaLabel: comparisonLabel, hideDelta: c.hideDelta,
        color: c.color, sparklineData: c.spark, iconType: c.iconType,
        tooltip: c.tooltip
      }) +
    '</div>';
  }).join('');

  var financialKpiCards = [
    { label: s8Txt('Average Profit', 'متوسط الربح'), value: avgCommissionInTargetCurrency, decimals: 2, color: 'green', iconType: 'green', tooltip: s8Txt('Average Profit = average profit after tax per delivered order.', 'متوسط الربح = متوسط الربح بعد الضريبة لكل طلب مسلم.') },
    { label: s8Txt('Account CPA', 'تكلفة الطلب للحساب'), value: accountCpa, decimals: 2, color: 'purple', iconType: 'purple', tooltip: s8Txt('Account CPA = total spend divided by net total orders.', 'تكلفة الطلب للحساب = إجمالي الإنفاق مقسوما على صافي إجمالي الطلبات.') },
    { label: s8Txt('Account Break-even CPA', 'تكلفة التعادل للحساب'), value: accountBreakEvenCpa, decimals: 2, color: 'orange', iconType: 'orange', tooltip: s8Txt('Account Break-even CPA = average profit after tax per delivered order multiplied by account NDR.', 'تكلفة التعادل للحساب = متوسط الربح بعد الضريبة لكل طلب مسلم مضروبا في نسبة التسليم الصافي للحساب.') },
    { label: s8Txt('Total Spend', 'إجمالي الإنفاق'), value: accountSpend, decimals: 0, color: 'blue', iconType: 'blue', tooltip: s8Txt('Total Spend = live connected marketing spend or the current Account Calculator spend.', 'إجمالي الإنفاق = الإنفاق التسويقي المتصل مباشرة أو إنفاق حاسبة الحساب الحالي.') },
    { label: s8Txt('Total Revenue', 'إجمالي الإيرادات'), value: accountRevenue, decimals: 0, color: 'green', iconType: 'green', tooltip: s8Txt('Total Revenue = delivered orders multiplied by average profit after tax per delivered order.', 'إجمالي الإيرادات = الطلبات المسلمة مضروبة في متوسط الربح بعد الضريبة لكل طلب مسلم.') },
    { label: s8Txt('Net Profit', 'صافي الربح'), value: accountNetProfit, decimals: 0, color: accountNetProfit >= 0 ? 'green' : 'red', iconType: accountNetProfit >= 0 ? 'green' : 'red', tooltip: s8Txt('Net Profit = total revenue minus total spend.', 'صافي الربح = إجمالي الإيرادات ناقص إجمالي الإنفاق.') }
  ];

  var financialKpiRowHtml = financialKpiCards.map(function (c, i) {
    return '<div class="fade-up" style="flex:1 1 calc((100% - 50px) / 6);min-width:170px;animation-delay:' + ((i + 12) * 100) + 'ms;">' +
      window.s8KpiCard({
        label: c.label, value: c.value, unit: targetCurrency, decimals: c.decimals, delta: 0, hideDelta: true,
        color: c.color, sparklineData: [], iconType: c.iconType,
        tooltip: c.tooltip
      }) +
    '</div>';
  }).join('');

  function compactMasterStages(inputStages) {
    var source = Array.isArray(inputStages) ? inputStages : [];
    var byId = {};
    source.forEach(function (stage) {
      if (!stage) return;
      byId[stage.id] = stage;
      if (stage.exactBucket) byId[stage.exactBucket] = stage;
      if (stage.bucket) byId[stage.bucket] = stage;
    });
    function pick(id, fallback) {
      return Object.assign({}, fallback || {}, byId[id] || {});
    }
    function valueOf(row, key) {
      if (!row) return 0;
      var raw = row[key] != null ? row[key] : 0;
      return Number(String(raw).replace(/[^\d.-]/g, '') || 0);
    }
    function combine(id, label, ids, color, businessGroup) {
      var rows = ids.map(function (id) { return byId[id]; }).filter(Boolean);
      var count = rows.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
      var total = STAGES.filter(function (row) { return row && row.id !== 'canceled_by_you' && row.exactBucket !== 'canceled_by_you'; })
        .reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0) || 1;
      var share = parseFloat(((count / total) * 100).toFixed(1));
      var sar = rows.reduce(function (sum, row) {
        return sum + valueOf(row, 'profitAfterTax') + (row.profitAfterTax == null ? valueOf(row, 'sar') : 0);
      }, 0);
      return {
        id: id,
        label: label,
        shortLabel: label,
        count: count,
        pct: share + '%',
        share: share,
        color: color,
        businessGroup: businessGroup,
        sar: sar ? sar.toLocaleString('en-US', { maximumFractionDigits: 2 }) : undefined
      };
    }
    function confirmationStage() {
      var row = pick('confirmed', { id: 'confirmed', label: s8Txt('Confirmation', '\u0627\u0644\u062a\u0623\u0643\u064a\u062f'), count: 0, pct: '0%', color: '#3b82f6' });
      var metrics = (pipeline && pipeline.metrics) || {};
      var aggregateCount = metrics.confirmationStatusCount != null
        ? Number(metrics.confirmationStatusCount)
        : (metrics.confirmedCount != null ? Number(metrics.confirmedCount) : NaN);
      if (!Number.isFinite(aggregateCount)) return row;
      var total = Number(metrics.statusTotalCount || metrics.netOrderCount || metrics.totalOrders || 0) || STAGES.filter(function (stage) {
        return stage && stage.id !== 'canceled_by_you' && stage.exactBucket !== 'canceled_by_you';
      }).reduce(function (sum, stage) { return sum + Number(stage.count || 0); }, 0) || 1;
      var share = parseFloat(((aggregateCount / total) * 100).toFixed(1));
      row.id = 'confirmation';
      row.exactBucket = 'confirmed';
      row.label = s8Txt('Confirmation', '\u0627\u0644\u062a\u0623\u0643\u064a\u062f');
      row.shortLabel = row.label;
      row.count = aggregateCount;
      row.pct = share + '%';
      row.share = share;
      row.businessGroup = 'confirmation';
      return row;
    }
    return [
      pick('received',        { id: 'received',        label: s8Txt('Order received',        'تم استلام الطلب'),   count: 0, pct: '0%', color: '#3b82f6' }),
      confirmationStage(),
      pick('waiting',         { id: 'waiting',         label: s8Txt('Awaiting shipment',      'في انتظار الشحن'),   count: 0, pct: '0%', color: '#64748b' }),
      pick('on_hold',         { id: 'on_hold',         label: s8Txt('Temporarily Suspended',  'معلق مؤقتًا'),       count: 0, pct: '0%', color: '#64748b' }),
      combine('shipping', s8Txt('Out for delivery', 'قيد التوصيل'), ['shipping', 'delivery_suspended', 'after_sales_progress'], '#f59e0b', 'incoming'),
      pick('delivered',       { id: 'delivered',       label: s8Txt('Delivered',              'تم التوصيل'),        count: 0, pct: '0%', color: '#00e676' }),
      combine('lost', s8Txt('Failed / Lost', 'فشل / ضائع'), ['customer_refused_confirmation', 'failed', 'return_verified', 'out_of_stock', 'after_sales_done'], '#ef4444', 'lost'),
      pick('canceled_by_you', { id: 'canceled_by_you', label: s8Txt('Canceled by you',        'ملغي بواسطتك'),      count: 0, pct: '0%', color: '#94a3b8' })
    ];
  }

  function compactStatusGroupStages(inputStages) {
    var confirmationIds = ['confirmed', 'waiting', 'shipping', 'delivery_suspended', 'delivered', 'failed', 'return_verified', 'after_sales_progress', 'after_sales_done'];
    var cancelIds = ['customer_refused_confirmation', 'canceled_by_you', 'on_hold', 'out_of_stock'];
    var groups = {
      confirmation: { id: 'confirmation', label: s8Txt('Confirmation / Progressed', 'التأكيد / تم التقدم'), count: 0, sar: 0, color: '#3b82f6', businessGroup: 'confirmation' },
      cancel: { id: 'cancel', label: s8Txt('Cancel / Rejected', 'إلغاء / مرفوض'), count: 0, sar: 0, color: '#ef4444', businessGroup: 'cancel' },
      pending: { id: 'pending', label: s8Txt('Pending / Untouched', 'معلق / لم تتم معالجته'), count: 0, sar: 0, color: '#f59e0b', businessGroup: 'pending' }
    };
    (Array.isArray(inputStages) ? inputStages : []).forEach(function (stage) {
      if (!stage) return;
      var group = confirmationIds.indexOf(stage.id) !== -1
        ? groups.confirmation
        : cancelIds.indexOf(stage.id) !== -1
          ? groups.cancel
          : stage.id === 'received'
            ? groups.pending
            : null;
      if (!group) return;
      group.count += Number(stage.count || 0);
      group.sar += Number(stage.sar || 0);
    });
    var total = groups.confirmation.count + groups.cancel.count + groups.pending.count;
    var confirmationPct = total ? Math.round(groups.confirmation.count / total * 1000) / 10 : 0;
    var cancelPct = total ? Math.round(groups.cancel.count / total * 1000) / 10 : 0;
    var pendingPct = total ? Math.max(0, Math.round((100 - confirmationPct - cancelPct) * 10) / 10) : 0;
    groups.confirmation.pct = confirmationPct.toFixed(1) + '%';
    groups.cancel.pct = cancelPct.toFixed(1) + '%';
    groups.pending.pct = pendingPct.toFixed(1) + '%';
    return [groups.confirmation, groups.cancel, groups.pending];
  }

  var VISIBLE_STAGES = compactMasterStages(STAGES);

  var pipelineStagesHtml = VISIBLE_STAGES.map(function (s, i) {
    var isFirst = i === 0;
    var isLast = i === VISIBLE_STAGES.length - 1;
    var card = pipelineStageCard(s, isFirst, isLast);
    var nextColor = (i < VISIBLE_STAGES.length - 1) ? VISIBLE_STAGES[i+1].color : '#fff';
    var arrowPath = isAr ? '<polyline points="15 18 9 12 15 6"/>' : '<polyline points="9 18 15 12 9 6"/>';
    var isLightMode = document.documentElement.getAttribute('data-theme') === 'light';
    var chevBg = isLightMode ? 'rgba(255,255,255,0.95)' : '#0a0f18';
    var chevBorder = isLightMode ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    var chev = (i < VISIBLE_STAGES.length - 1) ?
      '<div style="display:flex;align-items:center;justify-content:center;width:24px;margin:0 -12px;z-index:2;pointer-events:none;">' +
        '<div style="width:24px;height:24px;background:' + chevBg + ';border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid ' + chevBorder + ';box-shadow:0 0 10px rgba(0,0,0,0.3);">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + nextColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px ' + nextColor + '60)">' + arrowPath + '</svg>' +
        '</div>' +
      '</div>' : '';
    return '<div style="flex:1;min-width:0;position:relative;display:flex;">' + card + chev + '</div>';
  }).join('');

  var pipelineSummaryRow1Html = PIPELINE_SUMMARY.slice(0, 3).map(function (s) {
    var valHtml = '<span style="font-family:\'Inter\', sans-serif;font-size:14px;font-weight:800;color:' + s.color + ';white-space:nowrap;">' + s.value + '</span>';
    if (s.suffix) {
      valHtml += '<span style="font-family:\'Inter\', sans-serif;font-size:9px;font-weight:700;color:rgba(255,255,255,0.4);margin-left:3px;">' + s.suffix + '</span>';
    }
    return '<div ' + tipAttr(s.tooltip) + ' style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;">' +
      '<span style="font-family:\'Inter\', \'Cairo\', sans-serif;font-size:9px;color:rgba(255,255,255,0.55);font-weight:600;white-space:nowrap;text-align:center;">' + s.label + '</span>' +
      '<div style="display:flex;align-items:baseline;direction:ltr;white-space:nowrap;">' + valHtml + '</div>' +
    '</div>';
  }).join('');

  var pipelineSummaryRow2Html = PIPELINE_SUMMARY.slice(3).map(function (s) {
    var valHtml = '<span style="font-family:\'Inter\', sans-serif;font-size:14px;font-weight:800;color:' + s.color + ';white-space:nowrap;">' + s.value + '</span>';
    if (s.suffix) {
      valHtml += '<span style="font-family:\'Inter\', sans-serif;font-size:9px;font-weight:700;color:rgba(255,255,255,0.4);margin-left:3px;">' + s.suffix + '</span>';
    }
    return '<div ' + tipAttr(s.tooltip) + ' style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;">' +
      '<span style="font-family:\'Inter\', \'Cairo\', sans-serif;font-size:9px;color:rgba(255,255,255,0.55);font-weight:600;white-space:nowrap;text-align:center;">' + s.label + '</span>' +
      '<div style="display:flex;align-items:baseline;direction:ltr;white-space:nowrap;">' + valHtml + '</div>' +
    '</div>';
  }).join('');

  var pipelineSummaryAllHtml = PIPELINE_SUMMARY.map(function (s) {
    var valHtml = '<span class="s8-pipeline-summary-value" style="color:' + s.color + ';">' + s.value + '</span>';
    if (s.suffix) {
      valHtml += '<span class="s8-pipeline-summary-unit">' + s.suffix + '</span>';
    }
    return '<div class="s8-pipeline-summary-item" ' + tipAttr(s.tooltip) + '>' +
      '<span class="s8-pipeline-summary-label">' + s.label + '</span>' +
      '<div class="s8-pipeline-summary-number">' + valHtml + '</div>' +
    '</div>';
  }).join('');

  var donutPaths = codDonutSvg(drBaseOrders || 1, drDeliveredOrders, Math.max(0, drBaseOrders - drDeliveredOrders), 65, 65, 52, 16);
  var codMetricsHtml = COD_METRICS.map(function (m) {
    var metricUnit = (m.label === 'DR' || m.label === 'NDR') ? '' : nativeCurrency;
    return '<div ' + tipAttr(m.tooltip) + ' style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:' + m.color + '0a;' +
      'border:1px solid ' + m.color + '30;border-radius:10px;direction:ltr;position:relative;box-sizing:border-box;">' +
      '<div style="width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        codMetricIcon(m.icon, m.color) +
      '</div>' +
      '<div style="flex:1;min-width:0;direction:' + (isAr ? 'rtl' : 'ltr') + ';display:flex;flex-direction:column;justify-content:center;">' +
        '<div style="font-size:9px;color:' + m.color + ';font-weight:700;margin-bottom:2px;">' + m.label + '</div>' +
        '<div style="display:flex;align-items:baseline;gap:3px;justify-content:flex-start;direction:ltr;flex-direction:row-reverse;">' +
          '<span style="font-size:13px;font-weight:900;color:#fff;line-height:1;white-space:nowrap;">' + m.value + '</span>' +
          (metricUnit ? '<span style="font-size:9px;color:rgba(255,255,255,0.6);font-weight:600;">' + metricUnit + '</span>' : '') +
        '</div>' +
        '<div style="font-size:9px;color:' + m.color + ';font-weight:700;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + m.pct + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  var citiesHtml = CITIES.map(function (c, i) {
    var citySar = num(c.sar != null ? c.sar : c.gap, 0);
    var citySarLabel = fmt(citySar, citySar % 1 ? 1 : 0);
    return '<div class="city-bar-row" style="display:flex;flex-direction:column;gap:6px;direction:ltr;" data-pct="' + c.pct + '" data-delay="' + (i * 40) + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;color:#60a5fa;font-weight:700;">' + c.name + '</span>' +
        '<div style="display:flex;align-items:baseline;gap:4px;">' +
          '<span style="font-size:11px;color:#fff;font-weight:800;">' + citySarLabel + '</span>' +
          '<span style="font-size:8px;color:rgba(255,255,255,0.4);font-weight:600;">' + nativeCurrency + '</span>' +
        '</div>' +
      '</div>' +
      '<div style="width:100%;height:4px;background:rgba(59,130,246,0.1);border-radius:2px;overflow:hidden;">' +
        '<div class="city-bar-fill" style="width:0%;height:100%;background:#3b82f6;border-radius:2px;box-shadow:0 0 8px #3b82f6;' +
          'transition:width 0.4s ease-out;"></div>' +
      '</div>' +
    '</div>';
  }).join('');

  var TOP_PRODUCTS = PRODUCTS.slice(0, 15);
  var numPages = Math.ceil(TOP_PRODUCTS.length / 5);
  var productsPagesHtml = '';
  for (var pageIdx = 0; pageIdx < numPages; pageIdx++) {
    var pageItems = TOP_PRODUCTS.slice(pageIdx * 5, pageIdx * 5 + 5);
    var pageHtml = pageItems.map(function (p, i) {
      var meta = RANK_META[p.rank] || { bg: 'rgba(100,116,139,0.55)', glow: 'none', accent: '#64748b' };
      var border = (i < pageItems.length - 1) ? '1px solid rgba(255,255,255,0.04)' : 'none';
      var earnedProfitAfterTax = num(p.commission, 0);
      return '<div class="fade-up" style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:' + border + ';direction:' + (isAr ? 'rtl' : 'ltr') + ';animation-delay:' + (i * 70) + 'ms;">' +
        '<div style="width:22px;height:22px;border-radius:50%;background:' + meta.bg + ';display:flex;align-items:center;justify-content:center;' +
          'font-size:9px;font-weight:900;color:#fff;flex-shrink:0;box-shadow:' + (meta.glow !== 'none' ? '0 0 8px ' + meta.glow : 'none') + ';">' +
          p.rank +
        '</div>' +
        '<div style="width:32px;height:32px;border-radius:8px;background:' + meta.accent + '16;border:1px solid ' + meta.accent + '30;' +
          'display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' +
          p.emoji +
        '</div>' +
        '<div data-i18n-preserve style="flex:1;min-width:0;font-size:10px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;">' +
          p.name +
        '</div>' +
        '<div style="font-size:14px;font-weight:900;color:#fff;width:26px;text-align:center;flex-shrink:0;">' + p.units + '</div>' +
        '<div style="text-align:left;flex-shrink:0;min-width:52px;">' +
          '<div style="font-size:12px;font-weight:900;color:#fff;line-height:1;">' + earnedProfitAfterTax.toLocaleString("en-US") + '</div>' +
          '<div style="font-size:8px;color:rgba(255,255,255,0.32);margin-top:2px;">' + nativeCurrency + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    var display = pageIdx === 0 ? 'flex' : 'none';
    productsPagesHtml += '<div class="s8-products-page" id="s8-prod-page-' + pageIdx + '" style="display:' + display + ';flex-direction:column;">' + pageHtml + '</div>';
  }

  var paginationHtml = '';
  if (numPages > 1) {
    var dots = [];
    for(var pageIdx = 0; pageIdx < numPages; pageIdx++) {
      var active = pageIdx === 0 ? 'background:#fbbf24;' : 'background:rgba(255,255,255,0.2);';
      dots.push('<div class="s8-prod-dot" data-page="' + pageIdx + '" style="width:8px;height:8px;border-radius:50%;cursor:pointer;margin:0 4px;' + active + '"></div>');
    }
    paginationHtml = '<div style="display:flex;justify-content:center;margin-top:10px;">' + dots.join('') + '</div>';
  }

  var viewAllBtnHtml = '<button id="s8-btn-products-bottom" style="margin-top:16px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;border-radius:8px;padding:8px 14px;font-size:11px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;cursor:pointer;width:100%;font-family:inherit;box-shadow:0 4px 10px rgba(0,0,0,0.2);">' +
    s8Txt('VIEW ALL PRODUCTS', 'عرض كل المنتجات') +
  '</button>';

  var chartStatsHtml = CHART_STATS.map(function (s, i) {
    var bl = (i < CHART_STATS.length - 1) ? '1px solid rgba(255,255,255,0.07)' : 'none';
    return '<div style="flex:1;text-align:center;border-left:' + bl + ';padding:0 6px;">' +
      '<div style="font-size:7.5px;color:rgba(255,255,255,0.32);margin-bottom:4px;line-height:1.4;">' + s.label + '</div>' +
      '<div style="font-size:11px;font-weight:900;color:' + s.color + ';line-height:1;">' + s.value + '</div>' +
      (s.sub ? '<div style="font-size:7px;color:rgba(255,255,255,0.25);margin-top:2px;">' + s.sub + '</div>' : '') +
    '</div>';
  }).join('');

  var summaryItemsHtml = SUMMARY_ITEMS.map(function (item, i) {
    var iconColor = item.iconColor;
    var leftBlock;
    if (item.stars) {
      leftBlock = '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;padding-left:4px;">' +
        '<span style="font-size:24px;font-weight:900;color:#fff;line-height:1;">' + item.value + '</span>' +
        starsHtml(item.rating) +
      '</div>';
    } else {
      leftBlock = '<div style="width:44px;height:44px;border-radius:50%;' +
        'background:radial-gradient(circle at center,' + iconColor + '22 0%,' + iconColor + '05 100%);' +
        'border:1px solid ' + iconColor + '3a;box-shadow:0 0 14px ' + iconColor + '2a,inset 0 0 8px ' + iconColor + '1a;' +
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        summaryIcon(item.iconType, iconColor, 22) +
      '</div>';
    }

    var valueBlock = '';
    if (!item.stars) {
      valueBlock = '<div style="display:flex;align-items:baseline;gap:4px;justify-content:flex-start;direction:ltr;flex-direction:row-reverse;">' +
        '<span style="font-size:20px;font-weight:800;color:' + (item.valueColor || '#fff') + ';line-height:1;">' + item.value + '</span>' +
        (item.suffix ? '<span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);">' + item.suffix + '</span>' : '') +
      '</div>';
    }

    return '<div class="fade-up" ' + tipAttr(item.tooltip) + ' style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;direction:ltr;' +
      'padding:14px 10px;background:rgba(16,20,31,0.55);border:1px solid rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.06);' +
      'border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.02),0 4px 16px rgba(0,0,0,0.3);' +
      'animation-delay:' + (40 + i * 55) + 'ms;">' +
      leftBlock +
      '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;direction:' + (isAr ? 'rtl' : 'ltr') + ';text-align:right;justify-content:center;">' +
        '<div style="font-size:10.5px;color:rgba(255,255,255,0.5);font-weight:600;line-height:1.3;">' + item.label + '</div>' +
        valueBlock +
        (item.sub ? '<div style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:500;line-height:1;">' + item.sub + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  /* --------------------------------------------------------------------------
     CUSTOM ROI WIDGET HTML
  -------------------------------------------------------------------------- */
  var roiDefaultBudget = Math.max(50, Number(num(roiLive.adSpend, 250).toFixed(2)));
  var roiTotalOrders = window.DashboardOrderMetrics
    ? window.DashboardOrderMetrics.netOrders(roiLive)
    : (roiLive.totalOrders != null ? num(roiLive.totalOrders, totalOrders) : totalOrders);
  var roiDeliveredOrders = roiLive.deliveredCount != null
    ? Number(roiLive.deliveredCount || 0)
    : Math.round(roiTotalOrders * (ndrPct / 100));
  var avgCommissionInTarget = convert(avgCommission, nativeCurrency, targetCurrency);
  var roiRevenue = roiDeliveredOrders * avgCommissionInTarget;
  var roiNetProfit = roiRevenue - roiDefaultBudget;
  var roiPct = roiDefaultBudget > 0 ? (roiNetProfit / roiDefaultBudget) * 100 : 0;
  var roiCpa = roiTotalOrders > 0 ? roiDefaultBudget / roiTotalOrders : 0;
  var roiReturnPerSar = roiDefaultBudget > 0 ? roiRevenue / roiDefaultBudget : 0;
  var roiBreakEvenDeliveries = avgCommissionInTarget > 0 ? Math.ceil(roiDefaultBudget / avgCommissionInTarget) : 0;
  var roiProfitColor = roiNetProfit >= 0 ? '#00e676' : '#ef4444';
  var roiStateLabel = roiPct >= 50 ? s8Txt('Profitable', 'مربح') : roiPct >= 0 ? s8Txt('Near break-even', 'قريب من التعادل') : s8Txt('Losing', 'خاسر');
  var roiAdvice = roiPct >= 50
    ? s8Txt('The calculator shows healthy returns. Review Section 7 before scaling spend.', 'تظهر الحاسبة عوائد صحية. راجع القسم 7 قبل زيادة الإنفاق.')
    : roiPct >= 0
      ? s8Txt('Returns are positive but tight. Use Section 7 to test NDR, simulator profit after tax, and budget scenarios.', 'العوائد إيجابية لكنها محدودة. استخدم القسم 7 لاختبار NDR وربح المحاكاة بعد الضريبة وسيناريوهات الميزانية.')
      : s8Txt('Current calculator inputs point to a loss. Open Section 7 to find the break-even lever.', 'مدخلات الحاسبة الحالية تشير إلى خسارة. افتح القسم 7 للعثور على عامل التعادل.');

  function roiMetricCard(label, value, sub, color, iconSvg) {
    return '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;background:' + color + '0d;border:1px solid ' + color + '33;padding:12px;border-radius:14px;min-width:0;width:100%;box-sizing:border-box;">' +
      '<div style="width:30px;height:30px;border-radius:8px;background:' + color + '18;display:flex;align-items:center;justify-content:center;color:' + color + ';box-shadow:0 0 10px ' + color + '20;flex-shrink:0;">' + iconSvg + '</div>' +
      '<div style="min-width:0;width:100%;">' +
        '<div style="font-size:9px;color:rgba(255,255,255,0.48);font-weight:700;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</div>' +
        '<div style="font-size:14px;font-weight:900;color:#fff;line-height:1.1;direction:ltr;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + value + '</div>' +
        (sub ? '<div style="font-size:8px;color:rgba(255,255,255,0.34);font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + sub + '">' + sub + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  var roiPreviewGauge = roiGaugeSvg(roiPct);
  var roiWidgetHtml = '<div id="s8-roi-preview" style="background:#0a0f18;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px;height:100%;display:flex;flex-direction:column;box-shadow:inset 0 0 40px rgba(0,0,0,0.5);">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<div style="width:20px;height:20px;border-radius:50%;border:1px solid #a855f7;background:rgba(168,85,247,0.1);display:flex;align-items:center;justify-content:center;color:#a855f7;font-size:10px;font-weight:800;box-shadow:0 0 10px rgba(168,85,247,0.3);">6</div>' +
        '<div>' +
          '<div style="font-size:15px;font-weight:800;color:#fff;font-family:Cairo;">' + s8Txt('Calculator Results Preview', 'معاينة نتائج الحاسبة') + '</div>' +
          '<div style="font-size:10.5px;color:rgba(255,255,255,0.36);font-weight:700;margin-top:3px;">' + s8Txt('Read-only snapshot from Account Calculator', 'لقطة قراءة فقط من حاسبة الحساب') + '</div>' +
        '</div>' +
      '</div>' +
      '<span style="font-size:10px;font-weight:900;color:' + roiProfitColor + ';background:' + roiProfitColor + '18;border:1px solid ' + roiProfitColor + '38;border-radius:999px;padding:6px 10px;white-space:nowrap;">' + roiStateLabel + '</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:minmax(0,1.05fr) minmax(260px,.95fr);gap:18px;align-items:stretch;flex:1;" class="s8-roi-preview-grid">' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-content:start;">' +
        roiMetricCard(s8Txt('Ad spend', 'الإنفاق الإعلاني'), roiMoney(roiDefaultBudget), s8Txt('from calculator', 'من الحاسبة'), '#3b82f6', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>') +
        roiMetricCard(s8Txt('Delivered orders', 'الطلبات المسلمة'), fmtCount(roiDeliveredOrders), fmtCount(roiTotalOrders) + ' × ' + ndrVal, ndrMetricColor, '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>') +
        roiMetricCard(s8Txt('Revenue', 'الإيرادات'), roiMoney(roiRevenue), s8Txt('delivered × simulator profit after tax per delivered order', 'المسلم × ربح المحاكاة بعد الضريبة لكل طلب مسلم'), '#06b6d4', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-7"/></svg>') +
        roiMetricCard(s8Txt('Net profit', 'صافي الربح'), roiMoney(roiNetProfit), s8Txt('revenue - spend', 'الإيرادات - الإنفاق'), roiProfitColor, '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>') +
        roiMetricCard('CPA', roiMoney(roiCpa, 2), s8Txt('spend ÷ net orders', 'الإنفاق ÷ صافي الطلبات'), '#a855f7', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>') +
        roiMetricCard(s8Txt('Break-even deliveries', 'تسليمات التعادل'), fmtCount(roiBreakEvenDeliveries), s8Txt('needed to cover spend', 'المطلوبة لتغطية الإنفاق'), '#f59e0b', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M12 4v16"/></svg>') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;border:1px solid rgba(255,255,255,0.06);border-radius:16px;background:rgba(255,255,255,0.025);padding:16px;min-width:0;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
          '<div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,0.48);font-weight:800;">' + s8Txt('Return on investment', 'العائد على الاستثمار') + '</div>' +
            '<div style="font-size:28px;font-weight:950;color:' + roiProfitColor + ';line-height:1.1;direction:ltr;text-align:left;">' + (roiPct > 0 ? '+' : '') + roiPct.toFixed(1) + '%</div>' +
          '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.42);font-weight:800;direction:ltr;text-align:right;">ROAS<br><span style="color:#fff;font-size:14px;">' + roiReturnPerSar.toFixed(2) + 'x</span></div>' +
        '</div>' +
        '<div style="min-height:150px;display:flex;align-items:center;justify-content:center;">' + roiPreviewGauge + '</div>' +
        '<div style="background:rgba(16,185,129,0.05);border:1px dashed rgba(16,185,129,0.3);border-radius:12px;padding:12px;direction:' + (isAr ? 'rtl' : 'ltr') + ';">' +
          '<div style="font-size:11px;font-weight:900;color:#10b981;margin-bottom:6px;">' + s8Txt('Calculator note', 'ملاحظة الحاسبة') + '</div>' +
          '<div style="font-size:10.5px;color:rgba(255,255,255,0.68);line-height:1.55;">' + roiAdvice + '</div>' +
        '</div>' +
        '<button id="s8-btn-calculator" type="button" style="margin-top:auto;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg, rgba(168,85,247,0.25), rgba(168,85,247,0.1));border:1px solid rgba(168,85,247,0.5);box-shadow:0 4px 12px rgba(168,85,247,0.2);color:' + (document.documentElement.getAttribute('data-theme') === 'light' ? '#7c3aed' : '#e9d5ff') + ';border-radius:12px;padding:12px 14px;font-size:11.5px;font-weight:900;cursor:pointer;font-family:inherit;transition:all 0.25s ease;text-shadow:0 1px 2px rgba(0,0,0,0.4);" ' +
          'onmouseenter="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 18px rgba(168,85,247,0.35)\';this.style.background=\'linear-gradient(135deg, rgba(168,85,247,0.35), rgba(168,85,247,0.15))\'" ' +
          'onmouseleave="this.style.transform=\'none\';this.style.boxShadow=\'0 4px 12px rgba(168,85,247,0.2)\';this.style.background=\'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(168,85,247,0.1))\'">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"/></svg>' +
          s8Txt('Calculate more details in Account Calculator', 'احسب تفاصيل أكثر في حاسبة الحساب') +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  var gmvSnapshot = window.DashboardGmvTargetState && typeof window.DashboardGmvTargetState.snapshot === 'function'
    ? window.DashboardGmvTargetState.snapshot(d)
    : null;
  var gmvStatusMeta = (function () {
    if (!gmvSnapshot || !gmvSnapshot.hasTarget) return { label: s8Txt('No target set', 'لا يوجد هدف محدد'), color: '#a855f7' };
    if (gmvSnapshot.status === 'overachieved') return { label: s8Txt('Overachieved', 'تم تجاوز الهدف'), color: '#10b981' };
    if (gmvSnapshot.status === 'achieved') return { label: s8Txt('Achieved', 'تم تحقيق الهدف'), color: '#22d3ee' };
    if (gmvSnapshot.status === 'on_track') return { label: s8Txt('On track', 'على المسار الصحيح'), color: '#3b82f6' };
    if (gmvSnapshot.status === 'watch') return { label: s8Txt('Needs small push', 'يحتاج دفعة بسيطة'), color: '#f59e0b' };
    if (gmvSnapshot.status === 'ended') return { label: s8Txt('Period ended', 'انتهت الفترة'), color: '#94a3b8' };
    return { label: s8Txt('Behind pace', 'أقل من الوتيرة المطلوبة'), color: '#ef4444' };
  })();
  function gmvMoney(value, decimals, compact) {
    if (window.formatDashboardMoney) return window.formatDashboardMoney(value, gmvSnapshot ? gmvSnapshot.currency : nativeCurrency, decimals == null ? 0 : decimals, { compact: compact === true });
    return Number(value || 0).toLocaleString('en-US') + ' ' + nativeCurrency;
  }
  function gmvRate(value) {
    var n = Number(value || 0);
    return n.toFixed(1).replace(/\.0$/, '');
  }
  var gmvPreviewIsLight = document.documentElement.getAttribute('data-theme') === 'light';
  var gmvPreviewBg = gmvPreviewIsLight ? 'var(--dash-surface,#ffffff)' : '#0a0f18';
  var gmvPreviewBorder = gmvPreviewIsLight ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.06)';
  var gmvPreviewDashBorder = gmvPreviewIsLight ? 'rgba(168,85,247,0.38)' : 'rgba(168,85,247,0.42)';
  var gmvPreviewText = gmvPreviewIsLight ? 'var(--dash-text,#0f172a)' : '#fff';
  var gmvPreviewMuted = gmvPreviewIsLight ? 'var(--dash-text-muted,#334155)' : 'rgba(255,255,255,0.56)';
  var gmvPreviewFaint = gmvPreviewIsLight ? 'var(--dash-text-faint,#64748b)' : 'rgba(255,255,255,0.42)';
  var gmvPreviewFaint2 = gmvPreviewIsLight ? 'var(--dash-text-faint,#64748b)' : 'rgba(255,255,255,0.48)';
  var gmvPreviewTrack = gmvPreviewIsLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.07)';
  var gmvPreviewTrackBg = 'linear-gradient(90deg,rgba(239,68,68,' + (gmvPreviewIsLight ? '0.14' : '0.2') + ') 0%,rgba(245,158,11,' + (gmvPreviewIsLight ? '0.14' : '0.2') + ') 50%,rgba(59,130,246,' + (gmvPreviewIsLight ? '0.14' : '0.2') + ') 75%,rgba(168,85,247,' + (gmvPreviewIsLight ? '0.14' : '0.2') + ') 100%),' + gmvPreviewTrack;
  var gmvPreviewFillBg = 'linear-gradient(90deg,#ef4444 0%,#f59e0b 50%,#3b82f6 75%,#a855f7 100%)';
  var gmvPreviewTick = gmvPreviewIsLight ? 'rgba(15,23,42,0.26)' : 'rgba(255,255,255,0.38)';
  var gmvPreviewShadow = gmvPreviewIsLight ? '0 12px 28px rgba(15,23,42,0.08)' : 'inset 0 0 32px rgba(0,0,0,0.45)';
  var gmvOpenPlannerColor = gmvPreviewIsLight ? '#7c3aed' : '#e9d5ff';
  var gmvPreviewHtml = '';
  if (gmvSnapshot && gmvSnapshot.hasTarget) {
    gmvPreviewHtml =
      '<div id="s8-gmv-preview" style="background:' + gmvPreviewBg + ';border:1px solid ' + gmvPreviewBorder + ';border-radius:16px;padding:18px 20px;margin-bottom:22px;box-shadow:' + gmvPreviewShadow + ';">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;flex-wrap:wrap;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:28px;height:28px;border-radius:8px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.35);color:#a855f7;display:flex;align-items:center;justify-content:center;">' + (window.icon ? window.icon('target', { size: 16, color: 'currentColor' }) : '') + '</div>' +
            '<div>' +
              '<div style="font-size:15px;font-weight:900;color:' + gmvPreviewText + ';">' + s8Txt('GMV Target Progress', 'تقدم هدف GMV') + '</div>' +
              '<div style="font-size:10.5px;color:' + gmvPreviewFaint + ';font-weight:700;margin-top:2px;">' + s8Txt('Net Total Delivered Sales goal', 'هدف صافي مبيعات الطلبات المسلمة') + '</div>' +
            '</div>' +
          '</div>' +
          '<span style="font-size:10px;font-weight:900;color:' + gmvStatusMeta.color + ';background:' + gmvStatusMeta.color + '18;border:1px solid ' + gmvStatusMeta.color + '45;border-radius:999px;padding:6px 10px;white-space:nowrap;">' + gmvStatusMeta.label + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;">' +
          '<div style="min-width:0;">' +
            '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px;">' +
              '<strong style="font-size:22px;line-height:1;color:' + gmvPreviewText + ';direction:ltr;text-align:left;">' + gmvMoney(gmvSnapshot.currentGmv, 0, true) + ' / ' + gmvMoney(gmvSnapshot.targetGmv, 0, true) + '</strong>' +
              '<span style="font-size:12px;font-weight:900;color:' + gmvStatusMeta.color + ';">' + gmvRate(gmvSnapshot.progressPct) + '%</span>' +
            '</div>' +
            '<div style="position:relative;height:10px;border-radius:999px;background:' + gmvPreviewTrackBg + ';overflow:hidden;margin-bottom:9px;">' +
              '<div style="position:absolute;inset:0;width:100%;height:100%;border-radius:999px;background:' + gmvPreviewFillBg + ';box-shadow:0 0 16px rgba(59,130,246,0.2);clip-path:inset(0 ' + (100 - Math.min(100, gmvSnapshot.progressPct)).toFixed(2) + '% 0 0);"></div>' +
              '<span style="position:absolute;top:0;bottom:0;left:25%;width:1px;background:' + gmvPreviewTick + ';"></span>' +
              '<span style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:' + gmvPreviewTick + ';"></span>' +
              '<span style="position:absolute;top:0;bottom:0;left:75%;width:1px;background:' + gmvPreviewTick + ';"></span>' +
              '<span style="position:absolute;top:0;bottom:0;left:calc(100% - 1px);width:2px;background:rgba(168,85,247,0.7);"></span>' +
            '</div>' +
            '<div style="display:flex;gap:12px;flex-wrap:wrap;color:' + gmvPreviewMuted + ';font-size:11px;font-weight:800;">' +
              '<span>' + s8Txt('Missing', 'المتبقي') + ': <b style="color:' + gmvPreviewText + ';">' + gmvMoney(gmvSnapshot.remainingGmv, 0, true) + '</b></span>' +
              '<span>' + s8Txt('Need', 'المطلوب') + ': <b style="color:' + gmvPreviewText + ';">' + gmvRate(gmvSnapshot.dailyOrdersNeeded) + s8Txt('/day', '/يوم') + '</b></span>' +
              '<span>' + s8Txt('Current pace', 'الوتيرة الحالية') + ': <b style="color:' + gmvPreviewText + ';">' + gmvRate(gmvSnapshot.runRate) + s8Txt('/day', '/يوم') + '</b></span>' +
            '</div>' +
          '</div>' +
          '<button id="s8-btn-gmv-target" type="button" style="min-width:128px;height:40px;border-radius:9px;border:1px solid rgba(168,85,247,0.45);background:rgba(168,85,247,0.14);color:' + gmvOpenPlannerColor + ';font-size:11px;font-weight:900;cursor:pointer;font-family:inherit;">' + s8Txt('Open Planner', 'فتح المخطط') + '</button>' +
        '</div>' +
      '</div>';
  } else {
    gmvPreviewHtml =
      '<div id="s8-gmv-preview" style="background:' + gmvPreviewBg + ';border:1px dashed ' + gmvPreviewDashBorder + ';border-radius:16px;padding:18px 20px;margin-bottom:22px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:' + gmvPreviewShadow + ';">' +
        '<div style="display:flex;align-items:center;gap:11px;min-width:0;">' +
          '<div style="width:34px;height:34px;border-radius:9px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.35);color:#a855f7;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (window.icon ? window.icon('target', { size: 18, color: 'currentColor' }) : '') + '</div>' +
          '<div style="min-width:0;">' +
            '<div style="font-size:15px;font-weight:900;color:' + gmvPreviewText + ';">' + s8Txt('GMV Target Progress', 'تقدم هدف GMV') + '</div>' +
            '<div style="font-size:11px;color:' + gmvPreviewFaint2 + ';font-weight:750;margin-top:3px;">' + s8Txt('No GMV target set yet', 'لم يتم تحديد هدف GMV بعد') + '</div>' +
          '</div>' +
        '</div>' +
        '<button id="s8-btn-gmv-target" type="button" style="height:40px;border-radius:9px;border:1px solid rgba(168,85,247,0.58);background:linear-gradient(135deg,rgba(168,85,247,0.96),rgba(59,130,246,0.9));color:#f8fafc;padding:0 15px;font-size:11px;font-weight:950;cursor:pointer;font-family:inherit;white-space:nowrap;box-shadow:0 10px 22px rgba(59,130,246,0.16);">' + s8Txt('Set Goal', 'تحديد الهدف') + '</button>' +
      '</div>';
  }

  /* --------------------------------------------------------------------------
     ASSEMBLE FULL PAGE
  -------------------------------------------------------------------------- */
  
  mountEl.innerHTML =
    '<div class="dash-scroll s8-body" style="flex:1;display:flex;flex-direction:column;height:100%;' +
      'overflow-y:auto;background:#080b12;direction:' + (isAr ? 'rtl' : 'ltr') + ';">' +

    '<div style="padding:22px 28px 32px;flex:1;">' +

      /* Page heading row */
      '<div class="fade-up" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;">' +
        '<div>' +
          '<h1 style="font-size:30px;font-weight:900;color:#fff;margin:0;line-height:1.2;font-family:Cairo;">' + s8Txt('Quick Insights', 'رؤى سريعة') + '</h1>' +
          '<p style="font-size:12px;color:rgba(255,255,255,0.38);margin:5px 0 0;">' + s8Txt('Comprehensive overview of your real bot performance', 'نظرة شمولية على أداء عمل البوت الخاص بك') + '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<div style="padding:6px 14px;border-radius:9px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.3);font-size:11px;color:#a855f7;font-weight:700;">' + ((d.meta && d.meta.monthLabel) || s8Txt('Current Period', 'الفترة الحالية')) + '</div>' +
        '</div>' +
      '</div>' +

      /* KPI Cards */
      sectionBadge('1', s8Txt('Performance Overview', 'نظرة عامة على الأداء'), '#00e676') +
      '<div class="s8-kpi-row" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">' + kpiRowHtml + '</div>' +
      '<div class="s8-kpi-row" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' + newKpiRowHtml + '</div>' +
      '<div class="s8-kpi-row" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px;">' + financialKpiRowHtml + '</div>' +
      gmvPreviewHtml +

      /* Row 2 & 3 badge */
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;justify-content:flex-end;">' +
        '<span style="font-size:14px;font-weight:700;color:#fff;">' + s8Txt('Status Pipeline · COD Collection', 'مسار الحالات · تحصيل COD') + '</span>' +
        '<div style="display:flex;align-items:center;gap:4px;padding:2px 10px;border-radius:20px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);">' +
          '<div style="width:7px;height:7px;border-radius:50%;background:#3b82f6;"></div>' +
          '<div style="width:7px;height:7px;border-radius:50%;background:#00e676;"></div>' +
          '<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.55);margin-left:2px;">2 · 3</span>' +
        '</div>' +
      '</div>' +

      /* Row2: Pipeline (2) + COD (3) side-by-side on big screens (stacks on small screens) */
      '<div class="fade-up s8-row2" style="margin-bottom:22px;animation-delay:200ms;display:flex;flex-wrap:wrap;gap:18px;width:100%;direction:ltr;">' +

        /* Pipeline (2) — flex:1; min-width:320px; */
        '<div class="s8-pipeline-panel" style="flex:1;min-width:320px;background:#0a0f18;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:18px 16px;display:flex;flex-direction:column;box-shadow:inset 0 0 40px rgba(0,0,0,0.5);box-sizing:border-box;">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
            '<div style="width:20px;height:20px;border-radius:50%;border:1px solid #3b82f6;background:rgba(59,130,246,0.1);display:flex;align-items:center;justify-content:center;color:#3b82f6;font-size:10px;font-weight:800;box-shadow:0 0 10px rgba(59,130,246,0.3);">2</div>' +
            '<span style="font-size:14px;font-weight:700;color:#fff;font-family:\'Inter\', \'Cairo\', sans-serif;">' + s8Txt('Status Pipeline (Fulfillment Funnel)', 'مسار الحالات (قمع التنفيذ)') + '</span>' +
          '</div>' +
          '<div class="s8-pipeline-stages" style="display:flex;flex:1;gap:0;overflow-x:auto;">' + pipelineStagesHtml + '</div>' +
          '<div class="s8-pipeline-summary-box">' +
            '<div class="s8-pipeline-summary-strip">' + pipelineSummaryAllHtml + '</div>' +
            '<div class="s8-pipeline-summary-action">' +
              '<button id="s8-btn-pipeline" style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#3b82f6;border-radius:8px;padding:7px 12px;font-size:10px;display:flex;align-items:center;gap:6px;font-weight:700;cursor:pointer;direction:' + (isAr ? 'rtl' : 'ltr') + ';box-shadow:0 0 10px rgba(59,130,246,0.15);font-family:inherit;flex-shrink:0;white-space:nowrap;">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/></svg>' +
                s8Txt('View Order Details', 'عرض تفاصيل الطلبات') +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* COD (3) — flex:1; min-width:320px; */
        '<div class="s8-cod-panel" style="flex:1;min-width:320px;background:#0a0f18;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:18px 16px;display:flex;flex-direction:column;box-shadow:inset 0 0 40px rgba(0,0,0,0.5);box-sizing:border-box;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:6px;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<div style="width:20px;height:20px;border-radius:50%;border:1px solid #3b82f6;background:rgba(59,130,246,0.1);display:flex;align-items:center;justify-content:center;color:#3b82f6;font-size:10px;font-weight:800;box-shadow:0 0 10px rgba(59,130,246,0.3);">3</div>' +
              '<span style="font-size:14px;font-weight:700;color:#fff;font-family:Cairo;">' + s8Txt('COD Collection', 'تحصيل COD') + '</span>' +
            '</div>' +
            '<span style="font-size:12px;color:rgba(255,255,255,0.6);font-family:Cairo;direction:' + (isAr ? 'rtl' : 'ltr') + ';font-weight:700;">' + s8Txt('Top Collected Cities', 'أعلى المدن تحصيلا') + '</span>' +
          '</div>' +
          '<div class="s8-cod-content" style="display:flex;flex-wrap:wrap;gap:16px;flex:1;min-width:0;">' +
            /* Left part: COD Donut and metrics */
            '<div style="flex:0 0 auto;min-width:280px;display:flex;gap:16px;align-items:flex-start;">' +
              '<div style="position:relative;flex-shrink:0;width:110px;height:110px;">' +
                '<svg viewBox="0 0 130 130" width="100%" height="100%" style="overflow:visible;">' +
                  donutPaths +
                '</svg>' +
                '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">' +
                  '<span style="font-size:9px;color:rgba(255,255,255,0.6);margin-bottom:4px;font-family:Cairo;font-weight:700;">DR</span>' +
                  '<span style="font-size:18px;font-weight:800;color:#fff;line-height:1;">' + drPct.toFixed(1) + '</span>' +
                  '<span style="font-size:9px;color:rgba(255,255,255,0.8);margin-top:2px;font-weight:700;">%</span>' +
                '</div>' +
              '</div>' +
              '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">' + codMetricsHtml + '</div>' +
            '</div>' +
            /* Right part: Cities */
            '<div style="flex:1;min-width:200px;display:flex;flex-direction:column;border-left:1px solid rgba(255,255,255,0.06);padding-left:16px;">' +
              '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px;" id="s8-cities">' +
                citiesHtml +
              '</div>' +
              '<button id="s8-btn-cod" style="margin-top:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);padding:7px 10px;border-radius:8px;color:rgba(255,255,255,0.6);font-size:10px;display:flex;align-items:center;justify-content:space-between;font-weight:600;cursor:pointer;direction:' + (isAr ? 'rtl' : 'ltr') + ';box-shadow:0 4px 10px rgba(0,0,0,0.2);width:100%;font-family:inherit;">' +
                '<span>' + s8Txt('View All Cities', 'عرض كل المدن') + '</span>' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div>' + /* /Row 2 */

      /* Row 3: Daily Taager profit (5) + Top Products (4) + ROI Preview (6) side-by-side on big screens */
      '<div class="fade-up s8-row3" style="display:grid;grid-template-columns:1.2fr 0.8fr 1.6fr;gap:18px;margin-bottom:22px;align-items:stretch;width:100%;">' +

        /* Section 5: Taager profit chart (flex: 1.2; min-width: 280px) */
        '<div style="flex:1.2;min-width:280px;display:flex;flex-direction:column;">' +
          sectionBadge('5', s8Txt('Daily Taager Profit After Tax Trend', 'اتجاه الربح بعد الضريبة اليومي'), '#22c55e') +
          '<div style="flex:1;background:#0d1220;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-size:13px;font-weight:700;color:#fff;direction:' + (isAr ? 'rtl' : 'ltr') + ';font-family:Cairo;">' + s8Txt('Daily Taager Profit After Tax Trend', 'اتجاه الربح بعد الضريبة اليومي') + '</span>' +
                '<div id="s8-commission-dot" style="width:4px;height:18px;border-radius:2px;background:' + displayColor + ';"></div>' +
              '</div>' +
              '<div id="s8-commission-type-wrap" style="width:130px;"></div>' +
            '</div>' +
            '<div style="direction:' + (isAr ? 'rtl' : 'ltr') + ';">' +
              '<div id="s8-commission-subtitle" style="font-size:9px;color:rgba(255,255,255,0.32);margin-bottom:3px;">' + s8Txt('Total ', 'الإجمالي ') + displayTitle + '</div>' +
              '<div style="display:flex;align-items:baseline;gap:6px;">' +
                '<span id="s8-commission-val" style="font-size:26px;font-weight:900;color:#fff;line-height:1;">' + displayCommissionVal.toLocaleString("en-US") + '</span>' +
                '<span style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.42);">' + nativeCurrency + '</span>' +
              '</div>' +
              '<div style="font-size:10px;margin-top:4px;">' +
                '<span id="s8-commission-delta" style="color:' + topDisplayDeltaColor + ';font-weight:700;">' + topDisplayDeltaSign + Math.abs(displayDeltaVal).toFixed(1) + '%</span>' +
                '<span style="color:rgba(255,255,255,0.32);margin-right:6px;">' + s8Txt('vs previous period', 'مقارنة بالفترة السابقة') + '</span>' +
              '</div>' +
            '</div>' +
            '<div style="flex:1;min-height:160px;position:relative;">' +
              '<canvas id="s8-commission-chart" style="width:100%;height:160px;"></canvas>' +
            '</div>' +
            '<div id="s8-commission-stats" style="display:flex;align-items:stretch;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);direction:' + (isAr ? 'rtl' : 'ltr') + ';">' +
              chartStatsHtml +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Section 4: Products (flex: 0.8; min-width: 230px) */
        '<div style="flex:0.8;min-width:230px;display:flex;flex-direction:column;">' +
          sectionBadge('4', s8Txt('Top Products', 'أفضل المنتجات'), '#fbbf24') +
          '<div style="flex:1;background:#0d1220;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-size:13px;font-weight:700;color:#fff;direction:' + (isAr ? 'rtl' : 'ltr') + ';font-family:Cairo;">' + s8Txt('Top Products', 'أفضل المنتجات') + '</span>' +
                '<div style="width:4px;height:18px;border-radius:2px;background:#fbbf24;"></div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);direction:' + (isAr ? 'rtl' : 'ltr') + ';">' +
              '<span style="font-size:8px;color:rgba(255,255,255,0.28);font-weight:600;">' + s8Txt('Earned Taager Profit After Tax', 'الربح المحصل بعد الضريبة') + '</span>' +
              '<span style="font-size:8px;color:rgba(255,255,255,0.28);font-weight:600;">' + s8Txt('Delivered Count', 'عدد التسليمات') + '</span>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;flex:1;">' + productsPagesHtml + '</div>' + paginationHtml + viewAllBtnHtml +
          '</div>' +
        '</div>' +

        /* Section 6: ROI Calculator Snapshot (flex: 1.6; min-width: 320px) */
        '<div style="flex:1.6;min-width:320px;display:flex;flex-direction:column;">' +
          sectionBadge('6', s8Txt('Calculator Snapshot', 'لقطة الحاسبة'), '#a855f7') +
          roiWidgetHtml +
        '</div>' +

      '</div>' +

      /* Section 7: Quick Summary */
      '<div class="fade-up" style="animation-delay:500ms;display:flex;flex-direction:column;gap:18px;width:100%;' +
        'background:rgba(8,11,18,0.75);border:1px solid rgba(255,255,255,0.04);border-radius:16px;padding:24px;' +
        'box-shadow:inset 0 0 30px rgba(0,0,0,0.5),0 8px 32px rgba(0,0,0,0.3);">' +
        '<div style="display:flex;align-items:center;gap:10px;direction:ltr;justify-content:flex-start;">' +
          '<div style="width:28px;height:28px;border-radius:50%;background:rgba(59,130,246,0.15);border:1.5px solid rgba(59,130,246,0.55);' +
            'box-shadow:0 0 10px rgba(59,130,246,0.45);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#3b82f6;flex-shrink:0;">7</div>' +
          '<span style="font-size:16px;font-weight:700;color:#fff;font-family:Cairo;">' + s8Txt('Quick Indicator Summary', 'ملخص المؤشرات السريع') + '</span>' +
        '</div>' +
        '<div class="s8-summary-grid" style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;width:100%;direction:ltr;">' +
          summaryItemsHtml +
        '</div>' +
      '</div>' +

      /* Phase 5: Scaling Score City Leaderboard */
      '<div id="s8-scaling-leaderboard-mount"></div>' +

    '</div>' +
    '</div>';

  /* --------------------------------------------------------------------------
     POST-RENDER: wire events + animations
  -------------------------------------------------------------------------- */

  window.runKpiAnimations && window.runKpiAnimations(mountEl);

  /* Phase 5: Render scaling score leaderboard from geo data */
  (function renderScalingLeaderboard() {
    var mount = mountEl.querySelector('#s8-scaling-leaderboard-mount');
    if (!mount) return;

    var geoD = window.dashboardGeoData;
    var sortedCities = geoD && geoD.geo && geoD.geo.sortedCities;
    if (!sortedCities || !sortedCities.length) return;

    // Take top cities by scalingScore
    var topScaling = sortedCities
      .filter(function (c) { return c.scalingScore > 0 && c.orders >= 10; })
      .sort(function (a, b) { return (b.scalingScore || 0) - (a.scalingScore || 0); })
      .slice(0, 8);

    if (!topScaling.length) return;

    function scoreBadge(score, type) {
      if (typeof window.scoreBadge === 'function') return window.scoreBadge(score, type);
      var colors = {
        scale: { low: '#ef4444', mid: '#f59e0b', high: '#00e676' },
        risk:  { low: '#00e676', mid: '#f59e0b', high: '#ef4444' }
      };
      var pal = colors[type] || colors.scale;
      var col = score < 35 ? pal.low : score < 65 ? pal.mid : pal.high;
      return '<span style="padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;background:' + col + '18;color:' + col + ';border:1px solid ' + col + '44;">' + score + '</span>';
    }

    var rows = topScaling.map(function (c, i) {
      var rank = i + 1;
      var rankColor = rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#cd7f32' : 'rgba(255,255,255,0.25)';
      var ndr = typeof c.ndrPct === 'number' ? s8PctValue(c.ndrPct) : '—';
      var ndrColor = window.dashboardRateColor ? window.dashboardRateColor(parseFloat(ndr)) : (parseFloat(ndr) >= 40 ? '#22d3ee' : parseFloat(ndr) >= 30 ? '#00e676' : parseFloat(ndr) >= 20 ? '#f59e0b' : '#ef4444');
      var barW = Math.max(4, Math.round(c.scalingScore || 0));

      return '<div style="display:grid;grid-template-columns:28px 1fr 70px 60px 60px 60px;' +
        'gap:10px;align-items:center;padding:10px 16px;border-radius:10px;' +
        'background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.05);' +
        'transition:background 0.2s;" ' +
        'onmouseover="this.style.background=&quot;rgba(124,58,237,0.08)&quot;" ' +
        'onmouseout="this.style.background=&quot;rgba(255,255,255,0.025)&quot;">' +
        '<div style="font-size:12px;font-weight:900;color:' + rankColor + ';text-align:center">#' + rank + '</div>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:800;color:#fff">' + (c.name || '—') + '</div>' +
          '<div style="margin-top:4px;height:4px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden">' +
            '<div style="height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#7c3aed,#14b8a6);transition:width 0.8s ease;' +
              'animation:none" data-width="' + barW + '%" class="s8-scale-bar"></div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:center;font-size:12px;font-weight:700;color:rgba(255,255,255,0.6)">' + (c.orders || 0).toLocaleString('en-US') + '</div>' +
        '<div style="text-align:center;font-size:12px;font-weight:800;color:' + ndrColor + '">' + ndr + '%</div>' +
        '<div style="text-align:center">' + scoreBadge(c.scalingScore || 0, 'scale') + '</div>' +
        '<div style="text-align:center">' + scoreBadge(c.riskScore || 0, 'risk') + '</div>' +
      '</div>';
    }).join('');

    mount.innerHTML =
      '<div style="margin:0 28px 28px;background:#0b1120;border:1px solid rgba(255,255,255,0.07);' +
        'border-radius:18px;padding:20px 4px;">' +
        '<div style="padding:0 12px 16px;display:flex;align-items:center;gap:10px;">' +
          '<div style="width:32px;height:32px;border-radius:10px;background:#7c3aed1e;display:flex;align-items:center;justify-content:center;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.2" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:14px;font-weight:900;color:#fff">' + s8Txt('Best Expansion List', 'قائمة أفضل توسع') + '</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,0.38);margin-top:2px">' + s8Txt('Candidate cities for expansion based on index', 'مدن مرشحة للتوسع حسب المؤشر') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:0 12px 6px;display:grid;grid-template-columns:28px 1fr 70px 60px 60px 60px;' +
          'gap:10px;font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;margin-bottom:8px;">' +
          '<div style="text-align:center">#</div><div>' + s8Txt('City', 'المدينة') + '</div>' +
          '<div style="text-align:center">' + s8Txt('Orders', 'الطلبات') + '</div><div style="text-align:center">NDR%</div>' +
          '<div style="text-align:center">' + s8Txt('Expansion', 'التوسع') + '</div><div style="text-align:center">' + s8Txt('Risk', 'المخاطر') + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;padding:0 12px;">' + rows + '</div>' +
      '</div>';

    /* Animate scaling bars */
    requestAnimationFrame(function () {
      mount.querySelectorAll('.s8-scale-bar').forEach(function (bar) {
        var w = bar.getAttribute('data-width');
        setTimeout(function () { bar.style.width = w; }, 100);
      });
    });
  })();

  requestAnimationFrame(function () {
    var cityRows = mountEl.querySelectorAll('.city-bar-row');
    cityRows.forEach(function (row) {
      var bar = row.querySelector('.city-bar-fill');
      if (!bar) return;
      var pct = row.getAttribute('data-pct');
      setTimeout(function () { bar.style.width = pct + '%'; }, parseInt(row.getAttribute('data-delay') || 0, 10));
    });
  });

  var pipelineBtn = mountEl.querySelector('#s8-btn-pipeline');
  if (pipelineBtn) pipelineBtn.addEventListener('click', function () { onNavigate('orders'); });

  var codBtn = mountEl.querySelector('#s8-btn-cod');
  if (codBtn) codBtn.addEventListener('click', function () { onNavigate('cod'); });

  var productsBtnBottom = mountEl.querySelector('#s8-btn-products-bottom');
  if (productsBtnBottom) productsBtnBottom.addEventListener('click', function () { onNavigate('products'); });

  var prodDots = mountEl.querySelectorAll('.s8-prod-dot');
  prodDots.forEach(function(dot) {
    dot.addEventListener('click', function() {
      var targetPage = this.getAttribute('data-page');
      mountEl.querySelectorAll('.s8-products-page').forEach(function(p) {
        p.style.display = 'none';
      });
      var targetEl = mountEl.querySelector('#s8-prod-page-' + targetPage);
      if(targetEl) targetEl.style.display = 'flex';
      
      prodDots.forEach(function(d) {
        d.style.background = 'rgba(255,255,255,0.2)';
      });
      this.style.background = '#fbbf24';
    });
  });

  /* Taager profit chart (Chart.js) dynamically updating */
  mountEl._updateCommissionChart = function (type, isInitial) {
    var activePeriodsObj, dispComm, dispDelta, dispColor, dispTitle;
    if (type === 'incoming') {
      activePeriodsObj = trend.incomingPeriods || {};
      dispComm = incomingCommission;
      dispDelta = overview.incomingCommission ? overview.incomingCommission.delta : 0;
      dispColor = '#f59e0b';
      dispTitle = s8Txt('Incoming Taager Profit After Tax', 'الربح القادم بعد الضريبة');
    } else if (type === 'lost') {
      activePeriodsObj = trend.lostPeriods || {};
      dispComm = lostCommission;
      dispDelta = overview.lostCommission ? overview.lostCommission.delta : 0;
      dispColor = '#ef4444';
      dispTitle = s8Txt('Lost Taager Profit After Tax', 'الربح المفقود بعد الضريبة');
    } else {
      activePeriodsObj = trend.periods || {};
      dispComm = earnedCommission;
      dispDelta = overview.earnedCommission ? overview.earnedCommission.delta : 0;
      dispColor = '#22c55e';
      dispTitle = s8Txt('Earned Taager Profit After Tax', 'الربح المحصل بعد الضريبة');
    }

    var chartData = activePeriodsObj['30'] || [];
    
    // Update DOM if not initial (since initial HTML is already built with it)
    if (!isInitial) {
      var topDeltaSign = dispDelta >= 0 ? '? ' : '? ';
      var topDeltaColor = dispDelta >= 0 ? '#84cc16' : '#ef4444';
      
      var dotEl = mountEl.querySelector('#s8-commission-dot');
      var subtitleEl = mountEl.querySelector('#s8-commission-subtitle');
      var valEl = mountEl.querySelector('#s8-commission-val');
      var deltaEl = mountEl.querySelector('#s8-commission-delta');
      
      if (dotEl) dotEl.style.background = dispColor;
      if (subtitleEl) subtitleEl.textContent = s8Txt('Total ', 'الإجمالي ') + dispTitle;
      if (valEl) valEl.textContent = dispComm.toLocaleString("en-US");
      if (deltaEl) {
        deltaEl.style.color = topDeltaColor;
        deltaEl.textContent = topDeltaSign + Math.abs(dispDelta).toFixed(1) + '%';
      }

      // Rebuild Stats
      var cTotal = chartData.reduce(function(sum, x) { return sum + x.v; }, 0);
      var cActive = chartData.filter(function(x) { return x.v > 0; }).length || 1;
      var cAvg = Math.round(cTotal / cActive);
      var cBest = chartData.length > 0 ? Math.max.apply(null, chartData.map(function (x) { return x.v; })) : 0;
      var cWorst = chartData.length > 0 ? Math.min.apply(null, chartData.map(function (x) { return x.v; })) : 0;
      var cAbove = chartData.filter(function (x) { return x.v > cAvg; }).length;
      
      var cBestDay = (chartData.find(function (x) { return x.v === cBest; }) || {}).d || '—';
      var cWorstDay = (chartData.find(function (x) { return x.v === cWorst; }) || {}).d || '—';
      
      var cDeltaSign = dispDelta >= 0 ? s8Txt('Upward', 'اتجاه صاعد') : s8Txt('Downward', 'اتجاه هابط');
      var cDeltaColor = dispDelta >= 0 ? '#22c55e' : '#ef4444';

      var cStats = [
        { label: s8Txt('Average Daily Profit', 'متوسط الربح اليومي'), value: cAvg.toLocaleString("en-US") + ' ' + nativeCurrency, color: 'rgba(255,255,255,0.6)', sub: null },
        { label: s8Txt('Best Day', 'أفضل يوم'),              value: cBest.toLocaleString("en-US") + ' ' + nativeCurrency, color: '#fbbf24',               sub: cBestDay },
        { label: s8Txt('Worst Day', 'أضعف يوم'),              value: cWorst.toLocaleString("en-US") + ' ' + nativeCurrency, color: '#ef4444',               sub: cWorstDay },
        { label: s8Txt('Days Above Average', 'أيام فوق المتوسط'),      value: s8Txt(cAbove + ' days', cAbove + ' يوم'),                color: '#3b82f6',               sub: null },
        { label: s8Txt('General Trend', 'الاتجاه العام'),          value: cDeltaSign,                      color: cDeltaColor,         sub: null },
      ];

      var statsWrap = mountEl.querySelector('#s8-commission-stats');
      if (statsWrap) {
        statsWrap.innerHTML = cStats.map(function(stat, i) {
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;' +
            (i < cStats.length - 1 ? 'border-left:1px solid rgba(255,255,255,0.06);' : '') + '">' +
            '<div style="font-size:9px;color:rgba(255,255,255,0.3);margin-bottom:4px;font-weight:600;">' + stat.label + '</div>' +
            '<div style="font-size:12px;font-weight:800;color:' + stat.color + ';">' + stat.value + '</div>' +
            (stat.sub ? '<div style="font-size:9px;color:rgba(255,255,255,0.22);margin-top:2px;">' + stat.sub + '</div>' : '') +
          '</div>';
        }).join('');
      }
    }

    var canvas = mountEl.querySelector('#s8-commission-chart');
    if (canvas && typeof Chart !== 'undefined') {
      if (mountEl._commissionChartInstance) {
        mountEl._commissionChartInstance.destroy();
      }
      var ctx2 = canvas.getContext('2d');
      var hex = dispColor.replace('#', '');
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      var r = parseInt(hex.substring(0,2), 16), g = parseInt(hex.substring(2,4), 16), b = parseInt(hex.substring(4,6), 16);

      var grad = ctx2.createLinearGradient(0, 0, 0, 160);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.32)');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');

      var maxVal = chartData.length > 0 ? Math.max.apply(null, chartData.map(function (x) { return x.v; })) : 100;
      var yMax = Math.ceil((maxVal * 1.15) / 100) * 100;
      if (yMax < 100) yMax = 100;
      var stepSize = Math.ceil(yMax / 3);
      var theme = window.dashboardThemeColors ? window.dashboardThemeColors() : {
        bg: '#080b12',
        surface: '#0d1220',
        borderSoft: 'rgba(255,255,255,0.1)',
        muted: 'rgba(255,255,255,0.45)',
        grid: 'rgba(255,255,255,0.05)',
        label: 'rgba(255,255,255,0.22)'
      };

      mountEl._commissionChartInstance = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: chartData.map(function (x) { return x.d.split(' ')[0]; }),
          datasets: [{
            data:            chartData.map(function (x) { return x.v; }),
            borderColor:     dispColor,
            borderWidth:     2,
            backgroundColor: grad,
            fill:            true,
            tension:         0.3,
            pointRadius:     3,
            pointBackgroundColor: dispColor,
            pointBorderColor:    theme.bg,
            pointBorderWidth:    1.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 260 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: theme.surface,
              borderColor:     theme.borderSoft,
              borderWidth:     1,
              titleColor:      theme.muted,
              bodyColor:       dispColor,
              bodyFont:        { size: 10, family: 'Cairo' },
              callbacks: {
                label: function (item) {
                  var n = Number(item.raw || 0);
                  return n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + nativeCurrency;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: theme.label, font: { size: 7, family: 'Cairo' } },
              border: { display: false },
            },
            y: {
              min: 0,
              max: yMax,
              ticks: {
                color: theme.label,
                font: { size: 7, family: 'Cairo' },
                stepSize: stepSize,
                callback: function (value) {
                  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
                }
              },
              grid:  { color: theme.grid, borderDash: [4, 4] },
              border: { display: false },
            },
          },
        },
      });
    }
  };

  mountEl._updateCommissionChart(s8CommissionType, true);

  var dropdown = window.renderTaagerDropdown || window.renderCustomSelect;
  if (typeof dropdown === 'function') {
    var typeWrap = mountEl.querySelector('#s8-commission-type-wrap');
    if (typeWrap) {
      dropdown(typeWrap, [
        { value: 'earned', label: s8Txt('Earned Taager Profit After Tax', 'الربح المحصل بعد الضريبة') },
        { value: 'incoming', label: s8Txt('Incoming Taager Profit After Tax', 'الربح القادم بعد الضريبة') },
        { value: 'lost', label: s8Txt('Lost Taager Profit After Tax', 'الربح المفقود بعد الضريبة') }
      ], s8CommissionType, function (value) {
        mountEl._s8CommissionType = value;
        mountEl._updateCommissionChart(value, false);
      }, { ariaLabel: 'Taager profit type' });
    }
  }

  var calculatorBtn = mountEl.querySelector('#s8-btn-calculator');
  if (calculatorBtn) calculatorBtn.addEventListener('click', function () { onNavigate('calculator'); });
  var gmvTargetBtn = mountEl.querySelector('#s8-btn-gmv-target');
  if (gmvTargetBtn) gmvTargetBtn.addEventListener('click', function () { onNavigate('gmvTarget'); });

  // -- Pub/Sub Listeners & Cleanup ---------------------------------------------
  if (window.DashboardGmvTargetState) {
    if (mountEl._s8GmvTargetListener) {
      window.DashboardGmvTargetState.unsubscribe(mountEl._s8GmvTargetListener);
    }
    mountEl._s8GmvTargetListener = function (next) {
      if (!next || String(next.accountId) !== String(_roiAccountId)) return;
      if (mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      window.renderSection8(mountEl, data, ctx);
    };
    window.DashboardGmvTargetState.subscribe(mountEl._s8GmvTargetListener);
  }

  if (window.DashboardRoiState) {
    if (mountEl._s8RoiListener) {
      window.DashboardRoiState.unsubscribe(mountEl._s8RoiListener);
    }
    mountEl._s8RoiListener = function (next) {
      if (!next || String(next.accountId) !== String(_roiAccountId)) return;
      if (mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      window.renderSection8(mountEl, data, ctx);
    };
    window.DashboardRoiState.subscribe(mountEl._s8RoiListener);
  }

  if (window.DashboardMarketingState) {
    if (mountEl._s8MarketingListener) {
      window.DashboardMarketingState.unsubscribe(mountEl._s8MarketingListener);
    }
    var currentMarketing = window.DashboardMarketingState.get(_roiAccountId);
    mountEl._s8MarketingKey = currentMarketing
      ? [currentMarketing.lastSyncAt || '', currentMarketing.summary && currentMarketing.summary.adSpend || 0, currentMarketing.manualOverride ? 1 : 0].join('|')
      : '';
    mountEl._s8MarketingListener = function (next) {
      if (!next || String(next.accountId) !== String(_roiAccountId)) return;
      if (mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var nextKey = [next.lastSyncAt || '', next.summary && next.summary.adSpend || 0, next.manualOverride ? 1 : 0].join('|');
      if (nextKey === mountEl._s8MarketingKey) return;
      mountEl._s8MarketingKey = nextKey;
      window.renderSection8(mountEl, data, ctx);
    };
    window.DashboardMarketingState.subscribe(mountEl._s8MarketingListener);
  }

  mountEl._dashboardSectionCleanup = function () {
    if (mountEl._commissionChartInstance) {
      mountEl._commissionChartInstance.destroy();
      mountEl._commissionChartInstance = null;
    }
    if (window.DashboardRoiState && mountEl._s8RoiListener) {
      window.DashboardRoiState.unsubscribe(mountEl._s8RoiListener);
      mountEl._s8RoiListener = null;
    }
    if (window.DashboardGmvTargetState && mountEl._s8GmvTargetListener) {
      window.DashboardGmvTargetState.unsubscribe(mountEl._s8GmvTargetListener);
      mountEl._s8GmvTargetListener = null;
    }
    if (window.DashboardMarketingState && mountEl._s8MarketingListener) {
      window.DashboardMarketingState.unsubscribe(mountEl._s8MarketingListener);
      mountEl._s8MarketingListener = null;
    }
  };

};
