/*
   dashboard-aggregator.js
   Loads Dashboard snapshots, preserves account identity, and converts raw Taager
   rows into the section data consumed by dashboard-shell.js.

   FIXES (v2):
   - Sort: deliveredCount descending (b - a), commission as tiebreaker
   - Taager NDR: delivered / (created orders - canceled-status orders)
   - Confirmation %: (confirmed + shipping + processing + delivered) / total
   - Product counters: all buckets (confirmed, shipping, processing, waiting, pending) now properly incremented
   - Debug logging for first 3 products after build
*/
(function () {
  'use strict';

  // =======================================================================
  // IMPORTANT WARNING: Do not translate cities or provinces. 
  // Do not translate cities or provinces.
  // Force showing the city and the province name in Arabic everywhere.
  // =======================================================================

  // T-02: THRESHOLDS
  // Configurable thresholds for Saudi COD e-commerce market.
  // Exposed via window.getDashboardThresholds() for use by other modules.
  var THRESHOLDS = {
    NDR_DANGER:                  0.20,   // NDR < 20% = dangerous
    NDR_SAFE:                    0.40,   // NDR >= 40% = excellent / scalable
    NDR_NATIONAL:                0.30,   // Healthy baseline (configurable)
    DR_EXCELLENT:                0.40,   // DR >= 40% = excellent
    DR_GOOD:                     0.30,   // DR 30-40% = good
    DR_POOR:                     0.20,   // DR < 20% = needs attention
    SCALING_MIN_ORDERS:          30,     // Minimum orders to calculate scaling score
    INSIGHT_MIN_SAMPLE:          15,     // Minimum orders for insight to fire
    PREPAID_ADVANTAGE_THRESHOLD: 0.15,   // If prepaidNdr - codNdr > 15pp, recommend prepaid
    COD_HEAVY_THRESHOLD:         0.85,   // City with >85% COD orders
    SCALING_SCORE_GREEN:         70,
    RISK_SCORE_RED:              65
  };
  window.getDashboardThresholds = function () { return THRESHOLDS; };
  // ---------------------------------------------------------------------------

  var ALL_ACCOUNTS = '__all__';
  var AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  function dt(key, params) {
    return window.dashboardI18n ? window.dashboardI18n.t(key, params) : key;
  }

  function raw(text) {
    return window.dashboardI18n ? window.dashboardI18n.raw(text) : text;
  }

  function allLabel() { return dt('shell.allAccounts'); }
  function noUpdate() { return dt('shell.noUpdate'); }

  function fmtNum(n, opts) {
    return window.dashboardI18n ? window.dashboardI18n.number(n, opts) : Number(n).toLocaleString('en-US');
  }

  function getStatusBucket(status) {
    if (window.TaagerStatus) {
      return window.TaagerStatus.dashboardBucket(status);
    }
    var s = (status || '').toString().trim().toLowerCase();
    if (!s) return 'other';
    if (s === 'delivered' || s === 'مسلمة') return 'delivered';
    if (s === 'in shipping' || s === 'shipping' || s === 'في الشحن' || s === 'تم الشحن') return 'shipping';
    if (s === 'failed' || s === 'canceled' || s === 'cancelled' || s === 'ملغى' || s === 'مرتجع' || s === 'فشلت') return 'failed';
    if (s === 'awaiting confirmation' || s === 'pending' || s === 'بانتظار التأكيد') return 'pending';
    if (s === 'confirmed' || s === 'مؤكد' || s === 'تم التأكيد') return 'confirmed';
    if (s === 'under processing' || s === 'قيد المعالجة') return 'processing';
    if (s === 'waiting' || s === 'قيد الانتظار' || s === 'بانتظار الشحن') return 'waiting';
    return 'other';
  }

  function normalizeDateKey(value) {
    if (!value) return '';
    function localDateKey(d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
      var parsed = new Date(value);
      return isNaN(parsed.getTime()) ? value.trim() : localDateKey(parsed);
    }
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : localDateKey(d);
  }

  function isRowCreatedInPeriod(row, period) {
    if (!period || !period.dateFrom || !period.dateTo) return true;
    var key = normalizeDateKey(row && (row.createdAt || row.date || row.dashboardDate));
    return key && key >= period.dateFrom && key <= period.dateTo;
  }

  function isDateKeyInPeriod(key, period) {
    if (!period || !period.dateFrom || !period.dateTo) return true;
    key = normalizeDateKey(key);
    return !!key && key >= period.dateFrom && key <= period.dateTo;
  }

  function createdDashboardDate(row) {
    return normalizeDateKey(row && (row.createdAt || row.date || row.dashboardDate));
  }

  function deliveredDateMode() {
    // Taager dashboard/status/NDR migration: delivery and NDR counts are anchored
    // to the selected created-date period so every section uses the same range.
    if (window.DashboardDeliveredDateState && typeof window.DashboardDeliveredDateState.get === 'function') {
      return window.DashboardDeliveredDateState.get() === 'expected' ? 'expected' : 'actual';
    }
    return 'actual';
  }

  function isDeliveredRowInPeriod(row, period, mode) {
    if (getStatusBucket(row && (row.orderStatus || row.status)) !== 'delivered') return false;
    return isDateKeyInPeriod(createdDashboardDate(row), period);
  }

  function deliveredDashboardDate(row, mode) {
    return createdDashboardDate(row);
  }

  function rowDashboardDate(row, mode) {
    if (!row) return '';
    return createdDashboardDate(row);
  }

  function activePeriod() {
    return window.DashboardPeriodState ? window.DashboardPeriodState.get() : null;
  }

  function activeNdrPeriod(mode) {
    if ((mode || deliveredDateMode()) === 'expected' &&
        window.DashboardExpectedNdrRangeState &&
        typeof window.DashboardExpectedNdrRangeState.get === 'function') {
      return window.DashboardExpectedNdrRangeState.get();
    }
    return activePeriod();
  }

  function rangeCacheKey(range) {
    return range && range.dateFrom && range.dateTo ? (range.dateFrom + ':' + range.dateTo) : '';
  }

  function filterRowsByPeriod(rows, period, mode) {
    if (!period || !period.dateFrom || !period.dateTo) return rows;
    return rows.filter(function (row) {
      return isRowCreatedInPeriod(row, period);
    });
  }

  function rowIdentity(row, fallbackIndex) {
    var orderKey = String(row && (row.taagerOrderNumber || row.orderNumber || row.id || row.orderId || row.reference || '') || '').trim();
    var skuKey = String(row && (row.sku || row.products || row.productName || '') || '').trim();
    var itemKey = row && row.orderItemIndex != null ? String(row.orderItemIndex) : '';
    var qtyKey = String(row && (row.qty || '') || '').trim();
    return orderKey ? [orderKey, skuKey, itemKey || qtyKey || normalizedQty(row)].join('|') : ('idx:' + fallbackIndex);
  }

  function unionRows(primaryRows, extraRows) {
    var seen = {};
    var result = (primaryRows || []).slice();
    function remember(row, index) {
      var key = rowIdentity(row, index);
      seen[key] = true;
    }
    function pushExtra(row, index) {
      var key = rowIdentity(row, index);
      if (seen[key]) return;
      seen[key] = true;
      result.push(row);
    }
    (primaryRows || []).forEach(remember);
    (extraRows || []).forEach(pushExtra);
    return result;
  }

  function filterCreatedOrders(rows, period) {
    if (!period || !period.dateFrom || !period.dateTo) return rows.slice();
    return rows.filter(function (row) {
      return isRowCreatedInPeriod(row, period);
    });
  }

  function filterOutcomeOrders(rows, period, mode) {
    if (!period || !period.dateFrom || !period.dateTo) return rows.slice();
    return rows.filter(function (row) {
      return isRowCreatedInPeriod(row, period);
    });
  }

  function isNdrBaseRowInPeriod(row, period, mode) {
    return isRowCreatedInPeriod(row, period);
  }


  function formatDateRangeLabel(period) {
    if (!period || !period.dateFrom || !period.dateTo) return '';
    var from = new Date(period.dateFrom + 'T00:00:00');
    var to = new Date(period.dateTo + 'T00:00:00');
    var locale = window.dashboardI18n && window.dashboardI18n.locale ? window.dashboardI18n.locale() : ((window._kbotLang || 'en') === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US');
    function fmt(d, opts) { return d.toLocaleDateString(locale, opts); }
    if (period.dateFrom === period.dateTo) {
      return fmt(from, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return fmt(from, { month: 'short', day: 'numeric' }) +
      ' - ' +
      fmt(to, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function parsePeriodDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
    var parts = String(value).split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function lastDayOfMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function isFullCalendarMonth(from, to) {
    return from && to &&
      from.getFullYear() === to.getFullYear() &&
      from.getMonth() === to.getMonth() &&
      from.getDate() === 1 &&
      to.getDate() === lastDayOfMonth(to.getFullYear(), to.getMonth());
  }

  function shiftDateByMonths(d, months) {
    var targetYear = d.getFullYear();
    var targetMonth = d.getMonth() + months;
    var targetDay = Math.min(d.getDate(), lastDayOfMonth(targetYear, targetMonth));
    return new Date(targetYear, targetMonth, targetDay);
  }

  function previousMonthPeriod(period) {
    if (!period || !period.dateFrom || !period.dateTo) return null;
    var from = parsePeriodDate(period.dateFrom);
    var to = parsePeriodDate(period.dateTo);
    if (!from || !to) return null;
    if (isFullCalendarMonth(from, to)) {
      var prevMonthStart = new Date(from.getFullYear(), from.getMonth() - 1, 1);
      return {
        preset: 'previousMonth',
        dateFrom: isoDate(prevMonthStart),
        dateTo: isoDate(new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0))
      };
    }
    var days = Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
    var prevTo = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
    var prevFrom = new Date(prevTo.getFullYear(), prevTo.getMonth(), prevTo.getDate() - days + 1);
    return {
      preset: 'previousPeriod',
      dateFrom: isoDate(prevFrom),
      dateTo: isoDate(prevTo)
    };
  }

  function comparisonLabel(period, previousPeriod) {
    if (!period || !previousPeriod) return raw('vs previous period');
    var from = parsePeriodDate(period.dateFrom);
    var to = parsePeriodDate(period.dateTo);
    if (isFullCalendarMonth(from, to)) return raw('vs previous month');
    return raw('vs previous period');
  }

  function monthMeta(snapshotMonth) {
    var parts = (snapshotMonth || '').split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var now = new Date();
    if (!year || !month || month < 1 || month > 12) {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    return {
      year: year,
      monthIndex: month - 1,
      monthNumber: month,
      label: window.dashboardI18n
        ? window.dashboardI18n.formatMonth(year, month - 1)
        : (AR_MONTHS[month - 1] + ' ' + year)
    };
  }

  function accountLabel(acc, fallback) {
    if (!acc) return fallback || dt('shell.account');
    return acc.memberName || acc.easyEmail || acc.email || acc.taagerEmail || acc.easyStore || acc.storeName || acc.label || acc.name || fallback || dt('shell.account');
  }

  function latestTimestamp(accounts, activeId) {
    var latest = 0;
    Object.keys(accounts || {}).forEach(function (id) {
      if (activeId !== ALL_ACCOUNTS && id !== activeId) return;
      var snap = accounts[id] || {};
      var ts = snap.staticUploadTimestamp || snap.autoFetchTimestamp || snap.manualFetchTimestamp || snap.botSnapshotTimestamp || 0;
      if (ts > latest) latest = ts;
    });
    return latest || null;
  }

  function numberValue(value) {
    var n = Number(value || 0);
    return isFinite(n) ? n : 0;
  }

  function dashboardEnrichmentDiagnostics(snap) {
    snap = snap || {};
    return snap.enrichmentDiagnostics ||
      (snap.lastFetchRange && snap.lastFetchRange.enrichment) ||
      (snap.lastFetchRange && snap.lastFetchRange.parseDiagnostics && snap.lastFetchRange.parseDiagnostics.enrichment) ||
      null;
  }

  function buildPrepaidMatchDiagnostics(accounts, selectedIds) {
    var ids = Array.isArray(selectedIds) && selectedIds.length ? selectedIds : Object.keys(accounts || {});
    var statusCounts = {};
    var paymentMatchSources = {};
    var diagAccounts = 0;
    var result = {
      provider: '',
      status: 'missing',
      accounts: ids.length,
      accountsWithDiagnostics: 0,
      sourceRows: 0,
      paymentRowsScanned: 0,
      paymentRows: 0,
      paymentTargets: 0,
      prepaidTargetItemRows: 0,
      prepaidTargetMatchedItemRows: 0,
      prepaidTargetMatchedRows: 0,
      prepaidTargetUnmatchedRows: 0,
      paymentMatches: 0,
      unmatchedPaymentRows: 0,
      paymentMatchConflicts: 0,
      structuredPaymentPreserved: 0,
      uniquePaymentOrderIds: 0,
      uniquePaymentPhoneSku: 0,
      paymentMatchSources: paymentMatchSources,
      statusCounts: statusCounts
    };

    ids.forEach(function (id) {
      var snap = accounts && accounts[id] || {};
      var diag = dashboardEnrichmentDiagnostics(snap);
      if (!diag) return;
      diagAccounts++;
      result.accountsWithDiagnostics++;
      if (!result.provider && diag.provider) result.provider = diag.provider;
      var status = String(diag.status || 'unknown');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      [
        'sourceRows', 'paymentRowsScanned', 'paymentRows', 'paymentTargets',
        'prepaidTargetItemRows', 'prepaidTargetMatchedItemRows',
        'prepaidTargetMatchedRows', 'prepaidTargetUnmatchedRows',
        'paymentMatches', 'unmatchedPaymentRows', 'paymentMatchConflicts',
        'structuredPaymentPreserved', 'uniquePaymentOrderIds', 'uniquePaymentPhoneSku'
      ].forEach(function (key) {
        result[key] += numberValue(diag[key]);
      });
      Object.keys(diag.paymentMatchSources || {}).forEach(function (source) {
        paymentMatchSources[source] = (paymentMatchSources[source] || 0) + numberValue(diag.paymentMatchSources[source]);
      });
    });

    if (!diagAccounts) {
      result.provider = 'none';
      result.status = 'missing';
    } else if (statusCounts.ok) {
      result.status = statusCounts.ok === diagAccounts ? 'ok' : 'partial';
    } else if (statusCounts.missing) {
      result.status = 'missing';
    } else if (statusCounts.not_enabled) {
      result.status = 'not_enabled';
    } else {
      result.status = Object.keys(statusCounts)[0] || 'unknown';
    }
    result.prepaidTargetMatchRate = result.prepaidTargetItemRows > 0
      ? result.prepaidTargetMatchedItemRows / result.prepaidTargetItemRows
      : 0;
    result.paymentTargetMatchRate = result.paymentTargets > 0
      ? result.paymentMatches / result.paymentTargets
      : 0;
    return result;
  }

  function formatTimestamp(ts) {
    if (window.dashboardI18n) return window.dashboardI18n.formatTimestamp(ts);
    if (!ts) return noUpdate();
    var d = new Date(ts);
    if (isNaN(d.getTime())) return noUpdate();
    var now = new Date();
    var hh = ('0' + d.getHours()).slice(-2);
    var mm = ('0' + d.getMinutes()).slice(-2);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
      return 'اليوم ' + hh + ':' + mm;
    }
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + ' ' + hh + ':' + mm;
  }

  function chooseSnapshotMonth(accounts, activeId) {
    var months = [];
    Object.keys(accounts || {}).forEach(function (id) {
      if (activeId !== ALL_ACCOUNTS && id !== activeId) return;
      if (accounts[id] && accounts[id].snapshotMonth) months.push(accounts[id].snapshotMonth);
    });
    months.sort();
    return months[months.length - 1] || '';
  }

  function daysBetween(a, b) {
    var start = normalizeDateKey(a);
    var end = normalizeDateKey(b);
    if (!start || !end) return null;
    var da = new Date(start + 'T00:00:00');
    var db = new Date(end + 'T00:00:00');
    if (isNaN(da.getTime()) || isNaN(db.getTime()) || db < da) return null;
    return (db - da) / (24 * 60 * 60 * 1000);
  }

  function calcDelta(nowVal, prevVal) {
    if (prevVal === 0) return nowVal > 0 ? 100 : 0;
    return parseFloat((((nowVal - prevVal) / prevVal) * 100).toFixed(1));
  }

  function convertDashboardCurrency(value, from, to, egpRate, rates) {
    var amount = Number(value || 0);
    var source = String(from || 'SAR').toUpperCase();
    var target = String(to || 'SAR').toUpperCase();
    var core = window.TaagerDashboardCurrencyCore;
    if (core && typeof core.convert === 'function') {
      return core.convert(amount, source, target, { rates: rates || undefined, egpRate: egpRate });
    }
    var egp = Number(egpRate || 52) || 52;
    if (source === target) return amount;
    var sar = amount;
    if (source === 'USD') sar = amount * 3.75;
    else if (source === 'EGP') sar = (amount / egp) * 3.75;
    if (target === 'SAR') return sar;
    if (target === 'USD') return sar / 3.75;
    if (target === 'EGP') return (sar / 3.75) * egp;
    return amount;
  }

  function dashboardMoneyValue(value) {
    if (window.TaagerStatus && typeof window.TaagerStatus.moneyValue === 'function') {
      var shared = window.TaagerStatus.moneyValue(value);
      return shared == null ? 0 : shared;
    }
    if (value == null || value === '') return 0;
    var text = String(value).trim();
    var sign = /^\s*\(.*\)\s*$/.test(text) || /-/.test(text) ? -1 : 1;
    var cleaned = text.replace(/[^\d.,-]/g, '').replace(/-/g, '');
    if (!cleaned) return 0;
    var lastDot = cleaned.lastIndexOf('.');
    var lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, '');
    } else if (lastComma > lastDot && cleaned.split(',').length === 2 && cleaned.split(',')[1].length <= 2) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
    var n = Number(cleaned);
    return isFinite(n) ? sign * n : 0;
  }

  function splitMoneyList(value) {
    return String(value == null ? '' : value)
      .split(/\r?\n|\s*,\s*|\|/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }

  function moneyListTotal(value) {
    var parts = splitMoneyList(value);
    if (!parts.length) return dashboardMoneyValue(value);
    return parts.reduce(function (sum, part) {
      return sum + dashboardMoneyValue(part);
    }, 0);
  }

  function rowTotalPrice(row) {
    if (!row) return 0;
    if (Object.prototype.hasOwnProperty.call(row, 'dashboardTotalPrice')) {
      var dashboardVal = dashboardMoneyValue(row.dashboardTotalPrice);
      if (dashboardVal > 0) return dashboardVal;
    }
    var listKeys = ['totalPriceRaw', 'priceRaw', 'pricesRaw', 'prices'];
    for (var i = 0; i < listKeys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(row, listKeys[i]) && String(row[listKeys[i]] || '').trim()) {
        var listVal = moneyListTotal(row[listKeys[i]]);
        if (listVal > 0) return listVal;
      }
    }
    var keys = ['totalPrice', 'priceNoShipping', 'subtotal', 'orderValue', 'price'];
    for (var j = 0; j < keys.length; j++) {
      if (Object.prototype.hasOwnProperty.call(row, keys[j])) {
        var n = dashboardMoneyValue(row[keys[j]]);
        if (n > 0) return n;
      }
    }
    return 0;
  }

  function rowAmountDue(row) {
    if (!row) return 0;
    var keys = ['dashboardAmountDue', 'amountDueRaw', 'amountDue', 'orderValue', 'cod', 'cashOnDelivery'];
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(row, keys[i])) {
        var n = dashboardMoneyValue(row[keys[i]]);
        if (n > 0) return n;
      }
    }
    return 0;
  }

  function rowCommissionValue(row) {
    if (row && Object.prototype.hasOwnProperty.call(row, 'dashboardCommission')) {
      return dashboardMoneyValue(row.dashboardCommission);
    }
    var orderProfit = dashboardMoneyValue(row && (row.profit != null ? row.profit : (row.orderProfit != null ? row.orderProfit : row.profitBeforeTax)));
    var taxProfit = dashboardMoneyValue(row && (row.taxProfit != null ? row.taxProfit : (row.taagerTaxProfit != null ? row.taagerTaxProfit : row.taagerFees)));
    if (orderProfit > 0 || taxProfit > 0) {
      if (orderProfit > 0 && taxProfit > orderProfit) {
        while (taxProfit > orderProfit && taxProfit >= 1) taxProfit = taxProfit / 10;
      }
      return orderProfit - taxProfit;
    }
    var directAfterTax = row && (
      row.profitAfterTax != null ? row.profitAfterTax :
      (row.taagerProfit != null ? row.taagerProfit :
      (row.profitAfterFees != null ? row.profitAfterFees : null))
    );
    if (directAfterTax != null) return dashboardMoneyValue(directAfterTax);
    if (window.TaagerStatus) return window.TaagerStatus.taagerProfit(row);
    return dashboardMoneyValue(row && (row.marketerCommission || row.commission) || 0);
  }

  function orderOnlyKey(row, fallbackIndex) {
    var accountId = String(row && (row.accountId || row.dashboardAccountId || '') || '').trim();
    var direct = String(row && (row.taagerOrderNumber || row.orderNumber || row.id || row.orderId || row.reference || '') || '').trim();
    if (direct) return accountId + '|id:' + direct;
    var phone = String(row && (row.phone || row.phone1 || row.phone2 || row.rawPhone || '') || '').trim();
    var created = normalizeDateKey(row && (row.createdAt || row.date || row.dashboardDate));
    if (phone || created) return accountId + '|sig:' + phone + '|' + created + '|' + String(row && (row.orderStatus || row.status) || '');
    return accountId + '|idx:' + fallbackIndex;
  }

  function addOnce(set, key) {
    if (!key || set[key]) return false;
    set[key] = true;
    return true;
  }

  function financialLineKey(row, fallbackIndex) {
    var orderKey = orderOnlyKey(row, fallbackIndex);
    var itemIndex = row && (row.orderItemIndex != null ? row.orderItemIndex : row.itemIndex);
    if (itemIndex != null && itemIndex !== '') return orderKey + '|item:' + String(itemIndex);
    return [
      orderKey,
      String(row && (row.sku || row.skuNumber || '') || '').trim().toLowerCase(),
      String(row && (row.products || row.productName || row.product || '') || '').trim().toLowerCase(),
      String(row && (row.qty || row.quantity || 1) || 1),
      String(rowTotalPrice(row)),
      String(rowCommissionValue(row))
    ].join('|line:');
  }

  function orderLevelRows(rows, includeCanceled) {
    var map = {};
    var lineSeen = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row, idx) {
      var key = row.__dashboardOrderKey || orderOnlyKey(row, idx);
      var bucket = row.__dashboardExactBucket || exactStatusBucket(row);
      if (!includeCanceled && isCanceledByYouBucket(bucket)) return;
      var lineKey = row.__dashboardFinancialLineKey || financialLineKey(row, idx);
      if (lineSeen[lineKey]) return;
      lineSeen[lineKey] = true;
      if (!map[key]) {
        map[key] = Object.assign({}, row, {
          dashboardTotalPrice: 0,
          exactStatusBucket: bucket,
          itemCount: 0,
          itemSkus: [],
          itemProducts: []
        });
      }
      map[key].dashboardTotalPrice += row.dashboardTotalPrice != null ? Number(row.dashboardTotalPrice) || 0 : rowTotalPrice(row);
      map[key].totalPrice = map[key].dashboardTotalPrice;
      map[key].dashboardAmountDue = row.dashboardAmountDue != null ? Number(row.dashboardAmountDue) || 0 : rowAmountDue(row);
      map[key].itemCount += 1;
      if (row && row.sku) map[key].itemSkus.push(row.sku);
      if (row && (row.products || row.productName)) map[key].itemProducts.push(row.products || row.productName);
    });
    return Object.keys(map).map(function (key) {
      var row = map[key];
      if (row.itemSkus.length) row.sku = row.itemSkus.join(', ');
      if (row.itemProducts.length) row.products = row.itemProducts.join(', ');
      delete row.__dashboardOrderKey;
      delete row.__dashboardFinancialLineKey;
      delete row.__dashboardExactBucket;
      delete row.__dashboardInCreatedPeriod;
      return row;
    });
  }

  function overviewMetricSummary(rows, period, mode) {
    rows = orderLevelRows(Array.isArray(rows) ? rows : [], true);
    var totalPriceLookup = buildTotalPriceLookup(rows);
    var summary = {
      earnedCommission: 0,
      incomingCommission: 0,
      lostCommission: 0,
      rawTotalOrders: 0,
      canceledByYouCount: 0,
      totalOrders: 0,
      totalSales: 0,
      totalDeliveredSales: 0,
      overallAov: 0,
      deliveredAov: 0,
      deliveredCount: 0,
      confirmedCount: 0,
      confirmationRate: 0,
      drPct: 0
    };

    var totalPlacedCommission = 0;
    var ndrBase = 0;
    var ndrDelivered = 0;

    rows.forEach(function (row) {
      var inCreatedPeriod = isRowCreatedInPeriod(row, period);
      var exactBucket = exactStatusBucket(row);
      var netEligible = !isNdrCanceledBucket(exactBucket);
      var isDeliveredInPeriod = isDeliveredRowInPeriod(row, period, mode || 'actual');
      var commissionVal = rowCommissionValue(row);
      var priceVal = rowTotalPrice(row);

      var ndrPeriodForRow = mode === 'expected' ? activeNdrPeriod(mode) : period;
      var inNdrCohortPeriod = isRowCreatedInPeriod(row, ndrPeriodForRow);
      var inSelectedNdrBase = netEligible && inNdrCohortPeriod;
      var isDeliveredInNdrCohort = exactBucket === 'delivered' && inNdrCohortPeriod;

      if (inSelectedNdrBase) ndrBase++;
      if (isDeliveredInNdrCohort && netEligible) ndrDelivered++;

      if ((inCreatedPeriod || isDeliveredInPeriod) && hasMissingTotalPrice(row)) {
        var priceLookupInfo = totalPriceLookup[amountLookupKey(row)];
        priceVal = priceLookupInfo && priceLookupInfo.amount > 0 ? priceLookupInfo.amount : 0;
      }

      if (inCreatedPeriod) {
        summary.rawTotalOrders++;
        if (!netEligible) summary.canceledByYouCount++;
      }

      if (inCreatedPeriod && netEligible) {
        summary.totalOrders++;
        summary.totalSales += priceVal;
        totalPlacedCommission += commissionVal;
        if (!isConfirmedBaseExcludedBucket(exactBucket)) summary.confirmedCount++;
      }

      if (isDeliveredInPeriod && netEligible) {
        summary.deliveredCount++;
        summary.totalDeliveredSales += priceVal;
        summary.earnedCommission += commissionVal;
      } else if (inCreatedPeriod && netEligible && isLostBucket(exactBucket)) {
        summary.lostCommission += commissionVal;
      } else if (inCreatedPeriod && netEligible && isIncomingBucket(exactBucket)) {
        summary.incomingCommission += commissionVal;
      }
    });

    if (mode === 'expected') {
      var expectedNdrRate = ndrBase > 0 ? (ndrDelivered / ndrBase) : 0;
      var expectedSummary = dashboardFinancials({
        mode: 'expected',
        netOrders: summary.totalOrders,
        actualDeliveredOrders: summary.deliveredCount,
        actualEarnedProfitAfterTax: summary.earnedCommission,
        netOrderProfitAfterTax: summary.deliveredCount > 0 ? totalPlacedCommission : null,
        actualDeliveredSales: summary.totalDeliveredSales,
        currentTotalSales: summary.totalSales,
        expectedNdrRate: expectedNdrRate,
        adSpend: 0
      });
      summary.actualDeliveredCount = summary.deliveredCount;
      summary.actualEarnedCommission = summary.earnedCommission;
      summary.actualTotalDeliveredSales = summary.totalDeliveredSales;
      summary.expectedDeliveriesExact = expectedSummary.expectedDeliveriesExact;
      summary.deliveredCount = expectedSummary.expectedDeliveriesDisplay;
      summary.earnedCommission = expectedSummary.expectedTotalProfitBeforeAdSpend;
      summary.totalDeliveredSales = expectedSummary.expectedDeliveredSales;
    }

    summary.overallAov = summary.totalOrders > 0
      ? parseFloat((summary.totalSales / summary.totalOrders).toFixed(2))
      : 0;
    summary.deliveredAov = summary.deliveredCount > 0
      ? parseFloat((summary.totalDeliveredSales / summary.deliveredCount).toFixed(2))
      : 0;
    summary.confirmationRate = summary.totalOrders > 0
      ? parseFloat(((summary.confirmedCount / summary.totalOrders) * 100).toFixed(1))
      : 0;
    summary.drPct = summary.confirmedCount > 0
      ? parseFloat(((summary.deliveredCount / summary.confirmedCount) * 100).toFixed(1))
      : 0;
    return summary;
  }

  function orderSourceRawValue(row) {
    var value = row && (
      row.orderSource != null ? row.orderSource :
      (row.rawOrderSource != null ? row.rawOrderSource :
      (row.receivedBy != null ? row.receivedBy :
      (row.orderReceivedBy != null ? row.orderReceivedBy : '')))
    );
    return String(value == null ? '' : value).trim();
  }

  function platformSourceRawValue(row) {
    if (!row || !row.easyOrdersPlatformMatched) return null;
    var value = row.easyOrdersPlatformSource != null ? row.easyOrdersPlatformSource : row.easyOrdersUtmSource;
    return String(value == null ? '' : value).trim();
  }

  function orderSourceDisplayValue(rawValue, fallback) {
    rawValue = String(rawValue == null ? '' : rawValue).trim();
    if (rawValue) return rawValue;
    if (fallback) return fallback;
    return window.dashboardI18n && window.dashboardI18n.isRtl && window.dashboardI18n.isRtl()
      ? '\u0645\u0635\u062f\u0631 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641'
      : 'Unknown source';
  }

  function emptyOrderSourceBucket(rawValue, options) {
    options = options || {};
    return {
      key: rawValue || '__unknown__',
      rawSource: rawValue,
      label: orderSourceDisplayValue(rawValue, options.unknownLabel),
      rawOrders: 0,
      canceledByYou: 0,
      netOrders: 0,
      delivered: 0,
      confirmed: 0,
      cancel: 0,
      pending: 0,
      shipping: 0,
      failed: 0,
      confirmationCount: 0,
      confirmationRate: 0,
      dr: 0,
      ndr: 0,
      deliveredProfit: 0,
      deliveredSales: 0,
      deliveredAov: 0,
      avgProfit: 0,
      isLowSample: true,
      topProducts: [],
      topCities: [],
      _sets: {},
      _products: {},
      _cities: {}
    };
  }

  function buildOrderSourceBreakdown(rows, meta, minSample, options) {
    rows = Array.isArray(rows) ? rows : [];
    meta = meta || {};
    options = options || {};
    minSample = minSample || 30;
    var period = meta.period || activePeriod();
    var mode = meta.deliveredDateMode || 'actual';
    var ndrPeriod = mode === 'expected' ? (meta.ndrPeriod || activeNdrPeriod(mode) || period) : period;
    var buckets = {};
    var sourceOrderSet = {};

    function bucketFor(rawSource) {
      rawSource = String(rawSource || '').trim();
      var key = rawSource || '__unknown__';
      if (!buckets[key]) buckets[key] = emptyOrderSourceBucket(rawSource, options);
      return buckets[key];
    }

    function addMetricOnce(bucket, metric, key, fn) {
      if (!bucket._sets[metric]) bucket._sets[metric] = {};
      if (!addOnce(bucket._sets[metric], key)) return false;
      if (typeof fn === 'function') fn();
      return true;
    }

    rows.forEach(function (row, rowIndex) {
      if (!row) return;
      var rawSource = typeof options.sourceValue === 'function' ? options.sourceValue(row) : orderSourceRawValue(row);
      if (rawSource == null && options.skipMissing) return;
      var bucket = bucketFor(rawSource);
      var orderKey = row.__dashboardOrderKey || orderOnlyKey(row, rowIndex);
      var lineKey = row.__dashboardFinancialLineKey || financialLineKey(row, rowIndex);
      var exactBucket = row.__dashboardExactBucket || exactStatusBucket(row);
      var rowIsCanceledByYou = isCanceledByYouBucket(exactBucket);
      var rowIsNetOrder = !rowIsCanceledByYou;
      var inCreatedPeriod = row.__dashboardInCreatedPeriod != null
        ? !!row.__dashboardInCreatedPeriod
        : isRowCreatedInPeriod(row, period);
      var inNdrCohortPeriod = isRowCreatedInPeriod(row, ndrPeriod);
      var ndrEligible = window.TaagerStatus
        ? window.TaagerStatus.isEligibleForNdr(row.orderStatus || row.status)
        : !isNdrCanceledBucket(exactBucket);
      var statusGroup = productStatusGroup(exactBucket);
      var sourceOrderKey = bucket.key + ':' + orderKey;
      var sourceLineKey = bucket.key + ':' + lineKey;

      if (inCreatedPeriod) {
        addMetricOnce(bucket, 'raw', sourceOrderKey, function () { bucket.rawOrders++; });
        if (rowIsCanceledByYou) addMetricOnce(bucket, 'canceledByYou', sourceOrderKey, function () { bucket.canceledByYou++; });
        if (rowIsNetOrder) {
          addMetricOnce(bucket, 'net', sourceOrderKey, function () { bucket.netOrders++; });
          if (statusGroup === 'confirmation') addMetricOnce(bucket, 'confirmation', sourceOrderKey, function () { bucket.confirmationCount++; });
          else if (statusGroup === 'cancel') addMetricOnce(bucket, 'cancel', sourceOrderKey, function () { bucket.cancel++; });
          else if (exactBucket === 'received' || exactBucket === 'pending') addMetricOnce(bucket, 'pending', sourceOrderKey, function () { bucket.pending++; });
          if (exactBucket === 'confirmed') addMetricOnce(bucket, 'confirmed', sourceOrderKey, function () { bucket.confirmed++; });
          if (exactBucket === 'shipping' || exactBucket === 'delivery_suspended' || exactBucket === 'after_sales_progress') {
            addMetricOnce(bucket, 'shipping', sourceOrderKey, function () { bucket.shipping++; });
          }
          if (isLostBucket(exactBucket)) addMetricOnce(bucket, 'failed', sourceOrderKey, function () { bucket.failed++; });

          var cityName = String(row.city || '').trim();
          if (cityName) {
            if (!bucket._cities[cityName]) bucket._cities[cityName] = { name: cityName, orders: 0, delivered: 0, _sets: {} };
            var city = bucket._cities[cityName];
            if (!city._sets.orders) city._sets.orders = {};
            if (addOnce(city._sets.orders, sourceOrderKey)) city.orders++;
          }
          var productName = window.TaagerStatus ? window.TaagerStatus.productName(row) : (row.products || row.productName || row.product || row.sku || '');
          productName = String(productName || '').trim();
          if (productName) {
            if (!bucket._products[productName]) bucket._products[productName] = { name: productName, orders: 0, delivered: 0, _sets: {} };
            var product = bucket._products[productName];
            if (!product._sets.orders) product._sets.orders = {};
            if (addOnce(product._sets.orders, sourceOrderKey)) product.orders++;
          }
        }
      }

      if (ndrEligible && inNdrCohortPeriod && rowIsNetOrder) {
        if (exactBucket === 'delivered') {
          addMetricOnce(bucket, 'delivered', sourceOrderKey, function () { bucket.delivered++; });
          if (sourceOrderSet[sourceOrderKey] == null) sourceOrderSet[sourceOrderKey] = bucket.key;
        }
      }

      if (isDeliveredRowInPeriod(row, period, mode) && rowIsNetOrder) {
        addMetricOnce(bucket, 'deliveredProfit', sourceOrderKey, function () {
          bucket.deliveredProfit += rowCommissionValue(row);
        });
        addMetricOnce(bucket, 'deliveredSales', sourceLineKey, function () {
          bucket.deliveredSales += row.dashboardTotalPrice != null ? Number(row.dashboardTotalPrice) || 0 : rowTotalPrice(row);
        });
        var deliveredCityName = String(row.city || '').trim();
        if (deliveredCityName && bucket._cities[deliveredCityName]) {
          var deliveredCity = bucket._cities[deliveredCityName];
          if (!deliveredCity._sets.delivered) deliveredCity._sets.delivered = {};
          if (addOnce(deliveredCity._sets.delivered, sourceOrderKey)) deliveredCity.delivered++;
        }
        var deliveredProductName = window.TaagerStatus ? window.TaagerStatus.productName(row) : (row.products || row.productName || row.product || row.sku || '');
        deliveredProductName = String(deliveredProductName || '').trim();
        if (deliveredProductName && bucket._products[deliveredProductName]) {
          var deliveredProduct = bucket._products[deliveredProductName];
          if (!deliveredProduct._sets.delivered) deliveredProduct._sets.delivered = {};
          if (addOnce(deliveredProduct._sets.delivered, sourceOrderKey)) deliveredProduct.delivered++;
        }
      }
    });

    var sources = Object.keys(buckets).map(function (key) {
      var bucket = buckets[key];
      bucket.ndr = bucket.netOrders > 0 ? parseFloat(((bucket.delivered / bucket.netOrders) * 100).toFixed(2)) : 0;
      bucket.confirmationRate = bucket.netOrders > 0 ? parseFloat(((bucket.confirmationCount / bucket.netOrders) * 100).toFixed(1)) : 0;
      bucket.dr = bucket.confirmationCount > 0 ? parseFloat(((bucket.delivered / bucket.confirmationCount) * 100).toFixed(1)) : 0;
      bucket.deliveredSales = roundMoney(bucket.deliveredSales);
      bucket.deliveredProfit = roundMoney(bucket.deliveredProfit);
      bucket.deliveredAov = bucket.delivered > 0 ? roundMoney(bucket.deliveredSales / bucket.delivered) : 0;
      bucket.avgProfit = bucket.delivered > 0 ? roundMoney(bucket.deliveredProfit / bucket.delivered) : 0;
      bucket.isLowSample = bucket.netOrders < minSample;
      bucket.topProducts = Object.keys(bucket._products).map(function (name) {
        var item = bucket._products[name];
        return { name: item.name, orders: item.orders, delivered: item.delivered };
      }).sort(function (a, b) { return b.orders - a.orders || b.delivered - a.delivered; }).slice(0, 5);
      bucket.topCities = Object.keys(bucket._cities).map(function (name) {
        var item = bucket._cities[name];
        return { name: item.name, orders: item.orders, delivered: item.delivered };
      }).sort(function (a, b) { return b.orders - a.orders || b.delivered - a.delivered; }).slice(0, 5);
      delete bucket._sets;
      delete bucket._products;
      delete bucket._cities;
      return bucket;
    }).sort(function (a, b) {
      return b.netOrders - a.netOrders || b.delivered - a.delivered || b.ndr - a.ndr;
    });

    var summary = sources.reduce(function (acc, item) {
      acc.rawOrders += item.rawOrders;
      acc.canceledByYou += item.canceledByYou;
      acc.netOrders += item.netOrders;
      acc.confirmedOrders += item.confirmationCount;
      acc.cancel += item.cancel;
      acc.delivered += item.delivered;
      acc.deliveredProfit += item.deliveredProfit;
      acc.deliveredSales += item.deliveredSales;
      return acc;
    }, { sourceCount: sources.length, rawOrders: 0, canceledByYou: 0, netOrders: 0, confirmedOrders: 0, cancel: 0, delivered: 0, deliveredProfit: 0, deliveredSales: 0 });
    summary.ndr = summary.netOrders > 0 ? parseFloat(((summary.delivered / summary.netOrders) * 100).toFixed(2)) : 0;
    summary.confirmationRate = summary.netOrders > 0 ? parseFloat(((summary.confirmedOrders / summary.netOrders) * 100).toFixed(1)) : 0;
    summary.dr = summary.confirmedOrders > 0 ? parseFloat(((summary.delivered / summary.confirmedOrders) * 100).toFixed(1)) : 0;
    summary.deliveredProfit = roundMoney(summary.deliveredProfit);
    summary.deliveredSales = roundMoney(summary.deliveredSales);
    summary.deliveredAov = summary.delivered > 0 ? roundMoney(summary.deliveredSales / summary.delivered) : 0;
    summary.avgProfit = summary.delivered > 0 ? roundMoney(summary.deliveredProfit / summary.delivered) : 0;

    var reliableSources = sources.filter(function (item) { return item.netOrders >= minSample; })
      .slice().sort(function (a, b) { return b.ndr - a.ndr || b.netOrders - a.netOrders; });
    return {
      type: options.type || 'orderSource',
      minSample: minSample,
      summary: summary,
      sources: sources,
      bestReliableSource: reliableSources[0] || null,
      reliableSources: reliableSources
    };
  }

  function percentOf(part, total) {
    return total > 0 ? parseFloat(((part / total) * 100).toFixed(2)) : 0;
  }

  function netDeliveryRate(delivered, total) {
    total = Number(total || 0);
    return total > 0 ? Number(delivered || 0) / total : 0;
  }

  function netDeliveryRatePct(delivered, total) {
    return parseFloat((netDeliveryRate(delivered, total) * 100).toFixed(1));
  }

  function boundedProductRatePct(delivered, total, context) {
    delivered = Number(delivered || 0);
    total = Number(total || 0);
    if (total <= 0) return 0;
    if (delivered < 0 || delivered > total) {
      console.warn('[DashboardRateIntegrity] Invalid product rate counts', {
        context: context || 'unknown',
        delivered: delivered,
        base: total
      });
    }
    return parseFloat((Math.max(0, Math.min(1, delivered / total)) * 100).toFixed(1));
  }

  function boundedExpectedDeliveries(netOrders, ndrRate, context) {
    var net = Math.max(0, Math.round(Number(netOrders || 0)));
    var rate = Math.max(0, Math.min(1, Number(ndrRate || 0)));
    var projected = Math.round(net * rate);
    if (projected > net) {
      console.warn('[DashboardRateIntegrity] Expected deliveries exceed net orders', {
        context: context || 'unknown',
        projected: projected,
        netOrders: net,
        ndrRate: rate
      });
    }
    return Math.min(net, Math.max(0, projected));
  }

  function formatPct(part, total) {
    var pct = percentOf(part, total);
    if (pct > 0 && pct < 0.1) return '<0.1%';
    return (pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)) + '%';
  }

  function roundMoney(value) {
    var n = Number(value || 0);
    return isFinite(n) ? parseFloat(n.toFixed(2)) : 0;
  }

  function dashboardFinancials(input) {
    var core = window.TaagerDashboardFinancialCore;
    if (core && typeof core.calculate === 'function') return core.calculate(input);
    input = input || {};
    var netOrders = Math.max(0, Number(input.netOrders) || 0);
    var actualDelivered = Math.max(0, Number(input.actualDeliveredOrders) || 0);
    var actualProfit = Number(input.actualEarnedProfitAfterTax) || 0;
    var netOrderProfit = Number(input.netOrderProfitAfterTax) || 0;
    var hasNetOrderProfit = input.netOrderProfitAfterTax != null;
    var totalSales = Math.max(0, Number(input.currentTotalSales) || 0);
    var ndr = Math.max(0, Math.min(1, Number(input.expectedNdrRate) || 0));
    var spend = Math.max(0, Number(input.adSpend) || 0);
    var averageProfitSource = actualDelivered > 0 ? 'delivered_orders' : (netOrders > 0 && hasNetOrderProfit ? 'net_orders_fallback' : 'unavailable');
    var averageProfit = actualDelivered > 0 ? actualProfit / actualDelivered : (averageProfitSource === 'net_orders_fallback' ? netOrderProfit / netOrders : 0);
    var exact = netOrders * ndr;
    var profit = exact * averageProfit;
    var sales = totalSales * ndr;
    return {
      averageProfit: averageProfit,
      averageProfitSource: averageProfitSource,
      cpa: netOrders > 0 ? spend / netOrders : 0,
      breakEvenCpa: averageProfit * ndr,
      expectedDeliveriesExact: exact,
      expectedDeliveriesDisplay: Math.round(exact),
      expectedTotalProfitBeforeAdSpend: profit,
      expectedNetProfit: profit - spend,
      expectedDeliveredSales: sales,
      expectedDeliveredCpa: exact > 0 ? spend / exact : 0,
      expectedRoi: spend > 0 ? ((profit - spend) / spend) * 100 : 0,
      expectedProfitRoas: spend > 0 ? profit / spend : 0,
      expectedSalesRoas: spend > 0 ? sales / spend : 0
    };
  }

  function isCodActiveBucket(bucket) {
    return isIncomingBucket(bucket);
  }

  function exactStatusInfo(bucket) {
    if (window.TaagerStatus && typeof window.TaagerStatus.statusInfo === 'function') {
      return window.TaagerStatus.statusInfo(bucket);
    }
    return {
      bucket: bucket || 'other',
      id: bucket || 'other',
      order: 999,
      businessGroup: bucket === 'delivered' ? 'earned' : (isCanceledByYouBucket(bucket) ? 'excluded' : (isLostBucket(bucket) ? 'lost' : (isIncomingBucket(bucket) ? 'incoming' : 'other'))),
      color: '#8892a4'
    };
  }

  function orderedStatusFlow() {
    if (window.TaagerStatus && Array.isArray(window.TaagerStatus.ordered)) {
      return window.TaagerStatus.ordered.slice();
    }
    return [
      { bucket: 'received', order: 10, businessGroup: 'incoming', color: '#3b82f6' },
      { bucket: 'confirmed', order: 20, businessGroup: 'incoming', color: '#3b82f6' },
      { bucket: 'waiting', order: 30, businessGroup: 'incoming', color: '#64748b' },
      { bucket: 'shipping', order: 40, businessGroup: 'incoming', color: '#14b8a6' },
      { bucket: 'delivery_suspended', order: 50, businessGroup: 'incoming', color: '#f59e0b' },
      { bucket: 'after_sales_progress', order: 60, businessGroup: 'incoming', color: '#06b6d4' },
      { bucket: 'delivered', order: 70, businessGroup: 'earned', color: '#00e676' },
      { bucket: 'customer_refused_confirmation', order: 80, businessGroup: 'lost', color: '#f97316' },
      { bucket: 'failed', order: 90, businessGroup: 'lost', color: '#ef4444' },
      { bucket: 'return_verified', order: 100, businessGroup: 'lost', color: '#a855f7' },
      { bucket: 'out_of_stock', order: 110, businessGroup: 'lost', color: '#eab308' },
      { bucket: 'on_hold', order: 120, businessGroup: 'incoming', color: '#64748b' },
      { bucket: 'after_sales_done', order: 130, businessGroup: 'lost', color: '#8b5cf6' },
      { bucket: 'canceled_by_you', order: 140, businessGroup: 'excluded', color: '#94a3b8' }
    ];
  }

  function exactStatusBucket(row) {
    var status = row && (row.orderStatus || row.status || row.orderStatusBucket);
    if (window.TaagerStatus) return window.TaagerStatus.normalize(status).bucket;
    return getStatusBucket(status);
  }

  function isFailedOutcomeBucket(bucket) {
    return bucket === 'failed' ||
      bucket === 'return_verified' ||
      bucket === 'customer_refused_confirmation';
  }

  function isCanceledByYouBucket(bucket) {
    return bucket === 'canceled_by_you';
  }

  function isNdrCanceledBucket(bucket) {
    return bucket === 'canceled_by_you';
  }

  function isIncomingBucket(bucket) {
    if (window.TaagerStatus && typeof window.TaagerStatus.statusInfo === 'function') {
      return window.TaagerStatus.statusInfo(bucket).businessGroup === 'incoming';
    }
    return bucket === 'received' ||
      bucket === 'shipping' ||
      bucket === 'delivery_suspended' ||
      bucket === 'confirmed' ||
      bucket === 'waiting' ||
      bucket === 'on_hold' ||
      bucket === 'after_sales_progress';
  }

  function isLostBucket(bucket) {
    if (window.TaagerStatus && typeof window.TaagerStatus.statusInfo === 'function') {
      return window.TaagerStatus.statusInfo(bucket).businessGroup === 'lost';
    }
    return bucket === 'failed' ||
      bucket === 'return_verified' ||
      bucket === 'customer_refused_confirmation' ||
      bucket === 'out_of_stock' ||
      bucket === 'after_sales_done';
  }

  function isConfirmedBaseExcludedBucket(bucket) {
    if (window.TaagerStatus && typeof window.TaagerStatus.isConfirmed === 'function') {
      return !window.TaagerStatus.isConfirmed(bucket);
    }
    return !PRODUCT_CONFIRMATION_BUCKETS[bucket];
  }

  var PRODUCT_CONFIRMATION_BUCKETS = {
    confirmed: true,
    waiting: true,
    shipping: true,
    delivery_suspended: true,
    after_sales_progress: true,
    processing: true,
    delivered: true,
    failed: true,
    return_verified: true,
    after_sales_done: true
  };
  // canceled_by_you is NOT in PRODUCT_CANCEL_BUCKETS - it is excluded from the
  // net-orders denominator entirely. Rates (confirmation/cancel/pending) are
  // computed over net orders = all orders minus canceled_by_you.
  var PRODUCT_CANCEL_BUCKETS = {
    customer_refused_confirmation: true,
    on_hold: true,
    out_of_stock: true
  };

  function productStatusGroup(bucket) {
    if (window.TaagerStatus && typeof window.TaagerStatus.statusGroup === 'function') {
      return window.TaagerStatus.statusGroup(bucket);
    }
    if (bucket === 'canceled_by_you') return 'excluded';
    if (PRODUCT_CONFIRMATION_BUCKETS[bucket]) return 'confirmation';
    if (PRODUCT_CANCEL_BUCKETS[bucket]) return 'cancel';
    return 'pending';
  }

  // productStatusPercentages: computes confirmation/cancel/pending rates.
  // totalCount should be NET orders (all orders minus canceled_by_you).
  // confirmationCount + cancelCount + pendingCount should sum to totalCount.
  function productStatusPercentages(confirmationCount, cancelCount, pendingCount, totalCount) {
    var total = Number(totalCount || 0);
    var confirmation = Number(confirmationCount || 0);
    var cancel = Number(cancelCount || 0);
    var pending = Number(pendingCount || 0);
    if (total <= 0) {
      total = confirmation + cancel + pending;
    }
    if (total <= 0) {
      return { confirmationPct: 0, cancelPct: 0, pendingPct: 0 };
    }
    var confirmationPct = parseFloat((confirmation / total * 100).toFixed(1));
    var cancelPct = parseFloat((cancel / total * 100).toFixed(1));
    var countsCoverTotal = Math.abs((confirmation + cancel + pending) - total) < 0.0001;
    var pendingPct = countsCoverTotal
      ? parseFloat((100 - confirmationPct - cancelPct).toFixed(1))
      : parseFloat((pending / total * 100).toFixed(1));
    return {
      confirmationPct: confirmationPct,
      cancelPct: cancelPct,
      pendingPct: Math.max(0, pendingPct)
    };
  }

  function normalizedQty(row) {
    var qty = Number(row && row.qty);
    return qty > 0 ? String(qty) : '1';
  }

  function amountLookupKey(row) {
    var sku = (row && row.sku != null ? row.sku : '').toString().trim();
    if (!sku) return '';
    var country = String(row && (row.taagerCountry || row.country) || 'sa').trim().toLowerCase();
    var currency = String(row && (row.nativeCurrency || row.currency) || (window.TaagerCountry && window.TaagerCountry.currency ? window.TaagerCountry.currency(country) : 'SAR')).trim().toUpperCase();
    return country + '|' + currency + '|' + sku + '|' + normalizedQty(row);
  }

  function hasMissingAmountDue(row) {
    if (row && Object.prototype.hasOwnProperty.call(row, 'amountDueMissing')) {
      return !!row.amountDueMissing;
    }
    if (row && Object.prototype.hasOwnProperty.call(row, 'amountDueRaw')) {
      return !String(row.amountDueRaw || '').trim();
    }
    return rowAmountDue(row) <= 0;
  }

  function hasMissingTotalPrice(row) {
    return rowTotalPrice(row) <= 0;
  }


  // T-01: resolveProvince(cityName)
  // Maps a city name string to one of 11 province IDs.
  // Extracted from section-cities.js coordMap - exact keys preserved.
  var _PROVINCE_MAP = [
    { id: 'riyadh',  keys: ['الرياض', 'الخرج', 'المجمعة', 'الدوادمي', 'riyadh'] },
    { id: 'eastern', keys: ['الشرقية', 'الدمام', 'الخبر', 'الأحساء', 'eastern'] },
    { id: 'mecca',   keys: ['مكة', 'جدة', 'الطائف', 'الغربية', 'mecca'] },
    { id: 'jazan',   keys: ['جيزان', 'جازان', 'jazan', 'gizan'] },
    { id: 'baha',    keys: ['الباحة', 'baha'] },
    { id: 'madinah', keys: ['المدينة', 'ينبع', 'madinah'] },
    { id: 'aseer',   keys: ['عسير', 'أبها', 'خميس', 'aseer'] },
    { id: 'qassim',  keys: ['القصيم', 'بريدة', 'عنيزة', 'qassim'] },
    { id: 'tabuk',    keys: ['تبوك', 'tabuk'] },
    { id: 'hail',     keys: ['حائل', 'hail'] },
    { id: 'najran',   keys: ['نجران', 'najran'] },
    { id: 'jawf',     keys: ['الجوف', 'سكاكا', 'jawf', 'jouf'] },
    { id: 'northern', keys: ['الحدود الشمالية', 'عرعر', 'northern', 'arar'] }
    // 'other' is the fallback - no keys needed
  ];

  function resolveProvince(cityName, country) {
    if (window.TaagerGeo && typeof window.TaagerGeo.resolveProvince === 'function') {
      return window.TaagerGeo.resolveProvince(cityName, country || 'sa');
    }
    if (!cityName) return 'other';
    var lower = String(cityName).toLowerCase();
    for (var i = 0; i < _PROVINCE_MAP.length; i++) {
      var prov = _PROVINCE_MAP[i];
      for (var j = 0; j < prov.keys.length; j++) {
        if (lower.indexOf(prov.keys[j]) !== -1) return prov.id;
      }
    }
    return 'other';
  }

  function effectiveCountry(country, meta, fallback) {
    var value = String(country || '').trim().toLowerCase();
    if (value && value !== 'mixed') return value;
    var active = String(meta && meta.activeCountry || '').trim().toLowerCase();
    if (active && active !== 'mixed') return active;
    return fallback || 'sa';
  }
  // ---------------------------------------------------------------------------

  // T-05: isRowPrepaid(row)
  // Determines if an order row is a prepaid (non-COD) order.
  // Defaults to false (COD) - accurate for Saudi COD-heavy market.
  var _PREPAID_METHODS = ['prepaid', 'online', 'card', 'visa', 'mada', 'apple pay', 'applepay', 'stc pay', 'stcpay', 'tabby', 'tabi', 'tamara', 'paymob', 'network', 'taager'];
  function normalizePaymentText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectPrepaidMethod(value) {
    var text = normalizePaymentText(value);
    if (!text) return '';
    if (/tabby|tabi|تابي/.test(text)) return 'tabby';
    if (/tamara|تمارا/.test(text)) return 'tamara';
    if (/pay\s*mob|paymob|باي\s*موب/.test(text)) return 'paymob';
    if (/شبكه|network/.test(text)) return 'network';
    if (/mada|مدي|مدى|visa|فيزا|card|كارت|بطاق/.test(text)) return 'card';
    if (/apple\s*pay|stc\s*pay|online|اونلاين|الكتروني|الكترونى|إلكتروني/.test(text)) return 'online';
    return '';
  }
  var _COD_METHODS     = ['cod', 'cash', 'الدفع عند الاستلام', 'كاش'];

  function classifyRowPayment(row) {
    if (!row) return { classification: 'unknown', source: '', effectiveCod: true };
    var stored = String(row.paymentClassification || '').trim().toLowerCase();
    if (stored === 'prepaid' || stored === 'cod' || stored === 'unknown') {
      return {
        classification: stored,
        source: row.paymentEvidenceSource || row.paymentMethodSource || '',
        effectiveCod: stored !== 'prepaid'
      };
    }
    if (typeof row.isPrepaid === 'boolean' && (row.paymentEvidenceSource || row.paymentMethodSource || row.paymentSource)) {
      return {
        classification: row.isPrepaid ? 'prepaid' : 'cod',
        source: row.paymentEvidenceSource || row.paymentMethodSource || row.paymentSource,
        effectiveCod: !row.isPrepaid
      };
    }
    if (row.paymentMethod) {
      var pm = String(row.paymentMethod).toLowerCase().trim();
      for (var i = 0; i < _PREPAID_METHODS.length; i++) {
        if (pm.indexOf(_PREPAID_METHODS[i]) !== -1) {
          return { classification: 'prepaid', source: row.paymentMethodSource || 'structured-payment', effectiveCod: false };
        }
      }
      for (var j = 0; j < _COD_METHODS.length; j++) {
        if (pm.indexOf(_COD_METHODS[j]) !== -1) {
          return { classification: 'cod', source: row.paymentMethodSource || 'structured-payment', effectiveCod: true };
        }
      }
      if (detectPrepaidMethod(row.paymentMethod)) {
        return { classification: 'prepaid', source: row.paymentMethodSource || 'structured-payment', effectiveCod: false };
      }
    }
    return { classification: 'unknown', source: '', effectiveCod: true };
  }

  function isRowPrepaid(row) {
    return classifyRowPayment(row).classification === 'prepaid';
  }

  function reportingCurrencyPreference() {
    var stored = '';
    try { stored = localStorage.getItem('taager_dashboard_reporting_currency') || ''; } catch (_) {}
    if (window.TaagerCurrency && window.TaagerCurrency.cleanCurrency) {
      return window.TaagerCurrency.cleanCurrency(stored || 'SAR', 'SAR');
    }
    return ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'].indexOf(String(stored).toUpperCase()) !== -1 ? String(stored).toUpperCase() : 'SAR';
  }

  function currencySnapshot() {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.snapshot === 'function') return window.TaagerCurrency.snapshot();
    return {
      rates: window.TaagerCurrency && window.TaagerCurrency.rates ? window.TaagerCurrency.rates() : {},
      source: 'defaults',
      updatedAt: ''
    };
  }

  function prepareReportingRows(rows, meta) {
    var target = meta.reportingCurrency || meta.activeCurrency || 'SAR';
    var rates = meta.exchangeRates || {};
    (rows || []).forEach(function (row) {
      var country = effectiveCountry(row.taagerCountry || row.country, meta, 'sa');
      var nativeCurrency = window.TaagerCountry && window.TaagerCountry.currency ? window.TaagerCountry.currency(country) : 'SAR';
      var nativeTotalPrice = rowTotalPrice(row);
      var nativeAmountDue = rowAmountDue(row);
      var nativeCommission = rowCommissionValue(row);
      var payment = classifyRowPayment(row);
      row.taagerCountry = country;
      row.country = row.country || country;
      row.nativeCurrency = nativeCurrency;
      row.reportingCurrency = target;
      row.nativeTotalPrice = nativeTotalPrice;
      row.nativeAmountDue = nativeAmountDue;
      row.nativeCommission = nativeCommission;
      row.dashboardTotalPrice = convertDashboardCurrency(nativeTotalPrice, nativeCurrency, target, null, rates);
      row.dashboardAmountDue = convertDashboardCurrency(nativeAmountDue, nativeCurrency, target, null, rates);
      row.dashboardCommission = convertDashboardCurrency(nativeCommission, nativeCurrency, target, null, rates);
      row.paymentClassification = payment.classification;
      row.paymentEvidenceSource = payment.source;
      row.effectivePaymentClassification = payment.effectiveCod ? 'cod' : 'prepaid';
      row.isEffectiveCod = payment.effectiveCod;
      row.isPrepaid = payment.classification === 'prepaid';
    });
    return rows || [];
  }
  // ---------------------------------------------------------------------------

  function buildAmountDueLookup(rows) {
    var samplesByKey = {};
    rows.forEach(function (row) {
      var amount = rowAmountDue(row);
      var key = amountLookupKey(row);
      if (!key || !(amount > 0)) return;
      if (!samplesByKey[key]) samplesByKey[key] = [];
      samplesByKey[key].push(amount);
    });

    var lookup = {};
    Object.keys(samplesByKey).forEach(function (key) {
      var samples = samplesByKey[key];
      var freq = {};
      var mode = samples[0];
      var modeCount = 0;
      samples.forEach(function (amount) {
        var k = String(amount);
        freq[k] = (freq[k] || 0) + 1;
        if (freq[k] > modeCount) {
          mode = amount;
          modeCount = freq[k];
        }
      });
      lookup[key] = {
        amount: mode,
        referenceCount: samples.length,
        modeCount: modeCount,
        distinctAmountCount: Object.keys(freq).length
      };
    });
    return lookup;
  }

  function buildTotalPriceLookup(rows) {
    var samplesByKey = {};
    rows.forEach(function (row) {
      var price = rowTotalPrice(row);
      var key = amountLookupKey(row);
      if (!key || !(price > 0)) return;
      if (!samplesByKey[key]) samplesByKey[key] = [];
      samplesByKey[key].push(price);
    });

    var lookup = {};
    Object.keys(samplesByKey).forEach(function (key) {
      var samples = samplesByKey[key];
      var freq = {};
      var mode = samples[0];
      var modeCount = 0;
      samples.forEach(function (price) {
        var k = String(price);
        freq[k] = (freq[k] || 0) + 1;
        if (freq[k] > modeCount) {
          mode = price;
          modeCount = freq[k];
        }
      });
      lookup[key] = {
        amount: mode,
        referenceCount: samples.length,
        modeCount: modeCount,
        distinctAmountCount: Object.keys(freq).length
      };
    });
    return lookup;
  }

  function buildAmountRepairLookups(rows) {
    var dueSamplesByKey = {};
    var priceSamplesByKey = {};
    (rows || []).forEach(function (row) {
      var key = amountLookupKey(row);
      if (!key) return;
      var amount = rowAmountDue(row);
      if (amount > 0) {
        if (!dueSamplesByKey[key]) dueSamplesByKey[key] = [];
        dueSamplesByKey[key].push(amount);
      }
      var price = rowTotalPrice(row);
      if (price > 0) {
        if (!priceSamplesByKey[key]) priceSamplesByKey[key] = [];
        priceSamplesByKey[key].push(price);
      }
    });
    function modeLookup(samplesByKey) {
      var lookup = {};
      Object.keys(samplesByKey).forEach(function (key) {
        var samples = samplesByKey[key];
        var freq = {};
        var mode = samples[0];
        var modeCount = 0;
        samples.forEach(function (amount) {
          var k = String(amount);
          freq[k] = (freq[k] || 0) + 1;
          if (freq[k] > modeCount) {
            mode = amount;
            modeCount = freq[k];
          }
        });
        lookup[key] = {
          amount: mode,
          referenceCount: samples.length,
          modeCount: modeCount,
          distinctAmountCount: Object.keys(freq).length
        };
      });
      return lookup;
    }
    return {
      amountDue: modeLookup(dueSamplesByKey),
      totalPrice: modeLookup(priceSamplesByKey)
    };
  }


  function orderRef(row) {
    return row.taagerOrderNumber || row.orderNumber || row.id || row.orderId || '';
  }

  function missingAmountReportRow(row, filledAmount, lookupInfo, reason) {
    return {
      order: orderRef(row),
      product: row.products || row.productName || row.product || '',
      sku: row.sku || '',
      qty: Number(row.qty || 1),
      amount: Number(filledAmount || 0),
      referenceCount: lookupInfo ? lookupInfo.referenceCount : 0,
      modeCount: lookupInfo ? lookupInfo.modeCount : 0,
      distinctAmountCount: lookupInfo ? lookupInfo.distinctAmountCount : 0,
      method: lookupInfo ? 'sku_qty' : '',
      reason: reason || '',
      customerName: row.customerName || row.name || row.customer || '',
      phone: row.phone || row.phone1 || row.phone2 || row.rawPhone || row.normPhone || row.customerPhone || row.phoneNumber || ''
    };
  }

  function emptyDayBucket() {
    return { earned: 0, incoming: 0, lost: 0, orders: 0, codCollected: 0, codDue: 0, placedCommission: 0 };
  }

  function emptyDailyStats(period, snapshotMonth) {
    var mm = monthMeta((period && period.dateTo ? period.dateTo.slice(0, 7) : '') || snapshotMonth);
    var dayKeys = [];
    var dailyStats = {};

    if (period && period.dateFrom && period.dateTo) {
      var start = new Date(period.dateFrom + 'T00:00:00');
      var end = new Date(period.dateTo + 'T00:00:00');
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
        for (var d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
          var rangeKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          dayKeys.push(rangeKey);
          dailyStats[rangeKey] = emptyDayBucket();
        }
        return { month: mm, dayKeys: dayKeys, dailyStats: dailyStats };
      }
    }

    var daysInMonth = new Date(mm.year, mm.monthNumber, 0).getDate();
    for (var day = 1; day <= daysInMonth; day++) {
      var key = mm.year + '-' + String(mm.monthNumber).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      dayKeys.push(key);
      dailyStats[key] = emptyDayBucket();
    }
    return { month: mm, dayKeys: dayKeys, dailyStats: dailyStats };
  }

  function stage(id, label, count, total, color, convLabel, conv, convFrom, sar) {
    var share = percentOf(count, total);
    var stageLabels = {
      received:        { en: 'Order received',        ar: 'تم استلام الطلب' },
      confirmed:       { en: 'Confirmed',              ar: 'مؤكد' },
      processing:      { en: 'Order received',         ar: 'تم استلام الطلب' },
      waiting:         { en: 'Awaiting Shipment',      ar: 'في انتظار الشحن' },
      on_hold:         { en: 'Temporarily Suspended',  ar: 'معلق مؤقتًا' },
      shipping:        { en: 'Out for delivery',       ar: 'قيد التوصيل' },
      delivered:       { en: 'Delivered',              ar: 'تم التوصيل' },
      failed:          { en: 'Failed / Lost',          ar: 'فشل / ضائع' },
      canceled_by_you: { en: 'Canceled by you',       ar: 'طلب ملغي بواسطتك' }
    };
    var localizedLabel = stageLabels[id]
      ? (window.dashboardI18n && window.dashboardI18n.pick
        ? window.dashboardI18n.pick(stageLabels[id].en, stageLabels[id].ar)
        : stageLabels[id].en)
      : raw(label);
    return {
      id: id,
      count: count,
      pct: formatPct(count, total),
      share: share,
      color: color,
      label: localizedLabel,
      convLabel: raw(convLabel || 'نسبة من الإجمالي'),
      conv: conv == null ? share : conv,
      convFrom: raw(convFrom || 'من إجمالي الطلبات'),
      sar: sar != null ? fmtNum(sar) : undefined,
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><circle cx="12" cy="12" r="10"/></svg>'
    };
  }

  function statusBreakdownFromCounts(counts, total) {
    var rows = [];
    if (window.TaagerStatus && Array.isArray(window.TaagerStatus.all)) {
      window.TaagerStatus.all.forEach(function (meta) {
        var label = window.TaagerStatus.display(meta.bucket, {
          locale: window.dashboardI18n && window.dashboardI18n.isRtl && window.dashboardI18n.isRtl() ? 'ar' : 'en'
        });
        rows.push({
          bucket: meta.bucket,
          label: label,
          count: Number(counts[meta.bucket] || 0),
          pct: formatPct(Number(counts[meta.bucket] || 0), total),
          share: percentOf(Number(counts[meta.bucket] || 0), total),
          color: window.TaagerStatus.color(meta.bucket),
          eligible: meta.eligible !== false,
          delivered: meta.delivered === true,
          dashboardBucket: window.TaagerStatus.dashboardBucket(meta.bucket)
        });
      });
      return rows;
    }
    Object.keys(counts || {}).forEach(function (bucket) {
      rows.push({
        bucket: bucket,
        label: raw(bucket),
        count: Number(counts[bucket] || 0),
        pct: formatPct(Number(counts[bucket] || 0), total),
        share: percentOf(Number(counts[bucket] || 0), total),
        color: '#8892a4',
        eligible: true,
        delivered: bucket === 'delivered',
        dashboardBucket: bucket
      });
    });
    return rows;
  }

  function buildAccountOptions(accounts, credList, period) {
    var byId = {};
    (credList || []).forEach(function (acc) {
      if (acc && acc.id) byId[acc.id] = acc;
    });

    var ids = [];
    (credList || []).forEach(function (acc) {
      if (acc && acc.id && ids.indexOf(acc.id) === -1) ids.push(acc.id);
    });
    Object.keys(accounts || {}).forEach(function (id) {
      var snap = accounts[id] || {};
      var rows = Array.isArray(snap.snapshot) ? snap.snapshot : [];
      if (rows.length && ids.indexOf(id) === -1) ids.push(id);
    });

    return ids.map(function (id) {
      var snap = accounts[id] || {};
      var sourceAccount = byId[id] || {};
      var identity = snap.accountIdentity || {};
      var label = accountLabel(sourceAccount, snap.accountLabel || identity.label || id);
      var email = sourceAccount.taagerEmail || sourceAccount.easyEmail || sourceAccount.email || '';
      var snapshot = Array.isArray(snap.snapshot) ? snap.snapshot : [];
      var periodRows = period && period.dateFrom && period.dateTo
        ? snapshot.filter(function (row) { return isRowCreatedInPeriod(row, period); })
        : snapshot;
      var netPeriodRows = orderLevelRows(periodRows, false);
      var netSnapshotRows = orderLevelRows(snapshot, false);
      return Object.assign({}, sourceAccount, {
        id: id,
        value: id,
        label: label,
        name: label,
        memberName: sourceAccount.memberName || '',
        taagerCountry: sourceAccount.taagerCountry || identity.taagerCountry || 'sa',
        email: email,
        hasSnapshot: snapshot.length > 0,
        orderCount: netPeriodRows.length,
        rawOrderCount: netSnapshotRows.length,
        snapshotMonth: snap.snapshotMonth || '',
        lastUpdatedAt: snap.staticUploadTimestamp || snap.autoFetchTimestamp || snap.manualFetchTimestamp || snap.botSnapshotTimestamp || null
      });
    });
  }

  window.getActiveAccountId = function () {
    return localStorage.getItem('taager_active_account_id') || ALL_ACCOUNTS;
  };

  window.setActiveAccountId = function (id) {
    localStorage.setItem('taager_active_account_id', id || ALL_ACCOUNTS);
    _aggregatorCache = null;
  };

  window.getDashboardReportingCurrency = reportingCurrencyPreference;
  window.setDashboardReportingCurrency = function (currency) {
    var next = window.TaagerCurrency && window.TaagerCurrency.cleanCurrency
      ? window.TaagerCurrency.cleanCurrency(currency, 'SAR')
      : String(currency || 'SAR').toUpperCase();
    localStorage.setItem('taager_dashboard_reporting_currency', next);
    _aggregatorCache = null;
    _aggregatorCacheHash = '';
    return next;
  };

  var _aggregatorCache = null;
  var _aggregatorCacheAt = 0;
  var _aggregatorCacheHash = '';
  var _aggregatorCachePreview = false;
  var AGGREGATOR_CACHE_TTL = Number.MAX_SAFE_INTEGER;
  var _snapshotAccountsCache = null;
  var _snapshotRevision = null;
  var _aggregationRequestSequence = 0;
  var _latestAggregationRequestId = 0;
  var _snapshotRequestsInFlight = {};

  // T-04: Hash-based cache invalidation
  // Prevents stale cache after same-account re-fetch with new data.
  // Uses row count + first/last order reference as a cheap structural hash.
  function hashRows(rows) {
    if (!rows || !rows.length) return '0__';
    var first = rows[0] ? (rows[0].taagerOrderNumber || rows[0].orderNumber || rows[0].id || '') : '';
    var last  = rows[rows.length - 1] ? (rows[rows.length - 1].taagerOrderNumber || rows[rows.length - 1].orderNumber || rows[rows.length - 1].id || '') : '';
    return rows.length + '_' + first + '_' + last;
  }
  // ---------------------------------------------------------------------------

  window.invalidateDashboardCache = function (reason) {
    _aggregatorCache = null;
    _aggregatorCacheAt = 0;
    _aggregatorCacheHash = '';
    _aggregatorCachePreview = false;
    _snapshotAccountsCache = null;
    _snapshotRevision = null;
    if (window.TaagerPageLifecycle && typeof window.TaagerPageLifecycle.invalidate === 'function') {
      window.TaagerPageLifecycle.invalidate('page-dashboard', reason || 'dashboard-data');
    }
  };

  window.runDashboardAggregator = function (callback) {
    var aggregationRequestId = ++_aggregationRequestSequence;
    _latestAggregationRequestId = aggregationRequestId;
    var previewActive = window.TaagerPremiumPreview && window.TaagerPremiumPreview.isActive('dashboard');
    var requestedDeliveredDateMode = deliveredDateMode();
    var requestedNdrPeriod = activeNdrPeriod(requestedDeliveredDateMode);
    var aggregationPhaseTimings = [];
    function startAggregationPhase(name, detail) {
      detail = Object.assign({ requestId: aggregationRequestId }, detail || {});
      var entry = {
        name: name,
        startedAt: window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now(),
        detail: detail
      };
      entry.timer = window.TaagerPerf && typeof window.TaagerPerf.start === 'function'
        ? window.TaagerPerf.start('dashboard:aggregation:phase:' + name, detail || {})
        : null;
      window.__taagerPerfLastPhase = { name: 'dashboard:aggregation:phase:' + name, phase: name, state: 'running', at: Date.now() };
      return entry;
    }
    function endAggregationPhase(entry, extra) {
      if (!entry) return;
      var endedAt = window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
      var timing = {
        name: entry.name,
        durationMs: Math.round(Math.max(0, endedAt - entry.startedAt) * 10) / 10
      };
      if (entry.detail) timing.detail = entry.detail;
      if (extra) timing.extra = extra;
      aggregationPhaseTimings.push(timing);
      window.__taagerPerfLastPhase = { name: 'dashboard:aggregation:phase:' + entry.name, phase: entry.name, state: 'complete', at: Date.now() };
      if (entry.timer && window.TaagerPerf && typeof window.TaagerPerf.end === 'function') {
        window.TaagerPerf.end(entry.timer, Object.assign({ ok: !(extra && extra.ok === false), phase: entry.name }, extra || {}));
      }
    }
    function runAggregationPhase(name, detail, fn) {
      var phase = startAggregationPhase(name, detail);
      try {
        return fn();
      } finally {
        endAggregationPhase(phase);
      }
    }
    if (!previewActive && (!window.api || typeof window.api.getDashboardSnapshot !== 'function')) {
      console.warn('[Dashboard] getDashboardSnapshot is not available.');
      callback(null);
      return;
    }

    // T-04: Cache is valid only if within TTL AND rows haven't changed structurally.
    // Hash is computed after rows are collected below - so we do a pre-flight with TTL only,
    // then re-validate with hash after rows are assembled.
    if (_aggregatorCache && _aggregatorCachePreview !== !!previewActive) {
      _aggregatorCache = null;
      _aggregatorCacheHash = '';
    }
    var ttlValid = _aggregatorCache && (Date.now() - _aggregatorCacheAt) < AGGREGATOR_CACHE_TTL;
    if (ttlValid && !_aggregatorCacheHash) {
      // Old cache without hash - invalidate to force rebuild
      _aggregatorCache = null;
    } else if (ttlValid && _aggregatorCache && _aggregatorCache.meta && _aggregatorCache.meta.deliveredDateMode !== requestedDeliveredDateMode) {
      _aggregatorCache = null;
      _aggregatorCacheHash = '';
    } else if (ttlValid && _aggregatorCache && _aggregatorCache.meta && rangeCacheKey(_aggregatorCache.meta.ndrPeriod) !== rangeCacheKey(requestedNdrPeriod)) {
      _aggregatorCache = null;
      _aggregatorCacheHash = '';
    } else if (ttlValid) {
      callback(_aggregatorCache);
      return;
    }

    var snapshotTransportMeta = {
      requestId: aggregationRequestId,
      transport: previewActive ? 'preview' : 'unknown',
      cacheHit: false,
      sharedRequest: false,
      mainProcess: null
    };

    function inheritSnapshotTransportMeta(sourceMeta, sharedRequest) {
      if (!sourceMeta) return;
      var currentRequestId = snapshotTransportMeta.requestId;
      Object.keys(sourceMeta).forEach(function (key) {
        if (key === 'requestId') return;
        snapshotTransportMeta[key] = sourceMeta[key];
      });
      snapshotTransportMeta.requestId = currentRequestId;
      snapshotTransportMeta.sharedRequest = !!sharedRequest;
      snapshotTransportMeta.sourceRequestId = sourceMeta.requestId || sourceMeta.sourceRequestId || null;
    }

    function parseSnapshotJson(json, transport) {
      return runAggregationPhase('snapshot-json-parse', { transport: transport }, function () {
        return typeof json === 'string' ? JSON.parse(json) : json;
      });
    }

    function fetchDashboardSnapshot() {
      if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
        window.TaagerPreloader.dashboardStage('snapshot', { activity: 'Loading saved snapshot payload' });
      }
      if (window.api.getDashboardSnapshotGzip && typeof window.DecompressionStream === 'function') {
        var snapshotKey = ALL_ACCOUNTS + '|' + String(_snapshotRevision || 'cold');
        if (_snapshotRequestsInFlight[snapshotKey]) {
          var sharedSnapshotRequest = _snapshotRequestsInFlight[snapshotKey];
          snapshotTransportMeta.sharedRequest = true;
          snapshotTransportMeta.sourceRequestId = sharedSnapshotRequest.meta && sharedSnapshotRequest.meta.requestId || null;
          return sharedSnapshotRequest.promise.then(function (value) {
            inheritSnapshotTransportMeta(sharedSnapshotRequest.meta, true);
            return value;
          }, function (err) {
            inheritSnapshotTransportMeta(sharedSnapshotRequest.meta, true);
            throw err;
          });
        }
        var transferPhase = startAggregationPhase('snapshot-transfer', { transport: 'gzip' });
        var request = window.api.getDashboardSnapshotGzip(ALL_ACCOUNTS, _snapshotRevision).then(function (payload) {
          snapshotTransportMeta.transport = typeof payload === 'string' ? 'gzip-base64' : 'gzip-binary';
          snapshotTransportMeta.cacheHit = !!(payload && payload.cacheHit);
          snapshotTransportMeta.mainProcess = payload && payload.timings ? payload.timings : null;
          endAggregationPhase(transferPhase, {
            ok: true,
            transport: snapshotTransportMeta.transport,
            cacheHit: snapshotTransportMeta.cacheHit
          });
          transferPhase = null;
          var bytes;
          if (typeof payload === 'string') {
            bytes = runAggregationPhase('snapshot-base64-decode', null, function () {
              var binary = window.atob(payload);
              var decoded = new Uint8Array(binary.length);
              for (var i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i);
              return decoded;
            });
          } else {
            bytes = runAggregationPhase('snapshot-binary-copy', null, function () {
              var source = payload && payload.data ? payload.data : payload || [];
              return source instanceof Uint8Array ? source : new Uint8Array(source);
            });
          }
          var decompressPhase = startAggregationPhase('snapshot-decompression', { bytes: bytes.byteLength || bytes.length || 0 });
          var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          return new Response(stream).text().then(function (json) {
            endAggregationPhase(decompressPhase, { ok: true, chars: json.length });
            return json;
          }, function (err) {
            endAggregationPhase(decompressPhase, { ok: false, error: err && err.message ? err.message : String(err || '') });
            throw err;
          });
        }).then(function (json) {
          return parseSnapshotJson(json, snapshotTransportMeta.transport);
        }).catch(function (gzipError) {
          if (transferPhase) {
            endAggregationPhase(transferPhase, { ok: false, error: gzipError && gzipError.message ? gzipError.message : String(gzipError || '') });
            transferPhase = null;
          }
          snapshotTransportMeta.fallback = 'json';
          var fallbackPhase = startAggregationPhase('snapshot-transfer', { transport: 'json-fallback' });
          var fallback = window.api.getDashboardSnapshotJson
            ? window.api.getDashboardSnapshotJson(ALL_ACCOUNTS, _snapshotRevision)
            : window.api.getDashboardSnapshot(ALL_ACCOUNTS, _snapshotRevision);
          return fallback.then(function (json) {
            endAggregationPhase(fallbackPhase, { ok: true });
            return parseSnapshotJson(json, 'json-fallback');
          }, function (err) {
            endAggregationPhase(fallbackPhase, { ok: false, error: err && err.message ? err.message : String(err || '') });
            throw err;
          });
        });
        _snapshotRequestsInFlight[snapshotKey] = {
          promise: request,
          meta: snapshotTransportMeta
        };
        request.then(function () { delete _snapshotRequestsInFlight[snapshotKey]; }, function () { delete _snapshotRequestsInFlight[snapshotKey]; });
        return request;
      }
      if (window.api.getDashboardSnapshotJson) {
        snapshotTransportMeta.transport = 'json';
        var jsonTransferPhase = startAggregationPhase('snapshot-transfer', { transport: 'json' });
        return window.api.getDashboardSnapshotJson(ALL_ACCOUNTS, _snapshotRevision).then(function (payload) {
          endAggregationPhase(jsonTransferPhase, { ok: true });
          return parseSnapshotJson(payload, 'json');
        }, function (err) {
          endAggregationPhase(jsonTransferPhase, { ok: false, error: err && err.message ? err.message : String(err || '') });
          throw err;
        });
      }
      snapshotTransportMeta.transport = 'object';
      var objectTransferPhase = startAggregationPhase('snapshot-transfer', { transport: 'object' });
      return window.api.getDashboardSnapshot(ALL_ACCOUNTS, _snapshotRevision).then(function (payload) {
        endAggregationPhase(objectTransferPhase, { ok: true });
        return payload;
      }, function (err) {
        endAggregationPhase(objectTransferPhase, { ok: false, error: err && err.message ? err.message : String(err || '') });
        throw err;
      });
    }

    var snapshotPhase = startAggregationPhase('snapshot-ipc', { preview: !!previewActive });
    var snapshotPromise = (previewActive
      ? Promise.resolve({ ok: true, data: window.TaagerPremiumPreview.dashboardAccounts() })
      : fetchDashboardSnapshot()).then(function (value) {
        endAggregationPhase(snapshotPhase, { ok: !!(value && value.ok), unchanged: !!(value && value.unchanged) });
        return value;
      }, function (err) {
        endAggregationPhase(snapshotPhase, { ok: false, error: err && err.message ? err.message : String(err || '') });
        throw err;
      });

    Promise.all([
      snapshotPromise,
      previewActive
        ? Promise.resolve({ accounts: [{ id: 'preview-store', easyEmail: 'preview@taagerwhaat.com', taagerEmail: 'preview@taagerwhaat.com', label: 'Preview Store' }] })
        : (window.api.getCredentials ? window.api.getCredentials() : Promise.resolve({}))
    ]).then(function (results) {
      if (aggregationRequestId !== _latestAggregationRequestId) {
        callback(null);
        return;
      }
      var snapshotRes = results[0];
      var creds = results[1] || {};
      if (!snapshotRes || !snapshotRes.ok) { callback(null); return; }
      if (!previewActive && snapshotRes.unchanged && _snapshotAccountsCache) {
        snapshotRes = { ok: true, revision: snapshotRes.revision, data: _snapshotAccountsCache };
      } else if (!previewActive && snapshotRes.data) {
        _snapshotAccountsCache = snapshotRes.data;
        _snapshotRevision = snapshotRes.revision;
      }

      var accounts = snapshotRes.data || {};
      if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
        var accountCountForLoader = Object.keys(accounts || {}).length;
        window.TaagerPreloader.dashboardStage('accounts', {
          activity: accountCountForLoader ? (accountCountForLoader + ' account snapshots loaded') : 'No saved account snapshot yet'
        });
      }
      var period = activePeriod();
      var accountOptions = buildAccountOptions(accounts, Array.isArray(creds.accounts) ? creds.accounts : [], period);
      var totalOrders = accountOptions.reduce(function (sum, acc) { return sum + acc.orderCount; }, 0);
      var allOption = {
        id: ALL_ACCOUNTS,
        value: ALL_ACCOUNTS,
        label: allLabel(),
        name: allLabel(),
        email: '',
        countries: accountOptions.map(function (acc) { return acc.taagerCountry || 'sa'; }).filter(function (value, index, arr) { return arr.indexOf(value) === index; }),
        hasSnapshot: accountOptions.some(function (acc) { return acc.hasSnapshot; }),
        orderCount: totalOrders,
        rawOrderCount: accountOptions.reduce(function (sum, acc) { return sum + (acc.rawOrderCount || 0); }, 0),
        snapshotMonth: chooseSnapshotMonth(accounts, ALL_ACCOUNTS),
        lastUpdatedAt: latestTimestamp(accounts, ALL_ACCOUNTS)
      };

      var canUseAllAccounts = accountOptions.length > 1;
      window.dashboardAccountsList = canUseAllAccounts ? [allOption].concat(accountOptions) : accountOptions;

      var activeId = window.getActiveAccountId();
      if (!canUseAllAccounts && accountOptions.length) {
        activeId = accountOptions[0].id;
        window.setActiveAccountId(activeId);
      }
      if (activeId !== ALL_ACCOUNTS && !accountOptions.some(function (acc) { return acc.id === activeId; })) {
        activeId = canUseAllAccounts ? ALL_ACCOUNTS : (accountOptions[0] ? accountOptions[0].id : ALL_ACCOUNTS);
        window.setActiveAccountId(activeId);
      }

      var activeOption = activeId === ALL_ACCOUNTS
        ? allOption
        : accountOptions.find(function (acc) { return acc.id === activeId; });
      var activeLabel = activeOption ? activeOption.label : allLabel();
      window.currentActiveAccountLabel = activeLabel;
      var selectedDashboardAccountIds = accountOptions.filter(function (accInfo) {
        return activeId === ALL_ACCOUNTS || accInfo.id === activeId;
      }).map(function (accInfo) {
        return accInfo.id;
      });
      var prepaidMatchDiagnostics = buildPrepaidMatchDiagnostics(accounts, selectedDashboardAccountIds);

      var rows = [];
      accountOptions.forEach(function (accInfo) {
        if (activeId !== ALL_ACCOUNTS && accInfo.id !== activeId) return;
        var snap = accounts[accInfo.id] || {};
        if (!Array.isArray(snap.snapshot)) return;
        rows = rows.concat(snap.snapshot.map(function (row) {
          var rowCountry = row.taagerCountry || row.country || accInfo.taagerCountry || 'sa';
          return Object.assign({}, row, {
            accountId: accInfo.id,
            accountEmail: accInfo.email || accInfo.label,
            accountLabel: accInfo.label,
            taagerCountry: rowCountry,
            country: row.country || rowCountry
          });
        }));
      });

      var activeDeliveredDateMode = requestedDeliveredDateMode;
      var allRowsForAccount = rows;
      var previousPeriod = previousMonthPeriod(period);
      var previousRows = previousPeriod
        ? filterRowsByPeriod(allRowsForAccount, previousPeriod, activeDeliveredDateMode)
        : [];
      var periodRows = filterRowsByPeriod(allRowsForAccount, period, activeDeliveredDateMode);
      var ndrSourceRows = activeDeliveredDateMode === 'expected' && requestedNdrPeriod
        ? filterCreatedOrders(allRowsForAccount, requestedNdrPeriod)
        : periodRows;
      rows = periodRows;

      var snapshotMonth = chooseSnapshotMonth(accounts, activeId);
      var lastUpdatedAt = latestTimestamp(accounts, activeId);
      var activeCountries = rows.map(function (row) {
        return String(row.taagerCountry || row.country || 'sa').trim().toLowerCase();
      }).filter(function (value, index, arr) {
        return value && arr.indexOf(value) === index;
      });
      if (!activeCountries.length && activeOption) {
        activeCountries = activeOption.id === ALL_ACCOUNTS && Array.isArray(activeOption.countries)
          ? activeOption.countries.slice()
          : [activeOption.taagerCountry || 'sa'];
      }
      var activeCountry = activeCountries.length === 1 ? activeCountries[0] : 'mixed';
      var nativeActiveCurrency = activeCountry !== 'mixed' && window.TaagerCountry && window.TaagerCountry.currency
        ? window.TaagerCountry.currency(activeCountry)
        : 'SAR';
      var rateSnapshot = currencySnapshot();
      var storedPref = '';
      try { storedPref = localStorage.getItem('taager_dashboard_reporting_currency') || ''; } catch (_) {}
      if (storedPref && window.TaagerCurrency && typeof window.TaagerCurrency.cleanCurrency === 'function') {
        storedPref = window.TaagerCurrency.cleanCurrency(storedPref, '');
      }
      var reportingCurrency = (storedPref && ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'].indexOf(String(storedPref).toUpperCase()) !== -1)
        ? String(storedPref).toUpperCase()
        : nativeActiveCurrency;
      var activeCurrency = reportingCurrency;
      var countryGroups = {};
      rows.forEach(function (row) {
        var cc = String(row.taagerCountry || row.country || 'sa').trim().toLowerCase();
        if (!countryGroups[cc]) {
          countryGroups[cc] = {
            country: cc,
            currency: window.TaagerCountry && window.TaagerCountry.currency ? window.TaagerCountry.currency(cc) : 'SAR',
            orderCount: 0,
            rows: 0,
            nativeSales: 0,
            nativeAmountDue: 0,
            nativeProfit: 0,
            reportingSales: 0,
            reportingAmountDue: 0,
            reportingProfit: 0
          };
        }
        countryGroups[cc].rows++;
        countryGroups[cc].nativeSales += rowTotalPrice(row);
        countryGroups[cc].nativeAmountDue += rowAmountDue(row);
        countryGroups[cc].nativeProfit += rowCommissionValue(row);
      });
      accountOptions.forEach(function (acc) {
        var cc = String(acc.taagerCountry || 'sa').trim().toLowerCase();
        if (countryGroups[cc]) countryGroups[cc].orderCount += Number(acc.orderCount || 0);
      });
      window.dashboardActiveCountry = activeCountry;
      window.dashboardActiveCurrency = activeCurrency;
      var meta = {
        activeAccountId: activeId,
        activeAccountLabel: activeLabel,
        activeCountry: activeCountry,
        activeCurrency: activeCurrency,
        nativeActiveCurrency: nativeActiveCurrency,
        reportingCurrency: reportingCurrency,
        exchangeRates: Object.assign({}, rateSnapshot.rates || {}),
        exchangeRateSource: rateSnapshot.source || 'defaults',
        exchangeRatesUpdatedAt: rateSnapshot.updatedAt || '',
        countries: activeCountries,
        isMixedCountry: activeCountries.length > 1,
        countryGroups: Object.keys(countryGroups).map(function (key) { return countryGroups[key]; }),
        snapshotMonth: snapshotMonth,
        monthLabel: period ? formatDateRangeLabel(period) : monthMeta(snapshotMonth).label,
        period: period,
        ndrPeriod: requestedNdrPeriod || period,
        previousPeriod: previousPeriod,
        comparisonLabel: comparisonLabel(period, previousPeriod),
        previousRows: previousRows,
        periodLabel: period ? formatDateRangeLabel(period) : monthMeta(snapshotMonth).label,
        deliveredDateMode: activeDeliveredDateMode,
        lastUpdatedAt: lastUpdatedAt,
        lastUpdatedLabel: formatTimestamp(lastUpdatedAt),
        accountOptions: window.dashboardAccountsList,
        hasData: rows.length > 0,
        aggregationRequestId: aggregationRequestId,
        snapshotRevision: snapshotRes.revision || _snapshotRevision || '',
        snapshotTransport: snapshotTransportMeta,
        prepaidMatchDiagnostics: prepaidMatchDiagnostics
      };

      Object.keys(countryGroups).forEach(function (key) {
        var group = countryGroups[key];
        group.reportingSales = convertDashboardCurrency(group.nativeSales, group.currency, reportingCurrency, null, meta.exchangeRates);
        group.reportingAmountDue = convertDashboardCurrency(group.nativeAmountDue, group.currency, reportingCurrency, null, meta.exchangeRates);
        group.reportingProfit = convertDashboardCurrency(group.nativeProfit, group.currency, reportingCurrency, null, meta.exchangeRates);
      });
      meta.countryGroups = Object.keys(countryGroups).map(function (key) { return countryGroups[key]; });
      if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
        window.TaagerPreloader.dashboardStage('metrics', {
          activity: rows.length ? (rows.length + ' rows in selected period') : 'Preparing empty dashboard metrics'
        });
      }
      runAggregationPhase('reporting-row-prep', { rows: rows.length, previousRows: previousRows.length, ndrRows: ndrSourceRows.length }, function () {
        rows = prepareReportingRows(rows, meta);
        meta.previousRows = prepareReportingRows(previousRows, meta);
        meta.ndrSourceRows = ndrSourceRows === periodRows
          ? rows
          : prepareReportingRows(ndrSourceRows, meta);
      });

      var result = runAggregationPhase('process-snapshot-rows', { rows: rows.length, activeAccountId: activeId }, function () {
        return processSnapshotRows(rows, activeId, meta);
      });
      if (result && result.meta) {
        result.meta.aggregationPhaseTimings = aggregationPhaseTimings.slice();
      }
      if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
        window.TaagerPreloader.dashboardStage('modules', { activity: 'Dashboard views prepared' });
      }
      // T-04: Validate hash AFTER rows assembled. If hash matches, old cache is still good.
      var accountHash = window.dashboardAccountsList.map(function (acc) {
        return (acc.id || '') + ':' + (acc.orderCount || 0) + ':' + (acc.lastUpdatedAt || '');
      }).join('|');
      var rowHash = hashRows(rows) + '|' + accountHash + '|' + activeDeliveredDateMode + '|' + reportingCurrency + '|' + JSON.stringify(meta.exchangeRates) + '|' + (period ? (period.preset + ':' + period.dateFrom + ':' + period.dateTo) : '') + '|' + rangeCacheKey(requestedNdrPeriod);
      if (aggregationRequestId !== _latestAggregationRequestId) {
        callback(null);
        return;
      }
      if (_aggregatorCache && rowHash === _aggregatorCacheHash) {
        callback(_aggregatorCache);
        return;
      }
      _aggregatorCache = result;
      _aggregatorCacheAt = Date.now();
      _aggregatorCacheHash = rowHash;
      _aggregatorCachePreview = !!previewActive;
      callback(result);
    }).catch(function (err) {
      console.error('[Dashboard] Aggregator failed:', err);
      callback(null);
    });
  };

  function processSnapshotRows(rows, accountId, meta) {
    rows = Array.isArray(rows) ? rows : [];
    meta = meta || {};
    var processPhaseTimings = [];
    function startProcessPhase(name, detail) {
      var entry = {
        name: name,
        startedAt: window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now(),
        detail: detail || null
      };
      entry.timer = window.TaagerPerf && typeof window.TaagerPerf.start === 'function'
        ? window.TaagerPerf.start('dashboard:aggregation:phase:' + name, detail || {})
        : null;
      return entry;
    }
    function endProcessPhase(entry, extra) {
      if (!entry) return;
      var endedAt = window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
      var timing = {
        name: entry.name,
        durationMs: Math.round(Math.max(0, endedAt - entry.startedAt) * 10) / 10
      };
      if (entry.detail) timing.detail = entry.detail;
      if (extra) timing.extra = extra;
      processPhaseTimings.push(timing);
      if (entry.timer && window.TaagerPerf && typeof window.TaagerPerf.end === 'function') {
        window.TaagerPerf.end(entry.timer, Object.assign({ ok: !(extra && extra.ok === false), phase: entry.name }, extra || {}));
      }
    }
    function runProcessPhase(name, detail, fn) {
      var phase = startProcessPhase(name, detail);
      try {
        return fn();
      } finally {
        endProcessPhase(phase);
      }
    }

    var dateState = emptyDailyStats(meta.period, meta.snapshotMonth);
    var dayKeys = dateState.dayKeys;
    var dailyStats = dateState.dailyStats;
    function labelForDayKey(key) {
      var parts = String(key || '').split('-');
      var day = Number(parts[2] || 0);
      var monthIndex = Number(parts[1] || 1) - 1;
      var labelMonth = window.dashboardI18n
        ? window.dashboardI18n.monthName(monthIndex)
        : AR_MONTHS[monthIndex];
      return fmtNum(day, { useGrouping: false }) + ' ' + labelMonth;
    }

    var rawTotalOrders = 0;
    var placedCount = 0;
    var ndrBaseOrders = 0;
    var ndrDeliveredOrders = 0;
    var deliveredCount = 0, calculatorDeliveredCount = 0, shippingCount = 0, failedCount = 0, canceledByYouCount = 0;
    var pendingCount = 0, confirmedCount = 0, processingCount = 0, waitingCount = 0;
    var earnedCommission = 0, calculatorEarnedProfitAfterTax = 0, incomingCommission = 0, lostCommission = 0, totalPlacedCommission = 0;
    var collected = 0, gapSar = 0, totalDue = 0;
    var incomingCodSar = 0, lostCodSar = 0, confirmedBaseCodSar = 0;
    var drBaseOrders = 0, drDeliveredOrders = 0;
    var prepaidDrBaseOrders = 0, prepaidDrDeliveredOrders = 0;
    var codDrBaseOrders = 0, codDrDeliveredOrders = 0;
    var cityStats = {}, productStats = {}, campaignProductStats = {}, deliveryDays = [], displayRows = [];
    var buildHeavyStatsInMainLoop = meta.__forceDashboardHeavyModels === true || meta.deliveredDateMode === 'expected';
    var buildCityStatsInMainLoop = buildHeavyStatsInMainLoop || meta.__forceDashboardCitiesModel === true;
    var buildProductStatsInMainLoop = buildHeavyStatsInMainLoop || meta.__forceDashboardProductsModel === true;
    var buildCampaignStatsInMainLoop = buildHeavyStatsInMainLoop && meta.deliveredDateMode === 'expected';
    var lazyCampaignProductStats = null;
    var lazyHeavyResult = null;
    var lazyCitiesResult = null;
    var lazyProductsResult = null;
    var statusCounts = {};
    var statusFinancials = {};
    var repairLookups = runProcessPhase('process:repair-lookups', { rows: rows.length }, function () {
      return buildAmountRepairLookups(rows);
    });
    var amountDueLookup = repairLookups.amountDue;
    var totalPriceLookup = repairLookups.totalPrice;
    var totalSales = 0, totalDeliveredSales = 0;
    var rawOrderSet = {}, placedOrderSet = {}, canceledByYouOrderSet = {};
    var ndrBaseOrderSet = {}, deliveredOrderSet = {}, drBaseOrderSet = {}, drDeliveredOrderSet = {};
    var prepaidDrBaseOrderSet = {}, prepaidDrDeliveredOrderSet = {}, codDrBaseOrderSet = {}, codDrDeliveredOrderSet = {};
    var earnedOrderSet = {}, calculatorDeliveredOrderSet = {}, incomingOrderSet = {}, lostOrderSet = {}, collectedOrderSet = {}, codOrderSet = {};
    var stageOrderSet = {}, dailyOrderSet = {};
    var statusFinancialOrderSet = {};
    var cityOrderSet = {};
    var productOrderSet = {};
    var totalPrepaidCount = 0, totalCodCount = 0;

    function statusFinancial(bucket) {
      bucket = bucket || 'other';
      if (!statusFinancials[bucket]) {
        var info = exactStatusInfo(bucket);
        var label = window.TaagerStatus && typeof window.TaagerStatus.display === 'function'
          ? window.TaagerStatus.display(bucket, { locale: window.dashboardI18n && window.dashboardI18n.isRtl && window.dashboardI18n.isRtl() ? 'ar' : 'en' })
          : bucket;
        statusFinancials[bucket] = {
          id: bucket,
          bucket: bucket,
          label: label,
          order: info.order || 999,
          color: info.color || '#8892a4',
          businessGroup: info.businessGroup || 'other',
          count: 0,
          profitAfterTax: 0,
          cod: 0,
          sales: 0
        };
      }
      return statusFinancials[bucket];
    }

    var amountRepairReport = {
      totalMissing: 0, filledCount: 0, unfilledCount: 0,
      fillRate: 0, filledRows: [], unfilledRows: []
    };

    var totalSalesRepairReport = {
      totalMissing: 0, filledCount: 0, unfilledCount: 0,
      fillRate: 0, filledRows: [], unfilledRows: []
    };

    var mainRowPhase = startProcessPhase('process:main-row-loop', { rows: rows.length });
    rows.forEach(function (row, rowIndex) {
      var bucket = getStatusBucket(row.orderStatus || row.status);
      var exactBucket = exactStatusBucket(row);
      var ndrEligible = window.TaagerStatus ? window.TaagerStatus.isEligibleForNdr(row.orderStatus || row.status) : !isNdrCanceledBucket(exactBucket);
      // Compatibility field name: dashboard sections still call this commission,
      // but Taager data routes order profit minus tax profit through the shared helper.
      var commissionVal = rowCommissionValue(row);
      var dueVal = rowAmountDue(row);
      var priceVal = rowTotalPrice(row);

      var deliveredModeForRow = meta.deliveredDateMode || 'actual';
      var ndrPeriodForRow = deliveredModeForRow === 'expected' ? (meta.ndrPeriod || meta.period) : meta.period;
      var inCreatedPeriod = isRowCreatedInPeriod(row, meta.period);
      var inNdrCohortPeriod = isRowCreatedInPeriod(row, ndrPeriodForRow);
      var isDeliveredInPeriod = isDeliveredRowInPeriod(row, meta.period, deliveredModeForRow);
      var isDeliveredInNdrCohort = bucket === 'delivered' && inNdrCohortPeriod;
      var inSelectedNdrBase = ndrEligible && inNdrCohortPeriod;
      var rowIsPrepaid = isRowPrepaid(row);
      var rowIsFailedOutcome = isFailedOutcomeBucket(exactBucket);
      var exactStatusMeta = window.TaagerStatus && typeof window.TaagerStatus.statusInfo === 'function'
        ? window.TaagerStatus.statusInfo(exactBucket)
        : null;
      var rowIsLostBucket = exactStatusMeta
        ? exactStatusMeta.businessGroup === 'lost'
        : isLostBucket(exactBucket);
      var rowIsIncomingBucket = exactStatusMeta
        ? exactStatusMeta.businessGroup === 'incoming'
        : isIncomingBucket(exactBucket);
      var rowIsCanceledByYou = isCanceledByYouBucket(exactBucket);
      var rowIsNetOrder = !rowIsCanceledByYou;
      var isCalculatorDelivered = bucket === 'delivered' && inCreatedPeriod && rowIsNetOrder;
      var rowInConfirmedBase = inNdrCohortPeriod && rowIsNetOrder && !isConfirmedBaseExcludedBucket(exactBucket);
      var rowInBusinessConfirmedBase = inCreatedPeriod && rowIsNetOrder && !isConfirmedBaseExcludedBucket(exactBucket);
      var orderKey = orderOnlyKey(row, rowIndex);
      var rowFinancialLineKey = financialLineKey(row);
      row.__dashboardOrderKey = orderKey;
      row.__dashboardFinancialLineKey = rowFinancialLineKey;
      row.__dashboardExactBucket = exactBucket;
      row.__dashboardInCreatedPeriod = inCreatedPeriod;

      if (inCreatedPeriod) {
        if (addOnce(rawOrderSet, orderKey)) {
          rawTotalOrders++;
          statusCounts[exactBucket] = (statusCounts[exactBucket] || 0) + 1;
        }
        if (rowIsCanceledByYou && addOnce(canceledByYouOrderSet, orderKey)) canceledByYouCount++;
      }

      if (inCreatedPeriod && rowIsNetOrder && addOnce(placedOrderSet, orderKey)) {
        placedCount++;
        if (rowIsPrepaid) totalPrepaidCount++;
        else totalCodCount++;
      }
      if (inSelectedNdrBase && addOnce(ndrBaseOrderSet, orderKey)) {
        ndrBaseOrders++;
      }
      if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(deliveredOrderSet, 'ndr:' + orderKey)) {
        ndrDeliveredOrders++;
      }
      if (rowInConfirmedBase && addOnce(drBaseOrderSet, orderKey)) {
        drBaseOrders++;
        if (rowIsPrepaid) {
          if (addOnce(prepaidDrBaseOrderSet, orderKey)) prepaidDrBaseOrders++;
        } else if (addOnce(codDrBaseOrderSet, orderKey)) {
          codDrBaseOrders++;
        }
      }
      if (!rowIsPrepaid && rowInBusinessConfirmedBase && addOnce(codOrderSet, 'confirmedBase:' + orderKey)) {
        confirmedBaseCodSar += dueVal;
      }

      // Repair amountDue
      if (bucket === 'delivered' && hasMissingAmountDue(row)) {
        if (isDeliveredInPeriod) {
          amountRepairReport.totalMissing++;
          var lookupInfo = amountDueLookup[amountLookupKey(row)] || row.amountDueLookup;
          if (lookupInfo && lookupInfo.amount > 0) {
            dueVal = lookupInfo.amount;
            amountRepairReport.filledCount++;
            amountRepairReport.filledRows.push(missingAmountReportRow(row, dueVal, lookupInfo, ''));
          } else {
            dueVal = 0;
            amountRepairReport.unfilledCount++;
            amountRepairReport.unfilledRows.push(missingAmountReportRow(row, 0, null, 'No SKU+qty reference amount found'));
          }
        }
      }

      // Repair totalPrice
      // A row can contribute to created-period sales, delivered-period sales, or both.
      var shouldProcessSales = inCreatedPeriod || isDeliveredInPeriod;
      if (shouldProcessSales && hasMissingTotalPrice(row)) {
        totalSalesRepairReport.totalMissing++;
        var priceLookupInfo = totalPriceLookup[amountLookupKey(row)];
        if (priceLookupInfo && priceLookupInfo.amount > 0) {
          priceVal = priceLookupInfo.amount;
          totalSalesRepairReport.filledCount++;
          totalSalesRepairReport.filledRows.push(missingAmountReportRow(row, priceVal, priceLookupInfo, ''));
        } else {
          priceVal = 0;
          totalSalesRepairReport.unfilledCount++;
          totalSalesRepairReport.unfilledRows.push(missingAmountReportRow(row, 0, null, 'No SKU+qty reference price found'));
        }
      }

      row.dashboardTotalPrice = priceVal;
      row.dashboardAmountDue = dueVal;
      displayRows.push(row);

      if (inCreatedPeriod && rowIsNetOrder && addOnce(statusFinancialOrderSet, 'businessSales:' + rowFinancialLineKey)) {
        totalSales += priceVal;
      }
      if (inCreatedPeriod && rowIsNetOrder && addOnce(statusFinancialOrderSet, 'businessCommission:' + orderKey)) {
        totalPlacedCommission += commissionVal;
      }
      if (isDeliveredInPeriod && rowIsNetOrder && addOnce(statusFinancialOrderSet, 'deliveredSales:' + rowFinancialLineKey)) {
        totalDeliveredSales += priceVal;
      }

      if (inCreatedPeriod && addOnce(statusFinancialOrderSet, exactBucket + ':' + orderKey)) {
        var sf = statusFinancial(exactBucket);
        sf.count++;
        sf.profitAfterTax += rowIsCanceledByYou ? 0 : commissionVal;
        if (!rowIsPrepaid) sf.cod += dueVal;
        sf.sales += rowIsCanceledByYou ? 0 : priceVal;
      }

      if (isDeliveredInPeriod && rowIsNetOrder) {
        if (addOnce(deliveredOrderSet, 'business:' + orderKey)) deliveredCount++;
        if (addOnce(earnedOrderSet, orderKey)) earnedCommission += commissionVal;
        if (!rowIsPrepaid && addOnce(codOrderSet, 'delivered:' + orderKey)) collected += dueVal;
      }
      if (isCalculatorDelivered && addOnce(calculatorDeliveredOrderSet, orderKey)) {
        calculatorDeliveredCount++;
        calculatorEarnedProfitAfterTax += commissionVal;
      }
      if (isDeliveredInNdrCohort && rowIsNetOrder && rowInConfirmedBase && addOnce(drDeliveredOrderSet, orderKey)) {
        drDeliveredOrders++;
        if (rowIsPrepaid) {
          if (addOnce(prepaidDrDeliveredOrderSet, orderKey)) prepaidDrDeliveredOrders++;
        } else if (addOnce(codDrDeliveredOrderSet, orderKey)) {
          codDrDeliveredOrders++;
        }
      }

      if (rowIsLostBucket) {
        if (inCreatedPeriod && rowIsNetOrder) {
          if (addOnce(lostOrderSet, orderKey)) {
            failedCount++;
            lostCommission += commissionVal;
          }
          if (!rowIsPrepaid && addOnce(codOrderSet, 'lost:' + orderKey)) lostCodSar += dueVal;
        }
      } else if (rowIsIncomingBucket) {
        if (inCreatedPeriod && rowIsNetOrder) {
          if (addOnce(stageOrderSet, exactBucket + ':' + orderKey)) {
            if (bucket === 'shipping')    shippingCount++;
            else if (bucket === 'pending')    pendingCount++;
            else if (bucket === 'confirmed')  confirmedCount++;
            else if (bucket === 'processing') processingCount++;
            else if (bucket === 'waiting')    waitingCount++;
          }
          if (addOnce(incomingOrderSet, orderKey)) incomingCommission += commissionVal;
          if (!rowIsPrepaid && addOnce(codOrderSet, 'incoming:' + orderKey)) incomingCodSar += dueVal;
        }
      }

      var dateKey = rowDashboardDate(row, deliveredModeForRow);
      if (dateKey && !dailyStats[dateKey]) {
        dailyStats[dateKey] = emptyDayBucket();
        dayKeys.push(dateKey);
      }
      if (dateKey) {
        if (inCreatedPeriod && rowIsNetOrder) {
          if (addOnce(dailyOrderSet, dateKey + ':placedCommission:' + orderKey)) {
            dailyStats[dateKey].placedCommission += commissionVal;
          }
        }
        if (isDeliveredInPeriod && rowIsNetOrder) {
          if (addOnce(dailyOrderSet, dateKey + ':delivered:' + orderKey)) dailyStats[dateKey].orders++;
          if (addOnce(dailyOrderSet, dateKey + ':earned:' + orderKey)) dailyStats[dateKey].earned += commissionVal;
          if (!rowIsPrepaid && addOnce(dailyOrderSet, dateKey + ':codCollected:' + orderKey)) dailyStats[dateKey].codCollected += dueVal;
          if (!rowIsPrepaid && addOnce(dailyOrderSet, dateKey + ':codDue:' + orderKey)) dailyStats[dateKey].codDue += dueVal;
        } else if (rowIsLostBucket && inCreatedPeriod && rowIsNetOrder) {
          if (addOnce(dailyOrderSet, dateKey + ':lostOrder:' + orderKey)) dailyStats[dateKey].orders++;
          if (addOnce(dailyOrderSet, dateKey + ':lost:' + orderKey)) dailyStats[dateKey].lost += commissionVal;
        } else if (rowIsIncomingBucket && inCreatedPeriod && rowIsNetOrder) {
          if (addOnce(dailyOrderSet, dateKey + ':incomingOrder:' + orderKey)) dailyStats[dateKey].orders++;
          if (addOnce(dailyOrderSet, dateKey + ':incoming:' + orderKey)) dailyStats[dateKey].incoming += commissionVal;
          if (!rowIsPrepaid && isCodActiveBucket(bucket) && addOnce(dailyOrderSet, dateKey + ':incomingCodDue:' + orderKey)) dailyStats[dateKey].codDue += dueVal;
        }
      }

      // Delivery duration measures completed deliveries, not time to shipping.
      if (isDeliveredInPeriod && rowIsNetOrder) {
        var span = daysBetween(row.createdAt || row.date, row.lastUpdatedAt);
        if (span != null && span <= 60) deliveryDays.push(span);
      }

      if (buildCityStatsInMainLoop || buildProductStatsInMainLoop) {
        var rowCountry = effectiveCountry(row.taagerCountry || row.country, meta, 'sa');
        var cityName = (row.city || '').toString().trim();
        var cityKeyName = meta.isMixedCountry ? (rowCountry + '|' + cityName) : cityName;
        var productName = window.TaagerStatus ? window.TaagerStatus.productName(row) : (row.products || row.productName || row.product || '');
        var productKey = (row.sku || productName || '').toLowerCase();
        if (buildCityStatsInMainLoop && cityName) {
        if (!cityStats[cityKeyName]) {
          cityStats[cityKeyName] = {
            name: cityName,
            country: rowCountry,
            due: 0, collected: 0, gap: 0, count: 0, ndrBaseOrders: 0,
            deliveredOrders: 0, ndrDeliveredOrders: 0, drBaseOrders: 0, drDeliveredOrders: 0,
            canceledCount: 0, shippingCount: 0, confirmedCount: 0, processingCount: 0,
            statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
            earnedProfitAfterTax: 0,
            earnedCommission: 0, incomingCommission: 0, lostCommission: 0, totalPlacedCommission: 0,
            totalRevenue: 0,
            prepaidCount: 0, codCount: 0,
            prepaidDeliveredCount: 0, codDeliveredCount: 0,
            prepaidCanceledCount: 0, codCanceledCount: 0,
            prepaidNdrBaseOrders: 0, codNdrBaseOrders: 0,
            prepaidDrBaseOrders: 0, prepaidDrDeliveredOrders: 0,
            codDrBaseOrders: 0, codDrDeliveredOrders: 0,
            deliveryDays: [],
            provinceId: (meta.isMixedCountry ? rowCountry + '-' : '') + resolveProvince(cityName, rowCountry),
            productMap: {},
            accountMap: {}
          };
        }

        var cs = cityStats[cityKeyName];
      var cityOrderKey = cityKeyName + ':' + accountId + ':' + orderKey;
        var cityAccountId = String(row.accountId || meta.activeAccountId || '');
        var cityAccountKey = cityAccountId || '__unknown__';
        if (!cs.accountMap[cityAccountKey]) {
          cs.accountMap[cityAccountKey] = {
            accountId: cityAccountId,
            accountLabel: row.accountLabel || row.accountEmail || cityAccountId,
            orders: 0,
            delivered: 0,
            ndrBaseOrders: 0,
            ndrDeliveredOrders: 0,
            earnedProfitAfterTax: 0,
            commission: 0,
            deliveredSales: 0
          };
        }
        var cityAccount = cs.accountMap[cityAccountKey];
        var cityAccountOrderKey = cityKeyName + ':' + cityAccountKey + ':' + orderKey;

        // Track statusTotalCount only for net orders (excluding canceled_by_you).
        // This ensures confirmation/cancel/pending rates divide by net orders.
        if (inCreatedPeriod && !rowIsCanceledByYou && addOnce(cityOrderSet, 'status:' + cityOrderKey)) {
          cs.statusTotalCount++;
          var cityStatusGroup = productStatusGroup(exactBucket);
          if (cityStatusGroup === 'confirmation') cs.confirmationStatusCount++;
          else if (cityStatusGroup === 'cancel') cs.cancelStatusCount++;
          else cs.pendingStatusCount++;
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(cityOrderSet, 'placed:' + cityOrderKey)) {
          cs.count++;
          if (rowIsPrepaid) {
            cs.prepaidCount++;
          } else {
            cs.codCount++;
          }
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(cityOrderSet, 'accountPlaced:' + cityAccountOrderKey)) {
          cityAccount.orders++;
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(cityOrderSet, 'financial:' + cityOrderKey)) {
          cs.totalRevenue += priceVal;
          cs.totalPlacedCommission += commissionVal;
        }
        if (inSelectedNdrBase && addOnce(cityOrderSet, 'ndr:' + cityOrderKey)) {
          cs.ndrBaseOrders++;
          if (rowIsPrepaid) cs.prepaidNdrBaseOrders++;
          else cs.codNdrBaseOrders++;
        }
        if (inSelectedNdrBase && addOnce(cityOrderSet, 'accountNdr:' + cityAccountOrderKey)) {
          cityAccount.ndrBaseOrders++;
        }
        if (rowInConfirmedBase && addOnce(cityOrderSet, 'dr:' + cityOrderKey)) {
          cs.drBaseOrders++;
          if (rowIsPrepaid) cs.prepaidDrBaseOrders++;
          else cs.codDrBaseOrders++;
        }
        if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(cityOrderSet, 'ndrDelivered:' + cityOrderKey)) {
          cs.ndrDeliveredOrders++;
          if (rowInConfirmedBase) cs.drDeliveredOrders++;
        }
        if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(cityOrderSet, 'accountNdrDelivered:' + cityAccountOrderKey)) {
          cityAccount.ndrDeliveredOrders++;
        }

        if (isDeliveredInPeriod && rowIsNetOrder) {
          if (addOnce(cityOrderSet, 'delivered:' + cityOrderKey)) {
            if (!rowIsPrepaid) {
              cs.due += dueVal;
              cs.collected += dueVal;
            }
            cs.deliveredOrders++;
            cs.earnedProfitAfterTax += commissionVal;
            cs.earnedCommission += commissionVal;
            if (span != null && span <= 60) cs.deliveryDays.push(span);

            if (rowIsPrepaid) {
              cs.prepaidDeliveredCount++;
              cs.prepaidDrDeliveredOrders++;
            } else {
              cs.codDeliveredCount++;
              cs.codDrDeliveredOrders++;
            }
          }
          if (addOnce(cityOrderSet, 'accountDelivered:' + cityAccountOrderKey)) {
            cityAccount.delivered++;
            cityAccount.earnedProfitAfterTax += commissionVal;
            cityAccount.commission += commissionVal;
            cityAccount.deliveredSales += priceVal;
          }
        } else if (rowIsLostBucket && inCreatedPeriod && rowIsNetOrder) {
          if (addOnce(cityOrderSet, 'lost:' + cityOrderKey)) {
            cs.canceledCount++;
            cs.lostCommission += commissionVal;

            if (rowIsPrepaid) {
              cs.prepaidCanceledCount++;
            } else {
              cs.codCanceledCount++;
            }
          }
        } else if (rowIsIncomingBucket && inCreatedPeriod && rowIsNetOrder) {
          if (addOnce(cityOrderSet, 'incoming:' + cityOrderKey)) {
            if (bucket === 'shipping')   cs.shippingCount++;
            if (bucket === 'confirmed')  cs.confirmedCount++;
            if (bucket === 'processing') cs.processingCount++;

            cs.incomingCommission += commissionVal;
            if (!rowIsPrepaid) {
              cs.due += dueVal;
              cs.gap += dueVal;
            }
          }
        }

        var cityProductName = productName;
        var cityProductKey = productKey;
        if (cityProductKey) {
          if (!cs.productMap[cityProductKey]) {
            cs.productMap[cityProductKey] = {
              sku: row.sku || '',
              name: cityProductName || row.sku || raw('منتج غير معروف'),
              orders: 0, delivered: 0, canceled: 0, commission: 0, revenue: 0, totalPlacedCommission: 0,
              activeOrders: 0, ndrBaseOrders: 0, confirmed: 0,
              statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
              prepaidCount: 0, codCount: 0,
              prepaidNdrBaseOrders: 0, codNdrBaseOrders: 0,
              prepaidDelivered: 0, prepaidCanceled: 0,
              codDelivered: 0, codCanceled: 0
            };
          }
          var cp = cs.productMap[cityProductKey];

          var cpOrderKey = cityKeyName + ':' + cityProductKey + ':' + orderKey;

          // Track statusTotalCount only for net orders (excluding canceled_by_you).
          if (inCreatedPeriod && !rowIsCanceledByYou && addOnce(productOrderSet, 'cityProductStatus:' + cpOrderKey)) {
            cp.statusTotalCount++;
            var cityProductStatusGroup = productStatusGroup(exactBucket);
            if (cityProductStatusGroup === 'confirmation') cp.confirmationStatusCount++;
            else if (cityProductStatusGroup === 'cancel') cp.cancelStatusCount++;
            else cp.pendingStatusCount++;
          }
          if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'cityProductPlaced:' + cpOrderKey)) {
            cp.orders++;
            if (rowIsPrepaid) {
              cp.prepaidCount++;
            } else {
              cp.codCount++;
            }
          }
          if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'cityProductFinancial:' + cpOrderKey)) {
            cp.revenue += priceVal;
            cp.totalPlacedCommission += commissionVal;
          }
          if (inSelectedNdrBase && addOnce(productOrderSet, 'cityProductNdr:' + cpOrderKey)) {
            cp.ndrBaseOrders++;
            if (rowIsPrepaid) cp.prepaidNdrBaseOrders++;
            else cp.codNdrBaseOrders++;
          }

          if (rowInConfirmedBase && addOnce(productOrderSet, 'cityProductDr:' + cpOrderKey)) {
            cp.activeOrders++;
            cp.confirmed++;
          }

          if (isDeliveredInPeriod && rowIsNetOrder && addOnce(productOrderSet, 'cityProductDelivered:' + cpOrderKey)) {
            cp.delivered++;
            cp.commission += commissionVal;

            if (rowIsPrepaid) {
              cp.prepaidDelivered++;
            } else {
              cp.codDelivered++;
            }
          } else if (rowIsLostBucket && inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'cityProductCanceled:' + cpOrderKey)) {
            cp.canceled++;

            if (rowIsPrepaid) {
              cp.prepaidCanceled++;
            } else {
              cp.codCanceled++;
            }
          }
        }
      }

      if (buildProductStatsInMainLoop && productKey) {
        if (buildCampaignStatsInMainLoop) {
        var campaignProductKey = [
          String(row.accountId || meta.activeAccountId || ''),
          rowCountry,
          productKey
        ].join('|');
        if (!campaignProductStats[campaignProductKey]) {
          campaignProductStats[campaignProductKey] = {
            accountId: String(row.accountId || meta.activeAccountId || ''),
            country: rowCountry,
            currency: meta.reportingCurrency || meta.activeCurrency || 'SAR',
            sku: row.sku || '',
            name: productName || row.sku || raw('منتج غير معروف'),
            placedCount: 0,
            totalOrderCount: 0,
            statusTotalCount: 0,
            confirmationStatusCount: 0,
            cancelStatusCount: 0,
            pendingStatusCount: 0,
            deliveredCount: 0,
            ndrBaseCount: 0,
            ndrConfirmedCount: 0,
            ndrDeliveredCount: 0,
            confirmedCount: 0,
            canceledCount: 0,
            failedCount: 0,
            pendingCount: 0,
            shippingCount: 0,
            processingCount: 0,
            waitingCount: 0,
            commission: 0,
            deliveredSales: 0,
            totalPlacedSales: 0,
            totalPlacedCommission: 0
          };
        }
        var campaignProduct = campaignProductStats[campaignProductKey];
        var campaignProductOrderKey = campaignProductKey + ':' + orderKey;
        if (inCreatedPeriod && addOnce(productOrderSet, 'campaignTotal:' + campaignProductOrderKey)) {
          campaignProduct.totalOrderCount++;
          if (rowIsCanceledByYou) {
            campaignProduct.canceledCount++;
          } else {
            // Track statusTotalCount only for net orders (excluding canceled_by_you).
            campaignProduct.statusTotalCount++;
            var campaignGroup = productStatusGroup(exactBucket);
            if (campaignGroup === 'confirmation') campaignProduct.confirmationStatusCount++;
            else if (campaignGroup === 'cancel') campaignProduct.cancelStatusCount++;
            else campaignProduct.pendingStatusCount++;
          }
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'campaignPlaced:' + campaignProductOrderKey)) {
          campaignProduct.placedCount++;
          campaignProduct.totalPlacedCommission += commissionVal;
          if (rowInBusinessConfirmedBase) campaignProduct.confirmedCount++;
          if (rowIsLostBucket) {
            campaignProduct.failedCount++;
          } else if (rowIsIncomingBucket) {
            if (bucket === 'shipping') campaignProduct.shippingCount++;
            else if (bucket === 'processing') campaignProduct.processingCount++;
            else if (bucket === 'waiting') campaignProduct.waitingCount++;
            else if (bucket === 'pending') campaignProduct.pendingCount++;
          }
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'campaignPlacedSales:' + campaignProductKey + ':' + rowFinancialLineKey)) {
          campaignProduct.totalPlacedSales += priceVal;
        }
        if (inSelectedNdrBase && addOnce(productOrderSet, 'campaignNdr:' + campaignProductOrderKey)) {
          campaignProduct.ndrBaseCount++;
        }
        if (rowInConfirmedBase && addOnce(productOrderSet, 'campaignNdrConfirmed:' + campaignProductOrderKey)) {
          campaignProduct.ndrConfirmedCount++;
        }
        if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(productOrderSet, 'campaignNdrDelivered:' + campaignProductOrderKey)) {
          campaignProduct.ndrDeliveredCount++;
        }
        if (isDeliveredInPeriod && rowIsNetOrder && addOnce(productOrderSet, 'campaignDeliveredSales:' + campaignProductKey + ':' + financialLineKey(row))) {
          campaignProduct.deliveredSales += priceVal;
        }
        if (isDeliveredInPeriod && rowIsNetOrder && addOnce(productOrderSet, 'campaignDelivered:' + campaignProductOrderKey)) {
          campaignProduct.commission += commissionVal;
          campaignProduct.deliveredCount++;
        }
        }

        if (!productStats[productKey]) {
          productStats[productKey] = {
            sku: row.sku || '',
            name: productName || row.sku || raw('منتج غير معروف'),
            qty: 0, deliveredQty: 0, revenue: 0, commission: 0, deliveredSales: 0, totalPlacedCommission: 0,
            deliveredCount: 0, calculatorDeliveredCount: 0, calculatorEarnedProfitAfterTax: 0,
            ndrDeliveredCount: 0, placedCount: 0, totalOrderCount: 0,
            ndrBaseCount: 0,
            firstOrderCreatedAt: '',
            statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
            canceledCount: 0, canceledByYouCount: 0, failedCount: 0, confirmedCount: 0, ndrConfirmedCount: 0,
            shippingCount: 0, processingCount: 0,
            waitingCount: 0, pendingCount: 0,
            outForDeliveryCount: 0, deliverySuspendedCount: 0, awaitingShipmentCount: 0,
            realFailedCount: 0,
            cityMap: {}, piecesMap: {}, quantityCityMap: {}, accountMap: {}
          };
        }
        var rowQty = Number(row.qty || 1);
        var productOrderKey = productKey + ':' + orderKey;
        var productAccountId = String(row.accountId || meta.activeAccountId || '');
        var productAccountKey = productAccountId || '__unknown__';
        if (!productStats[productKey].accountMap[productAccountKey]) {
          productStats[productKey].accountMap[productAccountKey] = {
            accountId: productAccountId,
            accountLabel: row.accountLabel || row.accountEmail || productAccountId,
            orders: 0,
            delivered: 0,
            ndrBaseOrders: 0,
            ndrDeliveredOrders: 0,
            commission: 0,
            deliveredSales: 0
          };
        }
        var productAccount = productStats[productKey].accountMap[productAccountKey];
        var productAccountOrderKey = productKey + ':' + productAccountKey + ':' + orderKey;

        if (inCreatedPeriod && addOnce(productOrderSet, 'total:' + productOrderKey)) {
          productStats[productKey].totalOrderCount++;
          if (rowIsCanceledByYou) {
            productStats[productKey].canceledCount++;
            productStats[productKey].canceledByYouCount++;
            // canceled_by_you is NOT counted in statusTotalCount (net orders denominator).
          } else {
            productStats[productKey].statusTotalCount++;
            var productGroup = productStatusGroup(exactBucket);
            if (productGroup === 'confirmation') productStats[productKey].confirmationStatusCount++;
            else if (productGroup === 'cancel') productStats[productKey].cancelStatusCount++;
            else productStats[productKey].pendingStatusCount++;
          }
        }

        if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'placed:' + productOrderKey)) {
          productStats[productKey].placedCount++;
          var productCreatedKey = createdDashboardDate(row);
          if (productCreatedKey && (!productStats[productKey].firstOrderCreatedAt || productCreatedKey < productStats[productKey].firstOrderCreatedAt)) {
            productStats[productKey].firstOrderCreatedAt = productCreatedKey;
          }
          if (rowInBusinessConfirmedBase) {
            productStats[productKey].confirmedCount++;
          }
          if (rowIsLostBucket) {
            productStats[productKey].realFailedCount++;
            productStats[productKey].failedCount++;
          } else if (rowIsIncomingBucket) {
            if (bucket === 'shipping') productStats[productKey].shippingCount++;
            else if (bucket === 'processing') productStats[productKey].processingCount++;
            else if (bucket === 'waiting') productStats[productKey].waitingCount++;
            else if (bucket === 'pending') productStats[productKey].pendingCount++;
            if (exactBucket === 'shipping') productStats[productKey].outForDeliveryCount++;
            else if (exactBucket === 'delivery_suspended') productStats[productKey].deliverySuspendedCount++;
            else if (exactBucket === 'waiting') productStats[productKey].awaitingShipmentCount++;
          }
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'accountPlaced:' + productAccountOrderKey)) {
          productAccount.orders++;
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productFinancial:' + productKey + ':' + rowFinancialLineKey)) {
          productStats[productKey].qty += rowQty;
          productStats[productKey].revenue += priceVal;
        }
        if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCommission:' + productOrderKey)) {
          productStats[productKey].totalPlacedCommission += commissionVal;
        }
        if (inSelectedNdrBase && addOnce(productOrderSet, 'ndr:' + productOrderKey)) {
          productStats[productKey].ndrBaseCount++;
        }
        if (inSelectedNdrBase && addOnce(productOrderSet, 'accountNdr:' + productAccountOrderKey)) {
          productAccount.ndrBaseOrders++;
        }
        if (rowInConfirmedBase && addOnce(productOrderSet, 'ndrConfirmed:' + productOrderKey)) {
          productStats[productKey].ndrConfirmedCount++;
        }
        if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(productOrderSet, 'ndrDelivered:' + productOrderKey)) {
          productStats[productKey].ndrDeliveredCount++;
        }
        if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(productOrderSet, 'accountNdrDelivered:' + productAccountOrderKey)) {
          productAccount.ndrDeliveredOrders++;
        }

        if (isDeliveredInPeriod && rowIsNetOrder) {
          productStats[productKey].deliveredQty += rowQty;
          productStats[productKey].deliveredSales += priceVal;
          if (addOnce(productOrderSet, 'delivered:' + productOrderKey)) {
            productStats[productKey].commission += commissionVal;
            productStats[productKey].deliveredCount++;
          }
          if (addOnce(productOrderSet, 'accountDelivered:' + productAccountOrderKey)) {
            productAccount.delivered++;
            productAccount.commission += commissionVal;
            productAccount.deliveredSales += priceVal;
          }
        }
        if (isCalculatorDelivered && addOnce(productOrderSet, 'calculatorDelivered:' + productOrderKey)) {
          productStats[productKey].calculatorDeliveredCount++;
          productStats[productKey].calculatorEarnedProfitAfterTax += commissionVal;
        }

        var cityKey = cityKeyName || (row.city || row.cityName || '').toString().trim();
        if (cityKey) {
          if (!productStats[productKey].cityMap[cityKey]) {
            productStats[productKey].cityMap[cityKey] = {
              name: cityName || cityKey,
              country: rowCountry,
              orders: 0, delivered: 0, ndrDelivered: 0, canceled: 0, commission: 0, revenue: 0, ndrBaseOrders: 0, confirmed: 0, totalPlacedCommission: 0,
              statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0,
              prepaidCount: 0, codCount: 0,
              prepaidDelivered: 0, prepaidCanceled: 0,
              codDelivered: 0, codCanceled: 0
            };
          }
          var pcm = productStats[productKey].cityMap[cityKey];

          var pcmOrderKey = productKey + ':' + cityKey + ':' + orderKey;

          if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityStatus:' + pcmOrderKey)) {
            pcm.statusTotalCount++;
            var pcmGroup = productStatusGroup(exactBucket);
            if (pcmGroup === 'confirmation') pcm.confirmationStatusCount++;
            else if (pcmGroup === 'cancel') pcm.cancelStatusCount++;
            else pcm.pendingStatusCount++;
          }
          if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityPlaced:' + pcmOrderKey)) {
            pcm.orders++;
            if (rowIsPrepaid) pcm.prepaidCount++;
            else pcm.codCount++;
          }
          if (inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityFinancial:' + pcmOrderKey)) {
            pcm.revenue += priceVal;
            pcm.totalPlacedCommission += commissionVal;
          }
          if (inSelectedNdrBase && addOnce(productOrderSet, 'productCityNdr:' + pcmOrderKey)) {
            pcm.ndrBaseOrders++;
          }
          if (rowInConfirmedBase && addOnce(productOrderSet, 'productCityConfirmed:' + pcmOrderKey)) {
            pcm.confirmed++;
          }
          if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(productOrderSet, 'productCityNdrDelivered:' + pcmOrderKey)) {
            pcm.ndrDelivered++;
          }

          if (isDeliveredInPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityDelivered:' + pcmOrderKey)) {
            pcm.delivered++;
            pcm.commission += commissionVal;
          } else if (rowIsLostBucket && inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityCanceled:' + pcmOrderKey)) {
            pcm.canceled++;
          }

          if (rowIsPrepaid) {
            if (isDeliveredInPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityPrepaidDelivered:' + pcmOrderKey)) {
              pcm.prepaidDelivered++;
            } else if (rowIsLostBucket && inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityPrepaidCanceled:' + pcmOrderKey)) {
              pcm.prepaidCanceled++;
            }
          } else {
            if (isDeliveredInPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityCodDelivered:' + pcmOrderKey)) {
              pcm.codDelivered++;
            } else if (rowIsLostBucket && inCreatedPeriod && rowIsNetOrder && addOnce(productOrderSet, 'productCityCodCanceled:' + pcmOrderKey)) {
              pcm.codCanceled++;
            }
          }
        }
        var piecesKey = String(rowQty);
        if (inCreatedPeriod || inSelectedNdrBase || isDeliveredInNdrCohort) {
          var _pieceEntry = productStats[productKey].piecesMap[piecesKey];
          if (!_pieceEntry || typeof _pieceEntry !== 'object') {
            _pieceEntry = {
              count: typeof _pieceEntry === 'number' ? _pieceEntry : 0,
              delivered: 0, confirmed: 0,
              statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0
            };
          }
          if (inCreatedPeriod && !rowIsCanceledByYou && addOnce(productOrderSet, 'pieceStatus:' + productKey + ':' + piecesKey + ':' + orderKey)) {
            _pieceEntry.statusTotalCount++;
            var pieceGroup = productStatusGroup(exactBucket);
            if (pieceGroup === 'confirmation') _pieceEntry.confirmationStatusCount++;
            else if (pieceGroup === 'cancel') _pieceEntry.cancelStatusCount++;
            else _pieceEntry.pendingStatusCount++;
          }
          if (inSelectedNdrBase) {
            _pieceEntry.count++;
          }
          if (isDeliveredInNdrCohort) {
            _pieceEntry.delivered++;
          }
          if (rowInConfirmedBase && addOnce(productOrderSet, 'pieceConfirmed:' + productKey + ':' + piecesKey + ':' + orderKey)) {
            _pieceEntry.confirmed++;
          }
          productStats[productKey].piecesMap[piecesKey] = _pieceEntry;
          if (cityKey) {
            if (!productStats[productKey].quantityCityMap[piecesKey]) {
              productStats[productKey].quantityCityMap[piecesKey] = {};
            }
            var _qcEntry = productStats[productKey].quantityCityMap[piecesKey][cityKey];
            if (!_qcEntry || typeof _qcEntry !== 'object') {
              _qcEntry = {
                count: typeof _qcEntry === 'number' ? _qcEntry : 0,
                delivered: 0, confirmed: 0,
                statusTotalCount: 0, confirmationStatusCount: 0, cancelStatusCount: 0, pendingStatusCount: 0
              };
            }
            if (inCreatedPeriod && !rowIsCanceledByYou && addOnce(productOrderSet, 'quantityCityStatus:' + productKey + ':' + piecesKey + ':' + cityKey + ':' + orderKey)) {
              _qcEntry.statusTotalCount++;
              var qcGroup = productStatusGroup(exactBucket);
              if (qcGroup === 'confirmation') _qcEntry.confirmationStatusCount++;
              else if (qcGroup === 'cancel') _qcEntry.cancelStatusCount++;
              else _qcEntry.pendingStatusCount++;
            }
            if (inSelectedNdrBase) {
              _qcEntry.count++;
            }
            if (isDeliveredInNdrCohort) {
              _qcEntry.delivered++;
            }
            if (rowInConfirmedBase && addOnce(productOrderSet, 'quantityCityConfirmed:' + productKey + ':' + piecesKey + ':' + cityKey + ':' + orderKey)) {
              _qcEntry.confirmed++;
            }
            productStats[productKey].quantityCityMap[piecesKey][cityKey] = _qcEntry;
          }
        }
        }
      }
    });
    if (dayKeys.length > 1) dayKeys.sort();
    endProcessPhase(mainRowPhase);

    function resetExpectedRateCountersFromSource() {
      if (meta.deliveredDateMode !== 'expected') return;
      var sourceRows = Array.isArray(meta.ndrSourceRows) ? meta.ndrSourceRows : [];
      if (!sourceRows.length) return;

      ndrBaseOrders = 0;
      ndrDeliveredOrders = 0;
      drBaseOrders = 0;
      drDeliveredOrders = 0;

      Object.keys(cityStats).forEach(function (cityKey) {
        var city = cityStats[cityKey];
        city.ndrBaseOrders = 0;
        city.ndrDeliveredOrders = 0;
        city.drBaseOrders = 0;
        city.drDeliveredOrders = 0;
        city.prepaidNdrBaseOrders = 0;
        city.codNdrBaseOrders = 0;
        city.prepaidDeliveredCount = 0;
        city.codDeliveredCount = 0;
        city.prepaidDrBaseOrders = 0;
        city.prepaidDrDeliveredOrders = 0;
        city.codDrBaseOrders = 0;
        city.codDrDeliveredOrders = 0;
        Object.keys(city.accountMap || {}).forEach(function (accountKey) {
          city.accountMap[accountKey].ndrBaseOrders = 0;
          city.accountMap[accountKey].ndrDeliveredOrders = 0;
        });
        Object.keys(city.productMap || {}).forEach(function (productKey) {
          var cp = city.productMap[productKey];
          cp.ndrBaseOrders = 0;
          cp.activeOrders = 0;
          cp.confirmed = 0;
          cp.prepaidNdrBaseOrders = 0;
          cp.codNdrBaseOrders = 0;
          cp.prepaidDelivered = 0;
          cp.codDelivered = 0;
        });
      });

      Object.keys(productStats).forEach(function (productKey) {
        var product = productStats[productKey];
        product.ndrBaseCount = 0;
        product.ndrConfirmedCount = 0;
        product.ndrDeliveredCount = 0;
        Object.keys(product.accountMap || {}).forEach(function (accountKey) {
          product.accountMap[accountKey].ndrBaseOrders = 0;
          product.accountMap[accountKey].ndrDeliveredOrders = 0;
        });
        Object.keys(product.cityMap || {}).forEach(function (cityKey) {
          product.cityMap[cityKey].ndrBaseOrders = 0;
          product.cityMap[cityKey].ndrDelivered = 0;
          product.cityMap[cityKey].confirmed = 0;
          product.cityMap[cityKey].prepaidDelivered = 0;
          product.cityMap[cityKey].codDelivered = 0;
        });
      });

      Object.keys(campaignProductStats).forEach(function (productKey) {
        var product = campaignProductStats[productKey];
        product.ndrBaseCount = 0;
        product.ndrConfirmedCount = 0;
        product.ndrDeliveredCount = 0;
      });

      var rateSeen = {};
      sourceRows.forEach(function (row, rowIndex) {
        var bucket = getStatusBucket(row.orderStatus || row.status);
        var exactBucket = exactStatusBucket(row);
        var ndrEligible = window.TaagerStatus ? window.TaagerStatus.isEligibleForNdr(row.orderStatus || row.status) : !isNdrCanceledBucket(exactBucket);
        var rowIsCanceledByYou = isCanceledByYouBucket(exactBucket);
        var rowIsNetOrder = !rowIsCanceledByYou;
        var rowInConfirmedBase = rowIsNetOrder && !isConfirmedBaseExcludedBucket(exactBucket);
        var rowIsPrepaid = isRowPrepaid(row);
        var orderKey = orderOnlyKey(row, rowIndex);

        if (ndrEligible && addOnce(rateSeen, 'globalNdr:' + orderKey)) ndrBaseOrders++;
        if (bucket === 'delivered' && rowIsNetOrder && addOnce(rateSeen, 'globalNdrDelivered:' + orderKey)) ndrDeliveredOrders++;
        if (rowInConfirmedBase && addOnce(rateSeen, 'globalDr:' + orderKey)) drBaseOrders++;
        if (bucket === 'delivered' && rowInConfirmedBase && addOnce(rateSeen, 'globalDrDelivered:' + orderKey)) drDeliveredOrders++;

        var rowCountry = effectiveCountry(row.taagerCountry || row.country, meta, 'sa');
        var cityName = (row.city || '').toString().trim();
        var cityKeyName = meta.isMixedCountry ? (rowCountry + '|' + cityName) : cityName;
        var city = cityName ? cityStats[cityKeyName] : null;
        if (city) {
          var cityOrderKey = cityKeyName + ':' + (row.accountId || meta.activeAccountId || '') + ':' + orderKey;
          var cityAccountId = String(row.accountId || meta.activeAccountId || '');
          var cityAccountKey = cityAccountId || '__unknown__';
          var cityAccount = city.accountMap && city.accountMap[cityAccountKey];
          if (ndrEligible && addOnce(rateSeen, 'cityNdr:' + cityOrderKey)) {
            city.ndrBaseOrders++;
            if (rowIsPrepaid) city.prepaidNdrBaseOrders++;
            else city.codNdrBaseOrders++;
          }
          if (ndrEligible && cityAccount && addOnce(rateSeen, 'cityAccountNdr:' + cityKeyName + ':' + cityAccountKey + ':' + orderKey)) {
            cityAccount.ndrBaseOrders++;
          }
          if (rowInConfirmedBase && addOnce(rateSeen, 'cityDr:' + cityOrderKey)) {
            city.drBaseOrders++;
            if (rowIsPrepaid) city.prepaidDrBaseOrders++;
            else city.codDrBaseOrders++;
          }
          if (bucket === 'delivered' && rowIsNetOrder && addOnce(rateSeen, 'cityNdrDelivered:' + cityOrderKey)) {
            city.ndrDeliveredOrders++;
            if (rowIsPrepaid) city.prepaidDeliveredCount++;
            else city.codDeliveredCount++;
            if (rowInConfirmedBase) {
              city.drDeliveredOrders++;
              if (rowIsPrepaid) city.prepaidDrDeliveredOrders++;
              else city.codDrDeliveredOrders++;
            }
          }
          if (bucket === 'delivered' && rowIsNetOrder && cityAccount && addOnce(rateSeen, 'cityAccountNdrDelivered:' + cityKeyName + ':' + cityAccountKey + ':' + orderKey)) {
            cityAccount.ndrDeliveredOrders++;
          }
        }

        var productName = window.TaagerStatus ? window.TaagerStatus.productName(row) : (row.products || row.productName || row.product || '');
        var productKey = (row.sku || productName || '').toLowerCase();
        var product = productStats[productKey];
        if (product) {
          var productOrderKey = productKey + ':' + orderKey;
          var productAccountId = String(row.accountId || meta.activeAccountId || '');
          var productAccountKey = productAccountId || '__unknown__';
          var productAccount = product.accountMap && product.accountMap[productAccountKey];
          if (ndrEligible && addOnce(rateSeen, 'productNdr:' + productOrderKey)) product.ndrBaseCount++;
          if (ndrEligible && productAccount && addOnce(rateSeen, 'productAccountNdr:' + productKey + ':' + productAccountKey + ':' + orderKey)) productAccount.ndrBaseOrders++;
          if (rowInConfirmedBase && addOnce(rateSeen, 'productDr:' + productOrderKey)) product.ndrConfirmedCount++;
          if (bucket === 'delivered' && rowIsNetOrder && addOnce(rateSeen, 'productNdrDelivered:' + productOrderKey)) product.ndrDeliveredCount++;
          if (bucket === 'delivered' && rowIsNetOrder && productAccount && addOnce(rateSeen, 'productAccountNdrDelivered:' + productKey + ':' + productAccountKey + ':' + orderKey)) productAccount.ndrDeliveredOrders++;

          if (cityName) {
            var cityKey = meta.isMixedCountry ? (rowCountry + '|' + cityName) : cityName;
            var pcm = product.cityMap && product.cityMap[cityKey];
            if (pcm) {
              var pcmOrderKey = productKey + ':' + cityKey + ':' + orderKey;
              if (ndrEligible && addOnce(rateSeen, 'productCityNdr:' + pcmOrderKey)) pcm.ndrBaseOrders++;
              if (rowInConfirmedBase && addOnce(rateSeen, 'productCityDr:' + pcmOrderKey)) pcm.confirmed++;
              if (bucket === 'delivered' && rowIsNetOrder && addOnce(rateSeen, 'productCityNdrDelivered:' + pcmOrderKey)) {
                pcm.ndrDelivered++;
                if (rowIsPrepaid) pcm.prepaidDelivered++;
                else pcm.codDelivered++;
              }
            }
          }
        }

        var campaignProductKey = [
          String(row.accountId || meta.activeAccountId || ''),
          rowCountry,
          productKey
        ].join('|');
        var campaignProduct = campaignProductStats[campaignProductKey];
        if (campaignProduct) {
          var campaignOrderKey = campaignProductKey + ':' + orderKey;
          if (ndrEligible && addOnce(rateSeen, 'campaignNdr:' + campaignOrderKey)) campaignProduct.ndrBaseCount++;
          if (rowInConfirmedBase && addOnce(rateSeen, 'campaignDr:' + campaignOrderKey)) campaignProduct.ndrConfirmedCount++;
          if (bucket === 'delivered' && rowIsNetOrder && addOnce(rateSeen, 'campaignNdrDelivered:' + campaignOrderKey)) campaignProduct.ndrDeliveredCount++;
        }

        if (city) {
          var cityProductKey = (row.sku || productName || '').toLowerCase();
          var cityProduct = city.productMap && city.productMap[cityProductKey];
          if (cityProduct) {
            var cpOrderKey = cityKeyName + ':' + cityProductKey + ':' + orderKey;
            if (ndrEligible && addOnce(rateSeen, 'cityProductNdr:' + cpOrderKey)) {
              cityProduct.ndrBaseOrders++;
              if (rowIsPrepaid) cityProduct.prepaidNdrBaseOrders++;
              else cityProduct.codNdrBaseOrders++;
            }
            if (rowInConfirmedBase && addOnce(rateSeen, 'cityProductDr:' + cpOrderKey)) {
              cityProduct.activeOrders++;
              cityProduct.confirmed++;
            }
            if (bucket === 'delivered' && rowIsNetOrder && addOnce(rateSeen, 'cityProductPaymentDelivered:' + cpOrderKey)) {
              if (rowIsPrepaid) cityProduct.prepaidDelivered++;
              else cityProduct.codDelivered++;
            }
          }
        }
      });
    }

    resetExpectedRateCountersFromSource();

    var averageProfitSource = calculatorDeliveredCount > 0
      ? 'delivered_orders'
      : 'unavailable';
    var actualAvgCommission = calculatorDeliveredCount > 0
      ? calculatorEarnedProfitAfterTax / calculatorDeliveredCount
      : 0;
    var actualDeliveredCount = calculatorDeliveredCount;
    var actualEarnedCommission = calculatorEarnedProfitAfterTax;
    var actualAverageProfit = calculatorDeliveredCount > 0
      ? calculatorEarnedProfitAfterTax / calculatorDeliveredCount
      : 0;
    var actualAverageProfitSource = calculatorDeliveredCount > 0
      ? 'delivered_orders'
      : 'unavailable';
    var actualTotalDeliveredSales = totalDeliveredSales;
    var accountFinancials = null;
    var expectedNdrRateSource = meta.deliveredDateMode === 'expected' ? 'selected_cohort' : 'actual';
    var expectedNdrSelectedBaseOrders = ndrBaseOrders;
    var expectedNdrSelectedDeliveredOrders = ndrDeliveredOrders;
    var expectedNdrFallbackUsed = false;

    if (meta.deliveredDateMode === 'expected') {
      if (ndrBaseOrders <= 0 && placedCount > 0 && actualDeliveredCount > 0) {
        expectedNdrFallbackUsed = true;
        expectedNdrRateSource = 'actual_period_fallback';
        ndrBaseOrders = placedCount;
        ndrDeliveredOrders = actualDeliveredCount;
      } else if (ndrBaseOrders <= 0) {
        expectedNdrRateSource = 'insufficient_history';
      }
      var globalExpectedNdrRate = ndrBaseOrders > 0 ? (ndrDeliveredOrders / ndrBaseOrders) : 0;
      var globalExpectedDrRate = drBaseOrders > 0 ? (drDeliveredOrders / drBaseOrders) : 0;
      var financialCore = { calculate: dashboardFinancials };
      accountFinancials = financialCore.calculate({
        mode: 'expected',
        netOrders: placedCount,
        actualDeliveredOrders: actualDeliveredCount,
        actualEarnedProfitAfterTax: actualEarnedCommission,
        netOrderProfitAfterTax: actualDeliveredCount > 0 ? totalPlacedCommission : null,
        actualDeliveredSales: actualTotalDeliveredSales,
        currentTotalSales: totalSales,
        expectedNdrRate: globalExpectedNdrRate,
        adSpend: roiAdSpend
      });
      accountFinancials.expectedNdrRateSource = expectedNdrRateSource;
      accountFinancials.expectedNdrFallbackUsed = expectedNdrFallbackUsed;
      
      deliveredCount = accountFinancials.expectedDeliveriesDisplay;
      earnedCommission = accountFinancials.expectedTotalProfitBeforeAdSpend;
      totalDeliveredSales = accountFinancials.expectedDeliveredSales;
      
      dayKeys.forEach(function (key) {
        var stat = dailyStats[key];
        stat.actualEarned = stat.earned;
        stat.expectedDeliveriesExact = stat.orders * globalExpectedNdrRate;
        stat.earned = stat.expectedDeliveriesExact * actualAvgCommission;
      });
      
      Object.keys(cityStats).forEach(function (cityKey) {
        var cs = cityStats[cityKey];
        var cityExpectedNdrRate = cs.ndrBaseOrders > 0 ? (cs.ndrDeliveredOrders / cs.ndrBaseOrders) : globalExpectedNdrRate;
        var cityFinancials = financialCore.calculate({
          mode: 'expected',
          netOrders: cs.count,
          actualDeliveredOrders: cs.deliveredOrders,
          actualEarnedProfitAfterTax: cs.earnedProfitAfterTax,
          netOrderProfitAfterTax: cs.deliveredOrders > 0 ? cs.totalPlacedCommission : null,
          currentTotalSales: cs.totalRevenue,
          expectedNdrRate: cityExpectedNdrRate,
          adSpend: 0
        });
        
        cs.actualDeliveredOrders = cs.deliveredOrders;
        cs.actualEarnedProfitAfterTax = cs.earnedProfitAfterTax;
        cs.expectedNdrRate = cityExpectedNdrRate;
        cs.rateSource = cs.ndrBaseOrders > 0 ? 'city' : (ndrBaseOrders > 0 ? 'global_fallback' : 'insufficient_history');
        cs.insufficientHistory = cs.ndrBaseOrders <= 0 && ndrBaseOrders <= 0;
        cs.expectedDeliveriesExact = cityFinancials.expectedDeliveriesExact;
        cs.expectedTotalProfitBeforeAdSpend = cityFinancials.expectedTotalProfitBeforeAdSpend;
        cs.expectedDeliveredSales = cityFinancials.expectedDeliveredSales;
        cs.deliveredOrders = cityFinancials.expectedDeliveriesDisplay;
        cs.earnedProfitAfterTax = cityFinancials.expectedTotalProfitBeforeAdSpend;
        cs.earnedCommission = cs.earnedProfitAfterTax;
        
        Object.keys(cs.productMap).forEach(function (cpKey) {
          var cp = cs.productMap[cpKey];
          var prod = productStats[cpKey];
          var prodExpectedNdrRate = (prod && prod.ndrBaseCount > 0) ? (prod.ndrDeliveredCount / prod.ndrBaseCount) : cityExpectedNdrRate;
          var cpFinancials = financialCore.calculate({
            mode: 'expected',
            netOrders: cp.orders,
            actualDeliveredOrders: cp.delivered,
            actualEarnedProfitAfterTax: cp.commission,
            netOrderProfitAfterTax: cp.delivered > 0 ? cp.totalPlacedCommission : null,
            currentTotalSales: cp.revenue,
            expectedNdrRate: prodExpectedNdrRate,
            adSpend: 0
          });
          cp.actualDelivered = cp.delivered;
          cp.actualCommission = cp.commission;
          cp.expectedDeliveriesExact = cpFinancials.expectedDeliveriesExact;
          cp.expectedTotalProfitBeforeAdSpend = cpFinancials.expectedTotalProfitBeforeAdSpend;
          cp.delivered = cpFinancials.expectedDeliveriesDisplay;
          cp.commission = cpFinancials.expectedTotalProfitBeforeAdSpend;
        });
      });
      
      Object.keys(productStats).forEach(function (prodKey) {
        var p = productStats[prodKey];
        var prodExpectedNdrRate = p.ndrBaseCount > 0 ? (p.ndrDeliveredCount / p.ndrBaseCount) : globalExpectedNdrRate;
        p.expectedNdrRate = prodExpectedNdrRate;
        p.expectedDrRate = p.ndrConfirmedCount > 0 ? (p.ndrDeliveredCount / p.ndrConfirmedCount) : globalExpectedDrRate;
        p.rateUsesGlobalFallback = p.ndrBaseCount <= 0 || p.ndrConfirmedCount <= 0;
        
        p.actualDeliveredCount = p.calculatorDeliveredCount;
        p.actualCommission = p.calculatorEarnedProfitAfterTax;
        p.actualDeliveredQty = p.deliveredQty;
        p.actualDeliveredSales = p.deliveredSales;
        p.actualNdrDeliveredCount = p.ndrDeliveredCount;

        var productFinancials = financialCore.calculate({
          mode: 'expected',
          netOrders: p.placedCount,
          actualDeliveredOrders: p.actualDeliveredCount,
          actualEarnedProfitAfterTax: p.actualCommission,
          netOrderProfitAfterTax: p.actualDeliveredCount > 0 ? p.totalPlacedCommission : null,
          actualDeliveredSales: p.actualDeliveredSales,
          currentTotalSales: p.revenue,
          expectedNdrRate: prodExpectedNdrRate,
          adSpend: 0
        });
        p.expectedDeliveriesExact = productFinancials.expectedDeliveriesExact;
        p.expectedTotalProfitBeforeAdSpend = productFinancials.expectedTotalProfitBeforeAdSpend;
        p.expectedDeliveredSales = productFinancials.expectedDeliveredSales;
        p.deliveredCount = productFinancials.expectedDeliveriesDisplay;
        p.commission = productFinancials.expectedTotalProfitBeforeAdSpend;
        p.deliveredSales = productFinancials.expectedDeliveredSales;
        p.deliveredQty = Math.round(p.qty * prodExpectedNdrRate);
        
        Object.keys(p.cityMap).forEach(function (pcmKey) {
          var pcm = p.cityMap[pcmKey];
          var pcmExpectedNdrRate = pcm.ndrBaseOrders > 0 ? (pcm.delivered / pcm.ndrBaseOrders) : prodExpectedNdrRate;
          var pcmFinancials = financialCore.calculate({
            mode: 'expected',
            netOrders: pcm.orders,
            actualDeliveredOrders: pcm.delivered,
            actualEarnedProfitAfterTax: pcm.commission,
            netOrderProfitAfterTax: pcm.delivered > 0 ? pcm.totalPlacedCommission : null,
            currentTotalSales: pcm.revenue,
            expectedNdrRate: pcmExpectedNdrRate,
            adSpend: 0
          });
          pcm.actualDelivered = pcm.delivered;
          pcm.actualCommission = pcm.commission;
          pcm.expectedDeliveriesExact = pcmFinancials.expectedDeliveriesExact;
          pcm.expectedTotalProfitBeforeAdSpend = pcmFinancials.expectedTotalProfitBeforeAdSpend;
          pcm.delivered = pcmFinancials.expectedDeliveriesDisplay;
          pcm.ndrDelivered = Math.round(pcm.ndrBaseOrders * pcmExpectedNdrRate);
          pcm.commission = pcmFinancials.expectedTotalProfitBeforeAdSpend;
          pcm.revenue = pcmFinancials.expectedDeliveredSales;
        });
      });
      
      Object.keys(campaignProductStats).forEach(function (cpKey) {
        var cp = campaignProductStats[cpKey];
        var cpExpectedNdrRate = cp.ndrBaseCount > 0 ? (cp.ndrDeliveredCount / cp.ndrBaseCount) : globalExpectedNdrRate;
        
        cp.expectedNdrRate = cpExpectedNdrRate;
        cp.expectedDrRate = cp.ndrConfirmedCount > 0 ? (cp.ndrDeliveredCount / cp.ndrConfirmedCount) : globalExpectedDrRate;
        cp.rateUsesGlobalFallback = cp.ndrBaseCount <= 0 || cp.ndrConfirmedCount <= 0;
        cp.actualDeliveredCount = cp.deliveredCount;
        cp.actualCommission = cp.commission;
        cp.actualDeliveredSales = cp.deliveredSales;
        var campaignFinancials = financialCore.calculate({
          mode: 'expected',
          netOrders: cp.placedCount,
          actualDeliveredOrders: cp.actualDeliveredCount,
          actualEarnedProfitAfterTax: cp.actualCommission,
          netOrderProfitAfterTax: cp.actualDeliveredCount > 0 ? cp.totalPlacedCommission : null,
          actualDeliveredSales: cp.actualDeliveredSales,
          currentTotalSales: cp.totalPlacedSales,
          expectedNdrRate: cpExpectedNdrRate,
          adSpend: 0
        });
        cp.expectedDeliveriesExact = campaignFinancials.expectedDeliveriesExact;
        cp.expectedTotalProfitBeforeAdSpend = campaignFinancials.expectedTotalProfitBeforeAdSpend;
        cp.expectedDeliveredSales = campaignFinancials.expectedDeliveredSales;
        cp.deliveredCount = campaignFinancials.expectedDeliveriesDisplay;
        cp.commission = campaignFinancials.expectedTotalProfitBeforeAdSpend;
        cp.deliveredSales = campaignFinancials.expectedDeliveredSales;
      });
    }


    var earnedSpark = [], incomingSpark = [], lostSpark = [], ordersSpark = [], gapSpark = [];
    var cumEarned = 0, cumIncoming = 0, cumLost = 0, cumOrders = 0, cumGap = 0;

    dayKeys.forEach(function (key) {
      var stat = dailyStats[key];
      cumEarned += stat.earned; cumIncoming += stat.incoming; cumLost += stat.lost;
      cumOrders += stat.orders; cumGap += Math.max(0, stat.codDue - stat.codCollected);
      earnedSpark.push(cumEarned); incomingSpark.push(cumIncoming); lostSpark.push(cumLost);
      ordersSpark.push(cumOrders); gapSpark.push(cumGap);
    });

    var midPoint = Math.floor(dayKeys.length / 2);
    var firstHalfOrders = 0, secondHalfOrders = 0;
    var firstHalfEarned = 0, secondHalfEarned = 0;
    var firstHalfIncoming = 0, secondHalfIncoming = 0;
    var firstHalfLost = 0, secondHalfLost = 0;
    dayKeys.forEach(function (key, idx) {
      var stat = dailyStats[key];
      if (idx < midPoint) {
        firstHalfOrders += stat.orders; firstHalfEarned += stat.earned;
        firstHalfIncoming += stat.incoming; firstHalfLost += stat.lost;
      } else {
        secondHalfOrders += stat.orders; secondHalfEarned += stat.earned;
        secondHalfIncoming += stat.incoming; secondHalfLost += stat.lost;
      }
    });

    var totalCommissionAll = meta.deliveredDateMode === 'expected'
      ? (earnedCommission || 1)
      : (earnedCommission + incomingCommission + lostCommission || 1);
    var healthEarnedPct = meta.deliveredDateMode === 'expected'
      ? (earnedCommission ? 100 : 0)
      : parseFloat(((earnedCommission / totalCommissionAll) * 100).toFixed(1));
    var healthIncomingPct = meta.deliveredDateMode === 'expected'
      ? 0
      : parseFloat(((incomingCommission / totalCommissionAll) * 100).toFixed(1));
    var healthLostPct = meta.deliveredDateMode === 'expected'
      ? 0
      : parseFloat((Math.max(0, 100 - healthEarnedPct - healthIncomingPct)).toFixed(1));
    var collectedSar = collected;
    // COD collection should describe money that can still be collected from
    // active pipeline orders. Failed/lost orders are tracked separately and
    // must not inflate the live collection gap.
    var expectedCodSar = collectedSar + incomingCodSar;
    totalDue = expectedCodSar;
    gapSar = incomingCodSar;
    var remaining = gapSar;
    var collectionRate = drBaseOrders > 0 ? parseFloat(((drDeliveredOrders / drBaseOrders) * 100).toFixed(1)) : 0;
    amountRepairReport.fillRate = amountRepairReport.totalMissing > 0
      ? parseFloat(((amountRepairReport.filledCount / amountRepairReport.totalMissing) * 100).toFixed(1))
      : 0;
    totalSalesRepairReport.fillRate = totalSalesRepairReport.totalMissing > 0
      ? parseFloat(((totalSalesRepairReport.filledCount / totalSalesRepairReport.totalMissing) * 100).toFixed(1))
      : 0;

    var overallAov = placedCount > 0 ? parseFloat((totalSales / placedCount).toFixed(2)) : 0;
    var deliveredAovBase = meta.deliveredDateMode === 'expected' && accountFinancials
      ? accountFinancials.expectedDeliveriesExact
      : deliveredCount;
    var deliveredAov = deliveredAovBase > 0 ? parseFloat((totalDeliveredSales / deliveredAovBase).toFixed(2)) : 0;

    function ensureHeavyResult() {
      if (buildHeavyStatsInMainLoop) return null;
      if (lazyHeavyResult) return lazyHeavyResult;
      lazyHeavyResult = runProcessPhase('process:heavy-models-lazy', { rows: rows.length }, function () {
        return processSnapshotRows(rows, accountId, Object.assign({}, meta, {
          __forceDashboardHeavyModels: true
        }));
      });
      return lazyHeavyResult;
    }

    function ensureCitiesResult() {
      if (buildCityStatsInMainLoop) return null;
      if (lazyCitiesResult) return lazyCitiesResult;
      lazyCitiesResult = runProcessPhase('process:cities-model-lazy', { rows: rows.length }, function () {
        return processSnapshotRows(rows, accountId, Object.assign({}, meta, {
          __forceDashboardCitiesModel: true
        }));
      });
      return lazyCitiesResult;
    }

    function ensureCitiesModel() {
      if (!buildCityStatsInMainLoop) {
        var citiesResult = ensureCitiesResult();
        return citiesResult && citiesResult.cod
          ? { cities: citiesResult.cod.cities || [], mapCities: citiesResult.cod.mapCities || [] }
          : { cities: [], mapCities: [] };
      }
      if (ensureCitiesModel.cache) return ensureCitiesModel.cache;
      return (ensureCitiesModel.cache = runProcessPhase('process:cities-model', { cities: Object.keys(cityStats).length }, function () {
    var sortedCities = Object.keys(cityStats).map(function (keyName) {
      var stat = cityStats[keyName];
      var displayName = stat.name || keyName;
      // T-09/T-10: Compute derived rates from extended fields
      var cityNdrBase = meta.deliveredDateMode === 'expected'
        ? (stat.ndrBaseOrders > 0 ? stat.ndrBaseOrders : ndrBaseOrders)
        : (stat.ndrBaseOrders || stat.count);
      var cityNdrDelivered = meta.deliveredDateMode === 'expected' && stat.ndrBaseOrders <= 0
        ? ndrDeliveredOrders
        : (stat.ndrDeliveredOrders != null ? stat.ndrDeliveredOrders : stat.deliveredOrders);
      var ndrPctCity = meta.deliveredDateMode === 'expected' && stat.expectedNdrRate !== undefined
        ? parseFloat((stat.expectedNdrRate * 100).toFixed(1))
        : netDeliveryRatePct(cityNdrDelivered, cityNdrBase);
      if (Number(stat.deliveredOrders || 0) <= 0) ndrPctCity = 0;
      var drPctCity = stat.drBaseOrders > 0
        ? parseFloat(((stat.drDeliveredOrders / stat.drBaseOrders) * 100).toFixed(1))
        : 0;
      var prepaidPctCity = stat.count > 0
        ? parseFloat(((stat.prepaidCount / stat.count) * 100).toFixed(1))
        : 0;
      var codPctCity = stat.count > 0
        ? parseFloat(((stat.codCount / stat.count) * 100).toFixed(1))
        : 0;
      var avgOrderValue = stat.count > 0
        ? parseFloat((stat.totalRevenue / stat.count).toFixed(2))
        : 0;
      var avgDeliveryDays = stat.deliveryDays.length
        ? parseFloat((stat.deliveryDays.reduce(function (sum, value) { return sum + value; }, 0) / stat.deliveryDays.length).toFixed(1))
        : null;
      stat.ndrPct = ndrPctCity;
      stat.drPct = drPctCity;
      var cityStatusRates = productStatusPercentages(
        stat.confirmationStatusCount,
        stat.cancelStatusCount,
        stat.pendingStatusCount,
        stat.statusTotalCount
      );
      stat.confirmedCount = stat.confirmationStatusCount;
      stat.confirmationPct = cityStatusRates.confirmationPct;
      stat.cancelPct = cityStatusRates.cancelPct;
      stat.pendingPct = cityStatusRates.pendingPct;
      stat.prepaidPct = prepaidPctCity;
      stat.codPct = codPctCity;
      stat.avgOrderValue = avgOrderValue;
      stat.netOrderCount = stat.count;
      var cityAverageDelivered = stat.actualDeliveredOrders !== undefined ? stat.actualDeliveredOrders : stat.deliveredOrders;
      var cityAverageProfit = stat.actualEarnedProfitAfterTax !== undefined ? stat.actualEarnedProfitAfterTax : stat.earnedProfitAfterTax;
      stat.averageProfitSource = cityAverageDelivered > 0
        ? 'delivered_orders'
        : (stat.count > 0 ? 'net_orders_fallback' : 'unavailable');
      stat.averageProfit = cityAverageDelivered > 0
        ? parseFloat(((cityAverageProfit || 0) / cityAverageDelivered).toFixed(2))
        : (stat.count > 0 ? parseFloat(((stat.totalPlacedCommission || 0) / stat.count).toFixed(2)) : 0);
      stat.avgDeliveryDays = avgDeliveryDays;
      stat.deliveryDurationOrders = stat.deliveryDays.length;
      var cityAccountBreakdown = Object.keys(stat.accountMap || {}).map(function (accountKey) {
        var account = stat.accountMap[accountKey];
        var accountNdrBase = account.ndrBaseOrders || account.orders || 0;
        return {
          accountId: account.accountId,
          accountLabel: account.accountLabel || account.accountId,
          orders: account.orders || 0,
          delivered: account.delivered || 0,
          ndrPct: netDeliveryRatePct(account.ndrDeliveredOrders || 0, accountNdrBase),
          earnedProfitAfterTax: roundMoney(
            account.earnedProfitAfterTax != null ? account.earnedProfitAfterTax : account.commission || 0
          ),
          commission: roundMoney(
            account.earnedProfitAfterTax != null ? account.earnedProfitAfterTax : account.commission || 0
          ),
          deliveredSales: roundMoney(account.deliveredSales || 0)
        };
      }).sort(function (a, b) {
        return (b.orders - a.orders) || String(a.accountLabel || '').localeCompare(String(b.accountLabel || ''));
      });
      stat.accountBreakdown = cityAccountBreakdown;
      return {
        // Existing fields
        key: keyName, name: displayName, country: effectiveCountry(stat.country, meta, 'sa'),
        due: stat.due, collected: stat.collected, gap: stat.gap, sar: stat.gap,
        count: stat.count, netOrderCount: stat.count, statusTotalCount: stat.statusTotalCount,
        confirmationStatusCount: stat.confirmationStatusCount,
        cancelStatusCount: stat.cancelStatusCount,
        pendingStatusCount: stat.pendingStatusCount,
        confirmationPct: stat.confirmationPct,
        cancelPct: stat.cancelPct,
        pendingPct: stat.pendingPct,
        ndrBaseOrders: cityNdrBase, deliveredOrders: stat.deliveredOrders, ndrDeliveredOrders: cityNdrDelivered, drBaseOrders: stat.drBaseOrders,
        drDeliveredOrders: stat.drDeliveredOrders,
        pct: drPctCity,
        // T-06: Province
        provinceId: stat.provinceId,
        // T-09: Financial
        totalRevenue: stat.totalRevenue, avgOrderValue: avgOrderValue,
        earnedProfitAfterTax: stat.earnedProfitAfterTax != null ? stat.earnedProfitAfterTax : stat.earnedCommission,
        earnedCommission: stat.earnedProfitAfterTax != null ? stat.earnedProfitAfterTax : stat.earnedCommission,
        actualDeliveredOrders: stat.actualDeliveredOrders !== undefined ? stat.actualDeliveredOrders : stat.deliveredOrders,
        actualEarnedProfitAfterTax: stat.actualEarnedProfitAfterTax !== undefined ? stat.actualEarnedProfitAfterTax : stat.earnedProfitAfterTax,
        expectedDeliveriesExact: stat.expectedDeliveriesExact !== undefined ? stat.expectedDeliveriesExact : stat.deliveredOrders,
        expectedTotalProfitBeforeAdSpend: stat.expectedTotalProfitBeforeAdSpend !== undefined ? stat.expectedTotalProfitBeforeAdSpend : stat.earnedProfitAfterTax,
        expectedDeliveredSales: stat.expectedDeliveredSales !== undefined ? stat.expectedDeliveredSales : 0,
        averageProfit: stat.averageProfit,
        incomingCommission: stat.incomingCommission,
        lostCommission: stat.lostCommission,
        // T-09: Delivery counters
        canceledCount: stat.canceledCount, shippingCount: stat.shippingCount,
        confirmedCount: stat.confirmedCount, processingCount: stat.processingCount,
        confirmationPct: stat.confirmationPct,
        ndrPct: ndrPctCity, drPct: drPctCity,
        expectedNdrRate: stat.expectedNdrRate !== undefined ? stat.expectedNdrRate : (cityNdrBase > 0 ? cityNdrDelivered / cityNdrBase : 0),
        rateSource: stat.rateSource || 'actual',
        insufficientHistory: !!stat.insufficientHistory,
        avgDeliveryDays: avgDeliveryDays, deliveryDurationOrders: stat.deliveryDays.length,
        // T-10: Prepaid/COD
        prepaidCount: stat.prepaidCount, codCount: stat.codCount,
        prepaidDeliveredCount: stat.prepaidDeliveredCount, codDeliveredCount: stat.codDeliveredCount,
        prepaidCanceledCount: stat.prepaidCanceledCount, codCanceledCount: stat.codCanceledCount,
        prepaidNdrBaseOrders: stat.prepaidNdrBaseOrders, codNdrBaseOrders: stat.codNdrBaseOrders,
        prepaidDrBaseOrders: stat.prepaidDrBaseOrders, codDrBaseOrders: stat.codDrBaseOrders,
        prepaidDrDeliveredOrders: stat.prepaidDrDeliveredOrders, codDrDeliveredOrders: stat.codDrDeliveredOrders,
        prepaidPct: prepaidPctCity, codPct: codPctCity,
        // T-12: Product map reference
        productMap: stat.productMap,
        accountBreakdown: cityAccountBreakdown
      };
    }).sort(function (a, b) { return b.gap - a.gap; });

    var coords = {
      'الرياض': { x: 230.6, y: 164.1 }, 'جدة': { x: 87.1, y: 232.2 },
      'الدمام': { x: 294.7, y: 129.4 }, 'مكة': { x: 99.1, y: 233.5 },
      'مكة المكرمة': { x: 99.1, y: 233.5 }, 'المدينة': { x: 95.1, y: 170.5 },
      'المدينة المنورة': { x: 95.1, y: 170.5 }
    };
    var fallbackCoords = [{ x: 150, y: 180 }, { x: 200, y: 220 }, { x: 120, y: 140 }, { x: 250, y: 100 }, { x: 180, y: 130 }];
    var topCollectedCities = sortedCities.slice().sort(function (a, b) {
      return (b.collected || 0) - (a.collected || 0);
    });
    var mapCities = topCollectedCities.slice(0, 5).map(function (city, idx) {
      var dot = window.TaagerGeo && typeof window.TaagerGeo.cityPoint === 'function'
        ? window.TaagerGeo.cityPoint(city.name, effectiveCountry(city.country, meta, 'sa'), idx)
        : (coords[city.name] || fallbackCoords[idx] || { x: 150, y: 150 });
      return Object.assign({}, city, { x: dot.x, y: dot.y, sar: city.collected || 0 });
    });
    return { cities: sortedCities, mapCities: mapCities };
      }));
    }

    // T-18: Compute national KPI baselines for geo layer (moved up for product scaling score)
    var nationalNdr = parseFloat(netDeliveryRate(ndrDeliveredOrders, ndrBaseOrders).toFixed(4));
    var nationalDr = drBaseOrders > 0
      ? parseFloat((drDeliveredOrders / drBaseOrders).toFixed(4))
      : 0;
    var nationalPrepaidPct = placedCount > 0
      ? parseFloat((totalPrepaidCount / placedCount).toFixed(4))
      : 0;
    var taagerProfitAfterTax = meta.deliveredDateMode === 'expected'
      ? earnedCommission
      : earnedCommission + incomingCommission + lostCommission;
    var avgCommission = actualAvgCommission;

    var nationalAverages = {
      ndr: nationalNdr,
      dr:  nationalDr,
      prepaidPct: nationalPrepaidPct,
      averageProfit: avgCommission,
      avgCommission: avgCommission,
      averageProfitSource: averageProfitSource,
      taagerProfitAfterTax: taagerProfitAfterTax,
      avgOrderValue: placedCount > 0
        ? parseFloat((totalSales / placedCount).toFixed(2))
        : 0
    };

    var totalPiecesAll = buildProductStatsInMainLoop
      ? Object.keys(productStats).reduce(function (sum, key) {
        return sum + productStats[key].qty;
      }, 0)
      : 0;

    function computeRankedProducts() {
      return runProcessPhase('process:products-model', { products: Object.keys(productStats).length }, function () {
    return Object.keys(productStats).filter(function (key) {
      return Number(productStats[key].placedCount || 0) > 0;
    }).map(function (key) {
      var p = productStats[key];
      var total = p.placedCount || 1;

      var statusTotal = p.statusTotalCount !== undefined ? p.statusTotalCount : (p.placedCount || 0);
      var statusRates = productStatusPercentages(
        p.confirmationStatusCount,
        p.cancelStatusCount,
        p.pendingStatusCount,
        statusTotal
      );
      var confirmationPct = statusRates.confirmationPct;
      var cancelPct = statusRates.cancelPct;
      var pendingPct = statusRates.pendingPct;

      var expectedRateMode = meta.deliveredDateMode === 'expected';
      var productUsesGlobalNdr = expectedRateMode && p.ndrBaseCount <= 0;
      var productUsesGlobalDr = expectedRateMode && p.ndrConfirmedCount <= 0;
      var productNdrBase = productUsesGlobalNdr ? ndrBaseOrders : (expectedRateMode ? p.ndrBaseCount : p.placedCount);
      var confirmationBase = productUsesGlobalDr ? drBaseOrders : (expectedRateMode ? p.ndrConfirmedCount : p.confirmedCount);
      var productNdrDelivered = productUsesGlobalNdr ? ndrDeliveredOrders : (expectedRateMode ? p.ndrDeliveredCount : p.deliveredCount);
      var productDrDelivered = productUsesGlobalDr ? drDeliveredOrders : (expectedRateMode ? p.ndrDeliveredCount : p.deliveredCount);
      var ndrPct = p.deliveredCount > 0
        ? boundedProductRatePct(productNdrDelivered, productNdrBase, key + ':ndr')
        : 0;
      var deliveryPct = boundedProductRatePct(p.deliveredCount, p.placedCount, key + ':display-delivery');
      var productDeliveredAovBase = p.expectedDeliveriesExact !== undefined ? p.expectedDeliveriesExact : p.deliveredCount;
      var productDeliveredAov = productDeliveredAovBase > 0
        ? parseFloat((p.deliveredSales / productDeliveredAovBase).toFixed(2))
        : 0;
      var productActualDelivered = p.actualDeliveredCount !== undefined ? p.actualDeliveredCount : p.calculatorDeliveredCount;
      var productActualCommission = p.actualCommission !== undefined ? p.actualCommission : p.calculatorEarnedProfitAfterTax;
      var productActualAverageProfit = productActualDelivered > 0 ? productActualCommission / productActualDelivered : 0;

      var activeTotal = confirmationBase;
      var drPct = boundedProductRatePct(productDrDelivered, activeTotal, key + ':dr');

      var productCities = null;
      function getProductCities() {
        if (productCities) return productCities;
        productCities = Object.keys(p.cityMap)
        .map(function (c) {
          var cm = p.cityMap[c];
          // T-11: cm is now a full object {orders, delivered, canceled, commission, revenue, ...}
          var cityOrders    = cm.orders    !== undefined ? cm.orders    : cm; // backward-compat guard
          var cityDelivered = cm.delivered !== undefined ? cm.delivered : 0;
          var cityNdrDelivered = cm.ndrDelivered !== undefined ? cm.ndrDelivered : cityDelivered;
          var cityCanceled  = cm.canceled  !== undefined ? cm.canceled  : 0;
          var cityConfirmed = cm.confirmationStatusCount !== undefined ? cm.confirmationStatusCount : (cm.confirmed || 0);
          var cityBase = cm.ndrBaseOrders || cityOrders || 0;
          var cityStatusTotal = cm.statusTotalCount || cityOrders || 0;
          var cityNetOrders = typeof cityOrders === 'object' ? cityOrders.orders || 0 : cityOrders;
          var cityStatusRates = productStatusPercentages(
            cityConfirmed,
            cm.cancelStatusCount || 0,
            cm.pendingStatusCount || 0,
            cityStatusTotal
          );
          return {
            key:       c,
            name:      cm.name || c,
            country:   effectiveCountry(cm.country, meta, 'sa'),
            count:     cityStatusTotal,
            netOrderCount: cityNetOrders,
            confirmed: cityConfirmed,
            confirmationStatusCount: cityConfirmed,
            cancelStatusCount: cm.cancelStatusCount || 0,
            pendingStatusCount: cm.pendingStatusCount || 0,
            statusTotalCount: cityStatusTotal,
            confirmationPct: cityStatusRates.confirmationPct,
            cancelPct: cityStatusRates.cancelPct,
            pendingPct: cityStatusRates.pendingPct,
            delivered: cityDelivered,
            canceled:  cityCanceled,
            ndr:       cityDelivered > 0 ? netDeliveryRatePct(cityNdrDelivered, cityBase) : 0,
            commission: cm.commission || 0,
            revenue:    cm.revenue    || 0
          };
        })
        .sort(function (a, b) { return b.count - a.count; })
        .slice(0, 5);
        return productCities;
      }

      var piecesBreakdown = null;
      function getPiecesBreakdown() {
        if (piecesBreakdown) return piecesBreakdown;
        piecesBreakdown = Object.keys(p.piecesMap)
        .map(function (k) {
          var entry = p.piecesMap[k];
          var qtyCount = typeof entry === 'object' ? entry.count || 0 : entry;
          var qtyDelivered = typeof entry === 'object' ? entry.delivered || 0 : 0;
          var qtyConfirmed = typeof entry === 'object' ? (entry.confirmationStatusCount != null ? entry.confirmationStatusCount : (entry.confirmed || 0)) : 0;
          var qtyStatusTotal = typeof entry === 'object' ? (entry.statusTotalCount || qtyCount || 0) : qtyCount;
          var qtyStatusRates = productStatusPercentages(
            qtyConfirmed,
            typeof entry === 'object' ? (entry.cancelStatusCount || 0) : 0,
            typeof entry === 'object' ? (entry.pendingStatusCount || 0) : 0,
            qtyStatusTotal
          );
          return {
            qty: k,
            count: qtyStatusTotal,
            netOrderCount: qtyCount,
            confirmed: qtyConfirmed,
            statusTotalCount: qtyStatusTotal,
            confirmationStatusCount: qtyConfirmed,
            cancelStatusCount: typeof entry === 'object' ? (entry.cancelStatusCount || 0) : 0,
            pendingStatusCount: typeof entry === 'object' ? (entry.pendingStatusCount || 0) : 0,
            confirmationPct: qtyStatusRates.confirmationPct,
            cancelPct: qtyStatusRates.cancelPct,
            pendingPct: qtyStatusRates.pendingPct,
            delivered: qtyDelivered,
            ndr: netDeliveryRatePct(qtyDelivered, qtyCount)
          };
        })
        .sort(function (a, b) { return Number(a.qty) - Number(b.qty); });
        return piecesBreakdown;
      }

      var quantityCityBreakdown = null;
      function getQuantityCityBreakdown() {
        if (quantityCityBreakdown) return quantityCityBreakdown;
        quantityCityBreakdown = Object.keys(p.quantityCityMap)
        .map(function (qtyKey) {
          return {
            qty: qtyKey,
            cities: Object.keys(p.quantityCityMap[qtyKey])
              .map(function (cityName) {
                var entry = p.quantityCityMap[qtyKey][cityName];
                var qcCount = typeof entry === 'object' ? (entry.count || 0) : entry;
                var qcConfirmed = typeof entry === 'object' ? (entry.confirmationStatusCount != null ? entry.confirmationStatusCount : (entry.confirmed || 0)) : 0;
                var qcStatusTotal = typeof entry === 'object' ? (entry.statusTotalCount || qcCount || 0) : qcCount;
                var qcStatusRates = productStatusPercentages(
                  qcConfirmed,
                  typeof entry === 'object' ? (entry.cancelStatusCount || 0) : 0,
                  typeof entry === 'object' ? (entry.pendingStatusCount || 0) : 0,
                  qcStatusTotal
                );
                return {
                  name: cityName,
                  count: qcStatusTotal,
                  netOrderCount: qcCount,
                  statusTotalCount: qcStatusTotal,
                  confirmed: qcConfirmed,
                  confirmationStatusCount: qcConfirmed,
                  cancelStatusCount: typeof entry === 'object' ? (entry.cancelStatusCount || 0) : 0,
                  pendingStatusCount: typeof entry === 'object' ? (entry.pendingStatusCount || 0) : 0,
                  confirmationPct: qcStatusRates.confirmationPct,
                  cancelPct: qcStatusRates.cancelPct,
                  pendingPct: qcStatusRates.pendingPct,
                  delivered: typeof entry === 'object' ? (entry.delivered || 0) : 0,
                  ndr: netDeliveryRatePct(typeof entry === 'object' ? (entry.delivered || 0) : 0, qcCount)
                };
              })
              .sort(function (a, b) { return b.count - a.count; })
              .slice(0, 5)
          };
        })
        .sort(function (a, b) { return Number(a.qty) - Number(b.qty); });
        return quantityCityBreakdown;
      }

      var productPrepaidCount = 0;
      Object.keys(p.cityMap).forEach(function(c) {
          productPrepaidCount += (p.cityMap[c].prepaidCount || 0);
      });
      var productPrepaidPct = total > 0 ? parseFloat((productPrepaidCount / total * 100).toFixed(1)) : 0;
      var scaleScore = typeof window.computeScalingScore === 'function' ? window.computeScalingScore({
        drPct: drPct,
        count: p.placedCount,
        prepaidPct: productPrepaidPct
      }, nationalAverages) : 0;
      var productAccountBreakdown = null;
      function getProductAccountBreakdown() {
        if (productAccountBreakdown) return productAccountBreakdown;
        productAccountBreakdown = Object.keys(p.accountMap || {}).map(function (accountKey) {
        var account = p.accountMap[accountKey];
        var accountNdrBase = account.ndrBaseOrders || account.orders || 0;
        return {
          accountId: account.accountId,
          accountLabel: account.accountLabel || account.accountId,
          orders: account.orders || 0,
          delivered: account.delivered || 0,
          ndrPct: netDeliveryRatePct(account.ndrDeliveredOrders || 0, accountNdrBase),
          commission: roundMoney(account.commission || 0),
          deliveredSales: roundMoney(account.deliveredSales || 0)
        };
      }).sort(function (a, b) {
        return (b.orders - a.orders) || String(a.accountLabel || '').localeCompare(String(b.accountLabel || ''));
      });
        return productAccountBreakdown;
      }

      return {
        key: key,
        sku: p.sku,
        name: p.name,
        units: p.deliveredCount,
        pieces: p.deliveredQty,
        placedCount: p.placedCount,
        netOrderCount: p.placedCount,
        totalOrderCount: p.totalOrderCount || p.placedCount,
        firstOrderCreatedAt: p.firstOrderCreatedAt || '',
        statusTotalCount: p.statusTotalCount !== undefined ? p.statusTotalCount : p.placedCount,
        qty: p.qty,
        revenue: p.revenue,
        commission: p.commission,
        deliveredSales: p.deliveredSales,
        deliveredAov: productDeliveredAov,
        deliveredCount: p.deliveredCount,
        actualDeliveredCount: productActualDelivered,
        actualCommission: productActualCommission,
        actualEarnedProfitAfterTax: productActualCommission,
        actualAverageProfit: productActualAverageProfit,
        actualAverageProfitSource: productActualDelivered > 0 ? 'delivered_orders' : 'unavailable',
        netOrderProfitAfterTax: p.totalPlacedCommission || 0,
        averageProfitSource: productActualDelivered > 0 ? 'delivered_orders' : 'unavailable',
        actualDeliveredQty: p.actualDeliveredQty !== undefined ? p.actualDeliveredQty : p.deliveredQty,
        actualDeliveredSales: p.actualDeliveredSales !== undefined ? p.actualDeliveredSales : p.deliveredSales,
        expectedDeliveriesExact: p.expectedDeliveriesExact !== undefined ? p.expectedDeliveriesExact : p.deliveredCount,
        expectedTotalProfitBeforeAdSpend: p.expectedTotalProfitBeforeAdSpend !== undefined ? p.expectedTotalProfitBeforeAdSpend : p.commission,
        expectedDeliveredSales: p.expectedDeliveredSales !== undefined ? p.expectedDeliveredSales : p.deliveredSales,
        expectedNdrRate: p.expectedNdrRate !== undefined ? p.expectedNdrRate : (productNdrBase > 0 ? productNdrDelivered / productNdrBase : 0),
        ndrBaseOrders: productNdrBase,
        ndrDeliveredOrders: productNdrDelivered,
        drBaseOrders: activeTotal,
        drDeliveredOrders: productDrDelivered,
        rateMode: meta.deliveredDateMode === 'expected' ? 'historical_cohort' : 'actual',
        rateSource: productUsesGlobalNdr && ndrBaseOrders <= 0 ? 'insufficient_history' : (productUsesGlobalNdr || productUsesGlobalDr ? 'global_fallback' : 'product'),
        insufficientHistory: productUsesGlobalNdr && ndrBaseOrders <= 0,
        deliveryRate: deliveryPct,
        drRate: drPct,
        totalPieces:      p.qty,
        canceledCount:    p.canceledCount,
        canceledByYouCount: p.canceledByYouCount || p.canceledCount || 0,
        failedCount:      p.failedCount || p.realFailedCount || 0,
        confirmedCount:   p.confirmedCount,
        shippingCount:    p.shippingCount,
        processingCount:  p.processingCount,
        waitingCount:     p.waitingCount,
        outForDeliveryCount: p.outForDeliveryCount || 0,
        deliverySuspendedCount: p.deliverySuspendedCount || 0,
        awaitingShipmentCount: p.awaitingShipmentCount || 0,
        pendingCount:     p.pendingCount,
        confirmationStatusCount: p.confirmationStatusCount || 0,
        cancelStatusCount: p.cancelStatusCount || 0,
        pendingStatusCount: p.pendingStatusCount || 0,
        confirmationPct:  confirmationPct,
        cancelPct:        cancelPct,
        pendingPct:       pendingPct,
        ndrPct:           ndrPct,
        deliveryPct:      deliveryPct,
        scalingScore:     scaleScore,
        get accountBreakdown() { return getProductAccountBreakdown(); },
        get cityBreakdown() { return getProductCities(); },
        get piecesBreakdown() { return getPiecesBreakdown(); },
        get quantityCityBreakdown() { return getQuantityCityBreakdown(); }
      };
    // FIX: sort descending - highest deliveredCount first; commission as tiebreaker (b - a = desc); key as alphabetical tie-breaker
    }).sort(function (a, b) {
      return (b.deliveredCount - a.deliveredCount) || (b.commission - a.commission) || String(a.key || '').localeCompare(String(b.key || ''));
    });

      });
    }

    function ensureProductsModel() {
      if (!buildProductStatsInMainLoop) {
        if (!lazyProductsResult) {
          lazyProductsResult = runProcessPhase('process:products-model-lazy', { rows: rows.length }, function () {
            return processSnapshotRows(rows, accountId, Object.assign({}, meta, {
              __forceDashboardProductsModel: true
            }));
          });
        }
        return lazyProductsResult && lazyProductsResult.products
          ? {
            rankedList: lazyProductsResult.products.rankedList || [],
            uniqueProducts: Number(lazyProductsResult.products.summary && lazyProductsResult.products.summary.uniqueProducts) || 0,
            campaignList: []
          }
          : { rankedList: [], uniqueProducts: 0, campaignList: [] };
      }
      if (ensureProductsModel.cache) return ensureProductsModel.cache;
      var rankedProducts = computeRankedProducts();
      ensureProductsModel.cache = {
        uniqueProducts: Object.keys(productStats).length,
        rankedList: rankedProducts.map(function (p, idx) {
      return Object.assign({}, p, { rank: idx + 1, emoji: '📦' });
        })
      };
      return ensureProductsModel.cache;
    }

    function ensureCampaignProductStats() {
      if (buildCampaignStatsInMainLoop) return campaignProductStats;
      if (lazyCampaignProductStats) return lazyCampaignProductStats;
      return (lazyCampaignProductStats = runProcessPhase('process:campaign-row-loop', { rows: rows.length }, function () {
        var stats = {};
        var seen = {};
        rows.forEach(function (row, rowIndex) {
          var bucket = getStatusBucket(row.orderStatus || row.status);
          var exactBucket = exactStatusBucket(row);
          var productName = window.TaagerStatus ? window.TaagerStatus.productName(row) : (row.products || row.productName || row.product || '');
          var productKey = (row.sku || productName || '').toLowerCase();
          if (!productKey) return;

          var commissionVal = rowCommissionValue(row);
          var priceVal = rowTotalPrice(row);
          var shouldProcessSales = isRowCreatedInPeriod(row, meta.period) || isDeliveredRowInPeriod(row, meta.period, meta.deliveredDateMode || 'actual');
          if (shouldProcessSales && hasMissingTotalPrice(row)) {
            var priceLookupInfo = totalPriceLookup[amountLookupKey(row)];
            priceVal = priceLookupInfo && priceLookupInfo.amount > 0 ? priceLookupInfo.amount : 0;
          }

          var rowCountry = effectiveCountry(row.taagerCountry || row.country, meta, 'sa');
          var orderKey = orderOnlyKey(row, rowIndex);
          var ndrPeriodForRow = (meta.deliveredDateMode || 'actual') === 'expected' ? (meta.ndrPeriod || meta.period) : meta.period;
          var inCreatedPeriod = isRowCreatedInPeriod(row, meta.period);
          var inNdrCohortPeriod = isRowCreatedInPeriod(row, ndrPeriodForRow);
          var ndrEligible = window.TaagerStatus ? window.TaagerStatus.isEligibleForNdr(row.orderStatus || row.status) : !isNdrCanceledBucket(exactBucket);
          var inSelectedNdrBase = ndrEligible && inNdrCohortPeriod;
          var isDeliveredInPeriod = isDeliveredRowInPeriod(row, meta.period, meta.deliveredDateMode || 'actual');
          var isDeliveredInNdrCohort = bucket === 'delivered' && inNdrCohortPeriod;
          var rowIsCanceledByYou = isCanceledByYouBucket(exactBucket);
          var rowIsNetOrder = !rowIsCanceledByYou;
          var rowInConfirmedBase = inNdrCohortPeriod && rowIsNetOrder && !isConfirmedBaseExcludedBucket(exactBucket);
          var rowInBusinessConfirmedBase = inCreatedPeriod && rowIsNetOrder && !isConfirmedBaseExcludedBucket(exactBucket);
          var campaignProductKey = [
            String(row.accountId || meta.activeAccountId || ''),
            rowCountry,
            productKey
          ].join('|');
          if (!stats[campaignProductKey]) {
            stats[campaignProductKey] = {
              accountId: String(row.accountId || meta.activeAccountId || ''),
              country: rowCountry,
              currency: meta.reportingCurrency || meta.activeCurrency || 'SAR',
              sku: row.sku || '',
              name: productName || row.sku || raw('منتج غير معروف'),
              placedCount: 0,
              totalOrderCount: 0,
              statusTotalCount: 0,
              confirmationStatusCount: 0,
              cancelStatusCount: 0,
              pendingStatusCount: 0,
              deliveredCount: 0,
              ndrBaseCount: 0,
              ndrConfirmedCount: 0,
              ndrDeliveredCount: 0,
              confirmedCount: 0,
              canceledCount: 0,
              failedCount: 0,
              pendingCount: 0,
              shippingCount: 0,
              processingCount: 0,
              waitingCount: 0,
              commission: 0,
              deliveredSales: 0,
              totalPlacedSales: 0,
              totalPlacedCommission: 0
            };
          }
          var campaignProduct = stats[campaignProductKey];
          var campaignProductOrderKey = campaignProductKey + ':' + orderKey;
          if (inCreatedPeriod && addOnce(seen, 'campaignTotal:' + campaignProductOrderKey)) {
            campaignProduct.totalOrderCount++;
            if (rowIsCanceledByYou) campaignProduct.canceledCount++;
            else {
              campaignProduct.statusTotalCount++;
              var campaignGroup = productStatusGroup(exactBucket);
              if (campaignGroup === 'confirmation') campaignProduct.confirmationStatusCount++;
              else if (campaignGroup === 'cancel') campaignProduct.cancelStatusCount++;
              else campaignProduct.pendingStatusCount++;
            }
          }
          if (inCreatedPeriod && rowIsNetOrder && addOnce(seen, 'campaignPlaced:' + campaignProductOrderKey)) {
            campaignProduct.placedCount++;
            campaignProduct.totalPlacedCommission += commissionVal;
            if (rowInBusinessConfirmedBase) campaignProduct.confirmedCount++;
            if (isLostBucket(exactBucket)) campaignProduct.failedCount++;
            else if (isIncomingBucket(exactBucket)) {
              if (bucket === 'shipping') campaignProduct.shippingCount++;
              else if (bucket === 'processing') campaignProduct.processingCount++;
              else if (bucket === 'waiting') campaignProduct.waitingCount++;
              else if (bucket === 'pending') campaignProduct.pendingCount++;
            }
          }
          if (inCreatedPeriod && rowIsNetOrder && addOnce(seen, 'campaignPlacedSales:' + campaignProductKey + ':' + financialLineKey(row))) campaignProduct.totalPlacedSales += priceVal;
          if (inSelectedNdrBase && addOnce(seen, 'campaignNdr:' + campaignProductOrderKey)) campaignProduct.ndrBaseCount++;
          if (rowInConfirmedBase && addOnce(seen, 'campaignNdrConfirmed:' + campaignProductOrderKey)) campaignProduct.ndrConfirmedCount++;
          if (isDeliveredInNdrCohort && rowIsNetOrder && addOnce(seen, 'campaignNdrDelivered:' + campaignProductOrderKey)) campaignProduct.ndrDeliveredCount++;
          if (isDeliveredInPeriod && rowIsNetOrder && addOnce(seen, 'campaignDeliveredSales:' + campaignProductKey + ':' + financialLineKey(row))) campaignProduct.deliveredSales += priceVal;
          if (isDeliveredInPeriod && rowIsNetOrder && addOnce(seen, 'campaignDelivered:' + campaignProductOrderKey)) {
            campaignProduct.commission += commissionVal;
            campaignProduct.deliveredCount++;
          }
        });
        return stats;
      }));
    }

    function ensureCampaignModel() {
      if (ensureCampaignModel.cache) return ensureCampaignModel.cache;
      var campaignStats = ensureCampaignProductStats();
      return (ensureCampaignModel.cache = runProcessPhase('process:campaign-model', { products: Object.keys(campaignStats).length }, function () {
    return Object.keys(campaignStats).filter(function (key) {
      return Number(campaignStats[key].placedCount || 0) > 0;
    }).map(function (key) {
      var p = campaignStats[key];
      var expectedCampaignRateMode = meta.deliveredDateMode === 'expected';
      var campaignUsesGlobalNdr = expectedCampaignRateMode && p.ndrBaseCount <= 0;
      var campaignUsesGlobalDr = expectedCampaignRateMode && p.ndrConfirmedCount <= 0;
      var ndrBase = campaignUsesGlobalNdr ? ndrBaseOrders : (expectedCampaignRateMode ? p.ndrBaseCount : p.placedCount);
      var ndrDelivered = campaignUsesGlobalNdr ? ndrDeliveredOrders : (expectedCampaignRateMode ? p.ndrDeliveredCount : p.deliveredCount);
      var confirmed = campaignUsesGlobalDr ? drBaseOrders : (expectedCampaignRateMode ? p.ndrConfirmedCount : (p.confirmedCount || 0));
      var campaignDrDelivered = campaignUsesGlobalDr ? drDeliveredOrders : (expectedCampaignRateMode ? p.ndrDeliveredCount : p.deliveredCount);
      var statusTotal = p.statusTotalCount || p.placedCount || 0;
      var campaignStatusRates = productStatusPercentages(
        p.confirmationStatusCount,
        p.cancelStatusCount,
        p.pendingStatusCount,
        statusTotal
      );
      var campaignActualDelivered = p.actualDeliveredCount !== undefined ? p.actualDeliveredCount : p.deliveredCount;
      var campaignActualCommission = p.actualCommission !== undefined
        ? p.actualCommission
        : (p.actualEarnedProfitAfterTax !== undefined ? p.actualEarnedProfitAfterTax : p.commission);
      var campaignActualAverageProfit = campaignActualDelivered > 0
        ? campaignActualCommission / campaignActualDelivered
        : 0;
      return Object.assign({}, p, {
        key: key,
        orders: p.placedCount,
        netOrderCount: p.placedCount,
        delivered: p.deliveredCount,
        actualDeliveredCount: campaignActualDelivered,
        actualCommission: campaignActualCommission,
        actualEarnedProfitAfterTax: campaignActualCommission,
        actualAverageProfit: campaignActualAverageProfit,
        actualAverageProfitSource: campaignActualDelivered > 0 ? 'delivered_orders' : 'unavailable',
        actualDeliveredSales: p.actualDeliveredSales !== undefined ? p.actualDeliveredSales : p.deliveredSales,
        expectedDeliveriesExact: p.expectedDeliveriesExact !== undefined ? p.expectedDeliveriesExact : p.deliveredCount,
        expectedTotalProfitBeforeAdSpend: p.expectedTotalProfitBeforeAdSpend !== undefined ? p.expectedTotalProfitBeforeAdSpend : p.commission,
        expectedDeliveredSales: p.expectedDeliveredSales !== undefined ? p.expectedDeliveredSales : p.deliveredSales,
        expectedNdrRate: p.expectedNdrRate !== undefined ? p.expectedNdrRate : (ndrBase > 0 ? ndrDelivered / ndrBase : 0),
        confirmationPct: campaignStatusRates.confirmationPct,
        cancelPct: campaignStatusRates.cancelPct,
        pendingPct: campaignStatusRates.pendingPct,
        ndrPct: p.deliveredCount > 0 ? boundedProductRatePct(ndrDelivered, ndrBase, key + ':campaign-ndr') : 0,
        drPct: boundedProductRatePct(campaignDrDelivered, confirmed, key + ':campaign-dr'),
        ndrBaseOrders: ndrBase,
        ndrDeliveredOrders: ndrDelivered,
        drBaseOrders: confirmed,
        drDeliveredOrders: campaignDrDelivered,
        rateMode: meta.deliveredDateMode === 'expected' ? 'historical_cohort' : 'actual',
        rateSource: campaignUsesGlobalNdr && ndrBaseOrders <= 0 ? 'insufficient_history' : (campaignUsesGlobalNdr || campaignUsesGlobalDr ? 'global_fallback' : 'product'),
        insufficientHistory: campaignUsesGlobalNdr && ndrBaseOrders <= 0
      });
    }).sort(function (a, b) {
      return (b.placedCount - a.placedCount) || (b.commission - a.commission) || String(a.key || '').localeCompare(String(b.key || ''));
    });
      }));
    }

    function generatePeriodData(daysBack, field) {
      field = field || 'earned';
      var period = [];
      var startIdx = Math.max(0, dayKeys.length - daysBack);
      for (var i = startIdx; i < dayKeys.length; i++) {
        var key = dayKeys[i];
        period.push({ d: labelForDayKey(key), v: dailyStats[key][field] });
      }
      return period;
    }

    var activeDays = dayKeys.filter(function (key) {
      return dailyStats[key].orders > 0 || dailyStats[key].earned > 0;
    }).length || 1;
    var dailyAvg = parseFloat((earnedCommission / activeDays).toFixed(2));
    var avgDays = deliveryDays.length
      ? parseFloat((deliveryDays.reduce(function (sum, n) { return sum + n; }, 0) / deliveryDays.length).toFixed(1))
      : null;
    // NDR = delivered / (created orders - canceled-status orders).
    var ndrPct = netDeliveryRatePct(ndrDeliveredOrders, ndrBaseOrders);
    // Keep the account calculator on the unrounded ratio. Other dashboard
    // surfaces intentionally continue to use the compact one-decimal value.
    var ndrPctExact = netDeliveryRate(ndrDeliveredOrders, ndrBaseOrders) * 100;
    var statusGroupCounts = { confirmation: 0, cancel: 0, pending: 0 };
    Object.keys(statusCounts).forEach(function (statusBucketKey) {
      var statusGroup = productStatusGroup(statusBucketKey);
      statusGroupCounts[statusGroup] = (statusGroupCounts[statusGroup] || 0) + Number(statusCounts[statusBucketKey] || 0);
    });
    var statusGroupRates = productStatusPercentages(
      statusGroupCounts.confirmation,
      statusGroupCounts.cancel,
      statusGroupCounts.pending,
      placedCount
    );
    var confirmationPct = statusGroupRates.confirmationPct;
    var drPct = drBaseOrders > 0 ? parseFloat(((drDeliveredOrders / drBaseOrders) * 100).toFixed(1)) : 0;

    // National KPIs moved up before rankedProducts

    function ensureGeoModel() {
      if (!buildHeavyStatsInMainLoop && !buildCityStatsInMainLoop) {
        var citiesResult = ensureCitiesResult();
        return citiesResult && citiesResult.geo
          ? {
            geoProductMap: citiesResult.geo.geoProductMap || null,
            provinceMap: citiesResult.geo.provinceMap || null,
            prepaidIntelligence: citiesResult.geo.prepaidIntelligence || null,
            insights: citiesResult.geo.insights || [],
            kpis: citiesResult.geo.kpis || nationalAverages
          }
          : { geoProductMap: null, provinceMap: null, prepaidIntelligence: null, insights: [], kpis: nationalAverages };
      }
      if (ensureGeoModel.cache) return ensureGeoModel.cache;
      return (ensureGeoModel.cache = runProcessPhase('process:geo-model', {
        cities: Object.keys(cityStats).length,
        products: Object.keys(productStats).length
      }, function () {
        var geoProductMap = null, provinceMap = null, prepaidIntelligence = null, geoInsights = [];
        if (typeof window.buildGeoProductMap === 'function') {
          try {
            var geoResult = window.buildGeoProductMap(cityStats, productStats, nationalAverages, meta);
            geoProductMap       = geoResult.geoProductMap   || null;
            provinceMap         = geoResult.provinceMap     || null;
            prepaidIntelligence = geoResult.prepaidIntelligence || null;
          } catch (geoErr) {
            console.warn('[Dashboard][geo] buildGeoProductMap failed:', geoErr);
          }
        }
        if (typeof window.runInsightEngine === 'function' && geoProductMap) {
          try {
            geoInsights = window.runInsightEngine(
              { cityStats: cityStats, productStats: productStats, geoProductMap: geoProductMap, provinceMap: provinceMap, kpis: nationalAverages },
              THRESHOLDS
            ) || [];
          } catch (insightErr) {
            console.warn('[Dashboard][geo] runInsightEngine failed:', insightErr);
          }
        }
        return {
          geoProductMap: geoProductMap,
          provinceMap: provinceMap,
          prepaidIntelligence: prepaidIntelligence,
          insights: geoInsights,
          kpis: nationalAverages
        };
      }));
    }
    // ---------------------------------------------------------------------------

    var savedRoiSettings = null;
    try {
      var roiJSON = localStorage.getItem('taager_roi_settings_' + accountId);
      if (roiJSON) savedRoiSettings = JSON.parse(roiJSON);
    } catch (e) {
      console.warn('Error reading ROI settings from local storage:', e);
    }
    var roiAdSpendRaw = Number(savedRoiSettings && savedRoiSettings.adSpend);
    var nativeCurrency = meta.activeCurrency || (window.TaagerCurrency && window.TaagerCurrency.countryCurrency ? window.TaagerCurrency.countryCurrency(meta.activeCountry || 'sa') : 'SAR');
    var roiCurrencyRaw = String((savedRoiSettings && savedRoiSettings.currency) || nativeCurrency || 'SAR').toUpperCase();
    var roiEgpRateRaw = Number(savedRoiSettings && savedRoiSettings.egpRate);
    var roiAdSpend  = isFinite(roiAdSpendRaw) && roiAdSpendRaw >= 0 ? roiAdSpendRaw : 250;
    var roiCurrency = window.TaagerCurrency && window.TaagerCurrency.cleanCurrency
      ? window.TaagerCurrency.cleanCurrency(roiCurrencyRaw, nativeCurrency)
      : (['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'].indexOf(roiCurrencyRaw) !== -1 ? roiCurrencyRaw : nativeCurrency);
    var roiEgpRate  = isFinite(roiEgpRateRaw) && roiEgpRateRaw > 0 ? roiEgpRateRaw : 52;
    var failureRate   = placedCount > 0 ? percentOf(failedCount, placedCount) : 0;
    var activePipelineCount = pendingCount + confirmedCount + processingCount + waitingCount + shippingCount;
    var statusBreakdown = statusBreakdownFromCounts(statusCounts, Object.keys(statusCounts).reduce(function (sum, key) {
      return sum + Number(statusCounts[key] || 0);
    }, 0));
    var exactStatusSummary = orderedStatusFlow().map(function (info) {
      var row = statusFinancial(info.bucket);
      return Object.assign({}, row, {
        label: window.TaagerStatus && typeof window.TaagerStatus.display === 'function'
          ? window.TaagerStatus.display(info.bucket, { locale: window.dashboardI18n && window.dashboardI18n.isRtl && window.dashboardI18n.isRtl() ? 'ar' : 'en' })
          : row.label,
        order: info.order || row.order,
        color: info.color || row.color,
        businessGroup: info.businessGroup || row.businessGroup
      });
    });
    var pipelineStages = exactStatusSummary.map(function (row) {
      var totalForShare = row.businessGroup === 'excluded' ? rawTotalOrders : placedCount;
      var st = stage(
        row.bucket,
        row.label,
        row.count,
        totalForShare,
        row.color,
        row.businessGroup === 'excluded' ? 'Excluded from NDR' : null,
        null,
        row.businessGroup === 'excluded' ? 'visible only' : null,
        row.profitAfterTax
      );
      st.exactBucket = row.bucket;
      st.bucket = row.bucket;
      st.businessGroup = row.businessGroup;
      st.statusOrder = row.order;
      st.profitAfterTax = roundMoney(row.profitAfterTax);
      st.codSar = roundMoney(row.cod);
      st.salesSar = roundMoney(row.sales);
      st.isExcluded = row.businessGroup === 'excluded';
      return st;
    });
    var lostBreakdown = exactStatusSummary.filter(function (row) {
      return row.businessGroup === 'lost';
    }).map(function (row) {
      return {
        id: row.bucket,
        bucket: row.bucket,
        label: row.label,
        count: row.count,
        value: roundMoney(row.profitAfterTax),
        sar: roundMoney(row.profitAfterTax),
        pct: formatPct(row.count, failedCount || 0),
        share: percentOf(row.count, failedCount || 0),
        color: row.color
      };
    });
    var previousOverview = overviewMetricSummary(
      meta.previousRows || [],
      meta.previousPeriod || null,
      meta.deliveredDateMode || 'actual'
    );
    var deliveredSalesInRoiCurrency = convertDashboardCurrency(totalDeliveredSales, meta.reportingCurrency || meta.activeCurrency || 'SAR', roiCurrency, roiEgpRate, meta.exchangeRates);
    var previousDeliveredSalesInRoiCurrency = convertDashboardCurrency(previousOverview.totalDeliveredSales, meta.reportingCurrency || meta.activeCurrency || 'SAR', roiCurrency, roiEgpRate, meta.exchangeRates);
    var netRoas = roiAdSpend > 0 ? parseFloat((deliveredSalesInRoiCurrency / roiAdSpend).toFixed(4)) : 0;
    var previousNetRoas = roiAdSpend > 0 ? parseFloat((previousDeliveredSalesInRoiCurrency / roiAdSpend).toFixed(4)) : 0;
    accountFinancials = dashboardFinancials({
      mode: meta.deliveredDateMode === 'expected' ? 'expected' : 'actual',
      netOrders: placedCount,
      actualDeliveredOrders: actualDeliveredCount,
      actualEarnedProfitAfterTax: actualEarnedCommission,
      netOrderProfitAfterTax: totalPlacedCommission,
      actualDeliveredSales: actualTotalDeliveredSales,
      currentTotalSales: totalSales,
      expectedNdrRate: meta.deliveredDateMode === 'expected' ? globalExpectedNdrRate : (ndrPct / 100),
      adSpend: roiAdSpend
    });
    // Taager dashboard/status/NDR migration: dashboard rows are created-date based.
    var createdOrders = null;
    var outcomeOrders = null;
    function getCreatedOrders() {
      if (createdOrders === null) {
        createdOrders = orderLevelRows(
          displayRows.filter(function (row) { return !!row.__dashboardInCreatedPeriod; }),
          true
        );
      }
      return createdOrders;
    }
    function getOutcomeOrders() {
      if (outcomeOrders === null) {
        outcomeOrders = orderLevelRows(
          filterOutcomeOrders(displayRows, meta.period, meta.deliveredDateMode || 'actual'),
          true
        );
      }
      return outcomeOrders;
    }
    var orderSources = buildOrderSourceBreakdown(displayRows, meta, 30, { type: 'taager' });
    var platformSources = buildOrderSourceBreakdown(displayRows, meta, 30, {
      type: 'platform',
      skipMissing: true,
      sourceValue: platformSourceRawValue,
      unknownLabel: raw('Unknown platform')
    });

    var pmTotalCount = totalPrepaidCount + totalCodCount;
    var codVal = pmTotalCount > 0 ? parseFloat(((totalCodCount / pmTotalCount) * 100).toFixed(1)) : 0;
    var prepaidVal = pmTotalCount > 0 ? parseFloat(((totalPrepaidCount / pmTotalCount) * 100).toFixed(1)) : 0;
    var calculatedPayMethods = pmTotalCount > 0 ? [
      { label: 'الدفع عند الاستلام', value: codVal, color: '#00e676' },
      { label: 'دفع مسبق', value: prepaidVal, color: '#3b82f6' }
    ] : [];
    meta.processPhaseTimings = processPhaseTimings;
    meta.lazyHeavyModels = !buildHeavyStatsInMainLoop;
    meta.expectedNdrRateSource = expectedNdrRateSource;
    meta.expectedNdrFallbackUsed = expectedNdrFallbackUsed;
    meta.expectedNdrSelectedBaseOrders = expectedNdrSelectedBaseOrders;
    meta.expectedNdrSelectedDeliveredOrders = expectedNdrSelectedDeliveredOrders;

    return runProcessPhase('process:return-shape', null, function () {
    return {
      meta: meta,
      overview: {
        earnedCommission:   { value: earnedCommission,   delta: calcDelta(earnedCommission, previousOverview.earnedCommission),        unit: meta.activeCurrency || 'SAR', color: 'green'  },
        actualEarnedCommission: { value: actualEarnedCommission, unit: meta.activeCurrency || 'SAR', color: 'green' },
        expectedTotalProfitBeforeAdSpend: { value: accountFinancials.expectedTotalProfitBeforeAdSpend, unit: meta.activeCurrency || 'SAR', color: 'green' },
        expectedNetProfit: { value: accountFinancials.expectedNetProfit, unit: roiCurrency, color: accountFinancials.expectedNetProfit >= 0 ? 'green' : 'red' },
        incomingCommission: { value: incomingCommission, delta: calcDelta(incomingCommission, previousOverview.incomingCommission),    unit: meta.activeCurrency || 'SAR', color: 'orange' },
        lostCommission:     { value: lostCommission,     delta: calcDelta(lostCommission, previousOverview.lostCommission),            unit: meta.activeCurrency || 'SAR', color: 'red'    },
        totalOrders:        { value: placedCount, netOrderCount: placedCount, totalOrderCount: rawTotalOrders, rawValue: rawTotalOrders, canceledByYou: canceledByYouCount, delta: calcDelta(placedCount, previousOverview.totalOrders), unit: raw('طلب'), color: 'blue' },
        totalSales:          { value: totalSales,          delta: calcDelta(totalSales, previousOverview.totalSales),                   unit: meta.activeCurrency || 'SAR', color: 'green'  },
        overallAov:          { value: overallAov,          delta: calcDelta(overallAov, previousOverview.overallAov),                   unit: meta.activeCurrency || 'SAR', color: 'blue'   },
        totalDeliveredSales: { value: totalDeliveredSales, delta: calcDelta(totalDeliveredSales, previousOverview.totalDeliveredSales), unit: meta.activeCurrency || 'SAR', color: 'green'  },
        deliveredAov:        { value: deliveredAov,        delta: calcDelta(deliveredAov, previousOverview.deliveredAov),               unit: meta.activeCurrency || 'SAR', color: 'blue'   },
        confirmationRate:    { value: confirmationPct,     delta: calcDelta(confirmationPct, previousOverview.confirmationRate),        unit: '%',           color: 'blue'   },
        statusGroups: {
          total: placedCount,
          confirmation: { count: statusGroupCounts.confirmation, pct: statusGroupRates.confirmationPct },
          cancel: { count: statusGroupCounts.cancel, pct: statusGroupRates.cancelPct },
          pending: { count: statusGroupCounts.pending, pct: statusGroupRates.pendingPct }
        },
        ndrRate:             { value: ndrPct,              delta: calcDelta(ndrPct, previousOverview.ndrPct),                           unit: '%',           color: 'orange' },
        drRate:              { value: drPct,               delta: calcDelta(drPct, previousOverview.drPct),                             unit: '%',           color: 'blue'   },
        netRoas:             { value: netRoas,             delta: calcDelta(netRoas, previousNetRoas),                                  unit: 'x',           color: 'purple' },
        sparklines: { earned: earnedSpark, incoming: incomingSpark, lost: lostSpark, orders: ordersSpark },
        health: {
          earned:   { pct: healthEarnedPct,   sar: earnedCommission   },
          incoming: { pct: healthIncomingPct, sar: incomingCommission },
          lost:     { pct: healthLostPct,     sar: lostCommission     }
        },
        lostBreakdown: lostBreakdown
      },
      pipeline: {
        metrics: {
          totalOrders: placedCount, totalDelivery: placedCount,
          netOrderCount: placedCount, totalOrderCount: rawTotalOrders,
          deliveredCount: ndrDeliveredOrders, failedCount: failedCount,
          businessTotalOrders: placedCount, businessDeliveredCount: deliveredCount,
          canceledByYouCount: canceledByYouCount,
          rawTotalOrders: rawTotalOrders,
          confirmedCount: statusGroupCounts.confirmation,
          confirmationStatusCount: statusGroupCounts.confirmation,
          cancelStatusCount: statusGroupCounts.cancel,
          pendingStatusCount: statusGroupCounts.pending,
          statusTotalCount: placedCount,
          statusCounts: statusCounts,
          statusGroups: {
            total: placedCount,
            confirmation: { count: statusGroupCounts.confirmation, pct: statusGroupRates.confirmationPct },
            cancel: { count: statusGroupCounts.cancel, pct: statusGroupRates.cancelPct },
            pending: { count: statusGroupCounts.pending, pct: statusGroupRates.pendingPct }
          },
          confirmationRate: confirmationPct,
          activeCount: activePipelineCount,
          deliveryRate: ndrPct, failureRate: failureRate, overallConversion: ndrPct,
          drPct: drPct
        },
        insights: null,
        statusBreakdown: statusBreakdown,
        statusSummary: exactStatusSummary,
        lostBreakdown: lostBreakdown,
        stages: pipelineStages,
        legacyStages: [
          stage('received',    'تم استلام الطلب', pendingCount,    placedCount, '#3b82f6', 'معدل التأكيد',  placedCount > 0 ? parseFloat((((placedCount - pendingCount) / placedCount) * 100).toFixed(1)) : 0),
          stage('confirmed',   'التأكيد',            statusGroupCounts.confirmation,  placedCount, '#3b82f6'),
          stage('processing',  'قيد المعالجة',    processingCount, placedCount, '#3b82f6'),
          stage('waiting',     'قيد الانتظار',    waitingCount,    placedCount, '#64748b'),
          stage('shipping',    'قيد الشحن',        shippingCount,   placedCount, '#f59e0b', null, null, null, incomingCommission),
          stage('delivered',   'تم التسليم',       deliveredCount,  placedCount, '#00e676', 'معدل التسليم', placedCount > 0 ? parseFloat(((deliveredCount / placedCount) * 100).toFixed(1)) : 0, 'من إجمالي الطلبات', earnedCommission),
          stage('failed',      'فشل',       failedCount,     placedCount, '#ef4444', 'نسبة الفشل',   placedCount > 0 ? parseFloat(((failedCount / placedCount) * 100).toFixed(1)) : 0, 'من إجمالي الطلبات', lostCommission),
          stage('canceled_by_you', 'ملغي بواسطتك', canceledByYouCount, rawTotalOrders, '#94a3b8', 'مستبعد من NDR', rawTotalOrders > 0 ? parseFloat(((canceledByYouCount / rawTotalOrders) * 100).toFixed(1)) : 0, 'ظاهر فقط ولا يدخل الحسابات')
        ]
      },
      statusBreakdown: statusBreakdown,
      statusSummary: exactStatusSummary,
      lostBreakdown: lostBreakdown,
      getCreatedOrders: getCreatedOrders,
      get orders() { return getCreatedOrders(); },
      getOutcomeOrders: getOutcomeOrders,
      get outcomeOrders() { return getOutcomeOrders(); },
      orderSources: orderSources,
      platformSources: platformSources,
      cod: {
        netOrderCount: placedCount,
        totalOrderCount: rawTotalOrders,
        totalDue: totalDue, collected: collectedSar, remaining: remaining,
        collectionRate: collectionRate, collectedSar: collectedSar,
        gapSar: gapSar, expectedCodSar: expectedCodSar,
        incomingCodSar: incomingCodSar, lostCodSar: lostCodSar, confirmedBaseCodSar: confirmedBaseCodSar,
        drPct: drPct,
        confirmationRate: confirmationPct,
        confirmationStatusCount: statusGroupCounts.confirmation,
        cancelStatusCount: statusGroupCounts.cancel,
        pendingStatusCount: statusGroupCounts.pending,
        statusTotalCount: placedCount,
        drDeliveredOrders: drDeliveredOrders,
        drBaseOrders: drBaseOrders, drActiveOrders: Math.max(0, drBaseOrders - drDeliveredOrders),
        prepaidDrBaseOrders: prepaidDrBaseOrders, prepaidDrDeliveredOrders: prepaidDrDeliveredOrders,
        codDrBaseOrders: codDrBaseOrders, codDrDeliveredOrders: codDrDeliveredOrders,
        globalPrepaidDr: prepaidDrBaseOrders > 0 ? parseFloat((prepaidDrDeliveredOrders / prepaidDrBaseOrders).toFixed(4)) : 0,
        globalCodDr: codDrBaseOrders > 0 ? parseFloat((codDrDeliveredOrders / codDrBaseOrders).toFixed(4)) : 0,
        ndrPct: ndrPct, ndrBaseOrders: ndrBaseOrders, amountRepairReport: amountRepairReport,
        ndrDeliveredOrders: ndrDeliveredOrders,
        totalSalesRepairReport: totalSalesRepairReport,
        avgDays: avgDays, gapDelta: calcDelta(secondHalfOrders * 12, firstHalfOrders * 12),
        daysDelta: 0, rateDelta: calcDelta(collectionRate, 50),
        gapSparkData: gapSpark,
        get cities() { return ensureCitiesModel().cities; },
        get mapCities() { return ensureCitiesModel().mapCities; },
        payMethods: calculatedPayMethods, deliveredCount: pmTotalCount,
        get totalCitiesCount() {
          return buildCityStatsInMainLoop ? Object.keys(cityStats).length : ensureCitiesModel().cities.length;
        }
      },
      products: {
        summary: {
          totalOrders: placedCount, netOrderCount: placedCount, totalOrderCount: rawTotalOrders, submitted: deliveredCount,
          confirmationRate: confirmationPct, drPct: drPct,
          totalComm: earnedCommission,
          get uniqueProducts() {
            return buildProductStatsInMainLoop ? Object.keys(productStats).length : ensureProductsModel().uniqueProducts;
          },
          get totalPieces() {
            return buildProductStatsInMainLoop
              ? totalPiecesAll
              : ensureProductsModel().rankedList.reduce(function (sum, product) {
                return sum + Number(product.totalPieces || product.qty || 0);
              }, 0);
          }
        },
        get rankedList() { return ensureProductsModel().rankedList; },
        get campaignList() { return ensureCampaignModel(); }
      },
      commissionTrend: {
        total: earnedCommission,
        totalDelta: calcDelta(secondHalfEarned, firstHalfEarned),
        periods: { '7': generatePeriodData(7, 'earned'), '14': generatePeriodData(14, 'earned'), '30': generatePeriodData(30, 'earned'), 'month': generatePeriodData(dayKeys.length, 'earned') },
        incomingPeriods: { '7': generatePeriodData(7, 'incoming'), '14': generatePeriodData(14, 'incoming'), '30': generatePeriodData(30, 'incoming'), 'month': generatePeriodData(dayKeys.length, 'incoming') },
        lostPeriods: { '7': generatePeriodData(7, 'lost'), '14': generatePeriodData(14, 'lost'), '30': generatePeriodData(30, 'lost'), 'month': generatePeriodData(dayKeys.length, 'lost') },
        ordersPeriods: { '7': generatePeriodData(7, 'orders'), '14': generatePeriodData(14, 'orders'), '30': generatePeriodData(30, 'orders'), 'month': generatePeriodData(dayKeys.length, 'orders') },
        benchmarks: {
          dailyAvg: dailyAvg,
          weekly: Math.round(dailyAvg * 7),
          last24h: Math.round(dailyStats[dayKeys[dayKeys.length - 1]].earned)
        },
        distribution: [
          { label: raw('الأسبوع الأول'),  value: dayKeys.slice(0, 7).reduce(function (s, k) { return s + dailyStats[k].earned; }, 0),  color: '#a855f7' },
          { label: raw('الأسبوع الثاني'), value: dayKeys.slice(7, 14).reduce(function (s, k) { return s + dailyStats[k].earned; }, 0), color: '#3b82f6' },
          { label: raw('الأسبوع الثالث'), value: dayKeys.slice(14, 21).reduce(function (s, k) { return s + dailyStats[k].earned; }, 0),color: '#14b8a6' },
          { label: raw('الأسبوع الرابع'), value: dayKeys.slice(21).reduce(function (s, k) { return s + dailyStats[k].earned; }, 0),    color: '#00e676' }
        ],
        snapshotMonth: meta.snapshotMonth || '',
        snapshotMonthLabel: meta.monthLabel || ''
      },
      roi: {
        adSpend: roiAdSpend, currency: roiCurrency, egpRate: roiEgpRate, sarRate: 3.75,
        totalOrders: placedCount, netOrderCount: placedCount, totalOrderCount: rawTotalOrders,
        ndrPct: ndrPct, ndrPctExact: ndrPctExact,
        expectedNdrRate: accountFinancials.expectedNdrRate,
        expectedNdrRateSource: expectedNdrRateSource,
        expectedNdrFallbackUsed: expectedNdrFallbackUsed,
        expectedNdrSelectedBaseOrders: expectedNdrSelectedBaseOrders,
        expectedNdrSelectedDeliveredOrders: expectedNdrSelectedDeliveredOrders,
        orderSources: orderSources,
        platformSources: platformSources,
        ndrBaseOrders: ndrBaseOrders, ndrDeliveredOrders: ndrDeliveredOrders,
        confirmationRate: confirmationPct, drPct: drPct,
        averageProfit: avgCommission, avgCommission: avgCommission,
        averageProfitSource: averageProfitSource,
        actualAverageProfit: actualAverageProfit,
        actualAverageProfitSource: actualAverageProfitSource,
        netOrderProfitAfterTax: totalPlacedCommission,
        taagerProfitAfterTax: taagerProfitAfterTax,
        deliveredCount: deliveredCount, shippingCount: shippingCount, totalDeliveredSales: totalDeliveredSales,
        actualDeliveredCount: actualDeliveredCount, actualEarnedProfitAfterTax: actualEarnedCommission, actualDeliveredSales: actualTotalDeliveredSales,
        expectedDeliveriesExact: accountFinancials.expectedDeliveriesExact,
        expectedDeliveriesDisplay: accountFinancials.expectedDeliveriesDisplay,
        expectedTotalProfitBeforeAdSpend: accountFinancials.expectedTotalProfitBeforeAdSpend,
        expectedNetProfit: accountFinancials.expectedNetProfit,
        expectedDeliveredSales: accountFinancials.expectedDeliveredSales,
        expectedDeliveredCpa: accountFinancials.expectedDeliveredCpa,
        breakEvenCpa: accountFinancials.breakEvenCpa,
        expectedRoi: accountFinancials.expectedRoi,
        expectedProfitRoas: accountFinancials.expectedProfitRoas,
        expectedSalesRoas: accountFinancials.expectedSalesRoas,
        netRoas: netRoas,
        avgCPA: accountFinancials.cpa
      },

      // T-18: GEO Intelligence layer
      // cityStats and productStats are the extended versions built during Pass 1.
      // geoProductMap / provinceMap are built by dashboard-aggregator-geo.js (Pass 2),
      // null until that file is loaded.
      geo: {
        get cityStats() {
          if (buildCityStatsInMainLoop) {
            ensureCitiesModel();
            return cityStats;
          }
          return (ensureCitiesResult() && ensureCitiesResult().geo && ensureCitiesResult().geo.cityStats) || {};
        },
        get productStats() {
          return buildHeavyStatsInMainLoop
            ? productStats
            : ((ensureHeavyResult() && ensureHeavyResult().geo && ensureHeavyResult().geo.productStats) || {});
        },
        get geoProductMap() { return ensureGeoModel().geoProductMap; },
        get provinceMap() { return ensureGeoModel().provinceMap; },
        get prepaidIntelligence() { return ensureGeoModel().prepaidIntelligence; },
        get insights() { return ensureGeoModel().insights; },
        kpis:               nationalAverages
      }
      // ---------------------------------------------------------------------------
    };
    });
  }
})();
