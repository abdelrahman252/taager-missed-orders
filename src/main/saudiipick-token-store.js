"use strict";

const TOKEN_KEY = "desktopToken";
const LEGACY_TOKEN_KEY = "saudiIPickMarketing.desktopToken";

function createSaudiIPickTokenRepository({ tokenStore, legacyStore }) {
  if (!tokenStore || typeof tokenStore.get !== "function" || typeof tokenStore.set !== "function" || typeof tokenStore.delete !== "function") {
    throw new TypeError("A persistent token store is required");
  }

  let migrationFallback = "";
  function removeLegacyToken() {
    if (legacyStore && typeof legacyStore.delete === "function") {
      try { legacyStore.delete(LEGACY_TOKEN_KEY); } catch (_) {}
    }
  }

  function migrateLegacyToken() {
    if (!legacyStore || typeof legacyStore.get !== "function") return "";
    const legacy = String(legacyStore.get(LEGACY_TOKEN_KEY, "") || "").trim();
    if (!legacy) return "";
    if (!String(tokenStore.get(TOKEN_KEY, "") || "").trim()) {
      try {
        tokenStore.set(TOKEN_KEY, legacy);
      } catch (_) {
        // Keep the legacy value readable if persistence is temporarily unavailable.
        migrationFallback = legacy;
        return legacy;
      }
    }
    migrationFallback = "";
    removeLegacyToken();
    return String(tokenStore.get(TOKEN_KEY, "") || "").trim();
  }

  migrateLegacyToken();

  return {
    get() {
      const current = String(tokenStore.get(TOKEN_KEY, "") || "").trim();
      return current || migrateLegacyToken() || migrationFallback;
    },
    save(value) {
      const clean = String(value || "").trim();
      if (!clean || !clean.startsWith("sipdt_")) return { ok: false, error: "INVALID_SAUDIIPICK_TOKEN" };
      tokenStore.set(TOKEN_KEY, clean);
      migrationFallback = "";
      removeLegacyToken();
      return { ok: true, configured: true };
    },
    clear() {
      tokenStore.delete(TOKEN_KEY);
      migrationFallback = "";
      removeLegacyToken();
    },
  };
}

module.exports = { createSaudiIPickTokenRepository };
