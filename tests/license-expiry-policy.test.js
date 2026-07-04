"use strict";

const fs = require("fs");
const path = require("path");
const {
  evaluateCachedLicense,
  isInsideWarningWindow,
} = require("../src/main/license-expiry-policy");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

const now = Date.parse("2026-07-02T12:00:00.000Z");

const healthy = evaluateCachedLicense({
  valid: true,
  key: "TAAGER-TEST",
  daysLeft: 30,
  expiresAt: "2026-07-12T12:00:00.000Z",
}, now);
assert(healthy.expired === false, "future absolute expiry remains valid");
assert(healthy.result.daysLeft === 10, "days remaining are recalculated from absolute expiry");
assert(isInsideWarningWindow(healthy, 3) === false, "healthy cache remains eligible for startup fast path");

const nearExpiry = evaluateCachedLicense({
  valid: true,
  key: "TAAGER-TEST",
  daysLeft: 1,
  expiresAt: "2026-07-03T00:00:00.000Z",
}, now);
assert(nearExpiry.expired === false, "license with twelve hours remaining is not expired");
assert(nearExpiry.result.daysLeft === 1, "partial positive day displays as one day");
assert(isInsideWarningWindow(nearExpiry, 3) === true, "near-expiry cache requires authoritative startup check");

const expired = evaluateCachedLicense({
  valid: true,
  key: "TAAGER-TEST",
  daysLeft: 1,
  expiresAt: "2026-07-02T11:59:59.000Z",
}, now);
assert(expired.expired === true, "stale valid cache is rejected after absolute expiry");
assert(expired.result.daysLeft === 0, "expired cache is normalized to zero days");

const legacyNearExpiry = evaluateCachedLicense({ valid: true, daysLeft: 1 }, now);
assert(legacyNearExpiry.hasKnownExpiry === false, "legacy cache without timestamp is recognized");
assert(isInsideWarningWindow(legacyNearExpiry, 3) === true, "legacy near-expiry cache cannot use startup fast path");

const perpetual = evaluateCachedLicense({ valid: true, expiresAt: null }, now);
assert(perpetual.hasKnownExpiry === true, "explicit null expiry identifies a perpetual license");
assert(perpetual.expired === false, "perpetual license does not expire locally");
assert(perpetual.result.daysLeft === null, "perpetual license has no countdown");
assert(isInsideWarningWindow(perpetual, 3) === false, "perpetual license remains eligible for startup fast path");

const overlaySource = fs.readFileSync(path.join(__dirname, "../src/renderer/pages/expired-overlay.js"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");
const capturedCallbacks = overlaySource.match(/const onResumeCallback = _onResumeCallback;/g) || [];
assert(capturedCallbacks.length === 2, "manual and background renewal preserve the resume callback before teardown");
assert(/_startBackgroundRecheck[\s\S]*invalidReason\.includes\('not found'\)[\s\S]*returnToLicensePage/.test(overlaySource),
  "background recheck routes deleted licenses back to activation");
assert(/valid: false,[\s\S]*key,[\s\S]*customerName:[\s\S]*daysLeft:[\s\S]*reason:/.test(mainSource),
  "invalid server results retain saved license context");
assert(/const hasKnownKey[\s\S]*result && result\.key/.test(appSource),
  "renderer distinguishes a saved invalid key from a missing key");
assert(/if \(!shouldReturnToLicensePage\(licenseResult\)\)[\s\S]*rememberInvalidLicenseContext[\s\S]*_triggerExpiredOverlay/.test(appSource),
  "cold startup routes saved expired licenses directly to the overlay");
assert(/onResume: \(freshResult\)[\s\S]*if \(freshResult\)[\s\S]*startPeriodicLicenseCheck\(\)/.test(appSource),
  "renewal refreshes metadata and restarts periodic validation");

console.log("License expiry cache policy verified.");
