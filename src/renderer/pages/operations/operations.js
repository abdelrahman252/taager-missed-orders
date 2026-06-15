// operations.js — Operations page (matches reference image layout exactly)

async function renderOperations(onBack) {
  const root = document.getElementById("page-operations");
  if (!root) return;

  let _allRuns       = [];
  let _selectedRunId = null;
  let _selectedOrderIdx = 0;
  let _odTablePage = 1;
  let _activeTab = "overview";
  let _activeAccount = "";

  // ── Shell (rendered immediately so skeleton is visible during data fetch) ──
  root.innerHTML = `
    <div class="sv3-shell" style="height:100%;">

      <!-- ── Shared sidebar nav ── -->
      ${renderSharedSidebar('operations')}

      <!-- ── Scrollable content area ── -->
      <div class="sv3-content-scroll operations-scroll-root" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;min-width:0;display:flex;flex-direction:column;position:relative;">

    <!-- ── Skeleton Preloader ── -->
    <div id="ops-skeleton" class="page-skeleton-overlay" style="background:var(--bg);padding:20px;gap:16px;">
      <!-- Row 1: order details + live monitor -->
      <div style="display:grid;grid-template-columns:1fr 1fr 320px;gap:16px;flex-shrink:0;">
        <div class="sk" style="height:260px;border-radius:12px;grid-column:span 2;"></div>
        <div class="sk" style="height:260px;border-radius:12px;"></div>
      </div>
      <!-- Row 2: account perf + insights + run history -->
      <div style="display:grid;grid-template-columns:1fr 1fr 320px;gap:16px;flex-shrink:0;">
        <div class="sk" style="height:180px;border-radius:12px;"></div>
        <div class="sk" style="height:180px;border-radius:12px;"></div>
        <div class="sk" style="height:180px;border-radius:12px;"></div>
      </div>
      <!-- Row 3: product table full width -->
      <div style="flex-shrink:0;">
        <div class="sk" style="height:220px;border-radius:12px;"></div>
      </div>
    </div>

      <div class="ops-page">
      <div class="ops-tour-row">
        <button type="button" class="taager-tour-quick-guide" id="ops-tour-btn" title="${window.t_ops('tour.common.quickGuide', { default: 'Quick Guide' })}">
          <span class="taager-tour-guide-mark">?</span><span>${window.t_ops('tour.common.quickGuide', { default: 'Quick Guide' })}</span>
        </button>
      </div>
      <div class="ops-first-run-guidance" id="ops-first-run-guidance" style="display:none;margin:0 0 14px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg2);align-items:center;justify-content:space-between;gap:14px;box-shadow:0 10px 28px rgba(0,0,0,.10);">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:3px;">${window.t_ops('emptyGuidance.title', { default: 'Operations is ready' })}</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.5;">${window.t_ops('emptyGuidance.body', { default: 'Run the bot once to populate each operations section with run history, order details, account performance, product performance, and live activity.' })}</div>
        </div>
        <button type="button" class="btn btn-primary" id="ops-first-run-btn" style="white-space:nowrap;font-size:12px;padding:8px 12px;">${window.t_ops('emptyGuidance.action', { default: 'Go to Run' })}</button>
      </div>
      <div class="ops-account-tabs" id="ops-account-tabs"></div>
      <div class="ops-grid" id="ops-main-grid">

        <!-- ROW 1 col1: Order Details -->
        <div class="ops-order-details-panel" id="ops-order-details-panel">
          <div class="ops-od-topbar">
            <div class="ops-od-topbar-title">📋 ${window.t_ops('orderDetails.title')}</div>
            <button class="ops-link-btn" id="ops-back-to-orders">${window.t_ops('orderDetails.backToOrders')}</button>
          </div>
          <div id="ops-od-content">
            ${_opsOrderDetailsEmptyHTML()}
          </div>
        </div>

        <!-- ROW 1-2 col3: Live Monitor (tall, spans rows 1-2) -->
        <div id="ops-monitor-mount"></div>

        <!-- ROW 2 col1: Account Performance -->
        <div id="ops-perf-mount"></div>

        <!-- ROW 2 col2: Smart Insights -->
        <div id="ops-insights-mount"></div>

        <!-- ROW 3 col1-2: Product Performance (wide) -->
        <div id="ops-product-mount"></div>

        <!-- ROW 3 col3: Run History (below monitor) -->
        <div id="ops-history-mount"></div>

      </div>
    </div><!-- /ops-page -->
      </div><!-- /scrollable content -->
    </div><!-- /sv3-shell -->`;
  // ── Fetch data first; the optimized IPC path keeps this fast and stable ─────
  // Keep app-level navigation responsive while the Operations skeleton is visible.
  wireSharedSidebar(root);

  async function _loadOperationRuns() {
    if (window.TaagerPremiumPreview && window.TaagerPremiumPreview.isActive("operations")) {
      return window.TaagerPremiumPreview.runs();
    }
    try {
      const r = await window.api.getAnalyticsRuns();
      return Array.isArray(r) ? r : (r?.runs || []);
    } catch(e) {
      return [];
    }
  }

  _allRuns = await _loadOperationRuns();

  // Apply entrance animation classes to mount points BEFORE filling content
  const _opsPanels = [
    ["#ops-order-details-panel",   0],   // row 1 left
    ["#ops-monitor-mount",        60],   // row 1 right
    ["#ops-perf-mount",          130],   // row 2 left
    ["#ops-insights-mount",      170],   // row 2 mid
    ["#ops-history-mount",       210],   // row 2 right
    ["#ops-product-mount",       270],   // row 3 full width
  ];
  _opsPanels.forEach(([sel, delay]) => {
    const el = root.querySelector(sel);
    if (el) { el.style.setProperty("--anim-delay", delay + "ms"); el.classList.add("anim-fade-up"); }
  });

  // ── Render all panels ──────────────────────────────────────────────────────
  _renderPanels();
  if (window.TaagerPremiumPreview) window.TaagerPremiumPreview.mount(root, "operations");

  // Fade out skeleton only after the first real panels are in the DOM.
  const opsSk = document.getElementById("ops-skeleton");
  if (opsSk) {
    requestAnimationFrame(() => {
      opsSk.classList.add("sk-exit");
      setTimeout(() => opsSk.remove(), 120);
    });
  }

  // ── Wire sidebar nav ────────────────────────────────────────────────────────
  // Back button (order details panel)
  root.querySelector("#ops-back-to-orders")?.addEventListener("click", _clearOrderDetails);
  root.addEventListener("click", (e) => {
    if (e.target.closest("#ops-scroll-history")) _scrollToRunHistory();
    if (e.target.closest("#ops-first-run-btn") && typeof goToSetup === "function") goToSetup("run");
  });
  if (window._opsFocusProductPerformance) {
    window._opsFocusProductPerformance = false;
    setTimeout(_scrollToProductPerformance, 120);
  }

  if (root._opsRunsUpdatedHandler) {
    window.removeEventListener("taager-analytics-runs-updated", root._opsRunsUpdatedHandler);
  }
  root._opsRunsUpdatedHandler = async function opsRunsUpdatedHandler() {
    try {
      _allRuns = await _loadOperationRuns();
      _renderPanels({ selectLatest: false });
    } catch (e) {
      console.warn("[Operations] Failed to refresh runs:", e);
    }
  };
  window.addEventListener("taager-analytics-runs-updated", root._opsRunsUpdatedHandler);

  if (window.TaagerGuidedTour) {
    const guideOpts = { root };
    document.getElementById("ops-tour-btn")?.addEventListener("click", () => {
      window.TaagerGuidedTour.start("operations", guideOpts);
    });
    setTimeout(() => window.TaagerGuidedTour.mountPagePrompt("operations", guideOpts), 700);
  }

  // Global click to close custom dropdown
  document.addEventListener("click", e => {
    if (!e.target.closest(".ops-custom-select")) {
      document.querySelectorAll(".ops-cs-menu").forEach(m => m.style.display = "none");
    }
  });

  // ── Order Details ──────────────────────────────────────────────────────────
  function _getFilteredRuns() {
    return _activeAccount
      ? (_allRuns || []).filter(r => _opsAccountMatches(r, _activeAccount))
      : (_allRuns || []);
  }

  function _getLatestRun(runs) {
    return [...(runs || [])].sort((a, b) => {
      const tsDiff = (b.runTimestamp || 0) - (a.runTimestamp || 0);
      if (tsDiff) return tsDiff;
      const aCount = Math.max((a.orders || []).length, Number(a.ordersSubmitted) || 0);
      const bCount = Math.max((b.orders || []).length, Number(b.ordersSubmitted) || 0);
      return bCount - aCount;
    })[0] || null;
  }

  function _getLatestRunWithOrders(runs) {
    return _getLatestRun((runs || []).filter(_opsRunHasOrders));
  }

  function _renderPanels(opts) {
    opts = opts || {};
    const filteredRuns = _getFilteredRuns();
    const firstRunGuidance = root.querySelector("#ops-first-run-guidance");
    if (firstRunGuidance) firstRunGuidance.style.display = (_allRuns || []).length === 0 ? "flex" : "none";

    _renderAccountFilter();
    renderOpsMonitor(root.querySelector("#ops-monitor-mount"));
    renderOpsAccountPerf(root.querySelector("#ops-perf-mount"), filteredRuns);
    renderOpsInsights(root.querySelector("#ops-insights-mount"), filteredRuns);
    renderOpsProductPerf(root.querySelector("#ops-product-mount"), filteredRuns);

    const selectedRun = _allRuns.find(r => String(r.runId) === String(_selectedRunId));
    const selectedVisible = selectedRun && _opsAccountMatches(selectedRun, _activeAccount);
    const runToShow = selectedVisible && _opsRunHasOrders(selectedRun)
      ? selectedRun
      : _getLatestRunWithOrders(filteredRuns);
    renderOpsHistory(root.querySelector("#ops-history-mount"), filteredRuns, _onSelectRun, runToShow?.runId || null);

    if (runToShow) _onSelectRun(runToShow.runId, { skipHistoryRefresh: true });
    else _showEmptyOrderDetails();
  }

  function _renderAccountFilter() {
    const tabBar = root.querySelector("#ops-account-tabs");
    if (!tabBar) return;

    const accounts = _opsUniqueAccounts(_allRuns).filter(a => a.key);
    if (accounts.length <= 1) {
      tabBar.innerHTML = "";
      _activeAccount = "";
      return;
    }

    const validKeys = new Set(accounts.map(a => a.key));
    if (_activeAccount && !validKeys.has(_activeAccount)) _activeAccount = "";

    const countFor = key => {
      const runs = key ? (_allRuns || []).filter(r => _opsAccountMatches(r, key)) : (_allRuns || []);
      const rowCount = _opsFlattenRuns(runs).length;
      const submittedCount = runs.reduce((n, r) => n + (Number(r.ordersSubmitted) || 0), 0);
      return Math.max(rowCount, submittedCount);
    };
    const label = (window.t_anl && window.t_anl('account.label')) || window.t_ops('orderDetails.fields.account').replace(' (Data Entry)', '');
    const allLabel = (window.t_anl && window.t_anl('account.allAccounts')) || window.t_ops('productPerf.allAccounts');
    const ordersLabel = window.t_ops('history.ordersCount');
    const allCountLabel = `${allLabel}  ${countFor("").toLocaleString("en-US")} ${ordersLabel}`;
    const options = [{ value: "", label: allCountLabel, labelHtml: '<span style="display:inline-flex;align-items:center;gap:7px">' + allAccountsCountryFlagsHtml(_allRuns) + '<span>' + analyticsEscapeHtml(allCountLabel) + '</span></span>' }]
      .concat(accounts.map(a => ({
        value: a.key,
        label: `${a.label || a.email || a.key}  ${countFor(a.key).toLocaleString("en-US")} ${ordersLabel}`,
        labelHtml: accountOptionLabelHtml(`${a.label || a.email || a.key}  ${countFor(a.key).toLocaleString("en-US")} ${ordersLabel}`, a.country),
        subLabel: [a.email && a.email !== a.label ? a.email : "", accountCountryLabel({ taagerCountry: a.country })].filter(Boolean).join(" - "),
        searchText: [a.label, a.email, a.country, accountCountryLabel({ taagerCountry: a.country })].filter(Boolean).join(" "),
      })));

    tabBar.innerHTML = `
      <div class="ops-account-filter">
        <div class="ops-account-filter-label">${label}</div>
        <div class="ops-account-select-wrap" id="ops-account-select-wrap"></div>
      </div>`;

    renderCustomSelect(
      tabBar.querySelector("#ops-account-select-wrap"),
      options,
      _activeAccount,
      function(value) {
        _activeAccount = value;
        _selectedRunId = null;
        _selectedOrderIdx = 0;
        _renderPanels();
      },
      { searchable: true, maxHeight: "280px" }
    );
  }

  function _onSelectRun(runId) {
    const opts = arguments[1] || {};
    _selectedRunId = runId;
    _selectedOrderIdx = 0;
    const run = _allRuns.find(r => String(r.runId) === String(runId));
    if (!run) return;
    if (!_opsRunHasOrders(run)) {
      _showEmptyOrderDetails();
      _markSelectedHistoryRun();
      return;
    }
    _renderOrderDetails(run);
    if (!opts.skipHistoryRefresh) {
      _markSelectedHistoryRun();
    }
  }

  function _markSelectedHistoryRun() {
    root.querySelectorAll(".ops-history-row").forEach(row => {
      row.classList.toggle("active", String(row.dataset.runId || "") === String(_selectedRunId || ""));
    });
  }

  function _renderOrderDetails(run) {
    const panel = root.querySelector("#ops-od-content");
    if (!panel) return;

    const orders   = run.orders || [];
    if (_selectedOrderIdx >= orders.length) _selectedOrderIdx = 0;
    if (!orders.length) {
      _renderRunOnlyDetails(panel, run);
      return;
    }
    const firstOrder = orders[_selectedOrderIdx] || orders[0];
    const ts       = run.runTimestamp ? new Date(run.runTimestamp) : null;
    const orderStatus = firstOrder?.orderStatus || "Pending";
    const sc       = _opsStatusColor(orderStatus);
    const stLabel  = window.TaagerStatus ? window.TaagerStatus.display(orderStatus) : orderStatus;
    const fmtTs    = d => d ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

    panel.innerHTML = `
      <div class="ops-od-body">

        <!-- Left nav tabs -->
        <div class="ops-od-left-nav">
          <button class="ops-od-nav-item ${_activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
            <span class="nav-icon">📋</span> ${window.t_ops('orderDetails.tabOverview')}
          </button>
          <button class="ops-od-nav-item ${_activeTab === 'customer' ? 'active' : ''}" data-tab="customer">
            <span class="nav-icon">👤</span> ${window.t_ops('orderDetails.tabCustomer')}
          </button>
          <button class="ops-od-nav-item ${_activeTab === 'history' ? 'active' : ''}" data-tab="history">
            <span class="nav-icon">🕒</span> ${window.t_ops('orderDetails.tabHistory')}
          </button>
          <button class="ops-od-nav-item ${_activeTab === 'notes' ? 'active' : ''}" data-tab="notes">
            <span class="nav-icon">📝</span> ${window.t_ops('orderDetails.tabNotes')}
          </button>
        </div>

        <!-- Right content -->
        <div class="ops-od-right">
          <div class="ops-od-run-header">
            <div style="display:flex; align-items:center; gap:12px; position:relative" id="ops-od-dropdown-wrap">
              <div class="ops-custom-select" id="ops-od-selector">
                <div class="ops-cs-trigger">
                  <span id="ops-cs-val">Order ${_selectedOrderIdx + 1} of ${orders.length} - ${firstOrder?.taagerOrderNumber ? '#' + firstOrder.taagerOrderNumber : (firstOrder?.name ? firstOrder.name : 'Unknown')}</span>
                  <span class="ops-cs-chevron">▼</span>
                </div>
                <div class="ops-cs-menu" style="display:none">
                  <div class="ops-cs-search-wrap">
                    <input type="text" id="ops-cs-search" placeholder="${window.t_ops('orderDetails.searchPlaceholder')}" autocomplete="off"/>
                  </div>
                  <div class="ops-cs-options">
                    ${orders.map((o, idx) => {
                      const label = window.t_ops('orderDetails.orderOf', { current: idx + 1, total: orders.length }) + ' - ' + (o.taagerOrderNumber ? '#' + o.taagerOrderNumber : (o.name ? o.name : window.t_ops('orderDetails.unknown')));
                      const phone = o.phone || "";
                      const name = o.name || "";
                      return `<div class="ops-cs-option ${idx === _selectedOrderIdx ? "selected" : ""}" data-idx="${idx}" data-search="${label.toLowerCase()} ${phone.toLowerCase()} ${name.toLowerCase()}">${label}</div>`;
                    }).join("")}
                  </div>
                </div>
              </div>
            </div>
            <span class="ops-od-status-badge" style="background:${sc.bg};color:${sc.text}">${stLabel}</span>
          </div>

          <div class="ops-od-meta-row">
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.amountToCollect')}</div>
              <div class="ops-od-meta-val">${firstOrder?.amountDue > 0 ? _opsFmtSAR(firstOrder.amountDue) : "—"}</div>
            </div>
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.orderValue')}</div>
              <div class="ops-od-meta-val">${firstOrder?.subtotal > 0 ? _opsFmtSAR(firstOrder.subtotal) : "—"}</div>
            </div>
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.orderDate')}</div>
              <div class="ops-od-meta-val" style="font-size:11px">${ts ? fmtTs(ts) : "—"}</div>
            </div>
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.city')}</div>
              <div class="ops-od-meta-val">${firstOrder?.city || "—"}</div>
            </div>
          </div>

          <div id="ops-od-tab-body">
            ${_activeTab === 'overview' ? _opsOdOverviewHTML(firstOrder) :
              _activeTab === 'customer' ? _opsOdCustomerHTML(firstOrder) :
              _activeTab === 'history'  ? _opsOdHistoryHTML(run) :
              _activeTab === 'notes'    ? `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noNotes')}</div>` : ''}
          </div>

          <div class="ops-od-timeline-wrap">
            <div class="ops-od-timeline-title">${window.t_ops('orderDetails.timelineTitle')}</div>
            ${_opsOdTimelineHTML(run, firstOrder)}
          </div>
        </div>
      </div>`;

    const wrap = panel.querySelector("#ops-od-dropdown-wrap");
    if (wrap) {
      const trigger = wrap.querySelector(".ops-cs-trigger");
      const menu = wrap.querySelector(".ops-cs-menu");
      const search = wrap.querySelector("#ops-cs-search");
      const options = wrap.querySelectorAll(".ops-cs-option");

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = menu.style.display === "block";
        menu.style.display = isVisible ? "none" : "block";
        if (!isVisible) {
          search.value = "";
          options.forEach(opt => opt.style.display = "block");
          search.focus();
        }
      });

      menu.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      if (window._opsOdCloseMenuFn) {
        document.removeEventListener("click", window._opsOdCloseMenuFn);
      }
      window._opsOdCloseMenuFn = function closeMenuFn() {
        const selector = document.getElementById("ops-od-selector");
        if (!selector) {
          document.removeEventListener("click", window._opsOdCloseMenuFn);
          window._opsOdCloseMenuFn = null;
          return;
        }
        if (menu) menu.style.display = "none";
      };
      document.addEventListener("click", window._opsOdCloseMenuFn);

      search.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        options.forEach(opt => {
          if (opt.dataset.search.includes(term)) opt.style.display = "block";
          else opt.style.display = "none";
        });
      });

      options.forEach(opt => {
        opt.addEventListener("click", () => {
          _selectedOrderIdx = parseInt(opt.dataset.idx, 10);
          _renderOrderDetails(run);
        });
      });
    }

    // Tab switching
    panel.querySelectorAll(".ops-od-nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".ops-od-nav-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _activeTab = btn.dataset.tab;
        const body = panel.querySelector("#ops-od-tab-body");
        if (!body) return;
        switch (_activeTab) {
          case "overview":  body.innerHTML = _opsOdOverviewHTML(firstOrder); break;
          case "customer":  body.innerHTML = _opsOdCustomerHTML(firstOrder); break;
          case "history":   body.innerHTML = _opsOdHistoryHTML(run); break;
          case "notes":     body.innerHTML = `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noNotes')}</div>`; break;
        }
      });
    });
  }

  function _renderRunOnlyDetails(panel, run) {
    const ts = run.runTimestamp ? new Date(run.runTimestamp) : null;
    const fmtTs = d => d ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    const hasFail = (run.ordersFailed || 0) > 0;
    const sc = _opsStatusColor(hasFail ? "Failed" : "Delivered");
    const statusLabel = hasFail ? window.t_ops('history.failed') : window.t_ops('history.completed');
    const tabBodyHtml =
      _activeTab === 'overview' ? `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noOrderData')}</div>` :
      _activeTab === 'customer' ? `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noCustomerData')}</div>` :
      _activeTab === 'history'  ? _opsOdHistoryHTML(run) :
      _activeTab === 'notes'    ? `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noNotes')}</div>` :
      `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noOrderData')}</div>`;

    panel.innerHTML = `
      <div class="ops-od-body">
        <div class="ops-od-left-nav">
          <button class="ops-od-nav-item ${_activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
            <span class="nav-icon">📋</span> ${window.t_ops('orderDetails.tabOverview')}
          </button>
          <button class="ops-od-nav-item ${_activeTab === 'customer' ? 'active' : ''}" data-tab="customer">
            <span class="nav-icon">👤</span> ${window.t_ops('orderDetails.tabCustomer')}
          </button>
          <button class="ops-od-nav-item ${_activeTab === 'history' ? 'active' : ''}" data-tab="history">
            <span class="nav-icon">🕒</span> ${window.t_ops('orderDetails.tabHistory')}
          </button>
          <button class="ops-od-nav-item ${_activeTab === 'notes' ? 'active' : ''}" data-tab="notes">
            <span class="nav-icon">📝</span> ${window.t_ops('orderDetails.tabNotes')}
          </button>
        </div>
        <div class="ops-od-right">
          <div class="ops-od-run-header">
            <div class="ops-od-run-summary-title">${_opsAccountDisplay(run)}</div>
            <span class="ops-od-status-badge" style="background:${sc.bg};color:${sc.text}">${statusLabel}</span>
          </div>
          <div class="ops-od-meta-row">
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.fields.submitted')}</div>
              <div class="ops-od-meta-val">${(run.ordersSubmitted || 0).toLocaleString("en-US")}</div>
            </div>
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.fields.failed')}</div>
              <div class="ops-od-meta-val">${(run.ordersFailed || 0).toLocaleString("en-US")}</div>
            </div>
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.fields.runTime')}</div>
              <div class="ops-od-meta-val" style="font-size:11px">${ts ? fmtTs(ts) : "—"}</div>
            </div>
            <div class="ops-od-meta-block">
              <div class="ops-od-meta-label">${window.t_ops('orderDetails.fields.runId')}</div>
              <div class="ops-od-meta-val" style="font-size:11px">${run.runId || "—"}</div>
            </div>
          </div>
          <div id="ops-od-tab-body">
            ${tabBodyHtml}
          </div>
          <div class="ops-od-timeline-wrap">
            <div class="ops-od-timeline-title">${window.t_ops('orderDetails.timelineTitle')}</div>
            ${_opsOdRunTimelineHTML(run)}
          </div>
        </div>
      </div>`;

    panel.querySelectorAll(".ops-od-nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".ops-od-nav-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _activeTab = btn.dataset.tab;
        const body = panel.querySelector("#ops-od-tab-body");
        if (!body) return;
        switch (_activeTab) {
          case "overview": body.innerHTML = `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noOrderData')}</div>`; break;
          case "customer": body.innerHTML = `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noCustomerData')}</div>`; break;
          case "history":  body.innerHTML = _opsOdHistoryHTML(run); break;
          case "notes":    body.innerHTML = `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noNotes')}</div>`; break;
        }
      });
    });
  }

  function _opsOdOverviewHTML(order) {
    if (!order) return `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noOrderData')}</div>`;
    const fields = [
      ["👤", window.t_ops('orderDetails.fields.recipientName'),       order.name || "—"],
      ["📞", window.t_ops('orderDetails.fields.phone1'),              order.phone || "—"],
      ["📞", window.t_ops('orderDetails.fields.phone2'),              "—"],
      ["📍", window.t_ops('orderDetails.fields.cityArea'),          [order.city, order.region].filter(Boolean).join(" / ") || "—"],
      ["🏠", window.t_ops('orderDetails.fields.address'),              order.address || "—"],
      ["💼", window.t_ops('orderDetails.fields.account'), _opsAccountDisplay(order)],
      ["📦", window.t_ops('orderDetails.fields.productName'),         order.productName || "—"],
      ["🔑", window.t_ops('orderDetails.fields.sku'),                  order.sku || "—"],
    ];
    return `<div class="ops-od-overview">
      ${fields.map(([icon, label, val]) => `
        <div class="ops-od-field-row">
          <span class="ops-od-field-icon">${icon}</span>
          <div class="ops-od-field-label">${label}</div>
          <div class="ops-od-field-val">${val}</div>
        </div>`).join("")}
    </div>`;
  }

  function _opsOdCustomerHTML(order) {
    if (!order) return `<div class="ops-od-section-empty">${window.t_ops('orderDetails.noCustomerData')}</div>`;
    return `<div class="ops-od-overview">
      <div class="ops-od-field-row"><span class="ops-od-field-icon">👤</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.name')}</div><div class="ops-od-field-val">${order.name || "—"}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">📞</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.phone')}</div><div class="ops-od-field-val">${order.phone || "—"}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">📍</span><div class="ops-od-field-label">${window.t_ops('orderDetails.city')}</div><div class="ops-od-field-val">${order.city || "—"}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">🗺</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.region')}</div><div class="ops-od-field-val">${order.region || "—"}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">🏠</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.address')}</div><div class="ops-od-field-val">${order.address || "—"}</div></div>
    </div>`;
  }

  function _opsOdHistoryHTML(run) {
    const ts = run.runTimestamp ? new Date(run.runTimestamp) : null;
    return `<div class="ops-od-overview">
      <div class="ops-od-field-row"><span class="ops-od-field-icon">🔑</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.runId')}</div><div class="ops-od-field-val" style="font-size:11px;color:var(--text3)">${run.runId || "—"}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">🕒</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.runTime')}</div><div class="ops-od-field-val">${ts ? ts.toLocaleString() : "—"}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">💼</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.account').replace(' (Data Entry)', '')}</div><div class="ops-od-field-val">${_opsAccountDisplay(run)}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">✓</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.submitted')}</div><div class="ops-od-field-val">${(run.ordersSubmitted || 0).toLocaleString()}</div></div>
      <div class="ops-od-field-row"><span class="ops-od-field-icon">✗</span><div class="ops-od-field-label">${window.t_ops('orderDetails.fields.failed')}</div><div class="ops-od-field-val" style="color:var(--danger)">${(run.ordersFailed || 0).toLocaleString()}</div></div>
    </div>`;
  }

  function _opsOdTimelineHTML(run, order) {
    const ts   = run.runTimestamp || 0;
    const date = ts ? new Date(ts) : null;
    const fmt  = d => d ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    
    const status = order?.orderStatus || "Pending";
    const meta = window.TaagerStatus ? window.TaagerStatus.normalize(status) : null;
    const isFail = meta ? (meta.eligible !== false && meta.delivered !== true) : status.toLowerCase() === "failed";
    const isDone = meta ? meta.delivered === true : (status.toLowerCase() === "delivered" || status.toLowerCase() === "completed");
    
    const steps = [
      { label: window.t_ops('orderDetails.timelineSteps.botStarted'), time: date ? fmt(date) : "—", done: true },
      { label: window.t_ops('orderDetails.timelineSteps.processingOrder'), time: date ? fmt(new Date(ts + 5000)) : "—", done: true },
    ];
    
    if (isFail) {
      steps.push({ label: window.t_ops('orderDetails.timelineSteps.failed'), time: date ? fmt(new Date(ts + 12000)) : "—", done: false, fail: true });
    } else if (isDone) {
      steps.push({ label: window.t_ops('orderDetails.timelineSteps.delivered'), time: date ? fmt(new Date(ts + 15000)) : "—", done: true });
    } else {
      steps.push({ label: window.t_ops('orderDetails.timelineSteps.pending'), time: "—", done: false });
    }

    return steps.map(s => `
      <div class="ops-od-timeline-step ${s.done ? "done" : "pending"}">
        <div class="ops-od-timeline-dot ${s.done ? "done" : "pending"}" ${s.fail ? 'style="background:var(--danger);border-color:var(--danger);box-shadow:0 0 8px rgba(255,85,85,0.4)"' : ''}></div>
        <div class="ops-od-timeline-body">
          <div class="ops-od-timeline-label" ${s.fail ? 'style="color:var(--danger)"' : ''}>${s.label}</div>
          <div class="ops-od-timeline-time">${s.time}</div>
        </div>
      </div>`).join("");
  }

  function _opsOdRunTimelineHTML(run) {
    const ts = run.runTimestamp || 0;
    const date = ts ? new Date(ts) : null;
    const fmt = d => d ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    const hasFail = (run.ordersFailed || 0) > 0;
    const steps = [
      { label: window.t_ops('orderDetails.timelineSteps.botStarted'), time: date ? fmt(date) : "—", done: true },
      { label: hasFail ? window.t_ops('orderDetails.timelineSteps.failed') : window.t_ops('liveMonitor.feed.runCompleted'), time: date ? fmt(date) : "—", done: !hasFail, fail: hasFail },
    ];

    return steps.map(s => `
      <div class="ops-od-timeline-step ${s.done ? "done" : "pending"}">
        <div class="ops-od-timeline-dot ${s.done ? "done" : "pending"}" ${s.fail ? 'style="background:var(--danger);border-color:var(--danger);box-shadow:0 0 8px rgba(255,85,85,0.4)"' : ''}></div>
        <div class="ops-od-timeline-body">
          <div class="ops-od-timeline-label" ${s.fail ? 'style="color:var(--danger)"' : ''}>${s.label}</div>
          <div class="ops-od-timeline-time">${s.time}</div>
        </div>
      </div>`).join("");
  }

  function _clearOrderDetails() {
    _showEmptyOrderDetails();
  }

  function _showEmptyOrderDetails() {
    _selectedRunId = null;
    const content = root.querySelector("#ops-od-content");
    if (content) content.innerHTML = _opsOrderDetailsEmptyHTML();
    _markSelectedHistoryRun();
  }

  function _opsRunHasOrders(run) {
    return Array.isArray(run?.orders) && run.orders.length > 0;
  }

  function _opsOrderDetailsEmptyHTML() {
    const title = window.t_ops('orderDetails.emptyTitle', { default: 'Select a run with orders' });
    const body = window.t_ops('orderDetails.emptyBody', {
      default: 'To see order details, select a Run History item that has submitted orders.'
    });
    const action = window.t_ops('orderDetails.emptyAction', { default: 'Go to Run History' });
    return `
      <div class="ops-od-empty ops-od-empty-guidance">
        <div class="ops-od-empty-title">${title}</div>
        <div class="ops-od-empty-body">${body}</div>
        <button class="ops-od-empty-action" id="ops-scroll-history" type="button">${action}</button>
      </div>`;
  }

  function _scrollToRunHistory() {
    const target = root.querySelector("#ops-history-mount");
    const card = target?.querySelector(".ops-history-card");
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    if (card) {
      card.classList.remove("ops-history-glow");
      void card.offsetWidth;
      card.classList.add("ops-history-glow");
      setTimeout(() => card.classList.remove("ops-history-glow"), 1800);
    }
  }

  function _scrollToProductPerformance() {
    const target = root.querySelector("#ops-product-mount");
    const card = target?.querySelector(".ops-product-card");
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    if (card) {
      card.classList.remove("ops-product-glow");
      void card.offsetWidth;
      card.classList.add("ops-product-glow");
      setTimeout(() => card.classList.remove("ops-product-glow"), 1800);
    }
  }
}
