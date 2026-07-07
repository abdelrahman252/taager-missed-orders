"use strict";

const SWITCH_TO_OLD_SELECTOR = "#switch-to-old-layout-btn";
const MISSING_ORDERS_TAB_SELECTOR = "#missing-orders";
const MISSING_ORDERS_UPLOAD_SELECTOR = "#upload-missing-orders-button";
const MISSING_ORDERS_MODAL_STORE_SELECTOR = "#file-input";
const MISSING_ORDERS_MODAL_PLATFORM_SELECTOR = "#store-platform-input";
const MISSING_ORDERS_MODAL_FILE_SELECTOR = "#upload-missed-orders-button";
const MISSING_ORDERS_MODAL_SUBMIT_SELECTOR = "#upload-missing-orders-submit-button";

function visibleNoticeText() {
  return Array.from(document.querySelectorAll("[role='alert'], [class*='toast'], [class*='Toast'], [class*='notification']"))
    .filter((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })
    .map((el) => String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
    .join(" | ");
}

function createMissingOrdersUploadFlow(options = {}) {
  const log = options.log || (() => {});
  const stage = options.stage || (() => {});
  const goto = options.goto;
  const clearInterruption = options.clearInterruption || (async () => {});

  if (typeof goto !== "function") throw new Error("Missing Orders upload flow requires goto");

  async function openLegacyMissingOrders(page) {
    stage("taager.missing-orders.navigate", "started", "Opening Taager Missing Orders");
    page = await goto(page, "/orders");
    await clearInterruption(page, "missing-orders-before-layout-switch");

    const switchButton = page.locator(SWITCH_TO_OLD_SELECTOR).first();
    if (await switchButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      log("Taager Missing Orders: switching to the old orders layout");
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {}),
        switchButton.click({ timeout: 10000 }),
      ]);
      await page.waitForTimeout(1000);
    }

    if (!page.url().includes("/orders/legacy")) {
      log("Taager Missing Orders: opening the legacy orders URL directly");
      page = await goto(page, "/orders/legacy#missing-orders");
    }

    await clearInterruption(page, "missing-orders-before-tab");
    const tab = page.locator(MISSING_ORDERS_TAB_SELECTOR).first();
    if (await tab.isVisible({ timeout: 10000 }).catch(() => false)) {
      await tab.click({ timeout: 10000 });
    }

    await page.waitForFunction(
      () => window.location.hash === "#missing-orders" || !!document.querySelector("#upload-missing-orders-button"),
      null,
      { timeout: 15000 }
    );
    await page.locator(MISSING_ORDERS_UPLOAD_SELECTOR).first().waitFor({ state: "visible", timeout: 15000 });
    stage("taager.missing-orders.navigate", "ok", "Taager Missing Orders upload is ready");
    return page;
  }

  async function selectEasyOrdersPlatform(page) {
    stage("taager.missing-orders.platform", "started", "Selecting EasyOrders as Missing Orders platform");
    const trigger = page.locator(MISSING_ORDERS_MODAL_PLATFORM_SELECTOR).first();
    await trigger.waitFor({ state: "visible", timeout: 15000 });
    await trigger.click({ timeout: 10000 });

    const option = page.locator([
      "[role='option']:has-text('EasyOrders')",
      "[role='option']:has-text('Easy Orders')",
      "text=EasyOrders",
      "text=Easy Orders",
    ].join(", ")).first();

    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click({ timeout: 10000 });
      stage("taager.missing-orders.platform", "ok", "Selected platform: EasyOrders");
      return;
    }

    const changed = await page.evaluate(() => {
      const select = Array.from(document.querySelectorAll("select"))
        .find((el) => Array.from(el.options || []).some((opt) => opt.value === "easyOrders" || /easyorders/i.test(opt.textContent || "")));
      if (!select) return false;
      select.value = "easyOrders";
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }).catch(() => false);
    if (!changed) throw new Error("MISSING_ORDERS_PLATFORM_SELECT_FAILED: could not select EasyOrders in the store platform dropdown");
    await page.waitForTimeout(300);
    stage("taager.missing-orders.platform", "ok", "Selected platform: EasyOrders");
  }

  async function attachWorkbookInModal(page, filePath) {
    const firstChooser = await page.waitForEvent("filechooser", { timeout: 1000 }).catch(() => null);
    if (firstChooser) {
      await firstChooser.setFiles(filePath);
      return;
    }

    const fileButton = page.locator(MISSING_ORDERS_MODAL_FILE_SELECTOR).first();
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null);
    if (await fileButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fileButton.click({ timeout: 10000, noWaitAfter: true });
    }
    const chooser = await chooserPromise;
    if (chooser) {
      await chooser.setFiles(filePath);
      return;
    }

    const input = page.locator("input[type='file'][accept*='.xlsx'], input[type='file']").last();
    await input.waitFor({ state: "attached", timeout: 10000 });
    await input.setInputFiles(filePath);
  }

  async function uploadFile(page, filePath, uploadOptions = {}) {
    const storeName = String(uploadOptions.storeName || "").trim();
    if (!storeName) throw new Error("MISSING_ORDERS_STORE_NAME_REQUIRED: enter the Taager Missing Orders store name in setup");

    stage("taager.missing-orders.modal", "started", "Opening Missing Orders upload modal");
    await clearInterruption(page, "missing-orders-before-modal");
    const baselineNotice = await page.evaluate(visibleNoticeText).catch(() => "");

    const uploadButton = page.locator(MISSING_ORDERS_UPLOAD_SELECTOR).first();
    await uploadButton.click({ timeout: 10000, noWaitAfter: true });
    await page.locator(MISSING_ORDERS_MODAL_STORE_SELECTOR).first().waitFor({ state: "visible", timeout: 15000 });
    stage("taager.missing-orders.modal", "ok", "Missing Orders upload modal opened");

    stage("taager.missing-orders.store", "started", `Filling Missing Orders store name: ${storeName}`);
    await page.locator(MISSING_ORDERS_MODAL_STORE_SELECTOR).first().fill(storeName, { timeout: 10000 });
    stage("taager.missing-orders.store", "ok", "Missing Orders store name filled");

    await selectEasyOrdersPlatform(page);

    stage("taager.missing-orders.file", "started", "Attaching Missing Orders workbook");
    await attachWorkbookInModal(page, filePath);
    stage("taager.missing-orders.file", "ok", "Missing Orders workbook attached");

    const submit = page.locator(MISSING_ORDERS_MODAL_SUBMIT_SELECTOR).first();
    await submit.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction((selector) => {
      const btn = document.querySelector(selector);
      return !!btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
    }, MISSING_ORDERS_MODAL_SUBMIT_SELECTOR, { timeout: 30000 }).catch(async () => {
      const modalText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
      throw new Error(`MISSING_ORDERS_SUBMIT_DISABLED: Taager did not enable the submit button after filling the modal. ${modalText.slice(0, 500)}`);
    });

    stage("taager.missing-orders.submit", "started", "Submitting Missing Orders upload");
    await submit.click({ timeout: 10000 });

    // This legacy tool creates leads on submit. Do not retry an uncertain
    // submission: repeating it could create duplicate missing orders.
    const result = await page.waitForFunction((previousNotice) => {
      const visibleText = Array.from(document.querySelectorAll("[role='alert'], [class*='toast'], [class*='Toast'], [class*='notification']"))
        .filter((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((el) => String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
        .join(" | ");
      const modalGone = !document.querySelector("#upload-missing-orders-submit-button");
      if (!visibleText || visibleText === previousNotice) return modalGone ? { status: "unverified", text: "Missing Orders modal closed without a Taager success message" } : null;
      if (/فشل|خطأ|غير صالح|invalid|failed|error/i.test(visibleText)) return { status: "error", text: visibleText };
      if (/تمت?.*(?:رفع|تحميل|إضافة|معالجة)|بنجاح|success|uploaded|added/i.test(visibleText)) return { status: "ok", text: visibleText };
      return modalGone ? { status: "unverified", text: visibleText || "Missing Orders modal closed without a Taager success message" } : null;
    }, baselineNotice, { timeout: 120000 }).then((handle) => handle.jsonValue()).catch(() => null);

    if (!result) throw new Error("MISSING_ORDERS_UPLOAD_UNVERIFIED: the modal was submitted, but Taager did not show a success or failure message. It was not retried to avoid duplicates.");
    if (result.status === "error") throw new Error(`MISSING_ORDERS_UPLOAD_REJECTED: ${result.text || "Taager rejected the workbook"}`);
    if (result.status !== "ok") throw new Error(`MISSING_ORDERS_UPLOAD_UNVERIFIED: ${result.text || "Taager did not show a success message"}`);
    stage("taager.missing-orders.submit", "ok", result.text || "Missing Orders workbook submitted");
    return result;
  }

  return { openLegacyMissingOrders, uploadFile };
}

module.exports = {
  createMissingOrdersUploadFlow,
  SWITCH_TO_OLD_SELECTOR,
  MISSING_ORDERS_TAB_SELECTOR,
  MISSING_ORDERS_UPLOAD_SELECTOR,
  MISSING_ORDERS_MODAL_STORE_SELECTOR,
  MISSING_ORDERS_MODAL_PLATFORM_SELECTOR,
  MISSING_ORDERS_MODAL_FILE_SELECTOR,
  MISSING_ORDERS_MODAL_SUBMIT_SELECTOR,
};
