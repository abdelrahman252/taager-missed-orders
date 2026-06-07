(function () {
  "use strict";

  var renderVersion = 0;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function tr(key, fallback) {
    var t = window.dashboardI18n && window.dashboardI18n.t
      ? window.dashboardI18n.t(key)
      : key;
    return t && t !== key ? t : fallback;
  }

  function mapAggregatorToAiData(result) {
    result = result || {};
    var orders = Array.isArray(result.orders) ? result.orders : [];
    var pipeline = result.pipeline ? Object.assign({}, result.pipeline, { orders: orders }) : null;
    return {
      _loaded: true,
      _source: "dashboard-aggregator",
      meta: result.meta || {},
      overview: result.overview || null,
      pipeline: pipeline,
      stages: result.pipeline && result.pipeline.stages ? result.pipeline.stages : [],
      orders: orders,
      cod: result.cod || null,
      products: result.products || null,
      commissionTrend: result.commissionTrend || null,
      roi: result.roi || null,
      geo: result.geo || null,
      marketing: result.marketing || null,
      prepaid: result.prepaid || result.prepaidIntelligence || null,
      prepaidIntelligence: result.prepaidIntelligence || null,
      campaignIntelligence: result.campaignIntelligence || null,
      mediaBuying: result.mediaBuying || null
    };
  }

  function emptyAiData() {
    return {
      _loaded: true,
      _source: "empty",
      meta: {
        activeAccountId: window.getActiveAccountId ? window.getActiveAccountId() : "__all__",
        activeAccountLabel: window.currentActiveAccountLabel || tr("shell.allAccounts", "All linked accounts"),
        hasData: false,
        accountOptions: window.dashboardAccountsList || []
      },
      overview: null,
      pipeline: null,
      stages: [],
      orders: [],
      cod: null,
      products: null,
      commissionTrend: null,
      roi: null,
      geo: null,
      marketing: null,
      prepaid: null,
      prepaidIntelligence: null,
      campaignIntelligence: null,
      mediaBuying: null
    };
  }

  function renderShell(page) {
    page.innerHTML =
      '<div class="sv3-shell dashboard-page-shell ai-intelligence-page-shell">' +
        (typeof renderSharedSidebar === "function" ? renderSharedSidebar("ai") : "") +
        '<main class="dashboard-page-main ai-intelligence-page-main">' +
          '<div id="ai-intelligence-mount" class="ai-intelligence-mount"></div>' +
        '</main>' +
      '</div>';

    if (typeof wireSharedSidebar === "function") wireSharedSidebar(page);
    if (window.dashboardI18n) window.dashboardI18n.apply(page);
    if (window.TaagerUI && typeof window.TaagerUI.enhance === "function") window.TaagerUI.enhance(page);
    else if (window.KhodUI) window.KhodUI.enhance(page);
  }

  function renderLoading(mount) {
    mount.innerHTML =
      '<div class="ai-intelligence-loader" role="status" aria-live="polite">' +
        '<span class="dash-preloader-spinner" aria-hidden="true"></span>' +
        '<div>' +
          '<strong>' + esc(tr("aii.loadingTitle", "Loading Taager AI intelligence...")) + '</strong>' +
          '<span>' + esc(tr("aii.loadingBody", "Reading the saved dashboard range, accounts, products, cities, and order signals.")) + '</span>' +
        '</div>' +
      '</div>';
  }

  function renderUnavailable(mount, title, body) {
    mount.innerHTML =
      '<div class="ai-intelligence-loader ai-intelligence-loader-error" role="status">' +
        '<div>' +
          '<strong>' + esc(title) + '</strong>' +
          '<span>' + esc(body) + '</span>' +
        '</div>' +
      '</div>';
  }

  function renderKhodAi(mount, data) {
    window.dashboardGeoData = data || emptyAiData();
    if (typeof window.renderSectionTaagerAi !== "function") {
      renderUnavailable(
        mount,
        tr("aii.unavailableTitle", "Taager AI is not available"),
        tr("aii.unavailableBody", "The AI workspace module did not load yet.")
      );
      return;
    }
    window.renderSectionTaagerAi(mount, window.dashboardGeoData, {
      page: "ai-intelligence",
      onNavigate: function (section) {
        window._dashboardInitialSection = section || "master";
        if (typeof window.goToDashboard === "function") window.goToDashboard();
      }
    });
  }

  function loadDashboardData(done) {
    if (typeof window.runDashboardAggregator !== "function") {
      done(null);
      return;
    }
    try {
      window.runDashboardAggregator(function (result) {
        done(result ? mapAggregatorToAiData(result) : null);
      });
    } catch (err) {
      console.warn("[Taager AI] Failed to load dashboard data:", err && err.message ? err.message : err);
      done(null);
    }
  }

  window.renderAiIntelligencePage = function () {
    var page = document.getElementById("page-ai-intelligence");
    if (!page) return;

    var version = ++renderVersion;
    renderShell(page);

    var mount = page.querySelector("#ai-intelligence-mount");
    if (!mount) return;

    renderLoading(mount);
    loadDashboardData(function (data) {
      if (version !== renderVersion) return;
      if (!data) data = emptyAiData();
      data._version = version;
      renderKhodAi(mount, data);
    });
  };
})();
