// operations-insights.js — Smart run insights panel

const _opsInsightsState = { page: 1, perPage: 5 };

function renderOpsInsights(container, allRuns) {
  if (!container) return;
  const insights = _opsGenerateInsights(allRuns);
  const totalPages = Math.max(1, Math.ceil(insights.length / _opsInsightsState.perPage));
  if (_opsInsightsState.page > totalPages) _opsInsightsState.page = totalPages;
  if (_opsInsightsState.page < 1) _opsInsightsState.page = 1;
  const start = (_opsInsightsState.page - 1) * _opsInsightsState.perPage;
  const visibleInsights = insights.slice(start, start + _opsInsightsState.perPage);

  container.innerHTML = `
    <div class="ops-insights-card">
      <div class="ops-insights-header">
        <div class="ops-insights-title">📊 ${window.t_ops('insights.title')}</div>
        <div class="ops-insights-sub">${window.t_ops('insights.subtitle')}</div>
      </div>
      <div class="ops-insights-list" id="ops-insights-list">
        ${insights.length
          ? visibleInsights.map((i, index) => _opsInsightHTML(i, start + index + 1)).join("")
          : `<div class="ops-insights-empty">🔍<br>${window.t_ops('insights.empty')}</div>`
        }
      </div>
      ${totalPages > 1 ? _opsInsightsPaginationHtml(_opsInsightsState.page, totalPages) : ""}
    </div>`;

  container.querySelector("#ops-insights-prev")?.addEventListener("click", () => {
    if (_opsInsightsState.page > 1) {
      _opsInsightsState.page--;
      renderOpsInsights(container, allRuns);
    }
  });
  container.querySelector("#ops-insights-next")?.addEventListener("click", () => {
    if (_opsInsightsState.page < totalPages) {
      _opsInsightsState.page++;
      renderOpsInsights(container, allRuns);
    }
  });
  container.querySelectorAll("[data-ops-insights-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = parseInt(btn.dataset.opsInsightsPage, 10);
      if (!isNaN(page)) {
        _opsInsightsState.page = page;
        renderOpsInsights(container, allRuns);
      }
    });
  });

  if (!container._clickWired) {
    container._clickWired = true;
    container.addEventListener("click", e => {
      const btn = e.target.closest(".ops-insight-action");
      if (!btn) return;
      if (btn.dataset.action === "products") {
        const prodMount = document.getElementById("ops-product-mount");
        const card = prodMount?.querySelector(".ops-product-card");
        if (prodMount) prodMount.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        if (card) {
          card.classList.remove("ops-product-glow");
          void card.offsetWidth;
          card.classList.add("ops-product-glow");
          setTimeout(() => card.classList.remove("ops-product-glow"), 1800);
        }
      } else if (btn.dataset.action === "history") {
        const histMount = document.getElementById("ops-history-mount");
        const card = histMount?.querySelector(".ops-history-card");
        if (histMount) histMount.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        if (card) {
          card.classList.remove("ops-history-glow");
          void card.offsetWidth;
          card.classList.add("ops-history-glow");
          setTimeout(() => card.classList.remove("ops-history-glow"), 1800);
        }
      }
    });
  }
}

function _opsInsightsPaginationHtml(currentPage, totalPages) {
  const pageNums = [];
  const win = 1;
  for (let p = Math.max(1, currentPage - win); p <= Math.min(totalPages, currentPage + win); p++) {
    pageNums.push(p);
  }
  const showFirst = pageNums[0] > 1;
  const showLast = pageNums[pageNums.length - 1] < totalPages;
  return `
    <div class="ops-history-pagination explorer-pagination ops-insights-pagination">
      <span class="explorer-pagination-info">${window.t_ops('productPerf.pageOf', { current: currentPage, total: totalPages })}</span>
      <div class="explorer-pagination-controls">
        <button class="ops-history-pag-btn pagination-btn pagination-arrow-btn" id="ops-insights-prev" ${currentPage <= 1 ? "disabled" : ""} aria-label="${window.t_ops('history.prev')}">←</button>
        ${showFirst ? `<button class="pagination-btn" data-ops-insights-page="1">1</button><span class="pagination-ellipsis">…</span>` : ""}
        ${pageNums.map(p => `<button class="pagination-btn${p === currentPage ? " active" : ""}" data-ops-insights-page="${p}">${p}</button>`).join("")}
        ${showLast ? `<span class="pagination-ellipsis">…</span><button class="pagination-btn" data-ops-insights-page="${totalPages}">${totalPages}</button>` : ""}
        <button class="ops-history-pag-btn pagination-btn pagination-arrow-btn" id="ops-insights-next" ${currentPage >= totalPages ? "disabled" : ""} aria-label="${window.t_ops('history.next')}">→</button>
      </div>
    </div>`;
}

function _opsInsightHTML(insight, index) {
  const trust = window.TaagerSmartInsights && window.TaagerSmartInsights.trustLabel
    ? window.TaagerSmartInsights.trustLabel(insight.trust || "measured")
    : "Measured";
  const evidence = Array.isArray(insight.evidence) && insight.evidence.length
    ? `<div class="ops-insight-evidence" style="font-size:10px;color:var(--text3);margin-top:4px">${insight.evidence.slice(0, 2).join(" · ")}</div>`
    : "";
  return `
    <div class="ops-insight-row ${insight.type}">
      <div class="ops-insight-icon-col">
        <span class="ops-insight-icon ${insight.type}">${insight.icon}</span>
      </div>
      <div class="ops-insight-body">
        <div class="ops-insight-kicker">${window.t_ops('insights.cardLabel', { index })}</div>
        <div class="ops-insight-text"><span style="font-size:9px;font-weight:800;text-transform:uppercase;color:var(--text3);margin-inline-end:6px">${trust}</span>${insight.text}${evidence}</div>
        ${insight.action ? `<button class="ops-insight-action" data-action="${insight.actionType || ""}">${insight.action} →</button>` : ""}
      </div>
      <div class="ops-insight-arrow">›</div>
    </div>`;
}

function _opsGenerateInsights(allRuns) {
  const insights = [];
  const orders   = _opsFlattenRuns(allRuns);
  if (!orders.length) return insights;
  const insightEvidence = (label, n, d) => window.TaagerSmartInsights && window.TaagerSmartInsights.rateEvidence
    ? window.TaagerSmartInsights.rateEvidence(label, n, d)
    : `${label}: ${n}${d != null ? ` / ${d}` : ""}`;

  const now  = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  const recent = orders.filter(o => o.runTimestamp && now - o.runTimestamp < week);
  const prev   = orders.filter(o => o.runTimestamp && now - o.runTimestamp >= week && now - o.runTimestamp < 2 * week);
  if (recent.length && prev.length) {
    const pct = Math.round(((recent.length - prev.length) / prev.length) * 100);
    const up  = pct >= 0;
    insights.push({
      type: up ? "positive" : "negative", icon: up ? "📈" : "📉",
      text: window.t_ops('insights.trend', { trend: up ? window.t_ops('insights.increased') : window.t_ops('insights.decreased'), pct: Math.abs(pct), extra: up ? window.t_ops('insights.goodJob') : '' }),
      action: null,
    });
  }

  // Taager dashboard/status/NDR migration: failed/delivered insights follow
  // Taager Arabic status buckets instead of older English-only labels.
  const failed = orders.filter(o => typeof _opsIsFailed === "function" && _opsIsFailed(o));
  if (failed.length) {
    const byCityF = _opsGroupBy(failed, "city");
    const topCity = byCityF[0];
    if (topCity && topCity.count >= 2) {
      const failPct = Math.round((topCity.count / failed.length) * 100);
      insights.push({
        type: "warning", icon: "⚠️",
        text: window.t_ops('insights.failedCity', { city: topCity.key || window.t_ops('orderDetails.unknown'), pct: failPct, count: topCity.count }),
        evidence: [insightEvidence("Failed orders", failed.length, orders.length), `${topCity.key || window.t_ops('orderDetails.unknown')}: ${topCity.count}`],
        action: window.t_ops('insights.actions.viewDetails'),
        actionType: "history",
      });
    }
  }

  const byProd = _opsGroupBy(orders, "productName");
  if (byProd.length) {
    insights.push({
      type: "info", icon: "🏆",
      text: window.t_ops('insights.bestProduct', { product: byProd[0].key || window.t_ops('orderDetails.unknown'), count: byProd[0].count }),
      evidence: [`${byProd[0].key || window.t_ops('orderDetails.unknown')}: ${byProd[0].count} / ${orders.length} orders`],
      action: window.t_ops('insights.actions.viewProducts'),
      actionType: "products",
    });
  }

  if (byProd.length > 1) {
    insights.push({
      type: "info", icon: "📦",
      text: window.t_ops('insights.productSpread', { count: byProd.length, top: byProd[0].key || window.t_ops('orderDetails.unknown') }),
      action: window.t_ops('insights.actions.viewProducts'),
      actionType: "products",
    });
  }

  const hourCounts = new Array(24).fill(0);
  orders.forEach(o => { if (o.date) hourCounts[new Date(o.date).getHours()]++; });
  const maxH = Math.max(...hourCounts);
  if (maxH > 0) {
    const bestH = hourCounts.indexOf(maxH);
    const fmtH  = h => `${h % 12 || 12}${h < 12 ? "AM" : "PM"}`;
    insights.push({
      type: "positive", icon: "💡",
      text: window.t_ops('insights.tipTime', { start: fmtH(bestH), end: fmtH((bestH + 2) % 24) }),
      action: null,
    });
  }

  const totalCOD = orders.reduce((s, o) => s + (Number(o.amountDue) || 0), 0);
  if (totalCOD > 1000) {
    insights.push({
      type: "info", icon: "💵",
      text: window.t_ops('insights.pendingCod', { amount: _opsFmtSAR(totalCOD), count: orders.length }),
      action: null,
    });
  }

  const byAccount = _opsGroupBy(orders, "accountLabel");
  if (byAccount.length > 1) {
    insights.push({
      type: "positive", icon: "👤",
      text: window.t_ops('insights.topAccount', { account: byAccount[0].key || window.t_ops('orderDetails.unknown'), count: byAccount[0].count }),
      action: null,
    });
  }

  const eligibleOrders = orders.filter(o => typeof _opsIsNdrEligible === "function" ? _opsIsNdrEligible(o) : true);
  const delivered = eligibleOrders.filter(o => typeof _opsIsDelivered === "function" ? _opsIsDelivered(o) : (o.orderStatus || "").toLowerCase() === "delivered").length;
  if (delivered > 0) {
    const pct = Math.round((delivered / Math.max(1, eligibleOrders.length)) * 100);
    insights.push({
      type: pct >= 50 ? "positive" : "warning", icon: "✓",
      text: window.t_ops('insights.deliveryRate', { pct, count: delivered }),
      evidence: [insightEvidence("Delivered", delivered, eligibleOrders.length)],
      action: null,
    });
  }

  const runs = allRuns || [];
  if (runs.length) {
    const avg = Math.round(orders.length / Math.max(1, runs.length));
    insights.push({
      type: "info", icon: "🧭",
      text: window.t_ops('insights.avgRunVolume', { avg, runs: runs.length }),
      action: window.t_ops('insights.actions.viewDetails'),
      actionType: "history",
    });
  }

  const failedRate = Math.round((failed.length / orders.length) * 100);
  if (failedRate > 0) {
    insights.push({
      type: failedRate > 10 ? "negative" : "warning", icon: "!",
      text: window.t_ops('insights.failedRate', { pct: failedRate, count: failed.length }),
      evidence: [insightEvidence("Failed orders", failed.length, orders.length)],
      action: window.t_ops('insights.actions.viewDetails'),
      actionType: "history",
    });
  }

  return insights;
}
