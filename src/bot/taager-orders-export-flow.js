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
    const controller = new AbortController();
    let timer = null;
    let timedOut = false;
    const operation = Promise.resolve().then(() => fn(controller.signal));
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          const error = new Error(`TAAGER_STEP_TIMEOUT: ${label} exceeded ${timeoutMs}ms`);
          error.code = "TAAGER_STEP_TIMEOUT";
          reject(error);
        }, timeoutMs);
      });
    return Promise.race([operation, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
      // A timed-out picker may still be unwinding a bounded Playwright action.
      // Attach a rejection handler so its late failure cannot become an
      // unhandled rejection while the retry flow is recovering the page.
      if (timedOut) operation.catch(() => {});
    });
  }

  function classifyExportError(error) {
    const message = String(error && error.message || error || "");
    if (/Target page, context or browser has been closed|browser.*closed|page.*closed|page.*crashed|browser.*disconnected/i.test(message)) {
      return "TAAGER_BROWSER_CRASH";
    }
    if (/TAAGER_STEP_TIMEOUT|date range selection|calendar|date picker/i.test(message)) {
      return "TAAGER_DATE_RANGE_FAILED";
    }
    if (/download/i.test(message)) return "TAAGER_DOWNLOAD_FAILED";
    if (/net::|timeout|internet|connection/i.test(message)) return "TAAGER_NETWORK_ERROR";
    return "TAAGER_EXPORT_FAILED";
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
      (signal) => pickDateRange(page, dateFrom, dateTo, signal)
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
    // Keep a cookie snapshot so a download can be recovered independently if
    // Chrome closes immediately after emitting the download event.
    const downloadCookies = await page.context().cookies().catch(() => []);
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
    const buffer = await readDownloadToBuffer(download, {
      cookies: downloadCookies,
      url: typeof download.url === "function" ? download.url() : "",
    });
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
    const errorType = classifyExportError(lastError);
    throw new Error(`${errorType}: ${finalErrorPrefix} after ${maxAttempts} attempts. Last error: ${lastError ? lastError.message : "unknown error"}`);
  }

  return {
    exportOrders,
    exportAttempt,
  };
}

module.exports = {
  createTaagerOrdersExportFlow,
};
