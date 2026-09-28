declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const whatsappPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const whatsappTo = Deno.env.get("ADMIN_ALERT_WHATSAPP_TO") || "";
const whatsappApiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v20.0";
const whatsappTemplateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "admin_error_alert";
const whatsappTemplateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en_US";
const allowFreeText = Deno.env.get("ADMIN_ERROR_ALERT_ALLOW_FREE_TEXT") === "1";
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
const fallbackWebhookUrl = Deno.env.get("ADMIN_ERROR_ALERT_WEBHOOK_URL") || "";

type AlertBody = {
  kind?: "error" | "success";
  licenseKey?: string;
  customerName?: string;
  flow?: string;
  operation?: string;
  error?: string;
  summary?: string;
  counts?: { orders?: number; failed?: number; skipped?: number; rows?: number };
  account?: {
    accountId?: string;
    accountLabel?: string;
    accountEmail?: string;
    taagerCountry?: string;
  };
  dateFrom?: string;
  dateTo?: string;
  lastStage?: string;
  stageHistory?: string[];
  durationMs?: number;
  recentLogs?: string[];
  appVersion?: string;
  timestamp?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown, max = 500) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

async function findLicense(licenseKey: string) {
  if (!supabaseUrl || !serviceRoleKey || !licenseKey) return null;
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/licenses?license_key=eq.${encodeURIComponent(licenseKey)}&select=license_key,customer_name,revoked&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) throw new Error(`license_lookup_failed_${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function buildMessage(input: AlertBody, licenseRow: any) {
  const success = input.kind === "success";
  const account = input.account || {};
  const licenseKey = clean(licenseRow?.license_key || input.licenseKey || "unknown", 90);
  const customerName = clean(licenseRow?.customer_name || input.customerName || "unknown", 160);
  const lines = [
    success ? "Taager Orders success alert" : "Taager Orders error alert",
    `License: ${licenseKey}`,
    `Customer: ${customerName}`,
    `Flow: ${clean(input.flow || "app", 80)}`,
    input.operation ? `Operation: ${clean(input.operation, 120)}` : "",
    account.accountLabel || account.accountEmail ? `Account: ${clean(account.accountLabel || account.accountEmail, 180)}` : "",
    account.accountEmail ? `Email: ${clean(account.accountEmail, 180)}` : "",
    account.taagerCountry ? `Country: ${clean(account.taagerCountry, 40)}` : "",
    input.dateFrom || input.dateTo ? `Date range: ${clean(input.dateFrom || "?", 32)} to ${clean(input.dateTo || "?", 32)}` : "",
    input.lastStage ? `Last stage: ${clean(input.lastStage, 180)}` : "",
    success ? `Result: ${clean(input.summary || "Run completed", 240)}` : `Error: ${clean(input.error || "Unknown error", 1200)}`,
    success && input.counts ? `Counts: ${[
      input.counts.orders != null ? `orders=${Math.max(0, Number(input.counts.orders) || 0)}` : "",
      input.counts.failed != null ? `failed=${Math.max(0, Number(input.counts.failed) || 0)}` : "",
      input.counts.skipped != null ? `skipped=${Math.max(0, Number(input.counts.skipped) || 0)}` : "",
      input.counts.rows != null ? `rows=${Math.max(0, Number(input.counts.rows) || 0)}` : "",
    ].filter(Boolean).join(", ")}` : "",
    input.durationMs != null ? `Duration: ${Math.round(Math.max(0, Number(input.durationMs) || 0) / 1000)}s` : "",
    input.appVersion ? `App: ${clean(input.appVersion, 40)}` : "",
    `Time: ${clean(input.timestamp || new Date().toISOString(), 80)}`,
  ].filter(Boolean);

  const stages = Array.isArray(input.stageHistory)
    ? input.stageHistory.map((line) => clean(line, 220)).filter(Boolean).slice(-12)
    : [];
  if (stages.length) {
    lines.push("Stages:");
    stages.forEach((line) => lines.push(`- ${line}`));
  }

  const recent = Array.isArray(input.recentLogs)
    ? input.recentLogs.map((line) => clean(line, 240)).filter(Boolean).slice(-5)
    : [];
  if (recent.length) {
    lines.push("Recent logs:");
    recent.forEach((line) => lines.push(`- ${line}`));
  }

  return lines.join("\n").slice(0, 3900);
}

function templateParams(input: AlertBody, licenseRow: any) {
  const account = input.account || {};
  return [
    clean(licenseRow?.license_key || input.licenseKey || "unknown", 90),
    clean(licenseRow?.customer_name || input.customerName || "unknown", 160),
    clean(input.flow || "app", 80),
    clean(account.accountLabel || account.accountEmail || account.accountId || "unknown", 180),
    clean(input.error || "Unknown error", 900),
    clean(input.timestamp || new Date().toISOString(), 80),
  ];
}

async function sendWebhook(message: string, input: AlertBody) {
  const response = await fetch(fallbackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, alert: input }),
  });
  if (!response.ok) throw new Error(`alert_webhook_failed_${response.status}`);
  return { ok: true, provider: "webhook" };
}

async function sendTelegram(message: string) {
  if (!telegramBotToken || !telegramChatId) {
    return { ok: false, provider: "telegram", reason: "telegram_config_missing" };
  }
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text: message.slice(0, 3900),
      disable_web_page_preview: true,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.description || `telegram_send_failed_${response.status}`);
  }
  return { ok: true, provider: "telegram", result };
}

async function sendWhatsApp(message: string, input: AlertBody, licenseRow: any) {
  if (!whatsappToken || !whatsappPhoneNumberId || !whatsappTo) {
    return { ok: false, provider: "whatsapp-cloud", reason: "whatsapp_config_missing" };
  }
  const to = normalizePhone(whatsappTo);
  if (!to) return { ok: false, provider: "whatsapp-cloud", reason: "whatsapp_to_missing" };
  if (!allowFreeText && !whatsappTemplateName) {
    return { ok: false, provider: "whatsapp-cloud", reason: "whatsapp_template_missing" };
  }

  const body = allowFreeText ? {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  } : {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: whatsappTemplateName,
      language: { code: whatsappTemplateLanguage },
      components: [{
        type: "body",
        parameters: templateParams(input, licenseRow).map((text) => ({
          type: "text",
          text,
        })),
      }],
    },
  };

  const response = await fetch(`https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `whatsapp_send_failed_${response.status}`);
  return { ok: true, provider: "whatsapp-cloud", result };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const input = await request.json() as AlertBody;
    const licenseKey = clean(input.licenseKey || "", 90).toUpperCase();
    const success = input.kind === "success";
    const error = clean(input.error || "", 1200);
    if (!licenseKey || (!success && !error)) return json({ ok: false, error: "missing_license_or_error" }, 400);

    const licenseRow = await findLicense(licenseKey);
    if (!licenseRow || licenseRow.revoked === true) {
      return json({ ok: false, error: "license_not_allowed" }, 403);
    }

    const message = buildMessage({ ...input, licenseKey, error }, licenseRow);
    const result = success
      ? telegramBotToken && telegramChatId
        ? await sendTelegram(message)
        : fallbackWebhookUrl
          ? await sendWebhook(message, input)
          : { ok: false, reason: "success_channel_unavailable" }
      : fallbackWebhookUrl
        ? await sendWebhook(message, input)
        : telegramBotToken && telegramChatId
          ? await sendTelegram(message)
          : await sendWhatsApp(message, { ...input, licenseKey, error }, licenseRow);
    return json(result);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
