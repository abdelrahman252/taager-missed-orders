"use strict";

const assert = require("assert");
const { formatDataDay, resolveSafeTaagerExportRange } = require("../src/bot/taager-date-range");

function date(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function check(name, from, to, today, expectedFrom, expectedTo) {
  const result = resolveSafeTaagerExportRange(date(from), date(to), { today: date(today) });
  assert.strictEqual(formatDataDay(result.exportDateFrom), expectedFrom, `${name}: exportDateFrom`);
  assert.strictEqual(formatDataDay(result.exportDateTo), expectedTo, `${name}: exportDateTo`);
}

check(
  "today is clamped",
  "2026-06-04",
  "2026-06-04",
  "2026-06-04",
  "2026-06-02",
  "2026-06-04"
);

check(
  "yesterday is clamped to today",
  "2026-06-03",
  "2026-06-03",
  "2026-06-04",
  "2026-06-01",
  "2026-06-04"
);

check(
  "two days ago expands to today",
  "2026-06-02",
  "2026-06-02",
  "2026-06-04",
  "2026-05-31",
  "2026-06-04"
);

check(
  "old month expands both sides",
  "2026-05-01",
  "2026-05-31",
  "2026-06-04",
  "2026-04-29",
  "2026-06-02"
);

assert.throws(
  () => resolveSafeTaagerExportRange(date("2026-06-04"), date("2026-06-03"), { today: date("2026-06-04") }),
  /dateFrom cannot be after dateTo/
);

console.log("Safe Taager date range checks passed.");
