// section-prepaid.js - lightweight Prepaid loader.
(function () {
  'use strict';

  function prepaidHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="prepaid" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(780px,82%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:44%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:112px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:220px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActivePrepaidPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'prepaid' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSectionPrepaid = function (mountEl, data, ctx) {
    if (!mountEl) return;
    var state = { cancelled: false, cleanup: null };
    mountEl._prepaidHydrationState = state;
    mountEl.innerHTML = prepaidHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._prepaidHydrationState !== state || !isActivePrepaidPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSectionPrepaidHydratedEntry !== 'function') {
        mountEl.innerHTML = prepaidHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSectionPrepaidHydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActivePrepaidPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'prepaid';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardPrepaidHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-prepaid', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._prepaidHydrationState === state) mountEl._prepaidHydrationState = null;
    };
  };
})();
