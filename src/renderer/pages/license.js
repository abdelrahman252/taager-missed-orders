// LICENSE PAGE
window.renderLicense = function (onUnlocked) {
  function render() {
  const t  = window._t;
  const el = document.getElementById("page-license");

  function licenseText(key, fallback) {
    const value = t(key);
    return value && value !== key ? value : fallback;
  }

  el.innerHTML = `
    <div style="
      display:flex;align-items:center;justify-content:center;
      height:100%;background:var(--bg);
      background-image:radial-gradient(ellipse at 50% 0%, rgba(124,106,247,0.12) 0%, transparent 60%);
    ">
      <div style="width:460px;text-align:center;padding:0 20px">

        <div style="margin-bottom:28px;position:relative;display:inline-block">
          <div style="
            width:88px;height:88px;border-radius:50%;
            background:linear-gradient(135deg,#7c6af7 0%,#4f8ef7 100%);
            display:flex;align-items:center;justify-content:center;
            font-size:38px;margin:0 auto;
            box-shadow:0 0 40px rgba(124,106,247,0.45);
            animation:lic-pulse 2.5s ease-in-out infinite;
          ">&#128274;</div>
        </div>

        <div style="font-size:26px;font-weight:800;color:var(--text);margin-bottom:8px;letter-spacing:-0.5px">
          ${t("license.title")}
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:6px">
          ${t("license.subtitle")}
        </div>
        <div id="lic-days-badge" style="
          display:inline-block;background:rgba(124,106,247,0.15);
          border:1px solid rgba(124,106,247,0.4);color:#a89cf7;
          font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
          padding:4px 14px;border-radius:99px;margin-bottom:28px;
        "> </div>

        <div style="
          background:var(--bg2);border:1px solid var(--border);
          border-radius:var(--radius);padding:24px;margin-bottom:16px;
          text-align:left;
        ">
          <label style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:10px">
            ${t("license.key_label")}
          </label>
          <input
            id="lic-input"
            type="text"
            placeholder="TAAGER-XXXX-XXXX-XXXX-XXXX"
            autocomplete="off"
            spellcheck="false"
            style="
              width:100%;box-sizing:border-box;
              background:var(--bg);border:1px solid var(--border);
              border-radius:8px;padding:12px 14px;
              font-size:14px;font-family:monospace;color:var(--text);
              letter-spacing:.06em;outline:none;
              transition:border-color 0.2s;
            "
          />
          <div id="lic-error" style="
            display:none;margin-top:10px;
            color:var(--danger);font-size:12px;font-weight:600;
            padding:8px 12px;background:rgba(255,77,109,0.1);
            border-radius:6px;border:1px solid rgba(255,77,109,0.25);
          "></div>
        </div>

        <button id="lic-btn" style="
          width:100%;padding:14px;border:none;border-radius:10px;cursor:pointer;
          background:linear-gradient(135deg,#7c6af7,#4f8ef7);
          color:#fff;font-size:15px;font-weight:700;
          box-shadow:0 4px 20px rgba(124,106,247,0.4);
          transition:opacity 0.2s,transform 0.15s;
          margin-bottom:10px;
        " onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
          ${t("license.btn_activate")}
        </button>

        <button id="lic-support-btn" type="button" style="
          width:100%;padding:12px;border-radius:10px;cursor:pointer;
          background:transparent;border:1px solid var(--border);
          color:var(--text2);font-size:13px;font-weight:800;
          transition:border-color 0.2s,color 0.2s;
          margin-bottom:18px;
        ">
          ${licenseText("license.btn_support", "Contact Support")}
        </button>

        <div id="lic-restore-box" style="
          display:none;background:rgba(0,214,143,0.08);border:1px solid rgba(0,214,143,0.28);
          border-radius:10px;padding:14px;text-align:left;margin-bottom:16px;
        ">
          <div id="lic-restore-title" style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:6px"></div>
          <div id="lic-restore-body" style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px"></div>
          <div style="display:flex;gap:8px">
            <button id="lic-restore-btn" type="button" style="
              flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;
              background:#00b370;color:white;font-size:13px;font-weight:800;
            "></button>
            <button id="lic-skip-restore-btn" type="button" style="
              flex:1;padding:10px;border-radius:8px;cursor:pointer;
              background:transparent;border:1px solid var(--border);color:var(--text2);font-size:13px;font-weight:800;
            "></button>
          </div>
        </div>

        <div style="font-size:11px;color:var(--text2);line-height:1.7">
          ${t("license.support_hint")}<br>
          ${t("license.device_hint")}
        </div>

      </div>
    </div>

    <style>
      @keyframes lic-pulse {
        0%,100% { box-shadow:0 0 30px rgba(124,106,247,0.35); transform:scale(1); }
        50%      { box-shadow:0 0 55px rgba(124,106,247,0.65); transform:scale(1.05); }
      }
      #lic-input:focus { border-color:#7c6af7 !important; box-shadow:0 0 0 3px rgba(124,106,247,0.2); }
      @keyframes lic-shake {
        0%,100% { transform:translateX(0); }
        20%      { transform:translateX(-6px); }
        40%      { transform:translateX(6px); }
        60%      { transform:translateX(-4px); }
        80%      { transform:translateX(4px); }
      }
    </style>
  `;

  const input = document.getElementById("lic-input");
  const btn   = document.getElementById("lic-btn");
  const supportBtn = document.getElementById("lic-support-btn");
  const errEl = document.getElementById("lic-error");
  const restoreBox = document.getElementById("lic-restore-box");
  const restoreTitle = document.getElementById("lic-restore-title");
  const restoreBody = document.getElementById("lic-restore-body");
  const restoreBtn = document.getElementById("lic-restore-btn");
  const skipRestoreBtn = document.getElementById("lic-skip-restore-btn");

  function showError(msg) {
    errEl.textContent = msg;
    errEl.style.display = "block";
    input.style.borderColor = "var(--danger)";
    input.style.animation = "none";
    setTimeout(() => { input.style.animation = "lic-shake 0.35s ease"; }, 10);
  }
  function clearError() { errEl.style.display = "none"; input.style.borderColor = "var(--border)"; }

  function showCredentialRestorePrompt(status) {
    if (!restoreBox) return false;
    const count = status && status.accountCount ? Number(status.accountCount) : 0;
    restoreTitle.textContent = licenseText("license.restore_title", "Saved credentials found");
    restoreBody.textContent = licenseText("license.restore_body", `Restore ${count || "your"} saved Taager/EasyOrders account credential${count === 1 ? "" : "s"} on this device. Orders and local reports will stay local to each machine.`);
    restoreBtn.textContent = licenseText("license.restore_btn", "Restore credentials");
    skipRestoreBtn.textContent = licenseText("license.restore_skip", "Skip for now");
    restoreBox.style.display = "block";
    return true;
  }

  input.addEventListener("input", clearError);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
  supportBtn?.addEventListener("click", () => {
    if (window.TaagerSupport && typeof window.TaagerSupport.open === "function") window.TaagerSupport.open();
  });
  skipRestoreBtn?.addEventListener("click", () => onUnlocked());
  restoreBtn?.addEventListener("click", async () => {
    restoreBtn.disabled = true;
    skipRestoreBtn.disabled = true;
    restoreBtn.textContent = licenseText("license.restore_working", "Restoring...");
    const restored = window.api.restoreLicenseCredentials
      ? await window.api.restoreLicenseCredentials()
      : { success: false, reason: "restore_unavailable" };
    if (restored && restored.success) {
      restoreBtn.textContent = licenseText("license.restore_done", "Restored");
      setTimeout(() => onUnlocked(), 350);
      return;
    }
    restoreBtn.disabled = false;
    skipRestoreBtn.disabled = false;
    restoreBtn.textContent = licenseText("license.restore_btn", "Restore credentials");
    showError((restored && restored.reason) || licenseText("license.restore_failed", "Could not restore saved credentials."));
  });

  btn.addEventListener("click", async () => {
    const key = input.value.trim();
    if (!key) { showError(t("license.err_empty")); return; }
    btn.textContent = t("license.btn_verifying");
    btn.disabled = true;

    const result = await window.api.submitLicense(key);

    if (result.success) {
      btn.textContent = t("license.btn_activated");
      btn.style.background = "linear-gradient(135deg,#00d68f,#00b370)";
      btn.style.boxShadow = "0 4px 20px rgba(0,214,143,0.4)";
      if (result.daysLeft != null) {
        const badge = document.getElementById("lic-days-badge");
        if (badge) { const daysFn = t("license.days_remaining");
          badge.textContent = typeof daysFn === "function" ? daysFn(result.daysLeft) : daysFn; }
      }
      let backupStatus = null;
      try {
        backupStatus = window.api.getLicenseCredentialBackupStatus
          ? await window.api.getLicenseCredentialBackupStatus()
          : null;
      } catch (_) {}
      if (backupStatus && backupStatus.available) {
        showCredentialRestorePrompt(backupStatus);
        return;
      }
      setTimeout(() => onUnlocked(), 900);
    } else {
      btn.textContent = t("license.btn_activate");
      btn.disabled = false;
      showError(result.reason || t("license.err_invalid"));
    }
  });
  }

  window._renderLicenseInPlace = render;
  render();
};