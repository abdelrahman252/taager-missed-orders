// analytics-kpis.js — KPI cards: single row of 6 matching reference design
// Cards: Total Orders | Revenue | Time Saved | Amount to Collect (COD) | Delivered % | Failed %
// Depends on: analytics-utils.js globals
// ─────────────────────────────────────────────────────────────────────────────

function _prevPeriodLabel(activeFilter) {
  if (activeFilter === "today" || activeFilter === "yesterday") return window.t_anl('kpi.prevSameDay');
  if (activeFilter === "last2") return window.t_anl('kpi.prev2Days');
  if (activeFilter === "7d") return window.t_anl('kpi.prev7Days');
  if (activeFilter === "thisMonth") return window.t_anl('kpi.prevMonth');
  return window.t_anl('kpi.prevPeriod');
}

// Taager dashboard/status/NDR migration: analytics KPI percentages use the
// same Arabic Taager status map as Dashboard and Operations.
function _analyticsStatusBucket(order) {
  if (window.TaagerStatus) return window.TaagerStatus.normalize(order && order.orderStatus).bucket;
  return String(order && order.orderStatus || "").toLowerCase();
}

function _analyticsIsDelivered(order) {
  return window.TaagerStatus
    ? window.TaagerStatus.isDelivered(order && order.orderStatus)
    : _analyticsStatusBucket(order) === "delivered";
}

function _analyticsIsFailed(order) {
  var bucket = _analyticsStatusBucket(order);
  return bucket === "failed" || bucket === "return_verified" || bucket === "customer_refused_confirmation";
}

function _analyticsIsNdrEligible(order) {
  return window.TaagerStatus
    ? window.TaagerStatus.isEligibleForNdr(order && order.orderStatus)
    : _analyticsStatusBucket(order) !== "canceled_by_you";
}

function renderKpiSection(container, runs, dateRange, settings, activeFilter) {
  const orders      = flattenRuns(runs);
  const runtimeMs   = _sumRunRuntimeMs(runs);

  const totalOrders  = orders.length;
  const totalRevenue = sumField(orders, "subtotal");
  const totalCOD     = sumField(orders, "amountDue");

  // Delivered % and Failed % — based on orderStatus field
  var eligibleOrders = orders.filter(_analyticsIsNdrEligible);
  var delivered = eligibleOrders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "delivered" || s === "تم التوصيل";
  }).length;
  var failed = eligibleOrders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "failed" || s === "فشل" || s === "مفقود";
  }).length;
  delivered = eligibleOrders.filter(_analyticsIsDelivered).length;
  failed = eligibleOrders.filter(_analyticsIsFailed).length;
  var deliveredPct = eligibleOrders.length > 0 ? ((delivered / eligibleOrders.length) * 100).toFixed(1) : "0.0";
  var failedPct    = eligibleOrders.length > 0 ? ((failed    / eligibleOrders.length) * 100).toFixed(1) : "0.0";

  // Previous period for deltas — filter by runTimestamp (same as current period) for consistency
  var prevOrders = [];
  if (dateRange) {
    var prevFrom    = shiftBack7(dateRange.from);
    var prevTo      = shiftBack7(dateRange.to);
    var allRunsList = container._allRuns || runs;
    var prevRuns    = allRunsList.filter(function(r) {
      if (!r.runTimestamp) return false;
      return r.runTimestamp >= prevFrom.getTime() && r.runTimestamp <= prevTo.getTime();
    });
    prevOrders = flattenRuns(prevRuns);
  }

  var periodLabel = _prevPeriodLabel(activeFilter);

  var prevTotal   = prevOrders.length;
  var prevRevenue = sumField(prevOrders, "subtotal");
  var prevCOD     = sumField(prevOrders, "amountDue");
  var prevRuntimeMs = _sumRunRuntimeMs(prevRuns || []);
  var prevEligibleOrders = prevOrders.filter(_analyticsIsNdrEligible);
  var prevDelivered = prevEligibleOrders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "delivered" || s === "تم التوصيل";
  }).length;
  var prevFailed = prevEligibleOrders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "failed" || s === "فشل" || s === "مفقود";
  }).length;
  prevDelivered = prevEligibleOrders.filter(_analyticsIsDelivered).length;
  prevFailed = prevEligibleOrders.filter(_analyticsIsFailed).length;
  var prevDeliveredPct = prevEligibleOrders.length > 0 ? ((prevDelivered / prevEligibleOrders.length) * 100) : 0;
  var prevFailedPct    = prevEligibleOrders.length > 0 ? ((prevFailed    / prevEligibleOrders.length) * 100) : 0;

  // Time Saved now reflects real bot runtime saved on each completed run.
  var timeDiffMin = Math.round((runtimeMs - prevRuntimeMs) / 60000);
  var timeSavedDeltaHtml = "";
  if (prevRuntimeMs > 0) {
    var sign = timeDiffMin >= 0 ? "▲" : "▼";
    var absMin = Math.abs(timeDiffMin);
    var deltaStr = "";
    if (absMin >= 60) {
      var h = Math.floor(absMin / 60);
      var m = absMin % 60;
      deltaStr = h + "h " + (m > 0 ? m + "m" : "");
    } else {
      deltaStr = absMin + "m";
    }
    var cls = timeDiffMin >= 0 ? "up" : "down";
    timeSavedDeltaHtml = '<span class="kpi-delta ' + cls + '">' + sign + ' ' + deltaStr + ' <span style="font-weight:400;opacity:.65">' + periodLabel + '</span></span>';
  } else {
    timeSavedDeltaHtml = '<span class="kpi-delta flat">— <span style="font-weight:400;opacity:.65">' + periodLabel + '</span></span>';
  }

  var kpis = [
    {
      id: "total-orders",
      icon: "🛍️",
      iconClass: "purple",
      label: window.t_anl('kpi.totalOrders'),
      displayValue: totalOrders.toLocaleString(),
      delta: calcDelta(totalOrders, prevTotal),
      periodLabel: periodLabel,
      color: "purple",
      animTarget: totalOrders
    },
    {
      id: "revenue",
      icon: "💰",
      iconClass: "blue",
      label: window.t_anl('kpi.revenue'),
      displayValue: formatSAR(totalRevenue),
      delta: calcDelta(totalRevenue, prevRevenue),
      periodLabel: periodLabel,
      color: "blue",
      animTarget: totalRevenue,
      animPrefix: "SAR ",
      animIsLarge: true
    },
    {
      id: "time-saved",
      icon: "⏱️",
      iconClass: "green",
      label: window.t_anl('kpi.timeSaved'),
      displayValue: _formatDurationMs(runtimeMs),
      deltaHtml: timeSavedDeltaHtml,
      periodLabel: periodLabel,
      color: "green"
    },
    {
      id: "cod",
      icon: "💵",
      iconClass: "orange",
      label: window.t_anl('kpi.cod'),
      displayValue: formatSAR(totalCOD),
      delta: calcDelta(totalCOD, prevCOD),
      periodLabel: periodLabel,
      color: "orange",
      animTarget: totalCOD,
      animPrefix: "SAR ",
      animIsLarge: true
    },
    {
      id: "delivered-pct",
      icon: "✅",
      iconClass: "success",
      label: window.t_anl('kpi.deliveredPct'),
      displayValue: deliveredPct + "%",
      delta: calcDeltaRaw(parseFloat(deliveredPct), prevDeliveredPct),
      periodLabel: periodLabel,
      color: "success"
    },
    {
      id: "failed-pct",
      icon: "❌",
      iconClass: "danger",
      label: window.t_anl('kpi.failedPct'),
      displayValue: failedPct + "%",
      delta: calcDeltaRaw(parseFloat(failedPct), prevFailedPct),
      periodLabel: periodLabel,
      color: "danger",
      invertDelta: true   // lower is better
    }
  ];

  container.innerHTML =
    '<div class="kpi-grid kpi-grid-6">' + kpis.map(_kpiCardHtml).join("") + '</div>';

  requestAnimationFrame(function() {
    kpis.forEach(function(k) {
      if (k.animTarget == null) return;
      var el = container.querySelector('[data-kpi-id="' + k.id + '"] .kpi-card-value');
      if (el) _animateCounter(el, k.animTarget, k.animPrefix || "", k.animIsLarge || false);
    });
  });
}

function _sumRunRuntimeMs(runs) {
  return (runs || []).reduce(function(total, run) {
    const runtime = Number(run?.runtimeMs) || 0;
    if (runtime > 0) return total + runtime;
    const start = Number(run?.runStartedAt) || 0;
    const end = Number(run?.runEndedAt) || 0;
    return start > 0 && end > start ? total + (end - start) : total;
  }, 0);
}

function _formatDurationMs(ms) {
  const mins = Math.max(0, Math.round((Number(ms) || 0) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return m + "m";
  if (m === 0) return h + "h";
  return h + "h " + m + "m";
}

// calcDeltaRaw — for percentage points (not ratio)
function calcDeltaRaw(current, prev) {
  if (prev == null || prev === 0) return null;
  var diff = current - prev;
  var pct  = Math.abs(diff).toFixed(1);
  return { positive: diff >= 0, pct: pct };
}

function _kpiCardHtml(k) {
  var deltaHtml;
  if (k.deltaHtml !== undefined) {
    deltaHtml = k.deltaHtml;
  } else if (k.delta != null) {
    // For invertDelta (e.g. Failed %): positive change is bad (red), negative is good (green)
    var isGood = k.invertDelta ? !k.delta.positive : k.delta.positive;
    var cls    = isGood ? "up" : "down";
    var sign   = k.delta.positive ? "▲" : "▼";
    var lbl    = k.periodLabel || window.t_anl('kpi.prevPeriod');
    deltaHtml = '<span class="kpi-delta ' + cls + '">' + sign + ' ' + k.delta.pct + '% <span style="font-weight:400;opacity:.65">' + lbl + '</span></span>';
  } else {
    var lbl = k.periodLabel || window.t_anl('kpi.prevPeriod');
    deltaHtml = '<span class="kpi-delta flat">— <span style="font-weight:400;opacity:.65">' + lbl + '</span></span>';
  }

  // Get high-quality SVG based on ID to match mockup mockup icons
  var svgIcon = "";
  if (k.id === "total-orders") {
    svgIcon = '<svg class="kpi-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';
  } else if (k.id === "revenue") {
    svgIcon = '<svg class="kpi-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line><circle cx="8" cy="15" r="2"></circle><circle cx="16" cy="15" r="2"></circle></svg>';
  } else if (k.id === "time-saved") {
    svgIcon = '<svg class="kpi-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
  } else if (k.id === "cod") {
    svgIcon = '<svg class="kpi-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M15 9H11.5a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5H9"></path></svg>';
  } else if (k.id === "delivered-pct") {
    svgIcon = '<svg class="kpi-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 8 12 16 12"></polyline><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  } else if (k.id === "failed-pct") {
    svgIcon = '<svg class="kpi-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else {
    svgIcon = k.icon;
  }

  var helperHtml = "";
  if (k.id === "time-saved") {
    helperHtml = '<div class="kpi-card-helper" style="font-size:8px;color:#64748b;margin-top:2px;line-height:1.2;font-weight:500;">' + window.t_anl('kpi.timeSavedHelper') + '</div>';
  }

  return '<div class="kpi-card" data-kpi-id="' + k.id + '" data-color="' + k.color + '">' +
    '<div class="kpi-card-icon-wrap ' + k.iconClass + '">' + svgIcon + '</div>' +
    '<div class="kpi-card-content">' +
      '<div class="kpi-card-label">' + k.label + '</div>' +
      '<div class="kpi-card-value">' + k.displayValue + '</div>' +
      deltaHtml +
      helperHtml +
    '</div>' +
    '</div>';
}

function _animateCounter(el, target, prefix, isLarge) {
  if (!target || target <= 0) return;
  var duration = 750;
  var startTs  = performance.now();
  var origText = el.textContent;
  function frame(now) {
    var progress = Math.min((now - startTs) / duration, 1);
    var eased    = 1 - Math.pow(1 - progress, 3);
    var current  = Math.round(target * eased);
    el.textContent = prefix ? (prefix + current.toLocaleString()) : current.toLocaleString();
    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = origText;
  }
  requestAnimationFrame(frame);
}
