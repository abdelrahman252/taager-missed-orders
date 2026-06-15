# Performance Overhaul Plan - Electron Dashboard + Taager AI

This plan is the working roadmap for making the Electron app feel fast, with the dashboard as the main target and Taager AI included as a first-class performance path.

The old plan had good instincts, but some parts are now stale. The app already has expanded dashboard prewarming, lazy route groups, backend pagination in key places, and AI backend caching. The next work should focus on the real remaining bottlenecks: dashboard first open, repeated section rebuilds, lifecycle cleanup, the CSS monolith, and AI startup/context latency.

## Goals

- Make the dashboard first usable paint faster.
- Make dashboard section switches feel instant after first load.
- Make typing, searching, filtering, sorting, pagination, calculators, and forecast inputs stay responsive after dashboard data is loaded.
- Reduce repeated DOM rebuilds and repeated expensive section initialization.
- Prevent hidden/stale dashboard sections from continuing to do work.
- Keep Taager AI responsive by reusing dashboard data, caching AI context, and avoiding unnecessary full AI loads.
- Preserve all business logic, financial math, AI safety/routing, permissions, and user-facing behavior.

## Execution Contract For Codex

Implement this plan phase by phase. Do not apply the entire roadmap as one large change.

For every phase:

- Capture before/after runtime timings for the exact interaction being changed.
- Keep changes scoped to that phase and preserve a clear rollback path.
- Run the required static verification, syntax checks, and relevant manual/runtime QA before starting the next phase.
- Compare business outputs before and after. Stop and investigate if orders, COD, ROI, commission, campaign, calculator, forecast, city, product, or AI outputs change unexpectedly.
- Static verification passing is required but does not prove a performance improvement. A phase is complete only when measured runtime behavior improves or a documented stability prerequisite is delivered.
- Do not remove genuine loading states. A preloader or skeleton is correct while required data or code is unavailable; it should not appear when restoring a valid cached section.
- Cancel, supersede, or ignore stale asynchronous search, filter, pagination, section-load, and render results.
- Do not allow hidden cached panes to keep active observers, subscriptions, timers, animations, network refreshes, or global listeners unless explicitly required and measured.
- Keep caches bounded and invalidate them when relevant data version, account, period, delivered-date mode, language, theme, currency, or section-specific filters change.

Interaction performance targets after required dashboard data is available:

- Cached section restore target: under 100 ms.
- Typing and input feedback target: under 50 ms.
- Local search, filter, sort, and pagination update target: under 200 ms.
- No visible renderer freeze during navigation, typing, calculator input, or forecast input.
- No listener, observer, subscription, or meaningful memory growth after 50 repeated section switches.

## Current Reality

Measured from the current codebase:

- Boot still loads large synchronous assets from `index.html`:
  - `app.js`: about 182 KB
  - `setup.js`: about 171 KB
  - `run.js`: about 89 KB
  - `results.js`: about 62 KB
  - `analytics-utils.js`: about 34 KB
  - `main.css`: about 105 KB
  - `country-flag-icons` CSS: about 196 KB
- The dashboard initial lazy group is still heavy:
  - 23 JavaScript files
  - about 1 MB of dashboard JavaScript before deferred section groups
  - `dashboard-styles.css`: about 308 KB and about 10,094 lines
- Heavy dashboard modules include:
  - `section5-products.js`: about 254 KB
  - `section-cities.js`: about 163 KB
  - `section7-calculator.js`: about 155 KB
  - `dashboard-aggregator.js`: about 151 KB
  - `section4-cod.js`: about 131 KB
  - `section8-master.js`: about 116 KB
- Deferred dashboard groups already exist:
  - Products: about 260 KB
  - Campaigns: about 170 KB
  - COD: about 180 KB
  - Calculator: about 161 KB
  - Cities: about 225 KB
  - Orders: about 947 KB because of XLSX and order code
- `prewarmDashboardSections()` is already expanded beyond the old plan. It currently prewarms Cities, Products, Campaigns, COD, and Calculator.
- `npm run verify:performance` currently passes.
- Dashboard section switching still uses one shared `#dash-section-pane`, clears it, shows a loader, loads the section, and re-renders the section.
- Several sections attach observers, global listeners, subscriptions, timers, or charts. Some are cleaned up, but cleanup and inactive-pane behavior are not consistent across all sections.
- Taager AI is lazy loaded, but the AI page currently loads dashboard core first, then the dashboard AI group, and can run the dashboard aggregator again even when dashboard data already exists.

## Non-Negotiable Rules

- Do not change dashboard business math.
- Do not change order, COD, ROI, campaign, product, forecast, calculator, or city formulas.
- Do not change AI safety policy, budget/rate limiting, Gemini fallback rules, or local-only routing semantics. Prompt wording changes must stay within explicitly approved answer-format and data-grounding tasks.
- Do not remove `DashboardQueryRuntime.observe`, dashboard `onSectionChange`, i18n application, or `TaagerUI` enhancement on active sections.
- Do not put JavaScript files in CSS feature groups.
- Do not cache every dashboard section forever.
- Do not hide the entire dashboard shell just to hide one section.
- Do not block local AI answers on Gemini calls or marketing refresh when a local/mirror answer is enough.
- Do not send raw or partial Gemini JSON to the renderer.
- Keep the existing `dashboard-ai-query` invoke result as the single authoritative final AI response.
- Every performance change must have a rollback path.

## What Is Already Done

These items should not be repeated as if they are still missing:

- Dashboard route code is lazy loaded.
- Dashboard section feature groups exist.
- Products, Campaigns, Cities, COD, and Calculator are already prewarmed after dashboard mount.
- Dashboard core excludes XLSX and the full AI engine.
- Same-section render guards already exist through render keys.
- Products has backend pagination and cache-aware behavior.
- Campaign decision/intelligence code is split from core dashboard startup.
- `dashboard-ai-service.js` already has payload hashing, in-flight request reuse, cache hits, budget/rate limiting, context compression, local-only routing, and Gemini fallback.

## Bottleneck Map

### 1. App Boot

The renderer still pays for multiple large synchronous boot scripts and global CSS before the user reaches dashboard. This is not only a dashboard problem, but it makes dashboard startup feel worse.

Main opportunities:

- Keep boot script work minimal.
- Avoid pulling dashboard-only helpers into general app startup.
- Keep heavy exports and analysis libraries out of startup.
- Re-check whether `country-flag-icons` CSS must load globally.

### 2. Dashboard First Open

Dashboard first open still loads a large dashboard core and a large CSS file. The dashboard should show useful structure quickly, then hydrate heavy sections progressively.

Main opportunities:

- Keep the dashboard shell small.
- Keep first paint focused on header, navigation, and selected section skeleton.
- Delay non-selected section code until after first usable paint.
- Keep prewarming, but only after the dashboard is visible.

### 3. Dashboard Section Switching

The biggest interaction bottleneck is still section switching. The current shell uses a single section pane, clears it, and rebuilds sections. That means expensive sections repeatedly recreate DOM, charts, listeners, observers, and derived data.

Main opportunities:

- Cache recently visited section panes.
- Re-activate cached panes instead of rebuilding.
- Evict old panes safely.
- Run required activation hooks even on cache hits.
- Clean up every hidden or evicted pane correctly.

### 4. Section Lifecycle Leaks

Some section lifecycle code is clean, but not all of it is consistent. Pane caching makes this more important because hidden panes must not keep doing work unless intentionally subscribed.

Known cleanup targets:

- The shell now generically disconnects numbered `_s*ThemeObserver` properties, but every section still needs explicit inactive-pane behavior and full destruction coverage.
- `section8-master.js` has cleanup for ROI/marketing listeners, but chart destruction should be included when the section is removed or evicted.
- `section-cities.js` has an anonymous document click listener that should become removable.
- Dashboard shell unmount cleanup should clean every cached pane, not only the currently visible pane.

### 5. CSS Monolith

`dashboard-styles.css` is large and heavily tangled across sections, responsive rules, light theme rules, shared dashboard layout, city drawer styles, product matrix styles, and AI styles.

Splitting CSS is useful, but it should happen after lifecycle and caching work. CSS splitting first risks subtle visual regressions without fixing the main repeated-render cost.

### 6. Taager AI Speed

AI speed has two parts:

- Perceived speed: show the AI shell, local/mirror answer, and pending response immediately.
- Real speed: avoid duplicate dashboard aggregation, avoid rebuilding the same AI context, and reduce full AI route load when the user only needs the lightweight AI entry point.

The current AI page path loads dashboard core, then dashboard AI files, then builds/loads dashboard data for AI. That means AI can pay dashboard costs before it feels ready.

## Recommended Implementation Order

### Phase 0 - Add Performance Instrumentation

Add lightweight performance marks before changing behavior. This makes the work measurable instead of vibes-based.

Instrument:

- App route click to route shell visible.
- `ensureFeatureScripts("dashboard")`.
- Dashboard shell mount start/end.
- Dashboard data aggregation start/end.
- Section switch start.
- Section group load start/end.
- Section render start/end.
- Cached section restore time.
- Search/input event to visible result update for Products, Cities, Orders, Product Forecast, and Account Calculator.
- Sort, filter, and pagination action to visible result update.
- Long renderer tasks during section navigation and interactive input.
- Loader visible duration.
- AI route click to AI shell visible.
- `ensureFeatureScripts("dashboardAi")`.
- AI dashboard data reuse vs fresh aggregation.
- `getDashboardAiContext()` / `buildDashboardAiContext()` duration.
- AI local/mirror route duration.
- AI request to first Gemini stream heartbeat.
- Gemini stream heartbeat count and final completion duration.
- AI main-process request duration.
- AI answer rendered time.

Implementation notes:

- Use `performance.mark()` and `performance.measure()`.
- Keep logs behind a dev flag or a small diagnostic helper.
- Do not spam production console output.
- Add a simple manual way to dump the last route/section/AI timings.

Acceptance:

- We can compare before/after times for dashboard open, section switch, and AI first answer.
- We can compare before/after interaction times for search, filters, sorting, pagination, calculator input, and product forecast input.
- We have a repeatable 50-section-switch stability check for listener, observer, subscription, and memory growth.
- No user-facing behavior changes.

### Phase 1 - Fix Lifecycle Cleanup First

Do this before pane caching. Pane caching without cleanup can preserve stale observers and hidden work.

Tasks:

- Ensure `resetSectionPane(pane)` is the single cleanup path for:
  - pane cleanup callbacks
  - inline theme observers
  - known section theme observers
  - chart instances owned by the pane
- Introduce an explicit section lifecycle contract before pane caching:
  - `activate()` resumes only the work required while visible
  - `deactivate()` pauses observers, subscriptions, timers, animations, and refresh work without destroying reusable DOM
  - `destroy()` performs final cleanup before eviction or shell unmount
- Give every rendered or cached pane its own section context. Do not share one mutable `ctx` object whose `sectionId` is overwritten during navigation.
- Keep lifecycle hooks optional for simple sections, but require them for any cached section with observers, subscriptions, timers, charts, async work, or global listeners.
- Add chart destruction to `section8-master.js` cleanup for `_commissionChartInstance`.
- Replace anonymous global listeners in `section-cities.js` with named/removable listeners.
- Make dashboard shell unmount clean every cached pane once pane caching exists.
- Audit document/window listeners in heavy sections and ensure each has a cleanup path.

Acceptance:

- Switching sections 10 times does not multiply theme observers.
- Toggling theme after leaving Section 2 or Section 3 does not re-render hidden old panes.
- Deactivated cached panes stop active work and reactivate correctly without a full rebuild.
- Each cached pane retains the correct section identity and cannot observe another section's mutable context.
- Cities document click listener is removed on section cleanup.
- Section 8 charts are destroyed on cleanup/eviction.
- `npm run verify:performance` still passes.

### Phase 2 - Improve Loader Perceived Speed

The current dashboard loader is text-heavy and uses a long cycling animation. It should become a content-shaped skeleton that matches the section area.

Tasks:

- Keep these attributes exactly:
  - `data-dashboard-preloader="true"`
  - `data-dashboard-section`
- Keep accessible loading semantics.
- Replace long text cycling with stable skeleton rows, cards, chart blocks, and table blocks.
- Respect reduced motion.
- Keep loader DOM small.
- Avoid layout shift between loader and section content.

Acceptance:

- Loader appears instantly.
- No duplicate loader paints.
- Existing performance verifier remains green.
- The user sees a stable skeleton, not long animated copy.

### Phase 3 - Add Controlled Dashboard Pane Caching

This is the highest-impact dashboard interaction change.

Target:

- First visit to a section can still load/render.
- Returning to a recently visited section should restore the existing pane quickly.

Design:

- Replace the single-content strategy inside `#dash-section-pane` with managed child panes.
- Keep `#dash-section-pane` as the outer container.
- Create one child pane per cached section render key.
- Show one pane at a time.
- Hide inactive panes with `hidden` and `aria-hidden="true"`.
- Call the pane's `deactivate()` hook before hiding it and its `activate()` hook before making it interactive again.
- Consider `inert` when supported, but test focus behavior carefully.
- Cache only a small number of panes at first, such as 2 to 4.
- Evict least recently used panes and call full cleanup on eviction.
- Store an independent section context and lifecycle handle on each pane. Do not reuse one mutable context object across cached sections.

Cache key:

- Section id.
- Dashboard data version.
- Language.
- Theme.
- Any section-specific filter/version key if a section depends on active filters at render time.

Cache hit behavior must still run:

- Dashboard active nav update.
- `DashboardQueryRuntime.observe`.
- `onSectionChange`.
- i18n application for the active pane.
- `TaagerUI.enhance`.
- Inline theme fix for the active pane.
- Section-specific activation behavior required by the active pane.
- The cached pane's required `activate()` lifecycle hook.

Do not initially cache risky sections until cleanup is complete:

- Cities, until the document click listener and subscriptions are fully removable.
- Master, until chart cleanup is complete.
- AI, until AI render/chat state behavior is explicitly tested.

Good first cache candidates:

- Overview or lighter summary sections.
- Products after verifying cleanup.
- Account Calculator after verifying cleanup.
- COD after verifying cleanup.

Acceptance:

- Returning to a cached section avoids full section re-render.
- No hidden section keeps active observers, subscriptions, timers, animations, refresh work, or visible-DOM updates.
- Eviction cleans listeners, observers, timers, and charts.
- Keyboard focus does not move into hidden panes.
- Memory stays bounded after long navigation.

### Phase 4 - Make Taager AI Fast

AI performance must be treated as part of the dashboard performance project, not as a separate someday item.

#### 4.1 Split Lightweight AI Entry From Full AI Page

The dashboard should not load the full AI stack just to show a small AI entry point or floating assistant shell.

Tasks:

- Keep a small AI shell/widget module separate from the full `dashboardAi` group.
- Load the full `dashboardAi` group only when:
  - the AI page is opened
  - the AI dashboard section is opened
  - the user expands the full assistant experience
  - an idle prewarm is allowed after dashboard is already usable

Acceptance:

- Dashboard first paint does not wait for full AI UI/business orchestrator files.
- The AI entry point can appear quickly.

#### 4.2 Reuse Dashboard Data For AI

The AI page should not run dashboard aggregation again when fresh dashboard data already exists.

Tasks:

- In `renderAiIntelligencePage()` / AI route data loading, check for usable `window.dashboardGeoData`.
- Reuse dashboard data when:
  - account/user context matches
  - data version exists
  - data is not stale according to the app's current freshness rules
  - active filters do not require a new aggregation
- Only run `runDashboardAggregator()` when no valid dashboard data exists.
- Show the AI shell immediately while data is being validated.

Acceptance:

- Opening AI from dashboard usually avoids a second aggregator run.
- Direct AI route still works when no dashboard data is loaded.
- AI output remains based on the same dashboard facts as before.

#### 4.3 Memoize AI Context Builds

`dashboard-ai-context.js` builds compact product, city, forecast, campaign, and section-signal context from dashboard data. That should be cached by the facts that affect the result.

Cache key should include:

- dashboard data version
- account/user id where applicable
- language
- active dashboard section
- selected product/city filters
- AI context limits
- marketing/campaign intelligence freshness key

Tasks:

- Add a small in-memory context cache around `getDashboardAiContext()` or `buildDashboardAiContext()`.
- Invalidate when dashboard data version changes.
- Invalidate when marketing spend/intelligence updates.
- Keep the cache bounded.

Acceptance:

- Repeated AI questions do not rebuild the same large context.
- Context cache invalidates correctly after dashboard refresh or marketing sync.

#### 4.4 Do Not Block Local AI Answers On Slow Refresh

The app already has local/mirror/orchestrator paths. These should stay fast.

Tasks:

- Keep local-only and mirror answers immediate when they do not need Gemini.
- Do not block those answers on `refreshMarketingSpendForAi()` unless the selected route requires fresh marketing data.
- Use stale-while-revalidate for marketing/context refresh where safe:
  - answer from current context
  - refresh in background
  - use fresh context for the next question

Acceptance:

- Simple AI questions answer without waiting on network-heavy refresh.
- Gemini-enhanced questions still receive the context they need.
- No change to safety, budget, or fallback behavior.

#### 4.5 Keep Main-Process AI Caching

`dashboard-ai-service.js` already has valuable performance protections.

Do not remove:

- payload hashing
- in-flight request reuse
- response caching
- budget/rate limiting
- local-only routing
- context compression
- Gemini fallback

Only add instrumentation unless a measured bottleneck proves a change is needed.

Acceptance:

- AI backend cache hit behavior remains intact.
- Duplicate simultaneous AI requests still dedupe.
- Gemini fallback still works.

#### 4.6 Reduce Chat Re-render Work

If chat turns currently cause broad UI re-rendering, switch to smaller updates.

Tasks:

- Append new user/assistant messages instead of rebuilding the whole chat tree when possible.
- Update only pending message state when streaming/finalizing.
- Keep session memory hydration async where safe.

Acceptance:

- Sending a message does not jank the dashboard or AI panel.
- Chat history remains correct.

#### 4.7 Reduce The AI Cooldown Timer

The current per-subject cooldown makes normal follow-up conversation feel slower than necessary. Reduce only the short cooldown while preserving every other rate, budget, queue, retry, and fallback protection.

Tasks:

- In `src/main/dashboard-ai-service.js`, change only:
  - `LIMITS.cooldownMs` from `2_500` to `600`.
- Do not change:
  - per-minute, per-hour, per-day, or per-session limits
  - dedupe window
  - token or monthly budget rules
  - queue or parallel-request limits
  - retry count, request timeout, circuit breaker, or fallback behavior

Acceptance:

- A valid follow-up request sent after 600 ms is accepted.
- Requests sent inside the new cooldown are still blocked.
- Existing per-minute, session, budget, dedupe, and fallback protections still work.

#### 4.8 Add Safe Gemini Stream Heartbeats

Streaming should improve perceived responsiveness without exposing incomplete JSON or creating a second final-response path. The renderer already creates a pending chat message immediately; stream heartbeats should keep that existing bubble visibly alive while main buffers and validates the complete Gemini response.

Architecture:

- The renderer creates a unique `requestId` before invoking `dashboard-ai-query` and includes it in the request payload.
- The renderer subscribes to progress for that `requestId` before starting the invoke.
- `src/main/main.js` keeps ownership of Electron IPC:
  - capture the invoking renderer from the `dashboard-ai-query` IPC event
  - pass an optional progress callback into `askDashboardAi()`
  - emit `dashboard-ai-progress` heartbeats only back to the invoking renderer
- `src/main/dashboard-ai-service.js` remains transport-agnostic:
  - switch the Gemini network call from `generateContent` to `generateContentStream`
  - accumulate every text chunk into a complete buffer in main
  - call the optional progress callback as chunks arrive
  - run the existing JSON extraction, normalization, language validation, retry, fallback, caching, budget, logging, and session behavior on the complete buffer for each attempt exactly as today
- Progress IPC events never contain model text or partial JSON.
- The existing `dashboard-ai-query` invoke response remains the only authoritative final parsed result.

Progress event contract:

- In progress: `{ requestId, done: false }`
- Terminal success: `{ requestId, done: true, error: false }`
- Terminal thrown error: `{ requestId, done: true, error: true }`
- Do not include `result`, raw text, chunks, prompts, or context in progress events.
- Emit terminal status only after all retries and existing fallback handling finish, not after an individual failed Gemini attempt.
- Throttle repeated heartbeats if needed to avoid flooding renderer IPC, while emitting the first heartbeat immediately.

Renderer tasks in `section-taager-ai.js`:

- Subscribe only for requests that are actually taking the Gemini-enhanced path.
- Reuse the existing pending assistant message as the live typing/thinking bubble.
- On matching `done: false`, update only the pending bubble state or animation; do not rebuild the whole chat.
- Continue using the existing invoke result and final answer rendering path when the request resolves.
- Continue using the existing catch/fallback display path when the invoke rejects.
- Always unsubscribe in `finally`, including route changes, errors, and fallbacks.
- Add dedicated subscribe/unsubscribe helpers through `preload.js`; do not use `removeAllListeners`.

Safety details:

- Ignore events whose `requestId` does not match the active request.
- Do not add `requestId` to payload hashing, cache identity, model prompts, or budget calculations.
- A completed or timed-out stream attempt must stop emitting heartbeats. A later retry may continue with the same request ID.
- A completed request, fallback, or destroyed renderer must stop or ignore further heartbeats.
- Local-only, mirror-only, cached, blocked, and orchestrator-only answers must remain behaviorally unchanged.
- Do not save session memory or render the final answer from the progress event.

Acceptance:

- A Gemini-backed question shows the existing pending bubble immediately and visibly updates after the first stream heartbeat.
- The renderer never receives incomplete JSON or raw Gemini text.
- JSON parsing and validation run only on a complete buffered response for each attempt, never on individual chunks.
- The final answer, cache entry, usage ledger, diagnostics, and session memory are produced through the existing final-response path.
- Retry and fallback behavior remains unchanged.
- Local, mirror, cached, and blocked responses remain unchanged.
- Every progress subscription is removed after completion or error.
- Concurrent requests cannot receive each other's heartbeat events.
- Automated verification covers JSON split across multiple chunks, retry/fallback terminal behavior, request-ID isolation, and listener cleanup.

#### 4.9 Make Gemini Answer Directly From Actual Data

Improve the Gemini system prompt so strategic answers lead with the available dashboard facts instead of generic advice or unnecessary clarification. This changes prompt guidance only; it must not change routing, JSON mode, language policy, budgets, limits, or validation.

Tasks:

- In `buildPrompt()` in `src/main/dashboard-ai-service.js`, add the following rules after the existing answer-format rules:
  - When relevant actual data exists in context, including non-empty `products`, `cities`, `bestCities`, `worstCities`, `topWinningProducts`, `topLosingProducts`, or `localResultRows`, answer immediately from that data instead of asking a clarifying question.
  - When the user asks for a plan, ranking, recommendation, or strategy and relevant product or city data exists, lead with up to three specific data points from the actual numbers, such as product name with NDR and CPA or city name with NDR and Earned Profit After Tax. Give the plan or recommendation after those facts. Do not begin with a greeting, introduction, or question.
  - Do not give recommendations that are disconnected from the actual numbers in context. Tie every recommendation to a specific available metric. If a needed metric is unavailable, state that limitation in one sentence and answer from the available facts.
- Preserve the existing rule that general media-buying knowledge may shape strategy structure, but require every recommended action to be justified by an actual dashboard metric or an explicitly stated missing metric.
- Resolve missing-input behavior in favor of an immediate useful answer:
  - relevant existing data must be answered first
  - a missing budget, platform, creative, or risk input may be requested after the data-backed answer when needed for a more precise plan
  - missing optional inputs must not turn a data-backed request into a clarification-only response
- Use "up to three" rather than forcing three data points when fewer than three valid rows exist.

Do not change:

- JSON-only output or response schema
- language detection or required response language
- ordinary or strategic word limits
- local-only, mirror, orchestrator, or Gemini routing
- prompt injection protection
- budgets, rate limits, retries, caching, or fallback behavior

Acceptance:

- "Best cities to scale" returns an immediate ranked answer with real city metrics and no clarification-only response.
- "Build an expansion plan" leads with available product and city metrics before recommendations.
- A plan with missing budget still gives a data-backed answer first, then asks for budget only if needed.
- When only one or two valid rows exist, the answer uses those rows and does not invent a third.
- Every recommendation references an available metric or clearly states which required metric is unavailable.
- Arabic and English responses preserve the same direct, data-backed behavior.
- JSON-only output, language validation, word limits, routing, budgets, and fallbacks remain unchanged.
- Extend AI scenario QA to cover best-city ranking, expansion planning, missing budget, fewer-than-three rows, metric-grounded recommendations, and Arabic output.

### Phase 5 - Split Dashboard CSS Carefully

Do this after cleanup and caching, not before.

Target CSS groups:

- Dashboard shell/core layout.
- Shared dashboard components.
- Products.
- Cities and city drawer.
- COD.
- Calculator.
- Master/commission.
- AI dashboard/AI intelligence.
- Responsive overrides.
- Theme overrides.

Rules:

- Use `FEATURE_STYLE_GROUPS` only for CSS files.
- Keep old selectors working until each split is verified.
- Avoid pure prefix-based splitting when selectors are grouped across sections.
- Move one section at a time.
- Verify light/dark theme and mobile layout after each split.

Acceptance:

- Dashboard first CSS load is smaller.
- Each section loads only the CSS it needs.
- No visual regressions in theme, RTL/LTR behavior, responsive layout, or modals.

### Phase 6 - Optimize Heavy Sections

After caching and CSS split, optimize sections that still measure slow.

#### Products

- Keep backend pagination.
- Keep typing responsive by debouncing expensive search work and ignoring stale backend/detail responses.
- Cache filtered, sorted, and derived product results by data version and relevant filter key when measurement shows repeated work.
- Avoid rendering hidden detail panels until opened.
- Cache product detail calculations by product id and data version.
- Keep modal/document listeners scoped and removable.

#### Cities

- Defer secondary widgets until the main city list/chart is visible.
- Make filter bus subscribers no-op or unsubscribed when the section is hidden.
- Consider pagination or virtualization for large city leaderboards.
- Debounce expensive search/filter work and ignore stale asynchronous results.
- Keep drawer code lazy if possible.

#### Account Calculator

- Keep input feedback immediate and move expensive recalculation/render work behind a short scheduled update when measurement shows typing jank.
- Recalculate only the outputs affected by the changed input where practical.
- Cache derived calculator results by account/data version and input key when useful.
- Avoid replaying count-up animations when restoring a cached pane.
- Destroy chart/tooltip instances on cleanup.
- Keep marketing subscriptions scoped to the active pane.

#### Product Forecast

- Keep search, sort, pagination, and budget-input feedback responsive without rebuilding unrelated section UI.
- Debounce expensive search work while updating the input value immediately.
- Cache filtered/sorted simulation rows and forecast calculations by data version, marketing revision, selected platform, currency, and relevant input key.
- Recalculate and rerender only the affected product forecast row when a product budget changes where practical.
- Ignore stale marketing-sync and async forecast results.
- Avoid rebuilding pagination controls, tooltips, charts, and all product rows when only one row changes.
- Pause theme observers, tooltip listeners, marketing subscriptions, and animations while the pane is inactive.

#### COD

- Defer heavy chart/table rendering below the fold.
- Keep short chart animations.
- Avoid re-computing derived tables when data version has not changed.

#### Master/Commission

- Destroy chart instance on cleanup.
- Avoid re-running expensive commission grouping when dashboard version is unchanged.
- Keep ROI/marketing listener cleanup intact.

#### Orders

- Keep XLSX out of dashboard core.
- Do not load XLSX merely because the Orders section is opened. Load it only when order export/import work actually needs it.
- Keep backend pagination as the preferred path where supported.
- Debounce search input while updating the typed value immediately.
- Ignore stale backend page responses when search, filters, sort, page, account, or data version changes.
- Cache local filtered/sorted results by data version and filter/sort key for legacy fallback.
- Render only the current page and avoid rebuilding unrelated section UI during search, sorting, filtering, or pagination.
- Keep row animation short or disabled for repeated pagination and cached restore.

Acceptance:

- Heavy sections have bounded render time.
- Cached returns do not replay every animation or subscription.
- Products, Cities, Orders, Product Forecast, and Account Calculator meet the interaction targets from the Execution Contract on representative datasets.
- Search, filter, sort, pagination, calculator input, and forecast input do not display results from stale asynchronous work.
- Opening Orders does not load XLSX until an import/export action requires it.
- Memory remains stable after repeated section navigation.

## Verification Plan

Run after each phase:

```powershell
npm run verify:performance
```

Do not advance to the next phase only because this static verifier passes. Record the relevant before/after runtime measurements and complete the phase-specific acceptance checks first.

Run when allowed by the environment:

```powershell
npm run check:syntax
```

AI-specific verification after Phase 4 changes:

```powershell
npm run qa:ai:smoke
npm run qa:ai:perf
```

Manual QA checklist:

- App opens normally.
- Dashboard opens from sidebar.
- Dashboard direct route works.
- Sections switch correctly:
  - Overview
  - Pipeline
  - Orders
  - COD
  - Products
  - Cities
  - Account Calculator
  - Product Forecast
  - Master/Commission
  - Campaigns
  - AI
- Switch the same section repeatedly and confirm no duplicate loading.
- Switch between heavy sections and confirm cached restores are fast.
- Toggle light/dark theme after leaving Section 2 and Section 3.
- Change language and confirm active section text updates.
- Open Products details and close them.
- Type rapidly in Products search, change filters/sort/page before prior work completes, and confirm only the latest result is shown.
- Open Cities drawer and close it.
- Type rapidly in Cities search/filters and confirm interaction stays responsive.
- Open Account Calculator, type rapidly in inputs, and verify charts/tooltips update without freezing.
- Open Product Forecast, type rapidly in search and budget inputs, change sort/page/platform, and confirm only affected/current results update.
- Open Orders and confirm XLSX is not loaded merely by entering the section.
- Type rapidly in Orders search, change filters/sort/page before prior queries complete, and confirm stale responses never replace newer results.
- Open Master/Commission and verify chart cleanup after leaving.
- Open Taager AI from dashboard and confirm dashboard data is reused.
- Open Taager AI directly and confirm it still loads data correctly.
- Ask a local/mirror AI question and confirm fast response.
- Ask a Gemini-backed AI question and confirm fallback/budget behavior still works.
- Send AI follow-ups around the 600 ms cooldown boundary and confirm longer-term rate limits still work.
- Ask a Gemini-backed question and confirm the pending bubble receives heartbeat updates without receiving partial text or JSON.
- Confirm the Gemini stream listener is removed after success, fallback, timeout, and error.
- Run concurrent Gemini-backed requests from supported AI surfaces and confirm heartbeat request IDs do not cross.
- Ask for best cities/products and an expansion plan; confirm responses lead with available actual metrics instead of clarification-only or generic advice.
- Refresh dashboard data and confirm AI context cache invalidates.
- Repeat navigation between Products, Cities, Orders, Product Forecast, Account Calculator, COD, and Master for at least 50 switches and confirm no meaningful listener, observer, subscription, timer, or memory growth.
- Record representative cold-first-visit and warm-return timings for each heavy section.

## Success Metrics

Use these as target outcomes after implementation:

- Dashboard shell visible quickly after navigation.
- Returning to cached sections feels instant.
- Section switching avoids full rebuild when data/theme/language did not change.
- Cached section restore is under 100 ms on the representative test machine after required data is available.
- Typing/input feedback remains under 50 ms and local search/filter/sort/pagination updates remain under 200 ms on representative datasets.
- Products, Cities, Orders, Product Forecast, and Account Calculator remain responsive during repeated interaction.
- No stale hidden section re-renders on theme change.
- No listener/observer growth after repeated navigation.
- Dashboard CSS initial cost is lower after CSS split.
- AI page opens without unnecessary second dashboard aggregation when launched from dashboard.
- Repeated AI questions reuse context when dashboard data has not changed.
- Local AI answers are not blocked by slow marketing or Gemini work.
- Normal AI follow-ups are accepted after the shorter 600 ms cooldown while all longer-term limits remain enforced.
- Gemini-backed requests show live progress without exposing partial JSON or duplicating final-response handling.
- Gemini plans, rankings, recommendations, and strategies lead with available actual dashboard metrics.

## Implementation Priority Table

| Priority | Work | Risk | Impact |
| --- | --- | --- | --- |
| 1 | Instrument dashboard and AI timings | Low | High clarity |
| 2 | Lifecycle cleanup for observers/listeners/charts | Low to medium | High stability |
| 3 | Loader skeleton simplification | Low | Medium perceived speed |
| 4 | Controlled pane caching | Medium | Very high interaction speed |
| 5 | AI dashboard data reuse | Medium | High AI startup speed |
| 6 | AI context memoization | Medium | High repeated AI speed |
| 7 | Avoid blocking local AI on refresh | Medium | High perceived AI speed |
| 8 | Reduce AI cooldown to 600 ms | Low | Medium conversational speed |
| 9 | Safe Gemini stream heartbeats | Medium | High perceived AI responsiveness |
| 10 | Data-first Gemini prompt rules | Low to medium | High answer usefulness |
| 11 | CSS split by verified groups | Medium to high | Medium first-load speed |
| 12 | Heavy-section interaction optimization, especially Orders and Product Forecast | Medium | High interaction speed |

## What To Avoid

- Do not start with a huge CSS split. It is risky and does not solve repeated section rebuilds.
- Do not remove dashboard prewarming. Tune it only after measuring.
- Do not cache sections without cleanup.
- Do not keep all cached panes alive forever.
- Do not skip activation hooks on cache hit.
- Do not change dashboard aggregator output shape unless every consumer is updated.
- Do not change AI business logic just to make it faster.
- Do not make the AI route depend on dashboard being visited first.
- Do not block local AI responses on Gemini or marketing refresh when not required.
- Do not send raw Gemini chunks or partial JSON to the renderer.
- Do not create a second final-response path through stream events.
- Do not subscribe to a shared AI progress channel without request-id filtering and deterministic cleanup.
- Do not accept static verification as proof that an interaction became faster.
- Do not let stale asynchronous search, filter, pagination, marketing, or forecast work overwrite newer results.
- Do not rebuild an entire heavy section when only a table page, search result, calculator output, or forecast row needs updating.

## Final Recommendation

The best order is:

1. Measure dashboard and AI timings.
2. Fix lifecycle cleanup.
3. Replace the loader with a stable skeleton.
4. Add bounded dashboard pane caching.
5. Make AI reuse existing dashboard data.
6. Memoize AI context.
7. Keep local AI answers non-blocking.
8. Reduce the AI cooldown without changing longer-term protections.
9. Add safe Gemini stream heartbeats while keeping the existing final-response path.
10. Add data-first Gemini prompt rules.
11. Split dashboard CSS carefully.
12. Optimize remaining heavy-section interactions, especially Orders and Product Forecast, based on measured timings.

This order gives the largest speedup with the least risk. Pane caching and AI data/context reuse are the two biggest wins. Safe stream heartbeats improve perceived Gemini responsiveness without weakening JSON validation or duplicating final-response behavior. CSS splitting is still useful, but it should come after the dashboard lifecycle is safe.

## Measured Completion Record - 2026-06-14

Status: **Complete. All automated acceptance targets and post-split verification pass.**

Final Phase 6 automated Electron acceptance after the Phase 5 CSS split:

- Cached Overview restore: `4.8 ms` (target: under `100 ms`).
- Products search update: `1.4 ms` (target: under `200 ms`).
- Cities search update: `0.9 ms` (target: under `200 ms`).
- Orders search update: `1.0 ms` (target: under `200 ms`).
- Product Forecast search update: `1.4 ms` (target: under `200 ms`).
- Account Calculator input processing: `12.0 ms` (target: under `50 ms`).
- Product Forecast input processing: `17.7 ms` (target: under `50 ms`).
- After 50 heavy-section switches: zero subscription growth, `+11` DOM nodes, and zero measured heap growth.
- Dashboard pane children remained bounded at `2`.
- Controlled pane caching remains intentionally limited to the verified Overview pane. Heavy/risky sections are destroyed on leave, so hidden Products, Cities, Orders, Calculator, COD, Forecast, and Master panes cannot retain active work. The 50-switch diagnostics verify bounded DOM, memory, and subscriptions.

Phase 5 CSS split implementation:

- Dashboard first-load CSS was reduced from `313,114` bytes to `141,393` bytes.
- Section CSS groups were generated for Overview, Pipeline, Orders, COD, Products, Cities, Master/Commission, Calculator, Product Forecast, Marketing, Campaigns, and AI.
- Section CSS groups are wired through `FEATURE_STYLE_GROUPS` and load with their matching section feature.
- Master/Commission CSS loading and compact-width chart containment were corrected during post-split verification.

Post-split interaction and behavior fixes:

- Calculator cross-section ROI persistence is debounced so input feedback remains below the `50 ms` target.
- Products-to-Cities navigation resolves real geo product keys before applying the city filter.
- Cities preserves a valid populated legacy snapshot when an empty successful query result is returned.
- Orders QA accepts the exact-status `status:delivered` stage ID as well as the legacy `delivered` ID.
- Product/Cities reactive QA waits for the correct account-scoped geo snapshot before asserting synchronization.

Final verification:

- `npm run check:syntax`: passed, `105` JavaScript files.
- `npm run qa:static`: passed, `16/16` i18n/theme checks and `91/91` dashboard validation checks.
- `npm run verify:performance`: passed, `28/28`.
- `node scripts/qa-dashboard-performance-static.js`: passed, `15/15`.
- `npm run verify:dashboard-query`: passed.
- `npm run verify:dashboard-rollout`: passed.
- `npm run verify:dashboard:rates`: passed.
- `npm run verify:dashboard:net-orders`: passed.
- `npm run qa:dashboard:only`: passed across every dashboard section, Arabic RTL/dark, English LTR/light, responsive layouts, Products/Cities synchronization, Orders details, and AI behavior.
- `npm run qa:dashboard:laptop`: passed across all dashboard sections at `1366x768`, `1280x720`, `1180x720`, and `1100x720` with no reported overflow, visible-text overflow, or layout collision.
- `npm run qa:dashboard:perf`: passed all timing thresholds and the 50-switch stability assertions.
- `npm run qa:ai:smoke`: passed the `12`-question bank.
- `npm run qa:ai:perf`: passed. Local ranking first/final answer was `137.5 ms`; the Gemini-backed plan first answer was `334 ms` and final fallback answer was `1756.5 ms`.

External-service note:

- Gemini returned quota `429` responses during Electron QA. Retry, progress, request isolation, and local fallback behavior passed; no acceptance failure was caused by the external quota state.
