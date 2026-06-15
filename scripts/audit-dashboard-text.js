const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TARGETS = [
  "src/renderer/pages/premium-preview.js",
  "src/renderer/pages/dashboard/dashboard-i18n.js",
  "src/renderer/pages/dashboard/sections/section8-master.js",
  "src/renderer/pages/dashboard/sections/section1-overview.js",
  "src/renderer/pages/dashboard/sections/section2-pipeline.js",
  "src/renderer/pages/dashboard/sections/section3-orders.js",
  "src/renderer/pages/dashboard/sections/section4-cod.js",
  "src/renderer/pages/dashboard/sections/section5-products.js",
  "src/renderer/pages/dashboard/sections/section-cities.js",
  "src/renderer/pages/dashboard/sections/section6-commission.js",
  "src/renderer/pages/dashboard/sections/section-marketing-connections.js",
  "src/renderer/pages/dashboard/sections/section7-calculator.js",
  "src/renderer/pages/dashboard/sections/section9-product-forecast.js",
  "src/renderer/pages/dashboard/sections/section-prepaid.js",
  "src/renderer/pages/dashboard/sections/section-taager-ai.js",
];

const SUSPICIOUS = /(?:\uFFFD|Ã|Â|â|ð|Ã—|Ã·|âˆ’|\?{3,})/;
const SAFE_LINE = /\b(?:s7Txt|s8Txt|s5Txt|sTx|p9Txt|tx|pick|cleanPreviewText|dashboardI18n\.clean|dashboardI18n\.pick|decodeMojibake|hasMojibake|isQuestionMarkText|cp1252Byte)\b|s7-tip-badge|taager-help|data-preserve-question-mark|\\u00|\\u20|\\u22|0x/;

const failures = [];

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  let inBlockComment = false;
  let protectedCall = false;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (trimmed.includes(".test(") && trimmed.includes("[")) return;
    if (rel.endsWith("section7-calculator.js") && !/(data-tip|formula|Formula|s7-tip|tooltip|global-tooltip|\uFFFD|Ã|Â|â|ð|Ã—|Ã·|âˆ’)/.test(line)) return;
    if (/\b(?:s7Txt|s8Txt|s5Txt|sTx|p9Txt|tx|pick|cleanPreviewText)\s*\(/.test(line)) protectedCall = true;
    const shouldCloseProtectedCall = protectedCall && /[),;]\s*$/.test(line);
    if (!SUSPICIOUS.test(line)) {
      if (shouldCloseProtectedCall) protectedCall = false;
      return;
    }
    if (SAFE_LINE.test(line)) return;
    if (protectedCall && !/[ÃÂâð\uFFFD]/.test(line)) return;
    if (/["'`]\?{1,3}["'`]/.test(line) && /icon|tipIcon|emoji/.test(line)) return;
    failures.push(`${rel}:${index + 1} ${trimmed.slice(0, 180)}`);
    if (shouldCloseProtectedCall) protectedCall = false;
  });
}

if (failures.length) {
  console.error("Dashboard text audit failed:");
  failures.slice(0, 120).forEach((item) => console.error("  " + item));
  if (failures.length > 120) console.error(`  ...and ${failures.length - 120} more`);
  process.exit(1);
}

console.log("Dashboard text audit OK");
