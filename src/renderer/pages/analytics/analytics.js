// analytics.js — Analytics page entry point
// Wires: analytics-kpis, analytics-charts, analytics-insights, analytics-table
// Depends on: analytics-utils.js globals, window.api
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry — called by app.js / navigation system.
 * @param {Function} onBack - callback to return to the main page
 */
async function renderAnalytics(onBack) {
  const root = document.getElementById("page-analytics");
  if (!root) return;

  // ── Page state ──────────────────────────────────────────────────────────────
  let _allRuns       = [];
  let _activeFilter  = "today";  // "today"|"yesterday"|"last2"|"7d"|"thisMonth"|"custom"
  let _customFrom    = null;
  let _customTo      = null;
  let _activeAccount = "";      // "" = all accounts
  let _isolatedRunId = null;    // null = all runs, string = single run
  let _settingsOpen  = false;
  let _settings      = {};      // { minutesPerOrder }

  // ── Skeleton layout ─────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="sv3-shell" style="height:100%;">

      <!-- ── Shared sidebar nav ── -->
      ${renderSharedSidebar('analytics')}

      <!-- ── Scrollable content area ── -->
      <div class="sv3-content-scroll analytics-scroll-root" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;min-width:0;display:flex;flex-direction:column;position:relative;">

    <!-- ── Skeleton preloader (shown immediately, dismissed after data loads) ── -->
    <div id="anl-skeleton" class="page-skeleton-overlay" style="background:var(--bg);">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.04);flex-shrink:0;">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="sk" style="width:140px;height:22px;border-radius:6px;"></div>
          <div class="sk" style="width:210px;height:13px;border-radius:4px;"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="sk" style="width:345px;height:34px;border-radius:20px;"></div>
          <div class="sk" style="width:34px;height:34px;border-radius:8px;"></div>
        </div>
      </div>
      <!-- 6 KPI cards -->
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;flex-shrink:0;">
        <div class="sk" style="height:96px;border-radius:12px;"></div>
        <div class="sk" style="height:96px;border-radius:12px;"></div>
        <div class="sk" style="height:96px;border-radius:12px;"></div>
        <div class="sk" style="height:96px;border-radius:12px;"></div>
        <div class="sk" style="height:96px;border-radius:12px;"></div>
        <div class="sk" style="height:96px;border-radius:12px;"></div>
      </div>
      <!-- Charts + sidebar -->
      <div style="display:grid;grid-template-columns:1fr 284px;gap:16px;flex:1;min-height:0;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            <div class="sk" style="height:205px;border-radius:12px;"></div>
            <div class="sk" style="height:205px;border-radius:12px;"></div>
            <div class="sk" style="height:205px;border-radius:12px;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
            <div class="sk" style="height:200px;border-radius:12px;"></div>
            <div class="sk" style="height:200px;border-radius:12px;"></div>
            <div class="sk" style="height:200px;border-radius:12px;"></div>
            <div class="sk" style="height:200px;border-radius:12px;"></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="sk" style="height:230px;border-radius:12px;"></div>
          <div class="sk" style="height:190px;border-radius:12px;"></div>
          <div class="sk" style="height:150px;border-radius:12px;"></div>
        </div>
      </div>
      <!-- Orders table -->
      <div class="sk" style="height:300px;border-radius:12px;flex-shrink:0;"></div>
    </div>

    <div class="analytics-page" id="analytics-page">

      <!-- Header — Refactored to feature premium visual segmented tabs & micro-animated refresh -->
      <div class="analytics-header-bar">
        <div class="analytics-header-left">
          <div class="analytics-header-title">${window.t_anl('header.title')}</div>
          <div class="analytics-header-subtitle">${window.t_anl('header.subtitle')}</div>
        </div>
        <div class="analytics-header-right">
          <!-- Premium Segmented Pill Tabs for Date Ranges -->
          <div class="analytics-tabs-group" id="analytics-date-tabs">
            <button class="analytics-tab-btn active" data-filter="today">${window.t_anl('tabs.today')}</button>
            <button class="analytics-tab-btn" data-filter="yesterday">${window.t_anl('tabs.yesterday')}</button>
            <button class="analytics-tab-btn" data-filter="last2">${window.t_anl('tabs.last2')}</button>
            <button class="analytics-tab-btn" data-filter="7d">${window.t_anl('tabs.7d')}</button>
            <button class="analytics-tab-btn" data-filter="thisMonth">${window.t_anl('tabs.thisMonth')}</button>
            <button class="analytics-tab-btn" data-filter="custom">${window.t_anl('tabs.custom')}</button>
          </div>
          
          <!-- Inline Custom Date inputs (dynamically displayed when Custom is active) -->
          <div class="analytics-date-custom-inline" id="date-custom-inputs-inline" style="display:none">
            <input type="date" class="date-input-inline" id="custom-from-inline">
            <span style="color:#64748b; font-size:11px;">${window.t_anl('dateCustom.to')}</span>
            <input type="date" class="date-input-inline" id="custom-to-inline">
            <button class="btn-apply-inline" id="custom-apply-btn-inline">${window.t_anl('dateCustom.apply')}</button>
          </div>

          <!-- Sleek Micro-Animated Premium Refresh Button -->
          <button class="analytics-refresh-btn-premium" id="analytics-refresh-btn" title="Refresh Data">
            <svg class="refresh-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </button>
          <button type="button" class="taager-tour-quick-guide" id="analytics-tour-btn" title="${window.t_anl('tour.common.quickGuide', { default: 'Quick Guide' })}">
            <span class="taager-tour-guide-mark">?</span><span>${window.t_anl('tour.common.quickGuide', { default: 'Quick Guide' })}</span>
          </button>
        </div>
      </div>

      <!-- Account selector (rendered dynamically) -->
      <div class="analytics-account-tabs" id="analytics-account-tabs"></div>

      <div class="analytics-first-run-guidance" id="analytics-first-run-guidance" style="display:none;margin:0 20px 14px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg2);align-items:center;justify-content:space-between;gap:14px;box-shadow:0 10px 28px rgba(0,0,0,.10);">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:3px;">${window.t_anl('empty.bannerTitle', { default: 'Analytics is ready' })}</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.5;">${window.t_anl('empty.bannerDesc', { default: 'Run the bot once to start filling these sections with real orders, revenue, COD, delivery, and failure data.' })}</div>
        </div>
        <button type="button" class="btn btn-primary" id="analytics-first-run-btn" style="white-space:nowrap;font-size:12px;padding:8px 12px;">${window.t_anl('empty.runAction', { default: 'Go to Run' })}</button>
      </div>

      <!-- Isolated run banner -->
      <div class="analytics-run-banner" id="analytics-run-banner" style="display:none">
        <span id="run-banner-label">${window.t_anl('runBanner.singleRun')}</span>
        <button class="btn btn-ghost" id="run-banner-clear" style="font-size:11px;padding:4px 10px">${window.t_anl('runBanner.showAll')}</button>
      </div>

      <!-- KPI row (6 cards, single row — matches reference) -->
      <div id="analytics-kpi-section"></div>

      <!-- Main body: left charts column + right sidebar (Smart Insights + Activity Timeline) -->
      <div class="analytics-body-layout" id="analytics-body-layout">

        <!-- Left: charts stack & table explorer -->
        <div class="analytics-body-main" id="analytics-body-main">
          <div id="analytics-charts-root"></div>
          <!-- Orders Explorer (inside main column below charts) -->
          <div id="analytics-orders-explorer"></div>
        </div>

        <!-- Right: Smart Insights + Activity Timeline + Run History + Status Breakdown -->
        <div class="analytics-body-sidebar" id="analytics-body-sidebar">
          <div id="analytics-insights-col"></div>
          <div id="analytics-timeline-col"></div>
           <div id="analytics-run-history"></div>
          <div id="analytics-status-breakdown"></div>
        </div>

      </div>

      <!-- Empty state -->
      <div class="analytics-empty" id="analytics-empty" style="display:none">
        <div style="font-size:48px;margin-bottom:12px">📭</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:6px">${window.t_anl('empty.title')}</div>
        <div style="color:var(--text3);font-size:13px;max-width:320px;text-align:center;line-height:1.6;">
          ${window.t_anl('empty.desc')}
        </div>
      </div>

    </div><!-- /analytics-page -->
      </div><!-- /scrollable content -->
    </div><!-- /sv3-shell -->`;
  // ── Load data & settings in parallel; skeleton stays until real render ──────
  // Keep app-level navigation responsive while the Analytics skeleton is visible.
  wireSharedSidebar(root);

  function _previewAnalyticsActive() {
    return window.TaagerPremiumPreview && window.TaagerPremiumPreview.isActive("analytics");
  }

  async function _loadAnalyticsRuns() {
    if (_previewAnalyticsActive()) return window.TaagerPremiumPreview.runs();
    try {
      const r = await window.api.getAnalyticsRuns();
      return Array.isArray(r) ? r : (r?.runs || []);
    } catch (e) {
      console.error("[Analytics] Failed to load runs:", e);
      return [];
    }
  }

  const [runsResp, settingsResp] = await Promise.all([
    _loadAnalyticsRuns(),
    window.api.getAnalyticsSettings().catch(() => ({})),
  ]);
  _allRuns = Array.isArray(runsResp) ? runsResp : [];
  _settings = settingsResp || {};

  // Apply entrance animations to empty containers BEFORE filling content (prevents flash)
  const _enterSections = [
    [".analytics-header-bar",    0],
    ["#analytics-kpi-section",  60],
    ["#analytics-charts-root", 130],
    ["#analytics-body-sidebar", 160],
    ["#analytics-orders-explorer", 220],
  ];
  _enterSections.forEach(([sel, delay]) => {
    const el = document.querySelector(sel);
    if (el) { el.style.setProperty("--anim-delay", delay + "ms"); el.classList.add("anim-fade-up"); }
  });
  // Apply defaultDate on initial load (if set and no user interaction yet)
  if (_settings.defaultDate && _activeFilter === "today") {
    _activeFilter = _settings.defaultDate;
    
    // Proactively synchronize the active state of visual segmented tabs
    const tabs = document.querySelectorAll(".analytics-tab-btn");
    tabs.forEach(btn => {
      if (btn.dataset.filter === _activeFilter) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  // ── Wire sidebar nav ────────────────────────────────────────────────────────
  wireSharedSidebar(root);

  // ── Wire static events ──────────────────────────────────────────────────────
  const refreshBtn = document.getElementById("analytics-refresh-btn");
  refreshBtn?.addEventListener("click", async () => {
    const svgIcon = refreshBtn.querySelector(".refresh-icon-svg");
    if (svgIcon) svgIcon.classList.add("rotating");
    
    _allRuns = await _loadAnalyticsRuns();
    
    // Smooth delay before resolving rotation to make the micro-interaction satisfying
    setTimeout(() => {
      if (svgIcon) svgIcon.classList.remove("rotating");
      _renderPage();
    }, 600);
  });

  if (window.TaagerGuidedTour) {
    const guideOpts = { root };
    document.getElementById("analytics-tour-btn")?.addEventListener("click", () => {
      window.TaagerGuidedTour.start("analytics", guideOpts);
    });
    setTimeout(() => window.TaagerGuidedTour.mountPagePrompt("analytics", guideOpts), 700);
  }

  // Date segmented visual tabs (pills)
  const tabButtons = document.querySelectorAll(".analytics-tab-btn");
  const inlineCustomInputs = document.getElementById("date-custom-inputs-inline");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      _activeFilter = btn.dataset.filter;
      _isolatedRunId = null;
      
      // Update active state in UI
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      // Handle showing custom inline inputs
      if (_activeFilter === "custom") {
        if (inlineCustomInputs) inlineCustomInputs.style.display = "flex";
      } else {
        if (inlineCustomInputs) inlineCustomInputs.style.display = "none";
        _renderPage(); // Filter and render immediately
      }
    });
  });

  // Custom inline date range apply
  document.getElementById("custom-apply-btn-inline")?.addEventListener("click", () => {
    const fromEl = document.getElementById("custom-from-inline");
    const toEl   = document.getElementById("custom-to-inline");
    if (!fromEl?.value || !toEl?.value) return;
    
    _customFrom = new Date(fromEl.value);
    _customTo   = new Date(toEl.value);
    _customTo.setHours(23, 59, 59, 999);
    _isolatedRunId = null;
    
    _renderPage();
  });

  // Run banner clear
  document.getElementById("run-banner-clear")?.addEventListener("click", () => {
    _isolatedRunId = null;
    const banner = document.getElementById("analytics-run-banner");
    if (banner) banner.style.display = "none";
    _renderPage();
  });

  document.getElementById("analytics-first-run-btn")?.addEventListener("click", () => {
    if (typeof goToSetup === "function") goToSetup("run");
  });

  // Smart auto-select: If the default filter yields 0 runs but there are runs available,
  // find the latest run's timestamp and select the narrowest date filter that includes it.
  if (_allRuns.length > 0) {
    const currentRange = _resolveDateRange();
    const currentRuns = _filterRuns(_allRuns, currentRange, _activeAccount);
    if (currentRuns.length === 0) {
      const sorted = [..._allRuns].filter(r => r.runTimestamp).sort((a, b) => b.runTimestamp - a.runTimestamp);
      if (sorted.length > 0) {
        const latestTs = sorted[0].runTimestamp;
        let matchedFilter = null;
        
        // Define ranges locally for comparison
        const candidateFilters = ["today", "yesterday", "last2", "7d", "thisMonth"];
        for (const filter of candidateFilters) {
          const nowVal = new Date();
          const todayVal = new Date(nowVal.getFullYear(), nowVal.getMonth(), nowVal.getDate());
          const endOfDayVal = (d) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };
          let range = null;
          
          if (filter === "today") {
            range = { from: todayVal, to: endOfDayVal(todayVal) };
          } else if (filter === "yesterday") {
            const y = new Date(todayVal); y.setDate(todayVal.getDate() - 1);
            range = { from: y, to: endOfDayVal(y) };
          } else if (filter === "last2") {
            const from = new Date(todayVal); from.setDate(todayVal.getDate() - 1);
            range = { from, to: endOfDayVal(todayVal) };
          } else if (filter === "7d") {
            const from = new Date(todayVal); from.setDate(todayVal.getDate() - 6);
            range = { from, to: endOfDayVal(todayVal) };
          } else if (filter === "thisMonth") {
            const from = new Date(nowVal.getFullYear(), nowVal.getMonth(), 1);
            range = { from, to: endOfDayVal(todayVal) };
          }
          
          if (range && latestTs >= range.from.getTime() && latestTs <= range.to.getTime()) {
            matchedFilter = filter;
            break;
          }
        }
        
        if (matchedFilter) {
          _activeFilter = matchedFilter;
        } else {
          _activeFilter = "thisMonth"; // Default fallback if older than this month
        }
        
        // Synchronize visual segmented tab buttons active classes in the DOM
        const tabs = document.querySelectorAll(".analytics-tab-btn");
        tabs.forEach(btn => {
          if (btn.dataset.filter === _activeFilter) {
            btn.classList.add("active");
          } else {
            btn.classList.remove("active");
          }
        });
      }
    }
  }

  // ── Initial render ──────────────────────────────────────────────────────────
  _renderPage();
  if (window.TaagerPremiumPreview) window.TaagerPremiumPreview.mount(root, "analytics");

  // Fade out skeleton after the first real render has mounted content.
  const skEl = document.getElementById("anl-skeleton");
  if (skEl) {
    requestAnimationFrame(() => {
      skEl.classList.add("sk-exit");
      setTimeout(() => skEl.remove(), 120);
    });
  }

  // ── Core render function ────────────────────────────────────────────────────
  async function _renderPage() {
    const dateRange = _resolveDateRange();
    let runs = _filterRuns(_allRuns, dateRange, _activeAccount);

    // ── showMissed: strip missed-source orders from every run's orders array ──
    const showMissed = _settings.showMissed !== false;
    if (!showMissed) {
      runs = runs.map(r => ({
        ...r,
        orders: (r.orders || []).filter(o => (o.source || "real") !== "missed"),
      }));
    }

    if (_isolatedRunId) {
      runs = runs.filter(r => r.runId === _isolatedRunId);
      const banner = document.getElementById("analytics-run-banner");
      const label  = document.getElementById("run-banner-label");
      if (banner) banner.style.display = "flex";
      if (label && runs[0]) {
        const ts = runs[0].runTimestamp;
        label.textContent = window.t_anl('runBanner.singleRun') + " " + (ts ? new Date(ts).toLocaleString() : "—");
      }
    } else {
      const banner = document.getElementById("analytics-run-banner");
      if (banner) banner.style.display = "none";
    }

    const firstRunGuidance = document.getElementById("analytics-first-run-guidance");
    if (firstRunGuidance) firstRunGuidance.style.display = _allRuns.length === 0 ? "flex" : "none";

    // Account tabs
    _renderAccountTabs(runs);

    const empty = document.getElementById("analytics-empty");
    if (empty) empty.style.display = "none";
    ["analytics-kpi-section","analytics-body-layout","analytics-orders-explorer"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "";
    });

    // Attach allRuns reference for delta calculations
    const kpiContainer = document.getElementById("analytics-kpi-section");
    if (kpiContainer) kpiContainer._allRuns = _allRuns;

    // KPIs
    renderKpiSection(
      document.getElementById("analytics-kpi-section"),
      runs, dateRange, _settings, _activeFilter
    );

    // Charts
    const orders = flattenRuns(runs);
    const chartsRoot = document.getElementById("analytics-charts-root");
    let chartJsLoaded = false;
    try {
      await ensureChartJs();
      chartJsLoaded = true;
    } catch (e) {
      console.error("[Analytics] Chart.js library loading error:", e);
      if (chartsRoot) chartsRoot.innerHTML = '<div class="analytics-chart-error">Charts unavailable — Chart.js failed to load.</div>';
    }

    if (chartJsLoaded) {
      try {
        renderAllCharts(chartsRoot, orders, dateRange);
      } catch (e) {
        console.error("[Analytics] renderAllCharts error:", e);
        if (chartsRoot) chartsRoot.innerHTML = '<div class="analytics-chart-error">Failed to render dashboard charts. Please check console logs.</div>';
      }
    }

    // Insights + Timeline
    const showInsights = _settings.showInsights !== false;
    const insightsCol = document.getElementById("analytics-insights-col");
    if (insightsCol) insightsCol.style.display = showInsights ? "" : "none";
    if (showInsights) {
      renderInsightsPanel(insightsCol, runs, dateRange, _allRuns);
    }
    renderActivityTimeline(document.getElementById("analytics-timeline-col"), runs);

    // Run history sidebar
    // _renderRunHistory(runs);

    // Status breakdown
    _renderStatusBreakdown(orders);

    // Orders Explorer
    renderOrdersExplorer(
      document.getElementById("analytics-orders-explorer"),
      runs, _allRuns
    );

    // Smart Forecasting & Optimization Engine (SEC7)
    // Mount below the full analytics body layout — one per render cycle
    const analyticsPage = document.getElementById("analytics-page");
    if (analyticsPage && typeof renderSmartForecast === "function") {
      // Remove previous instance so it re-renders fresh with new data
      const prev = document.getElementById("smart-forecast-engine");
      if (prev) prev.remove();
      renderSmartForecast(analyticsPage, runs, _settings);
    }
  }

  // ── Date range resolution ───────────────────────────────────────────────────
  function _resolveDateRange() {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = (d) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };

    if (_activeFilter === "today") {
      return { from: today, to: endOfDay(today) };
    }
    if (_activeFilter === "yesterday") {
      const y = new Date(today); y.setDate(today.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    if (_activeFilter === "last2") {
      const from = new Date(today); from.setDate(today.getDate() - 1);
      return { from, to: endOfDay(today) };
    }
    if (_activeFilter === "7d") {
      const from = new Date(today); from.setDate(today.getDate() - 6);
      return { from, to: endOfDay(today) };
    }
    if (_activeFilter === "thisMonth") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: endOfDay(today) };
    }
    if (_activeFilter === "custom" && _customFrom && _customTo) {
      return { from: _customFrom, to: _customTo };
    }
    return null; // fallback: all time
  }

  // ── Filter runs by date range + account ─────────────────────────────────────
  function _filterRuns(allRuns, dateRange, account) {
    let runs = allRuns;
    if (dateRange) {
      runs = runs.filter(r => {
        if (!r.runTimestamp) return false;
        return r.runTimestamp >= dateRange.from.getTime() &&
               r.runTimestamp <= dateRange.to.getTime();
      });
    }
    if (account) {
      runs = runs.filter(r => accountMatches(r, account));
    }
    return runs;
  }

  // ── Account tabs ─────────────────────────────────────────────────────────────
  function _renderAccountTabs(filteredRuns) {
    const tabBar = document.getElementById("analytics-account-tabs");
    if (!tabBar) return;

    const accounts = uniqueAccounts(_allRuns)
      .map(r => ({ key: accountKey(r), label: accountDisplay(r), country: accountCountry(r), email: r.accountEmail || "" }))
      .filter(a => a.key);
    if (accounts.length <= 1) { tabBar.innerHTML = ""; return; }

    const periodRuns   = filteredRuns || _allRuns;
    const periodOrders = flattenRuns(periodRuns);
    const accountKeys = new Set(accounts.map(a => a.key));
    if (_activeAccount && !accountKeys.has(_activeAccount)) {
      _activeAccount = "";
    }

    function countFor(key) {
      return key
        ? periodRuns.filter(r => accountMatches(r, key)).reduce((n, r) => n + (r.orders?.length || 0), 0)
        : periodOrders.length;
    }

    const options = [{ key: "", label: window.t_anl('account.allAccounts'), country: "", email: "" }].concat(accounts).map(a => {
      const email = a.key ? (uniqueAccounts(_allRuns).find(r => accountKey(r) === a.key)?.accountEmail || "") : "";
      const text = a.key ? (a.label || email || a.key) : a.label;
      const countText = `${countFor(a.key).toLocaleString()} ${window.t_anl('account.orders')}`;
      return {
        value: a.key,
        label: `${text}  ${countText}`,
        labelHtml: a.key
          ? accountOptionLabelHtml(`${text}  ${countText}`, a.country)
          : '<span style="display:inline-flex;align-items:center;gap:7px">' + allAccountsCountryFlagsHtml(_allRuns) + '<span>' + analyticsEscapeHtml(`${text}  ${countText}`) + '</span></span>',
        subLabel: a.key
          ? [email && email !== text ? email : "", accountCountryLabel({ taagerCountry: a.country })].filter(Boolean).join(" - ")
          : "",
        searchText: [text, email, a.country, accountCountryLabel({ taagerCountry: a.country }), countText].filter(Boolean).join(" "),
      };
    });

    tabBar.innerHTML = `
      <div class="analytics-account-filter">
        <div class="analytics-account-filter-label">${window.t_anl('account.label')}</div>
        <div class="analytics-account-select-wrap" id="analytics-account-select-wrap"></div>
      </div>`;

    renderCustomSelect(
      tabBar.querySelector("#analytics-account-select-wrap"),
      options,
      _activeAccount,
      function(value) {
        _activeAccount = value;
        _isolatedRunId = null;
        _renderPage();
      },
      { searchable: true, maxHeight: "280px" }
    );
  }

  // ── Run history sidebar ───────────────────────────────────────────────────────
  // function _renderRunHistory(runs) {
  //   const container = document.getElementById("analytics-run-history");
  //   if (!container) return;

  //   const sorted = [...runs].sort((a, b) => (b.runTimestamp || 0) - (a.runTimestamp || 0)).slice(0, 15);

  //   container.innerHTML = `
  //     <div class="run-history-panel">
  //       <div class="run-history-header">🕒 Run History</div>
  //       <div class="run-history-list">
  //         ${sorted.length === 0
  //           ? `<div class="run-history-empty">No runs in this period</div>`
  //           : sorted.map(r => {
  //               const ts      = r.runTimestamp || 0;
  //               const time    = ts ? new Date(ts).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
  //               const isActive = r.runId === _isolatedRunId;
  //               return `
  //                 <div class="run-history-item${isActive ? " active" : ""}" data-run-id="${r.runId}">
  //                   <div class="run-history-time">${time}</div>
  //                   <div class="run-history-meta">
  //                     ${r.ordersSubmitted || 0} orders
  //                     ${r.ordersFailed > 0 ? `· <span style="color:var(--danger)">${r.ordersFailed} failed</span>` : ""}
  //                   </div>
  //                   ${r.accountEmail && r.accountEmail !== "__single__"
  //                     ? `<div class="run-history-account">${_shortEmail(r.accountEmail)}</div>`
  //                     : ""}
  //                 </div>`;
  //             }).join("")}
  //       </div>
  //     </div>`;

  //   container.querySelectorAll(".run-history-item").forEach(item => {
  //     item.addEventListener("click", () => {
  //       const rid = item.dataset.runId;
  //       _isolatedRunId = (_isolatedRunId === rid) ? null : rid;
  //       _renderPage();
  //     });
  //   });
  // }

  // ── Status breakdown widget ───────────────────────────────────────────────────
 
  function _renderStatusBreakdown(orders) {
    const container = document.getElementById("analytics-status-breakdown");
    if (!container) return;

    const counts = {};
    orders.forEach(o => {
      const s = o.orderStatus || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });

    const total   = orders.length || 1;
    const statusOrder = [
      "pending",
      "confirmed",
      "in shipping",
      "shipping",
      "under processing",
      "processing",
      "waiting",
      "delivered",
      "failed",
      "canceled",
      "cancelled"
    ];
    const statusRank = status => {
      const key = String(status || "").toLowerCase();
      const idx = statusOrder.indexOf(key);
      return idx === -1 ? statusOrder.length : idx;
    };
    const entries = Object.entries(counts).sort((a, b) => {
      const rankDiff = statusRank(a[0]) - statusRank(b[0]);
      if (rankDiff) return rankDiff;
      return b[1] - a[1];
    });

    container.innerHTML = `
      <div class="status-breakdown-panel">
        <div class="status-breakdown-header">📊 ${window.t_anl('charts.statusTitle')}</div>
        <div class="status-breakdown-list">
          ${entries.length === 0
            ? `<div style="color:var(--text3);font-size:13px;padding:12px">${window.t_anl('insights.noData')}</div>`
            : entries.map(([status, count]) => {
                const sc  = getStatusColor(status);
                const statusLabel = typeof analyticsStatusLabel === "function" ? analyticsStatusLabel(status) : status;
                const pct = Math.round((count / total) * 100);
                return `
                  <div class="status-breakdown-item">
                    <span class="status-badge" style="background:${sc.bg};color:${sc.text}">${statusLabel}</span>
                    <div class="status-breakdown-bar-wrap">
                      <div class="status-breakdown-bar" style="width:${pct}%;background:${sc.bg}"></div>
                    </div>
                    <span class="status-breakdown-count">${count.toLocaleString()} <span style="color:var(--text3);font-size:10px">(${pct}%)</span></span>
                  </div>`;
              }).join("")}
        </div>
      </div>`;
  }

  // ── Helper ────────────────────────────────────────────────────────────────────
  function _shortEmail(email) {
    if (!email || email === "__single__") return "—";
    return email;
  }
}
