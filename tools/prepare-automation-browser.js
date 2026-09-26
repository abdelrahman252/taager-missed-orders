"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { PINNED_BROWSER_VERSION } = require("../src/bot/automation-browser-path");

if (process.platform !== "win32") process.exit(0);

const projectRoot = path.resolve(__dirname, "..");
const targetParent = path.join(projectRoot, "vendor", "automation-browser");
const targetDir = path.join(targetParent, "chrome-win64");
const targetExe = path.join(targetDir, "chrome.exe");
const versionFile = path.join(targetParent, "version.txt");
const cachedDir = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1234", "chrome-win64");
const archiveUrl = `https://storage.googleapis.com/chrome-for-testing-public/${PINNED_BROWSER_VERSION}/win64/chrome-win64.zip`;

async function prepare() {
  if (fs.existsSync(targetExe)) {
    const version = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "";
    if (version !== PINNED_BROWSER_VERSION) {
      throw new Error(`Existing automation browser has no matching version marker: ${targetDir}`);
    }
    console.log(`Pinned automation browser ready: ${targetExe}`);
    return;
  }

  fs.mkdirSync(targetParent, { recursive: true });
  if (fs.existsSync(path.join(cachedDir, "chrome.exe"))) {
    console.log(`Copying pinned Chromium ${PINNED_BROWSER_VERSION} from Playwright cache...`);
    fs.cpSync(cachedDir, targetDir, { recursive: true });
  } else {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "taager-browser-build-"));
    try {
      const archive = path.join(staging, "chrome-win64.zip");
      console.log(`Downloading pinned Chromium ${PINNED_BROWSER_VERSION} from Chrome for Testing...`);
      const response = await fetch(archiveUrl);
      if (!response.ok || !response.body) throw new Error(`Browser download returned HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archive));
      execFileSync("tar.exe", ["-xf", archive, "-C", staging], { stdio: "inherit" });
      const extracted = path.join(staging, "chrome-win64");
      if (!fs.existsSync(path.join(extracted, "chrome.exe"))) throw new Error("Browser archive has no chrome.exe");
      fs.cpSync(extracted, targetDir, { recursive: true });
    } finally {
      if (path.dirname(path.resolve(staging)) !== path.resolve(os.tmpdir())) {
        throw new Error(`Unsafe browser staging path: ${staging}`);
      }
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(targetExe)) throw new Error(`Pinned browser preparation failed: ${targetExe}`);
  fs.writeFileSync(versionFile, `${PINNED_BROWSER_VERSION}\n`);
  console.log(`Pinned automation browser ready: ${targetExe}`);
}

prepare().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
