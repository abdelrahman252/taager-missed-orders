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
  const PRODUCT_SEARCH_CACHE = new WeakMap();

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

  function productSearchMetadata(product) {
    if (!product || typeof product !== "object") return null;
    const name = product.name || "";
    const sku = product.sku || "";
    const key = product.key || "";
    const signature = name + "\u0000" + sku + "\u0000" + key;
    const cached = PRODUCT_SEARCH_CACHE.get(product);
    if (cached && cached.signature === signature) return cached;
    const metadata = {
      signature,
      displayName: name || key || sku,
      normalizedName: normalizeSearchText(name),
      normalizedSku: normalizeSearchText(sku),
      normalizedKey: normalizeSearchText(key),
      tokens: searchTokens(name + " " + sku + " " + key)
    };
    PRODUCT_SEARCH_CACHE.set(product, metadata);
    return metadata;
  }

  function matchKnownProducts(text, dashboardData, normalizedText, queryTokens) {
    const found = [];
    const candidates = [];
    const products = dashboardData && dashboardData.products && dashboardData.products.rankedList
      ? dashboardData.products.rankedList
      : [];
    if (!products.length) return { matches: found, candidates: [], ambiguous: false, tooShort: false };

    normalizedText = normalizedText || normalizeSearchText(text);
    queryTokens = queryTokens || searchTokens(text);
    const querySet = new Set(queryTokens);

    products.forEach(product => {
      const metadata = productSearchMetadata(product);
      if (!metadata || !metadata.displayName) return;
      const name = metadata.displayName;
      if ((metadata.normalizedName && normalizedText.includes(metadata.normalizedName)) ||
          (metadata.normalizedSku && normalizedText.includes(metadata.normalizedSku)) ||
          (metadata.normalizedKey && normalizedText.includes(metadata.normalizedKey))) {
        pushUnique(found, name);
        return;
      }

      const productTokens = metadata.tokens;
      if (!productTokens.length || !querySet.size) return;
      let matchedCount = 0;
      let strongSingleToken = "";
      productTokens.forEach(token => {
        if (!querySet.has(token)) return;
        matchedCount++;
        if (!strongSingleToken && token.length >= 4) strongSingleToken = token;
      });
      const denominator = Math.max(1, Math.min(productTokens.length, querySet.size));
      const score = matchedCount / denominator;
      const hasStrongSingleToken = matchedCount === 1 && !!strongSingleToken;
      if ((matchedCount >= 2 && (score >= 0.35 || matchedCount >= 4)) || hasStrongSingleToken) {
        candidates.push({ name, score: hasStrongSingleToken ? 0.25 : score, matched: matchedCount });
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
    const normalizedText = normalizeSearchText(text);
    const queryTokens = searchTokens(text);

    // Identify metrics
    const metricKeywords = {
      'ndr': 'ndr', 'delivery': 'ndr', 'delivered': 'ndr',
      'cpa': 'cpa', 'roi': 'roi', 'roas': 'roas',
      'profit': 'earnedProfitAfterTax', 'profitable': 'earnedProfitAfterTax', 'commission': 'earnedProfitAfterTax',
      'orders': 'orders', 'order': 'orders',
      'risk': 'riskScore', 'risky': 'riskScore',
      'scale': 'scalingScore', 'scaling': 'scalingScore',
      'margin': 'margin', 'refund': 'refund', 'approval': 'approval'
    };
    for (const [key, val] of Object.entries(metricKeywords)) {
      if (textLower.includes(key)) metrics.push(val);
    }

    // Identify products and cities from dashboard data if available
    if (dashboardData) {
      const productMatch = matchKnownProducts(text, dashboardData, normalizedText, queryTokens);
      productMatch.matches.forEach(name => pushUnique(products, name));
      var productCandidates = productMatch.candidates || [];
      var productMatchAmbiguous = !!productMatch.ambiguous;
      var productQueryTooShort = !!productMatch.tooShort;
      if (dashboardData.geo && dashboardData.geo.cityStats) {
        Object.keys(dashboardData.geo.cityStats).forEach(cityName => {
          if (normalizedText.includes(normalizeSearchText(cityName))) {
            pushUnique(cities, cityName);
          }
        });
      }
    }

    // Determine ranking target, metric, and direction.
    let rankingTarget = null;
    let rankingLimit = null;
    let rankingEntity = null;
    let rankingMetric = null;
    let rankingDirection = null;
    const asksLowest = /\b(lowest|least|minimum)\b/.test(textLower) || /اقل|أقل/.test(textLower);
    const asksHighest = /\b(highest|most|maximum)\b/.test(textLower) || /اعلى|أعلى/.test(textLower);
    if (textLower.match(/\b(worst|lowest|weakest|bad|failing|dangerous)\b/) || /اسوأ|أسوأ|اضعف|أضعف|اقل|أقل|سيئ|خطر/.test(textLower)) {
      rankingTarget = 'worst';
      rankingDirection = 'asc';
    }
    if (textLower.match(/\b(best|highest|top|good|winning|strongest)\b/) || /افضل|أفضل|اقوى|أقوى|احسن|أحسن|اعلى|أعلى/.test(textLower)) {
      rankingTarget = 'best';
      rankingDirection = 'desc';
    }
    if (textLower.match(/\b(city|cities)\b/) || /مدينة|مدن/.test(textLower)) rankingEntity = 'cities';
    if (textLower.match(/\b(product|products|items|app|apps)\b/) || /منتج|منتجات|ابلكيشن|تطبيق/.test(textLower)) rankingEntity = 'products';
    if (textLower.match(/\b(profitable|profit|commission)\b/) && rankingEntity) rankingTarget = rankingTarget || 'best';
    if (/\b(ndr|delivery|delivered)\b/i.test(textLower) || /التسليم/.test(textLower)) rankingMetric = 'ndr';
    else if (/\bcpa\b/i.test(textLower) || /تكلفة.*اكتساب/.test(textLower)) rankingMetric = 'cpa';
    else if (/\b(risk|risky|danger)\b/i.test(textLower) || /مخاطر|خطر/.test(textLower)) rankingMetric = 'riskScore';
    else if (/\b(scale|scaling)\b/i.test(textLower) || /توسع|توسيع/.test(textLower)) rankingMetric = 'scalingScore';
    else if (/\b(order|orders|volume)\b/i.test(textLower) || /طلبات|طلب/.test(textLower)) rankingMetric = 'orders';
    else if (/\b(profit|profitable|commission)\b/i.test(textLower) || /ربح|عمولة/.test(textLower)) rankingMetric = 'earnedProfitAfterTax';
    if (!rankingMetric && rankingEntity) rankingMetric = rankingTarget === 'worst' ? 'ndr' : 'earnedProfitAfterTax';
    if (asksLowest) rankingDirection = 'asc';
    else if (asksHighest) rankingDirection = 'desc';
    else if (rankingTarget === 'worst' && (rankingMetric === 'cpa' || rankingMetric === 'riskScore')) rankingDirection = 'desc';
    else if (rankingTarget === 'best' && (rankingMetric === 'cpa' || rankingMetric === 'riskScore')) rankingDirection = 'asc';
    if (!rankingDirection && rankingTarget) rankingDirection = rankingTarget === 'worst' ? 'asc' : 'desc';
    
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
      rankingMetric,
      rankingDirection,
      rankingContract: rankingEntity && rankingTarget ? {
        entity: rankingEntity,
        metric: rankingMetric || 'earnedProfitAfterTax',
        direction: rankingDirection || (rankingTarget === 'worst' ? 'asc' : 'desc'),
        limit: rankingLimit || 1,
        samplePolicy: rankingMetric === 'ndr' ? 'meaningful_with_raw_note' : 'all',
        minimumOrders: rankingMetric === 'ndr' ? 20 : 0
      } : null,
      productCandidates,
      productMatchAmbiguous,
      productQueryTooShort,
      comparisonTargets: [],
      calculatorInputs: {}
    };
  }

  function detectIntent(text, entities) {
    const lower = text.toLowerCase();
    const normalized = normalizeSearchText(text);
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
    if (/\bcpa\b/i.test(lower) && (
      /(?:account|الحساب|حساب|للحساب)/.test(normalized) ||
      (/(?:ما هي|ما هو|كم|تكلفه)/.test(normalized) && !/(?:منتج|منتجات)/.test(normalized))
    )) {
      return INTENTS.KPI_ANALYSIS;
    }
    if (/\b(build|make|create|give me)\b.*\b(scale|scaling|growth)\s+plan\b|\bscale\s+plan\b/i.test(lower) ||
        /\bplan\b.*\b(scale|scaling|growth)\b/i.test(lower) ||
        /(?:ابن|اعمل|ضع|جهز).*خطه.*(?:توسع|توسيع)/.test(normalized) ||
        /خطه.*(?:توسع|توسيع)/.test(normalized)) {
      return INTENTS.SCALE_ANALYSIS;
    }
    if (lower.match(/\b(what\s+(ndr|cpa|roi|roas|margin)\s+is\s+required|how\s+much\s+margin|need\s+to\s+break\s+even|break-even|calculate|calculator)\b/)) {
      return INTENTS.CALCULATOR_SIMULATION;
    }
    const explicitScalingScoreRanking = /\b(highest|lowest|top|best|worst)\b.*\b(?:scaling|scale)\s+score\b/i.test(lower);
    if (entities.rankingTarget && entities.rankingEntity && !entities.products.length &&
        (explicitScalingScoreRanking || !/\b(scal\w*|grow\w*|invest)\b/i.test(lower))) {
      return INTENTS.RANKING_QUERY;
    }
    if (asksProductMetric && !entities.rankingTarget) return INTENTS.PRODUCT_ANALYSIS;
    if (lower.match(/\b(forecast|predict|projection|next week|next month|expected|what\s+will\s+happen|where\s+will\s+profit\s+likely\s+improve)\b/)) {
      return INTENTS.FORECAST_QUERY;
    }
    if (lower.match(/\b(where\s+is\s+most\s+money\s+being\s+lost|killing|hurting|profitability|margins?|money\s+being\s+lost|lost\s+money|losing|loss|low profit|profit\s+weak|weak\s+profit)\b/) ||
        /ليه.*(?:بخسر|الخسار|الربح)|لماذا.*(?:اخسر|الخسار|الربح)|الربح.*(?:ضعيف|منخفض)|(?:خسار|بخسر)/.test(normalized)) {
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
    
    // Carry entity memory only for genuine references. Unrelated questions such as
    // "What is my account CPA?" must not inherit the last city or product.
    if (sessionMemory) {
      const normalized = normalizeSearchText(text);
      const referencesPrevious = /\b(it|this|that|same|there|what about|for it|its)\b/i.test(normalized) ||
        /ماذا عن|ما وضع|هذا|هذه|نفسه|نفسها|عنه|عنها/.test(normalized);
      const referencesProduct = referencesPrevious || /\b(this|that|same)\s+(product|item|app)\b/i.test(normalized);
      const referencesCity = referencesPrevious || /\b(this|that|same)\s+city\b/i.test(normalized);
      if (entities.products.length === 0 && sessionMemory.currentProduct && referencesProduct) {
        entities.products.push(sessionMemory.currentProduct);
      }
      if (entities.cities.length === 0 && sessionMemory.currentCity && referencesCity) {
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
