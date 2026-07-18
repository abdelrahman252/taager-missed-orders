"use strict";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cartOrderGroupKey(order) {
  if (order && order.uploadGroupKey) return clean(order.uploadGroupKey);
  return [
    order && order.source || "real",
    order && (order.normPhone || order.phone) || "",
    order && (order.orderId || "") || "",
    order && (order.easyCreatedAt || order.createdAt || order.date) || "",
    order && (order.name || "") || "",
    order && (order.address || "") || "",
    order && (order.phoneAmbiguityGroupId || "") || "",
    order && (order.phoneCandidateIndex || "") || "",
  ].map(clean).join("|");
}

function orderLineItems(order) {
  if (order && Array.isArray(order.items) && order.items.length) {
    return order.items.map((item) => ({
      ...item,
      source: item.source || order.source,
      normPhone: item.normPhone || order.normPhone,
      phone: item.phone || order.phone,
      name: item.name || order.name,
      city: item.city || order.city,
      address: item.address || order.address,
      date: item.date || order.date,
      createdAt: item.createdAt || order.createdAt,
      easyCreatedAt: item.easyCreatedAt || order.easyCreatedAt,
      destination: item.destination || order.destination,
      destinationAccount: item.destinationAccount || order.destinationAccount,
    }));
  }
  return order ? [order] : [];
}

function mergeItemList(items) {
  const byKey = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const sku = clean(item && item.sku);
    if (!sku) continue;
    const productName = clean(item && item.productName);
    const key = sku + "|" + productName + "|" + clean(item && item.unitPrice);
    const qty = numberOrZero(item && item.qty) || 1;
    const subtotal = numberOrZero(item && item.subtotal);
    const unitPrice = numberOrZero(item && item.unitPrice) || (qty ? Math.round(subtotal / qty) : 0);
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...item,
        sku,
        productName,
        qty,
        unitPrice,
        subtotal: subtotal || unitPrice * qty,
      });
    } else {
      const existing = byKey.get(key);
      existing.qty = (numberOrZero(existing.qty) || 1) + qty;
      existing.subtotal = numberOrZero(existing.subtotal) + (subtotal || unitPrice * qty);
      existing.unitPrice = existing.qty ? Math.round(existing.subtotal / existing.qty) : unitPrice;
    }
  }
  return [...byKey.values()];
}

function buildGroupedCartOrders(orders) {
  const groups = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    const key = cartOrderGroupKey(order);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(...orderLineItems(order));
  }

  return [...groups.entries()].map(([groupKey, rawItems]) => {
    const items = mergeItemList(rawItems);
    const first = items[0] || rawItems[0] || {};
    const skuList = items.map((item) => clean(item.sku)).filter(Boolean);
    const productList = items.map((item) => clean(item.productName)).filter(Boolean);
    const qtyList = items.map((item) => numberOrZero(item.qty) || 1);
    const unitPriceList = items.map((item) => numberOrZero(item.unitPrice));
    const subtotal = items.reduce((sum, item) => sum + numberOrZero(item.subtotal || ((numberOrZero(item.unitPrice) || 0) * (numberOrZero(item.qty) || 1))), 0);

    return {
      ...first,
      uploadGroupKey: groupKey,
      items,
      uploadItemCount: items.length,
      sku: skuList.join(", "),
      productName: productList.join(", "),
      qty: qtyList.reduce((sum, qty) => sum + qty, 0) || 1,
      qtyList: qtyList.join(", "),
      unitPrice: items.length === 1 ? unitPriceList[0] || first.unitPrice || "" : "",
      unitPriceList: unitPriceList.map((price) => price || "").join(", "),
      subtotal,
    };
  });
}

function cartOrderItemKeys(order, makeKey) {
  return orderLineItems(order)
    .map((item) => makeKey(item.normPhone || order.normPhone, item.sku))
    .filter(Boolean);
}

module.exports = {
  buildGroupedCartOrders,
  cartOrderGroupKey,
  cartOrderItemKeys,
  orderLineItems,
};
