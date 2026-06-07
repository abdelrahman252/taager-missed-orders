(function () {
  "use strict";

  const MAX_JSON_CHARS = 14000;

  function cleanText(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 160);
  }

  function capValue(value, depth) {
    if (value == null) return value;
    if (typeof value === 'string') return cleanText(value, depth <= 1 ? 220 : 140);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, depth <= 1 ? 8 : 5).map(function (item) { return capValue(item, depth + 1); });
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).slice(0, depth <= 1 ? 18 : 10).forEach(function (key) {
        out[key] = capValue(value[key], depth + 1);
      });
      return out;
    }
    return null;
  }

  function compress(parsedIntent, analyticsResult) {
    // Produce the tiny JSON structure for the AI
    const payload = {
      intent: parsedIntent.intent,
      focus: analyticsResult.type,
      summary: {},
      metrics: {},
      data: capValue(analyticsResult.data, 0)
    };

    if (analyticsResult.type === 'ACCOUNT_HEALTH') {
      const health = analyticsResult.data;
      payload.summary = {
        mainLossReason: health.mainLossReason || "",
        worstProduct: (health.topLosingProducts && health.topLosingProducts.length) ? health.topLosingProducts[0].name : "None",
        bestProduct: (health.topWinningProducts && health.topWinningProducts.length) ? health.topWinningProducts[0].name : "None",
      };
      payload.metrics = health.metrics;
    }

    var json = JSON.stringify(payload);
    if (json.length <= MAX_JSON_CHARS) return payload;

    return {
      intent: parsedIntent.intent,
      localOnly: !!parsedIntent.localOnly,
      focus: analyticsResult.type,
      summary: capValue(payload.summary, 0),
      metrics: capValue(payload.metrics, 0),
      data: capValue(payload.data, 1),
      truncated: true
    };
  }

  window.KhodAiContextCompressor = {
    compress
  };

})();
