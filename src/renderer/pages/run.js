// ── RUN PAGE ──

// ════════════════════════════════════════
// SOUND ENGINE
// ════════════════════════════════════════
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = {
      confirm: [
        { freq: 880, dur: 0.12, start: 0,    vol: 0.4 },
        { freq: 880, dur: 0.12, start: 0.18, vol: 0.4 },
      ],
      error: [
        { freq: 280, dur: 0.18, start: 0,    vol: 0.5 },
        { freq: 240, dur: 0.18, start: 0.22, vol: 0.5 },
        { freq: 200, dur: 0.25, start: 0.44, vol: 0.6 },
      ],
      success: [
        { freq: 523, dur: 0.1,  start: 0,    vol: 0.3 },
        { freq: 659, dur: 0.1,  start: 0.12, vol: 0.3 },
        { freq: 784, dur: 0.2,  start: 0.24, vol: 0.35 },
      ],
    };
    const tones = sounds[type] || sounds.confirm;
    tones.forEach(({ freq, dur, start, vol }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0,   ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch {}
}

// ════════════════════════════════════════
// GLOBAL COOLDOWN — 6 min after each run
// ════════════════════════════════════════
if (!window._cooldownUntil) window._cooldownUntil = 0;

function startGlobalCooldown() {
  window._cooldownUntil = Date.now() + 6 * 60 * 1000;
}

function getCooldownRemaining() {
  return Math.max(0, window._cooldownUntil - Date.now());
}

function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ════════════════════════════════════════
// RUN PAGE
// ════════════════════════════════════════
window.renderRun = function (dateFrom, dateTo, selectedAccountIds, onComplete, onHome) {
  window._botIsRunning = true;
  const t = window._t;
  const el = document.getElementById("page-run");
  const isMulti = Array.isArray(selectedAccountIds) && selectedAccountIds.length > 1;
  const dateDisplay = dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;

  function safeFilenamePart(value) {
    return (value || "account").toString().trim().replace(/[^a-zA-Z0-9@._-]/g, "_") || "account";
  }

  function accountDisplayName(acc, fallback = "") {
    if (!acc) return fallback;
    return acc.memberName || acc.easyEmail || acc.email || acc.taagerEmail || acc.easyStore || acc.storeName || acc.label || acc.name || fallback;
  }

  function selectedAccountEmailTag() {
    const accounts = window._kbotAccounts || [];
    const id = Array.isArray(selectedAccountIds) && selectedAccountIds.length === 1 ? selectedAccountIds[0] : null;
    const acc = id ? accounts.find(a => a.id === id) : accounts[0];
    return safeFilenamePart((acc && (acc.easyEmail || acc.email || acc.taagerEmail || acc.label || acc.id)) || id || "account");
  }

  function runDateTag() {
    return (dateFrom === dateTo ? dateFrom : dateFrom + "_" + dateTo).replace(/-/g, "");
  }

  // ─────────────────────────────────────
  // SINGLE ACCOUNT — original layout (untouched)
  // ─────────────────────────────────────
  if (!isMulti) {
    const phaseNames = [
      t("run.phase0"), t("run.phase1"), t("run.phase2"), t("run.phase3"), t("run.phase4")
    ];

    el.innerHTML = `
      <div class="sv3-shell" style="height:100%;">
        ${typeof renderSharedSidebar === "function" ? renderSharedSidebar("run") : ""}
        <div class="sv3-main" style="flex:1;overflow-y:auto;overflow-x:hidden;min-width:0;display:flex;flex-direction:column;position:relative;padding:18px 26px;">
          <div class="page-wrap"><div class="page-inner" style="display:flex;flex-direction:column;gap:12px;height:100%">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div class="page-title" style="font-size:20px" data-i18n="run.title">${t("run.title")}</div>
            <div class="text-muted text-sm">📅 ${dateDisplay}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="badge badge-accent" id="run-status-badge">${t("run.starting")}</div>
            <button class="btn btn-danger" id="btn-stop" style="font-size:12px;padding:6px 14px">${t("run.stop")}</button>
            <button class="btn btn-ghost" id="btn-home-run" style="font-size:12px;padding:6px 14px;opacity:0.35;cursor:not-allowed" disabled>${t("run.home")}</button>
          </div>
        </div>

        <!-- Cooldown bar -->
        <div id="global-cooldown-bar" style="display:none;background:rgba(124,106,247,0.1);border:1px solid #7c6af7;border-radius:var(--radius);padding:10px 16px;align-items:center;gap:12px">
          <span style="font-size:16px">⏳</span>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;color:#a89cf7">${t("run.cooldown_label")}</div>
            <div style="font-size:11px;color:var(--text2)">${t("run.cooldown_next")} <strong id="cooldown-timer" style="color:#a89cf7">6:00</strong></div>
          </div>
          <div style="width:120px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
            <div id="cooldown-bar-fill" style="height:100%;background:#7c6af7;width:100%;transition:width 1s linear"></div>
          </div>
        </div>

        <!-- Step tabs -->
        <div class="run-step-tabs">
          <button class="run-step-tab active" id="tab-status" onclick="window._runSwitchTab('status')">
            ${t("run.tab_status")}
          </button>
          <button class="run-step-tab" id="tab-log" onclick="window._runSwitchTab('log')">
            ${t("run.tab_log")} <span class="tab-badge" id="log-badge">0</span>
          </button>
        </div>

        <!-- TAB 1: Status & Progress -->
        <div id="run-tab-status" style="display:grid;grid-template-columns:300px 1fr;gap:14px;flex:1;min-height:0;overflow:hidden">

          <!-- Left: Phases + notices -->
          <div style="display:flex;flex-direction:column;gap:10px;overflow-y:auto;min-height:0">

            <!-- Phase status -->
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
              <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">${t("run.phases_header")}</div>
              <div style="display:flex;flex-direction:column;gap:6px" id="phases-grid">
                ${phaseNames.map((name, i) => `
                  <div class="status-row" id="phase-${i}" style="margin-bottom:0;padding:10px 12px">
                    <div class="status-dot" id="dot-${i}"></div>
                    <div style="flex:1">
                      <div style="font-size:12px;font-weight:600">${name}</div>
                      <div class="text-sm text-muted" id="phase-label-${i}">${t("run.waiting")}</div>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>

            <!-- 2FA Notice -->
            <div class="notice-box warn" id="notice-2fa" style="display:none">
              <span class="notice-icon">🔐</span>
              <div class="notice-text">
                <strong>${t("run.2fa_title")}</strong>
                <span>${t("run.2fa_msg")}</span>
              </div>
            </div>

            <!-- Google Login Notice -->
            <div class="notice-box warn" id="notice-google-login" style="display:none;border-color:#4285f4;background:rgba(66,133,244,0.1)">
              <span class="notice-icon">🌐</span>
              <div class="notice-text">
                <strong>Google Login Required</strong>
                <span id="notice-google-login-text">Chrome opened with this bot profile. Log in with Google, then close Chrome. The app will auto-check; Done is backup.</span>
                <button class="btn-primary" id="btn-google-login-done" type="button" style="margin-top:8px;width:max-content;padding:8px 12px;font-size:12px">I finished Google login</button>
              </div>
            </div>

            <!-- Manual Confirm Notice -->
            <div class="notice-box warn" id="notice-confirm" style="display:none;border-color:var(--warning);background:rgba(255,201,77,0.12)">
              <span class="notice-icon">👀</span>
              <div class="notice-text">
                <strong>${t("run.confirm_title")}</strong>
                <span>${t("run.confirm_msg")}</span>
              </div>
            </div>

            <!-- Taager Restart Notice -->
            <div class="notice-box warn" id="notice-taager-restart" style="display:none;border-color:#ff6b35;background:rgba(255,107,53,0.1)">
              <span class="notice-icon">🔄</span>
              <div class="notice-text" style="flex:1">
                <strong>${t("run.restart_title")}</strong>
                <div id="taager-restart-reason" style="font-size:11px;color:var(--text2);margin-top:3px"></div>
                <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
                  <div style="font-size:13px;color:#ff6b35;font-weight:700">${t("run.restart_wait")} <span id="taager-restart-timer" style="font-family:monospace">6:00</span></div>
                  <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                    <div id="taager-restart-bar" style="height:100%;background:#ff6b35;width:100%;transition:width 1s linear;border-radius:2px"></div>
                  </div>
                  <div id="taager-restart-attempt" style="font-size:10px;color:var(--text2)"></div>
                </div>
              </div>
            </div>

            <!-- Rate Limit -->
            <div class="notice-box warn" id="notice-cooldown" style="display:none;border-color:#7c6af7;background:rgba(124,106,247,0.1)">
              <span class="notice-icon">⏸️</span>
              <div class="notice-text">
                <strong>${t("run.ratelimit_title")}</strong>
                <span id="cooldown-msg"></span>
              </div>
            </div>

          </div>

          <!-- Right: Upload progress + orders table -->
          <div style="display:flex;flex-direction:column;gap:12px;overflow-y:auto;min-height:0">

            <!-- Upload progress LARGE -->
            <div class="upload-progress-large" id="upload-progress-panel" style="display:none">
              <div class="upl-header">
                <div>
                  <div class="upl-title">${t("run.creating")}</div>
                  <div class="upl-count"><span id="upload-ok">0</span> <span style="font-size:16px;color:var(--text2);font-weight:400">/ <span id="upload-total">0</span></span></div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:4px">${t("run.acc_status_col")}</div>
                  <div style="display:flex;gap:14px;align-items:center">
                    <span style="color:var(--success);font-weight:700;font-size:14px">✅ <span id="upload-success-count">0</span></span>
                    <span style="color:var(--danger);font-weight:700;font-size:14px">❌ <span id="upload-fail-count">0</span></span>
                  </div>
                </div>
              </div>
              <div class="upl-bar-track">
                <div class="upl-bar-fill" id="upload-progress-bar" style="width:0%"></div>
              </div>
              <div class="upl-stats">
                <div class="upl-last" id="upload-last-order">${t("run.progress_start")}</div>
                <div id="upload-counter" style="color:var(--text2);font-size:11px;flex-shrink:0">0 / 0</div>
              </div>
            </div>

            <!-- Orders preview table — appears once we have preview data, copyable -->
            <div id="preview-panel" style="display:none;background:var(--bg2);border:1px solid var(--accent);border-radius:var(--radius);overflow:hidden">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)">
                <div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em" id="preview-header-label">${t("run.orders_ready")}</div>
                <div style="display:flex;gap:8px;align-items:center">
                  <span style="font-size:11px;color:var(--text2)">${t("run.click_to_copy")}</span>
                  <button id="btn-preview-download" class="btn btn-primary" style="font-size:11px;padding:5px 12px">${t("run.download")}</button>
                </div>
              </div>
              <div style="padding:8px 12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,0.05)">
                <input id="preview-search" type="text" placeholder="${t('run.search_orders_placeholder') || 'Search by name, phone or product...'}" style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;color:var(--text);outline:none" oninput="window._filterPreviewTable(this.value)">
              </div>
              <div style="overflow:auto;max-height:340px" id="preview-table-wrap"></div>
            </div>

            <!-- Placeholder when no data yet -->
            <div id="run-idle-placeholder" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:200px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius)">
              <div style="text-align:center;color:var(--text2)">
                <div style="font-size:36px;margin-bottom:10px;opacity:0.4">📦</div>
                <div style="font-size:13px;font-weight:600">${t("run.waiting_upload")}</div>
                <div style="font-size:12px;margin-top:4px;opacity:0.7">${t("run.upload_placeholder")}</div>
              </div>
            </div>

            <!-- Zero orders result panel — shown when bot finishes with 0 new orders -->
            <div id="zero-orders-panel" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:28px 24px;text-align:center">
              <div style="font-size:40px;margin-bottom:12px">🔍</div>
              <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:6px">${t("run.no_new_orders_found")}</div>
              <div style="font-size:13px;color:var(--text2);margin-bottom:20px">${t("run.orders_all_in_taager")}</div>
              <div id="zero-orders-stats" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:8px"></div>
            </div>

          </div>
        </div>

        <!-- TAB 2: Live Log -->
        <div id="run-tab-log" style="display:none;flex:1;flex-direction:column;min-height:0">
          <div class="log-terminal" id="log-output" style="flex:1;height:0;min-height:400px"></div>
        </div>

            </div></div>
          </div>
        </div>
      </div>
    `;

    if (!document.getElementById("run-preview-table-style")) {
      const _runTableStyle = document.createElement("style");
      _runTableStyle.id = "run-preview-table-style";
      _runTableStyle.textContent = `
        .orders-preview-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .orders-preview-table th,
        .orders-preview-table td {
          padding: 7px 10px;
          text-align: left;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .orders-preview-table th {
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .04em;
          color: var(--text2);
          background: rgba(255,255,255,0.03);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .orders-preview-table tbody tr:hover { background: rgba(79,142,247,0.05); }
        .orders-preview-table tbody tr:last-child td { border-bottom: none; }
      `;
      document.head.appendChild(_runTableStyle);
    }

    // Tab switcher
    let _logLineCount = 0;
    window._runSwitchTab = function(tab) {
      const isStatus = tab === 'status';
      document.getElementById('run-tab-status').style.display = isStatus ? 'grid' : 'none';
      document.getElementById('run-tab-log').style.display    = isStatus ? 'none' : 'flex';
      document.getElementById('tab-status').classList.toggle('active', isStatus);
      document.getElementById('tab-log').classList.toggle('active', !isStatus);
      if (!isStatus) {
        document.getElementById('log-badge').textContent = '0';
        _logLineCount = 0;
        const logEl2 = document.getElementById('log-output');
        if (logEl2) logEl2.scrollTop = logEl2.scrollHeight;
      }
    };


    const logEl  = document.getElementById("log-output");
    const badge  = document.getElementById("run-status-badge");
    let botDone  = false;

    function isInlineCountdownLog(text) {
      return String(text || "").includes("[تجنب حد التصدير]") ||
        String(text || "").includes("[Account schedule]");
    }

    let _logQueue = [];
    let _logRafPending = false;
    function _flushLog() {
      _logRafPending = false;
      if (!_logQueue.length) return;

      const firstItem = _logQueue[0];
      if (firstItem && isInlineCountdownLog(firstItem.text) && logEl) {
        const lastChild = logEl.lastElementChild;
        if (lastChild && isInlineCountdownLog(lastChild.textContent)) {
          lastChild.textContent = firstItem.text;
          _logQueue.shift();
        }
      }

      if (!_logQueue.length) return;
      const frag = document.createDocumentFragment();
      for (const { text, cls } of _logQueue) {
        const line = document.createElement("div");
        if (cls) line.className = cls;
        line.textContent = text;
        frag.appendChild(line);
      }
      _logQueue = [];
      logEl.appendChild(frag);
      logEl.scrollTop = logEl.scrollHeight;
    }

    document.getElementById("btn-home-run").addEventListener("click", () => { cleanup(); onHome(); });

    document.getElementById("btn-stop").addEventListener("click", async () => {
      if (botDone) return;
      const confirmed = await showRunConfirm(t("run.stop_title"), t("run.stop_msg"));
      if (!confirmed) return;
      window._botIsRunning = false;
      window.api.killBot();
      window.api.botFinished();
      appendLog("\n" + t("run.bot_stopped_user"));
      badge.textContent = t("run.badge_stopped");
      document.getElementById("btn-stop").style.display = "none";
      const homeBtn = document.getElementById("btn-home-run");
      if (homeBtn) { homeBtn.disabled = false; homeBtn.style.opacity = "1"; homeBtn.style.cursor = "pointer"; }
      startGlobalCooldown();
      showCooldownBar();
    });

    function appendLog(msg) {
      if (isInlineCountdownLog(msg)) {
        const cleanMsg = msg.trim();
        const lastQueueItem = _logQueue[_logQueue.length - 1];
        if (lastQueueItem && isInlineCountdownLog(lastQueueItem.text)) {
          lastQueueItem.text = cleanMsg;
          if (!_logRafPending) { _logRafPending = true; requestAnimationFrame(_flushLog); }
          return;
        }
        
        if (_logQueue.length === 0 && logEl) {
          const lastChild = logEl.lastElementChild;
          if (lastChild && isInlineCountdownLog(lastChild.textContent)) {
            lastChild.textContent = cleanMsg;
            return;
          }
        }
      }

      let cls = "";
      const ch = msg[0];
      if (ch === "✅" || msg.startsWith("📦") || msg.startsWith("📋")) cls = "log-ok";
      else if (ch === "❌" || msg.startsWith("FATAL") || msg.startsWith("ERR:")) cls = "log-err";
      else if (msg.startsWith("⚠️") || msg.startsWith("⏳") || msg.startsWith("⏸️")) cls = "log-warn";
      else if (ch === "═" || msg.startsWith("PHASE") || msg.startsWith("📅") || msg.startsWith("🤖")) cls = "log-info";
      _logQueue.push({ text: msg, cls });
      if (!_logRafPending) { _logRafPending = true; requestAnimationFrame(_flushLog); }
      // Badge counter: increment when status tab is active
      if (document.getElementById('tab-log') && !document.getElementById('tab-log').classList.contains('active')) {
        _logLineCount++;
        const badgeEl = document.getElementById('log-badge');
        if (badgeEl) badgeEl.textContent = _logLineCount > 99 ? '99+' : String(_logLineCount);
      }
      updatePhases(msg);
    }

    function updatePhases(msg) {
      const phaseMap = [
        { keywords: ["Easy-Orders Login", "PHASE 1", "easy-orders login", "Easy-orders login"], idx: 0 },
        { keywords: ["Real Orders Export", "PHASE 2", "Real orders downloaded"],                idx: 1 },
        { keywords: ["Missed Orders Export", "PHASE 3", "Missed orders downloaded"],            idx: 2 },
        { keywords: ["PHASE 4", "Taager Login", "Taager: logging in", "taagerLogin"],                idx: 3 },
        { keywords: ["PHASE 5", "Upload to Taager Cart", "Taager upload"],        idx: 4 },
      ];
      for (const p of phaseMap) {
        if (p.keywords.some((k) => msg.includes(k))) setPhaseActive(p.idx);
      }
      if (msg.includes("✅") && (msg.includes("downloaded") || msg.includes("confirmed") || msg.includes("complete"))) {
        for (let i = 0; i < 5; i++) {
          const dot = document.getElementById(`dot-${i}`);
          if (dot && dot.classList.contains("active")) {
            dot.classList.remove("active");
            dot.classList.add("done");
            document.getElementById(`phase-label-${i}`).textContent = t("run.phase_complete");
            break;
          }
        }
      }
    }

    function setPhaseActive(idx) {
      const dot = document.getElementById(`dot-${idx}`);
      if (dot && !dot.classList.contains("done")) {
        dot.classList.add("active");
        document.getElementById(`phase-label-${idx}`).textContent = t("run.phase_running");
      }
    }

    let cooldownInterval = null;
    function showCooldownBar() {
      const bar = document.getElementById("global-cooldown-bar");
      if (!bar) return;
      bar.style.display = "flex";
      const TOTAL = 6 * 60 * 1000;
      cooldownInterval = setInterval(() => {
        const remaining = getCooldownRemaining();
        const timerEl = document.getElementById("cooldown-timer");
        const fillEl  = document.getElementById("cooldown-bar-fill");
        if (timerEl) timerEl.textContent = formatCountdown(remaining);
        if (fillEl)  fillEl.style.width  = (remaining / TOTAL * 100) + "%";
        if (remaining <= 0) { clearInterval(cooldownInterval); bar.style.display = "none"; }
      }, 1000);
    }

    if (getCooldownRemaining() > 0) showCooldownBar();

    function cleanup() {
      clearInterval(cooldownInterval);
      if (window._taagerRestartInterval) { clearInterval(window._taagerRestartInterval); window._taagerRestartInterval = null; }
      window.api.removeAllListeners("bot-log");
      window.api.removeAllListeners("bot-2fa-needed");
      window.api.removeAllListeners("bot-needs-confirm");
      window.api.removeAllListeners("bot-cooldown");
      window.api.removeAllListeners("bot-preview");
      window.api.removeAllListeners("bot-order-progress");
      window.api.removeAllListeners("bot-taager-restart");
      window.api.removeAllListeners("bot-session-event");
      window.api.removeAllListeners("bot-google-login-needed");
      window.api.removeAllListeners("bot-google-login-complete");
      window._opsLiveGlobalBound = false;
    }

    cleanup();

    window.api.onBotLog((msg) => appendLog(msg));

    window.api.onPreview((data) => {
      const previewEl  = document.getElementById("preview-panel");
      const tableWrap  = document.getElementById("preview-table-wrap");
      const headerLbl  = document.getElementById("preview-header-label");
      const placeholder = document.getElementById("run-idle-placeholder");
      if (!previewEl) return;
      previewEl.style.display = "block";
      if (placeholder) placeholder.style.display = "none";
      window._previewBuffer = data.buffer;
      const cols = t("run.preview_cols");
      const headerFn = t("run.preview_header");
      const headerLabel = typeof headerFn === "function" ? headerFn(data.total) : headerFn;
      if (headerLbl) headerLbl.textContent = headerLabel;

      // Build selectable, copyable table
      const allRows = data.rows; // show ALL rows
      window._previewAllRows = allRows;
      const more = data.total > allRows.length ? `<div style="padding:8px 16px;font-size:11px;color:var(--text2)">+ ${data.total - allRows.length} more rows not shown</div>` : "";

      function buildPreviewTableHTML(rows) {
        return `
          <table class="orders-preview-table" style="width:100%;table-layout:fixed;border-collapse:collapse">
            <colgroup>
              <col style="width:38px">
              <col style="width:auto">
              <col style="width:50px">
              <col style="width:72px">
              <col style="width:80px">
              <col style="width:90px">
              <col style="width:110px">
              <col style="width:120px">
            </colgroup>
            <thead>
              <tr><th style="width:38px">#</th>${cols.map(c => `<th>${c}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr>
                  <td style="color:var(--text2);text-align:center">${i + 1}</td>
                  <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(r.productName||"").replace(/"/g,"")}">${r.productName || "—"}</td>
                  <td style="font-weight:700;text-align:center">${r.qty}</td>
                  <td style="color:var(--success);font-weight:600">${r.subtotal || "—"}</td>
                  <td style="color:var(--text2)">${r.date || "—"}</td>
                  <td style="direction:rtl;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.city || "—"}</td>
                  <td style="direction:rtl;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name || "—"}</td>
                  <td style="font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.phone}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          ${more}
        `;
      }

      window._filterPreviewTable = function(query) {
        if (!tableWrap) return;
        const q = (query || "").trim().toLowerCase();
        const filtered = q
          ? (window._previewAllRows || []).filter(r =>
              (r.name || "").toLowerCase().includes(q) ||
              (r.phone || "").toLowerCase().includes(q) ||
              (r.productName || "").toLowerCase().includes(q)
            )
          : (window._previewAllRows || []);
        tableWrap.innerHTML = buildPreviewTableHTML(filtered);
        if (filtered.length === 0) {
          tableWrap.innerHTML += `<div style="padding:16px;text-align:center;font-size:12px;color:var(--text2)">No orders match your search</div>`;
        }
      };

      if (tableWrap) {
        tableWrap.innerHTML = buildPreviewTableHTML(allRows);
        const searchEl = document.getElementById("preview-search");
        if (searchEl) searchEl.value = "";
      }
      document.getElementById("btn-preview-download")?.addEventListener("click", async () => {
        if (!window._previewBuffer) return;
        const filename = `Taager-preview-${selectedAccountEmailTag()}-${runDateTag()}.xlsx`;
        const result = await window.api.saveOutputFile({ buffer: window._previewBuffer, filename });
        if (result.saved) { const fn = t("run.preview_saved"); appendLog(typeof fn === "function" ? fn(result.path) : fn); }
      });
    });

    window.api.on2faNeeded(() => {
      document.getElementById("notice-2fa").style.display = "flex";
      playSound("confirm");
    });

    let pendingGoogleLoginRequestId = "";
    window.api.onGoogleLoginNeeded((data) => {
      pendingGoogleLoginRequestId = data && data.requestId || "";
      const box = document.getElementById("notice-google-login");
      if (box) box.style.display = "flex";
      const text = document.getElementById("notice-google-login-text");
      if (text) text.textContent = `${data && data.accountLabel ? data.accountLabel + ": " : ""}Chrome opened with this bot profile. Log in with Google, then close Chrome. The app will auto-check; Done is backup.`;
      const btn = document.getElementById("btn-google-login-done");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "I finished Google login";
        btn.onclick = async () => {
          if (!pendingGoogleLoginRequestId) return;
          btn.disabled = true;
          btn.textContent = "Checking login...";
          const result = await window.api.completeGoogleLogin(pendingGoogleLoginRequestId).catch((error) => ({ ok: false, error: error && error.message || String(error) }));
          if (!result || !result.ok) {
            btn.disabled = false;
            btn.textContent = "I finished Google login";
            appendLog(`Google login resume failed: ${result && result.error || "unknown error"}`);
          }
        };
      }
      playSound("confirm");
      if (Notification.permission === "granted") {
        new Notification("Google Login Required", { body: "Log in with Google in Chrome, then close Chrome. The app will auto-check; Done is backup." });
      }
    });

    window.api.onGoogleLoginComplete(() => {
      const box = document.getElementById("notice-google-login");
      if (box) box.style.display = "none";
      pendingGoogleLoginRequestId = "";
    });

    window.api.onNeedsConfirm(() => {
      document.getElementById("notice-confirm").style.display = "flex";
      badge.textContent = t("run.badge_awaiting");
      badge.style.background = "rgba(255,201,77,0.15)";
      badge.style.color = "var(--warning)";
      playSound("confirm");
      setTimeout(() => playSound("confirm"), 1000);
      setTimeout(() => playSound("confirm"), 2000);
      if (Notification.permission === "granted") {
        const titleFn = t("run.notif_action_title");
        const bodyStr = t("run.notif_action_body");
        new Notification(typeof titleFn === "function" ? titleFn : titleFn, { body: bodyStr });
      }
    });

    window.api.on("bot-cooldown", (msg) => {
      const box = document.getElementById("notice-cooldown");
      const txt = document.getElementById("cooldown-msg");
      if (box) box.style.display = "flex";
      const cooldownFn = t("run.cooldown_attempt");
      if (txt) txt.textContent = typeof cooldownFn === "function" ? cooldownFn(msg.attempt, msg.maxAttempts, msg.seconds) : cooldownFn;
      badge.textContent = t("run.badge_cooldown");
      badge.style.background = "rgba(124,106,247,0.15)";
      badge.style.color = "#a89cf7";
    });

    window.api.on("bot-taager-restart", (msg) => {
      const box    = document.getElementById("notice-taager-restart");
      const reason = document.getElementById("taager-restart-reason");
      const timer  = document.getElementById("taager-restart-timer");
      const bar    = document.getElementById("taager-restart-bar");
      const att    = document.getElementById("taager-restart-attempt");
      if (!box) return;
      box.style.display = "flex";
      const reasonFn = t("run.restart_reason");
      const attemptFn = t("run.restart_attempt");
      if (reason) reason.textContent = typeof reasonFn === "function" ? reasonFn(msg.reason) : reasonFn;
      if (att)    att.textContent    = typeof attemptFn === "function" ? attemptFn(msg.attempt, msg.maxAttempts) : attemptFn;
      badge.textContent = t("run.badge_restarting");
      badge.style.background = "rgba(255,107,53,0.15)";
      badge.style.color = "#ff6b35";
      if (window._taagerRestartInterval) clearInterval(window._taagerRestartInterval);
      const TOTAL = msg.waitSeconds;
      let remaining = msg.waitSeconds;
      const tick = () => {
        if (!timer || !bar) return;
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        timer.textContent = `${m}:${String(s).padStart(2,"0")}`;
        bar.style.width = (remaining / TOTAL * 100) + "%";
        if (remaining <= 0) {
          clearInterval(window._taagerRestartInterval);
          window._taagerRestartInterval = null;
          box.style.display = "none";
          badge.textContent = t("run.badge_running");
          badge.style.background = "rgba(79,142,247,0.15)";
          badge.style.color = "var(--accent)";
        }
        remaining--;
      };
      tick();
      window._taagerRestartInterval = setInterval(tick, 1000);
    });

    // ── SESSION EVENTS (auto re-login, session desync recovery) ──
    window.api.on("bot-session-event", (msg) => {
      const eventMap = {
        "session-expired":            "⚠️ Session expired — re-logging in...",
        "session-desync-post-action": "⚠️ Session desync detected — re-logging in...",
        "session-probe-failed":       "⚠️ Session probe failed — re-logging in...",
        "login-confirmed":            "✅ Session re-confirmed",
        "session-reused":             "✅ Existing session reused",
      };
      const txt = `🔐 [${msg.site || "bot"}] ${eventMap[msg.event] || msg.event}`;
      appendLog(txt);
    });

    window.api.on("bot-order-progress", (msg) => {
      const _upPanel   = document.getElementById("upload-progress-panel");
      const _upBar     = document.getElementById("upload-progress-bar");
      const _upCounter = document.getElementById("upload-counter");
      const _upLast    = document.getElementById("upload-last-order");
      const _upSuccess = document.getElementById("upload-success-count");
      const _upFail    = document.getElementById("upload-fail-count");
      const _upOk      = document.getElementById("upload-ok");
      const _upTotal   = document.getElementById("upload-total");
      const _placeholder = document.getElementById("run-idle-placeholder");

      if (_upPanel) _upPanel.style.display = "block";
      if (_placeholder) _placeholder.style.display = "none";
      const pct = msg.total > 0 ? (msg.current / msg.total * 100) : 0;
      if (_upBar)     _upBar.style.width = pct + "%";
      if (_upCounter) _upCounter.textContent = `${msg.current} / ${msg.total}`;
      if (_upOk)      _upOk.textContent = msg.success;
      if (_upTotal)   _upTotal.textContent = msg.total;
      if (_upSuccess) _upSuccess.textContent = msg.success;
      if (_upFail)    _upFail.textContent = msg.failed;
      if (_upLast) {
        if (msg.lastOrder?.error) {
          _upLast.style.color = "var(--danger)";
          _upLast.textContent = `❌ ${msg.lastOrder.product} — ${msg.lastOrder.error}`;
        } else {
          _upLast.style.color = "var(--text2)";
          _upLast.textContent = `↳ ${msg.lastOrder?.product || ""}`;
        }
      }
      const uploadBadgeFn = t("run.badge_uploading");
      badge.textContent = typeof uploadBadgeFn === "function" ? uploadBadgeFn(msg.current, msg.total) : uploadBadgeFn;
      badge.style.background = "rgba(0,214,143,0.12)";
      badge.style.color = "var(--success)";
    });

    if (typeof _opsEnsureLiveBindings === "function") _opsEnsureLiveBindings();
    if (typeof _opsStartLiveRun === "function") _opsStartLiveRun();

    window.api.botStarted();
    appendLog(t("run.log_starting"));
    const dateRangeFn = t("run.log_date_range");
    appendLog(typeof dateRangeFn === "function" ? dateRangeFn(dateFrom, dateTo) : dateRangeFn);
    badge.textContent = t("run.badge_running");
    badge.style.background = "rgba(79,142,247,0.15)";
    badge.style.color = "var(--accent)";

    if (Notification.permission === "default") Notification.requestPermission();

    if (typeof wireSharedSidebar === "function") wireSharedSidebar(el);

    window.api.runBot({ dateFrom, dateTo, accountIds: selectedAccountIds || [] }).then((result) => {
      botDone = true;
      window._botIsRunning = false;
      window.api.botFinished();
      cleanup();
      startGlobalCooldown();
      showCooldownBar();
      document.getElementById("btn-stop").style.display = "none";
      const homeBtn = document.getElementById("btn-home-run");
      if (homeBtn) { homeBtn.disabled = false; homeBtn.style.opacity = "1"; homeBtn.style.cursor = "pointer"; }
      for (let i = 0; i < 5; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (dot && dot.classList.contains("active")) { dot.classList.remove("active"); dot.classList.add("done"); }
      }
      if (result.success) {
        badge.textContent = t("run.badge_done");
        badge.style.background = "rgba(0,214,143,0.15)";
        badge.style.color = "var(--success)";
        appendLog("\n" + t("run.log_completed"));
        const logNewOrdersFn = t("run.log_new_orders");
        appendLog(typeof logNewOrdersFn === "function" ? logNewOrdersFn(result.data.orders) : logNewOrdersFn);
        playSound("success");

        // If zero new orders — show a clear summary panel instead of the empty placeholder
        if ((result.data.orders || 0) === 0) {
          const idlePlaceholder = document.getElementById("run-idle-placeholder");
          const zeroPanel       = document.getElementById("zero-orders-panel");
          const statsEl         = document.getElementById("zero-orders-stats");
          if (idlePlaceholder) idlePlaceholder.style.display = "none";
          if (zeroPanel)       zeroPanel.style.display = "block";
          if (statsEl && result.data.stats) {
            const s = result.data.stats;
            const statItems = [
              { icon: "📥", label: t("run.stat_real_scanned"),     val: (s.realValid   || 0) + (s.realInTaager   || 0) + (s.realDupe   || 0) },
              { icon: "📋", label: t("run.stat_missed_scanned"),   val: (s.missedValid || 0) + (s.missedInTaager || 0) + (s.missedDupe || 0) },
              { icon: "🔁", label: t("run.stat_already_taager"),     val: (s.realInTaager || 0) + (s.missedInTaager || 0) },
              { icon: "📦", label: t("run.stat_duplicate_phones"), val: (s.realDupe     || 0) + (s.missedDupe     || 0) },
            ];
            statsEl.innerHTML = statItems.map(item => `
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 18px;min-width:120px">
                <div style="font-size:20px;margin-bottom:4px">${item.icon}</div>
                <div style="font-size:20px;font-weight:800;color:var(--text)">${item.val}</div>
                <div style="font-size:11px;color:var(--text2);margin-top:2px">${item.label}</div>
              </div>`).join("");
          }
          // Still navigate to results after a delay so the user sees this
          setTimeout(() => onComplete({ ...result.data, runtimeMs: result.runtimeMs || 0, runStartedAt: result.runStartedAt || null, runEndedAt: result.runEndedAt || null, _accountLabel: selectedAccountEmailTag() }), 3000);
        } else {
          setTimeout(() => onComplete({ ...result.data, runtimeMs: result.runtimeMs || 0, runStartedAt: result.runStartedAt || null, runEndedAt: result.runEndedAt || null, _accountLabel: selectedAccountEmailTag() }), 1200);
        }
      } else if (result.error === "LICENSE_INVALID") {
        badge.textContent = t("run.badge_license_expired");
        badge.style.background = "rgba(255,77,109,0.15)";
        badge.style.color = "var(--danger)";
        appendLog("\n" + t("run.log_license_expired"));
        playSound("error");
        setTimeout(() => onHome(), 2500);
      } else {
        badge.textContent = t("run.badge_failed");
        badge.style.background = "rgba(255,77,109,0.15)";
        badge.style.color = "var(--danger)";
        appendLog(`\n` + (typeof t("run.bot_failed") === "function" ? t("run.bot_failed")(result.error) : t("run.bot_failed")));
        playSound("error");
        setTimeout(() => playSound("error"), 800);
        if (Notification.permission === "granted") {
          const errBodyFn = t("run.notif_error_body");
          new Notification(t("run.notif_error_title"), { body: typeof errBodyFn === "function" ? errBodyFn(result.error) : errBodyFn });
        }
        setTimeout(() => onComplete({ orders: 0, failedOrders: { count: 0 }, _runFailed: true, _failReason: result.error }), 1500);
      }
    });

    return; // ← single-account path ends here
  }

  // ─────────────────────────────────────
  // MULTI-ACCOUNT — dropdown layout
  // Tasks 2, 3, 4
  // ─────────────────────────────────────

  // Per-account state
  const _allAccounts = window._kbotAccounts || [];
  const accountStates = selectedAccountIds.map((id, idx) => {
    const acct = _allAccounts.find(a => a.id === id);
    return {
      ...(acct || {}),
      id,
      label: (acct && (acct.memberName || acct.easyEmail || acct.label)) || (typeof t("run.acc_label_default") === "function" ? t("run.acc_label_default")(idx + 1) : `Account ${idx + 1}`),
      status: "running",
      logLines: [],
      phases: [0,1,2,3,4].map(() => ({ state: "waiting" })),
      progress: null,
      preview: null,   // { rows, total, buffer } once bot-preview fires for this account
    };
  });

  // Combined log for "All Accounts" pane
  const allLogLines = [];

  // Active pane: "__all__" or an accountId
  let selectedPane = "__all__";
  let allBotsDone  = false;

  // ── Status icon helper ──
  function statusIcon(s) {
    return s === "done" ? "✅" : s === "failed" ? "❌" : "🔄";
  }

  // ── Build dropdown option list HTML ──
  function buildDropdownOptions() {
    let html = `<div class="mac-dd-item ${selectedPane === "__all__" ? "mac-dd-active" : ""}" data-pane="__all__">${t("run.all_accounts")}</div>`;
    for (const acc of accountStates) {
      const accName = accountDisplayName(acc);
      html += `<div class="mac-dd-item ${selectedPane === acc.id ? "mac-dd-active" : ""}" data-pane="${acc.id}">${statusIcon(acc.status)} ${accName}</div>`;
    }
    return html;
  }

  // ── Trigger button label ──
  function buildTriggerLabel() {
    if (selectedPane === "__all__") return t("run.all_accounts");
    const acc = accountStates.find(a => a.id === selectedPane);
    const accName = acc ? accountDisplayName(acc) : "";
    return acc ? `${statusIcon(acc.status)} ${accName}` : t("run.all_accounts");
  }

  // ── Phases HTML for one account ──
  function buildPhasesHTML(accId) {
    const names = [t("run.phase0"), t("run.phase1"), t("run.phase2"), t("run.phase3"), t("run.phase4")];
    const acc = accountStates.find(a => a.id === accId);
    return names.map((name, i) => {
      const ph = acc ? acc.phases[i] : { state: "waiting" };
      const dotCls = ph.state === "active" ? "status-dot active" : ph.state === "done" ? "status-dot done" : "status-dot";
      const lbl = ph.state === "active" ? t("run.phase_running") : ph.state === "done" ? t("run.phase_complete") : t("run.waiting");
      return `<div class="status-row" style="${i === 4 ? "grid-column:1/-1" : ""}">
        <div class="${dotCls}"></div>
        <div><div style="font-size:13px;font-weight:600">${name}</div><div class="text-sm text-muted">${lbl}</div></div>
      </div>`;
    }).join("");
  }

  // ── Progress bar HTML for one account ──
  function buildProgressHTML(accId) {
    const acc = accountStates.find(a => a.id === accId);
    if (!acc || !acc.progress) return `<div id="acc-prog-${accId}" style="display:none"></div>`;
    const p = acc.progress;
    const pct = p.total > 0 ? (p.current / p.total * 100) : 0;
    const lastTxt   = p.lastOrder?.error ? `❌ ${p.lastOrder.product} — ${p.lastOrder.error}` : `↳ ${p.lastOrder?.product || ""}`;
    const lastColor = p.lastOrder?.error ? "var(--danger)" : "var(--text2)";
    return `<div id="acc-prog-${accId}" style="background:var(--bg2);border:1px solid var(--accent);border-radius:var(--radius);padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em">${t("run.creating")}</div>
        <div style="font-size:12px;color:var(--text2)">${p.current} / ${p.total}</div>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:8px">
        <div style="height:100%;background:var(--accent);width:${pct}%;transition:width 0.4s ease;border-radius:4px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px">
        <div style="color:${lastColor}">${lastTxt}</div>
        <div style="display:flex;gap:12px">
          <span style="color:var(--success)">✅ ${p.success}</span>
          <span style="color:var(--danger)">❌ ${p.failed}</span>
        </div>
      </div>
    </div>`;
  }

  // ── Log lines → HTML (last 300 lines, escaped) ──
  function buildLogHTML(lines) {
    return lines.slice(-300).map(({ text, cls }) => {
      const esc = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return `<div class="${cls || ""}">${esc}</div>`;
    }).join("");
  }

  // ── Render the active pane into #multi-pane-content ──
  function renderPane() {
    const wrap = document.getElementById("multi-pane-content");
    if (!wrap) return;

    if (selectedPane === "__all__") {
      // Overview: mini status cards for each account
      wrap.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${accountStates.map(acc => {
            const statusColor = acc.status === "done" ? "var(--success)" : acc.status === "failed" ? "var(--danger)" : "var(--accent)";
            const statusText  = acc.status === "done" ? t("run.badge_done") : acc.status === "failed" ? t("run.badge_failed") : t("run.badge_running");
            const phaseDone = acc.phases.filter(p => p.state === "done").length;
            const phaseActive = acc.phases.findIndex(p => p.state === "active");
            const currentPhaseLabel = phaseActive >= 0
              ? [t("run.phase0"),t("run.phase1"),t("run.phase2"),t("run.phase3"),t("run.phase4")][phaseActive]
              : phaseDone >= 5 ? t("run.all_phases_done") : t("run.waiting");
            const pct = Math.round(phaseDone / 5 * 100);
            const prog = acc.progress;
            const uploadDetailFn = t("results.uploading_detail");
            return `
            <div style="background:var(--bg2);border:1px solid ${statusColor};border-radius:var(--radius);padding:14px;cursor:pointer" onclick="window._runMultiSelect('${acc.id}')">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%">${accountDisplayName(acc)}</div>
                <div style="font-size:12px;font-weight:700;color:${statusColor}">${statusText}</div>
              </div>
              <div style="font-size:11px;color:var(--text2);margin-bottom:6px">${currentPhaseLabel}</div>
              <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:8px">
                <div style="height:100%;width:${pct}%;background:${statusColor};transition:width 0.5s ease;border-radius:2px"></div>
              </div>
              ${prog ? `<div style="font-size:11px;color:var(--text2)">${typeof uploadDetailFn === "function" ? uploadDetailFn(prog.current, prog.total, prog.success, prog.failed) : uploadDetailFn}</div>` : acc.preview ? `<div style="font-size:11px;color:var(--success);font-weight:600">${(()=>{const fn=t("run.preview_header");return typeof fn==="function"?fn(acc.preview.total):fn;})()}</div>` : ""}
            </div>`;
          }).join("")}
        </div>
        <div class="notice-box info" style="margin-top:4px">
          <span class="notice-icon">👈</span>
          <div class="notice-text">${t("run.click_account_card")}</div>
        </div>`;
      return;
    }

    const acc = accountStates.find(a => a.id === selectedPane);
    if (!acc) return;

    const phaseNames = [t("run.phase0"),t("run.phase1"),t("run.phase2"),t("run.phase3"),t("run.phase4")];
    const doneBanner = acc.status !== "running"
      ? `<div style="background:${acc.status==="done"?"rgba(0,214,143,0.1)":"rgba(255,77,109,0.1)"};border:1px solid ${acc.status==="done"?"var(--success)":"var(--danger)"};border-radius:var(--radius);padding:10px 16px;font-size:13px;font-weight:700;color:${acc.status==="done"?"var(--success)":"var(--danger)"}">
          ${acc.status==="done" ? (()=>{const fn=t("run.acc_done_banner");const n=accountDisplayName(acc);return typeof fn==="function"?fn(n):fn;})() : (()=>{const fn=t("run.acc_failed_banner");const n=accountDisplayName(acc);return typeof fn==="function"?fn(n):fn;})()}
        </div>` : "";

    // Big upload progress for this account
    const prog = acc.progress;
    const progHtml = prog ? `
      <div class="upload-progress-large">
        <div class="upl-header">
          <div>
            <div class="upl-title">${t("run.creating")}</div>
            <div class="upl-count">${prog.current} <span style="font-size:16px;color:var(--text2);font-weight:400">/ ${prog.total}</span></div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:var(--text2);margin-bottom:4px">${t("run.acc_status_col")}</div>
            <div style="display:flex;gap:14px">
              <span style="color:var(--success);font-weight:700;font-size:14px">✅ ${prog.success}</span>
              <span style="color:var(--danger);font-weight:700;font-size:14px">❌ ${prog.failed}</span>
            </div>
          </div>
        </div>
        <div class="upl-bar-track">
          <div class="upl-bar-fill" style="width:${prog.total>0?Math.round(prog.current/prog.total*100):0}%"></div>
        </div>
        <div class="upl-stats">
          <div class="upl-last">${prog.lastOrder?.error ? `❌ ${prog.lastOrder.product} — ${prog.lastOrder.error}` : `↳ ${prog.lastOrder?.product || ""}`}</div>
          <div style="color:var(--text2);font-size:11px">${prog.current} / ${prog.total}</div>
        </div>
      </div>` : "";

    // Orders-ready preview panel for this account
    const prevData = acc.preview;
    const previewHtml = prevData ? (() => {
      const cols = t("run.preview_cols");
      const headerFn = t("run.preview_header");
      const headerLabel = typeof headerFn === "function" ? headerFn(prevData.total) : headerFn;
      const rows = prevData.rows || [];
      const searchId = `multi-preview-search-${acc.id}`;
      const tableId  = `multi-preview-table-${acc.id}`;
      if (!window._multiPreviewRows) window._multiPreviewRows = {};
      window._multiPreviewRows[acc.id] = rows;
      window._filterMultiPreview = window._filterMultiPreview || function(accId, query) {
        const allR = (window._multiPreviewRows || {})[accId] || [];
        const q = (query || "").trim().toLowerCase();
        const filtered = q ? allR.filter(r =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.phone || "").toLowerCase().includes(q) ||
          (r.productName || "").toLowerCase().includes(q)
        ) : allR;
        const wrap = document.getElementById(`multi-preview-table-${accId}`);
        if (!wrap) return;
        const colsL = window._t("run.preview_cols");
        wrap.innerHTML = `
          <table class="orders-preview-table" style="width:100%;table-layout:fixed;border-collapse:collapse">
            <colgroup>
              <col style="width:38px"><col style="width:auto"><col style="width:50px">
              <col style="width:72px"><col style="width:80px"><col style="width:90px">
              <col style="width:110px"><col style="width:120px">
            </colgroup>
            <thead><tr><th style="width:38px">#</th>${Array.isArray(colsL)?colsL.map(c=>`<th>${c}</th>`).join(""):""}</tr></thead>
            <tbody>${filtered.map((r,i)=>`<tr>
              <td style="color:var(--text2);text-align:center">${i+1}</td>
              <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(r.productName||"").replace(/"/g,"")}">${r.productName||"—"}</td>
              <td style="font-weight:700;text-align:center">${r.qty||1}</td>
              <td style="color:var(--success);font-weight:600">${r.subtotal||"—"}</td>
              <td style="color:var(--text2)">${r.date||"—"}</td>
              <td style="direction:rtl;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.city||"—"}</td>
              <td style="direction:rtl;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name||"—"}</td>
              <td style="font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.phone||"—"}</td>
            </tr>`).join("")}
            ${filtered.length===0?`<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--text2);font-size:12px">No orders match your search</td></tr>`:""}</tbody>
          </table>`;
      };
      return `
      <div style="background:var(--bg2);border:1px solid var(--accent);border-radius:var(--radius);overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em">${headerLabel}</div>
          ${prevData.buffer ? `<button class="btn btn-primary" style="font-size:11px;padding:5px 12px" onclick="window._multiDownloadPreview('${acc.id}')">${t("run.download")}</button>` : ""}
        </div>
        <div style="padding:7px 10px;border-bottom:1px solid var(--border);background:rgba(0,0,0,0.05)">
          <input id="${searchId}" type="text" placeholder="${t('run.search_orders_placeholder')||'Search by name, phone or product...'}" style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 9px;font-size:12px;color:var(--text);outline:none" oninput="window._filterMultiPreview('${acc.id}',this.value)">
        </div>
        <div style="overflow:auto;max-height:300px" id="${tableId}">
          <table class="orders-preview-table" style="width:100%;table-layout:fixed;border-collapse:collapse">
            <colgroup>
              <col style="width:38px"><col style="width:auto"><col style="width:50px">
              <col style="width:72px"><col style="width:80px"><col style="width:90px">
              <col style="width:110px"><col style="width:120px">
            </colgroup>
            <thead><tr><th style="width:38px">#</th>${Array.isArray(cols)?cols.map(c=>`<th>${c}</th>`).join(""):""}</tr></thead>
            <tbody>
              ${rows.map((r,i)=>`<tr>
                <td style="color:var(--text2);text-align:center">${i+1}</td>
                <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(r.productName||"").replace(/"/g,"")}">${r.productName||"—"}</td>
                <td style="font-weight:700;text-align:center">${r.qty||1}</td>
                <td style="color:var(--success);font-weight:600">${r.subtotal||"—"}</td>
                <td style="color:var(--text2)">${r.date||"—"}</td>
                <td style="direction:rtl;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.city||"—"}</td>
                <td style="direction:rtl;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name||"—"}</td>
                <td style="font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.phone||"—"}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    })() : "";

    wrap.innerHTML = `
      ${doneBanner}
      <div style="display:grid;grid-template-columns:240px 1fr;gap:12px">
        <!-- Phases -->
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:12px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${t("run.phases_header")}</div>
          <div style="display:flex;flex-direction:column;gap:6px" id="phases-wrap-${acc.id}">
            ${buildPhasesHTML(acc.id)}
          </div>
        </div>
        <!-- Right: progress + notices -->
        <div style="display:flex;flex-direction:column;gap:10px">
          ${progHtml}
          ${previewHtml}
          <div id="notices-${acc.id}">
            <!-- Notices injected dynamically -->
          </div>
          ${!prog && !prevData ? `
          <div style="flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;text-align:center;color:var(--text2)">
            <div style="font-size:28px;margin-bottom:8px;opacity:0.4">📦</div>
            <div style="font-size:12px;font-weight:600">${t("run.waiting_upload")}</div>
            <div style="font-size:11px;margin-top:4px;opacity:0.7">${t("run.switch_live_log")}</div>
          </div>` : ""}
        </div>
      </div>`;
  }

  // ── Update sidebar item status ──
  function refreshSidebar() {
    const allSiEl = document.getElementById("mac-si-__all__");
    const running = accountStates.filter(a=>a.status==="running").length;
    const done    = accountStates.filter(a=>a.status==="done").length;
    const failed  = accountStates.filter(a=>a.status==="failed").length;
    if (allSiEl) {
      allSiEl.querySelector("div:last-child").textContent = `✅${done} 🔄${running} ${failed>0?"❌"+failed:""}`;
    }
    for (const acc of accountStates) {
      const siEl = document.getElementById(`mac-si-${acc.id}`);
      const stEl = document.getElementById(`mac-si-status-${acc.id}`);
      if (!siEl || !stEl) continue;
      siEl.classList.remove("mac-si-done","mac-si-failed");
      if (acc.status === "done")   { siEl.classList.add("mac-si-done");   stEl.textContent = t("run.badge_done"); }
      else if (acc.status==="failed") { siEl.classList.add("mac-si-failed"); stEl.textContent = t("run.badge_failed"); }
      else {
        const activePhase = acc.phases.findIndex(p=>p.state==="active");
        const phaseStatusFn = t("run.phase_status_n");
        stEl.textContent = activePhase>=0 ? (typeof phaseStatusFn==="function" ? phaseStatusFn(activePhase+1) : phaseStatusFn) : t("run.phase_status_active");
      }
    }
  }

  // ── Classify a log line ──
  function classifyLog(msg) {
    const ch = msg[0];
    if (ch === "✅" || msg.startsWith("📦") || msg.startsWith("📋")) return "log-ok";
    if (ch === "❌" || msg.startsWith("FATAL") || msg.startsWith("ERR:")) return "log-err";
    if (msg.startsWith("⚠️") || msg.startsWith("⏳") || msg.startsWith("⏸️")) return "log-warn";
    if (ch === "═" || msg.startsWith("PHASE") || msg.startsWith("📅") || msg.startsWith("🤖")) return "log-info";
    return "";
  }

  // ── Update phase state for an account based on a log line ──
  function updateAccPhases(acc, msg) {
    const phaseMap = [
      { keywords: ["Easy-Orders Login","PHASE 1","easy-orders login","Easy-orders login"], idx: 0 },
      { keywords: ["Real Orders Export","PHASE 2","Real orders downloaded"],               idx: 1 },
      { keywords: ["Missed Orders Export","PHASE 3","Missed orders downloaded"],           idx: 2 },
      { keywords: ["PHASE 4","Taager Login","Taager: logging in","taagerLogin"],                idx: 3 },
      { keywords: ["PHASE 5","Upload to Taager Cart","Taager upload"],       idx: 4 },
    ];
    for (const p of phaseMap) {
      if (p.keywords.some(k => msg.includes(k)) && acc.phases[p.idx].state !== "done") {
        acc.phases[p.idx].state = "active";
      }
    }
    if (msg.includes("✅") && (msg.includes("downloaded") || msg.includes("confirmed") || msg.includes("complete"))) {
      for (let i = 0; i < 5; i++) {
        if (acc.phases[i].state === "active") { acc.phases[i].state = "done"; break; }
      }
    }
  }

  // ── Live-append a line to the visible log without full re-render ──
  function liveAppendLog(paneId, text, cls) {
    const logEl = document.getElementById(paneId);
    if (!logEl) return;
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Main shell HTML — sidebar + 2-tab layout ──
  el.innerHTML = `
    <div class="sv3-shell" style="height:100%;">
      ${typeof renderSharedSidebar === "function" ? renderSharedSidebar("run") : ""}
      <div class="sv3-main" style="flex:1;overflow-y:auto;overflow-x:hidden;min-width:0;display:flex;flex-direction:column;position:relative;padding:18px 26px;">
        <div class="page-wrap"><div class="page-inner" style="display:flex;flex-direction:column;gap:12px;height:100%">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div class="page-title" style="font-size:20px">${t("run.title")}</div>
          <div class="text-muted text-sm">${(()=>{const fn=t("run.accounts_subtitle");return typeof fn==="function"?fn(selectedAccountIds.length, dateDisplay):fn;})()}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="badge badge-accent" id="run-status-badge">${t("run.starting")}</div>
          <button class="btn btn-danger" id="btn-stop" style="font-size:12px;padding:6px 14px">${t("run.stop")}</button>
          <button class="btn btn-ghost" id="btn-home-run" style="font-size:12px;padding:6px 14px;opacity:0.35;cursor:not-allowed" disabled>${t("run.home")}</button>
        </div>
      </div>

      <!-- Cooldown bar -->
      <div id="global-cooldown-bar" style="display:none;background:rgba(124,106,247,0.1);border:1px solid #7c6af7;border-radius:var(--radius);padding:10px 16px;align-items:center;gap:12px">
        <span style="font-size:16px">⏳</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:#a89cf7">${t("run.cooldown_label")}</div>
          <div style="font-size:11px;color:var(--text2)">${t("run.cooldown_next")} <strong id="cooldown-timer" style="color:#a89cf7">6:00</strong></div>
        </div>
        <div style="width:120px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div id="cooldown-bar-fill" style="height:100%;background:#7c6af7;width:100%;transition:width 1s linear"></div>
        </div>
      </div>

      <!-- Step tabs (same as single-account) -->
      <div class="run-step-tabs">
        <button class="run-step-tab active" id="tab-status" onclick="window._runSwitchTab('status')">
          ${t("run.tab_status")}
        </button>
        <button class="run-step-tab" id="tab-log" onclick="window._runSwitchTab('log')">
          ${t("run.tab_log")} <span class="tab-badge" id="log-badge">0</span>
        </button>
      </div>

      <!-- TAB 1: Status — sidebar account list + content pane -->
      <div id="run-tab-status" style="display:grid;grid-template-columns:200px 1fr;gap:12px;flex:1;min-height:0;overflow:hidden">

        <!-- Sidebar: account list -->
        <div style="display:flex;flex-direction:column;gap:6px;overflow-y:auto" id="mac-sidebar">
          <!-- "All" row -->
          <div class="mac-sidebar-item mac-sidebar-active" id="mac-si-__all__" data-pane="__all__" onclick="window._runMultiSelect('__all__')">
            <div style="font-size:13px;font-weight:700">${t("run.all_accounts_label")}</div>
            <div style="font-size:11px;color:var(--text2)">${(()=>{const fn=t("run.n_running");return typeof fn==="function"?fn(selectedAccountIds.length):fn;})()}</div>
          </div>
          ${accountStates.map(acc => `
            <div class="mac-sidebar-item" id="mac-si-${acc.id}" data-pane="${acc.id}" onclick="window._runMultiSelect('${acc.id}')">
              <div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${accountDisplayName(acc)}">${accountDisplayName(acc)}</div>
              <div style="font-size:10px;color:var(--text2)" id="mac-si-status-${acc.id}">${t("run.phase_status_active")}</div>
            </div>
          `).join("")}
        </div>

        <!-- Content pane: phases + progress + notices -->
        <div id="multi-pane-content" style="overflow-y:auto;display:flex;flex-direction:column;gap:10px;min-height:0"></div>
      </div>

      <!-- TAB 2: Live Log -->
      <div id="run-tab-log" style="display:none;flex:1;flex-direction:column;min-height:0">
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">${t("run.showing_label")} <span id="log-pane-label">${t("run.all_accounts_label")}</span></div>
        <div class="log-terminal" id="log-output" style="flex:1;height:0;min-height:400px"></div>
      </div>

        </div></div>
      </div>
    </div>
  `;

  // Add sidebar CSS
  const sidebarStyle = document.createElement("style");
  sidebarStyle.textContent = `
    .mac-sidebar-item {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      user-select: none;
    }
    .mac-sidebar-item:hover { border-color: var(--accent); background: rgba(79,142,247,0.05); }
    .mac-sidebar-active { border-color: var(--accent) !important; background: rgba(79,142,247,0.1) !important; }
    .mac-si-done { border-color: var(--success) !important; }
    .mac-si-failed { border-color: var(--danger) !important; }
    .orders-preview-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    .orders-preview-table th,
    .orders-preview-table td {
      padding: 7px 10px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .orders-preview-table th {
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: var(--text2);
      background: rgba(255,255,255,0.03);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .orders-preview-table tbody tr:hover { background: rgba(79,142,247,0.05); }
    .orders-preview-table tbody tr:last-child td { border-bottom: none; }
  `;
  document.head.appendChild(sidebarStyle);

  // Tab switcher
  let _multiLogLineCount = 0;
  window._runSwitchTab = function(tab) {
    const isStatus = tab === 'status';
    document.getElementById('run-tab-status').style.display = isStatus ? 'grid' : 'none';
    document.getElementById('run-tab-log').style.display    = isStatus ? 'none' : 'flex';
    document.getElementById('tab-status').classList.toggle('active', isStatus);
    document.getElementById('tab-log').classList.toggle('active', !isStatus);
    if (!isStatus) {
      document.getElementById('log-badge').textContent = '0';
      _multiLogLineCount = 0;
      // Rebuild log content for selected pane
      const logEl = document.getElementById('log-output');
      if (logEl) {
        const lines = selectedPane === '__all__' ? allLogLines : (accountStates.find(a=>a.id===selectedPane)?.logLines || []);
        logEl.innerHTML = buildLogHTML(lines);
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
  };

  // Sidebar account selector
  window._runMultiSelect = function(paneId) {
    selectedPane = paneId;
    // Update sidebar active state
    document.querySelectorAll('.mac-sidebar-item').forEach(el => {
      el.classList.toggle('mac-sidebar-active', el.dataset.pane === paneId);
    });
    // Update log pane label
    const labelEl = document.getElementById('log-pane-label');
    if (labelEl) {
      if (paneId === '__all__') labelEl.textContent = t("run.all_accounts_label");
      else { const acc = accountStates.find(a=>a.id===paneId); labelEl.textContent = acc?.label || paneId; }
    }
    // If log tab is active, refresh log content
    if (document.getElementById('tab-log')?.classList.contains('active')) {
      const logEl = document.getElementById('log-output');
      if (logEl) {
        const lines = paneId === '__all__' ? allLogLines : (accountStates.find(a=>a.id===paneId)?.logLines || []);
        logEl.innerHTML = buildLogHTML(lines);
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
    renderPane();
  };

  // ── Buttons ──
  document.getElementById("btn-home-run").addEventListener("click", () => { cleanup(); onHome(); });
  document.getElementById("btn-stop").addEventListener("click", async () => {
    if (allBotsDone) return;
    const confirmed = await showRunConfirm(t("run.stop_title"), t("run.stop_msg"));
    if (!confirmed) return;
    window._botIsRunning = false;
    window.api.killBot();
    window.api.botFinished();
    allBotsDone = true;
    for (const acc of accountStates) {
      if (acc.status === "running") acc.status = "failed";
    }
    allLogLines.push({ text: t("run.all_bots_stopped"), cls: "log-warn" });
    badge.textContent = t("run.badge_stopped");
    badge.style.background = "rgba(255,77,109,0.15)";
    badge.style.color = "var(--danger)";
    document.getElementById("btn-stop").style.display = "none";
    const homeBtn = document.getElementById("btn-home-run");
    if (homeBtn) { homeBtn.disabled = false; homeBtn.style.opacity = "1"; homeBtn.style.cursor = "pointer"; }
    startGlobalCooldown();
    showCooldownBar();
    refreshSidebar();
    renderPane();
  });

  // ── Cooldown bar ──
  let cooldownInterval = null;
  function showCooldownBar() {
    const bar = document.getElementById("global-cooldown-bar");
    if (!bar) return;
    bar.style.display = "flex";
    const TOTAL = 6 * 60 * 1000;
    cooldownInterval = setInterval(() => {
      const rem = getCooldownRemaining();
      const timerEl = document.getElementById("cooldown-timer");
      const fillEl  = document.getElementById("cooldown-bar-fill");
      if (timerEl) timerEl.textContent = formatCountdown(rem);
      if (fillEl)  fillEl.style.width  = (rem / TOTAL * 100) + "%";
      if (rem <= 0) { clearInterval(cooldownInterval); bar.style.display = "none"; }
    }, 1000);
  }
  if (getCooldownRemaining() > 0) showCooldownBar();

  // ── Cleanup ──
  function cleanup() {
    clearInterval(cooldownInterval);
    if (window._taagerRestartInterval) { clearInterval(window._taagerRestartInterval); window._taagerRestartInterval = null; }
    window.api.removeAllListeners("bot-log");
    window.api.removeAllListeners("bot-2fa-needed");
    window.api.removeAllListeners("bot-needs-confirm");
    window.api.removeAllListeners("bot-cooldown");
    window.api.removeAllListeners("bot-preview");
    window.api.removeAllListeners("bot-order-progress");
      window.api.removeAllListeners("bot-taager-restart");
      window.api.removeAllListeners("bot-session-event");
      window._opsLiveGlobalBound = false;
  }
  cleanup();

  function isInlineCountdownLog(text) {
    return String(text || "").includes("[تجنب حد التصدير]") ||
      String(text || "").includes("[Account schedule]");
  }

  // ── BOT LOG — route to correct account by [Label] prefix ──
  window.api.onBotLog((rawMsg) => {
    // Check if it's a cooldown countdown
    const isCountdown = isInlineCountdownLog(rawMsg);
    if (isCountdown) {
      const cleanMsg = rawMsg.trim();
      const cls = "log-warn";

      // 1. Update in allLogLines
      const lastAllItem = allLogLines[allLogLines.length - 1];
      if (lastAllItem && isInlineCountdownLog(lastAllItem.text)) {
        lastAllItem.text = cleanMsg;
      } else {
        allLogLines.push({ text: cleanMsg, cls });
      }

      // 2. Update in all accounts' logLines
      for (const a of accountStates) {
        const lastAccItem = a.logLines[a.logLines.length - 1];
        if (lastAccItem && isInlineCountdownLog(lastAccItem.text)) {
          lastAccItem.text = cleanMsg;
        } else {
          a.logLines.push({ text: cleanMsg, cls });
        }
      }

      // 3. Update active DOM if log terminal is active
      if (document.getElementById('tab-log')?.classList.contains('active')) {
        const logEl = document.getElementById("log-output");
        if (logEl) {
          const lastChild = logEl.lastElementChild;
          if (lastChild && isInlineCountdownLog(lastChild.textContent)) {
            lastChild.textContent = cleanMsg;
          } else {
            liveAppendLog("log-output", cleanMsg, cls);
          }
        }
      }
      
      // 4. Update status overview cards if showing '__all__' overview
      if (selectedPane === '__all__' && !document.getElementById('tab-log')?.classList.contains('active')) {
        renderPane();
      }

      refreshSidebar();
      return;
    }

    const match = rawMsg.match(/^\[(.+?)\] ([\s\S]*)$/);
    let acc = null;
    let msg = rawMsg;

    if (match) {
      const label = match[1];
      msg = match[2];
      acc = accountStates.find(a => a.label === label);
      // Sync label from first matching log
      if (!acc) {
        // find by id-based label fallback
        acc = accountStates.find(a => a.id && label.includes(a.id));
      }
      // If still not found try to auto-assign label to unlabelled account
      if (!acc) {
        const unlabelled = accountStates.find(a => a.label.startsWith("Account ") && a.logLines.length === 0);
        if (unlabelled) { unlabelled.label = label; acc = unlabelled; }
      }
    }

    const cls = classifyLog(msg);
    allLogLines.push({ text: rawMsg, cls });

    if (acc) {
      acc.logLines.push({ text: msg, cls });
      updateAccPhases(acc, msg);
    } else {
      for (const a of accountStates) { a.logLines.push({ text: rawMsg, cls }); updateAccPhases(a, rawMsg); }
    }

    // Update log badge when log tab is not active
    if (document.getElementById('tab-log') && !document.getElementById('tab-log').classList.contains('active')) {
      _multiLogLineCount++;
      const badgeEl = document.getElementById('log-badge');
      if (badgeEl) badgeEl.textContent = _multiLogLineCount > 99 ? '99+' : String(_multiLogLineCount);
    }

    // If log tab is active and this account (or all) is selected, append to the shared terminal
    if (document.getElementById('tab-log')?.classList.contains('active')) {
      const shouldShow = selectedPane === '__all__' || (acc && selectedPane === acc.id);
      if (shouldShow) liveAppendLog("log-output", selectedPane === '__all__' ? rawMsg : msg, cls);
    }

    // If status tab active and this account pane is visible, refresh phases
    if (acc && selectedPane === acc.id && !document.getElementById('tab-log')?.classList.contains('active')) {
      const pw = document.getElementById(`phases-wrap-${acc.id}`);
      if (pw) pw.innerHTML = buildPhasesHTML(acc.id);
      // Also refresh overview cards if showing all
    } else if (selectedPane === '__all__') {
      renderPane(); // re-render overview cards with latest phase info
    }

    refreshSidebar();
  });

  // ── ORDER PROGRESS — route by accountId (Task 3) ──
  window.api.on("bot-order-progress", (msg) => {
    const acc = accountStates.find(a => a.id === msg.accountId) || accountStates[0];
    if (!acc) return;
    acc.progress = { current: msg.current, total: msg.total, success: msg.success, failed: msg.failed, lastOrder: msg.lastOrder };

    badge.textContent = t("run.badge_uploading_short");
    badge.style.background = "rgba(0,214,143,0.12)";
    badge.style.color = "var(--success)";

    // Re-render the pane if this account or "all" is visible
    if (selectedPane === acc.id || selectedPane === '__all__') {
      renderPane();
    }
  });

  // ── ORDERS READY PREVIEW — show "N Orders Ready — Uploading Now" panel per account ──
  window.api.onPreview((data) => {
    // Route to correct account via accountId field, fallback to first still-running
    const acc = (data?.accountId ? accountStates.find(a => a.id === data.accountId) : null)
             || accountStates.find(a => a.status === "running")
             || accountStates[0];
    if (!acc) return;

    acc.preview = { rows: data.rows || [], total: data.total || 0, buffer: data.buffer || null };

    badge.textContent = t("run.orders_ready") || "Orders Ready";
    badge.style.background = "rgba(0,214,143,0.12)";
    badge.style.color = "var(--success)";

    // Add a log line so the user sees it
    const accName = accountDisplayName(acc);
    const previewMsg = (()=>{const fn=t("run.preview_ready_log");return typeof fn==="function"?fn(accName, acc.preview.total):fn;})();
    acc.logLines.push({ text: previewMsg, cls: "log-ok" });
    allLogLines.push({ text: previewMsg, cls: "log-ok" });
    if (document.getElementById('tab-log')?.classList.contains('active')) {
      const shouldShow = selectedPane === '__all__' || selectedPane === acc.id;
      if (shouldShow) liveAppendLog("log-output", previewMsg, "log-ok");
    }

    // Re-render pane if this account is visible
    if (selectedPane === acc.id || selectedPane === '__all__') {
      renderPane();
    }
    refreshSidebar();
  });

  // ── Helper to download preview for a specific account ──
  window._multiDownloadPreview = async function(accId) {
    const acc = accountStates.find(a => a.id === accId);
    if (!acc?.preview?.buffer) return;
    const accName = accountDisplayName(acc);
    const result = await window.api.saveOutputFile({ buffer: acc.preview.buffer, filename: `Taager-preview-${safeFilenamePart(accName)}-${runDateTag()}.xlsx` });
    if (result?.saved) {
      const fn = t("run.preview_saved");
      const msg = typeof fn === "function" ? fn(result.path) : fn;
      acc.logLines.push({ text: msg, cls: "log-ok" });
      allLogLines.push({ text: msg, cls: "log-ok" });
    }
  };

  // ── 2FA NEEDED ──
  window.api.on2faNeeded((msg) => {
    const acc = msg?.accountId ? accountStates.find(a => a.id === msg.accountId) : null;
    const accName = acc ? accountDisplayName(acc) : "";
    const tag = acc ? ` [${accName}]` : "";
    const txt = `🔐 ${t("run.2fa_title")}${tag} — ${t("run.2fa_msg")}`;
    allLogLines.push({ text: txt, cls: "log-warn" });
    if (selectedPane === "__all__") liveAppendLog("log-output", txt, "log-warn");
    playSound("confirm");
    if (Notification.permission === "granted") {
      const titleFn = t("run.notif_2fa_title");
      new Notification(typeof titleFn === "function" ? titleFn(tag) : titleFn, { body: t("run.notif_2fa_body") });
    }
  });

  window.api.onGoogleLoginNeeded(async (msg) => {
    const acc = msg?.accountId ? accountStates.find(a => a.id === msg.accountId) : null;
    const accName = acc ? accountDisplayName(acc) : (msg && msg.accountLabel) || "";
    const tag = accName ? ` [${accName}]` : "";
    const txt = `Google login required${tag}. Chrome opened with this bot profile. Log in with Google, then close Chrome. The app will auto-check; click OK only as backup.`;
    allLogLines.push({ text: txt, cls: "log-warn" });
    if (selectedPane === "__all__") liveAppendLog("log-output", txt, "log-warn");
    playSound("confirm");
    window.alert(txt);
    const result = await window.api.completeGoogleLogin(msg && msg.requestId).catch((error) => ({ ok: false, error: error && error.message || String(error) }));
    if (!result || !result.ok) {
      const err = `Google login resume failed${tag}: ${result && result.error || "unknown error"}`;
      allLogLines.push({ text: err, cls: "log-warn" });
      if (selectedPane === "__all__") liveAppendLog("log-output", err, "log-warn");
    }
  });

  window.api.onGoogleLoginComplete((msg) => {
    const acc = msg?.accountId ? accountStates.find(a => a.id === msg.accountId) : null;
    const accName = acc ? accountDisplayName(acc) : (msg && msg.accountLabel) || "";
    const tag = accName ? ` [${accName}]` : "";
    const txt = `Google login verified${tag}.`;
    allLogLines.push({ text: txt, cls: "log-ok" });
    if (selectedPane === "__all__") liveAppendLog("log-output", txt, "log-ok");
  });

  // ── NEEDS CONFIRM ──
  window.api.onNeedsConfirm((msg) => {
    const acc = msg?.accountId ? accountStates.find(a => a.id === msg.accountId) : null;
    const accName = acc ? accountDisplayName(acc) : "";
    const tag = acc ? ` [${accName}]` : "";
    const txt = `👀 ${t("run.confirm_title")}${tag}.`;
    allLogLines.push({ text: txt, cls: "log-warn" });
    if (selectedPane === "__all__") liveAppendLog("log-output", txt, "log-warn");
    badge.textContent = t("run.badge_action_required");
    badge.style.background = "rgba(255,201,77,0.15)";
    badge.style.color = "var(--warning)";
    playSound("confirm");
    if (Notification.permission === "granted") {
      const titleFn = t("run.notif_confirm_title");
      new Notification(typeof titleFn === "function" ? titleFn(tag) : titleFn, { body: t("run.notif_confirm_body") });
    }
  });

  // ── COOLDOWN ──
  window.api.on("bot-cooldown", (msg) => {
    const acc = msg?.accountId ? accountStates.find(a => a.id === msg.accountId) : null;
    const accName = acc ? accountDisplayName(acc) : "";
    const tag = acc ? ` [${accName}]` : "";
    const cooldownFn = t("run.cooldown_attempt");
    const cooldownTxt = typeof cooldownFn === "function" ? cooldownFn(msg.attempt, msg.maxAttempts, msg.seconds) : cooldownFn;
    const txt = `⏸️${tag} ${cooldownTxt}`;
    allLogLines.push({ text: txt, cls: "log-warn" });
    if (selectedPane === "__all__") liveAppendLog("log-output", txt, "log-warn");
    badge.textContent = t("run.badge_cooldown");
    badge.style.background = "rgba(124,106,247,0.15)";
    badge.style.color = "#a89cf7";
  });

  // ── TAAGER RESTART ──
  window.api.on("bot-taager-restart", (msg) => {
    const acc = msg?.accountId ? accountStates.find(a => a.id === msg.accountId) : null;
    const accName = acc ? accountDisplayName(acc) : "";
    const tag = acc ? ` [${accName}]` : "";
    const attemptFn = t("run.restart_attempt");
    const attemptTxt = typeof attemptFn === "function" ? attemptFn(msg.attempt, msg.maxAttempts) : attemptFn;
    const txt = `🔄${tag} ${t("run.restart_title")} — ${msg.reason}. ${attemptTxt}, ${t("run.restart_wait")} ${msg.waitSeconds}s.`;
    allLogLines.push({ text: txt, cls: "log-warn" });
    if (selectedPane === "__all__") liveAppendLog("log-output", txt, "log-warn");
    badge.textContent = t("run.badge_restarting");
    badge.style.background = "rgba(255,107,53,0.15)";
    badge.style.color = "#ff6b35";
  });

  // ── SESSION EVENTS (auto re-login, session desync recovery) ──
  window.api.on("bot-session-event", (msg) => {
    const acc = msg?.accountId ? accountStates.find(a => a.id === msg.accountId) : null;
    const accName = acc ? accountDisplayName(acc) : "";
    const tag = acc ? ` [${accName}]` : "";
    const eventMap = {
      "session-expired":          "⚠️ Session expired — re-logging in...",
      "session-desync-post-action": "⚠️ Session desync detected — re-logging in...",
      "session-probe-failed":     "⚠️ Session probe failed — re-logging in...",
      "login-confirmed":          "✅ Session re-confirmed",
      "session-reused":           "✅ Existing session reused",
    };
    const txt = `🔐${tag} [${msg.site || "bot"}] ${eventMap[msg.event] || msg.event}`;
    allLogLines.push({ text: txt, cls: "log-info" });
    if (selectedPane === "__all__") liveAppendLog("log-output", txt, "log-info");
  });

  // ── START ──
  if (typeof _opsEnsureLiveBindings === "function") _opsEnsureLiveBindings();
  if (typeof _opsStartLiveRun === "function") _opsStartLiveRun();

  renderPane();
  refreshSidebar();
  const badge = document.getElementById("run-status-badge");
  window.api.botStarted();
  allLogLines.push({ text: t("run.log_starting"), cls: "log-info" });
  const dateRangeFn2 = t("run.log_date_range");
  allLogLines.push({ text: typeof dateRangeFn2 === "function" ? dateRangeFn2(dateFrom, dateTo) : dateRangeFn2, cls: "log-info" });
  renderPane();
  badge.textContent = t("run.badge_running");
  badge.style.background = "rgba(79,142,247,0.15)";
  badge.style.color = "var(--accent)";

  if (Notification.permission === "default") Notification.requestPermission();

  if (typeof wireSharedSidebar === "function") wireSharedSidebar(el);

  // ── RUN BOT + handle multi-account result (Task 4) ──
  window.api.runBot({ dateFrom, dateTo, accountIds: selectedAccountIds || [] }).then((result) => {
    allBotsDone = true;
    window._botIsRunning = false;
    window.api.botFinished();
    cleanup();
    startGlobalCooldown();
    showCooldownBar();

    document.getElementById("btn-stop").style.display = "none";
    const homeBtn = document.getElementById("btn-home-run");
    if (homeBtn) { homeBtn.disabled = false; homeBtn.style.opacity = "1"; homeBtn.style.cursor = "pointer"; }

    // License expired
    if (result.error === "LICENSE_INVALID") {
      badge.textContent = t("run.badge_license_expired");
      badge.style.background = "rgba(255,77,109,0.15)";
      badge.style.color = "var(--danger)";
      allLogLines.push({ text: t("run.log_license_expired_short"), cls: "log-err" });
      playSound("error");
      renderPane();
      setTimeout(() => onHome(), 2500);
      return;
    }

    // ── Multi-account: result.multiAccount === true, result.results = array ──
    if (result.multiAccount && Array.isArray(result.results)) {
      const allOk = result.results.every(r => r.success);

      for (const r of result.results) {
        const acc = accountStates.find(a => a.id === r.accountId);
        if (acc) {
          acc.status = r.success ? "done" : "failed";
          for (const ph of acc.phases) { if (ph.state === "active") ph.state = "done"; }
        }
      }

      badge.textContent = allOk ? t("run.badge_all_done") : t("run.badge_done_errors");
      badge.style.background = allOk ? "rgba(0,214,143,0.15)" : "rgba(255,201,77,0.15)";
      badge.style.color = allOk ? "var(--success)" : "var(--warning)";

      const summaryTxt = allOk ? "✅ " + t("results.multi_all_ok") : "⚠️ " + t("results.multi_some_errors");
      allLogLines.push({ text: "\n" + summaryTxt, cls: allOk ? "log-ok" : "log-warn" });

      playSound(allOk ? "success" : "error");
      refreshSidebar();
      renderPane();

      // ── Pass structured multi-account data to results page (Task 5) ──
      setTimeout(() => onComplete({
        _multiAccount: true,
        _accountResults: result.results,
      }), 1200);

    } else {
      // Unexpected single-like error from multi path
      badge.textContent = t("run.badge_failed");
      badge.style.background = "rgba(255,77,109,0.15)";
      badge.style.color = "var(--danger)";
      allLogLines.push({ text: `\n` + (typeof t("run.bot_failed")==="function"?t("run.bot_failed")(result.error):t("run.bot_failed")), cls: "log-err" });
      playSound("error");
      renderPane();
      setTimeout(() => onComplete({ orders: 0, failedOrders: { count: 0 }, _runFailed: true, _failReason: result.error }), 1500);
    }
  });
};

// ── Simple confirm dialog ──
function showRunConfirm(title, message) {
  const t = window._t;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;";
    overlay.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:28px;width:360px;text-align:center">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">${title}</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:24px;line-height:1.5">${message}</div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button id="rc-cancel" class="btn btn-ghost">${t("run.stop_cancel")}</button>
          <button id="rc-confirm" class="btn btn-danger">${t("run.stop_confirm")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("rc-confirm").addEventListener("click", () => { overlay.remove(); resolve(true); });
    document.getElementById("rc-cancel").addEventListener("click",  () => { overlay.remove(); resolve(false); });
  });
}
