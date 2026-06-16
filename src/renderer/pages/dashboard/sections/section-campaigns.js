(function () {
  "use strict";

  /*
   * CAMPAIGNS SECTION ROADMAP / READ BEFORE EDITING
   *
   * The next campaigns refactor must keep two money layers separate:
   * 1. Source-native campaign rows: raw ad-platform values exactly as TikTok,
   *    Snapchat, or Facebook reports them. Row spend, CPC, CPM, and platform
   *    totals should show the ad account currency and must not be silently
   *    converted in-place.
   * 2. Reporting/product totals: objective rollups, product attribution totals,
   *    CPA comparisons, and profitability views may use the selected reporting
   *    or calculator currency, but labels must say that clearly.
   *
   * Never sum mixed raw currencies into one "native" total. If sources are
   * mixed, show the converted reporting total first and show raw currency chips
   * or per-source rows beneath it. Attribution should also distinguish exact
   * SKU matches from guessed/name matches and "needs review" matches so product
   * spend is not treated as verified when it is only inferred.
   */

  var PLATFORMS = [
    { id: "all", label: "All" },
    { id: "tiktok", label: "TikTok" },
    { id: "snapchat", label: "Snapchat" },
    { id: "facebook", label: "Facebook" }
  ];
  var PAGE_SIZES = [10, 25, 50];
  var campaignAiRequestSeq = 0;
  var campaignIntelCache = new Map();
  var campaignDecisionTipSeq = 0;
  var campaignProductNameSource = null;
  var campaignCurrentProductNames = {};

  function campaignIntelCacheKey(data, accountId, platform, syncStamp, reportingCurrency, egpRate) {
    var expectedMode = window.isExpectedNdrMode && window.isExpectedNdrMode() ? "expected" : "actual";
    return [
      accountId || "__all__",
      platform || "all",
      syncStamp || "",
      reportingCurrency || "SAR",
      egpRate || "",
      expectedMode
    ].join("|");
  }

  function rememberCampaignIntel(key, intel) {
    campaignIntelCache.set(key, intel);
    if (campaignIntelCache.size > 12) {
      campaignIntelCache.delete(campaignIntelCache.keys().next().value);
    }
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function campaignProductName(sku, fallback) {
    var key = String(sku || "").trim();
    var source = window.dashboardGeoData && window.dashboardGeoData.products || null;
    if (source !== campaignProductNameSource) {
      campaignProductNameSource = source;
      campaignCurrentProductNames = {};
      var currentProducts = source && Array.isArray(source.rankedList) ? source.rankedList : [];
      currentProducts.forEach(function (product) {
        var productSku = String(product && product.sku || "").trim().toLowerCase();
        if (productSku) campaignCurrentProductNames[productSku] = String(product.name || "").trim();
      });
    }
    var saved = window.TaagerProductNames && key && typeof window.TaagerProductNames.get === "function"
      ? window.TaagerProductNames.get(key)
      : "";
    var current = key ? campaignCurrentProductNames[key.toLowerCase()] : "";
    return String(saved || current || fallback || key || "Unknown product").trim();
  }

  function fmt(value) {
    return Math.round(Number(value || 0)).toLocaleString("en-US");
  }

  function fmtDecimal(value, digits) {
    var n = Number(value || 0);
    if (!Number.isFinite(n)) n = 0;
    return n.toLocaleString("en-US", { maximumFractionDigits: digits == null ? 2 : digits });
  }

  function money(value, currency) {
    if (window.formatDashboardMoney) {
      return window.formatDashboardMoney(value, currency || window.dashboardActiveCurrency || "SAR", 2);
    }
    return fmtDecimal(value, 2) + " " + String(currency || window.dashboardActiveCurrency || "SAR").toUpperCase();
  }

  function moneyInCurrency(value, currency) {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.format === "function") {
      return window.TaagerCurrency.format(value, currency || "USD", { decimals: 2, style: "code" });
    }
    return fmtDecimal(value, 2) + " " + String(currency || "USD").toUpperCase();
  }

  function percent(value) {
    return fmtDecimal(value, 2) + "%";
  }

  function formatSyncTime(value) {
    if (!value) return "Not synced yet";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "Not synced yet";
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function roas(value) {
    return fmtDecimal(value, 2) + "x";
  }

  function signedMoney(value, currency) {
    var n = Number(value || 0);
    return (n > 0 ? "+" : "") + money(n, currency);
  }

  function campaignPick(en, ar) {
    return window.dashboardI18n && window.dashboardI18n.currentLocale === "ar" ? ar : en;
  }

  function financialState(value, available) {
    if (available === false || value == null || !Number.isFinite(Number(value))) return "neutral";
    var n = Number(value);
    if (n > 0) return "positive";
    if (n < 0) return "negative";
    return "zero";
  }

  function supportedCampaignCurrencies() {
    if (window.DashboardRoiState && Array.isArray(window.DashboardRoiState.currencies)) {
      return window.DashboardRoiState.currencies.slice();
    }
    if (window.TaagerCurrency && Array.isArray(window.TaagerCurrency.supported)) {
      return window.TaagerCurrency.supported.slice();
    }
    return ["SAR", "USD", "EGP", "AED", "IQD", "OMR"];
  }

  function normalizeCampaignCurrency(currency, fallback) {
    var next = String(currency || fallback || window.dashboardActiveCurrency || "SAR").toUpperCase();
    if (window.TaagerCurrency && typeof window.TaagerCurrency.cleanCurrency === "function") {
      next = window.TaagerCurrency.cleanCurrency(next, fallback || window.dashboardActiveCurrency || "SAR");
    }
    return supportedCampaignCurrencies().indexOf(next) !== -1 ? next : String(fallback || window.dashboardActiveCurrency || "SAR").toUpperCase();
  }

  function campaignAccountId(data) {
    return data && data.meta && data.meta.activeAccountId || (window.getActiveAccountId ? window.getActiveAccountId() : "__all__");
  }

  function campaignRoiSettings(accountId, data) {
    var fallback = Object.assign({ currency: data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || "SAR" }, data && data.roi || {});
    return window.DashboardRoiState && typeof window.DashboardRoiState.get === "function"
      ? window.DashboardRoiState.get(accountId, fallback)
      : fallback;
  }

  function currentCampaignCurrency(accountId, data) {
    var settings = campaignRoiSettings(accountId, data);
    return normalizeCampaignCurrency(settings.currency, data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || "SAR");
  }

  function setCampaignProductCurrency(mount, data, ctx, currency) {
    var accountId = campaignAccountId(data);
    var current = currentCampaignCurrency(accountId, data);
    var next = normalizeCampaignCurrency(currency, current);
    if (next === current) return;
    mount._cachedIntel = null;
    mount._campaignCurrencyChanging = true;
    if (window.DashboardRoiState && typeof window.DashboardRoiState.set === "function") {
      window.DashboardRoiState.set({ currency: next }, accountId, data && data.roi || {});
      setTimeout(function () { if (mount) mount._campaignCurrencyChanging = false; }, 0);
      return;
    }
    if (data) data.roi = Object.assign({}, data.roi || {}, { currency: next });
    mount._campaignCurrencyChanging = false;
    refreshCampaignCurrencyUIOnly(mount, data, ctx);
  }

  function bindCampaignCurrencySelect(mount, data, ctx) {
    var wrap = mount.querySelector("[data-campaign-product-currency]");
    if (!wrap) return;
    var accountId = campaignAccountId(data);
    var current = currentCampaignCurrency(accountId, data);
    var options = supportedCampaignCurrencies().map(function (currency) {
      return { value: currency, label: currency };
    });
    if (window.renderCustomSelect) {
      window.renderCustomSelect(wrap, options, current, function (value) {
        setCampaignProductCurrency(mount, data, ctx, value);
      }, { maxHeight: "220px", ariaLabel: "Product Actions shared calculator currency" });
      return;
    }
    wrap.innerHTML = '<select class="campaign-currency-native" style="width:100%;height:32px;border-radius:9px;border:1px solid rgba(255,255,255,0.12);background:#0b1120;color:#fff;font-size:12px;font-weight:800;font-family:inherit;padding:0 8px">' +
      options.map(function (opt) {
        return '<option value="' + esc(opt.value) + '"' + (opt.value === current ? " selected" : "") + '>' + esc(opt.label) + '</option>';
      }).join("") +
      '</select>';
  }

  function icon(name) {
    var rendered = window.icon ? window.icon(name, { size: 15 }) : "";
    if (rendered) return rendered;
    var s = 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    var fallbacks = {
      search: '<circle cx="11" cy="11" r="7" ' + s + ' fill="none"/><path d="m20 20-3.5-3.5" ' + s + '/>',
      sparkles: '<path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z" ' + s + ' fill="none"/>',
      wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v12H5.5A2.5 2.5 0 0 1 3 16.5v-9Z" ' + s + ' fill="none"/><path d="M16 12h5v5h-5a2.5 2.5 0 0 1 0-5Z" ' + s + ' fill="none"/>',
      shieldHalved: '<path d="M12 3 5 6v5c0 4.8 3 8.3 7 10 4-1.7 7-5.2 7-10V6l-7-3Z" ' + s + ' fill="none"/><path d="M12 3v18" ' + s + '/>',
      circleXmark: '<circle cx="12" cy="12" r="9" ' + s + ' fill="none"/><path d="m9 9 6 6M15 9l-6 6" ' + s + '/>',
      package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" ' + s + ' fill="none"/><path d="m4.5 7.8 7.5 4.2 7.5-4.2M12 21v-9" ' + s + '/>',
      calculator: '<rect x="5" y="3" width="14" height="18" rx="2" ' + s + ' fill="none"/><path d="M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01" ' + s + '/>',
      moneyBill: '<rect x="3" y="6" width="18" height="12" rx="2" ' + s + ' fill="none"/><circle cx="12" cy="12" r="3" ' + s + ' fill="none"/>',
      trendingUp: '<path d="M3 17 9 11l4 4 8-8" ' + s + ' fill="none"/><path d="M15 7h6v6" ' + s + '/>',
      pulse: '<path d="M3 12h4l2-5 4 10 2-5h6" ' + s + ' fill="none"/>'
    };
    return fallbacks[name]
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">' + fallbacks[name] + '</svg>'
      : "";
  }

  function compactText(value, max) {
    value = String(value == null ? "" : value).trim();
    max = Number(max) || 64;
    return value.length > max ? value.slice(0, max - 1) + "..." : value;
  }

  function stateForPlatform(accountId, platform) {
    if (!window.DashboardMarketingState || typeof window.DashboardMarketingState.get !== "function") return null;
    if (platform && platform !== "all") return window.DashboardMarketingState.get(accountId, platform);
    return window.DashboardMarketingState.get(accountId);
  }

  function textKey(value) {
    var intelligence = window.TaagerCampaignIntelligence || window.KhodCampaignIntelligence;
    if (intelligence && typeof intelligence.textKey === "function") {
      return intelligence.textKey(value);
    }
    return String(value || "").toLowerCase().trim();
  }

  function defaultState(mount) {
    mount._campaignUi = mount._campaignUi || {};
    var state = mount._campaignUi;
    state.campaignPage = Number(state.campaignPage || 1);
    state.productPage = Number(state.productPage || 1);
    state.pageSize = PAGE_SIZES.indexOf(Number(state.pageSize)) !== -1 ? Number(state.pageSize) : 10;
    state.search = String(state.search || "");
    state.productSearch = String(state.productSearch || "");
    state.matchFilter = state.matchFilter || "all";
    state.objectiveFilter = state.objectiveFilter || "all";
    state.sortKey = state.sortKey || "spend";
    state.sortDir = state.sortDir || "desc";
    state.productSortKey = state.productSortKey || "spend";
    state.productSortDir = state.productSortDir || "desc";
    return state;
  }

  function card(label, value, sub, iconName, tone, valueState) {
    return '<div class="campaign-kpi campaign-kpi-' + esc(tone || "neutral") + (valueState ? " campaign-value-state-" + esc(valueState) : "") + '">' +
      '<div class="campaign-kpi-top"><span class="campaign-kpi-icon">' + icon(iconName || "pulse") + '</span><span>' + esc(label) + '</span></div>' +
      '<strong class="' + (valueState ? "campaign-financial-" + esc(valueState) : "") + '">' + esc(value) + window.supposedBadgeHtml(label) + '</strong>' +
      (sub ? '<em>' + esc(sub) + '</em>' : '') +
    '</div>';
  }

  function renderCampaignKpis(intel) {
    return card("Spend", money(intel.totals.spend, intel.currency), "Spent campaigns in this period", "wallet", "spend") +
      card("Matched spend", percent(intel.totals.matchedSpendPct), money(intel.totals.matchedSpend, intel.currency) + " exact SKU", "shieldHalved", "matched") +
      card("Unmatched spend", percent(intel.totals.unmatchedSpendPct), money(intel.totals.unmatchedSpend, intel.currency) + " needs SKU", "circleXmark", "unmatched") +
      card("Matched net orders", fmt(intel.totals.taagerOrders), "Unique net orders from SKU-matched products", "package", "orders") +
      card("Matched CPA", intel.totals.taagerOrders > 0 ? money(intel.totals.taagerCpa, intel.currency) : "No matched net orders", "Matched spend / unique net orders", "calculator", "cpa", financialState(intel.totals.taagerCpa, intel.totals.taagerOrders > 0)) +
      card("Matched net profit", signedMoney(intel.totals.netProfit, intel.currency), "Matched Taager profit after tax - matched spend", "moneyBill", "profit", financialState(intel.totals.netProfit, true)) +
      card("Matched ROI", percent(intel.totals.roiPct), "Matched net profit / matched spend", "trendingUp", "roi", financialState(intel.totals.roiPct, intel.totals.matchedSpend > 0)) +
      card("Matched profit ROAS", roas(intel.totals.profitRoas), "Matched Taager profit after tax / matched spend", "pulse", "roas");
  }

  function sortValue(row, key) {
    var value = row && row[key];
    if (typeof value === "number") return value;
    if (value == null) return "";
    return String(value).toLowerCase();
  }

  function sortRows(rows, key, dir) {
    var factor = dir === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = sortValue(a, key);
      var bv = sortValue(b, key);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      var avNum = Number(av);
      var bvNum = Number(bv);
      var isAvNum = typeof av === "number" || (!isNaN(avNum) && av !== "" && av != null);
      var isBvNum = typeof bv === "number" || (!isNaN(bvNum) && bv !== "" && bv != null);
      if (isAvNum && isBvNum) {
        return (avNum - bvNum) * factor;
      }
      var as = String(av);
      var bs = String(bv);
      if (as < bs) return -1 * factor;
      if (as > bs) return 1 * factor;
      return 0;
    });
  }

  function objectiveOptions(rows, selected) {
    var seen = {};
    rows.forEach(function (row) {
      var objective = row.objective || "unknown";
      seen[objective] = true;
    });
    return '<option value="all">All objectives</option>' + Object.keys(seen).sort().map(function (objective) {
      return '<option value="' + esc(objective) + '"' + (selected === objective ? " selected" : "") + '>' + esc(objective) + '</option>';
    }).join("");
  }

  function filterCampaignRows(rows, state) {
    var query = textKey(state.search);
    return rows.filter(function (row) {
      if (state.matchFilter === "matched" && !row.attributionVerified) return false;
      if (state.matchFilter === "unmatched" && row.attributionVerified) return false;
      if (state.objectiveFilter !== "all" && row.objective !== state.objectiveFilter) return false;
      if (!query) return true;
      var haystack = row.searchHaystack || textKey([
        row.campaign,
        row.campaignId,
        row.platform,
        row.objective,
        row.status,
        row.product,
        row.suggestedProduct,
        row.productSku,
        row.suggestedProductSku,
        row.matchMethod,
        row.matchConfidence
      ].join(" "));
      return haystack.indexOf(query) !== -1;
    });
  }

  function paginate(rows, page, pageSize) {
    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var safePage = Math.min(Math.max(1, page), totalPages);
    var start = (safePage - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      page: safePage,
      totalPages: totalPages,
      start: total ? start + 1 : 0,
      end: Math.min(start + pageSize, total),
      total: total
    };
  }

  function headerTip(mode, key, label) {
    var tips = {
      products: {
        product: "Taager product matched by a complete SKU or a unique product-name fallback in the campaign name. Account and country boundaries are preserved.",
        spend: "Attributed campaign spend converted into the shared calculator/product currency. Ambiguous campaigns are excluded.",
        clicks: "Clicks reported by the ad platform for attributed campaigns.",
        taagerOrders: "Real conversions from Taager dashboard orders. Conversion rate = Taager orders / landing page views, or content views when landing page views are unavailable. N/A means the ad platform did not report a usable tracked-view denominator through Windsor.",
        taagerDelivered: "Delivered Taager orders. Delivered conversion rate uses the same tracked-view denominator and is N/A when that denominator is unavailable.",
        taagerNdrPct: "Net delivery rate from Taager order outcomes.",
        taagerCpa: "Taager CPA = attributed campaign spend / Taager orders.",
        deliveredCpa: "Delivered CPA = attributed campaign spend / delivered Taager orders.",
        breakEvenCpa: "Break-even CPA = average delivered Taager profit after tax x NDR.",
        taagerProfit: "Earned Taager profit after tax from delivered orders for this account, country, and SKU.",
        avgDeliveredProfit: "Average profit = earned Taager profit after tax / delivered Taager orders.",
        netProfit: "Net profit = Taager profit after tax - attributed campaign spend. ROI = net profit / spend.",
        profitRoas: "Profit ROAS = Taager profit after tax / spend. The smaller line shows total sales and total sales ROAS.",
        decision: "Decision uses order sample, delivered sample, NDR, CPA safety, delivered CPA, and net profit."
      },
      campaigns: {
        campaign: "Synced campaign name and campaign ID. Complete SKUs may be separated or glued into the campaign name.",
        platform: "The ad platform that owns this campaign.",
        objective: "Campaign objective detected from synced fields and campaign naming.",
        status: "Current or effective campaign status reported by the ad platform.",
        spend: "Native ad-account spend. Product Actions convert matched totals into the shared calculator/product currency.",
        impressions: "Impressions reported by the ad platform.",
        clicks: "Clicks reported by the ad platform.",
        ctrPct: "CTR = clicks / impressions.",
        platformCpc: "Native CPC = native spend / clicks.",
        platformCpm: "Native CPM = native spend / impressions x 1,000.",
        product: "Attribution result. Product Actions use exact SKU matches only; unmatched spend remains separate."
      }
    };
    return tips[mode || "campaigns"] && tips[mode || "campaigns"][key] || label;
  }

  function sortableTh(label, key, state, mode) {
    var activeKey = mode === "products" ? state.productSortKey : state.sortKey;
    var activeDir = mode === "products" ? state.productSortDir : state.sortDir;
    var active = activeKey === key;
    var tip = headerTip(mode || "campaigns", key, label);
    return '<th class="campaign-col-' + esc(key) + '"><button type="button" class="campaign-sort-btn" data-tooltip="' + esc(tip) + '" aria-label="' + esc(label + ". " + tip) + '" data-sort-mode="' + esc(mode || "campaigns") + '" data-sort-key="' + esc(key) + '">' +
      '<span>' + esc(label) + '</span><em>' + (active ? (activeDir === "asc" ? "↑" : "↓") : "↕") + '</em>' +
    '</button></th>';
  }

  function renderObjectiveMix(items) {
    if (!items || !items.length) return '<div class="campaign-empty">No synced objective mix for spent campaigns yet.</div>';
    return items.slice(0, 8).map(function (item) {
      return '<div class="campaign-mix-row">' +
        '<span>' + esc(item.objective || "unknown") + '</span>' +
        '<strong>' + money(item.spendSar) + '</strong>' +
        '<em>' + fmt(item.campaignCount) + ' spent campaigns · reporting total</em>' +
      '</div>';
    }).join("");
  }

  function renderSpendMatchHealth(intel) {
    var totals = intel && intel.totals || {};
    var matchedPct = Math.max(0, Math.min(100, Number(totals.matchedSpendPct || 0)));
    var unmatchedPct = Math.max(0, Math.min(100, Number(totals.unmatchedSpendPct || 0)));
    var note = totals.spend > 0
      ? (unmatchedPct > 0
        ? "Add a complete SKU or a distinctive product name to move unmatched spend into Product Actions."
        : "All spent campaigns are attributed for product-level decisions.")
      : "Sync spent campaigns to unlock Product Actions.";
    return '<div class="campaign-health-card">' +
      '<div class="campaign-health-top"><span>SKU match coverage</span><strong>' + percent(matchedPct) + '</strong></div>' +
      '<div class="campaign-match-bar" aria-label="SKU matched spend coverage">' +
        '<i class="campaign-match-bar-fill" style="width:' + esc(String(matchedPct)) + '%"></i>' +
      '</div>' +
      '<div class="campaign-health-legend">' +
        '<span><i class="matched"></i>SKU-matched</span>' +
        '<span><i class="unmatched"></i>Unmatched</span>' +
      '</div>' +
      '<div class="campaign-note">' + esc(note) + '</div>' +
      (unmatchedPct > 0 ? '<div class="campaign-health-foot"><span>Needs SKU</span><strong>' + percent(unmatchedPct) + '</strong></div>' : '') +
    '</div>';
  }

  function renderMediaBuyingSignals(intel) {
    intel = intel || {};
    var groups = Array.isArray(intel.allProductGroups) ? intel.allProductGroups : [];
    var totals = intel.totals || {};
    var counts = intel.decisionCounts || {};
    var scaleCount = intel._backend ? Number(counts.scale || 0) : groups.filter(function (group) { return group.decision === "scale"; }).length;
    var fixCount = intel._backend ? Number(counts.fix_first || 0) : groups.filter(function (group) { return group.decision === "fix_first"; }).length;
    var watchCount = intel._backend ? Number(counts.watch || 0) : groups.filter(function (group) { return group.decision === "watch"; }).length;
    var pauseCount = intel._backend ? Number(counts.pause || 0) : groups.filter(function (group) { return group.decision === "pause"; }).length;
    return '<div class="campaign-signal"><span>Scale ready</span><strong>' + fmt(scaleCount) + '</strong></div>' +
      '<div class="campaign-signal"><span>Fix first</span><strong>' + fmt(fixCount) + '</strong></div>' +
      '<div class="campaign-signal"><span>Watch / needs data</span><strong>' + fmt(watchCount) + '</strong></div>' +
      '<div class="campaign-signal"><span>Pause / reduce</span><strong>' + fmt(pauseCount) + '</strong></div>' +
      '<div class="campaign-health-foot"><span>Separated SKU ' + fmt(totals.separatedSkuRows || 0) +
      ' · Glued SKU ' + fmt(totals.gluedSkuRows || 0) +
      ' · Name fallback ' + fmt(totals.nameRows || 0) +
      ' · Ambiguous ' + fmt(totals.ambiguousRows || 0) +
      '</span></div>' +
      '<div class="campaign-note">Product Actions use spend and clicks only from unambiguous product attribution. Orders, NDR, Taager profit, ROI, ROAS, and decisions come from Taager dashboard data.</div>';
  }

  function decisionLabel(decision) {
    return {
      scale: campaignPick("Scale", "توسّع"),
      fix_first: campaignPick("Fix First", "أصلح أولا"),
      pause: campaignPick("Pause", "أوقف مؤقتا"),
      watch: campaignPick("Needs Data", "يحتاج بيانات")
    }[decision] || String(decision || campaignPick("Review", "راجع"));
  }

  function decisionSummary(decision) {
    return {
      scale: campaignPick("All scale guardrails passed.", "اجتاز المنتج جميع شروط التوسع."),
      fix_first: campaignPick("Recoverable issues must improve before scaling.", "توجد مشكلات قابلة للإصلاح قبل التوسع."),
      pause: campaignPick("Critical risk requires reducing or pausing traffic.", "توجد مخاطرة حرجة تتطلب خفض أو إيقاف الزيارات."),
      watch: campaignPick("There is not enough evidence for a reliable decision yet.", "لا توجد بيانات كافية لاتخاذ قرار موثوق حتى الآن.")
    }[decision] || campaignPick("Review the available evidence.", "راجع البيانات المتاحة.");
  }

  function decisionNextAction(decision) {
    return {
      scale: campaignPick("Increase budget in small steps. Stop if NDR falls or CPA rises above break-even.", "ارفع الميزانية بخطوات صغيرة، وتوقف إذا انخفض NDR أو تجاوزت CPA نقطة التعادل."),
      fix_first: campaignPick("Keep budget stable, improve the failed checks, then reassess before scaling.", "ثبّت الميزانية وحسّن المؤشرات الضعيفة ثم أعد التقييم قبل التوسع."),
      pause: campaignPick("Reduce or pause traffic, fix the critical risk, then reassess.", "خفّض أو أوقف الزيارات مؤقتا، أصلح الخطر الحرج، ثم أعد التقييم."),
      watch: campaignPick("Keep the test controlled until at least 15 orders, then reassess.", "استمر باختبار محدود حتى 15 طلبا على الأقل، ثم أعد التقييم.")
    }[decision] || campaignPick("Review the product before changing spend.", "راجع المنتج قبل تغيير الإنفاق.");
  }

  function decisionCheckLabel(key) {
    return {
      orders: campaignPick("Order sample", "عينة الطلبات"),
      delivered: campaignPick("Delivered sample", "عينة التسليم"),
      ndr: "NDR",
      cpa: campaignPick("CPA vs break-even", "CPA مقابل نقطة التعادل"),
      net_profit: campaignPick("Net profit", "صافي الربح"),
      cancellation: campaignPick("Cancellation rate", "نسبة الإلغاء"),
      city_mix: campaignPick("City mix", "مزيج المدن")
    }[key] || key;
  }

  function decisionCheckValue(item, currency) {
    var actual = item.actual;
    var target = item.target;
    if (item.key === "orders" || item.key === "delivered") return fmt(actual) + " / " + fmt(target) + "+";
    if (item.key === "ndr") return fmtDecimal(actual, 1) + "% / " + fmtDecimal(target, 0) + "%+";
    if (item.key === "cancellation") return fmtDecimal(actual, 1) + "% / <" + fmtDecimal(target, 0) + "%";
    if (item.key === "cpa") {
      if (!(Number(actual) > 0) || !(Number(target) > 0)) return campaignPick("Unavailable", "غير متوفر");
      return money(actual, currency) + " / " + money(target, currency);
    }
    if (item.key === "net_profit") return actual == null ? campaignPick("Unavailable", "غير متوفر") : signedMoney(actual, currency);
    if (item.key === "city_mix") return fmt(actual) + " " + campaignPick("weak cities", "مدن ضعيفة");
    return String(actual == null ? "" : actual);
  }

  function renderDecisionChecks(title, items, tone, currency) {
    if (!items || !items.length) return "";
    return '<div class="campaign-decision-tip-group ' + esc(tone) + '"><h5>' + esc(title) + '</h5>' +
      items.map(function (item) {
        return '<div class="campaign-decision-tip-check ' + esc(item.status || tone) + '"><span>' + esc(decisionCheckLabel(item.key)) + '</span><strong>' + esc(decisionCheckValue(item, currency)) + '</strong></div>';
      }).join("") + '</div>';
  }

  function renderDecisionTooltip(group, periodLabel, currency, templateId) {
    var metadata = group.decisionMetadata || {};
    var confidence = metadata.confidence || { level: "limited", label: "Limited evidence" };
    var confidenceLabel = {
      limited: campaignPick("Limited evidence", "بيانات محدودة"),
      developing: campaignPick("Developing evidence", "بيانات قيد الاكتمال"),
      strong: campaignPick("Strong evidence", "بيانات قوية")
    }[confidence.level] || confidence.label;
    return '<template id="' + esc(templateId) + '"><div class="campaign-decision-tooltip" dir="' + (window.dashboardI18n && window.dashboardI18n.isRtl() ? "rtl" : "ltr") + '">' +
      '<div class="campaign-decision-tip-head ' + esc(group.decision) + '"><span>' + esc(decisionLabel(group.decision)) + '</span><strong>' + esc(decisionSummary(group.decision)) + '</strong></div>' +
      '<div class="campaign-decision-tip-meta"><span>' + esc(confidenceLabel) + '</span><span>' + fmt(group.campaignCount) + ' ' + esc(campaignPick("campaigns", "حملات")) + '</span></div>' +
      renderDecisionChecks(campaignPick("Passed", "مؤشرات ناجحة"), metadata.passedChecks, "passed", currency) +
      renderDecisionChecks(campaignPick("Needs attention", "يحتاج انتباها"), metadata.failedChecks, "failed", currency) +
      renderDecisionChecks(campaignPick("Context / warnings", "السياق / التحذيرات"), metadata.warnings, "warning", currency) +
      '<div class="campaign-decision-tip-next"><span>' + esc(campaignPick("Next action", "الإجراء التالي")) + '</span><strong>' + esc(decisionNextAction(group.decision)) + '</strong></div>' +
      '<div class="campaign-decision-tip-foot"><span>' + esc(campaignPick("Product-level decision across unambiguously attributed campaigns.", "قرار على مستوى المنتج عبر الحملات المنسوبة بوضوح.")) + '</span>' +
      '<span>' + esc(periodLabel || campaignPick("Current synced period", "فترة المزامنة الحالية")) + '</span></div>' +
    '</div></template>';
  }

  function renderProductRows(groups, periodLabel) {
    if (!groups.length) return '<tr><td colspan="14" class="campaign-empty">No confirmed product attribution on this page.</td></tr>';
    return groups.map(function (group) {
      var currency = group.currency || window.dashboardActiveCurrency || "SAR";
      var cpaLabel = group.taagerOrders > 0 ? money(group.taagerCpa, currency) : "No Taager orders";
      var deliveredCpaLabel = group.taagerDelivered > 0 ? money(group.deliveredCpa, currency) : "No delivered orders";
      var productTitle = campaignProductName(group.sku, group.product);
      var displayDecision = decisionLabel(group.decision);
      var netState = financialState(group.netProfit, true);
      var roiState = financialState(group.roiPct, group.spend > 0);
      var templateId = "campaign-decision-tip-" + (++campaignDecisionTipSeq);
      var decisionAria = displayDecision + ". " + decisionSummary(group.decision) + " " + decisionNextAction(group.decision);
      var trafficViewCount = Number(group.trafficViews || (Number(group.landingPageViews) > 0 ? group.landingPageViews : group.contentViews) || 0);
      var trafficViewLabel = trafficViewCount > 0 ? "landing/content views" : "views unavailable";
      var conversionAvailable = group.conversionRateAvailable != null ? group.conversionRateAvailable === true : trafficViewCount > 0;
      var conversionLabel = conversionAvailable ? percent(group.realConversionRatePct) : "N/A";
      var deliveredConversionLabel = conversionAvailable ? percent(group.deliveredConversionRatePct) : "N/A";
      var totalSales = group.totalSales != null ? group.totalSales : group.deliveredSales;
      var totalSalesRoas = group.totalSalesRoas != null ? group.totalSalesRoas : group.deliveredSalesRoas;
      
      return '<tr>' +
        '<td class="campaign-cell-name" title="' + esc(productTitle) + '"><strong>' + esc(compactText(productTitle, 58)) + '</strong><small>SKU ' + esc(group.sku || "missing") + '</small></td>' +
        '<td class="campaign-num">' + money(group.spend, currency) + '</td>' +
        '<td class="campaign-num"><strong>' + fmt(group.clicks) + '</strong><small>' + fmt(group.campaignCount) + ' campaigns</small></td>' +
        '<td class="campaign-num"><strong>' + fmt(group.taagerOrders) + '</strong><small>' + conversionLabel + ' conversion · ' + fmt(trafficViewCount) + ' ' + trafficViewLabel + '</small></td>' +
        '<td class="campaign-num"><strong>' + fmt(group.taagerDelivered) + window.supposedBadgeHtml('delivered') + '</strong><small>' + deliveredConversionLabel + ' delivered conversion</small></td>' +
        '<td class="campaign-num">' + esc(fmtDecimal(group.taagerNdrPct || 0, 2)) + '%</td>' +
        '<td class="campaign-num">' + cpaLabel + '</td>' +
        '<td class="campaign-num">' + deliveredCpaLabel + window.supposedBadgeHtml('delivered') + '</td>' +
        '<td class="campaign-num">' + money(group.breakEvenCpa, currency) + '</td>' +
        '<td class="campaign-num">' + money(group.taagerProfit, currency) + window.supposedBadgeHtml('profit') + '</td>' +
        '<td class="campaign-num">' + money(group.avgDeliveredProfit, currency) + '</td>' +
        '<td class="campaign-num campaign-financial-cell campaign-financial-cell-' + netState + '"><strong class="campaign-financial-' + netState + '">' + signedMoney(group.netProfit, currency) + window.supposedBadgeHtml('profit') + '</strong><small class="campaign-financial-' + roiState + '">' + percent(group.roiPct) + ' ROI</small></td>' +
        '<td class="campaign-num"><strong>' + roas(group.profitRoas) + window.supposedBadgeHtml('roas') + '</strong><small>' + money(totalSales, currency) + window.supposedBadgeHtml('sales') + ' total sales · ' + roas(totalSalesRoas) + ' sales ROAS</small></td>' +
        '<td class="campaign-decision-cell"><button type="button" class="campaign-decision ' + esc(group.decision) + '" data-tooltip-template="' + esc(templateId) + '" aria-label="' + esc(decisionAria) + '">' + esc(displayDecision) + '</button>' +
        renderDecisionTooltip(group, periodLabel, currency, templateId) + '</td>' +
      '</tr>';
    }).join("");
  }

  function renderCampaignRows(rows) {
    if (!rows.length) return '<tr><td colspan="9" class="campaign-empty">No spent campaigns match the current filters.</td></tr>';
    return rows.map(function (row) {
      var matchedProductName = campaignProductName(row.productSku, row.product);
      var isAmbiguousMatch = row.matchMethod === "ambiguous";
      var matchText = row.attributionVerified
        ? matchedProductName
        : (isAmbiguousMatch ? "Ambiguous SKUs" : (row.suggestedProduct ? "Needs SKU" : "Unmatched"));
      var matchSub = row.attributionVerified
        ? ("SKU " + (row.productSku || ""))
        : (row.suggestedProduct ? compactText(row.suggestedProduct, 42) : "No Taager product attribution");
      var rowCurrency = row.rawCurrency || "USD";
      var rowSpend = row.rawSpend != null ? row.rawSpend : row.spend;
      var campaignTitle = row.campaign || "";
      return '<tr>' +
        '<td class="campaign-cell-name campaign-cell-campaign" title="' + esc(campaignTitle) + '"><strong>' + esc(compactText(campaignTitle, 48)) + '</strong><small>' + esc(row.campaignId || row.note || "") + '</small></td>' +
        '<td>' + esc(row.platform || "") + '</td>' +
        '<td class="campaign-num"><strong>' + moneyInCurrency(rowSpend, rowCurrency) + '</strong><small>Ad account spend</small></td>' +
        '<td class="campaign-num">' + fmt(row.impressions) + '</td>' +
        '<td class="campaign-num">' + fmt(row.clicks) + '</td>' +
        '<td class="campaign-num">' + percent(row.ctrPct) + '</td>' +
        '<td class="campaign-num"><strong>' + moneyInCurrency(row.platformCpc, row.platformCpcCurrency || rowCurrency) + '</strong><small>Native CPC</small></td>' +
        '<td class="campaign-num">' + moneyInCurrency(row.platformCpm, rowCurrency) + '</td>' +
        '<td class="campaign-cell-match" title="' + esc(row.attributionVerified ? matchedProductName : (isAmbiguousMatch ? (row.candidateIds || []).join(", ") : (row.suggestedProduct || ""))) + '"><strong>' + esc(matchText) + '</strong><small>' + esc(matchSub) + '</small></td>' +
      '</tr>';
    }).join("");
  }

  function renderPager(prefix, page) {
    if (window.renderDashboardPagination) {
      return window.renderDashboardPagination({
        currentPage: page.page,
        totalPages: page.totalPages,
        totalItems: page.total,
        startItem: page.start,
        endItem: page.end,
        itemLabel: prefix === "products" ? "products" : "campaigns",
        pageButtonClass: "campaign-" + prefix + "-page",
        prevClass: "campaign-" + prefix + "-prev",
        nextClass: "campaign-" + prefix + "-next",
        className: "campaign-dashboard-pagination dash-pagination-compact",
        alwaysVisible: true
      });
    }
    return '<div class="campaign-pager"><span>' + fmt(page.start) + '-' + fmt(page.end) + ' of ' + fmt(page.total) + '</span></div>';
  }

  function pageSizeSelect(value) {
    return '<label class="campaign-field"><span>Show</span><select data-campaign-page-size>' +
      PAGE_SIZES.map(function (size) {
        return '<option value="' + size + '"' + (Number(value) === size ? " selected" : "") + '>' + size + '</option>';
      }).join("") +
    '</select></label>';
  }

  function backendCampaignParams(mount, data, state) {
    var accountId = campaignAccountId(data);
    var roiSettings = campaignRoiSettings(accountId, data);
    var rateSnapshot = window.TaagerCurrency && typeof window.TaagerCurrency.snapshot === "function"
      ? window.TaagerCurrency.snapshot()
      : null;
    return {
      platform: mount && mount._campaignPlatform || "all",
      reportingCurrency: currentCampaignCurrency(accountId, data),
      orderCurrency: data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || "SAR",
      egpRate: Number(rateSnapshot && rateSnapshot.rates && rateSnapshot.rates.EGP || roiSettings.egpRate || data && data.roi && data.roi.egpRate || 52) || 52,
      exchangeRates: Object.assign({}, rateSnapshot && rateSnapshot.rates || data && data.meta && data.meta.exchangeRates || {}),
      exchangeRateSource: rateSnapshot && rateSnapshot.source || data && data.meta && data.meta.exchangeRateSource || "",
      exchangeRatesUpdatedAt: rateSnapshot && rateSnapshot.updatedAt || data && data.meta && data.meta.exchangeRatesUpdatedAt || "",
      pageSize: state.pageSize,
      campaignPage: state.campaignPage,
      productPage: state.productPage,
      campaignSortBy: state.sortKey,
      campaignSortDir: state.sortDir,
      productSortBy: state.productSortKey,
      productSortDir: state.productSortDir,
      campaignFilters: {
        search: state.search,
        match: state.matchFilter,
        objective: state.objectiveFilter
      },
      productFilters: { search: state.productSearch }
    };
  }

  function backendCampaignIntel(result, data) {
    var productRows = result.productRows || [];
    var isExpectedMode = window.isExpectedNdrMode && window.isExpectedNdrMode();
    
    if (isExpectedMode) {
      var globalExpectedNdrRate = (data && data.roi && data.roi.ndrPct != null) ? (data.roi.ndrPct / 100) : 0;
      
      var totalSpend = 0;
      var totalOrders = 0;
      var totalDelivered = 0;
      var totalProfit = 0;
      
      productRows.forEach(function (group) {
        var productInList = data && data.products && data.products.rankedList && data.products.rankedList.find(function (p) {
          return String(p.sku || '').toLowerCase() === String(group.sku || '').toLowerCase();
        });
        var expectedNdrRate = productInList
          ? (productInList.expectedNdrRate != null ? Number(productInList.expectedNdrRate) : productInList.ndrPct / 100)
          : globalExpectedNdrRate;
        
        var oldDelivered = group.actualDeliveredCount != null ? group.actualDeliveredCount : group.taagerDelivered;
        var oldProfit = group.actualCommission != null ? group.actualCommission : group.taagerProfit;
        var oldSales = group.totalSales != null ? group.totalSales : (group.deliveredSales || 0);
        var projection = window.TaagerDashboardFinancialCore.calculate({
          mode: 'expected',
          netOrders: group.taagerOrders,
          actualDeliveredOrders: oldDelivered,
          actualEarnedProfitAfterTax: oldProfit,
          currentTotalSales: oldSales,
          expectedNdrRate: expectedNdrRate,
          adSpend: group.spend || 0
        });
        group.actualDeliveredCount = oldDelivered;
        group.actualCommission = oldProfit;
        group.expectedDeliveriesExact = projection.expectedDeliveriesExact;
        group.taagerDelivered = projection.expectedDeliveriesDisplay;
        group.taagerNdrPct = expectedNdrRate * 100;
        group.avgDeliveredProfit = projection.averageProfit;
        group.taagerProfit = projection.expectedTotalProfitBeforeAdSpend;
        group.netProfit = projection.expectedNetProfit;
        group.roiPct = projection.expectedRoi;
        group.profitRoas = projection.expectedProfitRoas;
        group.deliveredCpa = projection.expectedDeliveredCpa;
        group.totalSales = projection.expectedDeliveredSales;
        group.deliveredSales = group.totalSales;
        group.totalSalesRoas = projection.expectedSalesRoas;
        
        totalSpend += (group.spend || 0);
        totalOrders += (group.taagerOrders || 0);
        totalDelivered += group.expectedDeliveriesExact;
        totalProfit += group.taagerProfit;
      });
      
      if (result.totals) {
        result.totals.expectedDeliveriesExact = totalDelivered;
        result.totals.taagerDelivered = Math.round(totalDelivered);
        result.totals.taagerProfit = totalProfit;
        result.totals.netProfit = totalProfit - (result.totals.spend || totalSpend);
        result.totals.roiPct = (result.totals.spend || totalSpend) > 0 ? (result.totals.netProfit / (result.totals.spend || totalSpend) * 100) : 0;
        result.totals.profitRoas = (result.totals.spend || totalSpend) > 0 ? (result.totals.taagerProfit / (result.totals.spend || totalSpend)) : 0;
        result.totals.deliveredCpa = totalDelivered > 0 ? ((result.totals.spend || totalSpend) / totalDelivered) : 0;
        result.totals.taagerNdrPct = totalOrders > 0 ? (totalDelivered / totalOrders * 100) : (globalExpectedNdrRate * 100);
      }
    }

    return {
      _backend: true,
      currency: result.currency,
      periodLabel: result.periodLabel,
      sourceOfTruth: result.sourceOfTruth,
      lastSyncAt: result.lastSyncAt,
      totals: result.totals || {},
      objectiveMix: result.objectiveMix || [],
      objectives: result.objectives || [],
      decisionCounts: result.decisionCounts || {},
      creativeSummary: result.creativeSummary || {},
      allCampaigns: result.campaignRows || [],
      allProductGroups: productRows,
      campaignPagination: result.campaignPagination || {},
      productPagination: result.productPagination || {}
    };
  }

  function clearScheduledCampaignUpdate(mount) {
    if (!mount) return;
    if (mount._campaignUpdateTimer) {
      clearTimeout(mount._campaignUpdateTimer);
      mount._campaignUpdateTimer = null;
    }
    if (mount._campaignUpdateFrame && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(mount._campaignUpdateFrame);
      mount._campaignUpdateFrame = null;
    }
  }

  function markCampaignRowsBusy(mount, options) {
    if (!mount) return;
    options = options || {};
    var selectors = [];
    if (options.products !== false) selectors.push(".campaign-table-products");
    if (options.campaigns !== false) selectors.push(".campaign-table-campaigns");
    selectors.forEach(function (selector) {
      var table = mount.querySelector(selector);
      if (table) table.setAttribute("aria-busy", "true");
    });
  }

  function clearCampaignRowsBusy(mount) {
    if (!mount) return;
    mount.querySelectorAll(".campaign-table-products,.campaign-table-campaigns").forEach(function (table) {
      table.removeAttribute("aria-busy");
    });
  }

  function scheduleCampaignsUIUpdate(mount, data, ctx, state, intel, options) {
    options = options || {};
    clearScheduledCampaignUpdate(mount);
    var delay = options.delay == null ? 0 : Number(options.delay) || 0;
    var backendRefresh = intel && intel._backend && !options.backendReady;
    if (backendRefresh) {
      markCampaignRowsBusy(mount, options.busy);
      mount._campaignUpdateTimer = setTimeout(function () {
        mount._campaignUpdateTimer = null;
        if (!mount.isConnected) return;
        requestBackendCampaigns(mount, data, ctx, state, !!options.fullRender);
      }, delay);
      return;
    }
    var run = function () {
      mount._campaignUpdateFrame = null;
      if (!mount.isConnected) return;
      updateCampaignsUIOnly(mount, data, ctx, state, intel, options);
    };
    if (delay > 0) {
      mount._campaignUpdateTimer = setTimeout(function () {
        mount._campaignUpdateTimer = null;
        if (window.requestAnimationFrame) mount._campaignUpdateFrame = window.requestAnimationFrame(run);
        else run();
      }, delay);
    } else if (window.requestAnimationFrame) {
      mount._campaignUpdateFrame = window.requestAnimationFrame(run);
    } else {
      run();
    }
  }

  function requestBackendCampaigns(mount, data, ctx, state, fullRender) {
    if (!mount._campaignBackendEnabled || !window.DashboardQueryRuntime || typeof window.DashboardQueryRuntime.query !== "function") {
      return Promise.resolve(false);
    }
    clearScheduledCampaignUpdate(mount);
    var requestId = Number(mount._campaignBackendRequest || 0) + 1;
    mount._campaignBackendRequest = requestId;
    return window.DashboardQueryRuntime.query("campaign-overview", backendCampaignParams(mount, data, state), data).then(function (result) {
      if (requestId !== mount._campaignBackendRequest || !mount.isConnected) return false;
      clearCampaignRowsBusy(mount);
      if (!result || !result.ok) {
        mount._campaignBackendActive = false;
        if (mount._campaignLegacyIntel) renderMainCampaignsUI(mount, data, ctx, state, mount._campaignLegacyIntel);
        return false;
      }
      mount._campaignBackendActive = true;
      mount._campaignIntel = backendCampaignIntel(result, data);
      if (fullRender) renderMainCampaignsUI(mount, data, ctx, state, mount._campaignIntel);
      else updateCampaignsUIOnly(mount, data, ctx, state, mount._campaignIntel, { backendReady: true });
      return true;
    }).catch(function (error) {
      clearCampaignRowsBusy(mount);
      mount._campaignBackendActive = false;
      console.warn("[Campaigns] backend query failed; using legacy data", error && error.message ? error.message : error);
      if (mount._campaignLegacyIntel && mount.isConnected) renderMainCampaignsUI(mount, data, ctx, state, mount._campaignLegacyIntel);
      return false;
    });
  }



  function updateCampaignsUIOnly(mount, data, ctx, state, intel, options) {
    options = options || {};
    if (intel && intel._backend && !options.backendReady) {
      scheduleCampaignsUIUpdate(mount, data, ctx, state, intel, options);
      return;
    }
    clearCampaignRowsBusy(mount);
    var allCampaigns = Array.isArray(intel.allCampaigns) ? intel.allCampaigns : [];
    var allProducts = Array.isArray(intel.allProductGroups) ? intel.allProductGroups : (intel.topProductGroups || []);
    var campaignPage;
    var productPage;

    if (intel._backend) {
      campaignPage = Object.assign({ rows: allCampaigns, page: 1, totalPages: 1, total: allCampaigns.length, start: allCampaigns.length ? 1 : 0, end: allCampaigns.length }, intel.campaignPagination || {}, { rows: allCampaigns });
      productPage = Object.assign({ rows: allProducts, page: 1, totalPages: 1, total: allProducts.length, start: allProducts.length ? 1 : 0, end: allProducts.length }, intel.productPagination || {}, { rows: allProducts });
      state.campaignPage = campaignPage.page;
      state.productPage = productPage.page;
    } else {
    // Campaigns filtering & sorting cache
    var filterKey = [state.search, state.matchFilter, state.objectiveFilter].join("\u0000");
    var sortKey = [filterKey, state.sortKey, state.sortDir].join("\u0000");
    
    var filteredCampaigns;
    if (mount._cachedCampaignsFilterKey === filterKey && mount._cachedCampaignsIntel === intel && mount._cachedFilteredCampaigns) {
      filteredCampaigns = mount._cachedFilteredCampaigns;
    } else {
      filteredCampaigns = filterCampaignRows(allCampaigns, state);
      mount._cachedCampaignsFilterKey = filterKey;
      mount._cachedCampaignsIntel = intel;
      mount._cachedFilteredCampaigns = filteredCampaigns;
      mount._cachedCampaignsSortKey = null;
    }
    
    var sortedCampaigns;
    if (mount._cachedCampaignsSortKey === sortKey && mount._cachedSortedCampaigns) {
      sortedCampaigns = mount._cachedSortedCampaigns;
    } else {
      sortedCampaigns = sortRows(filteredCampaigns, state.sortKey, state.sortDir);
      mount._cachedCampaignsSortKey = sortKey;
      mount._cachedSortedCampaigns = sortedCampaigns;
    }
    campaignPage = paginate(sortedCampaigns, state.campaignPage, state.pageSize);
    state.campaignPage = campaignPage.page;

    // Products filtering & sorting cache
    var productFilterKey = state.productSearch;
    var productSortKey = [productFilterKey, state.productSortKey, state.productSortDir].join("\u0000");
    
    var filteredProducts;
    if (mount._cachedProductsFilterKey === productFilterKey && mount._cachedProductsIntel === intel && mount._cachedFilteredProducts) {
      filteredProducts = mount._cachedFilteredProducts;
    } else {
      var productSearchQuery = textKey(state.productSearch);
      if (productSearchQuery) {
        filteredProducts = allProducts.filter(function (p) {
          return p.searchHaystack ? p.searchHaystack.indexOf(productSearchQuery) !== -1 : (textKey(p.product).indexOf(productSearchQuery) !== -1 || textKey(p.sku).indexOf(productSearchQuery) !== -1);
        });
      } else {
        filteredProducts = allProducts;
      }
      mount._cachedProductsFilterKey = productFilterKey;
      mount._cachedProductsIntel = intel;
      mount._cachedFilteredProducts = filteredProducts;
      mount._cachedProductsSortKey = null;
    }
    
    var sortedProducts;
    if (mount._cachedProductsSortKey === productSortKey && mount._cachedSortedProducts) {
      sortedProducts = mount._cachedSortedProducts;
    } else {
      sortedProducts = sortRows(filteredProducts, state.productSortKey, state.productSortDir);
      mount._cachedProductsSortKey = productSortKey;
      mount._cachedSortedProducts = sortedProducts;
    }
    productPage = paginate(sortedProducts, state.productPage, state.pageSize);
    state.productPage = productPage.page;
    }

    var productTbody = mount.querySelector(".campaign-table-products tbody");
    if (productTbody) {
      productTbody.innerHTML = renderProductRows(productPage.rows, intel.periodLabel);
    }

    if (!options.skipCampaignRows) {
      var campaignTbody = mount.querySelector(".campaign-table-campaigns tbody");
      if (campaignTbody) {
        campaignTbody.innerHTML = renderCampaignRows(campaignPage.rows);
      }
    }

    var productPagerContainer = mount.querySelector('[data-pager-prefix="products"]');
    if (productPagerContainer) {
      productPagerContainer.innerHTML = renderPager("products", productPage);
    }

    if (!options.skipCampaignRows) {
      var campaignPagerContainer = mount.querySelector('[data-pager-prefix="campaigns"]');
      if (campaignPagerContainer) {
        campaignPagerContainer.innerHTML = renderPager("campaigns", campaignPage);
      }
    }

    mount.querySelectorAll(".campaign-sort-btn").forEach(function (button) {
      var mode = button.getAttribute("data-sort-mode") || "campaigns";
      var key = button.getAttribute("data-sort-key") || "spend";
      var activeKey = mode === "products" ? state.productSortKey : state.sortKey;
      var activeDir = mode === "products" ? state.productSortDir : state.sortDir;
      var em = button.querySelector("em");
      if (em) {
        em.textContent = activeKey === key ? (activeDir === "asc" ? "↑" : "↓") : "↕";
      }
    });
  }

  function campaignAiContext(intel) {
    var products = (intel.allProductGroups || []).slice().sort(function (a, b) {
      var priority = { pause: 3, fix_first: 2, scale: 1 };
      return (priority[b.decision] || 0) - (priority[a.decision] || 0) ||
        Number(b.spend || 0) - Number(a.spend || 0);
    }).slice(0, 20);
    return {
      currency: intel.currency || window.dashboardActiveCurrency || "SAR",
      sourceOfTruth: intel.sourceOfTruth,
      periodLabel: intel.periodLabel,
      lastSyncAt: intel.lastSyncAt || "",
      totals: intel.totals || {},
      productActions: products,
      topSpendCampaigns: (intel.allCampaigns || []).slice(0, 20),
      creativeSummary: intel.creativeSummary || {}
    };
  }

  function campaignPromptChoices(context) {
    var base = "Use only the supplied Campaign Intelligence context. Campaign spend and clicks come from ad-platform data. Taager orders, delivery, NDR, profit after tax, ROI, ROAS, and decisions are business truth. ";
    return [
      {
        displayText: "What should I scale?",
        prompt: base + "Identify the exact-SKU Product Actions that are safest to scale and give controlled budget steps.",
        decision: "scale",
        context: context
      },
      {
        displayText: "What needs fixing?",
        prompt: base + "Prioritize Product Actions marked Fix First or showing weak NDR, delivered CPA, ROI, or net profit.",
        decision: "fix_first",
        context: context
      },
      {
        displayText: "What should I pause?",
        prompt: base + "Identify Product Actions that should be paused or reduced and state what must recover before restarting.",
        decision: "pause",
        context: context
      },
      {
        displayText: "Review all Product Actions",
        prompt: base + "Review every supplied Product Action and produce a concise Scale, Fix First, and Pause plan.",
        decision: "",
        context: context
      }
    ];
  }

  function campaignLocalAnalysis(request) {
    var context = request.context || {};
    var currency = context.currency || window.dashboardActiveCurrency || "SAR";
    var groups = Array.isArray(context.productActions) ? context.productActions : [];
    var selected = groups.filter(function (group) {
      return !request.decision || group.decision === request.decision;
    }).slice(0, 7);
    if (!selected.length && request.decision) selected = groups.slice(0, 7);
    if (!selected.length) return "No SKU-confirmed Product Actions are available for this campaign view yet.";
    var decisionLabel = { scale: "Scale", fix_first: "Fix First", pause: "Pause" };
    return selected.map(function (group, idx) {
      return (idx + 1) + ". " + (group.product || "Product") +
        (group.sku ? " (SKU " + group.sku + ")" : "") + ": " +
        (decisionLabel[group.decision] || "Review") +
        ". Taager orders " + fmt(group.taagerOrders) +
        ", NDR " + fmtDecimal(group.taagerNdrPct, 1) + "%" +
        ", CPA " + money(group.taagerCpa, currency) +
        ", net profit " + signedMoney(group.netProfit, currency) + ".";
    }).join("\n");
  }

  function closeCampaignAiReview(requestId) {
    campaignAiRequestSeq += 1;
    var overlay = document.querySelector("[data-campaign-ai-overlay]");
    if (overlay && (!requestId || Number(overlay.getAttribute("data-request-id") || 0) === requestId)) {
      overlay.remove();
    }
  }

  function openCampaignActionReview(context) {
    closeCampaignAiReview();
    var requestId = ++campaignAiRequestSeq;
    var choices = campaignPromptChoices(context);
    var overlay = document.createElement("div");
    overlay.className = "campaign-ai-overlay";
    overlay.setAttribute("data-campaign-ai-overlay", "");
    overlay.setAttribute("data-request-id", String(requestId));
    overlay.innerHTML = '<div class="campaign-ai-drawer" role="dialog" aria-modal="true" aria-label="Analyze campaign actions">' +
      '<div class="campaign-ai-drawer-head"><div><span>Campaign Intelligence</span><h3>Analyze actions</h3></div><button type="button" class="campaign-ai-close" data-campaign-ai-close aria-label="Close">×</button></div>' +
      '<p class="campaign-ai-intro">Choose the decision you want to review. The analysis uses the Product Actions already shown on this page.</p>' +
      '<div class="campaign-ai-choices">' + choices.map(function (choice, index) {
        return '<button type="button" data-campaign-ai-choice="' + index + '">' + esc(choice.displayText) + '</button>';
      }).join("") + '</div>' +
      '<div class="campaign-ai-result" data-campaign-ai-result></div>' +
    '</div>';
    document.body.appendChild(overlay);
    var drawer = overlay.querySelector(".campaign-ai-drawer");
    var result = overlay.querySelector("[data-campaign-ai-result]");
    var close = overlay.querySelector("[data-campaign-ai-close]");
    if (close) close.addEventListener("click", function () { closeCampaignAiReview(); });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeCampaignAiReview();
    });
    if (drawer) drawer.addEventListener("click", function (event) { event.stopPropagation(); });

    function showChoices() {
      overlay.querySelectorAll("[data-campaign-ai-choice]").forEach(function (button) {
        button.disabled = false;
      });
    }

    function runChoice(choice) {
      var activeId = ++campaignAiRequestSeq;
      overlay.setAttribute("data-request-id", String(activeId));
      overlay.querySelectorAll("[data-campaign-ai-choice]").forEach(function (button) {
        button.disabled = true;
      });
      result.innerHTML = '<div class="campaign-ai-loader" data-campaign-ai-loader>' +
        '<span class="campaign-loader-spinner" aria-hidden="true"></span>' +
        '<strong data-campaign-ai-phase>Preparing campaign analysis</strong>' +
        '<i></i><i></i><i></i>' +
        '<button type="button" data-campaign-ai-cancel>Cancel</button>' +
      '</div>';
      var cancel = result.querySelector("[data-campaign-ai-cancel]");
      if (cancel) cancel.addEventListener("click", function () {
        campaignAiRequestSeq += 1;
        result.innerHTML = '<div class="campaign-ai-error">Analysis canceled.</div>';
        showChoices();
      });
      setTimeout(function () {
        if (campaignAiRequestSeq !== activeId) return;
        var phase = result.querySelector("[data-campaign-ai-phase]");
        if (phase) phase.textContent = "Analyzing performance";
      }, 800);
      setTimeout(function () {
        if (campaignAiRequestSeq !== activeId) return;
        var phase = result.querySelector("[data-campaign-ai-phase]");
        if (phase) phase.textContent = "Building recommendations";
      }, 2200);

      var fallback = campaignLocalAnalysis(choice);
      var remote = window.api && typeof window.api.dashboardAiQuery === "function"
        ? window.api.dashboardAiQuery({
          command: choice.prompt,
          context: {
            currentPage: "campaigns",
            intent: "campaign_actions",
            mediaBuying: choice.context,
            sourceOfTruth: choice.context && choice.context.sourceOfTruth
          },
          forceGemini: false,
          history: []
        })
        : Promise.resolve({ message: fallback });
      Promise.race([
        remote,
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error("campaign_ai_timeout")); }, 25000);
        })
      ]).then(function (response) {
        if (campaignAiRequestSeq !== activeId || !document.body.contains(overlay)) return;
        var text = String(response && response.message || fallback);
        result.innerHTML = '<div class="campaign-ai-answer"><h4>' + esc(choice.displayText) + '</h4><pre>' + esc(text) + '</pre></div>';
        showChoices();
      }).catch(function () {
        if (campaignAiRequestSeq !== activeId || !document.body.contains(overlay)) return;
        result.innerHTML = '<div class="campaign-ai-answer"><h4>' + esc(choice.displayText) + '</h4><pre>' + esc(fallback) + '</pre>' +
          '<button type="button" data-campaign-ai-retry>Retry</button></div>';
        var retry = result.querySelector("[data-campaign-ai-retry]");
        if (retry) retry.addEventListener("click", function () { runChoice(choice); });
        showChoices();
      });
    }

    overlay.querySelectorAll("[data-campaign-ai-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        runChoice(choices[Number(button.getAttribute("data-campaign-ai-choice") || 0)]);
      });
    });
  }

  function renderMainCampaignsUI(mount, data, ctx, state, intel) {
    var allCampaigns = Array.isArray(intel.allCampaigns) ? intel.allCampaigns : [];
    mount._campaignIntel = intel;
    function activeIntel() {
      return mount._campaignIntel || intel;
    }
    
    var selectedPlatform = mount && mount._campaignPlatform || "all";
    var platformButtons = PLATFORMS.map(function (platform) {
      return '<button type="button" class="campaign-tab ' + (selectedPlatform === platform.id ? "active" : "") + '" data-campaign-platform="' + esc(platform.id) + '">' +
        esc(platform.label) +
      '</button>';
    }).join("");

    mount.innerHTML = '<section class="campaign-section">' +
      '<div class="campaign-head">' +
        '<div class="campaign-head-copy"><p>Campaign Intelligence</p><h2>Media Buying Brain</h2><span>' + esc(intel.sourceOfTruth) + '</span><small class="campaign-sync-time">Synced at ' + esc(formatSyncTime(intel.lastSyncAt)) + '</small></div>' +
        '<div class="campaign-tabs">' + platformButtons + '</div>' +
      '</div>' +
      '<div class="campaign-kpis">' + renderCampaignKpis(intel) + '</div>' +
      '<div class="campaign-panel wide"><div class="campaign-panel-title"><div><h3>Product Actions</h3><span>Unambiguously attributed products only, using Taager business results. Financial columns use the shared calculator/product currency.</span></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="campaign-ai-chip" data-campaign-ai-review>' + icon("sparkles") + 'Analyze actions</button></div></div>' +
        '<div class="campaign-controls">' +
          '<label class="campaign-search"><span>' + icon("search") + '</span><input type="search" data-product-search placeholder="Search product or SKU" value="' + esc(state.productSearch || "") + '" /></label>' +
        '</div>' +
        '<div class="campaign-table-scroll"><table class="campaign-table campaign-table-products"><thead><tr>' +
          sortableTh("Product", "product", state, "products") +
          sortableTh("Spend", "spend", state, "products") +
          sortableTh("Clicks", "clicks", state, "products") +
          sortableTh("Taager orders", "taagerOrders", state, "products") +
          sortableTh("Delivered", "taagerDelivered", state, "products") +
          sortableTh("NDR", "taagerNdrPct", state, "products") +
          sortableTh("Taager CPA", "taagerCpa", state, "products") +
          sortableTh("Del. CPA", "deliveredCpa", state, "products") +
          sortableTh("Break-even", "breakEvenCpa", state, "products") +
          sortableTh("Taager profit", "taagerProfit", state, "products") +
          sortableTh("Avg profit", "avgDeliveredProfit", state, "products") +
          sortableTh("Net profit", "netProfit", state, "products") +
          sortableTh("ROAS", "profitRoas", state, "products") +
          sortableTh("Decision", "decision", state, "products") +
        '</tr></thead><tbody></tbody></table></div>' +
        '<div class="campaign-pager-container" data-pager-prefix="products"></div>' +
      '</div>' +
      '<div class="campaign-panel wide"><div class="campaign-panel-title"><div><h3>Spent Campaigns</h3><span>Search campaign name, SKU, product, objective, status, or platform.</span></div>' + pageSizeSelect(state.pageSize) + '</div>' +
        '<div class="campaign-controls">' +
          '<label class="campaign-search"><span>' + icon("search") + '</span><input type="search" data-campaign-search placeholder="Search campaign or SKU" value="' + esc(state.search) + '" /></label>' +
          '<label class="campaign-field"><span>Match</span><select data-campaign-match-filter>' +
            '<option value="all"' + (state.matchFilter === "all" ? " selected" : "") + '>All</option>' +
            '<option value="matched"' + (state.matchFilter === "matched" ? " selected" : "") + '>Matched</option>' +
            '<option value="unmatched"' + (state.matchFilter === "unmatched" ? " selected" : "") + '>Unmatched</option>' +
          '</select></label>' +
        '</div>' +
        '<div class="campaign-table-scroll"><table class="campaign-table campaign-table-campaigns"><thead><tr>' +
          sortableTh("Campaign", "campaign", state, "campaigns") +
          sortableTh("Platform", "platform", state, "campaigns") +
          sortableTh("Spend", "spend", state, "campaigns") +
          sortableTh("Impr.", "impressions", state, "campaigns") +
          sortableTh("Clicks", "clicks", state, "campaigns") +
          sortableTh("CTR", "ctrPct", state, "campaigns") +
          sortableTh("CPC", "platformCpc", state, "campaigns") +
          sortableTh("CPM", "platformCpm", state, "campaigns") +
          sortableTh("Matched product", "product", state, "campaigns") +
        '</tr></thead><tbody></tbody></table></div>' +
        '<div class="campaign-pager-container" data-pager-prefix="campaigns"></div>' +
      '</div>' +
    '</section>';

    mount._campaignDelegatedContext = {
      data: data,
      ctx: ctx,
      state: state,
      activeIntel: activeIntel
    };
    if (!mount._campaignDelegatedBound) {
      mount._campaignDelegatedBound = true;
      mount.addEventListener("click", function (event) {
        var delegated = mount._campaignDelegatedContext;
        if (!delegated) return;
        var currentState = delegated.state;
        var target = event.target && event.target.closest ? event.target.closest("button,[data-campaign-platform],[data-sort-key]") : null;
        if (!target || !mount.contains(target)) return;

        var platformButton = target.closest("[data-campaign-platform]");
        if (platformButton) {
          mount._campaignPlatform = platformButton.getAttribute("data-campaign-platform") || "all";
          currentState.objectiveFilter = "all";
          currentState.matchFilter = "all";
          currentState.campaignPage = 1;
          currentState.productPage = 1;
          renderSectionCampaigns(mount, delegated.data, delegated.ctx);
          return;
        }

        var sortButton = target.closest("[data-sort-key]");
        if (sortButton) {
          var mode = sortButton.getAttribute("data-sort-mode") || "campaigns";
          var key = sortButton.getAttribute("data-sort-key") || "spend";
          if (mode === "products") {
            currentState.productSortDir = currentState.productSortKey === key && currentState.productSortDir === "desc" ? "asc" : "desc";
            currentState.productSortKey = key;
            currentState.productPage = 1;
          } else {
            currentState.sortDir = currentState.sortKey === key && currentState.sortDir === "desc" ? "asc" : "desc";
            currentState.sortKey = key;
            currentState.campaignPage = 1;
          }
          scheduleCampaignsUIUpdate(mount, delegated.data, delegated.ctx, currentState, delegated.activeIntel(), { busy: mode === "products" ? { products: true, campaigns: false } : { products: false, campaigns: true } });
          return;
        }

        var pageButton = target.closest(".campaign-products-page,.campaign-campaigns-page,.campaign-products-prev,.campaign-products-next,.campaign-campaigns-prev,.campaign-campaigns-next");
        if (pageButton && !pageButton.disabled) {
          if (pageButton.classList.contains("campaign-products-page")) currentState.productPage = Number(pageButton.getAttribute("data-page")) || 1;
          else if (pageButton.classList.contains("campaign-products-prev")) currentState.productPage = Math.max(1, currentState.productPage - 1);
          else if (pageButton.classList.contains("campaign-products-next")) currentState.productPage += 1;
          else if (pageButton.classList.contains("campaign-campaigns-page")) currentState.campaignPage = Number(pageButton.getAttribute("data-page")) || 1;
          else if (pageButton.classList.contains("campaign-campaigns-prev")) currentState.campaignPage = Math.max(1, currentState.campaignPage - 1);
          else if (pageButton.classList.contains("campaign-campaigns-next")) currentState.campaignPage += 1;
          scheduleCampaignsUIUpdate(mount, delegated.data, delegated.ctx, currentState, delegated.activeIntel(), {
            busy: (pageButton.classList.contains("campaign-products-page") || pageButton.classList.contains("campaign-products-prev") || pageButton.classList.contains("campaign-products-next"))
              ? { products: true, campaigns: false }
              : { products: false, campaigns: true }
          });
          return;
        }

        if (target.closest("[data-campaign-ai-review]")) {
          if (mount._campaignBackendActive && window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.query === "function") {
            window.DashboardQueryRuntime.query("campaign-ai-context", backendCampaignParams(mount, delegated.data, currentState), delegated.data).then(function (result) {
              if (result && result.ok) openCampaignActionReview(result);
              else openCampaignActionReview(campaignAiContext(delegated.activeIntel()));
            }).catch(function () { openCampaignActionReview(campaignAiContext(delegated.activeIntel())); });
            return;
          }
          openCampaignActionReview(campaignAiContext(delegated.activeIntel()));
        }
      });

      mount.addEventListener("input", function (event) {
        var delegated = mount._campaignDelegatedContext;
        if (!delegated) return;
        var target = event.target;
        if (target.matches("[data-campaign-search]")) {
          delegated.state.search = target.value || "";
          delegated.state.campaignPage = 1;
          scheduleCampaignsUIUpdate(mount, delegated.data, delegated.ctx, delegated.state, delegated.activeIntel(), { delay: 160, busy: { products: false, campaigns: true } });
        } else if (target.matches("[data-product-search]")) {
          delegated.state.productSearch = target.value || "";
          delegated.state.productPage = 1;
          scheduleCampaignsUIUpdate(mount, delegated.data, delegated.ctx, delegated.state, delegated.activeIntel(), { delay: 160, busy: { products: true, campaigns: false } });
        } else {
          return;
        }
      });

      mount.addEventListener("change", function (event) {
        var delegated = mount._campaignDelegatedContext;
        if (!delegated) return;
        var target = event.target;
        if (target.matches("[data-campaign-page-size]")) {
          delegated.state.pageSize = Number(target.value) || 10;
          delegated.state.campaignPage = 1;
          delegated.state.productPage = 1;
        } else if (target.matches("[data-campaign-match-filter]")) {
          delegated.state.matchFilter = target.value || "all";
          delegated.state.campaignPage = 1;
        } else if (target.matches(".campaign-currency-native")) {
          setCampaignProductCurrency(mount, delegated.data, delegated.ctx, target.value);
          return;
        } else {
          return;
        }
        scheduleCampaignsUIUpdate(mount, delegated.data, delegated.ctx, delegated.state, delegated.activeIntel(), { busy: { products: true, campaigns: true } });
      });
    }
    bindCampaignCurrencySelect(mount, data, ctx);

    mount._campaignRenderToken = Number(mount._campaignRenderToken || 0) + 1;
    updateCampaignsUIOnly(mount, data, ctx, state, activeIntel(), { backendReady: !!activeIntel()._backend });
  }

  function buildCampaignIntelSnapshot(mount, data, ctx) {
    data = data || window.dashboardGeoData || {};
    ctx = ctx || {};
    var state = defaultState(mount);
    var accountId = campaignAccountId(data);
    var selectedPlatform = mount && mount._campaignPlatform || "all";
    var selectedState = stateForPlatform(accountId, selectedPlatform);
    var syncStamp = selectedState && (selectedState.lastSyncAt || selectedState.summary && selectedState.summary.lastSyncAt) || "";
    var roiSettings = campaignRoiSettings(accountId, data);
    var reportingCurrency = currentCampaignCurrency(accountId, data);
    var egpRate = Number(roiSettings.egpRate || data.roi && data.roi.egpRate || 52) || 52;
    var sharedCacheKey = campaignIntelCacheKey(data, accountId, selectedPlatform, syncStamp, reportingCurrency, egpRate);
    
    var expectedMode = window.isExpectedNdrMode && window.isExpectedNdrMode();
    var cacheHit = (
      mount._cachedPlatform === selectedPlatform &&
      mount._cachedAccountId === accountId &&
      mount._cachedSyncStamp === syncStamp &&
      mount._cachedReportingCurrency === reportingCurrency &&
      mount._cachedEgpRate === egpRate &&
      mount._cachedExpectedNdrMode === expectedMode &&
      mount._cachedIntel
    );
    
    var intel;
    if (cacheHit) {
      intel = mount._cachedIntel;
    } else if (campaignIntelCache.has(sharedCacheKey)) {
      intel = campaignIntelCache.get(sharedCacheKey);
    } else {
      var intelligence = window.TaagerCampaignIntelligence || window.KhodCampaignIntelligence;
      intel = intelligence && typeof intelligence.build === "function"
        ? intelligence.build({
          data: data,
          marketingState: selectedPlatform === "all" ? null : Object.assign({ platform: selectedPlatform }, selectedState || {}),
          platform: selectedPlatform
        })
        : null;
      intel = intel || {
        totals: {},
        objectiveMix: [],
        allProductGroups: [],
        allCampaigns: [],
        creativeSummary: {},
        sourceOfTruth: "Taager dashboard orders only."
      };
      
      if (expectedMode) {
        var globalExpectedNdrRate = (data && data.roi && data.roi.ndrPct != null) ? (data.roi.ndrPct / 100) : 0;
        
        var totalSpend = 0;
        var totalOrders = 0;
        var totalDelivered = 0;
        var totalProfit = 0;
        var totalSalesSum = 0;
        
        var productGroups = intel.allProductGroups || [];
        productGroups.forEach(function (group) {
          var productInList = data && data.products && data.products.rankedList && data.products.rankedList.find(function (p) {
            return String(p.sku || '').toLowerCase() === String(group.sku || '').toLowerCase();
          });
          var expectedNdrRate = productInList
            ? (productInList.expectedNdrRate != null ? Number(productInList.expectedNdrRate) : productInList.ndrPct / 100)
            : globalExpectedNdrRate;
          
          var oldDelivered = group.actualDeliveredCount != null ? group.actualDeliveredCount : group.taagerDelivered;
          var oldProfit = group.actualCommission != null ? group.actualCommission : group.taagerProfit;
          var oldSales = group.totalSales != null ? group.totalSales : (group.deliveredSales || 0);
          var projection = window.TaagerDashboardFinancialCore.calculate({
            mode: 'expected',
            netOrders: group.taagerOrders,
            actualDeliveredOrders: oldDelivered,
            actualEarnedProfitAfterTax: oldProfit,
            currentTotalSales: oldSales,
            expectedNdrRate: expectedNdrRate,
            adSpend: group.spend || 0
          });
          group.actualDeliveredCount = oldDelivered;
          group.actualCommission = oldProfit;
          group.expectedDeliveriesExact = projection.expectedDeliveriesExact;
          group.taagerDelivered = projection.expectedDeliveriesDisplay;
          group.taagerNdrPct = expectedNdrRate * 100;
          group.avgDeliveredProfit = projection.averageProfit;
          group.taagerProfit = projection.expectedTotalProfitBeforeAdSpend;
          group.netProfit = projection.expectedNetProfit;
          group.roiPct = projection.expectedRoi;
          group.profitRoas = projection.expectedProfitRoas;
          group.deliveredCpa = projection.expectedDeliveredCpa;
          group.totalSales = projection.expectedDeliveredSales;
          group.deliveredSales = group.totalSales;
          group.totalSalesRoas = projection.expectedSalesRoas;
          
          totalSpend += (group.spend || 0);
          totalOrders += (group.taagerOrders || 0);
          totalDelivered += group.expectedDeliveriesExact;
          totalProfit += group.taagerProfit;
          totalSalesSum += (group.totalSales || 0);
        });
        
        if (intel.totals) {
          intel.totals.expectedDeliveriesExact = totalDelivered;
          intel.totals.taagerDelivered = Math.round(totalDelivered);
          intel.totals.taagerProfit = totalProfit;
          intel.totals.netProfit = totalProfit - (intel.totals.spend || totalSpend);
          intel.totals.roiPct = (intel.totals.spend || totalSpend) > 0 ? (intel.totals.netProfit / (intel.totals.spend || totalSpend) * 100) : 0;
          intel.totals.profitRoas = (intel.totals.spend || totalSpend) > 0 ? (intel.totals.taagerProfit / (intel.totals.spend || totalSpend)) : 0;
          intel.totals.deliveredCpa = totalDelivered > 0 ? ((intel.totals.spend || totalSpend) / totalDelivered) : 0;
          intel.totals.taagerNdrPct = totalOrders > 0 ? (totalDelivered / totalOrders * 100) : (globalExpectedNdrRate * 100);
          intel.totals.totalSales = totalSalesSum;
          intel.totals.deliveredSales = totalSalesSum;
          intel.totals.totalSalesRoas = (intel.totals.spend || totalSpend) > 0 ? (totalSalesSum / (intel.totals.spend || totalSpend)) : 0;
        }
      }
      
      rememberCampaignIntel(sharedCacheKey, intel);
    }

    mount._cachedData = data;
    mount._cachedPlatform = selectedPlatform;
    mount._cachedAccountId = accountId;
    mount._cachedSyncStamp = syncStamp;
    mount._cachedReportingCurrency = reportingCurrency;
    mount._cachedEgpRate = egpRate;
    mount._cachedExpectedNdrMode = expectedMode;
    mount._cachedIntel = intel;
    mount._campaignIntel = intel;

    return {
      state: state,
      intel: intel,
      accountId: accountId,
      selectedPlatform: selectedPlatform,
      syncStamp: syncStamp,
      reportingCurrency: reportingCurrency,
      egpRate: egpRate,
      cacheKey: sharedCacheKey
    };
  }

  function refreshCampaignCurrencyUIOnly(mount, data, ctx) {
    if (!mount || mount.isConnected === false) return;
    var snapshot = buildCampaignIntelSnapshot(mount, data, ctx);
    var intel = snapshot.intel;
    var state = snapshot.state;

    var kpis = mount.querySelector(".campaign-kpis");
    if (kpis) kpis.innerHTML = renderCampaignKpis(intel);

    var syncTime = mount.querySelector(".campaign-sync-time");
    if (syncTime) {
      syncTime.textContent = "Synced at " + formatSyncTime(intel.lastSyncAt);
    }

    bindCampaignCurrencySelect(mount, data, ctx);
    updateCampaignsUIOnly(mount, data, ctx, state, intel, { skipCampaignRows: true });

    if (window.dashboardI18n && typeof window.dashboardI18n.apply === "function") {
      window.dashboardI18n.apply(mount);
    }
    if (window.TaagerUI && typeof window.TaagerUI.enhance === "function") {
      window.TaagerUI.enhance(mount);
    }
  }

  function renderSectionCampaigns(mount, data, ctx) {
    var snapshot = buildCampaignIntelSnapshot(mount, data, ctx);
    data = data || window.dashboardGeoData || {};
    ctx = ctx || {};
    var state = snapshot.state;
    var intel = snapshot.intel;
    var accountId = snapshot.accountId;
    mount._campaignLegacyIntel = intel;
    
    renderMainCampaignsUI(mount, data, ctx, state, intel);

    if (window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.flags === "function") {
      window.DashboardQueryRuntime.flags().then(function (flags) {
        mount._campaignBackendEnabled = !!(flags && flags.campaigns);
        if (mount._campaignBackendEnabled && mount.isConnected !== false) {
          scheduleCampaignsUIUpdate(mount, data, ctx, state, mount._campaignIntel || mount._campaignLegacyIntel || intel, { fullRender: true, busy: { products: true, campaigns: true } });
        }
      });
    }

    if (window.DashboardRoiState && typeof window.DashboardRoiState.subscribe === "function") {
      if (mount._campaignRoiListener) {
        window.DashboardRoiState.unsubscribe(mount._campaignRoiListener);
      }
      if (mount._campaignRoiObserver) {
        mount._campaignRoiObserver.disconnect();
      }
      mount._campaignRoiListener = function (settings) {
        if (String(settings && settings.accountId || "__all__") !== String(accountId || "__all__")) return;
        if (mount.hidden) {
          mount._dashboardNeedsRefresh = true;
          return;
        }
        mount._cachedIntel = null;
        if (mount._campaignBackendActive || mount._campaignBackendEnabled) {
          requestBackendCampaigns(mount, data, ctx, state, true);
          return;
        }
        if (mount.isConnected !== false) {
          refreshCampaignCurrencyUIOnly(mount, data, ctx);
        }
      };
      window.DashboardRoiState.subscribe(mount._campaignRoiListener);
      mount._campaignRoiObserver = new MutationObserver(function () {
        if (!document.body.contains(mount)) {
          window.DashboardRoiState.unsubscribe(mount._campaignRoiListener);
          mount._campaignRoiListener = null;
          mount._campaignRoiObserver.disconnect();
          mount._campaignRoiObserver = null;
        }
      });
      if (mount.parentNode) mount._campaignRoiObserver.observe(mount.parentNode, { childList: true });
    }

    return function cleanupCampaigns() {
      clearScheduledCampaignUpdate(mount);
      if (mount._campaignRoiListener && window.DashboardRoiState) {
        window.DashboardRoiState.unsubscribe(mount._campaignRoiListener);
        mount._campaignRoiListener = null;
      }
      if (mount._campaignRoiObserver) {
        mount._campaignRoiObserver.disconnect();
        mount._campaignRoiObserver = null;
      }
    };
  }

  window.renderSectionCampaigns = renderSectionCampaigns;
})();
