"use strict";

const CURRENT_ORDERS_DATE_FILTER = "#orders-date-pill";
const CURRENT_ORDERS_DATE_APPLY = "#orders-date-apply:not([disabled])";
const CURRENT_ORDERS_DATE_PANEL = '[role="dialog"]:has(#orders-date-apply)';

const TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR = [
  CURRENT_ORDERS_DATE_FILTER,
  "#orders-search-input",
  "#orders-export-excel-button",
  "#orders-v2-date-pill",
  "#orders-search-button",
  'button:has-text("Search")',
  'button:has-text("بحث")',
].join(", ");

const TAAGER_ORDERS_SEARCH_ENABLED_SELECTOR = [
  "#orders-search-button:not([disabled])",
  'button:has-text("Search"):not([disabled])',
  'button:has-text("بحث"):not([disabled])',
].join(", ");

const TAAGER_EXPORT_BUTTON_SELECTOR = [
  "#orders-export-excel-button",
  "#export-to-excel-button",
  'button:has-text("Export")',
  'button:has-text("Excel")',
  'button:has-text("تصدير")',
  'button:has-text("إكسل")',
  'button:has-text("اكسل")',
].join(", ");

function createCurrentTaagerOrdersDatePicker(options = {}) {
  const log = typeof options.log === "function" ? options.log : () => {};
  const clearInterruption = typeof options.clearInterruption === "function"
    ? options.clearInterruption
    : async () => {};
  const safeClick = typeof options.safeClick === "function"
    ? options.safeClick
    : async (page, selector) => page.locator(selector).first().click();
  const pickDateInCalendar = options.pickDateInCalendar;
  const formatDataDay = options.formatDataDay;

  function normalizeDateText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      // Strip bidi controls, punctuation and spacing. Taager's Arabic pill
      // may include commas, directional marks, and an open-ended range marker.
      .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gi, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  }

  function expectedDateLabels(date) {
    const options = { day: "numeric", month: "long", year: "numeric" };
    return [
      formatDataDay(date),
      // Force the Gregorian calendar: ar-SA by itself can use Umm al-Qura,
      // which produces a different year and can never match Taager's pill.
      date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", options),
      date.toLocaleDateString("ar-SA-u-ca-gregory", options),
      date.toLocaleDateString("en-US", options),
    ].map(normalizeDateText).filter(Boolean);
  }

  async function isAvailable(page) {
    return page.locator(CURRENT_ORDERS_DATE_FILTER).first()
      .isVisible({ timeout: 1000 })
      .catch(() => false);
  }

  async function clickDateField(page, kind) {
    const panel = page.locator(CURRENT_ORDERS_DATE_PANEL).last();
    await page.locator("#orders-date-apply").waitFor({ state: "visible", timeout: 5000 });
    const dateFields = panel.locator('button[aria-haspopup="dialog"]');
    const fieldCount = await dateFields.count();
    if (fieldCount < 2) {
      throw new Error(`TAAGER_DATE_BUTTON_MISSING: current orders date filter exposes ${fieldCount} date fields`);
    }
    const field = dateFields.nth(kind === "from" ? 0 : 1);
    if (!await field.isVisible({ timeout: 2000 }).catch(() => false)) {
      throw new Error(`TAAGER_DATE_BUTTON_MISSING: current orders ${kind}-date field is not visible`);
    }
    await clearInterruption(page, `orders-date-${kind}-button`);
    await field.click({ timeout: 5000 }).catch(async () => {
      await field.evaluate((element) => element.click());
    });
  }

  async function pickDateRange(page, dateFrom, dateTo, signal) {
    if (typeof pickDateInCalendar !== "function" || typeof formatDataDay !== "function") {
      throw new Error("TAAGER_DATE_PICKER_UNAVAILABLE: current orders date-picker dependencies are missing");
    }
    const dateFilter = page.locator(CURRENT_ORDERS_DATE_FILTER).first();
    if (!await isAvailable(page)) {
      throw new Error("TAAGER_DATE_FILTER_MISSING: current orders date filter is not visible");
    }

    log("Taager orders date picker: using current orders-date UI");
    await clearInterruption(page, "orders-date-filter");
    await dateFilter.click({ timeout: 5000 }).catch(async () => {
      await dateFilter.evaluate((element) => element.click());
    });
    await page.locator("#orders-date-apply").waitFor({ state: "visible", timeout: 5000 });

    await clickDateField(page, "from");
    await pickDateInCalendar(page, dateFrom, signal);
    await page.waitForTimeout(250);

    // The current Taager UI returns empty/incomplete exports when its To/إلى
    // field is explicitly selected. Its default open-ended value is intentional.
    // Keep dateTo in the signature for older callers, but never interact with To.

    await safeClick(page, CURRENT_ORDERS_DATE_APPLY, "Taager orders current UI apply button", {
      timeout: 10000,
      log,
    });
    await page.locator(CURRENT_ORDERS_DATE_PANEL).last().waitFor({ state: "hidden", timeout: 10000 })
      .catch((error) => {
        throw new Error(`TAAGER_DATE_APPLY_NOT_CONFIRMED: filter panel stayed open after Apply: ${error.message}`);
      });
    const activeFilterText = await dateFilter.innerText().catch(() => "");
    const normalizedFilterText = normalizeDateText(activeFilterText);
    if (!expectedDateLabels(dateFrom).some((label) => normalizedFilterText.includes(label))) {
      throw new Error(`TAAGER_DATE_APPLY_NOT_CONFIRMED: expected From ${formatDataDay(dateFrom)}, active filter shows "${String(activeFilterText).trim()}"`);
    }
    await page.waitForTimeout(500);
    log(`Taager orders date picker: applied and verified From ${formatDataDay(dateFrom)}; To/إلى left unchanged`);
    return { uiVersion: "current", skipSearch: true };
  }

  return { isAvailable, pickDateRange };
}

module.exports = {
  CURRENT_ORDERS_DATE_FILTER,
  CURRENT_ORDERS_DATE_APPLY,
  CURRENT_ORDERS_DATE_PANEL,
  TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR,
  TAAGER_ORDERS_SEARCH_ENABLED_SELECTOR,
  TAAGER_EXPORT_BUTTON_SELECTOR,
  createCurrentTaagerOrdersDatePicker,
};
