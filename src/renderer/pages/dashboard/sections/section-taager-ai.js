(function () {
  "use strict";

  var lastState = null;
  var selectedDetail = null;
  var activeStream = null;
  var chatMessages = [];
  var chatBusy = false;
  var injectedAi = { insights: [], recommendations: [], forecasts: [], alerts: [] };
  var assistantMemory = null;
  var followUpSuggestions = [];
  var _mountEl = null;

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

  function tr(key, params, fallback) {
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
    html = html.replace(/\b(lost commission|loss|lost)\s*(\(?-?\d[\d,.]*(?:\s*(?:SAR|USD|EGP))?\)?)/gi, function (_, label, value) {
      return label + ' <mark class="aii-metric-token bad">' + value + '</mark>';
    });
    html = html.replace(/\b(earned profit|earned commission|profit|commission)\s*(\(?-?\d[\d,.]*(?:\s*(?:SAR|USD|EGP))?\)?)/gi, function (_, label, value) {
      return label + ' <mark class="aii-metric-token good">' + value + '</mark>';
    });
    return html;
  }

  function nextUiTick() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
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
    if (window.icon) return window.icon(name, { size: 16, color: "currentColor" });
    return "";
  }

  function num(value) {
    if (window.dashboardI18n) return window.dashboardI18n.number(Number(value || 0), { maximumFractionDigits: 0 });
    return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
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

  function rememberAssistantTurn(context, response) {
    response = response || {};
    if (window.KhodAiSessionMemory) {
      var learningSuggestion = response.strategyPlan && response.strategyPlan.learningSuggestion;
      if (!learningSuggestion && response.memoryUpdates && response.memoryUpdates.learningSuggestion) {
        learningSuggestion = response.memoryUpdates.learningSuggestion;
      }
      if (learningSuggestion && typeof window.KhodAiSessionMemory.proposeLearningSuggestion === "function") {
        window.KhodAiSessionMemory.proposeLearningSuggestion(learningSuggestion, context || {});
        followUpSuggestions = ["Save it", "Do not save", "What does this change?", "Continue strategy"];
      }
      if (typeof window.KhodAiSessionMemory.applyMemoryUpdates === "function" && response.memoryUpdates) {
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
    followUpSuggestions = Array.isArray(response.followUpQuestions) && response.followUpQuestions.length
      ? response.followUpQuestions.slice(0, 4)
      : defaultFollowUpSuggestions(response.decision || null);
  }

  function defaultFollowUpSuggestions(decision) {
    var list = ["Show worst products", "How to fix first one?", "Can I scale this?", "Compare with best product"];
    if (decision && decision.type === "scale_decision") list = ["Open scale candidates", "What can block scaling?", "Compare with worst products", "Next step"];
    if (decision && decision.type === "bad_products") list = ["How to fix first one?", "When should I pause it?", "Compare with best product", "Show scale candidates"];
    return list;
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

  function currentData() {
    try {
      var state = window.KhodAiIntelligenceData && window.KhodAiIntelligenceData.build
        ? window.KhodAiIntelligenceData.build({ data: window.dashboardGeoData || {} })
        : { insights: [], recommendations: [], forecasts: [], alerts: [], health: { score: 0, label: "" }, opportunityScore: 0, state: "empty" };
      state.insights = injectedAi.insights.concat(state.insights || []);
      state.recommendations = injectedAi.recommendations.concat(state.recommendations || []);
      state.forecasts = injectedAi.forecasts.concat(state.forecasts || []);
      state.alerts = injectedAi.alerts.concat(state.alerts || []);
      return state;
    } catch (err) {
      return { insights: [], recommendations: [], forecasts: [], alerts: [], health: { score: 0, label: "" }, opportunityScore: 0, state: "error", error: err };
    }
  }

  function runAction(action) {
    if (!action) return;
    if (window.runDashboardAiAction && action.type) {
      window.runDashboardAiAction(action);
      return;
    }
  }

  function actionButtons(actions, msgIdx) {
    actions = Array.isArray(actions) ? actions : [];
    if (!actions.length) return "";
    return '<div class="aii-chat-actions">' + actions.slice(0, 4).map(function (action, actionIdx) {
      return '<button type="button" class="aii-action-btn" data-aii-chat-action="' + msgIdx + ':' + actionIdx + '">' +
        esc(action.label || action.type || tr("aii.action.review", null, "Review")) +
      '</button>';
    }).join("") + '</div>';
  }

  function defaultChatMessages() {
    return [{
      sender: "assistant",
      state: "complete",
      text: tr("aii.chatWelcome", null, "I am Taager AI. How can I assist you with your operations, forecasting, or strategic planning today?"),
    }];
  }

  function chatMessageHtml(msg, msgIdx) {
    var avatar = msg.sender === "user" ? '<div class="aii-avatar user-avatar">' + icon('user') + '</div>' : '<div class="aii-avatar ai-avatar">' + icon('diamond') + '</div>';
    var name = msg.sender === "user" ? tr("aii.you", null, "You") : tr("aii.assistant", null, "Taager AI");
    return '<div class="aii-chat-msg ' + esc(msg.sender) + ' ' + esc(msg.state || "complete") + '">' +
      avatar +
      '<div class="aii-chat-msg-body">' +
        '<span>' + esc(name) + '</span>' +
        '<p>' + (msg.sender === "assistant" ? formatAiMessageHtml(msg.text) : esc(msg.text)) + '</p>' +
        actionButtons(msg.actions, msgIdx) +
      '</div>' +
    '</div>';
  }

  function chatLogHtml(messages) {
    return (messages && messages.length ? messages : defaultChatMessages()).map(chatMessageHtml).join("");
  }

  function severityLabel(value) {
    var map = {
      critical: tr("aii.severity.critical", null, "Critical Risk"),
      warning: tr("aii.severity.warning", null, "Warning"),
      watch: tr("aii.severity.watch", null, "Watch"),
      positive: tr("aii.severity.positive", null, "Opportunity"),
      info: tr("aii.severity.info", null, "Info"),
      high: tr("aii.risk.high", null, "High Risk"),
      medium: tr("aii.risk.medium", null, "Medium Risk"),
      low: tr("aii.risk.low", null, "Low Risk"),
      limited: tr("aii.confidence.limited", null, "Limited"),
    };
    return map[value] || value || map.info;
  }

  function confidenceLabel(value) {
    var map = {
      high: tr("aii.confidence.high", null, "High confidence"),
      medium: tr("aii.confidence.medium", null, "Medium confidence"),
      low: tr("aii.confidence.low", null, "Low confidence"),
      limited: tr("aii.confidence.limited", null, "Limited data"),
    };
    return map[value] || map.limited;
  }

  function stateBlock(kind, title, body) {
    return '<div class="aii-state aii-state-' + esc(kind || "info") + '">' +
      '<div class="aii-state-icon">' + icon(kind === "error" ? "info" : "activity") + '</div>' +
      '<strong>' + esc(title) + '</strong>' +
      '<span>' + esc(body) + '</span>' +
    '</div>';
  }

  function renderAlerts(state) {
    if (!state.alerts.length) return "";
    return '<section class="aii-alert-strip" aria-label="' + esc(tr("aii.importantAlerts", null, "Important alerts")) + '">' +
      state.alerts.slice(0, 3).map(function (item, idx) {
        var cls = (item.urgency === 'critical' || item.urgency === 'high') ? 'aii-glow-red' : 'aii-glow-amber';
        return '<button type="button" class="aii-alert-chip ' + cls + '" data-aii-detail="alerts:' + idx + '">' +
          '<div class="aii-alert-chip-content">' +
            '<span>' + esc(severityLabel(item.urgency || item.severity || "warning")) + '</span>' +
            '<strong>' + esc(item.title) + '</strong>' +
            '<em>' + esc(item.reason || item.summary || "") + '</em>' +
          '</div>' +
          '<div class="aii-alert-chip-action">' + icon('chevron-right') + '</div>' +
        '</button>';
      }).join("") +
    '</section>';
  }

  function renderChat() {
    var suggestions = followUpSuggestions.length ? followUpSuggestions : [
      uiText("What should I do next?", "أعمل إيه دلوقتي؟"),
      uiText("Build a scale plan", "اعمل خطة سكيل"),
      uiText("Best cities to scale?", "أفضل مدن للسكيل؟"),
      uiText("Explain weak NDR", "اشرح ضعف NDR"),
    ];
    var pendingLearning = assistantMemory && assistantMemory.pendingLearningSuggestion;
    var controlStrip = '<div class="aii-control-strip">' +
      '<span>' + esc(uiText("Reads all dashboard sections", "يقرأ كل أقسام الداشبورد")) + '</span>' +
      '<span>' + esc(uiText("Suggest-only", "اقتراحات فقط")) + '</span>' +
      '<span>' + esc(uiText("Memory saves after confirmation", "الحفظ بعد التأكيد")) + '</span>' +
    '</div>';
    var learningCard = pendingLearning
      ? '<div class="aii-learning-card">' +
        '<div class="aii-learning-copy">' +
          '<strong>' + esc(uiText("Memory suggestion", "اقتراح حفظ")) + '</strong>' +
          '<span>' + esc(pendingLearning.label || pendingLearning.value || "") + '</span>' +
        '</div>' +
        '<div class="aii-learning-actions">' +
          '<button type="button" data-aii-learning="save">' + esc(uiText("Save this", "احفظ ده")) + '</button>' +
          '<button type="button" data-aii-learning="remove">' + esc(uiText("Remove this", "امسح ده")) + '</button>' +
          '<button type="button" data-aii-learning="later">' + esc(uiText("Not now", "مش دلوقتي")) + '</button>' +
        '</div>' +
      '</div>'
      : "";
    return '<section class="aii-panel aii-chat-panel">' +
      '<div class="aii-panel-head"><div><span>' + esc(tr("aii.chatKicker", null, "Business Assistant")) + '</span><h2>' + esc(tr("aii.chatTitle", null, "Command Center")) + '</h2></div></div>' +
      controlStrip +
      '<div id="aii-chat-log" class="aii-chat-log">' +
        chatLogHtml(chatMessages) +
      '</div>' +
      learningCard +
      '<div class="aii-suggestions">' + suggestions.map(function (item) {
        return '<button type="button" class="aii-chip" data-aii-prompt="' + esc(item) + '">' + esc(item) + '</button>';
      }).join("") + '</div>' +
      '<form id="aii-chat-form" class="aii-chat-form">' +
        '<input id="aii-chat-input" type="text" autocomplete="off" placeholder="' + esc(tr("aii.chatPlaceholder", null, "Ask for strategy, best cities, scale plan, or what to do next...")) + '" aria-label="' + esc(tr("aii.chatPlaceholder", null, "Ask AI...")) + '"' + (chatBusy ? ' disabled' : '') + '>' +
        '<button type="submit"' + (chatBusy ? ' disabled aria-busy="true"' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>' +
      '</form>' +
      '<div class="aii-ai-disclaimer" style="font-size:11px;color:var(--text-muted,#888);margin-top:12px;text-align:center;line-height:1.4;">' +
        esc(tr("aii.disclaimer.metrics", null, "Controlled business copilot: local-first metrics with guarded AI reasoning.")) + '<br>' +
        esc(tr("aii.disclaimer.scope", null, "AI is used only for strategy, explanations, recommendations, and forecasting.")) +
      '</div>' +
    '</section>';
  }

  function getSemanticClass(item) {
    var severity = (item.severity || item.riskLevel || "").toLowerCase();
    var category = (item.category || "").toLowerCase();
    if (severity === "critical" || severity === "high") return "aii-glow-red";
    if (severity === "warning" || severity === "medium" || severity === "watch") return "aii-glow-amber";
    if (severity === "positive" || category === "opportunity") return "aii-glow-green";
    return "aii-glow-blue";
  }

  function renderFeedCard(item, type, idx) {
    var cls = getSemanticClass(item);
    var label = item.horizonLabel || severityLabel(item.severity || item.riskLevel);
    var valueStr = item.valueLabel || item.expectedBenefit || item.summary || "";
    
    return '<button type="button" class="aii-feed-card ' + cls + '" data-aii-detail="' + type + ':' + idx + '">' +
      '<div class="aii-feed-card-header">' +
        '<span class="aii-badge">' + esc(label) + '</span>' +
        '<small>' + esc(confidenceLabel(item.confidence)) + '</small>' +
      '</div>' +
      '<strong>' + esc(item.title) + '</strong>' +
      '<em>' + esc(valueStr) + '</em>' +
    '</button>';
  }

  function renderIntelligenceStreams(state) {
    var groups = {
      risks: { id: 'risks', label: tr("aii.stream.risks", null, "Risks"), items: [], color: 'red' },
      opportunities: { id: 'opportunities', label: tr("aii.stream.opportunities", null, "Opportunities"), items: [], color: 'green' },
      forecasts: { id: 'forecasts', label: tr("aii.stream.forecasts", null, "Forecasts"), items: [], color: 'blue' },
      operations: { id: 'operations', label: tr("aii.stream.operations", null, "Operations"), items: [], color: 'amber' }
    };

    state.alerts.forEach(function(item, idx) {
      if(item.urgency === 'critical' || item.urgency === 'high') groups.risks.items.push({item: item, type: 'alerts', idx: idx});
      else groups.operations.items.push({item: item, type: 'alerts', idx: idx});
    });
    
    state.insights.forEach(function(item, idx) {
      var sev = (item.severity || "").toLowerCase();
      var cat = (item.category || "").toLowerCase();
      if (sev === 'critical' || sev === 'high' || cat === 'risk') {
        groups.risks.items.push({item: item, type: 'insights', idx: idx});
      } else if (sev === 'positive' || cat === 'opportunity' || cat === 'growth') {
        groups.opportunities.items.push({item: item, type: 'insights', idx: idx});
      } else {
        groups.operations.items.push({item: item, type: 'insights', idx: idx});
      }
    });

    state.recommendations.forEach(function(item, idx) {
      var sev = (item.riskLevel || "").toLowerCase();
      var type = (item.actionType || "").toLowerCase();
      if (sev === 'critical' || sev === 'high' || type === 'pause_product') {
        groups.risks.items.push({item: item, type: 'recommendations', idx: idx});
      } else if (type === 'optimize_shipping' || type === 'improve_cod') {
        groups.operations.items.push({item: item, type: 'recommendations', idx: idx});
      } else {
        groups.opportunities.items.push({item: item, type: 'recommendations', idx: idx});
      }
    });

    state.forecasts.forEach(function(item, idx) {
      groups.forecasts.items.push({item: item, type: 'forecasts', idx: idx});
    });

    if (!activeStream) {
      if (groups.risks.items.length) activeStream = 'risks';
      else if (groups.opportunities.items.length) activeStream = 'opportunities';
      else if (groups.forecasts.items.length) activeStream = 'forecasts';
      else activeStream = 'operations';
    }

    var navHtml = '<div class="aii-stream-nav">';
    ['risks', 'opportunities', 'forecasts', 'operations'].forEach(function(key) {
      var g = groups[key];
      var isActive = activeStream === key ? ' active ' + g.color : '';
      var isEmpty = g.items.length === 0 ? ' empty ' : '';
      navHtml += '<button type="button" class="aii-stream-tab' + isActive + isEmpty + '" data-aii-stream="' + key + '">' + 
        '<span>' + esc(g.label) + '</span>' + 
        '<strong>' + g.items.length + '</strong>' + 
        '</button>';
    });
    navHtml += '</div>';

    var activeGroup = groups[activeStream] || groups.risks;
    var contentHtml = '<div class="aii-stream-content animate-in">';
    if (activeGroup.items.length) {
      contentHtml += activeGroup.items.map(function(obj) { return renderFeedCard(obj.item, obj.type, obj.idx); }).join("");
    } else {
      contentHtml += stateBlock("empty", tr("aii.emptyStreamTitle", null, "No Data"), tr("aii.emptyStreamBody", null, "No intelligence available in this stream yet."));
    }
    contentHtml += '</div>';

    return '<section class="aii-panel aii-streams-panel">' +
      '<div class="aii-panel-head" style="margin-bottom:12px;"><div><span>' + esc(tr("aii.streamsKicker", null, "Live Feed")) + '</span><h2>' + esc(tr("aii.streamsTitle", null, "Intelligence Streams")) + '</h2></div></div>' +
      navHtml +
      '<div class="aii-streams-viewport">' + contentHtml + '</div>' +
    '</section>';
  }

  function renderDetail(state) {
    if (!selectedDetail) return "";
    var parts = selectedDetail.split(":");
    var list = state[parts[0]] || [];
    var item = list[Number(parts[1])];
    if (!item) return "";

    var ex = item.explanation || {};
    var cls = getSemanticClass(item);

    return '<section class="aii-panel aii-detail-panel ' + cls + '">' +
      '<div class="aii-panel-head">' +
        '<h2>' + esc(tr("aii.explainabilityTitle", null, "AI Analysis Details")) + '</h2>' +
        '<button type="button" class="aii-close-btn" data-aii-close="1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      '</div>' +
      '<div class="aii-detail-content animate-in">' +
        '<div class="aii-detail-top">' +
          '<span class="aii-badge">' + esc(confidenceLabel(ex.confidence || item.confidence)) + '</span>' +
          '<h3>' + esc(item.title) + '</h3>' +
          '<p>' + esc(item.summary || item.expectedBenefit || item.valueLabel || item.reason || "") + '</p>' +
        '</div>' +
        '<div class="aii-explain-block"><span>' + esc(tr("aii.why", null, "Reasoning")) + '</span><p>' + esc(ex.why || tr("aii.explain.missing", null, "Calculated based on current dashboard parameters.")) + '</p></div>' +
        ((ex.signals || item.evidence || []).length ? '<div class="aii-explain-block"><span>' + esc(tr("aii.evidence", null, "Supporting Evidence")) + '</span><ul>' + (ex.signals || item.evidence || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ul></div>' : "") +
        ((ex.limitations || []).length ? '<div class="aii-explain-block"><span>' + esc(tr("aii.limitations", null, "Limitations")) + '</span><ul>' + ex.limitations.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ul></div>' : "") +
        (ex.nextStep || item.recommendedFollowUp ? '<div class="aii-explain-block"><span>' + esc(tr("aii.nextStep", null, "Recommended Action")) + '</span><p>' + esc(ex.nextStep || item.recommendedFollowUp || "") + '</p></div>' : "") +
        (item.nextAction || item.action ? '<button type="button" class="aii-primary-action" data-aii-run-action="1">' + esc((item.nextAction || item.action).label || item.primaryActionLabel || tr("aii.action.review", null, "Execute Action")) + '</button>' : "") +
      '</div>' +
    '</section>';
  }

  function captureScrollState() {
    var state = [];
    state.push({ win: true, top: window.pageYOffset || 0, left: window.pageXOffset || 0 });
    [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.getElementById("page-dashboard"),
      document.querySelector(".dashboard-main"),
      document.querySelector(".dashboard-content"),
      document.querySelector(".dash-main"),
      document.querySelector(".dashboard-workspace"),
      document.querySelector(".dashboard-section"),
      document.querySelector(".dash-page")
    ].forEach(function (el) {
      if (el && state.indexOf(el) === -1) state.push(el);
    });
    var parent = _mountEl;
    while (parent) {
      if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
        if (state.indexOf(parent) === -1) state.push(parent);
      }
      parent = parent.parentElement;
    }
    return state.map(function (el) {
      if (el && el.win) return el;
      return { el: el, top: el.scrollTop || 0, left: el.scrollLeft || 0 };
    });
  }

  function restoreScrollState(snapshot) {
    (snapshot || []).forEach(function (item) {
      if (item && item.win) {
        try { window.scrollTo(item.left, item.top); } catch (_) {}
        return;
      }
      if (!item || !item.el) return;
      try {
        item.el.scrollTop = item.top;
        item.el.scrollLeft = item.left;
      } catch (_) {}
    });
  }

  function scheduleScrollRestore(snapshot) {
    restoreScrollState(snapshot);
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { restoreScrollState(snapshot); });
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { restoreScrollState(snapshot); });
      });
    }
    setTimeout(function () { restoreScrollState(snapshot); }, 0);
    setTimeout(function () { restoreScrollState(snapshot); }, 60);
    setTimeout(function () { restoreScrollState(snapshot); }, 180);
  }

  function renderPage() {
    if (!_mountEl) return;
    var scrollSnapshot = captureScrollState();
    lastState = currentData();
    var isRtl = window.dashboardI18n && window.dashboardI18n.isRtl();
    
    var healthScore = lastState.health.score || 0;
    var healthClass = healthScore >= 80 ? "aii-text-green" : (healthScore >= 50 ? "aii-text-amber" : "aii-text-red");
    var alertCount = lastState.alerts.length;
    var oppCount = lastState.insights.filter(function(i){ return i.category === 'opportunity' || i.severity === 'positive'; }).length;

    _mountEl.innerHTML =
      '<div class="khod-ai-section taager-ai-section" dir="' + (isRtl ? "rtl" : "ltr") + '">' +
        '<div class="aii-hero-header">' +
          '<div class="aii-hero-title">' +
            '<div class="aii-hero-icon">' + icon('diamond') + '</div>' +
            '<div>' +
              '<h1>' + esc(tr("nav.taagerAi", null, "Taager AI Copilot")) + '</h1>' +
              '<p>' + esc(tr("aii.systemStatus", null, "System connected. Ready to analyze.")) + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="aii-system-metrics">' +
            '<div class="aii-metric">' +
              '<span>' + esc(tr("aii.metric.health", null, "Health")) + '</span>' +
              '<strong class="' + healthClass + '">' + esc(num(healthScore)) + '%</strong>' +
            '</div>' +
            '<div class="aii-metric">' +
              '<span>' + esc(tr("aii.metric.alerts", null, "Alerts")) + '</span>' +
              '<strong class="' + (alertCount > 0 ? "aii-text-red" : "aii-text-blue") + '">' + esc(num(alertCount)) + '</strong>' +
            '</div>' +
            '<div class="aii-metric">' +
              '<span>' + esc(tr("aii.metric.opportunities", null, "Opportunities")) + '</span>' +
              '<strong class="' + (oppCount > 0 ? "aii-text-green" : "aii-text-blue") + '">' + esc(num(oppCount)) + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +
        renderAlerts(lastState) +
        '<div class="aii-layout-split">' +
          '<div class="aii-main-col">' +
            renderChat() +
          '</div>' +
          '<aside class="aii-side-col">' +
            (selectedDetail ? renderDetail(lastState) : renderIntelligenceStreams(lastState)) +
          '</aside>' +
        '</div>' +
      '</div>';

    wireEvents(_mountEl);
    if (window.dashboardI18n) window.dashboardI18n.apply(_mountEl);
    if (window.TaagerUI) window.TaagerUI.enhance(_mountEl);
    
    var log = _mountEl.querySelector('#aii-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
    scheduleScrollRestore(scrollSnapshot);
  }

  window.renderSectionTaagerAi = function (mountEl, data, ctx) {
    _mountEl = mountEl;
    hydrateAssistantMemory().then(function () {
      if (_mountEl === mountEl) renderPage();
    });
    renderPage();
  };

  function wireChatActionEvents(root) {
    root.querySelectorAll("[data-aii-chat-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = String(btn.getAttribute("data-aii-chat-action") || "").split(":");
        var msg = chatMessages[Number(parts[0])];
        var action = msg && msg.actions ? msg.actions[Number(parts[1])] : null;
        runAction(action);
      });
    });
  }

  function updateChatOnly() {
    if (!_mountEl) return;
    var log = _mountEl.querySelector("#aii-chat-log");
    if (!log) {
      renderPage();
      return;
    }
    var snapshot = captureScrollState();
    var input = _mountEl.querySelector("#aii-chat-input");
    var button = _mountEl.querySelector("#aii-chat-form button");
    var hadFocus = document.activeElement === input;
    log.innerHTML = chatLogHtml(chatMessages);
    wireChatActionEvents(_mountEl);
    log.scrollTop = log.scrollHeight;
    if (input) input.disabled = chatBusy;
    if (button) {
      button.disabled = chatBusy;
      if (chatBusy) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
    }
    if (hadFocus && input) {
      try { input.focus({ preventScroll: true }); } catch (_) { try { input.focus(); } catch (_) {} }
    }
    scheduleScrollRestore(snapshot);
  }

  function wireEvents(root) {
    var streamNav = root.querySelector('.aii-stream-nav');
    if (streamNav) {
      var isDown = false, dragged = false, startX, scrollLeft;
      streamNav.addEventListener('mousedown', function(e) {
        isDown = true; dragged = false;
        startX = e.pageX - streamNav.offsetLeft;
        scrollLeft = streamNav.scrollLeft;
      });
      streamNav.addEventListener('mouseleave', function() {
        isDown = false; streamNav.classList.remove('is-dragging');
      });
      streamNav.addEventListener('mouseup', function(e) {
        isDown = false; streamNav.classList.remove('is-dragging');
        if (dragged) {
          var target = e.target.closest('.aii-stream-tab');
          if (target) { target.setAttribute('data-dragged', '1'); setTimeout(function(){ target.removeAttribute('data-dragged'); }, 50); }
        }
      });
      streamNav.addEventListener('mousemove', function(e) {
        if (!isDown) return;
        e.preventDefault();
        var x = e.pageX - streamNav.offsetLeft;
        var walk = (x - startX) * 2;
        if (Math.abs(walk) > 5) {
            dragged = true;
            streamNav.classList.add('is-dragging');
        }
        streamNav.scrollLeft = scrollLeft - walk;
      });
    }

    root.querySelectorAll("[data-aii-stream]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        if (btn.hasAttribute('data-dragged')) return;
        activeStream = btn.getAttribute("data-aii-stream");
        selectedDetail = null;
        renderPage();
      });
    });
    root.querySelectorAll("[data-aii-detail]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedDetail = btn.getAttribute("data-aii-detail");
        renderPage();
      });
    });
    var btnClose = root.querySelector("[data-aii-close]");
    if (btnClose) {
      btnClose.addEventListener("click", function () {
        selectedDetail = null;
        renderPage();
      });
    }
    root.querySelectorAll("[data-aii-prompt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ask(btn.getAttribute("data-aii-prompt"));
      });
    });
    root.querySelectorAll("[data-aii-learning]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = String(btn.getAttribute("data-aii-learning") || "");
        if (!window.KhodAiSessionMemory) return;
        if (action === "save" && typeof window.KhodAiSessionMemory.confirmPendingLearning === "function") {
          var saved = window.KhodAiSessionMemory.confirmPendingLearning();
          assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
          chatMessages.push({
            sender: "assistant",
            state: "complete",
            text: uiText("Saved. I will use this rule in future recommendations: ", "تم الحفظ. هستخدم القاعدة دي في الترشيحات الجاية: ") + (saved && saved.label || "")
          });
          renderPage();
          return;
        }
        if ((action === "remove" || action === "later") && typeof window.KhodAiSessionMemory.discardPendingLearning === "function") {
          window.KhodAiSessionMemory.discardPendingLearning();
          assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
          chatMessages.push({
            sender: "assistant",
            state: "complete",
            text: action === "remove"
              ? uiText("Removed. I did not save that rule.", "اتمسح. محفظتش القاعدة دي.")
              : uiText("Okay, I will not save it now.", "تمام، مش هحفظها دلوقتي.")
          });
          renderPage();
        }
      });
    });
    wireChatActionEvents(root);
    var btnAction = root.querySelector("[data-aii-run-action]");
    if (btnAction) {
      btnAction.addEventListener("click", function () {
        if (!lastState) return;
        var parts = (selectedDetail || "insights:0").split(":");
        var item = (lastState[parts[0]] || [])[Number(parts[1])] || lastState.insights[0];
        runAction(item && (item.nextAction || item.action));
      });
    }
    var form = root.querySelector("#aii-chat-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var input = root.querySelector("#aii-chat-input");
        ask(input && input.value);
        if (input) input.value = "";
        return false;
      });
    }
  }

  function refreshMarketingSpendForAi() {
    var accountId = window.dashboardGeoData && window.dashboardGeoData.meta && window.dashboardGeoData.meta.activeAccountId;
    if (!accountId || !window.DashboardMarketingState || typeof window.DashboardMarketingState.get !== "function" || typeof window.DashboardMarketingState.load !== "function") {
      return Promise.resolve();
    }
    var current = window.DashboardMarketingState.get(accountId);
    if (current && current.summary && current.status === "connected") return Promise.resolve(current);
    return window.DashboardMarketingState.load(accountId).catch(function () { return null; });
  }

  async function ask(prompt) {
    var text = String(prompt || "").trim();
    if (!text || chatBusy) return;

    // [Taager AI DEBUG] ──────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────

    chatMessages.push({ sender: "user", state: "complete", text: text });
    chatMessages.push({ sender: "assistant", state: "pending", text: tr("ai.thinking", null, "Reading current dashboard state...") });
    chatBusy = true;
    updateChatOnly();
    await nextUiTick();
    await hydrateAssistantMemory();

    var context = {};
    var parsedIntent = null;
    var analyticsResult = null;
    var localStrategic = null;
    await refreshMarketingSpendForAi();
    var learningContext = window.getDashboardAiContext
      ? window.getDashboardAiContext({ data: window.dashboardGeoData || {} })
      : (window.buildDashboardAiContext ? window.buildDashboardAiContext({ data: window.dashboardGeoData || {} }) : {});
    if (window.KhodAiSessionMemory && assistantMemory && assistantMemory.pendingLearningSuggestion) {
      if (isLearningConfirm(text) && typeof window.KhodAiSessionMemory.confirmPendingLearning === "function") {
        var savedLearning = window.KhodAiSessionMemory.confirmPendingLearning();
        assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
        chatMessages.pop();
        chatMessages.push({
          sender: "assistant",
          state: "complete",
          text: uiText("Saved. I will use this rule in future media buying recommendations: ", "تم الحفظ. هستخدم القاعدة دي في ترشيحات الميديا باينج الجاية: ") + (savedLearning && savedLearning.label || "")
        });
        followUpSuggestions = ["What should I do next?", "Use this rule in a scale plan", "Show scale candidates", "Best cities to scale?"];
        chatBusy = false;
        updateChatOnly();
        return;
      }
      if (isLearningReject(text) && typeof window.KhodAiSessionMemory.discardPendingLearning === "function") {
        window.KhodAiSessionMemory.discardPendingLearning();
        assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
        chatMessages.pop();
        chatMessages.push({ sender: "assistant", state: "complete", text: uiText("No problem. I did not save that rule.", "تمام. محفظتش القاعدة دي.") });
        followUpSuggestions = defaultFollowUpSuggestions(null);
        chatBusy = false;
        updateChatOnly();
        return;
      }
    }
    if (window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.detectLearningSuggestion === "function") {
      var detectedLearning = window.KhodAiSessionMemory.detectLearningSuggestion(text, learningContext || {});
      if (detectedLearning && typeof window.KhodAiSessionMemory.proposeLearningSuggestion === "function") {
        var proposedLearning = window.KhodAiSessionMemory.proposeLearningSuggestion(detectedLearning, learningContext || {});
        assistantMemory = window.KhodAiSessionMemory.get ? window.KhodAiSessionMemory.get() : assistantMemory;
        chatMessages.pop();
        chatMessages.push({ sender: "assistant", state: "pending-input", text: learningPromptText(proposedLearning) });
        followUpSuggestions = ["Save it", "Do not save", "Use it in a scale plan", "What should I do next?"];
        chatBusy = false;
        updateChatOnly();
        return;
      }
    }
    if (window.KhodAiBusinessOrchestrator && window.KhodAiBusinessOrchestrator.orchestrate) {
      var orchestration = window.KhodAiBusinessOrchestrator.orchestrate(text, window.dashboardGeoData || {});
      if (orchestration.mode === "followup" || orchestration.mode === "local") {
        chatMessages.pop();
        chatMessages.push({ sender: "assistant", state: orchestration.mode === "followup" ? "pending-input" : "complete", text: orchestration.message, actions: orchestration.actions || [] });
        if (orchestration.mode === "local") rememberAssistantTurn(orchestration.context || {}, orchestration);
        chatBusy = false;
        updateChatOnly();
        return;
      }
      parsedIntent = orchestration.parsedIntent;
      analyticsResult = orchestration.analyticsResult;
      context = orchestration.context || {};
      localStrategic = orchestration.localStrategic || null;
      if (localStrategic && localStrategic.message) {
        chatMessages[chatMessages.length - 1] = {
          sender: "assistant",
          state: "pending",
          text: tr("ai.analyzing", null, "🧠 Analyzing metrics & formulating strategy..."),
          actions: []
        };
        updateChatOnly();
        await nextUiTick();
      }
    } else if (window.KhodAiIntentDetector && window.KhodAiAnalyticsEngine && window.KhodAiContextCompressor && window.KhodAiSessionMemory) {
      parsedIntent = window.KhodAiIntentDetector.parse(text, window.dashboardGeoData, window.KhodAiSessionMemory.get());
      window.KhodAiSessionMemory.update(parsedIntent);
      analyticsResult = window.KhodAiAnalyticsEngine.processIntent(parsedIntent, window.dashboardGeoData || {});
      context = window.KhodAiContextCompressor.compress(parsedIntent, analyticsResult);
    } else {
      context = window.getDashboardAiContext ? window.getDashboardAiContext({ data: window.dashboardGeoData || {} }) : (window.buildDashboardAiContext ? window.buildDashboardAiContext({ data: window.dashboardGeoData || {} }) : {});
    }

    if (parsedIntent && (parsedIntent.blockedReason || parsedIntent.localOnly || parsedIntent.aiAllowed === false)) {
      var localText = window.KhodAiAnalyticsEngine && window.KhodAiAnalyticsEngine.localResponse
        ? window.KhodAiAnalyticsEngine.localResponse(parsedIntent, analyticsResult || {})
        : tr("ai.localFallback", null, "Use local dashboard insights for now.");
      chatMessages.pop();
      chatMessages.push({ sender: "assistant", state: parsedIntent.blockedReason ? "error" : "complete", text: localText });
      rememberAssistantTurn(context, { message: localText });
      chatBusy = false;
      updateChatOnly();
      return;
    }

    if (!window.api || typeof window.api.dashboardAiQuery !== "function") {
      chatMessages.pop();
      chatMessages.push({ sender: "assistant", state: "error", text: tr("ai.unavailableMessage", null, "AI systems offline. Using cached intelligence models.") });
      chatBusy = false;
      updateChatOnly();
      return;
    }
    try {
      var response = await window.api.dashboardAiQuery({
        command: text,
        context: context,
        forceGemini: true,
        sessionId: getAiSessionId(),
        assistantMemory: assistantMemory,
        workflow: assistantMemory && assistantMemory.assistantWorkflow,
        historySummary: assistantMemory && assistantMemory.lastDiagnosis,
        history: chatMessages.slice(-8).map(function (msg) {
          return { role: msg.sender === "user" ? "user" : "assistant", text: msg.text || "" };
        })
      });
      // [Taager AI DEBUG]
      var normalized = window.KhodAiIntelligenceData ? window.KhodAiIntelligenceData.normalizeAiResponse(response) : { message: "" };
      chatMessages.pop();
      var meta = response && response.meta ? response.meta : {};
      var shouldUseLocal = localStrategic && (meta.blocked || meta.error || (meta.source === "fallback" && response.message === "AI service is not available. I am showing local dashboard guidance instead."));
      var answerText = shouldUseLocal ? localStrategic.message : (normalized.message || (localStrategic && localStrategic.message) || tr("ai.contextReady", null, "Analysis complete."));
      answerText = maybeAppendStrategyPlan(answerText, normalized.strategyPlan || (localStrategic && localStrategic.strategyPlan));
      var learningSuggestion = normalized.strategyPlan && normalized.strategyPlan.learningSuggestion;
      if (learningSuggestion && window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.proposeLearningSuggestion === "function") {
        var proposedAfterAnswer = window.KhodAiSessionMemory.proposeLearningSuggestion(learningSuggestion, context || {});
        if (proposedAfterAnswer) answerText += "\n\n" + learningPromptText(proposedAfterAnswer);
      }
      var answerActions = shouldUseLocal ? (localStrategic.actions || []) : ((normalized.actions && normalized.actions.length ? normalized.actions : (localStrategic && localStrategic.actions)) || []);
      var memoryResponse = shouldUseLocal ? Object.assign({}, localStrategic || {}, { message: answerText }) : response;
      chatMessages.push({ sender: "assistant", state: "complete", text: answerText, actions: answerActions });
      rememberAssistantTurn(context, memoryResponse);
      chatBusy = false;
      if (shouldUseLocal && localStrategic) {
        normalized = {
          message: localStrategic.message,
          insights: localStrategic.insights || [],
          recommendations: localStrategic.recommendations || [],
          forecasts: localStrategic.forecasts || [],
          alerts: localStrategic.alerts || [],
          strategyPlan: localStrategic.strategyPlan || null
        };
      }
      if (normalized.insights && normalized.insights.length) injectedAi.insights = normalized.insights.concat(injectedAi.insights).slice(0, 8);
      if (normalized.recommendations && normalized.recommendations.length) injectedAi.recommendations = normalized.recommendations.concat(injectedAi.recommendations).slice(0, 8);
      if (normalized.forecasts && normalized.forecasts.length) injectedAi.forecasts = normalized.forecasts.concat(injectedAi.forecasts).slice(0, 6);
      if (normalized.alerts && normalized.alerts.length) injectedAi.alerts = normalized.alerts.concat(injectedAi.alerts).slice(0, 6);
    } catch (err) {
      chatMessages.pop();
      if (localStrategic) {
        chatMessages.push({ sender: "assistant", state: "complete", text: localStrategic.message, actions: localStrategic.actions || [] });
        rememberAssistantTurn(context, localStrategic);
        if (localStrategic.insights && localStrategic.insights.length) injectedAi.insights = localStrategic.insights.concat(injectedAi.insights).slice(0, 8);
        if (localStrategic.recommendations && localStrategic.recommendations.length) injectedAi.recommendations = localStrategic.recommendations.concat(injectedAi.recommendations).slice(0, 8);
        if (localStrategic.alerts && localStrategic.alerts.length) injectedAi.alerts = localStrategic.alerts.concat(injectedAi.alerts).slice(0, 6);
      } else {
        chatMessages.push({ sender: "assistant", state: "error", text: tr("ai.requestFailed", null, "AI request failed.") + " " + (err && err.message ? err.message : "") });
      }
    }
    chatBusy = false;
    updateChatOnly();
  }

})();
