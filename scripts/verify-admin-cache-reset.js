"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const main = read("src/main/main.js");
const app = read("src/renderer/app.js");
const admin = read("admin-panel/index.html");

const handler = (main.match(/function _handleResetCache\(\) \{[\s\S]*?\n\}/) || [""])[0];
assert(handler, "Main process must define the admin cache-reset handler");
assert(handler.includes("analyticsStore.clear()"), "Admin cache reset must clear analytics data");
assert(handler.includes("dashboardStore.clear()"), "Admin cache reset must clear dashboard data");
assert(handler.includes("invalidateAnalyticsRunsCache()"), "Admin cache reset must invalidate analytics memory");
assert(handler.includes('analyticsSnapshotSyncCacheKey = ""'), "Admin cache reset must invalidate analytics snapshot sync state");
assert(handler.includes("dashboardQueryService.clearCache()"), "Admin cache reset must clear dashboard query memory");
assert(handler.includes('mainWindow.webContents.send("reset-cache")'), "Admin cache reset must notify the renderer");
assert(!handler.includes("store.clear()"), "Admin cache reset must preserve settings and credentials");
assert(!handler.includes("licenseStore.clear()"), "Admin cache reset must preserve the license");

assert(main.includes("if (r.reset_cache) _handleResetCache();"), "Periodic license checks must process reset_cache");
assert(main.includes("return { valid: true, resetCache: true };"), "No-cache license checks must report reset_cache");

assert(app.includes('window.api.on("reset-cache", handleAdminCacheReset)'), "Renderer must listen for admin cache reset");
assert(app.includes('window.invalidateDashboardCache("admin-cache-reset")'), "Renderer must invalidate dashboard memory");
assert(app.includes('invalidatePage("page-analytics", "admin-cache-reset")'), "Renderer must invalidate analytics view");
assert(app.includes('invalidatePage("page-operations", "admin-cache-reset")'), "Renderer must invalidate operations view");

assert(admin.includes("reset_cache: true"), "Admin panel must still issue reset_cache");
assert(admin.includes("All credentials and logged-in account slots will remain intact"), "Admin panel must promise preserved account access");

console.log("Admin cache-reset recovery verification passed.");
