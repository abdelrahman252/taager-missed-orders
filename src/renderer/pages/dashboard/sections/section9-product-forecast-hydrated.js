// ─────────────────────────────────────────────────────────────────────────────
// section9-product-forecast.js — Product-Level Smart Forecasting Engine
// Parity with Account Calculator (Section 7) — same inputs, tooltips, metrics
// ─────────────────────────────────────────────────────────────────────────────

window.renderSectionProductForecastHydratedEntry = function (mountEl, data, ctx) {
  'use strict';

  function pruneStaleProductForecastDom() {
    if (!mountEl || !document.querySelectorAll) return;
    Array.prototype.slice.call(document.querySelectorAll('.s9-root')).forEach(function (root) {
      if (mountEl.contains(root)) return;
      var pane = root.closest && root.closest('.dash-section-cache-pane');
      if (pane && pane.dataset && pane.dataset.sectionId === 'productForecast') {
        if (pane._s9ThemeObserver && typeof pane._s9ThemeObserver.disconnect === 'function') {
          pane._s9ThemeObserver.disconnect();
          pane._s9ThemeObserver = null;
        }
        if (pane._s9CombinationModal && pane._s9CombinationModal.parentNode) {
          pane._s9CombinationModal.parentNode.removeChild(pane._s9CombinationModal);
          pane._s9CombinationModal = null;
        }
        if (pane.parentNode) pane.parentNode.removeChild(pane);
        return;
      }
      if (root.parentNode) root.parentNode.removeChild(root);
    });
  }

  pruneStaleProductForecastDom();

  // ── Theme Observer ─────────────────────────────────────────────────────────
  if (mountEl._s9ThemeObserver) {
    mountEl._s9ThemeObserver.disconnect();
    mountEl._s9ThemeObserver = null;
  }
  if (mountEl._s9CombinationModal && mountEl._s9CombinationModal.parentNode) {
    mountEl._s9CombinationModal.parentNode.removeChild(mountEl._s9CombinationModal);
    mountEl._s9CombinationModal = null;
    document.body.style.overflow = '';
  }
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.attributeName === 'data-theme') {
        if (!mountEl.isConnected || mountEl.hidden) {
          mountEl._dashboardNeedsRefresh = true;
          return;
        }
        var refresh = function () {
          if (mountEl.isConnected && !mountEl.hidden) window.renderSectionProductForecastHydratedEntry(mountEl, data, ctx);
        };
        if (window.TaagerAfterNextPaint) window.TaagerAfterNextPaint(refresh);
        else setTimeout(refresh, 0);
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mountEl._s9ThemeObserver = observer;

  // ── 1. Initialization ───────────────────────────────────────────────────────
  var rawPd = (data && data.products && data.products.rankedList) ? data.products.rankedList : [];

  if (!rawPd.length) {
    mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--dash-text-faint)">' + p9Txt('No product data available for simulation', 'لا توجد بيانات منتجات متاحة للمحاكاة') + '</div>';
    return;
  }

  var isAr = (document.documentElement.getAttribute('lang') || window._kbotLang || localStorage.getItem('kbot-lang') || 'ar') === 'ar';
  function p9Txt(en, ar) {
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
  function p9Num(v) { return Number(v || 0).toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-US'); }
  function p9PctValue(value, decimals) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    return n.toFixed(decimals == null ? 2 : decimals)
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '');
  }
  function p9RatioPctValue(value, decimals) {
    return p9PctValue((Number(value) || 0) * 100, decimals);
  }
  var forecastAccountId = (data && data.meta && data.meta.activeAccountId) ||
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.activeAccountId) ||
    (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');
  var forecastCountry = String((data && data.meta && data.meta.activeCountry) ||
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.activeCountry) || '__all__').toLowerCase();
  var combinationStorageKey = 'taager_s9_product_combinations_v1:' + encodeURIComponent(String(forecastAccountId || '__all__')) + ':' + encodeURIComponent(forecastCountry);

  function skuKey(value) {
    return String(value || '').trim().toLowerCase();
  }
  function readProductCombinations() {
    try {
      var parsed = JSON.parse(localStorage.getItem(combinationStorageKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter(function (group) {
        return group && group.id && Array.isArray(group.skus) && group.skus.length > 1;
      }) : [];
    } catch (_) {
      return [];
    }
  }
  function writeProductCombinations(groups) {
    try { localStorage.setItem(combinationStorageKey, JSON.stringify(groups || [])); } catch (_) {}
  }
  function sumFields(target, source, fields) {
    fields.forEach(function (field) {
      target[field] = (Number(target[field]) || 0) + (Number(source && source[field]) || 0);
    });
  }
  function finiteNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback == null ? 0 : fallback);
  }
  function displayDecimal(value, decimals) {
    return p9PctValue(value, decimals == null ? 2 : decimals);
  }
  function aggregateProductGroup(group, members) {
    var primaryKey = skuKey(group.primarySku);
    var primary = members.find(function (product) { return skuKey(product && product.sku) === primaryKey; }) || members[0] || {};
    var combined = Object.assign({}, primary);
    var hasActualDelivered = members.some(function (member) { return member && member.actualDeliveredCount !== undefined; });
    var hasActualCommission = members.some(function (member) { return member && member.actualCommission !== undefined; });
    var additiveFields = [
      'units', 'pieces', 'placedCount', 'netOrderCount', 'totalOrderCount', 'statusTotalCount',
      'qty', 'revenue', 'commission', 'deliveredSales', 'deliveredCount', 'actualDeliveredCount',
      'actualCommission', 'actualDeliveredQty', 'actualDeliveredSales', 'expectedDeliveriesExact',
      'expectedTotalProfitBeforeAdSpend', 'expectedDeliveredSales', 'ndrBaseOrders', 'ndrDeliveredOrders',
      'drBaseOrders', 'drDeliveredOrders', 'totalPieces', 'canceledCount', 'canceledByYouCount',
      'failedCount', 'confirmedCount', 'shippingCount', 'processingCount', 'waitingCount',
      'outForDeliveryCount', 'deliverySuspendedCount', 'awaitingShipmentCount', 'pendingCount',
      'confirmationStatusCount', 'cancelStatusCount', 'pendingStatusCount',
      'netOrderProfitAfterTax', 'totalPlacedCommission'
    ];
    additiveFields.forEach(function (field) { combined[field] = 0; });
    members.forEach(function (member) { sumFields(combined, member, additiveFields); });

    var aliases = (group.skus || []).map(function (sku) { return String(sku || '').trim(); }).filter(Boolean);
    var netOrders = Number(combined.netOrderCount || combined.placedCount || 0);
    var delivered = Number(combined.deliveredCount || 0);
    var actualDelivered = hasActualDelivered ? Number(combined.actualDeliveredCount || 0) : delivered;
    var statusTotal = Number(combined.statusTotalCount || netOrders);
    var ndrBase = Number(combined.ndrBaseOrders || netOrders);
    var ndrDelivered = Number(combined.ndrDeliveredOrders || delivered);
    var drBase = Number(combined.drBaseOrders || combined.confirmedCount || 0);
    var drDelivered = Number(combined.drDeliveredOrders || delivered);
    combined.key = 's9-combination:' + group.id;
    combined.id = combined.key;
    combined.sku = String(group.primarySku || primary.sku || aliases[0] || '').trim();
    combined.skus = aliases;
    combined.name = primary.name || combined.sku || p9Txt('Combined product', 'منتج مدمج');
    combined.confirmationPct = statusTotal > 0 ? (Number(combined.confirmationStatusCount || combined.confirmedCount || 0) / statusTotal) * 100 : 0;
    combined.ndrPct = ndrBase > 0 ? (ndrDelivered / ndrBase) * 100 : 0;
    combined.expectedNdrRate = ndrBase > 0 ? ndrDelivered / ndrBase : (netOrders > 0 ? delivered / netOrders : 0);
    combined.drRate = drBase > 0 ? (drDelivered / drBase) * 100 : 0;
    combined.deliveryPct = netOrders > 0 ? (delivered / netOrders) * 100 : 0;
    combined.deliveredAov = delivered > 0 ? Number(combined.deliveredSales || 0) / delivered : 0;
    combined.actualDeliveredCount = actualDelivered;
    combined.actualCommission = hasActualCommission ? Number(combined.actualCommission || 0) : Number(combined.commission || 0);
    combined._s9Combination = {
      id: group.id,
      primarySku: combined.sku,
      skus: aliases,
      memberKeys: members.map(function (member) { return member.key || member.sku || member.name || ''; })
    };
    return combined;
  }
  function applyProductCombinations(products, groups) {
    var productList = Array.isArray(products) ? products : [];
    var claimed = {};
    var output = [];
    (groups || []).forEach(function (group) {
      var wanted = {};
      (group.skus || []).forEach(function (sku) { if (skuKey(sku)) wanted[skuKey(sku)] = true; });
      var members = productList.filter(function (product) { return !!wanted[skuKey(product && product.sku)]; });
      if (!members.length) return;
      members.forEach(function (member) { claimed[skuKey(member.sku)] = true; });
      output.push(aggregateProductGroup(group, members));
    });
    productList.forEach(function (product) {
      if (!claimed[skuKey(product && product.sku)]) output.push(product);
    });
    return output;
  }

  var productCombinations = readProductCombinations();
  var pd = applyProductCombinations(rawPd, productCombinations);
  function productStatusCount(product, bucket, fallbackFields) {
    var counts = product && (product.statusCounts || product.statusBucketCounts || product.bucketCounts);
    if (counts && counts[bucket] != null) return Math.max(0, Math.round(Number(counts[bucket]) || 0));
    fallbackFields = fallbackFields || [];
    for (var i = 0; i < fallbackFields.length; i++) {
      if (product && product[fallbackFields[i]] != null) {
        return Math.max(0, Math.round(Number(product[fallbackFields[i]]) || 0));
      }
    }
    return 0;
  }

  var expectedRateMode = window.isExpectedNdrMode && window.isExpectedNdrMode();
  var simulations = pd.map(function (p) {
    var orders = window.DashboardOrderMetrics
      ? window.DashboardOrderMetrics.netOrders(p)
      : (p.netOrderCount !== undefined ? p.netOrderCount : (p.placedCount || 0));
    var displayedDelivered = p.deliveredCount || p.units || 0;
    var actDelivered = p.actualDeliveredCount !== undefined ? p.actualDeliveredCount : displayedDelivered;
    var delivered = expectedRateMode ? displayedDelivered : actDelivered;
    var realNdr   = orders > 0 ? (delivered / orders) : 0;
    var expectedDeliveriesExact = p.expectedDeliveriesExact != null ? Number(p.expectedDeliveriesExact || 0) : null;
    var actCommission = finiteNumber(p.actualCommission !== undefined
      ? p.actualCommission
      : (p.actualEarnedProfitAfterTax !== undefined ? p.actualEarnedProfitAfterTax : (p.commission || 0)));
    var explicitAvgProfit = p.actualAverageProfitSource === 'delivered_orders' && p.actualAverageProfit != null
      ? Number(p.actualAverageProfit)
      : (p.averageProfit != null ? Number(p.averageProfit) : NaN);
    var fallbackProfit = p.netOrderProfitAfterTax != null ? p.netOrderProfitAfterTax : p.totalPlacedCommission;
    var realComm = actDelivered > 0
      ? actCommission / actDelivered
      : (window.DashboardOrderMetrics
        ? window.DashboardOrderMetrics.averageProfit(p)
        : (Number.isFinite(explicitAvgProfit)
          ? explicitAvgProfit
          : (orders > 0 ? finiteNumber(fallbackProfit) / orders : 0)));
    var averageProfitSource = window.DashboardOrderMetrics
      ? window.DashboardOrderMetrics.averageProfitSource(p)
      : (actDelivered > 0 ? 'delivered_orders' : (orders > 0 ? 'net_orders_fallback' : 'unavailable'));

    var realTaagerProfitAfterTax = Number(expectedRateMode ? p.commission || 0 : actCommission);
    var realConfirmationRate = Number(p.confirmationPct || p.confirmationRate || 0) / 100;
    var realConfirmed = p.confirmationStatusCount != null
      ? Number(p.confirmationStatusCount)
      : p.confirmedCount != null
        ? Number(p.confirmedCount)
        : p.confirmedOrders != null
          ? Number(p.confirmedOrders)
          : Math.round(orders * realConfirmationRate);
    if (!Number.isFinite(realConfirmed)) realConfirmed = Math.round(orders * realConfirmationRate);
    var realDr = Number(p.drRate || p.drPct || 0) / 100;
    var realDeliveredSales = Number(p.deliveredSales || p.totalDeliveredSales || 0);
    var realDeliveredAov = p.deliveredAov !== undefined
      ? Number(p.deliveredAov || 0)
      : (delivered > 0 ? realDeliveredSales / delivered : 0);

    if (expectedRateMode) {
      var overviewNdrPct = data && data.overview && data.overview.ndrRate && data.overview.ndrRate.value != null
        ? Number(data.overview.ndrRate.value)
        : (data && data.overview && data.overview.deliveryRate != null ? Number(data.overview.deliveryRate) : NaN);
      var globalExpectedNdrRate = Number.isFinite(overviewNdrPct) ? Math.max(0, Math.min(1, overviewNdrPct / 100)) : 0.35;
      var expectedNdrRate = (p.expectedNdrRate != null) ? Number(p.expectedNdrRate) : ((p.ndrPct != null) ? (p.ndrPct / 100) : globalExpectedNdrRate);
      
      realNdr = expectedNdrRate;
      expectedDeliveriesExact = expectedDeliveriesExact != null
        ? Math.min(orders, Math.max(0, expectedDeliveriesExact))
        : Math.min(orders, Math.max(0, orders * expectedNdrRate));
      delivered = Math.min(orders, Math.max(0, Math.round(expectedDeliveriesExact)));
      realTaagerProfitAfterTax = expectedDeliveriesExact * realComm;
      
      if (p.expectedDeliveredSales != null) {
        realDeliveredSales = Number(p.expectedDeliveredSales || 0);
      } else {
        var totalSales = Number(p.totalSales || p.sales || p.revenue || 0);
        realDeliveredSales = totalSales * expectedNdrRate;
      }
      realDeliveredAov = expectedDeliveriesExact > 0 ? realDeliveredSales / expectedDeliveriesExact : 0;
    } else {
      expectedDeliveriesExact = delivered;
    }

    var pId = p.key || p.sku || p.name;
    var savedPSpend = localStorage.getItem('kbot_s9_spend_' + pId);
    var realAdSpend = savedPSpend != null ? parseFloat(savedPSpend) : 0;
    if (savedPSpend == null && p._s9Combination && Array.isArray(p._s9Combination.memberKeys)) {
      realAdSpend = p._s9Combination.memberKeys.reduce(function (sum, memberKey) {
        var saved = localStorage.getItem('kbot_s9_spend_' + memberKey);
        return sum + (saved != null ? (parseFloat(saved) || 0) : 0);
      }, 0);
    }
    return {
      id:            pId,
      sku:           p.sku || '',
      skus:          p.skus || (p.sku ? [p.sku] : []),
      combination:   p._s9Combination || null,
      name:          p.name || p9Txt('Unknown Product', 'منتج غير معروف'),
      realOrders:    orders,
      realDelivered: delivered,
      realExpectedDeliveriesExact: expectedDeliveriesExact,
      expectedDeliveriesExact: expectedDeliveriesExact,
      realConfirmed: Math.max(0, Math.round(Number(realConfirmed) || 0)),
      realNdr:       realNdr,
      realCommission:realComm,
      averageProfitSource: averageProfitSource,
      realTaagerProfitAfterTax: realTaagerProfitAfterTax,
      realConfirmationRate: realConfirmationRate,
      realDr: realDr,
      rateMode: p.rateMode || (expectedRateMode ? 'historical_cohort' : 'actual'),
      realDeliveredSales: realDeliveredSales,
      realDeliveredAov: realDeliveredAov,
      outForDeliveryCount: productStatusCount(p, 'shipping', ['outForDeliveryCount', 'shippingExactCount', 'shippingCount']),
      deliverySuspendedCount: productStatusCount(p, 'delivery_suspended', ['deliverySuspendedCount', 'deliverySuspendedExactCount']),
      awaitingShipmentCount: productStatusCount(p, 'waiting', ['awaitingShipmentCount', 'waitingExactCount', 'waitingCount']),
      realAdSpend:   realAdSpend,
      // Editable — always stored in SAR internally
      adSpend:       realAdSpend,
      totalOrders:   orders,
      deliveredOrders: delivered,
      expectedDeliveriesExact: expectedDeliveriesExact,
      ndr:           realNdr,
      avgCommission: realComm,
      isModified:    false
    };
  });

  var selectedIdx  = Math.max(0, simulations.findIndex(function (sim) {
    return String(sim.id) === String(mountEl._s9SelectedProductId || '');
  }));
  var currentPage  = Math.max(1, Number(mountEl._s9CurrentPage) || 1);
  var itemsPerPage = 10;
  var tableSortBy  = Object.prototype.hasOwnProperty.call(mountEl, '_s9TableSortBy') ? mountEl._s9TableSortBy : 'orders';
  var tableSortDir = mountEl._s9TableSortDir || 'desc';
  var tableSearchQuery = mountEl._s9TableSearchQuery || '';
  var tableSearchTimer = null;
  var tableSearchToken = 0;
  var tableRenderTimer = null;
  var tableRenderPending = false;
  var simulationRowsRevision = Number(mountEl._s9SimulationRowsRevision || 0);
  var simulationRowsCacheKey = '';
  var simulationRowsCacheValue = null;
  var forecastRoiSettings = window.DashboardRoiState
    ? window.DashboardRoiState.get(forecastAccountId, data && data.roi)
    : { currency: window.dashboardActiveCurrency || 'SAR', egpRate: 52.0 };
  var viewCurrency = forecastRoiSettings.currency || window.dashboardActiveCurrency || 'SAR';
  var egpRate      = Number(forecastRoiSettings.egpRate) > 0 ? Number(forecastRoiSettings.egpRate) : 52.0;
  var forecastPeriod = (data && data.meta && data.meta.period) ||
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.period) ||
    (window.DashboardPeriodState && typeof window.DashboardPeriodState.get === 'function' ? window.DashboardPeriodState.get() : {}) ||
    {};
  var FORECAST_PLATFORMS = [
    { id: 'all', label: 'All' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'snapchat', label: 'Snapchat' },
    { id: 'facebook', label: 'Facebook' }
  ];
  var selectedMarketingPlatform = mountEl._s9MarketingPlatform || 'all';
  if (!FORECAST_PLATFORMS.some(function (platform) { return platform.id === selectedMarketingPlatform; })) {
    selectedMarketingPlatform = 'all';
    mountEl._s9MarketingPlatform = 'all';
  }
  var forecastMarketingState = window.DashboardMarketingState
    ? window.DashboardMarketingState.get(
        forecastAccountId,
        selectedMarketingPlatform === 'all' ? null : selectedMarketingPlatform
      )
    : null;
  var forecastMarketingSummary = forecastMarketingState && forecastMarketingState.summary || null;
  var campaignSpendRows = forecastMarketingSummary && Array.isArray(forecastMarketingSummary.campaignBreakdown)
    ? forecastMarketingSummary.campaignBreakdown
    : [];

  // ── 2. Currency helpers ─────────────────────────────────────────────────────
  function toDisplay(sarVal) {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(sarVal, window.dashboardActiveCurrency || 'SAR', viewCurrency);
    }
    if (viewCurrency === 'USD') return sarVal / 3.75;
    if (viewCurrency === 'EGP') return (sarVal / 3.75) * egpRate;
    return sarVal;
  }
  function toSAR(val) {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(val, viewCurrency, window.dashboardActiveCurrency || 'SAR');
    }
    if (viewCurrency === 'USD') return val * 3.75;
    if (viewCurrency === 'EGP') return (val / egpRate) * 3.75;
    return val;
  }
  function formatMoney(sarVal, noSign, decimals) {
    var val  = toDisplay(sarVal);
    var abs  = Math.abs(val);
    var sign = (val < 0 && !noSign) ? '-' : '';
    
    var valStr;
    if (abs >= 1000000) valStr = (abs / 1000000).toFixed(2) + 'M';
    else if (abs >= 1000)    valStr = (abs / 1000).toFixed(1) + 'K';
    else if (decimals != null) {
      valStr = abs.toLocaleString('en', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    } else valStr = Math.round(abs).toLocaleString('en');

    if (viewCurrency === 'USD') {
      return sign + '$' + valStr;
    } else {
      return sign + valStr + ' ' + viewCurrency;
    }
  }
  function formatPct(v) { return p9RatioPctValue(v) + '%'; }

  function matchMethodLabel(sim) {
    if (sim && sim.syncMatchDetail === 'separated_sku') return p9Txt('Marketing spend matched by separated SKU', 'Marketing spend matched by separated SKU');
    if (sim && sim.syncMatchDetail === 'glued_sku') return p9Txt('Marketing spend matched by glued SKU', 'Marketing spend matched by glued SKU');
    if (sim && sim.syncMatchMethod === 'sku') return p9Txt('Marketing spend matched by SKU', 'تمت مطابقة إنفاق التسويق بواسطة SKU');
    if (sim && sim.syncMatchMethod === 'sku+name') return p9Txt('Marketing spend matched by SKU and exact normalized name', 'تمت مطابقة إنفاق التسويق بواسطة SKU والاسم الموحد');
    if (sim && sim.syncMatchMethod === 'name') return p9Txt('Marketing spend matched by exact normalized name fallback', 'تمت مطابقة إنفاق التسويق بالاسم الموحد كخيار احتياطي');
    return p9Txt('No marketing campaign matched; include this SKU or product name in the campaign.', 'لا توجد حملة تسويق مطابقة؛ أضف SKU أو اسم المنتج إلى الحملة.');
  }

  function periodDate(value) {
    return String(value || '').slice(0, 10);
  }

  function productSyncPeriodLabel() {
    var summary = forecastMarketingSummary || {};
    var from = periodDate(summary.dateFrom || forecastPeriod.dateFrom || forecastPeriod.from || forecastPeriod.start);
    var to = periodDate(summary.dateTo || forecastPeriod.dateTo || forecastPeriod.to || forecastPeriod.end);
    if (from && to && from !== to) return from + ' - ' + to;
    return from || to || p9Txt('Selected dashboard period', 'فترة لوحة التحكم المحددة');
  }

  function textKey(value) {
    var arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    return String(value || '').toLowerCase().normalize('NFKC')
      .replace(/[٠-٩]/g, function (digit) { return String(arabicDigits.indexOf(digit)); })
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
      .replace(/\u0640/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ىئ]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/[ةه]/g, 'ه')
      .replace(/[^\w\u0600-\u06ff]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function skuCopyHtml(sku, opts) {
    opts = opts || {};
    if (window.dashboardSkuCopyHtml) return window.dashboardSkuCopyHtml(sku, opts);
    var value = String(sku || '').trim();
    if (!value && opts.hideEmpty) return '';
    var display = opts.text != null ? String(opts.text) : (value || opts.emptyText || 'N/A');
    var label = opts.label == null ? 'SKU' : String(opts.label || '');
    var prefix = opts.prefix === false || !label ? '' : label + (opts.separator == null ? ': ' : opts.separator);
    var tag = opts.block ? 'div' : 'span';
    var style = opts.style ? ' style="' + escapeHtml(opts.style) + '"' : '';
    return '<' + tag + ' dir="ltr"' + style + '>' + escapeHtml(prefix + display) + '</' + tag + '>';
  }
  function skuCopyRowHtml(sim) {
    var sku = String(sim && sim.sku || '').trim();
    var skuHtml = skuCopyHtml(sku, { style: 'color:#2dd4bf;font-size:var(--type-micro);font-weight:var(--weight-semibold)' });
    return '<div data-i18n-preserve style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:var(--type-micro);font-weight:var(--weight-semibold);color:rgba(255,255,255,.54)">' +
      skuHtml +
      '<span style="color:#f59e0b;min-width:0">&middot; ' + escapeHtml(matchMethodLabel(sim)) + '</span>' +
    '</div>';
  }
  function validSku(product) {
    var sku = textKey(product && product.sku || '');
    return sku && sku !== 'n a' && sku !== 'na' ? sku : '';
  }

  function hasTerm(text, term) {
    return !!term && (' ' + text + ' ').indexOf(' ' + term + ' ') !== -1;
  }

  function productTokens(name) {
    var stop = {
      ad: true, ads: true, campaign: true, tiktok: true, tik: true, tok: true,
      snapchat: true, snap: true, sc: true, facebook: true, fb: true, meta: true,
      ksa: true, saudi: true, sale: true, offer: true, new: true, test: true,
      flying: true, original: true, product: true,
      'منتج': true, 'عرض': true, 'جديد': true, 'اصلي': true, 'جهاز': true,
      'بعد': true, 'تعمل': true, 'يعمل': true, 'عدد': true, 'قطعه': true, 'حبه': true
    };
    return textKey(name).split(' ').filter(function (token) {
      return token.length >= 3 && !stop[token] && !/^x\d+$/i.test(token) && !/^\d+$/.test(token);
    });
  }

  function productPhrases(tokens) {
    var phrases = [];
    for (var size = 2; size <= Math.min(3, tokens.length); size++) {
      for (var start = 0; start <= tokens.length - size; start++) {
        phrases.push(tokens.slice(start, start + size).join(' '));
      }
    }
    return phrases;
  }

  function campaignSpendToSar(row) {
    var amount = Number(row && row.rawSpend || 0);
    var currency = String(row && row.currency || 'SAR').toUpperCase();
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(amount, currency, window.dashboardActiveCurrency || 'SAR');
    }
    if (currency === 'USD') return amount * 3.75;
    if (currency === 'EGP') return (amount / egpRate) * 3.75;
    return amount;
  }

  var attribution = window.TaagerProductAttribution;
  var productIndex = attribution
    ? attribution.createProductIndex(pd, {
        productNameOverrides: window.TaagerProductNames && typeof window.TaagerProductNames.all === 'function'
          ? window.TaagerProductNames.all()
          : {}
      })
    : null;

  function buildCampaignAssignments() {
    var assignments = {};
    var summary = {
      skuRows: 0,
      separatedSkuRows: 0,
      gluedSkuRows: 0,
      nameRows: 0,
      ambiguousRows: 0,
      unmatchedRows: 0
    };
    campaignSpendRows.forEach(function (row) {
      var result = productIndex ? attribution.matchCampaign(row, productIndex) : null;
      if (!result || result.status === 'unmatched') {
        summary.unmatchedRows++;
        return;
      }
      if (result.status === 'ambiguous') {
        summary.ambiguousRows++;
        return;
      }
      var idx = result.productIndex;
      if (!assignments[idx]) assignments[idx] = { spend: 0, methods: {}, details: {}, rowCount: 0 };
      assignments[idx].spend += campaignSpendToSar(row);
      assignments[idx].methods[result.method] = true;
      assignments[idx].details[result.matchDetail] = true;
      assignments[idx].rowCount++;
      summary[result.method + 'Rows']++;
      if (result.matchDetail === 'separated_sku') summary.separatedSkuRows++;
      if (result.matchDetail === 'glued_sku') summary.gluedSkuRows++;
    });
    return { assignments: assignments, summary: summary };
  }

  var campaignAssignmentResult = buildCampaignAssignments();
  simulations.forEach(function (sim, idx) {
    var assignment = campaignAssignmentResult.assignments[idx];
    if (!assignment && selectedMarketingPlatform !== 'all') {
      sim.realAdSpend = 0;
      sim.adSpend = 0;
      sim.syncedAdSpend = false;
      sim.platformSpendFiltered = true;
      sim.syncMatchMethod = '';
      sim.syncMatchDetail = '';
      sim.syncMatchedRows = 0;
      return;
    }
    if (!assignment) return;
    sim.realAdSpend = Number(assignment.spend.toFixed(2));
    sim.adSpend = sim.isModified ? sim.adSpend : sim.realAdSpend;
    sim.syncedAdSpend = sim.realAdSpend > 0;
    sim.syncMatchMethod = assignment.methods.sku && assignment.methods.name ? 'sku+name' :
      (assignment.methods.sku ? 'sku' : 'name');
    sim.syncMatchDetail = Object.keys(assignment.details || {}).length === 1
      ? Object.keys(assignment.details)[0]
      : sim.syncMatchMethod;
    sim.syncMatchedRows = assignment.rowCount;
  });

  // ── Helper: profit CSS class ────────────────────────────────────────────────
  function profitClass(val) {
    return val < 0 ? 's9-profit-negative' : val > 0 ? 's9-profit-positive' : 's9-profit-zero';
  }

  function isSpendLocked(sim) {
    return !!(sim && sim.syncedAdSpend && Number(sim.realAdSpend || 0) > 0);
  }

  // ── 3. Computation ──────────────────────────────────────────────────────────
  function computeSim(s) {
    var totalOrders     = Math.max(0, Math.round(Number(s.totalOrders) || 0));
    var deliveredOrders = Math.max(0, Math.round(Number(s.deliveredOrders) || 0));
    if (deliveredOrders > totalOrders && totalOrders > 0) deliveredOrders = totalOrders;
    var ndr = Math.max(0, Math.min(1, finiteNumber(s.ndr, totalOrders > 0 ? deliveredOrders / totalOrders : 0)));
    var calculation     = window.TaagerDashboardFinancialCore.calculate({
      mode: 'expected',
      netOrders: totalOrders,
      actualDeliveredOrders: 1,
      actualEarnedProfitAfterTax: s.avgCommission,
      currentTotalSales: 0,
      expectedNdrRate: ndr,
      adSpend: s.adSpend
    });
    var revenue         = calculation.expectedTotalProfitBeforeAdSpend;
    var netProfit       = calculation.expectedNetProfit;
    var expectedDeliveriesExact = calculation.expectedDeliveriesExact;
    deliveredOrders     = calculation.expectedDeliveriesDisplay;
    var roi             = calculation.expectedRoi;
    var cpa             = calculation.cpa;
    var breakEvenCpa    = calculation.breakEvenCpa;
    var returnPerSar    = calculation.expectedProfitRoas;
    var revenuePerDel   = calculation.averageProfit;
    var ndrRequired     = (totalOrders > 0 && s.avgCommission > 0) ? s.adSpend / (totalOrders * s.avgCommission) : null;
    var commRequired    = expectedDeliveriesExact > 0 ? s.adSpend / expectedDeliveriesExact : null;
    var delivRequired   = s.avgCommission > 0 ? Math.ceil(s.adSpend / s.avgCommission) : null;
    var projBudget      = s.adSpend * 2;
    var projOrders      = cpa > 0 ? Math.round(projBudget / cpa) : 0;
    var projected       = window.TaagerDashboardFinancialCore.calculate({
      mode: 'expected',
      netOrders: projOrders,
      actualDeliveredOrders: 1,
      actualEarnedProfitAfterTax: s.avgCommission,
      currentTotalSales: 0,
      expectedNdrRate: s.ndr,
      adSpend: projBudget
    });
    var projNet         = projected.expectedNetProfit;
    var projRoi         = projected.expectedRoi;
    return {
      totalOrders, deliveredOrders, expectedDeliveriesExact, revenue, netProfit, roi, cpa, breakEvenCpa, returnPerSar, revenuePerDel,
      ndrRequired, commRequired, delivRequired, projNet, projRoi, projBudget
    };
  }

  function resetSimulationToReal(s) {
    s.adSpend = Math.max(0, Number(s.realAdSpend) || 0);
    s.totalOrders = Math.max(0, Math.round(Number(s.realOrders) || 0));
    s.deliveredOrders = Math.max(0, Math.round(Number(s.realDelivered) || 0));
    s.expectedDeliveriesExact = Math.max(0, Number(s.realExpectedDeliveriesExact != null ? s.realExpectedDeliveriesExact : s.realDelivered) || 0);
    s.ndr = Math.max(0, Math.min(1, finiteNumber(s.realNdr, s.totalOrders > 0 ? (s.deliveredOrders / s.totalOrders) : 0)));
    s.avgCommission = Math.max(0, Number(s.realCommission) || 0);
    s.isModified = false;
  }

  function setSimTotalOrders(s, orders) {
    s.totalOrders = Math.max(0, Math.round(Number(orders) || 0));
    s.deliveredOrders = Math.round(s.totalOrders * s.ndr);
    s.expectedDeliveriesExact = s.totalOrders * s.ndr;
    s.isModified = true;
  }

  function setSimDeliveredOrders(s, delivered) {
    var totalOrders = Math.max(0, Math.round(Number(s.totalOrders) || 0));
    s.deliveredOrders = Math.max(0, Math.round(Number(delivered) || 0));
    if (totalOrders > 0 && s.deliveredOrders > totalOrders) s.deliveredOrders = totalOrders;
    s.ndr = totalOrders > 0 ? (s.deliveredOrders / totalOrders) : 0;
    s.expectedDeliveriesExact = s.deliveredOrders;
    s.isModified = true;
  }

  function setSimNdr(s, ndrPct) {
    var pct = Math.min(100, Math.max(0, Number(ndrPct) || 0));
    s.ndr = pct / 100;
    s.deliveredOrders = Math.round((Number(s.totalOrders) || 0) * s.ndr);
    s.expectedDeliveriesExact = (Number(s.totalOrders) || 0) * s.ndr;
    s.isModified = true;
  }

  // ── 4. Gauge SVG (identical to S7) ─────────────────────────────────────────
  function gaugeHtml(roi) {
    var cx = 190, cy = 165, R = 120, SW = 24;
    var START = 225, SPAN = 270;
    function pt(r, deg) {
      var rad = ((deg - 90) * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    function strokeArc(s, e) {
      var p1 = pt(R, s), p2 = pt(R, e), lg = (e - s) > 180 ? 1 : 0;
      return 'M ' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) + ' A ' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + p2.x.toFixed(2) + ' ' + p2.y.toFixed(2);
    }
    var clamped = Math.min(Math.max(roi, -100), 300);
    var pct = (clamped + 100) / 400;
    var needleDeg = START + pct * SPAN;
    var tip = pt(R - 5, needleDeg), bl = pt(6, needleDeg + 90), br = pt(6, needleDeg - 90);
    var roiColor = roi < 0 ? '#ef4444' : roi < 50 ? '#f59e0b' : '#00e676';
    var formattedRoi = (roi < 0 ? '-' : (roi > 0 ? '+' : '')) + Math.abs(roi).toFixed(0) + '%';
    var labelsHtml = [
      { pct: -100, text: '-100%', anchor: 'end' },
      { pct: 0,    text: '0%',    anchor: 'end' },
      { pct: 100,  text: '100%',  anchor: 'middle' },
      { pct: 200,  text: '200%',  anchor: 'start' },
      { pct: 300,  text: '300%+', anchor: 'start' },
    ].map(function (lbl) {
      var deg = START + ((lbl.pct + 100) / 400) * SPAN;
      var p = pt(R + SW / 2 + 18, deg);
      return '<text x="' + p.x.toFixed(2) + '" y="' + p.y.toFixed(2) + '" text-anchor="' + lbl.anchor + '" dominant-baseline="middle" fill="rgba(255,255,255,0.5)" font-size="11" font-weight="700" font-family="Inter, IBM Plex Sans Arabic, sans-serif" direction="ltr">' + lbl.text + '</text>';
    }).join('');
    return '<svg viewBox="0 0 380 250" width="100%" height="220" style="height:auto">' +
      '<defs><linearGradient id="s9g" x1="0%" y1="100%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#ef4444"/><stop offset="35%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#00e676"/>' +
      '</linearGradient></defs>' +
      '<path d="' + strokeArc(225, 495) + '" stroke="url(#s9g)" stroke-width="' + SW + '" fill="none" stroke-linecap="round"/>' +
      labelsHtml +
      '<polygon points="' + tip.x.toFixed(2) + ',' + tip.y.toFixed(2) + ' ' + bl.x.toFixed(2) + ',' + bl.y.toFixed(2) + ' ' + br.x.toFixed(2) + ',' + br.y.toFixed(2) + '" fill="white" style="filter:drop-shadow(0 0 4px rgba(255,255,255,0.8))"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy + 25) + '" text-anchor="middle" fill="' + roiColor + '" font-size="42" font-weight="700" font-family="Inter, IBM Plex Sans Arabic, sans-serif" direction="ltr">' + formattedRoi + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 62) + '" text-anchor="middle" fill="' + roiColor + '" font-size="13" font-weight="700" font-family="Inter, IBM Plex Sans Arabic, sans-serif">● ' + p9Txt(roi < 0 ? 'Loss' : roi < 50 ? 'Near Breakeven' : 'Profitable', roi < 0 ? 'خسارة' : roi < 50 ? 'قريب من التعادل' : 'مربح') + '</text>' +
      '</svg>';
  }

  // ── 5. Tooltip helper — exact S7 pattern ────────────────────────────────────
  function _tip(icon, title, desc, formula) {
    formula = formula || '';
    function enc(s) {
      return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return '<span class="s7-tip-badge" ' +
      'data-tip-icon="' + enc(icon) + '" ' +
      'data-tip-title="' + enc(title) + '" ' +
      'data-tip-desc="' + enc(desc) + '" ' +
      'data-tip-formula="' + enc(formula) + '" ' +
      'aria-label="' + enc(title) + '"></span>';
  }

  function valueStack(valueHtml, labelKey, extraClass) {
    return '<span class="expected-value-stack ' + (extraClass || '') + '" dir="auto">' +
      '<span class="expected-value-main">' + valueHtml + '</span>' +
      window.supposedBadgeHtml(labelKey) +
      '</span>';
  }

  function _kpiMiniTip(label, val, color, icon, tipTitle, tipDesc, tipFormula) {
    return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:var(--dash-radius-md);padding:14px;text-align:center;position:relative">' +
      '<div style="font-size:var(--type-caption);color:var(--dash-text-faint);margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:5px">' +
        label + ' ' + _tip(icon, tipTitle, tipDesc, tipFormula) +
      '</div>' +
      '<div class="s9-metric-val" style="font-size:var(--type-section-title);font-weight:var(--weight-semibold);color:' + color + '">' + val + '</div>' +
    '</div>';
  }

  // ── 6. Tooltip engine — exact S7 initTooltips() ────────────────────────────
  function initTooltips() {
    if (mountEl._s9TooltipCleanup) {
      mountEl._s9TooltipCleanup();
      mountEl._s9TooltipCleanup = null;
    }

    var old = document.getElementById('s7-global-tooltip');
    if (old) old.parentNode.removeChild(old);

    var tip = document.createElement('div');
    tip.id = 's7-global-tooltip';
    Object.assign(tip.style, {
      position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 0.18s ease, transform 0.18s ease',
      transform: 'translateY(6px)', maxWidth: '270px', minWidth: '210px',
      display: 'block', top: '0px', left: '0px', visibility: 'visible'
    });
    tip.innerHTML =
      '<div id="s7-tip-inner" style="' +
        'background:rgba(8,12,24,0.98);' +
        'border:1px solid rgba(59,130,246,0.45);' +
        'border-radius:var(--dash-radius-lg);' +
        'padding:14px 16px;' +
        'box-shadow:0 12px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05) inset;' +
        'font-family:var(--font-ui);' +
      '">' +
        '<div id="s7-tip-title" style="font-size:var(--type-caption);font-weight:var(--weight-semibold);letter-spacing:.05em;color:#93c5fd;margin-bottom:7px;display:flex;align-items:center;gap:5px;"></div>' +
        '<div id="s7-tip-desc"  style="font-size:var(--type-label);color:rgba(255,255,255,0.75);line-height:1.65;margin-bottom:0"></div>' +
        '<div id="s7-tip-flbl"  style="display:none;font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.12em;color:rgba(255,255,255,0.25);text-transform:uppercase;margin-top:9px;margin-bottom:4px;"></div>' +
        '<div id="s7-tip-fbox"  style="display:none;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:var(--dash-radius-sm);padding:7px 10px;font-size:var(--type-caption);color:#60a5fa;font-family:var(--font-mono);direction:ltr;line-height:1.5;word-break:break-all"></div>' +
      '</div>' +
      '<div id="s7-tip-arrow" style="' +
        'position:absolute;width:10px;height:10px;' +
        'background:rgba(8,12,24,0.98);' +
        'border-right:1px solid rgba(59,130,246,0.45);' +
        'border-bottom:1px solid rgba(59,130,246,0.45);' +
        'transform:rotate(45deg)' +
      '"></div>';
    document.body.appendChild(tip);

    var hideTimer;
    function showTip(badge) {
      clearTimeout(hideTimer);
      var icon    = badge.getAttribute('data-tip-icon')    || '';
      var title   = badge.getAttribute('data-tip-title')   || '';
      var desc    = badge.getAttribute('data-tip-desc')    || '';
      var formula = badge.getAttribute('data-tip-formula') || '';
      if (window.dashboardI18n) {
        icon = window.dashboardI18n.isQuestionMarkText && window.dashboardI18n.isQuestionMarkText(icon) ? '' : window.dashboardI18n.clean(icon);
        title = window.dashboardI18n.clean(title);
        desc = window.dashboardI18n.clean(desc);
        formula = window.dashboardI18n.clean(formula);
      }
      formula = formula
        .replace(/[\u00d7\u00c3\u2014]/g, '*')
        .replace(/[\u00f7\u00c3\u00b7]/g, '/')
        .replace(/[\u2212\u00e2\u02c6\u2019]/g, '-');
      document.getElementById('s7-tip-title').textContent = (icon ? icon + ' ' : '') + title;
      document.getElementById('s7-tip-desc').textContent = desc;
      var flbl = document.getElementById('s7-tip-flbl');
      var fbox = document.getElementById('s7-tip-fbox');
      if (formula) {
        flbl.textContent = p9Txt('Equation', 'المعادلة'); flbl.style.display = 'block';
        fbox.textContent = formula;    fbox.style.display = 'block';
      } else {
        flbl.style.display = 'none'; fbox.style.display = 'none';
      }
      tip.style.opacity = '0'; tip.style.transform = 'translateY(6px)';
      tip.style.left = '0px';  tip.style.top = '0px';
      requestAnimationFrame(function () {
        var br  = badge.getBoundingClientRect();
        var tw  = tip.offsetWidth  || 240;
        var th  = tip.offsetHeight || 120;
        var vw  = window.innerWidth;
        var MARGIN = 12, ARROW_H = 14;
        var cx   = br.left + br.width / 2;
        var left = cx - tw / 2;
        if (left < MARGIN) left = MARGIN;
        if (left + tw > vw - MARGIN) left = vw - tw - MARGIN;
        var top   = br.top - th - ARROW_H;
        var below = false;
        if (top < MARGIN) { top = br.bottom + ARROW_H; below = true; }
        tip.style.left = Math.round(left) + 'px';
        tip.style.top  = Math.round(top)  + 'px';
        var arrow     = document.getElementById('s7-tip-arrow');
        var arrowLeft = Math.max(10, Math.min(tw - 20, cx - left - 5));
        arrow.style.left = Math.round(arrowLeft) + 'px';
        if (below) {
          arrow.style.bottom = 'auto'; arrow.style.top = '-5px';
          arrow.style.transform = 'rotate(225deg)';
        } else {
          arrow.style.top = 'auto'; arrow.style.bottom = '-5px';
          arrow.style.transform = 'rotate(45deg)';
        }
        tip.style.opacity = '1'; tip.style.transform = 'translateY(0)';
      });
    }
    function hideTip() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        tip.style.opacity = '0'; tip.style.transform = 'translateY(6px)';
      }, 60);
    }
    mountEl._s9TooltipOver = function (e) {
      var badge = e.target.closest ? e.target.closest('.s7-tip-badge') : null;
      if (badge) showTip(badge);
    };
    mountEl._s9TooltipOut = function (e) {
      var badge = e.target.closest ? e.target.closest('.s7-tip-badge') : null;
      if (badge) hideTip();
    };
    document.addEventListener('mouseover', mountEl._s9TooltipOver);
    document.addEventListener('mouseout', mountEl._s9TooltipOut);
    mountEl._s9TooltipCleanup = function () {
      clearTimeout(hideTimer);
      if (mountEl._s9TooltipOver) document.removeEventListener('mouseover', mountEl._s9TooltipOver);
      if (mountEl._s9TooltipOut) document.removeEventListener('mouseout', mountEl._s9TooltipOut);
      mountEl._s9TooltipOver = null;
      mountEl._s9TooltipOut = null;
      var currentTip = document.getElementById('s7-global-tooltip');
      if (currentTip && currentTip.parentNode) currentTip.parentNode.removeChild(currentTip);
    };
  }

  // ── 7. Insight cards — SFE style (identical to S7) ─────────────────────────
  function renderInsightsFeed(s, c) {
    var insights = [];
    if (s.adSpend === 0) {
      insights.push({ type: 'info', icon: '💡', cat: p9Txt('AWAITING BUDGET', 'في انتظار الميزانية'),
        text: p9Txt('Enter an ad budget to generate smart forecasts.', 'يرجى إدخال ميزانية الحملة لتوليد التوقعات الذكية.') });
      return insights.map(_insightHtml).join('');
    }

    // Profitability
    if (c.netProfit < 0) {
      insights.push({ type: 'critical', icon: '🔴', cat: p9Txt('PROFITABILITY', 'الربحية'),
        text: p9Txt('Campaign is losing <span class="hi-red">', 'الحملة تتكبد خسارة <span class="hi-red">') + formatMoney(Math.abs(c.netProfit), true) + p9Txt('</span> net.', '</span> صافي.') });
    } else {
      insights.push({ type: 'positive', icon: '🟢', cat: p9Txt('PROFITABILITY', 'الربحية'),
        text: p9Txt('Campaign is profitable — net <span class="hi-cyan">', 'الحملة رابحة — صافي <span class="hi-cyan">') + formatMoney(c.netProfit, true) + '</span>.' });
    }

    // Unit economics
    if (c.cpa > c.revenuePerDel && s.adSpend > 0) {
      insights.push({ type: 'negative', icon: '📉', cat: p9Txt('UNIT ECONOMICS', 'اقتصاديات الطلب'),
        text: p9Txt('<span class="hi-red">CPA (', '<span class="hi-red">تكلفة الطلب (') + formatMoney(c.cpa, true, 2) + p9Txt(')</span> exceeds revenue per delivery <strong>(', ')</span> أعلى من إيراد التسليم <strong>(') + formatMoney(c.revenuePerDel, true, 2) + p9Txt(')</strong>. Scaling multiplies losses.', ')</strong>. التوسع سيضاعف الخسائر.') });
    } else if (c.revenuePerDel > 0 && s.adSpend > 0) {
      insights.push({ type: 'positive', icon: '📈', cat: p9Txt('UNIT ECONOMICS', 'اقتصاديات الطلب'),
        text: p9Txt('Revenue per delivery <span class="hi-cyan">(', 'إيراد التسليم <span class="hi-cyan">(') + formatMoney(c.revenuePerDel, true, 2) + p9Txt(')</span> exceeds CPA — unit economics healthy.', ')</span> أعلى من تكلفة الطلب — اقتصاديات صحية.') });
    }

    // NDR analysis
    var ndrPct = p9RatioPctValue(s.ndr);
    if (s.ndr < 0.20) {
      insights.push({ type: 'negative', icon: '⚠️', cat: p9Txt('NDR ANALYSIS', 'تحليل نسبة التسليم'),
        text: p9Txt('NDR of <span class="hi-red">', 'نسبة التسليم <span class="hi-red">') + ndrPct + p9Txt('%</span> is critically below 20% — primary driver of losses.', '%</span> أقل من حد الخطر 20% — سبب رئيسي للخسائر.') });
    } else if (s.ndr < 0.30) {
      insights.push({ type: 'warning', icon: '📊', cat: p9Txt('NDR ANALYSIS', 'تحليل نسبة التسليم'),
        text: p9Txt('NDR of <span class="hi-yellow">', 'نسبة التسليم <span class="hi-yellow">') + ndrPct + p9Txt('%</span> is below healthy baseline (30%). Improving NDR would materially boost profitability.', '%</span> أقل من المتوسط الصحي 30%. رفعها سيحسن الربحية بوضوح.') });
    } else if (s.ndr >= 0.40) {
      insights.push({ type: 'positive', icon: '✅', cat: p9Txt('NDR ANALYSIS', 'تحليل نسبة التسليم'),
        text: p9Txt('NDR of <span class="hi-cyan">', 'نسبة التسليم <span class="hi-cyan">') + ndrPct + p9Txt('%</span> reaches the top delivery tier (40%) — delivery is strong.', '%</span> أعلى من مستوى التسليم 40% — أداء تسليم قوي.') });
    }

    // Break-even hint
    if (c.ndrRequired !== null && c.ndrRequired <= 1 && c.netProfit < 0) {
      insights.push({ type: 'warning', icon: '⚡', cat: p9Txt('BREAK-EVEN', 'نقطة التعادل'),
        text: p9Txt('To break even, NDR must reach <strong style="color:#f59e0b">', 'للتعادل، ارفع نسبة التسليم إلى <strong style="color:#f59e0b">') + p9RatioPctValue(c.ndrRequired) + '%</strong>.' });
    }

    return insights.slice(0, 5).map(_insightHtml).join('');
  }

  function _insightHtml(i) {
    var trust = window.TaagerSmartInsights && window.TaagerSmartInsights.trustLabel
      ? window.TaagerSmartInsights.trustLabel(i.trust || 'estimated')
      : 'Estimated';
    return '<div class="sfe-insight sfe-insight--' + i.type + '">' +
      '<span class="sfe-insight-icon">' + i.icon + '</span>' +
      '<div class="sfe-insight-body">' +
        '<div class="sfe-insight-category">' + i.cat + ' · ' + trust + '</div>' +
        '<div class="sfe-insight-text">' + i.text + '</div>' +
      '</div></div>';
  }

  // ── 8. Table builder ────────────────────────────────────────────────────────
  function realProfit(sim) {
    var deliveredExact = sim && sim.realExpectedDeliveriesExact != null
      ? Number(sim.realExpectedDeliveriesExact)
      : Number(sim && sim.realDelivered);
    return (Math.max(0, finiteNumber(deliveredExact)) * finiteNumber(sim && sim.realCommission)) - finiteNumber(sim && sim.realAdSpend);
  }

  function invalidateSimulationRowsCache() {
    simulationRowsRevision += 1;
    mountEl._s9SimulationRowsRevision = simulationRowsRevision;
    simulationRowsCacheKey = '';
    simulationRowsCacheValue = null;
  }

  function sortedSimulationRows() {
    var cacheKey = [
      simulationRowsRevision,
      simulations.length,
      tableSearchQuery,
      tableSortBy,
      tableSortDir
    ].join('\u001f');
    if (simulationRowsCacheValue && simulationRowsCacheKey === cacheKey) {
      return simulationRowsCacheValue;
    }
    var rows = simulations.map(function (sim, idx) {
      return { sim: sim, idx: idx };
    });
    var query = textKey(tableSearchQuery);
    if (query) {
      rows = rows.filter(function (row) {
        return textKey(row.sim.name).indexOf(query) !== -1 ||
          textKey(row.sim.sku).indexOf(query) !== -1;
      });
    }
    if (!tableSortBy) {
      simulationRowsCacheKey = cacheKey;
      simulationRowsCacheValue = rows;
      return rows;
    }
    var direction = tableSortDir === 'asc' ? 1 : -1;
    rows = rows.sort(function (left, right) {
      var a = left.sim;
      var b = right.sim;
      var comparison = 0;
      if (tableSortBy === 'product') comparison = textKey(a.name).localeCompare(textKey(b.name));
      else if (tableSortBy === 'orders') comparison = a.realOrders - b.realOrders;
      else if (tableSortBy === 'confirmed') comparison = a.realConfirmed - b.realConfirmed;
      else if (tableSortBy === 'delivered') comparison = a.realDelivered - b.realDelivered;
      else if (tableSortBy === 'ndr') comparison = a.realNdr - b.realNdr;
      else if (tableSortBy === 'spend') comparison = a.realAdSpend - b.realAdSpend;
      else if (tableSortBy === 'profit') comparison = realProfit(a) - realProfit(b);
      if (!comparison) comparison = left.idx - right.idx;
      return comparison * direction;
    });
    simulationRowsCacheKey = cacheKey;
    simulationRowsCacheValue = rows;
    return rows;
  }

  function sortHeader(label, key) {
    var suffix = tableSortBy === key ? (tableSortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return '<button type="button" class="s9-sort-btn' + (tableSortBy === key ? ' is-active' : '') +
      '" data-sort="' + key + '">' + label + suffix + '</button>';
  }

  function compactSortHeader(lines, key) {
    var suffix = tableSortBy === key ? (tableSortDir === 'asc' ? '&uarr;' : '&darr;') : '';
    return '<button type="button" class="s9-sort-btn s9-sort-btn--stacked' + (tableSortBy === key ? ' is-active' : '') +
      '" data-sort="' + key + '">' +
        lines.map(function (line, index) {
          return '<span' + (index ? ' class="s9-sort-subline"' : '') + '>' + line + '</span>';
        }).join('') +
        (suffix ? '<span class="s9-sort-arrow">' + suffix + '</span>' : '') +
      '</button>';
  }

  function buildTable() {
    var sortedRows = sortedSimulationRows();
    var totalFilteredRows = sortedRows.length;
    var totalPages = Math.ceil(totalFilteredRows / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    var startIndex    = (currentPage - 1) * itemsPerPage;
    var paginatedSims = sortedRows.slice(startIndex, startIndex + itemsPerPage);

    var rows = paginatedSims.map(function (row) {
      var s            = row.sim;
      var absoluteIdx  = row.idx;
      var realNetProfit = realProfit(s);
      var isSel        = absoluteIdx === selectedIdx;
      var trStyle      = 'cursor:pointer;transition:background 0.2s;border-bottom:1px solid rgba(255,255,255,0.04);background:' + (isSel ? 'rgba(59,130,246,0.1)' : 'transparent') + ';';
      var displaySpend = s.realAdSpend === 0
        ? (s.platformSpendFiltered ? '0' : '')
        : Math.round(toDisplay(s.realAdSpend));
      var spendLocked = isSpendLocked(s)
        ? ' disabled title="' + p9Txt('Filtered from marketing campaign spend', 'تمت تصفية الإنفاق من حملات التسويق') + '"'
        : '';

      // ── FIX: Use CSS class for profit color — overrides any theme stylesheet ──
      var pClass = profitClass(realNetProfit);
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      var netProfitColor = realNetProfit < 0 ? '#ef4444' : (realNetProfit > 0 ? (isLight ? '#10b981' : '#00e676') : (isLight ? '#6b7280' : 'rgba(255,255,255,0.6)'));

      return '<tr style="' + trStyle + '" data-idx="' + absoluteIdx + '" class="s9-row">' +
        '<td data-i18n-preserve class="s9-product-cell">' + s.name +
          (s.combination ? '<span style="display:inline-flex;margin-inline-start:6px;padding:2px 6px;border-radius:var(--radius-pill);background:rgba(168,85,247,.14);border:1px solid rgba(168,85,247,.32);color:#c4b5fd;font-size:var(--type-micro);font-weight:var(--weight-semibold);vertical-align:middle;">' + p9Txt('COMBINED', 'مدمج') + '</span>' : '') +
          skuCopyHtml(s.combination ? s.combination.skus.join(' + ') : (s.sku || ''), { emptyText: 'N/A', block: true, style: 'font-size:var(--type-micro);font-weight:var(--weight-semibold);color:rgba(255,255,255,.42);margin-top:3px' }) +
          '<div style="font-size:var(--type-micro);font-weight:var(--weight-semibold);color:' + (s.syncedAdSpend ? '#2dd4bf' : '#f59e0b') + ';margin-top:3px;">' + matchMethodLabel(s) + '</div>' +
        '</td>' +
        '<td class="s9-number-cell">' + p9Num(s.realOrders) + '</td>' +
        '<td class="s9-number-cell s9-number-cell--confirmed">' + p9Num(s.realConfirmed) + '</td>' +
        '<td class="s9-number-cell">' + valueStack(p9Num(s.realDelivered), 'delivered', 's9-table-value-stack') + '</td>' +
        '<td class="s9-number-cell">' + valueStack(formatPct(s.realNdr), 'dr', 's9-table-value-stack') + '</td>' +
        '<td class="s9-input-cell">' +
          '<input type="text" inputmode="numeric" class="s9-spend-input" data-idx="' + absoluteIdx + '" value="' + displaySpend + '" placeholder="0" ' +
            spendLocked + '>' +
        '</td>' +
        '<td class="s9-profit-cell ' + pClass + '" style="color:' + netProfitColor + ' !important;" dir="ltr">' +
          '<span class="s9-profit-value ' + pClass + '" style="color:' + netProfitColor + ' !important;-webkit-text-fill-color:' + netProfitColor + ' !important;">' + valueStack(formatMoney(realNetProfit), 'profit', 's9-table-value-stack') + '</span>' +
        '</td>' +
      '</tr>';
    }).join('');
    if (!rows) {
      rows = '<tr><td colspan="7" style="padding:28px 16px;text-align:center;color:rgba(255,255,255,0.45);font-size:var(--type-control);font-weight:var(--weight-semibold);">' +
        (tableSearchQuery
          ? p9Txt('No product matches this search.', 'لا يوجد منتج مطابق لهذا البحث.')
          : p9Txt('No products available.', 'لا توجد منتجات متاحة.')) +
        '</td></tr>';
    }

    // Pagination
    var pagesHtml = '';
    var totalP = Math.max(1, totalPages);
    for (var i = 1; i <= totalP; i++) {
      pagesHtml += '<button class="s9-page-btn" data-page="' + i + '" style="margin:0 2px;padding:4px 8px;border-radius:4px;border:none;background:' + (i === currentPage ? '#3b82f6' : 'rgba(255,255,255,0.05)') + ';color:' + (i === currentPage ? '#fff' : 'rgba(255,255,255,0.5)') + ';cursor:pointer;font-family:inherit;">' + i + '</button>';
    }

    var paginationHtml = window.renderDashboardPagination ? window.renderDashboardPagination({
      currentPage: currentPage,
      totalPages: totalP,
      totalItems: totalFilteredRows,
      startItem: totalFilteredRows ? startIndex + 1 : 0,
      endItem: Math.min(startIndex + itemsPerPage, totalFilteredRows),
      itemLabel: p9Txt('products', 'منتج'),
      pageButtonClass: 's9-page-btn',
      prevClass: 's9-page-prev',
      nextClass: 's9-page-next',
      className: 's9-dashboard-pagination'
    }) : null;
    var syncedProductCount = simulations.filter(function (sim) { return !!sim.syncedAdSpend; }).length;
    var matchSummary = campaignAssignmentResult.summary;
    var platformTabs = FORECAST_PLATFORMS.map(function (platform) {
      return '<button type="button" class="s9-platform-tab' + (selectedMarketingPlatform === platform.id ? ' is-active' : '') +
        '" data-s9-platform="' + platform.id + '">' + platform.label + '</button>';
    }).join('');

    return '<div class="s9-table-container dash-scroll">' +
      '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
          '<div style="font-size:var(--type-subtitle);font-weight:var(--weight-semibold);color:#fff;">' + p9Txt('Products', 'المنتجات') + '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" id="s9-combine-products" class="s9-combine-products-btn" style="border:1px solid rgba(168,85,247,.42);background:rgba(168,85,247,.13);color:#c4b5fd;border-radius:var(--dash-radius-sm);padding:7px 11px;font-size:var(--type-caption);font-weight:var(--weight-semibold);font-family:inherit;cursor:pointer;">+ ' + p9Txt('Combine Products', 'دمج المنتجات') + '</button>' +
            '<button type="button" id="s9-clear-sort" class="s9-clear-sort"' + (tableSortBy ? '' : ' disabled') + '>' + p9Txt('Clear sort', 'مسح الترتيب') + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:var(--type-label);color:var(--dash-text-faint);margin-top:2px;">' + p9Txt('Enter budget per product to see forecasts.', 'أدخل الميزانية لكل منتج لرؤية التوقعات.') + '</div>' +
        '<div style="display:block;margin-top:10px;padding:8px 10px;border:1px solid rgba(45,212,191,.18);border-radius:var(--dash-radius-md);background:rgba(45,212,191,.06);">' +
          '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;">' +
            '<span style="font-size:var(--type-caption);color:#2dd4bf;font-weight:var(--weight-semibold);">' + p9Txt('Marketing sync period', 'Marketing sync period') + ': ' + productSyncPeriodLabel() + ' · ' + p9Txt('Spend platform', 'منصة الإنفاق') + ': ' + FORECAST_PLATFORMS.filter(function (platform) { return platform.id === selectedMarketingPlatform; })[0].label + '</span>' +
            '<span style="font-size:var(--type-micro);color:rgba(255,255,255,.48);font-weight:var(--weight-semibold);">' + p9Txt('Matched products', 'المنتجات المطابقة') + ': ' + syncedProductCount + ' / ' + simulations.length + ' · ' + p9Txt('Separated SKU', 'SKU منفصل') + ': ' + matchSummary.separatedSkuRows + ' · ' + p9Txt('Glued SKU', 'SKU ملتصق') + ': ' + matchSummary.gluedSkuRows + ' · ' + p9Txt('Name fallback', 'مطابقة الاسم') + ': ' + matchSummary.nameRows + ' · ' + p9Txt('Ambiguous', 'ملتبس') + ': ' + matchSummary.ambiguousRows + ' · ' + p9Txt('Unmatched', 'غير مطابق') + ': ' + matchSummary.unmatchedRows + '</span>' +
            '<span style="font-size:var(--type-micro);color:#f59e0b;font-weight:var(--weight-semibold);">' + p9Txt('Best accuracy: include the product SKU in each TikTok, Snapchat, or Facebook campaign name. If no SKU is present, fallback requires the complete normalized product name. Campaigns containing an unknown SKU stay unmatched to prevent incorrect spend allocation.', 'لأدق نتيجة: ضع SKU المنتج داخل اسم كل حملة تيك توك أو سناب شات أو فيسبوك. تقبل مطابقة الاسم كلمة مميزة واحدة أو عبارة مطابقة مع توحيد اختلافات الكتابة العربية الشائعة. قد تحتاج أسماء الحملات التاريخية المعدلة إلى تحديث بيانات الحملات قبل أن تظهر هنا.') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="s9-platform-tabs" aria-label="' + p9Txt('Advertising spend platform', 'منصة الإنفاق الإعلاني') + '">' + platformTabs + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:220px;position:relative;">' +
            '<input type="search" id="s9-product-search" value="' + escapeHtml(tableSearchQuery) + '" placeholder="' + p9Txt('Search product name or SKU...', 'ابحث باسم المنتج أو SKU...') + '" ' +
              'style="width:100%;box-sizing:border-box;background:var(--dash-surface);border:1px solid rgba(255,255,255,0.10);border-radius:var(--dash-radius-md);color:#fff;font-family:var(--font-ui);font-size:var(--type-label);font-weight:var(--weight-semibold);padding:9px 12px;outline:none;transition:border-color .18s,box-shadow .18s;" />' +
          '</div>' +
          '<div style="font-size:var(--type-caption);color:rgba(255,255,255,0.42);font-weight:var(--weight-semibold);white-space:nowrap;">' +
            p9Txt('Showing', 'يعرض') + ' ' + totalFilteredRows + ' / ' + simulations.length +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="s9-table-scroll dash-scroll">' +
        '<table class="s9-products-table">' +
          '<colgroup>' +
            '<col class="s9-col-product">' +
            '<col class="s9-col-net">' +
            '<col class="s9-col-confirmed">' +
            '<col class="s9-col-delivered">' +
            '<col class="s9-col-ndr">' +
            '<col class="s9-col-budget">' +
            '<col class="s9-col-profit">' +
          '</colgroup>' +
          '<thead style="position:sticky;top:0;background:#0b0f19;z-index:10;border-bottom:1px solid rgba(255,255,255,0.06);font-size:var(--type-caption);color:var(--dash-text-faint);">' +
            '<tr>' +
              '<th style="padding:10px 16px;font-weight:var(--weight-semibold);">' + sortHeader(p9Txt('Product', 'المنتج'), 'product') + '</th>' +
              '<th style="padding:10px 16px;font-weight:var(--weight-semibold);">' + sortHeader(p9Txt('Net Orders', 'صافي الطلبات'), 'orders') + '</th>' +
              '<th style="padding:10px 16px;font-weight:var(--weight-semibold);">' + sortHeader(p9Txt('Confirmed Orders', 'الطلبات المؤكدة'), 'confirmed') + '</th>' +
              '<th style="padding:10px 16px;font-weight:var(--weight-semibold);">' + sortHeader(p9Txt('Delivered Orders', 'الطلبات المسلمة'), 'delivered') + '</th>' +
              '<th style="padding:10px 16px;font-weight:var(--weight-semibold);">' + sortHeader('NDR ' + p9Txt('Real', 'الفعلي'), 'ndr') + '</th>' +
              '<th style="padding:10px 16px;font-weight:var(--weight-semibold);">' + sortHeader(p9Txt('Ad Budget', 'الميزانية الإعلانية') + ' (' + viewCurrency + ')', 'spend') + '</th>' +
              '<th style="padding:10px 16px;font-weight:var(--weight-semibold);text-align:left;">' + sortHeader(p9Txt('Net Profit', 'صافي الربح'), 'profit') + '</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="padding:12px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01);">' +
        (paginationHtml ||
          '<div style="display:flex;justify-content:center;align-items:center;gap:8px;">' +
            '<button class="s9-page-prev" style="background:transparent;border:none;color:' + (currentPage > 1 ? '#fff' : 'rgba(255,255,255,0.2)') + ';cursor:' + (currentPage > 1 ? 'pointer' : 'default') + ';">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
            '</button>' +
            '<div style="display:flex;align-items:center;">' + pagesHtml + '</div>' +
            '<button class="s9-page-next" style="background:transparent;border:none;color:' + (currentPage < totalPages ? '#fff' : 'rgba(255,255,255,0.2)') + ';cursor:' + (currentPage < totalPages ? 'pointer' : 'default') + ';">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"></polyline></svg>' +
            '</button>' +
          '</div>'
        ) +
      '</div>' +
    '</div>';
  }

  // ── 9. Simulator panel builder ──────────────────────────────────────────────
  function buildSimulator() {
    var s = simulations[selectedIdx];
    if (!s) return '<div style="flex:1;"></div>';
    var c = computeSim(s);

    // ── Product-level metric mini-cards (first row visible, details collapsed) ──
    var primaryMetricsHtml =
      '<div class="s9-kpi-grid s9-kpi-grid--primary">' +
        // Taager dashboard/status/NDR migration:
        // Average profit is derived from order profit minus tax profit, then averaged per delivered order.
        _kpiMiniTip(
          p9Txt('Net Orders', 'صافي الطلبات'),
          p9Num(c.totalOrders), '#fff', '📦',
          p9Txt('Net Orders', 'صافي الطلبات'),
          p9Txt('Total number of orders placed for this product.', 'العدد الكلي للطلبات التي وردت لهذا المنتج.'),
          null
        ) +
        _kpiMiniTip(
          p9Txt('Confirmed', 'مؤكدة'),
          p9Num(s.realConfirmed), '#3b82f6', '✓',
          p9Txt('Confirmed Orders', 'الطلبات المؤكدة'),
          p9Txt('Orders that passed confirmation for this selected product.', 'الطلبات التي تم تأكيدها لهذا المنتج المحدد.'),
          'confirmedOrders = netOrders * confirmationRate'
        ) +
        _kpiMiniTip(
          p9Txt('Delivered', 'تم تسليمها'),
          valueStack(p9Num(Math.round(c.deliveredOrders)), 'delivered', 's9-card-value-stack'), '#00e676', '✅',
          p9Txt('Delivered Orders', 'الطلبات المسلمة'),
          p9Txt('Orders successfully delivered to customers, based on simulated NDR.', 'الطلبات التي وصلت للعميل بناءً على نسبة التسليم المحاكاة.'),
          'delivered = totalOrders * NDR'
        ) +
        _kpiMiniTip(
          p9Txt('Net Delivery Rate', 'نسبة التسليم NDR'),
          valueStack(formatPct(s.ndr), 'dr', 's9-card-value-stack'), (window.dashboardRateColor ? window.dashboardRateColor(s.ndr, { scale: 'ratio' }) : (s.ndr >= 0.40 ? '#22d3ee' : s.ndr >= 0.30 ? '#00e676' : s.ndr >= 0.20 ? '#f59e0b' : '#ef4444')), '📊',
          p9Txt('Net Delivery Rate (NDR)', 'نسبة التسليم (NDR)'),
          p9Txt('Percentage of orders successfully delivered. Healthy baseline starts at 30%, with top tier at 40%+.', 'النسبة المئوية للطلبات التي تم تسليمها. المعيار الصحي يبدأ من 30%، وأعلى مستوى من 40% فأكثر.'),
          'NDR = deliveredOrders / totalOrders * 100'
        ) +
      '</div>';

    var detailMetricsHtml =
      '<div class="s9-kpi-grid s9-kpi-grid--details">' +
        _kpiMiniTip(
          p9Txt('Average Profit', 'متوسط الربح') + (s.averageProfitSource === 'net_orders_fallback' ? ' · ' + p9Txt('Estimated from net orders', 'تقديري من صافي الطلبات') : ''),
          valueStack(formatMoney(s.realCommission, true, 2), 'profit', 's9-card-value-stack'), '#3b82f6', '💵',
          p9Txt('Average Profit', 'متوسط الربح'),
          s.averageProfitSource === 'net_orders_fallback'
            ? p9Txt('Estimated average profit from net orders because this product has no delivered orders.', 'متوسط ربح تقديري من صافي الطلبات لأن هذا المنتج لا يحتوي على طلبات مسلمة.')
            : p9Txt('Average profit per delivered order for this selected product.', 'متوسط الربح لكل طلب مسلم لهذا المنتج المحدد.'),
          s.averageProfitSource === 'net_orders_fallback' ? 'estimatedAverageProfit = netOrderProfitAfterTax / netOrders' : 'averageProfit = productProfitAfterTax / deliveredOrders'
        ) +
        _kpiMiniTip(
          p9Txt('Confirmation Rate', 'نسبة التأكيد'),
          formatPct(s.realConfirmationRate), '#22d3ee', '✓',
          p9Txt('Confirmation Rate', 'نسبة التأكيد'),
          p9Txt('Confirmed orders divided by net placed orders for this selected product.', 'الطلبات المؤكدة مقسومة على صافي الطلبات لهذا المنتج المحدد.'),
          'confirmationRate = confirmedOrders / netOrders'
        ) +
        _kpiMiniTip(
          expectedRateMode ? p9Txt('Historical Cohort DR', 'نسبة DR للفئة التاريخية') : p9Txt('DR Rate', 'نسبة DR'),
          formatPct(s.realDr), '#60a5fa', '📈',
          expectedRateMode ? p9Txt('Historical Cohort DR', 'نسبة DR للفئة التاريخية') : p9Txt('DR Rate', 'نسبة DR'),
          expectedRateMode
            ? p9Txt('Delivered orders divided by confirmed orders from the selected historical NDR cohort.', 'الطلبات المسلمة مقسومة على الطلبات المؤكدة من فئة NDR التاريخية المحددة.')
            : p9Txt('Delivered orders divided by confirmed orders for this selected product.', 'الطلبات المسلمة مقسومة على الطلبات المؤكدة لهذا المنتج المحدد.'),
          expectedRateMode ? 'Historical DR = cohort delivered / cohort confirmed' : 'DR = deliveredOrders / confirmedOrders'
        ) +
        _kpiMiniTip(
          p9Txt('Out for delivery', '\u0642\u064a\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0644'),
          p9Num(s.outForDeliveryCount), '#14b8a6', 'i',
          p9Txt('Out for delivery', '\u0642\u064a\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0644'),
          p9Txt('Orders for this selected product currently out for delivery.', '\u0637\u0644\u0628\u0627\u062a \u0647\u0630\u0627 \u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0645\u062d\u062f\u062f \u0627\u0644\u0645\u0648\u062c\u0648\u062f\u0629 \u062d\u0627\u0644\u064a\u0627 \u0642\u064a\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0644.'),
          'Out for delivery = product orders with shipping status'
        ) +
        _kpiMiniTip(
          p9Txt('Delivery suspended', '\u062a\u0645 \u062a\u0639\u0644\u064a\u0642 \u0627\u0644\u062a\u0648\u0635\u064a\u0644'),
          p9Num(s.deliverySuspendedCount), '#f59e0b', 'i',
          p9Txt('Delivery suspended', '\u062a\u0645 \u062a\u0639\u0644\u064a\u0642 \u0627\u0644\u062a\u0648\u0635\u064a\u0644'),
          p9Txt('Orders for this selected product where delivery is suspended.', '\u0637\u0644\u0628\u0627\u062a \u0647\u0630\u0627 \u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0645\u062d\u062f\u062f \u0627\u0644\u062a\u064a \u062a\u0645 \u062a\u0639\u0644\u064a\u0642 \u062a\u0648\u0635\u064a\u0644\u0647\u0627.'),
          'Delivery suspended = product orders with delivery_suspended status'
        ) +
        _kpiMiniTip(
          p9Txt('Awaiting shipment', '\u0641\u064a \u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0634\u062d\u0646'),
          p9Num(s.awaitingShipmentCount), '#94a3b8', 'i',
          p9Txt('Awaiting shipment', '\u0641\u064a \u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0634\u062d\u0646'),
          p9Txt('Orders for this selected product waiting to be shipped.', '\u0637\u0644\u0628\u0627\u062a \u0647\u0630\u0627 \u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0645\u062d\u062f\u062f \u0627\u0644\u062a\u064a \u062a\u0646\u062a\u0638\u0631 \u0627\u0644\u0634\u062d\u0646.'),
          'Awaiting shipment = product orders with waiting status'
        ) +
      '</div>';

    var detailsExpanded = !!mountEl._s9ForecastDetailsExpanded;
    var metricsHtml =
      '<div class="s9-forecast-metrics">' +
        primaryMetricsHtml +
        '<details class="s9-forecast-details" ' + (detailsExpanded ? 'open' : '') + '>' +
          '<summary class="s9-forecast-details-summary">' +
            '<span class="s9-details-chevron">⌄</span>' +
            '<span class="s9-details-text s9-details-text--closed">' + p9Txt('Press or click to expand for more details.', 'اضغط أو انقر للتوسيع لمزيد من التفاصيل.') + '</span>' +
            '<span class="s9-details-text s9-details-text--open">' + p9Txt('Press or click to collapse details.', 'اضغط أو انقر لإخفاء التفاصيل.') + '</span>' +
          '</summary>' +
          detailMetricsHtml +
        '</details>' +
      '</div>';

    // ── Editable NDR input ────────────────────────────────────────────────────
    var ndrInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Net Delivery Rate (NDR)', 'نسبة التسليم (NDR)') + ' ' +
            _tip('📊',
              p9Txt('Net Delivery Rate (NDR)', 'نسبة التسليم (NDR)'),
              p9Txt('Percentage of orders delivered to customers. Below 20% is critical, 30%+ is healthy, 40%+ is top tier.', 'نسبة الطلبات التي وصلت للعميل. أقل من 20% خطر، 30% فأعلى صحي، 40% فأعلى أعلى مستوى.'),
              'NDR = deliveredOrders / totalOrders * 100') +
          '</label>' +
          '<span style="font-size:var(--type-caption);color:rgba(255,255,255,0.35);">' + p9Txt('Actual: ', 'الفعلي: ') + formatPct(s.realNdr) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-ndr-input sfe-input2" min="0" max="100" step="any" value="' + p9RatioPctValue(s.ndr) + '" placeholder="24" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">%</span>' +
        '</div>' +
        '<div class="sfe-slider-markers" style="margin-top:6px;">' +
          '<span class="sfe-marker sfe-marker--danger">' + p9Txt('DANGER', 'خطر') + '<br>20%</span>' +
          '<span class="sfe-marker sfe-marker--mid">' + p9Txt('GOOD', 'جيد') + '<br>30%</span>' +
          '<span class="sfe-marker sfe-marker--safe">' + p9Txt('TOP', 'الأعلى') + '<br>40%+</span>' +
        '</div>' +
      '</div>';

    // Editable average profit input. avgCommission is retained as a compatibility field.
    var commInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Average Profit / Delivered Order', 'متوسط الربح لكل طلب مسلم') + ' ' +
            _tip('💵',
              p9Txt('Average Profit / Delivered Order', 'متوسط الربح لكل طلب مسلم'),
              p9Txt('Editable average profit assumption used for forecast math. The real KPI above is average profit from the sheet.', 'افتراض متوسط الربح المستخدم في المحاكاة. المؤشر الحقيقي أعلاه هو متوسط الربح من الشيت.'),
              'totalProfitBeforeAdSpend = expectedDeliveriesExact * averageProfitPerDeliveredOrder') +
          '</label>' +
          '<span style="font-size:var(--type-caption);color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Actual: ', 'الفعلي: ') + displayDecimal(toDisplay(s.realCommission), 2) + ' ' + viewCurrency + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-comm-input sfe-input2" min="1" step="any" value="' + displayDecimal(toDisplay(s.avgCommission), 2) + '" placeholder="32.79" style="direction:ltr;">' +
          '<span class="sfe-input-unit2 s9-comm-unit">' + viewCurrency + '</span>' +
        '</div>' +
      '</div>';

    var spendInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Scenario Ad Budget', 'ميزانية الإعلان في السيناريو') +
          '</label>' +
          '<span style="font-size:var(--type-caption);color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Actual: ', 'الفعلي: ') + formatMoney(s.realAdSpend, true) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-sim-spend-input sfe-input2" min="0" step="1" value="' + Math.round(toDisplay(s.adSpend)) + '" placeholder="0" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">' + viewCurrency + '</span>' +
        '</div>' +
        (isSpendLocked(s) ? '<div style="font-size:var(--type-micro);color:#2dd4bf;font-weight:var(--weight-semibold);margin-top:8px">' + p9Txt('Actual spend is synced from marketing platforms for ', 'تمت مزامنة الإنفاق الفعلي من منصات التسويق للفترة ') + productSyncPeriodLabel() + '. ' + p9Txt('Edit the scenario budget above without changing the synced actual spend.', 'هذا الإنفاق مقفل لأنه جاء من منصة تسويق متصلة.') + '</div>' : '') +
      '</div>';

    var ordersInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Net Orders', 'صافي الطلبات') +
          '</label>' +
          '<span style="font-size:var(--type-caption);color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Actual: ', 'الفعلي: ') + p9Num(s.realOrders) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-total-orders-input sfe-input2" min="0" step="1" value="' + c.totalOrders + '" placeholder="0" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">' + p9Txt('orders', 'طلبات') + '</span>' +
        '</div>' +
      '</div>';

    var deliveredInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Delivered Orders', 'الطلبات المسلمة') +
          '</label>' +
          '<span style="font-size:var(--type-caption);color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Actual: ', 'الفعلي: ') + p9Num(s.realDelivered) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-delivered-orders-input sfe-input2" min="0" step="1" value="' + c.deliveredOrders + '" placeholder="0" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">' + p9Txt('orders', 'طلبات') + '</span>' +
        '</div>' +
      '</div>';

    // ── Currency toggle ───────────────────────────────────────────────────────
    var currencyCountries = { SAR: 'SA', USD: 'US', EGP: 'EG', AED: 'AE', IQD: 'IQ', OMR: 'OM' };
    var currToggleHtml =
      '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;">' +
        ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'].map(function (currency) {
          var active = viewCurrency === currency;
          return '<div class="s9-curr-btn ' + (active ? 's9-curr-active' : '') + '" data-curr="' + currency + '" style="display:flex;align-items:center;gap:4px;padding:7px 12px;border-radius:var(--dash-radius-xl);font-size:var(--type-control);font-weight:var(--weight-semibold);cursor:pointer;transition:.2s;' +
            (active ? 'background:rgba(59,130,246,0.18);border:1px solid rgba(59,130,246,0.45);color:#60a5fa;' : 'background:transparent;border:1px solid transparent;color:rgba(255,255,255,0.38);') +
            '"><span style="font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.04em;opacity:.75">' + currencyCountries[currency] + '</span><span>' + currency + '</span></div>';
        }).join('') +
      '</div>';

    var rateSnap = window.TaagerCurrency && typeof window.TaagerCurrency.snapshot === 'function'
      ? window.TaagerCurrency.snapshot()
      : { source: 'defaults', updatedAt: '' };
    var rateNoteHtml =
      '<div style="background:rgba(59,130,246,0.08);padding:16px;border-radius:var(--dash-radius-md);border:1px solid rgba(59,130,246,0.18);">' +
        '<div style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:#93c5fd;margin-bottom:5px;">' + p9Txt('Global exchange rates', 'أسعار الصرف العامة') + '</div>' +
        '<div style="font-size:var(--type-micro);color:rgba(255,255,255,0.58);line-height:1.6;">' +
          p9Txt('Rates come from the dashboard top bar. Source: ', 'أسعار الصرف من الشريط العلوي. المصدر: ') +
          (rateSnap.source || 'defaults') +
        '</div>' +
      '</div>';

    // ── Financial KPI cards ──────────────────────────────────────────────────
    var npClass = c.netProfit < 0 ? 's9-profit-negative' : c.netProfit > 0 ? 's9-profit-positive' : 's9-profit-zero';
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var npColor = c.netProfit < 0 ? '#ef4444' : (c.netProfit > 0 ? (isLight ? '#10b981' : '#00e676') : (isLight ? '#6b7280' : 'rgba(255,255,255,0.6)'));
    var kpiCardsHtml =
      '<div class="s9-kpi-cards-grid">' +
        // Net Profit
        '<div class="s7-card">' +
          '<div style="font-size:var(--type-caption);color:#00e676;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:4px;">' + p9Txt('Net Profit After Ad Spend', 'صافي الربح بعد الإنفاق الإعلاني') + ' ' + _tip('🪙', p9Txt('Net Profit After Ad Spend', 'صافي الربح بعد الإنفاق الإعلاني'), p9Txt('Total profit before ad spend minus ad spend.', 'إجمالي الربح قبل الإنفاق الإعلاني ناقص الإنفاق الإعلاني.'), 'netProfit = totalProfitBeforeAdSpend - adSpend') + '</div>' +
          '<div class="s9-kpi-netprofit s9-forecast-kpi-value ' + npClass + '" style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:' + npColor + ' !important;" dir="ltr">' + valueStack(formatMoney(c.netProfit), 'profit', 's9-card-value-stack') + '</div>' +
          '<div style="font-size:var(--type-micro);color:var(--dash-text-faint);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:var(--dash-radius-md);">' + viewCurrency + '</div>' +
        '</div>' +
        // Revenue
        '<div class="s7-card">' +
          '<div style="font-size:var(--type-caption);color:#3b82f6;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:4px;">' + p9Txt('Total Profit Before Ad Spend', 'إجمالي الربح قبل الإنفاق الإعلاني') + ' ' + _tip('💰', p9Txt('Total Profit Before Ad Spend', 'إجمالي الربح قبل الإنفاق الإعلاني'), p9Txt('Exact expected deliveries multiplied by average profit per delivered order.', 'الطلبات المتوقع تسليمها بدقة مضروبة في متوسط الربح لكل طلب مسلم.'), 'totalProfitBeforeAdSpend = expectedDeliveriesExact * averageProfitPerDeliveredOrder') + '</div>' +
          '<div class="s9-forecast-kpi-value" style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:#fff;" dir="ltr">' + valueStack(formatMoney(c.revenue), 'revenue', 's9-card-value-stack') + '</div>' +
          '<div style="font-size:var(--type-micro);color:var(--dash-text-faint);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:var(--dash-radius-md);">' + viewCurrency + '</div>' +
        '</div>' +
        // CPA
        '<div class="s7-card">' +
          '<div style="font-size:var(--type-caption);color:#a855f7;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:4px;">CPA ' + _tip('🎯', p9Txt('Cost Per Acquisition (CPA)', 'تكلفة الطلب (CPA)'), p9Txt('Cost per acquired net order. It should remain below break-even CPA.', 'تكلفة الحصول على طلب صافي واحد. يجب أن تبقى أقل من تكلفة التعادل.'), 'CPA = adSpend / netOrders') + '</div>' +
          '<div style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:#fff;" dir="ltr">' + formatMoney(c.cpa, false, 2) + '</div>' +
          '<div style="font-size:var(--type-micro);color:var(--dash-text-faint);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:var(--dash-radius-md);">' + viewCurrency + '</div>' +
        '</div>' +
        // Break-even CPA
        '<div class="s7-card">' +
          '<div style="font-size:var(--type-caption);color:#f59e0b;font-weight:var(--weight-semibold);display:flex;align-items:center;gap:4px;">' + p9Txt('Break-even CPA', 'تكلفة التعادل') + ' ' + _tip('⚖️', p9Txt('Break-even CPA', 'تكلفة الاكتساب عند التعادل'), p9Txt('Maximum CPA before this product starts losing money. It equals average profit per delivered order multiplied by NDR.', 'أعلى تكلفة اكتساب قبل أن يبدأ هذا المنتج بالخسارة. يساوي متوسط الربح لكل طلب مسلم مضروبا في نسبة التسليم الصافي.'), 'Break-even CPA = averageProfitPerDeliveredOrder * NDR') + '</div>' +
          '<div class="s9-kpi-breakeven s9-forecast-kpi-value" style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:' + (c.cpa > c.breakEvenCpa ? '#ef4444' : '#f59e0b') + ';" dir="ltr">' + valueStack(formatMoney(c.breakEvenCpa, false, 2), 'breakeven', 's9-card-value-stack') + '</div>' +
          '<div style="font-size:var(--type-micro);color:var(--dash-text-faint);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:var(--dash-radius-md);">' + viewCurrency + '</div>' +
        '</div>' +
      '</div>';

    return '<div class="s9-sim-container dash-scroll">' +

      // Header + currency toggle
      '<div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<div style="font-size:var(--type-label);color:#3b82f6;font-weight:var(--weight-semibold);letter-spacing:1px;white-space:nowrap;">' + p9Txt('PRODUCT SMART FORECAST', 'مُحاكي التوقعات الذكية') + '</div>' +
          '<button type="button" class="s9-reset-real-btn" style="border:1px solid ' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.45)') + ';background:' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.10)') + ';color:' + (document.documentElement.getAttribute('data-theme') === 'light' ? '#15803d' : '#86efac') + ';border-radius:var(--dash-radius-sm);padding:6px 12px;font-size:var(--type-caption);font-weight:var(--weight-semibold);font-family:inherit;cursor:pointer;flex-shrink:0;">' + p9Txt('Reset to Actual Data', 'الرجوع للبيانات الفعلية') + '</button>' +
        '</div>' +
        '<div data-i18n-preserve style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:#fff;line-height:1.35;word-break:break-word;" title="' + s.name.replace(/"/g, '&quot;') + '">' + s.name + '</div>' +
        skuCopyRowHtml(s) +
        (s.combination ? '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:var(--dash-radius-md);border:1px solid rgba(168,85,247,.28);background:rgba(168,85,247,.08);">' +
          '<div><div style="font-size:var(--type-micro);color:#c4b5fd;font-weight:var(--weight-semibold);margin-bottom:4px;">' + p9Txt('COMBINED SKUS', 'أكواد المنتجات المدمجة') + '</div><div dir="ltr" style="display:flex;gap:5px;flex-wrap:wrap;">' + s.combination.skus.map(function (sku) { return skuCopyHtml(sku, { prefix: false, style: 'padding:3px 7px;border-radius:var(--radius-pill);background:rgba(255,255,255,.06);color:#fff;font-size:var(--type-micro);font-weight:var(--weight-semibold)' }); }).join('') + '</div></div>' +
          '<button type="button" class="s9-uncombine-products" data-combination-id="' + escapeHtml(s.combination.id) + '" style="border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.09);color:#fca5a5;border-radius:var(--dash-radius-sm);padding:6px 9px;font-size:var(--type-micro);font-weight:var(--weight-semibold);font-family:inherit;cursor:pointer;">' + p9Txt('Uncombine', 'إلغاء الدمج') + '</button>' +
        '</div>' : '') +
        '<div style="margin-top:4px;">' + currToggleHtml + '</div>' +
      '</div>' +

      '<div data-sim-panel="1" style="padding:24px;display:flex;flex-direction:column;gap:20px;">' +

        // 4-metric product panel
        metricsHtml +

        // Financial KPI cards
        kpiCardsHtml +

        // Controls: scenario inputs
        '<div class="s9-inputs-grid">' +
          ordersInputHtml +
          spendInputHtml +
          ndrInputHtml +
          deliveredInputHtml +
          commInputHtml +
          rateNoteHtml +
        '</div>' +

        // Gauge
        '<div style="background:rgba(255,255,255,0.01);border:1px solid rgba(255,255,255,0.04);border-radius:var(--dash-radius-lg);padding:20px;display:flex;flex-direction:column;align-items:center;">' +
          '<div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.8);margin-bottom:4px;display:flex;align-items:center;gap:6px;">' +
            p9Txt('ROI Gauge', 'مقياس العائد على الاستثمار') + ' ' +
            _tip('📊', p9Txt('Return on Investment (ROI)', 'العائد على الاستثمار (ROI)'), p9Txt('Measures campaign profitability. 0% = break-even, positive = profit, negative = loss.', 'يقيس ربحية الحملة. 0% تعادل، موجب ربح، سالب خسارة.'), 'ROI = (netProfit / adSpend) * 100%') +
          '</div>' +
          '<div id="s9-gauge-wrap" style="width:100%;max-width:340px;">' + gaugeHtml(c.roi) + '</div>' +
        '</div>' +

        // Insights feed
        '<div>' +
          '<div style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.8);margin-bottom:12px;display:flex;align-items:center;gap:6px;">' +
            '🧠 ' + p9Txt('Smart Insights', 'المساعد الذكي') +
          '</div>' +
          '<div class="sfe-insights-feed">' + renderInsightsFeed(s, c) + '</div>' +
        '</div>' +

      '</div>' +
    '</div>';
  }

  // ── 10. CSS ─────────────────────────────────────────────────────────────────
  var cssIsLight = document.documentElement.getAttribute('data-theme') === 'light';
  var CSS =
    // ── FIX: Profit cell color classes — !important overrides any theme CSS ──
    // These three classes are the single source of truth for profit cell colors.
    // Using !important ensures they win over any dashboard light/dark theme rules.
    (cssIsLight ?
      '.s9-profit-cell.s9-profit-negative,.s9-profit-value.s9-profit-negative { color: #ef4444 !important; -webkit-text-fill-color: #ef4444 !important; }' +
      '.s9-profit-cell.s9-profit-positive,.s9-profit-value.s9-profit-positive { color: #10b981 !important; -webkit-text-fill-color: #10b981 !important; }' +
      '.s9-profit-cell.s9-profit-zero,.s9-profit-value.s9-profit-zero { color: #6b7280 !important; -webkit-text-fill-color: #6b7280 !important; }' +

      // KPI card Net Profit value — same classes reused
      '.s9-kpi-netprofit.s9-profit-negative { color: #ef4444 !important; }' +
      '.s9-kpi-netprofit.s9-profit-positive { color: #10b981 !important; }' +
      '.s9-kpi-netprofit.s9-profit-zero     { color: #6b7280 !important; }'
      :
      '.s9-profit-cell.s9-profit-negative,.s9-profit-value.s9-profit-negative { color: #ef4444 !important; -webkit-text-fill-color: #ef4444 !important; }' +
      '.s9-profit-cell.s9-profit-positive,.s9-profit-value.s9-profit-positive { color: #00e676 !important; -webkit-text-fill-color: #00e676 !important; }' +
      '.s9-profit-cell.s9-profit-zero,.s9-profit-value.s9-profit-zero { color:var(--dash-text-muted) !important; -webkit-text-fill-color:var(--dash-text-muted) !important; }' +

      // KPI card Net Profit value — same classes reused
      '.s9-kpi-netprofit.s9-profit-negative { color: #ef4444 !important; }' +
      '.s9-kpi-netprofit.s9-profit-positive { color: #00e676 !important; }' +
      '.s9-kpi-netprofit.s9-profit-zero     { color:var(--dash-text-muted) !important; }'
    ) +
    '.s9-sort-btn{appearance:none;background:transparent;border:0;color:inherit;font:inherit;font-weight:var(--weight-bold);padding:0;cursor:pointer;white-space:nowrap}' +
    '.s9-products-table{width:100%;min-width:620px;border-collapse:collapse;table-layout:fixed;text-align:center}' +
    '.s9-products-table th{padding:8px 5px!important;font-weight:var(--weight-bold)!important;vertical-align:middle;line-height:1.05;text-align:center}' +
    '.s9-products-table .s9-sort-btn{white-space:normal;line-height:1.05;max-width:100%;text-align:center}' +
    '.s9-products-table .s9-sort-btn--stacked{display:inline-flex;flex-direction:column;align-items:center;gap:1px}' +
    '.s9-products-table .s9-sort-subline{font-size:var(--type-micro);opacity:.8}' +
    '.s9-products-table .s9-sort-arrow{font-size:var(--type-micro);color:#60a5fa}' +
    '.s9-col-product{width:auto}.s9-col-net{width:58px}.s9-col-confirmed{width:74px}.s9-col-delivered{width:78px}.s9-col-ndr{width:64px}.s9-col-budget{width:88px}.s9-col-profit{width:100px}' +
    '.s9-product-cell{padding:10px 10px!important;font-weight:var(--weight-bold);color:#fff;text-align:start;line-height:1.12;word-break:break-word}' +
    '.s9-number-cell{padding:10px 5px!important;color:rgba(255,255,255,0.66);font-size:var(--type-control);font-weight:var(--weight-semibold);text-align:center;white-space:nowrap}' +
    '.s9-number-cell--confirmed{color:#3b82f6;font-weight:var(--weight-bold)}' +
    '.s9-table-value-stack{width:100%;font-size:var(--type-control)}' +
    '.s9-table-value-stack .supposed-badge{font-size:var(--type-micro);line-height:1.05;color:#fbbf24!important;-webkit-text-fill-color:#fbbf24!important}' +
    '.s9-card-value-stack{width:100%;font-size:inherit}' +
    '.s9-card-value-stack .supposed-badge{font-size:var(--type-micro);color:#fbbf24!important;-webkit-text-fill-color:#fbbf24!important}' +
    '.s9-metric-val,.s9-forecast-kpi-value{min-width:0;max-width:100%;text-align:center}' +
    '.s9-metric-val .expected-value-stack,.s9-forecast-kpi-value .expected-value-stack{display:flex}' +
    '.s9-input-cell{padding:8px 5px!important;text-align:center}' +
    '.s9-profit-cell{padding:10px 5px!important;font-weight:var(--weight-bold);text-align:center;white-space:nowrap}' +
    '.s9-sort-btn:hover,.s9-sort-btn.is-active{color:#60a5fa}' +
    '.s9-clear-sort{border:1px solid rgba(255,255,255,.14);background:transparent;color:rgba(255,255,255,.65);padding:5px 9px;border-radius:var(--dash-radius-sm);font:inherit;font-size:var(--type-caption);font-weight:var(--weight-semibold);cursor:pointer}' +
    '.s9-clear-sort:disabled{opacity:.35;cursor:default}' +
    '.s9-platform-tabs{display:flex;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap}' +
    '.s9-platform-tab{border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.55);border-radius:var(--radius-pill);padding:6px 12px;font:inherit;font-size:var(--type-caption);font-weight:var(--weight-semibold);cursor:pointer}' +
    '.s9-platform-tab:hover{border-color:rgba(96,165,250,.45);color:#93c5fd}' +
    '.s9-platform-tab.is-active{border-color:rgba(59,130,246,.55);background:rgba(59,130,246,.16);color:#60a5fa}' +
    '@media (max-width:620px){.s9-combo-dialog>div:nth-child(2)>div:first-child{grid-template-columns:1fr!important}.s9-combo-dialog>div:nth-child(2)>div:nth-child(2)>div:last-child{grid-template-columns:repeat(2,minmax(0,1fr))!important}}' +

    // ── Dark background for all input wrapper containers ──
    '[data-sim-panel] > div > div[style*="border-radius:var(--dash-radius-md)"],' +
    '[data-sim-panel] div[style*="border-radius:var(--dash-radius-md)"][style*="rgba(255,255,255,0.02)"]' +
    '{background:rgba(255,255,255,0.02)!important;color-scheme:dark}' +

    // Input wrap — exact S7 SFE pattern
    '.sfe-input-wrap2{display:flex;align-items:center;background:' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(12, 56, 70, 0.47)' : 'rgba(255,255,255,0.06)') + ';border:1px solid rgba(255,255,255,0.12);border-radius:var(--dash-radius-sm);overflow:hidden;transition:border-color .2s;color-scheme:dark}' +
    '.sfe-input-wrap2:focus-within{border-color:rgba(0,229,160,.4);box-shadow:0 0 0 2px rgba(0,229,160,0.08)}' +
    '.sfe-input2{background:#161921!important;border:none;outline:none;color:#f0f1f3!important;font-size:var(--type-component-title);font-weight:var(--weight-semibold);padding:9px 12px;width:100%;-moz-appearance:textfield;font-family:var(--font-ui);caret-color:#00e5a0;color-scheme:dark}' +
    '.sfe-input2::-webkit-inner-spin-button,.sfe-input2::-webkit-outer-spin-button{-webkit-appearance:none}' +
    // Force dark autofill styles
    '.sfe-input2:-webkit-autofill,.sfe-input2:-webkit-autofill:hover,.sfe-input2:-webkit-autofill:focus' +
    '{-webkit-text-fill-color:#f0f1f3!important;-webkit-box-shadow:0 0 0px 1000px ' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgb(41, 8, 41)' : 'rgba(255,255,255,0.06)') + ' inset!important;transition:background-color 5000s ease-in-out 0s}' +
    '.sfe-input-unit2{padding:0 12px;font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#4d5066;letter-spacing:.06em;white-space:nowrap;border-left:1px solid rgba(255,255,255,0.07);flex-shrink:0;}' +

    // NDR markers
    '.sfe-slider-markers{display:flex;justify-content:space-between;margin-top:4px}' +
    '.sfe-marker{font-size:var(--type-micro);font-weight:var(--weight-semibold);text-align:center;line-height:1.3}' +
    '.sfe-marker--danger{color:#ff3b5c}.sfe-marker--mid{color:#f5a623}.sfe-marker--safe{color:#22d3ee}' +

    // Tooltip badge
    '.s7-tip-badge{width:18px;height:18px;border-radius:50%;background:' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(37,99,235,0.12)' : 'rgba(59,130,246,0.16)') + ';border:1px solid rgba(96,165,250,0.55);color:#93c5fd;font-size:0;font-weight:var(--weight-bold);display:inline-flex;align-items:center;justify-content:center;cursor:help;transition:background .18s,border-color .18s,color .18s;font-family:var(--font-ui);flex-shrink:0;vertical-align:middle;line-height:1;user-select:none}' +
    '.s7-tip-badge::before{content:"?";display:block;color:currentColor;font-size:var(--type-caption);font-weight:var(--weight-semibold);line-height:1}' +
    '.s7-tip-badge:hover{background:rgba(59,130,246,0.28);border-color:rgba(59,130,246,0.7);color:#93c5fd}' +

    // S7 KPI card
    '.s7-card{background:linear-gradient(145deg,rgba(30,41,59,0.4),rgba(15,23,42,0.6));border:1px solid rgba(255,255,255,0.06);border-radius:var(--dash-radius-lg);padding:16px;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;position:relative;overflow:hidden;transition:.2s}' +
    '.s7-card:hover{border-color:rgba(255,255,255,0.15);transform:translateY(-2px)}' +

    // SFE insight cards
    '.sfe-insights-feed{display:flex;flex-direction:column;gap:8px}' +
    '.sfe-insight{display:flex;gap:10px;padding:11px 13px;border-radius:var(--dash-radius-sm);border:1px solid transparent;animation:sfeIn .3s ease}' +
    '@keyframes sfeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}' +
    '.sfe-insight--positive{background:rgba(0,229,160,.05);border-color:rgba(0,229,160,.15)}' +
    '.sfe-insight--negative{background:rgba(255,59,92,.05);border-color:rgba(255,59,92,.15)}' +
    '.sfe-insight--warning{background:rgba(245,166,35,.05);border-color:rgba(245,166,35,.15)}' +
    '.sfe-insight--info{background:rgba(77,166,255,.05);border-color:rgba(77,166,255,.12)}' +
    '.sfe-insight--critical{background:rgba(255,59,92,.08);border-color:rgba(255,59,92,.3)}' +
    '.sfe-insight-icon{font-size:var(--type-body);flex-shrink:0;margin-top:1px}' +
    '.sfe-insight-body{flex:1}' +
    '.sfe-insight-category{font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.12em;text-transform:uppercase;color:#4d5066;margin-bottom:3px}' +
    '.sfe-insight-text{font-size:var(--type-label);color:#8b8fa8;line-height:1.55}' +
    '.sfe-insight-text strong{color:#f0f1f3;font-weight:var(--weight-semibold)}' +
    '.sfe-insight-text .hi-green{color:#00e5a0;font-weight:var(--weight-semibold)}' +
    '.sfe-insight-text .hi-cyan{color:#22d3ee;font-weight:var(--weight-semibold)}' +
    '.sfe-insight-text .hi-red{color:#ff3b5c;font-weight:var(--weight-semibold)}' +
    '.sfe-insight-text .hi-yellow{color:#f5a623;font-weight:var(--weight-semibold)}' +

    // Row hover
    '.s9-row:hover{background:rgba(255,255,255,0.03)!important}' +

    // Spend input (table column)
    '.s9-spend-input{width:68px;max-width:100%;box-sizing:border-box;padding:6px 4px;background:rgba(0,0,0,0.3)!important;border:1px solid rgba(255,255,255,0.1);border-radius:var(--dash-radius-sm);color:#fff!important;text-align:center;font-family:inherit;font-size:var(--type-control);font-weight:var(--weight-semibold);color-scheme:dark}' +
    '.s9-spend-input:focus{outline:none;border-color:#3b82f6!important;background:rgba(59,130,246,0.1)!important}' +

    // Layout containers
    '.s9-root { display: flex; width: 100%; height: 100%; background:var(--dash-bg-deep); font-family:var(--font-ui); }' +
    '.s9-table-container { flex: 1.2; display: flex; flex-direction: column; border-left: 1px solid rgba(255,255,255,0.06); overflow-y: auto; }' +
    '.s9-table-scroll { flex: none; overflow-x: auto; overflow-y: visible; }' +
    '.s9-sim-container { flex: 0.8; display: flex; flex-direction: column; background: #0b0f19; overflow-y: auto; }' +
    '.s9-forecast-metrics{display:flex;flex-direction:column;gap:10px}' +
    '.s9-kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }' +
    '.s9-forecast-details{display:flex;flex-direction:column;gap:12px}' +
    '.s9-forecast-details>summary::-webkit-details-marker{display:none}' +
    '.s9-forecast-details>summary::marker{content:""}' +
    '.s9-forecast-details-summary{list-style:none;display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:9px 12px;border-radius:var(--dash-radius-md);border:1px dashed rgba(96,165,250,.34);background:rgba(59,130,246,.07);color:#93c5fd;font-size:var(--type-caption);font-weight:var(--weight-semibold);cursor:pointer;text-align:center;transition:background .18s,border-color .18s,color .18s}' +
    '.s9-forecast-details-summary:hover{background:rgba(59,130,246,.12);border-color:rgba(96,165,250,.52);color:#bfdbfe}' +
    '.s9-details-chevron{font-size:var(--type-subtitle);line-height:1;transition:transform .18s;display:inline-flex;align-items:center}' +
    '.s9-forecast-details[open] .s9-details-chevron{transform:rotate(180deg)}' +
    '.s9-forecast-details[open] .s9-kpi-grid--details{margin-top:2px}' +
    '.s9-details-text--open{display:none}' +
    '.s9-forecast-details[open] .s9-details-text--closed{display:none}' +
    '.s9-forecast-details[open] .s9-details-text--open{display:inline}' +
    '.s9-inputs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }' +
    '.s9-kpi-cards-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }' +

    // Responsive rules for size classes
    '.dash-size-md .s9-root, .dash-size-sm .s9-root, .dash-size-xs .s9-root { flex-direction: column !important; height: auto !important; overflow: visible !important; }' +
    '.dash-size-md .s9-table-container, .dash-size-sm .s9-table-container, .dash-size-xs .s9-table-container { width: 100% !important; flex: none !important; border-left: none !important; overflow: visible !important; height: auto !important; }' +
    '.dash-size-md .s9-table-scroll, .dash-size-sm .s9-table-scroll, .dash-size-xs .s9-table-scroll { overflow-y: visible !important; overflow-x: auto !important; }' +
    '.dash-size-md .s9-sim-container, .dash-size-sm .s9-sim-container, .dash-size-xs .s9-sim-container { width: 100% !important; flex: none !important; height: auto !important; overflow: visible !important; }' +

    // Responsive grids
    '.dash-size-md .s9-kpi-grid, .dash-size-sm .s9-kpi-grid { grid-template-columns: repeat(3, 1fr) !important; }' +
    '.dash-size-xs .s9-kpi-grid { grid-template-columns: 1fr 1fr !important; }' +
    '@media (max-width: 480px) { .s9-kpi-grid { grid-template-columns: 1fr !important; } }' +

    '.dash-size-xs .s9-inputs-grid { grid-template-columns: 1fr !important; }' +
    '.dash-size-md .s9-kpi-cards-grid, .dash-size-sm .s9-kpi-cards-grid, .dash-size-xs .s9-kpi-cards-grid { grid-template-columns: repeat(2, 1fr) !important; }' +
    '@media (max-width: 400px) { .s9-kpi-cards-grid { grid-template-columns: 1fr !important; } }' +

    // Media query fallback for direct viewport sizing
    '@media (max-width: 1180px) {' +
      '.s9-root { flex-direction: column !important; height: auto !important; overflow: visible !important; }' +
      '.s9-table-container { width: 100% !important; flex: none !important; border-left: none !important; overflow: visible !important; height: auto !important; }' +
      '.s9-table-scroll { overflow-y: visible !important; overflow-x: auto !important; }' +
      '.s9-sim-container { width: 100% !important; flex: none !important; height: auto !important; overflow: visible !important; }' +
      '.s9-kpi-grid { grid-template-columns: repeat(3, 1fr) !important; }' +
      '.s9-kpi-cards-grid { grid-template-columns: repeat(2, 1fr) !important; }' +
    '}' +
    '@media (max-width: 760px) {' +
      '.s9-kpi-grid { grid-template-columns: 1fr 1fr !important; }' +
      '.s9-inputs-grid { grid-template-columns: 1fr !important; }' +
      '.s9-kpi-cards-grid { grid-template-columns: repeat(2, 1fr) !important; }' +
    '}';

  // ── 11. Inject global CSS into <head> so it beats dashboard stylesheets ─────
  function injectGlobalCSS() {
    var existingTag = document.getElementById('s9-forecast-global-css');
    if (existingTag) existingTag.parentNode.removeChild(existingTag);
    var tag = document.createElement('style');
    tag.id = 's9-forecast-global-css';
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }

  // ── Apply profit color directly on element via style attribute (nuclear) ────
  // Belt-and-suspenders: class + !important in <head> + inline style.
  // One of the three will always win regardless of dashboard CSS architecture.
  function applyProfitColor(el, val) {
    if (!el) return;
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var color = val < 0 ? '#ef4444' : val > 0 ? (isLight ? '#10b981' : '#00e676') : (isLight ? '#6b7280' : 'rgba(255,255,255,0.6)');
    el.className = el.className.replace(/\bs9-profit-(?:negative|positive|zero)\b/g, '').trim() +
                   ' ' + profitClass(val);
    el.style.setProperty('color', color, 'important');
    el.style.setProperty('-webkit-text-fill-color', color, 'important');
    el.querySelectorAll('.s9-profit-value').forEach(function (child) {
      child.className = child.className.replace(/\bs9-profit-(?:negative|positive|zero)\b/g, '').trim() +
                        ' ' + profitClass(val);
      child.style.setProperty('color', color, 'important');
      child.style.setProperty('-webkit-text-fill-color', color, 'important');
    });
  }

  // ── Product combination modal ────────────────────────────────────────────────
  var combinationModal = null;
  var combinationModalState = { primarySku: '', secondarySku: '' };

  function availableCombinationProducts() {
    var claimed = {};
    productCombinations.forEach(function (group) {
      (group.skus || []).forEach(function (sku) { claimed[skuKey(sku)] = true; });
    });
    return rawPd.filter(function (product) {
      var key = skuKey(product && product.sku);
      return key && !claimed[key];
    });
  }
  function combinationProduct(sku) {
    var key = skuKey(sku);
    return rawPd.find(function (product) { return skuKey(product && product.sku) === key; }) || null;
  }
  function closeCombinationModal() {
    if (combinationModal && combinationModal.parentNode) combinationModal.parentNode.removeChild(combinationModal);
    combinationModal = null;
    mountEl._s9CombinationModal = null;
    document.body.style.overflow = '';
  }
  function combinationSelectorHtml(side, selectedSku) {
    var isPrimary = side === 'primary';
    var color = isPrimary ? '#f59e0b' : '#14b8a6';
    var selected = combinationProduct(selectedSku);
    var otherSku = isPrimary ? combinationModalState.secondarySku : combinationModalState.primarySku;
    var products = availableCombinationProducts().filter(function (product) { return skuKey(product.sku) !== skuKey(otherSku); });
    var options = products.map(function (product) {
      var sku = String(product.sku || '').trim();
      var active = skuKey(sku) === skuKey(selectedSku);
      return '<div role="button" tabindex="0" class="s9-combo-option" data-side="' + side + '" data-sku="' + escapeHtml(sku) + '" data-search="' + escapeHtml(textKey((product.name || '') + ' ' + sku)) + '" style="width:100%;display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:var(--dash-radius-sm);border:1px solid ' + (active ? color + '55' : 'transparent') + ';background:' + (active ? color + '18' : 'transparent') + ';color:#fff;font-family:inherit;text-align:start;cursor:pointer;margin-bottom:3px;">' +
        '<span class="s9-combo-option-copy" style="min-width:0;flex:1;"><span class="s9-combo-product-name" data-dashboard-product-name data-i18n-preserve style="display:block;font-size:var(--type-label);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><bdi dir="auto">' + escapeHtml(product.name || p9Txt('Unnamed product', 'منتج بدون اسم')) + '</bdi></span>' + skuCopyHtml(sku, { block: true, style: 'font-size:var(--type-micro);color:rgba(255,255,255,.42);margin-top:2px;font-weight:var(--weight-semibold)' }) + '</span>' +
        (active ? '<span style="color:' + color + ';font-weight:var(--weight-bold);">✓</span>' : '') +
      '</div>';
    }).join('');
    return '<div class="s9-combo-selector" data-side="' + side + '" style="position:relative;min-width:0;">' +
      '<div style="font-size:var(--type-micro);font-weight:var(--weight-semibold);color:' + color + ';margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px;">' + (isPrimary ? p9Txt('Product A · Primary', 'المنتج A · الأساسي') : p9Txt('Product B · Add to A', 'المنتج B · دمجه مع A')) + '</div>' +
      '<div role="button" tabindex="0" class="s9-combo-trigger" style="width:100%;min-width:0;min-height:48px;box-sizing:border-box;overflow:hidden;border-radius:var(--dash-radius-md);border:1px solid ' + (selected ? color + '55' : 'rgba(255,255,255,.12)') + ';background:rgba(255,255,255,.04);color:#fff;padding:7px 11px;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:9px;text-align:start;">' +
        '<span style="width:29px;height:29px;border-radius:var(--dash-radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + color + '18;color:' + color + ';font-weight:var(--weight-bold);">' + (isPrimary ? 'A' : 'B') + '</span>' +
        (selected ? '<span class="s9-combo-trigger-copy" style="min-width:0;max-width:100%;overflow:hidden;flex:1 1 0;"><span class="s9-combo-product-name" data-dashboard-product-name data-i18n-preserve style="display:block;max-width:100%;font-size:var(--type-label);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><bdi dir="auto">' + escapeHtml(selected.name || selected.sku) + '</bdi></span>' + skuCopyHtml(selected.sku, { block: true, style: 'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--type-micro);color:rgba(255,255,255,.42);font-weight:var(--weight-semibold)' }) + '</span>' : '<span class="s9-combo-placeholder" style="font-size:var(--type-label);color:rgba(255,255,255,.4);font-weight:var(--weight-semibold);flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + p9Txt('Search by product or SKU...', 'ابحث باسم المنتج أو SKU...') + '</span>') +
        '<span class="s9-combo-arrow" style="flex:0 0 auto;color:rgba(255,255,255,.4);">⌄</span>' +
      '</div>' +
      '<div class="s9-combo-panel" style="display:none;position:absolute;top:calc(100% + 6px);inset-inline:0;z-index:20;background:#0d1526;border:1px solid rgba(255,255,255,.14);border-radius:var(--dash-radius-lg);overflow:hidden;box-shadow:0 18px 45px rgba(0,0,0,.45);">' +
        '<div style="padding:9px;border-bottom:1px solid rgba(255,255,255,.07);"><input class="s9-combo-search" type="search" placeholder="' + p9Txt('Search name or SKU...', 'ابحث بالاسم أو SKU...') + '" style="width:100%;box-sizing:border-box;height:36px;border-radius:var(--dash-radius-sm);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;padding:0 10px;font-family:inherit;font-size:var(--type-label);outline:none;"></div>' +
        '<div class="s9-combo-options" style="max-height:230px;overflow:auto;padding:6px;">' + (options || '<div style="padding:18px;text-align:center;color:rgba(255,255,255,.42);font-size:var(--type-caption);">' + p9Txt('No available products', 'لا توجد منتجات متاحة') + '</div>') + '</div>' +
      '</div>' +
    '</div>';
  }
  function combinationPreviewHtml() {
    var primary = combinationProduct(combinationModalState.primarySku);
    var secondary = combinationProduct(combinationModalState.secondarySku);
    if (!primary || !secondary) {
      return '<div class="s9-combo-empty-preview" style="padding:14px;border-radius:var(--dash-radius-md);border:1px dashed rgba(255,255,255,.12);color:rgba(255,255,255,.45);font-size:var(--type-caption);text-align:center;">' + p9Txt('Choose two products to preview the combined numbers.', 'اختر منتجين لمعاينة الأرقام بعد الدمج.') + '</div>';
    }
    var preview = aggregateProductGroup({ id: 'preview', primarySku: primary.sku, skus: [primary.sku, secondary.sku] }, [primary, secondary]);
    var spend = simulations.reduce(function (sum, sim) {
      return sum + ([skuKey(primary.sku), skuKey(secondary.sku)].indexOf(skuKey(sim.sku)) !== -1 ? Number(sim.realAdSpend || 0) : 0);
    }, 0);
    var profit = Number(preview.actualCommission || preview.commission || 0) - spend;
    var cards = [
      [p9Txt('Net Orders', 'صافي الطلبات'), p9Num(preview.netOrderCount || preview.placedCount)],
      [p9Txt('Delivered', 'تم التسليم'), p9Num(preview.actualDeliveredCount || preview.deliveredCount)],
      [p9Txt('Ad Spend', 'الإنفاق الإعلاني'), formatMoney(spend)],
      [p9Txt('Net Profit', 'صافي الربح'), formatMoney(profit)]
    ];
    return '<div class="s9-combo-preview"><div class="s9-combo-preview-title" style="font-size:var(--type-micro);font-weight:var(--weight-semibold);color:#c4b5fd;margin-bottom:8px;">' + p9Txt('COMBINED PREVIEW', 'معاينة الدمج') + '</div><div class="s9-combo-preview-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;">' + cards.map(function (card) {
      return '<div class="s9-combo-preview-card" style="padding:10px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);"><div class="s9-combo-preview-label" style="font-size:var(--type-micro);color:rgba(255,255,255,.45);font-weight:var(--weight-semibold);margin-bottom:4px;">' + card[0] + '</div><div class="s9-combo-preview-value" dir="ltr" style="font-size:var(--type-control);color:#fff;font-weight:var(--weight-semibold);">' + card[1] + '</div></div>';
    }).join('') + '</div></div>';
  }
  function renderCombinationModal() {
    if (!combinationModal) return;
    var canCombine = combinationProduct(combinationModalState.primarySku) && combinationProduct(combinationModalState.secondarySku) && skuKey(combinationModalState.primarySku) !== skuKey(combinationModalState.secondarySku);
    combinationModal.innerHTML = '<div class="s9-combo-dialog" style="width:min(720px,96vw);max-height:92vh;overflow:visible;border-radius:var(--dash-radius-xl);background:var(--dash-surface);border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 90px rgba(0,0,0,.6);">' +
      '<div class="s9-combo-header" style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.075);display:flex;align-items:center;justify-content:space-between;gap:14px;">' +
        '<div><div class="s9-combo-title" style="font-size:var(--type-section-title);font-weight:var(--weight-semibold);color:#fff;">' + p9Txt('Combine Products', 'دمج المنتجات') + '</div><div class="s9-combo-subtitle" style="font-size:var(--type-caption);color:rgba(255,255,255,.43);font-weight:var(--weight-semibold);margin-top:3px;">' + p9Txt('Create one forecasting row from two SKUs. Imported data stays unchanged.', 'أنشئ صف توقعات واحدًا من رمزين SKU بدون تغيير البيانات المستوردة.') + '</div></div>' +
        '<button type="button" class="s9-combo-close" style="width:36px;height:36px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;font-size:var(--type-metric-sm);cursor:pointer;">&times;</button>' +
      '</div>' +
      '<div style="padding:18px 20px;display:flex;flex-direction:column;gap:16px;">' +
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;">' + combinationSelectorHtml('primary', combinationModalState.primarySku) + combinationSelectorHtml('secondary', combinationModalState.secondarySku) + '</div>' +
        combinationPreviewHtml() +
        '<div class="s9-combo-note" style="font-size:var(--type-micro);line-height:1.7;color:rgba(255,255,255,.46);">' + p9Txt('Product A keeps its name and primary SKU. Product B becomes an alias. Both original rows are replaced by one reversible combined row in Section 9.', 'يحتفظ المنتج A باسمه ورمز SKU الأساسي، ويصبح المنتج B رمزًا بديلًا. يتم استبدال الصفين بصف واحد قابل لإلغاء الدمج داخل القسم 9.') + '</div>' +
      '</div>' +
      '<div class="s9-combo-footer" style="padding:14px 20px;border-top:1px solid rgba(255,255,255,.075);display:flex;justify-content:flex-end;gap:9px;">' +
        '<button type="button" class="s9-combo-cancel" style="border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.7);border-radius:var(--dash-radius-sm);padding:8px 14px;font-family:inherit;font-size:var(--type-caption);font-weight:var(--weight-semibold);cursor:pointer;">' + p9Txt('Cancel', 'إلغاء') + '</button>' +
        '<button type="button" class="s9-combo-confirm"' + (canCombine ? '' : ' disabled') + ' style="border:1px solid rgba(168,85,247,.48);background:rgba(168,85,247,.2);color:#ddd6fe;border-radius:var(--dash-radius-sm);padding:8px 15px;font-family:inherit;font-size:var(--type-caption);font-weight:var(--weight-semibold);cursor:' + (canCombine ? 'pointer' : 'default') + ';opacity:' + (canCombine ? '1' : '.4') + ';">' + p9Txt('Combine', 'دمج') + '</button>' +
      '</div>' +
    '</div>';

    combinationModal.querySelector('.s9-combo-close').addEventListener('click', closeCombinationModal);
    combinationModal.querySelector('.s9-combo-cancel').addEventListener('click', closeCombinationModal);
    combinationModal.querySelectorAll('.s9-combo-selector').forEach(function (selector) {
      var trigger = selector.querySelector('.s9-combo-trigger');
      var panel = selector.querySelector('.s9-combo-panel');
      var search = selector.querySelector('.s9-combo-search');
      trigger.addEventListener('click', function (event) {
        event.stopPropagation();
        combinationModal.querySelectorAll('.s9-combo-panel').forEach(function (other) { if (other !== panel) other.style.display = 'none'; });
        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        if (panel.style.display === 'block') { search.value = ''; search.focus(); }
      });
      trigger.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        combinationModal.querySelectorAll('.s9-combo-panel').forEach(function (other) { if (other !== panel) other.style.display = 'none'; });
        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        if (panel.style.display === 'block') { search.value = ''; search.focus(); }
      });
      search.addEventListener('click', function (event) { event.stopPropagation(); });
      search.addEventListener('input', function () {
        var query = textKey(search.value);
        selector.querySelectorAll('.s9-combo-option').forEach(function (option) {
          option.style.display = !query || (option.getAttribute('data-search') || '').indexOf(query) !== -1 ? 'flex' : 'none';
        });
      });
      selector.querySelectorAll('.s9-combo-option').forEach(function (option) {
        option.addEventListener('click', function (event) {
          event.stopPropagation();
          if (option.getAttribute('data-side') === 'primary') combinationModalState.primarySku = option.getAttribute('data-sku') || '';
          else combinationModalState.secondarySku = option.getAttribute('data-sku') || '';
          renderCombinationModal();
        });
        option.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          if (option.getAttribute('data-side') === 'primary') combinationModalState.primarySku = option.getAttribute('data-sku') || '';
          else combinationModalState.secondarySku = option.getAttribute('data-sku') || '';
          renderCombinationModal();
        });
      });
    });
    combinationModal.querySelector('.s9-combo-confirm').addEventListener('click', function () {
      if (!canCombine) return;
      var primary = combinationProduct(combinationModalState.primarySku);
      var secondary = combinationProduct(combinationModalState.secondarySku);
      if (!primary || !secondary) return;
      var group = {
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        primarySku: String(primary.sku || '').trim(),
        skus: [String(primary.sku || '').trim(), String(secondary.sku || '').trim()],
        createdAt: new Date().toISOString()
      };
      productCombinations = productCombinations.concat([group]);
      writeProductCombinations(productCombinations);
      closeCombinationModal();
      mountEl._s9SelectedProductId = 's9-combination:' + group.id;
      mountEl._s9CurrentPage = 1;
      window.renderSectionProductForecastHydratedEntry(mountEl, data, ctx);
    });
  }
  function openCombinationModal() {
    combinationModalState = { primarySku: '', secondarySku: '' };
    combinationModal = document.createElement('div');
    combinationModal.className = 'dash-overlay-scope';
    combinationModal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.74);font-family:var(--font-ui);direction:' + (isAr ? 'rtl' : 'ltr') + ';box-sizing:border-box;';
    combinationModal.addEventListener('click', function (event) {
      if (event.target === combinationModal) {
        closeCombinationModal();
        return;
      }
      if (combinationModal) combinationModal.querySelectorAll('.s9-combo-panel').forEach(function (panel) { panel.style.display = 'none'; });
    });
    document.body.appendChild(combinationModal);
    mountEl._s9CombinationModal = combinationModal;
    document.body.style.overflow = 'hidden';
    renderCombinationModal();
  }

  // ── 12. Main render ─────────────────────────────────────────────────────────
  function captureSectionScroll() {
    var table = mountEl.querySelector('.s9-table-container');
    var sim = mountEl.querySelector('.s9-sim-container');
    var parent = mountEl.parentElement;
    var ancestors = [];
    var node = mountEl.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
        ancestors.push({ node: node, top: node.scrollTop || 0, left: node.scrollLeft || 0 });
      }
      node = node.parentElement;
    }
    return {
      mountTop: mountEl.scrollTop || 0,
      mountLeft: mountEl.scrollLeft || 0,
      parentTop: parent ? parent.scrollTop || 0 : 0,
      parentLeft: parent ? parent.scrollLeft || 0 : 0,
      tableTop: table ? table.scrollTop || 0 : 0,
      tableLeft: table ? table.scrollLeft || 0 : 0,
      simTop: sim ? sim.scrollTop || 0 : 0,
      ancestors: ancestors
    };
  }

  function restoreSectionScroll(snapshot) {
    if (!snapshot) return;
    requestAnimationFrame(function () {
      var table = mountEl.querySelector('.s9-table-container');
      var sim = mountEl.querySelector('.s9-sim-container');
      var parent = mountEl.parentElement;
      mountEl.scrollTop = snapshot.mountTop;
      mountEl.scrollLeft = snapshot.mountLeft;
      if (parent) {
        parent.scrollTop = snapshot.parentTop;
        parent.scrollLeft = snapshot.parentLeft;
      }
      (snapshot.ancestors || []).forEach(function (item) {
        if (!item.node) return;
        item.node.scrollTop = item.top;
        item.node.scrollLeft = item.left;
      });
      if (table) {
        table.scrollTop = snapshot.tableTop;
        table.scrollLeft = snapshot.tableLeft;
      }
      if (sim) sim.scrollTop = snapshot.simTop;
    });
  }

  function renderAll() {
    injectGlobalCSS();
    mountEl.innerHTML =
      '<div class="s9-root">' +
        buildTable() +
        buildSimulator() +
      '</div>';

    // Apply profit colors directly after render (belt-and-suspenders)
    mountEl.querySelectorAll('.s9-profit-cell').forEach(function (cell) {
      var row = cell.closest('.s9-row');
      if (!row) return;
      var idx = parseInt(row.getAttribute('data-idx'));
      var rs  = simulations[idx];
      var realNetProfit = realProfit(rs);
      applyProfitColor(cell, realNetProfit);
    });

    bindEvents(mountEl);
    initTooltips();
  }

  function renderTableOnly(options) {
    options = options || {};
    var active = document.activeElement;
    var preserveSearch = active && active.id === 's9-product-search';
    var selectionStart = preserveSearch ? active.selectionStart : null;
    var selectionEnd = preserveSearch ? active.selectionEnd : null;
    var holder = document.createElement('div');
    holder.innerHTML = buildTable();
    var nextTable = holder.firstElementChild;
    var currentTable = mountEl.querySelector('.s9-table-container');
    if (!nextTable || !currentTable) {
      renderAll();
      return;
    }
    currentTable.replaceWith(nextTable);
    bindEvents(nextTable);
    if (preserveSearch || options.focusSearch) {
      var nextSearch = mountEl.querySelector('#s9-product-search');
      if (nextSearch) {
        nextSearch.focus();
        if (nextSearch.setSelectionRange && selectionStart !== null && selectionEnd !== null) {
          nextSearch.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    }
  }

  function applyImmediateTableSearch(query) {
    var normalized = textKey(query);
    mountEl.querySelectorAll('.s9-row').forEach(function (row) {
      var idx = parseInt(row.getAttribute('data-idx'));
      var sim = simulations[idx];
      var matches = !normalized || (sim && (
        textKey(sim.name).indexOf(normalized) !== -1 ||
        textKey(sim.sku).indexOf(normalized) !== -1
      ));
      row.hidden = !matches;
    });
  }

  // ── 12. Smart update — avoids full re-render during input (no focus loss) ──
  function flushScheduledRender() {
    if (tableRenderTimer) {
      clearTimeout(tableRenderTimer);
      tableRenderTimer = null;
    }
    if (!tableRenderPending || !mountEl.isConnected) return;
    tableRenderPending = false;
    renderTableOnly();
  }

  function scheduleRenderAll(delay) {
    tableRenderPending = true;
    if (tableRenderTimer) clearTimeout(tableRenderTimer);
    tableRenderTimer = setTimeout(function () {
      tableRenderTimer = null;
      if (!mountEl.isConnected) return;
      if (document.activeElement && document.activeElement.classList &&
          document.activeElement.classList.contains('s9-spend-input')) {
        return;
      }
      flushScheduledRender();
    }, delay || 180);
  }

  function updateSimulatorOnly() {
    var s = simulations[selectedIdx];
    if (!s) return;
    var c = computeSim(s);

    // Gauge
    var gaugeWrap = mountEl.querySelector('#s9-gauge-wrap');
    if (gaugeWrap) gaugeWrap.innerHTML = gaugeHtml(c.roi);

    // Financial KPI cards — update text nodes only
    var cards = mountEl.querySelectorAll('.s9-kpi-cards-grid .s7-card');
    if (cards.length >= 4) {
      // Net Profit — update text AND color (class + inline important)
      var npEl = cards[0].querySelector('.s9-kpi-netprofit');
      if (npEl) {
        npEl.innerHTML = valueStack(formatMoney(c.netProfit), 'profit', 's9-card-value-stack');
        applyProfitColor(npEl, c.netProfit);
      }
      // Revenue
      var revEl = cards[1].querySelector('div:nth-child(2)');
      if (revEl) revEl.innerHTML = valueStack(formatMoney(c.revenue), 'revenue', 's9-card-value-stack');
      // CPA
      var cpaEl = cards[2].querySelector('div:nth-child(2)');
      if (cpaEl) cpaEl.textContent = formatMoney(c.cpa, false, 2);
      // Break-even CPA
      var beEl = cards[3].querySelector('.s9-kpi-breakeven');
      if (beEl) {
        beEl.innerHTML = valueStack(formatMoney(c.breakEvenCpa, false, 2), 'breakeven', 's9-card-value-stack');
        beEl.style.color = c.cpa > c.breakEvenCpa ? '#ef4444' : '#f59e0b';
      }
    }

    // Metric mini-cards above controls
    var simPanel = mountEl.querySelector('[data-sim-panel]');
    if (simPanel) {
      var metricVals = simPanel.querySelectorAll('.s9-metric-val');
      if (metricVals[0]) metricVals[0].textContent = p9Num(c.totalOrders);
      if (metricVals[1]) metricVals[1].textContent = p9Num(s.realConfirmed);
      if (metricVals[2]) metricVals[2].innerHTML = valueStack(p9Num(Math.round(c.deliveredOrders)), 'delivered', 's9-card-value-stack');
      if (metricVals[3]) metricVals[3].innerHTML = valueStack(formatPct(s.ndr), 'dr', 's9-card-value-stack');
      if (metricVals[4]) metricVals[4].innerHTML = valueStack(displayDecimal(toDisplay(s.avgCommission), 2) + ' ' + viewCurrency, 'profit', 's9-card-value-stack');
      if (metricVals[5]) metricVals[5].textContent = formatPct(s.realConfirmationRate);
      if (metricVals[6]) metricVals[6].textContent = formatPct(s.realDr);
    }

    var totalInput = mountEl.querySelector('.s9-total-orders-input');
    if (totalInput && document.activeElement !== totalInput) totalInput.value = c.totalOrders;
    var deliveredInput = mountEl.querySelector('.s9-delivered-orders-input');
    if (deliveredInput && document.activeElement !== deliveredInput) deliveredInput.value = c.deliveredOrders;
    var ndrInput = mountEl.querySelector('.s9-ndr-input');
    if (ndrInput && document.activeElement !== ndrInput) ndrInput.value = p9RatioPctValue(s.ndr);
    var spendInput = mountEl.querySelector('.s9-sim-spend-input');
    if (spendInput && document.activeElement !== spendInput) spendInput.value = Math.round(toDisplay(s.adSpend));

    // Insights feed
    var feedEl = mountEl.querySelector('.sfe-insights-feed');
    if (feedEl) feedEl.innerHTML = renderInsightsFeed(s, c);

    // ── Sync table row profit — text + class + inline important (belt-and-suspenders) ──
    var rows = mountEl.querySelectorAll('.s9-row');
    rows.forEach(function (row) {
      var idx = parseInt(row.getAttribute('data-idx'));
      var rs  = simulations[idx];
      row.style.background = idx === selectedIdx ? 'rgba(59,130,246,0.1)' : 'transparent';
      var realNetProfit = realProfit(rs);
      var profitCell = row.querySelector('.s9-profit-cell');
      if (profitCell) {
        var profitValue = profitCell.querySelector('.s9-profit-value');
        if (!profitValue) {
          profitValue = document.createElement('span');
          profitValue.className = 's9-profit-value';
          profitCell.textContent = '';
          profitCell.appendChild(profitValue);
        }
        profitValue.innerHTML = valueStack(formatMoney(realNetProfit), 'profit', 's9-table-value-stack');
        applyProfitColor(profitCell, realNetProfit);
      }
    });
  }

  // ── 13. Event binding ───────────────────────────────────────────────────────
  function bindEvents(rootEl) {
    var eventRoot = rootEl || mountEl;
    var combineProductsButton = eventRoot.querySelector('#s9-combine-products');
    if (combineProductsButton) combineProductsButton.addEventListener('click', openCombinationModal);
    eventRoot.querySelectorAll('.s9-uncombine-products').forEach(function (button) {
      button.addEventListener('click', function () {
        var groupId = button.getAttribute('data-combination-id') || '';
        var group = productCombinations.find(function (item) { return String(item.id) === String(groupId); });
        if (!group) return;
        productCombinations = productCombinations.filter(function (item) { return String(item.id) !== String(groupId); });
        writeProductCombinations(productCombinations);
        var primary = combinationProduct(group.primarySku);
        mountEl._s9SelectedProductId = primary ? (primary.key || primary.sku || primary.name) : '';
        mountEl._s9CurrentPage = 1;
        window.renderSectionProductForecastHydratedEntry(mountEl, data, ctx);
      });
    });

    eventRoot.querySelectorAll('.s9-platform-tab').forEach(function (button) {
      button.addEventListener('click', function () {
        var nextPlatform = button.getAttribute('data-s9-platform') || 'all';
        if (nextPlatform === selectedMarketingPlatform) return;
        mountEl._s9MarketingPlatform = nextPlatform;
        mountEl._s9SelectedProductId = simulations[selectedIdx] && simulations[selectedIdx].id;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSortBy = tableSortBy;
        mountEl._s9TableSortDir = tableSortDir;
        mountEl._s9TableSearchQuery = tableSearchQuery;
        window.renderSectionProductForecastHydratedEntry(mountEl, data, ctx);
      });
    });

    eventRoot.querySelectorAll('.s9-sort-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-sort') || '';
        if (!key) return;
        if (tableSortBy === key) {
          tableSortDir = tableSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          tableSortBy = key;
          tableSortDir = 'desc';
        }
        currentPage = 1;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSortBy = tableSortBy;
        mountEl._s9TableSortDir = tableSortDir;
        renderTableOnly();
      });
    });

    var clearSortBtn = eventRoot.querySelector('#s9-clear-sort');
    if (clearSortBtn) {
      clearSortBtn.addEventListener('click', function () {
        tableSortBy = '';
        tableSortDir = 'desc';
        currentPage = 1;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSortBy = tableSortBy;
        mountEl._s9TableSortDir = tableSortDir;
        renderTableOnly();
      });
    }

    var productSearch = eventRoot.querySelector('#s9-product-search');
    if (productSearch) {
      productSearch.addEventListener('input', function () {
        var searchStartedAt = performance.now();
        var searchToken = ++tableSearchToken;
        tableSearchQuery = productSearch.value || '';
        applyImmediateTableSearch(tableSearchQuery);
        currentPage = 1;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSearchQuery = tableSearchQuery;
        if (tableSearchTimer) clearTimeout(tableSearchTimer);
        tableSearchTimer = setTimeout(function () {
          if (searchToken !== tableSearchToken) return;
          tableSearchTimer = null;
          renderTableOnly({ focusSearch: true });
          mountEl._s9LastSearchDurationMs = performance.now() - searchStartedAt;
        }, 120);
      });
      productSearch.addEventListener('focus', function () {
        productSearch.style.borderColor = '#3b82f6';
        productSearch.style.boxShadow = '0 0 0 2px rgba(59,130,246,0.16)';
      });
      productSearch.addEventListener('blur', function () {
        productSearch.style.borderColor = 'rgba(255,255,255,0.10)';
        productSearch.style.boxShadow = 'none';
      });
    }

    // Row clicks
    eventRoot.querySelectorAll('.s9-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.tagName === 'INPUT') return;
        var scrollSnapshot = captureSectionScroll();
        selectedIdx = parseInt(row.getAttribute('data-idx'));
        mountEl._s9SelectedProductId = simulations[selectedIdx] && simulations[selectedIdx].id;
        renderAll();
        restoreSectionScroll(scrollSnapshot);
      });
    });

    // Ad Spend inputs (table column)
    eventRoot.querySelectorAll('.s9-spend-input').forEach(function (inp) {
      inp.addEventListener('input', function (e) {
        var idx = parseInt(e.target.getAttribute('data-idx'));
        if (isSpendLocked(simulations[idx])) return;
        var val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
        var newSpend = toSAR(val);
        simulations[idx].realAdSpend = newSpend;
        if (!simulations[idx].isModified) simulations[idx].adSpend = newSpend;
        localStorage.setItem('kbot_s9_spend_' + simulations[idx].id, newSpend);
        selectedIdx = idx;
        mountEl._s9SelectedProductId = simulations[idx] && simulations[idx].id;
        invalidateSimulationRowsCache();
        updateSimulatorOnly();
        scheduleRenderAll(180);
      });
      inp.addEventListener('blur', function () {
        flushScheduledRender();
      });
    });

    // Scenario Ad Spend input (simulator panel)
    var simSpendInp = eventRoot.querySelector('.s9-sim-spend-input');
    if (simSpendInp) {
      simSpendInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        simulations[selectedIdx].adSpend = toSAR(v);
        simulations[selectedIdx].isModified = true;
        updateSimulatorOnly();
      });
    }

    var totalOrdersInp = eventRoot.querySelector('.s9-total-orders-input');
    if (totalOrdersInp) {
      totalOrdersInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        setSimTotalOrders(simulations[selectedIdx], v);
        updateSimulatorOnly();
      });
    }

    var deliveredOrdersInp = eventRoot.querySelector('.s9-delivered-orders-input');
    if (deliveredOrdersInp) {
      deliveredOrdersInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        setSimDeliveredOrders(simulations[selectedIdx], v);
        if (String(e.target.value) !== String(simulations[selectedIdx].deliveredOrders)) {
          e.target.value = simulations[selectedIdx].deliveredOrders;
        }
        updateSimulatorOnly();
      });
    }

    var ndrInp = eventRoot.querySelector('.s9-ndr-input');
    if (ndrInp) {
      ndrInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        setSimNdr(simulations[selectedIdx], v);
        updateSimulatorOnly();
      });
      ndrInp.addEventListener('blur', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 1) { e.target.value = p9RatioPctValue(simulations[selectedIdx].ndr); return; }
        if (v > 100) e.target.value = '100';
      });
    }

    var commInp = eventRoot.querySelector('.s9-comm-input');
    if (commInp) {
      commInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        simulations[selectedIdx].avgCommission = toSAR(v);
        simulations[selectedIdx].isModified    = true;
        updateSimulatorOnly();
        var unitEl = mountEl.querySelector('.s9-comm-unit');
        if (unitEl) unitEl.textContent = viewCurrency;
      });
    }

    var resetBtn = eventRoot.querySelector('.s9-reset-real-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        resetSimulationToReal(simulations[selectedIdx]);
        invalidateSimulationRowsCache();
        renderAll();
      });
    }

    var forecastDetails = eventRoot.querySelector('.s9-forecast-details');
    if (forecastDetails) {
      forecastDetails.addEventListener('toggle', function () {
        mountEl._s9ForecastDetailsExpanded = forecastDetails.open;
      });
    }

    // Currency toggle
    eventRoot.querySelectorAll('.s9-curr-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var newCurr = e.currentTarget.getAttribute('data-curr');
        if (newCurr === viewCurrency) return;
        viewCurrency = newCurr;
        if (window.DashboardRoiState) {
          forecastRoiSettings = window.DashboardRoiState.set(
            { currency: newCurr },
            forecastAccountId,
            forecastRoiSettings
          );
        }
        renderAll();
      });
    });

    // Pagination
    var totalPages = Math.ceil(simulations.length / itemsPerPage);
    eventRoot.querySelectorAll('.s9-page-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        currentPage = parseInt(e.target.getAttribute('data-page'));
        mountEl._s9CurrentPage = currentPage;
        renderTableOnly();
      });
    });
    var prevBtn = eventRoot.querySelector('.s9-page-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (currentPage > 1) {
          currentPage--;
          mountEl._s9CurrentPage = currentPage;
          renderTableOnly();
        }
      });
    }
    var nextBtn = eventRoot.querySelector('.s9-page-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (currentPage < totalPages) {
          currentPage++;
          mountEl._s9CurrentPage = currentPage;
          renderTableOnly();
        }
      });
    }
  }

  // ── 14. Boot ────────────────────────────────────────────────────────────────
  renderAll();
  var baseSectionCleanup = mountEl._dashboardSectionCleanup;
  mountEl._dashboardSectionCleanup = function () {
    if (typeof baseSectionCleanup === 'function') baseSectionCleanup();
    closeCombinationModal();
    if (tableSearchTimer) {
      clearTimeout(tableSearchTimer);
      tableSearchTimer = null;
    }
    if (tableRenderTimer) {
      clearTimeout(tableRenderTimer);
      tableRenderTimer = null;
    }
    tableRenderPending = false;
    if (mountEl._s9TooltipCleanup) {
      mountEl._s9TooltipCleanup();
      mountEl._s9TooltipCleanup = null;
    }
    if (mountEl._s9ThemeObserver) {
      mountEl._s9ThemeObserver.disconnect();
      mountEl._s9ThemeObserver = null;
    }
  };
  if (window.DashboardRoiState) {
    if (mountEl._s9RoiListener) window.DashboardRoiState.unsubscribe(mountEl._s9RoiListener);
    mountEl._s9RoiListener = function (settings) {
      if (ctx && ctx.sectionId && ctx.sectionId !== 'productForecast') return;
      if (!settings || String(settings.accountId) !== String(forecastAccountId)) return;
      if (!mountEl.isConnected || mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var nextCurrency = settings.currency || 'SAR';
      var nextRate = Number(settings.egpRate) > 0 ? Number(settings.egpRate) : 52.0;
      var changed = nextCurrency !== viewCurrency || nextRate !== egpRate;
      forecastRoiSettings = settings;
      if (!changed) return;
      viewCurrency = nextCurrency;
      egpRate = nextRate;
      renderAll();
    };
    window.DashboardRoiState.subscribe(mountEl._s9RoiListener);
    var forecastSettingsObserver = new MutationObserver(function () {
      if (!document.body.contains(mountEl) && mountEl._s9RoiListener) {
        window.DashboardRoiState.unsubscribe(mountEl._s9RoiListener);
        mountEl._s9RoiListener = null;
      }
    });
    forecastSettingsObserver.observe(document.body, { childList: true, subtree: true });
    var previousRoiCleanup = mountEl._dashboardSectionCleanup;
    mountEl._dashboardSectionCleanup = function () {
      if (typeof previousRoiCleanup === 'function') previousRoiCleanup();
      if (mountEl._s9RoiListener) {
        window.DashboardRoiState.unsubscribe(mountEl._s9RoiListener);
        mountEl._s9RoiListener = null;
      }
      forecastSettingsObserver.disconnect();
    };
  }
  if (window.DashboardMarketingState) {
    if (mountEl._s9MarketingListener) window.DashboardMarketingState.unsubscribe(mountEl._s9MarketingListener);
    mountEl._s9MarketingListener = function (next) {
      if (ctx && ctx.sectionId && ctx.sectionId !== 'productForecast') return;
      if (!next || String(next.accountId) !== String(forecastAccountId)) return;
      if (!mountEl.isConnected || mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      window.renderSectionProductForecastHydratedEntry(mountEl, data, ctx);
    };
    window.DashboardMarketingState.subscribe(mountEl._s9MarketingListener);
    var previousCleanup = mountEl._dashboardSectionCleanup;
    mountEl._dashboardSectionCleanup = function () {
      if (typeof previousCleanup === 'function') previousCleanup();
      if (mountEl._s9MarketingListener) {
        window.DashboardMarketingState.unsubscribe(mountEl._s9MarketingListener);
        mountEl._s9MarketingListener = null;
      }
      if (mountEl._s9ThemeObserver) {
        mountEl._s9ThemeObserver.disconnect();
        mountEl._s9ThemeObserver = null;
      }
    };
    if (forecastAccountId !== '__all__' && mountEl._s9MarketingLoadedAccount !== forecastAccountId &&
        typeof window.DashboardMarketingState.load === 'function') {
      mountEl._s9MarketingLoadedAccount = forecastAccountId;
      window.DashboardMarketingState.load(forecastAccountId);
    }
  }
};
