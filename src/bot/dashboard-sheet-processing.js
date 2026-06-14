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
    headerMap: idx,
  };
  const skuNameFreq = {};
  const cachedNames = normalizeSkuNameMap(cachedSkuNameMap);
  const paymentByOrderId = new Map();
  const paymentMethodsByPhoneSku = new Map();

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
      const orderIds = [idx.orderId >= 0 ? row[idx.orderId] : "", idx.externalOrderId >= 0 ? row[idx.externalOrderId] : ""]
        .map((value) => String(value || "").trim()).filter(Boolean);
      skus.forEach((sku) => {
        if (method && phone) {
          diagnostics.paymentRows++;
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
  return { skuNameMap, learnedSkuNameMap, paymentByOrderId, paymentByPhoneSku, diagnostics };
}

function hasKnownStructuredPayment(row) {
  const classification = String(row && row.paymentClassification || "").trim().toLowerCase();
  const source = String(row && (row.paymentEvidenceSource || row.paymentMethodSource || "") || "").trim();
  return !!source && (classification === "cod" || classification === "prepaid");
}

function enrichRowsFromEasyOrders(rows, enrichment, country = "sa") {
  const diagnostics = Object.assign({ productNameMatches: 0, paymentMatches: 0, unmatchedPaymentRows: 0 }, enrichment.diagnostics || {});
  const enrichedRows = rows.map((row) => {
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
    const preservesStructuredPayment = hasKnownStructuredPayment(next);
    if (!preservesStructuredPayment) {
      const ids = [next.storeOrderNumber, next.taagerOrderNumber, next.orderNumber, next.orderId].map((value) => String(value || "").trim()).filter(Boolean);
      for (const id of ids) {
        method = enrichment.paymentByOrderId.get(id) || "";
        if (method) break;
      }
      if (!method) {
        const phone = normalizePhone(next.phone1 || next.phone || next.rawPhone || "", country);
        if (phone && sku) method = enrichment.paymentByPhoneSku.get(`${phone}|${sku}`) || "";
      }
    } else {
      diagnostics.structuredPaymentPreserved++;
    }
    if (method) {
      next.paymentMethod = method;
      next.paymentMethodSource = "easyorders";
      next.paymentClassification = paymentClassification(method);
      next.paymentEvidenceSource = "easyorders";
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
