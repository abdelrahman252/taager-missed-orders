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

  function recoveryMetricsFor(sourceData, totalNew, failedOrders) {
    const recovery = sourceData?.affiliateRecovery;
    if (!recovery || recovery.enabled !== true) return null;
    const attempted = recovery.previewOnly === true
      ? (Number(recovery.queuedCount || 0) || (Array.isArray(recovery.queuedRows) ? recovery.queuedRows.length : 0) || (Array.isArray(sourceData?.attemptedOrderRows) ? sourceData.attemptedOrderRows.length : 0))
      : (Number(recovery.attemptedCount || 0) || (Array.isArray(sourceData?.attemptedOrderRows) ? sourceData.attemptedOrderRows.length : 0));
    const verified = Number(recovery.verifiedCount || 0) || Number(totalNew || 0) || 0;
    const failed = Number(recovery.failedInTaagerCount || 0) || Number(failedOrders?.count || 0) || 0;
    const unresolved = Number(recovery.unresolvedCount || 0) || 0;
    const blockedReview = Number(recovery.blockedReviewCount || recovery.skippedManualCount || 0) || 0;
    const totalAttempted = Math.max(attempted, verified + failed + unresolved);
    if (totalAttempted <= 0) return null;
    return { attempted: totalAttempted, verified, failed, unresolved, blockedReview, previewOnly: recovery.previewOnly === true };
  }

  function translated(key, fallback) {
    const value = t(key);
    return value === key ? fallback : value;
  }

  function htmlEsc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
  let tableDownloadSeq = 0;
  let manualReviewTableSeq = 0;
  window._resTableDownloads = {};
  window._resManualReviewTables = {};

  function paginationStatusText(current, total) {
    return translated("results.pagination_status", "Page {current} / {total}")
      .replace("{current}", current)
      .replace("{total}", total);
  }

  function csvEscape(value) {
    const text = String(value == null || value === "" ? "" : value).replace(/\r?\n/g, " ").trim();
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function tableRowsToCsv(rows, columns) {
    const header = columns.map((col) => csvEscape(col.header)).join(",");
    const body = (rows || []).map((row, index) => columns.map((col) => {
      try {
        const value = typeof col.value === "function" ? col.value(row, index) : row?.[col.value];
        return csvEscape(value);
      } catch {
        return "";
      }
    }).join(","));
    return `\uFEFF${[header, ...body].join("\r\n")}`;
  }

  function registerTableDownload(rows, columns, filenameBase) {
    const cleanRows = Array.isArray(rows) ? rows : [];
    if (!cleanRows.length) return "";
    const id = `res-table-download-${++tableDownloadSeq}`;
    const dateTag = String(dateFrom || "results").replace(/-/g, "");
    window._resTableDownloads[id] = {
      rows: cleanRows,
      columns,
      filename: `${safeFilenamePart(filenameBase || "results-table")}-${dateTag}-${_runTimeTag}.csv`,
    };
    return id;
  }

  window._resDownloadTable = async function (id) {
    const item = window._resTableDownloads && window._resTableDownloads[id];
    if (!item || !window.api?.saveOutputFile) return;
    const csv = tableRowsToCsv(item.rows, item.columns);
    const buffer = Array.from(new TextEncoder().encode(csv));
    const result = await window.api.saveOutputFile({ buffer, filename: item.filename });
    if (result && result.saved) {
      const fn = t("results.toast_saved");
      showToast(typeof fn === "function" ? fn(result.path) : fn);
    }
  };

  function tableDownloadButton(downloadId) {
    if (!downloadId) return "";
    return `<button type="button" class="btn res-table-download" onclick="window._resDownloadTable('${downloadId}')">⬇️ ${translated("results.download_table", "Download Table")}</button>`;
  }

  function registerManualReviewTable(rows) {
    const cleanRows = Array.isArray(rows) ? rows : [];
    if (!cleanRows.length) return "";
    const id = `manual-review-table-${++manualReviewTableSeq}`;
    window._resManualReviewTables[id] = cleanRows;
    return id;
  }

  function manualReviewInput(field, value, options = {}) {
    const type = options.type || "text";
    const min = options.min != null ? ` min="${htmlEsc(options.min)}"` : "";
    const step = options.step != null ? ` step="${htmlEsc(options.step)}"` : "";
    return `<input data-manual-field="${field}" type="${type}" value="${htmlEsc(value)}"${min}${step} style="box-sizing:border-box;width:100%;min-width:${options.minWidth || 90}px;background:rgba(255,255,255,0.035);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:6px 8px;font:inherit">`;
  }

  function manualReviewStaticField(field, value, className = "") {
    const safe = htmlEsc(value || "");
    return `<span data-manual-static-field="${field}" data-manual-static-value="${safe}" class="${className}" title="${safe}">${safe || "-"}</span>`;
  }

  function manualReviewHiddenField(field, value) {
    const safe = htmlEsc(value || "");
    return `<span data-manual-static-field="${field}" data-manual-static-value="${safe}" class="manual-hidden-field" aria-hidden="true"></span>`;
  }

  function manualReviewQualitySort(rows) {
    const sourceRank = (row) => {
      const source = String(row?.source || row?.recoverySource || "").toLowerCase();
      if (source === "real") return 0;
      if (source === "missed") return 1;
      return 2;
    };
    const scoreRow = (row) => {
      const reason = normalizedRecoveryReasonKey(row?.reason || row?.recoveryStatus || row?.actionMessage || row?.message || "");
      const phone = String(row?.normalizedPhone || row?.normPhone || row?.phone || row?.rawPhone || "").trim();
      const name = String(row?.name || row?.customerName || "").trim();
      const sku = String(row?.sku || row?.suggestedSku || "").trim();
      const product = String(row?.productName || row?.product || "").trim();
      const city = String(row?.city || row?.region || "").trim();
      const address = String(row?.address || row?.notes || row?.note || "").trim();
      let score = 0;
      if (phone.length >= 9) score += 20;
      if (sku) score += 18;
      if (product) score += 16;
      if (name && !/^\d+$/.test(name) && !/^[^\p{L}\p{N}]+$/u.test(name)) score += 12;
      if (city) score += 8;
      if (address && address !== city) score += 6;
      if (row?.suggestedSubtotal || row?.easyOrdersSubtotal || row?.subtotal || row?.price) score += 5;
      if (reason === "invalid_customer_data") score -= 50;
      if (reason === "missing_sku_for_missed_product") score -= 18;
      if (reason === "no_trusted_product_reference" || reason === "missing_sku_tier_profile") score -= 16;
      if (reason === "utm_product_sku_conflict" || reason === "ambiguous_sku_price_tier") score -= 8;
      return score;
    };
    return (Array.isArray(rows) ? rows : [])
      .map((row, index) => ({ row, index, source: sourceRank(row), score: scoreRow(row) }))
      .sort((a, b) => (a.source - b.source) || (b.score - a.score) || (a.index - b.index))
      .map((item) => item.row);
  }

  function collectManualReviewRows(tableId, selectedOnly) {
    const table = document.querySelector(`[data-manual-table="${tableId}"]`);
    if (!table) return [];
    const trs = Array.from(table.querySelectorAll('tbody tr[data-manual-row="1"]'));
    const selected = trs.filter((tr) => tr.querySelector("[data-manual-select]")?.checked);
    const sourceRows = selectedOnly ? selected : trs;
    return sourceRows.map((tr) => {
      const row = {};
      tr.querySelectorAll("[data-manual-field]").forEach((input) => {
        row[input.getAttribute("data-manual-field")] = input.value;
      });
      tr.querySelectorAll("[data-manual-static-field]").forEach((node) => {
        row[node.getAttribute("data-manual-static-field")] = node.getAttribute("data-manual-static-value") || node.textContent || "";
      });
      row.source = tr.getAttribute("data-manual-source") || row.source || "manual-review";
      row.reason = tr.getAttribute("data-manual-reason") || "";
      return row;
    });
  }

  window._resDownloadManualReviewTable = async function (tableId) {
    const rows = collectManualReviewRows(tableId, false);
    if (!rows.length || !window.api?.saveOutputFile) return;
    const columns = [
      { header: translated("results.source_col", "Source"), value: "source" },
      { header: t("results.customer_name_col"), value: "name" },
      { header: t("results.phone_col") || "Phone", value: "phone" },
      { header: t("results.sku") || "SKU", value: "sku" },
      { header: t("results.product_col"), value: "productName" },
      { header: translated("results.qty_col", "Qty"), value: "qty" },
      { header: translated("results.subtotal_col", "Subtotal"), value: "subtotal" },
      { header: translated("results.city_col", "City"), value: "city" },
      { header: translated("results.address_col", "Address"), value: "address" },
      { header: t("results.reason_col"), value: "reason" },
    ];
    const csv = tableRowsToCsv(rows, columns);
    const buffer = Array.from(new TextEncoder().encode(csv));
    const result = await window.api.saveOutputFile({ buffer, filename: `manual-review-edited-${String(dateFrom || "results").replace(/-/g, "")}-${_runTimeTag}.csv` });
    if (result && result.saved) {
      const fn = t("results.toast_saved");
      showToast(typeof fn === "function" ? fn(result.path) : fn);
    }
  };

  window._resSetManualReviewSelection = function (tableId, checked) {
    const table = document.querySelector(`[data-manual-table="${tableId}"]`);
    if (!table) return;
    table.querySelectorAll('tbody tr[data-manual-row="1"] [data-manual-select]').forEach((input) => {
      input.checked = Boolean(checked);
    });
  };

  window._resStartManualReviewUpload = async function (tableId) {
    const rows = collectManualReviewRows(tableId, true);
    if (!rows.length || !window.api?.runBot) {
      showToast(translated("results.manual_review_no_rows", "No reviewed rows selected."));
      return;
    }
    showToast(translated("results.manual_review_upload_started", "Starting reviewed-row upload..."));
    const result = await window.api.runBot({
      dateFrom,
      dateTo,
      accountIds: data?._accountId ? [data._accountId] : [],
      manualReviewMode: true,
      manualReviewOrders: rows,
      easyOrdersAffiliateRecoveryEnabled: false,
    });
    if (result && result.success) {
      window.renderResults({ ...(result.data || {}), _accountId: data?._accountId || result.accountId || "", _accountLabel: data?._accountLabel || result.accountLabel || "" }, dateFrom, dateTo, onRunAgain, onHome);
    } else {
      showToast((result && result.error) || translated("results.run_failed", "Bot run failed"));
    }
  };

  function manualReviewActionButtons(tableId) {
    if (!tableId) return "";
    return `
      <button type="button" class="btn res-manual-select-action" onclick="window._resSetManualReviewSelection('${tableId}', true)">${translated("results.select_all", "Select All")}</button>
      <button type="button" class="btn res-manual-clear-action" onclick="window._resSetManualReviewSelection('${tableId}', false)">${translated("results.deselect_all", "Deselect All")}</button>
      <button type="button" class="btn res-table-download" onclick="window._resDownloadManualReviewTable('${tableId}')">⬇️ ${translated("results.download_edited_table", "Download Edited")}</button>
      <button type="button" class="btn" style="background:rgba(249,115,22,0.16);border-color:#f97316;color:#fb923c" onclick="window._resStartManualReviewUpload('${tableId}')">${translated("results.start_reviewed_upload", "Start Reviewed")}</button>
    `;
  }

  function setupResultsCollapsibleTables(root = document) {
    const sections = Array.from(root.querySelectorAll(".dash-section"));
    const keepOpenPattern = /manual review|needs manual|confirmed|uploaded orders|مراجعة|مؤكدة|تم الرفع|مرفوعة|مرفوعة \/ مقدمة|مرفوعة أو مقدمة/i;
    const interactiveSelector = "button,input,select,textarea,a,label,[role='button']";

    function setCollapsed(section, collapsed) {
      const blocks = Array.from(section.querySelectorAll(":scope > .results-collapsible-extra, :scope > .dash-section-body"));
      if (!blocks.length) return;
      if (collapsed) {
        blocks.forEach((block) => {
          block.style.maxHeight = `${block.scrollHeight}px`;
          block.offsetHeight;
        });
        section.classList.add("is-collapsed");
        blocks.forEach((block) => {
          block.style.maxHeight = "0px";
        });
      } else {
        section.classList.remove("is-collapsed");
        blocks.forEach((block) => {
          block.style.maxHeight = `${block.scrollHeight}px`;
        });
      }
    }

    sections.forEach((section) => {
      const body = section.querySelector(":scope > .dash-section-body");
      const header = section.querySelector(":scope > .dash-section-header");
      if (!body || !header || !section.querySelector("table")) return;
      const titleText = section.querySelector(".dash-section-title")?.textContent || "";
      const isManualReview = Boolean(section.querySelector("[data-manual-table]"));
      const isImportant = isManualReview || keepOpenPattern.test(titleText);
      if (isImportant || section.dataset.resultsCollapsibleReady === "1") return;

      section.dataset.resultsCollapsibleReady = "1";
      section.classList.add("results-collapsible");
      const title = section.querySelector(".dash-section-title");
      if (title && !title.querySelector(".results-collapse-icon")) {
        title.insertAdjacentHTML("beforeend", `<span class="results-collapse-icon" aria-hidden="true">›</span>`);
      }
      setCollapsed(section, true);
      header.addEventListener("click", (event) => {
        if (event.target.closest(interactiveSelector)) return;
        setCollapsed(section, !section.classList.contains("is-collapsed"));
      });
    });
  }

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
      .res-table-download {
        font-size: var(--type-caption);
        padding: 5px 10px;
        background: rgba(79,142,247,0.08);
        border-color: rgba(79,142,247,0.28);
        color: var(--accent);
      }
      .res-manual-select-action {
        font-size: var(--type-caption);
        padding: 5px 10px;
        background: rgba(20,184,166,0.12);
        border-color: rgba(20,184,166,0.36);
        color: #2dd4bf;
      }
      .res-manual-clear-action {
        font-size: var(--type-caption);
        padding: 5px 10px;
        background: rgba(148,163,184,0.10);
        border-color: rgba(148,163,184,0.28);
        color: var(--text2);
      }
      .dash-section.results-collapsible .dash-section-header {
        cursor: pointer;
        user-select: none;
      }
      .dash-section.results-collapsible .dash-section-body,
      .dash-section.results-collapsible .results-collapsible-extra {
        transition: max-height 0.26s ease, opacity 0.2s ease, padding-top 0.2s ease, padding-bottom 0.2s ease;
        will-change: max-height, opacity;
      }
      .dash-section.results-collapsible.is-collapsed .dash-section-body,
      .dash-section.results-collapsible.is-collapsed .results-collapsible-extra {
        max-height: 0 !important;
        opacity: 0;
        overflow: hidden !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        border-bottom-width: 0 !important;
      }
      .results-collapse-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        margin-inline-start: 6px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--text2);
        font-size: 11px;
        transition: transform 0.2s ease, color 0.2s ease, border-color 0.2s ease;
      }
      .dash-section.results-collapsible:not(.is-collapsed) .results-collapse-icon {
        transform: rotate(90deg);
        color: var(--accent);
        border-color: rgba(79,142,247,0.36);
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
        min-width: 1460px;
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
      .skipped-orders-table .skip-source {
        font-family:var(--font-mono);
        font-size:var(--type-caption);
        color: var(--text2);
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
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.35;
        font-size:var(--type-label);
        color: var(--text);
      }
      .skipped-orders-table .skip-message {
        direction: auto;
        text-align: start;
        color: var(--text2);
      }
      .skipped-orders-table .manual-product-readonly {
        box-sizing: border-box;
        display: block;
        width: 100%;
        min-height: 30px;
        padding: 6px 8px;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 6px;
        background: rgba(255,255,255,0.02);
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        direction: rtl;
        text-align: right;
      }
      .skipped-orders-table .manual-hidden-field {
        display: none !important;
      }
      .skipped-orders-table .skip-alert {
        text-align: center;
        font-size:var(--type-body);
      }
      .skipped-orders-table col.skip-col-index { width: 36px; }
      .skipped-orders-table col.skip-col-outcome { width: 64px; }
      .skipped-orders-table col.skip-col-source { width: 86px; }
      .skipped-orders-table col.skip-col-name { width: 150px; }
      .skipped-orders-table col.skip-col-phone { width: 130px; }
      .skipped-orders-table col.skip-col-sku { width: 150px; }
      .skipped-orders-table col.skip-col-product { width: 320px; }
      .skipped-orders-table col.skip-col-number { width: 76px; }
      .skipped-orders-table col.skip-col-reason { width: 230px; }
      .skipped-orders-table col.skip-col-message { width: 360px; }
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
      .failed-orders-table .failed-name {
        direction: rtl;
        text-align: right;
        color: var(--text);
        font-weight:var(--weight-semibold);
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
      .failed-orders-table .failed-name,
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
      .results-status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 86px;
        max-width: 100%;
        border-radius: var(--radius-pill);
        padding: 3px 9px;
        font-size: var(--type-caption);
        font-weight: var(--weight-bold);
        line-height: 1.25;
        white-space: normal;
        overflow-wrap: anywhere;
        text-align: center;
      }
      .results-status-pill.is-confirmed {
        color: var(--success);
        background: rgba(0,214,143,0.12);
        border: 1px solid rgba(0,214,143,0.28);
      }
      .results-status-pill.is-failed {
        color: var(--danger);
        background: rgba(255,77,109,0.12);
        border: 1px solid rgba(255,77,109,0.28);
      }
      .results-status-pill.is-warning {
        color: var(--warning);
        background: rgba(255,170,0,0.12);
        border: 1px solid rgba(255,170,0,0.28);
      }
      .results-status-pill.is-info {
        color: var(--accent);
        background: rgba(79,142,247,0.12);
        border: 1px solid rgba(79,142,247,0.28);
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
      if (status) status.textContent = paginationStatusText(nextPage, pageCount);
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
        <span class="res-pagination-status" data-res-page-status>${paginationStatusText(1, pageCount)}</span>
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
    const rows = manualReviewQualitySort(skippedOrders.rows || []);
    const showAlertColumn = rows.some((row) => row && row.uploadedWithWarning);
    const manualReviewReasons = new Set([
      "quantity_above_safe_limit",
      "invalid_customer_data",
      "ambiguous_sku_price_tier",
      "subtotal_not_in_sku_tiers",
      "missing_sku_tier_profile",
      "missing_easyorders_subtotal",
      "sku_tier_profile_too_weak",
      "missing_sku_for_missed_product",
      "utm_product_sku_conflict",
      "quantity_inference_requires_manual_review",
      "quantity_tier_price_not_verified",
      "no_trusted_product_reference",
      "normal_flow_prepared_quantity_is_suspicious",
      "duplicate_easyorders_uuid_conflicting_phone",
      "skipped_manual",
    ]);
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
      quantity_above_safe_limit: translated("results.reason_quantity_above_safe_limit", "Quantity above safe limit"),
      invalid_customer_data: translated("results.reason_invalid_customer_data", "Customer data looks fake or invalid"),
      ambiguous_sku_price_tier: translated("results.reason_ambiguous_sku_price_tier", "Ambiguous SKU price tier"),
      subtotal_not_in_sku_tiers: translated("results.reason_subtotal_not_in_sku_tiers", "Subtotal not in trusted SKU tiers"),
      missing_sku_tier_profile: translated("results.reason_missing_sku_tier_profile", "Missing SKU tier profile"),
      missing_easyorders_subtotal: translated("results.reason_missing_easyorders_subtotal", "Missing EasyOrders subtotal"),
      sku_tier_profile_too_weak: translated("results.reason_sku_tier_profile_too_weak", "SKU tier profile too weak"),
      missing_sku_for_missed_product: translated("results.reason_missing_sku_for_missed_product", "Missing SKU for missed product"),
      utm_product_sku_conflict: translated("results.reason_utm_product_sku_conflict", "Product SKU conflicts with UTM SKU"),
      quantity_inference_requires_manual_review: translated("results.reason_quantity_inference_requires_manual_review", "Quantity needs manual review"),
      quantity_tier_price_not_verified: translated("results.reason_quantity_tier_price_not_verified", "Quantity tier price not verified"),
      no_trusted_product_reference: translated("results.reason_no_trusted_product_reference", "No trusted product reference"),
      normal_flow_prepared_quantity_is_suspicious: translated("results.reason_normal_flow_prepared_quantity_is_suspicious", "Suspicious prepared quantity"),
      duplicate_easyorders_uuid_conflicting_phone: translated("results.reason_duplicate_easyorders_uuid_conflicting_phone", "Same EasyOrders order has conflicting phone candidates"),
      skipped_manual: translated("results.reason_skipped_manual", "Manual review"),
    };
    const title = (value) => String(value || "").replace(/"/g,"");
    const reasonKeyFor = (row) => row?.uncertain && row.reason === "phone_parse_failed" ? "phone_uncertain_zero_appended" : row?.reason;
    const reasonTextFor = (row) => {
      const reasonKey = normalizedRecoveryReasonKey(reasonKeyFor(row));
      return reasonLabels[reasonKey] || reasonKey || "—";
    };
    const isManualReviewRow = (row) => {
      const reasonKey = reasonKeyFor(row);
      return row && (row.manualReview === true || (row.uncertain && manualReviewReasons.has(String(reasonKey || ""))));
    };
    const messageFor = (row) => {
      const reasonKey = normalizedRecoveryReasonKey(reasonKeyFor(row) || row?.actionMessage || row?.message || row?.skuTierDecision?.message);
      const normalized = recoveryStatusMessage({ ...row, reason: reasonKey });
      if (normalized && normalized !== "-") return normalized;
      return row?.actionMessage || row?.message || row?.skuTierDecision?.message || "";
    };
    const phoneFor = (row) => row?.normalizedPhone || row?.normPhone || row?.phone || row?.rawPhone || "—";
    const qtyFor = (row) => row?.suggestedQty || row?.qty || row?.easyOrdersQty || "—";
    const subtotalFor = (row) => row?.suggestedSubtotal || row?.subtotal || row?.easyOrdersSubtotal || "—";
    const outcomeFor = (row) => row?.uploadedWithWarning
      ? t("results.warning_uploaded")
      : (isManualReviewRow(row) ? translated("results.manual_review_status", "Manual Review") : t("results.warning_skipped"));
    const downloadId = registerTableDownload(rows, [
      { header: t("results.warning_status_col"), value: outcomeFor },
      { header: t("results.source_col"), value: "source" },
      { header: t("results.customer_name_col"), value: "name" },
      { header: t("results.phone_col") || "Phone", value: phoneFor },
      { header: t("results.sku") || "SKU", value: (row) => row?.sku || row?.suggestedSku || "" },
      { header: t("results.product_col"), value: "productName" },
      { header: translated("results.qty_col", "Qty"), value: qtyFor },
      { header: t("results.reason_col"), value: reasonTextFor },
      { header: translated("results.message_col", "Message"), value: messageFor },
    ], "warnings-skipped-orders");
    const paged = buildPagedItems(rows, (row, i, attrs) => {
      const reasonText = reasonTextFor(row);
      const isManualReview = isManualReviewRow(row);
      const outcomeText = outcomeFor(row);
      const reviewColor = isManualReview ? "#f97316" : "var(--warning)";
      const outcomeColor = row.uploadedWithWarning ? "var(--warning)" : (isManualReview ? "#f97316" : "var(--danger)");
      const message = messageFor(row);
      const phone = phoneFor(row);
      const qty = qtyFor(row);
      const subtotal = subtotalFor(row);
      const city = row.city || row.region || "";
      const address = row.address || row.notes || "";
      const editable = isManualReviewRow(row);
      return `<tr ${attrs} style="${isManualReview ? "background:rgba(249,115,22,0.07)" : (row.uncertain ? "background:rgba(255,170,0,0.05)" : "")}">
        <td class="skip-outcome" style="color:${outcomeColor}" title="${outcomeText}">${editable ? `<input data-manual-select type="checkbox" style="accent-color:#f97316">` : outcomeText}</td>
        <td class="skip-source" title="${title(row.source)}">${row.source || "—"}</td>
        <td class="skip-name" title="${title(row.name)}">${editable ? manualReviewInput("name", row.name || "") : (row.name || "—")}</td>
        <td class="skip-phone" style="color:var(--text)" title="${title(phone)}">${editable ? manualReviewInput("phone", phone) : phone}</td>
        <td class="skip-phone" title="${title(row.sku)}">${editable ? manualReviewInput("sku", row.sku || row.suggestedSku || "") : (row.sku || row.suggestedSku || "—")}</td>
        <td class="skip-product" title="${title(row.productName)}">${editable ? `${manualReviewStaticField("productName", row.productName || "", "manual-product-readonly")}${manualReviewHiddenField("subtotal", subtotal)}` : (row.productName || "—")}</td>
        <td class="skip-phone">${editable ? manualReviewInput("qty", qty, { type: "number", min: 1, step: 1, minWidth: 64 }) : qty}</td>
        <td class="skip-phone">${editable ? manualReviewInput("city", city, { minWidth: 120 }) : htmlEsc(city || "—")}</td>
        <td class="skip-phone">${editable ? manualReviewInput("address", address, { minWidth: 160 }) : htmlEsc(address || "—")}</td>
        <td class="skip-reason" style="color:${reviewColor}" title="${title(reasonText)}">${reasonText}</td>
        <td class="skip-reason skip-message" title="${title(message)}">${message || "—"}</td>
        ${showAlertColumn ? `<td class="skip-alert">${row.uncertain ? `<span title="${t("results.phone_rescued_verify")}" style="color:var(--warning)">⚠️</span>` : ""}</td>` : ""}
      </tr>`.replace("<tr ", `<tr data-manual-row="${editable ? "1" : "0"}" data-manual-source="${htmlEsc(row.source || "")}" data-manual-reason="${htmlEsc(reasonText)}" `);
    }, "skipped");
    const hasManualReview = rows.some(isManualReviewRow);
    const manualTableId = hasManualReview ? registerManualReviewTable(rows) : "";
    const sectionColor = hasManualReview ? "#f97316" : "var(--warning)";
    const sectionBg = hasManualReview ? "rgba(249,115,22,0.08)" : "rgba(255,170,0,0.06)";
    const sectionTitle = hasManualReview
      ? translated("results.manual_review_title", "Needs Manual Review")
      : (typeof t("results.couldnt_process_title") === "function" ? t("results.couldnt_process_title")(skippedOrders.count) : t("results.couldnt_process_title"));
    return `
      <div class="dash-section" style="border-color:${sectionColor};margin-top:12px">
        <div class="dash-section-header" style="background:${sectionBg}">
          <div class="dash-section-title" style="color:${sectionColor}">
            <span>⚠️</span> ${sectionTitle}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="font-size:var(--type-caption);color:var(--text2)">${hasManualReview ? translated("results.manual_review_need_review", "{count} need manual review").replace("{count}", skippedOrders.count) : t("results.skipped_followup")}</div>
            ${tableDownloadButton(downloadId)}
            ${manualReviewActionButtons(manualTableId)}
          </div>
        </div>
        <div class="dash-section-body no-pad" style="overflow-x:auto;padding-bottom:10px;scrollbar-gutter:stable">
          <table class="orders-preview-table skipped-orders-table" data-manual-table="${manualTableId}">
            <colgroup>
              <col class="skip-col-outcome">
              <col class="skip-col-source">
              <col class="skip-col-name">
              <col class="skip-col-phone">
              <col class="skip-col-sku">
              <col class="skip-col-product">
              <col class="skip-col-number">
              <col class="skip-col-phone">
              <col class="skip-col-product">
              <col class="skip-col-reason">
              <col class="skip-col-message">
              ${showAlertColumn ? `<col class="skip-col-alert">` : ""}
            </colgroup>
            <thead><tr>
              <th>${hasManualReview ? translated("results.select_col", "Select") : t("results.warning_status_col")}</th>
              <th>${t("results.source_col")}</th>
              <th>${t("results.customer_name_col")}</th>
              <th>${t("results.phone_col") || "Phone"}</th>
              <th>${t("results.sku") || "SKU"}</th>
              <th>${t("results.product_col")}</th>
              <th>${translated("results.qty_col", "Qty")}</th>
              <th>${translated("results.city_col", "City")}</th>
              <th>${translated("results.address_col", "Address")}</th>
              <th>${t("results.reason_col")}</th>
              <th>${translated("results.message_col", "Message")}</th>
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

  function failedOrderDisplayName(row) {
    return row?.customerName || row?.name || row?.recipientName || row?.fullName || "";
  }

  function buildFailedOrdersDetailHtmlLegacy(failedOrders) {
    const rows = failedOrders?.errorRows || [];
    if (rows.length > 0) {
      const paged = buildPagedItems(rows, (row, i, attrs) => `<tr ${attrs}>
        <td style="color:var(--text2)">${row.row || i + 1}</td>
        <td style="font-family:var(--font-mono);color:var(--accent)">${row.sku || "—"}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(failedOrderDisplayName(row) || "").replace(/"/g,"")}">${failedOrderDisplayName(row) || "-"}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(row.product || row.productName || "").replace(/"/g,"")}">${row.product || row.productName || "—"}</td>
        <td style="font-family:var(--font-mono)">${failedOrderDisplayPhone(row) || "—"}</td>
        <td style="color:var(--danger);font-weight:var(--weight-semibold)">${failedOrderDisplayError(row) || "—"}</td>
      </tr>`, "failed-orders");
      return `<div style="overflow-x:auto">
        <table class="orders-preview-table" style="font-size:var(--type-label)">
          <thead><tr>
            ${[t("results.row_col") || t("results.row"), t("results.sku"), t("results.customer_name_col"), t("results.product_col"), t("results.phone_col") || t("results.phone"), t("results.error_col") || t("results.error")]
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
        const name = failedOrderDisplayName(row);
        return `<tr ${attrs}>
          <td class="failed-row">${esc(row.row || i + 1)}</td>
          <td class="failed-sku" title="${esc(row.sku)}">${esc(row.sku)}</td>
          <td class="failed-name" title="${esc(name)}">${esc(name)}</td>
          <td class="failed-product" title="${esc(product)}">${esc(product)}</td>
          <td class="failed-phone" title="${esc(phone)}">${esc(phone)}</td>
          <td class="failed-error" title="${esc(error)}">${esc(error)}</td>
        </tr>`;
      }, "failed-orders");
      return `<div class="failed-orders-table-wrap">
        <table class="orders-preview-table failed-orders-table">
          <colgroup>
            <col style="width:58px">
            <col style="width:180px">
            <col style="width:180px">
            <col style="width:300px">
            <col style="width:160px">
            <col style="width:212px">
          </colgroup>
          <thead><tr>
            ${[t("results.row_col") || t("results.row"), t("results.sku"), t("results.customer_name_col"), t("results.product_col"), t("results.phone_col") || t("results.phone"), t("results.error_col") || t("results.error")]
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

  function registerFailedOrdersDownload(failedOrders, filenameBase) {
    const rows = failedOrders?.errorRows || [];
    if (rows.length > 0) {
      return registerTableDownload(rows, [
        { header: t("results.row_col") || t("results.row"), value: (row, index) => row?.row || index + 1 },
        { header: t("results.sku"), value: "sku" },
        { header: t("results.customer_name_col"), value: failedOrderDisplayName },
        { header: t("results.product_col"), value: (row) => row?.product || row?.productName || "" },
        { header: t("results.phone_col") || t("results.phone"), value: failedOrderDisplayPhone },
        { header: t("results.error_col") || t("results.error"), value: failedOrderDisplayError },
      ], filenameBase || "failed-orders");
    }
    const summary = failedOrders?.summary || [];
    if (summary.length > 0) {
      return registerTableDownload(summary, [
        { header: t("results.product_col"), value: (row) => row?.productName || row?.product || row?.sku || "" },
        { header: t("results.orders_col"), value: (row) => row?.count || 1 },
      ], filenameBase || "failed-orders-summary");
    }
    return "";
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

  function buildMissingOrdersSnapshotHtml(missingOrdersUpload) {
    if (!missingOrdersUpload) return "";
    const snapshotRows = Array.isArray(missingOrdersUpload.snapshotRows) ? missingOrdersUpload.snapshotRows : [];
    const previewOnly = missingOrdersUpload.previewOnly === true || missingOrdersUpload.status === "preview_only_auto_confirm_off";
    const snapshotError = String(missingOrdersUpload.snapshotError || "").trim();
    const attempted = Number(missingOrdersUpload.attempted || 0) || 0;
    const flatRows = [];
    for (const order of snapshotRows) {
      const products = Array.isArray(order.products) && order.products.length ? order.products : [{}];
      for (const product of products) {
        flatRows.push({
          missingOrderCode: order.missingOrderCode || "",
          convertedOrderCode: order.convertedOrderCode || "",
          status: order.status || "",
          customerName: order.customerName || "",
          phone: order.phone || "",
          source: order.source || "",
          orderDate: order.orderDate || "",
          note: order.note || "",
          noteLabel: order.noteLabel || "",
          productsQuantity: order.productsQuantity || "",
          sku: product.sku || "",
          qty: product.qty || "",
          price: product.price || "",
          productTitle: product.title || product.raw || "",
          page: order.page || "",
        });
      }
    }

    if (!flatRows.length && !previewOnly && !snapshotError) return "";

    const downloadId = registerTableDownload(flatRows, [
      { header: translated("results.missing_order_code_col", "Missing Order Code"), value: "missingOrderCode" },
      { header: translated("results.converted_order_code_col", "Converted Order Code"), value: "convertedOrderCode" },
      { header: t("results.status_col"), value: "status" },
      { header: t("results.customer_name_col"), value: "customerName" },
      { header: t("results.phone_col") || "Phone", value: "phone" },
      { header: t("results.source_col"), value: "source" },
      { header: translated("results.order_date_col", "Order Date"), value: "orderDate" },
      { header: t("results.sku") || "SKU", value: "sku" },
      { header: translated("results.qty_col", "Qty"), value: "qty" },
      { header: translated("results.price_col", "Price"), value: "price" },
      { header: translated("results.note_col", "Note"), value: "note" },
      { header: translated("results.page_col", "Page"), value: "page" },
    ], "taager-missing-orders-snapshot");

    const paged = buildPagedItems(flatRows, (row, i, attrs) => `
      <tr ${attrs}>
        <td title="${htmlEsc(row.missingOrderCode)}">${htmlEsc(row.missingOrderCode || "—")}</td>
        <td title="${htmlEsc(row.convertedOrderCode)}">${htmlEsc(row.convertedOrderCode || "—")}</td>
        <td title="${htmlEsc(row.status)}">${htmlEsc(row.status || "—")}</td>
        <td title="${htmlEsc(row.customerName)}">${htmlEsc(row.customerName || "—")}</td>
        <td title="${htmlEsc(row.phone)}">${htmlEsc(row.phone || "—")}</td>
        <td title="${htmlEsc(row.orderDate)}">${htmlEsc(row.orderDate || "—")}</td>
        <td title="${htmlEsc(row.sku)}">${htmlEsc(row.sku || "—")}</td>
        <td>${htmlEsc(row.qty || "—")}</td>
        <td>${htmlEsc(row.price || "—")}</td>
        <td title="${htmlEsc(row.note || row.productTitle)}">${htmlEsc(row.note || row.productTitle || "—")}</td>
      </tr>`, "missing-orders-snapshot");

    const countText = flatRows.length
      ? translated("results.missing_orders_snapshot_count", "{count} cards scraped from Taager Missing Orders").replace("{count}", flatRows.length)
      : translated("results.missing_orders_snapshot_empty", "No Missing Orders cards were scraped yet.");
    const previewText = previewOnly
      ? translated("results.missing_orders_preview_only_body", "{count} missed-source orders are ready. Turn Auto-Confirm ON and run again to submit them.").replace("{count}", attempted)
      : "";
    const htmlPath = String(missingOrdersUpload.htmlPath || "").trim();
    return `
      ${previewOnly ? `
      <div class="notice-box warn" style="border-color:var(--warning);background:rgba(255,170,0,0.08)">
        <span class="notice-icon">⚠️</span>
        <div class="notice-text">
          <strong>${translated("results.missing_orders_preview_only_title", "Missing Orders preview only - nothing was submitted")}</strong>
          <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${previewText}</div>
        </div>
      </div>` : ""}
      <div class="dash-section" style="border-color:#38bdf8">
        <div class="dash-section-header" style="background:rgba(56,189,248,0.08)">
          <div class="dash-section-title" style="color:#38bdf8"><span>i</span> ${translated("results.missing_orders_snapshot_title", "Taager Missing Orders Snapshot")}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="font-size:var(--type-caption);color:var(--text2)">${countText}</div>
            ${tableDownloadButton(downloadId)}
          </div>
        </div>
        ${snapshotError ? `<div style="padding:10px 14px;color:var(--warning);font-size:var(--type-label);border-bottom:1px solid var(--border)">${htmlEsc(snapshotError)}</div>` : ""}
        ${htmlPath ? `<div style="padding:8px 14px;color:var(--text2);font-size:var(--type-caption);border-bottom:1px solid var(--border)">${translated("results.raw_html_saved", "Raw HTML saved")} · ${htmlEsc(htmlPath)}</div>` : ""}
        ${flatRows.length ? `
        <div class="dash-section-body no-pad" style="overflow-x:auto;padding-bottom:10px;scrollbar-gutter:stable">
          <table class="orders-preview-table missing-orders-snapshot-table" style="font-size:var(--type-label);width:100%;min-width:1180px;table-layout:fixed">
            <colgroup>
              <col style="width:130px">
              <col style="width:180px">
              <col style="width:130px">
              <col style="width:170px">
              <col style="width:150px">
              <col style="width:120px">
              <col style="width:190px">
              <col style="width:70px">
              <col style="width:85px">
              <col style="width:310px">
            </colgroup>
            <thead><tr>
              <th>${translated("results.missing_order_code_col", "Missing Order Code")}</th>
              <th>${translated("results.converted_order_code_col", "Converted Order Code")}</th>
              <th>${t("results.status_col")}</th>
              <th>${t("results.customer_name_col")}</th>
              <th>${t("results.phone_col") || "Phone"}</th>
              <th>${translated("results.order_date_col", "Order Date")}</th>
              <th>${t("results.sku") || "SKU"}</th>
              <th>${translated("results.qty_col", "Qty")}</th>
              <th>${translated("results.price_col", "Price")}</th>
              <th>${translated("results.note_col", "Note")}</th>
            </tr></thead>
            <tbody>${paged.itemsHtml}</tbody>
          </table>
          ${paged.pagerHtml}
        </div>` : `<div class="dash-section-body" style="color:var(--text2);font-size:var(--type-label)">${translated("results.missing_orders_snapshot_empty", "No Missing Orders cards were scraped yet.")}</div>`}
      </div>`;
  }

  // ── Shared helper: render the full orders table (name, phone, product, qty, city) ──
  function buildOrdersTableHtml(orderRows, label) {
    if (!orderRows || orderRows.length === 0) return "";
    const t = window._t;
    const ordersCountFn = t("results.orders_count");
    const tableUid = `orders-tbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    function orderCreatedAtText(o) {
      return o.easyCreatedAt || o.createdAt || o.date || "-";
    }

    function orderStatusInfo(o) {
      const raw = String(o.recoveryStatus || o.finalStatus || o.actionStatus || o.status || "").trim();
      const lower = raw.toLowerCase();
      const friendly = {
        verified_in_taager: translated("results.reason_verified_in_taager", "Confirmed in Taager"),
        confirmed_in_taager: translated("results.reason_verified_in_taager", "Confirmed in Taager"),
        failed_in_taager: translated("results.reason_failed_in_taager", "Failed in Taager"),
        not_found_after_retry: translated("results.reason_not_found_after_retry", "Not found after retry"),
        sent: translated("results.reason_sent", "Sent to EasyOrders"),
        sent_unverified: translated("results.reason_sent_unverified", "Sent, awaiting Taager export"),
        converted: translated("results.reason_converted", "Converted from missed orders"),
        convert_error: translated("results.reason_convert_error", "Convert failed"),
        retry_skipped: translated("results.reason_retry_skipped", "Retry skipped"),
        skipped_manual: translated("results.reason_skipped_manual", "Manual review needed"),
        completed_waiting_verification: translated("results.reason_completed_waiting_verification", "Already completed, verifying in Taager"),
        already_in_real_orders_unverified: translated("results.reason_already_in_real_orders_unverified", "Already in real orders, verifying in Taager"),
        preview_only_auto_confirm_off: translated("results.reason_preview_only_auto_confirm_off", "Preview only - Auto-Confirm OFF"),
      };
      if (friendly[lower]) {
        const cls = /verified|confirmed/.test(lower)
          ? "is-confirmed"
          : /failed|error|reject/.test(lower)
            ? "is-failed"
            : /sent|converted/.test(lower)
              ? "is-info"
              : "is-warning";
        return { text: friendly[lower], cls };
      }
      if (/verified|confirmed|success|ok/.test(lower)) {
        return { text: translated(`results.reason_${raw}`, raw || translated("results.confirmed_in_taager_cart", "Confirmed in Taager")), cls: "is-confirmed" };
      }
      if (/failed|not_found|error|reject/.test(lower)) {
        return { text: translated(`results.reason_${raw}`, raw || "-"), cls: "is-failed" };
      }
      if (/uncertain|manual|skipped|warning|review/.test(lower)) {
        return { text: translated(`results.reason_${raw}`, raw || "-"), cls: "is-warning" };
      }
      return { text: raw || translated("results.confirmed_in_taager_cart", "Confirmed in Taager"), cls: "is-confirmed" };
    }

    function renderOrderRow(o, i, attrs) {
      const createdAt = orderCreatedAtText(o);
      const destination = o.destination === "second-taager-cart"
        ? (t("results.destination_second") || "Second Cart")
        : (o.destination === "affiliate-recovery" ? translated("results.destination_recovery", "Recovery") : (isLegacyMissingOrder(o) ? t("results.destination_missing") : t("results.destination_cart")));
      const status = orderStatusInfo(o);
      return `<tr ${attrs || ""}>
        <td class="res-index">${i + 1}</td>
        <td class="res-name" title="${String(o.name || "").replace(/"/g,"")}">${o.name || "—"}</td>
        <td class="res-phone" title="${String(o.phone || "").replace(/"/g,"")}">${o.phone || "—"}</td>
        <td class="res-product" title="${(o.productName||"").replace(/"/g,"")}">${o.productName || "—"}</td>
        <td class="res-number" title="${String(o.qty || 1).replace(/"/g,"")}">${o.qty || 1}</td>
        <td class="res-number res-price" title="${String(o.subtotal || "").replace(/"/g,"")}">${o.subtotal || "—"}</td>
        <td title="${String(status.text).replace(/"/g,"")}"><span class="results-status-pill ${status.cls}">${status.text}</span></td>
        <td class="res-destination" title="${String(destination || "").replace(/"/g,"")}">${destination || "-"}</td>
        <td class="res-date" title="${String(createdAt).replace(/"/g,"")}">${createdAt}</td>
        <td class="res-city" title="${String(o.city || "").replace(/"/g,"")}">${o.city || "—"}</td>
      </tr>`;
    }

    function renderOrderRows(rows) {
      if (!rows || rows.length === 0) {
        return `<tr><td colspan="10" style="text-align:center;padding:14px;color:var(--text2);font-size:var(--type-label)">${t("results.no_orders_found") || "No orders match your search"}</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:14px;color:var(--text2);font-size:var(--type-label)">${t("results.no_orders_found") || "No orders match your search"}</td></tr>`;
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
    const destinationText = (o) => o?.destination === "second-taager-cart"
      ? (t("results.destination_second") || "Second Cart")
      : (isLegacyMissingOrder(o) ? t("results.destination_missing") : t("results.destination_cart"));
    const downloadId = registerTableDownload(orderRows, [
      { header: "#", value: (row, index) => index + 1 },
      { header: t("results.customer_name_col"), value: "name" },
      { header: t("results.phone_col"), value: "phone" },
      { header: t("results.product_col"), value: "productName" },
      { header: t("results.qty_col"), value: (row) => row?.qty || 1 },
      { header: t("results.price_col"), value: (row) => row?.subtotal || "" },
      { header: t("results.status_col"), value: (row) => orderStatusInfo(row).text },
      { header: t("results.destination_col"), value: destinationText },
      { header: t("results.easy_created_at_col"), value: orderCreatedAtText },
      { header: t("results.city_col"), value: "city" },
    ], label || "orders-table");

    return `
      <div class="dash-section">
        <div class="dash-section-header">
          <div class="dash-section-title"><span>📋</span> ${label || t("results.all_orders_label")} <span style="font-size:var(--type-caption);font-weight:var(--weight-regular);color:var(--text2);margin-left:6px">${typeof ordersCountFn === "function" ? ordersCountFn(orderRows.length) : ordersCountFn}</span></div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="font-size:var(--type-caption);color:var(--text2)">${t("run.click_to_copy")}</div>
            ${tableDownloadButton(downloadId)}
          </div>
        </div>
        <div class="results-collapsible-extra" style="padding:8px 12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,0.04)">
          <input type="text" placeholder="${t('results.search_orders_placeholder') || 'Search by name, phone or product...'}" style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:var(--type-label);color:var(--text);outline:none" oninput="window._resOrderSearch('${tableUid}',this.value)">
        </div>
        <div class="dash-section-body no-pad results-orders-table-wrap" style="overflow-x:auto">
          <table class="orders-preview-table results-orders-table" style="width:100%;min-width:1430px;table-layout:fixed;border-collapse:collapse">
            <colgroup>
              <col style="width:46px">
              <col style="width:190px">
              <col style="width:160px">
              <col style="width:430px">
              <col style="width:70px">
              <col style="width:90px">
              <col style="width:220px">
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
              <th>${t("results.status_col")}</th>
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

  function recoveryStatusMessage(row) {
    const reasonKey = normalizedRecoveryReasonKey(row.reason || row.recoveryStatus || row.actionMessage || row.message);
    const rawMessage = String(row.actionMessage || row.message || row.error || "").toLowerCase();
    if (reasonKey === "no_trusted_product_reference") {
      return translated(
        "results.message_no_trusted_product_reference",
        "No trusted product history exists; not submitted automatically."
      );
    }
    if (reasonKey === "already_in_real_orders_unverified") {
      return translated(
        "results.message_already_in_real_orders_unverified",
        "Convert to Order was not available; verify whether it already moved to real EasyOrders orders and Taager."
      );
    }
    if (reasonKey === "awaiting_taager_verification") {
      return translated(
        "results.message_awaiting_taager_verification",
        "EasyOrders action completed; Taager verification has not confirmed the order yet."
      );
    }
    if (reasonKey === "missing_sku_for_missed_product") {
      return translated("results.message_missing_sku_for_missed_product", "No trusted SKU match was found for this missed-order product.");
    }
    if (reasonKey === "invalid_customer_data") {
      return translated("results.message_invalid_customer_data", "Customer name or phone looks fake; review before upload.");
    }
    if (reasonKey === "utm_product_sku_conflict") {
      return translated("results.message_utm_product_sku_conflict", "The product match conflicts with the UTM campaign SKU.");
    }
    if (reasonKey === "ambiguous_sku_price_tier") {
      return translated("results.message_ambiguous_sku_price_tier", "More than one trusted price tier is possible; choose the correct quantity/subtotal.");
    }
    if (/customer data looks fake|sequential_digit|phone_like|name:phone_like/.test(rawMessage)) {
      return translated("results.message_invalid_customer_data", "Customer name or phone looks fake; review before upload.");
    }
    if (/missing sku|did not match easyorders|was found in utm campaign|utm campaign/.test(rawMessage)) {
      return translated("results.message_missing_sku_for_missed_product", "No trusted SKU match was found for this missed-order product.");
    }
    return row.actionMessage || row.existingSkus || row.missingSkus || "-";
  }

  function normalizedRecoveryReasonKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (compact.includes("customer_data_looks_fake") || compact.includes("invalid_customer_data") || compact.includes("sequential_digit") || compact.includes("phone_like")) return "invalid_customer_data";
    if (compact.includes("missing_sku_for_missed_product") || compact.includes("missing_sku") || compact.includes("product_name_did_not_match")) return "missing_sku_for_missed_product";
    if (compact.includes("product_sku_conflicts_with_utm") || compact.includes("utm_product_sku_conflict") || compact.includes("utm_campaign")) return "utm_product_sku_conflict";
    if (compact.includes("ambiguous_sku_price_tier")) return "ambiguous_sku_price_tier";
    if (compact.includes("subtotal_not_in_sku_tiers")) return "subtotal_not_in_sku_tiers";
    if (compact.includes("sku_tier_profile_too_weak")) return "sku_tier_profile_too_weak";
    if (compact.includes("no_trusted_product_reference")) return "no_trusted_product_reference";
    if (compact.includes("already_in_real_orders_unverified")) return "already_in_real_orders_unverified";
    if (compact.includes("awaiting_taager_verification")) return "awaiting_taager_verification";
    if (compact.includes("preview_only_auto_confirm_off")) return "preview_only_auto_confirm_off";
    return compact || raw;
  }

  function recoveryReasonLabel(value) {
    const key = normalizedRecoveryReasonKey(value);
    return translated(`results.reason_${key}`, value || "-");
  }

  function buildRecoveryUnresolvedHtml(recovery) {
    if (!recovery || recovery.enabled !== true) return "";
    const rows = recovery.unresolvedRows || [];
    if (!rows.length) return "";
    const td = (value, className = "", extra = "") => {
      const text = affiliateHtmlEsc(value);
      const cls = className ? ` class="${className}"` : "";
      return `<td${cls} title="${text}"${extra}>${text}</td>`;
    };
    const phoneFor = (row) => row?.phone || row?.normalizedPhone || row?.normPhone || row?.rawPhone || "";
    const qtyFor = (row) => row?.qty || row?.easyOrdersQty || row?.suggestedQty || "";
    const subtotalFor = (row) => row?.subtotal || row?.easyOrdersSubtotal || row?.suggestedSubtotal || "";
    const downloadId = registerTableDownload(rows, [
      { header: translated("results.source_col", "Source"), value: (row) => row?.source || row?.recoverySource || "" },
      { header: t("results.customer_name_col"), value: "name" },
      { header: t("results.phone_col") || t("results.phone"), value: phoneFor },
      { header: t("results.sku") || "SKU", value: "sku" },
      { header: t("results.product_col"), value: "productName" },
      { header: translated("results.qty_col", "Qty"), value: qtyFor },
      { header: translated("results.subtotal_col", "Subtotal"), value: subtotalFor },
      { header: t("results.reason_col"), value: (row) => recoveryReasonLabel(row?.recoveryStatus || row?.reason) },
      { header: translated("results.message_col", "Message"), value: recoveryStatusMessage },
    ], "attempted-not-verified");
    const countText = translated("results.unresolved_attempted_count", "{count} attempted orders need Taager verification").replace("{count}", rows.length);
    const rowHtml = (row, i, attrs) => {
      const reasonText = recoveryReasonLabel(row.recoveryStatus || row.reason);
      return `
      <tr ${attrs || ""} style="background:rgba(255,170,0,0.05)">
        ${td(row.source || row.recoverySource)}
        ${td(row.name)}
        ${td(phoneFor(row), "skip-phone")}
        ${td(row.sku)}
        ${td(row.productName)}
        ${td(qtyFor(row), "skip-phone")}
        ${td(subtotalFor(row), "skip-phone")}
        ${td(reasonText, "", ` style="color:var(--warning);font-weight:var(--weight-semibold)"`)}
        ${td(recoveryStatusMessage(row))}
      </tr>`;
    };
    const paged = buildPagedItems(rows, rowHtml, "recovery-unresolved");
    return `
      <div class="dash-section" style="border-color:var(--warning)">
        <div class="dash-section-header" style="background:rgba(255,170,0,0.06)">
          <div class="dash-section-title" style="color:var(--warning)"><span>⚠️</span> ${translated("results.unresolved_attempted_title", "Attempted / Not Verified")}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="font-size:var(--type-caption);color:var(--text2)">${countText}</div>
            ${tableDownloadButton(downloadId)}
          </div>
        </div>
        <div class="dash-section-body no-pad" style="overflow-x:auto">
          <table class="orders-preview-table skipped-orders-table" style="font-size:var(--type-label);width:100%;min-width:980px">
            <colgroup>
              <col class="skip-col-source">
              <col class="skip-col-name">
              <col class="skip-col-phone">
              <col class="skip-col-sku">
              <col class="skip-col-product">
              <col class="skip-col-number">
              <col class="skip-col-number">
              <col class="skip-col-reason">
              <col class="skip-col-reason">
            </colgroup>
            <thead><tr>
              <th>${translated("results.source_col", "Source")}</th>
              <th>${t("results.customer_name_col")}</th>
              <th>${t("results.phone_col") || t("results.phone")}</th>
              <th>${t("results.sku") || "SKU"}</th>
              <th>${t("results.product_col")}</th>
              <th>${translated("results.qty_col", "Qty")}</th>
              <th>${translated("results.subtotal_col", "Subtotal")}</th>
              <th>${t("results.reason_col")}</th>
              <th>${translated("results.message_col", "Message")}</th>
            </tr></thead>
            <tbody>${paged.itemsHtml}</tbody>
          </table>
          ${paged.pagerHtml}
        </div>
      </div>`;
  }

  function buildRecoveryUncertainHtml(recovery) {
    if (!recovery || recovery.enabled !== true) return "";
    const rows = manualReviewQualitySort(recovery.blockedReviewRows || recovery.manualReviewRows || []);
    if (!rows.length) return "";
    const messageFor = (row) => {
      return recoveryStatusMessage(row);
    };
    const td = (value, className = "", extra = "") => {
      const text = affiliateHtmlEsc(value);
      const cls = className ? ` class="${className}"` : "";
      return `<td${cls} title="${text}"${extra}>${text}</td>`;
    };
    const phoneFor = (row) => row?.phone || row?.normalizedPhone || row?.normPhone || row?.rawPhone || "";
    const qtyFor = (row) => row?.suggestedQty || row?.easyOrdersQty || row?.qty || "";
    const subtotalFor = (row) => row?.suggestedSubtotal || row?.easyOrdersSubtotal || row?.subtotal || "";
    const downloadId = registerTableDownload(rows, [
      { header: translated("results.source_col", "Source"), value: (row) => row?.source || row?.recoverySource || "" },
      { header: t("results.customer_name_col"), value: "name" },
      { header: t("results.phone_col") || t("results.phone"), value: phoneFor },
      { header: t("results.sku") || "SKU", value: "sku" },
      { header: t("results.product_col"), value: "productName" },
      { header: translated("results.qty_col", "Qty"), value: qtyFor },
      { header: t("results.reason_col"), value: (row) => recoveryReasonLabel(row?.reason || row?.recoveryStatus) },
      { header: translated("results.message_col", "Message"), value: messageFor },
    ], "needs-manual-review");
    const manualTableId = registerManualReviewTable(rows);
    const countText = translated("results.manual_review_need_review", "{count} need manual review").replace("{count}", rows.length);
    const rowHtml = (row, i, attrs) => {
      const reasonText = recoveryReasonLabel(row.reason || row.recoveryStatus);
      const messageText = messageFor(row);
      const phone = phoneFor(row);
      const qty = qtyFor(row);
      const subtotal = subtotalFor(row);
      const city = row.city || row.region || "";
      const address = row.address || row.notes || "";
      return `
      <tr data-manual-row="1" data-manual-source="${htmlEsc(row.source || row.recoverySource || "")}" data-manual-reason="${htmlEsc(reasonText)}" ${attrs || ""} style="background:rgba(249,115,22,0.06)">
        <td><input data-manual-select type="checkbox" style="accent-color:#f97316"></td>
        ${td(row.source || row.recoverySource)}
        <td>${manualReviewInput("name", row.name || "")}</td>
        <td class="skip-phone">${manualReviewInput("phone", phone)}</td>
        <td>${manualReviewInput("sku", row.sku || "")}</td>
        <td class="skip-product">${manualReviewStaticField("productName", row.productName || "", "manual-product-readonly")}${manualReviewHiddenField("subtotal", subtotal)}</td>
        <td class="skip-phone">${manualReviewInput("qty", qty, { type: "number", min: 1, step: 1, minWidth: 64 })}</td>
        <td class="skip-phone">${manualReviewInput("city", city, { minWidth: 120 })}</td>
        <td class="skip-phone">${manualReviewInput("address", address, { minWidth: 160 })}</td>
        ${td(reasonText, "", ` style="color:#f97316;font-weight:var(--weight-semibold)"`)}
        ${td(messageText, "skip-message")}
      </tr>`;
    };
    const paged = buildPagedItems(rows, rowHtml, "recovery-uncertain");
    return `
      <div class="dash-section" style="border-color:#f97316">
        <div class="dash-section-header" style="background:rgba(249,115,22,0.08)">
          <div class="dash-section-title" style="color:#f97316"><span>⚠️</span> ${translated("results.manual_review_title", "Needs Manual Review")}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="font-size:var(--type-caption);color:var(--text2)">${countText}</div>
            ${tableDownloadButton(downloadId)}
            ${manualReviewActionButtons(manualTableId)}
          </div>
        </div>
        <div class="dash-section-body no-pad" style="overflow-x:auto;padding-bottom:10px;scrollbar-gutter:stable">
          <table class="orders-preview-table skipped-orders-table" data-manual-table="${manualTableId}" style="font-size:var(--type-label);width:100%;min-width:1360px">
            <colgroup>
              <col class="skip-col-outcome">
              <col class="skip-col-source">
              <col class="skip-col-name">
              <col class="skip-col-phone">
              <col class="skip-col-sku">
              <col class="skip-col-product">
              <col class="skip-col-number">
              <col class="skip-col-phone">
              <col class="skip-col-product">
              <col class="skip-col-reason">
              <col class="skip-col-message">
            </colgroup>
            <thead><tr>
              <th>${translated("results.select_col", "Select")}</th>
              <th>${translated("results.source_col", "Source")}</th>
              <th>${t("results.customer_name_col")}</th>
              <th>${t("results.phone_col") || t("results.phone")}</th>
              <th>${t("results.sku") || "SKU"}</th>
              <th>${t("results.product_col")}</th>
              <th>${translated("results.qty_col", "Qty")}</th>
              <th>${translated("results.city_col", "City")}</th>
              <th>${translated("results.address_col", "Address")}</th>
              <th>${t("results.reason_col")}</th>
              <th>${translated("results.message_col", "Message")}</th>
            </tr></thead>
            <tbody>${paged.itemsHtml}</tbody>
          </table>
          ${paged.pagerHtml}
        </div>
      </div>`;
  }

  function recoveryFailureLabel(code) {
    const key = String(code || "").trim();
    const labels = {
      invalid_phone_number: translated("results.failed_reason_invalid_phone_number", "Invalid phone number"),
      price_high_error: translated("results.failed_reason_price_high_error", "Price is too high"),
      price_low_error: translated("results.failed_reason_price_low_error", "Price is too low"),
      price_error: translated("results.failed_reason_price_error", "Price mismatch"),
      product_not_available: translated("results.failed_reason_product_not_available", "Product not available"),
      product_stock_not_available: translated("results.failed_reason_product_stock_not_available", "Product out of stock"),
      invalid_address: translated("results.failed_reason_invalid_address", "Invalid address"),
      unknown_error: translated("results.failed_reason_unknown_error", "Unknown error"),
    };
    return labels[key] || key || "-";
  }

  function buildRecoveryFailedDiagnosticHtml(recovery) {
    if (!recovery || recovery.enabled !== true) return "";
    const diagnostic = recovery.failedOrdersDiagnostic || {};
    const rows = Array.isArray(diagnostic.matchedRows)
      ? diagnostic.matchedRows
      : (Array.isArray(diagnostic.rows) ? diagnostic.rows : []);
    const rawRows = Array.isArray(diagnostic.rawRows) ? diagnostic.rawRows : rows;
    const rawRowCount = Number(diagnostic.rawRowCount || 0) || rawRows.length || rows.length;
    const errorText = diagnostic.error || "";
    if (!rows.length && !errorText && !rawRowCount) return "";
    const valueList = (value) => Array.isArray(value) ? value.join(" | ") : (value || "");
    const columns = [
      { header: t("results.row_col") || "Row", value: "row" },
      { header: t("results.customer_name_col"), value: "name" },
      { header: t("results.phone_col") || "Phone", value: (row) => row?.formattedPhone || row?.phone || "" },
      { header: t("results.sku") || "SKU", value: (row) => valueList(row?.skus) },
      { header: translated("results.qty_col", "Qty"), value: (row) => valueList(row?.qtys) },
      { header: translated("results.price_col", "Price"), value: (row) => valueList(row?.prices) },
      { header: translated("results.failure_code_col", "Failure Code"), value: "failureCode" },
      { header: translated("results.failure_reason_col", "Failure Reason"), value: (row) => recoveryFailureLabel(row?.failureCode || row?.error) },
      { header: translated("results.store_order_col", "Store Order"), value: "storeOrderCode" },
      { header: translated("results.created_at_col", "Created"), value: "createdAt" },
    ];
    const downloadId = registerTableDownload(rows, columns, "taager-failed-orders-diagnosis");
    const rawDownloadId = rawRows.length > rows.length
      ? registerTableDownload(rawRows, columns, "taager-failed-orders-raw-diagnosis")
      : "";
    const td = (value, className = "") => {
      const text = affiliateHtmlEsc(valueList(value));
      return `<td${className ? ` class="${className}"` : ""} title="${text}">${text}</td>`;
    };
    const paged = buildPagedItems(rows, (row, i, attrs) => `
      <tr ${attrs || ""}>
        ${td(row.row || i + 1, "failed-row")}
        ${td(row.name, "failed-name")}
        ${td(row.formattedPhone || row.phone, "failed-phone")}
        ${td(row.skus, "failed-sku")}
        ${td(row.qtys, "failed-phone")}
        ${td(row.prices, "failed-phone")}
        ${td(row.failureCode || row.error, "failed-error")}
        ${td(recoveryFailureLabel(row.failureCode || row.error), "failed-error")}
        ${td(row.storeOrderCode, "failed-product")}
        ${td(row.createdAt, "failed-date")}
      </tr>`, "recovery-failed-diagnostic");
    const countText = rows.length
      ? translated("results.failed_diagnosis_matched_count", "{count} matched failed rows").replace("{count}", rows.length)
      : translated("results.failed_diagnosis_no_matches", "0 matched this run");
    const rawCountText = rawRowCount
      ? translated("results.failed_diagnosis_raw_count", "{count} raw failed rows downloaded").replace("{count}", rawRowCount)
      : "";
    const sectionColor = rows.length ? "var(--danger)" : "var(--accent)";
    const sectionBg = rows.length ? "rgba(255,77,109,0.06)" : "rgba(79,142,247,0.07)";
    return `
      <div class="dash-section" style="border-color:${sectionColor};margin-top:12px">
        <div class="dash-section-header" style="background:${sectionBg}">
          <div class="dash-section-title" style="color:${sectionColor}"><span>${rows.length ? "❌" : "ℹ️"}</span> ${translated("results.failed_diagnosis_title", "Taager Failed Orders Diagnosis")}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="font-size:var(--type-caption);color:var(--text2)">${affiliateHtmlEsc(countText)}${rawCountText ? ` · ${affiliateHtmlEsc(rawCountText)}` : ""}</div>
            ${tableDownloadButton(downloadId)}
            ${tableDownloadButton(rawDownloadId)}
          </div>
        </div>
        ${errorText ? `<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:var(--type-label);color:var(--warning)">${affiliateHtmlEsc(errorText)}</div>` : ""}
        ${!rows.length && rawRowCount ? `<div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:var(--type-label);color:var(--text2)">${affiliateHtmlEsc(translated("results.failed_diagnosis_no_match_body", "Taager failed-order history was downloaded, but none of its rows matched the orders attempted in this run."))}</div>` : ""}
        ${rows.length ? `
        <div class="dash-section-body no-pad" style="overflow-x:auto">
          <table class="orders-preview-table failed-orders-table" style="width:100%;min-width:1320px">
            <colgroup>
              <col style="width:60px">
              <col style="width:170px">
              <col style="width:150px">
              <col style="width:210px">
              <col style="width:80px">
              <col style="width:90px">
              <col style="width:170px">
              <col style="width:170px">
              <col style="width:280px">
              <col style="width:140px">
            </colgroup>
            <thead><tr>
              <th>${t("results.row_col") || "Row"}</th>
              <th>${t("results.customer_name_col")}</th>
              <th>${t("results.phone_col") || "Phone"}</th>
              <th>${t("results.sku") || "SKU"}</th>
              <th>${translated("results.qty_col", "Qty")}</th>
              <th>${translated("results.price_col", "Price")}</th>
              <th>${translated("results.failure_code_col", "Failure Code")}</th>
              <th>${translated("results.failure_reason_col", "Failure Reason")}</th>
              <th>${translated("results.store_order_col", "Store Order")}</th>
              <th>${translated("results.created_at_col", "Created")}</th>
            </tr></thead>
            <tbody>${paged.itemsHtml}</tbody>
          </table>
          ${paged.pagerHtml}
        </div>` : ""}
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
      const missingOrdersUpload = accData.missingOrdersUpload || null;
      const runFailed    = !r.success;
      const failReason   = r.error || "";
      const hasFailed    = failedOrders.count > 0;
      const hasSkipped   = skippedOrders.count > 0;
      const totalInTaager  = getTaagerOrderCount(stats);
      const totalDupes   = (stats.realDupe||0) + (stats.missedDupe||0);
      const recoveryMetrics = recoveryMetricsFor(accData, totalNew, failedOrders);
      const totalAttempt = recoveryMetrics ? recoveryMetrics.attempted : totalNew + failedOrders.count;
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
      const successRateTitle = recoveryMetrics
        ? translated("results.recovery_verification_rate", "Recovery Verification Rate")
        : legacyMissingSubmittedCount > 0
        ? translated("results.submission_success_rate", "Submission Success Rate")
        : t("results.upload_success_rate");
      const successCountText = recoveryMetrics
        ? translated("results.recovery_verified_count", "{count} verified in Taager").replace("{count}", recoveryMetrics.verified)
        : legacyMissingSubmittedCount > 0
        ? successSubtext
        : callTranslation("results.succeeded", (n) => `OK ${n} succeeded`, totalNew);
      const totalAttemptText = recoveryMetrics
        ? translated("results.recovery_total_attempted", "{count} recovery attempted").replace("{count}", recoveryMetrics.attempted)
        : (()=>{const fn=t("results.total_attempted");return typeof fn==="function"?fn(totalAttempt):fn;})();
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
      const uploadedProductsDownloadId = registerTableDownload(products, [
        { header: t("results.product_col"), value: "productName" },
        { header: t("results.orders_col"), value: "count" },
        { header: t("results.total_qty_col"), value: "totalQty" },
      ], `uploaded-orders-${resultAccountTag(r.accountLabel || r.accountId)}`);

      const failTitleFn = t("results.fail_title");
      const failTitle   = typeof failTitleFn === "function" ? failTitleFn(failedOrders.count) : failTitleFn;
      const failedDownloadId = registerFailedOrdersDownload(failedOrders, `failed-orders-${resultAccountTag(r.accountLabel || r.accountId)}`);

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

        ${buildMissingOrdersSnapshotHtml(missingOrdersUpload)}

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
              <span>${totalAttemptText}</span>
              ${recoveryMetrics?.unresolved ? `<span style="color:var(--warning)">⚠️ ${translated("results.recovery_awaiting_count", "{count} awaiting verification").replace("{count}", recoveryMetrics.unresolved)}</span>` : ""}
              ${hasFailed || recoveryMetrics?.failed ? `<span style="color:var(--danger)">❌ ${recoveryMetrics?.failed || failedOrders.count} ${t("results.failed")}</span>` : ""}
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
                <div style="display:flex;gap:8px;align-items:center">
                  <div style="font-size:var(--type-caption);color:var(--text2)">${t("run.click_to_copy")}</div>
                  ${tableDownloadButton(uploadedProductsDownloadId)}
                </div>
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
              ${tableDownloadButton(failedDownloadId)}
              ${failedOrders.failedDir ? `<button id="acc-btn-open-failed-${r.accountId}" class="btn btn-danger" style="font-size:var(--type-caption);padding:5px 12px">${t("results.open_folder")}</button>` : ""}
            </div>
          </div>
        <div class="dash-section-body no-pad">${errorRowsHtml}</div>
      </div>` : `
      ${recoveryMetrics?.previewOnly ? `
      <div class="notice-box warn" style="border-color:var(--warning);background:rgba(255,170,0,0.08)">
        <span class="notice-icon">⚠️</span>
        <div class="notice-text">
          <strong>${translated("results.recovery_preview_only_title", "Recovery preview only - nothing was submitted")}</strong>
          <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${translated("results.recovery_preview_only_body", "{count} recovery orders are ready for review. Turn Auto-Confirm ON and run again to submit them.").replace("{count}", recoveryMetrics.attempted)}</div>
        </div>
      </div>` : recoveryMetrics?.unresolved ? `
      <div class="notice-box warn" style="border-color:var(--warning);background:rgba(255,170,0,0.08)">
        <span class="notice-icon">⚠️</span>
        <div class="notice-text">
          <strong>${translated("results.recovery_pending_title", "Some recovery orders still need verification")}</strong>
          <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${translated("results.recovery_pending_body", "{count} attempted orders were not found in Taager real orders or failed orders yet.").replace("{count}", recoveryMetrics.unresolved)}</div>
        </div>
      </div>` : `
      <div class="notice-box info">
        <span class="notice-icon">✅</span>
        <div class="notice-text">${t("results.all_ok")}</div>
      </div>`}`}

      ${buildRecoveryFailedDiagnosticHtml(accData.affiliateRecovery)}

      ${buildRecoveryUnresolvedHtml(accData.affiliateRecovery)}

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
      setupResultsCollapsibleTables(wrap);
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
  const missingOrdersUpload = data.missingOrdersUpload || null;
  const runFailed    = data._runFailed   || false;
  const failReason   = data._failReason  || "";

  const totalInTaager    = getTaagerOrderCount(stats);
  const totalDupes     = (stats.realDupe     || 0) + (stats.missedDupe     || 0);
  const hasFailed      = failedOrders.count > 0;
  const hasSkipped     = skippedOrders.count > 0;
  const recoveryMetrics = recoveryMetricsFor(data, totalNew, failedOrders);
  const totalUploaded  = recoveryMetrics ? recoveryMetrics.attempted : totalNew + failedOrders.count;
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
  const successRateTitle = recoveryMetrics
    ? translated("results.recovery_verification_rate", "Recovery Verification Rate")
    : legacyMissingSubmittedCount > 0
    ? translated("results.submission_success_rate", "Submission Success Rate")
    : t("results.upload_success_rate");
  const successCountText = recoveryMetrics
    ? translated("results.recovery_verified_count", "{count} verified in Taager").replace("{count}", recoveryMetrics.verified)
    : legacyMissingSubmittedCount > 0
    ? successSubtext
    : callTranslation("results.succeeded", (n) => `OK ${n} succeeded`, totalNew);
  const totalAttemptText = recoveryMetrics
    ? translated("results.recovery_total_attempted", "{count} recovery attempted").replace("{count}", recoveryMetrics.attempted)
    : (()=>{const fn=t("results.total_attempted");return typeof fn==="function"?fn(totalUploaded):fn;})();
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
  const failedDownloadId = registerFailedOrdersDownload(failedOrders, `failed-orders-${resultAccountTag(data._accountLabel)}`);

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
  const uploadedProductsDownloadId = registerTableDownload(products, [
    { header: t("results.product_col"), value: "productName" },
    { header: t("results.orders_col"), value: "count" },
    { header: t("results.total_qty_col"), value: "totalQty" },
  ], `uploaded-orders-${resultAccountTag(data._accountLabel)}`);

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

      ${buildMissingOrdersSnapshotHtml(missingOrdersUpload)}

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
            <span>${totalAttemptText}</span>
            ${recoveryMetrics?.unresolved ? `<span style="color:var(--warning)">⚠️ ${translated("results.recovery_awaiting_count", "{count} awaiting verification").replace("{count}", recoveryMetrics.unresolved)}</span>` : ""}
            ${hasFailed || recoveryMetrics?.failed ? `<span style="color:var(--danger)">❌ ${recoveryMetrics?.failed || failedOrders.count} ${t("results.failed")}</span>` : ""}
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
              <div style="display:flex;gap:8px;align-items:center">
                <div style="font-size:var(--type-caption);color:var(--text2)">${t("run.click_cells_copy")}</div>
                ${tableDownloadButton(uploadedProductsDownloadId)}
              </div>
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
            ${tableDownloadButton(failedDownloadId)}
            ${failedOrders.failedDir ? `<button id="btn-open-failed-folder" class="btn btn-danger" style="font-size:var(--type-caption);padding:5px 12px">${t("results.open_folder")}</button>` : ""}
          </div>
        </div>
        <div class="dash-section-body no-pad">${errorRowsHtml}</div>
      </div>` : `
      ${recoveryMetrics?.previewOnly ? `
      <div class="notice-box warn" style="border-color:var(--warning);background:rgba(255,170,0,0.08)">
        <span class="notice-icon">⚠️</span>
        <div class="notice-text">
          <strong>${translated("results.recovery_preview_only_title", "Recovery preview only - nothing was submitted")}</strong>
          <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${translated("results.recovery_preview_only_body", "{count} recovery orders are ready for review. Turn Auto-Confirm ON and run again to submit them.").replace("{count}", recoveryMetrics.attempted)}</div>
        </div>
      </div>` : recoveryMetrics?.unresolved ? `
      <div class="notice-box warn" style="border-color:var(--warning);background:rgba(255,170,0,0.08)">
        <span class="notice-icon">⚠️</span>
        <div class="notice-text">
          <strong>${translated("results.recovery_pending_title", "Some recovery orders still need verification")}</strong>
          <div style="font-size:var(--type-label);color:var(--text2);margin-top:3px">${translated("results.recovery_pending_body", "{count} attempted orders were not found in Taager real orders or failed orders yet.").replace("{count}", recoveryMetrics.unresolved)}</div>
        </div>
      </div>` : `
      <div class="notice-box info">
        <span class="notice-icon">✅</span>
        <div class="notice-text">${t("results.all_ok")}</div>
      </div>`}`}

      ${buildRecoveryFailedDiagnosticHtml(data.affiliateRecovery)}

      ${buildRecoveryUnresolvedHtml(data.affiliateRecovery)}

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
  setupResultsCollapsibleTables(el);
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
