const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'pages', 'dashboard', 'dashboard-best-ndr-cycle.js'),
  'utf8'
);
const window = {};
vm.runInNewContext(source, { window, Date, isNaN, Number, String, Math, Object, Array });

function ordersForDay(date, count, delivered) {
  return Array.from({ length: count }, (_, index) => ({
    id: date + '-' + index,
    createdAt: date,
    orderStatus: index < delivered ? 'delivered' : 'failed'
  }));
}

// Regression: the old volume bonuses selected July 2 (49.17%) over July 1
// (50%), so applying "Best NDR" actively lowered the simulator assumption.
const orders = ordersForDay('2026-07-01', 30, 15)
  .concat(ordersForDay('2026-07-02', 120, 59));
const result = window.DashboardBestNdrCycle.analyze(
  { orders, meta: { period: { dateFrom: '2026-07-01', dateTo: '2026-07-02' } } },
  { cycleDays: 1, minSample: 30 }
);

assert.strictEqual(result.status, 'ready');
assert.strictEqual(result.best.dateFrom, '2026-07-01');
assert.strictEqual(result.best.netOrders, 30);
assert.strictEqual(result.best.delivered, 15);
assert.strictEqual(result.best.ndrPct, 50);
assert(result.best.ndrPct >= result.cycles[1].ndrPct);

console.log('best-ndr-cycle regression test passed');
