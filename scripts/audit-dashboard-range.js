#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function dateKey(row) {
  return String(row && (row.createdAt || row.date || row.dashboardDate || row.lastUpdatedAt) || "").slice(0, 10);
}

function orderKey(row, fallback) {
  const direct = row && (row.taagerOrderNumber || row.orderNumber || row.orderId || row.id || row.reference);
  if (direct) return `id:${String(direct).trim()}`;
  const phone = row && (row.phone || row.phone1 || row.phone2 || row.rawPhone || "");
  return `sig:${phone}|${dateKey(row)}|${fallback}`;
}

function bucket(row) {
  return String(row && (row.orderStatusBucket || row.exactStatusBucket || row.statusBucket || row.status || row.orderStatus) || "");
}

function isCanceledByYou(value) {
  return /canceled_by_you|طلب ملغي بواسطتك/.test(String(value || ""));
}

function isDelivered(value) {
  return /delivered|تم التوصيل/.test(String(value || ""));
}

function isConfirmationExcluded(value) {
  const text = String(value || "");
  return isCanceledByYou(text) ||
    /on_hold|out_of_stock|received|customer_refused_confirmation/.test(text) ||
    /معلق|تم استلام الطلب|رفض التأكيد/.test(text);
}

function pct(part, total) {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function main() {
  const from = arg("from");
  const to = arg("to");
  const store = arg("store", path.join(os.homedir(), "AppData", "Roaming", "taager-orders", "dashboard.json"));
  if (!from || !to) {
    console.error("Usage: node scripts/audit-dashboard-range.js --from=YYYY-MM-DD --to=YYYY-MM-DD [--expectRaw=1301 --expectNet=1158 --expectDelivered=323]");
    process.exit(2);
  }

  const data = JSON.parse(fs.readFileSync(store, "utf8"));
  let rows = [];
  Object.values(data.accounts || {}).forEach((account) => {
    rows = rows.concat(Array.isArray(account.snapshot) ? account.snapshot : []);
  });

  const periodRows = rows.filter((row) => {
    const key = dateKey(row);
    return key >= from && key <= to;
  });
  const orders = new Map();
  periodRows.forEach((row, index) => {
    const key = orderKey(row, index);
    if (!orders.has(key)) orders.set(key, row);
  });

  let canceledByYou = 0;
  let delivered = 0;
  let confirmed = 0;
  const statusBreakdown = {};
  orders.forEach((row) => {
    const b = bucket(row);
    statusBreakdown[b] = (statusBreakdown[b] || 0) + 1;
    if (isCanceledByYou(b)) {
      canceledByYou++;
      return;
    }
    if (isDelivered(b)) delivered++;
    if (!isConfirmationExcluded(b)) confirmed++;
  });

  const raw = orders.size;
  const net = raw - canceledByYou;
  const result = {
    from,
    to,
    itemRows: periodRows.length,
    raw,
    canceledByYou,
    net,
    delivered,
    confirmed,
    confirmationRate: pct(confirmed, net),
    ndr: pct(delivered, net),
    dr: pct(delivered, confirmed),
    statusBreakdown,
  };

  console.log(JSON.stringify(result, null, 2));

  const expectations = {
    raw: arg("expectRaw"),
    net: arg("expectNet"),
    delivered: arg("expectDelivered"),
    canceledByYou: arg("expectCanceledByYou"),
  };
  const failures = Object.entries(expectations)
    .filter(([, value]) => value !== "")
    .filter(([key, value]) => Number(value) !== result[key]);
  if (failures.length) {
    console.error("Expectation mismatch:", failures.map(([key, value]) => `${key} expected ${value}, got ${result[key]}`).join("; "));
    process.exit(1);
  }
}

main();
