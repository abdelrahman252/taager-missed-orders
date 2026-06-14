(function () {
  "use strict";

  var PAGE_MAP = [
    { id: "ai-intelligence", label: "Taager AI Intelligence", path: "/ai-intelligence" },
    { id: "master", label: "Master dashboard", path: "/dashboard/master" },
    { id: "overview", label: "KPI overview", path: "/dashboard/overview" },
    { id: "pipeline", label: "Pipeline", path: "/dashboard/pipeline" },
    { id: "orders", label: "Orders", path: "/dashboard/orders" },
    { id: "cod", label: "COD analytics", path: "/dashboard/cod" },
    { id: "products", label: "Product analytics", path: "/dashboard/products" },
    { id: "cities", label: "City analytics", path: "/dashboard/cities" },
    { id: "commission", label: "Commission trend", path: "/dashboard/commission" },
    { id: "marketing", label: "Marketing connections", path: "/dashboard/marketing" },
    { id: "campaigns", label: "Campaign intelligence", path: "/dashboard/campaigns" },
    { id: "calculator", label: "ROI calculator", path: "/dashboard/calculator" },
    { id: "productForecast", label: "Product forecast", path: "/dashboard/product-forecast" },
    { id: "prepaid", label: "Prepaid intelligence", path: "/dashboard/prepaid" },
  ];
  var contextCache = [];
  var CONTEXT_CACHE_LIMIT = 8;

  function num(value, digits) {
    var n = Number(value || 0);
    return Number(n.toFixed(digits == null ? 2 : digits));
  }

  function pct(value) {
    var n = Number(value || 0);
    if (n > 1) return num(n, 1);
    return num(n * 100, 1);
  }

  function tr(key, params, fallback) {
    var value = window.dashboardI18n && typeof window.dashboardI18n.t === "function"
      ? window.dashboardI18n.t(key, params)
      : key;
    return value && value !== key ? value : (fallback || key);
  }

  function activeSection() {
    var shell = document.getElementById("db-shell-mount");
    return shell && shell._dashboardActiveSection ? shell._dashboardActiveSection : "master";
  }

  function currentLanguage() {
    if (window.dashboardI18n && typeof window.dashboardI18n.locale === "function") return window.dashboardI18n.locale();
    return document.documentElement.getAttribute("lang") || window._kbotLang || "en";
  }

  function currentFilterState() {
    return window.DashboardFilterBus && typeof window.DashboardFilterBus.getState === "function"
      ? window.DashboardFilterBus.getState()
      : {};
  }

  function marketingFreshnessKey(accountId) {
    var marketing = window.DashboardMarketingState && typeof window.DashboardMarketingState.get === "function"
      ? window.DashboardMarketingState.get(accountId)
      : null;
    if (!marketing) return "";
    return [
      marketing.status || "",
      marketing.lastSyncAt || "",
      marketing.manualOverride ? 1 : 0,
      marketing.summary && marketing.summary.adSpend || 0,
      marketing.summary && marketing.summary.campaignCount || 0,
      marketing.summary && marketing.summary.rowCount || 0
    ].join(":");
  }

  function campaignFreshnessKey(data) {
    var campaign = data && (data.campaignIntelligence || data.mediaBuying) || {};
    return [
      campaign.updatedAt || campaign.lastUpdatedAt || campaign.lastSyncAt || "",
      campaign.version || "",
      campaign.sourceOfTruth || ""
    ].join(":");
  }

  function contextCacheKey(opts, data, section) {
    data = data || {};
    opts = opts || {};
    var meta = data.meta || {};
    var accountId = meta.activeAccountId || "__all__";
    var filters = currentFilterState();
    return JSON.stringify({
      version: data._version != null ? data._version : "",
      accountId: accountId,
      language: currentLanguage(),
      section: section,
      selectedProduct: opts.productId || filters.selectedProduct || "",
      selectedCity: opts.city || filters.selectedCity || "",
      selectedProvince: filters.selectedProvince || "",
      productLimit: Number(opts.productLimit || 80),
      cityLimit: Number(opts.cityLimit || 80),
      forecastLimit: Number(opts.forecastLimit || 40),
      marketing: marketingFreshnessKey(accountId),
      campaign: campaignFreshnessKey(data)
    });
  }

  function getCachedContext(key) {
    for (var i = 0; i < contextCache.length; i += 1) {
      if (contextCache[i].key === key) {
        var entry = contextCache.splice(i, 1)[0];
        contextCache.push(entry);
        return entry.value;
      }
    }
    return null;
  }

  function setCachedContext(key, value) {
    contextCache.push({ key: key, value: value });
    while (contextCache.length > CONTEXT_CACHE_LIMIT) contextCache.shift();
  }

  window.invalidateDashboardAiContextCache = function () {
    contextCache = [];
  };

  function currentRoiSettings(data) {
    var meta = data && data.meta ? data.meta : {};
    var fallback = data && data.roi ? data.roi : {};
    var accountId = meta.activeAccountId || "__all__";
    var settings = window.DashboardRoiState && typeof window.DashboardRoiState.get === "function"
      ? window.DashboardRoiState.get(accountId, fallback)
      : {
        adSpend: Number(fallback.adSpend || 0),
        currency: String(fallback.currency || "SAR").toUpperCase(),
        egpRate: Number(fallback.egpRate || 52) || 52,
      };
    var marketing = window.DashboardMarketingState && typeof window.DashboardMarketingState.get === "function"
      ? window.DashboardMarketingState.get(accountId)
      : null;
    if (marketing && marketing.status === "connected" && marketing.summary && !marketing.manualOverride && Number(marketing.summary.adSpend) > 0) {
      return Object.assign({}, settings, {
        adSpend: Number(marketing.summary.adSpend || 0),
        currency: String(marketing.summary.currency || settings.currency || "SAR").toUpperCase(),
        source: "syncedMarketing",
        marketing: {
          platform: marketing.platform || "combined",
          platforms: marketing.summary.platformBreakdown || [],
          status: marketing.status,
          lastSyncAt: marketing.lastSyncAt || marketing.summary.lastSyncAt || "",
          campaignCount: Number(marketing.summary.campaignCount || 0),
          rowCount: Number(marketing.summary.rowCount || 0)
        }
      });
    }
    return settings;
  }

  function convertCommissionFromSar(value, settings) {
    var sar = Number(value || 0);
    var currency = String(settings && settings.currency || "SAR").toUpperCase();
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === "function") {
      return window.TaagerCurrency.convert(sar, window.dashboardActiveCurrency || "SAR", currency);
    }
    if (currency === "USD") return sar / 3.75;
    if (currency === "EGP") return (sar / 3.75) * (Number(settings && settings.egpRate) || 52);
    return sar;
  }

  function breakEvenCpaSar(avgCommissionSar, ndrPct) {
    return Number(avgCommissionSar || 0) * (Number(ndrPct || 0) / 100);
  }

  function accountBreakEvenContext(data, settings) {
    var roi = data && data.roi ? data.roi : {};
    var avgCommissionSar = Number(roi.avgCommission || 0);
    var ndrPct = Number(roi.ndrPct || 0);
    var breakEvenSar = breakEvenCpaSar(avgCommissionSar, ndrPct);
    var breakEvenInCurrency = convertCommissionFromSar(breakEvenSar, settings || roi);
    var netOrders = window.DashboardOrderMetrics
      ? window.DashboardOrderMetrics.netOrders(roi)
      : Number(roi.netOrderCount != null ? roi.netOrderCount : roi.totalOrders || 0);
    var cpa = Number(settings && settings.adSpend || roi.adSpend || 0) > 0 && netOrders > 0
      ? Number(settings && settings.adSpend || roi.adSpend || 0) / netOrders
      : Number(roi.avgCPA || 0);
    return {
      formula: "breakEvenCpa = avgCommissionPerDeliveredOrder * NDR",
      meaning: "Maximum CPA before this account scope starts losing money. If actual CPA is above this by even a small amount, the campaign is losing.",
      accountScope: data && data.meta && data.meta.activeAccountId && data.meta.activeAccountId !== "__all__" ? "single_account" : "all_accounts",
      avgCommissionSar: num(avgCommissionSar, 2),
      ndrPct: num(ndrPct, 1),
      breakEvenCpaSar: num(breakEvenSar, 2),
      breakEvenCpa: num(breakEvenInCurrency, 2),
      actualCpa: num(cpa, 2),
      currency: String(settings && settings.currency || roi.currency || "SAR").toUpperCase(),
      isActualCpaAboveBreakEven: cpa > 0 && breakEvenInCurrency > 0 ? cpa > breakEvenInCurrency : null
    };
  }

  function compactProduct(p, financials) {
    financials = financials || {};
    var placed = window.DashboardOrderMetrics
      ? window.DashboardOrderMetrics.netOrders(p)
      : Number(p.netOrderCount || p.placedCount || 0);
    var allocatedSpend = Number(financials.totalPlaced || 0) > 0
      ? Number(financials.adSpend || 0) * placed / Number(financials.totalPlaced || 1)
      : 0;
    var cpa = placed > 0 ? allocatedSpend / placed : 0;
    var commissionInCurrency = convertCommissionFromSar(p.commission || 0, financials);
    var profitLoss = commissionInCurrency - allocatedSpend;
    var delivered = Number(p.deliveredCount || p.units || 0);
    var ndrPct = num(p.ndrPct || p.deliveryRate || 0, 1);
    var avgCommissionSar = delivered > 0 ? Number(p.commission || 0) / delivered : 0;
    var breakEvenSar = breakEvenCpaSar(avgCommissionSar, ndrPct);
    var breakEvenInCurrency = convertCommissionFromSar(breakEvenSar, financials);
    return {
      id: String(p.key || p.sku || p.name || ""),
      name: p.name || p.key || "Unknown product",
      sku: p.sku || "",
      orders: placed,
      delivered: delivered,
      ndrPct: ndrPct,
      drPct: num(p.drRate || p.deliveryPct || 0, 1),
      cancelPct: num(p.cancelPct || 0, 1),
      commission: num(p.commission || 0, 2),
      avgCommissionSar: num(avgCommissionSar, 2),
      allocatedAdSpend: num(allocatedSpend, 2),
      cpa: num(cpa, 2),
      breakEvenCpa: num(breakEvenInCurrency, 2),
      breakEvenCpaSar: num(breakEvenSar, 2),
      cpaStatus: cpa > 0 && breakEvenInCurrency > 0 ? (cpa > breakEvenInCurrency ? "above_break_even_losing" : "below_break_even_safe") : "unknown",
      profitLoss: num(profitLoss, 2),
      financialCurrency: String(financials.currency || "SAR").toUpperCase(),
      accountBreakdown: (p.accountBreakdown || []).slice(0, 20).map(function (account) {
        return {
          accountId: account.accountId || "",
          accountLabel: account.accountLabel || account.accountId || "",
          orders: Number(account.orders || 0),
          delivered: Number(account.delivered || 0),
          ndrPct: num(account.ndrPct || 0, 1),
          commission: num(account.commission || 0, 2),
          deliveredSales: num(account.deliveredSales || 0, 2)
        };
      }),
      topCities: (p.cityBreakdown || []).slice(0, 4).map(function (c) {
        return { city: c.name, orders: Number(c.count || c.orders || 0), ndrPct: num(c.ndr || 0, 1) };
      }),
    };
  }

  function compactCity(name, city, geo) {
    var province = city.provinceId || "other";
    var provinceMap = geo && geo.provinceMap ? geo.provinceMap : {};
    return {
      city: name,
      province: province,
      provinceName: provinceMap[province] ? provinceMap[province].name : province,
      orders: Number(city.count || 0),
      activeOrders: Number((city.shippingCount || 0) + (city.confirmedCount || 0) + (city.processingCount || 0)),
      delivered: Number(city.deliveredOrders || 0),
      ndrPct: typeof city.ndrPct === "number"
        ? num(city.ndrPct, 1)
        : pct(city.count ? (city.deliveredOrders || 0) / city.count : 0),
      drPct: typeof city.drPct === "number"
        ? num(city.drPct, 1)
        : pct(city.drBaseOrders ? (city.deliveredOrders || 0) / city.drBaseOrders : 0),
      codPct: pct(city.count ? (city.codCount || 0) / city.count : 0),
      prepaidPct: pct(city.count ? (city.prepaidCount || 0) / city.count : 0),
      earnedProfitAfterTax: num(
        city.earnedProfitAfterTax != null ? city.earnedProfitAfterTax : city.earnedCommission || 0,
        2
      ),
      earnedCommission: num(
        city.earnedProfitAfterTax != null ? city.earnedProfitAfterTax : city.earnedCommission || 0,
        2
      ),
      riskScore: Number(city.riskScore || 0),
      scalingScore: Number(city.scalingScore || 0),
      accountBreakdown: (city.accountBreakdown || []).slice(0, 20).map(function (account) {
        return {
          accountId: account.accountId || "",
          accountLabel: account.accountLabel || account.accountId || "",
          orders: Number(account.orders || 0),
          delivered: Number(account.delivered || 0),
          ndrPct: num(account.ndrPct || 0, 1),
          earnedProfitAfterTax: num(
            account.earnedProfitAfterTax != null ? account.earnedProfitAfterTax : account.commission || 0,
            2
          ),
          commission: num(
            account.earnedProfitAfterTax != null ? account.earnedProfitAfterTax : account.commission || 0,
            2
          ),
          deliveredSales: num(account.deliveredSales || 0, 2)
        };
      })
    };
  }

  function productForecasts(products, roi) {
    var adSpend = Number(roi && roi.adSpend || 0);
    return (products || []).map(function (p) {
      var orders = window.DashboardOrderMetrics
        ? window.DashboardOrderMetrics.netOrders(p)
        : Number(p.netOrderCount || p.placedCount || 0);
      var delivered = Number(p.deliveredCount || 0);
      var avgCommission = delivered > 0 ? Number(p.commission || 0) / delivered : Number(roi && roi.avgCommission || 0);
      var ndr = orders > 0 ? delivered / orders : 0;
      var expectedRevenue = delivered * avgCommission;
      var breakEvenCpa = avgCommission * ndr;
      return {
        productId: String(p.key || p.sku || p.name || ""),
        name: p.name || p.key || "Unknown product",
        orders: orders,
        currentNdrPct: pct(ndr),
        avgCommission: num(avgCommission, 2),
        expectedRevenue: num(expectedRevenue, 2),
        breakEvenCpaSar: num(breakEvenCpa, 2),
        breakEvenFormula: "avgCommission * NDR",
        cpaBaseline: orders > 0 && adSpend > 0 ? num(adSpend / orders, 2) : 0,
      };
    });
  }

  function datasetSummary(data, products, cities) {
    data = data || {};
    var meta = data.meta || {};
    var orders = Array.isArray(data.orders) ? data.orders : [];
    var certifiedTotalOrders = data.overview && data.overview.totalOrders
      ? Number(data.overview.totalOrders.value || 0)
      : orders.length;
    var accountOptions = Array.isArray(meta.accountOptions) ? meta.accountOptions : [];
    var realAccounts = accountOptions.filter(function (acc) {
      return acc && acc.id && acc.id !== "__all__";
    });
    return {
      activeAccountId: meta.activeAccountId || "",
      activeAccountLabel: meta.activeAccountLabel || "",
      periodLabel: meta.periodLabel || meta.monthLabel || "",
      period: meta.period || null,
      hasData: !!meta.hasData,
      totalOrders: certifiedTotalOrders,
      accountCount: realAccounts.length,
      productCount: products.length,
      cityCount: cities.length,
      lastUpdatedAt: meta.lastUpdatedAt || "",
      lastUpdatedLabel: meta.lastUpdatedLabel || "",
      accountOptions: accountOptions.slice(0, 40).map(function (acc) {
        return {
          id: acc.id,
          label: acc.memberName || acc.easyEmail || acc.email || acc.khodEmail || acc.label || acc.name || "",
          orderCount: Number(acc.orderCount || 0),
          rawOrderCount: Number(acc.rawOrderCount || 0),
          hasSnapshot: !!acc.hasSnapshot
        };
      })
    };
  }

  function campaignIntelligenceContext(data, selectedProduct) {
    var campaignIntelligence = window.TaagerCampaignIntelligence || window.KhodCampaignIntelligence;
    if (!campaignIntelligence || typeof campaignIntelligence.build !== "function") {
      return null;
    }
    var productName = selectedProduct && typeof selectedProduct === "object"
      ? (selectedProduct.name || selectedProduct.sku || selectedProduct.key)
      : selectedProduct;
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

  function visibleMetrics(data, section) {
    data = data || {};
    if (section === "calculator") {
      var settings = currentRoiSettings(data);
      return Object.assign({}, data.roi || {}, {
        breakEven: accountBreakEvenContext(data, settings)
      });
    }
    if (section === "pipeline") return data.pipeline ? data.pipeline.metrics : {};
    if (section === "cod") return data.cod || {};
    if (section === "commission") return data.commissionTrend || {};
    if (section === "products") return data.products ? data.products.summary : {};
    if (section === "cities") return data.geo ? data.geo.kpis : {};
    return data.overview || {};
  }

  function orderStatusSummary(orders) {
    var list = Array.isArray(orders) ? orders : [];
    var byStatus = {};
    list.forEach(function (order) {
      var status = String(order && (order.status || order.orderStatus || order.state) || "unknown").trim() || "unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    return {
      totalRows: list.length,
      topStatuses: Object.keys(byStatus).map(function (status) {
        return { status: status, count: byStatus[status] };
      }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8)
    };
  }

  function buildSectionSignals(data, context, rawProductForecasts) {
    data = data || {};
    context = context || {};
    var geo = data.geo || {};
    var prepaid = geo.prepaidIntelligence || data.prepaidIntelligence || data.prepaid || null;
    var marketing = context.productFinancials && context.productFinancials.accountAdSpend > 0
      ? {
        source: context.productFinancials.source || "roi_or_synced_marketing",
        accountAdSpend: context.productFinancials.accountAdSpend,
        currency: context.productFinancials.currency,
        platforms: context.productFinancials.marketing && context.productFinancials.marketing.platforms || []
      }
      : null;
    return {
      master: {
        overview: data.overview || {},
        localSummary: context.localSummary || null
      },
      overview: data.overview || {},
      pipeline: data.pipeline ? data.pipeline.metrics || data.pipeline : {},
      orders: orderStatusSummary(data.orders),
      cod: data.cod || {},
      products: {
        summary: data.products && data.products.summary || {},
        topProducts: (context.products || []).slice(0, 12)
      },
      cities: {
        kpis: geo.kpis || {},
        topCities: (context.cities || []).slice(0, 12)
      },
      commission: data.commissionTrend || {},
      marketing: marketing,
      campaigns: context.mediaBuying || null,
      calculator: {
        roi: data.roi || {},
        breakEven: context.productFinancials && context.productFinancials.accountBreakEven || null
      },
      productForecast: {
        roi: data.roi || {},
        productForecasts: (rawProductForecasts || []).slice(0, 12)
      },
      prepaid: prepaid ? {
        globalPrepaidPct: prepaid.globalPrepaidPct,
        prepaidNdr: prepaid.prepaidNdr,
        codNdr: prepaid.codNdr,
        prepaidNdrAdvantage: prepaid.prepaidNdrAdvantage,
        codHeavyCities: (prepaid.codHeavyCities || []).slice(0, 8),
        forcePrepaidRecs: (prepaid.forcePrepaidRecs || []).slice(0, 8)
      } : null
    };
  }

  function localExecutiveSummary(context) {
    var products = context.products || [];
    var cities = context.cities || [];
    var roi = context.kpis && context.kpis.roi ? context.kpis.roi : {};
    var worstProduct = products.slice().sort(function (a, b) { return a.ndrPct - b.ndrPct; })[0];
    var bestProduct = products.slice().sort(function (a, b) { return b.commission - a.commission; })[0];
    var bestCity = cities.slice().sort(function (a, b) { return b.earnedCommission - a.earnedCommission; })[0];
    var riskyCity = cities.slice().sort(function (a, b) { return b.riskScore - a.riskScore; })[0];

    return {
      message: worstProduct
        ? tr("ai.summary.bestLeverProduct", { product: worstProduct.name }, "Best lever: raise NDR on " + worstProduct.name + ".")
        : tr("ai.summary.ready", null, "Dashboard is ready for AI review."),
      insights: [
        roi.avgCPA ? tr("ai.summary.cpa", { value: roi.avgCPA }, "Current CPA baseline: " + roi.avgCPA + " " + (roi.currency || window.dashboardActiveCurrency || "SAR") + ".") : "",
        bestProduct ? tr("ai.summary.topProduct", { product: bestProduct.name }, "Top commission product: " + bestProduct.name + ".") : "",
        bestCity ? tr("ai.summary.strongestCity", { city: bestCity.city }, "Strongest city: " + bestCity.city + ".") : "",
        riskyCity && riskyCity.riskScore ? tr("ai.summary.riskyCity", { city: riskyCity.city }, "Highest city risk: " + riskyCity.city + ".") : "",
      ].filter(Boolean).slice(0, 4),
      actions: [],
    };
  }

  window.buildDashboardAiContext = function (opts) {
    opts = opts || {};
    var data = opts.data || window.dashboardGeoData || {};
    var section = opts.section || activeSection();
    var perfTimer = window.TaagerPerf && typeof window.TaagerPerf.start === "function"
      ? window.TaagerPerf.start("ai:context:build", {
        section: section,
        dataVersion: data && data._version != null ? data._version : ""
      })
      : null;
    var geo = data.geo || {};
    var roiSettings = currentRoiSettings(data);
    var sourceProducts = data.products && data.products.rankedList ? data.products.rankedList : [];
    var productFinancials = Object.assign({}, roiSettings, {
      totalPlaced: sourceProducts.reduce(function (sum, p) {
        return sum + (window.DashboardOrderMetrics
          ? window.DashboardOrderMetrics.netOrders(p)
          : Number(p.netOrderCount || p.placedCount || 0));
      }, 0),
    });
    var products = sourceProducts.map(function (p) { return compactProduct(p, productFinancials); });
    var rawProductForecasts = productForecasts(data.products && data.products.rankedList, data.roi);
    var cityStats = geo.cityStats || {};
    var cities = Object.keys(cityStats).map(function (name) {
      return compactCity(name, cityStats[name], geo);
    });
    var productLimit = Number(opts.productLimit || 80);
    var cityLimit = Number(opts.cityLimit || 80);
    var forecastLimit = Number(opts.forecastLimit || 40);

    var selectedProduct = opts.productId || (window.DashboardFilterBus && window.DashboardFilterBus.getState ? window.DashboardFilterBus.getState().selectedProduct : null);
    var selectedCity = opts.city || (window.DashboardFilterBus && window.DashboardFilterBus.getState ? window.DashboardFilterBus.getState().selectedCity : null);

    var context = {
      currentPage: section,
      pages: PAGE_MAP,
      dataset: datasetSummary(data, products, cities),
      account: data.meta || {},
      deliveredAttributionMode: data.meta && data.meta.deliveredDateMode === "createdAt" ? "Created At" : "Last Updated",
      productFinancials: {
        allocationRule: "Account ad spend allocated by product placed order share.",
        accountAdSpend: Number(productFinancials.adSpend || 0),
        currency: String(productFinancials.currency || "SAR").toUpperCase(),
        egpRate: Number(productFinancials.egpRate || 52),
        source: productFinancials.source || "manual_or_roi",
        marketing: productFinancials.marketing || null,
        accountBreakEven: accountBreakEvenContext(data, productFinancials),
      },
      filters: window.DashboardFilterBus && window.DashboardFilterBus.getState ? window.DashboardFilterBus.getState() : {},
      selectedProduct: selectedProduct,
      selectedCity: selectedCity,
      kpis: {
        overview: data.overview || {},
        pipeline: data.pipeline ? data.pipeline.metrics : {},
        roi: data.roi || {},
        national: geo.kpis || {},
      },
      visibleMetrics: visibleMetrics(data, section),
      products: products.slice(0, productLimit),
      cities: cities
        .slice()
        .sort(function (a, b) { return b.earnedCommission - a.earnedCommission; })
        .slice(0, cityLimit),
      forecasts: {
        roi: data.roi || {},
        productForecasts: rawProductForecasts.slice(0, forecastLimit),
      },
      insights: (geo.insights || []).slice(0, 8).map(function (item) {
        return {
          type: item.type,
          priority: item.priority,
          city: item.city,
          product: item.product,
          title: item.title,
          recommendation: item.recommendation,
          metric: item.metric,
        };
      }),
    };

    context.mediaBuying = campaignIntelligenceContext(data, selectedProduct);
    context.sectionSignals = buildSectionSignals(data, context, rawProductForecasts);
    context.localSummary = localExecutiveSummary(context);
    if (context.sectionSignals && context.sectionSignals.master) context.sectionSignals.master.localSummary = context.localSummary;
    if (window.TaagerPerf && typeof window.TaagerPerf.end === "function" && perfTimer) {
      window.TaagerPerf.end(perfTimer, {
        products: products.length,
        cities: cities.length,
        forecasts: rawProductForecasts.length
      });
    }
    return context;
  };

  window.getDashboardAiPages = function () {
    return PAGE_MAP.slice();
  };

  window.getDashboardAiContext = function (opts) {
    var perfTimer = window.TaagerPerf && typeof window.TaagerPerf.start === "function"
      ? window.TaagerPerf.start("ai:context:get", {
        section: opts && opts.section || activeSection()
      })
      : null;
    if (typeof window.buildDashboardAiContext !== "function") {
      if (window.TaagerPerf && typeof window.TaagerPerf.end === "function" && perfTimer) {
        window.TaagerPerf.end(perfTimer, { fallback: true });
      }
      return {
        currentPage: activeSection(),
        pages: PAGE_MAP.slice(),
        account: {},
        filters: {},
        selectedProduct: null,
        selectedCity: null,
        kpis: {},
        visibleMetrics: {},
        products: [],
        cities: [],
        forecasts: {},
        insights: [],
        localSummary: {
          message: tr("aii.summary.ready", null, "AI is ready for review."),
          insights: [],
          actions: [],
        },
      };
    }
    opts = opts || {};
    var data = opts.data || window.dashboardGeoData || {};
    var section = opts.section || activeSection();
    var cacheKey = contextCacheKey(opts, data, section);
    var cached = getCachedContext(cacheKey);
    if (cached) {
      if (window.TaagerPerf && typeof window.TaagerPerf.end === "function" && perfTimer) {
        window.TaagerPerf.end(perfTimer, { fallback: false, cacheHit: true });
      }
      return cached;
    }
    var context = window.buildDashboardAiContext(Object.assign({}, opts, {
      data: data,
      section: section
    }));
    setCachedContext(cacheKey, context);
    if (window.TaagerPerf && typeof window.TaagerPerf.end === "function" && perfTimer) {
      window.TaagerPerf.end(perfTimer, { fallback: false, cacheHit: false });
    }
    return context;
  };

  window.renderProductAiAdvisor = function (product) {
    if (!product) return "";
    var ndr = Number(product.ndrPct || product.deliveryPct || 0);
    var cancel = Number(product.cancelPct || 0);
    var commission = Number(product.commission || 0);
    var tone = ndr < 20 || cancel >= 40 ? "danger" : (ndr >= 40 ? "profit" : "city");
    var message = ndr < 20
      ? tr("ai.productAdvisor.unsafeNdr", null, "Unsafe scaling: NDR is below the safe zone.")
      : (cancel >= 40
        ? tr("ai.productAdvisor.cancelRisk", null, "Cancellation risk is too high for aggressive spend.")
        : (ndr >= 40 ? tr("ai.productAdvisor.safeScale", null, "Safe to test controlled scaling.") : tr("ai.productAdvisor.liftNdr", null, "Best lever: lift NDR before scaling.")));
    var locale = window.dashboardI18n && typeof window.dashboardI18n.locale === "function"
      ? window.dashboardI18n.locale()
      : "en-US";
    var commissionText = Math.round(commission).toLocaleString(locale);
    var sub = commission > 0 ? tr("ai.productAdvisor.commission", { value: commissionText }, "Taager profit: " + commissionText + " " + (window.dashboardActiveCurrency || "SAR")) : tr("ai.productAdvisor.needsCommission", null, "Needs live Taager profit signal");
    return '<div class="ai-inline-advisor ' + tone + '">' +
      '<span>' + tr("ai.productAdvisor.title", null, "AI product advisor") + '</span>' +
      '<strong>' + message + '</strong>' +
      '<em>' + sub + '</em>' +
    '</div>';
  };

  window.renderCityAiAdvisor = function (city) {
    if (!city) return "";
    var ndr = Number(city.deliveryRate || city.ndrPct || 0);
    var active = Number(city.activeOrders || 0);
    var tone = ndr < 20 ? "danger" : (ndr >= 40 ? "profit" : "city");
    var message = ndr < 20
      ? city.name + " has weak delivery quality."
      : (ndr >= 40 ? city.name + " is a strong scale candidate." : city.name + " needs tighter delivery control.");
    return '<div class="ai-inline-advisor ' + tone + '">' +
      '<span>AI city advisor</span>' +
      '<strong>' + message + '</strong>' +
      '<em>Active orders: ' + Math.round(active).toLocaleString("en-US") + '</em>' +
    '</div>';
  };
})();
