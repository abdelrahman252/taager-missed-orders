"use strict";

function normalizeAdminNotification(value) {
  if (!value || value.id == null) return null;
  return {
    id: String(value.id),
    title: String(value.title || "").trim(),
    message: String(value.message || "").trim(),
    kind: ["info", "warn", "success"].includes(value.kind) ? value.kind : "info",
    createdAt: value.createdAt || value.created_at || null,
  };
}

async function fetchActiveAdminNotification(rpc, licenseKey) {
  const value = await rpc("taager_get_active_admin_notification", {
    p_license_key: licenseKey,
  });
  return normalizeAdminNotification(value);
}

module.exports = { fetchActiveAdminNotification, normalizeAdminNotification };
