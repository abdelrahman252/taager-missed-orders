// ─────────────────────────────────────────────────────────────────────────────
// section6-commission.js - Section 6: Performance Charts (Profit & CPA Trends)
// Vanilla-JS port of components/section6/Section6.jsx with CPA extension
//
// Signature:
//   window.renderSection6(mountEl, data, ctx)
//     mountEl  — HTMLElement to inject into (cleared first)
//     data     — data.commissionTrend  (shape: commissionTrendData)
//     ctx      — { onNavigate, accent, formatSAR, data }
// ─────────────────────────────────────────────────────────────────────────────

window.renderSection6 = function (mountEl, data, ctx) {
  const isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  function s6Txt(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
    
    // Check key in locales before string replacements
    if (window.dashboardI18n && typeof window.dashboardI18n.t === 'function') {
      const locVal = window.dashboardI18n.t(en);
      if (locVal && locVal !== en) {
        value = locVal;
      }
    }

    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }

  // ── state (stored on mountEl to persist across dashboard updates) ─────────
  if (mountEl._s6ActivePeriod === undefined || mountEl._s6ActivePeriod === '30') mountEl._s6ActivePeriod = 'month';
  if (mountEl._s6ActiveMode === undefined) mountEl._s6ActiveMode = 'profit';
  if (mountEl._s6ActiveCpaPlatform === undefined) mountEl._s6ActiveCpaPlatform = 'all';

  const activeAccountId = (ctx && ctx.data && ctx.data.meta && ctx.data.meta.activeAccountId) || (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');
  const roi = (ctx && ctx.data && ctx.data.roi) || {};
  const dateFrom = roi.dateFrom || (ctx && ctx.data && ctx.data.meta && ctx.data.meta.period && ctx.data.meta.period.dateFrom);
  const dateTo = roi.dateTo || (ctx && ctx.data && ctx.data.meta && ctx.data.meta.period && ctx.data.meta.period.dateTo);
  let dashboardDays = 30;
  if (dateFrom && dateTo) {
    const diffTime = Math.abs(new Date(dateTo) - new Date(dateFrom));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 0) dashboardDays = diffDays;
  }

  let activePeriod = mountEl._s6ActivePeriod;
  let activeMode = mountEl._s6ActiveMode;
  let activeCpaPlatform = mountEl._s6ActiveCpaPlatform;
  let dailyAdSpend = 0;
  let syncedSpendActive = false;
  let chartInstance = null;
  let donutChartInstance = null;
  let PLATFORM_ROWS = [];
  let ACCOUNT_CPA = null;
  let MARKETING_SUMMARY = null;

  const _fbMonthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const _fbMonthsAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  // ── data ──────────────────────────────────────────────────────────────────
  const d = data || {};
  const baseCurrency = data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || 'SAR';
  let activeCurrency = baseCurrency;
  const hasInputData = !!data;
  const total      = d.total      ?? 0;
  const totalDelta = d.totalDelta ?? 0;
  const periods    = d.periods    ?? { '7': [], '14': [], '30': [], 'month': [] };
  const benchmarks = d.benchmarks ?? {};

  // Fall-back period data (empty zeroes) — labels use the actual snapshot month name
  function buildFallback(days) {
    var _fbLabel = (d.snapshotMonthLabel && d.snapshotMonthLabel.split(' ')[0]) ||
      (window.dashboardI18n ? window.dashboardI18n.monthName(new Date().getMonth()) :
        (isAr ? _fbMonthsAr : _fbMonthsEn)[new Date().getMonth()]);
    var fb = [];
    for (var _i = 1; _i <= days; _i++) {
      fb.push({ d: _i + ' ' + _fbLabel, v: 0 });
    }
    return fb;
  }

  function convert(val, from, to) {
    if (!val || from === to) return val;
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(val, from, to);
    }
    if (from === 'SAR' && to === 'USD') return val / 3.75;
    if (from === 'USD' && to === 'SAR') return val * 3.75;
    return val;
  }

  function moneyNumber(value, decimals) {
    decimals = decimals == null ? 1 : decimals;
    if (window.formatDashboardNumber && activeCurrency === 'IQD' && Math.abs(Number(value) || 0) >= 100000) {
      return window.formatDashboardNumber(value, {
        decimals: decimals,
        compact: true,
        compactThreshold: 100000,
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      });
    }
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: decimals > 1 ? decimals : 0,
      maximumFractionDigits: decimals
    });
  }

  function moneyNumberMax(value, maxDecimals) {
    maxDecimals = maxDecimals == null ? 2 : maxDecimals;
    if (window.formatDashboardNumber && activeCurrency === 'IQD' && Math.abs(Number(value) || 0) >= 100000) {
      return window.formatDashboardNumber(value, {
        decimals: maxDecimals,
        compact: true,
        compactThreshold: 100000,
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals
      });
    }
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function normalizePlatformKey(platform) {
    var value = String(platform || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (value.indexOf('tiktok') !== -1 || value === 'tt') return 'tiktok';
    if (value.indexOf('snapchat') !== -1 || value === 'snap') return 'snapchat';
    if (value.indexOf('facebook') !== -1 || value === 'meta' || value === 'fb') return 'facebook';
    return value || 'unknown';
  }

  function platformDisplayName(platform) {
    platform = normalizePlatformKey(platform);
    if (platform === 'tiktok') return 'TikTok';
    if (platform === 'snapchat') return 'Snapchat';
    if (platform === 'facebook') return 'Facebook';
    return platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : s6Txt('Unknown', 'غير معروف');
  }

  function platformColor(platform) {
    platform = normalizePlatformKey(platform);
    if (platform === 'tiktok') return '#00e5ff';
    if (platform === 'snapchat') return '#facc15';
    if (platform === 'facebook') return '#60a5fa';
    return '#a855f7';
  }

  function buildPlatformRows(summary) {
    if (!summary) return [];
    const byPlatform = {};
    const order = ['tiktok', 'snapchat', 'facebook'];

    function ensure(platform) {
      platform = normalizePlatformKey(platform);
      if (!byPlatform[platform]) {
        byPlatform[platform] = {
          platform: platform,
          label: platformDisplayName(platform),
          spend: 0,
          purchases: 0,
          purchaseMetric: '',
          purchaseMetricAvailable: false
        };
      }
      return byPlatform[platform];
    }

    const sources = Array.isArray(summary.sourceBreakdown) ? summary.sourceBreakdown : [];
    if (sources.length) {
      sources.forEach(function (source) {
        const platform = normalizePlatformKey(source && source.platform || summary.platform || 'unknown');
        const row = ensure(platform);
        const sourceCurrency = String(source && (source.currency || source.targetCurrency) || summary.currency || activeCurrency).toUpperCase();
        const rawSpend = source && source.rawSpend != null
          ? convert(Number(source.rawSpend || 0), sourceCurrency, activeCurrency)
          : convert(Number(source && (source.convertedSpend || source.adSpend) || 0), String(source && source.targetCurrency || summary.currency || activeCurrency).toUpperCase(), activeCurrency);
        row.spend += Number(rawSpend || 0);
        row.purchases += Number(source && source.purchases || 0);
        row.purchaseMetricAvailable = row.purchaseMetricAvailable || !!(source && source.purchaseMetricAvailable);
        if (!row.purchaseMetric && source && source.purchaseMetric) row.purchaseMetric = String(source.purchaseMetric);
      });
    } else if (Array.isArray(summary.platformBreakdown)) {
      summary.platformBreakdown.forEach(function (source) {
        const platform = normalizePlatformKey(source && source.platform || 'unknown');
        const row = ensure(platform);
        row.label = String(source && source.label || row.label);
        row.spend += convert(Number(source && source.adSpend || 0), String(summary.currency || activeCurrency).toUpperCase(), activeCurrency);
        row.purchases += Number(source && source.purchases || 0);
        row.purchaseMetricAvailable = row.purchaseMetricAvailable || !!(source && source.purchaseMetricAvailable);
        if (!row.purchaseMetric && source && source.purchaseMetric) row.purchaseMetric = String(source.purchaseMetric);
      });
    }

    return Object.keys(byPlatform).map(function (platform) {
      const row = byPlatform[platform];
      row.spend = Number(row.spend.toFixed(2));
      row.purchases = Number(row.purchases.toFixed(2));
      row.cpa = row.purchases > 0 ? Number((row.spend / row.purchases).toFixed(2)) : null;
      row.color = platformColor(platform);
      return row;
    }).sort(function (a, b) {
      const ai = order.indexOf(a.platform);
      const bi = order.indexOf(b.platform);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  function supportedCurrencies() {
    if (window.DashboardRoiState && Array.isArray(window.DashboardRoiState.currencies)) {
      return window.DashboardRoiState.currencies.slice();
    }
    if (window.TaagerCurrency && Array.isArray(window.TaagerCurrency.supported)) {
      return window.TaagerCurrency.supported.slice();
    }
    return ["SAR", "USD", "EGP", "AED", "IQD", "OMR"];
  }

  function bindS6CurrencySelect() {
    var wrap = document.getElementById("s6-currency-select-wrap");
    if (!wrap) return;
    var options = supportedCurrencies().map(function (currency) {
      return { value: currency, label: currency };
    });
    if (window.renderCustomSelect) {
      window.renderCustomSelect(wrap, options, activeCurrency, setS6Currency, {
        maxHeight: "220px",
        ariaLabel: "Performance charts display currency"
      });
      return;
    }
    wrap.innerHTML = '<select id="s6-currency-native" style="width:100%;height:24px;border-radius:var(--dash-radius-sm);border:1px solid rgba(255,255,255,0.12);background:var(--dash-surface);color:#fff;font-size:var(--type-micro);font-weight:var(--weight-semibold);font-family:inherit;padding:0 4px">' +
      options.map(function (opt) {
        return '<option value="' + opt.value + '"' + (opt.value === activeCurrency ? " selected" : "") + '>' + opt.label + '</option>';
      }).join("") +
      '</select>';
  }

  function setS6Currency(currency) {
    if (currency === activeCurrency) return;
    mountEl._s6DailyAdSpendIsManual = false;
    if (window.DashboardRoiState && typeof window.DashboardRoiState.set === "function") {
      window.DashboardRoiState.set({ currency: currency }, activeAccountId, roi);
    } else {
      roi.currency = currency;
      render();
    }
  }

  function getChartData(p) {
    const rows = periods[p] || [];
    if (rows.length > 0) return rows;
    if (hasInputData) return [];
    var daysBack = p === '7' ? 7 : p === '14' ? 14 : dashboardDays;
    return buildFallback(daysBack);
  }

  function getDailyOrdersData(p) {
    const rows = (d.ordersPeriods && d.ordersPeriods[p]) || [];
    if (rows.length > 0) return rows;
    var daysBack = p === '7' ? 7 : p === '14' ? 14 : dashboardDays;
    var fb = [];
    for (var _i = 1; _i <= daysBack; _i++) {
      fb.push({ d: _i + ' ' + _fbMonthsEn[new Date().getMonth()].slice(0, 3), v: 0 });
    }
    return fb;
  }

  function getBreakEvenCpa() {
    const roi = (ctx && ctx.data && ctx.data.roi) || {};
    const avgCommission = Number(roi.averageProfit != null ? roi.averageProfit : roi.avgCommission) || 0;
    const ndrPct = Number(roi.ndrPct) || 0;
    const breakEven = avgCommission * (ndrPct / 100);
    return convert(breakEven, baseCurrency, activeCurrency);
  }

  const CPA_PLATFORM_TABS = [
    { key: 'all', label: 'All' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'snapchat', label: 'Snapchat' },
    { key: 'facebook', label: 'Facebook' }
  ];

  function formatCpaDateLabel(dateText) {
    var text = String(dateText || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || '';
    var date = new Date(text + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return text.slice(5);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function cpaTabLimit() {
    if (activePeriod === '7') return 7;
    if (activePeriod === '14') return 14;
    return null;
  }

  function cpaPlatformTabsHtml() {
    if (activeMode !== 'cpa') return '';
    return '<div id="s6-cpa-platform-tabs" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">' +
      CPA_PLATFORM_TABS.map(function (tab) {
        var active = tab.key === activeCpaPlatform;
        var color = tab.key === 'all' ? '#14b8a6' : platformColor(tab.key);
        return '<button type="button" data-cpa-platform="' + tab.key + '" style="padding:5px 10px;border-radius:var(--dash-radius-sm);border:' +
          (active ? '1.5px solid ' + color : '1px solid rgba(255,255,255,0.11)') + ';background:' +
          (active ? color + '22' : 'rgba(255,255,255,0.035)') + ';color:' +
          (active ? '#fff' : 'rgba(255,255,255,0.52)') + ';font-size:var(--type-caption);font-weight:var(--weight-semibold);cursor:pointer;font-family:inherit;">' +
          escapeHtml(tab.label) + '</button>';
      }).join('') +
    '</div>';
  }

  function dailyPlatformRows(platform) {
    platform = normalizePlatformKey(platform || 'all');
    var summary = MARKETING_SUMMARY || {};
    var rows = Array.isArray(summary.dailyPlatformBreakdown) ? summary.dailyPlatformBreakdown.slice() : [];
    if (!rows.length && Array.isArray(summary.sourceBreakdown)) {
      summary.sourceBreakdown.forEach(function (source) {
        (Array.isArray(source && source.dailyBreakdown) ? source.dailyBreakdown : []).forEach(function (day) {
          rows.push(Object.assign({}, day, { platform: day.platform || source.platform }));
        });
      });
    }
    var byDate = {};
    rows.forEach(function (row) {
      var rowPlatform = normalizePlatformKey(row && row.platform || '');
      if (platform && platform !== 'all' && rowPlatform !== platform) return;
      var date = String(row && row.date || '').slice(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = { date: date, spend: 0, purchases: 0, purchaseMetricAvailable: false };
      var rowCurrency = String(row && (row.currency || row.targetCurrency) || summary.currency || activeCurrency).toUpperCase();
      var rowSpend = row && row.spend != null
        ? Number(row.spend || 0)
        : row && row.convertedSpend != null
        ? Number(row.convertedSpend || 0)
        : row && row.adSpend != null
        ? Number(row.adSpend || 0)
        : row && row.rawSpend != null
        ? convert(Number(row.rawSpend || 0), rowCurrency, activeCurrency)
        : 0;
      byDate[date].spend += Number(rowSpend || 0);
      byDate[date].purchases += Number(row.purchases || 0);
      byDate[date].purchaseMetricAvailable = byDate[date].purchaseMetricAvailable || !!row.purchaseMetricAvailable;
    });
    var result = Object.keys(byDate).sort().map(function (date) {
      var row = byDate[date];
      row.spend = Number(row.spend.toFixed(2));
      row.purchases = Number(row.purchases.toFixed(2));
      return row;
    });
    var limit = cpaTabLimit();
    return limit && result.length > limit ? result.slice(result.length - limit) : result;
  }

  function synthesizedPlatformRows(platform, labels) {
    platform = normalizePlatformKey(platform || 'all');
    var count = Math.max(1, (labels || []).length || (activePeriod === '7' ? 7 : activePeriod === '14' ? 14 : dashboardDays));
    var rows = buildPlatformRows(MARKETING_SUMMARY || {});
    var total = { spend: 0, purchases: 0, purchaseMetricAvailable: false };

    rows.forEach(function (row) {
      if (platform !== 'all' && normalizePlatformKey(row.platform) !== platform) return;
      total.spend += Number(row.spend || 0);
      total.purchases += Number(row.purchases || 0);
      total.purchaseMetricAvailable = total.purchaseMetricAvailable || !!row.purchaseMetricAvailable || Number(row.purchases || 0) > 0;
    });

    if (total.spend <= 0 && platform === 'all') total.spend = Number(dailyAdSpend || 0) * count;
    if (total.spend <= 0 || (platform !== 'all' && total.purchases <= 0 && !total.purchaseMetricAvailable)) return [];

    return Array.from({ length: count }, function (_, index) {
      return {
        date: '',
        label: labels && labels[index] || '',
        spend: total.spend / count,
        purchases: total.purchases / count,
        purchaseMetricAvailable: total.purchaseMetricAvailable,
        synthetic: true
      };
    });
  }

  function platformTotals(platform) {
    platform = normalizePlatformKey(platform || 'all');
    var total = { spend: 0, purchases: 0, purchaseMetricAvailable: false };
    buildPlatformRows(MARKETING_SUMMARY || {}).forEach(function (row) {
      if (platform !== 'all' && normalizePlatformKey(row.platform) !== platform) return;
      total.spend += Number(row.spend || 0);
      total.purchases += Number(row.purchases || 0);
      total.purchaseMetricAvailable = total.purchaseMetricAvailable || !!row.purchaseMetricAvailable || Number(row.purchases || 0) > 0;
    });
    return total;
  }

  function accountOrderCpaProfile(labels, orders, totalSpend, datasetLabel, platform) {
    var count = Math.max(1, (labels || []).length || (orders || []).length || dashboardDays);
    var dailySpend = Number(totalSpend || 0) / count;
    var denominatorValues = (orders || []).slice(Math.max(0, (orders || []).length - count));
    while (denominatorValues.length < count) denominatorValues.unshift(0);
    var profileLabels = (labels || []).slice(Math.max(0, (labels || []).length - count));
    while (profileLabels.length < count) profileLabels.unshift('');
    return {
      labels: profileLabels,
      cpaValues: denominatorValues.map(function (orderCount) {
        return Number(orderCount || 0) > 0 ? Number((dailySpend / Number(orderCount || 0)).toFixed(2)) : 0;
      }),
      denominatorValues: denominatorValues,
      spendValues: denominatorValues.map(function () { return dailySpend; }),
      denominatorLabel: s6Txt('Taager Orders', 'طلبات تاجر'),
      datasetLabel: datasetLabel,
      platform: platform,
      inferredFromAccountOrders: true
    };
  }

  function cpaChartProfile() {
    const chartData = getChartData(activePeriod);
    const fallbackLabels = chartData.map(x => x.d);
    const ordersData = getDailyOrdersData(activePeriod);
    const fallbackOrders = ordersData.map(x => Number(x.v || 0));
    let platformRows = activeCpaPlatform === 'all' ? dailyPlatformRows('all') : dailyPlatformRows(activeCpaPlatform);
    const platformRowsUsable = activeCpaPlatform === 'all'
      ? platformRows.some(function (row) { return Number(row.spend || 0) > 0; })
      : platformRows.some(function (row) { return Number(row.spend || 0) > 0 && Number(row.purchases || 0) > 0; });
    if (syncedSpendActive && (!platformRows.length || !platformRowsUsable)) {
      if (activeCpaPlatform === 'all') {
        platformRows = synthesizedPlatformRows(activeCpaPlatform, fallbackLabels);
      } else {
        var totals = platformTotals(activeCpaPlatform);
        if (Number(totals.spend || 0) > 0) {
          return accountOrderCpaProfile(
            fallbackLabels,
            fallbackOrders,
            totals.spend,
            platformDisplayName(activeCpaPlatform) + ' CPA',
            activeCpaPlatform
          );
        }
        platformRows = [];
      }
    }

    if (syncedSpendActive && platformRows.length) {
      var labels = platformRows.map(function (row, index) { return row.label || formatCpaDateLabel(row.date) || fallbackLabels[index] || ''; });
      if (activeCpaPlatform === 'all') {
        var alignedOrders = fallbackOrders.slice(Math.max(0, fallbackOrders.length - platformRows.length));
        while (alignedOrders.length < platformRows.length) alignedOrders.unshift(0);
        return {
          labels: labels,
          cpaValues: platformRows.map(function (row, index) {
            var orders = Number(alignedOrders[index] || 0);
            return orders > 0 ? Number((Number(row.spend || 0) / orders).toFixed(2)) : 0;
          }),
          denominatorValues: alignedOrders,
          spendValues: platformRows.map(function (row) { return Number(row.spend || 0); }),
          denominatorLabel: s6Txt('Taager Orders', 'طلبات تاجر'),
          datasetLabel: s6Txt('Account CPA', 'CPA الحساب'),
          platform: 'all'
        };
      }
      return {
        labels: labels,
        cpaValues: platformRows.map(function (row) {
          var purchases = Number(row.purchases || 0);
          return purchases > 0 ? Number((Number(row.spend || 0) / purchases).toFixed(2)) : 0;
        }),
        denominatorValues: platformRows.map(function (row) { return Number(row.purchases || 0); }),
        spendValues: platformRows.map(function (row) { return Number(row.spend || 0); }),
        denominatorLabel: s6Txt('Platform Purchases', 'مشتريات المنصة'),
        datasetLabel: platformDisplayName(activeCpaPlatform) + ' CPA',
        platform: activeCpaPlatform
      };
    }

    if (activeCpaPlatform !== 'all') {
      return {
        labels: fallbackLabels,
        cpaValues: fallbackLabels.map(function () { return 0; }),
        denominatorValues: fallbackLabels.map(function () { return 0; }),
        spendValues: fallbackLabels.map(function () { return 0; }),
        denominatorLabel: s6Txt('Platform Purchases', 'مشتريات المنصة'),
        datasetLabel: platformDisplayName(activeCpaPlatform) + ' CPA',
        platform: activeCpaPlatform
      };
    }

    return {
      labels: fallbackLabels,
      cpaValues: fallbackOrders.map(orders => orders > 0 ? Number((dailyAdSpend / orders).toFixed(2)) : 0),
      denominatorValues: fallbackOrders,
      spendValues: fallbackOrders.map(function () { return dailyAdSpend; }),
      denominatorLabel: s6Txt('Taager Orders', 'طلبات تاجر'),
      datasetLabel: activeCpaPlatform === 'all' ? s6Txt('Account CPA', 'CPA الحساب') : platformDisplayName(activeCpaPlatform) + ' CPA',
      platform: activeCpaPlatform
    };
  }

  function averageCpaFromProfile(profile) {
    var totalSpend = (profile.spendValues || []).reduce((sum, value) => sum + Number(value || 0), 0);
    var totalDenominator = (profile.denominatorValues || []).reduce((sum, value) => sum + Number(value || 0), 0);
    return totalDenominator > 0 ? totalSpend / totalDenominator : 0;
  }

  // ── static constants ──────────────────────────────────────────────────────
  const PERIODS = [
    { key: '7',     label: s6Txt('period.trend7', '7 أيام') },
    { key: '14',    label: s6Txt('period.trend14', '14 يوم') },
    { key: 'month', label: s6Txt('Month view', 'الشهر الحالي') },
  ];

  let PERF_DATA = [];
  let METRICS_ROWS = [];
  let OBSERVATIONS = [];
  let RECS = [];

  // ── helpers ────────────────────────────────────────────────────────────────
  function iconBarsHtml(color, size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
      <rect x="3"  y="14" width="4" height="7"  rx="1" fill="${color}"/>
      <rect x="10" y="9"  width="4" height="12" rx="1" fill="${color}"/>
      <rect x="17" y="4"  width="4" height="17" rx="1" fill="${color}"/>
    </svg>`;
  }

  // ── HTML builders ──────────────────────────────────────────────────────────

  var _now = new Date();
  var _monthLabel = d.snapshotMonthLabel ||
    (window.dashboardI18n ? window.dashboardI18n.formatMonth(_now.getFullYear(), _now.getMonth()) :
      (((isAr ? _fbMonthsAr : _fbMonthsEn)[_now.getMonth()] + ' ' + _now.getFullYear())));
  var _timeLabel  = ('0' + _now.getHours()).slice(-2) + ':' + ('0' + _now.getMinutes()).slice(-2);
  var _accountLabel = window.currentActiveAccountLabel || s6Txt('All Accounts', 'كل الحسابات');

  function topBarHtml() {
    const periodDays = activePeriod === 'month' ? dashboardDays : activePeriod;
    var averageSubtitle = activeMode === 'cpa'
      ? s6Txt('CPA and Break-even CPA target for the last ' + periodDays + ' days', 'مؤشرات تكلفة الطلب (CPA) ونقطة التعادل خلال آخر ' + periodDays + ' يوم')
      : s6Txt('Taager Profit After Tax earned during the last ' + periodDays + ' days', 'متوسط ربح تاجر المحقق خلال آخر ' + periodDays + ' يوم');
    var titleText = activeMode === 'cpa'
      ? s6Txt('Daily CPA vs. Break-even CPA', 'تكلفة الطلب اليومية مقابل تكلفة التعادل (CPA)')
      : s6Txt('Daily Profit After Tax Trend', 'اتجاه الربح بعد الضريبة اليومي');
    return `
      <style>.s6-status-chip span[style*="font-size:var(--type-micro)"]{display:none!important}</style>
      <div class="s6-topbar" style="display:flex;align-items:center;justify-content:space-between;
        padding:0 28px;height:68px;border-bottom:1px solid rgba(255,255,255,0.05);
        background:var(--dash-bg);position:sticky;top:0;z-index:10;flex-shrink:0;">

        <!-- right: dropdowns -->
        <div style="display:flex;gap:10px;">
          <span class="s6-status-chip" aria-label="${s6Txt('Dashboard period', 'فترة لوحة التحكم')}" style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:var(--dash-radius-md);
            border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);
            color:rgba(255,255,255,0.75);font-size:var(--type-label);font-weight:var(--weight-semibold);font-family:inherit;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="3" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
              <path d="M8 2v4M16 2v4M3 10h18" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span style="color:#f59e0b;">${_monthLabel}</span>
            <span style="color:rgba(255,255,255,0.35);font-size:var(--type-micro);">▾</span>
          </span>
          <span class="s6-status-chip" aria-label="${s6Txt('Dashboard account', 'حساب لوحة التحكم')}" style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:var(--dash-radius-md);
            border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);
            color:rgba(255,255,255,0.75);font-size:var(--type-label);font-weight:var(--weight-semibold);font-family:inherit;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            ${_accountLabel}
            <span style="color:rgba(255,255,255,0.35);font-size:var(--type-micro);">▾</span>
          </span>
        </div>

        <!-- center: title -->
        <div style="text-align:center;flex:1;">
          <div class="fade-up" style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:#fff;
            display:flex;align-items:center;justify-content:center;gap:8px;">
            ${titleText}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6z" fill="#f59e0b"/>
            </svg>
          </div>
          <div class="fade-up" style="font-size:var(--type-caption);color:rgba(255,255,255,0.38);margin-top:3px;animation-delay:100ms;">
            ${averageSubtitle}
          </div>
        </div>

        <!-- left: pulse + time -->
        <div style="display:flex;align-items:center;gap:10px;">
          <svg width="22" height="14" viewBox="0 0 44 20" fill="none">
            <polyline points="0,10 8,10 12,3 16,17 20,10 26,10 30,5 34,14 38,10 44,10"
              stroke="#00e676" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="font-size:var(--type-caption);color:var(--dash-text-faint);">${s6Txt('Last update: Today', 'آخر تحديث: اليوم')}</span>
          <span style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.75);">${_timeLabel}</span>
        </div>
      </div>
    `;
  }

  function periodTabsHtml() {
    return PERIODS.map(p => {
      const active = p.key === activePeriod;
      return `<button
        id="s6-period-${p.key}"
        data-period="${p.key}"
        style="padding:6px 16px;border-radius:var(--dash-radius-sm);
          border:${active ? '1.5px solid #14b8a6' : '1px solid rgba(255,255,255,0.12)'};
          background:${active ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)'};
          color:${active ? '#14b8a6' : 'rgba(255,255,255,0.45)'};
          font-size:var(--type-label);font-weight:${active ? 700 : 500};
          cursor:pointer;font-family:inherit;
          box-shadow:${active ? '0 0 12px rgba(20,184,166,0.3)' : 'none'};
          transition:all 0.15s;">
        ${p.label}
      </button>`;
    }).join('');
  }

  function headerRowHtml() {
    var rightSideHtml = '';
    
    if (activeMode === 'cpa') {
      const profile = cpaChartProfile();
      const averageCpa = averageCpaFromProfile(profile);
      const breakEvenCpa = getBreakEvenCpa();
      const cColor = averageCpa > breakEvenCpa ? '#ef4444' : '#00e676';
      
      rightSideHtml = `
        <div style="text-align:right;">
          <div style="font-size:var(--type-caption);color:var(--dash-text-faint);margin-bottom:4px;">${s6Txt('commission.averageCpa', 'متوسط تكلفة الطلب (CPA)')}</div>
          <div style="display:flex;align-items:baseline;gap:10px;justify-content:flex-end;">
            <div id="s6-header-cpa-badge" style="display:inline-flex;align-items:center;gap:4px;
              background:${cColor}12;border:1px solid ${cColor}25;
              border-radius:var(--dash-radius-sm);padding:3px 9px;font-size:var(--type-caption);font-weight:var(--weight-semibold);color:${cColor};">
              ${s6Txt('commission.breakEvenLine', 'تكلفة التعادل')}: ${moneyNumberMax(breakEvenCpa, 2)} ${activeCurrency}
            </div>
            <span style="font-size:var(--type-page-title);font-weight:var(--weight-bold);color:#fff;letter-spacing:-1px;">
              <span id="s6-total-countup">${moneyNumber(averageCpa, 1)}</span> ${activeCurrency}
            </span>
          </div>
        </div>
      `;
    } else {
      rightSideHtml = `
        <div style="text-align:right;">
          <div style="font-size:var(--type-caption);color:var(--dash-text-faint);margin-bottom:4px;">${s6Txt('Total Taager Profit After Tax', 'إجمالي ربح تاجر بعد الضريبة')}</div>
          <div style="display:flex;align-items:baseline;gap:10px;justify-content:flex-end;">
            <div style="display:inline-flex;align-items:center;gap:4px;
              background:rgba(0,230,118,0.12);border:1px solid rgba(0,230,118,0.25);
              border-radius:var(--dash-radius-sm);padding:3px 9px;font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#00e676;">
              ↑ ${totalDelta}٪
            </div>
            <span style="font-size:var(--type-page-title);font-weight:var(--weight-bold);color:#fff;letter-spacing:-1px;">
              <span id="s6-total-countup">0</span> ${activeCurrency}
            </span>
          </div>
        </div>
      `;
    }

    var switcherHtml = `
      <div class="s6-mode-tabs" style="display:flex;background:rgba(255,255,255,0.04);border:1px solid var(--dash-border-soft);border-radius:var(--dash-radius-md);padding:3px;gap:2px;">
        <button id="s6-mode-profit" data-mode="profit" style="padding:6px 14px;border-radius:var(--dash-radius-sm);border:none;background:${activeMode === 'profit' ? '#14b8a6' : 'transparent'};color:${activeMode === 'profit' ? '#fff' : 'rgba(255,255,255,0.5)'};font-size:var(--type-label);font-weight:var(--weight-semibold);cursor:pointer;transition:all 0.2s;font-family:inherit;">
          ${s6Txt('commission.modeProfit', 'اتجاه الأرباح')}
        </button>
        <button id="s6-mode-cpa" data-mode="cpa" style="padding:6px 14px;border-radius:var(--dash-radius-sm);border:none;background:${activeMode === 'cpa' ? '#14b8a6' : 'transparent'};color:${activeMode === 'cpa' ? '#fff' : 'rgba(255,255,255,0.5)'};font-size:var(--type-label);font-weight:var(--weight-semibold);cursor:pointer;transition:all 0.2s;font-family:inherit;">
          ${s6Txt('commission.modeCpa', 'تكلفة الطلب (CPA)')}
        </button>
      </div>
    `;

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
        background:var(--dash-surface);border:1px solid rgba(255,255,255,0.07);
        border-radius:var(--dash-radius-xl);padding:16px 22px;">

        <!-- left (visually): period tabs & mode switcher & currency selector -->
        <div style="display:flex;align-items:center;gap:16px;" id="s6-period-tabs-wrap">
          <div style="display:flex;gap:6px;" id="s6-period-tabs">
            ${periodTabsHtml()}
          </div>
          <div style="width:1px;height:24px;background:rgba(255,255,255,0.1);"></div>
          ${switcherHtml}
        </div>

        <!-- right (visually): total -->
        ${rightSideHtml}
      </div>
    `;
  }

  function areaChartCardHtml() {
    var spendInputHtml = '';
    if (activeMode === 'cpa') {
      const isDisabled = syncedSpendActive;
      const titleAttr = isDisabled ? `title="${s6Txt('Ad spend synced from marketing platforms', 'الإنفاق متزامن من منصات التسويق')}"` : '';
      spendInputHtml = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:var(--type-label);color:var(--dash-text-faint);">${s6Txt('commission.dailySpendInput', 'الإنفاق اليومي:')}</span>
          <div style="position:relative;display:flex;align-items:center;gap:4px;">
            <input type="number" id="s6-spend-input" value="${Math.round(dailyAdSpend * 100) / 100}" ${isDisabled ? 'disabled' : ''} ${titleAttr}
              style="width:74px;background:${isDisabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'};
              border:1px solid ${isDisabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)'};
              color:${isDisabled ? 'rgba(255,255,255,0.4)' : '#fff'};
              border-radius:var(--dash-radius-sm);padding:5px 6px;font-size:var(--type-label);font-weight:var(--weight-semibold);
              text-align:center;font-family:inherit;outline:none;cursor:${isDisabled ? 'not-allowed' : 'text'};" min="0" step="10">
            <span style="font-size:var(--type-micro);color:var(--dash-text-faint);">${activeCurrency}</span>
          </div>
          ${isDisabled ? `<span style="font-size:var(--type-micro);color:#00e676;background:rgba(0,230,118,0.1);padding:2px 6px;border-radius:4px;border:1px solid rgba(0,230,118,0.2);font-weight:var(--weight-semibold);">${s6Txt('Synced', 'متزامن')}</span>` : ''}
        </div>
      `;
    }
    return `
      <div style="background:var(--dash-surface);border:1px solid rgba(255,255,255,0.07);
        border-radius:var(--dash-radius-xl);padding:18px 14px 10px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0 8px;">
          <div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.85);">
            ${activeMode === 'cpa' ? s6Txt('CPA and Break-even Target curves', 'منحنى تكلفة الطلب (CPA) مقابل خط التعادل') : s6Txt('Daily profit trend curve', 'منحنى اتجاه الأرباح اليومية')}
          </div>
          ${cpaPlatformTabsHtml()}
          ${spendInputHtml}
        </div>
        <div id="s6-chart-wrap" style="position:relative;transition:opacity 0.3s;">
          <canvas id="s6-area-chart" height="240"></canvas>
        </div>
      </div>
    `;
  }

  function platformAnalyticsHtml() {
    if (activeMode !== 'cpa') return '';
    const hasRows = PLATFORM_ROWS.length > 0;
    const rowsHtml = hasRows ? PLATFORM_ROWS.map(function (row, i) {
      const cpaText = row.cpa == null ? s6Txt('No purchase data', 'لا توجد بيانات مشتريات') : moneyNumber(row.cpa, 1) + ' ' + activeCurrency;
      const purchaseText = row.purchaseMetricAvailable || row.purchases > 0
        ? moneyNumber(row.purchases, row.purchases % 1 === 0 ? 0 : 1)
        : s6Txt('No data', 'لا توجد بيانات');
      const metricText = row.purchaseMetric ? row.purchaseMetric.replace(/_/g, ' ') : s6Txt('platform reported', 'من المنصة');
      return `
        <div class="fade-up" style="display:grid;grid-template-columns:minmax(130px,1.2fr) repeat(3,minmax(110px,1fr));gap:12px;align-items:center;
          padding:13px 14px;border-top:${i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)'};animation-delay:${180 + i * 70}ms;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="width:10px;height:32px;border-radius:4px;background:${row.color};box-shadow:0 0 16px ${row.color}55;"></div>
            <div style="min-width:0;">
              <div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(row.label)}</div>
              <div style="font-size:var(--type-micro);color:rgba(255,255,255,0.38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(metricText)}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:#fff;">${moneyNumber(row.spend, 2)}</div>
            <div style="font-size:var(--type-micro);color:rgba(255,255,255,0.38);">${activeCurrency}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:${row.purchaseMetricAvailable || row.purchases > 0 ? '#facc15' : 'rgba(255,255,255,0.38)'};">${purchaseText}</div>
            <div style="font-size:var(--type-micro);color:rgba(255,255,255,0.38);">${s6Txt('Platform Purchases', 'مشتريات المنصة')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:${row.cpa == null ? 'rgba(255,255,255,0.38)' : '#14b8a6'};">${cpaText}</div>
            <div style="font-size:var(--type-micro);color:rgba(255,255,255,0.38);">${s6Txt('Platform CPA', 'CPA المنصة')}</div>
          </div>
        </div>
      `;
    }).join('') : `
      <div style="padding:18px 14px;border-top:1px solid rgba(255,255,255,0.06);font-size:var(--type-label);color:rgba(255,255,255,0.48);text-align:center;">
        ${syncedSpendActive
          ? s6Txt('Platform purchase data will appear after the next marketing sync.', 'ستظهر بيانات مشتريات المنصات بعد المزامنة التالية.')
          : s6Txt('Connect marketing platforms to see platform spend, purchases, and CPA.', 'اربط منصات التسويق لعرض الإنفاق والمشتريات وCPA لكل منصة.')}
      </div>
    `;

    const accountCpaText = ACCOUNT_CPA && ACCOUNT_CPA.cpa != null ? moneyNumber(ACCOUNT_CPA.cpa, 1) + ' ' + activeCurrency : 'N/A';
    const accountOrdersText = ACCOUNT_CPA ? moneyNumber(ACCOUNT_CPA.orders, 0) : '0';
    const accountSpendText = ACCOUNT_CPA ? moneyNumber(ACCOUNT_CPA.spend, 2) : '0.00';

    return `
      <div style="background:var(--dash-surface);border:1px solid rgba(255,255,255,0.07);border-radius:var(--dash-radius-xl);overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:var(--dash-radius-sm);background:rgba(20,184,166,0.14);border:1px solid rgba(20,184,166,0.28);display:flex;align-items:center;justify-content:center;">
              ${iconBarsHtml('#14b8a6', 18)}
            </div>
            <div>
              <div style="font-size:var(--type-body);font-weight:var(--weight-semibold);color:#fff;">${s6Txt('Platform CPA Breakdown', 'تفصيل CPA حسب المنصة')}</div>
              <div style="font-size:var(--type-caption);color:rgba(255,255,255,0.42);">${s6Txt('Platform CPA uses ad-platform reported purchases. Account CPA uses Taager orders.', 'CPA المنصة يعتمد على مشتريات المنصة، وCPA الحساب يعتمد على طلبات تاجر.')}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(90px,1fr));gap:8px;min-width:340px;">
            <div style="padding:9px 10px;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);text-align:right;">
              <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:#fff;">${accountSpendText}</div>
              <div style="font-size:var(--type-micro);color:var(--dash-text-faint);">${s6Txt('Total Spend', 'إجمالي الإنفاق')}</div>
            </div>
            <div style="padding:9px 10px;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);text-align:right;">
              <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:#facc15;">${accountOrdersText}</div>
              <div style="font-size:var(--type-micro);color:var(--dash-text-faint);">${s6Txt('Taager Orders', 'طلبات تاجر')}</div>
            </div>
            <div style="padding:9px 10px;border-radius:var(--dash-radius-md);background:rgba(20,184,166,0.08);border:1px solid rgba(20,184,166,0.18);text-align:right;">
              <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:#14b8a6;">${accountCpaText}</div>
              <div style="font-size:var(--type-micro);color:var(--dash-text-faint);">${s6Txt('Account CPA', 'CPA الحساب')}</div>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:minmax(130px,1.2fr) repeat(3,minmax(110px,1fr));gap:12px;padding:10px 14px;background:rgba(255,255,255,0.025);font-size:var(--type-micro);font-weight:var(--weight-semibold);text-transform:uppercase;letter-spacing:0.04em;color:rgba(255,255,255,0.38);">
          <div>${s6Txt('Platform', 'المنصة')}</div>
          <div style="text-align:right;">${s6Txt('Spend', 'الإنفاق')}</div>
          <div style="text-align:right;">${s6Txt('Purchases', 'المشتريات')}</div>
          <div style="text-align:right;">${s6Txt('CPA', 'CPA')}</div>
        </div>
        ${rowsHtml}
      </div>
    `;
  }

  function donutCardHtml() {
    const totalSAR = PERF_DATA.reduce((a, x) => a + x.sar, 0);
    const legendRows = PERF_DATA.map((d, i) => `
      <div class="fade-up" style="display:flex;align-items:center;justify-content:space-between;animation-delay:${400 + i * 80}ms;">
        <span style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:${d.color};">
          ${moneyNumber(d.sar, 2)} ${activeCurrency}
        </span>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="text-align:right;">
            <div style="font-size:var(--type-caption);color:rgba(255,255,255,0.65);font-weight:var(--weight-semibold);">${d.label}</div>
            <div style="font-size:var(--type-micro);color:rgba(255,255,255,0.35);">${d.days} ${s6Txt('days', 'أيام')} (${d.pct}٪)</div>
          </div>
          <div style="width:10px;height:10px;border-radius:3px;background:${d.color};box-shadow:0 0 6px ${d.color};"></div>
        </div>
      </div>
    `).join('');

    const thresholdItems = activeMode === 'cpa' ? [
      { label: s6Txt('Winning', 'مربح'), color: '#00e676' },
      { label: s6Txt('Borderline', 'تعادل'), color: '#f59e0b' },
      { label: s6Txt('Losing', 'خسارة'), color: '#ef4444' },
      { label: s6Txt('Zero Orders', 'صفر طلبات'), color: '#ff9800' }
    ].map(t => `
      <div style="display:flex;align-items:center;gap:5px;">
        <div style="width:7px;height:7px;border-radius:2px;background:${t.color};"></div>
        <span style="font-size:var(--type-micro);color:var(--dash-text-faint);">${t.label}</span>
      </div>
    `).join('') : [
      { label: s6Txt('High', 'مرتفع'), range: (PERF_DATA.find(x => x.key === 'high') || {}).threshold || '', color: '#00e676' },
      { label: s6Txt('Medium', 'متوسط'), range: (PERF_DATA.find(x => x.key === 'mid') || {}).threshold || '', color: '#3b82f6' },
      { label: s6Txt('Low', 'منخفض'), range: (PERF_DATA.find(x => x.key === 'low') || {}).threshold || '', color: '#ef4444' },
    ].map(t => `
      <div style="display:flex;align-items:center;gap:5px;">
        <div style="width:7px;height:7px;border-radius:2px;background:${t.color};"></div>
        <span style="font-size:var(--type-micro);color:var(--dash-text-faint);">${t.label} ${t.range}</span>
      </div>
    `).join('');

    const cardTitle = activeMode === 'cpa'
      ? s6Txt('Ad Spend Distribution by CPA Profitability', 'توزيع الإنفاق الإعلاني حسب كفاءة تكلفة الطلب')
      : s6Txt('Taager Profit After Tax Distribution by Period', 'توزيع ربح تاجر بعد الضريبة حسب الفترة');

    const centerLabel = activeMode === 'cpa'
      ? s6Txt('Total Spend', 'إجمالي الإنفاق الإعلاني')
      : s6Txt('Total Taager Profit After Tax', 'إجمالي ربح تاجر بعد الضريبة');

    return `
      <div style="background:var(--dash-surface);border:1px solid rgba(255,255,255,0.07);
        border-radius:var(--dash-radius-xl);padding:18px 20px;flex:1;">
        <!-- title -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:14px;">
          <div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.8);text-align:right;">${cardTitle}</div>
        </div>

        <!-- donut canvas wrapper -->
        <div style="position:relative;width:180px;height:180px;max-width:180px;max-height:180px;margin:0 auto;display:flex;align-items:center;justify-content:center;isolation:isolate;overflow:hidden;">
          <canvas id="s6-donut-chart" width="180" height="180" style="display:block;width:180px!important;height:180px!important;max-width:180px;max-height:180px;position:relative;z-index:2;"></canvas>
          <!-- center label -->
          <div style="position:absolute;z-index:3;text-align:center;pointer-events:none;">
            <div style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:#fff;" id="s6-donut-total">
              ${moneyNumber(totalSAR, 2)}
            </div>
            <div style="font-size:var(--type-micro);font-weight:var(--weight-semibold);color:var(--dash-text-faint);">${centerLabel}</div>
          </div>
        </div>

        <!-- legend -->
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
          ${legendRows}
        </div>

        <!-- threshold row -->
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);
          display:flex;justify-content:space-between;gap:4px;">
          ${thresholdItems}
        </div>
      </div>
    `;
  }

  function metricsCardHtml() {
    const rows = METRICS_ROWS.map((r, i) => `
      <div class="fade-up" style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 0;border-bottom:${i < METRICS_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'};
        animation-delay:${300 + i * 70}ms;">
        <div style="font-size:var(--type-subtitle);font-weight:var(--weight-semibold);color:${r.color};letter-spacing:-0.3px;">
          ${r.value} <span style="font-size:var(--type-caption);font-weight:var(--weight-semibold);">${r.unit}</span>
        </div>
        <div style="font-size:var(--type-label);color:rgba(255,255,255,0.45);text-align:right;">${r.label}</div>
      </div>
    `).join('');

    return `
      <div style="background:var(--dash-surface);border:1px solid rgba(255,255,255,0.07);
        border-radius:var(--dash-radius-xl);padding:18px 20px;flex:1;">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:14px;">
          <div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.8);
            display:flex;align-items:center;gap:7px;">
            ${s6Txt('Performance Metrics', 'مقاييس الأداء')}
          </div>
          ${iconBarsHtml('rgba(255,255,255,0.35)', 15)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          ${rows}
        </div>
      </div>
    `;
  }

  function observationsCardHtml() {
    const items = OBSERVATIONS.map((obs, i) => `
      <div class="fade-up" style="display:flex;align-items:flex-start;gap:12px;
        padding:10px 12px;
        background:${obs.iconBg}0d;border:1px solid ${obs.iconBg}22;
        border-radius:var(--dash-radius-md);animation-delay:${300 + i * 100}ms;">
        <div style="width:36px;height:36px;border-radius:50%;
          background:${obs.iconBg}1a;border:1.5px solid ${obs.iconBg}45;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${obs.iconSvg}
        </div>
        <div style="text-align:right;flex:1;">
          <div style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:${obs.iconBg};margin-bottom:3px;">${obs.title}</div>
          <div style="font-size:var(--type-caption);color:rgba(255,255,255,0.65);line-height:1.5;">${obs.line1}</div>
          ${obs.line2 ? `<div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:${obs.line2Color};margin-top:2px;">${obs.line2}</div>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <div style="background:var(--dash-surface);border:1px solid rgba(255,255,255,0.07);
        border-radius:var(--dash-radius-xl);padding:18px 20px;flex:1;">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:14px;">
          <div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.8);
            display:flex;align-items:center;gap:7px;">
            ${s6Txt('Key Highlights', 'أبرز الملاحظات')}
          </div>
          ${iconBarsHtml('rgba(255,255,255,0.35)', 15)}
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${items}
        </div>
      </div>
    `;
  }

  function recommendationsHtml() {
    const cards = RECS.map((r, i) => `
      <div class="fade-up" style="flex:1;background:${r.bg};border:1px solid ${r.border};
        border-radius:var(--dash-radius-lg);padding:16px 18px;direction:ltr;display:flex;align-items:center;gap:14px;
        animation-delay:${500 + i * 100}ms;">
        <div style="width:46px;height:46px;border-radius:50%;
          background:${r.glow}20;border:1.5px solid ${r.glow}40;
          box-shadow:0 0 14px ${r.glow}35;
          display:flex;align-items:center;justify-content:center;font-size:var(--type-metric-sm);flex-shrink:0;">
          ${r.emoji}
        </div>
        <div style="text-align:right; flex:1;">
            <div style="font-size:var(--type-label);font-weight:var(--weight-semibold);color:#fff;margin-bottom:4px;">${r.title}</div>
            <div style="font-size:var(--type-caption);color:rgba(255,255,255,0.55);line-height:1.5;">${r.body}</div>
            <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:${r.glow};margin-top:3px;">${r.cta}</div>
          </div>
        </div>
      `).join('');

      return `
        <div>
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:12px;">
            <span style="font-size:var(--type-body);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.8);">${s6Txt('Recommendations to Improve Performance', 'توصيات لتحسين الأداء')}</span>
            <div style="width:28px;height:28px;border-radius:var(--dash-radius-sm);
              background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.35);
              display:flex;align-items:center;justify-content:center;font-size:var(--type-component-title);">💡</div>
          </div>
          <div class="s6-recs-row" style="display:flex;gap:14px;">
            ${cards}
          </div>
        </div>
      `;
    }

    function cardsHtml() {
      return `
        <div class="s6-analysis-row" style="display:flex;gap:14px;">
          ${donutCardHtml()}
          ${metricsCardHtml()}
          ${observationsCardHtml()}
        </div>
        ${recommendationsHtml()}
      `;
    }

    function render() {
    const marketingState = window.DashboardMarketingState ? window.DashboardMarketingState.get(activeAccountId) : null;
    MARKETING_SUMMARY = marketingState && marketingState.summary ? marketingState.summary : null;
    syncedSpendActive = !!(
      marketingState &&
      marketingState.status === 'connected' &&
      marketingState.summary &&
      !marketingState.manualOverride
    );

    const roiSettings = window.DashboardRoiState ? window.DashboardRoiState.get(activeAccountId) : {};
    activeCurrency = roiSettings.currency || baseCurrency;

    let totalSpend = 0;
    if (syncedSpendActive) {
      const sourceBreakdown = (marketingState.summary && Array.isArray(marketingState.summary.sourceBreakdown))
        ? marketingState.summary.sourceBreakdown
        : [];
      if (sourceBreakdown.length > 0) {
        totalSpend = sourceBreakdown.reduce(function (total, source) {
          const sourceCurrency = String(source && (source.currency || source.targetCurrency) || marketingState.summary.currency || activeCurrency).toUpperCase();
          const sourceSpend = source && source.rawSpend != null
            ? convert(Number(source.rawSpend || 0), sourceCurrency, activeCurrency)
            : convert(Number(source && (source.convertedSpend || source.adSpend) || 0), String(source && source.targetCurrency || marketingState.summary.currency || activeCurrency).toUpperCase(), activeCurrency);
          return total + Number(sourceSpend || 0);
        }, 0);
      } else {
        const totalSpendRaw = Number(marketingState.summary.adSpend || 0);
        totalSpend = convert(totalSpendRaw, marketingState.summary.currency || baseCurrency, activeCurrency);
      }
    } else {
      totalSpend = Number(roiSettings.adSpend) || Number(roi.adSpend) || convert(250 * dashboardDays, baseCurrency, activeCurrency);
    }

    const computedDailyAdSpend = syncedSpendActive
      ? (totalSpend / dashboardDays)
      : Math.round(totalSpend / dashboardDays);

    if (mountEl._s6LastAccountId !== activeAccountId) {
      mountEl._s6LastAccountId = activeAccountId;
      mountEl._s6DailyAdSpendIsManual = false;
      mountEl._s6DailyAdSpend = computedDailyAdSpend > 0 ? computedDailyAdSpend : 250;
    }

    if (mountEl._s6LastCurrency !== activeCurrency) {
      mountEl._s6LastCurrency = activeCurrency;
      mountEl._s6DailyAdSpendIsManual = false;
      mountEl._s6DailyAdSpend = computedDailyAdSpend > 0 ? computedDailyAdSpend : 250;
    }

    if (mountEl._s6DailyAdSpend === undefined || !mountEl._s6DailyAdSpendIsManual) {
      mountEl._s6DailyAdSpend = computedDailyAdSpend > 0 ? computedDailyAdSpend : 250;
    }

    dailyAdSpend = mountEl._s6DailyAdSpend;

    const chartData = getChartData(activePeriod);
    const labels = chartData.map(x => x.d);

    if (activeMode === 'cpa') {
      const profile = cpaChartProfile();
      const ordersValues = profile.denominatorValues.map(x => Number(x || 0));
      const spendValues = profile.spendValues.map(x => Number(x || 0));
      const breakEvenCpa = getBreakEvenCpa();
      const threshold = breakEvenCpa * 0.05;
      const cpaValues = profile.cpaValues.map(x => Number(x || 0));

      let profitableDays = 0, profitableSpend = 0;
      let unprofitableDays = 0, unprofitableSpend = 0;
      let borderlineDays = 0, borderlineSpend = 0;
      let zeroOrderDays = 0, zeroOrderSpend = 0;

      ordersValues.forEach((orders, i) => {
        const daySpend = Number(spendValues[i] || 0);
        const cpa = Number(cpaValues[i] || 0);
        if (orders === 0) {
          zeroOrderDays++;
          zeroOrderSpend += daySpend;
        } else {
          const diff = cpa - breakEvenCpa;
          if (diff < -threshold) {
            profitableDays++;
            profitableSpend += daySpend;
          } else if (diff > threshold) {
            unprofitableDays++;
            unprofitableSpend += daySpend;
          } else {
            borderlineDays++;
            borderlineSpend += daySpend;
          }
        }
      });

      const totalDays = ordersValues.length || 1;
      const profitablePct = parseFloat(((profitableDays / totalDays) * 100).toFixed(1));
      const unprofitablePct = parseFloat(((unprofitableDays / totalDays) * 100).toFixed(1));
      const borderlinePct = parseFloat(((borderlineDays / totalDays) * 100).toFixed(1));
      const zeroOrderPct = parseFloat(((zeroOrderDays / totalDays) * 100).toFixed(1));

      PERF_DATA = [
        { key: 'profitable', label: s6Txt('Winning', 'مربح (أقل من التعادل)'), days: profitableDays, pct: profitablePct, sar: profitableSpend, color: '#00e676' },
        { key: 'borderline', label: s6Txt('Borderline', 'تعادل تقريبي'), days: borderlineDays, pct: borderlinePct, sar: borderlineSpend, color: '#f59e0b' },
        { key: 'unprofitable', label: s6Txt('Losing', 'خسارة (فوق التعادل)'), days: unprofitableDays, pct: unprofitablePct, sar: unprofitableSpend, color: '#ef4444' },
        { key: 'zero', label: s6Txt('Zero Orders (Wasted)', 'صفر طلبات (مهدور)'), days: zeroOrderDays, pct: zeroOrderPct, sar: zeroOrderSpend, color: '#ff9800' }
      ];

      const totalOrders = ordersValues.reduce((a, b) => a + b, 0);
      const totalSpend = spendValues.reduce((a, b) => a + b, 0);
      const averageCpa = totalOrders > 0 ? totalSpend / totalOrders : 0;
      const accountOrdersValues = getDailyOrdersData(activePeriod).map(x => Number(x.v || 0));
      const accountTotalOrders = accountOrdersValues.reduce((a, b) => a + b, 0);
      const accountTotalSpend = Number(dailyAdSpend || 0) * (accountOrdersValues.length || totalDays);
      PLATFORM_ROWS = syncedSpendActive ? buildPlatformRows(marketingState && marketingState.summary) : [];
      ACCOUNT_CPA = {
        spend: Number(accountTotalSpend.toFixed(2)),
        orders: accountTotalOrders,
        cpa: accountTotalOrders > 0 ? Number((accountTotalSpend / accountTotalOrders).toFixed(2)) : null
      };
      
      const nonZeroCpas = cpaValues.filter(v => v > 0);
      const minCpa = nonZeroCpas.length > 0 ? Math.min(...nonZeroCpas) : 0;
      const maxCpa = cpaValues.length > 0 ? Math.max(...cpaValues) : 0;

      METRICS_ROWS = [
        { label: s6Txt('Average CPA', 'متوسط تكلفة الطلب (CPA)'), value: moneyNumber(averageCpa, 1), unit: activeCurrency, color: 'rgba(255,255,255,0.85)' },
        { label: s6Txt('commission.breakEvenLine', 'تكلفة التعادل (CPA)'), value: moneyNumberMax(breakEvenCpa, 2), unit: activeCurrency, color: '#f59e0b' },
        { label: s6Txt('Lowest Daily CPA', 'أقل تكلفة طلب يومية'), value: moneyNumber(minCpa, 1), unit: activeCurrency, color: '#00e676' },
        { label: s6Txt('Highest Daily CPA', 'أعلى تكلفة طلب يومية'), value: moneyNumber(maxCpa, 1), unit: activeCurrency, color: '#ef4444' },
        { label: s6Txt('Total Period Ad Spend', 'إجمالي الإنفاق للفترة'), value: moneyNumber(totalSpend, 2), unit: activeCurrency, color: 'rgba(255,255,255,0.85)' }
      ];

      // Find best CPA day
      const nonZeroCpaValues = cpaValues.map((v, idx) => ({ v, idx })).filter(x => x.v > 0);
      let bestDayLabel = 'N/A';
      let bestCpaVal = 0;
      if (nonZeroCpaValues.length > 0) {
        const best = nonZeroCpaValues.reduce((min, cur) => cur.v < min.v ? cur : min, nonZeroCpaValues[0]);
        bestDayLabel = profile.labels[best.idx] || labels[best.idx] || 'N/A';
        bestCpaVal = best.v;
      }
      
      const cpaStatusText = averageCpa <= breakEvenCpa
        ? s6Txt('Average CPA is below break-even. Campaigns are operating efficiently.', 'متوسط تكلفة الاكتساب تحت حد التعادل. الحملات تعمل بكفاءة.')
        : s6Txt('Average CPA exceeds break-even. Consider optimizing campaign targeting.', 'متوسط تكلفة الاكتساب يتجاوز حد التعادل. يوصى بتحسين استهداف الحملات.');

      OBSERVATIONS = [
        {
          iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 7L13.5 15.5L8.5 10.5L2 17" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7h6v6" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
          iconBg:   '#00e676',
          title:    s6Txt('Best CPA Day', 'أفضل يوم لتكلفة الطلب'),
          line1:    bestCpaVal > 0 ? `${moneyNumber(bestCpaVal, 1)} ${activeCurrency} — ${bestDayLabel}` : 'N/A',
          line2:    bestCpaVal > 0 ? s6Txt('Lowest cost of acquisition in this period', 'أقل تكلفة اكتساب تم تحقيقها في هذه الفترة') : '',
          line2Color: '#00e676',
        },
        {
          iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#f59e0b" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/></svg>`,
          iconBg:   '#f59e0b',
          title:    s6Txt('CPA Efficiency Share', 'نسبة كفاءة تكلفة الاكتساب'),
          line1:    s6Txt(`${profitableDays} out of ${totalDays} days were profitable`, `${profitableDays} من أصل ${totalDays} أيام كانت رابحة`),
          line2:    s6Txt(`With CPA below target break-even limit`, `حيث كانت تكلفة الاكتساب أقل من حد التعادل`),
          line2Color: 'rgba(255,255,255,0.4)',
        },
        {
          iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="14" width="4" height="7" rx="1" fill="#a855f7"/><rect x="10" y="9" width="4" height="12" rx="1" fill="#a855f7"/><rect x="17" y="4" width="4" height="17" rx="1" fill="#a855f7"/></svg>`,
          iconBg:   '#a855f7',
          title:    s6Txt('Efficiency Status', 'حالة كفاءة الحملات'),
          line1:    cpaStatusText,
          line2:    null,
          line2Color: null,
        },
      ];

      RECS = [
        {
          emoji: '🎯', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', glow: '#ef4444',
          title: s6Txt('Focus on High-ROI Channels', 'ركّز على القنوات الرابحة'),
          body:  s6Txt('Shift marketing focus from channels that exceed CPA limits to lower-cost segments.', 'انقل التركيز التسويقي من القنوات التي تتجاوز حدود تكلفة الاكتساب إلى القطاعات الأقل تكلفة.'),
          cta:   s6Txt('Optimize spend allocation', 'حسّن توزيع الميزانية'),
        },
        {
          emoji: '📅', bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.28)', glow: '#14b8a6',
          title: s6Txt('Analyze Low-performing Days', 'تحليل الأيام المهدورة'),
          body:  s6Txt('Review creative performance and campaigns on days with zero orders or high CPA.', 'راجع أداء الإعلانات والحملات في الأيام التي سجلت صفراً أو تكلفة اكتساب مرتفعة جداً.'),
          cta:   s6Txt('Identify leakage', 'حدد نقاط تسريب الميزانية'),
        },
        {
          emoji: '📈', bg: 'rgba(0,230,118,0.12)', border: 'rgba(0,230,118,0.28)', glow: '#00e676',
          title: s6Txt('Leverage Efficient Ads', 'استفد من الإعلانات الرابحة'),
          body:  averageCpa <= breakEvenCpa
            ? s6Txt('Your average CPA is healthy. You can safely increase budget on winning ad sets.', 'متوسط تكلفة الاكتساب في وضع جيد. يمكنك زيادة الميزانية بأمان للمجموعات الإعلانية الناجحة.')
            : s6Txt('Optimize targeting and creatives before increasing campaign budgets.', 'حسّن الاستهداف والتصاميم قبل رفع ميزانيات الإعلانات العامة.'),
          cta:   averageCpa <= breakEvenCpa
            ? s6Txt('Scale winning groups', 'وسّع المجموعات الناجحة')
            : s6Txt('Optimize first', 'حسّن إعدادات الحملة أولاً'),
        },
      ];
    } else {
      PLATFORM_ROWS = [];
      ACCOUNT_CPA = null;
      // ── Profit Trend calculations ───────────────────────────────────────────
      const values = chartData.map(x => x.v);
      const n = values.length || 1;

      const sum = values.reduce((a, b) => a + b, 0);
      const avg = parseFloat((sum / n).toFixed(2));
      const maxVal = Math.max(...values, 0);
      const minVal = values.length > 0 ? Math.min(...values) : 0;
      const aboveAvgDays = values.filter(v => v > avg).length;
      const last24h = values.length > 0 ? values[values.length - 1] : 0;

      let highDays = 0, highSar = 0;
      let midDays = 0, midSar = 0;
      let lowDays = 0, lowSar = 0;

      values.forEach(v => {
        if (v > 450) {
          highDays++;
          highSar += v;
        } else if (v >= 200) {
          midDays++;
          midSar += v;
        } else {
          lowDays++;
          lowSar += v;
        }
      });

      PERF_DATA = [
        { key: 'high', label: s6Txt('High Performance', 'أداء مرتفع'), days: highDays, pct: parseFloat(((highDays / n) * 100).toFixed(1)), sar: convert(highSar, baseCurrency, activeCurrency), color: '#00e676', threshold: '> ' + moneyNumber(convert(450, baseCurrency, activeCurrency), 0) + ' ' + activeCurrency     },
        { key: 'mid',  label: s6Txt('Medium Performance', 'أداء متوسط'), days: midDays,  pct: parseFloat(((midDays / n) * 100).toFixed(1)),  sar: convert(midSar, baseCurrency, activeCurrency),  color: '#3b82f6', threshold: moneyNumber(convert(200, baseCurrency, activeCurrency), 0) + ' - ' + moneyNumber(convert(450, baseCurrency, activeCurrency), 0) + ' ' + activeCurrency },
        { key: 'low',  label: s6Txt('Low Performance', 'أداء منخفض'), days: lowDays,  pct: parseFloat(((lowDays / n) * 100).toFixed(1)),  sar: convert(lowSar, baseCurrency, activeCurrency),  color: '#ef4444', threshold: '< ' + moneyNumber(convert(200, baseCurrency, activeCurrency), 0) + ' ' + activeCurrency     },
      ];

      METRICS_ROWS = [
        { label: s6Txt('Average Daily Taager Profit After Tax', 'متوسط ربح تاجر بعد الضريبة اليومي'), value: moneyNumber(convert(avg, baseCurrency, activeCurrency), 1), unit: activeCurrency, color: 'rgba(255,255,255,0.85)' },
        { label: s6Txt('Highest Daily Taager Profit After Tax', 'أعلى ربح تاجر بعد الضريبة يومي'),       value: moneyNumber(convert(maxVal, baseCurrency, activeCurrency), 1), unit: activeCurrency, color: '#00e676' },
        { label: s6Txt('Lowest Daily Taager Profit After Tax', 'أقل ربح تاجر بعد الضريبة يومي'),        value: moneyNumber(convert(minVal, baseCurrency, activeCurrency), 1), unit: activeCurrency, color: '#ef4444' },
        { label: s6Txt('Days Above Average', 'أيام فوق المتوسط'),       value: aboveAvgDays.toString(),      unit: s6Txt('days', 'أيام'), color: 'rgba(255,255,255,0.85)' },
        { label: s6Txt('Last 24 Hours', 'آخر 24 ساعة'),           value: moneyNumber(convert(last24h, baseCurrency, activeCurrency), 1), unit: activeCurrency, color: 'rgba(255,255,255,0.85)' },
      ];

      const maxIdx = values.indexOf(maxVal);
      const bestDayLabel = maxIdx !== -1 ? chartData[maxIdx].d : 'N/A';

      const half = Math.floor(n / 2);
      const firstHalfSum = values.slice(0, half).reduce((a, b) => a + b, 0);
      const secondHalfSum = values.slice(half).reduce((a, b) => a + b, 0);
      const velocityChange = firstHalfSum > 0 ? parseFloat((((secondHalfSum - firstHalfSum) / firstHalfSum) * 100).toFixed(1)) : 0;

      const velocityText = velocityChange >= 0
        ? s6Txt(`Second half is higher by ${velocityChange}% than the first half`, `النصف الثاني أعلى بـ ${velocityChange}% من النصف الأول`)
        : s6Txt(`Second half is lower by ${Math.abs(velocityChange)}% than the first half`, `النصف الثاني أقل بـ ${Math.abs(velocityChange)}% من النصف الأول`);

      const pctAboveAvg = avg > 0 ? Math.round(((maxVal - avg) / avg) * 100) : 0;

      OBSERVATIONS = [
        {
          iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 7L13.5 15.5L8.5 10.5L2 17" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7h6v6" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
          iconBg:   '#00e676',
          title:    s6Txt('Best Performing Day', 'أفضل يوم أداء'),
          line1:    `${moneyNumber(convert(maxVal, baseCurrency, activeCurrency), 1)} ${activeCurrency} — ${bestDayLabel} ` + s6Txt('(highest value in the period)', '(أعلى قيمة في الفترة)'),
          line2:    `↑ ${pctAboveAvg}% ` + s6Txt('above daily average', 'فوق المتوسط اليومي'),
          line2Color: '#00e676',
        },
        {
          iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#f59e0b" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/></svg>`,
          iconBg:   '#f59e0b',
          title:    s6Txt('Half-Half Performance', 'أداء النصفين'),
          line1:    velocityText,
          line2:    null,
          line2Color: null,
        },
        {
          iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="14" width="4" height="7" rx="1" fill="#a855f7"/><rect x="10" y="9" width="4" height="12" rx="1" fill="#a855f7"/><rect x="17" y="4" width="4" height="17" rx="1" fill="#a855f7"/></svg>`,
          iconBg:   '#a855f7',
          title:    s6Txt('General Trend', 'اتجاه عام'),
          line1:    velocityChange >= 0 ? s6Txt('Stable upward trend in Taager profit performance', 'اتجاه تصاعدي مستقر في أداء ربح تاجر') : s6Txt('Relative stability in daily Taager profit performance', 'استقرار نسبي في أداء ربح تاجر اليومي'),
          line2:    s6Txt('With natural fluctuations in sales and activity', 'مع تقلبات طبيعية في المبيعات والنشاط'),
          line2Color: 'rgba(255,255,255,0.4)',
        },
      ];

      const lowDaysList = chartData.filter(x => x.v < 200).slice(0, 3).map(x => x.d);
      const lowDaysStr = lowDaysList.length > 0 ? `(${lowDaysList.join(isAr ? '، ' : ', ')})` : s6Txt('during low periods', 'خلال الفترات المنخفضة');

      RECS = [
        {
          emoji: '🎯', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', glow: '#ef4444',
          title: s6Txt('Focus on Winning Products', 'ركّز على المنتجات الرابحة'),
          body:  s6Txt('Maintain your marketing focus on the highly demanded products', 'حافظ على تركيزك التسويقي لأكثر المنتجات طلباً'),
          cta:   s6Txt('Continue promoting them', 'استمر في الترويج لها'),
        },
        {
          emoji: '📅', bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.28)', glow: '#14b8a6',
          title: s6Txt('Analyze Low-performing Days', 'تحليل الأيام المنخفضة'),
          body:  s6Txt('Review marketing strategies and activity during days with lowest Taager profit', 'راجع استراتيجيات التسويق والنشاط بالأيام الأقل ربحا من تاجر'),
          cta:   lowDaysStr,
        },
        {
          emoji: '📈', bg: 'rgba(0,230,118,0.12)', border: 'rgba(0,230,118,0.28)', glow: '#00e676',
          title: s6Txt('Leverage Current Momentum', 'استفد من الزخم الحالي'),
          body:  velocityChange >= 0
            ? s6Txt('Maintain your current activity level, there is a steady improvement', 'حافظ على معدل النشاط الحالي، هناك تحسن مستمر')
            : s6Txt('Stimulate your marketing campaigns to increase Taager profit volume and daily activity', 'حفز حملاتك التسويقية لزيادة حجم ربح تاجر والنشاط اليومي'),
          cta:   velocityChange >= 0
            ? s6Txt('Steady improvement in performance', 'تحسن مستمر في الأداء')
            : s6Txt('Boost marketing activity', 'حفز النشاط التسويقي'),
        },
      ];
    }

    mountEl.innerHTML = `
      <div class="dash-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;background:var(--dash-bg); font-family:inherit;">

        ${topBarHtml()}

        <div class="s6-body" style="padding:20px 28px;display:flex;flex-direction:column;gap:16px;">

          <!-- ROW 1: header + chart -->
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${headerRowHtml()}
            ${areaChartCardHtml()}
            ${platformAnalyticsHtml()}
          </div>

          <!-- ROW 2 & 3: cards wrapper -->
          <div id="s6-cards-wrapper" style="display:flex;flex-direction:column;gap:16px;">
            ${cardsHtml()}
          </div>

        </div>
      </div>
    `;

    // wire up events and build charts
    wireEvents();
    bindS6CurrencySelect();
    buildAreaChart();
    buildDonutChart();
    animateTotalCountup();
  }

  function updateCpaCalculationsAndChart() {
    const profile = cpaChartProfile();
    const chartData = profile.labels.map(function (label) { return { d: label }; });
    const ordersValues = profile.denominatorValues.map(x => Number(x || 0));
    const spendValues = profile.spendValues.map(x => Number(x || 0));
    const breakEvenCpa = getBreakEvenCpa();
    const threshold = breakEvenCpa * 0.05;
    const cpaValues = profile.cpaValues.map(x => Number(x || 0));

    let profitableDays = 0, profitableSpend = 0;
    let unprofitableDays = 0, unprofitableSpend = 0;
    let borderlineDays = 0, borderlineSpend = 0;
    let zeroOrderDays = 0, zeroOrderSpend = 0;

    ordersValues.forEach((orders, i) => {
      const daySpend = Number(spendValues[i] || 0);
      const cpa = Number(cpaValues[i] || 0);
      if (orders === 0) {
        zeroOrderDays++;
        zeroOrderSpend += daySpend;
      } else {
        const diff = cpa - breakEvenCpa;
        if (diff < -threshold) {
          profitableDays++;
          profitableSpend += daySpend;
        } else if (diff > threshold) {
          unprofitableDays++;
          unprofitableSpend += daySpend;
        } else {
          borderlineDays++;
          borderlineSpend += daySpend;
        }
      }
    });

    const totalDays = ordersValues.length || 1;
    const totalOrders = ordersValues.reduce((a, b) => a + b, 0);
    const totalSpend = spendValues.reduce((a, b) => a + b, 0);
    const averageCpa = totalOrders > 0 ? totalSpend / totalOrders : 0;
    
    const nonZeroCpas = cpaValues.filter(v => v > 0);
    const minCpa = nonZeroCpas.length > 0 ? Math.min(...nonZeroCpas) : 0;
    const maxCpa = cpaValues.length > 0 ? Math.max(...cpaValues) : 0;

    const badge = document.getElementById('s6-header-cpa-badge');
    if (badge) {
      const cColor = averageCpa > breakEvenCpa ? '#ef4444' : '#00e676';
      badge.style.color = cColor;
      badge.style.background = cColor + '12';
      badge.style.borderColor = cColor + '25';
    }

    renderCardsOnly(
      profitableDays, profitableSpend,
      unprofitableDays, unprofitableSpend,
      borderlineDays, borderlineSpend,
      zeroOrderDays, zeroOrderSpend,
      averageCpa, breakEvenCpa,
      minCpa, maxCpa,
      totalSpend, totalOrders, totalDays,
      cpaValues, chartData
    );

    buildAreaChart();
    animateTotalCountup();
  }

  function renderCardsOnly(profitableDays, profitableSpend, unprofitableDays, unprofitableSpend, borderlineDays, borderlineSpend, zeroOrderDays, zeroOrderSpend, averageCpa, breakEvenCpa, minCpa, maxCpa, totalSpend, totalOrders, totalDays, cpaValues, chartData) {
    // Recompute PERF_DATA, METRICS_ROWS, OBSERVATIONS and RECS
    PERF_DATA = [
      { key: 'profitable', label: s6Txt('Winning', 'مربح (أقل من التعادل)'), days: profitableDays, pct: parseFloat(((profitableDays / totalDays) * 100).toFixed(1)), sar: profitableSpend, color: '#00e676' },
      { key: 'borderline', label: s6Txt('Borderline', 'تعادل تقريبي'), days: borderlineDays, pct: parseFloat(((borderlineDays / totalDays) * 100).toFixed(1)), sar: borderlineSpend, color: '#f59e0b' },
      { key: 'unprofitable', label: s6Txt('Losing', 'خسارة (فوق التعادل)'), days: unprofitableDays, pct: parseFloat(((unprofitableDays / totalDays) * 100).toFixed(1)), sar: unprofitableSpend, color: '#ef4444' },
      { key: 'zero', label: s6Txt('Zero Orders (Wasted)', 'صفر طلبات (مهدور)'), days: zeroOrderDays, pct: parseFloat(((zeroOrderDays / totalDays) * 100).toFixed(1)), sar: zeroOrderSpend, color: '#ff9800' }
    ];

    METRICS_ROWS = [
      { label: s6Txt('Average CPA', 'متوسط تكلفة الطلب (CPA)'), value: moneyNumber(averageCpa, 1), unit: activeCurrency, color: 'rgba(255,255,255,0.85)' },
      { label: s6Txt('commission.breakEvenLine', 'تكلفة التعادل (CPA)'), value: moneyNumberMax(breakEvenCpa, 2), unit: activeCurrency, color: '#f59e0b' },
      { label: s6Txt('Lowest Daily CPA', 'أقل تكلفة طلب يومية'), value: moneyNumber(minCpa, 1), unit: activeCurrency, color: '#00e676' },
      { label: s6Txt('Highest Daily CPA', 'أعلى تكلفة طلب يومية'), value: moneyNumber(maxCpa, 1), unit: activeCurrency, color: '#ef4444' },
      { label: s6Txt('Total Period Ad Spend', 'إجمالي الإنفاق للفترة'), value: moneyNumber(totalSpend, 2), unit: activeCurrency, color: 'rgba(255,255,255,0.85)' }
    ];

    const nonZeroCpaValues = cpaValues.map((v, idx) => ({ v, idx })).filter(x => x.v > 0);
    let bestDayLabel = 'N/A';
    let bestCpaVal = 0;
    if (nonZeroCpaValues.length > 0) {
      const best = nonZeroCpaValues.reduce((min, cur) => cur.v < min.v ? cur : min, nonZeroCpaValues[0]);
      bestDayLabel = chartData[best.idx].d;
      bestCpaVal = best.v;
    }
    
    const cpaStatusText = averageCpa <= breakEvenCpa
      ? s6Txt('Average CPA is below break-even. Campaigns are operating efficiently.', 'متوسط تكلفة الاكتساب تحت حد التعادل. الحملات تعمل بكفاءة.')
      : s6Txt('Average CPA exceeds break-even. Consider optimizing campaign targeting.', 'متوسط تكلفة الاكتساب يتجاوز حد التعادل. يوصى بتحسين استهداف الحملات.');

    OBSERVATIONS = [
      {
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 7L13.5 15.5L8.5 10.5L2 17" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7h6v6" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        iconBg:   '#00e676',
        title:    s6Txt('Best CPA Day', 'أفضل يوم لتكلفة الطلب'),
        line1:    bestCpaVal > 0 ? `${moneyNumber(bestCpaVal, 1)} ${activeCurrency} — ${bestDayLabel}` : 'N/A',
        line2:    bestCpaVal > 0 ? s6Txt('Lowest cost of acquisition in this period', 'أقل تكلفة اكتساب تم تحقيقها في هذه الفترة') : '',
        line2Color: '#00e676',
      },
      {
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#f59e0b" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/></svg>`,
        iconBg:   '#f59e0b',
        title:    s6Txt('CPA Efficiency Share', 'نسبة كفاءة تكلفة الاكتساب'),
        line1:    s6Txt(`${profitableDays} out of ${totalDays} days were profitable`, `${profitableDays} من أصل ${totalDays} أيام كانت رابحة`),
        line2:    s6Txt(`With CPA below target break-even limit`, `حيث كانت تكلفة الاكتساب أقل من حد التعادل`),
        line2Color: 'rgba(255,255,255,0.4)',
      },
      {
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="14" width="4" height="7" rx="1" fill="#a855f7"/><rect x="10" y="9" width="4" height="12" rx="1" fill="#a855f7"/><rect x="17" y="4" width="4" height="17" rx="1" fill="#a855f7"/></svg>`,
        iconBg:   '#a855f7',
        title:    s6Txt('Efficiency Status', 'حالة كفاءة الحملات'),
        line1:    cpaStatusText,
        line2:    null,
        line2Color: null,
      },
    ];

    RECS = [
      {
        emoji: '🎯', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', glow: '#ef4444',
        title: s6Txt('Focus on High-ROI Channels', 'ركّز على القنوات الرابحة'),
        body:  s6Txt('Shift marketing focus from channels that exceed CPA limits to lower-cost segments.', 'انقل التركيز التسويقي من القنوات التي تتجاوز حدود تكلفة الاكتساب إلى القطاعات الأقل تكلفة.'),
        cta:   s6Txt('Optimize spend allocation', 'حسّن توزيع الميزانية'),
      },
      {
        emoji: '📅', bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.28)', glow: '#14b8a6',
        title: s6Txt('Analyze Low-performing Days', 'تحليل الأيام المهدورة'),
        body:  s6Txt('Review creative performance and campaigns on days with zero orders or high CPA.', 'راجع أداء الإعلانات والحملات في الأيام التي سجلت صفراً أو تكلفة اكتساب مرتفعة جداً.'),
        cta:   s6Txt('Identify leakage', 'حدد نقاط تسريب الميزانية'),
      },
      {
        emoji: '📈', bg: 'rgba(0,230,118,0.12)', border: 'rgba(0,230,118,0.28)', glow: '#00e676',
        title: s6Txt('Leverage Efficient Ads', 'استفد من الإعلانات الرابحة'),
        body:  averageCpa <= breakEvenCpa
          ? s6Txt('Your average CPA is healthy. You can safely increase budget on winning ad sets.', 'متوسط تكلفة الاكتساب في وضع جيد. يمكنك زيادة الميزانية بأمان للمجموعات الإعلانية الناجحة.')
          : s6Txt('Optimize targeting and creatives before increasing campaign budgets.', 'حسّن الاستهداف والتصاميم قبل رفع ميزانيات الإعلانات العامة.'),
        cta:   averageCpa <= breakEvenCpa
          ? s6Txt('Scale winning groups', 'وسّع المجموعات الناجحة')
          : s6Txt('Optimize first', 'حسّن إعدادات الحملة أولاً'),
      },
    ];

    document.getElementById('s6-cards-wrapper').innerHTML = cardsHtml();
    buildDonutChart();
  }

  // ── Chart.js helpers ───────────────────────────────────────────────────────
  function buildAreaChart() {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const canvas = document.getElementById('s6-area-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const chartData = getChartData(activePeriod);
    const labels = chartData.map(x => x.d);

    const canvasCtx = canvas.getContext('2d');
    const theme = window.dashboardThemeColors ? window.dashboardThemeColors() : {
      bg: '#080b12',
      surface: 'rgba(11,17,32,0.95)',
      borderSoft: 'rgba(255,255,255,0.1)',
      text: '#fff',
      muted: 'rgba(255,255,255,0.5)',
      grid: 'rgba(255,255,255,0.05)',
      label: 'rgba(255,255,255,0.38)'
    };

    let datasets = [];
    let ordersValues = [];
    let breakEvenCpa = getBreakEvenCpa();
    const threshold = breakEvenCpa * 0.05;

    if (activeMode === 'cpa') {
      const profile = cpaChartProfile();
      labels.splice(0, labels.length, ...profile.labels);
      ordersValues = profile.denominatorValues;
      const cpaValues = profile.cpaValues;
      const cpaLineColor = activeCpaPlatform === 'all' ? '#a855f7' : platformColor(activeCpaPlatform);

      const pointBackgroundColor = cpaValues.map((cpa, i) => {
        const orders = ordersValues[i];
        if (orders === 0) return '#ef4444'; // Red for zero orders (losing)
        const diff = cpa - breakEvenCpa;
        if (diff > threshold) return '#ef4444'; // Red (losing)
        if (diff < -threshold) return '#00e676'; // Green (profitable)
        return '#f59e0b'; // Amber (borderline)
      });

      datasets = [
        {
          label: profile.datasetLabel || s6Txt('commission.modeCpa', 'تكلفة الطلب (CPA)'),
          data: cpaValues,
          borderColor: cpaLineColor,
          borderWidth: 2.5,
          backgroundColor: cpaLineColor + '12',
          fill: false,
          tension: 0.4,
          pointRadius: 4.5,
          pointBackgroundColor: pointBackgroundColor,
          pointBorderColor: pointBackgroundColor,
          pointBorderWidth: 1.5,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: pointBackgroundColor,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        },
        {
          label: s6Txt('commission.breakEvenLine', 'تكلفة التعادل (CPA)'),
          data: Array(labels.length).fill(breakEvenCpa),
          borderColor: '#f59e0b',
          borderWidth: 1.5,
          borderDash: [6, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
        }
      ];
    } else {
      const values = chartData.map(x => convert(x.v, baseCurrency, activeCurrency));
      const grad = canvasCtx.createLinearGradient(0, 0, 0, 240);
      grad.addColorStop(0.05, 'rgba(0,230,118,0.35)');
      grad.addColorStop(0.95, 'rgba(0,230,118,0)');

      datasets = [{
        label: s6Txt('Total Taager Profit After Tax', 'ربح تاجر بعد الضريبة'),
        data: values,
        borderColor: '#00e676',
        borderWidth: 2.5,
        backgroundColor: grad,
        fill: true,
        tension: 0.4,
        pointRadius: 3.5,
        pointBackgroundColor: '#00e676',
        pointBorderColor: theme.bg,
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#00e676',
        pointHoverBorderColor: theme.bg,
        pointHoverBorderWidth: 2,
      }];
    }

    const breakEvenTargetPlugin = {
      id: 's6BreakEvenTarget',
      afterDatasetsDraw: function (chart) {
        if (activeMode !== 'cpa' || !breakEvenCpa) return;
        const xScale = chart.scales && chart.scales.x;
        const yScale = chart.scales && chart.scales.y;
        const chartArea = chart.chartArea;
        if (!xScale || !yScale || !chartArea) return;

        const y = yScale.getPixelForValue(breakEvenCpa);
        if (y < chartArea.top || y > chartArea.bottom) return;

        const ctx = chart.ctx;
        const fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
        const markerX = Math.max(chartArea.left + 18, xScale.getPixelForValue(0) + 24);
        const labelText = s6Txt('commission.breakEvenLine', 'Break-even CPA') + ': ' +
          moneyNumberMax(breakEvenCpa, 2) + ' ' + activeCurrency;

        ctx.save();
        ctx.font = '700 10px ' + fontFamily;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const maxLabelWidth = Math.max(110, chartArea.right - markerX - 24);
        const labelWidth = Math.min(Math.max(ctx.measureText(labelText).width + 18, 108), maxLabelWidth);
        const labelHeight = 18;
        const labelX = markerX + 12;
        const preferredLabelY = y + 10;
        const labelY = Math.min(Math.max(preferredLabelY, chartArea.top + 4), chartArea.bottom - labelHeight - 4);

        ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
        ctx.beginPath();
        ctx.arc(markerX, y, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(markerX, y, 6.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(markerX, y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.34)';
        ctx.lineWidth = 1;
        roundRect(ctx, labelX, labelY, labelWidth, labelHeight, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.fillText(labelText, labelX + 10, labelY + (labelHeight / 2), labelWidth - 20);
        ctx.restore();
      }
    };

    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      plugins: activeMode === 'cpa' ? [breakEvenTargetPlugin] : [],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        plugins: {
          legend: { display: activeMode === 'cpa' },
          tooltip: {
            backgroundColor: theme.surface,
            borderColor: activeMode === 'cpa' ? 'rgba(168,85,247,0.3)' : 'rgba(0,230,118,0.3)',
            borderWidth: 1,
            titleColor: theme.muted,
            bodyColor: activeMode === 'cpa' ? '#c084fc' : '#00e676',
            bodyFont: { weight: '700', size: 13 },
            callbacks: {
              label: ctx => {
                const val = Number(ctx.parsed.y || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
                const datasetLabel = ctx.dataset.label || '';
                if (activeMode === 'cpa' && ctx.datasetIndex === 0) {
                  const orders = ordersValues[ctx.dataIndex];
                  let statusText = '';
                  if (orders === 0) {
                    statusText = ` (${s6Txt('Zero Orders - Wasted Spend', 'صفر طلبات - إنفاق مهدور')})`;
                  } else {
                    const diff = ctx.parsed.y - breakEvenCpa;
                    if (diff > threshold) {
                      statusText = ` (${s6Txt('Losing', 'خسارة')})`;
                    } else if (diff < -threshold) {
                      statusText = ` (${s6Txt('Winning', 'ربح')})`;
                    } else {
                      statusText = ` (${s6Txt('Borderline', 'تعادل تقريبي')})`;
                    }
                  }
                  return ` ${datasetLabel}: ${val} ${activeCurrency}${statusText}`;
                }
                return ` ${datasetLabel}: ${val} ${activeCurrency}`;
              }
            },
          },
          datalabels: false,
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: theme.label,
              font: { size: 10, family: 'inherit' },
              maxRotation: 0,
              maxTicksLimit: (activePeriod === 'month') ? 10 : activePeriod === '14' ? 7 : 7,
            },
          },
          y: {
            beginAtZero: activeMode === 'cpa',
            suggestedMax: activeMode === 'cpa'
              ? Math.max(
                  breakEvenCpa * 1.24,
                  (datasets[0] && datasets[0].data ? Math.max(...datasets[0].data) : 0) * 1.12
                )
              : undefined,
            grid: {
              color: theme.grid,
              drawBorder: false,
            },
            border: { display: false, dash: [4, 4] },
            ticks: {
              color: theme.label,
              font: { size: 10, family: 'inherit' },
              maxTicksLimit: 5,
            },
          },
        },
      },
    });

    chartInstance.options.animation = {
      duration: 220,
      onComplete: function () {
        drawValueLabels(chartInstance);
      },
    };
    chartInstance.update();
  }

  function drawValueLabels(chart) {
    const { ctx, data, scales } = chart;
    const dataset = data.datasets[0];
    ctx.save();
    ctx.font = '700 10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    dataset.data.forEach((value, i) => {
      // Don't draw bubbles for 0 values on CPA chart
      if (activeMode === 'cpa' && value === 0) return;
      
      const x = scales.x.getPixelForValue(i);
      const y = scales.y.getPixelForValue(value);
      const label = Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
      const w = Math.max(36, ctx.measureText(label).width + 12);
      const h = 16;
      const lx = x - w / 2;
      const ly = y - 30;

      let color = '#00e676';
      let bg = 'rgba(0, 230, 118, 0.15)';
      let border = 'rgba(0, 230, 118, 0.35)';

      if (activeMode === 'cpa') {
        const pointColor = dataset.pointBackgroundColor[i];
        color = pointColor;
        if (pointColor === '#ef4444') {
          bg = 'rgba(239, 68, 68, 0.15)';
          border = 'rgba(239, 68, 68, 0.35)';
        } else if (pointColor === '#f59e0b') {
          bg = 'rgba(245, 158, 11, 0.15)';
          border = 'rgba(245, 158, 11, 0.35)';
        } else {
          bg = 'rgba(0, 230, 118, 0.15)';
          border = 'rgba(0, 230, 118, 0.35)';
        }
      } else {
        color = '#00e676';
        bg = 'rgba(0, 230, 118, 0.15)';
        border = 'rgba(0, 230, 118, 0.35)';
      }

      // pill background
      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 0.8;
      roundRect(ctx, lx, ly, w, h, 5);
      ctx.fill();
      ctx.stroke();

      // label text
      ctx.fillStyle = color;
      ctx.fillText(label, x, ly + h / 2);
    });
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function buildDonutChart() {
    const canvas = document.getElementById('s6-donut-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (donutChartInstance) { donutChartInstance.destroy(); donutChartInstance = null; }
    const theme = window.dashboardThemeColors ? window.dashboardThemeColors() : {
      surface: 'rgba(11,17,32,0.95)',
      borderSoft: 'rgba(255,255,255,0.1)',
      text: '#fff'
    };

    donutChartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: PERF_DATA.map(d => d.label),
        datasets: [{
          data: PERF_DATA.map(d => d.pct),
          backgroundColor: PERF_DATA.map(d => d.color),
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { duration: 260, animateRotate: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.surface,
            borderColor: theme.borderSoft,
            borderWidth: 1,
            bodyColor: theme.text,
            callbacks: {
              label: (ctx) => {
                const perf = PERF_DATA[ctx.dataIndex];
                return ` ${moneyNumber(perf.sar, 1)} ${activeCurrency} — ${perf.days} ` + s6Txt('days', 'أيام');
              },
            },
          },
        },
        spacing: 4,
      },
    });
  }

  function animateTotalCountup() {
    const el = document.getElementById('s6-total-countup');
    if (!el) return;
    
    // Only animate if in profit mode (average CPA is static and simple)
    if (activeMode !== 'cpa' && typeof window.animateNumber === 'function') {
      const convertedTotal = convert(total, baseCurrency, activeCurrency);
      window.animateNumber(el, convertedTotal, { duration: 520, decimals: 2, compact: activeCurrency === 'IQD' });
    } else {
      if (activeMode === 'cpa') {
        const averageCpa = averageCpaFromProfile(cpaChartProfile());
        el.textContent = moneyNumber(averageCpa, 1);
      } else {
        const convertedTotal = convert(total, baseCurrency, activeCurrency);
        el.textContent = moneyNumber(convertedTotal, 2);
      }
    }
  }

  // ── event wiring ───────────────────────────────────────────────────────────
  function wireEvents() {
    // 1. Period tabs
    const tabContainer = document.getElementById('s6-period-tabs');
    if (tabContainer) {
      tabContainer.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-period]');
        if (!btn) return;
        const newPeriod = btn.dataset.period;
        if (newPeriod === activePeriod) return;
        activePeriod = newPeriod;
        mountEl._s6ActivePeriod = newPeriod;
        render();
      });
    }

    // 2. Mode toggles
    const modeProfitBtn = document.getElementById('s6-mode-profit');
    const modeCpaBtn = document.getElementById('s6-mode-cpa');
    if (modeProfitBtn) {
      modeProfitBtn.addEventListener('click', function () {
        if (activeMode === 'profit') return;
        activeMode = 'profit';
        mountEl._s6ActiveMode = 'profit';
        render();
      });
    }
    if (modeCpaBtn) {
      modeCpaBtn.addEventListener('click', function () {
        if (activeMode === 'cpa') return;
        activeMode = 'cpa';
        mountEl._s6ActiveMode = 'cpa';
        render();
      });
    }

    const cpaPlatformTabs = document.getElementById('s6-cpa-platform-tabs');
    if (cpaPlatformTabs) {
      cpaPlatformTabs.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-cpa-platform]');
        if (!btn) return;
        const platform = btn.getAttribute('data-cpa-platform') || 'all';
        if (platform === activeCpaPlatform) return;
        activeCpaPlatform = platform;
        mountEl._s6ActiveCpaPlatform = platform;
        render();
      });
    }

    // 3. Spend input (only in CPA mode)
    const spendInput = document.getElementById('s6-spend-input');
    if (spendInput) {
      spendInput.addEventListener('input', function (e) {
        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
        dailyAdSpend = val;
        mountEl._s6DailyAdSpend = val;
        mountEl._s6DailyAdSpendIsManual = true;
        
        // Re-run the local calculations and update graph/cards dynamically
        updateCpaCalculationsAndChart();
      });
    }

    // 4. Native currency selector fallback
    const nativeSelect = document.getElementById('s6-currency-native');
    if (nativeSelect) {
      nativeSelect.addEventListener('change', function (e) {
        setS6Currency(e.target.value);
      });
    }
  }

  // Cleanup any old listeners on this mountEl
  if (mountEl._s6RoiListener && window.DashboardRoiState) {
    window.DashboardRoiState.unsubscribe(mountEl._s6RoiListener);
  }
  if (mountEl._s6MarketingListener && window.DashboardMarketingState) {
    window.DashboardMarketingState.unsubscribe(mountEl._s6MarketingListener);
  }

  // Define listeners
  mountEl._s6RoiListener = function () {
    if (!mountEl.isConnected) return;
    render();
  };
  mountEl._s6MarketingListener = function () {
    if (!mountEl.isConnected) return;
    render();
  };

  // Subscribe to changes
  if (window.DashboardRoiState) {
    window.DashboardRoiState.subscribe(mountEl._s6RoiListener);
  }
  if (window.DashboardMarketingState) {
    window.DashboardMarketingState.subscribe(mountEl._s6MarketingListener);
  }

  // Unsubscribe on unmount
  mountEl._dashboardSectionCleanup = function () {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (donutChartInstance) {
      donutChartInstance.destroy();
      donutChartInstance = null;
    }
    if (mountEl._s6RoiListener && window.DashboardRoiState) {
      window.DashboardRoiState.unsubscribe(mountEl._s6RoiListener);
      mountEl._s6RoiListener = null;
    }
    if (mountEl._s6MarketingListener && window.DashboardMarketingState) {
      window.DashboardMarketingState.unsubscribe(mountEl._s6MarketingListener);
      mountEl._s6MarketingListener = null;
    }
  };

  // ── go ────────────────────────────────────────────────────────────────────
  render();
};
