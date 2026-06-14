// Shared Smart Insights correctness helpers.
// Keep advisory copy grounded in the same thresholds, sample-size gates, and
// NDR/DR definitions across dashboard, analytics, operations, and AI surfaces.
(function (root, factory) {
  "use strict";

  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TaagerSmartInsights = api;
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";

  var DEFAULT_THRESHOLDS = {
    dangerNdrPct: 20,
    healthyNdrPct: 30,
    scaleNdrPct: 40,
    dangerDrPct: 20,
    healthyDrPct: 30,
    scaleDrPct: 40,
    insightMinSample: 15,
    scaleMinOrders: 50,
    scaleMinDelivered: 10,
    prepaidMinCod: 10,
    prepaidMinPrepaid: 5
  };

  function thresholds(overrides) {
    var dashboard = root && typeof root.getDashboardThresholds === "function"
      ? root.getDashboardThresholds()
      : {};
    return Object.assign({}, DEFAULT_THRESHOLDS, {
      dangerNdrPct: pctThreshold(dashboard.NDR_DANGER, DEFAULT_THRESHOLDS.dangerNdrPct),
      healthyNdrPct: pctThreshold(dashboard.NDR_NATIONAL || dashboard.DR_GOOD, DEFAULT_THRESHOLDS.healthyNdrPct),
      scaleNdrPct: pctThreshold(dashboard.NDR_SAFE || dashboard.DR_EXCELLENT, DEFAULT_THRESHOLDS.scaleNdrPct),
      dangerDrPct: pctThreshold(dashboard.DR_POOR, DEFAULT_THRESHOLDS.dangerDrPct),
      healthyDrPct: pctThreshold(dashboard.DR_GOOD, DEFAULT_THRESHOLDS.healthyDrPct),
      scaleDrPct: pctThreshold(dashboard.DR_EXCELLENT, DEFAULT_THRESHOLDS.scaleDrPct),
      insightMinSample: Number(dashboard.INSIGHT_MIN_SAMPLE || DEFAULT_THRESHOLDS.insightMinSample),
      scaleMinOrders: Number(dashboard.SCALING_MIN_ORDERS || DEFAULT_THRESHOLDS.scaleMinOrders)
    }, overrides || {});
  }

  function pctThreshold(value, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return n <= 1 ? Math.round(n * 100) : n;
  }

  function number(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function ratioPct(numerator, denominator, digits) {
    numerator = number(numerator);
    denominator = number(denominator);
    if (denominator <= 0) return 0;
    var raw = (numerator / denominator) * 100;
    var pow = Math.pow(10, digits == null ? 1 : digits);
    return Math.round(raw * pow) / pow;
  }

  function pct(value, digits) {
    var n = number(value);
    if (n <= 1 && n >= -1) n *= 100;
    var pow = Math.pow(10, digits == null ? 0 : digits);
    return Math.round(n * pow) / pow;
  }

  function sampleGate(sampleSize, minimum) {
    sampleSize = number(sampleSize);
    minimum = number(minimum || thresholds().insightMinSample);
    return {
      ok: sampleSize >= minimum,
      sampleSize: sampleSize,
      minimum: minimum,
      confidence: confidence(sampleSize, minimum)
    };
  }

  function confidence(sampleSize, minimum) {
    sampleSize = number(sampleSize);
    minimum = Math.max(1, number(minimum || thresholds().insightMinSample));
    if (sampleSize < minimum) return "limited";
    if (sampleSize < minimum * 2) return "developing";
    return "strong";
  }

  function trustLabel(trust) {
    return trust === "estimated" ? "Estimated" : "Measured";
  }

  function evidenceCount(label, numerator, denominator) {
    var text = label ? String(label) + ": " : "";
    text += Math.round(number(numerator)).toLocaleString("en-US");
    if (denominator != null) text += " / " + Math.round(number(denominator)).toLocaleString("en-US");
    return text;
  }

  function rateEvidence(label, numerator, denominator, options) {
    options = options || {};
    return evidenceCount(label, numerator, denominator) + " (" + ratioPct(numerator, denominator, options.digits) + "%)";
  }

  function ndrFact(delivered, eligible, options) {
    options = options || {};
    var sample = sampleGate(eligible, options.minimum || thresholds().insightMinSample);
    return {
      metric: "NDR",
      definition: "Net delivery rate = delivered orders / NDR-eligible net orders.",
      delivered: number(delivered),
      eligible: number(eligible),
      pct: ratioPct(delivered, eligible),
      sampleSize: sample.sampleSize,
      sampleOk: sample.ok,
      minimum: sample.minimum,
      confidence: sample.confidence,
      evidence: rateEvidence("NDR", delivered, eligible)
    };
  }

  function drFact(delivered, confirmedBase, options) {
    options = options || {};
    var sample = sampleGate(confirmedBase, options.minimum || thresholds().insightMinSample);
    return {
      metric: "DR",
      definition: "Delivery rate = delivered orders / confirmed-base orders.",
      delivered: number(delivered),
      confirmedBase: number(confirmedBase),
      pct: ratioPct(delivered, confirmedBase),
      sampleSize: sample.sampleSize,
      sampleOk: sample.ok,
      minimum: sample.minimum,
      confidence: sample.confidence,
      evidence: rateEvidence("DR", delivered, confirmedBase)
    };
  }

  function makeInsight(fields) {
    fields = fields || {};
    return {
      id: fields.id || "",
      section: fields.section || "",
      topic: fields.topic || "",
      severity: fields.severity || fields.priority || "info",
      confidence: fields.confidence || "limited",
      sampleSize: number(fields.sampleSize),
      metric: fields.metric || null,
      threshold: fields.threshold || null,
      evidence: Array.isArray(fields.evidence) ? fields.evidence.filter(Boolean) : [],
      message: fields.message || fields.body || "",
      recommendation: fields.recommendation || "",
      trust: fields.trust || "measured"
    };
  }

  function decorateText(text, insight) {
    if (!insight) return text;
    var bits = [trustLabel(insight.trust)];
    if (insight.confidence) bits.push("confidence: " + insight.confidence);
    if (insight.evidence && insight.evidence.length) bits.push(insight.evidence[0]);
    return String(text || "") + " (" + bits.join(" · ") + ")";
  }

  return {
    DEFAULT_THRESHOLDS: Object.assign({}, DEFAULT_THRESHOLDS),
    thresholds: thresholds,
    ratioPct: ratioPct,
    pct: pct,
    sampleGate: sampleGate,
    confidence: confidence,
    trustLabel: trustLabel,
    evidenceCount: evidenceCount,
    rateEvidence: rateEvidence,
    ndrFact: ndrFact,
    drFact: drFact,
    makeInsight: makeInsight,
    decorateText: decorateText
  };
});
