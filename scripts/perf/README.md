# Dashboard load testing (5K orders / 100 products)

Two scripts, added under `scripts/perf/`, answer one question with real
measurements instead of complexity-theory guesses: **what actually happens
to the dashboard at 5,000 orders and 100+ products?**

```
scripts/perf/
  build-perf-fixture.js     generates the synthetic dataset
  qa-dashboard-perf-load.js boots the REAL app and measures it
  fixtures/                 generated fixture JSON lands here (gitignored-worthy)
```

New npm scripts:

```
npm run perf:fixture         # generate scripts/perf/fixtures/perf-fixture.json
npm run perf:dashboard-load  # run the load test against it (auto-generates the fixture if missing)
npm run perf:dashboard-load -- --sections=orders --skipStability=true
npm run perf:dashboard-load -- --sections=products,cities --switches=10
```

## What makes this different from `npm run qa:dashboard:perf`

Your existing `qa-dashboard-performance.js` (→ `qa-dashboard-responsive.js`'s
`verifyDashboardPerformanceAcceptance`) is a UI-regression test. It replaces
`window.runDashboardAggregator` with a hand-built 96-order stand-in
(`buildDashboardResult()`), so it's fast and deterministic — but it never
actually exercises the real Pass-1/Pass-2 logic in `dashboard-aggregator.js`.

`qa-dashboard-perf-load.js` does the opposite on purpose: it feeds 5,000
real-shaped order rows through `window.api.getDashboardSnapshot` and leaves
`window.runDashboardAggregator` completely untouched, so the *actual*
aggregation code runs against the *actual* data volume. Then it runs the
same interaction and stability categories as the existing suite, with
active-pane selector scoping and explicit fixture-integrity checks, at ~50x
the row count.

The valid fixture-backed path uses real Electron through Playwright. The test
temporarily replaces only the credentials, dashboard-snapshot, and dashboard
query-flag IPC handlers inside that test process. Electron's context-bridged
`window.api` is intentionally non-writable, so renderer-side replacement is
not a valid mocking strategy. No production data is modified.

## `build-perf-fixture.js`

Generates orders matching the exact row schema `dashboard-aggregator.js`
expects — cloned from `src/renderer/pages/premium-preview.js`'s `makeOrder()`,
since that generator already flows through the real aggregator in
production (premium preview mode), making it the most reliable schema
reference available rather than guessing field names.

- 100 products across 15 category templates, Pareto-weighted demand (~20%
  "winners" carry most of the volume) so product ranking/forecast features
  see realistic variance instead of flat data.
- Orders spread across the real 13 Saudi provinces/cities from
  `window.TaagerGeo` (`src/renderer/app.js`), weighted toward Riyadh/Eastern/
  Mecca.
- Status funnel reuses the exact strings from `premium-preview.js` (proven to
  normalize correctly via `window.TaagerStatus`), weighted per product tier
  into a realistic delivered/failed/canceled mix instead of a uniform spread.
- Dates: ~85% inside the **current calendar month**, ~15% in the prior month.
  This matters — the dashboard's default period is `"thisMonth"`
  (`dashboard-filter-bus.js`), so a fixture that mostly falls outside the
  default view wouldn't actually stress-test what a user sees on open.

```
node scripts/perf/build-perf-fixture.js                          # 5000 orders / 100 products, seed 1337
node scripts/perf/build-perf-fixture.js --orders=20000 --products=250
node scripts/perf/build-perf-fixture.js --seed=42 --out=other.json
```

Same seed → same fixture, so before/after runs are comparable.

## `qa-dashboard-perf-load.js`

1. Launches the real app, mounts the dashboard with the fixture flowing
   through the real aggregator (not the UI-test stand-in).
2. Reads the app's **own** instrumentation (`window.TaagerPerf` —
   already shipped in `app.js`) rather than inventing a separate timing
   scheme:
   - `dashboard:data:aggregation` — the real Pass-1 aggregation pass.
   - `dashboard:shell:mount`, `dashboard:section:render`,
     `dashboard:section:switch` (with `detail.cacheHit`).
   - `window.TaagerPerf.entries().filter(e => e.type === "longtask")` —
     real >50ms main-thread blocks, auto-captured via `PerformanceObserver`.
   - `window.TaagerPerf.snapshot()` — DOM node count + JS heap.
3. Cold-renders every section you asked about (orders, products, cities,
   marketing, calculator, productForecast, taagerAi), reporting separate
   numbers per section because they answer different questions:
   - `shellSwitchMs` — time until the shell flags the section active
   - `lazyLoadMs` — loading time for the section's lazy script group
   - `renderFnMs` — the render function's own execution time
     (`dashboard:section:render`)
   - `visibleWallClockMs` — true wall clock until real content appears,
     which is the only one of the three that includes a first-ever-visit
     lazy section-script fetch (`ensureDashboardSection`) — something the
     app's own render-duration instrumentation doesn't cover.
4. Re-runs your existing acceptance bar at this scale: empty-search update
   time (200ms), input-dispatch latency (50ms), cached-section-restore time
   (100ms), and the 50-rapid-switch stability/leak check (≤500 node growth,
   ≤25MB heap growth, six configured cache entries, at most one transient
   active loader, and no growing subscriptions). The rapid-switch phase has
   a 60-second deadline so a regression cannot hang CI indefinitely.
5. Writes a full JSON report to `.codex-tmp/perf-reports/` and exits 1 if
   anything exceeded threshold — **and still writes the full partial report
   even if a later step crashes**, so a problem in section 9 doesn't erase
   what you already learned about sections 3–7.

## Latest verified result (2026-06-28)

The corrected Electron run used seed 1337 with 5,000 fixture rows. It verified
that the IPC layer exposed the fixture account and that 4,243 period-filtered
rows reached the real aggregator output.

- Aggregation: **19ms**; shell mount: **116ms**; cached restore: **2ms**.
- All cold sections became ready in **91-223ms**, including Taager AI at
  **188ms**.
- Search filtering completed in **1-137.3ms** and input dispatch stayed below
  **4.4ms**.
- The 50-switch stability phase passed with zero heap/subscription growth,
  375 DOM-node growth, and seven pane children (six cached plus one transient
  active pane).
- Only two long tasks were observed; the maximum was **51ms**.

Latest passing report: `perf-report-1782638925075.json`.

## 15K verified result (2026-06-28)

Large snapshots now prefer a cached gzip/Base64 IPC transport, decoded with
the browser's native `DecompressionStream`. The JSON-string and original
object IPC methods remain available as backward-compatible fallbacks.

- Initial 15,000-order mount: **3.58s**.
- Aggregation: **55ms**; shell mount: **96ms**; cached restore: **2ms**.
- All cold sections became ready in **80-469ms**, including Taager AI at
  **237ms**.
- Search filtering completed in **1.3-71.3ms** and input dispatch stayed
  below **5ms**.
- The composition-matched 50-switch stability phase passed with **-7 DOM
  nodes**, zero heap/subscription growth, and six cached panes.

Full 15K report: `perf-report-1782657561612.json`.

The original 5K regression gate also passed after these changes. Its latest
report is `perf-report-1782657617595.json`.

Full generated reports are written under `.codex-tmp/perf-reports/` and are
intentionally excluded from Git.

## Historical notes from the original handoff

The notes below are retained as provenance, but their absolute measurements
are superseded by the verified result above.

I validated every selector and the full mount/measurement flow end-to-end
against your real renderer code with the actual 5,000-order/100-product
fixture before delivering this (details below) — **but only on a 1-vCPU /
4GB sandbox**, which is a much harsher environment than your actual dev
machine. Treat the pattern as signal, the absolute milliseconds as not.

- **Real aggregation pass: ~1.2–1.6s.** This is the one finding I'd flag
  hardest, because my original complexity-based estimate ("sub-100ms, single
  O(n) pass") undersold it — actual per-row work (date parsing, regex status
  matching, building several derived objects) adds up to noticeably more
  than pure Big-O reasoning suggested. It's a one-time cost per data
  load/account switch (cached indefinitely after, as covered earlier), not a
  per-interaction cost — but it's not instant either. Worth re-measuring on
  your own machine; a multi-core desktop will likely cut this down
  meaningfully, but I wouldn't assume it disappears entirely.
- **First-ever visit to a section can take 0.5–3s+ of wall clock**, on top
  of whatever `renderFnMs` reports, because each section's JS module lazy-
  loads on first visit (`ensureDashboardSection`). Which section is "slow"
  varied run to run in my testing (not the same section twice) — consistent
  with this being lazy-load-and-CPU-contention jitter rather than one
  specific section having a real algorithmic problem. Re-run on real
  hardware to see if it's still noticeable; if it is, it'd be a candidate for
  prefetching the next-likely section's script while the user is on the
  current one.
- **Cached section restores were fast** (single-digit ms) every time —
  confirms the pane-cache architecture described earlier holds up under
  load, not just in theory.
- **One run showed an orders-section search taking >3s to filter down to
  zero rows**, where the debounce itself is only 120ms. I couldn't tell
  whether this was genuine main-thread contention from concurrent background
  work (marketing status fan-out, AI mirror warming) stacking up after
  several heavy section loads, or just this sandbox's single CPU core
  saturating. I didn't want to either bury this or call it a confirmed bug —
  it's exactly the kind of thing this script exists to catch, so: run it
  yourself and see if `ordersSearchMs` in the JSON report ever reports
  `timedOut: true` on your machine. If it doesn't, chalk it up to my sandbox.
- The script itself crashed mid-run once (browser process died) on that same
  1-vCPU/4GB box during the 50-switch stability check — almost certainly
  memory pressure specific to that tiny sandbox, not a finding about your
  app. The partial-report behavior (point 5 above) exists specifically
  because of hitting this.

None of this overturns the original audit's conclusion — the architecture
(single-pass hashmap aggregation, section-level DOM caching, paginated
rendering) is still the right design for this data volume, and "cached
restore stays fast" is direct confirmation of that. What changes is the
confidence level on the *first-load* numbers: "should be fine" is now
"here's a script that tells you, with your own thresholds, on your own
machine, whenever you want to check again."
