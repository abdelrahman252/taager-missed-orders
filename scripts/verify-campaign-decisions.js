"use strict";

var path = require("path");
var evaluator = require(path.join(__dirname, "..", "src", "renderer", "pages", "dashboard", "dashboard-campaign-decision.js"));
var passed = 0;
var failed = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log("  OK  " + label);
    passed += 1;
    return;
  }
  console.error("  FAIL  " + label + ": expected " + expected + ", got " + actual);
  failed += 1;
}

function decision(overrides) {
  return evaluator.evaluate(Object.assign({
    orders: 50,
    delivered: 10,
    ndrPct: 40,
    cancelPct: 10,
    cpa: 20,
    breakEvenCpa: 20,
    deliveredCpa: 50,
    avgDeliveredProfit: 50,
    netProfit: 1,
    campaignCount: 2
  }, overrides || {}));
}

console.log("\nCampaign decision boundaries");
check("14 orders stays watch even with zero delivery", decision({ orders: 14, delivered: 0, ndrPct: 0 }).decision, "watch");
check("15 orders with zero delivery pauses", decision({ orders: 15, delivered: 0, ndrPct: 0 }).decision, "pause");
check("NDR 19.9 is unsafe", decision({ ndrPct: 19.9 }).decision, "pause");
check("NDR 20 is recoverable, not pause", decision({ ndrPct: 20 }).decision, "fix_first");
check("NDR 40 passes scale threshold", decision({ ndrPct: 40 }).decision, "scale");
check("49 orders is fix first", decision({ orders: 49 }).decision, "fix_first");
check("50 orders passes scale threshold", decision({ orders: 50 }).decision, "scale");
check("9 delivered is fix first", decision({ delivered: 9 }).decision, "fix_first");
check("10 delivered passes scale threshold", decision({ delivered: 10 }).decision, "scale");
check("CPA exactly at break-even can scale", decision({ cpa: 20, breakEvenCpa: 20 }).decision, "scale");
check("CPA above break-even alone is fix first", decision({ cpa: 20.01, breakEvenCpa: 20, netProfit: 1 }).decision, "fix_first");
check("CPA above break-even with a loss pauses", decision({ cpa: 21, breakEvenCpa: 20, netProfit: -1 }).decision, "pause");
check("39.9 cancellation can scale", decision({ cancelPct: 39.9 }).decision, "scale");
check("40 cancellation pauses", decision({ cancelPct: 40 }).decision, "pause");
check("zero net profit is fix first", decision({ netProfit: 0 }).decision, "fix_first");
check("negative profit with safe CPA is fix first", decision({ netProfit: -1, cpa: 19, breakEvenCpa: 20 }).decision, "fix_first");
check("positive profit can scale", decision({ netProfit: 0.01 }).decision, "scale");
check("missing break-even data blocks scale", decision({ breakEvenCpa: 0 }).decision, "fix_first");

var watch = decision({ orders: 8, delivered: 2, ndrPct: 25 });
check("watch exposes limited confidence", watch.confidence.level, "limited");
check("watch exposes structured warnings", watch.warnings.length > 0, true);
check("scale exposes passed checks", decision().passedChecks.length >= 5, true);
check("unsafe NDR exposes failed reason", decision({ ndrPct: 10 }).failedChecks.some(function (item) { return item.key === "ndr"; }), true);

console.log("\n" + passed + " passed, " + failed + " failed.");
if (failed) process.exit(1);
