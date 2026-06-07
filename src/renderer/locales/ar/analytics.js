(function () {
  'use strict';
  window.TAAGER_LOCALES = window.TAAGER_LOCALES || {};
  window.TAAGER_LOCALES.ar = window.TAAGER_LOCALES.ar || {};
  window.TAAGER_LOCALES.ar.analytics = {
    header: {
      title: "التحليلات",
      subtitle: "تتبع طلباتك، أدائك، وإيراداتك."
    },
    tabs: {
      today: "اليوم",
      yesterday: "الأمس",
      last2: "آخر يومين",
      "7d": "آخر 7 أيام",
      thisMonth: "هذا الشهر",
      custom: "نطاق مخصص"
    },
    dateCustom: {
      to: "إلى",
      apply: "تطبيق"
    },
    runBanner: {
      singleRun: "عرض تشغيل واحد من",
      showAll: "✕ عرض الكل"
    },
    empty: {
      title: "لا توجد تشغيلات بعد",
      desc: "أكمل تشغيل البوت أولاً — ستظهر البيانات هنا تلقائياً بعد كل تشغيل."
    },
    account: {
      label: "الحساب",
      allAccounts: "جميع الحسابات",
      orders: "طلبات"
    },
    tour: {
      common: {
        quickGuide: "الدليل السريع"
      },
      analytics: {
        kpis: {
          title: "مربعات المؤشرات العليا",
          body: "صف المؤشرات يجمع الطلبات، الإيرادات، COD، نسبة التسليم، نسبة الفشل، والوقت الموفر حسب التاريخ والحساب المحددين."
        },
        charts: {
          title: "منحنيات تفاعلية",
          body: "رسوم Chart.js تعرض التوزيعات اليومية. مرر فوق النقاط والأعمدة لفحص الطلبات والإيرادات والحالات والمدن والمنتجات يوما بيوم."
        },
        table: {
          title: "جدول تقارير قابل للفلترة",
          body: "الجدول يحول بيانات الرسوم إلى تقرير مخصص: فلتر، اعزل التشغيلات، راجع صفوف الطلبات، واستخدمه كسجل تدقيق أسفل طبقة الاتجاهات."
        }
      }
    },
    kpi: {
      totalOrders: "إجمالي الطلبات",
      revenue: "الإيرادات",
      timeSaved: "الوقت الموفر",
      timeSavedHelper: "\u0648\u0642\u062a \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0628\u0648\u062a \u0627\u0644\u0641\u0639\u0644\u064a \u0645\u0646 \u0627\u0644\u062a\u0634\u063a\u064a\u0644\u0627\u062a \u0627\u0644\u0645\u0643\u062a\u0645\u0644\u0629",
      cod: "مبلغ الدفع عند الاستلام المطلوب تحصيله",
      deliveredPct: "نسبة التوصيل",
      failedPct: "نسبة الفشل",
      prevSameDay: "مقارنة بنفس اليوم الأسبوع الماضي",
      prev2Days: "مقارنة باليومين السابقين",
      prev7Days: "مقارنة بالأيام الـ 7 السابقة",
      prevMonth: "مقارنة بالشهر السابق",
      prevPeriod: "مقارنة بالفترة السابقة"
    },
    charts: {
      revenueTitle: "الإيرادات خلال الوقت",
      ordersTitle: "أداء الطلبات",
      statusTitle: "توزيع حالة الطلبات",
      statusSub: "الطلبات حسب الحالة",
      salesByProduct: "المبيعات حسب المنتج",
      productPerformanceCta: "\u0623\u062f\u0627\u0621 \u0627\u0644\u0645\u0646\u062a\u062c",
      salesSub: "أفضل المنتجات أداءً",
      delivered: "تم التوصيل",
      failed: "فشل",
      pending: "قيد الانتظار",
      confirmed: "\u062a\u0645 \u0627\u0644\u062a\u0623\u0643\u064a\u062f",
      waiting: "\u0641\u064a \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631",
      processing: "\u0642\u064a\u062f \u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629",
      shipping: "\u0642\u064a\u062f \u0627\u0644\u0634\u062d\u0646",
      topCities: "\u0623\u0641\u0636\u0644 \u0627\u0644\u0645\u062f\u0646",
      deliveryFunnel: "\u0645\u0633\u0627\u0631 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
      ordersHeatmap: "\u062e\u0631\u064a\u0637\u0629 \u0646\u0634\u0627\u0637 \u0627\u0644\u0637\u0644\u0628\u0627\u062a",
      ordersByHour: "\u0627\u0644\u0637\u0644\u0628\u0627\u062a \u062d\u0633\u0628 \u0627\u0644\u0633\u0627\u0639\u0629",
      byOrders: "\u062d\u0633\u0628 \u0627\u0644\u0637\u0644\u0628\u0627\u062a",
      byRevenue: "\u062d\u0633\u0628 \u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a",
      noData: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0644\u0647\u0630\u0647 \u0627\u0644\u0641\u062a\u0631\u0629",
      noHourlyData: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0648\u0642\u062a \u0644\u0644\u0637\u0644\u0628\u0627\u062a \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u0641\u062a\u0631\u0629",
      noCityData: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u062f\u0646 \u0628\u0639\u062f.",
      noProductData: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0646\u062a\u062c\u0627\u062a \u0628\u0639\u062f.",
      noOrdersYet: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0637\u0644\u0628\u0627\u062a \u0628\u0639\u062f",
      ordersLabel: "\u0637\u0644\u0628\u0627\u062a",
      total: "\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a",
      revenueMetric: "\u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a",
      subtitleDaily: "\u062d\u062c\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u064a\u0648\u0645\u064a\u0627\u064b.",
      subtitlePeak: "\u0623\u0639\u0644\u0649 \u064a\u0648\u0645: {count} \u0637\u0644\u0628\u0627\u062a \u0641\u064a {date}.",
      heatmapLegend: "\u0627\u0644\u062f\u0644\u064a\u0644 (\u0637\u0644\u0628\u0627\u062a \u0644\u0643\u0644 \u064a\u0648\u0645)",
      heatmapLegendValues: {
        noActivity: "0 \u0637\u0644\u0628\u0627\u062a (\u0644\u0627 \u0646\u0634\u0627\u0637)",
        lowVolume: "1-3 \u0637\u0644\u0628\u0627\u062a (\u0646\u0634\u0627\u0637 \u0645\u0646\u062e\u0641\u0636)",
        mediumVolume: "4-10 \u0637\u0644\u0628\u0627\u062a (\u0646\u0634\u0627\u0637 \u0645\u062a\u0648\u0633\u0637)",
        highVolume: "11-25 \u0637\u0644\u0628\u0627\u062a (\u0646\u0634\u0627\u0637 \u0645\u0631\u062a\u0641\u0639)",
        peakVolume: "26+ \u0637\u0644\u0628\u0627\u062a (\u0630\u0631\u0648\u0629)"
      }
    },
    table: {
      title: "مستكشف الطلبات",
      searchPlaceholder: "البحث بالاسم، الهاتف، أو المدينة...",
      filterAll: "الكل",
      filterDelivered: "تم التوصيل",
      filterFailed: "فشل",
      filterPending: "قيد المعالجة",
      colCustomer: "العميل",
      colContact: "معلومات الاتصال",
      colLocation: "الموقع",
      colOrder: "الطلب",
      colValue: "القيمة",
      colStatus: "الحالة",
      colTime: "الوقت",
      colProduct: "\u0627\u0644\u0645\u0646\u062a\u062c",
      colQty: "\u0627\u0644\u0643\u0645\u064a\u0629",
      colSource: "\u0627\u0644\u0645\u0635\u062f\u0631",
      statusAll: "\u0627\u0644\u062d\u0627\u0644\u0629 (\u0627\u0644\u0643\u0644)",
      allSources: "\u0643\u0644 \u0627\u0644\u0645\u0635\u0627\u062f\u0631",
      sourceReal: "\u062d\u0642\u064a\u0642\u064a",
      sourceMissed: "\u0645\u0641\u0642\u0648\u062f",
      allAccounts: "\u0643\u0644 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a",
      perPage: "{count} \u0644\u0643\u0644 \u0635\u0641\u062d\u0629",
      clearSort: "\u0645\u0633\u062d \u0627\u0644\u062a\u0631\u062a\u064a\u0628",
      export: "\u062a\u0635\u062f\u064a\u0631",
      emptyFilters: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0637\u0644\u0628\u0627\u062a \u062a\u0637\u0627\u0628\u0642 \u0627\u0644\u0641\u0644\u0627\u062a\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.",
      paginationInfo: "عرض {start} إلى {end} من {total} طلب",
      prev: "السابق",
      next: "التالي"
    },
    insights: {
      title: "رؤى ذكية",
      peakTime: "وقت الذروة",
      peakTimeDesc: "معظم الطلبات تُعالج في",
      topProduct: "المنتج الأفضل",
      topProductDesc: "المنتج الأكثر مبيعاً هو",
      successRate: "معدل النجاح",
      successRateDesc: "من الطلبات اكتملت بنجاح",
      noData: "لا توجد بيانات كافية",
      emptyHint: "\u0634\u063a\u0651\u0644 \u0627\u0644\u0628\u0648\u062a \u0639\u062f\u0629 \u0645\u0631\u0627\u062a \u0644\u0625\u0646\u0634\u0627\u0621 \u0631\u0624\u0649.",
      count: "{count} رؤى",
      showMore: "عرض {count} إضافية",
      dynamic: {
        trend: "الطلبات <strong class=\"{trendClass}\">{trendText} {pct}%</strong> مقارنة بالفترة السابقة.",
        increased: "زادت بنسبة",
        decreased: "انخفضت بنسبة",
        failedCity: "الطلبات الفاشلة تتركز في <strong class=\"insight-warn\">{city}</strong> — {count} فشل ({rate}% معدل الفشل الإجمالي).",
        unknown: "غير معروف",
        bestProduct: "المنتج الأفضل مبيعاً: <strong>{product}</strong> — <span class=\"insight-value\">{count} طلبات</span>.",
        highCod: "مبلغ متبق للتحصيل عبر الدفع عند الاستلام مرتفع: <span class=\"insight-value\">{amount}</span> في انتظار التحصيل عبر {count} طلبات.",
        bestHour: "أفضل وقت للتوصيل: <span class=\"insight-good\">{start}–{end}</span> لديه أعلى معدل توصيل.",
        commission: "عمولة المسوق المكتسبة: <span class=\"insight-good\">{total}</span> (بمتوسط <span class=\"insight-value\">{avg}</span> لكل طلب).",
        missed: "{pct}% من الطلبات هي <span class=\"{cssClass}\">{missedLabel}</span> — فكر في مراجعة الطلبات المفقودة.",
        missedLabel: "طلبات مفقودة",
        processing: "<span class=\"insight-warn\">{count} طلبات</span> لا تزال قيد المعالجة — يرجى المتابعة مع فريق الشحن.",
        shipping: "<span class=\"insight-value\">{count} طلبات</span> في طريقها للشحن ويتوقع توصيلها قريباً{commPart}.",
        shippingComm: " (<span class=\"insight-good\">{amount}</span> عمولة قادمة)",
        waiting: "<span class=\"insight-warn\">{count} طلبات</span> عالقة في حالة <strong>الانتظار</strong> — قد تحتاج إلى متابعة يدوية مع المندوب.",
        confirmed: "<span class=\"insight-value\">{count} طلبات</span> <strong>مؤكدة</strong> وجاري تجهيزها للشحن.",
        canceled: "معدل الإلغاء <span class=\"insight-bad\">{rate}%</span> — {count} طلبات ملغاة. راجع جودة المنتج وصلاحية أرقام الهواتف."
      }
    },
    timeline: {
      title: "التسلسل الزمني للنشاط",
      empty: "لا توجد نشاطات",
      runCompleted: "اكتمل التشغيل بنجاح",
      ordersProcessed: "تمت معالجة {count} طلب",
      runFailed: "فشل التشغيل",
      runFailedDesc: "حدث خطأ أثناء معالجة الطلبات",
      eventsCount: "{count} أحداث",
      pageOf: "صفحة {current} من {total}",
      ordersSubmitted: "تم إرسال {count} طلبات",
      failed: "{count} فاشلة",
      multiAccountLabel: "حسابات متعددة",
      multiAccount: "تشغيل متعدد الحسابات",
      singleAccount: "حساب واحد",
      runStarted: "بدأ التشغيل"
    },
    utils: {
      time: {
        justNow: "الآن",
        mAgo: "قبل {m} دقيقة",
        hAgo: "قبل {h} ساعة",
        dAgo: "قبل {d} يوم"
      }
    }
  };
  Object.assign(window.TAAGER_LOCALES.ar.analytics.empty, {
    bannerTitle: "\u0627\u0644\u062a\u062d\u0644\u064a\u0644\u0627\u062a \u062c\u0627\u0647\u0632\u0629",
    bannerDesc: "\u0634\u063a\u0644 \u0627\u0644\u0628\u0648\u062a \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0644\u0628\u062f\u0621 \u0645\u0644\u0621 \u0647\u0630\u0647 \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0628\u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0648COD \u0648\u0627\u0644\u062a\u0648\u0635\u064a\u0644 \u0648\u0627\u0644\u0641\u0634\u0644.",
    runAction: "\u0627\u0644\u0630\u0647\u0627\u0628 \u0644\u0644\u062a\u0634\u063a\u064a\u0644"
  });
  window.TAAGER_LOCALES.ar.analytics.tour.analytics.charts.body = "\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u062a\u0641\u0627\u0639\u0644\u064a\u0629 \u062a\u0639\u0631\u0636 \u0627\u0644\u062a\u0648\u0632\u064a\u0639\u0627\u062a \u0627\u0644\u064a\u0648\u0645\u064a\u0629. \u0645\u0631\u0631 \u0641\u0648\u0642 \u0627\u0644\u0646\u0642\u0627\u0637 \u0648\u0627\u0644\u0623\u0639\u0645\u062f\u0629 \u0644\u0641\u062d\u0635 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0648\u0627\u0644\u062d\u0627\u0644\u0627\u062a \u0648\u0627\u0644\u0645\u062f\u0646 \u0648\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u064a\u0648\u0645\u0627 \u0628\u064a\u0648\u0645.";
})();
