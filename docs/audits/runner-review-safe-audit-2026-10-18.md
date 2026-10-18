# Runner and Results safe audit — 2026-10-18

## Scope

This audit covers Runner result handling and recovery actions. Following the initial read-only review, the user explicitly authorized bounded real/missed affiliate recovery tests for the Abdo account. No live customer rows or values are recorded here; no cart upload, order edit/save, delete, or other-account action was performed.

## Feature matrix

| Feature | Evidence | Status |
| --- | --- | --- |
| Run page and account gate | After a controlled restart to load current code, Abdo was selected alone. The Locked badge restricts account editing; it does not prevent running. A bounded historical Oct 2–5 test used Auto-Confirm ON, Affiliate Recovery ON, Route Missed Orders OFF, and Auto-Run OFF. | Account selected through the normal UI; no account lock/license setting was changed. |
| Run Results history | `src/renderer/pages/run-results.js` loads saved run records, filters and exports visible history. No resend/convert action is wired in that page. | Code inspection only. |
| Immediate Results per-account Needs Review tables | `src/renderer/pages/results.js` renders separate panes from each `_accountResults` entry. Cart review rows and affiliate `blockedReviewRows` can be merged into one table and filtered by destination. | Renderer regression exercised with synthetic fixtures and a mocked `window.api.runBot`; no bot process was started. |
| Manual review account isolation | The renderer previously omitted the pane account ID in multi-account mode, allowing empty `accountIds` to reach the main-process all-account fallback. Each table now retains its pane ID; missing identity blocks before IPC. Main IPC validates exactly one non-static saved account (or explicit legacy account when no saved accounts exist), and manual-review selection uses only that ID. | Fixed; focused browser and guard tests pass. |
| Standard affiliate recovery preview | `src/bot/runner.js` returns after producing a preview when `autoConfirm !== true`, before EasyOrders resend/convert actions. | Code-path inspection only; the live write test used Auto-Confirm ON. |
| Real-order resend / missed-order convert | The bounded Abdo run selected one valid real candidate and completed one resend verified in Taager. A separate run selected one valid missed candidate; its conversion was accepted and EasyOrders showed Completed. An independent read-only Dashboard export through Oct 18 found one matching current-day Taager row. An ambiguous zero-quantity candidate remained unselected. | One real resend verified; one missed conversion independently corroborated. The earlier run's verification stopped at the selected Oct 5 end date and performed its built-in single retry before the current-day verification fix. No additional recovery action followed the independent match. |
| Unresolved and pending attempted rows | `buildRecoveryUnresolvedHtml` presents unresolved rows for review/download. Accepted-but-unverified statuses are now excluded from action checkboxes and held by the manual recovery path. | Focused tests cover renderer non-actionability, fresh current-key preflight, preflight failure blocking, and post-action verification. The safeguards were not followed by another live recovery action. |

## Focused verification

`node tests/manual-review-scope.test.js` runs the production Results renderer in headless Chrome with synthetic account A/B panes and a mocked `window.api.runBot`. It checks that two selected cart rows under A send only `[account-A]`, a merged affiliate review row under A is destination-filtered and also scoped only to A, account B starts with no selected rows, and missing account identity does not invoke the mock API. The same test exercises the scope validator used by `run-bot` and checks that main-process validation is wired before account selection.

`node --check` passed for `src/renderer/pages/results.js`, `src/main/main.js`, `src/main/manual-review-scope.js`, and `tests/manual-review-scope.test.js`. `git diff --check` passed.

## Limits and open audit items

- A live preview run was not used to validate every upstream stage; the bounded recovery test ran with Auto-Confirm ON.
- The current-day verification-window fix and manual current-key preflight passed focused automated tests, but the live recovery action was not repeated after those safeguards were added.
- The Results review buttons are write-capable. Renderer account scoping and accepted-pending exclusion were exercised in headless browser fixtures with a mocked API; no manual Needs Review action was repeated after the final scope/duplicate safeguards.
- Login/OTP, account switching, saved Run Results history, all dashboard filters, and unrelated integrations remain outside the live verification performed here.
