"use strict";

const XLSX = require("xlsx");
const phone = require("../src/bot/phone");

const CASES = {
  sa: { raw: "00966501234567", formatted: "966501234567", cart: "SAU", fallback: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0634\u0631\u0642\u064a\u0629", knownInput: "Riyadh", knownOutput: "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0631\u064a\u0627\u0636" },
  eg: { raw: "+201012345678", formatted: "201012345678", cart: "EGY", fallback: "\u0627\u0644\u0642\u0627\u0647\u0631\u0629", knownInput: "Giza", knownOutput: "\u0627\u0644\u062c\u064a\u0632\u0629" },
  iq: { raw: "07701234567", formatted: "9647701234567", cart: "IRQ", fallback: "\u0628\u063a\u062f\u0627\u062f", knownInput: "Basra", knownOutput: "\u0628\u0635\u0631\u0629" },
  ae: { raw: "0501234567", formatted: "971501234567", cart: "ARE", fallback: "\u0623\u0628\u0648 \u0638\u0628\u064a", knownInput: "Dubai", knownOutput: "\u062f\u0628\u064a" },
  om: { raw: "91234567", formatted: "96891234567", cart: "OMN", fallback: "\u0645\u0633\u0642\u0637", knownInput: "Salalah", knownOutput: "\u0635\u0644\u0627\u0644\u0629" },
};

let passed = 0;

function check(label, condition, detail) {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  passed++;
  console.log(`[PASS] ${label}`);
}

function loadOutput(country) {
  process.env.BOT_CONFIG = JSON.stringify({ taagerCountry: country });
  delete require.cache[require.resolve("../src/bot/output")];
  return require("../src/bot/output");
}

for (const [country, expected] of Object.entries(CASES)) {
  check(`${country.toUpperCase()} phone format`, phone.formatPhone(expected.raw, country) === expected.formatted);

  const output = loadOutput(country);
  check(`${country.toUpperCase()} known province preserved`, output.normalizeProvince(expected.knownInput, country) === expected.knownOutput);
  check(`${country.toUpperCase()} unknown province fallback`, output.normalizeProvince("Definitely Unknown", country) === expected.fallback);
  check(`${country.toUpperCase()} blank province fallback`, output.normalizeProvince("", country) === expected.fallback);

  const buffer = output.buildOutputExcel([{
    sku: "SKU-1",
    productName: "Product",
    unitPrice: 10,
    qty: 1,
    name: "Customer",
    city: "Definitely Unknown",
    address: "",
    normPhone: expected.formatted,
  }]);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Cart, { header: 1, defval: "" });
  const header = rows[0];
  const row = rows[1];
  const countryIndex = header.findIndex((value) => String(value).startsWith("(Country)"));
  const phoneIndex = header.findIndex((value) => String(value).startsWith("(Phone Number)"));
  const provinceIndex = header.findIndex((value) => String(value).startsWith("(Province)"));
  check(`${country.toUpperCase()} cart country code`, row[countryIndex] === expected.cart);
  check(`${country.toUpperCase()} cart phone`, row[phoneIndex] === expected.formatted);
  check(`${country.toUpperCase()} cart fallback province`, row[provinceIndex] === expected.fallback);
}

check("unsupported country phone rejected", phone.formatPhone("501234567", "zz") === null);
const unsupportedOutput = loadOutput("zz");
let unsupportedError = "";
try {
  unsupportedOutput.buildOutputExcel([]);
} catch (error) {
  unsupportedError = error.message;
}
check("unsupported country cart rejected", unsupportedError === "UNSUPPORTED_TAAGER_COUNTRY: zz", unsupportedError);

const warningOutput = loadOutput("eg");
const warningBuffer = warningOutput.buildSkippedExcel([{
  uploadedWithWarning: true,
  uncertain: true,
  reason: "phone_uncertain_zero_appended",
  rawPhone: "101234567",
  normalizedPhone: "201012345670",
}]);
const warningWorkbook = XLSX.read(warningBuffer, { type: "buffer" });
const warningRows = XLSX.utils.sheet_to_json(warningWorkbook.Sheets["Warnings & Skipped"], { header: 1, defval: "" });
check("uncertain phone is marked uploaded with warning", warningRows[1][0] === "WARNING - UPLOADED");
check("uncertain phone includes normalized value", warningRows[1][6] === "201012345670");

console.log(`\nCountry order-flow verification: ${passed} passed.`);
