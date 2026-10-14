const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const currency = require('../src/renderer/pages/dashboard/dashboard-currency-core');
const financial = require('../src/renderer/pages/dashboard/dashboard-financial-core');
const { runDashboardAggregatorFixture } = require('./helpers/dashboard-aggregator-fixture');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '../src/renderer/pages/dashboard/dashboard.js'),
  'utf8'
);
const aggregatorSource = fs.readFileSync(
  path.join(__dirname, '../src/renderer/pages/dashboard/dashboard-aggregator.js'),
  'utf8'
);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in dashboard aggregator`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function makeVm(initialRoi, rates) {
  let roi = { ...initialRoi };
  const calls = [];
  const convert = (value, from, to) => currency.convert(value, from, to, { rates });
  const window = {
    getActiveAccountId: () => 'account-1',
    TaagerCurrency: { convert },
    DashboardRoiState: {
      get: () => ({ ...roi }),
      set: (patch, accountId) => {
        calls.push({ patch: { ...patch }, accountId });
        roi = { ...roi, ...patch };
        return { ...roi };
      },
    },
  };
  vm.runInNewContext(dashboardSource, {
    window,
    document: {},
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 0,
  });
  return { window, calls, get roi() { return { ...roi }; } };
}

function netProfitIn(currencyCode, profitSar, spend, spendCurrency) {
  const profit = currency.convert(profitSar, 'SAR', currencyCode);
  const adSpend = currency.convert(spend, spendCurrency, currencyCode);
  return financial.calculate({
    mode: 'actual',
    netOrders: 1,
    actualDeliveredOrders: 1,
    actualEarnedProfitAfterTax: profit,
    adSpend,
  }).displayedNetProfit;
}

// Execute the same ROI currency update helper used by the topbar callback.
// Visit every supported currency repeatedly, checking both converted spend and
// calculated net profit against their SAR values on each step.
const currencies = ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'];
const harness = makeVm({ currency: 'SAR', adSpend: 20 });
const sarNet = netProfitIn('SAR', 66.8, 20, 'SAR');
for (let pass = 0; pass < 3; pass += 1) {
  for (const target of currencies) {
    const previous = harness.roi.currency;
    harness.window._dashboardApplyRoiReportingCurrency(target, previous);
    assert.equal(harness.roi.currency, target);
    assert.ok(Math.abs(currency.convert(harness.roi.adSpend, target, 'SAR') - 20) < 1e-8,
      `${previous} → ${target} spend must preserve 20 SAR`);
    const convertedNet = netProfitIn(target, 66.8, harness.roi.adSpend, target);
    assert.ok(Math.abs(currency.convert(convertedNet, target, 'SAR') - sarNet) < 1e-8,
      `${target} net profit must preserve SAR value`);
  }
}
assert.ok(Math.abs(currency.convert(66.8, 'SAR', 'USD') - 17.8133333333) < 1e-8);

// An unset spend must stay unset rather than being written as NaN or zero.
const noSpend = makeVm({ currency: 'SAR' });
noSpend.window._dashboardApplyRoiReportingCurrency('USD', 'SAR');
assert.equal(noSpend.roi.currency, 'USD');
assert.equal(Object.hasOwn(noSpend.roi, 'adSpend'), false);
assert.equal(Object.hasOwn(noSpend.calls[0].patch, 'adSpend'), false);

// The aggregator can prepare overlapping main and NDR row lists in sequence.
// Re-preparing a row must always convert from its retained native amount, not
// mistake the previous dashboard display value for a native value.
const aggregatorVm = {
  window: {
    TaagerCurrency: { convert: currency.convert },
    TaagerCountry: { currency: () => 'SAR' },
  },
  effectiveCountry: (country) => country || 'sa',
  dashboardMoneyValue: currency.number,
  convertDashboardCurrency: (amount, from, to, egpRate, rates) =>
    currency.convert(amount, from, to, { egpRate, rates }),
  classifyRowPayment: () => ({ classification: 'cod', source: 'test', effectiveCod: true }),
};
vm.createContext(aggregatorVm);
vm.runInContext([
  'function dashboardMoneyValue(value) { return Number(value) || 0; }',
  extractFunction(aggregatorSource, 'rowTotalPrice'),
  extractFunction(aggregatorSource, 'rowAmountDue'),
  extractFunction(aggregatorSource, 'rowCommissionValue'),
  extractFunction(aggregatorSource, 'rowNativeValue'),
  extractFunction(aggregatorSource, 'rowNativeTotalPrice'),
  extractFunction(aggregatorSource, 'rowNativeAmountDue'),
  extractFunction(aggregatorSource, 'rowNativeCommission'),
  extractFunction(aggregatorSource, 'prepareReportingRows'),
].join('\n'), aggregatorVm);
const sourceRow = {
  taagerCountry: 'sa',
  totalPrice: 200,
  amountDue: 150,
  profit: 66.8,
  taxProfit: 0,
};
for (const target of currencies) {
  aggregatorVm.prepareReportingRows([sourceRow], {
    activeCurrency: target,
    reportingCurrency: target,
    exchangeRates: {},
  });
  assert.equal(sourceRow.nativeCommission, 66.8);
  assert.equal(sourceRow.nativeTotalPrice, 200);
  assert.equal(sourceRow.nativeAmountDue, 150);
  assert.ok(Math.abs(sourceRow.dashboardCommission - currency.convert(66.8, 'SAR', target)) < 1e-8,
    `${target} commission must be converted from native SAR`);
  assert.ok(Math.abs(sourceRow.dashboardTotalPrice - currency.convert(200, 'SAR', target)) < 1e-8,
    `${target} sales must be converted from native SAR`);
  assert.ok(Math.abs(sourceRow.dashboardAmountDue - currency.convert(150, 'SAR', target)) < 1e-8,
    `${target} amount due must be converted from native SAR`);
  assert.ok(Math.abs(aggregatorVm.rowCommissionValue(sourceRow) - currency.convert(66.8, 'SAR', target)) < 1e-8,
    `${target} processing getter must continue reading reporting commission`);
  assert.ok(Math.abs(aggregatorVm.rowTotalPrice(sourceRow) - currency.convert(200, 'SAR', target)) < 1e-8,
    `${target} processing getter must continue reading reporting sales`);
  assert.ok(Math.abs(aggregatorVm.rowAmountDue(sourceRow) - currency.convert(150, 'SAR', target)) < 1e-8,
    `${target} processing getter must continue reading reporting amount due`);
}

(async () => {
  const overlap = await runDashboardAggregatorFixture();
  assert.equal(overlap.meta.reportingCurrency, 'USD');
  assert.equal(overlap.roi.currency, 'USD');
  assert.ok(Math.abs(overlap.roi.actualEarnedProfitAfterTax - currency.convert(66.8, 'SAR', 'USD')) < 0.01,
    'expected-mode aggregator must retain a 66.8 SAR actual profit after overlapping NDR prep');
  assert.ok(Math.abs(overlap.roi.expectedTotalProfitBeforeAdSpend - currency.convert(66.8, 'SAR', 'USD')) < 0.01,
    'expected-mode aggregator profit must remain about 17.81 USD');

  // App conversion follows the active global exchange-rate snapshot. A legacy
  // per-ROI EGP rate must not silently override the rate used by the calculator.
  const globalRates = { ...currency.DEFAULT_RATES, EGP: 50 };
  const customEgp = makeVm({ currency: 'SAR', adSpend: 66.8, egpRate: 52 }, globalRates);
  customEgp.window._dashboardApplyRoiReportingCurrency('EGP', 'SAR');
  assert.ok(Math.abs(customEgp.roi.adSpend - (66.8 / 3.75) * 50) < 1e-8);
  assert.equal(customEgp.roi.egpRate, 52);
  console.log('Dashboard reporting currency conversion checks passed.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
