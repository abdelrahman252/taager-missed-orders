"use strict";

const XLSX = require("xlsx");
const { normalizePhone, normalizePhoneCandidatesWithMeta } = require("./phone");
const { normalizeTaagerCountry } = require("./taager-country");
const { normalizeProvinceMatch } = require("./output");
const { buildGroupedCartOrders, cartOrderGroupKey, mergeItemList } = require("./cart-order-groups");

const config = JSON.parse(process.env.BOT_CONFIG || "{}");
const COUNTRY = normalizeTaagerCountry(config.taagerCountry || config.taagerCountry || "sa");
const MAX_SAFE_AUTO_QUANTITY = 12;

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

const TAAGER_STATUS_UTF8 = {
  DELIVERED: "\u062a\u0645 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
  DELIVERY_FAILED: "\u0641\u0634\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645",
  CANCELED_BY_YOU: "\u0637\u0644\u0628 \u0645\u0644\u063a\u064a \u0628\u0648\u0627\u0633\u0637\u062a\u0643",
};

function normalizeArabicStatusKey(status) {
  return String(status || "").trim().replace(/[\u064B-\u065F\u0670]/g, "");
}

function isTaagerStatus(status, key) {
  const ar = normalizeArabicStatusKey(status);
  return ar === normalizeArabicStatusKey(TAAGER_STATUS_REAL[key])
    || ar === normalizeArabicStatusKey(TAAGER_STATUS[key])
    || ar === normalizeArabicStatusKey(TAAGER_STATUS_UTF8[key]);
}

function taagerStatusMeta(status) {
  const ar = String(status || "").trim();
  if (isTaagerStatus(ar, "DELIVERED")) return { ar, en: "Delivered", bucket: "delivered", ndrEligible: true, delivered: true, repeatAllowed: true };
  if (isTaagerStatus(ar, "CANCELED_BY_YOU")) return { ar, en: "Canceled by you", bucket: "canceled_by_you", ndrEligible: false, delivered: false, repeatAllowed: true };
  if (isTaagerStatus(ar, "DELIVERY_FAILED")) return { ar, en: "Delivery failed", bucket: "failed", ndrEligible: true, delivered: false, repeatAllowed: true };
  if (isTaagerStatus(ar, "RETURN_VERIFIED")) return { ar, en: "Return verified", bucket: "return_verified", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "RECEIVED")) return { ar, en: "Order received", bucket: "received", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "CUSTOMER_REFUSED_CONFIRMATION")) return { ar, en: "Customer refused confirmation", bucket: "customer_refused_confirmation", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "SHIPPING")) return { ar, en: "Out for delivery", bucket: "shipping", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "ON_HOLD")) return { ar, en: "Temporarily suspended", bucket: "on_hold", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "DELIVERY_SUSPENDED")) return { ar, en: "Delivery suspended", bucket: "delivery_suspended", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "OUT_OF_STOCK")) return { ar, en: "Out of stock", bucket: "out_of_stock", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "CONFIRMED")) return { ar, en: "Confirmed", bucket: "confirmed", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "WAITING")) return { ar, en: "Awaiting shipment", bucket: "waiting", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "AFTER_SALES_DONE")) return { ar, en: "After-sales service completed", bucket: "after_sales_done", ndrEligible: true, delivered: false, repeatAllowed: false };
  if (isTaagerStatus(ar, "AFTER_SALES_PROGRESS")) return { ar, en: "After-sales service in progress", bucket: "after_sales_progress", ndrEligible: true, delivered: false, repeatAllowed: false };
  return { ar, en: ar || "Unknown", bucket: "other", ndrEligible: true, delivered: false, repeatAllowed: false };
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

function parseOptionalQty(value) {
  const text = normalizeDigits(value).trim();
  if (text === "") return null;
  const parsed = parseInt(text.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSku(value) {
  return String(value == null ? "" : value).trim().replace(/[-_.]+$/g, "");
}

function extractSkuFromText(value) {
  const text = normalizeSku(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/([A-Z]{2}\d{4,}[A-Z]{1,}\d{2,})/i);
  return match ? normalizeSku(match[1].toUpperCase()) : "";
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

function normalizeProductLookupName(name) {
  return normalizeProductName(stripProductBrackets(name))
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function productNamesMatch(nameA, nameB) {
  const a = normalizeProductLookupName(nameA);
  const b = normalizeProductLookupName(nameB);
  if (!a || !b) return false;
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

function makeOrderKey(normPhone, sku) {
  const phone = normPhone ? String(normPhone).trim() : "";
  const cleanSku = sku ? String(sku).trim() : "";
  return phone && cleanSku ? `${phone}|${cleanSku}` : null;
}

function normalizeSourceOrderId(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function orderSourceId(order) {
  return normalizeSourceOrderId(order && (
    order.orderId
    || order.easyOrderUuid
    || order.easyOrderId
    || order.orderUuid
    || order.sourceOrderId
    || order.storeOrderId
  ));
}

function orderCreatedDay(order) {
  return localDateKey(order && (order.easyCreatedAt || order.createdAt || order.date));
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
    orderId: String(row["Order ID"] || row["ID"] || row["External Order ID"] || "").trim(),
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
  base.uploadGroupKey = [
    base.source,
    base.normPhone,
    base.orderId,
    base.easyCreatedAt,
    base.name,
    base.address || "",
    base.phoneAmbiguityGroupId || "",
    base.phoneCandidateIndex || "",
  ].map((value) => String(value || "").trim()).join("|");

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

function realOrderHistoryKey(order) {
  const sku = String(order && order.sku || "").trim();
  const product = normalizeProductName(order && order.productName || "");
  return sku && product ? `${sku}|${product}` : "";
}

function numbersCloseForHistory(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return false;
  return Math.abs(left - right) <= Math.max(1, Math.abs(right) * 0.02);
}

function hasExplicitQuantityInProductName(productName, qty) {
  const count = Number(qty || 0) || 0;
  if (count <= 1) return true;
  const text = normalizeDigits(productName).toLowerCase();
  if (!text) return false;
  if (count === 2 && /(?:حبتين|حبتان|قطعتين|قطعتان|عبوتين|عبوتان|اثنين|إثنين)/i.test(text)) return true;
  if (count === 3 && /(?:ثلاث|ثلاثه|ثلاثة|3\s*(?:حبه|حبة|حب|قطع|قطعه|قطعة|عبوه|عبوة|عبوات))/i.test(text)) return true;
  const escaped = String(count).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const units = [
    "x", "\\*", "\\u00d7",
    "pcs?", "pieces?", "piece", "packs?", "sets?",
    "\\u062d\\u0628\\u0647", "\\u062d\\u0628\\u0629", "\\u062d\\u0628",
    "\\u0642\\u0637\\u0639\\u0647", "\\u0642\\u0637\\u0639\\u0629", "\\u0642\\u0637\\u0639",
    "\\u0639\\u0628\\u0648\\u0647", "\\u0639\\u0628\\u0648\\u0629", "\\u0639\\u0628\\u0648\\u0627\\u062a",
  ].join("|");
  const before = "(^|[^\\p{L}\\p{N}])";
  const after = "($|[^\\p{L}\\p{N}])";
  return new RegExp("^\\s*" + escaped + "\\s+", "iu").test(text)
    || new RegExp(before + escaped + "\\s*(?:" + units + ")" + after, "iu").test(text)
    || new RegExp(before + "(?:" + units + ")\\s*" + escaped + after, "iu").test(text);
}
function repairRealOrderQuantitiesFromHistory(orders) {
  const groups = new Map();
  for (const order of orders || []) {
    const key = realOrderHistoryKey(order);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  }

  let repaired = 0;
  for (const items of groups.values()) {
    const qtyCounts = new Map();
    const unitPricesByQty = new Map();
    for (const item of items) {
      const qty = Number(item.qty || 1) || 1;
      const unitPrice = Number(item.unitPrice || 0) || 0;
      qtyCounts.set(qty, (qtyCounts.get(qty) || 0) + 1);
      if (!unitPricesByQty.has(qty)) unitPricesByQty.set(qty, []);
      if (unitPrice > 0) unitPricesByQty.get(qty).push(unitPrice);
    }
    const total = items.length;
    const dominant = Array.from(qtyCounts.entries())
      .map(([qty, count]) => ({ qty, count }))
      .filter((entry) => entry.qty > 0 && entry.count > 0)
      .sort((a, b) => (b.count - a.count) || (b.qty - a.qty))[0];
    if (!dominant || dominant.qty <= 1 || dominant.qty > 10 || total < 4 || dominant.count / total < 0.65) continue;

    const dominantPrices = unitPricesByQty.get(dominant.qty) || [];
    const dominantUnitPrice = dominantPrices.length
      ? dominantPrices.sort((a, b) => a - b)[Math.floor(dominantPrices.length / 2)]
      : 0;
    const explicitQuantity = items.some((item) => hasExplicitQuantityInProductName(item.productName, dominant.qty));
    if (!explicitQuantity) {
      for (const item of items) {
        const qty = Number(item.qty || 1) || 1;
        if (qty >= dominant.qty) continue;
        item.quantityRepairSkipped = {
          from: qty,
          to: dominant.qty,
          reason: "quantity_inference_requires_manual_review",
          source: "easyorders_history",
          sampleCount: total,
          dominantCount: dominant.count,
          confidence: dominant.count / total,
        };
        item.quantitySource = item.quantitySource || "easyorders_export";
        item.priceSource = item.priceSource || "easyorders_export_item_price";
      }
      continue;
    }
    for (const item of items) {
      const qty = Number(item.qty || 1) || 1;
      const unitPrice = Number(item.unitPrice || 0) || 0;
      if (qty >= dominant.qty) continue;
      if (dominantUnitPrice > 0 && unitPrice > 0 && !numbersCloseForHistory(unitPrice, dominantUnitPrice)) continue;
      item.qty = dominant.qty;
      item.subtotal = unitPrice > 0 ? unitPrice * dominant.qty : item.subtotal;
      item.quantityRepair = {
        from: qty,
        to: dominant.qty,
        reason: "sku_product_history_min_quantity",
        source: "easyorders_history",
        sampleCount: total,
        dominantCount: dominant.count,
        confidence: dominant.count / total,
      };
      item.quantitySource = "explicit_product_quantity_repaired_from_history";
      item.priceSource = "easyorders_export_item_price";
      repaired++;
    }
  }
  return repaired;
}

function catalogQuantityConfidence(match) {
  const dominantQty = Number(match && match.dominantQty || 0) || 0;
  const totalSamples = Number(match && match.totalSamples || 0) || 0;
  const dominantCount = Number(match && match.dominantQtyCount || 0) || 0;
  const confidence = Number(match && match.dominantQtyConfidence || 0) || (totalSamples > 0 ? dominantCount / totalSamples : 0);
  return { dominantQty, totalSamples, dominantCount, confidence };
}

function findCatalogBySku(catalog, sku) {
  const cleanSku = String(sku || "").trim();
  if (!cleanSku || !catalog || typeof catalog !== "object") return null;
  return Object.values(catalog).find((entry) => String(entry && entry.sku || "").trim() === cleanSku) || null;
}

function catalogSubtotalForQty(match, qty) {
  const prices = match && match.prices && typeof match.prices === "object" ? match.prices : {};
  const exact = prices[String(qty)] != null ? prices[String(qty)] : prices[qty];
  const subtotal = Number(exact || 0) || 0;
  return subtotal > 0 ? subtotal : 0;
}

function catalogPriceOptions(match) {
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

function priceCloseForTier(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return false;
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.005);
}

function buildSkuTierProfiles(catalog = {}, taagerCatalog = {}) {
  const profiles = new Map();
  function addEntry(entry, source) {
    const sku = normalizeSku(entry && entry.sku);
    if (!sku) return;
    if (!profiles.has(sku)) {
      profiles.set(sku, {
        sku,
        tiers: [],
        productNames: new Set(),
        sourceCounts: { taager: 0, easyorders: 0 },
      });
    }
    const profile = profiles.get(sku);
    if (entry.productName) profile.productNames.add(normalizeProductName(entry.productName));
    const prices = entry && entry.prices && typeof entry.prices === "object" ? entry.prices : {};
    const qtyCounts = entry && entry.qtyCounts && typeof entry.qtyCounts === "object" ? entry.qtyCounts : {};
    for (const [qtyText, subtotalValue] of Object.entries(prices)) {
      const qty = Number(qtyText) || 0;
      const subtotal = Number(subtotalValue) || 0;
      if (qty <= 0 || subtotal <= 0) continue;
      const sampleCount = Math.max(1, Number(qtyCounts[qtyText] || qtyCounts[qty] || 0) || 0);
      const tierSource = source || entry.source || "catalog";
      profile.tiers.push({
        qty,
        subtotal,
        unitPrice: subtotal / qty,
        sampleCount,
        source: tierSource,
      });
      if (tierSource === "taager") profile.sourceCounts.taager += sampleCount;
      else profile.sourceCounts.easyorders += sampleCount;
    }
  }
  for (const entry of Object.values(catalog || {})) addEntry(entry, entry && entry.source || "easyorders");
  for (const entry of Object.values(taagerCatalog || {})) addEntry(entry, "taager");
  for (const profile of profiles.values()) {
    profile.totalSamples = profile.tiers.reduce((sum, tier) => sum + tier.sampleCount, 0);
    profile.priceOptions = profile.tiers
      .map((tier) => ({
        qty: tier.qty,
        subtotal: tier.subtotal,
        unitPrice: tier.unitPrice,
        sampleCount: tier.sampleCount,
        source: tier.source,
      }))
      .sort((a, b) => (a.qty - b.qty) || (a.subtotal - b.subtotal));
  }
  return profiles;
}

function findSkuProfile(tierProfiles, sku) {
  const cleanSku = normalizeSku(sku);
  if (!cleanSku || !(tierProfiles instanceof Map)) return null;
  return tierProfiles.get(cleanSku) || null;
}

function dominantTierFromProfile(profile, options = {}) {
  if (!profile || !Array.isArray(profile.tiers) || !profile.tiers.length) return null;
  const taagerTiers = profile.tiers.filter((tier) => tier.source === "taager");
  const tiers = taagerTiers.length ? taagerTiers : profile.tiers;
  const qtyCounts = new Map();
  const tierModes = new Map();
  for (const tier of tiers) {
    const qty = Number(tier.qty || 0) || 0;
    const subtotal = Number(tier.subtotal || 0) || 0;
    if (qty <= 0 || subtotal <= 0) continue;
    qtyCounts.set(qty, (qtyCounts.get(qty) || 0) + (Number(tier.sampleCount || 1) || 1));
    const modeKey = `${qty}|${subtotal}`;
    tierModes.set(modeKey, (tierModes.get(modeKey) || 0) + (Number(tier.sampleCount || 1) || 1));
  }
  const totalSamples = Array.from(qtyCounts.values()).reduce((sum, count) => sum + count, 0);
  const winners = Array.from(qtyCounts.entries())
    .map(([qty, count]) => ({ qty, count, confidence: totalSamples > 0 ? count / totalSamples : 0 }))
    .sort((a, b) => (b.count - a.count) || (a.qty - b.qty));
  const winner = winners[0];
  if (!winner) return null;
  if (winners[1] && winners[1].count === winner.count && winners[1].qty !== winner.qty) {
    return {
      uncertain: true,
      reason: "ambiguous_sku_price_tier",
      message: `SKU ${profile.sku} has conflicting dominant quantity tiers.`,
      sampleCount: totalSamples,
      confidence: winner.confidence,
    };
  }
  if (!options.allowSingleSampleDominance && totalSamples < 2) {
    return {
      uncertain: true,
      reason: "sku_tier_profile_too_weak",
      message: `SKU ${profile.sku} needs more subtotal-tier history before automatic upload.`,
      sampleCount: totalSamples,
      confidence: winner.confidence,
    };
  }
  if (winner.confidence < 0.65) {
    return {
      uncertain: true,
      reason: "ambiguous_sku_price_tier",
      message: `SKU ${profile.sku} does not have a dominant quantity tier.`,
      sampleCount: totalSamples,
      confidence: winner.confidence,
    };
  }
  const subtotalModes = Array.from(tierModes.entries())
    .map(([key, count]) => {
      const [qtyText, subtotalText] = key.split("|");
      return { qty: Number(qtyText) || 0, subtotal: Number(subtotalText) || 0, count };
    })
    .filter((tier) => tier.qty === winner.qty && tier.subtotal > 0)
    .sort((a, b) => b.count - a.count);
  const mode = subtotalModes[0];
  if (!mode) return null;
  return {
    qty: winner.qty,
    subtotal: mode.subtotal,
    unitPrice: mode.subtotal / winner.qty,
    confidence: winner.confidence,
    sampleCount: winner.count,
    priceSource: taagerTiers.length ? "taager_sku_subtotal_tier" : "easyorders_sku_subtotal_tier",
    quantitySource: taagerTiers.length ? "taager_sku_dominant_tier" : "easyorders_sku_dominant_tier",
  };
}

function tierDominanceForMatches(profile, matches) {
  const source = matches.find((tier) => tier && tier.source === "taager") ? "taager" : (matches[0] && matches[0].source || "");
  const sourceTiers = (profile.tiers || []).filter((tier) => !source || tier.source === source);
  const qtyCounts = new Map();
  for (const tier of sourceTiers) {
    const qty = Number(tier.qty || 0) || 0;
    if (qty <= 0) continue;
    qtyCounts.set(qty, (qtyCounts.get(qty) || 0) + (Number(tier.sampleCount || 1) || 1));
  }
  const total = Array.from(qtyCounts.values()).reduce((sum, count) => sum + count, 0);
  const matchedQty = Number(matches[0] && matches[0].qty || 0) || 0;
  const matchedSamples = matches.reduce((sum, tier) => sum + (Number(tier.sampleCount || 1) || 1), 0);
  const top = Array.from(qtyCounts.entries())
    .map(([qty, count]) => ({ qty, count, confidence: total > 0 ? count / total : 0 }))
    .sort((a, b) => (b.count - a.count) || (a.qty - b.qty))[0] || { qty: 0, count: 0, confidence: 0 };
  const confidence = total > 0 ? (qtyCounts.get(matchedQty) || matchedSamples) / total : 0;
  return {
    source,
    matchedQty,
    matchedSamples,
    total,
    topQty: top.qty,
    topSamples: top.count,
    topConfidence: top.confidence,
    confidence,
    trusted: source === "taager" && (matchedSamples >= 3 || (top.qty === matchedQty && top.confidence >= 0.60)),
  };
}

function resolveSkuPriceTier(input = {}) {
  const sku = normalizeSku(input.sku);
  const profile = input.profile || findSkuProfile(input.tierProfiles, sku);
  const easyQty = Number(input.easyQty || 0) || 0;
  const subtotal = Number(input.subtotal || 0) || 0;
  const sourceType = input.sourceType || "";
  const base = {
    resolved: false,
    uncertain: false,
    qty: easyQty || null,
    subtotal: subtotal || null,
    unitPrice: easyQty > 0 && subtotal > 0 ? subtotal / easyQty : null,
    reason: "",
    message: "",
    confidence: 0,
    sampleCount: 0,
    priceSource: "",
    quantitySource: "",
    sku,
    priceOptions: profile && profile.priceOptions || [],
  };
  if (easyQty > MAX_SAFE_AUTO_QUANTITY) {
    return {
      ...base,
      uncertain: true,
      reason: "quantity_above_safe_limit",
      message: `Quantity ${easyQty} is above safe auto-upload limit ${MAX_SAFE_AUTO_QUANTITY}. Manual review required.`,
      quantitySource: "easyorders_export",
      priceSource: "easyorders_export_item_price",
    };
  }
  if (!sku) {
    return {
      ...base,
      uncertain: true,
      reason: "missing_sku_for_tier_resolution",
      message: "No SKU is available for subtotal-tier resolution.",
    };
  }
  if (!profile || !profile.tiers.length) {
    if (sourceType === "real" && easyQty > 0) {
      return {
        ...base,
        resolved: true,
        qty: easyQty,
        subtotal,
        unitPrice: easyQty > 0 && subtotal > 0 ? subtotal / easyQty : base.unitPrice,
        reason: "easyorders_quantity_without_sku_tier_profile",
        message: "No SKU tier profile exists; kept EasyOrders quantity and price.",
        quantitySource: "easyorders_export",
        priceSource: "easyorders_export_item_price",
      };
    }
    return {
      ...base,
      uncertain: true,
      reason: "missing_sku_tier_profile",
      message: `No trusted subtotal-tier profile exists for SKU ${sku}.`,
    };
  }

  if (subtotal > 0) {
    let matches = profile.tiers.filter((tier) => priceCloseForTier(subtotal, tier.subtotal));
    const taagerMatches = matches.filter((tier) => tier.source === "taager");
    if (taagerMatches.length) matches = taagerMatches;
    const qtys = [...new Set(matches.map((tier) => tier.qty))];
    if (qtys.length > 1) {
      return {
        ...base,
        uncertain: true,
        reason: "ambiguous_sku_price_tier",
        message: `Subtotal ${subtotal} maps to multiple quantities for SKU ${sku}.`,
        sampleCount: matches.reduce((sum, tier) => sum + (Number(tier.sampleCount || 1) || 1), 0),
        confidence: 0,
      };
    }
    if (qtys.length === 1) {
      const qty = qtys[0];
      const sampleCount = matches.reduce((sum, tier) => sum + (Number(tier.sampleCount || 1) || 1), 0);
      const dominance = tierDominanceForMatches(profile, matches);
      if (!dominance.trusted) {
        return {
          ...base,
          uncertain: true,
          qty,
          subtotal,
          unitPrice: subtotal / qty,
          reason: "sku_tier_profile_too_weak",
          message: `Subtotal ${subtotal} matched SKU ${sku}, but Taager tier confidence is not strong enough for automatic upload.`,
          sampleCount,
          confidence: dominance.confidence,
          priceSource: matches[0].source === "taager" ? "taager_sku_subtotal_tier" : "easyorders_sku_subtotal_tier",
          quantitySource: "sku_subtotal_tier",
        };
      }
      if (qty > MAX_SAFE_AUTO_QUANTITY) {
        return {
          ...base,
          uncertain: true,
          qty,
          subtotal,
          unitPrice: subtotal / qty,
          reason: "quantity_above_safe_limit",
          message: `Quantity ${qty} is above safe auto-upload limit ${MAX_SAFE_AUTO_QUANTITY}. Manual review required.`,
          sampleCount,
          confidence: profile.totalSamples > 0 ? sampleCount / profile.totalSamples : 1,
        };
      }
      return {
        ...base,
        resolved: true,
        qty,
        subtotal,
        unitPrice: subtotal / qty,
        reason: easyQty && easyQty !== qty ? "sku_subtotal_tier_overrode_easyorders_quantity" : "sku_subtotal_tier_verified",
        message: easyQty && easyQty !== qty
          ? `Subtotal ${subtotal} maps to quantity ${qty} for SKU ${sku}; EasyOrders quantity ${easyQty} was not used.`
          : `Subtotal ${subtotal} verified for SKU ${sku}.`,
        confidence: dominance.confidence,
        sampleCount,
        priceSource: matches[0].source === "taager" ? "taager_sku_subtotal_tier" : "easyorders_sku_subtotal_tier",
        quantitySource: "sku_subtotal_tier",
      };
    }
    return {
      ...base,
      uncertain: true,
      reason: "subtotal_not_in_sku_tiers",
      message: `Subtotal ${subtotal} was not found in trusted tiers for SKU ${sku}.`,
      quantitySource: easyQty ? "easyorders_export" : "",
      priceSource: "easyorders_export_item_price",
      sampleCount: profile.totalSamples || 0,
    };
  }

  if (input.allowDominantTierWithoutSubtotal) {
    const dominant = dominantTierFromProfile(profile, { allowSingleSampleDominance: input.allowSingleSampleDominance === true });
    if (dominant && dominant.uncertain) return { ...base, ...dominant, uncertain: true };
    if (dominant && dominant.qty > 0 && dominant.subtotal > 0) {
      if (dominant.qty > 1 && !hasExplicitQuantityInProductName(input.productText || "", dominant.qty)) {
        return {
          ...base,
          ...dominant,
          uncertain: true,
          reason: "quantity_inference_requires_manual_review",
          message: `SKU ${sku} has a dominant quantity tier, but the order has no subtotal and the product title does not clearly state quantity ${dominant.qty}.`,
        };
      }
      if (dominant.qty > MAX_SAFE_AUTO_QUANTITY) {
        return {
          ...base,
          ...dominant,
          uncertain: true,
          reason: "quantity_above_safe_limit",
          message: `Quantity ${dominant.qty} is above safe auto-upload limit ${MAX_SAFE_AUTO_QUANTITY}. Manual review required.`,
        };
      }
      return {
        ...base,
        ...dominant,
        resolved: true,
        uncertain: false,
        reason: "sku_dominant_tier_without_easyorders_subtotal",
        message: `SKU ${sku} resolved from dominant subtotal tier.`,
      };
    }
  }

  return {
    ...base,
    uncertain: true,
    reason: "missing_easyorders_subtotal",
    message: `SKU ${sku} needs an EasyOrders subtotal or a dominant trusted tier before automatic upload.`,
    sampleCount: profile.totalSamples || 0,
  };
}

function applyTierDecisionToOrder(order, decision, options = {}) {
  if (!order || !decision) return;
  order.skuTierDecision = {
    resolved: decision.resolved === true,
    uncertain: decision.uncertain === true,
    reason: decision.reason || "",
    message: decision.message || "",
    confidence: Number(decision.confidence || 0) || 0,
    sampleCount: Number(decision.sampleCount || 0) || 0,
    priceSource: decision.priceSource || "",
    quantitySource: decision.quantitySource || "",
  };
  order.priceOptions = Array.isArray(decision.priceOptions) ? decision.priceOptions : order.priceOptions || [];
  order.suggestedQty = decision.qty || "";
  order.suggestedSubtotal = decision.subtotal || "";
  order.confidence = Number(decision.confidence || 0) || 0;
  order.sampleCount = Number(decision.sampleCount || 0) || 0;
  if (decision.uncertain) {
    order.manualReview = true;
    order.uncertain = true;
    order.reason = decision.reason || order.reason || "sku_tier_resolution_uncertain";
    order.actionMessage = decision.message || order.actionMessage || "";
    return;
  }
  if (decision.resolved && options.mutate !== false) {
    order.qty = decision.qty || order.qty;
    order.subtotal = decision.subtotal || order.subtotal;
    order.unitPrice = decision.unitPrice || order.unitPrice;
    order.quantitySource = decision.quantitySource || order.quantitySource;
    order.priceSource = decision.priceSource || order.priceSource;
    if (decision.reason === "sku_subtotal_tier_overrode_easyorders_quantity") {
      order.quantityRepair = {
        from: options.previousQty || order.qty,
        to: decision.qty,
        reason: decision.reason,
        source: decision.priceSource || "sku_subtotal_tier",
        sampleCount: decision.sampleCount || 0,
        confidence: decision.confidence || 0,
      };
    }
  }
}

function repairOrderQuantitiesFromCatalog(orders, catalog = {}, taagerCatalog = {}) {
  let repaired = 0;
  const tierProfiles = buildSkuTierProfiles(catalog, taagerCatalog);
  for (const order of orders || []) {
    const currentQty = Number(order && order.qty || 1) || 1;
    if (!order || currentQty <= 0) continue;
    const decision = resolveSkuPriceTier({
      sku: order.sku,
      easyQty: currentQty,
      subtotal: order.subtotal,
      sourceType: "real",
      tierProfiles,
    });
    applyTierDecisionToOrder(order, decision, { previousQty: currentQty });
    if (decision && decision.uncertain) continue;
    if (decision && decision.resolved) {
      if (Number(decision.qty || 0) !== currentQty) repaired++;
      continue;
    }
    if (currentQty > 10) continue;
    const unitPrice = Number(order.unitPrice || 0) || 0;
    if (unitPrice <= 0) continue;

    const productMatch = findProductInCatalog(order.productName, catalog);
    const easyMatch = productMatch && String(productMatch.sku || "").trim() === String(order.sku || "").trim()
      ? productMatch
      : null;
    const taagerMatch = findCatalogBySku(taagerCatalog, order.sku);
    const sources = [
      { match: easyMatch, source: "easyorders_catalog", minSamples: 4, minConfidence: 0.65 },
      { match: taagerMatch, source: "taager_catalog", minSamples: 5, minConfidence: 0.85 },
    ];

    for (const source of sources) {
      if (!source.match) continue;
      const confidence = catalogQuantityConfidence(source.match);
      const targetQty = confidence.dominantQty;
      if (targetQty <= currentQty || targetQty <= 1 || targetQty > 10) continue;
      if (confidence.totalSamples < source.minSamples || confidence.confidence < source.minConfidence) continue;
      if (!hasExplicitQuantityInProductName(order.productName || source.match.productName, targetQty)) {
        order.quantityRepairSkipped = {
          from: currentQty,
          to: targetQty,
          reason: "quantity_inference_requires_manual_review",
          source: source.source,
          sampleCount: confidence.totalSamples,
          dominantCount: confidence.dominantCount,
          confidence: confidence.confidence,
        };
        order.quantitySource = order.quantitySource || "easyorders_export";
        order.priceSource = order.priceSource || "easyorders_export_item_price";
        continue;
      }
      const targetSubtotal = catalogSubtotalForQty(source.match, targetQty);
      if (targetSubtotal <= 0) {
        order.quantityRepairSkipped = {
          from: currentQty,
          to: targetQty,
          reason: "quantity_tier_price_not_verified",
          source: source.source,
          sampleCount: confidence.totalSamples,
          dominantCount: confidence.dominantCount,
          confidence: confidence.confidence,
        };
        continue;
      }
      order.qty = targetQty;
      order.subtotal = targetSubtotal;
      order.unitPrice = targetSubtotal / targetQty;
      order.quantityRepair = {
        from: currentQty,
        to: targetQty,
        reason: "sku_product_history_min_quantity",
        source: source.source,
        priceSource: source.source + "_price_for_quantity",
        sampleCount: confidence.totalSamples,
        dominantCount: confidence.dominantCount,
        confidence: confidence.confidence,
      };
      order.quantitySource = "explicit_product_quantity_repaired_from_catalog";
      order.priceSource = source.source + "_price_for_quantity";
      repaired++;
      break;
    }
  }
  return repaired;
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

  const repairedQuantities = 0;
  console.log(`Real orders: ${orders.length} valid items | skipped date:${skipped.date} phone:${skipped.phone} status:${skipped.status} sku:${skipped.sku}`);
  if (repairedQuantities > 0) console.log(`Real orders quantity repaired from SKU/product history: ${repairedQuantities}`);
  if (uncertainPhones > 0) console.log(`Real orders uncertain phones rescued with trailing 0: ${uncertainPhones}`);
  if (ambiguousPhones > 0) console.log(`Real orders expanded from ambiguous phones: ${ambiguousPhones}`);
  return orders;
}

function missedProductNamesFromCell(productText) {
  const clean = String(productText || "").trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((line) => /^(?:[-*•]|\d+[.)-])\s+/.test(line))) {
    return lines.map((line) => line.replace(/^(?:[-*•]|\d+[.)-])\s+/, "").trim()).filter(Boolean);
  }
  return [clean];
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
    const skuFromUtm = extractSkuFromText(row["UTM Campaign"] || row["Utm Campaign"] || row["Campaign"] || "");
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
        skuFromUtm,
        skuSource: skuFromUtm ? "utm_campaign" : "",
        qty: null,
        subtotal: null,
        unitPrice: null,
      };
      baseOrder.uploadGroupKey = [
        baseOrder.source,
        baseOrder.normPhone,
        baseOrder.easyCreatedAt,
        baseOrder.name,
        baseOrder.address || "",
        baseOrder.phoneAmbiguityGroupId || "",
        baseOrder.phoneCandidateIndex || "",
      ].map((value) => String(value || "").trim()).join("|");

      missedProductNamesFromCell(productText).forEach((productName) => {
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
    if (!catalog[key]) catalog[key] = { sku: order.sku, productName: key, prices: {}, qtyCounts: {}, source: "easyorders" };
    const entry = catalog[key];
    const qty = order.qty || 1;
    if (order.manualReview || qty > MAX_SAFE_AUTO_QUANTITY) continue;
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
    const totalSamples = Object.values(entry.qtyCounts).reduce((sum, count) => sum + (Number(count) || 0), 0);
    const dominant = Object.entries(entry.qtyCounts)
      .map(([qty, count]) => ({ qty: Number(qty) || 0, count: Number(count) || 0 }))
      .filter((item) => item.qty > 0 && item.count > 0)
      .sort((a, b) => (b.count - a.count) || (a.qty - b.qty))[0] || { qty: qtys[0] || 1, count: 0 };
    result[name] = {
      sku: entry.sku,
      productName: name,
      minQty: qtys[0] || 1,
      maxQty: qtys[qtys.length - 1] || 1,
      prices,
      qtyCounts: { ...entry.qtyCounts },
      totalSamples,
      dominantQty: dominant.qty,
      dominantQtyCount: dominant.count,
      dominantQtyConfidence: totalSamples > 0 ? dominant.count / totalSamples : 0,
      source: entry.source || "easyorders",
    };
  }

  console.log(`EasyOrders product catalog: ${Object.keys(result).length} products`);
  return result;
}

function buildTaagerProductCatalog(buffer, country = COUNTRY) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!rows || rows.length < 2) {
      console.log("Taager product catalog: 0 products");
      return {};
    }

    const header = rows[0] || [];
    const productsIdx = findHeaderIndex(header, ["المنتجات", "Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª", "Products", "SKU"], 16);
    const qtyIdx = findHeaderIndex(header, ["الكميات", "Ø§Ù„ÙƒÙ…ÙŠØ§Øª", "Quantity", "Qty"], 17);
    const priceIdx = findHeaderIndex(header, ["الأسعار", "Ø§Ù„Ø£Ø³Ø¹Ø§Ø±", "Prices", "Price"], 18);
    const catalog = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const products = splitTaagerProducts(row[productsIdx]);
      const qtys = splitTaagerProducts(row[qtyIdx]);
      const prices = splitTaagerProducts(row[priceIdx]);

      products.forEach((skuOrName, idx) => {
        const productToken = String(skuOrName || "").trim();
        const key = normalizeProductName(productToken);
        if (!key) return;
        if (!catalog[key]) {
          catalog[key] = { sku: productToken, productName: key, prices: {}, qtyCounts: {}, source: "taager" };
        }
        const entry = catalog[key];
        const qty = parseOptionalQty(qtys[idx] != null && String(qtys[idx]).trim() !== "" ? qtys[idx] : qtys[0]);
        if (!qty || qty <= 0) return;
        const subtotal = parseMoney(prices[idx] || prices[0]);
        entry.qtyCounts[qty] = (entry.qtyCounts[qty] || 0) + 1;
        if (!entry.prices[qty]) entry.prices[qty] = [];
        entry.prices[qty].push(Math.round(subtotal));
      });
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
      const totalSamples = Object.values(entry.qtyCounts).reduce((sum, count) => sum + (Number(count) || 0), 0);
      const dominant = Object.entries(entry.qtyCounts)
        .map(([qty, count]) => ({ qty: Number(qty) || 0, count: Number(count) || 0 }))
        .filter((item) => item.qty > 0 && item.count > 0)
        .sort((a, b) => (b.count - a.count) || (a.qty - b.qty))[0] || { qty: qtys[0] || 1, count: 0 };
      result[name] = {
        sku: entry.sku,
        productName: name,
        minQty: qtys[0] || 1,
        maxQty: qtys[qtys.length - 1] || 1,
        prices,
        qtyCounts: { ...entry.qtyCounts },
        totalSamples,
        dominantQty: dominant.qty,
        dominantQtyCount: dominant.count,
        dominantQtyConfidence: totalSamples > 0 ? dominant.count / totalSamples : 0,
        source: "taager",
      };
    }

    console.log(`Taager product catalog: ${Object.keys(result).length} products`);
    return result;
  } catch (err) {
    console.error("[Parser] buildTaagerProductCatalog error:", err.message);
    return {};
  }
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

function resolveMissedOrders(missedOrders, catalog, taagerCatalog = {}) {
  const resolved = [];
  const skippedOrders = [];
  const skippedNames = [];
  const sourceStats = { easyorders: 0, taager: 0 };
  const tierProfiles = buildSkuTierProfiles(catalog, taagerCatalog);

  for (const order of missedOrders) {
    const productMatch = findProductInCatalog(order.productName, catalog);
    const fallbackProductMatch = productMatch || findProductInCatalog(order.productName, taagerCatalog);
    const productSku = normalizeSku(productMatch && productMatch.sku);
    const utmSku = normalizeSku(order.skuFromUtm || "");
    if (productSku && utmSku && productSku !== utmSku) {
      skippedNames.push(order.productName);
      skippedOrders.push({
        ...order,
        source: order.source || "missed",
        normPhone: order.normPhone || "",
        normalizedPhone: order.normPhone || "",
        name: order.name,
        rawPhone: order.rawPhone,
        productName: order.productName,
        city: order.city,
        address: order.address,
        sku: productSku,
        utmSku,
        suggestedSku: productSku,
        reason: "utm_product_sku_conflict",
        actionMessage: `Missed product matched SKU ${productSku}, but UTM Campaign contains SKU ${utmSku}. Manual review required.`,
        uncertain: true,
      });
      continue;
    }
    const explicitSku = productSku || utmSku || normalizeSku(order.sku);
    const match = explicitSku
      ? (findCatalogBySku(taagerCatalog, explicitSku) || findCatalogBySku(catalog, explicitSku) || fallbackProductMatch)
      : fallbackProductMatch;
    if (!match) {
      skippedNames.push(order.productName);
      skippedOrders.push({
        ...order,
        source: order.source || "missed",
        normPhone: order.normPhone || "",
        normalizedPhone: order.normPhone || "",
        name: order.name,
        rawPhone: order.rawPhone,
        productName: order.productName,
        city: order.city,
        address: order.address,
        sku: explicitSku || "",
        reason: "missing_sku_for_missed_product",
        actionMessage: explicitSku
          ? `SKU ${explicitSku} was found on the missed row, but no trusted Taager/EasyOrders tier profile exists.`
          : "Missed product name did not match EasyOrders real orders and no clean SKU was found in UTM Campaign.",
        uncertain: true,
      });
      continue;
    }

    const tierDecision = explicitSku
      ? resolveSkuPriceTier({
          sku: explicitSku,
          easyQty: order.qty,
          subtotal: order.subtotal,
          sourceType: "missed",
          tierProfiles,
          allowDominantTierWithoutSubtotal: true,
          allowSingleSampleDominance: true,
          productText: order.productName || "",
        })
      : null;
    if (tierDecision && tierDecision.uncertain) {
      skippedNames.push(order.productName);
      skippedOrders.push({
        ...order,
        source: order.source || "missed",
        normPhone: order.normPhone || "",
        normalizedPhone: order.normPhone || "",
        name: order.name,
        rawPhone: order.rawPhone,
        productName: order.productName,
        city: order.city,
        address: order.address,
        sku: explicitSku || match.sku,
        qty: order.qty || "",
        subtotal: order.subtotal || "",
        suggestedQty: tierDecision.qty || "",
        suggestedSubtotal: tierDecision.subtotal || "",
        unitPrice: tierDecision.unitPrice || "",
        catalogSource: match.source || "easyorders",
        quantitySource: tierDecision.quantitySource || "",
        priceSource: tierDecision.priceSource || "",
        reason: tierDecision.reason || "sku_tier_resolution_uncertain",
        actionMessage: tierDecision.message || "",
        confidence: tierDecision.confidence || 0,
        sampleCount: tierDecision.sampleCount || 0,
        uncertain: true,
      });
      continue;
    }
    if (tierDecision && tierDecision.resolved) {
      resolved.push({
        ...order,
        sku: explicitSku || match.sku,
        skuSource: productSku ? "product_name" : (utmSku ? "utm_campaign" : order.skuSource || ""),
        productName: match.productName || order.productName,
        qty: tierDecision.qty,
        subtotal: tierDecision.subtotal,
        unitPrice: tierDecision.unitPrice,
        suggestedQty: tierDecision.qty,
        suggestedSubtotal: tierDecision.subtotal,
        catalogSource: match.source || "easyorders",
        quantitySource: tierDecision.quantitySource,
        priceSource: tierDecision.priceSource,
        confidence: tierDecision.confidence || 0,
        sampleCount: tierDecision.sampleCount || 0,
        priceOptions: tierDecision.priceOptions || catalogPriceOptions(match),
      });
      if (match.source === "taager") sourceStats.taager++;
      else sourceStats.easyorders++;
      continue;
    }

    const qty = match.minQty || 1;
    const subtotal = catalogSubtotalForQty(match, qty) || match.prices[Object.keys(match.prices)[0]] || 0;
    if (qty > 1 && !hasExplicitQuantityInProductName(order.productName || match.productName, qty)) {
      skippedNames.push(order.productName);
      skippedOrders.push({
        ...order,
        source: order.source || "missed",
        normPhone: order.normPhone || "",
        normalizedPhone: order.normPhone || "",
        name: order.name,
        rawPhone: order.rawPhone,
        productName: order.productName,
        city: order.city,
        address: order.address,
        sku: match.sku,
        qty,
        subtotal,
        unitPrice: qty > 0 ? Math.round(subtotal / qty) : subtotal,
        catalogSource: match.source || "easyorders",
        quantitySource: "catalog_min_quantity_inferred",
        priceSource: "catalog_price_for_quantity",
        reason: "quantity_inference_requires_manual_review",
        actionMessage: "Catalog/history suggested quantity > 1 but the missed product title does not explicitly show a bundle quantity.",
        uncertain: true,
      });
      continue;
    }
    resolved.push({
      ...order,
      sku: match.sku,
      skuSource: productSku ? "product_name" : (utmSku ? "utm_campaign" : order.skuSource || ""),
      productName: match.productName,
      qty,
      subtotal,
      unitPrice: Math.round(subtotal / qty),
      catalogSource: match.source || "easyorders",
      quantitySource: qty > 1 ? "explicit_product_quantity_from_catalog" : "catalog_min_quantity",
      priceSource: "catalog_price_for_quantity",
      priceOptions: catalogPriceOptions(match),
    });
    if (match.source === "taager") sourceStats.taager++;
    else sourceStats.easyorders++;
  }

  if (skippedNames.length > 0) {
    console.log(`Missed orders skipped (not found in EasyOrders sheet or Taager sheet): ${[...new Set(skippedNames)].join(", ")}`);
  }
  console.log(`Missed orders resolved: ${resolved.length} SKU-backed items (EasyOrders:${sourceStats.easyorders}, Taager:${sourceStats.taager})`);
  return { resolved, skippedOrders };
}

function parseTaagerOrderKeys(buffer, country = COUNTRY) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const header = rows[0] || [];
  const orderIdx = findHeaderIndex(header, ["Order Number"], 0);
  const statusIdx = findHeaderIndex(header, ["Status"], 2);
  const createdIdx = findHeaderIndex(header, ["تاريخ الإنشاء", "Created At", "CreatedAt", "Created Date", "Order Date"], 3);
  const phoneIdx = findHeaderIndex(header, ["رقم الهاتف", "Phone Number", "Phone"], 5);
  const productsIdx = findHeaderIndex(header, ["المنتجات", "Products", "SKU"], 16);

  const storeOrderIdx = findHeaderIndex(header, ["كود الطلب للمتجر", "Order ID on your store", "Store Order ID", "Merchant Order ID", "External Order ID"], 22);

  const keys = new Set();
  const repeatAllowedKeys = new Set();
  const allKeys = new Set();
  const statusByKey = new Map();
  const sourceOrderIds = new Set();
  const phones = new Set();
  const blockingPhones = new Set();
  const repeatAllowedPhones = new Set();
  const orderNumbers = new Set();
  let rowOrderCount = 0;
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const hasData = row.some((cell) => String(cell == null ? "" : cell).trim() !== "");
    if (!hasData) continue;
    rowOrderCount++;

    const orderNumber = String(row[orderIdx] || "").trim();
    if (orderNumber) orderNumbers.add(orderNumber);
    const sourceOrderId = normalizeSourceOrderId(row[storeOrderIdx]);
    const createdDay = localDateKey(row[createdIdx]);
    const createdAt = localDateTimeKey(row[createdIdx]) || createdDay;
    if (sourceOrderId) sourceOrderIds.add(sourceOrderId);

    const phone = normalizePhone(row[phoneIdx], country);
    const products = splitTaagerProducts(row[productsIdx]);
    const status = String(row[statusIdx] || "").trim();
    const statusMeta = taagerStatusMeta(status);
    if (!phone) {
      skipped++;
      continue;
    }
    phones.add(phone);
    if (statusMeta.repeatAllowed === true) repeatAllowedPhones.add(phone);
    else blockingPhones.add(phone);
    products.forEach((sku) => {
      const key = makeOrderKey(phone, sku);
      if (!key) return;
      allKeys.add(key);
      if (!statusByKey.has(key)) statusByKey.set(key, []);
      statusByKey.get(key).push({
        orderNumber,
        sourceOrderId,
        createdAt,
        createdDay,
        status,
        bucket: statusMeta.bucket,
        delivered: statusMeta.delivered === true,
        repeatAllowed: statusMeta.repeatAllowed === true,
      });
      if (statusMeta.repeatAllowed === true) repeatAllowedKeys.add(key);
      else keys.add(key);
    });
  }

  keys.taagerOrderCount = orderNumbers.size || rowOrderCount;
  keys.taagerUniqueOrderNumbers = orderNumbers.size;
  keys.taagerRowOrderCount = rowOrderCount;
  keys.taagerUniquePhones = phones.size;
  keys.taagerAllPhoneSkuKeys = allKeys.size;
  keys.taagerBlockingPhoneSkuKeys = keys.size;
  keys.taagerDeliveredOnlyPhoneSkuKeys = Array.from(repeatAllowedKeys).filter((key) => !keys.has(key)).length;
  keys.taagerRepeatAllowedOnlyPhoneSkuKeys = keys.taagerDeliveredOnlyPhoneSkuKeys;
  keys.taagerPhones = phones;
  keys.taagerBlockingPhones = blockingPhones;
  keys.taagerDeliveredOnlyPhones = Array.from(repeatAllowedPhones).filter((phone) => !blockingPhones.has(phone));
  keys.taagerRepeatAllowedOnlyPhones = keys.taagerDeliveredOnlyPhones;
  keys.taagerStatusByKey = statusByKey;
  keys.taagerSourceOrderIds = sourceOrderIds;
  console.log(`Taager: ${keys.taagerOrderCount} orders loaded | ${keys.size} blocking phone+SKU pairs loaded | ${keys.taagerRepeatAllowedOnlyPhoneSkuKeys} repeat-allowed phone+SKU pairs loaded | ${phones.size} existing phones loaded | skipped phones:${skipped}`);
  return keys;
}

function parseTaagerPhones(buffer, country = COUNTRY) {
  return parseTaagerOrderKeys(buffer, country);
}

function mergeAndDeduplicate(realOrders, resolvedMissed, existingPhones) {
  const seen = new Set();
  const result = [];
  const skippedOrders = [];
  const stats = {
    taagerOrderCount: Number(existingPhones && existingPhones.taagerOrderCount) || 0,
    realValid: realOrders.length,
    missedValid: resolvedMissed.length,
    realNew: 0,
    realDupe: 0,
    realInTaager: 0,
    realMissingSku: 0,
    realPartialInTaager: 0,
    missedNew: 0,
    missedDupe: 0,
    missedInTaager: 0,
    missedMissingSku: 0,
    missedPartialInTaager: 0,
  };

  function skippedGroupOrder(groupedOrder, reason, detail = {}) {
    skippedOrders.push({
      ...groupedOrder,
      rawPhone: groupedOrder.rawPhone || groupedOrder.phone || groupedOrder.normPhone || "",
      normalizedPhone: groupedOrder.normPhone || groupedOrder.phone || "",
      reason,
      existingSkus: detail.existingSkus || "",
      missingSkus: detail.missingSkus || "",
      duplicateSkus: detail.duplicateSkus || "",
      actionMessage: detail.actionMessage || "",
    });
  }

  function repeatAllowedStatusDecision(order, key) {
    const records = existingPhones && existingPhones.taagerStatusByKey instanceof Map
      ? (existingPhones.taagerStatusByKey.get(key) || [])
      : [];
    const repeatAllowedRecords = records.filter((record) => record.repeatAllowed === true);
    if (!repeatAllowedRecords.length) return { action: "allow" };

    const sourceId = orderSourceId(order);
    if (sourceId) {
      if (repeatAllowedRecords.some((record) => record.sourceOrderId && record.sourceOrderId === sourceId)) {
        return { action: "block", reason: "source_order_already_in_taager" };
      }
      if (repeatAllowedRecords.some((record) => record.sourceOrderId)) {
        return { action: "allow" };
      }
    }

    const incomingDay = orderCreatedDay(order);
    const repeatAllowedDays = repeatAllowedRecords.map((record) => record.createdDay).filter(Boolean);
    if (incomingDay && repeatAllowedDays.length) {
      if (repeatAllowedDays.includes(incomingDay)) {
        return { action: "block", reason: "repeat_allowed_order_already_in_taager" };
      }
      return { action: "allow" };
    }

    return {
      action: "uncertain",
      reason: "repeat_allowed_status_needs_identity",
      actionMessage: "A delivered, failed-delivery, or canceled phone+SKU history exists, but no source order ID/date proves this is a new order.",
    };
  }

  function acceptGroup(items, source) {
    const mergedItems = mergeItemList(items);
    const groupedOrder = buildGroupedCartOrders(mergedItems)[0];
    const itemKeys = mergedItems.map((order) => ({ order, key: makeOrderKey(order.normPhone, order.sku) }));
    const missing = itemKeys.filter((entry) => !entry.key);
    if (missing.length > 0) {
      stats[`${source}MissingSku`] += missing.length;
      skippedGroupOrder(groupedOrder, "missing_sku_in_group");
      return;
    }

    const groupSourceId = orderSourceId(groupedOrder) || mergedItems.map(orderSourceId).find(Boolean) || "";
    if (groupSourceId && existingPhones && existingPhones.taagerSourceOrderIds instanceof Set && existingPhones.taagerSourceOrderIds.has(groupSourceId)) {
      stats[`${source}InTaager`]++;
      return;
    }

    const existing = itemKeys.filter((entry) => existingPhones.has(entry.key));
    const duplicate = itemKeys.filter((entry) => seen.has(entry.key));
    const repeatAllowedDecisions = itemKeys
      .filter((entry) => entry.key && !existingPhones.has(entry.key) && !seen.has(entry.key))
      .map((entry) => ({ ...entry, decision: repeatAllowedStatusDecision(entry.order, entry.key) }))
      .filter((entry) => entry.decision.action !== "allow");
    const repeatAllowedBlocked = repeatAllowedDecisions.filter((entry) => entry.decision.action === "block");
    const repeatAllowedUncertain = repeatAllowedDecisions.filter((entry) => entry.decision.action === "uncertain");
    if (existing.length === itemKeys.length) {
      stats[`${source}InTaager`]++;
      return;
    }
    if (repeatAllowedBlocked.length === itemKeys.length) {
      stats[`${source}InTaager`]++;
      return;
    }
    if (duplicate.length === itemKeys.length) {
      stats[`${source}Dupe`]++;
      return;
    }
    if (existing.length > 0 || duplicate.length > 0 || repeatAllowedBlocked.length > 0 || repeatAllowedUncertain.length > 0) {
      stats[`${source}PartialInTaager`]++;
      const reason = repeatAllowedUncertain.length > 0 && existing.length === 0 && duplicate.length === 0 && repeatAllowedBlocked.length === 0
        ? "repeat_allowed_status_needs_identity"
        : "partial_order_already_in_taager";
      const blockedEntries = [...existing, ...repeatAllowedBlocked, ...repeatAllowedUncertain];
      skippedGroupOrder(groupedOrder, reason, {
        existingSkus: blockedEntries.map((entry) => entry.order.sku).join(", "),
        missingSkus: itemKeys.filter((entry) => {
          return !existingPhones.has(entry.key)
            && !seen.has(entry.key)
            && !repeatAllowedDecisions.some((blocked) => blocked.key === entry.key);
        }).map((entry) => entry.order.sku).join(", "),
        duplicateSkus: duplicate.map((entry) => entry.order.sku).join(", "),
        actionMessage: repeatAllowedUncertain.map((entry) => entry.decision.actionMessage).filter(Boolean).join(" | "),
      });
      return;
    }

    itemKeys.forEach((entry) => seen.add(entry.key));
    result.push(...mergedItems);
    stats[`${source}New`] += mergedItems.length;
  }

  function choosePreferredAmbiguousPhoneRows(list, source) {
    const passthrough = [];
    const byAmbiguity = new Map();
    for (const order of list) {
      const groupId = String(order.phoneAmbiguityGroupId || "").trim();
      if (!groupId || Number(order.phoneCandidateCount || 1) <= 1) {
        passthrough.push(order);
        continue;
      }
      if (!byAmbiguity.has(groupId)) byAmbiguity.set(groupId, []);
      byAmbiguity.get(groupId).push(order);
    }

    for (const items of byAmbiguity.values()) {
      const preferred = items.filter((order) => order.phoneCorrection === "misplaced_domestic_zero");
      if (!preferred.length) {
        passthrough.push(...items);
        continue;
      }
      passthrough.push(...preferred);
      const alternatives = items.filter((order) => order.phoneCorrection !== "misplaced_domestic_zero");
      const alternativeGroups = new Map();
      for (const order of alternatives) {
        const key = cartOrderGroupKey(order);
        if (!alternativeGroups.has(key)) alternativeGroups.set(key, []);
        alternativeGroups.get(key).push(order);
      }
      for (const alternativeItems of alternativeGroups.values()) {
        const groupedOrder = buildGroupedCartOrders(mergeItemList(alternativeItems))[0];
        stats[`${source}PartialInTaager`]++;
        skippedGroupOrder(groupedOrder, "ambiguous_phone_alternative_unselected", {
          actionMessage: "Phone had multiple valid corrections; used misplaced domestic zero candidate and left the trimmed-extra-digit candidate for manual review.",
        });
      }
    }
    return passthrough;
  }

  function acceptOrders(orders, source) {
    const list = choosePreferredAmbiguousPhoneRows(Array.isArray(orders) ? orders : [], source);
    const phonesBySourceId = new Map();
    for (const order of list) {
      const sourceId = orderSourceId(order);
      if (!sourceId) continue;
      if (!phonesBySourceId.has(sourceId)) phonesBySourceId.set(sourceId, new Set());
      const phone = normalizePhone(order.normPhone || order.phone || order.rawPhone || "", COUNTRY) || String(order.normPhone || order.phone || "").trim();
      if (phone) phonesBySourceId.get(sourceId).add(phone);
    }
    const conflictingSourceIds = new Set(
      Array.from(phonesBySourceId.entries())
        .filter(([, phones]) => phones.size > 1)
        .map(([sourceId]) => sourceId)
    );
    const conflictItemsById = new Map();
    const groups = new Map();
    for (const order of list) {
      const sourceId = orderSourceId(order);
      if (sourceId && conflictingSourceIds.has(sourceId)) {
        if (!conflictItemsById.has(sourceId)) conflictItemsById.set(sourceId, []);
        conflictItemsById.get(sourceId).push(order);
        continue;
      }
      const key = cartOrderGroupKey(order);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    }
    for (const items of conflictItemsById.values()) {
      const groupedOrder = buildGroupedCartOrders(mergeItemList(items))[0];
      stats[`${source}PartialInTaager`]++;
      skippedGroupOrder(groupedOrder, "duplicate_easyorders_uuid_conflicting_phone", {
        actionMessage: "Same EasyOrders order ID produced conflicting phone candidates; review before upload.",
      });
    }
    for (const items of groups.values()) acceptGroup(items, source);
  }

  acceptOrders(realOrders, "real");
  acceptOrders(resolvedMissed, "missed");

  console.log(`New orders: real=${stats.realNew} missed=${stats.missedNew}`);
  console.log(`Already in Taager (phone+SKU): real=${stats.realInTaager} missed=${stats.missedInTaager}`);
  console.log(`Partial groups needing review (phone+SKU): real=${stats.realPartialInTaager} missed=${stats.missedPartialInTaager}`);
  console.log(`Dupes in this batch (phone+SKU): real=${stats.realDupe} missed=${stats.missedDupe}`);
  return { orders: result, stats, skippedOrders };
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
      const statusMeta = taagerStatusMeta(row[idx.status]);
      if (createdAt) {
        diagnostics.datedSourceRows++;
        if (!diagnostics.sourceDateFrom || createdAt < diagnostics.sourceDateFrom) diagnostics.sourceDateFrom = createdAt;
        if (!diagnostics.sourceDateTo || createdAt > diagnostics.sourceDateTo) diagnostics.sourceDateTo = createdAt;
      }
      // Dashboard membership is a creation-date cohort. Last Updated remains
      // delivery metadata for Actual NDR, but must not pull an older cohort
      // into the selected period.
      if (!inRange(createdAt)) {
        diagnostics.skippedOutOfRange++;
        continue;
      }
      const dashboardDate = createdAt || updatedAt || rangeFromKey;
      const notes = String(row[idx.notes] || "").trim();
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
  buildTaagerProductCatalog,
  buildSkuTierProfiles,
  resolveSkuPriceTier,
  repairOrderQuantitiesFromCatalog,
  resolveMissedOrders,
  mergeAndDeduplicate,
  normalizeProductName,
  productNamesMatch,
  extractSkuFromText,
  hasExplicitQuantityInProductName,
  makeOrderKey,
  loadProductMap,
  saveProductMap,
  learnProductMappings,
  lookupEoNameInMap,
  parseFullMonthSnapshot,
};
