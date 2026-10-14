'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const DASHBOARD_DIR = path.join(ROOT, 'src/renderer/pages/dashboard');
const PERIOD = { preset: 'custom', dateFrom: '2026-05-01', dateTo: '2026-05-31' };
const RATES = { USD: 1, SAR: 3.75, EGP: 50, AED: 3.67, IQD: 1300, OMR: 0.385 };

function createStorage() {
  const values = Object.create(null);
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
  };
}

function fixtureRow() {
  return {
    orderId: 'sar-profit',
    taagerOrderNumber: 'sar-profit',
    country: 'sa',
    taagerCountry: 'sa',
    city: 'Riyadh',
    status: 'delivered',
    orderStatus: 'delivered',
    createdAt: '2026-05-10',
    date: '2026-05-10',
    totalPrice: 200,
    amountDue: 100,
    profit: 66.8,
    taxProfit: 0,
    products: 'Currency fixture',
    productName: 'Currency fixture',
    sku: 'currency-fixture',
    qty: 1,
    quantity: 1,
  };
}

async function runDashboardAggregatorFixture() {
  const storage = createStorage();
  storage.setItem('taager_active_account_id', '__all__');
  storage.setItem('taager_dashboard_reporting_currency', 'USD');
  storage.setItem('taager_dashboard_delivered_date_mode', 'expected');
  storage.setItem('taager_dashboard_expected_ndr_range', JSON.stringify({
    dateFrom: PERIOD.dateFrom,
    dateTo: PERIOD.dateTo,
  }));

  const currency = {
    cleanCurrency(value, fallback) {
      const normalized = String(value || fallback || 'SAR').trim().toUpperCase();
      return RATES[normalized] ? normalized : String(fallback || 'SAR').toUpperCase();
    },
    rates: () => ({ ...RATES }),
    snapshot: () => ({ rates: { ...RATES }, source: 'currency-fixture', updatedAt: '' }),
    convert(value, from, to, options) {
      const rates = { ...RATES, ...(options && options.rates) };
      const source = this.cleanCurrency(from, 'SAR');
      const target = this.cleanCurrency(to, source);
      return (Number(value || 0) / rates[source]) * rates[target];
    },
  };
  const country = { currency: (value) => String(value || '').toLowerCase() === 'sa' ? 'SAR' : 'SAR' };
  const geo = {
    provinceMap: () => ({ other: { id: 'other', label: 'Other', x: 200, y: 170 } }),
    resolveProvince: () => 'other',
    cityPoint: () => ({ country: 'sa', provinceId: 'other', x: 100, y: 100 }),
    outline: () => 'M0 0L1 1Z',
    viewBox: () => '0 0 400 340',
  };
  const snapshots = {
    sa: { snapshot: [fixtureRow()], snapshotMonth: '2026-05', manualFetchTimestamp: '2026-06-01T00:00:00Z' },
    eg: { snapshot: [], snapshotMonth: '2026-05', manualFetchTimestamp: '2026-06-01T00:00:00Z' },
  };
  const credentials = [
    { id: 'sa', label: 'Saudi store', taagerCountry: 'sa' },
    { id: 'eg', label: 'Egypt store', taagerCountry: 'eg' },
  ];
  const window = {
    _kbotLang: 'en',
    _kbotTheme: 'dark',
    dashboardAccountsList: [],
    currentActiveAccountLabel: 'All accounts',
    TaagerCountry: country,
    TaagerCurrency: currency,
    TaagerGeo: geo,
    DashboardPeriodState: { get: () => PERIOD },
    api: {
      getDashboardSnapshot: async () => ({ ok: true, data: snapshots }),
      getCredentials: async () => ({ accounts: credentials }),
    },
  };
  window.window = window;
  window.localStorage = storage;
  window.addEventListener = () => {};
  window.dashboardI18n = {
    t: (key) => key,
    raw: (value) => String(value || ''),
    number: (value, options) => Number(value || 0).toLocaleString('en-US', options || {}),
    formatTimestamp: () => '2026-06-01 00:00',
    formatMonth: () => 'May 2026',
    monthName: () => 'May',
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
    path.join(ROOT, 'src/renderer/pages/taager-product-names.js'),
    path.join(ROOT, 'src/renderer/pages/taager-status.js'),
    path.join(DASHBOARD_DIR, 'dashboard-currency-core.js'),
    path.join(DASHBOARD_DIR, 'dashboard-filter-bus.js'),
    path.join(DASHBOARD_DIR, 'dashboard-aggregator-score.js'),
    path.join(DASHBOARD_DIR, 'dashboard-aggregator-geo.js'),
    path.join(DASHBOARD_DIR, 'dashboard-insight-engine.js'),
    path.join(DASHBOARD_DIR, 'dashboard-aggregator.js'),
  ].forEach((file) => vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file }));
  vm.runInContext('window.TaagerDashboardCurrencyCore = TaagerDashboardCurrencyCore;', context);
  window.DashboardPeriodState.setCustomRange(PERIOD.dateFrom, PERIOD.dateTo);
  window.invalidateDashboardCache();
  return new Promise((resolve, reject) => {
    window.runDashboardAggregator((result) => {
      if (!result) reject(new Error('Aggregator returned no result'));
      else resolve(result);
    });
  });
}

module.exports = { runDashboardAggregatorFixture };
