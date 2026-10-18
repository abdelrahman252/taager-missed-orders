"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const {
  createEasyOrdersExportFlow,
  pageExportButton,
  redactSensitiveUrls,
} = require("../src/bot/easy-orders-export");
const { createEasyOrdersUiRecovery } = require("../src/bot/easy-orders-ui-recovery");

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function exportToolbarMarkup(kind) {
  const pageClass = kind === "orders" ? "MuiButton-contained" : "MuiButton-outlined";
  return `<!doctype html>
    <button id="page-export" class="MuiButtonBase-root MuiButton-root ${pageClass}" type="button">Export</button>
    <div role="dialog" aria-labelledby="dialog-title" aria-modal="true">
      <h2 id="dialog-title">Export Orders</h2>
      <button id="modal-export" class="MuiButton-contained" type="button">Export</button>
    </div>
    <script>
      window.clicks = { page: 0, modal: 0 };
      document.querySelector('#page-export').addEventListener('click', () => window.clicks.page++);
      document.querySelector('#modal-export').addEventListener('click', () => window.clicks.modal++);
    </script>`;
}

function notificationRowsMarkup(rows) {
  return `<!doctype html><table><tbody>${rows.map((row) => `
    <tr><td><p>${row.text}</p>${(row.links || [{ href: row.href, text: "Watch" }]).map((link) => `<a href="${link.href}">${link.text || "Watch"}</a>`).join("")}</td></tr>`).join("")}</tbody></table>`;
}

async function main() {
  const executablePath = findChrome();
  assert(executablePath, "Google Chrome is required for the EasyOrders UI selector regression test");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();

    // Both observed page toolbar styles resolve by accessible name. The
    // dialog's separate Export action remains untouched until modal flow.
    for (const kind of ["orders", "missed-orders"]) {
      await page.setContent(exportToolbarMarkup(kind));
      await pageExportButton(page).click();
      assert.deepStrictEqual(await page.evaluate(() => window.clicks), { page: 1, modal: 0 }, `${kind} should click only the page toolbar Export`);
    }

    // The observed recovery detail has no Order ID label; the actual path plus
    // Edit Order and More actions is sufficient. Wrong paths/UUIDs stay false.
    const recovery = createEasyOrdersUiRecovery({ stepDelayMs: 1 });

    // Current missed-orders rows merge the customer name and phone in one
    // column; Reason and Status both have an undefined generated column class.
    // Keep phone extraction scoped to the Customer cell so status/reason text
    // can never be mistaken for a phone number.
    await page.setContent(fs.readFileSync(path.join(__dirname, "..", "docs", "audits", "easyorders-ui-2026-10-18", "fixtures", "missed-list-merged-customer.html"), "utf8"));
    const mergedMissedRows = await recovery.readMissedRows(page);
    assert.deepStrictEqual(mergedMissedRows[0], {
      index: 0,
      status: "Pending",
      name: "Test Customer",
      phone: "966555000111",
      createdAt: "10/03/2026",
    }, "merged Customer cell should provide exact name/phone without avatar, reason, or status contamination");
    const preparedMissed = { name: "Test Customer", normPhone: "966555000111", easyCreatedAt: "2026-10-03" };
    assert.strictEqual(recovery.findPreparedMissedMatch(mergedMissedRows[0], [preparedMissed]), preparedMissed);
    assert.strictEqual(recovery.findPreparedMissedMatch({ ...mergedMissedRows[0], name: "Another Customer" }, [preparedMissed]), null,
      "wrong customer name must not match a prepared missed order");
    assert.strictEqual(recovery.findPreparedMissedMatch({ ...mergedMissedRows[0], createdAt: "04/10/2026" }, [preparedMissed]), null,
      "wrong parsed order date must not match a prepared missed order");
    const missedMatchDiagnostics = {};
    assert.strictEqual(recovery.findPreparedMissedMatch(mergedMissedRows[0], [{
      name: "Test Customer", normPhone: "966555000111", easyCreatedAt: "10/02/2026",
    }], missedMatchDiagnostics), null, "a wrong candidate day remains excluded despite matching phone/name");
    assert.deepStrictEqual(missedMatchDiagnostics, {
      candidatesChecked: 1,
      phoneMatches: 1,
      phoneAndNameMatches: 1,
      dateMismatches: 1,
      candidateDays: ["2026-10-02"],
      rowDays: ["2026-10-03"],
    }, "diagnostics expose only field-match counts and calendar days, never customer values");
    assert.strictEqual(recovery.findPreparedMissedMatch(mergedMissedRows[0], [{
      name: "Test Customer", normPhone: "966555000111", easyCreatedAt: new Date(2026, 9, 3),
    }]).name, "Test Customer", "Date-valued candidate timestamps normalize to local calendar days");

    // Legacy missed lists expose a separate Phone column; continue to use
    // header/class evidence instead of positional reason/status cells.
    await page.setContent(`<!doctype html><table>
      <thead><tr><th></th><th>Customer</th><th>Phone</th><th>Status</th><th>Order Date</th></tr></thead>
      <tbody><tr class="RaDatagrid-clickableRow">
        <td><input type="checkbox"></td><td class="column-full_name"><span title="Legacy Customer">Legacy Customer</span></td>
        <td class="column-phone">966555000222</td><td class="column-status">Waiting</td>
      <td class="column-created_at">10/03/2026</td>
      </tr></tbody></table>`);
    const legacyMissedRows = await recovery.readMissedRows(page);
    assert.strictEqual(legacyMissedRows[0].name, "Legacy Customer");
    assert.strictEqual(legacyMissedRows[0].phone, "966555000222");
    assert.strictEqual(legacyMissedRows[0].status, "Waiting");
    assert.strictEqual(recovery.findPreparedMissedMatch(legacyMissedRows[0], [
      { name: "Legacy Customer", normPhone: "966555000222", easyCreatedAt: "2026-10-03" },
    ]).name, "Legacy Customer", "legacy separate phone column should remain matchable");

    // Older deployments also used a classless checkbox/status/name/phone/date
    // layout. Keep that specific fallback, while requiring a plausible phone
    // shape so status/reason cells are not accidentally promoted to a phone.
    await page.setContent(`<!doctype html><table><tbody>
      <tr class="RaDatagrid-clickableRow">
        <td><input type="checkbox"></td><td>Waiting</td><td>Positional Customer</td>
        <td>966555000333</td><td>10/03/2026</td>
      </tr>
    </tbody></table>`);
    const positionalLegacyRows = await recovery.readMissedRows(page);
    assert.strictEqual(positionalLegacyRows[0].name, "Positional Customer");
    assert.strictEqual(positionalLegacyRows[0].phone, "966555000333");
    assert.strictEqual(positionalLegacyRows[0].status, "Waiting");
    await page.setContent(`<!doctype html><table><tbody>
      <tr class="RaDatagrid-clickableRow">
        <td><input type="checkbox"></td><td>966555000444</td><td>Numeric Status Customer</td>
        <td>reason only</td><td>10/03/2026</td>
      </tr>
    </tbody></table>`);
    const noPhoneRows = await recovery.readMissedRows(page);
    assert.strictEqual(noPhoneRows[0].phone, "", "a numeric status cell is not a legacy phone field");
    assert.strictEqual(recovery.findPreparedMissedMatch(noPhoneRows[0], [
      { name: "Numeric Status Customer", normPhone: "966555000444", easyCreatedAt: "2026-10-03" },
    ]), null, "numeric status alone must not match a prepared missed order");

    // The current real-orders list uses a Customer cell that contains both
    // the name and phone, while Address is the next column. Use headers and
    // the phone's dir=ltr span instead of the old cells[3] address fallback.
    await page.setContent(`<!doctype html><table><thead><tr>
      <th></th><th>ID</th><th>Customer</th><th>Address</th><th>Total Amount</th><th>Order Status</th><th>IP Country</th><th>Order Date</th>
    </tr></thead><tbody><tr class="RaDatagrid-clickableRow">
      <td><input type="checkbox"></td><td class="column-short_id">R-123</td>
      <td class="column-undefined"><div><span title="Real Customer">Real Customer</span><span dir="ltr">+966 55 500 0111</span></div></td>
      <td class="column-undefined">Real Customer Address</td><td class="column-total_cost">100</td>
      <td class="column-status">Confirmed</td><td class="column-ip_country">SA</td>
      <td class="column-created_at">10/03/2026 05:15 AM</td>
    </tr></tbody></table>`);
    const currentRealRows = await recovery.readRealRows(page);
    const { text: currentRealText, ...currentRealSummary } = currentRealRows[0];
    assert.deepStrictEqual(currentRealSummary, {
      index: 0,
      status: "Confirmed",
      shortId: "R-123",
      customerText: "Real Customer +966 55 500 0111",
      phone: "+966 55 500 0111",
      createdAt: "10/03/2026",
    }, "current real-order columns must not use Address as customer text or phone");
    assert(currentRealText.includes("Real Customer Address"), "raw row text remains available for legacy matching");

    // Older real-order tables used ID/Customer/Phone/Status/Date columns and
    // did not always expose semantic column classes. Preserve that layout.
    await page.setContent(`<!doctype html><table><tbody><tr class="RaDatagrid-clickableRow">
      <td><input type="checkbox"></td><td>Confirmed</td><td>R-legacy</td>
      <td>Legacy Real Customer +966 55 500 0222</td><td>10/03/2026</td>
    </tr></tbody></table>`);
    const legacyRealRows = await recovery.readRealRows(page);
    assert.strictEqual(legacyRealRows[0].status, "Confirmed");
    assert.strictEqual(legacyRealRows[0].shortId, "R-legacy");
    assert.strictEqual(legacyRealRows[0].customerText, "Legacy Real Customer +966 55 500 0222");
    assert.strictEqual(legacyRealRows[0].phone, "+966 55 500 0222");

    // This fixture models the observed controlled date filter: filling the
    // DOM value alone does not update the URL; native ArrowUp/ArrowDown
    // interactions commit it after a short re-render delay. The helper must
    // verify both local date bounds before any list read can proceed.
    const dateFilterMarkup = (commitStart = true) => `<!doctype html>
      <button id="add-filter" type="button" onclick="document.querySelector('#filter-menu').hidden = false">Add Filter</button>
      <ul id="filter-menu" role="menu" hidden>
        <li role="menuitem" data-key="created_at$gte">Start Date</li>
        <li role="menuitem" data-key="created_at$lte">End Date</li>
      </ul>
      <div id="filters"></div>
      <script>
      (() => {
        const committed = {};
        const menu = document.querySelector('#filter-menu');
        const filters = document.querySelector('#filters');
        const ymd = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
        const sync = () => {
          const params = new URLSearchParams();
          params.set('filter', JSON.stringify(committed));
          history.replaceState(null, '', '#/missed-orders?' + params.toString());
        };
        menu.querySelectorAll('[data-key]').forEach(item => item.addEventListener('click', () => {
          const key = item.getAttribute('data-key');
          if (!filters.querySelector('[data-source="' + key + '"]')) {
            const wrapper = document.createElement('div');
            wrapper.setAttribute('data-source', key);
            wrapper.innerHTML = '<input type="date">';
            filters.appendChild(wrapper);
            const input = wrapper.querySelector('input');
            input.addEventListener('keydown', event => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              if (key === 'created_at$gte' && ${!commitStart}) return;
              const date = new Date(input.value + 'T00:00:00');
              date.setDate(date.getDate() + (event.key === 'ArrowUp' ? 1 : -1));
              input.value = ymd(date);
              setTimeout(() => { committed[key] = new Date(input.value + 'T00:00:00').toISOString(); sync(); }, 25);
            });
          }
          menu.hidden = true;
        }));
      })();
      </script>`;
    await page.setContent(dateFilterMarkup(true));
    const dateRecovery = createEasyOrdersUiRecovery({ stepDelayMs: 1, dateFilterCommitTimeoutMs: 800 });
    await dateRecovery.applyDateFilters(page, new Date(2026, 9, 2), new Date(2026, 9, 5));
    const committedFilter = await page.evaluate(() => {
      const params = new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1));
      return JSON.parse(params.get('filter') || '{}');
    });
    const localYmd = value => {
      const date = new Date(value);
      return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
    };
    assert.strictEqual(localYmd(committedFilter['created_at$gte']), "2026-10-02");
    assert.strictEqual(localYmd(committedFilter['created_at$lte']), "2026-10-05");

    // If the UI leaves the start bound uncommitted, fail before the caller can
    // proceed to page-size selection, row scanning, or any recovery action.
    await page.goto("about:blank");
    await page.setContent(dateFilterMarkup(false));
    await page.locator("#add-filter").click();
    const staleMenuState = await page.evaluate(() => ({
      hasButton: Boolean(document.querySelector("#add-filter")),
      menuHidden: document.querySelector("#filter-menu")?.hidden,
      itemCount: document.querySelectorAll("#filter-menu [data-key]").length,
    }));
    assert.strictEqual(await page.getByRole("menuitem", { name: "Start Date" }).isVisible(), true,
      `stale-bound fixture exposes the observed Start Date menu item: ${JSON.stringify(staleMenuState)}`);
    const staleDateRecovery = createEasyOrdersUiRecovery({ stepDelayMs: 1, dateFilterCommitTimeoutMs: 300 });
    await assert.rejects(
      () => staleDateRecovery.applyDateFilters(page, new Date(2026, 9, 2), new Date(2026, 9, 5)),
      /date filters were not committed.*2026-10-02\.\.2026-10-05/i,
    );

    await page.setContent("<button>Edit Order</button><button>More actions</button>");
    await page.evaluate(() => { window.location.hash = "/orders/expected-uuid"; });
    assert.strictEqual(await recovery.waitForEasyOrdersDetail(page, "real", { easyOrderUuid: "expected-uuid" }, 800), true);
    assert.strictEqual(await recovery.waitForEasyOrdersDetail(page, "real", { easyOrderUuid: "other-uuid" }, 80), false);
    await page.setContent("<button>Edit Order</button><button>Create Order</button>");
    await page.evaluate(() => { window.location.hash = "/orders/expected-uuid"; });
    assert.strictEqual(await recovery.waitForEasyOrdersDetail(page, "real", { easyOrderUuid: "expected-uuid" }, 80), false);

    // Open More actions and resolve the observed menuitem without clicking the
    // resend action. Legacy Options/button markup remains supported.
    await page.setContent(`<!doctype html>
      <button id="more-actions">More actions</button>
      <ul role="menu" hidden><li role="menuitem">Resend Order to Webhook</li></ul>
      <script>
        window.resendClicks = 0;
        document.querySelector('#more-actions').addEventListener('click', () => document.querySelector('[role=menu]').hidden = false);
        document.querySelector('[role=menuitem]').addEventListener('click', () => window.resendClicks++);
      </script>`);
    const liveResendAction = await recovery.openRealResendAction(page);
    assert(liveResendAction, "More actions should reveal the live resend menuitem");
    assert.strictEqual(await liveResendAction.isVisible(), true);
    assert.strictEqual(await page.evaluate(() => window.resendClicks), 0, "test must not submit a resend");

    await page.setContent(`<button>Options</button><button>Resend Order to Affiliates</button>`);
    const legacyResendAction = await recovery.openRealResendAction(page);
    assert(legacyResendAction, "legacy direct resend button should remain supported");
    assert.strictEqual(await legacyResendAction.isVisible(), true);

    // Current MUI page size uses role=combobox; selecting 100 updates the
    // hidden native value, and an already selected 100 is a no-op.
    await page.setContent(`<!doctype html>
      <div class="MuiTablePagination-root">
        <div id="page-size" role="combobox" aria-haspopup="listbox" aria-expanded="false">25</div>
        <input class="MuiSelect-nativeInput" value="25" aria-hidden="true">
        <ul role="listbox" hidden><li role="option" data-value="100">100</li></ul>
      </div>
      <script>
        window.pageSizeOpens = 0;
        const root = document.querySelector('.MuiTablePagination-root');
        const combo = document.querySelector('#page-size');
        const list = root.querySelector('[role=listbox]');
        combo.addEventListener('click', () => { window.pageSizeOpens++; list.hidden = false; combo.setAttribute('aria-expanded', 'true'); });
        list.querySelector('[role=option]').addEventListener('click', () => {
          root.querySelector('.MuiSelect-nativeInput').value = '100';
          root.querySelector('.MuiSelect-nativeInput').setAttribute('value', '100');
          combo.textContent = '100';
          combo.setAttribute('aria-expanded', 'false');
          list.hidden = true;
        });
      </script>`);
    await recovery.setRowsPerPage100(page);
    assert.strictEqual(await page.locator(".MuiSelect-nativeInput").getAttribute("value"), "100");
    assert.strictEqual(await page.locator("#page-size").innerText(), "100");
    const opensAfterChange = await page.evaluate(() => window.pageSizeOpens);
    await recovery.setRowsPerPage100(page);
    assert.strictEqual(await page.evaluate(() => window.pageSizeOpens), opensAfterChange, "already-100 page size should not reopen the listbox");

    // A baseline evaluation failure must fail closed. In the production flow
    // this helper is awaited before the export loop and page-level click.
    const baselineLogs = [];
    const exportFlow = createEasyOrdersExportFlow({ log: (message) => baselineLogs.push(message) });
    await assert.rejects(
      () => exportFlow.captureNotificationBaseline({
        url: () => "https://app.easy-orders.net/#/notifications",
        evaluate: async () => { throw new Error("failed at https://storage.invalid/excel/private.xlsx?signature=secret"); },
      }, "orders"),
      /EASY_ORDERS_NOTIFICATION_BASELINE_UNAVAILABLE/,
    );
    await page.setContent("<div>Notifications loading</div>");
    await assert.rejects(
      () => exportFlow.captureNotificationBaseline(page, "orders"),
      /EASY_ORDERS_NOTIFICATION_BASELINE_UNAVAILABLE/,
      "a missing notification table must block export before a stale link can be considered",
    );
    assert(baselineLogs.every((message) => !message.includes("signature=secret")));
    assert.strictEqual(redactSensitiveUrls("download failed https://example.test/file.xlsx?signature=secret"), "download failed [redacted URL]");

    const source = fs.readFileSync(path.join(__dirname, "..", "src", "bot", "easy-orders-export.js"), "utf8");
    assert(source.indexOf("await captureNotificationBaseline(page, keyword)") < source.indexOf("await clickExportButton(page, exportButton, keyword)"), "notification baseline must succeed before page Export can be clicked");

    const oldHref = "https://easyorders.fra1.digitaloceanspaces.com/excel/old.xlsx";
    const newHref = "https://easyorders.fra1.digitaloceanspaces.com/excel/new.xlsx";
    await page.setContent(notificationRowsMarkup([{ text: "Orders exported", href: oldHref }]));
    const baseline = await exportFlow.collectExistingExportLinks(page, "orders");
    assert.deepStrictEqual(baseline, [oldHref]);
    assert.strictEqual(await exportFlow.findExportLink(page, "orders", baseline), null, "unchanged historical workbook must not be accepted");
    assert.strictEqual(await exportFlow.findExportLink(page, "missed-orders", []), null, "orders workbook must not satisfy a missed export");
    await page.setContent(notificationRowsMarkup([{ text: "Missed orders report", href: "https://easyorders.fra1.digitaloceanspaces.com/excel/missed.xlsx" }]));
    assert.strictEqual(await exportFlow.findExportLink(page, "orders", []), null, "wrong-kind historical workbook must not be accepted");
    await page.setContent(notificationRowsMarkup([{ text: "Orders exported", href: "https://easyorders.fra1.digitaloceanspaces.com/excel/orders.xlsx" }]));
    assert.strictEqual(await exportFlow.findExportLink(page, "missed-orders", []), null, "orders workbook must not satisfy a missed export");
    await page.setContent(notificationRowsMarkup([{ text: "Missed orders report", href: "https://easyorders.fra1.digitaloceanspaces.com/excel/report-20261018.xlsx" }]));
    const genericMissedWorkbook = await exportFlow.findExportLink(page, "missed-orders", []);
    assert(genericMissedWorkbook && genericMissedWorkbook.href.endsWith("report-20261018.xlsx"), "a classified missed notification with a generic XLSX path should be accepted");
    await page.setContent(notificationRowsMarkup([{
      text: "Orders exported",
      links: [
        { href: "https://easyorders.fra1.digitaloceanspaces.com/watch/123", text: "Open" },
        { href: "https://easyorders.fra1.digitaloceanspaces.com/excel/orders.xlsx", text: "Watch" },
      ],
    }]));
    const workbookLink = await exportFlow.findExportLink(page, "orders", []);
    assert(workbookLink && workbookLink.href.endsWith("orders.xlsx"), "unrelated first row anchor must not be treated as the workbook");
    await page.setContent(notificationRowsMarkup([{ text: "Orders exported", href: oldHref }]));
    await page.evaluate((href) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td><p>Orders exported</p><a href="${href}">Watch</a></td>`;
      document.querySelector("tbody").prepend(row);
    }, newHref);
    const fresh = await exportFlow.findExportLink(page, "orders", baseline);
    assert(fresh);
    assert.strictEqual(fresh.href, newHref, "only the new same-kind workbook should be selected");
    assert(!baselineLogs.some((message) => message.includes("old.xlsx") || message.includes("new.xlsx")), "notification hrefs should not be logged");
    console.log("EasyOrders audited UI selector regression tests passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
