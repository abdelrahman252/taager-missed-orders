/* ══════════════════════════════════════════════════════════════════════════════
   dashboard-aggregator-score.js  (T-14)
   Pure scoring functions — no side effects, no DOM, no global state.
   All return a rounded integer 0–100.

   Exposed on window:
     computeRiskScore(stats)
     computeScalingScore(stats, nationalAverages)
     computeProfitabilityScore(stats, nationalAverages)
     computePipelineHealth(stats)
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── computeRiskScore(stats) → 0–100 (100 = most dangerous) ─────────────────
     Composite:
              50% - NDR component   (0 at >=40%, 100 at <20%)
       30% — COD component   (high COD% × high COD NDR)
       20% — Gap component   (unpaid COD gap / total due)
  ─────────────────────────────────────────────────────────────────────────────── */
  window.computeRiskScore = function (stats) {
    if (!stats) return 0;

    var ndr = Number(stats.ndrPct) > 1
      ? Number(stats.ndrPct) / 100          // already a percentage
      : Number(stats.ndrPct) || 0;          // already a fraction
    if (ndr > 1) ndr = ndr / 100;
    var ndrComponent = ndr >= 0.40
      ? 0
      : (ndr < 0.20 ? 100 : Math.round(((0.40 - ndr) / 0.20) * 100));

    // COD component: codPct (fraction) × codNdr (fraction) × 150
    var codPct = Number(stats.codPct) || 0;
    if (codPct > 1) codPct = codPct / 100;
    // codNdr: derive from codDeliveredCount / codCount if not stored directly
    var codNdr = 0;
    if (stats.codNdr !== undefined) {
      codNdr = Number(stats.codNdr);
      if (codNdr > 1) codNdr = codNdr / 100;
    } else if (stats.codCount > 0) {
      codNdr = ndr;
    }
    var codNdrRisk = codNdr >= 0.40
      ? 0
      : (codNdr < 0.20 ? 100 : Math.round(((0.40 - codNdr) / 0.20) * 100));
    var codComponent = Math.min(100, codPct * codNdrRisk);

    // Gap component: gap / due (fraction of uncollected revenue)
    var due = Number(stats.due) || 0;
    var gap = Number(stats.gap) || 0;
    var gapComponent = due > 0 ? Math.min(100, (gap / due) * 100) : 0;

    var riskScore = (ndrComponent * 0.5) + (codComponent * 0.3) + (gapComponent * 0.2);
    return Math.round(Math.min(100, Math.max(0, riskScore)));
  };

  /* ── computeScalingScore(stats, nationalAverages) → 0–100 (100 = best to scale)
     Composite:
       50% — DR ratio vs national average (capped at 2×)
       20% — Volume score (capped at 200 orders)
       20% — Prepaid adoption bonus
       10% — Consistency (inverse of NDR stddev if available)
  ─────────────────────────────────────────────────────────────────────────────── */
  window.computeScalingScore = function (stats, nationalAverages) {
    if (!stats) return 0;
    var nat = nationalAverages || {};

    var drPct = Number(stats.drPct) || 0;
    if (drPct > 1) drPct = drPct / 100;
    var nationalDr = Number(nat.dr) || 0.30;        // fallback to healthy baseline if unknown
    if (nationalDr > 1) nationalDr = nationalDr / 100;

    // DR ratio: capped at 2× national average → maps to 0–50
    var drRatio   = nationalDr > 0 ? Math.min(2, drPct / nationalDr) : 0;
    var drScore   = drRatio * 50;

    // Volume score: 0–20 (saturates at 200 orders)
    var count       = Number(stats.count) || Number(stats.orders) || 0;
    var volumeScore = Math.min(1, count / 200) * 20;

    // Prepaid bonus: 0–20 (higher prepaid adoption = easier to scale)
    var prepaidPct = Number(stats.prepaidPct) || 0;
    if (prepaidPct > 1) prepaidPct = prepaidPct / 100;
    var prepaidBonus = prepaidPct * 20;

    // Consistency: uses ndrStddev if provided, otherwise max score
    var stddev          = Number(stats.ndrStddev) || 0;
    var consistencyScore = (1 - Math.min(1, stddev)) * 10;

    var scalingScore = drScore + volumeScore + prepaidBonus + consistencyScore;
    return Math.round(Math.min(100, Math.max(0, scalingScore)));
  };

  /* ── computeProfitabilityScore(stats, nationalAverages) → 0–100 ──────────────
     Composite:
       60% — Commission ratio vs expected (earned / (count × avgCommission))
       40% — Revenue efficiency (earnedCommission / totalRevenue)
     Both sub-scores normalised to 0–100 before weighting.
  ─────────────────────────────────────────────────────────────────────────────── */
  window.computeProfitabilityScore = function (stats, nationalAverages) {
    if (!stats) return 0;
    var nat = nationalAverages || {};

    var earnedComm   = Number(stats.earnedCommission) || Number(stats.commission) || 0;
    var count        = Number(stats.count) || Number(stats.orders) || Number(stats.placedCount) || 1;
    var avgComm      = Number(nat.avgCommission) || 1;
    var totalRevenue = Number(stats.totalRevenue) || Number(stats.revenue) || 0;

    // Commission ratio: how much was earned vs what could have been earned if all delivered at average
    var commissionRatio  = Math.min(2, earnedComm / Math.max(1, count * avgComm));
    var commissionScore  = commissionRatio * 50;   // 0–100, then ×60% weight

    // Revenue efficiency: what fraction of total potential revenue became earned commission
    var revenueEfficiency = totalRevenue > 0
      ? Math.min(1, earnedComm / totalRevenue)
      : 0;
    var revenueScore = revenueEfficiency * 100;    // 0–100, then ×40% weight

    var profScore = (commissionScore * 0.6) + (revenueScore * 0.4);
    return Math.round(Math.min(100, Math.max(0, profScore)));
  };

  /* ── computePipelineHealth(stats) → 0–100 ────────────────────────────────────
     Measures the quality of the active order pipeline.
     Good orders (delivered + confirmed + shipping + processing) contribute positively.
     Bad orders (canceled × 2 + failed × 1.5) reduce the score.
  ─────────────────────────────────────────────────────────────────────────────── */
  window.computePipelineHealth = function (stats) {
    if (!stats) return 0;

    var total = Number(stats.count) || Number(stats.placedCount) || 0;
    if (total === 0) return 0;

    var delivered   = Number(stats.deliveredOrders)  || Number(stats.deliveredCount)  || 0;
    var confirmed   = Number(stats.confirmedCount)   || 0;
    var shipping    = Number(stats.shippingCount)    || 0;
    var processing  = Number(stats.processingCount)  || 0;
    var canceled    = Number(stats.canceledCount)    || Number(stats.failedCount)      || 0;
    var failed      = Number(stats.failedCount)      || canceled;

    var goodOrders = delivered + confirmed + shipping + processing;
    var badOrders  = (canceled * 2) + (failed * 1.5);

    // Clamp: bad orders can't exceed total (double-counting guard)
    badOrders = Math.min(badOrders, total * 2);

    var health = Math.max(0, ((goodOrders - badOrders) / total) * 100);
    return Math.round(Math.min(100, health));
  };

})();
