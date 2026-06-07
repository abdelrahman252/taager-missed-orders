(function () {
  "use strict";

  const INTENTS = {
    LOSS_ANALYSIS: 'LOSS_ANALYSIS',
    PRODUCT_ANALYSIS: 'PRODUCT_ANALYSIS',
    CITY_ANALYSIS: 'CITY_ANALYSIS',
    KPI_ANALYSIS: 'KPI_ANALYSIS',
    TREND_ANALYSIS: 'TREND_ANALYSIS',
    SCALE_ANALYSIS: 'SCALE_ANALYSIS',
    RANKING_QUERY: 'RANKING_QUERY',
    COMPARISON_QUERY: 'COMPARISON_QUERY',
    CALCULATOR_SIMULATION: 'CALCULATOR_SIMULATION',
    FILTER_QUERY: 'FILTER_QUERY',
    SORT_QUERY: 'SORT_QUERY',
    CHART_QUERY: 'CHART_QUERY',
    PAGINATION_QUERY: 'PAGINATION_QUERY',
    EXPORT_QUERY: 'EXPORT_QUERY',
    FORECAST_QUERY: 'FORECAST_QUERY',
    ANOMALY_DETECTION: 'ANOMALY_DETECTION',
    ACCOUNT_HEALTH_CHECK: 'ACCOUNT_HEALTH_CHECK',
  };

  const LOCAL_ONLY_INTENTS = new Set([]);

  const ALLOWED_AI_INTENTS = new Set([
    INTENTS.LOSS_ANALYSIS,
    INTENTS.PRODUCT_ANALYSIS,
    INTENTS.CITY_ANALYSIS,
    INTENTS.TREND_ANALYSIS,
    INTENTS.SCALE_ANALYSIS,
    INTENTS.RANKING_QUERY,
    INTENTS.KPI_ANALYSIS,
    INTENTS.COMPARISON_QUERY,
    INTENTS.CALCULATOR_SIMULATION,
    INTENTS.FILTER_QUERY,
    INTENTS.SORT_QUERY,
    INTENTS.CHART_QUERY,
    INTENTS.PAGINATION_QUERY,
    INTENTS.EXPORT_QUERY,
    INTENTS.FORECAST_QUERY,
    INTENTS.ANOMALY_DETECTION,
    INTENTS.ACCOUNT_HEALTH_CHECK,
  ]);

  const BUSINESS_WORDS = /(account|business|city|cod|commission|conversion|cpa|delivery|forecast|growth|inventory|kpi|loss|margin|ndr|order|pipeline|product|profit|recommend|refund|roi|roas|scale|shipping|strategy|حساب|طلبات|طلب|منتج|مدينة|مدن|ربح|خسارة|عمولة|توصيل|شحن|توقع|توصية|استراتيجية|مؤشر|تحصيل|مبيعات)/i;
  const BUSINESS_EXTRA_WORDS = /(losing|profitable|profitability|money|spend|budget|ads|advertising|performance|results|margin|margins|risk|opportunity|potential|recovering|collapse|collapsed|improve|weak|worse|worsening|suspicious|anomaly|approvals|refunds|recently|week|month)/i;
  const PROMPT_INJECTION = /(ignore\s+(all\s+)?previous\s+instructions|system\s+prompt|developer\s+message|jailbreak|reveal\s+(secrets|keys|prompt|credentials)|bypass\s+(rules|safety|policy)|do\s+anything\s+now|print\s+your\s+instructions)/i;
  const PRODUCT_METRIC_WORDS = /\b(cpa|roi|roas|ndr|dr|profit|pnl|margin|delivery|commission|orders|delivered|cancel|canceled|cancelled)\b/i;
  const PRODUCT_CONTEXT_WORDS = /\b(product|products|item|items|app|apps|sku|fr|for|for it|for this|for that)\b/i;
  const STOP_WORDS = new Set([
    "what", "wht", "whats", "is", "my", "the", "for", "fr", "it", "this", "that", "of", "in", "to", "me", "tell", "show",
    "cpa", "roi", "roas", "ndr", "dr", "profit", "margin", "delivery", "commission", "orders", "order", "product", "products", "app", "apps",
    "weak", "weaker", "weakest", "strong", "stronger", "strongest", "stable", "winner", "winning", "best", "worst", "bad", "good", "profitable", "losing", "scale", "scaling",
    "\u0645\u0627", "\u0647\u0648", "\u0647\u064a", "\u0644\u064a", "\u0639\u0646", "\u0641\u064a", "\u0645\u0646", "\u0639\u0644\u0649", "\u0647\u0630\u0627", "\u0647\u0630\u0647",
    "\u0645\u0646\u062a\u062c", "\u0645\u0646\u062a\u062c\u0627\u062a", "\u062a\u0643\u0644\u0641\u0629", "\u0627\u0644\u0637\u0644\u0628", "\u0627\u0644\u0637\u0644\u0628\u0627\u062a"
  ]);

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670]/g, "")
      .replace(/[\u0622\u0623\u0625]/g, "\u0627")
      .replace(/\u0649/g, "\u064a")
      .replace(/\u0629/g, "\u0647")
      .replace(/[^\u0600-\u06ffa-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function searchTokens(value) {
    return normalizeSearchText(value).split(" ").filter(token => {
      if (!token || token.length <= 1 || STOP_WORDS.has(token)) return false;
      if (/^\d+x?$/.test(token)) return false;
      return true;
    });
  }

  function pushUnique(list, value) {
    if (value && !list.includes(value)) list.push(value);
  }

  function matchKnownProducts(text, dashboardData) {
    const found = [];
    const candidates = [];
    const products = dashboardData && dashboardData.products && dashboardData.products.rankedList
      ? dashboardData.products.rankedList
      : [];
    if (!products.length) return { matches: found, candidates: [], ambiguous: false, tooShort: false };

    const normalizedText = normalizeSearchText(text);
    const queryTokens = searchTokens(text);
    const querySet = new Set(queryTokens);

    products.forEach(p => {
      const name = p && (p.name || p.key || p.sku);
      if (!name) return;
      const normalizedName = normalizeSearchText(p.name || "");
      const normalizedSku = normalizeSearchText(p.sku || "");
      const normalizedKey = normalizeSearchText(p.key || "");
      if ((normalizedName && normalizedText.includes(normalizedName)) ||
          (normalizedSku && normalizedText.includes(normalizedSku)) ||
          (normalizedKey && normalizedText.includes(normalizedKey))) {
        pushUnique(found, name);
        return;
      }

      const productTokens = searchTokens([p.name, p.sku, p.key].filter(Boolean).join(" "));
      if (!productTokens.length || !querySet.size) return;
      const matched = productTokens.filter(token => querySet.has(token));
      const denominator = Math.max(1, Math.min(productTokens.length, querySet.size));
      const score = matched.length / denominator;
      const hasStrongSingleToken = matched.length === 1 && matched[0].length >= 4;
      if ((matched.length >= 2 && (score >= 0.35 || matched.length >= 4)) || hasStrongSingleToken) {
        candidates.push({ name, score: hasStrongSingleToken ? 0.25 : score, matched: matched.length });
      }
    });

    if (found.length) return { matches: found, candidates: found, ambiguous: found.length > 1, tooShort: false };
    candidates.sort((a, b) => (b.score - a.score) || (b.matched - a.matched));
    if (!candidates.length) return { matches: [], candidates: [], ambiguous: false, tooShort: queryTokens.length > 0 && queryTokens.length < 2 };
    const best = candidates[0];
    const close = candidates.filter(c => c.name !== best.name && c.score >= best.score - 0.08 && c.matched >= best.matched);
    if (close.length) {
      return {
        matches: [],
        candidates: [best].concat(close).slice(0, 4).map(c => c.name),
        ambiguous: true,
        tooShort: queryTokens.length < 2
      };
    }
    pushUnique(found, best.name);
    return { matches: found, candidates: candidates.slice(0, 4).map(c => c.name), ambiguous: false, tooShort: false };
  }

  // Helper to extract known entities (products, cities) from text based on dashboard data
  function extractEntities(text, dashboardData) {
    const products = [];
    const cities = [];
    const metrics = [];
    const textLower = text.toLowerCase();

    // Identify metrics
    const metricKeywords = {
      'ndr': 'ndr', 'delivery': 'delivery', 'cpa': 'cpa', 'roi': 'roi', 
      'roas': 'roas', 'profit': 'profit', 'margin': 'margin', 'refund': 'refund', 'approval': 'approval'
    };
    for (const [key, val] of Object.entries(metricKeywords)) {
      if (textLower.includes(key)) metrics.push(val);
    }

    // Identify products and cities from dashboard data if available
    if (dashboardData) {
      const productMatch = matchKnownProducts(text, dashboardData);
      productMatch.matches.forEach(name => pushUnique(products, name));
      var productCandidates = productMatch.candidates || [];
      var productMatchAmbiguous = !!productMatch.ambiguous;
      var productQueryTooShort = !!productMatch.tooShort;
      if (dashboardData.geo && dashboardData.geo.cityStats) {
        Object.keys(dashboardData.geo.cityStats).forEach(cityName => {
          if (normalizeSearchText(text).includes(normalizeSearchText(cityName))) {
            pushUnique(cities, cityName);
          }
        });
      }
    }

    // Determine ranking target (best/worst)
    let rankingTarget = null;
    let rankingLimit = null;
    let rankingEntity = null;
    if (textLower.match(/\b(worst|lowest|weakest|bad|failing|dangerous)\b/) || /اسوأ|أسوأ|اضعف|أضعف|وحش|سيئ|خطر/.test(textLower)) rankingTarget = 'worst';
    if (textLower.match(/\b(best|highest|top|good|winning|strongest)\b/) || /افضل|أفضل|اقوى|أقوى|احسن|أحسن/.test(textLower)) rankingTarget = 'best';
    if (textLower.match(/\b(city|cities)\b/) || /مدينة|مدن/.test(textLower)) rankingEntity = 'cities';
    if (textLower.match(/\b(product|products|items|app|apps)\b/) || /منتج|منتجات|ابلكيشن|تطبيق/.test(textLower)) rankingEntity = 'products';
    if (textLower.match(/\b(profitable|profit|commission)\b/) && rankingEntity) rankingTarget = rankingTarget || 'best';
    
    const limitMatch = textLower.match(/\b(top|worst)\s+(\d+)\b/);
    if (limitMatch) rankingLimit = parseInt(limitMatch[2], 10);

    return {
      products,
      cities,
      metrics,
      dates: [],
      rankingLimit: rankingLimit || 1,
      rankingTarget,
      rankingEntity,
      productCandidates,
      productMatchAmbiguous,
      productQueryTooShort,
      comparisonTargets: [],
      calculatorInputs: {}
    };
  }

  function detectIntent(text, entities) {
    const lower = text.toLowerCase();
    const hasProductMetric = entities.metrics.length > 0 && PRODUCT_METRIC_WORDS.test(text);
    const hasPossibleProductName = hasProductMetric && !entities.rankingTarget && /[\u0600-\u06ff]/.test(text) && searchTokens(text).length >= 2;
    const hasProductContextWord = PRODUCT_CONTEXT_WORDS.test(lower);
    const hasShortProductHint = entities.productQueryTooShort && (hasProductContextWord || /[\u0600-\u06ff]/.test(text));
    const asksProductMetric = hasProductMetric && (
      entities.products.length > 0 ||
      hasProductContextWord ||
      hasPossibleProductName ||
      entities.productMatchAmbiguous ||
      hasShortProductHint
    );
    
    // Check for explicit comparison
    if (lower.includes('vs') || lower.includes('compare')) {
      return INTENTS.COMPARISON_QUERY;
    }
    if (lower.match(/\b(what\s+(ndr|cpa|roi|roas|margin)\s+is\s+required|how\s+much\s+margin|need\s+to\s+break\s+even|break-even|calculate|calculator)\b/)) {
      return INTENTS.CALCULATOR_SIMULATION;
    }
    if (entities.rankingTarget && entities.rankingEntity && !entities.products.length && !/\b(scal\w*|grow\w*|invest)\b/i.test(lower)) return INTENTS.RANKING_QUERY;
    if (asksProductMetric && !entities.rankingTarget) return INTENTS.PRODUCT_ANALYSIS;
    if (lower.match(/\b(forecast|predict|projection|next week|next month|expected|what\s+will\s+happen|where\s+will\s+profit\s+likely\s+improve)\b/)) {
      return INTENTS.FORECAST_QUERY;
    }
    if (lower.match(/\b(where\s+is\s+most\s+money\s+being\s+lost|killing|hurting|profitability|margins?|money\s+being\s+lost|lost\s+money|losing|loss|low profit)\b/)) {
      return INTENTS.LOSS_ANALYSIS;
    }
    if (entities.metrics.length > 0 && lower.match(/\b(why|reason|cause|causing|improve|fix|weak|worse|bad|drop|meaning|mean)\b/)) {
      return INTENTS.ACCOUNT_HEALTH_CHECK;
    }
    if (lower.match(/\b(filter|show only|where\s+(status|city|product|orders|cod|ndr|commission|sku)\b|segment)\b/)) return INTENTS.FILTER_QUERY;
    if (lower.match(/\b(sort|order by)\b/)) return INTENTS.SORT_QUERY;
    if (lower.match(/\b(chart|graph|plot)\b/)) return INTENTS.CHART_QUERY;
    if (lower.match(/\b(page|next page|previous page|pagination)\b/)) return INTENTS.PAGINATION_QUERY;
    if (lower.match(/\b(export|download|excel|csv|xlsx)\b/)) return INTENTS.EXPORT_QUERY;
    if (lower.match(/\b(how many|count|total revenue|total orders|total commission|what is total|what's total)\b/)) return INTENTS.KPI_ANALYSIS;

    if (lower.match(/\b(suspicious|weird|suddenly|anomaly|spike|biggest anomaly)\b/)) {
      return INTENTS.ANOMALY_DETECTION;
    }
    if (lower.match(/\b(trend|this week|next week|recently|changed|improving|worse|worsening|recovering|collapse|collapsed|drop)\b/)) {
      return INTENTS.TREND_ANALYSIS;
    }

    // Strategic scale/recommendation questions should use the operator path, not a plain ranking.
    if (lower.match(/\b(why|reason|problem|issue|blocked|not|isn'?t|aren'?t|cannot|can't)\b/) &&
        lower.match(/\b(scal\w*|grow\w*|profit\w*|city|cities|product|products)\b/)) {
      return INTENTS.SCALE_ANALYSIS;
    }
    if (lower.match(/\b(scal\w*|invest|grow\w*)\b/)) {
      return INTENTS.SCALE_ANALYSIS;
    }
    
    // Check for ranking
    if (lower.match(/\b(top|worst|best|strongest|weakest)\s+\d*\s*(cities|products|items|apps?)\b/) ||
        lower.match(/\b(which|what)\s+(city|cities|product|products|app|apps).*(profitable|profit|commission|best|worst|strongest|weakest)\b/) ||
        (entities.rankingTarget && entities.metrics.length === 0 && (entities.products.length === 0 && entities.cities.length === 0))) {
      return INTENTS.RANKING_QUERY;
    }

    // Check for scaling / calculator
    if (lower.match(/\b(if delivery improves|happen if)\b/)) {
      return INTENTS.CALCULATOR_SIMULATION;
    }

    // Check for specific entities
    if (entities.products.length > 0) {
      return INTENTS.PRODUCT_ANALYSIS;
    }
    if (entities.cities.length > 0) {
      return INTENTS.CITY_ANALYSIS;
    }

    // Check for KPIs
    if (entities.metrics.length > 0) {
      return INTENTS.KPI_ANALYSIS;
    }

    // Check for Loss / Anomalies
    if (lower.match(/\b(losing|loss|low profit|wrong|drop|bad)\b/)) {
      return INTENTS.LOSS_ANALYSIS;
    }
    if (lower.match(/\b(suspicious|weird|suddenly|changed|anomaly)\b/)) {
      return INTENTS.ANOMALY_DETECTION;
    }
    if (lower.match(/\b(trend|this week|improving|worse)\b/)) {
      return INTENTS.TREND_ANALYSIS;
    }

    // Default to general account health
    return INTENTS.ACCOUNT_HEALTH_CHECK;
  }

  function parse(text, dashboardData, sessionMemory) {
    const entities = extractEntities(text, dashboardData);
    
    // Apply session memory if applicable (e.g. "what about Cairo?" while talking about Product X)
    if (sessionMemory) {
      if (entities.products.length === 0 && sessionMemory.currentProduct) {
        entities.products.push(sessionMemory.currentProduct);
      }
      if (entities.cities.length === 0 && sessionMemory.currentCity) {
        entities.cities.push(sessionMemory.currentCity);
      }
    }

    const intent = detectIntent(text, entities);

    const localOnly = LOCAL_ONLY_INTENTS.has(intent);
    const blockedReason = PROMPT_INJECTION.test(text) ? 'prompt_injection' : '';

    return {
      intent,
      entities,
      rawText: text,
      localOnly,
      aiAllowed: !blockedReason,
      blockedReason
    };
  }

  window.KhodAiIntentDetector = {
    INTENTS,
    LOCAL_ONLY_INTENTS,
    parse
  };

})();
