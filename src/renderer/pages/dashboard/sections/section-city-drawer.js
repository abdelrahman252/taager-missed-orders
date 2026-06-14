/* ══════════════════════════════════════════════════════════════════════════════
   section-city-drawer.js  (T-21)
   City Intelligence Drawer — slides in from the right side of the viewport.

   Exposed on window:
     window.CityIntelligenceDrawer.open(cityName, geoData)
     window.CityIntelligenceDrawer.close()

   Depends on (soft):
     window.scoreBadge(score, type)   — T-03
     window.formatSAR(n)              — dashboard-shared.js
     window.animateNumber(el, to)     — dashboard-shared.js
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  /* live theme check — re-evaluated every time it's used so theme switches work */
  function _il() { return document.documentElement.getAttribute('data-theme') === 'light'; }
  function getIsAr() {
    return window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  }
  function pick(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (getIsAr() ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }
  function s6Txt(en, ar) { return pick(en, ar); }
  function sTx(en, ar) { return pick(en, ar); }
  function tx(en, ar) { return pick(en, ar); }
  function dashText(en, ar) { return pick(en, ar); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function truncateText(value, maxChars) {
    var text = String(value == null ? '' : value);
    return text.length > maxChars ? text.slice(0, Math.max(0, maxChars - 3)) + '...' : text;
  }

  // =======================================================================
  // IMPORTANT WARNING: Do not translate cities or provinces. 
  // Do not translate cities or provinces.
  // Force showing the city and the province name in Arabic everywhere.
  // =======================================================================

  /* ── DOM IDs ─────────────────────────────────────────────────────────────── */
  var DRAWER_ID   = 'geo-city-drawer';
  var BACKDROP_ID = 'geo-city-drawer-backdrop';

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function sar(n) {
    var currency = window.dashboardActiveCurrency || 'SAR';
    if (window.formatDashboardMoney) return window.formatDashboardMoney(n || 0, currency, 0);
    if (window.formatSAR) return window.formatSAR(n || 0, 0, currency);
    var v = Math.round(n || 0);
    return v.toLocaleString('en-US') + ' ' + currency;
  }

  function pct(n, dec) {
    dec = dec == null ? 1 : dec;
    return (+(n || 0)).toFixed(dec) + '%';
  }

  function num(n) {
    return Math.round(n || 0).toLocaleString('en-US');
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* colour helpers */
  function ndrColor(ndr) {
    /* ndr is a percentage value 0-100 */
    return window.dashboardRateColor ? window.dashboardRateColor(ndr) : (ndr >= 40 ? '#22d3ee' : ndr >= 30 ? '#00e676' : ndr >= 20 ? '#f59e0b' : '#ef4444');
  }

  function drColor(dr) {
    return window.dashboardRateColor ? window.dashboardRateColor(dr) : (dr >= 40 ? '#22d3ee' : dr >= 30 ? '#00e676' : dr >= 20 ? '#f59e0b' : '#ef4444');
  }

  function badge(score, type) {
    if (window.scoreBadge) return window.scoreBadge(score, type);
    return '<span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;background:#7c3aed22;color:#a855f7;border:1px solid #a855f744">' + (score || 0) + '</span>';
  }

  /* ── Province chip ───────────────────────────────────────────────────────── */
  function provinceChip(provinceId) {
    var pm   = window.dashboardGeoData && window.dashboardGeoData.geo && window.dashboardGeoData.geo.provinceMap;
    var id   = provinceId || 'other';
    var meta = (pm && pm[id]) || (pm && pm['other']) || { color: '#64748b', name: id };
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;' +
      'border-radius:20px;font-size:10px;font-weight:700;' +
      'background:' + meta.color + '18;color:' + meta.color + ';border:1px solid ' + meta.color + '44;">' +
      '<span style="width:5px;height:5px;border-radius:50%;background:' + meta.color + ';flex-shrink:0"></span>' +
      meta.name + '</span>';
  }

  /* ── Insight type icons ──────────────────────────────────────────────────── */
  function insightIcon(type) {
    var map = { risk: '⚠️', opportunity: '💡', observation: '📊', recommendation: '🎯' };
    return map[type] || '📌';
  }

  /* ── KPI card (premium) ────────────────────────────────────────── */
  function kpiCell(label, valueHTML, accent, icon) {
    accent = accent || (_il() ? 'rgba(15,5,30,0.85)' : 'rgba(255,255,255,0.85)'); /* theme-aware default */
    var iconHtml = icon ? '<span style="font-size:14px;opacity:0.8">' + icon + '</span>' : '';
    return '<div style="background:'+(_il()?'linear-gradient(145deg,rgba(0,0,0,0.03),rgba(0,0,0,0.01))':'linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))')+';border:1px solid '+(_il()?'rgba(0,0,0,0.09)':'rgba(255,255,255,0.06)')+';' +
      'border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;box-shadow:0 4px 12px rgba(0,0,0,0.1);transition:transform 0.2s">' +
      '<div style="display:flex;align-items:center;gap:6px;font-size:10px;color:'+(_il()?'rgba(30,10,60,0.5)':'rgba(255,255,255,0.45)')+';font-weight:700">' + iconHtml + label + '</div>' +
      '<div style="font-size:16px;font-weight:900;color:' + accent + ';line-height:1">' + valueHTML + window.supposedBadgeHtml(label) + '</div>' +
    '</div>';
  }

  /* ── Section header ──────────────────────────────────────────────────────── */
  function sectionHead(title) {
    return '<div style="font-size:11px;font-weight:800;color:'+(_il()?'rgba(30,10,60,0.45)':'rgba(255,255,255,0.35)')+';' +
      'letter-spacing:0.08em;text-transform:uppercase;margin:14px 0 8px;">' + title + '</div>';
  }

  /* ── Divider ─────────────────────────────────────────────────────────────── */
  function HR() { return '<div style="border:none;border-top:1px solid '+(_il()?'rgba(0,0,0,0.08)':'rgba(255,255,255,0.06)')+';margin:4px 0"></div>'; }

  /* ════════════════════════════════════════════════════════════════════════════
     SECTION 1 — Header
  ══════════════════════════════════════════════════════════════════════════════ */
  function renderHeader(cityName, cityData) {
    var riskScore    = (cityData && cityData.riskScore)    || 0;
    var scalingScore = (cityData && cityData.scalingScore) || 0;
    var provinceId   = (cityData && cityData.provinceId)   || 'other';

    return '<div style="padding:20px 22px 16px;border-bottom:1px solid '+(_il()?'rgba(0,0,0,0.08)':'rgba(255,255,255,0.06)')+';">' +
      /* Close button */
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">' +
        '<div>' +
          '<div style="font-size:22px;font-weight:900;color:'+(_il()?'#1e0a3c':'#fff')+';letter-spacing:-0.5px;margin-bottom:6px">' + cityName + '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            provinceChip(provinceId) +
            '<div class="cool-tooltip" data-tooltip="' + sTx('Index reflecting the risk level of the region based on returns and pending amounts', 'مؤشر يعكس مدى خطورة المنطقة بناءً على المرتجعات والمبالغ المعلقة') + '">' + badge(riskScore, 'risk') + '</div>' +
            '<div class="cool-tooltip" data-tooltip="' + sTx("Index reflecting the region's suitability for sales growth and expansion", 'مؤشر يعكس قابية المنطقة لزيادة المبيعات والتوسع') + '">' + badge(scalingScore, 'scale') + '</div>' +
          '</div>' +
        '</div>' +
        // '<button id="city-drawer-close" onclick="window.CityIntelligenceDrawer.close()" style="' +
        //   'width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,0.12);' +
        //   'background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);cursor:pointer;' +
        //   'font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
        //   'transition:background 0.2s;font-family:inherit;" ' +
        //   'onmouseenter="this.style.background=\'rgba(255,255,255,0.1)\'" ' +
        //   'onmouseleave="this.style.background=\'rgba(255,255,255,0.05)\'">✕</button>' +
      '</div>' +
    '</div>';
  }

  function renderKpiGrid(cityData) {
    if (!cityData) return '<div style="padding:16px;color:'+(_il()?'rgba(30,10,60,0.4)':'rgba(255,255,255,0.3)')+';font-size:13px">' + tx('No data', 'لا توجد بيانات') + '</div>';

    var orders      = window.DashboardOrderMetrics
      ? window.DashboardOrderMetrics.netOrders(cityData)
      : (cityData.netOrderCount != null ? cityData.netOrderCount : cityData.count || 0);
    var revenue     = cityData.totalRevenue   || cityData.due || 0;
    // drPct and ndrPct may not be pre-computed on the raw cityStats object.
    // Compute them on the fly from the raw counters when needed.
    var drPct = (typeof cityData.drPct === 'number' && cityData.drPct > 0)
      ? cityData.drPct
      : (cityData.drBaseOrders > 0
          ? parseFloat(((cityData.deliveredOrders / cityData.drBaseOrders) * 100).toFixed(1))
          : 0);
    var ndrPct = (typeof cityData.ndrPct === 'number')
      ? cityData.ndrPct
      : (orders > 0
          ? parseFloat(((cityData.deliveredOrders / orders) * 100).toFixed(1))
          : 0);
    var commission  = cityData.earnedCommission || 0;
    var prepaidPct  = cityData.prepaidPct     || 0;
    var codRisk     = cityData.gap            || 0;
    var pipeline    = (cityData.confirmedCount || 0) + (cityData.shippingCount || 0) + (cityData.processingCount || 0);

    return '<div style="padding:0 22px;">' +
      sectionHead(sTx('City Metrics', 'مؤشرات المدينة')) +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Total number of orders in the city', 'إجمالي عدد الطلبات بالمدينة') + '">' + kpiCell(sTx('Orders', 'الطلبات'), '<span class="cdr-orders">' + num(orders) + '</span>', (_il() ? '#1e0a3c' : '#fff'), '📦') + '</div>' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Total expected revenue', 'إجمالي الإيرادات المتوقعة') + '">' + kpiCell(sTx('Revenue', 'الإيرادات'), sar(revenue), '#00e676', '💰') + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Delivery rate of active orders only', 'نسبة التسليم من الطلبات النشطة فقط') + '">' + kpiCell(sTx('DR (Active)', 'DR (نشط)'), '<span style="color:' + drColor(drPct) + '">' + pct(drPct) + '</span>', drColor(drPct), '🚚') + '</div>' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Delivery rate of total orders (NDR)', 'نسبة التسليم من إجمالي الطلبات (NDR)') + '">' + kpiCell(sTx('NDR (Total)', 'NDR (إجمالي)'), '<span style="color:' + ndrColor(ndrPct) + '">' + pct(ndrPct) + '</span>', ndrColor(ndrPct), '📉') + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Earned Taager Profit After Tax from delivered orders', 'ربح تاجر المحقق بعد الضريبة من الطلبات المسلمة') + '">' + kpiCell(sTx('Earned Taager Profit After Tax', 'ربح تاجر المحقق بعد الضريبة'), sar(commission), '#a855f7', '💎') + '</div>' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Percentage of prepaid orders', 'نسبة الطلبات المدفوعة مسبقاً') + '">' + kpiCell(sTx('Prepaid', 'الدفع المسبق'), pct(prepaidPct), '#3b82f6', '💳') + '</div>' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Total orders in delivery and processing', 'إجمالي الطلبات قيد التوصيل والمعالجة') + '">' + kpiCell(sTx('Active orders', 'أوامر نشطة'), '<span style="color:#3b82f6">' + num(pipeline) + '</span>', '#3b82f6', '🔄') + '</div>' +
        '<div class="cool-tooltip" data-tooltip="' + sTx('Pending amounts expected to be collected (COD Risk)', 'المبالغ المعلقة المتوقع تحصيلها (خطر COD)') + '">' + kpiCell(sTx('COD Risk', 'مخاطر COD'), sar(codRisk), codRisk > 5000 ? '#ef4444' : '#f59e0b', '⚠️') + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════════════════════
     SECTION 3 — Products in this City
  ══════════════════════════════════════════════════════════════════════════════ */
  function renderProductsTable(cityData) {
    var productMap = cityData && cityData.productMap;
    if (!productMap || Object.keys(productMap).length === 0) {
      return '<div style="padding:0 22px;">' +
        sectionHead(sTx('Products in this City', 'المنتجات في هذه المدينة')) +
        '<div style="color:'+(_il()?'rgba(15,5,30,0.4)':'rgba(255,255,255,0.3)')+';font-size:12px;padding:8px 0">' + sTx('No product data available', 'لا توجد بيانات منتجات') + '</div>' +
      '</div>';
    }

    /* Sort by Taager profit desc, cap at 10. The commission key is a compatibility field. */
    var entries = Object.keys(productMap).map(function (key) {
      var d = productMap[key];
      return {
        key:        key,
        name:       d.name || key,
        sku:        d.sku || '',
        orders:     d.orders     || 0,
        delivered:  d.delivered  || 0,
        canceled:   d.canceled   || 0,
        commission: d.commission || 0,
        activeOrders: d.activeOrders || 0,
        ndrPct:     (d.ndrBaseOrders || d.orders || 0) > 0 ? ((d.delivered || 0) / (d.ndrBaseOrders || d.orders || 0) * 100) : 0,
        drPct:      (d.activeOrders || 0) > 0 ? ((d.delivered || 0) / (d.activeOrders || 0) * 100) : 0
      };
    });
    entries.sort(function (a, b) { return b.commission - a.commission; });
    if (entries.length > 10) entries = entries.slice(0, 10);

    var align = sTx('left', 'right');
    var COLS = 'minmax(120px,1.2fr) 50px 90px 80px 90px';

    var rows = entries.map(function (e) {
      var nc = ndrColor(e.ndrPct);
      var dc = drColor(e.drPct);

      var fullName = e.name || e.sku || '';
      /* Shorter truncation so it never bleeds */
      var shortName = truncateText(fullName, 40);
      var shortSku  = truncateText(e.sku, 28);

      var nameLine = '<div style="font-size:11px;font-weight:700;color:'+(_il()?'rgba(15,5,30,0.9)':'rgba(255,255,255,0.9)')+';' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;' +
        'text-align:' + align + ';" title="' + esc(fullName) + '">' + esc(shortName) + '</div>';
      var skuLine = (e.name && e.sku && e.name !== e.sku)
        ? '<div style="font-size:9px;font-weight:600;color:'+(_il()?'rgba(15,5,30,0.35)':'rgba(255,255,255,0.35)')+';' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;' +
          'margin-top:1px;direction:ltr;text-align:' + align + ';" title="' + esc(e.sku) + '">' + esc(shortSku) + '</div>'
        : '';

      /* Profit: show the formatted number plus the active dashboard currency label. */
      var commVal = Math.round(e.commission || 0);
      var commStr = commVal >= 1000
        ? (commVal / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
        : String(commVal);

      return '<div class="drawer-product-row" data-search="' + esc((e.name + ' ' + e.sku).toLowerCase()) + '" ' +
        'style="display:grid;grid-template-columns:' + COLS + ';' +
        'align-items:center;gap:6px;padding:6px 0;min-width:0;width:100%;box-sizing:border-box;' +
        'border-bottom:1px solid '+(_il()?'rgba(0,0,0,0.06)':'rgba(255,255,255,0.04)')+';">' +
        /* col 1 — product name + sku */
        '<div style="display:flex;flex-direction:column;gap:0;overflow:hidden;min-width:0;">' +
          nameLine + skuLine +
        '</div>' +
        /* col 2 — orders */
        '<div style="font-size:11px;font-weight:600;color:'+(_il()?'rgba(15,5,30,0.6)':'rgba(255,255,255,0.55)')+';text-align:center;white-space:nowrap">' + num(e.orders) + '</div>' +
        /* col 3 — NDR + DR stacked */
        '<div style="display:flex;flex-direction:column;align-items:center;gap:1px">' +
          '<div style="font-size:9.5px;font-weight:800;color:' + nc + ';white-space:nowrap">' +
            pct(e.ndrPct) + '<span style="font-size:7.5px;opacity:0.55;margin-left:1px">NDR</span>' +
          '</div>' +
          '<div style="font-size:9.5px;font-weight:800;color:' + dc + ';white-space:nowrap">' +
            pct(e.drPct) + '<span style="font-size:7.5px;opacity:0.55;margin-left:1px">DR</span>' +
          '</div>' +
        '</div>' +
        /* col 4 — Taager profit */
        '<div style="font-size:10.5px;font-weight:700;color:#00e676;text-align:center;white-space:nowrap;" title="' + esc(sar(e.commission)) + '">' +
          commStr + '<span style="font-size:7.5px;opacity:0.55;margin-left:1px">' + (window.dashboardActiveCurrency || 'SAR') + '</span>' + window.supposedBadgeHtml('profit') +
        '</div>' +
        /* col 5 — risk badge */
        '<div style="display:flex;justify-content:center;align-items:center;overflow:hidden;min-width:0;">' +
          '<div style="transform:scale(0.85);transform-origin:center center;white-space:nowrap">' +
            badge(Math.round(clamp(100 - e.ndrPct * 1.5, 0, 100)), 'risk') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div style="padding:0 16px;box-sizing:border-box;width:100%;">' +
      sectionHead(sTx('Products in this City', 'المنتجات في هذه المدينة')) +
      /* search box */
      '<div style="margin-bottom:10px;">' +
        '<input type="text" id="drawer-product-search" ' +
          'placeholder="' + sTx('Search by product name or code...', 'ابحث باسم المنتج أو الرمز...') + '" ' +
          'style="width:100%;box-sizing:border-box;background:'+(_il()?'rgba(0,0,0,0.04)':'rgba(255,255,255,0.05)')+';' +
          'border:1px solid '+(_il()?'rgba(0,0,0,0.12)':'rgba(255,255,255,0.1)')+';border-radius:8px;padding:7px 12px;' +
          'color:'+(_il()?'#1e0a3c':'#fff')+';font-size:11px;outline:none;font-family:inherit;">' +
      '</div>' +
      /* column headers — must match COLS exactly */
      '<div style="display:grid;grid-template-columns:' + COLS + ';gap:6px;width:100%;box-sizing:border-box;' +
        'padding:0 0 5px;border-bottom:1px solid '+(_il()?'rgba(0,0,0,0.10)':'rgba(255,255,255,0.08)')+';">' +
        '<div style="font-size:9.5px;font-weight:700;color:'+(_il()?'rgba(30,10,60,0.4)':'rgba(255,255,255,0.28)')+';text-align:' + align + ';letter-spacing:0.04em">' + sTx('PRODUCT', 'المنتج') + '</div>' +
        '<div style="font-size:9.5px;font-weight:700;color:'+(_il()?'rgba(30,10,60,0.4)':'rgba(255,255,255,0.28)')+';text-align:center;letter-spacing:0.04em">' + sTx('ORDERS', 'طلبات') + '</div>' +
        '<div style="font-size:9.5px;font-weight:700;color:'+(_il()?'rgba(30,10,60,0.4)':'rgba(255,255,255,0.28)')+';text-align:center;letter-spacing:0.04em">' + sTx('NDR/DR', 'التسليم') + '</div>' +
        // Taager dashboard/status/NDR migration: the COMM column is Taager profit.
        '<div style="font-size:9.5px;font-weight:700;color:'+(_il()?'rgba(30,10,60,0.4)':'rgba(255,255,255,0.28)')+';text-align:center;letter-spacing:0.04em">' + sTx('PROFIT', 'ربح تاجر') + '</div>' +
        '<div style="font-size:9.5px;font-weight:700;color:'+(_il()?'rgba(30,10,60,0.4)':'rgba(255,255,255,0.28)')+';text-align:center;letter-spacing:0.04em">' + sTx('RISK', 'خطر') + '</div>' +
      '</div>' +
      '<div class="dash-scroll" style="max-height:160px;overflow-y:auto;overflow-x:hidden;">' +
        rows +
      '</div>' +
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════════════════════
     SECTION 4 — Payment Intelligence
  ══════════════════════════════════════════════════════════════════════════════ */
  function renderPaymentIntelligence(cityData) {
    if (!cityData) return '';

    var prepaidCount = cityData.prepaidCount || 0;
    var codCount     = cityData.codCount     || 0;
    var total        = prepaidCount + codCount || 1;

    if (prepaidCount === 0) {
      return '<div style="padding:0 22px;">' +
        sectionHead(sTx('Payment Intelligence', 'ذكاء الدفع')) +
        '<div style="background:'+(_il()?'rgba(0,0,0,0.03)':'rgba(255,255,255,0.02)')+';border:1px solid '+(_il()?'rgba(0,0,0,0.08)':'rgba(255,255,255,0.06)')+';' +
          'border-radius:10px;padding:14px;color:'+(_il()?'rgba(30,10,60,0.45)':'rgba(255,255,255,0.3)')+';font-size:12px;text-align:center">' +
          sTx('Prepaid payment-method data is not available. Enable EasyOrders enrichment to compare prepaid and COD for this city.', 'بيانات طريقة الدفع المسبق غير متوفرة. فعّل إثراء EasyOrders لمقارنة الدفع المسبق و COD لهذه المدينة.') +
        '</div>' +
      '</div>';
    }

    /* Compute split NDR */
    var prepaidDel     = cityData.prepaidDeliveredCount || 0;
    var prepaidCanceled = cityData.prepaidCanceledCount || 0;
    var codDel          = cityData.codDeliveredCount    || 0;
    var codCanceled     = cityData.codCanceledCount     || 0;

    /* Prefer explicit codNdr / prepaidNdr if stored */
    var prepaidNdrBase = cityData.prepaidNdrBaseOrders || prepaidCount;
    var codNdrBase = cityData.codNdrBaseOrders || codCount;
    var prepaidNdr = typeof cityData.prepaidNdr === 'number' ? cityData.prepaidNdr
      : (prepaidNdrBase > 0 ? (prepaidDel / prepaidNdrBase * 100) : 0);
    var codNdr     = typeof cityData.codNdr === 'number' ? cityData.codNdr
      : (codNdrBase > 0 ? (codDel / codNdrBase * 100) : (cityData.ndrPct || 0));

    var delta      = prepaidNdr - codNdr;
    var prepaidPct = prepaidCount / total * 100;
    var codPct     = codCount     / total * 100;
    var deltaBetter = delta > 0;

    function payBar(label, pct2, ndrVal, color) {
      return '<div style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
          '<span style="font-size:11px;font-weight:700;color:'+(_il()?'rgba(15,5,30,0.75)':'rgba(255,255,255,0.7)')+'">' + label + '</span>' +
          '<span style="font-size:11px;color:' + ndrColor(ndrVal) + ';font-weight:700">NDR ' + pct(ndrVal) + '</span>' +
        '</div>' +
        '<div style="height:6px;border-radius:3px;background:'+(_il()?'rgba(0,0,0,0.09)':'rgba(255,255,255,0.06)')+';overflow:hidden">' +
          '<div style="height:100%;width:' + Math.round(pct2) + '%;background:' + color + ';border-radius:3px;transition:width 0.5s ease"></div>' +
        '</div>' +
        '<div style="font-size:10px;color:'+(_il()?'rgba(15,5,30,0.4)':'rgba(255,255,255,0.3)')+';margin-top:3px">' + pct(pct2) + ' ' + sTx('of orders', 'من الطلبات') + '</div>' +
      '</div>';
    }

    var deltaHtml = deltaBetter
      ? '<div style="background:#00e67618;border:1px solid #00e67633;border-radius:10px;padding:10px 14px;' +
          'font-size:12px;font-weight:700;color:#00e676;margin-top:8px;">' +
          '✅ ' + sTx('Prepaid delivers better by ', 'الدفع المسبق يسلّم أفضل بـ ') + pct(Math.abs(delta)) + sTx(' in this city', ' في هذه المدينة') +
        '</div>'
      : '<div style="background:'+(_il()?'rgba(0,0,0,0.03)':'rgba(255,255,255,0.03)')+';border:1px solid '+(_il()?'rgba(0,0,0,0.08)':'rgba(255,255,255,0.06)')+';' +
          'border-radius:10px;padding:10px 14px;font-size:12px;color:'+(_il()?'rgba(15,5,30,0.5)':'rgba(255,255,255,0.4)')+';margin-top:8px;">' +
          sTx('No notable difference between payment methods', 'لا فارق ملحوظ بين طرق الدفع') +
        '</div>';

    return '<div style="padding:0 22px;">' +
      sectionHead(sTx('Payment Intelligence', 'ذكاء الدفع')) +
      '<div style="background:'+(_il()?'rgba(0,0,0,0.03)':'rgba(255,255,255,0.02)')+';border:1px solid '+(_il()?'rgba(0,0,0,0.08)':'rgba(255,255,255,0.06)')+';' +
        'border-radius:12px;padding:14px;">' +
        payBar(sTx('Prepaid', 'دفع مسبق'), prepaidPct, prepaidNdr, '#3b82f6') +
        payBar('COD', codPct, codNdr, '#f59e0b') +
        deltaHtml +
      '</div>' +
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════════════════════
     SECTION 5 — City Insights with Pagination
  ══════════════════════════════════════════════════════════════════════════════ */
  var drawerInsightsState = {
    cityName: '',
    geoData: null,
    items: [],
    page: 1,
    pageSize: 4
  };

  function generatePagination(currentPage, totalPages, typeClass) {
    if (totalPages <= 1) return '';

    if (window.renderDashboardPagination) {
      return window.renderDashboardPagination({
        currentPage: currentPage,
        totalPages: totalPages,
        pageButtonClass: typeClass,
        prevClass: typeClass + '-prev',
        nextClass: typeClass + '-next',
        className: 'dash-pagination-compact city-drawer-pagination',
        infoText: ''
      });
    }
    
    var btnBase = 'background:transparent;border:1px solid '+(_il()?'rgba(0,0,0,0.15)':'rgba(255,255,255,0.1)')+';color:'+(_il()?'rgba(30,10,60,0.55)':'rgba(255,255,255,0.45)')+';border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:all 0.15s;cursor:pointer;';
    var activeBase = 'background:rgba(124,58,237,0.22);border:1px solid rgba(124,58,237,0.55);color:#a855f7;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;';
    var disabledBase = 'background:transparent;border:1px solid '+(_il()?'rgba(0,0,0,0.07)':'rgba(255,255,255,0.05)')+';color:'+(_il()?'rgba(30,10,60,0.25)':'rgba(255,255,255,0.2)')+';border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:not-allowed;';

    var html = '<div style="display:flex;justify-content:center;align-items:center;gap:6px;margin-top:14px;padding-top:14px;border-top:1px solid '+(_il()?'rgba(0,0,0,0.08)':'rgba(255,255,255,0.06)')+';">';
    
    var prevDisabled = currentPage === 1;
    html += '<button class="' + typeClass + '" data-page="' + (currentPage - 1) + '" ' + 
      (prevDisabled ? 'disabled style="' + disabledBase + '"' : 'style="' + btnBase + '" onmouseover="this.style.background=\'rgba(124,58,237,0.08)\'" onmouseout="this.style.background=\'transparent\'"') + 
      '>&lt;</button>';
      
    var maxPagesToShow = 5;
    var startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    var endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
      html += '<button class="' + typeClass + '" data-page="1" style="' + btnBase + '" onmouseover="this.style.background=\'rgba(124,58,237,0.08)\'" onmouseout="this.style.background=\'transparent\'">1</button>';
      if (startPage > 2) {
        html += '<span style="color:'+(_il()?'rgba(30,10,60,0.45)':'rgba(255,255,255,0.45)')+';font-size:12px;display:flex;align-items:end;padding-bottom:4px;">...</span>';
      }
    }

    for (var i = startPage; i <= endPage; i++) {
      if (i === currentPage) {
        html += '<div style="' + activeBase + '">' + i + '</div>';
      } else {
        html += '<button class="' + typeClass + '" data-page="' + i + '" style="' + btnBase + '" onmouseover="this.style.background=\'rgba(124,58,237,0.08)\'" onmouseout="this.style.background=\'transparent\'">' + i + '</button>';
      }
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        html += '<span style="color:'+(_il()?'rgba(30,10,60,0.45)':'rgba(255,255,255,0.45)')+';font-size:12px;display:flex;align-items:end;padding-bottom:4px;">...</span>';
      }
      html += '<button class="' + typeClass + '" data-page="' + totalPages + '" style="' + btnBase + '" onmouseover="this.style.background=\'rgba(124,58,237,0.08)\'" onmouseout="this.style.background=\'transparent\'">' + totalPages + '</button>';
    }

    var nextDisabled = currentPage === totalPages;
    html += '<button class="' + typeClass + '" data-page="' + (currentPage + 1) + '" ' + 
      (nextDisabled ? 'disabled style="' + disabledBase + '"' : 'style="' + btnBase + '" onmouseover="this.style.background=\'rgba(124,58,237,0.08)\'" onmouseout="this.style.background=\'transparent\'"') + 
      '>&gt;</button>';
      
    html += '</div>';
    return html;
  }

  function updateDrawerInsightsPage() {
    var container = document.getElementById('sp-recs-drawer-container');
    if (!container) return;

    var items = drawerInsightsState.items;
    var page = drawerInsightsState.page;
    var pageSize = drawerInsightsState.pageSize;

    if (items.length === 0) {
      container.innerHTML = '<div style="color:'+(_il()?'rgba(30,10,60,0.35)':'rgba(255,255,255,0.25)')+';font-size:12px;padding:8px 0;text-align:center">' +
          sTx('No insights for this city', 'لا توجد رؤى خاصة بهذه المدينة') +
        '</div>';
      return;
    }

    var start = (page - 1) * pageSize;
    var end = start + pageSize;
    var pageItems = items.slice(start, end);

    var priorityColor = { critical: '#ef4444', high: '#f59e0b', medium: '#14b8a6', low: '#64748b' };

    var cardsHtml = pageItems.map(function (ins) {
      var pc = priorityColor[ins.priority] || '#64748b';
      var bg = pc + '10';
      var border = pc + '33';
      var align = sTx('left', 'right');
      var cardDir = sTx('ltr', 'rtl');
      var helper = window.TaagerSmartInsights;
      var trust = helper && helper.trustLabel ? helper.trustLabel(ins.trust || 'measured') : ((ins.trust === 'estimated') ? 'Estimated' : 'Measured');
      var confidence = ins.confidence || (ins.metric && ins.metric.orders >= 30 ? 'strong' : (ins.metric && ins.metric.orders >= 15 ? 'developing' : 'limited'));
      var evidence = Array.isArray(ins.evidence) ? ins.evidence.filter(Boolean) : [];
      var evidenceHtml = evidence.length
        ? '<div style="font-size:10px;font-weight:700;color:'+(_il()?'rgba(15,5,30,0.45)':'rgba(255,255,255,0.38)')+';line-height:1.5;margin-bottom:6px;text-align:' + align + ';">' + evidence.slice(0, 2).join(' · ') + '</div>'
        : '';
      return '<div style="display:flex;gap:12px;padding:14px;border-radius:12px;margin-bottom:10px;' +
        'background:' + bg + ';border:1px solid ' + border + ';box-shadow:0 4px 12px rgba(0,0,0,0.1)">' +
        '<div style="font-size:18px;flex-shrink:0">' + insightIcon(ins.type) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:800;color:' + pc + ';margin-bottom:4px;text-align:' + align + ';">' + (ins.title || '') + '</div>' +
          '<div style="display:flex;gap:6px;justify-content:' + (align === 'right' ? 'flex-end' : 'flex-start') + ';margin-bottom:6px;flex-wrap:wrap">' +
            '<span style="font-size:9px;font-weight:800;text-transform:uppercase;color:' + pc + ';background:' + pc + '18;border:1px solid ' + pc + '33;border-radius:999px;padding:2px 7px;">' + trust + '</span>' +
            '<span style="font-size:9px;font-weight:700;text-transform:uppercase;color:'+(_il()?'rgba(15,5,30,0.45)':'rgba(255,255,255,0.42)')+';background:'+(_il()?'rgba(15,5,30,0.04)':'rgba(255,255,255,0.035)')+';border:1px solid '+(_il()?'rgba(15,5,30,0.08)':'rgba(255,255,255,0.06)')+';border-radius:999px;padding:2px 7px;">' + confidence + '</span>' +
          '</div>' +
          '<div style="font-size:11px;font-weight:600;color:'+(_il()?'rgba(15,5,30,0.7)':'rgba(255,255,255,0.7)')+';line-height:1.6;margin-bottom:6px;text-align:' + align + ';">' + (ins.body || '') + '</div>' +
          evidenceHtml +
          (ins.recommendation ? '<div style="font-size:10px;font-weight:700;color:'+(_il()?'rgba(15,5,30,0.5)':'rgba(255,255,255,0.4)')+';display:flex;align-items:flex-start;gap:4px;justify-content:flex-start;direction:' + cardDir + ';"><span style="color:' + pc + '">↳</span>' + ins.recommendation + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    var totalPages = Math.ceil(items.length / pageSize);
    var paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = generatePagination(page, totalPages, 'drawer-insight-page-btn');
    }

    container.innerHTML = cardsHtml + paginationHtml;

    if (totalPages > 1 && window.bindDashboardPagination) {
      window.bindDashboardPagination(container, {
        pageButtonSelector: '.drawer-insight-page-btn[data-page]',
        prevSelector: '.drawer-insight-page-btn-prev',
        nextSelector: '.drawer-insight-page-btn-next',
        onPage: function (page) {
          drawerInsightsState.page = page;
          updateDrawerInsightsPage();
        },
        onPrev: function () {
          if (drawerInsightsState.page > 1) {
            drawerInsightsState.page--;
            updateDrawerInsightsPage();
          }
        },
        onNext: function () {
          if (drawerInsightsState.page < totalPages) {
            drawerInsightsState.page++;
            updateDrawerInsightsPage();
          }
        }
      });
    }
  }

  /* ════════════════════════════════════════════════════════════════════════════
     DOM: create / reuse drawer + backdrop
  ══════════════════════════════════════════════════════════════════════════════ */
  function _applyDrawerTheme(el) {
    /* Always called on open() so theme switches are reflected immediately */
    el.style.background  = _il() ? 'rgba(255,255,255,0.97)' : 'rgba(13,21,37,0.85)';
    el.style.borderLeft  = '1px solid ' + (_il() ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)');
    el.style.boxShadow   = _il() ? '-8px 0 40px rgba(0,0,0,0.12)' : '-8px 0 40px rgba(0,0,0,0.6)';
  }

  function getOrCreateDrawer() {
    var el = document.getElementById(DRAWER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = DRAWER_ID;
      el.className = 'dash-overlay-scope';
      el.style.cssText = [
        'position:fixed', 'top:0', 'right:0',
        'width:720px', 'max-width:100vw',
        'height:100vh', 'height:100dvh',
        'backdrop-filter:blur(16px)',
        '-webkit-backdrop-filter:blur(16px)',
        'z-index:1000',
        'display:flex', 'flex-direction:column',
        'transform:translateX(100%)',
        'transition:transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        'font-family:inherit',
        'direction:inherit'
      ].join(';');
      document.body.appendChild(el);
    } else {
      el.classList.add('dash-overlay-scope');
    }
    /* Always refresh theme-sensitive styles so switching theme + reopening works */
    _applyDrawerTheme(el);
    return el;
  }

  function getOrCreateBackdrop() {
    var el = document.getElementById(BACKDROP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BACKDROP_ID;
      el.style.cssText = [
        'position:fixed', 'inset:0',
        'background:rgba(0,0,0,0.55)',
        'z-index:999',
        'opacity:0',
        'transition:opacity 0.3s ease',
        'cursor:pointer'
      ].join(';');
      el.addEventListener('click', function () { CityIntelligenceDrawer.close(); });
      document.body.appendChild(el);
    }
    return el;
  }

  /* ── Keyboard: ESC closes ────────────────────────────────────────────────── */
  function _escHandler(e) {
    if (e.key === 'Escape') CityIntelligenceDrawer.close();
  }

  /* ════════════════════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════════════════════ */
  var CityIntelligenceDrawer = {

    open: function (cityName, geoData) {
        
      if (!cityName) return;

      var geo      = (geoData && geoData.geo) || {};
      var cityStats = geo.cityStats || {};
      var cityData  = cityStats[cityName] || null;

      var drawer   = getOrCreateDrawer();
      var backdrop = getOrCreateBackdrop();

      drawer.style.direction = getIsAr() ? 'rtl' : 'ltr';

      var allInsights = (geoData && geoData.geo && geoData.geo.insights) || [];
      var cityInsights = allInsights.filter(function (ins) {
        return ins.city === cityName;
      });

      drawerInsightsState.cityName = cityName;
      drawerInsightsState.geoData = geoData;
      drawerInsightsState.items = cityInsights;
      drawerInsightsState.page = 1;

      /* Build content */
      var content =
        renderHeader(cityName, cityData) +
        '<div id="city-drawer-body" class="dash-scroll" style="flex:1;overflow-y:auto;padding-bottom:32px;">' +
          renderKpiGrid(cityData) +
          HR() +
          renderProductsTable(cityData) +
          HR() +
          renderPaymentIntelligence(cityData) +
          HR() +
          '<div style="padding:0 22px;">' +
            sectionHead(sTx('Smart Insights', 'رؤى ذكية')) +
            '<div id="sp-recs-drawer-container"></div>' +
          '</div>' +
        '</div>';

      drawer.innerHTML = content;
      updateDrawerInsightsPage();

      /* Search filter */
      var searchInput = drawer.querySelector('#drawer-product-search');
      if (searchInput) {
        searchInput.addEventListener('input', function(e) {
          var val = e.target.value.toLowerCase();
          var rows = drawer.querySelectorAll('.drawer-product-row');
          rows.forEach(function(row) {
            var searchStr = row.getAttribute('data-search') || '';
            if (searchStr.indexOf(val) > -1) {
              row.style.display = 'grid';
            } else {
              row.style.display = 'none';
            }
          });
        });
      }

      /* Animate numbers */
      if (cityData && window.animateNumber) {
        var ordersEl = drawer.querySelector('.cdr-orders');
        if (ordersEl) window.animateNumber(ordersEl, cityData.count || 0);
      }

      /* Show */
      backdrop.style.display = 'block';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          backdrop.style.opacity = '1';
          drawer.style.transform = 'translateX(0)';
        });
      });

      /* Escape key */
      document.removeEventListener('keydown', _escHandler);
      document.addEventListener('keydown', _escHandler);

      /* Sync FilterBus if available */
      if (window.DashboardFilterBus) {
        window.DashboardFilterBus.setState({ selectedCity: cityName });
      }
    },

    close: function () {
      var drawer   = document.getElementById(DRAWER_ID);
      var backdrop = document.getElementById(BACKDROP_ID);

      if (drawer)   drawer.style.transform  = 'translateX(100%)';
      if (backdrop) backdrop.style.opacity  = '0';

      document.removeEventListener('keydown', _escHandler);

      setTimeout(function () {
        if (backdrop) backdrop.style.display = 'none';
      }, 320);

      /* Clear city selection in FilterBus */
      if (window.DashboardFilterBus) {
        window.DashboardFilterBus.setState({ selectedCity: null });
      }
    }
  };

  window.CityIntelligenceDrawer = CityIntelligenceDrawer;

})();
