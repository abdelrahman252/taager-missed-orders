"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src/renderer/pages/dashboard/dashboard-styles.css");
const outputDir = path.dirname(sourcePath);
const source = fs.readFileSync(sourcePath, "utf8");

const groups = [
  ["overview", /(?:^|[\s.#])s1-|#s1-/i],
  ["pipeline", /(?:^|[\s.#])s2-|#s2-/i],
  ["orders", /(?:^|[\s.#])s3-|#s3-|orders-preview|orders-row/i],
  ["cod", /(?:^|[\s.#])s4-|#s4-|(?:^|[\s.#])cod-/i],
  ["products", /(?:^|[\s.#])s5-|#s5-|s5-product-modal|s5-compare-modal/i],
  ["cities", /(?:^|[\s.#])sc-|#sc-|city-drawer|dash-country-map/i],
  ["master-commission", /(?:^|[\s.#])s6-|#s6-|(?:^|[\s.#])s8-|#s8-/i],
  ["calculator", /(?:^|[\s.#])s7-|#s7-|(?:^|[\s.#])sfe-/i],
  ["forecast", /(?:^|[\s.#])s9-|#s9-/i],
  ["marketing", /(?:^|[\s.#])marketing-/i],
  ["campaigns", /(?:^|[\s.#])campaign-/i],
  ["ai", /#dashboard-ai-root|(?:^|[\s.#])ai-command|(?:^|[\s.#])ai-panel|(?:^|[\s.#])ai-chat|(?:^|[\s.#])ai-copilot/i],
];

function matchingGroups(prelude) {
  return groups.filter(([, pattern]) => pattern.test(prelude)).map(([name]) => name);
}

function scanNodes(css) {
  const nodes = [];
  let start = 0;
  let i = 0;
  let quote = "";
  let comment = false;

  while (i < css.length) {
    if (comment) {
      if (css[i] === "*" && css[i + 1] === "/") {
        comment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (quote) {
      if (css[i] === "\\") i += 2;
      else if (css[i] === quote) {
        quote = "";
        i += 1;
      } else i += 1;
      continue;
    }
    if (css[i] === "/" && css[i + 1] === "*") {
      comment = true;
      i += 2;
      continue;
    }
    if (css[i] === "'" || css[i] === '"') {
      quote = css[i];
      i += 1;
      continue;
    }
    if (css[i] === ";") {
      nodes.push({ prelude: css.slice(start, i + 1), body: null, text: css.slice(start, i + 1) });
      start = i + 1;
      i += 1;
      continue;
    }
    if (css[i] !== "{") {
      i += 1;
      continue;
    }

    const open = i;
    let depth = 1;
    i += 1;
    quote = "";
    comment = false;
    while (i < css.length && depth > 0) {
      if (comment) {
        if (css[i] === "*" && css[i + 1] === "/") {
          comment = false;
          i += 2;
        } else i += 1;
        continue;
      }
      if (quote) {
        if (css[i] === "\\") i += 2;
        else if (css[i] === quote) {
          quote = "";
          i += 1;
        } else i += 1;
        continue;
      }
      if (css[i] === "/" && css[i + 1] === "*") {
        comment = true;
        i += 2;
      } else if (css[i] === "'" || css[i] === '"') {
        quote = css[i];
        i += 1;
      } else {
        if (css[i] === "{") depth += 1;
        if (css[i] === "}") depth -= 1;
        i += 1;
      }
    }
    const end = i;
    nodes.push({
      prelude: css.slice(start, open),
      body: css.slice(open + 1, end - 1),
      text: css.slice(start, end),
    });
    start = end;
  }
  if (start < css.length) nodes.push({ prelude: css.slice(start), body: null, text: css.slice(start) });
  return nodes;
}

function append(outputs, group, text) {
  outputs[group] += text;
}

function splitCss(css, outputs) {
  scanNodes(css).forEach((node) => {
    const trimmed = node.prelude.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!node.body || !trimmed) {
      append(outputs, "core", node.text);
      return;
    }
    if (/^@(media|supports|container|layer)\b/i.test(trimmed)) {
      const nested = Object.fromEntries(Object.keys(outputs).map((key) => [key, ""]));
      splitCss(node.body, nested);
      Object.keys(nested).forEach((group) => {
        if (!nested[group].trim()) return;
        append(outputs, group, node.prelude + "{" + nested[group] + "}");
      });
      return;
    }
    if (trimmed.startsWith("@")) {
      append(outputs, "core", node.text);
      return;
    }
    const matches = matchingGroups(trimmed);
    append(outputs, matches.length === 1 ? matches[0] : "core", node.text);
  });
}

const outputs = Object.fromEntries(["core", ...groups.map(([name]) => name)].map((name) => [name, ""]));
splitCss(source, outputs);

fs.writeFileSync(sourcePath, outputs.core.trimStart(), "utf8");
Object.entries(outputs).forEach(([group, css]) => {
  if (group === "core" || !css.trim()) return;
  fs.writeFileSync(path.join(outputDir, `dashboard-${group}.css`), css.trimStart(), "utf8");
});

console.log(Object.entries(outputs).map(([group, css]) => `${group}: ${Buffer.byteLength(css)} bytes`).join("\n"));
