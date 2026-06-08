/*
   dashboard-shell.js
   Inner Dashboard frame: fixed account topbar, sidebar navigation, loaders,
   and section routing.
*/
(function () {
  'use strict';

  var NAV_ITEMS = [
    { id: 'master',     key: 'nav.master',     iconName: 'home'       },
    { id: 'overview',   key: 'nav.overview',   iconName: 'trendingUp' },
    { id: 'pipeline',   key: 'nav.pipeline',   iconName: 'truck'      },
    { id: 'orders',     key: 'nav.orders',     iconName: 'list'       },
    { id: 'cod',        key: 'nav.cod',        iconName: 'creditCard' },
    { id: 'products',   key: 'nav.products',   iconName: 'package'    },
    { id: 'cities',     key: 'nav.cities',     iconName: 'mapPin'     },
    { id: 'commission', key: 'nav.commission', iconName: 'barChart'   },
    { id: 'marketing',  key: 'nav.marketing',  iconName: 'activity'   },
    { id: 'campaigns',  key: 'nav.campaigns',  iconName: 'megaphone'  },
    { id: 'calculator', key: 'nav.calculator', iconName: 'calculator' },
    { id: 'productForecast', key: 'nav.productForecast', iconName: 'activity' },
    { id: 'prepaid',    key: 'nav.prepaid',    iconName: 'wallet'     },
    { id: 'staticUpdate', key: 'nav.staticUpdate', iconName: 'upload' },
    { id: 'taagerAi',     key: 'nav.taagerAi',     iconName: 'diamond'    },
  ];

  var SECTION_FN = {
    master: 'renderSection8',
    overview: 'renderSection1',
    pipeline: 'renderSection2',
    orders: 'renderSection3',
    cod: 'renderSection4',
    products: 'renderSection5',
    cities: 'renderSectionCities',
    commission: 'renderSection6',
    marketing: 'renderSectionMarketingConnections',
    campaigns: 'renderSectionCampaigns',
    calculator: 'renderSection7',
    productForecast: 'renderSectionProductForecast',
    prepaid:    'renderSectionPrepaid',
    staticUpdate: 'renderSectionStaticUpdate',
    taagerAi:     'renderSectionTaagerAi'
  };

  var DATA_KEY = {
    overview: 'overview',
    pipeline: 'pipeline',
    commission: 'commissionTrend',
    calculator: 'roi'
  };

  function icon(name, color) {
    return window.icon ? window.icon(name, { size: 15, color: color }) : '';
  }

  function tr(key, params) {
    return window.dashboardI18n ? window.dashboardI18n.t(key, params) : key;
  }

  function trText(key, fallback, params) {
    var value = tr(key, params);
    return value && value !== key ? value : fallback;
  }

  function esc(value) {
    if (window.TaagerUI && typeof window.TaagerUI.esc === 'function') return window.TaagerUI.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function countryBadgeHtml(acc) {
    var country = window.TaagerCountry;
    if (acc && acc.id === '__all__') {
      var countries = Array.isArray(acc.countries) ? acc.countries : [];
      var flags = countries.slice(0, 3).map(function (code) {
        var cls = country && country.flagClass ? country.flagClass(code) : 'taager-country-flag flag:SA';
        return '<span class="' + esc(cls) + '" aria-hidden="true"></span>';
      }).join('');
      if (!flags) flags = '<span class="taager-country-globe" aria-hidden="true"></span>';
      return '<span class="dashboard-country-badge dashboard-country-badge-all" title="' + esc(tr('shell.allAccounts')) + '">' +
        '<span class="dashboard-country-flags">' + flags + '</span>' +
      '</span>';
    }
    var value = acc && acc.taagerCountry ? acc.taagerCountry : 'sa';
    var item = country && country.get ? country.get(value) : { code: String(value || 'sa').toUpperCase(), flag: '' };
    var label = country && country.label ? country.label(value) : item.code;
    var flagCls = country && country.flagClass ? country.flagClass(value) : 'taager-country-flag flag:SA';
    return '<span class="dashboard-country-badge" title="' + esc(label) + '">' +
      '<span class="' + esc(flagCls) + '" aria-hidden="true"></span>' +
      '<span class="dashboard-country-code">' + esc(item.code || String(value || '').toUpperCase()) + '</span>' +
    '</span>';
  }

  function isRtl() {
    return !window.dashboardI18n || window.dashboardI18n.isRtl();
  }

  function navLabel(item) {
    return tr(item.key);
  }

  function navItemById(id) {
    return NAV_ITEMS.find(function (item) { return item.id === id; }) || NAV_ITEMS[0];
  }

  function isDashboardPreviewMode() {
    return window.TaagerPremiumPreview && window.TaagerPremiumPreview.isActive('dashboard');
  }

  function sectionAllowed(sectionId) {
    return !(isDashboardPreviewMode() && (sectionId === 'taagerAi' || sectionId === 'staticUpdate'));
  }

  function normalizeSection(sectionId) {
    return sectionAllowed(sectionId) ? sectionId : 'master';
  }

  function buildSidebar(activeId) {
    activeId = normalizeSection(activeId);
    var navHTML = NAV_ITEMS.filter(function (item) {
      return sectionAllowed(item.id);
    }).map(function (item) {
      var active = item.id === activeId;
      var labelText = navLabel(item);
      return '<button type="button" class="dash-nav-btn ' + (active ? 'is-active' : '') + '" data-section="' + item.id + '" aria-label="' + labelText + '" aria-current="' + (active ? 'page' : 'false') + '">' +
        '<span class="dash-nav-icon">' + icon(item.iconName, 'currentColor') + '</span>' +
        '<span class="dash-nav-lbl">' + labelText + '</span>' +
      '</button>';
    }).join('');

    return '<div id="dash-inner-sidebar" class="dash-sidebar" dir="' + (isRtl() ? 'rtl' : 'ltr') + '">' +
      '<div id="dash-branding-area" class="dash-branding">' +
        '<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><polygon points="18,2 34,18 18,34 2,18" fill="none" stroke="#a855f7" stroke-width="2"/><polygon points="18,8 28,18 18,28 8,18" fill="#a855f7" opacity="0.25"/><circle cx="18" cy="18" r="4" fill="#a855f7"/><circle cx="18" cy="18" r="2" fill="#e9d5ff"/></svg>' +
        '<div id="dash-taager-text" class="dash-brand-text"><div class="dash-brand-name">' + tr('shell.brandName') + '</div><div class="dash-brand-sub">' + tr('shell.brandSub') + '</div></div>' +
      '</div>' +
      '<nav class="dash-scroll dash-nav-list">' + navHTML + '</nav>' +
      '<div id="dash-online-row" class="dash-online-row">' +
        '<span class="dash-live-dot"></span>' +
        '<span id="dash-online-label" class="dash-online-label">' + tr('shell.online') + '</span>' +
      '</div>' +
    '</div>';
  }

  function buildTopbar(activeSection) {
    activeSection = normalizeSection(activeSection);
    var title = navLabel(navItemById(activeSection));
    var manageAccountsLabel = window._t ? window._t('setup.nav_accounts') : 'Manage Accounts';
    return '<div id="dash-global-topbar" class="dash-global-topbar" dir="' + (isRtl() ? 'rtl' : 'ltr') + '">' +
      '<div class="dash-topbar-cluster">' +
        '<div class="dashboard-account-select-wrap" id="dashboard-account-select-wrap" aria-label="' + tr('shell.account') + '" style="min-width:0;max-width:360px;"></div>' +
        '<div id="dashboard-reporting-currency-wrap" class="dashboard-period-select-wrap" aria-label="Reporting currency" hidden></div>' +
        '<span id="dashboard-reporting-currency-note" class="dash-topbar-field-label" hidden></span>' +
        '<div class="dashboard-rates-control">' +
          '<button type="button" id="dashboard-rates-btn" class="dash-rates-btn" title="Exchange rates" data-tooltip="Exchange rates">' +
            '<span>Rates</span><strong id="dashboard-rates-note">defaults</strong>' +
          '</button>' +
          '<div id="dashboard-rates-panel" class="dashboard-rates-panel" hidden></div>' +
        '</div>' +
        '<div id="dashboard-period-select-wrap" class="dashboard-period-select-wrap" aria-label="' + tr('period.label') + '"></div>' +
        '<div id="dashboard-custom-range" class="dashboard-custom-range" hidden>' +
          '<span class="dashboard-custom-range-dates">' +
            '<button type="button" id="dashboard-date-from" class="dashboard-date-input"></button>' +
            '<span class="dashboard-date-sep">-</span>' +
            '<button type="button" id="dashboard-date-to" class="dashboard-date-input"></button>' +
          '</span>' +
          '<button type="button" id="dashboard-view-range-btn" class="dashboard-view-range-btn" disabled aria-disabled="true">' +
            '<span class="dashboard-view-range-icon">' + icon('calendar', 'currentColor') + '<span class="dashboard-view-range-check" aria-hidden="true">✓</span></span>' +
            '<span>' + tr('period.viewRange') + '</span>' +
          '</button>' +
        '</div>' +
        '<span class="dash-topbar-field-label">' + tr('deliveredDate.label') + '</span>' +
        '<div id="dashboard-delivered-date-select-wrap" class="dashboard-delivered-date-select-wrap" aria-label="' + tr('deliveredDate.label') + '"></div>' +
        '<div id="dashboard-expected-ndr-range" class="dashboard-custom-range dashboard-expected-ndr-range" hidden>' +
          '<button type="button" id="dashboard-expected-ndr-date-from" class="dashboard-date-input"></button>' +
          '<span class="dashboard-date-sep">-</span>' +
          '<button type="button" id="dashboard-expected-ndr-date-to" class="dashboard-date-input"></button>' +
        '</div>' +
        '<button type="button" id="dashboard-update-btn" class="dash-update-btn">' + icon('refreshCw', 'currentColor') + '<span>' + tr('period.update') + '</span></button>' +
        (window._teamLeaderEnabled ? '<button type="button" id="dashboard-manage-accounts-btn" class="dash-update-btn"><span>' + esc(manageAccountsLabel) + '</span></button>' : '') +
      '</div>' +
      '<div class="dash-topbar-title">' +
        '<span class="dash-title-dot"></span>' +
        '<span id="dashboard-section-title">' + title + '</span>' +
        '<span class="dash-title-dot"></span>' +
      '</div>' +
      '<div class="dash-topbar-cluster dash-chip">' +
        '<button type="button" id="dashboard-tour-btn" class="taager-tour-quick-guide" title="' + tr('tour.common.quickGuide') + '" data-tooltip="' + tr('tour.common.quickGuide') + '"><span class="taager-tour-guide-mark">?</span><span>' + tr('tour.common.quickGuide') + '</span></button>' +
        '<span class="dash-live-dot"></span>' +
        '<span class="dash-last-update-label">' + tr('shell.lastUpdate') + '</span>' +
        '<span id="dashboard-last-updated" data-tooltip="' + tr('shell.lastUpdate') + '" class="dash-last-updated">--</span>' +
      '</div>' +
    '</div>';
  }

  function bindDashboardTour(shellEl, data, ctx) {
    if (!window.TaagerGuidedTour || !shellEl) return;
    var opts = {
      root: shellEl,
      navigate: function (sectionId) {
        switchSection(shellEl, sectionId, data, ctx, true);
      }
    };
    var btn = shellEl.querySelector('#dashboard-tour-btn');
    if (btn && !btn._tourReady) {
      btn._tourReady = true;
      btn.addEventListener('click', function () {
        window.TaagerGuidedTour.start('dashboard', opts);
      });
    }
    setTimeout(function () {
      if (document.body.contains(shellEl)) {
        window.TaagerGuidedTour.mountPagePrompt('dashboard', opts);
      }
    }, 700);
  }

  function periodOptions() {
    var now = new Date();
    var locale = window.dashboardI18n ? window.dashboardI18n.locale() : 'en-US';
    var monthFmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
    var options = [
      { value: 'today', label: tr('period.today') },
      { value: 'yesterday', label: tr('period.yesterday') },
      { value: 'last7', label: tr('period.last7') },
      { value: 'last14', label: tr('period.last14') },
      { value: 'last30', label: tr('period.last30') }
    ];
    var months = window.DashboardPeriodState && typeof window.DashboardPeriodState.availableMonths === 'function'
      ? window.DashboardPeriodState.availableMonths()
      : [
          { preset: 'thisMonth', year: now.getFullYear(), monthIndex: now.getMonth() },
          { preset: 'prevMonth', year: now.getFullYear(), monthIndex: now.getMonth() - 1 },
          { preset: 'twoMonthsAgo', year: now.getFullYear(), monthIndex: now.getMonth() - 2 }
        ];
    months.forEach(function (month) {
      options.push({
        value: month.preset,
        label: monthFmt.format(new Date(month.year, month.monthIndex, 1))
      });
    });
    options.push({ value: 'custom', label: tr('period.custom') });
    return options;
  }

  function deliveredDateOptions() {
    // Taager dashboard/status/NDR migration:
    // This selector is now NDR mode. Expected uses the visible closed-cycle date range.
    return [
      { value: 'actual', label: tr('deliveredDate.updatedAt') },
      { value: 'expected', label: tr('deliveredDate.createdAt') }
    ];
  }

  function parseIso(value) {
    var parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toIso(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function shortDate(value) {
    var locale = window.dashboardI18n ? window.dashboardI18n.locale() : 'en-US';
    return parseIso(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function rateTimeLabel(value) {
    if (!value) return 'not refreshed yet';
    try {
      return new Date(value).toLocaleString(window.dashboardI18n ? window.dashboardI18n.locale() : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return String(value || '');
    }
  }

  function refreshDashboardAfterRateChange(shellEl, opts) {
    if (!shellEl) return;
    opts = opts || {};
    shellEl._topbarReportingCurrencyKey = null;
    if (typeof opts.onReportingCurrencyChange === 'function') {
      opts.onReportingCurrencyChange(window.dashboardActiveCurrency || 'SAR');
    }
  }

  function closeRatesPanel(shellEl) {
    var panel = shellEl && shellEl.querySelector('#dashboard-rates-panel');
    if (!panel) return;
    panel.hidden = true;
    if (shellEl._ratesOutsideHandler) {
      document.removeEventListener('pointerdown', shellEl._ratesOutsideHandler);
      shellEl._ratesOutsideHandler = null;
    }
  }

  function renderRatesPanel(shellEl, opts) {
    if (!window.TaagerCurrency || !shellEl) return;
    var panel = shellEl.querySelector('#dashboard-rates-panel');
    if (!panel) return;
    var snap = window.TaagerCurrency.snapshot();
    var supported = snap.supported || window.TaagerCurrency.supported || ['USD', 'SAR', 'EGP', 'AED', 'IQD', 'OMR'];
    var rates = snap.rates || {};
    var warning = shellEl._dashboardRateWarning || '';
    var inputs = supported.map(function (currency) {
      var readonly = currency === 'USD' ? ' readonly aria-readonly="true"' : '';
      return '<label class="dashboard-rate-row">' +
        '<span>' + esc(currency) + '</span>' +
        '<input type="number" min="0" step="0.0001" data-rate-currency="' + esc(currency) + '" value="' + esc(String(Number(rates[currency] || 0))) + '"' + readonly + '>' +
      '</label>';
    }).join('');
    panel.innerHTML =
      '<div class="dashboard-rates-head">' +
        '<div><strong>Exchange rates</strong><span>Base: 1 USD</span></div>' +
        '<button type="button" class="dashboard-rates-close" data-rate-close aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="dashboard-rates-meta">' +
        '<span>Source: <strong>' + esc(snap.source || 'defaults') + '</strong></span>' +
        '<span>Updated: <strong>' + esc(rateTimeLabel(snap.updatedAt)) + '</strong></span>' +
      '</div>' +
      (warning ? '<div class="dashboard-rates-warning">' + esc(warning) + '</div>' : '') +
      '<div class="dashboard-rates-grid">' + inputs + '</div>' +
      '<div class="dashboard-rates-actions">' +
        '<button type="button" class="dash-update-btn" data-rate-refresh>Refresh live rates</button>' +
        '<button type="button" class="dash-update-btn" data-rate-save>Save manual</button>' +
        '<button type="button" class="dash-update-btn" data-rate-reset>Reset to defaults</button>' +
      '</div>';

    var closeBtn = panel.querySelector('[data-rate-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeRatesPanel(shellEl); });
    var saveBtn = panel.querySelector('[data-rate-save]');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var next = {};
      panel.querySelectorAll('[data-rate-currency]').forEach(function (input) {
        next[input.getAttribute('data-rate-currency')] = Number(input.value || 0);
      });
      shellEl._dashboardRateWarning = '';
      window.TaagerCurrency.setManualRates(next);
      renderRatesPanel(shellEl, opts);
      updateRatesTopbar(shellEl);
      refreshDashboardAfterRateChange(shellEl, opts || {});
    });
    var resetBtn = panel.querySelector('[data-rate-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      shellEl._dashboardRateWarning = '';
      window.TaagerCurrency.resetRates();
      renderRatesPanel(shellEl, opts);
      updateRatesTopbar(shellEl);
      refreshDashboardAfterRateChange(shellEl, opts || {});
    });
    var refreshBtn = panel.querySelector('[data-rate-refresh]');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      if (!window.TaagerCurrency.ensureLiveRates) return;
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      window.TaagerCurrency.ensureLiveRates({ force: true }).then(function (res) {
        shellEl._dashboardRateWarning = res && res.ok ? '' : ((res && res.error) || 'Live refresh failed. Keeping the last usable rates.');
        renderRatesPanel(shellEl, opts);
        updateRatesTopbar(shellEl);
        if (res && res.ok) refreshDashboardAfterRateChange(shellEl, opts || {});
      });
    });
  }

  function updateRatesTopbar(shellEl) {
    if (!window.TaagerCurrency || !shellEl) return;
    var note = shellEl.querySelector('#dashboard-rates-note');
    var btn = shellEl.querySelector('#dashboard-rates-btn');
    var snap = window.TaagerCurrency.snapshot();
    var text = (snap.source || 'defaults') + (snap.updatedAt ? ' · ' + rateTimeLabel(snap.updatedAt) : '');
    if (note) note.textContent = snap.source || 'defaults';
    if (btn) {
      btn.title = 'Exchange rates: ' + text;
      btn.setAttribute('data-tooltip', 'Exchange rates: ' + text);
    }
  }

  function bindRatesControl(shellEl, opts) {
    if (!window.TaagerCurrency || !shellEl) return;
    updateRatesTopbar(shellEl);
    var btn = shellEl.querySelector('#dashboard-rates-btn');
    var panel = shellEl.querySelector('#dashboard-rates-panel');
    if (btn && !btn._ratesReady) {
      btn._ratesReady = true;
      btn.addEventListener('click', function () {
        var opening = panel && panel.hidden;
        if (!panel) return;
        if (opening) {
          renderRatesPanel(shellEl, opts || {});
          panel.hidden = false;
          setTimeout(function () {
            if (shellEl._ratesOutsideHandler) document.removeEventListener('pointerdown', shellEl._ratesOutsideHandler);
            shellEl._ratesOutsideHandler = function (e) {
              if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeRatesPanel(shellEl);
            };
            document.addEventListener('pointerdown', shellEl._ratesOutsideHandler);
          }, 0);
        } else {
          closeRatesPanel(shellEl);
        }
      });
    }
    if (!shellEl._ratesAutoRefreshChecked && window.TaagerCurrency.ensureLiveRates) {
      shellEl._ratesAutoRefreshChecked = true;
      window.TaagerCurrency.ensureLiveRates().then(function (res) {
        shellEl._dashboardRateWarning = res && res.ok ? '' : ((res && res.error) || 'Live refresh failed. Keeping the last usable rates.');
        updateRatesTopbar(shellEl);
        if (panel && !panel.hidden) renderRatesPanel(shellEl, opts || {});
        if (res && res.ok && res.refreshed) refreshDashboardAfterRateChange(shellEl, opts || {});
      });
    }
  }

  function openDashboardDatePicker(anchor, value, onSelect) {
    closeDashboardDatePicker();
    var current = parseIso(value);
    var min = parseIso(window.DashboardPeriodState.minDate());
    var max = parseIso(window.DashboardPeriodState.maxDate());
    var view = new Date(current.getFullYear(), current.getMonth(), 1);
    var minMonth = new Date(min.getFullYear(), min.getMonth(), 1);
    var maxMonth = new Date(max.getFullYear(), max.getMonth(), 1);
    if (view < minMonth) view = new Date(minMonth.getTime());
    if (view > maxMonth) view = new Date(maxMonth.getTime());
    var pop = document.createElement('div');
    pop.className = 'dashboard-date-popover';
    document.body.appendChild(pop);

    function render() {
      var locale = window.dashboardI18n ? window.dashboardI18n.locale() : 'en-US';
      var monthLabel = view.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
      var first = new Date(view.getFullYear(), view.getMonth(), 1);
      var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      var offset = first.getDay();
      var canNavigateBack = view > minMonth;
      var canNavigateForward = view < maxMonth;
      var cells = '';
      for (var i = 0; i < offset; i++) cells += '<span class="dash-cal-cell is-empty"></span>';
      for (var d = 1; d <= days; d++) {
        var date = new Date(view.getFullYear(), view.getMonth(), d);
        var iso = toIso(date);
        var disabled = date < min || date > max;
        var selected = iso === value;
        cells += '<button type="button" class="dash-cal-cell' + (selected ? ' is-selected' : '') + (disabled ? ' is-disabled' : '') + '" data-date="' + iso + '"' + (disabled ? ' disabled' : '') + '>' + d + '</button>';
      }
      pop.innerHTML =
        '<div class="dash-cal-head">' +
          '<button type="button" class="dash-cal-nav' + (canNavigateBack ? '' : ' is-disabled') + '" data-dir="-1"' + (canNavigateBack ? '' : ' disabled') + '>‹</button>' +
          '<strong>' + monthLabel + '</strong>' +
          '<button type="button" class="dash-cal-nav' + (canNavigateForward ? '' : ' is-disabled') + '" data-dir="1"' + (canNavigateForward ? '' : ' disabled') + '>›</button>' +
        '</div>' +
        '<div class="dash-cal-week"><span>' + tr('calendar.weekdays.sun') + '</span><span>' + tr('calendar.weekdays.mon') + '</span><span>' + tr('calendar.weekdays.tue') + '</span><span>' + tr('calendar.weekdays.wed') + '</span><span>' + tr('calendar.weekdays.thu') + '</span><span>' + tr('calendar.weekdays.fri') + '</span><span>' + tr('calendar.weekdays.sat') + '</span></div>' +
        '<div class="dash-cal-grid">' + cells + '</div>';
      pop.querySelectorAll('.dash-cal-nav').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var nextView = new Date(view.getFullYear(), view.getMonth() + Number(btn.dataset.dir), 1);
          if (nextView < minMonth || nextView > maxMonth) return;
          view = nextView;
          render();
        });
      });
      pop.querySelectorAll('.dash-cal-cell[data-date]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          onSelect(btn.dataset.date);
          closeDashboardDatePicker();
        });
      });
    }

    function position() {
      var r = anchor.getBoundingClientRect();
      pop.style.left = Math.min(r.left, window.innerWidth - 292) + 'px';
      pop.style.top = (r.bottom + 8) + 'px';
    }

    pop._dashOutside = function (e) {
      if (!pop.contains(e.target) && e.target !== anchor) closeDashboardDatePicker();
    };
    setTimeout(function () { document.addEventListener('pointerdown', pop._dashOutside); }, 0);
    render();
    position();
  }

  function closeDashboardDatePicker() {
    var old = document.querySelector('.dashboard-date-popover');
    if (!old) return;
    if (old._dashOutside) document.removeEventListener('pointerdown', old._dashOutside);
    old.remove();
  }

  function applyNavBtnState(btn, active) {
    var id = btn.getAttribute('data-section');
    btn.classList.toggle('is-active', active);
    var iconEl = btn.querySelector('span:first-child');
    if (iconEl) iconEl.innerHTML = icon(navItemById(id).iconName, 'currentColor');
  }

  function setSidebarActive(shellEl, sectionId) {
    var prevId = shellEl._dashboardActiveSection;
    shellEl._dashboardActiveSection = sectionId;
    var title = shellEl.querySelector('#dashboard-section-title');
    if (title) title.textContent = navLabel(navItemById(sectionId));

    if (prevId && prevId !== sectionId) {
      var prevBtn = shellEl.querySelector('.dash-nav-btn[data-section="' + prevId + '"]');
      if (prevBtn) applyNavBtnState(prevBtn, false);
      if (prevBtn) prevBtn.setAttribute('aria-current', 'false');
    }
    var nextBtn = shellEl.querySelector('.dash-nav-btn[data-section="' + sectionId + '"]');
    if (nextBtn) applyNavBtnState(nextBtn, true);
    if (nextBtn) nextBtn.setAttribute('aria-current', 'page');
  }

  function loaderHTML(sectionId) {
    var label = navLabel(navItemById(sectionId || 'master'));
    var steps = [
      trText('shell.loadingStep.privateData', 'Preparing private data'),
      trText('shell.loadingStep.orders', 'Organizing orders'),
      trText('shell.loadingStep.pipeline', 'Building order pipeline'),
      trText('shell.loadingStep.cities', 'Mapping cities'),
      trText('shell.loadingStep.products', 'Reading product signals'),
      trText('shell.loadingStep.cod', 'Checking COD collection'),
      trText('shell.loadingStep.accountCalculator', 'Preparing account calculator'),
      trText('shell.loadingStep.productCalculator', 'Preparing product calculator'),
      trText('shell.loadingStep.marketing', 'Matching marketing spend'),
      trText('shell.loadingStep.buyLines', 'Reading buy-line signals'),
      trText('shell.loadingStep.ai', 'Scanning dashboard insights')
    ];
    var stepHtml = steps.map(function (step, idx) {
      return '<span style="--dash-loader-delay:' + (idx * 1.6).toFixed(1) + 's">' + esc(step) + '</span>';
    }).join('');
    return '<div class="dash-section-preloader" data-dashboard-preloader="true" role="status" aria-live="polite">' +
      '<div class="dash-preloader-head">' +
        '<span class="dash-preloader-spinner" aria-hidden="true"></span>' +
        '<div class="dash-preloader-copy">' +
          '<div class="dash-preloader-title">' + esc(tr('shell.loading')) + '</div>' +
          '<div class="dash-preloader-section">' +
            '<span class="dash-preloader-cycle" aria-hidden="true">' + stepHtml + '</span>' +
            '<span class="dash-preloader-target">' + esc(trText('shell.loadingFor', 'for')) + ' ' + esc(label) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dash-preloader-grid" aria-hidden="true">' +
        '<span></span><span></span><span></span><span></span>' +
      '</div>' +
      '<div class="dash-preloader-block" aria-hidden="true"></div>' +
    '</div>';
  }

  function getDataVersion(data) {
    return data && data._version != null ? data._version : (data && data._loaded ? 'loaded' : 'pending');
  }

  function scheduleSectionRender(shellEl, render) {
    var token = (shellEl._dashboardRenderToken || 0) + 1;
    shellEl._dashboardRenderToken = token;
    requestAnimationFrame(function () {
      if (shellEl._dashboardRenderToken !== token) return;
      render();
    });
  }

  function emptyState(data) {
    var label = data && data.meta && data.meta.activeAccountLabel ? data.meta.activeAccountLabel : tr('shell.thisAccount');
    label = window.dashboardI18n ? window.dashboardI18n.raw(label) : label;
    if (window.TaagerUI) {
      return window.TaagerUI.stateBlock({
        kind: 'empty',
        title: tr('shell.noDataTitle'),
        body: tr('shell.noDataBody', { account: label })
      });
    }
    return '<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:rgba(255,255,255,0.35);text-align:center;padding:32px;">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '<div style="font-size:16px;font-weight:800;color:rgba(255,255,255,0.78);">' + tr('shell.noDataTitle') + '</div>' +
      '<div style="font-size:12px;max-width:340px;line-height:1.7;">' + tr('shell.noDataBody', { account: label }) + '</div>' +
    '</div>';
  }

  function dashboardPageForShell(shellEl) {
    if (shellEl && typeof shellEl.closest === 'function') {
      var page = shellEl.closest('#page-dashboard');
      if (page) return page;
    }
    return document.getElementById('page-dashboard');
  }

  function copyPeriodRange(period) {
    return {
      dateFrom: String(period && period.dateFrom || ''),
      dateTo: String(period && period.dateTo || '')
    };
  }

  function getCustomRangeDraft(shellEl, period) {
    var page = dashboardPageForShell(shellEl);
    var draft = page && page._dashboardPeriodDraft;
    if (!draft || !draft.dateFrom || !draft.dateTo) {
      draft = copyPeriodRange(period);
      if (page) page._dashboardPeriodDraft = draft;
    }
    return draft;
  }

  function setCustomRangeDraft(shellEl, draft) {
    var page = dashboardPageForShell(shellEl);
    var next = copyPeriodRange(draft);
    if (page) page._dashboardPeriodDraft = next;
    return next;
  }

  function clearCustomRangeDraft(shellEl) {
    var page = dashboardPageForShell(shellEl);
    if (page) delete page._dashboardPeriodDraft;
  }

  function customRangeDraftIsDirty(draft, period) {
    return !!draft && !!period &&
      (draft.dateFrom !== period.dateFrom || draft.dateTo !== period.dateTo);
  }

  function syncDashboardUpdateButton(shellEl, draftDirty) {
    var updateBtn = shellEl && shellEl.querySelector('#dashboard-update-btn');
    if (!updateBtn) return;
    var fetchBusy = !!(window._dashboardFetchState && window._dashboardFetchState.active) ||
      updateBtn.getAttribute('aria-busy') === 'true';
    updateBtn.dataset.rangeBlocked = draftDirty ? 'true' : 'false';
    updateBtn.disabled = fetchBusy || draftDirty;
    if (draftDirty) {
      var hint = tr('period.viewBeforeUpdate');
      updateBtn.title = hint;
      updateBtn.setAttribute('data-tooltip', hint);
    } else {
      updateBtn.removeAttribute('title');
      updateBtn.removeAttribute('data-tooltip');
    }
  }

  function syncCustomRangeControls(shellEl, period) {
    if (!shellEl || !period) return;
    var custom = shellEl.querySelector('#dashboard-custom-range');
    var from = shellEl.querySelector('#dashboard-date-from');
    var to = shellEl.querySelector('#dashboard-date-to');
    var viewBtn = shellEl.querySelector('#dashboard-view-range-btn');
    var isCustom = period.preset === 'custom';
    if (!isCustom) {
      clearCustomRangeDraft(shellEl);
      if (custom) custom.classList.remove('has-pending-range');
      syncDashboardUpdateButton(shellEl, false);
      return;
    }

    var draft = getCustomRangeDraft(shellEl, period);
    var dirty = customRangeDraftIsDirty(draft, period);
    if (from) from.textContent = draft.dateFrom ? shortDate(draft.dateFrom) : '--';
    if (to) to.textContent = draft.dateTo ? shortDate(draft.dateTo) : '--';
    if (custom) custom.classList.toggle('has-pending-range', dirty);
    if (viewBtn) {
      viewBtn.disabled = !dirty;
      viewBtn.setAttribute('aria-disabled', dirty ? 'false' : 'true');
      viewBtn.title = dirty ? tr('period.viewRangeReady') : tr('period.rangeApplied');
      viewBtn.setAttribute('data-tooltip', viewBtn.title);
    }
    syncDashboardUpdateButton(shellEl, dirty);
  }

  function updateTopbar(shellEl, data, opts) {
    data = data || {};
    opts = opts || {};
    var meta = data.meta || {};
    var monthEl = shellEl.querySelector('#dashboard-month-label span');
    var lastEl = shellEl.querySelector('#dashboard-last-updated');
    var newMonth = meta.monthLabel || '--';
    var newLast = meta.lastUpdatedLabel || tr('shell.noUpdate');
    if (monthEl && monthEl.textContent !== newMonth) monthEl.textContent = newMonth;
    if (lastEl && lastEl.textContent !== newLast) lastEl.textContent = newLast;

    var wrap = shellEl.querySelector('#dashboard-account-select-wrap');
    var periodWrap = shellEl.querySelector('#dashboard-period-select-wrap');
    var reportingCurrencyWrap = shellEl.querySelector('#dashboard-reporting-currency-wrap');
    var reportingCurrencyNote = shellEl.querySelector('#dashboard-reporting-currency-note');
    var deliveredDateWrap = shellEl.querySelector('#dashboard-delivered-date-select-wrap');
    bindRatesControl(shellEl, opts);
    if (reportingCurrencyWrap && window.renderCustomSelect) {
      reportingCurrencyWrap.hidden = !meta.isMixedCountry;
      if (reportingCurrencyNote) {
        reportingCurrencyNote.hidden = !meta.isMixedCountry;
        reportingCurrencyNote.textContent = meta.isMixedCountry
          ? (meta.reportingCurrency || 'SAR') + ' · ' + (meta.exchangeRateSource || 'defaults')
          : '';
      }
      if (meta.isMixedCountry) {
        var reportingOptions = ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'].map(function (currency) {
          return { value: currency, label: currency };
        });
        var reportingKey = (meta.reportingCurrency || 'SAR') + '|' + (meta.exchangeRateSource || '');
        if (shellEl._topbarReportingCurrencyKey !== reportingKey) {
          shellEl._topbarReportingCurrencyKey = reportingKey;
          window.renderCustomSelect(reportingCurrencyWrap, reportingOptions, meta.reportingCurrency || 'SAR', function (value) {
            shellEl._topbarReportingCurrencyKey = null;
            if (window.setDashboardReportingCurrency) window.setDashboardReportingCurrency(value);
            if (typeof opts.onReportingCurrencyChange === 'function') opts.onReportingCurrencyChange(value);
          }, { maxHeight: '220px', ariaLabel: 'Reporting currency' });
        }
      }
    }
    if (periodWrap && window.renderCustomSelect && window.DashboardPeriodState) {
      var period = window.DashboardPeriodState.get();
      var pOptions = periodOptions();
      var periodSignature = pOptions.map(function (opt) { return opt.value + ':' + opt.label; }).join('|');
      var selectedPreset = pOptions.some(function (opt) { return opt.value === period.preset; }) ? period.preset : 'custom';
      var pKey = selectedPreset + '|' + period.dateFrom + '|' + period.dateTo + '|' + (window._kbotLang || 'en') + '|' + periodSignature;
      if (shellEl._topbarPeriodKey !== pKey) {
        shellEl._topbarPeriodKey = pKey;
        window.renderCustomSelect(periodWrap, pOptions, selectedPreset || 'thisMonth', function (value) {
          shellEl._topbarPeriodKey = null;
          clearCustomRangeDraft(shellEl);
          if (value === 'custom') window.DashboardPeriodState.setPreset('custom');
          else window.DashboardPeriodState.setPreset(value);
          var nextPeriod = window.DashboardPeriodState.get();
          var rangeEl = shellEl.querySelector('#dashboard-custom-range');
          if (rangeEl) rangeEl.hidden = nextPeriod.preset !== 'custom';
          syncCustomRangeControls(shellEl, nextPeriod);
          if (typeof opts.onPeriodChange === 'function') opts.onPeriodChange(nextPeriod);
        }, { maxHeight: '280px', ariaLabel: tr('period.label') });
      }
      var custom = shellEl.querySelector('#dashboard-custom-range');
      var from = shellEl.querySelector('#dashboard-date-from');
      var to = shellEl.querySelector('#dashboard-date-to');
      var viewBtn = shellEl.querySelector('#dashboard-view-range-btn');
      var showCustom = selectedPreset === 'custom';
      if (custom) custom.hidden = !showCustom;
      [from, to].forEach(function (button) {
        if (!button || button._dashDateReady) return;
        button._dashDateReady = true;
        button.addEventListener('click', function () {
          var current = window.DashboardPeriodState.get();
          var draft = getCustomRangeDraft(shellEl, current);
          var isFrom = button.id === 'dashboard-date-from';
          openDashboardDatePicker(button, isFrom ? draft.dateFrom : draft.dateTo, function (nextDate) {
            var nextFrom = isFrom ? nextDate : draft.dateFrom;
            var nextTo = isFrom ? draft.dateTo : nextDate;
            if (isFrom && nextFrom > nextTo) nextTo = nextFrom;
            if (!isFrom && nextTo < nextFrom) nextFrom = nextTo;
            setCustomRangeDraft(shellEl, { dateFrom: nextFrom, dateTo: nextTo });
            syncCustomRangeControls(shellEl, current);
          });
        });
      });
      if (viewBtn && !viewBtn._dashViewRangeReady) {
        viewBtn._dashViewRangeReady = true;
        viewBtn.addEventListener('click', function () {
          var current = window.DashboardPeriodState.get();
          var draft = getCustomRangeDraft(shellEl, current);
          if (!customRangeDraftIsDirty(draft, current)) return;
          window.DashboardPeriodState.setCustomRange(draft.dateFrom, draft.dateTo);
          var applied = window.DashboardPeriodState.get();
          setCustomRangeDraft(shellEl, applied);
          shellEl._topbarPeriodKey = null;
          syncCustomRangeControls(shellEl, applied);
          viewBtn.classList.remove('is-applied');
          void viewBtn.offsetWidth;
          viewBtn.classList.add('is-applied');
          clearTimeout(shellEl._dashboardRangeAppliedTimer);
          shellEl._dashboardRangeAppliedTimer = setTimeout(function () {
            viewBtn.classList.remove('is-applied');
          }, 620);
          if (typeof opts.onPeriodChange === 'function') opts.onPeriodChange(applied);
        });
      }
      syncCustomRangeControls(shellEl, period);
    }

    if (deliveredDateWrap && window.renderCustomSelect && window.DashboardDeliveredDateState) {
      var deliveredDateMode = window.DashboardDeliveredDateState.get();
      var dOptions = deliveredDateOptions();
      var dSignature = dOptions.map(function (opt) { return opt.value + ':' + opt.label; }).join('|');
      var dKey = deliveredDateMode + '|' + (window._kbotLang || 'en') + '|' + dSignature;
      if (shellEl._topbarDeliveredDateKey !== dKey) {
        shellEl._topbarDeliveredDateKey = dKey;
        window.renderCustomSelect(deliveredDateWrap, dOptions, deliveredDateMode, function (value) {
          shellEl._topbarDeliveredDateKey = null;
          window.DashboardDeliveredDateState.set(value);
          if (typeof opts.onDeliveredDateModeChange === 'function') opts.onDeliveredDateModeChange(window.DashboardDeliveredDateState.get());
        }, { maxHeight: '180px', ariaLabel: tr('deliveredDate.label') });
      }
    }

    var expectedRangeWrap = shellEl.querySelector('#dashboard-expected-ndr-range');
    if (expectedRangeWrap && window.DashboardExpectedNdrRangeState) {
      var expectedMode = window.DashboardDeliveredDateState ? window.DashboardDeliveredDateState.get() === 'expected' : false;
      var expectedRange = window.DashboardExpectedNdrRangeState.get();
      var expectedFrom = shellEl.querySelector('#dashboard-expected-ndr-date-from');
      var expectedTo = shellEl.querySelector('#dashboard-expected-ndr-date-to');
      expectedRangeWrap.hidden = !expectedMode;
      [expectedFrom, expectedTo].forEach(function (button) {
        if (!button || button._dashExpectedNdrDateReady) return;
        button._dashExpectedNdrDateReady = true;
        button.addEventListener('click', function () {
          var current = window.DashboardExpectedNdrRangeState.get();
          var isFrom = button.id === 'dashboard-expected-ndr-date-from';
          openDashboardDatePicker(button, isFrom ? current.dateFrom : current.dateTo, function (nextDate) {
            var nextFrom = isFrom ? nextDate : current.dateFrom;
            var nextTo = isFrom ? current.dateTo : nextDate;
            if (isFrom && nextFrom > nextTo) nextTo = nextFrom;
            if (!isFrom && nextTo < nextFrom) nextFrom = nextTo;
            window.DashboardExpectedNdrRangeState.setRange(nextFrom, nextTo);
            shellEl._topbarExpectedNdrRangeKey = null;
            if (typeof opts.onDeliveredDateModeChange === 'function') opts.onDeliveredDateModeChange(window.DashboardDeliveredDateState ? window.DashboardDeliveredDateState.get() : 'expected');
          });
        });
      });
      if (expectedFrom) expectedFrom.textContent = expectedRange.dateFrom ? shortDate(expectedRange.dateFrom) : '--';
      if (expectedTo) expectedTo.textContent = expectedRange.dateTo ? shortDate(expectedRange.dateTo) : '--';
    }

    var updateBtn = shellEl.querySelector('#dashboard-update-btn');
    if (updateBtn && !updateBtn._dashReady) {
      updateBtn._dashReady = true;
      updateBtn.addEventListener('click', function () {
        var current = window.DashboardPeriodState ? window.DashboardPeriodState.get() : null;
        var draft = current && current.preset === 'custom' ? getCustomRangeDraft(shellEl, current) : null;
        if (customRangeDraftIsDirty(draft, current)) {
          syncCustomRangeControls(shellEl, current);
          var viewRangeBtn = shellEl.querySelector('#dashboard-view-range-btn');
          if (viewRangeBtn) viewRangeBtn.focus();
          return;
        }
        if (typeof opts.onDashboardUpdate === 'function') opts.onDashboardUpdate(window.DashboardPeriodState ? window.DashboardPeriodState.get() : null);
      });
    }
    var manageAccountsBtn = shellEl.querySelector('#dashboard-manage-accounts-btn');
    if (manageAccountsBtn && !manageAccountsBtn._dashReady) {
      manageAccountsBtn._dashReady = true;
      manageAccountsBtn.addEventListener('click', function () {
        if (typeof window.goToSetup === 'function') window.goToSetup('accounts');
      });
    }

    if (!wrap || !window.renderCustomSelect) return;

    var rawOptions = meta.accountOptions || window.dashboardAccountsList || [];
    if (!rawOptions.length) rawOptions = [{ id: '__all__', label: tr('shell.allAccounts'), orderCount: 0 }];
    var current = meta.activeAccountId || (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');

    // Skip re-rendering the select if nothing changed
    var optionSignature = rawOptions.map(function (acc) {
      return [
        acc.id || acc.value || '',
        acc.orderCount || 0,
        acc.taagerCountry || (Array.isArray(acc.countries) ? acc.countries.join(',') : ''),
        acc.memberName || acc.easyEmail || acc.email || acc.taagerEmail || acc.easyStore || acc.storeName || acc.label || acc.name || '',
        acc.email || acc.taagerEmail || acc.easyEmail || ''
      ].join(':');
    }).join('|');
    var activePeriod = window.DashboardPeriodState ? window.DashboardPeriodState.get() : null;
    var periodKey = activePeriod ? (activePeriod.preset + ':' + activePeriod.dateFrom + ':' + activePeriod.dateTo) : '';
    var deliveredDateKey = window.DashboardDeliveredDateState ? window.DashboardDeliveredDateState.get() : 'actual';
    var expectedNdrRange = window.DashboardExpectedNdrRangeState ? window.DashboardExpectedNdrRangeState.get() : null;
    var expectedNdrRangeKey = expectedNdrRange ? (expectedNdrRange.dateFrom + ':' + expectedNdrRange.dateTo) : '';
    var cacheKey = current + '|' + periodKey + '|' + deliveredDateKey + '|' + expectedNdrRangeKey + '|' + optionSignature;
    if (shellEl._topbarSelectKey === cacheKey) return;
    shellEl._topbarSelectKey = cacheKey;

    var options = rawOptions.map(function (acc) {
      var count = Number(acc.orderCount || 0);
      var primary = acc.memberName || acc.label || acc.name || acc.easyStore || acc.storeName || acc.easyEmail || acc.email || acc.taagerEmail || acc.id;
      var email = acc.email || acc.taagerEmail || acc.easyEmail || '';
      var displayStr = primary;
      var countText = count ? '  ' + (window.dashboardI18n ? window.dashboardI18n.number(count) : count.toLocaleString('en-US')) + ' ' + tr(count === 1 ? 'shell.ordersSuffix' : 'shell.orderCountSuffix') : '';
      var countryLabel = acc.taagerCountry && window.TaagerCountry && window.TaagerCountry.label ? window.TaagerCountry.label(acc.taagerCountry) : '';
      var subLabel = [countryLabel, email && email !== primary ? email : ''].filter(Boolean).join(' · ');
      return {
        value: acc.id || acc.value,
        label: (window.dashboardI18n ? window.dashboardI18n.raw(displayStr) : displayStr) + countText,
        labelHtml: countryBadgeHtml(acc) + '<span class="dashboard-account-select-title">' + esc(window.dashboardI18n ? window.dashboardI18n.raw(displayStr) : displayStr) + esc(countText) + '</span>',
        subLabel: subLabel
      };
    });
    window.renderCustomSelect(wrap, options, current, function (value) {
      shellEl._topbarSelectKey = null; // force re-render after change
      if (typeof opts.onAccountChange === 'function') opts.onAccountChange(value);
    }, { searchable: true, maxHeight: '280px', ariaLabel: tr('shell.account') });
  }

  function updateFirstRunGuidance(shellEl, data) {
    var guidance = shellEl && shellEl.querySelector('#dashboard-first-run-guidance');
    if (!guidance) return;
    var show = !!(data && data.meta && data.meta.hasData === false) && !isDashboardPreviewMode();
    guidance.style.display = show ? 'flex' : 'none';
    var btn = guidance.querySelector('#dashboard-first-run-btn');
    if (btn && !btn._dashFirstRunReady) {
      btn._dashFirstRunReady = true;
      btn.addEventListener('click', function () {
        if (typeof goToSetup === 'function') goToSetup('run');
      });
    }
  }

  function applyInnerCollapse(shellEl, collapsed) {
    var sidebar = shellEl.querySelector('#dash-inner-sidebar');
    var taagerText = shellEl.querySelector('#dash-taager-text');
    var onlineLbl = shellEl.querySelector('#dash-online-label');
    var navLabels = shellEl.querySelectorAll('.dash-nav-lbl');
    var navBtns = shellEl.querySelectorAll('.dash-nav-btn');
    var handle = shellEl.querySelector('.dash-inner-handle');
    var w = collapsed ? 44 : 210;
    var rtl = isRtl();

    if (sidebar) sidebar.style.width = w + 'px';
    shellEl.classList.toggle('dash-inner-collapsed', collapsed);
    shellEl.setAttribute('data-sidebar-collapsed', collapsed ? 'true' : 'false');
    if (taagerText) taagerText.style.display = collapsed ? 'none' : 'block';
    if (onlineLbl) onlineLbl.style.display = collapsed ? 'none' : 'inline';
    navLabels.forEach(function (label) { label.style.display = collapsed ? 'none' : 'block'; });
    navBtns.forEach(function (btn) {
      btn.style.justifyContent = collapsed ? 'center' : 'flex-start';
      btn.style.padding = collapsed ? '10px 0' : '10px 12px';
    });
    if (handle) {
      handle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      handle.setAttribute('aria-label', tr(collapsed ? 'shell.expand' : 'shell.collapse'));
      handle.style.left = '';
      handle.style.right = '';
      handle.style.top = 'auto';
      handle.style.bottom = '32px';
      handle.style.insetInlineStart = w + 'px';
      handle.style.transform = 'translateX(' + (rtl ? '50%' : '-50%') + ')' +
        (collapsed ? ' rotate(180deg)' : '');
    }
  }

  function applyResponsiveState(shellEl) {
    if (!shellEl) return;
    var w = shellEl.clientWidth || window.innerWidth || 0;
    shellEl.classList.toggle('dash-size-lg', w >= 1180);
    shellEl.classList.toggle('dash-size-md', w < 1180 && w >= 960);
    shellEl.classList.toggle('dash-size-sm', w < 960 && w >= 760);
    shellEl.classList.toggle('dash-size-xs', w < 760);
    shellEl.style.setProperty('--dash-shell-width', w + 'px');
  }

  function isLightTheme() {
    var theme = document.documentElement.getAttribute('data-theme') || window._kbotTheme || 'dark';
    return theme === 'light';
  }

  function hasDarkInlineSurface(styleText) {
    styleText = String(styleText || '').toLowerCase();
    return /background\s*:/.test(styleText) && (
      styleText.indexOf('#030712') !== -1 ||
      styleText.indexOf('#050a15') !== -1 ||
      styleText.indexOf('#060c1a') !== -1 ||
      styleText.indexOf('#070a13') !== -1 ||
      styleText.indexOf('#080b12') !== -1 ||
      styleText.indexOf('#0a0f18') !== -1 ||
      styleText.indexOf('#0a0f1c') !== -1 ||
      styleText.indexOf('#0b0c0f') !== -1 ||
      styleText.indexOf('#0b0f19') !== -1 ||
      styleText.indexOf('#0b1120') !== -1 ||
      styleText.indexOf('#0d1220') !== -1 ||
      styleText.indexOf('#0d1320') !== -1 ||
      styleText.indexOf('#0f172a') !== -1 ||
      styleText.indexOf('#111318') !== -1 ||
      styleText.indexOf('#111827') !== -1 ||
      styleText.indexOf('rgba(0,0,0') !== -1 ||
      styleText.indexOf('rgba(0, 0, 0') !== -1 ||
      styleText.indexOf('rgba(13,19,32') !== -1 ||
      styleText.indexOf('rgba(15,23,42') !== -1 ||
      styleText.indexOf('rgba(17,24,39') !== -1 ||
      styleText.indexOf('rgba(30,41,59') !== -1
    );
  }

  function hasFaintWhiteInlineColor(styleText) {
    styleText = String(styleText || '').toLowerCase();
    return /color\s*:/.test(styleText) && (
      styleText.indexOf('#fff') !== -1 ||
      styleText.indexOf('#ffffff') !== -1 ||
      styleText.indexOf('#f0f1f3') !== -1 ||
      styleText.indexOf('#f5edff') !== -1 ||
      styleText.indexOf('#f8fafc') !== -1 ||
      styleText.indexOf('rgba(255,255,255') !== -1 ||
      styleText.indexOf('rgba(255, 255, 255') !== -1
    );
  }

  function alphaFromRgba(styleText) {
    var match = String(styleText || '').match(/rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)/i);
    return match ? Number(match[1]) : 1;
  }

  function applyDashboardInlineTheme(root) {
    if (!root) return;
    var light = isLightTheme();
    root.setAttribute('data-inline-theme-fixed', light ? 'light' : 'dark');
    if (!light) return;

    var nodes = [root].concat(Array.from(root.querySelectorAll('[style]')));
    nodes.forEach(function (el) {
      var styleText = el.getAttribute('style') || '';
      if (hasDarkInlineSurface(styleText)) {
        var isPageRoot = el.classList.contains('s7-body') ||
          el.classList.contains('s9-body') ||
          styleText.indexOf('flex:1') !== -1 && styleText.indexOf('overflow-y:auto') !== -1;
        el.style.setProperty('background', isPageRoot ? 'var(--dash-bg)' : 'var(--dash-surface)', 'important');
        el.style.setProperty('border-color', 'var(--dash-border-soft)', 'important');
        if (styleText.indexOf('box-shadow:inset') !== -1 || styleText.indexOf('box-shadow:0 ') !== -1) {
          el.style.setProperty('box-shadow', 'var(--dash-shadow-card)', 'important');
        }
      }

      if (hasFaintWhiteInlineColor(styleText)) {
        var alpha = alphaFromRgba(styleText);
        var color = alpha <= 0.42 ? 'var(--dash-text-faint)' : (alpha <= 0.72 ? 'var(--dash-text-muted)' : 'var(--dash-text)');
        el.style.setProperty('color', color, 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('text-shadow', 'none', 'important');
      }

      if (/border-(top|bottom|left|right)\s*:.*rgba\(255,\s*255,\s*255/i.test(styleText)) {
        el.style.setProperty('border-color', 'var(--dash-border-soft)', 'important');
      }
    });

    root.querySelectorAll('input, textarea, select').forEach(function (el) {
      el.style.setProperty('background', 'var(--dash-input-bg)', 'important');
      el.style.setProperty('border-color', 'var(--dash-border)', 'important');
      el.style.setProperty('color', 'var(--dash-text)', 'important');
    });

    root.querySelectorAll('thead, th').forEach(function (el) {
      el.style.setProperty('background', 'var(--dash-table-header)', 'important');
      el.style.setProperty('color', 'var(--dash-text-faint)', 'important');
    });

    root.querySelectorAll('td').forEach(function (el) {
      el.style.setProperty('color', 'var(--dash-text-muted)', 'important');
      el.style.setProperty('border-color', 'var(--dash-border-soft)', 'important');
    });

    root.querySelectorAll('.sfe-wrapper, .sfe-panel, .sfe-metric-card, .s7-card, .s7-input-wrap').forEach(function (el) {
      el.style.setProperty('background', 'var(--dash-surface)', 'important');
      el.style.setProperty('border-color', 'var(--dash-border-soft)', 'important');
      el.style.setProperty('color', 'var(--dash-text)', 'important');
      el.style.setProperty('box-shadow', 'var(--dash-shadow-card)', 'important');
    });

    root.querySelectorAll('.sc-custom-menu, .sc-custom-container > div:first-child').forEach(function (el) {
      el.style.setProperty('background', 'var(--dash-surface)', 'important');
      el.style.setProperty('border-color', 'var(--dash-border)', 'important');
      el.style.setProperty('color', 'var(--dash-text)', 'important');
      el.style.setProperty('box-shadow', 'var(--dash-shadow-float)', 'important');
    });

    root.querySelectorAll('.ai-inline-advisor strong, .ai-advisor-card strong').forEach(function (el) {
      el.style.setProperty('color', 'var(--dash-text)', 'important');
    });
    root.querySelectorAll('.ai-inline-advisor span, .ai-inline-advisor em, .ai-advisor-card span, .ai-advisor-card em').forEach(function (el) {
      el.style.setProperty('color', 'var(--dash-text-faint)', 'important');
    });

    root.querySelectorAll('.taager-ai-section, .aii-panel, .aii-hero-header').forEach(function (el) {
      el.style.setProperty('background', 'var(--dash-surface)', 'important');
      el.style.setProperty('border-color', 'var(--dash-border-soft)', 'important');
      el.style.setProperty('color', 'var(--dash-text)', 'important');
      el.style.setProperty('box-shadow', 'var(--dash-shadow-card)', 'important');
    });
    root.querySelectorAll('.aii-alert-chip:not([class*="aii-glow-"]), .aii-feed-card:not([class*="aii-glow-"]), .aii-chat-msg-body, .aii-action-btn, .aii-chip, .aii-close-btn, .aii-stream-tab:not(.active), .aii-stream-tab:not(.active) strong, .aii-badge').forEach(function (el) {
      el.style.setProperty('background', 'var(--dash-surface-soft)', 'important');
      el.style.setProperty('border-color', 'var(--dash-border-soft)', 'important');
      el.style.setProperty('color', 'var(--dash-text)', 'important');
    });
    root.querySelectorAll('.aii-hero-title h1, .aii-panel-head h2, .aii-feed-card strong, .aii-detail-top h3, .aii-state strong, .aii-chat-msg-body p, .aii-alert-chip-content strong').forEach(function (el) {
      el.style.setProperty('color', 'var(--dash-text)', 'important');
    });
    root.querySelectorAll('.aii-hero-title p, .aii-metric span, .aii-chat-msg-body span, .aii-feed-card em, .aii-detail-content, .aii-state, .aii-explain-block span, .aii-alert-chip-content em, .aii-ai-disclaimer').forEach(function (el) {
      el.style.setProperty('color', 'var(--dash-text-muted)', 'important');
    });

  }

  window.applyDashboardInlineTheme = applyDashboardInlineTheme;

  function scheduleInlineThemeFix(pane) {
    if (!pane) return;
    applyDashboardInlineTheme(pane);
    [60, 180, 420, 900].forEach(function (delay) {
      setTimeout(function () { applyDashboardInlineTheme(pane); }, delay);
    });
    if (!window.MutationObserver) return;
    if (pane._inlineThemeObserver) pane._inlineThemeObserver.disconnect();
    var pending = false;
    var applying = false;
    pane._inlineThemeObserver = new MutationObserver(function () {
      if (applying || pending || !isLightTheme()) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        applying = true;
        applyDashboardInlineTheme(pane);
        applying = false;
      });
    });
    pane._inlineThemeObserver.observe(pane, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  function disconnectPaneThemeObservers(pane) {
    if (!pane) return;
    ['_s7ThemeObserver', '_s8ThemeObserver', '_s9ThemeObserver'].forEach(function (key) {
      if (pane[key] && typeof pane[key].disconnect === 'function') {
        pane[key].disconnect();
      }
      pane[key] = null;
    });
  }

  function syncDashboardCountryState(data) {
    if (!data || !data.meta) return;
    window.dashboardActiveCountry = data.meta.activeCountry || window.dashboardActiveCountry || 'sa';
    window.dashboardActiveCurrency = data.meta.activeCurrency || window.dashboardActiveCurrency || 'SAR';
  }

  function switchSection(shellEl, sectionId, data, ctx, skipDelay) {
    sectionId = normalizeSection(sectionId);
    syncDashboardCountryState(data);
    setSidebarActive(shellEl, sectionId);
    updateTopbar(shellEl, data, ctx.options);
    updateFirstRunGuidance(shellEl, data);

    var pane = shellEl.querySelector('#dash-section-pane');
    if (!pane) return;
    var version = getDataVersion(data);
    var renderKey = sectionId + '|' + version + '|' + (window._kbotLang || '') + '|' + (window._kbotTheme || '');
    if (!skipDelay && pane._dashboardRenderKey === renderKey && pane.children.length && !(data && data._loading)) {
      return;
    }
    disconnectPaneThemeObservers(pane);
    if (typeof pane._dashboardSectionCleanup === 'function') {
      pane._dashboardSectionCleanup();
      pane._dashboardSectionCleanup = null;
    }
    if (pane._inlineThemeObserver) {
      pane._inlineThemeObserver.disconnect();
      pane._inlineThemeObserver = null;
    }
    pane._dashboardRenderKey = null;
    pane.innerHTML = loaderHTML(sectionId);

    var render = function () {
      if (data && data._loading) return;
      pane.innerHTML = '';
      if (!data || !data._loaded) {
        pane.innerHTML = loaderHTML(sectionId);
        return;
      }
      var fn = window[SECTION_FN[sectionId]];
      if (typeof fn !== 'function') {
        if (typeof window.ensureDashboardSection === 'function') {
          var requestedSection = sectionId;
          window.ensureDashboardSection(sectionId).then(function () {
            if (!shellEl.isConnected) return;
            if (shellEl._dashboardActiveSection !== requestedSection) return;
            pane._dashboardRenderKey = null;
            switchSection(shellEl, requestedSection, data, ctx, true);
          }).catch(function (err) {
            pane.innerHTML = '<div class="dash-coming-soon">' +
              '<div class="dash-coming-soon-icon">!</div>' +
              '<div class="dash-coming-soon-title">' + esc(trText('misc.loadFailed', 'Section failed to load')) + '</div>' +
              '<div class="dash-coming-soon-body">' + esc(err && err.message ? err.message : String(err || 'Unknown error')) + '</div>' +
              '</div>';
          });
          return;
        }
        pane.innerHTML = '<div class="dash-coming-soon"><div class="dash-coming-soon-icon">...</div></div>';
        return;
      }
      var key = DATA_KEY[sectionId];
      var slice = key ? (data[key] || null) : data;
      ctx.data = data;
      ctx.sectionId = sectionId;
      fn(pane, slice, ctx);
      pane._dashboardRenderKey = renderKey;
      if (window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.observe === 'function') {
        window.DashboardQueryRuntime.observe(sectionId, data);
      }
      if (ctx.options && typeof ctx.options.onSectionChange === 'function') {
        ctx.options.onSectionChange(sectionId, data);
      }
      if (window.dashboardI18n) window.dashboardI18n.apply(pane);
      if (window.TaagerUI) window.TaagerUI.enhance(pane);
      scheduleInlineThemeFix(pane);
      if (window.performance && typeof window.performance.mark === 'function') {
        try { window.performance.mark('dashboard:section:' + sectionId + ':rendered'); } catch (_) {}
      }
    };

    if (skipDelay) render();
    else scheduleSectionRender(shellEl, render);
  }

  window.renderDashboardShell = function (mountEl, data, options) {
    if (!mountEl) return;
    syncDashboardCountryState(data);
    if (typeof mountEl._dashboardCleanup === 'function') {
      mountEl._dashboardCleanup();
      mountEl._dashboardCleanup = null;
    }
    options = options || {};
    mountEl._dashboardOptions = options;
    var activeSection = normalizeSection(mountEl._dashboardActiveSection || window._dashboardInitialSection || 'master');
    window._dashboardInitialSection = null;
    var innerCollapsed = false;
    var ctx = {
      options: options,
      onNavigate: function (sectionId) {
        switchSection(mountEl, sectionId, data, ctx);
      },
      accent: '#a855f7',
      formatSAR: window.formatSAR,
      i18n: window.dashboardI18n || null
    };

    mountEl.classList.add('dash-shell');
    mountEl.setAttribute('dir', isRtl() ? 'rtl' : 'ltr');
    mountEl.innerHTML =
      buildSidebar(activeSection) +
      '<div class="dash-main">' +
        buildTopbar(activeSection) +
        '<div id="dashboard-first-run-guidance" class="dashboard-first-run-guidance" style="display:none;margin:12px 16px 0;padding:14px 16px;border:1px solid var(--dash-border, var(--border));border-radius:12px;background:var(--dash-card, var(--bg2));align-items:center;justify-content:space-between;gap:14px;box-shadow:0 10px 28px rgba(0,0,0,.10);">' +
          '<div style="min-width:0;">' +
            '<div style="font-size:13px;font-weight:800;color:var(--dash-text, var(--text));margin-bottom:3px;">' + trText('shell.firstRunTitle', 'Dashboard is ready') + '</div>' +
            '<div style="font-size:12px;color:var(--dash-muted, var(--text2));line-height:1.5;">' + trText('shell.firstRunBody', 'Run the bot or update the dashboard to start filling every section with live account data. Until then, the dashboard stays visible with zero-value metrics.') + '</div>' +
          '</div>' +
          '<button type="button" class="dash-update-btn" id="dashboard-first-run-btn">' + icon('play', 'currentColor') + '<span>' + trText('shell.firstRunAction', 'Go to Run') + '</span></button>' +
        '</div>' +
        '<div id="dash-section-pane" class="dash-scroll dash-content" style="flex:1 1 0;display:flex;flex-direction:column;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;"></div>' +
      '</div>';

    window.syncDashboardRangeActions = function () {
      if (!document.body.contains(mountEl) || !window.DashboardPeriodState) return;
      syncCustomRangeControls(mountEl, window.DashboardPeriodState.get());
    };
    var dashboardPage = dashboardPageForShell(mountEl);
    if (dashboardPage) {
      dashboardPage._taagerDeactivate = function () {
        clearCustomRangeDraft(mountEl);
        if (window.DashboardPeriodState) {
          syncCustomRangeControls(mountEl, window.DashboardPeriodState.get());
        }
        clearCustomRangeDraft(mountEl);
      };
    }

    updateTopbar(mountEl, data, options);
    updateFirstRunGuidance(mountEl, data);
    if (window.dashboardI18n) window.dashboardI18n.apply(mountEl);
    if (window.TaagerUI) window.TaagerUI.enhance(mountEl);

    // Mount floating collapse handle centered on the inner sidebar edge
    (function () {
      var rtl = isRtl();
      var handle = document.createElement('button');
      handle.className = 'sb-collapse-handle dash-inner-handle sb-collapse-handle2';
      handle.type = 'button';
      handle.setAttribute('aria-label', tr('shell.collapse'));
      handle.setAttribute('aria-expanded', 'true');
      handle.innerHTML = rtl ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
      handle.style.insetInlineStart = '210px';
      handle.style.top = 'auto';
      handle.style.bottom = '32px';
      handle.style.transform = 'translateX(' + (rtl ? '50%' : '-50%') + ')';
      mountEl.appendChild(handle);
      handle.addEventListener('click', function () {
        innerCollapsed = !innerCollapsed;
        applyInnerCollapse(mountEl, innerCollapsed);
      });
    })();

    var sidebar = mountEl.querySelector('#dash-inner-sidebar');
    if (sidebar) {
      sidebar.addEventListener('click', function (e) {
        var btn = e.target.closest('.dash-nav-btn');
        if (!btn) return;
        var id = btn.getAttribute('data-section');
        if (id) switchSection(mountEl, id, data, ctx);
      });
    }

    var _resizeTimer;
    var _resizeObserver = window.ResizeObserver ? new ResizeObserver(_debouncedResize) : null;
    var lastIsSmallScreen = null;
    function handleResize() {
      if (!document.body.contains(mountEl)) {
        window.removeEventListener('resize', _debouncedResize);
        if (_resizeObserver) _resizeObserver.disconnect();
        return;
      }
      applyResponsiveState(mountEl);
      var width = mountEl.clientWidth || window.innerWidth || 0;
      var isSmallScreen = width < 760;
      if (lastIsSmallScreen === null) {
        lastIsSmallScreen = isSmallScreen;
        innerCollapsed = isSmallScreen;
        applyInnerCollapse(mountEl, innerCollapsed);
      } else if (isSmallScreen !== lastIsSmallScreen) {
        lastIsSmallScreen = isSmallScreen;
        innerCollapsed = isSmallScreen;
        applyInnerCollapse(mountEl, innerCollapsed);
      }
    }
    function _debouncedResize() {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(handleResize, 80);
    }
    window.addEventListener('resize', _debouncedResize);
    if (_resizeObserver) _resizeObserver.observe(mountEl);
    mountEl._dashboardCleanup = function () {
      disconnectPaneThemeObservers(mountEl.querySelector('#dash-section-pane'));
      window.removeEventListener('resize', _debouncedResize);
      clearTimeout(_resizeTimer);
      clearTimeout(mountEl._dashboardRangeAppliedTimer);
      if (_resizeObserver) _resizeObserver.disconnect();
    };
    handleResize();
    switchSection(mountEl, activeSection, data, ctx);
    bindDashboardTour(mountEl, data, ctx);
    if (!(window.TaagerPremiumPreview && window.TaagerPremiumPreview.isActive('dashboard')) && typeof window.mountDashboardAI === 'function') window.mountDashboardAI(mountEl, data, ctx);
  };

  window.refreshDashboardShell = function (mountEl, data) {
    if (!mountEl) return;
    syncDashboardCountryState(data);
    applyResponsiveState(mountEl);
    var active = normalizeSection(mountEl._dashboardActiveSection || 'master');
    var ctx = {
      options: mountEl._dashboardOptions || {},
      onNavigate: function (id) { switchSection(mountEl, id, data, ctx); },
      accent: '#a855f7',
      formatSAR: window.formatSAR,
      i18n: window.dashboardI18n || null
    };
    switchSection(mountEl, active, data, ctx);
    bindDashboardTour(mountEl, data, ctx);
    updateFirstRunGuidance(mountEl, data);
    if (window.dashboardI18n) window.dashboardI18n.apply(mountEl);
    if (window.TaagerUI) window.TaagerUI.enhance(mountEl);
    if (!(window.TaagerPremiumPreview && window.TaagerPremiumPreview.isActive('dashboard')) && typeof window.mountDashboardAI === 'function') window.mountDashboardAI(mountEl, data, ctx);
  };
})();
