"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SmartInsights = require(path.join(ROOT, "src", "renderer", "pages", "smart-insights-core.js"));
const CampaignDecision = require(path.join(ROOT, "src", "renderer", "pages", "dashboard", "dashboard-campaign-decision.js"));

function check(label, fn) {
  try {
    fn();
    console.log("  OK  " + label);
  } catch (error) {
    console.error("  FAIL  " + label);
    throw error;
  }
}

check("shared thresholds match smart insight plan", () => {
  const t = SmartInsights.thresholds();
  assert.equal(t.dangerNdrPct, 20);
  assert.equal(t.healthyNdrPct, 30);
  assert.equal(t.scaleNdrPct, 40);
  assert.equal(t.insightMinSample, 15);
  assert.equal(t.scaleMinOrders, 50);
  assert.equal(t.scaleMinDelivered, 10);
});

check("NDR helper uses net delivery definition and evidence", () => {
  const fact = SmartInsights.ndrFact(12, 40);
  assert.equal(fact.metric, "NDR");
  assert.equal(fact.pct, 30);
  assert.equal(fact.sampleOk, true);
  assert.match(fact.definition, /Net delivery rate/);
  assert.match(fact.evidence, /12 \/ 40/);
});

check("tiny samples are limited and block confident claims", () => {
  const gate = SmartInsights.sampleGate(4, 15);
  assert.equal(gate.ok, false);
  assert.equal(gate.confidence, "limited");
});

check("campaign decisions still use shared scale and danger thresholds", () => {
  assert.equal(CampaignDecision.evaluate({ orders: 14, delivered: 0, ndrPct: 0 }).decision, "watch");
  assert.equal(CampaignDecision.evaluate({ orders: 15, delivered: 0, ndrPct: 0 }).decision, "pause");
  assert.equal(CampaignDecision.evaluate({
    orders: 50,
    delivered: 10,
    ndrPct: 40,
    cancelPct: 0,
    cpa: 20,
    breakEvenCpa: 20,
    deliveredCpa: 40,
    avgDeliveredProfit: 40,
    netProfit: 1
  }).decision, "scale");
});

check("geo insight engine says low net delivery rate, not returns rate", () => {
  const context = {
    console,
    window: {
      TaagerSmartInsights: SmartInsights,
      dashboardI18n: { currentLocale: "en", pick: (en) => en },
      getDashboardThresholds: () => ({
        NDR_DANGER: 0.20,
        NDR_SAFE: 0.40,
        NDR_NATIONAL: 0.30,
        DR_EXCELLENT: 0.40,
        DR_GOOD: 0.30,
        DR_POOR: 0.20,
        SCALING_MIN_ORDERS: 30,
        INSIGHT_MIN_SAMPLE: 15,
        PREPAID_ADVANTAGE_THRESHOLD: 0.15,
        COD_HEAVY_THRESHOLD: 0.85
      })
    }
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "src", "renderer", "pages", "dashboard", "dashboard-insight-engine.js"), "utf8"),
    context,
    { filename: "dashboard-insight-engine.js" }
  );
  const insights = context.window.runInsightEngine({
    cityStats: {
      Riyadh: {
        count: 20,
        ndrBaseOrders: 20,
        deliveredOrders: 2,
        codCount: 18,
        prepaidCount: 2
      }
    },
    productStats: {},
    geoProductMap: {},
    provinceMap: {},
    kpis: { ndr: 0.30, dr: 0.30 }
  });
  assert.ok(insights.length > 0);
  assert.match(insights[0].body, /Net delivery rate/);
  assert.doesNotMatch(insights[0].body, /Returns rate/i);
  assert.equal(insights[0].trust, "measured");
  assert.ok(Array.isArray(insights[0].evidence) && insights[0].evidence.length > 0);
});

console.log("[PASS] Smart insights correctness checks");
