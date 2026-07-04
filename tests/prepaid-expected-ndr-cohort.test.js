const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'pages', 'dashboard', 'dashboard-aggregator.js'),
  'utf8'
);

// Expected-NDR mode must rebuild both sides of each payment-method rate from
// the historical cohort. Keeping a main-period numerator with a cohort
// denominator corrupts the Prepaid and COD NDR cards.
assert(/city\.prepaidDeliveredCount\s*=\s*0/.test(source));
assert(/city\.codDeliveredCount\s*=\s*0/.test(source));
assert(/if \(rowIsPrepaid\) city\.prepaidDeliveredCount\+\+;\s*else city\.codDeliveredCount\+\+;/.test(source));
assert(/cp\.prepaidDelivered\s*=\s*0/.test(source));
assert(/cp\.codDelivered\s*=\s*0/.test(source));
assert(/if \(rowIsPrepaid\) pcm\.prepaidDelivered\+\+;\s*else pcm\.codDelivered\+\+;/.test(source));
assert(/if \(rowIsPrepaid\) cityProduct\.prepaidDelivered\+\+;\s*else cityProduct\.codDelivered\+\+;/.test(source));

console.log('prepaid expected-NDR cohort regression test passed');
