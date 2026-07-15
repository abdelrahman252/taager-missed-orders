"use strict";

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function money(value, currency) {
  const amount = number(value, 0);
  const rounded = Math.abs(amount) >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("en-US")} ${text(currency) || "SAR"}`;
}

function pct(value) {
  const rounded = Math.round(number(value, 0) * 10) / 10;
  return `${rounded}%`;
}

function isArabic(payload) {
  return text(payload && payload.lang).toLowerCase().startsWith("ar");
}

function pick(ar, en, arMode) {
  return arMode ? ar : en;
}

function labelProfit(status, arMode) {
  const en = {
    any: "Any",
    profitable: "Profitable",
    losing: "Losing",
    no_spend: "No spend data",
    unknown: "Unknown",
  }[status] || "Any";
  const ar = {
    any: "أي حالة",
    profitable: "رابح",
    losing: "خاسر",
    no_spend: "لا توجد بيانات إنفاق",
    unknown: "غير معروف",
  }[status] || "أي حالة";
  return pick(ar, en, arMode);
}

function labelSpend(status, arMode) {
  const en = {
    with_spend: "Connected with spend",
    zero_spend: "Connected, zero spend",
    no_spend: "No matched spend",
  }[status] || "Unknown";
  const ar = {
    with_spend: "متصل بإنفاق",
    zero_spend: "متصل بدون إنفاق",
    no_spend: "لا يوجد إنفاق مطابق",
  }[status] || "غير معروف";
  return pick(ar, en, arMode);
}

function ruleLine(rule, arMode) {
  const op = text(rule && rule.ndrOperator) || ">=";
  const threshold = pct(rule && rule.ndrThreshold);
  const minOrders = number(rule && rule.minNetOrders, 0);
  const profit = labelProfit(text(rule && rule.profitStatus) || "any", arMode);
  return arMode
    ? `القاعدة: NDR ${op} ${threshold} | صافي الطلبات >= ${minOrders} | الربح: ${profit}`
    : `Rule: NDR ${op} ${threshold} | Net orders >= ${minOrders} | Profit: ${profit}`;
}

function productLine(product, index, arMode) {
  const name = text(product.name) || "Unnamed product";
  const sku = text(product.sku) || "-";
  const status = labelProfit(product.profitStatus, arMode);
  const spendStatus = labelSpend(product.spendStatus, arMode);
  const caseLabel = text(product.alertCase && product.alertCase.label);
  if (arMode) {
    return [
      `${index + 1}. ${name}${caseLabel ? ` (${caseLabel})` : ""}`,
      `SKU: ${sku}`,
      `NDR: ${pct(product.ndrPct)} | صافي الطلبات: ${number(product.netOrders)} | تم التسليم: ${number(product.delivered)}`,
      `الحالة: ${status} | صافي الربح: ${money(product.netProfit, product.currency)}`,
      `الإنفاق: ${money(product.spend, product.currency)} | ${spendStatus}`,
      `CPA: ${money(product.cpa, product.currency)} | تكلفة التعادل: ${money(product.breakEvenCpa, product.currency)} | متوسط الربح: ${money(product.averageProfit, product.currency)}`,
    ].join("\n");
  }
  return [
    `${index + 1}. ${name}${caseLabel ? ` (${caseLabel})` : ""}`,
    `SKU: ${sku}`,
    `NDR: ${pct(product.ndrPct)} | Net orders: ${number(product.netOrders)} | Delivered: ${number(product.delivered)}`,
    `Status: ${status} | Net profit: ${money(product.netProfit, product.currency)}`,
    `Spend: ${money(product.spend, product.currency)} | ${spendStatus}`,
    `CPA: ${money(product.cpa, product.currency)} | Break-even CPA: ${money(product.breakEvenCpa, product.currency)} | Avg profit: ${money(product.averageProfit, product.currency)}`,
  ].join("\n");
}

function buildProductAlertMessage(payload) {
  const arMode = isArabic(payload);
  const products = Array.isArray(payload && payload.products) ? payload.products : [];
  const totalMatches = number(payload && payload.totalMatches, products.length);
  const period = payload && payload.period || {};
  const dateFrom = text(period.dateFrom);
  const dateTo = text(period.dateTo);
  const periodLine = dateFrom || dateTo
    ? (arMode ? `الفترة: ${dateFrom || "البداية"} إلى ${dateTo || "الآن"}` : `Period: ${dateFrom || "start"} to ${dateTo || "now"}`)
    : (arMode ? "الفترة: كل بيانات لوحة التحكم المحفوظة" : "Period: all saved dashboard data");
  const hiddenCount = Math.max(0, totalMatches - products.length);
  const cases = Array.isArray(payload && payload.cases) ? payload.cases : [];
  const chunkIndex = number(payload && payload.chunkIndex, 0);
  const chunkTotal = number(payload && payload.chunkTotal, 1);
  const chunkOffset = number(payload && payload.chunkOffset, 0);
  const showChunk = chunkTotal > 1;
  const lines = [
    arMode
      ? `تنبيه المنتجات: ${totalMatches} منتج مطابق`
      : `Product alert: ${totalMatches} product${totalMatches === 1 ? "" : "s"} matched`,
    periodLine,
    showChunk ? (arMode ? `الرسالة: ${chunkIndex + 1} من ${chunkTotal}` : `Message: ${chunkIndex + 1} of ${chunkTotal}`) : "",
    cases.length
      ? (arMode
        ? `الحالات: ${cases.map((item) => `${text(item.label)} (${ruleLine(item.rule, arMode).replace(/^القاعدة: /, "")})`).join(" | ")}`
        : `Cases: ${cases.map((item) => `${text(item.label)} (${ruleLine(item.rule, arMode).replace(/^Rule: /, "")})`).join(" | ")}`)
      : ruleLine(payload && payload.rule, arMode),
    "",
    products.map((product, index) => productLine(product, chunkOffset + index, arMode)).join("\n\n"),
  ];
  if (payload && payload.showHiddenNote !== false && hiddenCount > 0) {
    lines.push("", arMode
      ? `يتم عرض أول ${products.length}. يوجد ${hiddenCount} منتج آخر مطابق في لوحة التحكم.`
      : `Showing top ${products.length}. ${hiddenCount} more matched in the dashboard.`);
  }
  return lines.filter((line) => line !== null && line !== undefined).join("\n");
}

function buildTestMessage(payload) {
  if (isArabic(payload)) {
    return [
      "رسالة اختبار من Taager Bot",
      "تم ربط التنبيهات.",
      "ستظهر تنبيهات المنتجات هنا بعد تحديثات لوحة التحكم.",
    ].join("\n");
  }
  return [
    "Telegram test from Taager Bot",
    "Notifications are connected.",
    "Product alerts will appear here after dashboard updates.",
  ].join("\n");
}

module.exports = {
  buildProductAlertMessage,
  buildTestMessage,
  labelProfit,
  labelSpend,
};
