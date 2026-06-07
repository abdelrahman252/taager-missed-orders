"use strict";

function normalizeError(input) {
  if (input instanceof Error) return input;
  if (input && typeof input === "object") {
    const error = new Error(input.message || input.reason || input.error || JSON.stringify(input));
    if (input.name) error.name = input.name;
    if (input.stack) error.stack = input.stack;
    return error;
  }
  return new Error(String(input == null ? "Unknown error" : input));
}

function safeContext(context) {
  if (!context || typeof context !== "object") return {};
  const copy = { ...context };
  ["password", "easyPassword", "taagerPassword", "token", "licenseKey", "key", "apikey"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(copy, key)) copy[key] = "[Filtered]";
  });
  return copy;
}

function captureException(Sentry, error, context) {
  if (!Sentry || typeof Sentry.captureException !== "function") return null;
  return Sentry.withScope ? Sentry.withScope((scope) => {
    applyScope(scope, context);
    return Sentry.captureException(normalizeError(error));
  }) : Sentry.captureException(normalizeError(error));
}

function captureMessage(Sentry, message, level, context) {
  if (!Sentry || typeof Sentry.captureMessage !== "function") return null;
  return Sentry.withScope ? Sentry.withScope((scope) => {
    applyScope(scope, context);
    return Sentry.captureMessage(String(message), level || "info");
  }) : Sentry.captureMessage(String(message), level || "info");
}

function addBreadcrumb(Sentry, breadcrumb) {
  if (!Sentry || typeof Sentry.addBreadcrumb !== "function") return;
  Sentry.addBreadcrumb({
    timestamp: Date.now() / 1000,
    ...safeContext(breadcrumb),
  });
}

function setUserContext(Sentry, user) {
  if (!Sentry || typeof Sentry.setUser !== "function") return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id || user.accountId || undefined,
    username: user.username || user.customerName || undefined,
  });
}

function applyScope(scope, context) {
  const safe = safeContext(context);
  if (!scope || !safe) return;
  if (safe.tags && typeof scope.setTags === "function") scope.setTags(safe.tags);
  if (safe.extra && typeof scope.setExtras === "function") scope.setExtras(safe.extra);
  Object.keys(safe).forEach((key) => {
    if (key !== "tags" && key !== "extra" && typeof scope.setExtra === "function") {
      scope.setExtra(key, safe[key]);
    }
  });
}

async function instrumentAsync(Sentry, name, operation, fn, context) {
  const start = Date.now();
  addBreadcrumb(Sentry, { category: operation || "task", message: `${name}:start`, level: "info", data: safeContext(context) });
  try {
    return await fn();
  } catch (err) {
    captureException(Sentry, err, {
      operation,
      name,
      durationMs: Date.now() - start,
      extra: safeContext(context),
    });
    throw err;
  } finally {
    addBreadcrumb(Sentry, {
      category: operation || "task",
      message: `${name}:finish`,
      level: "info",
      data: { durationMs: Date.now() - start },
    });
  }
}

module.exports = {
  addBreadcrumb,
  captureException,
  captureMessage,
  instrumentAsync,
  normalizeError,
  safeContext,
  setUserContext,
};
