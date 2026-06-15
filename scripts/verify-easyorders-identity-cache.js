"use strict";

const assert = require("assert");
const { createEasyOrdersExportFlow } = require("../src/bot/easy-orders-export");

function createMockPage(expectedIdentity) {
  let currentUrl = "https://app.easy-orders.net/#/orders";
  let authDomPresent = true;
  let identityReads = 0;

  const locator = {
    first() {
      return this;
    },
    async count() {
      return 1;
    },
    async click() {
      return true;
    },
  };

  return {
    url() {
      return currentUrl;
    },
    async goto(url) {
      currentUrl = url;
    },
    async waitForTimeout() {},
    async $(selector) {
      return authDomPresent ? { selector } : null;
    },
    locator() {
      return locator;
    },
    keyboard: {
      async press() {},
    },
    async evaluate(fn) {
      if (fn.name === "parseEasyOrdersIdentityFromDocument") {
        identityReads++;
        return expectedIdentity;
      }

      const source = String(fn);
      if (source.includes("otpInputs")) return false;
      if (source.includes("documentLanguage")) {
        return { label: "en", documentLanguage: "en" };
      }
      throw new Error(`Unexpected page.evaluate call: ${source.slice(0, 80)}`);
    },
    setUrl(url) {
      currentUrl = url;
    },
    setAuthDomPresent(value) {
      authDomPresent = value;
    },
    getIdentityReads() {
      return identityReads;
    },
  };
}

async function expectReject(promise, pattern) {
  await assert.rejects(promise, pattern);
}

async function main() {
  const config = {
    easyEmail: "owner@example.com",
    easyPassword: "secret",
    easyStore: "Main Store",
  };
  const logs = [];
  const page = createMockPage({
    email: "owner@example.com",
    store: "main store",
    source: "account-popover-header",
  });
  const flow = createEasyOrdersExportFlow({
    config,
    log: (message) => logs.push(message),
  });

  await flow.login(page);
  assert.strictEqual(page.getIdentityReads(), 1, "login should verify identity once");

  await flow.assertSession(page);
  await flow.assertSession(page);
  assert.strictEqual(page.getIdentityReads(), 1, "valid session checks should reuse the identity cache");

  page.setUrl("https://app.easy-orders.net/#/login");
  await expectReject(flow.assertSession(page), /SESSION_EXPIRED/);
  page.setUrl("https://app.easy-orders.net/#/orders");
  await flow.assertSession(page);
  assert.strictEqual(page.getIdentityReads(), 2, "login-page detection should invalidate the cache");

  page.setAuthDomPresent(false);
  await expectReject(flow.assertSession(page), /SESSION_UNVERIFIED/);
  page.setAuthDomPresent(true);
  await flow.assertSession(page);
  assert.strictEqual(page.getIdentityReads(), 3, "missing authenticated DOM should invalidate the cache");

  page.setUrl("https://app.easy-orders.net/#/store-selection");
  await expectReject(flow.assertSession(page), /SESSION_STORE_SELECTION/);
  page.setUrl("https://app.easy-orders.net/#/orders");
  await flow.assertSession(page);
  assert.strictEqual(page.getIdentityReads(), 4, "store selection should invalidate the cache");

  assert(
    logs.some((message) => message.includes("skipping repeated identity check")),
    "cache reuse should be visible in the bot log"
  );

  console.log("EasyOrders identity cache verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
