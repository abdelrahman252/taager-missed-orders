(function () {
  "use strict";

  var rootRef = null;
  var dataRef = null;
  var ctxRef = null;
  var isOpen = false;
  var lastState = null;
  var popupMessages = [];
  var popupBusy = false;
  var popupRequestSeq = 0;
  var popupInjectedAi = { insights: [], recommendations: [], forecasts: [], alerts: [] };
  var assistantMemory = null;
  var popupFollowUps = [];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function metricTone(label, value) {
    label = String(label || "").toLowerCase();
    value = Number(value || 0);
    if (/\b(cancel|canceled|failed|lost|loss|cpa)\b/.test(label)) {
      return value >= 30 ? "bad" : value >= 15 ? "warn" : "good";
    }
    if (/\b(ndr|delivery|delivered|dr|confirmation|profit|earned|commission)\b/.test(label)) {
      return value >= 40 ? "top" : value >= 30 ? "good" : value >= 20 ? "warn" : "bad";
    }
    return "info";
  }

  function formatAiMessageHtml(text) {
    var html = esc(layoutAiMessageText(text || ""));
    html = html.replace(/\b((?:Net Delivery Rate\s*\(NDR\)|Delivery Rate\s*\(DR\)|NDR|DR|Delivery Rate|Cancel Rate|Cancellation Rate|Confirm Rate|Confirmation Rate)[^0-9%-]{0,50})(-?\d+(?:\.\d+)?%)/gi, function (_, label, value) {
      var tone = metricTone(label, parseFloat(value));
      return label + '<mark class="aii-metric-token ' + tone + '">' + value + '</mark>';
    });
    html = html.replace(/\b(lost commission|loss|lost)\s*(\(?-?\d[\d,.]*(?:\s*(?:SAR|USD|EGP|AED|IQD|OMR))?\)?)/gi, function (_, label, value) {
      return label + ' <mark class="aii-metric-token bad">' + value + '</mark>';
    });
    html = html.replace(/\b(earned profit|earned commission|profit|commission)\s*(\(?-?\d[\d,.]*(?:\s*(?:SAR|USD|EGP|AED|IQD|OMR))?\)?)/gi, function (_, label, value) {
      return label + ' <mark class="aii-metric-token good">' + value + '</mark>';
    });
    return html;
  }

  function layoutAiMessageText(text) {
    text = String(text || "").replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();
    text = text.replace(/\bTips\s*:\s*/i, "Tips:\n");
    text = text.replace(/\s+-\s+/g, "\n- ");
    text = text.replace(/\s+\*\s+/g, "\n- ");
    text = text.replace(/\s+(\d+)\.\s+/g, "\n$1. ");
    [
      "Main insight:",
      "Why you are losing:",
      "Best/worst product:",
      "Best product:",
      "Worst product:",
      "What to do next:",
      "However,",
      "You are losing",
      "To fix this,",
      "Your worst products",
      "Conversely,",
      "Your worst performing cities",
      "Next steps"
    ].forEach(function (marker) {
      var re = new RegExp("\\s+(" + marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "g");
      text = text.replace(re, "\n\n$1");
    });
    return text.replace(/\n{3,}/g, "\n\n");
  }

  function icon(name) {
    if (window.icon) return window.icon(name, { size: 15, color: "currentColor" });
    return "";
  }

  function tr(key, fallback, params) {
    var value = window.dashboardI18n ? window.dashboardI18n.t(key, params || null) : key;
    return value && value !== key ? value : (fallback || key);
  }

  function isArabicUi() {
    var lang = window.dashboardI18n && typeof window.dashboardI18n.locale === "function"
      ? window.dashboardI18n.locale()
      : (document.documentElement.getAttribute("lang") || window._kbotLang || localStorage.getItem("kbot-lang") || "en");
    return String(lang || "").toLowerCase().indexOf("ar") === 0;
  }

  function uiText(en, ar) {
    return isArabicUi() ? ar : en;
  }

  function num(value) {
    if (window.dashboardI18n) return window.dashboardI18n.number(Number(value || 0), { maximumFractionDigits: 0 });
    return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function getAiSessionId() {
    try {
      var key = "taager_ai_session_id";
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var next = "ai-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, next);
      return next;
    } catch (_) {
      return "ai-session";
    }
  }

  function hydrateAssistantMemory() {
    if (window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.hydrate === "function") {
      return window.KhodAiSessionMemory.hydrate().then(function (memory) {
        assistantMemory = memory || {};
        return assistantMemory;
      });
    }
    return Promise.resolve(assistantMemory || {});
  }

  function defaultFollowUps(decision) {
    if (decision && decision.type === "scale_decision") return ["Open scale candidates", "What can block scaling?", "Compare with worst products", "Next step"];
    if (decision && decision.type === "bad_products") return ["How to fix first one?", "When should I pause it?", "Compare with best product", "Show scale candidates"];
    return ["Show worst products", "How to fix first one?", "Can I scale this?", "Compare with best product"];
  }

  function isLearningConfirm(text) {
    return /^(yes|y|save|save it|remember it|confirm|ok|okay|تمام|ايوه|اه|احفظ|احفظها)$/i.test(String(text || "").trim());
  }

  function isLearningReject(text) {
    return /^(no|n|cancel|don't save|do not save|forget it|لا|لأ|الغاء)$/i.test(String(text || "").trim());
  }

  function learningPromptText(suggestion) {
    if (!suggestion) return "";
    return uiText("I can remember this as a media buying rule: ", "أقدر أحفظ دي كقاعدة ميديا باينج: ") +
      (suggestion.label || suggestion.value || "") +
      "\n\n" + uiText("Save it?", "أحفظها؟");
  }

  function formatStrategyPlanText(plan) {
    if (!plan || typeof plan !== "object") return "";
    var parts = [];
    if (plan.recommendation) parts.push("Strategy plan: " + plan.recommendation);
    if (plan.proof && plan.proof.length) parts.push("Proof: " + plan.proof.slice(0, 4).join(", ") + ".");
    if (plan.campaignPlan) {
      var cp = plan.campaignPlan;
      var campaign = [cp.objective ? "Objective: " + cp.objective : "", cp.structure, cp.audience || cp.cityLogic, cp.creativePlan].filter(Boolean);
      if (campaign.length) parts.push("Campaign: " + campaign.join(" "));
    }
    if (plan.budgetPlan) {
      var bp = plan.budgetPlan;
      var budget = [bp.startBudget, bp.budgetRule, bp.killRule, bp.scaleRule].filter(Boolean);
      if (budget.length) parts.push("Budget rules: " + budget.join(" "));
    }
    if (plan.watchMetrics && plan.watchMetrics.length) parts.push("Watch: " + plan.watchMetrics.slice(0, 6).join(", ") + ".");
    return parts.join("\n\n");
  }

  function maybeAppendStrategyPlan(text, plan) {
    var planText = formatStrategyPlanText(plan);
    if (!planText) return text;
    if (String(text || "").indexOf("Strategy plan:") !== -1) return text;
    return String(text || "").trim() + "\n\n" + planText;
  }

  function rememberAssistantTurn(context, response) {
    response = response || {};
    if (window.KhodAiSessionMemory) {
      var learningSuggestion = response.strategyPlan && response.strategyPlan.learningSuggestion;
      if (!learningSuggestion && response.memoryUpdates && response.memoryUpdates.learningSuggestion) {
        learningSuggestion = response.memoryUpdates.learningSuggestion;
      }
      if (learningSuggestion && typeof window.KhodAiSessionMemory.proposeLearningSuggestion === "function") {
        var proposed = window.KhodAiSessionMemory.proposeLearningSuggestion(learningSuggestion, context || {});
        if (proposed) popupFollowUps = ["Save it", "Do not save", "What does this change?", "Continue strategy"];
      }
      if (response.memoryUpdates && typeof window.KhodAiSessionMemory.applyMemoryUpdates === "function") {
        var updates = Object.assign({}, response.memoryUpdates);
        delete updates.learningSuggestion;
        delete updates.userPreferences;
        delete updates.businessMemoryByAccount;
        if (Object.keys(updates).length) window.KhodAiSessionMemory.applyMemoryUpdates(updates);
      }
      if (typeof window.KhodAiSessionMemory.rememberBusinessContext === "function") {
        window.KhodAiSessionMemory.rememberBusinessContext(context || {}, response);
      }
      assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
    }
    popupFollowUps = Array.isArray(response.followUpQuestions) && response.followUpQuestions.length
      ? response.followUpQuestions.slice(0, 4)
      : defaultFollowUps(response.decision || null);
  }

  function sectionForTarget(target) {
    target = String(target || "").toLowerCase();
    if (target.indexOf("product-forecast") !== -1 || target.indexOf("forecast") !== -1) return "productForecast";
    if (target.indexOf("products") !== -1) return "products";
    if (target.indexOf("cities") !== -1 || target.indexOf("city") !== -1) return "cities";
    if (target.indexOf("calculator") !== -1 || target.indexOf("roi") !== -1) return "calculator";
    if (target.indexOf("cod") !== -1) return "cod";
    if (target.indexOf("pipeline") !== -1) return "pipeline";
    if (target.indexOf("orders") !== -1) return "orders";
    if (target.indexOf("commission") !== -1) return "commission";
    if (target.indexOf("campaign") !== -1 || target.indexOf("media") !== -1) return "campaigns";
    if (target.indexOf("prepaid") !== -1) return "prepaid";
    return "master";
  }

  function navigate(section) {
    if (ctxRef && typeof ctxRef.onNavigate === "function") ctxRef.onNavigate(section);
  }

  function findProductById(id) {
    var list = dataRef && dataRef.products && dataRef.products.rankedList ? dataRef.products.rankedList : [];
    var needle = String(id || "").toLowerCase();
    return list.find(function (p) {
      return [p.key, p.sku, p.name, p.rank].some(function (v) {
        return String(v == null ? "" : v).toLowerCase() === needle;
      });
    });
  }

  function findCity(name) {
    var cityStats = dataRef && dataRef.geo && dataRef.geo.cityStats ? dataRef.geo.cityStats : {};
    var needle = String(name || "").toLowerCase();
    return Object.keys(cityStats).find(function (city) {
      return city.toLowerCase() === needle || city.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function highlightProduct(productKey) {
    setTimeout(function () {
      var row = document.querySelector('.s5-product-row[data-product-key="' + CSS.escape(String(productKey)) + '"]');
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("ai-target-pulse");
      setTimeout(function () { row.classList.remove("ai-target-pulse"); }, 1600);
    }, 280);
  }

  function withProductsApi(callback, attempts) {
    attempts = attempts == null ? 12 : attempts;
    if (window.DashboardProductsActions) {
      callback(window.DashboardProductsActions);
      return;
    }
    if (attempts <= 0) return;
    setTimeout(function () { withProductsApi(callback, attempts - 1); }, 120);
  }

  function productActionPayload(action) {
    var inferredFilter = action.filter || action.sort || "";
    var route = String(action.route || "");
    var label = String(action.label || action.target || "");
    var sortMatch = route.match(/[?&](?:sort|filter)=([^&]+)/i);
    if (!inferredFilter && sortMatch) inferredFilter = decodeURIComponent(sortMatch[1] || "");
    if (!inferredFilter && /\b(worst|weak|danger|risk|risky|low ndr)\b/i.test(label)) inferredFilter = "worst_ndr";
    if (!inferredFilter && /\b(scale|scaling)\b/i.test(label)) inferredFilter = "scale";
    if (!inferredFilter && /\b(best|top|winner)\b/i.test(label)) inferredFilter = "best";
    return {
      filter: inferredFilter,
      productId: action.productId || "",
      productKey: action.productKey || "",
      productName: action.productName || "",
      query: action.query || action.target || ""
    };
  }

  function runProductFilter(action) {
    navigate("products");
    var detail = productActionPayload(action);
    window.dispatchEvent(new CustomEvent("dashboard-ai-filter-products", { detail: detail }));
    withProductsApi(function (api) {
      api.applyAiFilter(detail.filter || detail.query, detail);
    });
  }

  function runProductOpen(action) {
    navigate("products");
    var detail = productActionPayload(action);
    if (window.DashboardFilterBus) {
      window.DashboardFilterBus.setState({
        selectedProduct: detail.productKey || detail.productId || detail.productName,
        mapMode: window.DashboardFilterBus.MODES.PRODUCT
      });
    }
    withProductsApi(function (api) {
      var opened = api.openProduct(detail.productKey || detail.productId || detail.productName || detail.query, { search: true });
      if (!opened) highlightProduct(detail.productKey || detail.productId || detail.productName);
    });
  }

  function runAction(action) {
    if (!action || !action.type) return;
    var type = String(action.type).toUpperCase();

    if (type === "NAVIGATE" || type === "OPEN_PAGE") {
      var section = action.section || sectionForTarget(action.target || action.route);
      if (section === "products" && (action.filter || action.sort || action.productId || action.productKey || action.productName || /[?&](?:sort|filter)=/i.test(String(action.route || "")) || /\b(worst|weak|danger|risk|scale|best|top|winner)\b/i.test(String(action.label || action.target || "")))) {
        if (action.productId || action.productKey || action.productName) runProductOpen(action);
        else runProductFilter(action);
        return;
      }
      navigate(section);
      if (action.productId && window.DashboardFilterBus) {
        window.DashboardFilterBus.setState({ selectedProduct: action.productId, mapMode: window.DashboardFilterBus.MODES.PRODUCT });
      }
      if (action.city && window.DashboardFilterBus) {
        window.DashboardFilterBus.setState({ selectedCity: action.city });
      }
      return;
    }

    if (type === "OPEN_PRODUCT" || type === "OPEN_PRODUCT_DETAILS" || type === "VIEW_PRODUCT") {
      var product = findProductById(action.productId || action.productKey || action.productName);
      var key = product ? (product.key || product.sku || product.name) : (action.productKey || action.productId);
      action.productKey = key || action.productKey;
      runProductOpen(action);
      return;
    }

    if (type === "OPEN_CITY") {
      var city = findCity(action.city || action.target);
      if (window.DashboardFilterBus && city) window.DashboardFilterBus.setState({ selectedCity: city });
      navigate("cities");
      return;
    }

    if (type === "FILTER_PRODUCTS") {
      runProductFilter(action);
    }
  }

  function buildFallbackState(data) {
    var context = window.getDashboardAiContext
      ? window.getDashboardAiContext({ data: data })
      : (window.buildDashboardAiContext ? window.buildDashboardAiContext({ data: data }) : {});
    var local = context.localSummary || { message: tr("aii.summary.ready", "AI is ready for review."), insights: [] };
    var insights = (local.insights || []).map(function (text, idx) {
      return {
        id: "local-" + idx,
        title: local.message || tr("dashboardAi.signal.title", "AI insights available"),
        summary: text,
        severity: "info",
        confidence: "limited",
      };
    });
    return {
      insights: insights,
      recommendations: [],
      forecasts: [],
      alerts: [],
      health: { score: insights.length ? 58 : 0, label: tr("dashboardAi.health.local", "Local dashboard signals") },
      opportunityScore: insights.length ? 48 : 0,
      state: insights.length ? "partial" : "empty",
    };
  }

  function buildSmartNudges(data, intelligence) {
    var context = window.getDashboardAiContext
      ? window.getDashboardAiContext({ data: data || {} })
      : (window.buildDashboardAiContext ? window.buildDashboardAiContext({ data: data || {} }) : {});
    var nudges = [];
    var media = context.mediaBuying || {};
    var scaleGroup = (media.topProductGroups || []).find(function (group) { return group.decision === "scale"; });
    var fixGroup = (media.topProductGroups || []).find(function (group) { return group.decision === "fix_first"; });
    var pauseGroup = (media.topProductGroups || []).find(function (group) { return group.decision === "pause"; });
    var creative = media.creativeSummary && media.creativeSummary.needsNewCreatives && media.creativeSummary.needsNewCreatives[0];
    var riskyCity = (context.cities || []).slice().sort(function (a, b) { return Number(b.riskScore || 0) - Number(a.riskScore || 0); })[0];
    var scaleCity = (context.cities || []).slice().sort(function (a, b) { return Number(b.scalingScore || 0) - Number(a.scalingScore || 0); })[0];
    var breakEven = context.productFinancials && context.productFinancials.accountBreakEven;
    if (scaleGroup) {
      nudges.push({
        title: "Scale-ready product",
        body: scaleGroup.product,
        prompt: "Build a controlled scale strategy for " + scaleGroup.product
      });
    }
    if (fixGroup || pauseGroup) {
      var weak = pauseGroup || fixGroup;
      nudges.push({
        title: weak.decision === "pause" ? "Pause/reduce risk" : "Fix before scale",
        body: weak.product,
        prompt: "What should I fix before scaling " + weak.product + "?"
      });
    }
    if (creative) {
      nudges.push({
        title: "Creative reset",
        body: String(creative).slice(0, 80),
        prompt: "Create a creative reset strategy for the weak campaign"
      });
    }
    if (scaleCity && Number(scaleCity.scalingScore || 0) >= 60) {
      nudges.push({
        title: "Best city angle",
        body: scaleCity.city,
        prompt: "What is the best city-focused media buying strategy?"
      });
    } else if (riskyCity && Number(riskyCity.riskScore || 0) >= 65) {
      nudges.push({
        title: "City risk",
        body: riskyCity.city,
        prompt: "How should I handle weak city delivery in my campaigns?"
      });
    }
    if (breakEven && breakEven.isActualCpaAboveBreakEven) {
      nudges.push({
        title: "CPA above break-even",
        body: String(breakEven.actualCpa || "") + " > " + String(breakEven.breakEvenCpa || ""),
        prompt: "What should I do when CPA is above break-even?"
      });
    }
    if (intelligence && intelligence.alerts && intelligence.alerts[0] && nudges.length < 3) {
      nudges.push({
        title: intelligence.alerts[0].title || "AI alert",
        body: intelligence.alerts[0].reason || intelligence.alerts[0].summary || "",
        prompt: "What do you suggest me to do now?"
      });
    }
    return nudges.slice(0, 4);
  }

  function pushInjectedAi(normalized) {
    normalized = normalized || {};
    if (normalized.insights && normalized.insights.length) {
      popupInjectedAi.insights = normalized.insights.concat(popupInjectedAi.insights).slice(0, 8);
    }
    if (normalized.recommendations && normalized.recommendations.length) {
      popupInjectedAi.recommendations = normalized.recommendations.concat(popupInjectedAi.recommendations).slice(0, 8);
    }
    if (normalized.forecasts && normalized.forecasts.length) {
      popupInjectedAi.forecasts = normalized.forecasts.concat(popupInjectedAi.forecasts).slice(0, 6);
    }
    if (normalized.alerts && normalized.alerts.length) {
      popupInjectedAi.alerts = normalized.alerts.concat(popupInjectedAi.alerts).slice(0, 6);
    }
  }

  function buildSignalState(data) {
    if (data && (data._loading || data._loaded === false)) {
      return {
        status: "loading",
        count: 0,
        urgent: 0,
        title: tr("dashboardAi.loadingTitle", "AI is reviewing dashboard signals"),
        body: tr("dashboardAi.loadingBody", "Insights will appear when the dashboard finishes loading."),
        items: [],
      };
    }

    var serviceAvailable = !!(window.api && typeof window.api.dashboardAiQuery === "function");
    var intelligence = window.KhodAiIntelligenceData && window.KhodAiIntelligenceData.build
      ? window.KhodAiIntelligenceData.build({ data: data || {} })
      : buildFallbackState(data || {});

    var alerts = popupInjectedAi.alerts.concat(intelligence.alerts || []);
    var insights = popupInjectedAi.insights.concat(intelligence.insights || []);
    var recommendations = popupInjectedAi.recommendations.concat(intelligence.recommendations || []);
    var forecasts = popupInjectedAi.forecasts.concat(intelligence.forecasts || []);
    var urgent = alerts.filter(function (item) { return item.urgency === "high" || item.urgency === "critical"; }).length;
    var count = insights.length + recommendations.length + forecasts.length + alerts.length;
    var status = "populated";

    if (!window.KhodAiIntelligenceData) status = "unavailable";
    else if (!count) status = "empty";
    else if (urgent) status = "alert";
    else if (!serviceAvailable) status = "populated";

    var title;
    var body;
    if (status === "alert") {
      title = tr("dashboardAi.alertTitle", "AI detected urgent opportunities");
      body = tr("dashboardAi.alertBody", "Review the highest-impact signals in AI Intelligence.");
    } else if (status === "empty") {
      title = tr("dashboardAi.emptyTitle", "AI is quiet right now");
      body = tr("dashboardAi.emptyBody", "No strong AI findings are available for this dashboard view.");
    } else if (status === "unavailable") {
      title = tr("dashboardAi.unavailableTitle", "AI Intelligence is unavailable");
      body = tr("dashboardAi.unavailableBody", "Local dashboard analytics remain available.");
    } else {
      title = tr("dashboardAi.populatedTitle", "{count} AI insights available", { count: num(count) });
      body = tr("dashboardAi.populatedBody", "Open AI Intelligence for recommendations and forecasts.");
    }

    return {
      status: status,
      count: count,
      urgent: urgent,
      title: title,
      body: body,
      items: alerts.concat(insights).concat(recommendations).slice(0, 3),
      intelligence: intelligence,
      nudges: buildSmartNudges(data || {}, intelligence),
    };
  }

  function renderItemAsMessage(item) {
    var label = item.urgency || item.severity || item.riskLevel || item.confidence || "info";
    var severityClass = "severity-" + label.toLowerCase();

    var title = item.title || "";
    var body = item.summary || item.reason || item.expectedBenefit || "";

    var titleHtml = title ? '<div class="ai-insight-title">' + esc(title) + '</div>' : '';
    var bodyHtml = (body && body !== title) ? '<div class="ai-insight-body" style="font-size: 11px; opacity: 0.8; margin-top: 2px;">' + esc(body) + '</div>' : '';

    return '<div class="ai-insight-block ' + esc(severityClass) + '">' +
             '<div class="ai-insight-label">' + esc(label) + '</div>' +
             titleHtml +
             bodyHtml +
           '</div>';
  }

  function renderPopupActions(actions, msgIdx) {
    actions = Array.isArray(actions) ? actions : [];
    if (!actions.length) return "";
    return '<div class="ai-popup-actions">' + actions.slice(0, 4).map(function (action, actionIdx) {
      return '<button type="button" class="ai-popup-action" data-ai-popup-action="' + msgIdx + ':' + actionIdx + '">' +
        esc(action.label || action.type || tr("aii.action.review", "Review")) +
      '</button>';
    }).join("") + '</div>';
  }

  function renderAssistantControlStrip() {
    return '<div class="ai-control-strip">' +
      '<span>' + esc(uiText("Reads all dashboard sections", "يقرأ كل أقسام الداشبورد")) + '</span>' +
      '<span>' + esc(uiText("Suggest-only", "اقتراحات فقط")) + '</span>' +
      '<span>' + esc(uiText("Memory saves after confirmation", "الحفظ بعد التأكيد")) + '</span>' +
    '</div>';
  }

  function renderLearningControls() {
    var pending = assistantMemory && assistantMemory.pendingLearningSuggestion;
    if (!pending) return "";
    return '<div class="ai-learning-card">' +
      '<div class="ai-learning-copy">' +
        '<strong>' + esc(uiText("Memory suggestion", "اقتراح حفظ")) + '</strong>' +
        '<span>' + esc(pending.label || pending.value || "") + '</span>' +
      '</div>' +
      '<div class="ai-learning-actions">' +
        '<button type="button" data-ai-learning="save">' + esc(uiText("Save this", "احفظ ده")) + '</button>' +
        '<button type="button" data-ai-learning="remove">' + esc(uiText("Remove this", "امسح ده")) + '</button>' +
        '<button type="button" data-ai-learning="later">' + esc(uiText("Not now", "مش دلوقتي")) + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderPopupMessage(msg, msgIdx) {
    var sender = msg.sender === "user" ? "user" : "ai";
    var state = msg.state || "complete";
    return '<div class="ai-message ' + esc(sender) + ' ' + esc(state) + '">' +
      '<div class="ai-message-bubble">' +
        '<div>' + (sender === "ai" ? formatAiMessageHtml(msg.text || "") : esc(msg.text || "")) + '</div>' +
        renderPopupActions(msg.actions, msgIdx) +
      '</div>' +
    '</div>';
  }

  function renderRoot(state) {
    var toggleText = isOpen ? tr("dashboardAi.closePanel", "Close AI insights") : tr("dashboardAi.openPanel", "Show AI insights");
    var placeholderText = tr("ai.askPlaceholder", "Ask for strategy, best cities, scale plan, or what to do next...");

    // Suggested prompts
    var prompts = popupFollowUps.length ? popupFollowUps : [
      uiText("What should I do next?", "أعمل إيه دلوقتي؟"),
      uiText("Build a scale plan", "اعمل خطة سكيل"),
      uiText("Best cities to scale?", "أفضل مدن للسكيل؟"),
      uiText("Explain weak NDR", "اشرح ضعف NDR")
    ];
    var promptsHtml = prompts.map(function(p) {
      return '<button type="button" class="ai-prompt-pill">' + esc(p) + '</button>';
    }).join("");
    var nudges = Array.isArray(state.nudges) ? state.nudges : [];
    var nudgesHtml = nudges.length
      ? '<div class="ai-smart-nudges">' + nudges.map(function (nudge, idx) {
        return '<button type="button" class="ai-smart-nudge" data-ai-nudge="' + idx + '">' +
          '<strong>' + esc(nudge.title || "Strategy") + '</strong>' +
          '<span>' + esc(nudge.body || nudge.prompt || "") + '</span>' +
        '</button>';
      }).join("") + '</div>'
      : "";

    var itemsHtml = state.items.length
      ? state.items.map(renderItemAsMessage).join("")
      : '<div class="ai-insight-block severity-info"><span class="ai-insight-title">' + esc(state.status === "loading" ? tr("dashboardAi.loadingBody", "Insights will appear when loading finishes.") : tr("dashboardAi.emptyBody", "No strong AI findings are available for this dashboard view.")) + '</span></div>';
    var feedHtml = popupMessages.length
      ? popupMessages.map(renderPopupMessage).join("")
      : '<div class="ai-message ai">' +
          '<div class="ai-message-bubble">' + esc(state.body) + '</div>' +
        '</div>' +
        (state.items.length || state.status === "empty" || state.status === "loading" ?
          '<div class="ai-message ai">' +
            '<div class="ai-message-bubble">' + itemsHtml + '</div>' +
          '</div>' : '');

    return '' +
      '<button type="button" class="ai-copilot-orb state-' + esc(state.status) + '" id="ai-copilot-orb" aria-expanded="' + (isOpen ? "true" : "false") + '" aria-controls="ai-copilot-panel" aria-label="' + esc(toggleText) + '" data-tooltip="' + esc(toggleText) + '">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L22 12L12 22L2 12L12 2Z"/></svg>' +
      '</button>' +
      '<section id="ai-copilot-panel" class="ai-copilot-panel" role="dialog" aria-label="' + esc(tr("dashboardAi.panelTitle", "Dashboard AI insights")) + '" aria-hidden="' + (isOpen ? "false" : "true") + '">' +
        '<div class="ai-panel-header">' +
          '<div class="ai-panel-title"><strong>Taager AI</strong><span>' + esc(popupBusy ? tr("ai.thinking", "Analyzing") : (state.status === 'loading' ? 'Scanning' : 'Ready')) + '</span></div>' +
          '<button type="button" id="ai-panel-close" class="ai-panel-close" aria-label="' + esc(tr("dashboardAi.closePanel", "Close AI insights")) + '">&#10005;</button>' +
        '</div>' +
        renderAssistantControlStrip() +
        '<div class="ai-copilot-feed" id="ai-copilot-feed">' +
          feedHtml +
        '</div>' +
        '<div class="ai-copilot-input-area">' +
          renderLearningControls() +
          nudgesHtml +
          '<div class="ai-suggested-prompts">' + promptsHtml + '</div>' +
          '<div class="ai-chat-input-wrapper">' +
            '<input type="text" class="ai-chat-input" id="ai-chat-input" placeholder="' + esc(placeholderText) + '" />' +
            '<button type="button" class="ai-chat-send" id="ai-chat-send" aria-label="Send"' + (popupBusy ? ' disabled' : '') + '>&#8593;</button>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function openPanel() {
    isOpen = true;
    refresh();
  }

  function closePanel() {
    isOpen = false;
    refresh();
  }

  function openIntelligencePage() {
    isOpen = false;
    navigate("taagerAi");
  }

  function setPopupAssistant(requestId, state, text, actions) {
    var idx = popupMessages.findIndex(function (msg) { return msg.requestId === requestId; });
    if (idx === -1) return;
    popupMessages[idx] = {
      sender: "assistant",
      state: state || "complete",
      text: text || "",
      actions: actions || [],
      requestId: requestId,
    };
    refresh();
  }

  function nextUiTick() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function localFallbackMessage(context) {
    context = context || {};
    var local = context.localSummary || {};
    var parts = [local.message].concat(local.insights || []).filter(Boolean);
    return parts.length ? parts.join("\n") : tr("ai.contextReady", "Dashboard context is ready.");
  }

  function refreshMarketingSpendForAi(dashboardData) {
    var accountId = dashboardData && dashboardData.meta && dashboardData.meta.activeAccountId;
    if (!accountId || !window.DashboardMarketingState || typeof window.DashboardMarketingState.get !== "function" || typeof window.DashboardMarketingState.load !== "function") {
      return Promise.resolve();
    }
    var current = window.DashboardMarketingState.get(accountId);
    if (current && current.summary && current.status === "connected") return Promise.resolve(current);
    return window.DashboardMarketingState.load(accountId).catch(function () { return null; });
  }

  async function askPopup(prompt) {
    var text = String(prompt || "").trim();
    if (!text || popupBusy) return;

    isOpen = true;
    popupBusy = true;
    var requestId = ++popupRequestSeq;
    popupMessages.push({ sender: "user", state: "complete", text: text });
    popupMessages.push({
      sender: "assistant",
      state: "pending",
      text: tr("ai.thinking", "Analyzing dashboard intelligence..."),
      requestId: requestId,
    });
    refresh();
    await nextUiTick();
    await hydrateAssistantMemory();

    var dashboardData = dataRef || window.dashboardGeoData || {};
    var context = {};
    var parsedIntent = null;
    var analyticsResult = null;
    var localStrategic = null;

    try {
      await refreshMarketingSpendForAi(dashboardData);
      var learningContext = window.getDashboardAiContext
        ? window.getDashboardAiContext({ data: dashboardData })
        : (window.buildDashboardAiContext ? window.buildDashboardAiContext({ data: dashboardData }) : {});
      if (window.KhodAiSessionMemory && assistantMemory && assistantMemory.pendingLearningSuggestion) {
        if (isLearningConfirm(text) && typeof window.KhodAiSessionMemory.confirmPendingLearning === "function") {
          var savedLearning = window.KhodAiSessionMemory.confirmPendingLearning();
          assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
          popupBusy = false;
          popupFollowUps = ["What should I do next?", "Use this rule in a scale plan", "Show scale candidates", "Best cities to scale?"];
          setPopupAssistant(requestId, "complete", "Saved. I will use this rule in future media buying recommendations: " + (savedLearning && savedLearning.label || ""), []);
          return;
        }
        if (isLearningReject(text) && typeof window.KhodAiSessionMemory.discardPendingLearning === "function") {
          window.KhodAiSessionMemory.discardPendingLearning();
          assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
          popupBusy = false;
          popupFollowUps = defaultFollowUps(null);
          setPopupAssistant(requestId, "complete", "No problem. I did not save that rule.", []);
          return;
        }
      }
      if (window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.detectLearningSuggestion === "function") {
        var detectedLearning = window.KhodAiSessionMemory.detectLearningSuggestion(text, learningContext || {});
        if (detectedLearning && typeof window.KhodAiSessionMemory.proposeLearningSuggestion === "function") {
          var proposedLearning = window.KhodAiSessionMemory.proposeLearningSuggestion(detectedLearning, learningContext || {});
          assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
          popupBusy = false;
          popupFollowUps = ["Save it", "Do not save", "Use it in a scale plan", "What should I do next?"];
          setPopupAssistant(requestId, "pending-input", learningPromptText(proposedLearning), []);
          return;
        }
      }
      if (window.KhodAiBusinessOrchestrator && window.KhodAiBusinessOrchestrator.orchestrate) {
        var orchestration = window.KhodAiBusinessOrchestrator.orchestrate(text, dashboardData);
        if (orchestration.mode === "followup" || orchestration.mode === "local") {
          popupBusy = false;
          if (orchestration.mode === "local") rememberAssistantTurn(orchestration.context || {}, orchestration);
          setPopupAssistant(requestId, orchestration.mode === "followup" ? "pending-input" : "complete", orchestration.message, orchestration.actions || []);
          return;
        }
        parsedIntent = orchestration.parsedIntent;
        analyticsResult = orchestration.analyticsResult;
        context = orchestration.context || {};
        localStrategic = orchestration.localStrategic || null;
        if (localStrategic && localStrategic.message) {
          setPopupAssistant(
            requestId,
            "pending",
            localStrategic.message + "\n\n" + tr("ai.finalizing", "Finalizing assistant wording..."),
            localStrategic.actions || []
          );
          await nextUiTick();
        }
      } else if (window.KhodAiIntentDetector && window.KhodAiAnalyticsEngine && window.KhodAiContextCompressor && window.KhodAiSessionMemory) {
        parsedIntent = window.KhodAiIntentDetector.parse(text, dashboardData, window.KhodAiSessionMemory.get());
        window.KhodAiSessionMemory.update(parsedIntent);
        analyticsResult = window.KhodAiAnalyticsEngine.processIntent(parsedIntent, dashboardData || {});
        context = window.KhodAiContextCompressor.compress(parsedIntent, analyticsResult);
      } else {
        context = window.getDashboardAiContext
          ? window.getDashboardAiContext({ data: dashboardData })
          : (window.buildDashboardAiContext ? window.buildDashboardAiContext({ data: dashboardData }) : {});
      }

      if (parsedIntent && (parsedIntent.blockedReason || parsedIntent.localOnly || parsedIntent.aiAllowed === false)) {
        var localText = window.KhodAiAnalyticsEngine && window.KhodAiAnalyticsEngine.localResponse
          ? window.KhodAiAnalyticsEngine.localResponse(parsedIntent, analyticsResult || {})
          : tr("ai.localFallback", "Use local dashboard insights for now.");
        popupBusy = false;
        rememberAssistantTurn(context, { message: localText });
        setPopupAssistant(requestId, parsedIntent.blockedReason ? "error" : "complete", localText, []);
        return;
      }

      if (!window.api || typeof window.api.dashboardAiQuery !== "function") {
        popupBusy = false;
        setPopupAssistant(requestId, "complete", localStrategic ? localStrategic.message : localFallbackMessage(context), localStrategic && localStrategic.actions || []);
        return;
      }

      var response = await window.api.dashboardAiQuery({
        command: text,
        context: context,
        forceGemini: true,
        sessionId: getAiSessionId(),
        assistantMemory: assistantMemory,
        workflow: assistantMemory && assistantMemory.assistantWorkflow,
        historySummary: assistantMemory && assistantMemory.lastDiagnosis,
        history: popupMessages.slice(-8).map(function (msg) {
          return { role: msg.sender === "user" ? "user" : "assistant", text: msg.text || "" };
        }),
      });
      var normalized = window.KhodAiIntelligenceData ? window.KhodAiIntelligenceData.normalizeAiResponse(response) : { message: response && response.message || "" };
      var meta = response && response.meta ? response.meta : {};
      var shouldUseLocal = localStrategic && (meta.blocked || meta.error || (meta.source === "fallback" && response.message === "AI service is not available. I am showing local dashboard guidance instead."));
      var answerText = shouldUseLocal
        ? localStrategic.message
        : (normalized.message || (localStrategic && localStrategic.message) || tr("ai.contextReady", "Analysis complete."));
      answerText = maybeAppendStrategyPlan(answerText, normalized.strategyPlan || (localStrategic && localStrategic.strategyPlan));
      var learningSuggestion = normalized.strategyPlan && normalized.strategyPlan.learningSuggestion;
      if (learningSuggestion && window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.proposeLearningSuggestion === "function") {
        var proposedAfterAnswer = window.KhodAiSessionMemory.proposeLearningSuggestion(learningSuggestion, context || {});
        if (proposedAfterAnswer) {
          answerText += "\n\n" + learningPromptText(proposedAfterAnswer);
        }
      }
      var answerActions = shouldUseLocal
        ? (localStrategic.actions || [])
        : ((normalized.actions && normalized.actions.length ? normalized.actions : (localStrategic && localStrategic.actions)) || []);

      if (shouldUseLocal && localStrategic) {
        normalized = {
          message: localStrategic.message,
          insights: localStrategic.insights || [],
          recommendations: localStrategic.recommendations || [],
          forecasts: localStrategic.forecasts || [],
          alerts: localStrategic.alerts || [],
          strategyPlan: localStrategic.strategyPlan || null,
        };
      }
      pushInjectedAi(normalized);
      rememberAssistantTurn(context, shouldUseLocal ? Object.assign({}, localStrategic || {}, { message: answerText }) : response);
      popupBusy = false;
      setPopupAssistant(requestId, "complete", answerText, answerActions);
    } catch (err) {
      popupBusy = false;
      if (localStrategic) {
        pushInjectedAi(localStrategic);
        rememberAssistantTurn(context, localStrategic);
        setPopupAssistant(requestId, "complete", localStrategic.message, localStrategic.actions || []);
      } else {
        setPopupAssistant(requestId, "error", tr("ai.requestFailed", "AI request failed.") + " " + (err && err.message ? err.message : ""), []);
      }
    }
  }

  function wire(root) {
    var orb = root.querySelector("#ai-copilot-orb");
    var close = root.querySelector("#ai-panel-close");
    var input = root.querySelector("#ai-chat-input");
    var sendBtn = root.querySelector("#ai-chat-send");
    var feed = root.querySelector("#ai-copilot-feed");
    var promptPills = root.querySelectorAll(".ai-prompt-pill");
    var nudgeBtns = root.querySelectorAll("[data-ai-nudge]");
    var learningBtns = root.querySelectorAll("[data-ai-learning]");

    if (orb) orb.addEventListener("click", function () { isOpen ? closePanel() : openPanel(); });
    if (close) close.addEventListener("click", closePanel);

    function handleSend() {
      if (!input || !input.value.trim()) return;
      var text = input.value.trim();
      input.value = "";
      askPopup(text);
    }

    if (sendBtn) sendBtn.addEventListener("click", handleSend);
    if (input) {
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") handleSend();
      });
    }

    var promptContainer = root.querySelector(".ai-suggested-prompts");
    var hasDragged = false;
    if (promptContainer) {
      var isDown = false;
      var startX;
      var scrollLeft;

      promptContainer.addEventListener("mousedown", function(e) {
        isDown = true;
        hasDragged = false;
        startX = e.pageX - promptContainer.offsetLeft;
        scrollLeft = promptContainer.scrollLeft;
        promptContainer.style.cursor = "grabbing";
      });
      promptContainer.addEventListener("mouseleave", function() {
        isDown = false;
        promptContainer.style.cursor = "";
      });
      promptContainer.addEventListener("mouseup", function() {
        isDown = false;
        promptContainer.style.cursor = "";
      });
      promptContainer.addEventListener("mousemove", function(e) {
        if (!isDown) return;
        e.preventDefault();
        var x = e.pageX - promptContainer.offsetLeft;
        var walk = (x - startX) * 2;
        if (Math.abs(walk) > 5) hasDragged = true;
        promptContainer.scrollLeft = scrollLeft - walk;
      });
    }

    promptPills.forEach(function(pill) {
      pill.addEventListener("click", function(e) {
        if (hasDragged) {
          e.preventDefault();
          return;
        }
        if (input) {
          input.value = "";
          input.focus();
        }
        askPopup(pill.textContent);
      });
    });

    nudgeBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-ai-nudge"));
        var nudge = lastState && lastState.nudges ? lastState.nudges[idx] : null;
        if (nudge && nudge.prompt) askPopup(nudge.prompt);
      });
    });

    learningBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = String(btn.getAttribute("data-ai-learning") || "");
        if (!window.KhodAiSessionMemory) return;
        if (action === "save" && typeof window.KhodAiSessionMemory.confirmPendingLearning === "function") {
          var saved = window.KhodAiSessionMemory.confirmPendingLearning();
          assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
          popupMessages.push({
            sender: "assistant",
            state: "complete",
            text: uiText("Saved. I will use this rule in future recommendations: ", "تم الحفظ. هستخدم القاعدة دي في الترشيحات الجاية: ") + (saved && saved.label || "")
          });
          refresh();
          return;
        }
        if ((action === "remove" || action === "later") && typeof window.KhodAiSessionMemory.discardPendingLearning === "function") {
          window.KhodAiSessionMemory.discardPendingLearning();
          assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
          popupMessages.push({
            sender: "assistant",
            state: "complete",
            text: action === "remove"
              ? uiText("Removed. I did not save that rule.", "اتمسح. محفظتش القاعدة دي.")
              : uiText("Okay, I will not save it now.", "تمام، مش هحفظها دلوقتي.")
          });
          refresh();
        }
      });
    });

    root.querySelectorAll("[data-ai-popup-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = String(btn.getAttribute("data-ai-popup-action") || "").split(":");
        var msg = popupMessages[Number(parts[0])];
        var action = msg && msg.actions ? msg.actions[Number(parts[1])] : null;
        runAction(action);
      });
    });
  }

  function refresh() {
    if (!rootRef) return;
    lastState = buildSignalState(dataRef || {});
    rootRef.classList.toggle("is-open", isOpen);
    rootRef.innerHTML = renderRoot(lastState);
    wire(rootRef);
    if (window.dashboardI18n) window.dashboardI18n.apply(rootRef);
    if (window.TaagerUI && typeof window.TaagerUI.enhance === "function") {
      window.TaagerUI.enhance(rootRef);
    } else if (window.KhodUI && typeof window.KhodUI.enhance === "function") {
      window.KhodUI.enhance(rootRef);
    }
    if (isOpen) {
      setTimeout(function () {
        var feed = rootRef && rootRef.querySelector("#ai-copilot-feed");
        if (feed) feed.scrollTop = feed.scrollHeight;
      }, 0);
    }
  }

  function mountUi(shellEl, data, ctx) {
    dataRef = data || {};
    ctxRef = ctx || {};
    if (!shellEl) return;
    hydrateAssistantMemory().then(function () {
      if (rootRef) refresh();
    });

    rootRef = document.getElementById("dashboard-ai-root");
    if (!rootRef || rootRef.parentNode !== shellEl) {
      if (rootRef && rootRef.parentNode) rootRef.parentNode.removeChild(rootRef);
      rootRef = document.createElement("div");
      rootRef.id = "dashboard-ai-root";
      shellEl.appendChild(rootRef);
    }
    refresh();
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen) closePanel();
  });

  window.mountDashboardAI = mountUi;
  window.askDashboardAI = askPopup;
  window.openDashboardAI = openPanel;
  window.KhodDashboardAi = Object.assign(window.KhodDashboardAi || {}, {
    ask: askPopup,
    open: openPanel,
    runAction: runAction
  });
  window.TaagerDashboardAi = window.KhodDashboardAi;
  window.runDashboardAiAction = runAction;
})();
