const assert = require('assert');
const fs = require('fs');
const path = require('path');
const financialCore = require('../src/renderer/pages/dashboard/dashboard-financial-core.js');

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon,     'expected ' + actual + ' to be within ' + epsilon + ' of ' + expected);
}

(function expectedModeKeepsActualAverageProfit() {
  const actual = financialCore.calculate({
    mode: 'actual',
    netOrders: 590,
    actualDeliveredOrders: 75,
    actualEarnedProfitAfterTax: 4872,
    netOrderProfitAfterTax: 999999,
    currentTotalSales: 116000,
    actualDeliveredSales: 18040,
    expectedNdrRate: 75 / 590,
    adSpend: 5895.6,
  });
  const expected = financialCore.calculate({
    mode: 'expected',
    netOrders: 590,
    actualDeliveredOrders: 75,
    actualEarnedProfitAfterTax: 4872,
    netOrderProfitAfterTax: 999999,
    currentTotalSales: 116000,
    actualDeliveredSales: 18040,
    expectedNdrRate: 64 / 292,
    adSpend: 5895.6,
  });

  approx(actual.averageProfit, 64.96);
  approx(expected.averageProfit, actual.averageProfit);
  approx(expected.expectedNdrRate, 64 / 292);
  approx(expected.breakEvenCpa, actual.averageProfit * (64 / 292));
  approx(expected.expectedTotalProfitBeforeAdSpend, 590 * (64 / 292) * actual.averageProfit);
  approx(expected.expectedNetProfit, expected.expectedTotalProfitBeforeAdSpend - 5895.6);
  assert.notStrictEqual(expected.displayedTotalProfitBeforeAdSpend, actual.displayedTotalProfitBeforeAdSpend);
})();

(function expectedModeChangesDownstreamWhenNdrChangesOnly() {
  const common = {
    mode: 'expected',
    netOrders: 590,
    actualDeliveredOrders: 75,
    actualEarnedProfitAfterTax: 4872,
    netOrderProfitAfterTax: 3210,
    currentTotalSales: 116000,
    actualDeliveredSales: 18040,
    adSpend: 5895.6,
  };
  const low = financialCore.calculate(Object.assign({}, common, { expectedNdrRate: 0.1721 }));
  const high = financialCore.calculate(Object.assign({}, common, { expectedNdrRate: 64 / 292 }));

  approx(low.averageProfit, high.averageProfit);
  assert.ok(high.expectedDeliveriesExact > low.expectedDeliveriesExact);
  assert.ok(high.breakEvenCpa > low.breakEvenCpa);
  assert.ok(high.expectedTotalProfitBeforeAdSpend > low.expectedTotalProfitBeforeAdSpend);
  assert.ok(high.expectedNetProfit > low.expectedNetProfit);
})();

(function useBestCycleSyncsGlobalExpectedNdrRange() {
  const calculatorSource = fs.readFileSync(
    path.join(__dirname, '../src/renderer/pages/dashboard/sections/section7-calculator-hydrated.js'),
    'utf8'
  );
  assert.ok(calculatorSource.includes('DashboardExpectedNdrRangeState.setRange(bestChoice.bestCycle.dateFrom, bestChoice.bestCycle.dateTo)'));
  assert.ok(calculatorSource.includes('DashboardDeliveredDateState.set("expected")'));
  assert.ok(calculatorSource.includes('DashboardBestNdrCyclePreferred = {'));
})();

(function labelsUseNetDeliveryRate() {
  const files = [
    '../src/renderer/pages/dashboard/sections/section1-overview.js',
    '../src/renderer/pages/dashboard/sections/section7-calculator-hydrated.js',
    '../src/renderer/pages/dashboard/sections/section8-master.js',
  ];
  for (const rel of files) {
    const source = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.ok(source.includes('Net Delivery Rate (NDR)'), rel + ' should show Net Delivery Rate (NDR)');
    assert.ok(!source.includes('Delivery Rate NDR'), rel + ' should not show Delivery Rate NDR');
    assert.ok(!source.includes('NDR Rate'), rel + ' should not show NDR Rate');
  }
})();

(function specDocumentCapturesTheContract() {
  const spec = fs.readFileSync(path.join(__dirname, '../expected-ndr-closed-cycle-spec.md'), 'utf8');
  assert.ok(spec.includes('Expected NDR / Closed Cycle mode changes the NDR. It does not change the average profit basis.'));
  assert.ok(spec.includes('64 / 292 = 21.92% NDR.'));
  assert.ok(spec.includes('Break-even CPA = Actual-mode Average Profit * Expected NDR.'));
})();

(function overviewAndPipelineUseExpectedFinancialCore() {
  const aggregatorSource = fs.readFileSync(
    path.join(__dirname, '../src/renderer/pages/dashboard/dashboard-aggregator.js'),
    'utf8'
  );
  assert.ok(aggregatorSource.includes('averageProfit: { value: accountFinancials.averageProfit'));
  assert.ok(aggregatorSource.includes('accountBreakEvenCpa: { value: accountFinancials.breakEvenCpa'));
  assert.ok(aggregatorSource.includes('totalRevenue: { value: accountFinancials.displayedTotalProfitBeforeAdSpend'));
  assert.ok(aggregatorSource.includes("if (meta.deliveredDateMode === 'expected' && accountFinancials && Array.isArray(pipelineStages))"));
  assert.ok(aggregatorSource.includes('st.count = accountFinancials.expectedDeliveriesDisplay'));
  assert.ok(aggregatorSource.includes('st.profitAfterTax = roundMoney(accountFinancials.expectedTotalProfitBeforeAdSpend)'));
})();

(function productAndCityQueriesUseSharedFinancialCore() {
  const querySource = fs.readFileSync(
    path.join(__dirname, '../src/main/dashboard-query-service.js'),
    'utf8'
  );
  assert.ok(querySource.includes('const productFinancials = financialCore.calculate({'));
  assert.ok(querySource.includes('mode: isExpected ? "expected" : "actual"'));
  assert.ok(querySource.includes('expectedNdrRate: product.expectedNdrRate'));
  assert.ok(querySource.includes('product.averageProfit = productFinancials.averageProfit'));
  assert.ok(querySource.includes('product.breakEvenCpa = productFinancials.breakEvenCpa'));
  assert.ok(querySource.includes('const cityProjection = financialCore.calculate({'));
  assert.ok(querySource.includes('averageProfit: cityProjection.averageProfit'));
  assert.ok(querySource.includes('expectedNdrRate: rateResolution.rate'));
})();

(function productCalculatorUsesOverviewNdrFallback() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/renderer/pages/dashboard/sections/section9-product-forecast-hydrated.js'),
    'utf8'
  );
  assert.ok(source.includes('data.overview.ndrRate && data.overview.ndrRate.value != null'));
  assert.ok(source.includes('Math.max(0, Math.min(1, overviewNdrPct / 100))'));
  assert.ok(!source.includes('(data.overview.deliveryRate / 100) : 0.35'));
})();

(function campaignExpectedModeUpdatesBreakEven() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/renderer/pages/dashboard/sections/section-campaigns-hydrated.js'),
    'utf8'
  );
  const matches = source.match(/group\.breakEvenCpa = projection\.breakEvenCpa;/g) || [];
  assert.strictEqual(matches.length, 2, 'both campaign Expected NDR branches should update break-even CPA');
})();

(function prepaidUsesSharedActualAverageProfitKpis() {
  const prepaidSource = fs.readFileSync(
    path.join(__dirname, '../src/renderer/pages/dashboard/sections/section-prepaid-hydrated.js'),
    'utf8'
  );
  const aggregatorSource = fs.readFileSync(
    path.join(__dirname, '../src/renderer/pages/dashboard/dashboard-aggregator.js'),
    'utf8'
  );
  assert.ok(prepaidSource.includes('geo.kpis.averageProfit'));
  assert.ok(aggregatorSource.includes('nationalAverages.averageProfit = avgCommission'));
  assert.ok(aggregatorSource.includes('avgCommission = accountFinancials.averageProfit'));
})();
console.log('expected NDR contract regression test passed');
