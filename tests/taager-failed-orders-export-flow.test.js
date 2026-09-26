"use strict";

const assert = require("assert");
const path = require("path");
const { chromium } = require("playwright-core");
const { createTaagerFailedOrdersExportFlow } = require("../src/bot/taager-failed-orders-export-flow");

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return candidates.find((candidate) => candidate && require("fs").existsSync(candidate));
}

(async () => {
  const executablePath = findChrome();
  assert(executablePath, "Google Chrome is required for the failed-orders UI regression test");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <button id="failed-orders-date-pill">التاريخ</button>
      <button id="failed-orders-export-excel-button">تصدير</button>
      <div id="date-filter" role="dialog" hidden>
        <button id="from" aria-haspopup="dialog">من</button>
        <button id="to" aria-haspopup="dialog">إلى</button>
        <button id="failed-orders-date-apply" disabled>تطبيق</button>
      </div>
      <div id="calendar" role="dialog" aria-label="من" hidden>
        <nav>
          <button aria-label="Go to the Previous Month">Previous</button>
          <button aria-label="Go to the Next Month">Next</button>
        </nav>
        <table role="grid" aria-label="سبتمبر 2026"><tbody></tbody></table>
      </div>
      <script>
        window.selected = { to: "" };
        window.clickedFields = {};
        window.calendarMonth = 8;
        window.monthNavigations = 0;
        const calendar = document.querySelector('#calendar');
        function renderCalendar() {
          const september = window.calendarMonth === 8;
          const monthName = september ? 'سبتمبر' : 'أكتوبر';
          const dates = september
            ? [
                ['15', 'الثلاثاء، 15 سبتمبر 2026'],
                ['18', 'الجمعة، 18 سبتمبر 2026'],
                ['25', 'الجمعة، 25 سبتمبر 2026'],
              ]
            : [
                ['1', 'الخميس، 1 أكتوبر 2026'],
                ['9', 'الجمعة، 9 أكتوبر 2026'],
              ];
          calendar.querySelector('table').setAttribute('aria-label', monthName + ' 2026');
          calendar.querySelector('tbody').innerHTML = dates.map(([day, label]) =>
            '<tr><td><button aria-label="' + label + '">' + day + '</button></td></tr>'
          ).join('');
          calendar.querySelector('[aria-label="Go to the Previous Month"]').onclick = () => {
            window.calendarMonth -= 1;
            window.monthNavigations -= 1;
            renderCalendar();
          };
          calendar.querySelector('[aria-label="Go to the Next Month"]').onclick = () => {
            window.calendarMonth += 1;
            window.monthNavigations += 1;
            renderCalendar();
          };
          calendar.querySelectorAll('table button').forEach((button) => button.onclick = () => {
            window.selected[window.activeField] = button.getAttribute('aria-label');
            calendar.hidden = true;
            if (window.selected.from) document.querySelector('#failed-orders-date-apply').disabled = false;
          });
        }
        renderCalendar();
        document.querySelector('#failed-orders-date-pill').onclick = () => { document.querySelector('#date-filter').hidden = false; };
        for (const [field, id] of [['from', 'from'], ['to', 'to']]) {
          document.querySelector('#' + id).onclick = () => {
            window.clickedFields[field] = true;
            window.activeField = field;
            calendar.hidden = false;
          };
        }
        document.querySelector('#failed-orders-date-apply').onclick = () => { window.applied = true; };
      </script>`);

    const navigated = [];
    const flow = createTaagerFailedOrdersExportFlow({
      goto: async (targetPage, route) => { navigated.push(route); return targetPage; },
    });
    await flow.openFailedOrders(page);
    const selected = await flow.setDateFields(page, "2026-09-15", "2026-09-25");
    const state = await page.evaluate(() => ({
      selected: window.selected,
      clickedFields: window.clickedFields,
      applied: window.applied === true,
      monthNavigations: window.monthNavigations,
    }));

    assert.deepStrictEqual(navigated, ["/orders/failed-orders"], "diagnostics should open the current failed-orders route");
    assert.deepStrictEqual(selected, { from: "2026-09-15", to: "" }, "the current table calendar should select the requested From date and leave To empty");
    assert.deepStrictEqual(state, {
      selected: {
        from: "الثلاثاء، 15 سبتمبر 2026",
        to: "",
      },
      clickedFields: { from: true },
      applied: true,
      monthNavigations: 0,
    }, "the current UI should apply the From date without touching To or requiring a status role");

    await page.evaluate(() => {
      window.selected = { to: "" };
      window.clickedFields = {};
      window.applied = false;
      window.monthNavigations = 0;
      window.calendarMonth = 8;
      document.querySelector('#calendar').querySelector('table').setAttribute('aria-label', 'سبتمبر 2026');
      document.querySelector('#calendar').hidden = true;
      document.querySelector('#failed-orders-date-apply').disabled = true;
    });
    const nextMonthSelected = await flow.setDateFields(page, "2026-10-01", "2026-10-09");
    const nextMonthState = await page.evaluate(() => ({
      selected: window.selected,
      monthNavigations: window.monthNavigations,
      applied: window.applied === true,
    }));
    assert.deepStrictEqual(nextMonthSelected, { from: "2026-10-01", to: "" }, "the table caption should guide month navigation");
    assert.deepStrictEqual(nextMonthState, {
      selected: { from: "الخميس، 1 أكتوبر 2026", to: "" },
      monthNavigations: 1,
      applied: true,
    }, "the calendar should navigate using its table month label when no status role exists");

    await page.evaluate(() => {
      window.selected = { to: "" };
      window.applied = false;
      window.calendarMonth = 8;
      document.querySelector('#calendar').hidden = true;
      document.querySelector('#calendar table').setAttribute('aria-label', '');
      document.querySelector('#calendar tbody').innerHTML = '';
      document.querySelector('#failed-orders-date-apply').disabled = true;
      document.querySelector('#from').onclick = () => {
        window.activeField = 'from';
        document.querySelector('#calendar').hidden = false;
        setTimeout(() => window.renderCalendar(), 400);
      };
    });
    const delayedSelected = await flow.setDateFields(page, "2026-09-15", "2026-09-25");
    const delayedState = await page.evaluate(() => ({ selected: window.selected.from, applied: window.applied === true }));
    assert.deepStrictEqual(delayedSelected, { from: "2026-09-15", to: "" });
    assert.deepStrictEqual(delayedState, { selected: "الثلاثاء، 15 سبتمبر 2026", applied: true },
      "the calendar must wait for the days to render after the dialog opens");

    console.log("Taager failed-orders current UI regression test passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
