"use strict";

/*
  build-perf-fixture.js
  ---------------------------------------------------------------------------
  Generates a synthetic "dashboard snapshot" fixture that matches the exact
  row schema window.runDashboardAggregator (src/renderer/pages/dashboard/
  dashboard-aggregator.js) expects. The schema is intentionally mirrored from
  src/renderer/pages/premium-preview.js's makeOrder() — that generator already
  flows through the REAL aggregator + REAL section renderers in production
  (premium preview mode), so cloning its field shape is the safest way to
  guarantee compatibility instead of guessing at the schema.

  Default size: 5,000 orders across 100 distinct products, spread across the
  13 real Saudi provinces/cities used by TaagerGeo (src/renderer/app.js), with
  a realistic status funnel, COD/Prepaid mix, and a date distribution that
  concentrates most volume inside the CURRENT calendar month — because the
  dashboard's default period is "thisMonth" (dashboard-filter-bus.js), and a
  fixture whose orders mostly fall outside the default view wouldn't actually
  stress-test the default render path.

  Usage:
    node scripts/perf/build-perf-fixture.js
    node scripts/perf/build-perf-fixture.js --orders=20000 --products=250
    node scripts/perf/build-perf-fixture.js --seed=42 --out=custom-fixture.json

  Output:
    scripts/perf/fixtures/perf-fixture.json (by default)
*/

const fs = require("fs");
const path = require("path");

// ─── CLI args ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  argv.forEach((arg) => {
    const m = /^--([a-zA-Z]+)=(.+)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  });
  return out;
}
const args = parseArgs(process.argv.slice(2));
const ORDER_COUNT = Math.max(1, Number(args.orders || 5000));
const PRODUCT_COUNT = Math.max(1, Number(args.products || 100));
const SEED = Number(args.seed || 1337);
const OUT_NAME = args.out || "perf-fixture.json";
const OUT_PATH = path.join(__dirname, "fixtures", OUT_NAME);

// ─── Seeded PRNG (mulberry32) — deterministic so reports are comparable across runs ──
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function weightedPick(items) {
  // items: [{ value, weight }, ...]
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = rand() * total;
  for (const it of items) {
    if ((r -= it.weight) <= 0) return it.value;
  }
  return items[items.length - 1].value;
}

// ─── Geography — lifted from window.TaagerGeo's GEO.sa table (src/renderer/app.js) ──
// [provinceId, provinceNameAr, cities[]] — order volume weighted toward the
// provinces that actually carry most Taager order volume in practice.
const PROVINCES = [
  { id: "riyadh", name: "منطقة الرياض", weight: 26, cities: ["الرياض", "الخرج", "المجمعة", "الدوادمي"] },
  { id: "eastern", name: "المنطقة الشرقية", weight: 18, cities: ["الدمام", "الخبر", "الأحساء", "الجبيل"] },
  { id: "mecca", name: "منطقة مكة المكرمة", weight: 20, cities: ["جدة", "مكة", "الطائف"] },
  { id: "madinah", name: "منطقة المدينة المنورة", weight: 9, cities: ["المدينة المنورة", "ينبع"] },
  { id: "qassim", name: "منطقة القصيم", weight: 6, cities: ["بريدة", "عنيزة"] },
  { id: "aseer", name: "منطقة عسير", weight: 6, cities: ["أبها", "خميس مشيط"] },
  { id: "tabuk", name: "منطقة تبوك", weight: 3, cities: ["تبوك"] },
  { id: "hail", name: "منطقة حائل", weight: 3, cities: ["حائل"] },
  { id: "jazan", name: "منطقة جازان", weight: 3, cities: ["جيزان"] },
  { id: "najran", name: "منطقة نجران", weight: 2, cities: ["نجران"] },
  { id: "baha", name: "منطقة الباحة", weight: 2, cities: ["الباحة"] },
  { id: "jawf", name: "منطقة الجوف", weight: 1, cities: ["سكاكا"] },
  { id: "northern", name: "منطقة الحدود الشمالية", weight: 1, cities: ["عرعر"] }
];
const PROVINCE_WEIGHTED = PROVINCES.map((p) => ({ value: p, weight: p.weight }));

// ─── Status funnel — exact strings reused from premium-preview.js (proven to
// normalize correctly via window.TaagerStatus). Weights model a realistic
// dropshipping funnel rather than a uniform spread. ──────────────────────────
const STATUS_TABLE = {
  winner: [
    ["تم التوصيل", 55], ["في انتظار الشحن", 10], ["تم تأكيد الطلب", 12],
    ["تم استلام الطلب", 8], ["فشل التسليم", 5], ["طلب ملغي بواسطتك", 4],
    ["العميل رفض التأكيد", 3], ["تم التحقق من الإرجاع", 3]
  ],
  average: [
    ["تم التوصيل", 35], ["في انتظار الشحن", 14], ["تم تأكيد الطلب", 16],
    ["تم استلام الطلب", 10], ["فشل التسليم", 9], ["طلب ملغي بواسطتك", 7],
    ["العميل رفض التأكيد", 6], ["تم التحقق من الإرجاع", 3]
  ],
  loser: [
    ["تم التوصيل", 16], ["في انتظار الشحن", 10], ["تم تأكيد الطلب", 14],
    ["تم استلام الطلب", 10], ["فشل التسليم", 20], ["طلب ملغي بواسطتك", 14],
    ["العميل رفض التأكيد", 12], ["تم التحقق من الإرجاع", 4]
  ]
};
function statusFor(tier) {
  return weightedPick(STATUS_TABLE[tier].map(([value, weight]) => ({ value, weight })));
}

// ─── Product catalog — 15 categories x procedurally generated variants ──────
const CATEGORIES = [
  { code: "OUD", label: "عطر", priceRange: [120, 320] },
  { code: "SRM", label: "سيروم العناية بالبشرة", priceRange: [90, 220] },
  { code: "HAI", label: "زيت شعر بريميوم", priceRange: [70, 180] },
  { code: "BLD", label: "خلاط منزلي ذكي", priceRange: [140, 260] },
  { code: "WCH", label: "ساعة ذكية", priceRange: [160, 380] },
  { code: "BCK", label: "حزام دعم الظهر", priceRange: [110, 230] },
  { code: "BTH", label: "سماعة بلوتوث", priceRange: [80, 210] },
  { code: "TOY", label: "لعبة تعليمية للأطفال", priceRange: [60, 150] },
  { code: "KIT", label: "مجموعة سكاكين مطبخ", priceRange: [100, 240] },
  { code: "PRS", label: "جهاز عناية شخصية", priceRange: [130, 290] },
  { code: "CAR", label: "حامل هاتف للسيارة", priceRange: [50, 130] },
  { code: "FIT", label: "معدات رياضية منزلية", priceRange: [90, 210] },
  { code: "DEC", label: "إكسسوار ديكور منزلي", priceRange: [70, 170] },
  { code: "GFT", label: "مجموعة هدايا فاخرة", priceRange: [150, 300] },
  { code: "SUN", label: "نظارة شمسية", priceRange: [60, 160] }
];
function buildProducts(count) {
  const products = [];
  let i = 0;
  while (products.length < count) {
    const cat = CATEGORIES[i % CATEGORIES.length];
    const variantIndex = Math.floor(i / CATEGORIES.length) + 1;
    const price = randInt(cat.priceRange[0], cat.priceRange[1]);
    const commission = Math.round(price * (0.18 + rand() * 0.1)); // ~18-28% of price
    const taxProfit = Math.round(commission * 0.1);
    // Pareto-ish performance tiers: ~20% winners, ~60% average, ~20% losers
    const roll = rand();
    const tier = roll < 0.2 ? "winner" : roll < 0.8 ? "average" : "loser";
    // Pareto-ish demand skew: winners get a much heavier order-volume weight
    const demandWeight = tier === "winner" ? randInt(8, 20) : tier === "average" ? randInt(2, 6) : randInt(1, 2);
    products.push({
      key: cat.code + "-" + String(variantIndex).padStart(3, "0"),
      sku: "TAAG-" + cat.code + "-" + String(variantIndex).padStart(3, "0"),
      name: cat.label + " " + (variantIndex > 1 ? "إصدار " + variantIndex : "أساسي"),
      price,
      commission,
      taxProfit,
      tier,
      demandWeight
    });
    i++;
  }
  return products;
}

// ─── Customer name pool (kept small + simple; realism here matters less than
// the financial/status/geo fields the aggregator actually keys off of) ──────
const FIRST_NAMES = ["أحمد", "محمد", "خالد", "سعود", "فهد", "نورة", "سارة", "ريم", "منيرة", "عبدالله", "ياسر", "هند", "لمى", "تركي", "بندر"];
const LAST_NAMES = ["العتيبي", "القحطاني", "الدوسري", "الشهري", "المطيري", "الزهراني", "السبيعي", "الحربي", "العنزي", "البقمي"];

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

function buildDateForOrder(today, daysSoFarThisMonth) {
  // ~85% of volume inside the current month (days 1..today), ~15% in the
  // full previous month — matches the dashboard's default "thisMonth" period
  // while still populating prevMonth for delta/comparison metrics.
  const inCurrentMonth = rand() < 0.85;
  let d;
  if (inCurrentMonth) {
    const dayOffset = randInt(0, Math.max(0, daysSoFarThisMonth - 1));
    d = new Date(today.getFullYear(), today.getMonth(), 1 + dayOffset);
  } else {
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const daysInPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    d = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), randInt(1, daysInPrevMonth));
  }
  d.setHours(randInt(8, 22), randInt(0, 59), 0, 0);
  return d;
}

function buildOrders(count, products) {
  const today = new Date();
  const daysSoFarThisMonth = today.getDate();
  const productWeighted = products.map((p) => ({ value: p, weight: p.demandWeight }));
  const orders = [];

  for (let i = 0; i < count; i++) {
    const product = weightedPick(productWeighted);
    const province = weightedPick(PROVINCE_WEIGHTED);
    const city = pick(province.cities);
    const created = buildDateForOrder(today, daysSoFarThisMonth);
    const status = statusFor(product.tier);
    const delivered = status === "تم التوصيل";
    const canceledByUser = status === "طلب ملغي بواسطتك";
    const qty = rand() < 0.78 ? 1 : rand() < 0.92 ? 2 : 3;
    const total = product.price * qty;
    const grossCommission = product.commission * qty;
    const taxProfit = product.taxProfit * qty;
    const taagerProfit = grossCommission - taxProfit;
    const paymentMethod = rand() < 0.22 ? "Prepaid" : "COD";
    const updated = new Date(created.getTime() + (1 + randInt(0, 4)) * 86400000);
    const customer = pick(FIRST_NAMES) + " " + pick(LAST_NAMES);

    orders.push({
      name: customer,
      phone: "9665" + String(40000000 + i).padStart(8, "0"),
      productName: product.name,
      sku: product.sku,
      qty,
      unitPrice: product.price,
      subtotal: total,
      totalPrice: total,
      dashboardTotalPrice: total,
      city,
      region: province.name,
      address: "حي تجريبي، مبنى " + (10 + (i % 90)),
      date: isoDate(created),
      createdAt: isoDate(created),
      lastUpdatedAt: isoDate(updated),
      source: i % 17 === 0 ? "missed" : "real",
      orderStatus: status,
      status,
      amountDue: delivered ? total : (canceledByUser ? 0 : total),
      dashboardAmountDue: delivered ? total : (canceledByUser ? 0 : total),
      marketerCommission: grossCommission,
      commission: grossCommission,
      profit: grossCommission,
      taxProfit,
      taagerProfit,
      profitAfterTax: taagerProfit,
      taagerOrderNumber: "PERF-" + String(5000000 + i),
      paymentMethod,
      country: "SA",
      taagerCountry: "sa",
      currency: "SAR"
    });
  }
  return orders;
}

function summarize(orders, products) {
  const byStatus = {};
  const byProvince = {};
  orders.forEach((o) => {
    byStatus[o.orderStatus] = (byStatus[o.orderStatus] || 0) + 1;
    byProvince[o.region] = (byProvince[o.region] || 0) + 1;
  });
  const topProducts = products
    .map((p) => ({ name: p.name, sku: p.sku, tier: p.tier, demandWeight: p.demandWeight }))
    .sort((a, b) => b.demandWeight - a.demandWeight)
    .slice(0, 5);
  return { byStatus, byProvince, topProducts };
}

function main() {
  const products = buildProducts(PRODUCT_COUNT);
  const orders = buildOrders(ORDER_COUNT, products);
  const today = new Date();
  const fixture = {
    generatedAt: new Date().toISOString(),
    seed: SEED,
    accountId: "perf-test-store",
    orderCount: orders.length,
    productCount: products.length,
    snapshotMonth: today.getFullYear() + "-" + pad2(today.getMonth() + 1),
    autoFetchTimestamp: Date.now(),
    snapshot: orders
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(fixture), "utf8");

  const summary = summarize(orders, products);
  const sizeKb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log("[perf-fixture] Wrote " + OUT_PATH + " (" + sizeKb + " KB)");
  console.log("[perf-fixture] orders=" + orders.length + " products=" + products.length + " seed=" + SEED);
  console.log("[perf-fixture] status distribution:");
  Object.keys(summary.byStatus).sort((a, b) => summary.byStatus[b] - summary.byStatus[a]).forEach((status) => {
    console.log("    " + status + ": " + summary.byStatus[status]);
  });
  console.log("[perf-fixture] province distribution:");
  Object.keys(summary.byProvince).sort((a, b) => summary.byProvince[b] - summary.byProvince[a]).forEach((region) => {
    console.log("    " + region + ": " + summary.byProvince[region]);
  });
  console.log("[perf-fixture] top 5 demand-weighted products:");
  summary.topProducts.forEach((p) => console.log("    " + p.sku + " (" + p.tier + ") — " + p.name));
}

main();

module.exports = { buildProducts, buildOrders, OUT_PATH };
