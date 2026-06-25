"use strict";

const MONTHLY_DATA_CLEANUP_DAY = 7;
const MONTHLY_DATA_CLEANUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function asDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function localDateKey(dateLike) {
  const date = asDate(dateLike);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthlyCleanupMonthKey(dateLike) {
  const date = asDate(dateLike);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function monthlyCleanupCutoff(dateLike) {
  const date = asDate(dateLike);
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  return {
    monthKey: monthlyCleanupMonthKey(date),
    cutoffTime: monthStart.getTime(),
    cutoffDateKey: localDateKey(monthStart),
  };
}

function monthlyCleanupEligible(options = {}) {
  const now = asDate(options.now || new Date());
  const cleanupDay = Number(options.cleanupDay || MONTHLY_DATA_CLEANUP_DAY);
  const force = options.force === true;
  const monthKey = monthlyCleanupMonthKey(now);
  const lastRunMonth = String(options.lastRunMonth || "");
  if (force) return true;
  return now.getDate() >= cleanupDay && lastRunMonth !== monthKey;
}

function nextMonthlyCleanupDateKey(options = {}) {
  const now = asDate(options.now || new Date());
  const cleanupDay = Number(options.cleanupDay || MONTHLY_DATA_CLEANUP_DAY);
  const monthKey = monthlyCleanupMonthKey(now);
  const lastRunMonth = String(options.lastRunMonth || "");
  if (now.getDate() >= cleanupDay && lastRunMonth !== monthKey) {
    return localDateKey(now);
  }
  const next = new Date(now.getFullYear(), now.getMonth(), cleanupDay, 0, 0, 0, 0);
  if (lastRunMonth === monthKey) {
    next.setMonth(next.getMonth() + 1);
  }
  return localDateKey(next);
}

function createMonthlyCleanupScheduler(options = {}) {
  if (typeof options.runCleanup !== "function") {
    throw new TypeError("runCleanup must be a function");
  }

  const intervalMs = Math.max(1000, Number(options.intervalMs) || MONTHLY_DATA_CLEANUP_CHECK_INTERVAL_MS);
  const scheduleTimer = typeof options.setTimer === "function" ? options.setTimer : setTimeout;
  const cancelTimer = typeof options.clearTimer === "function" ? options.clearTimer : clearTimeout;
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  let timer = null;
  let running = false;

  function scheduleNext() {
    if (!running) return;
    timer = scheduleTimer(tick, intervalMs);
  }

  function tick() {
    if (!running) return;
    timer = null;
    try {
      options.runCleanup();
    } catch (error) {
      onError(error);
    } finally {
      scheduleNext();
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      if (timer != null) cancelTimer(timer);
      timer = null;
    },
    isRunning() {
      return running;
    },
  };
}

function runTime(run) {
  const direct = Number(run && run.runTimestamp);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const started = Number(run && run.runStartedAt);
  if (Number.isFinite(started) && started > 0) return started;
  const fallback = new Date(run && (run.createdAt || run.timestamp || run.date) || "").getTime();
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function pruneAnalyticsRunsForCurrentMonth(runs, cutoffTime) {
  const source = Array.isArray(runs) ? runs : [];
  const kept = source.filter((run) => {
    const ts = runTime(run);
    return !ts || ts >= cutoffTime;
  });
  return { runs: kept, removed: source.length - kept.length };
}

function pruneDashboardAccountsForCurrentMonth(accounts, cutoffDateKey, rowDateKey) {
  const source = accounts && typeof accounts === "object" ? accounts : {};
  const next = {};
  let removedRows = 0;
  let touchedAccounts = 0;

  for (const [accountId, account] of Object.entries(source)) {
    if (!account || typeof account !== "object") {
      next[accountId] = account;
      continue;
    }
    const rows = Array.isArray(account.snapshot) ? account.snapshot : [];
    if (!rows.length) {
      next[accountId] = account;
      continue;
    }
    const keptRows = rows.filter((row) => {
      const dateKey = rowDateKey(row);
      return !dateKey || dateKey >= cutoffDateKey;
    });
    const removed = rows.length - keptRows.length;
    if (removed > 0) {
      touchedAccounts++;
      removedRows += removed;
      next[accountId] = { ...account, snapshot: keptRows };
    } else {
      next[accountId] = account;
    }
  }

  return {
    accounts: next,
    removedRows,
    touchedAccounts,
    changed: removedRows > 0,
  };
}

module.exports = {
  MONTHLY_DATA_CLEANUP_DAY,
  MONTHLY_DATA_CLEANUP_CHECK_INTERVAL_MS,
  createMonthlyCleanupScheduler,
  localDateKey,
  monthlyCleanupMonthKey,
  monthlyCleanupCutoff,
  monthlyCleanupEligible,
  nextMonthlyCleanupDateKey,
  pruneAnalyticsRunsForCurrentMonth,
  pruneDashboardAccountsForCurrentMonth,
};
