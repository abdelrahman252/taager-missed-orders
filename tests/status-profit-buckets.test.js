const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const taagerStatus = read("src/renderer/pages/taager-status.js");
const aggregator = read("src/renderer/pages/dashboard/dashboard-aggregator.js");
const queryService = read("src/main/dashboard-query-service.js");
const main = read("src/main/main.js");
const master = read("src/renderer/pages/dashboard/sections/section8-master.js");

assert(
  taagerStatus.includes('{ bucket: "on_hold", order: 120, group: "incoming", businessGroup: "incoming" }'),
  "Temporarily suspended orders should be financially incoming, not lost"
);

assert(
  aggregator.includes("{ bucket: 'on_hold', order: 120, businessGroup: 'incoming', color: '#64748b' }"),
  "Renderer fallback status flow should keep on_hold financially incoming"
);

assert(
  /function isFailedBucket\(bucket\) \{\s*return \["failed", "return_verified", "customer_refused_confirmation", "out_of_stock", "after_sales_done"\]\.includes\(bucket\);\s*\}/.test(queryService),
  "Query service lost bucket should not include on_hold"
);

assert(
  queryService.includes('"waiting", "on_hold", "pending"'),
  "Query service incoming bucket should include on_hold"
);

assert(
  /bucket === "waiting" \|\|\r?\n    bucket === "on_hold" \|\|\r?\n    bucket === "after_sales_progress"/.test(main) &&
    !/bucket === "customer_refused_confirmation" \|\|\r?\n    bucket === "on_hold" \|\|\r?\n    bucket === "out_of_stock"/.test(main),
  "Main summary buckets should treat on_hold as incoming"
);

assert(
  master.includes("s.businessGroup === 'incoming'") &&
    master.includes("s.businessGroup === 'earned'") &&
    master.includes("s.businessGroup === 'lost'"),
  "Master pipeline SAR labels should be driven by business group"
);

console.log("status profit bucket regression test passed");
