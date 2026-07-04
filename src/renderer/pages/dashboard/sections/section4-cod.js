// section4-cod.js - lightweight COD loader.
(function () {
  'use strict';

  function codHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="cod" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(740px,80%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:40%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:92px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:190px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveCodPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'cod' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSection4 = function (mountEl, data, ctx) {
    if (!mountEl) return;
    var state = { cancelled: false, cleanup: null };
    mountEl._s4HydrationState = state;
    mountEl.innerHTML = codHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._s4HydrationState !== state || !isActiveCodPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSection4HydratedEntry !== 'function') {
        mountEl.innerHTML = codHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSection4HydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveCodPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'cod';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardCodHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-cod', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._s4HydrationState === state) mountEl._s4HydrationState = null;
    };
  };
})();
