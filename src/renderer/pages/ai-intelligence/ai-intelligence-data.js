(function () {
  "use strict";

  function tr(key, params, fallback) {
    var value = window.dashboardI18n ? window.dashboardI18n.t(key, params || null) : key;
    return value && value !== key ? value : (fallback || key);
  }

  function number(value, opts) {
    if (window.dashboardI18n) return window.dashboardI18n.number(Number(value || 0), opts || {});
    return Number(value || 0).toLocaleString("en-US", opts || {});
  }

  function metricValue(value) {
    if (value && typeof value === "object" && value.value != null) return Number(value.value || 0);
    return Number(value || 0);
  }

  function escId(value) {
    return String(value == null ? "" : value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  function pct(value) {
    return number(value, { maximumFractionDigits: 1 }) + "%";
  }

  function explanation(why, signals, nextStep, confidence, limitations) {
    return {
      why: why || tr("aii.explain.defaultWhy", null, "This signal is based on current dashboard data."),
      signals: (signals || []).filter(Boolean).slice(0, 4),
      confidence: confidence || "medium",
      limitations: (limitations || []).filter(Boolean).slice(0, 3),
      nextStep: nextStep || tr("aii.explain.defaultNext", null, "Review the related dashboard area before acting."),
    };
  }

  function action(type, label, extra) {
    return Object.assign({ type: type || "NAVIGATE", label: label || tr("ai.action.openSection", null, "Open section") }, extra || {});
  }

  function insight(opts) {
    opts = opts || {};
    var title = opts.title || tr("aii.insight.title", null, "Business signal");
    return {
      id: opts.id || "insight-" + escId(title),
      title: title,
      summary: opts.summary || "",
      category: opts.category || "info",
      severity: opts.severity || "info",
      sourceArea: opts.sourceArea || "dashboard",
      evidence: (opts.evidence || []).filter(Boolean).slice(0, 4),
      explanation: opts.explanation || explanation(),
      nextAction: opts.nextAction || action("NAVIGATE", tr("ai.action.openSection", null, "Open section"), { section: "master" }),
      freshnessLabel: opts.freshnessLabel || tr("aii.freshness.current", null, "Current dashboard snapshot"),
      confidence: opts.confidence || "medium",
    };
  }

  function recommendation(opts) {
    opts = opts || {};
    return {
      id: opts.id || "rec-" + escId(opts.title || "review"),
      title: opts.title || tr("aii.recommend.review", null, "Review this signal"),
      actionType: opts.actionType || "review",
      expectedBenefit: opts.expectedBenefit || tr("aii.recommend.benefit", null, "Better decision quality"),
      riskLevel: opts.riskLevel || "medium",
      confidence: opts.confidence || "medium",
      evidence: (opts.evidence || []).filter(Boolean).slice(0, 4),
      explanation: normalizeExplanation(opts.explanation, {
        why: opts.expectedBenefit || opts.title,
        signals: opts.evidence || [],
        confidence: opts.confidence || "medium",
      }),
      primaryActionLabel: opts.primaryActionLabel || tr("aii.action.review", null, "Review"),
      action: opts.action || action("NAVIGATE", tr("aii.action.review", null, "Review"), { section: "master" }),
      status: opts.status || "new",
    };
  }

  function forecast(opts) {
    opts = opts || {};
    return {
      id: opts.id || "forecast-" + escId(opts.title || opts.forecastType || "forecast"),
      title: opts.title || tr("aii.forecast.title", null, "Forecast"),
      forecastType: opts.forecastType || "growth_probability",
      horizonLabel: opts.horizonLabel || tr("aii.forecast.horizon", null, "Next period"),
      valueLabel: opts.valueLabel || tr("aii.forecast.limited", null, "Needs more data"),
      trend: opts.trend || "unknown",
      assumptions: (opts.assumptions || []).filter(Boolean).slice(0, 4),
      influencingSignals: (opts.influencingSignals || []).filter(Boolean).slice(0, 4),
      confidence: opts.confidence || "limited",
      explanation: normalizeExplanation(opts.explanation, {
        why: opts.valueLabel || opts.title,
        signals: opts.influencingSignals || [],
        confidence: opts.confidence || "limited",
      }),
      recommendedFollowUp: opts.recommendedFollowUp || tr("aii.forecast.followUp", null, "Review recent product and city performance."),
    };
  }

  function alert(opts) {
    opts = opts || {};
    return {
      id: opts.id || "alert-" + escId(opts.title || "alert"),
      title: opts.title || tr("aii.alert.title", null, "Important alert"),
      urgency: opts.urgency || "medium",
      severity: opts.urgency || opts.severity || "medium",
      riskLevel: opts.urgency || opts.riskLevel || "medium",
      confidence: opts.confidence || "medium",
      impactedArea: opts.impactedArea || "dashboard",
      reason: opts.reason || "",
      evidence: (opts.evidence || []).filter(Boolean).slice(0, 4),
      resolutionPath: opts.resolutionPath || tr("aii.action.review", null, "Review"),
      explanation: normalizeExplanation(opts.explanation, {
        why: opts.reason || opts.title,
        signals: opts.evidence || [],
        confidence: opts.confidence || "medium",
      }),
    };
  }

  function normalizeExplanation(value, fallback) {
    var src = value && typeof value === "object" ? value : {};
    fallback = fallback || {};
    return explanation(
      src.why || fallback.why,
      Array.isArray(src.signals) ? src.signals : fallback.signals,
      src.nextStep || fallback.nextStep,
      src.confidence || fallback.confidence || "limited",
      Array.isArray(src.limitations) ? src.limitations : fallback.limitations
    );
  }

  function normalizeInsight(value, idx) {
    if (typeof value === "string") {
      return insight({
        id: "ai-response-" + idx,
        title: tr("aii.insight.aiResponse", null, "AI response insight"),
        summary: value,
        category: "info",
        severity: "info",
        confidence: "limited",
        explanation: explanation(
          tr("aii.explain.legacyWhy", null, "The AI returned this as a text insight."),
          [value],
          tr("aii.explain.legacyNext", null, "Use it as guidance and confirm with dashboard data."),
          "limited",
          [tr("aii.explain.legacyLimit", null, "Detailed evidence was not returned for this item.")]
        ),
      });
    }
    var src = value && typeof value === "object" ? value : {};
    return insight({
      id: src.id || ("ai-response-" + idx),
      title: src.title || tr("aii.insight.aiResponse", null, "AI response insight"),
      summary: src.summary || src.message || "",
      category: src.category || "info",
      severity: src.severity || "info",
      sourceArea: src.sourceArea || "ai",
      evidence: Array.isArray(src.evidence) ? src.evidence : [],
      explanation: normalizeExplanation(src.explanation, {
        why: src.summary || src.title,
        signals: src.evidence || [],
        confidence: src.confidence || "limited",
      }),
      nextAction: src.action || src.nextAction || null,
      confidence: src.confidence || "limited",
    });
  }

  function buildLocalIntelligence(opts) {
    opts = opts || {};
    var data = opts.data || window.dashboardGeoData || {};
    var context = opts.context || (window.getDashboardAiContext ? window.getDashboardAiContext({ data: data }) : (window.buildDashboardAiContext ? window.buildDashboardAiContext({ data: data }) : {}));
    var products = (context.products || []).slice();
    var cities = (context.cities || []).slice();
    var roi = context.kpis && context.kpis.roi ? context.kpis.roi : {};
    var overview = context.kpis && context.kpis.overview ? context.kpis.overview : {};
    var insights = [];
    var recommendations = [];
    var forecasts = [];
    var alerts = [];

    var worstProduct = products.slice().sort(function (a, b) { return a.ndrPct - b.ndrPct; })[0];
    var topProduct = products.slice().sort(function (a, b) { return b.commission - a.commission; })[0];
    var riskyCity = cities.slice().sort(function (a, b) { return b.riskScore - a.riskScore; })[0];
    var scaleCity = cities.slice().sort(function (a, b) { return b.scalingScore - a.scalingScore; })[0];

    if (worstProduct) {
      var weakNdr = worstProduct.ndrPct < 20;
      var title = weakNdr
        ? tr("aii.insight.weakProduct", { product: worstProduct.name }, "Weak delivery product")
        : tr("aii.insight.productWatch", { product: worstProduct.name }, "Product needs review");
      var why = tr("aii.explain.weakProductWhy", { product: worstProduct.name }, worstProduct.name + " has the weakest NDR in the current product list.");
      var signals = [
        tr("aii.signal.ndr", { value: pct(worstProduct.ndrPct) }, "NDR: " + pct(worstProduct.ndrPct)),
        tr("aii.signal.orders", { value: number(worstProduct.orders) }, "Orders: " + number(worstProduct.orders)),
        worstProduct.commission ? tr("aii.signal.commission", { value: number(worstProduct.commission) }, "Commission: " + number(worstProduct.commission)) : "",
      ];
      insights.push(insight({
        id: "product-risk-" + escId(worstProduct.id || worstProduct.name),
        title: title,
        summary: tr("aii.summary.weakProduct", { product: worstProduct.name, value: pct(worstProduct.ndrPct) }, worstProduct.name + " is the weakest delivery-quality product at " + pct(worstProduct.ndrPct) + "."),
        category: "ndr",
        severity: weakNdr ? "warning" : "watch",
        sourceArea: "products",
        evidence: signals,
        confidence: worstProduct.orders >= 10 ? "high" : "medium",
        explanation: explanation(why, signals, tr("aii.next.productRisk", null, "Review product performance before scaling spend."), worstProduct.orders >= 10 ? "high" : "medium"),
        nextAction: action("OPEN_PRODUCT", tr("ai.action.openProduct", null, "Open product"), { productId: worstProduct.id }),
      }));
      if (weakNdr) {
        alerts.push(alert({
          id: "alert-product-risk-" + escId(worstProduct.id || worstProduct.name),
          title: tr("aii.alert.productRisk", null, "Product risk needs attention"),
          urgency: "high",
          impactedArea: "products",
          reason: why,
          evidence: signals,
          resolutionPath: tr("aii.next.productRisk", null, "Review product performance before scaling spend."),
          confidence: worstProduct.orders >= 10 ? "high" : "medium",
        }));
        recommendations.push(recommendation({
          id: "rec-pause-" + escId(worstProduct.id || worstProduct.name),
          title: tr("aii.recommend.pauseProduct", null, "Pause aggressive scaling"),
          actionType: "pause_product",
          expectedBenefit: tr("aii.benefit.reduceWaste", null, "Reduce wasted spend while delivery quality is weak."),
          riskLevel: "medium",
          confidence: worstProduct.orders >= 10 ? "high" : "medium",
          evidence: signals,
          explanation: explanation(why, signals, tr("aii.next.productRisk", null, "Review product performance before scaling spend."), worstProduct.orders >= 10 ? "high" : "medium"),
          primaryActionLabel: tr("ai.action.openProduct", null, "Open product"),
          action: action("OPEN_PRODUCT", tr("ai.action.openProduct", null, "Open product"), { productId: worstProduct.id }),
        }));
      }
    }

    if (topProduct) {
      var scaleSignals = [
        tr("aii.signal.commission", { value: number(topProduct.commission) }, "Commission: " + number(topProduct.commission)),
        tr("aii.signal.ndr", { value: pct(topProduct.ndrPct) }, "NDR: " + pct(topProduct.ndrPct)),
      ];
      insights.push(insight({
        id: "scale-product-" + escId(topProduct.id || topProduct.name),
        title: tr("aii.insight.scaleProduct", null, "Product scaling opportunity"),
        summary: tr("aii.summary.scaleProduct", { product: topProduct.name }, topProduct.name + " leads current commission contribution."),
        category: "opportunity",
        severity: "positive",
        sourceArea: "products",
        evidence: scaleSignals,
        confidence: topProduct.commission > 0 ? "high" : "medium",
        explanation: explanation(tr("aii.explain.scaleProductWhy", { product: topProduct.name }, topProduct.name + " has the strongest commission signal."), scaleSignals, tr("aii.next.scaleProduct", null, "Review product quality and test controlled scaling."), topProduct.commission > 0 ? "high" : "medium"),
        nextAction: action("OPEN_PRODUCT", tr("ai.action.openProduct", null, "Open product"), { productId: topProduct.id }),
      }));
      recommendations.push(recommendation({
        id: "rec-scale-" + escId(topProduct.id || topProduct.name),
        title: tr("aii.recommend.scaleProduct", null, "Test controlled scaling"),
        actionType: "scale_product",
        expectedBenefit: tr("aii.benefit.scaleWinner", null, "Grow the strongest commission source without losing control."),
        riskLevel: Number(topProduct.ndrPct || 0) >= 40 ? "low" : "medium",
        confidence: "medium",
        evidence: scaleSignals,
        explanation: explanation(tr("aii.explain.scaleProductWhy", { product: topProduct.name }, topProduct.name + " has the strongest commission signal."), scaleSignals, tr("aii.next.scaleProduct", null, "Review product quality and test controlled scaling."), "medium"),
        primaryActionLabel: tr("ai.action.openProduct", null, "Open product"),
        action: action("OPEN_PRODUCT", tr("ai.action.openProduct", null, "Open product"), { productId: topProduct.id }),
      }));
    }

    if (riskyCity) {
      var citySignals = [
        tr("aii.signal.cityRisk", { value: number(riskyCity.riskScore) }, "Risk score: " + number(riskyCity.riskScore)),
        tr("aii.signal.dr", { value: pct(riskyCity.drPct) }, "Delivery rate: " + pct(riskyCity.drPct)),
        tr("aii.signal.cod", { value: pct(riskyCity.codPct) }, "COD share: " + pct(riskyCity.codPct)),
      ];
      insights.push(insight({
        id: "city-risk-" + escId(riskyCity.city),
        title: tr("aii.insight.cityRisk", null, "City risk signal"),
        summary: tr("aii.summary.cityRisk", { city: riskyCity.city }, riskyCity.city + " is the highest current city risk."),
        category: "delivery",
        severity: riskyCity.riskScore > 65 ? "warning" : "watch",
        sourceArea: "cities",
        evidence: citySignals,
        confidence: riskyCity.orders >= 10 ? "high" : "medium",
        explanation: explanation(tr("aii.explain.cityRiskWhy", { city: riskyCity.city }, riskyCity.city + " has the highest risk score in the city data."), citySignals, tr("aii.next.cityRisk", null, "Inspect delivery and COD patterns before increasing spend."), riskyCity.orders >= 10 ? "high" : "medium"),
        nextAction: action("OPEN_CITY", tr("ai.action.openCity", null, "Open city"), { city: riskyCity.city }),
      }));
      recommendations.push(recommendation({
        id: "rec-shipping-" + escId(riskyCity.city),
        title: tr("aii.recommend.optimizeShipping", null, "Optimize shipping quality"),
        actionType: "optimize_shipping",
        expectedBenefit: tr("aii.benefit.shipping", null, "Reduce delivery leakage in the riskiest city."),
        riskLevel: riskyCity.riskScore > 65 ? "high" : "medium",
        confidence: riskyCity.orders >= 10 ? "high" : "medium",
        evidence: citySignals,
        explanation: explanation(tr("aii.explain.cityRiskWhy", { city: riskyCity.city }, riskyCity.city + " has the highest risk score in the city data."), citySignals, tr("aii.next.optimizeShipping", null, "Review carrier performance and active orders for this city."), riskyCity.orders >= 10 ? "high" : "medium"),
        primaryActionLabel: tr("ai.action.openCity", null, "Open city"),
        action: action("OPEN_CITY", tr("ai.action.openCity", null, "Open city"), { city: riskyCity.city }),
      }));
      if (Number(riskyCity.codPct || 0) >= 60) {
        recommendations.push(recommendation({
          id: "rec-cod-" + escId(riskyCity.city),
          title: tr("aii.recommend.improveCod", null, "Improve COD follow-up"),
          actionType: "improve_cod",
          expectedBenefit: tr("aii.benefit.cod", null, "Protect cash collection before scaling COD-heavy demand."),
          riskLevel: "medium",
          confidence: "medium",
          evidence: citySignals,
          explanation: explanation(tr("aii.explain.codWhy", { city: riskyCity.city }, riskyCity.city + " has a COD-heavy risk profile."), citySignals, tr("aii.next.improveCod", null, "Check COD confirmation and delivery follow-up before adding spend."), "medium"),
          primaryActionLabel: tr("ai.action.openCity", null, "Open city"),
          action: action("OPEN_CITY", tr("ai.action.openCity", null, "Open city"), { city: riskyCity.city }),
        }));
      }
    }

    if (scaleCity) {
      var cityScaleSignals = [
        tr("aii.signal.cityScale", { value: number(scaleCity.scalingScore) }, "Scale score: " + number(scaleCity.scalingScore)),
        tr("aii.signal.commission", { value: number(scaleCity.earnedCommission) }, "Commission: " + number(scaleCity.earnedCommission)),
      ];
      recommendations.push(recommendation({
        id: "rec-city-" + escId(scaleCity.city),
        title: tr("aii.recommend.targetCity", null, "Target a stronger city"),
        actionType: "target_city",
        expectedBenefit: tr("aii.benefit.cityScale", null, "Focus growth where delivery and commission signals are stronger."),
        riskLevel: "low",
        confidence: scaleCity.orders >= 10 ? "high" : "medium",
        evidence: cityScaleSignals,
        explanation: explanation(tr("aii.explain.cityScaleWhy", { city: scaleCity.city }, scaleCity.city + " has the strongest scaling score."), cityScaleSignals, tr("aii.next.cityScale", null, "Review city details and compare nearby demand."), scaleCity.orders >= 10 ? "high" : "medium"),
        primaryActionLabel: tr("ai.action.openCity", null, "Open city"),
        action: action("OPEN_CITY", tr("ai.action.openCity", null, "Open city"), { city: scaleCity.city }),
      }));
    }

    if (roi && (roi.avgCPA || roi.adSpend || roi.avgCommission)) {
      var roiSignals = [
        roi.avgCPA ? tr("aii.signal.cpa", { value: number(roi.avgCPA) }, "CPA: " + number(roi.avgCPA)) : "",
        roi.avgCommission ? tr("aii.signal.avgCommission", { value: number(roi.avgCommission) }, "Average commission: " + number(roi.avgCommission)) : "",
      ];
      if (roi.avgCPA && roi.avgCommission && Number(roi.avgCPA) > Number(roi.avgCommission)) {
        recommendations.push(recommendation({
          id: "rec-budget-roi",
          title: tr("aii.recommend.increaseBudgetCarefully", null, "Adjust budget only after ROI review"),
          actionType: "increase_budget",
          expectedBenefit: tr("aii.benefit.budget", null, "Avoid scaling spend while acquisition cost is above commission."),
          riskLevel: "high",
          confidence: "medium",
          evidence: roiSignals,
          explanation: explanation(tr("aii.explain.roi.why", null, "The signal appeared because ROI or CPA needs review before increasing spend."), roiSignals, tr("aii.next.reviewRoi", null, "Review CPA and break-even before scaling budget."), "medium"),
          primaryActionLabel: tr("ai.action.openSection", null, "Open section"),
          action: action("NAVIGATE", tr("ai.action.openSection", null, "Open section"), { section: "calculator" }),
        }));
      }
      forecasts.push(forecast({
        id: "forecast-roi",
        title: tr("aii.forecast.roiTitle", null, "ROI pressure forecast"),
        forecastType: "risk",
        valueLabel: roi.avgCPA && roi.avgCommission && Number(roi.avgCPA) > Number(roi.avgCommission)
          ? tr("aii.forecast.marginRisk", null, "Margin risk if CPA stays above commission.")
          : tr("aii.forecast.stable", null, "Current ROI signals look manageable."),
        trend: roi.avgCPA && roi.avgCommission && Number(roi.avgCPA) > Number(roi.avgCommission) ? "down" : "flat",
        assumptions: [tr("aii.assumption.currentMix", null, "Current product and city mix remains similar.")],
        influencingSignals: roiSignals,
        confidence: roi.avgCPA && roi.avgCommission ? "medium" : "limited",
        recommendedFollowUp: tr("aii.next.roi", null, "Compare CPA against delivered commission before budget changes."),
        limitations: roi.avgCPA && roi.avgCommission ? [] : [tr("aii.limit.roi", null, "ROI data is incomplete.")],
      }));
    }

    var totalOrders = metricValue(overview.totalOrders);
    var earnedCommission = metricValue(overview.earnedCommission || roi.earnedCommission);
    var avgCommission = Number(roi.avgCommission || (products.length ? products.reduce(function (sum, p) { return sum + Number(p.commission || 0); }, 0) / Math.max(1, products.length) : 0));
    forecasts.push(forecast({
      id: "forecast-sales",
      title: tr("aii.forecast.sales.title", null, "Short-term sales forecast"),
      forecastType: "sales",
      valueLabel: totalOrders ? tr("aii.forecast.sales.value", { value: number(Math.round(totalOrders * 1.08)) }, number(Math.round(totalOrders * 1.08)) + " expected orders") : tr("aii.forecast.limited", null, "Needs more data"),
      trend: totalOrders ? "up" : "unknown",
      assumptions: [tr("aii.assumption.currentMix", null, "Current product and city mix remains similar.")],
      influencingSignals: [totalOrders ? tr("aii.signal.orders", { value: number(totalOrders) }, "Orders: " + number(totalOrders)) : ""],
      confidence: totalOrders >= 40 ? "medium" : "limited",
      recommendedFollowUp: tr("aii.next.reviewDemand", null, "Compare demand with recent product and city quality before stocking or scaling."),
    }));
    forecasts.push(forecast({
      id: "forecast-commission",
      title: tr("aii.forecast.commission.title", null, "Commission forecast"),
      forecastType: "commission",
      valueLabel: earnedCommission ? tr("aii.forecast.commission.value", { value: number(Math.round(earnedCommission * 1.06)) }, number(Math.round(earnedCommission * 1.06)) + " SAR potential") : tr("aii.forecast.limited", null, "Needs more data"),
      trend: earnedCommission ? "up" : "unknown",
      assumptions: [tr("aii.assumption.currentMix", null, "Current product and city mix remains similar.")],
      influencingSignals: [earnedCommission ? tr("aii.signal.commission", { value: number(earnedCommission) }, "Commission: " + number(earnedCommission)) : ""],
      confidence: earnedCommission > 0 ? "medium" : "limited",
      recommendedFollowUp: tr("aii.next.reviewCommission", null, "Protect commission quality by reviewing NDR and CPA together."),
    }));
    forecasts.push(forecast({
      id: "forecast-inventory",
      title: tr("aii.forecast.inventory.title", null, "Inventory planning signal"),
      forecastType: "inventory",
      valueLabel: topProduct ? tr("aii.forecast.inventory.value", { product: topProduct.name }, topProduct.name + " needs availability review") : tr("aii.forecast.limited", null, "Needs more data"),
      trend: topProduct ? "watch" : "unknown",
      assumptions: [tr("aii.limit.noLiveInventory", null, "No live inventory read; use this as a planning signal only.")],
      influencingSignals: topProduct ? [tr("aii.signal.orders", { value: number(topProduct.orders) }, "Orders: " + number(topProduct.orders)), tr("aii.signal.commission", { value: number(topProduct.commission) }, "Commission: " + number(topProduct.commission))] : [],
      confidence: "limited",
      recommendedFollowUp: tr("aii.next.reviewInventory", null, "Check stock manually before increasing demand."),
    }));
    forecasts.push(forecast({
      id: "forecast-growth",
      title: tr("aii.forecast.growth.title", null, "Growth probability"),
      forecastType: "growth_probability",
      valueLabel: tr("aii.forecast.growth.value", { value: number(Math.round(Math.max(0, Math.min(100, (topProduct ? 45 : 10) + (scaleCity ? Number(scaleCity.scalingScore || 0) * 0.45 : 10))))) }, "Growth probability available"),
      trend: scaleCity || topProduct ? "up" : "unknown",
      assumptions: [tr("aii.assumption.currentMix", null, "Current product and city mix remains similar.")],
      influencingSignals: [topProduct ? topProduct.name : "", scaleCity ? scaleCity.city : ""],
      confidence: topProduct && scaleCity ? "medium" : "limited",
      recommendedFollowUp: tr("aii.next.scaleProduct", null, "Review product quality and test controlled scaling."),
    }));

    if (!forecasts.length) {
      forecasts.push(forecast({
        id: "forecast-limited",
        title: tr("aii.forecast.limitedTitle", null, "Forecast limited"),
        valueLabel: tr("aii.forecast.needsMore", null, "Needs more dashboard history"),
        assumptions: [tr("aii.assumption.needHistory", null, "Forecast quality improves with more recent order history.")],
        influencingSignals: [],
        confidence: "limited",
        limitations: [tr("aii.limit.forecast", null, "Not enough reliable forecast inputs are available.")],
      }));
    }

    var healthScore = Math.round(Math.max(0, Math.min(100,
      (topProduct ? Math.min(40, Number(topProduct.ndrPct || 0) * 0.4) : 20) +
      (scaleCity ? Math.min(30, Number(scaleCity.scalingScore || 0) * 0.3) : 15) +
      (alerts.length ? 10 : 30)
    )));

    return {
      context: context,
      insights: insights,
      recommendations: recommendations,
      forecasts: forecasts,
      alerts: alerts,
      health: {
        score: healthScore,
        label: healthScore >= 72 ? tr("aii.health.strong", null, "Strong") : (healthScore >= 48 ? tr("aii.health.watch", null, "Watch") : tr("aii.health.risk", null, "Risk")),
      },
      opportunityScore: Math.round(Math.max(0, Math.min(100, (topProduct ? 45 : 10) + (scaleCity ? Number(scaleCity.scalingScore || 0) * 0.45 : 10)))),
      state: insights.length || recommendations.length ? "populated" : "empty",
    };
  }

  function normalizeAiResponse(response) {
    var src = response && typeof response === "object" ? response : {};
    return {
      message: src.message || "",
      insights: (Array.isArray(src.insights) ? src.insights : []).map(normalizeInsight),
      recommendations: (Array.isArray(src.recommendations) ? src.recommendations : []).map(function (item) { return recommendation(item); }),
      forecasts: (Array.isArray(src.forecasts) ? src.forecasts : []).map(function (item) { return forecast(item); }),
      alerts: (Array.isArray(src.alerts) ? src.alerts : []).map(function (item) { return alert(item); }),
      actions: Array.isArray(src.actions) ? src.actions : [],
      decision: src.decision || null,
      strategyPlan: src.strategyPlan || null,
      workflow: src.workflow || null,
      followUpQuestions: Array.isArray(src.followUpQuestions) ? src.followUpQuestions : [],
      memoryUpdates: src.memoryUpdates || null,
    };
  }

  window.KhodAiIntelligenceData = {
    build: buildLocalIntelligence,
    normalizeAiResponse: normalizeAiResponse,
    normalizeExplanation: normalizeExplanation,
    explanation: explanation,
    insight: insight,
    recommendation: recommendation,
    forecast: forecast,
    alert: alert,
  };
})();
