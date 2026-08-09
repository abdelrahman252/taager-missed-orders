"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const mainPath = path.join(root, "src", "main", "main.js");
const mainCode = fs.readFileSync(mainPath, "utf8");
const start = mainCode.indexOf("function normalizeNativeSourceAccount");
const end = mainCode.indexOf("function mergeNativeMarketingMappings", start);

assert.ok(start >= 0, "normalizeNativeSourceAccount should exist");
assert.ok(end > start, "mergeNativeMarketingMappings should follow native normalizers");

const context = vm.createContext({ result: null });
vm.runInContext(mainCode.slice(start, end), context, { filename: mainPath });

const summary = {
  adSpend: 3625.3,
  currency: "MIXED",
  sourceCurrency: "MIXED",
  currencyMixed: true,
  rawSpendByCurrency: {
    SAR: 776.85,
    USD: 2848.45,
  },
  sourceBreakdown: [
    {
      sourceAccountId: "7570733852746904417",
      sourceAccountName: "sponsor|1944783|ksa|",
      rawSpend: 776.85,
      rawCurrency: "SAR",
      currency: "SAR",
    },
    {
      sourceAccountId: "7647496535713103890",
      sourceAccountName: "Sponser|1944783|ksa|",
      rawSpend: 2848.45,
      rawCurrency: "USD",
      currency: "USD",
    },
  ],
  campaignBreakdown: [
    {
      campaignId: "egp-campaign",
      sourceAccountId: "7570733852746904417",
      rawSpend: 776.85,
      rawCurrency: "SAR",
      currency: "SAR",
    },
    {
      campaignId: "usd-campaign",
      sourceAccountId: "7647496535713103890",
      rawSpend: 2848.45,
      rawCurrency: "USD",
      currency: "USD",
    },
  ],
};

const selectedAccounts = [
  {
    id: "7647496535713103890",
    name: "Sponser|1944783|ksa|",
    currency: "USD",
  },
  {
    id: "7570733852746904417",
    name: "sponsor|1944783|ksa|",
    currency: "EGP",
  },
];

context.summary = summary;
context.selectedAccounts = selectedAccounts;
vm.runInContext("result = normalizeNativeMarketingSummary(summary, selectedAccounts, 'account-1', 'tiktok')", context);

assert.equal(context.result.currency, "MIXED");
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.result.rawSpendByCurrency)), {
  EGP: 776.85,
  USD: 2848.45,
});
assert.equal(context.result.sourceBreakdown[0].rawCurrency, "EGP");
assert.equal(context.result.campaignBreakdown[0].rawCurrency, "EGP");
assert.ok(!Object.prototype.hasOwnProperty.call(context.result.rawSpendByCurrency, "SAR"));


context.duplicateHealthResult = {
  ok: true,
  selectedSourceAccounts: [{ id: "7647496535713103890", name: "Sponser|1944783|ksa|", currency: "USD", usable: true }],
  summary: {
    adSpend: 265.99,
    currency: "USD",
    sourceBreakdown: [{ sourceAccountId: "7647496535713103890", rawSpend: 265.99, rawCurrency: "USD" }],
    campaignBreakdown: [{ campaignId: "campaign-1", sourceAccountId: "7647496535713103890", rawSpend: 78.83, rawCurrency: "USD" }],
  },
  partial: true,
  accountHealth: [
    { id: "7647496535713103890", usable: false, error: "disconnected", connectionStatus: "disconnected" },
    { id: "7647496535713103890", usable: true, connectionStatus: "connected" },
  ],
  accountErrors: [{ accountId: "7647496535713103890", endpoint: "connection", error: "disconnected", errorDescription: "Reconnect this advertiser." }],
  errors: [{ accountId: "7647496535713103890", endpoint: "connection", error: "disconnected", errorDescription: "Reconnect this advertiser." }],
};
vm.runInContext("result = nativeMarketingSanitizeAccountHealth(duplicateHealthResult)", context);
assert.equal(context.result.partial, false);
assert.deepStrictEqual(context.result.accountErrors, []);
assert.deepStrictEqual(context.result.errors, []);
assert.equal(context.result.accountHealth.length, 1);
assert.equal(context.result.accountHealth[0].usable, true);
console.log("[PASS] Saudi iPick native marketing mixed-currency normalization");