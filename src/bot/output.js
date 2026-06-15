"use strict";

const XLSX = require("xlsx");
const { formatPhone } = require("./phone");
const { normalizeTaagerCountry } = require("./taager-country");

const config = JSON.parse(process.env.BOT_CONFIG || "{}");
const COUNTRY = normalizeTaagerCountry(config.taagerCountry || config.taagerCountry || "sa");

const COUNTRY_CONFIG = {
  sa: {
    cartCountryCode: "SAU",
    hasSaudiNatAddr: true,
    defaultProvince: "المنطقة الشرقية",
    defaultCity: "المنطقة الشرقية",
    validProvinces: new Set([
      "المنطقة الشرقية",
      "منطقة الباحة",
      "منطقة الجوف",
      "منطقة الحدود الشمالية",
      "منطقة الرياض",
      "منطقة القصيم",
      "منطقة المدينة المنورة",
      "منطقة تبوك",
      "منطقة جازان",
      "منطقة حائل",
      "منطقة عسير",
      "منطقة مكة المكرمة",
      "منطقة نجران",
    ]),
    provinceMap: {
      "مكة المكرمة": "منطقة مكة المكرمة",
      "مكة": "منطقة مكة المكرمة",
      "مكه": "منطقة مكة المكرمة",
      "مكه المكرمه": "منطقة مكة المكرمة",
      "جدة": "منطقة مكة المكرمة",
      "جده": "منطقة مكة المكرمة",
      "الطائف": "منطقة مكة المكرمة",
      "jeddah": "منطقة مكة المكرمة",
      "makkah": "منطقة مكة المكرمة",
      "mecca": "منطقة مكة المكرمة",
      "المدينة المنورة": "منطقة المدينة المنورة",
      "المدينة": "منطقة المدينة المنورة",
      "المدينه": "منطقة المدينة المنورة",
      "المدينه المنوره": "منطقة المدينة المنورة",
      "medina": "منطقة المدينة المنورة",
      "madinah": "منطقة المدينة المنورة",
      "الرياض": "منطقة الرياض",
      "riyadh": "منطقة الرياض",
      "القصيم": "منطقة القصيم",
      "بريدة": "منطقة القصيم",
      "عنيزة": "منطقة القصيم",
      "المنطقة الشرقية": "المنطقة الشرقية",
      "المنطقه الشرقيه": "المنطقة الشرقية",
      "الشرقية": "المنطقة الشرقية",
      "الدمام": "المنطقة الشرقية",
      "الخبر": "المنطقة الشرقية",
      "الاحساء": "المنطقة الشرقية",
      "الأحساء": "المنطقة الشرقية",
      "الجبيل": "المنطقة الشرقية",
      "القطيف": "المنطقة الشرقية",
      "eastern": "المنطقة الشرقية",
      "عسير": "منطقة عسير",
      "أبها": "منطقة عسير",
      "ابها": "منطقة عسير",
      "خميس مشيط": "منطقة عسير",
      "تبوك": "منطقة تبوك",
      "حائل": "منطقة حائل",
      "الحدود الشمالية": "منطقة الحدود الشمالية",
      "الحدود الشماليه": "منطقة الحدود الشمالية",
      "عرعر": "منطقة الحدود الشمالية",
      "جازان": "منطقة جازان",
      "جيزان": "منطقة جازان",
      "نجران": "منطقة نجران",
      "الباحة": "منطقة الباحة",
      "الباحه": "منطقة الباحة",
      "الجوف": "منطقة الجوف",
      "سكاكا": "منطقة الجوف",
    },
  },
  eg: {
    cartCountryCode: "EGY",
    hasSaudiNatAddr: false,
    defaultProvince: "القاهرة",
    defaultCity: "القاهرة",
    validProvinces: new Set([
      "القاهرة", "الجيزة", "الأسكندرية", "الإسكندرية",
      "أسوان", "اسيوط", "الأقصر", "الاسماعيلية",
      "البحر الأحمر / الغردقة", "البحيرة", "الدقهلية",
      "الشرقية", "الغربية", "الفيوم", "القليوبية",
      "المنوفية", "بني سويف", "بور سعيد", "دمياط",
      "سوهاج", "سويس", "قنا", "كفر الشيخ", "مطروح", "منيا",
    ]),
    provinceMap: {
      cairo: "القاهرة",
      giza: "الجيزة",
      alexandria: "الأسكندرية",
      alex: "الأسكندرية",
      aswan: "أسوان",
      assiut: "اسيوط",
      luxor: "الأقصر",
      ismailia: "الاسماعيلية",
      hurghada: "البحر الأحمر / الغردقة",
      "red sea": "البحر الأحمر / الغردقة",
      beheira: "البحيرة",
      dakahlia: "الدقهلية",
      sharqia: "الشرقية",
      gharbia: "الغربية",
      fayoum: "الفيوم",
      qalyubia: "القليوبية",
      monufia: "المنوفية",
      "beni suef": "بني سويف",
      "port said": "بور سعيد",
      damietta: "دمياط",
      sohag: "سوهاج",
      suez: "سويس",
      qena: "قنا",
      "kafr el sheikh": "كفر الشيخ",
      matrouh: "مطروح",
      minya: "منيا",
    },
  },
  iq: {
    cartCountryCode: "IRQ",
    hasSaudiNatAddr: false,
    defaultProvince: "بغداد",
    defaultCity: "بغداد",
    validProvinces: new Set([
      "بغداد", "البصرة", "بصرة", "نجف", "كربلاء", "موصل",
      "اربيل", "سليمانية", "دهوك", "كركوك", "ديالى",
      "الانبار", "صلاح الدين", "كوت", "بابل", "ذي قار",
      "ميسان", "دوانية", "سماوة",
    ]),
    provinceMap: {
      baghdad: "بغداد",
      basra: "بصرة",
      najaf: "نجف",
      karbala: "كربلاء",
      mosul: "موصل",
      erbil: "اربيل",
      sulaymaniyah: "سليمانية",
      duhok: "دهوك",
      kirkuk: "كركوك",
      diyala: "ديالى",
      anbar: "الانبار",
      "salah al din": "صلاح الدين",
      kut: "كوت",
      babylon: "بابل",
      "dhi qar": "ذي قار",
      maysan: "ميسان",
      diwaniya: "دوانية",
      samawah: "سماوة",
    },
  },
  ae: {
    cartCountryCode: "ARE",
    hasSaudiNatAddr: false,
    defaultProvince: "أبو ظبي",
    defaultCity: "أبو ظبي",
    validProvinces: new Set([
      "أبو ظبي", "دبي", "الشارقة", "عجمان",
      "رأس الخيمة", "الفجيرة", "أم القيوين",
    ]),
    provinceMap: {
      "abu dhabi": "أبو ظبي",
      dubai: "دبي",
      sharjah: "الشارقة",
      ajman: "عجمان",
      "ras al khaimah": "رأس الخيمة",
      fujairah: "الفجيرة",
      "umm al quwain": "أم القيوين",
    },
  },
  om: {
    cartCountryCode: "OMN",
    hasSaudiNatAddr: false,
    defaultProvince: "مسقط",
    defaultCity: "مسقط",
    validProvinces: new Set([
      "البريمي", "الجبل الأخضر", "الحمراء", "الخابورة", "الدقم", "الرستاق",
      "السنينة", "السويق", "السيب", "العامرات", "العوابي", "القابل",
      "الكامل والوفي", "المصنعة", "المضيبي", "إبراء", "إزكي", "أدم",
      "بخـاء", "بدبد", "بديـة", "بركاء", "بهلاء", "بوشر", "ثمريت",
      "جعلان بني بو حسن", "جعلان بني بو علي", "خصب", "دماء والطائيين",
      "سمائل", "شناص", "صحار", "صحـم", "صلالة", "صـور", "ضنك",
      "طاقة", "عبري", "قريات", "لـوى", "محضة", "محوت", "مربـاط",
      "مسقط", "مصيرة", "مطرح", "منـح", "نخل", "نزوى", "هيماء",
      "وادي المعاول", "وادي بني خالـد", "ينقل",
    ]),
    provinceMap: {
      muscat: "مسقط",
      salalah: "صلالة",
      sohar: "صحار",
      nizwa: "نزوى",
      sur: "صـور",
      buraimi: "البريمي",
      khassab: "خصب",
      ibri: "عبري",
      rustaq: "الرستاق",
    },
  },
};

function normalizePlaceName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\w\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProvince(city, country) {
  const cc = normalizeTaagerCountry(country || "sa");
  const cfg = COUNTRY_CONFIG[cc];
  if (!cfg) throw new Error(`UNSUPPORTED_TAAGER_COUNTRY: ${cc}`);
  const raw = city ? String(city).trim() : "";

  if (!raw || raw.toLowerCase() === "unspecified") return cfg.defaultProvince;

  if (cfg.validProvinces.has(raw)) return raw;
  const normalized = normalizePlaceName(raw);
  for (const province of cfg.validProvinces) {
    if (normalizePlaceName(province) === normalized) return province;
  }
  for (const [key, value] of Object.entries(cfg.provinceMap || {})) {
    const normalizedKey = normalizePlaceName(key);
    if (normalizedKey === normalized) return value;
    if (cc === "sa" && normalizedKey && (normalized.includes(normalizedKey) || normalizedKey.includes(normalized))) {
      return value;
    }
  }

  console.warn(`[${cc.toUpperCase()}] Unknown province "${raw}" - defaulting to "${cfg.defaultProvince}"`);
  return cfg.defaultProvince;
}

function truncate(value, max) {
  const text = value == null ? "" : String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function buildOutputExcel(orders) {
  const cfg = COUNTRY_CONFIG[COUNTRY];
  if (!cfg) throw new Error(`UNSUPPORTED_TAAGER_COUNTRY: ${COUNTRY}`);
  const wb = XLSX.utils.book_new();

  const headers = [
    "(Product ID) كود_المنتج",
    "(Product Name) اسم_المنتج",
    "(Product Price) سعر_المنتج",
    "(Quantity) الكمية",
    "(Customer Name) اسم_العميل",
    "(Province) المحافظة",
    "(Address) العنوان",
    ...(cfg.hasSaudiNatAddr ? ["(Saudi National Address) العنوان الوطني السعودي"] : []),
    "(Phone Number) رقم_الهاتف",
    "(Phone Number 2) رقم_الهاتف2",
    "(Notes) ملاحظات",
    "(Facebook Page) اسم_صفحة_الفيسبوك",
    "(Facebook Page Link) لينك_الصفحة",
    "(Country) البلد",
    "(Product Color) لون_المنتج",
    "(Product Size) مقاس_المنتج",
    "(Order Placement Time) وقت_طلب_المنتج",
    "(Order ID on your store) كود_الطلب_على_متجرك",
  ];

  const dataRows = orders.map((order) => {
    const province = normalizeProvince(order.city, COUNTRY);
    const address = order.address && String(order.address).trim()
      ? String(order.address).trim()
      : province || cfg.defaultCity;

    return [
      order.sku || "",
      truncate(order.productName || "", 50),
      order.unitPrice || "",
      order.qty || 1,
      truncate(order.name || "", 50),
      province,
      address,
      ...(cfg.hasSaudiNatAddr ? [""] : []),
      formatPhone(order.normPhone, COUNTRY) || "",
      "",
      "",
      "",
      "",
      cfg.cartCountryCode,
      "",
      "",
      "",
      order.orderId || "",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = [
    { wch: 22 }, { wch: 45 }, { wch: 14 }, { wch: 10 },
    { wch: 25 }, { wch: 22 }, { wch: 35 },
    ...(cfg.hasSaudiNatAddr ? [{ wch: 22 }] : []),
    { wch: 16 }, { wch: 16 }, { wch: 20 },
    { wch: 20 }, { wch: 28 }, { wch: 8 },
    { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 32 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Cart");
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(orders), "Summary");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function buildSummarySheet(orders) {
  const groups = {};
  for (const order of orders) {
    const key = order.productName || "Unknown";
    if (!groups[key]) groups[key] = { productName: key, sku: order.sku, count: 0, totalQty: 0 };
    groups[key].count++;
    groups[key].totalQty += order.qty || 1;
  }

  const headers = [
    "Product Name / اسم المنتج",
    "SKU / كود المنتج",
    "Orders / عدد الطلبات",
    "Total Qty / إجمالي الكمية",
  ];
  const rows = Object.values(groups).map((g) => [g.productName, g.sku, g.count, g.totalQty]);
  rows.push(["TOTAL", "", orders.length, orders.reduce((sum, order) => sum + (order.qty || 1), 0)]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [{ wch: 45 }, { wch: 22 }, { wch: 20 }, { wch: 20 }];
  return ws;
}

function buildFailedExcel(failedOrders) {
  const wb = XLSX.utils.book_new();
  const headers = [
    "Source",
    "Customer Name",
    "Phone",
    "Product",
    "SKU",
    "Uncertain Phone",
    "Qty",
    "Subtotal",
    "City",
    "Address",
    "Error",
  ];

  const rows = failedOrders.map((order) => [
    order.source || "real",
    order.name || "",
    order.phone || "",
    order.product || order.productName || "",
    order.sku || "",
    order.uncertain ? "YES" : "NO",
    order.qty || 1,
    order.subtotal || "",
    order.city || "",
    order.address || "",
    order.error || "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 14 }, { wch: 25 }, { wch: 18 }, { wch: 45 }, { wch: 22 },
    { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 35 }, { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Failed Orders");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function buildSkippedExcel(skippedOrders) {
  if (!skippedOrders || skippedOrders.length === 0) return null;

  const reasonLabels = {
    phone_parse_failed: "رقم الهاتف غير صالح",
    phone_uncertain_zero_appended: "رقم الهاتف ناقص رقم - تم إضافة 0 (تخمين)",
    product_not_in_catalog: "المنتج غير موجود في الكتالوج",
  };

  const headers = [
    "Outcome / الحالة",
    "Account Email / بريد الحساب",
    "Account Label / اسم الحساب",
    "Taager Country / دولة تاجر",
    "Full Name / الاسم الكامل",
    "Raw Phone / الهاتف الأصلي",
    "Normalized Phone / الهاتف بعد التعديل",
    "Product / المنتج",
    "City / المدينة",
    "Address / العنوان",
    "Reason / السبب",
    "Reason (AR) / السبب بالعربي",
    "Uncertain / غير مؤكد",
  ];

  const rows = skippedOrders.map((order) => {
    const reasonKey = order.uncertain && order.reason === "phone_parse_failed"
      ? "phone_uncertain_zero_appended"
      : order.reason;
    return [
      order.uploadedWithWarning ? "WARNING - UPLOADED" : "SKIPPED",
      order.accountEmail || "",
      order.accountLabel || "",
      order.taagerCountry || order.taagerCountry || COUNTRY,
      order.name || "",
      order.rawPhone || "",
      order.normalizedPhone || "",
      order.productName || "",
      order.city || "",
      order.address || "",
      reasonKey || "",
      reasonLabels[reasonKey] || reasonKey || "",
      order.uncertain ? "YES" : "NO",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 14 },
    { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 40 },
    { wch: 22 }, { wch: 35 }, { wch: 30 },
    { wch: 38 }, { wch: 12 },
  ];
  ws["!autofilter"] = { ref: ws["!ref"] };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Warnings & Skipped");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = { buildOutputExcel, buildFailedExcel, buildSkippedExcel, normalizeProvince, COUNTRY_CONFIG };
