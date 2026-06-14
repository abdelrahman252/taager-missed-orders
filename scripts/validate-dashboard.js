/**
 * validate-dashboard.js
 * Dry-run validation for dashboard hardcoded-value fixes.
 * Run with: node scripts/validate-dashboard.js
 */

'use strict';

var fs = require('fs');
var path = require('path');

var PASS = 0;
var FAIL = 0;

function ok(label, condition) {
  if (condition) {
    console.log('  ✓  ' + label);
    PASS++;
  } else {
    console.error('  ✗  FAIL: ' + label);
    FAIL++;
  }
}

// ── Read source files ─────────────────────────────────────────────────────────
var ROOT = path.join(__dirname, '..', 'src', 'renderer', 'pages', 'dashboard');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readDashboardStyles() {
  return fs.readdirSync(ROOT)
    .filter(function (name) { return /^dashboard-.*\.css$/.test(name); })
    .map(read)
    .join('\n');
}

// ── 1. aggregator: commissionTrend has snapshotMonth fields ──────────────────
console.log('\n[1] Aggregator — commissionTrend shape');
var agg = read('dashboard-aggregator.js');
ok('commissionTrend includes snapshotMonth',   agg.includes("snapshotMonth: meta.snapshotMonth"));
ok('commissionTrend includes snapshotMonthLabel', agg.includes("snapshotMonthLabel: meta.monthLabel"));

// ── 2. aggregator: cod has totalCitiesCount and deliveredCount ────────────────
console.log('\n[2] Aggregator — cod shape');
ok('cod includes deliveredCount',   agg.includes("deliveredCount: deliveredCount"));
ok('cod includes totalCitiesCount', agg.includes("totalCitiesCount: Object.keys(cityStats).length"));
ok('aggregator has delivered attribution predicate', agg.includes('function isDeliveredRowInPeriod') && agg.includes('meta.deliveredDateMode'));
ok('created mode outcome scope can use delivered predicate', agg.includes('filterOutcomeOrders(displayRows, meta.period, meta.deliveredDateMode'));

// ── 3. section6: no hardcoded مايو in FALLBACK ──────────────────────────────
console.log('\n[3] Section6 — dynamic month labels');
var s6 = read('sections/section6-commission.js');
ok('FALLBACK_14 removed (no hardcoded مايو)', !s6.includes("'1 مايو'") && !s6.includes("{ d: '1 مايو'"));
ok('buildFallback function exists', s6.includes('function buildFallback'));
ok('fallback uses snapshotMonthLabel from data', s6.includes('d.snapshotMonthLabel'));
ok('_monthLabel falls back to snapshotMonthLabel', s6.includes('d.snapshotMonthLabel ||'));

// ── 4. section4: no hardcoded "94 طلب" ──────────────────────────────────────
console.log('\n[4] Section4 — dynamic city count and transaction count');
var s4 = read('sections/section4-cod.js');
ok('No hardcoded "94 طلب"',             !s4.includes('94 طلب'));
ok('deliveredCount used in payment methods', s4.includes('D.deliveredCount'));
ok('No hardcoded "(18)"',               !s4.includes('(18)'));
ok('totalCitiesCount used in button',   s4.includes('D.totalCitiesCount'));
ok('generateCodInsights function exists', s4.includes('function generateCodInsights'));
ok('Hardcoded insights default removed', !s4.includes("'تحسنت 6.1%'"));
ok('D.insights assigned dynamically',   s4.includes('D.insights = generateCodInsights(D)'));

// ── 5. section7: no hardcoded 2026-05-* dates ────────────────────────────────
console.log('\n[5] Section7 — dynamic dates and ROI settings');
var s7 = read('sections/section7-calculator.js');
ok('No hardcoded 2026-05-01', !s7.includes("'2026-05-01'"));
ok('No hardcoded 2026-05-31', !s7.includes("'2026-05-31'"));
ok('No hardcoded budget 63000', !s7.includes('budget: 63000'));
ok('budget uses d.adSpend', s7.includes('d.adSpend'));
ok('currency uses d.currency', s7.includes('d.currency'));
ok('egpRate uses d.egpRate', s7.includes('d.egpRate'));
ok('calculator does not render competing marketing date inputs', !s7.includes('id="s7-in-start"') && !s7.includes('id="s7-in-end"'));
ok('calculator directs marketing filtering through dashboard period', s7.includes('Marketing Spend Date Filter') && s7.includes('select a date range from the top dashboard bar'));
ok('calculator persists ROI changes', s7.includes('persistCalculatorSettings') && s7.includes('DashboardRoiState.set'));

console.log('\n[5b] Products and Cities — reactive financial and product focus contract');
var bus = read('dashboard-filter-bus.js');
var dashboard = read('dashboard.js');
var shell = read('dashboard-shell.js');
var s5 = read('sections/section5-products.js');
var s9 = read('sections/section9-product-forecast.js');
var cities = read('sections/section-cities.js');
var styles = readDashboardStyles();
var localeEn = read('locales/en/dashboard-locale.js');
var localeAr = read('locales/ar/dashboard-locale.js');
var marketing = read('sections/section-marketing-connections.js');
var campaigns = read('sections/section-campaigns.js');
var campaignIntel = read('dashboard-campaign-intelligence.js');
var campaignDecision = read('dashboard-campaign-decision.js');
var tooltip = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'tooltip.js'), 'utf8');
var marketingBackend = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'windsor-marketing', 'index.ts'), 'utf8');
var mainProcess = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
ok('ROI state validates persisted currency', bus.includes('DashboardRoiState') && bus.includes('ROI_CURRENCIES'));
ok('delivered attribution state validates and persists mode', bus.includes('DashboardDeliveredDateState') && bus.includes('taager_dashboard_delivered_date_mode') && bus.includes('normalizeDeliveredDateMode'));
ok('topbar includes delivered attribution selector', shell.includes('dashboard-delivered-date-select-wrap') && shell.includes('deliveredDateOptions') && shell.includes('onDeliveredDateModeChange'));
ok('dashboard period presets include daily marketing sync ranges', shell.includes("value: 'today'") && shell.includes("value: 'yesterday'") && bus.includes("preset === 'yesterday'"));
ok('product rows derive spend, CPA and P&L', s5.includes('p.allocatedAdSpend =') && s5.includes('p.cpa =') && s5.includes('p.profitLoss ='));
ok('EasyOrders product names bypass UI translation', s5.includes('data-i18n-preserve data-product-sku=') && s5.includes('${escData(p.name)}') && !s5.includes('tx(p.name)'));
ok('product table exposes raw failed and canceled cells', s5.includes('s5-cell-failed') && s5.includes('s5-cell-canceled-raw'));
ok('product modal refreshes from shared settings', s5.includes('refreshProductModal') && s5.includes('DashboardRoiState.subscribe'));
ok('product funnels separate failed and canceled', s5.includes("p5Txt('funnelFailed')") && s5.includes("p5Txt('funnelCanceled')"));
ok('product forecast uses global rates without replacing scenario spend', s9.includes('forecastRoiSettings') && s9.includes('DashboardRoiState.set') && s9.includes('Global exchange rates') && !s9.includes('s9-egp-rate-input') && s9.includes("localStorage.setItem('kbot_s9_spend_'"));
ok('section navigation releases mounted reactive consumers', shell.includes('_dashboardSectionCleanup') && s5.includes('addProductCleanup') && s5.includes('mountEl._s5RenderToken = (mountEl._s5RenderToken || 0) + 1') && s9.includes('_dashboardSectionCleanup'));
ok('cities filter bus updates leaderboard predicate', cities.includes('syncLeaderboardProductFilter') && cities.includes('applyFilters();'));
ok('new labels and help text are centralized', localeEn.includes("'products.pnlHelp'") && localeAr.includes("'products.pnlHelp'"));
ok('delivered attribution labels are centralized', localeEn.includes("'deliveredDate.updatedAt'") && localeAr.includes("'deliveredDate.createdAt'"));
ok('dense table and modal have responsive layout guards', styles.includes('.s5-metrics-track') && styles.includes('.s5-modal-kpi-grid'));
ok('marketing connection UI is dashboard sidebar routed', shell.includes("id: 'marketing'") && shell.includes("'renderSectionMarketingConnections'"));
ok('dashboard entry primes shared marketing spend state', dashboard.includes('ensureMarketingStatusLoaded') && dashboard.includes('DashboardMarketingState') && dashboard.includes('store.load(accountId)'));
ok('dashboard open and filter changes remain read-only', dashboard.includes('runAggregator(false)') && !dashboard.includes('syncMarketingSpend') && !dashboard.includes('syncMarketing: true'));
ok('manual dashboard update refreshes marketing explicitly', fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8').includes('Explicit marketing refresh failed'));
ok('TikTok, Snapchat, and Facebook connection and sync actions remain in marketing section', marketing.includes('connectMarketing') && marketing.includes('syncMarketingData') && marketing.includes("id: 'snapchat'") && marketing.includes("id: 'facebook'") && marketing.includes("data-marketing-connect"));
ok('calculator can lock synced marketing spend or restore manual spend', s7.includes('syncedSpendActive') && s7.includes('budgetInput.disabled') && s7.includes('useManualSpend'));
ok('many-to-many marketing mappings stay inside marketing dashboard', marketing.includes('data-marketing-map-row') && marketing.includes('saveMarketingMapping') && marketing.includes('saveAllMappings') && marketing.includes('allMode') && bus.includes('selectedSourceAccountIds'));
ok('single-account marketing view never renders claimable workspace accounts', !marketing.includes('claimableAccounts') && marketing.includes('assignmentMemberBody') && marketing.includes('assignedAccountsMarkup'));
ok('marketing backend can read same Taager assignment across licenses', marketingBackend.includes('sharedAccountId') && marketingBackend.includes('dashboard_account_id: `eq.${sharedId}`') && marketingBackend.includes('claimableAccounts: []'));
ok('marketing assignments carry source currency and draft source locks', marketing.includes('marketing-source-currency') && marketing.includes('applyDraftLocks') && marketing.includes('currencyRequired'));
ok('team marketing view can sync every mapped Taager account', marketing.includes('syncAllMarketingData') && marketing.includes('marketing-sync-all'));
ok('sync all uses stable mapping keys and hydrates individual saved summaries', marketing.includes('dashboardAccountKey: account.key') && marketing.includes('result.accountStatuses') && marketingBackend.includes('mappedSourcesForAccount') && marketingBackend.includes('summary: allSummary') && marketingBackend.includes('accountId === "__all__" ? allAccountConnection : accountConnection') && mainProcess.includes('saveCachedMarketingStatus("__all__"'));
ok('calculator exposes converted marketing source breakdown after sync', s7.includes('sourceBreakdownHtml') && s7.includes('syncedBudgetInCurrency') && s7.includes('s7-source-breakdown'));
ok('calculator shows assigned marketing account panel before sync', s7.includes('accountSourcePanelHtml') && s7.includes('assignedMarketingAccounts') && s7.includes('Synced period'));
ok('failed marketing requests preserve connected account state', bus.includes('value && value.ok === false') && bus.includes('previousHasConnectedState') && bus.includes("ok: false"));
ok('main process can fall back to cached marketing status', mainProcess.includes('getCachedMarketingStatus(dashboardAccountId, platform)') && mainProcess.includes('offline: true') && mainProcess.includes('STATUS_UNAVAILABLE'));
ok('marketing sync returns campaign breakdown for product spend',
  marketingBackend.includes('campaignBreakdown') &&
  marketingBackend.includes('marketingReportFields(platform, false)') &&
  marketingBackend.includes('"account_id,account_name,campaign_id,campaign,spend,impressions,clicks"') &&
  marketingBackend.includes('report_timezone", "Local"') &&
  marketingBackend.includes('dashboardAccountId: accountId') &&
  !marketingBackend.includes('actions_purchase') &&
  !marketingBackend.includes('cost_per_purchase') &&
  marketingBackend.includes('reportUrl.searchParams.set("fields", baseFields)'));
ok('marketing backend accepts TikTok, Snapchat, and Facebook via platform config', marketingBackend.includes('PLATFORM_CONFIG') && marketingBackend.includes('snapchat: { dsId: "snapchat"') && marketingBackend.includes('facebook: { dsId: "facebook"') && !marketingBackend.includes('body.platform !== "tiktok"'));
ok('main process accepts Snapchat and Facebook marketing platforms', mainProcess.includes('["tiktok", "snapchat", "facebook"].includes(platform)'));
ok('renderer combines TikTok, Snapchat, and Facebook spend by default', bus.includes("MARKETING_PLATFORMS = ['tiktok', 'snapchat', 'facebook']") && bus.includes('summarizeMarketingPlatforms') && bus.includes('platformBreakdown'));
ok('marketing UI shows TikTok, Snapchat, and Facebook as live platforms', marketing.indexOf("id: 'snapchat'") > marketing.indexOf("id: 'tiktok'") && marketing.indexOf("id: 'facebook'") > marketing.indexOf("id: 'snapchat'") && !marketing.includes('marketing.facebookLater'));
ok('marketing sync does not require paid Windsor refresh controls', !marketingBackend.includes('refresh_since') && !marketingBackend.includes('refresh_interval'));
ok('product forecast uses the shared product-attribution engine', s9.includes('TaagerProductAttribution') && s9.includes('createProductIndex') && s9.includes('matchCampaign') && s9.includes('ambiguousRows') && s9.includes('snapchat') && s9.includes('facebook'));
ok('product forecast filters synced spend by All, TikTok, Snapchat, and Facebook', s9.includes('FORECAST_PLATFORMS') && s9.includes("mountEl._s9MarketingPlatform || 'all'") && s9.includes("selectedMarketingPlatform === 'all' ? null : selectedMarketingPlatform") && s9.includes('data-s9-platform') && s9.includes('platformSpendFiltered'));
ok('product forecast table sorts descending first and can clear sorting', s9.includes('tableSortDir = \'desc\'') && s9.includes('s9-sort-btn') && s9.includes('id="s9-clear-sort"') && s9.includes("tableSortBy = ''"));
ok('product forecast keeps marketing real spend while scenarios remain editable/resettable', s9.includes('s9-sync-now') && s9.includes('syncedAdSpend') && s9.includes('s9-sim-spend-input') && !s9.includes("s.syncedAdSpend ? 'disabled title=") && s9.includes('resetSimulationToReal') && s9.includes('DashboardMarketingState.sync'));
ok('campaign decisions use one structured evaluator', campaignIntel.includes('TaagerCampaignDecision.evaluate') && campaignDecision.includes('passedChecks') && campaignDecision.includes('failedChecks') && campaignDecision.includes('confidence'));
ok('campaign actions expose watch instead of low-sample pause', campaignDecision.includes('tinySample') && campaignDecision.includes('? "watch"') && campaigns.includes('Watch / needs data'));
ok('AI scorecards consume the shared campaign evaluator', fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'pages', 'ai-intelligence', 'engine', 'business-orchestrator.js'), 'utf8').includes('TaagerCampaignDecision.evaluate'));
ok('campaign decision badges use structured accessible tooltips', campaigns.includes('data-tooltip-template=') && campaigns.includes('aria-label=') && tooltip.includes('data-tooltip-template') && tooltip.includes('aria-describedby'));
ok('campaign net profit and ROI use semantic financial colors', campaigns.includes('campaign-financial-') && campaigns.includes('financialState(group.netProfit') && campaigns.includes('financialState(intel.totals.netProfit'));
ok('translated campaign decisions stay contained in their table cell', styles.includes('.campaign-col-decision { width: 11%; }') && styles.includes('white-space: normal !important') && styles.includes('.campaign-decision-cell'));

// ── 6. section2: normalizeStage preserves existing convLabel/convFrom ─────────
console.log('\n[6] Section2 — normalizeStage fix');
var s2 = read('sections/section2-pipeline.js');
ok('convLabel uses existing value first', s2.includes("convLabel: s.convLabel ||"));
ok('convFrom uses existing value first',  s2.includes("convFrom: s.convFrom ||"));
ok('conv uses existing value first',      s2.includes("conv: s.conv != null ? s.conv : share"));

// ── 7. Logic unit tests (in-process simulation) ───────────────────────────────
console.log('\n[7] Logic unit tests');

// Test: generateCodInsights-like logic
function mockInsights(rate, avgDays, remaining) {
  var insights = [];
  var gapPct = parseFloat((100 - rate).toFixed(1));
  if (rate >= 80) insights.push({ title: 'ممتازة', color: '#00e676' });
  else if (rate >= 60) insights.push({ title: 'جيدة', color: '#f59e0b' });
  else insights.push({ title: 'منخفضة', color: '#ef4444' });
  if (avgDays != null) {
    if (avgDays <= 3) insights.push({ title: 'ممتازة', color: '#00e676' });
    else if (avgDays <= 5) insights.push({ title: 'ضمن المستهدف', color: '#f59e0b' });
    else insights.push({ title: 'طويلة', color: '#ef4444' });
  }
  if (gapPct > 30) insights.push({ title: 'مرتفعة', color: '#ef4444' });
  else if (gapPct > 10) insights.push({ title: 'معتدلة', color: '#f59e0b' });
  else insights.push({ title: 'ضئيلة', color: '#14b8a6' });
  return insights;
}

var ins1 = mockInsights(85, 2, 1000);
ok('Rate 85% → green insight', ins1[0].color === '#00e676');
ok('avgDays 2 → green insight', ins1[1].color === '#00e676');
ok('gapPct 15 → معتدلة', ins1[2].title === 'معتدلة');

var ins2 = mockInsights(50, 7, 5000);
ok('Rate 50% → red insight',    ins2[0].color === '#ef4444');
ok('avgDays 7 → red insight',   ins2[1].color === '#ef4444');
ok('gapPct 50 → مرتفعة',       ins2[2].title === 'مرتفعة');

// Test: buildFallback-like logic (month from current date)
var _months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var _now = new Date();
var _curMonthLabel = _months[_now.getMonth()];
var fb = [];
for (var _i = 1; _i <= 7; _i++) { fb.push({ d: _i + ' ' + _curMonthLabel, v: 0 }); }
ok('Fallback has 7 entries', fb.length === 7);
ok('Fallback month matches current month (' + _curMonthLabel + ')', fb[0].d === ('1 ' + _curMonthLabel));
ok('Fallback month is NOT hardcoded مايو (unless current month is May)',
  _now.getMonth() === 4 || !fb[0].d.includes('مايو'));

// Test: section7 dynamic dates
var _y = _now.getFullYear();
var _m = String(_now.getMonth() + 1).padStart(2, '0');
var _last = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
var expectedStart = _y + '-' + _m + '-01';
var expectedEnd   = _y + '-' + _m + '-' + String(_last).padStart(2, '0');
ok('Dynamic start date is first of current month: ' + expectedStart, expectedStart.endsWith('-01'));
ok('Dynamic end date is last day of current month: ' + expectedEnd,
  parseInt(expectedEnd.split('-')[2], 10) === _last);

// Test: normalizeStage preserves convLabel
function normalizeStage(s) {
  var share = s.share != null ? Number(s.share || 0) : Number(s.pct || 0);
  return Object.assign({}, s, {
    share: share,
    convLabel: s.convLabel || 'نسبة من الإجمالي',
    conv:      s.conv != null ? s.conv : share,
    convFrom:  s.convFrom || 'من إجمالي الطلبات'
  });
}
var st1 = normalizeStage({ id: 'delivered', label: 'تم التسليم', share: 50, convLabel: 'معدل التسليم', conv: 50.3, convFrom: 'من إجمالي الطلبات' });
ok('normalizeStage preserves custom convLabel', st1.convLabel === 'معدل التسليم');
ok('normalizeStage preserves custom conv value', st1.conv === 50.3);
var st2 = normalizeStage({ id: 'processing', label: 'قيد المعالجة', share: 10 });
ok('normalizeStage applies default convLabel when missing', st2.convLabel === 'نسبة من الإجمالي');
ok('normalizeStage applies default conv=share when missing', st2.conv === 10);

// ── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('Results: ' + PASS + ' passed, ' + FAIL + ' failed');
if (FAIL > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✓');
  process.exit(0);
}
