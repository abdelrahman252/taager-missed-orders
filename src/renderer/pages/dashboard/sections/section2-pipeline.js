/* ══════════════════════════════════════════════════════════════════════════════
   section2-pipeline.js  — fixed: SVG icons use explicit hex colors (no currentColor)
   ══════════════════════════════════════════════════════════════════════════════ */

window.renderSection2 = function (mountEl, data, ctx) {
  'use strict';

  var isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  function s2Txt(en, ar) {
    return window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
  }

  /* ── Build an SVG icon with an explicit stroke color ─────────────────────── */
  function svgIcon(pathData, color, size, isFill) {
    size = size || 22;
    if (isFill) {
      return '<svg viewBox="0 0 24 24" fill="' + color + '" width="' + size + '" height="' + size + '">' + pathData + '</svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="' + size + '" height="' + size + '">' + pathData + '</svg>';
  }

  /* ── Per-stage icon path data ────────────────────────────────────────────── */
  var PATHS = {
    intake:     '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>',
    receivedClock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    confirmed:  '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    processing: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    waiting:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    shipping:   '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    delivered:  '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    failed:     '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    canceled_by_you: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    on_hold:         '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    /* metric / insight icons — slightly larger */
    bag:        '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>',
    trendUp:    '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    xCircle:    '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    barChart:   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    trendDown:  '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    calendar:   '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    info:       '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  };

  /* Insight icon keys per index */
  var INSIGHT_ICON_KEYS = ['processing', 'trendDown', 'shipping', 'barChart'];

  /* ── Fallback / default data ─────────────────────────────────────────────── */
  var STAGES_DEFAULT = [
    { id: 'intake',     label: s2Txt('Order Intake', 'استلام الطلب'),    count: 187, pct: 100,  color: '#4f7df6', convLabel: s2Txt('% of Total', 'نسبة من الإجمالي'), conv: null, convFrom: s2Txt('of total orders', 'من إجمالي الطلبات'), active: false },
    { id: 'received',   label: s2Txt('Order received', 'تم استلام الطلب'),  count: 8,   pct: 4.3,  color: '#3b82f6', convLabel: s2Txt('% of Total', 'نسبة من الإجمالي'), conv: 4.3,  convFrom: s2Txt('of total orders', 'من إجمالي الطلبات') },
    { id: 'confirmed',  label: s2Txt('Confirmed', 'مؤكد'),             count: 18,  pct: 9.6,  color: '#4f55e0', convLabel: s2Txt('% of Total', 'نسبة من الإجمالي'), conv: 9.6,  convFrom: s2Txt('of total orders', 'من إجمالي الطلبات') },
    { id: 'processing', label: s2Txt('Processing', 'قيد المعالجة'),     count: 12,  pct: 6.4,  color: '#14b8a6', convLabel: s2Txt('% of Total', 'نسبة من الإجمالي'), conv: 6.4,  convFrom: s2Txt('of total orders', 'من إجمالي الطلبات') },
    { id: 'shipping',   label: s2Txt('Shipping', 'في الشحن'),         count: 31,  pct: 16.6, color: '#f59e0b', convLabel: s2Txt('% of Total', 'نسبة من الإجمالي'), conv: 16.6, convFrom: s2Txt('of total orders', 'من إجمالي الطلبات'), active: true },
    { id: 'delivered',  label: s2Txt('Delivered', 'تم التسليم'),        count: 94,  pct: 50.3, color: '#00e676', convLabel: s2Txt('% of Total', 'نسبة من الإجمالي'), conv: 50.3, convFrom: s2Txt('of total orders', 'من إجمالي الطلبات') },
    { id: 'failed',     label: s2Txt('Failed', 'فشل'),       count: 26,  pct: 13.9, color: '#ef4444', convLabel: s2Txt('Failure Rate', 'نسبة الفشل'),       conv: 13.9, convFrom: s2Txt('of total orders', 'من إجمالي الطلبات') },
    { id: 'canceled_by_you', label: s2Txt('Canceled by you', 'ملغي بواسطتك'), count: 0, pct: 0, color: '#94a3b8', convLabel: s2Txt('Excluded from NDR', 'مستبعد من NDR'), conv: 0, convFrom: s2Txt('visible only', 'ظاهر فقط') },
  ];

  if (window.TaagerStatus && Array.isArray(window.TaagerStatus.ordered)) {
    STAGES_DEFAULT = window.TaagerStatus.ordered.map(function (meta) {
      var label = window.TaagerStatus.display(meta.bucket, { locale: isAr ? 'ar' : 'en' });
      return {
        id: meta.bucket,
        exactBucket: meta.bucket,
        label: label,
        shortLabel: label,
        count: 0,
        pct: 0,
        color: meta.color || window.TaagerStatus.color(meta.bucket),
        businessGroup: meta.businessGroup,
        convLabel: meta.businessGroup === 'excluded' ? s2Txt('Excluded from NDR', 'مستبعد من NDR') : s2Txt('% of Total', 'نسبة من الإجمالي'),
        conv: 0,
        convFrom: meta.businessGroup === 'excluded' ? s2Txt('visible only', 'ظاهر فقط') : s2Txt('of total orders', 'من إجمالي الطلبات')
      };
    });
  }

  var INSIGHTS_DEFAULT = [
    { color: '#14b8a6', title: s2Txt('Best Stage Performance', 'أفضل مرحلة أداء'),         body: s2Txt('High conversion rate in\nprocessing stage', 'معدل تحويل مرتفع في مرحلة\nقيد المعالجة'),          highlight: null },
    { color: '#ef4444', title: s2Txt('Biggest Drop-off', 'أكبر نقطة تسرب'),          body: s2Txt('From shipping to delivery', 'من الشحن إلى التسليم'),                             highlight: s2Txt('Lost 16.9% of orders', 'فقدان 16.9% من الطلبات') },
    { color: '#f59e0b', title: s2Txt('Shipping Rate', 'نسبة الطلبات قيد الشحن'), body: s2Txt('16.6% of total orders\n31 orders in shipping', '16.6% من إجمالي الطلبات\n31 طلب في الشحن'),         highlight: null },
    { color: '#a855f7', title: s2Txt('Optimization Opp', 'فرصة تحسين'),               body: s2Txt('Improve confirmation speed\nto reduce early-stage orders', 'تحسين سرعة التأكيد لتقليل\nطلبات المرحلة الأولى'),   highlight: null },
  ];

  /* Use passed data or fall back */
  var stages   = (data && data.stages)   ? data.stages   : STAGES_DEFAULT;
  var insights = data ? (Array.isArray(data.insights) ? data.insights : []) : INSIGHTS_DEFAULT;
  var metrics  = (data && data.metrics)  ? data.metrics  : { overallConversion: 13.9, deliveryRate: 50.3, totalDelivery: 187 };
  var rawOrders = data && Array.isArray(data.orders) ? data.orders : [];
  var state = mountEl._s2State || { period: '30' };
  mountEl._s2State = state;

  function pctNum(part, total) { return total > 0 ? parseFloat(((part / total) * 100).toFixed(2)) : 0; }
  function pctLabel(value) {
    var n = Number(value || 0);
    if (n > 0 && n < 0.1) return '<0.1%';
    return (n % 1 === 0 ? n.toFixed(0) : n.toFixed(n < 1 ? 2 : 1)) + '%';
  }
  function raw(value) {
    return window.dashboardI18n ? window.dashboardI18n.raw(value) : value;
  }

  function normalizeStage(s) {
    var share = s.share != null
      ? Number(s.share || 0)
      : (typeof s.pct === 'string' ? Number(String(s.pct).replace(/[^\d.]/g, '')) : Number(s.pct || 0));
    var defaultStage = STAGES_DEFAULT.find(function(ds) { return ds.id === s.id; }) || {};
    return Object.assign({}, defaultStage, s, {
      share: share,
      pct: typeof s.pct === 'string' ? s.pct : pctLabel(share),
      convLabel: s.convLabel || s2Txt('% of Total', 'نسبة من الإجمالي'),
      conv: s.conv != null ? s.conv : share,
      convFrom: s.convFrom || s2Txt('of total orders', 'من إجمالي الطلبات'),
    });
  }

  stages = stages.map(normalizeStage);

  var sourceStages = stages;

  function compactVisibleStages(inputStages) {
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
    function combine(id, label, ids, color, businessGroup) {
      var rows = ids.map(function (id) { return byId[id]; }).filter(Boolean);
      var count = rows.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
      var share = pctNum(count, metrics.netOrderCount || metrics.businessTotalOrders || metrics.statusTotalCount || source.reduce(function (sum, row) {
        return row && row.businessGroup !== 'excluded' ? sum + Number(row.count || 0) : sum;
      }, 0));
      var sar = rows.reduce(function (sum, row) {
        var rawSar = row.profitAfterTax != null ? row.profitAfterTax : row.sar;
        return sum + Number(String(rawSar == null ? 0 : rawSar).replace(/[^\d.-]/g, '') || 0);
      }, 0);
      return normalizeStage({
        id: id,
        label: label,
        shortLabel: label,
        count: count,
        share: share,
        pct: pctLabel(share),
        color: color,
        businessGroup: businessGroup,
        sar: sar ? sar.toLocaleString('en-US', { maximumFractionDigits: 2 }) : undefined
      });
    }
    function confirmationStage() {
      var row = pick('confirmed', { id: 'confirmed', label: s2Txt('Confirmation', 'التأكيد'), color: '#3b82f6', count: 0 });
      var aggregateCount = metrics && metrics.confirmationStatusCount != null
        ? Number(metrics.confirmationStatusCount)
        : (metrics && metrics.confirmedCount != null ? Number(metrics.confirmedCount) : NaN);
      if (!Number.isFinite(aggregateCount)) return normalizeStage(row);
      var total = Number(metrics.statusTotalCount || metrics.netOrderCount || metrics.totalOrders || metrics.businessTotalOrders || 0) || source.reduce(function (sum, stage) {
        return stage && stage.businessGroup !== 'excluded' ? sum + Number(stage.count || 0) : sum;
      }, 0);
      var share = pctNum(aggregateCount, total);
      return normalizeStage(Object.assign({}, row, {
        id: 'confirmed',
        exactBucket: 'confirmed',
        label: s2Txt('Confirmation', 'التأكيد'),
        shortLabel: s2Txt('Confirmation', 'التأكيد'),
        count: aggregateCount,
        share: share,
        pct: pctLabel(share),
        businessGroup: 'confirmation'
      }));
    }
    return [
      normalizeStage(pick('received',        { id: 'received',        label: s2Txt('Order received',       'تم استلام الطلب'),   color: '#3b82f6',  count: 0 })),
      confirmationStage(),
      normalizeStage(pick('waiting',         { id: 'waiting',         label: s2Txt('Awaiting Shipment',     'في انتظار الشحن'),   color: '#64748b',  count: 0 })),
      normalizeStage(pick('on_hold',         { id: 'on_hold',         label: s2Txt('Temporarily Suspended', 'معلق مؤقتًا'),       color: '#64748b',  count: 0 })),
      combine('shipping', s2Txt('Out for delivery', 'قيد التوصيل'), ['shipping', 'delivery_suspended', 'after_sales_progress'], '#f59e0b', 'incoming'),
      normalizeStage(pick('delivered',       { id: 'delivered',       label: s2Txt('Delivered',             'تم التوصيل'),        color: '#00e676',  count: 0 })),
      combine('lost', s2Txt('Failed / Lost', 'فشل / ضائع'), ['customer_refused_confirmation', 'failed', 'return_verified', 'out_of_stock', 'after_sales_done'], '#ef4444', 'lost'),
      normalizeStage(pick('canceled_by_you', { id: 'canceled_by_you', label: s2Txt('Canceled by you',       'ملغي بواسطتك'),      color: '#94a3b8',  count: 0, businessGroup: 'excluded' }))
    ];
  }

  stages = compactVisibleStages(stages);
  var resolvedNetOrders = window.DashboardOrderMetrics
    ? window.DashboardOrderMetrics.netOrders(metrics)
    : Number(metrics.netOrderCount || metrics.businessTotalOrders || metrics.statusTotalCount || 0);
  if (!resolvedNetOrders) {
    resolvedNetOrders = stages.reduce(function (sum, s) {
      return s && s.businessGroup !== 'excluded' ? sum + Number(s.count || 0) : sum;
    }, 0);
  }
  metrics.netOrderCount = resolvedNetOrders;
  metrics.totalOrderCount = Number(metrics.totalOrderCount != null ? metrics.totalOrderCount : metrics.rawTotalOrders || resolvedNetOrders);
  metrics.totalOrders = resolvedNetOrders;
  metrics.totalDelivery = resolvedNetOrders;
  metrics.deliveredCount = metrics.deliveredCount != null ? metrics.deliveredCount : ((stages.find(function (s) { return s.id === 'delivered'; }) || {}).count || 0);
  metrics.failedCount = metrics.failedCount != null ? metrics.failedCount : ((stages.find(function (s) { return s.id === 'lost'; }) || {}).count || 0);
  metrics.deliveryRate = metrics.deliveryRate != null ? metrics.deliveryRate : pctNum(metrics.deliveredCount, metrics.totalOrders);
  metrics.failureRate = metrics.failureRate != null ? metrics.failureRate : pctNum(metrics.failedCount, metrics.totalOrders);
  metrics.overallConversion = metrics.deliveryRate;

  function statusBucket(status) {
    if (window.TaagerStatus) {
      var bucket = window.TaagerStatus.normalize(status).bucket;
      return bucket === 'other' ? 'received' : bucket;
    }
    var s = (status || '').toString().trim().toLowerCase();
    if (s === 'delivered' || s === 'مسلمة') return 'delivered';
    if (s === 'in shipping' || s === 'shipping' || s === 'في الشحن' || s === 'تم الشحن') return 'shipping';
    if (s === 'canceled by you' || s === 'cancelled by you' || s === 'طلب ملغي بواسطتك') return 'canceled_by_you';
    if (s === 'failed' || s === 'مرتجع' || s === 'فشلت' || s === 'فشل التسليم' || s === 'تم التحقق من الإرجاع' || s === 'العميل رفض التأكيد') return 'failed';
    if (s === 'awaiting confirmation' || s === 'pending' || s === 'بانتظار التأكيد') return 'received';
    if (s === 'confirmed' || s === 'مؤكد' || s === 'تم التأكيد') return 'confirmed';
    if (s === 'under processing' || s === 'قيد المعالجة') return 'processing';
    if (s === 'waiting' || s === 'قيد الانتظار' || s === 'بانتظار الشحن') return 'waiting';
    return 'processing';
  }

  function rowDate(row) {
    var raw = row && (row.createdAt || row.date || row.orderDate);
    var d = raw ? new Date(raw) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  }

  function rebuildFromOrders() {
    if (!rawOrders.length) return;
    var days = Number(state.period || 30);
    var latest = rawOrders.reduce(function (max, row) {
      var d = rowDate(row);
      return d && (!max || d > max) ? d : max;
    }, null);
    var start = latest ? new Date(latest.getTime() - ((days - 1) * 86400000)) : null;
    var rows = start ? rawOrders.filter(function (row) {
      var d = rowDate(row); return !d || d >= start;
    }) : rawOrders.slice();
    var counts = {};
    STAGES_DEFAULT.forEach(function (stage) { counts[stage.id] = 0; });
    rows.forEach(function (row) {
      var bucket = statusBucket(row.orderStatus || row.status);
      counts[bucket] = (counts[bucket] || 0) + 1;
    });
    var total = rows.length;
    stages = stages.map(function (stage) {
      var count = counts[stage.id] || 0;
      return normalizeStage(Object.assign({}, stage, {
        count: count, share: pctNum(count, total), pct: pctLabel(pctNum(count, total))
      }));
    });
    metrics.totalOrders = total; metrics.totalDelivery = total;
    metrics.deliveredCount = counts.delivered; metrics.failedCount = counts.failed;
    metrics.deliveryRate = pctNum(counts.delivered, total);
    metrics.failureRate = pctNum(counts.failed, total);
    metrics.overallConversion = metrics.deliveryRate;
  }

  if (!(data && data.metrics && Array.isArray(data.stages))) {
    rebuildFromOrders();
  }

  function buildDynamicInsights() {
    if (insights && insights.length) return insights;
    var activeStages = stages.filter(function (s) {
      return s.businessGroup === 'incoming' || ['received','confirmed','waiting','shipping','delivery_suspended','after_sales_progress'].indexOf(s.id) !== -1;
    });
    var biggest = activeStages.slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); })[0];
    var deliveryColor = window.dashboardRateColor ? window.dashboardRateColor(metrics.deliveryRate || 0) : ((metrics.deliveryRate || 0) >= 40 ? '#22d3ee' : (metrics.deliveryRate || 0) >= 30 ? '#00e676' : (metrics.deliveryRate || 0) >= 20 ? '#f59e0b' : '#ef4444');
    return [
      { color: deliveryColor, title: s2Txt('Delivery Success Rate', 'معدل نجاح التوصيل'), body: Number(metrics.deliveredCount || 0).toLocaleString('en-US') + s2Txt(' successfully delivered out of ', ' شحنة تم تسليمها بنجاح من أصل ') + Number(metrics.totalOrders || 0).toLocaleString('en-US') + s2Txt(' total orders', ' طلب إجمالي'), highlight: pctLabel(metrics.deliveryRate) },
      { color: '#ef4444', title: s2Txt('Unsuccessful Rate', 'معدل فشل التوصيل'), body: Number(metrics.failedCount || 0).toLocaleString('en-US') + s2Txt(' orders failed or returned', ' شحنة فشل توصيلها أو تم إرجاعها'), highlight: pctLabel(metrics.failureRate) },
      { color: biggest ? biggest.color : '#f59e0b', title: s2Txt('Most Active Stage', 'أكثر المراحل نشاطاً'), body: biggest ? s2Txt('Stage "', 'مرحلة "') + biggest.label + s2Txt('" has the most orders with ', '" تحتوي على أكبر عدد من الطلبات بواقع ') + Number(biggest.count || 0).toLocaleString('en-US') + s2Txt(' orders', ' طلب') : s2Txt('No active orders at the moment', 'لا توجد طلبات نشطة حالياً'), highlight: biggest ? biggest.pct : null },
      { color: '#a855f7', title: s2Txt('Current Account', 'بيانات الحساب الحالي'), body: s2Txt('These numbers show performance only for the account selected in the top bar', 'تُظهر هذه الأرقام الأداء الخاص بالحساب المحدد في الشريط العلوي فقط'), highlight: null }
    ];
  }

  function stageCardHtml(s, i) {
    var pctText   = s.pct || pctLabel(s.share);
    var primary   = Number(s.count || 0).toLocaleString('en-US');
    var secondary = pctText;
    var animTo    = Number(s.count || 0);
    var animDec   = 0;
    var suffix    = '';
    var active    = s.active || false;
    var isLight   = document.documentElement.getAttribute('data-theme') === 'light';
    var glowBase, bg, countColor, pctColor, iconBg, iconShadow;
    if (isLight) {
      /* Light mode: white card surface, soft visible outer glow (no ring — border handles the edge) */
      glowBase  = active
        ? '0 0 20px 4px ' + s.color + 'aa, 0 0 44px 8px ' + s.color + '55'
        : '0 0 12px 3px ' + s.color + '66, 0 0 28px 6px ' + s.color + '2e';
      bg        = 'linear-gradient(180deg,' + s.color + '18 0%,' + s.color + '06 28%,#ffffff 50%,' + s.color + '06 72%,' + s.color + '14 100%),#ffffff';
      countColor = '#1e293b';
      pctColor   = '#475569';
      iconBg     = s.color + '18';
      iconShadow = '0 0 14px ' + s.color + 'cc,0 0 28px ' + s.color + '77,inset 0 0 8px ' + s.color + '33';
    } else {
      /* Dark mode: original dark card surface with dark-optimised glow */
      glowBase  = active
        ? '0 0 22px ' + s.color + 'aa, 0 0 50px ' + s.color + '55, inset 0 0 24px ' + s.color + '22'
        : '0 0 14px ' + s.color + '77, 0 0 30px ' + s.color + '30, inset 0 0 18px ' + s.color + '14';
      bg        = 'linear-gradient(180deg,' + s.color + '26 0%,' + s.color + '06 28%,transparent 50%,' + s.color + '06 72%,' + s.color + '1f 100%),#0a0f1c';
      countColor = '#fff';
      pctColor   = 'rgba(255,255,255,0.7)';
      iconBg     = s.color + '22';
      iconShadow = '0 0 16px ' + s.color + 'aa,0 0 32px ' + s.color + '44,inset 0 0 12px ' + s.color + '33';
    }
    /* Icon: use the stage id to pick path, color baked in as explicit hex */
    var iconKey = PATHS[s.id] ? s.id : 'intake';
    var iconHtml = svgIcon(PATHS[iconKey], s.color, 22);

    return '<div class="s2-stage-wrapper fade-up" style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;animation-delay:' + (i * 80) + 'ms;">' +
      '<div class="s2-stage-label" style="font-size:var(--type-control);font-weight:var(--weight-semibold);margin-bottom:12px;white-space:nowrap;color:' + s.color + ';text-shadow:' + (isLight ? 'none' : '0 0 10px ' + s.color + '77') + ';">' + s.label + window.supposedBadgeHtml(s.label) + '</div>' +
      '<div class="s2-stage-card" style="position:relative;width:92%;height:220px;border-radius:var(--dash-radius-xl);transform:skewX(-6deg);background:' + bg + ';border:1.5px solid ' + s.color + ';box-shadow:' + glowBase + ';">' +
        '<div class="s2-card-inner" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:24px 8px;box-sizing:border-box;transform:skewX(6deg);">' +
          '<div class="s2-card-top" style="text-align:center;margin-top:8px;">' +
            '<div class="s2-count s2-count-num" data-to="' + animTo + '" data-decimals="' + animDec + '" data-suffix="' + suffix + '" style="font-size:var(--type-hero);font-weight:var(--weight-bold);color:' + countColor + ';line-height:1;letter-spacing:-2px;">' + primary + '</div>' +
            '<div class="s2-pct-text" style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:' + pctColor + ';margin-top:8px;letter-spacing:1px;">' + secondary + '</div>' +
          '</div>' +
          '<div class="s2-icon-wrap" style="width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:8px;flex-shrink:0;background:' + iconBg + ';border:1.5px solid ' + s.color + 'cc;box-shadow:' + iconShadow + ';">' +
            iconHtml +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ── Chevron HTML ────────────────────────────────────────────────────────── */
  function chevronHtml(leftColor, rightColor) {
    var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var p1 = isRtl ? '11,3 5,9 11,15' : '15,3 21,9 15,15';
    var p2 = isRtl ? '21,3 15,9 21,15' : '5,3 11,9 5,15';
    /* SVG uses overflow="visible" so drop-shadow bleeds beyond the viewBox bounds
       without creating a rectangular clip. The filter is defined inline via <defs>
       and applied per-polyline so each chevron glows in its own color. */
    var uid = Math.random().toString(36).slice(2, 7);
    var f1 = 'chf1_' + uid;
    var f2 = 'chf2_' + uid;
    return '<div class="s2-chevron" style="flex-shrink:0;width:26px;display:flex;align-items:center;justify-content:center;height:220px;margin-top:25px;">' +
      '<svg width="26" height="18" viewBox="0 0 26 18" fill="none" overflow="visible" style="overflow:visible;">' +
        '<defs>' +
          '<filter id="' + f1 + '" x="-80%" y="-80%" width="260%" height="260%">' +
            '<feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>' +
            '<feFlood flood-color="' + leftColor  + '" flood-opacity="0.9" result="color"/>' +
            '<feComposite in="color" in2="blur" operator="in" result="glow"/>' +
            '<feMerge><feMergeNode in="glow"/><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>' +
          '</filter>' +
          '<filter id="' + f2 + '" x="-80%" y="-80%" width="260%" height="260%">' +
            '<feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>' +
            '<feFlood flood-color="' + rightColor + '" flood-opacity="0.9" result="color"/>' +
            '<feComposite in="color" in2="blur" operator="in" result="glow"/>' +
            '<feMerge><feMergeNode in="glow"/><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>' +
          '</filter>' +
        '</defs>' +
        '<polyline points="' + p1 + '" stroke="' + leftColor  + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#' + f1 + ')"/>' +
        '<polyline points="' + p2 + '" stroke="' + rightColor + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#' + f2 + ')"/>' +
      '</svg>' +
    '</div>';
  }

  /* ── Conversion card HTML ────────────────────────────────────────────────── */
  function convCardHtml(s, i) {
    var convText = s.conv == null ? '—' : pctLabel(s.conv);
    return '<div class="s2-conv-card fade-up" style="flex:1;min-width:0;background:var(--dash-surface);border:1px solid rgba(255,255,255,0.10);border-radius:var(--dash-radius-md);padding:10px 12px;text-align:center;animation-delay:' + (500 + i * 60) + 'ms;">' +
      '<div class="s2-conv-label" style="font-size:var(--type-caption);color:var(--dash-text-faint);margin-bottom:4px;">' + s.convLabel + '</div>' +
      '<div class="s2-conv-value" style="font-size:var(--type-section-title);font-weight:var(--weight-semibold);line-height:1;margin-bottom:6px;color:' + s.color + ';">' + convText + '</div>' +
      '<div class="s2-conv-from" style="font-size:var(--type-micro);color:var(--dash-text-faint);">' + s.convFrom + '</div>' +
    '</div>';
  }

  /* ── Metric card HTML ────────────────────────────────────────────────────── */
  function metricCardHtml(iconKey, color, label, value, sub, isPercent, animId, delay) {
    var isRtl     = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var textAlign = isRtl ? 'right' : 'left';
    var rowDir    = isRtl ? 'row-reverse' : 'row';
    var iconHtml  = svgIcon(PATHS[iconKey] || PATHS.bag, color, 30);
    return '<div class="s2-metric-card fade-up" style="flex:1;min-width:0;background:var(--dash-surface);border:1px solid rgba(255,255,255,0.10);border-radius:var(--dash-radius-xl);padding:32px;display:flex;align-items:center;gap:24px;flex-direction:' + rowDir + ';animation-delay:' + delay + 'ms;box-shadow:inset 0 0 30px ' + color + '08;">' +
      '<div class="s2-metric-text" style="flex:1;text-align:' + textAlign + ';">' +
        '<div class="s2-metric-label" style="font-size:var(--type-body);color:var(--dash-text-muted);font-weight:var(--weight-semibold);margin-bottom:8px;">' + label + window.supposedBadgeHtml(label) + '</div>' +
        '<div class="s2-metric s2-metric-value" data-to="' + value + '" data-decimals="' + (isPercent ? '1' : '0') + '" data-suffix="' + (isPercent ? '%' : '') + '" id="' + animId + '" style="font-size:var(--type-hero);font-weight:var(--weight-semibold);line-height:1;letter-spacing:-2px;color:' + color + ';text-shadow:0 0 20px ' + color + '55;">0</div>' +
        '<div class="s2-metric-sub" style="font-size:var(--type-label);color:var(--dash-text-faint);margin-top:8px;">' + sub + '</div>' +
      '</div>' +
      '<div class="s2-metric-icon" style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:radial-gradient(circle,' + color + '28 0%,' + color + '0a 70%);border:1.5px solid ' + color + ';box-shadow:0 0 22px ' + color + '66,0 0 40px ' + color + '33,inset 0 0 16px ' + color + '33;">' +
        iconHtml +
      '</div>' +
    '</div>';
  }

  function stageCount(ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    return stages.reduce(function (sum, stage) {
      return ids.indexOf(stage.id) !== -1 ? sum + Number(stage.count || 0) : sum;
    }, 0);
  }

  function sourceStageCount(ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    return (Array.isArray(sourceStages) ? sourceStages : []).reduce(function (sum, stage) {
      return stage && ids.indexOf(stage.id) !== -1 ? sum + Number(stage.count || 0) : sum;
    }, 0);
  }

  function analyticsCardHtml(iconKey, color, label, value, sub, suffix, animId, delay) {
    var isRtl     = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var textAlign = isRtl ? 'right' : 'left';
    var rowDir    = isRtl ? 'row-reverse' : 'row';
    return '<div class="s2-analytics-card fade-up" style="min-width:0;background:var(--dash-surface);border:1px solid ' + color + '38;border-radius:var(--dash-radius-lg);padding:16px 18px;display:flex;align-items:center;gap:14px;flex-direction:' + rowDir + ';animation-delay:' + delay + 'ms;box-shadow:inset 0 0 24px ' + color + '08;">' +
      '<div style="width:42px;height:42px;border-radius:var(--dash-radius-md);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + color + '18;border:1px solid ' + color + '55;color:' + color + ';">' +
        svgIcon(PATHS[iconKey] || PATHS.barChart, color, 20) +
      '</div>' +
      '<div style="min-width:0;flex:1;text-align:' + textAlign + ';">' +
        '<div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.48);margin-bottom:7px;">' + label + window.supposedBadgeHtml(label) + '</div>' +
        '<div class="s2-metric s2-analytics-value" data-to="' + value + '" data-decimals="' + (suffix === '%' ? '1' : '0') + '" data-suffix="' + (suffix || '') + '" id="' + animId + '" style="font-size:var(--type-page-title);font-weight:var(--weight-semibold);line-height:1;color:#fff;font-variant-numeric:tabular-nums;">0</div>' +
        '<div style="font-size:var(--type-caption);color:rgba(255,255,255,0.42);margin-top:7px;line-height:1.35;">' + sub + '</div>' +
      '</div>' +
    '</div>';
  }

  function buildAnalyticsCards() {
    var total = Number(metrics.netOrderCount || 0);
    var activeCount = metrics.activeCount != null ? Number(metrics.activeCount || 0) : sourceStageCount(['received', 'confirmed', 'processing', 'waiting', 'shipping']);
    var preShipCount = sourceStageCount(['received', 'confirmed', 'processing', 'waiting']);
    var shippingCount = sourceStageCount('shipping') || stageCount('shipping');
    var deliveredCount = Number(metrics.deliveredCount || stageCount('delivered') || 0);
    var failedCount = Number(metrics.failedCount || stageCount('lost') || 0);
    var resolvedCount = deliveredCount + failedCount;
    var activePct = pctNum(activeCount, total);
    var shippingPct = pctNum(shippingCount, total);
    var outcomeQuality = resolvedCount > 0 ? pctNum(deliveredCount, resolvedCount) : 0;
    return [
      {
        icon: 'barChart',
        color: '#22d3ee',
        label: s2Txt('Active Orders', 'طلبات نشطة'),
        value: activeCount,
        suffix: '',
        sub: pctLabel(activePct) + s2Txt(' in progress (Received, Confirmed, Awaiting, Shipped)', ' قيد المتابعة (المستلمة، المؤكدة، بانتظار الشحن، وقيد التوصيل)')
      },
      {
        icon: 'receivedClock',
        color: '#a855f7',
        label: s2Txt('Pending Shipping', 'بانتظار الشحن'),
        value: preShipCount,
        suffix: '',
        sub: s2Txt('Confirmed orders waiting to be shipped', 'طلبات مؤكدة في انتظار تسليمها لشركة الشحن')
      },
      {
        icon: 'shipping',
        color: '#f59e0b',
        label: s2Txt('Out for Delivery Rate', 'نسبة الشحنات الجارية'),
        value: shippingPct,
        suffix: '%',
        sub: Number(shippingCount || 0).toLocaleString('en-US') + s2Txt(' orders currently with courier', ' طلبات مع شركة الشحن حالياً')
      },
      {
        icon: 'confirmed',
        color: window.dashboardRateColor ? window.dashboardRateColor(outcomeQuality) : '#00e676',
        label: s2Txt('Net Success Rate', 'معدل النجاح الصافي'),
        value: outcomeQuality,
        suffix: '%',
        sub: s2Txt('Delivery success of completed orders', 'نسبة نجاح التوصيل للطلبات المغلقة')
      }
    ];
  }

  /* ── Insight item HTML ───────────────────────────────────────────────────── */
  function insightHtml(ins, i) {
    var isRtl     = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var textAlign = isRtl ? 'right' : 'left';
    var rowDir    = isRtl ? 'row-reverse' : 'row';
    var iconKey   = INSIGHT_ICON_KEYS[i] || 'barChart';
    /* If caller passed iconSvg as a raw <svg> with explicit colors, use it; otherwise build from PATHS */
    var iconHtml;
    if (ins.iconSvg && !ins.iconSvg.includes('currentColor')) {
      iconHtml = ins.iconSvg;
    } else {
      iconHtml = svgIcon(PATHS[iconKey], ins.color, 24);
    }
    var bodyEscaped = ins.body.replace(/\n/g, '<br>');
    return '<div class="s2-insight-item fade-up" style="flex:1;min-width:0;display:flex;align-items:flex-start;gap:16px;padding:20px;flex-direction:' + rowDir + ';animation-delay:' + (700 + i * 80) + 'ms;">' +
      '<div class="s2-insight-icon" style="width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:radial-gradient(circle,' + ins.color + '28 0%,' + ins.color + '08 70%);border:1.5px solid ' + ins.color + ';box-shadow:0 0 18px ' + ins.color + '66,0 0 36px ' + ins.color + '33,inset 0 0 12px ' + ins.color + '33;">' +
        iconHtml +
      '</div>' +
      '<div class="s2-insight-text" style="flex:1;text-align:' + textAlign + ';">' +
        '<div class="s2-insight-title" style="font-size:var(--type-body);font-weight:var(--weight-semibold);margin-bottom:8px;color:' + ins.color + ';text-shadow:0 0 12px ' + ins.color + '55;">' + ins.title + '</div>' +
        '<div class="s2-insight-body" style="font-size:var(--type-label);color:var(--dash-text-muted);line-height:1.6;">' + bodyEscaped + '</div>' +
        (ins.highlight ? '<div class="s2-insight-highlight" style="font-size:var(--type-control);font-weight:var(--weight-semibold);margin-top:6px;color:' + ins.color + ';">' + ins.highlight + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  /* ── Assemble funnel rows ─────────────────────────────────────────────────── */
  var stageCardsHtml = '', dottedRowHtml = '', convRowHtml = '';

  stages.forEach(function (s, i) {
    stageCardsHtml += stageCardHtml(s, i);
    if (i < stages.length - 1) stageCardsHtml += chevronHtml(stages[i + 1].color, s.color);

    dottedRowHtml += '<div style="flex:1;min-width:0;display:flex;justify-content:center;">' +
      '<div style="width:1px;height:100%;background:repeating-linear-gradient(to bottom,' + s.color + '99 0 3px,transparent 3px 7px);"></div>' +
    '</div>';
    if (i < stages.length - 1) dottedRowHtml += '<div style="width:26px;flex-shrink:0;"></div>';

    convRowHtml += convCardHtml(s, i);
    if (i < stages.length - 1) convRowHtml += '<div style="width:26px;flex-shrink:0;"></div>';
  });

  var isRtl  = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
  var dirStr = isRtl ? 'rtl' : 'ltr';

  /* ── Full HTML ───────────────────────────────────────────────────────────── */
  var html =
    '<div class="dash-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;background:var(--dash-bg);direction:' + dirStr + ';">' +

      '<div class="s2-header" style="padding:32px 40px;display:flex;flex-direction:row;justify-content:space-between;align-items:center;gap:16px;">' +
        '<div style="text-align:' + (isRtl ? 'right' : 'left') + ';flex:1;">' +
          '<h1 id="s2-h1" style="font-size:var(--type-display);font-weight:var(--weight-bold);color:var(--dash-text,#fff);margin:0;line-height:1.15;opacity:0;transform:translateY(-8px);transition:opacity 0.4s ease,transform 0.4s ease;">' + s2Txt('Status Pipeline', 'مسار الحالات') + '</h1>' +
          '<div id="s2-sub" style="display:flex;align-items:center;gap:8px;font-size:var(--type-control);color:var(--dash-text-faint,rgba(255,255,255,0.5));margin-top:8px;justify-content:flex-' + (isRtl ? 'end' : 'start') + ';flex-direction:' + (isRtl ? 'row-reverse' : 'row') + ';opacity:0;transition:opacity 0.4s ease 0.12s;">' +
            s2Txt('Track order status and performance from creation to final delivery', 'تتبع حالة وأداء الطلبات من لحظة استلامها وحتى وصولها النهائي للعميل') +
            svgIcon(PATHS.info, '#3b82f6', 14) +
          '</div>' +
        '</div>' +

        '<div style="display:flex;flex-direction:column;gap:12px;align-items:flex-' + (isRtl ? 'end' : 'start') + ';">' +
          '<div id="s2-period-select-wrap" style="width:154px;min-height:42px;"></div>' +
        '</div>' +
      '</div>' +

      '<div class="s2-body" style="padding:0 0 40px;flex:1;">' +
        '<div class="s2-funnel-scroll" style="margin-bottom:24px;overflow-x:auto;padding-bottom:16px;">' +
          '<div class="s2-funnel-inner" style="min-width:860px;width:100%;direction:' + dirStr + ';padding:0 40px;box-sizing:border-box;">' +
            '<div class="s2-stage-row" style="display:flex;align-items:stretch;margin-bottom:16px;">' + stageCardsHtml + '</div>' +
            '<div class="s2-dotted-row" style="display:flex;margin-bottom:8px;height:18px;">'          + dottedRowHtml  + '</div>' +
            '<div class="s2-conv-row" style="display:flex;align-items:stretch;">'                    + convRowHtml    + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="s2-lower" style="padding:0 40px;display:flex;flex-direction:column;gap:24px;">' +
          '<div class="s2-metrics-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">' +
            metricCardHtml('bag',      '#3b82f6', s2Txt('Total Orders', 'إجمالي الطلبات'),       metrics.totalOrders,  s2Txt('across all stages', 'في جميع المراحل'),    false, 's2-m0', 300) +
            metricCardHtml('trendUp',  (window.dashboardRateColor ? window.dashboardRateColor(metrics.deliveryRate || 0) : ((metrics.deliveryRate || 0) >= 40 ? '#22d3ee' : (metrics.deliveryRate || 0) >= 30 ? '#00e676' : (metrics.deliveryRate || 0) >= 20 ? '#f59e0b' : '#ef4444')), s2Txt('Final Delivery Rate', 'معدل التسليم النهائي'),  metrics.deliveryRate, Number(metrics.deliveredCount || 0).toLocaleString('en-US') + s2Txt(' delivered orders', ' طلب تم تسليمها'), true, 's2-m1', 300) +
            metricCardHtml('xCircle',  '#ef4444', s2Txt('Overall Failure Rate', 'معدل الفشل الإجمالي'),  metrics.failureRate,  Number(metrics.failedCount    || 0).toLocaleString('en-US') + s2Txt(' orders', ' طلب'),            true, 's2-m2', 300) +
          '</div>' +

          '<div class="s2-analytics-box fade-up" style="background:var(--dash-surface);border:1px solid rgba(255,255,255,0.10);border-radius:var(--dash-radius-xl);padding:22px;animation-delay:500ms;">' +
            '<div style="display:flex;align-items:center;gap:10px;justify-content:flex-' + (isRtl ? 'end' : 'start') + ';margin-bottom:14px;flex-direction:' + (isRtl ? 'row-reverse' : 'row') + ';">' +
              svgIcon(PATHS.barChart, '#22d3ee', 18) +
              '<span style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:#fff;">' + s2Txt('Order Analytics & Funnel', 'تحليلات وحالة الطلبات') + '</span>' +
            '</div>' +
            '<div class="s2-analytics-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">' +
              buildAnalyticsCards().map(function (card, i) {
                return analyticsCardHtml(card.icon, card.color, card.label, card.value, card.sub, card.suffix, 's2-a' + i, 520 + i * 70);
              }).join('') +
            '</div>' +
          '</div>' +

          '<div class="s2-insights-box fade-up" style="background:var(--dash-surface);border:1px solid rgba(255,255,255,0.10);border-radius:var(--dash-radius-xl);padding:28px;animation-delay:600ms;">' +
            '<div class="s2-insights-head" style="display:flex;align-items:center;gap:10px;justify-content:flex-' + (isRtl ? 'end' : 'start') + ';margin-bottom:16px;flex-direction:' + (isRtl ? 'row-reverse' : 'row') + ';">' +
              '<span style="font-size:var(--type-metric-sm);color:#a855f7;text-shadow:0 0 12px #a855f7aa;">✦</span>' +
              '<span style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:#fff;letter-spacing:0.5px;">' + s2Txt('Quick Insights', 'رؤى سريعة') + '</span>' +
            '</div>' +
            '<div class="s2-insights-grid" style="display:flex;flex-wrap:nowrap;border-top:1px solid rgba(255,255,255,0.05);">' +
              buildDynamicInsights().map(function (ins, i) { return insightHtml(ins, i); }).join(
                '<div class="s2-insight-sep" style="width:1px;background:rgba(255,255,255,0.05);margin:12px 0;"></div>'
              ) +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* ── Inject ──────────────────────────────────────────────────────────────── */
  mountEl.innerHTML = html;

  var periodOptions = [
    { value: '7', label: raw(s2Txt('Last 7 days', 'عرض 7 أيام')) },
    { value: '14', label: raw(s2Txt('Last 14 days', 'عرض 14 يوم')) },
    { value: '30', label: raw(s2Txt('Last 30 days', 'عرض 30 يوم')) }
  ];
  var periodWrap = mountEl.querySelector('#s2-period-select-wrap');
  if (periodWrap && window.renderCustomSelect) {
    window.renderCustomSelect(periodWrap, periodOptions, state.period, function (value) {
      mountEl._s2State = Object.assign({}, mountEl._s2State || state, { period: value });
      window.renderSection2(mountEl, data, ctx);
    }, { ariaLabel: raw(s2Txt('Last 30 days', 'عرض 30 يوم')) });
  } else if (periodWrap) {
    periodWrap.innerHTML =
      '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.9);font-size:var(--type-control);font-weight:var(--weight-semibold);font-family:inherit;flex-direction:' + (isRtl ? 'row-reverse' : 'row') + ';">' +
        svgIcon(PATHS.calendar, 'rgba(255,255,255,0.6)', 16) +
        '<select id="s2-period-select" style="background:transparent;border:none;color:#fff;outline:none;font:inherit;cursor:pointer;">' +
          periodOptions.map(function (opt) {
            return '<option value="' + opt.value + '"' + (state.period === opt.value ? ' selected' : '') + '>' + opt.label + '</option>';
          }).join('') +
        '</select>' +
      '</label>';
    var periodSelect = mountEl.querySelector('#s2-period-select');
    if (periodSelect) periodSelect.addEventListener('change', function () {
      mountEl._s2State = Object.assign({}, mountEl._s2State || state, { period: periodSelect.value });
      window.renderSection2(mountEl, data, ctx);
    });
  }

  /* ── Post-injection animations ───────────────────────────────────────────── */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var h1  = document.getElementById('s2-h1');
      var sub = document.getElementById('s2-sub');
      if (h1)  { h1.style.opacity = '1'; h1.style.transform = 'translateY(0)'; }
      if (sub) { sub.style.opacity = '1'; }

      mountEl.querySelectorAll('.s2-count[data-to]').forEach(function (el) {
        var to = parseFloat(el.getAttribute('data-to'));
        var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        var suffix = el.getAttribute('data-suffix') || '';
        if (suffix) {
          (function (elem, target, dec, sfx) {
            var start = performance.now();
            function tick(now) {
              var t = Math.min(1, (now - start) / 1400);
              var eased = 1 - Math.pow(1 - t, 3);
              elem.textContent = (target * eased).toFixed(dec).replace(/\.0$/, '') + sfx;
              if (t < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
          }(el, to, decimals, suffix));
        } else {
          window.animateNumber(el, to, { duration: 1400 });
        }
      });

      mountEl.querySelectorAll('.s2-metric[data-to]').forEach(function (el) {
        var to       = parseFloat(el.getAttribute('data-to'));
        var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        var suffix   = el.getAttribute('data-suffix') || '';
        if (suffix) {
          (function (elem, target, dec, sfx) {
            var start = performance.now();
            function tick(now) {
              var t = Math.min(1, (now - start) / 1400);
              var eased = 1 - Math.pow(1 - t, 3);
              elem.textContent = (target * eased).toFixed(dec) + sfx;
              if (t < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
          }(el, to, decimals, suffix));
        } else {
          window.animateNumber(el, to, { duration: 1400, decimals: decimals });
        }
      });
    });
  });

  /* ── Theme-change observer: re-render when data-theme toggles ────────────────── */
  if (mountEl._s2ThemeObserver) {
    mountEl._s2ThemeObserver.disconnect();
    mountEl._s2ThemeObserver = null;
  }
  var _s2ThemeObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === 'data-theme') {
        var shellEl = mountEl.closest && mountEl.closest('.dash-shell');
        if (!shellEl || shellEl._dashboardActiveSection !== 'pipeline') return;
        window.renderSection2(mountEl, data, ctx);
        return;
      }
    }
  });
  _s2ThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mountEl._s2ThemeObserver = _s2ThemeObserver;
};
