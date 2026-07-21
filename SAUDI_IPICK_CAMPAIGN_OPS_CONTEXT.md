# Saudi iPick Campaign Ops Context

This document captures the product direction, reference audits, and implementation brief for the Saudi iPick website Campaign Ops infrastructure.

It is meant to be used by another Codex workspace working inside `F:\code\saudipick`, so it does not need the full chat history.

## Current Product Direction

Saudi iPick is becoming a SaaS marketing automation platform.

The website already has:

- Snapchat OAuth/account connection.
- Selected Snapchat ad accounts.
- Live campaign/spend fetching.
- Desktop app token bridge for the Electron dashboard.

Do not remove existing Snapchat connection/account functionality.

The Electron app work is separate. It currently uses Saudi iPick website as a native marketing provider beside Windsor. The website remains the source of platform OAuth, tokens, selected ad accounts, API calls, and later campaign creation/automation.

## What We Are Building Now

We are not building the full campaign creator yet.

We are building the website UI infrastructure for Campaign Ops:

- grouped sidebar sections
- reusable search bar
- reusable dropdown/select
- reusable sortable data table
- new Overview page focused on active campaigns
- Strategies shell page
- Actions catalog page
- Metrics catalog page

Rules builder is later.
Campaign creation wizard is later.
Creative library is later.
Product/SKU library is later.

## Important Product Correction

Do not turn this into a Taager-specific app.

Saudi iPick is SaaS. It should not assume access to Taager products, merchants, EasyOrders, Dukan, SKU inventory, provider product data, or internal Taager entities.

Later, Saudi iPick may connect to EasyOrders or other stores, but not now.

For now, the core product is:

- connect ad platforms
- show active campaigns
- prepare automation brain infrastructure
- later create campaigns through official APIs
- later attach strategies/rules/actions to campaigns, ad groups, ads, and SKU/group tags

## Competitor Reference: autonomous.taager.com

We inspected `https://autonomous.taager.com/`.

Useful routes:

- `/lifecycle/offerings`
- `/strategies`
- `/actions`
- `/context`
- `/advertisers`
- `/stores`
- `/merchants`
- `/agencies`
- `/settings`

We only want to borrow good concepts, not their Taager-specific domain.

### Sidebar Pattern

The competitor sidebar has:

- brand header
- main/product item
- grouped labels
- `ENGINE`
  - Strategies
  - Actions
  - Metrics
- `CONNECTIONS`
  - Merchants
  - Ads Platforms
  - Stores
- `ADMIN`
  - Agencies
  - Settings
- bottom controls
  - theme/view switch
  - collapse
  - account selector
  - user card
  - logout

For Saudi iPick, use this pattern but adapt the sections.

Recommended Saudi iPick sidebar:

```text
CAMPAIGNS
- Overview
- Campaign Builder

ENGINE
- Strategies
- Actions
- Metrics

LIBRARY
- Creative Library
- SKU Library later

CONNECTIONS
- Ad Accounts / Connected Accounts
- Desktop App / API Tokens

ADMIN
- Billing
- Settings
```

If a route does not exist yet, use a placeholder or omit it, but keep the grouping structure clean.

### Products / Offerings Page

Competitor page shows Taager products and launch buttons:

- product SKU
- stock status
- Arabic product name
- expected BEP
- spend
- conversions
- CPA
- launch action

This is Taager-specific. Do not build this now.

Saudi iPick may later have product/SKU features, but those will be user-provided or pulled from store integrations like EasyOrders.

### Launch Flow

Competitor campaign launch is a 6-step wizard:

```text
Product -> Strategy -> Platform -> Configure -> Creatives -> Review
```

This is useful as a concept, but Saudi iPick should use a different flow later:

```text
Platform -> Campaign -> Ad Group / Ad Set -> Ads / Creatives -> Review
```

Platform comes first because each platform has different fields.

Examples:

- TikTok: headline/text restrictions, no emojis, identity/spark settings, CTA, landing URL.
- Meta: primary text, headline, description, CTA, page, destination.
- Snapchat: brand name, headline, website URL, CTA, creative type.

### Strategies Page

Competitor strategies page shows:

- strategy name
- version
- live/draft status
- schedule/cadence
- stages/phases
- rules count
- open in builder

Examples observed:

- `amr_snapchat` v37, every 30 minutes
- `amr_tiktok` v14, hourly
- `rawy_snap` v18, every 15 minutes
- `snapchat_testing` v10, hourly

Useful concept:

- strategy is a package/governor
- it has cadence
- it has status
- it has platform context
- it can be attached to campaigns later

For now, Saudi iPick Strategies page should be a shell/list only.

No complex rules builder yet.

### Strategy Builder Details

Competitor strategy builder has:

- strategy version, for example `v37 draft`
- cadence, for example every 30 minutes
- entity counts
  - campaign
  - ad group
  - ad
- phases
  - `TESTING`
  - `SCALING`
  - `TERMINATED`
- ordered rules inside phases

Example rules observed:

```text
cost_per_conversion >= bep * 3.0
spend >= bep * 3.0 && conversions == 0
spend >= 0.3 * budget && cost_per_conversion >= 2.0 * bep
```

Engine behavior observed:

```text
For each entity, on each tick:
1. identify entity current phase
2. evaluate rules for that phase in sort order
3. first matching rule fires its action
4. optional phase transition is applied
5. remaining rules are skipped
```

Do not build this rules engine now.

This is future direction only.

### Rule Editor Details

Competitor rule editor contains:

- rule key
- description
- applies to:
  - campaign
  - ad group
  - ad
  - offering
- trigger mode:
  - on every metrics update
  - at specific times
- visual condition builder
- custom CEL expression mode
- metric window
- action
- transition to phase
- phase constraint
- max trigger cap
- preview
- available variables/metrics list

Saudi iPick will make rules simpler later.

For now, do not build the rule editor.

### Actions Page

Competitor `/actions` page shows action primitives.

Observed actions:

- `clone`
- `duplicate_campaign` removed
- `enable`
- `kill`
- `notify`
- `replace`
- `scale_budget` deprecated
- `set_budget`

Observed action descriptions:

- `kill`: kind-aware kill. Routes to campaign, ad group, or ad status updates.
- `set_budget`: set budget by percentage or absolute amount.
- `clone`: clone source entity and register it with lifecycle engine.
- `replace`: clone fresh siblings and kill source entity.
- `notify`: send email overview of rule fire.

Saudi iPick Actions page should be a catalog/reference page for now.

Recommended Saudi iPick actions:

- `pause_campaign`
- `pause_ad_group`
- `pause_ad`
- `pause_by_sku`
- `set_budget`
- `duplicate_campaign`
- `duplicate_ad_group`
- `duplicate_ad`
- `notify`

Each action card should show:

- name
- status badge
- description
- parameter chips

Do not make these deeply editable now.

### Metrics Page

Competitor `/context` page shows typed metrics used by rule expressions.

Observed columns:

- field
- type
- campaign
- ad group
- ad
- description

Observed metrics:

- `add_payment_info`
- `add_to_cart`
- `bep`
- `budget`
- `clicks`
- `comments`
- `conversions`
- `cost_per_atc`
- `cost_per_conversion`
- `cost_per_lead`
- `cost_per_purchase`
- `cpc`
- `cpm`
- `ctr`
- `days_since_launch`
- `hours_since_launch`
- `impressions`
- `leads`
- `purchases`
- `purchase_value`
- `reach`
- `roas`
- `spend`
- video metrics

Saudi iPick Metrics page should be a searchable table.

Recommended columns:

- field
- type
- campaign
- ad group
- ad
- SKU
- description

Recommended metrics:

- `spend`
- `purchases`
- `purchase_value`
- `cpa`
- `roas`
- `clicks`
- `impressions`
- `ctr`
- `cpm`
- `cpc`
- `conversion_rate`
- `leads`
- `add_to_cart`
- `hours_since_launch`
- `days_since_launch`
- `sku_spend`

## Old Project Reference: F:\code\tiktok-camp-bot

An old Electron project existed at:

```text
F:\code\tiktok-camp-bot
```

It created campaigns through scraping/browser automation, not APIs.

Do not reuse scraping runners or selectors.

Useful source files inspected:

- `src/core/schema.js`
- `src/shared-core/payloadMappers.js`
- `src/shared-core/stepBuilder.js`
- `src/pages/builder/hooks/useBuilderValidation.js`
- `src/shared-core/naming/tiktokNaming.js`
- platform campaign step UI files

### What Is Useful From The Old Project

The old project has a useful campaign builder model:

```text
Campaign
  -> Ad Group / Ad Set
    -> Ad
```

It also has a useful inheritance model:

```text
campaign defaults -> ad group/ad set overrides -> ad fields
```

Useful concepts:

- campaign defaults as single source of truth
- ad groups inherit defaults
- ad groups override only when necessary
- budget mode:
  - CBO: budget on campaign
  - ABO: budget on ad group/ad set
- platform-specific ad fields
- platform-specific validation
- dry run / preview before execution
- flat execution plan before launch

### Useful Old Data Shape

Campaign:

```js
{
  id,
  name,
  objective,
  budgetType, // CBO or ABO
  budget,
  defaults,
  adGroups
}
```

Campaign defaults:

```js
{
  pixelName,
  pixelEvent,
  targeting,
  bidStrategy,
  budget,
  schedule,
  attribution,
  audienceTargeting,
  placement,
  fbPlacements,
  snapTargeting
}
```

Ad group:

```js
{
  id,
  bidCap,
  targeting,
  bidStrategy,
  budget,
  pixelName,
  pixelEvent,
  use_default_schedule,
  schedule,
  overrides,
  attributionOverride,
  audienceTargetingOverride,
  placementOverride,
  snapTargetingOverride,
  ads
}
```

Ad:

```js
{
  id,
  productLink,
  creativeType,
  creativeName,
  adTexts,
  ctas,
  sku,

  // TikTok
  tiktokAccount,

  // Meta
  fbPageName,
  fbAdType,
  fbMediaType,
  fbMediaUrl,
  fbPrimaryText,
  fbHeadline,
  fbDescription,
  fbCta,
  fbPostId,

  // Snapchat
  snapMode,
  snapMediaType,
  snapHeadline,
  snapBrandName,
  snapWebsiteUrl,
  snapCta
}
```

### Useful Validation Concepts

TikTok:

- product link required
- creative name required for video/image
- ad text required
- TikTok ad text cannot contain emojis
- TikTok ad text max length should be enforced
- duplicate ad text variations should be blocked

Meta:

- page required
- primary text required
- headline required
- destination URL required for created ads
- post ID required for existing post ads

Snapchat:

- creative name required
- headline required
- brand name required
- website URL required

Budget:

- CBO uses campaign budget
- ABO requires ad group/ad set budget
- bid cap should not exceed budget

### Useful API Mapping Concepts

The old project had payload mappers. They are not official enough to copy blindly, but the pattern is correct:

```text
normalized draft -> platform adapter -> platform API payload
```

Future Saudi iPick API campaign creation should use:

```text
Campaign Draft
  -> platform adapter validates fields
  -> platform adapter maps to API payloads
  -> creation job runs:
       create campaign
       create ad groups/ad sets
       upload/create creatives
       create ads
       publish or keep paused
  -> save platform IDs
  -> automation engine can manage them later
```

### What Not To Reuse From Old Project

Do not reuse:

- Playwright scraping runners
- Ads Manager DOM selectors
- login/browser automation
- TikTok UI copy buttons
- HTML inspection docs as implementation
- DOM duplication flows
- anything requiring TikTok/Facebook/Snapchat web UI scraping

Only reuse the mental model:

- builder data shape
- validation
- field hierarchy
- platform adapters
- preview/dry-run plan

## Saudi iPick Website UI Infrastructure To Implement Now

### 1. Sidebar Grouping

Split sidebar into grouped sections.

Suggested groups:

```text
CAMPAIGNS
- Overview
- Campaign Builder

ENGINE
- Strategies
- Actions
- Metrics

LIBRARY
- Creative Library

CONNECTIONS
- Connected Accounts / Ad Accounts
- Desktop App / API Tokens

ADMIN
- Billing
- Settings
```

Preserve existing working routes, especially Snapchat account connection pages.

### 2. Reusable SearchBar Component

Create a shared component:

```tsx
<SearchBar
  value={search}
  onChange={setSearch}
  placeholder="Search campaigns..."
  clearable
/>
```

Requirements:

- search icon
- clear button
- controlled value
- polished focus state
- reusable in Overview, Strategies, Actions, Metrics, Connected Accounts

### 3. Reusable Dropdown / Select Component

Create a shared dropdown/select component.

Use cases:

- platform filter
- status filter
- date range
- strategy selector
- account selector
- action selector

Requirements:

- label optional
- selected value
- option list
- disabled options
- optional icon/badge support if simple
- clean keyboard/focus behavior if possible
- no ugly browser default if app has custom UI conventions

### 4. Reusable DataTable Component

Create a shared table component.

Requirements:

- sortable headers
- ascending/descending state
- empty state
- loading state
- pagination-ready
- row actions slot or renderer
- status badge support
- no text clipping
- responsive enough for dashboard use

This component should be used for Metrics and Overview if possible.

### 5. New Overview Page

Replace the old Overview page.

The old overview summary-card/fake-zero behavior should go away.

New Overview should be Campaign Ops focused.

It should show:

- platform tabs:
  - All
  - Snapchat
  - TikTok
  - Meta
  - Google
- custom SearchBar
- status dropdown
- active campaigns table

Columns:

- campaign name
- platform
- ad account
- status
- spend
- purchases/leads
- CPA
- ROAS
- strategy
- last synced

Snapchat should use existing live campaign data if available.

TikTok/Meta/Google can show empty or planned states for now.

Do not show fake zero-first cards.

If no data exists, show a proper empty state.

### 6. Strategies Page

For now this is a shell/list only.

No rules builder yet.

Show:

- strategy name
- platform
- status
- cadence
- campaigns using it
- short description

Include:

- SearchBar
- platform filter dropdown
- empty state

Example strategy rows/cards:

- Conservative Testing
- Scale Winners
- SKU Protection
- Budget Guard

These may be placeholders if no real backend exists yet.

### 7. Actions Page

Build a clean action catalog.

Actions:

- `pause_campaign`
- `pause_ad_group`
- `pause_ad`
- `pause_by_sku`
- `set_budget`
- `duplicate_campaign`
- `duplicate_ad_group`
- `duplicate_ad`
- `notify`

Each action card:

- icon
- name
- status badge
- description
- parameter chips

Possible status values:

- available
- planned
- admin
- deprecated

This page is reference/admin-style for now.

### 8. Metrics Page

Build a metrics catalog table.

Include SearchBar.

Columns:

- field
- type
- campaign
- ad group
- ad
- SKU
- description

Metrics:

- `spend`
- `purchases`
- `purchase_value`
- `cpa`
- `roas`
- `clicks`
- `impressions`
- `ctr`
- `cpm`
- `cpc`
- `conversion_rate`
- `leads`
- `add_to_cart`
- `hours_since_launch`
- `days_since_launch`
- `sku_spend`

## Design Direction

Use a clean SaaS dashboard style.

Do not make a landing page.

Do not add marketing hero sections.

Do not use fake summary metrics.

Use empty states when data is missing.

Use icons where appropriate.

Use restrained, dense dashboard design:

- clear grouped sidebar
- clean filters
- readable tables
- good spacing
- subtle borders
- polished badges
- no nested cards inside cards

The app can borrow the competitor's structural idea, but Saudi iPick should feel cleaner, more modern, and less Taager-specific.

## Future Direction, Not For Current Implementation

Later we will build:

- campaign creation wizard
- creative upload/library
- SKU grouping
- strategy builder
- simpler reusable rules
- automation runner
- official API campaign creation for Snapchat first
- later TikTok and Meta

Future campaign creation wizard:

```text
Platform -> Campaign -> Ad Group / Ad Set -> Ads / Creatives -> Review
```

Future automation scopes:

- campaign
- ad group/ad set
- ad
- SKU/group tag
- creative
- platform account

Future actions:

- pause campaign
- pause ad group
- pause ad
- pause all by SKU
- increase/decrease budget
- duplicate campaign
- duplicate ad group
- duplicate ad
- notify

Future rule examples:

```text
If SKU spend > 3x BEP and purchases = 0, pause all campaigns/ad groups/ads for that SKU.
If CPA < target CPA and purchases >= 3, increase budget by 30%.
If CTR is low after 1000 impressions, pause ad.
If ROAS > target, duplicate campaign or ad group.
```

Do not build these now.

## Implementation Prompt For Website Workspace

Use this prompt inside a new Codex task opened at `F:\code\saudipick`:

```text
Implement Saudi iPick website UI infrastructure for Campaign Ops.

Context:
Saudi iPick is becoming a SaaS marketing automation platform. The website already has Snapchat OAuth/account connection and live campaign/spend fetching. Do not remove that. Windsor/Electron work is separate.

We inspected autonomous.taager.com as a reference. We only want to borrow good UI/product ideas:
- grouped sidebar sections
- Actions catalog
- Metrics/context catalog
- Strategies shell
- active campaigns overview

But we do NOT want Taager-specific product/merchant/provider logic. Do not build Products, Merchants, Stores, Agencies. Saudi iPick is SaaS, not Taager-specific.

Rules builder is later. Campaign creator is later. For now, only build UI infrastructure and shell pages.

Goal:
Build clean reusable UI foundations and new shell pages for:
- Overview
- Strategies
- Actions
- Metrics

Requirements:
1. Split sidebar into grouped sections:
   CAMPAIGNS
   - Overview
   - Campaign Builder or Campaigns if route exists

   ENGINE
   - Strategies
   - Actions
   - Metrics

   LIBRARY
   - Creative Library placeholder if no page exists

   CONNECTIONS
   - Connected Accounts / Ad Accounts
   - Desktop App / API Tokens if existing

   ADMIN
   - Billing
   - Settings

2. Create reusable components:
   - SearchBar: icon, clear button, placeholder, controlled value.
   - Dropdown/Select: reusable for filters, supports label, options, disabled options, selected value.
   - DataTable: sortable headers asc/desc, empty state, loading state, pagination-ready, row actions slot.

3. Replace old Overview with new Campaign Ops overview:
   - platform tabs: All, Snapchat, TikTok, Meta, Google
   - custom SearchBar to search campaign name/ad account
   - status dropdown
   - table of active campaigns
   - columns: campaign name, platform, ad account, status, spend, purchases/leads, CPA, ROAS, strategy, last synced
   - Snapchat should use existing live campaign data if available.
   - TikTok/Meta/Google can show empty/planned states for now.
   - No fake zero-first summary cards.

4. Actions page:
   - Show action catalog cards similar to autonomous.taager.com/actions but cleaner.
   - Actions: pause_campaign, pause_ad_group, pause_ad, pause_by_sku, set_budget, duplicate_campaign, duplicate_ad_group, duplicate_ad, notify.
   - Show status badge and parameter chips.

5. Metrics page:
   - Show metrics table similar to autonomous.taager.com/context but cleaner.
   - Include search bar.
   - Columns: field, type, campaign, ad group, ad, sku, description.
   - Metrics include spend, purchases, purchase_value, cpa, roas, clicks, impressions, ctr, cpm, cpc, conversion_rate, leads, add_to_cart, hours_since_launch, days_since_launch, sku_spend.

6. Strategies page:
   - Shell/list only for now.
   - No rules builder yet.
   - Show strategy cards/table with name, platform, status, cadence, campaigns using it, description.
   - Include search and platform filter.

UI:
- Clean SaaS dashboard, not landing page.
- Match existing Saudi iPick styling.
- Use lucide icons if available.
- Responsive and polished.
- No nested cards inside cards.
- Avoid fake metrics; use empty states if data is missing.

Validation:
- Run lint/build/typecheck if available.
- Fix broken routes/imports.
- Push changes to GitHub after successful validation.
```

