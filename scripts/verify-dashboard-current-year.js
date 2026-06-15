"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  replaceRowsInDateRange,
  validateCurrentYearDashboardRange,
} = require("../src/main/dashboard-range-utils");

const root = path.resolve(__dirname, "..");
const RealDate = Date;
const fixedNow = new RealDate(2026, 5, 5, 12, 0, 0);

function loadPeriodState(now) {
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now.getTime()]));
    }

    static now() {
      return now.getTime();
    }
  }

  const storage = new Map();
  const context = {
    console,
    Date: FixedDate,
    Intl,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    window: {},
  };
  context.window.window = context.window;
  context.window.localStorage = context.localStorage;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/renderer/pages/dashboard/dashboard-filter-bus.js"), "utf8"),
    context,
    { filename: "dashboard-filter-bus.js" }
  );
  return context.window.DashboardPeriodState;
}

const periods = loadPeriodState(fixedNow);
assert.strictEqual(periods.minDate(), "2026-01-01");
assert.strictEqual(periods.maxDate(), "2026-06-05");
assert.deepStrictEqual(
  Array.from(periods.availableMonths(), (month) => month.id),
  ["2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"]
);
const januaryPeriods = loadPeriodState(new RealDate(2027, 0, 1, 12, 0, 0));
assert.strictEqual(januaryPeriods.minDate(), "2027-01-01");
assert.strictEqual(januaryPeriods.maxDate(), "2027-01-01");
assert.deepStrictEqual(
  Array.from(januaryPeriods.availableMonths(), (month) => month.id),
  ["2027-01"]
);

periods.setCustomRange("2026-03-01", "2026-03-10");
assert.deepStrictEqual(
  { ...periods.get() },
  { preset: "custom", dateFrom: "2026-03-01", dateTo: "2026-03-10" }
);
periods.setCustomRange("2026-03-15", "2026-03-10");
assert.deepStrictEqual(
  { ...periods.get() },
  { preset: "custom", dateFrom: "2026-03-15", dateTo: "2026-03-15" }
);
periods.setCustomRange("2026-03-01", "2026-03-10");
periods.setCustomRange("2026-03-01", "2026-02-20");
assert.deepStrictEqual(
  { ...periods.get() },
  { preset: "custom", dateFrom: "2026-02-20", dateTo: "2026-02-20" }
);
periods.setCustomRange("2025-12-01", "2026-12-01");
assert.deepStrictEqual(
  { ...periods.get() },
  { preset: "custom", dateFrom: "2026-01-01", dateTo: "2026-06-05" }
);

const now = new RealDate(2026, 5, 5, 12, 0, 0);
assert.strictEqual(validateCurrentYearDashboardRange("2026-03-01", "2026-03-10", { now }).ok, true);
assert.strictEqual(validateCurrentYearDashboardRange("2026-01-01", "2026-06-05", { now }).ok, true);
[
  ["2025-12-31", "2026-01-01"],
  ["2026-06-01", "2026-06-06"],
  ["2026-02-30", "2026-03-01"],
  ["03/01/2026", "2026-03-10"],
  [" 2026-03-01", "2026-03-10"],
  ["2026-03-10", "2026-03-01"],
].forEach(([dateFrom, dateTo]) => {
  const result = validateCurrentYearDashboardRange(dateFrom, dateTo, { now });
  assert.strictEqual(result.ok, false, `${dateFrom}..${dateTo} should be rejected`);
  assert.match(result.error, /^INVALID_DASHBOARD_DATE_RANGE:/);
});

const rowKey = (row) => row.id;
const rowDateKey = (row) => row.createdAt;
const existing = [
  { id: "jan", createdAt: "2026-01-15", value: "old" },
  { id: "feb", createdAt: "2026-02-10", value: "old" },
  { id: "mar-01", createdAt: "2026-03-01", value: "old" },
  { id: "mar-10", createdAt: "2026-03-10", value: "old" },
  { id: "mar-11", createdAt: "2026-03-11", value: "old" },
];
const incoming = [
  { id: "mar-01", createdAt: "2026-03-01", value: "new" },
  { id: "mar-10", createdAt: "2026-03-10", value: "new" },
];
const merged = replaceRowsInDateRange(existing, incoming, "2026-03-01", "2026-03-10", {
  rowKey,
  rowDateKey,
});
assert.deepStrictEqual(merged.map((row) => row.id), ["jan", "feb", "mar-11", "mar-01", "mar-10"]);
assert.strictEqual(merged.find((row) => row.id === "mar-01").value, "new");
assert.strictEqual(merged.filter((row) => row.id === "mar-01").length, 1);

const refetched = replaceRowsInDateRange(merged, incoming, "2026-03-01", "2026-03-10", {
  rowKey,
  rowDateKey,
});
assert.strictEqual(refetched.filter((row) => row.id === "mar-01").length, 1);
assert.strictEqual(refetched.filter((row) => row.id === "mar-10").length, 1);

const shell = fs.readFileSync(
  path.join(root, "src/renderer/pages/dashboard/dashboard-shell.js"),
  "utf8"
);
assert.ok(shell.includes("nextView < minMonth || nextView > maxMonth"));
assert.ok(shell.includes("if (isFrom && nextFrom > nextTo) nextTo = nextFrom;"));
assert.ok(shell.includes("if (!isFrom && nextTo < nextFrom) nextFrom = nextTo;"));
assert.ok(shell.includes('id="dashboard-view-range-btn"'));
assert.ok(shell.includes("page._dashboardPeriodDraft"));
assert.ok(shell.includes("clearCustomRangeDraft(shellEl);"));
assert.ok(shell.includes("updateBtn.dataset.rangeBlocked = draftDirty ? 'true' : 'false';"));
assert.ok(shell.includes("dashboardPage._taagerDeactivate = function ()"));

const draftSelectionStart = shell.indexOf(
  "openDashboardDatePicker(button, isFrom ? draft.dateFrom : draft.dateTo"
);
const viewRangeHandlerStart = shell.indexOf(
  "viewBtn.addEventListener('click', function ()"
);
assert.ok(draftSelectionStart > 0 && viewRangeHandlerStart > draftSelectionStart);
const draftSelectionBlock = shell.slice(draftSelectionStart, viewRangeHandlerStart);
assert.ok(draftSelectionBlock.includes("setCustomRangeDraft(shellEl"));
assert.ok(!draftSelectionBlock.includes("DashboardPeriodState.setCustomRange"));
assert.ok(!draftSelectionBlock.includes("opts.onPeriodChange"));

const updateHandlerStart = shell.indexOf(
  "updateBtn.addEventListener('click', function ()"
);
const viewRangeHandlerBlock = shell.slice(viewRangeHandlerStart, updateHandlerStart);
assert.ok(viewRangeHandlerBlock.includes(
  "DashboardPeriodState.setCustomRange(draft.dateFrom, draft.dateTo)"
));
assert.strictEqual(
  (shell.match(/DashboardPeriodState\.setCustomRange\(/g) || []).length,
  1
);
assert.strictEqual(
  (viewRangeHandlerBlock.match(/opts\.onPeriodChange\(/g) || []).length,
  1
);
assert.ok(viewRangeHandlerBlock.includes("syncCustomRangeControls(shellEl, applied)"));
assert.ok(shell.includes("if (customRangeDraftIsDirty(draft, current))"));

const app = fs.readFileSync(path.join(root, "src/renderer/app.js"), "utf8");
assert.ok(app.includes("dateFrom: range?.dateFrom"));
assert.ok(app.includes("dateTo: range?.dateTo"));
assert.ok(app.includes('window.syncDashboardRangeActions()'));

const styles = fs.readFileSync(
  path.join(root, "src/renderer/pages/dashboard/dashboard-styles.css"),
  "utf8"
);
assert.ok(styles.includes(".dashboard-view-range-btn"));
assert.ok(styles.includes("linear-gradient(135deg, rgba(20,184,166"));
assert.ok(styles.includes("#dashboard-custom-range:not([hidden])"));
assert.ok(styles.includes('[data-theme="light"] #page-dashboard .dashboard-view-range-btn'));
assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"));

const localeEn = fs.readFileSync(
  path.join(root, "src/renderer/pages/dashboard/locales/en/dashboard-locale.js"),
  "utf8"
);
const localeAr = fs.readFileSync(
  path.join(root, "src/renderer/pages/dashboard/locales/ar/dashboard-locale.js"),
  "utf8"
);
assert.ok(localeEn.includes("'period.viewRange': 'View Range'"));
assert.ok(localeAr.includes("'period.viewRange': 'عرض النطاق'"));
assert.ok(localeEn.includes("'period.viewBeforeUpdate'"));
assert.ok(localeAr.includes("'period.viewBeforeUpdate'"));

const main = fs.readFileSync(path.join(root, "src/main/main.js"), "utf8");
assert.ok(
  main.indexOf("validateCurrentYearDashboardRange(dateFrom, dateTo)") <
    main.indexOf('const { fork } = require("child_process")')
);

console.log("Current-year dashboard history checks passed.");
