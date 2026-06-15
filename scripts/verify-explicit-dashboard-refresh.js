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
    console.log(`[PASS] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}`);
  }
}

const dashboard = read("src/renderer/pages/dashboard/dashboard.js");
const app = read("src/renderer/app.js");
const shell = read("src/renderer/pages/dashboard/dashboard-shell.js");
const runner = read("src/bot/runner.js");
const dashboardFetch = read("src/bot/dashboard-fetch.js");
const shared = read("src/bot/easy-orders-export.js");
const rateRefreshFn = (shell.match(/function refreshDashboardAfterRateChange\(shellEl, opts\) \{[\s\S]*?\n  \}/) || [""])[0];
const handlePeriodChangeFn = (dashboard.match(/function handlePeriodChange\(\) \{[\s\S]*?\n    \}/) || [""])[0];
const onAccountChangeFn = (dashboard.match(/onAccountChange: function \(accountId\) \{[\s\S]*?\n      \},/) || [""])[0];

check("dashboard opening only aggregates saved data", dashboard.includes("runAggregator(false)") && !dashboard.includes("syncMarketingSpend"));
check("period and account changes do not invoke the live dashboard update",
  handlePeriodChangeFn.includes("runAggregator(true);") &&
  onAccountChangeFn.includes("runAggregator(true);") &&
  !handlePeriodChangeFn.includes("_onRunForDashboard") &&
  !onAccountChangeFn.includes("_onRunForDashboard"));
check("dashboard rate refresh only re-runs saved-data aggregation",
  rateRefreshFn.includes("opts.onReportingCurrencyChange(window.dashboardActiveCurrency || 'SAR');") &&
  !rateRefreshFn.includes("onDashboardUpdate"));
check("static dashboard updates do not sync marketing", dashboard.includes("onStaticUpdateComplete: function () {\n        runAggregator(true);"));
check("explicit dashboard update carries the selected marketing scope", dashboard.includes("marketingAccountId: activeId || '__all__'"));
check("manual dashboard update refreshes connected marketing", app.includes("await marketingStore.sync(marketingAccountId, marketingPayload)"));
check("titlebar Sync reloads the app without triggering dashboard update",
  app.includes("function reloadApp()") &&
  app.includes("rememberSyncRestoreTarget();") &&
  app.includes("window.location.reload();") &&
  app.includes('addEventListener("click", reloadApp)') &&
  !app.includes("triggerDashboardSyncFromTitlebar") &&
  shell.includes("function triggerDashboardUpdate(shellEl, opts)") &&
  shell.includes("window.triggerDashboardUpdate = function ()"));
check("titlebar Sync restores the active dashboard section after reload",
  app.includes('const SYNC_RESTORE_KEY = "taager_sync_restore_target";') &&
  app.includes('activePage.id !== "page-dashboard"') &&
  app.includes("mount._dashboardActiveSection") &&
  app.includes("function restoreDashboardRouteAfterSync(hasAccounts)") &&
  app.includes("sessionStorage.removeItem(SYNC_RESTORE_KEY);") &&
  app.includes("window._dashboardInitialSection = SYNC_DASHBOARD_SECTIONS.has(target.section) ? target.section : \"master\";") &&
  app.includes("const restoredDashboard = restoreDashboardRouteAfterSync(hasAccounts);"));
check("manual dashboard update reports enrichment warnings", app.includes("enrichmentWarnings") && app.includes("EasyOrders enrichment unavailable"));
check("Run and dashboard workers use the shared EasyOrders exporter",
  runner.includes('require("./easy-orders-export")') &&
  runner.includes("async function phase1_easyOrdersLogin(page) {\n  return easyOrdersFlow.login(page);") &&
  runner.includes("easyOrdersFlow.exportReport") &&
  dashboardFetch.includes('require("./easy-orders-export")') &&
  dashboardFetch.includes("easyOrdersFlow.exportOrders"));
check("dashboard refresh only requests the real-orders EasyOrders export",
  dashboardFetch.includes("easyOrdersFlow.exportOrders(page, easyFrom)") &&
  !dashboardFetch.includes('easyOrdersFlow.exportReport(page, easyFrom, "missed-orders")'));
check("shared EasyOrders flow verifies exact store identity and retries exports",
  shared.includes("EASY_ORDERS_STORE_MISMATCH") &&
  shared.includes("EASY_ORDERS_STORE_UNVERIFIED") &&
  shared.includes("selectExpectedStore") &&
  shared.includes("for (let attempt = 1; attempt <= 5; attempt++)") &&
  shared.includes("for (let attempt = 1; attempt <= 3; attempt++)") &&
  shared.includes('emit({ type: "cooldown"'));
check("shared EasyOrders flow enforces English before English-only controls and notification matching",
  shared.includes("EASY_ORDERS_ENGLISH_REQUIRED") &&
  shared.includes("async function readLanguageState(page)") &&
  shared.includes("await ensureEnglish(page, { force: true });") &&
  shared.includes('await ensureEnglish(page);\n      let result = rateLimited ? null : await findExportLink(page, keyword);') &&
  runner.includes("return easyOrdersFlow.login(page);") &&
  dashboardFetch.includes("await easyOrdersFlow.login(page);"));
check("shared EasyOrders login waits for first-run 2FA before identity verification",
  shared.includes('emit({ type: "2fa-needed", site: "easy-orders" })') &&
  shared.includes("const maxWaitMs = 5 * 60 * 1000") &&
  shared.includes("verificationCodeVisible") &&
  shared.includes("EASY_ORDERS_LOGIN_TIMEOUT"));
check("dashboard worker forwards and renderer displays EasyOrders 2FA",
  read("src/main/main.js").includes('msg.type === "2fa-needed"') &&
  app.includes('window.api.on2faNeeded((message) =>') &&
  app.includes('"dashboard.fetching_2fa"'));
check("partial dashboard warning omits an empty Failed section",
  app.includes('failures.length ? "dashboard.fetch_partial_body" : "dashboard.fetch_partial_clean_body"'));

console.log(`\nExplicit dashboard refresh verification: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
