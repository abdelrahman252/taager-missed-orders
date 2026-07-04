// analytics-charts.js — All 7 chart renderers for the Analytics page Revamped
// Depends on: Chart.js (loaded via CDN in index.html), analytics-utils.js globals
// ─────────────────────────────────────────────────────────────────────────────

// Chart instance registry — destroy before recreate to avoid memory leaks
var _chartRegistry = {};

// Module-level registry for keeping custom filter state across date range redraws
var _chartsState = {
  topCitiesFilter: "orders",
  topProductsFilter: "revenue",
  ordersByHourFilter: "orders",
  heatmapYear: null,
  heatmapMonth: null,
  heatmapOrders: [],
};


/**
 * Dynamically ensure Chart.js is loaded (CDN fallback).
 * Resolves immediately if window.Chart already exists.
 */
function ensureChartJs() {
  return new Promise(function(resolve, reject) {
    if (window.Chart) { resolve(window.Chart); return; }
    var s = document.createElement("script");
    s.src = "pages/analytics/chart.umd.min.js";
    s.onload  = function() { resolve(window.Chart); };
    s.onerror = function() { reject(new Error("Chart.js failed to load")); };
    document.head.appendChild(s);
  });
}

/**
 * Destroy all previously created Chart.js instances.
 */
function destroyAllCharts() {
  Object.keys(_chartRegistry).forEach(function(id) {
    try { _chartRegistry[id].destroy(); } catch(e) {}
    delete _chartRegistry[id];
  });
}

/**
 * Render all 7 charts into the given root element.
 * @param {HTMLElement} chartsRoot
 * @param {Array}       orders     - flattened order array
 * @param {Object}      dateRange  - {from: Date, to: Date}
 */
function renderAllCharts(chartsRoot, orders, dateRange) {
  if (!chartsRoot) return;

  chartsRoot.innerHTML = [
    '<div class="charts-grid">',
      '<div class="charts-row-2">',
        '<div class="chart-card" id="chart-orders-per-day">',
          '<div class="chart-card-header">',
            '<div style="display:flex; flex-direction:column; gap:2px;">',
              '<div class="chart-card-title">' + window.t_anl('charts.ordersTitle') + '</div>',
              '<div class="chart-card-subtitle" id="orders-per-day-subtitle" style="font-size:var(--type-micro); color:var(--text2); font-weight:var(--weight-regular); line-height:1.2;"></div>',
            '</div>',
          '</div>',
          '<div class="chart-canvas-wrap chart-orders-wrap" style="padding:0 4px 4px"><canvas id="canvas-orders-per-day"></canvas></div>',
        '</div>',
        '<div class="chart-card" id="chart-real-vs-missed">',
          '<div class="chart-card-title">' + window.t_anl('charts.statusTitle') + '</div>',
          '<div class="donut-card-body" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px 12px; gap:24px; height:100%;">',
            '<div class="chart-canvas-wrap chart-canvas-wrap--donut" style="width:100%; height:170px; position:relative;">',
              '<canvas id="canvas-real-vs-missed"></canvas>',
            '</div>',
            '<div id="donut-legend-root" class="donut-custom-legend" style="width:100%; display:flex; justify-content:center; gap:24px;"></div>',
          '</div>',
        '</div>',
        '<div class="chart-card" id="chart-top-cities">',
          '<div class="chart-card-header">',
            '<div class="chart-card-title">' + window.t_anl('charts.topCities') + '</div>',
            '<div id="top-cities-filter-wrap"></div>',
          '</div>',
          '<div id="top-cities-root" style="padding:16px 8px"></div>',
        '</div>',
      '</div>',
      '<div class="charts-row-3">',
        '<div class="chart-card" id="chart-delivery-funnel">',
          '<div class="chart-card-title">' + window.t_anl('charts.deliveryFunnel') + '</div>',
          '<div id="funnel-root" style="padding:16px 8px"></div>',
        '</div>',
        '<div class="chart-card" id="chart-heatmap">',
          '<div class="chart-card-title">' + window.t_anl('charts.ordersHeatmap') + '</div>',
          '<div id="heatmap-root" style="padding:8px"></div>',
        '</div>',
        '<div class="chart-card" id="chart-orders-by-hour">',
          '<div class="chart-card-header">',
            '<div class="chart-card-title">' + window.t_anl('charts.ordersByHour') + '</div>',
            '<div id="orders-by-hour-filter-wrap"></div>',
          '</div>',
          '<div class="chart-canvas-wrap chart-orders-by-hour-wrap" style="padding:0 4px 4px"><canvas id="canvas-orders-by-hour"></canvas></div>',
        '</div>',
        '<div class="chart-card" id="chart-top-products">',
          '<div class="chart-card-header">',
            '<div class="chart-card-title">' + window.t_anl('charts.salesByProduct') + '</div>',
            '<div id="top-products-filter-wrap"></div>',
          '</div>',
          '<div id="top-products-root" style="padding:8px 0"></div>',
        '</div>',
      '</div>',
    '</div>',
  ].join("");

  destroyAllCharts();

  try {
    _renderOrdersPerDay(orders, dateRange);
  } catch (e) {
    console.error("[Analytics] Error rendering Orders Per Day chart:", e);
    var el = document.getElementById("chart-orders-per-day");
    if (el) el.innerHTML = '<div class="analytics-chart-error" style="height:100%; display:flex; align-items:center; justify-content:center; font-size:var(--type-caption); color:#ef4444; padding:20px; text-align:center;">Failed to load Orders Per Day</div>';
  }

  try {
    _renderRealVsMissed(orders);
  } catch (e) {
    console.error("[Analytics] Error rendering Real vs Missed chart:", e);
    var el = document.getElementById("chart-real-vs-missed");
    if (el) el.innerHTML = '<div class="analytics-chart-error" style="height:100%; display:flex; align-items:center; justify-content:center; font-size:var(--type-caption); color:#ef4444; padding:20px; text-align:center;">Failed to load Real vs Missed</div>';
  }

  try {
    _renderTopCities(orders, _chartsState.topCitiesFilter);
  } catch (e) {
    console.error("[Analytics] Error rendering Top Cities chart:", e);
    var el = document.getElementById("chart-top-cities");
    if (el) el.innerHTML = '<div class="analytics-chart-error" style="height:100%; display:flex; align-items:center; justify-content:center; font-size:var(--type-caption); color:#ef4444; padding:20px; text-align:center;">Failed to load Top Cities</div>';
  }

  try {
    _renderDeliveryFunnel(orders);
  } catch (e) {
    console.error("[Analytics] Error rendering Delivery Funnel chart:", e);
    var el = document.getElementById("chart-delivery-funnel");
    if (el) el.innerHTML = '<div class="analytics-chart-error" style="height:100%; display:flex; align-items:center; justify-content:center; font-size:var(--type-caption); color:#ef4444; padding:20px; text-align:center;">Failed to load Delivery Funnel</div>';
  }

  try {
    _renderHeatmap(orders);
  } catch (e) {
    console.error("[Analytics] Error rendering Heatmap chart:", e);
    var el = document.getElementById("chart-heatmap");
    if (el) el.innerHTML = '<div class="analytics-chart-error" style="height:100%; display:flex; align-items:center; justify-content:center; font-size:var(--type-caption); color:#ef4444; padding:20px; text-align:center;">Failed to load Heatmap</div>';
  }

  try {
    _renderOrdersByHour(orders, _chartsState.ordersByHourFilter);
  } catch (e) {
    console.error("[Analytics] Error rendering Orders by Hour chart:", e);
    var el = document.getElementById("chart-orders-by-hour");
    if (el) el.innerHTML = '<div class="analytics-chart-error" style="height:100%; display:flex; align-items:center; justify-content:center; font-size:var(--type-caption); color:#ef4444; padding:20px; text-align:center;">Failed to load Orders by Hour</div>';
  }

  try {
    _renderTopProducts(orders, _chartsState.topProductsFilter);
  } catch (e) {
    console.error("[Analytics] Error rendering Top Products chart:", e);
    var el = document.getElementById("chart-top-products");
    if (el) el.innerHTML = '<div class="analytics-chart-error" style="height:100%; display:flex; align-items:center; justify-content:center; font-size:var(--type-caption); color:#ef4444; padding:20px; text-align:center;">Failed to load Top Products</div>';
  }
  
  // Custom select for Top Cities
  renderCustomSelect(
    document.getElementById("top-cities-filter-wrap"),
    [
      { value: "orders", label: window.t_anl('charts.byOrders') },
      { value: "revenue", label: window.t_anl('charts.byRevenue') }
    ],
    _chartsState.topCitiesFilter,
    function(val) {
      _chartsState.topCitiesFilter = val;
      try {
        _renderTopCities(orders, val);
      } catch (e) {
        console.error("[Analytics] Error refreshing Top Cities filter:", e);
      }
    }
  );

  // Custom select for Orders by Hour
  renderCustomSelect(
    document.getElementById("orders-by-hour-filter-wrap"),
    [
      { value: "orders", label: window.t_anl('charts.byOrders') },
      { value: "revenue", label: window.t_anl('charts.byRevenue') }
    ],
    _chartsState.ordersByHourFilter,
    function(val) {
      _chartsState.ordersByHourFilter = val;
      try {
        _renderOrdersByHour(orders, val);
      } catch (e) {
        console.error("[Analytics] Error refreshing Orders by Hour filter:", e);
      }
    }
  );

  // Custom select for Top Products
  renderCustomSelect(
    document.getElementById("top-products-filter-wrap"),
    [
      { value: "revenue", label: window.t_anl('charts.byRevenue') },
      { value: "orders", label: window.t_anl('charts.byOrders') }
    ],
    _chartsState.topProductsFilter,
    function(val) {
      _chartsState.topProductsFilter = val;
      try {
        _renderTopProducts(orders, val);
      } catch (e) {
        console.error("[Analytics] Error refreshing Top Products filter:", e);
      }
    }
  );
}

// ── 1. Orders Per Day (line chart) ────────────────────────────────────────────

function _renderOrdersPerDay(orders, dateRange) {
  var canvas = document.getElementById("canvas-orders-per-day");
  if (!canvas || !window.Chart) return;

  // Build daily buckets
  var buckets = {};
  orders.forEach(function(o) {
    if (!o.date) return;
    var day = "";
    if (typeof o.date === "string") {
      day = o.date.slice(0, 10);
    } else if (o.date && typeof o.date.toISOString === "function") {
      day = o.date.toISOString().slice(0, 10);
    } else if (o.date) {
      try {
        day = new Date(o.date).toISOString().slice(0, 10);
      } catch (err) {}
    }
    if (day) {
      buckets[day] = (buckets[day] || 0) + 1;
    }
  });

  var labels = Object.keys(buckets).sort();
  var data   = labels.map(function(d) { return buckets[d]; });

  // Calculate peak day and maximum daily count for visual insights
  var maxVal = 0;
  var peakDay = "";
  labels.forEach(function(d) {
    if (buckets[d] > maxVal) {
      maxVal = buckets[d];
      peakDay = d;
    }
  });

  var subtitleEl = document.getElementById("orders-per-day-subtitle");
  if (subtitleEl) {
    if (maxVal > 0) {
      var peakFormatted = formatAnalyticsDate(peakDay, { month: "short", day: "numeric" });
      subtitleEl.innerHTML = window.t_anl('charts.subtitlePeak', { count: maxVal, date: peakFormatted });
    } else {
      subtitleEl.innerHTML = window.t_anl('charts.subtitleDaily');
    }
  }

  if (labels.length === 0) { _showChartEmpty(canvas); return; }

  _restoreChartCanvas(canvas);

  if (_chartRegistry["orders-per-day"]) {
    try { _chartRegistry["orders-per-day"].destroy(); } catch (e) {}
    delete _chartRegistry["orders-per-day"];
  }

  var ctx = canvas.getContext("2d");
  var gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, "rgba(124, 107, 255, 0.35)");
  gradient.addColorStop(1, "rgba(124, 107, 255, 0.0)");

  _chartRegistry["orders-per-day"] = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels.map(function(d) {
        return formatAnalyticsDate(d, { month: "short", day: "numeric" });
      }),
      datasets: [{
        label: window.t_anl('charts.ordersLabel'),
        data: data,
        borderColor: "#8b5cf6",
        backgroundColor: gradient,
        borderWidth: 2,
        pointBackgroundColor: "#8b5cf6",
        pointBorderColor: "#090d1a",
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
      }],
    },
    options: _baseOptions({ yBeginAtZero: true }),
  });
}

// ── 2. Real vs Missed (donut) ─────────────────────────────────────────────────

function _renderRealVsMissed(orders) {
  var canvas = document.getElementById("canvas-real-vs-missed");
  if (!canvas || !window.Chart) return;

  var real   = orders.filter(function(o) { return o.source !== "missed"; }).length;
  var missed = orders.filter(function(o) { return o.source === "missed"; }).length;
  var total  = real + missed;

  if (total === 0) { _showChartEmpty(canvas); return; }

  _restoreChartCanvas(canvas);

  if (_chartRegistry["real-vs-missed"]) {
    try { _chartRegistry["real-vs-missed"].destroy(); } catch (e) {}
    delete _chartRegistry["real-vs-missed"];
  }

  var realPct = total > 0 ? Math.round((real / total) * 100) : 0;
  var missedPct = total > 0 ? Math.round((missed / total) * 100) : 0;

  var legendRoot = document.getElementById("donut-legend-root");
  if (legendRoot) {
    legendRoot.innerHTML = `
      <div class="donut-legend-item">
        <div class="legend-item-title">
          <span class="legend-dot green"></span>
          <span class="legend-label">` + window.t_anl('charts.delivered') + `</span>
        </div>
        <div class="legend-item-numbers">
          <strong>${real}</strong>
          <span class="legend-sub">(${realPct}%)</span>
        </div>
      </div>
      <div class="donut-legend-item">
        <div class="legend-item-title">
          <span class="legend-dot red"></span>
          <span class="legend-label">` + window.t_anl('charts.failed') + `</span>
        </div>
        <div class="legend-item-numbers">
          <strong>${missed}</strong>
          <span class="legend-sub">(${missedPct}%)</span>
        </div>
      </div>
    `;
  }

  _chartRegistry["real-vs-missed"] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: [window.t_anl('charts.delivered'), window.t_anl('charts.failed')],
      datasets: [{
        data: [real, missed],
        backgroundColor: ["#10b981", "#ef4444"],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      cutout: "75%",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: _cssVar("--bg3") || "#0d1324",
          borderColor: _cssVar("--border") || "#2a3347",
          borderWidth: 1,
          cornerRadius: 8,
          titleColor: _cssVar("--text") || "#e8eaf0",
          bodyColor: _cssVar("--text2") || "#8892a4",
          padding: 10,
          callbacks: { label: function(ctx) {
            var pct = Math.round((ctx.parsed / total) * 100);
            return " " + ctx.label + ": " + ctx.parsed + " (" + pct + "%)";
          }}
        },
      },
    },
    plugins: [{
      id: "centre-label",
      beforeDraw: function(chart) {
        if (!chart.chartArea) return;
        var ctx2 = chart.ctx;
        var cx   = chart.width / 2;
        var cy   = chart.height / 2;
        ctx2.save();
        ctx2.textAlign    = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillStyle    = _cssVar("--text") || "#ffffff";
        ctx2.font         = "bold 26px 'Inter', sans-serif";
        ctx2.fillText(total.toLocaleString("en-US"), cx, cy - 8);
        ctx2.fillStyle = _cssVar("--text3") || "#8892a4";
        ctx2.font      = "600 12px 'Inter', sans-serif";
        ctx2.fillText(window.t_anl('charts.total'), cx, cy + 16);
        ctx2.restore();
      },
    }],
  });
}

// ── 3. Top Cities (custom HTML list) ─────────────────────────────────────────
var _topCitiesState = {
  page: 1,
  perPage: 7,
  mode: "orders",
};

function _renderTopCities(orders, filterMode) {
  filterMode = filterMode || "orders";
  var root = document.getElementById("top-cities-root");
  if (!root) return;
  if (_topCitiesState.mode !== filterMode) {
    _topCitiesState.mode = filterMode;
    _topCitiesState.page = 1;
  }

  var counts = {};
  orders.forEach(function(o) {
    if (!o.city) return;
    var c = o.city.trim();
    if (!counts[c]) counts[c] = { count: 0, revenue: 0 };
    counts[c].count++;
    counts[c].revenue += analyticsDashboardRevenueValue(o);
  });

  var sorted = Object.keys(counts)
    .map(function(k) { 
      return { label: k, count: counts[k].count, revenue: counts[k].revenue }; 
    });

  if (filterMode === "revenue") {
    sorted.sort(function(a, b) { return b.revenue - a.revenue; });
  } else {
    sorted.sort(function(a, b) { return b.count - a.count; });
  }
  
  if (sorted.length === 0) {
    root.innerHTML = '<div class="chart-empty">' + window.t_anl('charts.noCityData') + '</div>';
    return;
  }
  var totalCities = sorted.length;
  var totalPages = Math.max(1, Math.ceil(totalCities / _topCitiesState.perPage));
  if (_topCitiesState.page > totalPages) _topCitiesState.page = totalPages;
  var startIndex = (_topCitiesState.page - 1) * _topCitiesState.perPage;
  var visibleCities = sorted.slice(startIndex, startIndex + _topCitiesState.perPage);

  var maxVal = 1;
  if (filterMode === "revenue") {
    maxVal = sorted[0].revenue || 1;
  } else {
    maxVal = sorted[0].count || 1;
  }

  var html = '<div class="top-cities-list">';
  visibleCities.forEach(function(c) {
    var displayVal = "";
    var pct = 0;
    if (filterMode === "revenue") {
      displayVal = c.revenue.toLocaleString("en-SA", { maximumFractionDigits: 0 }) + " SAR";
      pct = Math.round((c.revenue / maxVal) * 100);
    } else {
      displayVal = c.count.toLocaleString("en-US") + " " + window.t_anl('charts.ordersLabel');
      pct = Math.round((c.count / maxVal) * 100);
    }

    var formattedLabel = c.label;
    if (c.label.includes("(") && c.label.includes(")")) {
      formattedLabel = c.label.replace(" (", "<br>(");
    } else if (c.label.length > 15) {
      var firstSpace = c.label.indexOf(" ", 10);
      if (firstSpace !== -1) {
        formattedLabel = c.label.slice(0, firstSpace) + "<br>" + c.label.slice(firstSpace + 1);
      }
    }
    html += `
      <div class="top-city-item">
        <div class="top-city-name">${formattedLabel}</div>
        <div class="top-city-bar-wrap">
          <div class="top-city-bar" style="width:${pct}%"></div>
        </div>
        <div class="top-city-value" style="width: auto !important; min-width: 48px; text-align: right; white-space: nowrap;">${displayVal}</div>
      </div>
    `;
  });
  html += '</div>';
  if (totalPages > 1) {
    html += _analyticsMiniPaginationHtml(
      "top-cities",
      _topCitiesState.page,
      totalPages,
      startIndex + 1,
      Math.min(startIndex + visibleCities.length, totalCities),
      totalCities
    );
  }
  root.innerHTML = html;

  var prev = root.querySelector('[data-top-cities-page="prev"]');
  var next = root.querySelector('[data-top-cities-page="next"]');
  var pageBtns = root.querySelectorAll("[data-top-cities-page-num]");
  if (prev) prev.addEventListener("click", function() {
    if (_topCitiesState.page > 1) {
      _topCitiesState.page--;
      _renderTopCities(orders, filterMode);
    }
  });
  if (next) next.addEventListener("click", function() {
    if (_topCitiesState.page < totalPages) {
      _topCitiesState.page++;
      _renderTopCities(orders, filterMode);
    }
  });
  pageBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var p = parseInt(btn.dataset.topCitiesPageNum, 10);
      if (!isNaN(p)) {
        _topCitiesState.page = p;
        _renderTopCities(orders, filterMode);
      }
    });
  });
}

function _analyticsMiniPaginationHtml(prefix, currentPage, totalPages, start, end, total) {
  var pageNums = [];
  var win = 1;
  for (var p = Math.max(1, currentPage - win); p <= Math.min(totalPages, currentPage + win); p++) {
    pageNums.push(p);
  }
  var showFirst = pageNums[0] > 1;
  var showLast = pageNums[pageNums.length - 1] < totalPages;
  var dataPrev = prefix === "top-cities" ? 'data-top-cities-page="prev"' : 'data-insights-page="prev"';
  var dataNext = prefix === "top-cities" ? 'data-top-cities-page="next"' : 'data-insights-page="next"';
  var dataPage = prefix === "top-cities" ? "data-top-cities-page-num" : "data-insights-page-num";
  return `
    <div class="analytics-mini-pagination explorer-pagination">
      <div class="explorer-pagination-info">
        ${window.t_anl('table.paginationInfo', { start: start.toLocaleString("en-US"), end: end.toLocaleString("en-US"), total: total.toLocaleString("en-US") })}
      </div>
      <div class="explorer-pagination-controls">
        <button class="pagination-btn pagination-arrow-btn" ${dataPrev} ${currentPage <= 1 ? "disabled" : ""} aria-label="${window.t_anl('table.prev')}">←</button>
        ${showFirst ? `<button class="pagination-btn" ${dataPage}="1">1</button><span class="pagination-ellipsis">…</span>` : ""}
        ${pageNums.map(function(p) { return `<button class="pagination-btn${p === currentPage ? " active" : ""}" ${dataPage}="${p}">${p}</button>`; }).join("")}
        ${showLast ? `<span class="pagination-ellipsis">…</span><button class="pagination-btn" ${dataPage}="${totalPages}">${totalPages}</button>` : ""}
        <button class="pagination-btn pagination-arrow-btn" ${dataNext} ${currentPage >= totalPages ? "disabled" : ""} aria-label="${window.t_anl('table.next')}">→</button>
      </div>
    </div>`;
}

// ── 4. Top Products (ranking list with progress-bar grids) ───────────────────

// Deterministic color from product name — same product always = same color
function _productColor(name) {
  var palette = [
    "#8b5cf6","#3b82f6","#10b981","#f59e0b","#ef4444",
    "#ec4899","#14b8a6","#f97316","#06b6d4","#6366f1"
  ];
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return palette[Math.abs(hash) % palette.length];
}

// Generate premium product category vector SVG icons
function _getProductPlaceholderSvg(name, color) {
  var cleanName = (name || "").toLowerCase();
  
  // Safe / Vault
  if (cleanName.includes("safe") || cleanName.includes("خزنة") || cleanName.includes("خزنه") || cleanName.includes("صندوق")) {
    return `
      <svg class="product-placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; display: block;">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="12" cy="12" r="3"></circle>
        <line x1="12" y1="9" x2="12" y2="15"></line>
        <line x1="9" y1="12" x2="15" y2="12"></line>
      </svg>
    `;
  }
  
  // Lock / Security
  if (cleanName.includes("lock") || cleanName.includes("door") || cleanName.includes("قفل") || cleanName.includes("باب")) {
    return `
      <svg class="product-placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; display: block;">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        <circle cx="12" cy="16" r="1.5"></circle>
      </svg>
    `;
  }
  
  // Camera
  if (cleanName.includes("camera") || cleanName.includes("cam") || cleanName.includes("كاميرا") || cleanName.includes("مراقبة")) {
    return `
      <svg class="product-placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; display: block;">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
    `;
  }
  
  // Detector / Alarm / Sensor
  if (cleanName.includes("detector") || cleanName.includes("alarm") || cleanName.includes("sensor") || cleanName.includes("كاشف") || cleanName.includes("حساس") || cleanName.includes("جرس")) {
    return `
      <svg class="product-placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; display: block;">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="6"></circle>
        <circle cx="12" cy="12" r="1.5"></circle>
      </svg>
    `;
  }
  
  // Bulb / Light
  if (cleanName.includes("bulb") || cleanName.includes("light") || cleanName.includes("لمبة") || cleanName.includes("مصباح") || cleanName.includes("اضاءة")) {
    return `
      <svg class="product-placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; display: block;">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .6 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path>
        <line x1="9" y1="18" x2="15" y2="18"></line>
        <line x1="10" y1="22" x2="14" y2="22"></line>
      </svg>
    `;
  }
  
  // Generic box/package
  return `
    <svg class="product-placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; display: block;">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  `;
}

// Extract 1-2 initials — works for Arabic and Latin
function _productInitials(name) {
  var clean = name.trim();
  if (!clean) return "?";
  var isArabic = /[؀-ۿ]/.test(clean);
  if (isArabic) {
    return clean.slice(0, 2);
  }
  var words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function _renderTopProducts(orders, filterMode) {
  filterMode = filterMode || "revenue";
  var root = document.getElementById("top-products-root");
  if (!root) return;

  // Aggregate by productName — count orders + sum revenue
  var map = {};
  orders.forEach(function(o) {
    var k = (o.productName || "Unknown").trim();
    if (!map[k]) map[k] = { name: k, count: 0, revenue: 0 };
    map[k].count++;
    map[k].revenue += analyticsDashboardRevenueValue(o);
  });

  var sorted = Object.values(map);
  if (filterMode === "orders") {
    sorted.sort(function(a, b) { return b.count - a.count; });
  } else {
    sorted.sort(function(a, b) { return b.revenue - a.revenue; });
  }
  sorted = sorted.slice(0, 5);

  if (sorted.length === 0) {
    root.innerHTML = '<div class="chart-empty">' + window.t_anl('charts.noProductData') + '</div>';
    return;
  }

  var maxVal = 1;
  if (filterMode === "orders") {
    maxVal = sorted[0].count || 1;
  } else {
    maxVal = sorted[0].revenue || 1;
  }

  var html = '<div class="top-products-list">';
  sorted.forEach(function(p) {
    var color  = _productColor(p.name);
    var placeholderSvg = _getProductPlaceholderSvg(p.name, color);
    
    var displayVal = "";
    var relativePct = 0;
    if (filterMode === "orders") {
      displayVal = p.count.toLocaleString("en-US") + " " + window.t_anl('charts.ordersLabel');
      relativePct = Math.round((p.count / maxVal) * 100);
    } else {
      displayVal = p.revenue.toLocaleString("en-SA", { maximumFractionDigits: 0 }) + " SAR";
      relativePct = Math.round((p.revenue / maxVal) * 100);
    }
    
    html += `
      <div class="top-product-item-wrap">
        <div class="top-product-item">
          <div class="top-product-avatar" style="background:${color}10; border: 1px solid ${color}25;">
            ${placeholderSvg}
          </div>
          <div class="top-product-info">
            <div class="top-product-name" title="${p.name}">${p.name}</div>
          </div>
          <div class="top-product-revenue">${displayVal}</div>
        </div>
        <div class="top-product-progress-wrap">
          <div class="top-product-progress-bar" style="width:${relativePct}%; background:${color};"></div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  html += '<div class="top-products-card-action"><button class="top-products-ops-btn" id="top-products-ops-btn" type="button">' + window.t_anl('charts.productPerformanceCta') + '</button></div>';
  root.innerHTML = html;
  var productPerfBtn = root.querySelector("#top-products-ops-btn");
  if (productPerfBtn) {
    productPerfBtn.addEventListener("click", function() {
      window._opsFocusProductPerformance = true;
      if (typeof goToOperations === "function") {
        goToOperations();
      }
    });
  }
}

// ── 5. Orders by Hour (bar chart) ─────────────────────────────────────────────

function _renderOrdersByHour(orders, filterMode) {
  filterMode = filterMode || "orders";
  var canvas = document.getElementById("canvas-orders-by-hour");
  if (!canvas || !window.Chart) return;

  _restoreChartCanvas(canvas);
  var hourCounts = new Array(24).fill(0);
  var hasHourData = false;
  orders.forEach(function(o) {
    var d = _analyticsOrderHourDate(o);
    if (!d) return;
    var hour = d.getHours();
    if (hour >= 0 && hour < 24) {
      hasHourData = true;
      if (filterMode === "revenue") {
        hourCounts[hour] += analyticsDashboardRevenueValue(o);
      } else {
        hourCounts[hour]++;
      }
    }
  });

  var labels = Array.from({ length: 24 }, function(_, h) {
    return (h % 12 || 12) + (h < 12 ? "am" : "pm");
  });

  var tooltipCallbacks = null;
  if (filterMode === "revenue") {
    tooltipCallbacks = {
      label: function(context) {
        var val = context.parsed.y;
        var formatted = new Intl.NumberFormat("en-SA", {
          style: "currency", currency: "SAR",
          minimumFractionDigits: 0, maximumFractionDigits: 0
        }).format(val);
        return " " + window.t_anl('charts.revenueMetric') + ": " + formatted;
      }
    };
  }

  if (!hasHourData) {
    if (_chartRegistry["orders-by-hour"]) {
      try { _chartRegistry["orders-by-hour"].destroy(); } catch (e) {}
      delete _chartRegistry["orders-by-hour"];
    }
    _showChartEmpty(canvas, window.t_anl('charts.noHourlyData'));
    return;
  }

  if (_chartRegistry["orders-by-hour"]) {
    try { _chartRegistry["orders-by-hour"].destroy(); } catch (e) {}
    delete _chartRegistry["orders-by-hour"];
  }

  _chartRegistry["orders-by-hour"] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: filterMode === "revenue" ? window.t_anl('charts.revenueMetric') : window.t_anl('charts.ordersLabel'),
        data: hourCounts,
        backgroundColor: "#7c6bff",
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: _baseOptions({
      yBeginAtZero: true,
      tooltipCallbacks: tooltipCallbacks
    }),
  });
}

// ── 6. Delivery Funnel (custom horizontal block pipeline) ────────────────────

function _analyticsOrderHourDate(order) {
  var candidates = [
    order && order.date,
    order && order.createdAt,
    order && order.created_at,
    order && order.orderDate,
    order && order.order_date,
    order && order.submittedAt,
    order && order.submitted_at,
    order && order.updatedAt,
    order && order.updated_at,
    order && order.runStartedAt,
    order && order.runTimestamp,
    order && order.runDate
  ];

  for (var i = 0; i < candidates.length; i++) {
    var parsed = _analyticsParseDateWithTime(candidates[i]);
    if (parsed) return parsed;
  }
  return null;
}

function _analyticsParseDateWithTime(value) {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    var fromNumber = new Date(value);
    return isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  var raw = String(value).trim();
  if (!raw || !/\d{1,2}:\d{2}/.test(raw)) return null;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z?$/.test(raw)) return null;

  var dm = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (dm) {
    var a = Number(dm[1]);
    var b = Number(dm[2]);
    var y = Number(dm[3]);
    var hour = Number(dm[4] || 0);
    var minute = Number(dm[5] || 0);
    var second = Number(dm[6] || 0);
    var meridian = (dm[7] || "").toUpperCase();
    if (meridian === "PM" && hour < 12) hour += 12;
    if (meridian === "AM" && hour === 12) hour = 0;

    var day = a;
    var month = b;
    if (a <= 12 && b > 12) {
      month = a;
      day = b;
    }
    var localDate = new Date(y, month - 1, day, hour, minute, second);
    return isNaN(localDate.getTime()) ? null : localDate;
  }

  var normalized = raw.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/, "$1T$2");
  var parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function _renderDeliveryFunnel(orders) {
  var root = document.getElementById("funnel-root");
  if (!root) return;

  var total = orders.length;
  if (total === 0) { root.innerHTML = '<div class="chart-empty">' + window.t_anl('charts.noOrdersYet') + '</div>'; return; }

  // Map statuses
  var pendingVal = orders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "pending" || s === "قيد الانتظار";
  }).length;
  var confirmedVal = orders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "confirmed" || s === "تم التأكيد";
  }).length;
  var waitingVal = orders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "waiting" || s === "wait" || s === "في الانتظار";
  }).length;
  var processingVal = orders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "under processing" || s === "processing" || s === "جاري التجهيز";
  }).length;
  var shippingVal = orders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "in shipping" || s === "shipping" || s === "جاري الشحن";
  }).length;
  var deliveredVal = orders.filter(function(o) {
    var s = (o.orderStatus || "").toLowerCase();
    return s === "delivered" || s === "تم التوصيل";
  }).length;

  // Taager dashboard/status/NDR migration: when the shared status map is
  // loaded, replace the older English/TAAGER buckets with Taager Arabic buckets.
  if (window.TaagerStatus) {
    pendingVal = 0;
    confirmedVal = 0;
    waitingVal = 0;
    processingVal = 0;
    shippingVal = 0;
    deliveredVal = 0;
    orders.forEach(function (o) {
      var bucket = window.TaagerStatus.normalize(o && o.orderStatus).bucket;
      if (bucket === "delivered") deliveredVal++;
      else if (bucket === "confirmed") confirmedVal++;
      else if (bucket === "shipping" || bucket === "delivery_suspended") shippingVal++;
      else if (bucket === "waiting" || bucket === "on_hold" || bucket === "out_of_stock") waitingVal++;
      else if (bucket === "received" || bucket === "after_sales_done" || bucket === "after_sales_progress") processingVal++;
      else if (bucket === "customer_refused_confirmation" || bucket === "failed" || bucket === "return_verified") pendingVal++;
    });
  }

  function pct(n) { return total > 0 ? ((n / total) * 100).toFixed(1) : "0.0"; }

  root.innerHTML = `
    <div class="delivery-funnel-pipeline">
      <div class="funnel-block pending">
        <div class="funnel-block-icon">⏱</div>
        <div class="funnel-block-text">
          <div class="funnel-block-label">` + window.t_anl('charts.pending') + `</div>
          <div class="funnel-block-stats">
            <span class="funnel-block-val">${pendingVal}</span>
            <span class="funnel-block-pct">${pct(pendingVal)}%</span>
          </div>
        </div>
      </div>
      
      <div class="funnel-connector pending-to-processing">
        <div class="funnel-connector-line"></div>
        <div class="funnel-connector-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>

      <div class="funnel-block confirmed">
        <div class="funnel-block-icon">OK</div>
        <div class="funnel-block-text">
          <div class="funnel-block-label">` + window.t_anl('charts.confirmed') + `</div>
          <div class="funnel-block-stats">
            <span class="funnel-block-val">${confirmedVal}</span>
            <span class="funnel-block-pct">${pct(confirmedVal)}%</span>
          </div>
        </div>
      </div>

      <div class="funnel-connector confirmed-to-waiting">
        <div class="funnel-connector-line"></div>
        <div class="funnel-connector-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>

      <div class="funnel-block waiting">
        <div class="funnel-block-icon">...</div>
        <div class="funnel-block-text">
          <div class="funnel-block-label">` + window.t_anl('charts.waiting') + `</div>
          <div class="funnel-block-stats">
            <span class="funnel-block-val">${waitingVal}</span>
            <span class="funnel-block-pct">${pct(waitingVal)}%</span>
          </div>
        </div>
      </div>

      <div class="funnel-connector waiting-to-processing">
        <div class="funnel-connector-line"></div>
        <div class="funnel-connector-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>

      <div class="funnel-block processing">
        <div class="funnel-block-icon">📦</div>
        <div class="funnel-block-text">
          <div class="funnel-block-label">` + window.t_anl('charts.processing') + `</div>
          <div class="funnel-block-stats">
            <span class="funnel-block-val">${processingVal}</span>
            <span class="funnel-block-pct">${pct(processingVal)}%</span>
          </div>
        </div>
      </div>

      <div class="funnel-connector processing-to-shipping">
        <div class="funnel-connector-line"></div>
        <div class="funnel-connector-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>

      <div class="funnel-block shipping">
        <div class="funnel-block-icon">🚚</div>
        <div class="funnel-block-text">
          <div class="funnel-block-label">` + window.t_anl('charts.shipping') + `</div>
          <div class="funnel-block-stats">
            <span class="funnel-block-val">${shippingVal}</span>
            <span class="funnel-block-pct">${pct(shippingVal)}%</span>
          </div>
        </div>
      </div>

      <div class="funnel-connector shipping-to-delivered">
        <div class="funnel-connector-line"></div>
        <div class="funnel-connector-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>

      <div class="funnel-block delivered">
        <div class="funnel-block-icon">✅</div>
        <div class="funnel-block-text">
          <div class="funnel-block-label">` + window.t_anl('charts.delivered') + `</div>
          <div class="funnel-block-stats">
            <span class="funnel-block-val">${deliveredVal}</span>
            <span class="funnel-block-pct">${pct(deliveredVal)}%</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── 7. Activity Heatmap (Monthly Calendar Grid) ─────────────────────────────

function _renderHeatmap(orders) {
  // Persist orders for navigation re-renders
  if (orders) _chartsState.heatmapOrders = orders;
  else orders = _chartsState.heatmapOrders;

  var root = document.getElementById("heatmap-root");
  if (!root) return;

  var dayCounts = {};
  orders.forEach(function(o) {
    if (!o.date) return;
    var day = "";
    if (typeof o.date === "string") {
      day = o.date.slice(0, 10);
    } else if (o.date && typeof o.date.toISOString === "function") {
      day = o.date.toISOString().slice(0, 10);
    } else if (o.date) {
      try {
        day = new Date(o.date).toISOString().slice(0, 10);
      } catch (err) {}
    }
    if (day) {
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
  });

  // Use stateful year/month, defaulting to current month on first render
  var now = new Date();
  if (_chartsState.heatmapYear === null) _chartsState.heatmapYear = now.getFullYear();
  if (_chartsState.heatmapMonth === null) _chartsState.heatmapMonth = now.getMonth();
  var year = _chartsState.heatmapYear;
  var month = _chartsState.heatmapMonth; // 0-11
  var firstDay = new Date(year, month, 1);
  var lastDay = new Date(year, month + 1, 0);

  var firstDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon...
  var totalDays = lastDay.getDate();

  var cells = [];
  // Pad previous month's trailing days
  var prevMonthLastDay = new Date(year, month, 0).getDate();
  for (var i = firstDayOfWeek - 1; i >= 0; i--) {
    var prevDate = new Date(year, month - 1, prevMonthLastDay - i);
    cells.push({ date: prevDate, isCurrentMonth: false, dayNum: prevDate.getDate() });
  }

  // Current month days
  for (var d = 1; d <= totalDays; d++) {
    var curDate = new Date(year, month, d);
    cells.push({ date: curDate, isCurrentMonth: true, dayNum: d });
  }

  // Pad next month's leading days to make a multiple of 7
  var nextMonthDays = 0;
  while (cells.length % 7 !== 0) {
    nextMonthDays++;
    var nextDate = new Date(year, month + 1, nextMonthDays);
    cells.push({ date: nextDate, isCurrentMonth: false, dayNum: nextMonthDays });
  }

  var displayDate = new Date(year, month, 1);
  var monthName = displayDate.toLocaleString(analyticsLocale(), { month: "long", year: "numeric" });
  var DAY_LABELS = (window._kbotLang || "en") === "ar"
    ? ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var maxCount = Math.max.apply(null, Object.values(dayCounts).concat([1]));

  var cellsHtml = cells.map(function(cell) {
    // Prevent timezone shift by formatting local date components directly instead of using .toISOString()
    var cy = cell.date.getFullYear();
    var cm = String(cell.date.getMonth() + 1).padStart(2, '0');
    var cd = String(cell.date.getDate()).padStart(2, '0');
    var key = cy + "-" + cm + "-" + cd;
    
    var count = dayCounts[key] || 0;
    var isToday = cell.date.toDateString() === new Date().toDateString();
    
    var level = 0;
    if (count > 0) {
      if (count <= 3) level = 1;
      else if (count <= 10) level = 2;
      else if (count <= 25) level = 3;
      else level = 4;
    }

    var cls = "heatmap-cell level-" + level;
    if (!cell.isCurrentMonth) cls += " muted";
    if (isToday) cls += " today";

    var tooltip = key + ": " + count + " order" + (count !== 1 ? "s" : "");
    return '<div class="' + cls + '" title="' + tooltip + '">' + cell.dayNum + '</div>';
  }).join("");

  root.innerHTML = `
    <div class="calendar-heatmap-wrap">
      <div class="heatmap-header">
        <button class="heatmap-arrow" id="heatmap-prev">◀</button>
        <span class="heatmap-month-title">${monthName}</span>
        <button class="heatmap-arrow" id="heatmap-next">▶</button>
      </div>
      <div class="heatmap-weekday-row">
        ${DAY_LABELS.map(l => '<div class="heatmap-weekday">' + l + '</div>').join("")}
      </div>
      <div class="heatmap-calendar-grid">
        ${cellsHtml}
      </div>
      <div class="heatmap-legend" style="display:flex !important; flex-direction:column !important; gap:8px !important; margin-top:12px !important; border-top:1px solid var(--border) !important; padding-top:10px !important; align-items:stretch !important;">
        <div style="font-size:var(--type-micro); font-weight:var(--weight-semibold); color:var(--text3); letter-spacing:0.06em; margin-bottom:8px;">${window.t_anl('charts.heatmapLegend', { default: 'LEGEND (ORDERS / DAY)' })}</div>
        <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px; font-size:var(--type-micro); color:var(--text2); white-space:nowrap;">
            <div class="heatmap-legend-cell level-0" style="width:10px; height:10px; border-radius:2px; flex-shrink:0;"></div>
            <span>${window.t_anl('charts.heatmapLegendValues.noActivity', { default: '0 orders (No activity)' })}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; font-size:var(--type-micro); color:var(--text2); white-space:nowrap;">
            <div class="heatmap-legend-cell level-1" style="width:10px; height:10px; border-radius:2px; background:rgba(16, 185, 129, 0.08); border:1.5px solid #10b981; flex-shrink:0;"></div>
            <span>${window.t_anl('charts.heatmapLegendValues.lowVolume', { default: '1-3 orders (Low volume)' })}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; font-size:var(--type-micro); color:var(--text2); white-space:nowrap;">
            <div class="heatmap-legend-cell level-2" style="width:10px; height:10px; border-radius:2px; background:rgba(245, 158, 11, 0.08); border:1.5px solid #f59e0b; flex-shrink:0;"></div>
            <span>${window.t_anl('charts.heatmapLegendValues.mediumVolume', { default: '4-10 orders (Medium volume)' })}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; font-size:var(--type-micro); color:var(--text2); white-space:nowrap;">
            <div class="heatmap-legend-cell level-3" style="width:10px; height:10px; border-radius:2px; background:rgba(239, 68, 68, 0.08); border:1.5px solid #ef4444; flex-shrink:0;"></div>
            <span>${window.t_anl('charts.heatmapLegendValues.highVolume', { default: '11-25 orders (High volume)' })}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; font-size:var(--type-micro); color:var(--text2); white-space:nowrap;">
            <div class="heatmap-legend-cell level-4" style="width:10px; height:10px; border-radius:2px; background:rgba(139, 92, 246, 0.08); border:1.5px solid #8b5cf6; flex-shrink:0;"></div>
            <span>${window.t_anl('charts.heatmapLegendValues.peakVolume', { default: '26+ orders (Peak volume)' })}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#heatmap-prev")?.addEventListener("click", function() {
    _chartsState.heatmapMonth--;
    if (_chartsState.heatmapMonth < 0) {
      _chartsState.heatmapMonth = 11;
      _chartsState.heatmapYear--;
    }
    _renderHeatmap(null);
  });
  root.querySelector("#heatmap-next")?.addEventListener("click", function() {
    _chartsState.heatmapMonth++;
    if (_chartsState.heatmapMonth > 11) {
      _chartsState.heatmapMonth = 0;
      _chartsState.heatmapYear++;
    }
    _renderHeatmap(null);
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function _baseOptions(opts) {
  opts = opts || {};
  var indexAxis = opts.horizontal ? "y" : "x";
  var base = {
    indexAxis: indexAxis,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0d1324",
        titleColor: "#e8eaf0",
        bodyColor: "#8892a4",
        borderColor: "#2a3347",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
        titleFont: { size: 11, weight: "bold", family: "'Inter', sans-serif" },
        bodyFont: { size: 11, family: "'Inter', sans-serif" },
        callbacks: {
          label: function(context) {
            return " " + context.dataset.label + ": " + context.formattedValue;
          }
        }
      },
    },
    scales: {
      x: {
        beginAtZero: opts.horizontal ? false : (opts.yBeginAtZero || false),
        grid:  { color: "rgba(255,255,255,0.03)", drawTicks: false },
        border: { display: false },
        ticks: { color: "#4a5568", font: { size: 10, family: "'Inter', sans-serif" }, maxRotation: 0 },
      },
      y: {
        beginAtZero: opts.horizontal ? false : (opts.yBeginAtZero || false),
        grid:  { color: "rgba(255,255,255,0.03)", drawTicks: false },
        border: { display: false },
        ticks: { color: "#4a5568", font: { size: 10, family: "'Inter', sans-serif" } },
      },
    },
  };

  if (opts.tooltipCallbacks) {
    base.plugins.tooltip.callbacks = opts.tooltipCallbacks;
  }
  return base;
}

function _cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function _showChartEmpty(canvas, message) {
  canvas.style.display = "none";
  var wrap = canvas.closest(".chart-canvas-wrap");
  if (wrap) {
    var existingEmpty = wrap.querySelector(".chart-empty");
    if (existingEmpty) {
      existingEmpty.remove();
    }
    var emptyDiv = document.createElement("div");
    emptyDiv.className = "chart-empty";
    emptyDiv.textContent = message || window.t_anl('charts.noData');
    wrap.appendChild(emptyDiv);
  }
}

function _restoreChartCanvas(canvas) {
  canvas.style.display = "";
  var wrap = canvas.closest(".chart-canvas-wrap");
  if (wrap) {
    var emptyDiv = wrap.querySelector(".chart-empty");
    if (emptyDiv) {
      emptyDiv.remove();
    }
  }
}
