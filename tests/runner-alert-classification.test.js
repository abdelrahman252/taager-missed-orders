"use strict";

const assert = require("assert");
const { classifyRunnerAlert } = require("../src/main/runner-alert-classification");

const uncertain = classifyRunnerAlert({
  failedOrders: { count: 11, source: "cart-error" },
});
assert.strictEqual(uncertain.kind, "error");
assert.strictEqual(uncertain.operation, "completed-needs-review");
assert.match(uncertain.error, /unverified outcome/);
assert.match(uncertain.error, /Check the Taager cart before rerunning/);
assert.match(uncertain.error, /do not resubmit/);
assert.match(uncertain.error, /11 order row\(s\) retained/);

// Mixed destination errors retain the review classification.
assert.strictEqual(classifyRunnerAlert({
  failedOrders: { count: 3, source: "card+cart-error+second-taager-cart" },
}).kind, "error");

// Reconciliation may finish with rows marked for manual review.
for (const marker of ["manualReview", "uncertain", "verificationUnconfirmed"]) {
  assert.strictEqual(classifyRunnerAlert({
    failedOrders: { count: 1, source: "verified-export", summary: [{ [marker]: true }] },
  }).kind, "error", `${marker} rows must not be reported as success`);
}

// A failed verified-export reconciliation and unavailable verification both need review.
assert.strictEqual(classifyRunnerAlert({
  failedOrders: { count: 2, source: "verified-export", summary: [{ error: "not in export" }] },
}).kind, "error");
assert.strictEqual(classifyRunnerAlert({
  failedOrders: { count: 2, source: "uncertain-upload" },
}).kind, "error");

// Known card-level failures and clean runs retain the existing completion alert.
assert.deepStrictEqual(classifyRunnerAlert({ failedOrders: { count: 2, source: "card" } }), { kind: "success" });
assert.deepStrictEqual(classifyRunnerAlert({ orders: 5, failedOrders: { count: 0, source: "none" } }), { kind: "success" });

console.log("runner alert classification tests passed");
