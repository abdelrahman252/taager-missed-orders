"use strict";

const { SWITCH_TO_OLD_SELECTOR } = require("./missing-orders-upload-flow");
const { parseTaagerFailedOrders } = require("./easy-orders-affiliate-recovery-data");

const SEARCH_BUTTON = "#orders-search-button";
const EXPORT_BUTTON = "#export-to-excel-button";
const CURRENT_DATE_FILTER = "#failed-orders-date-pill";
const CURRENT_DATE_PANEL = '[role="dialog"]:has(#failed-orders-date-apply)';
const CURRENT_DATE_APPLY = "#failed-orders-date-apply:not([disabled])";
const CURRENT_EXPORT_BUTTON = "#failed-orders-export-excel-button";

function createTaagerFailedOrdersExportFlow(options = {}) {
  const log = typeof options.log === "function" ? options.log : () => {};
  const stage = typeof options.stage === "function" ? options.stage : () => {};
  const goto = typeof options.goto === "function" ? options.goto : async (page, pathOrUrl) => {
    await page.goto(pathOrUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    return page;
  };
  const readDownloadToBuffer = typeof options.readDownloadToBuffer === "function" ? options.readDownloadToBuffer : null;
  const country = options.country || "sa";

  function emit(stageName, status, message, extra = {}) {
    stage(stageName, status, message, extra);
  }

  function ymd(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return ymd(parsed);
    return "";
  }

  async function visibleButtonSummary(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll("button"))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((button) => ({
        id: button.id || "",
        text: String(button.innerText || button.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
        aria: button.getAttribute("aria-label") || "",
        hasDialog: button.getAttribute("aria-haspopup") || "",
      }))
      .slice(0, 40)).catch(() => []);
  }

  async function isCurrentFailedOrdersPage(page) {
    return Promise.all([
      page.locator(CURRENT_DATE_FILTER).first().isVisible({ timeout: 1000 }).catch(() => false),
      page.locator(CURRENT_EXPORT_BUTTON).first().isVisible({ timeout: 1000 }).catch(() => false),
    ]).then(([dateFilter, exportButton]) => dateFilter && exportButton);
  }

  async function openLegacyFailedOrders(page) {
    emit("taager.failed-orders.navigate", "started", "Opening Taager legacy failed orders");
    page = await goto(page, "/orders");
    const switchButton = page.locator(SWITCH_TO_OLD_SELECTOR).first();
    if (await switchButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      log("Taager failed orders: switching to old layout");
      await switchButton.click({ timeout: 10000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    page = await goto(page, "/orders/legacy#failed-orders");
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const ready = await page.locator(`${SEARCH_BUTTON}, ${EXPORT_BUTTON}`).first()
      .isVisible({ timeout: 20000 }).catch(() => false);
    if (!ready) {
      const buttons = await visibleButtonSummary(page);
      log(`Taager failed orders page controls not ready. Visible buttons: ${JSON.stringify(buttons)}`);
      throw new Error("TAAGER_FAILED_ORDERS_PAGE_NOT_READY: search/export controls were not visible");
    }
    emit("taager.failed-orders.navigate", "ok", "Legacy failed orders page opened");
    return page;
  }

  async function openFailedOrders(page) {
    emit("taager.failed-orders.navigate", "started", "Opening Taager failed orders");
    page = await goto(page, "/orders/failed-orders");
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.locator(`${CURRENT_DATE_FILTER}, ${CURRENT_EXPORT_BUTTON}`).first()
      .waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    if (await isCurrentFailedOrdersPage(page)) {
      emit("taager.failed-orders.navigate", "ok", "Current failed-orders page opened");
      return page;
    }

    log("Taager current failed-orders controls were not ready; attempting the supported legacy page fallback.");
    const controls = await visibleButtonSummary(page);
    log(`Taager current failed-orders page controls not ready. Visible buttons: ${JSON.stringify(controls)}`);
    page = await openLegacyFailedOrders(page);
    return page;
  }

  async function clickDateButton(page, index, label) {
    const buttons = page.locator('button[aria-haspopup="dialog"]');
    const count = await buttons.count().catch(() => 0);
    if (count <= index) {
      const visible = await visibleButtonSummary(page);
      log(`Taager failed orders ${label} date button missing. dialogButtons=${count}, visible=${JSON.stringify(visible)}`);
      throw new Error(`TAAGER_FAILED_ORDERS_DATE_BUTTON_MISSING: ${label}`);
    }
    await clickCalendarControl(buttons.nth(index), `date ${label}`);
    await page.locator('[role="dialog"] table[role="grid"], [role="dialog"] [data-day]').first()
      .waitFor({ state: "visible", timeout: 10000 });
  }

  async function clickCalendarControl(locator, label) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await locator.waitFor({ state: "visible", timeout: 2500 });
        await locator.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
        await locator.click({ timeout: 2500 });
        return;
      } catch (error) {
        lastError = error;
        // EasyOrders/Taager's calendar can detach the button during the month
        // transition. Re-resolve the locator and use a DOM click after bringing
        // the fresh element into view instead of waiting on Playwright's full
        // action timeout.
        const clicked = await locator.evaluate((element) => {
          if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
          element.scrollIntoView({ block: "center", inline: "nearest" });
          element.click();
          return true;
        }).catch(() => false);
        if (clicked) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    throw new Error(`TAAGER_FAILED_ORDERS_CALENDAR_CLICK_FAILED: ${label}: ${lastError && lastError.message || "unknown calendar click error"}`);
  }

  async function clickMonthNav(page, direction) {
    const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
    const exactSelector = direction === "previous"
      ? 'button[name="previous-month"], button[aria-label*="Previous Month"], button[aria-label*="Previous"], button[aria-label*="السابق"]'
      : 'button[name="next-month"], button[aria-label*="Next Month"], button[aria-label*="Next"], button[aria-label*="التالي"]';
    const exact = visibleDialog.locator(exactSelector).first();
    if ((await exact.count()) > 0) {
      await clickCalendarControl(exact, `${direction} month`);
      return;
    }

    const navButtons = visibleDialog.locator("nav button");
    const count = await navButtons.count().catch(() => 0);
    if (count >= 2) {
      await clickCalendarControl(
        direction === "previous" ? navButtons.first() : navButtons.nth(count - 1),
        `${direction} month fallback`
      );
      return;
    }

    throw new Error(`TAAGER_FAILED_ORDERS_MONTH_NAV_NOT_FOUND: ${direction}`);
  }

  async function clickCalendarDate(page, dateText, label) {
    const target = ymd(dateText);
    if (!target) throw new Error(`TAAGER_FAILED_ORDERS_INVALID_DATE: ${label}=${dateText || ""}`);
    for (let attempt = 0; attempt < 24; attempt++) {
      const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
      const day = visibleDialog
        .locator(`[role="gridcell"][data-day="${target}"]:not([data-outside]):not([data-disabled]) button:not([disabled])`)
        .first();
      if ((await day.count()) > 0) {
        await clickCalendarControl(day, `date ${label} ${target}`);
        await page.waitForTimeout(400);
        return target;
      }

      const inMonthCells = visibleDialog.locator('[role="gridcell"][data-day]:not([data-outside])');
      const cellCount = await inMonthCells.count();
      const firstCell = cellCount ? await inMonthCells.first().getAttribute("data-day") : null;
      const lastCell = cellCount ? await inMonthCells.last().getAttribute("data-day") : null;
      if (!firstCell || !lastCell) break;

      const goBack = target < firstCell;
      if (!goBack && target <= lastCell) break;
      await clickMonthNav(page, goBack ? "previous" : "next");
      await page.waitForTimeout(350);
    }
    const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
    const disabledTarget = await visibleDialog
      .locator(`[role="gridcell"][data-day="${target}"][data-disabled], [role="gridcell"][data-day="${target}"] button[disabled]`)
      .count().catch(() => 0);
    if (disabledTarget > 0) throw new Error(`TAAGER_FAILED_ORDERS_DATE_DISABLED: ${label} ${target}`);
    throw new Error(`TAAGER_FAILED_ORDERS_DATE_NOT_FOUND: ${label} ${target}`);
  }

  async function selectDate(page, index, value, label) {
    await clickDateButton(page, index, label);
    const selected = await clickCalendarDate(page, value, label);
    log(`Taager failed orders selected ${label}: ${selected}`);
    await page.keyboard.press("Escape").catch(() => {});
    return selected;
  }

  function calendarLabels(dateText) {
    const date = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(date.getTime())) return [];
    return [
      date.toLocaleDateString("ar-SA-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    ];
  }

  function calendarMonthIndex(statusText, referenceYear) {
    const normalizedStatus = String(statusText || "").replace(/[،,]/g, " ").replace(/\s+/g, " ").trim();
    for (let year = referenceYear - 5; year <= referenceYear + 5; year++) {
      for (let month = 0; month < 12; month++) {
        const date = new Date(year, month, 1);
        const labels = [
          date.toLocaleDateString("ar-SA-u-nu-latn", { month: "long", year: "numeric" }),
          date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        ];
        if (labels.some((label) => normalizedStatus.includes(label))) return year * 12 + month;
      }
    }
    return null;
  }

  async function readCalendarMonthText(visibleDialog, referenceYear) {
    const selectors = [
      '[role="status"]',
      '[aria-live="polite"]',
      'caption',
      'table[aria-label]',
      '[role="grid"][aria-label]',
      '[role="heading"]',
      'h1, h2, h3',
    ];

    for (const selector of selectors) {
      const candidate = visibleDialog.locator(selector).first();
      if (!(await candidate.count().catch(() => 0))) continue;
      const ariaLabel = await candidate.getAttribute("aria-label").catch(() => "");
      const text = ariaLabel || await candidate.innerText().catch(() => "");
      if (calendarMonthIndex(text, referenceYear) !== null) return text;
    }

    return "";
  }

  async function clickCurrentCalendarDate(page, dateText, label) {
    const target = ymd(dateText);
    if (!target) throw new Error(`TAAGER_FAILED_ORDERS_INVALID_DATE: ${label}=${dateText || ""}`);
    const targetDate = new Date(`${target}T00:00:00`);
    const targetMonth = targetDate.getFullYear() * 12 + targetDate.getMonth();
    const ariaLabels = calendarLabels(target);
    const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
    await visibleDialog.waitFor({ state: "visible", timeout: 10000 });
    // The dialog shell can appear before DayPicker fills its month and days.
    await visibleDialog.locator('[role="gridcell"] button[aria-label], td button[aria-label]').first()
      .waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

    let unreadableReads = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      const inMonthCells = visibleDialog.locator('[role="gridcell"][data-day]:not([data-outside])');
      const cellCount = await inMonthCells.count();
      const firstCell = cellCount ? await inMonthCells.first().getAttribute("data-day") : null;
      const lastCell = cellCount ? await inMonthCells.last().getAttribute("data-day") : null;
      if (firstCell && lastCell) {
        if (target >= firstCell && target <= lastCell) {
          const day = visibleDialog.locator(`[role="gridcell"][data-day="${target}"]:not([data-disabled]) button:not([disabled])`).first();
          if (await day.count()) {
            await clickCalendarControl(day, `date ${label} ${target}`);
            await page.waitForTimeout(250);
            return target;
          }
          break;
        }
        await clickMonthNav(page, target < firstCell ? "previous" : "next");
        await page.waitForTimeout(300);
        continue;
      }

      const exactLabelSelector = ariaLabels.map((aria) => `button[aria-label="${aria.replace(/"/g, '\\"')}"]`).join(", ");
      // Taager's current calendar renders native table cells in some locales;
      // those buttons do not have a [role="gridcell"] ancestor.
      const day = visibleDialog.locator(exactLabelSelector).first();
      if (await day.count()) {
        await clickCalendarControl(day, `date ${label} ${target}`);
        await page.waitForTimeout(250);
        return target;
      }

      const statusText = await readCalendarMonthText(visibleDialog, targetDate.getFullYear());
      const displayedMonth = calendarMonthIndex(statusText, targetDate.getFullYear());
      if (displayedMonth === null) {
        if (++unreadableReads < 8) {
          await page.waitForTimeout(250);
          continue;
        }
        throw new Error(`TAAGER_FAILED_ORDERS_CALENDAR_MONTH_UNREADABLE: ${label} ${target}`);
      }
      if (displayedMonth === targetMonth) break;
      await clickMonthNav(page, displayedMonth > targetMonth ? "previous" : "next");
      await page.waitForTimeout(250);
    }

    const exactLabelSelector = ariaLabels.map((aria) => `button[aria-label="${aria.replace(/"/g, '\\"')}"]`).join(", ");
    const day = visibleDialog.locator(exactLabelSelector).first();
    if (await day.count()) {
      await clickCalendarControl(day, `date ${label} ${target}`);
      await page.waitForTimeout(250);
      return target;
    }
    throw new Error(`TAAGER_FAILED_ORDERS_DATE_NOT_FOUND: ${label} ${target}`);
  }

  async function setCurrentDateRange(page, fromText, toText) {
    const from = ymd(fromText);
    const to = ymd(toText);
    if (!from || (toText && !to)) throw new Error("TAAGER_FAILED_ORDERS_INVALID_DATE_RANGE");
    if (to && from > to) throw new Error("TAAGER_FAILED_ORDERS_INVALID_DATE_RANGE: from is after to");

    await page.locator(CURRENT_DATE_FILTER).first().click({ timeout: 5000 }).catch(async () => {
      await page.locator(CURRENT_DATE_FILTER).first().evaluate((element) => element.click());
    });
    const panel = page.locator(CURRENT_DATE_PANEL).last();
    await panel.waitFor({ state: "visible", timeout: 5000 });
    const fields = panel.locator('button[aria-haspopup="dialog"]');
    if (await fields.count() < 1) throw new Error("TAAGER_FAILED_ORDERS_DATE_FIELDS_MISSING");

    await clickCalendarControl(fields.nth(0), "failed-orders from date field");
    await clickCurrentCalendarDate(page, from, "from");
    // Taager's current failed-orders filter treats selecting an end date as a
    // bounded range, which can produce an empty result set. Keep its To/إلى
    // field untouched and apply only the requested From/من date.

    const apply = page.locator(CURRENT_DATE_APPLY).last();
    if (!(await apply.isVisible({ timeout: 3000 }).catch(() => false))) {
      throw new Error("TAAGER_FAILED_ORDERS_DATE_APPLY_DISABLED: exact date range was not accepted");
    }
    await clickCalendarControl(apply, "apply failed-orders date range");
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    log(`Taager failed orders applied from date ${from}; To/إلى left unchanged`);
    emit("taager.failed-orders.date-range", "ok", `${from} -> open-ended`);
    return { from, to: "" };
  }

  async function setDateFields(page, fromText, toText) {
    if (await isCurrentFailedOrdersPage(page)) return setCurrentDateRange(page, fromText, toText);
    const from = await selectDate(page, 0, fromText, "from");
    const to = toText ? await selectDate(page, 1, toText, "to") : "";
    log(`Taager failed orders selected exact date range: ${from}${to ? ` -> ${to}` : " -> open-ended"}`);
    emit("taager.failed-orders.date-range", "ok", `${from} -> ${to || "open-ended"}`);
    return { from, to };
  }

  async function clickSearch(page) {
    const search = page.locator(SEARCH_BUTTON).first();
    if (!(await search.isVisible({ timeout: 15000 }).catch(() => false))) {
      const visible = await visibleButtonSummary(page);
      log(`Taager failed orders search button missing. Visible buttons: ${JSON.stringify(visible)}`);
      throw new Error("TAAGER_FAILED_ORDERS_SEARCH_BUTTON_NOT_VISIBLE");
    }
    await search.click({ timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    emit("taager.failed-orders.search", "ok", "Failed-orders search applied");
  }

  async function downloadToBuffer(download) {
    if (readDownloadToBuffer) return readDownloadToBuffer(download);
    const stream = await download.createReadStream();
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  async function exportFailedOrders(page, fromText, toText) {
    page = await openFailedOrders(page);
    await setDateFields(page, fromText, toText);
    const currentUi = await isCurrentFailedOrdersPage(page);
    if (!currentUi) await clickSearch(page);

    const exportButton = page.locator(currentUi ? CURRENT_EXPORT_BUTTON : EXPORT_BUTTON).first();
    if (!(await exportButton.isVisible({ timeout: 20000 }).catch(() => false))) {
      const visible = await visibleButtonSummary(page);
      log(`Taager failed orders export button missing. Visible buttons: ${JSON.stringify(visible)}`);
      return { buffer: null, rows: [], error: "failed_orders_export_button_not_visible" };
    }
    const downloadPromise = page.waitForEvent("download", { timeout: 90000 });
    await exportButton.click({ timeout: 10000, noWaitAfter: true });
    emit("taager.failed-orders.download", "started", "Waiting for failed-orders Excel download");
    const download = await downloadPromise;
    const buffer = await downloadToBuffer(download);
    const rows = parseTaagerFailedOrders(buffer, country);
    log(`Taager failed orders downloaded: ${buffer.length} bytes, parsed rows=${rows.length}`);
    emit("taager.failed-orders.download", "ok", `Failed orders downloaded: ${rows.length} rows`, { rows: rows.length });
    return { buffer, rows, error: "" };
  }

  return {
    openLegacyFailedOrders,
    openFailedOrders,
    exportFailedOrders,
    setDateFields,
  };
}

module.exports = {
  createTaagerFailedOrdersExportFlow,
  SEARCH_BUTTON,
  EXPORT_BUTTON,
};
