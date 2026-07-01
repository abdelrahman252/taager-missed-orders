// ── SETUP PAGE — Redesigned v3 (Execution Setup style) ──
// Tasks:
// [✅] 1. Auto-label accounts as {customerName} 1, 2, 3 — no label input
// [✅] 2. UI exactly like Image 2: card grid with checkmarks, summary, run button
// [✅] 3. Reset button always visible, disabled when account is locked
// [✅] 4. Add Account card inside the grid (dashed tile)
// [✅] 5. Sidebar navigation (Accounts → Date → Run)

window.renderSetup = function (onComplete, initialStep) {
  const t = window._t;
  const el = document.getElementById("page-setup");

  let readyResolve;
  window._setupInitialReady = new Promise((resolve) => {
    readyResolve = resolve;
  });

  let accounts    = [];
  let maxAccounts = 1;
  let remoteAccountSlots = null;
  let credentialBackupPrompt = null;
  let editingId   = null;

  // Step state: "accounts" | "run"
  // initialStep lets the caller decide the landing step (e.g. skip to "run" if accounts exist)
  let step = (initialStep === "run" || initialStep === "accounts") ? initialStep : "accounts";
  if (window._teamLeaderEnabled) step = "accounts";
  let runFlowStep = "users"; // "users" | "date"
  window._setupCurrentStep = step; // exposed so adminRefresh() can re-render at the correct step

  // Date state
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  })();
  let dateMode   = "today";   // "today" | "single" | "range"
  let dateFrom   = todayStr;
  let dateTo     = todayStr;

  // Selected account IDs (for multi-account support)
  let selectedIds = [];

  async function loadAccounts() {
    try {
      const creds = await window.api.getCredentials();
      accounts    = creds.accounts || [];
      maxAccounts = creds.maxAccounts || 1;
      remoteAccountSlots = creds.remoteAccountSlots || null;
      credentialBackupPrompt = window.api.getLicenseCredentialBackupPromptStatus
        ? await window.api.getLicenseCredentialBackupPromptStatus()
        : null;

      if (!accounts.length && creds.easyEmail) {
        accounts = [{
          id: "account_1",
          label: buildLabel(1),
          easyEmail: creds.easyEmail,
          easyStore: creds.easyStore || "",
          taagerEmail: creds.taagerEmail || "",
          taagerCountry: creds.taagerCountry || "sa",
          taagerLoginMethod: creds.taagerLoginMethod || "email",
          taagerEmail: creds.taagerEmail || creds.taagerEmail || "",
          taagerPhone: creds.taagerPhone || "",
          taagerCountry: creds.taagerCountry || creds.taagerCountry || "sa",
          taagerAffiliateCode: creds.taagerAffiliateCode || "",
          locked: true,
        }];
      }

      // Default: nothing selected — user picks on the Run step
      selectedIds = [];
      renderShell();
    } catch (err) {
      console.error("Error loading accounts in setup:", err);
    } finally {
      if (readyResolve) {
        readyResolve();
        readyResolve = null;
      }
    }
  }

  // ── Label builder: "{CustomerName} 1", "{CustomerName} 2", etc. ──
  function buildLabel(n) {
    const name = (window._kbotUser && window._kbotUser.customerName) || window._t("setup.account_fallback");
    return `${name} ${n}`;
  }

  function getNextLabel() {
    const n = accounts.length + 1;
    return buildLabel(n);
  }

  function setupText(key, fallback) {
    const value = t(key);
    return !value || value === key ? fallback : value;
  }

  async function refreshAccountStateAfterMutation(reason = "accounts-updated") {
    const fresh = await window.api.getCredentials();
    accounts = fresh.accounts || [];
    window._kbotAccounts = accounts;
    maxAccounts = fresh.maxAccounts || maxAccounts;
    remoteAccountSlots = fresh.remoteAccountSlots || null;
    credentialBackupPrompt = window.api.getLicenseCredentialBackupPromptStatus
      ? await window.api.getLicenseCredentialBackupPromptStatus()
      : null;

    if (window.invalidateDashboardCache) window.invalidateDashboardCache(reason);
    if (typeof invalidatePage === "function") {
      invalidatePage("page-dashboard", reason);
      invalidatePage("page-analytics", reason);
      invalidatePage("page-operations", reason);
    }
    if (typeof updateTopBarText === "function") updateTopBarText();
    try {
      window.dispatchEvent(new CustomEvent("taager-accounts-updated", {
        detail: { reason, accounts: accounts.slice() }
      }));
    } catch (_) {}
    return fresh;
  }

  function getTaagerCountryOptions() {
    const country = window.TaagerCountry;
    const meta = (value, fallbackCode, fallbackLabel) => {
      const item = country && country.get ? country.get(value) : { code: fallbackCode, en: fallbackLabel, ar: fallbackLabel };
      return {
        value,
        code: item.code || fallbackCode,
        label: country && country.label ? country.label(value) : fallbackLabel,
      };
    };
    return [
      meta("sa", "SA", setupText("setup.country_sa", "Saudi Arabia")),
      meta("eg", "EG", setupText("setup.country_eg", "Egypt")),
      meta("iq", "IQ", setupText("setup.country_iq", "Iraq")),
      meta("ae", "AE", setupText("setup.country_ae", "United Arab Emirates")),
      meta("om", "OM", setupText("setup.country_om", "Oman")),
    ];
  }

  function accountCountryMeta(acc) {
    const value = (acc && acc.taagerCountry) || "sa";
    const country = window.TaagerCountry;
    const item = country && country.get ? country.get(value) : { code: String(value || "sa").toUpperCase(), flag: "" };
    return {
      code: item.code || String(value || "sa").toUpperCase(),
      flagClass: country && country.flagClass ? country.flagClass(value) : "taager-country-flag flag:SA",
      label: country && country.label ? country.label(value) : String(value || "sa").toUpperCase(),
    };
  }

  // ── Total days calculation ──
  function daysBetween(from, to) {
    const a = new Date(from), b = new Date(to);
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  }

  // ─────────────────────────────────────────────────────────────────
  // SHELL — sidebar + content area, rendered once
  // ─────────────────────────────────────────────────────────────────
  function renderShell() {
    el.innerHTML = `
      <style>
        /* ── Entry animation (sidebar + all nav styles come from main.css) ── */
        .sv3-shell { animation: sv3-shell-enter .48s ease both; }
        @keyframes sv3-shell-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Main content ── */
        .sv3-main {
          flex: 1;
          overflow-y: auto;
          padding: 28px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        /* Inner content uses max-width centering like INSTALL */
        .sv3-main > * {
          width: 100%;
          max-width: 960px;
          margin-left: auto;
          margin-right: auto;
        }

        .sv3-run-stage {
          width: 100%;
          max-width: 1060px;
          margin: auto;
          animation: sv3-run-stage-enter .42s ease both;
        }
        @keyframes sv3-run-stage-enter {
          from { opacity: 0; transform: translateY(14px) scale(.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ── Phase badge ── */
        .sv3-phase-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(124,106,247,.12);
          border: 1px solid rgba(124,106,247,.3);
          color: #b3a9f9;
          border-radius: 99px;
          padding: 3px 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .sv3-page-title { font-size: 24px; font-weight: 800; color: var(--text); letter-spacing: -.4px; margin-bottom: 4px; }
        .sv3-page-sub   { font-size: 13px; color: var(--text2); margin-bottom: 28px; }
        .sv3-recovery-note {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          margin-bottom: 18px;
          border-radius: 8px;
          background: rgba(245, 158, 11, .12);
          border: 1px solid rgba(245, 158, 11, .34);
          color: var(--text);
          font-size: 13px;
          line-height: 1.45;
        }
        .sv3-recovery-note strong {
          display: block;
          margin-bottom: 3px;
          font-size: 13px;
        }
        .sv3-recovery-note span {
          color: var(--text2);
        }
        .sv3-recovery-note-badge {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          background: rgba(245, 158, 11, .2);
          border: 1px solid rgba(245, 158, 11, .4);
          color: #fbbf24;
          font-weight: 900;
          font-size: 13px;
        }

        .sv3-run-title-lockup {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .sv3-run-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, rgba(124,106,247,.55), rgba(79,142,247,.18));
          border: 1px solid rgba(124,106,247,.28);
          box-shadow: 0 18px 46px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.1);
          font-size: 24px;
        }
        .sv3-run-title-lockup .sv3-page-title {
          font-size: 30px;
          line-height: 1.05;
          margin-bottom: 8px;
        }
        .sv3-run-title-lockup .sv3-page-sub {
          font-size: 15px;
          margin-bottom: 0;
        }
        .sv3-run-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 40px;
          margin-bottom: 26px;
        }
        .sv3-run-hero-copy { min-width: 240px; }
        .sv3-flow-stepper {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          width: min(470px, 100%);
          padding: 0;
          background: transparent;
          border: 0;
        }
        .sv3-flow-stepper::before {
          content: "";
          position: absolute;
          top: 27px;
          left: 52px;
          right: 76px;
          height: 2px;
          background: var(--border);
        }
        .sv3-flow-stepper.date-active::before {
          background: linear-gradient(90deg,#7c6af7,#00d68f);
        }
        .sv3-flow-node {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 64px;
          border-radius: 0;
          padding: 4px 10px;
          color: var(--text2);
          overflow: visible;
          background: transparent;
        }
        .sv3-flow-node-num {
          position: relative;
          z-index: 1;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: var(--bg2);
          border: 1px solid var(--border);
          color: var(--text);
          font-size: 16px;
          font-weight: 800;
        }
        .sv3-flow-node.done .sv3-flow-node-num { background: linear-gradient(135deg,#21d892,#09a86d); border-color: rgba(55,239,166,.45); color: #041b13; }
        .sv3-flow-node.active .sv3-flow-node-num { background: linear-gradient(135deg,#8d63ff,#6847d8); border-color: rgba(167,139,250,.6); color: #fff; box-shadow: 0 0 0 8px rgba(124,106,247,.14), 0 16px 34px rgba(97,70,215,.28); }
        .sv3-flow-node.active .sv3-flow-node-num::after {
          content: "";
          position: absolute;
          inset: -8px;
          border-radius: 999px;
          border: 1px solid rgba(124,106,247,.55);
          animation: sv3-step-heartbeat 1.45s ease-out infinite;
          pointer-events: none;
        }
        @keyframes sv3-step-heartbeat {
          0% { opacity: .85; transform: scale(.82); box-shadow: 0 0 0 0 rgba(124,106,247,.3); }
          55% { opacity: .12; transform: scale(1.45); box-shadow: 0 0 0 12px rgba(124,106,247,0); }
          100% { opacity: 0; transform: scale(1.55); box-shadow: 0 0 0 16px rgba(124,106,247,0); }
        }
        .sv3-flow-node-text {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .sv3-flow-node-title { font-size: 14px; font-weight: 800; color: var(--text); }
        .sv3-flow-node-sub { font-size: 12px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .sv3-flow-panel {
          position: relative;
          overflow: hidden;
          animation: sv3-panel-enter .34s cubic-bezier(.18,.86,.3,1) both;
        }
        .sv3-flow-panel::before {
          content: none;
        }
        @keyframes sv3-panel-enter {
          from { opacity: 0; transform: translateX(18px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sv3-shell,
          .sv3-run-stage,
          .sv3-flow-panel,
          .sv3-acc-card { animation: none !important; transition: none !important; }
        }
        .sv3-section-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 22px;
          margin-bottom: 20px;
        }
        .sv3-step-heading {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .sv3-step-badge {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(124,106,247,.14);
          border: 1px solid rgba(124,106,247,.3);
          color: #c5bfff;
          font-size: 13px;
          font-weight: 900;
        }
        .sv3-step-badge.green {
          background: rgba(0,214,143,.12);
          border-color: rgba(0,214,143,.28);
          color: #45e6b3;
        }
        .sv3-section-title-lg { font-size: 16px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
        .sv3-section-copy { font-size: 12px; color: var(--text2); line-height: 1.45; }
        .sv3-settings-dock {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
          min-width: 330px;
        }
        .sv3-setting-card {
          background:
            radial-gradient(circle at 12% 18%, rgba(79,142,247,.1), transparent 34%),
            rgba(24,33,50,.7);
          border: 1px solid rgba(125,148,186,.22);
          border-radius: 20px;
          padding: 28px 30px;
          min-height: 142px;
          transition: border-color .2s, background .2s;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }
        .sv3-setting-card:hover {
          border-color: rgba(124,106,247,.42);
          background:
            radial-gradient(circle at 12% 18%, rgba(79,142,247,.14), transparent 34%),
            rgba(24,33,50,.82);
        }
        .sv3-setting-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .sv3-setting-title { font-size: 12px; font-weight: 800; color: var(--text); margin-bottom: 0; }
        .sv3-setting-desc {
          width: 100%;
          margin-top: 9px;
          padding-inline-start: 48px;
          font-size: 10.5px;
          color: var(--text2);
          line-height: 1.45;
        }
        .sv3-setting-meta { margin-top: 9px; }
        .sv3-setting-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, rgba(124,106,247,.52), rgba(79,142,247,.14));
          border: 1px solid rgba(167,139,250,.22);
          font-size: 24px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }
        .sv3-setting-copy {
          display: flex;
          align-items: flex-start;
          gap: 20px;
          min-width: 0;
        }
        .sv3-toggle-btn {
          width: 46px;
          height: 25px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          position: relative;
          transition: background .25s, box-shadow .25s;
          background: var(--border);
          flex-shrink: 0;
        }
        .sv3-toggle-btn span {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 19px;
          height: 19px;
          border-radius: 50%;
          background: #fff;
          transition: transform .25s;
          box-shadow: 0 2px 8px rgba(0,0,0,.18);
        }
        .sv3-toggle-label { font-size: 10px; color: var(--text2); min-width: 24px; font-weight: 700; }

        /* ── Section card ── */
        .sv3-section {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px 24px;
          margin-bottom: 18px;
        }
        .sv3-date-panel {
          position: relative;
          border-radius: 24px;
          padding: 28px 44px 30px;
          overflow: hidden;
          background:
            radial-gradient(circle at 14% 10%, rgba(79,142,247,.16), transparent 32%),
            radial-gradient(circle at 90% 20%, rgba(124,106,247,.13), transparent 30%),
            rgba(17,23,36,.86);
          border: 1px solid rgba(125,148,186,.28);
          box-shadow: 0 24px 70px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .sv3-date-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(255,255,255,.035), transparent 34%);
        }
        .sv3-date-panel > * {
          position: relative;
        }
        .sv3-users-panel {
          position: relative;
          border-radius: 24px;
          padding: 34px 38px 30px;
          overflow: hidden;
          background:
            radial-gradient(circle at 12% 20%, rgba(124,106,247,.16), transparent 34%),
            radial-gradient(circle at 88% 12%, rgba(79,142,247,.12), transparent 30%),
            rgba(17,23,36,.86);
          border: 1px solid rgba(125,148,186,.28);
          box-shadow: 0 24px 70px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .sv3-users-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(255,255,255,.035), transparent 34%);
        }
        .sv3-users-panel > * {
          position: relative;
        }
        .sv3-users-panel .sv3-section-top {
          display: block;
          margin-bottom: 0;
        }
        .sv3-users-panel .sv3-step-heading {
          align-items: center;
        }
        .sv3-users-panel .sv3-step-badge,
        .sv3-date-panel .sv3-step-badge {
          width: 58px;
          height: 58px;
          border-radius: 14px;
          font-size: 24px;
          background: linear-gradient(135deg, rgba(124,106,247,.82), rgba(61,38,135,.74));
          border-color: rgba(167,139,250,.34);
          box-shadow: 0 14px 32px rgba(80,55,180,.26), inset 0 1px 0 rgba(255,255,255,.08);
        }
        .sv3-users-panel .sv3-section-title-lg,
        .sv3-date-panel .sv3-section-title-lg {
          font-size: 25px;
          line-height: 1.1;
          margin-bottom: 10px;
        }
        .sv3-users-panel .sv3-section-copy,
        .sv3-date-panel .sv3-section-copy {
          font-size: 16px;
          color: #aab6ca;
        }
        .sv3-users-panel .sv3-settings-dock {
          margin-top: 34px;
        }
        .sv3-users-panel .sv3-setting-row {
          align-items: flex-start;
        }
        .sv3-users-panel .sv3-setting-title {
          font-size: 19px;
          margin-bottom: 10px;
        }
        .sv3-users-panel .sv3-setting-desc {
          max-width: 285px;
          font-size: 15px;
          line-height: 1.5;
          color: #aab6ca;
        }
        .sv3-users-panel .sv3-toggle-btn {
          width: 62px;
          height: 34px;
          background: rgba(30,41,59,.9);
          border: 1px solid rgba(125,148,186,.22);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        }
        .sv3-users-panel .sv3-toggle-btn span {
          width: 28px;
          height: 28px;
        }
        .sv3-users-panel .sv3-toggle-label {
          font-size: 13px;
          min-width: 34px;
        }
        .sv3-section-hd {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }
        .sv3-section-hd-icon { font-size: 18px; }
        .sv3-section-hd-title { font-size: 15px; font-weight: 700; color: var(--text); }
        .sv3-section-desc { font-size: 12px; color: var(--text2); margin-bottom: 20px; padding-left: 28px; }

        /* ── Account cards grid ── */
        .sv3-grid {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .sv3-run-accounts {
          gap: 14px;
          margin-top: 34px;
        }
        .sv3-run-accounts .sv3-acc-card {
          width: clamp(218px, calc((100% - 28px) / 3), 286px);
          min-height: 320px;
          justify-content: center;
          gap: 12px;
          padding: 28px 28px 26px;
          border-radius: 20px;
          background:
            radial-gradient(circle at 50% 10%, rgba(79,142,247,.1), transparent 40%),
            rgba(24,33,50,.66);
          border: 1px solid rgba(125,148,186,.25);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }
        .sv3-run-accounts .sv3-acc-card.selected {
          border-color: rgba(124,106,247,.7);
          box-shadow: 0 0 0 1px rgba(124,106,247,.28), 0 20px 50px rgba(70,47,160,.18), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .sv3-run-accounts .sv3-check {
          top: 22px;
          right: 22px;
          width: 34px;
          height: 34px;
          border-color: rgba(125,148,186,.3);
          background: rgba(17,23,36,.58);
        }
        .sv3-run-accounts .sv3-acc-card.selected .sv3-check {
          background: linear-gradient(135deg,#8b5cf6,#4f8ef7);
          border-color: rgba(167,139,250,.7);
        }
        .sv3-run-accounts .sv3-avatar {
          width: 86px;
          height: 86px;
          font-size: 40px;
          margin-top: 10px;
          box-shadow: 0 18px 36px rgba(0,0,0,.2);
        }
        .sv3-run-accounts .sv3-avatar.lk {
          width: 88px;
          height: 88px;
          font-size: 30px;
          background: rgba(10,16,27,.58);
          border-color: rgba(125,148,186,.2);
        }
        .sv3-run-accounts .sv3-acc-name {
          max-width: 100%;
          font-size: 21px;
          line-height: 1.2;
          margin-top: 8px;
        }
        .sv3-run-accounts .sv3-acc-email {
          max-width: 100%;
          font-size: 14px;
          color: #aab6ca;
        }
        .sv3-run-accounts .sv3-status-pill {
          margin-top: 10px;
          padding: 11px 28px;
          font-size: 15px;
          border-radius: 999px;
          letter-spacing: .04em;
        }
        .sv3-run-accounts .sv3-status-pill.ok {
          background: rgba(16,185,129,.18);
          border-color: rgba(45,212,191,.38);
          color: #38e6a7;
        }
        .sv3-run-accounts .sv3-lock-badge {
          position: absolute;
          top: 22px;
          left: 22px;
          background: rgba(245,158,11,.16);
          border: 1px solid rgba(245,158,11,.5);
          border-radius: 999px;
          padding: 7px 15px;
          font-size: 14px;
          font-weight: 800;
          color: #ffd166;
          letter-spacing: .01em;
        }

        /* Account card */
        .sv3-acc-card {
          width: 160px;
          min-height: 178px;
          background: var(--bg3, #1e2535);
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 28px 14px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: border-color .15s, box-shadow .15s, transform .12s;
          position: relative;
          text-align: center;
          user-select: none;
          animation: sv3-card-pop .34s cubic-bezier(.2,.8,.2,1) both;
        }
        .sv3-acc-card:nth-child(2) { animation-delay: .04s; }
        .sv3-acc-card:nth-child(3) { animation-delay: .08s; }
        .sv3-acc-card:nth-child(4) { animation-delay: .12s; }
        .sv3-acc-card:nth-child(5) { animation-delay: .16s; }
        @keyframes sv3-card-pop {
          from { opacity: 0; transform: translateY(8px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .sv3-acc-card.selected {
          border-color: #7c6af7;
          box-shadow: 0 0 0 2px rgba(124,106,247,.2);
        }
        .sv3-acc-card:hover:not(.sv3-acc-locked) {
          border-color: rgba(124,106,247,.5);
          transform: translateY(-2px);
        }
        .sv3-acc-locked {
          opacity: .72;
          cursor: default;
        }
        .sv3-card-meta-stack {
          position: absolute;
          top: 10px;
          right: 10px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 5px;
          max-width: 88px;
          z-index: 2;
          pointer-events: none;
        }
        [dir="rtl"] .sv3-card-meta-stack {
          right: auto;
          left: 10px;
          align-items: flex-start;
        }
        .sv3-manage-meta-row {
          left: 10px;
          right: 10px;
          width: auto;
          max-width: none;
          flex-direction: row;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        [dir="rtl"] .sv3-manage-meta-row {
          left: 10px;
          right: 10px;
          align-items: flex-start;
        }
        .sv3-manage-meta-row .sv3-lock-badge {
          order: 1;
        }
        .sv3-manage-meta-row .sv3-country-badge {
          order: 2;
        }
        .sv3-run-acc-card .sv3-card-meta-stack {
          right: 38px;
        }
        [dir="rtl"] .sv3-run-acc-card .sv3-card-meta-stack {
          right: auto;
          left: 38px;
        }
        .sv3-card-meta-stack .sv3-country-badge,
        .sv3-card-meta-stack .sv3-lock-badge {
          position: static !important;
          top: auto !important;
          right: auto !important;
          bottom: auto !important;
          left: auto !important;
          transform: none !important;
          max-width: 88px;
          pointer-events: auto;
        }
        .sv3-lock-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          max-width: 82px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          background: rgba(245,158,11,.13);
          border: 1px solid rgba(245,158,11,.34);
          border-radius: 999px;
          padding: 5px 8px;
          color: #ffd166;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .02em;
          line-height: 1;
        }
        .sv3-lock-badge.unlocked {
          background: rgba(0,214,143,.12);
          border-color: rgba(0,214,143,.32);
          color: #00d68f;
        }
        [dir="rtl"] .sv3-lock-badge {
          left: auto;
          right: 10px;
        }

        /* Checkmark corner */
        .sv3-check {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 1.5px solid var(--border);
          background: var(--bg2);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background .15s, border-color .15s;
        }
        .sv3-acc-card.selected .sv3-check {
          background: #7c6af7;
          border-color: #7c6af7;
        }
        .sv3-check svg { display: none; }
        .sv3-acc-card.selected .sv3-check svg { display: block; }

        /* Avatar */
        .sv3-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7c6af7 0%, #4f8ef7 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
          margin-top: 8px;
        }
        .sv3-avatar.lk {
          background: var(--bg2);
          border: 1.5px solid var(--border);
          color: var(--text2);
          font-size: 16px;
        }

        .sv3-acc-name {
          font-size: 12px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 116px;
        }
        .sv3-acc-email {
          font-size: 10px;
          color: var(--text2);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 116px;
        }
        .sv3-member-name-btn {
          border: 1px solid rgba(124,106,247,.35);
          background: rgba(124,106,247,.12);
          color: #b8b0ff;
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
          max-width: 112px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: border-color .12s ease, background .12s ease, color .12s ease;
        }
        .sv3-member-name-btn:hover {
          border-color: rgba(124,106,247,.75);
          background: rgba(124,106,247,.22);
          color: #fff;
        }

        .sv3-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 99px;
          padding: 2px 8px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .05em;
          margin-top: 2px;
        }
        .sv3-status-pill.ok  { background: rgba(0,214,143,.12); border: 1px solid rgba(0,214,143,.3); color: #00d68f; }
        .sv3-status-pill.lk  { background: rgba(255,201,77,.1);  border: 1px solid rgba(255,201,77,.3);  color: #ffc94d; }
        .sv3-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }

        /* Account action row */
        .sv3-hover-acts {
          display: flex;
          justify-content: center;
          gap: 5px;
          margin-top: 2px;
          opacity: 1;
          pointer-events: all;
        }
        .sv3-act-btn {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 2px 8px;
          font-size: 9px;
          font-weight: 700;
          cursor: pointer;
          color: var(--text2);
          transition: all .1s;
          line-height: 1.5;
        }
        .sv3-act-btn:hover { border-color: #7c6af7; color: #b3a9f9; }
        .sv3-act-btn.d:hover { border-color: var(--danger); color: var(--danger); }

        /* Add Account dashed card */
        .sv3-add-card {
          width: 160px;
          min-height: 178px;
          background: rgba(255,255,255,.018);
          border: 1.5px dashed rgba(125,148,186,.22);
          border-radius: 14px;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: border-color .15s, background .15s, transform .12s;
          text-align: center;
          color: var(--text2);
        }
        .sv3-add-card:hover:not(.sv3-add-disabled) {
          border-color: rgba(124,106,247,.55);
          background: rgba(124,106,247,.06);
          color: #b3a9f9;
          transform: translateY(-2px);
        }
        .sv3-add-disabled { opacity: .35; cursor: not-allowed; }
        .sv3-add-circle {
          width: 44px; height: 44px;
          border-radius: 14px;
          background: rgba(124,106,247,.1);
          border: 1px solid rgba(124,106,247,.28);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          color: #b3a9f9;
        }
        .sv3-add-label { font-size: 11px; font-weight: 700; line-height: 1.3; }
        .sv3-add-warn  { font-size: 9px; color: #ffc94d; line-height: 1.3; margin-top: 2px; }

        /* Selected count bar */
        .sv3-sel-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text2);
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--border);
        }
        .sv3-sel-bar svg { color: #7c6af7; }
        .sv3-sel-bar strong { color: var(--text); }

        /* ── Two-column lower section (date + summary) ── */
        .sv3-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-bottom: 18px;
        }
        /* Users + Settings column: users side gets more space */
        .sv3-users-settings-col {
          grid-template-columns: 3fr 2fr;
          align-items: start;
        }

        /* Date mode buttons */
        .sv3-date-modes {
          display: flex;
          gap: 12px;
          margin: 22px auto 20px;
          max-width: none;
        }
        .sv3-date-mode-btn {
          flex: 1;
          min-height: 48px;
          padding: 0 16px;
          background: rgba(16,23,36,.62);
          border: 1px solid rgba(125,148,186,.22);
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          color: #a9b5cc;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all .15s;
        }
        .sv3-date-mode-btn.active {
          background: linear-gradient(135deg, rgba(124,106,247,.28), rgba(79,142,247,.12));
          border-color: #7c6af7;
          color: #efeaff;
          box-shadow: 0 0 0 1px rgba(124,106,247,.2), 0 14px 32px rgba(87,64,196,.18);
        }
        .sv3-date-mode-btn:hover:not(.active) { border-color: rgba(124,106,247,.4); color: var(--text); }

        /* Date input row */
        .sv3-date-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
        }
        .sv3-date-field {
          flex: 1;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 12px;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .sv3-date-input {
          background: transparent;
          border: none;
          outline: none;
          font-size: 12px;
          color: var(--text);
          width: 100%;
          font-family: inherit;
          cursor: pointer;
        }
        .sv3-date-input::-webkit-calendar-picker-indicator { filter: invert(.6); cursor: pointer; }
        .sv3-date-arrow { color: var(--text2); font-size: 14px; flex-shrink: 0; }

        /* Summary card */
        .sv3-summary-rows { display: flex; flex-direction: column; gap: 14px; }
        .sv3-summary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border);
        }
        .sv3-summary-row:last-child { border-bottom: none; padding-bottom: 0; }
        .sv3-summary-row-left { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text2); }
        .sv3-summary-row-left span { font-size: 16px; }
        .sv3-summary-row-right { font-size: 13px; font-weight: 700; color: var(--text); text-align: right; }
        .sv3-mini-avatars { display: flex; margin-top: 6px; }
        .sv3-mini-av {
          width: 26px; height: 26px;
          border-radius: 50%;
          background: linear-gradient(135deg,#7c6af7,#4f8ef7);
          border: 2px solid var(--bg2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 800;
          color: #fff;
          margin-right: -6px;
        }
        .sv3-mini-av.more {
          background: var(--bg3);
          color: var(--text2);
          font-size: 8px;
        }

        /* ── Run button ── */
        .sv3-run-review {
          margin-top: 18px;
          padding: 0;
          border: 1px solid rgba(125,148,186,.22);
          border-radius: 16px;
          background: rgba(16,23,36,.52);
          overflow: hidden;
        }
        .sv3-review-grid {
          display: grid;
          grid-template-columns: 1fr 1.25fr .9fr;
          gap: 0;
          margin-bottom: 0;
        }
        .sv3-review-metric {
          min-width: 0;
          display: grid;
          grid-template-columns: 52px 1fr;
          align-items: center;
          column-gap: 14px;
          background: transparent;
          border: 0;
          border-radius: 0;
          padding: 22px 24px;
        }
        .sv3-review-metric + .sv3-review-metric {
          border-left: 1px solid rgba(125,148,186,.16);
        }
        .sv3-review-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #9ca8bd;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: .06em;
          font-weight: 800;
        }
        .sv3-review-value {
          font-size: 17px;
          font-weight: 800;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sv3-review-value .sv3-mini-avatars { margin-top: 8px; }
        .sv3-review-icon {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }
        .sv3-review-icon.users { color:#c78bff; background:rgba(124,58,237,.22); border:1px solid rgba(167,139,250,.28); }
        .sv3-review-icon.date { color:#56f1d0; background:rgba(20,184,166,.16); border:1px solid rgba(45,212,191,.25); }
        .sv3-review-icon.days { color:#ffd166; background:rgba(245,158,11,.18); border:1px solid rgba(245,158,11,.28); }
        .sv3-launch-row {
          display: grid;
          grid-template-columns: 300px 1fr;
          align-items: stretch;
          gap: 14px;
          margin-top: 18px;
        }
        .sv3-back-ghost {
          width: 100%;
          min-width: 0;
          min-height: 56px;
          padding: 0 14px;
          background: rgba(16,23,36,.64);
          color: #d8deea;
          box-shadow: none;
          border: 1px solid rgba(125,148,186,.24);
        }
        .sv3-continue-row {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 34px;
          padding: 18px;
          border-top: 0;
          border-radius: 22px;
          background: rgba(10,16,27,.28);
        }
        .sv3-continue-btn {
          width: 100%;
          min-width: 168px;
          min-height: 82px;
          padding: 0 22px;
          border-radius: 10px;
          background: linear-gradient(90deg,#7c3aed,#4f8ef7);
          font-size: 22px;
        }
        .sv3-run-primary {
          flex: 1;
          min-height: 56px;
          background: linear-gradient(90deg,#7c3aed,#4f8ef7);
        }
        .sv3-dashboard-primary {
          width: 100%;
          margin-top: 14px;
          min-height: 56px;
          background: rgba(16,23,36,.46);
          border: 1px solid rgba(125,148,186,.22);
          color: #f3f6ff;
          font-size: 16px;
          padding: 0 18px;
          box-shadow: none;
        }
        .sv3-run-hint {
          min-height: 18px;
          margin-top: 18px;
          text-align: center;
          font-size: 13px;
          color: var(--text2);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        .sv3-run-hint.warn { color: var(--warning); }
        .sv3-date-ready {
          background: rgba(0,214,143,.08);
          border: 1px solid rgba(0,214,143,.22);
          border-radius: 10px;
          padding: 12px;
          text-align: center;
          font-size: 12px;
          color: #45e6b3;
          font-weight: 700;
          max-width: 720px;
          margin: 0 auto;
        }
        .sv3-date-single {
          max-width: 340px;
          margin: 0 auto;
        }
        .sv3-date-range-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          max-width: none;
          margin: 0 auto;
        }
        .sv3-date-field-label {
          font-size: 12px;
          font-weight: 800;
          color: var(--text2);
          text-transform: uppercase;
          letter-spacing: .06em;
          margin: 0 0 10px 26px;
        }

        .sv3-run-btn {
          width: 100%;
          padding: 15px;
          background: linear-gradient(90deg, #7c6af7 0%, #4f8ef7 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: opacity .18s, transform .15s;
          box-shadow: 0 4px 20px rgba(124,106,247,.3);
          letter-spacing: .01em;
        }
        .sv3-run-btn:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); }
        .sv3-run-btn:active:not(:disabled) { transform: none; }
        .sv3-run-btn:disabled { opacity: .35; cursor: not-allowed; transform: none; }

        /* Compact premium pass: balanced SaaS density over oversized showcase UI */
        .sv3-main {
          padding: 22px 30px;
        }
        .sv3-run-stage {
          max-width: 980px;
        }
        .sv3-run-hero {
          gap: 28px;
          margin-bottom: 18px;
        }
        .sv3-run-icon {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          font-size: 20px;
          box-shadow: 0 12px 30px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.08);
        }
        .sv3-run-title-lockup {
          gap: 14px;
        }
        .sv3-run-title-lockup .sv3-page-title {
          font-size: 26px;
          margin-bottom: 5px;
        }
        .sv3-run-title-lockup .sv3-page-sub {
          font-size: 13px;
        }
        .sv3-flow-stepper {
          width: min(410px, 100%);
        }
        .sv3-flow-stepper::before {
          top: 23px;
          left: 45px;
          right: 62px;
        }
        .sv3-flow-node {
          min-height: 52px;
          gap: 9px;
        }
        .sv3-flow-node-num {
          width: 40px;
          height: 40px;
          font-size: 14px;
        }
        .sv3-flow-node.active .sv3-flow-node-num {
          box-shadow: 0 0 0 5px rgba(124,106,247,.12), 0 10px 24px rgba(97,70,215,.22);
        }
        .sv3-flow-node.active .sv3-flow-node-num::after {
          inset: -6px;
          opacity: .72;
        }
        .sv3-flow-node-title {
          font-size: 13px;
        }
        .sv3-flow-node-sub {
          font-size: 11px;
        }
        .sv3-users-panel,
        .sv3-date-panel {
          border-radius: 20px;
          padding: 22px 28px 24px;
          box-shadow: 0 18px 52px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.035);
        }
        .sv3-users-panel .sv3-step-badge,
        .sv3-date-panel .sv3-step-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          font-size: 18px;
          box-shadow: 0 10px 24px rgba(80,55,180,.2), inset 0 1px 0 rgba(255,255,255,.08);
        }
        .sv3-users-panel .sv3-section-title-lg,
        .sv3-date-panel .sv3-section-title-lg {
          font-size: 21px;
          margin-bottom: 5px;
        }
        .sv3-users-panel .sv3-section-copy,
        .sv3-date-panel .sv3-section-copy {
          font-size: 13px;
        }
        .sv3-users-panel .sv3-settings-dock {
          margin-top: 22px;
        }
        .sv3-settings-dock {
          gap: 14px;
        }
        .sv3-setting-card {
          min-height: 104px;
          padding: 18px 20px;
          border-radius: 16px;
        }
        .sv3-setting-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          font-size: 19px;
        }
        .sv3-setting-copy {
          gap: 14px;
        }
        .sv3-users-panel .sv3-setting-title {
          font-size: 16px;
          margin-bottom: 5px;
        }
        .sv3-users-panel .sv3-setting-desc {
          font-size: 12px;
          line-height: 1.45;
          max-width: 250px;
        }
        .sv3-users-panel .sv3-toggle-btn {
          width: 52px;
          height: 28px;
        }
        .sv3-users-panel .sv3-toggle-btn span {
          width: 22px;
          height: 22px;
        }
        .sv3-users-panel .sv3-toggle-label {
          font-size: 11px;
          min-width: 30px;
        }
        .sv3-run-accounts {
          gap: 12px;
          margin-top: 22px;
        }
        .sv3-run-accounts .sv3-acc-card {
          width: clamp(180px, calc((100% - 24px) / 3), 246px);
          min-height: 218px;
          padding: 22px 20px 20px;
          border-radius: 16px;
          gap: 8px;
        }
        .sv3-run-accounts .sv3-check {
          top: 14px;
          right: 14px;
          width: 28px;
          height: 28px;
        }
        .sv3-run-accounts .sv3-lock-badge {
          top: 14px;
          left: 14px;
          padding: 5px 10px;
          font-size: 11px;
        }
        .sv3-run-accounts .sv3-avatar {
          width: 68px;
          height: 68px;
          font-size: 30px;
          margin-top: 12px;
        }
        .sv3-run-accounts .sv3-avatar.lk {
          width: 70px;
          height: 70px;
          font-size: 24px;
        }
        .sv3-run-accounts .sv3-acc-name {
          font-size: 17px;
          margin-top: 5px;
        }
        .sv3-run-accounts .sv3-acc-email {
          font-size: 12px;
        }
        .sv3-run-accounts .sv3-status-pill {
          margin-top: 6px;
          padding: 7px 18px;
          font-size: 11px;
        }
        .sv3-continue-row {
          margin-top: 22px;
          padding: 12px;
          border-radius: 16px;
        }
        .sv3-continue-btn {
          min-height: 52px;
          font-size: 17px;
          border-radius: 11px;
        }
        .sv3-date-modes {
          gap: 10px;
          margin: 18px auto 16px;
        }
        .sv3-date-mode-btn {
          min-height: 42px;
          font-size: 13px;
          border-radius: 9px;
        }
        .sv3-date-range-grid {
          gap: 14px;
          max-width: 780px;
        }
        .sv3-date-field-label {
          margin: 0 0 8px 12px;
          font-size: 10px;
        }
        .sv3-run-review {
          margin-top: 16px;
          border-radius: 14px;
        }
        .sv3-review-metric {
          grid-template-columns: 40px 1fr;
          column-gap: 12px;
          padding: 14px 18px;
        }
        .sv3-review-icon {
          width: 38px;
          height: 38px;
          font-size: 15px;
        }
        .sv3-review-label {
          font-size: 10px;
          margin-bottom: 4px;
        }
        .sv3-review-value {
          font-size: 14px;
        }
        .sv3-mini-av {
          width: 22px;
          height: 22px;
        }
        .sv3-launch-row {
          grid-template-columns: 220px 1fr;
          gap: 12px;
          margin-top: 14px;
        }
        .sv3-back-ghost,
        .sv3-run-primary,
        .sv3-dashboard-primary {
          min-height: 46px;
          border-radius: 11px;
          font-size: 14px;
        }
        .sv3-dashboard-primary {
          margin-top: 10px;
          min-height: 44px;
          font-size: 14px;
        }
        .sv3-run-hint {
          margin-top: 12px;
          font-size: 11px;
        }

        /* SaaS density refinement: keep polish, remove oversized showcase proportions */
        .sv3-main {
          padding: 20px 28px;
        }
        .sv3-run-stage {
          max-width: 920px;
        }
        .sv3-run-hero {
          margin-bottom: 14px;
        }
        .sv3-run-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          font-size: 18px;
          box-shadow: 0 8px 22px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .sv3-run-title-lockup .sv3-page-title {
          font-size: 24px;
        }
        .sv3-run-title-lockup .sv3-page-sub {
          font-size: 12px;
        }
        .sv3-flow-stepper {
          width: min(380px, 100%);
        }
        .sv3-flow-node {
          min-height: 46px;
        }
        .sv3-flow-node-num {
          width: 34px;
          height: 34px;
          font-size: 13px;
        }
        .sv3-flow-node.active .sv3-flow-node-num {
          box-shadow: 0 0 0 4px rgba(124,106,247,.1), 0 8px 18px rgba(97,70,215,.16);
        }
        .sv3-flow-stepper::before {
          top: 20px;
          left: 40px;
          right: 58px;
        }
        .sv3-flow-node-title {
          font-size: 12px;
        }
        .sv3-flow-node-sub {
          font-size: 10px;
        }
        .sv3-users-panel,
        .sv3-date-panel {
          border-radius: 16px;
          padding: 18px 22px 20px;
          border-color: rgba(125,148,186,.22);
          box-shadow: 0 12px 36px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.03);
        }
        .sv3-users-panel .sv3-step-badge,
        .sv3-date-panel .sv3-step-badge {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          font-size: 16px;
          box-shadow: 0 7px 18px rgba(80,55,180,.16), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .sv3-users-panel .sv3-section-title-lg,
        .sv3-date-panel .sv3-section-title-lg {
          font-size: 19px;
          margin-bottom: 4px;
        }
        .sv3-users-panel .sv3-section-copy,
        .sv3-date-panel .sv3-section-copy {
          font-size: 12px;
        }
        .sv3-users-panel .sv3-settings-dock {
          margin-top: 18px;
        }
        .sv3-settings-dock {
          gap: 10px;
        }
        .sv3-setting-card {
          min-height: 84px;
          padding: 14px 16px;
          border-radius: 12px;
          background: rgba(24,33,50,.58);
          border-color: rgba(125,148,186,.18);
        }
        .sv3-setting-icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          font-size: 16px;
        }
        .sv3-setting-copy {
          gap: 11px;
        }
        .sv3-users-panel .sv3-setting-title {
          font-size: 14px;
          margin-bottom: 3px;
        }
        .sv3-users-panel .sv3-setting-desc {
          font-size: 11px;
          line-height: 1.35;
          max-width: 230px;
        }
        .sv3-users-panel .sv3-toggle-btn {
          width: 46px;
          height: 24px;
        }
        .sv3-users-panel .sv3-toggle-btn span {
          width: 18px;
          height: 18px;
        }
        .sv3-users-panel .sv3-toggle-label {
          font-size: 10px;
          min-width: 26px;
        }
        .sv3-run-accounts {
          gap: 10px;
          margin-top: 18px;
        }
        .sv3-run-accounts .sv3-acc-card {
          width: clamp(160px, calc((100% - 20px) / 3), 216px);
          min-height: 176px;
          padding: 18px 16px 16px;
          border-radius: 13px;
          gap: 6px;
          background: rgba(24,33,50,.56);
          border-color: rgba(125,148,186,.2);
        }
        .sv3-run-accounts .sv3-check {
          top: 10px;
          right: 10px;
          width: 24px;
          height: 24px;
        }
        .sv3-run-accounts .sv3-lock-badge {
          top: 10px;
          left: 10px;
          padding: 4px 8px;
          font-size: 10px;
        }
        .sv3-run-accounts .sv3-avatar {
          width: 54px;
          height: 54px;
          font-size: 24px;
          margin-top: 8px;
          box-shadow: 0 10px 22px rgba(0,0,0,.16);
        }
        .sv3-run-accounts .sv3-avatar.lk {
          width: 56px;
          height: 56px;
          font-size: 19px;
        }
        .sv3-run-accounts .sv3-acc-name {
          font-size: 14px;
          margin-top: 3px;
        }
        .sv3-run-accounts .sv3-acc-email {
          font-size: 10px;
        }
        .sv3-run-accounts .sv3-status-pill {
          margin-top: 5px;
          padding: 5px 13px;
          font-size: 9px;
        }
        .sv3-continue-row {
          margin-top: 16px;
          padding: 10px;
          border-radius: 13px;
        }
        .sv3-continue-btn {
          min-height: 42px;
          font-size: 15px;
          border-radius: 9px;
        }
        .sv3-date-modes {
          gap: 8px;
          margin: 14px auto 12px;
        }
        .sv3-date-mode-btn {
          min-height: 36px;
          font-size: 12px;
          border-radius: 8px;
        }
        .sv3-date-range-grid {
          gap: 10px;
          max-width: 700px;
        }
        .sv3-date-field-label {
          margin: 0 0 6px 8px;
          font-size: 9px;
        }
        .sv3-run-review {
          margin-top: 12px;
          border-radius: 12px;
        }
        .sv3-review-metric {
          grid-template-columns: 32px 1fr;
          column-gap: 10px;
          padding: 10px 14px;
        }
        .sv3-review-icon {
          width: 30px;
          height: 30px;
          font-size: 13px;
        }
        .sv3-review-label {
          font-size: 9px;
          margin-bottom: 2px;
        }
        .sv3-review-value {
          font-size: 12px;
        }
        .sv3-mini-av {
          width: 18px;
          height: 18px;
          font-size: 8px;
        }
        .sv3-launch-row {
          grid-template-columns: 180px 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        .sv3-back-ghost,
        .sv3-run-primary,
        .sv3-dashboard-primary {
          min-height: 38px;
          border-radius: 9px;
          font-size: 13px;
        }
        .sv3-dashboard-primary {
          margin-top: 8px;
          min-height: 38px;
          font-size: 13px;
        }
        .sv3-run-hint {
          margin-top: 8px;
          font-size: 10px;
        }

        /* Production SaaS layout pass: compact, scalable, desktop-first */
        .sv3-main {
          padding: 18px 26px;
        }
        .sv3-run-stage {
          max-width: 980px;
        }
        .sv3-run-hero {
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .sv3-run-title-lockup {
          gap: 12px;
        }
        .sv3-run-icon {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          font-size: 16px;
          background: rgba(124,106,247,.22);
          border-color: rgba(124,106,247,.24);
          box-shadow: none;
        }
        .sv3-run-title-lockup .sv3-page-title {
          font-size: 22px;
          margin-bottom: 3px;
          letter-spacing: -.2px;
        }
        .sv3-run-title-lockup .sv3-page-sub {
          font-size: 12px;
          color: #9aa7bc;
        }
        .sv3-flow-stepper {
          width: min(360px, 100%);
        }
        .sv3-flow-node {
          min-height: 42px;
          gap: 8px;
          padding: 2px 8px;
        }
        .sv3-flow-node-num {
          width: 30px;
          height: 30px;
          font-size: 12px;
        }
        .sv3-flow-stepper::before {
          top: 17px;
          left: 36px;
          right: 54px;
          opacity: .75;
        }
        .sv3-flow-node-title {
          font-size: 12px;
        }
        .sv3-flow-node-sub {
          font-size: 10px;
        }
        .sv3-flow-node.active .sv3-flow-node-num {
          box-shadow: 0 0 0 3px rgba(124,106,247,.08);
        }
        .sv3-flow-node.active .sv3-flow-node-num::after {
          animation: none;
          opacity: 0;
        }
        .sv3-users-panel,
        .sv3-date-panel {
          border-radius: 14px;
          padding: 16px 18px 18px;
          background: rgba(17,23,36,.82);
          border-color: rgba(125,148,186,.2);
          box-shadow: 0 10px 30px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.025);
        }
        .sv3-users-panel::before,
        .sv3-date-panel::before {
          opacity: .6;
        }
        .sv3-users-panel .sv3-step-badge,
        .sv3-date-panel .sv3-step-badge {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          font-size: 14px;
          background: rgba(124,106,247,.22);
          box-shadow: none;
        }
        .sv3-users-panel .sv3-section-title-lg,
        .sv3-date-panel .sv3-section-title-lg {
          font-size: 18px;
          margin-bottom: 3px;
        }
        .sv3-users-panel .sv3-section-copy,
        .sv3-date-panel .sv3-section-copy {
          font-size: 12px;
          color: #9aa7bc;
        }
        .sv3-users-panel .sv3-settings-dock {
          margin-top: 14px;
        }
        .sv3-settings-dock {
          gap: 10px;
        }
        .sv3-setting-card {
          min-height: 72px;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(24,33,50,.5);
          border-color: rgba(125,148,186,.16);
          box-shadow: none;
        }
        .sv3-setting-card:hover {
          background: rgba(24,33,50,.62);
          border-color: rgba(124,106,247,.25);
        }
        .sv3-setting-copy {
          gap: 10px;
        }
        .sv3-setting-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          font-size: 14px;
          background: rgba(124,106,247,.18);
          box-shadow: none;
        }
        .sv3-users-panel .sv3-setting-title {
          font-size: 13px;
          margin-bottom: 2px;
        }
        .sv3-users-panel .sv3-setting-desc {
          font-size: 10.5px;
          line-height: 1.35;
          max-width: 260px;
        }
        .sv3-users-panel .sv3-toggle-btn {
          width: 42px;
          height: 22px;
          border-radius: 999px;
        }
        .sv3-users-panel .sv3-toggle-btn span {
          width: 16px;
          height: 16px;
        }
        .sv3-users-panel .sv3-toggle-label {
          font-size: 10px;
          min-width: 24px;
        }
        .sv3-run-accounts {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }
        .sv3-run-accounts .sv3-acc-card {
          width: 100%;
          min-height: 124px;
          padding: 12px 12px 10px;
          border-radius: 10px;
          gap: 4px;
          justify-content: center;
          background: rgba(24,33,50,.48);
          border: 1px solid rgba(125,148,186,.16);
          box-shadow: none;
        }
        .sv3-run-accounts .sv3-acc-card:hover:not(.sv3-acc-locked) {
          border-color: rgba(124,106,247,.34);
          background: rgba(24,33,50,.6);
          transform: translateY(-1px);
        }
        .sv3-run-accounts .sv3-acc-card.selected {
          border-color: rgba(124,106,247,.5);
          box-shadow: 0 0 0 1px rgba(124,106,247,.16);
        }
        .sv3-run-accounts .sv3-check {
          top: 8px;
          right: 8px;
          width: 20px;
          height: 20px;
          border-width: 1px;
          background: rgba(17,23,36,.45);
        }
        .sv3-run-accounts .sv3-lock-badge {
          top: 8px;
          left: 8px;
          padding: 3px 7px;
          font-size: 9px;
          border-radius: 999px;
        }
        .sv3-run-accounts .sv3-avatar {
          width: 40px;
          height: 40px;
          font-size: 18px;
          margin-top: 4px;
          box-shadow: none;
        }
        .sv3-run-accounts .sv3-avatar.lk {
          width: 42px;
          height: 42px;
          font-size: 15px;
        }
        .sv3-run-accounts .sv3-acc-name {
          font-size: 12px;
          margin-top: 2px;
        }
        .sv3-run-accounts .sv3-acc-email {
          font-size: 9.5px;
          color: #9aa7bc;
        }
        .sv3-run-accounts .sv3-status-pill {
          margin-top: 4px;
          padding: 3px 9px;
          font-size: 8.5px;
        }
        .sv3-continue-row {
          margin-top: 14px;
          padding: 8px;
          border-radius: 11px;
          background: rgba(10,16,27,.2);
        }
        .sv3-continue-btn {
          min-height: 36px;
          font-size: 13px;
          border-radius: 8px;
          box-shadow: 0 6px 16px rgba(79,142,247,.14);
        }
        .sv3-date-modes {
          gap: 8px;
          margin: 12px auto 12px;
        }
        .sv3-date-mode-btn {
          min-height: 32px;
          padding: 0 12px;
          border-radius: 7px;
          font-size: 11px;
          background: rgba(24,33,50,.48);
          border-color: rgba(125,148,186,.16);
        }
        .sv3-date-mode-btn.active {
          background: rgba(124,106,247,.18);
          box-shadow: none;
        }
        .sv3-date-range-grid {
          gap: 12px;
          max-width: 760px;
        }
        .sv3-date-field-label {
          margin: 0 0 5px 6px;
          font-size: 9px;
          letter-spacing: .05em;
        }
        .sv3-date-ready {
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 11px;
        }
        .sv3-run-review {
          margin-top: 12px;
          border-radius: 10px;
          background: rgba(16,23,36,.42);
        }
        .sv3-review-grid {
          grid-template-columns: 1fr 1.1fr .8fr;
        }
        .sv3-review-metric {
          grid-template-columns: 28px 1fr;
          column-gap: 9px;
          padding: 9px 12px;
        }
        .sv3-review-icon {
          width: 26px;
          height: 26px;
          font-size: 11px;
        }
        .sv3-review-label {
          font-size: 8.5px;
          margin-bottom: 2px;
        }
        .sv3-review-value {
          font-size: 11px;
        }
        .sv3-mini-avatars {
          margin-top: 4px;
        }
        .sv3-mini-av {
          width: 16px;
          height: 16px;
          font-size: 7px;
          border-width: 1px;
        }
        .sv3-review-metric {
          overflow: visible;
        }
        .sv3-review-value {
          overflow: visible;
          white-space: normal;
        }
        .sv3-review-value .sv3-mini-avatars {
          min-width: max-content;
          padding-inline: 2px 8px;
        }
        [dir="rtl"] .sv3-review-value .sv3-mini-avatars {
          justify-content: flex-start;
          padding-inline: 8px 2px;
        }
        [dir="rtl"] .sv3-mini-av {
          margin-right: 0;
          margin-left: -6px;
        }
        [dir="rtl"] .sv3-mini-av:last-child {
          margin-left: 0;
        }
        .sv3-launch-row {
          grid-template-columns: 150px 1fr;
          gap: 8px;
          margin-top: 10px;
        }
        .sv3-back-ghost,
        .sv3-run-primary,
        .sv3-dashboard-primary {
          min-height: 34px;
          border-radius: 8px;
          font-size: 12px;
          box-shadow: none;
        }
        .sv3-dashboard-primary {
          margin-top: 8px;
          min-height: 34px;
          background: rgba(16,23,36,.38);
        }
        .sv3-run-hint {
          margin-top: 7px;
          font-size: 10px;
        }
        .text-sm text-muted mt-12 { text-align: center; font-size: 11px; color: var(--text2); margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 5px; }

        /* ── Form overlay ── */
        .sv3-form-overlay {
          position: fixed;
          inset: 0;
          background: rgba(8, 10, 16, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: sv3-fade-in .25s ease;
        }
        @keyframes sv3-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .sv3-form-card {
          background: var(--bg2);
          background-image:
            radial-gradient(circle at 100% 0%, rgba(124,106,247,0.10) 0%, transparent 46%),
            linear-gradient(180deg, rgba(255,255,255,0.025), transparent 42%);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 32px;
          width: min(980px, 94vw);
          max-width: 95vw;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 
            0 24px 48px rgba(0, 0, 0, 0.45),
            0 0 0 1px rgba(255, 255, 255, 0.02);
          animation: sv3-slide-up .35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .sv3-member-card {
          width: min(460px, calc(100vw - 32px));
          max-width: 460px;
          padding: 24px;
          border-radius: 14px;
          max-height: min(90vh, 520px);
        }
        .sv3-member-card .form-group input {
          width: 100%;
          min-height: 44px;
          font-size: 13px;
        }
        .sv3-member-card .sv3-member-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 18px;
        }
        .sv3-member-card .sv3-member-actions .btn {
          width: 100%;
          min-height: 42px;
          padding: 0 14px;
          font-size: 12px;
        }
        @keyframes sv3-slide-up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        [data-theme="light"] .sv3-form-card {
          background-image: radial-gradient(circle at 100% 0%, rgba(124,106,247,0.03) 0%, transparent 60%);
          box-shadow: 
            0 24px 48px rgba(0, 0, 0, 0.08),
            0 0 0 1px rgba(0, 0, 0, 0.01);
        }
        .sv3-form-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        .sv3-form-panel {
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 16px;
          padding: 18px;
          background: rgba(8, 12, 22, 0.34);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
        }
        [data-theme="light"] .sv3-form-panel {
          background: rgba(255,255,255,0.58);
          border-color: rgba(0,0,0,0.06);
        }
        .sv3-form-card .form-group input,
        .sv3-form-card .form-group select {
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
          color: var(--text);
          font-size: 14px;
          font-family: inherit;
          transition: all 0.2s ease;
        }
        [data-theme="light"] .sv3-form-card .form-group input,
        [data-theme="light"] .sv3-form-card .form-group select {
          background: rgba(0, 0, 0, 0.02);
        }
        .sv3-form-card .form-group input:focus,
        .sv3-form-card .form-group select:focus {
          border-color: var(--accent);
          background: rgba(0, 0, 0, 0.22);
          box-shadow: 0 0 0 3px rgba(124, 106, 247, 0.15);
        }
        [data-theme="light"] .sv3-form-card .form-group input:focus,
        [data-theme="light"] .sv3-form-card .form-group select:focus {
          background: #fff;
          box-shadow: 0 0 0 3px rgba(124, 106, 247, 0.1);
        }
        .sv3-form-card .form-group label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text2);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
        }
        .sv3-form-card .form-section-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin-top: 0;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        [data-theme="light"] .sv3-form-card .form-section-title {
          border-bottom-color: rgba(0,0,0,0.06);
        }
        .sv3-tab-control {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          min-height: 46px;
          padding: 5px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: rgba(0,0,0,0.15);
        }
        .sv3-tab-btn,
        .sv3-country-btn {
          border: 1px solid transparent;
          cursor: pointer;
          color: var(--text2);
          font-family: inherit;
          transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
        }
        .sv3-tab-btn {
          min-width: 0;
          border-radius: 9px;
          background: transparent;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sv3-tab-btn.is-active,
        .sv3-country-btn.is-active {
          color: #fff;
          border-color: rgba(124,106,247,0.48);
          background: linear-gradient(135deg, rgba(79,142,247,.86), rgba(124,106,247,.90));
          box-shadow: 0 10px 24px rgba(79,142,247,0.18);
        }
        .sv3-tab-btn:not(.is-active):hover,
        .sv3-country-btn:not(.is-active):hover {
          color: var(--text);
          border-color: rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.045);
        }
        .sv3-country-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .sv3-country-btn {
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 44px;
          border-radius: 12px;
          background: rgba(0,0,0,0.12);
          padding: 8px 10px;
          text-align: left;
        }
        .sv3-country-code {
          width: auto;
          min-width: 58px;
          height: 26px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 0 0 auto;
          background: rgba(255,255,255,0.07);
          color: inherit;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .04em;
          padding: 0 7px;
        }
        .sv3-country-code .taager-country-flag {
          width: 18px;
          height: 12px;
          --CountryFlagIcon-height: 12px;
        }
        .sv3-country-name {
          min-width: 0;
          font-size: 12px;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sv3-field-hint {
          font-size: 11px;
          color: var(--text2);
          margin-top: 7px;
          line-height: 1.45;
        }
        .sv3-form-card #sv3-form-cancel {
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 13px;
          height: 44px;
          color: var(--text2);
          transition: all 0.2s ease;
        }
        .sv3-form-card #sv3-form-cancel:hover {
          background: rgba(255,255,255,0.06);
          color: var(--text);
          border-color: var(--text3);
        }
        [data-theme="light"] .sv3-form-card #sv3-form-cancel {
          background: rgba(0,0,0,0.02);
        }
        [data-theme="light"] .sv3-form-card #sv3-form-cancel:hover {
          background: rgba(0,0,0,0.05);
        }
        .sv3-form-card #sv3-form-save {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
          border: none;
          border-radius: 10px;
          font-size: 13px;
          height: 44px;
          color: #fff;
          font-weight: 700;
          box-shadow: 0 4px 16px rgba(124, 106, 247, 0.25);
          transition: all 0.2s ease;
        }
        .sv3-form-card #sv3-form-save:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(124, 106, 247, 0.35);
          opacity: 0.95;
        }

        @media (max-width: 920px) {
          .sv3-form-card {
            width: min(560px, 94vw);
          }
          .sv3-form-grid {
            grid-template-columns: 1fr;
          }
          .sv3-run-hero,
          .sv3-section-top {
            flex-direction: column;
          }
          .sv3-settings-dock {
            width: 100%;
            min-width: 0;
          }
          .sv3-review-grid {
            grid-template-columns: 1fr;
          }
          .sv3-date-range-grid {
            grid-template-columns: 1fr;
            max-width: 360px;
          }
        }
        @media (max-width: 620px) {
          .sv3-settings-dock,
          .sv3-flow-stepper {
            grid-template-columns: 1fr;
          }
          .sv3-member-card {
            padding: 20px;
          }
          .sv3-member-card .sv3-member-actions {
            grid-template-columns: 1fr;
          }
          .sv3-launch-row {
            grid-template-columns: 1fr;
          }
          .sv3-back-ghost {
            min-height: 44px;
          }
        }
        /* Light mode overrides */
        [data-theme="light"] .sv3-run-title-lockup .sv3-page-sub,
        [data-theme="light"] .sv3-users-panel .sv3-section-copy,
        [data-theme="light"] .sv3-date-panel .sv3-section-copy,
        [data-theme="light"] .sv3-run-accounts .sv3-acc-email {
          color: var(--text2);
        }
        [data-theme="light"] .sv3-users-panel,
        [data-theme="light"] .sv3-date-panel {
          background: var(--bg2);
          border-color: var(--border);
          box-shadow: 0 4px 12px rgba(0,0,0,.05);
        }
        [data-theme="light"] .sv3-setting-card {
          background: var(--bg);
          border-color: var(--border);
        }
        [data-theme="light"] .sv3-setting-card:hover {
          background: var(--bg3);
          border-color: var(--accent);
        }
        [data-theme="light"] .sv3-run-accounts .sv3-acc-card {
          background: var(--bg);
          border-color: var(--border);
        }
        [data-theme="light"] .sv3-run-accounts .sv3-acc-card:hover:not(.sv3-acc-locked) {
          background: var(--bg3);
          border-color: var(--accent);
        }
        [data-theme="light"] .sv3-run-accounts .sv3-acc-card.selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent);
        }
        [data-theme="light"] .sv3-run-accounts .sv3-check {
          background: var(--bg2);
          border-color: var(--border);
        }
        [data-theme="light"] .sv3-run-accounts .sv3-run-index-avatar {
          background: linear-gradient(135deg, #7c6af7, #4f8ef7);
          border-color: rgba(124,106,247,.35);
          color: #fff;
          box-shadow: 0 4px 12px rgba(124,106,247,.25);
        }
        [data-theme="light"] .sv3-run-accounts .sv3-acc-card.selected .sv3-run-index-avatar {
          background: linear-gradient(135deg, #6847d8, #3a72e8);
          border-color: rgba(104,71,216,.5);
          box-shadow: 0 0 0 3px rgba(124,106,247,.18), 0 6px 16px rgba(79,142,247,.3);
        }
        [data-theme="light"] .sv3-continue-row {
          background: var(--bg);
        }
        [data-theme="light"] .sv3-date-mode-btn {
          background: var(--bg);
          border-color: var(--border);
          color: var(--text);
        }
        [data-theme="light"] .sv3-date-mode-btn.active {
          background: rgba(124,106,247,.12);
          border-color: var(--accent);
        }
        [data-theme="light"] .sv3-run-review {
          background: var(--bg);
          border-color: var(--border);
        }
        [data-theme="light"] .sv3-dashboard-primary {
          background: var(--bg3);
          color: var(--text);
          border: 1px solid var(--border);
        }

        /* Focused run wizard: compact width, top-aligned, and scalable to 10 accounts */
        .sv3-main {
          align-items: center;
        }
        .sv3-run-stage {
          max-width: 820px;
          margin: 58px auto 0;
        }
        .sv3-run-hero {
          align-items: center;
          gap: 20px;
          margin-bottom: 12px;
        }
        .sv3-flow-stepper {
          width: min(330px, 100%);
        }
        .sv3-users-panel,
        .sv3-date-panel {
          border-radius: 12px;
          padding: 16px 18px 18px;
        }
        .sv3-users-panel .sv3-section-top {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 14px;
          margin-bottom: 0;
        }
        .sv3-users-panel .sv3-step-heading {
          align-items: center;
        }
        .sv3-users-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid rgba(125,148,186,.14);
        }
        .sv3-users-count {
          font-size: 11px;
          font-weight: 800;
          color: var(--text2);
          text-transform: uppercase;
          letter-spacing: .06em;
        }
        .sv3-users-count strong {
          color: var(--text);
        }
        .sv3-users-panel .sv3-settings-dock {
          width: 100%;
          min-width: 0;
          margin: 14px 0 16px;
          padding: 12px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          border-radius: 12px;
          background: rgba(10,16,27,.22);
          border: 1px solid rgba(125,148,186,.12);
        }
        .sv3-setting-card {
          min-height: 92px;
          padding: 12px 14px;
          border-radius: 8px;
        }
        .sv3-setting-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          font-size: 13px;
        }
        .sv3-users-panel .sv3-setting-title {
          font-size: 12px;
        }
        .sv3-users-panel .sv3-setting-desc {
          font-size: 10px;
          line-height: 1.45;
          max-width: none;
        }
        .sv3-run-accounts {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          overflow: visible;
          margin-top: 10px;
          padding: 2px;
        }
        .sv3-run-accounts .sv3-acc-card {
          width: 100%;
          min-height: 66px;
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) auto;
          grid-template-rows: auto auto;
          align-items: center;
          column-gap: 12px;
          row-gap: 2px;
          justify-content: stretch;
          text-align: start;
          padding: 10px 46px 10px 12px;
          border-radius: 8px;
        }
        [dir="rtl"] .sv3-run-accounts .sv3-acc-card {
          padding: 10px 12px 10px 46px;
        }
        .sv3-run-accounts .sv3-check {
          top: 50%;
          right: 12px;
          transform: translateY(-50%);
          width: 22px;
          height: 22px;
        }
        [dir="rtl"] .sv3-run-accounts .sv3-check {
          right: auto;
          left: 12px;
        }
        .sv3-run-accounts .sv3-avatar,
        .sv3-run-accounts .sv3-avatar.lk {
          grid-column: 1;
          grid-row: 1 / 3;
          width: 34px;
          height: 34px;
          margin-top: 0 !important;
          font-size: 15px;
        }
        .sv3-run-accounts .sv3-run-index-avatar {
          background:
            radial-gradient(circle at 32% 24%, rgba(255,255,255,.16), transparent 34%),
            linear-gradient(135deg, rgba(124,106,247,.22), rgba(79,142,247,.1));
          border: 1px solid rgba(125,148,186,.28);
          color: #d9e2f4;
          font-size: 13px;
          font-weight: 900;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 8px 18px rgba(0,0,0,.16);
        }
        .sv3-run-accounts .sv3-acc-card.selected .sv3-run-index-avatar {
          background: linear-gradient(135deg,#8b5cf6,#4f8ef7);
          border-color: rgba(167,139,250,.62);
          color: #fff;
          box-shadow: 0 0 0 3px rgba(124,106,247,.14), 0 10px 22px rgba(79,142,247,.2);
        }
        .sv3-run-accounts .sv3-acc-name {
          grid-column: 2;
          grid-row: 1;
          max-width: 100%;
          margin: 0;
          font-size: 12px;
          line-height: 1.25;
        }
        .sv3-run-accounts .sv3-acc-email {
          grid-column: 2;
          grid-row: 2;
          max-width: 100%;
          font-size: 10px;
        }
        .sv3-run-accounts .sv3-status-pill {
          grid-column: 3;
          grid-row: 1 / 3;
          margin-top: 0;
          padding: 4px 9px;
          font-size: 8.5px;
          white-space: nowrap;
        }
        .sv3-run-acc-lock {
          grid-column: 3;
          grid-row: 1 / 3;
          justify-self: end;
          border-radius: 999px;
          padding: 4px 8px;
          background: rgba(255,201,77,.12);
          border: 1px solid rgba(255,201,77,.34);
          color: #ffc94d;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .04em;
          white-space: nowrap;
        }
        .sv3-run-accounts .sv3-run-acc-card > div[style*="position:absolute"] {
          position: static !important;
          grid-column: 3;
          grid-row: 1 / 3;
          justify-self: end;
          border-radius: 999px !important;
          padding: 4px 8px !important;
          background: rgba(255,201,77,.12) !important;
          border: 1px solid rgba(255,201,77,.34) !important;
          color: #ffc94d !important;
          font-size: 9px !important;
          font-weight: 800 !important;
          letter-spacing: .04em !important;
          white-space: nowrap;
        }
        .sv3-continue-row {
          margin-top: 12px;
          padding: 8px;
          border-radius: 10px;
        }
        .sv3-continue-btn {
          min-height: 42px;
          font-size: 13px;
        }
        .sv3-flow-node {
          isolation: isolate;
        }
        .sv3-flow-node.done .sv3-flow-node-num {
          box-shadow: 0 0 0 4px rgba(0,214,143,.1), 0 0 20px rgba(0,214,143,.18);
        }
        .sv3-flow-node.active .sv3-flow-node-num {
          position: relative;
          box-shadow: 0 0 0 5px rgba(124,106,247,.14), 0 0 24px rgba(124,106,247,.32);
        }
        .sv3-flow-node.active .sv3-flow-node-num::before,
        .sv3-flow-node.active .sv3-flow-node-num::after,
        .sv3-date-panel .sv3-step-badge.green::before {
          content: "";
          position: absolute;
          inset: -8px;
          border-radius: 999px;
          border: 1px solid rgba(167,139,250,.55);
          pointer-events: none;
          animation: sv3-step-pulse-ring 1.7s ease-out infinite;
          opacity: 1;
        }
        .sv3-flow-node.active .sv3-flow-node-num::after {
          inset: -14px;
          animation-delay: .45s;
          border-color: rgba(79,142,247,.36);
        }
        .sv3-date-panel .sv3-step-badge.green {
          position: relative;
          box-shadow: 0 0 0 5px rgba(0,214,143,.1), 0 0 22px rgba(0,214,143,.2);
        }
        .sv3-date-panel .sv3-step-badge.green::before {
          inset: -9px;
          border-color: rgba(0,214,143,.42);
          animation-duration: 1.9s;
        }
        @keyframes sv3-step-pulse-ring {
          0% {
            opacity: .78;
            transform: scale(.72);
          }
          70% {
            opacity: .12;
            transform: scale(1.45);
          }
          100% {
            opacity: 0;
            transform: scale(1.62);
          }
        }
        .sv3-run-review {
          padding-bottom: 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
        }
        .sv3-launch-row {
          grid-template-columns: 138px minmax(220px, 360px);
          justify-content: start;
          gap: 10px;
          margin: 12px 12px 0;
          padding: 12px;
          border-radius: 12px;
          background: rgba(10,16,27,.24);
          border: 1px solid rgba(125,148,186,.12);
        }
        [dir="rtl"] .sv3-launch-row {
          justify-content: start;
        }
        .sv3-back-ghost,
        .sv3-run-primary {
          min-height: 42px;
          padding: 0 18px;
          border-radius: 9px;
          font-size: 12px;
        }
        .sv3-run-primary {
          box-shadow: 0 10px 24px rgba(79,142,247,.18);
        }
        .sv3-dashboard-primary {
          width: auto;
          min-width: 220px;
          max-width: 280px;
          margin: 12px auto 0;
          min-height: 38px;
          padding: 0 18px;
          background: transparent;
          border-color: transparent;
          color: var(--text);
        }
        .sv3-dashboard-primary:hover:not(:disabled) {
          background: rgba(79,142,247,.08);
          border-color: rgba(79,142,247,.22);
        }
        .sv3-run-hint {
          padding: 0 16px;
        }
        @media (max-width: 980px) {
          .sv3-run-stage {
            max-width: 100%;
            margin-top: 18px;
          }
        }
        @media (max-width: 760px) {
          .sv3-run-hero,
          .sv3-users-panel .sv3-section-top {
            flex-direction: column;
            align-items: stretch;
          }
          .sv3-run-accounts {
            grid-template-columns: 1fr;
          }
          .sv3-users-panel .sv3-settings-dock {
            grid-template-columns: 1fr;
          }
          .sv3-launch-row {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="sv3-shell">
        <!-- Sidebar -->
        <div class="sv3-sidebar">
          <div class="sv3-sb-logo">
            <div class="sv3-sb-logo-icon">⚡</div>
            <div>
              <div class="sv3-sb-logo-text">Taager Bot</div>
              <div class="sv3-sb-logo-sub">${t("setup.sub_title")}</div>
            </div>
          </div>

          <div class="sv3-nav-item active" id="nav-accounts" data-step="accounts">
            <div class="sv3-step-num" style="font-size:14px">👤</div>
            <span class="sv3-nav-label">${t("setup.nav_accounts")}</span>
          </div>
          ${window._teamLeaderEnabled ? "" : `<div class="sv3-nav-item" id="nav-run" data-step="run">
            <div class="sv3-step-num" style="font-size:14px">🚀</div>
            <span class="sv3-nav-label">${t("setup.nav_run")}</span>
          </div>`}
          ${window._teamLeaderEnabled ? "" : `<div class="sv3-nav-item sv3-nav-page${window._analyticsEnabled === false ? " sv3-nav-preview" : ""}" id="nav-analytics" data-page="analytics">
            <div class="sv3-step-num" style="background:linear-gradient(135deg,#7c6bff,#4fa8e8)">📊</div>
            <span class="sv3-nav-label">${t("setup.nav_analytics")}</span>
            ${window._analyticsEnabled === false ? '<span class="sv3-nav-preview-badge">Preview</span>' : ""}
          </div>
          <div class="sv3-nav-item sv3-nav-page${window._operationsEnabled === false ? " sv3-nav-preview" : ""}" id="nav-operations" data-page="operations">
            <div class="sv3-step-num" style="background:linear-gradient(135deg,#00d4aa,#4fa8e8)">⚙️</div>
            <span class="sv3-nav-label">${t("setup.nav_operations")}</span>
            ${window._operationsEnabled === false ? '<span class="sv3-nav-preview-badge">Preview</span>' : ""}
          </div>`}
          <div class="sv3-nav-item sv3-nav-page${window._dashboardEnabled === false ? " sv3-nav-preview" : ""}" id="nav-dashboard" data-page="dashboard">
            <div class="sv3-step-num" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">📈</div>
            <span class="sv3-nav-label">${t("setup.nav_dashboard") || "Dashboard"}</span>
            ${window._dashboardEnabled === false ? '<span class="sv3-nav-preview-badge">Preview</span>' : ""}
          </div>

          <div class="sv3-sidebar-footer">
            <button class="sv3-report-btn" onclick="if (window.TaagerSupport && typeof window.TaagerSupport.open === 'function') window.TaagerSupport.open()" style="display:flex;align-items:center;justify-content:center;gap:6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span>${t("setup.report_issue_btn")}</span>
            </button>
            <button class="sv3-update-btn" id="sv3-update-btn" onclick="checkForUpdatesManual()" style="display:flex;align-items:center;justify-content:center;gap:6px">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>
              <span id="sv3-update-btn-label">${t("setup.check_updates_btn")}</span>
            </button>
            <div id="sv3-app-version-label" style="font-size:11px;color:var(--text2);margin-top:4px;text-align:center;width:100%">
              ${(() => {
                const v = window._appVersion || "";
                if (!v) return "";
                const textFn = t("setup.app_version");
                return typeof textFn === 'function' ? textFn(v) : `App version is v${v}`;
              })()}
            </div>
          </div>
        </div>

        <!-- Main content area -->
        <div class="sv3-main" id="sv3-main-content">
          <!-- content injected per step -->
        </div>
      </div>
    `;

    // Sidebar nav
    el.querySelectorAll(".sv3-nav-item").forEach(item => {
      item.addEventListener("click", () => {
        // Page-level nav (Analytics / Operations)
        if (item.dataset.page === "analytics")  { goToAnalytics();  return; }
        if (item.dataset.page === "operations") { goToOperations(); return; }
        if (item.dataset.page === "dashboard")  { goToDashboard();  return; }
        const targetStep = item.dataset.step;
        if (targetStep === "run" && !accounts.some(acc => acc.accountType !== "static")) { goToDashboard(); return; }
        // Only allow going to date/review if accounts exist
        if (targetStep !== "accounts" && accounts.length === 0) return;
        step = targetStep;
        if (step === "run") runFlowStep = "users";
        window._setupCurrentStep = step;
        renderStep();
        updateNav();
      });
    });

    renderStep();
    updateNav();
    if (typeof _mountCollapseHandle === 'function') {
      _mountCollapseHandle(el.querySelector('.sv3-shell'));
    }
  }

  function updateNav() {
    const steps = ["accounts", "run"];
    steps.forEach((s, i) => {
      const item = document.getElementById(`nav-${s}`);
      if (!item) return;
      item.classList.remove("active", "done");
      const currentIdx = steps.indexOf(step);
      if (s === step) item.classList.add("active");
      else if (i < currentIdx) item.classList.add("done");
    });
    // Mark done steps with checkmark
    el.querySelectorAll(".sv3-nav-item.done .sv3-step-num").forEach(n => {
      n.textContent = "✓";
    });
    // Restore icons for non-done steps
    [["accounts","👤"],["run","🚀"]].forEach(([s, icon]) => {
      const item = document.getElementById(`nav-${s}`);
      if (item && !item.classList.contains("done")) {
        item.querySelector(".sv3-step-num").textContent = icon;
      }
    });
  }

  function renderStep() {
    const content = document.getElementById("sv3-main-content");
    if (!content) return;
    if (step === "accounts") renderAccountsStep(content);
    else if (step === "run") renderRunStep(content);
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 1 — ACCOUNTS (management only: add, edit, delete — no selection)
  // ─────────────────────────────────────────────────────────────────
  function renderAccountsStep(content) {
    const canAdd = accounts.length < maxAccounts;
    const hasRunnableAccounts = accounts.some(acc => acc.accountType !== "static");
    const disabledReason = !canAdd
      ? (maxAccounts <= 1 ? t("setup.license_one") : t("setup.license_max")(maxAccounts))
      : null;
    const remoteCount = remoteAccountSlots && remoteAccountSlots.count ? Number(remoteAccountSlots.count) : 0;
    const showRecoveryNotice = accounts.length === 0 && remoteCount > 0;
    const recoveryTitle = setupText("setup.remote_slots_title", "This license already has accounts on the server");
    const recoveryBodyFn = t("setup.remote_slots_body");
    const recoveryBody = typeof recoveryBodyFn === "function"
      ? recoveryBodyFn(remoteCount)
      : `We found ${remoteCount} saved license slot(s) in the admin panel, but local credentials are missing on this install. Re-add the same Taager merchant/account details to re-link them, or ask admin to clear stale slots if this is a new setup.`;
    const showBackupPrompt = !!(credentialBackupPrompt && credentialBackupPrompt.show && accounts.length > 0);

    content.innerHTML = `
      <div class="sv3-page-title">${t("setup.manage_title")}</div>
      <div class="sv3-page-sub">${t("setup.manage_sub")}</div>

      ${showRecoveryNotice ? `
        <div class="sv3-recovery-note">
          <div class="sv3-recovery-note-badge">i</div>
          <div>
            <strong>${esc(recoveryTitle)}</strong>
            <span>${esc(recoveryBody)}</span>
          </div>
        </div>
      ` : ""}

      ${showBackupPrompt ? `
        <div class="sv3-recovery-note" id="sv3-credential-backup-prompt" style="border-color:rgba(0,214,143,.32);background:rgba(0,214,143,.08)">
          <div class="sv3-recovery-note-badge" style="background:#00b370;color:white">✓</div>
          <div style="flex:1;min-width:0">
            <strong>${esc(setupText("setup.backup_prompt_title", "Back up your saved accounts"))}</strong>
            <span>${esc(setupText("setup.backup_prompt_body", "Create an encrypted backup of the accounts saved on this device so you can restore them on another approved device."))}</span>
          </div>
          <button type="button" class="sv3-act-btn" id="sv3-backup-now-btn" style="white-space:nowrap;background:#00b370;color:#fff;border-color:#00b370">
            ${esc(setupText("setup.backup_prompt_btn", "Back up now"))}
          </button>
        </div>
      ` : ""}

      <div class="sv3-section">
        <div class="sv3-section-hd">
          <span class="sv3-section-hd-icon">👥</span>
          <span class="sv3-section-hd-title">${t("setup.your_accounts")}</span>
        </div>
        <div class="sv3-section-desc">${t("setup.your_accounts_desc")}</div>

        <div class="sv3-grid" id="sv3-acc-grid">
          ${accounts.map(acc => accountManageCard(acc)).join("")}

          <!-- Add Account tile -->
          <div class="sv3-add-card ${!canAdd ? "sv3-add-disabled" : ""}" id="sv3-btn-add"
               title="${!canAdd ? esc(disabledReason) : t("setup.add_new_account_title")}">
            <div class="sv3-add-circle">+</div>
            <div class="sv3-add-label">${t("setup.add_account")}</div>
            ${!canAdd ? `<div class="sv3-add-warn">⚠️ ${esc(disabledReason)}</div>` : ""}
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end">
        <button class="sv3-run-btn" id="sv3-next-btn" style="width:auto;padding:12px 32px"
          ${accounts.length === 0 ? "disabled" : ""}>
          ${window._teamLeaderEnabled || !hasRunnableAccounts ? (t("setup.nav_dashboard") || "Dashboard") : t("setup.next_btn")}
        </button>
      </div>
    `;

    content.querySelectorAll(".sv3-edit-btn").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        if (accounts.find(a => a.id === b.dataset.id)?.locked) return;
        openForm(b.dataset.id);
      });
    });
    content.querySelectorAll(".sv3-member-name-btn").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        openMemberNameEditor(b.dataset.id);
      });
    });
    content.querySelectorAll(".sv3-del-btn").forEach(b => {
      b.addEventListener("click", async e => {
        e.stopPropagation();
        if (accounts.find(a => a.id === b.dataset.id)?.locked) return;
        if (!confirm(t("setup.remove_confirm"))) return;
        const nextAccounts = accounts.filter(a => a.id !== b.dataset.id);
        const result = await window.api.saveAllAccounts(nextAccounts);
        if (result && result.success === false) return;
        selectedIds = selectedIds.filter(x => x !== b.dataset.id);
        await refreshAccountStateAfterMutation("accounts-updated");
        if (accounts.length === 0) step = "accounts";
        renderStep();
      });
    });

    document.getElementById("sv3-btn-add")?.addEventListener("click", () => {
      if (canAdd) openForm(null);
    });

    document.getElementById("sv3-backup-now-btn")?.addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = setupText("setup.backup_prompt_working", "Backing up...");
      const result = window.api.backupLicenseCredentialsNow
        ? await window.api.backupLicenseCredentialsNow()
        : { ok: false, reason: "backup_unavailable" };
      if (result && result.ok) {
        credentialBackupPrompt = Object.assign({}, credentialBackupPrompt, { show: false });
        if (window.TaagerUI && window.TaagerUI.toast) {
          window.TaagerUI.toast(setupText("setup.backup_prompt_done", "Encrypted backup saved."), { kind: "success" });
        }
        renderStep();
        return;
      }
      btn.disabled = false;
      btn.textContent = setupText("setup.backup_prompt_btn", "Back up now");
      if (window.TaagerUI && window.TaagerUI.toast) {
        window.TaagerUI.toast(setupText("setup.backup_prompt_failed", "Could not back up credentials. Try again."), { kind: "error" });
      }
    });

    document.getElementById("sv3-next-btn")?.addEventListener("click", () => {
      if (accounts.length) {
        if (window._teamLeaderEnabled || !accounts.some(acc => acc.accountType !== "static")) {
          goToDashboard();
          return;
        }
        step = "run"; runFlowStep = "users"; renderStep(); updateNav();
      }
    });
  }

  // Management card (no selection, shows edit/delete hover)
  function accountManageCard(acc) {
    const label    = accountUiLabel(acc);
    const emailLine = accountEmailLine(acc);
    const initial  = accountInitial(acc);
    const isLocked = !!acc.locked;
    const hasMemberName = !!String(acc.memberName || "").trim();
    const country = accountCountryMeta(acc);
    const isStatic = acc.accountType === "static";
    return `
      <div class="sv3-acc-card ${isLocked ? "sv3-acc-locked" : ""}" data-id="${acc.id}">
        <div class="sv3-card-meta-stack sv3-manage-meta-row">
          <div class="sv3-lock-badge ${isLocked ? "" : "unlocked"}">${isLocked ? `🔒 ${t("setup.locked")}` : `✓ ${t("setup.unlocked") || "Unlocked"}`}</div>
          ${isStatic ? `<div class="sv3-country-badge">${esc(setupText("setup.static_badge", "Static"))}</div>` : `<div class="sv3-country-badge" title="${esc(country.label)}" aria-label="${esc(country.label)}">
            <span class="${esc(country.flagClass)}" aria-hidden="true"></span>
            <span>${esc(country.code)}</span>
          </div>`}
        </div>
        <div class="sv3-avatar ${isLocked ? "lk" : ""}" style="margin-top:${isLocked ? "18px" : "8px"}">${isLocked ? "🔒" : initial}</div>
        <div class="sv3-acc-name" title="${esc(label)}">${esc(label)}</div>
        <div class="sv3-acc-email" title="${esc(emailLine)}">${esc(emailLine)}</div>
        ${isStatic ? "" : `<button class="sv3-member-name-btn" type="button" data-id="${acc.id}">
          ${hasMemberName ? t("setup.edit_member_name") : t("setup.add_member_name")}
        </button>`}
        ${!isLocked ? `<div class="sv3-hover-acts">
          <button class="sv3-act-btn sv3-edit-btn" data-id="${acc.id}">${t("setup.edit_btn")}</button>
          <button class="sv3-act-btn d sv3-del-btn" data-id="${acc.id}">${t("setup.delete_btn") || "Delete"}</button>
        </div>` : ""}
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 2 — RUN (combined: account selection + date + summary + run)
  // ─────────────────────────────────────────────────────────────────
  function renderRunStep(content) {
    injectCalendarStyles();
    const runnableAccounts = accounts.filter(acc => acc.accountType !== "static");
    selectedIds = selectedIds.filter(id => runnableAccounts.some(acc => acc.id === id));
    const totalDays   = daysBetween(dateFrom, dateTo);
    const selAccounts = runnableAccounts.filter(a => selectedIds.includes(a.id));
    const dateComplete = dateMode !== "range" || (!!dateFrom && !!dateTo);
    const canLaunch = selAccounts.length > 0 && dateComplete && !isDateRangeInvalid();
    const launchHint = selAccounts.length === 0 ? t("setup.select_user_to_launch") : t("setup.run_security");
    const onDateStep  = runFlowStep === "date";
    const rangeLabel  = dateFrom === dateTo ? formatDisplayDate(dateFrom) : `${formatDisplayDate(dateFrom)} – ${formatDisplayDate(dateTo)}`;

    content.innerHTML = `
      <div class="sv3-run-stage">
      <div class="sv3-run-hero">
        <div class="sv3-run-title-lockup">
          <div class="sv3-run-icon">🚀</div>
          <div class="sv3-run-hero-copy">
            <div class="sv3-page-title">${t("setup.run_title")}</div>
            <div class="sv3-page-sub" style="margin-bottom:0">${t("setup.run_sub")}</div>
          </div>
        </div>
        <div class="sv3-flow-stepper ${onDateStep ? "date-active" : ""}" aria-label="Run setup steps">
          <div class="sv3-flow-node ${onDateStep ? "done" : "active"}">
            <div class="sv3-flow-node-num">${onDateStep ? "✓" : "1"}</div>
            <div class="sv3-flow-node-text">
              <div class="sv3-flow-node-title">${t("setup.select_users")}</div>
              <div class="sv3-flow-node-sub" id="sv3-stepper-users">${t("setup.users_count")(selAccounts.length)}</div>
            </div>
          </div>
          <div class="sv3-flow-node ${onDateStep ? "active" : ""}">
            <div class="sv3-flow-node-num">2</div>
            <div class="sv3-flow-node-text">
              <div class="sv3-flow-node-title">${t("setup.select_date")}</div>
              <div class="sv3-flow-node-sub" id="sv3-stepper-date">${rangeLabel}</div>
            </div>
          </div>
        </div>
      </div>

      ${!onDateStep ? `
      <div class="sv3-section sv3-users-panel sv3-flow-panel" key="users">
        <div class="sv3-section-top">
          <div class="sv3-step-heading">
            <div class="sv3-step-badge">1</div>
            <div>
              <div class="sv3-section-title-lg">${t("setup.select_users")}</div>
              <div class="sv3-section-copy">${t("setup.select_users_desc")}</div>
            </div>
          </div>

        </div>

        <div class="sv3-settings-dock">
            <div class="sv3-setting-card">
              <div class="sv3-setting-row">
                <div class="sv3-setting-copy">
                  <div class="sv3-setting-icon">🚀</div>
                  <div>
                    <div class="sv3-setting-title">${t("welcome.launch_min")}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
                  <button id="sv3-btn-launchmin" class="sv3-toggle-btn">
                    <span id="sv3-launchmin-knob"></span>
                  </button>
                  <span id="sv3-launchmin-label" class="sv3-toggle-label">${t("welcome.off")}</span>
                </div>
              </div>
              <div class="sv3-setting-desc">${t("welcome.launch_min_desc")}</div>
            </div>

            <div class="sv3-setting-card">
              <div class="sv3-setting-row">
                <div class="sv3-setting-copy">
                  <div class="sv3-setting-icon">🤖</div>
                  <div>
                    <div class="sv3-setting-title">${t("welcome.autoconfirm_title")}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
                  <button id="sv3-btn-autoconfirm" class="sv3-toggle-btn">
                    <span id="sv3-autoconfirm-knob"></span>
                  </button>
                  <span id="sv3-autoconfirm-label" class="sv3-toggle-label">${t("welcome.off")}</span>
                </div>
              </div>
              <div class="sv3-setting-desc">${t("welcome.autoconfirm_desc")}</div>
            </div>

            <div class="sv3-setting-card">
              <div class="sv3-setting-row">
                <div class="sv3-setting-copy">
                  <div class="sv3-setting-icon">✓</div>
                  <div>
                    <div class="sv3-setting-title">${t("welcome.autorun")}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
                  <button id="sv3-btn-autorun" class="sv3-toggle-btn">
                    <span id="sv3-autorun-knob"></span>
                  </button>
                  <span id="sv3-autorun-label" class="sv3-toggle-label">${t("welcome.off")}</span>
                </div>
              </div>
              <div class="sv3-setting-desc">${t("welcome.autorun_desc")}</div>
              <div id="sv3-autorun-interval-row" class="sv3-setting-meta" style="display:none">
                <div style="font-size:10px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t("welcome.run_every")}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap" id="sv3-interval-options">
                  ${[{label:"30 min",mins:30},{label:"1 hr",mins:60},{label:"2 hr",mins:120},{label:"4 hr",mins:240},{label:"6 hr",mins:360}].map(o =>
                    `<button class="btn btn-ghost sv3-interval-opt" data-mins="${o.mins}" style="font-size:11px;padding:4px 10px">${o.label}</button>`
                  ).join("")}
                </div>
              </div>
              <div id="sv3-autorun-next" style="margin-top:7px;font-size:11px;color:var(--text2);display:none"></div>
            </div>
        </div>

        <div class="sv3-users-toolbar">
          <div class="sv3-users-count" id="sv3-users-selected-count">
            <strong>${t("setup.users_count")(selAccounts.length)}</strong> / ${t("setup.accounts_count")(runnableAccounts.length)}
          </div>
        </div>

        <div class="sv3-grid sv3-run-accounts" id="sv3-run-acc-grid">
          <div class="sv3-acc-card ${runnableAccounts.length > 0 && runnableAccounts.every(a => selectedIds.includes(a.id)) ? "selected" : ""}" id="sv3-all-card" style="border-style:dashed;cursor:pointer">
            <div class="sv3-check">
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </div>
            <div class="sv3-avatar" style="background:linear-gradient(135deg,#ff2d7a,#7c6af7);margin-top:8px">★</div>
            <div class="sv3-acc-name">${t("setup.all_users")}</div>
            <div class="sv3-acc-email">${t("setup.accounts_count")(runnableAccounts.length)}</div>
            <div class="sv3-status-pill ok"><span class="sv3-dot"></span>${t("setup.select_all")}</div>
          </div>
          ${runnableAccounts.map((acc, index) => accountRunCard(acc, index + 1)).join("")}
        </div>

        <div class="sv3-continue-row">
          <button class="sv3-run-btn sv3-continue-btn" id="sv3-continue-date"
            ${selAccounts.length === 0 ? "disabled" : ""}
            data-tooltip="${esc(t("dashboard.fetching_body"))}">
            ${t("setup.continue_date")}
          </button>
        </div>
      </div>
      ` : `
      <div class="sv3-section sv3-date-panel sv3-flow-panel" key="date">
        <div class="sv3-section-top">
          <div class="sv3-step-heading">
            <div class="sv3-step-badge green">2</div>
            <div>
              <div class="sv3-section-title-lg">${t("setup.select_date")}</div>
              <div class="sv3-section-copy">${t("setup.select_date_desc")}</div>
            </div>
          </div>
        </div>

        <div class="sv3-date-modes">
          <button class="sv3-date-mode-btn ${dateMode==="today"?"active":""}" data-mode="today">${t("setup.today_mode")}</button>
          <button class="sv3-date-mode-btn ${dateMode==="single"?"active":""}" data-mode="single">${t("setup.single_mode")}</button>
          <button class="sv3-date-mode-btn ${dateMode==="range"?"active":""}" data-mode="range">${t("setup.range_mode")}</button>
        </div>

        <div id="sv3-date-inputs"></div>

        <div id="sv3-date-range-err" style="display:none;margin-top:12px;align-items:center;gap:8px;background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--danger);font-weight:600">
          <span style="font-size:16px">⚠️</span>
          <span>${t("setup.date_range_err")}</span>
        </div>

        <div class="sv3-run-review">
          <div class="sv3-review-grid">
            <div class="sv3-review-metric">
              <div class="sv3-review-icon users">👥</div>
              <div>
                <div class="sv3-review-label">${t("setup.users_selected")}</div>
                <div class="sv3-review-value">
                  <div id="sv3-sum-users">${t("setup.users_count")(selAccounts.length)}</div>
                  <div class="sv3-mini-avatars" id="sv3-mini-avs">
                    ${selAccounts.slice(0,3).map(a => `<div class="sv3-mini-av">${accountInitial(a)}</div>`).join("")}
                    ${selAccounts.length > 3 ? `<div class="sv3-mini-av more">+${selAccounts.length-3}</div>` : ""}
                  </div>
                </div>
              </div>
            </div>
            <div class="sv3-review-metric">
              <div class="sv3-review-icon date">📅</div>
              <div>
                <div class="sv3-review-label">${t("setup.date_range")}</div>
                <div class="sv3-review-value" id="sv3-sum-range">
                  ${rangeLabel}
                </div>
              </div>
            </div>
            <div class="sv3-review-metric">
              <div class="sv3-review-icon days">⏱</div>
              <div>
                <div class="sv3-review-label">${t("setup.total_days")}</div>
                <div class="sv3-review-value" id="sv3-sum-days">${t("setup.days_count")(totalDays)}</div>
              </div>
            </div>
          </div>

          <div class="sv3-launch-row">
            <button class="sv3-run-btn sv3-back-ghost" id="sv3-back-btn">
              ${t("setup.back_btn")}
            </button>
            <button class="sv3-run-btn sv3-run-primary" id="sv3-run-final"
              ${!canLaunch ? "disabled" : ""}>
              ${t("setup.run_btn")}
            </button>
          </div>
          <div class="sv3-run-hint ${!canLaunch ? "warn" : ""}" id="sv3-run-hint">
            ${esc(launchHint)}
          </div>
        </div>
      </div>
      `}
      </div>
    `;

    // Account card selection (All Users + individual)
    document.getElementById("sv3-all-card")?.addEventListener("click", () => {
      const allIds = runnableAccounts.map(a => a.id);
      const allSel = allIds.every(id => selectedIds.includes(id));
      if (allSel) {
        selectedIds = allIds.length > 0 ? [allIds[0]] : selectedIds;
      } else {
        selectedIds = [...allIds];
      }
      updateRunCards();
      if (typeof sv3AutoRunEnabled !== "undefined" && sv3AutoRunEnabled) {
        window.api.setAutoRunAccounts(selectedIds).catch(() => {});
      }
    });

    content.querySelectorAll(".sv3-run-acc-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        if (selectedIds.includes(id)) {
          if (selectedIds.length > 1) {
            selectedIds = selectedIds.filter(x => x !== id);
          }
        } else {
          selectedIds.push(id);
        }
        updateRunCards();
        if (typeof sv3AutoRunEnabled !== "undefined" && sv3AutoRunEnabled) {
          window.api.setAutoRunAccounts(selectedIds).catch(() => {});
        }
      });
    });

    document.getElementById("sv3-continue-date")?.addEventListener("click", () => {
      const sel = runnableAccounts.filter(a => selectedIds.includes(a.id));
      if (!sel.length) return;
      runFlowStep = "date";
      renderStep();
    });

    // Date mode buttons
    content.querySelectorAll(".sv3-date-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        dateMode = btn.dataset.mode;
        if (dateMode === "today") { dateFrom = todayStr; dateTo = todayStr; }
        content.querySelectorAll(".sv3-date-mode-btn").forEach(b => b.classList.toggle("active", b === btn));
        renderDateInputs();
        updateSummary();
      });
    });

    renderDateInputs();

    document.getElementById("sv3-back-btn")?.addEventListener("click", () => {
      runFlowStep = "users";
      renderStep();
    });

    document.getElementById("sv3-run-final")?.addEventListener("click", () => {
      const sel = runnableAccounts.filter(a => selectedIds.includes(a.id));
      const dateComplete = dateMode !== "range" || (!!dateFrom && !!dateTo);
      if (sel.length && dateComplete && !isDateRangeInvalid()) {
        onComplete({ dateFrom, dateTo, selectedAccountIds: selectedIds.length ? selectedIds : null });
      }
    });

    // ── Launch Minimized toggle (setup page) ──
    let sv3LaunchMinEnabled = false;
    function sv3UpdateLaunchMinUI() {
      const btn   = document.getElementById("sv3-btn-launchmin");
      const knob  = document.getElementById("sv3-launchmin-knob");
      const label = document.getElementById("sv3-launchmin-label");
      if (!btn) return;
      if (sv3LaunchMinEnabled) {
        btn.style.background = "var(--accent)";
        knob.style.transform = "translateX(20px)";
        label.textContent = t("welcome.on"); label.style.color = "var(--accent)";
      } else {
        btn.style.background = "var(--border)";
        knob.style.transform = "translateX(0)";
        label.textContent = t("welcome.off"); label.style.color = "var(--text2)";
      }
    }
    document.getElementById("sv3-btn-launchmin")?.addEventListener("click", async () => {
      sv3LaunchMinEnabled = !sv3LaunchMinEnabled;
      await window.api.setLaunchMinimized(sv3LaunchMinEnabled);
      sv3UpdateLaunchMinUI();
    });

    // ── Auto-Confirm toggle (setup page) ──
    let sv3AutoConfirmEnabled = false;
    function sv3UpdateAutoConfirmUI() {
      const btn   = document.getElementById("sv3-btn-autoconfirm");
      const knob  = document.getElementById("sv3-autoconfirm-knob");
      const label = document.getElementById("sv3-autoconfirm-label");
      if (!btn) return;
      if (sv3AutoConfirmEnabled) {
        btn.style.background = "var(--success)";
        btn.style.boxShadow = "0 0 0 3px rgba(0,214,143,.12)";
        knob.style.transform = "translateX(23px)";
        label.textContent = t("welcome.on");
        label.style.color = "var(--success)";
      } else {
        btn.style.background = "var(--border)";
        btn.style.boxShadow = "none";
        knob.style.transform = "translateX(0)";
        label.textContent = t("welcome.off");
        label.style.color = "var(--text2)";
      }
    }

    document.getElementById("sv3-btn-autoconfirm")?.addEventListener("click", async () => {
      sv3AutoConfirmEnabled = !sv3AutoConfirmEnabled;
      await window.api.setAutoConfirm(sv3AutoConfirmEnabled);
      sv3UpdateAutoConfirmUI();
    });

    // ── Auto-Run toggle (setup page) ──
    let sv3AutoRunEnabled      = false;
    let sv3AutoRunIntervalMins = 30;
    let sv3CountdownInterval   = null;
    let sv3CountdownSyncedAt   = 0;
    let sv3CountdownSyncedMs   = 0;

    function sv3UpdateAutoRunUI(remainingMs) {
      const btn    = document.getElementById("sv3-btn-autorun");
      const knob   = document.getElementById("sv3-autorun-knob");
      const label  = document.getElementById("sv3-autorun-label");
      const next   = document.getElementById("sv3-autorun-next");
      const intRow = document.getElementById("sv3-autorun-interval-row");
      if (!btn) return;
      if (sv3AutoRunEnabled) {
        btn.style.background = "var(--warning)";
        knob.style.transform = "translateX(20px)";
        label.textContent = t("welcome.on"); label.style.color = "var(--warning)";
        next.style.display = "block";
        intRow.style.display = "block";
        sv3StartCountdown(remainingMs);
      } else {
        btn.style.background = "var(--border)";
        knob.style.transform = "translateX(0)";
        label.textContent = t("welcome.off"); label.style.color = "var(--text2)";
        next.style.display = "none";
        intRow.style.display = "none";
        sv3StopCountdown();
      }
      document.querySelectorAll(".sv3-interval-opt").forEach(b => {
        const active = parseInt(b.dataset.mins) === sv3AutoRunIntervalMins;
        b.className = active ? "btn btn-primary sv3-interval-opt" : "btn btn-ghost sv3-interval-opt";
        b.style.cssText = "font-size:12px;padding:6px 14px";
      });
    }

    function sv3StartCountdown(remainingMs) {
      sv3StopCountdown();
      sv3CountdownSyncedAt = Date.now();
      sv3CountdownSyncedMs = (remainingMs !== undefined)
        ? Math.max(0, remainingMs)
        : sv3AutoRunIntervalMins * 60 * 1000;

      const next = document.getElementById("sv3-autorun-next");
      let syncTick = 0;
      const tick = async () => {
        if (!document.getElementById("sv3-autorun-next")) { sv3StopCountdown(); return; }
        syncTick++;
        if (syncTick % 5 === 0) {
          try {
            const prog = await window.api.getAutoRunProgress();
            if (prog) { sv3CountdownSyncedAt = Date.now(); sv3CountdownSyncedMs = prog.remainingMs; }
          } catch {}
        }
        const displayMs  = Math.max(0, sv3CountdownSyncedMs - (Date.now() - sv3CountdownSyncedAt));
        const totalSecs  = Math.ceil(displayMs / 1000);
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        const fn = t("welcome.next_run");
        if (next) next.textContent = typeof fn === "function"
          ? fn(m, String(s).padStart(2, "0"))
          : `⏳ Next auto-run in ${m}:${String(s).padStart(2, "0")}`;
      };
      tick();
      sv3CountdownInterval = setInterval(tick, 1000);
    }

    function sv3StopCountdown() {
      if (sv3CountdownInterval) { clearInterval(sv3CountdownInterval); sv3CountdownInterval = null; }
    }

    document.getElementById("sv3-btn-autorun")?.addEventListener("click", async () => {
      sv3AutoRunEnabled = !sv3AutoRunEnabled;
      await window.api.setAutoRun(sv3AutoRunEnabled);
      if (sv3AutoRunEnabled) {
        const allIds = runnableAccounts.map(a => a.id);
        const autoRunIds = selectedIds.length ? selectedIds : allIds;
        if (!selectedIds.length && allIds.length) {
          selectedIds = [...allIds];
          updateRunCards();
        }
        await window.api.setAutoRunAccounts(autoRunIds);
        const prog = await window.api.getAutoRunProgress();
        sv3UpdateAutoRunUI(prog ? prog.remainingMs : undefined);
      } else {
        sv3UpdateAutoRunUI();
      }
    });

    document.querySelectorAll(".sv3-interval-opt").forEach(btn => {
      btn.addEventListener("click", async () => {
        sv3AutoRunIntervalMins = parseInt(btn.dataset.mins);
        await window.api.setAutoRunInterval(sv3AutoRunIntervalMins);
        sv3UpdateAutoRunUI(sv3AutoRunIntervalMins * 60 * 1000);
      });
    });

    // Load saved state from store
    window.api.getCredentials().then(async (creds) => {
      sv3LaunchMinEnabled    = creds.launchMinimized || false;
      sv3AutoConfirmEnabled  = creds.autoConfirm     || false;
      sv3AutoRunEnabled      = creds.autoRun         || false;
      sv3AutoRunIntervalMins = creds.autoRunInterval  || 30;
      const savedAutoRunIds = Array.isArray(creds.autoRunAccountIds)
        ? creds.autoRunAccountIds.filter(id => runnableAccounts.some(a => a.id === id))
        : [];
      if (sv3AutoRunEnabled && savedAutoRunIds.length) {
        selectedIds = savedAutoRunIds;
        updateRunCards();
      }
      sv3UpdateLaunchMinUI();
      sv3UpdateAutoConfirmUI();
      if (sv3AutoRunEnabled) {
        const allIds = runnableAccounts.map(a => a.id);
        const autoRunIds = selectedIds.length ? selectedIds : allIds;
        if (!selectedIds.length && allIds.length) {
          selectedIds = [...allIds];
          updateRunCards();
        }
        await window.api.setAutoRunAccounts(autoRunIds);
        const prog = await window.api.getAutoRunProgress();
        sv3UpdateAutoRunUI(prog ? prog.remainingMs : undefined);
      } else {
        sv3UpdateAutoRunUI();
      }
    });
  }

  // Run step account card (selectable, no edit/delete)
  function accountRunCard(acc, index) {
    const label    = accountUiLabel(acc);
    const emailLine = accountEmailLine(acc);
    const isLocked = !!acc.locked;
    const isSel    = selectedIds.includes(acc.id);
    const country  = accountCountryMeta(acc);
    return `
      <div class="sv3-acc-card sv3-run-acc-card ${isSel ? "selected" : ""}" data-id="${acc.id}" style="cursor:pointer">
        <div class="sv3-check">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </div>
        <div class="sv3-card-meta-stack">
          <div class="sv3-country-badge" title="${esc(country.label)}" aria-label="${esc(country.label)}">
            <span class="${esc(country.flagClass)}" aria-hidden="true"></span>
            <span>${esc(country.code)}</span>
          </div>
          ${isLocked ? `<div class="sv3-lock-badge">🔒 ${t("setup.locked")}</div>` : ""}
        </div>
        <div class="sv3-avatar sv3-run-index-avatar" style="margin-top:8px">${index}</div>
        <div class="sv3-acc-name" title="${esc(label)}">${esc(label)}</div>
        <div class="sv3-acc-email" title="${esc(emailLine)}">${esc(emailLine)}</div>
      </div>`;
  }

  function updateLaunchState() {
    const selAccounts = accounts.filter(a => a.accountType !== "static" && selectedIds.includes(a.id));
    const invalid = isDateRangeInvalid();
    const dateComplete = dateMode !== "range" || (!!dateFrom && !!dateTo);
    const canLaunch = selAccounts.length > 0 && dateComplete && !invalid;

    const runBtn = document.getElementById("sv3-run-final");
    if (runBtn) runBtn.disabled = !canLaunch;
    const continueBtn = document.getElementById("sv3-continue-date");
    if (continueBtn) continueBtn.disabled = selAccounts.length === 0;

    const hint = document.getElementById("sv3-run-hint");
    if (hint) {
      hint.classList.toggle("warn", !canLaunch);
      hint.textContent = selAccounts.length === 0
        ? t("setup.select_user_to_launch")
        : !dateComplete
          ? t("setup.select_date_desc")
        : invalid
          ? t("setup.date_range_err")
          : t("setup.run_security");
    }

    const stepperUsers = document.getElementById("sv3-stepper-users");
    if (stepperUsers) stepperUsers.textContent = t("setup.users_count")(selAccounts.length);
    const stepperDate = document.getElementById("sv3-stepper-date");
    if (stepperDate) {
      stepperDate.textContent = invalid
        ? t("setup.date_before_start")
        : (dateFrom === dateTo ? formatDisplayDate(dateFrom) : `${formatDisplayDate(dateFrom)} – ${formatDisplayDate(dateTo)}`);
    }

    const nodes = document.querySelectorAll(".sv3-flow-node");
    const first = nodes[0];
    const second = nodes[1];
    if (first) {
      first.classList.toggle("done", runFlowStep === "date");
      first.classList.toggle("active", runFlowStep !== "date");
      const num = first.querySelector(".sv3-flow-node-num");
      if (num) num.textContent = runFlowStep === "date" ? "✓" : "1";
    }
    if (second) {
      second.classList.toggle("active", runFlowStep === "date");
    }
  }

  function updateRunCards() {
    const runnableAccounts = accounts.filter(a => a.accountType !== "static");
    const allIds = runnableAccounts.map(a => a.id);
    const allSel = allIds.length > 0 && allIds.every(id => selectedIds.includes(id));

    // Update All Users card
    const allCard = document.getElementById("sv3-all-card");
    if (allCard) allCard.classList.toggle("selected", allSel);

    // Update individual cards
    document.querySelectorAll(".sv3-run-acc-card").forEach(card => {
      const isSel = selectedIds.includes(card.dataset.id);
      card.classList.toggle("selected", isSel);
    });

    // Update summary
    const selAccounts = runnableAccounts.filter(a => selectedIds.includes(a.id));
    const usersEl = document.getElementById("sv3-sum-users");
    const avsEl   = document.getElementById("sv3-mini-avs");
    const selectedCountEl = document.getElementById("sv3-users-selected-count");
    if (selectedCountEl) {
      selectedCountEl.innerHTML = `<strong>${t("setup.users_count")(selAccounts.length)}</strong> / ${t("setup.accounts_count")(runnableAccounts.length)}`;
    }
    if (usersEl) usersEl.textContent = `${t("setup.users_count")(selAccounts.length)}`;
    if (avsEl) {
      avsEl.innerHTML = selAccounts.slice(0,3).map(a => `<div class="sv3-mini-av">${accountInitial(a)}</div>`).join("")
        + (selAccounts.length > 3 ? `<div class="sv3-mini-av more">+${selAccounts.length-3}</div>` : "");
    }

    updateLaunchState();
  }

  function renderDateInputs() {
    const container = document.getElementById("sv3-date-inputs");
    if (!container) return;
    if (dateMode === "today") {
      container.innerHTML = `
        <div class="sv3-date-ready">
          ${t("setup.today_running")(formatDisplayDate(todayStr))}
        </div>`;
      return;
    }
    if (dateMode === "single") {
      container.innerHTML = `
        <div class="sv3-date-single">
          <div class="sv3-date-field-label">${t("setup.date_label")}</div>
          <div id="sv3-cal-single" class="fast-cal"></div>
        </div>`;
      buildCalendar(
        document.getElementById("sv3-cal-single"),
        dateFrom, todayStr,
        (val) => { dateFrom = val; dateTo = val; updateSummary(); }
      );
      return;
    }
    // range
    container.innerHTML = `
      <div class="sv3-date-range-single">
        <div id="sv3-cal-range" class="fast-cal"></div>
      </div>`;
    buildRangeCalendar(
      document.getElementById("sv3-cal-range"),
      dateFrom,
      dateTo,
      todayStr,
      (from, to) => {
        dateFrom = from;
        dateTo = to;
        updateSummary();
      }
    );
  }

  function isDateRangeInvalid() {
    return dateMode === "range" && !!dateFrom && !!dateTo && dateFrom > dateTo;
  }

  function updateSummary() {
    const rangeEl  = document.getElementById("sv3-sum-range");
    const daysEl   = document.getElementById("sv3-sum-days");
    const errEl    = document.getElementById("sv3-date-range-err");
    if (!rangeEl || !daysEl) return;

    const invalid = isDateRangeInvalid();

    // Show/hide the inline error banner
    if (errEl) errEl.style.display = invalid ? "flex" : "none";

    if (dateMode === "range" && (!dateFrom || !dateTo)) {
      rangeEl.textContent = dateFrom
        ? `${formatDisplayDate(dateFrom)} – ${t("setup.end_date")}`
        : "—";
      daysEl.textContent = "—";
      updateLaunchState();
      return;
    }

    if (invalid) {
      rangeEl.innerHTML = `<span style="color:var(--danger);font-size:11px">${t("setup.date_before_start")}</span>`;
      daysEl.innerHTML  = `<span style="color:var(--danger)">—</span>`;
      updateLaunchState();
      return;
    }

    const totalDays = daysBetween(dateFrom, dateTo);
    rangeEl.textContent = dateFrom === dateTo
      ? formatDisplayDate(dateFrom)
      : `${formatDisplayDate(dateFrom)} – ${formatDisplayDate(dateTo)}`;
    daysEl.textContent = `${t("setup.days_count")(totalDays)}`;
    updateLaunchState();
  }

  function formatDisplayDate(str) {
    if (!str) return "—";
    const [y, m, d] = str.split("-");
    const months = window._t("calendar.months");
    return `${months[parseInt(m)-1]} ${parseInt(d)}, ${y}`;
  }

  // ─────────────────────────────────────────────────────────────────
  // FORM OVERLAY — Add / Edit account
  // ─────────────────────────────────────────────────────────────────
  function openMemberNameEditor(accountId) {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    const overlay = document.createElement("div");
    overlay.className = "sv3-form-overlay";
    overlay.innerHTML = `
      <div class="sv3-form-card sv3-member-card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
          <button id="sv3-member-back" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text2);font-size:15px;flex-shrink:0;transition:all .15s">←</button>
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--text)">${t("setup.member_name_title")}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">${t("setup.member_name_subtitle")}</div>
          </div>
        </div>

        <div class="form-group">
          <label>${t("setup.member_name_label")}</label>
          <input type="text" id="sv3-member-name" placeholder="${t("setup.member_name_ph")}" value="${esc(acc.memberName || "")}" autocomplete="off" />
          <div style="font-size:11px;color:var(--text2);margin-top:4px">${t("setup.member_name_hint")}</div>
        </div>

        <div style="font-size:11px;color:var(--text3);margin-top:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(accountEmailLine(acc))}</div>

        <div id="sv3-member-err" class="notice-box danger mt-20" style="display:none">
          <span class="notice-icon">⚠️</span>
          <div class="notice-text" id="sv3-member-err-text">${t("setup.save_failed")}</div>
        </div>

        <div class="sv3-member-actions">
          <button class="btn full-width" id="sv3-member-clear" style="border:1px solid var(--border);background:var(--bg2);color:var(--text2)">${t("setup.clear_member_name")}</button>
          <button class="btn btn-primary full-width btn-lg" id="sv3-member-save">${t("setup.save_member_name")}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    document.getElementById("sv3-member-back")?.addEventListener("click", close);
    const input = document.getElementById("sv3-member-name");
    setTimeout(() => input?.focus(), 30);

    const saveMemberName = async (value) => {
      const idx = accounts.findIndex(a => a.id === accountId);
      if (idx < 0) return;
      const saveBtn = document.getElementById("sv3-member-save");
      const errEl = document.getElementById("sv3-member-err");
      const errText = document.getElementById("sv3-member-err-text");
      if (saveBtn) {
        saveBtn.textContent = t("setup.saving");
        saveBtn.disabled = true;
      }
      const nextAccounts = accounts.map(a => ({ ...a }));
      nextAccounts[idx] = { ...nextAccounts[idx], memberName: String(value || "").trim() };
      const result = window.api.updateAccount
        ? await window.api.updateAccount({ accountId, patch: { memberName: String(value || "").trim() } })
        : await window.api.saveAllAccounts(nextAccounts);
      if (result && result.success === false) {
        if (saveBtn) {
          saveBtn.textContent = t("setup.save_member_name");
          saveBtn.disabled = false;
        }
        if (errText) errText.innerHTML = result.reason || t("setup.save_failed");
        if (errEl) errEl.style.display = "flex";
        return;
      }
      close();
      await refreshAccountStateAfterMutation("accounts-updated");
      renderStep();
    };

    document.getElementById("sv3-member-save")?.addEventListener("click", () => saveMemberName(input?.value || ""));
    document.getElementById("sv3-member-clear")?.addEventListener("click", () => saveMemberName(""));
    input?.addEventListener("keydown", e => {
      if (e.key === "Enter") saveMemberName(input.value || "");
    });
  }

  function openForm(editId) {
    const isEdit = editId !== null;
    const acc    = isEdit ? accounts.find(a => a.id === editId) : null;
    if (isEdit && (!acc || acc.locked)) return;
    const isLockedEdit = isEdit && !!acc?.locked;
    const selectedTaagerMethod = acc?.taagerLoginMethod || "email";
    const selectedTaagerCountry = (acc?.taagerCountry || "sa").toLowerCase();
    const selectedTaagerMerchantId = acc?.taagerAffiliateCode || "";
    const selectedDashboardProvider = acc?.dashboardEnrichmentProvider === "easyorders" ? "easyorders" : "none";
    const selectedAccountType = acc?.accountType === "static" ? "static" : "live";
    const isTeamLeaderMode = window._teamLeaderEnabled === true;
    const easyRequiredMark = '<span data-easy-required-mark style="color:var(--danger)">*</span>';
    const taagerMethodOptions = [
      { value: "email", label: t("setup.taager_login_email") },
      { value: "phone", label: t("setup.taager_login_phone") },
      { value: "google", label: t("setup.taager_login_google") },
    ];
    const taagerCountryOptions = getTaagerCountryOptions();
    const renderMethodTabs = () => taagerMethodOptions.map(opt => `
      <button type="button" class="sv3-tab-btn ${selectedTaagerMethod === opt.value ? "is-active" : ""}" data-taager-method="${opt.value}" ${isLockedEdit ? "disabled" : ""}>${opt.label}</button>
    `).join("");
    const renderCountryTabs = () => taagerCountryOptions.map(opt => `
      <button type="button" class="sv3-country-btn ${selectedTaagerCountry === opt.value ? "is-active" : ""}" data-taager-country="${opt.value}" ${isLockedEdit ? "disabled" : ""}>
        <span class="sv3-country-code"><span class="${esc(window.TaagerCountry && window.TaagerCountry.flagClass ? window.TaagerCountry.flagClass(opt.value) : "taager-country-flag flag:SA")}" aria-hidden="true"></span>${opt.code}</span>
        <span class="sv3-country-name">${esc(opt.label)}</span>
      </button>
    `).join("");

    const overlay = document.createElement("div");
    overlay.className = "sv3-form-overlay";
    overlay.innerHTML = `
      <div class="sv3-form-card">
        <!-- Premium Header Lockup -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:40px;height:40px;border-radius:12px;background:rgba(124,106,247,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--accent)">👤</div>
            <div>
              <div style="font-size:18px;font-weight:800;color:var(--text);letter-spacing:-0.3px">${isEdit ? t("setup.edit_account") : t("setup.new_account")}</div>
              <div style="font-size:12px;color:var(--text2);margin-top:2px">${t("setup.form_subtitle")}</div>
            </div>
          </div>
          <button id="sv3-form-back" style="margin-left:auto;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text2);font-size:16px;flex-shrink:0;transition:all 0.2s ease" onmouseover="this.style.background='rgba(255,255,255,0.08)';this.style.color='var(--text)'" onmouseout="this.style.background='rgba(255,255,255,0.03)';this.style.color='var(--text2)'">×</button>
        </div>

        ${!isEdit ? `<div class="form-group" style="margin-bottom:20px">
          <label>${esc(setupText("setup.account_type", "Account type"))}</label>
          <input type="hidden" id="sv3-account-type" value="${esc(selectedAccountType)}" />
          <div class="sv3-tab-control">
            <button type="button" class="sv3-tab-btn ${selectedAccountType === "live" ? "is-active" : ""}" data-account-type="live">${esc(setupText("setup.normal_account", "Normal Account"))}</button>
            <button type="button" class="sv3-tab-btn ${selectedAccountType === "static" ? "is-active" : ""}" data-account-type="static">${esc(setupText("setup.static_account", "Static Account"))}</button>
          </div>
        </div>` : `<input type="hidden" id="sv3-account-type" value="${esc(selectedAccountType)}" />`}

        <div id="sv3-static-account-panel" class="sv3-form-panel" style="${selectedAccountType === "static" ? "" : "display:none;"}margin-bottom:20px">
          <div class="form-section-title">${esc(setupText("setup.static_account", "Static Account"))}</div>
          <div class="form-group">
            <label>${esc(setupText("setup.static_name", "Account name"))} <span style="color:var(--danger)">*</span></label>
            <input type="text" id="sv3-static-name" value="${esc(acc?.label || acc?.memberName || "")}" placeholder="${esc(setupText("setup.static_name_placeholder", "Example: Jake"))}" autocomplete="off" ${isLockedEdit ? "disabled" : ""} />
            <div class="sv3-field-hint">${esc(setupText("setup.static_hint", "This account uses Excel Static Update and does not connect to Taager or EasyOrders."))}</div>
          </div>
        </div>

        <div class="sv3-form-grid" id="sv3-live-account-panel" style="${selectedAccountType === "static" ? "display:none;" : ""}">
          <div class="sv3-form-panel">
        <div class="form-section-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          ${t("setup.easy_section")}
        </div>
        <div class="form-group">
          <label>${setupText("setup.dashboard_enrichment_label", "Dashboard Data Source")}</label>
          <input type="hidden" id="sv3-dashboard-enrichment-provider" value="${esc(selectedDashboardProvider)}" />
          <div class="sv3-tab-control">
            <button type="button" class="sv3-tab-btn ${selectedDashboardProvider === "none" ? "is-active" : ""}" data-dashboard-enrichment-provider="none" ${isLockedEdit ? "disabled" : ""}>${setupText("setup.dashboard_enrichment_taager", "Taager Only")}</button>
            <button type="button" class="sv3-tab-btn ${selectedDashboardProvider === "easyorders" ? "is-active" : ""}" data-dashboard-enrichment-provider="easyorders" ${isLockedEdit ? "disabled" : ""}>${setupText("setup.dashboard_enrichment_easyorders", "Taager + EasyOrders")}</button>
          </div>
          <div class="sv3-field-hint" id="sv3-enrichment-hint">${selectedDashboardProvider === "easyorders"
            ? setupText("setup.dashboard_enrichment_hint_easyorders", "Your dashboard will pull orders and profits from Taager, and also connect to EasyOrders to enrich product names and payment data. Best choice if you use both platforms.")
            : setupText("setup.dashboard_enrichment_hint_taager", "Your dashboard will use Taager as the only data source for orders, profits, and product info. Simple and fast — recommended if you don't use EasyOrders.")
          }</div>
        </div>
        <div class="form-group">
          <label>${t("setup.store_label")} ${easyRequiredMark}</label>
          <input type="text" id="sv3-easy-store" placeholder="${t("setup.store_ph")}" value="${esc(acc?.easyStore||"")}" ${isLockedEdit ? "disabled" : ""} />
        </div>
        <div class="form-group">
          <label>${t("setup.email_label")} ${easyRequiredMark}</label>
          <input type="email" id="sv3-easy-email" placeholder="${t("setup.email_ph")}" value="${esc(acc?.easyEmail||"")}" autocomplete="off" ${isLockedEdit ? "disabled" : ""} />
        </div>
        <div class="form-group">
          <label>${t("setup.pass_label")} ${easyRequiredMark}</label>
          <div style="position:relative;display:flex;align-items:center">
            <input type="password" id="sv3-easy-pass" placeholder="••••••••" autocomplete="new-password" required ${isLockedEdit ? "disabled" : ""} style="padding-right:42px;width:100%" />
            <button type="button" class="password-toggle-btn" data-target="sv3-easy-pass" style="position:absolute;right:10px;background:none;border:none;cursor:pointer;color:var(--text3);padding:4px;display:flex;align-items:center;justify-content:center;transition:color 0.2s;outline:none" tabindex="-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </div>
          ${isEdit ? `<div class="sv3-field-hint">${t("setup.keep_pass")}</div>` : ""}
          <div class="sv3-field-hint" id="sv3-easy-requirement-hint"></div>
        </div>

          </div>
          <div class="sv3-form-panel">
        <div class="form-section-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
          ${t("setup.taager_section")}
        </div>
        <div class="form-group">
          <label>${t("setup.country_label")}</label>
          <input type="hidden" id="sv3-taager-country" value="${esc(selectedTaagerCountry)}" />
          <div class="sv3-country-grid">${renderCountryTabs()}</div>
          <div class="sv3-field-hint">${setupText("setup.country_hint", "Choose the Taager market used for login, exports, and order upload.")}</div>
        </div>
        <div class="form-group">
          <label>${setupText("setup.taager_merchant_id_label", "Taager merchant ID")} <span style="color:var(--danger)">*</span></label>
          <input type="text" id="sv3-taager-merchant-id" placeholder="${setupText("setup.taager_merchant_id_ph", "Example: 1944783")}" value="${esc(selectedTaagerMerchantId)}" autocomplete="off" inputmode="numeric" required ${isLockedEdit ? "disabled" : ""} />
          <div class="sv3-field-hint">${setupText("setup.taager_merchant_id_hint", "Find it in Taager profile: Profile > Merchant code. This ID is locked with the selected country.")}</div>
        </div>
        <div class="form-group">
          <label>${t("setup.taager_login_method")}</label>
          <input type="hidden" id="sv3-taager-login-method" value="${esc(selectedTaagerMethod)}" />
          <div class="sv3-tab-control">${renderMethodTabs()}</div>
          <div class="sv3-field-hint">${t("setup.taager_google_hint")}</div>
        </div>
        <div class="form-group" id="sv3-taager-email-group">
          <label>${t("setup.email_label")} <span style="color:var(--danger)">*</span></label>
          <input type="email" id="sv3-taager-email" placeholder="${t("setup.taager_email_ph")}" value="${esc(acc?.taagerEmail||acc?.taagerEmail||"")}" autocomplete="off" ${isLockedEdit ? "disabled" : ""} />
        </div>
        <div class="form-group" id="sv3-taager-phone-group">
          <label>${t("setup.taager_phone_label")} <span style="color:var(--danger)">*</span></label>
          <input type="tel" id="sv3-taager-phone" placeholder="${t("setup.taager_phone_ph")}" value="${esc(acc?.taagerPhone||"")}" autocomplete="off" ${isLockedEdit ? "disabled" : ""} />
        </div>
        <div class="form-group" id="sv3-taager-pass-group">
          <label>${t("setup.pass_label")} <span style="color:var(--danger)">*</span></label>
          <div style="position:relative;display:flex;align-items:center">
            <input type="password" id="sv3-taager-pass" placeholder="••••••••" autocomplete="new-password" ${isLockedEdit ? "disabled" : ""} style="padding-right:42px;width:100%" />
            <button type="button" class="password-toggle-btn" data-target="sv3-taager-pass" style="position:absolute;right:10px;background:none;border:none;cursor:pointer;color:var(--text3);padding:4px;display:flex;align-items:center;justify-content:center;transition:color 0.2s;outline:none" tabindex="-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </div>
          ${isEdit ? `<div class="sv3-field-hint">${t("setup.taager_pass_hint")}</div>` : ""}
        </div>
          </div>
        </div>

        <div id="sv3-form-err" class="notice-box danger mt-20" style="display:none">
          <span class="notice-icon">⚠️</span>
          <div class="notice-text" id="sv3-form-err-text">${t("setup.err_missing")}</div>
        </div>

        <div class="mt-28" style="display:flex;gap:12px">
          <button class="btn full-width" id="sv3-form-cancel">${t("setup.cancel_btn")}</button>
          <button class="btn btn-primary full-width" id="sv3-form-save">${isEdit ? t("setup.save_btn2") : t("setup.add_btn")}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const syncAccountTypeFields = () => {
      const type = document.getElementById("sv3-account-type")?.value === "static" ? "static" : "live";
      const staticPanel = document.getElementById("sv3-static-account-panel");
      const livePanel = document.getElementById("sv3-live-account-panel");
      if (staticPanel) staticPanel.style.display = type === "static" ? "" : "none";
      if (livePanel) livePanel.style.display = type === "static" ? "none" : "";
    };
    overlay.querySelectorAll("[data-account-type]").forEach(btn => {
      btn.addEventListener("click", () => {
        const input = document.getElementById("sv3-account-type");
        if (input) input.value = btn.dataset.accountType === "static" ? "static" : "live";
        overlay.querySelectorAll("[data-account-type]").forEach(tab => tab.classList.toggle("is-active", tab === btn));
        syncAccountTypeFields();
      });
    });
    syncAccountTypeFields();

    const syncTaagerLoginFields = () => {
      const method = document.getElementById("sv3-taager-login-method")?.value || "email";
      const emailGroup = document.getElementById("sv3-taager-email-group");
      const phoneGroup = document.getElementById("sv3-taager-phone-group");
      const passGroup = document.getElementById("sv3-taager-pass-group");
      const emailInput = document.getElementById("sv3-taager-email");
      const phoneInput = document.getElementById("sv3-taager-phone");
      const passInput = document.getElementById("sv3-taager-pass");
      const usesEmail = method === "email" || method === "google";
      const usesPhone = method === "phone";
      const usesPassword = method !== "google";
      if (emailGroup) emailGroup.style.display = usesEmail ? "" : "none";
      if (phoneGroup) phoneGroup.style.display = usesPhone ? "" : "none";
      if (passGroup) passGroup.style.display = usesPassword ? "" : "none";
      if (emailInput) {
        emailInput.required = usesEmail;
        if (!isLockedEdit) emailInput.disabled = !usesEmail;
      }
      if (phoneInput) {
        phoneInput.required = usesPhone;
        if (!isLockedEdit) phoneInput.disabled = !usesPhone;
      }
      if (passInput) {
        passInput.required = usesPassword;
        if (!isLockedEdit) passInput.disabled = !usesPassword;
      }
    };
    const easyOrdersRequired = () => {
      const provider = document.getElementById("sv3-dashboard-enrichment-provider")?.value === "easyorders" ? "easyorders" : "none";
      return !isTeamLeaderMode || provider === "easyorders";
    };
    const syncEasyOrderFields = () => {
      const required = easyOrdersRequired();
      const storeInput = document.getElementById("sv3-easy-store");
      const emailInput = document.getElementById("sv3-easy-email");
      const passInput = document.getElementById("sv3-easy-pass");
      const hint = document.getElementById("sv3-easy-requirement-hint");
      overlay.querySelectorAll("[data-easy-required-mark]").forEach(mark => {
        mark.style.display = required ? "" : "none";
      });
      if (storeInput) storeInput.required = required;
      if (emailInput) emailInput.required = required;
      if (passInput) passInput.required = required && !isEdit;
      if (hint) {
        hint.textContent = required
          ? setupText("setup.easy_required_hint", "EasyOrders store, email, and password are required for this account.")
          : setupText("setup.easy_optional_team_leader_hint", "Optional in Team Leader mode.");
      }
    };
    overlay.querySelectorAll("[data-taager-method]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (isLockedEdit) return;
        const input = document.getElementById("sv3-taager-login-method");
        if (input) input.value = btn.dataset.taagerMethod || "email";
        overlay.querySelectorAll("[data-taager-method]").forEach(tab => {
          tab.classList.toggle("is-active", tab === btn);
        });
        syncTaagerLoginFields();
      });
    });
    overlay.querySelectorAll("[data-taager-country]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (isLockedEdit) return;
        const input = document.getElementById("sv3-taager-country");
        if (input) input.value = btn.dataset.taagerCountry || "sa";
        overlay.querySelectorAll("[data-taager-country]").forEach(tab => {
          tab.classList.toggle("is-active", tab === btn);
        });
      });
    });
    overlay.querySelectorAll("[data-dashboard-enrichment-provider]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (isLockedEdit) return;
        const input = document.getElementById("sv3-dashboard-enrichment-provider");
        if (input) input.value = btn.dataset.dashboardEnrichmentProvider || "none";
        overlay.querySelectorAll("[data-dashboard-enrichment-provider]").forEach(tab => {
          tab.classList.toggle("is-active", tab === btn);
        });
        const hint = document.getElementById("sv3-enrichment-hint");
        if (hint) {
          hint.textContent = btn.dataset.dashboardEnrichmentProvider === "easyorders"
            ? setupText("setup.dashboard_enrichment_hint_easyorders", "Your dashboard will pull orders and profits from Taager, and also connect to EasyOrders to enrich product names and payment data. Best choice if you use both platforms.")
            : setupText("setup.dashboard_enrichment_hint_taager", "Your dashboard will use Taager as the only data source for orders, profits, and product info. Simple and fast — recommended if you don't use EasyOrders.");
        }
        syncEasyOrderFields();
      });
    });
    syncTaagerLoginFields();
    syncEasyOrderFields();

    overlay.querySelectorAll(".password-toggle-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPass = input.type === "password";
        input.type = isPass ? "text" : "password";

        // Toggle eye icon
        const svg = btn.querySelector("svg");
        if (isPass) {
          svg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
          btn.style.color = "var(--accent)";
        } else {
          svg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
          btn.style.color = "var(--text3)";
        }
      });
    });

    const close = () => overlay.remove();
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    document.getElementById("sv3-form-back")?.addEventListener("click", close);
    document.getElementById("sv3-form-cancel")?.addEventListener("click", close);

    document.getElementById("sv3-form-save")?.addEventListener("click", async () => {
      const accountType = document.getElementById("sv3-account-type")?.value === "static" ? "static" : "live";
      const staticName = (document.getElementById("sv3-static-name")?.value || "").trim();
      const easyEmail    = document.getElementById("sv3-easy-email").value.trim();
      const easyPassword = document.getElementById("sv3-easy-pass").value;
      const easyStore    = document.getElementById("sv3-easy-store").value.trim();
      const taagerLoginMethod = document.getElementById("sv3-taager-login-method")?.value || "email";
      const taagerEmail = document.getElementById("sv3-taager-email").value.trim();
      const taagerPhone = document.getElementById("sv3-taager-phone").value.trim();
      const taagerPassword = document.getElementById("sv3-taager-pass").value;
      const taagerCountry  = (document.getElementById("sv3-taager-country")?.value || "sa").toLowerCase();
      const taagerMerchantId = (document.getElementById("sv3-taager-merchant-id")?.value || "").trim();
      const dashboardEnrichmentProvider = document.getElementById("sv3-dashboard-enrichment-provider")?.value === "easyorders" ? "easyorders" : "none";
      const errEl        = document.getElementById("sv3-form-err");
      const errText      = document.getElementById("sv3-form-err-text");
      const saveBtn      = document.getElementById("sv3-form-save");

      const currentAccount = isEdit ? accounts.find(a => a.id === editId) : null;
      const nextEasyStore = isEdit ? (easyStore || currentAccount?.easyStore || "") : easyStore;
      const nextEasyEmail = isEdit ? (easyEmail || currentAccount?.easyEmail || "") : easyEmail;
      const nextTaagerEmail = isEdit ? (taagerEmail || currentAccount?.taagerEmail || "") : taagerEmail;
      const nextTaagerPhone = isEdit ? (taagerPhone || currentAccount?.taagerPhone || "") : taagerPhone;
      const nextTaagerMerchantId = isEdit ? (taagerMerchantId || currentAccount?.taagerAffiliateCode || "") : taagerMerchantId;

      if (accountType === "static" && !staticName) {
        errText.innerHTML = setupText("setup.static_name_required", "Account name is required.");
        errEl.style.display = "flex";
        return;
      }

      const needsPhone = taagerLoginMethod === "phone";
      const needsPassword = taagerLoginMethod !== "google";
      const hasTaagerLoginIdentity = needsPhone ? !!nextTaagerPhone : !!nextTaagerEmail;
      const needsEasyOrdersCredentials = !isTeamLeaderMode || dashboardEnrichmentProvider === "easyorders";
      if (accountType !== "static" && (!nextTaagerMerchantId || (needsEasyOrdersCredentials && (!nextEasyStore || !nextEasyEmail || (!isEdit && !easyPassword))) || (!isEdit && (!hasTaagerLoginIdentity || (needsPassword && !taagerPassword))))) {
        errText.innerHTML = t("setup.err_missing");
        errEl.style.display = "flex";
        return;
      }
      errEl.style.display = "none";
      saveBtn.textContent = t("setup.saving");
      saveBtn.disabled = true;

      const nextAccounts = accounts.map(a => ({ ...a }));
      let newAccountId = "";
      let accountPatch = null;

      if (isEdit) {
        accountPatch = accountType === "static" ? {
          label: staticName,
          memberName: "",
        } : {
          easyEmail: nextEasyEmail,
          easyStore: nextEasyStore,
          taagerLoginMethod,
          taagerEmail: nextTaagerEmail,
          taagerPhone: nextTaagerPhone,
          taagerCountry,
          taagerAffiliateCode: nextTaagerMerchantId,
          dashboardEnrichmentProvider,
          ...(easyPassword ? { easyPassword } : {}),
          ...(taagerPassword ? { taagerPassword } : {}),
        };
        const idx = nextAccounts.findIndex(a => a.id === editId);
        if (idx !== -1) {
          nextAccounts[idx] = {
            ...nextAccounts[idx],
            ...accountPatch,
          };
        }
        // NOTE: relockAccount is called AFTER save so that main.js
        // reads the already-updated credentials from store when computing the hash.
      } else {
        newAccountId = "account_" + Date.now();
        nextAccounts.push(accountType === "static" ? {
          id: newAccountId,
          accountType: "static",
          label: staticName,
          memberName: "",
          taagerCountry: "sa",
          dashboardEnrichmentProvider: "none",
        } : {
          id: newAccountId,
          accountType: "live",
          label: getNextLabel(),
          memberName: "",
          easyEmail,
          easyPassword,
          easyStore,
          taagerLoginMethod,
          taagerEmail,
          taagerPhone,
          taagerPassword,
          taagerCountry,
          taagerAffiliateCode: nextTaagerMerchantId,
          dashboardEnrichmentProvider,
        });
      }

      const result = isEdit && window.api.updateAccount
        ? await window.api.updateAccount({ accountId: editId, patch: accountPatch })
        : await window.api.saveAllAccounts(nextAccounts);

      if (result && result.success === false) {
        saveBtn.textContent = isEdit ? t("setup.save_btn2") : t("setup.add_btn");
        saveBtn.disabled = false;
        errText.innerHTML = result.reason === "account_locked"
          ? t("setup.err_locked")
          : result.reason === "easy_store_required" || result.reason === "easy_credentials_required" || result.reason === "taager_email_required" || result.reason === "taager_phone_required" || result.reason === "taager_password_required"
          ? t("setup.err_missing")
          : result.reason === "taager_merchant_id_required"
          ? setupText("setup.taager_merchant_id_required", "Taager merchant ID is required.")
          : result.reason === "remote_slots_full"
          ? setupText("setup.remote_slots_full", "This license already has account slots on the server. Re-add the same Taager merchant/account details to re-link them, or ask admin to clear stale slots.")
          : result.reason === "limit_reached"
          ? t("setup.limit_reached")
          : (result.reason || t("setup.save_failed"));
        errEl.style.display = "flex";
        return;
      }

      // Re-lock AFTER save so main.js reads the updated credentials from store
      if (isEdit) {
        await window.api.relockAccount({ accountId: editId });
      }

      close();
      if (newAccountId && accountType !== "static" && !selectedIds.includes(newAccountId)) selectedIds.push(newAccountId);
      await refreshAccountStateAfterMutation("accounts-updated");
      renderStep();
    });

    // Enter key support
    overlay.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("sv3-form-save")?.click(); });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function normalizeEmailForCompare(value) {
    return String(value || "").trim().toLowerCase();
  }

  function accountUiLabel(acc) {
    if (!acc) return t("setup.account_fallback");
    return acc.memberName || acc.easyEmail || acc.email || acc.taagerEmail || acc.easyStore || acc.storeName || acc.label || acc.name || t("setup.account_fallback");
  }

  function accountEmailLine(acc) {
    if (acc && acc.accountType === "static") return setupText("setup.static_account", "Static Account");
    if (!acc) return "—";
    return acc.easyEmail || acc.email || acc.taagerEmail || "—";
  }

  function accountInitial(acc) {
    const label = accountUiLabel(acc).trim();
    if (!label) return "A";
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length > 1 && /^[A-Za-z]/.test(words[0]) && /^[A-Za-z]/.test(words[1])) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return label.slice(0, 1).toUpperCase();
  }

  function showConfirm(title, message, confirmText, cancelText) {
    if (window.TaagerUI && typeof window.TaagerUI.confirm === "function") {
      return window.TaagerUI.confirm({
        title,
        message,
        confirmText,
        cancelText,
        danger: true
      });
    }

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:9999;";
      overlay.innerHTML = `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:28px;width:380px;text-align:center">
          <div style="font-size:18px;font-weight:800;margin-bottom:8px">${title}</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:24px;line-height:1.5">${message}</div>
          <div style="display:flex;gap:10px;justify-content:center">
            <button id="dlg-cancel" class="btn btn-ghost">${cancelText}</button>
            <button id="dlg-confirm" class="btn btn-danger">${confirmText}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      document.getElementById("dlg-confirm").addEventListener("click", () => { overlay.remove(); resolve(true); });
      document.getElementById("dlg-cancel").addEventListener("click",  () => { overlay.remove(); resolve(false); });
    });
  }

  // ── Register in-place re-renderer for language switches ──
  // Called by app.js reRenderCurrentPage() when lang changes on this page.
  // Re-renders only the current step content without resetting step state.
  window._renderSetupInPlace = function() {
    renderShell(); // rebuilds sidebar + content; renderStep() is called inside
  };

  loadAccounts();
};

// ══════════════════════════════════════════════════════
// ── Fast Custom Calendar — copied from welcome.js ──
// ══════════════════════════════════════════════════════

function buildCalendar(container, initial, maxDate, onChange) {
  const parseLocal = (str) => {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const maxD   = parseLocal(maxDate);
  let selected = parseLocal(initial);
  let viewYear  = selected.getFullYear();
  let viewMonth = selected.getMonth();

  const DAYS   = window._t("calendar.days");
  const MONTHS = window._t("calendar.months");

  function render() {
    const selStr    = _formatDateLocal(selected);
    const maxStr    = _formatDateLocal(maxD);
    const todayStr2 = _formatDateLocal(new Date());

    const firstDay  = new Date(viewYear, viewMonth, 1);
    const lastDay   = new Date(viewYear, viewMonth + 1, 0);
    const startDow  = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const maxYear  = maxD.getFullYear();
    const maxMonth = maxD.getMonth();
    const canNext  = viewYear < maxYear || (viewYear === maxYear && viewMonth < maxMonth);
    const minYear  = new Date().getFullYear() - 5;
    const canPrev  = viewYear > minYear || (viewYear === minYear && viewMonth > 0);

    let cells = "";
    for (let i = 0; i < startDow; i++) {
      cells += `<div class="fc-cell fc-empty"></div>`;
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const isSel  = dateStr === selStr;
      const isTdy  = dateStr === todayStr2;
      const isDis  = dateStr > maxStr;
      let cls = "fc-cell fc-day";
      if (isSel)      cls += " fc-selected";
      else if (isTdy) cls += " fc-today";
      if (isDis)      cls += " fc-disabled";
      cells += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
    }

    container.innerHTML = `
      <div class="fc-wrap">
        <div class="fc-header">
          <button class="fc-nav" data-dir="-1"${canPrev ? "" : " disabled"}>&#8249;</button>
          <span class="fc-month-label">${MONTHS[viewMonth]} ${viewYear}</span>
          <button class="fc-nav" data-dir="1"${canNext ? "" : " disabled"}>&#8250;</button>
        </div>
        <div class="fc-grid">
          ${DAYS.map(d => `<div class="fc-cell fc-weekday">${d}</div>`).join("")}
          ${cells}
        </div>
        <div class="fc-selected-display">${selStr}</div>
      </div>
    `;

    container.querySelector(".fc-grid").addEventListener("click", (e) => {
      const cell = e.target.closest(".fc-day");
      if (!cell || cell.classList.contains("fc-disabled")) return;
      selected = parseLocal(cell.dataset.date);
      render();
      onChange(cell.dataset.date);
    });

    container.querySelectorAll(".fc-nav").forEach(btn => {
      btn.addEventListener("click", () => {
        viewMonth += parseInt(btn.dataset.dir);
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
        render();
      });
    });
  }

  render();
}

function buildRangeCalendar(container, fromInitial, toInitial, maxDate, onChange) {
  const parseLocal = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };
  const label = (key, fallbackEn, fallbackAr) => {
    const lang = window._kbotLang || document.documentElement.lang || "en";
    return lang === "ar" ? fallbackAr : fallbackEn;
  };

  const maxD = parseLocal(maxDate) || new Date();
  const startD = parseLocal(fromInitial) || maxD;
  let from = fromInitial || "";
  let to = toInitial || "";
  let hovered = "";
  let hoverTimer = null;
  let selectingEnd = !!from && !to;
  let viewYear = startD.getFullYear();
  let viewMonth = startD.getMonth();

  const DAYS = window._t("calendar.days");
  const MONTHS = window._t("calendar.months");

  function render() {
    const maxStr = _formatDateLocal(maxD);
    const todayStr2 = _formatDateLocal(new Date());
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startDow = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const maxYear = maxD.getFullYear();
    const maxMonth = maxD.getMonth();
    const canNext = viewYear < maxYear || (viewYear === maxYear && viewMonth < maxMonth);
    const minYear = new Date().getFullYear() - 5;
    const canPrev = viewYear > minYear || (viewYear === minYear && viewMonth > 0);
    const previewEnd = hovered || to;

    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<button class="fc-cell fc-day fc-empty" disabled></button>`;
    for (let d = 1; d <= totalDays; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const selected = iso === from || iso === to;
      const inRange = from && previewEnd
        ? (to ? iso > from && iso < to : iso > from && iso <= previewEnd)
        : false;
      const disabled = iso > maxStr || (selectingEnd && from && iso < from);
      let cls = "fc-cell fc-day";
      if (selected) cls += " fc-selected";
      if (iso === todayStr2 && !selected) cls += " fc-today";
      if (inRange && !selected) cls += " fc-in-range";
      if (iso === from && to) cls += " fc-range-start";
      if (iso === to) cls += " fc-range-end";
      if (disabled) cls += " fc-disabled";
      cells += `<button class="${cls}" data-date="${iso}" ${disabled ? "disabled" : ""}>${d}</button>`;
    }

    const hint = selectingEnd && from
      ? label("rangeEnd", "Now click an end date", "اختر تاريخ النهاية")
      : label("rangeStart", "Click a start date", "اختر تاريخ البداية");
    const clear = label("rangeClear", "Clear range", "مسح النطاق");

    container.innerHTML = `
      <div class="fc-range-shell">
        <div class="fc-range-status">
          <div class="fc-range-status-part">
            <span>${window._t("setup.start_date")}</span>
            <strong class="${from ? "active" : ""}">${from || "—"}</strong>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
          <div class="fc-range-status-part end">
            <span>${window._t("setup.end_date")}</span>
            <strong class="${to ? "active" : ""}">${to || "—"}</strong>
          </div>
        </div>
        <div class="fc-range-hint">▸ ${hint}</div>
        <div class="fc-wrap">
          <div class="fc-header">
            <button class="fc-nav" data-dir="-1"${canPrev ? "" : " disabled"}>&#8249;</button>
            <span class="fc-month-label">${MONTHS[viewMonth]} ${viewYear}</span>
            <button class="fc-nav" data-dir="1"${canNext ? "" : " disabled"}>&#8250;</button>
          </div>
          <div class="fc-grid">
            ${DAYS.map(d => `<div class="fc-cell fc-weekday">${d}</div>`).join("")}
            ${cells}
          </div>
        </div>
        ${(from || to) ? `<button class="fc-clear-range" type="button">× ${clear}</button>` : ""}
      </div>
    `;

    function selectRangeDate(iso) {
      if (!iso) return;
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      if (!from || (from && to)) {
        from = iso;
        to = "";
        selectingEnd = true;
      } else if (selectingEnd) {
        if (iso < from) {
          from = iso;
          to = "";
          selectingEnd = true;
        } else {
          to = iso;
          selectingEnd = false;
        }
      } else {
        from = iso;
        to = "";
        selectingEnd = true;
      }
      hovered = "";
      onChange(from, to);
      render();
    }

    container.querySelector(".fc-grid").addEventListener("pointerdown", (e) => {
      const cell = e.target.closest(".fc-day");
      if (!cell || cell.classList.contains("fc-disabled") || cell.classList.contains("fc-empty")) return;
      e.preventDefault();
      selectRangeDate(cell.dataset.date);
    });

    container.querySelector(".fc-grid").addEventListener("mouseover", (e) => {
      const cell = e.target.closest(".fc-day");
      if (!cell || cell.classList.contains("fc-disabled") || cell.classList.contains("fc-empty")) return;
      if (selectingEnd && from && !to) {
        const nextHover = cell.dataset.date;
        if (nextHover === hovered) return;
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          hovered = nextHover;
          hoverTimer = null;
          render();
        }, 90);
      }
    });
    container.querySelector(".fc-grid").addEventListener("mouseleave", () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      if (hovered) {
        hovered = "";
        render();
      }
    });
    container.querySelectorAll(".fc-nav").forEach(btn => {
      btn.addEventListener("click", () => {
        viewMonth += parseInt(btn.dataset.dir);
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        render();
      });
    });
    container.querySelector(".fc-clear-range")?.addEventListener("click", () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      from = "";
      to = "";
      hovered = "";
      selectingEnd = false;
      onChange("", "");
      render();
    });
  }

  render();
}

function injectCalendarStyles() {
  if (document.getElementById("fast-cal-styles")) return;
  const s = document.createElement("style");
  s.id = "fast-cal-styles";
  s.textContent = `
    .fast-cal { width:100%; }
    .sv3-date-range-single {
      max-width: 340px;
      margin: 0 auto;
    }
    .fc-wrap {
      background: rgba(16,23,36,.62);
      border:1px solid rgba(125,148,186,.2);
      border-radius:12px;
      padding:14px 14px 10px;
      user-select:none;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }
    .fc-range-shell {
      display:flex;
      flex-direction:column;
      gap:10px;
    }
    .fc-range-status {
      display:flex;
      align-items:center;
      gap:10px;
      padding:8px 12px;
      background:rgba(16,23,36,.62);
      border:1px solid rgba(125,148,186,.2);
      border-radius:8px;
      color:var(--text3);
    }
    .fc-range-status-part {
      flex:1;
      min-width:0;
      display:flex;
      align-items:center;
      gap:6px;
    }
    .fc-range-status-part.end {
      justify-content:flex-end;
    }
    .fc-range-status-part span {
      font-size:11px;
      color:var(--text3);
      font-weight:700;
    }
    .fc-range-status-part strong {
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      font-size:13px;
      color:var(--text3);
    }
    .fc-range-status-part strong.active {
      color:var(--accent);
    }
    .fc-range-hint {
      font-size:11px;
      color:var(--text3);
      font-weight:700;
    }
    .fc-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-bottom:12px;
    }
    .fc-month-label { font-size:14px;font-weight:800;color:var(--text); }
    .fc-nav {
      background:rgba(16,23,36,.62);
      border:1px solid rgba(125,148,186,.2);
      border-radius:8px;
      color:#b9c4d8;
      cursor:pointer;
      font-size:18px;
      line-height:1;
      width:32px;
      height:32px;
      padding:0;
      transition:background 0.1s,color 0.1s;
    }
    .fc-nav:hover:not(:disabled) { background:rgba(124,106,247,.28);color:#fff;border-color:rgba(167,139,250,.48); }
    .fc-nav:disabled { opacity:0.3;cursor:default; }
    .fc-grid { display:grid;grid-template-columns:repeat(7,1fr);gap:2px; }
    .fc-cell {
      aspect-ratio:1;
      min-height:32px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:13px;
      border-radius:8px;
      min-width:0;
    }
    .fc-weekday {
      min-height:22px;
      aspect-ratio:auto;
      font-size:10px;
      font-weight:800;
      color:#9aa7bc;
      text-transform:uppercase;
      letter-spacing:.04em;
    }
    .fc-day {
      cursor:pointer;
      color:#c3cbdb;
      transition:background 0.07s, color 0.07s, transform 0.07s;
      border:0;
      background:transparent;
      font-family:inherit;
      font-weight:600;
    }
    .fc-day:hover:not(.fc-disabled):not(.fc-selected):not(.fc-empty) {
      background:rgba(79,142,247,0.15);
      color:var(--text);
      transform:scale(1.05);
    }
    .fc-today {
      color:#8ab8ff;
      font-weight:800;
      position:relative;
    }
    .fc-today::after {
      content:"";
      position:absolute;
      left:50%;
      bottom:4px;
      width:4px;
      height:4px;
      border-radius:999px;
      background:var(--accent);
      transform:translateX(-50%);
    }
    .fc-selected {
      background:linear-gradient(135deg,#8b5cf6,#4f8ef7)!important;
      color:#fff!important;
      font-weight:800;
      box-shadow:0 2px 10px rgba(99,102,241,.36);
      transform:scale(1.05);
    }
    .fc-in-range:not(.fc-selected) {
      background:rgba(124,106,247,.18);
      color:var(--text);
      border-radius:0;
    }
    .fc-range-start:not(.fc-selected) { border-radius:8px 0 0 8px; }
    .fc-range-end:not(.fc-selected) { border-radius:0 8px 8px 0; }
    .fc-disabled { opacity:0.25;cursor:default; }
    .fc-empty { visibility:hidden; }
    .fc-clear-range {
      align-self:flex-start;
      background:transparent;
      border:0;
      color:var(--text3);
      cursor:pointer;
      font-size:12px;
      font-weight:700;
      padding:2px 0;
      transition:color .1s;
    }
    .fc-clear-range:hover {
      color:var(--danger);
    }
    .fc-selected-display {
      margin-top:6px;
      text-align:center;
      font-size:11px;
      color:#99aac5;
      font-variant-numeric:tabular-nums;
      letter-spacing:0;
    }
    [data-theme="light"] .fc-wrap {
      background: var(--bg2);
      border-color: var(--border);
      box-shadow: 0 2px 10px rgba(0,0,0,.03);
    }
    [data-theme="light"] .fc-range-status {
      background: var(--bg2);
      border-color: var(--border);
    }
    [data-theme="light"] .fc-nav {
      background: var(--bg);
      border-color: var(--border);
      color: var(--text3);
    }
    [data-theme="light"] .fc-nav:hover:not(:disabled) {
      background: var(--bg3);
      color: var(--text);
      border-color: var(--accent);
    }
    [data-theme="light"] .fc-month-label { color: var(--text); }
    [data-theme="light"] .fc-weekday { color: var(--text3); }
    [data-theme="light"] .fc-day { color: var(--text2); }
    [data-theme="light"] .fc-day:hover:not(.fc-disabled) {
      background: rgba(124,106,247,.1);
      color: var(--accent);
    }
    [data-theme="light"] .fc-today {
      background: rgba(124,106,247,.08);
      color: var(--accent);
    }
    [data-theme="light"] .fc-selected-display { color: var(--text2); }
  `;
  document.head.appendChild(s);
}

function _formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
