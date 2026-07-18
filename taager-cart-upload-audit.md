# Taager Cart Upload Reliability Audit

Date: 2026-07-18
Scope: EasyOrders/LightFunnels parsed orders -> Taager cart XLSX -> Taager cart bulk upload -> Taager orders export verification.

## User-reported behavior

The problem is not only the visible Taager failed rows.

Observed behavior:

- A run may prepare about 40 uploadable orders.
- Taager may accept only a small chunk in that run, for example 5-10 orders.
- A later app run accepts another chunk from the same original group.
- Taager-declared failed rows can be ignored as hard failures, because retrying those rows usually does not make them enter the system.
- The critical bug is the remaining rows: orders that are not declared failed, but also are not present in Taager after the upload.

Correct behavior:

1. Upload the current pending cart rows.
2. Export Taager orders again.
3. Compare the export against the pre-upload baseline by order identity.
4. Mark only exported rows as confirmed.
5. Mark Taager-declared failed rows as failed.
6. Re-upload only the still-unconfirmed, not-failed rows.
7. Repeat until everything is either confirmed or hard failed, with a stop condition if Taager makes no progress.

## Findings

### 1. Pre-upload duplicate detection was too broad

Before this audit, `parseTaagerOrderKeys` returned existing Taager phones only. `mergeAndDeduplicate` then skipped any new EasyOrders row if its phone already existed in Taager.

That is unsafe because one customer phone can legitimately have multiple orders for different SKUs. The correct identity for this app is phone plus SKU.

Impact:

- Some valid orders could be filtered out before reaching the cart.
- This does not explain every partial-upload symptom, but it is a real correctness bug in the same pipeline.

Fix applied:

- Existing Taager orders are now tracked as `phone|sku` keys.
- `mergeAndDeduplicate` skips only exact `phone|sku` matches.
- Same phone with a different SKU remains uploadable.

Files:

- `src/bot/parser.js`
- `tests/missing-orders-feature.test.js`

### 2. The verified upload loop existed, but the default retry ceiling was too low

The app already had the right concept in `phase5_uploadToTaagerVerified`:

- upload to cart;
- export Taager orders;
- compare before/after counts by phone plus SKU;
- retry unconfirmed rows.

But the default was only 3 verified cycles. If Taager accepts a small chunk each cycle, 3 cycles can still leave many not-failed orders missing. Those missing rows then appear to be fixed only by running the entire app again and again.

Fix applied:

- Default verified cart cycles now scale to `max(12, pending order count)`, and each cycle submits a controlled batch instead of the whole pending list.
- The cycle count is still configurable via `cartVerificationMaxCycles`; the per-cycle upload size is configurable via `cartVerificationBatchSize` and defaults to 10.
- Added a no-progress brake via `cartVerificationNoProgressCycles`, default 2.

This means a 40-order run can perform up to 40 verified upload/export cycles by default, submitting up to 10 pending rows per cycle, and it will stop earlier if all rows are confirmed or repeated cycles confirm nothing new.

Files:

- `src/bot/runner.js`
- `tests/missing-orders-feature.test.js`

### 3. Hard failed rows are separate from missing/unconfirmed rows

Taager hard failures should not be treated the same as silent missing rows.

Current intended behavior after this audit:

- Hard failed rows: reported in failed-orders output.
- Confirmed rows: included in successful result rows only after export verification proves they exist in Taager.
- Unconfirmed rows: retried in the same run until confirmed, hard failed, max cycles reached, or no-progress limit is reached.

This matches the user clarification: failed rows may be thrown away, but non-failed missing rows must keep being submitted.

### 4. Multi-product source orders cannot be uploaded as one Taager bulk row

A source order can contain two or more products for the same customer. The ideal shipping-fee behavior would be to create one Taager order containing all SKUs, because splitting the source order into multiple Taager rows can create multiple shipping charges.

This was tested directly against Taager bulk cart upload:

- comma-separated product, price, and quantity cells were rejected;
- newline-separated product, price, and quantity cells were also rejected;
- Taager displayed product retrieval/validation errors for grouped product cells.

Conclusion:

- Taager exports multi-product orders as comma-separated SKU cells, so comma splitting is correct when reading Taager exports.
- Taager bulk cart upload does not accept that same grouped-cell format.
- Therefore the app must upload separate product rows until Taager provides a supported multi-product bulk-upload format.

Fix applied:

- Upload workbook generation was reverted to flat one-product-per-row output.
- Parser grouping is still used before upload to detect partial multi-product conflicts.
- If all products in a source order are new, the app uploads the product rows separately.
- If some products from the same source order already exist in Taager and some do not, the app skips that source group into review instead of silently creating a new partial shipping order.

Files:

- `src/bot/cart-order-groups.js`
- `src/bot/parser.js`
- `src/bot/output.js`
- `tests/missing-orders-feature.test.js`

## Current Reconciliation Algorithm

For each cart destination:

1. Build the upload workbook from pending rows.
2. Upload a controlled chunk to Taager cart.
3. Read Taager's visible/official failed rows.
4. Exclude those failed rows from retry candidates.
5. Wait briefly for Taager to persist created orders.
6. Export Taager orders for the verification date range.
7. Count exported rows by `normalizedPhone|sku`.
8. Compare against the previous snapshot.
9. Confirm only rows whose count increased.
10. Retry the remaining unconfirmed rows.

Stop conditions:

- pending rows reach zero;
- max verified cycles reached;
- repeated cycles make no progress;
- Taager export/upload throws a terminal error.

## Important Remaining Risks

### Taager export latency

If Taager accepts rows but they do not appear in the export quickly, a row may be retried unnecessarily. The current settle delay is configurable via `cartVerificationSettleMs` and defaults to 10 seconds.

Recommended if the issue persists:

- Increase `cartVerificationSettleMs` to 20000 or 30000.

### Taager daily/rate limits

If Taager intentionally throttles bulk creation, a larger cycle count helps, but cannot force Taager to accept more per minute. The no-progress brake prevents endless loops when Taager stops accepting new rows.

### Weak identity for repeated identical orders

The verification identity is `phone|sku` plus count delta. This supports repeated same phone/SKU orders because it uses counts, not just existence. It still cannot distinguish two identical orders except by count, which is acceptable for proving all rows entered Taager.

### Official failed file quality

If Taager's failed-orders workbook mislabels rows, the app may classify a row as hard failed when it was only temporarily blocked. This audit did not change that policy because the user clarified failed rows usually remain failed even when retried.

## Verification Added

Regression coverage now checks:

- same phone and same SKU is considered already in Taager;
- same phone and different SKU remains uploadable;
- multi-product source orders generate separate Taager upload rows because grouped bulk cells are rejected;
- partial multi-product groups are skipped into review instead of creating a partial new shipping order;
- the runner source scales default verification cycles to the pending order count;
- the runner source includes a no-progress brake;
- the runner source submits controlled batches via `cartVerificationBatchSize`.

Manual workbook audit after the grouped-upload rollback:

- real EasyOrders rows parsed: 346
- missed rows parsed: 174
- missed rows resolved to SKU-backed items: 163
- latest Taager verification export loaded: 799 existing phone+SKU pairs
- generated current upload workbook rows: 22
- grouped upload cells containing comma/newline in SKU, price, or quantity columns: 0

This confirms the current upload file no longer contains the exact grouped product-cell format Taager rejected.

## Results UI Change

The results page now separates two different concepts:

- `All Attempted Orders`: rows the app tried to submit in the run.
- `New Orders Confirmed in Taager`: rows proven by the post-upload Taager export delta.

This avoids presenting attempted rows as successful when Taager accepted only a smaller subset.

## Live Validation

Real upload validation was run against account `Abdo` (`account_1781183026872`) for 2026-07-01 through 2026-07-18 with auto-confirm enabled.

### First live run

Preview:

- total new candidates: 28
- primary cart candidates: 14
- second Taager cart candidates: 14

Primary cart result:

- submitted: 14
- confirmed by Taager export: 5
- hard failed: 9
- unconfirmed/missing after verification: 0

The second Taager cart path failed before upload because the second cart login timed out. That was separate from the primary-cart partial-upload bug.

Saved evidence:

- `.codex-tmp/live-taager-upload/live-run-result.json`
- `.codex-tmp/live-taager-upload/live-output-upload-workbook.xlsx`
- `.codex-tmp/live-taager-upload/live-failed-orders.xlsx`
- `.codex-tmp/live-taager-upload/live-skipped-orders.xlsx`
- `.codex-tmp/live-taager-upload/sheets/taager-verification-primary_cart-cycle-1-attempt-1-1784349943781.xlsx`
- `.codex-tmp/live-taager-upload/sheets/taager-verification-primary_cart-cycle-2-attempt-1-1784349978531.xlsx`

### Interrupted repeat run

The first repeat attempt in `.codex-tmp/live-taager-upload-repeat` was killed externally before meaningful upload work. It should be ignored for validation.

### Clean repeat run after profile correction

Preview:

- total new candidates: 23
- primary cart candidates: 23
- second Taager cart candidates: 0

This proved two important things:

- the 5 orders confirmed in the first live run were not selected again;
- after the profile correction, all remaining candidates routed to the primary cart instead of the second cart.

Primary cart result:

- submitted: 23
- confirmed by Taager export: 8
- hard failed: 15
- unconfirmed/missing after verification: 0

Cycle detail:

- cycle 1: submitted 10, confirmed 0, hard failed 10, pending after cycle 13
- cycle 2: submitted 10, confirmed 6, hard failed 4, pending after cycle 3
- cycle 3: submitted 3, confirmed 2, hard failed 1, pending after cycle 0

Saved Taager export row totals independently support the confirmation count:

- previous verified export total: 791 rows
- repeat cycle 1 export total: 791 rows
- repeat cycle 2 export total: 797 rows
- repeat cycle 3 export total: 799 rows

The export grew by 8 rows across the clean repeat run, matching `cartVerification.confirmed = 8`.

Saved evidence:

- `.codex-tmp/live-taager-upload-repeat2/live-run-result.json`
- `.codex-tmp/live-taager-upload-repeat2/live-output-upload-workbook.xlsx`
- `.codex-tmp/live-taager-upload-repeat2/live-failed-orders.xlsx`
- `.codex-tmp/live-taager-upload-repeat2/live-skipped-orders.xlsx`
- `.codex-tmp/live-taager-upload-repeat2/sheets/taager-verification-primary_cart-cycle-1-attempt-1-1784351124129.xlsx`
- `.codex-tmp/live-taager-upload-repeat2/sheets/taager-verification-primary_cart-cycle-2-attempt-1-1784351178148.xlsx`
- `.codex-tmp/live-taager-upload-repeat2/sheets/taager-verification-primary_cart-cycle-3-attempt-1-1784351223493.xlsx`
## Follow-up Correction: Hard-failed Rows Are Per-run Only

The clean repeat run exposed an important distinction:

- first live run candidates: 28
- first live run confirmed in primary cart: 5
- first live run primary hard failures: 9
- second-cart candidates not uploaded because the second cart login failed: 14
- clean repeat candidates after profile correction: 23

The 23 count means the app skipped the 5 confirmed rows, but the 9 Taager-declared hard failures from the previous app run appeared again. That is acceptable across separate runs because Taager may later open the SKU/product for the affiliate.

Correct behavior after this correction:

- During one verified upload run, Taager-declared failed rows are removed from that run's retry queue.
- Those same failed rows are not uploaded again in cycle 2, cycle 3, etc. of the same run.
- The app does not persist those hard failures across app runs.
- A future run can try them again after the SKU/product is fixed in Taager.
- Only rows that are not failed and not confirmed stay in the current run's retry queue.

The temporary hard-failed registry file created during debugging was removed.

## Operational Recommendation

For this specific bug, a successful run should no longer be judged by the cart page message. It should be judged by the final verification export counts:

- `cartVerification.submitted`
- `cartVerification.confirmed`
- `cartVerification.failed`
- per-cycle `submitted`, `confirmed`, `knownFailed`, and `unconfirmed`

If confirmed plus failed is less than submitted, the remaining rows should appear in the failed/unconfirmed output with the reason `Not confirmed in Taager export...`.






