"use strict";

const { createEasyOrdersUiRecovery } = require("./easy-orders-ui-recovery");
const { createTaagerFailedOrdersExportFlow } = require("./taager-failed-orders-export-flow");
const { formatPhone, normalizePhone } = require("./phone");
const { COUNTRY_CONFIG, normalizeProvince } = require("./output");
const {
  buildAffiliateRecoveryResult,
  classifyRecoveryAttempts,
  filterFailedRowsForAttempts,
  referenceItemForProduct,
} = require("./easy-orders-affiliate-recovery-data");

function mergeItems(existingItems, nextItems) {
  const seen = new Set();
  return [...(existingItems || []), ...(nextItems || [])].filter((item) => {
    const key = `${item.sku || ""}|${item.productName || ""}|${item.qty || ""}|${item.subtotal || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupePreparedRealOrders(prepared, country = "sa") {
  const passthrough = [];
  const byUuid = new Map();
  for (const order of prepared || []) {
    const source = order.recoverySource || order.source;
    const uuid = source === "real" ? String(order.easyOrderUuid || "").trim().toLowerCase() : "";
    if (!uuid) {
      passthrough.push(order);
      continue;
    }
    const current = byUuid.get(uuid);
    if (!current) {
      byUuid.set(uuid, { order, conflicts: [] });
      continue;
    }
    const currentPhone = normalizePhone(current.order.normPhone || current.order.phone || current.order.rawPhone || "", country);
    const nextPhone = normalizePhone(order.normPhone || order.phone || order.rawPhone || "", country);
    if (currentPhone && nextPhone && currentPhone === nextPhone) {
      current.order.items = mergeItems(current.order.items, order.items);
      continue;
    }
    current.conflicts.push(order);
  }

  const orders = [...passthrough];
  const manualRows = [];
  for (const [uuid, entry] of byUuid.entries()) {
    if (!entry.conflicts.length) {
      orders.push(entry.order);
      continue;
    }
    const conflictRows = [entry.order, ...entry.conflicts];
    for (const row of conflictRows) {
      manualRows.push({
        ...row,
        source: "real",
        recoverySource: "real",
        easyOrderUuid: row.easyOrderUuid || uuid,
        actionStatus: "skipped_manual",
        reason: "duplicate_easyorders_uuid_conflicting_phone",
        actionMessage: "Same EasyOrders order UUID produced conflicting phone candidates; review before resending",
      });
    }
  }
  return { orders, manualRows };
}

const RECOVERY_PROMOTABLE_MANUAL_REASONS = new Set([
  "ambiguous_sku_price_tier",
  "quantity_inference_requires_manual_review",
  "subtotal_not_in_sku_tiers",
  "sku_tier_profile_too_weak",
]);

function skippedRecoveryKey(row, country = "sa") {
  return [
    normalizePhone(row && (row.normPhone || row.normalizedPhone || row.phone || row.rawPhone) || "", country),
    row && (row.easyOrderUuid || row.easyOrderId || row.orderUuid || row.orderId || ""),
    row && (row.easyCreatedAt || row.createdAt || row.date || ""),
    row && (row.name || row.customerName || ""),
    row && (row.productName || row.product || ""),
  ].map((value) => String(value || "").trim()).join("|");
}

function promoteSkippedRowsForLiveTierRecovery(skippedRows = [], input = {}, country = "sa") {
  const promoted = [];
  const promotedKeys = new Set();
  for (const row of skippedRows || []) {
    const source = row && (row.recoverySource || row.source);
    const reason = String(row && row.reason || "");
    if (source !== "missed" || !RECOVERY_PROMOTABLE_MANUAL_REASONS.has(reason)) continue;
    const productName = row.productName || row.product || "";
    const reference = referenceItemForProduct(productName, input.catalog, input.taagerCatalog);
    if (!reference || !reference.trusted) continue;
    const normPhone = normalizePhone(row.normalizedPhone || row.normPhone || row.phone || row.rawPhone || "", country);
    if (!normPhone) continue;
    const city = row.city || row.region || "";
    const address = row.address || city || "";
    const name = row.name || row.customerName || formatPhone(normPhone, country) || normPhone;
    const candidate = {
      ...row,
      source: "missed",
      recoverySource: "missed",
      promotedFromManualReview: true,
      promotedReason: reason,
      normPhone,
      normalizedPhone: normPhone,
      phone: formatPhone(normPhone, country) || normPhone,
      name,
      city,
      address,
      items: [{
        ...reference,
        source: "missed",
        recoverySource: "missed",
        trusted: true,
        quantitySource: "affiliate_recovery_live_modal_pending",
        priceSource: "affiliate_recovery_live_modal_pending",
        normPhone,
        phone: formatPhone(normPhone, country) || normPhone,
        rawPhone: row.rawPhone || row.phone || "",
        name,
        city,
        address,
        createdAt: row.createdAt || row.date || "",
        easyCreatedAt: row.easyCreatedAt || "",
      }],
    };
    promoted.push(candidate);
    promotedKeys.add(skippedRecoveryKey(row, country));
  }
  return { promoted, promotedKeys };
}

function createEasyOrdersAffiliateRecoveryFlow(options = {}) {
  const log = typeof options.log === "function" ? options.log : () => {};
  const stage = typeof options.stage === "function" ? options.stage : () => {};
  const progress = typeof options.progress === "function" ? options.progress : () => {};
  const exportTaagerOrders = options.exportTaagerOrders;
  const parseTaagerOrderKeys = options.parseTaagerOrderKeys;
  const country = options.country || "sa";
  let reportAttemptResult = () => {};
  const ui = createEasyOrdersUiRecovery({
    log,
    stage,
    goto: options.gotoEasyOrders,
    country,
    onAttemptResult: (row) => reportAttemptResult(row),
  });
  const taagerFailedFlow = createTaagerFailedOrdersExportFlow({
    log,
    stage,
    goto: options.gotoTaager,
    readDownloadToBuffer: options.readDownloadToBuffer,
    country,
  });

  if (typeof exportTaagerOrders !== "function") throw new Error("Affiliate recovery requires exportTaagerOrders");
  if (typeof parseTaagerOrderKeys !== "function") throw new Error("Affiliate recovery requires parseTaagerOrderKeys");

  async function verify(page, fromDate, toDate, label) {
    stage("affiliate-recovery.verify", "started", `Exporting Taager orders for ${label}`);
    const buffer = await exportTaagerOrders(page, fromDate, toDate);
    const keys = parseTaagerOrderKeys(buffer, country);
    stage("affiliate-recovery.verify", "ok", `Taager verification export ready for ${label}`, {
      keys: keys.size || 0,
    });
    return { buffer, keys };
  }

  function unresolvedAfterClassification(classification) {
    return [
      ...(classification.failedInTaager || []),
      ...(classification.unresolved || []),
    ].filter((row) => row.finalStatus !== "failed_in_taager");
  }

  function mapValue(mapOrObject, key) {
    if (!key) return "";
    if (mapOrObject instanceof Map) return mapOrObject.get(key) || "";
    if (mapOrObject && typeof mapOrObject === "object" && Object.prototype.hasOwnProperty.call(mapOrObject, key)) {
      return mapOrObject[key] || "";
    }
    return "";
  }

  function fallbackCityForOrder(order, items, input) {
    const explicit = order.city || order.region || (items || []).find((item) => item.city || item.region)?.city || (items || []).find((item) => item.city || item.region)?.region || "";
    if (explicit) return normalizeProvince(explicit, country, { fallbackProvince: input.fallbackProvince || "" });
    for (const item of items || []) {
      const bySku = mapValue(input.fallbackProvinceBySku, item.sku);
      if (bySku) return normalizeProvince(bySku, country, { fallbackProvince: input.fallbackProvince || "" });
    }
    if (input.fallbackProvince) return normalizeProvince(input.fallbackProvince, country);
    return (COUNTRY_CONFIG[country] && COUNTRY_CONFIG[country].defaultProvince) || "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0631\u064a\u0627\u0636";
  }

  function fallbackNameForOrder(order, items) {
    const name = order.name || (items || []).find((item) => item.name)?.name || "";
    if (String(name || "").trim()) return name;
    const phone = order.normPhone || order.phone || order.rawPhone || (items || []).find((item) => item.normPhone || item.phone || item.rawPhone)?.normPhone || "";
    const normalized = normalizePhone(phone, country);
    return formatPhone(normalized || phone, country) || normalized || String(phone || "").trim() || "\u0639\u0645\u064a\u0644";
  }

  function normalizePreparedOrder(order, input = {}) {
    const source = order && order.source === "missed" ? "missed" : "real";
    const rawItems = (Array.isArray(order.items) && order.items.length ? order.items : [order])
      .filter(Boolean);
    const cityFallback = fallbackCityForOrder(order, rawItems, input);
    const nameFallback = fallbackNameForOrder(order, rawItems);
    const items = rawItems
      .filter(Boolean)
      .map((item) => {
        const city = item.city || order.city || item.region || order.region || cityFallback || "";
        const address = item.address || order.address || city || "";
        return {
          ...item,
          sku: item.sku || "",
          productName: item.productName || "",
          qty: Number(item.qty || 1) || 1,
          unitPrice: Number(item.unitPrice || 0) || 0,
          subtotal: Number(item.subtotal || 0) || ((Number(item.unitPrice || 0) || 0) * (Number(item.qty || 1) || 1)),
          trusted: !!item.sku,
          referenceSource: item.referenceSource || item.catalogSource || "normal-flow-prepared-order",
          quantitySource: item.quantitySource || (item.quantityRepair ? "repaired_quantity" : "normal-flow-prepared-order"),
          quantityRepair: item.quantityRepair || null,
          quantityRepairSkipped: item.quantityRepairSkipped || null,
          priceSource: item.priceSource || item.catalogSource || "normal-flow-prepared-order",
          priceOptions: Array.isArray(item.priceOptions) ? item.priceOptions : [],
          source,
          recoverySource: source,
          normPhone: item.normPhone || order.normPhone || "",
          phone: item.phone || order.phone || "",
          name: item.name || order.name || nameFallback,
          city,
          address,
          createdAt: item.createdAt || order.createdAt || "",
          easyCreatedAt: item.easyCreatedAt || order.easyCreatedAt || "",
        };
      });
    const city = order.city || order.region || items[0]?.city || cityFallback || "";
    const address = order.address || items[0]?.address || city || "";
    return {
      ...order,
      source,
      recoverySource: source,
      easyOrderUuid: order.easyOrderUuid || order.orderUuid || order.orderId || "",
      easyShortId: order.easyShortId || order.shortId || order.short_id || order.ID || "",
      name: order.name || nameFallback,
      city,
      address,
      items,
      sentAsIs: false,
    };
  }

  async function run(page, input = {}) {
    const {
      preparedOrders,
      skippedOrders,
      fromDate,
      toDate,
      taagerFromDate,
      taagerToDate,
    } = input;

    const promotedSkipped = promoteSkippedRowsForLiveTierRecovery(skippedOrders, input, country);
    if (promotedSkipped.promoted.length) {
      log(`Affiliate recovery: promoted ${promotedSkipped.promoted.length} missed/manual rows for live modal tier repair.`);
    }
    const normalizedPrepared = [...(preparedOrders || []), ...promotedSkipped.promoted].map((order) => normalizePreparedOrder(order, input));
    const deduped = dedupePreparedRealOrders(normalizedPrepared, country);
    const prepared = deduped.orders;
    if (deduped.manualRows.length) {
      log(`Affiliate recovery: ${deduped.manualRows.length} real rows have conflicting EasyOrders UUID/phone candidates; moved to Uncertain manual review.`);
    }
    const realPrepared = prepared.filter((order) => (order.recoverySource || order.source) === "real");
    const missedPrepared = prepared.filter((order) => (order.recoverySource || order.source) === "missed");
    let progressCurrent = 0;
    let progressSuccess = 0;
    let progressFailed = 0;
    let progressTotal = prepared.length;
    const isProgressFailure = (row) => /skipped_manual|retry_skipped|convert_error|failed/i.test(String(row?.actionStatus || row?.finalStatus || ""));
    const progressLastOrder = (row, failed) => {
      const first = (row?.items || [])[0] || row || {};
      const product = row?.productName || first.productName || row?.sku || first.sku || "";
      const rawPhone = row?.normPhone || row?.normalizedPhone || row?.phone || row?.rawPhone || first.normPhone || first.phone || "";
      return {
        name: row?.name || first.name || "",
        product,
        sku: row?.sku || first.sku || "",
        city: row?.city || first.city || "",
        phone: formatPhone(normalizePhone(rawPhone, country) || rawPhone, country) || rawPhone,
        recoveryStatus: row?.actionStatus || row?.finalStatus || row?.status || "",
        error: failed ? (row?.actionMessage || row?.error || row?.failureCode || row?.actionStatus || "Needs review") : "",
      };
    };
    reportAttemptResult = (row) => {
      progressCurrent += 1;
      const failed = isProgressFailure(row);
      if (failed) progressFailed += 1;
      else progressSuccess += 1;
      progress({
        current: progressCurrent,
        total: progressTotal,
        success: progressSuccess,
        failed: progressFailed,
        lastOrder: progressLastOrder(row, failed),
      });
    };

    stage("affiliate-recovery.start", "started", `Starting EasyOrders affiliate recovery from normal-flow prepared orders: real=${realPrepared.length}, missed=${missedPrepared.length}`);
    log(`Affiliate recovery prepared orders from normal flow: total=${prepared.length}, real=${realPrepared.length}, missed=${missedPrepared.length}, skippedFromNormalFlow=${(skippedOrders || []).length}`);
    progress({
      current: 0,
      total: progressTotal,
      success: 0,
      failed: 0,
      lastOrder: { product: "Affiliate recovery queue prepared", recoveryStatus: "started" },
    });

    const realResult = await ui.processRealOrders(page, realPrepared);
    const missedResult = await ui.processMissedOrders(page, missedPrepared, fromDate, toDate);
    const firstAttempts = [
      ...(realResult.attempted || []),
      ...(missedResult.attempted || []),
    ];

    const firstVerification = await verify(page, taagerFromDate, taagerToDate, "first recovery pass");
    const firstClassification = classifyRecoveryAttempts(firstAttempts, firstVerification.keys, [], { country });
    const retryTargets = unresolvedAfterClassification(firstClassification);
    log(`Affiliate recovery retry targets after first verification: ${retryTargets.length}`);

    let retryAttempts = [];
    let finalVerification = firstVerification;
    if (retryTargets.length > 0) {
      progressTotal += retryTargets.length;
      progress({
        current: progressCurrent,
        total: progressTotal,
        success: progressSuccess,
        failed: progressFailed,
        lastOrder: { product: `Retrying ${retryTargets.length} unresolved recovery orders`, recoveryStatus: "retry" },
      });
      stage("affiliate-recovery.retry", "started", `Retrying ${retryTargets.length} unresolved orders once`);
      retryAttempts = await ui.retryAttempts(page, retryTargets, { fromDate, toDate });
      stage("affiliate-recovery.retry", "ok", `Retry attempted for ${retryAttempts.length} orders`);
      finalVerification = await verify(page, taagerFromDate, taagerToDate, "final recovery pass");
    }

    const attemptsById = new Map();
    for (const attempt of [...firstAttempts, ...retryAttempts]) {
      const key = attempt.uploadGroupKey || attempt.easyOrderUuid || attempt.detailUrl || `${attempt.recoverySource}|${attempt.normPhone}|${attempt.createdAt}|${attempt.items?.map((item) => item.sku).join(",")}`;
      attemptsById.set(key, { ...(attemptsById.get(key) || {}), ...attempt, attempts: Math.max(Number(attemptsById.get(key)?.attempts || 0), Number(attempt.attempts || 1)) });
    }
    const finalAttempts = Array.from(attemptsById.values());
    let finalClassification = classifyRecoveryAttempts(finalAttempts, finalVerification.keys, [], { country });
    let failedExport = { buffer: null, rows: [], error: "" };
    if ((finalClassification.unresolved || []).length > 0) {
      stage("affiliate-recovery.failed-orders", "started", "Downloading Taager failed orders for unresolved recovery rows");
      failedExport = await taagerFailedFlow.exportFailedOrders(page, input.failedOrdersFromText || input.taagerFromText, input.failedOrdersToText || input.taagerToText)
        .catch((error) => ({ buffer: null, rows: [], error: error.message || String(error) }));
      if (failedExport.error) log(`Affiliate recovery failed-orders diagnosis skipped/failed: ${failedExport.error}`);
      finalClassification = classifyRecoveryAttempts(finalAttempts, finalVerification.keys, failedExport.rows || [], { country });
      stage("affiliate-recovery.failed-orders", failedExport.error ? "warning" : "ok", failedExport.error || `Failed-orders rows loaded: ${(failedExport.rows || []).length}`);
    }

    const recovery = buildAffiliateRecoveryResult({
      realAttempts: finalAttempts.filter((row) => (row.recoverySource || row.source) === "real"),
      missedAttempts: finalAttempts.filter((row) => (row.recoverySource || row.source) === "missed"),
      verified: finalClassification.verified,
      failedInTaager: finalClassification.failedInTaager,
      unresolved: finalClassification.unresolved,
      skippedAlready: [
      ],
      skippedCompleted: missedResult.skippedCompleted || [],
      skippedManual: [
        ...(skippedOrders || []).filter((row) => !promotedSkipped.promotedKeys.has(skippedRecoveryKey(row, country))),
        ...(deduped.manualRows || []),
        ...(realResult.skippedManual || []),
        ...(missedResult.skippedManual || []),
      ],
    }, country);
    const failedDiagnosticRows = failedExport.rows || [];
    const matchedFailedDiagnosticRows = filterFailedRowsForAttempts(failedDiagnosticRows, finalAttempts, { country });
    recovery.failedOrdersDiagnostic = {
      rows: matchedFailedDiagnosticRows,
      matchedRows: matchedFailedDiagnosticRows,
      matchedRowCount: matchedFailedDiagnosticRows.length,
      rawRowCount: failedDiagnosticRows.length,
      rawRows: failedDiagnosticRows,
      buffer: failedExport.buffer ? Array.from(failedExport.buffer) : null,
      error: failedExport.error || "",
    };
    recovery.firstVerification = {
      taagerOrderCount: Number(firstVerification.keys && firstVerification.keys.taagerOrderCount || 0),
      keyCount: Number(firstVerification.keys && firstVerification.keys.size || 0),
    };
    recovery.finalVerification = {
      taagerOrderCount: Number(finalVerification.keys && finalVerification.keys.taagerOrderCount || 0),
      keyCount: Number(finalVerification.keys && finalVerification.keys.size || 0),
    };
    stage("affiliate-recovery.done", recovery.unresolvedCount > 0 || recovery.failedInTaagerCount > 0 ? "warning" : "ok", `Affiliate recovery complete: verified ${recovery.verifiedCount}, unresolved ${recovery.unresolvedCount}, failed ${recovery.failedInTaagerCount}`);
    return recovery;
  }

  return { run };
}

module.exports = {
  createEasyOrdersAffiliateRecoveryFlow,
  dedupePreparedRealOrders,
};
