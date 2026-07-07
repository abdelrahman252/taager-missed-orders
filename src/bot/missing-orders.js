"use strict";

function splitOrdersByDestination(orders, enabled) {
  const list = Array.isArray(orders) ? orders : [];
  if (enabled !== true) return { cartOrders: list.slice(), missingOrders: [] };

  const cartOrders = [];
  const missingOrders = [];
  for (const order of list) {
    if (String(order?.source || "real").toLowerCase() === "missed") missingOrders.push(order);
    else cartOrders.push(order);
  }
  return { cartOrders, missingOrders };
}

function missingOrderGroupKey(order) {
  return [
    order?.normPhone || order?.phone || "",
    order?.easyCreatedAt || order?.createdAt || order?.date || "",
    order?.name || "",
    order?.address || "",
  ].map((value) => String(value).trim()).join("|");
}

function groupMissingOrders(orders) {
  const groups = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    const key = missingOrderGroupKey(order);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  }
  return [...groups.values()];
}

function missingOrderUploadIdentity(order) {
  return [
    order?.normPhone || order?.phone || "",
    order?.sku || "",
    order?.easyCreatedAt || order?.createdAt || order?.date || "",
    Number(order?.qty) || 1,
    order?.productName || "",
  ].map((value) => String(value).trim()).join("|");
}

module.exports = { splitOrdersByDestination, missingOrderGroupKey, groupMissingOrders, missingOrderUploadIdentity };
