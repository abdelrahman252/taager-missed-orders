(function () {
  "use strict";

  var dismissed = {};

  var PREVIEW_STATUSES = [
    "تم التوصيل",
    "تم التوصيل",
    "تم التوصيل",
    "قيد التوصيل",
    "تم تأكيد الطلب",
    "في انتظار الشحن",
    "تم استلام الطلب",
    "فشل التسليم",
    "تم التحقق من الإرجاع",
    "طلب ملغي بواسطتك",
    "العميل رفض التأكيد",
    "معلق مؤقتا",
    "تم تعليق التوصيل",
    "انتهى من المخزن",
    "تمت خدمة ما بعد البيع",
    "خدمة ما بعد البيع قيد التقدم"
  ];

  var PRODUCTS = [
    { name: "عطر عود فاخر", sku: "TAAG-OUD-50", price: 189, commission: 46, taxProfit: 4 },
    { name: "سيروم العناية بالبشرة", sku: "TAAG-SRM-30", price: 149, commission: 34, taxProfit: 3 },
    { name: "حزام دعم الظهر", sku: "TAAG-BCK-01", price: 219, commission: 58, taxProfit: 5 },
    { name: "خلاط صغير ذكي", sku: "TAAG-BLD-02", price: 169, commission: 42, taxProfit: 4 },
    { name: "زيت شعر بريميوم", sku: "TAAG-HAI-75", price: 129, commission: 31, taxProfit: 3 },
    { name: "مجموعة العناية اليومية", sku: "TAAG-CARE-10", price: 249, commission: 64, taxProfit: 6 }
  ];

  var CITIES = [
    { city: "الرياض", region: "منطقة الرياض" },
    { city: "جدة", region: "منطقة مكة المكرمة" },
    { city: "الدمام", region: "المنطقة الشرقية" },
    { city: "مكة", region: "منطقة مكة المكرمة" },
    { city: "المدينة المنورة", region: "منطقة المدينة المنورة" },
    { city: "أبها", region: "منطقة عسير" },
    { city: "الطائف", region: "منطقة مكة المكرمة" },
    { city: "بريدة", region: "منطقة القصيم" }
  ];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function isoDate(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function nowBase() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 30, 0, 0);
  }

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function cleanPreviewText(value) {
    var text = String(value == null ? "" : value);
    if (window.dashboardI18n && typeof window.dashboardI18n.clean === "function") {
      return window.dashboardI18n.clean(text) || text;
    }
    if (!/[\u00c3\u0192\u00d8\u2122\u00c2\u00e2\u00f0]/.test(text)) return text;
    try {
      return decodeURIComponent(escape(text));
    } catch (e) {
      return text;
    }
  }

  function statusFor(i) {
    return cleanPreviewText(PREVIEW_STATUSES[i % PREVIEW_STATUSES.length]);
  }

  function productFor(i) {
    var product = PRODUCTS[i % PRODUCTS.length];
    return Object.assign({}, product, { name: cleanPreviewText(product.name) });
  }

  function cityFor(i) {
    var place = CITIES[i % CITIES.length];
    return {
      city: cleanPreviewText(place.city),
      region: cleanPreviewText(place.region)
    };
  }

  function statusMeta(status) {
    status = cleanPreviewText(status);
    return window.TaagerStatus
      ? window.TaagerStatus.normalize(status)
      : { bucket: String(status || "").toLowerCase(), delivered: status === "تم التوصيل", eligible: status !== "طلب ملغي بواسطتك" };
  }

  function countFailedOrders(orders) {
    return (orders || []).filter(function (order) {
      var meta = statusMeta(order.orderStatus);
      return meta.eligible !== false && meta.delivered !== true;
    }).length;
  }

  function makeOrder(i, runOffset) {
    var base = nowBase();
    var created = addDays(base, -runOffset);
    created.setHours(9 + (i % 8), (i * 7) % 60, 0, 0);
    var updated = addDays(created, (i % 4) + 1);
    var product = productFor(i);
    var place = cityFor(i);
    var qty = (i % 6 === 0) ? 2 : 1;
    var status = statusFor(i);
    var meta = statusMeta(status);
    var total = product.price * qty;
    var taxProfit = product.taxProfit * qty;
    var grossProfit = product.commission * qty;
    var taagerProfit = grossProfit - taxProfit;
    var delivered = meta.delivered === true;
    var canceledByUser = meta.bucket === "canceled_by_you";

    return {
      name: cleanPreviewText("عميل معاينة ") + (i + 1),
      phone: "9665" + String(43000000 + i).padStart(8, "0"),
      productName: product.name,
      sku: product.sku,
      qty: qty,
      unitPrice: product.price,
      subtotal: total,
      totalPrice: total,
      dashboardTotalPrice: total,
      city: place.city,
      region: place.region,
      address: cleanPreviewText("حي المعاينة، مبنى ") + (20 + i),
      date: isoDate(created),
      createdAt: isoDate(created),
      lastUpdatedAt: isoDate(updated),
      source: i % 13 === 0 ? "missed" : "real",
      orderStatus: status,
      status: status,
      amountDue: delivered ? total : (canceledByUser ? 0 : total),
      dashboardAmountDue: delivered ? total : (canceledByUser ? 0 : total),
      marketerCommission: grossProfit,
      commission: grossProfit,
      profit: grossProfit,
      taxProfit: taxProfit,
      taagerProfit: taagerProfit,
      profitAfterTax: taagerProfit,
      taagerOrderNumber: "PV-" + String(2026000 + i),
      paymentMethod: i % 4 === 0 || i % 11 === 0 ? "Prepaid" : "COD",
      country: "SA",
      currency: "SAR"
    };
  }

  function buildRuns() {
    var base = nowBase();
    var runAOrders = Array.from({ length: 32 }, function (_, i) { return makeOrder(i, 0); });
    var runBOrders = Array.from({ length: 24 }, function (_, i) { return makeOrder(i + 32, 2); });
    var emptyLatest = {
      runId: "preview-empty-latest",
      runDate: isoDate(base),
      runTimestamp: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 13, 15).getTime(),
      accountId: "preview-store",
      accountEmail: "preview@taagerwhaat.com",
      accountLabel: cleanPreviewText("متجر المعاينة"),
      ordersSubmitted: 0,
      ordersFailed: 0,
      runtimeMs: 7 * 60 * 1000,
      orders: []
    };
    return [
      {
        runId: "preview-run-today",
        runDate: isoDate(base),
        runTimestamp: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 11, 20).getTime(),
        accountId: "preview-store",
        accountEmail: "preview@taagerwhaat.com",
        accountLabel: cleanPreviewText("متجر المعاينة"),
        ordersSubmitted: runAOrders.length,
        ordersFailed: countFailedOrders(runAOrders),
        runtimeMs: 22 * 60 * 1000,
        orders: runAOrders
      },
      emptyLatest,
      {
        runId: "preview-run-previous",
        runDate: isoDate(addDays(base, -2)),
        runTimestamp: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 2, 16, 45).getTime(),
        accountId: "preview-store",
        accountEmail: "preview@taagerwhaat.com",
        accountLabel: cleanPreviewText("متجر المعاينة"),
        ordersSubmitted: runBOrders.length,
        ordersFailed: countFailedOrders(runBOrders),
        runtimeMs: 17 * 60 * 1000,
        orders: runBOrders
      }
    ];
  }

  function buildDashboardAccounts() {
    var rows = [];
    var start = new Date(nowBase().getFullYear(), nowBase().getMonth(), 1, 10, 0, 0, 0);
    for (var i = 0; i < 160; i++) {
      rows.push(makeOrder(i, Math.max(0, Math.floor(i / 5))));
      rows[i].createdAt = isoDate(addDays(start, i % 24));
      rows[i].date = rows[i].createdAt;
      rows[i].lastUpdatedAt = isoDate(addDays(new Date(rows[i].createdAt), (i % 5) + 1));
      rows[i].taagerOrderNumber = "DASH-PV-" + String(4000 + i);
    }
    return {
      "preview-store": {
        snapshot: rows,
        snapshotMonth: isoDate(start).slice(0, 7),
        autoFetchTimestamp: Date.now()
      }
    };
  }

  function copyRuns() {
    return buildRuns().map(function (run) {
      return Object.assign({}, run, {
        orders: (run.orders || []).map(function (order) { return Object.assign({}, order); })
      });
    });
  }

  function isActive(feature) {
    if (feature === "analytics") return window._analyticsEnabled === false;
    if (feature === "operations") return window._operationsEnabled === false;
    if (feature === "dashboard") return window._dashboardEnabled === false;
    return false;
  }

  function text(feature) {
    var isAr = (window._kbotLang || document.documentElement.lang || "en") === "ar";
    var names = {
      analytics: isAr ? "التحليلات" : "Analytics",
      operations: isAr ? "العمليات" : "Operations",
      dashboard: isAr ? "لوحة التحكم" : "Dashboard"
    };
    return {
      title: isAr ? "وضع المعاينة" : "Preview Mode",
      body: isAr
        ? "هذه بيانات معاينة واقعية توضّح ما سيظهر بعد فتح " + names[feature] + ". عند الترقية ستظهر بياناتك الحقيقية من تشغيلات البوت وبيانات تاجر المباشرة."
        : "This is sample data showing what " + names[feature] + " unlocks. Upgrade this feature to connect the page to your real bot runs and live Taager data.",
      cta: isAr ? "استكشف المعاينة" : "Explore Preview",
      upgrade: isAr ? "تواصل للترقية" : "Contact Support",
      banner: isAr
        ? "بيانات معاينة فقط. افتح الميزة لعرض بياناتك الحقيقية."
        : "Preview data shown. Unlock this feature to use your live data.",
      kicker: isAr ? "معاينة" : "PREVIEW"
    };
  }

  function renderOverlayBody(overlay, feature) {
    var copy = text(feature);
    overlay.innerHTML =
      '<div class="premium-preview-card" role="dialog" aria-modal="true">' +
        '<div class="premium-preview-kicker">' + cleanPreviewText(copy.kicker) + '</div>' +
        '<h2>' + cleanPreviewText(copy.title) + '</h2>' +
        '<p>' + cleanPreviewText(copy.body) + '</p>' +
        '<div class="premium-preview-actions">' +
          '<button type="button" class="premium-preview-primary">' + cleanPreviewText(copy.cta) + '</button>' +
          '<button type="button" class="premium-preview-secondary">' + cleanPreviewText(copy.upgrade) + '</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector(".premium-preview-primary").addEventListener("click", function () {
      dismissed[feature] = true;
      overlay.remove();
    });
    overlay.querySelector(".premium-preview-secondary").addEventListener("click", function () {
      if (window.TaagerSupport && typeof window.TaagerSupport.open === "function") window.TaagerSupport.open();
    });
  }

  function mount(root, feature) {
    if (!root || !isActive(feature)) return;
    root.setAttribute("data-premium-preview", feature);
    if (!root.style.position) root.style.position = "relative";
    var copy = text(feature);
    var banner = document.createElement("div");
    banner.className = "premium-preview-banner";
    banner.textContent = cleanPreviewText(copy.banner);
    root.querySelector(".dashboard-page-main, .analytics-page, .ops-page, [style*='overflow']")?.prepend(banner);

    if (dismissed[feature]) return;
    if (document.querySelector(".premium-preview-overlay")) return;

    var overlay = document.createElement("div");
    overlay.className = "premium-preview-overlay";
    overlay.setAttribute("data-feature", feature);
    renderOverlayBody(overlay, feature);
    document.body.appendChild(overlay);
  }

  window.addEventListener("taager-lang-change", function () {
    var overlay = document.querySelector(".premium-preview-overlay");
    if (!overlay) return;
    var feature = overlay.getAttribute("data-feature");
    if (feature) renderOverlayBody(overlay, feature);
  });

  window.TaagerPremiumPreview = {
    isActive: isActive,
    mount: mount,
    runs: copyRuns,
    dashboardAccounts: buildDashboardAccounts
  };
})();


