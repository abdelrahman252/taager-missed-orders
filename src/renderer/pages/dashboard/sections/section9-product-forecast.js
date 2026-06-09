// ─────────────────────────────────────────────────────────────────────────────
// section9-product-forecast.js — Product-Level Smart Forecasting Engine
// Parity with Account Calculator (Section 7) — same inputs, tooltips, metrics
// ─────────────────────────────────────────────────────────────────────────────

window.renderSectionProductForecast = function (mountEl, data, ctx) {
  'use strict';

  // ── Theme Observer ─────────────────────────────────────────────────────────
  if (mountEl._s9ThemeObserver) {
    mountEl._s9ThemeObserver.disconnect();
    mountEl._s9ThemeObserver = null;
  }
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.attributeName === 'data-theme') {
        window.renderSectionProductForecast(mountEl, data, ctx);
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mountEl._s9ThemeObserver = observer;

  // ── 1. Initialization ───────────────────────────────────────────────────────
  var pd = (data && data.products && data.products.rankedList) ? data.products.rankedList : [];

  if (!pd.length) {
    mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.4)">' + p9Txt('No product data available for simulation', 'لا توجد بيانات منتجات متاحة للمحاكاة') + '</div>';
    return;
  }

  var isAr = (document.documentElement.getAttribute('lang') || window._kbotLang || localStorage.getItem('kbot-lang') || 'ar') === 'ar';
  function p9Txt(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }
  function p9Num(v) { return Number(v || 0).toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-US'); }

  var simulations = pd.map(function (p) {
    var orders    = p.netOrderCount !== undefined ? p.netOrderCount : (p.placedCount || p.totalPieces || 1);
    var delivered = p.deliveredCount || p.units || 0;
    var realNdr   = orders > 0 ? (delivered / orders) : 0;
    var realComm  = delivered > 0 ? (p.commission / delivered) : 0;
    var realTaagerProfitAfterTax = Number(p.commission || 0);
    var realConfirmationRate = Number(p.confirmationPct || p.confirmationRate || 0) / 100;
    var realDr = Number(p.drRate || p.drPct || 0) / 100;
    var realDeliveredSales = Number(p.deliveredSales || p.totalDeliveredSales || 0);
    var realDeliveredAov = p.deliveredAov !== undefined
      ? Number(p.deliveredAov || 0)
      : (delivered > 0 ? realDeliveredSales / delivered : 0);
    if (realNdr  === 0) realNdr  = 0.30;
    if (realComm === 0) realComm = 35;

    var pId = p.key || p.sku || p.name;
    var savedPSpend = localStorage.getItem('kbot_s9_spend_' + pId);
    var realAdSpend = savedPSpend != null ? parseFloat(savedPSpend) : 0;
    return {
      id:            pId,
      sku:           p.sku || '',
      name:          p.name || p9Txt('Unknown Product', 'منتج غير معروف'),
      realOrders:    orders,
      realDelivered: delivered,
      realNdr:       realNdr,
      realCommission:realComm,
      realTaagerProfitAfterTax: realTaagerProfitAfterTax,
      realConfirmationRate: realConfirmationRate,
      realDr: realDr,
      realDeliveredSales: realDeliveredSales,
      realDeliveredAov: realDeliveredAov,
      realAdSpend:   realAdSpend,
      // Editable — always stored in SAR internally
      adSpend:       realAdSpend,
      totalOrders:   orders,
      deliveredOrders: delivered,
      ndr:           realNdr,
      avgCommission: realComm,
      isModified:    false
    };
  });

  var selectedIdx  = Math.max(0, simulations.findIndex(function (sim) {
    return String(sim.id) === String(mountEl._s9SelectedProductId || '');
  }));
  var currentPage  = Math.max(1, Number(mountEl._s9CurrentPage) || 1);
  var itemsPerPage = 10;
  var tableSortBy  = mountEl._s9TableSortBy || '';
  var tableSortDir = mountEl._s9TableSortDir || 'desc';
  var tableSearchQuery = mountEl._s9TableSearchQuery || '';
  var tableSearchTimer = null;
  var forecastAccountId = (data && data.meta && data.meta.activeAccountId) ||
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.activeAccountId) ||
    (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');
  var forecastRoiSettings = window.DashboardRoiState
    ? window.DashboardRoiState.get(forecastAccountId, data && data.roi)
    : { currency: window.dashboardActiveCurrency || 'SAR', egpRate: 52.0 };
  var viewCurrency = forecastRoiSettings.currency || window.dashboardActiveCurrency || 'SAR';
  var egpRate      = Number(forecastRoiSettings.egpRate) > 0 ? Number(forecastRoiSettings.egpRate) : 52.0;
  var forecastPeriod = (data && data.meta && data.meta.period) ||
    (ctx && ctx.data && ctx.data.meta && ctx.data.meta.period) ||
    (window.DashboardPeriodState && typeof window.DashboardPeriodState.get === 'function' ? window.DashboardPeriodState.get() : {}) ||
    {};
  var FORECAST_PLATFORMS = [
    { id: 'all', label: 'All' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'snapchat', label: 'Snapchat' },
    { id: 'facebook', label: 'Facebook' }
  ];
  var selectedMarketingPlatform = mountEl._s9MarketingPlatform || 'all';
  if (!FORECAST_PLATFORMS.some(function (platform) { return platform.id === selectedMarketingPlatform; })) {
    selectedMarketingPlatform = 'all';
    mountEl._s9MarketingPlatform = 'all';
  }
  var forecastMarketingState = window.DashboardMarketingState
    ? window.DashboardMarketingState.get(
        forecastAccountId,
        selectedMarketingPlatform === 'all' ? null : selectedMarketingPlatform
      )
    : null;
  var forecastMarketingSummary = forecastMarketingState && forecastMarketingState.summary || null;
  var campaignSpendRows = forecastMarketingSummary && Array.isArray(forecastMarketingSummary.campaignBreakdown)
    ? forecastMarketingSummary.campaignBreakdown
    : [];

  // ── 2. Currency helpers ─────────────────────────────────────────────────────
  function toDisplay(sarVal) {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(sarVal, window.dashboardActiveCurrency || 'SAR', viewCurrency);
    }
    if (viewCurrency === 'USD') return sarVal / 3.75;
    if (viewCurrency === 'EGP') return (sarVal / 3.75) * egpRate;
    return sarVal;
  }
  function toSAR(val) {
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(val, viewCurrency, window.dashboardActiveCurrency || 'SAR');
    }
    if (viewCurrency === 'USD') return val * 3.75;
    if (viewCurrency === 'EGP') return (val / egpRate) * 3.75;
    return val;
  }
  function formatMoney(sarVal, noSign, decimals) {
    var val  = toDisplay(sarVal);
    var abs  = Math.abs(val);
    var sign = (val < 0 && !noSign) ? '-' : '';
    
    var valStr;
    if (abs >= 1000000) valStr = (abs / 1000000).toFixed(2) + 'M';
    else if (abs >= 1000)    valStr = (abs / 1000).toFixed(1) + 'K';
    else if (decimals != null) {
      valStr = abs.toLocaleString('en', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    } else valStr = Math.round(abs).toLocaleString('en');

    if (viewCurrency === 'USD') {
      return sign + '$' + valStr;
    } else {
      return sign + valStr + ' ' + viewCurrency;
    }
  }
  function formatPct(v) { return Math.round(v * 100) + '%'; }

  function matchMethodLabel(sim) {
    if (sim && sim.syncMatchMethod === 'sku') return p9Txt('Marketing spend matched by SKU', 'تمت مطابقة إنفاق التسويق بواسطة SKU');
    if (sim && sim.syncMatchMethod === 'sku+name') return p9Txt('Marketing spend matched by SKU and normalized name', 'تمت مطابقة إنفاق التسويق بواسطة SKU والاسم الموحد');
    if (sim && sim.syncMatchMethod === 'name') return p9Txt('Marketing spend matched by normalized name fallback', 'تمت مطابقة إنفاق التسويق بالاسم الموحد كخيار احتياطي');
    return p9Txt('No marketing campaign matched; include this SKU or product name in the campaign.', 'لا توجد حملة تسويق مطابقة؛ أضف SKU أو اسم المنتج إلى الحملة.');
  }

  function periodDate(value) {
    return String(value || '').slice(0, 10);
  }

  function productSyncPeriodLabel() {
    var summary = forecastMarketingSummary || {};
    var from = periodDate(summary.dateFrom || forecastPeriod.dateFrom || forecastPeriod.from || forecastPeriod.start);
    var to = periodDate(summary.dateTo || forecastPeriod.dateTo || forecastPeriod.to || forecastPeriod.end);
    if (from && to && from !== to) return from + ' - ' + to;
    return from || to || p9Txt('Selected dashboard period', 'فترة لوحة التحكم المحددة');
  }

  function textKey(value) {
    var arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    return String(value || '').toLowerCase().normalize('NFKC')
      .replace(/[٠-٩]/g, function (digit) { return String(arabicDigits.indexOf(digit)); })
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
      .replace(/\u0640/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ىئ]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/[ةه]/g, 'ه')
      .replace(/[^\w\u0600-\u06ff]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function validSku(product) {
    var sku = textKey(product && product.sku || '');
    return sku && sku !== 'n a' && sku !== 'na' ? sku : '';
  }

  function hasTerm(text, term) {
    return !!term && (' ' + text + ' ').indexOf(' ' + term + ' ') !== -1;
  }

  function productTokens(name) {
    var stop = {
      ad: true, ads: true, campaign: true, tiktok: true, tik: true, tok: true,
      snapchat: true, snap: true, sc: true, facebook: true, fb: true, meta: true,
      ksa: true, saudi: true, sale: true, offer: true, new: true, test: true,
      flying: true, original: true, product: true,
      'منتج': true, 'عرض': true, 'جديد': true, 'اصلي': true, 'جهاز': true,
      'بعد': true, 'تعمل': true, 'يعمل': true, 'عدد': true, 'قطعه': true, 'حبه': true
    };
    return textKey(name).split(' ').filter(function (token) {
      return token.length >= 3 && !stop[token] && !/^x\d+$/i.test(token) && !/^\d+$/.test(token);
    });
  }

  function productPhrases(tokens) {
    var phrases = [];
    for (var size = 2; size <= Math.min(3, tokens.length); size++) {
      for (var start = 0; start <= tokens.length - size; start++) {
        phrases.push(tokens.slice(start, start + size).join(' '));
      }
    }
    return phrases;
  }

  function campaignSpendToSar(row) {
    var amount = Number(row && row.rawSpend || 0);
    var currency = String(row && row.currency || 'SAR').toUpperCase();
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(amount, currency, window.dashboardActiveCurrency || 'SAR');
    }
    if (currency === 'USD') return amount * 3.75;
    if (currency === 'EGP') return (amount / egpRate) * 3.75;
    return amount;
  }

  var productMatchKeys = pd.map(function (product, idx) {
    var tokens = productTokens(product.name || '');
    return { idx: idx, sku: validSku(product), tokens: tokens, phrases: productPhrases(tokens) };
  });
  var tokenOwners = {};
  var phraseOwners = {};
  productMatchKeys.forEach(function (product) {
    product.tokens.forEach(function (token) {
      tokenOwners[token] = (tokenOwners[token] || 0) + 1;
    });
    product.phrases.forEach(function (phrase) {
      phraseOwners[phrase] = (phraseOwners[phrase] || 0) + 1;
    });
  });

  function nameMatchScore(campaignText, product) {
    var hits = product.tokens.filter(function (token) { return hasTerm(campaignText, token); });
    var phraseHits = product.phrases.filter(function (phrase) { return hasTerm(campaignText, phrase); });
    var uniqueWordHit = hits.some(function (token) { return token.length >= 4 && tokenOwners[token] === 1; });
    var uniquePhraseHit = phraseHits.some(function (phrase) { return phraseOwners[phrase] === 1; });
    if (hits.length < Math.min(2, product.tokens.length) && !uniqueWordHit && !uniquePhraseHit) return 0;
    var score = hits.reduce(function (total, token) {
      return total + token.length + (tokenOwners[token] === 1 ? 6 : 0);
    }, 0);
    return score + phraseHits.reduce(function (total, phrase) {
      return total + phrase.length + (phraseOwners[phrase] === 1 ? 12 : 0);
    }, 0);
  }

  function buildCampaignAssignments() {
    var assignments = {};
    var summary = { skuRows: 0, nameRows: 0, unmatchedRows: 0 };
    campaignSpendRows.forEach(function (row) {
      var campaignText = textKey(row && row.campaign || '');
      if (!campaignText) {
        summary.unmatchedRows++;
        return;
      }
      var skuCandidates = productMatchKeys.filter(function (product) {
        return product.sku && hasTerm(campaignText, product.sku);
      }).sort(function (a, b) { return b.sku.length - a.sku.length; });
      var best = skuCandidates.length ? { idx: skuCandidates[0].idx, method: 'sku' } : null;
      if (!best) {
        var nameCandidates = productMatchKeys.map(function (product) {
          return { idx: product.idx, score: nameMatchScore(campaignText, product) };
        }).filter(function (candidate) { return candidate.score > 0; })
          .sort(function (a, b) { return b.score - a.score; });
        if (nameCandidates.length && (!nameCandidates[1] || nameCandidates[0].score > nameCandidates[1].score)) {
          best = { idx: nameCandidates[0].idx, method: 'name' };
        }
      }
      if (!best) {
        summary.unmatchedRows++;
        return;
      }
      if (!assignments[best.idx]) assignments[best.idx] = { spend: 0, methods: {}, rowCount: 0 };
      assignments[best.idx].spend += campaignSpendToSar(row);
      assignments[best.idx].methods[best.method] = true;
      assignments[best.idx].rowCount++;
      summary[best.method + 'Rows']++;
    });
    return { assignments: assignments, summary: summary };
  }

  var campaignAssignmentResult = buildCampaignAssignments();
  simulations.forEach(function (sim, idx) {
    var assignment = campaignAssignmentResult.assignments[idx];
    if (!assignment && selectedMarketingPlatform !== 'all') {
      sim.realAdSpend = 0;
      sim.adSpend = 0;
      sim.syncedAdSpend = false;
      sim.platformSpendFiltered = true;
      sim.syncMatchMethod = '';
      sim.syncMatchedRows = 0;
      return;
    }
    if (!assignment) return;
    sim.realAdSpend = Number(assignment.spend.toFixed(2));
    sim.adSpend = sim.isModified ? sim.adSpend : sim.realAdSpend;
    sim.syncedAdSpend = true;
    sim.syncMatchMethod = assignment.methods.sku && assignment.methods.name ? 'sku+name' :
      (assignment.methods.sku ? 'sku' : 'name');
    sim.syncMatchedRows = assignment.rowCount;
  });

  // ── Helper: profit CSS class ────────────────────────────────────────────────
  function profitClass(val) {
    return val < 0 ? 's9-profit-negative' : val > 0 ? 's9-profit-positive' : 's9-profit-zero';
  }

  // ── 3. Computation ──────────────────────────────────────────────────────────
  function computeSim(s) {
    var totalOrders     = Math.max(0, Math.round(Number(s.totalOrders) || 0));
    var deliveredOrders = Math.max(0, Math.round(Number(s.deliveredOrders) || 0));
    if (deliveredOrders > totalOrders && totalOrders > 0) deliveredOrders = totalOrders;
    var revenue         = deliveredOrders * s.avgCommission;
    var netProfit       = revenue - s.adSpend;
    var roi             = s.adSpend > 0 ? (netProfit / s.adSpend) * 100 : 0;
    var cpa             = totalOrders > 0 ? s.adSpend / totalOrders : 0;
    var breakEvenCpa    = s.avgCommission * (totalOrders > 0 ? (deliveredOrders / totalOrders) : (Number(s.ndr) || 0));
    var returnPerSar    = s.adSpend > 0 ? revenue / s.adSpend : 0;
    var revenuePerDel   = deliveredOrders > 0 ? revenue / deliveredOrders : 0;
    var ndrRequired     = (totalOrders > 0 && s.avgCommission > 0) ? s.adSpend / (totalOrders * s.avgCommission) : null;
    var commRequired    = deliveredOrders > 0 ? s.adSpend / deliveredOrders : null;
    var delivRequired   = s.avgCommission > 0 ? Math.ceil(s.adSpend / s.avgCommission) : null;
    var projBudget      = s.adSpend * 2;
    var projOrders      = cpa > 0 ? Math.round(projBudget / cpa) : 0;
    var projNet         = (Math.round(projOrders * s.ndr) * s.avgCommission) - projBudget;
    var projRoi         = projBudget > 0 ? (projNet / projBudget) * 100 : 0;
    return {
      totalOrders, deliveredOrders, revenue, netProfit, roi, cpa, breakEvenCpa, returnPerSar, revenuePerDel,
      ndrRequired, commRequired, delivRequired, projNet, projRoi, projBudget
    };
  }

  function resetSimulationToReal(s) {
    s.adSpend = Math.max(0, Number(s.realAdSpend) || 0);
    s.totalOrders = Math.max(0, Math.round(Number(s.realOrders) || 0));
    s.deliveredOrders = Math.max(0, Math.round(Number(s.realDelivered) || 0));
    s.ndr = s.totalOrders > 0 ? (s.deliveredOrders / s.totalOrders) : s.realNdr;
    s.avgCommission = Math.max(0, Number(s.realCommission) || 0);
    s.isModified = false;
  }

  function setSimTotalOrders(s, orders) {
    s.totalOrders = Math.max(0, Math.round(Number(orders) || 0));
    s.deliveredOrders = Math.round(s.totalOrders * s.ndr);
    s.isModified = true;
  }

  function setSimDeliveredOrders(s, delivered) {
    s.deliveredOrders = Math.max(0, Math.round(Number(delivered) || 0));
    if (s.ndr > 0) s.totalOrders = Math.max(s.deliveredOrders, Math.ceil(s.deliveredOrders / s.ndr));
    s.isModified = true;
  }

  function setSimNdr(s, ndrPct) {
    var pct = Math.min(100, Math.max(1, Number(ndrPct) || 1));
    s.ndr = pct / 100;
    s.deliveredOrders = Math.round((Number(s.totalOrders) || 0) * s.ndr);
    s.isModified = true;
  }

  // ── 4. Gauge SVG (identical to S7) ─────────────────────────────────────────
  function gaugeHtml(roi) {
    var cx = 190, cy = 165, R = 120, SW = 24;
    var START = 225, SPAN = 270;
    function pt(r, deg) {
      var rad = ((deg - 90) * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    function strokeArc(s, e) {
      var p1 = pt(R, s), p2 = pt(R, e), lg = (e - s) > 180 ? 1 : 0;
      return 'M ' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) + ' A ' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + p2.x.toFixed(2) + ' ' + p2.y.toFixed(2);
    }
    var clamped = Math.min(Math.max(roi, -100), 300);
    var pct = (clamped + 100) / 400;
    var needleDeg = START + pct * SPAN;
    var tip = pt(R - 5, needleDeg), bl = pt(6, needleDeg + 90), br = pt(6, needleDeg - 90);
    var roiColor = roi < 0 ? '#ef4444' : roi < 50 ? '#f59e0b' : '#00e676';
    var formattedRoi = (roi < 0 ? '-' : (roi > 0 ? '+' : '')) + Math.abs(roi).toFixed(0) + '%';
    var labelsHtml = [
      { pct: -100, text: '-100%', anchor: 'end' },
      { pct: 0,    text: '0%',    anchor: 'end' },
      { pct: 100,  text: '100%',  anchor: 'middle' },
      { pct: 200,  text: '200%',  anchor: 'start' },
      { pct: 300,  text: '300%+', anchor: 'start' },
    ].map(function (lbl) {
      var deg = START + ((lbl.pct + 100) / 400) * SPAN;
      var p = pt(R + SW / 2 + 18, deg);
      return '<text x="' + p.x.toFixed(2) + '" y="' + p.y.toFixed(2) + '" text-anchor="' + lbl.anchor + '" dominant-baseline="middle" fill="rgba(255,255,255,0.5)" font-size="11" font-weight="700" font-family="Cairo,sans-serif" direction="ltr">' + lbl.text + '</text>';
    }).join('');
    return '<svg viewBox="0 0 380 250" width="100%" height="220" style="height:auto">' +
      '<defs><linearGradient id="s9g" x1="0%" y1="100%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#ef4444"/><stop offset="35%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#00e676"/>' +
      '</linearGradient></defs>' +
      '<path d="' + strokeArc(225, 495) + '" stroke="url(#s9g)" stroke-width="' + SW + '" fill="none" stroke-linecap="round"/>' +
      labelsHtml +
      '<polygon points="' + tip.x.toFixed(2) + ',' + tip.y.toFixed(2) + ' ' + bl.x.toFixed(2) + ',' + bl.y.toFixed(2) + ' ' + br.x.toFixed(2) + ',' + br.y.toFixed(2) + '" fill="white" style="filter:drop-shadow(0 0 4px rgba(255,255,255,0.8))"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy + 25) + '" text-anchor="middle" fill="' + roiColor + '" font-size="42" font-weight="900" font-family="Cairo,sans-serif" direction="ltr">' + formattedRoi + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 62) + '" text-anchor="middle" fill="' + roiColor + '" font-size="13" font-weight="800" font-family="Cairo,sans-serif">● ' + p9Txt(roi < 0 ? 'Loss' : roi < 50 ? 'Near Breakeven' : 'Profitable', roi < 0 ? 'خسارة' : roi < 50 ? 'قريب من التعادل' : 'مربح') + '</text>' +
      '</svg>';
  }

  // ── 5. Tooltip helper — exact S7 pattern ────────────────────────────────────
  function _tip(icon, title, desc, formula) {
    formula = formula || '';
    function enc(s) {
      return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return '<span class="s7-tip-badge" ' +
      'data-tip-icon="' + enc(icon) + '" ' +
      'data-tip-title="' + enc(title) + '" ' +
      'data-tip-desc="' + enc(desc) + '" ' +
      'data-tip-formula="' + enc(formula) + '">?</span>';
  }

  function _kpiMiniTip(label, val, color, icon, tipTitle, tipDesc, tipFormula) {
    return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:12px;padding:14px;text-align:center;position:relative">' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:5px">' +
        label + ' ' + _tip(icon, tipTitle, tipDesc, tipFormula) +
      '</div>' +
      '<div class="s9-metric-val" style="font-size:17px;font-weight:900;color:' + color + '">' + val + '</div>' +
    '</div>';
  }

  // ── 6. Tooltip engine — exact S7 initTooltips() ────────────────────────────
  function initTooltips() {
    if (mountEl._s9TooltipCleanup) {
      mountEl._s9TooltipCleanup();
      mountEl._s9TooltipCleanup = null;
    }

    var old = document.getElementById('s7-global-tooltip');
    if (old) old.parentNode.removeChild(old);

    var tip = document.createElement('div');
    tip.id = 's7-global-tooltip';
    Object.assign(tip.style, {
      position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 0.18s ease, transform 0.18s ease',
      transform: 'translateY(6px)', maxWidth: '270px', minWidth: '210px',
      display: 'block', top: '0px', left: '0px', visibility: 'visible'
    });
    tip.innerHTML =
      '<div id="s7-tip-inner" style="' +
        'background:rgba(8,12,24,0.98);' +
        'border:1px solid rgba(59,130,246,0.45);' +
        'border-radius:13px;' +
        'padding:14px 16px;' +
        'box-shadow:0 12px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05) inset;' +
        'font-family:Cairo,sans-serif' +
      '">' +
        '<div id="s7-tip-title" style="font-size:11px;font-weight:800;letter-spacing:.05em;color:#93c5fd;margin-bottom:7px;display:flex;align-items:center;gap:5px;"></div>' +
        '<div id="s7-tip-desc"  style="font-size:12px;color:rgba(255,255,255,0.75);line-height:1.65;margin-bottom:0"></div>' +
        '<div id="s7-tip-flbl"  style="display:none;font-size:9px;font-weight:700;letter-spacing:.12em;color:rgba(255,255,255,0.25);text-transform:uppercase;margin-top:9px;margin-bottom:4px;"></div>' +
        '<div id="s7-tip-fbox"  style="display:none;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:7px;padding:7px 10px;font-size:11px;color:#60a5fa;font-family:Courier New,monospace;direction:ltr;line-height:1.5;word-break:break-all"></div>' +
      '</div>' +
      '<div id="s7-tip-arrow" style="' +
        'position:absolute;width:10px;height:10px;' +
        'background:rgba(8,12,24,0.98);' +
        'border-right:1px solid rgba(59,130,246,0.45);' +
        'border-bottom:1px solid rgba(59,130,246,0.45);' +
        'transform:rotate(45deg)' +
      '"></div>';
    document.body.appendChild(tip);

    var hideTimer;
    function showTip(badge) {
      clearTimeout(hideTimer);
      var icon    = badge.getAttribute('data-tip-icon')    || '';
      var title   = badge.getAttribute('data-tip-title')   || '';
      var desc    = badge.getAttribute('data-tip-desc')    || '';
      var formula = badge.getAttribute('data-tip-formula') || '';
      if (window.dashboardI18n) {
        icon = window.dashboardI18n.isQuestionMarkText && window.dashboardI18n.isQuestionMarkText(icon) ? '' : window.dashboardI18n.clean(icon);
        title = window.dashboardI18n.clean(title);
        desc = window.dashboardI18n.clean(desc);
        formula = window.dashboardI18n.clean(formula);
      }
      formula = formula
        .replace(/[\u00d7\u00c3\u2014]/g, '*')
        .replace(/[\u00f7\u00c3\u00b7]/g, '/')
        .replace(/[\u2212\u00e2\u02c6\u2019]/g, '-');
      document.getElementById('s7-tip-title').textContent = (icon ? icon + ' ' : '') + title;
      document.getElementById('s7-tip-desc').textContent = desc;
      var flbl = document.getElementById('s7-tip-flbl');
      var fbox = document.getElementById('s7-tip-fbox');
      if (formula) {
        flbl.textContent = p9Txt('Equation', 'المعادلة'); flbl.style.display = 'block';
        fbox.textContent = formula;    fbox.style.display = 'block';
      } else {
        flbl.style.display = 'none'; fbox.style.display = 'none';
      }
      tip.style.opacity = '0'; tip.style.transform = 'translateY(6px)';
      tip.style.left = '0px';  tip.style.top = '0px';
      requestAnimationFrame(function () {
        var br  = badge.getBoundingClientRect();
        var tw  = tip.offsetWidth  || 240;
        var th  = tip.offsetHeight || 120;
        var vw  = window.innerWidth;
        var MARGIN = 12, ARROW_H = 14;
        var cx   = br.left + br.width / 2;
        var left = cx - tw / 2;
        if (left < MARGIN) left = MARGIN;
        if (left + tw > vw - MARGIN) left = vw - tw - MARGIN;
        var top   = br.top - th - ARROW_H;
        var below = false;
        if (top < MARGIN) { top = br.bottom + ARROW_H; below = true; }
        tip.style.left = Math.round(left) + 'px';
        tip.style.top  = Math.round(top)  + 'px';
        var arrow     = document.getElementById('s7-tip-arrow');
        var arrowLeft = Math.max(10, Math.min(tw - 20, cx - left - 5));
        arrow.style.left = Math.round(arrowLeft) + 'px';
        if (below) {
          arrow.style.bottom = 'auto'; arrow.style.top = '-5px';
          arrow.style.transform = 'rotate(225deg)';
        } else {
          arrow.style.top = 'auto'; arrow.style.bottom = '-5px';
          arrow.style.transform = 'rotate(45deg)';
        }
        tip.style.opacity = '1'; tip.style.transform = 'translateY(0)';
      });
    }
    function hideTip() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        tip.style.opacity = '0'; tip.style.transform = 'translateY(6px)';
      }, 60);
    }
    mountEl._s9TooltipOver = function (e) {
      var badge = e.target.closest ? e.target.closest('.s7-tip-badge') : null;
      if (badge) showTip(badge);
    };
    mountEl._s9TooltipOut = function (e) {
      var badge = e.target.closest ? e.target.closest('.s7-tip-badge') : null;
      if (badge) hideTip();
    };
    document.addEventListener('mouseover', mountEl._s9TooltipOver);
    document.addEventListener('mouseout', mountEl._s9TooltipOut);
    mountEl._s9TooltipCleanup = function () {
      clearTimeout(hideTimer);
      if (mountEl._s9TooltipOver) document.removeEventListener('mouseover', mountEl._s9TooltipOver);
      if (mountEl._s9TooltipOut) document.removeEventListener('mouseout', mountEl._s9TooltipOut);
      mountEl._s9TooltipOver = null;
      mountEl._s9TooltipOut = null;
      var currentTip = document.getElementById('s7-global-tooltip');
      if (currentTip && currentTip.parentNode) currentTip.parentNode.removeChild(currentTip);
    };
  }

  // ── 7. Insight cards — SFE style (identical to S7) ─────────────────────────
  function renderInsightsFeed(s, c) {
    var insights = [];
    if (s.adSpend === 0) {
      insights.push({ type: 'info', icon: '💡', cat: p9Txt('AWAITING BUDGET', 'في انتظار الميزانية'),
        text: p9Txt('Enter an ad budget to generate smart forecasts.', 'يرجى إدخال ميزانية الحملة لتوليد التوقعات الذكية.') });
      return insights.map(_insightHtml).join('');
    }

    // Profitability
    if (c.netProfit < 0) {
      insights.push({ type: 'critical', icon: '🔴', cat: p9Txt('PROFITABILITY', 'الربحية'),
        text: p9Txt('Campaign is losing <span class="hi-red">', 'الحملة تتكبد خسارة <span class="hi-red">') + formatMoney(Math.abs(c.netProfit), true) + p9Txt('</span> net.', '</span> صافي.') });
    } else {
      insights.push({ type: 'positive', icon: '🟢', cat: p9Txt('PROFITABILITY', 'الربحية'),
        text: p9Txt('Campaign is profitable — net <span class="hi-cyan">', 'الحملة رابحة — صافي <span class="hi-cyan">') + formatMoney(c.netProfit, true) + '</span>.' });
    }

    // Unit economics
    if (c.cpa > c.revenuePerDel && s.adSpend > 0) {
      insights.push({ type: 'negative', icon: '📉', cat: p9Txt('UNIT ECONOMICS', 'اقتصاديات الطلب'),
        text: p9Txt('<span class="hi-red">CPA (', '<span class="hi-red">تكلفة الطلب (') + formatMoney(c.cpa, true, 2) + p9Txt(')</span> exceeds revenue per delivery <strong>(', ')</span> أعلى من إيراد التسليم <strong>(') + formatMoney(c.revenuePerDel, true, 2) + p9Txt(')</strong>. Scaling multiplies losses.', ')</strong>. التوسع سيضاعف الخسائر.') });
    } else if (c.revenuePerDel > 0 && s.adSpend > 0) {
      insights.push({ type: 'positive', icon: '📈', cat: p9Txt('UNIT ECONOMICS', 'اقتصاديات الطلب'),
        text: p9Txt('Revenue per delivery <span class="hi-cyan">(', 'إيراد التسليم <span class="hi-cyan">(') + formatMoney(c.revenuePerDel, true, 2) + p9Txt(')</span> exceeds CPA — unit economics healthy.', ')</span> أعلى من تكلفة الطلب — اقتصاديات صحية.') });
    }

    // NDR analysis
    var ndrPct = Math.round(s.ndr * 100);
    if (s.ndr < 0.20) {
      insights.push({ type: 'negative', icon: '⚠️', cat: p9Txt('NDR ANALYSIS', 'تحليل نسبة التسليم'),
        text: p9Txt('NDR of <span class="hi-red">', 'نسبة التسليم <span class="hi-red">') + ndrPct + p9Txt('%</span> is critically below 20% — primary driver of losses.', '%</span> أقل من حد الخطر 20% — سبب رئيسي للخسائر.') });
    } else if (s.ndr < 0.30) {
      insights.push({ type: 'warning', icon: '📊', cat: p9Txt('NDR ANALYSIS', 'تحليل نسبة التسليم'),
        text: p9Txt('NDR of <span class="hi-yellow">', 'نسبة التسليم <span class="hi-yellow">') + ndrPct + p9Txt('%</span> is below healthy baseline (30%). Improving NDR would materially boost profitability.', '%</span> أقل من المتوسط الصحي 30%. رفعها سيحسن الربحية بوضوح.') });
    } else if (s.ndr >= 0.40) {
      insights.push({ type: 'positive', icon: '✅', cat: p9Txt('NDR ANALYSIS', 'تحليل نسبة التسليم'),
        text: p9Txt('NDR of <span class="hi-cyan">', 'نسبة التسليم <span class="hi-cyan">') + ndrPct + p9Txt('%</span> reaches the top delivery tier (40%) — delivery is strong.', '%</span> أعلى من مستوى التسليم 40% — أداء تسليم قوي.') });
    }

    // Break-even hint
    if (c.ndrRequired !== null && c.ndrRequired <= 1 && c.netProfit < 0) {
      insights.push({ type: 'warning', icon: '⚡', cat: p9Txt('BREAK-EVEN', 'نقطة التعادل'),
        text: p9Txt('To break even, NDR must reach <strong style="color:#f59e0b">', 'للتعادل، ارفع نسبة التسليم إلى <strong style="color:#f59e0b">') + Math.round(c.ndrRequired * 100) + '%</strong>.' });
    }

    return insights.slice(0, 5).map(_insightHtml).join('');
  }

  function _insightHtml(i) {
    return '<div class="sfe-insight sfe-insight--' + i.type + '">' +
      '<span class="sfe-insight-icon">' + i.icon + '</span>' +
      '<div class="sfe-insight-body">' +
        '<div class="sfe-insight-category">' + i.cat + '</div>' +
        '<div class="sfe-insight-text">' + i.text + '</div>' +
      '</div></div>';
  }

  // ── 8. Table builder ────────────────────────────────────────────────────────
  function realProfit(sim) {
    return (Math.max(0, Math.round(Number(sim.realDelivered) || 0)) * sim.realCommission) - sim.realAdSpend;
  }

  function sortedSimulationRows() {
    var rows = simulations.map(function (sim, idx) {
      return { sim: sim, idx: idx };
    });
    var query = textKey(tableSearchQuery);
    if (query) {
      rows = rows.filter(function (row) {
        return textKey(row.sim.name).indexOf(query) !== -1 ||
          textKey(row.sim.sku).indexOf(query) !== -1;
      });
    }
    if (!tableSortBy) return rows;
    var direction = tableSortDir === 'asc' ? 1 : -1;
    return rows.sort(function (left, right) {
      var a = left.sim;
      var b = right.sim;
      var comparison = 0;
      if (tableSortBy === 'product') comparison = textKey(a.name).localeCompare(textKey(b.name));
      else if (tableSortBy === 'orders') comparison = a.realOrders - b.realOrders;
      else if (tableSortBy === 'delivered') comparison = a.realDelivered - b.realDelivered;
      else if (tableSortBy === 'ndr') comparison = a.realNdr - b.realNdr;
      else if (tableSortBy === 'spend') comparison = a.realAdSpend - b.realAdSpend;
      else if (tableSortBy === 'profit') comparison = realProfit(a) - realProfit(b);
      if (!comparison) comparison = left.idx - right.idx;
      return comparison * direction;
    });
  }

  function sortHeader(label, key) {
    var suffix = tableSortBy === key ? (tableSortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return '<button type="button" class="s9-sort-btn' + (tableSortBy === key ? ' is-active' : '') +
      '" data-sort="' + key + '">' + label + suffix + '</button>';
  }

  function buildTable() {
    var sortedRows = sortedSimulationRows();
    var totalFilteredRows = sortedRows.length;
    var totalPages = Math.ceil(totalFilteredRows / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    var startIndex    = (currentPage - 1) * itemsPerPage;
    var paginatedSims = sortedRows.slice(startIndex, startIndex + itemsPerPage);

    var rows = paginatedSims.map(function (row) {
      var s            = row.sim;
      var absoluteIdx  = row.idx;
      var realNetProfit = realProfit(s);
      var isSel        = absoluteIdx === selectedIdx;
      var trStyle      = 'cursor:pointer;transition:background 0.2s;border-bottom:1px solid rgba(255,255,255,0.04);background:' + (isSel ? 'rgba(59,130,246,0.1)' : 'transparent') + ';';
      var displaySpend = s.realAdSpend === 0
        ? (s.platformSpendFiltered ? '0' : '')
        : Math.round(toDisplay(s.realAdSpend));
      var spendLocked = s.syncedAdSpend || s.platformSpendFiltered
        ? ' disabled title="' + p9Txt('Filtered from marketing campaign spend', 'تمت تصفية الإنفاق من حملات التسويق') + '"'
        : '';

      // ── FIX: Use CSS class for profit color — overrides any theme stylesheet ──
      var pClass = profitClass(realNetProfit);
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      var netProfitColor = realNetProfit < 0 ? '#ef4444' : (realNetProfit > 0 ? (isLight ? '#10b981' : '#00e676') : (isLight ? '#6b7280' : 'rgba(255,255,255,0.6)'));

      return '<tr style="' + trStyle + '" data-idx="' + absoluteIdx + '" class="s9-row">' +
        '<td data-i18n-preserve style="padding:12px 16px;font-weight:700;color:#fff;">' + s.name +
          '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.42);margin-top:3px;" dir="ltr">SKU: ' + (s.sku || 'N/A') + '</div>' +
          '<div style="font-size:10px;font-weight:700;color:' + (s.syncedAdSpend ? '#2dd4bf' : '#f59e0b') + ';margin-top:3px;">' + matchMethodLabel(s) + '</div>' +
        '</td>' +
        '<td style="padding:12px 16px;color:rgba(255,255,255,0.6);">' + p9Num(s.realOrders) + '</td>' +
        '<td style="padding:12px 16px;color:rgba(255,255,255,0.6);">' + p9Num(s.realDelivered) + window.supposedBadgeHtml('delivered') + '</td>' +
        '<td style="padding:12px 16px;color:rgba(255,255,255,0.6);">' + formatPct(s.realNdr) + window.supposedBadgeHtml('dr') + '</td>' +
        '<td style="padding:12px 16px;">' +
          '<input type="text" inputmode="numeric" class="s9-spend-input" data-idx="' + absoluteIdx + '" value="' + displaySpend + '" placeholder="0" ' +
            spendLocked + ' style="width:80px;padding:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;text-align:center;font-family:inherit;">' +
        '</td>' +
        '<td class="s9-profit-cell ' + pClass + '" style="padding:12px 16px;font-weight:700;text-align:left;color:' + netProfitColor + ' !important;" dir="ltr">' +
          '<span class="s9-profit-value ' + pClass + '" style="color:' + netProfitColor + ' !important;-webkit-text-fill-color:' + netProfitColor + ' !important;">' + formatMoney(realNetProfit) + window.supposedBadgeHtml('profit') + '</span>' +
        '</td>' +
      '</tr>';
    }).join('');
    if (!rows) {
      rows = '<tr><td colspan="6" style="padding:28px 16px;text-align:center;color:rgba(255,255,255,0.45);font-size:13px;font-weight:700;">' +
        (tableSearchQuery
          ? p9Txt('No product matches this search.', 'لا يوجد منتج مطابق لهذا البحث.')
          : p9Txt('No products available.', 'لا توجد منتجات متاحة.')) +
        '</td></tr>';
    }

    // Pagination
    var pagesHtml = '';
    var totalP = Math.max(1, totalPages);
    for (var i = 1; i <= totalP; i++) {
      pagesHtml += '<button class="s9-page-btn" data-page="' + i + '" style="margin:0 2px;padding:4px 8px;border-radius:4px;border:none;background:' + (i === currentPage ? '#3b82f6' : 'rgba(255,255,255,0.05)') + ';color:' + (i === currentPage ? '#fff' : 'rgba(255,255,255,0.5)') + ';cursor:pointer;font-family:inherit;">' + i + '</button>';
    }

    var paginationHtml = window.renderDashboardPagination ? window.renderDashboardPagination({
      currentPage: currentPage,
      totalPages: totalP,
      totalItems: totalFilteredRows,
      startItem: totalFilteredRows ? startIndex + 1 : 0,
      endItem: Math.min(startIndex + itemsPerPage, totalFilteredRows),
      itemLabel: p9Txt('products', 'منتج'),
      pageButtonClass: 's9-page-btn',
      prevClass: 's9-page-prev',
      nextClass: 's9-page-next',
      className: 's9-dashboard-pagination'
    }) : null;
    var syncedProductCount = simulations.filter(function (sim) { return !!sim.syncedAdSpend; }).length;
    var matchSummary = campaignAssignmentResult.summary;
    var syncDisabled = forecastMarketingState && forecastMarketingState.loading ? ' disabled' : '';
    var syncLabel = forecastMarketingState && forecastMarketingState.loading ? p9Txt('Syncing...', 'Syncing...') : p9Txt('Sync Now', 'Sync Now');
    var platformTabs = FORECAST_PLATFORMS.map(function (platform) {
      return '<button type="button" class="s9-platform-tab' + (selectedMarketingPlatform === platform.id ? ' is-active' : '') +
        '" data-s9-platform="' + platform.id + '">' + platform.label + '</button>';
    }).join('');

    return '<div style="flex:1;display:flex;flex-direction:column;border-left:1px solid rgba(255,255,255,0.06);overflow:hidden;">' +
      '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
          '<div style="font-size:16px;font-weight:800;color:#fff;">' + p9Txt('Products', 'المنتجات') + '</div>' +
          '<button type="button" id="s9-clear-sort" class="s9-clear-sort"' + (tableSortBy ? '' : ' disabled') + '>' + p9Txt('Clear sort', 'مسح الترتيب') + '</button>' +
        '</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;">' + p9Txt('Enter budget per product to see forecasts.', 'أدخل الميزانية لكل منتج لرؤية التوقعات.') + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding:9px 10px;border:1px solid rgba(45,212,191,.18);border-radius:10px;background:rgba(45,212,191,.06);flex-wrap:wrap;">' +
          '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;">' +
            '<span style="font-size:11px;color:#2dd4bf;font-weight:900;">' + p9Txt('Marketing sync period', 'Marketing sync period') + ': ' + productSyncPeriodLabel() + ' · ' + p9Txt('Spend platform', 'منصة الإنفاق') + ': ' + FORECAST_PLATFORMS.filter(function (platform) { return platform.id === selectedMarketingPlatform; })[0].label + '</span>' +
            '<span style="font-size:10px;color:rgba(255,255,255,.48);font-weight:700;">' + p9Txt('Matched products', 'المنتجات المطابقة') + ': ' + syncedProductCount + ' / ' + simulations.length + ' · ' + p9Txt('SKU rows', 'صفوف SKU') + ': ' + matchSummary.skuRows + ' · ' + p9Txt('Name fallback rows', 'صفوف مطابقة الاسم') + ': ' + matchSummary.nameRows + ' · ' + p9Txt('Unmatched', 'غير مطابق') + ': ' + matchSummary.unmatchedRows + '</span>' +
            '<span style="font-size:10px;color:#f59e0b;font-weight:700;">' + p9Txt('Best accuracy: include the product SKU in each TikTok, Snapchat, or Facebook campaign name. Name fallback accepts a distinctive single word or matching phrase and normalizes common Arabic spelling variants. Renamed historical campaigns may require a campaign-data refresh before they appear here.', 'لأدق نتيجة: ضع SKU المنتج داخل اسم كل حملة تيك توك أو سناب شات أو فيسبوك. تقبل مطابقة الاسم كلمة مميزة واحدة أو عبارة مطابقة مع توحيد اختلافات الكتابة العربية الشائعة. قد تحتاج أسماء الحملات التاريخية المعدلة إلى تحديث بيانات الحملات قبل أن تظهر هنا.') + '</span>' +
          '</div>' +
          '<button type="button" id="s9-sync-now" style="border:1px solid rgba(168,85,247,.45);background:rgba(168,85,247,.18);color:#fff;border-radius:8px;padding:7px 11px;font-size:11px;font-weight:900;cursor:pointer;font-family:inherit;"' + syncDisabled + '>' + syncLabel + '</button>' +
        '</div>' +
        '<div class="s9-platform-tabs" aria-label="' + p9Txt('Advertising spend platform', 'منصة الإنفاق الإعلاني') + '">' + platformTabs + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:220px;position:relative;">' +
            '<input type="search" id="s9-product-search" value="' + escapeHtml(tableSearchQuery) + '" placeholder="' + p9Txt('Search product name or SKU...', 'ابحث باسم المنتج أو SKU...') + '" ' +
              'style="width:100%;box-sizing:border-box;background:#0b1120;border:1px solid rgba(255,255,255,0.10);border-radius:10px;color:#fff;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;padding:9px 12px;outline:none;transition:border-color .18s,box-shadow .18s;" />' +
          '</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.42);font-weight:800;white-space:nowrap;">' +
            p9Txt('Showing', 'يعرض') + ' ' + totalFilteredRows + ' / ' + simulations.length +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;" class="dash-scroll">' +
        '<table style="width:100%;border-collapse:collapse;text-align:right;">' +
          '<thead style="position:sticky;top:0;background:#0b0f19;z-index:10;border-bottom:1px solid rgba(255,255,255,0.06);font-size:11px;color:rgba(255,255,255,0.4);">' +
            '<tr>' +
              '<th style="padding:10px 16px;font-weight:600;">' + sortHeader(p9Txt('Product', 'المنتج'), 'product') + '</th>' +
              '<th style="padding:10px 16px;font-weight:600;">' + sortHeader(p9Txt('Total Orders', 'إجمالي الطلبات'), 'orders') + '</th>' +
              '<th style="padding:10px 16px;font-weight:600;">' + sortHeader(p9Txt('Delivered Orders', 'الطلبات المسلمة'), 'delivered') + '</th>' +
              '<th style="padding:10px 16px;font-weight:600;">' + sortHeader('NDR ' + p9Txt('Real', 'الفعلي'), 'ndr') + '</th>' +
              '<th style="padding:10px 16px;font-weight:600;">' + sortHeader(p9Txt('Ad Budget', 'الميزانية الإعلانية') + ' (' + viewCurrency + ')', 'spend') + '</th>' +
              '<th style="padding:10px 16px;font-weight:600;text-align:left;">' + sortHeader(p9Txt('Net Profit', 'صافي الربح'), 'profit') + '</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="padding:12px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01);">' +
        (paginationHtml ||
          '<div style="display:flex;justify-content:center;align-items:center;gap:8px;">' +
            '<button class="s9-page-prev" style="background:transparent;border:none;color:' + (currentPage > 1 ? '#fff' : 'rgba(255,255,255,0.2)') + ';cursor:' + (currentPage > 1 ? 'pointer' : 'default') + ';">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
            '</button>' +
            '<div style="display:flex;align-items:center;">' + pagesHtml + '</div>' +
            '<button class="s9-page-next" style="background:transparent;border:none;color:' + (currentPage < totalPages ? '#fff' : 'rgba(255,255,255,0.2)') + ';cursor:' + (currentPage < totalPages ? 'pointer' : 'default') + ';">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"></polyline></svg>' +
            '</button>' +
          '</div>'
        ) +
      '</div>' +
    '</div>';
  }

  // ── 9. Simulator panel builder ──────────────────────────────────────────────
  function buildSimulator() {
    var s = simulations[selectedIdx];
    if (!s) return '<div style="flex:1;"></div>';
    var c = computeSim(s);

    // ── 4 product-level metric mini-cards (mirrors S7 "Real Bot Data" grid) ──
    var metricsHtml =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">' +
        // Taager dashboard/status/NDR migration:
        // Average profit is derived from order profit minus tax profit, then averaged per delivered order.
        _kpiMiniTip(
          p9Txt('Total Orders', 'إجمالي الطلبات'),
          p9Num(c.totalOrders), '#fff', '📦',
          p9Txt('Total Orders', 'إجمالي الطلبات'),
          p9Txt('Total number of orders placed for this product.', 'العدد الكلي للطلبات التي وردت لهذا المنتج.'),
          null
        ) +
        _kpiMiniTip(
          p9Txt('Delivered', 'تم تسليمها'),
          p9Num(Math.round(c.deliveredOrders)) + window.supposedBadgeHtml('delivered'), '#00e676', '✅',
          p9Txt('Delivered Orders', 'الطلبات المسلمة'),
          p9Txt('Orders successfully delivered to customers, based on simulated NDR.', 'الطلبات التي وصلت للعميل بناءً على نسبة التسليم المحاكاة.'),
          'delivered = totalOrders * NDR'
        ) +
        _kpiMiniTip(
          p9Txt('Net Delivery Rate', 'نسبة التسليم NDR'),
          Math.round(s.ndr * 100) + '%' + window.supposedBadgeHtml('dr'), (window.dashboardRateColor ? window.dashboardRateColor(s.ndr, { scale: 'ratio' }) : (s.ndr >= 0.40 ? '#22d3ee' : s.ndr >= 0.30 ? '#00e676' : s.ndr >= 0.20 ? '#f59e0b' : '#ef4444')), '📊',
          p9Txt('Net Delivery Rate (NDR)', 'نسبة التسليم (NDR)'),
          p9Txt('Percentage of orders successfully delivered. Healthy baseline starts at 30%, with top tier at 40%+.', 'النسبة المئوية للطلبات التي تم تسليمها. المعيار الصحي يبدأ من 30%، وأعلى مستوى من 40% فأكثر.'),
          'NDR = deliveredOrders / totalOrders * 100'
        ) +
        _kpiMiniTip(
          p9Txt('Average Profit', 'متوسط الربح'),
          formatMoney(s.realCommission, true) + window.supposedBadgeHtml('profit'), '#3b82f6', '💵',
          p9Txt('Average Profit', 'متوسط الربح'),
          p9Txt('Average profit per delivered order for this selected product.', 'متوسط الربح لكل طلب مسلم لهذا المنتج المحدد.'),
          'averageProfit = productProfitAfterTax / deliveredOrders'
        ) +
        _kpiMiniTip(
          p9Txt('Confirmation Rate', 'نسبة التأكيد'),
          formatPct(s.realConfirmationRate), '#22d3ee', '✓',
          p9Txt('Confirmation Rate', 'نسبة التأكيد'),
          p9Txt('Confirmed orders divided by net placed orders for this selected product.', 'الطلبات المؤكدة مقسومة على صافي الطلبات لهذا المنتج المحدد.'),
          'confirmationRate = confirmedOrders / netOrders'
        ) +
        _kpiMiniTip(
          p9Txt('DR Rate', 'نسبة DR'),
          formatPct(s.realDr), '#60a5fa', '📈',
          p9Txt('DR Rate', 'نسبة DR'),
          p9Txt('Delivered orders divided by confirmed orders for this selected product.', 'الطلبات المسلمة مقسومة على الطلبات المؤكدة لهذا المنتج المحدد.'),
          'DR = deliveredOrders / confirmedOrders'
        ) +
      '</div>';

    // ── Editable NDR input ────────────────────────────────────────────────────
    var ndrInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Net Delivery Rate (NDR)', 'نسبة التسليم (NDR)') + ' ' +
            _tip('📊',
              p9Txt('Net Delivery Rate (NDR)', 'نسبة التسليم (NDR)'),
              p9Txt('Percentage of orders delivered to customers. Below 20% is critical, 30%+ is healthy, 40%+ is top tier.', 'نسبة الطلبات التي وصلت للعميل. أقل من 20% خطر، 30% فأعلى صحي، 40% فأعلى أعلى مستوى.'),
              'NDR = deliveredOrders / totalOrders * 100') +
          '</label>' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.35);">' + p9Txt('Real: ', 'الفعلي: ') + formatPct(s.realNdr) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-ndr-input sfe-input2" min="1" max="100" step="1" value="' + Math.round(s.ndr * 100) + '" placeholder="24" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">%</span>' +
        '</div>' +
        '<div class="sfe-slider-markers" style="margin-top:6px;">' +
          '<span class="sfe-marker sfe-marker--danger">' + p9Txt('DANGER', 'خطر') + '<br>20%</span>' +
          '<span class="sfe-marker sfe-marker--mid">' + p9Txt('GOOD', 'جيد') + '<br>30%</span>' +
          '<span class="sfe-marker sfe-marker--safe">' + p9Txt('TOP', 'الأعلى') + '<br>40%+</span>' +
        '</div>' +
      '</div>';

    // Editable average profit input. avgCommission is retained as a compatibility field.
    var commInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Average Profit / Delivered Order', 'متوسط الربح لكل طلب مسلم') + ' ' +
            _tip('💵',
              p9Txt('Average Profit / Delivered Order', 'متوسط الربح لكل طلب مسلم'),
              p9Txt('Editable average profit assumption used for forecast math. The real KPI above is average profit from the sheet.', 'افتراض متوسط الربح المستخدم في المحاكاة. المؤشر الحقيقي أعلاه هو متوسط الربح من الشيت.'),
              'revenue = deliveredOrders * averageProfitPerDeliveredOrder') +
          '</label>' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Real: ', 'الفعلي: ') + toDisplay(s.realCommission).toFixed(2) + ' ' + viewCurrency + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-comm-input sfe-input2" min="1" step="0.5" value="' + toDisplay(s.avgCommission).toFixed(2) + '" placeholder="32.79" style="direction:ltr;">' +
          '<span class="sfe-input-unit2 s9-comm-unit">' + viewCurrency + '</span>' +
        '</div>' +
      '</div>';

    var spendInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Scenario Ad Budget', 'Scenario Ad Budget') +
          '</label>' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Real: ', 'Real: ') + formatMoney(s.realAdSpend, true) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-sim-spend-input sfe-input2" min="0" step="1" value="' + Math.round(toDisplay(s.adSpend)) + '" placeholder="0" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">' + viewCurrency + '</span>' +
        '</div>' +
        (s.syncedAdSpend ? '<div style="font-size:10px;color:#2dd4bf;font-weight:800;margin-top:8px">' + p9Txt('Real spend loaded from marketing platforms for ', 'تم تحميل الإنفاق الفعلي من منصات التسويق للفترة ') + productSyncPeriodLabel() + '. ' + p9Txt('Edit this scenario freely; Reset to Real Data restores it.', 'يمكنك تعديل السيناريو بحرية؛ زر الرجوع للبيانات الحقيقية يعيد القيمة الفعلية.') + '</div>' : '') +
      '</div>';

    var ordersInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Total Orders', 'Total Orders') +
          '</label>' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Real: ', 'Real: ') + p9Num(s.realOrders) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-total-orders-input sfe-input2" min="0" step="1" value="' + c.totalOrders + '" placeholder="0" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">' + p9Txt('orders', 'orders') + '</span>' +
        '</div>' +
      '</div>';

    var deliveredInputHtml =
      '<div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:5px;">' +
            p9Txt('Delivered Orders', 'Delivered Orders') +
          '</label>' +
          '<span style="font-size:11px;color:rgba(255,255,255,0.35);" dir="ltr">' + p9Txt('Real: ', 'Real: ') + p9Num(s.realDelivered) + '</span>' +
        '</div>' +
        '<div class="sfe-input-wrap2">' +
          '<input type="number" class="s9-delivered-orders-input sfe-input2" min="0" step="1" value="' + c.deliveredOrders + '" placeholder="0" style="direction:ltr;">' +
          '<span class="sfe-input-unit2">' + p9Txt('orders', 'orders') + '</span>' +
        '</div>' +
      '</div>';

    // ── Currency toggle ───────────────────────────────────────────────────────
    var currencyCountries = { SAR: 'SA', USD: 'US', EGP: 'EG', AED: 'AE', IQD: 'IQ', OMR: 'OM' };
    var currToggleHtml =
      '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;">' +
        ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'].map(function (currency) {
          var active = viewCurrency === currency;
          return '<div class="s9-curr-btn ' + (active ? 's9-curr-active' : '') + '" data-curr="' + currency + '" style="display:flex;align-items:center;gap:4px;padding:7px 12px;border-radius:20px;font-size:13px;font-weight:800;cursor:pointer;transition:.2s;' +
            (active ? 'background:rgba(59,130,246,0.18);border:1px solid rgba(59,130,246,0.45);color:#60a5fa;' : 'background:transparent;border:1px solid transparent;color:rgba(255,255,255,0.38);') +
            '"><span style="font-size:9px;font-weight:700;letter-spacing:.04em;opacity:.75">' + currencyCountries[currency] + '</span><span>' + currency + '</span></div>';
        }).join('') +
      '</div>';

    var rateSnap = window.TaagerCurrency && typeof window.TaagerCurrency.snapshot === 'function'
      ? window.TaagerCurrency.snapshot()
      : { source: 'defaults', updatedAt: '' };
    var rateNoteHtml =
      '<div style="background:rgba(59,130,246,0.08);padding:16px;border-radius:12px;border:1px solid rgba(59,130,246,0.18);">' +
        '<div style="font-size:12px;font-weight:900;color:#93c5fd;margin-bottom:5px;">' + p9Txt('Global exchange rates', 'أسعار الصرف العامة') + '</div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.58);line-height:1.6;">' +
          p9Txt('Rates come from the dashboard top bar. Source: ', 'أسعار الصرف من الشريط العلوي. المصدر: ') +
          (rateSnap.source || 'defaults') +
        '</div>' +
      '</div>';

    // ── KPI cards ─────────────────────────────────────────────────────────────
    var npClass = c.netProfit < 0 ? 's9-profit-negative' : c.netProfit > 0 ? 's9-profit-positive' : 's9-profit-zero';
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var npColor = c.netProfit < 0 ? '#ef4444' : (c.netProfit > 0 ? (isLight ? '#10b981' : '#00e676') : (isLight ? '#6b7280' : 'rgba(255,255,255,0.6)'));
    var kpiCardsHtml =
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">' +
        // Net Profit
        '<div class="s7-card">' +
          '<div style="font-size:11px;color:#00e676;font-weight:700;display:flex;align-items:center;gap:4px;">' + p9Txt('Net Profit', 'صافي الربح') + ' ' + _tip('🪙', p9Txt('Net Profit', 'الربح الصافي'), p9Txt('Net profit after deducting ad spend from revenue.', 'الربح بعد خصم الإنفاق من الإيراد.'), 'netProfit = revenue - adSpend') + '</div>' +
          '<div class="s9-kpi-netprofit ' + npClass + '" style="font-size:17px;font-weight:900;color:' + npColor + ' !important;" dir="ltr">' + formatMoney(c.netProfit) + window.supposedBadgeHtml('profit') + '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px;">' + viewCurrency + '</div>' +
        '</div>' +
        // Revenue
        '<div class="s7-card">' +
          '<div style="font-size:11px;color:#3b82f6;font-weight:700;display:flex;align-items:center;gap:4px;">' + p9Txt('Revenue', 'الإيرادات') + ' ' + _tip('💰', p9Txt('Expected Revenue', 'الإيرادات المتوقعة'), p9Txt('Expected revenue from delivered orders × average profit per delivered order.', 'الدخل المتوقع من الطلبات المسلمة × متوسط الربح لكل طلب مسلم.'), 'revenue = deliveredOrders * averageProfitPerDeliveredOrder') + '</div>' +
          '<div style="font-size:17px;font-weight:900;color:#fff;" dir="ltr">' + formatMoney(c.revenue) + window.supposedBadgeHtml('revenue') + '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px;">' + viewCurrency + '</div>' +
        '</div>' +
        // CPA
        '<div class="s7-card">' +
          '<div style="font-size:11px;color:#a855f7;font-weight:700;display:flex;align-items:center;gap:4px;">CPA ' + _tip('🎯', p9Txt('Cost Per Acquisition (CPA)', 'تكلفة الطلب (CPA)'), p9Txt('Cost per acquired order. Should be lower than average profit per delivered order for profitability.', 'تكلفة الحصول على طلب واحد. يجب أن تكون أقل من متوسط الربح لكل طلب مسلم لضمان الربح.'), 'CPA = adSpend / totalOrders') + '</div>' +
          '<div style="font-size:17px;font-weight:900;color:#fff;" dir="ltr">' + formatMoney(c.cpa, false, 2) + '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px;">' + viewCurrency + '</div>' +
        '</div>' +
        // Break-even CPA
        '<div class="s7-card">' +
          '<div style="font-size:11px;color:#f59e0b;font-weight:700;display:flex;align-items:center;gap:4px;">' + p9Txt('Break-even CPA', 'تكلفة التعادل') + ' ' + _tip('⚖️', p9Txt('Break-even CPA', 'تكلفة الاكتساب عند التعادل'), p9Txt('Maximum CPA before this product starts losing money. It equals average profit per delivered order multiplied by NDR.', 'أعلى تكلفة اكتساب قبل أن يبدأ هذا المنتج بالخسارة. يساوي متوسط الربح لكل طلب مسلم مضروبا في نسبة التسليم الصافي.'), 'Break-even CPA = averageProfitPerDeliveredOrder * NDR') + '</div>' +
          '<div class="s9-kpi-breakeven" style="font-size:17px;font-weight:900;color:' + (c.cpa > c.breakEvenCpa ? '#ef4444' : '#f59e0b') + ';" dir="ltr">' + formatMoney(c.breakEvenCpa, false, 2) + window.supposedBadgeHtml('breakeven') + '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px;">' + viewCurrency + '</div>' +
        '</div>' +
        // Delivered Orders
        '<div class="s7-card">' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.5);font-weight:700;display:flex;align-items:center;gap:4px;">' + p9Txt('Delivered', 'مسلمة') + ' ' + _tip('✅', p9Txt('Delivered Orders', 'الطلبات المسلمة'), p9Txt('Number of orders delivered based on simulated NDR.', 'عدد الطلبات المسلمة بناءً على نسبة التسليم المحاكاة.'), 'delivered = totalOrders * NDR') + '</div>' +
          '<div style="font-size:17px;font-weight:900;color:#fff;">' + p9Num(Math.round(c.deliveredOrders)) + window.supposedBadgeHtml('delivered') + '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px;">' + p9Txt('orders', 'طلب') + '</div>' +
        '</div>' +
      '</div>';

    return '<div style="flex:1;display:flex;flex-direction:column;background:#0b0f19;overflow-y:auto;" class="dash-scroll">' +

      // Header + currency toggle
      '<div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">' +
        '<div style="min-width:0;flex:1;overflow:hidden;">' +
          '<div style="font-size:12px;color:#3b82f6;font-weight:700;letter-spacing:1px;margin-bottom:4px;white-space:nowrap;">' + p9Txt('PRODUCT SMART FORECAST', 'مُحاكي التوقعات الذكية') + '</div>' +
          '<div data-i18n-preserve style="font-size:18px;font-weight:900;color:#fff;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35;word-break:break-word;" title="' + s.name.replace(/"/g, '&quot;') + '">' + s.name + '</div>' +
          '<div style="font-size:10px;font-weight:700;color:' + (s.syncedAdSpend ? '#2dd4bf' : '#f59e0b') + ';margin-top:5px;">SKU: ' + (s.sku || 'N/A') + ' · ' + matchMethodLabel(s) + '</div>' +
        '</div>' +
        '<div style="flex-shrink:0;margin-top:2px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">' +
          '<button type="button" class="s9-reset-real-btn" style="border:1px solid ' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.45)') + ';background:' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.10)') + ';color:' + (document.documentElement.getAttribute('data-theme') === 'light' ? '#15803d' : '#86efac') + ';border-radius:9px;padding:8px 12px;font-size:11px;font-weight:900;font-family:inherit;cursor:pointer;">' + p9Txt('Reset to Real Data', 'Reset to Real Data') + '</button>' +
          currToggleHtml +
        '</div>' +
      '</div>' +

      '<div data-sim-panel="1" style="padding:24px;display:flex;flex-direction:column;gap:20px;">' +

        // 4-metric product panel
        metricsHtml +

        // Gauge
        '<div style="background:rgba(255,255,255,0.01);border:1px solid rgba(255,255,255,0.04);border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:center;">' +
          '<div style="font-size:13px;font-weight:800;color:rgba(255,255,255,0.8);margin-bottom:4px;display:flex;align-items:center;gap:6px;">' +
            p9Txt('ROI Gauge', 'مقياس العائد على الاستثمار') + ' ' +
            _tip('📊', p9Txt('Return on Investment (ROI)', 'العائد على الاستثمار (ROI)'), p9Txt('Measures campaign profitability. 0% = break-even, positive = profit, negative = loss.', 'يقيس ربحية الحملة. 0% تعادل، موجب ربح، سالب خسارة.'), 'ROI = (netProfit / adSpend) * 100%') +
          '</div>' +
          '<div id="s9-gauge-wrap" style="width:100%;max-width:340px;">' + gaugeHtml(c.roi) + '</div>' +
        '</div>' +

        // Controls: scenario inputs
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
          ordersInputHtml +
          spendInputHtml +
          ndrInputHtml +
          deliveredInputHtml +
          commInputHtml +
          rateNoteHtml +
        '</div>' +

        // KPI Cards row
        kpiCardsHtml +

        // Insights feed
        '<div>' +
          '<div style="font-size:12px;font-weight:800;color:rgba(255,255,255,0.8);margin-bottom:12px;display:flex;align-items:center;gap:6px;">' +
            '🧠 ' + p9Txt('Smart Insights', 'المساعد الذكي') +
          '</div>' +
          '<div class="sfe-insights-feed">' + renderInsightsFeed(s, c) + '</div>' +
        '</div>' +

      '</div>' +
    '</div>';
  }

  // ── 10. CSS ─────────────────────────────────────────────────────────────────
  var cssIsLight = document.documentElement.getAttribute('data-theme') === 'light';
  var CSS =
    // ── FIX: Profit cell color classes — !important overrides any theme CSS ──
    // These three classes are the single source of truth for profit cell colors.
    // Using !important ensures they win over any dashboard light/dark theme rules.
    (cssIsLight ?
      '.s9-profit-cell.s9-profit-negative,.s9-profit-value.s9-profit-negative { color: #ef4444 !important; -webkit-text-fill-color: #ef4444 !important; }' +
      '.s9-profit-cell.s9-profit-positive,.s9-profit-value.s9-profit-positive { color: #10b981 !important; -webkit-text-fill-color: #10b981 !important; }' +
      '.s9-profit-cell.s9-profit-zero,.s9-profit-value.s9-profit-zero { color: #6b7280 !important; -webkit-text-fill-color: #6b7280 !important; }' +

      // KPI card Net Profit value — same classes reused
      '.s9-kpi-netprofit.s9-profit-negative { color: #ef4444 !important; }' +
      '.s9-kpi-netprofit.s9-profit-positive { color: #10b981 !important; }' +
      '.s9-kpi-netprofit.s9-profit-zero     { color: #6b7280 !important; }'
      :
      '.s9-profit-cell.s9-profit-negative,.s9-profit-value.s9-profit-negative { color: #ef4444 !important; -webkit-text-fill-color: #ef4444 !important; }' +
      '.s9-profit-cell.s9-profit-positive,.s9-profit-value.s9-profit-positive { color: #00e676 !important; -webkit-text-fill-color: #00e676 !important; }' +
      '.s9-profit-cell.s9-profit-zero,.s9-profit-value.s9-profit-zero { color: rgba(255,255,255,0.6) !important; -webkit-text-fill-color: rgba(255,255,255,0.6) !important; }' +

      // KPI card Net Profit value — same classes reused
      '.s9-kpi-netprofit.s9-profit-negative { color: #ef4444 !important; }' +
      '.s9-kpi-netprofit.s9-profit-positive { color: #00e676 !important; }' +
      '.s9-kpi-netprofit.s9-profit-zero     { color: rgba(255,255,255,0.6) !important; }'
    ) +
    '.s9-sort-btn{appearance:none;background:transparent;border:0;color:inherit;font:inherit;font-weight:700;padding:0;cursor:pointer;white-space:nowrap}' +
    '.s9-sort-btn:hover,.s9-sort-btn.is-active{color:#60a5fa}' +
    '.s9-clear-sort{border:1px solid rgba(255,255,255,.14);background:transparent;color:rgba(255,255,255,.65);padding:5px 9px;border-radius:7px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}' +
    '.s9-clear-sort:disabled{opacity:.35;cursor:default}' +
    '.s9-platform-tabs{display:flex;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap}' +
    '.s9-platform-tab{border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.55);border-radius:999px;padding:6px 12px;font:inherit;font-size:11px;font-weight:900;cursor:pointer}' +
    '.s9-platform-tab:hover{border-color:rgba(96,165,250,.45);color:#93c5fd}' +
    '.s9-platform-tab.is-active{border-color:rgba(59,130,246,.55);background:rgba(59,130,246,.16);color:#60a5fa}' +

    // ── Dark background for all input wrapper containers ──
    '[data-sim-panel] > div > div[style*="border-radius:12px"],' +
    '[data-sim-panel] div[style*="border-radius:12px"][style*="rgba(255,255,255,0.02)"]' +
    '{background:rgba(255,255,255,0.02)!important;color-scheme:dark}' +

    // Input wrap — exact S7 SFE pattern
    '.sfe-input-wrap2{display:flex;align-items:center;background:' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(12, 56, 70, 0.47)' : 'rgba(255,255,255,0.06)') + ';border:1px solid rgba(255,255,255,0.12);border-radius:8px;overflow:hidden;transition:border-color .2s;color-scheme:dark}' +
    '.sfe-input-wrap2:focus-within{border-color:rgba(0,229,160,.4);box-shadow:0 0 0 2px rgba(0,229,160,0.08)}' +
    '.sfe-input2{background:#161921!important;border:none;outline:none;color:#f0f1f3!important;font-size:15px;font-weight:600;padding:9px 12px;width:100%;-moz-appearance:textfield;font-family:Cairo,sans-serif;caret-color:#00e5a0;color-scheme:dark}' +
    '.sfe-input2::-webkit-inner-spin-button,.sfe-input2::-webkit-outer-spin-button{-webkit-appearance:none}' +
    // Force dark autofill styles
    '.sfe-input2:-webkit-autofill,.sfe-input2:-webkit-autofill:hover,.sfe-input2:-webkit-autofill:focus' +
    '{-webkit-text-fill-color:#f0f1f3!important;-webkit-box-shadow:0 0 0px 1000px ' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgb(41, 8, 41)' : 'rgba(255,255,255,0.06)') + ' inset!important;transition:background-color 5000s ease-in-out 0s}' +
    '.sfe-input-unit2{padding:0 12px;font-size:11px;font-weight:600;color:#4d5066;letter-spacing:.06em;white-space:nowrap;border-left:1px solid rgba(255,255,255,0.07);flex-shrink:0;}' +

    // NDR markers
    '.sfe-slider-markers{display:flex;justify-content:space-between;margin-top:4px}' +
    '.sfe-marker{font-size:9px;font-weight:700;text-align:center;line-height:1.3}' +
    '.sfe-marker--danger{color:#ff3b5c}.sfe-marker--mid{color:#f5a623}.sfe-marker--safe{color:#22d3ee}' +

    // Tooltip badge
    '.s7-tip-badge{width:18px;height:18px;border-radius:50%;background:' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(37,99,235,0.12)' : 'rgba(59,130,246,0.16)') + ';border:1px solid rgba(96,165,250,0.55);color:#93c5fd;font-size:11px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;cursor:help;transition:background .18s,border-color .18s,color .18s;font-family:system-ui,sans-serif;flex-shrink:0;vertical-align:middle;line-height:1;user-select:none}' +
    '.s7-tip-badge:hover{background:rgba(59,130,246,0.28);border-color:rgba(59,130,246,0.7);color:#93c5fd}' +

    // S7 KPI card
    '.s7-card{background:linear-gradient(145deg,rgba(30,41,59,0.4),rgba(15,23,42,0.6));border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;position:relative;overflow:hidden;transition:.2s}' +
    '.s7-card:hover{border-color:rgba(255,255,255,0.15);transform:translateY(-2px)}' +

    // SFE insight cards
    '.sfe-insights-feed{display:flex;flex-direction:column;gap:8px}' +
    '.sfe-insight{display:flex;gap:10px;padding:11px 13px;border-radius:9px;border:1px solid transparent;animation:sfeIn .3s ease}' +
    '@keyframes sfeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}' +
    '.sfe-insight--positive{background:rgba(0,229,160,.05);border-color:rgba(0,229,160,.15)}' +
    '.sfe-insight--negative{background:rgba(255,59,92,.05);border-color:rgba(255,59,92,.15)}' +
    '.sfe-insight--warning{background:rgba(245,166,35,.05);border-color:rgba(245,166,35,.15)}' +
    '.sfe-insight--info{background:rgba(77,166,255,.05);border-color:rgba(77,166,255,.12)}' +
    '.sfe-insight--critical{background:rgba(255,59,92,.08);border-color:rgba(255,59,92,.3)}' +
    '.sfe-insight-icon{font-size:14px;flex-shrink:0;margin-top:1px}' +
    '.sfe-insight-body{flex:1}' +
    '.sfe-insight-category{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4d5066;margin-bottom:3px}' +
    '.sfe-insight-text{font-size:12px;color:#8b8fa8;line-height:1.55}' +
    '.sfe-insight-text strong{color:#f0f1f3;font-weight:600}' +
    '.sfe-insight-text .hi-green{color:#00e5a0;font-weight:600}' +
    '.sfe-insight-text .hi-cyan{color:#22d3ee;font-weight:600}' +
    '.sfe-insight-text .hi-red{color:#ff3b5c;font-weight:600}' +
    '.sfe-insight-text .hi-yellow{color:#f5a623;font-weight:600}' +

    // Row hover
    '.s9-row:hover{background:rgba(255,255,255,0.03)!important}' +

    // Spend input (table column)
    '.s9-spend-input{background:rgba(0,0,0,0.3)!important;color:#fff!important;color-scheme:dark}' +
    '.s9-spend-input:focus{outline:none;border-color:#3b82f6!important;background:rgba(59,130,246,0.1)!important}';

  // ── 11. Inject global CSS into <head> so it beats dashboard stylesheets ─────
  function injectGlobalCSS() {
    var existingTag = document.getElementById('s9-forecast-global-css');
    if (existingTag) existingTag.parentNode.removeChild(existingTag);
    var tag = document.createElement('style');
    tag.id = 's9-forecast-global-css';
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }

  // ── Apply profit color directly on element via style attribute (nuclear) ────
  // Belt-and-suspenders: class + !important in <head> + inline style.
  // One of the three will always win regardless of dashboard CSS architecture.
  function applyProfitColor(el, val) {
    if (!el) return;
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var color = val < 0 ? '#ef4444' : val > 0 ? (isLight ? '#10b981' : '#00e676') : (isLight ? '#6b7280' : 'rgba(255,255,255,0.6)');
    el.className = el.className.replace(/\bs9-profit-(?:negative|positive|zero)\b/g, '').trim() +
                   ' ' + profitClass(val);
    el.style.setProperty('color', color, 'important');
    el.style.setProperty('-webkit-text-fill-color', color, 'important');
    el.querySelectorAll('.s9-profit-value').forEach(function (child) {
      child.className = child.className.replace(/\bs9-profit-(?:negative|positive|zero)\b/g, '').trim() +
                        ' ' + profitClass(val);
      child.style.setProperty('color', color, 'important');
      child.style.setProperty('-webkit-text-fill-color', color, 'important');
    });
  }

  // ── 12. Main render ─────────────────────────────────────────────────────────
  function renderAll() {
    injectGlobalCSS();
    mountEl.innerHTML =
      '<div style="display:flex;width:100%;height:100%;background:#070a13;font-family:\'Cairo\',sans-serif;">' +
        buildTable() +
        buildSimulator() +
      '</div>';

    // Apply profit colors directly after render (belt-and-suspenders)
    mountEl.querySelectorAll('.s9-profit-cell').forEach(function (cell) {
      var row = cell.closest('.s9-row');
      if (!row) return;
      var idx = parseInt(row.getAttribute('data-idx'));
      var rs  = simulations[idx];
      var realNetProfit = (Math.max(0, Math.round(Number(rs.realDelivered) || 0)) * rs.realCommission) - rs.realAdSpend;
      applyProfitColor(cell, realNetProfit);
    });

    bindEvents();
    initTooltips();
  }

  // ── 12. Smart update — avoids full re-render during input (no focus loss) ──
  function updateSimulatorOnly() {
    var s = simulations[selectedIdx];
    if (!s) return;
    var c = computeSim(s);

    // Gauge
    var gaugeWrap = mountEl.querySelector('#s9-gauge-wrap');
    if (gaugeWrap) gaugeWrap.innerHTML = gaugeHtml(c.roi);

    // KPI cards — update text nodes only
    var cards = mountEl.querySelectorAll('.s7-card');
    if (cards.length >= 5) {
      // Net Profit — update text AND color (class + inline important)
      var npEl = cards[0].querySelector('.s9-kpi-netprofit');
      if (npEl) {
        npEl.innerHTML = formatMoney(c.netProfit) + window.supposedBadgeHtml('profit');
        applyProfitColor(npEl, c.netProfit);
      }
      // Revenue
      var revEl = cards[1].querySelector('div:nth-child(2)');
      if (revEl) revEl.innerHTML = formatMoney(c.revenue) + window.supposedBadgeHtml('revenue');
      // CPA
      var cpaEl = cards[2].querySelector('div:nth-child(2)');
      if (cpaEl) cpaEl.textContent = formatMoney(c.cpa, false, 2);
      // Break-even CPA
      var beEl = cards[3].querySelector('.s9-kpi-breakeven');
      if (beEl) {
        beEl.innerHTML = formatMoney(c.breakEvenCpa, false, 2) + window.supposedBadgeHtml('breakeven');
        beEl.style.color = c.cpa > c.breakEvenCpa ? '#ef4444' : '#f59e0b';
      }
      // Delivered
      var delEl = cards[4].querySelector('div:nth-child(2)');
      if (delEl) delEl.innerHTML = p9Num(Math.round(c.deliveredOrders)) + window.supposedBadgeHtml('delivered');
    }

    // Metric mini-cards (4-grid above gauge)
    var simPanel = mountEl.querySelector('[data-sim-panel]');
    if (simPanel) {
      var metricVals = simPanel.querySelectorAll('.s9-metric-val');
      if (metricVals[0]) metricVals[0].textContent = p9Num(c.totalOrders);
      if (metricVals[1]) metricVals[1].innerHTML = p9Num(Math.round(c.deliveredOrders)) + window.supposedBadgeHtml('delivered');
      if (metricVals[2]) metricVals[2].innerHTML = Math.round(s.ndr * 100) + '%' + window.supposedBadgeHtml('dr');
      if (metricVals[3]) metricVals[3].innerHTML = toDisplay(s.avgCommission).toFixed(2) + ' ' + viewCurrency + window.supposedBadgeHtml('profit');
      if (metricVals[4]) metricVals[4].textContent = formatPct(s.realConfirmationRate);
      if (metricVals[5]) metricVals[5].textContent = formatPct(s.realDr);
    }

    var totalInput = mountEl.querySelector('.s9-total-orders-input');
    if (totalInput && document.activeElement !== totalInput) totalInput.value = c.totalOrders;
    var deliveredInput = mountEl.querySelector('.s9-delivered-orders-input');
    if (deliveredInput && document.activeElement !== deliveredInput) deliveredInput.value = c.deliveredOrders;
    var ndrInput = mountEl.querySelector('.s9-ndr-input');
    if (ndrInput && document.activeElement !== ndrInput) ndrInput.value = Math.round(s.ndr * 100);
    var spendInput = mountEl.querySelector('.s9-sim-spend-input');
    if (spendInput && document.activeElement !== spendInput) spendInput.value = Math.round(toDisplay(s.adSpend));

    // Insights feed
    var feedEl = mountEl.querySelector('.sfe-insights-feed');
    if (feedEl) feedEl.innerHTML = renderInsightsFeed(s, c);

    // ── Sync table row profit — text + class + inline important (belt-and-suspenders) ──
    var rows = mountEl.querySelectorAll('.s9-row');
    rows.forEach(function (row) {
      var idx = parseInt(row.getAttribute('data-idx'));
      var rs  = simulations[idx];
      var realNetProfit = (Math.max(0, Math.round(Number(rs.realDelivered) || 0)) * rs.realCommission) - rs.realAdSpend;
      var profitCell = row.querySelector('.s9-profit-cell');
      if (profitCell) {
        var profitValue = profitCell.querySelector('.s9-profit-value');
        if (!profitValue) {
          profitValue = document.createElement('span');
          profitValue.className = 's9-profit-value';
          profitCell.textContent = '';
          profitCell.appendChild(profitValue);
        }
        profitValue.innerHTML = formatMoney(realNetProfit) + window.supposedBadgeHtml('profit');
        applyProfitColor(profitCell, realNetProfit);
      }
    });
  }

  // ── 13. Event binding ───────────────────────────────────────────────────────
  function bindEvents() {
    mountEl.querySelectorAll('.s9-platform-tab').forEach(function (button) {
      button.addEventListener('click', function () {
        var nextPlatform = button.getAttribute('data-s9-platform') || 'all';
        if (nextPlatform === selectedMarketingPlatform) return;
        mountEl._s9MarketingPlatform = nextPlatform;
        mountEl._s9SelectedProductId = simulations[selectedIdx] && simulations[selectedIdx].id;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSortBy = tableSortBy;
        mountEl._s9TableSortDir = tableSortDir;
        mountEl._s9TableSearchQuery = tableSearchQuery;
        window.renderSectionProductForecast(mountEl, data, ctx);
      });
    });

    mountEl.querySelectorAll('.s9-sort-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-sort') || '';
        if (!key) return;
        if (tableSortBy === key) {
          tableSortDir = tableSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          tableSortBy = key;
          tableSortDir = 'desc';
        }
        currentPage = 1;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSortBy = tableSortBy;
        mountEl._s9TableSortDir = tableSortDir;
        renderAll();
      });
    });

    var clearSortBtn = mountEl.querySelector('#s9-clear-sort');
    if (clearSortBtn) {
      clearSortBtn.addEventListener('click', function () {
        tableSortBy = '';
        tableSortDir = 'desc';
        currentPage = 1;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSortBy = tableSortBy;
        mountEl._s9TableSortDir = tableSortDir;
        renderAll();
      });
    }

    var productSearch = mountEl.querySelector('#s9-product-search');
    if (productSearch) {
      productSearch.addEventListener('input', function () {
        tableSearchQuery = productSearch.value || '';
        currentPage = 1;
        mountEl._s9CurrentPage = currentPage;
        mountEl._s9TableSearchQuery = tableSearchQuery;
        if (tableSearchTimer) clearTimeout(tableSearchTimer);
        tableSearchTimer = setTimeout(function () {
          renderAll();
        }, 120);
      });
      productSearch.addEventListener('focus', function () {
        productSearch.style.borderColor = '#3b82f6';
        productSearch.style.boxShadow = '0 0 0 2px rgba(59,130,246,0.16)';
      });
      productSearch.addEventListener('blur', function () {
        productSearch.style.borderColor = 'rgba(255,255,255,0.10)';
        productSearch.style.boxShadow = 'none';
      });
    }

    // Row clicks
    mountEl.querySelectorAll('.s9-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.tagName === 'INPUT') return;
        selectedIdx = parseInt(row.getAttribute('data-idx'));
        mountEl._s9SelectedProductId = simulations[selectedIdx] && simulations[selectedIdx].id;
        renderAll();
      });
    });

    // Ad Spend inputs (table column)
    mountEl.querySelectorAll('.s9-spend-input').forEach(function (inp) {
      inp.addEventListener('input', function (e) {
        var idx = parseInt(e.target.getAttribute('data-idx'));
        var val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
        var newSpend = toSAR(val);
        simulations[idx].realAdSpend = newSpend;
        if (!simulations[idx].isModified) simulations[idx].adSpend = newSpend;
        localStorage.setItem('kbot_s9_spend_' + simulations[idx].id, newSpend);
        selectedIdx = idx;

        var act    = document.activeElement;
        var actIdx = act ? act.getAttribute('data-idx') : null;
        renderAll();
        if (actIdx !== null) {
          var newInp = mountEl.querySelector('.s9-spend-input[data-idx="' + actIdx + '"]');
          if (newInp) {
            newInp.focus();
            var len = newInp.value.length;
            if (newInp.setSelectionRange) newInp.setSelectionRange(len, len);
          }
        }
      });
    });

    // Scenario Ad Spend input (simulator panel)
    var simSpendInp = mountEl.querySelector('.s9-sim-spend-input');
    if (simSpendInp) {
      simSpendInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        simulations[selectedIdx].adSpend = toSAR(v);
        simulations[selectedIdx].isModified = true;
        updateSimulatorOnly();
      });
    }

    var totalOrdersInp = mountEl.querySelector('.s9-total-orders-input');
    if (totalOrdersInp) {
      totalOrdersInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        setSimTotalOrders(simulations[selectedIdx], v);
        updateSimulatorOnly();
      });
    }

    var deliveredOrdersInp = mountEl.querySelector('.s9-delivered-orders-input');
    if (deliveredOrdersInp) {
      deliveredOrdersInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        setSimDeliveredOrders(simulations[selectedIdx], v);
        updateSimulatorOnly();
      });
    }

    var ndrInp = mountEl.querySelector('.s9-ndr-input');
    if (ndrInp) {
      ndrInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        setSimNdr(simulations[selectedIdx], v);
        updateSimulatorOnly();
      });
      ndrInp.addEventListener('blur', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 1) { e.target.value = Math.round(simulations[selectedIdx].ndr * 100); return; }
        if (v > 100) e.target.value = '100';
      });
    }

    var commInp = mountEl.querySelector('.s9-comm-input');
    if (commInp) {
      commInp.addEventListener('input', function (e) {
        var v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        simulations[selectedIdx].avgCommission = toSAR(v);
        simulations[selectedIdx].isModified    = true;
        updateSimulatorOnly();
        var unitEl = mountEl.querySelector('.s9-comm-unit');
        if (unitEl) unitEl.textContent = viewCurrency;
      });
    }

    var resetBtn = mountEl.querySelector('.s9-reset-real-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        resetSimulationToReal(simulations[selectedIdx]);
        renderAll();
      });
    }

    var syncNowBtn = mountEl.querySelector('#s9-sync-now');
    if (syncNowBtn && window.DashboardMarketingState && typeof window.DashboardMarketingState.sync === 'function') {
      syncNowBtn.addEventListener('click', function () {
        var period = forecastPeriod || {};
        syncNowBtn.disabled = true;
        syncNowBtn.textContent = p9Txt('Syncing...', 'Syncing...');
        window.DashboardMarketingState.sync(forecastAccountId, {
          dateFrom: period.from || period.dateFrom || period.start || '',
          dateTo: period.to || period.dateTo || period.end || '',
          targetCurrency: viewCurrency || window.dashboardActiveCurrency || 'SAR',
          egpRate: egpRate || 52
        }).then(function () {
          window.renderSectionProductForecast(mountEl, data, ctx);
        });
      });
    }

    // Currency toggle
    mountEl.querySelectorAll('.s9-curr-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var newCurr = e.currentTarget.getAttribute('data-curr');
        if (newCurr === viewCurrency) return;
        viewCurrency = newCurr;
        if (window.DashboardRoiState) {
          forecastRoiSettings = window.DashboardRoiState.set(
            { currency: newCurr },
            forecastAccountId,
            forecastRoiSettings
          );
        }
        renderAll();
      });
    });

    // Pagination
    var totalPages = Math.ceil(simulations.length / itemsPerPage);
    mountEl.querySelectorAll('.s9-page-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        currentPage = parseInt(e.target.getAttribute('data-page'));
        mountEl._s9CurrentPage = currentPage;
        renderAll();
      });
    });
    var prevBtn = mountEl.querySelector('.s9-page-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (currentPage > 1) {
          currentPage--;
          mountEl._s9CurrentPage = currentPage;
          renderAll();
        }
      });
    }
    var nextBtn = mountEl.querySelector('.s9-page-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (currentPage < totalPages) {
          currentPage++;
          mountEl._s9CurrentPage = currentPage;
          renderAll();
        }
      });
    }
  }

  // ── 14. Boot ────────────────────────────────────────────────────────────────
  renderAll();
  var baseSectionCleanup = mountEl._dashboardSectionCleanup;
  mountEl._dashboardSectionCleanup = function () {
    if (typeof baseSectionCleanup === 'function') baseSectionCleanup();
    if (mountEl._s9TooltipCleanup) {
      mountEl._s9TooltipCleanup();
      mountEl._s9TooltipCleanup = null;
    }
    if (mountEl._s9ThemeObserver) {
      mountEl._s9ThemeObserver.disconnect();
      mountEl._s9ThemeObserver = null;
    }
  };
  if (window.DashboardRoiState) {
    if (mountEl._s9RoiListener) window.DashboardRoiState.unsubscribe(mountEl._s9RoiListener);
    mountEl._s9RoiListener = function (settings) {
      if (ctx && ctx.sectionId && ctx.sectionId !== 'productForecast') return;
      if (!settings || String(settings.accountId) !== String(forecastAccountId)) return;
      var nextCurrency = settings.currency || 'SAR';
      var nextRate = Number(settings.egpRate) > 0 ? Number(settings.egpRate) : 52.0;
      var changed = nextCurrency !== viewCurrency || nextRate !== egpRate;
      forecastRoiSettings = settings;
      if (!changed) return;
      viewCurrency = nextCurrency;
      egpRate = nextRate;
      renderAll();
    };
    window.DashboardRoiState.subscribe(mountEl._s9RoiListener);
    var forecastSettingsObserver = new MutationObserver(function () {
      if (!document.body.contains(mountEl) && mountEl._s9RoiListener) {
        window.DashboardRoiState.unsubscribe(mountEl._s9RoiListener);
        mountEl._s9RoiListener = null;
      }
    });
    forecastSettingsObserver.observe(document.body, { childList: true, subtree: true });
    var previousRoiCleanup = mountEl._dashboardSectionCleanup;
    mountEl._dashboardSectionCleanup = function () {
      if (typeof previousRoiCleanup === 'function') previousRoiCleanup();
      if (mountEl._s9RoiListener) {
        window.DashboardRoiState.unsubscribe(mountEl._s9RoiListener);
        mountEl._s9RoiListener = null;
      }
      forecastSettingsObserver.disconnect();
    };
  }
  if (window.DashboardMarketingState) {
    if (mountEl._s9MarketingListener) window.DashboardMarketingState.unsubscribe(mountEl._s9MarketingListener);
    mountEl._s9MarketingListener = function (next) {
      if (ctx && ctx.sectionId && ctx.sectionId !== 'productForecast') return;
      if (!next || String(next.accountId) !== String(forecastAccountId)) return;
      window.renderSectionProductForecast(mountEl, data, ctx);
    };
    window.DashboardMarketingState.subscribe(mountEl._s9MarketingListener);
    var previousCleanup = mountEl._dashboardSectionCleanup;
    mountEl._dashboardSectionCleanup = function () {
      if (typeof previousCleanup === 'function') previousCleanup();
      if (mountEl._s9MarketingListener) {
        window.DashboardMarketingState.unsubscribe(mountEl._s9MarketingListener);
        mountEl._s9MarketingListener = null;
      }
      if (mountEl._s9ThemeObserver) {
        mountEl._s9ThemeObserver.disconnect();
        mountEl._s9ThemeObserver = null;
      }
    };
    if (forecastAccountId !== '__all__' && mountEl._s9MarketingLoadedAccount !== forecastAccountId &&
        typeof window.DashboardMarketingState.load === 'function') {
      mountEl._s9MarketingLoadedAccount = forecastAccountId;
      window.DashboardMarketingState.load(forecastAccountId);
    }
  }
};
