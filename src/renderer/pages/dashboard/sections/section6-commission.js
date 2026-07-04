// section6-commission.js - lightweight Commission loader.
(function () {
  'use strict';

  function commissionHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="commission" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(760px,82%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:42%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:116px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:210px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveCommissionPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'commission' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSection6 = function (mountEl, data, ctx) {
    if (!mountEl) return;
    if (typeof window.renderSection6HydratedEntry === 'function') {
      var immediateCleanup = window.renderSection6HydratedEntry(mountEl, data, ctx);
      mountEl.dataset.dashboardReady = 'commission';
      return typeof immediateCleanup === 'function' ? immediateCleanup : mountEl._dashboardSectionCleanup;
    }
    var state = { cancelled: false, cleanup: null };
    mountEl._s6HydrationState = state;
    mountEl.innerHTML = commissionHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._s6HydrationState !== state || !isActiveCommissionPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSection6HydratedEntry !== 'function') {
        mountEl.innerHTML = commissionHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSection6HydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveCommissionPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'commission';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardCommissionHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-commission', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._s6HydrationState === state) mountEl._s6HydrationState = null;
    };
  };
})();
