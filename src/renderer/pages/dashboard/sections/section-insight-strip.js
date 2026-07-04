/* ══════════════════════════════════════════════════════════════════════════════
   section-insight-strip.js  (T-20)
   Renders a horizontally-scrollable strip of auto-generated insight cards
   produced by dashboard-insight-engine.js (T-19).

   Depends on:
     window.runInsightEngine()     — from dashboard-insight-engine.js (T-19)
     window.DashboardFilterBus     — from dashboard-filter-bus.js (T-13) [optional]
     window.dashboardGeoData       — set by dashboard-aggregator.js after aggregation

   Exposed on window:
     window.renderInsightStrip(mountEl, geoData)
       mountEl  — DOM element to render into
       geoData  — aggregator output object (data); if omitted, reads window.dashboardGeoData

   The strip shows up to 12 insights, priority-sorted (critical → high → medium → low).
   Each card has a dismiss [✕] button that hides it locally.
   Clicking a city/product card tag syncs with DashboardFilterBus if available.
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function getIsAr() {
    return window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  }
  function pick(en, ar) {
    return window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (getIsAr() ? ar : en);
  }
  function s6Txt(en, ar) { return pick(en, ar); }
  function sTx(en, ar) { return pick(en, ar); }
  function tx(en, ar) { return pick(en, ar); }
  function dashText(en, ar) { return pick(en, ar); }
  function pct(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    return (n * 100).toFixed(2).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '') + '%';
  }

  var C = {
    card: '#0b1120',
    border: 'rgba(255,255,255,0.06)',
    muted: 'rgba(255,255,255,0.4)',
    text: 'rgba(255,255,255,0.9)',
    green: '#3DDC97',
    red: '#ef4444',
    prepaid: '#8B7CF6',
    cod: '#F4B860'
  };

  /* ── Helper: metric pill ─────────────────────────────────────────────────── */
  function metricPill(label, value) {
    return '<div style="display:flex;flex-direction:column;align-items:center;' +
      'background:rgba(255,255,255,0.05);border-radius:var(--dash-radius-sm);padding:5px 10px;min-width:52px;">' +
      '<span style="font-size:var(--type-body);font-weight:var(--weight-semibold);color:#fff;line-height:1;">' + value + '</span>' +
      '<span style="font-size:var(--type-micro);color:rgba(255,255,255,0.35);margin-top:2px;">' + label + '</span>' +
    '</div>';
  }

  /* ── Build metric pills from insight.metric ──────────────────────────────── */
  function buildMetrics(ins) {
    var m = ins.metric || {};
    var pills = [];
    if (m.ndr !== undefined)         pills.push(metricPill('NDR',      pct(m.ndr)));
    if (m.dr !== undefined)          pills.push(metricPill('DR',       pct(m.dr)));
    if (m.orders !== undefined)      pills.push(metricPill(sTx('Orders', 'طلبات'),    m.orders));
    if (m.prepaidPct !== undefined)  pills.push(metricPill(sTx('Prepaid', 'مسبق'),     Math.round(m.prepaidPct * 100) + '%'));
    if (m.codNdr !== undefined)      pills.push(metricPill('COD NDR',  pct(m.codNdr)));
    if (m.prepaidNdr !== undefined)  pills.push(metricPill(sTx('Prepaid NDR', 'مسبق NDR'), pct(m.prepaidNdr)));
    if (m.advantage !== undefined)   pills.push(metricPill(sTx('Advantage', 'فارق'),     '+' + Math.round(m.advantage * 100) + '%'));
    if (m.provinceNdr !== undefined) pills.push(metricPill('NDR',      pct(m.provinceNdr)));
    if (m.scalingScore !== undefined)pills.push(metricPill(sTx('Scaling', 'توسع'),     m.scalingScore));
    if (m.riskScore !== undefined)   pills.push(metricPill(sTx('Risk Score', 'خطورة'),    m.riskScore));

    if (pills.length === 0) return '';
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;margin-bottom:10px;">' + pills.join('') + '</div>';
  }

  var recsState = {
    activeTab: 'risk',
    page: 1,
    pageSize: 6,
    data: { risk: [], opportunity: [], recommendation: [], observation: [] },
    geo: null
  };

  function updateRecsState(insights, geo) {
    recsState.geo = geo;
    recsState.data = { risk: [], opportunity: [], recommendation: [], observation: [] };

    var typeColors = {
      risk: '#F4B860',             // Calm Light Orange
      opportunity: '#81C784',      // Calm Pastel Green
      recommendation: '#9FA8DA',   // Calm Pastel Indigo
      observation: '#90CAF9'       // Calm Light Blue
    };
    var typeEmojis = {
      risk: '⚠️',
      opportunity: '📈',
      recommendation: '✨',
      observation: '🔍'
    };

    insights.forEach(function (ins) {
      var t = ins.type || 'observation';
      if (!recsState.data[t]) t = 'observation';
      var color = typeColors[t] || '#D4B15A';
      var helper = window.TaagerSmartInsights;
      var trust = ins.trust || 'measured';
      var confidence = ins.confidence || (ins.metric && ins.metric.orders >= 30 ? 'strong' : (ins.metric && ins.metric.orders >= 15 ? 'developing' : 'limited'));
      var evidence = Array.isArray(ins.evidence) ? ins.evidence.filter(Boolean) : [];
      var trustLabel = helper && helper.trustLabel ? helper.trustLabel(trust) : (trust === 'estimated' ? 'Estimated' : 'Measured');
      
      var reasonHtml = ins.body;
      if (ins.recommendation) {
        reasonHtml += '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);color:' + color + ';">💡 ' + ins.recommendation + '</div>';
      }

      if (evidence.length) {
        reasonHtml += '<div style="margin-top:8px;font-size:var(--type-micro);color:rgba(255,255,255,0.42);line-height:1.45;">' + evidence.slice(0, 2).join(' · ') + '</div>';
      }

      recsState.data[t].push({
        id: ins.id,
        type: t,
        priority: ins.priority, // critical, high, medium, low
        emoji: typeEmojis[t] || '💡',
        title: ins.title,
        city: ins.city || ins.province,
        product: ins.product,
        reason: reasonHtml,
        trust: trustLabel,
        confidence: confidence,
        accentColor: color,
        metricsHtml: buildMetrics(ins)
      });
    });

    // Sort each array by priority
    var pWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    Object.keys(recsState.data).forEach(function(k) {
      recsState.data[k].sort(function(a, b) {
        return (pWeight[b.priority] || 0) - (pWeight[a.priority] || 0);
      });
    });

    // Auto-select first non-empty tab
    if (recsState.data[recsState.activeTab].length === 0) {
      var tabs = ['risk', 'opportunity', 'recommendation', 'observation'];
      for (var i = 0; i < tabs.length; i++) {
        if (recsState.data[tabs[i]].length > 0) {
          recsState.activeTab = tabs[i];
          break;
        }
      }
    }
  }

  function updateRecsPage() {
    var container = document.getElementById('sc-ins-content');
    if (!container) return;

    var items = recsState.data[recsState.activeTab] || [];
    var totalActive = 0;
    Object.keys(recsState.data).forEach(function(k) { totalActive += recsState.data[k].length; });

    var subtitleEl = document.getElementById('sc-ins-subtitle');
    if (subtitleEl) subtitleEl.innerText = totalActive + sTx(' active insights', ' رؤية نشطة');

    if (items.length === 0) {
      container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:12px;">' +
          '<div style="font-size:var(--type-display);opacity:0.6;">✨</div>' +
          '<div style="color:' + C.muted + ';font-size:var(--type-control);">' + sTx('No insights in this category', 'لا توجد رؤى في هذه الفئة') + '</div>' +
        '</div>';
      return;
    }

    var start = (recsState.page - 1) * recsState.pageSize;
    var end = start + recsState.pageSize;
    var pageItems = items.slice(start, end);

    var html = '';

    function renderCard(card, index) {
        var geo = recsState.geo;
        var cityTag = '';

        var pStat = (card.product && geo && geo.productStats && geo.productStats[card.product]) ? geo.productStats[card.product] : null;
        var pName = (pStat && pStat.name) ? pStat.name : card.product;
        var pSku = (pStat && pStat.sku) ? pStat.sku : '';
        var displayProduct = pName;
        if (pSku && pSku !== pName) displayProduct = pName + ' (' + pSku + ')';

        var productTag = '';
          
        var isFeatured = (card.priority === 'critical' || card.priority === 'high');

        function hexToRgb(hex) {
            var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) : '255,255,255';
        }
        var hoverRgba = hexToRgb(card.accentColor);
        
        var bg, shadow, border;
        if (isFeatured) {
            bg = 'linear-gradient(180deg, rgba(' + hoverRgba + ',0.05) 0%, rgba(13,19,32,1) 100%)';
            shadow = 'box-shadow: 0 -1px 12px rgba(' + hoverRgba + ',0.06), 0 4px 12px rgba(0,0,0,0.3);';
            border = '1px solid ' + card.accentColor + '1a';
        } else {
            bg = '#0D1320';
            border = '1px solid rgba(255,255,255,0.03)';
            shadow = '';
        }

        var padding = isFeatured ? '16px 20px' : '14px 16px';
        var titleSize = isFeatured ? '13px' : '12px';
        var emojiSize = isFeatured ? '18px' : '16px';
        var titleColor = 'rgba(255,255,255,0.95)';
        var reasonColor = isFeatured ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.45)';
        var reasonSize = isFeatured ? '11.5px' : '11px';
        var barOpacity = isFeatured ? '0.8' : '0.3';
        
        var hoverTransform = isFeatured ? 'translateY(-2px)' : 'translateY(-1px)';
        var hoverShadow = isFeatured ? 'box-shadow:0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ' + card.accentColor + '1a' : 'box-shadow:0 4px 12px rgba(0,0,0,0.2)';

        var btnHoverBg = 'rgba(' + hoverRgba + ',0.12)';
        var btnHoverBorder = 'rgba(' + hoverRgba + ',0.3)';
        var btnHoverShadow = '0 4px 12px rgba(' + hoverRgba + ',0.1), inset 0 1px 0 rgba(255,255,255,0.1)';

        var formattedTitle = card.title;
        var colonIdx = card.title.indexOf(':');
        if (colonIdx !== -1) {
            var prefix = card.title.substring(0, colonIdx + 1);
            var suffix = card.title.substring(colonIdx + 1);
            formattedTitle = '<span style="color:' + card.accentColor + ';">' + prefix + '</span>' + suffix;
        }

        var ctaBtn = card.city
          ? '<button class="sc-ins-cta" data-city="' + card.city + '" ' +
              'data-product="' + (card.product || '') + '" ' +
              'style="margin-top:auto;width:100%;padding:6px;border:1px solid rgba(255,255,255,0.04);' +
              'background:rgba(255,255,255,0.015);color:var(--dash-text-faint);border-radius:var(--dash-radius-sm);' +
              'font-size:var(--type-micro);font-weight:var(--weight-semibold);cursor:pointer;transition:all 0.2s cubic-bezier(0.22, 1, 0.36, 1);box-shadow:none;transform:translateY(0);" ' +
              'onmouseover="this.style.background=\'' + btnHoverBg + '\';this.style.color=\'' + card.accentColor + '\';this.style.borderColor=\'' + btnHoverBorder + '\';this.style.boxShadow=\'' + btnHoverShadow + '\';this.style.transform=\'translateY(-1px)\'" ' +
              'onmouseout="this.style.background=\'rgba(255,255,255,0.015)\';this.style.color=\'rgba(255,255,255,0.4)\';this.style.borderColor=\'rgba(255,255,255,0.04)\';this.style.boxShadow=\'none\';this.style.transform=\'translateY(0)\'">' +
              sTx('Details →', 'التفاصيل ←') +
            '</button>'
          : '';

        return '<div class="sc-ins-card" style="background:' + bg + ';border:' + border + ';' +
          'border-radius:var(--dash-radius-md);padding:' + padding + ';position:relative;overflow:hidden;' +
          'display:flex;flex-direction:column;' +
          'transition:all 0.2s ease;' + shadow + '" ' +
          'onmouseover="this.style.transform=\'' + hoverTransform + '\';this.style.borderColor=\'' + card.accentColor + '33\';this.style.cssText += \'' + hoverShadow + '\'" ' +
          'onmouseout="this.style.transform=\'translateY(0)\';this.style.borderColor=\'' + (isFeatured ? card.accentColor + '1a' : 'rgba(255,255,255,0.03)') + '\';this.style.boxShadow=\'' + (isFeatured ? shadow.replace('box-shadow: ', '').replace(';', '') : 'none') + '\'">' +
          '<div style="position:absolute;top:0;right:0;width:2px;height:100%;background:' + card.accentColor + ';' +
            'opacity:' + barOpacity + ';border-radius:0 12px 12px 0;"></div>' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;min-width:0;">' +
            '<span style="font-size:' + emojiSize + ';opacity:0.9;">' + card.emoji + '</span>' +
            '<span title="' + card.title.replace(/"/g, '&quot;') + '" style="font-size:' + titleSize + ';font-weight:var(--weight-bold);letter-spacing:0.2px;color:' + titleColor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;display:inline-block;vertical-align:bottom;">' + formattedTitle + '</span>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">' +
            '<span style="font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.04em;text-transform:uppercase;color:' + card.accentColor + ';background:' + card.accentColor + '18;border:1px solid ' + card.accentColor + '33;border-radius:var(--radius-pill);padding:2px 7px;">' + (card.trust || 'Measured') + '</span>' +
            '<span style="font-size:var(--type-micro);font-weight:var(--weight-semibold);letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,0.42);background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-pill);padding:2px 7px;">' + (card.confidence || 'limited') + '</span>' +
          '</div>' +
          '<div style="font-size:' + reasonSize + ';color:' + reasonColor + ';line-height:1.5;margin-bottom:10px;">' + card.reason + '</div>' +
          card.metricsHtml + 
          ctaBtn +
        '</div>';
    }

    if (pageItems.length > 0) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">' +
        pageItems.map(function(c, i) { return renderCard(c, i); }).join('') +
      '</div>';
    }

    var totalPages = Math.ceil(items.length / recsState.pageSize);
    var paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = generatePaginationLocal(recsState.page, totalPages, 'sc-ins-page-btn');
    }

    container.innerHTML = html + paginationHtml;

    container.querySelectorAll('.sc-ins-cta').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cityName    = btn.dataset.city;
        var productKey  = btn.dataset.product;
        if (cityName && window.CityIntelligenceDrawer && recsState.geo) {
          window.CityIntelligenceDrawer.open(cityName, { geo: recsState.geo });
        }
        if (window.DashboardFilterBus) {
          var patch = { selectedCity: cityName || null };
          if (productKey) patch.selectedProduct = productKey;
          window.DashboardFilterBus.setState(patch);
        }
      });
    });

    container.querySelectorAll('.sc-ins-page-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (this.hasAttribute('disabled')) return;
        recsState.page = parseInt(this.dataset.page, 10);
        updateRecsPage();
      });
    });
  }

  
  function generatePaginationLocal(currentPage, totalPages, btnClass) {
    if (totalPages <= 1) return '';
    var html = '<div style="display:flex;justify-content:center;gap:4px;margin-top:16px;">';
    
    var btnStyle = 'padding:6px 12px;border-radius:var(--dash-radius-sm);font-size:var(--type-label);font-weight:var(--weight-semibold);border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);color:rgba(255,255,255,0.7);transition:all 0.2s;';
    var activeStyle = 'padding:6px 12px;border-radius:var(--dash-radius-sm);font-size:var(--type-label);font-weight:var(--weight-semibold);border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.1);color:#fff;';
    var disabledStyle = 'padding:6px 12px;border-radius:var(--dash-radius-sm);font-size:var(--type-label);font-weight:var(--weight-semibold);border:1px solid rgba(255,255,255,0.02);background:transparent;color:rgba(255,255,255,0.2);cursor:not-allowed;';

    // Prev
    html += '<button class="' + btnClass + '" data-page="' + (currentPage - 1) + '" style="' + (currentPage === 1 ? disabledStyle : btnStyle + 'cursor:pointer;') + '" ' + (currentPage === 1 ? 'disabled' : '') + '>←</button>';
            
    // Pages
    var startP = Math.max(1, currentPage - 2);
    var endP = Math.min(totalPages, currentPage + 2);
    
    if (startP > 1) html += '<button class="' + btnClass + '" data-page="1" style="' + btnStyle + 'cursor:pointer;">1</button>' + (startP > 2 ? '<span style="color:rgba(255,255,255,0.3);align-self:center;">...</span>' : '');
    
    for (var i = startP; i <= endP; i++) {
      var style = (i === currentPage) ? activeStyle : btnStyle + 'cursor:pointer;';
      html += '<button class="' + btnClass + '" data-page="' + i + '" style="' + style + '">' + i + '</button>';
    }
    
    if (endP < totalPages) html += (endP < totalPages - 1 ? '<span style="color:rgba(255,255,255,0.3);align-self:center;">...</span>' : '') + '<button class="' + btnClass + '" data-page="' + totalPages + '" style="' + btnStyle + 'cursor:pointer;">' + totalPages + '</button>';
    
    // Next
    html += '<button class="' + btnClass + '" data-page="' + (currentPage + 1) + '" style="' + (currentPage === totalPages ? disabledStyle : btnStyle + 'cursor:pointer;') + '" ' + (currentPage === totalPages ? 'disabled' : '') + '>→</button>';
            
    html += '</div>';
    return html;
  }

  function buildRecommendationCards(insights, geo) {
    updateRecsState(insights, geo);

    var tabs = [
      { id: 'risk', label: sTx('Risks', 'مخاطر'), icon: '⚠️', count: recsState.data.risk.length, color: '#F4B860' },
      { id: 'opportunity', label: sTx('Opportunities', 'فرص'), icon: '📈', count: recsState.data.opportunity.length, color: '#81C784' },
      { id: 'recommendation', label: sTx('Recommendations', 'توصيات'), icon: '✨', count: recsState.data.recommendation.length, color: '#9FA8DA' },
      { id: 'observation', label: sTx('Observations', 'ملاحظات'), icon: '🔍', count: recsState.data.observation.length, color: '#90CAF9' }
    ];

    var totalActive = 0;
    tabs.forEach(function(t) { totalActive += t.count; });

    var tabsHtml = '<div id="sc-ins-tabs" style="display:flex;gap:4px;background:rgba(255,255,255,0.015);padding:3px;border-radius:var(--dash-radius-sm);overflow-x:auto;border:1px solid rgba(255,255,255,0.03);">' +
      tabs.map(function(t) {
        var isActive = recsState.activeTab === t.id;
        var bg = isActive ? 'rgba(255,255,255,0.06)' : 'transparent';
        var border = isActive ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent';
        var color = isActive ? t.color : 'rgba(255,255,255,0.4)';
        var fontWeight = isActive ? '600' : '500';
        return '<button class="sc-ins-tab-btn" data-tab="' + t.id + '" ' +
          'style="display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:var(--dash-radius-sm);' +
          'background:' + bg + ';border:' + border + ';color:' + color + ';' +
          'font-size:var(--type-caption);font-weight:' + fontWeight + ';cursor:pointer;transition:all 0.15s;white-space:nowrap;box-shadow:' + (isActive ? '0 2px 4px rgba(0,0,0,0.1)' : 'none') + '" ' +
          'onmouseover="if(!this.style.background.includes(\'rgba(255,255,255,0.06)\')) this.style.color=\'rgba(255,255,255,0.8)\'" ' +
          'onmouseout="if(!this.style.background.includes(\'rgba(255,255,255,0.06)\')) this.style.color=\'rgba(255,255,255,0.4)\'">' +
          '<span style="font-size:var(--type-label);opacity:0.8;">' + t.icon + '</span>' +
          '<span>' + t.label + '</span>' +
          '<span class="sc-ins-tab-count" style="background:rgba(255,255,255,0.05);padding:1px 5px;border-radius:var(--dash-radius-sm);font-size:var(--type-micro);color:' + (isActive ? t.color : 'rgba(255,255,255,0.3)') + ';">' + t.count + '</span>' +
        '</button>';
      }).join('') +
    '</div>';

    var legendHtml = '<div style="display:flex;align-items:center;gap:12px;margin-right:auto;font-size:var(--type-micro);color:var(--dash-text-faint);">' +
      '<div style="display:flex;align-items:center;gap:4px;"><span style="color:#F4B860;font-size:var(--type-body);line-height:0.5;">●</span> ' + sTx('Risks', 'مخاطر') + '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;"><span style="color:#81C784;font-size:var(--type-body);line-height:0.5;">●</span> ' + sTx('Opportunities', 'فرص') + '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;"><span style="color:#9FA8DA;font-size:var(--type-body);line-height:0.5;">●</span> ' + sTx('Recommendations', 'توصيات') + '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;"><span style="color:#90CAF9;font-size:var(--type-body);line-height:0.5;">●</span> ' + sTx('Observations', 'ملاحظات') + '</div>' +
    '</div>';

    var headerHtml = '<div style="display:flex;flex-direction:column;gap:14px;margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="font-size:var(--type-metric);">💡</div>' +
          '<div>' +
            '<div style="font-size:var(--type-control);font-weight:var(--weight-semibold);color:rgba(255,255,255,0.9);letter-spacing:0.3px;">' + sTx('Smart Insights', 'الرؤى الذكية') + '</div>' +
            '<div id="sc-ins-subtitle" style="font-size:var(--type-caption);color:var(--dash-text-faint);margin-top:2px;">' + totalActive + sTx(' active insights', ' رؤية نشطة') + '</div>' +
          '</div>' +
        '</div>' +
        legendHtml +
      '</div>' +
      tabsHtml +
    '</div>';

    var containerHtml = '<div id="sc-ins-content" style="min-height:100px;"></div>';

    return '<div style="background:' + C.card + ';border:1px solid ' + C.border + ';' +
      'border-radius:var(--dash-radius-xl);padding:22px 24px;">' +
      headerHtml + containerHtml +
    '</div>';
  }

  function wireEvents(mountEl) {
    mountEl.querySelectorAll('.sc-ins-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tabId = this.dataset.tab;
        if (recsState.activeTab === tabId) return;
        recsState.activeTab = tabId;
        recsState.page = 1;
        
        mountEl.querySelectorAll('.sc-ins-tab-btn').forEach(function(b) {
          var tId = b.dataset.tab;
          var tColor = tId === 'risk' ? '#F4B860' : tId === 'opportunity' ? '#81C784' : tId === 'recommendation' ? '#9FA8DA' : '#90CAF9';
          var isActive = tId === tabId;
          b.style.background = isActive ? 'rgba(255,255,255,0.06)' : 'transparent';
          b.style.border = isActive ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent';
          b.style.color = isActive ? tColor : 'rgba(255,255,255,0.4)';
          b.style.fontWeight = isActive ? '600' : '500';
          b.style.boxShadow = isActive ? '0 2px 4px rgba(0,0,0,0.1)' : 'none';
          var countSpan = b.querySelector('.sc-ins-tab-count');
          if (countSpan) countSpan.style.color = isActive ? tColor : 'rgba(255,255,255,0.3)';
        });

        updateRecsPage();
      });
    });

    updateRecsPage();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MAIN RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  window.renderInsightStrip = function (mountEl, geoData) {
    if (!mountEl) return;

    var isAr = getIsAr();

    /* Resolve geo data */
    var d = geoData || window.dashboardGeoData || null;
    var geo = (d && d.geo) ? d.geo : null;

    /* Run insight engine if available */
    var insights = [];
    if (geo && typeof window.runInsightEngine === 'function') {
      try {
        insights = window.runInsightEngine(geo) || [];
      } catch (e) {
        console.warn('[InsightStrip] runInsightEngine error:', e);
      }
    }

    /* ── Empty state ────────────────────────────────────────────────────────── */
    if (insights.length === 0) {
      mountEl.innerHTML =
        '<div dir="' + (isAr ? 'rtl' : 'ltr') + '" style="display:flex;align-items:center;gap:10px;' +
          'padding:16px 20px;background:rgba(255,255,255,0.02);' +
          'border:1px solid rgba(255,255,255,0.06);border-radius:var(--dash-radius-lg);' +
          'color:rgba(255,255,255,0.3);font-size:var(--type-label);font-weight:var(--weight-semibold);">' +
          '<span style="font-size:var(--type-section-title)">💡</span>' +
          sTx('No insights yet — they will be generated after loading data', 'لا توجد رؤى بعد — سيتم توليدها بعد تحميل البيانات') +
        '</div>';
      return;
    }

    mountEl.innerHTML = '<div dir="' + (isAr ? 'rtl' : 'ltr') + '">' + buildRecommendationCards(insights, geo) + '</div>';
    wireEvents(mountEl);
  };

})();
