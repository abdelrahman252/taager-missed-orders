"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "src", "renderer");
const extensions = new Set([".css", ".html", ".js"]);
const ignored = new Set(["chart.umd.min.js"]);
const failures = [];
const warnings = [];
const approvedPixelSizes = new Set([10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return extensions.has(path.extname(entry.name)) && !ignored.has(entry.name) ? [full] : [];
  });
}

function record(target, file, text, regex, message) {
  text.split(/\r?\n/).forEach((line, index) => {
    regex.lastIndex = 0;
    if (regex.test(line)) {
      target.push(`${path.relative(root, file)}:${index + 1} ${message}`);
    }
  });
}

for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  const isVisualSystem = path.basename(file) === "typography.css";

  record(failures, file, text, /fonts\.googleapis|fonts\.gstatic/i, "remote font dependency");
  record(
    failures,
    file,
    text,
    /font-weight\s*[:=]\s*["']?(?:650|750|850|900|950|1000)\b/i,
    "unsupported font weight"
  );
  record(
    failures,
    file,
    text,
    /(?:ctx\.)?font\s*[:=]\s*["'](?:650|750|800|850|900|950|1000)\b/i,
    "unsupported canvas or shorthand font weight"
  );
  record(
    failures,
    file,
    text,
    /font-size\s*:\s*(?:[0-9](?:\.[0-9]+)?)px/i,
    "meaningful text below 10px"
  );
  record(
    failures,
    file,
    text,
    /(?:font|titleFont|bodyFont|ticks)\s*:\s*\{[^}\r\n]*size\s*:\s*(?:[0-9](?:\.[0-9]+)?)\b/i,
    "chart text below 10px"
  );
  record(
    failures,
    file,
    text,
    /(?:font-family\s*[:=]|\bfamily\s*:)[^;}\r\n]*(?:Cairo|Tajawal|DM Sans|Fira Code|Courier New)/i,
    "legacy or unavailable font family"
  );
  record(
    failures,
    file,
    text,
    /font-family\s*=\s*["'][^"']*(?:Cairo|Tajawal|DM Sans|Fira Code|Courier New)/i,
    "legacy SVG font family"
  );

  if (!isVisualSystem) {
    record(
      failures,
      file,
      text,
      /font-size\s*:\s*[0-9]+(?:\.[0-9]+)?px/i,
      "literal font size bypasses typography tokens"
    );
    record(
      failures,
      file,
      text,
      /font-weight\s*:\s*[0-9]+\b/i,
      "literal font weight bypasses typography tokens"
    );
  }

  if (!isVisualSystem) text.split(/\r?\n/).forEach((line, index) => {
    const matches = line.matchAll(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/gi);
    for (const match of matches) {
      const value = Number(match[1]);
      if (value >= 10 && !approvedPixelSizes.has(value)) {
        warnings.push(`${path.relative(root, file)}:${index + 1} non-token font size ${value}px`);
      }
    }
  });
}

console.log("\n[Typography Audit]");
console.log(`  scanned: ${walk(root).length} renderer files`);
console.log(`  blocking violations: ${failures.length}`);
console.log(`  legacy size exceptions: ${warnings.length}`);

if (warnings.length) {
  console.log("\n  Non-blocking size exceptions (first 20):");
  warnings.slice(0, 20).forEach((warning) => console.log(`  - ${warning}`));
}

if (failures.length) {
  console.error("\n  Blocking violations:");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exitCode = 1;
} else {
  console.log("  PASS no remote fonts, unsupported weights, sub-10px text, or legacy families");
}
