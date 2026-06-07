"use strict";

function formatLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseStrictDateKey(value) {
  const text = typeof value === "string" ? value : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return { key: text, date };
}

function currentYearDateBounds(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    min: new Date(today.getFullYear(), 0, 1),
    max: today,
    minKey: `${today.getFullYear()}-01-01`,
    maxKey: formatLocalDateKey(today),
  };
}

function validateCurrentYearDashboardRange(dateFrom, dateTo, options = {}) {
  const from = parseStrictDateKey(dateFrom);
  const to = parseStrictDateKey(dateTo);
  if (!from || !to) {
    return {
      ok: false,
      error: "INVALID_DASHBOARD_DATE_RANGE: dateFrom and dateTo must be valid YYYY-MM-DD dates.",
    };
  }

  const bounds = currentYearDateBounds(options.now || new Date());
  if (from.key < bounds.minKey || to.key < bounds.minKey) {
    return {
      ok: false,
      error: `INVALID_DASHBOARD_DATE_RANGE: dates cannot be before ${bounds.minKey}.`,
    };
  }
  if (from.key > bounds.maxKey || to.key > bounds.maxKey) {
    return {
      ok: false,
      error: `INVALID_DASHBOARD_DATE_RANGE: dates cannot be after ${bounds.maxKey}.`,
    };
  }
  if (from.key > to.key) {
    return {
      ok: false,
      error: "INVALID_DASHBOARD_DATE_RANGE: dateFrom cannot be after dateTo.",
    };
  }
  return {
    ok: true,
    dateFrom: from.key,
    dateTo: to.key,
    minDate: bounds.minKey,
    maxDate: bounds.maxKey,
  };
}

function mergeRowsByKey(existingRows, incomingRows, rowKey) {
  const merged = [];
  const index = new Map();
  const addOrReplace = (row) => {
    if (!row) return;
    const key = rowKey(row) || `row:${merged.length}`;
    const previousIndex = index.get(key);
    if (previousIndex == null) {
      index.set(key, merged.length);
      merged.push(row);
      return;
    }
    merged[previousIndex] = { ...merged[previousIndex], ...row };
  };
  (Array.isArray(existingRows) ? existingRows : []).forEach(addOrReplace);
  (Array.isArray(incomingRows) ? incomingRows : []).forEach(addOrReplace);
  return merged;
}

function replaceRowsInDateRange(existingRows, incomingRows, dateFrom, dateTo, options) {
  const rowKey = options && options.rowKey;
  const rowDateKey = options && options.rowDateKey;
  if (typeof rowKey !== "function" || typeof rowDateKey !== "function") {
    throw new Error("rowKey and rowDateKey are required.");
  }
  if (!dateFrom || !dateTo) return mergeRowsByKey(existingRows, incomingRows, rowKey);

  const incomingKeys = new Set();
  (Array.isArray(incomingRows) ? incomingRows : []).forEach((row) => {
    const key = rowKey(row);
    if (key) incomingKeys.add(key);
  });

  const outsideFetchedWindow = (Array.isArray(existingRows) ? existingRows : []).filter((row) => {
    const key = rowKey(row);
    if (key && incomingKeys.has(key)) return false;
    const dateKey = rowDateKey(row);
    return !dateKey || dateKey < dateFrom || dateKey > dateTo;
  });
  return mergeRowsByKey(outsideFetchedWindow, incomingRows, rowKey);
}

module.exports = {
  currentYearDateBounds,
  formatLocalDateKey,
  mergeRowsByKey,
  parseStrictDateKey,
  replaceRowsInDateRange,
  validateCurrentYearDashboardRange,
};
