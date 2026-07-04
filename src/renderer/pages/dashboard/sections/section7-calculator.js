// section7-calculator.js - lightweight Calculator loader.
(function () {
  'use strict';

  function calculatorHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="calculator" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(780px,82%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:40%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:120px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:180px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveCalculatorPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'calculator' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSection7 = function (mountEl, data, ctx) {
    if (!mountEl) return;
    var state = { cancelled: false, cleanup: null };
    mountEl._s7HydrationState = state;
    mountEl.innerHTML = calculatorHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._s7HydrationState !== state || !isActiveCalculatorPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSection7HydratedEntry !== 'function') {
        mountEl.innerHTML = calculatorHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSection7HydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveCalculatorPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'calculator';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardCalculatorHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-calculator', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._s7HydrationState === state) mountEl._s7HydrationState = null;
    };
  };
})();
