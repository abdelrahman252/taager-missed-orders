"use strict";

/*
  qa-dashboard-perf-load.js
  ---------------------------------------------------------------------------
  Boots the REAL Electron app (same launch path as scripts/qa-dashboard-
  responsive.js) and feeds it the synthetic fixture from build-perf-fixture.js
  through window.api.getDashboardSnapshot — WITHOUT overriding
  window.runDashboardAggregator. That's the deliberate difference from the
  existing qa-dashboard-performance.js suite: that suite (mountDashboard() in
  qa-dashboard-responsive.js) replaces the real aggregator with a hand-built
  96-order stand-in to keep UI-regression tests fast and deterministic. That's
  a reasonable choice for UI testing, but it means it never actually measures
  dashboard-aggregator.js's real Pass-1/Pass-2 logic. This script does.

  It then reuses the exact acceptance thresholds already chosen by
  verifyDashboardPerformanceAcceptance() in qa-dashboard-responsive.js
  (200ms search update, 50ms input dispatch, 100ms cached-restore, <=500 node
  growth / <=25MB heap growth after 50 rapid section switches) and runs them
  against the 5,000-order / 100-product fixture instead of 96 orders. Same
  bar, ~50x the data — which is the actual question being asked.

  Usage:
    node scripts/perf/qa-dashboard-perf-load.js
    node scripts/perf/qa-dashboard-perf-load.js --fixture=perf-fixture.json

  Exits 0 if every measurement is within threshold, 1 otherwise. Writes a
  full JSON report to .codex-tmp/perf-reports/.
*/

const path = require("path");
const fs = require("fs");
const { _electron: electron } = require("playwright-core");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const QA_USER_DATA_DIR = path.join(ROOT, ".codex-tmp", `perf-electron-user-data-${process.pid}`);
const REPORT_DIR = path.join(ROOT, ".codex-tmp", "perf-reports");

function parseArgs(argv) {
  const out = {};
  const normalize = (key) => String(key || "").replace(/[-_]+([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase());
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!String(arg || "").startsWith("--")) continue;
    const eq = arg.indexOf("=");
    let rawKey = "";
    let value = true;
    if (eq !== -1) {
      rawKey = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      rawKey = arg.slice(2);
      const next = argv[i + 1];
      if (next != null && !String(next).startsWith("--")) {
        value = next;
        i += 1;
      }
    }
    if (!rawKey) continue;
    out[rawKey] = value;
    out[normalize(rawKey)] = value;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
if (args.help === true || args.h === true) {
  console.log([
    "Usage: node scripts/perf/qa-dashboard-perf-load.js [options]",
    "",
    "Options:",
    "  --fixture <name>          Fixture JSON under scripts/perf/fixtures/",
    "  --sections <csv>          Comma-separated sections to cold-render/test",
    "  --switches <count>        Stability switch count (default: 50)",
    "  --skip-stability          Skip rapid section-switch stability check",
    "  --skipStability          Camel-case alias for --skip-stability",
    "  --help                   Show this help"
  ].join("\n"));
  process.exit(0);
}
const FIXTURE_NAME = args.fixture || "perf-fixture.json";
const FIXTURE_PATH = path.join(__dirname, "fixtures", FIXTURE_NAME);
const REQUESTED_SECTIONS = new Set(String(args.sections || "").split(",").map((value) => value.trim()).filter(Boolean));
const SWITCH_COUNT = Math.max(1, Number(args.switches || 50) || 50);
function truthy(value) {
  return value === true || /^(1|true|yes)$/i.test(String(value || ""));
}
const SKIP_STABILITY = truthy(args.skipStability);
function sectionRequested(sectionId) { return REQUESTED_SECTIONS.size === 0 || REQUESTED_SECTIONS.has(sectionId); }

const THRESHOLDS = {
  // NOTE: a real pass against the 5K/100 fixture measured ~1.2-1.4s for this
  // step in a throttled, GPU-less headless sandbox. That number will vary by
  // machine — treat this threshold as a regression guard (did it get much
  // worse than baseline), not an absolute production SLA.
  aggregationMs: 2500,       // real Pass-1 aggregation over the full raw snapshot
  shellMountMs: 500,         // dashboard:shell:mount measure
  coldSectionRenderMs: 600,  // first-ever render FUNCTION call against this dataset (excludes lazy script fetch)
  coldSectionVisibleMs: 2500, // true wall clock incl. first-visit lazy section-script load, generous for a cold visit
  cachedRestoreMs: 100,      // identical to the developer's existing bar (qa-dashboard-responsive.js)
  searchUpdateMs: 200,       // identical to the developer's existing bar
  inputDispatchMs: 50,       // identical to the developer's existing bar
  stabilityTimeoutMs: 60000, // nominal loop is 9s; one minute leaves ample loaded-renderer headroom
  domNodeGrowthMax: 500,     // identical to the developer's existing bar
  heapGrowthMaxBytes: 25 * 1024 * 1024, // identical to the developer's existing bar
  paneCacheMaxEntries: 6,    // dashboard-shell.js DASHBOARD_PANE_CACHE_LIMIT
  paneCacheMaxChildren: 7    // six cached panes plus at most one transient active loader
};

function stopChild(child) {
  if (!child) return;
  if (child.stdout) child.stdout.destroy();
  if (child.stderr) child.stderr.destroy();
  if (!child.killed) child.kill();
}

function stopProcessTree(child) {
  if (!child || !child.pid) return Promise.resolve();
  if (process.platform !== "win32") {
    stopChild(child);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    killer.once("error", () => {
      stopChild(child);
      resolve();
    });
    killer.once("exit", () => resolve());
  });
}

function powershellQuote(value) {
  return "'" + String(value == null ? "" : value).replace(/'/g, "''") + "'";
}

function listRepoElectronPidsSync() {
  if (process.platform !== "win32") return [];
  const script = [
    "$root = " + powershellQuote(ROOT),
    "$electron = Join-Path $root 'node_modules\\electron\\dist\\electron.exe'",
    "Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" |",
    "Where-Object { $_.ExecutablePath -eq $electron -or ([string]$_.CommandLine).Contains($root) } |",
    "ForEach-Object { $_.ProcessId }"
  ].join(" ");
  const res = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true
  });
  if (res.error || res.status !== 0) return [];
  return String(res.stdout || "").split(/\r?\n/).map((line) => Number(line.trim())).filter((pid) => Number.isFinite(pid) && pid > 0);
}

function stopNewRepoElectronPidsSync(beforePids) {
  if (process.platform !== "win32") return;
  const before = new Set((beforePids || []).map((pid) => Number(pid)));
  const fresh = listRepoElectronPidsSync().filter((pid) => !before.has(pid));
  fresh.forEach((pid) => {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  });
}

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + " timed out after " + ms + "ms")), ms);
    })
  ]);
}

function writePerfReport(report, failures) {
  report.finishedAt = new Date().toISOString();
  report.failures = failures;
  report.pass = failures.length === 0 && !report.fatalError;

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `perf-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
}

// ─── Same launch strategy as scripts/qa-dashboard-responsive.js: real
// Electron via Playwright, falling back to a CDP-attached Electron process,
// falling back to a plain Chromium load of index.html. ─────────────────────
async function launchElectronForQa() {
  try {
    if (process.env.TAAGER_QA_FORCE_CDP === "1") throw new Error("CDP forced by TAAGER_QA_FORCE_CDP");
    const app = await withTimeout(electron.launch({
      cwd: ROOT,
      args: [ROOT, "--no-sandbox"],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true", TAAGER_QA_USER_DATA_DIR: QA_USER_DATA_DIR }
    }), 60000, "Playwright Electron launch");
    const firstPage = await app.firstWindow();
    const appProcess = app.process();
    await firstPage.waitForLoadState("domcontentloaded", { timeout: 10000 });
    return {
      mode: "electron",
      firstWindow: async () => firstPage,
      installFixture: async (fixture) => {
        return app.evaluate(({ ipcMain }, fixturePath) => {
        const fs = process.getBuiltinModule("fs");
        const zlib = process.getBuiltinModule("zlib");
        const fx = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
        const snapshotByAccount = {};
        snapshotByAccount[fx.accountId] = {
          snapshot: fx.snapshot,
          snapshotMonth: fx.snapshotMonth,
          autoFetchTimestamp: fx.autoFetchTimestamp
        };
        const snapshotResult = {
          ok: true,
          revision: "perf-fixture-1",
          data: snapshotByAccount
        };
        const snapshotJson = JSON.stringify(snapshotResult);
        const snapshotGzip = zlib.gzipSync(snapshotJson, { level: 1 });
        ipcMain.removeHandler("get-credentials");
        ipcMain.handle("get-credentials", async () => ({
          accounts: [{
            id: fx.accountId,
            easyEmail: "perf-qa@example.com",
            label: "Performance test store",
            taagerCountry: "sa"
          }],
          maxAccounts: 5,
          analyticsEnabled: true,
          operationsEnabled: true,
          dashboardEnabled: true
        }));
        ipcMain.removeHandler("get-dashboard-snapshot");
        ipcMain.handle("get-dashboard-snapshot", async () => snapshotResult);
        ipcMain.removeHandler("get-dashboard-snapshot-json");
        ipcMain.handle("get-dashboard-snapshot-json", async () => snapshotJson);
        ipcMain.removeHandler("get-dashboard-snapshot-gzip");
        ipcMain.handle("get-dashboard-snapshot-gzip", async () => ({
          encoding: "gzip",
          data: snapshotGzip,
          revision: snapshotResult.revision,
          unchanged: false,
          cacheHit: true,
          timings: { resultMs: 0, stringifyMs: 0, gzipMs: 0, totalMs: 0 }
        }));
        // The fixture exercises the renderer's real aggregator output. Inherited
        // developer query flags would otherwise redirect some sections to the
        // machine's unrelated local dashboard database, which contains no
        // fixture rows and invalidates the measurement.
        ipcMain.removeHandler("get-dashboard-query-flags");
        ipcMain.handle("get-dashboard-query-flags", async () => ({
          ok: true,
          shadow: false,
          orders: false,
          products: false,
          campaigns: false,
          cities: false,
          lazyMarketing: true,
          incrementalMarketing: false
        }));
        return { accountId: fx.accountId, orderCount: fx.snapshot.length };
      }, FIXTURE_PATH);
      },
      close: async () => {
        await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
        await app.close().catch(() => {});
        await stopProcessTree(appProcess);
      }
    };
  } catch (err) {
    throw new Error("Fixture-backed perf runs require Playwright Electron: " + err.message);
  }
}

// ─── window.api mock — same noop surface as qa-dashboard-responsive.js, so
// nothing the app calls incidentally throws. Dashboard-relevant calls are
// overridden below with the real fixture. ───────────────────────────────────
async function installApiMock(page) {
  await page.addInitScript(() => {
    const noop = () => {};
    try {
      localStorage.setItem("kbot_tour_completed_dashboard", "true");
      localStorage.setItem("kbot_tour_completed_analytics", "true");
      localStorage.setItem("kbot_tour_completed_operations", "true");
    } catch (_) {}
    window.monitoring = {
      captureException: noop, captureMessage: noop, addBreadcrumb: noop,
      setUserContext: noop, setContext: noop, setTag: noop, reportIpcFailure: noop,
      getMeta: () => ({ appVersion: "perf-qa" })
    };
    window.api = {
      minimize: noop, maximize: noop, close: noop,
      checkLicense: async () => ({ valid: true, customerName: "PERF", daysLeft: 30, key: "PERF", allowReset: false }),
      checkLicenseNocache: async () => ({ valid: true, customerName: "PERF", daysLeft: 30, key: "PERF", allowReset: false }),
      submitLicense: async () => ({ valid: true }),
      getCredentials: async () => ({ accounts: [], maxAccounts: 1, analyticsEnabled: true, operationsEnabled: true, dashboardEnabled: true }),
      saveCredentials: async () => ({ success: true }),
      saveAllAccounts: async () => ({ success: true }),
      unlockSingleAccount: async () => ({ success: false, reason: "perf-qa" }),
      relockAccount: async () => ({ success: true }),
      clearAllData: async () => true,
      clearResetFlag: async () => ({ success: true }),
      setAutoRun: async () => true, setAutoRunInterval: async () => true, setAutoRunAccounts: async () => true,
      setLaunchMinimized: async () => true, getAutoRunProgress: async () => null,
      killBot: noop, openFolder: async () => true, getProfilePath: async () => "",
      runBot: async () => ({ success: true, data: {} }),
      botStarted: noop, botFinished: noop, onBotLog: noop, on2faNeeded: noop, onNeedsConfirm: noop,
      onPreview: noop, onOrderProgress: noop, onAutoRunTick: noop, onLicenseExpired: noop,
      on: noop, removeAllListeners: noop,
      getSettings: async () => ({ theme: "dark", lang: "ar" }),
      saveSettings: async () => true, saveOutputFile: async () => ({ saved: true }),
      saveRunAnalytics: async () => ({ ok: true }), getAnalyticsRuns: async () => ({ runs: [] }),
      clearAnalyticsData: async () => true,
      getAnalyticsSettings: async () => ({ minutesPerOrder: 5, savedPresets: "[]" }),
      saveAnalyticsSettings: async () => ({ ok: true }),
      runDashboardFetch: async () => ({ success: true, rows: 0 }),
      saveDashboardSnapshot: async () => true,
      getDashboardSnapshot: async () => null, // overridden per-fixture after navigation
      getDashboardAutoTs: async () => null, setDashboardAutoTs: async () => true,
      clearDashboardData: async () => true, getDashboardEnabled: async () => true,
      getMarketingStatus: async () => ({ ok: true, connected: false }),
      connectMarketing: async () => ({ ok: false }),
      saveMarketingMapping: async () => ({ ok: true }), saveAllMarketingMappings: async () => ({ ok: true }),
      syncMarketingData: async () => ({ ok: true }), syncAllMarketingData: async () => ({ ok: true }),
      openExternalUrl: async () => true,
      dashboardAiQuery: async () => ({ message: "PERF QA response", insights: [], meta: { source: "perf-qa" } }),
      getAiAdminAnalytics: async () => ({}), debugGeminiPing: async () => ({}),
      getAppVersion: async () => "perf-qa", checkForUpdates: async () => ({ dev: true }),
      downloadUpdate: async () => true, installUpdate: async () => true,
      onUpdateAvailable: noop, onUpdateNotAvailable: noop, onUpdateProgress: noop,
      onUpdateDownloaded: noop, onUpdateError: noop
    };
  });
}

// ─── Mount the dashboard with the real fixture flowing through the REAL
// aggregator (window.runDashboardAggregator is left untouched). ────────────
async function mountDashboardWithRealAggregator(page, fixture) {
  await page.waitForFunction(() => !!document.querySelector(".page.active"), null, { timeout: 15000 });
  const fixtureMonth = /^\d{4}-\d{2}$/.test(String(fixture.snapshotMonth || ""))
    ? fixture.snapshotMonth
    : "2026-06";
  const fixtureYear = Number(fixtureMonth.slice(0, 4));
  const fixtureMonthNumber = Number(fixtureMonth.slice(5, 7));
  const fixtureDateFrom = `${fixtureMonth}-01`;
  const fixtureDateTo = `${fixtureMonth}-${String(new Date(fixtureYear, fixtureMonthNumber, 0).getDate()).padStart(2, "0")}`;

  const apiProbe = await page.evaluate(async ({ accountId, dateFrom, dateTo }) => {
    document.querySelectorAll(".taager-tour-prompt, .taager-tour-root").forEach((node) => node.remove());

    window._kbotLang = "ar";
    window._kbotTheme = "dark";
    window._dashboardEnabled = true;

    try { localStorage.setItem("taager_dashboard_period", JSON.stringify({ preset: "custom", dateFrom, dateTo })); } catch (_) {}
    try { localStorage.setItem("taager_dashboard_expected_ndr_range", JSON.stringify({ dateFrom, dateTo })); } catch (_) {}
    try { localStorage.setItem("taager_dashboard_delivered_date_mode", "actual"); } catch (_) {}
    try { localStorage.setItem("taager_active_account_id", accountId); } catch (_) {}
    if (window.TaagerPerf && window.TaagerPerf.clear) window.TaagerPerf.clear();

    if (typeof window.applyTheme === "function") window.applyTheme("dark");
    if (typeof window.applyLang === "function") window.applyLang("ar");

    const descriptor = Object.getOwnPropertyDescriptor(window, "api");
    const credentials = await window.api.getCredentials();
    const queryFlags = typeof window.api.getDashboardQueryFlags === "function"
      ? await window.api.getDashboardQueryFlags()
      : null;
    return {
      apiDescriptor: descriptor ? {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        writable: descriptor.writable,
        hasGetter: typeof descriptor.get === "function"
      } : null,
      credentialAccountIds: Array.isArray(credentials && credentials.accounts)
        ? credentials.accounts.map((account) => account.id)
        : null,
      snapshotProbeSkipped: true,
      queryFlags
    };
  }, { accountId: fixture.accountId, dateFrom: fixtureDateFrom, dateTo: fixtureDateTo });
  console.log("[perf] fixture API probe:", JSON.stringify(apiProbe));

  // The dashboard bundle is lazy-loaded by renderDashboard/ensureFeatureScripts.
  // Waiting for runDashboardAggregator before loading that bundle creates a
  // circular wait, because dashboard-aggregator.js defines that function.
  await page.evaluate(async ({ dateFrom, dateTo }) => {
    if (typeof window.showPage === "function") window.showPage("page-dashboard");
    if (typeof window.ensureFeatureScripts !== "function") {
      throw new Error("Dashboard startup: window.ensureFeatureScripts is unavailable");
    }
    await window.ensureFeatureScripts("dashboard");
    if (window.DashboardPeriodState && typeof window.DashboardPeriodState.setCustomRange === "function") {
      window.DashboardPeriodState.setCustomRange(dateFrom, dateTo);
    }
    if (window.DashboardDeliveredDateState && typeof window.DashboardDeliveredDateState.set === "function") {
      window.DashboardDeliveredDateState.set("actual");
    }
    if (typeof window.runDashboardAggregator !== "function") {
      throw new Error("Dashboard startup: dashboard bundle loaded without runDashboardAggregator");
    }
    if (typeof window.renderDashboard !== "function") {
      throw new Error("Dashboard startup: dashboard bundle loaded without renderDashboard");
    }
    await window.renderDashboard();
    if (typeof window.showPage === "function") window.showPage("page-dashboard");
  }, { dateFrom: fixtureDateFrom, dateTo: fixtureDateTo });
  await page.waitForSelector("#db-shell-mount.dash-shell", { timeout: 30000 });
  await page.waitForFunction(() => {
    const mount = document.getElementById("db-shell-mount");
    return !!(mount && mount._dashboardActiveSection);
  }, null, { timeout: 30000 });
}

// ─── Section helpers — adapted from verifyDashboardPerformanceAcceptance()
// in qa-dashboard-responsive.js. Same selectors, same thresholds, scaled
// against the 5,000-row fixture instead of 96 hand-built orders. ───────────
async function openSection(page, sectionId, readySelector, opts) {
  const timeoutMs = (opts && opts.readyTimeoutMs) || 15000;
  const genuineRowSelector = sectionId === "products"
    ? ".s5-product-row[data-product-key]"
    : sectionId === "cities"
      ? ".sc-lb-row[data-city][data-lb-filter-match]"
      : "";
  const requiresReadyMarker = !!genuineRowSelector;
  const alreadyReady = await page.evaluate(({ id, selector, rowSelector, marker }) => {
    const mount = document.getElementById("db-shell-mount");
    const pane = mount && mount._dashboardActivePane;
    return !!(mount && mount._dashboardActiveSection === id && pane && !pane.hidden &&
      (!marker || pane.dataset.dashboardReady === id) &&
      (!rowSelector || pane.querySelector(rowSelector)) &&
      (!selector || pane.querySelector(selector)));
  }, { id: sectionId, selector: readySelector || "", rowSelector: genuineRowSelector, marker: requiresReadyMarker });
  if (!alreadyReady) {
    await page.locator(`.dash-nav-btn[data-section="${sectionId}"]`).evaluate((button) => button.click());
    await page.waitForFunction((id) => document.getElementById("db-shell-mount")?._dashboardActiveSection === id, sectionId, { timeout: 20000 });
  }
  let readyOk = true;
  if (readySelector || genuineRowSelector) {
    readyOk = await page.waitForFunction(({ id, selector, rowSelector, marker }) => {
      const mount = document.getElementById("db-shell-mount");
      const pane = mount && mount._dashboardActivePane;
      return !!(mount && mount._dashboardActiveSection === id && pane && !pane.hidden &&
        (!marker || pane.dataset.dashboardReady === id) &&
        (!rowSelector || pane.querySelector(rowSelector)) &&
        (!selector || pane.querySelector(selector)));
    }, { id: sectionId, selector: readySelector || "", rowSelector: genuineRowSelector, marker: requiresReadyMarker }, { timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
  }
  await page.waitForTimeout(120);
  return { readyOk };
}

async function measureEmptySearch(page, sectionId, inputSelector, rowSelector) {
  await openSection(page, sectionId, inputSelector);
  const result = await page.evaluate(async ({ inputSelector, rowSelector }) => {
    const mount = document.getElementById("db-shell-mount");
    const scope = mount && mount._dashboardActivePane;
    const input = scope && scope.querySelector(inputSelector);
    if (!input) return { missingInput: true };
    const startRows = scope.querySelectorAll(rowSelector).length;
    const started = performance.now();
    input.focus();
    input.value = "__perf_qa_no_match_" + Math.random().toString(36).slice(2);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (performance.now() - started < 3000) {
      if (scope.querySelectorAll(rowSelector).length === 0) {
        return { durationMs: performance.now() - started, startRows };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { durationMs: performance.now() - started, timedOut: true, startRows, endRows: scope.querySelectorAll(rowSelector).length };
  }, { inputSelector, rowSelector });
  return Object.assign({ sectionId }, result);
}

async function measureInputFeedback(page, sectionId, inputSelector) {
  await openSection(page, sectionId, inputSelector);
  const result = await page.evaluate(async (selector) => {
    const mount = document.getElementById("db-shell-mount");
    const scope = mount && mount._dashboardActivePane;
    const input = scope && scope.querySelector(selector);
    if (!input) return { missingInput: true };
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const started = performance.now();
    input.focus();
    input.value = String((Number(String(input.value).replace(/[^0-9.-]/g, "")) || 100) + 1);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const dispatchMs = performance.now() - started;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { dispatchMs, durationMs: performance.now() - started };
  }, inputSelector);
  return Object.assign({ sectionId }, result);
}

// Cold render = first-ever visit to this section against the loaded fixture.
// Reports THREE numbers, deliberately kept separate because they answer
// different questions:
//   - shellSwitchMs:   wall clock until dashboard-shell flags the section as
//                       active (the cheap part — just routing/cache lookup)
//   - renderFnMs:       the app's own dashboard:section:render measure — the
//                       actual render function's execution time
//   - visibleWallClockMs: wall clock until the section's real content
//                       selector appears in the DOM — this is the only one
//                       that includes the lazy per-section script fetch that
//                       happens on a genuinely first-ever visit, which the
//                       app's own instrumentation does NOT measure.
async function measureColdRender(page, sectionId, readySelector) {
  await page.evaluate(() => { if (window.TaagerPerf && window.TaagerPerf.clear) window.TaagerPerf.clear(); });
  const wallStart = Date.now();
  await page.locator(`.dash-nav-btn[data-section="${sectionId}"]`).evaluate((button) => button.click());
  await page.waitForFunction((id) => document.getElementById("db-shell-mount")?._dashboardActiveSection === id, sectionId, { timeout: 20000 });
  const shellSwitchMs = Date.now() - wallStart;
  const genuineRowSelector = sectionId === "products"
    ? ".s5-product-row[data-product-key]"
    : sectionId === "cities"
      ? ".sc-lb-row[data-city][data-lb-filter-match]"
      : "";
  const requiresReadyMarker = !!genuineRowSelector;
  const readyOk = readySelector || genuineRowSelector
    ? await page.waitForFunction(({ id, selector, rowSelector, marker }) => {
      const mount = document.getElementById("db-shell-mount");
      const pane = mount && mount._dashboardActivePane;
      return !!(mount && mount._dashboardActiveSection === id && pane && !pane.hidden &&
        (!marker || pane.dataset.dashboardReady === id) &&
        (!rowSelector || pane.querySelector(rowSelector)) &&
        (!selector || pane.querySelector(selector)));
    }, { id: sectionId, selector: readySelector || "", rowSelector: genuineRowSelector, marker: requiresReadyMarker }, { timeout: 15000 }).then(() => true).catch(() => false)
    : true;
  const visibleWallClockMs = Date.now() - wallStart;
  await page.waitForTimeout(120);
  const entries = await page.evaluate((id) => {
    const list = window.TaagerPerf ? window.TaagerPerf.entries() : [];
    return list.filter((e) => e.type === "measure" && e.detail && e.detail.sectionId === id);
  }, sectionId);
  const renderEntries = entries.filter((entry) => entry.name === "dashboard:section:render");
  const loadEntries = entries.filter((entry) => entry.name === "dashboard:section-group:load");
  const phaseTimings = entries.filter((entry) => entry.name.indexOf("dashboard:section:phase:") === 0).reduce((out, entry) => {
    const phase = entry.detail && entry.detail.phase || entry.name.slice("dashboard:section:phase:".length);
    out[phase] = Math.round(entry.durationMs * 10) / 10;
    return out;
  }, {});
  const longTasks = await page.evaluate(() => (window.TaagerPerf ? window.TaagerPerf.entries() : []).filter((entry) => entry.type === "longtask"));
  const renderFnMs = renderEntries.length ? Math.round(renderEntries[renderEntries.length - 1].durationMs) : null;
  const lazyLoadMs = loadEntries.length ? Math.round(loadEntries[loadEntries.length - 1].durationMs) : null;
  const maxLongTaskMs = longTasks.length ? Math.round(Math.max(...longTasks.map((entry) => entry.durationMs))) : 0;
  return { sectionId, shellSwitchMs, renderFnMs, lazyLoadMs, phaseTimings, visibleWallClockMs, readyOk, longTaskCount: longTasks.length, maxLongTaskMs };
}

async function main() {
  const electronPidsBefore = listRepoElectronPidsSync();
  if (!fs.existsSync(FIXTURE_PATH)) {
    console.log("[perf] Fixture not found at " + FIXTURE_PATH + " — generating it now (defaults: 5000 orders / 100 products)...");
    require("./build-perf-fixture.js");
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  console.log(`[perf] Loaded fixture: ${fixture.orderCount} orders, ${fixture.productCount} products (seed ${fixture.seed})`);

  const app = await launchElectronForQa();
  const failures = [];
  const report = {
    startedAt: new Date().toISOString(),
    fixture: { orderCount: fixture.orderCount, productCount: fixture.productCount, seed: fixture.seed },
    launchMode: app.mode,
    thresholds: THRESHOLDS,
    args: {
      fixture: FIXTURE_NAME,
      requestedSections: Array.from(REQUESTED_SECTIONS),
      switches: SWITCH_COUNT,
      skipStability: SKIP_STABILITY
    }
  };
  let page = null;

  try {
    console.log("[perf] launched via " + app.mode);
    page = await app.firstWindow();
    page.on("pageerror", (err) => console.log("[renderer:error]", err.message));

    const fixtureInstall = await app.installFixture(fixture);
    console.log("[perf] fixture IPC installed:", JSON.stringify(fixtureInstall));

    await installApiMock(page);
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
    await page.waitForFunction(() => typeof window.renderDashboard === "function", null, { timeout: 30000 });
    console.log("[perf] app scripts ready, mounting dashboard with real fixture through the real aggregator...");

    const mountStart = Date.now();
    await mountDashboardWithRealAggregator(page, fixture);
    const mountWallClockMs = Date.now() - mountStart;
    report.initialLoad = { wallClockMs: mountWallClockMs };
    console.log(`[perf] initial mount complete in ${mountWallClockMs}ms (wall clock)`);

    report.dataIntegrity = await page.evaluate(() => ({
      activeAccountId: window.dashboardGeoData && window.dashboardGeoData.meta
        ? window.dashboardGeoData.meta.activeAccountId
        : null,
      accountOptions: (window.dashboardAccountsList || []).map((account) => ({
        id: account.id,
        orderCount: account.orderCount,
        rawOrderCount: account.rawOrderCount,
        hasSnapshot: account.hasSnapshot
      })),
      renderedOrders: Array.isArray(window.dashboardGeoData && window.dashboardGeoData.orders)
        ? window.dashboardGeoData.orders.length
        : null,
      renderedProducts: window.dashboardGeoData && window.dashboardGeoData.products && Array.isArray(window.dashboardGeoData.products.rows)
        ? window.dashboardGeoData.products.rows.length
        : null,
      period: window.dashboardGeoData && window.dashboardGeoData.meta
        ? window.dashboardGeoData.meta.period
        : null
    }));
    console.log("[perf] data integrity:", JSON.stringify(report.dataIntegrity));
    if (!(report.dataIntegrity.renderedOrders > 0)) {
      throw new Error(`Data integrity: fixture has ${fixture.orderCount} orders but aggregator rendered ${report.dataIntegrity.renderedOrders}`);
    }

    // ── Real aggregation + shell-mount timing, read from the app's own
    // instrumentation (window.TaagerPerf), not invented here. ──────────────
    const coreEntries = await page.evaluate(() => (window.TaagerPerf ? window.TaagerPerf.entries() : []));
    const aggEntry = coreEntries.filter((e) => e.type === "measure" && e.name === "dashboard:data:aggregation").pop();
    const mountEntry = coreEntries.filter((e) => e.type === "measure" && e.name === "dashboard:shell:mount").pop();
    report.aggregationMs = aggEntry ? Math.round(aggEntry.durationMs) : null;
    report.shellMountMs = mountEntry ? Math.round(mountEntry.durationMs) : null;
    report.aggregationPhases = await page.evaluate(() => {
      const meta = window.dashboardGeoData && window.dashboardGeoData.meta || {};
      const perfPhases = window.TaagerPerf
        ? window.TaagerPerf.entries().filter((entry) => entry.type === "measure" && String(entry.name || "").indexOf("dashboard:aggregation:phase:") === 0)
        : [];
      return {
        requestId: meta.aggregationRequestId || null,
        snapshotRevision: meta.snapshotRevision || null,
        snapshotTransport: meta.snapshotTransport || null,
        meta: Array.isArray(meta.aggregationPhaseTimings) ? meta.aggregationPhaseTimings : [],
        process: Array.isArray(meta.processPhaseTimings) ? meta.processPhaseTimings : [],
        perfEntries: perfPhases.map((entry) => ({
          name: entry.name,
          durationMs: Math.round(entry.durationMs * 10) / 10,
          detail: entry.detail || null
        }))
      };
    });
    console.log(`[perf] real aggregation pass: ${report.aggregationMs == null ? "no measure entry found" : report.aggregationMs + "ms"}`);
    console.log(`[perf] shell mount: ${report.shellMountMs == null ? "no measure entry found" : report.shellMountMs + "ms"}`);
    if (report.aggregationPhases && report.aggregationPhases.snapshotTransport) {
      console.log("[perf] snapshot transport:", JSON.stringify(report.aggregationPhases.snapshotTransport));
    }
    if (report.aggregationPhases && report.aggregationPhases.meta && report.aggregationPhases.meta.length) {
      console.log("[perf] aggregation phases:", JSON.stringify(report.aggregationPhases.meta));
    }
    if (report.aggregationPhases && report.aggregationPhases.process && report.aggregationPhases.process.length) {
      console.log("[perf] process phases:", JSON.stringify(report.aggregationPhases.process));
    }
    if (report.aggregationMs != null && report.aggregationMs > THRESHOLDS.aggregationMs) {
      failures.push(`Real aggregation took ${report.aggregationMs}ms (limit ${THRESHOLDS.aggregationMs}ms)`);
    }
    if (report.shellMountMs != null && report.shellMountMs > THRESHOLDS.shellMountMs) {
      failures.push(`Shell mount took ${report.shellMountMs}ms (limit ${THRESHOLDS.shellMountMs}ms)`);
    }

    const initialSnapshot = await page.evaluate(() => (window.TaagerPerf ? window.TaagerPerf.snapshot("after-initial-load") : null));
    report.initialSnapshot = initialSnapshot;
    if (initialSnapshot) {
      console.log(`[perf] DOM nodes after initial load: ${initialSnapshot.nodeCount}, heap: ${initialSnapshot.usedHeap != null ? Math.round(initialSnapshot.usedHeap / 1024 / 1024) + "MB" : "n/a"}`);
    }

    // ── Cold render of every requested section, against the full fixture ──
    const sectionsToTest = [
      { id: "orders", selector: "#s3-rows tr" },
      { id: "products", selector: ".s5-product-row[data-product-key]" },
      { id: "cities", selector: ".sc-lb-row[data-city][data-lb-filter-match]" },
      { id: "marketing", selector: ".marketing-section" },
      { id: "campaigns", selector: ".campaign-section" },
      { id: "calculator", selector: "#s7-in-budget" },
      { id: "productForecast", selector: "#s9-product-search" },
      { id: "taagerAi", selector: "#aii-chat-input" }
    ].filter((section) => sectionRequested(section.id));
    report.coldRenders = [];
    for (const section of sectionsToTest) {
      const result = await measureColdRender(page, section.id, section.selector);
      report.coldRenders.push(result);
      console.log(`[perf] cold render — ${section.id}: shellSwitch=${result.shellSwitchMs}ms lazyLoad=${result.lazyLoadMs == null ? "n/a" : result.lazyLoadMs + "ms"} renderFn=${result.renderFnMs == null ? "n/a" : result.renderFnMs + "ms"} visibleWallClock=${result.visibleWallClockMs}ms readyOk=${result.readyOk}`);
      if (!result.readyOk) {
        failures.push(`${section.id}: content selector "${section.selector}" never appeared within 15s of clicking the nav button`);
      }
      if (result.renderFnMs != null && result.renderFnMs > THRESHOLDS.coldSectionRenderMs) {
        failures.push(`${section.id} cold render function took ${result.renderFnMs}ms (limit ${THRESHOLDS.coldSectionRenderMs}ms)`);
      }
      if (result.visibleWallClockMs > THRESHOLDS.coldSectionVisibleMs) {
        failures.push(`${section.id} took ${result.visibleWallClockMs}ms wall-clock to become visible on first visit (limit ${THRESHOLDS.coldSectionVisibleMs}ms)`);
      }
    }

    // ── Cached restore — full runs only; targeted runs stay focused/short ──
    if (REQUESTED_SECTIONS.size === 0) {
    await openSection(page, "overview", "#s1-root");
    await page.waitForFunction(() => {
      const cache = document.getElementById("db-shell-mount")?._dashboardPaneCache;
      return !!(cache && Object.keys(cache.map || {}).some((key) => key.startsWith("overview|") && cache.map[key]?.children.length));
    }, null, { timeout: 15000 }).catch(() => console.log("[perf] warning: overview pane never appeared in the section cache — cache-hit check may be unreliable"));
    await openSection(page, "master", ".s8-body");
    const cachedRestoreMs = await page.evaluate(() => {
      const button = document.querySelector('.dash-nav-btn[data-section="overview"]');
      if (!button) return null;
      if (window.TaagerPerf && window.TaagerPerf.clear) window.TaagerPerf.clear();
      button.click();
      const entry = window.TaagerPerf.entries().filter((item) =>
        item.type === "measure" && item.name === "dashboard:section:switch" && item.detail && item.detail.cacheHit
      ).pop();
      return entry ? entry.durationMs : null;
    });
    report.cachedRestoreMs = cachedRestoreMs;
    console.log(`[perf] cached section restore: ${cachedRestoreMs == null ? "no cache-hit measure found" : Math.round(cachedRestoreMs) + "ms"}`);
    if (cachedRestoreMs == null) {
      failures.push("Cached section restore measurement missing — could not confirm cache-hit path");
    } else if (cachedRestoreMs > THRESHOLDS.cachedRestoreMs) {
      failures.push(`Cached section restore took ${Math.round(cachedRestoreMs)}ms (limit ${THRESHOLDS.cachedRestoreMs}ms)`);
    }
    } else {
      report.cachedRestoreMs = null;
    }

    // ── Search / input interaction latency at full data volume ────────────
    report.interactions = {};
    if (sectionRequested("products")) report.interactions.productsSearchMs = await measureEmptySearch(page, "products", "#s5-search", ".s5-product-row");
    if (sectionRequested("cities")) report.interactions.citiesSearchMs = await measureEmptySearch(page, "cities", "#sc-fb-search", ".sc-lb-row[data-lb-filter-match='1']");
    if (sectionRequested("orders")) report.interactions.ordersSearchMs = await measureEmptySearch(page, "orders", "#s3-search", ".s3-order-row");
    if (sectionRequested("productForecast")) {
      report.interactions.forecastSearchMs = await measureEmptySearch(page, "productForecast", "#s9-product-search", ".s9-row:not([hidden])");
      report.interactions.forecastInputMs = await measureInputFeedback(page, "productForecast", ".s9-sim-spend-input");
    }
    if (sectionRequested("calculator")) report.interactions.calculatorInputMs = await measureInputFeedback(page, "calculator", "#s7-in-budget");
    Object.values(report.interactions).forEach((r) => {
      if (!r) return;
      const label = r.sectionId;
      if (r.missingInput) {
        failures.push(`${label} interaction control was missing from the active pane`);
        return;
      }
      if (typeof r.startRows === "number" && r.startRows === 0) {
        failures.push(`${label} search measurement started with zero rendered rows`);
      }
      if (typeof r.durationMs === "number" && r.durationMs > THRESHOLDS.searchUpdateMs && r.dispatchMs === undefined) {
        failures.push(`${label} search/filter update took ${Math.round(r.durationMs)}ms (limit ${THRESHOLDS.searchUpdateMs}ms)`);
      }
      if (typeof r.dispatchMs === "number" && r.dispatchMs > THRESHOLDS.inputDispatchMs) {
        failures.push(`${label} input dispatch took ${r.dispatchMs.toFixed(1)}ms (limit ${THRESHOLDS.inputDispatchMs}ms)`);
      }
      if (r.timedOut) failures.push(`${label} search never reached zero matching rows within 3000ms`);
    });
    console.log("[perf] interaction latency:", JSON.stringify(report.interactions));

    // ── Stability / leak check across rapid section switching at full load ─
    if (!SKIP_STABILITY) {
    await openSection(page, "master", ".s8-body");
    const stability = await withTimeout(
      page.evaluate((count) => window.TaagerPerf.runDashboardSectionStabilityCheck(
        ["products", "cities", "orders", "productForecast", "calculator", "cod", "master"],
        count
      ), SWITCH_COUNT),
      THRESHOLDS.stabilityTimeoutMs,
      "50-switch stability check"
    );
    await page.waitForFunction(() => {
      const mount = document.getElementById("db-shell-mount");
      const pane = mount && mount._dashboardActivePane;
      return !!(mount && pane && !pane.hidden && pane.dataset.sectionId === mount._dashboardActiveSection && pane.children.length);
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    const settled = await page.evaluate(() => {
      const mount = document.getElementById("db-shell-mount");
      const cache = mount && mount._dashboardPaneCache;
      const container = document.getElementById("dash-section-pane");
      return {
        snapshot: window.TaagerPerf.snapshot("settled-after-50-section-switches"),
        cacheEntries: cache && cache.map ? Object.keys(cache.map).length : 0,
        cacheOrderLength: cache && Array.isArray(cache.order) ? cache.order.length : 0,
        panes: container ? Array.from(container.children).map((pane) => ({
          sectionId: pane.dataset.sectionId || "",
          hidden: !!pane.hidden,
          cacheable: !!pane._dashboardCacheable,
          childCount: pane.children.length
        })) : []
      };
    });
    const before = stability.before, after = settled.snapshot;
    const subscriptionGrowth = Object.keys(after.subscriptions || {}).reduce((out, key) => {
      out[key] = Number(after.subscriptions[key] || 0) - Number((before.subscriptions || {})[key] || 0);
      return out;
    }, {});
    const growingSubscriptions = Object.keys(subscriptionGrowth).filter((key) => subscriptionGrowth[key] > 0);
    const heapGrowth = before.usedHeap != null && after.usedHeap != null ? after.usedHeap - before.usedHeap : null;
    const nodeGrowth = after.nodeCount - before.nodeCount;
    report.stability = { before, rapidAfter: stability.after, after, cache: settled, subscriptionGrowth, heapGrowth, nodeGrowth };
    console.log(`[perf] stability check (50 switches): nodeGrowth=${nodeGrowth} heapGrowth=${heapGrowth == null ? "n/a" : Math.round(heapGrowth / 1024 / 1024) + "MB"} paneCacheChildren=${after.dashboardPaneChildren}`);
    if (growingSubscriptions.length) failures.push("Subscriptions grew after 50 section switches: " + JSON.stringify(subscriptionGrowth));
    if (settled.cacheEntries > THRESHOLDS.paneCacheMaxEntries) failures.push(`Pane cache map grew unbounded: ${settled.cacheEntries} entries (limit ${THRESHOLDS.paneCacheMaxEntries})`);
    if (after.dashboardPaneChildren > THRESHOLDS.paneCacheMaxChildren) failures.push(`Pane cache grew unbounded: ${after.dashboardPaneChildren} children (limit ${THRESHOLDS.paneCacheMaxChildren})`);
    if (nodeGrowth > THRESHOLDS.domNodeGrowthMax) failures.push(`DOM grew by ${nodeGrowth} nodes after 50 switches (limit ${THRESHOLDS.domNodeGrowthMax})`);
    if (heapGrowth != null && heapGrowth > THRESHOLDS.heapGrowthMaxBytes) failures.push(`Heap grew by ${Math.round(heapGrowth / 1024 / 1024)}MB after 50 switches (limit ${Math.round(THRESHOLDS.heapGrowthMaxBytes / 1024 / 1024)}MB)`);
    } else {
      report.stability = { skipped: true, requestedSwitches: SWITCH_COUNT };
    }

    // ── Long tasks captured throughout the whole run (auto-instrumented) ──
    const longTasks = await page.evaluate(() => (window.TaagerPerf ? window.TaagerPerf.entries() : []).filter((e) => e.type === "longtask"));
    report.longTasks = { count: longTasks.length, maxDurationMs: longTasks.length ? Math.round(Math.max(...longTasks.map((t) => t.durationMs))) : 0, entries: longTasks.slice(-20) };
    console.log(`[perf] long tasks observed: ${report.longTasks.count} (max ${report.longTasks.maxDurationMs}ms)`);
  } catch (err) {
    console.error("[perf] a step failed mid-run — writing the partial report anyway:", err.message);
    report.fatalError = err.message;
    if (page) {
      report.failureDiagnostics = await page.evaluate(() => {
        const entries = window.TaagerPerf ? window.TaagerPerf.entries() : [];
        const longTasks = entries.filter((entry) => entry.type === "longtask");
        return {
          activeSection: (document.getElementById("db-shell-mount") || {})._dashboardActiveSection || "",
          nodeCount: document.getElementsByTagName("*").length,
          longTaskCount: longTasks.length,
          maxLongTaskMs: longTasks.length ? Math.round(Math.max(...longTasks.map((entry) => entry.durationMs))) : 0,
          perfTail: entries.slice(-30)
        };
      }).catch(() => null);
    }
    failures.push("Run aborted mid-way (" + err.message + ") — every measurement above this point in the console output is still valid, later steps did not run.");
  } finally {
    await app.close().catch(() => {});
    stopNewRepoElectronPidsSync(electronPidsBefore);
  }

  const reportPath = writePerfReport(report, failures);

  console.log("\n" + "=".repeat(70));
  console.log(report.pass ? `[PASS] Dashboard stayed within every existing acceptance threshold at ${report.fixture.orderCount}-order scale.` : "[FAIL] One or more thresholds were exceeded:");
  failures.forEach((f) => console.log("  - " + f));
  console.log("Full report: " + reportPath);
  console.log("=".repeat(70));

  process.exitCode = report.pass ? 0 : 1;
}

main().catch((err) => {
  console.error("[perf] fatal error:", err);
  process.exitCode = 1;
});
