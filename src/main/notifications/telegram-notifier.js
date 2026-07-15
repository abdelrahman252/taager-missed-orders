"use strict";

const https = require("https");

function text(value) {
  return String(value == null ? "" : value).trim();
}

function postJson(urlString, body, headers = {}, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const bodyStr = JSON.stringify(body || {});
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { error: data || "invalid_response" }; }
        if (res.statusCode >= 400) {
          reject(new Error(parsed.description || parsed.error || parsed.message || `telegram_http_${res.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("telegram_timeout"));
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function sendTelegramDirect(config, message) {
  const token = text(config && config.botToken);
  const chatId = text(config && config.chatId);
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN_MISSING" };
  if (!chatId) return { ok: false, error: "TELEGRAM_CHAT_ID_MISSING" };
  const response = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: String(message || "").slice(0, 3900),
    disable_web_page_preview: true,
  });
  return { ok: !!(response && response.ok), provider: "telegram", response };
}

async function sendTelegramBackend(options, message) {
  if (!options || typeof options.request !== "function") {
    return { ok: false, error: "NOTIFICATION_BACKEND_UNAVAILABLE" };
  }
  const functionName = text(options.functionName) || "customer-product-alert";
  const result = await options.request(functionName, {
    action: "send_telegram_message",
    message: String(message || "").slice(0, 3900),
    licenseKey: text(options.licenseKey),
    machineUuid: text(options.machineUuid),
    deviceId: text(options.deviceId),
  });
  return { ok: !!(result && result.ok !== false), provider: "backend", response: result };
}

async function createTelegramBackendConnection(options) {
  if (!options || typeof options.request !== "function") {
    return { ok: false, error: "NOTIFICATION_BACKEND_UNAVAILABLE" };
  }
  const functionName = text(options.functionName) || "customer-product-alert";
  return await options.request(functionName, {
    action: "create_connection",
    licenseKey: text(options.licenseKey),
    machineUuid: text(options.machineUuid),
    deviceId: text(options.deviceId),
  });
}

async function getTelegramBackendConnectionStatus(options) {
  if (!options || typeof options.request !== "function") {
    return { ok: false, error: "NOTIFICATION_BACKEND_UNAVAILABLE" };
  }
  const functionName = text(options.functionName) || "customer-product-alert";
  return await options.request(functionName, {
    action: "connection_status",
    licenseKey: text(options.licenseKey),
    machineUuid: text(options.machineUuid),
    deviceId: text(options.deviceId),
  });
}

async function sendTelegram(config, message, backendOptions) {
  const mode = text(config && config.mode) === "backend" ? "backend" : "direct";
  if (mode === "backend") return sendTelegramBackend(backendOptions || {}, message);
  return sendTelegramDirect(config || {}, message);
}

module.exports = {
  sendTelegram,
  sendTelegramDirect,
  createTelegramBackendConnection,
  getTelegramBackendConnectionStatus,
};
