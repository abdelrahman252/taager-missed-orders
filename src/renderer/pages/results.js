// ── RESULTS PAGE ──
window.renderResults = function (data, dateFrom, dateTo, onRunAgain, onHome) {
  // Build a time tag like "1423" for 2:23 PM — makes every run's filename unique
  const _now = new Date();
  const _runTimeTag = String(_now.getHours()).padStart(2,"0") + String(_now.getMinutes()).padStart(2,"0");
  const el = document.getElementById("page-results");
  const t  = window._t;
  const dateDisplay = dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;

  function safeFilenamePart(value) {
    return (value || "account").toString().trim().replace(/[^a-zA-Z0-9@._-]/g, "_") || "account";
  }

  function resultAccountTag(value) {
    return safeFilenamePart(value || data?._accountLabel || "account");
  }

  function getTaagerOrderCount(stats) {
    const count = Number(stats?.taagerOrderCount);
    if (Number.isFinite(count) && count >= 0) return count;
    return (stats?.realInTaager || 0) + (stats?.missedInTaager || 0);
  }

  function orderDestination(order) {
    return String(order?.destination || "cart").trim() || "cart";
  }

  function isLegacyMissingOrder(order) {
    return orderDestination(order) === "missing-orders";
  }

  function countLegacyMissingOrders(rows) {
    return (Array.isArray(rows) ? rows : []).filter(isLegacyMissingOrder).length;
  }

  function translated(key, fallback) {
    const value = t(key);
    return value === key ? fallback : value;
  }

  function formatFailReason(reason) {
    const text = String(reason || "").trim();
    if (!text) return t("results.error_occurred");
    if (/INTERNET_ISSUE|ERR_CONNECTION|net::|timeout/i.test(text)) {
      return translated(
        "results.internet_issue",
        "Internet connection or website timeout. The bot retries recoverable pages automatically; if the run stops, check your internet and run again."
      );
    }
    return text;
  }

  function callTranslation(key, fallback, ...args) {
    const value = t(key);
    if (typeof value === "function") return value(...args);
    return value === key ? fallback(...args) : value;
  }

  const RESULTS_PAGE_SIZE = 10;
  let resultsPagerSeq = 0;

  function ensureResultsPaginationStyle() {
    if (document.getElementById("results-pagination-style")) return;
    const style = document.createElement("style");
    style.id = "results-pagination-style";
    style.textContent = `
      .res-pagination {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 10px 12px;
        border-top: 1px solid var(--border);
        background: rgba(255,255,255,0.015);
      }
      .res-pagination-btn {
        min-width: 30px;
        height: 28px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg2);
        color: var(--text);
        font-size:var(--type-body);
        font-weight:var(--weight-semibold);
        cursor: pointer;
      }
      .res-pagination-btn:hover:not(:disabled) {
        border-color: var(--accent);
        background: rgba(79,142,247,0.08);
      }
      .res-pagination-btn:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .res-pagination-status {
        min-width: 82px;
        text-align: center;
        font-size:var(--type-caption);
        font-weight:var(--weight-semibold);
        color: var(--text2);
        white-space: nowrap;
      }
      .orders-preview-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      .orders-preview-table th,
      .orders-preview-table td {
        padding: 7px 10px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        font-size:var(--type-label);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .orders-preview-table th {
        font-weight:var(--weight-semibold);
        font-size:var(--type-caption);
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--text2);
        background: rgba(255,255,255,0.03);
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .orders-preview-table tbody tr:hover { background: rgba(79,142,247,0.05); }
      .orders-preview-table tbody tr:last-child td { border-bottom: none; }
      .orders-preview-table.skipped-orders-table {
        min-width: 1120px;
        table-layout: fixed;
      }
      .skipped-orders-table th,
      .skipped-orders-table td {
        padding: 7px 9px;
        vertical-align: middle;
      }
      .skipped-orders-table .skip-index {
        text-align: center;
        color: var(--text2);
        font-size:var(--type-caption);
        font-variant-numeric: tabular-nums;
      }
      .skipped-orders-table .skip-outcome {
        font-family:var(--font-mono);
        font-size:var(--type-caption);
        font-weight:var(--weight-bold);
      }
      .skipped-orders-table .skip-name,
      .skipped-orders-table .skip-product {
        direction: rtl;
        text-align: right;
        font-weight:var(--weight-semibold);
      }
      .skipped-orders-table .skip-phone {
        direction: ltr;
        font-family:var(--font-mono);
        font-size:var(--type-caption);
        font-variant-numeric: tabular-nums;
      }
      .skipped-orders-table .skip-reason {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        line-height: 1.35;
        font-size:var(--type-label);
        color: var(--text);
      }
      .skipped-orders-table .skip-alert {
        text-align: center;
        font-size:var(--type-body);
      }
      .skipped-orders-table col.skip-col-index { width: 36px; }
      .skipped-orders-table col.skip-col-outcome { width: 112px; }
      .skipped-orders-table col.skip-col-name { width: 15%; }
      .skipped-orders-table col.skip-col-raw { width: 12%; }
      .skipped-orders-table col.skip-col-normalized { width: 13%; }
      .skipped-orders-table col.skip-col-product { width: 25%; }
      .skipped-orders-table col.skip-col-reason { width: 27%; }
      .skipped-orders-table col.skip-col-alert { width: 44px; }
      .orders-preview-table.results-orders-table {
        width: 100%;
        min-width: 1360px;
      }
      .results-orders-table th,
      .results-orders-table td {
        padding: 9px 14px;
        vertical-align: middle;
        line-height: 1.35;
      }
      .results-orders-table .res-index {
        text-align: center;
        color: var(--text2);
        font-size:var(--type-caption);
      }
      .results-orders-table .res-name,
      .results-orders-table .res-product {
        direction: rtl;
        text-align: right;
      }
      .results-orders-table .res-name {
        font-weight:var(--weight-semibold);
      }
      .results-orders-table .res-product {
        color: var(--text);
        font-weight:var(--weight-bold);
      }
      .results-orders-table .res-phone {
        direction: ltr;
        font-family:var(--font-mono);
        color: var(--accent);
        font-size:var(--type-control);
        font-weight:var(--weight-semibold);
      }
      .results-orders-table .res-number {
        text-align: right;
        font-weight:var(--weight-bold);
      }
      .results-orders-table .res-price {
        color: var(--success);
      }
      .results-orders-table .res-date {
        color: var(--text2);
        font-variant-numeric: tabular-nums;
      }
      .results-orders-table .res-city {
        color: var(--text2);
        direction: rtl;
        text-align: right;
      }
      .results-orders-table-wrap {
        overflow-x: auto;
        overflow-y: visible;
        overscroll-behavior-inline: contain;
      }
      .failed-orders-table-wrap {
        overflow-x: auto;
        overflow-y: visible;
        overscroll-behavior-inline: contain;
      }
      .orders-preview-table.failed-orders-table {
        width: 100%;
        min-width: 940px;
      }
      .failed-orders-table th,
      .failed-orders-table td {
        padding: 8px 12px;
        vertical-align: middle;
        line-height: 1.35;
      }
      .failed-orders-table .failed-row {
        width: 58px;
        text-align: center;
        color: var(--text2);
        font-size:var(--type-caption);
        font-weight:var(--weight-semibold);
      }
      .failed-orders-table .failed-sku,
      .failed-orders-table .failed-phone,
      .failed-orders-table .failed-error {
        direction: ltr;
        text-align: left;
        font-family:var(--font-mono);
        font-variant-numeric: tabular-nums;
      }
      .failed-orders-table .failed-sku {
        color: var(--accent);
        font-size:var(--type-label);
        font-weight:var(--weight-semibold);
      }
      .failed-orders-table .failed-product {
        direction: rtl;
        text-align: right;
        color: var(--text);
        font-weight:var(--weight-bold);
      }
      .failed-orders-table .failed-phone {
        color: var(--text);
        font-size:var(--type-label);
        font-weight:var(--weight-semibold);
      }
      .failed-orders-table .failed-error {
        color: var(--danger);
        font-size:var(--type-label);
        font-weight:var(--weight-semibold);
      }
      .failed-orders-table .failed-product,
      .failed-orders-table .failed-error {
        max-width: 1px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      [dir="rtl"] .failed-orders-table th {
        text-align: right;
      }
      [dir="rtl"] .failed-orders-table .failed-row {
        text-align: center;
      }
      [dir="rtl"] .failed-orders-table .failed-sku,
      [dir="rtl"] .failed-orders-table .failed-phone,
      [dir="rtl"] .failed-orders-table .failed-error {
        text-align: left;
      }
    `;
    document.head.appendChild(style);
  }

  function attachResultPagination() {
    if (el._resPaginationHandler) {
      el.removeEventListener("click", el._resPaginationHandler);
    }
    el._resPaginationHandler = function (event) {
      const target = event.target;
      if (!target || typeof target.closest !== "function") return;
      const btn = target.closest("[data-res-page-target]");
      if (!btn || !el.contains(btn)) return;
      const pagerId = btn.dataset.resPageTarget;
      const controls = el.querySelector(`[data-res-controls="${pagerId}"]`);
      if (!controls) return;

      const pageCount = Number(controls.dataset.resPageCount || 1);
      const currentPage = Number(controls.dataset.resCurrentPage || 1);
      const direction = Number(btn.dataset.resPageDir || 0);
      const nextPage = Math.max(1, Math.min(pageCount, currentPage + direction));
      if (nextPage === currentPage) return;

      controls.dataset.resCurrentPage = String(nextPage);
      el.querySelectorAll(`[data-res-pager="${pagerId}"]`).forEach(item => {
        item.hidden = Number(item.dataset.resPage) !== nextPage;
      });
      const status = controls.querySelector("[data-res-page-status]");
      if (status) status.textContent = `${nextPage} / ${pageCount}`;
      controls.querySelectorAll("[data-res-page-dir]").forEach(controlBtn => {
        const dir = Number(controlBtn.dataset.resPageDir || 0);
        controlBtn.disabled = dir < 0 ? nextPage === 1 : nextPage === pageCount;
      });
    };
    el.addEventListener("click", el._resPaginationHandler);
  }

  function buildPaginationControls(pagerId, totalItems) {
    const pageCount = Math.ceil(totalItems / RESULTS_PAGE_SIZE);
    if (pageCount <= 1) return "";
    return `
      <div class="res-pagination" data-res-controls="${pagerId}" data-res-page-count="${pageCount}" data-res-current-page="1">
        <button type="button" class="res-pagination-btn" data-res-page-target="${pagerId}" data-res-page-dir="-1" disabled aria-label="Previous page">‹</button>
        <span class="res-pagination-status" data-res-page-status>1 / ${pageCount}</span>
        <button type="button" class="res-pagination-btn" data-res-page-target="${pagerId}" data-res-page-dir="1" aria-label="Next page">›</button>
      </div>`;
  }

  function buildPagedItems(items, renderItem, idPrefix) {
    const rows = Array.isArray(items) ? items : [];
    if (rows.length <= RESULTS_PAGE_SIZE) {
      return { itemsHtml: rows.map((item, i) => renderItem(item, i, "")).join(""), pagerHtml: "" };
    }

    const pagerId = `${idPrefix || "res"}-${++resultsPagerSeq}`;
    const itemsHtml = rows.map((item, i) => {
      const page = Math.floor(i / RESULTS_PAGE_SIZE) + 1;
      const attrs = `data-res-pager="${pagerId}" data-res-page="${page}"${page === 1 ? "" : " hidden"}`;
      return renderItem(item, i, attrs);
    }).join("");
    return { itemsHtml, pagerHtml: buildPaginationControls(pagerId, rows.length) };
  }

  function buildProductSplitListHtml(rows, showBars) {
    if (!rows || rows.length === 0) {
      return `<div style="color:var(--text2);font-size:var(--type-control)">${t("results.no_product_data")}</div>`;
    }
    const paged = buildPagedItems(rows, (p, i, attrs) => `
      <div class="product-split-row" ${attrs}>
        <div class="product-split-name" title="${p.name.replace(/"/g,"")}">${p.name}</div>
        ${showBars ? `
        <div class="product-split-bar-wrap">
          <div class="product-split-bar-ok" style="width:${p.pct}%"></div>
          <div class="product-split-bar-fail" style="width:${100-p.pct}%"></div>
        </div>` : ""}
        <div style="display:flex;gap:10px;flex-shrink:0;font-size:var(--type-label)">
          ${p.ok > 0 ? `<span style="color:var(--success);font-weight:var(--weight-bold)">✅ ${p.ok}</span>` : ""}
          ${p.fail > 0 ? `<span style="color:var(--danger);font-weight:var(--weight-bold)">❌ ${p.fail}</span>` : ""}
        </div>
      </div>`, "products");
    return `${paged.itemsHtml}${paged.pagerHtml}`;
  }

  ensureResultsPaginationStyle();
  attachResultPagination();

  function buildSkippedOrdersHtml(skippedOrders) {
    if (!skippedOrders || !skippedOrders.count) return "";
    const rows = skippedOrders.rows || [];
    const showAlertColumn = rows.some((row) => row && row.uncertain);
    const reasonLabels = {
      phone_parse_failed: t("results.reason_phone_parse_failed"),
      phone_uncertain_zero_appended: t("results.reason_phone_uncertain_zero_appended"),
      product_not_in_catalog: t("results.reason_product_not_in_catalog"),
      product_not_in_easyorders_or_taager: t("results.reason_product_not_in_easyorders_or_taager"),
      partial_order_already_in_taager: t("results.reason_partial_order_already_in_taager"),
      missing_sku_in_group: t("results.reason_missing_sku_in_group"),
      source_order_already_in_taager: t("results.reason_source_order_already_in_taager"),
      delivered_order_already_in_taager: t("results.reason_delivered_order_already_in_taager"),
      delivered_repeat_needs_identity: t("results.reason_delivered_repeat_needs_identity"),
    };
    const paged = buildPagedItems(rows, (row, i, attrs) => {
      const reasonKey = row.uncertain && row.reason === "phone_parse_failed" ? "phone_uncertain_zero_appended" : row.reason;
      const reasonText = reasonLabels[reasonKey] || reasonKey || "—";
      const outcomeText = row.uploadedWithWarning ? t("results.warning_uploaded") : t("results.warning_skipped");
      const outcomeColor = row.uploadedWithWarning ? "var(--warning)" : "var(--danger)";
      return `<tr ${attrs} style="${row.uncertain ? "background:rgba(255,170,0,0.05)" : ""}">
        <td class="skip-index">${i + 1}</td>
        <td class="skip-outcome" style="color:${outcomeColor}" title="${outcomeText}">${outcomeText}</td>
        <td class="skip-name" title="${String(row.name || "").replace(/"/g,"")}">${row.name || "—"}</td>
        <td class="skip-phone" style="color:${outcomeColor}" title="${String(row.rawPhone || "").replace(/"/g,"")}">${row.rawPhone || "—"}</td>
        <td class="skip-phone" style="color:var(--text)" title="${String(row.normalizedPhone || "").replace(/"/g,"")}">${row.normalizedPhone || "—"}</td>
        <td class="skip-product" title="${String(row.productName || "").replace(/"/g,"")}">${row.productName || "—"}</td>
        <td class="skip-reason" title="${String(reasonText).replace(/"/g,"")}">${reasonText}</td>
        ${showAlertColumn ? `<td class="skip-alert">${row.uncertain ? `<span title="${t("results.phone_rescued_verify")}" style="color:var(--warning)">⚠️</span>` : ""}</td>` : ""}
      </tr>`;
    }, "skipped");
    return `
      <div class="dash-section" style="border-color:var(--warning);margin-top:12px">
        <div class="dash-section-header" style="background:rgba(255,170,0,0.06)">
          <div class="dash-section-title" style="color:var(--warning)">
            <span>⚠️</span> ${typeof t("results.couldnt_process_title") === "function" ? t("results.couldnt_process_title")(skippedOrders.count) : t("results.couldnt_process_title")}
          </div>
          <div style="font-size:var(--type-caption);color:var(--text2)">${t("results.skipped_followup")}</div>
        </div>
        <div class="dash-section-body no-pad" style="overflow-x:auto">
          <table class="orders-preview-table skipped-orders-table">
            <colgroup>
              <col class="skip-col-index">
              <col class="skip-col-outcome">
              <col class="skip-col-name">
              <col class="skip-col-raw">
              <col class="skip-col-normalized">
              <col class="skip-col-product">
              <col class="skip-col-reason">
              ${showAlertColumn ? `<col class="skip-col-alert">` : ""}
            </colgroup>
            <thead><tr>
              <th>#</th>
              <th>${t("results.warning_status_col")}</th>
              <th>${t("results.customer_name_col")}</th>
              <th>${t("results.raw_phone_col")}</th>
              <th>${t("results.normalized_phone_col")}</th>
              <th>${t("results.product_col")}</th>
              <th>${t("results.reason_col")}</th>
              ${showAlertColumn ? `<th>⚠️</th>` : ""}
            </tr></thead>
            <tbody>${paged.itemsHtml}</tbody>
          </table>
          ${paged.pagerHtml}
        </div>
      </div>`;
  }

  function failedOrderDisplayPhone(row) {
    return row?.phone || row?.formattedPhone || row?.normalizedPhone || row?.normPhone || row?.rawPhone || "";
  }

  function failedOrderDisplayError(row) {
    return row?.error || row?.failureCode || row?.actionMessage || row?.message || row?.finalStatus || row?.recoveryStatus || "";
  }

  function buildFailedOrdersDetailHtmlLegacy(failedOrders) {
    const rows = failedOrders?.errorRows || [];
    if (rows.length > 0) {
      const paged = buildPagedItems(rows, (row, i, attrs) => `<tr ${attrs}>
        <td style="color:var(--text2)">${row.row || i + 1}</td>
        <td style="font-family:var(--font-mono);color:var(--accent)">${row.sku || "—"}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(row.product || row.productName || "").replace(/"/g,"")}">${row.product || row.productName || "—"}</td>
        <td style="font-family:var(--font-mono)">${failedOrderDisplayPhone(row) || "—"}</td>
        <td style="color:var(--danger);font-weight:var(--weight-semibold)">${failedOrderDisplayError(row) || "—"}</td>
      </tr>`, "failed-orders");
      return `<div style="overflow-x:auto">
        <table class="orders-preview-table" style="font-size:var(--type-label)">
          <thead><tr>
            ${[t("results.row_col") || t("results.row"), t("results.sku"), t("results.product_col"), t("results.phone_col") || t("results.phone"), t("results.error_col") || t("results.error")]
              .map(h => `<th>${h}</th>`).join("")}
          </tr></thead>
          <tbody>${paged.itemsHtml}</tbody>
        </table>
        ${paged.pagerHtml}
      </div>`;
    }

    const summary = failedOrders?.summary || [];
    if (summary.length > 0) {
      const paged = buildPagedItems(summary, (f, i, attrs) => `
        <div ${attrs} style="background:rgba(255,77,109,0.12);border:1px solid rgba(255,77,109,0.3);border-radius:var(--radius-xs);padding:7px 14px;font-size:var(--type-label);user-select:text;-webkit-user-select:text">
          <span style="color:var(--text2)">${t("results.product_col")}:</span>
          <span style="color:var(--text);font-weight:var(--weight-semibold);margin-left:4px">${f.productName || t("results.unknown")}</span>
          <span style="color:var(--danger);font-weight:var(--weight-bold);margin-left:10px">${f.count} ${t("results.product_count")(f.count)}</span>
        </div>`, "failed-summary");
      return `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:16px 18px">${paged.itemsHtml}</div>${paged.pagerHtml}`;
    }

    return `<div style="padding:12px 18px;font-size:var(--type-label);color:var(--text2)">${t("results.no_error_info")}</div>`;
  }

  function buildFailedOrdersDetailHtml(failedOrders) {
    const rows = failedOrders?.errorRows || [];
    if (rows.length > 0) {
      const esc = (value) => String(value == null || value === "" ? "—" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const paged = buildPagedItems(rows, (row, i, attrs) => {
        const product = row.product || row.productName || "";
        const phone = failedOrderDisplayPhone(row);
        const error = failedOrderDisplayError(row);
        return `<tr ${attrs}>
          <td class="failed-row">${esc(row.row || i + 1)}</td>
          <td class="failed-sku" title="${esc(row.sku)}">${esc(row.sku)}</td>
          <td class="failed-product" title="${esc(product)}">${esc(product)}</td>
          <td class="failed-phone" title="${esc(phone)}">${esc(phone)}</td>
          <td class="failed-error" title="${esc(error)}">${esc(error)}</td>
        </tr>`;
      }, "failed-orders");
      return `<div class="failed-orders-table-wrap">
        <table class="orders-preview-table failed-orders-table">
          <colgroup>
            <col style="width:58px">
            <col style="width:190px">
            <col style="width:320px">
            <col style="width:160px">
            <col style="width:212px">
          </colgroup>
          <thead><tr>
            ${[t("results.row_col") || t("results.row"), t("results.sku"), t("results.product_col"), t("results.phone_col") || t("results.phone"), t("results.error_col") || t("results.error")]
              .map(h => `<th>${h}</th>`).join("")}
          </tr></thead>
          <tbody>${paged.itemsHtml}</tbody>
        </table>
        <div style="padding:8px 12px;border-top:1px solid var(--border);font-size:var(--type-caption);color:var(--text2)">${t("results.failed_table_hint")}</div>
        ${paged.pagerHtml}
      </div>`;
    }

    const summary = failedOrders?.summary || [];
    if (summary.length > 0) {
      const paged = buildPagedItems(summary, (f, i, attrs) => `
        <div ${attrs} style="background:rgba(255,77,109,0.12);border:1px solid rgba(255,77,109,0.3);border-radius:var(--radius-xs);padding:7px 14px;font-size:var(--type-label);user-select:text;-webkit-user-select:text">
          <span style="color:var(--text2)">${t("results.product_col")}:</span>
          <span style="color:var(--text);font-weight:var(--weight-semibold);margin-left:4px">${f.productName || t("results.unknown")}</span>
          <span style="color:var(--danger);font-weight:var(--weight-bold);margin-left:10px">${f.count} ${t("results.product_count")(f.count)}</span>
        </div>`, "failed-summary");
      return `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:16px 18px">${paged.itemsHtml}</div>${paged.pagerHtml}`;
    }

    return `<div style="padding:12px 18px;font-size:var(--type-label);color:var(--text2)">${t("results.no_error_info")}</div>`;
  }

  function addFailedProductCounts(target, failedOrders) {
    const errorRows = failedOrders?.errorRows || [];
    if (errorRows.length > 0) {
      errorRows.forEach(row => {
        const key = row.product || row.productName || row.sku || t("results.unknown");
        target[key] = (target[key] || 0) + 1;
      });
      return target;
    }
    (failedOrders?.summary || []).forEach(f => {
      const key = f.productName || f.product || f.sku || t("results.unknown");
      target[key] = (target[key] || 0) + (f.count || 1);
    });
    return target;
  }

  function failedProductCounts(failedOrders) {
    return addFailedProductCounts({}, failedOrders);
  }

  // ── Shared helper: render the full orders table (name, phone, product, qty, city) ──
  function buildOrdersTableHtml(orderRows, label) {
    if (!orderRows || orderRows.length === 0) return "";
    const t = window._t;
    const ordersCountFn = t("results.orders_count");
    const tableUid = `orders-tbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    function orderCreatedAtText(o) {
      return o.easyCreatedAt || o.createdAt || o.date || "—";
    }

    function renderOrderRow(o, i, attrs) {
      const createdAt = orderCreatedAtText(o);
      const destination = o.destination === "second-taager-cart"
        ? (t("results.destination_second") || "Second Cart")
        : (isLegacyMissingOrder(o) ? t("results.destination_missing") : t("results.destination_cart"));
      return `<tr ${attrs || ""}>
        <td class="res-index">${i + 1}</td>
        <td class="res-name" title="${String(o.name || "").replace(/"/g,"")}">${o.name || "—"}</td>
        <td class="res-phone" title="${String(o.phone || "").replace(/"/g,"")}">${o.phone || "—"}</td>
        <td class="res-product" title="${(o.productName||"").replace(/"/g,"")}">${o.productName || "—"}</td>
        <td class="res-number" title="${String(o.qty || 1).replace(/"/g,"")}">${o.qty || 1}</td>
        <td class="res-number res-price" title="${String(o.subtotal || "").replace(/"/g,"")}">${o.subtotal || "—"}</td>
        <td class="res-destination" title="${String(destination || "").replace(/"/g,"")}">${destination || "-"}</td>
        <td class="res-date" title="${String(createdAt).replace(/"/g,"")}">${createdAt}</td>
        <td class="res-city" title="${String(o.city || "").replace(/"/g,"")}">${o.city || "—"}</td>
      </tr>`;
    }

    function renderOrderRows(rows) {
      if (!rows || rows.length === 0) {
        return `<tr><td colspan="9" style="text-align:center;padding:14px;color:var(--text2);font-size:var(--type-label)">${t("results.no_orders_found") || "No orders match your search"}</td></tr>`;
      }
      return buildPagedItems(rows, renderOrderRow, `orders-${tableUid}`).itemsHtml;
    }

    window._resOrderSearch = function(uid, query) {
      const allRows = window._resOrderRows && window._resOrderRows[uid];
      const render = window._resOrderRenderers && window._resOrderRenderers[uid];
      if (!allRows || !render) return;
      const q = (query || "").trim().toLowerCase();
      const filtered = q ? allRows.filter(o =>
        (o.name || "").toLowerCase().includes(q) ||
        (o.phone || "").toLowerCase().includes(q) ||
        (o.productName || "").toLowerCase().includes(q) ||
        (o.destination || "").toLowerCase().includes(q) ||
        (o.easyCreatedAt || o.createdAt || o.date || "").toLowerCase().includes(q)
      ) : allRows;
      const tbody = document.getElementById(`${uid}-tbody`);
      const pagerHost = document.getElementById(`${uid}-pager`);
      if (!tbody) return;
      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:14px;color:var(--text2);font-size:var(--type-label)">${t("results.no_orders_found") || "No orders match your search"}</td></tr>`;
        if (pagerHost) pagerHost.innerHTML = "";
        return;
      }
      const paged = buildPagedItems(filtered, render, `orders-${uid}`);
      tbody.innerHTML = paged.itemsHtml;
      if (pagerHost) pagerHost.innerHTML = paged.pagerHtml;
    };
    if (!window._resOrderRows) window._resOrderRows = {};
    if (!window._resOrderRenderers) window._resOrderRenderers = {};
    window._resOrderRows[tableUid] = orderRows;
    window._resOrderRenderers[tableUid] = renderOrderRow;
    const initialPagedOrders = buildPagedItems(orderRows, renderOrderRow, `orders-${tableUid}`);

    return `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-title"><span>📋</span> ${label || t("results.all_orders_label")} <span style="font-size:var(--type-caption);font-weight:var(--weight-regular);color:var(--text2);margin-left:6px">${typeof ordersCountFn === "function" ? ordersCountFn(orderRows.length) : ordersCountFn}</span></div>
          <div style="font-size:var(--type-caption);color:var(--text2)">${t("run.click_to_copy")}</div>
        </div>
        <div style="padding:8px 12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,0.04)">
          <input type="text" placeholder="${t('results.search_orders_placeholder') || 'Search by name, phone or product...'}" style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:var(--type-label);color:var(--text);outline:none" oninput="window._resOrderSearch('${tableUid}',this.value)">
        </div>
        <div class="dash-section-body no-pad results-orders-table-wrap" style="overflow-x:auto">
          <table class="orders-preview-table results-orders-table" style="width:100%;min-width:1360px;table-layout:fixed;border-collapse:collapse">
            <colgroup>
              <col style="width:46px">
              <col style="width:190px">
              <col style="width:160px">
              <col style="width:430px">
              <col style="width:70px">
              <col style="width:90px">
              <col style="width:150px">
              <col style="width:190px">
              <col style="width:180px">
            </colgroup>
            <thead><tr>
              <th>#</th>
              <th style="text-align:right">${t("results.customer_name_col")}</th>
              <th>${t("results.phone_col")}</th>
              <th style="text-align:right">${t("results.product_col")}</th>
              <th style="text-align:right">${t("results.qty_col")}</th>
              <th style="text-align:right">${t("results.price_col")}</th>
              <th>${t("results.destination_col")}</th>
              <th>${t("results.easy_created_at_col")}</th>
              <th style="text-align:right">${t("results.city_col")}</th>
            </tr></thead>
            <tbody id="${tableUid}-tbody">
              ${initialPagedOrders.itemsHtml}
            </tbody>
          </table>
          <div id="${tableUid}-pager">${initialPagedOrders.pagerHtml}</div>
        </div>
      </div>
    `;
  }

  function affiliateHtmlEsc(value) {
    return String(value == null || value === "" ? "-" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildRecoveryUncertainHtml(recovery) {
    if (!recovery || recovery.enabled !== true) return "";
    const rows = (recovery.manualReviewRows || []).slice(0, 60);
    if (!rows.length) return "";
    const labelFor = (prefix, value, fallback = "-") => {
      const raw = value || fallback;
      return translated(`${prefix}${raw}`, raw);
    };
    const messageFor = (row) => {
      if (row.reason === "no_trusted_product_reference") {
        return translated(
          "results.message_no_trusted_product_reference",
          "No trusted product history exists; not submitted automatically."
        );
      }
      return row.actionMessage || row.existingSkus || row.missingSkus || "-";
    };
    const td = (value, className = "", extra = "") => {
      const text = affiliateHtmlEsc(value);
      const cls = className ? ` class="${className}"` : "";
      return `<td${cls} title="${text}"${extra}>${text}</td>`;
    };
    const countText = translated("results.uncertain_orders_need_review", "{count} need review").replace("{count}", rows.length);
    const rowHtml = (row) => {
      const reasonText = labelFor("results.reason_", row.reason || row.recoveryStatus);
      const messageText = messageFor(row);
      return `
      <tr>
        ${td(row.source || row.recoverySource)}
        ${td(row.name)}
        ${td(row.rawPhone)}
        ${td(row.phone || row.normalizedPhone)}
        ${td(row.sku || row.productName)}
        ${td(reasonText, "", ` style="color:var(--warning);font-weight:var(--weight-semibold)"`)}
        ${td(messageText)}
      </tr>`;
    };
    return `
      <div class="dash-section" style="border-color:var(--warning)">
        <div class="dash-section-header">
          <div class="dash-section-title"><span>⚠️</span> ${translated("results.uncertain_orders_title", "Uncertain Orders")}</div>
          <div style="font-size:var(--type-caption);color:var(--text2)">${countText}</div>
        </div>
        <div class="dash-section-body no-pad" style="overflow-x:auto">
          <table class="orders-preview-table" style="font-size:var(--type-label);width:100%;min-width:980px">
            <thead><tr>
              <th>${translated("results.source_col", "Source")}</th>
              <th>${t("results.customer_name_col")}</th>
              <th>${t("results.raw_phone_col")}</th>
              <th>${t("results.phone_col") || t("results.phone")}</th>
              <th>${translated("results.sku_product_col", "SKU/Product")}</th>
              <th>${t("results.reason_col")}</th>
              <th>${translated("results.message_col", "Message")}</th>
            </tr></thead>
            <tbody>${rows.map(rowHtml).join("")}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ─────────────────────────────────────
  // MULTI-ACCOUNT — sidebar + rich dashboard per account
  // ─────────────────────────────────────
  if (data && data._multiAccount && Array.isArray(data._accountResults)) {
    const accountResults = data._accountResults;
    let selectedPane = "__all__";

    // ── Helper: build per-product split rows from one account result ──
    function buildProductSplit(products, failedOrders) {
      products = Array.isArray(products) ? products : [];
      const failedByProduct = failedProductCounts(failedOrders);
      const allNames = new Set([...products.map(p => p.productName || "—"), ...Object.keys(failedByProduct)]);
      return [...allNames].map(name => {
        const ok   = products.find(p => p.productName === name)?.count || 0;
        const fail = failedByProduct[name] || 0;
        const total = ok + fail;
        return { name, ok, fail, total, pct: total > 0 ? Math.round(ok / total * 100) : 100 };
      }).sort((a, b) => b.total - a.total);
    }

    // ── Helper: build error rows HTML ──
    function buildErrorRowsHtml(failedOrders) {
      return buildFailedOrdersDetailHtml(failedOrders);
    }

    // ── ALL ACCOUNTS overview pane ──
    function buildOverviewPane() {
      const totalOrders = accountResults.reduce((s, r) => s + (r.data?.orders || 0), 0);
      const totalFailed = accountResults.reduce((s, r) => s + (r.data?.failedOrders?.count || 0), 0);
      const totalInTaager = accountResults.reduce((s, r) => s + getTaagerOrderCount(r.data?.stats || {}), 0);
      const totalDupes  = accountResults.reduce((s, r) => s + ((r.data?.stats?.realDupe||0)+(r.data?.stats?.missedDupe||0)), 0);
      const totalAttempt = totalOrders + totalFailed;
      const successRate  = totalAttempt > 0 ? Math.round(totalOrders / totalAttempt * 100) : 100;
      const allOk = accountResults.every(r => r.success);

      // Aggregate products across all accounts
      const aggProducts = {};
      const aggFailed   = {};
      for (const r of accountResults) {
        (r.data?.productSummary || []).forEach(p => {
          aggProducts[p.productName||t("results.unknown")] = (aggProducts[p.productName||t("results.unknown")] || 0) + (p.count || 0);
        });
        addFailedProductCounts(aggFailed, r.data?.failedOrders);
      }
      const allProdNames = new Set([...Object.keys(aggProducts), ...Object.keys(aggFailed)]);
      const aggSplitRows = [...allProdNames].map(name => {
        const ok   = aggProducts[name] || 0;
        const fail = aggFailed[name]   || 0;
        return { name, ok, fail, total: ok+fail, pct: (ok+fail)>0 ? Math.round(ok/(ok+fail)*100) : 100 };
      }).sort((a,b) => b.total - a.total);

      return `
        <!-- Big stat cards -->
        <div class="dash-stat-row">
          <div class="dash-stat-card success">
            <div class="ds-icon">✅</div>
            <div class="ds-value">${totalOrders}</div>
            <div class="ds-label">${t("results.new_orders")}</div>
            <div class="ds-sub">${t("results.across_accounts")}</div>
          </div>
          <div class="dash-stat-card ${totalFailed > 0 ? "danger" : ""}">
            <div class="ds-icon">${totalFailed > 0 ? "❌" : "🎯"}</div>
            <div class="ds-value" style="${totalFailed > 0 ? "color:var(--danger)" : ""}">${totalFailed}</div>
            <div class="ds-label" style="${totalFailed > 0 ? "color:var(--danger)" : ""}">${t("results.failed")}</div>
            <div class="ds-sub">${totalFailed > 0 ? t("results.failed_uploads_total") : t("results.all_uploaded_ok")}</div>
          </div>
          <div class="dash-stat-card warning">
            <div class="ds-icon">🔁</div>
            <div class="ds-value">${totalInTaager}</div>
            <div class="ds-label">${t("results.in_taager")}</div>
            <div class="ds-sub">${t("results.already_in_system")}</div>
          </div>
          <div class="dash-stat-card accent">
            <div class="ds-icon">📦</div>
            <div class="ds-value">${totalDupes}</div>
            <div class="ds-label">${t("results.dupes")}</div>
            <div class="ds-sub">${t("results.duplicate_phone")}</div>
          </div>
        </div>

        <!-- Overall success rate -->
        ${totalAttempt > 0 ? `
        <div class="dash-section">
          <div class="dash-section-header">
            <div class="dash-section-title"><span style="color:var(--success)">📊</span> ${t("results.overall_success_rate")}</div>
            <div style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:${successRate===100?"var(--success)":successRate>=70?"var(--warning)":"var(--danger)"}">${successRate}%</div>
          </div>
          <div class="dash-section-body">
            <div style="height:12px;background:var(--border);border-radius:var(--radius-xs);overflow:hidden">
              <div style="height:100%;width:${successRate}%;background:${successRate===100?"var(--success)":successRate>=70?"var(--warning)":"var(--danger)"};border-radius:var(--radius-xs);transition:width 0.8s ease"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:var(--type-label);color:var(--text2)">
              <span>${(()=>{const fn=t("results.succeeded");return typeof fn==="function"?fn(totalOrders):fn;})()}</span>
              <span>${(()=>{const fn=t("results.total_attempted");return typeof fn==="function"?fn(totalAttempt):fn;})()}</span>
              ${totalFailed > 0 ? `<span style="color:var(--danger)">❌ ${totalFailed} ${t("results.failed")}</span>` : ""}
            </div>
          </div>
        </div>` : ""}

        <!-- Per-account summary table + product split -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">

          <!-- Per-account table -->
          <div class="dash-section">
            <div class="dash-section-header">
              <div class="dash-section-title"><span>👥</span> ${t("results.per_account_summary")}</div>
              <div style="font-size:var(--type-caption);color:var(--text2)">${(()=>{const fn=t("results.accounts_click");return typeof fn==="function"?fn(accountResults.length):fn;})()}</div>
            </div>
            <div class="dash-section-body no-pad">
              <table class="orders-preview-table">
                <thead><tr>
                  <th>${t("results.account_col")}</th>
                  <th style="text-align:right">${t("results.orders_col")}</th>
                  <th style="text-align:right">${t("results.failed")}</th>
                  <th style="text-align:right">${t("results.status_col")}</th>
                </tr></thead>
                <tbody>
                  ${accountResults.map(r => {
                    const orders = r.data?.orders || 0;
                    const failed = r.data?.failedOrders?.count || 0;
                    return `<tr style="cursor:pointer" onclick="window._resSelectPane('${r.accountId}')">
                      <td style="font-weight:var(--weight-semibold)">${r.success?"✅":"❌"} ${r.accountLabel||r.accountId}</td>
                      <td style="text-align:right;color:var(--success);font-weight:var(--weight-bold)">${orders}</td>
                      <td style="text-align:right;color:${failed>0?"var(--danger)":"var(--text2)"};font-weight:${failed>0?"700":"400"}">${failed}</td>
                      <td style="text-align:right"><span style="background:${r.success?"rgba(0,214,143,0.12)":"rgba(255,77,109,0.12)"};color:${r.success?"var(--success)":"var(--danger)"};border-radius:var(--radius-pill);padding:3px 10px;font-size:var(--type-caption);font-weight:var(--weight-semibold);white-space:nowrap">${r.success?t("results.ok_status"):t("results.error_status")}</span></td>
                    </tr>`;
                  }).join("")}
                </tbody>
                <tfoot><tr>
                  <td style="font-weight:var(--weight-bold);padding:10px;border-top:1px solid var(--border)">${t("results.total")}</td>
                  <td style="text-align:right;font-weight:var(--weight-bold);padding:10px;border-top:1px solid var(--border);color:var(--success)">${totalOrders}</td>
                  <td style="text-align:right;font-weight:var(--weight-bold);padding:10px;border-top:1px solid var(--border);color:${totalFailed>0?"var(--danger)":"var(--text2)"}">${totalFailed}</td>
                  <td style="border-top:1px solid var(--border)"></td>
                </tr></tfoot>
              </table>
            </div>
          </div>

          <!-- Aggregated products split -->
          <div class="dash-section">
            <div class="dash-section-header">
              <div class="dash-section-title"><span>📦</span> ${t("results.all_products_combined")}</div>
              <div style="font-size:var(--type-caption);color:var(--text2)">${(()=>{const fn=t("results.products_click");return typeof fn==="function"?fn(aggSplitRows.length):fn;})()}</div>
            </div>
            <div class="dash-section-body selectable" style="overflow-y:visible">
              ${buildProductSplitListHtml(aggSplitRows, totalFailed > 0)}
            </div>
          </div>
        </div>

        <!-- Overall notice -->
        <div class="notice-box ${allOk ? "info" : "warn"}">
          <span class="notice-icon">${allOk ? "✅" : "⚠️"}</span>
          <div class="notice-text">${allOk
            ? `<strong>${t("results.multi_all_ok")}</strong>`
            : `<strong>${t("results.multi_some_errors")}</strong> — ${t("results.select_acc_sidebar")}`}
          </div>
        </div>

        <!-- CONFIRMED ORDERS - aggregated across all accounts -->
        ${buildOrdersTableHtml(
          accountResults.flatMap(r => (r.data?.confirmedOrderRows || r.data?.orderRows || []).map(o => ({ ...o, _acc: r.accountLabel || r.accountId }))),
          translated("results.confirmed_orders_table", "New Orders Confirmed in Taager")
        )}

        <!-- ALL ORDERS - aggregated across all accounts -->
        ${buildOrdersTableHtml(
          accountResults.flatMap(r => (r.data?.attemptedOrderRows || r.data?.orderRows || []).map(o => ({ ...o, _acc: r.accountLabel || r.accountId }))),
          t("results.all_attempted_all") || t("results.all_uploaded_all")
        )}`;
    }

    // ── SINGLE ACCOUNT PANE — full rich dashboard ──
    function buildAccountPane(r) {
      const accData      = r.data || {};
      const stats        = accData.stats || {};
      const totalNew     = accData.orders || 0;
      const products     = accData.productSummary || [];
      const buffer       = accData.buffer;
      const failedOrders = accData.failedOrders || { count:0, summary:[], failedDir:"", failedPath:"", errorRows:[] };
      const skippedOrders = accData.skippedOrders || { count:0, rows:[], buffer:null, filePath:"" };
      const runFailed    = !r.success;
      const failReason   = r.error || "";
      const hasFailed    = failedOrders.count > 0;
      const hasSkipped   = skippedOrders.count > 0;
      const totalInTaager  = getTaagerOrderCount(stats);
      const totalDupes   = (stats.realDupe||0) + (stats.missedDupe||0);
      const totalAttempt = totalNew + failedOrders.count;
      const successRate  = totalAttempt > 0 ? Math.round(totalNew / totalAttempt * 100) : 100;
      const attemptedRows = accData.attemptedOrderRows || accData.orderRows || [];
      const successfulRows = accData.orderRows || [];
      const legacyMissingSubmittedCount = countLegacyMissingOrders(successfulRows);
      const confirmedUploadedCount = Math.max(0, totalNew - legacyMissingSubmittedCount);
      const successSubtext = legacyMissingSubmittedCount > 0
        ? callTranslation(
          "results.confirmed_plus_missing",
          (confirmed, missing) => `${confirmed} cart confirmed + ${missing} Missing Orders submitted`,
          confirmedUploadedCount,
          legacyMissingSubmittedCount
        )
        : translated("results.confirmed_in_taager_cart", "Confirmed in Taager cart");
      const successRateTitle = legacyMissingSubmittedCount > 0
        ? translated("results.submission_success_rate", "Submission Success Rate")
        : t("results.upload_success_rate");
      const successCountText = legacyMissingSubmittedCount > 0
        ? successSubtext
        : callTranslation("results.succeeded", (n) => `OK ${n} succeeded`, totalNew);
      const uploadedOrdersTitle = legacyMissingSubmittedCount > 0
        ? translated("results.uploaded_or_submitted_orders_title", "Uploaded / Submitted Orders")
        : t("results.uploaded_orders_title");
      const primaryDestinationCount = attemptedRows.filter(o => orderDestination(o) !== "second-taager-cart" && !isLegacyMissingOrder(o)).length;
      const secondDestinationCount = attemptedRows.filter(o => orderDestination(o) === "second-taager-cart").length;
      const legacyMissingDestinationCount = countLegacyMissingOrders(attemptedRows);
      const pagedUploadedProducts = buildPagedItems(products, (p, i, attrs) => `<tr ${attrs}>
        <td style="font-weight:var(--weight-semibold)">${p.productName||"—"}</td>
        <td style="text-align:right"><span class="badge badge-success">${p.count}</span></td>
        <td style="text-align:right;font-weight:var(--weight-bold);color:var(--accent)">${p.totalQty}</td>
      </tr>`, "uploaded-products");

      const failTitleFn = t("results.fail_title");
      const failTitle   = typeof failTitleFn === "function" ? failTitleFn(failedOrders.count) : failTitleFn;

      const productSplitRows = buildProductSplit(products, failedOrders);
      const errorRowsHtml    = buildErrorRowsHtml(failedOrders);

      return `
        ${runFailed ? `
        <div class="notice-box warn" style="border-color:var(--danger);background:rgba(255,77,109,0.1)">
          <span class="notice-icon">❌</span>
          <div class="notice-text">
            <strong>${t("results.run_failed")}</strong>
            <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${formatFailReason(failReason)}</div>
          </div>
        </div>` : ""}

        <!-- Download buttons -->
        ${(buffer || (hasFailed && failedOrders.buffer) || (hasSkipped && skippedOrders.buffer)) ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${buffer ? `<button class="btn btn-primary" id="acc-btn-download-${r.accountId}">⬇️ ${t("results.download")}</button>` : ""}
          ${hasFailed && failedOrders.buffer ? `<button class="btn btn-danger" id="acc-btn-dl-failed-${r.accountId}" style="background:rgba(255,77,109,0.15);border-color:var(--danger);color:var(--danger)">⬇️ ${t("results.download_failed")}</button>` : ""}
          ${hasSkipped && skippedOrders.buffer ? `<button class="btn" id="acc-btn-dl-skipped-${r.accountId}" style="background:rgba(255,170,0,0.12);border-color:var(--warning);color:var(--warning)">⬇️ ${t("results.couldnt_process_btn")}</button>` : ""}
        </div>` : ""}

        <!-- Stat cards -->
        <div class="dash-stat-row">
          <div class="dash-stat-card success">
            <div class="ds-icon">✅</div>
            <div class="ds-value">${totalNew}</div>
            <div class="ds-label">${legacyMissingSubmittedCount > 0 ? translated("results.new_or_submitted_orders", "New / Submitted Orders") : t("results.new_orders")}</div>
            <div class="ds-sub">${successSubtext}</div>
          </div>
          <div class="dash-stat-card ${hasFailed ? "danger" : ""}">
            <div class="ds-icon">${hasFailed ? "❌" : "🎯"}</div>
            <div class="ds-value" style="${hasFailed ? "color:var(--danger)" : ""}">${failedOrders.count}</div>
            <div class="ds-label" style="${hasFailed ? "color:var(--danger)" : ""}">${t("results.failed")}</div>
            <div class="ds-sub">${hasFailed ? t("results.failed_uploads") : t("results.all_ok_short")}</div>
          </div>
          <div class="dash-stat-card warning">
            <div class="ds-icon">🔁</div>
            <div class="ds-value">${totalInTaager}</div>
            <div class="ds-label">${t("results.in_taager")}</div>
            <div class="ds-sub">${t("results.already_in_system")}</div>
          </div>
          <div class="dash-stat-card accent">
            <div class="ds-icon">📦</div>
            <div class="ds-value">${totalDupes}</div>
            <div class="ds-label">${t("results.dupes")}</div>
            <div class="ds-sub">${t("results.duplicate_phone")}</div>
          </div>
        </div>

        ${legacyMissingSubmittedCount > 0 ? `
        <div class="notice-box info">
          <span class="notice-icon">i</span>
          <div class="notice-text">
            <strong>${translated("results.missing_orders_pending_title", "Missing Orders are submitted, not confirmed cart orders")}</strong>
            <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${translated("results.missing_orders_pending_body", "Taager accepted the Missing Orders workbook, but those rows may not appear immediately in the normal Taager orders list. Check the Missing Orders tab, or route missed orders to Cart/Second Cart when you need confirmed normal orders.")}</div>
          </div>
        </div>` : ""}

        <!-- Success rate bar -->
        ${totalAttempt > 0 ? `
        <div class="dash-section">
          <div class="dash-section-header">
            <div class="dash-section-title"><span style="color:var(--success)">📊</span> ${successRateTitle}</div>
            <div style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:${successRate===100?"var(--success)":successRate>=70?"var(--warning)":"var(--danger)"}">${successRate}%</div>
          </div>
          <div class="dash-section-body">
            <div style="height:12px;background:var(--border);border-radius:var(--radius-xs);overflow:hidden">
              <div style="height:100%;width:${successRate}%;background:${successRate===100?"var(--success)":successRate>=70?"var(--warning)":"var(--danger)"};border-radius:var(--radius-xs);transition:width 0.8s ease"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:var(--type-label);color:var(--text2)">
              <span>${successCountText}</span>
              <span>${(()=>{const fn=t("results.total_attempted");return typeof fn==="function"?fn(totalAttempt):fn;})()}</span>
              ${hasFailed ? `<span style="color:var(--danger)">❌ ${failedOrders.count} ${t("results.failed")}</span>` : ""}
            </div>
          </div>
        </div>` : ""}

        <!-- Two-column: products + sources/orders -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">

          <!-- Products split -->
          <div class="dash-section">
            <div class="dash-section-header">
              <div class="dash-section-title"><span>📦</span> ${t("results.orders_by_product")}</div>
              <div style="font-size:var(--type-caption);color:var(--text2)">${(()=>{const fn=t("results.products_click");return typeof fn==="function"?fn(productSplitRows.length):fn;})()}</div>
            </div>
            <div class="dash-section-body selectable">
              ${buildProductSplitListHtml(productSplitRows, hasFailed)}
            </div>
          </div>

          <!-- Sources + uploaded orders table -->
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="dash-section">
              <div class="dash-section-header">
                <div class="dash-section-title"><span>🔄</span> ${t("results.order_sources")}</div>
              </div>
              <div class="dash-section-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                  <div style="background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
                    <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t("results.from_real")}</div>
                    <div style="font-size:var(--type-page-title);font-weight:var(--weight-bold);color:var(--text)">${stats.realNew||0}</div>
                    <div style="font-size:var(--type-caption);color:var(--text2);margin-top:2px">${t("results.new_unique")}</div>
                  </div>
                  <div style="background:rgba(124,106,247,0.08);border:1px solid rgba(124,106,247,0.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
                    <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#a89cf7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t("results.from_missed")}</div>
                    <div style="font-size:var(--type-page-title);font-weight:var(--weight-bold);color:var(--text)">${stats.missedNew||0}</div>
                    <div style="font-size:var(--type-caption);color:var(--text2);margin-top:2px">${t("results.new_unique")}</div>
                  </div>
                </div>
                ${(secondDestinationCount || legacyMissingDestinationCount) ? `
                <div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
                  <div style="background:rgba(20,184,166,0.08);border:1px solid rgba(20,184,166,0.22);border-radius:var(--radius-sm);padding:12px;text-align:center">
                    <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#2dd4bf;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${t("results.destination_cart")}</div>
                    <div style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:var(--text)">${primaryDestinationCount}</div>
                  </div>
                  <div style="background:rgba(124,106,247,0.08);border:1px solid rgba(124,106,247,0.24);border-radius:var(--radius-sm);padding:12px;text-align:center">
                    <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#a89cf7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${secondDestinationCount ? (t("results.destination_second") || "Second Cart") : t("results.destination_missing")}</div>
                    <div style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:var(--text)">${secondDestinationCount || legacyMissingDestinationCount}</div>
                  </div>
                </div>` : ""}
              </div>
            </div>

            ${totalNew === 0 ? `
            <div class="dash-section">
              <div class="dash-section-body" style="text-align:center;padding:28px">
                <div style="font-size:var(--type-display);margin-bottom:8px">🎉</div>
                <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);margin-bottom:4px">${t("results.all_caught")}</div>
                <div class="text-muted text-sm">${t("results.no_orders")}</div>
              </div>
            </div>` : `
            <div class="dash-section">
              <div class="dash-section-header">
                <div class="dash-section-title"><span style="color:var(--success)">✅</span> ${uploadedOrdersTitle}</div>
                <div style="font-size:var(--type-caption);color:var(--text2)">${t("run.click_to_copy")}</div>
              </div>
              <div class="dash-section-body no-pad" style="overflow-x:auto">
                <table class="orders-preview-table" style="font-size:var(--type-label)">
                  <thead><tr>
                    <th>${t("results.product_col")}</th>
                    <th style="text-align:right">${t("results.orders_col")}</th>
                    <th style="text-align:right">${t("results.qty_col")}</th>
                  </tr></thead>
                  <tbody>${pagedUploadedProducts.itemsHtml}</tbody>
                  <tfoot><tr>
                    <td style="font-weight:var(--weight-bold);border-top:1px solid var(--border);padding:8px 10px">${t("results.total")}</td>
                    <td style="text-align:right;font-weight:var(--weight-bold);border-top:1px solid var(--border);padding:8px 10px;color:var(--success)">${totalNew}</td>
                    <td style="text-align:right;font-weight:var(--weight-bold);border-top:1px solid var(--border);padding:8px 10px;color:var(--accent)">${products.reduce((s,p)=>s+p.totalQty,0)}</td>
                  </tfoot>
                </table>
                ${pagedUploadedProducts.pagerHtml}
              </div>
            </div>`}
          </div>
        </div>

        <!-- Failed orders section -->
        ${hasFailed ? `
        <div class="dash-section" style="border-color:var(--danger)">
          <div class="dash-section-header" style="background:rgba(255,77,109,0.06)">
            <div class="dash-section-title" style="color:var(--danger)"><span>❌</span> ${failTitle}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <div style="font-size:var(--type-caption);color:var(--text2)">${t("results.fail_saved")}</div>
              ${failedOrders.failedDir ? `<button id="acc-btn-open-failed-${r.accountId}" class="btn btn-danger" style="font-size:var(--type-caption);padding:5px 12px">${t("results.open_folder")}</button>` : ""}
            </div>
          </div>
          <div class="dash-section-body no-pad">${errorRowsHtml}</div>
        </div>` : `
        <div class="notice-box info">
          <span class="notice-icon">✅</span>
          <div class="notice-text">${t("results.all_ok")}</div>
        </div>`}

        ${buildRecoveryUncertainHtml(accData.affiliateRecovery)}

        ${buildSkippedOrdersHtml(skippedOrders)}

        <!-- CONFIRMED ORDERS TABLE -->
        ${buildOrdersTableHtml(accData.confirmedOrderRows || successfulRows, translated("results.confirmed_orders_table", "New Orders Confirmed in Taager"))}

        <!-- ALL ORDERS TABLE -->
        ${buildOrdersTableHtml(accData.attemptedOrderRows || accData.orderRows, t("results.all_attempted") || t("results.all_uploaded"))}
      `;
    }

    // ── Render pane into content area ──
    function renderPane() {
      const wrap = document.getElementById("res-content-pane");
      if (!wrap) return;
      if (selectedPane === "__all__") {
        wrap.innerHTML = buildOverviewPane();
      } else {
        const r = accountResults.find(x => x.accountId === selectedPane);
        if (!r) return;
        wrap.innerHTML = buildAccountPane(r);
        // Wire download buttons
        document.getElementById(`acc-btn-download-${r.accountId}`)?.addEventListener("click", async () => {
          const dateTag  = dateFrom.replace(/-/g,"");
          const filename = `taager-orders-${resultAccountTag(r.accountLabel||r.accountId)}-${dateTag}.xlsx`;
          const result   = await window.api.saveOutputFile({ buffer: r.data?.buffer, filename });
          if (result.saved) { const fn = t("results.toast_saved"); showToast(typeof fn === "function" ? fn(result.path) : fn); }
        });
        document.getElementById(`acc-btn-dl-failed-${r.accountId}`)?.addEventListener("click", async () => {
          const dateTag  = dateFrom.replace(/-/g,"");
          const filename = `failed-orders-${resultAccountTag(r.accountLabel||r.accountId)}-${dateTag}-${_runTimeTag}.xlsx`;
          const result   = await window.api.saveOutputFile({ buffer: r.data?.failedOrders?.buffer, filename });
          if (result.saved) { const fn = t("results.toast_saved"); showToast(typeof fn === "function" ? fn(result.path) : fn); }
        });
        document.getElementById(`acc-btn-open-failed-${r.accountId}`)?.addEventListener("click", () => {
          if (r.data?.failedOrders?.failedDir) window.api.openFolder(r.data.failedOrders.failedDir);
        });
        document.getElementById(`acc-btn-dl-skipped-${r.accountId}`)?.addEventListener("click", async () => {
          const dateTag  = dateFrom.replace(/-/g,"");
          const filename = `skipped-orders-${resultAccountTag(r.accountLabel||r.accountId)}-${dateTag}-${_runTimeTag}.xlsx`;
          const result   = await window.api.saveOutputFile({ buffer: r.data?.skippedOrders?.buffer, filename });
          if (result.saved) { const fn = t("results.toast_saved"); showToast(typeof fn === "function" ? fn(result.path) : fn); }
        });
      }
    }

    // ── Update sidebar active state ──
    function refreshSidebar() {
      document.querySelectorAll(".res-sidebar-item").forEach(el => {
        el.classList.toggle("res-sidebar-active", el.dataset.pane === selectedPane);
      });
    }

    // Global helper so overview table rows can click-through to account pane
    window._resSelectPane = function(accId) {
      selectedPane = accId;
      refreshSidebar();
      renderPane();
    };

    const allOk = accountResults.every(r => r.success);

    el.classList.add('multi-account');
    el.innerHTML = `
      <div class="sv3-shell" style="height:100%">
        ${renderSharedSidebar('run')}
        <div style="flex:1;overflow-y:auto;overflow-x:hidden;min-width:0">
        <div class="page-wrap"><div class="page-inner" style="display:flex;flex-direction:column;gap:14px">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <div class="page-title" style="font-size:var(--type-metric-sm)">${allOk ? "✅" : "⚠️"} Results — ${dateDisplay}</div>
            <div class="text-muted text-sm">${t("results.completed")} · ${(()=>{const fn=t("results.accounts_count_label");return typeof fn==="function"?fn(accountResults.length):fn;})()}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost" id="btn-home">${t("results.home")}</button>
            <button class="btn btn-ghost" id="btn-run-again">${t("results.run_again")}</button>
          </div>
        </div>

        <!-- Sidebar + content layout -->
        <div style="display:grid;grid-template-columns:200px 1fr;gap:14px;min-height:0">

          <!-- Sidebar -->
          <div style="display:flex;flex-direction:column;gap:6px;align-self:start;position:sticky;top:0">

            <!-- All accounts item -->
            <div class="res-sidebar-item res-sidebar-active" data-pane="__all__" onclick="window._resSelectPane('__all__')">
              <div style="font-size:var(--type-control);font-weight:var(--weight-semibold)">${t("results.all_accounts_sidebar")}</div>
              <div style="font-size:var(--type-caption);color:var(--text2);margin-top:2px">${(()=>{const fn=t("results.n_accounts_ok");return typeof fn==="function"?fn(accountResults.length, accountResults.filter(r=>r.success).length):fn;})()}</div>
            </div>

            <div style="font-size:var(--type-micro);font-weight:var(--weight-semibold);color:var(--text2);text-transform:uppercase;letter-spacing:.08em;padding:6px 4px 2px">${t("results.accounts_label")}</div>

            ${accountResults.map(r => {
              const orders = r.data?.orders || 0;
              const failed = r.data?.failedOrders?.count || 0;
              const borderColor = r.success ? "var(--success)" : "var(--danger)";
              return `
              <div class="res-sidebar-item" data-pane="${r.accountId}" onclick="window._resSelectPane('${r.accountId}')"
                   style="border-left:3px solid ${borderColor}">
                <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${r.accountLabel||r.accountId}">${r.success?"✅":"❌"} ${r.accountLabel||r.accountId}</div>
                <div style="font-size:var(--type-micro);color:var(--text2);margin-top:2px;display:flex;gap:8px">
                  <span style="color:var(--success)">↑${orders}</span>
                  ${failed > 0 ? `<span style="color:var(--danger)">✗${failed}</span>` : ""}
                </div>
              </div>`;
            }).join("")}
          </div>

          <!-- Content pane -->
          <div id="res-content-pane" style="display:flex;flex-direction:column;gap:14px"></div>
        </div>

      </div></div>
        </div>
      </div>
    `;

    wireSharedSidebar(el);
    // Inject sidebar CSS
    const style = document.createElement("style");
    style.textContent = `
      .res-sidebar-item {
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 10px 12px;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        user-select: none;
      }
      .res-sidebar-item:hover { border-color: var(--accent); background: rgba(79,142,247,0.05); }
      .res-sidebar-active { border-color: var(--accent) !important; background: rgba(79,142,247,0.1) !important; }
    `;
    document.head.appendChild(style);

    // Wire buttons
    document.getElementById("btn-home")?.addEventListener("click", onHome);
    document.getElementById("btn-run-again")?.addEventListener("click", onRunAgain);

    // Initial render
    renderPane();

    return; // multi-account path ends here
  }


  // ─────────────────────────────────────
  // SINGLE ACCOUNT — rich dashboard layout
  // ─────────────────────────────────────
  const stats        = data.stats        || {};
  const totalNew     = data.orders       || 0;
  const products     = data.productSummary || [];
  const buffer       = data.buffer;
  const failedOrders = data.failedOrders || { count: 0, summary: [], failedDir: "", failedPath: "", errorRows: [] };
  const skippedOrders = data.skippedOrders || { count: 0, rows: [], buffer: null, filePath: "" };
  const runFailed    = data._runFailed   || false;
  const failReason   = data._failReason  || "";

  const totalInTaager    = getTaagerOrderCount(stats);
  const totalDupes     = (stats.realDupe     || 0) + (stats.missedDupe     || 0);
  const hasFailed      = failedOrders.count > 0;
  const hasSkipped     = skippedOrders.count > 0;
  const totalUploaded  = totalNew + failedOrders.count;
  const successRate    = totalUploaded > 0 ? Math.round(totalNew / totalUploaded * 100) : 100;
  const attemptedRows = data.attemptedOrderRows || data.orderRows || [];
  const successfulRows = data.orderRows || [];
  const legacyMissingSubmittedCount = countLegacyMissingOrders(successfulRows);
  const confirmedUploadedCount = Math.max(0, totalNew - legacyMissingSubmittedCount);
  const successSubtext = legacyMissingSubmittedCount > 0
    ? callTranslation(
      "results.confirmed_plus_missing",
      (confirmed, missing) => `${confirmed} cart confirmed + ${missing} Missing Orders submitted`,
      confirmedUploadedCount,
      legacyMissingSubmittedCount
    )
    : translated("results.confirmed_in_taager_cart", "Confirmed in Taager cart");
  const successRateTitle = legacyMissingSubmittedCount > 0
    ? translated("results.submission_success_rate", "Submission Success Rate")
    : t("results.upload_success_rate");
  const successCountText = legacyMissingSubmittedCount > 0
    ? successSubtext
    : callTranslation("results.succeeded", (n) => `OK ${n} succeeded`, totalNew);
  const uploadedOrdersTitle = legacyMissingSubmittedCount > 0
    ? translated("results.uploaded_or_submitted_orders_title", "Uploaded / Submitted Orders")
    : t("results.uploaded_orders_title");
  const primaryDestinationCount = attemptedRows.filter(o => orderDestination(o) !== "second-taager-cart" && !isLegacyMissingOrder(o)).length;
  const secondDestinationCount = attemptedRows.filter(o => orderDestination(o) === "second-taager-cart").length;
  const legacyMissingDestinationCount = countLegacyMissingOrders(attemptedRows);

  const titleFn = t("results.title");
  const title   = typeof titleFn === "function" ? titleFn(dateDisplay) : titleFn;
  const failTitleFn = t("results.fail_title");
  const failTitle   = typeof failTitleFn === "function" ? failTitleFn(failedOrders.count) : failTitleFn;

  // Build per-product success/fail split
  const failedByProduct = failedProductCounts(failedOrders);

  const allProductNames = new Set([
    ...products.map(p => p.productName || "—"),
    ...Object.keys(failedByProduct),
  ]);

  const productSplitRows = [...allProductNames].map(name => {
    const ok   = (products.find(p => p.productName === name)?.count) || 0;
    const fail = failedByProduct[name] || 0;
    const total = ok + fail;
    const pct  = total > 0 ? Math.round(ok / total * 100) : 100;
    return { name, ok, fail, total, pct };
  }).sort((a, b) => b.total - a.total);

  const pagedUploadedProducts = buildPagedItems(products, (p, i, attrs) => `<tr ${attrs}>
    <td style="font-weight:var(--weight-semibold)">${p.productName || "—"}</td>
    <td style="text-align:right"><span class="badge badge-success">${p.count}</span></td>
    <td style="text-align:right;font-weight:var(--weight-bold);color:var(--accent)">${p.totalQty}</td>
  </tr>`, "uploaded-products");

  const errorRowsHtml = buildFailedOrdersDetailHtml(failedOrders);

  el.classList.remove('multi-account');
  el.innerHTML = `
    <div class="sv3-shell" style="height:100%">
      ${renderSharedSidebar('run')}
      <div style="flex:1;overflow-y:auto;overflow-x:hidden;min-width:0">
      <div class="page-wrap"><div class="page-inner" style="display:flex;flex-direction:column;gap:16px">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <div class="page-title" style="font-size:var(--type-metric-sm)">${runFailed ? "❌" : hasFailed ? "⚠️" : "✅"} ${title}</div>
          <div class="text-muted text-sm">${t("results.completed")} · 📅 ${dateDisplay}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="btn-home">${t("results.home")}</button>
          <button class="btn btn-ghost" id="btn-run-again">${t("results.run_again")}</button>
          ${hasFailed && failedOrders.buffer ? `<button class="btn btn-danger" id="btn-download-failed" style="background:rgba(255,77,109,0.15);border-color:var(--danger);color:var(--danger)">⬇️ ${t("results.download_failed")}</button>` : ""}
          ${hasSkipped && skippedOrders.buffer ? `<button class="btn" id="btn-download-skipped" style="background:rgba(255,170,0,0.12);border-color:var(--warning);color:var(--warning)">⬇️ ${t("results.couldnt_process_btn")}</button>` : ""}
          ${buffer ? `<button class="btn btn-primary" id="btn-download">⬇️ ${t("results.download")}</button>` : ""}
        </div>
      </div>

      ${runFailed ? `
      <div class="notice-box warn" style="border-color:var(--danger);background:rgba(255,77,109,0.1)">
        <span class="notice-icon">❌</span>
        <div class="notice-text">
          <strong>${t("results.run_failed")}</strong>
          <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${formatFailReason(failReason)}</div>
        </div>
      </div>` : ""}

      <!-- BIG STAT CARDS -->
      <div class="dash-stat-row">
        <div class="dash-stat-card success">
          <div class="ds-icon">✅</div>
          <div class="ds-value">${totalNew}</div>
          <div class="ds-label">${legacyMissingSubmittedCount > 0 ? translated("results.new_or_submitted_orders", "New / Submitted Orders") : t("results.new_orders")}</div>
          <div class="ds-sub">${successSubtext}</div>
        </div>
        <div class="dash-stat-card ${hasFailed ? "danger" : ""}">
          <div class="ds-icon">${hasFailed ? "❌" : "🎯"}</div>
          <div class="ds-value" style="${hasFailed ? "color:var(--danger)" : ""}">${failedOrders.count}</div>
          <div class="ds-label" style="${hasFailed ? "color:var(--danger)" : ""}">${t("results.failed")}</div>
          <div class="ds-sub">${hasFailed ? t("results.orders_failed_upload") : t("results.all_orders_ok")}</div>
        </div>
        <div class="dash-stat-card warning">
          <div class="ds-icon">🔁</div>
          <div class="ds-value">${totalInTaager}</div>
          <div class="ds-label">${t("results.in_taager")}</div>
          <div class="ds-sub">${t("results.already_in_system")}</div>
        </div>
        <div class="dash-stat-card accent">
          <div class="ds-icon">📦</div>
          <div class="ds-value">${totalDupes}</div>
          <div class="ds-label">${t("results.dupes")}</div>
          <div class="ds-sub">${t("results.duplicate_phone")}</div>
        </div>
      </div>

      ${legacyMissingSubmittedCount > 0 ? `
      <div class="notice-box info">
        <span class="notice-icon">i</span>
        <div class="notice-text">
          <strong>${translated("results.missing_orders_pending_title", "Missing Orders are submitted, not confirmed cart orders")}</strong>
          <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${translated("results.missing_orders_pending_body", "Taager accepted the Missing Orders workbook, but those rows may not appear immediately in the normal Taager orders list. Check the Missing Orders tab, or route missed orders to Cart/Second Cart when you need confirmed normal orders.")}</div>
        </div>
      </div>` : ""}

      <!-- SUCCESS RATE BAR -->
      ${totalUploaded > 0 ? `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-title"><span style="color:var(--success)">📊</span> ${successRateTitle}</div>
          <div style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:${successRate === 100 ? "var(--success)" : successRate >= 70 ? "var(--warning)" : "var(--danger)"}">${successRate}%</div>
        </div>
        <div class="dash-section-body">
          <div style="height:12px;background:var(--border);border-radius:var(--radius-xs);overflow:hidden">
            <div style="height:100%;width:${successRate}%;background:${successRate === 100 ? "var(--success)" : successRate >= 70 ? "var(--warning)" : "var(--danger)"};border-radius:var(--radius-xs);transition:width 0.8s ease"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:var(--type-label);color:var(--text2)">
            <span>${successCountText}</span>
            <span>${(()=>{const fn=t("results.total_attempted");return typeof fn==="function"?fn(totalUploaded):fn;})()}</span>
            ${hasFailed ? `<span style="color:var(--danger)">❌ ${failedOrders.count} ${t("results.failed")}</span>` : ""}
          </div>
        </div>
      </div>` : ""}

      <!-- TWO COLUMN: Products split + Source breakdown -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">

        <!-- Orders by product (success/fail split) -->
        <div class="dash-section">
          <div class="dash-section-header">
            <div class="dash-section-title"><span>📦</span> ${t("results.orders_by_product")}</div>
            <div style="font-size:var(--type-caption);color:var(--text2)">${(()=>{const fn=t("results.products_click");return typeof fn==="function"?fn(productSplitRows.length):fn;})()}</div>
          </div>
          <div class="dash-section-body selectable">
            ${buildProductSplitListHtml(productSplitRows, hasFailed)}
          </div>
        </div>

        <!-- Source breakdown + uploaded orders table -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="dash-section">
            <div class="dash-section-header">
              <div class="dash-section-title"><span>🔄</span> ${t("results.order_sources")}</div>
            </div>
            <div class="dash-section-body">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div style="background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
                  <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t("results.from_real")}</div>
                  <div style="font-size:var(--type-page-title);font-weight:var(--weight-bold);color:var(--text)">${stats.realNew || 0}</div>
                  <div style="font-size:var(--type-caption);color:var(--text2);margin-top:2px">${t("results.new_unique")}</div>
                </div>
                <div style="background:rgba(124,106,247,0.08);border:1px solid rgba(124,106,247,0.2);border-radius:var(--radius-sm);padding:14px;text-align:center">
                  <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#a89cf7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t("results.from_missed")}</div>
                  <div style="font-size:var(--type-page-title);font-weight:var(--weight-bold);color:var(--text)">${stats.missedNew || 0}</div>
                  <div style="font-size:var(--type-caption);color:var(--text2);margin-top:2px">${t("results.new_unique")}</div>
                </div>
              </div>
              ${(secondDestinationCount || legacyMissingDestinationCount) ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
                <div style="background:rgba(20,184,166,0.08);border:1px solid rgba(20,184,166,0.22);border-radius:var(--radius-sm);padding:12px;text-align:center">
                  <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#2dd4bf;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${t("results.destination_cart")}</div>
                  <div style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:var(--text)">${primaryDestinationCount}</div>
                </div>
                <div style="background:rgba(124,106,247,0.08);border:1px solid rgba(124,106,247,0.24);border-radius:var(--radius-sm);padding:12px;text-align:center">
                  <div style="font-size:var(--type-caption);font-weight:var(--weight-semibold);color:#a89cf7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${secondDestinationCount ? (t("results.destination_second") || "Second Cart") : t("results.destination_missing")}</div>
                  <div style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:var(--text)">${secondDestinationCount || legacyMissingDestinationCount}</div>
                </div>
              </div>` : ""}
            </div>
          </div>

          ${totalNew === 0 ? `
          <div class="dash-section">
            <div class="dash-section-body" style="text-align:center;padding:32px">
              <div style="font-size:var(--type-display);margin-bottom:10px">🎉</div>
              <div style="font-size:var(--type-component-title);font-weight:var(--weight-semibold);margin-bottom:4px">${t("results.all_caught")}</div>
              <div class="text-muted text-sm">${t("results.no_orders")}</div>
            </div>
          </div>` : `
          <div class="dash-section">
            <div class="dash-section-header">
              <div class="dash-section-title"><span style="color:var(--success)">✅</span> ${uploadedOrdersTitle}</div>
              <div style="font-size:var(--type-caption);color:var(--text2)">${t("run.click_cells_copy")}</div>
            </div>
            <div class="dash-section-body no-pad" style="overflow-x:auto">
              <table class="orders-preview-table" style="font-size:var(--type-label)">
                <thead><tr>
                  <th>${t("results.product_col")}</th>
                  <th style="text-align:right">${t("results.orders_col")}</th>
                  <th style="text-align:right">${t("results.total_qty_col")}</th>
                </tr></thead>
                <tbody>
                  ${pagedUploadedProducts.itemsHtml}
                </tbody>
                <tfoot><tr>
                  <td style="font-weight:var(--weight-bold);border-top:1px solid var(--border);padding:8px 10px">${t("results.total")}</td>
                  <td style="text-align:right;font-weight:var(--weight-bold);border-top:1px solid var(--border);padding:8px 10px;color:var(--success)">${totalNew}</td>
                  <td style="text-align:right;font-weight:var(--weight-bold);border-top:1px solid var(--border);padding:8px 10px;color:var(--accent)">${products.reduce((s, p) => s + p.totalQty, 0)}</td>
                </tfoot>
              </table>
              ${pagedUploadedProducts.pagerHtml}
            </div>
          </div>`}
        </div>
      </div>

      <!-- FAILED ORDERS SECTION -->
      ${hasFailed ? `
      <div class="dash-section" style="border-color:var(--danger)">
        <div class="dash-section-header" style="background:rgba(255,77,109,0.06)">
          <div class="dash-section-title" style="color:var(--danger)"><span>❌</span> ${failTitle}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="font-size:var(--type-caption);color:var(--text2)">${t("results.fail_saved")}</div>
            ${failedOrders.failedDir ? `<button id="btn-open-failed-folder" class="btn btn-danger" style="font-size:var(--type-caption);padding:5px 12px">${t("results.open_folder")}</button>` : ""}
          </div>
        </div>
        <div class="dash-section-body no-pad">${errorRowsHtml}</div>
      </div>` : `
      <div class="notice-box info">
        <span class="notice-icon">✅</span>
        <div class="notice-text">${t("results.all_ok")}</div>
      </div>`}

      ${buildRecoveryUncertainHtml(data.affiliateRecovery)}

      ${buildSkippedOrdersHtml(skippedOrders)}

      <!-- CONFIRMED ORDERS TABLE -->
      ${buildOrdersTableHtml(data.confirmedOrderRows || successfulRows, translated("results.confirmed_orders_table", "New Orders Confirmed in Taager"))}

      <!-- ALL ORDERS TABLE -->
      ${buildOrdersTableHtml(data.attemptedOrderRows || data.orderRows, t("results.all_attempted") || t("results.all_uploaded"))}

    </div></div>
      </div>
    </div>
  `;

  wireSharedSidebar(el);
  document.getElementById("btn-home")?.addEventListener("click", onHome);
  document.getElementById("btn-run-again")?.addEventListener("click", onRunAgain);

  document.getElementById("btn-download-failed")?.addEventListener("click", async () => {
    const dateTag  = dateFrom.replace(/-/g, "");
    const accTag   = resultAccountTag(data._accountLabel);
    const filename = `failed-orders-${accTag}-${dateTag}-${_runTimeTag}.xlsx`;
    const result   = await window.api.saveOutputFile({ buffer: failedOrders.buffer, filename });
    if (result.saved) { const fn = t("results.toast_saved"); showToast(typeof fn === "function" ? fn(result.path) : fn); }
  });

  document.getElementById("btn-download-skipped")?.addEventListener("click", async () => {
    const dateTag  = dateFrom.replace(/-/g, "");
    const accTag   = resultAccountTag(data._accountLabel);
    const filename = `skipped-orders-${accTag}-${dateTag}-${_runTimeTag}.xlsx`;
    const result   = await window.api.saveOutputFile({ buffer: skippedOrders.buffer, filename });
    if (result.saved) { const fn = t("results.toast_saved"); showToast(typeof fn === "function" ? fn(result.path) : fn); }
  });

  document.getElementById("btn-open-failed-folder")?.addEventListener("click", () => {
    if (failedOrders.failedDir) window.api.openFolder(failedOrders.failedDir);
  });

  if (buffer) {
    document.getElementById("btn-download")?.addEventListener("click", async () => {
      const dateTag  = dateFrom.replace(/-/g, "");
      const filename = `taager-orders-${resultAccountTag(data._accountLabel)}-${dateTag}.xlsx`;
      const result   = await window.api.saveOutputFile({ buffer, filename });
      if (result.saved) { const fn = t("results.toast_saved"); showToast(typeof fn === "function" ? fn(result.path) : fn); }
    });
  }
};

// ── Toast ──
function showToast(msg) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:var(--bg2);border:1px solid var(--border);
    border-radius:var(--radius-sm);padding:12px 18px;
    font-size:var(--type-control);color:var(--text);
    box-shadow:0 4px 20px rgba(0,0,0,.4);
    z-index:9999;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
