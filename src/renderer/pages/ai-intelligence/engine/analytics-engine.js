(function () {
  "use strict";

  function num(value) { return Number(value || 0); }
  function pct(value) {
    var n = Number(value || 0);
    return n > 1 ? n : n * 100;
  }

  function readStoredRoi(data) {
    if (typeof window === "undefined" || !window.localStorage) return null;
    var meta = data && data.meta ? data.meta : {};
    var ids = [meta.activeAccountId || "__all__", "__all__"];
    for (var i = 0; i < ids.length; i += 1) {
      try {
        var raw = window.localStorage.getItem("khod_roi_settings_" + ids[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        var adSpend = num(parsed && parsed.adSpend);
        if (adSpend > 0) {
          return {
            adSpend: adSpend,
            currency: String(parsed.currency || "SAR").toUpperCase(),
            egpRate: num(parsed.egpRate || 52) || 52
          };
        }
      } catch (_) {}
    }
    return null;
  }

  function breakEvenCpaSar(avgCommissionSar, ndrPct) {
    return num(avgCommissionSar) * (pct(ndrPct) / 100);
  }

  function getAccountHealth(data) {
    const overview = data.overview || {};
    const geoKpis = (data.geo && data.geo.kpis) || {};
    const pipeline = data.pipeline && data.pipeline.metrics ? data.pipeline.metrics : {};
    
    // Sort products by profit or NDR
    const products = (data.products && data.products.rankedList) || [];
    const topProducts = products.slice().sort((a, b) => num(b.commission) - num(a.commission)).slice(0, 3);
    const worstProducts = products.slice().sort((a, b) => num(a.ndrPct || a.deliveryPct) - num(b.ndrPct || b.deliveryPct)).slice(0, 3);

    // Sort cities by earned commission
    const cityStats = (data.geo && data.geo.cityStats) || {};
    const cityArray = Object.keys(cityStats).map(name => Object.assign({ name: name }, cityStats[name]));
    const cityDeliveryRate = (city) => {
      const orders = num(city.count || city.orders || city.drBaseOrders);
      const delivered = num(city.deliveredOrders || city.deliveredCount);
      return pct(city.drPct != null ? city.drPct : (orders ? delivered / Math.max(1, orders) : 0));
    };
    const bestCities = cityArray.slice().sort((a, b) => num(b.earnedCommission) - num(a.earnedCommission)).slice(0, 3);
    const worstCities = cityArray.slice().sort((a, b) => cityDeliveryRate(a) - cityDeliveryRate(b)).slice(0, 3);

    const revenue = overview.earnedCommission ? num(overview.earnedCommission.value) : 0;
    const lostRev = overview.lostCommission ? num(overview.lostCommission.value) : 0;
    const deliveredSales = overview.totalDeliveredSales ? num(overview.totalDeliveredSales.value) : 0;
    const deliveredAov = overview.deliveredAov ? num(overview.deliveredAov.value) : 0;
    const profit = revenue; // Profit is technically commission in affiliate model

    return {
      metrics: {
        revenue: revenue,
        profit: profit,
        lostCommission: lostRev,
        deliveredSales: deliveredSales,
        deliveredAov: deliveredAov,
        ndr: pct(geoKpis.ndr || pipeline.deliveryRate || 0),
        deliveryRate: pct(geoKpis.dr || pipeline.deliveryRate || 0),
      },
      topWinningProducts: topProducts.map(p => ({ name: p.name, commission: num(p.commission), ndr: pct(p.ndrPct || p.deliveryPct) })),
      topLosingProducts: worstProducts.map(p => ({ name: p.name, commission: num(p.commission), ndr: pct(p.ndrPct || p.deliveryPct) })),
      bestCities: bestCities.map(c => ({
        name: c.name,
        commission: num(c.earnedCommission),
        deliveredSales: num(c.totalRevenue || c.deliveredSales || c.sales),
        deliveredAov: num(c.deliveredAov || (num(c.deliveredOrders) ? num(c.totalRevenue || c.deliveredSales || c.sales) / Math.max(1, num(c.deliveredOrders)) : 0))
      })),
      worstCities: worstCities.map(c => ({ name: c.name, dr: cityDeliveryRate(c) })),
      mainLossReason: revenue === 0 ? "Complete failure to deliver any orders resulting in 0 earned commission" : "Low delivery conversion is limiting realized sales and commission"
    };
  }

  function getProductAnalysis(data, productNames) {
    if (!data.products || !data.products.rankedList) return [];
    return data.products.rankedList
      .filter(p => productNames.includes(p.name) || productNames.includes(p.sku))
      .map(p => ({
        name: p.name,
        sku: p.sku,
        metrics: {
          orders: num(p.placedCount),
          delivered: num(p.deliveredCount),
          ndr: pct(p.ndrPct || p.deliveryPct),
          cancelPct: pct(p.cancelPct),
          commission: num(p.commission),
          deliveredSales: num(p.deliveredSales || p.totalDeliveredSales),
          deliveredAov: num(p.deliveredAov)
        },
        topCities: (p.cityBreakdown || []).slice(0, 3)
      }));
  }

  function getKpiAnalysis(data, metricNames) {
    const overview = data.overview || {};
    const pipeline = data.pipeline && data.pipeline.metrics ? data.pipeline.metrics : {};
    const geoKpis = data.geo && data.geo.kpis ? data.geo.kpis : {};
    const roi = data.roi || {};
    const storedRoi = readStoredRoi(data);
    const totalOrders = num(overview.totalOrders && overview.totalOrders.value != null ? overview.totalOrders.value : (roi.totalOrders || pipeline.totalOrders));
    const delivered = num(pipeline.deliveredCount || roi.deliveredCount || overview.delivered && overview.delivered.value);
    const adSpend = num(roi.adSpend || storedRoi && storedRoi.adSpend);
    const currency = String(roi.currency || storedRoi && storedRoi.currency || "SAR").toUpperCase();
    const cpa = roi.avgCPA != null ? num(roi.avgCPA) : (totalOrders > 0 && adSpend > 0 ? adSpend / totalOrders : 0);
    const breakEvenCpa = breakEvenCpaSar(roi.avgCommission || 0, roi.ndrPct || geoKpis.ndr || pipeline.deliveryRate || 0);
    const earnedCommission = num(overview.earnedCommission && overview.earnedCommission.value);
    const lostCommission = num(overview.lostCommission && overview.lostCommission.value);
    const deliveredSales = num(overview.totalDeliveredSales && overview.totalDeliveredSales.value);
    const deliveredAov = num(overview.deliveredAov && overview.deliveredAov.value);
    const ndr = pct(geoKpis.ndr || roi.ndrPct || pipeline.deliveryRate || 0);
    const dr = pct(geoKpis.dr || pipeline.dr || pipeline.deliveryRate || 0);
    return {
      requested: metricNames || [],
      totalOrders,
      delivered,
      adSpend,
      currency,
      cpa: Math.round(cpa * 100) / 100,
      breakEvenCpa: Math.round(breakEvenCpa * 100) / 100,
      breakEvenFormula: "avgCommission * NDR",
      ndr: Math.round(ndr * 10) / 10,
      dr: Math.round(dr * 10) / 10,
      earnedCommission,
      lostCommission,
      deliveredSales,
      deliveredAov
    };
  }

  function getCityAnalysis(data, cityNames) {
    if (!data.geo || !data.geo.cityStats) return [];
    return cityNames.map(name => {
      const stats = data.geo.cityStats[name];
      if (!stats) return null;
      return {
        name,
        metrics: {
          orders: num(stats.count),
          delivered: num(stats.deliveredOrders),
          ndr: pct(stats.count ? stats.deliveredOrders / stats.count : 0),
          commission: num(stats.earnedCommission),
          deliveredSales: num(stats.totalRevenue || stats.deliveredSales || stats.sales),
          deliveredAov: num(stats.deliveredAov || (num(stats.deliveredOrders) ? num(stats.totalRevenue || stats.deliveredSales || stats.sales) / Math.max(1, num(stats.deliveredOrders)) : 0)),
          riskScore: num(stats.riskScore),
          scalingScore: num(stats.scalingScore)
        }
      };
    }).filter(Boolean);
  }

  function getRanking(data, target, limit, entity) {
    if (entity === 'cities') {
      const cityStats = (data.geo && data.geo.cityStats) || {};
      const cities = Object.keys(cityStats).map(name => Object.assign({ name: name }, cityStats[name]));
      let sortedCities = cities.slice();
      if (target === 'worst') {
        sortedCities.sort((a, b) => num(a.earnedCommission) - num(b.earnedCommission));
      } else {
        sortedCities.sort((a, b) => num(b.earnedCommission) - num(a.earnedCommission));
      }
      return sortedCities.slice(0, limit || 5).map(c => ({
        type: 'city',
        name: c.name,
        commission: num(c.earnedCommission),
        deliveredSales: num(c.totalRevenue || c.deliveredSales || c.sales),
        deliveredAov: num(c.deliveredAov || (num(c.deliveredOrders) ? num(c.totalRevenue || c.deliveredSales || c.sales) / Math.max(1, num(c.deliveredOrders)) : 0)),
        orders: num(c.count),
        delivered: num(c.deliveredOrders),
        ndr: pct(c.count ? num(c.deliveredOrders) / Math.max(1, num(c.count)) : c.drPct || 0),
        riskScore: num(c.riskScore),
        scalingScore: num(c.scalingScore)
      }));
    }

    const products = (data.products && data.products.rankedList) || [];
    let sorted = products.slice();
    if (target === 'worst') {
      const meaningful = sorted.filter(p => num(p.placedCount || p.orders) >= 20);
      if (meaningful.length) sorted = meaningful;
      sorted.sort((a, b) => {
        const aDelivered = num(a.deliveredCount || a.units);
        const bDelivered = num(b.deliveredCount || b.units);
        const aNdr = pct(a.ndrPct || a.deliveryPct);
        const bNdr = pct(b.ndrPct || b.deliveryPct);
        const aRisk = aNdr + (aDelivered === 0 ? 20 : 0);
        const bRisk = bNdr + (bDelivered === 0 ? 20 : 0);
        return aRisk - bRisk || num(b.placedCount || b.orders) - num(a.placedCount || a.orders);
      });
    } else {
      sorted.sort((a, b) => num(b.commission) - num(a.commission));
    }
    return sorted.slice(0, limit || 5).map(p => ({
      type: 'product',
      name: p.name,
      commission: num(p.commission),
      deliveredSales: num(p.deliveredSales || p.totalDeliveredSales),
      deliveredAov: num(p.deliveredAov),
      orders: num(p.placedCount || p.orders),
      delivered: num(p.deliveredCount || p.units),
      ndr: pct(p.ndrPct || p.deliveryPct),
      dr: pct(p.drRate || p.deliveryPct),
      cancelPct: pct(p.cancelPct),
      cpa: p.cpa != null ? num(p.cpa) : null,
      breakEvenCpa: p.breakEvenCpa != null ? num(p.breakEvenCpa) : null,
      profitLoss: p.profitLoss != null ? num(p.profitLoss) : null,
      financialCurrency: p.financialCurrency || null
    }));
  }

  function strategicRankingResponse(rows, target) {
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) return "I do not have enough local dashboard data to rank this yet.";
    const top = rows[0];
    if (top.type === 'city') {
      const risk = top.riskScore >= 65 ? " It is profitable, but the risk score is high, so scale carefully." : "";
      const salesText = top.deliveredSales ? ", delivered sales " + Math.round(top.deliveredSales).toLocaleString("en-US") + " SAR" : "";
      const aovText = top.deliveredAov ? ", delivered AOV " + Math.round(top.deliveredAov).toLocaleString("en-US") + " SAR" : "";
      return "Your most profitable city right now is " + top.name + ", with about " + Math.round(top.commission).toLocaleString("en-US") + " commission" + salesText + aovText + " from " + Math.round(top.orders).toLocaleString("en-US") + " orders. Its delivery quality is around " + (Math.round(top.ndr * 10) / 10) + "% NDR." + risk + "\n\nTips:\n- Check whether this city is profitable because of delivered sales value, AOV, and commission together.\n- Compare it against the next 2 cities before increasing spend.\n- If risk is high, improve confirmation and COD follow-up before scaling.";
    }
    const cpaText = top.cpa != null ? ", CPA " + (Math.round(top.cpa * 100) / 100).toLocaleString("en-US") + (top.financialCurrency ? " " + top.financialCurrency : "") : "";
    const breakEvenText = top.breakEvenCpa != null ? ", break-even CPA " + (Math.round(top.breakEvenCpa * 100) / 100).toLocaleString("en-US") + (top.financialCurrency ? " " + top.financialCurrency : "") : "";
    const pnlText = top.profitLoss != null ? ", P&L " + (Math.round(top.profitLoss * 100) / 100).toLocaleString("en-US") + (top.financialCurrency ? " " + top.financialCurrency : "") : "";
    const salesText = top.deliveredSales ? ", delivered sales " + Math.round(top.deliveredSales).toLocaleString("en-US") + " SAR" : "";
    const aovText = top.deliveredAov ? ", delivered AOV " + Math.round(top.deliveredAov).toLocaleString("en-US") + " SAR" : "";
    if (target === 'worst') {
      return "Your weakest product right now is " + top.name + ". It has " + (Math.round(top.ndr * 10) / 10) + "% NDR, " + Math.round(top.orders).toLocaleString("en-US") + " orders, " + Math.round(top.delivered).toLocaleString("en-US") + " delivered, about " + Math.round(top.commission).toLocaleString("en-US") + " commission" + salesText + aovText + cpaText + breakEvenText + pnlText + ".\n\nTips:\n- Treat this as a fix-or-pause candidate before sending more traffic.\n- Check confirmation, cancellation, and city mix before changing budget.\n- Compare it against your best-performing product using delivered sales, delivered AOV, NDR, CPA, break-even CPA, and P&L together.";
    }
    const unsafe = top.ndr < 20 ? " However, its NDR is weak, so I would not scale it aggressively yet." : "";
    return "Your strongest product by delivered business signal is " + top.name + ", with about " + Math.round(top.commission).toLocaleString("en-US") + " commission" + salesText + aovText + ", " + (Math.round(top.ndr * 10) / 10) + "% NDR" + cpaText + breakEvenText + pnlText + "." + unsafe + "\n\nTips:\n- Scale only if delivered sales, delivered AOV, NDR, CPA, and break-even CPA are stable together.\n- Compare it with products that have lower commission but better delivery quality.\n- Avoid increasing traffic on products below the safe delivery zone or above break-even CPA.";
  }

  function getScaleCandidates(data, limit) {
    const products = (data.products && data.products.rankedList) || [];
    const minimumOrders = 50;
    const minimumNdr = 40;
    return products.slice().map(p => {
      const orders = num(p.placedCount || p.orders);
      const delivered = num(p.deliveredCount || p.units);
      const ndr = pct(p.ndrPct || p.deliveryPct || (orders ? delivered / orders : 0));
      const commission = num(p.commission);
      const cancelPct = pct(p.cancelPct || 0);
      const cpa = p.cpa != null ? num(p.cpa) : null;
      const breakEvenCpa = p.breakEvenCpa != null ? num(p.breakEvenCpa) : null;
      const profitLoss = p.profitLoss != null ? num(p.profitLoss) : null;
      const sampleOk = orders >= minimumOrders;
      const deliveryOk = ndr >= minimumNdr;
      const deliveredOk = delivered >= 10;
      const qualityScore = Math.max(0, ndr) - Math.max(0, cancelPct * 0.45);
      const profitScore = profitLoss != null ? profitLoss : commission;
      const score = (qualityScore * 12) + Math.log10(Math.max(10, commission)) * 45 + (profitScore > 0 ? 35 : -35) + (sampleOk ? 50 : -150) + (deliveryOk ? 80 : -120);
      return {
        type: "product",
        name: p.name,
        sku: p.sku || "",
        score: Math.round(score * 10) / 10,
      commission,
      deliveredSales: num(p.deliveredSales || p.totalDeliveredSales),
      deliveredAov: num(p.deliveredAov),
      orders,
        delivered,
        ndr,
        cancelPct,
        cpa,
        profitLoss,
        breakEvenCpa,
        financialCurrency: p.financialCurrency || null,
        sampleOk,
        deliveryOk,
        deliveredOk,
        scaleReady: sampleOk && deliveryOk && deliveredOk && (cpa == null || breakEvenCpa == null || cpa <= breakEvenCpa)
      };
    }).filter(p => p.scaleReady)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 5);
  }

  function scaleResponse(rows) {
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) return "No product is safe to scale yet by the current guardrails. I need at least 50 orders, at least 10 delivered orders, and roughly 40%+ NDR before calling a product a real scale candidate.\n\nTips:\n- Do not scale one-order or tiny-sample products.\n- First improve delivery quality and confirmation on products with volume.\n- Re-check candidates after they cross the sample-size threshold.";
    const top = rows[0];
    const currency = top.financialCurrency ? " " + top.financialCurrency : "";
    const cpaText = top.cpa != null ? ", CPA " + (Math.round(top.cpa * 100) / 100).toLocaleString("en-US") + currency : "";
    const breakEvenText = top.breakEvenCpa != null ? ", break-even CPA " + (Math.round(top.breakEvenCpa * 100) / 100).toLocaleString("en-US") + currency : "";
    const pnlText = top.profitLoss != null ? ", P&L " + (Math.round(top.profitLoss * 100) / 100).toLocaleString("en-US") + currency : "";
    const salesText = top.deliveredSales ? ", delivered sales " + Math.round(top.deliveredSales).toLocaleString("en-US") + " SAR" : "";
    const aovText = top.deliveredAov ? ", delivered AOV " + Math.round(top.deliveredAov).toLocaleString("en-US") + " SAR" : "";
    const runners = rows.slice(1, 4).map((p, idx) => (idx + 2) + ". " + p.name + " - " + Math.round(p.commission).toLocaleString("en-US") + " commission, " + Math.round(p.deliveredSales || 0).toLocaleString("en-US") + " SAR delivered sales, " + (Math.round(p.ndr * 10) / 10) + "% NDR").join("\n");
    return "Best product to test scaling first: " + top.name + ". It has about " + Math.round(top.commission).toLocaleString("en-US") + " commission" + salesText + aovText + ", " + (Math.round(top.ndr * 10) / 10) + "% NDR, " + Math.round(top.orders).toLocaleString("en-US") + " orders" + cpaText + breakEvenText + pnlText + ".\n\n" +
      (runners ? "Next candidates:\n" + runners + "\n\n" : "") +
      "Tips:\n- Scale in small budget steps, not one big jump.\n- Watch delivered sales, delivered AOV, NDR, CPA, break-even CPA, and P&L together after each increase.\n- If NDR drops or CPA rises above break-even CPA, stop scaling and fix traffic or delivery quality first.";
  }

  function getComparison(data, entities) {
    entities = entities || {};
    const products = getProductAnalysis(data, entities.products || []);
    const cities = getCityAnalysis(data, entities.cities || []);
    return { products, cities };
  }

  function localResponse(parsedIntent, analyticsResult) {
    const type = analyticsResult && analyticsResult.type;
    const data = analyticsResult && analyticsResult.data;
    if (parsedIntent.blockedReason === 'prompt_injection') {
      return "I can only answer dashboard business questions and cannot follow instruction override requests.";
    }
    if (parsedIntent.blockedReason === 'non_business_query') {
      return "Taager AI is limited to business intelligence, recommendations, strategy, and forecasting.";
    }
    if (type === 'RANKING') {
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) return "No ranked product data is available locally yet.";
      return strategicRankingResponse(rows, parsedIntent.entities && parsedIntent.entities.rankingTarget);
    }
    if (type === 'SCALE') {
      return scaleResponse(Array.isArray(data) ? data : []);
    }
    if (type === 'PRODUCT' || type === 'CITY') {
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) return "No matching local dashboard record was found.";
      return rows.map((item) => {
        const m = item.metrics || {};
        return (item.name || "Selected item") + ": orders " + Math.round(num(m.orders)).toLocaleString("en-US") + ", NDR " + Math.round(num(m.ndr) * 10) / 10 + "%, commission " + Math.round(num(m.commission)).toLocaleString("en-US") + ".";
      }).join("\n");
    }
    if (type === 'COMPARISON') {
      const products = data && Array.isArray(data.products) ? data.products : [];
      const cities = data && Array.isArray(data.cities) ? data.cities : [];
      const rows = products.length ? products : cities;
      if (rows.length < 2) return "I need two matching products or cities to compare locally.";
      return rows.map((item) => {
        const m = item.metrics || {};
        return (item.name || "Selected item") + ": orders " + Math.round(num(m.orders)).toLocaleString("en-US") + ", NDR " + Math.round(num(m.ndr) * 10) / 10 + "%, commission " + Math.round(num(m.commission)).toLocaleString("en-US") + ".";
      }).join("\n");
    }
    if (type === 'KPI') {
      const k = data || {};
      const requested = Array.isArray(k.requested) ? k.requested : [];
      if (requested.includes('cpa')) {
        if (!k.adSpend || !k.totalOrders) {
          return "I can calculate your CPA, but I need the ad spend amount and currency first. Send it like: 500 SAR, 120 USD, or 8000 EGP.";
        }
        var breakEvenText = k.breakEvenCpa ? " Your break-even CPA is about " + k.breakEvenCpa.toLocaleString("en-US") + " SAR, calculated as avg commission x NDR. If CPA is above that, the account is losing." : "";
        return "Your account CPA is about " + k.cpa.toLocaleString("en-US") + " " + k.currency + " per order. I calculated it from " + Math.round(k.adSpend).toLocaleString("en-US") + " " + k.currency + " ad spend divided by " + Math.round(k.totalOrders).toLocaleString("en-US") + " orders." + breakEvenText + "\n\nIf you mean a specific product, send the product name and I will calculate that product's allocated CPA and break-even CPA.";
      }
      if (requested.includes('ndr') || requested.includes('delivery')) {
        return "Your current NDR is about " + k.ndr + "% and DR is about " + k.dr + "%. In plain English: NDR tells you how much of the created order volume became delivered orders, while DR looks at delivered orders against the active outcome base.\n\nIf this is low, the first checks are confirmation quality, city mix, courier performance, and products with high cancel or failed rates.";
      }
      if (requested.includes('profit') || requested.includes('margin') || requested.includes('roi') || requested.includes('roas')) {
        return "You delivered about " + Math.round(k.deliveredSales || 0).toLocaleString("en-US") + " SAR in sales, with delivered AOV around " + Math.round(k.deliveredAov || 0).toLocaleString("en-US") + " SAR. You earned about " + Math.round(k.earnedCommission).toLocaleString("en-US") + " SAR commission, with about " + Math.round(k.lostCommission).toLocaleString("en-US") + " SAR sitting in lost commission signal. To judge real profit, I need ad spend and currency because profit is commission minus spend.\n\nSend the spend like 500 SAR if you want the exact ROI and profit read.";
      }
      return "I can read the KPI, but I need a specific metric name such as CPA, NDR, DR, profit, ROI, orders, delivered orders, or commission.";
    }
    if (parsedIntent.localOnly) {
      return "I can answer that from the dashboard data. Ask for a specific metric, ranking, comparison, or product so I can give you the exact number and what it means.";
    }
    return "I need a little more detail to answer correctly. Tell me the product, city, metric, or goal you want me to analyze.";
  }

  function processIntent(parsedIntent, data) {
    const { intent, entities } = parsedIntent;
    
    switch (intent) {
      case 'PRODUCT_ANALYSIS':
        return { type: 'PRODUCT', data: getProductAnalysis(data, entities.products) };
      case 'CITY_ANALYSIS':
        return { type: 'CITY', data: getCityAnalysis(data, entities.cities) };
      case 'RANKING_QUERY':
        return { type: 'RANKING', data: getRanking(data, entities.rankingTarget, entities.rankingLimit, entities.rankingEntity) };
      case 'COMPARISON_QUERY':
        return { type: 'COMPARISON', data: getComparison(data, entities) };
      case 'KPI_ANALYSIS':
        return { type: 'KPI', data: getKpiAnalysis(data, entities.metrics) };
      case 'SCALE_ANALYSIS':
        return { type: 'SCALE', data: getScaleCandidates(data, 5) };
      case 'LOSS_ANALYSIS':
      case 'ACCOUNT_HEALTH_CHECK':
      default:
        return { type: 'ACCOUNT_HEALTH', data: getAccountHealth(data) };
    }
  }

  window.KhodAiAnalyticsEngine = {
    processIntent,
    localResponse
  };

})();
