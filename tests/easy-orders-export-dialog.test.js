"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const {
  closeExportDatePicker,
  clickExportDialogSubmit,
  waitForExportOrdersDialog,
} = require("../src/bot/easy-orders-export-dialog");

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
  assert(executablePath, "Google Chrome is required for the export dialog selector regression test");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <button class="MuiButton-outlined" id="page-export" onclick="window.openerClicks++">Export</button>
      <div role="presentation">
        <div role="dialog" aria-labelledby="export-title" aria-modal="true">
          <h2 id="export-title">Export Orders</h2>
          <input id="start-date" type="text" value="09/25/2026">
          <div class="MuiDialogActions-root"><button class="MuiButton-text" id="modal-export" onclick="window.modalClicks++; document.querySelector('[role=dialog][aria-labelledby=export-title]').remove()">Export</button></div>
        </div>
      </div>
      <div class="react-datepicker" role="dialog" aria-label="Choose Date">Calendar</div>
      <script>
        window.openerClicks = 0;
        window.modalClicks = 0;
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') document.querySelector('.react-datepicker')?.remove();
        });
      </script>`);

    const dialog = await waitForExportOrdersDialog(page, "orders");
    assert.strictEqual(await dialog.isVisible(), true, "the Export Orders modal should be selected despite a second date-picker dialog");
    await closeExportDatePicker(page, "orders");
    await clickExportDialogSubmit(page, dialog, "orders");

    const state = await page.evaluate(() => ({
      openerClicks: window.openerClicks,
      modalClicks: window.modalClicks,
      pickerPresent: !!document.querySelector(".react-datepicker"),
      exportModalPresent: !!document.querySelector('[role="dialog"][aria-labelledby="export-title"]'),
    }));
    assert.deepStrictEqual(state, {
      openerClicks: 0,
      modalClicks: 1,
      pickerPresent: false,
      exportModalPresent: false,
    }, "the selector must dismiss the calendar and click exactly the modal Export action, not the page opener");
    console.log("EasyOrders export dialog regression test passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
