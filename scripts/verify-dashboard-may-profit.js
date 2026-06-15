'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseFullMonthSnapshot } = require('../src/bot/parser');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const WORKBOOK = path.join(ROOT, 'orders-may-with -2 before date and +2 after date.xlsx');
const DASHBOARD_DIR = path.join(ROOT, 'src', 'renderer', 'pages', 'dashboard');
const SECTION8_FILE = path.join(DASHBOARD_DIR, 'sections', 'section8-master.js');
const PERIOD = { preset: 'custom', dateFrom: '2026-05-01', dateTo: '2026-05-31' };
const EXPECTED = {
  earned: 18230.74,
  incoming: 10722.10,
  lost: 35257.99,
  codCollected: 56105.01,
  codGap: 32621.51,
  topCollectedCity: 'منطقة الرياض',
  topCollectedCitySar: 15434.00,
};
const EXPECTED_STATUS_ORDER = [
  'received',
  'confirmed',
  'waiting',
  'shipping',
  'delivery_suspended',
  'after_sales_progress',
  'delivered',
  'customer_refused_confirmation',
  'failed',
  'return_verified',
  'out_of_stock',
  'on_hold',
  'after_sales_done',
  'canceled_by_you',
];

function check(label, actual, expected) {
  const rounded = Math.round(Number(actual || 0) * 100) / 100;
  if (Math.abs(rounded - expected) > 0.01) {
    throw new Error(label + ': expected ' + expected + ', got ' + rounded);
  }
  console.log('[PASS] ' + label + ': ' + rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log('[PASS] ' + message);
}

function verifySection8TopProductsProfitBinding() {
  const source = fs.readFileSync(SECTION8_FILE, 'utf8');
  assert(
    /earnedProfitAfterTax\s*=\s*num\(p\.commission,\s*0\)/.test(source),
    'Section 8 Top Products binds Earned Profit After Tax to product commission'
  );
  assert(
    !/p\.revenue\.toLocaleString\(\)/.test(source),
    'Section 8 Top Products does not render sales revenue as earned profit after tax'
  );
}

function createStorage() {
  const data = Object.create(null);
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

async function runAggregator(rows) {
  const storage = createStorage();
  storage.setItem('taager_active_account_id', '__all__');
  storage.setItem('taager_dashboard_delivered_date_mode', 'actual');
  const window = {
    _kbotLang: 'en',
    _kbotTheme: 'dark',
    dashboardAccountsList: [],
    currentActiveAccountLabel: 'All accounts',
    addEventListener: () => {},
    removeEventListener: () => {},
    DashboardPeriodState: { get: () => PERIOD },
    DashboardDeliveredDateState: { get: () => 'actual' },
    api: {
      getDashboardSnapshot: async () => ({
        ok: true,
        data: {
          maySheet: {
            snapshot: rows,
            snapshotMonth: '2026-05',
            manualFetchTimestamp: '2026-06-01T00:00:00Z',
          },
        },
      }),
      getCredentials: async () => ({
        accounts: [{ id: 'maySheet', label: 'May sheet' }],
      }),
    },
  };
  window.window = window;
  window.localStorage = storage;
  window.dashboardI18n = {
    t: (key) => key,
    raw: (value) => String(value || ''),
    number: (value, opts) => Number(value || 0).toLocaleString('en-US', opts || {}),
    formatTimestamp: () => '2026-06-01 00:00',
    formatMonth: (year, monthIndex) => new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    monthName: (monthIndex) => new Date(2026, monthIndex, 1).toLocaleDateString('en-US', { month: 'long' }),
    locale: () => 'en-US',
    isRtl: () => false,
  };
  const context = vm.createContext({
    window,
    localStorage: storage,
    console,
    Promise,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    RegExp,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    setTimeout,
    clearTimeout,
  });
  [
    path.join(ROOT, 'src', 'renderer', 'pages', 'taager-product-names.js'),
    path.join(ROOT, 'src', 'renderer', 'pages', 'taager-status.js'),
    path.join(DASHBOARD_DIR, 'dashboard-filter-bus.js'),
    path.join(DASHBOARD_DIR, 'dashboard-aggregator-score.js'),
    path.join(DASHBOARD_DIR, 'dashboard-aggregator-geo.js'),
    path.join(DASHBOARD_DIR, 'dashboard-insight-engine.js'),
    path.join(DASHBOARD_DIR, 'dashboard-aggregator.js'),
  ].forEach((file) => vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file }));
  window.DashboardPeriodState.setCustomRange(PERIOD.dateFrom, PERIOD.dateTo);
  window.invalidateDashboardCache && window.invalidateDashboardCache();
  return new Promise((resolve, reject) => {
    window.runDashboardAggregator((result) => {
      if (!result) reject(new Error('Aggregator returned no result'));
      else resolve(result);
    });
  });
}

function verifyArabicDecimalParsing() {
  const header = [
    'رقم الطلب', 'اسم المستلم', 'الحالة', 'تاريخ الإنشاء', 'اخر تحديث', 'رقم الهاتف',
    'اسم الشارع', 'المحافظة', 'orders.export.cashOnDelivery', 'تكلفة الشحن', 'ملاحظات',
    '', 'ربح الضريبة', 'ربح الطلب', '', '', 'المنتجات', 'الكميات', 'الأسعار', '', '', '', 'كود الطلب للمتجر'
  ];
  const rows = [
    header,
    [
      'A-1', 'Customer', 'تم استلام الطلب', '2026-05-01', '2026-05-01', '0500000000',
      'Address', 'منطقة الرياض', '١٤٦٫٠٢', '28', '',
      '', '٤٫٢', '٤٨٫٠٣', '', '', 'SKU-1', '1', '١١٨٫٠٢', '', '', '', 'STORE-1'
    ],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'الطلبات');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const parsed = parseFullMonthSnapshot(buffer, { dateFrom: '2026-05-01', dateTo: '2026-05-31' });
  if (!parsed.length) throw new Error('Arabic decimal parser test produced no rows');
  check('Arabic decimal COD parser', parsed[0].amountDue, 146.02);
  check('Arabic decimal price parser', parsed[0].totalPrice, 118.02);
  check('Arabic decimal profit parser', parsed[0].profit, 48.03);
  check('Arabic decimal tax parser', parsed[0].taxProfit, 4.2);
  check('Arabic decimal profit after tax parser', parsed[0].taagerProfit, 43.83);
}

(async function main() {
  verifySection8TopProductsProfitBinding();
  verifyArabicDecimalParsing();
  if (!fs.existsSync(WORKBOOK)) throw new Error('Missing workbook: ' + WORKBOOK);
  const rows = parseFullMonthSnapshot(fs.readFileSync(WORKBOOK), PERIOD);
  const uniqueOrders = new Map();
  rows.forEach((row) => {
    const key = row.taagerOrderNumber || String(row.sourceOrderRowIndex || uniqueOrders.size);
    if (!uniqueOrders.has(key)) uniqueOrders.set(key, row);
  });
  const direct = { earned: 0, incoming: 0, lost: 0 };
  const directCod = { collected: 0, incoming: 0 };
  const directLostCounts = Object.create(null);
  const cityCod = Object.create(null);
  uniqueOrders.forEach((row) => {
    const bucket = row.orderStatusBucket;
    const profit = Number(row.taagerProfit || 0);
    const due = Number(row.amountDue || 0);
    const city = String(row.city || '').trim();
    if (city && !cityCod[city]) cityCod[city] = { collected: 0, incoming: 0 };
    if (bucket === 'delivered') direct.earned += profit;
    else if (bucket === 'failed' || bucket === 'return_verified' || bucket === 'customer_refused_confirmation' || bucket === 'on_hold' || bucket === 'out_of_stock' || bucket === 'after_sales_done') {
      direct.lost += profit;
      directLostCounts[bucket] = (directLostCounts[bucket] || 0) + 1;
    }
    else if (bucket === 'received' || bucket === 'shipping' || bucket === 'delivery_suspended' || bucket === 'confirmed' || bucket === 'waiting' || bucket === 'after_sales_progress') direct.incoming += profit;
    if (bucket === 'delivered') {
      directCod.collected += due;
      if (city) cityCod[city].collected += due;
    } else if (bucket === 'received' || bucket === 'shipping' || bucket === 'delivery_suspended' || bucket === 'confirmed' || bucket === 'waiting' || bucket === 'after_sales_progress') {
      directCod.incoming += due;
      if (city) cityCod[city].incoming += due;
    }
  });
  const topCity = Object.entries(cityCod).sort((a, b) => b[1].collected - a[1].collected)[0];
  check('Workbook earned profit after tax', direct.earned, EXPECTED.earned);
  check('Workbook incoming profit after tax', direct.incoming, EXPECTED.incoming);
  check('Workbook lost profit after tax', direct.lost, EXPECTED.lost);
  check('Workbook COD collected', directCod.collected, EXPECTED.codCollected);
  check('Workbook COD active gap', directCod.incoming, EXPECTED.codGap);
  if (!topCity || topCity[0] !== EXPECTED.topCollectedCity) {
    throw new Error('Workbook top collected city: expected ' + EXPECTED.topCollectedCity + ', got ' + (topCity && topCity[0]));
  }
  check('Workbook top collected city SAR', topCity[1].collected, EXPECTED.topCollectedCitySar);

  const result = await runAggregator(rows);
  check('Dashboard earned profit after tax', result.overview.earnedCommission.value, EXPECTED.earned);
  check('Dashboard incoming profit after tax', result.overview.incomingCommission.value, EXPECTED.incoming);
  check('Dashboard lost profit after tax', result.overview.lostCommission.value, EXPECTED.lost);
  check('Dashboard COD collected', result.cod.collectedSar, EXPECTED.codCollected);
  check('Dashboard COD active gap', result.cod.gapSar, EXPECTED.codGap);
  const stageIds = (result.pipeline.stages || []).map((stage) => stage.id);
  assert(stageIds.length === EXPECTED_STATUS_ORDER.length, 'Dashboard emits exactly 14 Taager status stages');
  assert(JSON.stringify(stageIds) === JSON.stringify(EXPECTED_STATUS_ORDER), 'Dashboard stages use the approved Taager status order');
  assert(stageIds.indexOf('awaiting') === -1, 'Dashboard pipeline has no awaiting confirmation stage');
  assert((result.statusSummary || []).length === EXPECTED_STATUS_ORDER.length, 'Dashboard exposes exact status summary for sections');
  assert(Math.abs(Number(result.cod.collectedSar || 0) - Number(result.cod.expectedCodSar || 0) + Number(result.cod.gapSar || 0)) < 0.02, 'COD expected = delivered collected + active gap');
  assert(Math.abs(Number(result.cod.gapSar || 0) - Number(result.cod.incomingCodSar || 0)) < 0.02, 'COD gap equals active incoming COD only');
  const lostByBucket = Object.create(null);
  (result.pipeline.lostBreakdown || []).forEach((row) => {
    lostByBucket[row.bucket || row.id] = Number(row.count || 0);
  });
  EXPECTED_STATUS_ORDER.filter((bucket) => directLostCounts[bucket] != null).forEach((bucket) => {
    assert(lostByBucket[bucket] === directLostCounts[bucket], 'Lost bucket count matches sheet for ' + bucket);
  });
  assert((result.pipeline.lostBreakdown || []).every((row) => (row.bucket || row.id) !== 'canceled_by_you'), 'Lost breakdown excludes Canceled by you');
  if (!result.cod.mapCities || !result.cod.mapCities[0] || result.cod.mapCities[0].name !== EXPECTED.topCollectedCity) {
    throw new Error('Dashboard top collected city: expected ' + EXPECTED.topCollectedCity + ', got ' + (result.cod.mapCities && result.cod.mapCities[0] && result.cod.mapCities[0].name));
  }
  check('Dashboard top collected city SAR', result.cod.mapCities[0].sar, EXPECTED.topCollectedCitySar);
}()).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
