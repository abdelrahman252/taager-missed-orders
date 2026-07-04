// section-cities.js - lightweight Cities loader.
(function () {
  'use strict';

  function citiesHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="cities" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(760px,80%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:42%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:88px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:220px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveCitiesPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'cities' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSectionCities = function (mountEl, data, ctx) {
    if (!mountEl) return;
    var state = { cancelled: false, cleanup: null };
    mountEl._citiesWrapperHydrationState = state;
    mountEl.innerHTML = citiesHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._citiesWrapperHydrationState !== state || !isActiveCitiesPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSectionCitiesHydratedEntry !== 'function') {
        mountEl.innerHTML = citiesHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSectionCitiesHydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveCitiesPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'cities';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardCitiesHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-cities', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._citiesWrapperHydrationState === state) mountEl._citiesWrapperHydrationState = null;
    };
  };
})();
