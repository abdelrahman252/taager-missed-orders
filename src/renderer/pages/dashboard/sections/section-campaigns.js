// section-campaigns.js - lightweight Campaigns loader.
(function () {
  'use strict';

  function campaignsHydratedSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="campaigns" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(800px,84%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:44%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:116px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:240px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveCampaignsPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'campaigns' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSectionCampaigns = function (mountEl, data, ctx) {
    if (!mountEl) return;
    if (typeof window.renderSectionCampaignsHydratedEntry === 'function') {
      var immediateCleanup = window.renderSectionCampaignsHydratedEntry(mountEl, data, ctx);
      mountEl.dataset.dashboardReady = 'campaigns';
      return typeof immediateCleanup === 'function' ? immediateCleanup : mountEl._dashboardSectionCleanup;
    }
    var state = { cancelled: false, cleanup: null };
    mountEl._campaignWrapperHydrationState = state;
    mountEl.innerHTML = campaignsHydratedSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._campaignWrapperHydrationState !== state || !isActiveCampaignsPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSectionCampaignsHydratedEntry !== 'function') {
        mountEl.innerHTML = campaignsHydratedSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSectionCampaignsHydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveCampaignsPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'campaigns';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardCampaignsHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-campaigns', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._campaignWrapperHydrationState === state) mountEl._campaignWrapperHydrationState = null;
    };
  };
})();
