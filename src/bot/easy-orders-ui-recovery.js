"use strict";

const { normalizePhone, normalizePhoneWithMeta, COUNTRY_PHONE_RULES } = require("./phone");
const {
  cleanText,
} = require("./easy-orders-affiliate-recovery-data");
const { normalizeProductName, productNamesMatch } = require("./parser");

const EASY_BASE = "https://app.easy-orders.net/#";
const ROWS_PER_PAGE = 100;
const DEFAULT_STEP_DELAY_MS = 900;

function ymd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return String(date || "");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function createEasyOrdersUiRecovery(options = {}) {
  const log = typeof options.log === "function" ? options.log : () => {};
  const stage = typeof options.stage === "function" ? options.stage : () => {};
  const goto = typeof options.goto === "function"
    ? options.goto
    : (page, url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).then(() => page);
  const country = options.country || "sa";
  const stepDelayMs = Number(options.stepDelayMs || DEFAULT_STEP_DELAY_MS) || DEFAULT_STEP_DELAY_MS;
  const onAttemptResult = typeof options.onAttemptResult === "function" ? options.onAttemptResult : () => {};

  function emit(stageName, status, message, extra = {}) {
    stage(stageName, status, message, extra);
  }

  function reportAttemptResult(row, recoverySource) {
    try {
      onAttemptResult({
        ...(row || {}),
        recoverySource: recoverySource || row?.recoverySource || row?.source || "",
      });
    } catch (_) {}
  }

  function isTransientEasyOrdersError(error) {
    const message = String(error && error.message || error || "").toLowerCase();
    return /timeout|target closed|page closed|browser has been closed|crash|detached|execution context was destroyed|navigation|net::|err_connection|internet_issue/.test(message);
  }

  async function reloadEasyOrdersPage(page, label) {
    const currentUrl = page.url();
    log(`EasyOrders recovery reload: ${label}; url=${currentUrl || "unknown"}`);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(async (error) => {
      log(`EasyOrders recovery reload failed for ${label}: ${error.message}; reopening current URL`);
      if (currentUrl) await goto(page, currentUrl);
      else throw error;
    });
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(stepDelayMs + 500).catch(() => {});
  }

  async function withEasyOrdersOrderRetry(page, label, action, manualFallback) {
    try {
      return await action(1);
    } catch (error) {
      if (!isTransientEasyOrdersError(error)) throw error;
      log(`EasyOrders recovery transient failure at ${label}: ${error.message}. Reloading and retrying this order once.`);
      await reloadEasyOrdersPage(page, label).catch(() => {});
      try {
        return await action(2);
      } catch (retryError) {
        if (!isTransientEasyOrdersError(retryError)) throw retryError;
        log(`EasyOrders recovery retry failed at ${label}: ${retryError.message}. Marking this order for manual review and continuing.`);
        return typeof manualFallback === "function"
          ? manualFallback(retryError)
          : { actionStatus: "skipped_manual", actionMessage: `EasyOrders page did not recover after reload: ${retryError.message}` };
      }
    }
  }

  async function openEasyOrdersPath(page, hashPath) {
    const url = `${EASY_BASE}${hashPath}`;
    await goto(page, url);
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(stepDelayMs).catch(() => {});
    return page;
  }

  async function waitForEasyOrdersDetail(page, kind, candidate, timeout = 30000) {
    const expectedUuid = cleanText(candidate.easyOrderUuid || "").toLowerCase();
    const expectedPath = kind === "missed" ? "/missed-orders/" : "/orders/";
    const ready = await page.waitForFunction(({ expectedPath, expectedUuid }) => {
      const bodyText = String(document.body && (document.body.innerText || document.body.textContent) || "");
      const href = String(window.location.href || "").toLowerCase();
      const pathOk = href.includes(expectedPath);
      const uuidOk = !expectedUuid || href.includes(expectedUuid);
      const hasRealControls = /Order ID:/i.test(bodyText) && /Edit Order/i.test(bodyText);
      const hasMissedControls = /Order Details/i.test(bodyText) && /Edit/i.test(bodyText);
      const hasAction = /Resend Order to Affiliates|Convert to Order|Completed/i.test(bodyText);
      return pathOk && uuidOk && (hasRealControls || hasMissedControls || hasAction);
    }, { expectedPath, expectedUuid }, { timeout }).then(() => true).catch(() => false);
    if (ready) {
      emit(`easyorders.recovery.${kind}.detail`, "ok", `EasyOrders ${kind} detail ready`);
      return true;
    }
    const snapshot = await page.evaluate(() => String(document.body && (document.body.innerText || document.body.textContent) || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240)).catch(() => "");
    log(`EasyOrders recovery ${kind} detail not ready: url=${page.url()} text="${snapshot}"`);
    return false;
  }

  async function ensureFilterField(page, dataKey, label) {
    const field = page.locator(`[data-source="${dataKey}"] input[type="date"]`).first();
    if (await field.isVisible({ timeout: 1000 }).catch(() => false)) return;
    const addFilter = page.locator('button[aria-label="add filter"], button.add-filter').first();
    await addFilter.waitFor({ state: "visible", timeout: 15000 });
    await addFilter.click({ timeout: 10000 });
    if (await field.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press("Escape").catch(() => {});
      return;
    }
    const item = page.locator(`[role="menuitem"][data-key="${dataKey}"], li[data-key="${dataKey}"]`).first();
    const itemVisible = await item.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
    if (!itemVisible && await field.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press("Escape").catch(() => {});
      return;
    }
    if (!itemVisible) throw new Error(`EasyOrders filter menu item not visible for ${label}`);
    await item.click({ timeout: 10000 });
    await page.locator(`[data-source="${dataKey}"] input[type="date"]`).first()
      .waitFor({ state: "visible", timeout: 10000 });
    log(`EasyOrders recovery: added ${label} filter`);
  }

  async function setDateInput(page, dataKey, value) {
    const selector = `[data-source="${dataKey}"] input[type="date"]`;
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.evaluate(({ selector: inputSelector, value: nextValue }) => {
      const input = document.querySelector(inputSelector);
      if (!input) return false;
      const proto = Object.getPrototypeOf(input);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor && descriptor.set) descriptor.set.call(input, nextValue);
      else input.value = nextValue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, { selector, value });
    await page.waitForTimeout(Math.min(stepDelayMs, 700));
  }

  async function applyDateFilters(page, fromDate, toDate) {
    await ensureFilterField(page, "created_at$gte", "Start Date");
    await ensureFilterField(page, "created_at$lte", "End Date");
    await setDateInput(page, "created_at$gte", ymd(fromDate));
    await setDateInput(page, "created_at$lte", ymd(toDate));
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(stepDelayMs);
  }

  async function setRowsPerPage100(page) {
    const current = await page.locator(".MuiTablePagination-root input.MuiSelect-nativeInput").first()
      .getAttribute("value", { timeout: 3000 }).catch(() => "");
    if (String(current) === String(ROWS_PER_PAGE)) return;
    const trigger = page.locator(".MuiTablePagination-root [role='button'][aria-haspopup='listbox']").first();
    if (!(await trigger.isVisible({ timeout: 5000 }).catch(() => false))) return;
    await trigger.click({ timeout: 10000 });
    const option = page.locator(`[role="option"][data-value="${ROWS_PER_PAGE}"]`).first();
    await option.waitFor({ state: "visible", timeout: 10000 });
    await option.click({ timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(stepDelayMs + 300);
  }

  async function openList(page, kind, fromDate, toDate) {
    const hashPath = kind === "missed" ? "/missed-orders" : "/orders";
    emit(`easyorders.recovery.${kind}.list`, "started", `Opening EasyOrders ${kind} list`);
    await openEasyOrdersPath(page, hashPath);
    await applyDateFilters(page, fromDate, toDate);
    await setRowsPerPage100(page);
    await page.locator(".RaDatagrid-tableWrapper table.RaDatagrid-table, table").first()
      .waitFor({ state: "visible", timeout: 20000 });
    emit(`easyorders.recovery.${kind}.list`, "ok", `EasyOrders ${kind} list ready`);
    return page;
  }

  async function readMissedRows(page) {
    return page.evaluate(() => {
      const text = (el) => String(el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
      const rows = Array.from(document.querySelectorAll(".RaDatagrid-tableWrapper tbody tr.RaDatagrid-clickableRow, tbody tr.RaDatagrid-clickableRow"));
      return rows.map((row, index) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const status = text(cells[1]);
        return {
          index,
          status,
          name: text(row.querySelector(".column-full_name")) || text(cells[2]),
          phone: text(row.querySelector(".column-phone")) || text(cells[3]),
          createdAt: text(row.querySelector(".column-created_at")) || text(cells[cells.length - 1]),
        };
      });
    });
  }

  async function readRealRows(page) {
    return page.evaluate(() => {
      const text = (el) => String(el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
      const rows = Array.from(document.querySelectorAll(".RaDatagrid-tableWrapper tbody tr.RaDatagrid-clickableRow, tbody tr.RaDatagrid-clickableRow"));
      return rows.map((row, index) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const customerText = text(cells[3]);
        return {
          index,
          status: text(cells[1]),
          shortId: text(row.querySelector(".column-short_id")) || text(cells[2]),
          customerText,
          phone: customerText,
          createdAt: text(row.querySelector(".column-created_at")) || text(cells[cells.length - 1]),
          text: text(row),
        };
      });
    });
  }

  async function goToNextPage(page) {
    const next = page.locator('button[aria-label="Next"]:not([disabled])').first();
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) {
      await next.click({ timeout: 10000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1000);
      return true;
    }
    return false;
  }

  async function waitForToast(page, previousText = "", timeout = 15000) {
    return page.waitForFunction((previous) => {
      const messages = Array.from(document.querySelectorAll(".MuiSnackbarContent-message, [role='alert']"))
        .map((el) => String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const next = messages.find((msg) => msg && msg !== previous);
      return next || null;
    }, previousText, { timeout }).then((handle) => handle.jsonValue()).catch(() => "");
  }

  async function currentToastText(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll(".MuiSnackbarContent-message, [role='alert']"))
      .map((el) => String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" | ")).catch(() => "");
  }

  function itemMatchesReference(modalItem, reference) {
    const haystack = `${modalItem.text} ${modalItem.productName} ${modalItem.sku}`.toLowerCase();
    const sku = cleanText(reference.sku).toLowerCase();
    if (sku && haystack.includes(sku)) return true;
    const refName = normalizeProductName(reference.productName).toLowerCase();
    const modalName = normalizeProductName(modalItem.productName || modalItem.text).toLowerCase();
    return !!refName && !!modalName && productNamesMatch(refName, modalName);
  }

  function numbersClose(a, b) {
    const left = Number(a);
    const right = Number(b);
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.009;
  }

  function normalizeComparableText(value) {
    return cleanText(value).replace(/\s+/g, " ").trim();
  }

  function easyOrdersPhone(value) {
    const normalized = normalizePhone(value, country);
    if (!normalized) return cleanText(value);
    const phoneRules = COUNTRY_PHONE_RULES[country] || {};
    return phoneRules.domesticPrefix ? `${phoneRules.domesticPrefix}${normalized}` : normalized;
  }

  async function inspectModalItems(page) {
    return page.evaluate(() => {
      const text = (el) => String(el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
      const qtyInputs = Array.from(document.querySelectorAll('input[name^="cart_items["][name$="].quantity"]'));
      return qtyInputs.map((qtyInput) => {
        const match = String(qtyInput.name || "").match(/cart_items\[(\d+)\]/);
        const index = match ? Number(match[1]) : 0;
        const priceInput = document.querySelector(`input[name="cart_items[${index}].price"]`);
        let container = qtyInput.closest("tr") || qtyInput.closest(".MuiCard-root") || qtyInput.parentElement;
        for (let node = qtyInput.parentElement; node && node !== document.body; node = node.parentElement) {
          const t = text(node);
          if (/Product SKU:|Choose Products|Cart Items|Price|Quantity/i.test(t) && t.length > text(container).length) {
            container = node;
          }
          if (t.length > 50 && /Product SKU:|Cart Items/i.test(t)) break;
        }
        const allText = text(container);
        const skuMatch = allText.match(/Product SKU:\s*([A-Za-z0-9_.-]+)/i);
        return {
          index,
          qty: Number(qtyInput.value || 0) || 0,
          price: Number(priceInput && priceInput.value || 0) || 0,
          sku: skuMatch ? skuMatch[1] : "",
          productName: allText.replace(/Product SKU:.*/i, "").trim(),
          text: allText,
        };
      });
    });
  }

  async function fillInputValue(page, name, value) {
    await page.evaluate(({ name: inputName, value: nextValue }) => {
      const input = Array.from(document.querySelectorAll("input, textarea"))
        .find((el) => el && el.name === inputName);
      if (!input) return false;
      const proto = Object.getPrototypeOf(input);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      const valueText = String(nextValue);
      if (descriptor && descriptor.set) descriptor.set.call(input, valueText);
      else input.value = valueText;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, { name, value });
  }

  async function inspectNamedField(page, name) {
    return page.evaluate((inputName) => {
      const input = Array.from(document.querySelectorAll("input, textarea"))
        .find((el) => el && el.name === inputName);
      return input ? String(input.value || "") : null;
    }, name).catch(() => null);
  }

  async function maybeEditNamedField(page, name, expectedValue, edits, options = {}) {
    const expected = cleanText(expectedValue);
    if (!expected) return;
    const current = await inspectNamedField(page, name);
    if (current == null) return;
    const nextValue = options.phone ? easyOrdersPhone(expected) : expected;
    let currentComparable = normalizeComparableText(current);
    let expectedComparable = normalizeComparableText(expected);
    let reason = "matched_normal_flow_prepared_order";
    if (options.phone) {
      const currentMeta = normalizePhoneWithMeta(current, country);
      const expectedMeta = normalizePhoneWithMeta(expected, country);
      currentComparable = currentMeta ? currentMeta.digits : "";
      expectedComparable = expectedMeta ? expectedMeta.digits : "";
      const currentDigits = cleanText(current).replace(/\D/g, "");
      const nextDigits = cleanText(nextValue).replace(/\D/g, "");
      const samePhoneButDisplayedWrong = !!currentMeta
        && currentComparable === expectedComparable
        && currentDigits !== nextDigits;
      if (!expectedComparable || (currentComparable === expectedComparable && !samePhoneButDisplayedWrong)) return;
      if (samePhoneButDisplayedWrong) {
        reason = currentMeta.uncertain === true
          ? "phone_rescued_trailing_zero_rewrite"
          : "phone_display_rewrite";
      }
    } else if (!expectedComparable || currentComparable === expectedComparable) {
      return;
    }
    await fillInputValue(page, name, nextValue);
    edits.push({
      field: name,
      from: current,
      to: nextValue,
      reason,
    });
  }

  async function inspectAndMaybeEditCart(page, expectedItems = []) {
    const modalItems = await inspectModalItems(page);
    const edits = [];
    const skippedEdits = [];
    const noReference = [];
    const manualReview = [];
    for (const modalItem of modalItems) {
      const reference = (expectedItems || []).find((item) => item && item.trusted && itemMatchesReference(modalItem, item));
      if (!reference) {
        noReference.push(modalItem);
        log(`EasyOrders recovery send as-is: modal item ${modalItem.index} has no trusted normal-flow reference; keeping quantity=${modalItem.qty}, price=${modalItem.price}.`);
        continue;
      }
      const expectedQty = Number(reference.qty || 1) || 1;
      if (expectedQty > 10) {
        manualReview.push({
          index: modalItem.index,
          qty: expectedQty,
          priceKept: modalItem.price,
          productName: modalItem.productName || reference.productName || "",
          sku: modalItem.sku || reference.sku || "",
          reason: "normal_flow_prepared_quantity_is_suspicious",
          referenceSource: reference.referenceSource || "",
        });
        log(`EasyOrders recovery manual review: ${modalItem.sku || reference.sku || modalItem.productName || reference.productName || "item"} prepared quantity ${expectedQty} is suspicious; leaving modal untouched.`);
        continue;
      }
      if (expectedQty && modalItem.qty !== expectedQty) {
        await fillInputValue(page, `cart_items[${modalItem.index}].quantity`, expectedQty);
        edits.push({
          index: modalItem.index,
          field: "quantity",
          from: modalItem.qty,
          to: expectedQty,
          reason: "matched_normal_flow_prepared_order",
          priceKept: modalItem.price,
          referenceSource: reference.referenceSource || "",
        });
      }
      const expectedPrice = Number(reference.unitPrice || (reference.qty ? (Number(reference.subtotal || 0) / Number(reference.qty || 1)) : 0)) || 0;
      if (expectedPrice > 0 && !numbersClose(modalItem.price, expectedPrice)) {
        await fillInputValue(page, `cart_items[${modalItem.index}].price`, expectedPrice);
        edits.push({
          index: modalItem.index,
          field: "price",
          from: modalItem.price,
          to: expectedPrice,
          reason: "matched_normal_flow_prepared_order",
          referenceSource: reference.referenceSource || "",
        });
      }
      if (!expectedQty) {
        skippedEdits.push({
          index: modalItem.index,
          field: "quantity",
          reason: "normal_flow_prepared_order_has_no_quantity",
          priceKept: modalItem.price,
          referenceSource: reference.referenceSource || "",
        });
      }
    }
    if (edits.length) {
      log(`EasyOrders recovery edits: ${edits.map((edit) => `${edit.field}[${edit.index}] ${edit.from}->${edit.to}`).join("; ")}`);
      await page.waitForTimeout(stepDelayMs);
    }
    if (skippedEdits.length) {
      log(`EasyOrders recovery skipped edits: ${skippedEdits.map((edit) => `${edit.field}[${edit.index}] ${edit.reason}`).join("; ")}`);
    }
    return { modalItems, edits, skippedEdits, noReference, manualReview };
  }

  async function editOrderIfNeeded(page, expectedOrder, buttonName) {
    const edit = page.getByRole("button", { name: buttonName }).first();
    if (!(await edit.isVisible({ timeout: 15000 }).catch(() => false))) {
      return { edited: false, sentAsIs: false, manualReview: true, validationErrors: [], message: "EasyOrders edit button not available" };
    }
    await edit.click({ timeout: 10000 });
    const modalReady = await page.locator('input[name^="cart_items["][name$="].quantity"]').first()
      .waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
    if (!modalReady) {
      await page.keyboard.press("Escape").catch(() => {});
      return { edited: false, sentAsIs: false, manualReview: true, validationErrors: [], message: "EasyOrders edit modal did not expose cart item inputs" };
    }
    const fieldEdits = [];
    await maybeEditNamedField(page, "full_name", expectedOrder.name, fieldEdits);
    await maybeEditNamedField(page, "phone", expectedOrder.normPhone || expectedOrder.phone || expectedOrder.rawPhone, fieldEdits, { phone: true });
    const expectedCity = expectedOrder.city || expectedOrder.region || "";
    const expectedAddress = expectedOrder.address || expectedCity;
    await maybeEditNamedField(page, "government", expectedCity, fieldEdits);
    await maybeEditNamedField(page, "address", expectedAddress, fieldEdits);
    const inspection = await inspectAndMaybeEditCart(page, expectedOrder.items || []);
    const validationErrors = [];
    if (inspection.noReference.length > 0) {
      const unknownProducts = inspection.noReference
        .map((item) => item.sku || item.productName || item.text)
        .filter(Boolean)
        .join(" | ");
      log(`EasyOrders recovery uncertain: ${expectedOrder.name || expectedOrder.normPhone || expectedOrder.easyShortId || "order"} has no trusted product reference (${unknownProducts || "unknown product"}); canceling without save/send.`);
      await page.getByRole("button", { name: /^Cancel$/i }).first().click({ timeout: 10000 }).catch(async () => {
        await page.keyboard.press("Escape").catch(() => {});
      });
      await page.waitForTimeout(Math.min(stepDelayMs, 700));
      return {
        edited: false,
        sentAsIs: false,
        manualReview: true,
        validationErrors,
        edits: fieldEdits,
        skippedEdits: inspection.skippedEdits,
        manualReviewItems: inspection.noReference.map((item) => ({
          index: item.index,
          qty: item.qty,
          priceKept: item.price,
          productName: item.productName || item.text || "",
          sku: item.sku || "",
          reason: "no_trusted_product_reference",
        })),
        modalItems: inspection.modalItems,
        message: "no_trusted_product_reference",
      };
    }
    if (inspection.manualReview.length > 0) {
      const reviewReasons = [...new Set(inspection.manualReview.map((item) => item.reason).filter(Boolean))].join(", ");
      await page.getByRole("button", { name: /^Cancel$/i }).first().click({ timeout: 10000 }).catch(async () => {
        await page.keyboard.press("Escape").catch(() => {});
      });
      await page.waitForTimeout(Math.min(stepDelayMs, 700));
      return {
        edited: false,
        sentAsIs: false,
        manualReview: true,
        validationErrors,
        edits: fieldEdits,
        skippedEdits: inspection.skippedEdits,
        manualReviewItems: inspection.manualReview,
        modalItems: inspection.modalItems,
        message: reviewReasons || "EasyOrders modal needs manual review",
      };
    }
    const allEdits = [...fieldEdits, ...inspection.edits];
    if (fieldEdits.length > 0) {
      log(`EasyOrders recovery field edits: ${fieldEdits.map((edit) => `${edit.field} "${cleanText(edit.from)}"->"${cleanText(edit.to)}"`).join("; ")}`);
    }
    if (allEdits.length === 0) {
      log(`EasyOrders recovery modal check clean: ${expectedOrder.name || expectedOrder.normPhone || expectedOrder.easyShortId || "order"} needs no edit; canceling modal before send.`);
    }
    if (allEdits.length > 0) {
      const before = await currentToastText(page);
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /^Save$/i }).first().click({ timeout: 10000 });
      const toast = await waitForToast(page, before, 12000);
      if (toast && !/saved|updated|success|order/i.test(toast)) {
        validationErrors.push({ message: toast });
      }
      log(`EasyOrders recovery modal save result: ${toast || "no toast"}`);
      if (validationErrors.length > 0) {
        await page.getByRole("button", { name: /^Cancel$/i }).first().click({ timeout: 5000 }).catch(async () => {
          await page.keyboard.press("Escape").catch(() => {});
        });
        return {
          edited: true,
          sentAsIs: false,
          manualReview: true,
          validationErrors,
          edits: allEdits,
          skippedEdits: inspection.skippedEdits,
          manualReviewItems: [],
          modalItems: inspection.modalItems,
          message: validationErrors.map((row) => row.message).filter(Boolean).join(" | ") || "EasyOrders save validation failed",
        };
      }
      await page.waitForTimeout(stepDelayMs);
      await page.locator('input[name^="cart_items["][name$="].quantity"]').first()
        .waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
    } else {
      await page.getByRole("button", { name: /^Cancel$/i }).first().click({ timeout: 10000 }).catch(async () => {
        await page.keyboard.press("Escape").catch(() => {});
      });
      await page.waitForTimeout(Math.min(stepDelayMs, 700));
    }
    return {
      edited: allEdits.length > 0,
      sentAsIs: false,
      manualReview: false,
      validationErrors,
      edits: allEdits,
      skippedEdits: inspection.skippedEdits,
      manualReviewItems: [],
      modalItems: inspection.modalItems,
    };
  }

  async function resendRealOrder(page, candidate, options = {}) {
    const url = candidate.easyOrderUuid
      ? `${EASY_BASE}/orders/${candidate.easyOrderUuid}`
      : candidate.detailUrl;
    if (!url) return { ...candidate, actionStatus: "skipped_manual", actionMessage: "Real order has no EasyOrders UUID/detail URL", attempts: options.attempt || 1 };
    const skus = (candidate.items || []).map((item) => item.sku).filter(Boolean).join(", ");
    emit("easyorders.recovery.real.detail", "started", `Opening real order ${candidate.easyShortId || candidate.easyOrderUuid}`);
    log(`EasyOrders recovery real target: ${candidate.name || ""} / ${candidate.normPhone || candidate.phone || ""} / ${skus || "no SKU"} / ${candidate.easyOrderUuid || candidate.detailUrl || ""}`);
    await goto(page, url);
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await page.locator("body").waitFor({ state: "visible", timeout: 10000 });
    if (!(await waitForEasyOrdersDetail(page, "real", candidate))) {
      return { ...candidate, detailUrl: page.url(), actionStatus: "skipped_manual", actionMessage: "EasyOrders real detail page did not finish loading controls", attempts: options.attempt || 1 };
    }
    if (options.edit !== false) {
      const editResult = await editOrderIfNeeded(page, candidate, /^Edit Order$/i);
      candidate.sentAsIs = editResult.sentAsIs;
      candidate.validationErrors = (candidate.validationErrors || []).concat(editResult.validationErrors || []);
      candidate.editResult = editResult;
      if (editResult.manualReview) {
        log(`EasyOrders recovery real manual review: ${candidate.easyShortId || candidate.easyOrderUuid || candidate.normPhone || ""} -> ${editResult.message || "EasyOrders modal needs manual review"}`);
        return {
          ...candidate,
          detailUrl: page.url(),
          actionStatus: "skipped_manual",
          actionMessage: editResult.message || "EasyOrders modal needs manual review",
          manualReviewItems: editResult.manualReviewItems || [],
          attempts: options.attempt || 1,
        };
      }
    }
    const button = page.getByRole("button", { name: /^Resend Order to Affiliates$/i }).first();
    if (!(await button.isVisible({ timeout: 10000 }).catch(() => false))) {
      log(`EasyOrders recovery real manual review: ${candidate.easyShortId || candidate.easyOrderUuid || candidate.normPhone || ""} -> Resend Order to Affiliates button not available`);
      return { ...candidate, detailUrl: page.url(), actionStatus: "skipped_manual", actionMessage: "Resend Order to Affiliates button not available", attempts: options.attempt || 1 };
    }
    const before = await currentToastText(page);
    await button.click({ timeout: 10000 });
    const toast = await waitForToast(page, before, 20000);
    log(`EasyOrders recovery real resend result: ${candidate.easyShortId || candidate.easyOrderUuid || candidate.normPhone || ""} -> ${toast || "Resend clicked, no toast captured"}`);
    return {
      ...candidate,
      detailUrl: page.url(),
      actionStatus: /order sent/i.test(toast) ? "sent" : "sent_unverified",
      actionMessage: toast || "Resend clicked",
      attempts: options.attempt || 1,
    };
  }

  async function convertMissedDetail(page, candidate, options = {}) {
    await page.locator("body").waitFor({ state: "visible", timeout: 10000 });
    await waitForEasyOrdersDetail(page, "missed", candidate, 20000);
    const completed = await page.locator(".MuiChip-label:has-text('Completed'), text=Completed").first()
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (completed) {
      return { ...candidate, status: "Completed", actionStatus: "skipped_completed", actionMessage: "Missed order is completed", attempts: options.attempt || 1 };
    }
    if (options.edit !== false) {
      const editResult = await editOrderIfNeeded(page, candidate, /^Edit$/i);
      candidate.sentAsIs = editResult.sentAsIs;
      candidate.validationErrors = (candidate.validationErrors || []).concat(editResult.validationErrors || []);
      candidate.editResult = editResult;
      if (editResult.manualReview) {
        log(`EasyOrders recovery missed manual review: ${candidate.name || candidate.normPhone || ""} -> ${editResult.message || "EasyOrders modal needs manual review"}`);
        return {
          ...candidate,
          detailUrl: page.url(),
          actionStatus: "skipped_manual",
          actionMessage: editResult.message || "EasyOrders modal needs manual review",
          manualReviewItems: editResult.manualReviewItems || [],
          attempts: options.attempt || 1,
        };
      }
    }
    await page.waitForTimeout(stepDelayMs);
    await waitForEasyOrdersDetail(page, "missed", candidate, 15000);
    const convert = page.getByRole("button", { name: /^Convert to Order$/i }).first();
    if (!(await convert.isVisible({ timeout: 5000 }).catch(() => false))) {
      log(`EasyOrders recovery missed already-real check: ${candidate.name || candidate.normPhone || ""} -> Convert to Order button not available`);
      return {
        ...candidate,
        detailUrl: page.url(),
        actionStatus: "already_in_real_orders_unverified",
        actionMessage: "Convert to Order button not available; likely already moved from missed orders to real orders",
        retryAsReal: true,
        missingConvertNeedsRealRetry: true,
        attempts: options.attempt || 1,
      };
    }
    const before = await currentToastText(page);
    await convert.click({ timeout: 10000 });
    const toast = await waitForToast(page, before, 20000);
    log(`EasyOrders recovery missed convert result: ${candidate.name || candidate.normPhone || ""} -> ${toast || "Convert clicked, no toast captured"}`);
    return {
      ...candidate,
      detailUrl: page.url(),
      actionStatus: toast && /error|failed|validation|min|max|required/i.test(toast) ? "convert_error" : "converted",
      actionMessage: toast || "Convert clicked",
      attempts: options.attempt || 1,
    };
  }

  function missedRowScore(candidate, row) {
    const candidatePhone = normalizePhone(candidate.normPhone || candidate.phone || candidate.rawPhone || "", country);
    const rowPhone = normalizePhone(row.phone || "", country);
    if (!candidatePhone || !rowPhone || candidatePhone !== rowPhone) return 0;
    let score = 10;
    const candidateName = normalizeComparableText(candidate.name).toLowerCase();
    const rowName = normalizeComparableText(row.name).toLowerCase();
    if (candidateName && rowName) {
      if (!(candidateName === rowName || candidateName.includes(rowName) || rowName.includes(candidateName))) return 0;
      score += 5;
    }
    const candidateDay = String(candidate.easyCreatedAt || candidate.createdAt || "").slice(0, 10);
    const rowDayMatch = cleanText(row.createdAt).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const rowDay = rowDayMatch ? `${rowDayMatch[3]}-${String(rowDayMatch[1]).padStart(2, "0")}-${String(rowDayMatch[2]).padStart(2, "0")}` : "";
    if (candidateDay && rowDay) {
      if (candidateDay !== rowDay) return 0;
      score += 3;
    }
    return score;
  }

  function rowDayFromText(value) {
    const rowDayMatch = cleanText(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return rowDayMatch ? `${rowDayMatch[3]}-${String(rowDayMatch[1]).padStart(2, "0")}-${String(rowDayMatch[2]).padStart(2, "0")}` : "";
  }

  function realRowScore(candidate, row) {
    const candidatePhone = normalizePhone(candidate.normPhone || candidate.phone || candidate.rawPhone || "", country);
    const rowPhone = normalizePhone(`${row.phone || ""} ${row.text || ""}`, country);
    if (!candidatePhone || !rowPhone || candidatePhone !== rowPhone) return 0;
    let score = 10;
    const candidateName = normalizeComparableText(candidate.name).toLowerCase();
    const rowText = normalizeComparableText(row.customerText || row.text).toLowerCase();
    if (candidateName && rowText && (rowText.includes(candidateName) || candidateName.includes(rowText.replace(/\d+/g, "").trim()))) {
      score += 5;
    }
    const candidateDay = String(candidate.easyCreatedAt || candidate.createdAt || "").slice(0, 10);
    const rowDay = rowDayFromText(row.createdAt);
    if (candidateDay && rowDay) {
      if (candidateDay !== rowDay) return 0;
      score += 3;
    }
    return score;
  }

  function findPreparedRealRowMatch(candidate, rows) {
    let best = null;
    let bestScore = 0;
    for (const row of rows || []) {
      const score = realRowScore(candidate, row);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    return bestScore >= 10 ? best : null;
  }

  function findPreparedMissedMatch(row, pending) {
    let best = null;
    let bestScore = 0;
    for (const candidate of pending) {
      const score = missedRowScore(candidate, row);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= 10 ? best : null;
  }

  async function processCompletedMissedAsReal(page, candidates, fromDate, toDate) {
    const list = candidates || [];
    const attempted = [];
    const skippedManual = [];
    if (!list.length) return { attempted, skippedManual };
    log(`EasyOrders recovery: ${list.length} completed missed rows will be searched in real orders for resend.`);
    await openList(page, "real", fromDate, toDate);
    const pending = [...list];
    let pageNo = 1;
    const maxPages = 100;
    while (pageNo <= maxPages && pending.length > 0) {
      const rows = await readRealRows(page);
      log(`EasyOrders recovery real lookup page ${pageNo}: ${rows.length} rows, completed missed pending=${pending.length}`);
      for (const candidate of [...pending]) {
        const row = findPreparedRealRowMatch(candidate, rows);
        if (!row) continue;
        pending.splice(pending.indexOf(candidate), 1);
        const result = await withEasyOrdersOrderRetry(
          page,
          `completed missed as real ${candidate.name || candidate.normPhone || row.shortId || ""}`,
          async (recoveryAttempt) => {
            if (!(recoveryAttempt > 1 && /#\/orders\/[^/]+/i.test(page.url()))) {
              const tableRows = page.locator(".RaDatagrid-tableWrapper tbody tr.RaDatagrid-clickableRow, tbody tr.RaDatagrid-clickableRow");
              await tableRows.nth(row.index).click({ timeout: 10000 });
              await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
              await page.waitForTimeout(stepDelayMs);
            }
            const detailUrl = page.url();
            const uuidMatch = detailUrl.match(/\/orders\/([^/?#]+)/i);
            return resendRealOrder(page, {
              ...candidate,
              recoverySource: "missed",
              status: "Completed",
              detailUrl,
              easyOrderUuid: candidate.easyOrderUuid || (uuidMatch ? uuidMatch[1] : ""),
              retryAsReal: true,
            }, { attempt: 1, edit: true });
          },
          (error) => ({
            ...candidate,
            recoverySource: "missed",
            detailUrl: page.url(),
            status: "Completed",
            actionStatus: "skipped_manual",
            actionMessage: `Completed missed order real lookup did not recover after reload: ${error.message}`,
            retryAsReal: true,
            attempts: 1,
          })
        );
        const reportedResult = { ...result, recoverySource: "missed", retryAsReal: true };
        if (result.actionStatus === "skipped_manual") skippedManual.push(reportedResult);
        else attempted.push(reportedResult);
        reportAttemptResult(reportedResult, "missed");
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(async () => {
          await openList(page, "real", fromDate, toDate);
          for (let i = 1; i < pageNo; i++) await goToNextPage(page);
        });
        await page.locator(".RaDatagrid-tableWrapper table.RaDatagrid-table, table").first()
          .waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      }
      if (!(await goToNextPage(page))) break;
      pageNo++;
    }
    for (const candidate of pending) {
      const pendingResult = {
        ...candidate,
        recoverySource: "missed",
        status: "Completed",
        actionStatus: "skipped_manual",
        actionMessage: "Missed row is Completed, but matching real order was not found for resend",
      };
      skippedManual.push(pendingResult);
      reportAttemptResult(pendingResult, "missed");
    }
    return { attempted, skippedManual };
  }

  async function processMissedOrders(page, candidates, fromDate, toDate) {
    emit("easyorders.recovery.missed", "started", `Processing ${candidates.length} prepared missed orders`);
    if (!Array.isArray(candidates) || candidates.length === 0) {
      emit("easyorders.recovery.missed", "ok", "No prepared missed orders need recovery");
      return { attempted: [], skippedCompleted: [], skippedManual: [] };
    }
    await openList(page, "missed", fromDate, toDate);
    const pending = [...candidates];
    const attempted = [];
    const skippedManual = [];
    let pageNo = 1;
    const maxPages = 100;
    while (pageNo <= maxPages && pending.length > 0) {
      const rows = await readMissedRows(page);
      log(`EasyOrders recovery missed page ${pageNo}: ${rows.length} rows, pending prepared targets=${pending.length}`);
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const candidate = findPreparedMissedMatch(row, pending);
        if (!candidate) continue;
        const pendingIndex = pending.indexOf(candidate);
        if (pendingIndex >= 0) pending.splice(pendingIndex, 1);
        log(`EasyOrders recovery missed matched prepared order: ${candidate.name || row.name} / ${candidate.normPhone || row.phone} / ${candidate.productName || ""}`);
        if (/^completed$/i.test(cleanText(row.status))) {
          const completedResult = {
            ...candidate,
            status: "Completed",
            actionStatus: "completed_waiting_verification",
            actionMessage: "Matched missed row is already Completed; will search real orders only if Taager verification misses it",
            completedNeedsRealRetry: true,
            retryAsReal: true,
            attempts: 1,
          };
          attempted.push(completedResult);
          reportAttemptResult(completedResult, "missed");
          continue;
        }
        const converted = await withEasyOrdersOrderRetry(
          page,
          `missed order ${candidate.name || candidate.normPhone || row.phone || index + 1}`,
          async (recoveryAttempt) => {
            if (!(recoveryAttempt > 1 && /#\/missed-orders\/[^/]+/i.test(page.url()))) {
              const tableRows = page.locator(".RaDatagrid-tableWrapper tbody tr.RaDatagrid-clickableRow, tbody tr.RaDatagrid-clickableRow");
              await tableRows.nth(index).click({ timeout: 10000 });
              await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
              await page.waitForTimeout(stepDelayMs);
            }
            const detailUrl = page.url();
            return convertMissedDetail(page, { ...candidate, detailUrl }, { attempt: 1, edit: true });
          },
          (error) => ({
            ...candidate,
            detailUrl: page.url(),
            actionStatus: "skipped_manual",
            actionMessage: `EasyOrders missed detail did not recover after reload: ${error.message}`,
            attempts: 1,
          })
        );
        let reportedConverted = converted;
        if (converted.actionStatus === "skipped_completed") {
          reportedConverted = {
            ...converted,
            actionStatus: "completed_waiting_verification",
            actionMessage: "Missed detail is already Completed; will search real orders only if Taager verification misses it",
            completedNeedsRealRetry: true,
            retryAsReal: true,
          };
          attempted.push(reportedConverted);
        }
        else if (converted.actionStatus === "skipped_manual") skippedManual.push(converted);
        else attempted.push(converted);
        reportAttemptResult(reportedConverted, "missed");
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(async () => {
          await openList(page, "missed", fromDate, toDate);
          for (let i = 1; i < pageNo; i++) await goToNextPage(page);
        });
        await page.locator(".RaDatagrid-tableWrapper table.RaDatagrid-table, table").first()
          .waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(Math.min(stepDelayMs, 800));
      }
      if (!(await goToNextPage(page))) break;
      pageNo++;
    }
    for (const candidate of pending) {
      const pendingResult = { ...candidate, actionStatus: "skipped_manual", actionMessage: "Prepared missed order was not found in EasyOrders missed table" };
      skippedManual.push(pendingResult);
      reportAttemptResult(pendingResult, "missed");
    }
    const completedWaiting = attempted.filter((row) => row.completedNeedsRealRetry).length;
    const alreadyRealWaiting = attempted.filter((row) => row.missingConvertNeedsRealRetry).length;
    emit("easyorders.recovery.missed", "ok", `Prepared missed attempted=${attempted.length}, completed-waiting-verification=${completedWaiting}, already-real-waiting-verification=${alreadyRealWaiting}, manual=${skippedManual.length}`);
    return { attempted, skippedCompleted: [], skippedManual };
  }

  async function processRealOrders(page, candidates) {
    emit("easyorders.recovery.real", "started", `Processing ${candidates.length} real orders`);
    const attempted = [];
    const skippedManual = [];
    const list = candidates || [];
    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      const skus = (candidate.items || []).map((item) => item.sku).filter(Boolean).join(", ");
      log(`EasyOrders recovery real prepared ${i + 1}/${list.length}: ${candidate.name || ""} / ${candidate.normPhone || candidate.phone || ""} / ${skus || "no SKU"}`);
      const result = await withEasyOrdersOrderRetry(
        page,
        `real order ${candidate.easyShortId || candidate.easyOrderUuid || candidate.normPhone || i + 1}`,
        () => resendRealOrder(page, candidate, { attempt: 1, edit: true }),
        (error) => ({
          ...candidate,
          detailUrl: page.url(),
          actionStatus: "skipped_manual",
          actionMessage: `EasyOrders real detail did not recover after reload: ${error.message}`,
          attempts: 1,
        })
      );
      if (result.actionStatus === "skipped_manual") {
        log(`EasyOrders recovery real skipped ${i + 1}/${list.length}: ${result.actionMessage || "manual review"}`);
        skippedManual.push(result);
      }
      else attempted.push(result);
      reportAttemptResult(result, "real");
      if ((i + 1) % 25 === 0 && i + 1 < list.length) {
        log(`EasyOrders recovery real cooldown: processed ${i + 1}/${list.length}; pausing briefly to keep EasyOrders stable.`);
        await page.waitForTimeout(3500).catch(() => {});
      }
    }
    emit("easyorders.recovery.real", "ok", `Real orders attempted: ${attempted.length}`);
    return { attempted, skippedManual };
  }

  async function retryAttempts(page, attempts, options = {}) {
    const retried = [];
    for (const attempt of attempts || []) {
      if (attempt.completedNeedsRealRetry || attempt.missingConvertNeedsRealRetry) {
        const completedRealResult = await processCompletedMissedAsReal(page, [attempt], options.fromDate, options.toDate);
        retried.push(...completedRealResult.attempted, ...completedRealResult.skippedManual);
        continue;
      }
      if ((attempt.recoverySource || attempt.source) === "missed" && !attempt.retryAsReal) {
        if (!attempt.detailUrl) {
          retried.push({ ...attempt, actionStatus: "retry_skipped", actionMessage: "Missing missed-order detail URL", attempts: 2 });
          continue;
        }
        await goto(page, attempt.detailUrl);
        retried.push(await withEasyOrdersOrderRetry(
          page,
          `retry missed order ${attempt.name || attempt.normPhone || attempt.detailUrl}`,
          () => convertMissedDetail(page, { ...attempt, attempts: 2 }, { attempt: 2, edit: false }),
          (error) => ({ ...attempt, actionStatus: "retry_skipped", actionMessage: `EasyOrders missed retry did not recover after reload: ${error.message}`, attempts: 2 })
        ));
      } else {
        retried.push(await withEasyOrdersOrderRetry(
          page,
          `retry real order ${attempt.easyShortId || attempt.easyOrderUuid || attempt.normPhone || ""}`,
          () => resendRealOrder(page, { ...attempt, attempts: 2 }, { attempt: 2, edit: false }),
          (error) => ({ ...attempt, actionStatus: "retry_skipped", actionMessage: `EasyOrders real retry did not recover after reload: ${error.message}`, attempts: 2 })
        ));
      }
    }
    return retried;
  }

  return {
    openList,
    processRealOrders,
    processMissedOrders,
    retryAttempts,
    resendRealOrder,
    convertMissedDetail,
    setRowsPerPage100,
    applyDateFilters,
    readMissedRows,
    readRealRows,
  };
}

module.exports = {
  createEasyOrdersUiRecovery,
  ymd,
  EASY_BASE,
};
