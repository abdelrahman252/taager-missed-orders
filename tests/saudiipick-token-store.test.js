"use strict";

const assert = require("assert");
const { createSaudiIPickTokenRepository } = require("../src/main/saudiipick-token-store");

function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); },
    delete(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

const dashboardStore = memoryStore({ "saudiIPickMarketing.desktopToken": "sipdt_migrated-token" });
const tokenStore = memoryStore();
let tokens = createSaudiIPickTokenRepository({ tokenStore, legacyStore: dashboardStore });
assert.strictEqual(tokens.get(), "sipdt_migrated-token", "the old dashboard token should migrate on startup");
assert.strictEqual(dashboardStore.get("saudiIPickMarketing.desktopToken", ""), "", "migration should remove the legacy copy");

// A normal cache reset clears dashboard data, while the dedicated token store survives.
dashboardStore.clear();
tokens = createSaudiIPickTokenRepository({ tokenStore, legacyStore: dashboardStore });
assert.strictEqual(tokens.get(), "sipdt_migrated-token", "resetting dashboard cache should preserve the saved token");

assert.deepStrictEqual(tokens.save("not-a-token"), { ok: false, error: "INVALID_SAUDIIPICK_TOKEN" });
assert.strictEqual(tokens.get(), "sipdt_migrated-token", "a rejected save must not overwrite the valid token");
assert.deepStrictEqual(tokens.save(" sipdt_new-token "), { ok: true, configured: true });
tokens = createSaudiIPickTokenRepository({ tokenStore, legacyStore: dashboardStore });
assert.strictEqual(tokens.get(), "sipdt_new-token", "the token should remain available after repository rehydration");

const throwingTokenStore = {
  get(key, fallback) { return key === "desktopToken" ? "sipdt_existing" : fallback; },
  set() { throw new Error("disk write failed"); },
  delete() {},
};
const resilientTokens = createSaudiIPickTokenRepository({ tokenStore: throwingTokenStore, legacyStore: memoryStore() });
assert.throws(() => resilientTokens.save("sipdt_replacement"), /disk write failed/, "storage errors should be reported to the renderer");
assert.strictEqual(resilientTokens.get(), "sipdt_existing", "a storage failure must leave the previous token available");

tokens.clear();
assert.strictEqual(tokens.get(), "", "explicit clear should remove the token");
tokenStore.clear(); // Full force-flush clears the dedicated store.
assert.strictEqual(createSaudiIPickTokenRepository({ tokenStore, legacyStore: dashboardStore }).get(), "", "full flush should clear the saved token");

const legacyOnDisk = memoryStore({ "saudiIPickMarketing.desktopToken": "sipdt_retry-migration" });
let failedWritesRemaining = 2;
const intermittentStore = {
  ...memoryStore(),
  get(key, fallback) { return this.inner.get(key, fallback); },
  set(key, value) {
    if (failedWritesRemaining > 0) { failedWritesRemaining -= 1; throw new Error("temporary disk write failure"); }
    this.inner.set(key, value);
  },
  delete(key) { this.inner.delete(key); },
  inner: memoryStore(),
};
tokens = createSaudiIPickTokenRepository({ tokenStore: intermittentStore, legacyStore: legacyOnDisk });
assert.strictEqual(tokens.get(), "sipdt_retry-migration", "a failed migration write must not hide the legacy token");
assert.strictEqual(legacyOnDisk.get("saudiIPickMarketing.desktopToken", ""), "sipdt_retry-migration", "failed migration must retain the source value");
assert.strictEqual(tokens.get(), "sipdt_retry-migration", "migration should retry after storage becomes available");
assert.strictEqual(intermittentStore.get("desktopToken", ""), "sipdt_retry-migration", "retry should persist the token into the dedicated store");
assert.strictEqual(legacyOnDisk.get("saudiIPickMarketing.desktopToken", ""), "", "successful retry should remove the legacy copy");
tokens.clear();
assert.strictEqual(tokens.get(), "", "clear after a migration retry must not resurrect the fallback token");

const legacyBeforeClear = memoryStore({ "saudiIPickMarketing.desktopToken": "sipdt_clear-legacy" });
const alwaysFailingStore = {
  get(key, fallback) { return fallback; },
  set() { throw new Error("persistent write failure"); },
  delete() {},
};
const pendingMigration = createSaudiIPickTokenRepository({ tokenStore: alwaysFailingStore, legacyStore: legacyBeforeClear });
assert.strictEqual(pendingMigration.get(), "sipdt_clear-legacy", "fallback should stay usable while migration cannot write");
pendingMigration.clear();
assert.strictEqual(pendingMigration.get(), "", "clear during a failed migration should clear the fallback");
assert.strictEqual(legacyBeforeClear.get("saudiIPickMarketing.desktopToken", ""), "", "clear should remove the legacy token too");

console.log("[PASS] Saudi iPick desktop token migration and persistence tests");
