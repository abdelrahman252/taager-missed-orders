"use strict";

const fs = require("fs");
const path = require("path");
const { fetchActiveAdminNotification } = require("../src/main/admin-notifications");
const { createManager, STORAGE_KEY } = require("../src/renderer/admin-notifications");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

async function run() {
  let rpcCall = null;
  const fetched = await fetchActiveAdminNotification(async (name, params) => {
    rpcCall = { name, params };
    return { id: 42, title: "Maintenance", message: "Back shortly", kind: "warn", created_at: "2026-07-01T00:00:00Z" };
  }, "TAAGER-TEST");
  assert(rpcCall.name === "taager_get_active_admin_notification", "license check uses the narrow notification RPC");
  assert(rpcCall.params.p_license_key === "TAAGER-TEST" && fetched.id === "42", "mocked license notification is normalized for checkLicense");

  const storage = memoryStorage();
  const shown = [];
  const timers = [];
  let warningVisible = false;
  let expiredVisible = false;
  const manager = createManager({
    storage,
    showToast(message, options) {
      const toast = { message, options };
      shown.push(toast);
      return () => options.onClose();
    },
    isBlocked: () => warningVisible || expiredVisible,
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    retryMs: 10,
    afterBlockedDelayMs: 25,
  });

  manager.offer({ id: 1, title: "One", message: "First", kind: "info" });
  assert(shown.length === 1 && shown[0].options.persistent === true, "notification is shown as a persistent admin toast");
  shown[0].options.onClose();
  assert(JSON.parse(storage.getItem(STORAGE_KEY)).includes("1"), "dismissed notification ID is stored locally");
  manager.offer({ id: 1, title: "One", message: "First", kind: "info" });
  assert(shown.length === 1, "dismissed notification does not show twice");
  manager.offer({ id: 2, title: "Two", message: "Replacement", kind: "success" });
  assert(shown.length === 2, "a replacement notification with a new ID shows again");
  shown[1].options.onClose();

  warningVisible = true;
  manager.offer({ id: 3, title: "Queued", message: "After warning", kind: "warn" });
  assert(shown.length === 2 && timers.at(-1).delay === 10, "notification waits while the license warning is visible");
  warningVisible = false;
  timers.shift().callback();
  assert(shown.length === 2 && timers.at(-1).delay === 25, "notification adds a short delay after the warning closes");
  timers.shift().callback();
  assert(shown.length === 3, "queued notification appears after the warning closes");
  shown[2].options.onClose();

  expiredVisible = true;
  manager.offer({ id: 4, title: "Locked", message: "After overlay", kind: "info" });
  assert(shown.length === 3, "notification waits while the expired-license overlay is visible");
  expiredVisible = false;
  timers.shift().callback();
  timers.shift().callback();
  assert(shown.length === 4, "queued notification appears after the expired overlay closes");

  shown[3].options.onClose();
  warningVisible = true;
  manager.offer({ id: 5, title: "Disabled", message: "Do not show", kind: "info" });
  manager.offer(null);
  warningVisible = false;
  timers.shift().callback();
  assert(shown.length === 4, "a disabled broadcast is removed from the pending queue");

  const rendererSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "app.js"), "utf8");
  assert(rendererSource.includes("lr.adminNotification") && rendererSource.includes("freshLicense.adminNotification"), "startup and periodic license results feed the notification manager");
  console.log("Admin notification behavior verified.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
