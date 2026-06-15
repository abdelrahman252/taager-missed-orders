/*
 * Taager Google Sheets Bridge
 *
 * Paste this file into Extensions > Apps Script inside the customer's Google Sheet.
 * Fill TAAGER_PRODUCTS_URL and TAAGER_ORDERS_URL with the official endpoints from Taager.
 */

const CONFIG = {
  TAAGER_PRODUCTS_URL: "https://TAAGER_API_PRODUCTS_ENDPOINT_HERE",
  TAAGER_ORDERS_URL: "https://TAAGER_API_ORDERS_ENDPOINT_HERE",
  TOKEN_HEADER_NAME: "Authorization",
  TOKEN_HEADER_PREFIX: "Bearer ",
  PRODUCTS_SHEET: "Taager Products",
  ORDERS_SHEET: "Taager Orders",
  LOG_SHEET: "Sync Log",
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Taager Sync")
    .addItem("Set Integration Token", "promptForToken")
    .addItem("Sync Now", "syncTaager")
    .addItem("Install Hourly Trigger", "installHourlyTrigger")
    .addToUi();
}

function promptForToken() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    "Taager Integration Token",
    "Paste the Taager integration token for this merchant.",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  setTaagerToken(result.getResponseText());
  ui.alert("Token saved. Run Taager Sync > Sync Now.");
}

function setTaagerToken(token) {
  const clean = String(token || "").trim();
  if (!clean) throw new Error("Token is empty.");
  PropertiesService.getScriptProperties().setProperty("TAAGER_TOKEN", clean);
}

function installHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "syncTaager")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("syncTaager").timeBased().everyHours(1).create();
  logSync("trigger", "ok", "Hourly trigger installed.");
}

function syncTaager() {
  const startedAt = new Date();
  try {
    const products = fetchTaagerList(CONFIG.TAAGER_PRODUCTS_URL, "products");
    const orders = fetchTaagerList(CONFIG.TAAGER_ORDERS_URL, "orders");

    writeProducts(products);
    writeOrders(orders);
    logSync("sync", "ok", `Products: ${products.length}, Orders: ${orders.length}`, startedAt);
  } catch (error) {
    logSync("sync", "error", error && error.message ? error.message : String(error), startedAt);
    throw error;
  }
}

function fetchTaagerList(url, fallbackKey) {
  const token = PropertiesService.getScriptProperties().getProperty("TAAGER_TOKEN");
  if (!token) throw new Error("Missing token. Use Taager Sync > Set Integration Token first.");
  if (!url || url.indexOf("TAAGER_API_") >= 0) {
    throw new Error(`Missing ${fallbackKey} endpoint. Ask Taager for the official Apps Script/API URL.`);
  }

  const headers = {};
  headers[CONFIG.TOKEN_HEADER_NAME] = CONFIG.TOKEN_HEADER_PREFIX + token;

  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers,
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`${fallbackKey} fetch failed (${status}): ${body.slice(0, 500)}`);
  }

  const parsed = JSON.parse(body);
  const list = Array.isArray(parsed)
    ? parsed
    : parsed[fallbackKey] || parsed.data || parsed.items || parsed.results || [];

  if (!Array.isArray(list)) throw new Error(`${fallbackKey} response did not contain a list.`);
  return list;
}

function writeProducts(products) {
  const rows = products.map((product) => [
    valueOf(product, ["sku", "productSku", "SKU", "id"]),
    valueOf(product, ["name", "productName", "title", "Name"]),
    valueOf(product, ["category", "categoryName", "Category"]),
    valueOf(product, ["price", "sellingPrice", "salePrice"]),
    valueOf(product, ["stock", "quantity", "availableQuantity"]),
    JSON.stringify(product),
  ]);

  writeTable(CONFIG.PRODUCTS_SHEET, [
    "SKU",
    "Product Name",
    "Category",
    "Price",
    "Stock",
    "Raw JSON",
  ], rows);
}

function writeOrders(orders) {
  const rows = orders.map((order) => [
    valueOf(order, ["orderNumber", "orderId", "id"]),
    valueOf(order, ["createdAt", "created_at", "date"]),
    valueOf(order, ["status", "orderStatus"]),
    valueOf(order, ["customerName", "name", "receiverName"]),
    valueOf(order, ["phone", "customerPhone", "receiverPhone"]),
    valueOf(order, ["city", "province", "state"]),
    valueOf(order, ["sku", "productSku"]),
    valueOf(order, ["productName", "product", "title"]),
    valueOf(order, ["quantity", "qty"]),
    valueOf(order, ["total", "amount", "amountDue"]),
    JSON.stringify(order),
  ]);

  writeTable(CONFIG.ORDERS_SHEET, [
    "Order Number",
    "Created At",
    "Status",
    "Customer Name",
    "Phone",
    "City",
    "SKU",
    "Product Name",
    "Quantity",
    "Total",
    "Raw JSON",
  ], rows);
}

function writeTable(sheetName, headers, rows) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function valueOf(object, keys) {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null && object[key] !== "") {
      return object[key];
    }
  }
  return "";
}

function logSync(type, status, message, startedAt) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(CONFIG.LOG_SHEET) || ss.insertSheet(CONFIG.LOG_SHEET);
  if (sheet.getLastRow() === 0) sheet.appendRow(["Time", "Type", "Status", "Message", "Duration Seconds"]);
  const duration = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 1000) : "";
  sheet.appendRow([new Date(), type, status, message, duration]);
}
