"use strict";

const XLSX = require("xlsx");
const { normalizePhone } = require("./phone");
const { parseFullMonthSnapshot } = require("./parser");

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return Buffer.from(value);
  if (value && value.type === "Buffer" && Array.isArray(value.data)) return Buffer.from(value.data);
  throw new Error("Workbook buffer is missing or invalid.");
}

function parseDateKey(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const parts = String(value).split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function workbookRows(buffer, label) {
  let workbook;
  try {
    workbook = XLSX.read(asBuffer(buffer), { type: "buffer", cellDates: false });
  } catch (error) {
    throw new Error(`${label} workbook could not be read: ${error.message}`);
  }
  const sheetName = workbook.SheetNames && workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) throw new Error(`${label} workbook has no worksheets.`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
}

function normalizedHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findHeader(header, candidates) {
  const normalized = header.map(normalizedHeader);
  const wanted = candidates.map(normalizedHeader);
  for (const candidate of wanted) {
    const exact = normalized.indexOf(candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of wanted) {
    const partial = normalized.findIndex((value) => value && value.includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

const TAAGER_REQUIRED_HEADERS = {
  order: ["Order Number", "رقم الطلب"],
  status: ["Status", "الحالة"],
  created: ["Created At", "تاريخ الإنشاء"],
  products: ["Products", "SKU", "المنتجات"],
};

function validateTaagerWorkbook(buffer) {
  const rows = workbookRows(buffer, "Taager");
  if (rows.length < 1) throw new Error("Taager workbook is empty.");
  const header = rows[0] || [];
  const headerMap = {};
  const missing = [];
  Object.entries(TAAGER_REQUIRED_HEADERS).forEach(([name, candidates]) => {
    headerMap[name] = findHeader(header, candidates);
    if (headerMap[name] < 0) missing.push(name);
  });
  if (missing.length) {
    throw new Error(`This does not look like a Taager orders export. Missing required columns: ${missing.join(", ")}.`);
  }
  return { sourceRows: Math.max(0, rows.length - 1), headerMap };
}

function splitCellLines(value) {
  return String(value == null ? "" : value).split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
}

function parseExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function inDateRange(value, dateFrom, dateTo) {
  const parsed = parseExcelDate(value);
  if (!parsed) return false;
  const key = dateKey(parsed);
  return key >= dateKey(dateFrom) && key <= dateKey(dateTo);
}

function paymentMethod(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text === "cod" || text.includes("cash")) return "cod";
  return text;
}

function isPrepaid(method) {
  const text = String(method || "").trim().toLowerCase();
  return !!text && text !== "cod" && !text.includes("cash");
}

function paymentClassification(method) {
  if (!method) return "unknown";
  return isPrepaid(method) ? "prepaid" : "cod";
}

function dateKeyFromValue(value) {
  const parsed = parseExcelDate(value);
  return parsed ? dateKey(parsed) : "";
}

function mostFrequent(freq) {
  return Object.entries(freq || {}).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || "";
}

function normalizeSkuNameMap(value) {
  const map = {};
  Object.entries(value || {}).forEach(([sku, name]) => {
    const cleanSku = String(sku || "").trim();
    const cleanName = String(name || "").trim().replace(/\s+/g, " ");
    if (cleanSku && cleanName) map[cleanSku] = cleanName;
  });
  return map;
}

function applySkuNameCacheFallback(rows, cachedSkuNameMap = {}) {
  const cachedNames = normalizeSkuNameMap(cachedSkuNameMap);
  let cacheHits = 0;
  const nextRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const next = { ...row };
    const sku = String(next.sku || next.products || "").trim();
    const name = cachedNames[sku] || "";
    if (name && (!next.productName || next.productName === sku || next.productName === next.products)) {
      next.productName = name;
      cacheHits++;
    } else if (!next.productName && sku) {
      next.productName = sku;
    }
    return next;
  });
  return { rows: nextRows, cacheHits, cacheSkuNames: Object.keys(cachedNames).length };
}

function parseEasyOrdersEnrichment(buffer, nameDateFrom, nameDateTo, paymentDateFrom, paymentDateTo, country = "sa", cachedSkuNameMap = {}) {
  const rows = workbookRows(buffer, "Easy Orders");
  if (rows.length < 1) throw new Error("Easy Orders workbook is empty.");
  const header = rows[0] || [];
  const idx = {
    created: findHeader(header, ["CreatedAt", "Created At"]),
    phone: findHeader(header, ["Phone", "Phone Number"]),
    productName: findHeader(header, ["Product Name"]),
    sku: findHeader(header, ["SKU"]),
    paymentMethod: findHeader(header, ["Payment Method", "Payment"]),
    orderId: findHeader(header, ["Order ID"]),
    externalOrderId: findHeader(header, ["External Order ID", "Order ID on your store"]),
  };
  if (idx.sku < 0 || idx.productName < 0) {
    throw new Error("This does not look like an Easy Orders export. SKU and Product Name columns are required.");
  }

  const diagnostics = {
    provider: "easyorders",
    sourceRows: Math.max(0, rows.length - 1),
    rowsScanned: 0,
    nameRowsScanned: 0,
    paymentRowsScanned: 0,
    skuNames: 0,
    learnedSkuNames: 0,
    cacheSkuNames: Object.keys(cachedSkuNameMap || {}).length,
    cacheHits: 0,
    structuredPaymentPreserved: 0,
    paymentRows: 0,
    paymentTargets: 0,
    prepaidTargetItemRows: 0,
    headerMap: idx,
  };
  const skuNameFreq = {};
  const cachedNames = normalizeSkuNameMap(cachedSkuNameMap);
  const paymentByOrderId = new Map();
  const paymentMethodsByPhoneSku = new Map();
  const paymentTargets = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    diagnostics.rowsScanned++;
    const skus = splitCellLines(row[idx.sku]).map((value) => String(value || "").trim()).filter(Boolean);
    const names = splitCellLines(row[idx.productName]).map((value) => String(value || "").trim().replace(/\s+/g, " ")).filter(Boolean);

    const inNameRange = idx.created < 0 || inDateRange(row[idx.created], nameDateFrom, nameDateTo);
    const inPaymentRange = idx.created < 0 || inDateRange(row[idx.created], paymentDateFrom, paymentDateTo);

    if (inNameRange) {
      diagnostics.nameRowsScanned++;
      skus.forEach((sku, productIdx) => {
        const name = names[productIdx] || names[0] || "";
        if (sku && name) {
          if (!skuNameFreq[sku]) skuNameFreq[sku] = {};
          skuNameFreq[sku][name] = (skuNameFreq[sku][name] || 0) + 1;
        }
      });
    }

    if (inPaymentRange) {
      diagnostics.paymentRowsScanned++;
      const method = paymentMethod(idx.paymentMethod >= 0 ? row[idx.paymentMethod] : "");
      const phone = idx.phone >= 0 ? normalizePhone(row[idx.phone], country) : "";
      const createdKey = idx.created >= 0 ? dateKeyFromValue(row[idx.created]) : "";
      const orderIds = [idx.orderId >= 0 ? row[idx.orderId] : "", idx.externalOrderId >= 0 ? row[idx.externalOrderId] : ""]
        .map((value) => String(value || "").trim()).filter(Boolean);
      skus.forEach((sku) => {
        if (method) {
          diagnostics.paymentRows++;
          diagnostics.paymentTargets++;
          const classification = paymentClassification(method);
          if (classification === "prepaid") diagnostics.prepaidTargetItemRows++;
          paymentTargets.push({
            method,
            classification,
            phone,
            sku,
            createdKey,
            orderIds,
          });
        }
        if (method && phone) {
          const key = `${phone}|${sku}`;
          if (!paymentMethodsByPhoneSku.has(key)) paymentMethodsByPhoneSku.set(key, new Set());
          paymentMethodsByPhoneSku.get(key).add(method);
        }
      });
      if (method) orderIds.forEach((id) => paymentByOrderId.set(id, method));
    }
  }

  const learnedSkuNameMap = {};
  Object.keys(skuNameFreq).forEach((sku) => {
    const name = mostFrequent(skuNameFreq[sku]);
    if (name) learnedSkuNameMap[sku] = name;
  });
  const skuNameMap = { ...cachedNames, ...learnedSkuNameMap };
  diagnostics.learnedSkuNames = Object.keys(learnedSkuNameMap).length;
  diagnostics.skuNames = Object.keys(skuNameMap).length;

  const paymentByPhoneSku = new Map();
  paymentMethodsByPhoneSku.forEach((methods, key) => {
    if (methods.size === 1) paymentByPhoneSku.set(key, Array.from(methods)[0]);
  });
  diagnostics.uniquePaymentPhoneSku = paymentByPhoneSku.size;
  diagnostics.uniquePaymentOrderIds = paymentByOrderId.size;
  return { skuNameMap, learnedSkuNameMap, paymentByOrderId, paymentByPhoneSku, paymentTargets, diagnostics };
}

function hasKnownStructuredPayment(row) {
  const classification = String(row && row.paymentClassification || "").trim().toLowerCase();
  const source = String(row && (row.paymentEvidenceSource || row.paymentMethodSource || "") || "").trim();
  return !!source && (classification === "cod" || classification === "prepaid");
}

function rowPaymentAssignmentKey(row, index) {
  const order = String(row && (row.taagerOrderNumber || row.orderNumber || row.orderId || row.reference) || "").trim();
  const sku = String(row && (row.sku || row.products || row.productName || row.product) || "").trim();
  const sourceIndex = row && row.sourceOrderRowIndex != null ? row.sourceOrderRowIndex : index;
  const itemIndex = row && row.orderItemIndex != null ? row.orderItemIndex : 0;
  return `${order}|${sku}|${sourceIndex}|${itemIndex}`;
}

function rowPaymentBusinessKey(row) {
  return [
    String(row && (row.taagerOrderNumber || row.orderNumber || row.orderId || row.reference) || "").trim(),
    String(row && (row.sku || row.products || row.productName || row.product) || "").trim(),
  ].join("|");
}

function pushIndex(map, key, index) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(index);
}

function uniqueIndexes(indexes) {
  return Array.from(new Set((indexes || []).filter((value) => value != null)));
}

function buildEasyOrdersPaymentAssignments(rows, enrichment, country = "sa") {
  const targets = Array.isArray(enrichment.paymentTargets) ? enrichment.paymentTargets : [];
  const diagnostics = {
    paymentMatchSources: {},
    paymentMatchConflicts: 0,
    prepaidTargetMatchedItemRows: 0,
    prepaidTargetMatchedRows: 0,
    prepaidTargetUnmatchedRows: 0,
  };
  if (!targets.length) return { assignments: new Map(), diagnostics };

  const exact = new Map();
  const phoneSku = new Map();
  const phoneSkuDate = new Map();

  rows.forEach((row, index) => {
    const sku = String(row && (row.sku || row.products || "") || "").trim();
    if (!sku) return;
    const ids = [
      row.storeOrderNumber,
      row.taagerOrderNumber,
      row.orderNumber,
      row.orderId,
      row.reference,
    ].map((value) => String(value || "").trim()).filter(Boolean);
    ids.forEach((id) => pushIndex(exact, `${id}|${sku}`, index));

    const phone = normalizePhone(row.phone1 || row.phone || row.rawPhone || "", country);
    if (phone) {
      const baseKey = `${phone}|${sku}`;
      pushIndex(phoneSku, baseKey, index);
      const createdKey = dateKeyFromValue(row.createdAt || row.date || row.dashboardDate);
      if (createdKey) pushIndex(phoneSkuDate, `${baseKey}|${createdKey}`, index);
    }
  });

  function resolveTarget(target) {
    const sku = String(target.sku || "").trim();
    if (!sku || !target.method) return null;

    const resolvedFromCandidates = (candidates, source, priority) => {
      candidates = uniqueIndexes(candidates);
      if (candidates.length === 1) return { indexes: candidates, source, priority };
      if (candidates.length > 1) {
        const businessKeys = Array.from(new Set(candidates.map((index) => rowPaymentBusinessKey(rows[index])).filter(Boolean)));
        if (businessKeys.length === 1) return { indexes: candidates, source, priority };
      }
      return null;
    };

    for (const id of target.orderIds || []) {
      const exactMatch = resolvedFromCandidates(exact.get(`${id}|${sku}`), "easyorders-id", 100);
      if (exactMatch) return exactMatch;
    }

    const phone = String(target.phone || "").trim();
    if (phone) {
      const baseKey = `${phone}|${sku}`;
      if (target.createdKey) {
        const datedMatch = resolvedFromCandidates(phoneSkuDate.get(`${baseKey}|${target.createdKey}`), "easyorders-phone-sku-date", 70);
        if (datedMatch) return datedMatch;
      }
      const uniqueMatch = resolvedFromCandidates(phoneSku.get(baseKey), "easyorders-phone-sku-unique", 60);
      if (uniqueMatch && uniqueIndexes(phoneSku.get(baseKey)).length === uniqueMatch.indexes.length) return uniqueMatch;
    }

    return null;
  }

  const rowCandidates = new Map();
  let prepaidTargetCount = 0;
  const assignedPrepaidTargets = new Set();
  targets.forEach((target, targetIndex) => {
    if (target.classification === "prepaid") prepaidTargetCount++;
    const resolved = resolveTarget(target);
    if (!resolved) return;
    resolved.indexes.forEach((index) => {
      if (!rowCandidates.has(index)) rowCandidates.set(index, []);
      rowCandidates.get(index).push({
        targetIndex,
        method: target.method,
        classification: target.classification,
        source: resolved.source,
        priority: resolved.priority,
      });
    });
  });

  const assignments = new Map();
  const prepaidMatchedRows = new Set();
  rowCandidates.forEach((candidates, index) => {
    const maxPriority = Math.max(...candidates.map((item) => item.priority));
    const best = candidates.filter((item) => item.priority === maxPriority);
    const methods = Array.from(new Set(best.map((item) => item.method)));
    if (methods.length !== 1) {
      diagnostics.paymentMatchConflicts++;
      return;
    }
    const assignment = best[0];
    assignments.set(rowPaymentAssignmentKey(rows[index], index), assignment);
    diagnostics.paymentMatchSources[assignment.source] = (diagnostics.paymentMatchSources[assignment.source] || 0) + 1;
    if (assignment.classification === "prepaid") {
      best.forEach((item) => assignedPrepaidTargets.add(item.targetIndex));
      prepaidMatchedRows.add(rowPaymentBusinessKey(rows[index]));
    }
  });

  diagnostics.prepaidTargetMatchedItemRows = assignedPrepaidTargets.size;
  diagnostics.prepaidTargetMatchedRows = prepaidMatchedRows.size;
  diagnostics.prepaidTargetUnmatchedRows = Math.max(0, prepaidTargetCount - assignedPrepaidTargets.size);
  return { assignments, diagnostics };
}

function enrichRowsFromEasyOrders(rows, enrichment, country = "sa") {
  const diagnostics = Object.assign({ productNameMatches: 0, paymentMatches: 0, unmatchedPaymentRows: 0 }, enrichment.diagnostics || {});
  const paymentAssignments = buildEasyOrdersPaymentAssignments(rows, enrichment, country);
  Object.assign(diagnostics, paymentAssignments.diagnostics);
  const enrichedRows = rows.map((row, index) => {
    const next = { ...row };
    const sku = String(next.sku || next.products || "").trim();
    const name = enrichment.skuNameMap[sku] || "";
    if (name && (!next.productName || next.productName === sku || next.productName === next.products)) {
      next.productName = name;
      diagnostics.productNameMatches++;
      if (!(enrichment.learnedSkuNameMap || {})[sku]) diagnostics.cacheHits++;
    } else if (!next.productName && sku) {
      next.productName = sku;
    }

    let method = "";
    let methodSource = "";
    const preservesStructuredPayment = hasKnownStructuredPayment(next);
    if (!preservesStructuredPayment) {
      const assignment = paymentAssignments.assignments.get(rowPaymentAssignmentKey(next, index));
      if (assignment) {
        method = assignment.method || "";
        methodSource = assignment.source || "easyorders";
      }
    } else {
      diagnostics.structuredPaymentPreserved++;
    }
    if (method) {
      next.paymentMethod = method;
      next.paymentMethodSource = methodSource || "easyorders";
      next.paymentClassification = paymentClassification(method);
      next.paymentEvidenceSource = methodSource || "easyorders";
      diagnostics.paymentMatches++;
    } else {
      next.paymentMethod = next.paymentMethod || "cod";
      next.paymentClassification = next.paymentClassification || "unknown";
      next.paymentEvidenceSource = next.paymentEvidenceSource || "";
      if (!preservesStructuredPayment) diagnostics.unmatchedPaymentRows++;
    }
    next.effectivePaymentClassification = next.paymentClassification === "prepaid" ? "prepaid" : "cod";
    next.isEffectiveCod = next.paymentClassification !== "prepaid";
    next.isPrepaid = next.paymentClassification === "prepaid";
    return next;
  });
  return { rows: enrichedRows, diagnostics };
}

function processDashboardSheets(options = {}) {
  const dateFrom = parseDateKey(options.dateFrom);
  const dateTo = parseDateKey(options.dateTo);
  if (!dateFrom || !dateTo || dateFrom > dateTo) throw new Error("A valid dashboard date range is required.");
  const taagerValidation = validateTaagerWorkbook(options.taagerBuffer);
  const parsed = parseFullMonthSnapshot(asBuffer(options.taagerBuffer), {
    dateFrom: dateKey(dateFrom),
    dateTo: dateKey(dateTo),
    withDiagnostics: true,
  });
  if (!parsed || !Array.isArray(parsed.rows) || parsed.diagnostics?.error) {
    throw new Error(parsed?.diagnostics?.error || "Taager workbook could not be parsed.");
  }

  let rows = parsed.rows;
  const warnings = [];
  let enrichmentDiagnostics = { provider: options.enrichmentEnabled ? "easyorders" : "none", status: "not_enabled" };
  let learnedSkuNameMap = {};
  if (options.easyOrdersBuffer) {
    const lookbackDays = Math.max(1, Number(options.easyOrdersLookbackDays || 60));
    const easyFrom = addDays(dateFrom, -lookbackDays);
    const enrichment = parseEasyOrdersEnrichment(
      options.easyOrdersBuffer,
      easyFrom,
      dateTo,
      dateFrom,
      dateTo,
      options.country || "sa",
      options.skuNameCache || {}
    );
    learnedSkuNameMap = enrichment.learnedSkuNameMap || {};
    const enriched = enrichRowsFromEasyOrders(rows, enrichment, options.country || "sa");
    rows = enriched.rows;
    enrichmentDiagnostics = Object.assign({}, enriched.diagnostics, {
      provider: "easyorders",
      status: "ok",
      lookbackDays,
      nameDateFrom: dateKey(easyFrom),
      nameDateTo: dateKey(dateTo),
      paymentDateFrom: dateKey(dateFrom),
      paymentDateTo: dateKey(dateTo),
    });
  } else if (options.enrichmentEnabled) {
    enrichmentDiagnostics = { provider: "easyorders", status: "missing" };
    warnings.push("Easy Orders enrichment is enabled for this account, but no Easy Orders sheet was provided.");
  }

  const cachedFallback = applySkuNameCacheFallback(rows, options.skuNameCache || {});
  rows = cachedFallback.rows;
  enrichmentDiagnostics = Object.assign({}, enrichmentDiagnostics, {
    cacheSkuNames: Math.max(Number(enrichmentDiagnostics.cacheSkuNames || 0), cachedFallback.cacheSkuNames),
    cacheHits: Number(enrichmentDiagnostics.cacheHits || 0) + cachedFallback.cacheHits,
  });

  const country = String(options.country || "sa").trim().toLowerCase();
  rows = rows.map((row) => ({
    ...row,
    taagerCountry: row.taagerCountry || row.country || country,
    country: row.country || row.taagerCountry || country,
  }));

  const parseDiagnostics = Object.assign({}, parsed.diagnostics || {}, {
    taagerValidation,
    enrichment: enrichmentDiagnostics,
    country,
  });
  return {
    rows,
    learnedSkuNameMap,
    parseDiagnostics,
    enrichmentDiagnostics,
    warnings,
    dateFrom: dateKey(dateFrom),
    dateTo: dateKey(dateTo),
    snapshotMonth: dateKey(dateTo).slice(0, 7),
  };
}

module.exports = {
  asBuffer,
  validateTaagerWorkbook,
  parseEasyOrdersEnrichment,
  enrichRowsFromEasyOrders,
  processDashboardSheets,
};
