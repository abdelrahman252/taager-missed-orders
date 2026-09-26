"use strict";

const EXPORT_DIALOG_NAME = /^Export Orders$/i;
const EXPORT_SUBMIT_NAME = /^Export$/i;

function getExportOrdersDialog(page) {
  // Identify the dialog by its visible title. The date picker can expose a
  // second role=dialog while it is open, so an unqualified `first()` is unsafe.
  return page.getByRole("dialog", { name: EXPORT_DIALOG_NAME });
}

async function waitForExportOrdersDialog(page, keyword) {
  const dialog = getExportOrdersDialog(page);
  try {
    await dialog.waitFor({ state: "visible", timeout: 8000 });
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_DIALOG_NOT_OPEN: ${keyword}: ${error.message || error}`);
  }
  return dialog;
}

async function closeExportDatePicker(page, keyword) {
  const calendar = page.locator(".react-datepicker:visible").first();
  if (!(await calendar.count().catch(() => 0))) return;

  await page.keyboard.press("Escape").catch(() => {});
  try {
    await calendar.waitFor({ state: "hidden", timeout: 5000 });
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_STILL_OPEN: ${keyword}: ${error.message || error}`);
  }
}

async function clickExportDialogSubmit(page, dialog, keyword) {
  // This is the exact modal action button from the export dialog. The page
  // opener is a separate outlined button and is never part of this lookup.
  const submit = dialog.getByRole("button", { name: EXPORT_SUBMIT_NAME });
  try {
    await submit.waitFor({ state: "visible", timeout: 5000 });
    if (!(await submit.isEnabled())) {
      throw new Error("modal Export button is disabled");
    }
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_SUBMIT_UNAVAILABLE: ${keyword}: ${error.message || error}`);
  }

  try {
    await submit.click({ timeout: 5000 });
  } catch (error) {
    // A successful submit can close the dialog while Playwright is finishing
    // the click. Treat that state as accepted; never click a second time.
    if (!(await dialog.isVisible().catch(() => false))) return;
    throw new Error(`EASY_ORDERS_EXPORT_SUBMIT_UNAVAILABLE: ${keyword}: ${error.message || error}`);
  }
}

module.exports = {
  closeExportDatePicker,
  clickExportDialogSubmit,
  getExportOrdersDialog,
  waitForExportOrdersDialog,
};
