"use strict";

const XLSX = require("xlsx");
const { normalizePhone, normalizePhoneCandidatesWithMeta } = require("./phone");
const { normalizeTaagerCountry } = require("./taager-country");
const { normalizeProvinceMatch } = require("./output");

const config = JSON.parse(process.env.BOT_CONFIG || "{}");
const COUNTRY = normalizeTaagerCountry(config.taagerCountry || config.taagerCountry || "sa");

// Taager dashboard/status/NDR migration:
// Taager exports Arabic statuses, SKU-only products, order profit, and tax profit.
// Future chats should keep parser output normalized here so dashboard/AI pages do
// not re-create old affiliate delivery, commission, or shipping-fee assumptions.
const TAAGER_STATUS = {
  RECEIVED: "تم استلام الطلب",
  DELIVERED: "تم التوصيل",
  DELIVERY_FAILED: "فشل التسليم",
  RETURN_VERIFIED: "تم التحقق من الإرجاع",
  CANCELED_BY_YOU: "طلب ملغي بواسطتك",
  CUSTOMER_REFUSED_CONFIRMATION: "العميل رفض التأكيد",
  SHIPPING: "قيد التوصيل",
  ON_HOLD: "معلق مؤقتًا",
  DELIVERY_SUSPENDED: "تم تعليق التوصيل",
  OUT_OF_STOCK: "انتهى من المخزن",
  CONFIRMED: "تم تأكيد الطلب",
  WAITING: "في انتظار الشحن",
  AFTER_SALES_DONE: "تمت خدمة ما بعد البيع",
  AFTER_SALES_PROGRESS: "خدمة ما بعد البيع قيد التقدم",
};

const TAAGER_STATUS_REAL = {
  RECEIVED: "تم استلام الطلب",
  DELIVERED: "تم التوصيل",
  DELIVERY_FAILED: "فشل التسليم",
  RETURN_VERIFIED: "تم التحقق من الإرجاع",
  CANCELED_BY_YOU: "طلب ملغي بواسطتك",
  CUSTOMER_REFUSED_CONFIRMATION: "العميل رفض التأكيد",
  SHIPPING: "قيد التوصيل",
  ON_HOLD: "معلق مؤقتا",
  DELIVERY_SUSPENDED: "تم تعليق التوصيل",
  OUT_OF_STOCK: "انتهى من المخزن",
  CONFIRMED: "تم تأكيد الطلب",
  WAITING: "في انتظار الشحن",
  AFTER_SALES_DONE: "تمت خدمة ما بعد البيع",
  AFTER_SALES_PROGRESS: "خدمة ما بعد البيع قيد التقدم",
};

function normalizeArabicStatusKey(status) {
  return String(status || "").trim().replace(/[\u064B-\u065F\u0670]/g, "");
}

function isTaagerStatus(status, key) {
  const ar = normalizeArabicStatusKey(status);
  return ar === normalizeArabicStatusKey(TAAGER_STATUS_REAL[key]) || ar === normalizeArabicStatusKey(TAAGER_STATUS[key]);
}

function taagerStatusMeta(status) {
  const ar = String(status || "").trim();
  if (isTaagerStatus(ar, "DELIVERED")) return { ar, en: "Delivered", bucket: "delivered", ndrEligible: true, delivered: true };
  if (isTaagerStatus(ar, "CANCELED_BY_YOU")) return { ar, en: "Canceled by you", bucket: "canceled_by_you", ndrEligible: false, delivered: false };
  if (isTaagerStatus(ar, "DELIVERY_FAILED")) return { ar, en: "Delivery failed", bucket: "failed", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "RETURN_VERIFIED")) return { ar, en: "Return verified", bucket: "return_verified", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "RECEIVED")) return { ar, en: "Order received", bucket: "received", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "CUSTOMER_REFUSED_CONFIRMATION")) return { ar, en: "Customer refused confirmation", bucket: "customer_refused_confirmation", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "SHIPPING")) return { ar, en: "Out for delivery", bucket: "shipping", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "ON_HOLD")) return { ar, en: "Temporarily suspended", bucket: "on_hold", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "DELIVERY_SUSPENDED")) return { ar, en: "Delivery suspended", bucket: "delivery_suspended", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "OUT_OF_STOCK")) return { ar, en: "Out of stock", bucket: "out_of_stock", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "CONFIRMED")) return { ar, en: "Confirmed", bucket: "confirmed", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "WAITING")) return { ar, en: "Awaiting shipment", bucket: "waiting", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "AFTER_SALES_DONE")) return { ar, en: "After-sales service completed", bucket: "after_sales_done", ndrEligible: true, delivered: false };
  if (isTaagerStatus(ar, "AFTER_SALES_PROGRESS")) return { ar, en: "After-sales service in progress", bucket: "after_sales_progress", ndrEligible: true, delivered: false };
  return { ar, en: ar || "Unknown", bucket: "other", ndrEligible: true, delivered: false };
}

function parseExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function localDateKey(value) {
  const date = parseExcelDate(value);
  if (!date) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function localDateTimeKey(value) {
  const date = parseExcelDate(value);
  if (!date) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-") + " " + [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}

function matchesDateRange(value, dateFrom, dateTo) {
  const date = parseExcelDate(value);
  if (!date) return false;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const from = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate());
  const to = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate());
  return day >= from && day <= to;
}

function normalizeDigits(value) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return String(value == null ? "" : value).replace(/[٠-٩۰-۹]/g, (ch) => {
    const ar = arabic.indexOf(ch);
    if (ar !== -1) return String(ar);
    const fa = persian.indexOf(ch);
    return fa !== -1 ? String(fa) : ch;
  });
}

function parseMoney(value) {
  let text = normalizeDigits(value).replace(/[\u066B\u00B7]/g, ".").replace(/[\u066C\u060C]/g, ",").trim();
  if (!text) return 0;
  let sign = /^\s*\(.*\)\s*$/.test(text) || /-/.test(text) ? -1 : 1;
  text = text
    .replace(/[^\d.,-]/g, "")
    .replace(/-/g, "");
  if (!text) return 0;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastComma > lastDot && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    text = text.replace(/,/g, "");
  } else if (lastComma > lastDot && text.split(",").length === 2 && text.split(",")[1].length <= 2) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }

  const n = Number(text);
  return Number.isFinite(n) ? sign * n : 0;
}

function parseTaagerProfitMoney(value, country = COUNTRY) {
  const parsed = parseMoney(value);
  if (!Number.isFinite(parsed) || parsed === 0) return 0;
  if (normalizeTaagerCountry(country) === "iq") return parsed;
  const text = normalizeDigits(value).trim().replace(/[^\d.,-]/g, "");
  const hasDecimalMark = /[.,]\d{1,2}$/.test(text);
  if (!hasDecimalMark && Math.abs(parsed) >= 1000) {
    return parsed / 100;
  }
  return parsed;
}

function parseQty(value) {
  return parseInt(String(value || "1").replace(/[^\d]/g, ""), 10) || 1;
}

function splitCellLines(value) {
  return String(value == null ? "" : value)
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeProductName(name) {
  return String(name || "")
    .trim()
    .replace(/^\d+x\s*/i, "")
    .replace(/[-\s]+$/, "")
    .replace(/\s+/g, " ");
}

function productNamesMatch(nameA, nameB) {
  const a = normalizeProductName(nameA).toLowerCase();
  const b = normalizeProductName(nameB).toLowerCase();
  if (!a || !b) return false;
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

function makeOrderKey(normPhone, sku) {
  const phone = normPhone ? String(normPhone).trim() : "";
  const cleanSku = sku ? String(sku).trim() : "";
  return phone && cleanSku ? `${phone}|${cleanSku}` : null;
}

function findHeaderIndex(header, candidates, fallback) {
  const normalized = header.map((item) => String(item || "").trim());
  for (const candidate of candidates) {
    const idx = normalized.findIndex((item) => item === candidate);
    if (idx !== -1) return idx;
  }
  for (const candidate of candidates) {
    const idx = normalized.findIndex((item) => item.includes(candidate));
    if (idx !== -1) return idx;
  }
  return fallback;
}

function stripProductBrackets(rawProducts) {
  const raw = String(rawProducts || "").trim();
  const bracketMatch = raw.match(/^\[([\s\S]*)\]$/);
  return bracketMatch ? bracketMatch[1].trim() : raw.replace(/^\[|\]$/g, "").trim();
}

function explodeRealOrderRow(row, phoneMeta) {
  const productNames = splitCellLines(row["Product Name"]);
  const skus = splitCellLines(row["SKU"]);
  const qtys = splitCellLines(row["Quantity"]);
  const prices = splitCellLines(row["Item Price"]);
  const itemCount = Math.max(productNames.length, skus.length, qtys.length, prices.length, 1);
  const rawCity = String(row["City"] || row["Government"] || "").trim();

  const base = {
    source: "real",
    normPhone: phoneMeta.digits,
    uncertain: !!phoneMeta.uncertain,
    phoneAmbiguous: !!phoneMeta.phoneAmbiguous,
    phoneAmbiguityGroupId: phoneMeta.phoneAmbiguityGroupId || "",
    phoneCandidateIndex: phoneMeta.phoneCandidateIndex || 1,
    phoneCandidateCount: phoneMeta.phoneCandidateCount || 1,
    phoneCorrection: phoneMeta.correction || "",
    rawPhone: row["Phone"],
    name: String(row["FullName"] || "").trim() || ("0" + phoneMeta.digits),
    city: rawCity || null,
    region: "",
    address: String(row["Address"] || "").trim() || null,
    date: localDateKey(row["CreatedAt"]),
    createdAt: localDateKey(row["CreatedAt"]),
    easyCreatedAt: localDateTimeKey(row["CreatedAt"]),
    orderStatus: "Under processing",
    amountDue: parseMoney(row["Total Cost"]),
    marketerCommission: 0,
    taagerOrderNumber: "",
  };

  const bySku = new Map();
  for (let i = 0; i < itemCount; i++) {
    const productName = String(productNames[i] || productNames[0] || "").trim();
    const sku = String(skus[i] || skus[0] || "").trim();
    if (!productName || !sku) continue;

    const qty = parseQty(qtys[i] || qtys[0]);
    const itemPrice = parseMoney(prices[i] || prices[0]);
    const totalCost = parseMoney(row["Total Cost"]);
    const shippingCost = parseMoney(row["Shipping Cost"] || "28") || 28;
    const subtotal = itemPrice > 0 ? itemPrice * qty : Math.max(totalCost - shippingCost, 0);
    const existing = bySku.get(sku);

    if (existing) {
      existing.qty += qty;
      existing.subtotal += subtotal;
      existing.unitPrice = Math.round(existing.subtotal / existing.qty);
      if (!existing.productName.includes(productName)) existing.productName += ` + ${productName}`;
      continue;
    }

    bySku.set(sku, {
      ...base,
      sku,
      productName,
      qty,
      subtotal,
      unitPrice: itemPrice > 0 ? itemPrice : Math.round(subtotal / qty),
    });
  }

  return [...bySku.values()];
}

function parseRealOrders(buffer, dateFrom, dateTo) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  const orders = [];
  const skipped = { date: 0, phone: 0, status: 0, sku: 0 };
  let uncertainPhones = 0;

  let ambiguousPhones = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!matchesDateRange(row["CreatedAt"], dateFrom, dateTo)) { skipped.date++; continue; }
    const status = String(row["Status"] || "").toLowerCase();
    if (status === "cancelled" || status === "canceled") { skipped.status++; continue; }
    const phoneMetas = normalizePhoneCandidatesWithMeta(row["Phone"], COUNTRY);
    if (!phoneMetas.length) { skipped.phone++; continue; }
    if (phoneMetas.some((meta) => meta.uncertain)) uncertainPhones++;
    if (phoneMetas.length > 1) ambiguousPhones++;

    const groupId = phoneMetas.length > 1 ? `real-${rowIndex + 2}` : "";
    let explodedCount = 0;
    phoneMetas.forEach((phoneMeta, candidateIndex) => {
      const exploded = explodeRealOrderRow(row, {
        ...phoneMeta,
        phoneAmbiguous: phoneMetas.length > 1,
        phoneAmbiguityGroupId: groupId,
        phoneCandidateIndex: candidateIndex + 1,
        phoneCandidateCount: phoneMetas.length,
      });
      explodedCount += exploded.length;
      orders.push(...exploded);
    });
    if (!explodedCount) skipped.sku++;
  }

  console.log(`Real orders: ${orders.length} valid items | skipped date:${skipped.date} phone:${skipped.phone} status:${skipped.status} sku:${skipped.sku}`);
  if (uncertainPhones > 0) console.log(`Real orders uncertain phones rescued with trailing 0: ${uncertainPhones}`);
  if (ambiguousPhones > 0) console.log(`Real orders expanded from ambiguous phones: ${ambiguousPhones}`);
  return orders;
}

function parseMissedOrders(buffer, dateFrom, dateTo) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  const orders = [];
  const skippedOrders = [];
  const skipped = { date: 0, phone: 0, completed: 0 };
  let uncertainPhones = 0;

  let ambiguousPhones = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const isCompleted = String(row["Is Completed"] || "").toLowerCase();
    if (isCompleted === "true" || isCompleted === "1") { skipped.completed++; continue; }
    if (!matchesDateRange(row["Created At"], dateFrom, dateTo)) { skipped.date++; continue; }
    const createdDate = localDateKey(row["Created At"]);
    const easyCreatedAt = localDateTimeKey(row["Created At"]);

    const rawProducts = String(row["Products"] || "").trim();
    const productText = stripProductBrackets(rawProducts) || rawProducts;
    const phoneMetas = normalizePhoneCandidatesWithMeta(row["Phone"], COUNTRY);
    if (!phoneMetas.length) {
      skipped.phone++;
      skippedOrders.push({
        name: String(row["Full Name"] || "").trim(),
        rawPhone: String(row["Phone"] || "").trim(),
        productName: productText,
        city: String(row["Government"] || row["City"] || "").trim(),
        address: String(row["Address"] || "").trim(),
        reason: "phone_parse_failed",
      });
      continue;
    }

    if (phoneMetas.some((meta) => meta.uncertain)) uncertainPhones++;
    if (phoneMetas.length > 1) ambiguousPhones++;
    const groupId = phoneMetas.length > 1 ? `missed-${rowIndex + 2}` : "";

    phoneMetas.forEach((phoneMeta, candidateIndex) => {
      const baseOrder = {
        source: "missed",
        normPhone: phoneMeta.digits,
        uncertain: !!phoneMeta.uncertain,
        phoneAmbiguous: phoneMetas.length > 1,
        phoneAmbiguityGroupId: groupId,
        phoneCandidateIndex: candidateIndex + 1,
        phoneCandidateCount: phoneMetas.length,
        phoneCorrection: phoneMeta.correction || "",
        rawPhone: row["Phone"],
        name: String(row["Full Name"] || "").trim() || ("0" + phoneMeta.digits),
        city: String(row["Government"] || row["City"] || "").trim(),
        address: String(row["Address"] || "").trim(),
        date: createdDate,
        createdAt: createdDate,
        easyCreatedAt,
        sku: null,
        qty: null,
        subtotal: null,
        unitPrice: null,
      };

      productText.split("|").map((part) => part.trim()).filter(Boolean).forEach((productName) => {
        orders.push({ ...baseOrder, productName });
      });
    });
  }

  console.log(`Missed orders: ${orders.length} valid | skipped date:${skipped.date} phone:${skipped.phone} completed:${skipped.completed}`);
  if (uncertainPhones > 0) console.log(`Missed orders uncertain phones rescued with trailing 0: ${uncertainPhones}`);
  if (ambiguousPhones > 0) console.log(`Missed orders expanded from ambiguous phones: ${ambiguousPhones}`);
  if (skippedOrders.length > 0) console.log(`Phone-parse failures: ${skippedOrders.length}`);
  return { orders, skippedOrders };
}

function buildProductCatalog(realOrders) {
  const catalog = {};
  for (const order of realOrders) {
    if (!order.sku || !order.productName) continue;
    const key = normalizeProductName(order.productName);
    if (!catalog[key]) catalog[key] = { sku: order.sku, productName: key, prices: {}, qtyCounts: {} };
    const entry = catalog[key];
    const qty = order.qty || 1;
    const price = Math.round(order.subtotal || 0);
    entry.qtyCounts[qty] = (entry.qtyCounts[qty] || 0) + 1;
    if (!entry.prices[qty]) entry.prices[qty] = [];
    entry.prices[qty].push(price);
  }

  const result = {};
  for (const [name, entry] of Object.entries(catalog)) {
    const qtys = Object.keys(entry.qtyCounts).map(Number).sort((a, b) => a - b);
    const prices = {};
    for (const [qty, samples] of Object.entries(entry.prices)) {
      const freq = {};
      for (const sample of Array.isArray(samples) ? samples : []) {
        if (!Number.isFinite(Number(sample))) continue;
        freq[sample] = (freq[sample] || 0) + 1;
      }
      const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      prices[qty] = entries.length ? Number(entries[0][0]) : 0;
    }
    result[name] = { sku: entry.sku, productName: name, minQty: qtys[0] || 1, prices };
  }

  console.log(`Product catalog: ${Object.keys(result).length} products`);
  return result;
}

function findProductInCatalog(productName, catalog) {
  const clean = normalizeProductName(productName);
  if (!clean) return null;
  if (catalog[clean]) return catalog[clean];
  const lower = clean.toLowerCase();
  for (const [name, value] of Object.entries(catalog)) {
    if (productNamesMatch(lower, name)) return value;
  }
  return null;
}

function resolveMissedOrders(missedOrders, catalog) {
  const resolved = [];
  const skippedOrders = [];
  const skippedNames = [];

  for (const order of missedOrders) {
    const match = findProductInCatalog(order.productName, catalog);
    if (!match) {
      skippedNames.push(order.productName);
      skippedOrders.push({
        name: order.name,
        rawPhone: order.rawPhone,
        productName: order.productName,
        city: order.city,
        address: order.address,
        reason: "product_not_in_catalog",
        uncertain: !!order.uncertain,
      });
      continue;
    }

    const qty = match.minQty || 1;
    const subtotal = match.prices[qty] || match.prices[Object.keys(match.prices)[0]] || 0;
    resolved.push({
      ...order,
      sku: match.sku,
      productName: match.productName,
      qty,
      subtotal,
      unitPrice: Math.round(subtotal / qty),
    });
  }

  if (skippedNames.length > 0) {
    console.log(`Missed orders skipped (no live catalog match): ${[...new Set(skippedNames)].join(", ")}`);
  }
  console.log(`Missed orders resolved: ${resolved.length} SKU-backed items`);
  return { resolved, skippedOrders };
}

function parseTaagerOrderKeys(buffer, country = COUNTRY) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const header = rows[0] || [];
  const phoneIdx = findHeaderIndex(header, ["رقم الهاتف", "Phone Number", "Phone"], 5);

  const phones = new Set();
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const phone = normalizePhone(rows[i][phoneIdx], country);
    if (phone) phones.add(phone);
    else skipped++;
  }

  console.log(`Taager: ${phones.size} existing phones loaded | skipped:${skipped}`);
  return phones;
}

function parseTaagerPhones(buffer, country = COUNTRY) {
  return parseTaagerOrderKeys(buffer, country);
}

function mergeAndDeduplicate(realOrders, resolvedMissed, existingPhones) {
  const seen = new Set();
  const result = [];
  const stats = {
    realValid: realOrders.length,
    missedValid: resolvedMissed.length,
    realNew: 0,
    realDupe: 0,
    realInTaager: 0,
    realMissingSku: 0,
    missedNew: 0,
    missedDupe: 0,
    missedInTaager: 0,
    missedMissingSku: 0,
  };

  function accept(order, source) {
    const orderKey = makeOrderKey(order.normPhone, order.sku);
    if (!orderKey) { stats[`${source}MissingSku`]++; return; }
    if (existingPhones.has(order.normPhone)) { stats[`${source}InTaager`]++; return; }
    if (seen.has(orderKey)) { stats[`${source}Dupe`]++; return; }
    seen.add(orderKey);
    result.push(order);
    stats[`${source}New`]++;
  }

  realOrders.forEach((order) => accept(order, "real"));
  resolvedMissed.forEach((order) => accept(order, "missed"));

  console.log(`New orders: real=${stats.realNew} missed=${stats.missedNew}`);
  console.log(`Already in Taager (phone): real=${stats.realInTaager} missed=${stats.missedInTaager}`);
  console.log(`Dupes in this batch (phone+SKU): real=${stats.realDupe} missed=${stats.missedDupe}`);
  return { orders: result, stats };
}

function splitTaagerProducts(value) {
  return splitCellLines(value).flatMap((line) => String(line).split(/[|,]/).map((part) => part.trim()).filter(Boolean));
}

const PROVINCE_FALLBACK_POLICY = Object.freeze({
  skuMinDelivered: 10,
  skuMinWinner: 3,
  skuMinShare: 0.30,
  globalMinDelivered: 10,
  globalMinWinner: 3,
  globalMinShare: 0.20,
});

function chooseProvinceFallback(counts, total, policy) {
  let province = "";
  let winnerCount = 0;
  for (const [candidate, count] of counts.entries()) {
    // Strictly greater keeps first-seen as the deterministic tie-breaker.
    if (count > winnerCount) {
      province = candidate;
      winnerCount = count;
    }
  }
  const share = total > 0 ? winnerCount / total : 0;
  const qualified = total >= policy.minDelivered
    && winnerCount >= policy.minWinner
    && share >= policy.minShare;
  return { province: qualified ? province : "", winner: province, winnerCount, total, share, qualified };
}

function buildProvinceFallback(rows, indexes, country = COUNTRY) {
  const globalCounts = new Map();
  const skuCounts = new Map();
  const skuTotals = new Map();
  let deliveredRows = 0;
  let validDeliveredRows = 0;

  if (!Array.isArray(rows) || indexes.city < 0 || indexes.status < 0 || indexes.products < 0) {
    return { provinceFallback: "", provinceFallbackBySku: {}, provinceFallbackCounts: {}, provinceFallbackStats: {} };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!isTaagerStatus(row[indexes.status], "DELIVERED")) continue;
    deliveredRows++;

    const rawCity = String(row[indexes.city] || "").trim();
    if (!rawCity || rawCity.toLowerCase() === "unspecified") continue;
    const match = normalizeProvinceMatch(rawCity, country);
    if (!match.matched || !match.province) continue;
    validDeliveredRows++;
    globalCounts.set(match.province, (globalCounts.get(match.province) || 0) + 1);

    // Each distinct SKU receives one sample per Taager order row, regardless of quantity.
    const rowSkus = new Set(splitTaagerProducts(row[indexes.products]));
    for (const sku of rowSkus) {
      if (!skuCounts.has(sku)) skuCounts.set(sku, new Map());
      const counts = skuCounts.get(sku);
      counts.set(match.province, (counts.get(match.province) || 0) + 1);
      skuTotals.set(sku, (skuTotals.get(sku) || 0) + 1);
    }
  }

  const globalChoice = chooseProvinceFallback(globalCounts, validDeliveredRows, {
    minDelivered: PROVINCE_FALLBACK_POLICY.globalMinDelivered,
    minWinner: PROVINCE_FALLBACK_POLICY.globalMinWinner,
    minShare: PROVINCE_FALLBACK_POLICY.globalMinShare,
  });
  const provinceFallbackBySku = Object.create(null);
  const skuStats = Object.create(null);
  for (const [sku, counts] of skuCounts.entries()) {
    const choice = chooseProvinceFallback(counts, skuTotals.get(sku) || 0, {
      minDelivered: PROVINCE_FALLBACK_POLICY.skuMinDelivered,
      minWinner: PROVINCE_FALLBACK_POLICY.skuMinWinner,
      minShare: PROVINCE_FALLBACK_POLICY.skuMinShare,
    });
    if (choice.qualified) provinceFallbackBySku[sku] = choice.province;
    skuStats[sku] = { ...choice, counts: Object.fromEntries(counts.entries()) };
  }

  return {
    provinceFallback: globalChoice.province,
    provinceFallbackBySku,
    provinceFallbackCounts: Object.fromEntries(globalCounts.entries()),
    provinceFallbackStats: {
      policy: PROVINCE_FALLBACK_POLICY,
      deliveredRows,
      validDeliveredRows,
      global: globalChoice,
      bySku: skuStats,
    },
  };
}

function logProvinceFallbackDecision(fallbackStats) {
  const stats = fallbackStats.provinceFallbackStats || {};
  const global = stats.global || {};
  const percentage = Number.isFinite(global.share) ? `${Math.round(global.share * 100)}%` : "0%";
  const globalDecision = global.qualified
    ? `${global.province} (${global.winnerCount}/${global.total}, ${percentage})`
    : `none; leading=${global.winner || "none"} (${global.winnerCount || 0}/${global.total || 0}, ${percentage})`;
  const qualifiedSkus = Object.entries(fallbackStats.provinceFallbackBySku || {});
  const skuPreview = qualifiedSkus.slice(0, 20).map(([sku, province]) => `${sku}=>${province}`).join(", ");
  console.log(
    `[Province fallback] delivered rows=${stats.deliveredRows || 0} | usable city rows=${stats.validDeliveredRows || 0}`
    + ` | global=${globalDecision} | qualified SKUs=${qualifiedSkus.length}`
  );
  if (skuPreview) {
    console.log(`[Province fallback] SKU choices: ${skuPreview}${qualifiedSkus.length > 20 ? `, ... +${qualifiedSkus.length - 20} more` : ""}`);
  }
}

function parseTaagerAnalyticsMap(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!rows || rows.length < 2) return { byPhoneSku: new Map(), skuDefaults: {}, provinceFallback: "", provinceFallbackBySku: {}, provinceFallbackCounts: {}, provinceFallbackStats: {} };

    const header = rows[0] || [];
    const orderIdx = findHeaderIndex(header, ["رقم الطلب", "Order Number"], 0);
    const statusIdx = findHeaderIndex(header, ["الحالة", "Status"], 2);
    const createdIdx = findHeaderIndex(header, ["تاريخ الإنشاء", "Created At", "CreatedAt"], 3);
    const phoneIdx = findHeaderIndex(header, ["رقم الهاتف", "Phone Number", "Phone"], 5);
    const cityIdx = findHeaderIndex(header, ["المحافظة", "Province", "City"], 7);
    const codIdx = findHeaderIndex(header, ["orders.export.cashOnDelivery", "Cash On Delivery", "COD"], 8);
    const taxProfitIdx = findHeaderIndex(header, ["ربح الضريبة", "Tax Profit"], 12);
    const commissionIdx = findHeaderIndex(header, ["ربح الطلب", "Order Profit", "Commission"], 13);
    const productsIdx = findHeaderIndex(header, ["المنتجات", "Products", "SKU"], 16);
    const qtyIdx = findHeaderIndex(header, ["الكميات", "Quantity", "Qty"], 17);
    const priceIdx = findHeaderIndex(header, ["الأسعار", "Prices", "Price"], 18);
    const fallbackStats = buildProvinceFallback(rows, { city: cityIdx, status: statusIdx, products: productsIdx }, COUNTRY);

    const byPhoneSku = new Map();
    const skuSamples = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const phone = normalizePhone(row[phoneIdx], COUNTRY);
      const products = splitTaagerProducts(row[productsIdx]);
      const qtys = splitTaagerProducts(row[qtyIdx]);
      const prices = splitTaagerProducts(row[priceIdx]);
      const status = String(row[statusIdx] || "").trim();
      const amountDue = parseMoney(row[codIdx]);
      const profitCountry = products.some((sku) => /^IQ/i.test(sku)) ? "iq" : COUNTRY;
      const orderProfit = parseTaagerProfitMoney(row[commissionIdx], profitCountry);
      const taxProfit = parseTaagerProfitMoney(row[taxProfitIdx], profitCountry);
      const marketerCommission = orderProfit - taxProfit;

      products.forEach((sku, idx) => {
        if (!sku) return;
        const qty = parseQty(qtys[idx] || qtys[0]);
        const unitPrice = parseMoney(prices[idx] || prices[0]);
        const sampleAmount = amountDue || (unitPrice * qty);
        if (!skuSamples[sku]) skuSamples[sku] = [];
        skuSamples[sku].push({ amountDue: sampleAmount, marketerCommission });

        if (!phone) return;
        byPhoneSku.set(`${phone}|${sku}`, {
          orderStatus: status,
          amountDue: sampleAmount,
          marketerCommission,
          taagerOrderNumber: String(row[orderIdx] || "").trim(),
          createdAt: localDateKey(row[createdIdx]),
          city: String(row[cityIdx] || "").trim(),
        });
      });
    }

    const skuDefaults = {};
    for (const [sku, samples] of Object.entries(skuSamples)) {
      const amountSamples = samples.map((sample) => sample.amountDue).filter((value) => value > 0);
      const freq = {};
      let amountDue = amountSamples[0] || 0;
      amountSamples.forEach((value) => {
        freq[value] = (freq[value] || 0) + 1;
        if (freq[value] > (freq[amountDue] || 0)) amountDue = value;
      });
      const commissions = samples.map((sample) => sample.marketerCommission).filter((value) => value > 0);
      const marketerCommission = commissions.length
        ? Math.round(commissions.reduce((sum, value) => sum + value, 0) / commissions.length)
        : 0;
      skuDefaults[sku] = { amountDue, marketerCommission };
    }

    logProvinceFallbackDecision(fallbackStats);
    console.log(`Taager analytics map: ${byPhoneSku.size} phone+SKU pairs | ${Object.keys(skuDefaults).length} SKU templates | fallback province: ${fallbackStats.provinceFallback || "none"}`);
    return { byPhoneSku, skuDefaults, ...fallbackStats };
  } catch (err) {
    console.error("[Analytics] parseTaagerAnalyticsMap error:", err.message);
    return { byPhoneSku: new Map(), skuDefaults: {}, provinceFallback: "", provinceFallbackBySku: {}, provinceFallbackCounts: {}, provinceFallbackStats: {} };
  }
}

function detectPrepaidMethod(value) {
  const text = String(value || "").toLowerCase();
  if (/tabby|tabi|تابي/.test(text)) return "tabby";
  if (/tamara|تمارا/.test(text)) return "tamara";
  if (/pay\s*mob|paymob/.test(text)) return "paymob";
  if (/mada|visa|card|apple\s*pay|stc\s*pay|online/.test(text)) return "online";
  return "";
}

function classifyStructuredPayment(value, source) {
  const raw = String(value || "").trim();
  const text = raw.toLowerCase();
  const prepaidMethod = detectPrepaidMethod(raw);
  if (prepaidMethod) {
    return { classification: "prepaid", method: prepaidMethod, source: source || "structured" };
  }
  if (text && (/^cod$/.test(text) || /cash|cash on delivery|الدفع عند الاستلام|كاش/i.test(raw))) {
    return { classification: "cod", method: "cod", source: source || "structured" };
  }
  return { classification: "unknown", method: "cod", source: "" };
}

function parseFullMonthSnapshot(buffer, options = {}) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    if (!rows || rows.length < 2) return options.withDiagnostics ? { rows: [], diagnostics: { sourceRows: 0 } } : [];

    const header = rows[0] || [];
    const idx = {
      order: findHeaderIndex(header, ["رقم الطلب", "Order Number"], 0),
      name: findHeaderIndex(header, ["اسم المستلم", "Customer Name", "FullName"], 1),
      status: findHeaderIndex(header, ["الحالة", "Status"], 2),
      created: findHeaderIndex(header, ["تاريخ الإنشاء", "Created At"], 3),
      updated: findHeaderIndex(header, ["اخر تحديث", "Last Updated"], 4),
      phone: findHeaderIndex(header, ["رقم الهاتف", "Phone Number", "Phone"], 5),
      address: findHeaderIndex(header, ["اسم الشارع", "Address"], 6),
      city: findHeaderIndex(header, ["المحافظة", "Province", "City"], 7),
      cod: findHeaderIndex(header, ["orders.export.cashOnDelivery", "Cash On Delivery", "COD"], 8),
      shipping: findHeaderIndex(header, ["تكلفة الشحن", "Shipping"], 9),
      notes: findHeaderIndex(header, ["ملاحظات", "Notes"], 10),
      taxProfit: findHeaderIndex(header, ["ربح الضريبة", "Tax Profit"], 12),
      profit: findHeaderIndex(header, ["ربح الطلب", "Order Profit"], 13),
      products: findHeaderIndex(header, ["المنتجات", "Products", "SKU"], 16),
      qty: findHeaderIndex(header, ["الكميات", "Quantity", "Qty"], 17),
      prices: findHeaderIndex(header, ["الأسعار", "Prices", "Price"], 18),
      storeOrder: findHeaderIndex(header, ["كود الطلب للمتجر", "Order ID on your store"], 22),
    };

    idx.orderSource = findHeaderIndex(header, ["\u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0645\u0633\u062a\u0644\u0645 \u0628\u0648\u0627\u0633\u0637\u0629", "Order received by", "Received By", "Order Source"], 19);
    idx.payment = findHeaderIndex(header, ["Payment Method", "Payment"], -1);
    const diagnostics = {
      sourceRows: Math.max(0, rows.length - 1),
      parsedItemRows: 0,
      parsedOrderCount: 0,
      skippedNoSku: 0,
      skippedOutOfRange: 0,
      expandedItemRows: 0,
      datedSourceRows: 0,
      sourceDateFrom: "",
      sourceDateTo: "",
      dateFrom: "",
      dateTo: "",
      headerMap: Object.assign({}, idx),
    };

    const parseRangeDate = (value) => {
      if (!value) return null;
      if (value instanceof Date && !isNaN(value.getTime())) return value;
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      return parseExcelDate(value);
    };
    const now = new Date();
    const rangeStart = parseRangeDate(options.dateFrom) || new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = parseRangeDate(options.dateTo) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeFromKey = localDateKey(rangeStart);
    const rangeToKey = localDateKey(rangeEnd);
    diagnostics.dateFrom = rangeFromKey;
    diagnostics.dateTo = rangeToKey;
    const sameMonthRange = rangeFromKey.slice(0, 7) === rangeToKey.slice(0, 7);
    const inRange = (key) => key && key >= rangeFromKey && key <= rangeToKey;

    const result = [];
    const parsedOrders = new Set();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const products = splitTaagerProducts(row[idx.products]);
      const qtys = splitTaagerProducts(row[idx.qty]);
      const prices = splitTaagerProducts(row[idx.prices]);
      const itemCount = Math.max(products.length, qtys.length, prices.length, 1);
      const createdAt = localDateKey(row[idx.created]);
      const updatedAt = localDateKey(row[idx.updated]);
      if (createdAt) {
        diagnostics.datedSourceRows++;
        if (!diagnostics.sourceDateFrom || createdAt < diagnostics.sourceDateFrom) diagnostics.sourceDateFrom = createdAt;
        if (!diagnostics.sourceDateTo || createdAt > diagnostics.sourceDateTo) diagnostics.sourceDateTo = createdAt;
      }
      if (!inRange(createdAt)) {
        diagnostics.skippedOutOfRange++;
        continue;
      }
      const dashboardDate = inRange(createdAt) ? createdAt : inRange(updatedAt) ? updatedAt : (createdAt || updatedAt || rangeFromKey);
      const notes = String(row[idx.notes] || "").trim();
      const statusMeta = taagerStatusMeta(row[idx.status]);
      const profitCountry = products.some((sku) => /^IQ/i.test(sku))
        ? "iq"
        : (options.taagerCountry || options.country || COUNTRY);
      const orderProfit = parseTaagerProfitMoney(row[idx.profit], profitCountry);
      const taxProfit = parseTaagerProfitMoney(row[idx.taxProfit], profitCountry);
      const taagerProfitValue = orderProfit - taxProfit;
      const payment = classifyStructuredPayment(
        idx.payment >= 0 ? row[idx.payment] : "",
        idx.payment >= 0 ? "taager-payment-column" : ""
      );

      for (let productIdx = 0; productIdx < itemCount; productIdx++) {
        const sku = String(products[productIdx] || products[0] || "").trim();
        if (!sku) {
          diagnostics.skippedNoSku++;
          continue;
        }
        const qty = parseQty(qtys[productIdx] || qtys[0]);
        const linePrice = parseMoney(prices[productIdx] || prices[0]);
        const priceNoShipping = linePrice;
        result.push({
          taagerOrderNumber: String(row[idx.order] || "").trim(),
          name: String(row[idx.name] || "").trim(),
          phone1: String(row[idx.phone] || "").trim(),
          phone2: "",
          orderStatus: String(row[idx.status] || "").trim(),
          orderStatusEn: statusMeta.en,
          orderStatusBucket: statusMeta.bucket,
          ndrEligible: statusMeta.ndrEligible,
          isDelivered: statusMeta.delivered,
          orderValue: parseMoney(row[idx.cod]),
          // Taager migration: legacy dashboard fields still read "commission";
          // keep them as compatibility aliases for Taager profit = order profit - tax profit.
          commission: taagerProfitValue,
          profit: orderProfit,
          profitRaw: String(row[idx.profit] || ""),
          taxProfit,
          taxProfitRaw: String(row[idx.taxProfit] || ""),
          taagerTaxProfit: taxProfit,
          taagerFees: taxProfit,
          profitAfterFees: taagerProfitValue,
          profitAfterTax: taagerProfitValue,
          taagerProfit: taagerProfitValue,
          city: String(row[idx.city] || "").trim(),
          region: String(row[idx.city] || "").trim(),
          address: String(row[idx.address] || "").trim(),
          dataEntry: "",
          qty,
          rawQty: String(qtys[productIdx] || qtys[0] || ""),
          products: sku,
          sku,
          sourceOrderRowIndex: i,
          orderItemIndex: productIdx,
          orderItemCount: itemCount,
          priceNoShipping,
          priceRaw: String(prices[productIdx] || prices[0] || ""),
          shippingCost: parseMoney(row[idx.shipping]),
          // Sales is Taager's prices column only. Shipping is kept separately.
          totalPrice: priceNoShipping,
          totalPriceRaw: String(prices[productIdx] || prices[0] || ""),
          createdAt,
          confirmedAt: null,
          shippedAt: null,
          lastUpdatedAt: updatedAt,
          amountDue: parseMoney(row[idx.cod]),
          amountDueRaw: String(row[idx.cod] || ""),
          amountDueMissing: String(row[idx.cod] || "") === "",
          amountDueLookup: null,
          collected: 0,
          marketerCommission: taagerProfitValue,
          orderType: "",
          notes,
          orderSource: String(row[idx.orderSource] || "").trim(),
          rawOrderSource: String(row[idx.orderSource] || "").trim(),
          paymentMethod: payment.method,
          paymentClassification: payment.classification,
          paymentEvidenceSource: payment.source,
          effectivePaymentClassification: payment.classification === "prepaid" ? "prepaid" : "cod",
          isEffectiveCod: payment.classification !== "prepaid",
          isPrepaid: payment.classification === "prepaid",
          storeOrderNumber: String(row[idx.storeOrder] || "").trim(),
          dashboardDate,
          dashboardBucketMonth: sameMonthRange ? rangeFromKey.slice(0, 7) : dashboardDate.slice(0, 7),
          dashboardRangeFrom: rangeFromKey,
          dashboardRangeTo: rangeToKey,
        });
        diagnostics.expandedItemRows++;
        if (row[idx.order]) parsedOrders.add(String(row[idx.order]).trim());
      }
    }

    diagnostics.parsedItemRows = result.length;
    diagnostics.parsedOrderCount = parsedOrders.size;
    console.log(`[Dashboard] parseFullMonthSnapshot: ${result.length} rows for ${rangeFromKey}..${rangeToKey}`);
    if (options.withDiagnostics) return { rows: result, diagnostics };
    return result;
  } catch (err) {
    console.error("[Dashboard] parseFullMonthSnapshot error:", err.message);
    return options.withDiagnostics ? { rows: [], diagnostics: { error: err.message } } : [];
  }
}

function loadProductMap() { return {}; }
function saveProductMap() {}
function learnProductMappings() {
  console.log("Product map learning skipped: live SKU catalog is used for dedupe.");
  return {};
}
function lookupEoNameInMap() { return null; }

module.exports = {
  parseTaagerPhones,
  parseTaagerOrderKeys,
  parseTaagerAnalyticsMap,
  parseRealOrders,
  parseMissedOrders,
  buildProductCatalog,
  resolveMissedOrders,
  mergeAndDeduplicate,
  normalizeProductName,
  productNamesMatch,
  makeOrderKey,
  loadProductMap,
  saveProductMap,
  learnProductMappings,
  lookupEoNameInMap,
  parseFullMonthSnapshot,
};
