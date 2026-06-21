// analytics-table.js — Orders Explorer: paginated, searchable, filterable, exportable
// Depends on: analytics-utils.js globals (flattenRuns, formatSAR, getStatusColor, debounce)
// ─────────────────────────────────────────────────────────────────────────────

// Table state (module-level — reset on each render call)
let _tableState = {
  allOrders:    [],
  filtered:     [],
  page:         1,
  perPage:      10,
  search:       "",
  statusFilter: "",
  accountFilter:"",
  sourceFilter: "",
  sortField:    "easyCreatedAt",
  sortDir:      "desc",
};

/**
 * Render the Orders Explorer into the given container.
 * @param {HTMLElement} container
 * @param {Array}  runs       - filtered runs
 * @param {Array}  allRuns    - all runs (for account list)
 */
function renderOrdersExplorer(container, runs, allRuns) {
  if (!container) return;

  const orders = flattenRuns(runs);
  _tableState.allOrders     = orders;
  _tableState.page          = 1;
  _tableState.search        = "";
  _tableState.statusFilter  = "";
  _tableState.accountFilter = "";
  _tableState.sourceFilter  = "";

  const statuses  = [...new Set(orders.map(o => o.orderStatus).filter(Boolean))].sort();
  const accountMap = new Map();
  orders.forEach(o => {
    const key = accountKey(o);
    if (key && !accountMap.has(key)) accountMap.set(key, {
      label: accountDisplay(o),
      email: o.accountEmail || ""
    });
  });
  const accounts = [...accountMap.entries()]
    .map(([value, info]) => ({
      value,
      label: info.label || info.email || value,
      subLabel: info.email && info.email !== info.label ? info.email : ""
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  container.innerHTML = `
    <div class="orders-explorer">
      <div class="orders-explorer-header">
        <div class="orders-explorer-title">
          📋 ${window.t_anl('table.title')}
          <span style="font-size:11px;font-weight:400;color:var(--text3)" id="explorer-count-badge"></span>
        </div>
        <div class="orders-explorer-controls">
          <div class="explorer-search-wrap">
            <span class="explorer-search-icon">🔍</span>
            <input type="text" class="explorer-search" id="explorer-search"
              placeholder="${window.t_anl('table.searchPlaceholder')}" autocomplete="off" spellcheck="false">
          </div>
          <div id="explorer-status-filter-wrap"></div>
          ${accounts.length > 1 ? `<div id="explorer-account-filter-wrap"></div>` : ""}
          <div id="explorer-source-filter-wrap"></div>
          <div id="explorer-per-page-wrap"></div>
          <button class="btn btn-ghost" style="font-size:12px;padding:7px 12px" id="explorer-clear-sort-btn">
            ${window.t_anl('table.clearSort')}
          </button>
          <button class="btn btn-ghost" style="font-size:12px;padding:7px 14px" id="explorer-export-btn">
            ⬆ ${window.t_anl('table.export')}
          </button>
        </div>
      </div>
      <div class="explorer-table-wrap">
        <table class="explorer-table">
          <thead>
            <tr>
              <th data-sort="taagerOrderNumber">${window.t_anl('table.colOrder')}</th>
              <th data-sort="easyCreatedAt">${window.t_anl('table.colTime')}</th>
              <th data-sort="accountEmail">${window.t_anl('account.label')}</th>
              <th data-sort="name">${window.t_anl('table.colCustomer')}</th>
              <th>${window.t_anl('table.colContact')}</th>
              <th data-sort="productName">${window.t_anl('table.colProduct')}</th>
              <th>SKU</th>
              <th data-sort="qty">${window.t_anl('table.colQty')}</th>
              <th data-sort="subtotal">${window.t_anl('table.colValue')} (SAR)</th>
              <th data-sort="amountDue">${window.t_anl('kpi.cod').replace('Amount To Collect (', '').replace(')', '')}</th>
              <th data-sort="orderStatus">${window.t_anl('table.colStatus')}</th>
              <th data-sort="city">${window.t_anl('table.colLocation')}</th>
              <th data-sort="source">${window.t_anl('table.colSource')}</th>
            </tr>
          </thead>
          <tbody id="explorer-tbody"></tbody>
        </table>
      </div>
      <div class="explorer-pagination" id="explorer-pagination"></div>
    </div>`;

  // Local helper functions to render premium custom select components
  function renderStatusSelect() {
    const wrap = container.querySelector("#explorer-status-filter-wrap");
    if (!wrap) return;
    const statusOptions = [{ value: "", label: window.t_anl('table.statusAll') }].concat(statuses.map(s => ({ value: s, label: analyticsStatusLabel(s) })));
    renderCustomSelect(wrap, statusOptions, _tableState.statusFilter, function(val) {
      _tableState.statusFilter = val;
      _tableState.page = 1;
      _applyFiltersAndRender(container);
      renderStatusSelect();
    });
  }

  function renderAccountSelect() {
    const wrap = container.querySelector("#explorer-account-filter-wrap");
    if (!wrap) return;
    const accountOptions = [{ value: "", label: window.t_anl('table.allAccounts') }].concat(accounts);
    renderCustomSelect(wrap, accountOptions, _tableState.accountFilter, function(val) {
      _tableState.accountFilter = val;
      _tableState.page = 1;
      _applyFiltersAndRender(container);
      renderAccountSelect();
    });
  }

  function renderSourceSelect() {
    const wrap = container.querySelector("#explorer-source-filter-wrap");
    if (!wrap) return;
    const sourceOptions = [
      { value: "", label: window.t_anl('table.allSources') },
      { value: "real", label: window.t_anl('table.sourceReal') },
      { value: "missed", label: window.t_anl('table.sourceMissed') }
    ];
    renderCustomSelect(wrap, sourceOptions, _tableState.sourceFilter, function(val) {
      _tableState.sourceFilter = val;
      _tableState.page = 1;
      _applyFiltersAndRender(container);
      renderSourceSelect();
    });
  }

  function renderPerPageSelect() {
    const wrap = container.querySelector("#explorer-per-page-wrap");
    if (!wrap) return;
    const perPageOptions = [
      { value: "10", label: window.t_anl('table.perPage', { count: 10 }) },
      { value: "25", label: window.t_anl('table.perPage', { count: 25 }) },
      { value: "50", label: window.t_anl('table.perPage', { count: 50 }) }
    ];
    renderCustomSelect(wrap, perPageOptions, _tableState.perPage.toString(), function(val) {
      _tableState.perPage = parseInt(val, 10) || 25;
      _tableState.page = 1;
      _applyFiltersAndRender(container);
      renderPerPageSelect();
    });
  }

  // Initialize all custom selects
  renderStatusSelect();
  renderAccountSelect();
  renderSourceSelect();
  renderPerPageSelect();

  _applyFiltersAndRender(container);
  _bindTableEvents(container);
}

// ── Apply filters, sort, paginate, and render ─────────────────────────────────

function _applyFiltersAndRender(container) {
  const s = _tableState;
  let results = s.allOrders;

  if (s.search) {
    const q = s.search.toLowerCase().trim();
    results = results.filter(o => {
      const nameMatch = (o.name || "").toLowerCase().includes(q);
      const skuMatch = (o.sku || "").toLowerCase().includes(q);
      
      // Clean phone numbers by stripping spaces, hyphens, and plus signs
      const rawPhoneVal = o.phone || o.rawPhone || o.normPhone || "";
      const phoneClean = rawPhoneVal.toString().replace(/[\s\-\+]/g, "");
      const queryClean = q.replace(/[\s\-\+]/g, "");
      const dialCode = _countryDialCode(o.taagerCountry);
      const phoneMatch = phoneClean.includes(queryClean) || 
                         (dialCode && phoneClean.replace(new RegExp("^" + dialCode), "0").includes(queryClean)) ||
                         (dialCode && phoneClean.replace(new RegExp("^" + dialCode), "").includes(queryClean));
      
      const productMatch = (o.productName || "").toLowerCase().includes(q);
      const cityMatch = (o.city || "").toLowerCase().includes(q);
      const orderNumMatch = (o.taagerOrderNumber || "").toLowerCase().includes(q);
      
      return nameMatch || skuMatch || phoneMatch || productMatch || cityMatch || orderNumMatch;
    });
  }

  if (s.statusFilter)  results = results.filter(o => o.orderStatus  === s.statusFilter);
  if (s.accountFilter) results = results.filter(o => accountMatches(o, s.accountFilter));
  if (s.sourceFilter)  results = results.filter(o => o.source       === s.sourceFilter);

  if (s.sortField) {
    results = [...results].sort((a, b) => {
      let valA = a[s.sortField] ?? "";
      let valB = b[s.sortField] ?? "";
      if (s.sortField === "easyCreatedAt") {
        valA = a.easyCreatedAt || a.createdAt || a.date || "";
        valB = b.easyCreatedAt || b.createdAt || b.date || "";
      }
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return s.sortDir === "asc" ? -1 : 1;
      if (valA > valB) return s.sortDir === "asc" ? 1 : -1;
      return 0;
    });
  } else {
    results = [...results];
  }

  s.filtered = results;

  const totalPages = Math.max(1, Math.ceil(results.length / s.perPage));
  if (s.page > totalPages) s.page = totalPages;

  const start    = (s.page - 1) * s.perPage;
  const end      = Math.min(start + s.perPage, results.length);
  const pageRows = results.slice(start, end);

  _renderTableBody(container, pageRows);
  _renderPagination(container, results.length, totalPages);

  const badge = container.querySelector("#explorer-count-badge");
  if (badge) badge.textContent = `(${results.length.toLocaleString("en-US")} ${window.t_anl('account.orders')})`;

  container.querySelectorAll(".explorer-table th[data-sort]").forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === s.sortField) {
      th.classList.add(s.sortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

// ── Render tbody rows ──────────────────────────────────────────────────────────

function _renderTableBody(container, rows) {
  const tbody = container.querySelector("#explorer-tbody");
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align:center;padding:32px;color:var(--text3)">
          ${window.t_anl('table.emptyFilters')}
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = rows.map((o, idx) => {
    const statusColor = getStatusColor(o.orderStatus || "");
    const date = formatAnalyticsDateTime(o.easyCreatedAt || o.createdAt || o.date);
    const sku   = o.sku || "—";
    const rawPhoneVal = o.phone || o.rawPhone || o.normPhone || "";
    const phone = rawPhoneVal ? _displayDomesticPhone(rawPhoneVal, o.taagerCountry) : "—";
    const codStr = (o.amountDue > 0) ? formatSAR(o.amountDue) : "—";

    return `
      <tr style="animation-delay: ${idx * 12}ms">
        <td style="font-variant-numeric:tabular-nums;color:var(--text3);font-size:11px">${o.taagerOrderNumber || "—"}</td>
        <td style="white-space:nowrap">${date}</td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--text2)"
            title="${accountDisplay(o)}">${_shortAccount(accountDisplay(o))}</td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${o.name || ""}">${o.name || "—"}</td>
        <td style="font-variant-numeric:tabular-nums;color:var(--text2)">${phone}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${o.productName || ""}">${_shortText(o.productName, 28)}</td>
        <td style="font-size:10px;color:var(--text3);max-width:100px;overflow:hidden;text-overflow:ellipsis" title="${sku}">${_shortText(sku, 14)}</td>
        <td style="text-align:center">${o.qty || 1}</td>
        <td style="font-variant-numeric:tabular-nums">${o.subtotal > 0 ? formatSAR(o.subtotal) : "—"}</td>
        <td style="font-variant-numeric:tabular-nums;font-weight:600;color:var(--success)">${codStr}</td>
        <td>
          <span class="status-badge" data-status="${o.orderStatus || ""}"
            style="background:${statusColor.bg};color:${statusColor.text}">${analyticsStatusLabel(o.orderStatus)}</span>
        </td>
        <td>${o.city || "—"}</td>
        <td>
          <span class="explorer-source-badge ${o.source || "real"}">${o.source === "missed" ? window.t_anl('table.sourceMissed') : window.t_anl('table.sourceReal')}</span>
        </td>
      </tr>`;
  }).join("");
}

// ── Render pagination controls ────────────────────────────────────────────────

function _renderPagination(container, total, totalPages) {
  const pag   = container.querySelector("#explorer-pagination");
  if (!pag)    return;
  const s     = _tableState;
  const start = (s.page - 1) * s.perPage + 1;
  const end   = Math.min(s.page * s.perPage, total);

  if (total === 0) { pag.innerHTML = ""; return; }

  const pageNums = [];
  const win = 2;
  for (let p = Math.max(1, s.page - win); p <= Math.min(totalPages, s.page + win); p++) {
    pageNums.push(p);
  }

  const showFirst = pageNums[0] > 1;
  const showLast  = pageNums[pageNums.length - 1] < totalPages;

  pag.innerHTML = `
    <div class="explorer-pagination-info">
      ${window.t_anl('table.paginationInfo', { start: start.toLocaleString("en-US"), end: end.toLocaleString("en-US"), total: total.toLocaleString("en-US") })}
    </div>
    <div class="explorer-pagination-controls">
      <button class="pagination-btn pagination-arrow-btn" id="pag-prev" ${s.page <= 1 ? "disabled" : ""} aria-label="${window.t_anl('table.prev')}">←</button>
      ${showFirst ? `<button class="pagination-btn" data-page="1">1</button><span class="pagination-ellipsis">…</span>` : ""}
      ${pageNums.map(p => `<button class="pagination-btn${p === s.page ? " active" : ""}" data-page="${p}">${p}</button>`).join("")}
      ${showLast  ? `<span class="pagination-ellipsis">…</span><button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>` : ""}
      <button class="pagination-btn pagination-arrow-btn" id="pag-next" ${s.page >= totalPages ? "disabled" : ""} aria-label="${window.t_anl('table.next')}">→</button>
    </div>`;

  pag.querySelector("#pag-prev")?.addEventListener("click", () => {
    if (s.page > 1) { s.page--; _applyFiltersAndRender(container); }
  });
  pag.querySelector("#pag-next")?.addEventListener("click", () => {
    if (s.page < totalPages) { s.page++; _applyFiltersAndRender(container); }
  });
  pag.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.dataset.page, 10);
      if (!isNaN(p)) { s.page = p; _applyFiltersAndRender(container); }
    });
  });
}

// ── Bind all interactive events ───────────────────────────────────────────────

function _bindTableEvents(container) {
  const s = _tableState;

  const searchEl = container.querySelector("#explorer-search");
  if (searchEl) {
    searchEl.addEventListener("input", debounce(e => {
      s.search = e.target.value.trim();
      s.page   = 1;
      _applyFiltersAndRender(container);
    }, 250));
  }

  container.querySelectorAll(".explorer-table th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      if (s.sortField === field) {
        s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
      } else {
        s.sortField = field;
        s.sortDir   = "asc";
      }
      _applyFiltersAndRender(container);
    });
  });

  const exportBtn = container.querySelector("#explorer-export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => _exportToExcel(s.filtered));
  }

  const clearSortBtn = container.querySelector("#explorer-clear-sort-btn");
  if (clearSortBtn) {
    clearSortBtn.addEventListener("click", () => {
      s.sortField = "";
      s.sortDir = "";
      s.page = 1;
      _applyFiltersAndRender(container);
    });
  }
}

// ── Export filtered orders to Excel ──────────────────────────────────────────

function _exportToExcel(orders) {
  try {
    const XLSX = window.XLSX || (typeof require !== "undefined" ? require("xlsx") : null);
    if (!XLSX) { alert("XLSX library not available."); return; }

    // Taager dashboard/status/NDR migration:
    // Export the Taager profit alias first: order profit minus tax profit.
    const rows = orders.map(o => ({
      "Order #":             o.taagerOrderNumber || "",
      "Date":                o.date            || "",
      "EasyOrders Created At": o.easyCreatedAt || o.createdAt || o.date || "",
      "Account":             accountDisplay(o),
      "Customer":            o.name            || "",
      "Phone":               (o.phone || o.rawPhone || o.normPhone || ""),
      "Product":             o.productName     || "",
      "SKU":                 o.sku             || "",
      "Qty":                 o.qty             || 1,
      "Amount (SAR)":        o.subtotal        || 0,
      "COD (SAR)":           o.amountDue       || 0,
      "Taager Profit (SAR)": o.taagerProfit || o.profitAfterTax || o.profitAfterFees || o.marketerCommission || 0,
      "Status":              o.orderStatus     || "",
      "City":                o.city            || "",
      "Source":              o.source          || "",
      "Run ID":              o.runId           || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analytics");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `analytics-export-${date}.xlsx`);
  } catch (err) {
    console.error("[Analytics] Export failed:", err.message);
    alert("Export failed: " + err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _shortText(text, maxLen) {
  if (!text) return "—";
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

function _shortAccount(email) {
  if (!email || email === "__single__") return "—";
  return email;
}

function _countryDialCode(country) {
  const map = { sa: "966", eg: "20", ae: "971", iq: "964", om: "968" };
  return map[String(country || "sa").toLowerCase()] || map.sa;
}

function _displayDomesticPhone(value, country) {
  const text = String(value || "");
  const digits = text.replace(/\D/g, "");
  const dialCode = _countryDialCode(country);
  if (dialCode && digits.startsWith(dialCode)) return "0" + digits.slice(dialCode.length);
  return text;
}
