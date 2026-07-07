(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TaagerDashboardFinancialCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function number(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    var parsed = Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function nonNegative(value) {
    return Math.max(0, number(value));
  }

  function rate(value) {
    return Math.max(0, Math.min(1, number(value)));
  }

  function divide(numerator, denominator) {
    var bottom = number(denominator);
    return bottom > 0 ? number(numerator) / bottom : 0;
  }

  function resolveExpectedRate(specificDelivered, specificBase, globalDelivered, globalBase) {
    var localBase = nonNegative(specificBase);
    var fallbackBase = nonNegative(globalBase);
    if (localBase > 0) {
      return {
        rate: rate(divide(specificDelivered, localBase)),
        source: "specific",
        insufficientHistory: false,
      };
    }
    if (fallbackBase > 0) {
      return {
        rate: rate(divide(globalDelivered, fallbackBase)),
        source: "global_fallback",
        insufficientHistory: false,
      };
    }
    return { rate: 0, source: "insufficient_history", insufficientHistory: true };
  }

  function calculate(input) {
    input = input || {};
    var netOrders = nonNegative(input.netOrders);
    var actualDeliveredOrders = nonNegative(input.actualDeliveredOrders);
    var actualEarnedProfit = number(input.actualEarnedProfitAfterTax);
    var netOrderProfit = number(input.netOrderProfitAfterTax);
    var hasNetOrderProfit = input.netOrderProfitAfterTax != null;
    var currentTotalSales = nonNegative(input.currentTotalSales);
    var adSpend = nonNegative(input.adSpend);
    var expectedNdrRate = rate(input.expectedNdrRate);

    var averageProfitSource = actualDeliveredOrders > 0
      ? "delivered_orders"
      : (netOrders > 0 && hasNetOrderProfit ? "net_orders_fallback" : "unavailable");
    var averageProfit = averageProfitSource === "delivered_orders"
      ? divide(actualEarnedProfit, actualDeliveredOrders)
      : (averageProfitSource === "net_orders_fallback" ? divide(netOrderProfit, netOrders) : 0);
    var actualNetProfit = actualEarnedProfit - adSpend;
    var actualDeliveredSales = nonNegative(input.actualDeliveredSales);
    var expectedDeliveriesExact = netOrders * expectedNdrRate;
    var expectedDeliveriesDisplay = Math.round(expectedDeliveriesExact);
    var expectedTotalProfitBeforeAdSpend = expectedDeliveriesExact * averageProfit;
    var expectedNetProfit = expectedTotalProfitBeforeAdSpend - adSpend;
    var expectedDeliveredSales = currentTotalSales * expectedNdrRate;
    var mode = input.mode === "expected" ? "expected" : "actual";

    return {
      mode: mode,
      netOrders: netOrders,
      expectedNdrRate: expectedNdrRate,
      insufficientHistory: !!input.insufficientHistory,
      averageProfit: averageProfit,
      averageProfitSource: averageProfitSource,
      cpa: divide(adSpend, netOrders),
      breakEvenCpa: averageProfit * expectedNdrRate,
      aov: divide(currentTotalSales, netOrders),

      actualDeliveredOrders: actualDeliveredOrders,
      actualEarnedProfitAfterTax: actualEarnedProfit,
      actualNetProfit: actualNetProfit,
      actualDeliveredSales: actualDeliveredSales,
      actualDeliveredCpa: divide(adSpend, actualDeliveredOrders),
      actualProfitRoas: divide(actualEarnedProfit, adSpend),
      actualRoi: divide(actualNetProfit, adSpend) * 100,
      actualSalesRoas: divide(actualDeliveredSales, adSpend),

      expectedDeliveriesExact: expectedDeliveriesExact,
      expectedDeliveriesDisplay: expectedDeliveriesDisplay,
      expectedTotalProfitBeforeAdSpend: expectedTotalProfitBeforeAdSpend,
      expectedNetProfit: expectedNetProfit,
      expectedDeliveredCpa: divide(adSpend, expectedDeliveriesExact),
      expectedProfitRoas: divide(expectedTotalProfitBeforeAdSpend, adSpend),
      expectedRoi: divide(expectedNetProfit, adSpend) * 100,
      expectedDeliveredSales: expectedDeliveredSales,
      expectedSalesRoas: divide(expectedDeliveredSales, adSpend),
      expectedDeliveredAov: divide(expectedDeliveredSales, expectedDeliveriesExact),

      displayedDeliveredOrders: mode === "expected" ? expectedDeliveriesDisplay : actualDeliveredOrders,
      displayedTotalProfitBeforeAdSpend: mode === "expected" ? expectedTotalProfitBeforeAdSpend : actualEarnedProfit,
      displayedNetProfit: mode === "expected" ? expectedNetProfit : actualNetProfit,
      displayedDeliveredSales: mode === "expected" ? expectedDeliveredSales : actualDeliveredSales,
    };
  }

  return {
    calculate: calculate,
    divide: divide,
    number: number,
    rate: rate,
    resolveExpectedRate: resolveExpectedRate,
  };
});
