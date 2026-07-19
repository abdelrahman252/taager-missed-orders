"use strict";

const { SWITCH_TO_OLD_SELECTOR } = require("./missing-orders-upload-flow");
const { parseTaagerFailedOrders } = require("./easy-orders-affiliate-recovery-data");

const SEARCH_BUTTON = "#orders-search-button";
const EXPORT_BUTTON = "#export-to-excel-button";

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

  async function clickDateButton(page, index, label) {
    const buttons = page.locator('button[aria-haspopup="dialog"]');
    const count = await buttons.count().catch(() => 0);
    if (count <= index) {
      const visible = await visibleButtonSummary(page);
      log(`Taager failed orders ${label} date button missing. dialogButtons=${count}, visible=${JSON.stringify(visible)}`);
      throw new Error(`TAAGER_FAILED_ORDERS_DATE_BUTTON_MISSING: ${label}`);
    }
    await buttons.nth(index).click({ timeout: 10000 });
    await page.locator('[role="dialog"] table[role="grid"], [role="dialog"] [data-day]').first()
      .waitFor({ state: "visible", timeout: 10000 });
  }

  async function calendarVisibleMonth(page) {
    return page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('[role="dialog"] [data-day][data-month]'));
      const inside = cells.find((cell) => !cell.hasAttribute("data-outside"));
      return inside ? String(inside.getAttribute("data-month") || "") : "";
    }).catch(() => "");
  }

  async function clickCalendarDate(page, dateText, label) {
    const target = ymd(dateText);
    if (!target) throw new Error(`TAAGER_FAILED_ORDERS_INVALID_DATE: ${label}=${dateText || ""}`);
    const targetMonth = target.slice(0, 7);
    for (let attempt = 0; attempt < 18; attempt++) {
      const day = page.locator(`[role="dialog"] [data-day="${target}"] button:not([disabled])`).first();
      if (await day.isVisible({ timeout: 700 }).catch(() => false)) {
        await day.click({ timeout: 10000 });
        await page.waitForTimeout(400);
        return target;
      }
      const visibleMonth = await calendarVisibleMonth(page);
      const direction = visibleMonth && visibleMonth > targetMonth ? "previous" : "next";
      const navSelector = direction === "previous"
        ? '[role="dialog"] button[aria-label*="Previous"], [role="dialog"] button[aria-label*="Previous Month"]'
        : '[role="dialog"] button[aria-label*="Next"], [role="dialog"] button[aria-label*="Next Month"]';
      const nav = page.locator(navSelector).first();
      if (!(await nav.isVisible({ timeout: 1000 }).catch(() => false))) break;
      await nav.click({ timeout: 10000 });
      await page.waitForTimeout(350);
    }
    throw new Error(`TAAGER_FAILED_ORDERS_DATE_NOT_FOUND: ${label} ${target}`);
  }

  async function selectDate(page, index, value, label) {
    await clickDateButton(page, index, label);
    const selected = await clickCalendarDate(page, value, label);
    log(`Taager failed orders selected ${label}: ${selected}`);
    await page.keyboard.press("Escape").catch(() => {});
    return selected;
  }

  async function setDateFields(page, fromText, toText) {
    const from = await selectDate(page, 0, fromText, "from");
    log(`Taager failed orders: leaving to date empty, matching normal Taager orders export behavior.`);
    emit("taager.failed-orders.date-range", "ok", `${from} -> open-ended`);
    return { from, to: "" };
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
    page = await openLegacyFailedOrders(page);
    await setDateFields(page, fromText, toText);
    await clickSearch(page);

    const exportButton = page.locator(EXPORT_BUTTON).first();
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
    exportFailedOrders,
    setDateFields,
  };
}

module.exports = {
  createTaagerFailedOrdersExportFlow,
  SEARCH_BUTTON,
  EXPORT_BUTTON,
};
