(function () {
  "use strict";

  let memory = {
    version: 1,
    currentProduct: null,
    currentCity: null,
    currentIntent: null,
    currentTimeframe: null,
    pendingMissingInputs: null,
    knownInputs: {
      accountSpend: null,
      productSpend: {},
      currency: null
    },
    lastStrategicQuestion: null,
    assistantWorkflow: null,
    businessMemoryByAccount: {},
    sessionSummariesById: {},
    lastDiagnosis: null,
    userPreferences: { mediaBuying: {} },
    pendingLearningSuggestion: null,
    hydrated: false,
    updatedAt: null
  };

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 240);
  }

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function mergeKnownInputs(target, source) {
    source = isObject(source) ? source : {};
    target.knownInputs = target.knownInputs || { accountSpend: null, productSpend: {}, currency: null };
    if (source.accountSpend) target.knownInputs.accountSpend = source.accountSpend;
    if (source.currency) target.knownInputs.currency = clean(source.currency, 12);
    if (isObject(source.productSpend)) {
      target.knownInputs.productSpend = Object.assign({}, target.knownInputs.productSpend || {}, source.productSpend);
    }
  }

  function mergePersistent(value) {
    if (!isObject(value)) return memory;
    memory.version = 1;
    memory.businessMemoryByAccount = Object.assign({}, memory.businessMemoryByAccount || {}, isObject(value.businessMemoryByAccount) ? value.businessMemoryByAccount : {});
    memory.sessionSummariesById = Object.assign({}, memory.sessionSummariesById || {}, isObject(value.sessionSummariesById) ? value.sessionSummariesById : {});
    mergeKnownInputs(memory, value.knownInputs);
    memory.lastDiagnosis = isObject(value.lastDiagnosis) ? value.lastDiagnosis : memory.lastDiagnosis;
    memory.assistantWorkflow = isObject(value.activeWorkflow) ? value.activeWorkflow : (isObject(value.assistantWorkflow) ? value.assistantWorkflow : memory.assistantWorkflow);
    memory.userPreferences = Object.assign({ mediaBuying: {} }, memory.userPreferences || {}, isObject(value.userPreferences) ? value.userPreferences : {});
    memory.userPreferences.mediaBuying = Object.assign({}, memory.userPreferences.mediaBuying || {}, isObject(value.userPreferences && value.userPreferences.mediaBuying) ? value.userPreferences.mediaBuying : {});
    memory.pendingLearningSuggestion = isObject(value.pendingLearningSuggestion) ? value.pendingLearningSuggestion : memory.pendingLearningSuggestion;
    if (memory.lastDiagnosis) {
      memory.currentProduct = memory.currentProduct || memory.lastDiagnosis.product || null;
      memory.currentCity = memory.currentCity || memory.lastDiagnosis.city || null;
      memory.currentIntent = memory.currentIntent || memory.lastDiagnosis.intent || null;
    }
    memory.updatedAt = value.updatedAt || memory.updatedAt;
    return memory;
  }

  function persistentSnapshot(extra) {
    extra = isObject(extra) ? extra : {};
    return Object.assign({
      version: 1,
      businessMemoryByAccount: memory.businessMemoryByAccount || {},
      sessionSummariesById: memory.sessionSummariesById || {},
      knownInputs: memory.knownInputs || { accountSpend: null, productSpend: {}, currency: null },
      lastDiagnosis: memory.lastDiagnosis || null,
      activeWorkflow: memory.assistantWorkflow || null,
      userPreferences: memory.userPreferences || { mediaBuying: {} },
      pendingLearningSuggestion: memory.pendingLearningSuggestion || null,
      updatedAt: new Date().toISOString()
    }, extra);
  }

  function persist(delta) {
    if (!window.api || typeof window.api.saveAiAssistantMemory !== "function") return Promise.resolve({ ok: false });
    return window.api.saveAiAssistantMemory(delta || persistentSnapshot()).then(function (result) {
      if (result && result.memory) mergePersistent(result.memory);
      return result;
    }).catch(function () {
      return { ok: false };
    });
  }

  function hydrate() {
    if (!window.api || typeof window.api.getAiAssistantMemory !== "function") {
      memory.hydrated = true;
      return Promise.resolve(memory);
    }
    return window.api.getAiAssistantMemory().then(function (result) {
      if (result && result.memory) mergePersistent(result.memory);
      memory.hydrated = true;
      return memory;
    }).catch(function () {
      memory.hydrated = true;
      return memory;
    });
  }

  function update(parsedIntent) {
    if (!parsedIntent) return;
    if (parsedIntent.entities.products && parsedIntent.entities.products.length > 0) {
      memory.currentProduct = parsedIntent.entities.products[0];
    }
    if (parsedIntent.entities.cities && parsedIntent.entities.cities.length > 0) {
      memory.currentCity = parsedIntent.entities.cities[0];
    }
    memory.currentIntent = parsedIntent.intent;
    memory.lastStrategicQuestion = parsedIntent.rawText || memory.lastStrategicQuestion;
    if (parsedIntent.entities && parsedIntent.entities.dates && parsedIntent.entities.dates.length) {
      memory.currentTimeframe = parsedIntent.entities.dates[0];
    }
  }

  function rememberBusinessContext(context, response) {
    context = context || {};
    response = response || {};
    var focus = context.sessionFocus || {};
    var accountKey = clean((focus.accountId || context.account && context.account.activeAccountId || focus.account || context.account && context.account.activeAccountLabel) || "__all__", 120) || "__all__";
    var diagnosis = {
      question: clean(context.question || memory.lastStrategicQuestion, 500),
      intent: clean(context.intent || memory.currentIntent, 80),
      account: accountKey,
      product: focus.product || (context.selectedProduct && context.selectedProduct.name) || memory.currentProduct || null,
      city: focus.city || (context.selectedCity && context.selectedCity.name) || memory.currentCity || null,
      summary: clean(response.message || (context.localStrategicSkeleton && context.localStrategicSkeleton.message), 900),
      decision: response.decision || null,
      followUpQuestions: Array.isArray(response.followUpQuestions) ? response.followUpQuestions.slice(0, 4) : [],
      updatedAt: new Date().toISOString()
    };
    memory.lastDiagnosis = diagnosis;
    memory.businessMemoryByAccount[accountKey] = Object.assign({}, memory.businessMemoryByAccount[accountKey] || {}, {
      lastDiagnosis: diagnosis,
      lastProduct: diagnosis.product,
      lastCity: diagnosis.city,
      updatedAt: diagnosis.updatedAt
    });
    if (response.workflow || context.assistantWorkflow) {
      memory.assistantWorkflow = response.workflow || context.assistantWorkflow;
    }
    return persist({
      businessMemoryByAccount: memory.businessMemoryByAccount,
      knownInputs: memory.knownInputs,
      lastDiagnosis: memory.lastDiagnosis,
      activeWorkflow: memory.assistantWorkflow
    });
  }

  function applyMemoryUpdates(updates) {
    if (!isObject(updates)) return Promise.resolve({ ok: false });
    if (updates.knownInputs) mergeKnownInputs(memory, updates.knownInputs);
    if (updates.lastDiagnosis) memory.lastDiagnosis = updates.lastDiagnosis;
    if (updates.activeWorkflow || updates.workflow) memory.assistantWorkflow = updates.activeWorkflow || updates.workflow;
    if (updates.userPreferences) memory.userPreferences = Object.assign({}, memory.userPreferences || {}, updates.userPreferences);
    if (updates.userPreferences && updates.userPreferences.mediaBuying) {
      memory.userPreferences.mediaBuying = Object.assign({}, memory.userPreferences.mediaBuying || {}, updates.userPreferences.mediaBuying);
    }
    if (updates.businessMemoryByAccount) memory.businessMemoryByAccount = Object.assign({}, memory.businessMemoryByAccount || {}, updates.businessMemoryByAccount);
    if (updates.pendingLearningSuggestion !== undefined) memory.pendingLearningSuggestion = isObject(updates.pendingLearningSuggestion) ? updates.pendingLearningSuggestion : null;
    return persist(persistentSnapshot(updates));
  }

  function get() {
    return memory;
  }

  function setPending(pending) {
    memory.pendingMissingInputs = pending || null;
    persist({ activeWorkflow: memory.assistantWorkflow, knownInputs: memory.knownInputs });
  }

  function clearPending() {
    memory.pendingMissingInputs = null;
    persist({ activeWorkflow: memory.assistantWorkflow, knownInputs: memory.knownInputs });
  }

  function rememberInput(scope, key, value) {
    if (!scope || !key) return;
    if (scope === "productSpend") {
      memory.knownInputs.productSpend[key] = value;
      persist({ knownInputs: memory.knownInputs });
      return;
    }
    memory.knownInputs[key] = value;
    persist({ knownInputs: memory.knownInputs });
  }

  function setWorkflow(workflow) {
    memory.assistantWorkflow = workflow || null;
    persist({ activeWorkflow: memory.assistantWorkflow });
  }

  function accountKeyFromContext(context) {
    context = context || {};
    var focus = context.sessionFocus || {};
    var account = focus.accountId || context.account && context.account.activeAccountId || focus.account || context.account && context.account.activeAccountLabel || "__all__";
    return clean(account, 120) || "__all__";
  }

  function normalizeLearningSuggestion(value, context) {
    if (!isObject(value)) return null;
    var scope = clean(value.scope || value.category || "mediaBuying", 40);
    var key = clean(value.key || value.ruleKey || "strategy_rule", 80);
    var label = clean(value.label || value.summary || value.value || "", 220);
    var rawValue = value.value != null ? value.value : label;
    var accountScope = clean(value.accountScope || "", 40);
    var account = accountScope === "all_accounts" ? "__all__" : accountKeyFromContext(context || {});
    if (!label && rawValue != null) label = clean(rawValue, 220);
    if (!label) return null;
    return {
      id: "learn-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      scope: scope,
      key: key,
      label: label,
      value: typeof rawValue === "object" ? rawValue : clean(rawValue, 300),
      account: account,
      accountScope: accountScope || (account === "__all__" ? "all_accounts" : "single_account"),
      accountLabel: clean(context && context.sessionFocus && (context.sessionFocus.accountLabel || context.sessionFocus.account) || context && context.account && context.account.activeAccountLabel || "", 120) || null,
      product: clean(value.product || context && context.sessionFocus && context.sessionFocus.product || "", 120) || null,
      city: clean(value.city || context && context.sessionFocus && context.sessionFocus.city || "", 120) || null,
      createdAt: new Date().toISOString()
    };
  }

  function detectLearningSuggestion(text, context) {
    var cleaned = clean(text, 500);
    var isQuestion = /[?؟]\s*$/.test(cleaned) || /^(what|which|why|how|can|should|do you|tell me|show me|اعمل|ما|ماذا|هل|ازاي|كيف)\b/i.test(cleaned);
    var stableSignal = /\b(remember|save|learn|always|usually|prefer|preference|rule|don't|do not|only scale|never scale|minimum ndr|max cpa|budget step)\b/i.test(cleaned);
    var implicitBusinessFact = !isQuestion &&
      /\b(i|we|our|this account|this client|this member|this product|this city|for this account|for this client|for this member|for this product|for this city|for all accounts|all accounts|كل الحسابات|العميل|الحساب|الممبر|العضو)\b/i.test(cleaned) &&
      /\b(scale|scaling|budget|campaign|ad group|creative|hook|ugc|tiktok|snapchat|facebook|meta|platform|city|delivery|supplier|stock|refund|ndr|cpa|cod|prepaid|target|exclude|pause|test)\b/i.test(cleaned);
    if (!stableSignal && !implicitBusinessFact) return null;
    var lower = cleaned.toLowerCase();
    var key = "strategy_rule";
    if (/\bbudget|scale\b/i.test(cleaned)) key = "scalingRule";
    if (/\bplatform|tiktok|snapchat|facebook|meta\b/i.test(cleaned)) key = "platformPreference";
    if (/\bcreative|hook|ugc\b/i.test(cleaned)) key = "creativePreference";
    if (/\bcpa\b/i.test(cleaned)) key = "cpaRule";
    if (/\bndr\b/i.test(cleaned)) key = "minimumNdrRule";
    if (/\bsupplier|stock|quality|refund\b/i.test(cleaned)) key = "productOperationalNote";
    if (/\bcity|target|exclude|delivery\b/i.test(cleaned)) key = "cityOrTargetingNote";
    var scope = "mediaBuying";
    if (/\b(product|supplier|stock|quality|refund)\b/i.test(cleaned) && context && context.sessionFocus && context.sessionFocus.product) scope = "productNotes";
    if (/\b(city|target|exclude|delivery)\b/i.test(cleaned) && context && context.sessionFocus && context.sessionFocus.city) scope = "cityNotes";
    if (/\b(this account|this client|this member|for this account|for this client|for this member|all accounts|كل الحسابات|الحساب|العميل|الممبر|العضو)\b/i.test(cleaned)) scope = "mediaBuying";
    return normalizeLearningSuggestion({
      scope: scope,
      key: key,
      label: cleaned.replace(/^(please\s+)?(remember|save|learn)\s+(that\s+)?/i, ""),
      value: cleaned,
      category: scope,
      accountScope: lower.indexOf("all accounts") !== -1 || lower.indexOf("كل الحسابات") !== -1 ? "all_accounts" : null
    }, context || {});
  }

  function proposeLearningSuggestion(suggestion, context) {
    var normalized = normalizeLearningSuggestion(suggestion, context || {});
    if (!normalized) return null;
    memory.pendingLearningSuggestion = normalized;
    persist({ pendingLearningSuggestion: normalized });
    return normalized;
  }

  function confirmPendingLearning() {
    var pending = memory.pendingLearningSuggestion;
    if (!pending) return null;
    var account = pending.account || "__all__";
    var accountMemory = Object.assign({
      strategyRules: {},
      productNotes: {},
      cityNotes: {}
    }, memory.businessMemoryByAccount[account] || {});
    if (pending.scope === "productNotes" && pending.product) {
      accountMemory.productNotes[pending.product] = Object.assign({}, accountMemory.productNotes[pending.product] || {}, { note: pending.value, updatedAt: new Date().toISOString() });
    } else if (pending.scope === "cityNotes" && pending.city) {
      accountMemory.cityNotes[pending.city] = Object.assign({}, accountMemory.cityNotes[pending.city] || {}, { note: pending.value, updatedAt: new Date().toISOString() });
    } else {
      accountMemory.strategyRules[pending.key] = {
        label: pending.label,
        value: pending.value,
        product: pending.product,
        city: pending.city,
        accountScope: pending.accountScope || "single_account",
        updatedAt: new Date().toISOString()
      };
      memory.userPreferences.mediaBuying[pending.key] = pending.value;
    }
    accountMemory.updatedAt = new Date().toISOString();
    memory.businessMemoryByAccount[account] = accountMemory;
    memory.pendingLearningSuggestion = null;
    persist(persistentSnapshot({
      businessMemoryByAccount: memory.businessMemoryByAccount,
      userPreferences: memory.userPreferences,
      pendingLearningSuggestion: null
    }));
    return pending;
  }

  function discardPendingLearning() {
    var pending = memory.pendingLearningSuggestion;
    memory.pendingLearningSuggestion = null;
    persist({ pendingLearningSuggestion: null });
    return pending;
  }

  function clear() {
    memory = {
      version: 1,
      currentProduct: null,
      currentCity: null,
      currentIntent: null,
      currentTimeframe: null,
      pendingMissingInputs: null,
      knownInputs: {
        accountSpend: null,
        productSpend: {},
        currency: null
      },
      lastStrategicQuestion: null,
      assistantWorkflow: null,
      businessMemoryByAccount: {},
      sessionSummariesById: {},
      lastDiagnosis: null,
      userPreferences: { mediaBuying: {} },
      pendingLearningSuggestion: null,
      hydrated: true,
      updatedAt: null
    };
    if (window.api && typeof window.api.clearAiAssistantMemory === "function") {
      window.api.clearAiAssistantMemory("all").catch(function () {});
    }
  }

  window.KhodAiSessionMemory = {
    update,
    get,
    hydrate,
    persist,
    mergePersistent,
    applyMemoryUpdates,
    rememberBusinessContext,
    setPending,
    clearPending,
    rememberInput,
    setWorkflow,
    detectLearningSuggestion,
    proposeLearningSuggestion,
    confirmPendingLearning,
    discardPendingLearning,
    clear
  };

})();
