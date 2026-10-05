"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { beginBrowserProcessDiagnostics, setBrowserProcessContextCloseReason } = require("../src/bot/browser-process-diagnostics");
const { launchPersistentChromeContext } = require("../src/bot/chrome-launch");
const logger = require("playwright-core/lib/utils").debugLogger;

function verifyAlertRetention() {
  const vm = require("vm");
  const source = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8");
  const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  const timers = [];
  const payloads = [];
  const sandbox = {
    compactAdminAlertText: (value, limit) => String(value || "").slice(0, limit),
    licenseStore: { get: () => "test-license" },
    adminAlertAccountInfo: () => ({ accountId: "test" }),
    adminAlertStageHistory: () => [],
    adminErrorAlertRecent: new Map(), ADMIN_ERROR_ALERT_COOLDOWN_MS: 0,
    app: { getVersion: () => "test" }, log: { warn() {} },
    setTimeout: (callback, delay) => { assert.strictEqual(delay, 750); timers.push(callback); },
    supabaseFunctionRequest: (_name, payload) => { payloads.push(payload); return Promise.resolve(); },
  };
  vm.createContext(sandbox);
  vm.runInContext(extract("function recentRunLogsWithBrowserDiagnostics(", "let botChildren") + extract("function notifyAdminErrorAlert(", "function notifyAdminSuccessAlert("), sandbox);
  const tail = ["[BrowserProcess] run=test pid=12 event=launched"];
  sandbox.notifyAdminErrorAlert({ error: "TAAGER_BROWSER_CRASH", recentLogs: ["download failed"], browserDiagnosticTail: tail });
  assert.strictEqual(payloads.length, 0);
  tail.push("[BrowserProcess] run=test pid=12 event=exited exitCode=1 signal=null close=none");
  timers[0]();
  assert.strictEqual(payloads.length, 1);
  assert(payloads[0].recentLogs.some((line) => line.includes("exitCode=1")));
  const manyLogs = Array.from({ length: 100 }, (_, index) => `ordinary-log-${index}`);
  const result = sandbox.recentRunLogsWithBrowserDiagnostics(manyLogs, 5, tail);
  assert(result.length <= 5 && result.some((line) => line.includes("exitCode=1")));
}

function verifyAllowlist() {
  const lines = [];
  const profiles = [path.resolve("diagnostics-a"), path.resolve("diagnostics-b")];
  const handles = profiles.map((profilePath, index) => beginBrowserProcessDiagnostics({ profilePath, runId: `run-${index}`, browser: "test", log: (line) => lines.push(line) }));
  for (const index of [1, 0]) {
    logger.log("browser", `<launching> chrome --user-data-dir=${profiles[index]} --password=DO_NOT_LOG`);
    logger.log("browser", `<launched> pid=${901 + index}`);
  }
  handles.forEach((handle) => handle.launchComplete());
  logger.log("browser", "[pid=901][err] secret-cookie=DO_NOT_LOG");
  logger.log("browser", "[pid=901] <process did exit: exitCode=9, signal=null>");
  logger.log("browser", "[pid=902] <process did exit: exitCode=0, signal=null>");
  assert(lines.some((line) => line.includes("run=run-0") && line.includes("pid=901") && line.includes("exitCode=9")));
  assert(lines.some((line) => line.includes("run=run-1") && line.includes("pid=902") && line.includes("exitCode=0")));
  assert(!lines.some((line) => line.includes("DO_NOT_LOG") || profiles.some((profile) => line.includes(profile))));
  assert(lines.every((line) => line.length <= 240));
  const handle = beginBrowserProcessDiagnostics({ profilePath: profiles[0], log: () => { throw new Error("sink unavailable"); } });
  assert.doesNotThrow(() => { logger.log("browser", `<launching> chrome --user-data-dir=${profiles[0]}`); logger.log("browser", "<launched> pid=903"); logger.log("browser", "[pid=903] <process did exit: exitCode=0, signal=null>"); });
  handle.launchComplete();
}

async function waitFor(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Browser exit diagnostics did not arrive");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function verifyLive() {
  const { chromium } = require("playwright-core");
  const { pinnedAutomationBrowserPath } = require("../src/bot/automation-browser-path");
  const executablePath = pinnedAutomationBrowserPath();
  assert(executablePath && fs.existsSync(executablePath), "Bundled automation Chrome required for live smoke");
  const tempRoot = path.resolve(os.tmpdir());
  const testRoot = fs.mkdtempSync(path.join(tempRoot, "taager-browser-diag-"));
  const contexts = [];
  const lines = [];
  const testChromium = { launchPersistentContext: (profile, options) => chromium.launchPersistentContext(profile, { ...options, headless: true }) };
  try {
    const launch = (index) => launchPersistentChromeContext(testChromium, path.join(testRoot, `profile-${index}`), { executablePath, runId: `live-${index}`, browserLabel: `smoke-${index}`, log: (line) => lines.push(line) });
    contexts.push(...await Promise.all([launch(0), launch(1)]));
    setBrowserProcessContextCloseReason(contexts[0], "smoke-normal-close");
    await contexts[0].close();
    await waitFor(() => lines.some((line) => line.includes("run=live-0") && line.includes("event=exited")));
    assert(lines.some((line) => line.includes("run=live-0") && line.includes("event=exited exitCode=0") && line.includes("close=smoke-normal-close")));
    const launchLine = lines.find((line) => line.includes("run=live-1") && line.includes("event=launched"));
    assert(launchLine, "Second Chrome process PID must be captured");
    const pid = Number(/pid=(\d+)/.exec(launchLine)[1]);
    process.kill(pid, "SIGKILL"); // Only the isolated Chrome process launched above.
    await waitFor(() => lines.some((line) => line.includes("run=live-1") && line.includes("event=exited")));
    assert(lines.some((line) => line.includes("run=live-1") && line.includes("event=exited") && line.includes("close=none")));
    assert(!lines.some((line) => line.includes(testRoot)));
    lines.filter((line) => line.includes("event=exited")).forEach((line) => console.log(line));
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    const resolved = path.resolve(testRoot);
    assert(resolved.startsWith(tempRoot + path.sep) && path.basename(resolved).startsWith("taager-browser-diag-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

verifyAllowlist();
verifyAlertRetention();
(process.argv.includes("--live") ? verifyLive() : Promise.resolve()).then(() => console.log("Browser process diagnostics checks OK.")).catch((error) => { console.error(error.message); process.exitCode = 1; });
