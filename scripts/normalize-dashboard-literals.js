const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const files = [
  "src/renderer/pages/dashboard/sections/section5-products.js",
  "src/renderer/pages/dashboard/sections/section-cities.js",
  "src/renderer/pages/dashboard/sections/section-prepaid.js"
];

const replacements = [
  ["\u00e2\u20ac\u201d", "-"],
  ["\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d", "-"],
  ["\u00e2\u20ac\u00a6", "..."],
  ["\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a6", "..."],
  ["\u00e2\u2020\u2018", "\u2191"],
  ["\u00e2\u2020\u201c", "\u2193"],
  ["\u00e2\u2020\u2022", "\u2195"],
  ["\u00e2\u2013\u00bc", "\u25bc"],
  ["\u00e2\u2013\u00b2", "\u25b2"],
  ["\u00e2\u2021\u2026", "\u2195"],
  ["\u00e2\u02c6\u2019", "-"],
  ["\u00c2\u00b7", "\u00b7"],
  ["\u00e2\u0153\u2022", "x"],
  ["\u00e2\u0153\u00a8", "*"],
  ["\u00e2\u0161\u00a1", "!"],
  ["\u00e2\u0161\u00a0\u00ef\u00b8\u008f", "!"],
  ["\u00e2\u201e\u00b9\u00ef\u00b8\u008f", "i"],
  ["\u00e2\u2014\u008f", "\u2022"],
  ["\u00f0\u0178\u2019\u00b3", "CARD"],
  ["\u00f0\u0178\u2019\u00b0", "COD"],
  ["\u00f0\u0178\u201c\u00ad", "-"],
  ["\u00f0\u0178\u201c\u008d", "PIN"],
  ["\u00f0\u0178\u201c\u00a6", "BOX"],
  ["\u00f0\u0178\u201c\u02c6", "UP"],
  ["\u00f0\u0178\u015a\u00a8", "!"],
  ["\u00f0\u0178\u0152\u0178", "*"],
  ["\u00f0\u0178\u201d\u00a5", "!"],
  ["\u00f0\u0178\u2014\u00ba\u00ef\u00b8\u008f", "MAP"]
];

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let text = fs.readFileSync(abs, "utf8");
  for (const [bad, good] of replacements) {
    text = text.split(bad).join(good);
  }
  fs.writeFileSync(abs, text, "utf8");
}

