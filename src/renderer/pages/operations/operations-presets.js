// operations-presets.js — Account Performance + Product Performance

// ── Account Performance ─────────────────────────────────────────────────────
const _opsAcctPerfState = { page: 1, perPage: 6, sortBy: "orders" };

function renderOpsAccountPerf(container, allRuns) {
  if (!container) return;
  const accounts = _opsUniqueAccounts(allRuns);

  const render = () => {
    const raw = accounts.map(account => {
      const runs   = allRuns.filter(r => _opsAccountMatches(r, account.key));
      const orders = _opsFlattenRuns(runs);
      const total  = orders.length;
      const rev    = orders.reduce((s, o) => s + _opsDashboardRevenueValue(o), 0);
      // Taager dashboard/status/NDR migration: Operations performance cards use
      // Taager Arabic delivered/failed buckets when the shared helper is loaded.
      const failed = orders.filter(o => typeof _opsIsFailed === "function" && _opsIsFailed(o)).length;
      return { key: account.key, label: account.label, total, rev, failed, runsCount: runs.length };
    });

    const sorted = raw.sort((a, b) =>
      _opsAcctPerfState.sortBy === "revenue" ? b.rev - a.rev : b.total - a.total
    );
    const maxRev = sorted[0]?.rev   || 1;
    const maxTot = sorted[0]?.total || 1;
    const totalPages = Math.max(1, Math.ceil(sorted.length / _opsAcctPerfState.perPage));
    if (_opsAcctPerfState.page > totalPages) _opsAcctPerfState.page = totalPages;
    const start = (_opsAcctPerfState.page - 1) * _opsAcctPerfState.perPage;
    const pageAccounts = sorted.slice(start, start + _opsAcctPerfState.perPage);

    container.innerHTML = `
      <div class="ops-perf-card">
        <div class="ops-perf-header">
          <div class="ops-section-title">👤 ${window.t_ops('accountPerf.title')}</div>
          <div class="analytics-tabs-group" id="ops-perf-sort">
            <button class="analytics-tab-btn ${_opsAcctPerfState.sortBy === 'orders' ? 'active' : ''}" data-sort="orders">${window.t_ops('accountPerf.sortOrders')}</button>
            <button class="analytics-tab-btn ${_opsAcctPerfState.sortBy === 'revenue' ? 'active' : ''}" data-sort="revenue">${window.t_ops('accountPerf.sortRevenue')}</button>
          </div>
        </div>
        <div class="ops-perf-list">
          ${sorted.length === 0
            ? `<div class="ops-empty-state">${window.t_ops('accountPerf.empty')}</div>`
            : pageAccounts.map((s, i) => {
                const rank = start + i + 1;
                const val  = _opsAcctPerfState.sortBy === "revenue" ? s.rev : s.total;
                const max  = _opsAcctPerfState.sortBy === "revenue" ? maxRev : maxTot;
                const barW = Math.round((val / max) * 100);
                return `
                  <div class="ops-perf-row">
                    <div class="ops-perf-rank-num">${rank}</div>
                    <div class="ops-perf-info">
                      <div class="ops-perf-email">${s.label || s.key || "-"}</div>
                      <div class="ops-perf-meta">${_opsAcctPerfState.sortBy === "orders" ? _opsFmtSAR(s.rev) : `${s.total.toLocaleString("en-US")} ${window.t_ops('accountPerf.ordersCount')}`}</div>
                      <div class="ops-perf-bar-track">
                        <div class="ops-perf-bar ops-animated-bar" style="width:${barW}%"></div>
                      </div>
                    </div>
                    <div class="ops-perf-rev">${_opsAcctPerfState.sortBy === "orders" ? `${s.total.toLocaleString("en-US")} <span style="font-size:var(--type-micro);font-weight:var(--weight-medium);color:var(--text3)">${window.t_ops('accountPerf.ordersCount')}</span>` : _opsFmtSAR(s.rev)}</div>
                  </div>`;
              }).join("")
          }
        </div>
        ${totalPages > 1 ? _opsPaginationHtml("perf", _opsAcctPerfState.page, totalPages, window.t_ops('productPerf.pageOf', { current: _opsAcctPerfState.page, total: totalPages })) : ""}
      </div>`;

    container.querySelector("#ops-perf-sort")?.addEventListener("click", e => {
      const btn = e.target.closest(".analytics-tab-btn");
      if (btn) {
        _opsAcctPerfState.sortBy = btn.dataset.sort;
        _opsAcctPerfState.page = 1;
        render();
      }
    });
    container.querySelector("#ops-perf-prev")?.addEventListener("click", () => {
      if (_opsAcctPerfState.page > 1) { _opsAcctPerfState.page--; render(); }
    });
    container.querySelector("#ops-perf-next")?.addEventListener("click", () => {
      if (_opsAcctPerfState.page < totalPages) { _opsAcctPerfState.page++; render(); }
    });
    container.querySelectorAll("[data-ops-perf-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        const page = parseInt(btn.dataset.opsPerfPage, 10);
        if (!isNaN(page)) { _opsAcctPerfState.page = page; render(); }
      });
    });
  };

  render();
}

// ── Product Performance ─────────────────────────────────────────────────────
const _opsProdPerfState = { page: 1, perPage: 10, account: "", search: "", sortBy: "", sortDir: "" };

function renderOpsProductPerf(container, allRuns) {
  if (!container) return;
  _opsProdPerfState.page = 1;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);

  const _render = () => {
    const accounts = _opsUniqueAccounts(allRuns);
    const validKeys = new Set(accounts.map(a => a.key));
    if (_opsProdPerfState.account && !validKeys.has(_opsProdPerfState.account)) {
      _opsProdPerfState.account = "";
    }
    const filteredRuns = _opsProdPerfState.account
      ? (allRuns || []).filter(r => _opsAccountMatches(r, _opsProdPerfState.account))
      : (allRuns || []);
    const orders  = _opsFlattenRuns(filteredRuns);
    const query = _opsProdPerfState.search.trim().toLowerCase();
    let grouped = _opsGroupBy(orders, "productName");
    if (query) {
      grouped = grouped.filter(g => String(g.key || "").toLowerCase().includes(query));
    }
    if (_opsProdPerfState.sortBy) grouped = grouped.sort((a, b) => {
      const dir = _opsProdPerfState.sortDir === "asc" ? 1 : -1;
      let valA;
      let valB;
      if (_opsProdPerfState.sortBy === "product") {
        valA = String(a.key || "").toLowerCase();
        valB = String(b.key || "").toLowerCase();
        return valA.localeCompare(valB) * dir;
      }
      if (_opsProdPerfState.sortBy === "revenue") {
        valA = a.total || 0;
        valB = b.total || 0;
      } else if (_opsProdPerfState.sortBy === "deliveredPct") {
        valA = a.count ? a.items.filter(o => typeof _opsIsDelivered === "function" && _opsIsDelivered(o)).length / a.count : 0;
        valB = b.count ? b.items.filter(o => typeof _opsIsDelivered === "function" && _opsIsDelivered(o)).length / b.count : 0;
      } else if (_opsProdPerfState.sortBy === "failedPct") {
        valA = a.count ? a.items.filter(o => typeof _opsIsFailed === "function" && _opsIsFailed(o)).length / a.count : 0;
        valB = b.count ? b.items.filter(o => typeof _opsIsFailed === "function" && _opsIsFailed(o)).length / b.count : 0;
      } else {
        valA = a.count || 0;
        valB = b.count || 0;
      }
      return (valA - valB) * dir;
    });
    const maxCount = Math.max(...grouped.map(g => g.count || 0), 1);
    const totalPages = Math.max(1, Math.ceil(grouped.length / _opsProdPerfState.perPage));
    const start = (_opsProdPerfState.page - 1) * _opsProdPerfState.perPage;
    const pageGroups = grouped.slice(start, start + _opsProdPerfState.perPage);
    const allOrderCount = _opsFlattenRuns(allRuns || []).length;
    const accountOptions = [{ value: "", label: `${window.t_ops('productPerf.allAccounts')}  ${allOrderCount.toLocaleString("en-US")} ${window.t_ops('accountPerf.ordersCount')}` }]
      .concat(accounts.map(a => {
        const count = _opsFlattenRuns((allRuns || []).filter(r => _opsAccountMatches(r, a.key))).length;
        return {
          value: a.key,
          label: `${a.label || a.email || a.key}  ${count.toLocaleString("en-US")} ${window.t_ops('accountPerf.ordersCount')}`,
          subLabel: a.email && a.email !== a.label ? a.email : "",
        };
      }));

    container.innerHTML = `
      <div class="ops-product-card">
        <div class="ops-product-header">
          <div class="ops-section-title">📦 ${window.t_ops('productPerf.title')} <span style="font-size:var(--type-caption);font-weight:var(--weight-regular);color:var(--text3)">(${window.t_ops('productPerf.detailed')})</span></div>
          <div class="ops-product-header-right">
            <div class="ops-product-search-wrap">
              <span class="ops-product-search-icon">🔍</span>
              <input type="text" class="ops-product-search" id="ops-product-search"
                placeholder="${escapeHtml(window.t_ops('productPerf.searchPlaceholder', { default: 'Search product...' }))}"
                value="${escapeHtml(_opsProdPerfState.search)}" autocomplete="off" spellcheck="false">
            </div>
            <button class="ops-product-clear-sort-btn" id="ops-product-clear-sort" type="button">
              ${escapeHtml(window.t_ops('productPerf.clearSort', { default: 'Clear Sort' }))}
            </button>
            ${accounts.length > 1 ? `<div class="ops-product-account-select" id="ops-product-account-select"></div>` : ""}
            <span style="font-size:var(--type-caption);color:var(--text3)">${grouped.length} ${window.t_ops('productPerf.products')}</span>
          </div>
        </div>
        <div class="ops-product-table-wrap">
        <table class="ops-product-table">
          <thead>
            <tr>
              <th data-sort="product">${window.t_ops('productPerf.cols.product')}</th>
              <th data-sort="orders">${window.t_ops('productPerf.cols.orders')}</th>
              <th data-sort="revenue">${window.t_ops('productPerf.cols.revenue')}</th>
              <th data-sort="deliveredPct">${window.t_ops('productPerf.cols.deliveredPct')}</th>
              <th data-sort="failedPct">${window.t_ops('productPerf.cols.failedPct')}</th>
              <th style="width:80px">${window.t_ops('productPerf.cols.performance')}</th>
            </tr>
          </thead>
          <tbody>
            ${pageGroups.length === 0
              ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">${window.t_ops('productPerf.empty')}</td></tr>`
              : pageGroups.map(g => {
                  const failed = g.items.filter(o => typeof _opsIsFailed === "function" && _opsIsFailed(o)).length;
                  const refPct = g.count ? Math.round((failed / g.count) * 100) : 0;
                  const barW   = Math.round((g.count / maxCount) * 100);
                   const delivered = g.items.filter(o => typeof _opsIsDelivered === "function" && _opsIsDelivered(o)).length;
                  const convPct = g.count ? Math.round((delivered / g.count) * 100) : 0;
                  const barColor = refPct > 10 ? "var(--danger)" : "var(--success)";
                  return `
                    <tr>
                      <td class="ops-product-name-cell" title="${escapeHtml(g.key || "")}">${escapeHtml(g.key || window.t_ops('orderDetails.unknown'))}</td>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px">
                          <span style="font-weight:var(--weight-semibold)">${g.count}</span>
                          <div style="flex:1;background:var(--bg3);border-radius:4px;height:5px;min-width:40px">
                            <div class="ops-animated-bar" style="width:${barW}%;height:100%;background:var(--accent);border-radius:4px"></div>
                          </div>
                        </div>
                      </td>
                      <td style="font-weight:var(--weight-semibold)">${g.total.toLocaleString("en-SA", {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td>${convPct}%</td>
                      <td class="${refPct > 10 ? "ops-danger-text" : ""}">${refPct}%</td>
                      <td class="ops-product-bar-cell">
                        <div class="ops-product-bar-track">
                          <div class="ops-product-bar ops-animated-bar" style="width:${barW}%;background:${barColor}"></div>
                        </div>
                      </td>
                    </tr>`;
                }).join("")
            }
          </tbody>
        </table>
        </div>
        ${totalPages > 1 ? _opsPaginationHtml("prod", _opsProdPerfState.page, totalPages, window.t_ops('productPerf.pageOf', { current: _opsProdPerfState.page, total: totalPages })) : ""}
        <div class="ops-product-footnote">
          * ${window.t_ops('productPerf.footnote')}
        </div>
      </div>`;

    container.querySelectorAll(".ops-product-table th[data-sort]").forEach(th => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.sort === _opsProdPerfState.sortBy) {
        th.classList.add(_opsProdPerfState.sortDir === "asc" ? "sort-asc" : "sort-desc");
      }
      th.addEventListener("click", () => {
        const sortBy = th.dataset.sort;
        if (_opsProdPerfState.sortBy === sortBy) {
          _opsProdPerfState.sortDir = _opsProdPerfState.sortDir === "asc" ? "desc" : "asc";
        } else {
          _opsProdPerfState.sortBy = sortBy;
          _opsProdPerfState.sortDir = sortBy === "product" ? "asc" : "desc";
        }
        _opsProdPerfState.page = 1;
        _render();
      });
    });
    container.querySelector("#ops-product-search")?.addEventListener("input", debounce(e => {
      _opsProdPerfState.search = e.target.value;
      _opsProdPerfState.page = 1;
      _render();
      const search = container.querySelector("#ops-product-search");
      if (search) {
        search.focus();
        const pos = search.value.length;
        search.setSelectionRange(pos, pos);
      }
    }, 200));
    container.querySelector("#ops-product-clear-sort")?.addEventListener("click", () => {
      _opsProdPerfState.sortBy = "";
      _opsProdPerfState.sortDir = "";
      _opsProdPerfState.page = 1;
      _render();
    });
    container.querySelector("#ops-prod-prev")?.addEventListener("click", () => {
      if (_opsProdPerfState.page > 1) { _opsProdPerfState.page--; _render(); }
    });
    container.querySelector("#ops-prod-next")?.addEventListener("click", () => {
      if (_opsProdPerfState.page < totalPages) { _opsProdPerfState.page++; _render(); }
    });
    container.querySelectorAll("[data-ops-prod-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        const page = parseInt(btn.dataset.opsProdPage, 10);
        if (!isNaN(page)) { _opsProdPerfState.page = page; _render(); }
      });
    });

    if (accounts.length > 1) {
      renderCustomSelect(
        container.querySelector("#ops-product-account-select"),
        accountOptions,
        _opsProdPerfState.account,
        function(value) {
          _opsProdPerfState.account = value;
          _opsProdPerfState.page = 1;
          _render();
        },
        { searchable: true, maxHeight: "280px" }
      );
    }
  };

  _render();
}

function _opsPaginationHtml(prefix, currentPage, totalPages, infoText) {
  const win = 2;
  const pageNums = [];
  for (let p = Math.max(1, currentPage - win); p <= Math.min(totalPages, currentPage + win); p++) {
    pageNums.push(p);
  }
  const showFirst = pageNums[0] > 1;
  const showLast = pageNums[pageNums.length - 1] < totalPages;
  const pageAttr = prefix === "prod" ? "data-ops-prod-page" : "data-ops-perf-page";
  return `
    <div class="ops-history-pagination explorer-pagination">
      <span class="explorer-pagination-info">${infoText}</span>
      <div class="explorer-pagination-controls">
        <button class="ops-history-pag-btn pagination-btn pagination-arrow-btn" id="ops-${prefix}-prev" ${currentPage <= 1 ? "disabled" : ""} aria-label="${window.t_ops('history.prev')}">←</button>
        ${showFirst ? `<button class="pagination-btn" ${pageAttr}="1">1</button><span class="pagination-ellipsis">…</span>` : ""}
        ${pageNums.map(p => `<button class="pagination-btn${p === currentPage ? " active" : ""}" ${pageAttr}="${p}">${p}</button>`).join("")}
        ${showLast ? `<span class="pagination-ellipsis">…</span><button class="pagination-btn" ${pageAttr}="${totalPages}">${totalPages}</button>` : ""}
        <button class="ops-history-pag-btn pagination-btn pagination-arrow-btn" id="ops-${prefix}-next" ${currentPage >= totalPages ? "disabled" : ""} aria-label="${window.t_ops('history.next')}">→</button>
      </div>
    </div>`;
}

// ── Removed: renderOpsPresets (advanced filters) ────────────────────────────
// ── Removed: renderOpsSettings (analytics settings) ────────────────────────
/*
async function renderOpsPresets(container, allRuns, onApplyPreset) {
  if (!container) return;

  const BUILTIN = [
    { id: "b1", name: "Failed Orders Riyadh", color: "#ff5c5c", filters: { status: ["Failed"], city: ["الرياض", "Riyadh"] }, builtin: true },
    { id: "b2", name: "High COD (> 500 SAR)", color: "#f6bd16", filters: { minAmount: 500 }, builtin: true },
    { id: "b3", name: "Real Orders Only",     color: "#2dd98a", filters: { source: "real" }, builtin: true },
    { id: "b4", name: "This Week Top Cities", color: "#9b8ff0", filters: {}, builtin: true },
  ];

  const orders   = _opsFlattenRuns(allRuns);
  const cities   = [...new Set(orders.map(o => o.city).filter(Boolean))].sort();
  const statuses = [...new Set(orders.map(o => o.orderStatus).filter(Boolean))].sort();
  let savedPresets = [];
  try { savedPresets = await _opsGetPresets(); } catch(e) {}

  const allPresets = [...BUILTIN, ...savedPresets];
  allPresets.forEach(p => {
    p.orderCount = _opsApplyPresetFilter(orders, p.filters || {}).length;
  });

  container.innerHTML = `
    <div class="ops-presets-card">
      <div class="ops-presets-header">
        <div class="ops-section-title">⚡ Advanced Filters <span style="font-size:var(--type-caption);font-weight:var(--weight-regular);color:var(--text3)">(Saved Presets)</span></div>
        <button class="ops-link-btn" id="ops-presets-manage">Manage</button>
      </div>

      <!-- Preset chips -->
      <div class="ops-preset-chips" id="ops-preset-chips">
        ${allPresets.map(p => `
          <div class="ops-preset-chip" data-preset-id="${p.id}" style="border-color:${p.color || "var(--border)"}44">
            <div class="ops-preset-chip-name" style="color:${p.color || "var(--text)"}">${p.name}</div>
            <div class="ops-preset-chip-count">${(p.orderCount || 0).toLocaleString("en-US")} orders</div>
            ${!p.builtin ? `<button class="ops-preset-chip-del" data-preset-id="${p.id}">✕</button>` : ""}
          </div>`).join("")}
      </div>

      <!-- Create New Preset form -->
      <div class="ops-preset-builder">
        <div class="ops-preset-builder-title">✏ Create New Preset</div>
        <div class="ops-preset-row">
          <label>Preset Name</label>
          <input type="text" class="ops-field" id="ops-preset-name" placeholder="My Custom Filter" style="flex:1">
        </div>
        <div class="ops-preset-row">
          <label>Status</label>
          <select class="ops-field" id="ops-preset-status" style="flex:1">
            <option value="">Select status</option>
            ${statuses.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>
          <label style="margin-left:8px">City</label>
          <select class="ops-field" id="ops-preset-city" style="flex:1">
            <option value="">Select city</option>
            ${cities.map(c => `<option value="${c}">${c}</option>`).join("")}
          </select>
        </div>
        <div class="ops-preset-row">
          <label>Min Amount (SAR)</label>
          <input type="number" class="ops-field" id="ops-preset-min" placeholder="0" style="flex:1">
          <label style="margin-left:8px">Max Amount (SAR)</label>
          <input type="number" class="ops-field" id="ops-preset-max" placeholder="1000" style="flex:1">
          <label style="margin-left:8px">Source</label>
          <select class="ops-field" id="ops-preset-source" style="flex:1">
            <option value="">All</option>
            <option value="real">Real Only</option>
            <option value="missed">Missed Only</option>
          </select>
        </div>
        <button class="ops-save-preset-btn" id="ops-preset-save-btn">💾 Save Preset</button>
      </div>
    </div>`;

  // Chip click → apply preset
  container.querySelectorAll(".ops-preset-chip").forEach(chip => {
    chip.addEventListener("click", e => {
      if (e.target.classList.contains("ops-preset-chip-del")) return;
      const pid    = chip.dataset.presetId;
      const preset = allPresets.find(p => p.id === pid);
      if (preset && typeof onApplyPreset === "function") onApplyPreset(preset);
      container.querySelectorAll(".ops-preset-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  // Delete custom preset
  container.querySelectorAll(".ops-preset-chip-del").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const updated = savedPresets.filter(p => p.id !== btn.dataset.presetId);
      await _opsSavePresets(updated);
      renderOpsPresets(container, allRuns, onApplyPreset);
    });
  });

  // Save new preset
  container.querySelector("#ops-preset-save-btn")?.addEventListener("click", async () => {
    const name   = container.querySelector("#ops-preset-name")?.value.trim();
    const status = container.querySelector("#ops-preset-status")?.value;
    const city   = container.querySelector("#ops-preset-city")?.value;
    const minAmt = parseFloat(container.querySelector("#ops-preset-min")?.value) || null;
    const maxAmt = parseFloat(container.querySelector("#ops-preset-max")?.value) || null;
    const source = container.querySelector("#ops-preset-source")?.value;
    if (!name) { alert("Please enter a preset name."); return; }
    const filters = {};
    if (status) filters.status = [status];
    if (city)   filters.city   = [city];
    if (minAmt != null) filters.minAmount = minAmt;
    if (maxAmt != null) filters.maxAmount = maxAmt;
    if (source) filters.source = source;
    const colors  = ["#6c63ff","#3ecf8e","#f59e0b","#ef4444","#3b82f6","#ec4899","#14b8a6"];
    const newPreset = { id: "p_" + Date.now(), name, filters, builtin: false, color: colors[savedPresets.length % colors.length] };
    await _opsSavePresets([...savedPresets, newPreset]);
    renderOpsPresets(container, allRuns, onApplyPreset);
  });
}
*/
