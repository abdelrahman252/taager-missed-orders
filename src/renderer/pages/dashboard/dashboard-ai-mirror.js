(function () {
  "use strict";

  var VERSION = 1;
  var MAX_MEMORY_MIRRORS = 6;
  var mirrorCache = [];
  var pendingBuilds = {};
  var filterSubscriptionReady = false;
  var lastDiagnostics = {
    mirrorKey: "",
    builtAt: "",
    freshness: "missing",
    selectedSlice: "",
    route: "",
    latencyMs: 0,
    rowsIncluded: {}
  };

  function num(value, digits) {
    var n = Number(value || 0);
    if (!isFinite(n)) n = 0;
    return Number(n.toFixed(digits == null ? 2 : digits));
  }

  function text(value, fallback) {
    return String(value == null || value === "" ? (fallback || "") : value);
  }

  function pct(value) {
    var n = Number(value || 0);
    return n > 1 ? num(n, 1) : num(n * 100, 1);
  }

  function stableStringify(value) {
    if (value == null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + stableStringify(value[key]);
    }).join(",") + "}";
  }

  function hashString(value) {
    var str = String(value || "");
    var hash = 2166136261;
    for (var i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
  }

  function currentFilters() {
    try {
      return window.DashboardFilterBus && window.DashboardFilterBus.getState
        ? window.DashboardFilterBus.getState()
        : {};
    } catch (_) {
      return {};
    }
  }

  function buildMirrorKey(data) {
    data = data || {};
    var meta = data.meta || {};
    var marketing = data.marketing || {};
    var filters = currentFilters();
    var products = data.products && data.products.rankedList || [];
    var cityStats = data.geo && data.geo.cityStats || {};
    var overviewOrders = data.overview && data.overview.totalOrders && data.overview.totalOrders.value || 0;
    var parts = [
      meta.dashboardRevision || meta.snapshotRevision || data.revision || meta.revision || 0,
      meta.marketingRevision || marketing.revision || 0,
      meta.activeAccountId || "__all__",
      stableStringify(meta.period || meta.datePeriod || meta.range || meta.periodLabel || ""),
      meta.deliveredDateMode || "updatedAt",
      window.dashboardActiveCurrency || (data.roi && data.roi.currency) || "SAR",
      overviewOrders,
      products.length,
      Object.keys(cityStats).length,
      hashString(stableStringify(filters))
    ];
    return parts.join("|");
  }

  function sortBy(list, getter, dir) {
    return (list || []).slice().sort(function (a, b) {
      var av = Number(getter(a) || 0);
      var bv = Number(getter(b) || 0);
      return dir === "asc" ? av - bv : bv - av;
    });
  }

  function rowLimit(list, limit) {
    return (Array.isArray(list) ? list : []).slice(0, limit || 12);
  }

  function rememberMirror(mirror) {
    if (!mirror || !mirror.mirrorKey) return mirror;
    mirrorCache = mirrorCache.filter(function (entry) { return entry && entry.mirrorKey !== mirror.mirrorKey; });
    mirrorCache.unshift(mirror);
    if (mirrorCache.length > MAX_MEMORY_MIRRORS) mirrorCache.length = MAX_MEMORY_MIRRORS;
    return mirror;
  }

  function memoryMirror(mirrorKey) {
    var idx = mirrorCache.findIndex(function (entry) { return entry && entry.mirrorKey === mirrorKey; });
    if (idx < 0) return null;
    var mirror = mirrorCache[idx];
    if (idx > 0) {
      mirrorCache.splice(idx, 1);
      mirrorCache.unshift(mirror);
    }
    return mirror;
  }

  function decisionFromSharedEvaluator(input) {
    if (window.TaagerCampaignDecision && typeof window.TaagerCampaignDecision.evaluate === "function") {
      return window.TaagerCampaignDecision.evaluate(input || {});
    }
    return {
      decision: "watch",
      status: "watch",
      nextAction: "Keep watching until shared decision rules are available.",
      confidence: { level: "limited" },
      facts: input || {},
      reasons: []
    };
  }

  function scoreProduct(p) {
    var next = Object.assign({}, p);
    next.riskScore = num(next.riskScore != null ? next.riskScore : (window.computeRiskScore ? window.computeRiskScore({
      count: next.orders,
      deliveredOrders: next.delivered,
      ndrPct: next.ndrPct,
      codPct: next.codPct,
      gap: next.gap,
      due: next.due
    }) : 0), 1);
    next.scalingScore = num(next.scalingScore != null ? next.scalingScore : (window.computeScalingScore ? window.computeScalingScore({
      count: next.orders,
      deliveredOrders: next.delivered,
      drPct: next.drPct,
      ndrPct: next.ndrPct,
      prepaidPct: next.prepaidPct
    }, {}) : 0), 1);
    next.scaleScore = next.scalingScore;
    var decision = decisionFromSharedEvaluator({
      orders: next.orders,
      delivered: next.delivered,
      ndrPct: next.ndrPct,
      cancelPct: next.cancelPct,
      cpa: next.cpa,
      breakEvenCpa: next.breakEvenCpa,
      netProfit: next.profitLoss != null ? next.profitLoss : next.netProfit,
      deliveredCpa: next.deliveredCpa,
      avgDeliveredProfit: next.avgCommissionSar,
      cities: next.topCities
    });
    next.decision = decision.decision || decision.status || "watch";
    next.decisionMetadata = decision;
    next.nextAction = decision.nextAction || "Keep watching until the sample is stronger.";
    return next;
  }

  function scoreCity(city) {
    var next = Object.assign({}, city);
    next.riskScore = num(next.riskScore != null ? next.riskScore : (window.computeRiskScore ? window.computeRiskScore({
      count: next.orders,
      deliveredOrders: next.delivered,
      ndrPct: next.ndrPct,
      codPct: next.codPct,
      prepaidPct: next.prepaidPct
    }) : 0), 1);
    next.scalingScore = num(next.scalingScore != null ? next.scalingScore : (window.computeScalingScore ? window.computeScalingScore({
      count: next.orders,
      deliveredOrders: next.delivered,
      drPct: next.drPct,
      ndrPct: next.ndrPct,
      prepaidPct: next.prepaidPct
    }, {}) : 0), 1);
    next.decision = next.decision || next.status || (next.scalingScore > next.riskScore ? "scale" : (next.riskScore > next.scalingScore ? "fix_first" : "watch"));
    next.nextAction = next.nextAction || (next.decision === "scale"
      ? "Test this city with a small budget cap and watch NDR."
      : (next.decision === "fix_first" ? "Fix delivery quality before adding spend." : "Keep watching until the city signal is stronger."));
    return next;
  }

  function normalizeCampaign(item) {
    item = item || {};
    var spend = Number(item.spend || item.adSpend || item.amountSpent || 0);
    var taagerOrders = Number(item.taagerOrders || item.orders || item.orderCount || 0);
    var delivered = Number(item.deliveredOrders || item.delivered || 0);
    var grossProfit = Number(item.profit || item.earnedProfitAfterTax || item.commission || 0);
    var netProfit = item.netProfit != null ? Number(item.netProfit || 0) : (grossProfit - spend);
    var cpa = Number(item.cpa || item.taagerCpa || (taagerOrders ? spend / taagerOrders : 0));
    var decision = decisionFromSharedEvaluator({
      orders: taagerOrders,
      delivered: delivered,
      ndrPct: item.ndrPct || item.taagerNdrPct,
      cancelPct: item.cancelPct || item.cancelRate,
      cpa: cpa,
      breakEvenCpa: item.breakEvenCpa,
      deliveredCpa: delivered ? spend / delivered : 0,
      avgDeliveredProfit: item.avgDeliveredProfit,
      netProfit: netProfit
    });
    return {
      id: text(item.id || item.campaignId || item.name, "campaign"),
      name: text(item.name || item.campaignName || item.product, "Campaign"),
      matchedProduct: text(item.product || item.matchedProduct || item.productName, ""),
      objective: text(item.objective || item.optimizationGoal || ""),
      status: text(item.status || item.creativeStatus || ""),
      spend: num(spend, 2),
      currency: text(item.currency || window.dashboardActiveCurrency, "SAR"),
      orders: taagerOrders,
      delivered: delivered,
      cpa: num(cpa, 2),
      deliveredCpa: delivered ? num(spend / delivered, 2) : 0,
      netProfit: num(netProfit, 2),
      roi: spend ? num(netProfit / spend, 2) : 0,
      decision: decision.decision || decision.status || "watch",
      action: taagerOrders === 0 && spend > 0 ? "reduce" : (decision.decision || decision.status || "watch"),
      nextAction: taagerOrders === 0 && spend > 0 ? "Reduce spend until it creates Taager-attributed orders." : decision.nextAction
    };
  }

  function buildMirror(data, opts) {
    opts = opts || {};
    var started = Date.now();
    data = data || window.dashboardGeoData || {};
    var context = window.getDashboardAiContext
      ? window.getDashboardAiContext({ data: data, productLimit: 80, cityLimit: 80, forecastLimit: 40 })
      : {};
    var meta = data.meta || {};
    var products = rowLimit((context.products || []).map(scoreProduct), 80);
    var cities = rowLimit((context.cities || []).map(scoreCity), 80);
    var campaigns = [];
    var media = context.mediaBuying || data.campaignIntelligence || data.mediaBuying || null;
    if (media) {
      campaigns = []
        .concat(media.topSpendCampaigns || [])
        .concat(media.topProductGroups || [])
        .concat(media.worstCampaigns || [])
        .map(normalizeCampaign)
        .slice(0, 40);
    }
    var roi = context.productFinancials && context.productFinancials.accountBreakEven || {};
    var overview = data.overview || {};
    var accountSummary = {
      activeAccountId: meta.activeAccountId || "__all__",
      activeAccountLabel: meta.activeAccountLabel || meta.activeAccountName || "",
      periodLabel: meta.periodLabel || meta.monthLabel || "",
      deliveredDateMode: meta.deliveredDateMode || "updatedAt",
      totalOrders: Number(context.dataset && context.dataset.totalOrders || overview.totalOrders && overview.totalOrders.value || 0),
      delivered: Number(data.roi && (data.roi.deliveredCount || data.roi.deliveredOrders) || overview.deliveredOrders && overview.deliveredOrders.value || 0),
      ndrPct: num(data.roi && data.roi.ndrPct || data.geo && data.geo.kpis && data.geo.kpis.ndr || 0, 1),
      drPct: num(data.roi && data.roi.drPct || data.geo && data.geo.kpis && data.geo.kpis.dr || 0, 1),
      cpa: num(roi.actualCpa || data.roi && data.roi.avgCPA || 0, 2),
      spend: num(context.productFinancials && context.productFinancials.accountAdSpend || data.roi && data.roi.adSpend || 0, 2),
      deliveredSales: num(overview.totalDeliveredSales && overview.totalDeliveredSales.value || data.roi && data.roi.totalDeliveredSales || 0, 2),
      aov: num(overview.deliveredAov && overview.deliveredAov.value || data.roi && data.roi.deliveredAov || 0, 2),
      earnedProfitAfterTax: num(overview.earnedProfitAfterTax && overview.earnedProfitAfterTax.value || overview.earnedCommission && overview.earnedCommission.value || 0, 2),
      lostProfitAfterTax: num(overview.lostProfitAfterTax && overview.lostProfitAfterTax.value || overview.lostCommission && overview.lostCommission.value || 0, 2),
      netProfit: num((overview.earnedProfitAfterTax && overview.earnedProfitAfterTax.value || overview.earnedCommission && overview.earnedCommission.value || 0) - (context.productFinancials && context.productFinancials.accountAdSpend || data.roi && data.roi.adSpend || 0), 2),
      breakEvenCpa: num(roi.breakEvenCpa || 0, 2),
      currency: text(roi.currency || data.roi && data.roi.currency || window.dashboardActiveCurrency, "SAR")
    };
    accountSummary.healthLevel = accountSummary.ndrPct >= 45 && accountSummary.netProfit >= 0 ? "healthy" : (accountSummary.ndrPct < 25 || accountSummary.netProfit < 0 ? "risk" : "watch");
    accountSummary.growthLevel = products.some(function (p) { return p.decision === "scale"; }) || cities.some(function (c) { return c.decision === "scale"; }) ? "ready" : "limited";

    var rankings = {
      topProducts: sortBy(products, function (p) { return p.profitLoss || p.commission || 0; }, "desc").slice(0, 10),
      worstProducts: sortBy(products, function (p) { return p.riskScore; }, "desc").slice(0, 10),
      productsToScale: products.filter(function (p) { return p.decision === "scale"; }).slice(0, 10),
      productsToFixFirst: products.filter(function (p) { return p.decision === "fix_first"; }).slice(0, 10),
      productsToPause: products.filter(function (p) { return p.decision === "pause"; }).slice(0, 10),
      topCities: sortBy(cities, function (c) { return c.earnedProfitAfterTax || c.earnedCommission || 0; }, "desc").slice(0, 10),
      worstCities: sortBy(cities, function (c) { return c.riskScore; }, "desc").slice(0, 10),
      citiesToScale: sortBy(cities.filter(function (c) { return c.decision === "scale"; }), function (c) { return c.scalingScore; }, "desc").slice(0, 10),
      campaignsToReduce: campaigns.filter(function (c) { return c.action === "reduce"; }).slice(0, 10)
    };

    var decisions = {
      firstThingToFix: rankings.productsToPause[0] || rankings.productsToFixFirst[0] || rankings.worstCities[0] || null,
      safestScaleMove: rankings.productsToScale[0] || rankings.citiesToScale[0] || null,
      biggestRisk: rankings.productsToPause[0] || rankings.worstCities[0] || null,
      biggestOpportunity: rankings.productsToScale[0] || rankings.topCities[0] || null,
      productsToPause: rankings.productsToPause,
      productsToFixFirst: rankings.productsToFixFirst,
      productsToScale: rankings.productsToScale,
      citiesToScale: rankings.citiesToScale,
      campaignsToReduce: rankings.campaignsToReduce
    };

    var mirror = {
      version: VERSION,
      mirrorKey: buildMirrorKey(data),
      builtAt: new Date().toISOString(),
      freshness: "fresh",
      accountSummary: accountSummary,
      productScorecards: products,
      cityScorecards: cities,
      campaignScorecards: campaigns,
      rankings: rankings,
      decisions: decisions,
      planInputs: {
        scaleCandidates: rankings.productsToScale,
        blockedReasons: decisions.productsToPause.concat(decisions.productsToFixFirst).slice(0, 12),
        cpaLimits: {
          accountBreakEvenCpa: accountSummary.breakEvenCpa,
          currency: accountSummary.currency
        },
        budgetGuardrails: [
          "Increase spend only after NDR and CPA stay stable.",
          "Stop scaling when CPA rises above break-even CPA.",
          "Avoid scaling weak sample sizes."
        ],
        riskWarnings: [decisions.biggestRisk].filter(Boolean),
        productCityCampaignStrategyInputs: {
          products: rankings.productsToScale.slice(0, 6),
          cities: rankings.citiesToScale.slice(0, 6),
          campaigns: campaigns.slice(0, 8)
        }
      },
      diagnostics: {
        buildTimeMs: Date.now() - started,
        rowsIncluded: {
          products: products.length,
          cities: cities.length,
          campaigns: campaigns.length
        },
        source: "renderer-context"
      }
    };
    mirror.preparedSlices = {
      products: { name: "products", data: { accountSummary: mirror.accountSummary, rankings: mirror.rankings, decisions: mirror.decisions, productScorecards: rowLimit(mirror.productScorecards, 18), planInputs: mirror.planInputs } },
      cities: { name: "cities", data: { accountSummary: mirror.accountSummary, rankings: mirror.rankings, decisions: mirror.decisions, cityScorecards: rowLimit(mirror.cityScorecards, 18), planInputs: mirror.planInputs } },
      campaigns: { name: "campaigns", data: { accountSummary: mirror.accountSummary, decisions: mirror.decisions, campaignScorecards: rowLimit(mirror.campaignScorecards, 18), planInputs: mirror.planInputs } },
      plan: { name: "plan", data: { accountSummary: mirror.accountSummary, decisions: mirror.decisions, planInputs: mirror.planInputs } },
      account: { name: "account", data: { accountSummary: mirror.accountSummary, decisions: mirror.decisions, rankings: mirror.rankings } }
    };
    rememberMirror(mirror);
    lastDiagnostics = Object.assign({}, lastDiagnostics, {
      mirrorKey: mirror.mirrorKey,
      builtAt: mirror.builtAt,
      freshness: mirror.freshness,
      rowsIncluded: mirror.diagnostics.rowsIncluded,
      latencyMs: mirror.diagnostics.buildTimeMs
    });
    if (!opts.skipPersist && window.api && typeof window.api.saveDashboardAiMirror === "function") {
      window.api.saveDashboardAiMirror({ mirrorKey: mirror.mirrorKey, mirror: compactMirror(mirror) }).catch(function () {});
    }
    return mirror;
  }

  function compactMirror(mirror) {
    if (!mirror) return null;
    return Object.assign({}, mirror, {
      productScorecards: rowLimit(mirror.productScorecards, 40),
      cityScorecards: rowLimit(mirror.cityScorecards, 40),
      campaignScorecards: rowLimit(mirror.campaignScorecards, 25)
    });
  }

  function ensureMirror(data) {
    var key = buildMirrorKey(data || window.dashboardGeoData || {});
    var cached = memoryMirror(key);
    if (cached) {
      cached.freshness = "fresh";
      return cached;
    }
    return buildMirror(data || window.dashboardGeoData || {});
  }

  function selectSlice(mirror, intent) {
    mirror = mirror || {};
    var key = String(intent || "account").toLowerCase();
    var name = /product|worst|best|scale|pause|fix/.test(key) ? "products"
      : /city|cities|ndr|delivery/.test(key) ? "cities"
      : /campaign|media|creative|budget/.test(key) ? "campaigns"
      : /plan|strategy|operator_next/.test(key) ? "plan"
      : "account";
    if (mirror.preparedSlices && mirror.preparedSlices[name]) return mirror.preparedSlices[name];
    if (name === "products") return { name: name, data: { accountSummary: mirror.accountSummary, rankings: mirror.rankings, decisions: mirror.decisions, productScorecards: rowLimit(mirror.productScorecards, 18), planInputs: mirror.planInputs } };
    if (name === "cities") return { name: name, data: { accountSummary: mirror.accountSummary, rankings: mirror.rankings, decisions: mirror.decisions, cityScorecards: rowLimit(mirror.cityScorecards, 18), planInputs: mirror.planInputs } };
    if (name === "campaigns") return { name: name, data: { accountSummary: mirror.accountSummary, decisions: mirror.decisions, campaignScorecards: rowLimit(mirror.campaignScorecards, 18), planInputs: mirror.planInputs } };
    if (name === "plan") return { name: name, data: { accountSummary: mirror.accountSummary, decisions: mirror.decisions, planInputs: mirror.planInputs } };
    return { name: name, data: { accountSummary: mirror.accountSummary, decisions: mirror.decisions, rankings: mirror.rankings } };
  }

  function inferIntent(command, parsedIntent) {
    var c = String(command || "").toLowerCase();
    var raw = String(command || "");
    var intent = parsedIntent && parsedIntent.intent || "";
    if (/\b(what should i do|what next|next move|priority|do now|right now)\b/.test(c) || /\u0627\u0639\u0645\u0644 \u0627\u064a\u0647|\u0627\u0639\u0645\u0644 \u0625\u064a\u0647|\u0645\u0627\u0630\u0627 \u0623\u0641\u0639\u0644|\u0645\u0627\u0630\u0627 \u0627\u0641\u0639\u0644|\u0627\u0644\u0627\u0648\u0644\u0648\u064a\u0629|\u0627\u0644\u0623\u0648\u0644\u0648\u064a\u0629/.test(String(command || ""))) return "operator_next";
    if (/\b(plan|strategy|tradeoff)\b/.test(c) || /\u062e\u0637\u0629|\u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u0629/.test(String(command || ""))) return "plan";
    if (/\b(campaign|ad|ads|creative|media|spend)\b/.test(c) || /\u062d\u0645\u0644\u0629|\u062d\u0645\u0644\u0627\u062a|\u0625\u0639\u0644\u0627\u0646|\u0627\u0639\u0644\u0627\u0646/.test(raw)) return "campaigns";
    if (/\b(product|products|sku)\b/.test(c) || /\u0645\u0646\u062a\u062c|\u0645\u0646\u062a\u062c\u0627\u062a/.test(raw)) return "products";
    if (/\b(city|cities)\b/.test(c) || /\u0645\u062f\u064a\u0646\u0629|\u0645\u062f\u0646/.test(raw)) return "cities";
    if (/\b(bst|best|wrst|worst)\b.*\b(cities|city)\b/.test(c)) return "cities";
    if (/\b(bst|best|wrst|worst)\b.*\b(products|product)\b/.test(c)) return "products";
    if (intent === "KPI_ANALYSIS" || intent === "CALCULATOR_SIMULATION") return "account";
    if (/\b(ndr|delivery)\b/.test(c)) return "cities";
    if (/\b(pause|fix|scale|worst|best)\b/.test(c)) return "products";
    if (/\b(campaign|ad|ads|creative|media|spend)\b/.test(c)) return "campaigns";
    if (/\b(plan|strategy|campaign|media buying|creative|budget|launch)\b/.test(c) || /خطة|استراتيجية|حملة|ميزانية|توسع/.test(command)) return "plan";
    if (/\b(city|cities|ndr|delivery|city)\b/.test(c) || /مدينة|مدن/.test(command)) return "cities";
    if (/\b(product|products|sku|pause|fix|scale|worst|best)\b/.test(c) || /منتج|منتجات/.test(command)) return "products";
    if (/\b(campaign|ad|ads|creative|media|spend)\b/.test(c)) return "campaigns";
    if (intent === "RANKING_QUERY" || intent === "KPI_ANALYSIS" || intent === "CALCULATOR_SIMULATION") return "account";
    return "account";
  }

  function isPlanRequest(command, parsedIntent) {
    var c = String(command || "").toLowerCase();
    if (isRankingRequest(command, parsedIntent)) return false;
    return /^(STRATEGY_QUERY|SCALE_ANALYSIS|LOSS_ANALYSIS|RECOMMENDATION_QUERY)$/.test(String(parsedIntent && parsedIntent.intent || "")) ||
      /\b(plan|strategy|why|tradeoff|campaign|budget|creative|forecast|predict)\b/.test(c) ||
      /\bwhat happens if\b|\bdouble spend\b/.test(c) ||
      /\u062d\u0633\u0646|\u0623\u062d\u0633\u0646|\u0627\u0648\u0633\u0639|\u0623\u0648\u0633\u0639|\u062a\u0648\u0642\u0639/.test(String(command || "")) ||
      /\u062e\u0637\u0629|\u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u0629|\u062d\u0645\u0644\u0629|\u0645\u064a\u0632\u0627\u0646\u064a\u0629|\u0644\u064a\u0647|\u0644\u0645\u0627\u0630\u0627/.test(String(command || "")) ||
      /خطة|استراتيجية|حملة|ميزانية|ليه/.test(String(command || ""));
  }

  function isRankingRequest(command, parsedIntent) {
    var c = String(command || "").toLowerCase();
    var raw = String(command || "");
    var intent = String(parsedIntent && parsedIntent.intent || "");
    return intent === "RANKING_QUERY" ||
      /\b(top|bottom|best|worst|highest|lowest)\b.*\b(city|cities|product|products|campaign|campaigns)\b/.test(c) ||
      /\b(city|cities|product|products|campaign|campaigns)\b.*\b(top|bottom|best|worst|highest|lowest)\b/.test(c) ||
      /\bwhich\b.*\b(city|cities|product|products|campaign|campaigns)\b/.test(c) ||
      /\b(bst|best|wrst|worst)\b.*\b(city|cities|product|products|campaign|campaigns)\b/.test(c) ||
      /(?:\u0623\u0641\u0636\u0644|\u0627\u0641\u0636\u0644|\u0623\u0636\u0639\u0641|\u0627\u0636\u0639\u0641|\u0623\u0633\u0648\u0623|\u0627\u0633\u0648\u0623|\u0623\u0639\u0644\u0649|\u0627\u0639\u0644\u0649|\u0623\u0642\u0644|\u0627\u0642\u0644).*(?:\u0645\u062f\u0646|\u0645\u0646\u062a\u062c\u0627\u062a|\u062d\u0645\u0644\u0627\u062a)/.test(raw);
  }

  function wantsMultipleRows(command) {
    var c = String(command || "").toLowerCase();
    return /\b(cities|products|campaigns)\b/.test(c) ||
      /\b(top|bottom)\s*[3-5]?\b/.test(c) ||
      /\bwhich\b/.test(c) ||
      /\u0645\u062f\u0646|\u0645\u0646\u062a\u062c\u0627\u062a|\u062d\u0645\u0644\u0627\u062a/.test(String(command || ""));
  }

  function responseLanguage(command) {
    if (window.KhodAiShared && typeof window.KhodAiShared.responseLanguage === "function") {
      return window.KhodAiShared.responseLanguage(command);
    }
    return /[\u0600-\u06ff]/.test(String(command || "")) ? "ar" : "en";
  }

  function isArabic(command) {
    return responseLanguage(command) === "ar";
  }

  function labelsFor(command) {
    if (responseLanguage(command) === "ar") {
      return {
        why: "\u0627\u0644\u062f\u0644\u064a\u0644",
        next: "\u0627\u0644\u062e\u0637\u0648\u0629 \u0627\u0644\u062c\u0627\u064a\u0629",
        cityScale: "\u0623\u0641\u0636\u0644 \u0645\u062f\u064a\u0646\u0629 \u0644\u0644\u062a\u0648\u0633\u0639 \u0627\u0644\u0622\u0646 \u0647\u064a ",
        cityFix: "\u0623\u0648\u0644 \u0645\u062f\u064a\u0646\u0629 \u062a\u062d\u062a\u0627\u062c \u0625\u0635\u0644\u0627\u062d \u0647\u064a ",
        noCity: "\u0644\u0633\u0647 \u0645\u0641\u064a\u0634 \u0625\u0634\u0627\u0631\u0629 \u0645\u062f\u0646 \u0643\u0627\u0641\u064a\u0629.",
        noProduct: "\u0644\u0633\u0647 \u0645\u0641\u064a\u0634 \u0625\u0634\u0627\u0631\u0629 \u0645\u0646\u062a\u062c\u0627\u062a \u0643\u0627\u0641\u064a\u0629.",
        noCampaign: "\u0644\u0633\u0647 \u0645\u0641\u064a\u0634 \u0635\u0631\u0641 \u062d\u0645\u0644\u0627\u062a \u0645\u0631\u0628\u0648\u0637 \u0628\u0627\u0644\u062f\u0627\u0634\u0628\u0648\u0631\u062f.",
        account: "\u0635\u062d\u0629 \u0627\u0644\u062d\u0633\u0627\u0628 ",
        nextFallback: "\u0627\u0628\u062f\u0623 \u0628\u0623\u0642\u0648\u0649 \u0645\u062e\u0627\u0637\u0631\u0629 \u0648\u0631\u0627\u0642\u0628 NDR \u0648 CPA \u0642\u0628\u0644 \u0623\u064a \u062a\u0648\u0633\u0639.",
        scaleAction: "\u0627\u062e\u062a\u0628\u0631 \u0628\u0645\u064a\u0632\u0627\u0646\u064a\u0629 \u0635\u063a\u064a\u0631\u0629 \u0648\u0633\u0642\u0641 \u0648\u0627\u0636\u062d\u060c \u0648\u0648\u0642\u0641 \u0644\u0648 NDR \u0623\u0648 CPA \u0627\u062a\u062d\u0631\u0643\u0648\u0627 \u0636\u062f\u0643.",
        fixAction: "\u0639\u0627\u0644\u062c \u0623\u0648\u0644 \u0633\u0628\u0628 \u062e\u0633\u0627\u0631\u0629 \u0642\u0628\u0644 \u0645\u0627 \u062a\u0632\u0648\u062f \u0627\u0644\u0635\u0631\u0641.",
        cityRanking: "\u0623\u0641\u0636\u0644 \u0627\u0644\u0645\u062f\u0646 \u0644\u0644\u062a\u0648\u0633\u0639:",
        cityFixRanking: "\u0627\u0644\u0645\u062f\u0646 \u0627\u0644\u062a\u064a \u062a\u062d\u062a\u0627\u062c \u0625\u0635\u0644\u0627\u062d\u064b\u0627 \u0623\u0648\u0644\u064b\u0627:",
        productRanking: "\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0628\u0627\u0644\u062a\u0631\u062a\u064a\u0628:",
        openCity: "\u0641\u062a\u062d \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u062f\u064a\u0646\u0629",
        openProduct: "\u0641\u062a\u062d \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u0646\u062a\u062c",
        openOverview: "\u0641\u062a\u062d \u0646\u0638\u0631\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a",
        openCampaigns: "\u0641\u062a\u062d \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u062d\u0645\u0644\u0627\u062a"
      };
    }
    return {
      why: "Why",
      next: "Next move",
      cityScale: "Best city to scale now is ",
      cityFix: "First city to fix is ",
      noCity: "I do not have enough city signal yet.",
      noProduct: "I do not have enough product signal yet.",
      noCampaign: "I do not have matched campaign spend yet.",
      account: "Account health is ",
      nextFallback: "Start with the biggest risk and watch NDR and CPA before adding spend.",
      scaleAction: "Test with a small capped budget, then stop if NDR or CPA moves against you.",
      fixAction: "Fix the first loss source before adding spend."
    };
  }

  function nameOf(row) {
    return text(row && (row.name || row.city || row.sku || row.id), "this item");
  }

  function factsFor(row, kind, currency, ar) {
    if (!row) return [];
    if (kind === "cities") {
      return (ar ? [
        row.orders ? row.orders + " \u0637\u0644\u0628" : "",
        row.delivered != null ? row.delivered + " \u0637\u0644\u0628 \u0645\u0633\u0644\u0645" : "",
        row.ndrPct != null ? "NDR " + row.ndrPct + "%" : "",
        (row.earnedProfitAfterTax || row.earnedCommission) ? "\u0627\u0644\u0631\u0628\u062d \u0627\u0644\u0645\u062d\u0642\u0642 \u0628\u0639\u062f \u0627\u0644\u0636\u0631\u064a\u0628\u0629 " + num(row.earnedProfitAfterTax || row.earnedCommission, 0) + (currency ? " " + currency : "") : ""
      ] : [
        row.orders ? row.orders + " orders" : "",
        row.delivered != null ? row.delivered + " delivered" : "",
        row.ndrPct != null ? "NDR " + row.ndrPct + "%" : "",
        (row.earnedProfitAfterTax || row.earnedCommission) ? "Earned Profit After Tax " + num(row.earnedProfitAfterTax || row.earnedCommission, 0) + (currency ? " " + currency : "") : ""
      ]).filter(Boolean);
    }
    return (ar ? [
      row.orders ? row.orders + " \u0637\u0644\u0628" : "",
      row.delivered != null ? row.delivered + " \u0637\u0644\u0628 \u0645\u0633\u0644\u0645" : "",
      row.ndrPct != null ? "NDR " + row.ndrPct + "%" : "",
      row.cpa ? "\u062a\u0643\u0644\u0641\u0629 CPA " + row.cpa + (currency ? " " + currency : "") : "",
      row.breakEvenCpa ? "\u062d\u062f CPA \u0644\u0644\u062a\u0639\u0627\u062f\u0644 " + row.breakEvenCpa + (currency ? " " + currency : "") : "",
      row.profitLoss ? "\u0635\u0627\u0641\u064a \u0627\u0644\u0631\u0628\u062d \u0648\u0627\u0644\u062e\u0633\u0627\u0631\u0629 " + num(row.profitLoss, 0) + (currency ? " " + currency : "") : ""
    ] : [
      row.orders ? row.orders + " orders" : "",
      row.delivered != null ? row.delivered + " delivered" : "",
      row.ndrPct != null ? "NDR " + row.ndrPct + "%" : "",
      row.cpa ? "CPA " + row.cpa + (currency ? " " + currency : "") : "",
      row.breakEvenCpa ? "break-even CPA " + row.breakEvenCpa + (currency ? " " + currency : "") : "",
      row.profitLoss ? "P&L " + num(row.profitLoss, 0) + (currency ? " " + currency : "") : ""
    ]).filter(Boolean);
  }

  function uniqueRows(rows) {
    var seen = {};
    return (rows || []).filter(function (row) {
      var key = nameOf(row);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function rankingLine(row, index, kind, currency, ar) {
    return (index + 1) + ". " + nameOf(row) + " - " + factsFor(row, kind, currency, ar).slice(0, kind === "cities" ? 4 : 5).join(ar ? "\u060c " : ", ");
  }

  function actionFor(row, kind, labels) {
    if (kind === "cities" && row) return [{ type: "OPEN_CITY", label: labels.openCity || "Open city analytics", city: row.city || row.name }];
    if (kind === "products" && row) return [{ type: "OPEN_PRODUCT", label: labels.openProduct || "Open product analytics", productId: row.id || row.sku || row.name, productName: row.name }];
    if (kind === "campaigns") return [{ type: "OPEN_PAGE", label: labels.openCampaigns || "Open campaign analytics", section: "campaigns" }];
    return [{ type: "OPEN_PAGE", label: labels.openOverview || "Open KPI overview", section: "overview" }];
  }

  function compactPlan(command, mirror, row, kind, currency) {
    var ar = isArabic(command);
    var target = nameOf(row);
    var proof = factsFor(row, kind, currency, ar).slice(0, 4);
    var a = mirror.accountSummary || {};
    var stopCpa = row && row.breakEvenCpa || a.breakEvenCpa || 0;
    var stopRule = ar
      ? "\u0623\u0648\u0642\u0641 \u0627\u0644\u062a\u0648\u0633\u0639 \u0625\u0630\u0627 \u0627\u0646\u062e\u0641\u0636 NDR \u0623\u0648 \u062a\u062c\u0627\u0648\u0632 CPA " + (stopCpa ? stopCpa + " " + currency : "\u062d\u062f \u0627\u0644\u062a\u0639\u0627\u062f\u0644") + "."
      : "Stop scaling if NDR drops or CPA rises above " + (stopCpa ? stopCpa + " " + currency : "break-even CPA") + ".";
    var watch = [
      row && row.ndrPct != null ? "NDR " + row.ndrPct + "%" : (a.ndrPct ? "NDR " + a.ndrPct + "%" : "NDR"),
      row && row.cpa ? "CPA " + row.cpa + " " + currency : (a.cpa ? "CPA " + a.cpa + " " + currency : "CPA"),
      stopCpa ? (ar ? "\u062d\u062f CPA \u0644\u0644\u062a\u0639\u0627\u062f\u0644 " : "break-even CPA ") + stopCpa + " " + currency : "",
      row && row.delivered != null ? (ar ? row.delivered + " \u0637\u0644\u0628 \u0645\u0633\u0644\u0645" : row.delivered + " delivered orders") : "",
      row && (row.earnedProfitAfterTax || row.earnedCommission) ? (ar ? "\u0627\u0644\u0631\u0628\u062d \u0627\u0644\u0645\u062d\u0642\u0642 \u0628\u0639\u062f \u0627\u0644\u0636\u0631\u064a\u0628\u0629 " : "Earned Profit After Tax ") + num(row.earnedProfitAfterTax || row.earnedCommission, 0) + " " + currency : ""
    ].filter(Boolean).slice(0, 4);
    if (ar) {
      return "\u0627\u0644\u062e\u0637\u0629 \u0627\u0644\u0645\u062e\u062a\u0635\u0631\u0629: " + target + ".\n" +
        "\u0644\u0645\u0627\u0630\u0627: " + (proof.length ? proof.join("\u060c ") : "\u0623\u0642\u0648\u0649 \u0641\u0631\u0635\u0629 \u0645\u062a\u0627\u062d\u0629 \u062d\u0627\u0644\u064a\u064b\u0627") + ".\n" +
        "\u0627\u0644\u062e\u0637\u0648\u0627\u062a:\n" +
        "1. \u0627\u0628\u062f\u0623 \u0628\u0627\u062e\u062a\u0628\u0627\u0631 \u0635\u063a\u064a\u0631 \u0648\u0645\u064a\u0632\u0627\u0646\u064a\u0629 \u0645\u062d\u062f\u0648\u062f\u0629 \u0644\u0640 " + target + ".\n" +
        "2. \u0631\u0627\u0642\u0628 NDR \u0648 CPA \u0628\u0639\u062f \u0643\u0644 \u0632\u064a\u0627\u062f\u0629.\n" +
        "3. \u0632\u062f \u0627\u0644\u0635\u0631\u0641 \u062a\u062f\u0631\u064a\u062c\u064a\u064b\u0627 \u0641\u0642\u0637 \u0639\u0646\u062f \u062b\u0628\u0627\u062a \u0627\u0644\u0646\u062a\u0627\u0626\u062c.\n" +
        "\u062d\u062f\u0648\u062f \u0627\u0644\u0625\u064a\u0642\u0627\u0641: " + stopRule + "\n" +
        "\u0631\u0627\u0642\u0628: " + watch.join("\u060c ") + ".";
    }
    return "Quick plan: " + target + ".\n" +
      "Why: " + (proof.length ? proof.join(", ") : "This is the strongest available opportunity") + ".\n" +
      "Steps:\n" +
      "1. Start with a small capped test for " + target + ".\n" +
      "2. Check NDR and CPA after each increase.\n" +
      "3. Raise spend gradually only while results stay stable.\n" +
      "Stop rules: " + stopRule + "\n" +
      "Watch: " + watch.join(", ") + ".";
  }

  function isLossOrWeakProfitQuestion(command, parsedIntent) {
    var value = String(command || "");
    return String(parsedIntent && parsedIntent.intent || "") === "LOSS_ANALYSIS" ||
      /\b(?:losing|loss|profit weak|weak profit|low profit|why.*profit)\b/i.test(value) ||
      /\u0628\u062e\u0633\u0631|\u062e\u0633\u0627\u0631|\u0627\u0644\u0631\u0628\u062d \u0636\u0639\u064a\u0641|\u0644\u0645\u0627\u0630\u0627.*\u0627\u0644\u0631\u0628\u062d/.test(value);
  }

  function isAccountCpaQuestion(command, parsedIntent) {
    var value = String(command || "");
    var intent = String(parsedIntent && parsedIntent.intent || "");
    return intent === "KPI_ANALYSIS" && /\bcpa\b/i.test(value) && !/\b(product|products|sku|campaign|campaigns|city|cities)\b/i.test(value) &&
      !/\u0645\u0646\u062a\u062c|\u0645\u0646\u062a\u062c\u0627\u062a|\u062d\u0645\u0644\u0629|\u062d\u0645\u0644\u0627\u062a|\u0645\u062f\u064a\u0646\u0629|\u0645\u062f\u0646/.test(value);
  }

  function accountDiagnosis(mirror, currency, ar) {
    var a = mirror.accountSummary || {};
    var firstRisk = mirror.decisions && mirror.decisions.firstThingToFix;
    var causes = [];
    if (a.netProfit < 0) causes.push(ar ? "\u0635\u0627\u0641\u064a \u0627\u0644\u0631\u0628\u062d " + num(a.netProfit, 0) + " " + currency : "net profit is " + num(a.netProfit, 0) + " " + currency);
    if (a.ndrPct < 45) causes.push(ar ? "NDR \u0645\u0646\u062e\u0641\u0636 \u0639\u0646\u062f " + a.ndrPct + "%" : "NDR is low at " + a.ndrPct + "%");
    if (a.cpa && a.breakEvenCpa && a.cpa > a.breakEvenCpa) causes.push(ar ? "CPA " + a.cpa + " " + currency + " \u0623\u0639\u0644\u0649 \u0645\u0646 \u062d\u062f \u0627\u0644\u062a\u0639\u0627\u062f\u0644 " + a.breakEvenCpa + " " + currency : "CPA " + a.cpa + " " + currency + " is above break-even CPA " + a.breakEvenCpa + " " + currency);
    if (a.totalOrders && a.delivered < a.totalOrders * 0.45) causes.push(ar ? a.delivered + " \u0637\u0644\u0628 \u0645\u0633\u0644\u0645 \u0641\u0642\u0637 \u0645\u0646 " + a.totalOrders : "only " + a.delivered + " delivered orders from " + a.totalOrders);
    if (a.lostProfitAfterTax > a.earnedProfitAfterTax) causes.push(ar ? "\u0627\u0644\u0631\u0628\u062d \u0627\u0644\u0645\u0641\u0642\u0648\u062f " + num(a.lostProfitAfterTax, 0) + " " + currency + " \u0623\u0639\u0644\u0649 \u0645\u0646 \u0627\u0644\u0631\u0628\u062d \u0627\u0644\u0645\u062d\u0642\u0642 " + num(a.earnedProfitAfterTax, 0) + " " + currency : "lost profit after tax " + num(a.lostProfitAfterTax, 0) + " " + currency + " exceeds earned profit after tax " + num(a.earnedProfitAfterTax, 0) + " " + currency);
    if (!causes.length) causes.push(ar ? "NDR " + a.ndrPct + "% \u0648\u0635\u0627\u0641\u064a \u0627\u0644\u0631\u0628\u062d " + num(a.netProfit, 0) + " " + currency : "NDR is " + a.ndrPct + "% and net profit is " + num(a.netProfit, 0) + " " + currency);
    return {
      direct: a.netProfit < 0
        ? (ar ? "\u0627\u0644\u062d\u0633\u0627\u0628 \u062e\u0627\u0633\u0631 \u0641\u0639\u0644\u064b\u0627." : "The account is actually losing money.")
        : (ar ? "\u0627\u0644\u062d\u0633\u0627\u0628 \u0644\u064a\u0633 \u062e\u0627\u0633\u0631\u064b\u0627 \u062d\u0627\u0644\u064a\u064b\u0627\u060c \u0644\u0643\u0646 \u0627\u0644\u0631\u0628\u062d \u0636\u0639\u064a\u0641." : "The account is not currently losing money, but profit is weak."),
      why: causes.slice(0, 4),
      action: firstRisk
        ? (ar ? "\u0631\u0627\u062c\u0639 " + nameOf(firstRisk) + " \u0623\u0648\u0644\u064b\u0627\u060c \u0648\u0623\u0648\u0642\u0641 \u0627\u0644\u062a\u0648\u0633\u0639 \u062d\u062a\u0649 \u064a\u062a\u062d\u0633\u0646 NDR \u0648 CPA." : "Review " + nameOf(firstRisk) + " first, and pause scaling until NDR and CPA improve.")
        : (ar ? "\u0627\u0628\u062f\u0623 \u0628\u062a\u062d\u0633\u064a\u0646 NDR \u0648\u062e\u0641\u0636 CPA \u0642\u0628\u0644 \u0632\u064a\u0627\u062f\u0629 \u0627\u0644\u0635\u0631\u0641." : "Improve NDR and reduce CPA before adding spend.")
    };
  }

  function localAnswer(command, mirror, parsedIntent, localStrategic) {
    var intent = inferIntent(command, parsedIntent);
    var slice = selectSlice(mirror, intent);
    var c = String(command || "").toLowerCase();
    var labels = labelsFor(command);
    var row = null;
    var direct = "";
    var why = [];
    var action = "";
    var multiple = wantsMultipleRows(command);
    var currency = mirror.accountSummary && mirror.accountSummary.currency || "SAR";
    var ar = isArabic(command);
    var answerKind = "account";

    if (intent === "operator_next") {
      row = mirror.decisions && (mirror.decisions.firstThingToFix || mirror.decisions.safestScaleMove || mirror.decisions.biggestOpportunity);
      if (row) {
        answerKind = row.city ? "cities" : "products";
        direct = ar
          ? "\u0627\u0644\u0623\u0648\u0644\u0648\u064a\u0629 \u0627\u0644\u0622\u0646: " + nameOf(row) + "."
          : "Priority now: " + nameOf(row) + ".";
        why = factsFor(row, answerKind, currency, ar);
        action = ar ? (row.decision === "scale" ? labels.scaleAction : labels.fixAction) : (row.nextAction || (row.decision === "scale" ? labels.scaleAction : labels.fixAction));
      } else {
        direct = labels.account + ((mirror.accountSummary && mirror.accountSummary.healthLevel) || "watch") + ".";
        action = labels.nextFallback;
      }
    } else if (intent === "cities") {
      answerKind = "cities";
      var weakCities = /\b(worst|lowest|weak|weakest|risk)\b/i.test(c) ||
        /\u0623\u0636\u0639\u0641|\u0627\u0636\u0639\u0641|\u0623\u0633\u0648\u0623|\u0627\u0633\u0648\u0623|\u0623\u0642\u0644|\u0627\u0642\u0644/.test(String(command || ""));
      var cityRows = weakCities
        ? mirror.rankings.worstCities
        : uniqueRows((mirror.rankings.citiesToScale || []).concat(mirror.rankings.topCities || []));
      row = cityRows[0];
      direct = row ? ((weakCities ? labels.cityFix : labels.cityScale) + row.city + ".") : labels.noCity;
      if (multiple && cityRows.length) {
        direct = (ar ? (weakCities ? labels.cityFixRanking : labels.cityRanking) : (weakCities ? "Cities to fix first:" : "Best cities to scale:")) +
          "\n" + cityRows.slice(0, 5).map(function (item, index) { return rankingLine(item, index, "cities", currency, ar); }).join("\n");
      }
      why = factsFor(row, "cities", currency, ar);
      action = row ? (ar ? (row.decision === "scale" ? labels.scaleAction : labels.fixAction) : (row.nextAction || (row.decision === "scale" ? labels.scaleAction : labels.fixAction))) : labels.nextFallback;
    } else if (intent === "products") {
      answerKind = "products";
      var productRows;
      if (/\b(pause|reduce)\b/i.test(c)) productRows = uniqueRows((mirror.rankings.productsToPause || []).concat(mirror.rankings.worstProducts || []));
      else if (/\b(fix|worst|bad|weak|risk)\b/i.test(c)) productRows = uniqueRows((mirror.rankings.productsToFixFirst || []).concat(mirror.rankings.worstProducts || []));
      else productRows = uniqueRows((mirror.rankings.productsToScale || []).concat(mirror.rankings.topProducts || []));
      row = productRows[0];
      direct = row ? (ar ? "\u0627\u0644\u0645\u0646\u062a\u062c \u0627\u0644\u0623\u0648\u0644\u0649 \u0627\u0644\u0622\u0646: " + nameOf(row) + "." : nameOf(row) + " is the current product answer: " + (row.decision || "watch") + ".") : labels.noProduct;
      if (multiple && productRows.length) {
        direct = (ar ? labels.productRanking : "Products ranked for this decision:") + "\n" + productRows.slice(0, 5).map(function (item, index) { return rankingLine(item, index, "products", currency, ar); }).join("\n");
      }
      why = factsFor(row, "products", currency, ar);
      action = row ? (ar ? (row.decision === "scale" ? labels.scaleAction : labels.fixAction) : (row.nextAction || labels.fixAction)) : labels.nextFallback;
    } else if (intent === "plan") {
      row = mirror.decisions && (mirror.decisions.safestScaleMove || mirror.decisions.biggestOpportunity || mirror.decisions.firstThingToFix);
      answerKind = row && row.city ? "cities" : "products";
      direct = compactPlan(command, mirror, row, answerKind, currency);
    } else if (intent === "campaigns") {
      answerKind = "campaigns";
      row = mirror.decisions && mirror.decisions.campaignsToReduce && mirror.decisions.campaignsToReduce[0] || mirror.campaignScorecards[0];
      direct = row ? (ar ? "\u0627\u0644\u062d\u0645\u0644\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0628\u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629: " + nameOf(row) + "." : nameOf(row) + " is the campaign to review first: " + (row.action || row.decision || "watch") + ".") : labels.noCampaign;
      why = row ? (ar ? [row.spend + " " + row.currency + " \u0625\u0646\u0641\u0627\u0642", row.orders + " \u0637\u0644\u0628", "\u062a\u0643\u0644\u0641\u0629 CPA " + row.cpa + " " + row.currency] : [row.spend + " " + row.currency + " spend", row.orders + " Taager orders", "CPA " + row.cpa]).filter(Boolean) : [];
      action = row ? (ar ? labels.fixAction : (row.nextAction || (row.action === "reduce" ? "Reduce spend until it creates Taager-attributed orders." : "Keep campaign changes small and watch CPA versus break-even."))) : labels.nextFallback;
    } else {
      var a = mirror.accountSummary || {};
      if (isLossOrWeakProfitQuestion(command, parsedIntent)) {
        var diagnosis = accountDiagnosis(mirror, currency, ar);
        direct = diagnosis.direct;
        why = diagnosis.why;
        action = diagnosis.action;
      } else if (isAccountCpaQuestion(command, parsedIntent) && a.cpa) {
        direct = ar
          ? "\u062a\u0643\u0644\u0641\u0629 CPA \u0644\u0644\u062d\u0633\u0627\u0628 \u062d\u0627\u0644\u064a\u064b\u0627 " + a.cpa + " " + a.currency + "."
          : "Account CPA is currently " + a.cpa + " " + a.currency + ".";
        why = (ar ? [
          a.totalOrders ? a.totalOrders + " \u0637\u0644\u0628" : "",
          a.spend ? "\u0625\u0646\u0641\u0627\u0642 " + num(a.spend, 0) + " " + a.currency : "",
          a.breakEvenCpa ? "\u062d\u062f CPA \u0644\u0644\u062a\u0639\u0627\u062f\u0644 " + a.breakEvenCpa + " " + a.currency : "",
          a.ndrPct ? "NDR " + a.ndrPct + "%" : ""
        ] : [
          a.totalOrders ? a.totalOrders + " orders" : "",
          a.spend ? num(a.spend, 0) + " " + a.currency + " spend" : "",
          a.breakEvenCpa ? "break-even CPA " + a.breakEvenCpa + " " + a.currency : "",
          a.ndrPct ? "NDR " + a.ndrPct + "%" : ""
        ]).filter(Boolean);
        action = a.breakEvenCpa && a.cpa > a.breakEvenCpa
          ? (ar ? "\u062e\u0641\u0651\u0636 \u0627\u0644\u0635\u0631\u0641 \u0623\u0648 \u0623\u0635\u0644\u062d \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0642\u0628\u0644 \u0623\u064a \u062a\u0648\u0633\u0639\u060c \u0644\u0623\u0646 CPA \u0623\u0639\u0644\u0649 \u0645\u0646 \u062d\u062f \u0627\u0644\u062a\u0639\u0627\u062f\u0644." : "Reduce spend or fix delivery before scaling, because CPA is above break-even CPA.")
          : (ar ? "\u0631\u0627\u0642\u0628 CPA \u0645\u0639 NDR \u0642\u0628\u0644 \u0623\u064a \u0632\u064a\u0627\u062f\u0629 \u0641\u064a \u0627\u0644\u0635\u0631\u0641." : "Watch CPA together with NDR before adding spend.");
      } else {
        direct = labels.account + (ar ? (a.healthLevel === "healthy" ? "\u062c\u064a\u062f\u0629" : a.healthLevel === "risk" ? "\u062a\u062d\u062a\u0627\u062c \u062a\u062f\u062e\u0644\u064b\u0627" : "\u062a\u062d\u062a \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629") : (a.healthLevel || "watch")) + ".";
        why = (ar ? [
          a.totalOrders ? a.totalOrders + " \u0637\u0644\u0628" : "",
          a.ndrPct ? "NDR " + a.ndrPct + "%" : "",
          a.cpa ? "\u062a\u0643\u0644\u0641\u0629 CPA " + a.cpa + " " + a.currency : "",
          a.breakEvenCpa ? "\u062d\u062f CPA \u0644\u0644\u062a\u0639\u0627\u062f\u0644 " + a.breakEvenCpa + " " + a.currency : ""
        ] : [
          a.totalOrders ? a.totalOrders + " orders" : "",
          a.ndrPct ? "NDR " + a.ndrPct + "%" : "",
          a.cpa ? "CPA " + a.cpa + " " + a.currency : "",
          a.breakEvenCpa ? "break-even CPA " + a.breakEvenCpa + " " + a.currency : ""
        ]).filter(Boolean);
        action = mirror.decisions && mirror.decisions.firstThingToFix
          ? (ar ? "\u0627\u0628\u062f\u0623 \u0628\u0640 " + (mirror.decisions.firstThingToFix.name || mirror.decisions.firstThingToFix.city || "\u0623\u0643\u0628\u0631 \u0645\u062e\u0627\u0637\u0631\u0629") + "." : "Start with " + (mirror.decisions.firstThingToFix.name || mirror.decisions.firstThingToFix.city || "the biggest risk") + ".")
          : labels.nextFallback;
      }
    }

    if (!direct) direct = "I have the dashboard mirror ready.";
    var message = direct;
    if (why.length) message += "\n" + labels.why + ": " + why.slice(0, 4).join(ar ? "\u060c " : ", ") + ".";
    if (action) message += "\n" + labels.next + ": " + action;
    return {
      message: message,
      mode: isPlanRequest(command, parsedIntent) ? "advisor" : "quick",
      selectedSlice: slice.name,
      slice: slice.data,
      enhanceWithGemini: isPlanRequest(command, parsedIntent),
      actions: actionFor(row, answerKind, labels),
      rankingRequest: isRankingRequest(command, parsedIntent),
      localStrategic: localStrategic || null
    };
  }

  function answer(command, data, opts) {
    opts = opts || {};
    var started = Date.now();
    data = data || window.dashboardGeoData || {};
    var key = buildMirrorKey(data);
    var mirror = memoryMirror(key);
    if (!mirror && pendingBuilds[key]) {
      var partial = partialAnswer(command, data, opts);
      partial.mirrorPending = pendingBuilds[key];
      lastDiagnostics = Object.assign({}, lastDiagnostics, {
        mirrorKey: key,
        selectedSlice: "partial",
        route: "LOCAL_PARTIAL",
        latencyMs: Date.now() - started
      });
      return partial;
    }
    if (!mirror && opts.warmOnly) return null;
    if (!mirror) mirror = ensureMirror(data);
    var route = localAnswer(command, mirror, opts.parsedIntent || null, opts.localStrategic || null);
    lastDiagnostics = Object.assign({}, lastDiagnostics, {
      selectedSlice: route.selectedSlice,
      route: route.enhanceWithGemini ? "LOCAL_PLUS_GEMINI" : "LOCAL_ONLY",
      latencyMs: Date.now() - started
    });
    return Object.assign({ mirror: mirror }, route);
  }

  function answerWarm(command, opts) {
    opts = opts || {};
    var started = Date.now();
    var mirror = mirrorCache[0] || null;
    if (!mirror) return null;
    var route = localAnswer(command, mirror, opts.parsedIntent || null, opts.localStrategic || null);
    lastDiagnostics = Object.assign({}, lastDiagnostics, {
      selectedSlice: route.selectedSlice,
      route: route.enhanceWithGemini ? "LOCAL_PLUS_GEMINI" : "LOCAL_ONLY",
      latencyMs: Date.now() - started
    });
    return Object.assign({ mirror: mirror }, route);
  }

  function diagnostics() {
    return Object.assign({}, lastDiagnostics, {
      mirrorKey: mirrorCache[0] && mirrorCache[0].mirrorKey || lastDiagnostics.mirrorKey,
      builtAt: mirrorCache[0] && mirrorCache[0].builtAt || lastDiagnostics.builtAt,
      freshness: mirrorCache[0] ? mirrorCache[0].freshness : "missing",
      memoryCount: mirrorCache.length
    });
  }

  function hydrate(data) {
    var key = buildMirrorKey(data || window.dashboardGeoData || {});
    var cached = memoryMirror(key);
    if (cached) return Promise.resolve(cached);
    if (!window.api || typeof window.api.getDashboardAiMirror !== "function") return Promise.resolve(null);
    return window.api.getDashboardAiMirror(key).then(function (saved) {
      if (saved && saved.mirror && saved.mirror.mirrorKey === key) {
        saved.mirror.freshness = "warm-start";
        rememberMirror(saved.mirror);
        return saved.mirror;
      }
      return null;
    }).catch(function () { return null; });
  }

  function warm(data, opts) {
    opts = opts || {};
    data = data || window.dashboardGeoData || {};
    var key = buildMirrorKey(data);
    var cached = memoryMirror(key);
    if (cached && !opts.force) return Promise.resolve(cached);
    if (pendingBuilds[key]) return pendingBuilds[key];
    pendingBuilds[key] = hydrate(data).then(function (saved) {
      if (saved && !opts.force) return saved;
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(buildMirror(data, opts)); }, 0);
      });
    }).finally(function () {
      delete pendingBuilds[key];
    });
    return pendingBuilds[key];
  }

  function partialAnswer(command, data, opts) {
    var a = data && data.overview || {};
    var roi = data && data.roi || {};
    var ar = isArabic(command);
    var facts = [
      a.totalOrders && a.totalOrders.value ? a.totalOrders.value + (ar ? " \u0637\u0644\u0628" : " orders") : "",
      roi.ndrPct ? "NDR " + num(roi.ndrPct, 1) + "%" : "",
      roi.avgCPA ? (ar ? "\u062a\u0643\u0644\u0641\u0629 CPA " : "CPA ") + num(roi.avgCPA, 2) : ""
    ].filter(Boolean);
    return {
      message: ar
        ? "\u0628\u062d\u0645\u0651\u0644 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0643\u0627\u0645\u0644\u0629. " + (facts.length ? "\u0645\u0646 \u0627\u0644\u0644\u064a \u0638\u0627\u0647\u0631 \u062f\u0644\u0648\u0642\u062a\u064a: " + facts.join("\u060c ") + "." : "\u0647\u062c\u0627\u0648\u0628\u0643 \u0645\u0646 \u0623\u0642\u0631\u0628 \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u062a\u0627\u062d\u0629.")
        : "I'm loading the full picture. " + (facts.length ? "From what I can see now: " + facts.join(", ") + "." : "I'll answer from the closest available facts."),
      partial: true,
      enhanceWithGemini: false,
      actions: []
    };
  }

  function subscribeToLifecycle() {
    if (filterSubscriptionReady) return;
    filterSubscriptionReady = true;
    if (window.DashboardFilterBus && typeof window.DashboardFilterBus.subscribe === "function") {
      if (window._dashboardAiMirrorFilterListener) {
        window.DashboardFilterBus.unsubscribe(window._dashboardAiMirrorFilterListener);
      }
      window._dashboardAiMirrorFilterListener = function () {
        if (window.dashboardGeoData) warm(window.dashboardGeoData, { force: true }).catch(function () {});
      };
      window.DashboardFilterBus.subscribe(window._dashboardAiMirrorFilterListener);
    }
  }

  window.DashboardAiMirror = {
    build: buildMirror,
    ensure: ensureMirror,
    warm: warm,
    partialAnswer: partialAnswer,
    answer: answer,
    answerWarm: answerWarm,
    selectSlice: selectSlice,
    diagnostics: diagnostics,
    hydrate: hydrate,
    compact: compactMirror,
    key: buildMirrorKey,
    subscribeToLifecycle: subscribeToLifecycle
  };
  subscribeToLifecycle();
})();
