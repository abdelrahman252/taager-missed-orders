"use strict";

function isRetryableNetworkError(error) {
  const message = String(error && error.message || error || "").toLowerCase();
  const explicitNetworkSignals = [
    "etimedout",
    "err_timed_out",
    "err_connection",
    "econnreset",
    "econnrefused",
    "enotfound",
    "eai_again",
    "socket hang up",
    "tls handshake timeout",
    "interrupted by another navigation",
    "navigation is interrupted",
    "net::",
  ];
  if (explicitNetworkSignals.some((needle) => message.includes(needle))) return true;

  // Playwright uses the same word ("timeout") for navigation failures and
  // ordinary locator/UI waits. Only navigation/request timeouts belong in the
  // network bucket; a missing Taager control must retain its real error type.
  return message.includes("timeout") && [
    "page.goto",
    "page.reload",
    "navigation",
    "request.get",
    "request.post",
    "api request",
    "socket",
    "tls",
  ].some((context) => message.includes(context));
}

module.exports = {
  isRetryableNetworkError,
};
