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

  function productKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function isArabic(context) {
    var question = context && context.question || "";
    if (window.KhodAiShared && typeof window.KhodAiShared.responseLanguage === "function") {
      return window.KhodAiShared.responseLanguage(question) === "ar";
    }
    return /[\u0600-\u06ff]/.test(String(question));
  }

  function action(type, label, route, extra) {
    return Object.assign({ type: type, label: label, route: route }, extra || {});
  }

  function actionSet(context) {
    var product = context.selectedProduct && context.selectedProduct.name;
    var city = context.selectedCity && context.selectedCity.name;
    var ar = isArabic(context);
    var actions = [];

    if (product) {
      actions.push(action("OPEN_PAGE", ar ? "فتح حاسبة المنتج" : "Open Product Calculator", "/calculator/product?product=" + slug(product), { section: "productForecast", productId: product }));
      actions.push(action("OPEN_PRODUCT", ar ? "فتح تحليل المنتج" : "Open Product Analytics", "/dashboard/products?product=" + slug(product), { productId: product }));
    }
    if (city) {
      actions.push(action("OPEN_CITY", ar ? "فتح تحليل المدينة" : "Open City Analytics", "/dashboard/cities?city=" + slug(city), { city: city }));
    }
    if (!product) {
      actions.push(action("OPEN_PAGE", ar ? "فتح حاسبة الحساب" : "Open Account Calculator", "/calculator/account", { section: "calculator" }));
    }
    actions.push(action("OPEN_PAGE", ar ? "عرض أضعف المنتجات" : "View Worst Products", "/dashboard/products?sort=worst_ndr", { section: "products", filter: "worst_ndr" }));
    if (context.productScorecards && context.productScorecards.scale && context.productScorecards.scale.length) {
      actions.push(action("OPEN_PAGE", ar ? "عرض مرشحي التوسع" : "View Scale Candidates", "/dashboard/products?sort=scale", { section: "products", filter: "scale" }));
    }
    if (actions.length < 4) actions.push(action("OPEN_PAGE", ar ? "فتح تفاصيل الإنفاق" : "Open Spend Breakdown", "/dashboard/calculator?view=spend", { section: "calculator" }));
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
    var ar = isArabic(context);
    var proof = [];
    if (p && p.name) proof.push(ar ? "المنتج المحدد: " + p.name : p.name + " product focus");
    if (decision && decision.decision) proof.push(ar ? "قرار المنتج: " + decision.decision : "product decision: " + decision.decision);
    if (decision && decision.ndr != null) proof.push((ar ? "NDR للمنتج " : "product NDR ") + pct(decision.ndr) + "%");
    if (decision && decision.cpa != null) proof.push("CPA " + decision.cpa + (decision.breakEvenCpa ? (ar ? " مقابل CPA التعادل " : " vs break-even ") + decision.breakEvenCpa : ""));
    if (h.ndr) proof.push((ar ? "NDR للحساب " : "account NDR ") + pct(h.ndr) + "%");
    if (h.breakEvenCpa) proof.push((ar ? "CPA التعادل للحساب " : "account break-even CPA ") + h.breakEvenCpa + " " + (h.breakEvenCurrency || "SAR"));
    if (c && c.name) proof.push(c.name + (ar ? "، درجة التوسع " : " city scaling score ") + fmt(c.scalingScore || 0) + "/100");
    if (!proof.length && opportunities[0]) proof.push(opportunities[0]);
    if (!proof.length && issues[0]) proof.push(issues[0].title || issues[0].body);

    return {
      mode: mode,
      recommendation: ar
        ? (mode === "scale"
          ? "استخدم توسعًا تدريجيًا ومراقبًا."
          : (mode === "pause" ? "أوقف أو خفّض الزيارات حتى تعالج الإشارة الضعيفة." : "ابدأ بإصلاح نقطة الضعف قبل زيادة الميزانية."))
        : (mode === "scale"
          ? "Use controlled scaling, not aggressive scaling."
          : (mode === "pause" ? "Pause or reduce traffic until the weak signal is fixed." : recipe.name + " is the safest next strategy.")),
      proof: proof.slice(0, 5),
      campaignPlan: {
        objective: ar ? "المبيعات" : recipe.objective,
        structure: ar ? "استخدم اختبارًا بسيطًا ومحدودًا، واحكم عليه من الطلبات وNDR وCPA والمبيعات المسلمة." : recipe.structure,
        audience: ar
          ? (mode === "city_focus" ? "ركز على المدن القوية وافصل المدن الضعيفة في مجموعة مستقلة." : "اجعل تقسيم الجمهور بسيطًا وقارن الجمهور الواسع بأقوى شريحة مثبتة.")
          : (mode === "city_focus" ? "Prioritize strong KHOD cities and isolate weak cities." : "Keep audience structure simple and compare broad versus strongest proven segments."),
        creativePlan: ar ? "استخدم عرضًا واضحًا للمنتج ورسالة مباشرة للمشكلة والحل." : recipe.creatives
      },
      budgetPlan: {
        startBudget: ar ? "ابدأ بميزانية اختبار صغيرة، أو اطلب الميزانية إذا لم تكن معروفة." : "Use the user's normal test budget or ask for budget if missing.",
        budgetRule: ar ? "غيّر الميزانية تدريجيًا فقط بعد استقرار جودة الطلبات." : recipe.budgetRule,
        killRule: ar ? "أوقف الاختبار إذا تجاوز CPA نقطة التعادل أو انخفض NDR بوضوح." : recipe.killRule,
        scaleRule: ar ? "وسّع فقط بعد ثبات NDR وCPA والمبيعات المسلمة." : recipe.scaleRule
      },
      watchMetrics: ar ? ["CPA", "NDR", "DR", "المبيعات المسلمة", "العمولة المفقودة", "CPA التعادل"] : ["CPA", "NDR", "DR", "delivered sales", "lost commission", "break-even CPA"],
      learningSuggestion: null
    };
  }

  function arabicIssueText(issue, context) {
    var h = context.accountHealth || {};
    var p = context.selectedProduct || null;
    var c = context.selectedCity || null;
    var key = issue && issue.key || "";
    if (key === "high_cpa" || key === "account_cpa_above_break_even") return "تكلفة الاكتساب أعلى من نقطة التعادل، لذلك زيادة الإنفاق الآن قد تزيد الخسارة.";
    if (key === "low_ndr" || key === "unstable_product") return "معدل NDR ضعيف، وهذا يعني أن نسبة كبيرة من الطلبات لا تتحول إلى طلبات مسلمة.";
    if (key === "weak_city" && c) return c.name + " تحمل مخاطرة تشغيلية مرتفعة، خصوصًا في جودة التسليم والدفع عند الاستلام.";
    if (key === "lost_commission_spike") return "العمولة المفقودة أعلى من العمولة المكتسبة، وهذه هي أهم نقطة يجب إصلاحها الآن.";
    if (key === "margin_collapse" && p) return "الإنفاق الحالي يستهلك هامش " + p.name + ".";
    if (key === "bad_product_cluster") return "هناك منتجات تحتاج إلى إصلاح أو خفض الزيارات قبل التفكير في التوسع.";
    if (h.ndr) return "البيانات الحالية تشير إلى أن جودة التسليم تحتاج إلى متابعة قبل التوسع.";
    return "البيانات الحالية تحتاج إلى نطاق أوضح للوصول إلى قرار أدق.";
  }

  function composeArabic(context, issues, opportunities) {
    var h = context.accountHealth || {};
    var p = context.selectedProduct || null;
    var c = context.selectedCity || null;
    var issue = issues[0] || null;
    var answer = issue
      ? arabicIssueText(issue, context)
      : (opportunities[0] ? "هناك فرصة جيدة، لكن الأفضل تنفيذها كتجربة صغيرة ومراقبة." : "أستطيع قراءة البيانات، لكن أحتاج هدفًا أكثر تحديدًا للوصول إلى قرار حاسم.");
    if (c && c.name) answer = "بالنسبة إلى " + c.name + "، " + answer;
    if (p && p.name) answer = "بالنسبة إلى " + p.name + "، " + answer;

    var facts = [];
    if (c) {
      facts.push("عدد الطلبات " + fmt(c.orders));
      facts.push("NDR " + pct(c.ndr) + "%");
      facts.push("درجة المخاطر " + fmt(c.riskScore) + "/100");
      facts.push("درجة التوسع " + fmt(c.scalingScore) + "/100");
    } else if (p) {
      facts.push("عدد الطلبات " + fmt(p.orders));
      facts.push("NDR " + pct(p.ndr) + "%");
      if (p.cpa != null) facts.push("CPA " + p.cpa + " " + (p.breakEvenCurrency || ""));
      if (p.breakEvenCpa) facts.push("CPA التعادل " + p.breakEvenCpa + " " + (p.breakEvenCurrency || ""));
    } else {
      if (h.ndr) facts.push("NDR للحساب " + pct(h.ndr) + "%");
      if (h.deliveredSales) facts.push("المبيعات المسلمة " + fmt(h.deliveredSales) + " SAR");
      if (h.lostCommission) facts.push("العمولة المفقودة " + fmt(h.lostCommission) + " SAR");
      if (h.actualCpa != null) facts.push("CPA " + h.actualCpa + " " + (h.breakEvenCurrency || ""));
    }

    var next = issue && (issue.key === "high_cpa" || issue.key === "account_cpa_above_break_even")
      ? "خفّض الإنفاق أو أوقفه مؤقتًا حتى يصبح CPA أقل من CPA التعادل."
      : (issue && issue.key === "weak_city"
        ? "قارن شركات الشحن ونسب الإلغاء داخل المدينة، ثم افصلها في اختبار مستقل قبل زيادة الميزانية."
        : "ابدأ بأكبر نقطة ضعف، راقب النتيجة لعدة أيام، ثم وسّع تدريجيًا فقط إذا استقرت المؤشرات.");

    return answer +
      (facts.length ? "\n\nالأرقام التي اعتمدت عليها: " + facts.join("، ") + "." : "") +
      "\n\nالخطوة التالية: " + next;
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

    if (isArabic(context)) {
      var arabicPlan = buildStrategyPlan(context, issues, opportunities);
      return {
        message: composeArabic(context, issues, opportunities),
        insights: [],
        recommendations: [],
        alerts: [],
        forecasts: [],
        actions: actionSet(context),
        strategyPlan: arabicPlan,
        localReasoning: { rootCauses: issues, opportunities: opportunities, tips: tips }
      };
    }

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

    var message = mainInsight +
      "\n\nWhy: " + rootCause +
      "\n\nThe numbers I used: " + kpiRelationship.replace(/^The key relationship to watch is /, "").replace(/^The key is to /, "") +
      "\n\nWhat I recommend: " + (tips[0] || strategicInterpretation);
    var plan = buildStrategyPlan(context, issues, opportunities);

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
