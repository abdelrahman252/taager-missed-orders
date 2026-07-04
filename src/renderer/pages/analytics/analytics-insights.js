// analytics-insights.js — Smart Insights panel + Activity Timeline
// All logic is LOCAL — no AI, no external calls.
// Depends on: analytics-utils.js globals (flattenRuns, groupBy, sumField,
//             calcDelta, shiftBack7, formatRelativeTime, formatSAR)
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════
var _insightsPanelState = {
  page: 1,
  perPage: 5,
};

// Taager dashboard/status/NDR migration:
// Smart insights must classify the real Taager Arabic statuses through the
// shared helper instead of comparing old English TAAGER status strings.
function _insightStatusBucket(orderOrStatus) {
  var status = orderOrStatus && typeof orderOrStatus === "object"
    ? orderOrStatus.orderStatus
    : orderOrStatus;
  if (window.TaagerStatus) return window.TaagerStatus.normalize(status).bucket;
  return String(status || "").toLowerCase();
}

function _insightIsDelivered(order) {
  return window.TaagerStatus
    ? window.TaagerStatus.isDelivered(order && order.orderStatus)
    : _insightStatusBucket(order) === "delivered";
}

function _insightIsFailed(order) {
  var bucket = _insightStatusBucket(order);
  return bucket === "failed" || bucket === "return_verified" || bucket === "customer_refused_confirmation";
}

function _insightIsBucket(order, buckets) {
  return buckets.indexOf(_insightStatusBucket(order)) !== -1;
}

/**
 * Render Smart Insights panel.
 * @param {HTMLElement} container
 * @param {Array}  runs       - filtered runs
 * @param {Object} dateRange  - {from: Date, to: Date}
 */
function renderInsightsPanel(container, runs, dateRange, allRuns) {
  const insights = _generateInsights(runs, dateRange, allRuns);

  if (!container) return;

  if (insights.length === 0) {
    container.innerHTML = `
      <div class="insights-panel">
        <div class="insights-panel-header">
          <div class="insights-panel-title">
            <span class="insights-panel-title-icon">✨</span> ${window.t_anl('insights.title')}
          </div>
        </div>
        <div class="insights-empty">
          <div style="font-size:var(--type-page-title);margin-bottom:8px">🔍</div>
          ${window.t_anl('insights.emptyHint')}
        </div>
      </div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(insights.length / _insightsPanelState.perPage));
  if (_insightsPanelState.page > totalPages) _insightsPanelState.page = totalPages;
  if (_insightsPanelState.page < 1) _insightsPanelState.page = 1;
  const startIndex = (_insightsPanelState.page - 1) * _insightsPanelState.perPage;
  const visibleInsights = insights.slice(startIndex, startIndex + _insightsPanelState.perPage);

  container.innerHTML = `
    <div class="insights-panel">
      <div class="insights-panel-header">
        <div class="insights-panel-title">
          <span class="insights-panel-title-icon">✨</span> ${window.t_anl('insights.title')}
        </div>
        <span style="font-size:var(--type-caption);color:var(--text3)">${window.t_anl('insights.count', { count: insights.length })}</span>
      </div>
      <div class="insights-list">
        ${visibleInsights.map(i => _insightItemHtml(i)).join("")}
      </div>
      ${totalPages > 1 ? _analyticsMiniPaginationHtml(
        "insights",
        _insightsPanelState.page,
        totalPages,
        startIndex + 1,
        Math.min(startIndex + visibleInsights.length, insights.length),
        insights.length
      ) : ""}
    </div>`;

  const prev = container.querySelector('[data-insights-page="prev"]');
  const next = container.querySelector('[data-insights-page="next"]');
  const pageBtns = container.querySelectorAll("[data-insights-page-num]");
  if (prev) prev.addEventListener("click", () => {
    if (_insightsPanelState.page > 1) {
      _insightsPanelState.page--;
      renderInsightsPanel(container, runs, dateRange, allRuns);
    }
  });
  if (next) next.addEventListener("click", () => {
    if (_insightsPanelState.page < totalPages) {
      _insightsPanelState.page++;
      renderInsightsPanel(container, runs, dateRange, allRuns);
    }
  });
  pageBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.dataset.insightsPageNum, 10);
      if (!isNaN(p)) {
        _insightsPanelState.page = p;
        renderInsightsPanel(container, runs, dateRange, allRuns);
      }
    });
  });
}

// ── Insight generation rules ──────────────────────────────────────────────────

function _generateInsights(runs, dateRange, allRuns) {
  const insights = [];
  const orders   = flattenRuns(runs);
  if (orders.length === 0) return insights;
  const insightEvidence = (label, n, d) => window.TaagerSmartInsights && window.TaagerSmartInsights.rateEvidence
    ? window.TaagerSmartInsights.rateEvidence(label, n, d)
    : `${label}: ${n}${d != null ? ` / ${d}` : ""}`;

  // 1. Order volume trend (vs prev 7 days) — use allRuns for wider history
  if (dateRange) {
    const prevFrom  = shiftBack7(dateRange.from);
    const prevTo    = shiftBack7(dateRange.to);
    const allOrders = flattenRuns(allRuns && allRuns.length ? allRuns : runs);
    const prevCount = allOrders.filter(o => {
      const d = new Date(o.date);
      return d >= prevFrom && d <= prevTo;
    }).length;
    const delta = calcDelta(orders.length, prevCount);
    if (delta) {
      insights.push({
        type: delta.positive ? "positive" : "negative",
        icon: delta.positive ? "📈" : "📉",
        text: window.t_anl('insights.dynamic.trend', { 
          trendClass: delta.positive ? "insight-good" : "insight-bad",
          trendText: delta.positive ? window.t_anl('insights.dynamic.increased') : window.t_anl('insights.dynamic.decreased'),
          pct: Math.abs(delta.pct)
        }),
      });
    }
  }

  // 2. Failed city concentration
  const failedOrders  = orders.filter(_insightIsFailed);
  if (failedOrders.length > 0) {
    const byCityFailed = groupBy(failedOrders, "city");
    const topFail      = byCityFailed[0];
    if (topFail && topFail.count >= 2) {
      const failRate = Math.round((failedOrders.length / orders.length) * 100);
      insights.push({
        type: "warning",
        icon: "⚠️",
        text: window.t_anl('insights.dynamic.failedCity', { city: topFail.key, count: topFail.count, rate: failRate }),
        evidence: [insightEvidence("Failed orders", failedOrders.length, orders.length), `${topFail.key}: ${topFail.count}`],
      });
    }
  }

  // 3. Best-selling product
  const byProduct = groupBy(orders, "productName");
  if (byProduct.length > 0) {
    const top = byProduct[0];
    insights.push({
      type: "info",
      icon: "🏆",
      text: window.t_anl('insights.dynamic.bestProduct', { product: top.key || window.t_anl('insights.dynamic.unknown'), count: top.count }),
      evidence: [`${top.key || window.t_anl('insights.dynamic.unknown')}: ${top.count} / ${orders.length} orders`],
    });
  }

  // 4. High COD concentration
  const totalCOD = sumField(orders, "amountDue");
  if (totalCOD > 5000) {
    insights.push({
      type: "info",
      icon: "💵",
      text: window.t_anl('insights.dynamic.highCod', { amount: formatSAR(totalCOD), count: orders.length }),
    });
  }

  // 5. Best execution hours
  const hourCounts = new Array(24).fill(0);
  for (const o of orders.filter(_insightIsDelivered)) {
    const h = o.date ? new Date(o.date).getHours() : -1;
    if (h >= 0) hourCounts[h]++;
  }
  const maxHourCount = Math.max(...hourCounts);
  if (maxHourCount > 0) {
    const bestHour = hourCounts.indexOf(maxHourCount);
    const nextHour = (bestHour + 1) % 24;
    const fmtHour  = h => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    insights.push({
      type: "positive",
      icon: "⏰",
      text: window.t_anl('insights.dynamic.bestHour', { start: fmtHour(bestHour), end: fmtHour(nextHour) }),
    });
  }

  // 6. Taager profit summary. marketerCommission is a legacy storage alias for
  // Taager profit = order profit - tax profit in migrated rows.
  const totalComm = orders.reduce((sum, o) => {
    if (window.TaagerStatus) return sum + window.TaagerStatus.taagerProfit(o);
    return sum + (Number(o.taagerProfit != null ? o.taagerProfit : o.profitAfterTax != null ? o.profitAfterTax : o.profitAfterFees != null ? o.profitAfterFees : o.marketerCommission) || 0);
  }, 0);
  if (totalComm > 0) {
    const avgComm = Math.round(totalComm / orders.length);
    insights.push({
      type: "positive",
      icon: "🏷️",
      text: window.t_anl('insights.dynamic.commission', { total: formatSAR(totalComm), avg: formatSAR(avgComm) }),
    });
  }

  // 7. Source split
  const realCount   = orders.filter(o => o.source === "real").length;
  const missedCount = orders.filter(o => o.source === "missed").length;
  if (missedCount > 0 && realCount > 0) {
    const missedPct = Math.round((missedCount / (realCount + missedCount)) * 100);
    insights.push({
      type: missedPct > 30 ? "warning" : "info",
      icon: missedPct > 30 ? "⚠️" : "ℹ️",
      text: window.t_anl('insights.dynamic.missed', { 
        pct: missedPct, 
        cssClass: missedPct > 30 ? "insight-warn" : "insight-value",
        missedLabel: window.t_anl('insights.dynamic.missedLabel')
      }),
    });
  }

  // 8. Under processing backlog
  const processing = orders.filter(o => _insightIsBucket(o, ["received", "after_sales_done", "after_sales_progress"])).length;
  if (processing > 5) {
    insights.push({
      type: "warning",
      icon: "🔄",
      text: window.t_anl('insights.dynamic.processing', { count: processing }),
    });
  }

  // 9. In shipping pipeline
  const inShippingOrders = orders.filter(o => _insightIsBucket(o, ["shipping", "delivery_suspended"]));
  const inShipping = inShippingOrders.length;
  if (inShipping > 0) {
    const inShippingComm = inShippingOrders.reduce((sum, o) => {
      if (window.TaagerStatus) return sum + window.TaagerStatus.taagerProfit(o);
      return sum + (Number(o.taagerProfit != null ? o.taagerProfit : o.profitAfterTax != null ? o.profitAfterTax : o.profitAfterFees != null ? o.profitAfterFees : o.marketerCommission) || 0);
    }, 0);
    insights.push({
      type: "info",
      icon: "\uD83D\uDE9A",
      text: window.t_anl('insights.dynamic.shipping', { 
        count: inShipping, 
        commPart: inShippingComm > 0 ? window.t_anl('insights.dynamic.shippingComm', { amount: formatSAR(inShippingComm) }) : "" 
      }),
    });
  }

  // 10. Waiting backlog — orders stuck in Waiting status
  const waiting = orders.filter(o => _insightIsBucket(o, ["waiting", "on_hold", "out_of_stock"])).length;
  if (waiting > 0) {
    insights.push({
      type: "warning",
      icon: "⏳",
      text: window.t_anl('insights.dynamic.waiting', { count: waiting }),
    });
  }

  // 11. Confirmed orders (positive signal — confirmed but not yet shipped)
  const confirmed = orders.filter(o => _insightIsBucket(o, ["confirmed"])).length;
  if (confirmed > 0) {
    insights.push({
      type: "positive",
      icon: "✅",
      text: window.t_anl('insights.dynamic.confirmed', { count: confirmed }),
    });
  }

  // 12. Cancellation rate warning
  const canceled = orders.filter(o => _insightIsBucket(o, ["canceled_by_you"])).length;
  if (canceled > 0 && orders.length > 0) {
    const cancelRate = Math.round((canceled / orders.length) * 100);
    if (cancelRate >= 20) {
      insights.push({
        type: "negative",
        icon: "🚫",
        text: window.t_anl('insights.dynamic.canceled', { rate: cancelRate, count: canceled }),
        evidence: [insightEvidence("Canceled by you", canceled, orders.length)],
      });
    }
  }

  return insights;
}


function _insightItemHtml(insight) {
  const trust = window.TaagerSmartInsights && window.TaagerSmartInsights.trustLabel
    ? window.TaagerSmartInsights.trustLabel(insight.trust || "measured")
    : "Measured";
  const evidence = Array.isArray(insight.evidence) && insight.evidence.length
    ? `<div class="insight-evidence" style="font-size:var(--type-micro);color:var(--text3);margin-top:4px">${insight.evidence.slice(0, 2).join(" · ")}</div>`
    : "";
  return `
    <div class="insight-item ${insight.type}">
      <span class="insight-icon">${insight.icon}</span>
      <div class="insight-text"><span style="font-size:var(--type-micro);font-weight:var(--weight-semibold);text-transform:uppercase;color:var(--text3);margin-inline-end:6px">${trust}</span>${insight.text}${evidence}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Render Activity Timeline panel.
 * @param {HTMLElement} container
 * @param {Array}  runs  - filtered runs (sorted newest first by caller)
 * @param {number} [pageNum] - optional target page
 */
function renderActivityTimeline(container, runs, pageNum) {
  if (!container) return;

  const events = _buildTimelineEvents(runs);
  const ITEMS_PER_PAGE = 8;
  const totalItems = events.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  let currentPage = pageNum !== undefined ? pageNum : parseInt(container.dataset.timelinePage || "1", 10);
  if (isNaN(currentPage) || currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  container.dataset.timelinePage = currentPage;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedEvents = events.slice(startIndex, endIndex);

  const itemsHtml = paginatedEvents.length > 0
    ? paginatedEvents.map((e) => `
        <div class="timeline-item">
          <div class="timeline-dot-col">
            <div class="timeline-dot ${e.dotClass}"></div>
          </div>
          <div class="timeline-content">
            <div class="timeline-time">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.6;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              ${e.timeLabel}
            </div>
            <div class="timeline-action">${e.action}</div>
            ${e.detail ? `<div class="timeline-detail">${e.detail}</div>` : ""}
          </div>
        </div>`).join("")
    : `<div class="timeline-empty">${window.t_anl('timeline.empty')}</div>`;

  let paginationHtml = "";
  if (totalPages > 1) {
    paginationHtml = `
      <div class="timeline-pagination">
        <button class="btn-prev-timeline" ${currentPage === 1 ? "disabled" : ""} aria-label="${window.t_anl('table.prev')}">←</button>
        <span class="timeline-pagination-info">${window.t_anl('timeline.pageOf', { current: currentPage, total: totalPages })}</span>
        <button class="btn-next-timeline" ${currentPage === totalPages ? "disabled" : ""} aria-label="${window.t_anl('table.next')}">→</button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="timeline-panel">
      <div class="timeline-panel-header">
        <div class="timeline-panel-title">
          <span>📋</span> ${window.t_anl('timeline.title')}
        </div>
        <span style="font-size:var(--type-caption);color:var(--text3)">${window.t_anl('timeline.eventsCount', { count: events.length })}</span>
      </div>
      <div class="timeline-list">
        ${itemsHtml}
      </div>
      ${paginationHtml}
    </div>`;

  const btnPrev = container.querySelector(".btn-prev-timeline");
  const btnNext = container.querySelector(".btn-next-timeline");

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      renderActivityTimeline(container, runs, currentPage - 1);
    });
  }
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      renderActivityTimeline(container, runs, currentPage + 1);
    });
  }
}

function _buildTimelineEvents(runs) {
  const events = [];

  const sorted = [...runs].sort((a, b) => (b.runTimestamp || 0) - (a.runTimestamp || 0));

  for (const run of sorted) {
    const ts    = run.runTimestamp || 0;
    const label = ts > 0 ? formatRelativeTime(ts) : "—";
    const abs   = ts > 0 ? new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
    const timeLabel = abs ? `${abs} · ${label}` : label;
    const isMulti = run._multiAccount || false;

    events.push({
      dotClass:  "completed",
      timeLabel,
      action:    window.t_anl('timeline.runCompleted'),
      detail:    `${window.t_anl('timeline.ordersSubmitted', { count: run.ordersSubmitted || 0 })}${run.ordersFailed > 0 ? ` · ${window.t_anl('timeline.failed', { count: run.ordersFailed })}` : ""}${isMulti ? ` · ${window.t_anl('timeline.multiAccountLabel')}` : ""}`,
    });

    if (run.accountEmail && run.accountEmail !== "__single__") {
      events.push({
        dotClass:  "info",
        timeLabel,
        action:    run.accountEmail,
        detail:    window.t_anl('timeline.ordersSubmitted', { count: run.ordersSubmitted || 0 }),
      });
    }

    if (run.ordersFailed > 0) {
      events.push({
        dotClass: "failed",
        timeLabel,
        action:   window.t_anl('timeline.failed', { count: run.ordersFailed }),
        detail:   run.accountEmail || "",
      });
    }

    events.push({
      dotClass:  "started",
      timeLabel,
      action:    window.t_anl('timeline.runStarted'),
      detail:    isMulti ? window.t_anl('timeline.multiAccount') : (run.accountEmail || window.t_anl('timeline.singleAccount')),
    });
  }

  return events;
}
