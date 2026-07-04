/*
   dashboard.js
   Outer Dashboard page mount. The inner shell owns the fixed topbar, section
   routing, and account changes; this file owns loading aggregator data.
*/
(function () {
  'use strict';

  function dbg(event, detail, level) {
    if (window.TaagerDebugLog) window.TaagerDebugLog('dashboard-data', event, detail || {}, level);
    else (console[level || 'log'] || console.log).call(console, '[DashboardData] ' + event, detail || {});
  }

  function resetObject(target, source) {
    Object.keys(target).forEach(function (key) {
      delete target[key];
    });
    Object.keys(source || {}).forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor) Object.defineProperty(target, key, descriptor);
    });
  }

  function emptyDashboardData() {
    var allLabel = window.dashboardI18n ? window.dashboardI18n.t('shell.allAccounts') : 'كل الحسابات المشتركة';
    var noUpdate = window.dashboardI18n ? window.dashboardI18n.t('shell.noUpdate') : 'لا يوجد تحديث';
    return {
      _loaded: true,
      meta: {
        activeAccountId: window.getActiveAccountId ? window.getActiveAccountId() : '__all__',
        activeAccountLabel: window.currentActiveAccountLabel || allLabel,
        monthLabel: '',
        hasData: false,
        lastUpdatedLabel: noUpdate,
        accountOptions: window.dashboardAccountsList || [{ id: '__all__', value: '__all__', label: allLabel, name: allLabel, orderCount: 0 }]
      },
      overview: null,
      pipeline: null,
      stages: [],
      orders: [],
      outcomeOrders: [],
      cod: null,
      products: null,
      commissionTrend: null,
      orderSources: null,
      roi: null,
      geo: null
    };
  }

  function mapAggregatorToSections(result) {
    function getOrders() {
      if (result && typeof result.getCreatedOrders === 'function') return result.getCreatedOrders();
      return Array.isArray(result && result.orders) ? result.orders : [];
    }
    function getOutcomeOrders() {
      if (result && typeof result.getOutcomeOrders === 'function') return result.getOutcomeOrders();
      return Array.isArray(result && result.outcomeOrders) ? result.outcomeOrders : getOrders();
    }
    var pipeline = result.pipeline ? Object.assign({}, result.pipeline) : null;
    if (pipeline) {
      Object.defineProperty(pipeline, 'orders', {
        enumerable: true,
        configurable: true,
        get: getOrders
      });
    }
    return {
      _loaded: true,
      meta: result.meta || {},
      overview: result.overview || null,
      pipeline: pipeline,
      stages: result.pipeline && result.pipeline.stages ? result.pipeline.stages : [],
      statusSummary: result.statusSummary || (result.pipeline && result.pipeline.statusSummary) || [],
      lostBreakdown: result.lostBreakdown || (result.pipeline && result.pipeline.lostBreakdown) || [],
      get orders() { return getOrders(); },
      get outcomeOrders() { return getOutcomeOrders(); },
      getCreatedOrders: getOrders,
      getOutcomeOrders: getOutcomeOrders,
      orderSources: result.orderSources || null,
      cod: result.cod || null,
      products: result.products || null,
      commissionTrend: result.commissionTrend || null,
      roi: result.roi || null,
      geo: result.geo || null
    };
  }

  window.renderDashboard = function () {
    dbg('renderDashboard:start', {
      activeAccountId: window.getActiveAccountId ? window.getActiveAccountId() : '__all__',
      hasExistingMount: !!document.getElementById('db-shell-mount'),
      hasInFlightAggregation: !!window.__dashboardAggregationInFlight
    });
    var dashboardMountTimer = window.TaagerPerf && window.TaagerPerf.start
      ? window.TaagerPerf.start('dashboard:shell:mount', { route: 'dashboard' })
      : null;
    var el = document.getElementById('page-dashboard');
    if (!el) return;

    // Preserve the active section across re-renders (e.g. language switches).
    // The shell stores it on the mount element; save it before the DOM is wiped.
    var prevMount = document.getElementById('db-shell-mount');
    if (prevMount && prevMount._dashboardActiveSection) {
      window._dashboardInitialSection = prevMount._dashboardActiveSection;
    }

    el.innerHTML =
      '<div class="sv3-shell dashboard-page-shell">' +
        renderSharedSidebar('dashboard') +
        '<div class="dashboard-page-main">' +
          '<div id="db-shell-mount"></div>' +
          '<div id="dashboard-update-overlay" class="dashboard-update-overlay" hidden aria-live="polite" aria-busy="false"></div>' +
        '</div>' +
      '</div>';

    wireSharedSidebar(el);
    if (window.dashboardI18n) window.dashboardI18n.apply(el);
    dbg('renderDashboard:dom-mounted', {
      shellMount: !!document.getElementById('db-shell-mount'),
      updateOverlay: !!document.getElementById('dashboard-update-overlay')
    });

    var shellMount = document.getElementById('db-shell-mount');
    var updateOverlay = document.getElementById('dashboard-update-overlay');
    var dashData = { _loaded: false, meta: { accountOptions: window.dashboardAccountsList || [] } };
    var dashVersion = 0;
    var marketingStatusLoads = {};
    var marketingSectionRefreshes = {};
    var activeMarketingSyncPromise = null;
    var activeMarketingSyncKey = '';
    var aiMirrorWarmVersion = null;
    var aiMirrorWarmHandle = null;
    var dashboardHasCompletedInitialLoad = false;
    var dashboardAggregatorRunId = 0;
    var marketingUiSections = ['products', 'campaigns', 'commission', 'calculator', 'productForecast', 'taagerAi'];

    function updateMarketingPendingOverlay() {
      if (!shellMount || !shellMount.isConnected) return;
      var existing = shellMount.querySelector('.dashboard-marketing-pending-overlay');
      var sectionId = shellMount._dashboardActiveSection || 'master';
      if (marketingUiSections.indexOf(sectionId) === -1) {
        if (existing) existing.remove();
        return;
      }
      var accountId = window.getActiveAccountId ? window.getActiveAccountId() : '__all__';
      var state = window.DashboardMarketingState && window.DashboardMarketingState.get
        ? window.DashboardMarketingState.get(accountId)
        : null;
      var pending = !!(state && state.loading && !state.manualOverride);
      var unavailable = !!(state && state.status === 'connected' && state.error && !state.manualOverride);
      if (!pending && !unavailable) {
        if (existing) existing.remove();
        return;
      }
      var pane = shellMount._dashboardActivePane;
      if (!pane || !pane.isConnected) return;
      pane.style.position = 'relative';
      var overlay = document.createElement('div');
      overlay.className = 'dashboard-marketing-pending-overlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.style.cssText = 'position:absolute;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:center;padding:72px 24px;background:rgba(8,11,18,.9);backdrop-filter:blur(5px);border-radius:var(--dash-radius-xl);';
      var pick = window.dashboardI18n && window.dashboardI18n.pick
        ? window.dashboardI18n.pick.bind(window.dashboardI18n)
        : function (en) { return en; };
      var title = unavailable
        ? pick('Marketing spend unavailable', 'الإنفاق التسويقي غير متاح')
        : pick('Loading marketing spend...', 'جار تحميل الإنفاق التسويقي...');
      var body = unavailable
        ? pick('The connected spend could not be refreshed. Try again from Marketing connections.', 'تعذر تحديث الإنفاق المتصل. حاول مرة أخرى من اتصالات التسويق.')
        : pick('Order data is ready. Spend-dependent results will appear when the connected marketing sync finishes.', 'بيانات الطلبات جاهزة. ستظهر النتائج المعتمدة على الإنفاق عند اكتمال مزامنة التسويق المتصل.');
      overlay.setAttribute('data-dashboard-marketing-overlay-key', [
        pane.dataset.sectionId || sectionId,
        pending ? 'pending' : 'unavailable',
        title,
        body
      ].join('|'));
      if (existing && existing.parentNode === pane &&
          existing.getAttribute('data-dashboard-marketing-overlay-key') === overlay.getAttribute('data-dashboard-marketing-overlay-key')) {
        return;
      }
      if (existing) existing.remove();
      overlay.innerHTML = '<div style="width:min(440px,100%);padding:24px;border-radius:var(--dash-radius-xl);border:1px solid rgba(96,165,250,.25);background:var(--dash-surface);box-shadow:0 18px 60px rgba(0,0,0,.4);text-align:center;">' +
        (pending && window.dashboardMarketingLoadingHtml ? window.dashboardMarketingLoadingHtml() : '') +
        '<div style="margin-top:12px;font-size:var(--type-component-title);font-weight:var(--weight-semibold);color:#f8fafc;">' + title + '</div>' +
        '<div style="margin-top:8px;font-size:var(--type-caption);line-height:1.65;color:#94a3b8;">' + body + '</div>' +
      '</div>';
      pane.appendChild(overlay);
    }

    if (window.DashboardMarketingState) {
      if (window._dashboardMarketingUiListener) {
        window.DashboardMarketingState.unsubscribe(window._dashboardMarketingUiListener);
      }
      window._dashboardMarketingUiListener = function dashboardMarketingUiListener(next) {
        if (!shellMount || !shellMount.isConnected) {
          if (window.DashboardMarketingState && typeof window.DashboardMarketingState.unsubscribe === 'function') {
            window.DashboardMarketingState.unsubscribe(window._dashboardMarketingUiListener);
          }
          if (window._dashboardMarketingUiListener === dashboardMarketingUiListener) window._dashboardMarketingUiListener = null;
          return;
        }
        if (!next || next.platform !== 'combined') return;
        var activeId = window.getActiveAccountId ? window.getActiveAccountId() : '__all__';
        if (String(next.accountId) !== String(activeId)) return;
        setTimeout(updateMarketingPendingOverlay, 0);
      };
      window.DashboardMarketingState.subscribe(window._dashboardMarketingUiListener);
    }

    function dashboardRangeKey(range) {
      if (!range) return '';
      return [
        range.preset || '',
        range.dateFrom || '',
        range.dateTo || ''
      ].join(':');
    }

    function dashboardAggregationKey() {
      var activeId = window.getActiveAccountId ? window.getActiveAccountId() : '__all__';
      var period = window.DashboardPeriodState && typeof window.DashboardPeriodState.get === 'function'
        ? window.DashboardPeriodState.get()
        : null;
      var deliveredMode = window.DashboardDeliveredDateState && typeof window.DashboardDeliveredDateState.get === 'function'
        ? window.DashboardDeliveredDateState.get()
        : 'actual';
      var ndrRange = deliveredMode === 'expected' && window.DashboardExpectedNdrRangeState && typeof window.DashboardExpectedNdrRangeState.get === 'function'
        ? window.DashboardExpectedNdrRangeState.get()
        : null;
      var reportingCurrency = '';
      try { reportingCurrency = localStorage.getItem('taager_dashboard_reporting_currency') || ''; } catch (_) {}
      return [
        String(activeId || '__all__'),
        dashboardRangeKey(period),
        String(deliveredMode || 'actual'),
        dashboardRangeKey(ndrRange),
        String(reportingCurrency || '')
      ].join('|');
    }

    function dashboardLazyOrderCount(data) {
      var total = data && data.overview && data.overview.totalOrders;
      if (total && total.value != null) return Number(total.value || 0);
      if (total && total.rawValue != null) return Number(total.rawValue || 0);
      var meta = data && data.meta;
      if (meta && meta.rowCount != null) return Number(meta.rowCount || 0);
      return 0;
    }

    function esc(value) {
      if (window.TaagerUI && typeof window.TaagerUI.esc === 'function') return window.TaagerUI.esc(value);
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }

    function setDashboardUpdateOverlay(state) {
      var overlay = document.getElementById('dashboard-update-overlay') || updateOverlay;
      if (!overlay) return;
      state = state || {};
      var active = !!state.active;
      overlay.hidden = !active;
      overlay.setAttribute('aria-busy', active ? 'true' : 'false');
      if (!active) {
        overlay.innerHTML = '';
        return;
      }
      var title = state.title || (window._t ? window._t('dashboard.fetching_title') : 'Updating dashboard...');
      var body = state.body || (window._t ? window._t('dashboard.fetching_body') : 'Fetching orders, refreshing product data, and matching ad spend across accounts. This can take a few minutes; keep the app open.');
      overlay.innerHTML =
        '<div class="dashboard-update-panel" role="status">' +
          '<span class="dash-preloader-spinner" aria-hidden="true"></span>' +
          '<div class="dashboard-update-copy">' +
            '<strong>' + esc(title) + '</strong>' +
            '<span>' + esc(body) + '</span>' +
          '</div>' +
        '</div>';
    }

    window.setDashboardUpdateOverlay = setDashboardUpdateOverlay;
    if (window._dashboardFetchState) setDashboardUpdateOverlay(window._dashboardFetchState);

    window.refreshDashboard = function () {
      runAggregator(true);
    };

    function ensureMarketingStatusLoaded(data) {
      var store = window.DashboardMarketingState;
      if (!store || typeof store.get !== 'function' || typeof store.load !== 'function') return Promise.resolve(null);
      var meta = data && data.meta ? data.meta : {};
      var accountId = meta.activeAccountId || (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');
      accountId = String(accountId || '__all__');
      if (!accountId) return Promise.resolve(null);

      var current = store.get(accountId);
      if (current && current.loading && marketingStatusLoads[accountId]) return marketingStatusLoads[accountId];
      if (marketingStatusLoads[accountId]) return marketingStatusLoads[accountId];
      if (current && current.error && !current.reconnectRequired) {
        marketingStatusLoads[accountId] = store.load(accountId, undefined, {
          revalidate: true,
          background: true
        }).catch(function () { return current; }).then(function (status) {
          marketingStatusLoads[accountId] = null;
          return status;
        });
        return marketingStatusLoads[accountId];
      }
      if (current && (current.summary || current.status !== 'disconnected' || current.offline || current.reconnectRequired)) {
        return Promise.resolve(current);
      }

      marketingStatusLoads[accountId] = store.load(accountId).catch(function () { return null; }).then(function (status) {
        marketingStatusLoads[accountId] = null;
        return status;
      });
      return marketingStatusLoads[accountId];
    }

    function marketingSummaryMatchesRange(status, payload) {
      var summary = status && status.summary;
      if (!summary || !payload) return false;
      var summaryFrom = String(summary.dateFrom || '').slice(0, 10);
      var summaryTo = String(summary.dateTo || '').slice(0, 10);
      var payloadFrom = String(payload.dateFrom || '').slice(0, 10);
      var payloadTo = String(payload.dateTo || '').slice(0, 10);
      var summaryCurrency = String(summary.currency || '').toUpperCase();
      var payloadCurrency = String(payload.targetCurrency || '').toUpperCase();
      var summaryRate = Number(summary.egpRate || 0);
      var payloadRate = Number(payload.egpRate || 0);
      var rateMatches = !summaryRate || !payloadRate || Math.abs(summaryRate - payloadRate) < 0.0001;
      var payloadRates = payload.exchangeRates && typeof payload.exchangeRates === 'object' ? payload.exchangeRates : null;
      var summaryRates = summary.exchangeRates && typeof summary.exchangeRates === 'object' ? summary.exchangeRates : null;
      if (payloadRates) {
        if (!summaryRates) return false;
        var supported = ['USD', 'SAR', 'EGP', 'AED', 'IQD', 'OMR'];
        rateMatches = supported.every(function (currency) {
          var nextRate = Number(payloadRates[currency]);
          var cachedRate = Number(summaryRates[currency]);
          if (!(nextRate > 0) && !(cachedRate > 0)) return true;
          return nextRate > 0 && cachedRate > 0 && Math.abs(nextRate - cachedRate) < 0.0001;
        });
      }
      return !!(
        summaryFrom && summaryTo &&
        summaryFrom === payloadFrom &&
        summaryTo === payloadTo &&
        (!summaryCurrency || !payloadCurrency || summaryCurrency === payloadCurrency) &&
        rateMatches
      );
    }

    function dashboardCurrencyRates() {
      if (window.TaagerCurrency && typeof window.TaagerCurrency.snapshot === 'function') {
        var snapshot = window.TaagerCurrency.snapshot() || {};
        if (snapshot.rates && typeof snapshot.rates === 'object') return Object.assign({}, snapshot.rates);
      }
      if (window.TaagerCurrency && typeof window.TaagerCurrency.rates === 'function') {
        return Object.assign({}, window.TaagerCurrency.rates() || {});
      }
      return {};
    }

    function sectionNeedsMarketing(sectionId) {
      return ['master', 'overview', 'products', 'marketing', 'campaigns', 'calculator', 'productForecast', 'taagerAi'].indexOf(sectionId) !== -1;
    }

    function sectionHandlesMarketingState(sectionId) {
      return ['master', 'products', 'marketing', 'calculator', 'productForecast'].indexOf(sectionId) !== -1;
    }

    function warmDashboardAiMirror(data) {
      if (!window.DashboardAiMirror || typeof window.DashboardAiMirror.warm !== 'function') return;
      if (data && data.meta && data.meta.lazyHeavyModels) return;
      var version = data && data._version != null ? data._version : 'loaded';
      if (aiMirrorWarmVersion === version || aiMirrorWarmHandle) return;
      var run = function () {
        aiMirrorWarmHandle = null;
        if (!shellMount.isConnected) return;
        aiMirrorWarmVersion = version;
        window.DashboardAiMirror.warm(data, { force: false }).catch(function () {});
      };
      if (window.requestIdleCallback) aiMirrorWarmHandle = window.requestIdleCallback(run, { timeout: 2000 });
      else aiMirrorWarmHandle = window.setTimeout(run, 250);
    }

    function completeInitialDashboardPreloader(options) {
      if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardComplete === 'function') {
        return Promise.resolve(window.TaagerPreloader.dashboardComplete(options || {}));
      }
      return Promise.resolve();
    }

    function runAggregator(showLoader, beforeInitialRenderPromise) {
      var aggregationKey = dashboardAggregationKey();
      var existingAggregation = window.__dashboardAggregationInFlight;
      var sharedAggregation = !!(
        existingAggregation &&
        existingAggregation.key === aggregationKey &&
        existingAggregation.promise
      );
      var runId = sharedAggregation ? dashboardAggregatorRunId : ++dashboardAggregatorRunId;
      var smoothRefreshLoader = !!(showLoader && dashboardHasCompletedInitialLoad);
      dbg('aggregator:start', {
        runId: runId,
        showLoader: !!showLoader,
        smoothRefreshLoader: smoothRefreshLoader,
        sharedAggregation: sharedAggregation,
        aggregationKey: aggregationKey,
        completedInitialLoad: dashboardHasCompletedInitialLoad,
        existingRunId: existingAggregation && existingAggregation.runId
      });
      var aggregatorTimer = window.TaagerPerf && window.TaagerPerf.start
        ? window.TaagerPerf.start('dashboard:data:aggregation', {
          showLoader: !!showLoader,
          sharedAggregation: sharedAggregation,
          sourceRunId: sharedAggregation ? existingAggregation.runId : null
        })
        : null;
      var readyResolve = null;
      var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });
      if (document.getElementById('preloader') && !window._dashboardInitialReady) {
        window._dashboardInitialReady = readyPromise;
        dbg('aggregator:initial-ready-promise-set', { runId: runId });
      }

      function dashboardLoaderStage(stageId, options) {
        dbg('aggregator:preloader-stage', { runId: runId, stageId: stageId, options: options || {} });
        if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
          window.TaagerPreloader.dashboardStage(stageId, options || {});
        }
      }

      function completeDashboardLoad(activity, afterComplete, options) {
        var completeOptions = Object.assign({}, options || {}, {
          activity: activity || 'Dashboard ready.',
          smooth: smoothRefreshLoader
        });
        dbg('aggregator:completeDashboardLoad:start', {
          runId: runId,
          activity: activity,
          completeOptions: completeOptions,
          smoothRefreshLoader: smoothRefreshLoader,
          hasAfterComplete: typeof afterComplete === 'function'
        });
        // Complete the still-mounted section loader before refreshDashboardShell
        // replaces it. This also stops its progress timer without a trailing tick
        // against a detached DOM node.
        completeInitialDashboardPreloader(completeOptions).then(function () {
          if (runId !== dashboardAggregatorRunId) {
            dbg('aggregator:completeDashboardLoad:stale-after-preloader', {
              runId: runId,
              currentRunId: dashboardAggregatorRunId
            }, 'warn');
            if (readyResolve) {
              readyResolve(dashData);
              readyResolve = null;
              dbg('aggregator:ready-resolved-stale', { runId: runId });
            }
            return;
          }
          if (typeof afterComplete === 'function') afterComplete();
          dashboardHasCompletedInitialLoad = true;
          if (readyResolve) {
            readyResolve(dashData);
            readyResolve = null;
            dbg('aggregator:ready-resolved', {
              runId: runId,
              version: dashData && dashData._version,
              loaded: !!(dashData && dashData._loaded),
              loading: !!(dashData && dashData._loading)
            });
          }
        });
      }

      if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardRefresh === 'function') {
        window.TaagerPreloader.dashboardRefresh({
          activity: 'Starting dashboard...',
          smooth: smoothRefreshLoader
        });
      }
      dashboardLoaderStage('snapshot', { activity: 'Reading saved dashboard snapshots' });

      if (showLoader) {
        dbg('aggregator:show-loader-refresh-shell', { runId: runId, nextVersion: dashVersion + 1 });
        dashData._loaded = false;
        dashData._loading = true;
        dashData._version = ++dashVersion;
        dashData.meta = dashData.meta || {};
        dashData.meta.activeAccountId = window.getActiveAccountId ? window.getActiveAccountId() : '__all__';
        if (typeof window.refreshDashboardShell === 'function') {
          window.refreshDashboardShell(shellMount, dashData);
        }
      }

      if (typeof window.runDashboardAggregator !== 'function') {
        dbg('aggregator:no-aggregator-function', { runId: runId }, 'warn');
        resetObject(dashData, emptyDashboardData());
        dashData._version = ++dashVersion;
        dashData._loading = false;
        completeDashboardLoad('Dashboard ready.', function () {
          if (typeof window.refreshDashboardShell === 'function') {
            window.refreshDashboardShell(shellMount, dashData);
          }
          if (window.TaagerPageLifecycle && typeof window.TaagerPageLifecycle.markMounted === 'function') {
            window.TaagerPageLifecycle.markMounted('page-dashboard');
          }
          if (window.TaagerPerf && window.TaagerPerf.end && aggregatorTimer) {
            window.TaagerPerf.end(aggregatorTimer, { ok: true, source: 'empty' });
          }
        });
        return readyPromise;
      }

      var aggregationPromise = null;
      if (sharedAggregation) {
        dbg('aggregator:using-shared-promise', {
          runId: runId,
          sourceRunId: existingAggregation && existingAggregation.runId
        });
        aggregationPromise = existingAggregation.promise;
      } else {
        dbg('aggregator:create-promise', { runId: runId });
        aggregationPromise = new Promise(function (resolve) {
          window.runDashboardAggregator(function (result) {
            dbg('aggregator:callback-fired', {
              runId: runId,
              hasResult: !!result,
              meta: result && result.meta ? {
                activeAccountId: result.meta.activeAccountId,
                rowCount: result.meta.rowCount,
                hasData: result.meta.hasData
              } : null
            });
            resolve(result || null);
          });
        });
        window.__dashboardAggregationInFlight = {
          key: aggregationKey,
          promise: aggregationPromise,
          runId: runId,
          startedAt: Date.now()
        };
        aggregationPromise.then(function () {
          if (window.__dashboardAggregationInFlight && window.__dashboardAggregationInFlight.promise === aggregationPromise) {
            window.__dashboardAggregationInFlight = null;
          }
        }, function () {
          if (window.__dashboardAggregationInFlight && window.__dashboardAggregationInFlight.promise === aggregationPromise) {
            window.__dashboardAggregationInFlight = null;
          }
        });
      }

      aggregationPromise.then(function (result) {
        dbg('aggregator:promise-resolved', {
          runId: runId,
          currentRunId: dashboardAggregatorRunId,
          stale: runId !== dashboardAggregatorRunId,
          hasResult: !!result
        });
        if (runId !== dashboardAggregatorRunId) {
          if (window.TaagerPerf && window.TaagerPerf.end && aggregatorTimer) {
            window.TaagerPerf.end(aggregatorTimer, {
              ok: true,
              stale: true,
              requestId: runId,
              sharedAggregation: sharedAggregation,
              sourceRunId: sharedAggregation ? existingAggregation.runId : null
            });
          }
          if (readyResolve) {
            readyResolve(dashData);
            readyResolve = null;
            dbg('aggregator:ready-resolved-stale-promise', { runId: runId });
          }
          return;
        }
        if (!result) {
          dbg('aggregator:map-empty-data', { runId: runId });
          resetObject(dashData, emptyDashboardData());
        } else {
          dbg('aggregator:map-result', {
            runId: runId,
            meta: result.meta ? {
              activeAccountId: result.meta.activeAccountId,
              rowCount: result.meta.rowCount,
              hasData: result.meta.hasData,
              lastUpdatedLabel: result.meta.lastUpdatedLabel
            } : null
          });
          resetObject(dashData, mapAggregatorToSections(result));
        }
        dashData._version = ++dashVersion;
        window.dashboardGeoData = dashData;
        if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
          var preparedOrders = dashData.overview && dashData.overview.totalOrders
            ? Number(dashData.overview.totalOrders.value || dashData.overview.totalOrders.rawValue || 0)
            : 0;
          window.TaagerPreloader.dashboardStage('modules', {
            activity: preparedOrders ? (preparedOrders + ' orders prepared') : 'Dashboard metrics prepared'
          });
        }
        warmDashboardAiMirror(dashData);

        function renderMappedDashboard() {
          if (runId !== dashboardAggregatorRunId) {
            dbg('aggregator:skip-render-after-initial-gate-stale', {
              runId: runId,
              currentRunId: dashboardAggregatorRunId
            }, 'warn');
            if (readyResolve) {
              readyResolve(dashData);
              readyResolve = null;
            }
            return;
          }
          dashData._loading = false;
          window.dashboardGeoData = dashData;
          if (!smoothRefreshLoader) {
            dashboardLoaderStage('rendering', { activity: 'Rendering final dashboard' });
          }
          completeDashboardLoad('Dashboard ready.', function () {
            dbg('aggregator:refresh-shell-loaded-data', {
              runId: runId,
              version: dashData._version,
              orders: dashboardLazyOrderCount(dashData)
            });
            if (typeof window.refreshDashboardShell === 'function') {
              window.refreshDashboardShell(shellMount, dashData);
            }
            if (window.TaagerPerf && window.TaagerPerf.end && aggregatorTimer) {
              window.TaagerPerf.end(aggregatorTimer, {
                ok: true,
                source: result ? 'aggregator' : 'empty',
                marketingInBackground: !!activeMarketingSyncPromise,
                sharedAggregation: sharedAggregation,
                sourceRunId: sharedAggregation ? existingAggregation.runId : null,
                orders: dashboardLazyOrderCount(dashData)
              });
            }
          });
        }

        if (beforeInitialRenderPromise && typeof beforeInitialRenderPromise.then === 'function') {
          dbg('aggregator:wait-before-initial-render', { runId: runId });
          Promise.resolve(beforeInitialRenderPromise).catch(function (error) {
            dbg('aggregator:initial-render-gate-failed', {
              runId: runId,
              error: error && error.message ? error.message : String(error || '')
            }, 'warn');
            return null;
          }).then(function () {
            if (activeMarketingSyncPromise === beforeInitialRenderPromise) {
              activeMarketingSyncPromise = null;
              activeMarketingSyncKey = '';
            }
            dbg('aggregator:initial-render-gate-ready', { runId: runId });
            renderMappedDashboard();
          });
        } else {
          renderMappedDashboard();
        }
      }, function (err) {
        dbg('aggregator:promise-rejected', {
          runId: runId,
          error: err && err.message ? err.message : String(err || ''),
          stack: err && err.stack ? err.stack : ''
        }, 'error');
        if (window.TaagerPerf && window.TaagerPerf.end && aggregatorTimer) {
          window.TaagerPerf.end(aggregatorTimer, {
            ok: false,
            sharedAggregation: sharedAggregation,
            sourceRunId: sharedAggregation ? existingAggregation.runId : null,
            error: err && err.message ? err.message : String(err || '')
          });
        }
        resetObject(dashData, emptyDashboardData());
        dashData._version = ++dashVersion;
        dashData._loading = false;
        completeDashboardLoad('Dashboard ready.', function () {
          dbg('aggregator:refresh-shell-after-error', { runId: runId, version: dashData._version });
          if (typeof window.refreshDashboardShell === 'function') {
            window.refreshDashboardShell(shellMount, dashData);
          }
        });
      });
      return readyPromise;
    }

    function triggerMarketingSync(reason) {
      var period = window.DashboardPeriodState ? window.DashboardPeriodState.get() : {};
      var activeId = window.getActiveAccountId ? window.getActiveAccountId() : '__all__';
      var roi = window.DashboardRoiState ? window.DashboardRoiState.get(activeId, {}) : {};
      var exchangeRates = dashboardCurrencyRates();
      var store = window.DashboardMarketingState;
      var syncPayload = {
        dateFrom: period.from || period.dateFrom || period.start || '',
        dateTo: period.to || period.dateTo || period.end || '',
        targetCurrency: roi.currency || window.dashboardActiveCurrency || 'SAR',
        egpRate: Number(exchangeRates.EGP) || roi.egpRate || 52,
        exchangeRates: exchangeRates,
        mode: 'incremental'
      };
      dbg('marketing-sync:consider', {
        reason: reason || 'dashboard',
        activeId: activeId,
        payload: syncPayload,
        hasStore: !!store,
        hasSync: !!(store && typeof store.sync === 'function')
      });
      if (store && typeof store.sync === 'function' && syncPayload.dateFrom && syncPayload.dateTo) {
        var syncKey = [
          activeId || '__all__',
          syncPayload.dateFrom,
          syncPayload.dateTo,
          syncPayload.targetCurrency,
          syncPayload.egpRate,
          syncPayload.mode
        ].join('|');
        if (activeMarketingSyncPromise && activeMarketingSyncKey === syncKey) {
          dbg('marketing-sync:reuse-active-promise', { activeId: activeId, reason: reason || 'dashboard', syncKey: syncKey });
          return activeMarketingSyncPromise;
        }
        var cachedStatus = typeof store.get === 'function' ? store.get(activeId) : null;
        var hasExactCachedRange = marketingSummaryMatchesRange(cachedStatus, syncPayload) && !cachedStatus.error && !cachedStatus.reconnectRequired;
        if (hasExactCachedRange) {
          dbg('marketing-sync:use-exact-cache', { activeId: activeId, reason: reason || 'dashboard', syncKey: syncKey });
          console.log('[Marketing] Using exact cached marketing range:', activeId, reason || 'dashboard', syncPayload);
          return Promise.resolve(cachedStatus);
        }
        dbg('marketing-sync:load-connections', { activeId: activeId, reason: reason || 'dashboard', syncKey: syncKey });
        console.log('[Marketing] Loading connections before dashboard auto-sync:', activeId, reason || 'dashboard', syncPayload);
        var connectionPromise = typeof store.load === 'function'
          ? store.load(activeId).catch(function (error) {
              console.warn('[Marketing] Could not load connections before dashboard auto-sync:', error);
              return null;
            })
          : Promise.resolve(null);
        activeMarketingSyncKey = syncKey;
        activeMarketingSyncPromise = connectionPromise.then(function () {
          dbg('marketing-sync:trigger-sync', { activeId: activeId, reason: reason || 'dashboard', syncKey: syncKey });
          console.log('[Marketing] Triggering dashboard auto-sync for account:', activeId, reason || 'dashboard', syncPayload);
          return store.sync(activeId, syncPayload);
        }).then(function (result) {
          dbg('marketing-sync:resolved', { activeId: activeId, reason: reason || 'dashboard', result: result || null });
          return result;
        }).catch(function(e) {
          dbg('marketing-sync:failed', {
            activeId: activeId,
            reason: reason || 'dashboard',
            error: e && e.message ? e.message : String(e || '')
          }, 'error');
          console.warn('[Marketing] Dashboard auto-sync failed:', e);
          return null;
        });
        return activeMarketingSyncPromise;
      }
      dbg('marketing-sync:skip', { reason: reason || 'dashboard', payload: syncPayload });
      return Promise.resolve();
    }

    function syncMarketingAndRunAggregator(showLoader, reason) {
      dbg('syncMarketingAndRunAggregator:start', { showLoader: !!showLoader, reason: reason || '' });
      var marketingPromise = triggerMarketingSync(reason);
      // On the first mount, run data aggregation and marketing concurrently but
      // do not mount Section 8 until both are settled. Mounting it earlier makes
      // the marketing/ROI notifications rebuild the entire visible section.
      var initialRenderGate = dashboardHasCompletedInitialLoad ? null : marketingPromise;
      return runAggregator(showLoader, initialRenderGate);
    }

    window.syncDashboardMarketingOnOpen = function () {
      // A warm route already has a valid dashboard snapshot. Re-running the
      // aggregator here destroys and rebuilds the visible section before the
      // marketing request completes, then Section 8 updates again. Let the
      // shared marketing state notify only the affected UI when fresh data is
      // actually available.
      dbg('dashboard-open:marketing-only');
      return triggerMarketingSync('dashboard-open');
    };

    function handlePeriodChange() {
      syncMarketingAndRunAggregator(true, 'period-change');
    }

    function handleDeliveredDateModeChange() {
      runAggregator(true);
    }

    window.renderDashboardShell(shellMount, dashData, {
      onAccountChange: function (accountId) {
        if (window.setActiveAccountId) window.setActiveAccountId(accountId);
        syncMarketingAndRunAggregator(true, 'account-change');
      },
      onPeriodChange: handlePeriodChange,
      onDeliveredDateModeChange: handleDeliveredDateModeChange,
      onReportingCurrencyChange: function (value) {
        var activeId = window.getActiveAccountId ? window.getActiveAccountId() : '__all__';
        if (value && window.DashboardRoiState && typeof window.DashboardRoiState.set === 'function') {
          var currentRoi = window.DashboardRoiState.get(activeId, {});
          if (currentRoi.currency !== value) {
            window.DashboardRoiState.set({ currency: value }, activeId, currentRoi);
          }
        }
        syncMarketingAndRunAggregator(true, 'currency-change');
      },
      onStaticUpdateComplete: function () {
        runAggregator(true);
      },
      onSectionChange: function (sectionId) {
        dbg('section-change', {
          sectionId: sectionId,
          loaded: !!(dashData && dashData._loaded),
          loading: !!(dashData && dashData._loading),
          version: dashData && dashData._version,
          needsMarketing: sectionNeedsMarketing(sectionId)
        });
        setTimeout(updateMarketingPendingOverlay, 0);
        if (!sectionNeedsMarketing(sectionId)) {
          dbg('section-change:skip-no-marketing', { sectionId: sectionId });
          return;
        }
        var marketingAccountId = String(dashData && dashData.meta && dashData.meta.activeAccountId || '__all__');
        var refreshKey = marketingAccountId;
        if (marketingSectionRefreshes[refreshKey]) {
          dbg('section-change:skip-refresh-already-registered', { sectionId: sectionId, refreshKey: refreshKey });
          return;
        }

        // If the aggregator is not loaded yet, do NOT register or trigger refresh yet.
        // We will be called again once the aggregator completes and renders the shell.
        if (!dashData || !dashData._loaded) {
          dbg('section-change:skip-data-not-loaded', { sectionId: sectionId });
          return;
        }

        var store = window.DashboardMarketingState;
        var currentStatus = store && typeof store.get === 'function' ? store.get(marketingAccountId) : null;

        // Check if marketing data is already loaded and no background sync is running.
        var isAlreadyLoaded = currentStatus && (currentStatus.summary || currentStatus.status !== 'disconnected' || currentStatus.error || currentStatus.offline || currentStatus.reconnectRequired);
        var isSyncing = !!activeMarketingSyncPromise;

        marketingSectionRefreshes[refreshKey] = true;

        // If it is already loaded and not syncing, we don't need to refresh the shell,
        // because the shell was just rendered with the fully loaded data!
        if (isAlreadyLoaded && !isSyncing) {
          dbg('section-change:skip-marketing-loaded', {
            sectionId: sectionId,
            marketingAccountId: marketingAccountId,
            isAlreadyLoaded: !!isAlreadyLoaded,
            isSyncing: isSyncing
          });
          return;
        }

        var marketingPromise = activeMarketingSyncPromise || Promise.resolve();
        dbg('section-change:wait-marketing', {
          sectionId: sectionId,
          marketingAccountId: marketingAccountId,
          isAlreadyLoaded: !!isAlreadyLoaded,
          isSyncing: isSyncing
        });
        Promise.all([
          ensureMarketingStatusLoaded(dashData).catch(function () { return null; }),
          marketingPromise
        ]).then(function () {
          if (activeMarketingSyncPromise === marketingPromise) {
            activeMarketingSyncPromise = null;
            activeMarketingSyncKey = '';
          }
          if (!shellMount.isConnected || shellMount._dashboardActiveSection !== sectionId) {
            dbg('section-change:marketing-done-skip-inactive', {
              sectionId: sectionId,
              connected: shellMount.isConnected,
              activeSection: shellMount._dashboardActiveSection
            });
            return;
          }
          if (sectionHandlesMarketingState(sectionId)) {
            dbg('section-change:marketing-done-skip-section-handles-state', { sectionId: sectionId });
            return;
          }
          dashData._version = ++dashVersion;
          window.dashboardGeoData = dashData;
          dbg('section-change:marketing-done-refresh-shell', { sectionId: sectionId, version: dashData._version });
          if (typeof window.refreshDashboardShell === 'function') {
            window.refreshDashboardShell(shellMount, dashData);
          }
        });
      },
      onDashboardUpdate: function (period) {
        var activeId = window.getActiveAccountId ? window.getActiveAccountId() : '__all__';
        var liveAccountIds = (Array.isArray(window._kbotAccounts) ? window._kbotAccounts : [])
          .filter(function (account) { return account && account.id && account.accountType !== 'static'; })
          .map(function (account) { return account.id; });
        var ids = [];
        if (activeId && activeId !== '__all__' && liveAccountIds.indexOf(activeId) !== -1) ids = [activeId];
        else ids = (window.dashboardAccountsList || [])
          .filter(function (acc) { return acc && acc.id && acc.id !== '__all__' && liveAccountIds.indexOf(acc.id) !== -1; })
          .map(function (acc) { return acc.id; });
        if (!ids.length) ids = liveAccountIds.slice();
        if (!ids.length) return;
        if (typeof window._onRunForDashboard === 'function') {
          window._onRunForDashboard(ids, period || (window.DashboardPeriodState && window.DashboardPeriodState.get()), {
            stayOnDashboard: true,
            marketingAccountId: activeId || '__all__'
          });
        }
      }
    });
    if (window.TaagerPerf && window.TaagerPerf.end && dashboardMountTimer) {
      window.TaagerPerf.end(dashboardMountTimer, { ok: true });
    }

    var initialReady = syncMarketingAndRunAggregator(false, 'dashboard-open');
    if (window.TaagerPremiumPreview) window.TaagerPremiumPreview.mount(el, 'dashboard');
    dbg('renderDashboard:return-initialReady', {
      isPromise: !!(initialReady && typeof initialReady.then === 'function')
    });
    if (initialReady && typeof initialReady.then === 'function') {
      initialReady.then(function (data) {
        dbg('renderDashboard:initialReady-resolved', {
          loaded: !!(data && data._loaded),
          loading: !!(data && data._loading),
          version: data && data._version,
          hasData: !!(data && data.meta && data.meta.hasData)
        });
      }, function (err) {
        dbg('renderDashboard:initialReady-rejected', {
          error: err && err.message ? err.message : String(err || '')
        }, 'error');
      });
    }
    return initialReady;
  };
})();


