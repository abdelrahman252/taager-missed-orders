(function () {
  "use strict";

  var ALLOWED_ACTIONS = {
    OPEN_PAGE: true,
    OPEN_PRODUCT: true,
    OPEN_CITY: true,
    FILTER_PRODUCTS: true
  };

  function uiLocale() {
    var current = window.dashboardI18n && window.dashboardI18n.currentLocale
      ? window.dashboardI18n.currentLocale
      : (window._kbotLang || localStorage.getItem("kbot-lang") || document.documentElement.lang || "en");
    return String(current || "en").toLowerCase().indexOf("ar") === 0 ? "ar" : "en";
  }

  function containsArabic(value) {
    return /[\u0600-\u06ff]/.test(String(value || ""));
  }

  function responseLanguage(command) {
    return uiLocale() === "ar" || containsArabic(command) ? "ar" : "en";
  }

  function matchesResponseLanguage(value, language) {
    var textValue = String(value || "");
    var arabicLetters = (textValue.match(/[\u0600-\u06ff]/g) || []).length;
    var latinLetters = (textValue.match(/[a-z]/gi) || []).length;
    if (language === "ar") {
      return arabicLetters >= 8 && latinLetters <= (arabicLetters * 0.8) + 50;
    }
    return arabicLetters <= latinLetters;
  }

  function text(en, ar, command) {
    return responseLanguage(command || "") === "ar" ? ar : en;
  }

  function defaultSuggestions() {
    if (uiLocale() === "ar") {
      return ["ماذا أفعل بعد ذلك؟", "ابنِ خطة توسع", "ما أفضل المدن للتوسع؟", "اشرح ضعف NDR"];
    }
    return ["What should I do next?", "Build a scale plan", "Best cities to scale?", "Explain weak NDR"];
  }

  function normalizeSuggestions(items) {
    var list = (Array.isArray(items) ? items : []).map(function (item) {
      return String(item || "").trim();
    }).filter(Boolean).slice(0, 4);
    if (uiLocale() === "ar") {
      list = list.filter(containsArabic);
    }
    return list.length ? list : defaultSuggestions();
  }

  function actionLabel(action) {
    action = action || {};
    var type = String(action.type || "").toUpperCase();
    var ar = uiLocale() === "ar";
    if (action.label && !/^drilldown$/i.test(String(action.label)) && (!ar || containsArabic(action.label))) return String(action.label);
    if (type === "OPEN_PRODUCT") return ar ? "فتح تحليل المنتج" : "Open product analytics";
    if (type === "OPEN_CITY") return ar ? "فتح تحليل المدينة" : "Open city analytics";
    if (type === "FILTER_PRODUCTS") return ar ? "عرض المنتجات المطابقة" : "Show matching products";
    if (type === "OPEN_PAGE") {
      if (action.section === "cities") return ar ? "فتح تحليل المدن" : "Open city analytics";
      if (action.section === "products") return ar ? "فتح تحليل المنتجات" : "Open product analytics";
      if (action.section === "calculator") return ar ? "فتح الحاسبة" : "Open calculator";
      if (action.section === "overview") return ar ? "فتح نظرة المؤشرات" : "Open KPI overview";
      return ar ? "فتح القسم" : "Open section";
    }
    return ar ? "مراجعة" : "Review";
  }

  function sanitizeAction(action) {
    if (!action || typeof action !== "object") return null;
    var type = String(action.type || "").toUpperCase();
    if (!ALLOWED_ACTIONS[type]) return null;
    var safe = Object.assign({}, action, { type: type });
    safe.label = actionLabel(safe);
    return safe;
  }

  function sanitizeActions(actions) {
    return (Array.isArray(actions) ? actions : []).map(sanitizeAction).filter(Boolean).slice(0, 4);
  }

  function requestLocale(command) {
    return {
      uiLocale: uiLocale(),
      responseLanguage: responseLanguage(command),
      localePolicy: uiLocale() === "ar"
        ? "arabic_ui_forces_arabic"
        : "english_ui_follows_user_language"
    };
  }

  window.KhodAiShared = {
    uiLocale: uiLocale,
    responseLanguage: responseLanguage,
    matchesResponseLanguage: matchesResponseLanguage,
    text: text,
    defaultSuggestions: defaultSuggestions,
    normalizeSuggestions: normalizeSuggestions,
    sanitizeAction: sanitizeAction,
    sanitizeActions: sanitizeActions,
    requestLocale: requestLocale
  };
})();
