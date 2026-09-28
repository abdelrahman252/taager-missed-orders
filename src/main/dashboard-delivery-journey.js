"use strict";

// Only orders actually observed Out for Delivery enter this history. A final
// snapshot alone cannot prove that an older order passed through that stage.
function keyOf(row) {
  return String(row && (row.taagerOrderNumber || row.orderNumber || row.orderId || row.id || row.reference) || "").trim();
}

function bucketOf(row) {
  const explicit = String(row && (row.orderStatusBucket || row.exactStatusBucket || row.statusBucket) || "").trim();
  if (explicit) return explicit;
  const status = String(row && (row.orderStatus || row.status) || "").trim().toLowerCase();
  if (["out for delivery", "قيد التوصيل"].includes(status)) return "shipping";
  if (["delivered", "تم التوصيل"].includes(status)) return "delivered";
  if (["delivery failed", "فشل التسليم"].includes(status)) return "failed";
  if (["return verified", "returned", "تم التحقق من الإرجاع", "مرتجع"].includes(status)) return "return_verified";
  return status;
}

function productOf(row) {
  return {
    sku: String(row.sku || row.productSku || "").trim(),
    name: String(row.products || row.productName || row.product || "").trim(),
    country: String(row.taagerCountry || row.country || "sa").trim().toLowerCase(),
  };
}

function productKey(product) {
  return (product.country || "sa") + "|" + (product.sku ? "sku:" + product.sku.toLowerCase() : "name:" + product.name.toLowerCase());
}

function grouped(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = keyOf(row);
    if (!id) continue; // Never link different orders by phone or row position.
    if (!groups.has(id)) groups.set(id, { statuses: new Set(), products: new Map(), createdAt: "" });
    const group = groups.get(id);
    group.statuses.add(bucketOf(row));
    const product = productOf(row);
    if (product.sku || product.name) group.products.set(productKey(product), product);
    const createdAt = String(row.createdAt || row.date || row.dashboardDate || "").slice(0, 10);
    if (createdAt && (!group.createdAt || createdAt < group.createdAt)) group.createdAt = createdAt;
  }
  return groups;
}

function groupBucket(statuses) {
  if (statuses.has("shipping")) return "shipping";
  if (statuses.has("return_verified")) return "return_verified";
  if (statuses.has("failed")) return "failed";
  if (statuses.size === 1 && statuses.has("delivered")) return "delivered";
  return "unresolved";
}

function observe(journeys, rows, observedAt, touched) {
  for (const [id, group] of grouped(rows)) {
    const bucket = groupBucket(group.statuses);
    let journey = journeys[id];
    if (!journey && bucket !== "shipping") continue;
    if (!journey) {
      journey = journeys[id] = { orderId: id, createdAt: group.createdAt, enteredOutForDeliveryAt: observedAt, lastBucket: "", outcome: null, resolvedAt: null, products: [], events: [] };
      touched.add(id);
    } else if (!touched.has(id)) {
      journey = journeys[id] = { ...journey, products: (journey.products || []).slice(), events: (journey.events || []).slice() };
      touched.add(id);
    }
    if (!journey.createdAt && group.createdAt) journey.createdAt = group.createdAt;
    const products = new Map((journey.products || []).map((product) => [productKey(product), product]));
    for (const [key, product] of group.products) products.set(key, product);
    journey.products = Array.from(products.values());
    if (bucket === "unresolved") {
      if (journey.outcome) {
        journey.outcome = null;
        journey.resolvedAt = null;
      }
      recordIfChanged(journey, bucket, observedAt);
      continue;
    }
    const changed = recordIfChanged(journey, bucket, observedAt);
    journey.outcome = bucket === "delivered" ? "delivered" : (bucket === "failed" || bucket === "return_verified" ? "unsuccessful" : null);
    journey.resolvedAt = journey.outcome ? (changed || !journey.resolvedAt ? observedAt : journey.resolvedAt) : null;
  }
}

function recordIfChanged(journey, bucket, observedAt) {
  if (journey.lastBucket === bucket) return false;
  journey.lastBucket = bucket;
  journey.events.push({ bucket, observedAt });
  return true;
}

function updateDeliveryJourneys(existing, previousRows, incomingRows, observedAt = Date.now(), previousObservedAt = observedAt) {
  const journeys = Object.assign(Object.create(null), existing && typeof existing === "object" ? existing : {});
  const touched = new Set();
  observe(journeys, previousRows, previousObservedAt, touched);
  observe(journeys, incomingRows, observedAt, touched);
  return journeys;
}

module.exports = { updateDeliveryJourneys, keyOf, bucketOf, productKey };
