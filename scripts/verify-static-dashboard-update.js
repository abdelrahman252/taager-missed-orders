"use strict";

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { processDashboardSheets } = require("../src/bot/dashboard-sheet-processing");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${label}`);
  } else {
    failed++;
    console.error(`[FAIL] ${label}`);
  }
}

function workbookBuffer(rows, sheetName) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName || "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const taagerHeader = [
  "Order Number", "Customer Name", "Status", "Created At", "Last Updated", "Phone",
  "Address", "City", "COD", "Shipping", "Notes", "Unused", "Tax Profit", "Order Profit",
  "Unused 2", "Unused 3", "Products", "Quantity", "Prices", "Unused 4", "Unused 5",
  "Unused 6", "Order ID on your store"
];
const taagerRow = [
  "T-100", "Client", "Delivered", "2026-05-10", "2026-05-12", "0500000000",
  "Street", "Riyadh", 120, 20, "", "", 5, 35, "", "", "SKU-1", 1, 100, "", "", "", "EO-100"
];
const easyHeader = ["CreatedAt", "Phone", "Product Name", "SKU", "Payment Method", "Order ID", "External Order ID"];
const easyProductName = "عرض حبتين من لعبة الكرة الطائرة السحرية";
const easyRow = ["2026-05-10", "0500000000", easyProductName, "SKU-1", "visa", "EO-100", ""];

const taagerBuffer = workbookBuffer([taagerHeader, taagerRow], "Orders");
const easyBuffer = workbookBuffer([easyHeader, easyRow], "Orders");
const wrongBuffer = workbookBuffer([["Something Else"], ["value"]], "Other");

const taagerOnly = processDashboardSheets({
  taagerBuffer,
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  country: "sa",
  enrichmentEnabled: true,
});
check("Taager workbook produces one dashboard row", taagerOnly.rows.length === 1);
check("Missing Easy Orders workbook produces a warning", taagerOnly.warnings.length === 1 && taagerOnly.enrichmentDiagnostics.status === "missing");

const enriched = processDashboardSheets({
  taagerBuffer,
  easyOrdersBuffer: easyBuffer,
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  country: "sa",
  enrichmentEnabled: true,
});
check("Easy Orders preserves the exact product name", enriched.rows[0].productName === easyProductName);
check("Easy Orders enriches payment and prepaid status", enriched.rows[0].paymentMethod === "visa" && enriched.rows[0].isPrepaid === true);

const emptyRange = processDashboardSheets({
  taagerBuffer,
  dateFrom: "2026-06-01",
  dateTo: "2026-06-30",
  country: "sa",
});
check("A valid workbook can produce a zero-row selected period", emptyRange.rows.length === 0);

let rejected = false;
try {
  processDashboardSheets({ taagerBuffer: wrongBuffer, dateFrom: "2026-05-01", dateTo: "2026-05-31" });
} catch (_) {
  rejected = true;
}
check("Unrelated workbook is rejected as a Taager upload", rejected);

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src/main/main.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "src/main/preload.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "src/renderer/pages/dashboard/dashboard-shell.js"), "utf8");
const section = fs.readFileSync(path.join(root, "src/renderer/pages/dashboard/sections/section-static-update.js"), "utf8");
check("Main process exposes inspect and apply handlers", main.includes('ipcMain.handle("inspect-static-dashboard-update"') && main.includes('ipcMain.handle("apply-static-dashboard-update"'));
check("Preload exposes inspect and apply APIs", preload.includes("inspectStaticDashboardUpdate") && preload.includes("applyStaticDashboardUpdate"));
check("Dashboard sidebar and renderer map Static Update", shell.includes("nav.staticUpdate") && shell.includes("renderSectionStaticUpdate"));
check("Static section uses explicit replacement confirmation", section.includes("requiresConfirmation") && section.includes("allowSuspiciousReplacement"));

console.log(`\nStatic Update verification: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
