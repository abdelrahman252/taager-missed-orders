(function () {
  "use strict";

  function num(value) { return Number(value || 0); }
  function pct(value) {
    var n = Number(value || 0);
    return n > 1 ? n : n * 100;
  }

  function isArabicResponse(text) {
    if (typeof window !== "undefined" && window.KhodAiShared && typeof window.KhodAiShared.responseLanguage === "function") {
      return window.KhodAiShared.responseLanguage(text) === "ar";
    }
    return /[\u0600-\u06ff]/.test(String(text || ""));
  }

  function readStoredRoi(data) {
    if (typeof window === "undefined" || !window.localStorage) return null;
    var meta = data && data.meta ? data.meta : {};
    var ids = [meta.activeAccountId || "__all__", "__all__"];
    for (var i = 0; i < ids.length; i += 1) {
      try {
        var raw = window.localStorage.getItem("taager_roi_settings_" + ids[i]) ||
          window.localStorage.getItem("khod_roi_settings_" + ids[i]);
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

    // Sort cities by the sum of delivered orders' Profit After Tax.
    const cityStats = (data.geo && data.geo.cityStats) || {};
    const cityArray = Object.keys(cityStats).map(name => Object.assign({ name: name }, cityStats[name]));
    const cityDeliveryRate = (city) => {
      const orders = num(city.count || city.orders || city.drBaseOrders);
      const delivered = num(city.deliveredOrders || city.deliveredCount);
      return pct(city.drPct != null ? city.drPct : (orders ? delivered / Math.max(1, orders) : 0));
    };
    const cityEarnedProfitAfterTax = (city) => num(
      city.earnedProfitAfterTax != null ? city.earnedProfitAfterTax : city.earnedCommission
    );
    const bestCities = cityArray.slice().sort((a, b) => cityEarnedProfitAfterTax(b) - cityEarnedProfitAfterTax(a)).slice(0, 3);
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
        earnedProfitAfterTax: cityEarnedProfitAfterTax(c),
        commission: cityEarnedProfitAfterTax(c),
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
    const averageProfit = roi.averageProfit != null ? roi.averageProfit : roi.avgCommission;
    const breakEvenCpa = breakEvenCpaSar(averageProfit || 0, roi.ndrPct || geoKpis.ndr || pipeline.deliveryRate || 0);
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
          earnedProfitAfterTax: num(
            stats.earnedProfitAfterTax != null ? stats.earnedProfitAfterTax : stats.earnedCommission
          ),
          commission: num(
            stats.earnedProfitAfterTax != null ? stats.earnedProfitAfterTax : stats.earnedCommission
          ),
          deliveredSales: num(stats.totalRevenue || stats.deliveredSales || stats.sales),
          deliveredAov: num(stats.deliveredAov || (num(stats.deliveredOrders) ? num(stats.totalRevenue || stats.deliveredSales || stats.sales) / Math.max(1, num(stats.deliveredOrders)) : 0)),
          riskScore: num(stats.riskScore),
          scalingScore: num(stats.scalingScore)
        }
      };
    }).filter(Boolean);
  }

  function rankingValue(row, metric) {
    if (metric === 'ndr') return num(row.ndr);
    if (metric === 'cpa') return row.cpa == null ? null : num(row.cpa);
    if (metric === 'orders') return num(row.orders);
    if (metric === 'riskScore') return num(row.riskScore);
    if (metric === 'scalingScore') return num(row.scalingScore);
    if (metric === 'earnedProfitAfterTax' || metric === 'commission') return num(row.earnedProfitAfterTax);
    return num(row.earnedProfitAfterTax);
  }

  function sortRankingRows(rows, contract) {
    const direction = contract.direction === 'asc' ? 1 : -1;
    return rows.filter(row => rankingValue(row, contract.metric) != null).slice().sort((a, b) => {
      const delta = rankingValue(a, contract.metric) - rankingValue(b, contract.metric);
      return direction * delta || num(b.orders) - num(a.orders) || String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  function normalizeRankingRow(type, name, source) {
    source = source || {};
    const orders = num(source.count || source.placedCount || source.orders);
    const delivered = num(source.deliveredOrders || source.deliveredCount || source.units || source.delivered);
    return {
      type,
      name,
      earnedProfitAfterTax: num(
        source.earnedProfitAfterTax != null
          ? source.earnedProfitAfterTax
          : (source.earnedCommission != null ? source.earnedCommission : source.commission)
      ),
      commission: num(
        source.earnedProfitAfterTax != null
          ? source.earnedProfitAfterTax
          : (source.earnedCommission != null ? source.earnedCommission : source.commission)
      ),
      deliveredSales: num(source.totalRevenue || source.deliveredSales || source.sales),
      deliveredAov: num(source.deliveredAov || (delivered ? num(source.totalRevenue || source.deliveredSales || source.sales) / Math.max(1, delivered) : 0)),
      orders,
      delivered,
      ndr: source.ndrPct != null ? pct(source.ndrPct) : pct(orders ? delivered / Math.max(1, orders) : 0),
      dr: pct(source.drPct || source.drRate || source.deliveryPct),
      cancelPct: pct(source.cancelPct),
      cpa: source.cpa != null ? num(source.cpa) : null,
      breakEvenCpa: source.breakEvenCpa != null ? num(source.breakEvenCpa) : null,
      profitLoss: source.profitLoss != null ? num(source.profitLoss) : null,
      riskScore: num(source.riskScore),
      scalingScore: num(source.scalingScore),
      financialCurrency: source.financialCurrency || null,
      accountBreakdown: Array.isArray(source.accountBreakdown) ? source.accountBreakdown : []
    };
  }

  function getRanking(data, target, limit, entity, rankingContract) {
    const contract = Object.assign({
      entity: entity || 'products',
      metric: target === 'worst' ? 'ndr' : 'earnedProfitAfterTax',
      direction: target === 'worst' ? 'asc' : 'desc',
      limit: limit || 1,
      samplePolicy: 'all',
      minimumOrders: 0
    }, rankingContract || {});
    const sourceRows = contract.entity === 'cities'
      ? Object.keys((data.geo && data.geo.cityStats) || {}).map(name => normalizeRankingRow('city', name, data.geo.cityStats[name]))
      : ((data.products && data.products.rankedList) || []).map(product => normalizeRankingRow('product', product.name, product));
    const reportingCurrency = String(
      data && data.meta && data.meta.reportingCurrency ||
      data && data.roi && data.roi.currency ||
      window.dashboardActiveCurrency ||
      'SAR'
    ).toUpperCase();
    sourceRows.forEach(row => {
      if (!row.financialCurrency) row.financialCurrency = reportingCurrency;
    });
    const rawSorted = sortRankingRows(sourceRows, contract);
    const meaningfulRows = contract.samplePolicy === 'meaningful_with_raw_note'
      ? rawSorted.filter(row => row.orders >= num(contract.minimumOrders || 20))
      : rawSorted;
    const ranked = (meaningfulRows.length ? meaningfulRows : rawSorted).slice(0, contract.limit || 1);
    const rawExtreme = rawSorted[0] && ranked[0] && rawSorted[0].name !== ranked[0].name && rawSorted[0].orders < num(contract.minimumOrders || 20)
      ? Object.assign({}, rawSorted[0], { lowSample: true })
      : null;

    const accountRows = [];
    sourceRows.forEach(row => {
      row.accountBreakdown.forEach(account => {
        accountRows.push(normalizeRankingRow(row.type, row.name, Object.assign({}, account, {
          financialCurrency: row.financialCurrency
        })));
        accountRows[accountRows.length - 1].accountId = account.accountId || '';
        accountRows[accountRows.length - 1].accountLabel = account.accountLabel || account.accountId || '';
      });
    });
    const accountGroups = {};
    accountRows.forEach(row => {
      const key = row.accountId || row.accountLabel || '__unknown__';
      if (!accountGroups[key]) accountGroups[key] = [];
      accountGroups[key].push(row);
    });
    const perAccountResults = Object.keys(accountGroups).map(key => {
      const rawAccountRows = sortRankingRows(accountGroups[key], contract);
      const meaningfulAccountRows = contract.samplePolicy === 'meaningful_with_raw_note'
        ? rawAccountRows.filter(row => row.orders >= num(contract.minimumOrders || 20))
        : rawAccountRows;
      const selected = (meaningfulAccountRows.length ? meaningfulAccountRows : rawAccountRows)[0];
      const raw = rawAccountRows[0];
      if (!selected) return null;
      return Object.assign({}, selected, {
        rawExtreme: raw && raw.name !== selected.name && raw.orders < num(contract.minimumOrders || 20)
          ? Object.assign({}, raw, { lowSample: true })
          : null
      });
    }).filter(Boolean).sort((a, b) => String(a.accountLabel || '').localeCompare(String(b.accountLabel || '')));

    ranked.forEach(row => {
      const matchingAccounts = perAccountResults.filter(account => account.name === row.name);
      row.contributingAccount = sortRankingRows(matchingAccounts, contract)[0] || null;
      row.contract = contract;
      row.rawExtreme = rawExtreme;
      row.perAccountResults = perAccountResults;
      row.allAccounts = !!(data.meta && data.meta.activeAccountId === '__all__');
    });
    return ranked;
  }

  function isArabicResponse(command) {
    if (window.KhodAiShared && typeof window.KhodAiShared.responseLanguage === 'function') {
      return window.KhodAiShared.responseLanguage(command || '') === 'ar';
    }
    const locale = window.dashboardI18n && window.dashboardI18n.currentLocale
      ? window.dashboardI18n.currentLocale
      : (window._kbotLang || 'en');
    return String(locale).toLowerCase().indexOf('ar') === 0;
  }

  function metricLabel(metric, ar) {
    const labels = ar
      ? { ndr: 'معدل NDR', cpa: 'تكلفة الاكتساب CPA', orders: 'عدد الطلبات', riskScore: 'درجة المخاطر', scalingScore: 'درجة التوسع', commission: 'الربح المحقق بعد الضريبة', earnedProfitAfterTax: 'الربح المحقق بعد الضريبة' }
      : { ndr: 'NDR', cpa: 'CPA', orders: 'orders', riskScore: 'risk score', scalingScore: 'scaling score', commission: 'Earned Profit After Tax', earnedProfitAfterTax: 'Earned Profit After Tax' };
    return labels[metric] || labels.earnedProfitAfterTax;
  }

  function metricValueText(row, metric, ar) {
    const value = rankingValue(row, metric);
    if (metric === 'ndr') return (Math.round(value * 10) / 10) + '%';
    if (metric === 'cpa') return (Math.round(value * 100) / 100) + (row.financialCurrency ? ' ' + row.financialCurrency : '');
    if (metric === 'orders') return Math.round(value).toLocaleString('en-US') + (ar ? ' طلب' : ' orders');
    if (metric === 'riskScore') return Math.round(value).toLocaleString('en-US') + (ar ? ' من 100' : '/100');
    if (metric === 'scalingScore') return Math.round(value).toLocaleString('en-US') + (ar ? ' من 100' : '/100');
    return Math.round(value).toLocaleString('en-US') + (row.financialCurrency ? ' ' + row.financialCurrency : '');
  }

  function strategicRankingResponse(rows, target, command) {
    rows = Array.isArray(rows) ? rows : [];
    const ar = isArabicResponse(command);
    if (!rows.length) return ar ? "لا توجد بيانات كافية لإجراء هذا الترتيب." : "I do not have enough local dashboard data to rank this yet.";
    const top = rows[0];
    const contract = top.contract || { metric: target === 'worst' ? 'ndr' : 'earnedProfitAfterTax', direction: target === 'worst' ? 'asc' : 'desc' };
    const entityLabel = ar ? (top.type === 'city' ? 'المدينة' : 'المنتج') : (top.type === 'city' ? 'city' : 'product');
    const directionLabel = ar ? (contract.direction === 'asc' ? 'الأقل' : 'الأعلى') : (contract.direction === 'asc' ? 'lowest' : 'highest');
    const accountText = top.contributingAccount && top.contributingAccount.accountLabel
      ? (ar ? '، وأبرز مساهمة من حساب ' + top.contributingAccount.accountLabel : ', with the strongest contributing segment in account ' + top.contributingAccount.accountLabel)
      : '';
    const deliveredText = Math.round(top.delivered).toLocaleString('en-US');
    const ndrText = (Math.round(top.ndr * 10) / 10) + '%';
    const isBestDefault = target === 'best' && contract.direction === 'desc';
    var message = ar
      ? (isBestDefault ? 'أفضل ' + entityLabel + ' حسب ' : entityLabel + ' ذات ' + directionLabel + ' ') +
        metricLabel(contract.metric, true) + ' هي ' + top.name + '. قيمة ' + metricLabel(contract.metric, true) +
        ' هي ' + metricValueText(top, contract.metric, true) + '. اعتمدت النتيجة على ' +
        Math.round(top.orders).toLocaleString('en-US') + ' طلب، منها ' + deliveredText +
        ' طلب مسلم، ومعدل NDR هو ' + ndrText + accountText + '.'
      : (isBestDefault ? 'Your best ' + entityLabel + ' by ' : 'The ' + entityLabel + ' with the ' + directionLabel + ' ') +
        metricLabel(contract.metric, false) + ' is ' + top.name + '. Its ' + metricLabel(contract.metric, false) +
        ' is ' + metricValueText(top, contract.metric, false) + '. This is based on ' +
        Math.round(top.orders).toLocaleString('en-US') + ' orders, including ' + deliveredText +
        ' delivered orders, with an NDR of ' + ndrText + accountText + '.';
    if (top.rawExtreme) {
      message += ar
        ? '\n\nملاحظة مهمة: النتيجة الخام هي ' + top.rawExtreme.name + ' بقيمة ' + metricValueText(top.rawExtreme, contract.metric, true) + '، لكنها مبنية على ' + top.rawExtreme.orders + ' طلب فقط، لذلك لم أعتمدها كنتيجة رئيسية.'
        : '\n\nImportant sample note: the raw extreme is ' + top.rawExtreme.name + ' at ' + metricValueText(top.rawExtreme, contract.metric, false) + ', but it has only ' + top.rawExtreme.orders + ' orders, so I did not use it as the main answer.';
    }
    if (top.allAccounts && top.perAccountResults && top.perAccountResults.length) {
      var sameNameAccounts = top.perAccountResults.filter(account => account.name === top.name);
      if (sameNameAccounts.length > 1) {
        message += ar
          ? '\n\nالاسم نفسه موجود في أكثر من حساب، والنتيجة الإجمالية تجمع أداءه عبر الحسابات التالية: ' + sameNameAccounts.map(account => account.accountLabel).join('، ') + '.'
          : '\n\nThe same name exists in multiple accounts. The overall result combines its performance across: ' + sameNameAccounts.map(account => account.accountLabel).join(', ') + '.';
      }
      message += ar ? '\n\nحسب كل حساب:' : '\n\nBy account:';
      top.perAccountResults.forEach(account => {
        message += '\n- ' + account.accountLabel + ': ' + account.name + (ar ? '، ' : ', ') + metricLabel(contract.metric, ar) + ' ' + metricValueText(account, contract.metric, ar) + ' (' + account.orders + (ar ? ' طلب)' : ' orders)');
      });
    }
    message += ar
      ? '\n\n\u0627\u0644\u062e\u0637\u0648\u0629 \u0627\u0644\u062a\u0627\u0644\u064a\u0629: \u0631\u0627\u062c\u0639 \u062d\u062c\u0645 \u0627\u0644\u0639\u064a\u0646\u0629 \u0648\u0627\u0641\u062a\u062d \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644 \u0644\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0627\u0644\u062a\u0633\u0644\u064a\u0645.'
      : '\n\nNext move: Check the sample size, then open the ' + entityLabel + ' details to verify orders and delivery.';
    return message;
    /*
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
    */
  }

  function getScaleCandidates(data, limit) {
    const products = (data.products && data.products.rankedList) || [];
    const minimumOrders = 50;
    const minimumNdr = 40;
    return products.slice().map(p => {
      const orders = num(p.netOrderCount != null ? p.netOrderCount : (p.orders != null ? p.orders : p.placedCount));
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
    if (!rows.length) return "No product is safe to scale yet by the current guardrails. I need at least 50 orders, at least 10 delivered orders, and roughly 40%+ NDR before calling a product a real scale candidate.\n\nNext move: Improve delivery quality and confirmation on products with real volume, then re-check once they cross the sample-size threshold.";
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
      "Next move: Scale in small budget steps and watch delivered sales, delivered AOV, NDR, CPA, break-even CPA, and P&L after each increase.";
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
    const ar = isArabicResponse(parsedIntent && parsedIntent.rawText);
    if (parsedIntent.blockedReason === 'prompt_injection') {
      return ar
        ? "يمكنني الإجابة فقط عن أسئلة العمل وبيانات لوحة التحكم، ولا يمكنني تنفيذ طلبات تجاوز التعليمات."
        : "I can only answer dashboard business questions and cannot follow instruction override requests.";
    }
    if (parsedIntent.blockedReason === 'non_business_query') {
      return ar
        ? "مساعد Taager AI مخصص لتحليلات الأعمال والتوصيات والاستراتيجية والتوقعات."
        : "Taager AI is limited to business intelligence, recommendations, strategy, and forecasting.";
    }
    if (type === 'RANKING') {
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) return ar ? "لا توجد بيانات كافية للترتيب حاليًا." : "No ranked data is available locally yet.";
      return strategicRankingResponse(rows, parsedIntent.entities && parsedIntent.entities.rankingTarget, parsedIntent.rawText);
    }
    if (type === 'SCALE') {
      return scaleResponse(Array.isArray(data) ? data : []);
    }
    if (type === 'PRODUCT' || type === 'CITY') {
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) return ar ? "لم أجد سجلًا مطابقًا في بيانات لوحة التحكم الحالية." : "No matching local dashboard record was found.";
      return rows.map((item) => {
        const m = item.metrics || {};
        return ar
          ? (item.name || "العنصر المحدد") + ": الطلبات " + Math.round(num(m.orders)).toLocaleString("en-US") + "، NDR " + Math.round(num(m.ndr) * 10) / 10 + "%، العمولة " + Math.round(num(m.commission)).toLocaleString("en-US") + "."
          : (item.name || "Selected item") + ": orders " + Math.round(num(m.orders)).toLocaleString("en-US") + ", NDR " + Math.round(num(m.ndr) * 10) / 10 + "%, commission " + Math.round(num(m.commission)).toLocaleString("en-US") + ".";
      }).join("\n");
    }
    if (type === 'COMPARISON') {
      const products = data && Array.isArray(data.products) ? data.products : [];
      const cities = data && Array.isArray(data.cities) ? data.cities : [];
      const rows = products.length ? products : cities;
      if (rows.length < 2) return ar ? "أحتاج إلى منتجين أو مدينتين متطابقتين لإجراء المقارنة." : "I need two matching products or cities to compare locally.";
      return rows.map((item) => {
        const m = item.metrics || {};
        return ar
          ? (item.name || "العنصر المحدد") + ": الطلبات " + Math.round(num(m.orders)).toLocaleString("en-US") + "، NDR " + Math.round(num(m.ndr) * 10) / 10 + "%، العمولة " + Math.round(num(m.commission)).toLocaleString("en-US") + "."
          : (item.name || "Selected item") + ": orders " + Math.round(num(m.orders)).toLocaleString("en-US") + ", NDR " + Math.round(num(m.ndr) * 10) / 10 + "%, commission " + Math.round(num(m.commission)).toLocaleString("en-US") + ".";
      }).join("\n");
    }
    if (type === 'KPI') {
      const k = data || {};
      const requested = Array.isArray(k.requested) ? k.requested : [];
      if (requested.includes('cpa')) {
        if (!k.adSpend || !k.totalOrders) {
          return ar
            ? "يمكنني حساب CPA، لكن أحتاج أولًا إلى مبلغ الإنفاق الإعلاني والعملة. أرسله مثل: 500 SAR أو 120 USD أو 8000 EGP."
            : "I can calculate your CPA, but I need the ad spend amount and currency first. Send it like: 500 SAR, 120 USD, or 8000 EGP.";
        }
        var breakEvenText = k.breakEvenCpa
          ? (ar
            ? " وCPA التعادل حوالي " + k.breakEvenCpa.toLocaleString("en-US") + " SAR، محسوبًا من متوسط العمولة × NDR. إذا تجاوز CPA هذا الرقم فالحساب يخسر."
            : " Your break-even CPA is about " + k.breakEvenCpa.toLocaleString("en-US") + " SAR, calculated as avg commission x NDR. If CPA is above that, the account is losing.")
          : "";
        return ar
          ? "CPA للحساب حوالي " + k.cpa.toLocaleString("en-US") + " " + k.currency + " لكل طلب. حسبته بقسمة إنفاق " + Math.round(k.adSpend).toLocaleString("en-US") + " " + k.currency + " على " + Math.round(k.totalOrders).toLocaleString("en-US") + " طلب." + breakEvenText + "\n\nإذا كنت تقصد منتجًا محددًا، أرسل اسم المنتج وسأحسب CPA المخصص له وCPA التعادل."
          : "Your account CPA is about " + k.cpa.toLocaleString("en-US") + " " + k.currency + " per order. I calculated it from " + Math.round(k.adSpend).toLocaleString("en-US") + " " + k.currency + " ad spend divided by " + Math.round(k.totalOrders).toLocaleString("en-US") + " orders." + breakEvenText + "\n\nIf you mean a specific product, send the product name and I will calculate that product's allocated CPA and break-even CPA.";
      }
      if (requested.includes('ndr') || requested.includes('delivery')) {
        return ar
          ? "معدل NDR الحالي حوالي " + k.ndr + "% وDR حوالي " + k.dr + "%. يوضح NDR نسبة الطلبات المنشأة التي تحولت إلى طلبات مسلمة، بينما يقيس DR الطلبات المسلمة مقابل قاعدة النتائج النشطة.\n\nإذا كان المعدل منخفضًا، فابدأ بجودة التأكيد وتوزيع المدن وأداء شركة الشحن والمنتجات ذات الإلغاء أو الفشل المرتفع."
          : "Your current NDR is about " + k.ndr + "% and DR is about " + k.dr + "%. In plain English: NDR tells you how much of the created order volume became delivered orders, while DR looks at delivered orders against the active outcome base.\n\nIf this is low, the first checks are confirmation quality, city mix, courier performance, and products with high cancel or failed rates.";
      }
      if (requested.includes('profit') || requested.includes('margin') || requested.includes('roi') || requested.includes('roas')) {
        return ar
          ? "بلغت المبيعات المسلمة حوالي " + Math.round(k.deliveredSales || 0).toLocaleString("en-US") + " SAR، ومتوسط قيمة الطلب المسلم حوالي " + Math.round(k.deliveredAov || 0).toLocaleString("en-US") + " SAR. العمولة المكتسبة حوالي " + Math.round(k.earnedCommission).toLocaleString("en-US") + " SAR، وإشارة العمولة المفقودة حوالي " + Math.round(k.lostCommission).toLocaleString("en-US") + " SAR. لحساب الربح الحقيقي أحتاج الإنفاق الإعلاني والعملة لأن الربح يساوي العمولة ناقص الإنفاق.\n\nأرسل الإنفاق مثل 500 SAR للحصول على ROI والربح بدقة."
          : "You delivered about " + Math.round(k.deliveredSales || 0).toLocaleString("en-US") + " SAR in sales, with delivered AOV around " + Math.round(k.deliveredAov || 0).toLocaleString("en-US") + " SAR. You earned about " + Math.round(k.earnedCommission).toLocaleString("en-US") + " SAR commission, with about " + Math.round(k.lostCommission).toLocaleString("en-US") + " SAR sitting in lost commission signal. To judge real profit, I need ad spend and currency because profit is commission minus spend.\n\nSend the spend like 500 SAR if you want the exact ROI and profit read.";
      }
      return ar
        ? "يمكنني قراءة المؤشرات، لكن حدد مؤشرًا مثل CPA أو NDR أو DR أو الربح أو ROI أو الطلبات أو الطلبات المسلمة أو العمولة."
        : "I can read the KPI, but I need a specific metric name such as CPA, NDR, DR, profit, ROI, orders, delivered orders, or commission.";
    }
    if (parsedIntent.localOnly) {
      return ar
        ? "يمكنني الإجابة من بيانات لوحة التحكم. حدد مؤشرًا أو ترتيبًا أو مقارنة أو منتجًا لأعطيك الرقم الدقيق ومعناه."
        : "I can answer that from the dashboard data. Ask for a specific metric, ranking, comparison, or product so I can give you the exact number and what it means.";
    }
    return ar
      ? "أحتاج إلى تفاصيل أكثر قليلًا. حدد المنتج أو المدينة أو المؤشر أو الهدف الذي تريد تحليله."
      : "I need a little more detail to answer correctly. Tell me the product, city, metric, or goal you want me to analyze.";
  }

  function processIntent(parsedIntent, data) {
    const { intent, entities } = parsedIntent;
    
    switch (intent) {
      case 'PRODUCT_ANALYSIS':
        return { type: 'PRODUCT', data: getProductAnalysis(data, entities.products) };
      case 'CITY_ANALYSIS':
        return { type: 'CITY', data: getCityAnalysis(data, entities.cities) };
      case 'RANKING_QUERY':
        return { type: 'RANKING', data: getRanking(data, entities.rankingTarget, entities.rankingLimit, entities.rankingEntity, entities.rankingContract) };
      case 'COMPARISON_QUERY':
        return { type: 'COMPARISON', data: getComparison(data, entities) };
      case 'KPI_ANALYSIS':
        return { type: 'KPI', data: getKpiAnalysis(data, entities.metrics) };
      case 'CALCULATOR_SIMULATION':
        return { type: 'KPI', data: getKpiAnalysis(data, entities.metrics && entities.metrics.length ? entities.metrics : ['cpa']) };
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
