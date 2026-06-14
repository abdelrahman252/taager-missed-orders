(function (root, factory) {
  "use strict";

  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TaagerCampaignDecision = api;
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";

  var shared = root && root.TaagerSmartInsights && typeof root.TaagerSmartInsights.thresholds === "function"
    ? root.TaagerSmartInsights.thresholds()
    : {};
  var THRESHOLDS = {
    minimumEvidenceOrders: shared.insightMinSample || 15,
    scaleOrders: shared.scaleMinOrders || 50,
    scaleDelivered: shared.scaleMinDelivered || 10,
    dangerNdrPct: shared.dangerNdrPct || 20,
    scaleNdrPct: shared.scaleNdrPct || 40,
    dangerCancelPct: 40
  };

  function number(value, fallback) {
    if (value == null || value === "") return fallback == null ? 0 : fallback;
    var parsed = Number(String(value).replace(/,/g, "").replace(/%/g, ""));
    return Number.isFinite(parsed) ? parsed : (fallback == null ? 0 : fallback);
  }

  function signal(key, status, actual, target, message) {
    return {
      key: key,
      status: status,
      actual: actual,
      target: target,
      message: message
    };
  }

  function evaluate(input) {
    input = input || {};
    var orders = number(input.orders != null ? input.orders : input.taagerOrders);
    var delivered = number(input.delivered != null ? input.delivered : input.taagerDelivered);
    var ndrPct = number(input.ndrPct != null ? input.ndrPct : (input.ndr != null ? input.ndr : input.taagerNdrPct));
    var cancelPct = number(input.cancelPct != null ? input.cancelPct : input.cancelRate);
    var cpa = number(input.cpa != null ? input.cpa : input.taagerCpa);
    var breakEvenCpa = number(input.breakEvenCpa);
    var deliveredCpa = number(input.deliveredCpa);
    var avgDeliveredProfit = number(input.avgDeliveredProfit);
    var netProfitValue = input.netProfit != null ? input.netProfit : input.profit;
    var netProfitKnown = netProfitValue != null && netProfitValue !== "";
    var netProfit = number(netProfitValue);
    var cpaKnown = cpa > 0 && breakEvenCpa > 0;
    var cpaUnsafe = cpaKnown && cpa > breakEvenCpa;
    var deliveredCpaKnown = deliveredCpa > 0 && avgDeliveredProfit > 0;
    var deliveredCpaUnsafe = deliveredCpaKnown && deliveredCpa > avgDeliveredProfit;
    var tinySample = orders < THRESHOLDS.minimumEvidenceOrders;
    var deliveryDanger = !tinySample && (delivered <= 0 || ndrPct < THRESHOLDS.dangerNdrPct);
    var cancellationDanger = cancelPct >= THRESHOLDS.dangerCancelPct;
    var combinedFinancialDanger = netProfitKnown && netProfit < 0 && (cpaUnsafe || deliveredCpaUnsafe);
    var scaleReady = orders >= THRESHOLDS.scaleOrders &&
      delivered >= THRESHOLDS.scaleDelivered &&
      ndrPct >= THRESHOLDS.scaleNdrPct &&
      cpaKnown &&
      !cpaUnsafe &&
      !cancellationDanger &&
      netProfitKnown &&
      netProfit > 0;
    var decision = scaleReady
      ? "scale"
      : (tinySample
        ? "watch"
        : ((deliveryDanger || cancellationDanger || combinedFinancialDanger) ? "pause" : "fix_first"));
    var passedChecks = [];
    var failedChecks = [];
    var warnings = [];

    if (orders >= THRESHOLDS.scaleOrders) {
      passedChecks.push(signal("orders", "pass", orders, THRESHOLDS.scaleOrders, "Order sample is large enough for a scale decision."));
    } else if (tinySample) {
      warnings.push(signal("orders", "info", orders, THRESHOLDS.minimumEvidenceOrders, "Not enough orders for a reliable performance decision yet."));
    } else {
      warnings.push(signal("orders", "warning", orders, THRESHOLDS.scaleOrders, "More order evidence is needed before scaling."));
    }

    if (delivered >= THRESHOLDS.scaleDelivered) {
      passedChecks.push(signal("delivered", "pass", delivered, THRESHOLDS.scaleDelivered, "Delivered sample supports a scale decision."));
    } else if (delivered <= 0 && !tinySample) {
      failedChecks.push(signal("delivered", "fail", delivered, THRESHOLDS.scaleDelivered, "There are no delivered orders despite meaningful order volume."));
    } else {
      warnings.push(signal("delivered", tinySample ? "info" : "warning", delivered, THRESHOLDS.scaleDelivered, "More delivered orders are needed before scaling."));
    }

    if (ndrPct >= THRESHOLDS.scaleNdrPct) {
      passedChecks.push(signal("ndr", "pass", ndrPct, THRESHOLDS.scaleNdrPct, "NDR is inside the safe scale zone."));
    } else if (ndrPct < THRESHOLDS.dangerNdrPct && !tinySample) {
      failedChecks.push(signal("ndr", "fail", ndrPct, THRESHOLDS.dangerNdrPct, "NDR is inside the unsafe delivery zone."));
    } else {
      warnings.push(signal("ndr", tinySample ? "info" : "warning", ndrPct, THRESHOLDS.scaleNdrPct, "NDR is below the safe scale zone."));
    }

    if (!cpaKnown) {
      warnings.push(signal("cpa", "info", cpa, breakEvenCpa, "CPA safety is unavailable until both CPA and break-even CPA are known."));
    } else if (cpaUnsafe) {
      failedChecks.push(signal("cpa", "fail", cpa, breakEvenCpa, "CPA is above break-even CPA."));
    } else {
      passedChecks.push(signal("cpa", "pass", cpa, breakEvenCpa, "CPA is at or below break-even CPA."));
    }

    if (!netProfitKnown) {
      warnings.push(signal("net_profit", "info", null, 0, "Net profit is unavailable."));
    } else if (netProfit > 0) {
      passedChecks.push(signal("net_profit", "pass", netProfit, 0, "Net profit is positive."));
    } else if (netProfit < 0) {
      failedChecks.push(signal("net_profit", "fail", netProfit, 0, "Net profit is negative."));
    } else {
      warnings.push(signal("net_profit", "warning", netProfit, 0, "Net profit is at break-even."));
    }

    if (cancelPct >= THRESHOLDS.dangerCancelPct) {
      failedChecks.push(signal("cancellation", "fail", cancelPct, THRESHOLDS.dangerCancelPct, "Cancellation rate is in the high-risk zone."));
    } else {
      passedChecks.push(signal("cancellation", "pass", cancelPct, THRESHOLDS.dangerCancelPct, "Cancellation rate is below the high-risk threshold."));
    }

    var weakCities = Array.isArray(input.cities) ? input.cities.filter(function (city) {
      return number(city && (city.orders != null ? city.orders : city.count)) >= THRESHOLDS.minimumEvidenceOrders &&
        number(city && (city.ndrPct != null ? city.ndrPct : city.ndr)) < THRESHOLDS.dangerNdrPct;
    }) : [];
    if (weakCities.length) {
      warnings.push(signal("city_mix", "warning", weakCities.length, 0, "One or more meaningful-volume cities have unsafe NDR."));
    }

    var confidence = orders < THRESHOLDS.minimumEvidenceOrders
      ? { level: "limited", label: "Limited evidence" }
      : ((orders < THRESHOLDS.scaleOrders || delivered < THRESHOLDS.scaleDelivered)
        ? { level: "developing", label: "Developing evidence" }
        : { level: "strong", label: "Strong evidence" });
    var summary = {
      scale: "All scale guardrails passed.",
      watch: "There is not enough evidence for a reliable scale or pause decision.",
      pause: "One or more critical risk guardrails failed.",
      fix_first: "The product has recoverable issues that should be fixed before scaling."
    }[decision];
    var nextAction = {
      scale: "Increase budget in small steps and stop if NDR falls or CPA moves above break-even.",
      watch: "Keep the test controlled until at least 15 orders, then reassess delivery and financial quality.",
      pause: "Reduce or pause traffic, fix the critical delivery, cancellation, or financial risk, then reassess.",
      fix_first: "Keep budget stable while improving the failed checks, then reassess before scaling."
    }[decision];

    return {
      status: decision,
      decision: decision,
      summary: summary,
      passedChecks: passedChecks,
      failedChecks: failedChecks,
      warnings: warnings,
      nextAction: nextAction,
      confidence: confidence,
      thresholds: Object.assign({}, THRESHOLDS),
      facts: {
        orders: orders,
        delivered: delivered,
        ndrPct: ndrPct,
        cancelPct: cancelPct,
        cpa: cpa,
        breakEvenCpa: breakEvenCpa,
        deliveredCpa: deliveredCpa,
        avgDeliveredProfit: avgDeliveredProfit,
        netProfit: netProfitKnown ? netProfit : null,
        campaignCount: number(input.campaignCount),
        periodLabel: String(input.periodLabel || "")
      },
      reasons: failedChecks.concat(warnings).map(function (item) { return item.message; }).slice(0, 5)
    };
  }

  return {
    thresholds: Object.assign({}, THRESHOLDS),
    evaluate: evaluate
  };
});
