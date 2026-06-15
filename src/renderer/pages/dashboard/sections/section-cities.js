// section-cities.js — المدن والمناطق
// Vanilla-JS section. Depends on: dashboard-shared.js (icon, formatSAR, animateNumber)

window.renderSectionCities = function (mountEl, data, ctx) {
  "use strict";
  var activeCurrency = data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || "SAR";

  // Clean up old subscriptions to avoid memory leaks
  if (window.DashboardFilterBus && mountEl._onCitiesFilterBusChange) {
    window.DashboardFilterBus.unsubscribe(mountEl._onCitiesFilterBusChange);
  }
  if (mountEl._citiesFilterBusObserver) {
    mountEl._citiesFilterBusObserver.disconnect();
  }
  if (mountEl._citiesLeaderboardResizeHandler) {
    window.removeEventListener("resize", mountEl._citiesLeaderboardResizeHandler);
  }
  if (mountEl._citiesLeaderboardResizeTimer) {
    window.clearTimeout(mountEl._citiesLeaderboardResizeTimer);
    mountEl._citiesLeaderboardResizeTimer = null;
  }
  if (mountEl._citiesSecondaryIdleHandle != null) {
    if (window.cancelIdleCallback) window.cancelIdleCallback(mountEl._citiesSecondaryIdleHandle);
    else window.clearTimeout(mountEl._citiesSecondaryIdleHandle);
    mountEl._citiesSecondaryIdleHandle = null;
  }
  if (Array.isArray(mountEl._citiesDocumentClickHandlers)) {
    mountEl._citiesDocumentClickHandlers.forEach(function (handler) {
      document.removeEventListener("click", handler);
    });
  }
  mountEl._citiesDocumentClickHandlers = [];

  function whenCitiesIdle(callback, timeout) {
    if (window.requestIdleCallback) {
      return window.requestIdleCallback(callback, { timeout: timeout || 800 });
    }
    return window.setTimeout(callback, 80);
  }

  function cancelCitiesIdle(handle) {
    if (handle == null) return;
    if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  }
  var citiesSearchTimer = null;

  // Track query state for this account/period key
  var currentQueryKey = (data && data.meta && data.meta.activeAccountId || "__all__") + "|" +
    (window.DashboardPeriodState && typeof window.DashboardPeriodState.get === "function" ? JSON.stringify(window.DashboardPeriodState.get()) : "");
  if (mountEl._citiesQueryKey !== currentQueryKey) {
    mountEl._citiesQueryKey = currentQueryKey;
    mountEl._citiesQueryDone = false;
    mountEl._citiesQueryPending = null;
  }

  function applyCitiesQueryResult(result) {
    if (!result || !result.ok || !Array.isArray(result.cities) || !window.dashboardGeoData) return;
    var existingCityStats = window.dashboardGeoData.geo && window.dashboardGeoData.geo.cityStats;
    if (result.cities.length === 0 && existingCityStats && Object.keys(existingCityStats).length > 0) {
      return;
    }

    window.dashboardGeoData.cod = window.dashboardGeoData.cod || {};
    window.dashboardGeoData.cod.cities = result.cities;

    var cityStats = {};
    result.cities.forEach(function (city) {
      cityStats[city.name] = city;
    });
    window.dashboardGeoData.geo = window.dashboardGeoData.geo || {};

    var rebuiltGeo = window.buildGeoProductMap ? window.buildGeoProductMap(
      cityStats,
      window.dashboardGeoData.geo.productStats || {},
      window.dashboardGeoData.geo.kpis || {},
      window.dashboardGeoData.meta || {}
    ) : null;

    window.dashboardGeoData.geo.cityStats = cityStats;
    if (rebuiltGeo) {
      window.dashboardGeoData.geo.geoProductMap = rebuiltGeo.geoProductMap;
      window.dashboardGeoData.geo.provinceMap = rebuiltGeo.provinceMap;
      window.dashboardGeoData.geo.prepaidIntelligence = rebuiltGeo.prepaidIntelligence;
    }
  }

  function showCitiesQueryLoader() {
    mountEl.innerHTML =
      '<div class="dash-scroll" style="flex:1;display:flex;align-items:center;justify-content:center;background:#080b12;color:#fff;">' +
        '<div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-radius:14px;background:#0b1120;border:1px solid rgba(168,85,247,0.22);color:rgba(255,255,255,0.72);font-size:13px;font-weight:800;">' +
          '<span style="width:18px;height:18px;border:2px solid rgba(168,85,247,0.2);border-top-color:#a855f7;border-radius:50%;animation:dashSpin 0.7s linear infinite;"></span>' +
          '<span>Updating city analysis...</span>' +
        '</div>' +
      '</div>';
  }

  // Wait for the query-backed snapshot before the first real paint. Rendering
  // the legacy snapshot first caused a visible second full-section refresh.
  if (!mountEl._citiesQueryDone &&
      window.DashboardQueryRuntime &&
      typeof window.DashboardQueryRuntime.flags === "function") {
    showCitiesQueryLoader();

    if (!mountEl._citiesQueryPending) {
      mountEl._citiesQueryPending = window.DashboardQueryRuntime.flags().then(function (flags) {
        if (!flags || !flags.cities) return null;
        return window.DashboardQueryRuntime.query("cities", {}, data);
      }).then(function (result) {
        applyCitiesQueryResult(result);
      }).catch(function (err) {
        console.error("[Cities] Async query failed:", err);
      }).then(function () {
        if (mountEl._citiesQueryKey !== currentQueryKey) return;
        mountEl._citiesQueryDone = true;
        mountEl._citiesQueryPending = null;
        if (!mountEl.isConnected || !ctx || ctx.sectionId !== "cities") return;
        var cleanup = window.renderSectionCities(mountEl, data, ctx);
        if (typeof cleanup === "function") mountEl._dashboardSectionCleanup = cleanup;
      });
    }

    return function () {};
  }

  // =======================================================================
  // IMPORTANT WARNING: Do not translate cities or provinces.
  // Do not translate cities or provinces.
  // Force showing the city and the province name in Arabic everywhere.
  // =======================================================================

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getIsAr() {
    return window.dashboardI18n
      ? window.dashboardI18n.currentLocale === "ar"
      : true;
  }
  function s6Txt(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (getIsAr() ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }

  function openExclusionModal(cities, reason) {
    var existing = document.getElementById("sc-exclusion-modal");
    if (existing) existing.remove();

    var items = (Array.isArray(cities) ? cities : []).filter(function (city) {
      return city && city.name;
    });
    var platformTemplates = {
      plain: items.map(function (city) { return city.name; }).join(", "),
      facebook: items.map(function (city) { return city.name; }).join("\n"),
      tiktok: items.map(function (city) { return city.name; }).join("\n"),
      snapchat: items.map(function (city) { return city.name; }).join("\n"),
    };

    function platformBtn(key, label, active) {
      return (
        '<button class="sc-exclusion-platform" data-platform="' + key + '" style="' +
        "padding:8px 12px;border-radius:10px;border:1px solid " +
        (active ? "rgba(168,85,247,0.55)" : "rgba(255,255,255,0.08)") +
        ";background:" +
        (active ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)") +
        ";color:" +
        (active ? "#f5f3ff" : "rgba(255,255,255,0.62)") +
        ";font-size:12px;font-weight:800;font-family:inherit;cursor:pointer;" +
        '">' +
        label +
        "</button>"
      );
    }

    var preview = items.slice(0, 10).map(function (city) {
      var ndrLabel = typeof city.ndr === "number" ? " - NDR " + city.ndr.toFixed(1) + "%" : "";
      return (
        '<span style="display:inline-flex;padding:5px 9px;border-radius:999px;' +
        'background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.28);' +
        'color:#fecaca;font-size:11px;font-weight:800;">' +
        esc(city.name) + esc(ndrLabel) +
        "</span>"
      );
    }).join("");

    var overlay = document.createElement("div");
    overlay.id = "sc-exclusion-modal";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,0.78);" +
      "backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;" +
      "padding:18px;";
    overlay.innerHTML =
      '<div style="width:min(720px,100%);background:#0d1525;border:1px solid rgba(168,85,247,0.28);' +
      'border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,0.42);padding:22px;direction:' +
      (getIsAr() ? "rtl" : "ltr") +
      ';font-family:Cairo,sans-serif;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">' +
      '<div>' +
      '<div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:5px;">' +
      s6Txt("Ad Set Exclusion List", "قائمة استبعاد المدن للإعلانات") +
      "</div>" +
      '<div style="font-size:12px;color:rgba(255,255,255,0.52);line-height:1.7;">' +
      esc(reason || s6Txt("Cities with weak NDR are recommended for exclusion.", "المدن ذات NDR الضعيف يفضل استبعادها من الحملات.")) +
      "</div>" +
      "</div>" +
      '<button id="sc-exclusion-close" style="width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);' +
      'background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.72);font-size:18px;font-weight:900;cursor:pointer;">x</button>' +
      "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
      platformBtn("plain", s6Txt("Plain", "قائمة عادية"), true) +
      platformBtn("facebook", "Facebook", false) +
      platformBtn("tiktok", "TikTok", false) +
      platformBtn("snapchat", "Snapchat", false) +
      "</div>" +
      '<textarea id="sc-exclusion-output" readonly style="width:100%;height:180px;resize:vertical;box-sizing:border-box;' +
      'background:#08111f;border:1px solid rgba(255,255,255,0.10);border-radius:14px;color:#e5e7eb;' +
      'font-family:Consolas,monospace;font-size:13px;line-height:1.7;padding:14px;outline:none;direction:ltr;">' +
      esc(platformTemplates.plain || "") +
      "</textarea>" +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;flex-wrap:wrap;">' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;max-width:480px;">' +
      (preview || '<span style="color:rgba(255,255,255,0.42);font-size:12px;">' + s6Txt("No weak-NDR cities found.", "لا توجد مدن ضعيفة NDR.") + "</span>") +
      "</div>" +
      '<button id="sc-exclusion-copy" style="padding:10px 16px;border-radius:11px;border:1px solid rgba(20,184,166,0.35);' +
      'background:rgba(20,184,166,0.15);color:#99f6e4;font-size:12px;font-weight:900;font-family:inherit;cursor:pointer;">' +
      s6Txt("Copy List", "نسخ القائمة") +
      "</button>" +
      "</div>" +
      "</div>";

    document.body.appendChild(overlay);

    var output = overlay.querySelector("#sc-exclusion-output");
    overlay.querySelectorAll(".sc-exclusion-platform").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.platform || "plain";
        output.value = platformTemplates[key] || "";
        overlay.querySelectorAll(".sc-exclusion-platform").forEach(function (other) {
          var active = other === btn;
          other.style.borderColor = active ? "rgba(168,85,247,0.55)" : "rgba(255,255,255,0.08)";
          other.style.background = active ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)";
          other.style.color = active ? "#f5f3ff" : "rgba(255,255,255,0.62)";
        });
      });
    });

    function closeModal() {
      overlay.remove();
    }

    overlay.querySelector("#sc-exclusion-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeModal();
    });
    overlay.querySelector("#sc-exclusion-copy").addEventListener("click", function () {
      var text = output.value || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          if (window.TaagerUI && window.TaagerUI.toast) {
            window.TaagerUI.toast(s6Txt("Exclusion list copied.", "تم نسخ قائمة الاستبعاد."), "success");
          }
        });
      } else {
        output.select();
        document.execCommand("copy");
      }
    });
  }

  var realCities =
    data && data.cod && Array.isArray(data.cod.cities) ? data.cod.cities : [];
  if (false) {
    (function debugCitiesSection() {
      if (realCities.length === 0) return;
      var fmtSAR =
        ctx && ctx.formatSAR
          ? ctx.formatSAR
          : function (n) {
              return Number(n || 0).toLocaleString("en-US") + " " + activeCurrency;
            };
      var maxOrders =
        Math.max.apply(
          null,
          realCities.map(function (c) {
            return c.count || 0;
          }),
        ) || 1;
      mountEl.innerHTML =
        '<div dir="rtl" style="flex:1;overflow-y:auto;background:#080b12;color:#fff;font-family:Cairo,sans-serif;padding:24px 28px 38px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:16px;">' +
        '<div style="font-size:12px;color:rgba(255,255,255,0.45);">' +
        s6Txt(
          "Sorted by collection gap and order count from the current Dashboard snapshot",
          "مرتبة حسب فجوة التحصيل وعدد الطلبات من لقطة Dashboard الحالية",
        ) +
        "</div>" +
        '<div><h1 style="margin:0;font-size:28px;font-weight:900;">' +
        s6Txt("Cities and Regions", "المدن والمناطق") +
        '</h1><p style="margin:6px 0 0;color:rgba(255,255,255,0.42);font-size:12px;">' +
        s6Txt(
          "Real data based on the selected account",
          "بيانات حقيقية حسب الحساب المحدد",
        ) +
        "</p></div>" +
        "</div>" +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">' +
        realCities
          .map(function (city, idx) {
            var pct = Math.max(4, ((city.count || 0) / maxOrders) * 100);
            return (
              '<div class="fade-up" style="animation-delay:' +
              idx * 45 +
              'ms;background:#0b1120;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;">' +
              '<div style="font-size:12px;color:#a855f7;font-weight:800;">#' +
              (idx + 1) +
              "</div>" +
              '<div style="font-size:16px;font-weight:900;text-align:right;">' +
              city.name +
              "</div>" +
              "</div>" +
              '<div style="height:6px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden;margin-bottom:14px;"><div style="width:' +
              pct +
              '%;height:100%;background:linear-gradient(90deg,#7c3aed,#14b8a6);"></div></div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">' +
              '<div style="background:rgba(255,255,255,0.035);border-radius:10px;padding:10px;"><div style="color:rgba(255,255,255,0.42);margin-bottom:4px;">' +
              s6Txt("Orders", "الطلبات") +
              "</div><strong>" +
              (city.count || 0).toLocaleString("en-US") +
              "</strong></div>" +
              '<div style="background:rgba(255,255,255,0.035);border-radius:10px;padding:10px;"><div style="color:rgba(255,255,255,0.42);margin-bottom:4px;">' +
              s6Txt("Collection", "التحصيل") +
              "</div><strong>" +
              (city.pct || 0).toLocaleString("en-US") +
              "%</strong></div>" +
              '<div style="background:rgba(255,255,255,0.035);border-radius:10px;padding:10px;"><div style="color:rgba(255,255,255,0.42);margin-bottom:4px;">' +
              s6Txt("Remaining", "المتبقي") +
              "</div><strong>" +
              fmtSAR(city.gap || 0) +
              "</strong></div>" +
              '<div style="background:rgba(255,255,255,0.035);border-radius:10px;padding:10px;"><div style="color:rgba(255,255,255,0.42);margin-bottom:4px;">' +
              s6Txt("Due", "المستحق") +
              "</div><strong>" +
              fmtSAR(city.due || 0) +
              "</strong></div>" +
              "</div>" +
              "</div>"
            );
          })
          .join("") +
        "</div>" +
        "</div>";
      return;
    })();
  }

  // ── Province + city data ────────────────────────────────────────────────────
  // Build initial PROVINCES from the single source of truth (provinceMapSrc).
  // This fallback is only rendered when realCities.length === 0.
  var _pmSrc =
    (window.dashboardGeoData &&
      window.dashboardGeoData.geo &&
      window.dashboardGeoData.geo.provinceMap) ||
    {};
  var PROVINCES = Object.keys(_pmSrc)
    .filter(function (pid) {
      return pid !== "other";
    })
    .map(function (pid) {
      var pm = _pmSrc[pid];
      return {
        id: pid,
        name: pm.name,
        color: pm.color,
        orders: 0,
        deliveryRate: 0,
        codRate: 0,
        returnRate: 0,
        avgDays: null,
        trend: 0,
        trendUp: true,
        mapCx: pm.x,
        mapCy: pm.y,
        mapRx: pm.rx || 45,
        mapRy: pm.ry || 35,
        cities: [],
      };
    });

  if (realCities.length > 0) {
    // Read province metadata from the single source of truth
    var provinceMapSrc =
      (window.dashboardGeoData &&
        window.dashboardGeoData.geo &&
        window.dashboardGeoData.geo.provinceMap) ||
      {};

    var provGroups = {};
    Object.keys(provinceMapSrc).forEach(function (pid) {
      var pm = provinceMapSrc[pid];
      provGroups[pid] = {
        id: pid,
        name: pm.name,
        color: pm.color,
        x: pm.x,
        y: pm.y,
        rx: pm.rx,
        ry: pm.ry,
        cities: [],
        totalOrders: 0,
        totalDelivered: 0,
        totalDue: 0,
        totalGap: 0,
        totalActiveOrders: 0,
        totalConfirmed: 0,
        totalDeliveryDays: 0,
        deliveryDurationOrders: 0,
      };
    });
    // Ensure 'other' bucket always exists
    if (!provGroups["other"]) {
      var otherMeta = provinceMapSrc["other"] || {
        name: "مناطق أخرى",
        color: "#64748b",
        x: 205,
        y: 190,
        rx: 30,
        ry: 22,
      };
      provGroups["other"] = {
        id: "other",
        name: otherMeta.name,
        color: otherMeta.color,
        x: otherMeta.x,
        y: otherMeta.y,
        rx: otherMeta.rx,
        ry: otherMeta.ry,
        cities: [],
        totalOrders: 0,
        totalDelivered: 0,
        totalDue: 0,
        totalGap: 0,
        totalActiveOrders: 0,
        totalConfirmed: 0,
        totalDeliveryDays: 0,
        deliveryDurationOrders: 0,
      };
    }

    realCities.forEach(function (city, idx) {
      // provinceId is already resolved by dashboard-aggregator.js resolveProvince()
      var provId = city.provinceId || "other";
      var pDef = provGroups[provId] || provGroups["other"];

      var count = window.DashboardOrderMetrics
        ? window.DashboardOrderMetrics.netOrders(city)
        : Number(city.netOrderCount != null ? city.netOrderCount : city.count || 0);
      var pct = Number(city.ndrPct !== undefined ? city.ndrPct : city.pct || 0);
      var due = Number(city.due || 0);
      var gap = Number(city.gap || 0);
      var deliveredOrders = Number(city.deliveredOrders != null ? city.deliveredOrders : count * (pct / 100));
      if (deliveredOrders <= 0) pct = 0;
      var activeOrders = Number(city.drBaseOrders || count);
      var confirmedOrders = Number(
        city.confirmedCount != null && city.confirmedCount !== ""
          ? city.confirmedCount
          : activeOrders,
      );
      // drPct: prefer pre-computed, else compute from raw counters
      var drPct =
        window.isExpectedNdrMode && window.isExpectedNdrMode()
          ? (activeOrders > 0 ? Math.round((deliveredOrders / activeOrders) * 1000) / 10 : 0)
          : (city.drPct && city.drPct > 0
            ? Number(city.drPct)
            : city.drBaseOrders > 0
              ? Math.round((city.deliveredOrders / city.drBaseOrders) * 1000) / 10
              : 0);
      var avgDeliveryDays =
        city.avgDeliveryDays != null ? Number(city.avgDeliveryDays) : null;
      var deliveryDurationOrders = Number(city.deliveryDurationOrders || 0);

      var angle = pDef.cities.length * 0.8 + idx * 0.1;
      var r = 5 + (idx % 3) * 5;
      var resolvedCountry = cityMapCountry(city);
      var geoPoint = window.TaagerGeo && typeof window.TaagerGeo.cityPoint === "function"
        ? window.TaagerGeo.cityPoint(city.name, resolvedCountry, idx)
        : null;

      pDef.cities.push({
        name: city.name || s6Txt("Unknown", "غير معروف"),
        country: resolvedCountry,
        orders: count,
        activeOrders: activeOrders,
        deliveryRate: pct,
        drRate: drPct,
        confirmedCount: confirmedOrders,
        codRate: pct,
        returnRate: due > 0 ? Math.round((gap / due) * 1000) / 10 : 0,
        avgDeliveryDays: avgDeliveryDays,
        deliveryDurationOrders: deliveryDurationOrders,
        x: geoPoint ? geoPoint.x : pDef.x + Math.cos(angle) * r,
        y: geoPoint ? geoPoint.y : pDef.y + Math.sin(angle) * r,
      });

      pDef.totalOrders += count;
      pDef.totalDelivered += deliveredOrders;
      pDef.totalActiveOrders += activeOrders;
      pDef.totalConfirmed += confirmedOrders;
      pDef.totalDue += due;
      pDef.totalGap += gap;
      if (avgDeliveryDays != null && deliveryDurationOrders > 0) {
        pDef.totalDeliveryDays += avgDeliveryDays * deliveryDurationOrders;
        pDef.deliveryDurationOrders += deliveryDurationOrders;
      }
    });

    PROVINCES = [];
    Object.keys(provGroups).forEach(function (k) {
      var p = provGroups[k];
      if (p.cities.length > 0) {
        var dRate =
          p.totalOrders > 0 ? (p.totalDelivered / p.totalOrders) * 100 : 0;
        var activeRate =
          p.totalActiveOrders > 0
            ? (p.totalDelivered / p.totalActiveOrders) * 100
            : 0;
        var rRate = p.totalDue > 0 ? (p.totalGap / p.totalDue) * 100 : 0;
        PROVINCES.push({
          id: p.id,
          name: p.name,
          color: p.color,
          orders: p.totalOrders,
          deliveryRate: Math.round(dRate * 10) / 10,
          drRate: Math.round(activeRate * 10) / 10,
          confirmedCount: p.totalConfirmed,
          codRate: Math.round(dRate * 10) / 10,
          returnRate: Math.round(rRate * 10) / 10,
          avgDays:
            p.deliveryDurationOrders > 0
              ? Math.round(
                  (p.totalDeliveryDays / p.deliveryDurationOrders) * 10,
                ) / 10
              : null,
          trend: 0,
          trendUp: true,
          mapCx: p.x,
          mapCy: p.y,
          mapRx: p.rx || 45,
          mapRy: p.ry || 35,
          cities: p.cities,
        });
      }
    });
    PROVINCES.sort(function (a, b) {
      return b.orders - a.orders;
    });
  }

  // Flat sorted city list
  var ALL_CITIES = [];
  PROVINCES.forEach(function (p) {
    p.cities.forEach(function (c) {
      ALL_CITIES.push({
        name: c.name,
        country: cityMapCountry(c),
        orders: c.orders,
        activeOrders: c.activeOrders,
        deliveryRate: c.deliveryRate,
        drRate: c.drRate,
        confirmedCount: c.confirmedCount,
        codRate: c.codRate,
        returnRate: c.returnRate,
        avgDeliveryDays: c.avgDeliveryDays,
        x: c.x,
        y: c.y,
        provinceId: p.id,
        provinceName: p.name,
        color: p.color,
        trend: p.trend,
        trendUp: p.trendUp,
      });
    });
  });
  ALL_CITIES.sort(function (a, b) {
    return b.orders - a.orders;
  });

  var MAX_ORDERS = (ALL_CITIES[0] && ALL_CITIES[0].orders) || 1;
  var TOTAL_ORDERS = ALL_CITIES.reduce(function (sum, city) {
    return sum + city.orders;
  }, 0);
  var TOTAL_ACTIVE_ORDERS = ALL_CITIES.reduce(function (sum, city) {
    return sum + (city.activeOrders || 0);
  }, 0);
  var TOTAL_DELIVERED = ALL_CITIES.reduce(function (sum, city) {
    return sum + (city.deliveryRate / 100) * city.orders;
  }, 0);
  var TOTAL_CONFIRMED = ALL_CITIES.reduce(function (sum, city) {
    return sum + (city.confirmedCount || 0);
  }, 0);
  var DELIVERY_RATE =
    TOTAL_ORDERS > 0
      ? Math.round((TOTAL_DELIVERED / TOTAL_ORDERS) * 1000) / 10
      : 0;
  var ACTIVE_DR =
    TOTAL_ACTIVE_ORDERS > 0
      ? Math.round((TOTAL_DELIVERED / TOTAL_ACTIVE_ORDERS) * 1000) / 10
      : 0;
  /* Filter to cities with meaningful order volume to avoid 0%-or-100% outliers */
  var ELIGIBLE_CITIES = ALL_CITIES.filter(function(c) { return c.orders >= 10; });
  var BEST_CITY = ELIGIBLE_CITIES.slice().sort(function (a, b) {
    return b.deliveryRate - a.deliveryRate;
  })[0] || ALL_CITIES[0] || { name: '—', deliveryRate: 0 };
  var WATCH_CITY = ELIGIBLE_CITIES.slice().sort(function (a, b) {
    return a.deliveryRate - b.deliveryRate;
  })[0] || ALL_CITIES[ALL_CITIES.length - 1] || { name: '—', deliveryRate: 0 };

  var SAUDI_PATH =
    "M43.493,151.359L43.014,151.359L41.644,149.933L40.89,148.872L40.068,148.177L36.438,146.749L35.89,145.833L36.507,144.917L36.849,145.833L37.534,146.346L40.548,147.664L43.904,150.445L44.521,150.701ZM140.274,328.281L141.712,328.384L141.096,327.729L140.959,327.418L141.644,326.521L143.699,328.419L143.63,330.625L143.493,331.142L142.945,330.659L142.534,330.211L142.397,329.694L141.849,329.143L139.795,329.487L138.562,328.901L136.712,327.004L136.233,325.659L136.986,325.383L137.808,324.727L138.288,323.657L137.808,322.552L138.904,322.724L139.521,323.864L139.589,326.452L139.795,327.004L139.452,327.591ZM330.342,282.681L325.822,283.31L321.507,283.938L316.644,284.637L310.753,285.474L306.164,286.103L299.452,287.08L293.425,287.917L287.808,288.719L282.123,289.521L277.329,290.218L274.452,291.019L271.096,292.726L265.89,295.407L260.616,298.12L257.945,299.511L255.068,303.124L253.63,304.929L250.959,308.225L248.973,310.721L246.644,313.665L245.616,316.33L244.041,320.375L242.671,321.412L240.411,322.724L238.356,323.657L235.137,323.553L233.356,321.032L231.37,318.405L230.411,317.333L229.589,317.264L226.37,317.609L222.466,318.024L217.945,317.575L212.671,317.056L207.74,316.606L205.274,316.26L202.055,314.53L201.233,314.184L200.342,314.115L196.575,314.045L192.74,314.011L188.904,314.565L185.274,314.357L181.507,314.669L180.137,315.326L178.699,315.291L177.74,315.88L176.986,316.157L175.959,315.638L174.795,315.776L173.082,315.326L171.918,314.219L170.89,313.215L169.795,312.66L168.562,312.349L167.466,312.314L166.096,312.938L165.274,313.526L163.151,315.465L163.082,316.157L164.041,317.298L163.699,317.851L162.466,318.543L162.123,320.375L161.918,321.377L161.712,323.76L162.26,325.659L163.014,326.349L163.082,327.177L162.671,328.798L161.507,329.281L160.685,330.832L160.137,331.555L159.247,332.382L155.685,335.103L155.479,333.519L154.384,331.176L154.315,329.487L153.767,327.832L152.808,326.556L151.027,325.245L150.822,323.415L149.521,321.619L147.808,320.168L146.781,317.506L146.096,313.942L141.507,309.265L135.753,304.964L133.973,302.499L131.096,297.529L129.658,293.597L125.822,289.067L125.685,287.324L125.068,285.195L124.178,282.821L123.699,280.934L119.795,272.711L118.562,271.414L117.466,269.556L117.192,268.153L116.849,267.381L114.178,266.012L111.575,262.534L103.973,257.011L100.205,256.483L97.26,254.511L95.068,251.902L92.74,247.455L88.63,242.649L85.205,235.779L86.301,233.26L86.233,231.521L85.137,228.537L83.973,226.262L83.151,224.092L83.836,220.958L84.041,217.464L84.726,215.608L85.205,213.573L84.589,209.462L83.425,207.279L83.562,205.81L82.26,205.094L81.164,203.481L82.26,203.517L80.274,201.293L79.521,200.073L78.767,197.057L77.808,194.756L74.726,189.5L73.219,186.292L69.863,182.176L66.233,179.103L63.973,177.729L62.877,176.462L60.959,176.389L58.904,174.578L57.466,174.542L55.685,174.252L53.562,170.735L51.781,167.467L48.767,163.177L49.521,162.048L50.411,160.227L50,157.858L49.521,156.253L48.219,153.296L43.836,145.906L42.671,144.844L40.822,143.597L39.726,140.368L39.178,137.502L36.164,136.105L31.096,125.711L28.082,122.052L26.918,119.609L23.493,115.569L21.849,111.523L18.356,107.804L15.342,101.358L10.753,94.856L8.767,93.733L4.041,93.284L1.986,92.797L0.137,94.219L0,92.422L1.301,89.911L3.082,84.655L3.493,80.027L6.37,66.276L10.411,66.958L13.767,67.564L18.63,68.435L23.699,69.306L26.644,69.836L27.603,69.609L31.712,66.239L35.411,63.167L37.603,59.445L39.726,55.793L40.685,55.031L43.973,54.384L49.178,53.279L54.315,52.211L54.658,51.868L55.89,48.929L57.397,45.221L57.74,44.838L58.082,44.456L61.781,42.35L63.973,41.085L60.822,37.363L57.808,33.828L54.452,29.862L51.644,26.777L47.329,22.141L44.589,19.083L49.452,17.65L54.726,16.099L60.068,14.508L66.507,12.605L71.507,11.128L79.041,8.91L82.671,7.82L83.356,7.548L86.164,4.897L90.411,5.638L96.781,6.768L102.945,7.82L109.452,9.066L111.575,10.117L117.808,13.848L121.918,16.293L126.644,19.161L132.603,22.683L136.644,25.117L141.918,28.243L145.959,31.788L151.164,36.288L156.781,41.2L161.438,45.03L167.877,50.265L174.247,55.412L180.411,60.471L185.411,64.495L191.644,69.571L192.192,69.76L198.493,70.327L207.055,71.122L215.616,71.878L223.356,72.596L226.712,71.878L230.342,72.331L235.274,72.974L238.219,73.389L243.836,74.182L245.548,77.503L246.164,79.801L246.712,82.06L248.356,84.091L252.192,84.054L255.548,84.016L259.726,83.941L263.082,83.903L264.11,85.933L264.589,87.96L266.575,92.759L269.384,96.502L270,97.847L270.479,99.902L270,100.686L269.795,101.544L271.849,103.595L275.342,105.31L276.644,105.757L278.151,106.539L276.986,107.693L279.041,110.445L281.37,113.194L283.904,113.825L287.329,118.016L292.397,120.719L295.548,124.27L295.274,124.344L294.315,123.974L293.219,123.494L292.877,123.937L292.877,125.416L293.219,127.151L294.795,128.664L296.233,129.734L296.781,131.798L295.616,136.215L295.274,136.179L294.521,135.811L293.699,135.737L293.288,135.995L294.247,139.156L295.137,141.579L296.301,143.487L297.26,146.309L298.014,147.481L301.37,150.482L302.329,152.967L303.288,157.603L305.342,160.154L306.507,162.157L308.014,163.832L308.973,166.123L310.342,167.903L311.096,168.339L312.123,168.52L313.493,168.52L315.068,168.085L316.781,167.649L318.151,168.52L319.521,168.411L319.658,169.247L318.767,170.372L317.603,173.201L319.247,173.672L320.753,173.89L321.918,174.361L322.534,174.361L322.534,174.94L322.603,177.656L323.014,178.669L323.699,179.574L324.726,180.947L325.753,182.321L326.849,183.693L327.877,185.029L328.904,186.4L330,187.77L331.027,189.104L332.055,190.473L333.082,191.841L334.178,193.209L335.205,194.54L336.233,195.907L337.329,197.272L338.356,198.637L339.384,199.966L340.411,201.329L341.301,202.441L342.877,202.657L343.425,202.728L344.863,202.908L347.055,203.23L350,203.589L353.425,204.055L357.26,204.556L361.37,205.094L365.616,205.667L369.863,206.24L373.904,206.777L377.74,207.279L381.233,207.744L384.11,208.138L386.37,208.424L387.808,208.603L388.288,208.675L389.795,208.889L390.068,208.818L391.37,207.171L392.74,209.498L393.904,211.429L395.479,214.109L397.192,216.929L398.836,219.604L400,221.635L399.384,223.7L398.699,225.978L398.014,228.218L397.26,230.491L396.575,232.764L395.89,235.034L395.205,237.303L394.521,239.534L393.767,241.8L393.082,244.063L392.397,246.325L391.712,248.55L391.027,250.809L390.342,253.066L389.589,255.321L388.904,257.54L388.219,259.792L387.397,262.499L385.342,263.202L382.123,264.361L378.836,265.52L375.548,266.679L372.26,267.872L368.973,269.03L365.753,270.187L362.466,271.344L359.178,272.501L355.89,273.657L352.603,274.812L349.384,275.968L346.096,277.123L342.808,278.277L339.521,279.431L336.301,280.585L333.014,281.738ZM37.671,144.404L37.466,144.697L36.644,143.927L36.712,142.313L37.397,141.396L37.329,142.643L37.671,143.927Z";

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function svgIcon(name, size, color) {
    var c = color || "currentColor";
    var s = size || 16;
    var paths = {
      package:
        '<path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z"/><polyline points="2.32 6.16 12 11 21.68 6.16"/><line x1="12" y1="22.76" x2="12" y2="11"/>',
      trendingUp:
        '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
      award:
        '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>',
      checkCircle:
        '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>',
      clipboardCheck:
        '<path d="M9 14l2 2 4-4"/><path d="M9 2h6a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a2 2 0 0 1 2-2z"/><path d="M9 5h6"/>',
      alertTriangle:
        '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      mapPin:
        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
      barChart:
        '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      clock:
        '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      trendingDown:
        '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    };
    return (
      '<svg width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="none" stroke="' +
      c +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;flex-shrink:0">' +
      (paths[name] || "") +
      "</svg>"
    );
  }

  function rateColor(rate) {
    return window.dashboardRateColor ? window.dashboardRateColor(rate) : (rate >= 40 ? "#22d3ee" : rate >= 30 ? "#00e676" : rate >= 20 ? "#f59e0b" : "#ef4444");
  }

  function formatPercent(value, decimals) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    return n.toFixed(decimals == null ? 2 : decimals);
  }

  function shortProvName(name) {
    return String(name || "");
  }

  // ── Phase 5: Global Filter Bar HTML ─────────────────────────────────────────
  function filterBarHTML() {
    var isAr = window.dashboardI18n
      ? window.dashboardI18n.currentLocale === "ar"
      : false;
    var dirStr = isAr ? "rtl" : "ltr";

    var selProv = mountEl._citiesSelectedProvince || (window.DashboardFilterBus && window.DashboardFilterBus.getState().selectedProvince) || "";
    var provinceOpts =
      '<option value="">' +
      s6Txt("Region: All", "المنطقة: الكل") +
      "</option>" +
      PROVINCES.map(function (p) {
        var sel = p.id === selProv ? ' selected' : '';
        return (
          '<option value="' + p.id + '"' + sel + '>' + shortProvName(p.name) + "</option>"
        );
      }).join("");

    var geoD = window.dashboardGeoData;
    var selProduct = mountEl._citiesSelectedProduct || (window.DashboardFilterBus && window.DashboardFilterBus.getState().selectedProduct) || "";
    var productOpts =
      '<option value="">' + s6Txt("Product: All", "المنتج: الكل") + "</option>";
    var hasSelectedProductOption = !selProduct;
    if (geoD && geoD.products && geoD.products.rankedList) {
      geoD.products.rankedList.forEach(function (p) {
        var k = p.key || p.sku || p.name || "";
        var lbl = p.name || p.key || "";
        if (p.sku && p.sku !== p.name) {
          lbl = p.name + " (" + p.sku + ")";
        }
        var sel = k === selProduct ? ' selected' : '';
        if (k === selProduct) hasSelectedProductOption = true;
        productOpts +=
          '<option value="' + esc(k) + '"' + sel + '>' + esc(lbl) + "</option>";
      });
    }
    if (selProduct && !hasSelectedProductOption) {
      productOpts +=
        '<option value="' + esc(selProduct) + '" selected>' + esc(selProduct) + "</option>";
    }

    var selBg = isAr
      ? 'url(\'data:image/svg+xml;utf8,<svg fill="none" stroke="%23a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"/></svg>\') no-repeat left 10px center / 14px'
      : 'url(\'data:image/svg+xml;utf8,<svg fill="none" stroke="%23a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"/></svg>\') no-repeat right 10px center / 14px';
    var paddingStr = isAr
      ? "padding:8px 12px 8px 28px;"
      : "padding:8px 28px 8px 12px;";
    var selStyle =
      "background:#0b1120 " +
      selBg +
      ";border:1px solid rgba(255,255,255,0.1);border-radius:10px;" +
      "color:#fff;font-family:Cairo,sans-serif;font-size:12px;font-weight:700;" +
      paddingStr +
      "cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;min-width:140px;" +
      "transition:border-color 0.2s,box-shadow 0.2s;";

    var payVal =
      mountEl._citiesPaymentFilter ||
      (window.DashboardFilterBus && window.DashboardFilterBus.getState
        ? window.DashboardFilterBus.getState().paymentFilter || "all"
        : "all");

    function pillStyle(active) {
      return (
        "padding:7px 14px;border-radius:9px;border:none;font-size:11px;font-weight:800;" +
        "cursor:pointer;font-family:inherit;transition:all 0.18s;" +
        "background:" +
        (active ? "#7c3aed" : "rgba(255,255,255,0.05)") +
        ";" +
        "color:" +
        (active ? "#fff" : "rgba(255,255,255,0.45)") +
        ";" +
        "box-shadow:" +
        (active ? "0 2px 10px rgba(124,58,237,0.35)" : "none") +
        ";"
      );
    }

    var searchVal = mountEl._citiesSearchValue || "";

    return (
      '<div id="sc-filter-bar" class="fade-up" style="animation-delay:100ms;' +
      "padding:0 32px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;direction:" +
      dirStr +
      ';position:relative;z-index:50;">' +
      '<select id="sc-fb-province" style="' +
      selStyle +
      '" dir="' +
      dirStr +
      '">' +
      provinceOpts +
      "</select>" +
      '<select id="sc-fb-product" style="' +
      selStyle +
      '" dir="' +
      dirStr +
      '">' +
      productOpts +
      "</select>" +
      '<div style="display:flex;gap:4px;background:rgba(255,255,255,0.04);border-radius:11px;padding:3px;">' +
      '<button class="sc-pay-pill" data-pay="all" style="' +
      pillStyle(payVal === "all") +
      '">' +
      s6Txt("All", "الكل") +
      "</button>" +
      '<button class="sc-pay-pill" data-pay="prepaid" style="' +
      pillStyle(payVal === "prepaid") +
      '">' +
      s6Txt("Prepaid", "مسبق الدفع") +
      "</button>" +
      '<button class="sc-pay-pill" data-pay="cod" style="' +
      pillStyle(payVal === "cod") +
      '">COD</button>' +
      "</div>" +
      '<div style="flex:1;min-width:180px;">' +
      '<input id="sc-fb-search" type="text" placeholder="' +
      s6Txt("Search city...", "بحث عن مدينة...") +
      '" value="' + esc(searchVal) + '" style="' +
      "width:100%;background:#0b1120;border:1px solid rgba(255,255,255,0.1);border-radius:10px;" +
      "color:#fff;font-family:Cairo,sans-serif;font-size:12px;padding:8px 12px;outline:none;" +
      'box-sizing:border-box;transition:border-color 0.2s;" dir="' +
      dirStr +
      '" />' +
      "</div>" +
      '<button id="sc-fb-reset" class="sc-reset-btn" type="button" data-active="false" aria-label="' +
      s6Txt("Reset city analysis filters", "إعادة ضبط فلاتر تحليل المدن") +
      '" title="' + s6Txt("Reset city analysis filters", "إعادة ضبط فلاتر تحليل المدن") + '">↺ ' +
      s6Txt("Reset", "إعادة ضبط") +
      "</button>" +
      '<button id="sc-fb-exclude-export" style="padding:7px 12px;border-radius:9px;border:1px solid rgba(168,85,247,0.3);' +
      "background:rgba(168,85,247,0.1);color:#e9d5ff;font-size:11px;font-weight:800;" +
      'cursor:pointer;font-family:inherit;transition:all 0.18s;white-space:nowrap;">' +
      s6Txt("Export Exclusions", "تصدير الاستبعاد") +
      "</button>" +
      "</div>"
    );
  }

  // ── KPI cards HTML ──────────────────────────────────────────────────────────
  function kpiRowHTML() {
    var cards = [
      {
        icon: "package",
        color: "#a855f7",
        label: s6Txt("Net Orders", "صافي الطلبات"),
        value: TOTAL_ORDERS.toLocaleString("en-US"),
        trend: "+4.2%",
        trendUp: true,
      },
      {
        icon: "trendingUp",
        color: "#14b8a6",
        label: s6Txt("NDR (Total)", "NDR (إجمالي)"),
        value: formatPercent(DELIVERY_RATE) + "%",
        trend: "+2.1%",
        trendUp: true,
      },
      {
        icon: "trendingUp",
        color: "#7c3aed",
        label: s6Txt("DR (Active)", "DR (النشطة)"),
        value: formatPercent(ACTIVE_DR) + "%",
        trend: null,
        trendUp: true,
      },
      {
        icon: "checkCircle",
        color: "#22d3ee",
        label: s6Txt("Delivered Orders", "الطلبات المسلمة"),
        value: Math.round(TOTAL_DELIVERED).toLocaleString("en-US"),
        trend: null,
        trendUp: true,
      },
      {
        icon: "clipboardCheck",
        color: "#3b82f6",
        label: s6Txt("Confirmed Orders", "الطلبات المؤكدة"),
        value: Math.round(TOTAL_CONFIRMED).toLocaleString("en-US"),
        trend: null,
        trendUp: true,
      },
      {
        icon: "award",
        color: "#00e676",
        label: s6Txt("Best Delivery City", "أفضل مدينة تسليماً"),
        value: BEST_CITY.name,
        sub:
          formatPercent(BEST_CITY.deliveryRate) + "%" + s6Txt(" delivery rate", " معدل تسليم"),
        trend: null,
      },
      {
        icon: "alertTriangle",
        color: "#ef4444",
        label: s6Txt("Needs Attention", "تحتاج متابعة"),
        value: WATCH_CITY.name,
        sub:
          formatPercent(WATCH_CITY.deliveryRate) +
          "%" +
          s6Txt(" delivery rate", " معدل تسليم"),
        trend: null,
      },
    ];

    return cards
      .map(function (c, i) {
        var trendHTML = c.trend
          ? '<div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;' +
            "padding:3px 8px;border-radius:8px;" +
            "color:" +
            (c.trendUp ? "#00e676" : "#ef4444") +
            ";" +
            "background:" +
            (c.trendUp ? "rgba(0,230,118,0.1)" : "rgba(239,68,68,0.1)") +
            '">' +
            (c.trendUp ? "▲" : "▼") +
            " " +
            c.trend +
            "</div>"
          : "";
        var subHTML = c.sub
          ? '<div style="font-size:11px;font-weight:600;margin-top:6px;color:' +
            c.color +
            '">' +
            c.sub +
            "</div>"
          : "";
        return (
          '<div class="fade-up" style="animation-delay:' +
          i * 60 +
          "ms;" +
          "background:#0b1120;border:1px solid rgba(255,255,255,0.06);border-radius:18px;" +
          'padding:20px;flex:1;display:flex;flex-direction:column;gap:12px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="width:36px;height:36px;border-radius:12px;flex-shrink:0;' +
          "display:flex;align-items:center;justify-content:center;background:" +
          c.color +
          '1e">' +
          svgIcon(c.icon, 17, c.color) +
          "</div>" +
          trendHTML +
          "</div>" +
          '<div style="text-align:right">' +
          '<div style="font-size:22px;font-weight:900;color:#fff;line-height:1">' +
          c.value +
          "</div>" +
          '<div style="font-size:11px;color:rgba(255,255,255,0.38);margin-top:4px">' +
          c.label +
          "</div>" +
          subHTML +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  // ── Map HTML (SVG) ──────────────────────────────────────────────────────────
  // T-15: Added heatmap mode selector (NDR / Revenue / Default)
  function countryOutlinePath(country) {
    if (window.TaagerGeo && typeof window.TaagerGeo.outline === "function") {
      return window.TaagerGeo.outline(country);
    }
    return SAUDI_PATH;
  }

  function activeMapCountry() {
    var geoData = window.dashboardGeoData || {};
    var meta = geoData.meta || {};
    return meta.activeCountry || window.dashboardActiveCountry || "sa";
  }

  function cityMapCountry(city) {
    var country = String(city && city.country || "").trim().toLowerCase();
    if (country && country !== "mixed") return country;
    var active = String(activeMapCountry() || "").trim().toLowerCase();
    return active && active !== "mixed" ? active : "sa";
  }

  function mixedCountryMapsHTML(countryGroups) {
    return '<div class="fade-up" style="animation-delay:80ms;background:#0b1120;border:1px solid rgba(255,255,255,0.06);border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:12px;">' +
      '<div style="font-size:15px;font-weight:800;color:#fff;">' + s6Txt("Geographical Distribution by Country", "التوزيع الجغرافي حسب الدولة") + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;">' +
      countryGroups.map(function (group, groupIdx) {
        var code = String(group.country || "sa").toLowerCase();
        var miniShape = window.TaagerGeo && typeof window.TaagerGeo.shape === "function"
          ? window.TaagerGeo.shape(code)
          : { outline: countryOutlinePath(code), regions: [] };
        var miniId = "scmix_" + code + "_" + groupIdx;
        var countryCities = ALL_CITIES.filter(function (city) { return String(city.country || "").toLowerCase() === code; });
        var maxOrders = countryCities.reduce(function (max, city) { return Math.max(max, Number(city.orders || 0)); }, 1);
        var dots = countryCities.slice(0, 12).map(function (city, idx) {
          var point = window.TaagerGeo && window.TaagerGeo.cityPoint ? window.TaagerGeo.cityPoint(city.name, code, idx) : { x: city.x, y: city.y };
          var radius = 3 + (Number(city.orders || 0) / maxOrders) * 5;
          return '<circle cx="' + point.x + '" cy="' + point.y + '" r="' + radius + '" fill="' + (city.color || "#a855f7") + '" stroke="rgba(255,255,255,.7)" stroke-width="1"><title>' + esc(city.name) + ' · ' + s7Num(city.orders || 0) + '</title></circle>';
        }).join("");
        var miniProvinceMap = window.TaagerGeo && typeof window.TaagerGeo.provinceMap === "function"
          ? window.TaagerGeo.provinceMap(code)
          : {};
        var miniProvinces = Object.keys(miniProvinceMap).filter(function (pid) {
          return pid !== "other";
        }).map(function (pid) {
          return miniProvinceMap[pid];
        });
        var miniGlowDefs = miniProvinces.map(function (p) {
          return '<radialGradient id="' + miniId + '_glow_' + p.id + '" cx="50%" cy="50%" r="50%">' +
            '<stop offset="0%" stop-color="' + p.color + '" stop-opacity=".35"/>' +
            '<stop offset="72%" stop-color="' + p.color + '" stop-opacity=".10"/>' +
            '<stop offset="100%" stop-color="' + p.color + '" stop-opacity="0"/>' +
            '</radialGradient>';
        }).join("");
        var miniGlows = miniProvinces.map(function (p) {
          return '<ellipse cx="' + p.x + '" cy="' + p.y + '" rx="' + (p.rx || 38) + '" ry="' + (p.ry || 28) + '" fill="url(#' + miniId + '_glow_' + p.id + ')" clip-path="url(#' + miniId + '_clip)" opacity=".92"/>';
        }).join("");
        var label = window.TaagerCountry && window.TaagerCountry.label ? window.TaagerCountry.label(code) : code.toUpperCase();
        return '<div style="border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);border-radius:14px;padding:10px;">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px;"><strong style="font-size:11px;color:#fff;">' + esc(label) + '</strong><span style="font-size:9px;color:rgba(255,255,255,.48);">' + esc(group.currency || "") + ' · ' + s7Num(group.orderCount || group.rows || 0) + '</span></div>' +
          '<svg class="dash-country-map dash-country-map--compact" viewBox="' + (window.TaagerGeo && window.TaagerGeo.viewBox ? window.TaagerGeo.viewBox(code) : "0 0 400 340") + '" style="width:100%;height:145px;">' +
          '<defs><clipPath id="' + miniId + '_clip"><path d="' + miniShape.outline + '"/></clipPath><filter id="' + miniId + '_shadow" x="-25%" y="-25%" width="150%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#020617" flood-opacity=".65"/></filter>' + miniGlowDefs + '</defs>' +
          '<path d="' + miniShape.outline + '" fill="rgba(59,130,246,.09)" stroke="rgba(168,85,247,.55)" stroke-width="2" filter="url(#' + miniId + '_shadow)"/>' +
          miniGlows +
          '<path d="' + miniShape.outline + '" fill="none" stroke="rgba(196,181,253,.68)" stroke-width="1.7"/>' +
          dots + '</svg>' +
          '<div style="font-size:9px;color:rgba(255,255,255,.48);text-align:center;">' + s7Num(group.nativeSales || 0) + ' ' + esc(group.currency || "") + '</div>' +
        '</div>';
      }).join("") +
      '</div></div>';
  }

  function mapHTML() {
    var themeAttr = document.documentElement.getAttribute("data-theme");
    var kbotTheme = window._kbotTheme;
    var lightMode = (themeAttr || kbotTheme) === "light";
    var mapStop1 = lightMode ? "#c7d9f5" : "#0d1f3c";
    var mapStop2 = lightMode ? "#8fb3e8" : "#020408";
    var mapStroke = lightMode ? "#5a8fd4" : "rgba(168,85,247,0.5)";
    var ttFill = lightMode ? "#ffffff" : "#0f172a";
    var ttStroke = lightMode ? "#cbd5e1" : "rgba(255,255,255,0.18)";
    var ttText = lightMode ? "#0f172a" : "white";
    var _mapUid = Date.now();
    var _bgId = "scMapBg_" + _mapUid;
    var activeCountry = activeMapCountry();
    var mapShape = window.TaagerGeo && typeof window.TaagerGeo.shape === "function"
      ? window.TaagerGeo.shape(activeCountry)
      : { outline: countryOutlinePath(activeCountry), regions: [] };
    var mapPath = mapShape.outline;
    var mapProfile = mapShape.profile || (window.TaagerGeo && typeof window.TaagerGeo.visualProfile === "function"
      ? window.TaagerGeo.visualProfile(activeCountry)
      : {});
    var mapFilter = lightMode
      ? "drop-shadow(0 10px 18px rgba(15,23,42," + (mapProfile.shadowOpacityLight || 0.18) + "))"
      : "drop-shadow(0 0 8px rgba(168,85,247," + (mapProfile.shadowOpacityDark || 0.1) + "))";
    var countryLabel = activeCountry === "mixed"
      ? s6Txt("Mixed countries", "عدة دول")
      : (window.TaagerCountry && window.TaagerCountry.label ? window.TaagerCountry.label(activeCountry) : String(activeCountry).toUpperCase());
    var countryGroups = window.dashboardGeoData && window.dashboardGeoData.meta && Array.isArray(window.dashboardGeoData.meta.countryGroups)
      ? window.dashboardGeoData.meta.countryGroups
      : [];
    if (activeCountry === "mixed" && countryGroups.length) return mixedCountryMapsHTML(countryGroups);
    var mixedCountryCards = activeCountry === "mixed" && countryGroups.length
      ? '<div class="sc-country-groups" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:0 0 10px;">' +
        countryGroups.map(function (group) {
          var code = String(group.country || "sa").toLowerCase();
          var label = window.TaagerCountry && window.TaagerCountry.label ? window.TaagerCountry.label(code) : code.toUpperCase();
          var flagCls = window.TaagerCountry && window.TaagerCountry.flagClass ? window.TaagerCountry.flagClass(code) : "";
          return '<div style="border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.035);border-radius:10px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<span style="display:flex;align-items:center;gap:7px;min-width:0;">' +
              (flagCls ? '<span class="' + esc(flagCls) + '" aria-hidden="true"></span>' : '') +
              '<span style="font-size:11px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(label) + '</span>' +
            '</span>' +
            '<span style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.58);white-space:nowrap;">' +
              esc(group.currency || "") + ' · ' + s7Num(group.orderCount || group.rows || 0) +
            '</span>' +
          '</div>';
        }).join("") +
      '</div>'
      : "";
    var mapFill = "url(#" + _bgId + ")";
    var defs =
      "<defs>" +
      '<linearGradient id="' +
      _bgId +
      '" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="' +
      mapStop1 +
      '"/>' +
      '<stop offset="100%" stop-color="' +
      mapStop2 +
      '"/>' +
      "</linearGradient>" +
      '<linearGradient id="scMapSheen_' + _mapUid + '" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="#ffffff" stop-opacity="' + (lightMode ? (mapProfile.sheenOpacityLight || 0.08) : (mapProfile.sheenOpacityDark || 0)) + '"/>' +
      '<stop offset="48%" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="100%" stop-color="#14b8a6" stop-opacity="' + (lightMode ? "0.04" : "0") + '"/>' +
      "</linearGradient>" +
      '<clipPath id="scMapClip_' + _mapUid + '"><path d="' + mapPath + '"/></clipPath>' +
      '<filter id="scMapShadow_' + _mapUid + '" x="-30%" y="-30%" width="160%" height="180%">' +
      '<feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="' + (lightMode ? "#0f172a" : "#020617") + '" flood-opacity="' + (lightMode ? (mapProfile.shadowOpacityLight || 0.18) : (mapProfile.shadowOpacityDark || 0.1)) + '"/>' +
      "</filter>" +
      PROVINCES.map(function (p) {
        return (
          '<radialGradient id="sc-prov-' +
          _mapUid +
          "-" +
          p.id +
          '" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="' +
          p.color +
          '" stop-opacity="' + (mapProfile.glowOpacity || 0.34) + '"/>' +
          '<stop offset="100%" stop-color="' +
          p.color +
          '" stop-opacity="0"/>' +
          "</radialGradient>"
        );
      }).join("") +
      "</defs>";

    var provBlobs = PROVINCES.map(function (p) {
      return (
        '<ellipse class="sc-prov-blob sc-region-shape" data-province="' + p.id + '"' +
        ' cx="' + p.mapCx + '" cy="' + p.mapCy + '"' +
        ' rx="' + p.mapRx + '" ry="' + p.mapRy + '"' +
        ' fill="url(#sc-prov-' + _mapUid + "-" + p.id + ')"' +
        ' clip-path="url(#scMapClip_' + _mapUid + ')"' +
        ' data-default-fill="url(#sc-prov-' + _mapUid + '-' + p.id + ')" data-default-opacity="1"' +
        ' style="cursor:pointer;transition:opacity 0.3s,transform 0.3s;"/>' 
      );
    }).join("");

    var cityDots = ALL_CITIES.map(function (c) {
      var orderRatio = MAX_ORDERS > 0 ? Math.max(0, Math.min(1, c.orders / MAX_ORDERS)) : 0;
      var hasActivity = Number(c.orders || 0) > 0;
      var dotColor = hasActivity ? c.color : "#64748b";
      var r = hasActivity ? (mapProfile.dotBase || 4) + Math.sqrt(orderRatio) * (mapProfile.dotRange || 8.5) : 2.4;
      r = Math.min(mapProfile.dotMax || 13, r);
      var haloScale = mapProfile.haloScale || 2.45;
      return (
        '<g class="sc-city-dot" data-province="' +
        c.provinceId +
        '" data-name="' +
        esc(c.name) +
        '" data-orders="' +
        c.orders +
        '" data-rate="' +
        c.deliveryRate +
        '" data-cx="' +
        c.x +
        '" data-cy="' +
        c.y +
        '" data-color="' +
        dotColor +
        '"' +
        ' style="cursor:pointer;transition:opacity 0.3s">' +
        '<circle cx="' +
        c.x +
        '" cy="' +
        c.y +
        '" r="' +
        r * haloScale +
        '"' +
        ' fill="' +
        dotColor +
        '" opacity="0.13" pointer-events="none"/>' +
        '<circle cx="' +
        c.x +
        '" cy="' +
        c.y +
        '" r="' +
        r +
        '"' +
        ' fill="' +
        dotColor +
        '" stroke="rgba(255,255,255,0.65)" stroke-width="1"' +
        ' class="sc-dot-inner" pointer-events="none"' +
        ' data-name="' +
        c.name +
        '" data-orders="' +
        c.orders +
        '" data-rate="' +
        c.deliveryRate +
        '"' +
        ' data-ndr="' +
        (c.returnRate || 0) +
        '" data-revenue="' +
        c.orders * 150 +
        '"' +
        ' data-cx="' +
        c.x +
        '" data-cy="' +
        c.y +
        '" data-default-color="' +
        dotColor +
        '" data-color="' +
        dotColor +
        '"/>' +
        '<circle cx="' +
        c.x +
        '" cy="' +
        c.y +
        '" r="' +
        Math.max(15, r * 1.8) +
        '" fill="transparent" class="sc-dot-hit"/>' +
        "</g>"
      );
    }).join("");

    var legendChips = PROVINCES.map(function (p) {
      return (
        '<button class="sc-legend-chip" data-province="' +
        p.id +
        '" style="' +
        "display:flex;align-items:center;gap:6px;" +
        "padding:4px 10px;border-radius:8px;border:1px solid " +
        p.color +
        "44;" +
        "background:" +
        p.color +
        "18;color:" +
        p.color +
        ";" +
        "font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;" +
        'transition:all 0.2s;">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:' +
        p.color +
        ';flex-shrink:0"></span>' +
        shortProvName(p.name) +
        "</button>"
      );
    }).join("");

    /* T-15: Heatmap mode pills */
    var isAr = window.dashboardI18n
      ? window.dashboardI18n.currentLocale === "ar"
      : false;
    var heatModes = [
      { id: "default", label: s6Txt("Default", "افتراضي"), icon: "🗺️" },
      { id: "ndr", label: s6Txt("NDR Index", "مؤشر NDR"), icon: "⚠️" },
      { id: "revenue", label: s6Txt("Revenue", "الإيرادات"), icon: "💰" },
    ];
    var heatPills = heatModes
      .map(function (m, i) {
        var isFirst = i === 0;
        return (
          '<button class="sc-heat-pill" data-mode="' +
          m.id +
          '" style="' +
          "padding:5px 11px;border-radius:9px;border:none;font-size:11px;font-weight:700;" +
          "cursor:pointer;font-family:inherit;transition:all 0.15s;" +
          "background:" +
          (isFirst ? "#7c3aed" : "transparent") +
          ";" +
          "color:" +
          (isFirst ? "#fff" : "rgba(255,255,255,0.38)") +
          ";" +
          "box-shadow:" +
          (isFirst ? "0 2px 10px rgba(124,58,237,0.4)" : "none") +
          ';">' +
          m.icon +
          " " +
          m.label +
          "</button>"
        );
      })
      .join("");

    return (
      '<div class="fade-up" style="animation-delay:80ms;' +
      "background:#0b1120;border:1px solid rgba(255,255,255,0.06);" +
      'border-radius:18px;padding:20px;display:flex;flex-direction:column;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;' +
      "margin-bottom:10px;flex-direction:" +
      (isAr ? "row" : "row-reverse") +
      ';">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-direction:' +
      (isAr ? "row" : "row-reverse") +
      ';">' +
      svgIcon("mapPin", 16, "#a855f7") +
      '<span style="font-size:15px;font-weight:800;color:#fff">' +
      s6Txt("Geographical Distribution Map", "خريطة التوزيع الجغرافي") +
      ' · ' + esc(countryLabel) +
      "</span>" +
      "</div>" +
      '<button id="sc-clear-btn" style="display:none;font-size:11px;font-weight:700;' +
      "color:#a855f7;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.3);" +
      'border-radius:8px;padding:4px 10px;cursor:pointer;font-family:inherit;">' +
      s6Txt("Show All ✕", "عرض الكل ✕") +
      "</button>" +
      "</div>" +
      mixedCountryCards +
      /* T-15: Heatmap mode selector row */
      '<div id="sc-heat-bar" style="display:flex;gap:4px;background:rgba(255,255,255,0.05);' +
      'border-radius:10px;padding:3px;margin-bottom:4px;align-self:flex-start">' +
      heatPills +
      "</div>" +
      '<div id="sc-heat-desc" style="font-size:10.5px;color:rgba(255,255,255,0.6);margin-bottom:12px;padding:0 4px;line-height:1.4;">' +
      s6Txt(
        "Displays regions grouped by color to show overall activity.",
        "يعرض المناطق مجمعة حسب اللون لإظهار النشاط العام.",
      ) +
      "</div>" +
      '<div style="position:relative;width:100%;padding-bottom:82%;flex-shrink:0;">' +
      '<svg id="sc-map-svg" width="100%" height="100%" viewBox="0 0 400 340"' +
      ' style="position:absolute;inset:0;overflow:visible">' +
      defs +
      '<path class="sc-map-land" d="' +
      mapPath +
      '" fill="' +
      mapFill +
      '"' +
      ' stroke="' +
      mapStroke +
      '" stroke-width="' + (mapProfile.strokeWidth || 1.55) + '"' +
      ' style="filter:' +
      mapFilter +
      '"/>' +
      provBlobs +
      '<path class="sc-map-sheen" d="' + mapPath + '" fill="url(#scMapSheen_' + _mapUid + ')" pointer-events="none"/>' +
      cityDots +
      "</svg>" +
      '<div id="sc-tooltip" style="pointer-events:none;position:absolute;left:0;top:0;opacity:0;visibility:hidden;' +
      'transform:translate3d(-50%,calc(-100% - 10px),0);will-change:transform,opacity;contain:layout paint;' +
      'min-width:170px;padding:11px 14px;border-radius:10px;text-align:center;white-space:nowrap;' +
      'background:' +
      ttFill +
      ";border:1px solid " +
      ttStroke +
      ";color:" +
      ttText +
      ';box-shadow:0 8px 24px rgba(0,0,0,0.34);z-index:30;">' +
      '<div id="sc-tt-name" style="font-size:14px;font-weight:800;line-height:1.45;margin-bottom:3px"></div>' +
      '<div id="sc-tt-info" style="font-size:12px;font-weight:700;line-height:1.45"></div>' +
      "</div>" +
      "</div>" +
      '<div id="sc-legend" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;justify-content:flex-end">' +
      legendChips +
      "</div>" +
      "</div>"
    );
  }

  // ── Leaderboard HTML ────────────────────────────────────────────────────────
  // T-07: Added NDR% column (5th col) with red/amber/green coloring
  // Taager dashboard/status/NDR migration:
  // earnedCommission is retained as a compatibility alias for Earned Profit After Tax.
  function leaderboardHTML() {
    // Pull extended city data from aggregator geo output if available
    var geoData =
      window.dashboardGeoData && window.dashboardGeoData.geo
        ? window.dashboardGeoData.geo
        : null;
    var geoCity = geoData && geoData.cityStats ? geoData.cityStats : {};

    var rows = ALL_CITIES.map(function (c, i) {
      var color = rateColor(c.deliveryRate);
      var drColor2 = rateColor(c.drRate || 0);
      var trendIcon = c.trendUp
        ? svgIcon("trendingUp", 10, "#00e676")
        : svgIcon("trendingDown", 10, "#ef4444");

      // T-07: Resolve NDR% — prefer aggregator cityStats, fall back to returnRate
      var cs = geoCity[c.name] || {};
      var ndrVal;
      if (typeof cs.ndrPct === "number") {
        ndrVal = cs.ndrPct;
      } else if ((cs.netOrderCount !== undefined || cs.count !== undefined) && cs.deliveredOrders !== undefined) {
        var csNetOrders = window.DashboardOrderMetrics
          ? window.DashboardOrderMetrics.netOrders(cs)
          : Number(cs.netOrderCount != null ? cs.netOrderCount : cs.count || 0);
        ndrVal =
          csNetOrders > 0
            ? Math.round(((cs.deliveredOrders || 0) / csNetOrders) * 1000) /
              10
            : 0;
      } else {
        ndrVal =
          typeof c.ndrPct === "number"
            ? c.ndrPct
            : typeof c.returnRate === "number"
              ? c.returnRate
              : null;
      }
      var ndrColor =
        ndrVal === null
          ? "rgba(255,255,255,0.25)"
          : rateColor(ndrVal);
      var ndrDisplay = ndrVal === null ? "—" : ndrVal.toFixed(1) + "%";

      // Sum of Profit After Tax for unique delivered orders in the selected period.
      var commVal = cs.earnedProfitAfterTax != null
        ? cs.earnedProfitAfterTax
        : cs.earnedCommission || 0;
      var commDisplay =
        commVal > 0
          ? commVal >= 1000
            ? (commVal / 1000).toFixed(1) + "K"
            : commVal.toFixed(0)
          : null;

      var rowCodCount =
        cs.codCount !== undefined ? cs.codCount : c.codCount || 0;
      var rowPrepaidCount =
        cs.prepaidCount !== undefined ? cs.prepaidCount : c.prepaidCount || 0;
      var rowCodDelivered =
        cs.codDeliveredCount !== undefined
          ? cs.codDeliveredCount
          : c.codDeliveredCount || 0;
      var rowPrepaidDelivered =
        cs.prepaidDeliveredCount !== undefined
          ? cs.prepaidDeliveredCount
          : c.prepaidDeliveredCount || 0;
      var rowTotalOrders = c.orders || 0;
      var rowCodNdr =
        rowCodCount > 0
          ? Math.round((rowCodDelivered / rowCodCount) * 1000) / 10
          : null;
      var rowPrepaidNdr =
        rowPrepaidCount > 0
          ? Math.round((rowPrepaidDelivered / rowPrepaidCount) * 1000) / 10
          : null;
      var rowTotalNdr = ndrVal;

      function ndrBadge(val) {
        if (val === null)
          return '<span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:6px;">—</span>';
        var nc = rateColor(val);
        return (
          '<span style="font-size:11px;font-weight:800;color:' +
          nc +
          ";background:" +
          nc +
          '1a;padding:2px 6px;border-radius:6px;">' +
          val.toFixed(1) +
          "%</span>"
        );
      }

      // Delivered orders: prefer direct field, fallback to orders × NDR%
      var deliveredVal =
        cs.deliveredOrders != null && cs.deliveredOrders !== ""
          ? Math.round(Number(cs.deliveredOrders))
          : rowTotalOrders > 0 && rowTotalNdr !== null
            ? Math.round(rowTotalOrders * (rowTotalNdr / 100))
            : null;
      if (deliveredVal === 0) rowTotalNdr = 0;
      var deliveredDisplay =
        deliveredVal !== null ? deliveredVal.toLocaleString("en-US") : "—";
      var confirmedVal =
        cs.confirmedCount != null && cs.confirmedCount !== ""
          ? Math.round(Number(cs.confirmedCount))
          : c.confirmedCount != null && c.confirmedCount !== ""
            ? Math.round(Number(c.confirmedCount))
            : Math.round(Number(c.activeOrders || c.drBaseOrders || 0));
      var confirmationRateVal =
        cs.confirmationPct != null && cs.confirmationPct !== ""
          ? Number(cs.confirmationPct)
          : rowTotalOrders > 0
            ? Math.round((confirmedVal / rowTotalOrders) * 1000) / 10
            : 0;
      var confirmationRateColor = rateColor(confirmationRateVal);

      return (
        '<div class="sc-lb-row fade-up"' +
        ' data-province="' +
        c.provinceId +
        '"' +
        ' data-city="' +
        esc(c.name) +
        '"' +
        ' data-provname="' +
        esc(c.provinceName) +
        '"' +
        ' data-cod="' +
        rowCodCount +
        '"' +
        ' data-prepaid="' +
        rowPrepaidCount +
        '"' +
        ' data-total-orders="' +
        rowTotalOrders +
        '"' +
        ' data-cod-ndr="' +
        (rowCodNdr !== null ? rowCodNdr : "") +
        '"' +
        ' data-prepaid-ndr="' +
        (rowPrepaidNdr !== null ? rowPrepaidNdr : "") +
        '"' +
        ' data-total-ndr="' +
        (rowTotalNdr !== null ? rowTotalNdr : "") +
        '"' +
        ' data-delivered="' +
        (deliveredVal !== null ? deliveredVal : "") +
        '"' +
        ' data-confirmed="' +
        confirmedVal +
        '"' +
        ' data-cr="' +
        confirmationRateVal +
        '"' +
        ' data-dr="' +
        (c.drRate || 0) +
        '"' +
        ' data-commission="' +
        commVal +
        '"' +
        ' style="animation-delay:' +
        (120 + i * 40) +
        "ms;" +
        "display:grid;grid-template-columns:minmax(0, 1.45fr) minmax(0, 0.65fr) minmax(0, 0.65fr) minmax(0, 0.65fr) minmax(0, 0.65fr) minmax(0, 0.9fr) minmax(0, 0.6fr) minmax(0, 0.6fr);" +
        "align-items:center;padding:10px 12px;gap:8px;" +
        (i < ALL_CITIES.length - 1
          ? "border-bottom:1px solid rgba(255,255,255,0.04)"
          : "") +
        '">' +
        /* City name + province dot + rank */
        '<div style="display:flex;align-items:center;gap:7px;min-width:0;">' +
        '<span style="color:#fff;font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' +
        esc(c.name) +
        '">' +
        c.name +
        "</span>" +
        '<span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' +
        c.color +
        '"></span>' +
        '<span class="sc-lb-rank" style="font-size:10px;color:rgba(255,255,255,0.2);font-weight:700;width:16px;text-align:center">' +
        (i + 1) +
        "</span>" +
        "</div>" +
        /* Orders — switchable by pill */
        '<div class="sc-lb-orders-cell" style="color:rgba(255,255,255,0.72);font-size:12px;font-weight:600;text-align:center">' +
        rowTotalOrders.toLocaleString("en-US") +
        "</div>" +
        /* Delivered orders */
        '<div class="sc-lb-delivered-cell" style="color:rgba(255,255,255,0.55);font-size:12px;font-weight:600;text-align:center">' +
        deliveredDisplay + window.supposedBadgeHtml('delivered') +
        "</div>" +
        '<div class="sc-lb-confirmed-cell" style="color:#3b82f6;font-size:12px;font-weight:700;text-align:center">' +
        confirmedVal.toLocaleString("en-US") +
        "</div>" +
        '<div class="sc-lb-cr-cell" style="text-align:center;">' +
        '<span style="font-size:11px;font-weight:800;color:' +
        confirmationRateColor +
        ";background:" +
        confirmationRateColor +
        '1a;padding:2px 6px;border-radius:6px;">' +
        confirmationRateVal.toFixed(1) +
        "%</span></div>" +
        /* DR% (Active) + bar — uses drRate (active orders only) */
        '<div class="sc-lb-dr-cell" style="display:flex;flex-direction:column;gap:3px">' +
        '<span style="font-size:12px;font-weight:700;text-align:right;color:' +
        drColor2 +
        '">' +
        (c.drRate || 0).toFixed(1) +
        "%" +
        "</span>" +
        '<div style="height:3px;border-radius:9999px;background:rgba(148,163,184,0.22);overflow:hidden">' +
        '<div class="sc-rate-bar" data-pct="' +
        (c.drRate || 0) +
        '"' +
        ' style="height:100%;width:0%;border-radius:9999px;background:' +
        drColor2 +
        ";" +
        "box-shadow:0 0 6px " +
        drColor2 +
        '88;transition:width 1s ease-out"></div>' +
        "</div>" +
        "</div>" +
        /* NDR% — switchable by pill */
        '<div class="sc-lb-ndr-cell" style="text-align:center;">' +
        ndrBadge(rowTotalNdr) +
        "</div>" +
        /* Earned Profit After Tax */
        '<div class="sc-lb-commission-cell" style="text-align:center;">' +
        (commDisplay
          ? '<span style="font-size:11px;font-weight:700;color:#a855f7">' +
            commDisplay + window.supposedBadgeHtml('commission') +
            "</span>"
          : '<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.18)">—</span>') +
        "</div>" +
        "</div>"
      );
    }).join("");

    var isAr = window.dashboardI18n
      ? window.dashboardI18n.currentLocale === "ar"
      : false;
    var alignStr = isAr ? "right" : "left";
    return (
      '<div class="fade-up" style="animation-delay:100ms;' +
      "background:#0b1120;border:1px solid rgba(255,255,255,0.06);" +
      'border-radius:18px;padding:20px;display:flex;flex-direction:column;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-direction:' +
      (isAr ? "row" : "row-reverse") +
      ';">' +
      svgIcon("barChart", 16, "#a855f7") +
      '<span id="sc-lb-title" style="font-size:15px;font-weight:800;color:#fff" dir="' +
      (isAr ? "rtl" : "ltr") +
      '">' +
      s6Txt("City Leaderboard", "ترتيب المدن") +
      ' <span style="color:rgba(255,255,255,0.3);font-weight:600;font-size:13px">(' +
      ALL_CITIES.length +
      ")</span>" +
      "</span>" +
      "</div>" +
      (window.renderCityAiAdvisor
        ? window.renderCityAiAdvisor(BEST_CITY)
        : "") +
      /* Header row — 6 columns now */
      '<div style="display:grid;grid-template-columns:minmax(0, 1.45fr) minmax(0, 0.65fr) minmax(0, 0.65fr) minmax(0, 0.65fr) minmax(0, 0.65fr) minmax(0, 0.9fr) minmax(0, 0.6fr) minmax(0, 0.6fr);' +
      "padding:8px 12px;font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);" +
      "border-bottom:1px solid rgba(255,255,255,0.05);gap:8px;text-align:" +
      alignStr +
      '">' +
      "<div>" +
      s6Txt("City", "المدينة") +
      "</div>" +
      '<div class="sc-lb-orders-hdr cool-tooltip" data-tooltip="' +
      s6Txt("Net order count", "إجمالي الطلبات الصافية") +
      '">' +
      s6Txt("Net Orders", "الطلبات الصافية") +
      "</div>" +
      '<div class="cool-tooltip" data-tooltip="' +
      s6Txt(
        "Number of successfully delivered orders",
        "عدد الطلبات الموصلة بنجاح",
      ) +
      '">' +
      s6Txt("Delivered", "موصّل") +
      "</div>" +
      '<div class="cool-tooltip" data-tooltip="' +
      s6Txt("Confirmed orders in this city", "الطلبات المؤكدة في هذه المدينة") +
      '">' +
      s6Txt("Confirmed", "مؤكد") +
      "</div>" +
      '<div style="text-align:center" class="cool-tooltip" data-tooltip="' +
      s6Txt("Confirmation rate: confirmed orders divided by net orders", "نسبة التأكيد: الطلبات المؤكدة مقسومة على صافي الطلبات") +
      '">CR</div>' +
      '<div class="cool-tooltip" data-tooltip="' +
      s6Txt(
        "Delivery rate from active orders only",
        "نسبة التسليم من الطلبات النشطة فقط",
      ) +
      '">' +
      s6Txt("DR% (Active)", "DR% (نشط)") +
      "</div>" +
      '<div style="text-align:center" class="sc-lb-ndr-hdr cool-tooltip" data-tooltip="' +
      s6Txt(
        "Delivery rate from total orders (NDR)",
        "نسبة التسليم من إجمالي الطلبات (NDR)",
      ) +
      '">NDR%</div>' +
      '<div style="text-align:center" class="cool-tooltip" data-tooltip="' +
      // The commission DOM key remains for compatibility with existing sort code.
      s6Txt("Sum of Profit After Tax for delivered orders", "مجموع الربح بعد الضريبة للطلبات المسلمة") +
      '">' +
      s6Txt("Earned Profit After Tax", "الربح المحقق بعد الضريبة") +
      "</div>" +
      "</div>" +
      '<div id="sc-lb-body" class="dash-scroll" style="overflow-y:auto;flex:1;min-height:0;">' +
      rows +
      "</div>" +
      '<div id="sc-lb-pagination" style="margin-top:10px;"></div>' +
      '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);' +
      'display:flex;gap:12px;justify-content:flex-end">' +
      ["#22d3ee,NDR &gt;=40%", "#00e676,NDR 30-40%", "#f59e0b,NDR 20-30%", "#ef4444,NDR &lt;20%"]
        .map(function (s) {
          var parts = s.split(",");
          return (
            '<div style="display:flex;align-items:center;gap:5px;">' +
            '<span style="width:7px;height:7px;border-radius:50%;background:' +
            parts[0] +
            '"></span>' +
            '<span style="font-size:10px;color:rgba(255,255,255,0.3)">' +
            parts[1] +
            "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      "</div>"
    );
  }

  // ── Province cards HTML ─────────────────────────────────────────────────────
  function provinceCardsHTML() {
    var cards = PROVINCES.map(function (p, i) {
      var trendIcon = p.trendUp
        ? svgIcon("trendingUp", 12, "#00e676")
        : svgIcon("trendingDown", 12, "#ef4444");
      return (
        '<button class="sc-prov-card" data-province="' +
        p.id +
        '"' +
        ' style="animation-delay:' +
        i * 70 +
        "ms;" +
        "background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);" +
        "border-radius:18px;padding:20px;flex:1;text-align:right;" +
        "display:flex;flex-direction:column;align-items:stretch;width:100%;gap:14px;cursor:pointer;" +
        'font-family:inherit;transition:all 0.2s;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;width:100%">' +
        '<span style="font-size:14px;font-weight:900;color:' +
        p.color +
        '">' +
        shortProvName(p.name) +
        "</span>" +
        '<span class="cool-tooltip" data-tooltip="' +
        s6Txt(
          "Order growth rate compared to last month",
          "معدل نمو الطلبات مقارنة بالشهر الماضي",
        ) +
        '" style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:800;' +
        "color:" +
        (p.trendUp ? "#00e676" : "#ef4444") +
        ";background:" +
        (p.trendUp ? "rgba(0,230,118,0.1)" : "rgba(239,68,68,0.1)") +
        ';padding:3px 8px;border-radius:8px;">' +
        trendIcon +
        " " +
        p.trend +
        "%" +
        "</span>" +
        "</div>" +
        '<div style="width:100%">' +
        '<div style="font-size:28px;font-weight:900;color:#fff;line-height:1">' +
        p.orders.toLocaleString("en-US") +
        "</div>" +
        '<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.4);margin-top:6px">' +
        s6Txt("Net Orders · ", "صافي الطلبات · ") +
        p.cities.length +
        s6Txt(" cities", " مدن") +
        "</div>" +
        "</div>" +
        '<div style="width:100%">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px" class="cool-tooltip" data-tooltip="' +
        s6Txt(
          "Delivery rate from total orders (NDR)",
          "نسبة التسليم من إجمالي الطلبات (NDR)",
        ) +
        '">' +
        '<span style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.45)">' +
        s6Txt("NDR (Total)", "NDR (إجمالي)") +
        "</span>" +
        '<span style="font-size:14px;font-weight:800;color:' +
        p.color +
        '">' +
        formatPercent(p.deliveryRate) +
        "%</span>" +
        "</div>" +
        '<div style="height:4px;border-radius:9999px;background:rgba(148,163,184,0.22);overflow:hidden;margin-bottom:12px">' +
        '<div class="sc-prov-bar" data-pct="' +
        p.deliveryRate +
        '" style="height:100%;width:0%;border-radius:9999px;background:' +
        p.color +
        ";box-shadow:0 0 10px " +
        p.color +
        '88;transition:width 0.4s ease-out"></div>' +
        "</div>" +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px" class="cool-tooltip" data-tooltip="' +
        s6Txt(
          "Delivery rate from active orders only",
          "نسبة التسليم من الطلبات النشطة فقط",
        ) +
        '">' +
        '<span style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.45)">' +
        s6Txt("DR (Active)", "DR (النشطة)") +
        "</span>" +
        '<span style="font-size:14px;font-weight:800;color:' +
        p.color +
        '">' +
        formatPercent(p.drRate) +
        "%</span>" +
        "</div>" +
        '<div style="height:4px;border-radius:9999px;background:rgba(148,163,184,0.22);overflow:hidden">' +
        '<div class="sc-prov-bar" data-pct="' +
        p.drRate +
        '" style="height:100%;width:0%;border-radius:9999px;background:' +
        p.color +
        ";box-shadow:0 0 10px " +
        p.color +
        '88;transition:width 0.4s ease-out"></div>' +
        "</div>" +
        "</div>" +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);width:100%;' +
        'padding-top:14px;border-top:1px solid rgba(255,255,255,0.08)">' +
        '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;" class="cool-tooltip" data-tooltip="' +
        s6Txt(
          "Percentage of cash on delivery (COD) orders",
          "نسبة الطلبات بالدفع عند الاستلام (COD)",
        ) +
        '">' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.35);font-weight:600;margin-bottom:4px;text-align:center;width:100%;">COD</div>' +
        '<div style="font-size:14px;font-weight:800;color:#06b6d4;text-align:center;width:100%;">' +
        formatPercent(p.codRate) +
        "%</div>" +
        "</div>" +
        '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;" class="cool-tooltip" data-tooltip="' +
        s6Txt("Percentage of returned orders", "نسبة الطلبات المرتجعة") +
        '">' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.35);font-weight:600;margin-bottom:4px;text-align:center;width:100%">' +
        s6Txt("Returns", "مرتجعات") +
        "</div>" +
        '<div style="font-size:14px;font-weight:800;color:#ef4444;text-align:center;width:100%;">' +
        formatPercent(p.returnRate) +
        "%</div>" +
        "</div>" +
        '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;" class="cool-tooltip" data-tooltip="' +
        s6Txt(
          "Average delivery days (order creation to final delivery update)",
          "متوسط أيام التوصيل (من إنشاء الطلب حتى آخر تحديث للتسليم)",
        ) +
        '">' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.35);font-weight:600;display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:4px;text-align:center;width:100%;">' +
        svgIcon("clock", 12, "rgba(255,255,255,0.35)") +
        " " +
        s6Txt("days", "أيام") +
        "</div>" +
        '<div style="font-size:14px;font-weight:800;color:rgba(255,255,255,0.75);text-align:center;width:100%;">' +
        (p.avgDays == null ? "—" : p.avgDays) +
        "</div>" +
        "</div>" +
        "</div>" +
        "</button>"
      );
    }).join("");

    return (
      '<div style="margin-top:0">' +
      '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.28);' +
      'letter-spacing:3px;text-align:right;margin-bottom:10px">' +
      s6Txt("Administrative Regions", "المناطق الإدارية") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;">' +
      cards +
      "</div>" +
      "</div>"
    );
  }

  // ── Time-filter tabs HTML ───────────────────────────────────────────────────
  var TIME_TABS = [
    s6Txt("This Month", "هذا الشهر"),
    s6Txt("Last 7 Days", "آخر 7 أيام"),
    s6Txt("This Quarter", "هذا الربع"),
  ];
  function tabsHTML(active) {
    return (
      '<div style="display:flex;gap:4px;background:rgba(255,255,255,0.05);border-radius:12px;padding:4px">' +
      TIME_TABS.map(function (t, i) {
        var isActive = i === active;
        return (
          '<button class="sc-tab" data-tab="' +
          i +
          '" style="' +
          "padding:7px 14px;border-radius:9px;border:none;font-size:11px;font-weight:700;" +
          "cursor:pointer;font-family:inherit;transition:all 0.15s;" +
          "background:" +
          (isActive ? "#7c3aed" : "transparent") +
          ";" +
          "color:" +
          (isActive ? "#fff" : "rgba(255,255,255,0.38)") +
          ";" +
          "box-shadow:" +
          (isActive ? "0 2px 10px rgba(124,58,237,0.4)" : "none") +
          ';">' +
          t +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  // ── Assemble full section ───────────────────────────────────────────────────
  var isAr = window.dashboardI18n
    ? window.dashboardI18n.currentLocale === "ar"
    : false;
  var dirStr = isAr ? "rtl" : "ltr";
  var alignStr = isAr ? "right" : "left";

  mountEl.innerHTML =
    '<div class="dash-scroll" dir="' +
    dirStr +
    '" style="flex:1;overflow-y:auto;background:#080b12;' +
    "display:flex;flex-direction:column;color:#fff;font-family:'Cairo',sans-serif;\">" +
    /* Header */
    '<div style="padding:28px 32px 20px;display:flex;align-items:flex-start;">' +
    "<div>" +
    '<h1 class="fade-up" style="font-size:30px;font-weight:900;color:#fff;margin:0;text-align:' +
    alignStr +
    ';display:inline-flex;align-items:center;gap:12px;">' +
    s6Txt("Cities & Regions", "المدن والمناطق") +
    '<span id="cities-updating-badge" style="font-size:12px;font-weight:normal;color:#a855f7;background:rgba(168,85,247,0.1);padding:4px 8px;border-radius:6px;transition:opacity 0.3s;opacity:0;">' +
    s6Txt("⏳ Updating...", "⏳ جاري التحديث...") +
    '</span>' +
    "</h1>" +
    '<p class="fade-up" style="font-size:11px;color:rgba(255,255,255,0.32);margin:6px 0 0;text-align:' +
    alignStr +
    ';animation-delay:80ms">' +
    s6Txt(
      ALL_CITIES.length + " cities in " + PROVINCES.length + " administrative regions",
      ALL_CITIES.length + " مدينة في " + PROVINCES.length + " مناطق إدارية",
    ) +
    "</p>" +
    "</div>" +
    "</div>" +
    /* Phase 5: Global Filter Bar */
    filterBarHTML() +
    /* KPI row */
    '<div style="padding:0 32px 20px;display:flex;gap:14px;">' +
    kpiRowHTML() +
    "</div>" +
    /* Map + Leaderboard */
    '<div style="padding:0 32px 20px;display:grid;grid-template-columns:1.15fr 1fr;gap:16px;">' +
    mapHTML() +
    leaderboardHTML() +
    "</div>" +
    /* Province cards */
    '<div style="padding:0 32px 32px">' +
    provinceCardsHTML() +
    "</div>" +
    /* T-23: Product × City Matrix mount point */
    '<div id="sc-product-matrix-mount" style="padding:0 32px 24px"></div>' +
    /* T-20: Insight Strip mount point */
    '<div id="sc-insight-strip-mount" style="padding:0 32px 32px"></div>' +
    "</div>";

  // ── Post-mount: animate bars ────────────────────────────────────────────────
  setTimeout(function () {
    mountEl.querySelectorAll(".sc-rate-bar").forEach(function (bar) {
      bar.style.width = bar.dataset.pct + "%";
    });
    mountEl.querySelectorAll(".sc-prov-bar").forEach(function (bar) {
      bar.style.width = bar.dataset.pct + "%";
    });
  }, 10);

  // ── Province selection logic ────────────────────────────────────────────────
  var selectedProvince = mountEl._citiesSelectedProvince !== undefined ? mountEl._citiesSelectedProvince : null;

  function updateSelection() {
    var sel = selectedProvince;

    /* province blobs on map */
    mountEl.querySelectorAll(".sc-prov-blob").forEach(function (el) {
      el.style.opacity = !sel || el.dataset.province === sel ? "1" : "0.12";
    });

    /* city dots on map */
    mountEl.querySelectorAll(".sc-city-dot").forEach(function (el) {
      el.style.opacity = !sel || el.dataset.province === sel ? "1" : "0.1";
    });

    /* leaderboard rows — let applyFilters handle visibility (it respects all filters) */
    /* We count visible rows after applyFilters runs */
    var visibleCount = 0;
    mountEl.querySelectorAll(".sc-lb-row").forEach(function (el) {
      var show = !sel || el.dataset.province === sel;
      /* Only count for title update; actual visibility is handled by applyFilters below */
      if (show) visibleCount++;
    });

    /* leaderboard title */
    var titleEl = mountEl.querySelector("#sc-lb-title");
    if (titleEl) {
      var provLabel = sel
        ? (
            PROVINCES.find(function (p) {
              return p.id === sel;
            }) || {}
          ).name || s6Txt("Region Cities", "مدن المنطقة")
        : s6Txt("City Leaderboard", "ترتيب المدن");
      titleEl.innerHTML =
        provLabel +
        ' <span style="color:rgba(255,255,255,0.3);font-weight:600;font-size:13px">(' +
        visibleCount +
        ")</span>";
    }
    if (typeof renderCityLeaderboardPage === "function") {
      renderCityLeaderboardPage({ preservePage: true });
    }

    /* province cards active state */
    mountEl.querySelectorAll(".sc-prov-card").forEach(function (el) {
      var isActive = el.dataset.province === sel;
      var prov = PROVINCES.find(function (p) {
        return p.id === el.dataset.province;
      });
      if (!prov) return;
      el.style.background = isActive
        ? prov.color + "14"
        : "rgba(255,255,255,0.025)";
      el.style.border = isActive
        ? "1px solid " + prov.color
        : "1px solid rgba(255,255,255,0.06)";
      el.style.boxShadow = isActive ? "0 0 22px " + prov.color + "22" : "none";
    });

    /* legend chips active state */
    mountEl.querySelectorAll(".sc-legend-chip").forEach(function (el) {
      var isActive = el.dataset.province === sel;
      var prov = PROVINCES.find(function (p) {
        return p.id === el.dataset.province;
      });
      if (!prov) return;
      el.style.border =
        "1px solid " + (isActive ? prov.color : prov.color + "44");
      el.style.opacity = !sel || isActive ? "1" : "0.45";
    });

    /* clear button */
    var clearBtn = mountEl.querySelector("#sc-clear-btn");
    if (clearBtn) clearBtn.style.display = sel ? "inline-block" : "none";
  }

  function toggleProvince(id) {
    selectedProvince = selectedProvince === id ? null : id;
    var fbProv = mountEl.querySelector("#sc-fb-province");
    if (fbProv) {
      fbProv.value = selectedProvince || "";
      var pb = fbProv._customBtn;
      if (pb) {
        pb.style.borderColor = selectedProvince
          ? "#7c3aed"
          : "rgba(255,255,255,0.1)";
        pb.style.boxShadow = selectedProvince
          ? "0 0 0 2px rgba(124,58,237,0.2)"
          : "none";
      }
      var ev = new Event("change");
      fbProv.dispatchEvent(ev);
    }
    updateSelection();
  }

  /* wire province cards */
  mountEl.querySelectorAll(".sc-prov-card").forEach(function (el) {
    el.addEventListener("click", function () {
      toggleProvince(el.dataset.province);
    });
  });

  /* wire legend chips */
  mountEl.querySelectorAll(".sc-legend-chip").forEach(function (el) {
    el.addEventListener("click", function () {
      toggleProvince(el.dataset.province);
    });
  });

  /* wire map province blobs */
  mountEl.querySelectorAll(".sc-prov-blob").forEach(function (el) {
    el.addEventListener("click", function () {
      toggleProvince(el.dataset.province);
    });
  });

  /* wire city dots + tooltip */
  var tooltip = mountEl.querySelector("#sc-tooltip");
  var ttName = mountEl.querySelector("#sc-tt-name");
  var ttInfo = mountEl.querySelector("#sc-tt-info");

  mountEl.querySelectorAll(".sc-city-dot").forEach(function (el) {
    el.addEventListener("mouseenter", function () {
      if (!tooltip) return;
      var cx = parseFloat(el.dataset.cx),
        cy = parseFloat(el.dataset.cy);
      tooltip.style.left = Math.min(Math.max((cx / 400) * 100, 24), 76) + "%";
      tooltip.style.top = Math.max((cy / 340) * 100, 14) + "%";
      if (ttName) {
        ttName.textContent = el.dataset.name;
      }
      if (ttInfo) {
        ttInfo.textContent =
          Number(el.dataset.orders).toLocaleString("en-US") +
          " طلب · " +
          formatPercent(el.dataset.rate) +
          "%";
        ttInfo.style.color = el.dataset.color || "#fff";
      }
      tooltip.style.visibility = "visible";
      tooltip.style.opacity = "1";
    });
    el.addEventListener("mouseleave", function () {
      if (!tooltip) return;
      tooltip.style.opacity = "0";
      tooltip.style.visibility = "hidden";
    });
    el.addEventListener("click", function () {
      var cityName = el.dataset.name;
      /* T-22: open City Intelligence Drawer */
      if (cityName && typeof window.CityIntelligenceDrawer === "object") {
        var geoPayload = window.dashboardGeoData || null;
        window.CityIntelligenceDrawer.open(cityName, geoPayload);
      } else {
        /* Fallback: toggle province as before */
        var prov = PROVINCES.find(function (p) {
          return p.cities.some(function (c) {
            return c.name === cityName;
          });
        });
        if (prov) toggleProvince(prov.id);
      }
    });
  });

  /* clear button */
  var clearBtn = mountEl.querySelector("#sc-clear-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      selectedProvince = null;
      var fbProv = mountEl.querySelector("#sc-fb-province");
      if (fbProv) {
        fbProv.value = "";
        var pb = fbProv._customBtn;
        if (pb) {
          pb.style.borderColor = "rgba(255,255,255,0.1)";
          pb.style.boxShadow = "none";
        }
        var ev = new Event("change");
        fbProv.dispatchEvent(ev);
      }
      updateSelection();
    });
  }

  /* time tabs */
  mountEl.querySelectorAll(".sc-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      mountEl.querySelectorAll(".sc-tab").forEach(function (b) {
        var isNowActive = b === btn;
        b.style.background = isNowActive ? "#7c3aed" : "transparent";
        b.style.color = isNowActive ? "#fff" : "rgba(255,255,255,0.38)";
        b.style.boxShadow = isNowActive
          ? "0 2px 10px rgba(124,58,237,0.4)"
          : "none";
      });
    });
  });

  /* ── T-15: Heatmap mode pills ─────────────────────────────────────────────── */
  var currentHeatMode = mountEl._citiesHeatMode !== undefined ? mountEl._citiesHeatMode : "default";
  var refreshResetButtonState = function () {};

  function hexInterpolate(low, high, t) {
    /* Interpolate between two 6-char hex colors (no #) */
    function hexToRgb(h) {
      return [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ];
    }
    function rgbToHex(r, g, b) {
      return (
        "#" +
        [r, g, b]
          .map(function (v) {
            return ("0" + Math.round(v).toString(16)).slice(-2);
          })
          .join("")
      );
    }
    var lo = hexToRgb(low),
      hi = hexToRgb(high);
    return rgbToHex(
      lo[0] + (hi[0] - lo[0]) * t,
      lo[1] + (hi[1] - lo[1]) * t,
      lo[2] + (hi[2] - lo[2]) * t,
    );
  }

  function applyHeatMode(mode) {
    currentHeatMode = mode;
    refreshResetButtonState();
    var dots = mountEl.querySelectorAll(".sc-dot-inner");

    if (mode === "default") {
      /* restore province colors */
      dots.forEach(function (el) {
        var orig = el.dataset.defaultColor || "#a855f7";
        el.setAttribute("fill", orig);
        el.style.filter = "none";
      });
      return;
    }

    /* Collect values for normalization */
    var vals = [];
    dots.forEach(function (el) {
      if (Number(el.dataset.orders || 0) <= 0) return;
      vals.push(
        mode === "ndr"
          ? parseFloat(el.dataset.ndr || 0)
          : parseFloat(el.dataset.revenue || 0),
      );
    });
    var minVal = Math.min.apply(null, vals),
      maxVal = Math.max.apply(null, vals);
    var range = maxVal - minVal || 1;

    /* Phase 5: use rAF for smooth GPU transition */
    requestAnimationFrame(function () {
      var activeIndex = 0;
      dots.forEach(function (el) {
        if (Number(el.dataset.orders || 0) <= 0) {
          el.setAttribute("fill", "#64748b");
          el.style.filter = "none";
          return;
        }
        var v = vals[activeIndex];
        activeIndex++;
        var t = (v - minVal) / range;
        var color;
        if (mode === "ndr") {
          /* NDR: green (safe) → red (danger) */
          color = rateColor(v);
        } else {
          /* Revenue: purple (low) → teal (high) */
          color = hexInterpolate("#7c3aed", "#14b8a6", t);
        }
        el.setAttribute("fill", color);
        el.style.filter = "none";
      });
    });
  }

  mountEl.querySelectorAll(".sc-heat-pill").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.dataset.mode;
      mountEl._citiesHeatMode = mode; // Save state!
      mountEl.querySelectorAll(".sc-heat-pill").forEach(function (b) {
        var active = b === btn;
        b.style.background = active ? "#7c3aed" : "transparent";
        b.style.color = active ? "#fff" : "rgba(255,255,255,0.38)";
        b.style.boxShadow = active ? "0 2px 10px rgba(124,58,237,0.4)" : "none";
      });
      var descEl = document.getElementById("sc-heat-desc");
      if (descEl) {
        if (mode === "ndr") {
          descEl.innerText =
            typeof s6Txt === "function"
              ? s6Txt(
                  "Colors indicate NDR performance: Cyan (>=40%), green (>=30%), amber (>=20%), red (<20%).",
                  "تشير الألوان إلى أداء معدل عدم التسليم: من الأخضر (جيد) إلى الأحمر (حرج).",
                )
              : "Colors indicate NDR performance: Cyan (>=40%), green (>=30%), amber (>=20%), red (<20%).";
        } else if (mode === "revenue") {
          descEl.innerText =
            typeof s6Txt === "function"
              ? s6Txt(
                  "Colors highlight revenue generation: Teal (High) to Purple (Low).",
                  "تبرز الألوان توليد الإيرادات: من التركوازي (مرتفع) إلى الأرجواني (منخفض).",
                )
              : "Colors highlight revenue generation: Teal (High) to Purple (Low).";
        } else {
          descEl.innerText =
            typeof s6Txt === "function"
              ? s6Txt(
                  "Displays regions grouped by color to show overall activity.",
                  "يعرض المناطق مجمعة حسب اللون لإظهار النشاط العام.",
                )
              : "Displays regions grouped by color to show overall activity.";
        }
      }

      applyHeatMode(mode);
    });
  });

  /* Phase 5: Animate KPI numbers on mount */
  setTimeout(function () {
    if (typeof window.animateNumber === "function") {
      mountEl.querySelectorAll("[data-animate-num]").forEach(function (el) {
        var to = parseFloat(el.dataset.animateNum);
        if (!isNaN(to)) window.animateNumber(el, to, { duration: 1200 });
      });
    }
  }, 80);

  /* Phase 5: Virtual scroll — lazy-reveal city rows via IntersectionObserver */
  (function initVirtualScroll() {
    var lbBody = mountEl.querySelector("#sc-lb-body");
    if (!lbBody) return;
    var rows = lbBody.querySelectorAll(".sc-lb-row");
    if (rows.length <= 20) return; /* Small lists don't need it */

    /* Mark rows beyond the first 15 as pending reveal — use a data attribute
       so applyFilters can clear it without fighting inline styles */
    var INITIAL_VISIBLE = 15;
    rows.forEach(function (row, i) {
      if (i >= INITIAL_VISIBLE) {
        row.dataset.vsHidden = "1";
        row.style.opacity = "0";
        row.style.transform = "translateY(6px)";
      }
    });

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              var el = entry.target;
              el.dataset.vsHidden = "";
              el.style.transition = "opacity 0.25s ease, transform 0.25s ease";
              el.style.opacity = "1";
              el.style.transform = "translateY(0)";
              observer.unobserve(el);
            }
          });
        },
        { root: lbBody, rootMargin: "60px", threshold: 0 },
      );

      rows.forEach(function (row, i) {
        if (i >= INITIAL_VISIBLE) observer.observe(row);
      });
    } else {
      rows.forEach(function (row) {
        row.dataset.vsHidden = "";
        row.style.opacity = "1";
        row.style.transform = "none";
      });
    }
  })();

  var leaderboardSortState = { key: "", dir: "desc" };

  function responsiveCityLeaderboardPageSize() {
    var dashboardShell = mountEl.closest(".dashboard-shell") || mountEl.closest("#page-dashboard");
    var width = dashboardShell && dashboardShell.clientWidth
      ? dashboardShell.clientWidth
      : window.innerWidth || 1180;
    var height = window.innerHeight || 800;
    var pageSize = width < 760 ? 5 : width < 960 ? 7 : width < 1180 ? 8 : 10;

    if (height < 700) pageSize = Math.min(pageSize, 6);
    else if (height >= 900) pageSize += 2;
    if (height >= 1100) pageSize += 2;

    return Math.max(5, Math.min(14, pageSize));
  }

  function cityLeaderboardPageWindow() {
    var dashboardShell = mountEl.closest(".dashboard-shell") || mountEl.closest("#page-dashboard");
    var width = dashboardShell && dashboardShell.clientWidth
      ? dashboardShell.clientWidth
      : window.innerWidth || 1180;
    return width < 760 ? 1 : 2;
  }

  var CITY_LEADERBOARD_PAGE_SIZE = responsiveCityLeaderboardPageSize();
  var leaderboardPaginationState = mountEl._citiesLeaderboardPagination || {
    page: mountEl._citiesLeaderboardPage || 1,
    pageSize: CITY_LEADERBOARD_PAGE_SIZE,
  };
  leaderboardPaginationState.pageSize = CITY_LEADERBOARD_PAGE_SIZE;
  mountEl._citiesLeaderboardPagination = leaderboardPaginationState;

  function cityLeaderboardTitleLabel(total) {
    var sel = selectedProvince;
    var label = sel
        ? (
          PROVINCES.find(function (p) {
            return p.id === sel;
          }) || {}
        ).name || s6Txt("Region Cities", "\u0645\u062f\u0646 \u0627\u0644\u0645\u0646\u0637\u0642\u0629")
      : s6Txt("City Leaderboard", "\u062a\u0631\u062a\u064a\u0628 \u0627\u0644\u0645\u062f\u0646");
    return (
      label +
      ' <span style="color:rgba(255,255,255,0.3);font-weight:600;font-size:13px">(' +
      total +
      ")</span>"
    );
  }

  function cityLeaderboardInfoText(startItem, endItem, total) {
    var isAr = window.dashboardI18n
      ? window.dashboardI18n.currentLocale === "ar"
      : false;
    var ofText = isAr ? " \u0645\u0646 " : " of ";
    var itemLabel = isAr ? "\u0645\u062f\u0646" : "cities";
    return startItem + " - " + endItem + ofText + total + " " + itemLabel;
  }

  function renderCityLeaderboardFallbackPagination(currentPage, totalPages) {
    if (totalPages <= 1) return "";
    var html =
      '<div style="display:flex;justify-content:center;align-items:center;gap:6px;padding-top:10px;">';
    html +=
      '<button type="button" class="sc-lb-page-btn sc-lb-page-btn-prev" data-page="' +
      (currentPage - 1) +
      '"' +
      (currentPage <= 1 ? " disabled" : "") +
      ">&lt;</button>";
    for (var p = 1; p <= totalPages; p++) {
      html +=
        '<button type="button" class="sc-lb-page-btn' +
        (p === currentPage ? " active" : "") +
        '" data-page="' +
        p +
        '">' +
        p +
        "</button>";
    }
    html +=
      '<button type="button" class="sc-lb-page-btn sc-lb-page-btn-next" data-page="' +
      (currentPage + 1) +
      '"' +
      (currentPage >= totalPages ? " disabled" : "") +
      ">&gt;</button>";
    html += "</div>";
    return html;
  }

  function bindCityLeaderboardPagination(totalPages) {
    var paginationEl = mountEl.querySelector("#sc-lb-pagination");
    if (!paginationEl) return;
    var goToPage = function (page) {
      var nextPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
      leaderboardPaginationState.page = nextPage;
      mountEl._citiesLeaderboardPage = nextPage;
      renderCityLeaderboardPage({ preservePage: true });
    };

    if (window.bindDashboardPagination) {
      window.bindDashboardPagination(paginationEl, {
        pageButtonSelector: ".sc-lb-page-btn[data-page]",
        prevSelector: ".sc-lb-page-btn-prev",
        nextSelector: ".sc-lb-page-btn-next",
        onPage: goToPage,
        onPrev: function () {
          goToPage(leaderboardPaginationState.page - 1);
        },
        onNext: function () {
          goToPage(leaderboardPaginationState.page + 1);
        },
      });
      return;
    }

    paginationEl.querySelectorAll(".sc-lb-page-btn[data-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        goToPage(parseInt(btn.dataset.page, 10));
      });
    });
  }

  function renderCityLeaderboardPage(opts) {
    opts = opts || {};
    var lbBody = mountEl.querySelector("#sc-lb-body");
    if (!lbBody) return;

    var rows = Array.from(lbBody.querySelectorAll(".sc-lb-row"));
    var matchedRows = rows.filter(function (row) {
      return row.dataset.lbFilterMatch !== "0";
    });
    var total = matchedRows.length;
    var pageSize = leaderboardPaginationState.pageSize || CITY_LEADERBOARD_PAGE_SIZE;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (opts.resetPage || !opts.preservePage) {
      leaderboardPaginationState.page = 1;
    }
    leaderboardPaginationState.page = Math.min(
      totalPages,
      Math.max(1, Number(leaderboardPaginationState.page) || 1),
    );
    mountEl._citiesLeaderboardPage = leaderboardPaginationState.page;

    var currentPage = leaderboardPaginationState.page;
    var start = (currentPage - 1) * pageSize;
    var end = start + pageSize;
    var visibleRows = matchedRows.slice(start, end);

    rows.forEach(function (row) {
      row.style.display = "none";
    });

    matchedRows.forEach(function (row, idx) {
      var rank = row.querySelector(".sc-lb-rank");
      if (rank) rank.textContent = idx + 1;
    });

    visibleRows.forEach(function (row) {
      row.style.display = "grid";
      row.dataset.vsHidden = "";
      row.style.opacity = "1";
      row.style.transform = "none";
    });

    var titleEl = mountEl.querySelector("#sc-lb-title");
    if (titleEl) titleEl.innerHTML = cityLeaderboardTitleLabel(total);

    var paginationEl = mountEl.querySelector("#sc-lb-pagination");
    if (!paginationEl) return;
    if (total <= pageSize) {
      paginationEl.innerHTML = "";
      return;
    }

    var startItem = total ? start + 1 : 0;
    var endItem = Math.min(end, total);
    if (window.renderDashboardPagination) {
      paginationEl.innerHTML = window.renderDashboardPagination({
        currentPage: currentPage,
        totalPages: totalPages,
        pageButtonClass: "sc-lb-page-btn",
        prevClass: "sc-lb-page-btn-prev",
        nextClass: "sc-lb-page-btn-next",
        className: "dash-pagination-compact sc-lb-dashboard-pagination",
        pageWindow: cityLeaderboardPageWindow(),
        infoText: cityLeaderboardInfoText(startItem, endItem, total),
      });
    } else {
      paginationEl.innerHTML = renderCityLeaderboardFallbackPagination(
        currentPage,
        totalPages,
      );
    }
    bindCityLeaderboardPagination(totalPages);
  }

  (function bindResponsiveCityLeaderboardPagination() {
    var resizeHandler = function () {
      window.clearTimeout(mountEl._citiesLeaderboardResizeTimer);
      mountEl._citiesLeaderboardResizeTimer = window.setTimeout(function () {
        mountEl._citiesLeaderboardResizeTimer = null;
        var previousPageSize = leaderboardPaginationState.pageSize || CITY_LEADERBOARD_PAGE_SIZE;
        var nextPageSize = responsiveCityLeaderboardPageSize();
        if (nextPageSize === previousPageSize) return;

        var firstVisibleIndex =
          (Math.max(1, Number(leaderboardPaginationState.page) || 1) - 1) *
          previousPageSize;
        leaderboardPaginationState.pageSize = nextPageSize;
        leaderboardPaginationState.page = Math.floor(firstVisibleIndex / nextPageSize) + 1;
        renderCityLeaderboardPage({ preservePage: true });
      }, 120);
    };
    mountEl._citiesLeaderboardResizeHandler = resizeHandler;
    window.addEventListener("resize", resizeHandler);
  })();

  function parseLeaderboardNumber(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw || raw === "-" || raw === "—") return -Infinity;
    var mult = /k$/i.test(raw) ? 1000 : 1;
    var cleaned = raw.replace(/,/g, "").replace(/%/g, "").replace(/k$/i, "");
    var num = parseFloat(cleaned);
    return isNaN(num) ? -Infinity : num * mult;
  }

  function getLeaderboardSortValue(row, key) {
    if (key === "orders") {
      return parseLeaderboardNumber(
        row.querySelector(".sc-lb-orders-cell") &&
          row.querySelector(".sc-lb-orders-cell").textContent,
      );
    }
    if (key === "ndr") {
      return parseLeaderboardNumber(
        row.querySelector(".sc-lb-ndr-cell") &&
          row.querySelector(".sc-lb-ndr-cell").textContent,
      );
    }
    if (key === "delivered") return parseLeaderboardNumber(row.dataset.delivered);
    if (key === "confirmed") return parseLeaderboardNumber(row.dataset.confirmed);
    if (key === "cr") return parseLeaderboardNumber(row.dataset.cr);
    if (key === "dr") return parseLeaderboardNumber(row.dataset.dr);
    if (key === "commission") return parseLeaderboardNumber(row.dataset.commission);
    return 0;
  }

  function refreshLeaderboardSortIndicators() {
    mountEl.querySelectorAll(".sc-lb-sort-indicator").forEach(function (el) {
      el.remove();
    });
    mountEl.querySelectorAll("[data-lb-sort-key]").forEach(function (hdr) {
      var indicator = document.createElement("span");
      indicator.className = "sc-lb-sort-indicator";
      indicator.setAttribute("aria-hidden", "true");
      indicator.style.cssText =
        "font-size:9px;color:rgba(255,255,255,0.28);margin-inline-start:4px;";
      indicator.textContent =
        leaderboardSortState.key === hdr.dataset.lbSortKey
          ? leaderboardSortState.dir === "asc"
            ? "↑"
            : "↓"
          : "↕";
      hdr.appendChild(indicator);
    });
  }

  function sortLeaderboardRows(key) {
    var lbBody = mountEl.querySelector("#sc-lb-body");
    if (!lbBody) return;
    leaderboardSortState.dir =
      leaderboardSortState.key === key && leaderboardSortState.dir === "desc"
        ? "asc"
        : "desc";
    leaderboardSortState.key = key;

    Array.from(lbBody.querySelectorAll(".sc-lb-row"))
      .sort(function (a, b) {
        var av = getLeaderboardSortValue(a, key);
        var bv = getLeaderboardSortValue(b, key);
        var diff =
          leaderboardSortState.dir === "asc" ? av - bv : bv - av;
        return diff || (a.dataset.city || "").localeCompare(b.dataset.city || "");
      })
      .forEach(function (row, idx) {
        lbBody.appendChild(row);
      });

    refreshLeaderboardSortIndicators();
    renderCityLeaderboardPage({ resetPage: true });
  }

  (function initLeaderboardSorting() {
    var lbBody = mountEl.querySelector("#sc-lb-body");
    if (!lbBody || !lbBody.previousElementSibling) return;
    var headers = lbBody.previousElementSibling.children;
    [
      ["orders", 1],
      ["delivered", 2],
      ["confirmed", 3],
      ["cr", 4],
      ["dr", 5],
      ["ndr", 6],
      ["commission", 7],
    ].forEach(function (entry) {
      var key = entry[0];
      var hdr = headers[entry[1]];
      if (!hdr) return;
      hdr.dataset.lbSortKey = key;
      hdr.setAttribute("role", "button");
      hdr.setAttribute("tabindex", "0");
      hdr.style.cursor = "pointer";
      hdr.style.userSelect = "none";
      hdr.style.textAlign = "center";
      hdr.addEventListener("click", function () {
        sortLeaderboardRows(key);
      });
      hdr.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          sortLeaderboardRows(key);
        }
      });
    });
    refreshLeaderboardSortIndicators();
    renderCityLeaderboardPage({ preservePage: true });
    var pendingAiSort = window._pendingDashboardAiCitySort;
    if (pendingAiSort) {
      window._pendingDashboardAiCitySort = null;
      var metricMap = {
        ndr: "ndr",
        orders: "orders",
        earnedProfitAfterTax: "commission",
        commission: "commission",
        cpa: "commission",
        riskScore: "ndr",
        scalingScore: "ndr"
      };
      var pendingKey = metricMap[pendingAiSort.metric] || "commission";
      leaderboardSortState.key = pendingAiSort.direction === "asc" ? pendingKey : "";
      leaderboardSortState.dir = pendingAiSort.direction === "asc" ? "desc" : "asc";
      sortLeaderboardRows(pendingKey);
    }
  })();

  /* Phase 5: Smooth map province fill animation on heatmap change */
  /* (CSS transition on .sc-dot-inner is in dashboard-styles.css — ensures smooth fill changes) */
  /* Enhance applyHeatMode to use requestAnimationFrame for smoother transitions */

  var syncLeaderboardProductFilter = function () {};

  /* Phase 5: Filter Bar wiring */
  (function wireFilterBar() {
    var fbProvince = mountEl.querySelector("#sc-fb-province");
    var fbProduct = mountEl.querySelector("#sc-fb-product");
    var fbSearch = mountEl.querySelector("#sc-fb-search");
    var fbReset = mountEl.querySelector("#sc-fb-reset");
    function enhanceSelect(selectEl, activeColor, withSearch) {
      if (!selectEl) return;
      selectEl.style.display = "none";

      var container = document.createElement("div");
      container.className = "sc-custom-container";
      container.style.position = "relative";
      container.style.display = "inline-block";
      container.style.minWidth = "160px";
      container.style.flex = "1";
      container.style.maxWidth = "250px";
      container.style.zIndex = "100";
      container.dir = "rtl";

      var btn = document.createElement("div");
      btn.style.background = "#0b1120";
      btn.style.border = "1px solid rgba(255,255,255,0.1)";
      btn.style.borderRadius = "10px";
      btn.style.color = "#fff";
      btn.style.padding = "8px 12px 8px 32px";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "12px";
      btn.style.fontWeight = "700";
      btn.style.fontFamily = "Cairo, sans-serif";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "space-between";
      btn.style.position = "relative";
      btn.style.transition = "all 0.2s ease";

      var lbl = document.createElement("span");
      lbl.style.overflow = "hidden";
      lbl.style.textOverflow = "ellipsis";
      lbl.style.whiteSpace = "nowrap";
      btn.appendChild(lbl);

      var chevron = document.createElement("div");
      chevron.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' +
        activeColor +
        '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
      chevron.style.position = "absolute";
      chevron.style.left = "12px";
      chevron.style.pointerEvents = "none";
      chevron.style.transition = "transform 0.2s";
      btn.appendChild(chevron);

      var menu = document.createElement("div");
      menu.style.position = "absolute";
      menu.style.top = "100%";
      menu.style.right = "0";
      menu.style.width = "100%";
      menu.style.marginTop = "6px";
      menu.style.background = "#0f172a";
      menu.style.border = "1px solid rgba(255,255,255,0.1)";
      menu.style.borderRadius = "10px";
      menu.style.zIndex = "9999";
      menu.style.display = "none";
      menu.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)";
      menu.style.overflow = "hidden";
      menu.className = "sc-custom-menu";
      chevron.className = "sc-custom-chevron";

      var itemsContainer = document.createElement("div");
      itemsContainer.className = "dash-scroll";
      itemsContainer.style.maxHeight = "280px";
      itemsContainer.style.overflowY = "auto";

      var searchInput;
      if (withSearch) {
        var searchWrapper = document.createElement("div");
        searchWrapper.style.padding = "8px";
        searchWrapper.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
        searchWrapper.style.position = "sticky";
        searchWrapper.style.top = "0";
        searchWrapper.style.background = "#0f172a";
        searchWrapper.style.zIndex = "2";

        searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "بحث...";
        searchInput.style.width = "100%";
        searchInput.style.background = "rgba(255,255,255,0.05)";
        searchInput.style.border = "1px solid rgba(255,255,255,0.1)";
        searchInput.style.borderRadius = "6px";
        searchInput.style.color = "#fff";
        searchInput.style.padding = "6px 10px";
        searchInput.style.fontSize = "12px";
        searchInput.style.fontFamily = "Cairo, sans-serif";
        searchInput.style.outline = "none";
        searchInput.style.boxSizing = "border-box";
        searchInput.style.transition = "border-color 0.2s";

        searchInput.onfocus = function () {
          searchInput.style.borderColor = activeColor;
        };
        searchInput.onblur = function () {
          searchInput.style.borderColor = "rgba(255,255,255,0.1)";
        };
        searchInput.onclick = function (e) {
          e.stopPropagation();
        };

        searchInput.oninput = function (e) {
          var rawVal = e.target.value.trim();
          var val = rawVal
            .replace(/[\u064B-\u065F\u0670]/g, "")
            .replace(/[أإآا]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/ى/g, "ي")
            .toLowerCase();
          var children = itemsContainer.children;
          for (var i = 0; i < children.length; i++) {
            var item = children[i];
            var itemText = item.textContent
              .replace(/[\u064B-\u065F\u0670]/g, "")
              .replace(/[أإآا]/g, "ا")
              .replace(/ة/g, "ه")
              .replace(/ى/g, "ي")
              .toLowerCase();
            if (itemText.indexOf(val) !== -1) {
              item.style.display = "block";
            } else {
              item.style.display = "none";
            }
          }
        };

        searchWrapper.appendChild(searchInput);
        menu.appendChild(searchWrapper);
      }

      function syncLabel() {
        var opt = selectEl.options[selectEl.selectedIndex];
        if (opt) {
          lbl.textContent = opt.textContent;
          if (selectEl.value !== "") {
            btn.style.borderColor = activeColor;
            btn.style.boxShadow = "0 0 0 2px " + activeColor + "33";
          } else {
            btn.style.borderColor = "rgba(255,255,255,0.1)";
            btn.style.boxShadow = "none";
          }
        }
      }

      Array.from(selectEl.options).forEach(function (opt, idx) {
        var item = document.createElement("div");
        item.textContent = opt.textContent;
        item.style.padding = "10px 14px";
        item.style.cursor = "pointer";
        item.style.transition = "all 0.15s";
        item.style.color = "rgba(255,255,255,0.7)";
        item.style.fontSize = "12px";
        item.style.fontWeight = "600";
        item.style.fontFamily = "Cairo, sans-serif";
        if (idx !== selectEl.options.length - 1) {
          item.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
        }
        item.onmouseover = function () {
          item.style.background = activeColor + "1a";
          item.style.color = "#fff";
          item.style.paddingRight = "18px";
        };
        item.onmouseout = function () {
          item.style.background = "transparent";
          item.style.color = "rgba(255,255,255,0.7)";
          item.style.paddingRight = "14px";
        };
        item.onclick = function () {
          selectEl.selectedIndex = idx;
          syncLabel();
          menu.style.display = "none";
          chevron.style.transform = "rotate(0deg)";
          container.style.zIndex = "100";
          if (searchInput) searchInput.value = "";
          Array.from(itemsContainer.children).forEach(function (c) {
            c.style.display = "block";
          });
          var ev = new Event("change");
          selectEl.dispatchEvent(ev);
        };
        itemsContainer.appendChild(item);
      });

      menu.appendChild(itemsContainer);
      syncLabel();

      btn.onclick = function (e) {
        e.stopPropagation();
        var isVisible = menu.style.display === "block";
        document.querySelectorAll(".sc-custom-menu").forEach(function (m) {
          m.style.display = "none";
        });
        document.querySelectorAll(".sc-custom-chevron").forEach(function (c) {
          c.style.transform = "rotate(0deg)";
        });
        document.querySelectorAll(".sc-custom-container").forEach(function (c) {
          c.style.zIndex = "100";
        });

        if (!isVisible) {
          container.style.zIndex = "101";
          menu.style.display = "block";
          chevron.style.transform = "rotate(180deg)";
          if (searchInput)
            setTimeout(function () {
              searchInput.focus();
            }, 10);
        } else {
          chevron.style.transform = "rotate(0deg)";
          container.style.zIndex = "100";
        }
      };

      function onCustomSelectDocumentClick() {
        menu.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
        container.style.zIndex = "100";
      }
      document.addEventListener("click", onCustomSelectDocumentClick);
      mountEl._citiesDocumentClickHandlers.push(onCustomSelectDocumentClick);

      container.appendChild(btn);
      container.appendChild(menu);
      selectEl.parentNode.insertBefore(container, selectEl.nextSibling);

      var origDesc = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      );
      if (origDesc) {
        Object.defineProperty(selectEl, "value", {
          get: function () {
            return origDesc.get.call(this);
          },
          set: function (val) {
            origDesc.set.call(this, val);
            syncLabel();
          },
        });
      }

      /* Expose the visual button so external code (reset) can update its style */
      selectEl._customBtn = btn;
    }

    enhanceSelect(fbProvince, "#7c3aed", false);
    enhanceSelect(fbProduct, "#14b8a6", true);

    /* Restore state if available */
    if (window.DashboardFilterBus) {
      var state = window.DashboardFilterBus.getState();
      if (fbProvince && state.selectedProvince) {
        fbProvince.value = state.selectedProvince;
        fbProvince.style.borderColor = "#7c3aed";
      }
      if (fbProduct && state.selectedProduct) {
        fbProduct.value = state.selectedProduct;
        fbProduct.style.borderColor = "#14b8a6";
      }
      var pv = state.paymentFilter || "all";
      mountEl.querySelectorAll(".sc-pay-pill").forEach(function (b) {
        var act = b.dataset.pay === pv;
        b.style.background = act ? "#7c3aed" : "rgba(255,255,255,0.05)";
        b.style.color = act ? "#fff" : "rgba(255,255,255,0.45)";
        b.style.boxShadow = act ? "0 2px 10px rgba(124,58,237,0.35)" : "none";
      });
    }

    /* Normalize Arabic + English for search:
       - strips diacritics, normalizes alef/ta-marbuta/alef-maqsura
       - lowercases English
       - strips leading "منطقة " / "المنطقة " prefixes so "رياض" matches "منطقة الرياض"
    */
    function normalizeSearch(str) {
      return str
        .replace(/[\u064B-\u065F\u0670]/g, "") /* strip diacritics */
        .replace(/[أإآا]/g, "ا") /* normalize alef */
        .replace(/ة/g, "ه") /* ta marbuta */
        .replace(/ى/g, "ي") /* alef maqsura */
        .replace(
          /^(منطقه|المنطقه|منطقة|المنطقة)\s+/g,
          "",
        ) /* strip region prefix */
        .replace(/\(.*?\)/g, "") /* strip parenthesised sub-name */
        .trim()
        .toLowerCase();
    }

    /* Aliases: each group = set of strings that all mean the same place.
       The real data uses PROVINCE names like "منطقة الرياض", "المنطقة الشرقية",
       "المنطقة الغربية (مكة المكرمة)", "جيزان", "حائل", etc.
       After normalizeSearch strips "منطقة/المنطقة" prefix, the haystack becomes
       e.g. "الرياض", "الشرقيه", "الغربيه", "جيزان", "حائل".
       Aliases let English terms map to those normalised Arabic strings. */
    var SEARCH_ALIASES = [
      /* Riyadh */
      ["riyadh", "riyad", "الرياض", "رياض"],
      /* Makkah / Western */
      [
        "makkah",
        "mecca",
        "jeddah",
        "jidda",
        "western",
        "مكة",
        "مكه",
        "جده",
        "جدة",
        "الغربيه",
        "الغربية",
      ],
      /* Eastern */
      [
        "eastern",
        "dammam",
        "khobar",
        "ahsa",
        "الشرقيه",
        "الشرقية",
        "دمام",
        "خبر",
      ],
      /* Asir */
      ["asir", "aseer", "abha", "khamis", "عسير", "أبها", "ابها", "خميس"],
      /* Madinah */
      [
        "madinah",
        "medina",
        "yanbu",
        "المدينه",
        "المدينة",
        "مدينه",
        "مدينة",
        "ينبع",
      ],
      /* Qassim */
      ["qassim", "qasim", "buraidah", "القصيم", "بريده", "بريدة"],
      /* Tabuk */
      ["tabuk", "تبوك"],
      /* Hail */
      ["hail", "hael", "حائل", "حايل"],
      /* Jazan */
      ["jazan", "jizan", "gizan", "جازان", "جيزان"],
      /* Baha */
      ["baha", "الباحه", "الباحة", "باحه", "باحة"],
      /* Najran */
      ["najran", "نجران"],
      /* Jawf */
      ["jawf", "jouf", "الجوف"],
      /* Northern */
      ["northern", "arar", "الشماليه", "الشمالية", "عرعر"],
    ];

    function applyFilters() {
      var provVal = fbProvince ? fbProvince.value : "";
      var productVal = fbProduct ? fbProduct.value : "";
      var rawSearch = fbSearch ? fbSearch.value.trim() : "";
      var searchVal = normalizeSearch(rawSearch);
      var payVal =
        (window.DashboardFilterBus
          ? window.DashboardFilterBus.getState().paymentFilter
          : "all") || "all";

      var geoData = window.dashboardGeoData;
      var geoMap = geoData && geoData.geo && geoData.geo.geoProductMap;
      var geoKeys = productVal && geoMap ? Object.keys(geoMap) : null;

      /* ── DEBUG: product filter diagnostics ──────────────────────────────── */
      if (false && productVal) {
        console.log(
          "[Cities][applyFilters] productVal:",
          JSON.stringify(productVal),
        );
        console.log(
          "[Cities][applyFilters] geoMap exists:",
          !!geoMap,
          "| city count:",
          geoMap ? Object.keys(geoMap).length : 0,
        );
        if (geoMap) {
          var allKeys = Object.keys(geoMap);
          var matchCount = 0;
          allKeys.forEach(function (k) {
            if (
              geoMap[k][productVal] &&
              ((geoMap[k][productVal].orders || 0) > 0 ||
                (geoMap[k][productVal].delivered || 0) > 0)
            )
              matchCount++;
          });
          console.log("[Cities][applyFilters] geoMap keys:", allKeys);
          console.log(
            "[Cities][applyFilters] provinces with this product:",
            matchCount,
            "/",
            allKeys.length,
          );
        }
        var rows = mountEl.querySelectorAll(".sc-lb-row");
        console.log(
          "[Cities][applyFilters] leaderboard rows:",
          rows.length,
          "| provnames:",
          Array.from(rows).map(function (r) {
            return r.dataset.provname;
          }),
        );
      }
      /* ─────────────────────────────────────────────────────────────────── */

      /* Filter leaderboard rows */
      var shownCount = 0,
        hiddenCount = 0;
      mountEl.querySelectorAll(".sc-lb-row").forEach(function (el) {
        var city = el.dataset.city || "";
        var provName = el.dataset.provname || "";
        var provOk = !provVal || el.dataset.province === provVal;

        var searchOk = true;
        if (searchVal) {
          /* Haystack = normalized city name + province name */
          var sTxt = normalizeSearch(city) + " " + normalizeSearch(provName);

          /* Find which alias group this row belongs to, add ALL aliases to haystack */
          SEARCH_ALIASES.forEach(function (group) {
            var normGroup = group.map(normalizeSearch);
            /* Row belongs to this group if any alias appears in its haystack */
            var rowInGroup = normGroup.some(function (alias) {
              return alias.length > 1 && sTxt.indexOf(alias) !== -1;
            });
            if (rowInGroup) {
              sTxt += " " + normGroup.join(" ");
            }
          });

          searchOk = sTxt.indexOf(searchVal) !== -1;
        }

        var prodOk = true;
        if (productVal) {
          if (!geoMap) {
            prodOk = true; /* geoMap not ready — fail open */
          } else {
            /* geoMap is keyed by city name (same as data-city / cityStats key).
               Try exact match first, then substring scan for raw order strings
               that may have parenthetical suffixes (e.g. 'الرياض ( الرياض )'). */
            var cityEntry = geoMap[city];
            if (!cityEntry && city) {
              var lowerCity = city.toLowerCase();
              for (var ki = 0; ki < geoKeys.length; ki++) {
                if (geoKeys[ki].toLowerCase().indexOf(lowerCity) !== -1) {
                  cityEntry = geoMap[geoKeys[ki]];
                  break;
                }
              }
            }
            if (!cityEntry) {
              prodOk = false;
            } else {
              var cell = cityEntry[productVal];
              prodOk = !!(cell && ((cell.orders || 0) > 0 || (cell.delivered || 0) > 0));
            }
          }
        }

        var payOk = true; /* Pills switch displayed values, not row visibility */

        var show = provOk && searchOk && prodOk && payOk;
        el.dataset.lbFilterMatch = show ? "1" : "0";
        if (show) {
          el.dataset.vsHidden = "";
          el.style.opacity = "1";
          el.style.transform = "none";
          shownCount++;
        } else {
          hiddenCount++;
        }
      });

      if (false && productVal) {
        console.log(
          "[Cities][applyFilters] result — shown:",
          shownCount,
          "hidden:",
          hiddenCount,
        );
        if (shownCount === 0 && hiddenCount === 0) {
          console.warn(
            "[Cities][applyFilters] NO .sc-lb-row elements found in mountEl — leaderboard may not be rendered yet or selector is wrong",
          );
          /* Try broader search */
          var allRows = document.querySelectorAll(".sc-lb-row");
          console.log(
            "[Cities][applyFilters] .sc-lb-row in entire document:",
            allRows.length,
          );
        }
      }

      /* Sync province selection on map via existing mechanism */
      if (provVal && provVal !== selectedProvince) {
        selectedProvince = provVal;
        updateSelection();
      } else if (!provVal && selectedProvince) {
        selectedProvince = null;
        updateSelection();
      }

      /* Push product to filter bus for cross-section sync */
      if (window.DashboardFilterBus) {
        var patch = { paymentFilter: payVal };
        if (productVal !== undefined)
          patch.selectedProduct = productVal || null;
        if (provVal !== undefined) patch.selectedProvince = provVal || null;
        window.DashboardFilterBus.setState(patch);
      }
      renderCityLeaderboardPage({ resetPage: true });
      refreshResetButtonState();
    }

    /* applyProductView: rewrite leaderboard values for selected product */
    function applyProductView(productKey) {
      var geoData = window.dashboardGeoData;
      var geoMap = geoData && geoData.geo && geoData.geo.geoProductMap;
      var geoKeys = productKey && geoMap ? Object.keys(geoMap) : null;

      mountEl.querySelectorAll(".sc-lb-row").forEach(function (row) {
        var cityName = row.dataset.city || "";
        var ordersCell = row.querySelector(".sc-lb-orders-cell");
        var confirmedCell = row.querySelector(".sc-lb-confirmed-cell");
        var crCell = row.querySelector(".sc-lb-cr-cell");
        var ndrCell = row.querySelector(".sc-lb-ndr-cell");

        if (!productKey || !geoMap) {
          /* Restore city totals */
          var tot = parseInt(row.dataset.totalOrders || "0", 10);
          if (ordersCell) ordersCell.textContent = tot.toLocaleString("en-US");
          if (confirmedCell) {
            var confirmedTotal = parseInt(row.dataset.confirmed || "0", 10);
            confirmedCell.textContent = confirmedTotal.toLocaleString("en-US");
          }
          if (crCell) {
            var crTotal = parseFloat(row.dataset.cr || "0") || 0;
            var crc0 = rateColor(crTotal);
            crCell.innerHTML =
              '<span style="font-size:11px;font-weight:800;color:' +
              crc0 +
              ";background:" +
              crc0 +
              '1a;padding:2px 6px;border-radius:6px;">' +
              crTotal.toFixed(1) +
              "%</span>";
          }
          if (ndrCell) {
            var ndrRaw = row.dataset.totalNdr;
            var ndrNum =
              ndrRaw !== "" && ndrRaw !== undefined ? parseFloat(ndrRaw) : null;
            var nc0 =
              ndrNum !== null
                ? rateColor(ndrNum)
                : null;
            ndrCell.innerHTML = nc0
              ? '<span style="font-size:11px;font-weight:800;color:' +
                nc0 +
                ";background:" +
                nc0 +
                '1a;padding:2px 6px;border-radius:6px;">' +
                ndrNum.toFixed(1) +
                "%</span>"
              : '<span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:6px;">&mdash;</span>';
          }
          /* Restore delivered cell to city total */
          var deliveredCellR = row.querySelector('.sc-lb-delivered-cell');
          if (deliveredCellR) {
            var delivRaw0 = row.dataset.delivered;
            deliveredCellR.textContent = (delivRaw0 !== '' && delivRaw0 !== undefined)
              ? parseInt(delivRaw0, 10).toLocaleString('en-US') : '—';
          }
          row.style.display = "grid";
          row.style.opacity = "1";
          return;
        }

        /* Resolve city entry in geoMap: exact match, then substring */
        var cityEntry = geoMap[cityName];
        if (!cityEntry && cityName) {
          var lc = cityName.toLowerCase();
          for (var ki = 0; geoKeys && ki < geoKeys.length; ki++) {
            if (geoKeys[ki].toLowerCase().indexOf(lc) !== -1) {
              cityEntry = geoMap[geoKeys[ki]];
              break;
            }
          }
        }

        var cell = cityEntry && cityEntry[productKey];
        var prodOrders = cell ? cell.orders || 0 : 0;

        if (!cell || (prodOrders === 0 && (cell.delivered || 0) === 0)) {
          /* Product not sold in this city - hide the row */
          row.style.display = "none";
          return;
        }

        row.style.display = "grid";
        row.style.opacity = "1";
        if (ordersCell)
          ordersCell.textContent = prodOrders.toLocaleString("en-US");
        if (confirmedCell && cell) {
          var prodConfirmed = cell.confirmed || 0;
          confirmedCell.textContent = prodConfirmed.toLocaleString("en-US");
        }
        if (crCell && cell) {
          var cr =
            cell.confirmationRate !== undefined
              ? Math.round(cell.confirmationRate * 1000) / 10
              : prodOrders > 0
                ? Math.round(((cell.confirmed || 0) / prodOrders) * 1000) / 10
                : null;
          var crc =
            cr !== null
              ? rateColor(cr)
              : null;
          crCell.innerHTML = crc
            ? '<span style="font-size:11px;font-weight:800;color:' +
              crc +
              ";background:" +
              crc +
              '1a;padding:2px 6px;border-radius:6px;">' +
              cr.toFixed(1) +
              "%</span>"
            : '<span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:6px;">&mdash;</span>';
        }

        if (ndrCell && cell) {
          var ndr =
            cell.ndr !== undefined ? Math.round(cell.ndr * 1000) / 10 : null;
          var nc =
            ndr !== null
              ? rateColor(ndr)
              : null;
          ndrCell.innerHTML = nc
            ? '<span style="font-size:11px;font-weight:800;color:' +
              nc +
              ";background:" +
              nc +
              '1a;padding:2px 6px;border-radius:6px;">' +
              ndr.toFixed(1) +
              "%</span>"
            : '<span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:6px;">&mdash;</span>';
        }

        /* Delivered cell — update to product-specific delivered count */
        var deliveredCell = row.querySelector('.sc-lb-delivered-cell');
        if (deliveredCell && cell) {
          var prodDelivered = cell.delivered != null ? Math.round(cell.delivered) : null;
          if (prodDelivered == null && cell.ndr != null && prodOrders > 0) {
            prodDelivered = Math.round(prodOrders * cell.ndr);
          }
          deliveredCell.textContent = prodDelivered != null ? prodDelivered.toLocaleString('en-US') : '—';
        }
      });
    }

    syncLeaderboardProductFilter = function (state) {
      var productKey =
        state && state.selectedProduct ? state.selectedProduct : "";
      if (false) console.log(
        "[Cities][syncLeaderboardProductFilter] called — productKey:",
        JSON.stringify(productKey),
        "| fbProduct exists:",
        !!fbProduct,
      );
      var changed = fbProduct && fbProduct.value !== productKey;
      if (changed) {
        fbProduct.value = productKey;
        if (false) console.log(
          "[Cities][syncLeaderboardProductFilter] fbProduct.value set to:",
          JSON.stringify(fbProduct.value),
        );
        /* Verify the setter actually updated — the option must exist in the <select> */
        if (false && fbProduct.value !== productKey) {
          console.warn(
            "[Cities][syncLeaderboardProductFilter] VALUE MISMATCH after set! fbProduct.value=",
            JSON.stringify(fbProduct.value),
            "— productKey not found as an <option> value. Available options:",
            Array.from(fbProduct.options).map(function (o) {
              return o.value;
            }),
          );
        }
      }
      applyProductView(productKey);
      applyFilters();

      /* Update custom button highlight */
      var prb = fbProduct && fbProduct._customBtn;
      if (prb) {
        if (productKey) {
          prb.style.borderColor = "#14b8a6";
          prb.style.boxShadow = "0 0 0 2px rgba(20,184,166,0.2)";
          if (changed) {
            prb.style.transition = "none";
            prb.style.boxShadow = "0 0 0 5px rgba(20,184,166,0.55)";
            setTimeout(function () {
              prb.style.transition =
                "box-shadow 0.45s ease, border-color 0.3s ease";
              prb.style.boxShadow = "0 0 0 2px rgba(20,184,166,0.2)";
            }, 130);
            var filterBar = mountEl.querySelector("#sc-filter-bar");
            if (filterBar)
              filterBar.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
          }
        } else {
          prb.style.borderColor = "rgba(255,255,255,0.1)";
          prb.style.boxShadow = "none";
        }
      }
    };

    if (fbProvince) {
      fbProvince.addEventListener("change", function () {
        mountEl._citiesSelectedProvince = fbProvince.value; // Save state!
        applyFilters();
        /* Visual focus on the custom button, not the hidden select */
        var pb = fbProvince._customBtn;
        if (pb) {
          pb.style.borderColor = fbProvince.value
            ? "#7c3aed"
            : "rgba(255,255,255,0.1)";
          pb.style.boxShadow = fbProvince.value
            ? "0 0 0 2px rgba(124,58,237,0.2)"
            : "none";
        }
      });
    }

    if (fbProduct) {
      fbProduct.addEventListener("change", function () {
        mountEl._citiesSelectedProduct = fbProduct.value; // Save state!
        applyFilters();
        var prb = fbProduct._customBtn;
        if (prb) {
          prb.style.borderColor = fbProduct.value
            ? "#14b8a6"
            : "rgba(255,255,255,0.1)";
          prb.style.boxShadow = fbProduct.value
            ? "0 0 0 2px rgba(20,184,166,0.2)"
            : "none";
        }
      });
    }

    if (fbSearch) {
      fbSearch.addEventListener("input", function () {
        mountEl._citiesSearchValue = fbSearch.value; // Save state!
        if (citiesSearchTimer) window.clearTimeout(citiesSearchTimer);
        citiesSearchTimer = window.setTimeout(function () {
          citiesSearchTimer = null;
          if (mountEl.isConnected) applyFilters();
        }, 120);
      });
      fbSearch.addEventListener("focus", function () {
        fbSearch.style.borderColor = "#7c3aed";
      });
      fbSearch.addEventListener("blur", function () {
        fbSearch.style.borderColor = "rgba(255,255,255,0.1)";
      });
    }

    /* Payment pills — switch displayed Orders and NDR columns per payment type */
    function applyPaymentView(payVal) {
      /* Update pill visuals */
      mountEl.querySelectorAll(".sc-pay-pill").forEach(function (b) {
        var act = b.dataset.pay === payVal;
        b.style.background = act ? "#7c3aed" : "rgba(255,255,255,0.05)";
        b.style.color = act ? "#fff" : "rgba(255,255,255,0.45)";
        b.style.boxShadow = act ? "0 2px 10px rgba(124,58,237,0.35)" : "none";
      });

      /* Update leaderboard header label */
      var ordersHdr = mountEl.querySelector(".sc-lb-orders-hdr");
      if (ordersHdr) {
        ordersHdr.textContent =
          payVal === "cod"
            ? s6Txt("COD Net Orders", "طلبات COD الصافية")
            : payVal === "prepaid"
              ? s6Txt("Prepaid Net Orders", "الطلبات الصافية مسبقة الدفع")
              : s6Txt("Net Orders", "الطلبات الصافية");
      }
      var ndrHdr = mountEl.querySelector(".sc-lb-ndr-hdr");
      if (ndrHdr) {
        ndrHdr.textContent =
          payVal === "cod"
            ? s6Txt("NDR (COD)", "NDR (COD)")
            : payVal === "prepaid"
              ? s6Txt("NDR (Prepaid)", "NDR (مسبق)")
              : "NDR%";
      }

      refreshLeaderboardSortIndicators();

      /* Update each row's orders and NDR cells */
      mountEl.querySelectorAll(".sc-lb-row").forEach(function (row) {
        var ordersCell = row.querySelector(".sc-lb-orders-cell");
        var ndrCell = row.querySelector(".sc-lb-ndr-cell");

        if (ordersCell) {
          var count;
          if (payVal === "cod") count = parseInt(row.dataset.cod || "0", 10);
          else if (payVal === "prepaid")
            count = parseInt(row.dataset.prepaid || "0", 10);
          else
            count =
              parseInt(row.dataset.totalOrders || row.dataset.cod || "0", 10) +
              parseInt(row.dataset.prepaid || "0", 10);
          /* Fallback: use total from data-total-orders if available */
          if (payVal === "all") {
            var tot = parseInt(row.dataset.totalOrders || "0", 10);
            count = tot > 0 ? tot : count;
          }
          ordersCell.textContent = count.toLocaleString("en-US");
        }

        if (ndrCell) {
          var ndrRaw;
          if (payVal === "cod") ndrRaw = row.dataset.codNdr;
          else if (payVal === "prepaid") ndrRaw = row.dataset.prepaidNdr;
          else ndrRaw = row.dataset.totalNdr;

          var ndrNum =
            ndrRaw !== undefined && ndrRaw !== "" ? parseFloat(ndrRaw) : null;
          if (ndrNum === null) {
            ndrCell.innerHTML =
              '<span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:6px;">—</span>';
          } else {
            var nc =
              rateColor(ndrNum);
            ndrCell.innerHTML =
              '<span style="font-size:11px;font-weight:800;color:' +
              nc +
              ";background:" +
              nc +
              '1a;padding:2px 6px;border-radius:6px;">' +
              ndrNum.toFixed(1) +
              "%</span>";
          }
        }
      });

      /* Sync FilterBus */
      if (window.DashboardFilterBus) {
        window.DashboardFilterBus.setState({ paymentFilter: payVal });
      }

      /* Re-run row visibility filter */
      applyFilters();
    }

    mountEl.querySelectorAll(".sc-pay-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mountEl._citiesPaymentFilter = btn.dataset.pay; // Save state!
        applyPaymentView(btn.dataset.pay);
      });
    });

    /* Reset button */
    if (fbReset) {
    refreshResetButtonState = function () {
      var busState = window.DashboardFilterBus && window.DashboardFilterBus.getState
        ? window.DashboardFilterBus.getState()
        : {};
      var active = !!(
        (fbProvince && fbProvince.value) ||
        (fbProduct && fbProduct.value) ||
        (fbSearch && fbSearch.value.trim()) ||
        (busState.paymentFilter && busState.paymentFilter !== "all") ||
        currentHeatMode !== "default"
      );
      fbReset.dataset.active = active ? "true" : "false";
      fbReset.title = active
        ? s6Txt("Reset active city analysis filters", "إعادة ضبط فلاتر تحليل المدن النشطة")
        : s6Txt("No active city analysis filters", "لا توجد فلاتر نشطة لتحليل المدن");
    };
    refreshResetButtonState();

    var fbExcludeBtn = mountEl.querySelector("#sc-fb-exclude-export");
    if (fbExcludeBtn) {
      fbExcludeBtn.addEventListener("mouseover", function () {
        fbExcludeBtn.style.borderColor = "#a855f7";
        fbExcludeBtn.style.background = "rgba(168,85,247,0.2)";
      });
      fbExcludeBtn.addEventListener("mouseout", function () {
        fbExcludeBtn.style.borderColor = "rgba(168,85,247,0.3)";
        fbExcludeBtn.style.background = "rgba(168,85,247,0.1)";
      });
      fbExcludeBtn.addEventListener("click", function () {
        var geoData = window.dashboardGeoData && window.dashboardGeoData.geo ? window.dashboardGeoData.geo : null;
        var geoCity = geoData && geoData.cityStats ? geoData.cityStats : {};
        var lowNdrCities = [];
        ALL_CITIES.forEach(function(c) {
          var cs = geoCity[c.name] || {};
          var ndrVal;
          if (typeof cs.ndrPct === "number") {
            ndrVal = cs.ndrPct;
          } else if ((cs.netOrderCount !== undefined || cs.count !== undefined) && cs.deliveredOrders !== undefined) {
            var cityNetOrders = window.DashboardOrderMetrics
              ? window.DashboardOrderMetrics.netOrders(cs)
              : Number(cs.netOrderCount != null ? cs.netOrderCount : cs.count || 0);
            ndrVal = cityNetOrders > 0 ? ((cs.deliveredOrders || 0) / cityNetOrders) * 100 : 0;
          } else {
            ndrVal = typeof c.ndrPct === "number" ? c.ndrPct : typeof c.returnRate === "number" ? c.returnRate : c.deliveryRate;
          }
          if (ndrVal !== null && ndrVal < 40) {
            lowNdrCities.push({ name: c.name, ndr: ndrVal });
          }
        });
        lowNdrCities.sort(function(a, b) { return a.ndr - b.ndr; });
        openExclusionModal(lowNdrCities, s6Txt('Cities with Net Delivery Rate (NDR) below 40%', 'المدن التي يقل فيها معدل التسليم الصافي (NDR) عن 40%'));
      });
    }

    fbReset.addEventListener("click", function () {
        mountEl._citiesSelectedProvince = null;
        mountEl._citiesSelectedProduct = null;
        mountEl._citiesSearchValue = "";
        mountEl._citiesPaymentFilter = "all";
        mountEl._citiesHeatMode = "default";

        if (fbProvince) {
          fbProvince.value = "";
          var pb = fbProvince._customBtn;
          if (pb) {
            pb.style.borderColor = "rgba(255,255,255,0.1)";
            pb.style.boxShadow = "none";
          }
        }
        if (fbProduct) {
          fbProduct.value = "";
          var prb = fbProduct._customBtn;
          if (prb) {
            prb.style.borderColor = "rgba(255,255,255,0.1)";
            prb.style.boxShadow = "none";
          }
        }
        if (fbSearch) {
          fbSearch.value = "";
          fbSearch.style.borderColor = "rgba(255,255,255,0.1)";
        }
        mountEl.querySelectorAll(".sc-pay-pill").forEach(function (b, i) {
          b.style.background = i === 0 ? "#7c3aed" : "rgba(255,255,255,0.05)";
          b.style.color = i === 0 ? "#fff" : "rgba(255,255,255,0.45)";
          b.style.boxShadow =
            i === 0 ? "0 2px 10px rgba(124,58,237,0.35)" : "none";
        });
        selectedProvince = null;
        currentHeatMode = "default";
        applyProductFocusMode(null);
        applyHeatMode("default");
        restoreDefaultProvinceBlobs();
        var descEl = mountEl.querySelector("#sc-heat-desc");
        if (descEl) {
          descEl.innerText = s6Txt(
            "Displays regions grouped by color to show overall activity.",
            "يعرض المناطق مجمعة حسب اللون لإظهار النشاط العام."
          );
        }
        mountEl.querySelectorAll(".sc-heat-pill").forEach(function (btn) {
          var active = btn.dataset.mode === "default";
          btn.style.background = active ? "#7c3aed" : "transparent";
          btn.style.color = active ? "#fff" : "rgba(255,255,255,0.38)";
          btn.style.boxShadow = active
            ? "0 2px 10px rgba(124,58,237,0.4)"
            : "none";
        });
        /* Restore leaderboard values to city totals before re-filtering */
        applyProductView(null);
        updateSelection();
        if (window.DashboardFilterBus) window.DashboardFilterBus.reset();
        applyPaymentView('all');
        applyFilters();
      });
    }

    /* Sync province dropdown when map province blob is clicked */
    /* (updateSelection already handles visual sync; here we sync the dropdown) */
    var origUpdateSel = updateSelection;
    updateSelection = function () {
      origUpdateSel();
      if (fbProvince && fbProvince.value !== (selectedProvince || "")) {
        fbProvince.value = selectedProvince || "";
        var pb = fbProvince._customBtn;
        if (pb) {
          pb.style.borderColor = selectedProvince
            ? "#7c3aed"
            : "rgba(255,255,255,0.1)";
          pb.style.boxShadow = selectedProvince
            ? "0 0 0 2px rgba(124,58,237,0.2)"
            : "none";
        }
      }
      mountEl._citiesSelectedProvince = selectedProvince || null;
    };
    var initialPayVal = mountEl._citiesPaymentFilter || (window.DashboardFilterBus && window.DashboardFilterBus.getState().paymentFilter) || "all";
    applyPaymentView(initialPayVal);
  })();

  /* Phase 5: Mount Product × City Matrix */
  function mountCitiesSecondaryWidgets() {
    if (!mountEl.isConnected || mountEl._citiesSecondaryMounted) return;
    mountEl._citiesSecondaryMounted = true;

    var matrixMount = mountEl.querySelector("#sc-product-matrix-mount");
    if (matrixMount && typeof window.renderProductMatrix === "function") {
      window.renderProductMatrix(
        matrixMount,
        window.dashboardGeoData,
        window.DashboardFilterBus,
      );
    }

    var insightMount = mountEl.querySelector("#sc-insight-strip-mount");
    if (insightMount && typeof window.renderInsightStrip === "function") {
      window.renderInsightStrip(insightMount, window.dashboardGeoData);
    }
  }

  mountEl._citiesSecondaryMounted = false;
  mountEl._citiesSecondaryIdleHandle = whenCitiesIdle(mountCitiesSecondaryWidgets, 1000);

  /* ── T-22: Product Focus Mode ────────────────────────────────────────────── */

  /**
   * Activate product-focus map mode: recolour dots by product NDR in each city.
   * Cities where the product has no data are dimmed to 15% opacity.
   */
  function restoreDefaultProvinceBlobs() {
    PROVINCES.forEach(function (prov) {
      var blob = mountEl.querySelector(
        '.sc-prov-blob[data-province="' + prov.id + '"]',
      );
      if (!blob) return;
      blob.style.fill = "";
      blob.setAttribute("fill", blob.dataset.defaultFill || prov.color);
      blob.setAttribute("fill-opacity", blob.dataset.defaultOpacity || "0.16");
      blob.style.opacity =
        !selectedProvince || selectedProvince === prov.id ? "1" : "0.12";
    });
  }

  function applyProductFocusMode(productKey) {
    var geoData = window.dashboardGeoData;
    var geoMap = geoData && geoData.geo && geoData.geo.geoProductMap;

    var dots = mountEl.querySelectorAll(".sc-dot-inner");

    if (!productKey || !geoMap) {
      /* Restore default appearance */
      dots.forEach(function (dot) {
        var orig = dot.dataset.defaultColor || "#a855f7";
        dot.setAttribute("fill", orig);
        dot.style.filter = "none";
        dot.style.opacity = "1";
        var parent = dot.parentElement;
        if (parent) parent.style.opacity = "1";
      });
      restoreDefaultProvinceBlobs();
      return;
    }

    /* Collect NDR values for this product across all cities for normalisation */
    var ndrVals = [];
    dots.forEach(function (dot) {
      var cn = dot.dataset.name;
      var cell = geoMap[cn] && geoMap[cn][productKey];
      if (cell && ((cell.orders || 0) > 0 || (cell.delivered || 0) > 0)) ndrVals.push(cell.ndr * 100);
    });
    var minNdr = ndrVals.length ? Math.min.apply(null, ndrVals) : 0;
    var maxNdr = ndrVals.length ? Math.max.apply(null, ndrVals) : 100;
    var range = maxNdr - minNdr || 1;

    dots.forEach(function (dot) {
      var cn = dot.dataset.name;
      var cell = geoMap[cn] && geoMap[cn][productKey];
      var parent = dot.parentElement;

      if (!cell || ((cell.orders || 0) === 0 && (cell.delivered || 0) === 0)) {
        /* Product not sold here — dim */
        dot.setAttribute("fill", "#64748b");
        dot.style.filter = "none";
        dot.style.opacity = "0.15";
        if (parent) parent.style.opacity = "0.15";
        return;
      }

      var ndr = (cell.ndr || 0) * 100;
      var t = (ndr - minNdr) / range;
      var color = rateColor(ndr);
      dot.setAttribute("fill", color);
      dot.style.filter = "none";
      dot.style.opacity = "1";
      if (parent) parent.style.opacity = "1";
    });

    /* Update province blobs to reflect product's province-level avg NDR */
    var geoData2 = window.dashboardGeoData;
    var provMap = geoData2 && geoData2.geo && geoData2.geo.provinceMap;
    var cityStatsG = geoData2 && geoData2.geo && geoData2.geo.cityStats;

    PROVINCES.forEach(function (prov) {
      var blob = mountEl.querySelector(
        '.sc-prov-blob[data-province="' + prov.id + '"]',
      );
      if (!blob) return;

      /* Compute province avg NDR for this product from city data */
      var sum = 0,
        cnt = 0;
      if (geoMap) {
        Object.keys(geoMap).forEach(function (cn) {
          var cs = cityStatsG && cityStatsG[cn];
          if (!cs || cs.provinceId !== prov.id) return;
          var cell = geoMap[cn][productKey];
          if (cell && ((cell.orders || 0) > 0 || (cell.delivered || 0) > 0)) {
            sum += cell.ndr || 0;
            cnt++;
          }
        });
      }
      if (cnt === 0) {
        blob.style.opacity = "0.05";
        return;
      }
      var avgNdr = sum / cnt; /* fraction 0-1 */
      var t2 = Math.min(avgNdr / 0.8, 1);
      var opacity = 0.12 + t2 * 0.45;
      blob.style.opacity = opacity;
      blob.setAttribute("fill-opacity", "0.52");
      /* tint the gradient stop colour */
      blob.style.fill = rateColor(avgNdr * 100);
    });
  }

  /* ── T-22: Subscribe to FilterBus for cross-section product focus ─────────── */
  var _prevFocusProduct = null;

  function _onFilterBusChange(state) {
    if (mountEl.hidden) {
      mountEl._dashboardNeedsRefresh = true;
      return;
    }
    var fp = state.selectedProduct || null;
    if (false) console.log(
      "[Cities][_onFilterBusChange] state.selectedProduct:",
      JSON.stringify(fp),
      "| _prevFocusProduct:",
      JSON.stringify(_prevFocusProduct),
    );
    if (fp !== _prevFocusProduct) {
      _prevFocusProduct = fp;
      applyProductFocusMode(fp);
      syncLeaderboardProductFilter(state);

      /* Sync heat-pill visual state */
      var focusMode = fp ? "product" : "default";
      mountEl.querySelectorAll(".sc-heat-pill").forEach(function (btn) {
        var active = btn.dataset.mode === focusMode;
        btn.style.background = active ? "#7c3aed" : "transparent";
        btn.style.color = active ? "#fff" : "rgba(255,255,255,0.38)";
        btn.style.boxShadow = active
          ? "0 2px 10px rgba(124,58,237,0.4)"
          : "none";
      });
    }

    /* City selection → open drawer */
    if (
      state.selectedCity &&
      typeof window.CityIntelligenceDrawer === "object"
    ) {
      var drawerEl = document.getElementById("geo-city-drawer");
      var alreadyOpen =
        drawerEl && drawerEl.style.transform === "translateX(0px)";
      if (!alreadyOpen) {
        window.CityIntelligenceDrawer.open(
          state.selectedCity,
          window.dashboardGeoData,
        );
      }
    }
  }

  if (window.DashboardFilterBus) {
    mountEl._onCitiesFilterBusChange = _onFilterBusChange;
    window.DashboardFilterBus.subscribe(_onFilterBusChange);
    var _filterBusObserver = new MutationObserver(function () {
      if (!document.body.contains(mountEl)) {
        window.DashboardFilterBus.unsubscribe(_onFilterBusChange);
        _filterBusObserver.disconnect();
      }
    });
    if (mountEl.parentNode) {
      _filterBusObserver.observe(mountEl.parentNode, { childList: true });
    }
    mountEl._citiesFilterBusObserver = _filterBusObserver;
    /* Apply current state immediately (handles section re-mount with persisted state) */
    _onFilterBusChange(window.DashboardFilterBus.getState());
  }

  /* Restore heat mode if active */
  if (currentHeatMode && currentHeatMode !== "default") {
    applyHeatMode(currentHeatMode);
    mountEl.querySelectorAll(".sc-heat-pill").forEach(function (btn) {
      var active = btn.dataset.mode === currentHeatMode;
      btn.style.background = active ? "#7c3aed" : "transparent";
      btn.style.color = active ? "#fff" : "rgba(255,255,255,0.38)";
      btn.style.boxShadow = active
        ? "0 2px 10px rgba(124,58,237,0.4)"
        : "none";
    });
  }

  /* Return cleanup function */
  return function () {
    if (window.DashboardFilterBus && mountEl._onCitiesFilterBusChange) {
      window.DashboardFilterBus.unsubscribe(mountEl._onCitiesFilterBusChange);
    }
    if (mountEl._citiesFilterBusObserver) {
      mountEl._citiesFilterBusObserver.disconnect();
    }
    cancelCitiesIdle(mountEl._citiesSecondaryIdleHandle);
    mountEl._citiesSecondaryIdleHandle = null;
    if (citiesSearchTimer) {
      window.clearTimeout(citiesSearchTimer);
      citiesSearchTimer = null;
    }
    if (mountEl._citiesLeaderboardResizeHandler) {
      window.removeEventListener("resize", mountEl._citiesLeaderboardResizeHandler);
    }
    if (mountEl._citiesLeaderboardResizeTimer) {
      window.clearTimeout(mountEl._citiesLeaderboardResizeTimer);
      mountEl._citiesLeaderboardResizeTimer = null;
    }
    if (Array.isArray(mountEl._citiesDocumentClickHandlers)) {
      mountEl._citiesDocumentClickHandlers.forEach(function (handler) {
        document.removeEventListener("click", handler);
      });
      mountEl._citiesDocumentClickHandlers = [];
    }
  };
};
