"use strict";

function isRetryableNetworkError(error) {
  const message = String(error && error.message || error || "").toLowerCase();
  return [
    "timeout",
    "etimedout",
    "err_timed_out",
    "err_connection",
    "econnreset",
    "econnrefused",
    "enotfound",
    "eai_again",
    "socket hang up",
    "tls handshake timeout",
    "net::",
  ].some((needle) => message.includes(needle));
}

module.exports = {
  isRetryableNetworkError,
};
