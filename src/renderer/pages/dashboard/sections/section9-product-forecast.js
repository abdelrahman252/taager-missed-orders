// section9-product-forecast.js - lightweight Product Forecast loader.
(function () {
  'use strict';

  function forecastHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="productForecast" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(780px,82%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:46%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:112px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:220px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveForecastPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'productForecast' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSectionProductForecast = function (mountEl, data, ctx) {
    if (!mountEl) return;
    if (typeof window.renderSectionProductForecastHydratedEntry === 'function') {
      var immediateCleanup = window.renderSectionProductForecastHydratedEntry(mountEl, data, ctx);
      mountEl.dataset.dashboardReady = 'productForecast';
      return typeof immediateCleanup === 'function' ? immediateCleanup : mountEl._dashboardSectionCleanup;
    }
    var state = { cancelled: false, cleanup: null };
    mountEl._s9HydrationState = state;
    mountEl.innerHTML = forecastHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._s9HydrationState !== state || !isActiveForecastPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSectionProductForecastHydratedEntry !== 'function') {
        mountEl.innerHTML = forecastHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSectionProductForecastHydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveForecastPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'productForecast';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardForecastHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-forecast', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._s9HydrationState === state) mountEl._s9HydrationState = null;
    };
  };
})();
