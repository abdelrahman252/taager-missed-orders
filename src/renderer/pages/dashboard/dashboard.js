/*
   dashboard.js
   Outer Dashboard page mount. The inner shell owns the fixed topbar, section
   routing, and account changes; this file owns loading aggregator data.
*/
(function () {
  'use strict';

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

    function runAggregator(showLoader) {
      var aggregationKey = dashboardAggregationKey();
      var existingAggregation = window.__dashboardAggregationInFlight;
      var sharedAggregation = !!(
        existingAggregation &&
        existingAggregation.key === aggregationKey &&
        existingAggregation.promise
      );
      var runId = sharedAggregation ? dashboardAggregatorRunId : ++dashboardAggregatorRunId;
      var smoothRefreshLoader = !!(showLoader && dashboardHasCompletedInitialLoad);
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
      }

      function dashboardLoaderStage(stageId, options) {
        if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
          window.TaagerPreloader.dashboardStage(stageId, options || {});
        }
      }

      function completeDashboardLoad(activity, afterComplete, options) {
        var completeOptions = Object.assign({}, options || {}, {
          activity: activity || 'Dashboard ready.',
          smooth: smoothRefreshLoader
        });
        if (smoothRefreshLoader) {
          completeInitialDashboardPreloader(completeOptions).then(function () {
            if (runId !== dashboardAggregatorRunId) {
              if (readyResolve) {
                readyResolve(dashData);
                readyResolve = null;
              }
              return;
            }
            if (typeof afterComplete === 'function') afterComplete();
            dashboardHasCompletedInitialLoad = true;
            if (readyResolve) {
              readyResolve(dashData);
              readyResolve = null;
            }
          });
          return;
        }
        if (typeof afterComplete === 'function') afterComplete();
        completeInitialDashboardPreloader(completeOptions);
        dashboardHasCompletedInitialLoad = true;
        if (readyResolve) {
          readyResolve(dashData);
          readyResolve = null;
        }
      }

      if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardRefresh === 'function') {
        window.TaagerPreloader.dashboardRefresh({
          activity: 'Starting dashboard...',
          smooth: smoothRefreshLoader
        });
      }
      dashboardLoaderStage('snapshot', { activity: 'Reading saved dashboard snapshots' });

      if (showLoader) {
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
        aggregationPromise = existingAggregation.promise;
      } else {
        aggregationPromise = new Promise(function (resolve) {
          window.runDashboardAggregator(function (result) {
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
          }
          return;
        }
        if (!result) {
          resetObject(dashData, emptyDashboardData());
        } else {
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

        var activeSection = shellMount._dashboardActiveSection || 'master';
        var shouldPrimeMarketing = sectionNeedsMarketing(activeSection);
        if (!shouldPrimeMarketing && !activeMarketingSyncPromise) {
          dashData._loading = false;
          window.dashboardGeoData = dashData;
          if (!smoothRefreshLoader) {
            dashboardLoaderStage('rendering', { activity: 'Rendering final dashboard' });
          }
          completeDashboardLoad('Dashboard ready.', function () {
            if (typeof window.refreshDashboardShell === 'function') {
              window.refreshDashboardShell(shellMount, dashData);
            }
            if (window.TaagerPerf && window.TaagerPerf.end && aggregatorTimer) {
              window.TaagerPerf.end(aggregatorTimer, {
                ok: true,
                source: result ? 'aggregator' : 'empty',
                sharedAggregation: sharedAggregation,
                sourceRunId: sharedAggregation ? existingAggregation.runId : null,
                orders: dashboardLazyOrderCount(dashData)
              });
            }
          });
          return;
        }

        dashData._loading = true;
        if (window.TaagerPreloader && typeof window.TaagerPreloader.dashboardStage === 'function') {
          window.TaagerPreloader.dashboardStage('marketing', { activity: activeMarketingSyncPromise ? 'Syncing connected marketing spend' : 'Checking cached marketing status' });
        }
        var marketingPromise = activeMarketingSyncPromise || Promise.resolve();
        Promise.all([
          ensureMarketingStatusLoaded(dashData).catch(function () { return null; }),
          marketingPromise
        ]).then(function () {
          if (activeMarketingSyncPromise === marketingPromise) {
            activeMarketingSyncPromise = null;
            activeMarketingSyncKey = '';
          }
          dashData._loading = false;
          if (!shellMount.isConnected) {
            completeDashboardLoad('Dashboard ready.');
            return;
          }
          var activeSection = shellMount._dashboardActiveSection || 'master';
          if (sectionNeedsMarketing(activeSection) && !sectionHandlesMarketingState(activeSection)) {
            dashData._version = ++dashVersion;
          }
          window.dashboardGeoData = dashData;
          if (!smoothRefreshLoader) {
            dashboardLoaderStage('rendering', { activity: 'Rendering final dashboard' });
          }
          warmDashboardAiMirror(dashData);
          completeDashboardLoad('Dashboard ready.', function () {
            if (typeof window.refreshDashboardShell === 'function') {
              window.refreshDashboardShell(shellMount, dashData);
            }
            if (window.TaagerPerf && window.TaagerPerf.end && aggregatorTimer) {
              window.TaagerPerf.end(aggregatorTimer, {
                ok: true,
                source: result ? 'aggregator+marketing' : 'empty',
                sharedAggregation: sharedAggregation,
                sourceRunId: sharedAggregation ? existingAggregation.runId : null,
                orders: dashboardLazyOrderCount(dashData)
              });
            }
          });
        });
      }, function (err) {
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
      if (store && typeof store.sync === 'function' && syncPayload.dateFrom && syncPayload.dateTo) {
        var syncKey = [
          activeId || '__all__',
          syncPayload.dateFrom,
          syncPayload.dateTo,
          syncPayload.targetCurrency,
          syncPayload.egpRate,
          syncPayload.mode
        ].join('|');
        if (activeMarketingSyncPromise && activeMarketingSyncKey === syncKey) return activeMarketingSyncPromise;
        var cachedStatus = typeof store.get === 'function' ? store.get(activeId) : null;
        var hasExactCachedRange = marketingSummaryMatchesRange(cachedStatus, syncPayload) && !cachedStatus.error && !cachedStatus.reconnectRequired;
        if (hasExactCachedRange) {
          console.log('[Marketing] Using exact cached marketing range:', activeId, reason || 'dashboard', syncPayload);
          return Promise.resolve(cachedStatus);
        }
        console.log('[Marketing] Loading connections before dashboard auto-sync:', activeId, reason || 'dashboard', syncPayload);
        var connectionPromise = typeof store.load === 'function'
          ? store.load(activeId).catch(function (error) {
              console.warn('[Marketing] Could not load connections before dashboard auto-sync:', error);
              return null;
            })
          : Promise.resolve(null);
        activeMarketingSyncKey = syncKey;
        activeMarketingSyncPromise = connectionPromise.then(function () {
          console.log('[Marketing] Triggering dashboard auto-sync for account:', activeId, reason || 'dashboard', syncPayload);
          return store.sync(activeId, syncPayload);
        }).catch(function(e) {
          console.warn('[Marketing] Dashboard auto-sync failed:', e);
          return null;
        });
        return activeMarketingSyncPromise;
      }
      return Promise.resolve();
    }

    function syncMarketingAndRunAggregator(showLoader, reason) {
      triggerMarketingSync(reason);
      return runAggregator(showLoader);
    }

    window.syncDashboardMarketingOnOpen = function () {
      return syncMarketingAndRunAggregator(true, 'dashboard-open');
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
        if (!sectionNeedsMarketing(sectionId)) return;
        var marketingAccountId = String(dashData && dashData.meta && dashData.meta.activeAccountId || '__all__');
        var refreshKey = marketingAccountId;
        if (marketingSectionRefreshes[refreshKey]) return;

        // If the aggregator is not loaded yet, do NOT register or trigger refresh yet.
        // We will be called again once the aggregator completes and renders the shell.
        if (!dashData || !dashData._loaded) return;

        var store = window.DashboardMarketingState;
        var currentStatus = store && typeof store.get === 'function' ? store.get(marketingAccountId) : null;

        // Check if marketing data is already loaded and no background sync is running.
        var isAlreadyLoaded = currentStatus && (currentStatus.summary || currentStatus.status !== 'disconnected' || currentStatus.error || currentStatus.offline || currentStatus.reconnectRequired);
        var isSyncing = !!activeMarketingSyncPromise;

        marketingSectionRefreshes[refreshKey] = true;

        // If it is already loaded and not syncing, we don't need to refresh the shell,
        // because the shell was just rendered with the fully loaded data!
        if (isAlreadyLoaded && !isSyncing) {
          return;
        }

        var marketingPromise = activeMarketingSyncPromise || Promise.resolve();
        Promise.all([
          ensureMarketingStatusLoaded(dashData).catch(function () { return null; }),
          marketingPromise
        ]).then(function () {
          if (activeMarketingSyncPromise === marketingPromise) {
            activeMarketingSyncPromise = null;
            activeMarketingSyncKey = '';
          }
          if (!shellMount.isConnected || shellMount._dashboardActiveSection !== sectionId) return;
          if (sectionHandlesMarketingState(sectionId)) return;
          dashData._version = ++dashVersion;
          window.dashboardGeoData = dashData;
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
    return initialReady;
  };
})();


