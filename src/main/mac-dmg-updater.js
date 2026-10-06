"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { finished } = require("node:stream/promises");

const OWNER = "abdelrahman252";
const REPOSITORY = "taager-missed-orders";
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_ASSET_RESPONSE_TIMEOUT_MS = 30_000;
const DEFAULT_ASSET_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

function createTimedSignal(parentSignal, timeoutMs, label) {
  const controller = new AbortController();
  let timeoutError = null;
  const abortFromParent = () => controller.abort(parentSignal.reason || Object.assign(new Error("Update download cancelled."), { name: "AbortError" }));
  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }
  const timer = setTimeout(() => {
    timeoutError = Object.assign(new Error(`${label} timed out. Check your connection and try again.`), { code: "UPDATE_TIMEOUT" });
    controller.abort(timeoutError);
  }, timeoutMs);
  return {
    signal: controller.signal,
    getTimeoutError: () => timeoutError,
    clearTimer() { clearTimeout(timer); },
    cleanup() {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

function githubResponseError(response, operation) {
  if (response.status === 403) {
    const remaining = response.headers?.get?.("x-ratelimit-remaining");
    const retryAfter = response.headers?.get?.("retry-after");
    const reset = response.headers?.get?.("x-ratelimit-reset");
    if (remaining === "0") {
      let when = retryAfter ? `in ${retryAfter} seconds` : "soon";
      if (!retryAfter && reset && Number.isFinite(Number(reset))) when = `at ${new Date(Number(reset) * 1000).toLocaleTimeString()}`;
      return new Error(`GitHub API rate limit reached; retry ${when}.`);
    }
    return new Error(`GitHub denied the ${operation} request (HTTP 403). Check GitHub access or try again later.`);
  }
  return new Error(`${operation} failed (HTTP ${response.status}).`);
}

async function discardResponseBody(body) {
  if (!body) return;
  if (typeof body.cancel === "function") await body.cancel().catch(() => {});
  else if (typeof body.destroy === "function") body.destroy();
}

function releaseVersion(tag) {
  return String(tag || "").replace(/^v/i, "");
}

function macArchitecture(arch) {
  if (arch === "arm64" || arch === "x64") return arch;
  throw new Error(`Unsupported Mac architecture: ${arch}`);
}

function compareVersions(left, right) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value || ""));
    if (!match) throw new Error(`Invalid application version: ${value}`);
    return { numbers: match.slice(1, 4).map(Number), prerelease: match[4] || "" };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] > b.numbers[index] ? 1 : -1;
  }
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && !b.prerelease) return 0;
  const aParts = a.prerelease.split(".");
  const bParts = b.prerelease.split(".");
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    if (aParts[index] === undefined) return -1;
    if (bParts[index] === undefined) return 1;
    if (aParts[index] === bParts[index]) continue;
    const aNumeric = /^\d+$/.test(aParts[index]);
    const bNumeric = /^\d+$/.test(bParts[index]);
    if (aNumeric && bNumeric) return Number(aParts[index]) > Number(bParts[index]) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aParts[index] > bParts[index] ? 1 : -1;
  }
  return 0;
}

function selectMacDmgAsset(release, arch) {
  const version = releaseVersion(release?.tag_name);
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
    throw new Error("The latest GitHub release has an invalid version tag.");
  }
  const expectedName = `Taager.Orders-${version}-${macArchitecture(arch)}-mac.dmg`;
  const asset = (Array.isArray(release.assets) ? release.assets : []).find((item) => item.name === expectedName);
  if (!asset || !asset.browser_download_url || !Number.isSafeInteger(asset.size) || asset.size <= 0) {
    throw new Error(`The latest release does not contain ${expectedName}.`);
  }
  return asset;
}

function createMacDmgUpdater({
  fetchImpl = globalThis.fetch,
  getDownloadsDir,
  // process.arch describes the running app binary. Under Rosetta, an x64 app
  // reports x64 and therefore receives the matching x64 DMG.
  arch = process.arch,
  getCurrentVersion = () => "0.0.0",
  apiTimeoutMs = DEFAULT_API_TIMEOUT_MS,
  assetResponseTimeoutMs = DEFAULT_ASSET_RESPONSE_TIMEOUT_MS,
  assetDownloadTimeoutMs = DEFAULT_ASSET_DOWNLOAD_TIMEOUT_MS,
  onProgress = () => {},
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  if (typeof getDownloadsDir !== "function") throw new Error("A Downloads directory resolver is required.");

  let activeController = null;
  let downloadedPath = null;

  async function getLatestRelease(signal) {
    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/releases/latest`;
    const timed = createTimedSignal(signal, apiTimeoutMs, "GitHub release lookup");
    try {
      const response = await fetchImpl(apiUrl, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Taager-Orders-Updater" },
        signal: timed.signal,
      });
      if (!response.ok) throw githubResponseError(response, "GitHub release lookup");
      return await response.json();
    } catch (error) {
      if (timed.getTimeoutError()) throw timed.getTimeoutError();
      throw error;
    } finally {
      timed.cleanup();
    }
  }

  async function checkForUpdate() {
    const release = await getLatestRelease();
    const version = releaseVersion(release?.tag_name);
    const asset = selectMacDmgAsset(release, arch);
    const currentVersion = getCurrentVersion();
    return { available: compareVersions(version, currentVersion) > 0, version, assetName: asset.name };
  }

  async function download() {
    if (activeController) throw new Error("A Mac update download is already in progress.");
    downloadedPath = null;
    const controller = new AbortController();
    activeController = controller;
    let partialPath = null;
    let output = null;
    let transferTimeout = null;
    let responseTimeout = null;
    try {
      const release = await getLatestRelease(controller.signal);
      const latestVersion = releaseVersion(release.tag_name);
      if (compareVersions(latestVersion, getCurrentVersion()) <= 0) throw new Error("No newer Mac update is available.");
      const asset = selectMacDmgAsset(release, arch);
      const assetUrl = new URL(asset.browser_download_url);
      if (assetUrl.protocol !== "https:" || assetUrl.hostname !== "github.com") {
        throw new Error("GitHub returned an unexpected Mac update URL.");
      }
      transferTimeout = createTimedSignal(controller.signal, assetDownloadTimeoutMs, "Mac update download");
      responseTimeout = createTimedSignal(transferTimeout.signal, assetResponseTimeoutMs, "Mac update server response");
      let downloadResponse;
      try {
        downloadResponse = await fetchImpl(asset.browser_download_url, {
          headers: { "User-Agent": "Taager-Orders-Updater", Accept: "application/octet-stream" },
          signal: responseTimeout.signal,
          redirect: "follow",
        });
      } catch (error) {
        if (responseTimeout.getTimeoutError()) throw responseTimeout.getTimeoutError();
        if (transferTimeout.getTimeoutError()) throw transferTimeout.getTimeoutError();
        throw error;
      }
      responseTimeout.clearTimer();
      if (!downloadResponse.ok || !downloadResponse.body) {
        await discardResponseBody(downloadResponse.body);
        throw githubResponseError(downloadResponse, "Mac update download");
      }
      const finalUrl = new URL(downloadResponse.url || asset.browser_download_url);
      if (finalUrl.protocol !== "https:" || !["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"].includes(finalUrl.hostname)) {
        await discardResponseBody(downloadResponse.body);
        throw new Error("GitHub returned an unexpected update download destination.");
      }

      const downloadsDir = getDownloadsDir();
      await fs.promises.mkdir(downloadsDir, { recursive: true });
      let finalPath = path.join(downloadsDir, asset.name);
      let suffix = 1;
      while (fs.existsSync(finalPath)) {
        finalPath = path.join(downloadsDir, `${path.basename(asset.name, ".dmg")}-${suffix++}.dmg`);
      }
      partialPath = `${finalPath}.part-${process.pid}-${Date.now()}`;
      output = fs.createWriteStream(partialPath, { flags: "wx", mode: 0o600 });
      let received = 0;
      const hash = crypto.createHash("sha256");
      try {
        for await (const chunk of downloadResponse.body) {
          if (controller.signal.aborted) throw Object.assign(new Error("Update download cancelled."), { name: "AbortError" });
          received += chunk.length;
          if (received > asset.size) throw new Error("The downloaded Mac update is larger than the release asset.");
          hash.update(chunk);
          if (!output.write(chunk)) await new Promise((resolve, reject) => {
            output.once("drain", resolve);
            output.once("error", reject);
          });
          onProgress({ percent: Math.min(99, Math.floor((received / asset.size) * 100)), transferred: received, total: asset.size });
        }
      } catch (error) {
        if (transferTimeout.getTimeoutError()) throw transferTimeout.getTimeoutError();
        throw error;
      }
      output.end();
      await finished(output);
      output = null;
      if (received !== asset.size) throw new Error("The Mac update download was incomplete.");
      const actualDigest = hash.digest("hex");
      if (asset.digest) {
        const expected = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest);
        if (!expected || expected[1].toLowerCase() !== actualDigest.toLowerCase()) {
          throw new Error("The downloaded Mac update failed its SHA-256 check.");
        }
      }
      await fs.promises.rename(partialPath, finalPath);
      partialPath = null;
      downloadedPath = finalPath;
      onProgress({ percent: 100, transferred: received, total: asset.size });
      return { ok: true, path: finalPath, fileName: path.basename(finalPath), version: releaseVersion(release.tag_name) };
    } catch (error) {
      if (output && !output.destroyed) {
        output.destroy();
        await finished(output).catch(() => {});
      }
      if (partialPath) await fs.promises.rm(partialPath, { force: true }).catch(() => {});
      if (error.name === "AbortError") return { ok: false, cancelled: true };
      throw error;
    } finally {
      if (transferTimeout) transferTimeout.cleanup();
      if (responseTimeout) responseTimeout.cleanup();
      if (activeController === controller) activeController = null;
    }
  }

  return {
    download,
    checkForUpdate,
    cancel() {
      if (!activeController) return false;
      activeController.abort();
      return true;
    },
    getDownloadedPath() { return downloadedPath; },
  };
}

module.exports = { compareVersions, createMacDmgUpdater, macArchitecture, releaseVersion, selectMacDmgAsset };
