(function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tx(en, ar) {
    return window.dashboardI18n && typeof window.dashboardI18n.pick === 'function'
      ? window.dashboardI18n.pick(en, ar)
      : en;
  }

  function fmtNumber(value, decimals) {
    var number = Number(value || 0);
    if (!isFinite(number)) number = 0;
    var locale = window.dashboardI18n && typeof window.dashboardI18n.locale === 'function' ? window.dashboardI18n.locale() : undefined;
    return number.toLocaleString(locale, { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
  }

  function activeAccountId(fullData) {
    return String(
      fullData && fullData.meta && fullData.meta.activeAccountId ||
      (typeof window.getActiveAccountId === 'function' ? window.getActiveAccountId() : '__all__')
    );
  }

  function accountIdOf(account) {
    return String(account && (account.id || account.accountId || account.key || '') || '');
  }

  function accountLabelOf(account) {
    return String(account && (
      account.memberName ||
      account.easyEmail ||
      account.easy_email ||
      account.taagerEmail ||
      account.taager_email ||
      account.email ||
      account.label ||
      account.name ||
      accountIdOf(account)
    ) || '');
  }

  function listTaagerAccounts(fullData, selectedAccountId) {
    var source = fullData && fullData.meta && Array.isArray(fullData.meta.accountOptions)
      ? fullData.meta.accountOptions
      : (Array.isArray(window.dashboardAccountsList) ? window.dashboardAccountsList : []);
    var seen = {};
    var accounts = source.map(function (account) {
      var id = accountIdOf(account);
      if (!id || id === '__all__' || seen[id]) return null;
      seen[id] = true;
      return { id: id, label: accountLabelOf(account) || id };
    }).filter(Boolean);
    if (selectedAccountId && selectedAccountId !== '__all__' && !seen[selectedAccountId]) {
      accounts.push({ id: selectedAccountId, label: selectedAccountId });
    }
    return accounts;
  }

  function normalizeSource(source) {
    if (!source) return null;
    var id = String(source.id || source.sourceAccountId || source.adAccountId || '').trim();
    if (!id) return null;
    return {
      id: id,
      name: String(source.name || source.sourceAccountName || source.adAccountName || id),
      currency: String(source.currency || source.rawCurrency || 'SAR').toUpperCase(),
      organizationName: String(source.organizationName || ''),
      canManageCampaigns: !!source.canManageCampaigns
    };
  }

  function getPeriod(fullData) {
    var period = fullData && fullData.meta && fullData.meta.period || {};
    return {
      dateFrom: period.from || period.dateFrom || period.start || '',
      dateTo: period.to || period.dateTo || period.end || ''
    };
  }

  window.renderSectionSaudiIPickMarketingHydratedEntry = function renderSectionSaudiIPickMarketing(mount, data, ctx) {
    var fullData = ctx && ctx.data ? ctx.data : (data || {});
    var selectedAccountId = activeAccountId(fullData);
    var allMode = selectedAccountId === '__all__';
    var accountOptions = listTaagerAccounts(fullData, selectedAccountId);
    var store = window.DashboardMarketingState;
    var tokenState = { configured: false, tokenPreview: '', connectUrl: 'https://saudiipick.com/dashboard/settings' };
    var status = store && typeof store.get === 'function' ? store.get(selectedAccountId, 'snapchat') : null;
    var availableAccounts = [];
    var selectedSources = [];
    var message = '';
    var error = '';
    var loading = false;

    function setStore(next) {
      if (store && typeof store.set === 'function') store.set(next, selectedAccountId, 'snapchat');
      status = next;
    }

    function selectedIds() {
      return Array.prototype.slice.call(mount.querySelectorAll('[data-sip-source]:checked')).map(function (input) {
        return input.value;
      });
    }

    function selectedSourceObjects() {
      var ids = selectedIds();
      return availableAccounts.filter(function (source) { return ids.indexOf(source.id) !== -1; });
    }

    function sourceChecked(source) {
      var mapped = selectedSources.length ? selectedSources : (status && (status.selectedSourceAccounts || status.mappedAccounts) || []);
      return mapped.some(function (item) { return String(item && item.id || '') === source.id; });
    }

    function tokenPanel() {
      return '<section class="marketing-connection-guide">' +
        '<div class="marketing-guide-head">' +
          '<div><h4>' + esc(tx('Saudi iPick desktop bridge', 'ربط Saudi iPick بسطح المكتب')) + '</h4>' +
          '<p>' + esc(tx('Create a desktop token from the website Settings page, paste it here once, then sync selected Snapchat accounts into the calculators.', 'أنشئ رمز سطح المكتب من إعدادات الموقع، والصقه هنا مرة واحدة، ثم زامن حسابات سناب شات المحددة داخل الحاسبات.')) + '</p></div>' +
          '<button type="button" class="marketing-secondary" data-sip-open-settings>' + esc(tx('Open website settings', 'فتح إعدادات الموقع')) + '</button>' +
        '</div>' +
        '<div class="marketing-token-row" style="display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;margin-top:14px;">' +
          '<input type="password" data-sip-token-input placeholder="' + esc(tx('Paste desktop token from Saudi iPick', 'الصق رمز سطح المكتب من Saudi iPick')) + '" style="min-width:0;border:1px solid var(--dash-border);border-radius:8px;background:var(--dash-surface);color:var(--dash-text);padding:10px 12px;">' +
          '<button type="button" class="marketing-primary" data-sip-save-token>' + esc(tx('Save token', 'حفظ الرمز')) + '</button>' +
          '<button type="button" class="marketing-secondary" data-sip-clear-token' + (tokenState.configured ? '' : ' disabled') + '>' + esc(tx('Clear', 'مسح')) + '</button>' +
        '</div>' +
        '<p class="marketing-sync-note">' + esc(tokenState.configured ? tx('Token saved: ', 'الرمز محفوظ: ') + tokenState.tokenPreview : tx('No desktop token saved yet.', 'لا يوجد رمز محفوظ حتى الآن.')) + '</p>' +
      '</section>';
    }

    function sourceAccountsPanel() {
      if (!tokenState.configured) return '';
      var rows = availableAccounts.length ? availableAccounts.map(function (source) {
        return '<label class="marketing-mapping-choice" style="display:flex;align-items:center;gap:10px;">' +
          '<input type="checkbox" data-sip-source value="' + esc(source.id) + '"' + (sourceChecked(source) ? ' checked' : '') + '>' +
          '<span><strong>' + esc(source.name) + '</strong><small>' + esc((source.organizationName ? source.organizationName + ' · ' : '') + source.currency + (source.canManageCampaigns ? ' · manage campaigns' : '')) + '</small></span>' +
        '</label>';
      }).join('') : '<div class="marketing-inline-warning">' + esc(tx('No selected Snapchat accounts came back from Saudi iPick yet. Connect Snapchat on the website and select the ad accounts first.', 'لم تصل أي حسابات سناب شات محددة من Saudi iPick بعد. اربط سناب شات في الموقع وحدد الحسابات الإعلانية أولاً.')) + '</div>';

      return '<section class="marketing-mapping-board">' +
        '<h4>' + esc(tx('Selected Snapchat ad accounts', 'حسابات سناب شات المحددة')) + '</h4>' +
        '<div class="marketing-account-map">' + rows + '</div>' +
        '<div class="marketing-actions">' +
          '<button type="button" class="marketing-primary" data-sip-save-mapping' + (availableAccounts.length && !allMode ? '' : ' disabled') + '>' + esc(tx('Assign to this account', 'تعيين لهذا الحساب')) + '</button>' +
          '<button type="button" class="marketing-sync-btn" data-sip-sync' + ((selectedSources.length || (status && status.mappedAccounts && status.mappedAccounts.length)) && !allMode ? '' : ' disabled') + '>' + esc(tx('Sync Snapchat spend', 'مزامنة إنفاق سناب شات')) + '</button>' +
          '<button type="button" class="marketing-secondary" data-sip-refresh>' + esc(tx('Refresh accounts', 'تحديث الحسابات')) + '</button>' +
        '</div>' +
        (allMode ? '<p class="marketing-sync-note">' + esc(tx('Select a single Taager account from the top bar to assign and sync accounts.', 'اختر حساب تاجر واحد من الشريط العلوي للتعيين والمزامنة.')) + '</p>' : '') +
      '</section>';
    }

    function summaryPanel() {
      var summary = status && status.summary;
      return '<article class="marketing-platform-card" data-marketing-platform="snapchat">' +
        '<div class="marketing-platform-head">' +
          '<div class="marketing-platform-brand"><span class="marketing-platform-mark snap">SC</span><div><strong>Snapchat Ads</strong><small>Saudi iPick API</small></div></div>' +
          '<span class="marketing-status ' + (summary ? 'is-connected' : 'is-disconnected') + '">' + esc(summary ? tx('Synced', 'متزامن') : tx('Ready for sync', 'جاهز للمزامنة')) + '</span>' +
        '</div>' +
        '<div class="marketing-metric-grid">' +
          '<div class="marketing-spend-metric"><span>' + esc(tx('Ad spend', 'الإنفاق الإعلاني')) + '</span><strong>' + esc(summary ? fmtNumber(summary.adSpend, 2) + ' ' + (summary.currency || 'SAR') : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('Campaign rows', 'صفوف الحملات')) + '</span><strong>' + esc(summary ? fmtNumber(summary.campaignCount, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('Purchases', 'المشتريات')) + '</span><strong>' + esc(summary ? fmtNumber(summary.purchases, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('ROAS', 'العائد على الإنفاق')) + '</span><strong>' + esc(summary ? fmtNumber(summary.purchaseValue && summary.adSpend ? summary.purchaseValue / summary.adSpend : summary.roas, 2) + 'x' : '--') + '</strong></div>' +
        '</div>' +
      '</article>';
    }

    function render() {
      mount.innerHTML = '<div class="marketing-section">' +
        '<header class="marketing-hero">' +
          '<div><p class="marketing-kicker">Saudi iPick API</p><h2>' + esc(tx('Native marketing connection', 'الربط التسويقي المباشر')) + '</h2>' +
          '<p>' + esc(tx('Use the Saudi iPick website connection as the source for Snapchat spend, campaigns, purchases, CPA, and ROAS inside this desktop dashboard.', 'استخدم ربط موقع Saudi iPick كمصدر لإنفاق سناب شات والحملات والمشتريات وCPA وROAS داخل لوحة سطح المكتب.')) + '</p></div>' +
          '<aside class="marketing-security"><strong>' + esc(tx('No Windsor changes', 'بدون تغيير Windsor')) + '</strong><span>' + esc(tx('The old Marketing Connections section stays available. This section writes synced Snapchat spend into the same calculators after you press sync.', 'قسم الربط القديم يبقى كما هو. هذا القسم يرسل إنفاق سناب شات للحاسبات نفسها بعد المزامنة.')) + '</span></aside>' +
        '</header>' +
        (error ? '<div class="marketing-message is-error">' + esc(error) + '</div>' : '') +
        (message ? '<div class="marketing-message">' + esc(message) + '</div>' : '') +
        (loading ? '<div class="marketing-loading"><span class="dash-preloader-spinner"></span><span>' + esc(tx('Working...', 'جارٍ العمل...')) + '</span></div>' : '') +
        tokenPanel() +
        '<div class="marketing-platform-grid">' + summaryPanel() + '<article class="marketing-platform-card"><div class="marketing-platform-head"><div class="marketing-platform-brand"><span class="marketing-platform-mark">TT</span><div><strong>TikTok Ads</strong><small>' + esc(tx('Next platform', 'المنصة التالية')) + '</small></div></div><span class="marketing-status is-disconnected">' + esc(tx('Planned', 'قادم')) + '</span></div></article>' +
        '<article class="marketing-platform-card"><div class="marketing-platform-head"><div class="marketing-platform-brand"><span class="marketing-platform-mark meta">FB</span><div><strong>Meta Ads</strong><small>' + esc(tx('Next platform', 'المنصة التالية')) + '</small></div></div><span class="marketing-status is-disconnected">' + esc(tx('Planned', 'قادم')) + '</span></div></article></div>' +
        sourceAccountsPanel() +
      '</div>';
      bind();
    }

    function setBusy(next) {
      loading = !!next;
      render();
    }

    function loadStatus() {
      if (!window.api || typeof window.api.getSaudiIPickMarketingStatus !== 'function') return Promise.resolve();
      setBusy(true);
      return window.api.getSaudiIPickMarketingStatus(selectedAccountId, 'snapchat', { mode: 'force' }).then(function (result) {
        if (!result || !result.ok) throw new Error(result && result.error || 'Saudi iPick status failed.');
        availableAccounts = (result.availableAccounts || result.linkedAccounts || []).map(normalizeSource).filter(Boolean);
        selectedSources = (result.selectedSourceAccounts || result.mappedAccounts || []).map(normalizeSource).filter(Boolean);
        setStore(result);
        error = '';
      }).catch(function (err) {
        error = err && err.message ? err.message : String(err || '');
      }).finally(function () {
        loading = false;
        render();
      });
    }

    function bind() {
      var openButton = mount.querySelector('[data-sip-open-settings]');
      var saveTokenButton = mount.querySelector('[data-sip-save-token]');
      var clearTokenButton = mount.querySelector('[data-sip-clear-token]');
      var refreshButton = mount.querySelector('[data-sip-refresh]');
      var saveMappingButton = mount.querySelector('[data-sip-save-mapping]');
      var syncButton = mount.querySelector('[data-sip-sync]');

      if (openButton) openButton.addEventListener('click', function () {
        if (window.api && typeof window.api.openExternalUrl === 'function') window.api.openExternalUrl(tokenState.connectUrl);
      });
      if (saveTokenButton) saveTokenButton.addEventListener('click', function () {
        var input = mount.querySelector('[data-sip-token-input]');
        var token = input ? String(input.value || '').trim() : '';
        if (!token) { error = tx('Paste the desktop token first.', 'الصق رمز سطح المكتب أولاً.'); render(); return; }
        setBusy(true);
        window.api.saveSaudiIPickMarketingToken(token).then(function (result) {
          if (!result || !result.ok) throw new Error(result && result.error || 'Could not save token.');
          tokenState.configured = true;
          tokenState.tokenPreview = result.tokenPreview || '';
          message = tx('Token saved. Loading Snapchat accounts...', 'تم حفظ الرمز. جارٍ تحميل حسابات سناب شات...');
          return loadStatus();
        }).catch(function (err) {
          error = err && err.message ? err.message : String(err || '');
          loading = false;
          render();
        });
      });
      if (clearTokenButton) clearTokenButton.addEventListener('click', function () {
        setBusy(true);
        window.api.clearSaudiIPickMarketingToken().then(function () {
          tokenState.configured = false;
          tokenState.tokenPreview = '';
          availableAccounts = [];
          selectedSources = [];
          message = tx('Token cleared.', 'تم مسح الرمز.');
        }).finally(function () {
          loading = false;
          render();
        });
      });
      if (refreshButton) refreshButton.addEventListener('click', loadStatus);
      if (saveMappingButton) saveMappingButton.addEventListener('click', function () {
        var sources = selectedSourceObjects();
        setBusy(true);
        window.api.saveSaudiIPickMarketingMapping(selectedAccountId, 'snapchat', sources).then(function (result) {
          if (!result || !result.ok) throw new Error(result && result.error || 'Could not save mapping.');
          selectedSources = sources;
          setStore(result);
          message = tx('Mapping saved. You can sync now.', 'تم حفظ التعيين. يمكنك المزامنة الآن.');
        }).catch(function (err) {
          error = err && err.message ? err.message : String(err || '');
        }).finally(function () {
          loading = false;
          render();
        });
      });
      if (syncButton) syncButton.addEventListener('click', function () {
        var period = getPeriod(fullData);
        var roi = window.DashboardRoiState ? window.DashboardRoiState.get(selectedAccountId, {}) : {};
        var sources = selectedSourceObjects();
        if (!sources.length) sources = selectedSources;
        setBusy(true);
        window.api.syncSaudiIPickMarketingData(selectedAccountId, 'snapchat', {
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
          targetCurrency: roi.currency || window.dashboardActiveCurrency || 'SAR',
          sourceAccounts: sources
        }).then(function (result) {
          if (!result || !result.ok) throw new Error(result && result.error || 'Sync failed.');
          selectedSources = (result.selectedSourceAccounts || sources).map(normalizeSource).filter(Boolean);
          setStore(result);
          message = tx('Snapchat spend synced into the calculators.', 'تمت مزامنة إنفاق سناب شات داخل الحاسبات.');
          if (window.DashboardRoiState && typeof window.DashboardRoiState.notify === 'function') window.DashboardRoiState.notify(selectedAccountId);
        }).catch(function (err) {
          error = err && err.message ? err.message : String(err || '');
        }).finally(function () {
          loading = false;
          render();
        });
      });
    }

    function init() {
      render();
      if (!window.api || typeof window.api.getSaudiIPickMarketingTokenStatus !== 'function') return;
      window.api.getSaudiIPickMarketingTokenStatus().then(function (result) {
        tokenState = result || tokenState;
        render();
        if (tokenState.configured) loadStatus();
      }).catch(function (err) {
        error = err && err.message ? err.message : String(err || '');
        render();
      });
    }

    init();
    return function () {};
  };
})();
