// section5-products.js - lightweight Products loader.
(function () {
  'use strict';

  function productsHydrationSkeleton() {
    return '<div class="dash-scroll" data-dashboard-hydrating="products" role="status" aria-live="polite" aria-label="Loading" ' +
      'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
        '<div aria-hidden="true" style="width:min(720px,78%);display:grid;gap:14px;">' +
          '<div style="height:28px;width:38%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
          '<div style="height:92px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
          '<div style="height:160px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
        '</div>' +
      '</div>';
  }

  function isActiveProductsPane(mountEl) {
    var shell = document.getElementById('db-shell-mount');
    return !!(mountEl && mountEl.isConnected && shell &&
      shell._dashboardActiveSection === 'products' &&
      shell._dashboardActivePane === mountEl && !mountEl.hidden);
  }

  window.renderSection5 = function (mountEl, data, ctx) {
    if (!mountEl) return;
    if (typeof window.renderSection5HydratedEntry === 'function') {
      window.renderSection5HydratedEntry(mountEl, data, ctx);
      mountEl.dataset.dashboardReady = 'products';
      mountEl.dataset.s5ProductsReady = mountEl.querySelector('.s5-product-row') ? '1' : '0';
      return mountEl._dashboardSectionCleanup;
    }
    var state = { cancelled: false, cleanup: null };
    mountEl._s5HydrationState = state;
    mountEl.innerHTML = productsHydrationSkeleton();
    delete mountEl.dataset.dashboardReady;

    function finish() {
      if (state.cancelled || mountEl._s5HydrationState !== state || !isActiveProductsPane(mountEl)) {
        if (mountEl && mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
        return;
      }
      if (typeof window.renderSection5HydratedEntry !== 'function') {
        mountEl.innerHTML = productsHydrationSkeleton();
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      window.renderSection5HydratedEntry(mountEl, data, ctx);
      state.cleanup = mountEl._dashboardSectionCleanup;
      if (!state.cancelled && isActiveProductsPane(mountEl)) {
        mountEl.dataset.dashboardReady = 'products';
        mountEl.dataset.s5ProductsReady = mountEl.querySelector('.s5-product-row') ? '1' : '0';
      }
    }

    var loadPromise = typeof window.ensureFeatureScripts === 'function'
      ? window.ensureFeatureScripts('dashboardProductsHydrated')
      : Promise.resolve();
    loadPromise.then(finish).catch(function (err) {
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('dashboard-products', 'hydrate:load-failed', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      }
      if (!state.cancelled) mountEl._dashboardNeedsRefresh = true;
    });

    return function () {
      state.cancelled = true;
      if (typeof state.cleanup === 'function') state.cleanup();
      if (mountEl && mountEl._s5HydrationState === state) mountEl._s5HydrationState = null;
    };
  };
})();
