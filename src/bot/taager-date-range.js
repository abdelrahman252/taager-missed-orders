"use strict";

function localDay(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return null;
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatDataDay(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function resolveSafeTaagerExportRange(dateFrom, dateTo, options = {}) {
  const from = localDay(dateFrom);
  const to = localDay(dateTo);
  const today = localDay(options.today || new Date());
  if (!from || !to || !today) throw new Error("A valid Taager export date range is required.");
  if (from > to) throw new Error("Taager export dateFrom cannot be after dateTo.");

  const lookbackDays = Number.isFinite(options.lookbackDays) ? options.lookbackDays : 2;
  const forwardDays = Number.isFinite(options.forwardDays) ? options.forwardDays : 2;
  const exportDateFrom = addLocalDays(from, -lookbackDays);
  const expandedTo = addLocalDays(to, forwardDays);
  const exportDateTo = expandedTo > today ? today : expandedTo;
  return { exportDateFrom, exportDateTo };
}

function resolveMonthlyTaagerExportRange(options = {}) {
  const today = localDay(options.today || new Date());
  if (!today) throw new Error("A valid current date is required for Taager monthly export.");
  const lookbackDays = Number.isFinite(options.lookbackDays) ? options.lookbackDays : 2;
  if (today.getDate() === 1) {
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const exportDateFrom = addLocalDays(previousMonthStart, -lookbackDays);
    const exportDateTo = new Date(today.getFullYear(), today.getMonth(), 0);
    return { exportDateFrom, exportDateTo };
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const exportDateFrom = addLocalDays(monthStart, -lookbackDays);
  const exportDateTo = today;
  return { exportDateFrom, exportDateTo };
}

module.exports = {
  addLocalDays,
  formatDataDay,
  resolveMonthlyTaagerExportRange,
  resolveSafeTaagerExportRange,
};
