(function () {
  "use strict";

  function num(value) {
    return Number(value || 0);
  }

  function fmt(value) {
    return Math.round(num(value)).toLocaleString("en-US");
  }

  function pct(value) {
    var n = Number(value || 0);
    return Math.round((n > 1 ? n : n * 100) * 10) / 10;
  }

  function slug(value) {
    return encodeURIComponent(String(value || "").trim());
  }

  function action(type, label, route, extra) {
    return Object.assign({ type: type, label: label, route: route }, extra || {});
  }

  function actionSet(context) {
    var product = context.selectedProduct && context.selectedProduct.name;
    var city = context.selectedCity && context.selectedCity.name;
    var actions = [];

    if (product) {
      actions.push(action("OPEN_PAGE", "Open Product Calculator", "/calculator/product?product=" + slug(product), { section: "productForecast", productId: product }));
      actions.push(action("OPEN_PRODUCT", "Open Product Analytics", "/dashboard/products?product=" + slug(product), { productId: product }));
    }
    if (city) {
      actions.push(action("OPEN_CITY", "Open City Analytics", "/dashboard/cities?city=" + slug(city), { city: city }));
    }
    if (!product) {
      actions.push(action("OPEN_PAGE", "Open Account Calculator", "/calculator/account", { section: "calculator" }));
    }
    actions.push(action("OPEN_PAGE", "View Worst Products", "/dashboard/products?sort=worst_ndr", { section: "products", filter: "worst_ndr" }));
    if (context.productScorecards && context.productScorecards.scale && context.productScorecards.scale.length) {
      actions.push(action("OPEN_PAGE", "View Scale Candidates", "/dashboard/products?sort=scale", { section: "products", filter: "scale" }));
    }
    if (actions.length < 4) actions.push(action("OPEN_PAGE", "Open Spend Breakdown", "/dashboard/calculator?view=spend", { section: "calculator" }));
    return actions.slice(0, 4);
  }

  function issueTemplates(context) {
    var h = context.accountHealth || {};
    var p = context.selectedProduct || null;
    var c = context.selectedCity || null;
    var calc = context.localCalculations || {};
    var issues = [];

    if (h.ndr && h.ndr < 20) {
      issues.push({
        key: "low_ndr",
        severity: "high",
        title: "Weak delivery quality is blocking profit",
        body: "Low NDR means too many generated orders are not becoming earned commission. This is usually the first place to fix before adding more traffic."
      });
    }
    if (p && p.ndr < 20) {
      issues.push({
        key: "unstable_product",
        severity: "high",
        title: p.name + " is unstable",
        body: p.name + " has weak delivery quality at " + p.ndr + "% NDR, so any paid traffic on it needs tighter control."
      });
    }
    if (p && p.profit != null && p.profit < 0) {
      issues.push({
        key: "margin_collapse",
        severity: "high",
        title: "Spend is eating the product margin",
        body: "After spend, " + p.name + " is around " + fmt(Math.abs(p.profit)) + " " + (calc.currency || "") + " negative. That points to a CPA or conversion-quality problem, not just a sales-volume problem."
      });
    }
    if (p && p.cpa != null && p.breakEvenCpa) {
      if (p.cpa > p.breakEvenCpa) {
        issues.push({
          key: "high_cpa",
          severity: "high",
          title: "CPA is above break-even CPA",
          body: "CPA is about " + p.cpa + " while break-even CPA is about " + p.breakEvenCpa + " " + (p.breakEvenCurrency || "") + ". Break-even CPA is avg commission times NDR, so scaling this as-is likely increases losses."
        });
      }
    }
    if (!p && h.actualCpa != null && h.breakEvenCpa && h.actualCpa > h.breakEvenCpa) {
      issues.push({
        key: "account_cpa_above_break_even",
        severity: "high",
        title: "Account CPA is above break-even CPA",
        body: "Account CPA is about " + h.actualCpa + " while break-even CPA is about " + h.breakEvenCpa + " " + (h.breakEvenCurrency || "") + ". This means the selected account scope is losing at the current CPA."
      });
    }
    if (c && c.riskScore >= 65) {
      issues.push({
        key: "weak_city",
        severity: "medium",
        title: c.name + " is a risky city",
        body: c.name + " has elevated delivery/COD risk. It may be dragging product performance if it carries meaningful order volume."
      });
    }
    if (h.lostCommission && h.revenue && h.lostCommission > h.revenue) {
      issues.push({
        key: "lost_commission_spike",
        severity: "high",
        title: "Lost commission is larger than earned commission",
        body: "The account is leaking more commission than it earns. That usually means fulfillment quality, confirmation quality, or traffic targeting needs immediate review."
      });
    }
    if (h.refundRate && h.refundRate > 12) {
      issues.push({
        key: "refund_spike",
        severity: "medium",
        title: "Refund pressure is hurting margin",
        body: "Refunds are elevated, which usually means product expectation, quality, or delivery promise needs review before scaling."
      });
    }
    if (h.approvalRate && h.approvalRate < 55) {
      issues.push({
        key: "approval_problem",
        severity: "medium",
        title: "Approval quality is weak",
        body: "Weak approvals reduce the value of incoming orders before delivery even starts. This can make traffic look busy but commercially low quality."
      });
    }
    if (h.trendDirection === "down" || h.performanceDropPct > 20) {
      issues.push({
        key: "trend_deterioration",
        severity: "high",
        title: "Performance is deteriorating",
        body: "Recent trend deterioration suggests the issue is active now, not just historical. Treat this as an operating priority."
      });
    }
    if (context.anomalies && context.anomalies.length) {
      issues.push({
        key: "anomaly_spike",
        severity: "medium",
        title: "Anomaly needs investigation",
        body: String(context.anomalies[0]) + ". Validate whether this came from traffic quality, delivery operations, or product-specific behavior."
      });
    }
    if (context.productScorecards && context.productScorecards.pause && context.productScorecards.pause[0]) {
      issues.push({
        key: "bad_product_cluster",
        severity: "high",
        title: "Some products should be fixed or reduced before scaling",
        body: context.productScorecards.pause[0].product + " is a pause/reduce candidate because " + (context.productScorecards.pause[0].reasons || []).slice(0, 2).join(", ") + "."
      });
    }
    return issues.slice(0, 5);
  }

  function opportunityTemplates(context) {
    var p = context.selectedProduct || null;
    var c = context.selectedCity || null;
    var opportunities = [];

    (context.opportunities || []).slice(0, 3).forEach(function (item) {
      opportunities.push(String(item));
    });
    if (p && p.ndr >= 40 && p.isCpaAboveBreakEven !== true && (p.profit == null || p.profit > 0)) {
      opportunities.push(p.name + " can be tested for controlled scaling because delivery quality is relatively stable and CPA is below break-even.");
    }
    if (c && c.scalingScore >= 60) {
      opportunities.push(c.name + " may be a scale candidate if spend and CPA stay controlled.");
    }
    if (context.productScorecards && context.productScorecards.scale && context.productScorecards.scale[0]) {
      opportunities.push(context.productScorecards.scale[0].product + " is the strongest controlled scale candidate by the current guardrails.");
    }
    return opportunities.slice(0, 4);
  }

  function tipsFor(issues, context) {
    var keys = {};
    issues.forEach(function (i) { keys[i.key] = true; });
    var tips = [];
    if (keys.margin_collapse || keys.high_cpa || keys.account_cpa_above_break_even) tips.push("Reduce or pause spend until CPA is below break-even CPA.");
    if (keys.low_ndr || keys.unstable_product) tips.push("Improve confirmation and delivery workflow before scaling traffic.");
    if (keys.weak_city) tips.push("Inspect city-level delivery/COD patterns and pause weak city targeting if needed.");
    if (keys.refund_spike) tips.push("Review product promise, quality, and refund reasons before increasing traffic.");
    if (keys.approval_problem) tips.push("Improve lead quality and confirmation scripts before optimizing delivery.");
    if (keys.trend_deterioration || keys.anomaly_spike) tips.push("Compare recent performance against the previous period before changing budgets.");
    if (context.selectedProduct) tips.push("Compare this product against your stable-margin winners before increasing budget.");
    if (!tips.length) tips.push("Keep scaling controlled and monitor NDR, CPA, and delivered commission together.");
    return tips.slice(0, 4);
  }

  function recipeFor(context, mode) {
    var playbook = context && context.mediaBuying && context.mediaBuying.playbook;
    var recipes = playbook && playbook.strategyRecipes || {};
    var recipeKey = {
      launch: "launch_test",
      scale: "controlled_scale",
      fix_first: "fix_before_scale",
      pause: "pause_or_reduce",
      creative_reset: "creative_reset",
      city_focus: "city_focus"
    }[mode] || mode;
    return recipes[recipeKey] || recipes.fix_before_scale || {
      mode: mode || "fix_before_scale",
      name: "Operator strategy",
      objective: "sales or website_leads",
      structure: "Keep the setup controlled and judge every change from Taager orders, NDR, CPA, and delivered sales.",
      creatives: "Use practical product demos, problem-solution hooks, and offer hooks.",
      budgetRule: "Use small budget steps until Taager quality is stable.",
      killRule: "Stop or reduce spend when CPA is above break-even or NDR is unsafe.",
      scaleRule: "Scale only after Taager delivery quality and CPA stay stable."
    };
  }

  function selectedProductDecision(context) {
    var selected = context && context.selectedProduct;
    var name = selected && selected.name;
    var cards = context && context.productScorecards || {};
    var all = Array.isArray(cards.all) ? cards.all : [];
    if (name) {
      var wanted = productKey(name);
      var match = all.find(function (item) { return productKey(item.product) === wanted; });
      if (match) return match;
    }
    if (cards.scale && cards.scale[0]) return cards.scale[0];
    if (cards.fixFirst && cards.fixFirst[0]) return cards.fixFirst[0];
    if (cards.pause && cards.pause[0]) return cards.pause[0];
    return null;
  }

  function strategyMode(context, issues) {
    var decision = selectedProductDecision(context);
    var city = context && context.selectedCity;
    var media = context && context.mediaBuying || {};
    if (decision && decision.decision === "scale") return "scale";
    if (decision && decision.decision === "pause") return "pause";
    if (media.creativeSummary && media.creativeSummary.needsNewCreatives && media.creativeSummary.needsNewCreatives.length) return "creative_reset";
    if (city && Number(city.scalingScore || 0) >= 60) return "city_focus";
    if (issues && issues.length) return "fix_first";
    return "launch";
  }

  function buildStrategyPlan(context, issues, opportunities) {
    context = context || {};
    issues = issues || [];
    opportunities = opportunities || [];
    var mode = strategyMode(context, issues);
    var recipe = recipeFor(context, mode);
    var h = context.accountHealth || {};
    var p = context.selectedProduct || null;
    var c = context.selectedCity || null;
    var decision = selectedProductDecision(context);
    var proof = [];
    if (p && p.name) proof.push(p.name + " product focus");
    if (decision && decision.decision) proof.push("product decision: " + decision.decision);
    if (decision && decision.ndr != null) proof.push("product NDR " + pct(decision.ndr) + "%");
    if (decision && decision.cpa != null) proof.push("CPA " + decision.cpa + (decision.breakEvenCpa ? " vs break-even " + decision.breakEvenCpa : ""));
    if (h.ndr) proof.push("account NDR " + pct(h.ndr) + "%");
    if (h.breakEvenCpa) proof.push("account break-even CPA " + h.breakEvenCpa + " " + (h.breakEvenCurrency || "SAR"));
    if (c && c.name) proof.push(c.name + " city score " + fmt(c.scalingScore || c.riskScore));
    if (!proof.length && opportunities[0]) proof.push(opportunities[0]);
    if (!proof.length && issues[0]) proof.push(issues[0].title || issues[0].body);

    return {
      mode: mode,
      recommendation: mode === "scale"
        ? "Use controlled scaling, not aggressive scaling."
        : (mode === "pause" ? "Pause or reduce traffic until the weak signal is fixed." : recipe.name + " is the safest next strategy."),
      proof: proof.slice(0, 5),
      campaignPlan: {
        objective: recipe.objective,
        structure: recipe.structure,
        audience: mode === "city_focus" ? "Prioritize strong KHOD cities and isolate weak cities." : "Keep audience structure simple and compare broad versus strongest proven segments.",
        creativePlan: recipe.creatives
      },
      budgetPlan: {
        startBudget: "Use the user's normal test budget or ask for budget if missing.",
        budgetRule: recipe.budgetRule,
        killRule: recipe.killRule,
        scaleRule: recipe.scaleRule
      },
      watchMetrics: ["CPA", "NDR", "DR", "delivered sales", "lost commission", "break-even CPA"],
      learningSuggestion: null
    };
  }

  function compose(context) {
    context = context || {};
    var h = context.accountHealth || {};
    var p = context.selectedProduct || null;
    var c = context.selectedCity || null;
    var issues = issueTemplates(context);
    var opportunities = opportunityTemplates(context);
    var tips = tipsFor(issues, context);
    var mainInsight;
    var rootCause;
    var strategicInterpretation;

    if (issues.length) {
      mainInsight = issues[0].title + ".";
      rootCause = issues[0].body;
    } else if (opportunities.length) {
      mainInsight = "The current context points more to opportunity than emergency.";
      rootCause = "The strongest positive signal is: " + opportunities[0];
    } else {
      mainInsight = "The dashboard has enough signal for an operator read, but not enough focus for a sharp diagnosis.";
      rootCause = "Narrow the question to a product, city, spend input, or timeframe to isolate the main driver.";
    }

    var relationship = [];
    if (h.deliveredSales) relationship.push("delivered sales " + fmt(h.deliveredSales) + " SAR");
    if (h.deliveredAov) relationship.push("delivered AOV " + fmt(h.deliveredAov) + " SAR");
    if (h.revenue) relationship.push("earned commission " + fmt(h.revenue) + " SAR");
    if (h.lostCommission) relationship.push("lost commission " + fmt(h.lostCommission) + " SAR");
    if (h.ndr) relationship.push("account NDR " + pct(h.ndr) + "%");
    if (h.breakEvenCpa) relationship.push("account break-even CPA " + h.breakEvenCpa + " " + (h.breakEvenCurrency || "SAR"));
    if (h.actualCpa != null) relationship.push("account CPA " + h.actualCpa + " " + (h.breakEvenCurrency || ""));
    if (p && p.deliveredSales) relationship.push("product delivered sales " + fmt(p.deliveredSales) + " SAR");
    if (p && p.deliveredAov) relationship.push("product delivered AOV " + fmt(p.deliveredAov) + " SAR");
    if (p && p.cpa != null) relationship.push("CPA " + p.cpa);
    if (p && p.breakEvenCpa) relationship.push("break-even CPA " + p.breakEvenCpa + " " + (p.breakEvenCurrency || ""));
    if (p && p.marginPct != null) relationship.push("margin " + p.marginPct + "%");
    if (c) relationship.push(c.name + " risk score " + fmt(c.riskScore));

    var kpiRelationship = relationship.length
      ? "The key relationship to watch is " + relationship.join(", ") + ". Treat these together; a good-looking order count can still lose money when delivery quality is weak or CPA is above break-even CPA."
      : "The key is to judge order volume together with delivered sales, delivered AOV, delivery quality, CPA, break-even CPA, and earned commission rather than reading any single KPI alone.";

    strategicInterpretation = issues.length
      ? "Operationally, fix the leak before scaling. More traffic will not solve a weak delivery, CPA above break-even, refund, or approval relationship."
      : "Operationally, use this as a controlled scaling signal, not a reason to increase spend blindly.";

    var message = "Main insight: " + mainInsight +
      "\n\nRoot cause: " + rootCause +
      "\n\nKPI relationship: " + kpiRelationship +
      "\n\nStrategic interpretation: " + strategicInterpretation +
      "\n\nTips:\n" + tips.map(function (tip) { return "- " + tip; }).join("\n");
    var plan = buildStrategyPlan(context, issues, opportunities);
    if (plan && plan.recommendation) {
      message += "\n\nStrategy plan: " + plan.recommendation;
      if (plan.campaignPlan && plan.campaignPlan.structure) message += "\nCampaign: " + plan.campaignPlan.structure;
      if (plan.budgetPlan && plan.budgetPlan.killRule) message += "\nKill rule: " + plan.budgetPlan.killRule;
      if (plan.budgetPlan && plan.budgetPlan.scaleRule) message += "\nScale rule: " + plan.budgetPlan.scaleRule;
    }

    return {
      message: message,
      insights: issues.map(function (issue, idx) {
        return {
          id: "local-strategy-" + issue.key + "-" + idx,
          title: issue.title,
          summary: issue.body,
          severity: issue.severity,
          category: "operator_reasoning",
          confidence: "medium"
        };
      }),
      recommendations: tips.map(function (tip, idx) {
        return {
          id: "local-tip-" + idx,
          title: tip,
          actionType: "operator_tip",
          expectedBenefit: "Improves decision quality before scaling spend.",
          riskLevel: idx === 0 ? "medium" : "low",
          confidence: "medium"
        };
      }),
      alerts: issues.filter(function (issue) { return issue.severity === "high"; }).slice(0, 2).map(function (issue, idx) {
        return {
          id: "local-alert-" + idx,
          title: issue.title,
          urgency: "high",
          reason: issue.body,
          impactedArea: p ? "products" : (c ? "cities" : "account")
        };
      }),
      forecasts: [],
      actions: actionSet(context),
      strategyPlan: plan,
      localReasoning: {
        rootCauses: issues,
        opportunities: opportunities,
        tips: tips
      }
    };
  }

  window.KhodAiLocalReasoningEngine = {
    compose: compose,
    actionSet: actionSet,
    buildStrategyPlan: buildStrategyPlan
  };
})();
