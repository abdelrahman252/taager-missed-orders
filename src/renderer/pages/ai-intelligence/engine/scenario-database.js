(function () {
  "use strict";

  var PRODUCTS = ["Product X", "Thermal Bottle", "Hair Serum", "Posture Belt", "Kitchen Cutter", "Smart Watch", "Skin Cream", "Mini Printer"];
  var CITIES = ["Riyadh", "Jeddah", "Alexandria", "Cairo", "Dammam", "Mecca", "Mansoura", "Medina"];
  var KPIS = ["NDR", "CPA", "approval rate", "refund rate", "delivery rate", "margin", "ROAS", "commission"];
  var CURRENCIES = ["SAR", "USD", "EGP"];
  var FAILURE_MODES = ["Gemini timeout", "Gemini outage", "rate limit", "budget exceeded", "circuit breaker active"];

  var CATEGORY_DEFS = [
    {
      category: "account-health",
      intent: "LOSS_ANALYSIS",
      mode: "gemini",
      messages: [
        "Why am I losing?",
        "What is killing profitability?",
        "Why are margins collapsing?",
        "Why is the account unstable?",
        "What should I improve first?",
        "Where is most money being lost?",
        "Why did performance suddenly drop?"
      ],
      dependencies: ["accountSpend", "currency"],
      actions: ["Open Account Calculator", "View Worst Products", "Open Spend Breakdown"]
    },
    {
      category: "profitability",
      intent: "LOSS_ANALYSIS",
      mode: "gemini",
      messages: [
        "What is hurting margins?",
        "Why is profit weak even with orders?",
        "Why does revenue not cover spend?",
        "How can I increase profitability?",
        "Why is CPA eating margin?"
      ],
      dependencies: ["spend", "currency"],
      actions: ["Open Account Calculator", "View Worst Cities"]
    },
    {
      category: "scaling",
      intent: "SCALE_ANALYSIS",
      mode: "gemini",
      messages: [
        "What should I scale?",
        "Best products to scale",
        "Which city should I focus on?",
        "What is my safest opportunity?",
        "Which product deserves more spend?",
        "Why are profitable cities not scaling?",
        "How much can I scale safely?"
      ],
      dependencies: [],
      actions: ["Open Product Calculator", "Open City Analytics", "Compare Top Products"]
    },
    {
      category: "products",
      intent: "PRODUCT_ANALYSIS",
      mode: "gemini",
      entity: "product",
      messages: [
        "Why is {product} losing?",
        "Should I scale {product}?",
        "Why is {product} unstable?",
        "Why are refunds high for {product}?",
        "Does {product} have long-term potential?",
        "What is the main risk for {product}?"
      ],
      dependencies: ["productSpend", "currency"],
      actions: ["Open Product Calculator", "Open Product Analytics"]
    },
    {
      category: "cities",
      intent: "CITY_ANALYSIS",
      mode: "gemini",
      entity: "city",
      messages: [
        "Why is {city} weak?",
        "Why is delivery bad in {city}?",
        "Why is {city} unstable?",
        "Should I scale {city}?",
        "Why does {city} hurt profitability?"
      ],
      dependencies: [],
      actions: ["Open City Analytics", "Compare Cities"]
    },
    {
      category: "kpis",
      intent: "KPI_ANALYSIS",
      mode: "gemini",
      entity: "kpi",
      messages: [
        "Why is {kpi} weak?",
        "Why is {kpi} getting worse?",
        "What is causing bad {kpi}?",
        "How do I improve {kpi}?",
        "What does {kpi} mean for profitability?"
      ],
      dependencies: [],
      actions: ["Open KPI Overview", "Open Account Calculator"]
    },
    {
      category: "trends",
      intent: "TREND_ANALYSIS",
      mode: "gemini",
      messages: [
        "Why did this week collapse?",
        "Why are results worsening?",
        "What changed recently?",
        "Is performance improving?",
        "Is {product} recovering?",
        "Why did delivery drop recently?"
      ],
      dependencies: [],
      actions: ["Open Trend View", "View Recent Orders"]
    },
    {
      category: "anomalies",
      intent: "ANOMALY_DETECTION",
      mode: "gemini",
      messages: [
        "What looks suspicious?",
        "Why did refunds spike?",
        "Why did approvals suddenly drop?",
        "Why did this product collapse overnight?",
        "Explain the biggest anomaly"
      ],
      dependencies: [],
      actions: ["Open Anomaly Details", "View Worst Products"]
    },
    {
      category: "forecasting",
      intent: "FORECAST_QUERY",
      mode: "gemini",
      messages: [
        "Forecast next month",
        "What will happen if current NDR continues?",
        "Which product has future potential?",
        "Where will profit likely improve?",
        "What should I expect next week?"
      ],
      dependencies: [],
      actions: ["Open Forecasts", "Open Product Forecast"]
    },
    {
      category: "calculators",
      intent: "CALCULATOR_SIMULATION",
      mode: "gemini",
      messages: [
        "What CPA do I need to break even?",
        "What happens if delivery improves?",
        "What NDR is required for profitability?",
        "How much margin do I need?",
        "Calculate break-even CPA"
      ],
      dependencies: ["calculatorInputs"],
      actions: ["Open Account Calculator", "Open Product Calculator"]
    },
    {
      category: "local-only",
      intent: "RANKING_QUERY",
      mode: "gemini",
      messages: [
        "Top cities",
        "Highest CPA products",
        "Best NDR",
        "Compare Cairo vs Riyadh",
        "How many orders?",
        "What is total revenue?",
        "Export failed orders",
        "Sort products by commission",
        "Filter COD orders",
        "Show product chart"
      ],
      dependencies: [],
      actions: ["Open Relevant Dashboard Section"]
    },
    {
      category: "dependencies",
      intent: "LOSS_ANALYSIS",
      mode: "followup",
      messages: [
        "Why is {product} losing without spend data?",
        "Is {product} profitable?",
        "Why is the account losing without ad spend?",
        "Calculate ROI but I have no currency",
        "Why is CPA high if spend is missing?"
      ],
      dependencies: ["missingSpend", "missingCurrency"],
      actions: []
    },
    {
      category: "fallback-mode",
      intent: "SCALE_ANALYSIS",
      mode: "fallback",
      messages: [
        "What should I do if Gemini times out?",
        "Answer strategy during {failureMode}",
        "Give recommendations with AI unavailable",
        "Fallback analysis for scaling",
        "Local strategic response during outage"
      ],
      dependencies: [],
      actions: ["Open Product Analytics", "Open Account Calculator"]
    }
  ];

  function pick(list, idx) {
    return list[idx % list.length];
  }

  function fill(template, idx) {
    return template
      .replace(/\{product\}/g, pick(PRODUCTS, idx))
      .replace(/\{city\}/g, pick(CITIES, idx))
      .replace(/\{kpi\}/g, pick(KPIS, idx))
      .replace(/\{currency\}/g, pick(CURRENCIES, idx))
      .replace(/\{failureMode\}/g, pick(FAILURE_MODES, idx));
  }

  function mockContext(def, idx) {
    var ndr = 35 + (idx % 45);
    var commission = 500 + (idx % 20) * 350;
    return {
      accountHealth: {
        profit: idx % 3 === 0 ? -12000 + idx : 8000 + idx,
        ndr: ndr,
        deliveryRate: Math.min(90, ndr + 8),
        mainIssues: [
          ndr < 20 ? "Low NDR in high-volume segments" : "CPA and margin pressure",
          idx % 5 === 0 ? "Weak city delivery quality" : "Unstable product performance"
        ]
      },
      product: pick(PRODUCTS, idx),
      city: pick(CITIES, idx),
      kpi: pick(KPIS, idx),
      anomalies: idx % 7 === 0 ? ["Sudden refund spike"] : [],
      opportunities: ["Scale only stable-NDR products", "Focus on stronger delivery cities"]
    };
  }

  function expectedReasoning(def, idx) {
    if (def.mode === "local") return "Resolve deterministically from local dashboard facts without Gemini.";
    if (def.mode === "followup") return "Ask for the missing spend/currency/input before profitability reasoning.";
    if (def.mode === "fallback") return "Use local strategic templates when Gemini is unavailable.";
    return "Use local analytics as source of truth, then Gemini enhances strategic operator wording.";
  }

  function generateScenarios(targetCount) {
    var scenarios = [];
    var id = 1;
    targetCount = targetCount || 1200;
    while (scenarios.length < targetCount) {
      for (var d = 0; d < CATEGORY_DEFS.length && scenarios.length < targetCount; d += 1) {
        var def = CATEGORY_DEFS[d];
        for (var m = 0; m < def.messages.length && scenarios.length < targetCount; m += 1) {
          var idx = id + m + d;
          scenarios.push({
            id: "ai-scenario-" + String(id).padStart(4, "0"),
            category: def.category,
            userMessage: fill(def.messages[m], idx),
            intent: def.intent,
            expectedMode: def.mode,
            extractedEntities: {
              product: def.entity === "product" ? pick(PRODUCTS, idx) : null,
              city: def.entity === "city" ? pick(CITIES, idx) : null,
              kpi: def.entity === "kpi" ? pick(KPIS, idx) : null
            },
            requiredDependencies: def.dependencies.slice(),
            mockAnalyticsContext: mockContext(def, idx),
            expectedLocalReasoning: expectedReasoning(def, idx),
            expectedGeminiEnhancedReasoning: def.mode === "gemini" ? "Operator-style explanation with root cause, KPI relationship, priorities, and tips." : null,
            expectedFallbackResponse: "Local strategic response with tips and dashboard actions.",
            expectedRecommendations: [
              "Prioritize the highest financial impact first",
              "Avoid scaling unstable NDR/CPA segments",
              "Use dashboard actions to inspect the relevant section"
            ],
            expectedNavigationActions: def.actions.slice(),
            expectedConversationalFollowUps: def.mode === "followup" ? [
              "Ask for spend amount",
              "Ask for currency",
              "Resume analysis automatically"
            ] : []
          });
          id += 1;
        }
      }
    }
    return scenarios;
  }

  var api = {
    categories: CATEGORY_DEFS.map(function (def) { return def.category; }),
    generate: generateScenarios,
    defaultScenarios: generateScenarios(1200)
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.KhodAiScenarioDatabase = api;
})();
