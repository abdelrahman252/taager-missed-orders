// section-saudiipick-marketing.js - lightweight Saudi iPick native marketing loader.
(function () {
  'use strict';

  function skeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="saudiipickMarketing" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(780px,82%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:46%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:130px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:210px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  window.renderSectionSaudiIPickMarketing = function (mountEl, data, ctx) {
    if (!mountEl) return;
    if (typeof window.renderSectionSaudiIPickMarketingHydratedEntry === 'function') {
      var immediateCleanup = window.renderSectionSaudiIPickMarketingHydratedEntry(mountEl, data, ctx);
      mountEl.dataset.dashboardReady = 'saudiipickMarketing';
      return typeof immediateCleanup === 'function' ? immediateCleanup : mountEl._dashboardSectionCleanup;
    }
    var state = { cancelled: false, cleanup: null };
    mountEl._saudiIPickMarketingHydrationState = state;
    mountEl.innerHTML = skeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._saudiIPickMarketingHydrationState !== state) return;
      if (typeof window.renderSectionSaudiIPickMarketingHydratedEntry !== 'function') {
        mountEl.innerHTML = skeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var cleanup = window.renderSectionSaudiIPickMarketingHydratedEntry(mountEl, data, ctx);
      state.cleanup = typeof cleanup === 'function' ? cleanup : mountEl._dashboardSectionCleanup;
      mountEl.dataset.dashboardReady = 'saudiipickMarketing';
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardSaudiIPickMarketingHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) window.TaagerDebugLog('dashboard-saudiipick-marketing', 'hydrate:load-failed', {
        error: err && err.message ? err.message : String(err || '')
      }, 'error');
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._saudiIPickMarketingHydrationState === state) mountEl._saudiIPickMarketingHydrationState = null;
    };
  };
})();
