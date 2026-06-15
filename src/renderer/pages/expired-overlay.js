// ── EXPIRED LICENSE OVERLAY ──────────────────────────────────────────────────
// Full-screen application lock shown when the license expires at runtime.
// Does NOT clear accounts, sessions, cookies or any workflow state.
// The app is frozen-in-place; interaction resumes after revalidation.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _overlayEl       = null;
  let _onResumeCallback = null;
  let _revalidating    = false;
  let _revalidateTimer = null;

  // Timestamp shown in the overlay ("last successful validation")
  let _lastValidAt = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Show the fullscreen lock overlay.
   *
   * @param {object}   opts
   * @param {string}   [opts.licenseKey]   - Masked key to display (e.g. "TAAGER-XXXX-…")
   * @param {string}   [opts.reason]       - Optional expiry reason from backend
   * @param {function} opts.onResume       - Called after successful revalidation;
   *                                         overlay hides and workflow can continue.
   */
  window.showExpiredOverlay = function ({ licenseKey = '', reason = '', onResume } = {}) {
    if (_overlayEl) return;                 // already visible
    _onResumeCallback = onResume || null;
    _lastValidAt      = new Date();

    _overlayEl = _buildOverlay(licenseKey, reason);
    document.body.appendChild(_overlayEl);

    // Trap all keyboard input so nothing bleeds through
    document.addEventListener('keydown',  _trapKey,  true);
    document.addEventListener('keypress', _trapKey,  true);
    document.addEventListener('keyup',    _trapKey,  true);

    // Kick off periodic background recheck (every 30 s)
    _startBackgroundRecheck();
  };

  /**
   * Programmatically hide the overlay (e.g. after admin restores the license
   * from the outside and you detect it via a push channel).
   */
  window.hideExpiredOverlay = function () {
    _teardown();
  };

  /** True while the lock overlay is on screen. */
  window.isExpiredOverlayVisible = function () {
    return !!_overlayEl;
  };

  // ── Build DOM ──────────────────────────────────────────────────────────────

  function _buildOverlay(licenseKey, reason) {
    const el = document.createElement('div');
    el.id = 'expired-overlay';
    const t = window._t || ((k) => k);

    // The masked key shown in the footer (show last 4 chars of real key if available)
    const displayKey = licenseKey
      ? 'TAAGER-' + '●●●●-●●●●-●●●●-' + (licenseKey.slice(-4) || '????')
      : '—';

    const now = new Date();
    const formattedTime = now.toLocaleString(undefined, {
      year:   'numeric', month:  'short', day:    'numeric',
      hour:   '2-digit', minute: '2-digit',
    });

    const subtitleFn = t('expired.subtitle');
    const subtitleText = typeof subtitleFn === 'function' ? subtitleFn(reason) : subtitleFn;

    el.innerHTML = `
      <div class="eo-backdrop"></div>
      <div class="eo-card" role="alertdialog" aria-modal="true" aria-labelledby="eo-title">

        <!-- Icon -->
        <div class="eo-icon-wrap">
          <div class="eo-icon">🔒</div>
        </div>

        <!-- Headline -->
        <div id="eo-title" class="eo-title">${t('expired.title')}</div>
        <div class="eo-subtitle">
          ${subtitleText}
        </div>
        <div class="eo-sub2">
          ${t('expired.sub2')}
        </div>

        <!-- Status badge -->
        <div class="eo-status-row">
          <span class="eo-badge eo-badge--expired">${t('expired.badge_expired')}</span>
        </div>

        <!-- Primary action -->
        <button id="eo-continue-btn" class="eo-btn eo-btn--primary">
          ${t('expired.btn_continue')}
        </button>

        <button id="eo-support-btn" class="eo-btn eo-btn--secondary">
          ${t('expired.btn_support') !== 'expired.btn_support' ? t('expired.btn_support') : ((window._kbotLang || 'en') === 'ar' ? 'تواصل مع الدعم' : 'Contact Support')}
        </button>

        <!-- Error message (hidden by default) -->
        <div id="eo-error" class="eo-error" style="display:none"></div>

        <!-- Meta row -->
        <div class="eo-meta">
          <div class="eo-meta-row">
            <span class="eo-meta-label">${t('expired.meta_license_id')}</span>
            <span class="eo-meta-value eo-mono">${displayKey}</span>
          </div>
          <div class="eo-meta-row">
            <span class="eo-meta-label">${t('expired.meta_last_valid')}</span>
            <span class="eo-meta-value">${formattedTime}</span>
          </div>
          <div class="eo-meta-row">
            <span class="eo-meta-label">${t('expired.meta_remaining')}</span>
            <span class="eo-meta-value eo-expired-text">${t('expired.meta_expired')}</span>
          </div>
        </div>

      </div>

      <style id="eo-styles">
        /* ── Overlay wrapper ── */
        #expired-overlay {
          position: fixed;
          inset: 0;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          /* prevent any pointer bleed-through */
          pointer-events: all;
        }

        /* blurred, dark backdrop */
        .eo-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(8, 10, 18, 0.82);
          backdrop-filter: blur(14px) saturate(0.6);
          -webkit-backdrop-filter: blur(14px) saturate(0.6);
        }

        /* Card */
        .eo-card {
          position: relative;
          z-index: 1;
          width: 440px;
          max-width: calc(100vw - 40px);
          background: #161b27;
          border: 1px solid #2a3347;
          border-radius: 18px;
          padding: 44px 36px 36px;
          text-align: center;
          box-shadow:
            0 0 0 1px rgba(255,77,109,.18),
            0 32px 80px rgba(0,0,0,.65),
            0 0 60px rgba(255,77,109,.06);
          animation: eo-enter .35s cubic-bezier(.22,1,.36,1) both;
        }

        @keyframes eo-enter {
          from { opacity:0; transform:scale(.92) translateY(12px); }
          to   { opacity:1; transform:scale(1)   translateY(0);    }
        }

        /* Icon */
        .eo-icon-wrap {
          margin-bottom: 20px;
        }
        .eo-icon {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff4d6d22, #ff4d6d11);
          border: 2px solid rgba(255,77,109,.35);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 34px;
          margin: 0 auto;
          animation: eo-pulse 3s ease-in-out infinite;
        }

        @keyframes eo-pulse {
          0%,100% { box-shadow: 0 0 24px rgba(255,77,109,.25); }
          50%      { box-shadow: 0 0 44px rgba(255,77,109,.5);  }
        }

        /* Text */
        .eo-title {
          font-size: 24px;
          font-weight: 800;
          color: #e8eaf0;
          margin-bottom: 10px;
          letter-spacing: -.4px;
        }

        .eo-subtitle {
          font-size: 14px;
          color: #ff6b84;
          font-weight: 600;
          margin-bottom: 6px;
        }

        .eo-sub2 {
          font-size: 13px;
          color: #8892a4;
          line-height: 1.65;
          margin-bottom: 22px;
        }

        /* Status badge */
        .eo-status-row {
          margin-bottom: 24px;
        }

        .eo-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .06em;
          text-transform: uppercase;
          padding: 4px 14px;
          border-radius: 99px;
        }

        .eo-badge--expired {
          background: rgba(255,77,109,.12);
          border: 1px solid rgba(255,77,109,.35);
          color: #ff6b84;
        }

        .eo-badge--checking {
          background: rgba(251,191,36,.12);
          border: 1px solid rgba(251,191,36,.35);
          color: #fbbf24;
        }

        /* Button */
        .eo-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 700;
          transition: opacity .2s, transform .15s;
          margin-bottom: 14px;
        }
        .eo-btn:active { transform: scale(.98); }

        .eo-btn--primary {
          background: linear-gradient(135deg, #7c6af7, #4f8ef7);
          color: #fff;
          box-shadow: 0 4px 20px rgba(124,106,247,.4);
        }
        .eo-btn--primary:hover:not(:disabled) { opacity: .88; }
        .eo-btn--primary:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .eo-btn--secondary {
          background: transparent;
          color: #c4cad6;
          border: 1px solid #2a3347;
          box-shadow: none;
        }
        .eo-btn--secondary:hover {
          border-color: #7c6af7;
          color: #e8eaf0;
        }

        /* Error */
        .eo-error {
          font-size: 12px;
          font-weight: 600;
          color: #ff4d6d;
          padding: 8px 12px;
          background: rgba(255,77,109,.1);
          border: 1px solid rgba(255,77,109,.25);
          border-radius: 6px;
          margin-bottom: 14px;
          text-align: start;
        }

        /* Meta table */
        .eo-meta {
          border-top: 1px solid #2a3347;
          padding-top: 18px;
          text-align: start;
        }

        .eo-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 0;
          font-size: 12px;
        }

        .eo-meta-label {
          color: #8892a4;
        }

        .eo-meta-value {
          color: #e8eaf0;
          font-weight: 600;
        }

        .eo-mono {
          font-family: monospace;
          letter-spacing: .05em;
          font-size: 11px;
        }

        .eo-expired-text {
          color: #ff6b84;
        }

        /* Light theme overrides */
        [data-theme="light"] .eo-backdrop {
          background: rgba(200,210,230,.75);
          backdrop-filter: blur(14px) saturate(1.2);
          -webkit-backdrop-filter: blur(14px) saturate(1.2);
        }
        [data-theme="light"] .eo-card {
          background: #ffffff;
          border-color: #d0d5e0;
        }
        [data-theme="light"] .eo-title  { color: #111827; }
        [data-theme="light"] .eo-sub2   { color: #4b5563; }
        [data-theme="light"] .eo-meta   { border-color: #d0d5e0; }
        [data-theme="light"] .eo-meta-label { color: #6b7280; }
        [data-theme="light"] .eo-meta-value { color: #111827; }
        [data-theme="light"] .eo-btn--secondary { color: #4b5563; border-color: #d0d5e0; }
        [data-theme="light"] .eo-btn--secondary:hover { color: #111827; border-color: #7c6af7; }
      </style>
    `;

    // Wire up the Continue button
    const continueBtn = el.querySelector('#eo-continue-btn');
    const supportBtn  = el.querySelector('#eo-support-btn');
    const errorEl     = el.querySelector('#eo-error');
    const badge       = el.querySelector('.eo-badge');

    supportBtn.addEventListener('click', () => {
      if (window.TaagerSupport && typeof window.TaagerSupport.open === 'function') window.TaagerSupport.open();
    });

    continueBtn.addEventListener('click', async () => {
      if (_revalidating) return;
      _revalidating = true;
      const t = window._t || ((k) => k);

      continueBtn.textContent = t('expired.btn_checking');
      continueBtn.disabled    = true;
      badge.className         = 'eo-badge eo-badge--checking';
      badge.textContent       = t('expired.badge_checking');
      errorEl.style.display   = 'none';

      try {
        const result = await window.api.checkLicense();
        if (result.valid) {
          // ✅ License is valid — dismiss overlay and resume
          continueBtn.textContent = t('expired.btn_verified');
          continueBtn.style.background = 'linear-gradient(135deg,#00d68f,#00b370)';
          continueBtn.style.boxShadow  = '0 4px 20px rgba(0,214,143,.4)';
          badge.className  = 'eo-badge';
          badge.style.cssText = 'background:rgba(0,214,143,.15);border:1px solid rgba(0,214,143,.4);color:#00d68f';
          badge.textContent = t('expired.badge_active');

          setTimeout(() => {
            _teardown();
            if (_onResumeCallback) _onResumeCallback(result);
          }, 900);
        } else {
          const invalidReason = String((result && result.reason) || '').toLowerCase();
          if ((invalidReason.includes('not found') || invalidReason.includes('no license key')) &&
              typeof window.returnToLicensePage === 'function') {
            window.returnToLicensePage();
            return;
          }
          // ❌ Still expired
          continueBtn.textContent = t('expired.btn_continue');
          continueBtn.disabled    = false;
          badge.className  = 'eo-badge eo-badge--expired';
          badge.textContent = t('expired.badge_expired');

          const errFn = t('expired.err_still');
          errorEl.textContent  = typeof errFn === 'function' ? errFn(result.reason) : errFn;
          errorEl.style.display = 'block';
          _revalidating = false;
        }
      } catch (err) {
        continueBtn.textContent = t('expired.btn_continue');
        continueBtn.disabled    = false;
        badge.className  = 'eo-badge eo-badge--expired';
        badge.textContent = t('expired.badge_expired');
        errorEl.textContent  = t('expired.err_network');
        errorEl.style.display = 'block';
        _revalidating = false;
      }
    });

    // Prevent clicks from leaking to content behind the overlay
    el.addEventListener('mousedown', (e) => {
      if (e.target === el || e.target.classList.contains('eo-backdrop')) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    return el;
  }

  // ── Background recheck every 30 s ─────────────────────────────────────────
  // Auto-dismisses the overlay if admin renews on their side without user action

  function _startBackgroundRecheck() {
    _stopBackgroundRecheck();
    _revalidateTimer = setInterval(async () => {
      if (_revalidating || !_overlayEl) return;
      try {
        const result = await window.api.checkLicense();
        if (result.valid) {
          _teardown();
          if (_onResumeCallback) _onResumeCallback(result);
        }
      } catch (_) { /* silent — no connection, try next tick */ }
    }, 30_000);
  }

  function _stopBackgroundRecheck() {
    if (_revalidateTimer) {
      clearInterval(_revalidateTimer);
      _revalidateTimer = null;
    }
  }

  // ── Key trap ───────────────────────────────────────────────────────────────

  function _trapKey(e) {
    // Allow Tab so the Continue button stays keyboard-accessible,
    // but swallow everything else so no shortcuts bleed through.
    if (e.key === 'Tab') return;
    e.stopPropagation();
    // Don't preventDefault on keydown/keyup for the button itself
    if (e.target && (e.target.id === 'eo-continue-btn' || e.target.id === 'eo-support-btn')) return;
    e.preventDefault();
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  function _teardown() {
    _stopBackgroundRecheck();
    document.removeEventListener('keydown',  _trapKey, true);
    document.removeEventListener('keypress', _trapKey, true);
    document.removeEventListener('keyup',    _trapKey, true);

    if (_overlayEl) {
      const styleEl = document.getElementById('eo-styles');
      if (styleEl) styleEl.remove();
      _overlayEl.remove();
      _overlayEl = null;
    }
    _revalidating     = false;
    _onResumeCallback = null;
  }

})();
