"use strict";

const DESTINATION_PRIMARY_CART = "primary_cart";
const DESTINATION_LEGACY_MISSING_ORDERS = "legacy_missing_orders";
const DESTINATION_SECOND_TAAGER_CART = "second_taager_cart";

function normalizeMissedOrdersDestination(value, options = {}) {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === DESTINATION_LEGACY_MISSING_ORDERS || clean === "missing-orders" || clean === "legacy") {
    return DESTINATION_LEGACY_MISSING_ORDERS;
  }
  if (clean === DESTINATION_SECOND_TAAGER_CART || clean === "second-taager-cart" || clean === "second_cart") {
    return DESTINATION_SECOND_TAAGER_CART;
  }
  if (options && options.legacyEnabled === true) {
    return DESTINATION_LEGACY_MISSING_ORDERS;
  }
  if (clean === DESTINATION_PRIMARY_CART || clean === "cart" || clean === "normal") {
    return DESTINATION_PRIMARY_CART;
  }
  return DESTINATION_PRIMARY_CART;
}

function isMissedSource(order) {
  return String(order && (order.source || "real") || "real").toLowerCase() === "missed";
}

function splitOrdersByMissedDestination(orders, destination) {
  const list = Array.isArray(orders) ? orders : [];
  const normalized = normalizeMissedOrdersDestination(destination);
  const primaryCartOrders = [];
  const legacyMissingOrders = [];
  const secondTaagerCartOrders = [];

  for (const order of list) {
    if (!isMissedSource(order)) {
      primaryCartOrders.push(order);
    } else if (normalized === DESTINATION_LEGACY_MISSING_ORDERS) {
      legacyMissingOrders.push(order);
    } else if (normalized === DESTINATION_SECOND_TAAGER_CART) {
      secondTaagerCartOrders.push(order);
    } else {
      primaryCartOrders.push(order);
    }
  }

  return { primaryCartOrders, legacyMissingOrders, secondTaagerCartOrders };
}

function destinationForOrder(order, destination) {
  if (!isMissedSource(order)) return "cart";
  const normalized = normalizeMissedOrdersDestination(destination);
  if (normalized === DESTINATION_LEGACY_MISSING_ORDERS) return "missing-orders";
  if (normalized === DESTINATION_SECOND_TAAGER_CART) return "second-taager-cart";
  return "cart";
}

module.exports = {
  DESTINATION_PRIMARY_CART,
  DESTINATION_LEGACY_MISSING_ORDERS,
  DESTINATION_SECOND_TAAGER_CART,
  normalizeMissedOrdersDestination,
  splitOrdersByMissedDestination,
  destinationForOrder,
};
