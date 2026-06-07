/* ══════════════════════════════════════════════════════════════════════════════
   section1-overview.js
   Renders Section 1 — نظرة عامة (Overview)

   window.renderSection1(mountEl, data, ctx)
     mountEl  — the <div> to inject HTML into (cleared first)
     data     — data.overview  (shape = overviewData from mockData)
     ctx      — { onNavigate, accent, formatSAR }

   Depends on (loaded before this via <script>):
     dashboard-shared.js  → kpiCard, sparklineSvg, deltaBadge,
                            sectionTopBar, animateNumber, runKpiAnimations,
                            formatSAR, COLOR_MAP
     dashboard-styles.css → .fade-up, @keyframes fadeUp
   ══════════════════════════════════════════════════════════════════════════════ */

window.renderSection1 = function (mountEl, data, ctx) {
  'use strict';

  /* ── i18n helpers — must be defined before any label/card arrays ─────────── */
  var tr = window.dashboardI18n;
  var isAr = tr ? tr.isRtl() : true;
  function s1Txt(en, ar) {
    var value = tr && tr.pick ? tr.pick(en, ar) : (isAr ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }
  function tx(key, fallback) {
    var value = tr ? tr.t(key) : key;
    var output = value && value !== key ? value : (fallback || key);
    return tr && tr.clean ? tr.clean(output) : output;
  }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function raw(value) {
    return tr ? tr.raw(value) : value;
  }
  var defaultCurrency = (data && data.meta && data.meta.activeCurrency) || window.dashboardActiveCurrency || 'SAR';

  /* ── Fallback data (mock shape) so the section renders during development ── */
  var d = data || {
    earnedCommission:   { value: 31150, delta: 78.0,  unit: defaultCurrency },
    incomingCommission: { value: 24631, delta: 146.4,   unit: defaultCurrency },
    lostCommission:     { value: 100963,  delta: -61.5,  unit: defaultCurrency },
    totalOrders:        { value: 4500,  delta: -49.3,  unit: 'Orders' },
    sparklines: {
      earned:   [15000, 18000, 22000, 26000, 28000, 30000, 31150],
      incoming: [10000, 12000, 15000, 18000, 20000, 22000, 24631],
      lost:     [40000, 50000, 60000, 75000, 85000, 95000, 100963 ],
      orders:   [2000,  2500,  3000,  3500,  4000,  4200,  4500 ],
    },
    health: {
      earned:   { pct: 19.9, sar: 31150 },
      incoming: { pct: 15.7, sar: 24631 },
      lost:     { pct: 64.4, sar: 100963  },
    },
    insights: [
      { text: 'Lost Taager profit is high due to order cancellations. Focus on product quality and descriptions.', type: 'warning' }
    ],
    lostBreakdown: [
      { label: 'Customer Cancel', pct: 45, color: '#ef4444' },
      { label: 'Out of Stock', pct: 30, color: '#f59e0b' },
      { label: 'Delivery Failed', pct: 15, color: '#3b82f6' },
      { label: 'Returned', pct: 10, color: '#a855f7' }
    ],
    topContributors: [
      { name: 'Riyadh', value: 12500, unit: defaultCurrency },
      { name: 'Jeddah', value: 8300, unit: defaultCurrency },
      { name: 'Dammam', value: 5400, unit: defaultCurrency }
    ],
    goal: { current: 31150, target: 50000 }
  };

  /* ── KPI card definitions (RTL array order: index 0 = visual RIGHT) ─────── */
  var rawTotalOrders = Number((d.totalOrders && d.totalOrders.rawValue != null) ? d.totalOrders.rawValue : (d.totalOrders ? d.totalOrders.value : 0)) || 0;
  var netTotalOrders = Number((d.totalOrders && d.totalOrders.value != null) ? d.totalOrders.value : 0) || 0;
  var totalOrdersDisplay = rawTotalOrders.toLocaleString('en-US') + ' / ' + netTotalOrders.toLocaleString('en-US');

  var cards = [
    { label: s1Txt('Earned Profit After Tax', 'الربح المحقق بعد الضريبة'), value: d.earnedCommission.value,   unit: d.earnedCommission.unit,   delta: d.earnedCommission.delta,   color: 'green',  spark: d.sparklines.earned,   iconType: 'green', tooltip: s1Txt('Earned Profit After Tax = sum(order profit - tax profit) for delivered orders.', 'الربح المحقق بعد الضريبة = مجموع (ربح الطلب - ربح الضريبة) للطلبات المسلمة.') },
    { label: s1Txt('Incoming Profit After Tax', 'الربح القادم بعد الضريبة'),    value: d.incomingCommission.value,  unit: d.incomingCommission.unit,  delta: d.incomingCommission.delta,  color: 'orange', spark: d.sparklines.incoming,  iconType: 'orange', tooltip: s1Txt('Incoming Profit After Tax = sum(order profit - tax profit) for active non-delivered orders.', 'الربح القادم بعد الضريبة = مجموع (ربح الطلب - ربح الضريبة) للطلبات النشطة غير المسلمة.') },
    { label: s1Txt('Lost Profit After Tax', 'الربح الضائع بعد الضريبة'),   value: d.lostCommission.value,      unit: d.lostCommission.unit,      delta: d.lostCommission.delta,      color: 'red',    spark: d.sparklines.lost,      iconType: 'red', tooltip: s1Txt('Lost Profit After Tax = sum(order profit - tax profit) for failed, canceled, and lost orders.', 'الربح الضائع بعد الضريبة = مجموع (ربح الطلب - ربح الضريبة) للطلبات الفاشلة والملغاة.') },
    { label: s1Txt('Total / Net Orders', 'إجمالي / صافي الطلبات'), value: netTotalOrders, displayValue: totalOrdersDisplay, staticDisplay: true, unit: s1Txt('orders', 'طلب'), delta: d.totalOrders.delta, color: 'blue', spark: d.sparklines.orders, iconType: 'blue', tooltip: tx('kpi.orders.tooltip', 'Total / Net Orders = raw orders / orders after excluding Canceled by you. Business metrics use net orders.') },
    { label: s1Txt('Confirmation Rate', 'نسبة التأكيد'), value: d.confirmationRate ? d.confirmationRate.value : (((window.dashboardGeoData || {}).pipeline || {}).metrics || {}).confirmationRate || 0, unit: '%', delta: d.confirmationRate ? d.confirmationRate.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.confirmationRate.tooltip', 'Confirmation Rate = confirmed orders / net placed orders.') },
    { label: s1Txt('DR Rate', 'نسبة DR'), value: d.drRate ? d.drRate.value : (((window.dashboardGeoData || {}).pipeline || {}).metrics || {}).drPct || 0, unit: '%', delta: d.drRate ? d.drRate.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.drRate.tooltip', 'DR = delivered orders / confirmed orders.') },
  ];

  var activeAccId = (window.getActiveAccountId ? window.getActiveAccountId() : '__all__') || '__all__';
  var roiLiveRaw = (window.DashboardRoiState && window.DashboardRoiState.get(activeAccId)) || {};
  var marketingState = window.DashboardMarketingState ? window.DashboardMarketingState.get(activeAccId) : null;
  var syncedSpendActive = !!(
    marketingState &&
    marketingState.status === "connected" &&
    marketingState.summary &&
    !marketingState.manualOverride
  );
  var sourceBreakdown = marketingState && marketingState.summary && Array.isArray(marketingState.summary.sourceBreakdown)
    ? marketingState.summary.sourceBreakdown
    : [];
  var targetCurrency = roiLiveRaw.currency || 'SAR';
  var egpRate = roiLiveRaw.egpRate != null ? roiLiveRaw.egpRate : 52.0;

  function convertCurrency(val, from, to) {
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

  var finalAdSpend = roiLiveRaw.adSpend != null ? roiLiveRaw.adSpend : 250;
  if (syncedSpendActive) {
    if (!sourceBreakdown.length) {
      finalAdSpend = Number((marketingState.summary && marketingState.summary.adSpend) || 0);
    } else {
      var convertedTotal = sourceBreakdown.reduce(function (total, source) {
        return total + convertCurrency(Number(source.rawSpend || 0), source.currency || "SAR", targetCurrency);
      }, 0);
      finalAdSpend = Number(convertedTotal.toFixed(2));
    }
  }

  var nativeCurrency = (data && data.meta && data.meta.activeCurrency) || window.dashboardActiveCurrency || targetCurrency || 'SAR';
  var deliveredSalesInTarget = convertCurrency((d.totalDeliveredSales && d.totalDeliveredSales.value) || 0, nativeCurrency, targetCurrency);
  var netRoasUnavailable = !(finalAdSpend > 0);
  var netRoas = netRoasUnavailable ? 0 : (deliveredSalesInTarget / finalAdSpend);
  var netRoasDelta = d.netRoas && d.netRoas.delta != null ? Number(d.netRoas.delta || 0) : 0;

  var newCards = [
    { label: s1Txt('Net Total Sales', 'صافي إجمالي المبيعات'), value: d.totalSales ? d.totalSales.value : 0, unit: nativeCurrency, delta: d.totalSales ? d.totalSales.delta : 0, color: 'green', spark: [], iconType: 'green', tooltip: tx('kpi.totalSales.tooltip', 'Net total sales = sum of الأسعار for net orders only, excluding طلب ملغي بواسطتك.') },
    { label: s1Txt('Average Order Value (AOV)', 'متوسط قيمة الطلب (AOV)'), value: d.overallAov ? d.overallAov.value : 0, unit: nativeCurrency, delta: d.overallAov ? d.overallAov.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.overallAov.tooltip', 'متوسط قيمة الطلب الإجمالي ويحسب بقسمة إجمالي المبيعات على إجمالي الطلبات.') },
    { label: s1Txt('Net Total Delivered Sales', 'صافي مبيعات الطلبات المسلمة'), value: d.totalDeliveredSales ? d.totalDeliveredSales.value : 0, unit: nativeCurrency, delta: d.totalDeliveredSales ? d.totalDeliveredSales.delta : 0, color: 'green', spark: [], iconType: 'green', tooltip: tx('kpi.totalDeliveredSales.tooltip', 'Net total delivered sales = sum of prices for delivered net orders only, excluding Canceled by you.') },
    { label: s1Txt('Average Order Value (Delivered)', 'متوسط قيمة الطلب المسلم'), value: d.deliveredAov ? d.deliveredAov.value : 0, unit: nativeCurrency, delta: d.deliveredAov ? d.deliveredAov.delta : 0, color: 'blue', spark: [], iconType: 'blue', tooltip: tx('kpi.deliveredAov.tooltip', 'Delivered AOV = net delivered sales / delivered orders.') },
    { label: s1Txt('NDR Rate', 'نسبة NDR'), value: d.ndrRate ? d.ndrRate.value : (((window.dashboardGeoData || {}).pipeline || {}).metrics || {}).deliveryRate || 0, unit: '%', delta: d.ndrRate ? d.ndrRate.delta : 0, color: 'orange', spark: [], iconType: 'orange', tooltip: tx('kpi.ndrRate.tooltip', 'NDR = delivered orders / net placed orders.') },
    { label: s1Txt('Net ROAS', 'العائد الصافي على الإعلان'), value: netRoasUnavailable ? 0 : netRoas.toFixed(2), displayValue: netRoasUnavailable ? '—' : netRoas.toFixed(2), unit: 'x', delta: netRoasDelta, hideDelta: netRoasUnavailable, color: 'purple', spark: [], iconType: 'purple', tooltip: tx('kpi.netRoas.tooltip', s1Txt('Net ROAS = delivered sales divided by ad spend. It uses only successfully delivered order revenue, so pending, canceled, and returned orders do not inflate ad performance.', 'العائد الصافي على الإعلان = مبيعات الطلبات المسلمة مقسومة على الإنفاق الإعلاني. يستخدم مبيعات الطلبات المسلمة فقط حتى لا ترفع الطلبات المعلقة أو الملغاة أو المرتجعة نتيجة الإعلان.')) }
  ];

  /* ── Health bar data ─────────────────────────────────────────────────────── */
  // Taager dashboard/status/NDR migration:
  // Health bars display Taager profit buckets, while legacy data keys stay stable.
  var barSegments = [
    { pct: d.health.earned.pct,   color: '#00e676', label: s1Txt('Earned', 'ربح محقق'),  sar: d.health.earned.sar   },
    { pct: d.health.incoming.pct, color: '#f59e0b', label: s1Txt('Incoming', 'ربح قادم'),  sar: d.health.incoming.sar },
    { pct: d.health.lost.pct,     color: '#ef4444', label: s1Txt('Lost', 'ربح ضائع'), sar: d.health.lost.sar     },
  ];
  var join1 = d.health.earned.pct;
  var join2 = d.health.earned.pct + d.health.incoming.pct;

  /* ── formatSAR helper ────────────────────────────────────────────────────── */
  var fmt = (ctx && ctx.formatSAR) ? ctx.formatSAR : (window.formatSAR || function (n) { return Number(n).toLocaleString('en-US'); });
  var fullData = (ctx && ctx.data) || window.dashboardGeoData || {};
  var trendPeriod = mountEl._s1TrendPeriod || '30';
  var cityMetric = mountEl._s1CityMetric || 'commission';

  function getTrendSeries(period) {
    var trend = fullData.commissionTrend || {};
    var periods = trend.periods || {};
    var rows = periods[period] || periods['30'] || periods['14'] || periods['7'] || [];
    if (rows.length) return rows.map(function (item, idx) {
      return {
        label: item.d || item.label || String(idx + 1),
        value: Number(item.v || item.value || 0)
      };
    });
    var fallback = (d.sparklines && d.sparklines.earned) || [];
    return fallback.map(function (value, idx) {
      return { label: String(idx + 1), value: Number(value || 0) };
    });
  }

  function trendSvgFor(period) {
    var rows = getTrendSeries(period);
    if (!rows.length) rows = [{ value: 0 }, { value: 0 }];
    if (rows.length === 1) rows.push({ value: rows[0].value });
    var W = 800;
    var H = 140;
    var min = Math.min.apply(null, rows.map(function (r) { return r.value; }));
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var rng = max - min || 1;
    var pts = rows.map(function (row, idx) {
      var x = rows.length === 1 ? 0 : (idx / (rows.length - 1)) * W;
      var y = 12 + ((max - row.value) / rng) * (H - 24);
      return { x: x, y: y, value: row.value };
    });
    var line = pts.map(function (p, idx) { return (idx ? 'L ' : 'M ') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    var area = line + ' L ' + W + ',' + H + ' L 0,' + H + ' Z';
    var markers = pts.filter(function (_, idx) {
      return idx === pts.length - 1 || idx === Math.floor((pts.length - 1) / 2) || idx === Math.floor((pts.length - 1) * 0.75);
    }).map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="5" fill="#fff" stroke="#3b82f6" stroke-width="2" style="filter:drop-shadow(0 0 6px #3b82f6)"/>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:140px;display:block;margin-top:20px;overflow:visible;">' +
      '<defs><linearGradient id="trendGradS1" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25"/>' +
        '<stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#trendGradS1)"/>' +
      '<path d="' + line + '" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px rgba(59,130,246,0.6))"/>' +
      markers +
    '</svg>';
  }

  function statusBucket(status) {
    if (window.TaagerStatus) {
      var bucket = window.TaagerStatus.dashboardBucket(status);
      if (bucket === 'delivered') return 'delivered';
      if (bucket === 'failed' || bucket === 'canceled_by_you') return 'lost';
      if (bucket === 'shipping' || bucket === 'confirmed' || bucket === 'processing' || bucket === 'waiting') return 'incoming';
      return 'other';
    }
    var s = String(status || '').toLowerCase();
    if (s.indexOf('delivered') !== -1 || s.indexOf('مسلم') !== -1 || s.indexOf('تسليم') !== -1) return 'delivered';
    if (s.indexOf('shipping') !== -1 || s.indexOf('confirmed') !== -1 || s.indexOf('processing') !== -1 || s.indexOf('شحن') !== -1 || s.indexOf('مؤكد') !== -1 || s.indexOf('معالجة') !== -1) return 'incoming';
    if (s.indexOf('failed') !== -1 || s.indexOf('cancel') !== -1 || s.indexOf('ملغ') !== -1 || s.indexOf('فشل') !== -1 || s.indexOf('مرتجع') !== -1) return 'lost';
    return 'other';
  }

  function lostBreakdownFromData() {
    var exact = (d && Array.isArray(d.lostBreakdown) && d.lostBreakdown.length ? d.lostBreakdown : null) ||
      (fullData.pipeline && Array.isArray(fullData.pipeline.lostBreakdown) && fullData.pipeline.lostBreakdown.length ? fullData.pipeline.lostBreakdown : null) ||
      (Array.isArray(fullData.lostBreakdown) && fullData.lostBreakdown.length ? fullData.lostBreakdown : null);
    if (exact) return exact;
    var statusRows = (fullData.pipeline && Array.isArray(fullData.pipeline.statusSummary) ? fullData.pipeline.statusSummary : null) ||
      (Array.isArray(fullData.statusSummary) ? fullData.statusSummary : []);
    var lostRows = statusRows.filter(function (row) { return row.businessGroup === 'lost'; });
    if (lostRows.length) {
      var exactTotal = lostRows.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
      return lostRows.map(function (row) {
        return {
          id: row.bucket || row.id,
          label: row.label,
          count: Number(row.count || 0),
          value: Number(row.profitAfterTax || row.value || row.sar || 0),
          color: row.color || '#ef4444',
          pct: exactTotal ? Math.round((Number(row.count || 0) / exactTotal) * 100) : 0
        };
      });
    }
    var orders = Array.isArray(fullData.orders) ? fullData.orders : [];
    if (!orders.length && d.lostBreakdown) return d.lostBreakdown;
    var buckets = {
      cancel: { label: raw('Customer Cancel'), pct: 0, count: 0, color: '#ef4444' },
      stock: { label: raw('Out of Stock'), pct: 0, count: 0, color: '#f59e0b' },
      delivery: { label: raw('Delivery Failed'), pct: 0, count: 0, color: '#3b82f6' },
      returned: { label: raw('Returned'), pct: 0, count: 0, color: '#a855f7' }
    };
    orders.forEach(function (order) {
      if (statusBucket(order.orderStatus || order.status) !== 'lost') return;
      var text = [
        order.cancelReason,
        order.reason,
        order.notes,
        order.orderStatus,
        order.status
      ].join(' ').toLowerCase();
      if (/stock|inventory|مخزون|نفاد/.test(text)) buckets.stock.count += 1;
      else if (/return|returned|مرتجع|راجع/.test(text)) buckets.returned.count += 1;
      else if (/deliver|shipping|courier|فشل|شحن|توصيل/.test(text)) buckets.delivery.count += 1;
      else buckets.cancel.count += 1;
    });
    var total = Object.keys(buckets).reduce(function (sum, key) { return sum + buckets[key].count; }, 0);
    if (!total && d.lostBreakdown) return d.lostBreakdown;
    return Object.keys(buckets).map(function (key) {
      var item = buckets[key];
      return Object.assign({}, item, { pct: total ? Math.round((item.count / total) * 100) : 0 });
    });
  }

  function topCities(metric) {
    var cities = fullData.cod && Array.isArray(fullData.cod.cities) ? fullData.cod.cities : [];
    if (!cities.length) return d.topContributors || [];
    return cities.slice().map(function (city) {
      var commission = Number(city.earnedCommission || city.collected || city.sar || city.gap || 0);
      var orders = Number(city.count || city.orders || city.deliveredOrders || 0);
      var lost = Number(city.lostCommission || city.gap || 0);
      var delivered = Number(city.deliveredOrders || 0);
      var value = metric === 'orders' ? orders : (metric === 'lost' ? lost : (metric === 'delivery' ? delivered : commission));
      return {
        name: city.name,
        value: value,
        unit: metric === 'orders' || metric === 'delivery' ? raw('orders') : nativeCurrency
      };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 3);
  }

  function overviewInsight() {
    var context = window.getDashboardAiContext ? window.getDashboardAiContext({ data: fullData, section: 'overview' }) : null;
    if (context && context.localSummary && context.localSummary.message) return context.localSummary.message;
    if (d.insights && d.insights[0] && d.insights[0].text) return d.insights[0].text;
    var lostPct = d.health && d.health.lost ? Number(d.health.lost.pct || 0) : 0;
    if (lostPct >= 45) return 'Lost Taager profit is high. Ask AI to identify the products and cities causing the most leakage.';
    return 'Taager profit health is stable. Ask AI for the next best growth move from this dashboard snapshot.';
  }

  /* ── Build KPI card row HTML ─────────────────────────────────────────────── */
  var cardsHtml = cards.map(function (c, i) {
    return '<div class="fade-up" style="flex:1 1 210px;min-width:190px;animation-delay:' + (i * 100) + 'ms;">' +
      window.kpiCard({ label: c.label, value: c.value, displayValue: c.displayValue, staticDisplay: c.staticDisplay, unit: c.unit, delta: c.delta, hideDelta: c.hideDelta, color: c.color, sparklineData: c.spark, iconType: c.iconType, tooltip: c.tooltip }) +
      '</div>';
  }).join('');

  var newCardsHtml = newCards.map(function (c, i) {
    return '<div class="fade-up" style="flex:1 1 210px;min-width:190px;animation-delay:' + ((i + 6) * 100) + 'ms;">' +
      window.kpiCard({ label: c.label, value: c.value, displayValue: c.displayValue, staticDisplay: c.staticDisplay, unit: c.unit, delta: c.delta, hideDelta: c.hideDelta, color: c.color, sparklineData: c.spark, iconType: c.iconType, tooltip: c.tooltip }) +
      '</div>';
  }).join('');

  /* ── Build health bar segments HTML ─────────────────────────────────────── */
  var segmentsHtml = barSegments.map(function (s, i) {
    return '<div class="health-seg" data-pct="' + s.pct + '" style="' +
      'width:0%;height:100%;flex-shrink:0;' +
      'background:' + s.color + ';' +
      'box-shadow:inset 0 4px 8px rgba(255,255,255,0.15);' +
      'transition:width 0.45s cubic-bezier(0.22,1,0.36,1) ' + (0.1 + i * 0.07) + 's;' +
    '"></div>';
  }).join('');

  var pctLabelsHtml = barSegments.map(function (s) {
    return '<div style="width:' + s.pct + '%;text-align:center;white-space:nowrap;display:flex;justify-content:center;">' +
      '<span style="font-size:13px;font-weight:800;color:' + s.color + ';font-family:\'DM Mono\', monospace;white-space:nowrap;">' + s.pct + '%</span>' +
    '</div>';
  }).join('');

  var sarLabelsHtml = barSegments.map(function (s) {
    return '<div style="width:' + s.pct + '%;text-align:center;white-space:nowrap;display:flex;flex-direction:column;align-items:center;">' +
      '<div style="font-size:17px;font-weight:800;color:' + s.color + ';line-height:1.2;font-family:\'DM Mono\', monospace;white-space:nowrap;">' +
        fmt(s.sar) +
      '</div>' +
      '<div style="font-size:12px;color:rgba(255,255,255,0.42);margin-top:5px;font-weight:500; font-family:\'Tajawal\', sans-serif;white-space:nowrap;">' +
        s.label +
      '</div>' +
    '</div>';
  }).join('');

  /* Dynamic performance evaluation based on lost Taager profit percentage. */
  var lostPct = (d.health && d.health.lost) ? Number(d.health.lost.pct || 0) : 0;
  var perfStatus = 'excellent';
  if (lostPct >= 50) {
    perfStatus = 'critical';
  } else if (lostPct >= 25) {
    perfStatus = 'warning';
  }

  var perfColor, perfTitle, perfSub, perfIcon;
  if (perfStatus === 'critical') {
    perfColor = '#ef4444';
    perfTitle = s1Txt('Needs Attention', 'تحذير: أداء حرج');
    perfSub = s1Txt('High leakage rate', 'نسبة ربح ضائع مرتفعة');
    perfIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="' + perfColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="30" height="30">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
      '<line x1="12" y1="9" x2="12" y2="13"/>' +
      '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
      '</svg>';
  } else if (perfStatus === 'warning') {
    perfColor = '#f59e0b';
    perfTitle = s1Txt('Fair Performance', 'أداء مقبول');
    perfSub = s1Txt('Review leakage causes', 'راجع أسباب الفقد');
    perfIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="' + perfColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="30" height="30">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
      '<path d="M12 8v4"/>' +
      '<path d="M12 16h.01"/>' +
      '</svg>';
  } else {
    perfColor = '#00e676';
    perfTitle = s1Txt('Excellent Performance', 'أداء ممتاز');
    perfSub = s1Txt('Keep it up!', 'استمر على هذا المنوال!');
    perfIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="' + perfColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="30" height="30">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
      '<path d="m9 11 2 2 4-4"/>' +
      '</svg>';
  }

  /* ── Interactive Trend Chart ──────────────────────────────────────────────── */
  var trendSvg = trendSvgFor(trendPeriod);

  var trendWidgetHtml = '<div style="background:#0d1220;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:24px;display:flex;flex-direction:column;flex:1;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<div style="font-size:16px;font-weight:800;color:#fff;">Profits & Orders Trend</div>' +
      '<div id="s1-trend-select" class="s1-select-wrap" style="width:138px;"></div>' +
    '</div>' +
    '<div id="s1-trend-chart">' + trendSvg + '</div>' +
  '</div>';

  /* ── AI Insights ─────────────────────────────────────────────────────────── */
  var insightText = overviewInsight();
  var insightsHtml = '<div style="background:linear-gradient(145deg, rgba(59,130,246,0.1), rgba(168,85,247,0.05));border:1px solid rgba(59,130,246,0.2);border-radius:16px;padding:20px;position:relative;overflow:hidden;flex:1;display:flex;flex-direction:column;">' +
    '<div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:#3b82f6;filter:blur(50px);opacity:0.25;border-radius:50%;"></div>' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;z-index:2;direction:ltr;">' +
      '<span style="color:#a855f7;font-size:20px;filter:drop-shadow(0 0 6px rgba(168,85,247,0.5));">✦</span>' +
      '<span style="font-size:16px;font-weight:800;color:#fff;">AI Insights</span>' +
    '</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.7;z-index:2;flex:1;font-weight:500;direction:ltr;">' +
      insightText +
    '</div>' +
    '<div style="margin-top:16px;z-index:2;direction:ltr;">' +
      '<button id="s1-ask-ai-btn" type="button" style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s ease;height:30px;min-height:30px;" onmouseover="this.style.background=\'rgba(59,130,246,0.25)\'" onmouseout="this.style.background=\'rgba(59,130,246,0.15)\'">Ask AI</button>' +
    '</div>' +
  '</div>';

  /* Lost Taager Profit Breakdown. */
  var donutSvg = '<svg viewBox="0 0 100 100" width="90" height="90" style="transform:rotate(-90deg);overflow:visible;">' +
    '<circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="12"/>' +
    '<circle cx="50" cy="50" r="40" fill="none" stroke="#ef4444" stroke-width="12" stroke-dasharray="113 251" stroke-dashoffset="0" style="filter:drop-shadow(0 0 4px rgba(239,68,68,0.5))"/>' +
    '<circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" stroke-width="12" stroke-dasharray="75 251" stroke-dashoffset="-113"/>' +
    '<circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" stroke-width="12" stroke-dasharray="38 251" stroke-dashoffset="-188"/>' +
    '<circle cx="50" cy="50" r="40" fill="none" stroke="#a855f7" stroke-width="12" stroke-dasharray="25 251" stroke-dashoffset="-226"/>' +
  '</svg>';

  var lostArr = lostBreakdownFromData() || [
    { label: 'Customer Cancel', pct: 45, color: '#ef4444' },
    { label: 'Out of Stock', pct: 30, color: '#f59e0b' },
    { label: 'Delivery Failed', pct: 15, color: '#3b82f6' },
    { label: 'Returned', pct: 10, color: '#a855f7' }
  ];
  var breakdownListHtml = lostArr.map(function(item) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:' + item.color + ';box-shadow:0 0 8px ' + item.color + '88;"></div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.75);font-weight:500;">' + item.label + '</div>' +
      '</div>' +
      '<div style="font-size:14px;font-weight:800;color:#fff;">' + item.pct + '%</div>' +
    '</div>';
  }).join('');

  var lostWidgetHtml = '<div style="background:#0d1220;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:24px;display:flex;align-items:center;gap:32px;height:100%;direction:ltr;">' +
    '<div style="position:relative;flex-shrink:0;">' +
      donutSvg +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:600;">Lost</div>' +
      '</div>' +
    '</div>' +
    '<div style="flex:1;">' +
      '<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:16px;">Lost Profit Analysis</div>' +
      breakdownListHtml +
    '</div>' +
  '</div>';

  /* ── Top Contributors ────────────────────────────────────────────────────── */
  var topArr = topCities(cityMetric) || [
    { name: 'Riyadh', value: 12500, unit: nativeCurrency },
    { name: 'Jeddah', value: 8300, unit: nativeCurrency },
    { name: 'Dammam', value: 5400, unit: nativeCurrency }
  ];
  var topListHtml = topArr.map(function(item, index) {
    var colors = ['#00e676', '#f59e0b', '#3b82f6'];
    var c = colors[index] || '#fff';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.02);border-radius:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.02);">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<div style="width:26px;height:26px;border-radius:50%;background:' + c + '22;color:' + c + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;">' + (index + 1) + '</div>' +
        '<div style="font-size:14px;font-weight:700;color:#fff;">' + item.name + '</div>' +
      '</div>' +
      '<div style="font-size:14px;font-weight:800;color:' + c + ';font-family:\'DM Mono\', monospace;">' + fmt(item.value) + ' <span style="font-size:11px;font-weight:700;">' + item.unit + '</span></div>' +
    '</div>';
  }).join('');

  var topWidgetHtml = '<div style="background:#0d1220;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:24px;height:100%;direction:ltr;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
      '<div style="font-size:16px;font-weight:800;color:#fff;">Top Performing Cities</div>' +
      '<div id="s1-city-select" class="s1-select-wrap" style="width:132px;"></div>' +
    '</div>' +
    '<div id="s1-city-list">' + topListHtml + '</div>' +
  '</div>';

  /* ── Goal Tracker ────────────────────────────────────────────────────────── */
  var activeAccId = (window.getActiveAccountId ? window.getActiveAccountId() : '__all__') || '__all__';
  var savedTarget = localStorage.getItem('taager_commission_goal_target_' + activeAccId);
  var targetVal = savedTarget ? parseInt(savedTarget, 10) : 0;
  if (!targetVal || isNaN(targetVal) || targetVal <= 0) {
    var currentVal = d.earnedCommission.value || 0;
    if (currentVal <= 10000) {
      targetVal = 10000;
    } else if (currentVal <= 25000) {
      targetVal = 25000;
    } else if (currentVal <= 50000) {
      targetVal = 50000;
    } else if (currentVal <= 100000) {
      targetVal = 100000;
    } else if (currentVal <= 200000) {
      targetVal = 200000;
    } else {
      targetVal = Math.ceil(currentVal / 100000) * 100000;
    }
  }
  var goalObj = { current: d.earnedCommission.value || 0, target: targetVal };
  var goalPct = Math.min(100, Math.round((goalObj.current / goalObj.target) * 100));
  var dashOffset = 251 - (251 * goalPct / 100);
  var goalSvg = '<svg viewBox="0 0 100 100" width="76" height="76" style="transform:rotate(-90deg);overflow:visible;">' +
    '<circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8"/>' +
    '<circle id="s1-goal-circle" cx="50" cy="50" r="40" fill="none" stroke="#00e676" stroke-width="8" stroke-dasharray="251" stroke-dashoffset="' + dashOffset + '" stroke-linecap="round" style="filter:drop-shadow(0 0 8px rgba(0,230,118,0.5)); transition:stroke-dashoffset 1s ease-out;"/>' +
  '</svg>';

  var goalWidgetHtml = '<div style="background:#0d1220;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px 24px;display:flex;align-items:center;gap:24px;flex:1;direction:ltr;">' +
    '<div style="position:relative;flex-shrink:0;">' +
      goalSvg +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">' +
        '<div id="s1-goal-pct" style="font-size:17px;font-weight:900;color:#fff;font-family:\'DM Mono\', monospace;">' + goalPct + '%</div>' +
      '</div>' +
    '</div>' +
    '<div style="flex:1;">' +
      '<div style="font-size:15px;font-weight:800;color:#fff;margin-bottom:6px;">' + s1Txt('Monthly Taager Profit Goal', 'هدف ربح تاجر الشهري') + '</div>' +
      '<div style="font-size:13px;color:rgba(255,255,255,0.5);font-weight:500;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
        '<span>' + s1Txt('Target:', 'الهدف:') + '</span>' +
        '<span id="s1-goal-target" style="color:#fff;font-weight:800;font-family:\'DM Mono\', monospace;cursor:pointer;border-bottom:1px dashed rgba(255,255,255,0.4);padding-bottom:1px;transition:color 0.2s;" onmouseover="this.style.color=\'#00e676\'" onmouseout="this.style.color=\'#fff\'" title="' + s1Txt('Click to edit goal', 'انقر لتعديل الهدف') + '">' + fmt(goalObj.target) + '</span>' +
        '<span style="color:rgba(255,255,255,0.3);font-size:11px;direction:ltr;">(Remaining: <span style="color:#00e676;font-weight:800;" id="s1-goal-remaining">' + fmt(Math.max(0, goalObj.target - goalObj.current)) + '</span>)</span>' +
      '</div>' +
    '</div>' +
  '</div>';

  /* ── Full section HTML ───────────────────────────────────────────────────── */
  var html =
    '<div class="dash-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;background:#080b12; " id="s1-root">' +

      /* Body */
      '<div class="s1-body" style="padding:20px 22px;flex:1;">' +

        /* Title row */
        '<div class="fade-up s1-title-row" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;">' +

          /* Title block (visual right in RTL = first child) */
          '<div id="s1-title-block">' +
            '<h1 id="s1-h1" style="font-size:clamp(20px,2.5vw,28px);font-weight:900;color:#fff;margin:0;line-height:1.15;opacity:0;transform:translateY(-8px);transition:opacity 0.4s ease,transform 0.4s ease;">' +
              s1Txt('Performance Overview', 'نظرة عامة على الأداء') +
            '</h1>' +
            '<p id="s1-subtitle" style="font-size:13px;color:rgba(255,255,255,0.4);margin:7px 0 0;display:flex;align-items:center;gap:6px;opacity:0;transition:opacity 0.4s ease 0.12s;">' +
              s1Txt('Comprehensive overview of your store performance on Taager platform', 'ملخص شامل لأداء متجرك على منصة تاجر') +
              '<span style="color:#3b82f6;font-size:15px;margin-right:6px;filter:drop-shadow(0 0 4px rgba(59,130,246,0.5));">✦</span>' +
            '</p>' +
          '</div>' +

          /* Compare status chip (visual left = last child) */
          '<span class="s1-compare-chip" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;' +
            'border:1px solid rgba(255,255,255,0.13);background:rgba(255,255,255,0.05);' +
            'color:rgba(255,255,255,0.65);font-size:11px;font-weight:600;font-family:inherit;height:30px;min-height:30px;align-self:flex-start;">' +
            '<svg width="12" height="8" viewBox="0 0 20 12" fill="none" style="flex-shrink:0;">' +
              '<polyline points="1,11 5,5 9,9 13,2 17,6 19,4" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
            '</svg>' +
            s1Txt('vs previous month', 'مقارنة مع الشهر السابق') +
          '</span>' +

        '</div>' +

        /* KPI cards row */
        '<div class="s1-kpi-row" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">' +
          cardsHtml +
        '</div>' +

        /* New KPI cards row */
        '<div class="s1-kpi-row" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">' +
          newCardsHtml +
        '</div>' +

        /* New Grid Layout */
        '<div class="fade-up" style="display:flex;flex-direction:column;gap:18px;margin-bottom:18px;animation-delay:200ms;">' +

          /* Row 1: Taager Profit Health Index & AI Insights side-by-side (stacks on small screens) */
          '<div style="display:flex;flex-wrap:wrap;gap:18px;">' +
            '<div style="flex:2;min-width:280px;display:flex;">' +
              '<div class="s1-health-row" style="background:#0d1220;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:24px 28px;direction:ltr;display:flex;flex-wrap:wrap;align-items:center;gap:32px;width:100%;">' +

                /* Main area */
                '<div style="flex:2;min-width:280px;">' +

                  /* Title */
                  '<div class="health-title" style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">' +
                    '<svg width="26" height="16" viewBox="0 0 28 16" fill="none">' +
                      '<polyline points="1,8 4,2 8,14 12,4 16,12 20,2 24,10 27,7" stroke="#3b82f6" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>' +
                    '<span style="font-size:18px;font-weight:800;color:#fff;">' + s1Txt('Taager Profit Health Index', 'مؤشر صحة ربح تاجر') + '</span>' +
                  '</div>' +

                  /* Subtitle */
                  '<div class="health-subtitle" style="font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:18px;">' +
                    s1Txt('Distribution of Taager profit between earned, incoming, and lost', 'توزيع ربح تاجر بين المحقق والقادم والضائع') +
                  '</div>' +

                  /* Bar */
                  '<div style="position:relative;height:22px;border-radius:11px;overflow:visible;margin-bottom:18px;">' +

                    /* Clipped segments container */
                    '<div id="s1-bar-track" style="position:absolute;inset:0;border-radius:11px;overflow:hidden;display:flex;">' +
                      segmentsHtml +
                    '</div>' +

                    /* Spark dot — green|orange boundary */
                    '<div id="s1-dot1" style="position:absolute;left:' + join1 + '%;top:50%;transform:translate(-50%,-50%);' +
                      'width:10px;height:10px;border-radius:50%;background:#fff;z-index:4;' +
                      'box-shadow:0 0 10px 4px #f59e0bdd,0 0 22px 10px #f59e0b55;' +
                      'opacity:0;transform:translate(-50%,-50%) scale(0);' +
                      'transition:opacity 0.3s ease 0.35s,transform 0.3s ease 0.35s;"></div>' +

                    /* Spark dot — orange|red boundary */
                    '<div id="s1-dot2" style="position:absolute;left:' + join2 + '%;top:50%;transform:translate(-50%,-50%);' +
                      'width:10px;height:10px;border-radius:50%;background:#fff;z-index:4;' +
                      'box-shadow:0 0 10px 4px #ef4444dd,0 0 22px 10px #ef444455;' +
                      'opacity:0;transform:translate(-50%,-50%) scale(0);' +
                      'transition:opacity 0.3s ease 0.45s,transform 0.3s ease 0.45s;"></div>' +

                  '</div>' +

                  /* Legend Grid (Responsive & non-overlapping) */
                  '<div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;margin-top:14px;">' +
                    barSegments.map(function (s) {
                      return '<div style="display:flex;align-items:center;gap:8px;min-width:120px;flex:1;">' +
                        '<div style="width:12px;height:12px;border-radius:3px;background:' + s.color + ';box-shadow:0 0 6px ' + s.color + '88;flex-shrink:0;"></div>' +
                        '<div style="display:flex;flex-direction:column;">' +
                          '<span style="font-size:12px;color:rgba(255,255,255,0.5);font-weight:500;">' + s.label + '</span>' +
                          '<span style="font-size:15px;font-weight:800;color:#fff;font-family:\'DM Mono\', monospace;margin-top:2px;white-space:nowrap;">' +
                            fmt(s.sar) +
                            ' <span style="font-size:12px;font-weight:700;color:' + s.color + ';margin-left:6px;">(' + s.pct + '%)</span>' +
                          '</span>' +
                        '</div>' +
                      '</div>';
                    }).join('') +
                  '</div>' +

                '</div>' +

                /* Badge — Dynamic Performance */
                '<div style="flex:1;min-width:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">' +
                  '<div style="width:62px;height:62px;border-radius:14px;background:' + perfColor + '1f;border:1.5px solid ' + perfColor + '59;box-shadow:0 0 22px 7px ' + perfColor + '4d;display:flex;align-items:center;justify-content:center;">' +
                    perfIcon +
                  '</div>' +
                  '<div style="font-size:15px;font-weight:800;color:' + perfColor + ';text-align:center; white-space:nowrap;">' + perfTitle + '</div>' +
                  '<div style="font-size:11px;color:rgba(255,255,255,0.42);text-align:center;line-height:1.5; white-space:nowrap;">' + perfSub + '</div>' +
                '</div>' +

              '</div>' +
            '</div>' +
            '<div style="flex:1;min-width:240px;display:flex;">' +
              insightsHtml +
            '</div>' +
          '</div>' + /* /Row 1 */

          /* Row 2: Trend & Goal Tracker */
          '<div style="display:flex;flex-wrap:wrap;gap:18px;">' +
            '<div style="flex:2;min-width:280px;display:flex;flex-direction:column;">' +
              trendWidgetHtml +
            '</div>' +
            '<div style="flex:1;min-width:240px;display:flex;flex-direction:column;">' +
              goalWidgetHtml +
            '</div>' +
          '</div>' + /* /Row 2 */

        '</div>' + /* /Grid Layout */ /* /Grid Layout */

        /* Bottom Widgets Row */
        '<div class="fade-up" style="display:flex;flex-wrap:wrap;gap:18px;animation-delay:300ms;">' +
          '<div style="flex:1;min-width:280px;">' + lostWidgetHtml + '</div>' +
          '<div style="flex:1;min-width:280px;">' + topWidgetHtml + '</div>' +
        '</div>' +

        /* Footnote */
        '<p style="text-align:center;font-size:11px;color:rgba(255,255,255,0.35);margin-top:22px;display:flex;align-items:center;justify-content:center;gap:6px; ">' +
          s1Txt('Earned Taager profit is calculated from delivered orders only', 'يحسب ربح تاجر المحقق من الطلبات التي تم تسليمها فقط') +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px;">' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<line x1="12" y1="16" x2="12" y2="12"/>' +
            '<line x1="12" y1="8" x2="12.01" y2="8"/>' +
          '</svg>' +
        '</p>' +

      '</div>' + /* /body */
    '</div>'; /* /s1-root */

  /* ── Inject HTML ─────────────────────────────────────────────────────────── */
  mountEl.innerHTML = html;

  /* ── Post-injection wiring ───────────────────────────────────────────────── */

  /* 1. Animate h1 + subtitle (CSS transition, trigger by adding opacity) */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var h1 = document.getElementById('s1-h1');
      var sub = document.getElementById('s1-subtitle');
      if (h1)  { h1.style.opacity  = '1'; h1.style.transform  = 'translateY(0)'; }
      if (sub) { sub.style.opacity = '1'; }
    });
  });

  /* 2. Animate KPI number counters */
  if (window.runKpiAnimations) {
    window.runKpiAnimations(mountEl);
  }

  function cityListHtml(metric) {
    return topCities(metric).map(function(item, index) {
      var colors = ['#00e676', '#f59e0b', '#3b82f6'];
      var c = colors[index] || '#fff';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.02);border-radius:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.02);">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<div style="width:26px;height:26px;border-radius:50%;background:' + c + '22;color:' + c + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;">' + (index + 1) + '</div>' +
          '<div style="font-size:14px;font-weight:700;color:#fff;">' + esc(item.name) + '</div>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:800;color:' + c + ';font-family:\'DM Mono\', monospace;">' + fmt(item.value) + ' <span style="font-size:11px;font-weight:700;">' + esc(item.unit) + '</span></div>' +
      '</div>';
    }).join('');
  }

  var dropdown = window.renderTaagerDropdown || window.renderCustomSelect;
  if (typeof dropdown === 'function') {
    var trendWrap = mountEl.querySelector('#s1-trend-select');
    if (trendWrap) {
      dropdown(trendWrap, [
        { value: '7', label: tr.t('period.trend7') },
        { value: '14', label: tr.t('period.trend14') },
        { value: '30', label: tr.t('period.trend30') }
      ], trendPeriod, function (value) {
        mountEl._s1TrendPeriod = value;
        trendPeriod = value;
        var chart = mountEl.querySelector('#s1-trend-chart');
        if (chart) chart.innerHTML = trendSvgFor(value);
      }, { ariaLabel: 'Trend period' });
    }
    var cityWrap = mountEl.querySelector('#s1-city-select');
    if (cityWrap) {
      dropdown(cityWrap, [
        { value: 'commission', label: 'Profit After Tax' },
        { value: 'orders', label: 'Orders' },
        { value: 'delivery', label: 'Delivered' },
        { value: 'lost', label: 'Lost' }
      ], cityMetric, function (value) {
        mountEl._s1CityMetric = value;
        cityMetric = value;
        var list = mountEl.querySelector('#s1-city-list');
        if (list) list.innerHTML = cityListHtml(value);
      }, { ariaLabel: 'City metric' });
    }
  }

  var askAiBtn = mountEl.querySelector('#s1-ask-ai-btn');
  if (askAiBtn) {
    askAiBtn.addEventListener('click', function () {
      if (ctx && typeof ctx.onNavigate === 'function') ctx.onNavigate('taagerAi');
    });
  }

  // Goal tracker edit interaction
  (function () {
    function initGoalEdit() {
      var goalTargetEl = mountEl.querySelector('#s1-goal-target');
      if (!goalTargetEl) return;
      
      goalTargetEl.addEventListener('click', function () {
        var currentTarget = goalObj.target;
        var parent = goalTargetEl.parentNode;
        if (!parent) return;
        
        // Create input element
        var input = document.createElement('input');
        input.type = 'number';
        input.value = currentTarget;
        input.style.background = 'rgba(255,255,255,0.1)';
        input.style.color = '#fff';
        input.style.border = '1px solid #00e676';
        input.style.borderRadius = '4px';
        input.style.width = '90px';
        input.style.padding = '2px 6px';
        input.style.fontSize = '13px';
        input.style.fontFamily = "'DM Mono', monospace";
        input.style.fontWeight = '800';
        input.style.outline = 'none';
        
        // Replace target text with input
        parent.replaceChild(input, goalTargetEl);
        input.focus();
        input.select();
        
        var finished = false;
        function finishEditing() {
          if (finished) return;
          finished = true;
          
          var newTarget = parseInt(input.value, 10);
          if (isNaN(newTarget) || newTarget <= 0) {
            newTarget = currentTarget; // revert on invalid input
          }
          
          // Save to localStorage
          localStorage.setItem('taager_commission_goal_target_' + activeAccId, newTarget);
          goalObj.target = newTarget;
          
          // Re-render the goal widget contents or just update DOM elements
          var newPct = Math.min(100, Math.round((goalObj.current / newTarget) * 100));
          var newOffset = 251 - (251 * newPct / 100);
          
          // Update SVG circle stroke-dashoffset
          var circle = mountEl.querySelector('#s1-goal-circle');
          if (circle) {
            circle.setAttribute('stroke-dashoffset', newOffset);
          }
          
          // Update pct text inside circle
          var pctText = mountEl.querySelector('#s1-goal-pct');
          if (pctText) {
            pctText.textContent = newPct + '%';
          }
          
          // Recreate the target text element
          var updatedTargetEl = document.createElement('span');
          updatedTargetEl.id = 's1-goal-target';
          updatedTargetEl.style.color = '#fff';
          updatedTargetEl.style.fontWeight = '800';
          updatedTargetEl.style.fontFamily = "'DM Mono', monospace";
          updatedTargetEl.style.cursor = 'pointer';
          updatedTargetEl.style.borderBottom = '1px dashed rgba(255,255,255,0.4)';
          updatedTargetEl.style.paddingBottom = '1px';
          updatedTargetEl.style.transition = 'color 0.2s';
          updatedTargetEl.title = s1Txt('Click to edit goal', 'انقر لتعديل الهدف');
          updatedTargetEl.textContent = fmt(newTarget);
          
          // Add hover effects
          updatedTargetEl.onmouseover = function() { this.style.color = '#00e676'; };
          updatedTargetEl.onmouseout = function() { this.style.color = '#fff'; };
          
          // Swap back
          if (input.parentNode === parent) {
            parent.replaceChild(updatedTargetEl, input);
          }
          
          // Re-bind event listener by calling initGoalEdit
          initGoalEdit();
          
          // Update remaining label
          var remainingEl = mountEl.querySelector('#s1-goal-remaining');
          if (remainingEl) {
            remainingEl.textContent = fmt(Math.max(0, newTarget - goalObj.current));
          }
        }
        
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            finishEditing();
          } else if (e.key === 'Escape') {
            input.value = currentTarget;
            finishEditing();
          }
        });
        
        input.addEventListener('blur', function () {
          finishEditing();
        });
      });
    }
    
    initGoalEdit();
  })();

  /* 3. Animate health bar segments (width: 0 → pct%) */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var track = document.getElementById('s1-bar-track');
      if (track) {
        var segs = track.querySelectorAll('.health-seg');
        segs.forEach(function (seg) {
          var pct = seg.getAttribute('data-pct');
          seg.style.width = pct + '%';
        });
      }

      /* 4. Pop the spark dots */
      var dot1 = document.getElementById('s1-dot1');
      var dot2 = document.getElementById('s1-dot2');
      if (dot1) { dot1.style.opacity = '1'; dot1.style.transform = 'translate(-50%,-50%) scale(1)'; }
      if (dot2) { dot2.style.opacity = '1'; dot2.style.transform = 'translate(-50%,-50%) scale(1)'; }
    });
  });
};
