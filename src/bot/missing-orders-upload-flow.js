"use strict";

const SWITCH_TO_OLD_SELECTOR = "#switch-to-old-layout-btn";
const MISSING_ORDERS_TAB_SELECTOR = "#missing-orders";
const MISSING_ORDERS_UPLOAD_SELECTOR = "#upload-missing-orders-button";
const MISSING_ORDERS_MODAL_STORE_SELECTOR = "#file-input";
const MISSING_ORDERS_MODAL_PLATFORM_SELECTOR = "#store-platform-input";
const MISSING_ORDERS_MODAL_FILE_SELECTOR = "#upload-missed-orders-button";
const MISSING_ORDERS_MODAL_SUBMIT_SELECTOR = "#upload-missing-orders-submit-button";
const MISSING_ORDERS_SEARCH_SELECTOR = "#orders-search-button";
const MISSING_ORDERS_NEXT_SELECTOR = "#cursor-pagination-btn-next";
const MISSING_ORDERS_PREV_SELECTOR = "#cursor-pagination-btn-prev";
const MISSING_ORDERS_ERROR_NOTICE_RE = /\u0641\u0634\u0644|\u062e\u0637\u0623|\u063a\u064a\u0631\s+\u0635\u0627\u0644\u062d|invalid|failed|error/i;
const MISSING_ORDERS_SUCCESS_NOTICE_RE = /\u062a\u0645\u062a?.*(?:\u0631\u0641\u0639|\u062a\u062d\u0645\u064a\u0644|\u0625\u0636\u0627\u0641\u0629|\u0645\u0639\u0627\u0644\u062c\u0629)|\u0628\u0646\u062c\u0627\u062d|success|uploaded|added/i;

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

  function ymd(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return ymd(parsed);
    return "";
  }

  async function visibleButtonSummary(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll("button"))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((button) => ({
        id: button.id || "",
        text: String(button.innerText || button.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
        aria: button.getAttribute("aria-label") || "",
        hasDialog: button.getAttribute("aria-haspopup") || "",
      }))
      .slice(0, 60)).catch(() => []);
  }

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
    const result = await page.waitForFunction((noticeConfig) => {
      const visibleText = Array.from(document.querySelectorAll("[role='alert'], [class*='toast'], [class*='Toast'], [class*='notification']"))
        .filter((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((el) => String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
        .join(" | ");
      const modalGone = !document.querySelector("#upload-missing-orders-submit-button");
      if (!visibleText || visibleText === noticeConfig.previousNotice) return modalGone ? { status: "unverified", text: "Missing Orders modal closed without a Taager success message" } : null;
      if (new RegExp(noticeConfig.errorPattern, "i").test(visibleText)) return { status: "error", text: visibleText };
      if (new RegExp(noticeConfig.successPattern, "i").test(visibleText)) return { status: "ok", text: visibleText };
      return modalGone ? { status: "unverified", text: visibleText || "Missing Orders modal closed without a Taager success message" } : null;
    }, {
      previousNotice: baselineNotice,
      errorPattern: MISSING_ORDERS_ERROR_NOTICE_RE.source,
      successPattern: MISSING_ORDERS_SUCCESS_NOTICE_RE.source,
    }, { timeout: 120000 }).then((handle) => handle.jsonValue()).catch(() => null);

    if (!result) throw new Error("MISSING_ORDERS_UPLOAD_UNVERIFIED: the modal was submitted, but Taager did not show a success or failure message. It was not retried to avoid duplicates.");
    if (result.status === "error") throw new Error(`MISSING_ORDERS_UPLOAD_REJECTED: ${result.text || "Taager rejected the workbook"}`);
    if (result.status !== "ok") throw new Error(`MISSING_ORDERS_UPLOAD_UNVERIFIED: ${result.text || "Taager did not show a success message"}`);
    stage("taager.missing-orders.submit", "ok", result.text || "Missing Orders workbook submitted");
    return result;
  }

  async function clickDateButton(page, index, label) {
    const buttons = page.locator('button[aria-haspopup="dialog"]');
    const count = await buttons.count().catch(() => 0);
    if (count <= index) {
      const visible = await visibleButtonSummary(page);
      log(`Taager Missing Orders ${label} date button missing. dialogButtons=${count}, visible=${JSON.stringify(visible)}`);
      throw new Error(`MISSING_ORDERS_DATE_BUTTON_MISSING: ${label}`);
    }
    await buttons.nth(index).click({ timeout: 10000 });
    await page.locator('[role="dialog"] table[role="grid"], [role="dialog"] [data-day]').first()
      .waitFor({ state: "visible", timeout: 10000 });
  }

  async function clickMonthNav(page, direction) {
    const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
    const exactSelector = direction === "previous"
      ? 'button[name="previous-month"], button[aria-label*="Previous"], button[aria-label*="السابق"]'
      : 'button[name="next-month"], button[aria-label*="Next"], button[aria-label*="التالي"]';
    const exact = visibleDialog.locator(exactSelector).first();
    if ((await exact.count().catch(() => 0)) > 0) {
      await exact.click({ timeout: 10000 });
      return;
    }
    const navButtons = visibleDialog.locator("nav button");
    const count = await navButtons.count().catch(() => 0);
    if (count >= 2) {
      await (direction === "previous" ? navButtons.first() : navButtons.nth(count - 1)).click({ timeout: 10000 });
      return;
    }
    throw new Error(`MISSING_ORDERS_MONTH_NAV_NOT_FOUND: ${direction}`);
  }

  async function clickCalendarDate(page, dateText, label) {
    const target = ymd(dateText);
    if (!target) throw new Error(`MISSING_ORDERS_INVALID_DATE: ${label}=${dateText || ""}`);
    for (let attempt = 0; attempt < 24; attempt++) {
      const visibleDialog = page.locator('[role="dialog"]:has([role="grid"])').last();
      const day = visibleDialog
        .locator(`[role="gridcell"][data-day="${target}"]:not([data-outside]):not([data-disabled]) button:not([disabled])`)
        .first();
      if ((await day.count().catch(() => 0)) > 0) {
        await day.click({ timeout: 10000 });
        await page.waitForTimeout(350);
        return target;
      }
      const inMonthCells = visibleDialog.locator('[role="gridcell"][data-day]:not([data-outside])');
      const firstCell = await inMonthCells.first().getAttribute("data-day").catch(() => null);
      const lastCell = await inMonthCells.last().getAttribute("data-day").catch(() => null);
      if (!firstCell || !lastCell) break;
      const goBack = target < firstCell;
      if (!goBack && target <= lastCell) break;
      await clickMonthNav(page, goBack ? "previous" : "next");
      await page.waitForTimeout(350);
    }
    throw new Error(`MISSING_ORDERS_DATE_NOT_FOUND: ${label} ${target}`);
  }

  async function selectDate(page, index, value, label) {
    await clickDateButton(page, index, label);
    const selected = await clickCalendarDate(page, value, label);
    await page.keyboard.press("Escape").catch(() => {});
    return selected;
  }

  async function setDateFields(page, fromDate, toDate) {
    const from = await selectDate(page, 0, fromDate, "from");
    let to = "";
    if (toDate) to = await selectDate(page, 1, toDate, "to");
    stage("taager.missing-orders.date-range", "ok", `${from} -> ${to || "open-ended"}`);
    return { from, to };
  }

  async function clickSearch(page) {
    const search = page.locator(MISSING_ORDERS_SEARCH_SELECTOR).first();
    if (!(await search.isVisible({ timeout: 15000 }).catch(() => false))) {
      const visible = await visibleButtonSummary(page);
      log(`Taager Missing Orders search button missing. Visible buttons: ${JSON.stringify(visible)}`);
      throw new Error("MISSING_ORDERS_SEARCH_BUTTON_NOT_VISIBLE");
    }
    const before = await firstMissingOrderCode(page);
    await search.click({ timeout: 10000 });
    await waitForMissingOrdersRefresh(page, before);
    stage("taager.missing-orders.search", "ok", "Missing Orders search applied");
  }

  async function firstMissingOrderCode(page) {
    return page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll("p")).filter((node) => /كود الطلب/.test(node.textContent || ""));
      for (const label of labels) {
        const value = label.parentElement && Array.from(label.parentElement.querySelectorAll("p"))
          .map((p) => String(p.textContent || "").replace(/\s+/g, " ").trim())
          .find((text) => /^\d{3,}$/.test(text));
        if (value) return value;
      }
      return "";
    }).catch(() => "");
  }

  async function waitForMissingOrdersRefresh(page, previousCode = "") {
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForFunction((oldCode) => {
      const busy = !!document.querySelector('[role="progressbar"], [class*="spinner"], [class*="loading"], [class*="Loading"]');
      const hasCard = Array.from(document.querySelectorAll("div")).some((el) => /كود الطلب/.test(el.textContent || "") && /المنتجات/.test(el.textContent || ""));
      if (busy) return false;
      if (!oldCode) return hasCard || !!document.querySelector("#cursor-pagination-btn-next");
      return hasCard;
    }, previousCode, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);
  }

  async function scrapeCurrentMissingOrderCards(page) {
    return page.evaluate(() => {
      const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
      const numberFrom = (value) => {
        const match = clean(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : "";
      };
      const valueAfterLabel = (root, labelText) => {
        const labels = Array.from(root.querySelectorAll("p")).filter((p) => clean(p.textContent).includes(labelText));
        for (const label of labels) {
          const parent = label.parentElement;
          if (!parent) continue;
          const values = Array.from(parent.querySelectorAll("p,div"))
            .map((node) => clean(node.textContent))
            .filter(Boolean)
            .filter((text) => text !== clean(label.textContent) && !text.includes(labelText));
          if (values.length) return values[0];
        }
        return "";
      };
      const cards = Array.from(document.querySelectorAll("div.w-full.rounded-lg.border.border-disabled-border.p-4"))
        .filter((card) => {
          const text = clean(card.innerText || card.textContent || "");
          return text.includes("كود الطلب") && text.includes("حالة الطلب") && text.includes("المنتجات");
        });
      return cards.map((card) => {
        const productHeader = Array.from(card.querySelectorAll("h1"))
          .map((node) => clean(node.textContent))
          .find((text) => text.includes("المنتجات")) || "";
        const productsQuantity = numberFrom(productHeader);
        const products = Array.from(card.querySelectorAll("div.flex.justify-between.text-sm"))
          .map((row) => {
            const span = row.querySelector("span[title], span.cursor-pointer");
            const raw = clean(span ? span.textContent : row.textContent);
            const match = raw.match(/(.+?)\s*x\s*(\d+(?:\.\d+)?)/i);
            const priceText = clean(row.textContent).replace(raw, "");
            return {
              sku: clean(match ? match[1] : raw).replace(/^[-\s]+|[-\s]+$/g, ""),
              qty: match ? Number(match[2]) : "",
              price: numberFrom(priceText),
              title: span ? clean(span.getAttribute("title") || "") : "",
              raw,
            };
          })
          .filter((item) => item.sku || item.raw);
        const noteLabel = Array.from(card.querySelectorAll("p"))
          .map((node) => clean(node.textContent))
          .find((text) => text.includes("ملاحظات محاولات") || text.includes("سبب الرفض") || text.includes("كود الطلب المحول")) || "";
        const note = noteLabel ? valueAfterLabel(card, noteLabel.replace(/:$/, "")) : "";
        return {
          missingOrderCode: valueAfterLabel(card, "كود الطلب"),
          convertedOrderCode: valueAfterLabel(card, "كود الطلب المحول"),
          status: valueAfterLabel(card, "حالة الطلب"),
          customerName: valueAfterLabel(card, "اسم العميل"),
          phone: valueAfterLabel(card, "رقم الهاتف"),
          source: valueAfterLabel(card, "مصدر الطلب"),
          orderDate: valueAfterLabel(card, "تاريخ الطلب"),
          noteLabel,
          note,
          productsQuantity,
          products,
        };
      });
    });
  }

  async function scrapeMissingOrdersSnapshot(page, scrapeOptions = {}) {
    stage("taager.missing-orders.snapshot", "started", "Reading Taager Missing Orders cards");
    page = await openLegacyMissingOrders(page);
    if (scrapeOptions.fromDate) {
      await setDateFields(page, scrapeOptions.fromDate, scrapeOptions.toDate || "");
      await clickSearch(page);
    }
    const rows = [];
    const seen = new Set();
    const htmlPages = [];
    for (let pageIndex = 0; pageIndex < Number(scrapeOptions.maxPages || 80); pageIndex++) {
      await waitForMissingOrdersRefresh(page);
      const html = await page.locator("section").first().evaluate((el) => el.outerHTML).catch(() => "");
      if (html) htmlPages.push({ page: pageIndex + 1, html });
      const pageRows = await scrapeCurrentMissingOrderCards(page);
      for (const row of pageRows) {
        const key = `${row.missingOrderCode}|${row.phone}|${(row.products || []).map((p) => `${p.sku}:${p.qty}`).join(",")}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ ...row, page: pageIndex + 1 });
        }
      }
      const next = page.locator(MISSING_ORDERS_NEXT_SELECTOR).first();
      const canNext = await next.isVisible({ timeout: 2000 }).catch(() => false)
        && !(await next.isDisabled().catch(() => false));
      if (!canNext) break;
      const before = await firstMissingOrderCode(page);
      await next.click({ timeout: 10000 });
      await waitForMissingOrdersRefresh(page, before);
    }
    stage("taager.missing-orders.snapshot", "ok", `Read ${rows.length} Missing Orders cards`, { total: rows.length });
    return {
      page,
      rows,
      html: htmlPages.map((item) => `<!-- Missing Orders page ${item.page} -->\n${item.html}`).join("\n\n"),
    };
  }

  return { openLegacyMissingOrders, uploadFile, scrapeMissingOrdersSnapshot };
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
  MISSING_ORDERS_SEARCH_SELECTOR,
  MISSING_ORDERS_NEXT_SELECTOR,
  MISSING_ORDERS_PREV_SELECTOR,
  MISSING_ORDERS_ERROR_NOTICE_RE,
  MISSING_ORDERS_SUCCESS_NOTICE_RE,
};
