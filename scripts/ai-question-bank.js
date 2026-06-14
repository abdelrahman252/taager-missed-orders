"use strict";

const DEFAULT_FORBIDDEN = ["To identify", "preparing the full dashboard mirror"];

function scenario(id, category, userMessage, expectedRoute, expectedLanguage, answerShape, requiredMetrics, expectedActionType, maxLatencyMs, extra) {
  return Object.assign({
    id,
    category,
    userMessage,
    expectedRoute,
    expectedLanguage,
    answerShape,
    requiredMetrics: requiredMetrics || [],
    forbiddenPhrases: DEFAULT_FORBIDDEN,
    expectedActionType: expectedActionType || null,
    maxLatencyMs: maxLatencyMs || 250,
    smoke: false,
  }, extra || {});
}

const questionBank = [
  scenario("account-health-en", "account-health", "How is my account doing?", "local", "en", "proof", ["NDR"], "OPEN_PAGE", 250, { smoke: true }),
  scenario("account-loss-en", "account-health", "Why am I losing?", "local-plus-gemini", "en", "diagnosis", ["NDR"], null, 300, { smoke: true }),
  scenario("account-change-en", "account-health", "What changed this month?", "local", "en", "practical", [], null, 300),
  scenario("account-health-ar", "account-health", "كيف أداء الحساب؟", "local", "ar", "proof", ["NDR"], "OPEN_PAGE", 250),
  scenario("account-loss-ar", "account-health", "ليه بخسر؟", "local-plus-gemini", "ar", "diagnosis", ["NDR"], null, 300, { smoke: true, expectedIntent: "LOSS_ANALYSIS" }),

  scenario("products-best-en", "products", "best products", "mirror", "en", "ranking-plural", ["NDR"], "OPEN_PRODUCT", 250, { smoke: true, minRankedRows: 2 }),
  scenario("products-worst-ndr-en", "products", "worst NDR products", "mirror", "en", "ranking-plural", ["NDR"], "OPEN_PRODUCT", 250, { minRankedRows: 2 }),
  scenario("products-pause-en", "products", "what product should I pause?", "local", "en", "singular", ["NDR"], "OPEN_PRODUCT", 250),
  scenario("products-high-cpa-en", "products", "highest CPA products", "mirror", "en", "ranking-plural", ["CPA"], "OPEN_PRODUCT", 250, { minRankedRows: 2 }),
  scenario("products-best-ar", "products", "ما أفضل المنتجات؟", "mirror", "ar", "ranking-plural", ["NDR"], "OPEN_PRODUCT", 250, { minRankedRows: 2 }),
  scenario("products-pause-ar", "products", "أي منتج أوقفه؟", "local", "ar", "singular", ["NDR"], "OPEN_PRODUCT", 250),

  scenario("cities-scale-en", "cities", "best cities to scale", "mirror", "en", "ranking-plural", ["NDR"], "OPEN_CITY", 250, { smoke: true }),
  scenario("cities-weak-en", "cities", "weakest cities", "mirror", "en", "ranking-plural", ["NDR"], "OPEN_CITY", 250),
  scenario("cities-riyadh-why-en", "cities", "why is delivery bad in Riyadh?", "local-plus-gemini", "en", "practical", ["NDR"], "OPEN_CITY", 300),
  scenario("cities-scale-ar", "cities", "ما أفضل المدن للتوسع؟", "mirror", "ar", "ranking-plural", ["NDR"], "OPEN_CITY", 250, { smoke: true }),
  scenario("cities-weak-ar", "cities", "ما أضعف المدن؟", "mirror", "ar", "ranking-weak", ["NDR"], "OPEN_CITY", 250, { smoke: true }),
  scenario("cities-weak-ndr-ar", "cities", "أضعف المدن في NDR", "mirror", "ar", "ranking-weak", ["NDR"], "OPEN_CITY", 250),
  scenario("cities-worst-ar", "cities", "أسوأ المدن", "mirror", "ar", "ranking-weak", ["NDR"], "OPEN_CITY", 250),

  scenario("campaign-waste-en", "campaigns", "which campaign wastes spend?", "mirror", "en", "proof", ["CPA"], "OPEN_PAGE", 250),
  scenario("campaign-reduce-en", "campaigns", "what campaign should I reduce?", "local-plus-gemini", "en", "proof", ["CPA"], "OPEN_PAGE", 250),
  scenario("campaign-creative-en", "campaigns", "what creative should I test?", "local-plus-gemini", "en", "practical", [], null, 300),
  scenario("campaign-reduce-ar", "campaigns", "أي حملة أقلل صرفها؟", "mirror", "ar", "proof", ["CPA"], "OPEN_PAGE", 250),

  scenario("cpa-account-en", "cpa", "what is my CPA?", "local", "en", "proof", ["CPA"], "OPEN_PAGE", 250, { smoke: true }),
  scenario("cpa-break-even-en", "cpa", "what is break-even CPA?", "local", "en", "proof", ["CPA"], "OPEN_PAGE", 250),
  scenario("cpa-spend-en", "cpa", "if I spend 500 SAR what happens?", "local", "en", "proof", ["CPA"], "OPEN_PAGE", 250),
  scenario("cpa-account-ar", "cpa", "ما هي تكلفة CPA؟", "local", "ar", "proof", ["CPA"], "OPEN_PAGE", 250),

  scenario("profit-best-city-en", "profit", "what is my best city by profit?", "mirror", "en", "singular", ["Earned Profit After Tax", "NDR"], "OPEN_CITY", 250),
  scenario("profit-why-weak-en", "profit", "why is profit weak?", "local-plus-gemini", "en", "diagnosis", ["NDR"], null, 300, { smoke: true, expectedIntent: "LOSS_ANALYSIS" }),
  scenario("profit-why-weak-ar", "profit", "لماذا الربح ضعيف؟", "local-plus-gemini", "ar", "practical", ["NDR"], null, 300),

  scenario("ndr-account-en", "ndr", "what is my NDR?", "local", "en", "proof", ["NDR"], "OPEN_PAGE", 250),
  scenario("ndr-low-cities-en", "ndr", "which cities have the lowest NDR?", "mirror", "en", "ranking-plural", ["NDR"], "OPEN_CITY", 250),
  scenario("ndr-improve-ar", "ndr", "كيف أحسن NDR؟", "local-plus-gemini", "ar", "practical", ["NDR"], null, 300),

  scenario("scale-next-en", "scaling", "what should I scale?", "local-plus-gemini", "en", "practical", ["NDR"], null, 300),
  scenario("scale-next-ar", "scaling", "ما الذي أوسعه؟", "local-plus-gemini", "ar", "practical", ["NDR"], null, 300),
  scenario("operator-next-en", "planning", "what should I do next?", "local", "en", "practical", ["NDR"], null, 300, { smoke: true }),
  scenario("operator-next-ar", "planning", "ماذا أفعل بعد ذلك؟", "local", "ar", "practical", ["NDR"], null, 300),
  scenario("plan-scale-en", "planning", "build a scale plan", "local-plus-gemini", "en", "plan", ["NDR", "CPA"], null, 300, { smoke: true }),
  scenario("plan-scale-ar", "planning", "ابنِ خطة توسع", "local-plus-gemini", "ar", "plan", ["NDR", "CPA"], null, 300, { smoke: true }),
  scenario("plan-fix-first-en", "planning", "give me a fix-first plan", "local-plus-gemini", "en", "practical", ["NDR"], null, 300),

  scenario("forecast-month-en", "forecasting", "forecast next month", "local-plus-gemini", "en", "practical", [], null, 300),
  scenario("forecast-spend-en", "forecasting", "what happens if I double spend?", "local-plus-gemini", "en", "practical", ["CPA"], null, 300),
  scenario("forecast-month-ar", "forecasting", "توقع الشهر القادم", "local-plus-gemini", "ar", "practical", [], null, 300),

  scenario("compare-cities-en", "comparisons", "compare Riyadh vs Jeddah", "local", "en", "proof", ["NDR"], "OPEN_PAGE", 250),
  scenario("compare-products-en", "comparisons", "compare Product X vs Stable Winner", "local", "en", "proof", ["NDR"], "OPEN_PRODUCT", 250),
  scenario("compare-cities-mixed", "mixed-language", "compare الرياض vs Jeddah", "local", "ar", "proof", ["NDR"], "OPEN_PAGE", 250),

  scenario("typo-city-en", "typos", "bst cities to scle", "mirror", "en", "ranking-plural", ["NDR"], "OPEN_CITY", 250),
  scenario("typo-cpa-mixed", "typos", "wht is my CPA للحساب", "local", "ar", "proof", ["CPA"], "OPEN_PAGE", 250),
  scenario("mixed-scale-ar", "mixed-language", "اعمل scale plan سريع", "local-plus-gemini", "ar", "plan", ["NDR", "CPA"], null, 300),

  scenario("ambiguous-product-en", "ambiguity", "what about this product?", "followup", "en", "clarification", [], null, 250),
  scenario("ambiguous-next-en", "ambiguity", "show me the next one", "followup", "en", "clarification", [], null, 250),
  scenario("ambiguous-product-ar", "ambiguity", "ماذا عن هذا المنتج؟", "followup", "ar", "clarification", [], null, 250),

  scenario("followup-why-en", "follow-ups", "why?", "followup", "en", "clarification", [], null, 250),
  scenario("followup-steps-en", "follow-ups", "do it step by step", "followup", "en", "clarification", [], null, 250),
  scenario("followup-why-ar", "follow-ups", "ليه؟", "followup", "ar", "clarification", [], null, 250),

  scenario("out-scope-weather-en", "out-of-scope", "what is the weather tomorrow?", "followup", "en", "clarification", [], null, 250),
  scenario("out-scope-poem-ar", "out-of-scope", "اكتب لي قصيدة", "followup", "ar", "clarification", [], null, 250),
];

module.exports = {
  questionBank,
  smokeQuestionBank: questionBank.filter((item) => item.smoke),
};
