"use strict";

const EXPORT_DIALOG_NAME = /^Export Orders$/i;
const EXPORT_SUBMIT_NAME = /^Export$/i;
const RANGE_INPUT_NAME = "Select date range to filter statistics";
const RANGE_CALENDAR = '.rdp-root[data-mode="range"][data-required="true"]:visible';
const MAX_MONTH_NAVIGATIONS = 240;
const MAX_CALENDAR_REOPENS_PER_RANGE = 12;
const RANGE_STABLE_READS = 3;
const RANGE_STABLE_TIMEOUT_MS = 5000;
const APPLY_OUTCOME_TIMEOUT_MS = 5000;
const CALENDAR_NAVIGATION_TIMEOUT_MS = 3000;

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

async function openExportDateRangePicker(page, dialog, keyword, options = {}) {
  const input = getExportDateRangeInput(dialog);
  const operation = options.operation;
  const boundedTimeout = (maximum) => {
    if (!operation) return maximum;
    assertRangeOperationActive(operation, keyword);
    return Math.max(1, Math.min(maximum, operation.deadline - Date.now()));
  };
  try {
    await input.waitFor({ state: "visible", timeout: boundedTimeout(options.inputWaitTimeout ?? 8000) });
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_DATE_INPUT_UNAVAILABLE: ${keyword}: range input was not found in Export Orders: ${error.message || error}`);
  }

  const openCalendar = page.locator(RANGE_CALENDAR).first();
  if (await openCalendar.count().catch(() => 0)) return { input, calendar: openCalendar };

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await openCalendar.count().catch(() => 0)) return { input, calendar: openCalendar };
    try {
      await input.click({ timeout: boundedTimeout(options.clickTimeout ?? 3000) });
      await openCalendar.waitFor({ state: "visible", timeout: boundedTimeout(options.calendarWaitTimeout ?? 2500) });
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

async function visibleRangePickerState(page) {
  const input = page.locator(`input[type="text"][aria-label="${RANGE_INPUT_NAME}"]`).first();
  const inputCount = await input.count().catch(() => 0);
  const wrapper = input.locator("xpath=..");
  return {
    calendarCount: await page.locator(RANGE_CALENDAR).count().catch(() => 0),
    dialogVisible: await getExportOrdersDialog(page).isVisible().catch(() => false),
    inputCount,
    inputValue: inputCount ? await input.inputValue().catch(() => "") : "",
    triggerExpanded: inputCount ? await wrapper.getAttribute("aria-expanded").catch(() => null) : null,
  };
}

async function waitForCalendarMonthChange(page, calendar, before, keyword, direction, targetMonth, operation) {
  const beforeSignature = before.map(monthIndex).join(",");
  const wantedMonth = monthIndex(targetMonth);
  const wantedDay = dateIso(targetMonth);
  const startedAt = Date.now();
  const deadline = Math.min(Date.now() + CALENDAR_NAVIGATION_TIMEOUT_MS, operation.deadline);
  let lastMonths = [];
  let sampleLog = [];
  let stableReads = 0;
  let closedReads = 0;
  let reopenAttempts = 0;

  while (Date.now() < deadline) {
    const months = await visibleCalendarMonths(calendar).catch(() => []);
    lastMonths = months;
    const signature = months.map(monthIndex).join(",");
    const targetCaptionVisible = months.some((month) => monthIndex(month) === wantedMonth);
    const visibleDayButtons = await calendar.locator(".rdp-month .rdp-day_button:visible").count().catch(() => 0);
    const targetDayVisible = targetCaptionVisible && await calendar.locator(
      `td[data-day="${wantedDay}"]:not([data-hidden="true"]):not([data-outside="true"]) .rdp-day_button:visible`
    ).count().catch(() => 0) > 0;
    const renderedGrid = targetCaptionVisible ? targetDayVisible : visibleDayButtons > 0;
    const sample = `+${Date.now() - startedAt}ms:${signature || "unreadable"}${targetDayVisible ? ":target-day" : renderedGrid ? ":grid" : ""}`;
    sampleLog.push(sample);
    if (sampleLog.length > 12) sampleLog.shift();
    if (signature && signature !== beforeSignature && renderedGrid) {
      stableReads += 1;
      if (stableReads >= 3) return months;
    } else {
      stableReads = 0;
    }
    if (!months.length) {
      closedReads += 1;
      if (closedReads >= 2) {
        const state = await visibleRangePickerState(page);
        if (state.dialogVisible && state.calendarCount === 0 && state.triggerExpanded === "false" && state.inputValue.trim()) {
          if (operation.reopenCount >= MAX_CALENDAR_REOPENS_PER_RANGE) {
            throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_REOPEN_LIMIT: ${keyword}: range picker closed during navigation more than ${MAX_CALENDAR_REOPENS_PER_RANGE} times`);
          }
          operation.reopenCount += 1;
          reopenAttempts = operation.reopenCount;
          const remainingMs = Math.max(1, operation.deadline - Date.now());
          const reopened = await openExportDateRangePicker(page, getExportOrdersDialog(page), keyword, {
            inputWaitTimeout: Math.min(remainingMs, 1500),
            clickTimeout: Math.min(remainingMs, 1500),
            calendarWaitTimeout: Math.min(remainingMs, 1500),
            operation,
          });
          const reopenedMonths = await visibleCalendarMonths(reopened.calendar).catch(() => []);
          if (reopenedMonths.length) return { months: reopenedMonths, reopened: true };
        }
      }
    } else {
      closedReads = 0;
    }
    await page.waitForTimeout(50);
  }

  const button = calendar.locator(direction === "previous"
    ? 'button.rdp-button_previous[aria-label="Go to the Previous Month"]'
    : 'button.rdp-button_next[aria-label="Go to the Next Month"]');
  const navState = {
    count: await button.count().catch(() => 0),
    visible: await button.isVisible().catch(() => false),
    enabled: await button.isEnabled().catch(() => false),
    ariaDisabled: await button.getAttribute("aria-disabled").catch(() => null),
    disabled: await button.getAttribute("disabled").catch(() => null) !== null,
  };
  const monthLabels = lastMonths.map((month) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`);
  const targetLabel = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}`;
  const pickerState = await visibleRangePickerState(page);
  throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_NAVIGATION_STUCK: ${keyword}: ${direction} navigation did not settle; target=${targetLabel}, before=${monthLabelsFromSignature(beforeSignature)}, after=${monthLabels.join(",") || "unreadable"}, navCount=${navState.count}, navVisible=${navState.visible}, navEnabled=${navState.enabled}, navAriaDisabled=${navState.ariaDisabled ?? "unset"}, navDisabled=${navState.disabled}, calendarCount=${pickerState.calendarCount}, dialogVisible=${pickerState.dialogVisible}, inputCount=${pickerState.inputCount}, inputValue=${pickerState.inputValue || "empty"}, triggerExpanded=${pickerState.triggerExpanded ?? "unset"}, reopenAttempts=${reopenAttempts}, samples=${sampleLog.join("|")}`);
}

function monthLabelsFromSignature(signature) {
  return signature.split(",").filter(Boolean).map((value) => {
    const monthIndexValue = Number(value);
    const year = Math.floor(monthIndexValue / 12);
    const month = monthIndexValue - year * 12 + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }).join(",");
}

function createRangeOperation() {
  return { deadline: Date.now() + 90000, reopenCount: 0 };
}

function assertRangeOperationActive(operation, keyword) {
  if (Date.now() >= operation.deadline) {
    throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_OPERATION_TIMEOUT: ${keyword}: range selection exceeded its 90 second bound`);
  }
}

function remainingTimeout(operation, maximum, keyword) {
  assertRangeOperationActive(operation, keyword);
  return Math.max(1, Math.min(maximum, operation.deadline - Date.now()));
}

async function navigateToDateMonth(page, calendar, date, keyword, operation) {
  const wanted = monthIndex(date);
  for (let move = 0; move <= MAX_MONTH_NAVIGATIONS; move++) {
    assertRangeOperationActive(operation, keyword);
    let months = await visibleCalendarMonths(calendar).catch(() => []);
    if (!months.length) {
      calendar = await ensureRangeCalendarOpen(page, keyword, operation);
      months = await visibleCalendarMonths(calendar).catch(() => []);
      if (!months.length) {
        throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_MONTH_UNREADABLE: ${keyword}: no DayPicker month captions were found after reopening`);
      }
    }
    const indexes = months.map(monthIndex);
    if (indexes.includes(wanted)) return calendar;

    const direction = wanted < Math.min(...indexes) ? "previous" : "next";
    const button = calendar.locator(direction === "previous"
      ? 'button.rdp-button_previous[aria-label="Go to the Previous Month"]'
      : 'button.rdp-button_next[aria-label="Go to the Next Month"]');
    if (!(await button.count()) || !(await button.isEnabled())) {
      throw new Error(`EASY_ORDERS_EXPORT_DATE_OUT_OF_CALENDAR_RANGE: ${keyword}: cannot navigate to ${dateIso(date)}`);
    }
    const before = months;
    await button.click({ timeout: remainingTimeout(operation, 3000, keyword) });
    const transition = await waitForCalendarMonthChange(page, calendar, before, keyword, direction, date, operation);
    if (transition && transition.reopened) {
      calendar = page.locator(RANGE_CALENDAR).first();
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

async function ensureRangeCalendarOpen(page, keyword, operation) {
  const calendar = page.locator(RANGE_CALENDAR).first();
  if (await calendar.isVisible().catch(() => false)) return calendar;

  const state = await visibleRangePickerState(page);
  if (!state.dialogVisible || !state.inputCount || state.triggerExpanded !== "false") {
    try {
      await calendar.waitFor({ state: "visible", timeout: remainingTimeout(operation, 1000, keyword) });
      return calendar;
    } catch (_) {
      throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_NOT_OPEN: ${keyword}: picker disappeared without a settled closed trigger`);
    }
  }
  if (operation.reopenCount >= MAX_CALENDAR_REOPENS_PER_RANGE) {
    throw new Error(`EASY_ORDERS_EXPORT_CALENDAR_REOPEN_LIMIT: ${keyword}: range picker closed more than ${MAX_CALENDAR_REOPENS_PER_RANGE} times`);
  }
  operation.reopenCount += 1;
  const remainingMs = Math.max(1, operation.deadline - Date.now());
  return (await openExportDateRangePicker(page, getExportOrdersDialog(page), keyword, {
    inputWaitTimeout: Math.min(remainingMs, 1500),
    clickTimeout: Math.min(remainingMs, 1500),
    calendarWaitTimeout: Math.min(remainingMs, 1500),
    operation,
  })).calendar;
}

async function selectedEndpointAtDate(page, calendar, date, endpoint, keyword, operation) {
  calendar = await navigateToDateMonth(page, calendar, date, keyword, operation);
  const iso = dateIso(date);
  const marker = calendar.locator(
    `td.rdp-range_${endpoint}[data-day="${iso}"]:not([data-hidden="true"]):not([data-outside="true"])`
  ).first();
  return await marker.count().catch(() => 0) ? await marker.getAttribute("data-day").catch(() => "") : "";
}

async function selectedRangeEndpoints(page, calendar, start, end, keyword, operation) {
  // DayPicker only renders the currently visible months. Read each endpoint
  // while its own month is visible so long dashboard lookbacks still verify
  // their offscreen start and end markers independently.
  const selectedStart = await selectedEndpointAtDate(page, calendar, start, "start", keyword, operation);
  const selectedEnd = await selectedEndpointAtDate(page, calendar, end, "end", keyword, operation);
  return { start: selectedStart, end: selectedEnd };
}

async function clickCalendarDay(page, calendar, date, keyword, phase, operation) {
  const iso = dateIso(date);
  const endpointCounts = async (root) => ({
    start: await root.locator(`td.rdp-range_start[data-day="${iso}"]:not([data-hidden="true"]):not([data-outside="true"])`).count().catch(() => 0),
    end: await root.locator(`td.rdp-range_end[data-day="${iso}"]:not([data-hidden="true"]):not([data-outside="true"])`).count().catch(() => 0),
  });
  let calendarRoot = calendar;
  let retryAfterClose = false;

  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      calendarRoot = await navigateToDateMonth(page, calendarRoot, date, keyword, operation);
      const button = calendarRoot.locator(`td[data-day="${iso}"]:not([data-hidden="true"]):not([data-outside="true"]) .rdp-day_button`);
      await button.waitFor({ state: "visible", timeout: remainingTimeout(operation, 2500, keyword) });
      if (!(await button.isEnabled())) throw new Error("date button is disabled");
      const before = await endpointCounts(calendarRoot);
      let clickError = null;
      try {
        await button.click({ timeout: remainingTimeout(operation, 5000, keyword) });
      } catch (error) {
        // A date click can dispatch before a React remount/popover close makes
        // Playwright report detachment. Re-read the picker and endpoint first.
        clickError = error;
      }

      const settleDeadline = Math.min(Date.now() + 800, operation.deadline);
      let after = { start: 0, end: 0 };
      let closedDuringClick = false;
      while (Date.now() < settleDeadline) {
        if (!(await calendarRoot.isVisible().catch(() => false))) {
          closedDuringClick = true;
          calendarRoot = await ensureRangeCalendarOpen(page, keyword, operation);
          calendarRoot = await navigateToDateMonth(page, calendarRoot, date, keyword, operation);
        }
        after = await endpointCounts(calendarRoot);
        if ((after.start && !before.start) || (after.end && !before.end)) return;
        await page.waitForTimeout(80);
      }

      if (!closedDuringClick || attempt === 2) {
        throw clickError || new Error("date click left the requested day without a new endpoint");
      }

      // The popup closed and reopening showed the original endpoint state, so
      // the date click did not take. Retry once with a fresh visible locator.
    }
  } catch (error) {
    throw new Error(`EASY_ORDERS_EXPORT_DATE_UNSELECTABLE: ${keyword}: ${phase} date ${iso}: ${error.message || error}`);
  }
}

async function selectCalendarRange(page, calendar, start, end, keyword, operation) {
  const wantedStart = dateIso(start);
  const wantedEnd = dateIso(end);

  let selected = await selectedRangeEndpoints(page, calendar, start, end, keyword, operation);
  if (selected.start === wantedStart && selected.end === wantedEnd) return;

  // DayPicker's default (resetOnSelect=false) behavior moves the nearest
  // endpoint on a complete range; resetOnSelect=true starts a new open range.
  // Observe markers in the month containing the requested start, then inspect
  // the end in its own month. This also avoids clicking an already-correct end
  // that is outside the start month currently displayed.
  if (selected.start !== wantedStart) {
    await clickCalendarDay(page, calendar, start, keyword, "start", operation);
    const startMarker = await selectedEndpointAtDate(page, calendar, start, "start", keyword, operation);
    if (startMarker !== wantedStart) {
      const endMarker = await selectedEndpointAtDate(page, calendar, start, "end", keyword, operation);
      if (endMarker === wantedStart) {
        await clickCalendarDay(page, calendar, start, keyword, "re-anchor start", operation);
      }
      const reanchoredStart = await selectedEndpointAtDate(page, calendar, start, "start", keyword, operation);
      if (reanchoredStart !== wantedStart) {
        throw new Error(`EASY_ORDERS_EXPORT_RANGE_START_NOT_SET: ${keyword}: expected ${wantedStart}, calendar start marker is ${reanchoredStart || "not visible or unset"}`);
      }
    }
  }

  selected = await selectedRangeEndpoints(page, calendar, start, end, keyword, operation);
  if (selected.end !== wantedEnd) {
    await clickCalendarDay(page, calendar, end, keyword, "end", operation);
  }
  selected = await selectedRangeEndpoints(page, calendar, start, end, keyword, operation);
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

async function waitForSelectedRangeStable(page, calendar, start, end, keyword, operation) {
  const wantedStart = dateIso(start);
  const wantedEnd = dateIso(end);
  const deadline = Math.min(Date.now() + RANGE_STABLE_TIMEOUT_MS, operation.deadline);
  let stableReads = 0;

  while (Date.now() < deadline) {
    assertRangeOperationActive(operation, keyword);
    const selected = await selectedRangeEndpoints(page, calendar, start, end, keyword, operation).catch(() => ({ start: "", end: "" }));
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

async function waitForApplyOutcome(page, calendar, input, start, end, operation) {
  const expected = expectedRangeText(start, end).replace(/\s+/g, " ").trim();
  const deadline = Math.min(Date.now() + APPLY_OUTCOME_TIMEOUT_MS, operation.deadline);
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

async function applyCalendarRange(page, input, start, end, keyword, operation) {
  const wantedStart = dateIso(start);
  const wantedEnd = dateIso(end);
  await waitForSelectedRangeStable(page, page.locator(RANGE_CALENDAR).first(), start, end, keyword, operation);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // DayPicker and its MUI popover can remount during selection. Resolve the
    // visible calendar and Apply button afresh for each bounded attempt.
    const calendar = page.locator(RANGE_CALENDAR).first();
    try {
      await calendar.waitFor({ state: "visible", timeout: remainingTimeout(operation, 3000, keyword) });
      const selected = await selectedRangeEndpoints(page, calendar, start, end, keyword, operation);
      if (selected.start !== wantedStart || selected.end !== wantedEnd) {
        throw new Error(`selection changed before Apply: ${selected.start || "no start"} to ${selected.end || "no end"}`);
      }

      const apply = calendar.locator(".rdp-footer").getByRole("button", { name: /^Apply$/i });
      await apply.waitFor({ state: "visible", timeout: remainingTimeout(operation, 4000, keyword) });
      if (!(await apply.isEnabled())) throw new Error("Apply button is disabled");
      await apply.click({ timeout: remainingTimeout(operation, 5000, keyword) });
    } catch (error) {
      lastError = error;
      const message = String(error && (error.message || error) || "");
      if (/Apply button is disabled|selection changed before Apply/.test(message)) {
        throw new Error(`EASY_ORDERS_EXPORT_RANGE_APPLY_FAILED: ${keyword}: ${message}`);
      }
    }

    const outcome = await waitForApplyOutcome(page, calendar, input, start, end, operation);
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
    await waitForSelectedRangeStable(page, page.locator(RANGE_CALENDAR).first(), start, end, keyword, operation);
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
  const operation = createRangeOperation();
  const { input, calendar } = await openExportDateRangePicker(page, dialog, keyword, { operation });
  await selectCalendarRange(page, calendar, start, end, keyword, operation);
  await applyCalendarRange(page, input, start, end, keyword, operation);
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
