// ─────────────────────────────────────────────────────────────────────────────
// section6-commission.js - Section 6: Taager daily net profit trend
// Vanilla-JS port of components/section6/Section6.jsx
//
// Signature:
//   window.renderSection6(mountEl, data, ctx)
//     mountEl  — HTMLElement to inject into (cleared first)
//     data     — data.commissionTrend  (shape: commissionTrendData)
//     ctx      — { onNavigate, accent, formatSAR }
// ─────────────────────────────────────────────────────────────────────────────

window.renderSection6 = function (mountEl, data, ctx) {
  const isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  function s6Txt(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }

  const _fbMonthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const _fbMonthsAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  // ── data ──────────────────────────────────────────────────────────────────
  const d = data || {};
  const activeCurrency = data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || 'SAR';
  const hasInputData = !!data;
  const total      = d.total      ?? 0;
  const totalDelta = d.totalDelta ?? 0;
  const periods    = d.periods    ?? { '7': [], '14': [], '30': [] };
  const benchmarks = d.benchmarks ?? {};

  // Fall-back period data (empty zeroes) — labels use the actual snapshot month name
  function buildFallback(days) {
    var _fbLabel = (d.snapshotMonthLabel && d.snapshotMonthLabel.split(' ')[0]) ||
      (window.dashboardI18n ? window.dashboardI18n.monthName(new Date().getMonth()) :
        (isAr ? _fbMonthsAr : _fbMonthsEn)[new Date().getMonth()]);
    var fb = [];
    for (var _i = 1; _i <= days; _i++) {
      fb.push({ d: _i + ' ' + _fbLabel, v: 0 });
    }
    return fb;
  }
  function getChartData(p) {
    const rows = periods[p] || [];
    if (rows.length > 0) return rows;
    if (hasInputData) return [];
    var daysBack = p === '7' ? 7 : p === '14' ? 14 : 30;
    return buildFallback(daysBack);
  }

  // ── static constants (from prototype) ──────────────────────────────────────
  const PERIODS = [
    { key: '7',  label: s6Txt('7 Days', '7 أيام') },
    { key: '14', label: s6Txt('14 Days', '14 يوم') },
    { key: '30', label: s6Txt('30 Days', '30 يوم') },
  ];

  let PERF_DATA = [];
  let METRICS_ROWS = [];
  let OBSERVATIONS = [];
  let RECS = [];

  // ── state ──────────────────────────────────────────────────────────────────
  let activePeriod = '30';
  let chartInstance = null;

  // ── helpers ────────────────────────────────────────────────────────────────
  function iconBarsHtml(color, size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
      <rect x="3"  y="14" width="4" height="7"  rx="1" fill="${color}"/>
      <rect x="10" y="9"  width="4" height="12" rx="1" fill="${color}"/>
      <rect x="17" y="4"  width="4" height="17" rx="1" fill="${color}"/>
    </svg>`;
  }

  // ── HTML builders ──────────────────────────────────────────────────────────

  var _now = new Date();
  // Use snapshot month from aggregator when available; fall back to current calendar month
  var _monthLabel = d.snapshotMonthLabel ||
    (window.dashboardI18n ? window.dashboardI18n.formatMonth(_now.getFullYear(), _now.getMonth()) :
      (((isAr ? _fbMonthsAr : _fbMonthsEn)[_now.getMonth()] + ' ' + _now.getFullYear())));
  var _timeLabel  = ('0' + _now.getHours()).slice(-2) + ':' + ('0' + _now.getMinutes()).slice(-2);
  var _accountLabel = window.currentActiveAccountLabel || s6Txt('All Accounts', 'كل الحسابات');

  function topBarHtml() {
    var averageSubtitle = s6Txt(
      'Taager Profit After Tax earned during the last ' + activePeriod + ' days',
      'متوسط ربح تاجر المحقق خلال آخر ' + activePeriod + ' يوم'
    );
    return `
      <style>.s6-status-chip span[style*="font-size:9px"]{display:none!important}</style>
      <div class="s6-topbar" style="display:flex;align-items:center;justify-content:space-between;
        padding:0 28px;height:68px;border-bottom:1px solid rgba(255,255,255,0.05);
        background:#080b12;position:sticky;top:0;z-index:10;flex-shrink:0;">

        <!-- right: dropdowns -->
        <div style="display:flex;gap:10px;">
          <span class="s6-status-chip" aria-label="${s6Txt('Dashboard period', 'فترة لوحة التحكم')}" style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:10px;
            border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);
            color:rgba(255,255,255,0.75);font-size:12px;font-weight:600;font-family:inherit;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="3" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
              <path d="M8 2v4M16 2v4M3 10h18" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span style="color:#f59e0b;">${_monthLabel}</span>
            <span style="color:rgba(255,255,255,0.35);font-size:9px;">▾</span>
          </span>
          <span class="s6-status-chip" aria-label="${s6Txt('Dashboard account', 'حساب لوحة التحكم')}" style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:10px;
            border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);
            color:rgba(255,255,255,0.75);font-size:12px;font-weight:600;font-family:inherit;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            ${_accountLabel}
            <span style="color:rgba(255,255,255,0.35);font-size:9px;">▾</span>
          </span>
        </div>

        <!-- center: title -->
        <div style="text-align:center;flex:1;">
          <div class="fade-up" style="font-size:20px;font-weight:900;color:#fff;
            display:flex;align-items:center;justify-content:center;gap:8px;">
            ${s6Txt('Daily Taager Profit After Tax Trend', 'اتجاه ربح تاجر بعد الضريبة اليومي')}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6z" fill="#f59e0b"/>
            </svg>
          </div>
          <div class="fade-up" style="font-size:11px;color:rgba(255,255,255,0.38);margin-top:3px;animation-delay:100ms;">
            ${averageSubtitle}
          </div>
        </div>

        <!-- left: pulse + time -->
        <div style="display:flex;align-items:center;gap:10px;">
          <svg width="22" height="14" viewBox="0 0 44 20" fill="none">
            <polyline points="0,10 8,10 12,3 16,17 20,10 26,10 30,5 34,14 38,10 44,10"
              stroke="#00e676" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="font-size:11px;color:rgba(255,255,255,0.4);">${s6Txt('Last update: Today', 'آخر تحديث: اليوم')}</span>
          <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.75);">${_timeLabel}</span>
        </div>
      </div>
    `;
  }

  function periodTabsHtml() {
    return PERIODS.map(p => {
      const active = p.key === activePeriod;
      return `<button
        id="s6-period-${p.key}"
        data-period="${p.key}"
        style="padding:6px 16px;border-radius:8px;
          border:${active ? '1.5px solid #14b8a6' : '1px solid rgba(255,255,255,0.12)'};
          background:${active ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)'};
          color:${active ? '#14b8a6' : 'rgba(255,255,255,0.45)'};
          font-size:12px;font-weight:${active ? 700 : 500};
          cursor:pointer;font-family:inherit;
          box-shadow:${active ? '0 0 12px rgba(20,184,166,0.3)' : 'none'};
          transition:all 0.15s;">
        ${p.label}
      </button>`;
    }).join('');
  }

  function headerRowHtml() {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
        background:#0b1120;border:1px solid rgba(255,255,255,0.07);
        border-radius:16px;padding:16px 22px;">

        <!-- left (visually): period tabs -->
        <div style="display:flex;gap:6px;" id="s6-period-tabs">
          ${periodTabsHtml()}
        </div>

        <!-- right (visually): total -->
        <div style="text-align:right;">
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:4px;">${s6Txt('Total Taager Profit After Tax', 'إجمالي ربح تاجر بعد الضريبة')}</div>
          <div style="display:flex;align-items:baseline;gap:10px;justify-content:flex-end;">
            <div style="display:inline-flex;align-items:center;gap:4px;
              background:rgba(0,230,118,0.12);border:1px solid rgba(0,230,118,0.25);
              border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;color:#00e676;">
              ↑ ${totalDelta}٪
            </div>
            <span style="font-size:30px;font-weight:900;color:#fff;letter-spacing:-1px;">
              <span id="s6-total-countup">0</span> ${activeCurrency}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  function areaChartCardHtml() {
    return `
      <div style="background:#0b1120;border:1px solid rgba(255,255,255,0.07);
        border-radius:16px;padding:18px 14px 10px;">
        <div id="s6-chart-wrap" style="position:relative;transition:opacity 0.3s;">
          <canvas id="s6-area-chart" height="240"></canvas>
        </div>
      </div>
    `;
  }

  function donutCardHtml() {
    const totalSAR = PERF_DATA.reduce((a, x) => a + x.sar, 0);
    const legendRows = PERF_DATA.map((d, i) => `
      <div class="fade-up" style="display:flex;align-items:center;justify-content:space-between;animation-delay:${400 + i * 80}ms;">
        <span style="font-size:13px;font-weight:800;color:${d.color};">
          ${d.sar.toLocaleString()} ${activeCurrency}
        </span>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="text-align:right;">
            <div style="font-size:11px;color:rgba(255,255,255,0.65);font-weight:600;">${d.label}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.35);">${d.days} أيام (${d.pct}٪)</div>
          </div>
          <div style="width:10px;height:10px;border-radius:3px;background:${d.color};box-shadow:0 0 6px ${d.color};"></div>
        </div>
      </div>
    `).join('');

    const thresholdItems = [
      { label: s6Txt('High', 'مرتفع'), range: '> 450 ' + activeCurrency,     color: '#00e676' },
      { label: s6Txt('Medium', 'متوسط'), range: '200 - 450 ' + activeCurrency, color: '#3b82f6' },
      { label: s6Txt('Low', 'منخفض'), range: '< 200 ' + activeCurrency,     color: '#ef4444' },
    ].map(t => `
      <div style="display:flex;align-items:center;gap:5px;">
        <div style="width:7px;height:7px;border-radius:2px;background:${t.color};"></div>
        <span style="font-size:10px;color:rgba(255,255,255,0.4);">${t.label} ${t.range}</span>
      </div>
    `).join('');

    return `
      <div style="background:#0b1120;border:1px solid rgba(255,255,255,0.07);
        border-radius:16px;padding:18px 20px;flex:1;">
        <!-- title -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);">${s6Txt('Taager Profit After Tax Distribution by Period', 'توزيع ربح تاجر بعد الضريبة حسب الفترة')}</div>
        </div>

        <!-- donut canvas wrapper -->
        <div style="position:relative;height:180px;display:flex;align-items:center;justify-content:center;isolation:isolate;">
          <canvas id="s6-donut-chart" width="180" height="180" style="position:relative;z-index:2;"></canvas>
          <!-- center label -->
          <div style="position:absolute;z-index:1;text-align:center;pointer-events:none;">
            <div style="font-size:20px;font-weight:900;color:#fff;" id="s6-donut-total">
              ${totalSAR.toLocaleString()}
            </div>
            <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);">${s6Txt('Total Taager Profit After Tax', 'إجمالي ربح تاجر بعد الضريبة')}</div>
          </div>
        </div>

        <!-- legend -->
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
          ${legendRows}
        </div>

        <!-- threshold row -->
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);
          display:flex;justify-content:space-between;">
          ${thresholdItems}
        </div>
      </div>
    `;
  }

  function metricsCardHtml() {
    const rows = METRICS_ROWS.map((r, i) => `
      <div class="fade-up" style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 0;border-bottom:${i < METRICS_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'};
        animation-delay:${300 + i * 70}ms;">
        <div style="font-size:16px;font-weight:800;color:${r.color};letter-spacing:-0.3px;">
          ${r.value} <span style="font-size:11px;font-weight:600;">${r.unit}</span>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);text-align:right;">${r.label}</div>
      </div>
    `).join('');

    return `
      <div style="background:#0b1120;border:1px solid rgba(255,255,255,0.07);
        border-radius:16px;padding:18px 20px;flex:1;">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);
            display:flex;align-items:center;gap:7px;">
            ${s6Txt('Performance Metrics', 'مقاييس الأداء')}
          </div>
          ${iconBarsHtml('rgba(255,255,255,0.35)', 15)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          ${rows}
        </div>
      </div>
    `;
  }

  function observationsCardHtml() {
    const items = OBSERVATIONS.map((obs, i) => `
      <div class="fade-up" style="display:flex;align-items:flex-start;gap:12px;
        padding:10px 12px;
        background:${obs.iconBg}0d;border:1px solid ${obs.iconBg}22;
        border-radius:10px;animation-delay:${300 + i * 100}ms;">
        <div style="width:36px;height:36px;border-radius:50%;
          background:${obs.iconBg}1a;border:1.5px solid ${obs.iconBg}45;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${obs.iconSvg}
        </div>
        <div style="text-align:right;flex:1;">
          <div style="font-size:12px;font-weight:700;color:${obs.iconBg};margin-bottom:3px;">${obs.title}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.65);line-height:1.5;">${obs.line1}</div>
          ${obs.line2 ? `<div style="font-size:11px;font-weight:700;color:${obs.line2Color};margin-top:2px;">${obs.line2}</div>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <div style="background:#0b1120;border:1px solid rgba(255,255,255,0.07);
        border-radius:16px;padding:18px 20px;flex:1;">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);
            display:flex;align-items:center;gap:7px;">
            ${s6Txt('Key Highlights', 'أبرز الملاحظات')}
          </div>
          ${iconBarsHtml('rgba(255,255,255,0.35)', 15)}
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${items}
        </div>
      </div>
    `;
  }

  function recommendationsHtml() {
    const cards = RECS.map((r, i) => `
      <div class="fade-up" style="flex:1;background:${r.bg};border:1px solid ${r.border};
        border-radius:14px;padding:16px 18px;direction:ltr;display:flex;align-items:center;gap:14px;
        animation-delay:${500 + i * 100}ms;">
        <div style="width:46px;height:46px;border-radius:50%;
          background:${r.glow}20;border:1.5px solid ${r.glow}40;
          box-shadow:0 0 14px ${r.glow}35;
          display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
          ${r.emoji}
        </div>
        <div style="text-align:right; flex:1;">
          <div style="font-size:12px;font-weight:800;color:#fff;margin-bottom:4px;">${r.title}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.5;">${r.body}</div>
          <div style="font-size:11px;font-weight:700;color:${r.glow};margin-top:3px;">${r.cta}</div>
        </div>
      </div>
    `).join('');

    return `
      <div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:12px;">
          <span style="font-size:14px;font-weight:800;color:rgba(255,255,255,0.8);">${s6Txt('Recommendations to Improve Performance', 'توصيات لتحسين الأداء')}</span>
          <div style="width:28px;height:28px;border-radius:8px;
            background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.35);
            display:flex;align-items:center;justify-content:center;font-size:15px;">💡</div>
        </div>
        <div class="s6-recs-row" style="display:flex;gap:14px;">
          ${cards}
        </div>
      </div>
    `;
  }

  // ── full render ────────────────────────────────────────────────────────────
  function render() {
    // ── dynamic calculations ───────────────────────────────────────────────
    const chartData = getChartData(activePeriod);
    const values = chartData.map(x => x.v);
    const n = values.length || 1;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = parseFloat((sum / n).toFixed(2));
    const maxVal = Math.max(...values, 0);
    const minVal = values.length > 0 ? Math.min(...values) : 0;
    const aboveAvgDays = values.filter(v => v > avg).length;
    const last24h = values.length > 0 ? values[values.length - 1] : 0;

    let highDays = 0, highSar = 0;
    let midDays = 0, midSar = 0;
    let lowDays = 0, lowSar = 0;

    values.forEach(v => {
      if (v > 450) {
        highDays++;
        highSar += v;
      } else if (v >= 200) {
        midDays++;
        midSar += v;
      } else {
        lowDays++;
        lowSar += v;
      }
    });

    PERF_DATA = [
      { key: 'high', label: s6Txt('High Performance', 'أداء مرتفع'), days: highDays, pct: parseFloat(((highDays / n) * 100).toFixed(1)), sar: highSar, color: '#00e676', threshold: '> 450 ' + activeCurrency     },
      { key: 'mid',  label: s6Txt('Medium Performance', 'أداء متوسط'), days: midDays,  pct: parseFloat(((midDays / n) * 100).toFixed(1)),  sar: midSar,  color: '#3b82f6', threshold: '200 - 450 ' + activeCurrency },
      { key: 'low',  label: s6Txt('Low Performance', 'أداء منخفض'), days: lowDays,  pct: parseFloat(((lowDays / n) * 100).toFixed(1)),  sar: lowSar,  color: '#ef4444', threshold: '< 200 ' + activeCurrency     },
    ];

    METRICS_ROWS = [
      { label: s6Txt('Average Daily Taager Profit After Tax', 'متوسط ربح تاجر بعد الضريبة اليومي'), value: avg.toLocaleString('en-US'), unit: activeCurrency, color: 'rgba(255,255,255,0.85)' },
      { label: s6Txt('Highest Daily Taager Profit After Tax', 'أعلى ربح تاجر بعد الضريبة يومي'),       value: maxVal.toLocaleString('en-US'),    unit: activeCurrency, color: '#00e676' },
      { label: s6Txt('Lowest Daily Taager Profit After Tax', 'أقل ربح تاجر بعد الضريبة يومي'),        value: minVal.toLocaleString('en-US'),    unit: activeCurrency, color: '#ef4444' },
      { label: s6Txt('Days Above Average', 'أيام فوق المتوسط'),       value: aboveAvgDays.toString(),      unit: s6Txt('days', 'أيام'), color: 'rgba(255,255,255,0.85)' },
      { label: s6Txt('Last 24 Hours', 'آخر 24 ساعة'),           value: last24h.toLocaleString('en-US'),     unit: activeCurrency, color: 'rgba(255,255,255,0.85)' },
    ];

    // Find best day
    const maxIdx = values.indexOf(maxVal);
    const bestDayLabel = maxIdx !== -1 ? chartData[maxIdx].d : 'N/A';

    // Velocity / growth
    const half = Math.floor(n / 2);
    const firstHalfSum = values.slice(0, half).reduce((a, b) => a + b, 0);
    const secondHalfSum = values.slice(half).reduce((a, b) => a + b, 0);
    const velocityChange = firstHalfSum > 0 ? parseFloat((((secondHalfSum - firstHalfSum) / firstHalfSum) * 100).toFixed(1)) : 0;

    const velocityText = velocityChange >= 0
      ? s6Txt(`Second half is higher by ${velocityChange}% than the first half`, `النصف الثاني أعلى بـ ${velocityChange}% من النصف الأول`)
      : s6Txt(`Second half is lower by ${Math.abs(velocityChange)}% than the first half`, `النصف الثاني أقل بـ ${Math.abs(velocityChange)}% من النصف الأول`);

    const pctAboveAvg = avg > 0 ? Math.round(((maxVal - avg) / avg) * 100) : 0;

    OBSERVATIONS = [
      {
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 7L13.5 15.5L8.5 10.5L2 17" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7h6v6" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        iconBg:   '#00e676',
        title:    s6Txt('Best Performing Day', 'أفضل يوم أداء'),
        line1:    `${maxVal.toLocaleString()} ${activeCurrency} — ${bestDayLabel} ` + s6Txt('(highest value in the period)', '(أعلى قيمة في الفترة)'),
        line2:    `↑ ${pctAboveAvg}% ` + s6Txt('above daily average', 'فوق المتوسط اليومي'),
        line2Color: '#00e676',
      },
      {
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#f59e0b" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/></svg>`,
        iconBg:   '#f59e0b',
        title:    s6Txt('Half-Half Performance', 'أداء النصفين'),
        line1:    velocityText,
        line2:    null,
        line2Color: null,
      },
      {
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="14" width="4" height="7" rx="1" fill="#a855f7"/><rect x="10" y="9" width="4" height="12" rx="1" fill="#a855f7"/><rect x="17" y="4" width="4" height="17" rx="1" fill="#a855f7"/></svg>`,
        iconBg:   '#a855f7',
        title:    s6Txt('General Trend', 'اتجاه عام'),
        line1:    velocityChange >= 0 ? s6Txt('Stable upward trend in Taager profit performance', 'اتجاه تصاعدي مستقر في أداء ربح تاجر') : s6Txt('Relative stability in daily Taager profit performance', 'استقرار نسبي في أداء ربح تاجر اليومي'),
        line2:    s6Txt('With natural fluctuations in sales and activity', 'مع تقلبات طبيعية في المبيعات والنشاط'),
        line2Color: 'rgba(255,255,255,0.4)',
      },
    ];

    const lowDaysList = chartData.filter(x => x.v < 200).slice(0, 3).map(x => x.d);
    const lowDaysStr = lowDaysList.length > 0 ? `(${lowDaysList.join(isAr ? '، ' : ', ')})` : s6Txt('during low periods', 'خلال الفترات المنخفضة');

    RECS = [
      {
        emoji: '🎯', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', glow: '#ef4444',
        title: s6Txt('Focus on Winning Products', 'ركّز على المنتجات الرابحة'),
        body:  s6Txt('Maintain your marketing focus on the highly demanded products', 'حافظ على تركيزك التسويقي لأكثر المنتجات طلباً'),
        cta:   s6Txt('Continue promoting them', 'استمر في الترويج لها'),
      },
      {
        emoji: '📅', bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.28)', glow: '#14b8a6',
        title: s6Txt('Analyze Low-performing Days', 'تحليل الأيام المنخفضة'),
        body:  s6Txt('Review marketing strategies and activity during days with lowest Taager profit', 'راجع استراتيجيات التسويق والنشاط بالأيام الأقل ربحا من تاجر'),
        cta:   lowDaysStr,
      },
      {
        emoji: '📈', bg: 'rgba(0,230,118,0.12)', border: 'rgba(0,230,118,0.28)', glow: '#00e676',
        title: s6Txt('Leverage Current Momentum', 'استفد من الزخم الحالي'),
        body:  velocityChange >= 0
          ? s6Txt('Maintain your current activity level, there is a steady improvement', 'حافظ على معدل النشاط الحالي، هناك تحسن مستمر')
          : s6Txt('Stimulate your marketing campaigns to increase Taager profit volume and daily activity', 'حفز حملاتك التسويقية لزيادة حجم ربح تاجر والنشاط اليومي'),
        cta:   velocityChange >= 0
          ? s6Txt('Steady improvement in performance', 'تحسن مستمر في الأداء')
          : s6Txt('Boost marketing activity', 'حفز النشاط التسويقي'),
      },
    ];

    mountEl.innerHTML = `
      <div class="dash-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;background:#080b12; font-family:inherit;">

        ${topBarHtml()}

        <div class="s6-body" style="padding:20px 28px;display:flex;flex-direction:column;gap:16px;">

          <!-- ROW 1: header + chart -->
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${headerRowHtml()}
            ${areaChartCardHtml()}
          </div>

          <!-- ROW 2: 3 analysis cards -->
          <div class="s6-analysis-row" style="display:flex;gap:14px;">
            ${donutCardHtml()}
            ${metricsCardHtml()}
            ${observationsCardHtml()}
          </div>

          <!-- ROW 3: recommendations -->
          ${recommendationsHtml()}

        </div>
      </div>
    `;

    // wire up
    wireEvents();
    buildAreaChart();
    buildDonutChart();
    animateTotalCountup();
  }

  // ── Chart.js helpers ───────────────────────────────────────────────────────
  function buildAreaChart() {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const canvas = document.getElementById('s6-area-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const chartData = getChartData(activePeriod);
    const labels = chartData.map(x => x.d);
    const values = chartData.map(x => x.v);

    const canvasCtx = canvas.getContext('2d');
    const theme = window.dashboardThemeColors ? window.dashboardThemeColors() : {
      bg: '#080b12',
      surface: 'rgba(11,17,32,0.95)',
      borderSoft: 'rgba(255,255,255,0.1)',
      text: '#fff',
      muted: 'rgba(255,255,255,0.5)',
      grid: 'rgba(255,255,255,0.05)',
      label: 'rgba(255,255,255,0.38)'
    };
    const grad = canvasCtx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0.05, 'rgba(0,230,118,0.35)');
    grad.addColorStop(0.95, 'rgba(0,230,118,0)');

    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: '#00e676',
          borderWidth: 2.5,
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          pointRadius: 3.5,
          pointBackgroundColor: '#00e676',
          pointBorderColor: theme.bg,
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#00e676',
          pointHoverBorderColor: theme.bg,
          pointHoverBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.surface,
            borderColor: 'rgba(0,230,118,0.3)',
            borderWidth: 1,
            titleColor: theme.muted,
            bodyColor: '#00e676',
            bodyFont: { weight: '700', size: 13 },
            callbacks: {
              label: ctx => `${Number(ctx.parsed.y || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${activeCurrency}`,
            },
          },
          // value labels above each point
          datalabels: false,
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: theme.label,
              font: { size: 10, family: 'inherit' },
              maxRotation: 0,
              // Show fewer ticks for readability
              maxTicksLimit: activePeriod === '30' ? 10 : activePeriod === '14' ? 7 : 7,
            },
          },
          y: {
            grid: {
              color: theme.grid,
              drawBorder: false,
            },
            border: { display: false, dash: [4, 4] },
            ticks: {
              color: theme.label,
              font: { size: 10, family: 'inherit' },
              maxTicksLimit: 5,
            },
          },
        },
      },
    });

    // Custom value-label overlay drawn after chart renders
    chartInstance.options.animation = {
      duration: 220,
      onComplete: function () {
        drawValueLabels(chartInstance);
      },
    };
    chartInstance.update();
  }

  function drawValueLabels(chart) {
    const { ctx, data, scales } = chart;
    const dataset = data.datasets[0];
    ctx.save();
    ctx.font = '700 10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    dataset.data.forEach((value, i) => {
      const x = scales.x.getPixelForValue(i);
      const y = scales.y.getPixelForValue(value);
      const label = Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
      const w = Math.max(36, ctx.measureText(label).width + 12);
      const h = 16;
      const lx = x - w / 2;
      const ly = y - 30;

      // pill background
      ctx.fillStyle = 'rgba(0,230,118,0.15)';
      ctx.strokeStyle = 'rgba(0,230,118,0.35)';
      ctx.lineWidth = 0.8;
      roundRect(ctx, lx, ly, w, h, 5);
      ctx.fill();
      ctx.stroke();

      // label text
      ctx.fillStyle = '#00e676';
      ctx.fillText(label, x, ly + h / 2);
    });
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function buildDonutChart() {
    const canvas = document.getElementById('s6-donut-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const theme = window.dashboardThemeColors ? window.dashboardThemeColors() : {
      surface: 'rgba(11,17,32,0.95)',
      borderSoft: 'rgba(255,255,255,0.1)',
      text: '#fff'
    };

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: PERF_DATA.map(d => d.label),
        datasets: [{
          data: PERF_DATA.map(d => d.pct),
          backgroundColor: PERF_DATA.map(d => d.color),
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        cutout: '68%',
        animation: { duration: 260, animateRotate: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.surface,
            borderColor: theme.borderSoft,
            borderWidth: 1,
            bodyColor: theme.text,
            callbacks: {
              label: (ctx) => {
                const perf = PERF_DATA[ctx.dataIndex];
                return ` ${Number(perf.sar || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${activeCurrency} — ${perf.days} ` + s6Txt('days', 'أيام');
              },
            },
          },
        },
        spacing: 4,
      },
    });
  }

  function animateTotalCountup() {
    const el = document.getElementById('s6-total-countup');
    if (!el) return;
    if (typeof window.animateNumber === 'function') {
      window.animateNumber(el, total, { duration: 520 });
    } else {
      el.textContent = total.toLocaleString('en-US');
    }
  }

  // ── event wiring ───────────────────────────────────────────────────────────
  function wireEvents() {
    const tabContainer = document.getElementById('s6-period-tabs');
    if (!tabContainer) return;

    tabContainer.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-period]');
      if (!btn) return;
      const newPeriod = btn.dataset.period;
      if (newPeriod === activePeriod) return;
      activePeriod = newPeriod;

      // Full re-render to update all metrics, charts, donut and observations!
      render();
    });
  }

  // ── go ────────────────────────────────────────────────────────────────────
  render();
};
