"use strict";

const { _electron: electron, chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const { buildPersistentContextOptions } = require("../src/bot/chrome-launch");
const { normalizePhone } = require("../src/bot/phone");
const { normalizeProductName, productNamesMatch } = require("../src/bot/parser");
const { buildDryRun, DEFAULTS, formatItem } = require("./verify-affiliate-recovery-sheets");

const workspace = path.resolve(__dirname, "..");
const artifactRoot = path.join(workspace, "affiliate-recovery-live-artifacts");
const runId = `selector-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const artifactDir = path.join(artifactRoot, runId);
fs.mkdirSync(artifactDir, { recursive: true });

const args = parseArgs(process.argv);
const report = {
  runId,
  artifactDir,
  accountNeedle: args.account,
  dateFrom: args.from,
  dateTo: args.to,
  checks: [],
  failures: [],
  screenshots: [],
};

function parseArgs(argv) {
  const parsed = {
    account: "abdo",
    from: DEFAULTS.from,
    to: DEFAULTS.to,
    country: DEFAULTS.country,
  };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i++;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env.PROGRAMFILES || "", "Google\\Chrome\\Application\\chrome.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Chrome executable was not found for live selector smoke.");
}

function logCheck(name, status, details = {}) {
  const entry = { name, status, ...details };
  report.checks.push(entry);
  console.log(JSON.stringify(entry));
}

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function fail(name, message, details = {}) {
  const failure = { name, message, ...details };
  report.failures.push(failure);
  logCheck(name, "failed", { message, ...details });
}

async function screenshot(page, name) {
  const file = path.join(artifactDir, `${String(report.screenshots.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  report.screenshots.push(file);
  return file;
}

async function assertVisible(page, selectorOrLocator, name, timeout = 10000) {
  const locator = typeof selectorOrLocator === "string" ? page.locator(selectorOrLocator).first() : selectorOrLocator.first();
  const ok = await locator.isVisible({ timeout }).catch(() => false);
  if (!ok) fail(name, "Selector was not visible", { selector: typeof selectorOrLocator === "string" ? selectorOrLocator : "locator" });
  else logCheck(name, "ok");
  return ok;
}

async function checkVisible(page, selectorOrLocator, name, timeout = 5000) {
  const locator = typeof selectorOrLocator === "string" ? page.locator(selectorOrLocator).first() : selectorOrLocator.first();
  const ok = await locator.isVisible({ timeout }).catch(() => false);
  logCheck(name, ok ? "ok" : "warning", {
    visible: ok,
    selector: typeof selectorOrLocator === "string" ? selectorOrLocator : "locator",
  });
  return ok;
}

async function launchElectronAndEnableFeature() {
  const app = await electron.launch({ args: ["."], cwd: workspace, env: process.env });
  const page = await app.firstWindow({ timeout: 30000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await page.waitForSelector("#sv3-btn-affiliate-recovery", { timeout: 30000 });

  const credentials = await page.evaluate(async () => window.api.getCredentials());
  const accounts = Array.isArray(credentials.accounts) ? credentials.accounts : [];
  const needle = String(args.account || "").toLowerCase();
  const account = accounts.find((acc) => [
    acc.name,
    acc.label,
    acc.easyEmail,
    acc.taagerEmail,
    acc.id,
  ].some((value) => String(value || "").toLowerCase().includes(needle)));
  if (!account) {
    throw new Error(`Account not found for live selector smoke: ${args.account}. Available: ${accounts.map((acc) => `${acc.name || acc.label || acc.id}:${acc.easyEmail || acc.taagerEmail || ""}`).join(" | ")}`);
  }

  const before = await page.getAttribute("#sv3-btn-affiliate-recovery", "aria-pressed");
  if (before !== "true") {
    await page.click("#sv3-btn-affiliate-recovery");
    await page.waitForTimeout(800);
  }
  const after = await page.getAttribute("#sv3-btn-affiliate-recovery", "aria-pressed");
  const settings = await page.evaluate(async () => window.api.getSettings());
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData"));
  await screenshot(page, "app-affiliate-recovery-toggle");
  await app.close();

  logCheck("app feature toggle enabled", after === "true" && settings.easyOrdersAffiliateRecoveryEnabled === true ? "ok" : "failed", {
    before,
    after,
    setting: settings.easyOrdersAffiliateRecoveryEnabled,
    account: account.name || account.label || account.id,
    easyEmail: account.easyEmail || "",
  });
  return { account, userData };
}

async function setDateInput(page, dataKey, value) {
  const selector = `[data-source="${dataKey}"] input[type="date"]`;
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.evaluate(({ selector: inputSelector, value: nextValue }) => {
    const input = document.querySelector(inputSelector);
    if (!input) return false;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
    if (descriptor && descriptor.set) descriptor.set.call(input, nextValue);
    else input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { selector, value });
  await page.waitForTimeout(500);
}

async function ensureFilterField(page, dataKey) {
  const field = page.locator(`[data-source="${dataKey}"] input[type="date"]`).first();
  if (await field.isVisible({ timeout: 1000 }).catch(() => false)) return true;
  const addFilterVisible = await checkVisible(page, 'button[aria-label="add filter"], button.add-filter', `add filter button for ${dataKey}`, 15000);
  if (!addFilterVisible && await field.isVisible({ timeout: 1000 }).catch(() => false)) return true;
  if (!addFilterVisible) throw new Error(`Add filter button not visible for ${dataKey}`);
  await page.locator('button[aria-label="add filter"], button.add-filter').first().click();
  if (await field.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press("Escape").catch(() => {});
    return true;
  }
  const itemSelector = `[role="menuitem"][data-key="${dataKey}"], li[data-key="${dataKey}"]`;
  const itemVisible = await page.locator(itemSelector).first().isVisible({ timeout: 10000 }).catch(() => false);
  if (!itemVisible && await field.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press("Escape").catch(() => {});
    return true;
  }
  if (!itemVisible) {
    logCheck(`filter menu item ${dataKey}`, "failed", { message: "Selector was not visible and filter input was not visible", selector: itemSelector });
    throw new Error(`Filter menu item not visible: ${dataKey}`);
  }
  logCheck(`filter menu item ${dataKey}`, "ok", { selector: itemSelector });
  await page.locator(`[role="menuitem"][data-key="${dataKey}"], li[data-key="${dataKey}"]`).first().click();
  await assertVisible(page, `[data-source="${dataKey}"] input[type="date"]`, `filter input ${dataKey}`, 10000);
  return true;
}

async function applyFilters(page, from, to) {
  await ensureFilterField(page, "created_at$gte");
  await ensureFilterField(page, "created_at$lte");
  await setDateInput(page, "created_at$gte", from);
  await setDateInput(page, "created_at$lte", to);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const values = await page.evaluate(() => ({
    start: document.querySelector('[data-source="created_at$gte"] input[type="date"]')?.value || "",
    end: document.querySelector('[data-source="created_at$lte"] input[type="date"]')?.value || "",
  }));
  logCheck("date filters applied", values.start === from && values.end === to ? "ok" : "failed", values);
}

async function setRows100(page) {
  const current = await page.locator(".MuiTablePagination-root input.MuiSelect-nativeInput").first()
    .getAttribute("value", { timeout: 4000 }).catch(() => "");
  if (String(current) !== "100") {
    await assertVisible(page, ".MuiTablePagination-root [role='button'][aria-haspopup='listbox']", "rows per page select", 10000);
    await page.locator(".MuiTablePagination-root [role='button'][aria-haspopup='listbox']").first().click();
    await assertVisible(page, '[role="option"][data-value="100"]', "rows per page option 100", 10000);
    await page.locator('[role="option"][data-value="100"]').first().click();
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const after = await page.locator(".MuiTablePagination-root input.MuiSelect-nativeInput").first()
    .getAttribute("value", { timeout: 4000 }).catch(() => "");
  logCheck("rows per page set to 100", String(after) === "100" ? "ok" : "failed", { before: current, after });
}

async function readRows(page) {
  return page.evaluate(() => {
    const text = (el) => String(el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
    return Array.from(document.querySelectorAll(".RaDatagrid-tableWrapper tbody tr.RaDatagrid-clickableRow, tbody tr.RaDatagrid-clickableRow")).map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return {
        index,
        status: text(cells[1]),
        shortId: text(row.querySelector(".column-short_id")),
        name: text(row.querySelector(".column-full_name")) || text(cells[2]),
        phone: text(row.querySelector(".column-phone")) || text(cells[3]),
        createdAt: text(row.querySelector(".column-created_at")) || text(cells[cells.length - 1]),
        text: text(row),
      };
    });
  });
}

async function inspectModal(page, expectedOrder, label) {
  await page.waitForSelector('input[name^="cart_items["][name$="].quantity"]', { timeout: 15000 });
  const snapshot = await page.evaluate(() => {
    const value = (name) => Array.from(document.querySelectorAll("input, textarea")).find((el) => el.name === name)?.value ?? null;
    const qtyInputs = Array.from(document.querySelectorAll('input[name^="cart_items["][name$="].quantity"]'));
    const items = qtyInputs.map((qtyInput) => {
      const index = Number(String(qtyInput.name || "").match(/cart_items\[(\d+)\]/)?.[1] || 0);
      const price = document.querySelector(`input[name="cart_items[${index}].price"]`);
      const container = qtyInput.closest("tr") || qtyInput.closest(".MuiCard-root") || qtyInput.parentElement;
      return {
        index,
        qtyName: qtyInput.name,
        qty: qtyInput.value,
        priceName: price?.name || "",
        price: price?.value || "",
        text: String(container?.innerText || container?.textContent || "").replace(/\s+/g, " ").trim(),
      };
    });
    return {
      fullName: value("full_name"),
      phone: value("phone"),
      government: value("government"),
      address: value("address"),
      items,
      pageText: String(document.body?.innerText || document.body?.textContent || "").replace(/\s+/g, " ").trim(),
      hasSave: Array.from(document.querySelectorAll("button")).some((btn) => /^Save$/i.test((btn.innerText || "").trim())),
      hasCancel: Array.from(document.querySelectorAll("button")).some((btn) => /^Cancel$/i.test((btn.innerText || "").trim())),
    };
  });
  const expectedItems = expectedOrder.items || [expectedOrder];
  const unmatched = expectedItems.filter((item) => {
    const sku = cleanText(item.sku);
    const productName = normalizeProductName(item.productName);
    if (sku && snapshot.pageText.includes(sku)) return false;
    return !snapshot.items.some((modalItem) => {
      const modalName = normalizeProductName(modalItem.text);
      return productName && modalName && productNamesMatch(productName, modalName);
    });
  });
  const ok = snapshot.items.length >= expectedItems.length && snapshot.hasCancel && snapshot.hasSave && unmatched.length === 0;
  logCheck(`${label} edit modal selectors`, ok ? "ok" : "failed", {
    expectedItems: expectedItems.map(formatItem),
    modalItemCount: snapshot.items.length,
    unmatchedReferences: unmatched.map(formatItem),
    fields: {
      fullName: snapshot.fullName,
      phone: snapshot.phone,
      government: snapshot.government,
      address: snapshot.address,
    },
  });
  await screenshot(page, `${label}-edit-modal`);
  await page.getByRole("button", { name: /^Cancel$/i }).first().click({ timeout: 10000 }).catch(async () => {
    await page.keyboard.press("Escape").catch(() => {});
  });
  await page.waitForTimeout(700);
}

function rowMatchesMissedTarget(row, target, country) {
  const rowPhone = normalizePhone(row.phone || row.text || "", country);
  const targetPhone = normalizePhone(target.normPhone || target.phone || "", country);
  if (!rowPhone || !targetPhone || rowPhone !== targetPhone) return false;
  const rowName = String(row.name || row.text || "").replace(/\s+/g, " ").trim();
  const targetName = String(target.name || "").replace(/\s+/g, " ").trim();
  return !targetName || !rowName || targetName === rowName || targetName.includes(rowName) || rowName.includes(targetName);
}

async function runLiveSmoke() {
  fs.writeFileSync(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));
  const dryRun = buildDryRun({ ...DEFAULTS, from: args.from, to: args.to, country: args.country });
  if (dryRun.failures.length) {
    dryRun.failures.forEach((message) => fail("sheet dry-run prerequisite", message));
    return;
  }
  report.sheetDryRun = dryRun.summary;
  const realTarget = dryRun.preparedReal.find((order) => !((order.items || [order]).some((item) => (Number(item.qty || 1) || 1) > 10)) && order.orderId);
  const missedTargets = dryRun.preparedMissed || [];
  if (!realTarget) throw new Error("No safe real target found from sheet dry-run.");
  if (!missedTargets.length) throw new Error("No missed target found from sheet dry-run.");

  const { account, userData } = await launchElectronAndEnableFeature();
  const profilePath = path.join(userData, `bot-profile-${account.id || ""}`);
  const chromePath = findChrome();
  report.profilePath = profilePath;
  report.chromePath = chromePath;

  const context = await chromium.launchPersistentContext(profilePath, buildPersistentContextOptions({
    executablePath: chromePath,
    windowSize: "1440,900",
    viewport: null,
  }));
  const page = context.pages()[0] || await context.newPage();
  try {
    await page.goto("https://app.easy-orders.net/#/orders", { waitUntil: "domcontentloaded", timeout: 45000 });
    await applyFilters(page, args.from, args.to);
    await setRows100(page);
    await assertVisible(page, ".RaDatagrid-tableWrapper table.RaDatagrid-table, table", "orders table selector", 20000);
    const orderRows = await readRows(page);
    logCheck("orders table row scrape", orderRows.length > 0 ? "ok" : "failed", { rows: orderRows.length, sample: orderRows.slice(0, 3) });
    await screenshot(page, "orders-list-filtered");

    await page.goto(`https://app.easy-orders.net/#/orders/${realTarget.orderId}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await assertVisible(page, page.getByRole("button", { name: /^Edit Order$/i }), "real detail Edit Order button", 20000);
    await assertVisible(page, page.getByRole("button", { name: /^Resend Order to Affiliates$/i }), "real detail Resend button", 10000);
    await screenshot(page, "real-detail");
    await page.getByRole("button", { name: /^Edit Order$/i }).first().click();
    await inspectModal(page, realTarget, "real");

    await page.goto("https://app.easy-orders.net/#/missed-orders", { waitUntil: "domcontentloaded", timeout: 45000 });
    await assertVisible(page, 'button[aria-label="add filter"], button.add-filter', "missed add filter selector", 20000);
    await applyFilters(page, args.from, args.to);
    await setRows100(page);
    await assertVisible(page, ".RaDatagrid-tableWrapper table.RaDatagrid-table, table", "missed table selector", 20000);
    const missedRows = await readRows(page);
    const matchedMissed = missedTargets
      .map((target) => ({ target, row: missedRows.find((row) => rowMatchesMissedTarget(row, target, args.country)) }))
      .filter((entry) => entry.row);
    const activeMissed = matchedMissed.find((entry) => !/^completed$/i.test(cleanText(entry.row.status || "")));
    const completedMissed = matchedMissed.find((entry) => /^completed$/i.test(cleanText(entry.row.status || "")));
    const chosenMissed = activeMissed || completedMissed || { target: missedTargets[0], row: null };
    const missedTarget = chosenMissed.target;
    const missedRow = chosenMissed.row;
    logCheck("missed prepared row match", missedRow ? "ok" : "failed", {
      target: { name: missedTarget.name, phone: missedTarget.normPhone, items: (missedTarget.items || []).map(formatItem) },
      rows: missedRows.length,
      match: missedRow || null,
      activeMatchAvailable: !!activeMissed,
    });
    await screenshot(page, "missed-list-filtered");
    if (missedRow) {
      if (/^completed$/i.test(cleanText(missedRow.status || ""))) {
        logCheck("missed completed fallback", "ok", {
          behavior: "Matched missed row is Completed; production recovery should verify Taager first, then search real orders and resend only if still missing.",
          match: missedRow,
        });
        return;
      }
      await page.locator(".RaDatagrid-tableWrapper tbody tr.RaDatagrid-clickableRow, tbody tr.RaDatagrid-clickableRow").nth(missedRow.index).click();
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await assertVisible(page, page.getByRole("button", { name: /^Edit$/i }), "missed detail Edit button", 20000);
      const hasConvert = await checkVisible(page, page.getByRole("button", { name: /^Convert to Order$/i }), "missed detail Convert button", 10000);
      if (!hasConvert) {
        logCheck("missed detail convert fallback", "ok", {
          behavior: "Actual recovery will report this prepared missed row as manual review after modal verification because Convert to Order is not available.",
        });
      }
      await screenshot(page, "missed-detail");
      await page.getByRole("button", { name: /^Edit$/i }).first().click();
      await inspectModal(page, missedTarget, "missed");
    }
  } catch (error) {
    await screenshot(page, "failure-state");
    fail("live selector smoke exception", error.message || String(error), { stack: error.stack || "" });
  } finally {
    await context.close().catch(() => {});
    fs.writeFileSync(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));
  }
}

runLiveSmoke().then(() => {
  if (report.failures.length) {
    console.error(`Live selector smoke failed. Report: ${path.join(artifactDir, "report.json")}`);
    process.exit(1);
  }
  console.log(`Live selector smoke passed. Report: ${path.join(artifactDir, "report.json")}`);
}).catch((error) => {
  report.failures.push({ name: "fatal", message: error.message || String(error), stack: error.stack || "" });
  fs.writeFileSync(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
