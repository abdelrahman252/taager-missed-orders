"use strict";

const XLSX = require("xlsx");
const { normalizePhone, formatPhone } = require("./phone");
const { orderLineItems } = require("./cart-order-groups");
const { makeOrderKey, normalizeProductName, productNamesMatch } = require("./parser");
const MAX_SAFE_AUTO_QUANTITY = 12;

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function splitTokens(value) {
  return String(value == null ? "" : value)
    .split(/\r?\n|[,|]/)
    .map((part) => cleanText(part))
    .filter(Boolean);
}

function recoveryOrderId(order) {
  return cleanText(order.easyOrderUuid || order.easyOrderId || order.orderUuid || order.orderId || order.id);
}

function recoveryShortId(order) {
  return cleanText(order.easyShortId || order.shortId || order.short_id || "");
}

function lineKey(item, country = "sa") {
  const phone = item.normPhone || normalizePhone(item.phone || item.rawPhone || "", country);
  return makeOrderKey(phone, item.sku);
}

function candidateKeys(candidate, country = "sa") {
  return (candidate.items || orderLineItems(candidate) || [])
    .map((item) => lineKey({ ...candidate, ...item, normPhone: candidate.normPhone || item.normPhone }, country))
    .filter(Boolean);
}

function groupRealRecoveryCandidates(realOrders, taagerKeys, options = {}) {
  const country = options.country || "sa";
  const groups = new Map();
  for (const row of realOrders || []) {
    const groupKey = row.uploadGroupKey || recoveryOrderId(row) || [
      row.source || "real",
      row.normPhone || "",
      row.easyCreatedAt || row.createdAt || "",
      row.name || "",
    ].join("|");
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        source: "real",
        recoverySource: "real",
        uploadGroupKey: groupKey,
        easyOrderUuid: recoveryOrderId(row),
        easyShortId: recoveryShortId(row),
        normPhone: row.normPhone || normalizePhone(row.rawPhone || "", country),
        rawPhone: row.rawPhone || "",
        phone: formatPhone(row.normPhone || row.rawPhone || "", country) || "",
        name: row.name || "",
        city: row.city || "",
        address: row.address || "",
        date: row.date || row.createdAt || "",
        createdAt: row.createdAt || "",
        easyCreatedAt: row.easyCreatedAt || "",
        items: [],
      });
    }
    const candidate = groups.get(groupKey);
    candidate.items.push({
      sku: cleanText(row.sku),
      productName: cleanText(row.productName),
      qty: Number(row.qty || 1) || 1,
      unitPrice: Number(row.unitPrice || 0) || 0,
      subtotal: Number(row.subtotal || 0) || 0,
      trusted: !!row.sku,
      referenceSource: "easyorders-real-export",
      quantitySource: row.quantitySource || (row.quantityRepair ? "repaired_quantity" : "easyorders-real-export"),
      quantityRepair: row.quantityRepair || null,
      quantityRepairSkipped: row.quantityRepairSkipped || null,
      priceSource: row.priceSource || "easyorders-real-export-item-price",
      priceOptions: Array.isArray(row.priceOptions) ? row.priceOptions : [],
    });
  }

  const attempted = [];
  const skippedAlready = [];
  const skippedPartial = [];
  const skippedMissingSku = [];

  for (const candidate of groups.values()) {
    const keys = candidateKeys(candidate, country);
    candidate.keys = keys;
    if (!keys.length) {
      candidate.status = "skipped_missing_sku";
      skippedMissingSku.push(candidate);
      continue;
    }
    const existingCount = keys.filter((key) => taagerKeys && taagerKeys.has && taagerKeys.has(key)).length;
    if (existingCount === keys.length) {
      candidate.status = "skipped_already_in_taager";
      skippedAlready.push(candidate);
      continue;
    }
    if (existingCount > 0) {
      candidate.status = "skipped_partial_already_in_taager";
      skippedPartial.push(candidate);
      continue;
    }
    candidate.status = "pending";
    attempted.push(candidate);
  }

  return { attempted, skippedAlready, skippedPartial, skippedMissingSku };
}

function findCatalogMatch(productName, catalog, taagerCatalog) {
  const clean = normalizeProductName(productName);
  if (!clean) return null;
  const sources = [
    { source: "easyorders-catalog", catalog: catalog || {} },
    { source: "taager-catalog", catalog: taagerCatalog || {} },
  ];
  for (const source of sources) {
    if (source.catalog[clean]) return { ...source.catalog[clean], referenceSource: source.source };
    const lower = clean.toLowerCase();
    for (const [name, value] of Object.entries(source.catalog)) {
      if (productNamesMatch(lower, name)) return { ...value, referenceSource: source.source };
    }
  }
  return null;
}

function priceOptionsFromCatalogMatch(match) {
  const prices = match && match.prices && typeof match.prices === "object" ? match.prices : {};
  return Object.entries(prices)
    .map(([qty, subtotal]) => {
      const q = Number(qty) || 0;
      const total = Number(subtotal) || 0;
      return {
        qty: q,
        subtotal: total,
        unitPrice: q > 0 ? total / q : total,
      };
    })
    .filter((option) => option.qty > 0 && option.subtotal > 0)
    .sort((a, b) => a.qty - b.qty);
}

function referenceItemForProduct(productName, catalog, taagerCatalog) {
  const match = findCatalogMatch(productName, catalog, taagerCatalog);
  if (!match) return null;
  const priceOptions = priceOptionsFromCatalogMatch(match);
  const qty = Number(match.minQty || 1) || 1;
  const priceForQty = match.prices && (match.prices[qty] || match.prices[Object.keys(match.prices)[0]]);
  const subtotal = Number(priceForQty || 0) || 0;
  return {
    sku: cleanText(match.sku),
    productName: cleanText(match.productName || productName),
    qty,
    subtotal,
    unitPrice: qty > 0 ? subtotal / qty : subtotal,
    priceOptions,
    qtyCounts: match.qtyCounts || {},
    totalSamples: Number(match.totalSamples || 0) || 0,
    dominantQty: Number(match.dominantQty || qty) || qty,
    dominantQtyCount: Number(match.dominantQtyCount || 0) || 0,
    dominantQtyConfidence: Number(match.dominantQtyConfidence || 0) || 0,
    maxQty: Number(match.maxQty || qty) || qty,
    trusted: !!match.sku && subtotal > 0,
    referenceSource: match.referenceSource || match.source || "catalog",
  };
}

function priceClose(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= 0.009;
}

function quantityFromReferencePrice(reference, modalPrice) {
  if (!reference) return null;
  const options = Array.isArray(reference.priceOptions) && reference.priceOptions.length
    ? reference.priceOptions
    : [{
        qty: Number(reference.qty || 1) || 1,
        subtotal: Number(reference.subtotal || 0) || 0,
        unitPrice: Number(reference.unitPrice || 0) || 0,
      }];
  for (const option of options) {
    if (priceClose(modalPrice, option.subtotal) || priceClose(modalPrice, option.unitPrice)) {
      return Number(option.qty || 1) || 1;
    }
  }
  return null;
}

function suspiciousQuantityLimit(reference) {
  const maxKnownQty = Math.max(0, Number(reference && reference.maxQty || 0) || 0);
  return Math.max(MAX_SAFE_AUTO_QUANTITY, maxKnownQty > 0 ? maxKnownQty * 3 : MAX_SAFE_AUTO_QUANTITY);
}

function isSuspiciousQuantity(reference, modalQty) {
  if (!reference) return false;
  const currentQty = Number(modalQty || 0) || 0;
  return currentQty > suspiciousQuantityLimit(reference);
}

function quantityFromSuspiciousReference(reference, modalQty) {
  if (!reference) return null;
  const currentQty = Number(modalQty || 0) || 0;
  if (!isSuspiciousQuantity(reference, currentQty)) return null;
  const dominantQty = Number(reference.dominantQty || reference.qty || 0) || 0;
  const totalSamples = Number(reference.totalSamples || 0) || 0;
  const confidence = Number(reference.dominantQtyConfidence || 0) || 0;
  if (dominantQty > 0 && totalSamples >= 3 && confidence >= 0.7) {
    return dominantQty;
  }
  return null;
}

function priceOptionForQty(reference, qty) {
  const targetQty = Number(qty || 0) || 0;
  if (targetQty <= 0) return null;
  return (Array.isArray(reference && reference.priceOptions) ? reference.priceOptions : [])
    .map((option) => {
      const q = Number(option && option.qty || 0) || 0;
      const subtotal = Number(option && option.subtotal || 0) || 0;
      const unitPrice = Number(option && option.unitPrice || 0) || (q > 0 ? subtotal / q : 0);
      return { qty: q, subtotal, unitPrice };
    })
    .find((option) => option.qty === targetQty && option.subtotal > 0 && option.unitPrice > 0) || null;
}

function referenceUsesInferredQuantity(reference) {
  const text = [
    reference && reference.referenceSource,
    reference && reference.quantitySource,
    reference && reference.priceSource,
    reference && reference.catalogSource,
    reference && reference.quantityRepair && reference.quantityRepair.source,
  ].filter(Boolean).join(" ").toLowerCase();
  return !!(reference && reference.quantityRepair)
    || /catalog|history|repair|repaired|inferred/.test(text);
}

function quantityEditDecision(reference, modalItem = {}) {
  const expectedQty = Number(reference && reference.qty || 1) || 1;
  const modalQty = Number(modalItem && modalItem.qty || 0) || 0;
  const modalPrice = Number(modalItem && modalItem.price || 0) || 0;
  const fallbackUnitPrice = Number(reference && reference.unitPrice || 0) || 0;
  const option = priceOptionForQty(reference, expectedQty);
  const expectedUnitPrice = option ? option.unitPrice : fallbackUnitPrice;
  const inferredQuantity = referenceUsesInferredQuantity(reference);
  const priceVerified = !!option && modalPrice > 0 && priceClose(modalPrice, option.unitPrice);

  if (expectedQty > MAX_SAFE_AUTO_QUANTITY) {
    return { expectedQty, expectedUnitPrice, priceVerified, inferredQuantity, manualReview: true, reason: "normal_flow_prepared_quantity_is_suspicious" };
  }
  if (expectedQty > 1 && inferredQuantity && !priceVerified) {
    return { expectedQty, expectedUnitPrice, priceVerified, inferredQuantity, manualReview: true, reason: "quantity_tier_price_not_verified" };
  }
  return {
    expectedQty,
    expectedUnitPrice,
    priceVerified,
    inferredQuantity,
    manualReview: false,
    shouldEditQuantity: expectedQty > 0 && modalQty !== expectedQty,
    shouldEditPrice: expectedUnitPrice > 0 && !priceClose(modalPrice, expectedUnitPrice),
    reason: "matched_normal_flow_prepared_order",
  };
}

function normalizeAttemptRow(candidate, action = {}) {
  const items = (candidate.items || []).map((item) => ({
    sku: cleanText(item.sku),
    productName: cleanText(item.productName),
    qty: Number(item.qty || 1) || 1,
    unitPrice: Number(item.unitPrice || 0) || 0,
    subtotal: Number(item.subtotal || 0) || 0,
    trusted: item.trusted === true,
    referenceSource: item.referenceSource || "",
    quantitySource: item.quantitySource || "",
    quantityRepair: item.quantityRepair || null,
    quantityRepairSkipped: item.quantityRepairSkipped || null,
    priceSource: item.priceSource || "",
    priceOptions: Array.isArray(item.priceOptions) ? item.priceOptions : [],
  }));
  return {
    ...candidate,
    items,
    keys: candidate.keys || candidateKeys({ ...candidate, items }),
    actionStatus: action.status || candidate.actionStatus || "attempted",
    actionMessage: action.message || candidate.actionMessage || "",
    attempts: Number(candidate.attempts || action.attempts || 1) || 1,
    sentAsIs: action.sentAsIs === true || candidate.sentAsIs === true || items.some((item) => !item.trusted),
    validationErrors: action.validationErrors || candidate.validationErrors || [],
  };
}

function parseTaagerFailedOrders(buffer, country = "sa") {
  if (!buffer) return [];
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cleanText(cell));
  const find = (patterns, fallback) => {
    for (const pattern of patterns) {
      const idx = header.findIndex((name) => pattern.test(name));
      if (idx >= 0) return idx;
    }
    return fallback;
  };
  const phoneIdx = find([/phone/i, /رقم.*هاتف|الهاتف/], 6);
  const codeIdx = find([/failure|error|reason/i, /كود.*فشل/], 8);
  const skuIdx = find([/products|sku/i, /المنتجات/], 10);
  const qtyIdx = find([/quantit/i, /الكميات/], 11);
  const priceIdx = find([/prices?/i, /الأسعار/], 12);
  const storeOrderIdx = find([/store.*order|merchant.*order/i, /كود.*الطلب.*المتجر/], 14);
  const nameIdx = find([/recipient|customer|name/i, /اسم/], 0);
  const createdIdx = find([/created/i, /الإنشاء/], 5);

  return rows.slice(1).map((row, index) => {
    const storeOrderCode = cleanText(row[storeOrderIdx]);
    const uuidMatch = storeOrderCode.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const phone = normalizePhone(row[phoneIdx], country);
    const skus = splitTokens(row[skuIdx]);
    return {
      row: index + 2,
      name: cleanText(row[nameIdx]),
      phone,
      formattedPhone: formatPhone(phone, country) || cleanText(row[phoneIdx]),
      failureCode: cleanText(row[codeIdx]),
      error: cleanText(row[codeIdx]),
      skus,
      qtys: splitTokens(row[qtyIdx]),
      prices: splitTokens(row[priceIdx]),
      storeOrderCode,
      easyOrderUuid: uuidMatch ? uuidMatch[0] : "",
      createdAt: cleanText(row[createdIdx]),
      keys: skus.map((sku) => makeOrderKey(phone, sku)).filter(Boolean),
    };
  }).filter((row) => row.phone || row.easyOrderUuid || row.keys.length);
}

function failedRowMatchesAttempt(failedRow, attempt, country = "sa") {
  const attemptUuid = recoveryOrderId(attempt);
  if (attemptUuid && failedRow.easyOrderUuid && attemptUuid.toLowerCase() === failedRow.easyOrderUuid.toLowerCase()) return true;
  const attemptKeys = new Set(candidateKeys(attempt, country));
  if (failedRow.keys && failedRow.keys.some((key) => attemptKeys.has(key))) return true;
  if (attemptKeys.size === 0) {
    const attemptPhone = normalizePhone(attempt.normPhone || attempt.normalizedPhone || attempt.phone || attempt.rawPhone || "", country);
    if (attemptPhone && failedRow.phone && attemptPhone === failedRow.phone) return true;
  }
  return false;
}

function isAlreadyRealOrderUnverified(row) {
  const status = cleanText(row && (row.finalStatus || row.actionStatus || row.status || row.reason)).toLowerCase();
  const message = cleanText(row && (row.actionMessage || row.message || row.error)).toLowerCase();
  return row?.missingConvertNeedsRealRetry === true
    || status === "already_in_real_orders_unverified"
    || /convert to order button not available/i.test(message);
}

function isOrderSentAwaitingVerification(row) {
  const status = cleanText(row && (row.finalStatus || row.actionStatus || row.status || row.reason)).toLowerCase();
  const message = cleanText(row && (row.actionMessage || row.message || row.error)).toLowerCase();
  return status === "sent"
    || status === "sent_unverified"
    || status === "converted"
    || /\border sent\b/i.test(message)
    || /resend clicked/i.test(message)
    || /convert clicked/i.test(message);
}

function recoveryUncertainStatus(row) {
  if (isAlreadyRealOrderUnverified(row)) return "already_in_real_orders_unverified";
  if (isOrderSentAwaitingVerification(row)) return "awaiting_taager_verification";
  return "not_found_after_retry";
}

function classifyRecoveryAttempts(attempts, verifiedTaagerKeys, failedRows = [], options = {}) {
  const country = options.country || "sa";
  const verified = [];
  const failedInTaager = [];
  const unresolved = [];

  for (const rawAttempt of attempts || []) {
    const attempt = normalizeAttemptRow(rawAttempt);
    const keys = candidateKeys(attempt, country);
    const failedMatch = (failedRows || []).find((row) => failedRowMatchesAttempt(row, attempt, country));
    const allVerified = keys.length > 0 && keys.every((key) => verifiedTaagerKeys && verifiedTaagerKeys.has && verifiedTaagerKeys.has(key));
    const uncertainActionStatus = recoveryUncertainStatus(attempt);
    const actionNeedsVerification = uncertainActionStatus !== "not_found_after_retry";
    if (allVerified) {
      verified.push({ ...attempt, finalStatus: "verified_in_taager" });
    } else if (actionNeedsVerification) {
      unresolved.push({
        ...attempt,
        finalStatus: uncertainActionStatus,
        uncertain: true,
        uploadedWithWarning: true,
      });
    } else if (failedMatch) {
      failedInTaager.push({
        ...attempt,
        finalStatus: "failed_in_taager",
        failureCode: failedMatch.failureCode || failedMatch.error || "unknown_failed_order",
        failedOrderRow: failedMatch.row,
        failedStoreOrderCode: failedMatch.storeOrderCode || "",
      });
    } else {
      unresolved.push({
        ...attempt,
        finalStatus: uncertainActionStatus,
        uncertain: true,
        uploadedWithWarning: true,
      });
    }
  }

  return { verified, failedInTaager, unresolved };
}

function recoveryProductSummary(rows) {
  const summary = new Map();
  for (const row of rows || []) {
    for (const item of row.items || orderLineItems(row) || []) {
      const key = item.productName || item.sku || "Unknown";
      if (!summary.has(key)) summary.set(key, { productName: key, count: 0, totalQty: 0 });
      const entry = summary.get(key);
      entry.count++;
      entry.totalQty += Number(item.qty || 1) || 1;
    }
  }
  return Array.from(summary.values());
}

function recoveryResultRows(rows, country = "sa") {
  return (rows || []).map((row) => {
    const first = (row.items || [])[0] || row;
    const rawPhone = row.rawPhone || first.rawPhone || row.phone || "";
    const normalizedPhone = row.normalizedPhone || row.normPhone || first.normPhone || normalizePhone(rawPhone, country) || "";
    const reason = row.reason || row.actionReason || row.finalStatus || row.actionStatus || row.status || "";
    const actionMessage = row.actionMessage || row.message || row.error || "";
    const productName = (row.items || []).map((item) => item.productName || item.sku).filter(Boolean).join(" | ") || row.productName || first.productName || "";
    return {
      name: row.name || "",
      rawPhone,
      normalizedPhone,
      phone: formatPhone(normalizedPhone || rawPhone, country) || row.phone || "",
      productName,
      sku: (row.items || []).map((item) => item.sku).filter(Boolean).join(" | ") || first.sku || "",
      qty: (row.items || []).reduce((sum, item) => sum + (Number(item.qty || 1) || 1), 0) || first.qty || 1,
      unitPrice: first.unitPrice || "",
      subtotal: (row.items || []).reduce((sum, item) => sum + (Number(item.subtotal || 0) || 0), 0) || first.subtotal || "",
      easyOrdersQty: row.easyOrdersQty || row.originalQty || first.easyOrdersQty || first.originalQty || first.qty || "",
      easyOrdersSubtotal: row.easyOrdersSubtotal || row.originalSubtotal || first.easyOrdersSubtotal || first.originalSubtotal || first.subtotal || "",
      suggestedQty: row.suggestedQty || first.suggestedQty || "",
      suggestedSubtotal: row.suggestedSubtotal || first.suggestedSubtotal || "",
      confidence: row.confidence || first.confidence || "",
      sampleCount: row.sampleCount || first.sampleCount || "",
      city: row.city || "",
      address: row.address || "",
      date: row.date || row.createdAt || "",
      createdAt: row.createdAt || "",
      easyCreatedAt: row.easyCreatedAt || "",
      source: row.recoverySource || row.source || "",
      recoveryStatus: row.finalStatus || row.actionStatus || row.status || "",
      failureCode: row.failureCode || "",
      actionMessage,
      reason,
      quantitySource: first.quantitySource || row.quantitySource || "",
      quantityRepairSource: (first.quantityRepair && first.quantityRepair.source) || row.quantityRepairSource || "",
      priceSource: first.priceSource || row.priceSource || "",
      easyOrdersQtyEdited: (row.editResult && row.editResult.edits || []).some((edit) => edit.field === "quantity") ? "YES" : "NO",
      existingSkus: row.existingSkus || "",
      missingSkus: row.missingSkus || "",
      duplicateSkus: row.duplicateSkus || "",
      uncertain: row.uncertain === true,
      uploadedWithWarning: row.uploadedWithWarning === true,
      accountEmail: row.accountEmail || "",
      accountLabel: row.accountLabel || "",
      taagerCountry: row.taagerCountry || country,
      easyOrderUuid: row.easyOrderUuid || "",
      easyShortId: row.easyShortId || "",
      detailUrl: row.detailUrl || "",
    };
  });
}

function buildAffiliateRecoveryResult(parts, country = "sa") {
  const attempted = [
    ...(parts.realAttempts || []),
    ...(parts.missedAttempts || []),
  ].map((row) => normalizeAttemptRow(row));
  const verified = parts.verified || [];
  const failedInTaager = parts.failedInTaager || [];
  const unresolved = parts.unresolved || [];
  const alreadyRealUnverified = unresolved.filter(isAlreadyRealOrderUnverified);
  const failedUnresolved = unresolved.filter((row) => !isAlreadyRealOrderUnverified(row));
  const skippedAlready = parts.skippedAlready || [];
  const skippedCompleted = parts.skippedCompleted || [];
  const skippedManual = parts.skippedManual || [];
  const sentAsIs = attempted.filter((row) => row.sentAsIs);
  return {
    enabled: true,
    attempted,
    attemptedCount: attempted.length,
    realAttempted: (parts.realAttempts || []).length,
    missedAttempted: (parts.missedAttempts || []).length,
    verified,
    verifiedCount: verified.length,
    failedInTaager,
    failedInTaagerCount: failedInTaager.length,
    unresolved,
    unresolvedCount: unresolved.length,
    alreadyRealUnverified,
    alreadyRealUnverifiedCount: alreadyRealUnverified.length,
    failedUnresolved,
    failedUnresolvedCount: failedUnresolved.length,
    skippedAlready,
    skippedAlreadyCount: skippedAlready.length,
    skippedCompleted,
    skippedCompletedCount: skippedCompleted.length,
    skippedManual,
    skippedManualCount: skippedManual.length,
    sentAsIs,
    sentAsIsCount: sentAsIs.length,
    validationErrors: attempted.flatMap((row) => row.validationErrors || []),
    attemptedRows: recoveryResultRows(attempted, country),
    verifiedRows: recoveryResultRows(verified, country),
    failedRows: recoveryResultRows(failedInTaager, country),
    skippedRows: recoveryResultRows([...skippedAlready, ...skippedCompleted, ...skippedManual, ...unresolved], country),
    manualReviewRows: recoveryResultRows([...skippedManual, ...unresolved], country),
    productSummary: recoveryProductSummary(verified),
  };
}

module.exports = {
  cleanText,
  splitTokens,
  groupRealRecoveryCandidates,
  quantityFromReferencePrice,
  quantityFromSuspiciousReference,
  quantityEditDecision,
  isSuspiciousQuantity,
  referenceItemForProduct,
  normalizeAttemptRow,
  parseTaagerFailedOrders,
  classifyRecoveryAttempts,
  isAlreadyRealOrderUnverified,
  isOrderSentAwaitingVerification,
  buildAffiliateRecoveryResult,
  recoveryResultRows,
  recoveryProductSummary,
  candidateKeys,
};
