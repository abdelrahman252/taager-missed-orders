// section-daily-performance.js - lightweight Daily Performance loader.
(function () {
  'use strict';

  function dailyPerformanceSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="daily-performance" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(820px,84%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:38%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:104px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:210px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveDailyPerformancePane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'dailyPerformance' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSectionDailyPerformance = function (mountEl, data, ctx) {
    if (!mountEl) return;
    if (typeof window.renderSectionDailyPerformanceHydratedEntry === 'function') {
      var immediateCleanup = window.renderSectionDailyPerformanceHydratedEntry(mountEl, data, ctx);
      mountEl.dataset.dashboardReady = 'dailyPerformance';
      return typeof immediateCleanup === 'function' ? immediateCleanup : mountEl._dashboardSectionCleanup;
    }
    var state = { cancelled: false, cleanup: null };
    mountEl._dailyPerformanceHydrationState = state;
    mountEl.innerHTML = dailyPerformanceSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._dailyPerformanceHydrationState !== state || !isActiveDailyPerformancePane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSectionDailyPerformanceHydratedEntry !== 'function') {
        mountEl.innerHTML = dailyPerformanceSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSectionDailyPerformanceHydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveDailyPerformancePane(mountEl)) {
        mountEl.dataset.dashboardReady = 'dailyPerformance';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardDailyPerformanceHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-daily-performance', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._dailyPerformanceHydrationState === state) mountEl._dailyPerformanceHydrationState = null;
    };
  };
})();
