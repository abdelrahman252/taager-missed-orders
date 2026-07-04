/*
   dashboard-best-ndr-cycle.js
   Finds the strongest trustworthy NDR cycle inside the active dashboard period.
*/
(function () {
  'use strict';

  var DEFAULT_CYCLE_DAYS = 7;
  var DEFAULT_MIN_SAMPLE = 30;

  function parseIso(value) {
    var parts = String(value || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(date.getTime()) ? null : date;
  }

  function toIso(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function addDays(date, days) {
    var next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + Number(days || 0));
    return next;
  }

  function daysBetween(from, to) {
    var a = parseIso(from);
    var b = parseIso(to);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function dateKey(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return toIso(date);
  }

  function createdDate(row) {
    return dateKey(row && (row.createdAt || row.date || row.dashboardDate));
  }

  function exactBucket(row) {
    if (!row) return 'other';
    if (row.__dashboardExactBucket) return String(row.__dashboardExactBucket);
    if (row.exactStatusBucket) return String(row.exactStatusBucket);
    if (row.orderStatusBucket) return String(row.orderStatusBucket);
    var status = row.orderStatus || row.status || row.state || '';
    if (window.TaagerStatus && typeof window.TaagerStatus.normalize === 'function') {
      return window.TaagerStatus.normalize(status).bucket || 'other';
    }
    if (window.TaagerStatus && typeof window.TaagerStatus.dashboardBucket === 'function') {
      return window.TaagerStatus.dashboardBucket(status) || 'other';
    }
    status = String(status || '').toLowerCase();
    if (status === 'delivered') return 'delivered';
    if (status.indexOf('cancel') !== -1) return 'failed';
    if (status.indexOf('fail') !== -1 || status.indexOf('return') !== -1) return 'failed';
    return status || 'other';
  }

  function isCanceledByYou(bucket) {
    return bucket === 'canceled_by_you';
  }

  function isDelivered(bucket) {
    if (bucket === 'delivered') return true;
    if (window.TaagerStatus && typeof window.TaagerStatus.statusInfo === 'function') {
      var info = window.TaagerStatus.statusInfo(bucket);
      return !!(info && info.delivered);
    }
    return false;
  }

  function isFailed(bucket) {
    if (bucket === 'failed' || bucket === 'return_verified' || bucket === 'customer_refused_confirmation') return true;
    if (window.TaagerStatus && typeof window.TaagerStatus.statusInfo === 'function') {
      var info = window.TaagerStatus.statusInfo(bucket);
      return !!(info && info.businessGroup === 'lost');
    }
    return false;
  }

  function orderKey(row, index) {
    var accountId = String(row && (row.accountId || row.dashboardAccountId || '') || '').trim();
    var direct = String(row && (row.taagerOrderNumber || row.orderNumber || row.id || row.orderId || row.reference || '') || '').trim();
    if (direct) return accountId + '|id:' + direct;
    var phone = String(row && (row.phone || row.phone1 || row.phone2 || row.rawPhone || '') || '').trim();
    var created = createdDate(row);
    if (phone || created) return accountId + '|sig:' + phone + '|' + created + '|' + String(row && (row.orderStatus || row.status) || '');
    return accountId + '|idx:' + index;
  }

  function productName(row) {
    if (window.TaagerStatus && typeof window.TaagerStatus.productName === 'function') return window.TaagerStatus.productName(row);
    return row && (row.products || row.productName || row.product || row.sku || '') || '';
  }

  function collectOrders(data, period) {
    var rows = [];
    if (data && typeof data.getCreatedOrders === 'function') rows = data.getCreatedOrders();
    else if (Array.isArray(data && data.orders)) rows = data.orders;
    if (!Array.isArray(rows) || !rows.length) return [];

    var seen = {};
    var result = [];
    rows.forEach(function (row, index) {
      var date = createdDate(row);
      if (!date) return;
      if (period && period.dateFrom && date < period.dateFrom) return;
      if (period && period.dateTo && date > period.dateTo) return;
      var key = orderKey(row, index);
      if (seen[key]) return;
      seen[key] = true;
      var bucket = exactBucket(row);
      result.push({
        key: key,
        date: date,
        bucket: bucket,
        delivered: isDelivered(bucket),
        failed: isFailed(bucket),
        excluded: isCanceledByYou(bucket),
        city: String(row && row.city || '').trim(),
        product: String(productName(row) || '').trim()
      });
    });
    return result;
  }

  function emptyGroup(name) {
    return { name: name, netOrders: 0, delivered: 0, ndrPct: 0 };
  }

  function addGroup(map, name, delivered) {
    name = String(name || '').trim();
    if (!name) return;
    if (!map[name]) map[name] = emptyGroup(name);
    map[name].netOrders++;
    if (delivered) map[name].delivered++;
  }

  function topGroups(map, limit) {
    return Object.keys(map).map(function (key) {
      var item = map[key];
      item.ndrPct = item.netOrders > 0 ? (item.delivered / item.netOrders) * 100 : 0;
      return item;
    }).sort(function (a, b) {
      return b.delivered - a.delivered || b.netOrders - a.netOrders || b.ndrPct - a.ndrPct;
    }).slice(0, limit || 3);
  }

  function summarizeWindow(orders, dateFrom, dateTo) {
    var cities = {};
    var products = {};
    var summary = {
      dateFrom: dateFrom,
      dateTo: dateTo,
      netOrders: 0,
      delivered: 0,
      failed: 0,
      excluded: 0,
      ndrPct: 0,
      failedPct: 0,
      score: 0,
      topCities: [],
      topProducts: []
    };
    orders.forEach(function (order) {
      if (order.date < dateFrom || order.date > dateTo) return;
      if (order.excluded) {
        summary.excluded++;
        return;
      }
      summary.netOrders++;
      if (order.delivered) summary.delivered++;
      if (order.failed) summary.failed++;
      addGroup(cities, order.city, order.delivered);
      addGroup(products, order.product, order.delivered);
    });
    summary.ndrPct = summary.netOrders > 0 ? (summary.delivered / summary.netOrders) * 100 : 0;
    summary.failedPct = summary.netOrders > 0 ? (summary.failed / summary.netOrders) * 100 : 0;
    summary.topCities = topGroups(cities, 3);
    summary.topProducts = topGroups(products, 3);
    return summary;
  }

  function scoreWindow(summary, minSample) {
    if (!summary || summary.netOrders < minSample) return -1;
    // The minimum sample already provides the trust threshold. Adding volume
    // bonuses here allowed a larger, lower-NDR window to beat a genuinely
    // better NDR window. That made "Use in simulator" lower the assumption it
    // was supposed to improve. Rank by NDR; use volume only as a tie-breaker.
    return summary.ndrPct;
  }

  function periodFromData(data, opts) {
    opts = opts || {};
    if (opts.period && opts.period.dateFrom && opts.period.dateTo) return opts.period;
    var meta = data && data.meta || {};
    if (meta.period && meta.period.dateFrom && meta.period.dateTo) return meta.period;
    if (window.DashboardPeriodState && typeof window.DashboardPeriodState.get === 'function') {
      var current = window.DashboardPeriodState.get();
      if (current && current.dateFrom && current.dateTo) return current;
    }
    return null;
  }

  function analyze(data, opts) {
    opts = opts || {};
    var period = periodFromData(data, opts);
    if (!period || !period.dateFrom || !period.dateTo) {
      return { status: 'empty', reason: 'missing_period' };
    }
    var start = parseIso(period.dateFrom);
    var end = parseIso(period.dateTo);
    if (!start || !end || start > end) return { status: 'empty', reason: 'invalid_period' };

    var cycleDays = Math.max(1, Number(opts.cycleDays || DEFAULT_CYCLE_DAYS) || DEFAULT_CYCLE_DAYS);
    var totalDays = daysBetween(period.dateFrom, period.dateTo) + 1;
    cycleDays = Math.min(cycleDays, totalDays);
    var minSample = Math.max(1, Number(opts.minSample || DEFAULT_MIN_SAMPLE) || DEFAULT_MIN_SAMPLE);
    var orders = collectOrders(data, period);
    var average = summarizeWindow(orders, period.dateFrom, period.dateTo);
    var cycles = [];
    var best = null;
    var lastStart = addDays(end, -(cycleDays - 1));

    for (var cursor = start; cursor <= lastStart; cursor = addDays(cursor, 1)) {
      var from = toIso(cursor);
      var to = toIso(addDays(cursor, cycleDays - 1));
      var summary = summarizeWindow(orders, from, to);
      summary.score = scoreWindow(summary, minSample);
      summary.lowSample = summary.netOrders < minSample;
      cycles.push(summary);
      if (summary.score >= 0 && (!best ||
          summary.score > best.score ||
          (summary.score === best.score && summary.netOrders > best.netOrders) ||
          (summary.score === best.score && summary.netOrders === best.netOrders && summary.delivered > best.delivered))) {
        best = summary;
      }
    }

    if (!orders.length || average.netOrders <= 0) {
      return { status: 'empty', reason: 'no_orders', period: period, cycleDays: cycleDays, minSample: minSample, average: average, cycles: cycles };
    }
    if (!best) {
      return { status: 'low_sample', reason: 'low_sample', period: period, cycleDays: cycleDays, minSample: minSample, average: average, cycles: cycles };
    }

    best.upliftPts = best.ndrPct - average.ndrPct;
    best.failedDeltaPts = best.failedPct - average.failedPct;
    return {
      status: 'ready',
      period: period,
      cycleDays: cycleDays,
      minSample: minSample,
      average: average,
      best: best,
      cycles: cycles.sort(function (a, b) { return b.score - a.score; })
    };
  }

  window.DashboardBestNdrCycle = {
    analyze: analyze,
    defaults: {
      cycleDays: DEFAULT_CYCLE_DAYS,
      minSample: DEFAULT_MIN_SAMPLE
    }
  };
})();
