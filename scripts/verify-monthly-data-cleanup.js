"use strict";

const assert = require("assert");
const {
  MONTHLY_DATA_CLEANUP_CHECK_INTERVAL_MS,
  createMonthlyCleanupScheduler,
  monthlyCleanupCutoff,
  monthlyCleanupEligible,
  nextMonthlyCleanupDateKey,
  pruneAnalyticsRunsForCurrentMonth,
  pruneDashboardAccountsForCurrentMonth,
} = require("../src/main/monthly-data-cleanup");

function ts(dateKey) {
  return new Date(`${dateKey}T12:00:00`).getTime();
}

function rowDateKey(row) {
  return String(row && (row.createdAt || row.date || row.dashboardDate || "")).slice(0, 10);
}

const july7 = new Date(2026, 6, 7, 9, 0, 0, 0);
const cutoff = monthlyCleanupCutoff(july7);

assert.strictEqual(cutoff.monthKey, "2026-07");
assert.strictEqual(cutoff.cutoffDateKey, "2026-07-01");
assert.strictEqual(
  monthlyCleanupEligible({ now: new Date(2026, 6, 6), cleanupDay: 7, lastRunMonth: "" }),
  false,
  "Cleanup must not run before the 7th"
);
assert.strictEqual(
  monthlyCleanupEligible({ now: july7, cleanupDay: 7, lastRunMonth: "" }),
  true,
  "Cleanup must run on the 7th when this month has not been cleaned"
);
assert.strictEqual(
  monthlyCleanupEligible({ now: new Date(2026, 6, 23), cleanupDay: 7, lastRunMonth: "2026-07" }),
  false,
  "Cleanup must run only once per month"
);
assert.strictEqual(
  nextMonthlyCleanupDateKey({ now: july7, cleanupDay: 7, lastRunMonth: "2026-07" }),
  "2026-08-07",
  "Next eligible date should advance after the current month has been cleaned"
);
assert.strictEqual(
  nextMonthlyCleanupDateKey({ now: new Date(2026, 6, 23), cleanupDay: 7, lastRunMonth: "2026-06" }),
  "2026-07-23",
  "An overdue cleanup is eligible immediately instead of being reported for next month"
);

const analytics = pruneAnalyticsRunsForCurrentMonth([
  { runId: "june-run", runTimestamp: ts("2026-06-30") },
  { runId: "july-run", runTimestamp: ts("2026-07-01") },
  { runId: "undated-run" },
], cutoff.cutoffTime);

assert.deepStrictEqual(
  analytics.runs.map((run) => run.runId),
  ["july-run", "undated-run"],
  "Analytics cleanup should keep current-month and undated runs"
);
assert.strictEqual(analytics.removed, 1);

const dashboard = pruneDashboardAccountsForCurrentMonth({
  accountA: {
    label: "Account A",
    autoFetchTimestamp: 123,
    snapshot: [
      { orderId: "june-order", createdAt: "2026-06-30" },
      { orderId: "july-order", createdAt: "2026-07-01" },
      { orderId: "undated-order" },
    ],
  },
  accountB: {
    label: "Account B",
    snapshot: [{ orderId: "july-2", date: "2026-07-15" }],
  },
}, cutoff.cutoffDateKey, rowDateKey);

assert.strictEqual(dashboard.changed, true);
assert.strictEqual(dashboard.removedRows, 1);
assert.strictEqual(dashboard.touchedAccounts, 1);
assert.deepStrictEqual(
  dashboard.accounts.accountA.snapshot.map((row) => row.orderId),
  ["july-order", "undated-order"],
  "Dashboard cleanup should remove only old dated rows"
);
assert.strictEqual(
  dashboard.accounts.accountA.autoFetchTimestamp,
  123,
  "Dashboard cleanup must preserve account metadata"
);
assert.deepStrictEqual(
  dashboard.accounts.accountB.snapshot.map((row) => row.orderId),
  ["july-2"],
  "Dashboard cleanup should leave already-current accounts unchanged"
);

let cleanupCalls = 0;
let scheduledCallback = null;
let scheduledDelay = null;
let clearedTimer = null;
const scheduler = createMonthlyCleanupScheduler({
  runCleanup: () => { cleanupCalls++; },
  setTimer: (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return "monthly-cleanup-timer";
  },
  clearTimer: (timer) => { clearedTimer = timer; },
});

scheduler.start();
assert.strictEqual(cleanupCalls, 1, "Scheduler should check immediately on app startup");
assert.strictEqual(scheduledDelay, MONTHLY_DATA_CLEANUP_CHECK_INTERVAL_MS);
assert.strictEqual(typeof scheduledCallback, "function", "Scheduler should keep checking while the tray app remains open");
scheduledCallback();
assert.strictEqual(cleanupCalls, 2, "Scheduled checks should continue after startup");
scheduler.stop();
assert.strictEqual(clearedTimer, "monthly-cleanup-timer", "Scheduler timer should be cleared during app shutdown");
assert.strictEqual(scheduler.isRunning(), false);

let reportedError = null;
let recoveryCallback = null;
const recoveringScheduler = createMonthlyCleanupScheduler({
  runCleanup: () => { throw new Error("simulated cleanup failure"); },
  onError: (error) => { reportedError = error; },
  setTimer: (callback) => {
    recoveryCallback = callback;
    return "recovery-timer";
  },
  clearTimer: () => {},
});
recoveringScheduler.start();
assert.match(reportedError.message, /simulated cleanup failure/);
assert.strictEqual(typeof recoveryCallback, "function", "A failed cleanup must not stop future checks");
recoveringScheduler.stop();

console.log("Monthly data cleanup verification passed.");
