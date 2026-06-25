// Taager dashboard/status/NDR migration helper.
// Keep dashboard, analytics, operations, and AI status math routed through this
// file so Arabic Taager statuses, NDR, and Taager profit stay consistent.
(function () {
  "use strict";

  var STATUSES = [
    { ar: "تم استلام الطلب", en: "Order received", bucket: "received", eligible: true, delivered: false },
    { ar: "تم التوصيل", en: "Delivered", bucket: "delivered", eligible: true, delivered: true },
    { ar: "فشل التسليم", en: "Delivery failed", bucket: "failed", eligible: false, delivered: false },
    { ar: "تم التحقق من الإرجاع", en: "Return verified", bucket: "return_verified", eligible: true, delivered: false },
    { ar: "طلب ملغي بواسطتك", en: "Canceled by you", bucket: "canceled_by_you", eligible: false, delivered: false },
    { ar: "العميل رفض التأكيد", en: "Customer refused confirmation", bucket: "customer_refused_confirmation", eligible: false, delivered: false },
    { ar: "قيد التوصيل", en: "Out for delivery", bucket: "shipping", eligible: true, delivered: false },
    { ar: "معلق مؤقتًا", en: "Temporarily suspended", bucket: "on_hold", eligible: false, delivered: false },
    { ar: "تم تعليق التوصيل", en: "Delivery suspended", bucket: "delivery_suspended", eligible: true, delivered: false },
    { ar: "انتهى من المخزن", en: "Out of stock", bucket: "out_of_stock", eligible: true, delivered: false },
    { ar: "تم تأكيد الطلب", en: "Confirmed", bucket: "confirmed", eligible: true, delivered: false },
    { ar: "في انتظار الشحن", en: "Awaiting shipment", bucket: "waiting", eligible: true, delivered: false },
    { ar: "تمت خدمة ما بعد البيع", en: "After-sales service completed", bucket: "after_sales_done", eligible: true, delivered: false },
    { ar: "خدمة ما بعد البيع قيد التقدم", en: "After-sales service in progress", bucket: "after_sales_progress", eligible: true, delivered: false }
  ];

  var byArabic = Object.create(null);
  var byEnglish = Object.create(null);
  var byBucket = Object.create(null);

  function stripArabicMarks(text) {
    return String(text || "").replace(/[\u064B-\u065F\u0670]/g, "");
  }

  function normalizeArabicKey(text) {
    return stripArabicMarks(text).trim();
  }

  STATUSES.forEach(function (s) {
    byArabic[normalizeArabicKey(s.ar)] = s;
    byEnglish[s.en.toLowerCase()] = s;
    byBucket[s.bucket] = s;
  });

  function alias(ar, bucket) {
    if (byBucket[bucket]) byArabic[normalizeArabicKey(ar)] = byBucket[bucket];
  }

  alias("معلق مؤقتا", "on_hold");
  alias("مسلمة", "delivered");
  alias("مؤكد", "confirmed");
  alias("تم التأكيد", "confirmed");
  alias("بانتظار التأكيد", "received");
  alias("قيد المعالجة", "received");
  alias("بانتظار الشحن", "waiting");
  alias("في الشحن", "shipping");
  alias("تم الشحن", "shipping");
  alias("ملغى", "customer_refused_confirmation");
  alias("مرتجع", "return_verified");
  alias("فشلت", "failed");

  function hasMojibake(text) {
    return /[\u00c3\u00c2\u00d8\u00d9\u00d0\u00d1\u00f0\u00e2]/.test(String(text || ""));
  }

  function cp1252Byte(code) {
    if (code <= 0xff) return code;
    var map = {
      0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
      0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
      0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
      0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
      0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
      0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
      0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f
    };
    return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
  }

  function utf8Decode(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length;) {
      var b0 = bytes[i++];
      if (b0 < 0x80) {
        out += String.fromCharCode(b0);
      } else if (b0 >= 0xc0 && b0 < 0xe0 && i < bytes.length) {
        var b1 = bytes[i++];
        out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 1 < bytes.length) {
        var b2 = bytes[i++];
        var b3 = bytes[i++];
        out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      } else if (b0 >= 0xf0 && b0 < 0xf8 && i + 2 < bytes.length) {
        var b4 = bytes[i++];
        var b5 = bytes[i++];
        var b6 = bytes[i++];
        var codePoint = ((b0 & 0x07) << 18) | ((b4 & 0x3f) << 12) | ((b5 & 0x3f) << 6) | (b6 & 0x3f);
        codePoint -= 0x10000;
        out += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
      } else {
        out += String.fromCharCode(b0);
      }
    }
    return out;
  }

  function decodeMojibake(text) {
    text = String(text == null ? "" : text);
    if (!hasMojibake(text)) return text;
    var current = text;
    for (var pass = 0; pass < 3; pass++) {
      if (!hasMojibake(current)) break;
      var bytes = [];
      var ok = true;
      for (var i = 0; i < current.length; i++) {
        var byte = cp1252Byte(current.charCodeAt(i));
        if (byte == null) {
          ok = false;
          break;
        }
        bytes.push(byte);
      }
      if (!ok) break;
      try {
        var decoded = typeof TextDecoder === "function"
          ? new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes))
          : utf8Decode(bytes);
        if (!decoded || decoded === current) break;
        current = decoded;
      } catch (e) {
        break;
      }
    }
    return current;
  }

  var DASHBOARD_BUCKETS = {
    delivered: "delivered",
    canceled_by_you: "canceled_by_you",
    failed: "failed",
    return_verified: "failed",
    customer_refused_confirmation: "failed",
    shipping: "shipping",
    delivery_suspended: "shipping",
    confirmed: "confirmed",
    waiting: "waiting",
    on_hold: "waiting",
    out_of_stock: "waiting",
    received: "pending",
    after_sales_done: "processing",
    after_sales_progress: "processing"
  };

  var STATUS_COLORS = {
    received: "#3b82f6",
    delivered: "#00e676",
    failed: "#ef4444",
    return_verified: "#a855f7",
    canceled_by_you: "#94a3b8",
    customer_refused_confirmation: "#f97316",
    shipping: "#14b8a6",
    on_hold: "#64748b",
    delivery_suspended: "#f59e0b",
    out_of_stock: "#eab308",
    confirmed: "#3b82f6",
    waiting: "#64748b",
    after_sales_done: "#8b5cf6",
    after_sales_progress: "#06b6d4",
    other: "#8892a4"
  };

  var STATUS_FLOW = [
    { bucket: "received", order: 10, group: "incoming", businessGroup: "incoming" },
    { bucket: "confirmed", order: 20, group: "incoming", businessGroup: "incoming" },
    { bucket: "waiting", order: 30, group: "incoming", businessGroup: "incoming" },
    { bucket: "shipping", order: 40, group: "incoming", businessGroup: "incoming" },
    { bucket: "delivery_suspended", order: 50, group: "incoming", businessGroup: "incoming" },
    { bucket: "after_sales_progress", order: 60, group: "incoming", businessGroup: "incoming" },
    { bucket: "delivered", order: 70, group: "earned", businessGroup: "earned" },
    { bucket: "customer_refused_confirmation", order: 80, group: "lost", businessGroup: "lost" },
    { bucket: "failed", order: 90, group: "lost", businessGroup: "lost" },
    { bucket: "return_verified", order: 100, group: "lost", businessGroup: "lost" },
    { bucket: "out_of_stock", order: 110, group: "lost", businessGroup: "lost" },
    { bucket: "on_hold", order: 120, group: "lost", businessGroup: "lost" },
    { bucket: "after_sales_done", order: 130, group: "lost", businessGroup: "lost" },
    { bucket: "canceled_by_you", order: 140, group: "excluded", businessGroup: "excluded" }
  ].map(function (entry) {
    var meta = byBucket[entry.bucket] || { ar: entry.bucket, en: entry.bucket, bucket: entry.bucket, eligible: true, delivered: false };
    return Object.assign({}, meta, entry, {
      id: entry.bucket,
      color: STATUS_COLORS[entry.bucket] || STATUS_COLORS.other,
      ndrEligible: meta.eligible !== false && entry.businessGroup !== "excluded"
    });
  });

  var flowByBucket = Object.create(null);
  STATUS_FLOW.forEach(function (entry) {
    flowByBucket[entry.bucket] = entry;
  });

  function normalizeStatus(status) {
    var raw = normalizeArabicKey(decodeMojibake(String(status || "").trim()));
    if (byArabic[raw]) return byArabic[raw];
    var low = raw.toLowerCase();
    if (byEnglish[low]) return byEnglish[low];
    if (byBucket[low]) return byBucket[low];
    if (low === "delivered" || low === "completed") return byBucket.delivered;
    if (low === "failed" || low === "delivery failed") return byBucket.failed;
    if (low === "canceled" || low === "cancelled" || low === "canceled by you") return byBucket.canceled_by_you;
    if (low === "return verified" || low === "returned") return byBucket.return_verified;
    if (low === "customer refused confirmation") return byBucket.customer_refused_confirmation;
    if (low === "out for delivery" || low === "in shipping" || low === "shipping") return byBucket.shipping;
    if (low === "temporarily suspended" || low === "on hold") return byBucket.on_hold;
    if (low === "delivery suspended") return byBucket.delivery_suspended;
    if (low === "out of stock") return byBucket.out_of_stock;
    if (low === "confirmed") return byBucket.confirmed;
    if (low === "awaiting shipment" || low === "waiting") return byBucket.waiting;
    if (low === "after-sales service completed" || low === "after sales service completed") return byBucket.after_sales_done;
    if (low === "after-sales service in progress" || low === "after sales service in progress") return byBucket.after_sales_progress;
    if (low === "order received" || low === "pending" || low === "under processing" || low === "processing") return byBucket.received;
    return { ar: raw || "غير معروف", en: raw || "Unknown", bucket: "other", eligible: true, delivered: false };
  }

  function dashboardBucket(status) {
    var bucket = normalizeStatus(status).bucket;
    return DASHBOARD_BUCKETS[bucket] || "other";
  }

  function display(status, options) {
    var meta = normalizeStatus(status);
    var locale = options && options.locale;
    var isArabic = locale ? String(locale).toLowerCase().indexOf("ar") === 0 : (
      (document.documentElement.getAttribute("lang") || window._kbotLang || "ar") === "ar"
    );
    return isArabic ? meta.ar : meta.en;
  }

  function color(status) {
    return STATUS_COLORS[normalizeStatus(status).bucket] || STATUS_COLORS.other;
  }

  function isDelivered(status) {
    return normalizeStatus(status).delivered === true;
  }

  function statusBucket(status) {
    return normalizeStatus(status).bucket;
  }

  function statusInfo(status) {
    var bucket = statusBucket(status);
    return flowByBucket[bucket] || Object.assign({}, normalizeStatus(status), {
      id: bucket,
      order: 999,
      group: "other",
      businessGroup: "other",
      color: STATUS_COLORS[bucket] || STATUS_COLORS.other,
      ndrEligible: true
    });
  }

  function isCanceledByYou(status) {
    return statusBucket(status) === "canceled_by_you";
  }

  function isEligibleForNdr(status) {
    return !isCanceledByYou(status);
  }

  var CONFIRMED_BUCKETS = {
    confirmed: true,
    waiting: true,
    shipping: true,
    delivery_suspended: true,
    delivered: true,
    failed: true,
    return_verified: true,
    after_sales_progress: true,
    after_sales_done: true,
    processing: true
  };

  var STATUS_GROUPS = {
    confirmed: "confirmation",
    waiting: "confirmation",
    shipping: "confirmation",
    delivery_suspended: "confirmation",
    delivered: "confirmation",
    failed: "confirmation",
    return_verified: "confirmation",
    after_sales_progress: "confirmation",
    after_sales_done: "confirmation",
    customer_refused_confirmation: "cancel",
    // canceled_by_you is "excluded" from the rate denominator (net orders basis):
    // Confirmation = confirmed / net_orders, Cancel = refused / net_orders, Pending = received / net_orders
    // where net_orders = all orders MINUS canceled_by_you.
    canceled_by_you: "excluded",
    on_hold: "cancel",
    out_of_stock: "cancel",
    received: "pending"
  };

  function isConfirmed(status) {
    return CONFIRMED_BUCKETS[statusBucket(status)] === true;
  }

  function statusGroup(status) {
    return STATUS_GROUPS[statusBucket(status)] || "pending";
  }

  function isIncoming(status) {
    return statusInfo(status).businessGroup === "incoming";
  }

  function isLost(status) {
    return statusInfo(status).businessGroup === "lost";
  }

  function isConfirmedBaseExcluded(status) {
    return !isConfirmed(status);
  }

  function calcNdr(rows, options) {
    options = options || {};
    var from = options.dateFrom || "";
    var to = options.dateTo || "";
    var useClosedCycle = options.mode === "expected";
    var eligible = 0;
    var delivered = 0;
    (rows || []).forEach(function (row) {
      var date = String(row && (row.createdAt || row.date || row.dashboardDate) || "").slice(0, 10);
      if (useClosedCycle && from && to && (date < from || date > to)) return;
      var status = row && (row.orderStatus || row.status);
      if (!isEligibleForNdr(status)) return;
      eligible++;
      if (isDelivered(status)) delivered++;
    });
    return {
      delivered: delivered,
      eligible: eligible,
      rate: eligible > 0 ? delivered / eligible : 0,
      pct: eligible > 0 ? Math.round((delivered / eligible) * 1000) / 10 : 0,
      mode: useClosedCycle ? "expected" : "actual"
    };
  }

  function moneyValue(value) {
    if (value == null || value === "") return null;
    var arabic = "٠١٢٣٤٥٦٧٨٩";
    var persian = "۰۱۲۳۴۵۶۷۸۹";
    var text = String(value).replace(/[٠-٩۰-۹]/g, function (ch) {
      var ar = arabic.indexOf(ch);
      if (ar !== -1) return String(ar);
      var fa = persian.indexOf(ch);
      return fa !== -1 ? String(fa) : ch;
    }).replace(/[\u066B\u00B7]/g, ".").replace(/[\u066C\u060C]/g, ",").trim();
    var sign = /^\s*\(.*\)\s*$/.test(text) || /-/.test(text) ? -1 : 1;
    var cleaned = text.replace(/[^\d.,-]/g, "").replace(/-/g, "");
    if (!cleaned) return null;
    var lastDot = cleaned.lastIndexOf(".");
    var lastComma = cleaned.lastIndexOf(",");
    if (lastComma > lastDot && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, "");
    } else if (lastComma > lastDot && cleaned.split(",").length === 2 && cleaned.split(",")[1].length <= 2) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
    var n = Number(cleaned);
    return isFinite(n) ? sign * n : null;
  }

  function firstMoney(row, keys) {
    if (!row) return null;
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(row, keys[i])) {
        var n = moneyValue(row[keys[i]]);
        if (n != null) return n;
      }
    }
    return null;
  }

  function taagerProfit(row) {
    var direct = firstMoney(row, [
      "taagerProfit",
      "profitAfterTax",
      "profitAfterFees",
      "netTaagerProfit"
    ]);
    if (direct != null && direct !== 0) return direct;

    var orderProfit = firstMoney(row, [
      "profit",
      "orderProfit",
      "profitBeforeTax",
      "grossProfit",
      "ربح الطلب",
      "Order Profit"
    ]);
    var taxProfit = firstMoney(row, [
      "taxProfit",
      "taagerTaxProfit",
      "taagerFees",
      "fees",
      "tax",
      "ربح الضريبة",
      "Tax Profit"
    ]);
    if (orderProfit != null) {
      taxProfit = taxProfit || 0;
      if (orderProfit > 0 && taxProfit > orderProfit) {
        while (taxProfit > orderProfit && taxProfit >= 1) taxProfit = taxProfit / 10;
      }
      return orderProfit - taxProfit;
    }

    if (direct != null) return direct;
    return firstMoney(row, ["marketerCommission", "commission"]) || 0;
  }

  function productName(row) {
    var sku = String(row && (row.sku || row.products || row.productName) || "").trim();
    var saved = window.TaagerProductNames && sku ? window.TaagerProductNames.get(sku) : "";
    return saved || String(row && row.productName || "").trim() || sku || "Unknown SKU";
  }

  window.TaagerStatus = {
    all: STATUSES.slice(),
    ordered: STATUS_FLOW.slice(),
    orderedBuckets: STATUS_FLOW.map(function (entry) { return entry.bucket; }),
    normalize: normalizeStatus,
    statusInfo: statusInfo,
    dashboardBucket: dashboardBucket,
    display: display,
    color: color,
    isDelivered: isDelivered,
    isCanceledByYou: isCanceledByYou,
    isEligibleForNdr: isEligibleForNdr,
    isConfirmed: isConfirmed,
    statusGroup: statusGroup,
    isIncoming: isIncoming,
    isLost: isLost,
    isConfirmedBaseExcluded: isConfirmedBaseExcluded,
    calcNdr: calcNdr,
    moneyValue: moneyValue,
    taagerProfit: taagerProfit,
    profitAfterFees: taagerProfit,
    productName: productName
  };
})();
