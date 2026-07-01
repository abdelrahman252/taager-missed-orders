(function () {
  "use strict";

  var LOCAL_ONLY = {};

  function num(value) {
    return Number(value || 0);
  }

  function pct(value) {
    var n = Number(value || 0);
    return n > 1 ? n : n * 100;
  }

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 180);
  }

  function responseLanguage(text) {
    if (window.KhodAiShared && typeof window.KhodAiShared.responseLanguage === "function") {
      return window.KhodAiShared.responseLanguage(text);
    }
    return /[\u0600-\u06ff]/.test(String(text || "")) ? "ar" : "en";
  }

  function fmt(value) {
    return Math.round(num(value)).toLocaleString("en-US");
  }

  function productKey(value) {
    return clean(value, 120).toLowerCase();
  }

  function slug(value) {
    return encodeURIComponent(clean(value, 180));
  }

  function getMemory() {
    return window.KhodAiSessionMemory && window.KhodAiSessionMemory.get
      ? window.KhodAiSessionMemory.get()
      : {};
  }

  function getProducts(data) {
    return (data && data.products && data.products.rankedList) || [];
  }

  function getCities(data) {
    var stats = data && data.geo && data.geo.cityStats ? data.geo.cityStats : {};
    return Object.keys(stats).map(function (name) {
      return Object.assign({ name: name }, stats[name] || {});
    });
  }

  function findProduct(data, name) {
    var wanted = productKey(name);
    if (!wanted) return null;
    return getProducts(data).find(function (p) {
      return productKey(p.name) === wanted || productKey(p.sku) === wanted || productKey(p.key) === wanted;
    }) || null;
  }

  function findCity(data, name) {
    var wanted = productKey(name);
    if (!wanted) return null;
    return getCities(data).find(function (c) { return productKey(c.name) === wanted; }) || null;
  }

  function readSavedProductSpend(product) {
    if (!product || !window.localStorage) return null;
    var ids = [product.key, product.sku, product.name].filter(Boolean);
    for (var i = 0; i < ids.length; i += 1) {
      var raw = window.localStorage.getItem("kbot_s9_spend_" + ids[i]);
      var n = Number(raw);
      if (n > 0) return n;
    }
    return null;
  }

  function normalizeRoiSettings(value) {
    value = value || {};
    var adSpend = Number(value.adSpend);
    var egpRate = Number(value.egpRate);
    var currency = clean(value.currency || "SAR", 12).toUpperCase();
    return {
      adSpend: isFinite(adSpend) && adSpend >= 0 ? adSpend : 0,
      currency: /^(SAR|USD|EGP|AED|IQD|OMR)$/.test(currency) ? currency : (window.dashboardActiveCurrency || "SAR"),
      egpRate: isFinite(egpRate) && egpRate > 0 ? egpRate : 52
    };
  }

  function readAccountRoiSettings(data) {
    var accountId = data && data.meta && data.meta.activeAccountId ? data.meta.activeAccountId : "__all__";
    var fallback = data && data.roi ? data.roi : {};
    var marketing = window.DashboardMarketingState && typeof window.DashboardMarketingState.get === "function"
      ? window.DashboardMarketingState.get(accountId)
      : null;
    var syncedSummary = marketing && marketing.status === "connected" && marketing.summary && !marketing.manualOverride
      ? marketing.summary
      : null;
    var stored = null;
    var hasStoredSpend = false;
    try {
      if (window.localStorage) {
        stored = JSON.parse(
          window.localStorage.getItem("taager_roi_settings_" + accountId) ||
          window.localStorage.getItem("khod_roi_settings_" + accountId) ||
          "null"
        );
        hasStoredSpend = !!(stored && isFinite(Number(stored.adSpend)) && Number(stored.adSpend) > 0);
      }
    } catch (_) {}
    if (syncedSummary && Number(syncedSummary.adSpend) > 0) {
      var syncedCurrency = (syncedSummary.currency || marketing.currency || (stored && stored.currency) || fallback.currency || "SAR");
      var synced = normalizeRoiSettings({
        adSpend: syncedSummary.adSpend,
        currency: syncedCurrency,
        egpRate: stored && stored.egpRate || fallback.egpRate || 52
      });
      synced.hasExplicitSpend = true;
      synced.source = "syncedMarketing";
      synced.platforms = marketing.summary.platformBreakdown || [];
      synced.lastSyncAt = marketing.lastSyncAt || syncedSummary.lastSyncAt || null;
      return synced;
    }
    var settings = normalizeRoiSettings(stored || {
      adSpend: fallback.adSpend,
      currency: fallback.currency || "SAR",
      egpRate: fallback.egpRate || 52
    });
    settings.hasExplicitSpend = hasStoredSpend;
    settings.source = hasStoredSpend ? "savedCalculator" : "missing";
    return settings;
  }

  function accountAllocatedProductSpend(data, product) {
    if (!product) return null;
    var settings = readAccountRoiSettings(data || {});
    if (!settings.adSpend || !settings.hasExplicitSpend) return null;
    var products = getProducts(data || {});
    var totalPlaced = products.reduce(function (sum, p) {
      return sum + num(p.netOrderCount != null ? p.netOrderCount : (p.orders != null ? p.orders : p.placedCount));
    }, 0);
    var placed = num(product.netOrderCount != null ? product.netOrderCount : (product.orders != null ? product.orders : product.placedCount));
    if (!totalPlaced || !placed) return null;
    return {
      amount: Math.round((settings.adSpend * placed / totalPlaced) * 100) / 100,
      currency: settings.currency,
      source: "allocatedAccountSpend",
      accountSpend: settings.adSpend
    };
  }

  function extractMoneyAnswer(text) {
    var raw = clean(text, 120);
    var match = raw.match(/(?:spend|spent|budget|ad\s*spend)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(sar|usd|egp|aed|iqd|omr|ريال|دولار|جنيه|درهم|دينار)?/i);
    if (!match) return null;
    var amount = Number(String(match[1]).replace(/,/g, ""));
    if (!amount || amount <= 0) return null;
    var currency = (match[2] || "").toUpperCase();
    if (currency === "ريال") currency = "SAR";
    if (currency === "دولار") currency = "USD";
    if (currency === "جنيه") currency = "EGP";
    if (currency === "درهم") currency = "AED";
    if (currency === "دينار") currency = "IQD";
    return { amount: amount, currency: currency || null };
  }

  function normalizeCurrency(value) {
    var currency = clean(value, 20).toUpperCase();
    if (currency === "ريال") return "SAR";
    if (currency === "دولار") return "USD";
    if (currency === "جنيه") return "EGP";
    if (currency === "درهم") return "AED";
    if (currency === "دينار") return "IQD";
    return /^(SAR|USD|EGP|AED|IQD|OMR)$/.test(currency) ? currency : null;
  }

  function roiEgpRate(data) {
    var roi = data && data.roi ? data.roi : {};
    var settings = readAccountRoiSettings(data || {});
    return Number(settings.egpRate || roi.egpRate || 52) || 52;
  }

  function sarToCurrency(valueSar, currency, data) {
    var sar = num(valueSar);
    currency = normalizeCurrency(currency || "SAR") || "SAR";
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === "function") {
      return window.TaagerCurrency.convert(sar, window.dashboardActiveCurrency || "SAR", currency);
    }
    if (currency === "USD") return sar / 3.75;
    if (currency === "EGP") return (sar / 3.75) * roiEgpRate(data || {});
    return sar;
  }

  function breakEvenCpaSar(avgCommissionSar, ndrPct) {
    return num(avgCommissionSar) * (pct(ndrPct) / 100);
  }

  function maybeResolvePending(text, memory) {
    var pending = memory && memory.pendingMissingInputs;
    if (!pending) return null;
    var cleaned = clean(text, 500);
    var looksLikeArabicQuestion =
      /(?:ما|ماذا|لماذا|ليه|كيف|أي|اي|أين|اين|اعرض|أظهر|اظهر|حلل|قارن).*(?:حساب|مدينة|مدن|منتج|منتجات|NDR|CPA|ربح|خسار|طلبات)/i.test(cleaned) ||
      /(?:أفضل|افضل|أضعف|اضعف|أسوأ|اسوأ|أقل|اقل|أعلى|اعلى).*(?:مدن|منتجات|حملات)/i.test(cleaned);
    var looksLikePlanRequest =
      /\b(?:build|make|create|give me)\b.*\b(?:scale|scaling|growth)\s+plan\b|\bplan\b.*\b(?:scale|scaling|growth)\b/i.test(cleaned) ||
      /(?:ابن|اعمل|ضع|جهز).*خطة.*(?:توسع|توسيع)|خطة.*(?:توسع|توسيع)/.test(cleaned);
    var looksLikeNewQuestion =
      /\b(what|which|why|how|show|top|worst|best|strongest|weakest|highest|lowest|analyze|compare)\b/i.test(cleaned) ||
      (/\b(account|city|cities|product|products|app|apps|ndr|cpa|roi|profit|commission|orders)\b/i.test(cleaned) && /\?/.test(cleaned)) ||
      looksLikeArabicQuestion ||
      looksLikePlanRequest;
    if (pending.scope === "product_lookup") {
      if (looksLikeNewQuestion) {
        if (window.KhodAiSessionMemory) window.KhodAiSessionMemory.clearPending();
        return null;
      }
      if (window.KhodAiSessionMemory) window.KhodAiSessionMemory.clearPending();
      return {
        mode: "resume",
        text: (pending.originalQuestion || "") + " " + clean(text, 240)
      };
    }
    var money = extractMoneyAnswer(text);
    var currencyOnly = clean(text, 20).match(/^(sar|usd|egp|aed|iqd|omr|ريال|دولار|جنيه|درهم|دينار)$/i);
    if (!money && !currencyOnly && looksLikeNewQuestion) {
      if (window.KhodAiSessionMemory) window.KhodAiSessionMemory.clearPending();
      return null;
    }
    if (!money && pending.amount && currencyOnly) {
      money = { amount: pending.amount, currency: normalizeCurrency(currencyOnly[1]) };
    }
    if (!money) {
      return {
        mode: "followup",
        message: responseLanguage(pending.originalQuestion || text) === "ar"
          ? "ما زلت أحتاج مبلغ الإنفاق والعملة لإكمال تحليل الربحية. أرسله مثل: 500 SAR أو 120 USD أو 8000 EGP أو 250 AED."
          : "I still need the spend amount and currency to finish the profitability analysis. Please send it like: 500 SAR, 120 USD, 8000 EGP, or 250 AED."
      };
    }
    var currency = normalizeCurrency(money.currency || pending.currency || memory.knownInputs && memory.knownInputs.currency);
    if (!currency) {
      if (window.KhodAiSessionMemory) {
        window.KhodAiSessionMemory.setPending(Object.assign({}, pending, { amount: money.amount }));
      }
      return {
        mode: "followup",
        message: responseLanguage(pending.originalQuestion || text) === "ar"
          ? "تم استلام مبلغ الإنفاق. ما العملة: SAR أو USD أو EGP أو AED أو IQD أو OMR؟"
          : "Got the spend amount. Which currency is it in: SAR, USD, EGP, AED, IQD, or OMR?"
      };
    }
    if (window.KhodAiSessionMemory) {
      if (pending.scope === "product" && pending.product) {
        window.KhodAiSessionMemory.rememberInput("productSpend", productKey(pending.product), {
          amount: money.amount,
          currency: currency
        });
      } else {
        window.KhodAiSessionMemory.rememberInput("knownInputs", "accountSpend", {
          amount: money.amount,
          currency: currency
        });
      }
      window.KhodAiSessionMemory.rememberInput("knownInputs", "currency", currency);
      window.KhodAiSessionMemory.clearPending();
    }
    return {
      mode: "resume",
      text: pending.originalQuestion || memory.lastStrategicQuestion || text
    };
  }

  function isVagueActionFollowUp(text) {
    var cleaned = clean(text, 240).toLowerCase().replace(/[?؟!.]+$/g, "").trim();
    return /^(what\s+should\s+i\s+do|what\s+do\s+i\s+do|what\s+next|next|and\s+now|now\s+what|how\s+to\s+fix\s+it|fix\s+it|help\s+me|help\s+me\s+do\s+it|do\s+it|start)$/i.test(cleaned) ||
      /^(اعمل ايه|اعمل ماذا|ايه الحل|ما الحل|وبعدين|الخطوة التالية|ساعدني|ابدأ)$/i.test(cleaned);
  }

  function isStepByStepFollowUp(text) {
    var cleaned = clean(text, 300).toLowerCase().replace(/[?؟!.]+$/g, "").trim();
    return /\b(step\s*by\s*step|steps?|walk\s+me\s+through|guide\s+me|one\s+by\s+one|next\s+step)\b/i.test(cleaned) ||
      /خطوة|خطوات|بالتدريج|واحدة واحدة|دلني|ارشدني/.test(cleaned);
  }

  function resolveAssistantFollowUp(text, memory) {
    memory = memory || {};
    if (!memory.lastStrategicQuestion) return { text: text, actionFollowUp: false, stepByStep: isStepByStepFollowUp(text) };
    var actionFollowUp = isVagueActionFollowUp(text);
    var stepByStep = isStepByStepFollowUp(text);
    if (!actionFollowUp && !stepByStep) return { text: text, actionFollowUp: false, stepByStep: false };
    return {
      text: memory.lastStrategicQuestion + " " + text,
      actionFollowUp: actionFollowUp,
      stepByStep: stepByStep
    };
  }

  function needsProfitabilityInputs(parsedIntent) {
    var text = clean(parsedIntent.rawText, 500).toLowerCase();
    if (parsedIntent.intent === "RANKING_QUERY") return false;
    if (parsedIntent.intent === "LOSS_ANALYSIS") return true;
    if (parsedIntent.intent === "SCALE_ANALYSIS") {
      return /\b(margin|cpa|roi|roas|budget|spend|ad\s*spend|losing|loss)\b/i.test(text);
    }
    return /\b(why|losing|loss|profit|profitable|margin|cpa|roi|roas|scale|budget|spend)\b/i.test(text);
  }

  function hasDashboardAccountCpa(data) {
    var roi = data && data.roi || {};
    return roi.avgCPA != null || roi.actualCpa != null || roi.cpa != null;
  }

  function getKnownProductSpend(productName, product, data) {
    var memory = getMemory();
    var saved = memory.knownInputs && memory.knownInputs.productSpend
      ? memory.knownInputs.productSpend[productKey(productName)]
      : null;
    if (saved && saved.amount) return saved;
    var local = readSavedProductSpend(product);
    if (local) {
      return {
        amount: local,
        currency: memory.knownInputs && memory.knownInputs.currency || "SAR"
      };
    }
    var allocated = accountAllocatedProductSpend(data, product);
    if (allocated) return allocated;
    return null;
  }

  function validateDependencies(parsedIntent, analytics, data) {
    if (!needsProfitabilityInputs(parsedIntent)) return { ok: true, missing: [] };
    var productName = parsedIntent.entities.products[0] || getMemory().currentProduct;
    var product = findProduct(data, productName);
    var missing = [];
    var accountSettings = readAccountRoiSettings(data || {});
    var accountSpend = getMemory().knownInputs && getMemory().knownInputs.accountSpend;
    if ((!accountSpend || !accountSpend.amount) && accountSettings.adSpend && accountSettings.hasExplicitSpend) {
      accountSpend = {
        amount: accountSettings.adSpend,
        currency: accountSettings.currency,
        source: "accountCalculator"
      };
    }
    var spend = productName ? getKnownProductSpend(productName, product, data) : accountSpend;
    var currency = spend && spend.currency || getMemory().knownInputs && getMemory().knownInputs.currency;

    if (!productName && parsedIntent.intent === "KPI_ANALYSIS" && /\bcpa\b/i.test(clean(parsedIntent.rawText, 500)) && hasDashboardAccountCpa(data)) {
      return { ok: true, missing: [], spend: spend || null, currency: currency || accountSettings.currency || "SAR" };
    }

    if (!spend || !spend.amount) missing.push("spend");
    if (!currency) missing.push("currency");
    if (!missing.length) return { ok: true, missing: [], spend: spend, currency: currency };

    return {
      ok: false,
      missing: missing,
      product: productName || "",
      scope: productName ? "product" : "account",
      message: responseLanguage(parsedIntent.rawText) === "ar"
        ? (productName
          ? "يمكنني تحليل " + productName + "، لكن أحتاج إنفاقه الإعلاني والعملة لحساب CPA والربحية بدقة. كم أنفقت وبأي عملة (SAR/USD/EGP/AED/IQD/OMR)؟"
          : "يمكنني تحليل الحساب، لكن أحتاج الإنفاق الإعلاني والعملة لحساب CPA والربحية بدقة. كم أنفقت وبأي عملة (SAR/USD/EGP/AED/IQD/OMR)؟")
        : (productName
          ? "I can analyze " + productName + ", but I still need the advertising spend for this product to calculate CPA and profitability accurately. How much did you spend, and in which currency (SAR/USD/EGP/AED/IQD/OMR)?"
          : "I can analyze the account, but I need the advertising spend and currency to calculate CPA and profitability accurately. How much did you spend, and in which currency (SAR/USD/EGP/AED/IQD/OMR)?")
    };
  }

  function validateCalculatorDependencies(parsedIntent) {
    if (!parsedIntent || parsedIntent.intent !== "CALCULATOR_SIMULATION") return { ok: true, missing: [] };
    var text = clean(parsedIntent.rawText, 500).toLowerCase();
    if (!/\b(no|missing|without|unknown|don'?t have)\b/.test(text)) return { ok: true, missing: [] };
    var missing = [];
    if (/\bcurrency\b/i.test(text)) missing.push("currency");
    if (/\b(spend|budget|cpa|roi|roas|margin)\b/i.test(text)) missing.push("calculatorInputs");
    if (!missing.length) missing.push("calculatorInputs");
    return {
      ok: false,
      missing: missing,
      scope: "calculator",
      message: responseLanguage(parsedIntent.rawText) === "ar"
        ? "يمكنني تشغيل الحاسبة محليًا، لكن أحتاج أولًا إلى البيانات الناقصة: " + missing.join(" و") + ". أرسل المبلغ والعملة، مثل 500 SAR."
        : "I can run the calculator locally, but I need the missing calculator input first: " + missing.join(" and ") + ". Send the amount and currency, for example 500 SAR."
    };
  }

  function productSummary(product, spend, data) {
    if (!product) return null;
    var orders = num(product.placedCount || product.orders);
    var delivered = num(product.deliveredCount || product.units);
    var commission = num(product.commission);
    var deliveredSales = num(product.deliveredSales || product.totalDeliveredSales);
    var deliveredAov = num(product.deliveredAov || (delivered ? deliveredSales / Math.max(1, delivered) : 0));
    var ndr = pct(product.ndrPct || product.deliveryPct || (orders ? delivered / orders : 0));
    var cancel = pct(product.cancelPct || 0);
    var cpa = spend && spend.amount && orders ? spend.amount / orders : null;
    var avgCommissionSar = delivered > 0 ? commission / Math.max(1, delivered) : 0;
    var breakEvenSar = breakEvenCpaSar(avgCommissionSar, ndr);
    var breakEvenCurrency = spend && spend.currency || data && data.roi && data.roi.currency || "SAR";
    var breakEven = sarToCurrency(breakEvenSar, breakEvenCurrency, data);
    var profit = spend && spend.amount ? commission - spend.amount : null;
    var margin = profit != null && commission ? (profit / commission) * 100 : null;
    return {
      name: product.name || product.key || product.sku,
      sku: product.sku || "",
      orders: orders,
      delivered: delivered,
      ndr: Math.round(ndr * 10) / 10,
      cancelRate: Math.round(cancel * 10) / 10,
      commission: Math.round(commission * 100) / 100,
      deliveredSales: Math.round(deliveredSales * 100) / 100,
      deliveredAov: Math.round(deliveredAov * 100) / 100,
      spend: spend || null,
      cpa: cpa == null ? null : Math.round(cpa * 100) / 100,
      avgCommissionSar: Math.round(avgCommissionSar * 100) / 100,
      breakEvenCpaSar: Math.round(breakEvenSar * 100) / 100,
      breakEvenCpa: Math.round(breakEven * 100) / 100,
      breakEvenCurrency: breakEvenCurrency,
      isCpaAboveBreakEven: cpa == null || !breakEven ? null : cpa > breakEven,
      profit: profit == null ? null : Math.round(profit * 100) / 100,
      marginPct: margin == null ? null : Math.round(margin * 10) / 10,
      spendSource: spend && spend.source || null,
      topCities: (product.cityBreakdown || []).slice(0, 5).map(function (c) {
        return {
          city: c.name,
          orders: num(c.count || c.orders),
          ndr: Math.round(pct(c.ndr || c.deliveryPct || 0) * 10) / 10
        };
      })
    };
  }

  function isDirectProductMetricQuestion(parsedIntent) {
    var text = clean(parsedIntent && parsedIntent.rawText, 500).toLowerCase();
    return parsedIntent &&
      parsedIntent.entities &&
      parsedIntent.entities.products &&
      parsedIntent.entities.products.length &&
      /\b(cpa|profit|p\s*&\s*l|pnl|margin|ndr|delivery|commission|orders|delivered|cancel|canceled|cancelled)\b/i.test(text) &&
      /\b(what|wht|whats|how much|tell me|show me|fr|for|for it|for this|for the product)\b/i.test(text);
  }

  function isProductMetricIntentWithoutProduct(parsedIntent) {
    var text = clean(parsedIntent && parsedIntent.rawText, 500).toLowerCase();
    return parsedIntent &&
      parsedIntent.intent === "PRODUCT_ANALYSIS" &&
      parsedIntent.entities &&
      (!parsedIntent.entities.products || !parsedIntent.entities.products.length) &&
      /\b(cpa|profit|p\s*&\s*l|pnl|margin|ndr|delivery|commission|orders|delivered|cancel|canceled|cancelled)\b/i.test(text);
  }

  function productClarificationMessage(parsedIntent) {
    var entities = parsedIntent && parsedIntent.entities || {};
    if (responseLanguage(parsedIntent && parsedIntent.rawText) === "ar") {
      var arabicCandidates = Array.isArray(entities.productCandidates) ? entities.productCandidates.filter(Boolean) : [];
      if (arabicCandidates.length) return "وجدت أكثر من منتج محتمل: " + arabicCandidates.slice(0, 4).join("، ") + ". أي منتج تقصد؟";
      if (entities.productQueryTooShort) return "اسم المنتج غير واضح بما يكفي. أرسل الاسم الكامل أو جزءًا أوضح منه.";
      return "أي منتج تقصد؟ أرسل اسم المنتج أو SKU لأستخدم بياناته الدقيقة.";
    }
    var candidates = Array.isArray(entities.productCandidates) ? entities.productCandidates.filter(Boolean) : [];
    if (candidates.length) {
      return "I found more than one possible product. Which one do you mean?\n\n" +
        candidates.slice(0, 4).map(function (name, idx) { return (idx + 1) + ". " + name; }).join("\n") +
        "\n\nReply with the full product name or a clearer part of it, and I will calculate CPA, NDR, commission, and P&L.";
    }
    if (entities.productQueryTooShort) {
      return "That product name is too short for me to identify safely. Send a clearer part of the product name, for example two or three unique words from it, and I will calculate CPA, NDR, commission, and P&L.";
    }
    return "Which product do you mean? Send the product name exactly as it appears in Product Analytics, or any clear unique part of it, and I will calculate CPA, NDR, commission, and P&L.";
  }

  function productMetricResponse(product, data, dependency, question) {
    var summary = productSummary(product, dependency && dependency.spend, data);
    var ar = responseLanguage(question) === "ar";
    if (!summary) return ar ? "لم أجد سجلًا مطابقًا للمنتج في وضع لوحة التحكم الحالي." : "No matching product record was found in the current dashboard mode.";
    var currency = summary.spend && summary.spend.currency || dependency && dependency.currency || "";
    if (!summary.spend || !summary.spend.amount) {
      if (ar) {
        return "وجدت " + summary.name + "، لكن أحتاج الإنفاق الإعلاني والعملة لحساب CPA والربحية بدقة." +
          "\n\nالبيانات الحالية: " + fmt(summary.orders) + " طلب، " + fmt(summary.delivered) + " طلب مسلم، NDR " + summary.ndr + "%، نسبة الإلغاء " + summary.cancelRate + "%، المبيعات المسلمة " + fmt(summary.deliveredSales) + " SAR، متوسط الطلب المسلم " + fmt(summary.deliveredAov) + " SAR، والعمولة " + fmt(summary.commission) + " SAR." +
          "\n\nأرسل الإنفاق مثل 500 SAR أو 120 USD أو 8000 EGP وسأحسب CPA وP&L من بيانات لوحة التحكم الحالية.";
      }
      return "I found " + summary.name + ", but I still need the advertising spend and currency to calculate CPA and profitability accurately." +
        "\n\nCurrent facts: " +
        fmt(summary.orders) + " orders, " +
        fmt(summary.delivered) + " delivered, " +
        summary.ndr + "% NDR, " +
        summary.cancelRate + "% cancel rate, " +
        fmt(summary.deliveredSales) + " SAR delivered sales, " +
        fmt(summary.deliveredAov) + " SAR delivered AOV, " +
        fmt(summary.commission) + " SAR commission." +
        "\n\nSend the spend like 500 SAR, 120 USD, or 8000 EGP and I will calculate CPA and P&L from the current dashboard data.";
    }
    var spendLine = summary.spend
      ? ", allocated ad spend " + fmt(summary.spend.amount) + (currency ? " " + currency : "")
      : "";
    var cpaLine = summary.cpa != null
      ? ", CPA " + summary.cpa.toLocaleString("en-US") + (currency ? " " + currency : "")
      : "";
    var breakEvenLine = summary.breakEvenCpa
      ? ", break-even CPA " + summary.breakEvenCpa.toLocaleString("en-US") + " " + (summary.breakEvenCurrency || currency || "SAR")
      : "";
    var profitLine = summary.profit != null
      ? ", P&L " + summary.profit.toLocaleString("en-US") + (currency ? " " + currency : "")
      : "";
    var mode = data && data.meta && data.meta.deliveredDateMode === "expected" ? "Expected NDR" : "Actual Delivered";
    if (ar) {
      var arabicFinancial = summary.spend
        ? "، الإنفاق الإعلاني المخصص " + fmt(summary.spend.amount) + (currency ? " " + currency : "")
        : "";
      if (summary.cpa != null) arabicFinancial += "، CPA " + summary.cpa.toLocaleString("en-US") + (currency ? " " + currency : "");
      if (summary.breakEvenCpa) arabicFinancial += "، CPA التعادل " + summary.breakEvenCpa.toLocaleString("en-US") + " " + (summary.breakEvenCurrency || currency || "SAR");
      if (summary.profit != null) arabicFinancial += "، P&L " + summary.profit.toLocaleString("en-US") + (currency ? " " + currency : "");
      return "بالنسبة إلى " + summary.name + "، يبلغ CPA " + (summary.cpa != null ? summary.cpa.toLocaleString("en-US") + (currency ? " " + currency : "") : "غير متاح حاليًا") + "." +
        "\n\nالقراءة الكاملة في وضع " + mode + ": " + fmt(summary.orders) + " طلب، " + fmt(summary.delivered) + " طلب مسلم، NDR " + summary.ndr + "%، نسبة الإلغاء " + summary.cancelRate + "%، المبيعات المسلمة " + fmt(summary.deliveredSales) + " SAR، متوسط الطلب المسلم " + fmt(summary.deliveredAov) + " SAR، والعمولة " + fmt(summary.commission) + " SAR" + arabicFinancial + "." +
        "\n\nالمعنى: CPA التعادل هو الحد الأقصى لـCPA قبل أن يبدأ المنتج في الخسارة. إذا كان CPA الفعلي أعلى منه، فزيادة الإنفاق غالبًا ستزيد الخسائر.";
    }
    return "For " + summary.name + ", the CPA is " + (summary.cpa != null ? summary.cpa.toLocaleString("en-US") + (currency ? " " + currency : "") : "not available yet") + "." +
      "\n\nHere is the full read in " + mode + " mode: " +
      fmt(summary.orders) + " orders, " +
      fmt(summary.delivered) + " delivered, " +
      summary.ndr + "% NDR, " +
      summary.cancelRate + "% cancel rate, " +
      fmt(summary.deliveredSales) + " SAR delivered sales, " +
      fmt(summary.deliveredAov) + " SAR delivered AOV, " +
      fmt(summary.commission) + " SAR commission" +
      spendLine + cpaLine + breakEvenLine + profitLine + "." +
      "\n\nWhat it means: break-even CPA is the maximum CPA before this product loses money. It equals average commission per delivered order multiplied by NDR. If actual CPA is above break-even CPA, scaling this product will likely increase losses. If it is lower, then the next thing to check is delivery quality, because low NDR can still kill profit even when CPA looks acceptable." +
      "\n\nNext steps:\n- Compare this product against your best product by CPA, NDR, and P&L.\n- If P&L is negative, reduce spend or pause until delivery quality improves.\n- Switch the top mode between Actual Delivered and Expected NDR to compare realized and projected performance.";
  }

  function citySummary(city) {
    if (!city) return null;
    var orders = num(city.count || city.orders);
    var delivered = num(city.deliveredOrders);
    var deliveredSales = num(city.totalRevenue || city.deliveredSales || city.sales);
    return {
      name: city.name,
      orders: orders,
      delivered: delivered,
      ndr: Math.round(pct(orders ? delivered / orders : city.ndrPct || city.drPct || 0) * 10) / 10,
      deliveryRate: Math.round(pct(city.drBaseOrders ? delivered / city.drBaseOrders : city.drPct || 0) * 10) / 10,
      earnedProfitAfterTax: Math.round(num(
        city.earnedProfitAfterTax != null ? city.earnedProfitAfterTax : city.earnedCommission
      ) * 100) / 100,
      commission: Math.round(num(
        city.earnedProfitAfterTax != null ? city.earnedProfitAfterTax : city.earnedCommission
      ) * 100) / 100,
      deliveredSales: Math.round(deliveredSales * 100) / 100,
      deliveredAov: Math.round(num(city.deliveredAov || (delivered ? deliveredSales / Math.max(1, delivered) : 0)) * 100) / 100,
      codPct: Math.round(pct(orders ? num(city.codCount) / orders : city.codPct || 0) * 10) / 10,
      riskScore: Math.round(num(city.riskScore)),
      scalingScore: Math.round(num(city.scalingScore))
    };
  }

  function detectIssues(accountHealth, product, city) {
    var issues = [];
    if (accountHealth.metrics.ndr && accountHealth.metrics.ndr < 20) issues.push("Low account NDR is limiting profitability.");
    if (product && product.ndr < 20) issues.push("Selected product has weak delivery quality.");
    if (product && product.profit != null && product.profit < 0) issues.push("Selected product is not covering ad spend.");
    if (product && product.isCpaAboveBreakEven === true) issues.push("Product CPA is above break-even CPA, so every acquired order is losing money.");
    if (city && city.riskScore >= 65) issues.push("Selected city has elevated delivery/COD risk.");
    return issues.slice(0, 5);
  }

  function detectOpportunities(accountHealth, product, city) {
    var opportunities = [];
    (accountHealth.topWinningProducts || []).slice(0, 2).forEach(function (p) {
      opportunities.push("Potential winner product: " + p.name + " with " + Math.round(num(p.ndr) * 10) / 10 + "% NDR.");
    });
    (accountHealth.bestCities || []).slice(0, 2).forEach(function (c) {
      opportunities.push("Strong city signal: " + c.name + " with meaningful commission.");
    });
    if (product && product.ndr >= 40 && product.isCpaAboveBreakEven !== true && (!product.profit || product.profit > 0)) opportunities.push("Selected product can be tested for controlled scaling if CPA stays below break-even.");
    if (city && city.scalingScore >= 60) opportunities.push("Selected city may be a scale candidate if CPA stays controlled.");
    return opportunities.slice(0, 5);
  }

  function detectAnomalies(accountHealth, product, city) {
    var anomalies = [];
    if (product && product.orders >= 20 && product.delivered === 0) anomalies.push("Product has order volume but no delivered units.");
    if (city && city.orders >= 20 && city.delivered === 0) anomalies.push("City has order volume but no delivered orders.");
    if (accountHealth.metrics.lostCommission > accountHealth.metrics.revenue) anomalies.push("Lost commission is larger than earned commission.");
    return anomalies.slice(0, 4);
  }

  function classifyProduct(product) {
    var orders = num(product.orders);
    var delivered = num(product.delivered);
    var ndr = num(product.ndr);
    var cancelRate = num(product.cancelRate);
    var evaluation = window.TaagerCampaignDecision && typeof window.TaagerCampaignDecision.evaluate === "function"
      ? window.TaagerCampaignDecision.evaluate({
        orders: orders,
        delivered: delivered,
        ndrPct: ndr,
        cancelPct: cancelRate,
        cpa: product.cpa,
        breakEvenCpa: product.breakEvenCpa,
        netProfit: product.profit,
        cities: product.topCities
      })
      : { decision: "watch", reasons: ["Campaign decision evaluator is unavailable."], nextAction: "Collect more evidence before changing spend." };
    var decision = evaluation.decision;
    var reasons = evaluation.reasons && evaluation.reasons.length
      ? evaluation.reasons
      : ["Delivery, CPA, and sample guardrails are acceptable."];
    var cpaSafe = product.isCpaAboveBreakEven !== true;
    var profitable = product.profit == null || product.profit >= 0;
    return {
      product: product.name,
      decision: decision,
      score: Math.round((ndr * 1.4) + (delivered >= 10 ? 15 : 0) + (profitable ? 15 : -20) + (cpaSafe ? 10 : -25) - (cancelRate * 0.35)),
      orders: orders,
      delivered: delivered,
      ndr: ndr,
      cancelRate: cancelRate,
      deliveredSales: product.deliveredSales,
      deliveredAov: product.deliveredAov,
      commission: product.commission,
      cpa: product.cpa,
      breakEvenCpa: product.breakEvenCpa,
      profit: product.profit,
      reasons: reasons.slice(0, 4),
      decisionMetadata: evaluation,
      nextAction: evaluation.nextAction
    };
  }

  function buildProductScorecards(data, dependency) {
    var products = getProducts(data || {}).slice(0, 80).map(function (raw) {
      var spend = getKnownProductSpend(raw.name || raw.key || raw.sku, raw, data || {});
      var summary = productSummary(raw, spend, data || {});
      return summary ? classifyProduct(summary) : null;
    }).filter(Boolean);
    products.sort(function (a, b) {
      var order = { scale: 0, watch: 1, fix_first: 2, pause: 3 };
      return (order[a.decision] - order[b.decision]) || (b.score - a.score);
    });
    return {
      scale: products.filter(function (p) { return p.decision === "scale"; }).slice(0, 5),
      watch: products.filter(function (p) { return p.decision === "watch"; }).slice(0, 5),
      fixFirst: products.filter(function (p) { return p.decision === "fix_first"; }).slice(0, 5),
      pause: products.filter(function (p) { return p.decision === "pause"; }).slice(0, 5),
      all: products.slice(0, 12)
    };
  }

  function buildMediaBuyingContext(data, productName) {
    var campaignIntelligence = window.TaagerCampaignIntelligence || window.KhodCampaignIntelligence;
    if (!campaignIntelligence || typeof campaignIntelligence.build !== "function") {
      return null;
    }
    var intel = campaignIntelligence.build({
      data: data || {},
      productName: productName || "",
      limit: 20
    });
    return {
      sourceOfTruth: intel.sourceOfTruth,
      periodLabel: intel.periodLabel,
      totals: intel.totals,
      objectiveMix: intel.objectiveMix,
      topSpendCampaigns: (intel.topSpendCampaigns || []).slice(0, 20),
      topProductGroups: (intel.topProductGroups || []).slice(0, 20),
      worstCampaigns: (intel.worstCampaigns || []).slice(0, 20),
      creativeSummary: intel.creativeSummary,
      productFocus: intel.productFocus || null,
      caps: intel.caps,
      playbook: campaignIntelligence.playbook ? campaignIntelligence.playbook() : null
    };
  }

  function detectWorkflowIntent(text) {
    var value = clean(text, 500).toLowerCase();
    return {
      asksBadProducts: /\b(bad|worst|weak|losing|danger|risky)\s+(product|products|app|apps)\b|\b(products|apps)\s+(losing|to\s+fix|are\s+bad|are\s+weak)\b|\bfix.*product\b|\bmake.*product.*better\b/i.test(value),
      asksScaleDecision: /\b(scale\s+or\s+no|should\s+i\s+scale|can\s+i\s+scale|best.*scale|what.*scale)\b/i.test(value),
      asksNextAction: isVagueActionFollowUp(value) || isStepByStepFollowUp(value)
    };
  }

  function buildStrategicContext(parsedIntent, analyticsResult, data, dependency) {
    var accountHealth = window.KhodAiAnalyticsEngine.processIntent({
      intent: "ACCOUNT_HEALTH_CHECK",
      entities: { products: [], cities: [], metrics: [] }
    }, data).data;
    var productName = parsedIntent.entities.products[0] || getMemory().currentProduct;
    var cityName = parsedIntent.entities.cities[0] || getMemory().currentCity;
    var product = productSummary(findProduct(data, productName), dependency && dependency.spend, data);
    var city = citySummary(findCity(data, cityName));
    var mainIssues = detectIssues(accountHealth, product, city);
    var opportunities = detectOpportunities(accountHealth, product, city);
    var anomalies = detectAnomalies(accountHealth, product, city);
    var accountSpend = !product && dependency && dependency.spend ? dependency.spend : null;
    var accountProfit = accountSpend && accountSpend.amount
      ? Math.round((num(accountHealth.metrics.revenue) - num(accountSpend.amount)) * 100) / 100
      : null;
    var accountCpa = accountSpend && accountSpend.amount && data && data.overview && data.overview.totalOrders
      ? Math.round((num(accountSpend.amount) / Math.max(1, num(data.overview.totalOrders.value || data.overview.totalOrders))) * 100) / 100
      : null;
    var roi = data && data.roi || {};
    var accountAverageProfit = roi.averageProfit != null ? roi.averageProfit : roi.avgCommission;
    var accountBreakEvenSar = breakEvenCpaSar(accountAverageProfit || accountHealth.metrics.avgCommission || 0, roi.ndrPct || accountHealth.metrics.ndr || 0);
    var accountBreakEvenCurrency = accountSpend && accountSpend.currency || roi.currency || "SAR";
    var accountBreakEvenCpa = accountBreakEvenSar ? sarToCurrency(accountBreakEvenSar, accountBreakEvenCurrency, data) : 0;
    var localAnswer = window.KhodAiAnalyticsEngine && window.KhodAiAnalyticsEngine.localResponse
      ? window.KhodAiAnalyticsEngine.localResponse(parsedIntent, analyticsResult || {})
      : "";
    var exactRows = analyticsResult && analyticsResult.data;
    var overview = data && data.overview || {};
    var accountDeliveredSales = overview.totalDeliveredSales ? num(overview.totalDeliveredSales.value) : num(accountHealth.metrics.deliveredSales);
    var accountDeliveredAov = overview.deliveredAov ? num(overview.deliveredAov.value) : num(accountHealth.metrics.deliveredAov);
    var meta = data && data.meta || {};
    var productScorecards = buildProductScorecards(data || {}, dependency);
    var workflowIntent = detectWorkflowIntent(parsedIntent.rawText);
    var mediaBuying = buildMediaBuyingContext(data || {}, productName);

    return {
      intent: parsedIntent.intent,
      question: clean(parsedIntent.rawText, 500),
      assistantMemory: {
        knownInputs: getMemory().knownInputs || {},
        lastDiagnosis: getMemory().lastDiagnosis || null,
        activeWorkflow: getMemory().assistantWorkflow || null,
        currentProduct: getMemory().currentProduct || null,
        currentCity: getMemory().currentCity || null,
        userPreferences: getMemory().userPreferences || {},
        accountMemory: getMemory().businessMemoryByAccount && getMemory().businessMemoryByAccount[meta.activeAccountId || "__all__"] || null,
        pendingLearningSuggestion: getMemory().pendingLearningSuggestion || null
      },
      workflowIntent: workflowIntent,
      rankingContract: parsedIntent.entities && parsedIntent.entities.rankingContract || null,
      localAnswer: clean(localAnswer, 1400),
      localResultType: analyticsResult && analyticsResult.type || "",
      localResultRows: Array.isArray(exactRows) ? exactRows.slice(0, 6) : exactRows,
      sessionFocus: {
        accountId: meta.activeAccountId || "__all__",
        accountLabel: meta.activeAccountName || meta.activeAccountLabel || null,
        product: productName || null,
        city: cityName || null,
        timeframe: getMemory().currentTimeframe || null,
        account: meta.activeAccountName || meta.activeAccountLabel || meta.activeAccountId || null,
        accountScope: meta.activeAccountId && meta.activeAccountId !== "__all__" ? "single_account" : "all_accounts",
        deliveredDateMode: meta.deliveredDateMode === "expected" ? "Expected NDR" : "Actual Delivered"
      },
      accountHealth: {
        revenue: accountHealth.metrics.revenue,
        profit: product && product.profit != null ? product.profit : accountHealth.metrics.profit,
        lostCommission: accountHealth.metrics.lostCommission,
        deliveredSales: accountDeliveredSales,
        deliveredAov: accountDeliveredAov,
        ndr: accountHealth.metrics.ndr,
        deliveryRate: accountHealth.metrics.deliveryRate,
        breakEvenCpa: Math.round(accountBreakEvenCpa * 100) / 100,
        breakEvenCpaSar: Math.round(accountBreakEvenSar * 100) / 100,
        breakEvenCurrency: accountBreakEvenCurrency,
        actualCpa: accountCpa,
        isActualCpaAboveBreakEven: accountCpa != null && accountBreakEvenCpa > 0 ? accountCpa > accountBreakEvenCpa : null,
        breakEvenFormula: "avgCommission * NDR",
        mainIssues: mainIssues
      },
      selectedProduct: product,
      selectedCity: city,
      productScorecards: productScorecards,
      mediaBuying: mediaBuying,
      scaleGuardrails: {
        minimumOrders: 50,
        minimumDelivered: 10,
        minimumNdr: 40,
        rule: "Recommend scale only when sample size, delivery quality, and CPA/break-even checks are all acceptable."
      },
      worstProducts: accountHealth.topLosingProducts || [],
      worstCities: accountHealth.worstCities || [],
      opportunities: opportunities,
      anomalies: anomalies,
      localCalculations: {
        spend: dependency && dependency.spend || null,
        currency: dependency && dependency.currency || null,
        missingInputs: dependency && dependency.missing || [],
        accountProfit: accountProfit,
        accountCpa: accountCpa,
        accountBreakEvenCpa: Math.round(accountBreakEvenCpa * 100) / 100,
        accountBreakEvenCurrency: accountBreakEvenCurrency,
        accountBreakEvenFormula: "avgCommission * NDR",
        profitComputedLocally: !!(product && product.profit != null),
        cpaComputedLocally: !!(product && product.cpa != null)
      },
      operatorInstruction: "Answer only from current dashboard state. Use delivered sales, delivered AOV, earned commission, lost commission, NDR, DR, CPA, and break-even CPA together before judging business health. Break-even CPA means max CPA before losing money, formula avgCommission * NDR. NDR means Net Delivery Rate / delivery from created orders, so higher NDR is better. For media buying, platform data is spend/campaign/creative signal only; final orders, NDR, CPA, break-even, product quality, city quality, and scale decisions must come from Taager dashboard data."
    };
  }

  function localOnlyResult(parsedIntent, analyticsResult) {
    var text = window.KhodAiAnalyticsEngine && window.KhodAiAnalyticsEngine.localResponse
      ? window.KhodAiAnalyticsEngine.localResponse(parsedIntent, analyticsResult || {})
      : "This request is handled locally.";
    if (parsedIntent.intent === "RANKING_QUERY" && analyticsResult && Array.isArray(analyticsResult.data) && analyticsResult.data[0]) {
      if (analyticsResult.data[0].type === "product" && window.KhodAiSessionMemory) {
        window.KhodAiSessionMemory.update({
          intent: parsedIntent.intent,
          rawText: parsedIntent.rawText,
          entities: { products: [analyticsResult.data[0].name], cities: [], dates: [] }
        });
      }
      if (analyticsResult.data[0].type === "city" && window.KhodAiSessionMemory) {
        window.KhodAiSessionMemory.update({
          intent: parsedIntent.intent,
          rawText: parsedIntent.rawText,
          entities: { products: [], cities: [analyticsResult.data[0].name], dates: [] }
        });
      }
    }
    var actions = [];
    var ar = responseLanguage(parsedIntent.rawText) === "ar";
    var contract = parsedIntent.entities && parsedIntent.entities.rankingContract || {};
    if (parsedIntent.intent === "RANKING_QUERY") {
      actions.push({
        type: "OPEN_PAGE",
        label: ar ? "عرض ترتيب المنتجات" : "View Ranked Products",
        route: "/dashboard/products?sort=" + encodeURIComponent(contract.metric || "commission") + "&direction=" + encodeURIComponent(contract.direction || "desc"),
        section: "products",
        sort: contract.metric || "commission",
        query: contract.direction || "desc"
      });
    }
    if (parsedIntent.intent === "RANKING_QUERY" && parsedIntent.entities && parsedIntent.entities.rankingEntity === "cities") {
      actions = [{
        type: "OPEN_PAGE",
        label: ar ? "فتح تحليل المدن" : "Open City Analytics",
        route: "/dashboard/cities?sort=" + encodeURIComponent(contract.metric || "commission") + "&direction=" + encodeURIComponent(contract.direction || "desc"),
        section: "cities",
        sort: contract.metric || "commission",
        query: contract.direction || "desc"
      }];
    }
    if (parsedIntent.intent === "KPI_ANALYSIS") actions.push({ type: "OPEN_PAGE", label: ar ? "فتح نظرة المؤشرات" : "Open KPI Overview", route: "/dashboard/overview", section: "overview" });
    if (parsedIntent.intent === "COMPARISON_QUERY") actions.push({ type: "OPEN_PAGE", label: ar ? "مقارنة بيانات لوحة التحكم" : "Compare Dashboard Signals", route: "/dashboard/products?view=compare", section: "products" });
    if (parsedIntent.intent === "CALCULATOR_SIMULATION") actions.push({ type: "OPEN_PAGE", label: ar ? "فتح الحاسبة" : "Open Calculator", route: "/dashboard/calculator", section: "calculator" });
    if (parsedIntent.intent === "SCALE_ANALYSIS") actions.push({ type: "OPEN_PAGE", label: ar ? "عرض مرشحي التوسع" : "View Scale Candidates", route: "/dashboard/products?sort=scale", section: "products" });
    if (window.KhodAiShared && window.KhodAiShared.sanitizeActions) actions = window.KhodAiShared.sanitizeActions(actions);
    return { mode: "local", message: text, actions: actions, parsedIntent: parsedIntent, analyticsResult: analyticsResult };
  }

  function ensureTips(message, parsedIntent, actions) {
    var text = clean(message, 1800);
    if (!text) text = "Dashboard analysis is ready.";
    return text;
  }

  function buildGuidedWorkflow(strategicContext, parsedIntent, actionFollowUp) {
    strategicContext = strategicContext || {};
    var h = strategicContext.accountHealth || {};
    var product = strategicContext.selectedProduct && strategicContext.selectedProduct.name;
    var city = strategicContext.selectedCity && strategicContext.selectedCity.name;
    var actions = window.KhodAiLocalReasoningEngine && window.KhodAiLocalReasoningEngine.actionSet
      ? window.KhodAiLocalReasoningEngine.actionSet(strategicContext)
      : [];
    var lead = actionFollowUp
      ? "Start with the biggest leak first, then decide whether to scale."
      : "I will guide you step by step from the current dashboard state.";
    var proof = [];
    if (h.deliveredSales) proof.push("delivered sales " + fmt(h.deliveredSales) + " SAR");
    if (h.deliveredAov) proof.push("delivered AOV " + fmt(h.deliveredAov) + " SAR");
    if (h.revenue) proof.push("earned commission " + fmt(h.revenue) + " SAR");
    if (h.lostCommission) proof.push("lost commission " + fmt(h.lostCommission) + " SAR");
    if (h.ndr) proof.push("NDR " + Math.round(num(h.ndr) * 10) / 10 + "%");
    if (h.breakEvenCpa) proof.push("break-even CPA " + Math.round(num(h.breakEvenCpa) * 100) / 100 + " " + (h.breakEvenCurrency || "SAR"));
    var focus = product ? "Product focus: " + product + "." : (city ? "City focus: " + city + "." : "Account focus: current selected dashboard scope.");
    var steps = [
      "Step 1: Confirm the current scope: selected account/date range and mode " + ((strategicContext.sessionFocus && strategicContext.sessionFocus.deliveredDateMode) || "Actual Delivered") + ".",
      "Step 2: Read commercial health together: " + (proof.length ? proof.join(", ") : "delivered sales, delivered AOV, earned commission, lost commission, NDR, DR, CPA, and break-even CPA") + ".",
      "Step 3: Open the worst products or weakest cities and find the segment with order volume plus low delivery quality.",
      "Step 4: Pause or reduce traffic only on the dangerous segment while you check confirmation, product promise, and delivery issues.",
      "Step 5: Recheck NDR, DR, delivered sales, delivered AOV, commission, and lost commission before increasing spend again."
    ];
    if (parsedIntent && parsedIntent.intent === "SCALE_ANALYSIS") {
      steps[3] = "Step 4: Do not scale anything unless it has enough orders, enough delivered orders, stable NDR, healthy delivered AOV, positive commission/P&L, and CPA below break-even CPA.";
    }
    return {
      message: lead + "\n\n" + focus + "\n\n" + steps.join("\n") + "\n\nNext move: Make one change at a time, then use the next dashboard refresh to prove whether it worked.",
      actions: actions,
      insights: [],
      recommendations: steps.slice(2, 5).map(function (step, idx) {
        return {
          id: "guided-step-" + idx,
          title: step.replace(/^Step\s+\d+:\s*/, ""),
          actionType: "guided_workflow",
          expectedBenefit: "Moves the client from diagnosis to the next dashboard action.",
          riskLevel: idx === 0 ? "medium" : "low",
          confidence: "medium"
        };
      }),
      alerts: [],
      forecasts: [],
      assistantWorkflow: {
        type: parsedIntent && parsedIntent.intent === "SCALE_ANALYSIS" ? "product_scaling" : "profit_recovery",
        step: 1
      }
    };
  }

  function productDecisionLines(rows) {
    return (rows || []).slice(0, 4).map(function (p, idx) {
      return (idx + 1) + ". " + p.product + " - " + p.decision + ": " + p.reasons.slice(0, 2).join(", ") + ".";
    });
  }

  function buildProductWorkflow(strategicContext, parsedIntent) {
    var cards = strategicContext.productScorecards || {};
    var intent = strategicContext.workflowIntent || {};
    var actions = [
      { type: "OPEN_PAGE", label: "Show Worst Products", route: "/dashboard/products?sort=worst_ndr", section: "products", filter: "worst_ndr" },
      { type: "OPEN_PAGE", label: "Show Scale Candidates", route: "/dashboard/products?sort=scale", section: "products", filter: "scale" },
      { type: "OPEN_PAGE", label: "Open Campaigns", route: "/dashboard/campaigns", section: "campaigns" },
      { type: "OPEN_PAGE", label: "Open Calculator", route: "/dashboard/calculator", section: "calculator" }
    ];
    var message;
    var recommendations = [];
    var decision = {
      type: intent.asksScaleDecision ? "scale_decision" : "bad_products",
      scale: cards.scale || [],
      fixFirst: cards.fixFirst || [],
      pause: cards.pause || [],
      mediaBuying: strategicContext.mediaBuying ? {
        sourceOfTruth: strategicContext.mediaBuying.sourceOfTruth,
        topProductGroups: strategicContext.mediaBuying.topProductGroups,
        worstCampaigns: strategicContext.mediaBuying.worstCampaigns,
        creativeSummary: strategicContext.mediaBuying.creativeSummary
      } : null
    };
    var mediaBuyingLines = strategicContext.mediaBuying && strategicContext.mediaBuying.topProductGroups
      ? strategicContext.mediaBuying.topProductGroups.slice(0, 3).map(function (group, idx) {
        return (idx + 1) + ". " + group.product + " - " + group.decision + ", spend " + fmt(group.spend) + " " + (group.currency || window.dashboardActiveCurrency || "SAR") + ", Taager orders " + fmt(group.taagerOrders) + ", CPA " + fmt(group.taagerCpa) + " " + (group.currency || window.dashboardActiveCurrency || "SAR") + ".";
      })
      : [];

    if (intent.asksScaleDecision) {
      var scaleLines = productDecisionLines(cards.scale);
      var blockedLines = productDecisionLines((cards.fixFirst || []).concat(cards.pause || []));
      message = scaleLines.length
        ? "Main insight: You have controlled scale candidates, but scale only in small tests.\n\nProof:\n" + scaleLines.join("\n")
        : "Main insight: I would not scale yet. No product passed the current guardrails: 50+ orders, 10+ delivered orders, around 40%+ NDR, and CPA below break-even when available.";
      if (blockedLines.length) message += "\n\nProducts to fix before scaling:\n" + blockedLines.join("\n");
      if (mediaBuyingLines.length) message += "\n\nMedia buying layer:\n" + mediaBuyingLines.join("\n");
      message += "\n\nNext move: Open scale candidates, compare them with weak products, and increase budget only after the next dashboard refresh confirms NDR and CPA stayed stable.";
    } else {
      var pauseLines = productDecisionLines(cards.pause);
      var fixLines = productDecisionLines(cards.fixFirst);
      message = "Main insight: Bad products should be split into pause candidates and fix-first candidates.";
      if (pauseLines.length) message += "\n\nPause/reduce first:\n" + pauseLines.join("\n");
      if (fixLines.length) message += "\n\nFix first:\n" + fixLines.join("\n");
      if (!pauseLines.length && !fixLines.length) message += "\n\nI do not see a severe bad-product cluster yet; use the worst-product view to inspect smaller risks.";
      if (mediaBuyingLines.length) message += "\n\nCampaign signals:\n" + mediaBuyingLines.join("\n");
      message += "\n\nNext move: Start with the first pause/reduce product, inspect city mix and cancellation/failed reasons, then compare it against your best product.";
    }

    recommendations = (cards.pause || []).slice(0, 2).map(function (p, idx) {
      return {
        id: "product-pause-" + idx,
        title: "Reduce traffic on " + p.product,
        actionType: "pause_product_review",
        expectedBenefit: p.reasons.join(", "),
        riskLevel: "high",
        confidence: "medium"
      };
    }).concat((cards.scale || []).slice(0, 2).map(function (p, idx) {
      return {
        id: "product-scale-" + idx,
        title: "Controlled scale test for " + p.product,
        actionType: "scale_product_review",
        expectedBenefit: p.nextAction,
        riskLevel: "medium",
        confidence: "medium"
      };
    }));

    return {
      message: message,
      actions: actions,
      insights: [],
      recommendations: recommendations.slice(0, 4),
      alerts: (cards.pause || []).slice(0, 2).map(function (p, idx) {
        return { id: "bad-product-" + idx, title: p.product + " needs attention", urgency: "high", reason: p.reasons.join(", "), impactedArea: "products" };
      }),
      forecasts: [],
      decision: decision,
      followUpQuestions: ["How can I fix the first bad product?", "Compare it with my best product", "Can I scale the top candidate?"],
      assistantWorkflow: {
        type: intent.asksScaleDecision ? "product_scaling" : "bad_product_recovery",
        step: 1
      }
    };
  }

  function rememberMissingInputsForGemini(text, dependency, calculatorDependency) {
    if (!window.KhodAiSessionMemory || typeof window.KhodAiSessionMemory.setPending !== "function") return;
    if (calculatorDependency && calculatorDependency.ok === false) {
      window.KhodAiSessionMemory.setPending({
        scope: "calculator",
        missing: calculatorDependency.missing || [],
        originalQuestion: text
      });
      return;
    }
    if (dependency && dependency.ok === false) {
      window.KhodAiSessionMemory.setPending({
        scope: dependency.scope || "account",
        product: dependency.product || "",
        missing: dependency.missing || [],
        originalQuestion: text
      });
    }
  }

  function rememberProductLookupForGemini(text, parsedIntent) {
    if (!window.KhodAiSessionMemory || typeof window.KhodAiSessionMemory.setPending !== "function") return;
    var entities = parsedIntent && parsedIntent.entities || {};
    var candidates = Array.isArray(entities.productCandidates) ? entities.productCandidates : [];
    if (!candidates.length && !entities.productQueryTooShort) return;
    window.KhodAiSessionMemory.setPending({
      scope: "product_lookup",
      originalQuestion: text,
      candidates: candidates
    });
  }

  function orchestrate(text, data) {
    var memory = getMemory();
    var standalone = clean(text, 300).toLowerCase().replace(/[?؟!.]+$/g, "").trim();
    var hasConversationContext = !!(memory.lastStrategicQuestion || memory.currentProduct || memory.currentCity);
    var standaloneFollowUp = /^(why|do it step by step|what about this product|show me the next one)$/i.test(standalone) ||
      /^(ليه|ماذا عن هذا المنتج|اعرض التالي)$/i.test(standalone);
    var outOfScope = /\b(weather|poem|song|joke|recipe)\b/i.test(standalone) || /طقس|قصيدة|أغنية|نكتة|وصفة/.test(standalone);
    if ((!hasConversationContext && standaloneFollowUp) || outOfScope) {
      return {
        mode: "followup",
        message: /[\u0600-\u06ff]/.test(text)
          ? "أقدر أساعدك في بيانات الداشبورد. حدد المنتج أو المدينة أو المؤشر أو القرار الذي تريد تحليله."
          : "I can help with the dashboard. Specify the product, city, metric, or decision you want to analyze.",
        actions: []
      };
    }
    var followUp = resolveAssistantFollowUp(text, memory);
    if (!followUp.actionFollowUp && !followUp.stepByStep) {
      var pendingResolution = maybeResolvePending(text, memory);
      if (pendingResolution && pendingResolution.mode === "followup") return pendingResolution;
      if (pendingResolution && pendingResolution.mode === "resume") text = pendingResolution.text;
      followUp = resolveAssistantFollowUp(text, getMemory());
    } else if (window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.clearPending === "function") {
      window.KhodAiSessionMemory.clearPending();
    }
    text = followUp.text;

    var parsedIntent = window.KhodAiIntentDetector.parse(text, data, getMemory());
    var analyticsResult = window.KhodAiAnalyticsEngine.processIntent(parsedIntent, data || {});
    if (window.KhodAiSessionMemory) window.KhodAiSessionMemory.update(parsedIntent);

    var needsProductClarification = isProductMetricIntentWithoutProduct(parsedIntent);
    if (needsProductClarification) {
      // Allow conversational/business queries to proceed to Gemini instead of strictly blocking or clarifying
      rememberProductLookupForGemini(text, parsedIntent);
    }

    var calculatorDependency = validateCalculatorDependencies(parsedIntent);
    // Do not force conversational followup - let Gemini answer based on available context
    
    var dependency = validateDependencies(parsedIntent, analyticsResult, data || {});
    rememberMissingInputsForGemini(text, dependency, calculatorDependency);
    if (calculatorDependency.ok === false) {
      return {
        mode: "followup",
        message: calculatorDependency.message,
        actions: [],
        parsedIntent: parsedIntent,
        analyticsResult: analyticsResult
      };
    }

    var strategicContext = buildStrategicContext(parsedIntent, analyticsResult, data || {}, dependency);
    var exactLocal = localOnlyResult(parsedIntent, analyticsResult);
    var defaultStrategyPlan = window.KhodAiLocalReasoningEngine && window.KhodAiLocalReasoningEngine.buildStrategyPlan
      ? window.KhodAiLocalReasoningEngine.buildStrategyPlan(strategicContext, [], strategicContext.opportunities || [])
      : null;
    var localStrategic = /^(RANKING_QUERY|KPI_ANALYSIS|COMPARISON_QUERY|CALCULATOR_SIMULATION|SCALE_ANALYSIS)$/.test(parsedIntent.intent)
      ? { message: exactLocal.message, actions: exactLocal.actions || [], insights: [], recommendations: [], alerts: [], strategyPlan: defaultStrategyPlan }
      : window.KhodAiLocalReasoningEngine && window.KhodAiLocalReasoningEngine.compose
      ? window.KhodAiLocalReasoningEngine.compose(strategicContext)
      : { message: "Local strategic analysis is ready.", actions: [] };
    if (strategicContext.workflowIntent && (strategicContext.workflowIntent.asksBadProducts || strategicContext.workflowIntent.asksScaleDecision)) {
      localStrategic = buildProductWorkflow(strategicContext, parsedIntent);
    }
    if (isDirectProductMetricQuestion(parsedIntent)) {
      var directProductName = parsedIntent.entities.products[0] || getMemory().currentProduct;
      var directProduct = findProduct(data || {}, directProductName);
      var directAr = responseLanguage(parsedIntent.rawText) === "ar";
      localStrategic = {
        message: productMetricResponse(directProduct, data || {}, dependency, parsedIntent.rawText),
        actions: [
          { type: "OPEN_PRODUCT", label: directAr ? "فتح تحليل المنتج" : "Open Product Analytics", route: "/dashboard/products?product=" + slug(directProductName), productId: directProductName },
          { type: "OPEN_PAGE", label: directAr ? "فتح حاسبة المنتج" : "Open Product Calculator", route: "/calculator/product?product=" + slug(directProductName), section: "productForecast", productId: directProductName }
        ],
        insights: [],
        recommendations: [],
        alerts: [],
        strategyPlan: defaultStrategyPlan
      };
    }
    if (needsProductClarification) {
      localStrategic = {
        message: productClarificationMessage(parsedIntent),
        actions: [],
        insights: [],
        recommendations: [],
        alerts: [],
        strategyPlan: defaultStrategyPlan
      };
      strategicContext.needsClarification = {
        type: "product",
        candidates: parsedIntent.entities && parsedIntent.entities.productCandidates || []
      };
    }
    if (followUp.stepByStep || followUp.actionFollowUp) {
      localStrategic = buildGuidedWorkflow(strategicContext, parsedIntent, followUp.actionFollowUp);
      if (window.KhodAiSessionMemory && typeof window.KhodAiSessionMemory.setWorkflow === "function") {
        window.KhodAiSessionMemory.setWorkflow(localStrategic.assistantWorkflow);
      }
    }
    localStrategic.message = ensureTips(localStrategic.message, parsedIntent, localStrategic.actions || []);
    strategicContext.localStrategicSkeleton = {
      message: localStrategic.message,
      rootCauses: localStrategic.localReasoning && localStrategic.localReasoning.rootCauses || [],
      opportunities: localStrategic.localReasoning && localStrategic.localReasoning.opportunities || [],
      tips: localStrategic.localReasoning && localStrategic.localReasoning.tips || [],
      actions: localStrategic.actions || [],
      decision: localStrategic.decision || null,
      followUpQuestions: localStrategic.followUpQuestions || [],
      strategyPlan: localStrategic.strategyPlan || defaultStrategyPlan
    };
    strategicContext.strategyPlan = localStrategic.strategyPlan || defaultStrategyPlan;
    strategicContext.assistantWorkflow = localStrategic.assistantWorkflow || null;

    if (needsProductClarification) {
      return {
        mode: "followup",
        message: localStrategic.message,
        actions: [],
        parsedIntent: parsedIntent,
        analyticsResult: analyticsResult,
        context: strategicContext,
        localStrategic: localStrategic
      };
    }
    if (isDirectProductMetricQuestion(parsedIntent)) {
      return {
        mode: dependency.ok === false ? "followup" : "local",
        message: localStrategic.message,
        actions: localStrategic.actions || [],
        parsedIntent: parsedIntent,
        analyticsResult: analyticsResult,
        context: strategicContext,
        localStrategic: localStrategic
      };
    }
    if (parsedIntent.intent === "KPI_ANALYSIS" && dependency.ok === false) {
      exactLocal.mode = "followup";
      exactLocal.context = strategicContext;
      exactLocal.localStrategic = localStrategic;
      return exactLocal;
    }

    if (!followUp.stepByStep && !followUp.actionFollowUp &&
        /^(RANKING_QUERY|KPI_ANALYSIS|COMPARISON_QUERY|CALCULATOR_SIMULATION|FILTER_QUERY|SORT_QUERY|CHART_QUERY|PAGINATION_QUERY|EXPORT_QUERY)$/.test(parsedIntent.intent)) {
      exactLocal.context = strategicContext;
      exactLocal.localStrategic = localStrategic;
      return exactLocal;
    }

    return {
      mode: "ai",
      parsedIntent: parsedIntent,
      analyticsResult: analyticsResult,
      context: strategicContext,
      localStrategic: localStrategic
    };
  }

  window.KhodAiBusinessOrchestrator = {
    orchestrate: orchestrate,
    validateDependencies: validateDependencies,
    validateCalculatorDependencies: validateCalculatorDependencies,
    buildStrategicContext: buildStrategicContext
  };
})();
