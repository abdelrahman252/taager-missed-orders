"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { test } = require("node:test");
const { compareVersions, createMacDmgUpdater, selectMacDmgAsset } = require("../src/main/mac-dmg-updater");
const { createUpdatePlatformRoutes, loadAutoUpdater } = require("../src/main/update-platform-routes");

const bytes = Buffer.from("small test dmg fixture");
const digest = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
function release(arch = "arm64") {
  return {
    tag_name: "v1.2.3",
    assets: [{
      name: `Taager.Orders-1.2.3-${arch}-mac.dmg`,
      browser_download_url: "https://github.com/abdelrahman252/taager-missed-orders/releases/download/v1.2.3/Taager.dmg",
      size: bytes.length,
      digest,
    }],
  };
}
function response(body, url = "https://github.com/abdelrahman252/taager-missed-orders/releases/latest") {
  return { ok: true, status: 200, url, json: async () => body, body: body instanceof Readable ? body : undefined };
}

test("selects only matching architecture DMG and rejects unsupported architectures", () => {
  assert.equal(selectMacDmgAsset(release("arm64"), "arm64").name, "Taager.Orders-1.2.3-arm64-mac.dmg");
  assert.equal(selectMacDmgAsset(release("x64"), "x64").name, "Taager.Orders-1.2.3-x64-mac.dmg");
  assert.throws(() => selectMacDmgAsset(release("arm64"), "x64"), /does not contain/);
  assert.throws(() => selectMacDmgAsset(release(), "ia32"), /Unsupported Mac architecture/);
});

test("compares current and release versions including prereleases", () => {
  assert.equal(compareVersions("1.0.9", "1.0.10"), -1);
  assert.equal(compareVersions("1.0.10", "1.0.10"), 0);
  assert.equal(compareVersions("1.0.10", "1.0.10-beta.2"), 1);
  assert.equal(compareVersions("1.0.10-beta.10", "1.0.10-beta.2"), 1);
});

test("downloads the matching DMG, reports progress, verifies digest, and preserves existing files", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "taager-mac-update-"));
  try {
    await fs.promises.writeFile(path.join(dir, "Taager.Orders-1.2.3-arm64-mac.dmg"), "existing");
    const progress = [];
    const updater = createMacDmgUpdater({
      arch: "arm64",
      getDownloadsDir: () => dir,
      onProgress: (item) => progress.push(item.percent),
      fetchImpl: async (url) => url.includes("api.github.com")
        ? response(release())
        : response(Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]), "https://release-assets.githubusercontent.com/asset"),
    });
    const result = await updater.download();
    assert.equal(result.ok, true);
    assert.match(result.fileName, /arm64-mac-1\.dmg$/);
    assert.deepEqual(await fs.promises.readFile(result.path), bytes);
    assert.deepEqual(progress.slice(-1), [100]);
    assert.equal(updater.getDownloadedPath(), result.path);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("removes partial files after an incomplete download", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "taager-mac-update-"));
  try {
    const updater = createMacDmgUpdater({
      arch: "arm64",
      getDownloadsDir: () => dir,
      fetchImpl: async (url) => url.includes("api.github.com")
        ? response(release())
        : response(Readable.from([bytes.subarray(0, 5)]), "https://release-assets.githubusercontent.com/asset"),
    });
    await assert.rejects(updater.download(), /incomplete/);
    assert.deepEqual(await fs.promises.readdir(dir), []);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("rejects unexpected download hosts and checksum mismatches without leaving files", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "taager-mac-update-"));
  try {
    const maliciousRelease = release();
    maliciousRelease.assets[0].browser_download_url = "https://attacker.example/update.dmg";
    const unexpectedHostUpdater = createMacDmgUpdater({
      arch: "arm64",
      getDownloadsDir: () => dir,
      fetchImpl: async (url) => url.includes("api.github.com")
        ? response(maliciousRelease)
        : response(Readable.from([bytes]), "https://attacker.example/update.dmg"),
    });
    await assert.rejects(unexpectedHostUpdater.download(), /unexpected Mac update URL/);
    assert.deepEqual(await fs.promises.readdir(dir), []);

    const badDigestRelease = release();
    badDigestRelease.assets[0].digest = `sha256:${"0".repeat(64)}`;
    const badDigestUpdater = createMacDmgUpdater({
      arch: "arm64",
      getDownloadsDir: () => dir,
      fetchImpl: async (url) => url.includes("api.github.com")
        ? response(badDigestRelease)
        : response(Readable.from([bytes]), "https://release-assets.githubusercontent.com/asset"),
    });
    await assert.rejects(badDigestUpdater.download(), /failed its SHA-256 check/);
    assert.deepEqual(await fs.promises.readdir(dir), []);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("bounds the GitHub API lookup and gives actionable rate-limit guidance", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "taager-mac-update-"));
  try {
    const timedUpdater = createMacDmgUpdater({
      getDownloadsDir: () => dir,
      apiTimeoutMs: 10,
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    });
    await assert.rejects(timedUpdater.checkForUpdate(), /GitHub release lookup timed out/);

    const limitedResponse = response({});
    limitedResponse.ok = false;
    limitedResponse.status = 403;
    limitedResponse.headers = { get: (name) => ({ "x-ratelimit-remaining": "0", "retry-after": "60" })[name] || null };
    const limitedUpdater = createMacDmgUpdater({
      getDownloadsDir: () => dir,
      fetchImpl: async () => limitedResponse,
    });
    await assert.rejects(limitedUpdater.checkForUpdate(), /rate limit reached; retry in 60 seconds/);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("bounds a stalled asset stream and reports timeout separately from cancellation", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "taager-mac-update-"));
  try {
    const updater = createMacDmgUpdater({
      arch: "arm64",
      getDownloadsDir: () => dir,
      assetDownloadTimeoutMs: 15,
      assetResponseTimeoutMs: 100,
      fetchImpl: async (url, options = {}) => {
        if (url.includes("api.github.com")) return response(release());
        const body = Readable.from((async function* () {
          yield bytes.subarray(0, 2);
          await new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true }));
          throw options.signal.reason;
        })());
        return response(body, "https://release-assets.githubusercontent.com/asset");
      },
    });
    await assert.rejects(updater.download(), /Mac update download timed out/);
    assert.deepEqual(await fs.promises.readdir(dir), []);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("cancellation removes the partial file and reports cancellation", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "taager-mac-update-"));
  try {
    let abort;
    const body = Readable.from((async function* () {
      yield bytes.subarray(0, 5);
      await new Promise((resolve) => { abort = resolve; });
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    })());
    const updater = createMacDmgUpdater({
      arch: "arm64",
      getDownloadsDir: () => dir,
      fetchImpl: async (url) => url.includes("api.github.com")
        ? response(release())
        : response(body, "https://release-assets.githubusercontent.com/asset"),
    });
    const pending = updater.download();
    while (!abort) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(updater.cancel(), true);
    abort();
    assert.deepEqual(await pending, { ok: false, cancelled: true });
    assert.deepEqual(await fs.promises.readdir(dir), []);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("Darwin routes check, download, cancel, and reveal without touching the native updater", async () => {
  const events = [];
  const revealed = [];
  const macUpdater = {
    checkForUpdate: async () => ({ available: true, version: "1.2.3" }),
    download: async () => ({ ok: true, path: "/Downloads/Taager.dmg", fileName: "Taager.dmg" }),
    cancel: () => true,
    getDownloadedPath: () => "/Downloads/Taager.dmg",
  };
  const nativeUpdater = new Proxy({}, { get() { throw new Error("Darwin must not access electron-updater"); } });
  const routes = createUpdatePlatformRoutes({
    platform: "darwin",
    macUpdater,
    autoUpdater: nativeUpdater,
    sendUpdateEvent: (...args) => events.push(args),
    showItemInFolder: (filePath) => revealed.push(filePath),
    fileExists: () => true,
  });
  assert.deepEqual(await routes.checkForUpdates(), { ok: true, available: true, version: "1.2.3" });
  assert.deepEqual(await routes.downloadUpdate(), { ok: true, path: "/Downloads/Taager.dmg", fileName: "Taager.dmg" });
  assert.equal(routes.cancelDownload(), true);
  assert.deepEqual(routes.revealDownloadedUpdate(), {
    ok: true, manual: true, platform: "darwin", path: "/Downloads/Taager.dmg", fileName: "Taager.dmg",
  });
  assert.deepEqual(events, [["update-available", { version: "1.2.3", platform: "darwin" }], ["update-downloaded"]]);
  assert.deepEqual(revealed, ["/Downloads/Taager.dmg"]);
});

test("native updater module is loaded only on non-Darwin platforms", () => {
  let loads = 0;
  const loadNative = () => { loads += 1; return { marker: "native" }; };
  assert.equal(loadAutoUpdater("darwin", loadNative), null);
  assert.equal(loads, 0);
  assert.deepEqual(loadAutoUpdater("win32", loadNative), { marker: "native" });
  assert.equal(loads, 1);
});

test("non-Darwin routes preserve electron-updater check and download behavior", async () => {
  const calls = [];
  const routes = createUpdatePlatformRoutes({
    platform: "win32",
    macUpdater: new Proxy({}, { get() { throw new Error("Windows must not access the Mac updater"); } }),
    autoUpdater: {
      checkForUpdates: async () => calls.push("check"),
      downloadUpdate: () => calls.push("download"),
    },
  });
  assert.deepEqual(await routes.checkForUpdates(), { ok: true });
  assert.deepEqual(await routes.downloadUpdate(), { ok: true });
  assert.deepEqual(calls, ["check", "download"]);
  assert.equal(routes.revealDownloadedUpdate(), null);
});

test("Darwin routes signal no-update, cancellation, and errors to the existing UI events", async () => {
  const events = [];
  let downloadResult = { ok: false, cancelled: true };
  let failLookup = false;
  const routes = createUpdatePlatformRoutes({
    platform: "darwin",
    macUpdater: {
      checkForUpdate: async () => {
        if (failLookup) throw new Error("GitHub is unavailable");
        return { available: false, version: "1.2.3" };
      },
      download: async () => downloadResult,
      cancel: () => true,
      getDownloadedPath: () => null,
    },
    autoUpdater: new Proxy({}, { get() { throw new Error("Darwin must not access electron-updater"); } }),
    sendUpdateEvent: (...args) => events.push(args),
  });
  await routes.checkForUpdates();
  await routes.downloadUpdate();
  downloadResult = { ok: false, error: "network failed" };
  await routes.downloadUpdate();
  failLookup = true;
  await assert.rejects(routes.checkForUpdates(), /GitHub is unavailable/);
  assert.deepEqual(events, [
    ["update-not-available", { version: "1.2.3", platform: "darwin" }],
    ["update-download-cancelled"],
    ["update-error", { message: "network failed" }],
  ]);
});
