"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  path.join(root, "src", "bot", "runner.js"),
  path.join(root, "src", "bot", "dashboard-fetch.js"),
];

function extractFunction(source, name) {
  const marker = `async function ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Missing ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

let failed = 0;
function check(condition, message) {
  if (condition) return;
  failed++;
  process.stderr.write(`FAIL: ${message}\n`);
}

for (const file of files) {
  const rel = path.relative(root, file);
  const source = fs.readFileSync(file, "utf8");
  const login = extractFunction(source, "taagerLogin");
  const arabic = extractFunction(source, "ensureTaagerArabic");

  check(source.includes("function assertUsableTaagerPage"), `${rel} should validate Taager page objects`);
  check(!/\breturn\s*;/.test(login), `${rel} taagerLogin must not return undefined on success`);
  check(/\breturn\s+page\s*;/.test(login), `${rel} taagerLogin should return the active page`);
  check(source.includes("page = await taagerLogin(page)") ? /\breturn\s+page\s*;/.test(login) : true,
    `${rel} assigns taagerLogin result but taagerLogin does not return page`);
  check(source.includes("isTaagerAlreadyArabicLanguageText") && source.includes("/^english$/i"),
    `${rel} should treat English button text as already Arabic`);
  check(source.includes("isTaagerSwitchToArabicLanguageText") && source.includes("/^عربي$/"),
    `${rel} should treat Arabic button text as switch-to-Arabic`);
  check(!/change-language-btn:visible"\)\.filter\(\{\s*hasText:\s*\/\^عربي\$\/\s*\}/.test(arabic),
    `${rel} should not use the old Arabic-only locator as the language proof`);
  check(source.includes("recoverTaagerForRetry"), `${rel} should include Taager retry recovery`);

  if (rel.replace(/\\/g, "/") === "src/bot/runner.js") {
    const upload = extractFunction(source, "uploadToTaagerCartAttempt");
    check(source.includes("async function gotoTaagerCartForUpload") && upload.includes("gotoTaagerCartForUpload(page)"),
      `${rel} should use the cart-specific upload navigation`);
    check(source.includes("async function openTaagerBulkCartTab") && upload.includes("openTaagerBulkCartTab(page)"),
      `${rel} should press the multiple-customers tab before upload`);
    check(source.includes("async function uploadTaagerBulkFile") && upload.includes("uploadTaagerBulkFile(page, tempPath)"),
      `${rel} should press the visible upload-file button flow`);
    check(source.includes('page.waitForEvent("filechooser"'),
      `${rel} should listen for the file chooser opened by the upload button`);
    check(source.includes("readTaagerCartDiagnostics") && source.includes("logTaagerCartDiagnostics"),
      `${rel} should log cart diagnostics when the upload flow fails`);
  }
}

if (failed) {
  process.stderr.write(`\n${failed} Taager recovery regression check(s) failed.\n`);
  process.exit(1);
}

process.stdout.write("Taager recovery regression checks OK.\n");
