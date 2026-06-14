/* ══════════════════════════════════════════════════════════════════════════════
   dashboard-insight-engine.js  (T-19)
   Cross-dimensional insight engine — runs after Pass 2 geo data is available.
   Produces a priority-sorted array of Insight objects.

   Depends on:
     window.getDashboardThresholds() — from dashboard-aggregator.js (T-02)

   Exposed on window:
     runInsightEngine(geo, thresholds) → Insight[]
       geo = { cityStats, productStats, geoProductMap, provinceMap, kpis }
       thresholds = optional override (defaults to getDashboardThresholds())

   Insight schema:
     { id, type, level, priority, city?, product?, province?,
       title, body, recommendation, metric, tags }

   Priority order: critical → high → medium → low
   Types: risk | opportunity | observation | recommendation
   Levels: global | province | city | product | product-city
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

  function pct(fraction) {
    return Math.round((fraction || 0) * 100);
  }

  function safeNdr(delivered, total) {
    total = Number(total || 0);
    return total > 0 ? Number(delivered || 0) / total : 0;
  }

  function safePct(part, total) {
    return total > 0 ? part / total : 0;
  }

  var _insightCounter = 0;
  function makeInsight(type, level, priority, opts) {
    _insightCounter++;
    return {
      id:             'ins_' + _insightCounter,
      type:           type,
      level:          level,
      priority:       priority,
      city:           opts.city       || undefined,
      product:        opts.product    || undefined,
      province:       opts.province   || undefined,
      title:          opts.title      || '',
      body:           opts.body       || '',
      recommendation: opts.recommendation || '',
      metric:         opts.metric     || {},
      evidence:       opts.evidence   || [],
      trust:          opts.trust      || undefined,
      confidence:     opts.confidence || undefined,
      sampleSize:     opts.sampleSize || undefined,
      tags:           opts.tags       || []
    };
  }

  /* ════════════════════════════════════════════════════════════════════════════
     MAIN ENGINE
  ════════════════════════════════════════════════════════════════════════════ */
  window.runInsightEngine = function (geo, thresholds) {
  const isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  var SI = window.TaagerSmartInsights || null;
  function tx(en, ar) {
    return window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
  }

    _insightCounter = 0;
    geo = geo || {};
    var cityStats    = geo.cityStats    || {};
    var productStats = geo.productStats || {};
    var geoMap       = geo.geoProductMap || {};
    var provinceMap  = geo.provinceMap   || {};
    var kpis         = geo.kpis          || {};

    var T = thresholds || (typeof window.getDashboardThresholds === 'function'
      ? window.getDashboardThresholds()
      : {
          NDR_DANGER: 0.20, NDR_SAFE: 0.40, NDR_NATIONAL: 0.30,
          DR_EXCELLENT: 0.40, DR_GOOD: 0.30, DR_POOR: 0.20,
          SCALING_MIN_ORDERS: 30, INSIGHT_MIN_SAMPLE: 15,
          PREPAID_ADVANTAGE_THRESHOLD: 0.15, COD_HEAVY_THRESHOLD: 0.85,
          SCALING_SCORE_GREEN: 70, RISK_SCORE_RED: 65
        });

    var nationalNdr     = Number(kpis.ndr)       || T.NDR_NATIONAL;
    var nationalDr      = Number(kpis.dr)        || T.DR_GOOD;
    var nationalPrepaid = Number(kpis.prepaidPct) || 0;
    var MIN_SAMPLE      = T.INSIGHT_MIN_SAMPLE;
    var MIN_SCALING     = T.SCALING_MIN_ORDERS;
    function ndrEvidence(delivered, eligible) {
      return SI ? SI.rateEvidence('NDR', delivered, eligible) : ('NDR ' + pct(safeNdr(delivered, eligible)) + '% (' + delivered + '/' + eligible + ')');
    }
    function trustMeasured() { return 'measured'; }
    function trustEstimated() { return 'estimated'; }

    function getProductName(key) {
      if (!key) return tx('Unknown product', 'منتج غير معروف');
      var ps = productStats[key];
      if (ps && ps.name && ps.name !== key && ps.name !== 'Unknown') return ps.name;
      return key; // Fallback to key/sku if name is unavailable
    }

    var insights = [];

    /* ──────────────────────────────────────────────────────────────────────────
       RISK RULE 1 — City NDR < danger threshold AND orders ≥ INSIGHT_MIN_SAMPLE
       Level: city | Priority: critical
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(cityStats).forEach(function (city) {
      var cs = cityStats[city];
      if ((cs.count || 0) < MIN_SAMPLE) return;
      var cityNdr  = safeNdr(cs.deliveredOrders || 0, cs.count || 0);
      if (cityNdr < T.NDR_DANGER) {
        var cityEligible = cs.ndrBaseOrders || cs.count || 0;
        insights.push(makeInsight('risk', 'city', 'critical', {
          city:  city,
          title: tx('⚠️ NDR Risk: ', '⚠️ NDR خطر: ') + city,
          body:  tx('Net delivery rate ', 'نسبة التسليم الصافية ') + pct(cityNdr) + tx('% is below the safe floor (', '% أقل من حد الأمان (') + pct(T.NDR_DANGER) + '%). ' + ndrEvidence(cs.deliveredOrders || 0, cityEligible),
          recommendation: tx('Reduce or hold scaling in ', 'خفّض أو ثبّت التوسع في ') + city + tx(' until order quality and delivery recovery are reviewed.', ' حتى تتم مراجعة جودة الطلبات وتحسن التسليم.'),
          metric: { ndr: cityNdr, orders: cs.count, delivered: cs.deliveredOrders || 0, eligible: cityEligible },
          evidence: [ndrEvidence(cs.deliveredOrders || 0, cityEligible)],
          trust: trustMeasured(),
          tags:   ['ndr', 'risk']
        }));
      }
    });

    /* ──────────────────────────────────────────────────────────────────────────
       RISK RULE 2 — Product NDR in specific city < danger threshold AND orders ≥ MIN_SAMPLE
       Level: product-city | Priority: critical
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(geoMap).forEach(function (city) {
      Object.keys(geoMap[city]).forEach(function (product) {
        var cell = geoMap[city][product];
        if ((cell.orders || 0) < MIN_SAMPLE) return;
        if ((cell.ndr || 0) < T.NDR_DANGER) {
          var pName = getProductName(product);
          insights.push(makeInsight('risk', 'product-city', 'critical', {
            city: city, product: product,
            title: tx('🔴 NDR Warning: ', '🔴 تحذير NDR: ') + pName + tx(' in ', ' في ') + city,
            body:  tx('Net delivery rate ', 'نسبة التسليم الصافية ') + pct(cell.ndr) + tx('% is below the safe floor for this product-city pair. ', '% أقل من حد الأمان لهذا المنتج داخل المدينة. ') + ndrEvidence(cell.delivered || 0, cell.orders || 0),
            recommendation: tx('Reduce or pause aggressive traffic for this product in ', 'خفّض أو أوقف الزيارات المكثفة لهذا المنتج في ') + city + tx(' until the product-city delivery signal recovers.', ' حتى تتحسن إشارة التسليم للمنتج داخل المدينة.'),
            metric: { ndr: cell.ndr, orders: cell.orders, delivered: cell.delivered },
            evidence: [ndrEvidence(cell.delivered || 0, cell.orders || 0)],
            trust: trustMeasured(),
            tags:   ['ndr', 'risk', 'product']
          }));
        }
      });
    });

    /* ──────────────────────────────────────────────────────────────────────────
       RISK RULE 3 — City prepaidNdr - codNdr > 15pp AND codCount ≥ 10
       Level: city | Priority: high
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(cityStats).forEach(function (city) {
      var cs = cityStats[city];
      if ((cs.codCount || 0) < 10) return;

      // Derive COD NDR approximation from available data
      var cityNdr       = safeNdr(cs.deliveredOrders || 0, cs.count || 0);
      var codDelivered  = cs.codDeliveredCount    || 0;
      var prepDelivered = cs.prepaidDeliveredCount || 0;

      // Approximate: assume canceled proportional to COD/prepaid split
      var codFrac    = safePct(cs.codCount || 0, cs.count || 0);
      var codCanceled   = Math.round((cs.canceledCount || 0) * codFrac);
      var prepCanceled  = (cs.canceledCount || 0) - codCanceled;

      var codNdr    = safeNdr(codDelivered, cs.codCount || 0);
      var prepNdr   = safeNdr(prepDelivered, cs.prepaidCount || 0);
      var advantage = prepNdr - codNdr;

      if (advantage > T.PREPAID_ADVANTAGE_THRESHOLD && (cs.prepaidCount || 0) >= 5) {
        insights.push(makeInsight('recommendation', 'city', 'high', {
          city: city,
          title: tx('💳 Apply Prepaid: ', '💳 تطبيق الدفع المسبق: ') + city,
          body:  tx('Estimated COD NDR ', 'NDR تقديري للدفع عند الاستلام ') + pct(codNdr) + tx('% vs ', '% مقابل ') + pct(prepNdr) + tx('% for Prepaid — gap of ', '% للدفع المسبق — فارق ') + pct(advantage) + '%',
          recommendation: tx('Test prepaid-first traffic in ', 'اختبر زيارات تفضل الدفع المسبق في ') + city + tx(' and monitor whether measured NDR improves.', ' وراقب ما إذا كانت NDR المقاسة تتحسن.'),
          metric: { codNdr: codNdr, prepaidNdr: prepNdr, advantage: advantage },
          evidence: [
            ndrEvidence(codDelivered, cs.codCount || 0),
            ndrEvidence(prepDelivered, cs.prepaidCount || 0)
          ],
          trust: trustEstimated(),
          tags:   ['prepaid', 'recommendation']
        }));
      }
    });

    /* ──────────────────────────────────────────────────────────────────────────
       RISK RULE 4 — Province NDR below danger threshold
       Level: province | Priority: high
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(provinceMap).forEach(function (pid) {
      var p = provinceMap[pid];
      if ((p.totalOrders || 0) < MIN_SCALING) return;
      if ((p.ndrPct || 0) < T.NDR_DANGER) {
        insights.push(makeInsight('risk', 'province', 'high', {
          province: pid,
          title:    tx('📍 Region ', '📍 منطقة ') + p.name + tx(': Low NDR', ': NDR منخفض'),
          body:     tx('Region net delivery rate ', 'نسبة التسليم الصافية للمنطقة ') + pct(p.ndrPct) + tx('% is below the safe floor and lower than national average ', '% أقل من حد الأمان وأقل من المتوسط الوطني ') + pct(nationalNdr) + '%',
          recommendation: tx('Review order quality in cities of ', 'راجع جودة الطلبات في مدن ') + p.name,
          metric: { provinceNdr: p.ndrPct, nationalNdr: nationalNdr },
          evidence: [ndrEvidence(p.totalDelivered || 0, p.totalOrders || 0)],
          trust: trustMeasured(),
          tags:   ['ndr', 'risk', 'province']
        }));
      }
    });

    /* ──────────────────────────────────────────────────────────────────────────
       RISK RULE 7 — City COD% > 85% AND city NDR < danger threshold
       Level: city | Priority: high
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(cityStats).forEach(function (city) {
      var cs = cityStats[city];
      if ((cs.count || 0) < MIN_SAMPLE) return;
      var codPct   = safePct(cs.codCount || 0, cs.count || 0);
      var cityNdr  = safeNdr(cs.deliveredOrders || 0, cs.count || 0);
      if (codPct > T.COD_HEAVY_THRESHOLD && cityNdr < T.NDR_DANGER) {
        insights.push(makeInsight('risk', 'city', 'high', {
          city: city,
          title: tx('🚨 COD-heavy low-NDR city: ', '🚨 مدينة COD مرتفع مع NDR منخفض: ') + city,
          body:  tx('COD share ', 'نسبة الدفع عند الاستلام ') + pct(codPct) + tx('% with measured NDR ', '% مع NDR مقاسة ') + pct(cityNdr) + tx('% — high exposure if volume is scaled.', '% — تعرض عالٍ إذا تم توسيع الحجم.'),
          recommendation: tx('Test gradual prepaid conversion in ', 'اختبر التحويل التدريجي للدفع المسبق في ') + city + tx(' before increasing COD traffic.', ' قبل زيادة زيارات COD.'),
          metric: { codPct: codPct, ndr: cityNdr },
          evidence: [ndrEvidence(cs.deliveredOrders || 0, cs.ndrBaseOrders || cs.count || 0)],
          trust: trustMeasured(),
          tags:   ['cod', 'risk']
        }));
      }
    });

    /* ──────────────────────────────────────────────────────────────────────────
       OPPORTUNITY RULE 9 — City prepaidPct > 50% AND excellent DR
       Level: city | Priority: high
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(cityStats).forEach(function (city) {
      var cs = cityStats[city];
      if ((cs.count || 0) < MIN_SCALING) return;
      var prepPct = safePct(cs.prepaidCount || 0, cs.count || 0);
      var drPct   = cs.drPct || safePct(cs.deliveredOrders || 0, cs.drBaseOrders || 0);
      if (typeof drPct === 'number' && drPct > 1) drPct = drPct / 100;
      if (prepPct > 0.50 && drPct > T.DR_EXCELLENT) {
        insights.push(makeInsight('opportunity', 'city', 'high', {
          city: city,
          title: tx('🚀 Excellent expansion opportunity: ', '🚀 فرصة توسع ممتازة: ') + city,
          body:  tx('Prepaid ', 'دفع مسبق ') + pct(prepPct) + tx('% + delivery rate ', '% + نسبة تسليم ') + pct(drPct) + tx('% — ideal environment for expansion', '% — بيئة مثالية للتوسع'),
          recommendation: tx('Increase campaign budget in ', 'زيادة ميزانية الحملات في ') + city + tx(' confidently', ' بثقة'),
          metric: { prepaidPct: prepPct, dr: drPct },
          tags:   ['prepaid', 'opportunity', 'scaling']
        }));
      }
    });

    /* ──────────────────────────────────────────────────────────────────────────
       OPPORTUNITY RULE 10 — Product prepaidNdr strong AND codNdr weak
       Requires geoMap cells with enough prepaid data.
       Level: product | Priority: high
    ────────────────────────────────────────────────────────────────────────── */
    // Aggregate per product across all cities
    var productPrepaidNdr = {};
    var productCodNdr     = {};
    var productPrepaidOrders = {};
    var productCodOrders     = {};

    Object.keys(geoMap).forEach(function (city) {
      Object.keys(geoMap[city]).forEach(function (product) {
        var cell = geoMap[city][product];
        if (!productPrepaidNdr[product]) {
          productPrepaidNdr[product] = 0; productCodNdr[product] = 0;
          productPrepaidOrders[product] = 0; productCodOrders[product] = 0;
        }
        productPrepaidOrders[product] += cell.prepaidCount || 0;
        productCodOrders[product]     += cell.codCount     || 0;
        // Weighted average NDR
        productPrepaidNdr[product] += (cell.prepaidNdr || 0) * (cell.prepaidCount || 0);
        productCodNdr[product]     += (cell.codNdr     || 0) * (cell.codCount     || 0);
      });
    });

    Object.keys(productPrepaidNdr).forEach(function (product) {
      var pOrders = productPrepaidOrders[product] || 0;
      var cOrders = productCodOrders[product]     || 0;
      if (pOrders < 5 || cOrders < 10) return;
      var avgPrepaidNdr = pOrders > 0 ? productPrepaidNdr[product] / pOrders : 0;
      var avgCodNdr     = cOrders > 0 ? productCodNdr[product]     / cOrders : 0;
      if (avgPrepaidNdr >= T.NDR_SAFE && avgCodNdr < T.NDR_DANGER) {
        var pName = getProductName(product);
        insights.push(makeInsight('opportunity', 'product', 'high', {
          product: product,
          title:   tx('💡 Prepaid Candidate: ', '💡 مرشح للدفع المسبق: ') + pName,
          body:    tx('Prepaid NDR ', 'NDR دفع مسبق ') + pct(avgPrepaidNdr) + tx('% vs ', '% مقابل ') + pct(avgCodNdr) + tx('% for COD — advantage of ', '% للـCOD — ميزة ') + pct(avgPrepaidNdr - avgCodNdr) + '%',
          recommendation: tx('Converting this product to prepaid will significantly increase delivery rate', 'تحويل هذا المنتج للدفع المسبق سيرفع نسبة التسليم بشكل كبير'),
          metric: { prepaidNdr: avgPrepaidNdr, codNdr: avgCodNdr, advantage: avgPrepaidNdr - avgCodNdr },
          tags:   ['prepaid', 'opportunity', 'product']
        }));
      }
    });

    /* ──────────────────────────────────────────────────────────────────────────
       OPPORTUNITY RULE 14 — City orders < 50 AND excellent DR (untapped)
       Level: city | Priority: medium
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(cityStats).forEach(function (city) {
      var cs = cityStats[city];
      if ((cs.count || 0) < 5 || (cs.count || 0) >= 50) return;     // skip tiny or large
      var drPct = cs.drPct || safePct(cs.deliveredOrders || 0, cs.drBaseOrders || 0);
      if (typeof drPct === 'number' && drPct > 1) drPct = drPct / 100;
      if (drPct > T.DR_EXCELLENT) {
        insights.push(makeInsight('opportunity', 'city', 'medium', {
          city: city,
          title: tx('📍 Untapped City: ', '📍 مدينة غير مستغلة: ') + city,
          body:  city + tx(' achieves ', ' تحقق ') + pct(drPct) + tx('% delivery with low volume — high growth potential', '% تسليم بحجم منخفض — إمكانية نمو كبيرة'),
          recommendation: tx('Try gradually increasing order volume in ', 'جرب زيادة حجم الطلبات في ') + city + tx(' gradually', ' تدريجياً'),
          metric: { orders: cs.count, dr: drPct },
          tags:   ['opportunity', 'scaling']
        }));
      }
    });

    /* ──────────────────────────────────────────────────────────────────────────
       OPPORTUNITY RULE 15 — Product with scalingScore > 80 in its best city
       Level: product | Priority: medium
    ────────────────────────────────────────────────────────────────────────── */
    Object.keys(geoMap).forEach(function (city) {
      Object.keys(geoMap[city]).forEach(function (product) {
        var cell = geoMap[city][product];
        if (!cell.isBestInCity) return;
        if ((cell.orders || 0) < MIN_SCALING) return;
        // Quick proxy scaling score: DR > excellent AND orders > 50
        var drPct = cell.dr || 0;
        if (drPct > 1) drPct = drPct / 100;
        if (drPct > T.DR_EXCELLENT && (cell.orders || 0) > 50) {
          var pName = getProductName(product);
          insights.push(makeInsight('recommendation', 'product-city', 'medium', {
            city: city, product: product,
            title: tx('📈 Expand now: ', '📈 توسع الآن: ') + pName + tx(' in ', ' في ') + city,
            body:  tx('Best product in ', 'أفضل منتج في ') + city + tx(' with delivery rate ', ' بنسبة تسليم ') + pct(drPct) + tx('% — ready for expansion', '% — جاهز للتوسع'),
            recommendation: tx('Increase campaign budget for this product in ', 'زيادة ميزانية الحملات لهذا المنتج في ') + city,
            metric: { dr: drPct, orders: cell.orders, commission: cell.commission },
            tags:   ['scaling', 'opportunity']
          }));
        }
      });
    });

    /* ──────────────────────────────────────────────────────────────────────────
       Sort by priority then by metric severity
    ────────────────────────────────────────────────────────────────────────── */
    insights.sort(function (a, b) {
      var pa = PRIORITY_ORDER[a.priority] !== undefined ? PRIORITY_ORDER[a.priority] : 99;
      var pb = PRIORITY_ORDER[b.priority] !== undefined ? PRIORITY_ORDER[b.priority] : 99;
      return pa - pb;
    });

    return insights;
  };

})();
