"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { validateManualReviewScope } = require("../src/main/manual-review-scope");
const { normalizeManualReviewRecoveryOrigin, partitionManualReviewRecoveryRows } = require("../src/bot/manual-review-recovery-source");

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function main() {
  const mainProcessSource = fs.readFileSync(path.resolve(__dirname, "../src/main/main.js"), "utf8");
  const runnerSource = fs.readFileSync(path.resolve(__dirname, "../src/bot/runner.js"), "utf8");
  const guardWiringIndex = mainProcessSource.indexOf("const manualReviewScope = validateManualReviewScope(");
  const accountSelectionIndex = mainProcessSource.indexOf("const allAccounts = savedAccountsForManualReview;", guardWiringIndex);
  assert(guardWiringIndex >= 0 && accountSelectionIndex > guardWiringIndex, "run-bot IPC must validate review scope before account selection");
  assert(mainProcessSource.indexOf("lastExportTimestamp = 0;", guardWiringIndex) > guardWiringIndex, "rejected manual-review requests must not reset run state");
  assert(/manualReviewUploadMode\s*\?\s*\[manualReviewScope\.accountId\]/.test(mainProcessSource), "manual-review IPC must bypass the all-account fallback");
  assert(mainProcessSource.includes("manualReviewOrders: manualReviewUploadMode ? manualReviewUploadRows : []"), "main IPC must pass selected review rows through without replacing source metadata");
  assert(runnerSource.includes("normalizeManualReviewRecoveryOrigin(row, easyOrderUuid)"), "runner must use the tested fail-closed origin normalizer before constructing order routes");
  assert(runnerSource.includes("manualReviewMode: true"), "manual affiliate recovery must activate the fresh Taager duplicate preflight");
  const recoveryFlowSource = fs.readFileSync(path.resolve(__dirname, "../src/bot/easy-orders-affiliate-recovery-flow.js"), "utf8");
  assert(recoveryFlowSource.includes("partitionManualReviewRecoveryRows(prepared)"), "the affiliate recovery flow must use the tested origin partition before real/missed actions");

  const accounts = [{ id: "account-A" }, { id: "account-B" }];
  assert.deepStrictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [{}], accountIds: ["account-A"], accounts }), { ok: true, accountId: "account-A" });
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [{}], accountIds: [], accounts }).error, "MANUAL_REVIEW_ACCOUNT_REQUIRED");
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [{}], accountIds: ["account-A", "account-B"], accounts }).error, "MANUAL_REVIEW_ACCOUNT_REQUIRED");
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [], accountIds: ["account-A"], accounts }).error, "MANUAL_REVIEW_ORDERS_REQUIRED");
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [{}], accountIds: ["other"], accounts }).error, "MANUAL_REVIEW_ACCOUNT_INVALID");
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [{}], accountIds: ["static"], accounts: [{ id: "static", accountType: "static" }] }).error, "MANUAL_REVIEW_ACCOUNT_INVALID");
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [{}], accountIds: ["legacy"], accounts: null }).ok, true);
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: true, rows: [{}], accountIds: ["account-A"], accounts: null }).error, "MANUAL_REVIEW_ACCOUNT_INVALID");
  assert.strictEqual(validateManualReviewScope({ manualReviewMode: false, rows: [], accountIds: [], accounts }).ok, true);

  const executablePath = findChrome();
  assert(executablePath, "Google Chrome is required for the renderer IPC-scope regression test");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="page-results"></div>');
    await page.evaluate(() => {
      window._t = (key) => key;
      window.api = { runBot: async (payload) => { window.runBotPayloads.push(payload); return { success: false, error: "TEST_ONLY_NO_RUN" }; } };
      window.runBotPayloads = [];
      window.renderSharedSidebar = () => "";
      window.wireSharedSidebar = () => {};
      window.saveRunAnalytics = () => {};
      window.console = console;
    });
    await page.addScriptTag({ path: path.resolve(__dirname, "../src/renderer/pages/results.js") });
    await page.evaluate(() => window.renderResults({
      _multiAccount: true,
      _accountResults: ["account-A", "account-B"].map((accountId) => ({
        accountId,
        accountLabel: accountId,
        success: false,
        data: {
          orders: 0,
          failedOrders: { count: 0, summary: [], errorRows: [] },
          skippedOrders: { count: 2, rows: [
            { manualReview: true, source: "real", reason: "needs_review", name: "fixture-1", phone: "1" },
            { manualReview: true, source: "real", reason: "needs_review", name: "fixture-2", phone: "2" },
            { manualReview: true, source: "missed", recoverySource: "missed", destination: "affiliate-recovery", recoveryStatus: "awaiting_taager_verification", reason: "awaiting_taager_verification", name: "pending-accepted-fixture", phone: "5", sku: "SKU-PENDING" },
            { manualReview: true, source: "missed", recoverySource: "missed", destination: "affiliate-recovery", actionStatus: "converted", reason: "old-result-fixture", name: "legacy-converted-fixture", phone: "6", sku: "SKU-LEGACY" },
          ] },
          affiliateRecovery: accountId === "account-A" ? {
            enabled: true,
            attemptedCount: 1,
            blockedReviewRows: [
              { source: "real", recoverySource: "real", easyOrderUuid: "fixture-real", reason: "blocked", name: "affiliate-real-fixture", phone: "3" },
              { source: "missed", recoverySource: "missed", easyOrderUuid: "fixture-missed", reason: "blocked", name: "affiliate-missed-fixture", phone: "4" },
            ],
          } : undefined,
        },
      })),
    }, "2026-10-01", "2026-10-18", () => {}, () => {}));

    // Account B starts with an independent, empty selection.
    await page.evaluate(() => window._resSelectPane("account-B"));
    const accountBTable = page.locator("[data-manual-table]").first();
    assert.strictEqual(await accountBTable.count(), 1, "account B pane should render its own review table");
    assert.strictEqual(await accountBTable.locator("[data-manual-select]:checked").count(), 0);

    // Account A's table includes two cart rows and an affiliate blocked-review
    // row merged from the recovery result. The mocked API cannot run the bot.
    await page.evaluate(() => window._resSelectPane("account-A"));
    const table = page.locator("[data-manual-table]").first();
    assert.strictEqual(await table.count(), 1, "account A pane should render its Needs Review table");
    const tableId = await table.getAttribute("data-manual-table");
    assert.strictEqual(await table.locator("[data-manual-select]").count(), 4, "A should include its cart rows and merged affiliate rows, but not accepted pending actions");
    const pendingRow = table.locator('tr[data-manual-row="0"]').filter({ hasText: "pending-accepted-fixture" });
    assert.strictEqual(await pendingRow.count(), 1, "pending accepted action remains visible in the skipped/status table");
    assert.strictEqual(await pendingRow.locator("[data-manual-select]").count(), 0, "pending accepted action must not be selectable for another Convert/Resend");
    const legacyConvertedRow = table.locator('tr[data-manual-row="0"]').filter({ hasText: "legacy-converted-fixture" });
    assert.strictEqual(await legacyConvertedRow.count(), 1, "legacy converted result remains visible");
    assert.strictEqual(await legacyConvertedRow.locator("[data-manual-select]").count(), 0, "legacy accepted markers must also remain non-actionable");
    await table.locator("[data-manual-select]").nth(0).check();
    await table.locator("[data-manual-select]").nth(1).check();
    await table.locator("[data-manual-select]").nth(2).check();
    await table.locator("[data-manual-select]").nth(3).check();
    await page.evaluate(async (id) => window._resStartManualReviewUpload(id, "cart"), tableId);
    await page.evaluate(async (id) => window._resStartManualReviewUpload(id, "affiliate-recovery"), tableId);
    const payloads = await page.evaluate(() => window.runBotPayloads);
    assert.strictEqual(payloads.length, 2);
    assert.deepStrictEqual(payloads[0].accountIds, ["account-A"]);
    assert.strictEqual(payloads[0].manualReviewOrders.length, 2, "both selected rows in A should be sent");
    assert(payloads[0].manualReviewOrders.every((row) => row.destination !== "affiliate-recovery"));
    assert.strictEqual(payloads[0].manualReviewMode, true);
    assert.deepStrictEqual(payloads[1].accountIds, ["account-A"]);
    assert.strictEqual(payloads[1].manualReviewOrders.length, 2, "merged affiliate review rows should be selectable in their own destination");
    assert(payloads[1].manualReviewOrders.every((row) => row.destination === "affiliate-recovery"));
    assert.strictEqual(payloads[1].easyOrdersAffiliateRecoveryEnabled, true);

    const partitioned = partitionManualReviewRecoveryRows(payloads[1].manualReviewOrders);
    assert.deepStrictEqual(partitioned.real.map((row) => row.name), ["affiliate-real-fixture"]);
    assert.deepStrictEqual(partitioned.missed.map((row) => row.name), ["affiliate-missed-fixture"]);
    assert.strictEqual(partitioned.missed[0].destination, "affiliate-recovery", "destination must not replace the missed source");
    assert.strictEqual(partitioned.real[0].recoverySource, "real");
    assert.strictEqual(partitioned.missed[0].recoverySource, "missed");
    assert.strictEqual(partitioned.real[0].detailUrl, "https://app.easy-orders.net/#/orders/fixture-real");
    assert.strictEqual(partitioned.missed[0].detailUrl, "https://app.easy-orders.net/#/missed-orders/fixture-missed");
    assert.throws(() => normalizeManualReviewRecoveryOrigin({ source: "missed", detailUrl: "#/orders/fixture" }), /MANUAL_REVIEW_RECOVERY_DETAIL_URL_SOURCE_CONFLICT/);
    assert.throws(() => normalizeManualReviewRecoveryOrigin({ source: "real", detailUrl: "https://example.com/#/orders/fixture" }), /MANUAL_REVIEW_RECOVERY_DETAIL_URL_INVALID/);
    assert.deepStrictEqual(partitionManualReviewRecoveryRows([{ source: "missed", recoverySource: "affiliate-recovery" }]).missed.length, 1, "explicit origin survives an old clobbered destination marker");
    assert.throws(() => partitionManualReviewRecoveryRows([{ source: "missed", recoverySource: "real" }]), /MANUAL_REVIEW_RECOVERY_SOURCE_CONFLICT/);
    assert.throws(() => partitionManualReviewRecoveryRows([{ destination: "affiliate-recovery", recoverySource: "affiliate-recovery" }]), /MANUAL_REVIEW_RECOVERY_SOURCE_REQUIRED/);

    // Missing identity on a multi-account result fails closed before IPC,
    // even when the table has a selected row.
    await page.evaluate((id) => { window._resManualReviewTableAccounts[id] = ""; }, tableId);
    await page.evaluate(async (id) => window._resStartManualReviewUpload(id, "cart"), tableId);
    assert.strictEqual(await page.evaluate(() => window.runBotPayloads.length), 2, "missing account scope must not invoke runBot");
  } finally {
    await browser.close();
  }
}

main().then(() => process.stdout.write("manual-review-scope.test.js: PASS\n"), (error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
