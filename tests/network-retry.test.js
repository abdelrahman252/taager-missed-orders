"use strict";

const assert = require("assert");
const { isRetryableNetworkError } = require("../src/bot/network-retry");

const retryableMessages = [
  "apiRequestContext.get: connect ETIMEDOUT 5.101.109.44:443",
  "net::ERR_TIMED_OUT at https://example.com",
  "read ECONNRESET",
  "connect ECONNREFUSED 127.0.0.1:443",
  "getaddrinfo ENOTFOUND easyorders.fra1.digitaloceanspaces.com",
  "getaddrinfo EAI_AGAIN api.easy-orders.net",
  "socket hang up",
  "TLS handshake timeout",
  new Error("Navigation failed because page timeout exceeded"),
];

for (const message of retryableMessages) {
  assert.strictEqual(isRetryableNetworkError(message), true, `expected retryable: ${message}`);
}

const nonRetryableMessages = [
  "Strict mode violation",
  "Expected selector to be visible",
  "Order button not available",
  "HTTP 422 validation failed",
];

for (const message of nonRetryableMessages) {
  assert.strictEqual(isRetryableNetworkError(message), false, `expected non-retryable: ${message}`);
}

console.log("network-retry tests passed");
