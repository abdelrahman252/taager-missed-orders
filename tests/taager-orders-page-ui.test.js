"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const {
  TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR,
  TAAGER_EXPORT_BUTTON_SELECTOR,
  createCurrentTaagerOrdersDatePicker,
} = require("../src/bot/taager-orders-page-ui");

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

(async () => {
  const executablePath = findChrome();
  assert(executablePath, "Google Chrome is required for the Taager current UI regression test");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <button id="orders-date-pill" onclick="document.querySelector('#date-filter').hidden = false">التاريخ</button>
      <div id="date-filter" role="dialog" hidden>
        <label>من <button id="date-from" aria-haspopup="dialog" onclick="window.activeDateField = 'from'; window.clickedFrom++">اختيار</button></label>
        <label>إلى <button id="date-to" aria-haspopup="dialog" onclick="window.activeDateField = 'to'; window.clickedTo++">اختيار</button></label>
        <button id="orders-date-apply" disabled onclick="window.applyCount++; document.querySelector('#date-filter').hidden = true">تطبيق</button>
      </div>
      <input id="orders-search-input" />
      <button id="orders-export-excel-button">تصدير</button>
      <script>window.activeDateField = ''; window.applyCount = 0; window.clickedFrom = 0; window.clickedTo = 0;</script>`);

    assert.strictEqual(
      await page.locator(TAAGER_ORDERS_SEARCH_BUTTON_SELECTOR).first().getAttribute("id"),
      "orders-date-pill",
      "the current date filter should satisfy orders-page readiness without a Search button"
    );
    assert.strictEqual(
      await page.locator(TAAGER_EXPORT_BUTTON_SELECTOR).count(),
      1,
      "the current Taager export button should be matched by its stable id"
    );

    const selectedDates = [];
    const picker = createCurrentTaagerOrdersDatePicker({
      clearInterruption: async () => {},
      safeClick: async (targetPage, selector) => targetPage.locator(selector).first().click(),
      pickDateInCalendar: async (targetPage, date) => {
        const dateText = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
        selectedDates.push(dateText);
        // Match Taager's actual pill, including bidi controls, comma, and the
        // open-ended range marker: "15 سبتمبر, 2026 ← …".
        await targetPage.locator("#orders-date-pill").evaluate((button) => {
          button.textContent = "\u200f15 سبتمبر, 2026 ← …\u200f";
        });
        await targetPage.locator("#orders-date-apply").evaluate((button) => { button.disabled = false; });
      },
      formatDataDay: (date) => date.toISOString().slice(0, 10),
    });

    const result = await picker.pickDateRange(
      page,
      new Date(2026, 8, 15),
      new Date("2026-09-25T00:00:00.000Z"),
      null
    );
    const state = await page.evaluate(() => ({
      activeDateField: window.activeDateField,
      clickedFrom: window.clickedFrom,
      clickedTo: window.clickedTo,
      applyCount: window.applyCount,
    }));
    assert.deepStrictEqual(selectedDates, ["2026-09-15"], "only the requested From date should be selected");
    assert.deepStrictEqual(state, { activeDateField: "from", clickedFrom: 1, clickedTo: 0, applyCount: 1 }, "the current date filter should apply From once without touching To");
    assert.deepStrictEqual(result, { uiVersion: "current", skipSearch: true }, "the current UI applies its filter directly without a Search button");

    console.log("Taager orders current UI regression test passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
