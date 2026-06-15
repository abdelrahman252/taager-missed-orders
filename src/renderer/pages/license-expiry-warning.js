(function () {
  'use strict';

  const WARNING_DAYS = 3;
  let modalEl = null;
  let dismissedSignature = '';
  let visibleSignature = '';

  function text(key, fallback, ...args) {
    const value = window._t ? window._t(key) : null;
    if (typeof value === 'function') return value(...args);
    return typeof value === 'string' && value !== key ? value : fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeDays(value) {
    const days = Number(value);
    return Number.isFinite(days) ? Math.ceil(days) : null;
  }

  function signatureFor(daysLeft, licenseKey) {
    return `${licenseKey || 'license'}:${daysLeft}`;
  }

  function closeWarning() {
    if (!modalEl) return;
    dismissedSignature = visibleSignature;
    modalEl.classList.add('lew-closing');
    window.setTimeout(() => {
      if (modalEl) modalEl.remove();
      modalEl = null;
      visibleSignature = '';
    }, 180);
  }

  function openSupport() {
    if (window.TaagerSupport && typeof window.TaagerSupport.open === 'function') window.TaagerSupport.open();
  }

  function buildModal(daysLeft, licenseKey) {
    const isArabic = (window._kbotLang || document.documentElement.lang || 'en') === 'ar';
    const displayKey = licenseKey
      ? `TAAGER-\u2022\u2022\u2022\u2022-\u2022\u2022\u2022\u2022-\u2022\u2022\u2022\u2022-${escapeHtml(licenseKey.slice(-4) || '????')}`
      : '';
    const modal = document.createElement('div');
    modal.id = 'license-expiry-warning';
    modal.setAttribute('dir', isArabic ? 'rtl' : 'ltr');
    modal.innerHTML = `
      <div class="lew-backdrop" data-lew-close></div>
      <section class="lew-card" role="dialog" aria-modal="true" aria-labelledby="lew-title">
        <button class="lew-close" type="button" aria-label="${escapeHtml(text('warning.close', 'Close'))}" data-lew-close>&times;</button>
        <div class="lew-topline">
          <div class="lew-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 8v5m0 3h.01M10.3 3.8 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.8a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <span class="lew-kicker">${escapeHtml(text('warning.kicker', 'Renewal reminder'))}</span>
        </div>
        <h2 id="lew-title">${escapeHtml(text('warning.title', 'Your license expires soon'))}</h2>
        <p class="lew-copy">${escapeHtml(text('warning.body', "Don't forget to renew your license to keep your work uninterrupted."))}</p>
        <div class="lew-countdown" aria-label="${escapeHtml(text('warning.days_label', 'Days remaining'))}">
          <strong>${daysLeft}</strong>
          <span>${escapeHtml(text('warning.days_remaining', daysLeft === 1 ? 'day remaining' : 'days remaining', daysLeft))}</span>
        </div>
        ${displayKey ? `<div class="lew-license">${escapeHtml(text('warning.license_label', 'License'))}<span>${displayKey}</span></div>` : ''}
        <div class="lew-actions">
          <button id="lew-support" class="lew-btn lew-btn-primary" type="button">${escapeHtml(text('warning.contact', 'Contact Support to Renew'))}</button>
          <button class="lew-btn lew-btn-secondary" type="button" data-lew-close>${escapeHtml(text('warning.later', 'Not now'))}</button>
        </div>
      </section>
      <style>
        #license-expiry-warning {
          position: fixed; inset: 0; z-index: 999990; display: grid; place-items: center;
          padding: 24px; animation: lew-fade-in .22s ease-out both;
        }
        #license-expiry-warning.lew-closing { animation: lew-fade-out .18s ease-in both; }
        .lew-backdrop {
          position: absolute; inset: 0;
          background: radial-gradient(circle at 50% 30%, rgba(245,158,11,.11), transparent 34%), rgba(7,10,18,.72);
          backdrop-filter: blur(12px) saturate(.8); -webkit-backdrop-filter: blur(12px) saturate(.8);
        }
        .lew-card {
          position: relative; width: min(460px, calc(100vw - 40px)); overflow: hidden; padding: 30px;
          border: 1px solid rgba(245,158,11,.28); border-radius: 24px; color: #f8fafc;
          background: radial-gradient(circle at 100% 0, rgba(245,158,11,.17), transparent 34%), linear-gradient(145deg,#171c29,#10141f 72%);
          box-shadow: 0 28px 90px rgba(0,0,0,.58), 0 0 0 1px rgba(255,255,255,.025);
          animation: lew-card-in .34s cubic-bezier(.22,1,.36,1) both;
        }
        .lew-card::before {
          content: ""; position: absolute; inset: 0 0 auto; height: 3px;
          background: linear-gradient(90deg,#f59e0b,#fbbf24,#fb7185);
        }
        .lew-close {
          position: absolute; top: 16px; inset-inline-end: 16px; width: 34px; height: 34px;
          border: 1px solid rgba(255,255,255,.09); border-radius: 10px; color: #94a3b8;
          background: rgba(255,255,255,.045); cursor: pointer; font-size: 22px; line-height: 1;
        }
        .lew-close:hover { color: #fff; border-color: rgba(245,158,11,.35); }
        .lew-topline { display: flex; align-items: center; gap: 11px; margin-bottom: 20px; }
        .lew-icon {
          display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid rgba(245,158,11,.35);
          border-radius: 13px; color: #fbbf24; background: rgba(245,158,11,.11); box-shadow: 0 8px 24px rgba(245,158,11,.1);
        }
        .lew-icon svg { width: 22px; height: 22px; }
        .lew-kicker { color: #fbbf24; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .lew-card h2 { margin: 0 0 10px; font-size: 27px; line-height: 1.2; letter-spacing: -.035em; }
        .lew-copy { margin: 0; color: #aab4c5; font-size: 14px; line-height: 1.75; }
        .lew-countdown {
          display: flex; align-items: baseline; gap: 10px; margin: 24px 0 14px; padding: 17px 19px;
          border: 1px solid rgba(245,158,11,.2); border-radius: 15px; background: rgba(245,158,11,.075);
        }
        .lew-countdown strong { color: #fbbf24; font-size: 34px; line-height: 1; }
        .lew-countdown span { color: #cbd5e1; font-size: 13px; font-weight: 700; }
        .lew-license {
          display: flex; justify-content: space-between; gap: 14px; margin-bottom: 22px; color: #7f8ba0;
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
        }
        .lew-license span { color: #aeb8c8; font-family: monospace; text-transform: none; letter-spacing: .04em; }
        .lew-actions { display: grid; gap: 10px; margin-top: 22px; }
        .lew-btn {
          width: 100%; padding: 13px 16px; border-radius: 11px; cursor: pointer; font-size: 14px; font-weight: 800;
          transition: transform .15s ease, opacity .15s ease, border-color .15s ease;
        }
        .lew-btn:active { transform: scale(.985); }
        .lew-btn-primary { border: 0; color: #17120a; background: linear-gradient(135deg,#fbbf24,#f59e0b); box-shadow: 0 10px 28px rgba(245,158,11,.24); }
        .lew-btn-primary:hover { opacity: .91; }
        .lew-btn-secondary { border: 1px solid rgba(255,255,255,.1); color: #cbd5e1; background: rgba(255,255,255,.035); }
        .lew-btn-secondary:hover { border-color: rgba(245,158,11,.3); color: #fff; }
        [data-theme="light"] .lew-backdrop { background: rgba(226,232,240,.76); }
        [data-theme="light"] .lew-card {
          color: #172033; border-color: rgba(217,119,6,.26);
          background: radial-gradient(circle at 100% 0, rgba(245,158,11,.16), transparent 34%), #fff;
          box-shadow: 0 28px 80px rgba(49,46,36,.2);
        }
        [data-theme="light"] .lew-copy { color: #64748b; }
        [data-theme="light"] .lew-countdown span { color: #475569; }
        [data-theme="light"] .lew-btn-secondary { color: #475569; border-color: #d8dee9; background: #f8fafc; }
        [data-theme="light"] .lew-close { color: #64748b; border-color: #e2e8f0; background: #f8fafc; }
        @keyframes lew-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lew-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes lew-card-in { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 520px) { .lew-card { padding: 26px 22px 22px; border-radius: 19px; } .lew-card h2 { font-size: 23px; } }
      </style>
    `;

    modal.querySelectorAll('[data-lew-close]').forEach((button) => button.addEventListener('click', closeWarning));
    modal.querySelector('#lew-support').addEventListener('click', openSupport);
    return modal;
  }

  function maybeShowWarning({ daysLeft, licenseKey = '' } = {}) {
    const days = normalizeDays(daysLeft);
    if (days == null || days < 1 || days > WARNING_DAYS) {
      if (modalEl) closeWarning();
      return false;
    }

    const signature = signatureFor(days, licenseKey);
    if (modalEl) {
      if (visibleSignature === signature) return false;
      modalEl.remove();
      visibleSignature = signature;
      modalEl = buildModal(days, licenseKey);
      document.body.appendChild(modalEl);
      return true;
    }
    if (dismissedSignature === signature) return false;

    visibleSignature = signature;
    modalEl = buildModal(days, licenseKey);
    document.body.appendChild(modalEl);
    window.setTimeout(() => modalEl && modalEl.querySelector('#lew-support')?.focus(), 100);
    return true;
  }

  window.showLicenseExpiryWarning = maybeShowWarning;
  window.hideLicenseExpiryWarning = closeWarning;
  window.isLicenseExpiryWarningVisible = () => !!modalEl;

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalEl) closeWarning();
  });

  window.addEventListener('taager-lang-change', () => {
    if (!modalEl) return;
    const user = window._kbotUser || {};
    modalEl.remove();
    modalEl = buildModal(normalizeDays(user.daysLeft), user.licenseKey || '');
    document.body.appendChild(modalEl);
  });
})();
