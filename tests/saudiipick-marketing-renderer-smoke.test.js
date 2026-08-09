"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const rendererPath = path.join(root, "src", "renderer", "pages", "dashboard", "sections", "section-saudiipick-marketing-hydrated.js");
const rendererCode = fs.readFileSync(rendererPath, "utf8");

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function settleAll() {
  for (let index = 0; index < 8; index += 1) await settle();
}

function createElement(attrs = {}) {
  const listeners = {};
  return {
    value: "",
    checked: false,
    listeners,
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    closest() {
      return null;
    },
    getAttribute(name) {
      return attrs[name] || "";
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    focus() {},
    setSelectionRange() {},
  };
}

function createMount() {
  const saveButton = createElement();
  const tokenInput = createElement();
  const htmlWrites = [];
  return {
    saveButton,
    tokenInput,
    htmlWrites,
    mount: {
      get innerHTML() {
        return htmlWrites[htmlWrites.length - 1] || "";
      },
      set innerHTML(value) {
        htmlWrites.push(String(value || ""));
      },
      querySelector(selector) {
        if (selector === "[data-sip-save-token]") return saveButton;
        if (selector === "[data-sip-token-input]") return tokenInput;
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
  };
}

async function trapUnhandled(work) {
  let unhandled = null;
  function onUnhandled(reason) {
    unhandled = reason;
  }
  process.on("unhandledRejection", onUnhandled);
  try {
    await work();
    await settleAll();
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
  if (unhandled) throw unhandled;
}

function makeScenario(saveTokenResult, statusFactory, options = {}) {
  const { mount, saveButton, tokenInput, htmlWrites } = createMount();
  const statusCalls = [];
  const storeWrites = [];
  const storeData = Object.assign(Object.create(null), options.initialStore || {});
  const context = vm.createContext({
    console,
    setImmediate,
    window: {
      dashboardI18n: {
        pick(en) { return en; },
        locale() { return "en-US"; },
      },
      DashboardMarketingState: {
        get(accountId, platformId) {
          return storeData[accountId + "|" + platformId] || null;
        },
        set(payload, accountId, platformId) {
          storeWrites.push({ payload, accountId, platformId });
          storeData[accountId + "|" + platformId] = payload;
        },
      },
      DashboardRoiState: {
        get() { return { currency: "SAR" }; },
        notify() {},
      },
      getActiveAccountId() { return "account-1"; },
      api: {
        getSaudiIPickMarketingTokenStatus() {
          return Promise.resolve(options.tokenStatus || { configured: false, tokenPreview: "", connectUrl: "https://saudiipick.com/dashboard/settings" });
        },
        saveSaudiIPickMarketingToken(token) {
          assert.match(token, /^sipdt_/);
          return Promise.resolve(saveTokenResult);
        },
        getSaudiIPickMarketingStatus(accountId, platformId, options) {
          statusCalls.push({ accountId, platformId, options });
          if (typeof statusFactory === "function") return Promise.resolve(statusFactory({ accountId, platformId, options }));
          return Promise.resolve({
            ok: true,
            availableAccounts: [{ id: platformId + "-ad-1", name: platformId + " account", currency: "SAR" }],
            selectedSourceAccounts: [{ id: platformId + "-ad-1", name: platformId + " account", currency: "SAR" }],
            mappedAccounts: [{ id: platformId + "-ad-1", name: platformId + " account", currency: "SAR" }],
            summary: { adSpend: 10, currency: "SAR", purchases: 1, purchaseValue: 20, roas: 2, campaignCount: 1 },
          });
        },
        openExternalUrl() {},
      },
    },
  });

  new vm.Script(rendererCode, { filename: rendererPath }).runInContext(context);
  context.window.renderSectionSaudiIPickMarketingHydratedEntry(mount, {}, { data: { meta: { activeAccountId: "account-1", accountOptions: [{ id: "account-1", label: "Account 1" }] } } });

  return { saveButton, tokenInput, htmlWrites, statusCalls, storeWrites };
}

async function runValidTokenSmoke() {
  const scenario = makeScenario({ ok: true, tokenPreview: "sipdt_abc..." });
  await settleAll();
  scenario.tokenInput.value = "sipdt_valid_token";
  await trapUnhandled(async () => {
    scenario.saveButton.listeners.click();
  });

  assert.deepStrictEqual(scenario.statusCalls.map((call) => call.platformId), ["snapchat", "tiktok"]);
  assert.ok(scenario.statusCalls.every((call) => call.accountId === "account-1"));
  assert.ok(scenario.statusCalls.every((call) => call.options && call.options.mode === "force"));

  const writtenPlatforms = scenario.storeWrites.map((write) => write.platformId).sort();
  assert.deepStrictEqual(writtenPlatforms, ["snapchat", "tiktok"]);
  assert.ok(scenario.storeWrites.every((write) => write.payload.provider === "saudiipick"));
  assert.ok(scenario.storeWrites.every((write) => write.payload.platform === write.platformId));
}

async function runInvalidTokenSmoke() {
  const scenario = makeScenario({ ok: false, error: "INVALID_SAUDIIPICK_TOKEN" });
  await settleAll();
  scenario.tokenInput.value = "sipdt_invalid_token";
  await trapUnhandled(async () => {
    scenario.saveButton.listeners.click();
  });

  assert.deepStrictEqual(scenario.statusCalls, []);
  assert.deepStrictEqual(scenario.storeWrites, []);
  assert.ok(scenario.htmlWrites.some((html) => html.includes("INVALID_SAUDIIPICK_TOKEN")), "invalid token error should be rendered inline");
}

async function runAccountHealthSmoke() {
  const scenario = makeScenario({ ok: true, tokenPreview: "sipdt_abc..." }, ({ platformId }) => ({
    ok: true,
    availableAccounts: [{ id: platformId + "-ad-1", name: platformId + " account", currency: "USD" }],
    selectedSourceAccounts: [{ id: platformId + "-ad-1", name: platformId + " account", currency: "USD" }],
    mappedAccounts: [{ id: platformId + "-ad-1", name: platformId + " account", currency: "USD" }],
    summary: { adSpend: 0, currency: "USD", purchases: 0, purchaseValue: 0, roas: 0, campaignCount: 0 },
    partial: true,
    accountErrors: [{
      accountId: platformId + "-ad-2",
      endpoint: "connection",
      error: "needs_reconnect",
      errorDescription: "Reconnect this advertiser.",
      connectionStatus: "disconnected",
      connectionHealth: { state: "disconnected", status: "disconnected", usable: false, message: "Reconnect this advertiser." },
    }],
    errors: [{
      accountId: platformId + "-ad-2",
      endpoint: "connection",
      error: "needs_reconnect",
      errorDescription: "Reconnect this advertiser.",
      connectionStatus: "disconnected",
      connectionHealth: { state: "disconnected", status: "disconnected", usable: false, message: "Reconnect this advertiser." },
    }],
  }));
  await settleAll();
  scenario.tokenInput.value = "sipdt_valid_token";
  await trapUnhandled(async () => {
    scenario.saveButton.listeners.click();
  });

  assert.ok(scenario.htmlWrites.some((html) => html.includes("Reconnect this advertiser.") && html.includes("disconnected")), "account health reconnect message should be rendered inline");
  assert.ok(scenario.storeWrites.some((write) => Array.isArray(write.payload.accountErrors) && write.payload.accountErrors.length === 1), "accountErrors should be stored");
}

async function runSavedMappingFallbackSmoke() {
  const mappedSource = { id: "tiktok-ad-1", name: "TikTok mapped account", currency: "USD" };
  const scenario = makeScenario({ ok: true, tokenPreview: "sipdt_abc..." }, ({ platformId }) => ({
    ok: true,
    availableAccounts: [{ id: platformId + "-ad-1", name: platformId + " account", currency: platformId === "tiktok" ? "USD" : "SAR" }],
    selectedSourceAccounts: [],
    mappedAccounts: [],
    mappings: {},
    summary: null,
  }), {
    tokenStatus: { configured: true, tokenPreview: "sipdt_saved...", connectUrl: "https://saudiipick.com/dashboard/settings" },
    initialStore: {
      "account-1|tiktok": {
        ok: true,
        provider: "saudiipick",
        platform: "tiktok",
        status: "connected",
        availableAccounts: [mappedSource],
        mappings: { "account-1": [mappedSource] },
      },
    },
  });

  await settleAll();

  const tiktokWrite = scenario.storeWrites.slice().reverse().find((write) => write.platformId === "tiktok");
  assert.ok(tiktokWrite, "TikTok status should be written after saved-token refresh");
  assert.deepStrictEqual(tiktokWrite.payload.selectedSourceAccountIds, ["tiktok-ad-1"]);
  assert.strictEqual(tiktokWrite.payload.mappings["account-1"][0].id, "tiktok-ad-1");
  assert.ok(scenario.htmlWrites.some((html) => html.includes("1 assigned")), "saved mapping should render as assigned");
}

(async () => {
  await runValidTokenSmoke();
  await runInvalidTokenSmoke();
  await runAccountHealthSmoke();
  await runSavedMappingFallbackSmoke();
  console.log("[PASS] Saudi iPick renderer token save refresh smoke tests");
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
