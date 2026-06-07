/* ══════════════════════════════════════════════════════════════════════════════
   dashboard-aggregator-geo.js  (T-17)
   Pass 2 aggregation — builds the GEO intelligence layer on top of the
   extended cityStats / productStats from Pass 1.

   Depends on:
     window.getDashboardThresholds()    — from dashboard-aggregator.js (T-02)
     window.computeRiskScore()          — from dashboard-aggregator-score.js (T-14)
     window.computeScalingScore()       — from dashboard-aggregator-score.js (T-14)
     window.computeProfitabilityScore() — from dashboard-aggregator-score.js (T-14)
     window.computePipelineHealth()     — from dashboard-aggregator-score.js (T-14)

   Exposed on window:
     buildGeoProductMap(cityStats, productStats, nationalAverages)
       → { geoProductMap, provinceMap, prepaidIntelligence }
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // =======================================================================
  // IMPORTANT WARNING: Do not translate cities or provinces. 
  // Do not translate cities or provinces.
  // Force showing the city and the province name in Arabic everywhere.
  // =======================================================================

  function defaultProvinceMeta() {
    if (window.TaagerGeo && typeof window.TaagerGeo.provinceMap === 'function') {
      return window.TaagerGeo.provinceMap('sa');
    }
    return {
      riyadh: { name: 'منطقة الرياض', color: '#a855f7', x: 230.6, y: 164.1, rx: 95, ry: 80 },
      other: { name: 'مناطق أخرى', color: '#64748b', x: 205, y: 190, rx: 30, ry: 22 }
    };
  }

  function provinceMetaForContext(context) {
    context = context || {};
    if (!window.TaagerGeo || typeof window.TaagerGeo.provinceMap !== 'function') return defaultProvinceMeta();
    var countries = Array.isArray(context.countries) && context.countries.length
      ? context.countries
      : [context.activeCountry || 'sa'];
    countries = countries.filter(function (country) { return country && country !== 'mixed'; });
    if (!countries.length) countries = ['sa'];
    if (countries.length === 1) return window.TaagerGeo.provinceMap(countries[0]);

    var combined = {};
    var offsets = [
      { x: -85, y: -62 }, { x: 85, y: -62 }, { x: -85, y: 62 },
      { x: 85, y: 62 }, { x: 0, y: 0 }
    ];
    countries.forEach(function (country, index) {
      var offset = offsets[index % offsets.length];
      var src = window.TaagerGeo.provinceMap(country);
      Object.keys(src).forEach(function (pid) {
        if (pid === 'other') return;
        var meta = src[pid];
        combined[country + '-' + pid] = Object.assign({}, meta, {
          id: country + '-' + pid,
          country: country,
          name: (window.TaagerCountry && window.TaagerCountry.get ? window.TaagerCountry.get(country).code + ' · ' : '') + meta.name,
          x: Math.max(28, Math.min(372, Number(meta.x || 205) + offset.x)),
          y: Math.max(28, Math.min(312, Number(meta.y || 190) + offset.y)),
          rx: Math.max(18, Number(meta.rx || 35) * 0.72),
          ry: Math.max(14, Number(meta.ry || 26) * 0.72)
        });
      });
    });
    combined.other = { id: 'other', name: 'مناطق أخرى', color: '#64748b', x: 205, y: 190, rx: 30, ry: 22 };
    return combined;
  }

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function safeNdr(delivered, total) {
    total = Number(total || 0);
    return total > 0 ? Math.min(1, Math.max(0, Number(delivered || 0) / total)) : 0;
  }

  function safePct(part, total) {
    return total > 0 ? part / total : 0;
  }

  function callScoring(fn, stats, nat) {
    if (typeof window[fn] !== 'function') return 0;
    try {
      return nat !== undefined ? window[fn](stats, nat) : window[fn](stats);
    } catch (e) {
      console.warn('[GeoAggregator] Scoring fn ' + fn + ' failed:', e);
      return 0;
    }
  }

  /* ── buildGeoProductMap(cityStats, productStats, nationalAverages) ───────── */
  window.buildGeoProductMap = function (cityStats, productStats, nationalAverages, context) {
    cityStats      = cityStats      || {};
    productStats   = productStats   || {};
    nationalAverages = nationalAverages || {};
    var PROVINCE_META = provinceMetaForContext(context || {});

    var T = typeof window.getDashboardThresholds === 'function'
      ? window.getDashboardThresholds()
      : { NDR_DANGER: 0.20, NDR_SAFE: 0.40, PREPAID_ADVANTAGE_THRESHOLD: 0.15, SCALING_MIN_ORDERS: 30 };

    /* ── 1. Build geoProductMap (city × product cells) ──────────────────────── */
    var geoProductMap = {};

    Object.keys(cityStats).forEach(function (cityKey) {
      var cs = cityStats[cityKey];
      var cityName = cs.name || cityKey;
      var productMap = cs.productMap || {};
      geoProductMap[cityKey] = {};

      Object.keys(productMap).forEach(function (productKey) {
        var cp = productMap[productKey];

        var ndr = safeNdr(cp.delivered || 0, cp.ndrBaseOrders || cp.orders || 0);
        var dr = safeNdr(cp.delivered || 0, cp.activeOrders || 0);

        // COD vs prepaid NDR (approximate — derive from per-cell data if available)
        var hasPaymentOutcomeSplit =
          cp.prepaidDelivered !== undefined || cp.prepaidCanceled !== undefined ||
          cp.codDelivered !== undefined || cp.codCanceled !== undefined;
        var prepaidDelivered = hasPaymentOutcomeSplit
          ? (cp.prepaidDelivered || 0)
          : Math.round((cp.delivered || 0) * safePct(cp.prepaidCount || 0, cp.orders || 0));
        var prepaidCanceled = hasPaymentOutcomeSplit
          ? (cp.prepaidCanceled || 0)
          : Math.round((cp.canceled || 0) * safePct(cp.prepaidCount || 0, cp.orders || 0));
        var codDelivered = hasPaymentOutcomeSplit
          ? (cp.codDelivered || 0)
          : Math.max(0, (cp.delivered || 0) - prepaidDelivered);
        var codCanceled = hasPaymentOutcomeSplit
          ? (cp.codCanceled || 0)
          : Math.max(0, (cp.canceled || 0) - prepaidCanceled);

        var codNdrBase = cp.codNdrBaseOrders || cp.codCount || 0;
        var prepaidNdrBase = cp.prepaidNdrBaseOrders || cp.prepaidCount || 0;
        var codNdr    = safeNdr(codDelivered, codNdrBase);
        var prepaidNdr = safeNdr(prepaidDelivered, prepaidNdrBase);

        var prepaidPct = safePct(cp.prepaidCount || 0, cp.orders || 0);
        var codPct     = 1 - prepaidPct;

        // Active orders = placed - delivered - canceled
        var active = Math.max(0, (cp.orders || 0) - (cp.delivered || 0) - (cp.canceled || 0));

        // Scoring stats object shaped for scoring functions
        var scoringStats = {
          ndrPct:            ndr,
          drPct:             dr,
          count:             cp.orders || 0,
          deliveredOrders:   cp.delivered || 0,
          canceledCount:     cp.canceled || 0,
          failedCount:       cp.canceled || 0,
          codPct:            codPct,
          codNdr:            codNdr,
          prepaidPct:        prepaidPct,
          earnedCommission:  cp.commission || 0,
          totalRevenue:      cp.revenue    || 0,
          due:               cp.revenue    || 0,
          gap:               0
        };

        var riskScore           = callScoring('computeRiskScore',           scoringStats, undefined);
        var profitabilityScore  = callScoring('computeProfitabilityScore',  scoringStats, nationalAverages);
        var pipelineHealth      = callScoring('computePipelineHealth',      scoringStats, undefined);
        var scalingScore        = callScoring('computeScalingScore',        scoringStats, nationalAverages);

        var shouldForcePrepaid =
          (cp.codCount || 0) >= 10 &&
          (prepaidNdr - codNdr) > T.PREPAID_ADVANTAGE_THRESHOLD;

        geoProductMap[cityKey][productKey] = {
          cityKey: cityKey,
          cityName: cityName,
          country: cs.country || '',
          // Volume
          orders:    cp.orders    || 0,
          confirmed: cp.confirmed || cp.activeOrders || 0,
          delivered: cp.delivered || 0,
          canceled:  cp.canceled  || 0,
          active:    active,

          // Rate metrics
          ndr:             parseFloat(ndr.toFixed(4)),
          dr:              parseFloat(dr.toFixed(4)),
          confirmationRate: (cp.ndrBaseOrders || cp.orders || 0) > 0
            ? parseFloat(((cp.confirmed || cp.activeOrders || 0) / (cp.ndrBaseOrders || cp.orders || 0)).toFixed(4))
            : 0,

          // Financial
          commission:            cp.commission || 0,
          revenue:               cp.revenue    || 0,
          avgOrderValue:         (cp.orders || 0) > 0 ? parseFloat(((cp.revenue || 0) / cp.orders).toFixed(2)) : 0,
          avgCommissionPerOrder: (cp.orders || 0) > 0 ? parseFloat(((cp.commission || 0) / cp.orders).toFixed(2)) : 0,

          // Payment
          prepaidCount:  cp.prepaidCount || 0,
          codCount:      cp.codCount     || 0,
          prepaidNdrBaseOrders: prepaidNdrBase,
          codNdrBaseOrders: codNdrBase,
          prepaidDelivered: prepaidDelivered,
          prepaidCanceled:  prepaidCanceled,
          codDelivered:     codDelivered,
          codCanceled:      codCanceled,
          prepaidPct:    parseFloat(prepaidPct.toFixed(4)),
          codPct:        parseFloat(codPct.toFixed(4)),
          prepaidNdr:    parseFloat(prepaidNdr.toFixed(4)),
          codNdr:        parseFloat(codNdr.toFixed(4)),

          // Scores
          profitabilityScore: profitabilityScore,
          riskScore:          riskScore,
          pipelineHealth:     pipelineHealth,
          scalingScore:       scalingScore,

          // Intelligence flags
          isDangerous:      ndr < T.NDR_DANGER,
          isScalable:       (cp.delivered || 0) >= T.SCALING_MIN_ORDERS && ndr >= T.NDR_SAFE,
          shouldForcePrepaid: shouldForcePrepaid,
          isBestInCity:     false   // resolved in pass below
        };
      });
    });

    /* ── Mark isBestInCity per city ──────────────────────────────────────────── */
    Object.keys(geoProductMap).forEach(function (city) {
      var cells = geoProductMap[city];
      var bestKey = null, bestComm = -1;
      Object.keys(cells).forEach(function (pk) {
        if ((cells[pk].commission || 0) > bestComm) {
          bestComm = cells[pk].commission;
          bestKey  = pk;
        }
      });
      if (bestKey) cells[bestKey].isBestInCity = true;
    });

    /* ── 2. Build provinceMap (province-level roll-up from cityStats) ────────── */
    var provinceMap = {};

    // Init all provinces
    Object.keys(PROVINCE_META).forEach(function (pid) {
      var meta = PROVINCE_META[pid];
      provinceMap[pid] = {
        id: pid, name: meta.name, color: meta.color, x: meta.x, y: meta.y, rx: meta.rx, ry: meta.ry,
        totalOrders:    0, totalDelivered: 0, totalCanceled: 0,
        totalRevenue:   0, totalCommission: 0,
        drBaseOrders:   0, drDeliveredOrders: 0,
        prepaidCount:   0, codCount: 0,
        prepaidDrBaseOrders: 0, prepaidDrDeliveredOrders: 0,
        codDrBaseOrders: 0, codDrDeliveredOrders: 0,
        canceledCount:  0,
        cities:         [],
        cityKeys:       [],
        productMap:     {}
      };
    });

    // Roll-up cities into their province
    Object.keys(cityStats).forEach(function (cityKey) {
      var cs   = cityStats[cityKey];
      var cityName = cs.name || cityKey;
      var pid  = cs.provinceId || 'other';
      var prov = provinceMap[pid] || provinceMap['other'];

      prov.cities.push(cityName);
      prov.cityKeys.push(cityKey);
      prov.totalOrders      += cs.count        || 0;
      prov.totalDelivered   += cs.deliveredOrders || 0;
      prov.totalCanceled    += cs.canceledCount   || 0;
      prov.totalRevenue     += cs.totalRevenue    || 0;
      prov.totalCommission  += cs.earnedCommission || 0;
      prov.drBaseOrders     += cs.drBaseOrders     || 0;
      prov.drDeliveredOrders += cs.drDeliveredOrders || cs.deliveredOrders || 0;
      prov.prepaidCount     += cs.prepaidCount     || 0;
      prov.codCount         += cs.codCount         || 0;
      prov.prepaidDrBaseOrders += cs.prepaidDrBaseOrders || 0;
      prov.prepaidDrDeliveredOrders += cs.prepaidDrDeliveredOrders || 0;
      prov.codDrBaseOrders += cs.codDrBaseOrders || 0;
      prov.codDrDeliveredOrders += cs.codDrDeliveredOrders || 0;
      prov.canceledCount    += cs.canceledCount    || 0;

      // Roll-up city productMap into province productMap
      Object.keys(cs.productMap || {}).forEach(function (pk) {
        var cp = cs.productMap[pk];
        if (!prov.productMap[pk]) {
          prov.productMap[pk] = { orders: 0, delivered: 0, canceled: 0, ndr: 0, commission: 0 };
        }
        prov.productMap[pk].orders    += cp.orders    || 0;
        prov.productMap[pk].delivered += cp.delivered || 0;
        prov.productMap[pk].canceled  += cp.canceled  || 0;
        prov.productMap[pk].commission+= cp.commission|| 0;
      });
    });

    // Compute derived province rates + scores after roll-up
    Object.keys(provinceMap).forEach(function (pid) {
      var p = provinceMap[pid];
      if (p.totalOrders === 0) return;

      p.ndrPct     = parseFloat(safeNdr(p.totalDelivered, p.totalOrders).toFixed(4));
      p.drPct      = p.drBaseOrders > 0 ? parseFloat((p.drDeliveredOrders / p.drBaseOrders).toFixed(4)) : 0;
      p.prepaidPct = safePct(p.prepaidCount, p.totalOrders);
      p.codPct     = 1 - p.prepaidPct;

      // Compute NDR per product in province
      Object.keys(p.productMap).forEach(function (pk) {
        var pp = p.productMap[pk];
        pp.ndr = parseFloat(safeNdr(pp.delivered, pp.orders).toFixed(4));
      });

      // Province scoring
      var provinceStats = {
        ndrPct:          p.ndrPct,
        drPct:           p.drPct,
        count:           p.totalOrders,
        deliveredOrders: p.totalDelivered,
        canceledCount:   p.totalCanceled,
        failedCount:     p.totalCanceled,
        codPct:          p.codPct,
        prepaidPct:      p.prepaidPct,
        earnedCommission: p.totalCommission,
        totalRevenue:    p.totalRevenue,
        due:             p.totalRevenue,
        gap:             0
      };
      p.riskScore          = callScoring('computeRiskScore',          provinceStats, undefined);
      p.scalingScore       = callScoring('computeScalingScore',       provinceStats, nationalAverages);
      p.profitabilityScore = callScoring('computeProfitabilityScore', provinceStats, nationalAverages);

      // Best / worst city within this province
      var bestScaling  = -1, worstRisk = -1;
      p.bestCity  = null;
      p.worstCity = null;
      (p.cityKeys || p.cities).forEach(function (cName, idx) {
        var cs = cityStats[cName] || cityStats[p.cityKeys && p.cityKeys[idx]] || null;
        if (!cs) return;
        var csStats = {
          ndrPct: cs.ndrPct || 0, drPct: cs.drPct || 0,
          count: cs.count, deliveredOrders: cs.deliveredOrders,
          canceledCount: cs.canceledCount, failedCount: cs.canceledCount,
          codPct: cs.codPct || 0, prepaidPct: cs.prepaidPct || 0,
          earnedCommission: cs.earnedCommission || 0, totalRevenue: cs.totalRevenue || 0,
          due: cs.due || 0, gap: cs.gap || 0
        };
        var sc = callScoring('computeScalingScore', csStats, nationalAverages);
        var rs = callScoring('computeRiskScore',    csStats, undefined);
        cs.scalingScore = sc;
        cs.riskScore = rs;
        if (sc > bestScaling) { bestScaling = sc; p.bestCity = cs.name || cName; }
        if (rs > worstRisk)   { worstRisk   = rs; p.worstCity = cs.name || cName; }
      });
    });

    /* ── 3. Build prepaidIntelligence ────────────────────────────────────────── */
    var prepaidIntelligence = _buildPrepaidIntelligence(cityStats, geoProductMap, nationalAverages, T);

    return {
      geoProductMap:       geoProductMap,
      provinceMap:         provinceMap,
      prepaidIntelligence: prepaidIntelligence
    };
  };

  /* ── buildPrepaidIntelligence (internal) ─────────────────────────────────── */
  function _buildPrepaidIntelligence(cityStats, geoProductMap, nationalAverages, T) {
    var totalOrders = 0, totalPrepaid = 0, totalCod = 0;
    var totalPrepaidNdrBase = 0, totalCodNdrBase = 0;
    var prepaidDelivered = 0, prepaidCanceled = 0;
    var codDelivered = 0, codCanceled = 0;
    var prepaidDrBase = 0, prepaidDrDelivered = 0;
    var codDrBase = 0, codDrDelivered = 0;

    var cityPrepaidList = [];
    var codHeavyCities  = [];

    Object.keys(cityStats).forEach(function (cityName) {
      var cs = cityStats[cityName];
      totalOrders  += cs.count        || 0;
      totalPrepaid += cs.prepaidCount || 0;
      totalCod     += cs.codCount     || 0;
      totalPrepaidNdrBase += cs.prepaidNdrBaseOrders || cs.prepaidCount || 0;
      totalCodNdrBase += cs.codNdrBaseOrders || cs.codCount || 0;
      prepaidDelivered += cs.prepaidDeliveredCount || 0;
      codDelivered     += cs.codDeliveredCount     || 0;
      prepaidDrBase += cs.prepaidDrBaseOrders || 0;
      prepaidDrDelivered += cs.prepaidDrDeliveredOrders || 0;
      codDrBase += cs.codDrBaseOrders || 0;
      codDrDelivered += cs.codDrDeliveredOrders || 0;

      var cityCanceled = cs.canceledCount || 0;
      var hasCityPaymentOutcomeSplit =
        cs.prepaidCanceledCount !== undefined || cs.codCanceledCount !== undefined;
      var cityPrepaidCanceled = hasCityPaymentOutcomeSplit
        ? (cs.prepaidCanceledCount || 0)
        : (cs.prepaidCount > 0 ? Math.round(cityCanceled * safePct(cs.prepaidCount, cs.count)) : 0);
      var cityCodCanceled = hasCityPaymentOutcomeSplit
        ? (cs.codCanceledCount || 0)
        : (cityCanceled - cityPrepaidCanceled);
      prepaidCanceled += cityPrepaidCanceled;
      codCanceled     += cityCodCanceled;

      var prep = safePct(cs.prepaidCount || 0, cs.count || 0);
      var cityNdr = safeNdr(cs.deliveredOrders || 0, cs.ndrBaseOrders || cs.count || 0);
      if ((cs.count || 0) >= 10) {
        cityPrepaidList.push({ city: cityName, prepaidPct: prep, orders: cs.count, ndr: cityNdr });
      }

      // COD-heavy and dangerous
      var codPct  = safePct(cs.codCount || 0, cs.count || 0);
      if (codPct > T.COD_HEAVY_THRESHOLD && cityNdr < T.NDR_DANGER && (cs.count || 0) >= 15) {
        codHeavyCities.push({
          city: cityName, codPct: codPct, codNdr: cityNdr,
          riskLevel: 'critical'
        });
      }
    });

    var globalPrepaidNdr = safeNdr(prepaidDelivered, totalPrepaidNdrBase);
    var globalCodNdr     = safeNdr(codDelivered, totalCodNdrBase);
    var globalPrepaidDr  = safeNdr(prepaidDrDelivered, prepaidDrBase);
    var globalCodDr      = safeNdr(codDrDelivered, codDrBase);

    // Force-prepaid recommendations from geoProductMap cells
    var forcePrepaidRecs = [];
    var codDangerousCombos = [];
    Object.keys(geoProductMap).forEach(function (city) {
      Object.keys(geoProductMap[city]).forEach(function (product) {
        var cell = geoProductMap[city][product];
        if (cell.shouldForcePrepaid) {
          forcePrepaidRecs.push({
            city: city,
            product: product,
            codNdr: cell.codNdr,
            prepaidNdr: cell.prepaidNdr,
            reason: 'COD NDR ' + Math.round(cell.codNdr * 100) + '% vs Prepaid NDR ' + Math.round(cell.prepaidNdr * 100) + '%'
          });
        }
        if (cell.codNdr < T.NDR_DANGER && (cell.codCount || 0) >= 10) {
          codDangerousCombos.push({
            city: city, product: product,
            codNdr: cell.codNdr, prepaidNdr: cell.prepaidNdr,
            recommendation: cell.prepaidNdr >= T.NDR_SAFE
              ? 'تطبيق الدفع المسبق فوراً'
              : 'مراجعة الحملة في هذه المدينة'
          });
        }
      });
    });

    // Sort city lists
    var sortedDesc = cityPrepaidList.slice().sort(function (a, b) { return b.prepaidPct - a.prepaidPct; });
    var sortedAsc  = cityPrepaidList.slice().sort(function (a, b) { return a.prepaidPct - b.prepaidPct; });

    return {
      totalOrders:          totalOrders,
      totalPrepaid:         totalPrepaid,
      totalCod:             totalCod,
      globalPrepaidPct:   safePct(totalPrepaid, totalOrders),
      globalCodPct:       safePct(totalCod, totalOrders),
      prepaidNdr:         globalPrepaidNdr,
      codNdr:             globalCodNdr,
      prepaidNdrBaseOrders: totalPrepaidNdrBase,
      codNdrBaseOrders: totalCodNdrBase,
      globalPrepaidDr:    globalPrepaidDr,
      globalCodDr:        globalCodDr,
      prepaidDr:          globalPrepaidDr,
      codDr:              globalCodDr,
      prepaidNdrAdvantage: globalPrepaidNdr - globalCodNdr,
      prepaidDrAdvantage: globalPrepaidDr - globalCodDr,
      highestPrepaidCities:  sortedDesc.slice(0, 5),
      lowestPrepaidCities:   sortedAsc.slice(0, 5),
      codHeavyCities:        codHeavyCities,
      codDangerousCombos:    codDangerousCombos,
      forcePrepaidRecs:      forcePrepaidRecs
    };
  }

})();
