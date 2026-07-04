// operations-monitor.js — Live Execution Monitor (col3, spans all rows)

function renderOpsMonitor(container) {
  if (!container) return;

  if (typeof _opsEnsureLiveBindings === "function") _opsEnsureLiveBindings();

  container.innerHTML = `
    <div class="ops-monitor-card">
      <div class="ops-monitor-header">
        <div class="ops-monitor-title">⚡ ${window.t_ops('liveMonitor.title')}</div>
        <div class="ops-live-badge" id="ops-live-badge"><span class="ops-live-dot"></span>${window.t_ops('liveMonitor.live')}</div>
      </div>

      <!-- Status + Runtime -->
      <div class="ops-monitor-stat-row">
        <div class="ops-monitor-stat-block">
          <span class="ops-monitor-stat-icon">🟢</span>
          <div class="ops-monitor-stat-inner">
            <div class="ops-monitor-stat-label">${window.t_ops('liveMonitor.status')}</div>
            <div class="ops-monitor-stat-value" id="ops-status-val">
              <span class="ops-status-pill idle">● ${window.t_ops('liveMonitor.idle')}</span>
            </div>
          </div>
        </div>
        <div class="ops-monitor-stat-block">
          <span class="ops-monitor-stat-icon">🕒</span>
          <div class="ops-monitor-stat-inner">
            <div class="ops-monitor-stat-label">${window.t_ops('liveMonitor.runtime')}</div>
            <div class="ops-monitor-stat-value mono" id="ops-runtime-val">00:00:00</div>
          </div>
        </div>
      </div>

      <!-- 3 counters: submitted / failed / current account -->
      <div class="ops-monitor-counters">
        <div class="ops-counter-block success">
          <div class="ops-counter-label">${window.t_ops('liveMonitor.ordersSubmitted')}</div>
          <div class="ops-counter-val" id="ops-submitted-val">0</div>
          <div class="ops-counter-delta green" id="ops-submitted-delta"></div>
        </div>
        <div class="ops-counter-block danger">
          <div class="ops-counter-label">${window.t_ops('liveMonitor.failedOrders')}</div>
          <div class="ops-counter-val" id="ops-failed-val">0</div>
          <div class="ops-counter-delta red" id="ops-failed-delta"></div>
        </div>
        <div class="ops-counter-block info">
          <div class="ops-counter-label">${window.t_ops('liveMonitor.currentAccount')}</div>
          <div class="ops-counter-val small" id="ops-account-val">—</div>
          <div class="ops-counter-delta" id="ops-account-progress"></div>
        </div>
      </div>

      <!-- Current order box (hidden when idle) -->
      <div class="ops-current-order-box" id="ops-current-order-box" style="display:none">
        <div class="ops-current-order-label">${window.t_ops('liveMonitor.currentOrder')}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="ops-current-order-num" id="ops-current-num">—</div>
          <span id="ops-current-status-badge"></span>
        </div>
        <div class="ops-current-order-meta">
          <span id="ops-current-product">—</span>
          <span id="ops-current-city"></span>
          <span id="ops-current-phone"></span>
        </div>
      </div>

      <!-- Progress bar (hidden when idle) -->
      <div class="ops-progress-section" id="ops-progress-section" style="display:none">
        <div class="ops-progress-label-row">
          <span>${window.t_ops('liveMonitor.progress')}</span><span id="ops-progress-pct">0%</span>
        </div>
        <div class="ops-progress-track">
          <div class="ops-progress-bar" id="ops-progress-bar" style="width:0%"></div>
        </div>
      </div>

      <!-- Activity Feed -->
      <div class="ops-feed-section">
        <div class="ops-feed-header">
          <span>📡 ${window.t_ops('liveMonitor.activityFeed')}</span>
          <button class="ops-link-btn" id="ops-feed-clear">${window.t_ops('liveMonitor.clear')}</button>
        </div>
        <div class="ops-feed-list" id="ops-feed-list">
          <div class="ops-feed-empty">${window.t_ops('liveMonitor.waiting')}</div>
        </div>
        <div class="ops-monitor-footer">
          <button class="ops-link-btn" id="ops-view-run-btn">→ ${window.t_ops('liveMonitor.viewLog')}</button>
        </div>
      </div>
    </div>`;

  container.querySelector("#ops-feed-clear")?.addEventListener("click", () => {
    window._opsLive.activityFeed = [];
    _opsRenderFeed(container);
  });
  container.querySelector("#ops-view-run-btn")?.addEventListener("click", () => {
    if (typeof goToSetup === "function") goToSetup("run");
  });

  _opsBindLiveEvents(container);
  _opsSyncMonitorUI(container);

  // Runtime ticker — clear existing before starting a new one to prevent leaks
  if (window._opsRuntimeInterval) {
    clearInterval(window._opsRuntimeInterval);
    window._opsRuntimeInterval = null;
  }
  window._opsRuntimeInterval = setInterval(() => {
    if (!window._opsLive.isRunning || !window._opsLive.startTime) return;
    const el = document.getElementById("ops-runtime-val");
    if (el) el.textContent = _opsFmtElapsed(Date.now() - window._opsLive.startTime);
  }, 1000);
}

function _opsBindLiveEvents(container) {
  if (container._opsLiveUiHandler) {
    window.removeEventListener("taager-ops-live-updated", container._opsLiveUiHandler);
  }
  container._opsLiveUiHandler = () => _opsSyncMonitorUI(container);
  window.addEventListener("taager-ops-live-updated", container._opsLiveUiHandler);
  return;

  if (window._opsMonitorBound) return;
  window._opsMonitorBound = true;

  window.api?.onOrderProgress?.((msg) => {
    const live = window._opsLive;
    live.isRunning          = true;
    live.submitted          = msg.success         ?? live.submitted;
    live.failed             = msg.failed           ?? live.failed;
    live.total              = msg.total            ?? live.total;
    live.currentAccount     = msg.accountEmail     || live.currentAccount;
    live.currentAccountIdx  = msg.accountIdx       ?? live.currentAccountIdx;
    live.totalAccounts      = msg.totalAccounts    ?? live.totalAccounts;
    live.progressPct        = live.total > 0 ? Math.round(((msg.current || 0) / live.total) * 100) : 0;
    if (!live.startTime) live.startTime = Date.now();
    if (msg.lastOrder) {
      live.currentOrder = msg.lastOrder;
      const isErr = !!msg.lastOrder.error;
      _opsPushFeed(
        isErr
          ? window.t_ops('liveMonitor.feed.orderFailed', { order: msg.lastOrder.name || "—", error: msg.lastOrder.error || "" })
          : window.t_ops('liveMonitor.feed.orderSubmitted', { order: msg.lastOrder.name || "—" }),
        isErr ? "error" : "success"
      );
    }
    _opsSyncMonitorUI(container);
  });

  window.api?.onBotLog?.((msg) => {
    const cleanMsg = msg.trim();
    if (!cleanMsg) return;

    let type = "info";
    if (cleanMsg.includes("❌") || cleanMsg.toLowerCase().includes("failed") || cleanMsg.toLowerCase().includes("error")) {
      type = "error";
    } else if (cleanMsg.includes("✅") || cleanMsg.toLowerCase().includes("success") || cleanMsg.toLowerCase().includes("completed")) {
      type = "success";
    } else if (cleanMsg.includes("⚠️") || cleanMsg.includes("⏳") || cleanMsg.toLowerCase().includes("warning") || cleanMsg.toLowerCase().includes("cooldown")) {
      type = "warn";
    }

    _opsPushFeed(cleanMsg, type);
    _opsSyncMonitorUI(container);
  });

  window.api?.on?.("bot-run-complete", () => {
    window._opsLive.isRunning = false;
    _opsPushFeed(window.t_ops('liveMonitor.feed.runCompleted'), "success");
    _opsSyncMonitorUI(container);
  });
}

function _opsSyncMonitorUI(container) {
  if (!container) return;
  const live = window._opsLive;

  // Status pill
  const statusEl = container.querySelector("#ops-status-val");
  if (statusEl) statusEl.innerHTML = live.isRunning
    ? `<span class="ops-status-pill running">● ${window.t_ops('liveMonitor.running')}</span>`
    : `<span class="ops-status-pill idle">● ${window.t_ops('liveMonitor.idle')}</span>`;

  // LIVE badge glow
  const badge = container.querySelector("#ops-live-badge");
  if (badge) badge.classList.toggle("active", live.isRunning);

  // Status icon color
  const iconEl = container.querySelector(".ops-monitor-stat-icon");
  if (iconEl) iconEl.textContent = live.isRunning ? "🟢" : "⚪";

  // Counters
  const subEl  = container.querySelector("#ops-submitted-val");
  const failEl = container.querySelector("#ops-failed-val");
  const accEl  = container.querySelector("#ops-account-val");
  const accDelta  = container.querySelector("#ops-account-progress");
  const subDelta  = container.querySelector("#ops-submitted-delta");
  const failDelta = container.querySelector("#ops-failed-delta");

  if (subEl)  subEl.textContent  = live.submitted.toLocaleString("en-US");
  if (failEl) failEl.textContent = live.failed.toLocaleString("en-US");
  if (accEl)  accEl.textContent  = _opsShortEmail(live.currentAccount) || "—";
  if (accDelta && live.totalAccounts > 1) accDelta.textContent = `${live.currentAccountIdx + 1} / ${live.totalAccounts}`;
  if (subDelta && live.submitted > 0) subDelta.textContent = `+${live.submitted} ${window.t_ops('liveMonitor.vsLast15m')}`;
  if (failDelta && live.failed > 0)   failDelta.textContent = `+${live.failed} ${window.t_ops('liveMonitor.vsLast15m')}`;

  // Current order box
  const orderBox = container.querySelector("#ops-current-order-box");
  if (orderBox) {
    if (live.isRunning && live.currentOrder) {
      orderBox.style.display = "";
      const numEl    = container.querySelector("#ops-current-num");
      const prodEl   = container.querySelector("#ops-current-product");
      const cityEl   = container.querySelector("#ops-current-city");
      const phoneEl  = container.querySelector("#ops-current-phone");
      const statBadge = container.querySelector("#ops-current-status-badge");
      if (numEl)  numEl.textContent  = "#" + (live.currentOrder.name || "—");
      if (prodEl) prodEl.textContent = live.currentOrder.product || live.currentOrder.sku || "—";
      if (cityEl && live.currentOrder.city)   cityEl.textContent  = "📍 " + live.currentOrder.city;
      if (phoneEl && live.currentOrder.phone) phoneEl.textContent = "📞 " + live.currentOrder.phone;
      if (statBadge && live.currentOrder.orderStatus) {
        const sc = _opsStatusColor(live.currentOrder.orderStatus);
        statBadge.innerHTML = `<span style="background:${sc.bg};color:${sc.text};padding:2px 9px;border-radius:var(--radius-sm);font-size:var(--type-caption);font-weight:var(--weight-semibold)">${live.currentOrder.orderStatus}</span>`;
      }
    } else {
      orderBox.style.display = "none";
    }
  }

  // Progress
  const progSection = container.querySelector("#ops-progress-section");
  const progBar     = container.querySelector("#ops-progress-bar");
  const progPct     = container.querySelector("#ops-progress-pct");
  if (progSection) progSection.style.display = live.isRunning ? "" : "none";
  if (progBar)  progBar.style.width  = `${live.progressPct}%`;
  if (progPct)  progPct.textContent  = `${live.progressPct}%`;

  _opsRenderFeed(container);
}

function _opsPushFeed(text, type) {
  if (typeof _opsGlobalPushFeed === "function") {
    _opsGlobalPushFeed(text, type);
    return;
  }
  const feed = window._opsLive.activityFeed;
  feed.unshift({
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    text, type: type || "info",
  });
  if (feed.length > 100) feed.length = 100;
}

function _opsRenderFeed(container) {
  const listEl = container?.querySelector("#ops-feed-list");
  if (!listEl) return;
  const feed = window._opsLive.activityFeed;
  if (!feed.length) {
    listEl.innerHTML = `<div class="ops-feed-empty">${window.t_ops('liveMonitor.waiting')}</div>`;
    return;
  }
  // Icon map matching reference: ✓ success, ✗ error, ↺ warn, · info
  const iconMap = { success: "✓", error: "✗", warn: "↺", info: "·" };
  listEl.innerHTML = feed.slice(0, 30).map(e => `
    <div class="ops-feed-item ${e.type}">
      <span class="ops-feed-time">${e.time}</span>
      <span class="ops-feed-text">${e.text}</span>
      <span class="ops-feed-icon">${iconMap[e.type] || "·"}</span>
    </div>`).join("");
}
