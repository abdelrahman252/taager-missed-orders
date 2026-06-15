// ─────────────────────────────────────────────────────────────────────────────
// section4-cod.js  —  Task 4: تحصيل COD
// Vanilla-JS port of Section4.jsx + sub-components.
// Depends on: dashboard-shared.js (animateNumber, icon, formatSAR, sparklineSvg)
// ─────────────────────────────────────────────────────────────────────────────

window.renderSection4 = function (mountEl, data, ctx) {
  // ── data defaults (fallback to mock shape if real slice not yet wired) ──
  const cod = data && data.cod ? data.cod : null;
  const activeCurrency = data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || "SAR";

  var isAr = window.dashboardI18n
    ? window.dashboardI18n.currentLocale === "ar"
    : true;
  function s4Txt(en, ar) {
    return window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
  }

  function tx(key) {
    var str = window.dashboardI18n ? window.dashboardI18n.t(key) : key;
    return window.dashboardI18n && window.dashboardI18n.clean
      ? window.dashboardI18n.clean(str || key)
      : (str || key);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const fmtSAR =
    ctx && ctx.formatSAR
      ? ctx.formatSAR
      : (n) => Number(n).toLocaleString("en-US");

  function rateColor(value) {
    return window.dashboardRateColor
      ? window.dashboardRateColor(value)
      : value >= 40
        ? "#22d3ee"
        : value >= 30
          ? "#00e676"
          : value >= 20
            ? "#f59e0b"
            : "#ef4444";
  }

  // Mock data (mirrors components/section4/data.js) used until aggregator wired
  const DEFAULTS = {
    totalDue: 0,
    collected: 0,
    remaining: 0,
    collectionRate: 0,
    collectedSar: 0,
    gapSar: 0,
    expectedCodSar: 0,
    drPct: 0,
    drDeliveredOrders: 0,
    drBaseOrders: 0,
    drActiveOrders: 0,
    ndrPct: 0,
    ndrBaseOrders: 0,
    amountRepairReport: null,
    totalSalesRepairReport: null,
    avgDays: null,
    gapDelta: 0,
    daysDelta: 0,
    rateDelta: 0,
    gapSparkData: [0],
    cities: [],
    allCities: [],
    payMethods: [],
    insights: null,
    deliveredCount: 0,
    totalCitiesCount: 0,
  };

  const D = cod
    ? {
        totalDue: cod.totalDue ?? DEFAULTS.totalDue,
        collected: cod.collected ?? DEFAULTS.collected,
        remaining: cod.remaining ?? DEFAULTS.remaining,
        collectionRate: cod.collectionRate ?? DEFAULTS.collectionRate,
        collectedSar:
          cod.collectedSar ?? cod.collected ?? DEFAULTS.collectedSar,
        gapSar: cod.gapSar ?? cod.remaining ?? DEFAULTS.gapSar,
        expectedCodSar:
          cod.expectedCodSar ?? cod.totalDue ?? DEFAULTS.expectedCodSar,
        drPct: cod.drPct ?? cod.collectionRate ?? DEFAULTS.drPct,
        drDeliveredOrders:
          cod.drDeliveredOrders ??
          cod.deliveredCount ??
          DEFAULTS.drDeliveredOrders,
        drBaseOrders: cod.drBaseOrders ?? DEFAULTS.drBaseOrders,
        drActiveOrders: cod.drActiveOrders ?? DEFAULTS.drActiveOrders,
        ndrPct: cod.ndrPct ?? DEFAULTS.ndrPct,
        ndrBaseOrders:
          cod.ndrBaseOrders ?? cod.totalOrders ?? DEFAULTS.ndrBaseOrders,
        amountRepairReport:
          cod.amountRepairReport ?? DEFAULTS.amountRepairReport,
        totalSalesRepairReport:
          cod.totalSalesRepairReport ?? DEFAULTS.totalSalesRepairReport,
        avgDays: Object.prototype.hasOwnProperty.call(cod, "avgDays")
          ? cod.avgDays
          : DEFAULTS.avgDays,
        gapDelta: cod.gapDelta ?? DEFAULTS.gapDelta,
        daysDelta: cod.daysDelta ?? DEFAULTS.daysDelta,
        rateDelta: cod.rateDelta ?? DEFAULTS.rateDelta,
        gapSparkData: cod.gapSparkData ?? DEFAULTS.gapSparkData,
        cities: cod.mapCities ?? DEFAULTS.cities,
        allCities: cod.cities ?? cod.mapCities ?? DEFAULTS.allCities,
        payMethods: cod.payMethods ?? DEFAULTS.payMethods,
        insights: null,
        deliveredCount: cod.deliveredCount ?? DEFAULTS.deliveredCount,
        totalCitiesCount: cod.totalCitiesCount ?? DEFAULTS.totalCitiesCount,
      }
    : DEFAULTS;

  // ── Dynamic insights generator ─────────────────────────────────────────
  function generateCodInsights(d) {
    var insights = [];
    var rate = d.drPct != null ? d.drPct : d.collectionRate || 0;
    var gap = d.gapSar || d.remaining || 0;
    var gapPct = parseFloat((100 - rate).toFixed(1));

    if (rate >= 40) {
      insights.push({
        color: rateColor(rate),
        iconType: "trendingUp",
        title: s4Txt("Excellent DR", "DR ممتاز"),
        body:
          s4Txt("DR ", "DR ") +
          rate.toFixed(1) +
          s4Txt(
            "% — Outstanding delivery performance",
            "% — أداء تسليم ممتاز جداً",
          ),
      });
    } else if (rate >= 30) {
      insights.push({
        color: rateColor(rate),
        iconType: "trendingUp",
        title: s4Txt("Good DR", "DR جيد"),
        body:
          s4Txt("DR ", "DR ") +
          rate.toFixed(1) +
          s4Txt("% — Can be improved", "% — يمكن تحسينه"),
      });
    } else {
      insights.push({
        color: rateColor(rate),
        iconType: "alertCircle",
        title: s4Txt("Low DR", "DR منخفض"),
        body:
          s4Txt("DR ", "DR ") +
          rate.toFixed(1) +
          s4Txt("% — Needs urgent follow-up", "% — يحتاج متابعة عاجلة"),
      });
    }

    if (d.avgDays != null) {
      if (d.avgDays <= 3) {
        insights.push({
          color: "#00e676",
          iconType: "clock",
          title: s4Txt("Excellent Delivery Time", "وقت تسليم ممتاز"),
          body:
            s4Txt("Average delivery time ", "متوسط وقت التسليم ") +
            d.avgDays.toFixed(1) +
            s4Txt(
              " days - below target of 5 days",
              " أيام - أقل من المستهدف 5 أيام",
            ),
        });
      } else if (d.avgDays <= 5) {
        insights.push({
          color: "#f59e0b",
          iconType: "clock",
          title: s4Txt("Delivery Time", "وقت التسليم"),
          body:
            s4Txt("Average delivery time ", "متوسط وقت التسليم ") +
            d.avgDays.toFixed(1) +
            s4Txt(" days - within target", " أيام - ضمن المستهدف"),
        });
      } else {
        insights.push({
          color: "#ef4444",
          iconType: "clock",
          title: s4Txt("Long Delivery Time", "وقت تسليم طويل"),
          body:
            s4Txt("Average delivery time ", "متوسط وقت التسليم ") +
            d.avgDays.toFixed(1) +
            s4Txt(
              " days - exceeds 5 days target",
              " أيام - يتجاوز المستهدف 5 أيام",
            ),
        });
      }
    } else {
      insights.push({
        color: "#3b82f6",
        iconType: "info",
        title: s4Txt("Delivery Time", "وقت التسليم"),
        body: s4Txt(
          "Not available in current snapshot",
          "غير متوفر في اللقطة الحالية",
        ),
      });
    }

    if (gapPct > 30) {
      insights.push({
        color: "#ef4444",
        iconType: "alertCircle",
        title: s4Txt("High Gap", "الفجوة مرتفعة"),
        body:
          gap.toLocaleString("en-US") +
          " " + activeCurrency + s4Txt(" uncollected (", " غير محصل (") +
          gapPct +
          s4Txt(
            "%) — follow up with couriers",
            "%) — يفضل المتابعة مع شركات الشحن",
          ),
      });
    } else if (gapPct > 10) {
      insights.push({
        color: "#f59e0b",
        iconType: "alertCircle",
        title: s4Txt("Moderate Gap", "فجوة معتدلة"),
        body:
          gap.toLocaleString("en-US") +
          " " + activeCurrency + s4Txt(" uncollected (", " غير محصل (") +
          gapPct +
          s4Txt("%)", "%)"),
      });
    } else {
      insights.push({
        color: "#14b8a6",
        iconType: "shieldCheck",
        title: s4Txt("Small Gap", "فجوة ضئيلة"),
        body:
          s4Txt("Gap is only ", "الفجوة ") +
          gapPct +
          s4Txt(
            "% of expected — good performance",
            "% فقط من المتوقع — أداء جيد",
          ),
      });
    }

    var collected = d.collectedSar || d.collected || 0;
    var due = d.expectedCodSar || d.totalDue || 0;
    var collectedPct = due > 0 ? (collected / due) * 100 : 0;
    insights.push({
      color: collectedPct >= 90 ? "#00e676" : "#f59e0b",
      iconType: "banknote",
      title:
        collectedPct >= 90
          ? s4Txt("Strong Cash Capture", "تحصيل نقدي قوي")
          : s4Txt("Cash Capture Watch", "مراقبة التحصيل النقدي"),
      body:
        Number(collected || 0).toLocaleString("en-US") +
        " " + activeCurrency + s4Txt(" collected from ", " تم تحصيلها من ") +
        Number(due || 0).toLocaleString("en-US") +
        " " + activeCurrency + s4Txt(" due.", " مستحقة."),
    });

    var activeOrders = d.drActiveOrders || 0;
    insights.push({
      color: activeOrders <= 10 ? "#22d3ee" : "#f59e0b",
      iconType: activeOrders <= 10 ? "shieldCheck" : "info",
      title: s4Txt("Active Orders Watch", "متابعة الطلبات النشطة"),
      body:
        activeOrders.toLocaleString("en-US") +
        s4Txt(
          " active undelivered orders still affect the final collection gap.",
          " طلب نشط غير مسلم ما زال يؤثر على فجوة التحصيل النهائية.",
        ),
    });

    return insights;
  }
  D.insights = generateCodInsights(D);

  // ── SVG icon helpers (inline, no lucide dep) ────────────────────────────
  function svgIcon(name, size, color) {
    const c = color || "currentColor";
    const paths = {
      trendingUp: `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`,
      clock: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
      alertCircle: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
      mapPin: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>`,
      banknote: `<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>`,
      chevronLeft: `<polyline points="15 18 9 12 15 6"/>`,
      info: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`,
      shieldCheck: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>`,
      calendar: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
      search: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;flex-shrink:0">${paths[name] || ""}</svg>`;
  }

  // ── sparkline (tiny version, inline SVG string) ──────────────────────────
  function sparklineSvgInline(sparkData, color, w, h) {
    if (!sparkData || sparkData.length < 2) return "";
    const min = Math.min(...sparkData),
      max = Math.max(...sparkData);
    const range = max - min || 1;
    const pts = sparkData
      .map(
        (v, i) =>
          `${(i / (sparkData.length - 1)) * w},${h - ((v - min) / range) * h}`,
      )
      .join(" ");
    const gid = `spk4-${color.replace("#", "")}`;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polyline points="${pts} ${w},${h} 0,${h}" fill="url(#${gid})" stroke="none"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" style="filter:drop-shadow(0 0 4px ${color})"/>
    </svg>`;
  }

  // ── StatCard HTML builder ────────────────────────────────────────────────
  function statCardHTML(opts) {
    // opts: { id, variant, color, label, value, unit, decimals, subtitle,
    //         delta, deltaPositive, deltaIsImprovement, iconType, sparkData }
    const {
      id,
      variant = "sparkline",
      color,
      label,
      value,
      unit = "",
      decimals = 0,
      subtitle,
      delta,
      deltaPositive = true,
      deltaIsImprovement = true,
      iconType,
      sparkData,
    } = opts;
    const displayLabel = id === "s4-rate" ? "DR" : label;

    const arrow = deltaPositive ? "↑" : "↓";
    const deltaColor = deltaIsImprovement ? "#00e676" : "#ef4444";

    const iconHTML =
      variant === "icon" && iconType
        ? `<div style="
            width:36px;height:36px;border-radius:12px;flex-shrink:0;
            display:flex;align-items:center;justify-content:center;
            background:${color}1a;border:1px solid ${color}55;
            box-shadow:0 0 12px ${color}66,inset 0 0 8px ${color}33">
           ${svgIcon(iconType, 16, color)}
         </div>`
        : "";

    const subtitleText =
      id === "s4-gap"
        ? D.drActiveOrders.toLocaleString("en-US") +
          s4Txt(" active undelivered orders", " طلب نشط لم يتم تسليمه")
        : subtitle;
    const subtitleHTML = subtitleText
      ? `<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:6px;text-align:${isAr ? "right" : "left"}">${subtitleText}</div>`
      : "";

    const deltaHTML =
      delta !== undefined
        ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px;justify-content:${isAr ? "flex-end" : "flex-start"};flex-direction:${isAr ? "row-reverse" : "row"}">
           ${
             variant === "sparkline"
               ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:9999px;
                  font-size:11px;font-weight:700;background:${deltaColor}1a;border:1px solid ${deltaColor}55;color:${deltaColor}">
                  ${arrow} ${Math.abs(delta).toFixed(1)}%
                </span>`
               : `<span style="font-size:11px;font-weight:700;color:${deltaColor};display:flex;align-items:center;gap:4px">
                  ${arrow} ${Math.abs(delta).toFixed(1)}%
                </span>`
           }
           <span style="font-size:10px;color:rgba(255,255,255,0.4)">
             ${deltaIsImprovement ? s4Txt("Improved from previous month", "تحسن عن الشهر السابق") : s4Txt("Compared with previous month", "مقارنة بالشهر السابق")}
           </span>
         </div>`
        : "";

    const sparkHTML =
      variant === "sparkline" && sparkData
        ? `<div style="margin-top:12px;opacity:0.85;display:flex;justify-content:${isAr ? "flex-end" : "flex-start"}">
           ${sparklineSvgInline(sparkData, color, 110, 30)}
         </div>`
        : "";

    return `
      <div class="fade-up" class="s4-statcard" style="
          background:rgba(255,255,255,0.02);border-radius:16px;padding:24px;position:relative;overflow:hidden;
          border:1px solid rgba(255,255,255,0.05);
          transition:transform 0.2s">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
                    flex-direction:row;margin-bottom:${variant === "icon" ? "12px" : "8px"}">
          <div style="font-size:14px;font-weight:700;color:#fff;text-align:${isAr ? "right" : "left"}">
            ${displayLabel}
          </div>
          ${iconHTML}
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;justify-content:${isAr ? "flex-end" : "flex-start"};flex-direction:${isAr ? "row" : "row-reverse"}">
          ${unit ? `<span style="font-size:14px;font-weight:700;color:${color}">${unit}</span>` : ""}
          <span id="${id}" style="font-size:${variant === "sparkline" ? "42px" : "28px"};font-weight:900;color:${variant === "sparkline" ? color : "#fff"};line-height:1;
                                  letter-spacing:-1px;text-shadow:${variant === "sparkline" ? "0 0 20px " + color + "66" : "none"}">0</span>
        </div>
        ${subtitleHTML}
        ${deltaHTML}
        ${sparkHTML}
      </div>`;
  }

  // ── COD Donut SVG/HTML ───────────────────────────────────────────────────
  function codDonutHTML() {
    const DSIZE = 260,
      DSTROKE = 22;
    const DR = (DSIZE - DSTROKE) / 2 - 4;
    const DCX = DSIZE / 2,
      DCY = DSIZE / 2;
    const DC = 2 * Math.PI * DR;

    const drBase = D.drBaseOrders || 1;
    const deliveredShare = Math.max(
      0,
      Math.min(1, (D.drDeliveredOrders || 0) / drBase),
    );
    const activeShare = Math.max(
      0,
      Math.min(1, (D.drActiveOrders || 0) / drBase),
    );
    const blueLen = DC / 2;
    const greenLen = deliveredShare * (DC / 2);
    const redLen = activeShare * (DC / 2);
    const drColor = rateColor(D.drPct);

    function chipHtml(label, value, pct, color, side, unit) {
      var align =
        side === "right"
          ? isAr
            ? "flex-end"
            : "flex-start"
          : isAr
            ? "flex-start"
            : "flex-end";
      unit = unit || activeCurrency;
      if (color === "#00e676") {
        label = s4Txt("Collected", "تم التحصيل");
        value = D.collectedSar;
        pct =
          D.drDeliveredOrders.toLocaleString("en-US") +
          s4Txt(" orders", " طلب");
      } else if (label === "DR") {
        label = "DR";
        value = D.drPct;
        pct =
          D.drDeliveredOrders.toLocaleString("en-US") +
          " / " +
          D.drBaseOrders.toLocaleString("en-US");
      } else if (color === "#f43f5e") {
        label = s4Txt("Gap", "الفجوة");
        value = D.gapSar;
        pct =
          D.drActiveOrders.toLocaleString("en-US") +
          s4Txt(" active orders", " طلب نشط");
      }
      return `<div class="fade-up" style="display:flex;flex-direction:column;align-items:${align};min-width:0;animation-delay:400ms">
        <div style="font-size:12px;font-weight:800;color:${color}">${label}</div>
        <div style="display:flex;align-items:baseline;gap:4px;flex-direction:${isAr ? "row" : "row-reverse"}">
          <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.4)">${unit}</span>
          <span style="font-size:18px;font-weight:900;color:#fff">${Number(value).toLocaleString("en-US", { minimumFractionDigits: value % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })}</span>
        </div>
        <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.4)">${pct}</div>
      </div>`;
    }

    return `
      <div class="fade-up" style="animation-delay:200ms;
          background:#0b1120;border:1px solid rgba(255,255,255,0.1);
          border-radius:16px;padding:24px;display:flex;flex-direction:column;align-items:center;
          box-shadow:inset 0 0 40px rgba(0,0,0,0.5)">
        <div style="width:100%;font-size:16px;font-weight:800;color:#fff;margin-bottom:24px;text-align:${isAr ? "right" : "left"}">
          ${s4Txt("COD Collection Overview", "نظرة عامة على التحصيل")}
        </div>
        
        <div style="position:relative;width:${DSIZE}px;height:${DSIZE}px;margin:0 auto">
            <svg width="${DSIZE}" height="${DSIZE}" viewBox="0 0 ${DSIZE} ${DSIZE}">
              <circle cx="${DCX}" cy="${DCY}" r="${DR}" fill="none"
                      stroke="rgba(255,255,255,0.04)" stroke-width="${DSTROKE}"/>
              <!-- Blue arc (Right half) -->
              <circle cx="${DCX}" cy="${DCY}" r="${DR}" fill="none"
                      stroke="${drColor}" stroke-width="${DSTROKE}"
                      stroke-dasharray="${blueLen} ${DC}" stroke-dashoffset="0"
                      transform="rotate(-90 ${DCX} ${DCY})"
                      style="filter:drop-shadow(0 0 12px ${drColor}99);"/>
              <!-- Red arc (Bottom left) -->
              <circle cx="${DCX}" cy="${DCY}" r="${DR}" fill="none"
                      stroke="#f43f5e" stroke-width="${DSTROKE}"
                      stroke-dasharray="${redLen} ${DC}" stroke-dashoffset="-${blueLen}"
                      transform="rotate(-90 ${DCX} ${DCY})"
                      style="filter:drop-shadow(0 0 12px rgba(244,63,94,0.5));"/>
              <!-- Green arc (Top left) -->
              <circle cx="${DCX}" cy="${DCY}" r="${DR}" fill="none"
                      stroke="#00e676" stroke-width="${DSTROKE}"
                      stroke-dasharray="${greenLen} ${DC}" stroke-dashoffset="-${blueLen + redLen}"
                      transform="rotate(-90 ${DCX} ${DCY})"
                      style="filter:drop-shadow(0 0 12px rgba(0,230,118,0.5));"/>
            </svg>

            <!-- Center metrics -->
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
              <div style="font-size:14px;font-weight:800;color:#fff">DR</div>
              <div style="font-size:42px;font-weight:900;color:#fff;line-height:1;letter-spacing:-1px;margin:4px 0">${D.drPct.toFixed(1)}</div>
              <div style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.6)">%</div>
              <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);margin-top:8px">${D.drDeliveredOrders.toLocaleString("en-US")} / ${D.drBaseOrders.toLocaleString("en-US")} ${s4Txt("delivered", "مسلمة")}</div>
            </div>
          </div>
        
        <div style="width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px;text-align:center">
           ${chipHtml("Collected", D.collectedSar, "", "#00e676", "left", activeCurrency)}
           ${chipHtml("DR", D.drPct, "", drColor, "center", "%")}
           ${chipHtml("Gap", D.gapSar, "", "#f43f5e", "right", activeCurrency)}
        </div>
      </div>`;
  }

  function codCollectionOverviewHTML() {
    const DSIZE = 300,
      DSTROKE = 34;
    const DR = (DSIZE - DSTROKE) / 2 - 4;
    const DCX = DSIZE / 2,
      DCY = DSIZE / 2;
    const DC = 2 * Math.PI * DR;
    const totalDue = Math.max(0, Number(D.expectedCodSar || D.totalDue || 0));
    const collected = Math.max(0, Number(D.collectedSar || D.collected || 0));
    const gap = Math.max(
      0,
      Number(D.gapSar || D.remaining || Math.max(0, totalDue - collected)),
    );
    const collectedPct =
      totalDue > 0
        ? Math.max(0, Math.min(100, (collected / totalDue) * 100))
        : 0;
    const gapPct =
      totalDue > 0 ? Math.max(0, Math.min(100, (gap / totalDue) * 100)) : 0;
    const collectedLen = (collectedPct / 100) * DC;
    const gapLen = (gapPct / 100) * DC;
    const ringOffset = DC * 0.18;
    const dueLabel = s4Txt("Due", "المستحق");
    const collectedLabel = s4Txt("Collected", "تم التحصيل");
    const gapLabel = s4Txt("Gap", "الفجوة");
    const totalLabel = s4Txt("Total due", "إجمالي المستحق");
    const deliveredOnlyLabel = s4Txt(
      "Delivered orders only",
      "الطلبات المسلمة فقط",
    );

    function money(value, digits) {
      return Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: digits || 0,
        maximumFractionDigits: digits || 0,
      });
    }

    function pctText(value) {
      value = Number(value || 0);
      return value.toFixed(value % 1 === 0 ? 0 : 1) + "%";
    }

    function calloutHTML(kind, label, value, pct, color, side) {
      return `<div class="s4-cod-callout s4-cod-callout-${kind} s4-cod-callout-${side}" style="--s4-callout-color:${color}">
        <div class="s4-callout-dot"></div>
        <div class="s4-callout-box" dir="${isAr ? "rtl" : "ltr"}">
          <div class="s4-callout-label">${label}</div>
          <div class="s4-callout-value"><span>${money(value)}</span><small>${activeCurrency}</small></div>
          <div class="s4-callout-pct">${pctText(pct)}</div>
        </div>
      </div>`;
    }

    return `
      <div class="s4-cod-overview-card fade-up" style="animation-delay:200ms">
        <div class="s4-cod-overview-title">
          ${s4Txt("COD Collection Overview", "نظرة عامة على تحصيل COD")}
        </div>

        <div class="s4-cod-orbit" dir="ltr" style="--s4-donut-size:${DSIZE}px">
          <div class="s4-cod-svg-wrap">
            <svg width="${DSIZE}" height="${DSIZE}" viewBox="0 0 ${DSIZE} ${DSIZE}">
              <defs>
                <linearGradient id="s4-cod-blue" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#29d9ff"/>
                  <stop offset="100%" stop-color="#2563eb"/>
                </linearGradient>
                <linearGradient id="s4-cod-green" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#2af5b8"/>
                  <stop offset="100%" stop-color="#00c781"/>
                </linearGradient>
                <linearGradient id="s4-cod-red" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#ff7aa5"/>
                  <stop offset="100%" stop-color="#e11d48"/>
                </linearGradient>
              </defs>
              <circle class="s4-cod-ring-track" cx="${DCX}" cy="${DCY}" r="${DR}" fill="none" stroke-width="${DSTROKE}"/>
              <circle class="s4-cod-ring-due" cx="${DCX}" cy="${DCY}" r="${DR}" fill="none"
                      stroke="url(#s4-cod-blue)" stroke-width="${DSTROKE}"
                      stroke-dasharray="${DC} ${DC}" stroke-dashoffset="0"
                      transform="rotate(-90 ${DCX} ${DCY})"/>
              <circle class="s4-cod-ring-gap" cx="${DCX}" cy="${DCY}" r="${DR}" fill="none"
                      stroke="url(#s4-cod-red)" stroke-width="${DSTROKE}"
                      stroke-dasharray="${gapLen} ${DC}" stroke-dashoffset="-${ringOffset + collectedLen}"
                      transform="rotate(-90 ${DCX} ${DCY})"/>
              <circle class="s4-cod-ring-collected" cx="${DCX}" cy="${DCY}" r="${DR}" fill="none"
                      stroke="url(#s4-cod-green)" stroke-width="${DSTROKE}"
                      stroke-dasharray="${collectedLen} ${DC}" stroke-dashoffset="-${ringOffset}"
                      transform="rotate(-90 ${DCX} ${DCY})"/>
            </svg>
  
            <div class="s4-cod-center" dir="${isAr ? "rtl" : "ltr"}">
              <div class="s4-cod-center-label">${totalLabel}</div>
              <div class="s4-cod-center-value">${money(totalDue)}</div>
              <div class="s4-cod-center-unit">${activeCurrency}</div>
              <div class="s4-cod-center-chip">${deliveredOnlyLabel}</div>
            </div>
          </div>

          ${calloutHTML("due", dueLabel, totalDue, totalDue > 0 ? 100 : 0, "#38bdf8", "right")}
          ${calloutHTML("collected", collectedLabel, collected, collectedPct, "#00e676", "left")}
          ${calloutHTML("gap", gapLabel, gap, gapPct, "#f43f5e", "right")}
        </div>
      </div>`;
  }

  // ── COD Insights HTML ────────────────────────────────────────────────────
  function codInsightsHTML() {
    const insightsHTML = D.insights
      .map(
        (ins, i) => `
      <div class="fade-up" style="
          animation-delay:${200 + i * 100}ms;
          display:flex;align-items:flex-start;gap:14px;padding:12px 0;
          background:transparent;border-radius:0;
          flex-direction:row;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="
            width:38px;height:38px;border-radius:50%;flex-shrink:0;
            display:flex;align-items:center;justify-content:center;
            background:transparent;
            border:1.5px solid ${ins.color};
            box-shadow:inset 0 0 10px ${ins.color}22">
          ${svgIcon(ins.iconType, 18, ins.color)}
        </div>
        <div style="flex:1;text-align:${isAr ? "right" : "left"}">
          <div style="font-size:14px;font-weight:800;margin-bottom:6px;
                      color:${ins.color};">
            ${ins.title}
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.6">
            ${ins.body}
          </div>
        </div>
      </div>`,
      )
      .join("");

    return `
      <div class="fade-up" style="
          background:#0b1120;border:1px solid rgba(255,255,255,0.1);
          border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:10px;justify-content:${isAr ? "flex-end" : "flex-start"};
                    flex-direction:${isAr ? "row" : "row-reverse"};margin-bottom:4px">
          <span style="font-size:18px;color:#a855f7;text-shadow:0 0 12px rgba(168,85,247,0.6)">✦</span>
          <span style="font-size:18px;font-weight:800;color:#fff">${s4Txt("Quick Insights", "رؤى سريعة")}</span>
        </div>
        ${insightsHTML}
        <div class="fade-up" style="animation-delay:600ms;padding:12px;
            background:rgba(255,255,255,0.05);
            border:1px dashed rgba(168,85,247,0.3);border-radius:12px;text-align:${isAr ? "right" : "left"};margin-top:4px">
          <div style="font-size:12px;font-weight:800;color:#a855f7;margin-bottom:4px">${s4Txt("Tip", "نصيحة")}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.6">
            ${s4Txt("Communicate with couriers to speed up the delivery of outstanding payments.", "تواصل مع شركات الشحن لتسريع تسليم المدفوعات المستحقة.")}
          </div>
        </div>
      </div>`;
  }

  // ── Payment Methods donut HTML ───────────────────────────────────────────
  function paymentMethodsHTML() {
    const PSIZE = 140,
      PSTROKE = 8;
    const PR = (PSIZE - PSTROKE) / 2 - 2;
    const PCX = PSIZE / 2,
      PCY = PSIZE / 2;
    const PC = 2 * Math.PI * PR;

    const pm = Array.isArray(D.payMethods) ? D.payMethods : [];

    function paymentLabel(method) {
      var label = String(
        (method && (method.labelEn || method.label)) || "",
      ).trim();
      var lower = label.toLowerCase();
      var isCodMethod =
        lower.indexOf("cod") !== -1 ||
        lower.indexOf("cash") !== -1 ||
        label.indexOf("الاستلام") !== -1 ||
        label.indexOf("كاش") !== -1;
      var isPrepaidMethod =
        lower.indexOf("prepaid") !== -1 ||
        lower.indexOf("pre-paid") !== -1 ||
        lower.indexOf("paid") !== -1 ||
        label.indexOf("مسبق") !== -1;
      if (isCodMethod) return s4Txt("Cash on Delivery", "الدفع عند الاستلام");
      if (isPrepaidMethod) return s4Txt("Prepaid", "دفع مسبق");
      return label || s4Txt("Payment method", "طريقة دفع");
    }

    if (pm.length < 2) {
      return `
        <div class="fade-up" style="animation-delay:200ms;
            background:#0b1120;border:1px solid rgba(255,255,255,0.1);
            border-radius:16px;padding:24px;display:flex;flex-direction:column;justify-content:center;min-height:230px">
          <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:12px;text-align:${isAr ? "right" : "left"}">
            ${s4Txt("Payment Methods", "طرق الدفع")}
          </div>
          <div style="font-size:13px;color:rgba(255,255,255,0.45);line-height:1.8;text-align:${isAr ? "right" : "left"}">
            ${s4Txt("No detailed payment data available in current snapshot.", "لا توجد بيانات دفع مفصلة في لقطة Dashboard الحالية.")}
          </div>
        </div>`;
    }

    return `
      <div class="fade-up" style="animation-delay:200ms;
          background:#0b1120;border:1px solid rgba(255,255,255,0.1);
          border-radius:16px;padding:24px;display:flex;flex-direction:column">
        <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:16px;text-align:${isAr ? "right" : "left"}">
          ${s4Txt("Payment Methods", "طرق الدفع")}
        </div>
        <div class="s4-payment-row" style="display:flex;flex-direction:${isAr ? "row" : "row-reverse"};align-items:center;gap:28px;flex:1">
          <!-- Legend / text -->
          <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px">
            ${pm
              .map(
                (m, i) => `
              <div class="fade-up" style="animation-delay:${500 + i * 200}ms;
                  display:flex;align-items:center;justify-content:${isAr ? "flex-end" : "flex-start"};
                  gap:10px;flex-direction:${isAr ? "row" : "row-reverse"};width:100%">
                <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
                             background:${m.color};box-shadow:0 0 8px ${m.color}"></span>
                <span style="font-size:14px;color:rgba(255,255,255,0.9);font-weight:500;
                             white-space:nowrap">${paymentLabel(m)}</span>
                <span style="font-size:18px;font-weight:700;margin-${isAr ? "left" : "right"}:auto;
                             color:${m.color};text-shadow:0 0 10px ${m.color}66">
                  ${m.value}%
                </span>
              </div>`,
              )
              .join("")}
            <div class="fade-up" style="animation-delay:1000ms;
                margin-top:4px;padding-top:16px;
                display:flex;align-items:center;justify-content:space-between;
                flex-direction:${isAr ? "row" : "row-reverse"};width:100%;border-top:1px solid rgba(255,255,255,0.06)">
              <span style="font-size:13px;color:rgba(255,255,255,0.6)">${s4Txt("Total Transactions", "إجمالي المعاملات")}</span>
              <span style="font-size:15px;color:#fff;font-weight:700;letter-spacing:1px">${D.deliveredCount.toLocaleString("en-US")} ${s4Txt("orders", "طلب")}</span>
            </div>
          </div>

          <!-- Donut chart (left side in RTL) -->
          <div style="position:relative;width:140px;height:140px;flex-shrink:0">
            <svg id="s4-pay-svg" width="${PSIZE}" height="${PSIZE}" viewBox="0 0 ${PSIZE} ${PSIZE}">
              <circle cx="${PCX}" cy="${PCY}" r="${PR}" fill="none"
                      stroke="rgba(255,255,255,0.05)" stroke-width="${PSTROKE}"/>
              <!-- Cash arc -->
              <circle id="s4-pay-cash"
                      cx="${PCX}" cy="${PCY}" r="${PR}" fill="none"
                      stroke="${pm[0].color}" stroke-width="${PSTROKE}"
                      stroke-dasharray="0 ${PC}"
                      transform="rotate(-90 ${PCX} ${PCY})"
                      style="transition:stroke-dasharray 0.5s cubic-bezier(0.4,0,0.2,1);
                             filter:drop-shadow(0 0 6px ${pm[0].color}aa)"/>
              <!-- Bank transfer arc -->
              <circle id="s4-pay-bank"
                      cx="${PCX}" cy="${PCY}" r="${PR}" fill="none"
                      stroke="${pm[1].color}" stroke-width="${PSTROKE}"
                      stroke-dasharray="0 ${PC}"
                      transform="rotate(${-90 + (pm[0].value / 100) * 360} ${PCX} ${PCY})"
                      style="transition:stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1);
                             filter:drop-shadow(0 0 6px ${pm[1].color})"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
              <div style="width:40px;height:40px;border-radius:12px;
                          background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);
                          display:flex;align-items:center;justify-content:center">
                ${svgIcon("banknote", 20, "#3b82f6")}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Saudi Arabia map SVG path ────────────────────────────────────────────
  const SAUDI_PATH = `M43.493,151.359L43.014,151.359L41.644,149.933L40.89,148.872L40.068,148.177L36.438,146.749L35.89,145.833L36.507,144.917L36.849,145.833L37.534,146.346L40.548,147.664L43.904,150.445L44.521,150.701ZM140.274,328.281L141.712,328.384L141.096,327.729L140.959,327.418L141.644,326.521L143.699,328.419L143.63,330.625L143.493,331.142L142.945,330.659L142.534,330.211L142.397,329.694L141.849,329.143L139.795,329.487L138.562,328.901L136.712,327.004L136.233,325.659L136.986,325.383L137.808,324.727L138.288,323.657L137.808,322.552L138.904,322.724L139.521,323.864L139.589,326.452L139.795,327.004L139.452,327.591ZM330.342,282.681L325.822,283.31L321.507,283.938L316.644,284.637L310.753,285.474L306.164,286.103L299.452,287.08L293.425,287.917L287.808,288.719L282.123,289.521L277.329,290.218L274.452,291.019L271.096,292.726L265.89,295.407L260.616,298.12L257.945,299.511L255.068,303.124L253.63,304.929L250.959,308.225L248.973,310.721L246.644,313.665L245.616,316.33L244.041,320.375L242.671,321.412L240.411,322.724L238.356,323.657L235.137,323.553L233.356,321.032L231.37,318.405L230.411,317.333L229.589,317.264L226.37,317.609L222.466,318.024L217.945,317.575L212.671,317.056L207.74,316.606L205.274,316.26L202.055,314.53L201.233,314.184L200.342,314.115L196.575,314.045L192.74,314.011L188.904,314.565L185.274,314.357L181.507,314.669L180.137,315.326L178.699,315.291L177.74,315.88L176.986,316.157L175.959,315.638L174.795,315.776L173.082,315.326L171.918,314.219L170.89,313.215L169.795,312.66L168.562,312.349L167.466,312.314L166.096,312.938L165.274,313.526L163.151,315.465L163.082,316.157L164.041,317.298L163.699,317.851L162.466,318.543L162.123,320.375L161.918,321.377L161.712,323.76L162.26,325.659L163.014,326.349L163.082,327.177L162.671,328.798L161.507,329.281L160.685,330.832L160.137,331.555L159.247,332.382L155.685,335.103L155.479,333.519L154.384,331.176L154.315,329.487L153.767,327.832L152.808,326.556L151.027,325.245L150.822,323.415L149.521,321.619L147.808,320.168L146.781,317.506L146.096,313.942L141.507,309.265L135.753,304.964L133.973,302.499L131.096,297.529L129.658,293.597L125.822,289.067L125.685,287.324L125.068,285.195L124.178,282.821L123.699,280.934L119.795,272.711L118.562,271.414L117.466,269.556L117.192,268.153L116.849,267.381L114.178,266.012L111.575,262.534L103.973,257.011L100.205,256.483L97.26,254.511L95.068,251.902L92.74,247.455L88.63,242.649L85.205,235.779L86.301,233.26L86.233,231.521L85.137,228.537L83.973,226.262L83.151,224.092L83.836,220.958L84.041,217.464L84.726,215.608L85.205,213.573L84.589,209.462L83.425,207.279L83.562,205.81L82.26,205.094L81.164,203.481L82.26,203.517L80.274,201.293L79.521,200.073L78.767,197.057L77.808,194.756L74.726,189.5L73.219,186.292L69.863,182.176L66.233,179.103L63.973,177.729L62.877,176.462L60.959,176.389L58.904,174.578L57.466,174.542L55.685,174.252L53.562,170.735L51.781,167.467L48.767,163.177L49.521,162.048L50.411,160.227L50,157.858L49.521,156.253L48.219,153.296L43.836,145.906L42.671,144.844L40.822,143.597L39.726,140.368L39.178,137.502L36.164,136.105L31.096,125.711L28.082,122.052L26.918,119.609L23.493,115.569L21.849,111.523L18.356,107.804L15.342,101.358L10.753,94.856L8.767,93.733L4.041,93.284L1.986,92.797L0.137,94.219L0,92.422L1.301,89.911L3.082,84.655L3.493,80.027L6.37,66.276L10.411,66.958L13.767,67.564L18.63,68.435L23.699,69.306L26.644,69.836L27.603,69.609L31.712,66.239L35.411,63.167L37.603,59.445L39.726,55.793L40.685,55.031L43.973,54.384L49.178,53.279L54.315,52.211L54.658,51.868L55.89,48.929L57.397,45.221L57.74,44.838L58.082,44.456L61.781,42.35L63.973,41.085L60.822,37.363L57.808,33.828L54.452,29.862L51.644,26.777L47.329,22.141L44.589,19.083L49.452,17.65L54.726,16.099L60.068,14.508L66.507,12.605L71.507,11.128L79.041,8.91L82.671,7.82L83.356,7.548L86.164,4.897L90.411,5.638L96.781,6.768L102.945,7.82L109.452,9.066L111.575,10.117L117.808,13.848L121.918,16.293L126.644,19.161L132.603,22.683L136.644,25.117L141.918,28.243L145.959,31.788L151.164,36.288L156.781,41.2L161.438,45.03L167.877,50.265L174.247,55.412L180.411,60.471L185.411,64.495L191.644,69.571L192.192,69.76L198.493,70.327L207.055,71.122L215.616,71.878L223.356,72.596L226.712,71.878L230.342,72.331L235.274,72.974L238.219,73.389L243.836,74.182L245.548,77.503L246.164,79.801L246.712,82.06L248.356,84.091L252.192,84.054L255.548,84.016L259.726,83.941L263.082,83.903L264.11,85.933L264.589,87.96L266.575,92.759L269.384,96.502L270,97.847L270.479,99.902L270,100.686L269.795,101.544L271.849,103.595L275.342,105.31L276.644,105.757L278.151,106.539L276.986,107.693L279.041,110.445L281.37,113.194L283.904,113.825L287.329,118.016L292.397,120.719L295.548,124.27L295.274,124.344L294.315,123.974L293.219,123.494L292.877,123.937L292.877,125.416L293.219,127.151L294.795,128.664L296.233,129.734L296.781,131.798L295.616,136.215L295.274,136.179L294.521,135.811L293.699,135.737L293.288,135.995L294.247,139.156L295.137,141.579L296.301,143.487L297.26,146.309L298.014,147.481L301.37,150.482L302.329,152.967L303.288,157.603L305.342,160.154L306.507,162.157L308.014,163.832L308.973,166.123L310.342,167.903L311.096,168.339L312.123,168.52L313.493,168.52L315.068,168.085L316.781,167.649L318.151,168.52L319.521,168.411L319.658,169.247L318.767,170.372L317.603,173.201L319.247,173.672L320.753,173.89L321.918,174.361L322.534,174.361L322.534,174.94L322.603,177.656L323.014,178.669L323.699,179.574L324.726,180.947L325.753,182.321L326.849,183.693L327.877,185.029L328.904,186.4L330,187.77L331.027,189.104L332.055,190.473L333.082,191.841L334.178,193.209L335.205,194.54L336.233,195.907L337.329,197.272L338.356,198.637L339.384,199.966L340.411,201.329L341.301,202.441L342.877,202.657L343.425,202.728L344.863,202.908L347.055,203.23L350,203.589L353.425,204.055L357.26,204.556L361.37,205.094L365.616,205.667L369.863,206.24L373.904,206.777L377.74,207.279L381.233,207.744L384.11,208.138L386.37,208.424L387.808,208.603L388.288,208.675L389.795,208.889L390.068,208.818L391.37,207.171L392.74,209.498L393.904,211.429L395.479,214.109L397.192,216.929L398.836,219.604L400,221.635L399.384,223.7L398.699,225.978L398.014,228.218L397.26,230.491L396.575,232.764L395.89,235.034L395.205,237.303L394.521,239.534L393.767,241.8L393.082,244.063L392.397,246.325L391.712,248.55L391.027,250.809L390.342,253.066L389.589,255.321L388.904,257.54L388.219,259.792L387.397,262.499L385.342,263.202L382.123,264.361L378.836,265.52L375.548,266.679L372.26,267.872L368.973,269.03L365.753,270.187L362.466,271.344L359.178,272.501L355.89,273.657L352.603,274.812L349.384,275.968L346.096,277.123L342.808,278.277L339.521,279.431L336.301,280.585L333.014,281.738ZM37.671,144.404L37.466,144.697L36.644,143.927L36.712,142.313L37.397,141.396L37.329,142.643L37.671,143.927Z`;

  function countryOutlinePath(country) {
    if (window.TaagerGeo && typeof window.TaagerGeo.outline === "function") {
      return window.TaagerGeo.outline(country);
    }
    return SAUDI_PATH;
  }

  function activeCodCountry() {
    return data && data.meta && data.meta.activeCountry || window.dashboardActiveCountry || "sa";
  }

  // ── City Breakdown HTML ──────────────────────────────────────────────────
  function cityBreakdownHTML() {
    const activeMapShape = window.TaagerGeo && typeof window.TaagerGeo.shape === "function"
      ? window.TaagerGeo.shape(activeCodCountry())
      : { outline: countryOutlinePath(activeCodCountry()), regions: [] };
    const activeMapPath = activeMapShape.outline;
    const isMixedCountry = activeCodCountry() === "mixed";
    const countryGroups = data && data.meta && Array.isArray(data.meta.countryGroups) ? data.meta.countryGroups : [];
    const mixedMaps = isMixedCountry && countryGroups.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:16px">${countryGroups.map((group, groupIdx) => {
          const code = String(group.country || "sa").toLowerCase();
          const miniShape = window.TaagerGeo && typeof window.TaagerGeo.shape === "function"
            ? window.TaagerGeo.shape(code)
            : { outline: countryOutlinePath(code), regions: [] };
          const miniId = "s4mix_" + code + "_" + groupIdx;
          const cities = D.allCities.filter((city) => String(city.country || "").toLowerCase() === code).slice(0, 8);
          const maxDue = Math.max(...cities.map((city) => Number(city.due || 0)), 1);
          const dots = cities.map((city, idx) => {
            const point = window.TaagerGeo && window.TaagerGeo.cityPoint ? window.TaagerGeo.cityPoint(city.name, code, idx) : { x: 180, y: 170 };
            const r = 3 + (Number(city.due || 0) / maxDue) * 5;
            return `<circle cx="${point.x}" cy="${point.y}" r="${r}" fill="${rateColor(city.pct || 0)}" stroke="#fff" stroke-width="1"><title>${esc(city.name)}</title></circle>`;
          }).join("");
          const miniProvinceMap = window.TaagerGeo && typeof window.TaagerGeo.provinceMap === "function"
            ? window.TaagerGeo.provinceMap(code)
            : {};
          const miniProvinces = Object.keys(miniProvinceMap).filter((pid) => pid !== "other").map((pid) => miniProvinceMap[pid]);
          const miniGlowDefs = miniProvinces.map((p) =>
            `<radialGradient id="${miniId}_glow_${p.id}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="${p.color}" stop-opacity=".35"/>
              <stop offset="72%" stop-color="${p.color}" stop-opacity=".10"/>
              <stop offset="100%" stop-color="${p.color}" stop-opacity="0"/>
            </radialGradient>`
          ).join("");
          const miniGlows = miniProvinces.map((p) =>
            `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx || 38}" ry="${p.ry || 28}" fill="url(#${miniId}_glow_${p.id})" clip-path="url(#${miniId}_clip)" opacity=".92"/>`
          ).join("");
          const label = window.TaagerCountry && window.TaagerCountry.label ? window.TaagerCountry.label(code) : code.toUpperCase();
          return `<div style="border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:9px;background:rgba(255,255,255,.025)">
            <div style="display:flex;justify-content:space-between;gap:8px;color:#fff;font-size:10px;font-weight:800"><span>${esc(label)}</span><span>${Number(group.nativeAmountDue || 0).toLocaleString("en-US")} ${esc(group.currency || "")}</span></div>
            <svg class="dash-country-map dash-country-map--compact" viewBox="${window.TaagerGeo && window.TaagerGeo.viewBox ? window.TaagerGeo.viewBox(code) : "0 0 400 340"}" style="width:100%;height:130px">
              <defs><clipPath id="${miniId}_clip"><path d="${miniShape.outline}"/></clipPath><filter id="${miniId}_shadow" x="-25%" y="-25%" width="150%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#020617" flood-opacity=".65"/></filter>${miniGlowDefs}</defs>
              <path d="${miniShape.outline}" fill="rgba(20,184,166,.09)" stroke="rgba(20,184,166,.55)" stroke-width="2" filter="url(#${miniId}_shadow)"/>
              ${miniGlows}
              <path d="${miniShape.outline}" fill="none" stroke="rgba(94,234,212,.65)" stroke-width="1.7"/>
              ${dots}
            </svg>
          </div>`;
        }).join("")}</div>`
      : "";
    const citiesRows = D.cities
      .map((c, i) => {
        var cityRateColor = rateColor(c.pct || 0);
        return `
      <div style="
          display:grid;grid-template-columns:1.4fr 1fr 1.1fr 0.9fr 1fr;
          align-items:center;padding:12px 14px;font-size:13px;gap:6px;
          flex-direction:row;
          ${i < D.cities.length - 1 ? "border-bottom:1px solid rgba(255,255,255,0.05)" : ""}">
        <div style="display:flex;align-items:center;gap:8px;justify-content:flex-start;flex-direction:row;min-width:0;">
          <span style="color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(c.name)}">${esc(c.name)}</span>
          <div style="width:22px;height:4px;border-radius:9999px;
                      background:rgba(20,184,166,0.2);overflow:hidden;flex-shrink:0;margin-left:4px">
            <div class="s4-city-bar" data-pct="${c.pct}"
                 style="height:100%;width:0%;background:#14b8a6;
                        box-shadow:0 0 6px #14b8a6;
                        transition:width 0.35s ease-out"></div>
          </div>
        </div>
        <div style="color:rgba(255,255,255,0.9);text-align:right;font-weight:600">
          ${c.due.toLocaleString("en-US")}
        </div>
        <div style="color:rgba(255,255,255,0.9);text-align:right">
          ${c.collected.toLocaleString("en-US")}
        </div>
        <div style="color:#ef4444;text-align:right;font-weight:700">${c.gap.toLocaleString("en-US")}</div>
        <div style="color:${cityRateColor};text-align:right;font-weight:700;
                    text-shadow:0 0 8px ${cityRateColor}55">
          ${c.pct.toFixed(1)}%
        </div>
      </div>`;
      })
      .join("");

    const maxDue = Math.max(...D.cities.map((c) => parseFloat(c.due || 0)), 1);
    const cityDots = D.cities
      .map((c) => {
        const dueVal = parseFloat(c.due || 0);
        const r = 3 + (dueVal / maxDue) * 6; // min 3, max 9
        const cx = parseFloat(c.x || 150);
        const cy = parseFloat(c.y || 150);
        const cRateColor = rateColor(c.pct || 0);
        return `
        <g class="s4-city-dot" data-name="${esc(c.name)}" data-due="${c.due}" data-coll="${c.collected}" data-pct="${c.pct}" data-cx="${cx}" data-cy="${cy}" style="cursor:pointer; outline: none; pointer-events:all;">
          <circle cx="${cx}" cy="${cy}" r="${r * 2.5}" fill="${cRateColor}" opacity="0.15"
                  style="pointer-events:none;"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="${cRateColor}" stroke="#fff" stroke-width="1"
                  style="pointer-events:none;"/>
          <!-- Invisible larger circle for easier hover -->
          <circle cx="${cx}" cy="${cy}" r="${Math.max(15, r * 2.5)}" fill="transparent" />
        </g>`;
      })
      .join("");
    const lightMode =
      (document.documentElement.getAttribute("data-theme") ||
        window._kbotTheme) === "light";
    const _s4MapUid = Date.now();
    const _s4BgId = "s4mapfill_" + _s4MapUid;
    const mapStop1 = lightMode ? "#eef4ff" : "#0f1e3d";
    const mapStop2 = lightMode ? "#dbeafe" : "#0a1528";
    const mapStop3 = lightMode ? "#e8f0fb" : "#060e1c";
    const mapStroke = lightMode ? "#9fb5d4" : "#14b8a6";
    const mapFilter = lightMode
      ? "drop-shadow(0 14px 28px rgba(15,23,42,0.08))"
      : "drop-shadow(0 0 18px rgba(20,184,166,0.25)) drop-shadow(0 0 6px rgba(20,184,166,0.15))";
    const tooltipBg = lightMode ? "#ffffff" : "rgba(11, 17, 32, 0.9)";
    const tooltipBorder = lightMode
      ? "rgba(15, 23, 42, 0.14)"
      : "rgba(255, 255, 255, 0.1)";
    const tooltipText = lightMode ? "#0f172a" : "white";
    const provinceGlowMap = window.TaagerGeo && typeof window.TaagerGeo.provinceMap === "function"
      ? window.TaagerGeo.provinceMap(activeCodCountry())
      : {};
    const provinceGlows = Object.keys(provinceGlowMap).filter((pid) => pid !== "other").map((pid) => provinceGlowMap[pid]);
    const provinceGlowDefs = provinceGlows.map((p) =>
      `<radialGradient id="s4-prov-${_s4MapUid}-${p.id}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${p.color}" stop-opacity=".34"/>
        <stop offset="72%" stop-color="${p.color}" stop-opacity=".10"/>
        <stop offset="100%" stop-color="${p.color}" stop-opacity="0"/>
      </radialGradient>`
    ).join("");
    const regionGlows = provinceGlows.map((p) =>
      `<ellipse class="s4-region-shape" cx="${p.x}" cy="${p.y}" rx="${p.rx || 38}" ry="${p.ry || 28}" fill="url(#s4-prov-${_s4MapUid}-${p.id})" clip-path="url(#s4MapClip_${_s4MapUid})" opacity=".95" style="mix-blend-mode:screen"/>`
    ).join("");

    return `
      <div class="fade-up" style="animation-delay:200ms;
          background:#0b1120;border:1px solid rgba(255,255,255,0.1);
          border-radius:16px;padding:24px">
        <div style="display:flex;align-items:center;gap:10px;justify-content:${isAr ? "flex-end" : "flex-start"};
                    margin-bottom:16px;flex-direction:${isAr ? "row" : "row-reverse"}">
          ${svgIcon("mapPin", 18, "#14b8a6")}
          <span style="font-size:18px;font-weight:800;color:#fff">${s4Txt("DR & Collection Breakdown by City", "تفصيل DR والتحصيل حسب المدينة")}</span>
        </div>
        ${mixedMaps}
        <div class="s4-map-row" style="display:flex;flex-direction:row;gap:24px;align-items:stretch">
          <!-- Map (left) -->
          <div class="s4-map" style="flex-shrink:0;width:320px;display:${isMixedCountry ? "none" : "flex"};align-items:center;
                      justify-content:center;min-height:0;position:relative">
            <div id="s4-map-tooltip" style="
              position: absolute;
              left: 0;
              top: 0;
              opacity: 0;
              visibility: hidden;
              pointer-events: none;
              background: ${tooltipBg};
              border: 1px solid ${tooltipBorder};
              min-width: 220px;
              padding: 12px 15px;
              border-radius: 11px;
              box-shadow: 0 8px 24px rgba(0,0,0,0.42);
              z-index: 100;
              transform: translate3d(-9999px, -9999px, 0);
              will-change: transform, opacity;
              contain: layout paint;
              color: ${tooltipText};
              font-size: 13px;
              white-space: nowrap;
              text-align: ${isAr ? "right" : "left"};
              direction: ${isAr ? "rtl" : "ltr"};
            "></div>
            <svg class="dash-country-map" width="100%" height="100%" viewBox="0 0 400 340"
                 style="overflow:visible;position:relative;z-index:10">
              <defs>
              <linearGradient id="${_s4BgId}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stop-color="${mapStop1}"/>
                  <stop offset="50%"  stop-color="${mapStop2}"/>
                  <stop offset="100%" stop-color="${mapStop3}"/>
                </linearGradient>
                <linearGradient id="s4MapSheen_${_s4MapUid}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#fff" stop-opacity="${lightMode ? "0.42" : "0.16"}"/>
                  <stop offset="48%" stop-color="#fff" stop-opacity="0"/>
                  <stop offset="100%" stop-color="#14b8a6" stop-opacity="${lightMode ? "0.08" : "0.14"}"/>
                </linearGradient>
                <clipPath id="s4MapClip_${_s4MapUid}"><path d="${activeMapPath}"/></clipPath>
                <filter id="s4MapShadow_${_s4MapUid}" x="-30%" y="-30%" width="160%" height="180%">
                  <feDropShadow dx="0" dy="11" stdDeviation="9" flood-color="${lightMode ? "#0f172a" : "#020617"}" flood-opacity="${lightMode ? "0.22" : "0.75"}"/>
                  <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${lightMode ? "#3b82f6" : "#14b8a6"}" flood-opacity="${lightMode ? "0.12" : "0.22"}"/>
                </filter>
                ${provinceGlowDefs}
              </defs>
              <path d="${activeMapPath}"
                   fill="url(#${_s4BgId})" stroke="${mapStroke}" stroke-width="1.5" stroke-opacity="${lightMode ? "0.85" : "0.4"}"
                    filter="url(#s4MapShadow_${_s4MapUid})" style="filter:${mapFilter}"/>
              ${regionGlows}
              <path d="${activeMapPath}" fill="url(#s4MapSheen_${_s4MapUid})" pointer-events="none"/>
              <path d="${activeMapPath}" fill="none" stroke="${mapStroke}" stroke-width="2.1" stroke-opacity="${lightMode ? "0.95" : "0.7"}" pointer-events="none"/>
              ${cityDots}
            </svg>
          </div>
          <!-- Table (right) -->
          <div class="s4-table-scroll" style="flex:1;min-width:0;overflow-x:auto">
            <div style="min-width:420px">
              <div style="display:grid;grid-template-columns:1.4fr 1fr 1.1fr 0.9fr 1fr;
                          padding:10px 14px;font-size:11px;font-weight:700;
                          color:rgba(255,255,255,0.45);
                          border-bottom:1px solid rgba(255,255,255,0.05);
                          gap:6px;flex-direction:${isAr ? "row" : "row-reverse"};text-align:${isAr ? "right" : "left"}">
                <div>${s4Txt("City", "المدينة")}</div>
                <div>${s4Txt("Expected", "المتوقع")} (${activeCurrency})</div>
                <div>${s4Txt("Collected", "تم التحصيل")} (${activeCurrency})</div>
                <div>${s4Txt("Gap", "الفجوة")}</div>
                <div>DR</div>
              </div>
              ${citiesRows}
              <button id="s4-cities-btn" style="
                  margin-top:16px;width:100%;display:flex;align-items:center;
                  justify-content:center;gap:8px;padding:12px;border-radius:12px;
                  background:linear-gradient(135deg, rgba(20,184,166,0.1), rgba(37,99,235,0.1));
                  border:1px solid rgba(20,184,166,0.25);
                  color:#14b8a6;font-size:13px;font-weight:800;
                  cursor:pointer;flex-direction:${isAr ? "row" : "row-reverse"};
                  box-shadow:0 4px 14px rgba(0,0,0,0.2);
                  transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                  position:relative;overflow:hidden">
                ${svgIcon("chevronLeft", 14, "rgba(255,255,255,0.6)")}
                <span>${D.totalCitiesCount > 0 ? s4Txt("Show all cities (", "عرض جميع المدن (") + D.totalCitiesCount + ")" : s4Txt("Show cities map", "عرض خريطة المدن")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function amountRepairReportHTML() {
    var report = D.amountRepairReport;
    if (!report || !report.totalMissing) return "";
    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[ch];
      });
    }
    function money(v) {
      return Number(v || 0).toLocaleString("en-US") + " " + activeCurrency;
    }
    function cell(content, extra) {
      return (
        '<td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.055);vertical-align:middle;' +
        (extra || "") +
        '">' +
        content +
        "</td>"
      );
    }
    function confidenceBadge(refs) {
      var color = refs >= 10 ? "#00e676" : refs >= 2 ? "#f59e0b" : "#f43f5e";
      var label = refs >= 10 ? "High" : refs >= 2 ? "Medium" : "Low";
      return (
        '<span style="display:inline-flex;justify-content:center;min-width:64px;padding:4px 8px;border-radius:999px;background:' +
        color +
        "18;border:1px solid " +
        color +
        "45;color:" +
        color +
        ';font-size:11px;font-weight:800">' +
        label +
        "</span>"
      );
    }
    function metricCard(label, value, sub, color) {
      return (
        '<div style="min-width:0;background:' +
        color +
        "12;border:1px solid " +
        color +
        '35;border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
        '<div style="min-width:0;text-align:right"><div style="font-size:11px;color:rgba(255,255,255,0.48);font-weight:700;margin-bottom:5px">' +
        label +
        '</div><div style="font-size:11px;color:rgba(255,255,255,0.36);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        sub +
        "</div></div>" +
        '<div style="font-size:24px;line-height:1;font-weight:900;color:' +
        color +
        ';font-variant-numeric:tabular-nums;white-space:nowrap">' +
        value +
        "</div>" +
        "</div>"
      );
    }
    function filledRows(rows) {
      rows = rows || [];
      if (!rows.length)
        return '<tr><td colspan="9" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No filled orders</td></tr>';
      return rows
        .slice(0, 7)
        .map(function (r) {
          return (
            "<tr>" +
            cell(
              '<span style="color:#60a5fa;font-weight:800">#' +
                esc(r.order || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<div style="max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
                esc(r.product || "-") +
                '">' +
                esc(r.product || "-") +
                "</div>",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(54,4,83,0.75)"
                  : "#cbd5e1") +
                '">' +
                esc(r.sku || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-weight:800;color:#fff">' +
                esc(r.qty || 1) +
                "</span>",
              "text-align:center",
            ) +
            cell(
              '<span style="font-weight:900;color:#fff">' +
                money(r.amount) +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(54,4,83,0.75)"
                  : "#cbd5e1") +
                ';font-weight:800">' +
                Number(r.referenceCount || 0).toLocaleString("en-US") +
                "</span>",
              "text-align:center",
            ) +
            cell(
              confidenceBadge(Number(r.referenceCount || 0)),
              "text-align:center",
            ) +
            cell(
              '<span style="color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(30,10,60,0.85)"
                  : "#e2e8f0") +
                ';font-weight:700">' +
                esc(r.customerName || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(29,78,216,0.85)"
                  : "#93c5fd") +
                '">' +
                esc(r.phone || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            "</tr>"
          );
        })
        .join("");
    }
    function unfilledRows(rows) {
      rows = rows || [];
      if (!rows.length)
        return '<tr><td colspan="8" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No unfilled orders</td></tr>';
      return rows
        .slice(0, 7)
        .map(function (r) {
          return (
            "<tr>" +
            cell(
              '<span style="color:#60a5fa;font-weight:800">#' +
                esc(r.order || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<div style="max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
                esc(r.product || "-") +
                '">' +
                esc(r.product || "-") +
                "</div>",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(54,4,83,0.75)"
                  : "#cbd5e1") +
                '">' +
                esc(r.sku || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-weight:800;color:#fff">' +
                esc(r.qty || 1) +
                "</span>",
              "text-align:center",
            ) +
            cell(
              '<span style="display:inline-flex;padding:4px 9px;border-radius:999px;background:rgba(244,63,94,0.14);border:1px solid rgba(244,63,94,0.35);color:#fb7185;font-weight:900">0 ' + activeCurrency + '</span>',
              "white-space:nowrap",
            ) +
            cell(
              '<span style="color:#fda4af;font-weight:700">' +
                esc(r.reason || "No SKU+qty reference amount found") +
                "</span>",
            ) +
            cell(
              '<span style="color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(30,10,60,0.85)"
                  : "#e2e8f0") +
                ';font-weight:700">' +
                esc(r.customerName || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(29,78,216,0.85)"
                  : "#93c5fd") +
                '">' +
                esc(r.phone || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            "</tr>"
          );
        })
        .join("");
    }
    var filledLimitText =
      (report.filledRows || []).length.toLocaleString("en-US") + " rows";
    var unfilledLimitText =
      (report.unfilledRows || []).length.toLocaleString("en-US") + " rows";
    return `<div class="fade-up" style="margin-top:18px;background:#0b1120;border:1px solid rgba(96,165,250,0.16);border-radius:16px;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,0.18)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px">
        <div style="font-size:18px;font-weight:900;color:#fff">${s4Txt("Collection Amount Fill Report", "تقرير تعبئة المطلوب تحصيله")}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.55)">${s4Txt("Delivered only", "المسلمة فقط")}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px">
        ${metricCard(s4Txt("Missing", "فارغ"), report.totalMissing.toLocaleString("en-US"), "Delivered rows", "#94a3b8")}
        ${metricCard(s4Txt("Filled", "تمت التعبئة"), report.filledCount.toLocaleString("en-US"), "Used SKU + Qty mode", "#00e676")}
        ${metricCard(s4Txt("Unfilled", "لم يتم التعبئة"), report.unfilledCount.toLocaleString("en-US"), "Counted as 0 " + activeCurrency, "#f43f5e")}
        ${metricCard(s4Txt("Fill rate", "Fill rate"), Number(report.fillRate || 0).toFixed(1) + "%", "Auto repair success", "#3b82f6")}
      </div>
      <div style="margin-bottom:14px;position:relative">
        <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#64748b;font-size:12px">🔍</span>
        <input id="s4-repair-search" type="text" placeholder="${s4Txt("Search by order, product, SKU, customer name, phone or reason", "ابحث بالاوردر، المنتج، SKU، اسم العميل، الهاتف أو السبب")}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:11px 38px 11px 14px;color:#fff;font-family:inherit;font-size:13px;outline:none; text-align:right" autocomplete="off" spellcheck="false">
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;align-items:stretch">
        <div style="min-width:0;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.07)">
            <div style="font-size:14px;font-weight:900;color:#00e676">${s4Txt("Filled orders", "الطلبات المعبأة")}</div><div style="font-size:11px;color:rgba(255,255,255,0.45);font-weight:700">${filledLimitText}</div>
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:1080px;font-size:12px;text-align:right"><thead style="background:#111827"><tr style="color:#8892a4;text-transform:uppercase;letter-spacing:0;font-size:10px"><th data-s4-sort-table="filled" data-s4-sort-key="order" style="padding:11px 14px;cursor:pointer">${s4Txt("Order ↕", "الطلب ↕")}</th><th data-s4-sort-table="filled" data-s4-sort-key="product" style="padding:11px 14px;cursor:pointer">${s4Txt("Product ↕", "المنتج ↕")}</th><th data-s4-sort-table="filled" data-s4-sort-key="sku" style="padding:11px 14px;cursor:pointer">${s4Txt("SKU ↕", "SKU ↕")}</th><th data-s4-sort-table="filled" data-s4-sort-key="qty" style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Qty ↕", "الكمية ↕")}</th><th data-s4-sort-table="filled" data-s4-sort-key="amount" style="padding:11px 14px;cursor:pointer">${s4Txt("Amount ↕", "المبلغ ↕")}</th><th data-s4-sort-table="filled" data-s4-sort-key="refs" title="Refs = number of other rows in the sheet with the same SKU + quantity used to choose the filled amount. More refs means higher confidence." style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Refs (?) ↕", "المرجع (?) ↕")}</th><th data-s4-sort-table="filled" data-s4-sort-key="confidence" style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Confidence ↕", "الثقة ↕")}</th><th style="padding:11px 14px">${s4Txt("Customer", "العميل")}</th><th style="padding:11px 14px">${s4Txt("Phone", "الهاتف")}</th></tr></thead><tbody id="s4-filled-report-body">${filledRows(report.filledRows)}</tbody></table></div><div id="s4-filled-pagination" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid rgba(255,255,255,0.07);flex-direction:row-reverse"></div>
        </div>
        <div style="min-width:0;background:rgba(244,63,94,0.045);border:1px solid rgba(244,63,94,0.20);border-radius:14px;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(244,63,94,0.18)">
            <div style="font-size:14px;font-weight:900;color:#fb7185">${s4Txt("Unfilled orders", "الطلبات غير المعبأة")}</div><div style="font-size:11px;color:rgba(255,255,255,0.45);font-weight:700">${unfilledLimitText}</div>
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:820px;font-size:12px;text-align:right"><thead style="background:#1a111a"><tr style="color:#9ca3af;text-transform:uppercase;font-size:10px"><th data-s4-sort-table="unfilled" data-s4-sort-key="order" style="padding:11px 14px;cursor:pointer">${s4Txt("Order ↕", "الطلب ↕")}</th><th data-s4-sort-table="unfilled" data-s4-sort-key="product" style="padding:11px 14px;cursor:pointer">${s4Txt("Product ↕", "المنتج ↕")}</th><th data-s4-sort-table="unfilled" data-s4-sort-key="sku" style="padding:11px 14px;cursor:pointer">${s4Txt("SKU ↕", "SKU ↕")}</th><th data-s4-sort-table="unfilled" data-s4-sort-key="qty" style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Qty ↕", "الكمية ↕")}</th><th data-s4-sort-table="unfilled" data-s4-sort-key="amount" style="padding:11px 14px;cursor:pointer">${s4Txt("Counted ↕", "المبلغ المحتسب ↕")}</th><th data-s4-sort-table="unfilled" data-s4-sort-key="reason" style="padding:11px 14px;cursor:pointer">${s4Txt("Reason ↕", "السبب ↕")}</th><th style="padding:11px 14px">${s4Txt("Customer", "العميل")}</th><th style="padding:11px 14px">${s4Txt("Phone", "الهاتف")}</th></tr></thead><tbody id="s4-unfilled-report-body">${unfilledRows(report.unfilledRows)}</tbody></table></div><div id="s4-unfilled-pagination" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid rgba(244,63,94,0.18);flex-direction:row-reverse"></div>
        </div>
      </div>
    </div>`;
  }

  function totalSalesRepairReportHTML() {
    var report = D.totalSalesRepairReport;
    if (!report || !report.totalMissing) return "";
    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[ch];
      });
    }
    function money(v) {
      return Number(v || 0).toLocaleString("en-US") + " " + activeCurrency;
    }
    function cell(content, extra) {
      return (
        '<td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.055);vertical-align:middle;' +
        (extra || "") +
        '">' +
        content +
        "</td>"
      );
    }
    function confidenceBadge(refs) {
      var color = refs >= 10 ? "#00e676" : refs >= 2 ? "#f59e0b" : "#f43f5e";
      var label = refs >= 10 ? "High" : refs >= 2 ? "Medium" : "Low";
      return (
        '<span style="display:inline-flex;justify-content:center;min-width:64px;padding:4px 8px;border-radius:999px;background:' +
        color +
        "18;border:1px solid " +
        color +
        "45;color:" +
        color +
        ';font-size:11px;font-weight:800">' +
        label +
        "</span>"
      );
    }
    function metricCard(label, value, sub, color) {
      return (
        '<div style="min-width:0;background:' +
        color +
        "12;border:1px solid " +
        color +
        '35;border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
        '<div style="min-width:0;text-align:right"><div style="font-size:11px;color:rgba(255,255,255,0.48);font-weight:700;margin-bottom:5px">' +
        label +
        '</div><div style="font-size:11px;color:rgba(255,255,255,0.36);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        sub +
        "</div></div>" +
        '<div style="font-size:24px;line-height:1;font-weight:900;color:' +
        color +
        ';font-variant-numeric:tabular-nums;white-space:nowrap">' +
        value +
        "</div>" +
        "</div>"
      );
    }
    function filledRows(rows) {
      rows = rows || [];
      if (!rows.length)
        return '<tr><td colspan="9" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No filled orders</td></tr>';
      return rows
        .slice(0, 7)
        .map(function (r) {
          return (
            "<tr>" +
            cell(
              '<span style="color:#60a5fa;font-weight:800">#' +
                esc(r.order || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<div style="max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
                esc(r.product || "-") +
                '">' +
                esc(r.product || "-") +
                "</div>",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(54,4,83,0.75)"
                  : "#cbd5e1") +
                '">' +
                esc(r.sku || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-weight:800;color:#fff">' +
                esc(r.qty || 1) +
                "</span>",
              "text-align:center",
            ) +
            cell(
              '<span style="font-weight:900;color:#fff">' +
                money(r.amount) +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(54,4,83,0.75)"
                  : "#cbd5e1") +
                ';font-weight:800">' +
                Number(r.referenceCount || 0).toLocaleString("en-US") +
                "</span>",
              "text-align:center",
            ) +
            cell(
              confidenceBadge(Number(r.referenceCount || 0)),
              "text-align:center",
            ) +
            cell(
              '<span style="color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(30,10,60,0.85)"
                  : "#e2e8f0") +
                ';font-weight:700">' +
                esc(r.customerName || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(29,78,216,0.85)"
                  : "#93c5fd") +
                '">' +
                esc(r.phone || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            "</tr>"
          );
        })
        .join("");
    }
    function unfilledRows(rows) {
      rows = rows || [];
      if (!rows.length)
        return '<tr><td colspan="8" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No unfilled orders</td></tr>';
      return rows
        .slice(0, 7)
        .map(function (r) {
          return (
            "<tr>" +
            cell(
              '<span style="color:#60a5fa;font-weight:800">#' +
                esc(r.order || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<div style="max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
                esc(r.product || "-") +
                '">' +
                esc(r.product || "-") +
                "</div>",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(54,4,83,0.75)"
                  : "#cbd5e1") +
                '">' +
                esc(r.sku || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-weight:800;color:#fff">' +
                esc(r.qty || 1) +
                "</span>",
              "text-align:center",
            ) +
            cell(
              '<span style="display:inline-flex;padding:4px 9px;border-radius:999px;background:rgba(244,63,94,0.14);border:1px solid rgba(244,63,94,0.35);color:#fb7185;font-weight:900">0 ' + activeCurrency + '</span>',
              "white-space:nowrap",
            ) +
            cell(
              '<span style="color:#fda4af;font-weight:700">' +
                esc(r.reason || "No SKU+qty reference price found") +
                "</span>",
            ) +
            cell(
              '<span style="color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(30,10,60,0.85)"
                  : "#e2e8f0") +
                ';font-weight:700">' +
                esc(r.customerName || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            cell(
              '<span style="font-family:Consolas,monospace;color:' +
                ((document.documentElement.getAttribute("data-theme") ||
                  window._kbotTheme) === "light"
                  ? "rgba(29,78,216,0.85)"
                  : "#93c5fd") +
                '">' +
                esc(r.phone || "-") +
                "</span>",
              "white-space:nowrap",
            ) +
            "</tr>"
          );
        })
        .join("");
    }
    var filledLimitText =
      (report.filledRows || []).length.toLocaleString("en-US") + " rows";
    var unfilledLimitText =
      (report.unfilledRows || []).length.toLocaleString("en-US") + " rows";
    return `<div class="fade-up" style="margin-top:18px;background:#0b1120;border:1px solid rgba(96,165,250,0.16);border-radius:16px;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,0.18)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px">
        <div style="font-size:18px;font-weight:900;color:#fff">${s4Txt("Total Sales Amount Fill Report", "تقرير تعبئة المبيعات الإجمالية")}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.55)">${s4Txt("All orders", "جميع الطلبات")}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px">
        ${metricCard(s4Txt("Missing", "فارغ"), report.totalMissing.toLocaleString("en-US"), "All orders rows", "#94a3b8")}
        ${metricCard(s4Txt("Filled", "تمت التعبئة"), report.filledCount.toLocaleString("en-US"), "Used SKU + Qty mode", "#00e676")}
        ${metricCard(s4Txt("Unfilled", "لم يتم التعبئة"), report.unfilledCount.toLocaleString("en-US"), "Counted as 0 " + activeCurrency, "#f43f5e")}
        ${metricCard(s4Txt("Fill rate", "Fill rate"), Number(report.fillRate || 0).toFixed(1) + "%", "Auto repair success", "#3b82f6")}
      </div>
      <div style="margin-bottom:14px;position:relative">
        <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#64748b;font-size:12px">🔍</span>
        <input id="s4-sales-repair-search" type="text" placeholder="${s4Txt("Search by order, product, SKU, customer name, phone or reason", "ابحث بالاوردر، المنتج، SKU، اسم العميل، الهاتف أو السبب")}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:11px 38px 11px 14px;color:#fff;font-family:inherit;font-size:13px;outline:none; text-align:right" autocomplete="off" spellcheck="false">
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;align-items:stretch">
        <div style="min-width:0;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.07)">
            <div style="font-size:14px;font-weight:900;color:#00e676">${s4Txt("Filled sales orders", "مبيعات الطلبات المعبأة")}</div><div style="font-size:11px;color:rgba(255,255,255,0.45);font-weight:700">${filledLimitText}</div>
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:1080px;font-size:12px;text-align:right"><thead style="background:#111827"><tr style="color:#8892a4;text-transform:uppercase;letter-spacing:0;font-size:10px"><th data-s4-sales-sort-table="filled" data-s4-sales-sort-key="order" style="padding:11px 14px;cursor:pointer">${s4Txt("Order ↕", "الطلب ↕")}</th><th data-s4-sales-sort-table="filled" data-s4-sales-sort-key="product" style="padding:11px 14px;cursor:pointer">${s4Txt("Product ↕", "المنتج ↕")}</th><th data-s4-sales-sort-table="filled" data-s4-sales-sort-key="sku" style="padding:11px 14px;cursor:pointer">${s4Txt("SKU ↕", "SKU ↕")}</th><th data-s4-sales-sort-table="filled" data-s4-sales-sort-key="qty" style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Qty ↕", "الكمية ↕")}</th><th data-s4-sales-sort-table="filled" data-s4-sales-sort-key="amount" style="padding:11px 14px;cursor:pointer">${s4Txt("Amount ↕", "المبلغ ↕")}</th><th data-s4-sales-sort-table="filled" data-s4-sales-sort-key="refs" title="Refs = number of other rows in the sheet with the same SKU + quantity used to choose the filled amount. More refs means higher confidence." style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Refs (?) ↕", "المرجع (?) ↕")}</th><th data-s4-sales-sort-table="filled" data-s4-sales-sort-key="confidence" style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Confidence ↕", "الثقة ↕")}</th><th style="padding:11px 14px">${s4Txt("Customer", "العميل")}</th><th style="padding:11px 14px">${s4Txt("Phone", "الهاتف")}</th></tr></thead><tbody id="s4-sales-filled-report-body">${filledRows(report.filledRows)}</tbody></table></div><div id="s4-sales-filled-pagination" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid rgba(255,255,255,0.07);flex-direction:row-reverse"></div>
        </div>
        <div style="min-width:0;background:rgba(244,63,94,0.045);border:1px solid rgba(244,63,94,0.20);border-radius:14px;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(244,63,94,0.18)">
            <div style="font-size:14px;font-weight:900;color:#fb7185">${s4Txt("Unfilled sales orders", "مبيعات الطلبات غير المعبأة")}</div><div style="font-size:11px;color:rgba(255,255,255,0.45);font-weight:700">${unfilledLimitText}</div>
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:820px;font-size:12px;text-align:right"><thead style="background:#1a111a"><tr style="color:#9ca3af;text-transform:uppercase;font-size:10px"><th data-s4-sales-sort-table="unfilled" data-s4-sales-sort-key="order" style="padding:11px 14px;cursor:pointer">${s4Txt("Order ↕", "الطلب ↕")}</th><th data-s4-sales-sort-table="unfilled" data-s4-sales-sort-key="product" style="padding:11px 14px;cursor:pointer">${s4Txt("Product ↕", "المنتج ↕")}</th><th data-s4-sales-sort-table="unfilled" data-s4-sales-sort-key="sku" style="padding:11px 14px;cursor:pointer">${s4Txt("SKU ↕", "SKU ↕")}</th><th data-s4-sales-sort-table="unfilled" data-s4-sales-sort-key="qty" style="padding:11px 14px;text-align:center;cursor:pointer">${s4Txt("Qty ↕", "الكمية ↕")}</th><th data-s4-sales-sort-table="unfilled" data-s4-sales-sort-key="amount" style="padding:11px 14px;cursor:pointer">${s4Txt("Counted ↕", "المبلغ المحتسب ↕")}</th><th data-s4-sales-sort-table="unfilled" data-s4-sales-sort-key="reason" style="padding:11px 14px;cursor:pointer">${s4Txt("Reason ↕", "السبب ↕")}</th><th style="padding:11px 14px">${s4Txt("Customer", "العميل")}</th><th style="padding:11px 14px">${s4Txt("Phone", "الهاتف")}</th></tr></thead><tbody id="s4-sales-unfilled-report-body">${unfilledRows(report.unfilledRows)}</tbody></table></div><div id="s4-sales-unfilled-pagination" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid rgba(244,63,94,0.18);flex-direction:row-reverse"></div>
        </div>
      </div>
    </div>`;
  }

  // ── ASSEMBLE full section HTML ───────────────────────────────────────────
  mountEl.innerHTML = `
    <div class="s4-body dash-scroll" dir="${isAr ? "rtl" : "ltr"}" style="
        flex:1;overflow-y:auto;background:#080b12;display:flex;
        flex-direction:column;color:#fff;font-family:'Cairo',sans-serif">

      <!-- Page header -->
      <div style="padding:28px 32px 16px;text-align:center">
        <h1 class="fade-up" style="
            font-size:30px;font-weight:900;color:#fff;margin:0;
            animation-delay:0ms">
          ${s4Txt("COD Collection Tracking", "تتبع تحصيل COD")}
        </h1>
        <div class="fade-up" style="
            display:flex;align-items:center;gap:6px;font-size:12px;
            color:rgba(255,255,255,0.45);margin-top:8px;justify-content:center;
            flex-direction:${isAr ? "row" : "row-reverse"};animation-delay:100ms">
          ${s4Txt("Total amounts for delivered orders only", "إجمالي المبالغ للطلبات المُسلَمة فقط")}
          ${svgIcon("info", 14, "#3b82f6")}
        </div>
      </div>

      <!-- Main content -->
      <div style="padding:0 32px 40px;flex:1;width:100%;max-width:1400px;margin:0 auto;box-sizing:border-box">

        <!-- Row 1: StatCards | COD Donut | COD Insights -->
        <div class="s4-grid-3col" style="display:grid;grid-template-columns:1fr 2fr 1.1fr;gap:18px;
                    margin-bottom:18px;direction:${isAr ? "rtl" : "ltr"}">

          <!-- Col A: StatCards -->
          <div style="display:flex;flex-direction:column;gap:14px;order:${isAr ? 3 : 1}">
            ${statCardHTML({
              id: "s4-gap",
              variant: "sparkline",
              color: "#ef4444",
              label: s4Txt("Collection Gap", "فجوة التحصيل"),
              value: D.gapSar,
              unit: activeCurrency,
              subtitle: `${D.drActiveOrders.toLocaleString("en-US")} ${s4Txt("active undelivered orders", "طلب نشط لم يتم تسليمه")}`,
              delta: D.gapDelta,
              deltaPositive: true,
              deltaIsImprovement: false,
              sparkData: D.gapSparkData,
            })}
            ${statCardHTML({
              id: "s4-days",
              variant: "icon",
              color: "#3b82f6",
              iconType: "calendar",
              label: s4Txt('Average Delivery Time', 'متوسط وقت التسليم'),
              value: D.avgDays == null ? 0 : D.avgDays,
              unit: D.avgDays == null ? "" : s4Txt("day", "يوم"),
              subtitle:
                D.avgDays == null
                  ? s4Txt(
                      "Not available in current snapshot",
                      "غير متاح في اللقطة الحالية",
                    )
                  : "",
              decimals: 1,
              delta: D.daysDelta,
              deltaPositive: false,
              deltaIsImprovement: true,
            })}
            ${statCardHTML({
              id: "s4-rate",
              variant: "icon",
              color: rateColor(D.drPct),
              iconType: "shieldCheck",
              label: "DR",
              value: D.drPct,
              unit: "%",
              decimals: 1,
              delta: D.rateDelta,
              deltaPositive: true,
              deltaIsImprovement: true,
            })}
            ${statCardHTML({
              id: "s4-ndr",
              variant: "icon",
              color: rateColor(D.ndrPct),
              iconType: "trendingUp",
              label: "NDR",
              value: D.ndrPct,
              unit: "%",
              decimals: 1,
              subtitle: `${D.drDeliveredOrders.toLocaleString("en-US")} / ${D.ndrBaseOrders.toLocaleString("en-US")} total orders`,
              deltaPositive: true,
              deltaIsImprovement: true,
            })}
          </div>

          <!-- Col B: COD Donut (order-2 in RTL = visual centre) -->
          <div style="order:2">
            ${codCollectionOverviewHTML()}
          </div>

          <!-- Col C: COD Insights (order-1 = visual left) -->
          <div style="order:${isAr ? 1 : 3}">
            ${codInsightsHTML()}
          </div>
        </div>

        <!-- Row 2: City Breakdown | Payment Methods -->
        <div class="s4-grid-2col" style="display:grid;grid-template-columns:${isAr ? "1fr 2.2fr" : "2.2fr 1fr"};gap:18px;
                    margin-top:16px;direction:${isAr ? "rtl" : "ltr"}">
          <div style="order:${isAr ? 2 : 1}">
            ${cityBreakdownHTML()}
          </div>
          <div style="order:${isAr ? 1 : 2}">
            ${paymentMethodsHTML()}
          </div>
        </div>

        ${amountRepairReportHTML()}
        ${totalSalesRepairReportHTML()}
      </div>
    </div>`;

  // ── Post-mount: animate numbers ──────────────────────────────────────────
  (function initAmountRepairReport() {
    var report = D.amountRepairReport;
    if (!report || !report.totalMissing) return;
    var input = mountEl.querySelector("#s4-repair-search");
    var filledBody = mountEl.querySelector("#s4-filled-report-body");
    var unfilledBody = mountEl.querySelector("#s4-unfilled-report-body");
    var filledPagination = mountEl.querySelector("#s4-filled-pagination");
    var unfilledPagination = mountEl.querySelector("#s4-unfilled-pagination");
    if (
      !input ||
      !filledBody ||
      !unfilledBody ||
      !filledPagination ||
      !unfilledPagination
    )
      return;

    var sortState = {
      filled: { key: "order", dir: "asc" },
      unfilled: { key: "order", dir: "asc" },
    };
    var pageSize = 7;
    var pageState = { filled: 1, unfilled: 1 };
    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[ch];
      });
    }
    function money(v) {
      return Number(v || 0).toLocaleString("en-US") + " " + activeCurrency;
    }
    function cell(content, extra) {
      return (
        '<td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.055);vertical-align:middle;' +
        (extra || "") +
        '">' +
        content +
        "</td>"
      );
    }
    function searchable(row) {
      return [
        row.order,
        row.product,
        row.sku,
        row.qty,
        row.amount,
        row.referenceCount,
        row.reason,
        row.customerName,
        row.phone,
      ]
        .join(" ")
        .toLowerCase();
    }
    function confidenceBadge(refs) {
      var color = refs >= 10 ? "#00e676" : refs >= 2 ? "#f59e0b" : "#f43f5e";
      var label = refs >= 10 ? "High" : refs >= 2 ? "Medium" : "Low";
      return (
        '<span style="display:inline-flex;justify-content:center;min-width:64px;padding:4px 8px;border-radius:999px;background:' +
        color +
        "18;border:1px solid " +
        color +
        "45;color:" +
        color +
        ';font-size:11px;font-weight:800">' +
        label +
        "</span>"
      );
    }
    function valueFor(row, key) {
      if (key === "refs" || key === "confidence")
        return Number(row.referenceCount || 0);
      if (key === "amount") return Number(row.amount || 0);
      if (key === "qty") return Number(row.qty || 0);
      return String(row[key] || "").toLowerCase();
    }
    function filterRows(rows, term) {
      if (!term) return rows.slice();
      term = term.toLowerCase();
      return rows.filter(function (row) {
        return searchable(row).indexOf(term) !== -1;
      });
    }
    function sortRows(rows, table) {
      var state = sortState[table];
      return rows.slice().sort(function (a, b) {
        var av = valueFor(a, state.key),
          bv = valueFor(b, state.key);
        var result =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return state.dir === "asc" ? result : -result;
      });
    }
    function renderFilledRow(r) {
      var refsTitle =
        "Refs = number of other rows in the sheet with the same SKU + quantity used to choose this filled amount. More refs means higher confidence.";
      return (
        "<tr>" +
        cell(
          '<span style="color:#60a5fa;font-weight:800">#' +
            esc(r.order || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<div style="max-width:640px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
            esc(r.product || "-") +
            '">' +
            esc(r.product || "-") +
            "</div>",
        ) +
        cell(
          '<span style="font-family:Consolas,monospace;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.75)"
              : "#cbd5e1") +
            '">' +
            esc(r.sku || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span style="font-weight:800;color:#fff">' +
            esc(r.qty || 1) +
            "</span>",
          "text-align:center",
        ) +
        cell(
          '<span style="font-weight:900;color:#fff">' +
            money(r.amount) +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span title="' +
            esc(refsTitle) +
            '" style="color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.75)"
              : "#cbd5e1") +
            ";font-weight:800;text-decoration:underline dotted " +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.45)"
              : "rgba(148,163,184,0.65)") +
            ';cursor:help">' +
            Number(r.referenceCount || 0).toLocaleString("en-US") +
            "</span>",
          "text-align:center",
        ) +
        cell(
          confidenceBadge(Number(r.referenceCount || 0)),
          "text-align:center",
        ) +
        cell(
          '<span style="color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(30,10,60,0.85)"
              : "#e2e8f0") +
            ';font-weight:700">' +
            esc(r.customerName || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span style="font-family:Consolas,monospace;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(29,78,216,0.85)"
              : "#93c5fd") +
            '">' +
            esc(r.phone || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        "</tr>"
      );
    }
    function renderUnfilledRow(r) {
      return (
        "<tr>" +
        cell(
          '<span style="color:#60a5fa;font-weight:800">#' +
            esc(r.order || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<div style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
            esc(r.product || "-") +
            '">' +
            esc(r.product || "-") +
            "</div>",
        ) +
        cell(
          '<span style="font-family:Consolas,monospace;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.75)"
              : "#cbd5e1") +
            '">' +
            esc(r.sku || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span style="font-weight:800;color:#fff">' +
            esc(r.qty || 1) +
            "</span>",
          "text-align:center;white-space:nowrap",
        ) +
        cell(
          '<span style="display:inline-flex;padding:4px 9px;border-radius:999px;background:rgba(244,63,94,0.14);border:1px solid rgba(244,63,94,0.35);color:#fb7185;font-weight:900">0 ' + activeCurrency + '</span>',
          "white-space:nowrap",
        ) +
        cell(
          '<div style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fda4af;font-weight:700" title="' +
            esc(r.reason || "No SKU+qty reference amount found") +
            '">' +
            esc(r.reason || "No SKU+qty reference amount found") +
            "</div>",
        ) +
        cell(
          '<div style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(30,10,60,0.85)"
              : "#e2e8f0") +
            ';font-weight:700" title="' +
            esc(r.customerName || "-") +
            '">' +
            esc(r.customerName || "-") +
            "</div>",
        ) +
        cell(
          '<span style="color:rgba(255,255,255,0.6);font-weight:600">' +
            esc(r.phone || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        "</tr>"
      );
    }
    function pageRows(rows, table) {
      var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      pageState[table] = Math.min(Math.max(1, pageState[table]), totalPages);
      var start = (pageState[table] - 1) * pageSize;
      return {
        rows: rows.slice(start, start + pageSize),
        start: rows.length ? start + 1 : 0,
        end: Math.min(start + pageSize, rows.length),
        totalPages: totalPages,
        totalRows: rows.length,
      };
    }
    function pageButton(table, page, label, disabled, active) {
      return (
        '<button type="button" data-s4-page-table="' +
        table +
        '" data-s4-page="' +
        page +
        '" ' +
        (disabled ? "disabled" : "") +
        ' style="' +
        "min-width:34px;height:32px;border-radius:8px;border:1px solid " +
        (active ? "rgba(59,130,246,0.7)" : "rgba(255,255,255,0.10)") +
        ";" +
        "background:" +
        (active ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.04)") +
        ";" +
        "color:" +
        (disabled ? "rgba(255,255,255,0.28)" : "#e5e7eb") +
        ";font-weight:800;cursor:" +
        (disabled ? "not-allowed" : "pointer") +
        ';font-family:inherit">' +
        esc(label) +
        "</button>"
      );
    }
    function renderPagination(table, info) {
      var el = table === "filled" ? filledPagination : unfilledPagination;
      var current = pageState[table];
      var pages = [];
      var startPage = Math.max(1, current - 2);
      var endPage = Math.min(info.totalPages, startPage + 4);
      startPage = Math.max(1, endPage - 4);
      for (var p = startPage; p <= endPage; p++)
        pages.push(pageButton(table, p, p, false, p === current));
      el.innerHTML =
        '<div style="color:rgba(255,255,255,0.48);font-size:11px;font-weight:700">' +
        info.start.toLocaleString("en-US") +
        "-" +
        info.end.toLocaleString("en-US") +
        " of " +
        info.totalRows.toLocaleString("en-US") +
        "</div>" +
        '<div style="display:flex;align-items:center;gap:6px">' +
        pageButton(table, current - 1, "‹", current <= 1, false) +
        pages.join("") +
        pageButton(table, current + 1, "›", current >= info.totalPages, false) +
        "</div>";
    }
    function render() {
      var term = input.value.trim();
      var filledInfo = pageRows(
        sortRows(filterRows(report.filledRows || [], term), "filled"),
        "filled",
      );
      var unfilledInfo = pageRows(
        sortRows(filterRows(report.unfilledRows || [], term), "unfilled"),
        "unfilled",
      );
      filledBody.innerHTML = filledInfo.rows.length
        ? filledInfo.rows.map(renderFilledRow).join("")
        : '<tr><td colspan="9" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No filled orders match this search</td></tr>';
      unfilledBody.innerHTML = unfilledInfo.rows.length
        ? unfilledInfo.rows.map(renderUnfilledRow).join("")
        : '<tr><td colspan="8" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No unfilled orders match this search</td></tr>';
      renderPagination("filled", filledInfo);
      renderPagination("unfilled", unfilledInfo);
    }
    input.addEventListener("input", function () {
      pageState.filled = 1;
      pageState.unfilled = 1;
      render();
    });
    mountEl
      .querySelectorAll("[data-s4-sort-table][data-s4-sort-key]")
      .forEach(function (th) {
        th.addEventListener("click", function () {
          var table = th.getAttribute("data-s4-sort-table");
          var key = th.getAttribute("data-s4-sort-key");
          sortState[table].dir =
            sortState[table].key === key && sortState[table].dir === "asc"
              ? "desc"
              : "asc";
          sortState[table].key = key;
          pageState[table] = 1;
          render();
        });
      });
    [filledPagination, unfilledPagination].forEach(function (el) {
      el.addEventListener("click", function (event) {
        var target = event.target;
        var btn =
          target && target.closest
            ? target.closest("[data-s4-page-table][data-s4-page]")
            : null;
        if (!btn || btn.disabled) return;
        var table = btn.getAttribute("data-s4-page-table");
        pageState[table] = Number(btn.getAttribute("data-s4-page") || 1);
        render();
      });
    });
    render();
  })();

  (function initTotalSalesRepairReport() {
    var report = D.totalSalesRepairReport;
    if (!report || !report.totalMissing) return;
    var input = mountEl.querySelector("#s4-sales-repair-search");
    var filledBody = mountEl.querySelector("#s4-sales-filled-report-body");
    var unfilledBody = mountEl.querySelector("#s4-sales-unfilled-report-body");
    var filledPagination = mountEl.querySelector("#s4-sales-filled-pagination");
    var unfilledPagination = mountEl.querySelector(
      "#s4-sales-unfilled-pagination",
    );
    if (
      !input ||
      !filledBody ||
      !unfilledBody ||
      !filledPagination ||
      !unfilledPagination
    )
      return;

    var sortState = {
      filled: { key: "order", dir: "asc" },
      unfilled: { key: "order", dir: "asc" },
    };
    var pageSize = 7;
    var pageState = { filled: 1, unfilled: 1 };
    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[ch];
      });
    }
    function money(v) {
      return Number(v || 0).toLocaleString("en-US") + " " + activeCurrency;
    }
    function cell(content, extra) {
      return (
        '<td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.055);vertical-align:middle;' +
        (extra || "") +
        '">' +
        content +
        "</td>"
      );
    }
    function searchable(row) {
      return [
        row.order,
        row.product,
        row.sku,
        row.qty,
        row.amount,
        row.referenceCount,
        row.reason,
        row.customerName,
        row.phone,
      ]
        .join(" ")
        .toLowerCase();
    }
    function confidenceBadge(refs) {
      var color = refs >= 10 ? "#00e676" : refs >= 2 ? "#f59e0b" : "#f43f5e";
      var label = refs >= 10 ? "High" : refs >= 2 ? "Medium" : "Low";
      return (
        '<span style="display:inline-flex;justify-content:center;min-width:64px;padding:4px 8px;border-radius:999px;background:' +
        color +
        "18;border:1px solid " +
        color +
        "45;color:" +
        color +
        ';font-size:11px;font-weight:800">' +
        label +
        "</span>"
      );
    }
    var refsTitle =
      "Refs = number of other rows in the sheet with the same SKU + quantity used to choose this filled amount. More refs means higher confidence.";
    function valueFor(row, key) {
      if (key === "refs" || key === "confidence")
        return Number(row.referenceCount || 0);
      if (key === "amount") return Number(row.amount || 0);
      if (key === "qty") return Number(row.qty || 0);
      return String(row[key] || "").toLowerCase();
    }
    function filterRows(rows, term) {
      if (!term) return rows.slice();
      term = term.toLowerCase();
      return rows.filter(function (row) {
        return searchable(row).indexOf(term) !== -1;
      });
    }
    function sortRows(rows, table) {
      var state = sortState[table];
      return rows.slice().sort(function (a, b) {
        var av = valueFor(a, state.key),
          bv = valueFor(b, state.key);
        var result =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return state.dir === "asc" ? result : -result;
      });
    }
    function renderFilledRow(r) {
      return (
        "<tr>" +
        cell(
          '<span style="color:#60a5fa;font-weight:800">#' +
            esc(r.order || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<div style="max-width:640px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
            esc(r.product || "-") +
            '">' +
            esc(r.product || "-") +
            "</div>",
        ) +
        cell(
          '<span style="font-family:Consolas,monospace;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.75)"
              : "#cbd5e1") +
            '">' +
            esc(r.sku || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span style="font-weight:800;color:#fff">' +
            esc(r.qty || 1) +
            "</span>",
          "text-align:center",
        ) +
        cell(
          '<span style="font-weight:900;color:#fff">' +
            money(r.amount) +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span title="' +
            esc(refsTitle) +
            '" style="color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.75)"
              : "#cbd5e1") +
            ";font-weight:800;text-decoration:underline dotted " +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.45)"
              : "rgba(148,163,184,0.65)") +
            ';cursor:help">' +
            Number(r.referenceCount || 0).toLocaleString("en-US") +
            "</span>",
          "text-align:center",
        ) +
        cell(
          confidenceBadge(Number(r.referenceCount || 0)),
          "text-align:center",
        ) +
        cell(
          '<span style="color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(30,10,60,0.85)"
              : "#e2e8f0") +
            ';font-weight:700">' +
            esc(r.customerName || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span style="font-family:Consolas,monospace;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(29,78,216,0.85)"
              : "#93c5fd") +
            '">' +
            esc(r.phone || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        "</tr>"
      );
    }
    function renderUnfilledRow(r) {
      return (
        "<tr>" +
        cell(
          '<span style="color:#60a5fa;font-weight:800">#' +
            esc(r.order || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<div style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:700" title="' +
            esc(r.product || "-") +
            '">' +
            esc(r.product || "-") +
            "</div>",
        ) +
        cell(
          '<span style="font-family:Consolas,monospace;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(54,4,83,0.75)"
              : "#cbd5e1") +
            '">' +
            esc(r.sku || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        cell(
          '<span style="font-weight:800;color:#fff">' +
            esc(r.qty || 1) +
            "</span>",
          "text-align:center;white-space:nowrap",
        ) +
        cell(
          '<span style="display:inline-flex;padding:4px 9px;border-radius:999px;background:rgba(244,63,94,0.14);border:1px solid rgba(244,63,94,0.35);color:#fb7185;font-weight:900">0 ' + activeCurrency + '</span>',
          "white-space:nowrap",
        ) +
        cell(
          '<div style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fda4af;font-weight:700" title="' +
            esc(r.reason || "No SKU+qty reference price found") +
            '">' +
            esc(r.reason || "No SKU+qty reference price found") +
            "</div>",
        ) +
        cell(
          '<div style="max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' +
            ((document.documentElement.getAttribute("data-theme") ||
              window._kbotTheme) === "light"
              ? "rgba(30,10,60,0.85)"
              : "#e2e8f0") +
            ';font-weight:700" title="' +
            esc(r.customerName || "-") +
            '">' +
            esc(r.customerName || "-") +
            "</div>",
        ) +
        cell(
          '<span style="color:rgba(255,255,255,0.6);font-weight:600">' +
            esc(r.phone || "-") +
            "</span>",
          "white-space:nowrap",
        ) +
        "</tr>"
      );
    }
    function pageRows(rows, table) {
      var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      pageState[table] = Math.min(Math.max(1, pageState[table]), totalPages);
      var start = (pageState[table] - 1) * pageSize;
      return {
        rows: rows.slice(start, start + pageSize),
        start: rows.length ? start + 1 : 0,
        end: Math.min(start + pageSize, rows.length),
        totalPages: totalPages,
        totalRows: rows.length,
      };
    }
    function pageButton(table, page, label, disabled, active) {
      return (
        '<button type="button" data-s4-sales-page-table="' +
        table +
        '" data-s4-sales-page="' +
        page +
        '" ' +
        (disabled ? "disabled" : "") +
        ' style="' +
        "min-width:34px;height:32px;border-radius:8px;border:1px solid " +
        (active ? "rgba(59,130,246,0.7)" : "rgba(255,255,255,0.10)") +
        ";" +
        "background:" +
        (active ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.04)") +
        ";" +
        "color:" +
        (disabled ? "rgba(255,255,255,0.28)" : "#e5e7eb") +
        ";font-weight:800;cursor:" +
        (disabled ? "not-allowed" : "pointer") +
        ';font-family:inherit">' +
        esc(label) +
        "</button>"
      );
    }
    function renderPagination(table, info) {
      var el = table === "filled" ? filledPagination : unfilledPagination;
      var current = pageState[table];
      var pages = [];
      var startPage = Math.max(1, current - 2);
      var endPage = Math.min(info.totalPages, startPage + 4);
      startPage = Math.max(1, endPage - 4);
      for (var p = startPage; p <= endPage; p++)
        pages.push(pageButton(table, p, p, false, p === current));
      el.innerHTML =
        '<div style="color:rgba(255,255,255,0.48);font-size:11px;font-weight:700">' +
        info.start.toLocaleString("en-US") +
        "-" +
        info.end.toLocaleString("en-US") +
        " of " +
        info.totalRows.toLocaleString("en-US") +
        "</div>" +
        '<div style="display:flex;align-items:center;gap:6px">' +
        pageButton(table, current - 1, "‹", current <= 1, false) +
        pages.join("") +
        pageButton(table, current + 1, "›", current >= info.totalPages, false) +
        "</div>";
    }
    function render() {
      var term = input.value.trim();
      var filledInfo = pageRows(
        sortRows(filterRows(report.filledRows || [], term), "filled"),
        "filled",
      );
      var unfilledInfo = pageRows(
        sortRows(filterRows(report.unfilledRows || [], term), "unfilled"),
        "unfilled",
      );
      filledBody.innerHTML = filledInfo.rows.length
        ? filledInfo.rows.map(renderFilledRow).join("")
        : '<tr><td colspan="9" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No filled orders match this search</td></tr>';
      unfilledBody.innerHTML = unfilledInfo.rows.length
        ? unfilledInfo.rows.map(renderUnfilledRow).join("")
        : '<tr><td colspan="8" style="padding:26px;text-align:center;color:rgba(255,255,255,0.5)">No unfilled orders match this search</td></tr>';
      renderPagination("filled", filledInfo);
      renderPagination("unfilled", unfilledInfo);
    }
    input.addEventListener("input", function () {
      pageState.filled = 1;
      pageState.unfilled = 1;
      render();
    });
    mountEl
      .querySelectorAll("[data-s4-sales-sort-table][data-s4-sales-sort-key]")
      .forEach(function (th) {
        th.addEventListener("click", function () {
          var table = th.getAttribute("data-s4-sales-sort-table");
          var key = th.getAttribute("data-s4-sales-sort-key");
          sortState[table].dir =
            sortState[table].key === key && sortState[table].dir === "asc"
              ? "desc"
              : "asc";
          sortState[table].key = key;
          pageState[table] = 1;
          render();
        });
      });
    [filledPagination, unfilledPagination].forEach(function (el) {
      el.addEventListener("click", function (event) {
        var target = event.target;
        var btn =
          target && target.closest
            ? target.closest("[data-s4-sales-page-table][data-s4-sales-page]")
            : null;
        if (!btn || btn.disabled) return;
        var table = btn.getAttribute("data-s4-sales-page-table");
        pageState[table] = Number(btn.getAttribute("data-s4-sales-page") || 1);
        render();
      });
    });
    render();
  })();

  if (window.animateNumber) {
    animateNumber(document.getElementById("s4-gap"), D.gapSar, {
      duration: 1400,
      decimals: 0,
    });
    animateNumber(
      document.getElementById("s4-days"),
      D.avgDays == null ? 0 : D.avgDays,
      { duration: 1400, decimals: 1 },
    );
    animateNumber(document.getElementById("s4-rate"), D.drPct, {
      duration: 1400,
      decimals: 1,
    });
    animateNumber(document.getElementById("s4-ndr"), D.ndrPct, {
      duration: 1400,
      decimals: 1,
    });
    animateNumber(document.getElementById("s4-donut-total"), D.drPct, {
      duration: 1600,
      decimals: 1,
    });
  } else {
    // Fallback direct text
    const setTxt = (id, val, dec) => {
      const el = document.getElementById(id);
      if (el)
        el.textContent = dec
          ? val.toFixed(dec)
          : Math.round(val).toLocaleString("en-US");
    };
    setTxt("s4-gap", D.gapSar, 0);
    setTxt("s4-days", D.avgDays == null ? 0 : D.avgDays, 1);
    setTxt("s4-rate", D.drPct, 1);
    setTxt("s4-ndr", D.ndrPct, 1);
    setTxt("s4-donut-total", D.drPct, 1);
  }

  (function updateDrCenterLabel() {
    var totalEl = document.getElementById("s4-donut-total");
    if (!totalEl) return;
    var centerBox =
      totalEl.parentElement && totalEl.parentElement.parentElement;
    if (!centerBox || !centerBox.children || centerBox.children.length < 4)
      return;
    centerBox.children[0].textContent = "DR";
    centerBox.children[2].textContent = "%";
    centerBox.children[3].textContent =
      D.drDeliveredOrders.toLocaleString("en-US") +
      s4Txt(" of ", " من ") +
      D.drBaseOrders.toLocaleString("en-US") +
      s4Txt(" deliverable orders", " طلب قابل للتسليم");
  })();

  // ── Post-mount: animate COD donut arcs ───────────────────────────────────
  (function animateDonut() {
    const DC = 2 * Math.PI * ((210 - 24) / 2 - 4);
    const arcC = document.getElementById("s4-arc-collected");
    const arcG = document.getElementById("s4-arc-gap");
    if (!arcC || !arcG) return;

    setTimeout(() => {
      arcC.style.strokeDasharray = `${(D.drPct / 100) * DC} ${DC}`;
    }, 60);
    setTimeout(() => {
      arcG.style.strokeDasharray = `${((100 - D.drPct) / 100) * DC} ${DC}`;
    }, 400);
  })();

  // ── Post-mount: animate payment donut arcs ────────────────────────────────
  (function animatePayment() {
    const PSIZE = 140,
      PSTROKE = 8;
    const PR = (PSIZE - PSTROKE) / 2 - 2;
    const PC = 2 * Math.PI * PR;
    const pm = D.payMethods;
    const cashEl = document.getElementById("s4-pay-cash");
    const bankEl = document.getElementById("s4-pay-bank");
    if (!cashEl || !bankEl) return;

    setTimeout(() => {
      cashEl.style.strokeDasharray = `${(pm[0].value / 100) * PC} ${PC}`;
    }, 60);
    setTimeout(() => {
      bankEl.style.strokeDasharray = `${(pm[1].value / 100) * PC} ${PC}`;
    }, 450);
  })();

  // ── Post-mount: stagger city bar fills ───────────────────────────────────
  (function animateCityBars() {
    const bars = mountEl.querySelectorAll(".s4-city-bar");
    bars.forEach((bar, i) => {
      const pct = parseFloat(bar.dataset.pct) || 0;
      setTimeout(
        () => {
          bar.style.width = pct + "%";
        },
        80 + i * 40,
      );
    });
  })();

  // ── StatCard hover effect ─────────────────────────────────────────────────
  mountEl.querySelectorAll(".s4-statcard").forEach((card) => {
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-2px)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "translateY(0)";
    });
  });

  // ── Map tooltips ─────────────────────────────────────────────────────────
  const tooltip = mountEl.querySelector("#s4-map-tooltip");
  if (tooltip) {
    const mapEl = tooltip.closest(".s4-map");

    mountEl.querySelectorAll(".s4-city-dot").forEach((dot) => {
      dot.addEventListener("mouseenter", () => {
        const mapRect = mapEl ? mapEl.getBoundingClientRect() : null;
        const dotRect = dot.getBoundingClientRect();
        if (mapRect && dotRect) {
          const rawX = dotRect.left - mapRect.left + dotRect.width / 2;
          const x = Math.min(Math.max(rawX, 118), Math.max(118, mapRect.width - 118));
          const y = dotRect.top - mapRect.top + dotRect.height / 2;
          tooltip.style.transform = `translate3d(${x}px, ${y - 12}px, 0) translate(-50%, -100%)`;
        }
        const name = dot.getAttribute("data-name");
        const due = Number(dot.getAttribute("data-due")).toLocaleString(
          "en-US",
        );
        const coll = Number(dot.getAttribute("data-coll")).toLocaleString(
          "en-US",
        );
        const pct = Number(dot.getAttribute("data-pct")).toFixed(1);

        tooltip.innerHTML = `
          <div style="font-weight:800; color:#14b8a6; margin-bottom:7px; font-size:15px;">${name}</div>
          <div style="display:flex; justify-content:space-between; gap:18px; margin-bottom:4px;">
            <span style="color:rgba(255,255,255,0.6)">${s4Txt("Expected:", "المتوقع:")}</span>
            <span>${due} ${activeCurrency}</span>
          </div>
          <div style="display:flex; justify-content:space-between; gap:18px; margin-bottom:4px;">
            <span style="color:rgba(255,255,255,0.6)">${s4Txt("Collected:", "تم التحصيل:")}</span>
            <span>${coll} ${activeCurrency}</span>
          </div>
          <div style="display:flex; justify-content:space-between; gap:18px;">
            <span style="color:rgba(255,255,255,0.6)">${s4Txt("Rate:", "النسبة:")}</span>
            <span style="color:#00e676">${pct}%</span>
          </div>
        `;
        tooltip.style.visibility = "visible";
        tooltip.style.opacity = "1";
      });

      dot.addEventListener("mouseleave", () => {
        tooltip.style.opacity = "0";
        tooltip.style.visibility = "hidden";
      });
    });
  }

  // ── Cities "show all" button ─────────────────────────────────────────────
  const citiesBtn = document.getElementById("s4-cities-btn");
  if (citiesBtn) {
    citiesBtn.addEventListener("mouseenter", () => {
      citiesBtn.style.background =
        "linear-gradient(135deg, rgba(20,184,166,0.15), rgba(37,99,235,0.15))";
      citiesBtn.style.transform = "translateY(-2px)";
      citiesBtn.style.boxShadow = "0 6px 20px rgba(20,184,166,0.15)";
      citiesBtn.style.borderColor = "rgba(20,184,166,0.4)";
    });
    citiesBtn.addEventListener("mouseleave", () => {
      citiesBtn.style.background =
        "linear-gradient(135deg, rgba(20,184,166,0.1), rgba(37,99,235,0.1))";
      citiesBtn.style.transform = "translateY(0)";
      citiesBtn.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)";
      citiesBtn.style.borderColor = "rgba(20,184,166,0.25)";
    });
    citiesBtn.addEventListener("click", () => {
      if (ctx && typeof ctx.onNavigate === "function") {
        ctx.onNavigate("cities");
      }
    });
  }
};
