# Expected NDR / Closed Cycle Calculation Contract

This document is the source of truth for Actual NDR mode and Expected NDR / Closed Cycle mode across the dashboard, account calculator, product calculator, products, cities, campaigns, daily performance, and all related sections.

## Core Rule

Expected NDR / Closed Cycle mode changes the NDR. It does not change the average profit basis.

The average profit used in Expected NDR mode must be the same average profit used in Actual NDR mode for the current dashboard/account/product context. The selected closed-cycle date range is only for calculating the expected net delivery rate.

## Confirmed Observation

When Actual NDR mode is switched to a custom dashboard range that matches the best closed-cycle range, the NDR calculation itself is correct. For example, July 4 to July 10 shows 64 delivered orders out of 292 net orders:

- 64 / 292 = 21.92% NDR.
- This matches the Best NDR Cycle value of about 21.9%.

That means the core NDR formula is not the main suspected bug. The suspected bug is Expected NDR / Closed Cycle mode selecting, caching, displaying, or applying the wrong NDR source, or combining the correct closed-cycle NDR with the wrong average-profit source.

## Definitions

- Dashboard period: the main reporting period selected at the top of the dashboard, for example July 1 to July 18.
- Closed-cycle period: the NDR date range selected while Expected NDR / Closed Cycle mode is active, for example June 4 to June 10.
- Net orders: orders that count toward NDR after excluding canceled-by-user and other statuses that should not be part of the NDR denominator.
- Delivered orders: orders whose final status is delivered.
- Net Delivery Rate, or NDR: delivered orders divided by net orders.
- Profit After Tax: the saved per-order profit after tax. The parser already computes this as order profit minus tax profit, so dashboard calculations must not subtract tax again.
- Average Profit: Profit After Tax per delivered order from the actual dashboard/account/product context.

## Actual NDR Mode

Actual mode uses the dashboard period only.

- NDR = actual delivered orders in the dashboard period / actual net orders in the dashboard period.
- Delivered orders = actual delivered order count in the dashboard period.
- Average Profit = actual delivered Profit After Tax / actual delivered orders.
- Total Profit Before Ad Spend = actual delivered Profit After Tax.
- Account Net Profit = Total Profit Before Ad Spend - Total Spend.
- Break-even CPA = Average Profit * actual NDR.

If there are no delivered orders, the only acceptable fallback is the same shared fallback used everywhere, such as net-order profit divided by net orders when available. This fallback must be identical in Actual and Expected mode.

## Expected NDR / Closed Cycle Mode

Expected mode uses two different sources on purpose:

- The closed-cycle period provides the NDR.
- The dashboard period provides average profit, spend, net orders, and the base business context.

Expected mode formula:

- Expected NDR = delivered orders in selected closed-cycle period / net orders in selected closed-cycle period.
- Expected delivered orders = dashboard-period net orders * Expected NDR.
- Average Profit = the same Actual-mode average profit for the same account/product/city/campaign context.
- Total Profit Before Ad Spend = Expected delivered orders * Actual-mode Average Profit.
- Account Net Profit = Total Profit Before Ad Spend - Total Spend.
- Break-even CPA = Actual-mode Average Profit * Expected NDR.
- Delivered CPA = Total Spend / Expected delivered orders.
- Net Total Delivered Sales changes only because expected delivered volume changes; its AOV or sales basis must remain from the actual dashboard context.

Expected mode must not calculate average profit from the closed-cycle period. The closed-cycle period is not a profit sample. It is only an NDR sample.

## What Changes In Expected Mode

These values are allowed or expected to change when the selected closed-cycle NDR changes:

- Net Delivery Rate (NDR).
- Expected delivered orders.
- Delivered rate cards and expected delivery counts.
- Break-even CPA.
- Delivered CPA.
- Total Profit Before Ad Spend.
- Account Net Profit.
- Net Total Delivered Sales, when projected from expected delivered volume.
- Net ROAS, ROI, and any profit metric that depends on expected delivered volume or expected profit.

## What Must Not Change Just Because NDR Mode Changes

These values must stay based on the actual dashboard context:

- Average Profit.
- Profit After Tax per delivered order.
- Average Order Value basis.
- Net orders in the dashboard period.
- Total Spend.
- Cost per Order CPA, when it is based on spend / dashboard-period orders.
- Actual delivered order count stored for actual reporting.
- Any actual, historical, non-projected value.

## Best NDR Cycle Rules

The Best NDR Cycle badge is a recommendation or shortcut. It is not automatically the active Expected NDR value unless the app explicitly applies it to the selected closed-cycle date fields.

Required behavior:

- If the selected closed-cycle date fields are June 4 to June 10, the Expected NDR card must use June 4 to June 10.
- If the Best NDR Cycle badge says July 4 to July 10, but the selected date fields say June 4 to June 10, the active Expected NDR must still come from June 4 to June 10.
- If the user clicks a Best Cycle action, the selected closed-cycle date fields must update to the best cycle dates.
- After applying Best Cycle, the NDR card and the Best NDR Cycle badge must match within normal rounding.
- The UI must not imply the Best NDR Cycle is active when the selected date fields are different.

## Naming And Labels

Use the label `Net Delivery Rate (NDR)` consistently.

Avoid labels like `Delivery Rate NDR` because they mix delivery rate and net delivery rate in a confusing way.

In Expected mode, projected dependent metrics may show `Expected`, `Projected`, or `Supposed` if that is the existing UI language. Average Profit should not be presented as a projected value unless the shared fallback is being used because actual delivered profit is unavailable.

## Section Contract

Every section must follow the same calculation contract:

- Quick Insights / overview cards.
- Account Calculator.
- Product Calculator.
- Products section.
- Cities section.
- Campaigns section.
- Daily Performance.
- Order Sources.
- COD Collection.
- Performance charts.
- Section 8 and every remaining dashboard section.

Sections must not invent their own Expected NDR formulas. They should consume the shared financial calculation data or call the shared helper/core that applies this contract.

If a section has no data, it must render a clear zero or unavailable state with a reason. Section 8 must not render empty in either Actual NDR mode or Expected NDR mode.

## Product, City, And Campaign Grain

When showing product, city, or campaign rows in Expected mode:

- The NDR should come from the selected closed-cycle period at the same grain when available.
- If grain-specific closed-cycle NDR is unavailable, fallback may use the global selected closed-cycle NDR.
- The Average Profit must come from the actual dashboard period at the same grain when available.
- If grain-specific actual average profit is unavailable, fallback may use the shared actual/global fallback.
- The closed-cycle period must not become the average-profit source.

## Section-Level Obligations

- Overview and Section 8 must display the same account financial core: actual Average Profit, selected-cycle NDR, projected delivered count, projected Total Profit Before Ad Spend, projected Account Net Profit, projected Total Revenue, and projected Break-even CPA.
- Status Pipeline delivered stage must switch to expected delivered orders in Expected mode while preserving the actual delivered count separately for audit/debugging.
- Products section must keep each product's actual Average Profit and recalculate product delivered count, product profit, product net profit, product sales, delivered CPA, and Break-even CPA from the selected Expected NDR.
- Product Calculator must use product-level Expected NDR when available. If a product-level rate is unavailable, it must fall back to the active overview `Net Delivery Rate (NDR)` value, not a hardcoded default.
- Campaign Product Actions must update Break-even CPA from the same Expected NDR projection whenever it updates expected delivered orders, expected profit, net profit, ROI, ROAS, and sales.
- Cities must use city-level selected-cycle NDR when available, fall back to global selected-cycle NDR when needed, and keep actual city Average Profit as the profit basis.
- Prepaid/rebate-style recommendations must use the shared actual Average Profit from `geo.kpis.averageProfit`/account financial core. Payment-method NDR can change by selected Expected NDR data, but the discount/profit safety math must not use closed-cycle profit as the average-profit source.
- Daily Performance, Commission, Order Sources, COD Collection, and charts must consume shared financial outputs or the shared financial core. They must not recreate an alternate Expected NDR formula.
## Required Audit Checks

Use these invariants when testing or debugging:

- Switching Actual mode to Expected mode must not change Average Profit except for rounding or currency conversion.
- The Expected NDR card must equal the selected closed-cycle delivered orders / selected closed-cycle net orders.
- The Expected NDR card must not silently use a stale Best NDR Cycle badge if the selected dates are different.
- Break-even CPA must equal Actual-mode Average Profit * Expected NDR.
- Total Profit Before Ad Spend must equal Expected delivered orders * Actual-mode Average Profit.
- Account Net Profit must equal Total Profit Before Ad Spend - Total Spend.
- Profit After Tax must not have tax subtracted twice.
- All sections must agree on the same average-profit source and the same active Expected NDR.

## Client Troubleshooting Order

Do not reset all client data or uninstall first.

Use this order:

1. Confirm the client's installed build includes the Expected NDR fix.
2. Confirm the selected closed-cycle dates shown in the UI are the dates being used by the NDR calculation.
3. Clear dashboard cache or local cached calculation state if the UI shows stale Best Cycle dates or stale NDR values.
4. Compare Actual mode Average Profit and Expected mode Average Profit for the same context. They should match.
5. Compare Expected NDR against the selected closed-cycle delivered/net order counts.
6. Only request a data export or deeper data reset if the formulas are correct but stored order data is inconsistent.

Uninstalling from Control Panel should be a last resort. A formula bug or stale dashboard cache should be fixed directly; reinstalling should not be used as the primary solution.




