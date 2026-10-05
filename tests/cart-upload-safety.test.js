"use strict";

const assert = require("node:assert/strict");
const {
  selectUsableAutomationPage,
  canRetryCartUploadAttempt,
  resolveCartUploadRecovery,
} = require("../src/bot/cart-upload-safety");

const closed = { id: "closed" };
const replacement = { id: "replacement" };
const isClosed = (page) => page.id === "closed";

// Reproduce export recovery replacing activePage while the caller retains the
// now-closed page. The next cart operation must select the replacement.
assert.equal(selectUsableAutomationPage(replacement, closed, isClosed), replacement);
assert.equal(selectUsableAutomationPage(null, replacement, isClosed), replacement);
assert.equal(selectUsableAutomationPage(null, closed, isClosed), null);

assert.equal(canRetryCartUploadAttempt({ submissionMayHaveOccurred: false }), true);
assert.equal(canRetryCartUploadAttempt({ submissionMayHaveOccurred: true }), false);
const batch = [{ id: "accepted" }, { id: "absent" }];
const reconciled = resolveCartUploadRecovery(batch, {
  submissionMayHaveOccurred: true,
  verificationSucceeded: true,
  confirmed: [batch[0]],
  unconfirmed: [batch[1]],
});
assert.deepEqual(reconciled.confirmed, [batch[0]]);
assert.deepEqual(reconciled.retry, []);
assert.deepEqual(reconciled.manualReview, [batch[1]]);
const unverifiable = resolveCartUploadRecovery(batch, { submissionMayHaveOccurred: true, verificationSucceeded: false });
assert.deepEqual(unverifiable.retry, []);
assert.deepEqual(unverifiable.manualReview, batch);
const checkOne = resolveCartUploadRecovery(batch, {
  submissionMayHaveOccurred: true,
  verificationSucceeded: true,
  confirmed: [batch[0]],
  unconfirmed: [batch[1]],
});
const laterCheckFailed = resolveCartUploadRecovery(checkOne.manualReview, {
  submissionMayHaveOccurred: true,
  // The workflow remembers the first successful export even though the next
  // bounded check failed; remaining orders still need to be retained.
  verificationSucceeded: true,
});
assert.deepEqual(laterCheckFailed.manualReview, [batch[1]], "rows still absent after an earlier successful export must be retained if a later check fails");
const neverSubmittedDeferred = resolveCartUploadRecovery(batch, { submissionMayHaveOccurred: false, verificationSucceeded: false });
assert.deepEqual(neverSubmittedDeferred.retry, batch);
assert.deepEqual(neverSubmittedDeferred.manualReview, []);

console.log("Cart upload safety verification passed.");
