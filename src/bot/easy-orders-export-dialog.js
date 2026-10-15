"use strict";

const EXPORT_DIALOG_NAME = /^Export Orders$/i;
const EXPORT_SUBMIT_NAME = /^Export$/i;
const RANGE_INPUT_NAME = "Select date range to filter statistics";
const RANGE_CALENDAR = '.rdp-root[data-mode="range"][data-required="true"]:visible';
const MAX_MONTH_NAVIGATIONS = 240;
const RANGE_STABLE_READS = 3;
const RANGE_STABLE_TIMEOUT_MS = 5000;
const APPLY_OUTCOME_TIMEOUT_MS = 5000;

function getExportOrdersDialog(page) {
  // The range picker may itself expose a dialog. Keep all modal actions scoped
  // to the specifically titled Export Orders dialog.
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

function getExportDateRangeInput(dialog) {
  return dialog.locator(
    `input[type="text"][aria-label="${RANGE_INPUT_NAME}"], input[type="text"][placeholder="${RANGE_INPUT_NAME}"]`
  ).first();
}

function asValidDate(value, label, keyword) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`EASY_ORDERS_EXPORT_DATE_INVALID: ${keyword}: ${label} is not a valid Date`);
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dateIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthIndex(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function expectedRangeText(start, end) {
  const format = (date) => date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${format(start)} - ${format(end)}`;
}

async function openExportDateRangePicker(page, dialog, keyword) {
  const input = getExportDateRangeInput(dialog);
  try {
    await input.waitFor({ state: "visible", timeout: 8000 });
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_DATE_INPUT_UNAVAILABLE: ${keyword}: range input was not found in Export Orders: ${error.message || error}`);
  }

  const openCalendar = page.locator(RANGE_CALENDAR).first();
  if (await openCalendar.count().catch(() => 0)) return { input, calendar: openCalendar };

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await openCalendar.count().catch(() => 0)) return { input, calendar: openCalendar };
    try {
      await input.click({ timeout: 3000 });
      await openCalendar.waitFor({ state: "visible", timeout: 2500 });
      return { input, calendar: openCalendar };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_NOT_OPEN: ${keyword}: ${lastError && lastError.message || "range calendar did not appear after bounded retries"}`);
}

function parseMonthCaption(text) {
  const match = String(text || "").trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const date = new Date(`${match[1]} 1, ${match[2]} 00:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function visibleCalendarMonths(calendar) {
  const labels = await calendar.locator(".rdp-month .rdp-caption_label").allInnerTexts();
  return labels.map(parseMonthCaption).filter(Boolean);
}

async function navigateToDateMonth(page, calendar, date, keyword) {
  const wanted = monthIndex(date);
  for (let move = 0; move <= MAX_MONTH_NAVIGATIONS; move++) {
    const months = await visibleCalendarMonths(calendar);
    if (!months.length) {
      throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_MONTH_UNREADABLE: ${keyword}: no DayPicker month captions were found`);
    }
    const indexes = months.map(monthIndex);
    if (indexes.includes(wanted)) return;

    const direction = wanted < Math.min(...indexes) ? "previous" : "next";
    const button = calendar.locator(direction === "previous"
      ? 'button.rdp-button_previous[aria-label="Go to the Previous Month"]'
      : 'button.rdp-button_next[aria-label="Go to the Next Month"]');
    if (!(await button.count()) || !(await button.isEnabled())) {
      throw new Error(`EASY_ORDERS_EXPORT_DATE_OUT_OF_CALENDAR_RANGE: ${keyword}: cannot navigate to ${dateIso(date)}`);
    }
    const before = indexes.join(",");
    await button.click({ timeout: 3000 });
    await page.waitForTimeout(80);
    const after = (await visibleCalendarMonths(calendar)).map(monthIndex).join(",");
    if (after === before) {
      throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_NAVIGATION_STUCK: ${keyword}: ${direction} navigation did not change displayed months`);
    }
  }
  throw new Error(`EASY_ORDERS_EXPORT_DATE_OUT_OF_CALENDAR_RANGE: ${keyword}: exceeded bounded month navigation for ${dateIso(date)}`);
}

async function selectedRange(calendar) {
  const start = calendar.locator("td.rdp-range_start[data-day]").first();
  const end = calendar.locator("td.rdp-range_end[data-day]").first();
  return {
    start: await start.count() ? await start.getAttribute("data-day") : "",
    end: await end.count() ? await end.getAttribute("data-day") : "",
  };
}

async function clickCalendarDay(page, calendar, date, keyword, phase) {
  await navigateToDateMonth(page, calendar, date, keyword);
  const iso = dateIso(date);
  const button = calendar.locator(`td[data-day="${iso}"]:not([data-hidden="true"]):not([data-outside="true"]) .rdp-day_button`);
  try {
    await button.waitFor({ state: "visible", timeout: 2500 });
    if (!(await button.isEnabled())) throw new Error("date button is disabled");
    await button.click({ timeout: 3000 });
    await page.waitForTimeout(100);
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_DATE_UNSELECTABLE: ${keyword}: ${phase} date ${iso}: ${error.message || error}`);
  }
}

async function selectCalendarRange(page, calendar, start, end, keyword) {
  const wantedStart = dateIso(start);
  const wantedEnd = dateIso(end);

  let selected = await selectedRange(calendar);
  if (selected.start === wantedStart && selected.end === wantedEnd) return;

  // DayPicker's default (resetOnSelect=false) behavior moves an endpoint on a
  // complete range; resetOnSelect=true instead leaves an open range. Handle
  // both from the observed modifiers: if the default behavior put the requested
  // start at the end, clicking it again collapses to that single day. Each
  // transition is checked before we choose the other endpoint.
  await clickCalendarDay(page, calendar, start, keyword, "start");
  selected = await selectedRange(calendar);
  if (selected.start !== wantedStart && selected.end === wantedStart) {
    await clickCalendarDay(page, calendar, start, keyword, "re-anchor start");
    selected = await selectedRange(calendar);
  }
  if (selected.start !== wantedStart) {
    throw new Error(`EASY_ORDERS_EXPORT_RANGE_START_NOT_SET: ${keyword}: expected ${wantedStart}, calendar shows ${selected.start || "no start"} to ${selected.end || "no end"}; selection state could not be safely re-anchored`);
  }

  if (selected.end !== wantedEnd) {
    await clickCalendarDay(page, calendar, end, keyword, "end");
    selected = await selectedRange(calendar);
  }
  if (selected.start !== wantedStart || selected.end !== wantedEnd) {
    throw new Error(`EASY_ORDERS_EXPORT_RANGE_NOT_SET: ${keyword}: expected ${wantedStart} to ${wantedEnd}, calendar shows ${selected.start || "no start"} to ${selected.end || "no end"}`);
  }
}

async function verifyRangeInput(input, start, end, keyword, phase) {
  const expected = expectedRangeText(start, end).replace(/\s+/g, " ").trim();
  const actual = (await input.inputValue().catch(() => "")).replace(/\s+/g, " ").trim();
  if (actual !== expected) {
    throw new Error(`EASY_ORDERS_EXPORT_RANGE_NOT_COMMITTED: ${keyword}: ${phase} expected ${expected}, found ${actual || "empty"}`);
  }
  return actual;
}

async function waitForSelectedRangeStable(page, calendar, start, end, keyword) {
  const wantedStart = dateIso(start);
  const wantedEnd = dateIso(end);
  const deadline = Date.now() + RANGE_STABLE_TIMEOUT_MS;
  let stableReads = 0;

  while (Date.now() < deadline) {
    const selected = await selectedRange(calendar).catch(() => ({ start: "", end: "" }));
    if (selected.start === wantedStart && selected.end === wantedEnd) {
      stableReads += 1;
      if (stableReads >= RANGE_STABLE_READS) return;
    } else {
      stableReads = 0;
    }
    await page.waitForTimeout(120);
  }
  throw new Error(`EASY_ORDERS_EXPORT_RANGE_NOT_STABLE: ${keyword}: expected stable markers ${wantedStart} to ${wantedEnd}`);
}

async function waitForApplyOutcome(page, calendar, input, start, end) {
  const expected = expectedRangeText(start, end).replace(/\s+/g, " ").trim();
  const deadline = Date.now() + APPLY_OUTCOME_TIMEOUT_MS;
  let actual = "";
  let popupVisible = true;

  while (Date.now() < deadline) {
    actual = (await input.inputValue().catch(() => "")).replace(/\s+/g, " ").trim();
    popupVisible = await calendar.isVisible().catch(() => false);
    if (actual === expected && !popupVisible) return { state: "committed", actual };

    // A closed popover after a click attempt is not sufficient evidence of
    // success. Keep checking the field through any React state update, but do
    // not click again once the popover has closed.
    await page.waitForTimeout(120);
  }

  if (!popupVisible) return { state: "closed-uncommitted", actual };
  const selected = await selectedRange(calendar).catch(() => ({ start: "", end: "" }));
  return { state: "open", actual, selected };
}

async function applyCalendarRange(page, input, start, end, keyword) {
  const wantedStart = dateIso(start);
  const wantedEnd = dateIso(end);
  await waitForSelectedRangeStable(page, page.locator(RANGE_CALENDAR).first(), start, end, keyword);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // DayPicker and its MUI popover can remount during selection. Resolve the
    // visible calendar and Apply button afresh for each bounded attempt.
    const calendar = page.locator(RANGE_CALENDAR).first();
    try {
      await calendar.waitFor({ state: "visible", timeout: 3000 });
      const selected = await selectedRange(calendar);
      if (selected.start !== wantedStart || selected.end !== wantedEnd) {
        throw new Error(`selection changed before Apply: ${selected.start || "no start"} to ${selected.end || "no end"}`);
      }

      const apply = calendar.locator(".rdp-footer").getByRole("button", { name: /^Apply$/i });
      await apply.waitFor({ state: "visible", timeout: 4000 });
      if (!(await apply.isEnabled())) throw new Error("Apply button is disabled");
      await apply.click({ timeout: 5000 });
    } catch (error) {
      lastError = error;
      const message = String(error && (error.message || error) || "");
      if (/Apply button is disabled|selection changed before Apply/.test(message)) {
        throw new Error(`EASY_ORDERS_EXPORT_RANGE_APPLY_FAILED: ${keyword}: ${message}`);
      }
    }

    const outcome = await waitForApplyOutcome(page, calendar, input, start, end);
    if (outcome.state === "committed") return;
    if (outcome.state === "closed-uncommitted") {
      throw new Error(`EASY_ORDERS_EXPORT_RANGE_APPLY_FAILED: ${keyword}: picker closed without committing ${wantedStart} to ${wantedEnd}; ${lastError && (lastError.message || lastError) || "Apply did not commit the range"}`);
    }

    const selected = outcome.selected || { start: "", end: "" };
    if (selected.start !== wantedStart || selected.end !== wantedEnd) {
      throw new Error(`EASY_ORDERS_EXPORT_RANGE_APPLY_FAILED: ${keyword}: selection changed while applying; expected ${wantedStart} to ${wantedEnd}, found ${selected.start || "no start"} to ${selected.end || "no end"}`);
    }
    if (attempt === 2) {
      throw new Error(`EASY_ORDERS_EXPORT_RANGE_APPLY_FAILED: ${keyword}: Apply did not commit after bounded retry; ${lastError && (lastError.message || lastError) || "Apply remained open"}`);
    }

    // The popover is still visible and the exact range remains selected, so a
    // fresh Apply locator may safely retry a click that detached before commit.
    await waitForSelectedRangeStable(page, page.locator(RANGE_CALENDAR).first(), start, end, keyword);
  }
}

async function clickExportDialogSubmit(page, dialog, keyword) {
  const submit = dialog.getByRole("button", { name: EXPORT_SUBMIT_NAME });
  try {
    await submit.waitFor({ state: "visible", timeout: 5000 });
    if (!(await submit.isEnabled())) throw new Error("modal Export button is disabled");
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_SUBMIT_UNAVAILABLE: ${keyword}: ${error.message || error}`);
  }
  try {
    // Exactly one click. A later timeout cannot safely tell us whether the
    // EasyOrders request was accepted, so it is never retried here.
    await submit.click({ timeout: 5000 });
  } catch (error) {
    if (!(await dialog.isVisible().catch(() => false))) return;
    throw new Error(`EASY_ORDERS_EXPORT_SUBMIT_UNAVAILABLE: ${keyword}: ${error.message || error}`);
  }
}

async function selectExportDateRangeAndSubmit(page, dialog, fromDate, toDate, keyword) {
  const start = asValidDate(fromDate, "start date", keyword);
  const end = asValidDate(toDate, "end date", keyword);
  if (dateIso(start) > dateIso(end)) {
    throw new Error(`EASY_ORDERS_EXPORT_RANGE_INVALID: ${keyword}: start ${dateIso(start)} is after end ${dateIso(end)}`);
  }
  const { input, calendar } = await openExportDateRangePicker(page, dialog, keyword);
  await selectCalendarRange(page, calendar, start, end, keyword);
  await applyCalendarRange(page, input, start, end, keyword);
  await verifyRangeInput(input, start, end, keyword, "committed range");
  await clickExportDialogSubmit(page, dialog, keyword);
  return input;
}

module.exports = {
  clickExportDialogSubmit,
  getExportDateRangeInput,
  getExportOrdersDialog,
  openExportDateRangePicker,
  selectExportDateRangeAndSubmit,
  waitForExportOrdersDialog,
};
