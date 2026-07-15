(function () {
  "use strict";

  var state = {
    settings: null,
    accounts: [],
    history: [],
    preview: null,
    connection: null,
    mountEl: null,
    mode: "dashboard",
    dashboardContext: null,
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function icon(name) {
    return window.icon ? window.icon(name, { size: 15, color: "currentColor" }) : "";
  }

  function toast(message, kind) {
    if (window.TaagerUI && typeof window.TaagerUI.toast === "function") {
      window.TaagerUI.toast(message, { kind: kind || "info" });
    } else {
      console.log("[Notifications]", message);
    }
  }

  function ui(en, ar) {
    return isArabic() ? (ar || en) : en;
  }

  function dir() {
    return isArabic() ? "rtl" : "ltr";
  }

  function locale() {
    return isArabic() ? "ar-EG-u-nu-latn" : "en-US";
  }

  function isArabic() {
    if (window.dashboardI18n && typeof window.dashboardI18n.isRtl === "function") return window.dashboardI18n.isRtl();
    return (window._kbotLang || "ar") === "ar";
  }

  function defaultCaseLabel(value) {
    if (value === "High NDR" || value === "NDR مرتفع") return ui("High NDR", "NDR مرتفع");
    if (value === "Low NDR" || value === "NDR منخفض") return ui("Low NDR", "NDR منخفض");
    return value;
  }

  function defaultRule(operator, threshold) {
    return {
      enabled: true,
      ndrOperator: operator || ">=",
      ndrThreshold: threshold == null ? 20 : threshold,
      minNetOrders: 20,
      profitStatus: "any",
    };
  }

  function defaultSettings() {
    return {
      enabled: false,
      channel: "telegram",
      scope: "all",
      accountIds: [],
      maxProductsPerMessage: 10,
      cooldownHours: 4,
      telegram: { mode: "backend", botToken: "", chatId: "" },
      rule: defaultRule(">=", 20),
      cases: [
        { id: "case-high-ndr", label: ui("High NDR", "NDR مرتفع"), enabled: true, rule: defaultRule(">=", 20) },
        { id: "case-low-ndr", label: ui("Low NDR", "NDR منخفض"), enabled: false, rule: defaultRule("<=", 10) },
      ],
    };
  }

  function normalizeSettings(input) {
    var fallback = defaultSettings();
    var source = input && typeof input === "object" ? input : {};
    var cases = Array.isArray(source.cases) && source.cases.length ? source.cases : fallback.cases;
    var out = {
      enabled: source.enabled === true,
      channel: "telegram",
      scope: source.scope === "selected" ? "selected" : "all",
      accountIds: Array.isArray(source.accountIds) ? source.accountIds.map(String).filter(Boolean) : [],
      maxProductsPerMessage: Math.min(20, Math.max(1, Number(source.maxProductsPerMessage || fallback.maxProductsPerMessage))),
      cooldownHours: Math.min(168, Math.max(1, Number(source.cooldownHours || fallback.cooldownHours))),
      telegram: { mode: "backend", botToken: "", chatId: "" },
      rule: source.rule || fallback.rule,
      cases: [],
    };
    for (var i = 0; i < 2; i += 1) {
      var item = cases[i] || fallback.cases[i];
      var rule = item && item.rule || fallback.cases[i].rule;
      out.cases.push({
        id: String(item && item.id || fallback.cases[i].id),
        label: String(item && item.label || fallback.cases[i].label),
        enabled: item && item.enabled === true,
        rule: {
          enabled: item && item.enabled === true,
          ndrOperator: rule.ndrOperator === "<=" ? "<=" : ">=",
          ndrThreshold: Math.min(100, Math.max(0, Number(rule.ndrThreshold == null ? fallback.cases[i].rule.ndrThreshold : rule.ndrThreshold))),
          minNetOrders: Math.min(100000, Math.max(1, Math.round(Number(rule.minNetOrders || fallback.cases[i].rule.minNetOrders)))),
          profitStatus: ["any", "profitable", "losing", "no_spend", "unknown"].indexOf(rule.profitStatus) >= 0 ? rule.profitStatus : "any",
        },
      });
    }
    if (!out.cases.some(function (item) { return item.enabled; })) {
      out.cases[0].enabled = true;
      out.cases[0].rule.enabled = true;
    }
    out.rule = out.cases[0].rule;
    return out;
  }

  function friendlyError(error) {
    var msg = String(error && error.message || error || "");
    if (/supabase_get_failed_404|telegram_notification_subscribers|PGRST|404/i.test(msg)) {
      return ui("Telegram backend is not fully deployed yet. Push the Supabase migration and redeploy the customer-product-alert function, then check status again.", "لم يتم تجهيز خدمة تليجرام بالكامل بعد. ادفع Migration الخاصة بـ Supabase وأعد نشر وظيفة customer-product-alert، ثم افحص الحالة مرة أخرى.");
    }
    if (/bot_token_missing|telegram_bot_token_missing/i.test(msg)) {
      return ui("Telegram bot token is missing in Supabase secrets.", "توكن بوت تليجرام غير موجود في Secrets الخاصة بـ Supabase.");
    }
    if (/webhook_secret_missing/i.test(msg)) {
      return ui("Telegram webhook secret is missing in Supabase secrets.", "سر Webhook الخاص بتليجرام غير موجود في Secrets الخاصة بـ Supabase.");
    }
    return msg || ui("Something failed.", "حدث خطأ.");
  }

  function money(value, currency) {
    var amount = Number(value) || 0;
    var rounded = Math.abs(amount) >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
    return rounded.toLocaleString(locale()) + " " + (currency || "SAR");
  }

  function profitLabel(value) {
    return {
      any: ui("Any status", "أي حالة"),
      profitable: ui("Profitable", "رابح"),
      losing: ui("Losing", "خاسر"),
      no_spend: ui("No spend data", "لا توجد بيانات إنفاق"),
      unknown: ui("Unknown", "غير معروف"),
    }[value] || ui("Any status", "أي حالة");
  }

  function spendLabel(value) {
    return {
      with_spend: ui("Has spend", "به إنفاق"),
      zero_spend: ui("Zero spend", "إنفاق صفر"),
      no_spend: ui("No matched spend", "لا يوجد إنفاق مطابق"),
    }[value] || ui("Unknown", "غير معروف");
  }

  function dashboardAccountContext() {
    var meta = state.dashboardContext && state.dashboardContext.meta || {};
    var id = String(meta.activeAccountId || (window.getActiveAccountId ? window.getActiveAccountId() : "") || "").trim();
    if (!id) id = "__all__";
    var label = String(meta.activeAccountLabel || window.currentActiveAccountLabel || "").trim();
    if (!label && id && id !== "__all__") {
      var account = state.accounts.find(function (item) { return String(item.id) === id; });
      label = account && account.label || id;
    }
    return {
      id: id,
      label: label || ui("All accounts", "كل الحسابات"),
      isAll: id === "__all__",
    };
  }

  function settingsForDashboard(settings) {
    var clean = normalizeSettings(settings);
    var account = dashboardAccountContext();
    if (state.mode === "dashboard" && !account.isAll) {
      clean.scope = "selected";
      clean.accountIds = [account.id];
    }
    return clean;
  }

  function dashboardAlertOptions() {
    var meta = state.dashboardContext && state.dashboardContext.meta || {};
    var period = window.DashboardPeriodState && typeof window.DashboardPeriodState.get === "function"
      ? window.DashboardPeriodState.get()
      : (meta.period || {});
    var rateSnapshot = window.TaagerCurrency && typeof window.TaagerCurrency.snapshot === "function"
      ? window.TaagerCurrency.snapshot()
      : null;
    var rates = rateSnapshot && rateSnapshot.rates
      ? rateSnapshot.rates
      : (meta.exchangeRates || {});
    var egpRate = window.TaagerCurrency && typeof window.TaagerCurrency.rates === "function"
      ? Number((window.TaagerCurrency.rates() || {}).EGP) || Number(meta.egpRate) || 52
      : Number(meta.egpRate) || 52;
    period = period || {};
    return {
      dateFrom: period.dateFrom || period.from || period.start || meta.dateFrom || "",
      dateTo: period.dateTo || period.to || period.end || meta.dateTo || "",
      lang: isArabic() ? "ar" : "en",
      currency: "USD",
      reportingCurrency: "USD",
      productFinancialCurrency: "USD",
      exchangeRates: rates,
      exchangeRatesUpdatedAt: rateSnapshot && rateSnapshot.updatedAt || meta.exchangeRatesUpdatedAt || "",
      egpRate: egpRate,
    };
  }

  function renderStyles() {
    return '<style>' +
      '.notif-root{height:100%;min-height:0;color:var(--dash-text,var(--text));background:var(--dash-bg,var(--bg));direction:' + dir() + ';}' +
      '.notif-wrap{padding:18px clamp(14px,2vw,24px) 28px;display:flex;flex-direction:column;gap:14px;}' +
      '.notif-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;}' +
      '.notif-kicker{font-size:var(--type-caption);font-weight:var(--weight-bold);color:var(--dash-accent,#a855f7);text-transform:uppercase;letter-spacing:.06em;}' +
      '.notif-title{font-size:clamp(22px,2.2vw,30px);line-height:1.1;font-weight:var(--weight-bold);color:var(--dash-text,var(--text));margin-top:4px;}' +
      '.notif-sub{font-size:var(--type-control);line-height:1.5;color:var(--dash-text-muted,var(--text2));font-weight:var(--weight-semibold);max-width:760px;margin-top:6px;}' +
      '.notif-layout{display:grid;grid-template-columns:minmax(610px,1.15fr) minmax(390px,.85fr);gap:14px;align-items:start;}' +
      '.notif-panel{container-type:inline-size;border:1px solid var(--dash-border,var(--border));background:var(--dash-surface-2,var(--bg2));border-radius:var(--dash-radius-sm,8px);padding:16px;box-shadow:var(--dash-shadow-card,0 12px 28px rgba(2,6,23,.16));}' +
      '[data-theme="light"] .notif-panel{background:var(--dash-table-row,#fff);}' +
      '.notif-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;}' +
      '.notif-panel-title{font-size:var(--type-section-title);font-weight:var(--weight-bold);color:var(--dash-text,var(--text));}' +
      '.notif-panel-sub{font-size:var(--type-caption);font-weight:var(--weight-semibold);color:var(--dash-text-muted,var(--text2));line-height:1.45;margin-top:4px;}' +
      '.notif-enable{display:flex;align-items:center;gap:10px;border:1px solid color-mix(in srgb,var(--dash-good,#14b8a6) 38%,var(--dash-border));background:color-mix(in srgb,var(--dash-good,#14b8a6) 11%,transparent);border-radius:var(--dash-radius-sm,8px);padding:10px 12px;min-width:260px;}' +
      '.notif-enable strong{display:block;font-size:var(--type-control);}.notif-enable span{display:block;font-size:var(--type-caption);color:var(--dash-text-muted,var(--text2));font-weight:var(--weight-semibold);margin-top:2px;}' +
      '.notif-switch{position:relative;width:48px;height:27px;flex:0 0 auto;direction:ltr;}.notif-switch input{opacity:0;width:0;height:0;}.notif-slider{position:absolute;inset:0;border-radius:999px;background:var(--dash-text-disabled,#64748b);cursor:pointer;transition:.16s;}.notif-slider:before{content:"";position:absolute;width:21px;height:21px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.28);transition:.16s;}.notif-switch input:checked+.notif-slider{background:var(--dash-success,var(--dash-good,#14b8a6));}.notif-switch input:checked+.notif-slider:before{transform:translateX(21px);}' +
      '.notif-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}.notif-rule-grid{grid-template-columns:minmax(170px,.9fr) minmax(220px,1.1fr);}.notif-ndr-control{display:grid;grid-template-columns:minmax(94px,116px) minmax(88px,1fr);gap:8px;}.notif-field{display:flex;flex-direction:column;gap:6px;min-width:0;}.notif-field label{font-size:var(--type-caption);font-weight:var(--weight-bold);color:var(--dash-text-muted,var(--text2));}' +
      '.notif-input{width:100%;min-height:40px;border:1px solid var(--dash-border,var(--border));border-radius:var(--dash-radius-sm,8px);background:var(--dash-input-bg,var(--dash-surface,var(--bg)));color:var(--dash-text,var(--text));font:inherit;font-size:var(--type-control);font-weight:var(--weight-semibold);padding:9px 11px;outline:none;}' +
      '.notif-input:focus{border-color:var(--dash-accent,#a855f7);box-shadow:0 0 0 3px color-mix(in srgb,var(--dash-accent,#a855f7) 22%,transparent);}' +
      '.notif-segment{min-height:40px;border:1px solid var(--dash-border,var(--border));border-radius:var(--dash-radius-sm,8px);background:var(--dash-input-bg,var(--dash-surface,var(--bg)));padding:3px;display:flex;gap:3px;align-items:center;overflow:hidden;}' +
      '.notif-segment.is-wrap{flex-wrap:wrap;overflow:visible;}.notif-seg-btn{border:0;background:transparent;color:var(--dash-text-muted,var(--text2));border-radius:6px;min-height:32px;padding:6px 11px;font:inherit;font-size:var(--type-control);font-weight:var(--weight-bold);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;flex:1 1 auto;}.notif-seg-btn:hover{color:var(--dash-text,var(--text));background:var(--dash-accent-soft,rgba(168,85,247,.14));}.notif-seg-btn.is-active{background:var(--dash-accent,#a855f7);color:#fff;box-shadow:0 8px 18px color-mix(in srgb,var(--dash-accent,#a855f7) 28%,transparent);}.notif-segment.compact .notif-seg-btn{padding-inline:9px;min-width:48px;}.notif-op-segment{direction:ltr;}.notif-op-text{direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono,ui-monospace,Menlo,Consolas,monospace);}' +
      '.notif-case-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px;}.notif-case{border:1px solid var(--dash-border,var(--border));background:var(--dash-surface,var(--bg));border-radius:var(--dash-radius-sm,8px);padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0;}.notif-case.is-off{opacity:.72;}.notif-case-top{display:flex;justify-content:space-between;align-items:center;gap:10px;}.notif-case-name{font-size:var(--type-control);font-weight:var(--weight-bold);color:var(--dash-text,var(--text));}.notif-case-caption{font-size:var(--type-micro);font-weight:var(--weight-bold);color:var(--dash-text-faint,var(--text2));margin-top:2px;}' +
      '.notif-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}.notif-btn{border:1px solid var(--dash-border,var(--border));background:var(--dash-input-bg,var(--dash-surface,var(--bg)));color:var(--dash-text,var(--text));border-radius:var(--dash-radius-sm,8px);min-height:38px;padding:9px 12px;font:inherit;font-size:var(--type-control);font-weight:var(--weight-bold);cursor:pointer;display:inline-flex;align-items:center;gap:7px;}.notif-btn:hover{border-color:var(--dash-accent,#a855f7);background:var(--dash-accent-soft,rgba(168,85,247,.14));}.notif-primary{background:var(--dash-accent,#a855f7);border-color:var(--dash-accent,#a855f7);color:#fff;}.notif-save{background:var(--dash-good,#14b8a6);border-color:var(--dash-good,#14b8a6);color:#fff;}.notif-danger{background:var(--dash-danger,#ef4444);border-color:var(--dash-danger,#ef4444);color:#fff;}' +
      '.notif-muted,.notif-empty{font-size:var(--type-caption);line-height:1.6;color:var(--dash-text-faint,var(--text2));font-weight:var(--weight-semibold);}.notif-error{font-size:var(--type-caption);line-height:1.55;color:var(--dash-warning,#f59e0b);font-weight:var(--weight-bold);}' +
      '.notif-account-context{border:1px solid var(--dash-border,var(--border));background:var(--dash-accent-soft,rgba(168,85,247,.14));border-radius:var(--dash-radius-sm,8px);padding:10px 12px;min-height:40px;display:flex;align-items:center;gap:8px;color:var(--dash-text,var(--text));font-size:var(--type-control);font-weight:var(--weight-bold);}.notif-account-context small{font-size:var(--type-caption);color:var(--dash-text-faint,var(--text2));font-weight:var(--weight-semibold);}' +
      '.notif-accounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:10px;}.notif-check-row{display:flex;align-items:center;gap:8px;border:1px solid var(--dash-border,var(--border));background:var(--dash-surface,var(--bg));border-radius:7px;padding:8px 10px;font-size:var(--type-caption);font-weight:var(--weight-semibold);color:var(--dash-text-muted,var(--text2));}' +
      '.notif-connect{border:1px solid var(--dash-border,var(--border));background:var(--dash-surface,var(--bg));border-radius:var(--dash-radius-sm,8px);padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0;}.notif-status{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--dash-warning,#f59e0b);font-weight:var(--weight-bold);}.notif-status.connected{color:var(--dash-success,var(--dash-good,#14b8a6));}.notif-status small{font-size:var(--type-caption);color:var(--dash-text-faint,var(--text2));font-weight:var(--weight-semibold);}.notif-code{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:var(--type-caption);color:var(--dash-text-faint,var(--text2));font-weight:var(--weight-bold);}.notif-code bdi{font-family:var(--font-mono);font-size:var(--type-control);color:var(--dash-text,var(--text));border:1px solid var(--dash-border,var(--border));border-radius:var(--dash-radius-sm,8px);padding:5px 8px;background:var(--dash-accent-soft,rgba(168,85,247,.14));}.notif-link{font-family:var(--font-mono);font-size:var(--type-caption);direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;}' +
      '.notif-preview-count{font-size:var(--type-control);font-weight:var(--weight-bold);margin-bottom:10px;}.notif-product{border:1px solid var(--dash-border,var(--border));background:var(--dash-surface,var(--bg));border-radius:var(--dash-radius-sm,8px);padding:11px;margin-bottom:8px;}.notif-product-main{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;}.notif-product-name{font-weight:var(--weight-bold);color:var(--dash-text,var(--text));word-break:break-word;}.notif-product-case{font-size:var(--type-micro);font-weight:var(--weight-bold);color:var(--dash-info,#38bdf8);margin-top:3px;}.notif-sku{font-size:var(--type-micro);font-weight:var(--weight-bold);color:var(--dash-text-faint,var(--text2));white-space:nowrap;direction:ltr;}.notif-metrics{display:flex;gap:6px;flex-wrap:wrap;}.notif-metrics span{font-size:var(--type-micro);font-weight:var(--weight-bold);border:1px solid var(--dash-border,var(--border));border-radius:999px;padding:4px 7px;color:var(--dash-text-faint,var(--text2));}.notif-metrics .good{color:var(--dash-success,var(--dash-good,#14b8a6));border-color:color-mix(in srgb,var(--dash-good,#14b8a6) 45%,var(--dash-border));}.notif-metrics .bad{color:var(--dash-danger,#ef4444);border-color:color-mix(in srgb,var(--dash-danger,#ef4444) 45%,var(--dash-border));}' +
      '.notif-history{display:flex;flex-direction:column;gap:8px;}.notif-history-row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--dash-border,var(--border));padding:8px 0;font-size:var(--type-caption);font-weight:var(--weight-semibold);color:var(--dash-text-muted,var(--text2));}.notif-history-row:last-child{border-bottom:0;}' +
      '@container (max-width:900px){.notif-case-list{grid-template-columns:1fr}.notif-rule-grid{grid-template-columns:minmax(0,1fr) minmax(220px,.95fr)}}' +
      '@container (max-width:720px){.notif-panel-head{flex-direction:column}.notif-enable{min-width:0;width:100%;justify-content:space-between}.notif-grid{grid-template-columns:1fr}.notif-rule-grid{grid-template-columns:1fr}.notif-ndr-control{grid-template-columns:minmax(102px,128px) minmax(0,1fr)}.notif-actions{gap:7px}.notif-btn{flex:1 1 150px;justify-content:center}.notif-product-main{flex-direction:column}.notif-sku{white-space:normal}}' +
      '@media(max-width:1250px){.notif-layout{grid-template-columns:1fr}}@media(max-width:700px){.notif-wrap{padding:14px 10px 22px}.notif-panel{padding:12px}.notif-ndr-control{grid-template-columns:1fr}.notif-op-segment .notif-seg-btn{min-width:0}.notif-code bdi{max-width:100%;overflow:hidden;text-overflow:ellipsis}.notif-btn{flex-basis:100%}}' +
    '</style>';
  }

  function formSettings() {
    var root = state.mountEl;
    var current = settingsForDashboard(state.settings);
    if (!root) return current;
    var dashboardAccount = dashboardAccountContext();
    var selectedAccountIds = dashboardAccount.isAll
      ? Array.from(root.querySelectorAll(".notif-account-check:checked")).map(function (el) { return el.value; })
      : [dashboardAccount.id];
    var cases = [0, 1].map(function (index) {
      var card = root.querySelector('[data-case-index="' + index + '"]');
      var fallback = current.cases[index];
      return {
        id: fallback.id,
        label: card && card.querySelector(".notif-case-label") ? card.querySelector(".notif-case-label").value : fallback.label,
        enabled: !!(card && card.querySelector(".notif-case-enabled") && card.querySelector(".notif-case-enabled").checked),
        rule: {
          enabled: !!(card && card.querySelector(".notif-case-enabled") && card.querySelector(".notif-case-enabled").checked),
          ndrOperator: card && card.querySelector(".notif-ndr-operator") ? card.querySelector(".notif-ndr-operator").value : fallback.rule.ndrOperator,
          ndrThreshold: Number(card && card.querySelector(".notif-ndr-threshold") ? card.querySelector(".notif-ndr-threshold").value : fallback.rule.ndrThreshold),
          minNetOrders: Number(card && card.querySelector(".notif-min-orders") ? card.querySelector(".notif-min-orders").value : fallback.rule.minNetOrders),
          profitStatus: "any",
        },
      };
    });
    if (!cases.some(function (item) { return item.enabled; })) cases[0].enabled = true;
    return normalizeSettings({
      enabled: !!(root.querySelector("#notif-enabled") && root.querySelector("#notif-enabled").checked),
      channel: "telegram",
      scope: dashboardAccount.isAll ? (root.querySelector("#notif-scope") ? root.querySelector("#notif-scope").value : "all") : "selected",
      accountIds: selectedAccountIds,
      maxProductsPerMessage: Number(root.querySelector("#notif-max-products") ? root.querySelector("#notif-max-products").value : 10),
      cooldownHours: Number(root.querySelector("#notif-cooldown") ? root.querySelector("#notif-cooldown").value : 4),
      telegram: { mode: "backend", botToken: "", chatId: "" },
      cases: cases,
      rule: cases[0].rule,
    });
  }

  function renderAccounts(settings) {
    if (!state.accounts.length) return '<div class="notif-muted">' + esc(ui("No saved accounts yet.", "لا توجد حسابات محفوظة بعد.")) + '</div>';
    var selected = {};
    (settings.accountIds || []).forEach(function (id) { selected[String(id)] = true; });
    return state.accounts.map(function (account) {
      var checked = selected[String(account.id)] ? " checked" : "";
      return '<label class="notif-check-row">' +
        '<input type="checkbox" class="notif-account-check" value="' + esc(account.id) + '"' + checked + '>' +
        '<span>' + esc(account.label || account.id) + '</span>' +
      '</label>';
    }).join("");
  }

  function renderAccountScope(settings) {
    var account = dashboardAccountContext();
    if (state.mode === "dashboard" && !account.isAll) {
      return '<div class="notif-field"><label>' + esc(ui("Account", "الحساب")) + '</label><div class="notif-account-context">' +
        icon("user") +
        '<span>' + esc(account.label) + '</span>' +
        '<small>' + esc(ui("Current dashboard account", "الحساب المحدد في لوحة التحكم")) + '</small>' +
      '</div></div>';
    }
    return '<div class="notif-field"><label>' + esc(ui("Accounts", "الحسابات")) + '</label><input type="hidden" id="notif-scope" value="' + esc(settings.scope) + '"><div class="notif-segment">' +
      '<button type="button" class="notif-seg-btn notif-scope-btn ' + (settings.scope === "all" ? "is-active" : "") + '" data-value="all">' + icon("layers") + '<span>' + esc(ui("All", "الكل")) + '</span></button>' +
      '<button type="button" class="notif-seg-btn notif-scope-btn ' + (settings.scope === "selected" ? "is-active" : "") + '" data-value="selected">' + icon("checkSquare") + '<span>' + esc(ui("Selected", "المحدد")) + '</span></button>' +
    '</div></div>';
  }

  function operatorSegment(value) {
    var op = value === "<=" ? "<=" : ">=";
    return '<input type="hidden" class="notif-ndr-operator" value="' + esc(op) + '">' +
      '<div class="notif-segment compact notif-op-segment">' +
        '<button type="button" class="notif-seg-btn notif-op-btn ' + (op === ">=" ? "is-active" : "") + '" data-value=">="><bdi class="notif-op-text" dir="ltr">&gt;=</bdi></button>' +
        '<button type="button" class="notif-seg-btn notif-op-btn ' + (op === "<=" ? "is-active" : "") + '" data-value="<="><bdi class="notif-op-text" dir="ltr">&lt;=</bdi></button>' +
      '</div>';
  }

  function renderCase(item, index) {
    var rule = item.rule || {};
    var off = item.enabled ? "" : " is-off";
    return '<section class="notif-case' + off + '" data-case-index="' + index + '">' +
      '<div class="notif-case-top">' +
        '<div><div class="notif-case-name">' + esc(ui("Rule", "القاعدة")) + ' ' + (index + 1) + '</div><div class="notif-case-caption">' + esc(index === 0 ? ui("Main rule", "القاعدة الأساسية") : ui("Optional second rule", "قاعدة ثانية اختيارية")) + '</div></div>' +
        '<label class="notif-switch"><input class="notif-case-enabled" type="checkbox"' + (item.enabled ? " checked" : "") + '><span class="notif-slider"></span></label>' +
      '</div>' +
      '<div class="notif-field"><label>' + esc(ui("Rule name", "اسم القاعدة")) + '</label><input class="notif-input notif-case-label" value="' + esc(defaultCaseLabel(item.label)) + '"></div>' +
      '<div class="notif-grid notif-rule-grid">' +
        '<div class="notif-field"><label>' + esc(ui("Minimum net orders", "الحد الأدنى للطلبات الصافية")) + '</label><input class="notif-input notif-min-orders" type="number" min="1" step="1" value="' + esc(rule.minNetOrders) + '"></div>' +
        '<div class="notif-field"><label>NDR</label><div class="notif-ndr-control">' + operatorSegment(rule.ndrOperator) + '<input class="notif-input notif-ndr-threshold" type="number" min="0" max="100" step="0.1" value="' + esc(rule.ndrThreshold) + '"></div></div>' +
      '</div>' +
    '</section>';
  }

  function currentBotLink() {
    var connection = state.connection || {};
    var botUsername = String(connection.botUsername || "").replace(/^@/, "");
    return connection.deepLink || (botUsername && connection.connectionCode ? ("https://t.me/" + botUsername + "?start=" + encodeURIComponent(connection.connectionCode)) : "");
  }

  function currentBotAppLink() {
    var connection = state.connection || {};
    var botUsername = String(connection.botUsername || "").replace(/^@/, "");
    return botUsername && connection.connectionCode
      ? ("tg://resolve?domain=" + encodeURIComponent(botUsername) + "&start=" + encodeURIComponent(connection.connectionCode))
      : "";
  }

  function currentStartCommand() {
    var code = state.connection && state.connection.connectionCode;
    return code ? ("/start " + code) : "";
  }

  function hasPendingTelegramConnection() {
    var connection = state.connection || {};
    if (connection.connected === true || !connection.connectionCode) return false;
    if (!connection.expiresAt) return true;
    var expiresAt = Date.parse(connection.expiresAt);
    return !expiresAt || expiresAt > Date.now();
  }

  function renderTelegramConnection() {
    var connection = state.connection || {};
    var connected = connection.connected === true;
    var code = connection.connectionCode || "";
    var deepLink = currentBotLink();
    var startCommand = currentStartCommand();
    var webhook = connection.webhook || {};
    var webhookProblem = webhook.lastErrorMessage
      ? ("Telegram webhook error: " + webhook.lastErrorMessage)
      : (webhook && webhook.url === "" ? "Telegram webhook is not set." : "");
    var expiresAt = connection.expiresAt ? new Date(connection.expiresAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : "";
    var statusText = connected ? ui("Connected", "متصل") : (code ? ui("Waiting for Start", "في انتظار فتح الرابط والضغط على Start في تليجرام") : ui("Not connected yet", "غير متصل بعد"));
    if (connection.ok === false && connection.error) statusText = friendlyError(connection.error);
    return '<div class="notif-connect">' +
      '<div class="notif-status ' + (connected ? "connected" : "") + '"><strong>' + esc(statusText) + '</strong>' +
        (connected && connection.chatIdMasked ? '<small>' + esc(ui("Chat", "المحادثة")) + ' ' + esc(connection.chatIdMasked) + '</small>' : '') +
      '</div>' +
      (code ? '<div class="notif-code"><span>' + esc(ui("Connection code", "كود الربط")) + '</span><bdi>' + esc(code) + '</bdi>' + (expiresAt ? '<small>' + esc(ui("Expires", "ينتهي")) + ' ' + esc(expiresAt) + '</small>' : '') + '</div>' : '') +
      (deepLink ? '<input class="notif-input notif-link" id="notif-bot-link" type="text" dir="ltr" readonly value="' + esc(deepLink) + '">' : '<div class="notif-muted">' + esc(ui("Create a Telegram link, then open it here or copy it to your phone.", "أنشئ رابط تليجرام ثم افتحه من هنا أو انسخه إلى الهاتف.")) + '</div>') +
      (startCommand ? '<div class="notif-muted">' + esc(ui("If Telegram opens the chat without connecting, send this exact message:", "If Telegram opens the chat without connecting, send this exact message:")) + '</div><input class="notif-input notif-link" id="notif-start-command" type="text" dir="ltr" readonly value="' + esc(startCommand) + '">' : '') +
      (webhookProblem ? '<div class="notif-error">' + esc(webhookProblem) + '</div>' : '') +
      '<div class="notif-actions">' +
        '<button class="notif-btn notif-primary" id="notif-connect-telegram">' + icon("send") + '<span>' + esc(connected ? ui("Reconnect Telegram", "إعادة ربط تليجرام") : ui("Connect Telegram", "ربط تليجرام")) + '</span></button>' +
        '<button class="notif-btn" id="notif-copy-link">' + icon("copy") + '<span>' + esc(ui("Copy link", "نسخ الرابط")) + '</span></button>' +
        (deepLink ? '<button class="notif-btn" id="notif-open-bot">' + icon("externalLink") + '<span>' + esc(ui("Open Telegram", "فتح تليجرام")) + '</span></button>' : '') +
        '<button class="notif-btn" id="notif-check-connection">' + icon("refreshCw") + '<span>' + esc(ui("Check status", "فحص الحالة")) + '</span></button>' +
        (startCommand ? '<button class="notif-btn" id="notif-copy-start-command">' + icon("copy") + '<span>' + esc(ui("Copy /start code", "Copy /start code")) + '</span></button>' : '') +
      '</div>' +
    '</div>';
  }

  function renderPreview() {
    var preview = state.preview;
    if (!preview) return '<div class="notif-empty">' + esc(ui("Preview shows the matching products before anything is sent.", "المعاينة تعرض المنتجات المطابقة قبل إرسال أي شيء.")) + '</div>';
    if (!preview.ok) return '<div class="notif-error">' + esc(friendlyError(preview.error)) + '</div>';
    var rows = (preview.matches || []).slice(0, 10).map(function (product) {
      var statusClass = product.profitStatus === "profitable" ? "good" : product.profitStatus === "losing" ? "bad" : "";
      var caseLabel = product.alertCase && product.alertCase.label;
      return '<div class="notif-product">' +
        '<div class="notif-product-main"><div><bdi class="notif-product-name">' + esc(product.name || ui("Unnamed product", "منتج بدون اسم")) + '</bdi>' +
        (caseLabel ? '<div class="notif-product-case">' + esc(defaultCaseLabel(caseLabel)) + '</div>' : '') +
        '</div><span class="notif-sku">SKU: ' + esc(product.sku || "-") + '</span></div>' +
        '<div class="notif-metrics">' +
          '<span>NDR ' + esc(Math.round((Number(product.ndrPct) || 0) * 10) / 10) + '%</span>' +
          '<span>' + esc(ui("Orders", "طلبات")) + ' ' + esc(product.netOrders || 0) + '</span>' +
          '<span class="' + statusClass + '">' + esc(profitLabel(product.profitStatus)) + '</span>' +
          '<span>' + esc(money(product.netProfit, product.currency)) + '</span>' +
          '<span>' + esc(spendLabel(product.spendStatus)) + '</span>' +
        '</div>' +
      '</div>';
    }).join("");
    return '<div class="notif-preview-count">' + esc(ui("Matched products", "المنتجات المطابقة")) + ': <strong>' + esc((preview.matches || []).length) + '</strong> / ' + esc(preview.totalProducts || 0) + '</div>' +
      (rows || '<div class="notif-empty">' + esc(ui("No product matches these rules now.", "لا توجد منتجات مطابقة لهذه القواعد الآن.")) + '</div>');
  }

  function renderHistory() {
    var history = state.history || [];
    if (!history.length) return '<div class="notif-empty">' + esc(ui("No sent alerts yet.", "لم يتم إرسال أي تنبيهات بعد.")) + '</div>';
    return '<div class="notif-history">' + history.slice(0, 6).map(function (item) {
      var when = item.sentAt ? new Date(item.sentAt).toLocaleString(locale()) : "";
      return '<div class="notif-history-row"><div><strong>' + esc(item.productCount || 0) + '</strong> ' + esc(ui("products sent", "منتجات تم إرسالها")) + '</div><span>' + esc(when) + '</span></div>';
    }).join("") + '</div>';
  }

  function renderInto(mountEl, mode) {
    state.mountEl = mountEl;
    state.mode = mode || "dashboard";
    var settings = settingsForDashboard(state.settings);
    var dashboardAccount = dashboardAccountContext();
    var showAccountList = dashboardAccount.isAll && settings.scope === "selected";
    var accountsStyle = showAccountList ? "" : "display:none";
    mountEl.innerHTML = renderStyles() +
      '<div class="notif-root dash-scroll"><div class="notif-wrap">' +
        '<div class="notif-hero"><div><div class="notif-kicker">' + esc(ui("Product alerts", "تنبيهات المنتجات")) + '</div><div class="notif-title">' + esc(ui("Notifications", "التنبيهات")) + '</div><div class="notif-sub">' + esc(ui("Send Telegram product alerts for the current dashboard account while the app is running. The scheduler checks every 4 hours, and nothing sends when alerts are turned off.", "أرسل تنبيهات المنتجات عبر تليجرام للحساب المحدد في لوحة التحكم أثناء تشغيل التطبيق. يتم الفحص كل 4 ساعات، ولا يتم إرسال أي تنبيه عند إيقاف التنبيهات.")) + '</div></div></div>' +
        '<div class="notif-layout">' +
          '<section class="notif-panel">' +
            '<div class="notif-panel-head"><div><div class="notif-panel-title">' + esc(ui("Alert rules", "قواعد التنبيهات")) + '</div><div class="notif-panel-sub">' + esc(ui("Create up to two rules. Example: one rule for high NDR, one rule for low NDR.", "يمكن إعداد قاعدتين فقط، مثل قاعدة للـ NDR المرتفع وقاعدة للـ NDR المنخفض.")) + '</div></div>' +
              '<div class="notif-enable"><label class="notif-switch"><input id="notif-enabled" type="checkbox"' + (settings.enabled ? " checked" : "") + '><span class="notif-slider"></span></label><div><strong>' + esc(settings.enabled ? ui("Enabled", "مفعلة") : ui("Disabled", "متوقفة")) + '</strong><span>' + esc(ui("Product alerts switch", "تشغيل/إيقاف تنبيهات المنتجات")) + '</span></div></div>' +
            '</div>' +
            '<div class="notif-grid">' +
              renderAccountScope(settings) +
              '<div class="notif-field"><label>' + esc(ui("Products per message", "عدد المنتجات في كل رسالة")) + '</label><input class="notif-input" id="notif-max-products" type="number" min="1" max="20" step="1" value="' + esc(settings.maxProductsPerMessage) + '"></div>' +
              '<div class="notif-field"><label>' + esc(ui("Send interval", "فاصل الإرسال")) + '</label><input type="hidden" id="notif-cooldown" value="' + esc(settings.cooldownHours) + '"><div class="notif-segment is-wrap">' +
                [4, 6, 12, 24, 48, 72].map(function (value) {
                  return '<button type="button" class="notif-seg-btn notif-cooldown-btn ' + (Number(settings.cooldownHours) === value ? "is-active" : "") + '" data-value="' + value + '">' + value + ' ' + esc(ui("h", "س")) + '</button>';
                }).join("") +
              '</div></div>' +
            '</div>' +
            '<div class="notif-accounts" id="notif-account-list" style="' + accountsStyle + '">' + renderAccounts(settings) + '</div>' +
            '<div class="notif-case-list">' + settings.cases.map(renderCase).join("") + '</div>' +
            '<div class="notif-actions"><button class="notif-btn notif-primary" id="notif-preview">' + icon("search") + '<span>' + esc(ui("Preview matches", "معاينة المنتجات المطابقة")) + '</span></button><button class="notif-btn notif-save" id="notif-save">' + icon("save") + '<span>' + esc(ui("Save", "حفظ")) + '</span></button><button class="notif-btn" id="notif-run-now">' + icon("play") + '<span>' + esc(ui("Run now", "تشغيل الآن")) + '</span></button></div>' +
          '</section>' +
          '<section class="notif-panel">' +
            '<div class="notif-panel-title">' + esc(ui("Telegram", "تليجرام")) + '</div><div class="notif-panel-sub">' + esc(ui("The customer connects this product-alert bot from here. No error-alert bot is used.", "يربط العميل بوت تنبيهات المنتجات من هنا. لا يتم استخدام بوت الأخطاء الداخلي.")) + '</div>' +
            renderTelegramConnection() +
            '<div class="notif-actions"><button class="notif-btn" id="notif-test">' + icon("send") + '<span>' + esc(ui("Send test", "إرسال تجربة")) + '</span></button></div>' +
            '<div style="margin-top:16px"><div class="notif-panel-title">' + esc(ui("Preview", "المعاينة")) + '</div><div id="notif-preview-box" style="margin-top:8px">' + renderPreview() + '</div></div>' +
            '<div style="margin-top:16px"><div class="notif-panel-title">' + esc(ui("Sent alerts", "التنبيهات المرسلة")) + '</div><div id="notif-history-box" style="margin-top:8px">' + renderHistory() + '</div></div>' +
          '</section>' +
        '</div>' +
      '</div></div>';
    bindEvents(mountEl);
    if (window.TaagerUI) window.TaagerUI.enhance(mountEl);
  }

  function bindEvents(root) {
    function activateSegment(button) {
      var group = button && button.closest(".notif-segment");
      var field = button && button.closest(".notif-field");
      var value = button && button.getAttribute("data-value");
      if (!group || value == null) return;
      group.querySelectorAll(".notif-seg-btn").forEach(function (item) {
        item.classList.toggle("is-active", item === button);
      });
      var hidden = null;
      if (button.classList.contains("notif-op-btn")) {
        hidden = button.closest("[data-case-index]") && button.closest("[data-case-index]").querySelector(".notif-ndr-operator");
      } else {
        hidden = field && field.querySelector("input[type='hidden']");
      }
      if (hidden) hidden.value = value;
    }
    root.querySelectorAll(".notif-op-btn,.notif-cooldown-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        activateSegment(button);
      });
    });
    root.querySelectorAll(".notif-scope-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        activateSegment(button);
        state.settings = formSettings();
        renderInto(root, state.mode);
      });
    });
    root.querySelectorAll(".notif-case-enabled").forEach(function (input) {
      input.addEventListener("change", function () {
        state.settings = formSettings();
        renderInto(root, state.mode);
      });
    });
    root.querySelector("#notif-enabled")?.addEventListener("change", function () {
      state.settings = formSettings();
      renderInto(root, state.mode);
    });
    root.querySelector("#notif-preview")?.addEventListener("click", preview);
    root.querySelector("#notif-save")?.addEventListener("click", save);
    root.querySelector("#notif-test")?.addEventListener("click", testTelegram);
    root.querySelector("#notif-run-now")?.addEventListener("click", runNow);
    root.querySelector("#notif-connect-telegram")?.addEventListener("click", connectTelegram);
    root.querySelector("#notif-check-connection")?.addEventListener("click", checkTelegramConnection);
    root.querySelector("#notif-open-bot")?.addEventListener("click", function () {
      openBotLink();
    });
    root.querySelector("#notif-copy-link")?.addEventListener("click", copyBotLink);
    root.querySelector("#notif-copy-start-command")?.addEventListener("click", copyStartCommand);
  }

  async function load() {
    var response = await window.api.getProductAlertSettings();
    state.settings = settingsForDashboard(response && response.settings || defaultSettings());
    state.accounts = response && response.accounts || [];
    state.history = response && response.history || [];
    state.connection = response && response.telegramConnection || null;
  }

  async function save() {
    try {
      var response = await window.api.saveProductAlertSettings({ settings: formSettings() });
      if (!response || !response.ok) throw new Error(response && response.error || "SAVE_FAILED");
      state.settings = settingsForDashboard(response.settings);
      toast(ui("Notification settings saved.", "تم حفظ إعدادات التنبيهات."), "success");
      renderInto(state.mountEl, state.mode);
    } catch (error) {
      toast(friendlyError(error), "error");
    }
  }

  async function preview() {
    try {
      state.preview = await window.api.previewProductAlerts({ settings: formSettings(), options: dashboardAlertOptions() });
      renderInto(state.mountEl, state.mode);
    } catch (error) {
      state.preview = { ok: false, error: friendlyError(error) };
      renderInto(state.mountEl, state.mode);
    }
  }

  async function testTelegram() {
    try {
      var response = await window.api.testProductAlertTelegram({ settings: formSettings(), options: dashboardAlertOptions() });
      if (!response || !response.ok) throw new Error(response && response.error || "TEST_FAILED");
      toast(ui("Test message sent.", "تم إرسال رسالة التجربة."), "success");
    } catch (error) {
      toast(friendlyError(error), "error");
    }
  }

  async function createTelegramConnection() {
    try {
      var response = await window.api.createProductAlertTelegramConnection();
      if (!response || !response.ok) throw new Error(response && response.error || "CONNECT_FAILED");
      state.connection = response;
      toast(ui("Telegram connection link created.", "تم إنشاء رابط ربط تليجرام."), "success");
      renderInto(state.mountEl, state.mode);
      return response;
    } catch (error) {
      toast(friendlyError(error), "error");
      state.connection = { ok: false, error: friendlyError(error) };
      renderInto(state.mountEl, state.mode);
      return null;
    }
  }

  async function connectTelegram() {
    if (hasPendingTelegramConnection()) {
      openBotLink();
      return;
    }
    var response = await createTelegramConnection();
    if (response && response.deepLink) openBotLink(response.deepLink);
  }

  async function checkTelegramConnection() {
    try {
      var response = await window.api.getProductAlertTelegramConnectionStatus();
      if (!response || response.ok === false) throw new Error(response && response.error || "STATUS_FAILED");
      state.connection = response;
      toast(response.connected ? ui("Telegram is connected.", "تليجرام متصل.") : ui("Telegram is not connected yet.", "تليجرام غير متصل بعد."), response.connected ? "success" : "info");
      renderInto(state.mountEl, state.mode);
    } catch (error) {
      state.connection = { ok: false, error: friendlyError(error) };
      toast(friendlyError(error), "error");
      renderInto(state.mountEl, state.mode);
    }
  }

  async function openBotLink(link) {
    var deepLink = typeof link === "string" ? link : currentBotLink();
    var appLink = currentBotAppLink();
    if (!deepLink) {
      toast(ui("Telegram link is not ready yet.", "رابط تليجرام غير جاهز بعد."), "info");
      return;
    }
    try {
      if (window.api && typeof window.api.openExternalUrl === "function") {
        var response = appLink ? await window.api.openExternalUrl(appLink) : null;
        if (response && response.ok !== false) return;
        response = await window.api.openExternalUrl(deepLink);
        if (response && response.ok !== false) return;
        console.warn("[Notifications] External Telegram open failed.", response && response.error);
      }
      if (openBrowserFallback(deepLink)) return;
    } catch (error) {
      console.warn("[Notifications] Telegram open failed.", error);
    }
    var copied = await copyText(deepLink).then(function () { return true; }).catch(function () { return false; });
    toast(copied ? ui("Could not open Telegram, so the link was copied.", "تعذر فتح تليجرام، لذلك تم نسخ الرابط.") : ui("Could not open Telegram. Copy the link manually.", "تعذر فتح تليجرام. انسخ الرابط يدويًا."), copied ? "info" : "error");
  }

  function openBrowserFallback(url) {
    try {
      var opened = window.open(url, "_blank", "noopener,noreferrer");
      return !!opened;
    } catch (error) {
      return false;
    }
  }

  async function copyText(value) {
    if (window.api && typeof window.api.copyText === "function") {
      try {
        var result = await window.api.copyText(value);
        if (!result || result.ok !== false) return result || { ok: true };
      } catch (error) {
        console.warn("[Notifications] Electron clipboard copy failed, using DOM fallback.", error);
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(value);
    }
    var input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    return { ok: true };
  }

  async function copyBotLink() {
    var deepLink = currentBotLink();
    if (!deepLink) {
      var response = await createTelegramConnection();
      deepLink = response && response.deepLink || "";
    }
    if (!deepLink) {
      toast(ui("Telegram link is not ready yet.", "رابط تليجرام غير جاهز بعد."), "info");
      return;
    }
    try {
      await copyText(deepLink);
      toast(ui("Telegram link copied.", "تم نسخ رابط تليجرام."), "success");
    } catch (error) {
      toast(friendlyError(error), "error");
    }
  }

  async function copyStartCommand() {
    var command = currentStartCommand();
    if (!command) {
      toast(ui("Telegram connection code is not ready yet.", "Telegram connection code is not ready yet."), "info");
      return;
    }
    try {
      await copyText(command);
      toast(ui("Telegram /start command copied.", "Telegram /start command copied."), "success");
    } catch (error) {
      toast(friendlyError(error), "error");
    }
  }

  async function runNow() {
    try {
      await save();
      var response = await window.api.runProductAlertsNow({ ignoreCooldown: true, options: dashboardAlertOptions() });
      if (!response || !response.ok) throw new Error(response && response.error || "RUN_FAILED");
      toast(response.sent ? ui("Alert sent.", "تم إرسال التنبيه.") : ui("No matching product to send now.", "لا يوجد منتج مطابق للإرسال الآن."), response.sent ? "success" : "info");
      await load();
      renderInto(state.mountEl, state.mode);
    } catch (error) {
      toast(friendlyError(error), "error");
    }
  }

  window.renderSectionNotifications = async function renderSectionNotifications(mountEl) {
    if (!mountEl) return;
    state.dashboardContext = arguments[2] && arguments[2].data || arguments[1] || null;
    mountEl.innerHTML = '<div class="dash-scroll" style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--dash-text-muted,var(--text2));font-weight:var(--weight-semibold)">' + esc(ui("Loading notifications...", "جاري تحميل التنبيهات...")) + '</div>';
    await load();
    renderInto(mountEl, "dashboard");
  };

  window.renderNotifications = async function renderNotifications() {
    var el = document.getElementById("page-notifications");
    if (!el) return;
    state.dashboardContext = null;
    el.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text2);font-weight:var(--weight-semibold)">' + esc(ui("Loading notifications...", "جاري تحميل التنبيهات...")) + '</div>';
    await load();
    renderInto(el, "standalone");
  };
})();
