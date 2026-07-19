(function () {
  "use strict";

  const PAGE_SIZE = 50;
  const HISTORY_PAGE_SIZE = 10;

  window.renderRunResults = async function renderRunResults(onBack) {
    const root = document.getElementById("page-run-results");
    if (!root) return;

    const state = {
      runs: [],
      detail: null,
      selectedRunId: "",
      activeBucket: "failed",
      activeFilter: "thisMonth",
      customFrom: "",
      customTo: "",
      activeAccount: "",
      search: "",
      rowPage: 1,
      historyPage: 1,
      loadingDetail: false,
    };

    function tr(key, args) {
      return window.t_ops ? window.t_ops("runResults." + key, args) : key;
    }

    function esc(value) {
      if (window.analyticsEscapeHtml) return window.analyticsEscapeHtml(value);
      return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[ch]);
    }

    function fmtInt(value) {
      return (Number(value) || 0).toLocaleString((window._kbotLang || "en") === "ar" ? "ar-EG-u-nu-latn" : "en-US");
    }

    function fmtDateTime(value) {
      return window.formatAnalyticsDateTime ? window.formatAnalyticsDateTime(value) : new Date(value || Date.now()).toLocaleString();
    }

    function rangeForFilter(filter) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = d => {
        const e = new Date(d);
        e.setHours(23, 59, 59, 999);
        return e;
      };
      if (filter === "today") return { from: today, to: end(today) };
      if (filter === "yesterday") {
        const y = new Date(today);
        y.setDate(today.getDate() - 1);
        return { from: y, to: end(y) };
      }
      if (filter === "last7") {
        const from = new Date(today);
        from.setDate(today.getDate() - 6);
        return { from, to: end(today) };
      }
      if (filter === "thisMonth") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: end(today) };
      if (filter === "custom" && state.customFrom && state.customTo) {
        return { from: new Date(state.customFrom), to: end(new Date(state.customTo)) };
      }
      return null;
    }

    function dateParam(date) {
      if (!(date instanceof Date) || isNaN(date.getTime())) return "";
      return date.toISOString().slice(0, 10);
    }

    function accountKey(run) {
      return run && (run.accountId || run.accountLabel || "");
    }

    function accountLabel(run) {
      return run && (run.accountLabel || run.accountId || tr("allAccounts"));
    }

    function runMatchesAccount(run) {
      return !state.activeAccount || accountKey(run) === state.activeAccount;
    }

    function visibleRuns() {
      return (state.runs || []).filter(runMatchesAccount);
    }

    function selectedRun() {
      return visibleRuns().find(run => String(run.runId) === String(state.selectedRunId)) || visibleRuns()[0] || null;
    }

    function totals() {
      return visibleRuns().reduce((acc, run) => {
        const s = run.summary || {};
        acc.attempted += Number(s.attempted) || 0;
        acc.confirmed += Number(s.confirmed) || 0;
        acc.uncertain += Number(s.uncertain) || 0;
        acc.failed += Number(s.failed) || 0;
        return acc;
      }, { attempted: 0, confirmed: 0, uncertain: 0, failed: 0 });
    }

    function bucketCount(bucket) {
      const s = (state.detail && state.detail.summary) || (selectedRun() && selectedRun().summary) || {};
      return Number(s[bucket]) || 0;
    }

    function defaultBucket(run) {
      const s = run && run.summary || {};
      if ((Number(s.failed) || 0) > 0) return "failed";
      if ((Number(s.uncertain) || 0) > 0) return "uncertain";
      if ((Number(s.confirmed) || 0) > 0) return "confirmed";
      return "attempted";
    }

    function bucketOrders() {
      const detail = state.detail;
      if (!detail || !Array.isArray(detail.orders)) return [];
      const wanted = state.activeBucket;
      return detail.orders.filter(order => {
        if (wanted === "attempted") return order.outcome === "attempted";
        if (wanted === "confirmed") return order.outcome === "confirmed_in_taager";
        if (wanted === "failed") return order.outcome === "failed_on_taager";
        return order.outcome === "submitted_uncertain" || order.outcome === "skipped_warning";
      });
    }

    function filteredOrders() {
      const q = state.search.trim().toLowerCase();
      const rows = bucketOrders();
      if (!q) return rows;
      return rows.filter(order => [
        order.customerName,
        order.phone,
        order.productName,
        order.sku,
        order.reasonMessage,
        order.destination
      ].join(" ").toLowerCase().includes(q));
    }

    function shellHtml() {
      return `
        <div class="sv3-shell run-results-shell" style="height:100%;">
          ${renderSharedSidebar("runResults")}
          <div class="sv3-content-scroll run-results-scroll" style="flex:1;min-height:0;overflow:auto;min-width:0;position:relative;">
            <div class="rr-page">
              <div class="rr-header">
                <div>
                  <div class="rr-title">${esc(tr("title"))}</div>
                  <div class="rr-subtitle">${esc(tr("subtitle"))}</div>
                </div>
                <div class="rr-controls">
                  <div class="analytics-tabs-group rr-date-tabs" id="rr-date-tabs">
                    ${["today", "yesterday", "last7", "thisMonth", "custom"].map(filter => `
                      <button class="analytics-tab-btn ${state.activeFilter === filter ? "active" : ""}" data-filter="${filter}" type="button">${esc(tr("filters." + filter))}</button>
                    `).join("")}
                  </div>
                  <div class="analytics-date-custom-inline rr-custom-date" id="rr-custom-date" style="display:${state.activeFilter === "custom" ? "flex" : "none"}">
                    <input type="date" class="date-input-inline" id="rr-custom-from" value="${esc(state.customFrom)}">
                    <span>${esc(tr("filters.to"))}</span>
                    <input type="date" class="date-input-inline" id="rr-custom-to" value="${esc(state.customTo)}">
                    <button class="btn-apply-inline" id="rr-custom-apply" type="button">${esc(tr("filters.apply"))}</button>
                  </div>
                </div>
              </div>
              <div class="rr-account-row">
                <div id="rr-account-select" class="rr-account-select"></div>
                <div class="rr-search-wrap">
                  <input id="rr-search" class="rr-search" value="${esc(state.search)}" placeholder="${esc(tr("searchPlaceholder"))}" autocomplete="off">
                </div>
              </div>
              <div id="rr-summary"></div>
              <div class="rr-main">
                <aside id="rr-history"></aside>
                <section id="rr-detail"></section>
              </div>
            </div>
          </div>
        </div>`;
    }

    function renderSummary() {
      const t = totals();
      const tiles = [
        ["attempted", "blue", t.attempted],
        ["confirmed", "green", t.confirmed],
        ["uncertain", "amber", t.uncertain],
        ["failed", "red", t.failed],
      ];
      const mount = root.querySelector("#rr-summary");
      if (!mount) return;
      mount.innerHTML = `<div class="rr-summary-grid">
        ${tiles.map(([key, color, count]) => `
          <button class="rr-summary-tile ${color}" data-summary-bucket="${key}" type="button">
            <span class="rr-dot"></span>
            <span class="rr-summary-copy">
              <strong>${fmtInt(count)}</strong>
              <span>${esc(tr("buckets." + key))}</span>
            </span>
          </button>
        `).join("")}
      </div>`;
      mount.querySelectorAll("[data-summary-bucket]").forEach(btn => {
        btn.addEventListener("click", () => {
          state.activeBucket = btn.dataset.summaryBucket;
          state.rowPage = 1;
          renderDetail();
        });
      });
    }

    function renderAccountSelect() {
      const mount = root.querySelector("#rr-account-select");
      if (!mount) return;
      const seen = new Set();
      const options = [{ value: "", label: tr("allAccounts") }];
      state.runs.forEach(run => {
        const key = accountKey(run);
        if (!key || seen.has(key)) return;
        seen.add(key);
        options.push({ value: key, label: accountLabel(run), subLabel: run.taagerCountry || "" });
      });
      if (window.renderTaagerDropdown) {
        window.renderTaagerDropdown(mount, options, state.activeAccount, value => {
          state.activeAccount = value;
          state.historyPage = 1;
          const run = selectedRun();
          state.selectedRunId = run ? run.runId : "";
          state.detail = null;
          if (run) loadDetail(run.runId);
          renderAll();
        }, { searchable: true, ariaLabel: tr("allAccounts"), maxHeight: "320px" });
      }
    }

    function renderHistory() {
      const mount = root.querySelector("#rr-history");
      if (!mount) return;
      const runs = visibleRuns();
      const pages = Math.max(1, Math.ceil(runs.length / HISTORY_PAGE_SIZE));
      state.historyPage = Math.min(state.historyPage, pages);
      const start = (state.historyPage - 1) * HISTORY_PAGE_SIZE;
      const pageRuns = runs.slice(start, start + HISTORY_PAGE_SIZE);
      mount.innerHTML = `
        <div class="rr-history-panel">
          <div class="rr-panel-head">
            <strong>${esc(tr("latestRun"))}</strong>
            <span>${esc(tr("totalRuns", { count: runs.length }))}</span>
          </div>
          <div class="rr-history-list">
            ${pageRuns.length ? pageRuns.map(runCardHtml).join("") : emptyHtml(tr("noRunsTitle"), tr("noRunsBody"))}
          </div>
          ${runs.length > HISTORY_PAGE_SIZE ? `
            <div class="rr-pagination">
              <button id="rr-history-prev" type="button" ${state.historyPage <= 1 ? "disabled" : ""}>‹</button>
              <span>${state.historyPage} / ${pages}</span>
              <button id="rr-history-next" type="button" ${state.historyPage >= pages ? "disabled" : ""}>›</button>
            </div>` : ""}
        </div>`;
      mount.querySelectorAll("[data-run-id]").forEach(row => {
        row.addEventListener("click", () => {
          state.selectedRunId = row.dataset.runId;
          const run = selectedRun();
          state.activeBucket = defaultBucket(run);
          state.rowPage = 1;
          state.detail = null;
          renderHistory();
          renderDetail();
          loadDetail(state.selectedRunId);
        });
      });
      mount.querySelector("#rr-history-prev")?.addEventListener("click", () => { state.historyPage--; renderHistory(); });
      mount.querySelector("#rr-history-next")?.addEventListener("click", () => { state.historyPage++; renderHistory(); });
    }

    function runCardHtml(run) {
      const s = run.summary || {};
      const selected = String(run.runId) === String(state.selectedRunId);
      return `
        <button class="rr-run-card ${selected ? "active" : ""} ${esc(run.status || "")}" data-run-id="${esc(run.runId)}" type="button">
          <span class="rr-run-status-dot"></span>
          <span class="rr-run-body">
            <strong>${esc(accountLabel(run))}</strong>
            <span>${esc(fmtDateTime(run.runTimestamp))}</span>
            <span class="rr-run-metrics">
              ${fmtInt(s.attempted)} ${esc(tr("summary.attempted"))} ·
              ${fmtInt(s.confirmed)} ${esc(tr("summary.confirmed"))} ·
              ${fmtInt(s.uncertain)} ${esc(tr("summary.uncertain"))} ·
              ${fmtInt(s.failed)} ${esc(tr("summary.failed"))}
            </span>
          </span>
          <span class="rr-run-status">${esc(tr("status." + (run.status || "all_ok")))}</span>
        </button>`;
    }

    function renderDetail() {
      const mount = root.querySelector("#rr-detail");
      if (!mount) return;
      const run = selectedRun();
      if (!run) {
        mount.innerHTML = `<div class="rr-detail-panel">${emptyHtml(tr("noDetailTitle"), tr("noDetailBody"))}</div>`;
        return;
      }
      if (state.loadingDetail || !state.detail) {
        mount.innerHTML = `
          <div class="rr-detail-panel">
            <div class="rr-detail-top">
              <div><strong>${esc(accountLabel(run))}</strong><span>${esc(fmtDateTime(run.runTimestamp))}</span></div>
            </div>
            <div class="rr-loading-row"><span class="sk" style="width:100%;height:220px;border-radius:var(--radius-sm);display:block"></span></div>
          </div>`;
        return;
      }
      if (state.detail._error) {
        mount.innerHTML = `
          <div class="rr-detail-panel">
            <div class="rr-detail-top">
              <div><strong>${esc(accountLabel(run))}</strong><span>${esc(fmtDateTime(run.runTimestamp))}</span></div>
            </div>
            ${emptyHtml(tr("detailMissing"), "")}
          </div>`;
        return;
      }
      const rows = filteredOrders();
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      state.rowPage = Math.min(state.rowPage, pages);
      const start = (state.rowPage - 1) * PAGE_SIZE;
      const pageRows = rows.slice(start, start + PAGE_SIZE);
      mount.innerHTML = `
        <div class="rr-detail-panel">
          <div class="rr-detail-top">
            <div>
              <strong>${esc(accountLabel(run))}</strong>
              <span>${esc(fmtDateTime(run.runTimestamp))}</span>
            </div>
            <div class="rr-detail-actions">
              <button id="rr-export-visible" type="button">${esc(tr("actionsBar.exportVisible"))}</button>
              ${state.detail.artifacts && state.detail.artifacts.failedFolderPath ? `<button id="rr-open-failed-folder" type="button">${esc(tr("actionsBar.openFailedFolder"))}</button>` : ""}
            </div>
          </div>
          <div class="rr-bucket-row">
            ${bucketButton("attempted", "blue")}
            ${bucketButton("confirmed", "green")}
            ${bucketButton("uncertain", "amber")}
            ${bucketButton("failed", "red")}
          </div>
          <div class="rr-table-wrap">
            ${pageRows.length ? tableHtml(pageRows) : emptyHtml(state.search ? tr("noSearch") : tr("noRows"), "")}
          </div>
          ${rows.length > PAGE_SIZE ? `
            <div class="rr-pagination">
              <button id="rr-rows-prev" type="button" ${state.rowPage <= 1 ? "disabled" : ""}>‹</button>
              <span>${state.rowPage} / ${pages}</span>
              <button id="rr-rows-next" type="button" ${state.rowPage >= pages ? "disabled" : ""}>›</button>
            </div>` : ""}
        </div>`;

      mount.querySelectorAll("[data-bucket]").forEach(btn => {
        btn.addEventListener("click", () => {
          state.activeBucket = btn.dataset.bucket;
          state.rowPage = 1;
          renderDetail();
        });
      });
      mount.querySelector("#rr-rows-prev")?.addEventListener("click", () => { state.rowPage--; renderDetail(); });
      mount.querySelector("#rr-rows-next")?.addEventListener("click", () => { state.rowPage++; renderDetail(); });
      mount.querySelector("#rr-open-failed-folder")?.addEventListener("click", () => {
        const folder = state.detail && state.detail.artifacts && state.detail.artifacts.failedFolderPath;
        if (folder && window.api && window.api.openFolder) window.api.openFolder(folder);
      });
      mount.querySelector("#rr-export-visible")?.addEventListener("click", exportVisibleRows);
      mount.querySelectorAll("[data-copy-phone]").forEach(btn => {
        btn.addEventListener("click", () => copyText(btn.dataset.copyPhone || ""));
      });
      mount.querySelectorAll("[data-copy-row]").forEach(btn => {
        btn.addEventListener("click", () => {
          const row = pageRows[Number(btn.dataset.copyRow) || 0] || {};
          copyText([row.customerName, row.phone, row.productName, row.sku, row.reasonMessage].filter(Boolean).join(" | "));
        });
      });
    }

    function bucketButton(key, color) {
      return `
        <button class="rr-bucket-btn ${color} ${state.activeBucket === key ? "active" : ""}" data-bucket="${key}" type="button">
          <span class="rr-dot"></span>
          <span>${esc(tr("buckets." + key))}</span>
          <strong>${fmtInt(bucketCount(key))}</strong>
        </button>`;
    }

    function tableHtml(rows) {
      return `
        <table class="rr-table">
          <thead><tr>
            <th>${esc(tr("cols.customer"))}</th>
            <th>${esc(tr("cols.phone"))}</th>
            <th>${esc(tr("cols.product"))}</th>
            <th>${esc(tr("cols.sku"))}</th>
            <th>${esc(tr("cols.source"))}</th>
            <th>${esc(tr("cols.destination"))}</th>
            <th>${esc(tr("cols.reason"))}</th>
            <th>${esc(tr("cols.action"))}</th>
          </tr></thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr>
                <td title="${esc(row.customerName)}">${esc(row.customerName || "-")}</td>
                <td class="rr-phone" title="${esc(row.phone)}">
                  <span>${esc(row.phone || "-")}</span>
                  ${row.phone ? `<button data-copy-phone="${esc(row.phone)}" type="button">${esc(tr("actionsBar.copyPhone"))}</button>` : ""}
                </td>
                <td class="rr-product" title="${esc(row.productName)}">${esc(row.productName || "-")}</td>
                <td title="${esc(row.sku)}">${esc(row.sku || "-")}</td>
                <td>${esc(row.source || "-")}</td>
                <td>${esc(row.destination || "-")}</td>
                <td class="rr-reason" title="${esc(row.reasonMessage)}">${esc(row.reasonMessage || "-")}</td>
                <td class="rr-action-cell">
                  <span>${esc(row.suggestedAction || "-")}</span>
                  <button data-copy-row="${index}" type="button">${esc(tr("actionsBar.copyRow"))}</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>`;
    }

    function emptyHtml(title, body) {
      return `<div class="rr-empty"><strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ""}</div>`;
    }

    async function copyText(text) {
      if (!text || !window.api || !window.api.copyText) return;
      await window.api.copyText(text).catch(() => {});
      if (window.TaagerUI) window.TaagerUI.toast(tr("copied"), { kind: "success" });
    }

    async function exportVisibleRows() {
      const rows = filteredOrders();
      if (!rows.length || !window.XLSX || !window.api || !window.api.saveOutputFile) return;
      const data = rows.map(row => ({
        Customer: row.customerName || "",
        Phone: row.phone || "",
        Product: row.productName || "",
        SKU: row.sku || "",
        Source: row.source || "",
        Destination: row.destination || "",
        Reason: row.reasonMessage || "",
        Action: row.suggestedAction || "",
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Run Results");
      const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const result = await window.api.saveOutputFile({ buffer, filename: `run-results-${state.activeBucket}.xlsx` }).catch(() => null);
      if (result && result.saved && window.TaagerUI) window.TaagerUI.toast(tr("exported"), { kind: "success" });
    }

    async function loadIndex() {
      const range = rangeForFilter(state.activeFilter);
      const filter = range ? { dateFrom: dateParam(range.from), dateTo: dateParam(range.to) } : {};
      const response = await window.api.getRunResultsIndex(filter).catch(() => ({ ok: false, runs: [] }));
      state.runs = response && Array.isArray(response.runs) ? response.runs : [];
      const run = selectedRun();
      state.selectedRunId = run ? run.runId : "";
      state.activeBucket = defaultBucket(run);
      state.detail = null;
    }

    async function loadDetail(runId) {
      if (!runId) return;
      state.loadingDetail = true;
      renderDetail();
      const response = await window.api.getRunResultDetail(runId).catch(err => ({ ok: false, error: err && err.message }));
      state.loadingDetail = false;
      if (response && response.ok && response.detail) {
        state.detail = response.detail;
      } else {
        state.detail = { summary: selectedRun()?.summary || {}, orders: [], artifacts: {}, _error: response && response.error };
      }
      renderDetail();
    }

    function bindShell() {
      wireSharedSidebar(root);
      root.querySelectorAll("#rr-date-tabs [data-filter]").forEach(btn => {
        btn.addEventListener("click", async () => {
          state.activeFilter = btn.dataset.filter;
          state.historyPage = 1;
          root.querySelectorAll("#rr-date-tabs [data-filter]").forEach(tab => {
            tab.classList.toggle("active", tab.dataset.filter === state.activeFilter);
          });
          root.querySelector("#rr-custom-date").style.display = state.activeFilter === "custom" ? "flex" : "none";
          if (state.activeFilter !== "custom") {
            await loadIndex();
            renderAll();
            if (state.selectedRunId) loadDetail(state.selectedRunId);
          }
        });
      });
      root.querySelector("#rr-custom-apply")?.addEventListener("click", async () => {
        state.customFrom = root.querySelector("#rr-custom-from")?.value || "";
        state.customTo = root.querySelector("#rr-custom-to")?.value || "";
        await loadIndex();
        renderAll();
        if (state.selectedRunId) loadDetail(state.selectedRunId);
      });
      root.querySelector("#rr-search")?.addEventListener("input", event => {
        state.search = event.target.value || "";
        state.rowPage = 1;
        renderDetail();
      });
    }

    function renderAll() {
      renderSummary();
      renderAccountSelect();
      renderHistory();
      renderDetail();
    }

    root.innerHTML = shellHtml();
    bindShell();
    await loadIndex();
    renderAll();
    if (state.selectedRunId) loadDetail(state.selectedRunId);
    if (window.TaagerPageI18n) window.TaagerPageI18n.apply(root);
  };
})();
