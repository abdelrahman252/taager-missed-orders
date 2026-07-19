"use strict";

const fs = require("fs");
const path = require("path");

const { buildGroupedCartOrders } = require("../src/bot/cart-order-groups");
const { dedupePreparedRealOrders } = require("../src/bot/easy-orders-affiliate-recovery-flow");
const { normalizePhone } = require("../src/bot/phone");
const parser = require("../src/bot/parser");

const DEFAULTS = {
  country: "sa",
  from: "2026-07-16",
  to: "2026-07-19",
  taager: "H:\\marketing\\tageer\\new\\خرباانه\\19-7\\taager orders.xlsx",
  real: "H:\\marketing\\tageer\\new\\خرباانه\\19-7\\1784432677716577224-real easyorders-2026-07-19.xlsx",
  missed: "H:\\marketing\\tageer\\new\\خرباانه\\19-7\\1784432696876836387-missed-orders-2026-07-13-2026-07-19.xlsx",
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function samePath(a, b) {
  return path.resolve(String(a || "")).toLowerCase() === path.resolve(String(b || "")).toLowerCase();
}

function usingDefaultFixture(args) {
  return args.from === DEFAULTS.from
    && args.to === DEFAULTS.to
    && samePath(args.taager, DEFAULTS.taager)
    && samePath(args.real, DEFAULTS.real)
    && samePath(args.missed, DEFAULTS.missed);
}

function readWorkbook(label, filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} workbook not found: ${resolved}`);
  }
  return fs.readFileSync(resolved);
}

function itemKeys(order, makeOrderKey) {
  return (order.items || [order]).map((item) => makeOrderKey(order.normPhone || item.normPhone, item.sku)).filter(Boolean);
}

function formatItem(item) {
  const qty = Number(item.qty || 1) || 1;
  const unitPrice = Number(item.unitPrice || 0) || 0;
  const subtotal = Number(item.subtotal || (unitPrice * qty)) || 0;
  const marker = qty > 10 ? " MANUAL_REVIEW_QTY" : "";
  return `${item.sku || "NO_SKU"} qty=${qty} unit=${unitPrice} subtotal=${subtotal}${marker}`;
}

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

function assertEqual(actual, expected, message, failures) {
  if (actual !== expected) failures.push(`${message}: expected ${expected}, got ${actual}`);
}

function parseLocalDate(value, label) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`${label} must use YYYY-MM-DD, got: ${value}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function buildDryRun(input = DEFAULTS) {
  const args = { ...DEFAULTS, ...(input || {}) };
  const failures = [];
  const fromDate = parseLocalDate(args.from, "--from");
  const toDate = parseLocalDate(args.to, "--to");

  const taagerBuffer = readWorkbook("Taager orders", args.taager);
  const realBuffer = readWorkbook("EasyOrders real orders", args.real);
  const missedBuffer = readWorkbook("EasyOrders missed orders", args.missed);

  const taagerKeys = parser.parseTaagerOrderKeys(taagerBuffer, args.country);
  const realOrders = parser.parseRealOrders(realBuffer, fromDate, toDate);
  const missedParsed = parser.parseMissedOrders(missedBuffer, fromDate, toDate);
  const missedOrders = missedParsed.orders || [];
  const phoneSkipped = missedParsed.skippedOrders || [];
  let catalog = parser.buildProductCatalog(realOrders);
  const taagerCatalog = parser.buildTaagerProductCatalog(taagerBuffer, args.country);
  const catalogQuantityRepairs = typeof parser.repairOrderQuantitiesFromCatalog === "function"
    ? parser.repairOrderQuantitiesFromCatalog(realOrders, catalog, taagerCatalog)
    : 0;
  if (catalogQuantityRepairs > 0) {
    catalog = parser.buildProductCatalog(realOrders);
  }
  const resolvedMissedResult = parser.resolveMissedOrders(missedOrders, catalog, taagerCatalog);
  const resolvedMissed = resolvedMissedResult.resolved || [];
  const catalogSkipped = resolvedMissedResult.skippedOrders || [];
  const dedupe = parser.mergeAndDeduplicate(realOrders, resolvedMissed, taagerKeys);
  const catalogUnknownUncertain = catalogSkipped.filter((row) => {
    const normPhone = normalizePhone(row.normalizedPhone || row.normPhone || row.rawPhone || row.phone || "", args.country);
    if (!normPhone) return false;
    const blockingPhones = taagerKeys.taagerBlockingPhones instanceof Set ? taagerKeys.taagerBlockingPhones : new Set();
    return !blockingPhones.has(normPhone);
  });
  const groupedPrepared = buildGroupedCartOrders(dedupe.orders || []).map((order) => ({
    ...order,
    recoverySource: order.source,
    easyOrderUuid: order.easyOrderUuid || order.orderUuid || order.orderId || "",
  }));
  const preparedDedupe = dedupePreparedRealOrders(groupedPrepared, args.country);
  const prepared = preparedDedupe.orders || [];
  const preparedReal = prepared.filter((order) => order.source === "real");
  const preparedMissed = prepared.filter((order) => order.source === "missed");

  const preparedKeys = new Set();
  for (const order of prepared) {
    for (const key of itemKeys(order, parser.makeOrderKey)) {
      assertCondition(!taagerKeys.has(key), `Prepared key already exists in Taager: ${key}`, failures);
      assertCondition(!preparedKeys.has(key), `Duplicate prepared key: ${key}`, failures);
      preparedKeys.add(key);
    }
  }

  for (const order of preparedReal) {
    assertCondition(!!order.orderId, `Real recovery order missing EasyOrders UUID/orderId: ${order.name || order.normPhone}`, failures);
  }

  for (const order of prepared) {
    for (const item of order.items || [order]) {
      const qty = Number(item.qty || 1) || 1;
      const unitPrice = Number(item.unitPrice || 0) || 0;
      const subtotal = Number(item.subtotal || 0) || 0;
      assertCondition(!!item.sku, `Prepared item missing SKU: ${order.name || order.normPhone}`, failures);
      assertCondition(qty > 0, `Prepared item has invalid quantity: ${formatItem(item)}`, failures);
      assertCondition(unitPrice > 0 || subtotal > 0, `Prepared item has no trusted price: ${formatItem(item)}`, failures);
    }
  }

  const manualReviewQty = prepared.flatMap((order) => (order.items || [order])
    .filter((item) => (Number(item.qty || 1) || 1) > 10)
    .map((item) => ({ order, item })));

  const summary = {
    dateRange: `${args.from}..${args.to}`,
    files: {
      taager: path.resolve(args.taager),
      real: path.resolve(args.real),
      missed: path.resolve(args.missed),
    },
    parsed: {
      taagerOrderCount: Number(taagerKeys.taagerOrderCount || 0),
      taagerPhoneSkuKeys: Number(taagerKeys.taagerAllPhoneSkuKeys || taagerKeys.size || 0),
      taagerBlockingPhoneSkuKeys: Number(taagerKeys.taagerBlockingPhoneSkuKeys || taagerKeys.size || 0),
      taagerDeliveredOnlyPhoneSkuKeys: Number(taagerKeys.taagerDeliveredOnlyPhoneSkuKeys || 0),
      realOrders: realOrders.length,
      missedRows: missedOrders.length,
      missedResolved: resolvedMissed.length,
      phoneSkipped: phoneSkipped.length,
      catalogSkipped: catalogSkipped.length,
      catalogUnknownUncertain: catalogUnknownUncertain.length,
      catalogQuantityRepairs,
    },
    dedupe: dedupe.stats,
    recoveryDryRun: {
      preparedOrders: prepared.length,
      preparedReal: preparedReal.length,
      preparedMissed: preparedMissed.length,
      preparedPhoneSkuKeys: preparedKeys.size,
      uncertainNoTrustedProductReference: catalogUnknownUncertain.length,
      conflictingEasyOrderUuidRows: (preparedDedupe.manualRows || []).length,
      manualReviewQuantityRows: manualReviewQty.length,
    },
  };

  if (manualReviewQty.length > 0) {
    summary.recoveryDryRun.manualReviewGuard = `${manualReviewQty.length} prepared line(s) have quantity > 10 and must not be saved/resend/converted automatically.`;
  }

  const strictFixture = usingDefaultFixture(args) && args["no-strict"] !== true;
  if (strictFixture) {
    assertEqual(Number(taagerKeys.taagerOrderCount || 0), 114, "fixture Taager order count changed", failures);
    assertEqual(Number(taagerKeys.taagerAllPhoneSkuKeys || taagerKeys.size || 0), 110, "fixture Taager all phone+SKU key count changed", failures);
    assertEqual(taagerKeys.size, 98, "fixture Taager blocking phone+SKU key count changed", failures);
    assertEqual(Number(taagerKeys.taagerDeliveredOnlyPhoneSkuKeys || 0), 12, "fixture Taager delivered-only phone+SKU key count changed", failures);
    assertEqual(realOrders.length, 47, "fixture valid real order item count changed", failures);
    assertEqual(missedOrders.length, 7, "fixture valid missed row count changed", failures);
    assertEqual(resolvedMissed.length, 6, "fixture resolved missed row count changed", failures);
    assertEqual(phoneSkipped.length, 7, "fixture phone-skipped missed row count changed", failures);
    assertEqual(catalogSkipped.length, 1, "fixture catalog-skipped missed row count changed", failures);
    assertEqual(dedupe.stats.realNew, 3, "fixture real recovery target count changed", failures);
    assertEqual(dedupe.stats.missedNew, 1, "fixture missed recovery target count changed", failures);
    assertEqual(catalogUnknownUncertain.length, 1, "fixture no-catalog missed uncertain count changed", failures);
    assertEqual(prepared.length, 4, "fixture prepared recovery group count changed", failures);
    assertEqual(preparedReal.length, 3, "fixture prepared real group count changed", failures);
    assertEqual(preparedMissed.length, 1, "fixture prepared missed group count changed", failures);
    assertEqual((preparedDedupe.manualRows || []).length, 0, "fixture conflicting EasyOrders UUID count changed", failures);
    assertEqual(manualReviewQty.length, 0, "fixture manual-review quantity count changed", failures);
  }

  return {
    args,
    summary,
    prepared,
    preparedReal,
    preparedMissed,
    preparedDedupe,
    manualReviewQty,
    failures,
  };
}

function printDryRun(result) {
  const { args, summary, prepared, preparedDedupe, manualReviewQty, failures } = result;
  console.log("\n=== Affiliate Recovery Sheet Dry Run ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nPrepared recovery targets:");
  prepared.forEach((order, index) => {
    const phone = normalizePhone(order.normPhone || order.phone || "", args.country) || order.normPhone || order.phone || "";
    const items = (order.items || [order]).map(formatItem).join(" | ");
    const action = (order.items || [order]).some((item) => (Number(item.qty || 1) || 1) > 10)
      ? "manual_review_before_send"
      : "edit_modal_then_resend_or_convert";
    console.log(`${index + 1}. ${order.source} ${order.name || ""} ${phone} ${order.orderId || ""} -> ${action} -> ${items}`);
  });

  if (manualReviewQty.length > 0) {
    console.log(`\nManual-review guard: ${manualReviewQty.length} prepared line(s) have quantity > 10 and must not be saved/resend/converted automatically.`);
  }

  if ((preparedDedupe.manualRows || []).length > 0) {
    console.log(`\nConflicting EasyOrders UUID guard: ${(preparedDedupe.manualRows || []).length} row(s) moved to Uncertain/manual review before live UI processing.`);
    (preparedDedupe.manualRows || []).forEach((row, index) => {
      const phone = normalizePhone(row.normPhone || row.phone || row.rawPhone || "", args.country) || row.normPhone || row.phone || "";
      console.log(`${index + 1}. ${row.name || ""} ${phone} ${row.easyOrderUuid || row.orderId || ""} -> ${row.reason}`);
    });
  }

  if (failures.length > 0) {
    console.error("\nDry-run failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log("\nAffiliate recovery sheet dry-run passed.");
}

function main() {
  printDryRun(buildDryRun(parseArgs(process.argv)));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULTS,
  buildDryRun,
  formatItem,
};
