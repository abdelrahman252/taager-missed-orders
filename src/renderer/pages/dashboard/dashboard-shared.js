/* ══════════════════════════════════════════════════════════════════════════════
   dashboard-shared.js
   Exposes on window:
     COLOR_MAP, ICONS, icon(name, opts)
     sparklineSvg(data, color, w, h)
     deltaBadge(delta, accent)
     sectionBadge(num, title, color)
     sectionTopBar(opts)
     kpiCard(opts)       → full-size portrait card HTML
     s8KpiCard(opts)     → compact landscape card HTML (Section 8)
     animateNumber(el, to, opts)
     formatSAR(n, decimals)
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Viewport utility ────────────────────────────────────────────────────── */
  window.dashViewport = function() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    return { w: w, xs: w < 600, sm: w < 800, md: w < 1100, lg: w < 1400 };
  };

  window.dashboardThemeColors = function(root) {
    var el = root || document.getElementById('page-dashboard') || document.documentElement;
    var css = getComputedStyle(el);
    function read(name, fallback) {
      var value = css.getPropertyValue(name);
      return value && value.trim() ? value.trim() : fallback;
    }
    return {
      bg: read('--dash-bg', read('--bg', '#080b12')),
      surface: read('--dash-surface', read('--bg2', '#0b1120')),
      elevated: read('--dash-surface-2', read('--bg3', '#0d1220')),
      border: read('--dash-border', 'rgba(148,163,184,0.18)'),
      borderSoft: read('--dash-border-soft', 'rgba(148,163,184,0.12)'),
      text: read('--dash-text', read('--text', '#f8fafc')),
      muted: read('--dash-text-muted', read('--text2', '#cbd5e1')),
      faint: read('--dash-text-faint', read('--text3', '#94a3b8')),
      grid: read('--dash-chart-grid', 'rgba(148,163,184,0.18)'),
      label: read('--dash-chart-label', read('--dash-text-muted', '#cbd5e1')),
      input: read('--dash-input-bg', read('--bg3', '#111827'))
    };
  };

  /* ── Color map ───────────────────────────────────────────────────────────── */
  window.COLOR_MAP = {
    cyan:   '#22d3ee',
    green:  '#00e676',
    orange: '#f59e0b',
    red:    '#ef4444',
    blue:   '#3b82f6',
    purple: '#a855f7',
    teal:   '#14b8a6',
    gold:   '#fbbf24',
  };

  window.dashboardRateColor = function (value, opts) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    if (opts && opts.scale === 'ratio') n *= 100;
    if (n >= 40) return window.COLOR_MAP.cyan;
    if (n >= 30) return window.COLOR_MAP.green;
    if (n >= 20) return window.COLOR_MAP.orange;
    return window.COLOR_MAP.red;
  };

  /* ── Inline SVG icons ────────────────────────────────────────────────────── */
  window.ICONS = {
    home:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 9.5L12 3l9 6.5V21H3z"/><path d="M9 21V12h6v9"/></svg>',
    truck:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="1" y="3" width="15" height="13" rx="1"/>' +
      '<path d="M16 8h4l3 5v4h-7V8z"/>' +
      '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    creditCard:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    package:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M16.5 9.4L7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
      '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    mapPin:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    trendingUp:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    calculator:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="2" width="16" height="20" rx="2"/>' +
      '<line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/>' +
      '<line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/>' +
      '<line x1="16" y1="14" x2="16" y2="18"/></svg>',
    fileText:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/>' +
      '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    /* FontAwesome ports used in KpiCard */
    moneyBill:
      '<svg viewBox="0 0 576 512" fill="currentColor">' +
      '<path d="M64 64C28.7 64 0 92.7 0 128v256c0 35.3 28.7 64 64 64h448c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm64 96h320c0 35.3 28.7 64 64 64v64c-35.3 0-64 28.7-64 64H128c0-35.3-28.7-64-64-64v-64c35.3 0 64-28.7 64-64zm96 192a96 96 0 1 1 128 0 96 96 0 0 1-128 0zm96-128a32 32 0 1 0 0 64 32 32 0 0 0 0-64z"/></svg>',
    truckFast:
      '<svg viewBox="0 0 640 512" fill="currentColor">' +
      '<path d="M48 0C21.5 0 0 21.5 0 48v320c0 26.5 21.5 48 48 48h16c0 53 43 96 96 96s96-43 96-96h128c0 53 43 96 96 96s96-43 96-96h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V288 256 237.3c0-17-6.7-33.3-18.7-45.3L512 128H416V48c0-26.5-21.5-48-48-48H48zm0 48H368V176v48H256c-8.8 0-16 7.2-16 16v96H48V48zM160 464a48 48 0 1 1 0-96 48 48 0 0 1 0 96zm368-48a48 48 0 1 1-96 0 48 48 0 0 1 96 0zM256 272h64v80H256v-80zm128 0h133.3L544 355l.7 1H384V272z"/></svg>',
    circleXmark:
      '<svg viewBox="0 0 512 512" fill="currentColor">' +
      '<path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>',
    boxOpen:
      '<svg viewBox="0 0 640 512" fill="currentColor">' +
      '<path d="M256.7 54.5L174.4 32 36 108.5l100.1 27.7L256.7 54.5zm246.6 0L382.7 136.2 604 76.7 503.3 54.5zm53.2 42.2L449.9 136 571.6 168.9l68.8-100.5-82.9-71.7zM87.9 167.5L320.3 232l232.4-64.5L320.3 104.7 87.9 167.5zM0 436.6V196.1l160 44.4v157.1L0 436.6zm640-240.5v240.5l-160-38.9V240.5l160-44.4zM182.4 253.1v149.5L320 440.4l137.6-37.8V253.1L320 291l-137.6-37.9z"/></svg>',
    shieldHalved:
      '<svg viewBox="0 0 512 512" fill="currentColor">' +
      '<path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0z"/></svg>',
    user:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
      '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
      '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    bell:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    pulse:
      '<svg viewBox="0 0 44 20" fill="none">' +
      '<polyline points="0,10 8,10 12,3 16,17 20,10 26,10 30,5 34,14 38,10 44,10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    list:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>' +
      '<line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    diamond:
      '<svg viewBox="0 0 36 36" fill="none">' +
      '<polygon points="18,2 34,18 18,34 2,18" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<polygon points="18,8 28,18 18,28 8,18" fill="currentColor" opacity="0.25"/>' +
      '<circle cx="18" cy="18" r="4" fill="currentColor"/>' +
      '<circle cx="18" cy="18" r="2" fill="#fff"/></svg>',
    megaphone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 11v3a2 2 0 0 0 2 2h2l3 5h3l-2.2-5H13l8 3V6l-8 3H5a2 2 0 0 0-2 2z"/>' +
      '<path d="M21 9.5a3.5 3.5 0 0 1 0 6"/></svg>',
    activity:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    barChart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    upload:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
    wallet:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5z"/>' +
      '<path d="M21 12H16a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/><path d="M19 12v.01"/></svg>',
  };

  /**
   * icon(name, { size=16, color='currentColor' }) → HTML string
   */
  window.icon = function (name, opts) {
    opts = opts || {};
    var size  = opts.size  || 16;
    var color = opts.color || 'currentColor';
    var svg   = window.ICONS[name];
    if (!svg) return '';
    return svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" style="color:' + color + ';vertical-align:middle;flex-shrink:0" ');
  };

  function activeDashboardCurrency() {
    if (window.dashboardActiveCurrency) return window.dashboardActiveCurrency;
    var country = window.dashboardActiveCountry || 'sa';
    return window.TaagerCurrency && window.TaagerCurrency.countryCurrency
      ? window.TaagerCurrency.countryCurrency(country)
      : 'SAR';
  }

  window.formatDashboardMoney = function (n, currency, decimals, opts) {
    decimals = (decimals === undefined) ? 0 : decimals;
    currency = currency || activeDashboardCurrency();
    if (window.TaagerCurrency && window.TaagerCurrency.format) {
      return window.TaagerCurrency.format(n, currency, Object.assign({ decimals: decimals }, opts || {}));
    }
    if (window.dashboardI18n) return window.dashboardI18n.number(n, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }) + ' ' + currency;
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }) + ' ' + currency;
  };

  /* Compatibility alias: most dashboard sections still call formatSAR. */
  window.formatSAR = function (n, decimals, currency) {
    return window.formatDashboardMoney(n, currency, decimals);
  };

  window.formatDashboardNumber = function (value, opts) {
    opts = opts || {};
    var n = Number(value || 0);
    if (!isFinite(n)) n = 0;
    var decimals = opts.decimals == null ? 0 : Number(opts.decimals || 0);
    var compact = opts.compact === true;
    var compactThreshold = opts.compactThreshold == null ? 100000 : Math.max(1000, Number(opts.compactThreshold) || 100000);
    var abs = Math.abs(n);
    var suffix = '';
    if (compact && abs >= 1000000000) {
      n = n / 1000000000;
      suffix = 'B';
      decimals = abs >= 10000000000 ? 1 : 2;
    } else if (compact && abs >= 1000000) {
      n = n / 1000000;
      suffix = 'M';
      decimals = abs >= 10000000 ? 1 : 2;
    } else if (compact && abs >= compactThreshold) {
      n = n / 1000;
      suffix = 'K';
      decimals = abs >= 100000 ? 1 : Math.min(decimals, 1);
    }
    var localeOpts = {
      minimumFractionDigits: opts.minimumFractionDigits == null ? decimals : opts.minimumFractionDigits,
      maximumFractionDigits: opts.maximumFractionDigits == null ? decimals : opts.maximumFractionDigits
    };
    var formatted = window.dashboardI18n ? window.dashboardI18n.number(n, localeOpts) : Number(n).toLocaleString('en-US', localeOpts);
    return formatted + suffix;
  };

  function dashText(key, fallback) {
    var value = window.dashboardI18n ? window.dashboardI18n.t(key) : key;
    if (value && value !== key) return value;
    var isAr = window.dashboardI18n && window.dashboardI18n.isRtl && window.dashboardI18n.isRtl();
    return isAr ? (fallback || key) : key;
  }

  function helpHtml(text) {
    if (!text) return '';
    if (window.TaagerUI && typeof window.TaagerUI.help === 'function') {
      return window.TaagerUI.help(text);
    }
    return '<span class="taager-help" tabindex="0" role="button" data-tooltip="' + String(text).replace(/"/g, '&quot;') + '">?</span>';
  }

  /* ── animateNumber ───────────────────────────────────────────────────────── */
  window.animateNumber = function (el, to, opts) {
    if (!el) return;
    opts = opts || {};
    var duration  = Math.min(opts.duration || 520, 700);
    var decimals  = opts.decimals  || 0;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var start     = performance.now();
    var fmt = function (n) {
      if (opts.compact && window.formatDashboardNumber) {
        return window.formatDashboardNumber(n, { decimals: decimals, compact: true });
      }
      if (window.dashboardI18n) return window.dashboardI18n.number(n, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
      return Number(n.toFixed(decimals)).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    };
    if (reduceMotion || duration <= 16 || !document.body.contains(el)) {
      el.textContent = fmt(to);
      el.dataset.animatedTo = String(to);
      return;
    }
    function tick(now) {
      if (!document.body.contains(el)) return;
      var t      = Math.min(1, (now - start) / duration);
      var eased  = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(to * eased);
      if (t < 1) requestAnimationFrame(tick);
      else el.dataset.animatedTo = String(to);
    }
    requestAnimationFrame(tick);
  };

  /* ── sparklineSvg ────────────────────────────────────────────────────────── */
  window.sparklineSvg = function (data, color, w, h) {
    w = w || 80; h = h || 32;
    if (!data || data.length < 2) return '';
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);
    var rng = max - min || 1;
    var pts = data.map(function (v, i) {
      var x = (i / (data.length - 1)) * w;
      var y = h - ((v - min) / rng) * h;
      return x + ',' + y;
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none">' +
      '<polyline points="' + pts + '" stroke="' + color + '" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  };

  /* ── deltaBadge ──────────────────────────────────────────────────────────── */
  window.deltaBadge = function (delta, accent) {
    var positive = delta >= 0;
    var clr = accent || (positive ? '#00e676' : '#ef4444');
    var arrow = positive ? '↑' : '↓';
    var value = window.dashboardI18n ? window.dashboardI18n.number(Math.abs(delta), { maximumFractionDigits: 1 }) : Math.abs(delta);
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 14px;' +
      'border-radius:8px;font-size:13px;font-weight:700;background:' + clr + '22;' +
      'color:' + clr + ';border:1px solid ' + clr + '40;letter-spacing:0.3px;white-space:nowrap;">' +
      arrow + ' ' + value + '%</span>';
  };

  /* ── sectionBadge ────────────────────────────────────────────────────────── */
  window.sectionBadge = function (num, title, color) {
    color = color || '#a855f7';
    title = window.dashboardI18n ? window.dashboardI18n.raw(title) : title;
    var align = window.dashboardI18n && !window.dashboardI18n.isRtl() ? 'flex-start' : 'flex-end';
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;justify-content:' + align + ';">' +
      '<span style="font-size:14px;font-weight:700;color:#fff;">' + title + '</span>' +
      '<div style="width:26px;height:26px;border-radius:50%;background:' + color + '22;' +
      'border:1.5px solid ' + color + '80;display:flex;align-items:center;justify-content:center;' +
      'font-size:11px;font-weight:900;color:' + color + ';flex-shrink:0;">' + num + '</div>' +
      '</div>';
  };

  /* ── sectionTopBar ───────────────────────────────────────────────────────── */
  // opts: { centerTitle, account, month }
  window.sectionTopBar = function (opts) {
    opts = opts || {};
    var _d = new Date();
    var _defaultMonth = window.dashboardI18n ? window.dashboardI18n.formatMonth(_d.getFullYear(), _d.getMonth()) : (['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][_d.getMonth()] + ' ' + _d.getFullYear());
    var _liveTime = ('0' + _d.getHours()).slice(-2) + ':' + ('0' + _d.getMinutes()).slice(-2);

    var tr = window.dashboardI18n;
    var title   = tr ? tr.raw(opts.centerTitle || tr.t('nav.master')) : (opts.centerTitle || 'رؤى سريعة');
    var account = tr ? tr.raw(opts.account || window.currentActiveAccountLabel || tr.t('shell.allAccounts')) : (opts.account || window.currentActiveAccountLabel || 'كل الحسابات المشتركة');
    var month   = opts.month       || _defaultMonth;
    var liveLabel = tr ? tr.t('shell.lastUpdateToday') : 'آخر تحديث: اليوم';
    return '<div class="dash-topbar" style="display:flex;justify-content:space-between;align-items:center;' +
      'padding:11px 32px;border-bottom:1px solid rgba(255,255,255,0.05);' +
      'background:#080b12;position:sticky;top:0;z-index:10;flex-shrink:0;" dir="' + (tr ? tr.dir() : 'rtl') + '">' +
      /* right side: account + month chips */
      '<div class="dash-topbar-right" style="display:flex;gap:10px;">' +
        '<div id="topbar-account-selector" style="display:flex;align-items:center;gap:7px;padding:6px 14px;border-radius:9px;' +
          'border:1px solid rgba(255,255,255,0.11);background:rgba(255,255,255,0.04);cursor:pointer;">' +
          window.icon('user', {size:13, color:'rgba(255,255,255,0.45)'}) +
          '<span style="font-size:12px;color:rgba(255,255,255,0.65);font-weight:600;">' + account + '</span>' +
          '<span style="color:rgba(255,255,255,0.3);font-size:9px;">▾</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:7px;padding:6px 14px;border-radius:9px;' +
          'border:1px solid rgba(255,255,255,0.11);background:rgba(255,255,255,0.04);">' +
          window.icon('calendar', {size:13, color:'rgba(255,255,255,0.4)'}) +
          '<span style="font-size:12px;color:#f59e0b;font-weight:700;">' + month + '</span>' +
        '</div>' +
      '</div>' +
      /* center: dots + title + dots */
      '<div class="dash-topbar-center" style="display:flex;align-items:center;gap:14px;">' +
        '<div style="display:flex;gap:5px;">' +
          '<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.2);display:inline-block;"></span>' +
          '<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.2);display:inline-block;"></span>' +
        '</div>' +
        '<span style="font-size:16px;font-weight:700;color:#fff;letter-spacing:0.5px;">' + title + '</span>' +
        '<div style="display:flex;gap:5px;">' +
          '<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.2);display:inline-block;"></span>' +
          '<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.2);display:inline-block;"></span>' +
        '</div>' +
      '</div>' +
      /* left side: live dot + time */
      '<div class="dash-topbar-left" style="display:flex;align-items:center;gap:14px;">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:#00e676;display:inline-block;box-shadow:0 0 8px #00e676aa;"></span>' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.45);">' + liveLabel + '</span>' +
        '</div>' +
        '<span style="font-size:13px;color:rgba(255,255,255,0.7);font-weight:600;">' + _liveTime + '</span>' +
        '<button style="background:none;border:none;cursor:pointer;padding:4px;display:flex;flex-direction:column;gap:4px;">' +
          '<span style="display:block;width:20px;height:2px;border-radius:1px;background:rgba(255,255,255,0.55);"></span>' +
          '<span style="display:block;width:14px;height:2px;border-radius:1px;background:rgba(255,255,255,0.55);"></span>' +
          '<span style="display:block;width:20px;height:2px;border-radius:1px;background:rgba(255,255,255,0.55);"></span>' +
        '</button>' +
      '</div>' +
    '</div>';
  };


  /* ── Icon picker for KpiCard ─────────────────────────────────────────────── */
  function cardIconHtml(accent, type, size) {
    var map = { green: 'moneyBill', orange: 'truckFast', red: 'circleXmark', blue: 'boxOpen', purple: 'shieldHalved' };
    var name = map[type] || 'boxOpen';
    return window.icon(name, { size: size, color: accent });
  }

  /* ── kpiCard (full-size, portrait — Section 1 / Sections 1–4 of S8) ─────── */
  window.kpiCard = function (opts) {
    var label    = window.dashboardI18n ? window.dashboardI18n.raw(opts.label || '') : (opts.label || '');
    var value    = opts.value        || 0;
    var rawDisplayValue = opts.displayValue != null ? opts.displayValue : value;
    var unit     = window.dashboardI18n ? window.dashboardI18n.raw(opts.unit || '') : (opts.unit || '');
    var delta    = opts.delta        || 0;
    var hideDelta = opts.hideDelta === true;
    var staticDisplay = opts.staticDisplay === true;
    var color    = opts.color        || 'green';
    var spark    = opts.sparklineData || opts.spark || [];
    var compact  = opts.compact      || false;
    var iconType = opts.iconType     || color;
    var id       = opts.id           || ('kpi-' + Math.random().toString(36).slice(2));
    var tooltip  = opts.tooltip      || '';
    var decimals = opts.decimals != null ? Number(opts.decimals || 0) : (unit === '%' || unit === 'x' ? 1 : 0);
    var displayValue = opts.displayValue != null ? rawDisplayValue : window.formatDashboardNumber(value, { decimals: decimals, compact: true });
    var fullValue = window.formatDashboardNumber(value, { decimals: unit === 'SAR' ? 2 : decimals, compact: false });

    var accent     = window.COLOR_MAP[color] || color;
    var circleSize = compact ? 36 : 46;
    var iconSize   = compact ? 18 : 20;
    var pad        = compact ? '12px 14px' : '16px 18px 14px';
    var minH       = compact ? 'auto' : '160px';
    var numSize    = compact ? '26px' : 'clamp(18px, 1.5vw, 26px)';
    var unitSize   = compact ? '10px' : '12px';

    return '<div class="kpi-card dash-kpi-card" style="background:#0b1120;border:1px solid ' + accent + '35;' +
      'border-radius:16px;box-shadow:0 0 0 1px ' + accent + '20,8px 0 40px ' + accent + '15,inset 0 0 60px ' + accent + '08;' +
      'padding:' + pad + ';position:relative;overflow:hidden;flex:1;min-width:150px;' +
      'display:flex;flex-direction:column;min-height:' + minH + ';box-sizing:border-box;">' +
      /* right-edge stripe */
      '<div style="position:absolute;top:0;right:0;bottom:0;width:3px;background:' + accent + ';' +
        'box-shadow:0 0 18px 6px ' + accent + '90;border-radius:0 16px 16px 0;z-index:1;"></div>' +
      /* radial bg tint */
      '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 90% 40%,' + accent + '14 0%,transparent 55%);pointer-events:none;"></div>' +
      /* top row */
      '<div style="display:flex;justify-content:space-between;align-items:center;width:100%;position:relative;z-index:2;gap:6px;">' +
        '<div class="dash-kpi-label" style="font-size:' + (compact ? '11px' : '13px') + ';color:' + accent + ';line-height:1.3;flex:1;min-width:0;">' + label + helpHtml(tooltip) + '</div>' +
        '<div style="width:' + circleSize + 'px;height:' + circleSize + 'px;border-radius:50%;background:' + accent + '25;' +
          'border:2px solid ' + accent + '60;box-shadow:0 0 14px 4px ' + accent + '55,inset 0 0 10px ' + accent + '22;' +
          'display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          cardIconHtml(accent, iconType, iconSize) +
        '</div>' +
      '</div>' +
      /* middle wrapper to distribute spacing */
      '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:12px 0;">' +
        /* value */
        '<div class="dash-kpi-value" title="' + fullValue + (unit ? ' ' + unit : '') + '" style="font-size:' + numSize + ';font-weight:900;color:#fff;line-height:1;letter-spacing:0;' +
          'position:relative;z-index:2;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">' +
          '<span class="' + ((hideDelta || staticDisplay) ? '' : 'kpi-num') + '" data-id="' + id + '" data-decimals="' + decimals + '" data-compact="true" ' + ((hideDelta || staticDisplay) ? '' : 'data-to="' + value + '"') + '>' + ((hideDelta || staticDisplay) ? displayValue : '0') + '</span>' +
        '</div>' +
        /* unit */
        '<div style="font-size:' + unitSize + ';color:' + accent + ';font-weight:700;margin-top:8px;' +
          'letter-spacing:1.5px;position:relative;z-index:2;text-align:center;">' + unit + '</div>' +
      '</div>' +
      /* bottom row: sparkline + delta (full size only) */
      (!compact ?
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;width:100%;' +
          'position:relative;z-index:2;direction:ltr;">' +
          (spark.length > 1 ? window.sparklineSvg(spark, accent) : '') +
          (hideDelta ? '' : window.deltaBadge(delta, accent)) +
        '</div>'
      : (!hideDelta && delta !== undefined ?
          '<div style="margin-top:auto;position:relative;z-index:2;direction:ltr;display:flex;justify-content:flex-end;">' + window.deltaBadge(delta, accent) + '</div>'
        : '')) +
    '</div>';
  };

  /* ── s8KpiCard (compact landscape — Section 8 master dashboard) ──────────── */
  window.s8KpiCard = function (opts) {
    var label    = window.dashboardI18n ? window.dashboardI18n.raw(opts.label || '') : (opts.label || '');
    var value    = opts.value        || 0;
    var rawDisplayValue = opts.displayValue != null ? opts.displayValue : value;
    var unit     = window.dashboardI18n ? window.dashboardI18n.raw(opts.unit || '') : (opts.unit || '');
    var delta    = opts.delta        || 0;
    var deltaLabel = opts.deltaLabel || (window.dashboardI18n ? window.dashboardI18n.raw('vs previous period') : 'vs previous period');
    var hideDelta = opts.hideDelta === true;
    var staticDisplay = opts.staticDisplay === true;
    var color    = opts.color        || 'green';
    var spark    = opts.sparklineData || opts.spark || [];
    var iconType = opts.iconType     || color;
    var id       = opts.id           || ('s8kpi-' + Math.random().toString(36).slice(2));
    var tooltip  = opts.tooltip      || '';
    var decimals = opts.decimals != null ? Number(opts.decimals || 0) : (unit === '%' || unit === 'x' ? 1 : 0);
    var displayValue = opts.displayValue != null ? rawDisplayValue : window.formatDashboardNumber(value, { decimals: decimals, compact: true });
    var fullValue = window.formatDashboardNumber(value, { decimals: unit === 'SAR' ? 2 : decimals, compact: false });

    var accent     = window.COLOR_MAP[color] || color;
    var isPositive = delta >= 0;
    var dColor     = isPositive ? '#00e676' : '#ef4444';

    /* full-width sparkline with gradient fill */
    var sparkHtml = '';
    if (spark.length > 1) {
      var W = 200, H = 24;
      var min = Math.min.apply(null, spark);
      var max = Math.max.apply(null, spark);
      var rng = max - min || 1;
      var xs = spark.map(function(v,i){ return (i/(spark.length-1))*W; });
      var ys = spark.map(function(v){ return H - 2 - ((v-min)/rng)*(H-6); });
      var pts = xs.map(function(x,i){ return x+','+ys[i]; }).join(' ');
      var gradId = 's8g' + accent.replace(/[^a-f0-9]/gi,'');
      var area = 'M 0,'+H+' '+xs.map(function(x,i){ return 'L '+x+','+ys[i]; }).join(' ')+' L '+W+','+H+' Z';
      sparkHtml = '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="width:100%;height:'+H+'px;display:block;margin-top:auto;padding-top:4px;">' +
        '<defs><linearGradient id="'+gradId+'" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="'+accent+'" stop-opacity="0.28"/>' +
          '<stop offset="100%" stop-color="'+accent+'" stop-opacity="0"/>' +
        '</linearGradient></defs>' +
        '<path d="'+area+'" fill="url(#'+gradId+')"/>' +
        '<polyline points="'+pts+'" stroke="'+accent+'" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    }

    return '<div class="s8-kpi-card" style="background:#0b1120;border:1px solid rgba(255,255,255,0.08);' +
      'border-radius:14px;overflow:hidden;position:relative;direction:ltr;display:flex;flex-direction:row;' +
      'align-items:stretch;padding:12px 14px;gap:12px;flex:1;min-width:180px;">' +
      /* radial glow */
      '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 8% 50%,'+accent+'1c 0%,transparent 58%);pointer-events:none;"></div>' +
      /* icon circle */
      '<div style="width:44px;height:44px;border-radius:50%;background:'+accent+'20;border:1.5px solid '+accent+'65;' +
        'box-shadow:0 0 18px '+accent+'55,inset 0 0 10px '+accent+'18;display:flex;align-items:center;justify-content:center;' +
        'flex-shrink:0;align-self:center;z-index:1;">' +
        cardIconHtml(accent, iconType, 20) +
      '</div>' +
      /* content */
      '<div style="flex:1;min-width:0;display:flex;flex-direction:column;z-index:1;">' +
        '<div class="dash-kpi-label" style="font-size:10px;text-align:' + (window.dashboardI18n && !window.dashboardI18n.isRtl() ? 'left' : 'right') + ';direction:inherit;margin-bottom:3px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + helpHtml(tooltip) + '</div>' +
        '<div style="display:flex;align-items:baseline;justify-content:flex-end;gap:4px;line-height:1;">' +
          '<span title="' + fullValue + (unit ? ' ' + unit : '') + '" style="font-size:20px;font-weight:900;color:#fff;letter-spacing:0;line-height:1;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;" class="dash-kpi-value ' + ((hideDelta || staticDisplay) ? '' : 'kpi-num') + '" data-id="'+id+'" data-decimals="' + decimals + '" data-compact="true" ' + ((hideDelta || staticDisplay) ? '' : 'data-to="'+value+'"') + '>' + ((hideDelta || staticDisplay) ? displayValue : '0') + '</span>' +
          '<span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);direction:inherit;">'+unit+'</span>' +
        '</div>' +
        (hideDelta ? '' : '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin-top:4px;">' +
          '<span style="font-size:12px;font-weight:700;color:'+dColor+';line-height:1;">'+(isPositive?'↑':'↓')+'&nbsp;'+Math.abs(delta)+'%</span>' +
          '<span style="font-size:9px;color:rgba(255,255,255,0.28);direction:inherit;line-height:1;">' + deltaLabel + '</span>' +
        '</div>') +
        sparkHtml +
      '</div>' +
    '</div>';
  };

  /* ── runKpiAnimations() — call after injecting kpiCard/s8KpiCard HTML ─────── */
  window.runKpiAnimations = function (container) {
    var els = (container || document).querySelectorAll('.kpi-num[data-to]');
    els.forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-to'));
      if (el.dataset.animatedTo === String(to)) return;
      window.animateNumber(el, to, {
        duration: 520,
        decimals: parseInt(el.getAttribute('data-decimals') || '0', 10),
        compact: el.getAttribute('data-compact') === 'true'
      });
    });
  };

  /* ── T-03: scoreBadge(score, type) ───────────────────────────────────────────
     Returns an HTML badge string colored green/amber/red based on score and type.
     type: 'risk' | 'scale' | 'profit' | 'health'
     For 'risk': high score = bad (red). For others: high score = good (green).
  ─────────────────────────────────────────────────────────────────────────────── */
  window.scoreBadge = function (score, type) {
    score = Math.round(Math.min(100, Math.max(0, Number(score) || 0)));
    var isRisk = (type === 'risk');
    var color;
    if (isRisk) {
      color = score > 65 ? '#ef4444' : score > 35 ? '#f59e0b' : '#00e676';
    } else {
      color = score > 65 ? '#00e676' : score > 35 ? '#f59e0b' : '#ef4444';
    }
    var label;
    if (isRisk) {
      label = score > 65 ? dashText('Risk', 'خطر') : score > 35 ? dashText('Medium', 'متوسط') : dashText('Safe', 'آمن');
    } else if (type === 'scale') {
      label = score > 65 ? dashText('Scalable', 'قابل للتوسع') : score > 35 ? dashText('Medium', 'متوسط') : dashText('Weak', 'ضعيف');
    } else if (type === 'profit') {
      label = score > 65 ? dashText('Profitable', 'مربح') : score > 35 ? dashText('Medium', 'متوسط') : dashText('Weak', 'ضعيف');
    } else {
      label = score > 65 ? dashText('Excellent', 'ممتاز') : score > 35 ? dashText('Medium', 'متوسط') : dashText('Weak', 'ضعيف');
    }
    var tipKey = isRisk ? 'kpi.score.risk.tooltip' : (type === 'scale' ? 'kpi.score.scale.tooltip' : (type === 'profit' ? 'kpi.score.profit.tooltip' : 'kpi.score.health.tooltip'));
    return '<span data-tooltip="' + dashText(tipKey, '') + '" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;' +
      'border-radius:6px;font-size:10px;font-weight:800;white-space:nowrap;' +
      'background:' + color + '18;color:' + color + ';border:1px solid ' + color + '44;">' +
      score + ' ' + label + '</span>';
  };

  /* ── T-03: heatColor(value, min, max, lowColor, highColor) ───────────────────
     Returns an interpolated hex color string between lowColor and highColor.
     value=min → lowColor, value=max → highColor.
  ─────────────────────────────────────────────────────────────────────────────── */
  window.heatColor = function (value, min, max, lowColor, highColor) {
    var t = (max > min) ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      return {
        r: parseInt(hex.substring(0,2), 16),
        g: parseInt(hex.substring(2,4), 16),
        b: parseInt(hex.substring(4,6), 16)
      };
    }
    function toHex(n) { return ('0' + Math.round(n).toString(16)).slice(-2); }
    var lo = hexToRgb(lowColor  || '#ef4444');
    var hi = hexToRgb(highColor || '#00e676');
    return '#' +
      toHex(lo.r + (hi.r - lo.r) * t) +
      toHex(lo.g + (hi.g - lo.g) * t) +
      toHex(lo.b + (hi.b - lo.b) * t);
  };

  function paginationIcon(name) {
    var points = name === 'next' ? '9 18 15 12 9 6' : '15 18 9 12 15 6';
    return '<svg class="dash-pagination-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="' + points + '"></polyline>' +
    '</svg>';
  }

  function escapeDashPagination(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch];
    });
  }

  window.dashboardPaginationPages = function (currentPage, totalPages, windowSize) {
    currentPage = Math.max(1, Number(currentPage) || 1);
    totalPages = Math.max(1, Number(totalPages) || 1);
    windowSize = Math.max(1, Number(windowSize) || 2);

    var pages = [];
    for (var p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= currentPage - windowSize && p <= currentPage + windowSize)) {
        pages.push(p);
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis');
      }
    }
    return pages;
  };

  window.renderDashboardPagination = function (opts) {
    opts = opts || {};
    var currentPage = Math.max(1, Number(opts.currentPage) || 1);
    var totalPages = Math.max(1, Number(opts.totalPages) || 1);
    if (totalPages <= 1 && !opts.alwaysVisible) return '';

    var pageClass = opts.pageButtonClass || 'dash-page-btn';
    var prevClass = opts.prevClass || '';
    var nextClass = opts.nextClass || '';
    var prevId = opts.prevId ? ' id="' + escapeDashPagination(opts.prevId) + '"' : '';
    var nextId = opts.nextId ? ' id="' + escapeDashPagination(opts.nextId) + '"' : '';
    var prevData = opts.prevPage != null ? ' data-page="' + escapeDashPagination(opts.prevPage) + '"' : '';
    var nextData = opts.nextPage != null ? ' data-page="' + escapeDashPagination(opts.nextPage) + '"' : '';
    var prevDisabled = currentPage <= 1;
    var nextDisabled = currentPage >= totalPages;
    var extraClass = opts.className ? ' ' + opts.className : '';
    var attr = opts.id ? ' id="' + escapeDashPagination(opts.id) + '"' : '';
    var pageWindow = opts.pageWindow == null ? 2 : opts.pageWindow;

    var pageHtml = window.dashboardPaginationPages(currentPage, totalPages, pageWindow).map(function (p) {
      if (p === 'ellipsis') {
        return '<span class="dash-pagination-ellipsis" aria-hidden="true">...</span>';
      }
      var active = p === currentPage;
      return '<button type="button" class="dash-pagination-btn pagination-btn ' + pageClass + (active ? ' active is-active' : '') + '" data-page="' + p + '"' +
        (active ? ' aria-current="page"' : '') + '>' + p + '</button>';
    }).join('');

    var sizeHtml = '';
    if (opts.pageSizeWrapId || opts.pageSizeHtml) {
      sizeHtml =
        '<div class="dash-pagination-size" dir="auto">' +
          (opts.pageSizeLabelBefore ? '<span>' + escapeDashPagination(opts.pageSizeLabelBefore) + '</span>' : '') +
          (opts.pageSizeHtml || '<span id="' + escapeDashPagination(opts.pageSizeWrapId) + '" class="dash-pagination-size-select"></span>') +
          (opts.pageSizeLabelAfter ? '<span>' + escapeDashPagination(opts.pageSizeLabelAfter) + '</span>' : '') +
        '</div>';
    } else {
      sizeHtml = '<div class="dash-pagination-spacer" aria-hidden="true"></div>';
    }

    var infoText = opts.infoText;
    if (infoText == null && opts.totalItems != null) {
      var startItem = opts.startItem == null ? 0 : opts.startItem;
      var endItem = opts.endItem == null ? 0 : opts.endItem;
      var isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
      var ofText = isAr ? ' من ' : ' of ';
      var itemLabel = opts.itemLabel;
      if (!itemLabel) {
        itemLabel = isAr ? 'عناصر' : 'items';
      } else if (itemLabel === 'منتج' || itemLabel === '\u0645\u0646\u062a\u062c') {
        itemLabel = isAr ? 'منتج' : 'products';
      } else if (itemLabel === 'طلب' || itemLabel === '\u0637\u0644\u0628') {
        itemLabel = isAr ? 'طلب' : 'orders';
      }
      infoText = startItem + ' - ' + endItem + ofText + opts.totalItems + ' ' + itemLabel;
    }

    var dir = (window.dashboardI18n && window.dashboardI18n.isRtl && !window.dashboardI18n.isRtl()) ? 'ltr' : 'rtl';
    var iconPrev = paginationIcon(dir === 'rtl' ? 'next' : 'prev');
    var iconNext = paginationIcon(dir === 'rtl' ? 'prev' : 'next');

    return '<div' + attr + ' class="dash-pagination' + extraClass + '" dir="' + dir + '">' +
      sizeHtml +
      '<div class="dash-pagination-controls" role="navigation" aria-label="Pagination">' +
        '<button type="button" class="dash-pagination-btn dash-pagination-arrow pagination-btn ' + prevClass + '"' + prevId + prevData + (prevDisabled ? ' disabled aria-disabled="true"' : '') + ' aria-label="Previous page">' +
          iconPrev +
        '</button>' +
        pageHtml +
        '<button type="button" class="dash-pagination-btn dash-pagination-arrow pagination-btn ' + nextClass + '"' + nextId + nextData + (nextDisabled ? ' disabled aria-disabled="true"' : '') + ' aria-label="Next page">' +
          iconNext +
        '</button>' +
      '</div>' +
      '<div class="dash-pagination-info" dir="auto">' + escapeDashPagination(infoText || '') + '</div>' +
    '</div>';
  };

  window.bindDashboardPagination = function (root, opts) {
    root = root || document;
    opts = opts || {};
    var pageSelector = opts.pageButtonSelector || '.dash-page-btn';
    var prevSelector = opts.prevSelector || '.dash-pagination-arrow:first-child';
    var nextSelector = opts.nextSelector || '.dash-pagination-arrow:last-child';

    root.querySelectorAll(pageSelector).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = parseInt(btn.getAttribute('data-page'), 10);
        if (!isNaN(p) && typeof opts.onPage === 'function') opts.onPage(p);
      });
    });

    var prev = root.querySelector(prevSelector);
    if (prev) {
      prev.addEventListener('click', function () {
        if (!prev.disabled && typeof opts.onPrev === 'function') opts.onPrev();
      });
    }

    var next = root.querySelector(nextSelector);
    if (next) {
      next.addEventListener('click', function () {
        if (!next.disabled && typeof opts.onNext === 'function') opts.onNext();
      });
    }
  };

})();
