(function () {
  'use strict';
  window.TAAGER_LOCALES = window.TAAGER_LOCALES || {};
  window.TAAGER_LOCALES.ar = window.TAAGER_LOCALES.ar || {};
  window.TAAGER_LOCALES.ar.operations = {
    tour: {
      common: {
        quickGuide: "الدليل السريع"
      },
      operations: {
        config: {
          title: "إعداد التشغيل والأهداف",
          body: "استخدم اختيار الحساب ولوحة تفاصيل الطلب لتحديد نطاق التشغيل، مراجعة أهداف الحساب أو المنصة، ومعرفة أين تحتاج إعادة المحاولة إلى انتباه."
        },
        terminal: {
          title: "شاشة التنفيذ المباشر",
          body: "المراقب المباشر يعرض حالة التشغيل، المدة، الطلبات المرسلة والفاشلة، الحساب الحالي، الطلب الحالي، التقدم، وسجل نجاح أو خطأ لحظي من مسار الدفع."
        },
        accountPerformance: {
          title: "أداء الحساب",
          body: "قارن الحسابات حسب حجم الطلبات والإيرادات لمعرفة الحساب الأقوى وأين تحتاج المتابعة."
        },
        smartInsights: {
          title: "الرؤى الذكية للتشغيل",
          body: "تحول هذه اللوحة سجل التشغيل إلى إشارات عملية: تغير الطلب، تجمعات الفشل، أفضل المنتجات، تعرض COD، وتوصيات التوقيت."
        },
        productPerformance: {
          title: "أداء المنتج",
          body: "استخدم جدول المنتجات للبحث والترتيب ومقارنة الطلبات والإيرادات ونسبة التسليم ونسبة الفشل حسب المنتج."
        },
        history: {
          title: "سجلات التدقيق التاريخية",
          body: "سجل التشغيل هو مسار تدقيق للتنفيذات المكتملة. اختر تشغيلا لتحميل تفاصيل الطلبات، خط الحالة الزمني، أعداد الإرسال والفشل، وسياق النتائج المحملة."
        }
      }
    },
    liveMonitor: {
      title: "مراقب التنفيذ المباشر",
      live: "مباشر",
      status: "الحالة",
      idle: "خامل",
      running: "قيد التشغيل",
      runtime: "وقت التشغيل",
      ordersSubmitted: "الطلبات المرسلة",
      failedOrders: "الطلبات الفاشلة",
      currentAccount: "الحساب الحالي",
      currentOrder: "الطلب الحالي",
      progress: "التقدم",
      activityFeed: "سجل النشاط المباشر",
      clear: "مسح",
      waiting: "في انتظار نشاط الروبوت...",
      viewLog: "عرض السجل المباشر بالكامل",
      vsLast15m: "مقابل آخر 15 دقيقة",
      feed: {
        orderFailed: "فشل الطلب #{order}: {error}",
        orderSubmitted: "تم إرسال الطلب #{order}",
        runCompleted: "اكتمل التشغيل"
      }
    },
    history: {
      title: "سجل التشغيل",
      total: "إجمالي",
      prev: "السابق",
      next: "التالي",
      empty: "لا توجد عمليات تشغيل بعد. قم بتشغيل الروبوت لرؤية السجل.",
      multiAccount: "تشغيل متعدد الحسابات",
      failed: "فشل",
      completed: "مكتمل",
      ordersCount: "طلبات"
    },
    insights: {
      title: "رؤى التشغيل الذكية",
      subtitle: "محسوبة من سجل التشغيل الخاص بك",
      empty: "قم بتشغيل الروبوت عدة مرات لإنشاء رؤى.",
      cardLabel: "رؤية {index}",
      actions: {
        viewProducts: "عرض المنتجات",
        viewDetails: "عرض التفاصيل"
      },
      trend: "الطلبات <strong>{trend} بنسبة {pct}%</strong> مقارنة بالأيام السبعة الماضية. {extra}",
      increased: "زادت",
      decreased: "انخفضت",
      goodJob: "عمل جيد! استمر.",
      failedCity: "الطلبات الفاشلة في <strong>{city}</strong> تمثل <strong>{pct}%</strong> من جميع الإخفاقات. تم اكتشاف {count} طلبات فاشلة.",
      bestProduct: "المنتج الأفضل مبيعًا هذا الأسبوع: <strong>{product}</strong> بعدد {count} طلبات.",
      productSpread: "ظهر <strong>{count} منتج</strong> في سجل التشغيل. أعلى طلب ما زال على <strong>{top}</strong>.",
      tipTime: "نصيحة: فكر في تشغيل المزيد من الحسابات بين <strong>{start}–{end}</strong>. هذه هي نافذة الأداء الأعلى لديك.",
      pendingCod: "إجمالي الدفع عند الاستلام المعلق: <strong>{amount}</strong> عبر {count} طلبات.",
      topAccount: "أعلى حساب من حيث الحجم هو <strong>{account}</strong> بعدد {count} طلبات.",
      deliveryRate: "نسبة التوصيل <strong>{pct}%</strong> مع {count} طلبات موصلة.",
      avgRunVolume: "متوسط حجم التشغيل <strong>{avg} طلب</strong> عبر {runs} تشغيلات.",
      failedRate: "نسبة الفشل <strong>{pct}%</strong> مع {count} طلبات فاشلة."
    },
    accountPerf: {
      title: "أداء الحساب",
      sortOrders: "حسب الطلبات",
      sortRevenue: "حسب الإيرادات",
      empty: "لا توجد بيانات حساب بعد.",
      ordersCount: "طلبات"
    },
    productPerf: {
      title: "أداء المنتج",
      detailed: "مفصل",
      products: "منتجات",
      allAccounts: "كل الحسابات",
      searchPlaceholder: "ابحث عن منتج...",
      clearSort: "مسح الترتيب",
      empty: "لا توجد بيانات منتج بعد.",
      pageOf: "صفحة {current} من {total}",
      footnote: "نسبة التوصيل = التوصيل / الإجمالي  ·  نسبة الفشل = الفشل / الإجمالي",
      cols: {
        product: "المنتج",
        orders: "الطلبات",
        revenue: "الإيرادات (ر.س)",
        deliveredPct: "نسبة التوصيل",
        failedPct: "نسبة الفشل",
        performance: "الأداء"
      }
    },
    utils: {
      time: {
        justNow: "الآن",
        mAgo: "قبل {m} دقيقة",
        hAgo: "قبل {h} ساعة",
        dAgo: "قبل {d} يوم"
      }
    },
    orderDetails: {
      title: "تفاصيل الطلب",
      backToOrders: "← العودة للطلبات",
      empty: "حدد تشغيلاً من السجل لعرض تفاصيل الطلب",
      emptyTitle: "اختر تشغيلاً يحتوي على طلبات",
      emptyBody: "لعرض تفاصيل الطلب، اختر عنصراً من سجل التشغيل يحتوي على طلبات مرسلة.",
      emptyAction: "اذهب إلى سجل التشغيل",
      orderOf: "الطلب {current} من {total}",
      unknown: "غير معروف",
      searchPlaceholder: "ابحث بالاسم أو الهاتف...",
      amountToCollect: "المبلغ المراد تحصيله",
      orderValue: "قيمة الطلب",
      orderDate: "تاريخ الطلب",
      city: "المدينة",
      tabOverview: "نظرة عامة",
      tabCustomer: "بيانات العميل",
      tabHistory: "السجل والمحاولات",
      tabNotes: "ملاحظات",
      noNotes: "لا توجد ملاحظات لهذا التشغيل.",
      noOrderData: "لا توجد بيانات للطلب.",
      noCustomerData: "لا توجد بيانات للعميل.",
      timelineTitle: "الخط الزمني",
      fields: {
        recipientName: "اسم المستلم",
        phone1: "هاتف 1",
        phone2: "هاتف 2",
        cityArea: "المدينة / المنطقة",
        address: "العنوان",
        account: "الحساب (مدخل البيانات)",
        productName: "اسم المنتج",
        sku: "رمز المنتج",
        name: "الاسم",
        phone: "الهاتف",
        region: "المنطقة",
        runId: "معرف التشغيل",
        runTime: "وقت التشغيل",
        submitted: "تم الإرسال",
        failed: "فشل"
      },
      timelineSteps: {
        botStarted: "بدأ الروبوت",
        processingOrder: "معالجة الطلب",
        failed: "فشل",
        delivered: "تم التوصيل",
        pending: "قيد الانتظار"
      }
    }
  };
  window.TAAGER_LOCALES.ar.operations.emptyGuidance = {
    title: "\u0627\u0644\u0639\u0645\u0644\u064a\u0627\u062a \u062c\u0627\u0647\u0632\u0629",
    body: "\u0634\u063a\u0644 \u0627\u0644\u0628\u0648\u062a \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0644\u0645\u0644\u0621 \u0643\u0644 \u0642\u0633\u0645 \u0628\u0633\u062c\u0644 \u0627\u0644\u062a\u0634\u063a\u064a\u0644 \u0648\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0623\u062f\u0627\u0621 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a \u0648\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0648\u0627\u0644\u0646\u0634\u0627\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631.",
    action: "\u0627\u0644\u0630\u0647\u0627\u0628 \u0644\u0644\u062a\u0634\u063a\u064a\u0644"
  };
})();
