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

function pickerFixture({ resetOnSelect = false, noOpDate = "", driftAfterSelection = false, disableApply = false, closeWithoutCommit = false } = {}) {
  return `<!doctype html>
  <button class="MuiButton-outlined" id="page-export">Export</button>
  <div role="presentation"><div role="dialog" aria-labelledby="export-title" aria-modal="true">
    <h2 id="export-title">Export Orders</h2>
    <h3>Please select the start and end date</h3>
    <div aria-haspopup="true" aria-expanded="false" id="date-range-trigger">
      <input id="date-range" type="text" readonly aria-label="Select date range to filter statistics" placeholder="Select date range to filter statistics" value="Oct 6, 2026  -  Oct 13, 2026">
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
    let visibleFirstMonth = new Date(2026, 9, 1);
    let range = { from: "2026-10-06", to: "2026-10-13" };
    let dayClicks = 0;
    const popover = document.querySelector('#range-popover');
    const root = document.querySelector('.rdp-root');
    const months = document.querySelector('.rdp-months');
    const input = document.querySelector('#date-range');
    const trigger = document.querySelector('#date-range-trigger');
    window.events = [];
    window.modalClicks = 0;

    const iso = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const dateFromIso = (value) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
    const monthTitle = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
      window.events.push('day:' + dayIso + ':' + (range.from || '') + ':' + (range.to || ''));
      drawMonths();
    }
    trigger.addEventListener('click', () => {
      popover.style.display = '';
      trigger.setAttribute('aria-expanded', 'true');
      drawMonths();
    });
    root.addEventListener('click', (event) => {
      const nav = event.target.closest('button.rdp-button_previous,button.rdp-button_next');
      if (nav) {
        visibleFirstMonth.setMonth(visibleFirstMonth.getMonth() + (nav.classList.contains('rdp-button_next') ? 1 : -1));
        drawMonths();
        return;
      }
      const day = event.target.closest('td[data-day] .rdp-day_button');
      if (day) {
        dayClicks++;
        applyClick(day.closest('td').getAttribute('data-day'));
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
  const baseLocator = page.locator.bind(page);

  function wrap(locator, inFooter = false, isApply = false) {
    return new Proxy(locator, {
      get(target, property) {
        if (property === "locator") {
          return (selector, ...args) => wrap(target.locator(selector, ...args), inFooter || selector === ".rdp-footer", false);
        }
        if (property === "getByRole") {
          return (role, options) => {
            const name = options && options.name;
            const matchesApply = name instanceof RegExp ? name.test("Apply") : /^Apply$/i.test(String(name || ""));
            return wrap(target.getByRole(role, options), inFooter, inFooter && role === "button" && matchesApply);
          };
        }
        if (property === "first" || property === "last") {
          return () => wrap(target[property](), inFooter, isApply);
        }
        if (property === "nth") {
          return (index) => wrap(target.nth(index), inFooter, isApply);
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
    await page.setContent(pickerFixture());
    const yearDialog = await waitForExportOrdersDialog(page, "orders");
    await selectExportDateRangeAndSubmit(page, yearDialog, localDate(2025, 12, 30), localDate(2026, 1, 2), "orders");
    assert.match(await page.locator('#date-range').inputValue(), /^Dec 30, 2025\s+-\s+Jan 2, 2026$/);

    // A calendar click that does not set the requested range must block Apply
    // and the modal's real Export action.
    await page.setContent(pickerFixture({ noOpDate: "2026-10-08" }));
    const badDialog = await waitForExportOrdersDialog(page, "orders");
    await assert.rejects(
      () => selectExportDateRangeAndSubmit(page, badDialog, localDate(2026, 10, 8), localDate(2026, 10, 14), "orders"),
      /EASY_ORDERS_EXPORT_RANGE_START_NOT_SET|EASY_ORDERS_EXPORT_RANGE_NOT_SET/,
      "wrong marker state must prevent both Apply and Export"
    );
    assert.strictEqual(await page.evaluate(() => window.modalClicks), 0);

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
      /EASY_ORDERS_EXPORT_RANGE_(?:START_NOT_SET|NOT_SET|NOT_STABLE)/,
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
