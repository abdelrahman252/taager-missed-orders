"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const dirs = ["src", "admin-panel", "supabase/functions"].map((dir) => path.join(root, dir));
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && /\.(js|cjs|mjs)$/.test(entry.name)) files.push(full);
  }
}

dirs.forEach(walk);

let failed = 0;
for (const file of files) {
  try {
    const code = fs.readFileSync(file, "utf8").replace(/^#!.*\r?\n/, "");
    new vm.Script(code, { filename: file, displayErrors: true });
  } catch (err) {
    failed++;
    process.stderr.write(`\nSyntax check failed: ${path.relative(root, file)}\n`);
    process.stderr.write((err && err.stack) ? err.stack : String(err));
    process.stderr.write("\n");
  }
}

if (failed) {
  process.stderr.write(`\n${failed} file(s) failed syntax check.\n`);
  process.exit(1);
}

process.stdout.write(`Syntax OK: ${files.length} JavaScript file(s).\n`);
