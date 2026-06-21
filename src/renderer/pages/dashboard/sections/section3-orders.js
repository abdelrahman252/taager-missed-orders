/* ══════════════════════════════════════════════════════════════════════════════
   section3-orders.js
   Renders Section 3 — الطلبات (Orders table + mini pipeline)

   window.renderSection3(mountEl, data, ctx)
     mountEl  — the <div> to inject HTML into (cleared first)
     data     — data.orders  (shape: { stages[], kpis[], orders[] })
     ctx      — { onNavigate, accent, formatSAR }

   Depends on:
     dashboard-shared.js  → sectionTopBar, animateNumber
     dashboard-styles.css → .fade-up, @keyframes fadeUp
   ══════════════════════════════════════════════════════════════════════════════ */

window.renderSection3 = function (mountEl, data, ctx) {
  'use strict';

  var tx = window.dashboardI18n ? window.dashboardI18n.raw.bind(window.dashboardI18n) : function (s) { return s; };
  var tt = window.dashboardI18n ? window.dashboardI18n.t.bind(window.dashboardI18n) : function (s) { return s; };
  var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
  var activeCurrency = data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || 'SAR';

  /* ── Inline SVG helpers ──────────────────────────────────────────────────── */
  function productThumbSvg(type, iconColor) {
    var icons = {
      cream: '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="2.5" rx="1" fill="' + iconColor + '"/><rect x="4" y="8" width="16" height="13" rx="2" fill="none" stroke="' + iconColor + '" stroke-width="1.5"/><ellipse cx="12" cy="14" rx="3.5" ry="1.6" fill="' + iconColor + '" opacity="0.35"/></svg>',
      serum: '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="10" y="2" width="4" height="2" rx="0.4" fill="' + iconColor + '"/><rect x="9" y="4" width="6" height="3" rx="0.4" fill="none" stroke="' + iconColor + '" stroke-width="1.3"/><path d="M 9.5 7 L 7 11 L 7 21 L 17 21 L 17 11 L 14.5 7 Z" fill="none" stroke="' + iconColor + '" stroke-width="1.5" stroke-linejoin="round"/><line x1="8" y1="16" x2="16" y2="16" stroke="' + iconColor + '" stroke-width="1" opacity="0.5"/></svg>',
      set:   '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="9" rx="1" fill="none" stroke="' + iconColor + '" stroke-width="1.4"/><rect x="13" y="3" width="8" height="9" rx="1" fill="none" stroke="' + iconColor + '" stroke-width="1.4"/><rect x="3" y="14" width="8" height="7" rx="1" fill="none" stroke="' + iconColor + '" stroke-width="1.4"/><rect x="13" y="14" width="8" height="7" rx="1" fill="none" stroke="' + iconColor + '" stroke-width="1.4"/></svg>',
      oil:   '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="10" y="2" width="4" height="3" fill="' + iconColor + '"/><path d="M 10 5 L 8 9 L 8 21 L 16 21 L 16 9 L 14 5 Z" fill="none" stroke="' + iconColor + '" stroke-width="1.5" stroke-linejoin="round"/><rect x="9.5" y="13" width="5" height="6" fill="' + iconColor + '" opacity="0.3" rx="0.4"/></svg>',
      eye:   '<svg width="22" height="22" viewBox="0 0 24 24"><ellipse cx="12" cy="8" rx="6.5" ry="1.6" fill="' + iconColor + '"/><path d="M 5.5 9 L 5.5 19 C 5.5 20.1 6.4 21 7.5 21 L 16.5 21 C 17.6 21 18.5 20.1 18.5 19 L 18.5 9" fill="none" stroke="' + iconColor + '" stroke-width="1.5"/><circle cx="12" cy="14" r="2" fill="' + iconColor + '" opacity="0.4"/></svg>',
    };
    return icons[type] || icons.cream;
  }

  var PRODUCT_COLORS = {
    cream: ['#ffd7e8', '#ec4899'],
    serum: ['#cfe1ff', '#3b82f6'],
    set:   ['#fde8a8', '#f59e0b'],
    oil:   ['#fdf3a8', '#ca8a04'],
    eye:   ['#d8def8', '#6366f1'],
  };

  function productThumb(type, size) {
    size = size || 36;
    var colors = PRODUCT_COLORS[type] || PRODUCT_COLORS.cream;
    var ic = colors[0], pc = colors[1];
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(135deg,' + pc + '33 0%,' + pc + '10 60%,rgba(255,255,255,0.02) 100%);' +
      'border:1px solid ' + pc + '44;">' +
      productThumbSvg(type, ic) +
    '</div>';
  }

  /* ── Status pill colours ─────────────────────────────────────────────────── */
  var STATUS_COLORS = {
    'في الشحن':       '#14b8a6',
    'تم الشحن':       '#14b8a6',
    'مؤكد':          '#a855f7',
    'مسلمة':         '#00e676',
    'بانتظار الشحن': '#3b82f6',
    'قيد المعالجة': '#3b82f6',
    'فشل':    '#ef4444',
    'طلب ملغي بواسطتك': '#94a3b8',
  };
  function statusColor(s) {
    return window.TaagerStatus ? window.TaagerStatus.color(s) : (STATUS_COLORS[s] || '#8892a4');
  }

  function statusPill(status) {
    var c = statusColor(status);
    return '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:100px;font-size:11px;font-weight:700;white-space:nowrap;flex-direction:row-reverse;' +
      'background:' + c + '1a;border:1px solid ' + c + '55;color:' + c + ';">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:' + c + ';box-shadow:0 0 6px ' + c + ',0 0 12px ' + c + '77;"></span>' +
      status +
    '</span>';
  }

  /* ── Default data ────────────────────────────────────────────────────────── */
  var STAGES_DEFAULT = [
    { id: 'intake',    label: tx('تم الاستلام'),    shortLabel: tx('الاستلام'),   count: 0, pct: 100,  color: '#4f7df6',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' },
    { id: 'received',  label: tx('تم استلام الطلب'), shortLabel: tx('استلام الطلب'),   count: 0,   pct: 0,  color: '#3b82f6',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    { id: 'confirmed', label: tx('مؤكد'),             shortLabel: tx('مؤكد'),      count: 0,  pct: 0,  color: '#4f55e0',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
    { id: 'shipping',  label: tx('في الشحن'),         shortLabel: tx('الشحن'),     count: 0,  pct: 0, color: '#14b8a6',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' },
    { id: 'delivered', label: tx('تم التسليم'),        shortLabel: tx('التسليم'),   count: 0,  pct: 0, color: '#00e676',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' },
    { id: 'failed',    label: tx('فشل'),       shortLabel: tx('فشل'),      count: 0,  pct: 0, color: '#ef4444',
      iconSvg: '<svg viewBox="0 0 512 512" fill="currentColor" width="16" height="16"><path d="M256 512A256 256 0 100 256a256 256 0 000 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>' },
  ];

  if (window.TaagerStatus && Array.isArray(window.TaagerStatus.ordered)) {
    STAGES_DEFAULT = window.TaagerStatus.ordered.map(function (meta) {
      var label = window.TaagerStatus.display(meta.bucket, { locale: isRtl ? 'ar' : 'en' });
      return {
        id: exactStatusId(meta.bucket),
        exactBucket: meta.bucket,
        label: label,
        shortLabel: label,
        count: 0,
        pct: 0,
        color: meta.color || window.TaagerStatus.color(meta.bucket),
        businessGroup: meta.businessGroup,
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/></svg>'
      };
    });
  }

  var KPIS_DEFAULT = [
    { color: '#14b8a6', label: tx('إجمالي قيمة الطلبات'),     value: 0,   unit: activeCurrency, sub: 'جاري الحساب...',              decimals: 0, positive: false,
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>' },
    { color: '#14b8a6', label: tx(isRtl ? 'إجمالي الربح بعد الضريبة' : 'Total Profit After Tax'), value: 0,   unit: activeCurrency, sub: 'جاري الحساب...',            decimals: 0, positive: false,
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' },
    { color: '#00e676', label: tx('متوسط قيمة الطلب'),        value: 0, unit: activeCurrency, sub: 'جاري الحساب...',       decimals: 2, positive: true,
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' },
    { color: '#14b8a6', label: tx('متوسط وقت الشحن'),         value: 0,    unit: '', sub: 'جاري الحساب...',          decimals: 1, positive: false,
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
  ];

  var ORDERS_DEFAULT = [];

  var stages  = (data && data.stages)  ? data.stages  : STAGES_DEFAULT;
  var kpis    = (data && data.kpis)    ? data.kpis    : KPIS_DEFAULT;
  var orders  = (data && data.orders)  ? data.orders  : ORDERS_DEFAULT;
  var outcomeOrders = (data && data.outcomeOrders) ? data.outcomeOrders : orders;
  function moneyValue(value) {
    if (window.TaagerStatus && typeof window.TaagerStatus.moneyValue === 'function') {
      var n = window.TaagerStatus.moneyValue(value);
      return n == null ? 0 : n;
    }
    var parsed = Number(value || 0);
    return isFinite(parsed) ? parsed : 0;
  }
  var STAGE_TEMPLATE_BY_ID = {};
  STAGES_DEFAULT.forEach(function (s) {
    STAGE_TEMPLATE_BY_ID[s.id] = s;
    if (s.exactBucket) STAGE_TEMPLATE_BY_ID[s.exactBucket] = s;
  });
  var EXTRA_STAGE_TEMPLATES = {
    processing: { id: 'processing', label: tx('قيد المعالجة'), shortLabel: tx('المعالجة'), count: 0, pct: 0, color: '#3b82f6',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' },
    waiting: { id: 'waiting', label: tx('قيد الانتظار'), shortLabel: tx('الانتظار'), count: 0, pct: 0, color: '#64748b',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' }
  };
  Object.keys(EXTRA_STAGE_TEMPLATES).forEach(function (id) { STAGE_TEMPLATE_BY_ID[id] = EXTRA_STAGE_TEMPLATES[id]; });
  var FALLBACK_STAGE_TEMPLATE = STAGE_TEMPLATE_BY_ID.intake ||
    STAGE_TEMPLATE_BY_ID.received ||
    STAGE_TEMPLATE_BY_ID[exactStatusId('received')] ||
    STAGES_DEFAULT[0] || {
      id: 'received',
      label: tx('تم استلام الطلب'),
      shortLabel: tx('استلام الطلب'),
      count: 0,
      pct: 0,
      color: '#3b82f6',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/></svg>'
    };
  var STAGE_ORDER = window.TaagerStatus && Array.isArray(window.TaagerStatus.ordered)
    ? window.TaagerStatus.ordered.map(function (meta) { return exactStatusId(meta.bucket); })
    : ['received', 'confirmed', 'waiting', 'shipping', 'delivered', 'failed', 'canceled_by_you'];
  var STAGES_BY_ID = {};
  stages.forEach(function (stage) {
    if (stage && stage.id) STAGES_BY_ID[stage.id] = stage;
  });

  function normalizeOrderArray(sourceRows, normalizer, cacheKey) {
    if (!Array.isArray(sourceRows)) return [];
    var root = window.__s3OrderNormalizationCache;
    if (!root || typeof WeakMap === 'undefined') {
      root = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
      window.__s3OrderNormalizationCache = root;
    }
    if (!root) return sourceRows.map(normalizer);
    var entry = root.get(sourceRows);
    if (!entry) {
      entry = {};
      root.set(sourceRows, entry);
    }
    var cached = entry[cacheKey];
    if (cached && cached.length === sourceRows.length) return cached.rows;
    var rows = sourceRows.map(normalizer);
    entry[cacheKey] = { length: sourceRows.length, rows: rows };
    return rows;
  }
  if (data && data.orders) {
    function normalizeOrder(o) {
      var total = moneyValue(o.dashboardTotalPrice != null ? o.dashboardTotalPrice : (o.totalPrice || o.total || o.orderValue || 0));
      // Taager dashboard/status/NDR migration:
      // The commission variable is a compatibility name for Taager profit = order profit - tax profit.
      var commission = moneyValue(o.taagerProfit || o.profitAfterTax || o.profitAfterFees || o.marketerCommission || o.commission || 0);
      
      var rawId = o.taagerOrderNumber || o.easyOrderNumber || o.orderNumber || o.id || '';
      var cleanId = typeof rawId === 'string' && rawId.startsWith('#') ? rawId : '#' + rawId;
      
      var isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
      var customer = o.customerName || o.name || o.customer || (isAr ? 'عميل غير معروف' : 'Unknown Customer');
      var city = o.city || 'الرياض';
      var product = o.products || o.product || (isAr ? 'منتج غير معروف' : 'Unknown Product');
      
      var type = 'cream';
      var prodLower = product.toLowerCase();
      if (prodLower.includes('serum') || prodLower.includes('سيروم')) type = 'serum';
      else if (prodLower.includes('set') || prodLower.includes('مجموعة')) type = 'set';
      else if (prodLower.includes('oil') || prodLower.includes('زيت')) type = 'oil';
      else if (prodLower.includes('eye') || prodLower.includes('عين')) type = 'eye';
      
      var rawStatus = String(o.orderStatus || o.status || '').trim();
      var status = 'مسلمة';
      if (window.TaagerStatus) {
        status = window.TaagerStatus.display(rawStatus || o.orderStatusBucket || 'other', { locale: isAr ? 'ar' : 'en' });
      } else {
        var lowerStatus = rawStatus.toLowerCase();
        if (lowerStatus === 'delivered' || lowerStatus === 'مسلمة' || lowerStatus === 'تم التسليم') {
          status = 'مسلمة';
        } else if (lowerStatus === 'in shipping' || lowerStatus === 'في الشحن' || lowerStatus === 'تم الشحن' || lowerStatus === 'قيد الشحن' || lowerStatus === 'shipping') {
          status = 'في الشحن';
        } else if (lowerStatus === 'awaiting confirmation' || lowerStatus === 'بانتظار التأكيد' || lowerStatus === 'pending') {
          status = 'تم استلام الطلب';
        } else if (lowerStatus === 'confirmed' || lowerStatus === 'مؤكد') {
          status = 'مؤكد';
        } else if (lowerStatus === 'under processing' || lowerStatus === 'قيد المعالجة' || lowerStatus === 'processing') {
          status = 'قيد المعالجة';
        } else if (lowerStatus === 'waiting' || lowerStatus === 'بانتظار الشحن' || lowerStatus === 'قيد الانتظار') {
          status = 'بانتظار الشحن';
        } else if (lowerStatus === 'canceled by you' || lowerStatus === 'طلب ملغي بواسطتك') {
          status = 'طلب ملغي بواسطتك';
        } else if (lowerStatus === 'failed' || lowerStatus === 'مرتجع' || lowerStatus === 'فشلت' || lowerStatus === 'فشل التسليم' || lowerStatus === 'تم التحقق من الإرجاع' || lowerStatus === 'العميل رفض التأكيد' || lowerStatus === 'فشل / ملغى' || lowerStatus === 'فشل / ملغي') {
          status = 'فشل';
        } else {
          status = 'مؤكد';
        }
      }

      var date = o.createdAt || o.date || '';
      var phone = o.phone || o.phone1 || o.phone2 || o.rawPhone || o.normPhone || o.customerPhone || o.phoneNumber || '';
      var sku = o.sku || o.skuNumber || '';
      var parsedDate = date ? new Date(date) : null;
      var dateTime = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0;
      var phoneClean = phone ? phone.toString().replace(/[\s\-\+]/g, '') : '';
      var phoneLocal = phoneClean ? phoneClean.replace(/^966/, '0') : '';
      var phoneNoCode = phoneClean ? phoneClean.replace(/^966/, '') : '';
      var stageId = statusToStageId(status);
      var searchText = [
        cleanId,
        customer,
        city,
        product,
        sku,
        phone,
        phoneClean,
        phoneLocal,
        phoneNoCode
      ].join(' ').toLowerCase();
      
      return {
        id: cleanId,
        customer: customer,
        city: city,
        product: product,
        type: type,
        total: total,
        commission: commission,
        date: date,
        createdAt: o.createdAt || o.date || '',
        shippedAt: o.shippedAt || o.shippingAt || o.shippedDate || '',
        deliveredAt: o.deliveredAt || o.deliveredDate || '',
        lastUpdatedAt: o.lastUpdatedAt || o.updatedAt || '',
        status: status,
        rawStatus: rawStatus,
        statusBucket: window.TaagerStatus ? window.TaagerStatus.dashboardBucket(rawStatus || status) : stageId,
        exactStatusBucket: window.TaagerStatus ? window.TaagerStatus.normalize(rawStatus || status).bucket : stageId,
        phone: phone,
        phone1: o.phone1 || '',
        phone2: o.phone2 || '',
        sku: sku,
        _dateTime: dateTime,
        _dateKey: dateTime ? dateKeyFromDate(parsedDate) : '',
        _stageId: stageId,
        _searchText: searchText,
        _phoneSearch: phoneClean + ' ' + phoneLocal + ' ' + phoneNoCode
      };
    }
    var normalizationCacheKey = [window.dashboardI18n && window.dashboardI18n.currentLocale || (isRtl ? 'ar' : 'en'), window.TaagerStatus ? 'taager-status' : 'legacy-status'].join('|');
    orders = normalizeOrderArray(orders, normalizeOrder, 'orders|' + normalizationCacheKey);
    outcomeOrders = normalizeOrderArray(outcomeOrders, normalizeOrder, 'outcome|' + normalizationCacheKey);
  }

  function normalizeBackendOrder(o) {
    var total = moneyValue(o && (o.dashboardTotalPrice != null ? o.dashboardTotalPrice : (o.totalPrice || o.total || o.orderValue || 0)));
    var commission = moneyValue(o && (o.taagerProfit || o.profitAfterTax || o.profitAfterFees || o.marketerCommission || o.commission || o.dashboardCommission || 0));
    var rawId = o && (o.taagerOrderNumber || o.easyOrderNumber || o.orderNumber || o.id || o.orderScopeKey || '') || '';
    var cleanId = typeof rawId === 'string' && rawId.startsWith('#') ? rawId : '#' + rawId;
    var isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
    var customer = o && (o.customerName || o.name || o.customer) || (isAr ? 'عميل غير معروف' : 'Unknown Customer');
    var city = o && o.city || 'الرياض';
    var product = o && (o.products || o.product || o.productName) || (isAr ? 'منتج غير معروف' : 'Unknown Product');
    var type = 'cream';
    var prodLower = String(product || '').toLowerCase();
    if (prodLower.includes('serum') || prodLower.includes('سيروم')) type = 'serum';
    else if (prodLower.includes('set') || prodLower.includes('مجموعة')) type = 'set';
    else if (prodLower.includes('oil') || prodLower.includes('زيت')) type = 'oil';
    else if (prodLower.includes('eye') || prodLower.includes('عين')) type = 'eye';
    var rawStatus = String(o && (o.orderStatus || o.status || o.orderStatusBucket || o.statusBucket) || '').trim();
    var status = window.TaagerStatus
      ? window.TaagerStatus.display(rawStatus || 'other', { locale: isAr ? 'ar' : 'en' })
      : (rawStatus || 'مؤكد');
    var date = o && (o.createdAt || o.date || o.dashboardDate) || '';
    var phone = o && (o.phone || o.phone1 || o.phone2 || o.rawPhone || o.normPhone || o.customerPhone || o.phoneNumber) || '';
    var sku = o && (o.sku || o.skuNumber) || '';
    var parsedDate = date ? new Date(date) : null;
    var dateTime = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0;
    var phoneClean = phone ? phone.toString().replace(/[\s\-\+]/g, '') : '';
    var phoneLocal = phoneClean ? phoneClean.replace(/^966/, '0') : '';
    var phoneNoCode = phoneClean ? phoneClean.replace(/^966/, '') : '';
    var stageId = statusToStageId(status);
    return {
      id: cleanId,
      customer: customer,
      city: city,
      product: product,
      type: type,
      total: total,
      commission: commission,
      date: date,
      createdAt: o && (o.createdAt || o.date || '') || '',
      shippedAt: o && (o.shippedAt || o.shippingAt || o.shippedDate || '') || '',
      deliveredAt: o && (o.deliveredAt || o.deliveredDate || '') || '',
      lastUpdatedAt: o && (o.lastUpdatedAt || o.updatedAt || '') || '',
      status: status,
      rawStatus: rawStatus,
      statusBucket: window.TaagerStatus ? window.TaagerStatus.dashboardBucket(rawStatus || status) : stageId,
      exactStatusBucket: window.TaagerStatus ? window.TaagerStatus.normalize(rawStatus || status).bucket : stageId,
      phone: phone,
      phone1: o && o.phone1 || '',
      phone2: o && o.phone2 || '',
      sku: sku,
      _dateTime: dateTime,
      _dateKey: dateTime ? dateKeyFromDate(parsedDate) : '',
      _stageId: stageId,
      _searchText: [cleanId, customer, city, product, sku, phone, phoneClean, phoneLocal, phoneNoCode].join(' ').toLowerCase(),
      _phoneSearch: phoneClean + ' ' + phoneLocal + ' ' + phoneNoCode
    };
  }

  /* ── Helper to cleanly format Date string ─────────────────────────────────── */
  function formatDate(dStr) {
    if (!dStr) return '—';
    if (dStr.indexOf('اليوم') !== -1 || dStr.indexOf('أمس') !== -1) return dStr;
    try {
      var d = new Date(dStr);
      if (!isNaN(d.getTime())) {
        var year = d.getFullYear();
        var month = ('0' + (d.getMonth() + 1)).slice(-2);
        var day = ('0' + d.getDate()).slice(-2);
        return year + '-' + month + '-' + day;
      }
    } catch(e) {}
    return dStr;
  }

  function daysBetween(startValue, endValue) {
    if (!startValue || !endValue) return null;
    var start = new Date(startValue);
    var end = new Date(endValue);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
    return (end.getTime() - start.getTime()) / 86400000;
  }

  function orderDateObj(order) {
    if (order && order._dateTime) return new Date(order._dateTime);
    var raw = order && (order.createdAt || order.date);
    var d = raw ? new Date(raw) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  }

  function dateKeyFromDate(d) {
    if (!d || isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  function formatReadableNumber(value, decimals) {
    var n = Number(value || 0);
    if (!isFinite(n)) n = 0;
    decimals = Math.max(0, decimals || 0);
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  var latestOrderDateCache;
  function latestOrderDate() {
    if (latestOrderDateCache !== undefined) return latestOrderDateCache;
    latestOrderDateCache = orders.reduce(function (latest, order) {
      var t = Number(order && order._dateTime || 0);
      if (t) {
        var d = new Date(t);
        return !latest || d > latest ? d : latest;
      }
      var fallback = orderDateObj(order);
      return fallback && (!latest || fallback > latest) ? fallback : latest;
    }, null);
    return latestOrderDateCache;
  }

  function matchesDateFilter(order) {
    if (!dateFilter) return true;
    var d = orderDateObj(order);
    if (!d) return true;
    var anchor = latestOrderDate() || new Date();
    var orderKey = order._dateKey || dateKeyFromDate(d);
    if (dateFilter === 'today') return orderKey === dateKeyFromDate(anchor);
    if (dateFilter === 'yesterday') {
      var y = new Date(anchor.getTime() - 86400000);
      return orderKey === dateKeyFromDate(y);
    }
    var days = Number(dateFilter || 0);
    if (!days) return true;
    var start = new Date(anchor.getTime() - ((days - 1) * 86400000));
    start.setHours(0, 0, 0, 0);
    return (order._dateTime || d.getTime()) >= start.getTime();
  }

  function statusToStageId(status) {
    if (window.TaagerStatus) {
      var bucket = window.TaagerStatus.normalize(status).bucket;
      return exactStatusId(bucket === 'other' ? 'received' : bucket);
    }
    if (status === 'بانتظار التأكيد') return 'received';
    if (status === 'مؤكد') return 'confirmed';
    if (status === 'قيد المعالجة') return 'processing';
    if (status === 'بانتظار الشحن') return 'waiting';
    if (status === 'في الشحن') return 'shipping';
    if (status === 'مسلمة') return 'delivered';
    if (status === 'طلب ملغي بواسطتك') return 'canceled_by_you';
    if (status === 'فشل' || status === 'فشل / ملغي') return 'failed';
    return 'confirmed';
  }

  function stageMatchesOrder(stageId, order) {
    if (stageId === 'all') return true;
    var exactBucket = exactBucketFromStageId(stageId);
    if (exactBucket) {
      return (order.exactStatusBucket || (window.TaagerStatus ? window.TaagerStatus.normalize(order.rawStatus || order.status).bucket : '')) === exactBucket;
    }
    return (order._stageId || statusToStageId(order.status)) === stageId;
  }

  /* ── Local Helper to export to Excel (SheetJS/xlsx) ─────────────────────────── */
  function safeExportNamePart(value) {
    return String(value || 'orders')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'orders';
  }

  function _localExportToExcel(ordersToExport) {
    try {
      var XLSX = window.XLSX || (typeof require !== 'undefined' ? require('xlsx') : null);
      var tx = window.dashboardI18n ? window.dashboardI18n.raw.bind(window.dashboardI18n) : function (s) { return s; };
      if (!XLSX) {
        var missingMsg = tx("المكتبة XLSX غير متوفرة.");
        if (window.TaagerUI) window.TaagerUI.toast(missingMsg, { kind: "error" });
        else alert(missingMsg);
        return;
      }
      if (!window.XLSX) {
        window.XLSX = XLSX;
      }

      var rows = ordersToExport.map(function(o) {
        var rawPhoneVal = o.phone || "";
        var phoneClean = rawPhoneVal ? rawPhoneVal.toString().replace(/^966/, "0") : "";
        var row = {};
        row[tx("رقم الطلب")] = o.id || "";
        row[tx("العميل")] = o.customer || "";
        row[tx("الهاتف")] = phoneClean || "";
        row[tx("المدينة")] = tx(o.city || "");
        row[tx("المنتج")] = o.product || "";
        row[tx("الترميز")] = o.sku || "";
        row[tx("قيمة الطلب")] = o.total || 0;
        row[tx(isRtl ? "الربح بعد الضريبة" : "Profit After Tax")] = o.commission || 0;
        row[tx("التاريخ")] = formatDate(o.date) || "";
        row[tx("الحالة")] = tx(o.status || "");
        return row;
      });

      var ws = XLSX.utils.json_to_sheet(rows);
      ws['!dir'] = window.dashboardI18n && !window.dashboardI18n.isRtl() ? 'ltr' : 'rtl';
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tx("الطلبات"));
      var date = new Date().toISOString().slice(0, 10);
      var stageName = activeStageId === 'all' ? 'all' : safeExportNamePart(activeStageId);
      var filename = 'taager-orders-' + stageName + '-' + date + '.xlsx';
      if (window.api && typeof window.api.saveOutputFile === 'function') {
        var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        window.api.saveOutputFile({ buffer: new Uint8Array(wbout), filename: filename }).then(function (res) {
          if (res && res.saved && window.TaagerUI) {
            window.TaagerUI.toast(tx("تم تصدير البيانات"), { kind: "success" });
          }
        }).catch(function (saveErr) {
          console.error("Export save failed:", saveErr.message);
          XLSX.writeFile(wb, filename);
        });
      } else {
        XLSX.writeFile(wb, filename);
      }
    } catch (err) {
      console.error("Export failed:", err.message);
      var errorMsg = (window.dashboardI18n ? window.dashboardI18n.raw("فشل التصدير:") : "فشل التصدير:") + " " + err.message;
      if (window.TaagerUI) window.TaagerUI.toast(errorMsg, { kind: "error" });
      else alert(errorMsg);
    }
  }

  /* ── Interactive State (closure-scoped) ──────────────────────────────────── */
  var activeStageId = 'all';
  var searchTerm    = '';
  var currentPage   = 1;
  var sortVal       = 'date_desc';
  var productFilter = '';
  var cityFilter    = '';
  var statusFilter  = '';
  var dateFilter    = '';
  var perPage       = 10;
  var backendOrdersEnabled = Boolean(window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.query === 'function');
  var backendOrdersRequest = 0;
  if (window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.flags === 'function') {
    window.DashboardQueryRuntime.flags().then(function (flags) {
      backendOrdersEnabled = backendOrdersEnabled || !!(flags && flags.orders);
      if (backendOrdersEnabled && mountEl.isConnected) refreshTableData();
    });
  }
  var filteredCacheKey = '';
  var filteredCacheValue = null;
  var sortedCacheKey = '';
  var sortedCacheValue = null;
  var exactStatusStagesCache;
  var overviewSummary = data && data.overview ? data.overview : {};
  var codSummary = data && data.cod ? data.cod : {};
  var certifiedMetrics = data && data.pipeline && data.pipeline.metrics ? data.pipeline.metrics : null;
  var stageCounts = {
    intake: certifiedMetrics && certifiedMetrics.totalOrders != null ? Number(certifiedMetrics.totalOrders) : orders.length,
    received: 0, confirmed: 0, processing: 0, waiting: 0, shipping: 0, delivered: 0, failed: 0
  };
  var hasCertifiedStages = data && Array.isArray(data.stages) && data.stages.length > 0;
  if (hasCertifiedStages) {
    data.stages.forEach(function (stage) {
      if (stage && stage.id) stageCounts[stage.id] = Number(stage.count || 0);
    });
  }
  var productOptionsCache = [{ value: '', label: tx('جميع المنتجات') }];
  var cityOptionsCache = [{ value: '', label: tx('جميع المدن') }];

  function exactStatusId(bucket) {
    return 'status:' + String(bucket || 'other');
  }

  function exactBucketFromStageId(stageId) {
    return String(stageId || '').indexOf('status:') === 0 ? String(stageId).slice(7) : '';
  }

  function exactStatusStages() {
    if (exactStatusStagesCache !== undefined) return exactStatusStagesCache;
    if (!window.TaagerStatus || !Array.isArray(window.TaagerStatus.all)) {
      exactStatusStagesCache = null;
      return exactStatusStagesCache;
    }
    var counts = {};
    orders.forEach(function (order) {
      var bucket = order.exactStatusBucket || window.TaagerStatus.normalize(order.rawStatus || order.status).bucket;
      counts[bucket] = (counts[bucket] || 0) + 1;
    });
    exactStatusStagesCache = window.TaagerStatus.all.map(function (meta) {
      var dashboardBucket = window.TaagerStatus.dashboardBucket(meta.bucket);
      var label = window.TaagerStatus.display(meta.bucket, { locale: isRtl ? 'ar' : 'en' });
      return {
        id: exactStatusId(meta.bucket),
        exactBucket: meta.bucket,
        label: label,
        shortLabel: label,
        count: Number(counts[meta.bucket] || 0),
        pct: orders.length > 0 ? parseFloat(((Number(counts[meta.bucket] || 0) / orders.length) * 100).toFixed(1)) : 0,
        color: window.TaagerStatus.color(meta.bucket),
        iconSvg: meta.delivered ? STAGE_TEMPLATE_BY_ID.delivered.iconSvg :
          meta.bucket === 'canceled_by_you' ? STAGE_TEMPLATE_BY_ID.waiting.iconSvg :
          meta.bucket === 'received' ? FALLBACK_STAGE_TEMPLATE.iconSvg :
          dashboardBucket === 'failed' ? STAGE_TEMPLATE_BY_ID.failed.iconSvg :
          dashboardBucket === 'shipping' ? STAGE_TEMPLATE_BY_ID.shipping.iconSvg :
          dashboardBucket === 'confirmed' ? STAGE_TEMPLATE_BY_ID.confirmed.iconSvg :
          dashboardBucket === 'processing' ? STAGE_TEMPLATE_BY_ID.processing.iconSvg :
          STAGE_TEMPLATE_BY_ID.waiting.iconSvg
      };
    });
    return exactStatusStagesCache;
  }

  function invalidateFilteredCache() {
    filteredCacheKey = '';
    filteredCacheValue = null;
    sortedCacheKey = '';
    sortedCacheValue = null;
  }

  function hasSubsetFilters() {
    return Boolean(searchTerm || productFilter || cityFilter || statusFilter || dateFilter);
  }

  (function buildSectionIndexes() {
    var productsSeen = {};
    var citiesSeen = {};
    orders.forEach(function (order) {
      if (order.product && !productsSeen[order.product]) productsSeen[order.product] = true;
      if (order.city && !citiesSeen[order.city]) citiesSeen[order.city] = true;
    });
    if (!hasCertifiedStages) {
      outcomeOrders.forEach(function (order) {
        var stageId = order._stageId || statusToStageId(order.status);
        stageCounts[stageId] = (stageCounts[stageId] || 0) + 1;
      });
    }
    productOptionsCache = productOptionsCache.concat(Object.keys(productsSeen).sort().map(function (p) {
      return { value: p, label: p.length > 25 ? p.slice(0, 24) + '...' : p };
    }));
    cityOptionsCache = cityOptionsCache.concat(Object.keys(citiesSeen).sort().map(function (c) {
      return { value: c, label: c };
    }));
  }());

  /* ── Custom Select options ───────────────────────────────────────────────── */
  var sortOptions = [
    { value: 'date_desc', label: tx('ترتيب: الأحدث') },
    { value: 'date_asc', label: tx('ترتيب: الأقدم') },
    { value: 'total_desc', label: tx('ترتيب: أعلى قيمة') },
    { value: 'total_asc', label: tx('ترتيب: أقل قيمة') },
    { value: 'commission_desc', label: tx(isRtl ? 'ترتيب: أعلى ربح بعد الضريبة' : 'Sort: highest profit after tax') }
  ];
  var statusOptions = window.TaagerStatus
    ? [{ value: '', label: tx('جميع الحالات') }].concat(window.TaagerStatus.all.map(function (statusMeta) {
        var label = window.TaagerStatus.display(statusMeta.bucket, { locale: isRtl ? 'ar' : 'en' });
        return { value: label, label: label };
      }))
    : [
        { value: '', label: tx('جميع الحالات') },
        { value: 'بانتظار التأكيد', label: tx('بانتظار التأكيد') },
        { value: 'مؤكد', label: tx('مؤكد') },
        { value: 'قيد المعالجة', label: tx('قيد المعالجة') },
        { value: 'بانتظار الشحن', label: tx('بانتظار الشحن') },
        { value: 'في الشحن', label: tx('في الشحن') },
        { value: 'مسلمة', label: tx('مسلمة') },
        { value: 'فشل', label: tx('فشل') },
        { value: 'طلب ملغي بواسطتك', label: tx('طلب ملغي بواسطتك') }
      ];
  var dateOptions = [
    { value: '', label: tx('كل التواريخ') },
    { value: 'today', label: tx('اليوم') },
    { value: 'yesterday', label: tx('أمس') },
    { value: '7', label: tx('آخر 7 أيام') },
    { value: '14', label: tx('آخر 14 يوم') },
    { value: '30', label: tx('آخر 30 يوم') }
  ];

  /* ── Filter and Sort Logic ───────────────────────────────────────────────── */
  function getFilteredOrders() {
    var key = [
      activeStageId,
      searchTerm,
      productFilter,
      cityFilter,
      statusFilter,
      dateFilter
    ].join('\u001f');
    if (filteredCacheValue && key === filteredCacheKey) {
      return filteredCacheValue;
    }

    var results = activeStageId === 'all' ? orders : outcomeOrders;

    // 1. Pipeline Stage filter
    if (activeStageId !== 'all') {
      results = results.filter(function(o) {
        return stageMatchesOrder(activeStageId, o);
      });
    }

    // 2. Search Box filter
    if (searchTerm) {
      var q = searchTerm.toLowerCase().trim();
      var queryClean = q.replace(/[\s\-\+]/g, '');
      results = results.filter(function(o) {
        var textMatch = (o._searchText || '').indexOf(q) !== -1;
        var phoneMatch = queryClean && (o._phoneSearch || '').indexOf(queryClean) !== -1;
        return textMatch || phoneMatch;
      });
    }

    // 3. Product filter
    if (productFilter) {
      results = results.filter(function(o) {
        return o.product === productFilter;
      });
    }

    // 4. City filter
    if (cityFilter) {
      results = results.filter(function(o) {
        return o.city === cityFilter;
      });
    }

    // 5. Status filter
    if (statusFilter) {
      results = results.filter(function(o) {
        return o.status === statusFilter;
      });
    }

    // 6. Date filter
    if (dateFilter) {
      results = results.filter(matchesDateFilter);
    }

    filteredCacheKey = key;
    filteredCacheValue = results;
    return results;
  }

  function getFilteredAndSortedOrders() {
    var base = getFilteredOrders();
    var key = filteredCacheKey + '\u001f' + sortVal;
    if (sortedCacheValue && key === sortedCacheKey) {
      return sortedCacheValue;
    }

    var results = base.slice().sort(function(a, b) {
      if (sortVal === 'date_desc' || sortVal === 'date_asc') {
        var valA = Number(a._dateTime || 0);
        var valB = Number(b._dateTime || 0);
        return sortVal === 'date_desc' ? valB - valA : valA - valB;
      } else if (sortVal === 'total_desc' || sortVal === 'total_asc') {
        var valA = Number(a.total || 0);
        var valB = Number(b.total || 0);
        return sortVal === 'total_desc' ? valB - valA : valA - valB;
      } else if (sortVal === 'commission_desc' || sortVal === 'commission_asc') {
        var valA = Number(a.commission || 0);
        var valB = Number(b.commission || 0);
        return sortVal === 'commission_desc' ? valB - valA : valA - valB;
      } else if (sortVal === 'id_desc' || sortVal === 'id_asc') {
        var valA = a.id || ''; var valB = b.id || '';
        return sortVal === 'id_desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
      } else if (sortVal === 'customer_desc' || sortVal === 'customer_asc') {
        var valA = a.customer || ''; var valB = b.customer || '';
        return sortVal === 'customer_desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
      } else if (sortVal === 'city_desc' || sortVal === 'city_asc') {
        var valA = a.city || ''; var valB = b.city || '';
        return sortVal === 'city_desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
      } else if (sortVal === 'product_desc' || sortVal === 'product_asc') {
        var valA = a.product || ''; var valB = b.product || '';
        return sortVal === 'product_desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
      } else if (sortVal === 'status_desc' || sortVal === 'status_asc') {
        var valA = a.status || ''; var valB = b.status || '';
        return sortVal === 'status_desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      return 0;
    });

    sortedCacheKey = key;
    sortedCacheValue = results;
    return results;
  }
  /* ── 1. Pipeline Module ──────────────────────────────────────────────────── */
  /* Inject stage-card tooltip styles once */
  (function() {
    if (document.getElementById('s3-stage-tooltip-style')) return;
    var style = document.createElement('style');
    style.id = 's3-stage-tooltip-style';
    style.textContent = [
      '.s3-stage-label-wrap { position: relative; display: inline-flex; align-items: center; max-width: calc(100% - 38px); }',
      '.s3-stage-label-wrap .s3-stage-short { font-size:10.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }',
      '#s3-floating-tooltip {',
      '  position: fixed;',
      '  background: rgba(10,15,30,0.97);',
      '  border: 1px solid rgba(255,255,255,0.15);',
      '  color: #fff; font-size: 11px; font-weight: 600; white-space: nowrap;',
      '  padding: 5px 11px; border-radius: 7px;',
      '  pointer-events: none; z-index: 99999;',
      '  box-shadow: 0 4px 18px rgba(0,0,0,0.6);',
      '  transition: opacity 0.15s ease;',
      '  opacity: 0; visibility: hidden;',
      '}',
      '#s3-floating-tooltip.visible { opacity: 1; visibility: visible; }',
      '#s3-floating-tooltip::before {',
      '  content: ""; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);',
      '  border: 5px solid transparent; border-bottom-color: rgba(10,15,30,0.97);',
      '}',
    ].join('\n');
    document.head.appendChild(style);

    /* Create singleton floating tooltip element */
    if (!document.getElementById('s3-floating-tooltip')) {
      var tip = document.createElement('div');
      tip.id = 's3-floating-tooltip';
      document.body.appendChild(tip);
    }
  }());
  function refreshPipeline() {
    var container = document.getElementById('s3-pipeline-container');
    if (!container) return;

    var intakeCount = stageCounts.intake;
    var countsByStage = stageCounts;

    var dynamicStages = exactStatusStages() || STAGE_ORDER.map(function(id) {
      var template = STAGE_TEMPLATE_BY_ID[id] || {};
      var incoming = STAGES_BY_ID[id] || {};
      var count = countsByStage[id] || 0;
      var pct = intakeCount > 0 ? ((count / intakeCount) * 100).toFixed(1) : '0';
      if (id === 'intake') pct = intakeCount > 0 ? '100' : '0';

      return {
        id: id,
        label: template.label || incoming.label || id,
        shortLabel: template.shortLabel || incoming.shortLabel || (template.label || incoming.label || id),
        count: count,
        pct: parseFloat(pct),
        color: template.color || incoming.color || '#64748b',
        iconSvg: template.iconSvg || incoming.iconSvg || STAGE_TEMPLATE_BY_ID.confirmed.iconSvg
      };
    });

    var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var textAlign = isRtl ? 'right' : 'left';
    var rowDir = isRtl ? 'row-reverse' : 'row';

    var cardsHtml = '';
    var isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
    dynamicStages.forEach(function (s, i) {
      var isActive  = s.id === activeStageId;
      var glowBox, bg;
      if (isLightTheme) {
        /* Light mode: white card surface, soft colored outer glow (border handles the edge) */
        glowBox = isActive
          ? '0 0 16px 4px ' + s.color + 'aa, 0 0 36px 6px ' + s.color + '55'
          : '0 0 10px 2px ' + s.color + '66, 0 0 22px 4px ' + s.color + '2e';
        bg = 'linear-gradient(180deg,' + s.color + '18 0%,' + s.color + '06 35%,#ffffff 60%,' + s.color + '14 100%),#ffffff';
      } else {
        /* Dark mode: original */
        glowBox = isActive
          ? '0 0 26px ' + s.color + 'aa,0 0 60px ' + s.color + '55,inset 0 0 24px ' + s.color + '30'
          : '0 0 10px ' + s.color + '55,0 0 24px ' + s.color + '22,inset 0 0 14px ' + s.color + '10';
        bg = 'linear-gradient(180deg,' + s.color + '22 0%,' + s.color + '05 35%,transparent 60%,' + s.color + '1a 100%),#0a0f1c';
      }

      cardsHtml +=
        '<div class="s3-mini-stage fade-up" data-id="' + s.id + '" style="flex:1;min-width:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;animation-delay:' + (i * 60) + 'ms;">' +
          '<div class="s3-mini-card" style="width:94%;height:96px;border-radius:12px;' +
            'transform:skewX(-6deg);' +
            'border:1.5px solid ' + s.color + ';' +
            'background:' + bg + ';' +
            'box-shadow:' + glowBox + ';">' +
            '<div class="s3-mini-inner" style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:10px 14px;transform:skewX(6deg);box-sizing:border-box;">' +
              /* Top row: label + icon */
              '<div style="display:flex;align-items:center;justify-content:space-between;flex-direction:' + rowDir + ';">' +
                '<div class="s3-mini-icon-wrap" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:' + s.color + ';' +
                  'background:' + s.color + (isLightTheme ? '18' : '1c') + ';border:1.3px solid ' + s.color + ';box-shadow:0 0 ' + (isLightTheme ? '10px ' + s.color + 'cc' : '8px ' + s.color + '77') + ',inset 0 0 6px ' + s.color + '33;">' +
                  s.iconSvg +
                '</div>' +
                '<span class="s3-stage-label-wrap s3-mini-title-wrap" style="color:' + s.color + ';text-shadow:' + (isLightTheme ? 'none' : '0 0 8px ' + s.color + '77') + ';text-align:' + textAlign + ';">' +
                  '<span class="s3-stage-short">' + s.shortLabel + '</span>' +
                '</span>' +
              '</div>' +
              /* Bottom row: count + percentage */
              '<div style="display:flex;align-items:baseline;gap:5px;justify-content:flex-' + (isRtl ? 'end' : 'start') + ';flex-direction:' + rowDir + ';">' +
                '<span class="s3-mini-count" title="' + formatReadableNumber(s.count, 0) + '" style="font-size:26px;font-weight:900;color:' + (isLightTheme ? '#1e293b' : '#fff') + ';line-height:1;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;">' + formatReadableNumber(s.count, 0) + '</span>' +
                '<span class="s3-mini-pct" style="font-size:11px;color:' + (isLightTheme ? '#64748b' : 'rgba(255,255,255,0.55)') + ';font-weight:600;">' + s.pct + '%</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          (isActive
            ? '<div style="width:0;height:0;margin-top:4px;border-left:10px solid transparent;border-right:10px solid transparent;border-top:12px solid ' + s.color + ';filter:drop-shadow(0 0 6px ' + s.color + ');"></div>'
            : '<div style="width:6px;height:6px;border-radius:50%;margin-top:8px;background:' + s.color + ';box-shadow:0 0 6px ' + s.color + ',0 0 12px ' + s.color + '55;"></div>'
          ) +
        '</div>';

    });

    var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var dirStr = isRtl ? 'rtl' : 'ltr';

    container.innerHTML = '<div class="s3-pipeline-scroll" style="margin-bottom:28px;overflow-x:auto;overflow-y:visible;padding:32px 20px 16px;">' +
      '<div style="min-width:980px;width:100%;direction:' + dirStr + ';overflow:visible;">' +
        '<div style="display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));gap:18px 14px;align-items:stretch;overflow:visible;">' + cardsHtml + '</div>' +
      '</div>' +
    '</div>';

    // Wire clicks to dynamic updates
    var floatingTip = document.getElementById('s3-floating-tooltip');
    container.querySelectorAll('.s3-mini-stage').forEach(function (el) {
      el.addEventListener('click', function () {
        activeStageId = el.getAttribute('data-id');
        currentPage = 1; // Reset to page 1 on stage toggle
        invalidateFilteredCache();
        refreshPipeline();
        refreshDetails();
        refreshTableData();
      });
      el.addEventListener('mouseenter', function () {
        el.style.transform = 'translateY(-2px)';
        if (floatingTip) {
          var stageId = el.getAttribute('data-id');
          var stageData = dynamicStages.find(function(s) { return s.id === stageId; });
          if (stageData) {
            var rect = el.getBoundingClientRect();
            floatingTip.textContent = stageData.label;
            floatingTip.style.borderColor = stageData.color + '55';
            /* Position below the card, centered */
            var tipLeft = rect.left + rect.width / 2;
            var tipTop  = rect.bottom + 10;
            floatingTip.style.left = tipLeft + 'px';
            floatingTip.style.top  = tipTop  + 'px';
            floatingTip.style.transform = 'translateX(-50%)';
            floatingTip.classList.add('visible');
          }
        }
      });
      el.addEventListener('mouseleave', function () {
        el.style.transform = '';
        if (floatingTip) floatingTip.classList.remove('visible');
      });
    });
  }

  /* ── 2. Stage Details panel Module ───────────────────────────────────────── */
  function refreshDetails() {
    var container = document.getElementById('s3-details-container');
    if (!container) return;

    var incomingStage = STAGES_BY_ID[activeStageId] || {};
    var allOrdersLabel = isRtl ? 'كل الطلبات' : 'All orders';
    var templateStage = activeStageId === 'all'
      ? { id: 'all', label: allOrdersLabel, shortLabel: allOrdersLabel, color: '#3b82f6', iconSvg: FALLBACK_STAGE_TEMPLATE.iconSvg }
      : (exactBucketFromStageId(activeStageId)
        ? (exactStatusStages() || []).find(function (stage) { return stage.id === activeStageId; }) || FALLBACK_STAGE_TEMPLATE
        : (STAGE_TEMPLATE_BY_ID[activeStageId] || FALLBACK_STAGE_TEMPLATE));
    var activeStage = Object.assign({}, incomingStage, templateStage);

    var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    // Filter stage specific orders for detail rows; certified full-scope cards stay aligned with Master.
    var stageOrders = getFilteredOrders();

    var totalValue = stageOrders.reduce(function(sum, o) { return sum + o.total; }, 0);
    var totalCommission = stageOrders.reduce(function(sum, o) { return sum + o.commission; }, 0);
    var avgValue = stageOrders.length > 0 ? (totalValue / stageOrders.length) : 0;
    var isFullStage = !hasSubsetFilters();
    var activeExactBucket = exactBucketFromStageId(activeStageId);
    var isDeliveredScope = activeStageId === 'delivered' || activeExactBucket === 'delivered';
    var isShippingScope = activeStageId === 'shipping' || activeExactBucket === 'shipping';
    var avgDurationDays = null;

    if (isFullStage && isDeliveredScope) {
      if (overviewSummary.totalDeliveredSales) totalValue = Number(overviewSummary.totalDeliveredSales.value || 0);
      if (overviewSummary.earnedCommission) totalCommission = Number(overviewSummary.earnedCommission.value || 0);
      if (overviewSummary.deliveredAov) avgValue = Number(overviewSummary.deliveredAov.value || 0);
      if (codSummary.avgDays != null) avgDurationDays = Number(codSummary.avgDays);
    } else if (isFullStage && activeStageId === 'intake') {
      if (overviewSummary.totalSales) totalValue = Number(overviewSummary.totalSales.value || 0);
      if (overviewSummary.overallAov) avgValue = Number(overviewSummary.overallAov.value || 0);
    }

    if (avgDurationDays == null && (isDeliveredScope || isShippingScope)) {
      var durationDays = stageOrders.map(function (o) {
        var end = isDeliveredScope ? o.lastUpdatedAt : o.shippedAt;
        return daysBetween(o.createdAt || o.date, end);
      }).filter(function (n) { return typeof n === 'number' && isFinite(n); });
      avgDurationDays = durationDays.length
        ? durationDays.reduce(function (sum, n) { return sum + n; }, 0) / durationDays.length
        : null;
    }
    var totalValueLabel = isDeliveredScope ? tt('orders.totalDeliveredSales') : tx('إجمالي قيمة الطلبات');
    var avgValueLabel = isDeliveredScope ? tt('orders.deliveredAov') : tx('متوسط قيمة الطلب');
    var durationLabel = isShippingScope ? tt('orders.averageShippingTime') : tt('orders.averageDeliveryTime');
    var durationSub = isShippingScope ? tt('orders.shippingTimeBasis') : tt('orders.deliveryTimeBasis');
    
    // Dynamic stage detailed KPIs
    var kpisDynamic = [
      {
        color: activeStage.color,
        label: totalValueLabel,
        value: totalValue,
        unit: activeCurrency,
        sub: (isRtl ? 'من ' : 'from ') + formatReadableNumber(stageOrders.length, 0) + (isRtl ? ' طلب في هذه المرحلة' : ' orders in this stage'),
        decimals: 0,
        positive: false,
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'
      },
      {
        color: activeStage.color,
        label: tx(isRtl ? 'إجمالي الربح بعد الضريبة' : 'Total Profit After Tax'),
        value: totalCommission,
        unit: activeCurrency,
        sub: (totalValue > 0 ? ((totalCommission / totalValue) * 100).toFixed(1) : '0') + tx('% من قيمة الطلبات'),
        decimals: 0,
        positive: false,
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'
      },
      {
        color: '#00e676',
        label: avgValueLabel,
        value: avgValue,
        unit: activeCurrency,
        sub: tx('معدل سلة المبيعات الحالي'),
        decimals: 2,
        positive: true,
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
      },
      {
        color: activeStage.color,
        label: durationLabel,
        value: avgDurationDays == null ? 0 : avgDurationDays,
        unit: avgDurationDays == null ? '' : tx('يوم'),
        sub: avgDurationDays == null ? tx('غير متاح في اللقطة الحالية') : durationSub,
        decimals: 1,
        positive: false,
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
      }
    ];

    var textAlign = isRtl ? 'right' : 'left';
    var rowDir = isRtl ? 'row-reverse' : 'row';

    var kpisHtml = kpisDynamic.map(function (k, i) {
      return '<div class="fade-up s3-kpi" data-to="' + k.value + '" data-dec="' + k.decimals + '" style="flex:1;min-width:0;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:12px;padding:14px 16px;text-align:' + textAlign + ';animation-delay:' + (150 + i * 60) + 'ms;">' +
        '<div style="display:flex;align-items:center;gap:8px;justify-content:flex-' + (isRtl ? 'end' : 'start') + ';margin-bottom:8px;flex-direction:' + rowDir + ';color:' + k.color + ';">' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.55);font-weight:600;">' + k.label + '</span>' +
          k.iconSvg +
        '</div>' +
        '<div style="display:flex;align-items:baseline;gap:6px;justify-content:flex-' + (isRtl ? 'end' : 'start') + ';flex-direction:' + rowDir + ';">' +
          '<span class="s3-kpi-num" data-to="' + k.value + '" data-dec="' + k.decimals + '" title="' + formatReadableNumber(k.value, k.decimals) + '" style="font-size:24px;font-weight:900;color:#fff;line-height:1;letter-spacing:0;font-variant-numeric:tabular-nums;">' + formatReadableNumber(k.value, k.decimals) + '</span>' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.5);font-weight:700;">' + k.unit + '</span>' +
        '</div>' +
        '<div style="font-size:10px;margin-top:8px;color:' + (k.positive ? '#00e676' : 'rgba(255,255,255,0.4)') + ';">' + k.sub + '</div>' +
      '</div>';
    }).join('');

    var activeIcon = activeStage.iconSvg
      .replace(/width="16"/g, 'width="28"')
      .replace(/height="16"/g, 'height="28"')
      .replace(/stroke="currentColor"/g, 'stroke="' + activeStage.color + '"')
      .replace(/fill="currentColor"/g, 'fill="' + activeStage.color + '"');

    var dlSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

    container.innerHTML = '<div class="fade-up s3-details-panel" style="animation-delay:100ms;background:#0b1120;border:1px solid ' + activeStage.color + '55;border-radius:16px;padding:28px;margin-bottom:24px;display:flex;flex-direction:' + rowDir + ';gap:28px;align-items:center;box-shadow:0 0 28px ' + activeStage.color + '1c,inset 0 0 40px ' + activeStage.color + '06;">' +
      /* Left: icon + title */
      '<div style="display:flex;align-items:center;gap:16px;flex-shrink:0;min-width:260px;flex-direction:' + rowDir + ';border-' + (isRtl ? 'left' : 'right') + ':1px solid rgba(255,255,255,0.06);padding-' + (isRtl ? 'left' : 'right') + ':24px;">' +
        '<div style="width:68px;height:68px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
          'background:radial-gradient(circle,' + activeStage.color + '30 0%,' + activeStage.color + '08 70%);' +
          'border:1.5px solid ' + activeStage.color + ';' +
          'box-shadow:0 0 22px ' + activeStage.color + '77,0 0 44px ' + activeStage.color + '33,inset 0 0 14px ' + activeStage.color + '33;">' +
          activeIcon +
        '</div>' +
        '<div style="text-align:' + textAlign + ';flex:1;">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;justify-content:flex-' + (isRtl ? 'end' : 'start') + ';flex-direction:' + rowDir + ';">' +
            '<span style="font-size:22px;font-weight:900;color:#fff;">' + activeStage.label + '</span>' +
            '<span style="padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;background:' + activeStage.color + '22;border:1px solid ' + activeStage.color + '66;color:' + activeStage.color + ';font-variant-numeric:tabular-nums;">' + formatReadableNumber(stageOrders.length, 0) + ' ' + tx('طلب') + '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:10px;line-height:1.5;">' + 
            (activeStageId === 'all' ? tx('جميع الطلبات المسجلة في النظام') :
             activeStageId === 'received' ? tx('الطلبات التي تم استلامها ولم تنتقل بعد للخطوة التالية') :
             activeStageId === 'confirmed' ? tx('الطلبات التي تم تأكيدها وجاهزة للتجهيز والشحن') :
             activeStageId === 'shipping' ? tx('الطلبات التي تم شحنها وتحت النقل إلى العميل') :
             activeStageId === 'delivered' ? tx('الطلبات التي تم تسليمها بنجاح للعميل النهائي') :
             exactBucketFromStageId(activeStageId) ? tx('الطلبات المطابقة لهذه الحالة من ملف تاجر') :
             tx('الطلبات الفاشلة أو الملغاة من قبل النظام أو العميل')) +
          '</div>' +
          '<button id="s3-export-btn" style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;flex-direction:' + rowDir + ';margin-' + (isRtl ? 'right' : 'left') + ':auto;">' +
            dlSvg + '<span>' + tx('تصدير البيانات') + '</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      /* KPI pills */
      '<div class="s3-kpi-row" style="display:flex;gap:14px;flex:1;width:100%;flex-direction:' + rowDir + ';">' + kpisHtml + '</div>' +
    '</div>';

    // Numbers are rendered immediately in this dense orders view to keep filters responsive.

    // Wire export click
    var exportBtn = document.getElementById('s3-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        if (canUseBackendOrdersPage() && window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.exportOrders === 'function') {
          var backendSort = backendOrderSort();
          exportBtn.disabled = true;
          window.DashboardQueryRuntime.exportOrders(Object.assign({
            includeCanceled: true,
            filters: { search: searchTerm, product: productFilter, city: cityFilter }
          }, backendSort), data).finally(function () {
            exportBtn.disabled = false;
          });
          return;
        }
        exportBtn.disabled = true;
        var ensureXlsx = window.XLSX || typeof window.ensureFeatureScripts !== 'function'
          ? Promise.resolve()
          : window.ensureFeatureScripts('dashboardOrdersExport');
        ensureXlsx.then(function () {
          _localExportToExcel(getFilteredAndSortedOrders());
        }).catch(function (err) {
          console.error("XLSX action-time load failed:", err && err.message ? err.message : err);
          _localExportToExcel(getFilteredAndSortedOrders());
        }).finally(function () {
          exportBtn.disabled = false;
        });
      });
    }
  }

  /* ── 3. Table Container Module ───────────────────────────────────────────── */
  function refreshTableContainer() {
    var container = document.getElementById('s3-table-container');
    if (!container) return;
    
    var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;

    var mapPinSvg = '<svg viewBox="0 0 24 24" fill="none" stroke=" ' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(54, 4, 83, 0.35)' : 'rgba(255,255,255,0.35)') + ' " stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';

    var sortIcon = function(key) {
      if (sortVal === key + '_desc') return '<span style="color:#a855f7;font-size:12px;margin-right:4px;">↓</span>';
      if (sortVal === key + '_asc') return '<span style="color:#a855f7;font-size:12px;margin-right:4px;">↑</span>';
      return '<span style="color:rgba(255,255,255,0.15);font-size:12px;margin-right:4px;">↕</span>';
    };

    var thStyle = 'cursor:pointer;text-align:right; padding:12px 16px; color:#8892a4; font-weight:600; font-size:10px; transition:color 0.2s;';

    container.innerHTML = '<div>' +
      /* Filter row */
      '<div class="s3-filter-row" style="display:flex;flex-direction:row;gap:12px;margin-bottom:16px;flex-direction:row-reverse;width:100%; align-items:center;">' +
        '<div id="s3-sort-wrap" style="min-width:140px;"></div>' +
        '<div id="s3-clear-sort-wrap" style="min-width:110px; display:flex; align-items:center;"><button id="s3-clear-sort" type="button"' + (sortVal === 'date_desc' ? ' disabled' : '') + ' style="width:100%; height:36px; padding:0 12px; border-radius:8px; border:1px solid rgba(168,85,247,0.35); background:rgba(168,85,247,0.10); color:#c084fc; font-family:inherit; font-size:11px; font-weight:700; cursor:' + (sortVal === 'date_desc' ? 'default' : 'pointer') + '; opacity:' + (sortVal === 'date_desc' ? '0.45' : '1') + ';">' + tt('orders.clearSort') + '</button></div>' +
        '<div id="s3-status-wrap" style="min-width:150px;"></div>' +
        '<div id="s3-date-wrap" style="min-width:140px;"></div>' +
        '<div id="s3-product-wrap" style="min-width:140px;"></div>' +
        '<div id="s3-city-wrap" style="min-width:140px;"></div>' +
        /* Search input wrapper */
        '<div class="explorer-search-wrap" style="flex:1; width:auto; display:flex; align-items:center; position:relative;">' +
          '<span class="explorer-search-icon" style="right:12px; left:auto; pointer-events:none; font-size:10px; color:#64748b; position:absolute;">🔍</span>' +
          '<input id="s3-search" type="text" class="explorer-search" value="' + searchTerm + '" placeholder="' + tt('orders.searchPlaceholder') + '" style="direction:' + (isRtl ? 'rtl' : 'ltr') + '; text-align:right; padding:6px 32px 6px 12px; width:100%;" autocomplete="off" spellcheck="false" />' +
        '</div>' +
      '</div>' +

      /* Table structure */
      '<div class="explorer-table-wrap s3-table-scroll" style="background:#0b1120;border:1px solid rgba(255,255,255,0.06);border-radius:12px;width:100%;">' +
        '<table class="explorer-table" style="min-width:1120px;width:100%;direction:' + (isRtl ? 'rtl' : 'ltr') + ';border-collapse:collapse;">' +
          '<thead>' +
            '<tr style="background:rgba(255,255,255,0.015); border-bottom:1px solid rgba(255,255,255,0.04);">' +
              '<th class="s3-sortable" data-sort="id" style="' + thStyle + '">' + tx('رقم الطلب') + ' ' + sortIcon('id') + '</th>' +
              '<th style="' + thStyle.replace('cursor:pointer;', '') + '">' + tx('رقم العميل') + '</th>' +
              '<th class="s3-sortable" data-sort="customer" style="' + thStyle + '">' + tx('العميل') + ' ' + sortIcon('customer') + '</th>' +
              '<th class="s3-sortable" data-sort="city" style="' + thStyle + '">' +
                '<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end; font-weight:700;">' + mapPinSvg + ' ' + tx('المدينة') + ' ' + sortIcon('city') + '</div>' +
              '</th>' +
              '<th class="s3-sortable" data-sort="product" style="' + thStyle + '">' + tx('المنتج') + ' ' + sortIcon('product') + '</th>' +
              '<th class="s3-sortable" data-sort="total" style="' + thStyle + '">' + tx('قيمة الطلب') + ' ' + sortIcon('total') + '</th>' +
              '<th class="s3-sortable" data-sort="commission" style="' + thStyle + '">' + tx(isRtl ? 'الربح بعد الضريبة' : 'Profit After Tax') + ' ' + sortIcon('commission') + '</th>' +
              '<th class="s3-sortable" data-sort="date" style="' + thStyle + '">' + tx('تاريخ الطلب') + ' ' + sortIcon('date') + '</th>' +
              '<th class="s3-sortable" data-sort="status" style="' + thStyle + '">' + tx('الحالة') + ' ' + sortIcon('status') + '</th>' +
              '<th style="width:36px; padding:12px 16px;"></th>' +
            '</tr>' +
          '</thead>' +
          '<tbody id="s3-rows"></tbody>' +
        '</table>' +
      '</div>' +

      /* Pagination wrapper container */
      '<div id="s3-pagination-wrap"></div>' +
    '</div>';

    // Bind header sorting
    container.querySelectorAll('.s3-sortable').forEach(function(th) {
      th.addEventListener('click', function() {
        var key = th.getAttribute('data-sort');
        if (sortVal === key + '_desc') sortVal = key + '_asc';
        else sortVal = key + '_desc';
        
        refreshTableContainer();
        refreshTableData();
      });
    });

    // Draw the custom dropdown select components
    initCustomSelects();

    var clearSortBtn = document.getElementById('s3-clear-sort');
    if (clearSortBtn) {
      clearSortBtn.addEventListener('click', function () {
        if (sortVal === 'date_desc') return;
        sortVal = 'date_desc';
        currentPage = 1;
        invalidateFilteredCache();
        refreshTableContainer();
        refreshTableData();
      });
    }

    // Bind instant search with debounced support
    var searchInput = document.getElementById('s3-search');
    if (searchInput) {
      var debounceFn = window.debounce || function(f, delay) {
        var tm;
        return function() {
          var ctx = this, args = arguments;
          clearTimeout(tm);
          tm = setTimeout(function() { f.apply(ctx, args); }, delay);
        };
      };

      searchInput.addEventListener('input', debounceFn(function(e) {
        searchTerm = e.target.value;
        currentPage = 1; // Reset to page 1 on new search query
        invalidateFilteredCache();
        refreshDetails();
        refreshTableData();
      }, 120));
    }
  }

  /* ── Initialize Custom select menus ──────────────────────────────────────── */
  function initCustomSelects() {
    var sortWrap = document.getElementById('s3-sort-wrap');
    var statusWrap = document.getElementById('s3-status-wrap');
    var dateWrap = document.getElementById('s3-date-wrap');
    var productWrap = document.getElementById('s3-product-wrap');
    var cityWrap = document.getElementById('s3-city-wrap');

    // 1. Sort Select
    if (sortWrap && window.renderCustomSelect) {
      window.renderCustomSelect(sortWrap, sortOptions, sortVal, function(val) {
        sortVal = val;
        invalidateFilteredCache();
        refreshTableData();
      });
    }

    if (statusWrap && window.renderCustomSelect) {
      window.renderCustomSelect(statusWrap, statusOptions, statusFilter, function(val) {
        statusFilter = val;
        currentPage = 1;
        invalidateFilteredCache();
        refreshDetails();
        refreshTableData();
      });
    }

    if (dateWrap && window.renderCustomSelect) {
      window.renderCustomSelect(dateWrap, dateOptions, dateFilter, function(val) {
        dateFilter = val;
        currentPage = 1;
        invalidateFilteredCache();
        refreshDetails();
        refreshTableData();
      });
    }

    // 2. Product Select Options
    var uniqueProducts = [];
    [].forEach(function(o) {
      if (o.product && uniqueProducts.indexOf(o.product) === -1) {
        uniqueProducts.push(o.product);
      }
    });
    uniqueProducts.sort();
    var productOptions = [{ value: '', label: 'جميع المنتجات' }].concat(
      uniqueProducts.map(function(p) {
        return { value: p, label: p.length > 25 ? p.slice(0, 24) + '...' : p };
      })
    );
    if (productWrap && window.renderCustomSelect) {
      window.renderCustomSelect(productWrap, productOptionsCache, productFilter, function(val) {
        productFilter = val;
        currentPage = 1;
        invalidateFilteredCache();
        refreshDetails();
        refreshTableData();
      }, { searchable: true, maxHeight: '250px' });
    }

    // 3. City Select Options
    var uniqueCities = [];
    [].forEach(function(o) {
      if (o.city && uniqueCities.indexOf(o.city) === -1) {
        uniqueCities.push(o.city);
      }
    });
    uniqueCities.sort();
    var cityOptions = [{ value: '', label: 'جميع المدن' }].concat(
      uniqueCities.map(function(c) { return { value: c, label: c }; })
    );
    if (cityWrap && window.renderCustomSelect) {
      window.renderCustomSelect(cityWrap, cityOptionsCache, cityFilter, function(val) {
        cityFilter = val;
        currentPage = 1;
        invalidateFilteredCache();
        refreshDetails();
        refreshTableData();
      });
    }
  }

  /* ── 4. Table Rows and Pagination data binder ────────────────────────────── */
  function backendOrderSort() {
    var parts = String(sortVal || 'date_desc').split('_');
    var field = parts.slice(0, -1).join('_');
    var fields = {
      date: 'dashboardDate',
      total: 'totalPrice',
      commission: 'profitAfterTax',
      customer: 'customerName',
      city: 'city',
      product: 'products',
      status: 'statusBucket',
      id: 'orderScopeKey'
    };
    return { sortBy: fields[field] || 'dashboardDate', sortDir: parts[parts.length - 1] === 'asc' ? 'asc' : 'desc' };
  }

  function canUseBackendOrdersPage() {
    return backendOrdersEnabled &&
      activeStageId === 'all' &&
      !statusFilter &&
      !dateFilter &&
      window.DashboardQueryRuntime &&
      typeof window.DashboardQueryRuntime.query === 'function';
  }

  async function refreshTableData() {
    var requestId = ++backendOrdersRequest;
    var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var rowsEl = document.getElementById('s3-rows');
    var pagWrap = document.getElementById('s3-pagination-wrap');
    if (!rowsEl) return;

    // Filter, search, and sort records
    var backendPage = null;
    if (canUseBackendOrdersPage()) {
      var backendSort = backendOrderSort();
      backendPage = await window.DashboardQueryRuntime.query('orders', {
        page: currentPage,
        pageSize: perPage,
        includeCanceled: true,
        sortBy: backendSort.sortBy,
        sortDir: backendSort.sortDir,
        filters: {
          search: searchTerm,
          product: productFilter,
          city: cityFilter
        }
      }, data).catch(function () { return null; });
      if (requestId !== backendOrdersRequest || !mountEl.isConnected) return;
      if (!backendPage || !backendPage.ok) backendPage = null;
    }
    var allFiltered = backendPage
      ? (backendPage.rows || []).map(normalizeBackendOrder)
      : getFilteredAndSortedOrders();
    var totalFiltered = backendPage && backendPage.pagination
      ? Number(backendPage.pagination.total || 0)
      : allFiltered.length;

    // Calculate dynamic pagination pages
    var totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));
    if (currentPage > totalPages) currentPage = totalPages;

    var start = (currentPage - 1) * perPage;
    var end = Math.min(start + perPage, totalFiltered);
    var pageOrders = backendPage ? allFiltered : allFiltered.slice(start, end);

    var mapPinSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(54, 4, 83, 0.35)' : 'rgba(255,255,255,0.35)') + ' " stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';

    // 1. Draw Table Rows
    if (pageOrders.length === 0) {
      rowsEl.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:48px;color:rgba(255,255,255,0.4);font-size:14px;">' +
        tt('orders.emptyFiltered') +
      '</td></tr>';
    } else {
      rowsEl.innerHTML = pageOrders.map(function (o, i) {
        return '<tr class="s3-order-row" style="cursor:pointer; transition:background 0.15s; text-align:right; animation-delay: ' + (i * 12) + 'ms;">' +
          '<td style="color:#3b82f6;font-weight:700;font-family:monospace;text-align:right;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' + o.id + '</td>' +
          '<td style="font-size:11px;color:#93c5fd;font-family:monospace;text-align:right;direction:ltr;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' + (o.phone || '—') + '</td>' +
          '<td style="text-align:right;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' +
            '<div style="color:#fff;font-weight:700;">' + o.customer + '</div>' +
          '</td>' +
          '<td style="color:rgba(255,255,255,0.75);text-align:right;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' +
            '<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end; font-weight:700;">' + o.city + mapPinSvg + '</div>' +
          '</td>' +
          '<td style="text-align:right;min-width:0;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' +
            '<div style="display:flex;align-items:center;gap:10px;justify-content:flex-start;min-width:0;direction:' + (isRtl ? 'rtl' : 'ltr') + ';">' +
              productThumb(o.type, 36) +
              '<span data-i18n-preserve style="color:rgba(255,255,255,0.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;font-weight:700;">' + o.product + '</span>' +
            '</div>' +
          '</td>' +
          '<td style="color:#fff;text-align:right;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);font-variant-numeric:tabular-nums;"><span style="font-weight:700;">' + formatReadableNumber(o.total, 2) + '</span> <span style="font-size:10px;color:rgba(255,255,255,0.5);">' + activeCurrency + '</span></td>' +
          '<td style="color:#f59e0b;font-weight:700;text-shadow:0 0 8px rgba(245,158,11,0.3);text-align:right;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);font-variant-numeric:tabular-nums;">' + formatReadableNumber(o.commission, 2) + ' <span style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:500;">' + activeCurrency + '</span></td>' +
          '<td style="color:' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(54, 4, 83, 0.4)' : 'rgba(255,255,255,0.4)') + ';font-size:12px;text-align:right;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' + formatDate(o.date) + '</td>' +
          '<td style="text-align:right;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' + statusPill(o.status) + '</td>' +
          '<td style="text-align:right;width:36px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.015);">' +
            '<button style="background:transparent;border:none;cursor:pointer;padding:6px;color:rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;margin-right:auto;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(54, 4, 83, 0.4)' : 'rgba(255,255,255,0.4)') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>' +
            '</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    // 2. Draw dynamic pagination controllers
    if (pagWrap) {
      if (totalFiltered === 0) {
        pagWrap.innerHTML = '';
        return;
      }

      var startLabel = totalFiltered === 0 ? 0 : start + 1;
      var endLabel = end;
      var totalLabel = totalFiltered;
      var pagesHtml = '';
      var prevDisabled = currentPage <= 1 ? 'disabled' : '';
      var nextDisabled = currentPage >= totalPages ? 'disabled' : '';

      if (!window.renderDashboardPagination) {
      pagWrap.innerHTML = 
        /* Page Limit selector (RTL alignment) */
        '<div style="display:flex;align-items:center;gap:10px;font-size:11px;color:rgba(255,255,255,0.55);flex-direction:row-reverse;">' +
          '<span>' + tx('عرض') + '</span>' +
          '<div id="s3-per-page-wrap" style="min-width:60px;"></div>' +
          '<span>' + tx('لكل صفحة') + '</span>' +
        '</div>' +
        
        /* Page Navigation Buttons list */
        '<div class="explorer-pagination-controls" style="display:flex;align-items:center;gap:4px;flex-direction:row-reverse;">' +
          '<button class="pagination-btn" id="s3-pag-prev" ' + prevDisabled + '>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</button>' +
          pagesHtml +
          '<button class="pagination-btn" id="s3-pag-next" ' + nextDisabled + '>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>' +
          '</button>' +
        '</div>' +
        
        /* showing numbers count */
        '<div class="explorer-pagination-info" style="font-size:11px;color:rgba(255,255,255,0.55);">' + tt('orders.pagination', { start: startLabel, end: endLabel, total: totalLabel }) + '</div>';

      }

      if (window.renderDashboardPagination) {
        pagWrap.innerHTML = window.renderDashboardPagination({
          currentPage: currentPage,
          totalPages: totalPages,
          pageButtonClass: 's3-page-btn',
          prevId: 's3-pag-prev',
          nextId: 's3-pag-next',
          pageSizeWrapId: 's3-per-page-wrap',
          pageSizeLabelBefore: tx('\u0639\u0631\u0636'),
          pageSizeLabelAfter: tx('\u0644\u0643\u0644 \u0635\u0641\u062d\u0629'),
          infoText: tt('orders.pagination', { start: startLabel, end: endLabel, total: totalLabel })
        });
      }

      // Initialize dynamic per-page limits dropdown selector
      var perPageWrap = document.getElementById('s3-per-page-wrap');
      var perPageOptions = [
        { value: '10', label: '10' },
        { value: '25', label: '25' },
        { value: '50', label: '50' },
        { value: '100', label: '100' }
      ];
      if (perPageWrap && window.renderCustomSelect) {
        window.renderCustomSelect(perPageWrap, perPageOptions, perPage.toString(), function(val) {
          perPage = parseInt(val, 10) || 10;
          currentPage = 1;
          refreshTableData();
        });
      }

      // Bind click handlers to page button numbers
      pagWrap.querySelectorAll('.pagination-btn[data-page]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var p = parseInt(btn.getAttribute('data-page'), 10);
          if (!isNaN(p)) {
            currentPage = p;
            refreshTableData();
          }
        });
      });

      var prevBtn = document.getElementById('s3-pag-prev');
      var nextBtn = document.getElementById('s3-pag-next');
      
      if (prevBtn && currentPage > 1) {
        prevBtn.addEventListener('click', function() {
          currentPage--;
          refreshTableData();
        });
      }
      if (nextBtn && currentPage < totalPages) {
        nextBtn.addEventListener('click', function() {
          currentPage++;
          refreshTableData();
        });
      }
    }
  }

  /* ── Full section Render ─────────────────────────────────────────────────── */
  function render() {
    var isRtl = window.dashboardI18n ? window.dashboardI18n.isRtl() : true;
    var html =
      '<div class="dash-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;background:#080b12;direction:' + (isRtl ? 'rtl' : 'ltr') + ';">' +

        /* Page title headers */
        '<div style="padding-top:28px;padding-bottom:16px;padding-left:40px;padding-right:40px;text-align:center;">' +
          '<h1 id="s3-h1" style="font-size:30px;font-weight:900;color:var(--dash-text,#fff);margin:0;opacity:0;transform:translateY(-8px);transition:opacity 0.4s ease,transform 0.4s ease;">' + tt('orders.pipelineTitle') + '</h1>' +
          '<div id="s3-sub" style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dash-text-faint,rgba(255,255,255,0.45));margin-top:8px;justify-content:center;flex-direction:row-reverse;opacity:0;transition:opacity 0.4s ease 0.1s;">' +
            tt('orders.pipelineHint') +
            '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '</div>' +
        '</div>' +

        /* Dynamic modules placeholders */
        '<div class="s3-body" style="padding:0 40px 40px;flex:1;" id="s3-body">' +
          '<div id="s3-pipeline-container"></div>' +
          '<div id="s3-details-container"></div>' +
          '<div id="s3-table-container"></div>' +
        '</div>' +

      '</div>';

    mountEl.innerHTML = html;
    
    // Draw all dynamic blocks
    refreshPipeline();
    refreshDetails();
    refreshTableContainer();
    refreshTableData();
    
    // Trigger entrance animations
    animate();
  }

  /* ── Entrance animations ─────────────────────────────────────────────────── */
  function animate() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var h1  = document.getElementById('s3-h1');
        var sub = document.getElementById('s3-sub');
        if (h1)  { h1.style.opacity = '1';  h1.style.transform  = 'translateY(0)'; }
        if (sub) { sub.style.opacity = '1'; }
      });
    });
  }

  /* ── Run ─────────────────────────────────────────────────────────────────────────── */
  render();

  /* ── Theme-change observer: re-render pipeline strip on data-theme toggle ────── */
  if (mountEl._s3ThemeObserver) {
    mountEl._s3ThemeObserver.disconnect();
    mountEl._s3ThemeObserver = null;
  }
  var _s3ThemeObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === 'data-theme') {
        var shellEl = mountEl.closest && mountEl.closest('.dash-shell');
        if (!shellEl || shellEl._dashboardActiveSection !== 'orders') return;
        refreshPipeline();
        return;
      }
    }
  });
  _s3ThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mountEl._s3ThemeObserver = _s3ThemeObserver;
};
