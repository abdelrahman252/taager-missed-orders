// section-marketing-connections.js - lightweight Marketing Connections loader.
(function () {
  'use strict';

  function marketingHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="marketing" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(780px,82%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:46%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:130px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:210px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveMarketingPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'marketing' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSectionMarketingConnections = function (mountEl, data, ctx) {
    if (!mountEl) return;
    if (typeof window.renderSectionMarketingConnectionsHydratedEntry === 'function') {
      var immediateCleanup = window.renderSectionMarketingConnectionsHydratedEntry(mountEl, data, ctx);
      mountEl.dataset.dashboardReady = 'marketing';
      return typeof immediateCleanup === 'function' ? immediateCleanup : mountEl._dashboardSectionCleanup;
    }
    var state = { cancelled: false, cleanup: null };
    mountEl._marketingHydrationState = state;
    mountEl.innerHTML = marketingHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._marketingHydrationState !== state || !isActiveMarketingPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSectionMarketingConnectionsHydratedEntry !== 'function') {
        mountEl.innerHTML = marketingHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSectionMarketingConnectionsHydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveMarketingPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'marketing';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardMarketingHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-marketing', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._marketingHydrationState === state) mountEl._marketingHydrationState = null;
    };
  };
})();
