"use strict";

const fs = require("fs");
const path = require("path");
const {
  parseTaagerOrderKeys,
  parseRealOrders,
  parseMissedOrders,
  buildProductCatalog,
  buildTaagerProductCatalog,
  repairOrderQuantitiesFromCatalog,
  resolveMissedOrders,
  mergeAndDeduplicate,
} = require("../src/bot/parser");

function usage() {
  console.log("Usage: node scripts/verify-sku-dedupe.js <real.xlsx> <missed.xlsx> <taager.xlsx> <from YYYY-MM-DD> <to YYYY-MM-DD>");
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

const [realPath, missedPath, taagerPath, fromRaw, toRaw] = process.argv.slice(2);
const from = parseDate(fromRaw);
const to = parseDate(toRaw);

if (!realPath || !missedPath || !taagerPath || !from || !to) {
  usage();
  process.exit(1);
}

for (const filePath of [realPath, missedPath, taagerPath]) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }
}

const taagerKeys = parseTaagerOrderKeys(fs.readFileSync(taagerPath));
const realOrders = parseRealOrders(fs.readFileSync(realPath), from, to);
const missedParsed = parseMissedOrders(fs.readFileSync(missedPath), from, to);
const missedOrders = missedParsed.orders || [];
let catalog = buildProductCatalog(realOrders);
const taagerCatalog = buildTaagerProductCatalog(fs.readFileSync(taagerPath));
const quantityRepairs = repairOrderQuantitiesFromCatalog(realOrders, catalog, taagerCatalog);
if (quantityRepairs > 0) catalog = buildProductCatalog(realOrders);
const resolvedMissedResult = resolveMissedOrders(missedOrders, catalog, taagerCatalog);
const resolvedMissed = resolvedMissedResult.resolved || [];
const { orders, stats } = mergeAndDeduplicate(realOrders, resolvedMissed, taagerKeys);

const samePhoneDifferentSku = new Map();
for (const order of orders) {
  if (!samePhoneDifferentSku.has(order.normPhone)) samePhoneDifferentSku.set(order.normPhone, new Set());
  samePhoneDifferentSku.get(order.normPhone).add(order.sku);
}

const multiSkuPhones = [...samePhoneDifferentSku.entries()]
  .filter(([, skus]) => skus.size > 1)
  .map(([phone, skus]) => ({ phone, skus: [...skus] }));

console.log(JSON.stringify({
  files: {
    real: path.resolve(realPath),
    missed: path.resolve(missedPath),
    taager: path.resolve(taagerPath),
  },
  dateRange: { from: fromRaw, to: toRaw },
  taagerKeys: taagerKeys.size,
  realItems: realOrders.length,
  missedRows: missedOrders.length,
  phoneSkippedMissedRows: (missedParsed.skippedOrders || []).length,
  resolvedMissedItems: resolvedMissed.length,
  catalogSkippedMissedRows: (resolvedMissedResult.skippedOrders || []).length,
  quantityRepairCount: quantityRepairs,
  finalOrders: orders.length,
  stats,
  samePhoneDifferentSkuCount: multiSkuPhones.length,
  samePhoneDifferentSkuSample: multiSkuPhones.slice(0, 10),
}, null, 2));
