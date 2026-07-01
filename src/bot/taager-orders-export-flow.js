"use strict";

function createTaagerOrdersExportFlow(options = {}) {
  const log = typeof options.log === "function" ? options.log : () => {};
  const emitStage = typeof options.emitStage === "function" ? options.emitStage : () => {};
  const formatDataDay = options.formatDataDay;
  const clearTaagerInterruption = options.clearTaagerInterruption;
  const waitForTaagerTarget = options.waitForTaagerTarget;
  const safeTaagerClick = options.safeTaagerClick;
  const pickDateRange = options.pickDateRange;
  const gotoOrders = options.gotoOrders;
  const stabilizeBeforeDateRange = options.stabilizeBeforeDateRange;
  const recoverForRetry = options.recoverForRetry;
  const readDownloadToBuffer = options.readDownloadToBuffer;
  const maxAttempts = Number(options.maxAttempts || 3);
  const flow = options.flow || "runner";
  const finalErrorPrefix = options.finalErrorPrefix || "Taager orders export failed";
  const selectors = {
    searchButton: options.searchButtonSelector,
    searchEnabled: options.searchEnabledSelector,
    exportButton: options.exportButtonSelector,
  };

  function stage(stage, status, message, extra = {}) {
    emitStage({ type: "stage", flow, stage, status, message, ...extra });
  }

  async function withTaagerFlowTimeout(label, timeoutMs, fn) {
    let timer = null;
    return Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`TAAGER_STEP_TIMEOUT: ${label} exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async function exportAttempt(page, dateFrom, dateTo, attempt) {
    stage("taager.orders.attempt", "started", `Attempt ${attempt}/${maxAttempts}`);
    log(`Taager orders export attempt ${attempt}/${maxAttempts}: starting`);

    stage("taager.orders.navigate", "started", "Opening Taager orders page");
    page = await gotoOrders(page, { attempt, maxAttempts });
    stage("taager.orders.navigate", "ok", "Orders page navigation verified");
    log(`Taager orders export attempt ${attempt}/${maxAttempts}: /orders navigation verified`);

    await clearTaagerInterruption(page, { log }).catch(() => {});
    stage("taager.orders.ready", "started", "Waiting for orders controls");
    log(`Taager orders export attempt ${attempt}/${maxAttempts}: waiting for orders controls`);
    await waitForTaagerTarget(page, selectors.searchButton, "Taager orders page ready", {
      timeout: 15000,
      blockingOverlayTimeout: 5000,
      log,
    });
    stage("taager.orders.ready", "ok", "Orders controls are visible");

    if (attempt === 1 && typeof stabilizeBeforeDateRange === "function") {
      stage("taager.orders.stabilize", "started", "Reloading orders page before date selection");
      log(`Taager orders export attempt ${attempt}/${maxAttempts}: stabilization reload before date selection`);
      page = await stabilizeBeforeDateRange(page, { attempt, maxAttempts }) || page;
      stage("taager.orders.stabilize", "ok", "Orders page stabilized before date selection");
      log(`Taager orders export attempt ${attempt}/${maxAttempts}: stabilization reload complete`);
    }

    const fromText = formatDataDay(dateFrom);
    const toText = formatDataDay(dateTo);
    stage("taager.orders.date-range", "started", `${fromText} -> ${toText}`);
    log(`Taager export from: ${fromText} to ${toText} (attempt ${attempt}/${maxAttempts})`);
    const dateRangeResult = await withTaagerFlowTimeout(
      "Taager orders date range selection",
      Number(options.dateRangeTimeout || 20000),
      () => pickDateRange(page, dateFrom, dateTo)
    );
    const uiVersion = dateRangeResult && dateRangeResult.uiVersion ? dateRangeResult.uiVersion : "old";
    stage("taager.orders.date-range", "ok", `Date range selected using ${uiVersion} UI`);
    log(`Taager orders export attempt ${attempt}/${maxAttempts}: using ${uiVersion} UI`);

    if (dateRangeResult && dateRangeResult.skipSearch) {
      stage("taager.orders.search", "ok", "Date filter applied by new UI");
      log(`Taager orders export attempt ${attempt}/${maxAttempts}: new UI already applied date filter; skipping search button`);
      await page.waitForTimeout(500);
    } else {
      stage("taager.orders.search", "started", "Clicking search");
      log(`Taager orders export attempt ${attempt}/${maxAttempts}: clicking search`);
      await safeTaagerClick(page, selectors.searchEnabled, "Taager orders search button", {
        timeout: 15000,
        log,
      });
      log(`Taager orders export attempt ${attempt}/${maxAttempts}: waiting for search results/filter completion`);
      await waitForTaagerTarget(page, selectors.searchEnabled, "Taager orders search button after filter", {
        timeout: 30000,
        blockingOverlayTimeout: 5000,
        log,
      });
      await page.waitForTimeout(500);
      stage("taager.orders.search", "ok", "Search/filter finished");
    }

    stage("taager.orders.export", "started", "Waiting for export button");
    log("Downloading Taager orders...");
    log(`Taager orders export attempt ${attempt}/${maxAttempts}: waiting for export button`);
    await waitForTaagerTarget(page, selectors.exportButton, "Taager export button", {
      timeout: 30000,
      log,
    });
    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    log(`Taager orders export attempt ${attempt}/${maxAttempts}: clicking export`);
    await safeTaagerClick(page, selectors.exportButton, "Taager export button", {
      timeout: 30000,
      clickTimeout: 5000,
      noWaitAfter: true,
      log,
    });
    stage("taager.orders.download", "started", "Waiting for download event");
    const download = await downloadPromise;
    const buffer = await readDownloadToBuffer(download);
    log(`Taager orders downloaded: ${buffer.length} bytes`);
    stage("taager.orders.download", "ok", `Downloaded ${buffer.length} bytes`, { bytes: buffer.length });
    return buffer;
  }

  async function exportOrders(page, dateFrom, dateTo) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await exportAttempt(page, dateFrom, dateTo, attempt);
      } catch (error) {
        lastError = error;
        stage("taager.orders.retry", attempt >= maxAttempts ? "failed" : "retry", error.message || String(error), {
          attempt,
          maxAttempts,
        });
        if (attempt >= maxAttempts) break;
        page = await recoverForRetry(page, error, attempt, maxAttempts);
      }
    }
    throw new Error(`${finalErrorPrefix} after ${maxAttempts} attempts. Last error: ${lastError ? lastError.message : "unknown error"}`);
  }

  return {
    exportOrders,
    exportAttempt,
  };
}

module.exports = {
  createTaagerOrdersExportFlow,
};
