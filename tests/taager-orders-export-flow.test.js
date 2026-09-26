"use strict";

const assert = require("assert");
const { createTaagerOrdersExportFlow } = require("../src/bot/taager-orders-export-flow");

const workbook = () => Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

function page() {
  return {
    context: () => ({ cookies: async () => [] }),
    waitForTimeout: async () => {},
    waitForEvent: async () => ({ url: () => "https://taager.test/orders.xlsx" }),
  };
}

function options(overrides = {}) {
  return {
    formatDataDay: (value) => value.toISOString().slice(0, 10),
    clearTaagerInterruption: async () => {},
    waitForTaagerTarget: async () => {},
    safeTaagerClick: async () => {},
    pickDateRange: async () => ({}),
    gotoOrders: async (current) => current,
    recoverForRetry: async (current) => current,
    readDownloadToBuffer: async () => workbook(),
    maxAttempts: 2,
    searchButtonSelector: "#search",
    searchEnabledSelector: "#search:not([disabled])",
    exportButtonSelector: "#export",
    ...overrides,
  };
}

(async () => {
  const activePage = page();
  let navigationAttempts = 0;
  const stages = [];
  const flow = createTaagerOrdersExportFlow(options({
    emitStage: (entry) => stages.push(entry),
    gotoOrders: async () => {
      navigationAttempts += 1;
      if (navigationAttempts === 1) throw new Error("TAAGER_TARGET_TIMEOUT: controls missing");
      return activePage;
    },
    recoverForRetry: async () => {
      throw new Error("TAAGER_TARGET_TIMEOUT: recovery page not ready");
    },
  }));

  const result = await flow.exportOrders(activePage, new Date("2026-09-01"), new Date("2026-09-02"));
  assert.deepStrictEqual(result, workbook());
  assert.strictEqual(navigationAttempts, 2, "a recovery readiness timeout must not consume the remaining export attempt");
  assert(stages.some((entry) => entry.stage === "taager.orders.recovery" && entry.status === "warning"));

  const invalidFlow = createTaagerOrdersExportFlow(options({
    maxAttempts: 1,
    readDownloadToBuffer: async () => Buffer.from("<html>login</html>"),
  }));
  await assert.rejects(
    invalidFlow.exportOrders(activePage, new Date("2026-09-01"), new Date("2026-09-02")),
    /TAAGER_DOWNLOAD_FAILED:.*TAAGER_DOWNLOAD_INVALID/,
    "an HTML/login response must never be reported as a successful workbook download"
  );

  const uiNotReadyFlow = createTaagerOrdersExportFlow(options({
    maxAttempts: 1,
    waitForTaagerTarget: async () => {
      throw new Error("TAAGER_TARGET_TIMEOUT: Taager orders page ready was not visible");
    },
  }));
  await assert.rejects(
    uiNotReadyFlow.exportOrders(activePage, new Date("2026-09-01"), new Date("2026-09-02")),
    /TAAGER_UI_NOT_READY:.*TAAGER_TARGET_TIMEOUT/,
    "a missing orders-page control must not be mislabeled as a network outage"
  );

  console.log("Taager orders export flow tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
