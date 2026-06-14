"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log("[PASS] " + label);
  } else {
    failed += 1;
    console.error("[FAIL] " + label);
  }
}

const app = read("src/renderer/app.js");
const dashboard = read("src/renderer/pages/dashboard/dashboard.js");
const shell = read("src/renderer/pages/dashboard/dashboard-shell.js");
const aggregator = read("src/renderer/pages/dashboard/dashboard-aggregator.js");
const products = read("src/renderer/pages/dashboard/sections/section5-products.js");
const campaigns = read("src/renderer/pages/dashboard/sections/section-campaigns.js");
const marketing = read("src/renderer/pages/dashboard/dashboard-filter-bus.js");
const queryRuntime = read("src/renderer/pages/dashboard/dashboard-query-runtime.js");
const campaignQueryCore = read("src/renderer/pages/dashboard/dashboard-campaign-query-core.js");
const queryService = read("src/main/dashboard-query-service.js");
const main = read("src/main/main.js");
const preload = read("src/main/preload.js");
const marketingSection = read("src/renderer/pages/dashboard/sections/section-marketing-connections.js");
const ordersSection = read("src/renderer/pages/dashboard/sections/section3-orders.js");
const marketingBackend = read("supabase/functions/windsor-marketing/index.ts");

const dashboardCore = app.match(/\n\s*dashboard:\s*\[([\s\S]*?)\n\s*\],\n\s*[a-zA-Z]/);
check("dashboard core excludes XLSX and AI engine", !!dashboardCore &&
  !dashboardCore[1].includes("xlsx.full.min.js") &&
  !dashboardCore[1].includes("business-orchestrator.js"));
const dashboardOrders = app.match(/dashboardOrders:\s*\[([\s\S]*?)\],\n\s*dashboardOrdersExport:/);
const dashboardOrdersExport = app.match(/dashboardOrdersExport:\s*\[([\s\S]*?)\],/);
check("orders load XLSX only when export is requested", !!dashboardOrders &&
  !dashboardOrders[1].includes("xlsx.full.min.js") &&
  !!dashboardOrdersExport &&
  dashboardOrdersExport[1].includes("xlsx.full.min.js") &&
  ordersSection.includes("ensureFeatureScripts('dashboardOrdersExport')"));
check("dashboard sections load on demand", app.includes("window.ensureDashboardSection") && shell.includes("window.ensureDashboardSection(sectionId)"));
check("dashboard section routing avoids duplicate loader paints",
  shell.includes("function showSectionLoader(pane, sectionId)") &&
  shell.includes("current.getAttribute('data-dashboard-section') === sectionId") &&
  shell.includes("if (!data || !data._loaded || data._loading) {\n      showSectionLoader(pane, sectionId);\n      return;\n    }") &&
  !shell.includes("pane._dashboardRenderKey = null;\n    pane.innerHTML = loaderHTML(sectionId);\n\n    var render = function"));
check("feature resources preload in parallel before ordered execution", app.includes("scripts.forEach(preloadScriptResource)"));
check("warm dashboard activation skips rerender", app.includes('if (dashboardState.mounted)') && app.includes('if (!dashboardState.invalid)'));
check("dashboard render resolves when usable data is shown", dashboard.includes("return initialReady") && dashboard.includes("readyResolve(dashData)"));
check("aggregator cache lasts until explicit invalidation", aggregator.includes("Number.MAX_SAFE_INTEGER") && aggregator.includes("TaagerPageLifecycle.invalidate"));
check("products render synchronously with final values and no startup spinner",
  !products.includes("}, 24);") &&
  !products.includes("s5Spin") &&
  !products.includes("function _animateNumber") &&
  products.includes("initialPageProducts"));
check("campaigns fill tables synchronously after shell mount",
  !campaigns.includes('window.requestAnimationFrame(function () {') &&
  campaigns.includes("updateCampaignsUIOnly(mount, data, ctx, state, activeIntel()"));
check("products cache exact render inputs and delegate root interactions",
  products.includes("marketingSyncStamp") &&
  products.includes("selectedCurrency()") &&
  products.includes("_s5DelegatedBound") &&
  products.includes("const list = currentList();"));
check("campaigns delegate filters, sorting, and pagination from the section root",
  campaigns.includes("_campaignDelegatedBound") &&
  campaigns.includes('mount.addEventListener("click"') &&
  campaigns.includes('mount.addEventListener("input"') &&
  campaigns.includes('mount.addEventListener("change"'));
check("products share campaign assignment results", products.includes("_dashboardProductCampaignAssignments"));
check("campaign intelligence survives remounts", campaigns.includes("campaignIntelCache") && campaigns.includes("rememberCampaignIntel"));
check("marketing status loads are deduplicated and cached", marketing.includes("_marketingLoadRequests") && marketing.includes("MARKETING_STATUS_TTL"));
check("paginated dashboard query service is exposed through IPC",
  queryService.includes("createDashboardQueryService") &&
  main.includes('ipcMain.handle("query-dashboard-data"') &&
  preload.includes("queryDashboardData"));
check("query rollout is independently feature flagged with legacy fallback",
  main.includes("TAAGER_DASHBOARD_QUERY_ORDERS") &&
  main.includes("TAAGER_DASHBOARD_QUERY_PRODUCTS") &&
  main.includes("TAAGER_DASHBOARD_QUERY_CAMPAIGNS") &&
  queryRuntime.includes("shadow"));
check("products use backend pagination with lazy batched details and legacy fallback",
  products.includes("requestBackendProductPage") &&
  products.includes("loadBackendProductDetails") &&
  products.includes("productOptionSource") &&
  products.includes("backendProductsActive ? backendProductsRows : applyFilters()") &&
  products.includes("backend query failed; using legacy data"));
check("products shadow mode compares KPIs and rankings",
  queryRuntime.includes("compareProductShadow") &&
  queryRuntime.includes("rollout mismatch") &&
  queryRuntime.includes("topRanking"));
check("campaigns use backend dual pagination, lazy AI context, and legacy fallback",
  queryService.includes("campaignOverview") &&
  queryService.includes("campaignAiContext") &&
  campaigns.includes("requestBackendCampaigns") &&
  campaigns.includes("campaign-ai-context") &&
  campaigns.includes("backend query failed; using legacy data"));
check("campaign intelligence core is shared by renderer and main process",
  app.includes("dashboard-campaign-query-core.js") &&
  queryService.includes("dashboard-campaign-query-core") &&
  campaignQueryCore.includes("buildCampaignIntelligence"));
check("campaigns shadow mode compares complete KPI totals",
  queryRuntime.includes("compareCampaignShadow") &&
  queryRuntime.includes("objectiveMix") &&
  queryRuntime.includes("decisionCounts"));
check("rollout verifier covers manual gates and structured comparison",
  read("package.json").includes("verify:dashboard-rollout") &&
  fs.existsSync(path.join(root, "scripts", "verify-dashboard-rollout.js")) &&
  read("scripts/verify-dashboard-rollout.js").includes("moneyMinor") &&
  read("scripts/verify-dashboard-rollout.js").includes("TAAGER_DASHBOARD_QUERY_SHADOW"));
check("marketing changes invalidate dashboard query caches",
  main.includes("marketingRevision") &&
  main.includes("bumpDashboardMarketingRevision"));
check("marketing status primes only for relevant sections",
  dashboard.includes("sectionNeedsMarketing") &&
  dashboard.includes("onSectionChange"));
check("marketing status is stale-while-revalidate with bounded connection polling",
  marketing.includes("15 * 60 * 1000") &&
  marketing.includes("revalidate: true") &&
  marketingSection.includes("AUTO_REFRESH_DELAYS_MS"));
check("marketing incremental sync is feature flagged with legacy fallback",
  main.includes("TAAGER_MARKETING_INCREMENTAL_SYNC") &&
  marketingBackend.includes("syncDashboardAccountIncremental") &&
  marketingBackend.includes("syncDashboardAccountLegacy"));
check("marketing incremental cache stores raw daily data and returns diagnostics",
  marketingBackend.includes("marketing_daily_metrics") &&
  marketingBackend.includes("providerRequestCount") &&
  marketingBackend.includes("reusedDays"));

console.log(`\nPerformance architecture verification: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
