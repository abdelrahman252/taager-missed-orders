// operations-history.js — Run History panel (col3 row4, below Live Monitor)

const _opsHistoryState = { page: 1, perPage: 10 };

function renderOpsHistory(container, allRuns, onSelectRun, selectedRunId) {
  if (!container) return;
  const sorted = [...(allRuns || [])].sort((a, b) => (b.runTimestamp || 0) - (a.runTimestamp || 0));
  _opsHistoryState.page = 1;

  const _render = () => {
    const totalPages = Math.max(1, Math.ceil(sorted.length / _opsHistoryState.perPage));
    const start = (_opsHistoryState.page - 1) * _opsHistoryState.perPage;
    const pageRuns = sorted.slice(start, start + _opsHistoryState.perPage);

    container.innerHTML = `
      <div class="ops-history-card">
        <div class="ops-history-header">
          <div class="ops-section-title">🕒 ${window.t_ops('history.title')}</div>
          <span style="font-size:11px;color:var(--text3)">${sorted.length} ${window.t_ops('history.total')}</span>
        </div>
        <div class="ops-history-list" id="ops-history-list">
          ${_opsHistoryListHTML(pageRuns, selectedRunId)}
        </div>
        ${totalPages > 1 ? `
        <div class="ops-history-pagination explorer-pagination">
          <button class="ops-history-pag-btn pagination-btn pagination-arrow-btn" id="ops-hist-prev" ${_opsHistoryState.page <= 1 ? "disabled" : ""} aria-label="${window.t_ops('history.prev')}">←</button>
          <span class="explorer-pagination-info">${_opsHistoryState.page} / ${totalPages}</span>
          <button class="ops-history-pag-btn pagination-btn pagination-arrow-btn" id="ops-hist-next" ${_opsHistoryState.page >= totalPages ? "disabled" : ""} aria-label="${window.t_ops('history.next')}">→</button>
        </div>` : ""}
      </div>`;

    _bindRunClicks(container, allRuns, onSelectRun);

    container.querySelector("#ops-hist-prev")?.addEventListener("click", () => {
      if (_opsHistoryState.page > 1) { _opsHistoryState.page--; _render(); }
    });
    container.querySelector("#ops-hist-next")?.addEventListener("click", () => {
      if (_opsHistoryState.page < totalPages) { _opsHistoryState.page++; _render(); }
    });
  };

  _render();
}

function _opsHistoryListHTML(runs, selectedRunId) {
  if (!runs.length) return `<div class="ops-history-empty">${window.t_ops('history.empty')}</div>`;

  return runs.map(r => {
    const ts        = r.runTimestamp || 0;
    const timeStr   = ts ? _opsFmtHistoryDate(ts) : "—";
    const hasFail   = (r.ordersFailed || 0) > 0;
    const isMulti   = r._multiAccount || false;
    const statusCls = hasFail ? "failed" : "completed";
    const accountLine = (r.accountEmail && r.accountEmail !== "__single__")
      ? _opsAccountDisplay(r)
      : (isMulti ? window.t_ops('history.multiAccount') : "—");

    const isSelected = String(r.runId || "") === String(selectedRunId || "");

    return `
      <div class="ops-history-row ${statusCls} ${isSelected ? "active" : ""}" data-run-id="${r.runId || ""}">
        <div class="ops-run-icon-btn ${statusCls}">▶</div>
        <div class="ops-history-row-body">
          <div class="ops-history-row-date">${timeStr}</div>
          <div class="ops-history-row-meta">${accountLine}</div>
        </div>
        <div class="ops-history-row-right">
          <div class="ops-history-row-status ${statusCls}">
            ${hasFail ? "✗ " + window.t_ops('history.failed') : "✓ " + window.t_ops('history.completed')}
          </div>
          <div class="ops-history-row-count">${(r.ordersSubmitted || 0).toLocaleString()} ${window.t_ops('history.ordersCount')}</div>
        </div>
      </div>`;
  }).join("");
}

function _opsFmtHistoryDate(ts) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function _opsFmtHistoryTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function _bindRunClicks(container, allRuns, onSelectRun) {
  container.querySelectorAll(".ops-history-row").forEach(row => {
    row.addEventListener("click", () => {
      const runId = row.dataset.runId;
      if (runId && typeof onSelectRun === "function") onSelectRun(runId);
    });
  });
}
