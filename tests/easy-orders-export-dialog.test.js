"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const {
  selectExportDateRangeAndSubmit,
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

function pickerFixture({
  resetOnSelect = false,
  noOpDate = "",
  driftAfterSelection = false,
  disableApply = false,
  closeWithoutCommit = false,
  initialFrom = "2026-10-06",
  initialTo = "2026-10-13",
  initialRangeValue = "Oct 6, 2026  -  Oct 13, 2026",
  duplicateOutsideDate = "",
  navigationDelayMs = 0,
  ignoreNavigation = false,
  closeAfterNavigation = 0,
  closeAndIgnoreDate = "",
} = {}) {
  return `<!doctype html>
  <button class="MuiButton-outlined" id="page-export">Export</button>
  <div role="presentation"><div role="dialog" aria-labelledby="export-title" aria-modal="true">
    <h2 id="export-title">Export Orders</h2>
    <h3>Please select the start and end date</h3>
    <div aria-haspopup="true" aria-expanded="false" id="date-range-trigger">
      <input id="date-range" type="text" readonly aria-label="Select date range to filter statistics" placeholder="Select date range to filter statistics" value="${initialRangeValue}">
    </div>
    <div class="MuiDialogActions-root"><button class="MuiButton-text" id="modal-export">Export</button></div>
  </div></div>
  <div class="MuiPopover-paper" id="range-popover" style="display:none">
    <div class="rdp-root rdp" dir="ltr" lang="en-US" data-mode="range" data-required="true" data-multiple-months="true">
      <div class="rdp-nav">
        <button class="rdp-button_previous" aria-label="Go to the Previous Month" type="button"></button>
        <button class="rdp-button_next" aria-label="Go to the Next Month" type="button"></button>
      </div>
      <div class="rdp-months"></div>
      <div class="rdp-footer"><button type="button">Apply</button></div>
    </div>
  </div>
  <script>
  (() => {
    const resetOnSelect = ${resetOnSelect ? "true" : "false"};
    const noOpDate = ${JSON.stringify(noOpDate)};
    const driftAfterSelection = ${driftAfterSelection ? "true" : "false"};
    const disableApply = ${disableApply ? "true" : "false"};
    const closeWithoutCommit = ${closeWithoutCommit ? "true" : "false"};
    const duplicateOutsideDate = ${JSON.stringify(duplicateOutsideDate)};
    const navigationDelayMs = ${Number(navigationDelayMs) || 0};
    const ignoreNavigation = ${ignoreNavigation ? "true" : "false"};
    const closeAfterNavigation = ${Number(closeAfterNavigation) || 0};
    const closeAndIgnoreDate = ${JSON.stringify(closeAndIgnoreDate)};
    let visibleFirstMonth = new Date(2026, 9, 1);
    let range = { from: ${JSON.stringify(initialFrom)}, to: ${JSON.stringify(initialTo)} };
    let dayClicks = 0;
    let navigationClicks = 0;
    const popover = document.querySelector('#range-popover');
    const root = document.querySelector('.rdp-root');
    const months = document.querySelector('.rdp-months');
    const input = document.querySelector('#date-range');
    const trigger = document.querySelector('#date-range-trigger');
    window.events = [];
    window.modalClicks = 0;
    window.reopenClicks = 0;

    const iso = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const dateFromIso = (value) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
    const monthTitle = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const rangeDateText = (value) => dateFromIso(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    function updateRangeInputDraft() {
      if (!closeWithoutCommit && range && range.from && range.to) input.value = rangeDateText(range.from) + '  -  ' + rangeDateText(range.to);
    }
    function drawMonths() {
      months.innerHTML = '';
      for (let offset = 0; offset < 2; offset++) {
        const monthDate = new Date(visibleFirstMonth.getFullYear(), visibleFirstMonth.getMonth() + offset, 1);
        const month = document.createElement('section');
        month.className = 'rdp-month';
        month.innerHTML = '<div class="rdp-month_caption"><span class="rdp-caption_label">' + monthTitle(monthDate) + '</span></div>' +
          '<table class="rdp-month_grid"><tbody></tbody></table>';
        const body = month.querySelector('tbody');
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
        let row;
        for (let day = 1; day <= daysInMonth; day++) {
          if ((day - 1) % 7 === 0) {
            row = document.createElement('tr');
            body.appendChild(row);
          }
          const dayIso = iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
          const cell = document.createElement('td');
          cell.setAttribute('data-day', dayIso);
          const isStart = range.from === dayIso;
          const isEnd = range.to === dayIso;
          const selected = range.from && range.to && dayIso >= range.from && dayIso <= range.to;
          const classes = ['rdp-day'];
          if (selected) classes.push('rdp-selected');
          if (isStart) classes.push('rdp-range_start');
          if (isEnd) classes.push('rdp-range_end');
          cell.className = classes.join(' ');
          if (selected) {
            cell.setAttribute('data-selected', 'true');
            cell.setAttribute('aria-selected', 'true');
          }
          cell.innerHTML = '<button type="button" class="rdp-day_button" aria-label="' + new Date(monthDate.getFullYear(), monthDate.getMonth(), day).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) + '">' + day + '</button>';
          row.appendChild(cell);
        }
        months.appendChild(month);
      }
      if (duplicateOutsideDate && visibleFirstMonth.getFullYear() === 2026 && visibleFirstMonth.getMonth() === 9) {
        const duplicate = document.createElement('td');
        duplicate.className = 'rdp-day rdp-selected rdp-range_end rdp-outside rdp-hidden';
        duplicate.setAttribute('role', 'gridcell');
        duplicate.setAttribute('data-day', duplicateOutsideDate);
        duplicate.setAttribute('data-selected', 'true');
        duplicate.setAttribute('data-hidden', 'true');
        duplicate.setAttribute('data-outside', 'true');
        duplicate.style.display = 'none';
        duplicate.innerHTML = '<button class="rdp-day_button" type="button" aria-label="Sunday, November 1st, 2026">1</button>';
        months.children[0].appendChild(duplicate);
      }
    }
    function applyClick(dayIso) {
      if (dayIso === noOpDate) return;
      const from = range && range.from;
      const to = range && range.to;
      if (resetOnSelect && from && to) {
        range = { from: dayIso, to: null };
      } else if (!from && !to) {
        range = { from: dayIso, to: dayIso };
      } else if (from && !to) {
        if (dayIso === from) range = { from, to: dayIso };
        else if (dayIso < from) range = { from: dayIso, to: from };
        else range = { from, to: dayIso };
      } else if (from && to) {
        if (from === dayIso && to === dayIso) range = { from, to };
        else if (from === dayIso) range = { from, to: dayIso };
        else if (to === dayIso) range = { from: dayIso, to: dayIso };
        else if (dayIso < from) range = { from: dayIso, to };
        else if (dayIso > from) range = { from, to: dayIso };
      }
      updateRangeInputDraft();
      window.events.push('day:' + dayIso + ':' + (range.from || '') + ':' + (range.to || ''));
      drawMonths();
    }
    trigger.addEventListener('click', () => {
      if (popover.style.display !== 'none') {
        popover.style.display = 'none';
        trigger.setAttribute('aria-expanded', 'false');
        return;
      }
      window.reopenClicks++;
      visibleFirstMonth = new Date(2026, 9, 1);
      popover.style.display = '';
      trigger.setAttribute('aria-expanded', 'true');
      drawMonths();
    });
    root.addEventListener('click', (event) => {
      const nav = event.target.closest('button.rdp-button_previous,button.rdp-button_next');
      if (nav) {
        if (ignoreNavigation) return;
        navigationClicks++;
        visibleFirstMonth.setMonth(visibleFirstMonth.getMonth() + (nav.classList.contains('rdp-button_next') ? 1 : -1));
        if (navigationDelayMs) setTimeout(drawMonths, navigationDelayMs);
        else drawMonths();
        if (closeAfterNavigation && navigationClicks === closeAfterNavigation) {
          popover.style.display = 'none';
          trigger.setAttribute('aria-expanded', 'false');
        }
        return;
      }
      const day = event.target.closest('td[data-day] .rdp-day_button');
      if (day) {
        dayClicks++;
        const dayIso = day.closest('td').getAttribute('data-day');
        if (closeAndIgnoreDate === dayIso && dayClicks === 3) {
          window.events.push('day-close-ignored:' + dayIso);
          popover.style.display = 'none';
          trigger.setAttribute('aria-expanded', 'false');
          return;
        }
        applyClick(dayIso);
        if (driftAfterSelection && dayClicks === 2) {
          setTimeout(() => { range = { from: '2026-10-09', to: '2026-10-14' }; drawMonths(); }, 0);
        }
      }
    });
    root.querySelector('.rdp-footer button').disabled = disableApply;
    root.addEventListener('click', (event) => {
      if (!event.target.closest('.rdp-footer button')) return;
      if (closeWithoutCommit) {
        popover.style.display = 'none';
        trigger.setAttribute('aria-expanded', 'false');
        return;
      }
      if (!range.from || !range.to) return;
      const format = (value) => dateFromIso(value).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
      input.value = format(range.from) + '  -  ' + format(range.to);
      window.events.push('apply:' + range.from + ':' + range.to);
      popover.style.display = 'none';
      trigger.setAttribute('aria-expanded', 'false');
    });
    document.querySelector('#modal-export').addEventListener('click', () => {
      window.modalClicks++;
      window.events.push('export:' + input.value.replace(/\\s+/g, ' ').trim());
    });
    drawMonths();
  })();
  </script>`;
}

function withApplyRace(page, mode) {
  let applyClicks = 0;
  let acceptedDayClicks = 0;
  const baseLocator = page.locator.bind(page);

  function wrap(locator, inFooter = false, isApply = false, isDayButton = false) {
    return new Proxy(locator, {
      get(target, property) {
        if (property === "locator") {
          return (selector, ...args) => wrap(target.locator(selector, ...args), inFooter || selector === ".rdp-footer", false, isDayButton || selector.includes(".rdp-day_button"));
        }
        if (property === "getByRole") {
          return (role, options) => {
            const name = options && options.name;
            const matchesApply = name instanceof RegExp ? name.test("Apply") : /^Apply$/i.test(String(name || ""));
          return wrap(target.getByRole(role, options), inFooter, inFooter && role === "button" && matchesApply, isDayButton);
          };
        }
        if (property === "first" || property === "last") {
          return () => wrap(target[property](), inFooter, isApply, isDayButton);
        }
        if (property === "nth") {
          return (index) => wrap(target.nth(index), inFooter, isApply, isDayButton);
        }
        if (property === "click" && isApply) {
          return async (options) => {
            applyClicks += 1;
            if (mode === "detach-before-dispatch-once" && applyClicks === 1) {
              await page.evaluate(() => {
                const old = document.querySelector(".rdp-footer button");
                old.replaceWith(old.cloneNode(true));
              });
              throw new Error("Element is not attached to the DOM");
            }
            await target.click(options);
            if (mode === "detach-after-accepted-once" && applyClicks === 1) {
              throw new Error("Element is not attached to the DOM after click dispatch");
            }
          };
        }
        if (property === "click" && isDayButton && mode === "day-detach-after-accepted-once") {
          return async (options) => {
            await target.click(options);
            acceptedDayClicks += 1;
            if (acceptedDayClicks === 1) throw new Error("Element is not attached to the DOM after date selection dispatch");
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  return {
    page: new Proxy(page, {
      get(target, property) {
        if (property === "locator") return (selector, ...args) => wrap(baseLocator(selector, ...args));
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
    getApplyClickCount: () => applyClicks,
    getAcceptedDayClickCount: () => acceptedDayClicks,
  };
}

function localDate(year, month, day) {
  return new Date(year, month - 1, day);
}

(async () => {
  const executablePath = findChrome();
  assert(executablePath, "Google Chrome is required for the export dialog selector regression test");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    for (const keyword of ["orders", "missed-orders"]) {
      await page.setContent(pickerFixture());
      const dialog = await waitForExportOrdersDialog(page, keyword);
      await selectExportDateRangeAndSubmit(page, dialog, localDate(2026, 10, 5), localDate(2026, 10, 13), keyword);
      const state = await page.evaluate(() => ({
        modalClicks: window.modalClicks,
        input: document.querySelector('#date-range').value,
        events: window.events,
      }));
      assert.strictEqual(state.modalClicks, 1, `${keyword} should submit exactly once`);
      assert.match(state.input, /^Oct 5, 2026\s+-\s+Oct 13, 2026$/);
      assert.deepStrictEqual(state.events.slice(-2), [
        "apply:2026-10-05:2026-10-13",
        `export:${state.input.replace(/\s+/g, " ").trim()}`,
      ], `${keyword} Apply must commit the exact range immediately before the separate modal Export action`);
    }

    // Existing nonempty range, with requested start inside it. The production
    // sequence must re-anchor the start instead of carrying the old endpoint.
    await page.setContent(pickerFixture());
    const insideDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, insideDialog, localDate(2026, 10, 8), localDate(2026, 10, 14), "orders");
    assert.match(await page.locator('#date-range').inputValue(), /^Oct 8, 2026\s+-\s+Oct 14, 2026$/);

    // The live runner widens a one-day Oct 18 request to Oct 17–18. Keep the
    // preset Oct 11–18 end marker and verify that moving the start by one day
    // is stable and committed before Export.
    await page.setContent(pickerFixture({
      initialFrom: "2026-10-11",
      initialTo: "2026-10-18",
      initialRangeValue: "Oct 11, 2026  -  Oct 18, 2026",
    }));
    const oneDayWidenedDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, oneDayWidenedDialog, localDate(2026, 10, 17), localDate(2026, 10, 18), "orders");
    const oneDayWidenedState = await page.evaluate(() => ({
      input: document.querySelector('#date-range').value,
      events: window.events,
      modalClicks: window.modalClicks,
    }));
    assert.match(oneDayWidenedState.input, /^Oct 17, 2026\s+-\s+Oct 18, 2026$/);
    assert.strictEqual(oneDayWidenedState.modalClicks, 1, "one-day widened range must be applied and exported once");
    assert.deepStrictEqual(oneDayWidenedState.events.slice(-2), [
      "apply:2026-10-17:2026-10-18",
      `export:${oneDayWidenedState.input.replace(/\s+/g, " ").trim()}`,
    ]);

    // On the live popup, selecting the requested end may close the calendar
    // without changing its range. Reopen, re-read the unchanged 17–17 markers,
    // and retry the end click once before Apply.
    await page.setContent(pickerFixture({
      initialFrom: "2026-10-11",
      initialTo: "2026-10-18",
      initialRangeValue: "Oct 11, 2026  -  Oct 18, 2026",
      closeAndIgnoreDate: "2026-10-18",
    }));
    const closeOnEndDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, closeOnEndDialog, localDate(2026, 10, 17), localDate(2026, 10, 18), "orders");
    const closeOnEndState = await page.evaluate(() => ({
      input: document.querySelector('#date-range').value,
      events: window.events,
      reopenClicks: window.reopenClicks,
      modalClicks: window.modalClicks,
    }));
    assert.match(closeOnEndState.input, /^Oct 17, 2026\s+-\s+Oct 18, 2026$/);
    assert.strictEqual(closeOnEndState.events.filter((event) => event === "day-close-ignored:2026-10-18").length, 1);
    assert.strictEqual(closeOnEndState.events.filter((event) => event.startsWith("day:2026-10-18:")).length, 1, "the end should be clicked once after the ignored close");
    assert.ok(closeOnEndState.reopenClicks >= 2, "the closed picker should reopen before retrying the end click");
    assert.strictEqual(closeOnEndState.modalClicks, 1, "only the applied exact range may submit Export");

    // Also exercise the live component's resetOnSelect variant.
    await page.setContent(pickerFixture({ resetOnSelect: true }));
    const resetDialog = await waitForExportOrdersDialog(page, "missed-orders");
    await selectExportDateRangeAndSubmit(page, resetDialog, localDate(2026, 10, 8), localDate(2026, 10, 14), "missed-orders");
    assert.match(await page.locator('#date-range').inputValue(), /^Oct 8, 2026\s+-\s+Oct 14, 2026$/);

    // A requested start after the preset range also works under default
    // endpoint-update semantics by re-anchoring only after the marker confirms it.
    await page.setContent(pickerFixture());
    const laterDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, laterDialog, localDate(2026, 10, 15), localDate(2026, 10, 20), "orders");
    assert.match(await page.locator('#date-range').inputValue(), /^Oct 15, 2026\s+-\s+Oct 20, 2026$/);

    // Same-day ranges are valid and must have both exact endpoint markers.
    await page.setContent(pickerFixture());
    const sameDayDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, sameDayDialog, localDate(2026, 10, 5), localDate(2026, 10, 5), "orders");
    assert.match(await page.locator('#date-range').inputValue(), /^Oct 5, 2026\s+-\s+Oct 5, 2026$/);

    // Navigate across the year boundary using the captured accessible nav labels.
    await page.setContent(pickerFixture({ navigationDelayMs: 180 }));
    const yearDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, yearDialog, localDate(2025, 12, 30), localDate(2026, 1, 2), "orders");
    assert.match(await page.locator('#date-range').inputValue(), /^Dec 30, 2025\s+-\s+Jan 2, 2026$/);

    // Dashboard EasyOrders enrichment can span more than the two displayed
    // months. The requested end is already selected in October while the
    // requested Aug 2 start is offscreen; selecting the start must preserve
    // that end, inspect its marker after navigating forward, and avoid
    // clicking Oct 18 again. The outside hidden duplicate models DayPicker's
    // adjacent-month cell and must not masquerade as the real endpoint.
    await page.setContent(pickerFixture({
      initialFrom: "2026-10-11",
      initialTo: "2026-10-18",
      initialRangeValue: "Oct 11, 2026  -  Oct 18, 2026",
      duplicateOutsideDate: "2026-10-18",
    }));
    const wideRangeDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, wideRangeDialog, localDate(2026, 8, 2), localDate(2026, 10, 18), "orders");
    const wideRangeState = await page.evaluate(() => ({
      input: document.querySelector('#date-range').value,
      events: window.events,
      modalClicks: window.modalClicks,
    }));
    assert.match(wideRangeState.input, /^Aug 2, 2026\s+-\s+Oct 18, 2026$/);
    assert.strictEqual(wideRangeState.events.filter((event) => event.startsWith("day:2026-10-18:")).length, 0, "the already-selected offscreen end must not be clicked again");
    assert.strictEqual(wideRangeState.modalClicks, 1, "wide range must be verified and applied before one modal Export");
    assert.deepStrictEqual(wideRangeState.events.slice(-2), [
      "apply:2026-08-02:2026-10-18",
      `export:${wideRangeState.input.replace(/\s+/g, " ").trim()}`,
    ], "wide-range Apply and committed input must precede modal Export");

    // The live picker closes its popover after accepted navigation in some
    // states. Reopen from the still-visible range field, retain the selected
    // endpoint, and verify the exact range through Apply before Export.
    await page.setContent(pickerFixture({
      initialFrom: "2026-10-11",
      initialTo: "2026-10-18",
      initialRangeValue: "Oct 11, 2026  -  Oct 18, 2026",
      closeAfterNavigation: 1,
    }));
    const reopenedDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, reopenedDialog, localDate(2026, 8, 2), localDate(2026, 10, 18), "orders");
    const reopenedState = await page.evaluate(() => ({
      input: document.querySelector('#date-range').value,
      events: window.events,
      reopenClicks: window.reopenClicks,
      modalClicks: window.modalClicks,
    }));
    assert.match(reopenedState.input, /^Aug 2, 2026\s+-\s+Oct 18, 2026$/);
    assert.ok(reopenedState.reopenClicks >= 2, "closed picker should reopen on the trigger after navigation");
    assert.strictEqual(reopenedState.events.filter((event) => event.startsWith("day:2026-10-18:")).length, 0, "reopened picker must preserve the requested end without clicking it again");
    assert.strictEqual(reopenedState.modalClicks, 1, "reopened range must pass Apply verification before one Export");

    // The live sequence can accept a date click, report a detach, then close
    // the popover during later navigation. Recover from both transitions while
    // preserving the exact draft and only submit after Apply.
    await page.setContent(pickerFixture({
      initialFrom: "2026-10-11",
      initialTo: "2026-10-18",
      initialRangeValue: "Oct 11, 2026  -  Oct 18, 2026",
      // Initial endpoint reads navigate Prev, Prev, Next (three). After Aug 2
      // is accepted, end verification navigates to October and then back to
      // August; that sixth navigation closes the popup.
      closeAfterNavigation: 6,
    }));
    const combinedRace = withApplyRace(page, "day-detach-after-accepted-once");
    const combinedDialog = await waitForExportOrdersDialog(combinedRace.page, "orders");
    await selectExportDateRangeAndSubmit(combinedRace.page, combinedDialog, localDate(2026, 8, 2), localDate(2026, 10, 18), "orders");
    assert.strictEqual(combinedRace.getAcceptedDayClickCount(), 1, "the day click must dispatch before the simulated detachment");
    const combinedState = await page.evaluate(() => ({ input: document.querySelector('#date-range').value, events: window.events, reopenClicks: window.reopenClicks, modalClicks: window.modalClicks }));
    assert.match(combinedState.input, /^Aug 2, 2026\s+-\s+Oct 18, 2026$/);
    assert.strictEqual(combinedState.events.filter((event) => event.startsWith("day:2026-08-02:")).length, 1, "accepted detached day click must not be duplicated");
    assert.strictEqual(combinedState.events.filter((event) => event.startsWith("day:2026-10-18:")).length, 0, "reopened picker must retain the already-selected end");
    assert.ok(combinedState.reopenClicks >= 2, "picker close during later navigation must reopen from the field");
    assert.strictEqual(combinedState.modalClicks, 1, "combined detach and reopen recovery must end in one Export");
    assert.deepStrictEqual(combinedState.events.slice(-2), [
      "apply:2026-08-02:2026-10-18",
      `export:${combinedState.input.replace(/\s+/g, " ").trim()}`,
    ], "combined recovery must Apply the exact range before modal Export");

    // When an adjacent month contains a hidden duplicate of a real day, the
    // day selector must skip it and wait for an animated month render before
    // clicking the enabled in-month cell.
    await page.setContent(pickerFixture({ duplicateOutsideDate: "2026-11-01", navigationDelayMs: 180 }));
    const adjacentMonthDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, adjacentMonthDialog, localDate(2026, 10, 6), localDate(2026, 11, 1), "orders");
    const adjacentMonthState = await page.evaluate(() => ({ input: document.querySelector('#date-range').value, events: window.events }));
    assert.match(adjacentMonthState.input, /^Oct 6, 2026\s+-\s+Nov 1, 2026$/);
    assert.strictEqual(adjacentMonthState.events.filter((event) => event.startsWith("day:2026-11-01:")).length, 1, "the visible November cell should be clicked once, skipping the hidden October duplicate");
    assert.deepStrictEqual(adjacentMonthState.events.slice(-2), [
      "apply:2026-10-06:2026-11-01",
      `export:${adjacentMonthState.input.replace(/\s+/g, " ").trim()}`,
    ]);

    // A calendar click that does not set the requested range must block Apply
    // and the modal's real Export action.
    await page.setContent(pickerFixture({ noOpDate: "2026-10-08" }));
    const badDialog = await waitForExportOrdersDialog(page, "orders");
    await assert.rejects(
      () => selectExportDateRangeAndSubmit(page, badDialog, localDate(2026, 10, 8), localDate(2026, 10, 14), "orders"),
      /EASY_ORDERS_EXPORT_DATE_UNSELECTABLE|EASY_ORDERS_EXPORT_RANGE_START_NOT_SET|EASY_ORDERS_EXPORT_RANGE_NOT_SET/,
      "wrong marker state must prevent both Apply and Export"
    );
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 0);

    // An enabled navigation control that leaves the calendar on the same
    // months fails closed and reports only the bounded month/nav state.
    await page.setContent(pickerFixture({ ignoreNavigation: true }));
    const stuckNavigationDialog = await waitForExportOrdersDialog(page, "orders");
    await assert.rejects(
      () => selectExportDateRangeAndSubmit(page, stuckNavigationDialog, localDate(2026, 8, 2), localDate(2026, 10, 13), "orders"),
      /EASY_ORDERS_EXPORT_CALENDAR_NAVIGATION_STUCK.*target=2026-08.*before=2026-10,2026-11.*after=2026-10,2026-11.*navVisible=true.*navEnabled=true.*samples=/,
      "ignored navigation should fail closed with bounded diagnostics"
    );
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 0, "stuck navigation must not submit Export");

    // A hidden popup is not proof of a committed range; the stale input must
    // block modal Export after Apply closes without updating it.
    await page.setContent(pickerFixture({ closeWithoutCommit: true }));
    const staleAfterCloseDialog = await waitForExportOrdersDialog(page, "orders");
    await assert.rejects(
      () => selectExportDateRangeAndSubmit(page, staleAfterCloseDialog, localDate(2026, 10, 10), localDate(2026, 10, 14), "orders"),
      /EASY_ORDERS_EXPORT_RANGE_APPLY_FAILED.*closed without committing/,
      "closed picker with a stale range must block modal Export"
    );
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 0);
    assert.deepStrictEqual(await page.evaluate(() => window.events.filter((event) => event.startsWith("apply:") || event.startsWith("export:"))), []);

    // If a stale Apply node detaches before dispatch, the helper reacquires a
    // fresh button and retries only while the popup and exact range remain.
    await page.setContent(pickerFixture());
    const beforeDispatch = withApplyRace(page, "detach-before-dispatch-once");
    const beforeDispatchDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(beforeDispatch.page, beforeDispatchDialog, localDate(2026, 10, 10), localDate(2026, 10, 14), "orders");
    assert.strictEqual(beforeDispatch.getApplyClickCount(), 2, "one detached Apply should be reacquired and retried once");
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 1, "successful bounded Apply retry should submit once");
    assert.match(await page.locator('#date-range').inputValue(), /^Oct 10, 2026\s+-\s+Oct 14, 2026$/);

    // A click that committed the input and closed the popover but then reports
    // detachment is accepted only after verifying the committed range.
    await page.setContent(pickerFixture());
    const afterDispatch = withApplyRace(page, "detach-after-accepted-once");
    const afterDispatchDialog = await waitForExportOrdersDialog(page, "missed-orders");
    await selectExportDateRangeAndSubmit(afterDispatch.page, afterDispatchDialog, localDate(2026, 10, 10), localDate(2026, 10, 14), "missed-orders");
    assert.strictEqual(afterDispatch.getApplyClickCount(), 1, "accepted Apply must not be clicked a second time");
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 1, "verified accepted Apply should submit exactly once");

    // Even when the readonly input already displays the requested range, it
    // is not proof that Apply ran while its popover is still open.
    await page.setContent(pickerFixture());
    const alreadyMatching = withApplyRace(page, "detach-before-dispatch-once");
    const alreadyMatchingDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(alreadyMatching.page, alreadyMatchingDialog, localDate(2026, 10, 6), localDate(2026, 10, 13), "orders");
    assert.strictEqual(alreadyMatching.getApplyClickCount(), 2, "matching initial input still requires Apply and a verified closed popup");
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 1, "initially matching input must still lead to one verified submit");

    // A selection that changes during the settle window blocks Apply and
    // Export, even if the picker had previously shown the requested markers.
    await page.setContent(pickerFixture({ driftAfterSelection: true }));
    const driftDialog = await waitForExportOrdersDialog(page, "orders");
    await assert.rejects(
      () => selectExportDateRangeAndSubmit(page, driftDialog, localDate(2026, 10, 10), localDate(2026, 10, 14), "orders"),
      /EASY_ORDERS_EXPORT_DATE_UNSELECTABLE|EASY_ORDERS_EXPORT_RANGE_(?:START_NOT_SET|NOT_SET|NOT_STABLE)/,
      "changed selection must block Apply and modal Export"
    );
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 0);
    assert.deepStrictEqual(await page.evaluate(() => window.events.filter((event) => event.startsWith("apply:") || event.startsWith("export:"))), []);

    // A genuine disabled Apply control is an immediate failure, with no modal
    // Export attempt.
    await page.setContent(pickerFixture({ disableApply: true }));
    const unavailableDialog = await waitForExportOrdersDialog(page, "orders");
    await assert.rejects(
      () => selectExportDateRangeAndSubmit(page, unavailableDialog, localDate(2026, 10, 10), localDate(2026, 10, 14), "orders"),
      /EASY_ORDERS_EXPORT_RANGE_APPLY_FAILED.*Apply button is disabled/,
      "disabled Apply must remain a real error"
    );
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 0);

    console.log("EasyOrders date-range export dialog regression test passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
