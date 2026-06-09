(function () {
  "use strict";

  var PLATFORMS = ["tiktok", "snapchat", "facebook"];
  var CAP = 20;
  var BUILD_CACHE = [];

  function parseNumber(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    var cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
    var n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function num(value, digits) {
    var n = parseNumber(value);
    if (digits == null) return n;
    return Number(n.toFixed(digits));
  }

  function textKey(value) {
    var arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    return String(value || "").toLowerCase().normalize("NFKC")
      .replace(/[٠-٩]/g, function (digit) { return String(arabicDigits.indexOf(digit)); })
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
      .replace(/\u0640/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/[ىئ]/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/[ةه]/g, "ه")
      .replace(/[^\w\u0600-\u06ff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasTerm(text, term) {
    return !!term && (" " + text + " ").indexOf(" " + term + " ") !== -1;
  }

  function productTokens(name) {
    var stop = {
      ad: true, ads: true, campaign: true, sales: true, sale: true, lead: true, leads: true,
      tiktok: true, tik: true, tok: true, snapchat: true, snap: true, facebook: true, meta: true,
      ksa: true, saudi: true, offer: true, new: true, test: true, original: true, product: true,
      "منتج": true, "عرض": true, "جديد": true, "اصلي": true, "حمله": true, "حملة": true
    };
    return textKey(name).split(" ").filter(function (token) {
      return token.length >= 3 && !stop[token] && !/^x\d+$/i.test(token) && !/^\d+$/.test(token);
    });
  }

  function productPhrases(tokens) {
    var phrases = [];
    for (var size = 2; size <= Math.min(3, tokens.length); size += 1) {
      for (var start = 0; start <= tokens.length - size; start += 1) {
        phrases.push(tokens.slice(start, start + size).join(" "));
      }
    }
    return phrases;
  }

  function cleanProductName(name) {
    if (!name) return "";
    var clean = String(name);
    clean = clean.replace(/\s*[\(\[\{]?\d+\s*x[\)\]\}]?\s*$/i, "");
    clean = clean.replace(/\s*[\(\[\{]?x\s*\d+[\)\]\}]?\s*$/i, "");
    clean = clean.replace(/^\s*([.\-ـ|#\s]+)/, "");
    clean = clean.replace(/([.\-ـ|#\s]+)$/, "");
    return clean.trim();
  }

  function groupProductsByName(products) {
    var groups = {};
    products.forEach(function (p) {
      if (!p) return;
      var rawName = p.name || p.key || "";
      var cleanName = cleanProductName(rawName);
      var key = textKey(cleanName) || rawName;
      
      if (!groups[key]) {
        groups[key] = {
          name: cleanName || rawName,
          key: key,
          skus: [],
          placedCount: 0,
          deliveredCount: 0,
          canceledCount: 0,
          cancelStatusCount: 0,
          statusTotalCount: 0,
          failedCount: 0,
          confirmedCount: 0,
          confirmationStatusCount: 0,
          shippingCount: 0,
          processingCount: 0,
          waitingCount: 0,
          pendingCount: 0,
          revenue: 0,
          commission: 0,
          deliveredSales: 0,
          qty: 0,
          units: 0,
          pieces: 0,
          cityMap: {}
        };
      }
      
      var g = groups[key];
      
      var skuStr = p.sku || p.sku_code || p.skuCode || "";
      skuStr.split(",").forEach(function (s) {
        var cleanSku = s.trim();
        if (cleanSku && g.skus.indexOf(cleanSku) === -1) {
          g.skus.push(cleanSku);
        }
      });
      
      g.placedCount += num(p.placedCount || p.orders);
      g.deliveredCount += num(p.deliveredCount || p.units || p.delivered);
      g.canceledCount += num(p.canceledCount || 0);
      g.cancelStatusCount += num(p.cancelStatusCount || p.canceledCount || 0);
      g.statusTotalCount += num(p.statusTotalCount || p.placedCount || p.orders || 0);
      g.failedCount += num(p.failedCount || p.realFailedCount || 0);
      g.confirmedCount += num(p.confirmedCount || 0);
      g.confirmationStatusCount += num(p.confirmationStatusCount || p.confirmedCount || 0);
      g.shippingCount += num(p.shippingCount || 0);
      g.processingCount += num(p.processingCount || 0);
      g.waitingCount += num(p.waitingCount || 0);
      g.pendingCount += num(p.pendingCount || 0);
      g.revenue += num(p.revenue || 0);
      g.commission += num(p.commission || 0);
      g.deliveredSales += num(p.deliveredSales || p.sales || 0);
      g.qty += num(p.qty || p.totalPieces || 0);
      g.units += num(p.units || 0);
      g.pieces += num(p.pieces || 0);
      
      var cities = p.cityBreakdown || [];
      cities.forEach(function (c) {
        var cityName = c.name || c.city || "";
        if (!cityName) return;
        if (!g.cityMap[cityName]) {
          g.cityMap[cityName] = {
            name: cityName,
            count: 0,
            delivered: 0,
            canceled: 0,
            commission: 0,
            revenue: 0
          };
        }
        var gc = g.cityMap[cityName];
        gc.count += num(c.count || c.orders);
        gc.delivered += num(c.delivered || 0);
        gc.canceled += num(c.canceled || 0);
        gc.commission += num(c.commission || 0);
        gc.revenue += num(c.revenue || 0);
      });
    });
    
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      
      var cityBreakdown = Object.keys(g.cityMap).map(function (cityName) {
        var c = g.cityMap[cityName];
        var total = c.count;
        var ndr = total > 0 ? parseFloat(((c.delivered / total) * 100).toFixed(1)) : 0;
        return {
          name: c.name,
          city: c.name,
          count: c.count,
          orders: c.count,
          delivered: c.delivered,
          canceled: c.canceled,
          ndr: ndr,
          ndrPct: ndr,
          commission: c.commission,
          revenue: c.revenue
        };
      }).sort(function (a, b) { return b.count - a.count; });
      
      var placed = g.placedCount;
      var activeTotal = g.placedCount - g.pendingCount;
      var delivered = g.deliveredCount;
      
      var ndrPct = placed > 0 ? parseFloat(((delivered / placed) * 100).toFixed(1)) : 0;
      var drPct = activeTotal > 0 ? parseFloat(((delivered / activeTotal) * 100).toFixed(1)) : 0;
      var cancelPct = placed > 0 ? parseFloat((((g.cancelStatusCount || g.canceledCount) / placed) * 100).toFixed(1)) : 0;
      var confirmationPct = placed > 0 ? parseFloat(((g.confirmationStatusCount / placed) * 100).toFixed(1)) : 0;
      
      var deliveredAov = delivered > 0 ? parseFloat((g.deliveredSales / delivered).toFixed(2)) : 0;
      
      return {
        key: g.name,
        sku: g.skus.join(", "),
        name: g.name,
        units: g.deliveredCount,
        pieces: g.pieces || g.qty,
        placedCount: g.placedCount,
        qty: g.qty,
        revenue: g.revenue,
        commission: g.commission,
        deliveredSales: g.deliveredSales,
        deliveredAov: deliveredAov,
        deliveredCount: g.deliveredCount,
        deliveryRate: ndrPct,
        drRate: drPct,
        totalPieces: g.qty,
        canceledCount: g.canceledCount,
        failedCount: g.failedCount,
        confirmedCount: g.confirmedCount,
        confirmationStatusCount: g.confirmationStatusCount,
        shippingCount: g.shippingCount,
        processingCount: g.processingCount,
        waitingCount: g.waitingCount,
        pendingCount: g.pendingCount,
        confirmationPct: confirmationPct,
        cancelPct: cancelPct,
        ndrPct: ndrPct,
        deliveryPct: ndrPct,
        cityBreakdown: cityBreakdown
      };
    });
  }

  function validSkus(product) {
    var raw = product && (product.sku || product.sku_code || product.skuCode) || "";
    var skus = [];
    raw.split(/[\s,]+/).forEach(function (part) {
      var sku = textKey(part);
      if (!sku || sku === "n a" || sku === "na") return;
      if (sku.length >= 2) {
        if (skus.indexOf(sku) === -1) {
          skus.push(sku);
        }
      }
    });
    return skus;
  }

  function campaignName(row) {
    return String(row && (row.campaign || row.campaignName || row.name || row.campaign_name) || "Unnamed campaign");
  }

  function campaignId(row) {
    return String(row && (row.campaign_id || row.campaignId || row.campaignid || row.id) || "");
  }

  function platformOf(row, fallback) {
    return String(row && (row.platform || row.source || row.channel) || fallback || "unknown").toLowerCase();
  }

  function objectiveOf(row) {
    var raw = textKey((row && (
      row.campaign_objective ||
      row.campaignObjective ||
      row.objective ||
      row.optimization_goal ||
      row.optimizationGoal ||
      row.adsset_optimization_goal ||
      row.buyingType ||
      row.buying_type
    )) || "");
    var name = textKey(campaignName(row));
    var value = raw + " " + name;
    if (/website\s+leads?|lead\s+on\s+website|web\s+lead/.test(value) || hasTerm(value, "leads") || hasTerm(value, "lead")) {
      return "website_leads";
    }
    if (hasTerm(value, "sales") || hasTerm(value, "sale") || hasTerm(value, "purchase") || hasTerm(value, "conversions")) {
      return "sales";
    }
    return raw || "unknown";
  }

  function statusOf(row) {
    return String(row && (
      row.campaign_status ||
      row.campaign_effective_status ||
      row.effective_status ||
      row.status ||
      row.effectiveStatus ||
      row.campaignStatus
    ) || "unknown").toLowerCase();
  }

  function campaignSpendToReporting(row, fallbackCurrency, targetCurrency, egpRate) {
    var amount = parseNumber(row && (
      row.rawSpend != null ? row.rawSpend :
      row.spend != null ? row.spend :
      row.adSpend != null ? row.adSpend :
      row.cost != null ? row.cost :
      row.amount_spent
    ) || 0);
    var currency = String(row && row.currency || fallbackCurrency || "SAR").toUpperCase();
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === "function") {
      return window.TaagerCurrency.convert(amount, currency, targetCurrency || window.dashboardActiveCurrency || "SAR");
    }
    return convertReportingMoney(amount, currency, targetCurrency || window.dashboardActiveCurrency || "SAR", egpRate);
  }

  function convertReportingMoney(value, fromCurrency, targetCurrency, egpRate) {
    var amount = parseNumber(value);
    var source = String(fromCurrency || window.dashboardActiveCurrency || "SAR").toUpperCase();
    var target = String(targetCurrency || window.dashboardActiveCurrency || source || "SAR").toUpperCase();
    if (source === target) return amount;
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === "function") {
      return window.TaagerCurrency.convert(amount, source, target);
    }
    var egp = Number(egpRate) || 52;
    var sar = amount;
    if (source === "USD") sar = amount * 3.75;
    else if (source === "EGP") sar = (amount / egp) * 3.75;
    else if (source !== "SAR") return amount;
    if (target === "SAR") return sar;
    if (target === "USD") return sar / 3.75;
    if (target === "EGP") return (sar / 3.75) * egp;
    return amount;
  }

  function metric(row, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = row && row[keys[i]];
      if (value != null && value !== "") return num(value, 4);
    }
    return 0;
  }

  function fallbackMetric(row, keys) {
    var available = false;
    for (var i = 0; i < keys.length; i += 1) {
      var value = row && row[keys[i]];
      if (value == null || value === "") continue;
      available = true;
      value = num(value, 4);
      if (value > 0) return { value: value, available: true };
    }
    return { value: 0, available: available };
  }

  function trafficViewMetrics(row) {
    var landing = fallbackMetric(row, ["landingPageViews", "landing_page_views", "actions_landing_page_view", "total_landing_page_view", "total_pageview", "conversion_page_views"]);
    var content = fallbackMetric(row, ["contentViews", "content_views", "actions_offsite_conversion_fb_pixel_view_content", "actions_view_content", "actions_omni_view_content", "page_content_view_events", "conversion_view_content"]);
    var landingPageViews = landing.value;
    var contentViews = content.value;
    return {
      landingPageViews: landingPageViews,
      contentViews: contentViews,
      trafficViews: landingPageViews > 0 ? landingPageViews : contentViews,
      trafficViewAvailable: row && row.trafficViewAvailable != null
        ? row.trafficViewAvailable === true
        : landing.available || content.available
    };
  }

  function rowCurrency(row, state) {
    return String(row && (row.currency || row.account_currency) || (state && state.currency) || "SAR").toUpperCase();
  }

  function campaignPerformance(row, spend, fallbackCurrency) {
    var rawCurrency = fallbackCurrency || "SAR";
    var rawSpend = metric(row, ["rawSpend", "spend", "adSpend", "cost", "amount_spent"]);
    var impressions = metric(row, ["impressions", "reach"]);
    var clicks = metric(row, ["clicks", "link_clicks", "outbound_clicks_outbound_click", "unique_clicks"]);
    var views = trafficViewMetrics(row);
    var ctr = metric(row, ["ctr", "website_ctr_link_click", "unique_ctr", "unique_link_clicks_ctr", "outbound_clicks_ctr_outbound_click"]);
    var cpc = metric(row, ["cpc", "cost_per_link_click", "cost_per_unique_click"]);
    var cpm = metric(row, ["cpm"]);
    if (!ctr && impressions > 0 && clicks > 0) ctr = (clicks / impressions) * 100;
    if (!cpc && clicks > 0 && rawSpend > 0) cpc = rawSpend / clicks;
    if (!cpm && impressions > 0) cpm = rawSpend / impressions * 1000;
    return {
      impressions: num(impressions),
      clicks: num(clicks),
      landingPageViews: num(views.landingPageViews),
      contentViews: num(views.contentViews),
      trafficViews: num(views.trafficViews),
      trafficViewAvailable: views.trafficViewAvailable,
      ctrPct: num(ctr, 2),
      cpc: clicks > 0 ? num(spend / clicks, 2) : 0,
      cpm: impressions > 0 ? num(spend / impressions * 1000, 2) : 0,
      platformCpc: num(cpc, 2),
      platformCpm: num(cpm, 2),
      platformCpcCurrency: rawCurrency,
      rawCurrency: rawCurrency,
      rawSpend: rawSpend
    };
  }

  function productSnapshot(product, reportingCurrency, egpRate) {
    var orders = num(product && (product.placedCount || product.orders));
    var delivered = num(product && (product.deliveredCount || product.units || product.delivered));
    var sourceCurrency = String(product && product.currency || window.dashboardActiveCurrency || "SAR").toUpperCase();
    var targetCurrency = String(reportingCurrency || sourceCurrency || "SAR").toUpperCase();
    var commissionNative = num(product && product.commission, 2);
    var commission = num(convertReportingMoney(commissionNative, sourceCurrency, targetCurrency, egpRate), 2);
    var avgCommissionNative = delivered > 0 ? commissionNative / delivered : 0;
    var avgCommission = delivered > 0 ? commission / delivered : 0;
    var ndr = num(product && (product.ndrPct || product.deliveryRate || product.deliveryPct));
    var dr = num(product && (product.drRate || product.deliveryPct));
    var breakEvenNative = avgCommissionNative * (ndr / 100);
    var breakEven = avgCommission * (ndr / 100);
    var deliveredSalesNative = num(product && (product.deliveredSales || product.sales || 0), 2);
    var deliveredSales = num(convertReportingMoney(deliveredSalesNative, sourceCurrency, targetCurrency, egpRate), 2);
    var totalSalesNative = num(product && (product.totalSales || product.revenue || product.sales || product.deliveredSales || 0), 2);
    var totalSales = num(convertReportingMoney(totalSalesNative, sourceCurrency, targetCurrency, egpRate), 2);
    return {
      id: String(product && (product.key || product.sku || product.name) || ""),
      accountId: String(product && product.accountId || ""),
      country: String(product && product.country || ""),
      currency: targetCurrency,
      nativeCurrency: sourceCurrency,
      name: String(product && (product.name || product.key || product.sku) || "Unknown product"),
      sku: String(product && product.sku || ""),
      orders: orders,
      delivered: delivered,
      ndrPct: num(ndr, 1),
      drPct: num(dr, 1),
      cancelPct: num(product && product.cancelPct, 1),
      deliveredSales: deliveredSales,
      deliveredSalesNative: deliveredSalesNative,
      totalSales: totalSales,
      totalSalesNative: totalSalesNative,
      commission: commission,
      commissionNative: commissionNative,
      deliveredAov: delivered > 0 ? num(deliveredSales / delivered, 2) : 0,
      breakEvenCpaSar: num(convertReportingMoney(breakEvenNative, sourceCurrency, "SAR", egpRate), 2),
      breakEvenCpaNative: num(breakEvenNative, 2),
      breakEvenCpa: num(breakEven, 2),
      topCities: (product && Array.isArray(product.cityBreakdown) ? product.cityBreakdown : []).slice(0, 4).map(function (city) {
        return {
          city: city.name || city.city || "",
          orders: num(city.count || city.orders),
          ndrPct: num(city.ndr || city.ndrPct, 1)
        };
      })
    };
  }

  function productMatchIndex(products) {
    var entries = products.map(function (product, idx) {
      var tokens = productTokens(product.name || product.key || "");
      return {
        idx: idx,
        accountId: String(product.accountId || ""),
        country: String(product.country || ""),
        skus: validSkus(product),
        tokens: tokens,
        phrases: productPhrases(tokens)
      };
    });
    var tokenOwners = {};
    var phraseOwners = {};
    entries.forEach(function (entry) {
      entry.tokens.forEach(function (token) { tokenOwners[token] = (tokenOwners[token] || 0) + 1; });
      entry.phrases.forEach(function (phrase) { phraseOwners[phrase] = (phraseOwners[phrase] || 0) + 1; });
    });
    return { entries: entries, tokenOwners: tokenOwners, phraseOwners: phraseOwners };
  }

  function nameMatchScore(campaignText, spaceText, entry, index) {
    var hasAnyToken = entry.tokens.some(function (token) {
      return campaignText.indexOf(token) !== -1;
    });
    if (!hasAnyToken) return 0;

    var hits = entry.tokens.filter(function (token) { return spaceText.indexOf(" " + token + " ") !== -1; });
    var phraseHits = entry.phrases.filter(function (phrase) { return spaceText.indexOf(" " + phrase + " ") !== -1; });
    var uniqueWordHit = hits.some(function (token) { return token.length >= 4 && index.tokenOwners[token] === 1; });
    var uniquePhraseHit = phraseHits.some(function (phrase) { return index.phraseOwners[phrase] === 1; });
    if (hits.length < Math.min(2, entry.tokens.length) && !uniqueWordHit && !uniquePhraseHit) return 0;
    return hits.reduce(function (total, token) {
      return total + token.length + (index.tokenOwners[token] === 1 ? 6 : 0);
    }, 0) + phraseHits.reduce(function (total, phrase) {
      return total + phrase.length + (index.phraseOwners[phrase] === 1 ? 12 : 0);
    }, 0);
  }

  function matchCampaign(row, products, index, state) {
    var campaignText = textKey(campaignName(row));
    if (!campaignText) return null;
    var spaceText = " " + campaignText + " ";
    var rowAccountId = String(row && row.dashboardAccountId || state && state.accountId || "");
    if (rowAccountId === "__all__") rowAccountId = "";
    var rowCountry = String(row && row.country || state && state.country || "").toLowerCase();
    
    // Quick SKU match in single loop (no allocations and sorting)
    var bestSkuEntry = null;
    var bestMatchedSkuLength = 0;
    for (var i = 0; i < index.entries.length; i++) {
      var entry = index.entries[i];
      if (rowAccountId && entry.accountId && rowAccountId !== entry.accountId) continue;
      if (!rowAccountId && rowCountry && entry.country && rowCountry !== entry.country) continue;
      if (entry.skus && entry.skus.length > 0) {
        for (var j = 0; j < entry.skus.length; j++) {
          var s = entry.skus[j];
          if (campaignText.indexOf(s) !== -1 && spaceText.indexOf(" " + s + " ") !== -1) {
            if (!bestSkuEntry || s.length > bestMatchedSkuLength) {
              bestSkuEntry = entry;
              bestMatchedSkuLength = s.length;
            }
          }
        }
      }
    }
    if (bestSkuEntry) {
      return { product: products[bestSkuEntry.idx], idx: bestSkuEntry.idx, method: "sku", confidence: "high" };
    }
    
    return null;
  }

  function marketingStates(accountId, platform) {
    if (!window.DashboardMarketingState || typeof window.DashboardMarketingState.get !== "function") return [];
    var requested = platform && platform !== "all" ? [platform] : PLATFORMS;
    return requested.map(function (id) {
      var state = window.DashboardMarketingState.get(accountId || "__all__", id);
      return state ? Object.assign({ platform: id }, state) : null;
    }).filter(Boolean);
  }

  function rowsFromState(state) {
    var summary = state && state.summary ? state.summary : {};
    return Array.isArray(summary.campaignBreakdown) ? summary.campaignBreakdown : [];
  }

  function buildCacheKey(data, states, opts, accountId, rawProducts, currency) {
    var meta = data && data.meta || {};
    var stateKey = (states || []).map(function (state) {
      var summary = state && state.summary || {};
      return [
        state && state.platform || "",
        state && state.accountId || "",
        state && state.lastSyncAt || summary.lastSyncAt || "",
        summary.dateFrom || "",
        summary.dateTo || "",
        summary.rowCount || 0,
        summary.campaignCount || 0
      ].join(":");
    }).join("|");
    return [
      accountId,
      meta.activeCountry || "",
      opts.platform || "all",
      currency,
      opts.egpRate || "",
      JSON.stringify(meta.exchangeRates || {}),
      textKey(opts.productName || opts.product || ""),
      meta.lastUpdatedAt || meta.generatedAt || meta.periodLabel || "",
      rawProducts.length,
      stateKey
    ].join("::");
  }

  function cachedBuild(data, key) {
    for (var i = 0; i < BUILD_CACHE.length; i += 1) {
      if (BUILD_CACHE[i].data === data && BUILD_CACHE[i].key === key) return BUILD_CACHE[i].value;
    }
    return null;
  }

  function rememberBuild(data, key, value) {
    BUILD_CACHE.unshift({ data: data, key: key, value: value });
    if (BUILD_CACHE.length > 12) BUILD_CACHE.length = 12;
    return value;
  }

  function pushTop(list, item, limit) {
    list.push(item);
    if (list.length > (limit || CAP) * 4) list.length = (limit || CAP) * 4;
  }

  function build(opts) {
    opts = opts || {};
    var data = opts.data || window.dashboardGeoData || {};
    var meta = data.meta || {};
    var accountId = data.meta && data.meta.activeAccountId || (window.getActiveAccountId ? window.getActiveAccountId() : "__all__");
    var roi = data.roi || {};
    var roiSettings = window.DashboardRoiState && typeof window.DashboardRoiState.get === "function"
      ? window.DashboardRoiState.get(accountId, Object.assign({ currency: meta.activeCurrency || meta.reportingCurrency || window.dashboardActiveCurrency || "SAR" }, roi))
      : roi;
    var egpRate = Number(roiSettings.egpRate || roi.egpRate || 52) || 52;
    var reportingCurrency = String(roiSettings.currency || meta.activeCurrency || meta.reportingCurrency || window.dashboardActiveCurrency || "SAR").toUpperCase();
    var campaignProducts = data.products && Array.isArray(data.products.campaignList) ? data.products.campaignList : [];
    var rawProducts = campaignProducts.length
      ? campaignProducts
      : (data.products && Array.isArray(data.products.rankedList) ? data.products.rankedList : []);
    var products = campaignProducts.length ? rawProducts.slice() : groupProductsByName(rawProducts);
    var snapshots = products.map(function (product) {
      return productSnapshot(product, reportingCurrency, egpRate);
    });
    var index = productMatchIndex(products);
    var states = opts.marketingState ? [opts.marketingState] : marketingStates(accountId, opts.platform);
    var cacheKey = buildCacheKey(data, states, Object.assign({}, opts, { egpRate: egpRate }), accountId, rawProducts, reportingCurrency);
    var cached = cachedBuild(data, cacheKey);
    if (cached) return cached;
    var rows = [];
    var totals = {
      spend: 0,
      campaignCount: 0,
      rowCount: 0,
      matchedSpend: 0,
      unmatchedSpend: 0,
      spentCampaignCount: 0,
      zeroSpendRowsSkipped: 0,
      missingSkuCampaignCount: 0
    };
    var objectiveMap = {};
    var productGroups = {};
    var topSpendCampaigns = [];
    var worstCampaigns = [];
    var allCampaignSummaries = [];
    var allWorstCampaigns = [];
    var targetKey = textKey(opts.productName || opts.product || "");

    states.forEach(function (state) {
      var summary = state && state.summary || {};
      totals.campaignCount += num(summary.campaignCount);
      totals.rowCount += num(summary.rowCount);
      rowsFromState(state).forEach(function (row) {
        var stateAccountId = String(state.accountId || "");
        if (stateAccountId === "__all__") stateAccountId = "";
        rows.push({
          row: row,
          state: state,
          dashboardAccountId: String(stateAccountId || row.dashboardAccountId || (accountId === "__all__" ? "" : accountId) || "")
        });
      });
    });

    rows.forEach(function (entry) {
      var row = entry.row;
      var platform = platformOf(row, entry.state && entry.state.platform);
      var currency = rowCurrency(row, entry.state);
      var spend = campaignSpendToReporting(row, currency, reportingCurrency, egpRate);
      if (spend <= 0) {
        totals.zeroSpendRowsSkipped += 1;
        return;
      }
      var objective = objectiveOf(row);
      var scopedRow = Object.assign({}, row, { dashboardAccountId: entry.dashboardAccountId });
      var match = matchCampaign(scopedRow, products, index, entry.state);
      var isVerifiedSkuMatch = !!(match && match.method === "sku" && match.product);
      var product = isVerifiedSkuMatch ? snapshots[match.idx] : null;
      var taagerOrders = product ? product.orders : 0;
      var taagerCpa = product && taagerOrders > 0 ? spend / taagerOrders : 0;
      var performance = campaignPerformance(row, spend, currency);
      totals.spend += spend;
      totals.spentCampaignCount += 1;
      if (product) totals.matchedSpend += spend;
      else {
        totals.unmatchedSpend += spend;
        totals.missingSkuCampaignCount += 1;
      }
      if (!objectiveMap[objective]) objectiveMap[objective] = { objective: objective, spend: 0, campaignCount: 0 };
      objectiveMap[objective].spend += spend;
      objectiveMap[objective].campaignCount += 1;

      var campaign = {
        campaignId: campaignId(row),
        campaign: campaignName(row),
        dashboardAccountId: entry.dashboardAccountId,
        sourceAccountId: String(row.accountId || row.sourceAccountId || ""),
        sourceAccountName: String(row.accountName || row.sourceAccountName || ""),
        platform: platform,
        objective: objective,
        status: statusOf(row),
        currency: reportingCurrency,
        spend: num(spend, 2),
        spendSar: num(spend, 2),
        impressions: performance.impressions,
        clicks: performance.clicks,
        landingPageViews: performance.landingPageViews,
        contentViews: performance.contentViews,
        trafficViews: performance.trafficViews,
        ctrPct: performance.ctrPct,
        cpc: performance.cpc,
        cpcSar: performance.cpc,
        cpm: performance.cpm,
        cpmSar: performance.cpm,
        platformCpc: performance.platformCpc,
        platformCpm: performance.platformCpm,
        platformCpcCurrency: performance.platformCpcCurrency,
        rawCurrency: performance.rawCurrency,
        rawSpend: performance.rawSpend,
        product: product ? product.name : null,
        productSku: product ? product.sku : "",
        matchMethod: match ? match.method : "unmatched",
        matchConfidence: product ? match.confidence : "none",
        attributionVerified: !!product,
        taagerOrders: taagerOrders,
        taagerDelivered: product ? product.delivered : 0,
        taagerNdrPct: product ? product.ndrPct : 0,
        taagerCpa: num(taagerCpa, 2),
        khodOrders: taagerOrders,
        khodDelivered: product ? product.delivered : 0,
        khodNdrPct: product ? product.ndrPct : 0,
        estimatedCpaSar: num(taagerCpa, 2),
        note: product ? "Orders and delivery results come from the Taager dashboard." : "Unmatched spend; no Taager product attribution."
      };
      campaign.searchHaystack = textKey([
        campaign.campaign,
        campaign.campaignId,
        campaign.platform,
        campaign.objective,
        campaign.status,
        campaign.product || "",
        campaign.productSku || "",
        campaign.matchMethod,
        campaign.matchConfidence
      ].join(" "));
      allCampaignSummaries.push(campaign);
      pushTop(topSpendCampaigns, campaign);
      if (!product || taagerOrders <= 0 || (taagerCpa > 0 && product.breakEvenCpa > 0 && taagerCpa > product.breakEvenCpa)) {
        allWorstCampaigns.push(campaign);
        pushTop(worstCampaigns, campaign);
      }
      if (product) {
        var matchedProduct = product;
        var key = matchedProduct.id || matchedProduct.name;
        if (!productGroups[key]) {
          productGroups[key] = {
            id: key,
            accountId: matchedProduct.accountId,
            country: matchedProduct.country,
            currency: reportingCurrency,
            product: matchedProduct.name,
            sku: matchedProduct.sku,
            spend: 0,
            campaignCount: 0,
            taagerOrders: matchedProduct.orders,
            taagerDelivered: matchedProduct.delivered,
            taagerNdrPct: matchedProduct.ndrPct,
            taagerDrPct: matchedProduct.drPct,
            cancelPct: matchedProduct.cancelPct,
            deliveredSales: matchedProduct.deliveredSales,
            totalSales: matchedProduct.totalSales,
            deliveredAov: matchedProduct.deliveredAov,
            taagerProfit: matchedProduct.commission,
            breakEvenCpa: matchedProduct.breakEvenCpa,
            impressions: 0,
            clicks: 0,
            landingPageViews: 0,
            contentViews: 0,
            trafficViews: 0,
            trafficViewAvailable: false,
            objectives: {},
            cities: matchedProduct.topCities,
            matchConfidence: match.confidence
          };
        }
        productGroups[key].spend += spend;
        productGroups[key].campaignCount += 1;
        productGroups[key].impressions += performance.impressions;
        productGroups[key].clicks += performance.clicks;
        productGroups[key].landingPageViews += performance.landingPageViews;
        productGroups[key].contentViews += performance.contentViews;
        productGroups[key].trafficViews += performance.trafficViews;
        productGroups[key].trafficViewAvailable = productGroups[key].trafficViewAvailable || performance.trafficViewAvailable;
        productGroups[key].objectives[objective] = (productGroups[key].objectives[objective] || 0) + spend;
      }
    });

    var allProductGroups = Object.keys(productGroups).map(function (key) {
      var group = productGroups[key];
      var cpa = group.taagerOrders > 0 ? group.spend / group.taagerOrders : 0;
      var deliveredCpa = group.taagerDelivered > 0 ? group.spend / group.taagerDelivered : 0;
      var breakEven = group.breakEvenCpa || 0;
      var avgDeliveredProfit = group.taagerDelivered > 0 ? group.taagerProfit / group.taagerDelivered : 0;
      var trafficViews = group.trafficViews;
      var netProfit = group.taagerProfit - group.spend;
      var cpaUnsafe = breakEven > 0 && cpa > breakEven;
      var deliveredCpaUnsafe = avgDeliveredProfit > 0 && deliveredCpa > avgDeliveredProfit;
      var decisionMetadata = window.TaagerCampaignDecision && typeof window.TaagerCampaignDecision.evaluate === "function"
        ? window.TaagerCampaignDecision.evaluate({
          orders: group.taagerOrders,
          delivered: group.taagerDelivered,
          ndrPct: group.taagerNdrPct,
          cancelPct: group.cancelPct,
          cpa: cpa,
          breakEvenCpa: breakEven,
          deliveredCpa: deliveredCpa,
          avgDeliveredProfit: avgDeliveredProfit,
          netProfit: netProfit,
          campaignCount: group.campaignCount,
          periodLabel: data.meta && data.meta.periodLabel || "",
          cities: group.cities
        })
        : { decision: cpaUnsafe || deliveredCpaUnsafe ? "fix_first" : "watch", status: cpaUnsafe || deliveredCpaUnsafe ? "fix_first" : "watch" };
      var decision = decisionMetadata.decision;
      var res = Object.assign({}, group, {
        spend: num(group.spend, 2),
        spendSar: num(group.spend, 2),
        taagerCpa: num(cpa, 2),
        deliveredCpa: num(deliveredCpa, 2),
        avgDeliveredProfit: num(avgDeliveredProfit, 2),
        trafficViews: num(trafficViews),
        conversionRateAvailable: trafficViews > 0,
        realConversionRatePct: trafficViews > 0 ? num(group.taagerOrders / trafficViews * 100, 2) : 0,
        deliveredConversionRatePct: trafficViews > 0 ? num(group.taagerDelivered / trafficViews * 100, 2) : 0,
        cpc: group.clicks > 0 ? num(group.spend / group.clicks, 2) : 0,
        netProfit: num(netProfit, 2),
        roiPct: group.spend > 0 ? num(netProfit / group.spend * 100, 2) : 0,
        profitRoas: group.spend > 0 ? num(group.taagerProfit / group.spend, 2) : 0,
        totalSalesRoas: group.spend > 0 ? num(group.totalSales / group.spend, 2) : 0,
        deliveredSalesRoas: group.spend > 0 ? num(group.deliveredSales / group.spend, 2) : 0,
        khodOrders: group.taagerOrders,
        khodDelivered: group.taagerDelivered,
        khodNdrPct: group.taagerNdrPct,
        khodDrPct: group.taagerDrPct,
        estimatedCpaSar: num(cpa, 2),
        khodCpaSar: num(cpa, 2),
        deliveredCpaSar: num(deliveredCpa, 2),
        breakEvenCpaSar: num(breakEven, 2),
        commission: group.taagerProfit,
        netProfitSar: num(netProfit, 2),
        commissionRoas: group.spend > 0 ? num(group.taagerProfit / group.spend, 2) : 0,
        ctrPct: group.impressions > 0 ? num(group.clicks / group.impressions * 100, 2) : 0,
        cpcSar: group.clicks > 0 ? num(group.spend / group.clicks, 2) : 0,
        decision: decision,
        decisionMetadata: decisionMetadata,
        objectiveMix: Object.keys(group.objectives).map(function (objective) {
          return { objective: objective, spend: num(group.objectives[objective], 2), spendSar: num(group.objectives[objective], 2) };
        }).sort(function (a, b) { return b.spend - a.spend; })
      });
      res.searchHaystack = textKey([res.product || "", res.sku || "", res.accountId || "", res.country || ""].join(" "));
      return res;
    }).sort(function (a, b) {
      return (b.taagerOrders - a.taagerOrders) || (b.spend - a.spend);
    });
    var topProductGroups = allProductGroups.slice(0, CAP);

    topSpendCampaigns = topSpendCampaigns.sort(function (a, b) { return b.spend - a.spend; }).slice(0, CAP);
    worstCampaigns = worstCampaigns.sort(function (a, b) {
      if (!a.product && b.product) return -1;
      if (a.product && !b.product) return 1;
      return b.spend - a.spend;
    }).slice(0, CAP);

    var focus = null;
    if (targetKey) {
      focus = allProductGroups.find(function (group) {
        return textKey(group.product) === targetKey || textKey(group.sku) === targetKey || textKey(group.product).indexOf(targetKey) !== -1;
      }) || null;
    }
    if (targetKey) {
      if (focus) {
        topSpendCampaigns = allCampaignSummaries.filter(function (campaign) {
          return textKey(campaign.product || "") === textKey(focus.product);
        }).sort(function (a, b) {
          return b.spend - a.spend;
        }).slice(0, CAP);
        worstCampaigns = allWorstCampaigns.filter(function (campaign) {
          return textKey(campaign.product || "") === textKey(focus.product);
        }).sort(function (a, b) {
          return b.spend - a.spend;
        }).slice(0, CAP);
        topProductGroups = [focus];
      } else {
        topSpendCampaigns = [];
        worstCampaigns = [];
        topProductGroups = [];
      }
    }

    var fatigueCandidates = topSpendCampaigns.filter(function (campaign) {
      return campaign.product && campaign.taagerOrders > 0 && campaign.taagerCpa > 0 && campaign.taagerNdrPct < 30;
    }).slice(0, 8);

    var matchedProductTotals = allProductGroups.reduce(function (acc, group) {
      acc.taagerOrders += num(group.taagerOrders);
      acc.taagerDelivered += num(group.taagerDelivered);
      acc.taagerProfit += num(group.taagerProfit, 2);
      acc.deliveredSales += num(group.deliveredSales, 2);
      acc.spend += num(group.spend, 2);
      return acc;
    }, { taagerOrders: 0, taagerDelivered: 0, taagerProfit: 0, deliveredSales: 0, spend: 0 });
    var matchedNetProfit = matchedProductTotals.taagerProfit - matchedProductTotals.spend;
    var matchedSpendPct = totals.spend > 0 ? num(totals.matchedSpend / totals.spend * 100, 2) : 0;
    var unmatchedSpendPct = totals.spend > 0 ? num(totals.unmatchedSpend / totals.spend * 100, 2) : 0;
    var latestSyncAt = states.reduce(function (latest, state) {
      var value = state && (state.lastSyncAt || state.summary && state.summary.lastSyncAt) || "";
      if (!value) return latest;
      return !latest || new Date(value) > new Date(latest) ? value : latest;
    }, "");
    var result = {
      version: 3,
      currency: reportingCurrency,
      sourceOfTruth: "Product decisions use SKU-matched campaign spend with Taager orders, delivery, and profit. Campaign rows show ad-platform traffic only.",
      periodLabel: (states[0] && states[0].summary && (states[0].summary.dateFrom || states[0].summary.dateTo))
        ? [states[0].summary.dateFrom, states[0].summary.dateTo].filter(Boolean).join(" - ")
        : (data.meta && data.meta.periodLabel || "Last 30 days / synced dashboard period"),
      accountId: accountId,
      platform: opts.platform || "all",
      lastSyncAt: latestSyncAt,
      totals: {
        currency: reportingCurrency,
        spend: num(totals.spend, 2),
        matchedSpend: num(totals.matchedSpend, 2),
        unmatchedSpend: num(totals.unmatchedSpend, 2),
        matchedSpendPct: matchedSpendPct,
        unmatchedSpendPct: unmatchedSpendPct,
        taagerOrders: num(matchedProductTotals.taagerOrders),
        taagerDelivered: num(matchedProductTotals.taagerDelivered),
        taagerCpa: matchedProductTotals.taagerOrders > 0 ? num(matchedProductTotals.spend / matchedProductTotals.taagerOrders, 2) : 0,
        taagerProfit: num(matchedProductTotals.taagerProfit, 2),
        netProfit: num(matchedNetProfit, 2),
        roiPct: matchedProductTotals.spend > 0 ? num(matchedNetProfit / matchedProductTotals.spend * 100, 2) : 0,
        profitRoas: matchedProductTotals.spend > 0 ? num(matchedProductTotals.taagerProfit / matchedProductTotals.spend, 2) : 0,
        deliveredSalesRoas: matchedProductTotals.spend > 0 ? num(matchedProductTotals.deliveredSales / matchedProductTotals.spend, 2) : 0,
        campaignCount: totals.spentCampaignCount || allCampaignSummaries.length,
        sourceCampaignCount: totals.campaignCount || rows.length,
        rowCount: totals.rowCount || rows.length,
        zeroSpendRowsSkipped: totals.zeroSpendRowsSkipped,
        missingSkuCampaignCount: totals.missingSkuCampaignCount,
        adSpendSar: num(totals.spend, 2),
        matchedSpendSar: num(totals.matchedSpend, 2),
        unmatchedSpendSar: num(totals.unmatchedSpend, 2),
        khodOrders: num(matchedProductTotals.taagerOrders),
        khodDelivered: num(matchedProductTotals.taagerDelivered),
        khodCpaSar: matchedProductTotals.taagerOrders > 0 ? num(matchedProductTotals.spend / matchedProductTotals.taagerOrders, 2) : 0,
        netProfitSar: num(matchedNetProfit, 2),
        commissionRoas: matchedProductTotals.spend > 0 ? num(matchedProductTotals.taagerProfit / matchedProductTotals.spend, 2) : 0
      },
      objectiveMix: Object.keys(objectiveMap).map(function (key) {
        return {
          objective: key,
          spend: num(objectiveMap[key].spend, 2),
          spendSar: num(objectiveMap[key].spend, 2),
          campaignCount: objectiveMap[key].campaignCount
        };
      }).sort(function (a, b) { return b.spend - a.spend; }).slice(0, CAP),
      topSpendCampaigns: topSpendCampaigns,
      allCampaigns: allCampaignSummaries.sort(function (a, b) { return b.spend - a.spend; }),
      allProductGroups: allProductGroups,
      topProductGroups: topProductGroups,
      worstCampaigns: worstCampaigns,
      creativeSummary: {
        fatigueCandidates: fatigueCandidates,
        needsNewCreatives: fatigueCandidates.slice(0, 5).map(function (campaign) { return campaign.campaign; }),
        winners: topProductGroups.filter(function (group) { return group.decision === "scale"; }).slice(0, 5).map(function (group) { return group.product; })
      },
      productFocus: focus || (targetKey ? {
        product: opts.productName || opts.product || "",
        matched: false,
        note: "No confident campaign match for this product. Keep unmatched spend separate and do not invent attribution."
      } : null),
      caps: {
        topSpendCampaigns: CAP,
        topProductGroups: CAP,
        worstCampaigns: CAP,
        rawRowsSentToAi: 0
      }
    };
    return rememberBuild(data, cacheKey, result);
  }

  function playbook() {
    var recipes = {
      launch_test: {
        mode: "launch_test",
        name: "Launch test",
        objective: "sales or website_leads",
        structure: "Create one controlled test campaign with two focused ad groups: broad audience and best-city audience when city data exists.",
        creatives: "Use three creatives: UGC/demo, problem-solution hook, and offer/price hook.",
        budgetRule: "Start with a small daily test budget and do not scale for the first 24-48h.",
        killRule: "Stop weak ad groups when Taager orders are weak, CPA is above break-even, or NDR drops into the unsafe zone.",
        scaleRule: "Move to controlled scale only after Taager orders, NDR, DR, and CPA remain stable."
      },
      controlled_scale: {
        mode: "controlled_scale",
        name: "Controlled scale",
        objective: "sales",
        structure: "Protect the current winner and add one scale campaign or ad group for broad/best-city expansion.",
        creatives: "Keep proven creatives live and add two fresh variations around the winning hook.",
        budgetRule: "Increase budget gradually after 24-48h of stable Taager CPA, NDR, and delivered sales.",
        killRule: "Stop increases if CPA rises above break-even, NDR drops, or lost commission accelerates.",
        scaleRule: "Scale in steps only while Taager dashboard quality remains healthy."
      },
      creative_reset: {
        mode: "creative_reset",
        name: "Creative reset",
        objective: "sales or website_leads",
        structure: "Keep targeting simple and rebuild the test around new hooks before increasing spend.",
        creatives: "Produce UGC/demo, problem-solution, objection-handling, and city/product-specific creatives.",
        budgetRule: "Hold or reduce budget while testing new creative angles.",
        killRule: "Cut creatives with spend but weak Taager orders or unsafe NDR.",
        scaleRule: "Scale only the creative angle that improves Taager orders and CPA without hurting NDR."
      },
      city_focus: {
        mode: "city_focus",
        name: "City focus",
        objective: "sales",
        structure: "Use a best-city ad group and isolate weak cities from the scale budget.",
        creatives: "Use product creative with city-relevant delivery promise and offer framing.",
        budgetRule: "Shift test budget toward cities with strong Taager orders, NDR, DR, and commission.",
        killRule: "Exclude or isolate cities with order volume but weak delivery/COD quality.",
        scaleRule: "Expand cities only after their Taager delivery quality stays stable."
      },
      fix_before_scale: {
        mode: "fix_before_scale",
        name: "Fix before scale",
        objective: "sales or website_leads",
        structure: "Do not add scale campaigns yet; isolate the biggest leak first.",
        creatives: "Refresh product promise, confirmation script, and objection-handling creatives.",
        budgetRule: "Keep budget flat or reduced until the leak improves.",
        killRule: "Pause segments with CPA above break-even, low NDR, high cancellation, or weak delivered sales.",
        scaleRule: "Restart scaling only after the product/city passes Taager delivery and CPA guardrails."
      },
      pause_or_reduce: {
        mode: "pause_or_reduce",
        name: "Pause or reduce",
        objective: "none until fixed",
        structure: "Stop aggressive testing and keep only diagnostic traffic if needed.",
        creatives: "Do not produce more variants until the root issue is clear.",
        budgetRule: "Reduce or pause spend to protect margin.",
        killRule: "Pause when meaningful spend has weak Taager orders, unsafe NDR, or CPA above break-even.",
        scaleRule: "No scale until sample, delivery quality, and break-even CPA checks recover."
      }
    };
    return {
      version: 1,
      sourceOfTruth: "Use Taager orders, delivered orders, NDR, DR, delivered sales, Taager profit after tax, CPA, and break-even for decisions.",
      defaultObjectives: ["sales", "website_leads"],
      launch: "Start controlled tests. Judge by Taager orders, NDR, CPA vs break-even, city quality, and delivered sales.",
      scale: "Scale only products with enough Taager sample, healthy delivery, and CPA at or below break-even. Increase budgets gradually and protect winning cities.",
      fixFirst: "Before scaling, repair the biggest leak: creative fatigue, weak city mix, high CPA, low NDR, or low delivered AOV.",
      pause: "Pause or stop testing when spend is meaningful, Taager orders are weak, NDR is unsafe, or CPA is above break-even without a clear fix.",
      creativeRefresh: "When spend is high but Taager orders/NDR do not hold, produce new hooks, UGC/demo creatives, problem-solution angles, and city/product-specific variations.",
      cityScaling: "Push budget toward cities with strong Taager orders, NDR, DR, and commission. Exclude or isolate weak cities before scaling.",
      budgetSteps: "Use small budget steps first, then larger increases only after 24-48h of stable Taager CPA, NDR, and delivered sales.",
      strategyRecipes: recipes
    };
  }

  window.TaagerCampaignIntelligence = {
    build: build,
    playbook: playbook,
    textKey: textKey,
    campaignSpendToReporting: campaignSpendToReporting,
    campaignSpendToSar: function (row, fallbackCurrency, egpRate) {
      return campaignSpendToReporting(row, fallbackCurrency, window.dashboardActiveCurrency || "SAR", egpRate);
    }
  };
  window.KhodCampaignIntelligence = window.TaagerCampaignIntelligence;
})();
