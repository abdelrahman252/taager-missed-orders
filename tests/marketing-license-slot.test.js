"use strict";

const assert = require("assert");
const { resolveMarketingLicenseSlot } = require("../src/main/marketing-license-slot");

function row(overrides = {}) {
  return {
    account_hash: "server-slot-1",
    easy_email: "owner@example.com",
    easy_store: "My Store",
    taager_email: "merchant@example.com",
    taager_phone: "",
    taager_login_method: "email",
    unlocked: true,
    ...overrides,
  };
}

function resolve(rows, overrides = {}) {
  return resolveMarketingLicenseSlot(rows, {
    computedHash: "new-local-hash",
    cmsEmail: "owner@example.com",
    cmsStore: "My Store",
    loginMethod: "email",
    loginIdentity: "merchant@example.com",
    loginPhone: "",
    ...overrides,
  });
}

// A regenerated local id changes the computed hash; preserve the unique server slot by identity.
assert.deepStrictEqual(resolve([row()]), {
  ok: true, accountHash: "server-slot-1", reason: "identity_match",
});

// Enrichment with a merchant id still recognizes a legacy row containing the login email.
assert.strictEqual(resolve([row()], { merchantIdentity: "sa:abc_123" }).accountHash, "server-slot-1");

// Once the server row contains a merchant identity, only that exact merchant may match.
assert.strictEqual(resolve([row({ taager_email: "sa:abc_123" })], {
  merchantIdentity: "sa:different",
}).reason, "dashboard_account_not_licensed");

// Populated CMS identities must agree; matching Taager login alone is insufficient.
assert.strictEqual(resolve([row()], { cmsEmail: "other@example.com" }).reason, "dashboard_account_not_licensed");

// Never choose a row when identity fields point to multiple license slots.
assert.strictEqual(resolve([row(), row({ account_hash: "server-slot-2" })]).reason, "dashboard_account_ambiguous");

// A phone login with an empty phone cannot accidentally match an empty database phone.
assert.strictEqual(resolve([row({ taager_email: "", taager_phone: "", taager_login_method: "phone" })], {
  loginMethod: "phone", loginIdentity: "", loginPhone: "",
}).reason, "dashboard_account_not_licensed");

// The caller-validated cached hash wins even if the current local id generated another hash.
assert.deepStrictEqual(resolve([row({ account_hash: "cached-server-hash" })], {
  cachedHash: "cached-server-hash",
}), { ok: true, accountHash: "cached-server-hash", reason: "cached_hash" });

// An exact current hash remains valid when identity/limit-related fields changed.
assert.deepStrictEqual(resolve([row({ account_hash: "new-local-hash", unlocked: false })], {
  cmsEmail: "changed@example.com",
}), { ok: true, accountHash: "new-local-hash", reason: "computed_hash" });

// Phone fallback delegates country normalization to the caller and requires a real value.
const phoneRows = [row({ taager_email: "", taager_phone: "+966 55 123 4567", taager_login_method: "phone" })];
assert.strictEqual(resolve(phoneRows, {
  loginMethod: "phone", loginPhone: "0551234567", loginIdentity: "",
  normalizePhone: value => String(value || "").replace(/\D/g, "").replace(/^966/, "0"),
}).accountHash, "server-slot-1");

async function verifyRpcRecovery() {
  const fs = require("fs");
  const path = require("path");
  const vm = require("vm");
  const source = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8");
  const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  const account = { id: "client-account", localHash: "new-local-hash", taagerEmail: "merchant@example.com", easyEmail: "owner@example.com", easyStore: "My Store", taagerAffiliateCode: "abc_123" };
  const calls = [];
  let licensedRows = [row()];
  const sandbox = {
    require: name => { assert.strictEqual(name, "./marketing-license-slot"); return { resolveMarketingLicenseSlot }; },
    getStoredAccountById: () => account,
    accountHash: value => value.localHash,
    accountIdentityKey: () => "current-identity",
    marketingStableAccountKey: () => "unused",
    licenseStore: { get: () => "TEST-LICENSE" },
    store: { get: () => "" },
    cmsEmailOf: value => value.easyEmail,
    licenseEasyStoreOf: value => value.easyStore,
    taagerMerchantIdentityOf: () => "sa:abc_123",
    taagerLoginMethodOf: () => "email",
    normalizePhone: value => String(value || "").replace(/\D/g, ""),
    _getOrCreateMachineUUID: () => "machine", getDeviceFingerprint: () => "device",
    log: { info() {}, error() {} },
    supabaseRpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "taager_get_license_accounts") return licensedRows;
      assert.strictEqual(name, "taager_saudiipick_marketing_state");
      if (payload.p_dashboard_account_id === "server-slot-1") return { ok: true, used: 2, limit: 4, mappedAccounts: [{ id: "ad-1" }, { id: "ad-2" }] };
      return { ok: false, reason: "dashboard_account_not_licensed" };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(extract("const saudiIPickQuotaSlotAliases", "function marketingAccountLookupKeys(") + extract("async function saudiIPickMarketingUsage(", "function saudiIPickMappingMigrationKey("), sandbox);
  const result = await sandbox.saudiIPickMarketingUsage(account.id, "tiktok", [{ id: "ad-1" }, { id: "ad-2" }]);
  assert(result.ok && result.limit === 4 && result.used === 2);
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[2].payload.p_dashboard_account_id, "server-slot-1");
  assert.strictEqual(calls[2].payload.p_source_accounts.length, 2);
  assert.strictEqual(calls[2].payload.p_license_key, "TEST-LICENSE");
  await sandbox.saudiIPickMarketingUsage(account.id, "snapchat");
  assert.strictEqual(calls.length, 4, "Resolved slot reused for the other platform");
  // A genuinely different account cannot inherit the prior account's slot.
  account.localHash = "other-local-hash";
  account.taagerEmail = "different@example.com";
  const denied = await sandbox.saudiIPickMarketingUsage(account.id, "tiktok");
  assert.strictEqual(denied.reason, "dashboard_account_not_licensed");
  assert.strictEqual(calls.length, 6, "Unmatched account must not retry against another slot");
  licensedRows = [row(), row({ account_hash: "other-server-slot" })];
  account.taagerEmail = "merchant@example.com";
  const ambiguous = await sandbox.saudiIPickMarketingUsage(account.id, "tiktok");
  assert.strictEqual(ambiguous.reason, "dashboard_account_ambiguous");
}

verifyRpcRecovery().then(() => console.log("marketing-license-slot tests passed")).catch(error => { console.error(error); process.exitCode = 1; });
