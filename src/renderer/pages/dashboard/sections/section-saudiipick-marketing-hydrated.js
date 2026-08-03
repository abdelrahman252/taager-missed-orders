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

  function fmtCurrency(value, currency) {
    var code = String(currency || 'SAR').toUpperCase();
    return fmtNumber(value, 2) + ' ' + code;
  }

  function fmtSpendSummary(summary) {
    if (!summary) return '--';
    var breakdown = summary.rawSpendByCurrency && typeof summary.rawSpendByCurrency === 'object'
      ? summary.rawSpendByCurrency
      : null;
    var parts = breakdown
      ? Object.keys(breakdown).filter(function (code) { return Number(breakdown[code] || 0) > 0; })
      : [];
    if (parts.length > 1) {
      return parts.map(function (code) { return fmtCurrency(breakdown[code], code); }).join(' + ');
    }
    var summaryCurrency = String(summary.currency || '').toUpperCase();
    return fmtCurrency(summary.adSpend, summaryCurrency && summaryCurrency !== 'MIXED' ? summaryCurrency : (parts[0] || 'SAR'));
  }

  function commonSourceCurrency(sources) {
    var seen = {};
    (Array.isArray(sources) ? sources : []).forEach(function (source) {
      var code = String(source && (source.rawCurrency || source.nativeRawCurrency || source.sourceCurrency || source.accountCurrency || source.account_currency || source.currency) || '').toUpperCase();
      if (code) seen[code] = true;
    });
    var codes = Object.keys(seen);
    return codes.length === 1 ? codes[0] : '';
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
      currency: String(source.rawCurrency || source.nativeRawCurrency || source.sourceCurrency || source.accountCurrency || source.account_currency || source.currency || 'SAR').toUpperCase(),
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
    var platformCursor = 'snapchat';
    var platformOrder = ['snapchat', 'tiktok'];
    var platformState = {};
    var platformMeta = {
      snapchat: { id: 'snapchat', label: 'Snapchat Ads', shortLabel: 'Snapchat', mark: 'SC', markClass: 'snap' },
      tiktok: { id: 'tiktok', label: 'TikTok Ads', shortLabel: 'TikTok', mark: 'TT', markClass: '' }
    };
    var status = store && typeof store.get === 'function' ? store.get(selectedAccountId, platformCursor) : null;
    var availableAccounts = [];
    var selectedSources = [];
    var sourceQuery = '';
    var sourcePage = 1;
    var sourcePageSize = 5;
    var message = '';
    var error = '';
    var loading = false;
    var diagnostics = {
      step: 'idle',
      tokenConfigured: false,
      accountId: selectedAccountId,
      availableCount: 0,
      selectedCount: 0,
      mappedCount: 0,
      summary: '',
      lastError: '',
      updatedAt: ''
    };

    function nowIso() {
      try { return new Date().toISOString(); } catch (_) { return ''; }
    }

    function updateDiagnostics(patch) {
      diagnostics = Object.assign({}, diagnostics, patch || {}, { updatedAt: nowIso() });
      if (window.TaagerDebugLog) {
        window.TaagerDebugLog('saudiipick-marketing', diagnostics.step || 'diagnostic', diagnostics);
      } else if (window.console && console.log) {
        console.log('[Saudi iPick Marketing]', diagnostics);
      }
    }

    function countOf(value) {
      return Array.isArray(value) ? value.length : 0;
    }

    function currentPlatform() {
      return platformMeta[platformCursor] || platformMeta.snapchat;
    }

    function saveActivePlatformState() {
      platformState[platformCursor] = {
        status: status,
        availableAccounts: availableAccounts.slice(),
        selectedSources: selectedSources.slice(),
        sourceQuery: sourceQuery,
        sourcePage: sourcePage,
        message: message,
        error: error,
        loading: loading,
        diagnostics: Object.assign({}, diagnostics)
      };
    }

    function restorePlatformState(platform, resetDraft) {
      platformCursor = platformMeta[platform] ? platform : 'snapchat';
      var cached = platformState[platformCursor];
      if (!cached || resetDraft) {
        status = store && typeof store.get === 'function' ? store.get(selectedAccountId, platformCursor) : null;
        cached = {
          status: status,
          availableAccounts: (status && (status.availableAccounts || status.linkedAccounts) || []).map(normalizeSource).filter(Boolean),
          selectedSources: (status && (status.selectedSourceAccounts || status.mappedAccounts) || []).map(normalizeSource).filter(Boolean),
          sourceQuery: '',
          sourcePage: 1,
          message: '',
          error: '',
          loading: false,
          diagnostics: Object.assign({}, diagnostics, { platform: platformCursor })
        };
      }
      status = cached.status;
      availableAccounts = (cached.availableAccounts || []).slice();
      selectedSources = (cached.selectedSources || []).slice();
      sourceQuery = cached.sourceQuery || '';
      sourcePage = cached.sourcePage || 1;
      message = cached.message || '';
      error = cached.error || '';
      loading = !!cached.loading;
      diagnostics = Object.assign({}, diagnostics, cached.diagnostics || {}, { platform: platformCursor });
      platformState[platformCursor] = cached;
    }

    function switchPlatform(platform, resetDraft) {
      saveActivePlatformState();
      restorePlatformState(platform, resetDraft);
    }

    function setStore(next) {
      var payload = Object.assign({ provider: 'saudiipick', platform: platformCursor }, next || {});
      if (store && typeof store.set === 'function') store.set(payload, selectedAccountId, platformCursor);
      status = payload;
      saveActivePlatformState();
    }

    function resetPlatformStateFromCache() {
      restorePlatformState(platformCursor, true);
      saveActivePlatformState();
    }

    function platformFromElement(element) {
      var card = element && element.closest ? element.closest('[data-marketing-platform]') : null;
      var platform = card ? card.getAttribute('data-marketing-platform') : '';
      return platformMeta[platform] ? platform : platformCursor;
    }

    function selectedIds() {
      var card = mount.querySelector('[data-marketing-platform="' + platformCursor + '"]');
      return Array.prototype.slice.call((card || mount).querySelectorAll('[data-sip-source]:checked')).map(function (input) {
        return input.value;
      });
    }

    function selectedSourceObjects() {
      if (selectedSources.length) return selectedSources;
      var ids = selectedIds();
      return availableAccounts.filter(function (source) { return ids.indexOf(source.id) !== -1; });
    }

    function sourceChecked(source) {
      return selectedSources.some(function (item) { return String(item && item.id || '') === source.id; });
    }

    function ownerOfSource(sourceId) {
      var target = String(sourceId || '');
      var owner = null;
      accountOptions.some(function (account) {
        var accountStatus = store && typeof store.get === 'function' ? store.get(account.id, platformCursor) : null;
        var mapped = accountStatus && (accountStatus.selectedSourceAccounts || accountStatus.mappedAccounts) || [];
        var found = Array.isArray(mapped) && mapped.some(function (source) {
          return String(source && source.id || '') === target;
        });
        if (found) owner = account;
        return found;
      });
      return owner;
    }

    function tokenPanel() {
      return '<section class="marketing-connection-guide">' +
        '<div class="marketing-guide-head">' +
          '<div><h4>' + esc(tx('Saudi iPick desktop bridge', 'ربط Saudi iPick بسطح المكتب')) + '</h4>' +
          '<p>' + esc(tx('Create a desktop token from the website Settings page, paste it here once, then sync selected Snapchat or TikTok accounts into the calculators.', 'أنشئ رمز سطح المكتب من إعدادات الموقع، والصقه هنا مرة واحدة، ثم زامن حسابات سناب شات المحددة داخل الحاسبات.')) + '</p></div>' +
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

    function diagnosticsPanel() {
      var rows = [
        [tx('Step', 'الخطوة'), diagnostics.step || 'idle'],
        [tx('Token', 'الرمز'), tokenState.configured ? tx('Saved', 'محفوظ') + (tokenState.tokenPreview ? ' (' + tokenState.tokenPreview + ')' : '') : tx('Not saved', 'غير محفوظ')],
        [tx('Taager account', 'حساب تاجر'), allMode ? tx('All accounts selected', 'كل الحسابات محددة') : selectedAccountId],
        [tx('Available Snapchat accounts', 'حسابات سناب المتاحة'), String(diagnostics.availableCount || 0)],
        [tx('Selected for this Taager account', 'المحددة لهذا الحساب'), String(diagnostics.selectedCount || 0)],
        [tx('Mapped accounts', 'الحسابات المعينة'), String(diagnostics.mappedCount || 0)]
      ];
      if (diagnostics.summary) rows.push([tx('Result', 'النتيجة'), diagnostics.summary]);
      if (diagnostics.lastError) rows.push([tx('Last error', 'آخر خطأ'), diagnostics.lastError]);
      if (diagnostics.updatedAt) rows.push([tx('Updated', 'آخر تحديث'), diagnostics.updatedAt]);
      return '<section class="marketing-mapping-board" style="margin-top:14px;">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">' +
          '<div><h4>' + esc(tx('Connection diagnostics', 'تشخيص الاتصال')) + '</h4>' +
          '<p class="marketing-sync-note">' + esc(tx('This shows what the desktop app received from Saudi iPick after saving or refreshing the token.', 'يوضح هذا ما استلمه تطبيق سطح المكتب من Saudi iPick بعد حفظ أو تحديث الرمز.')) + '</p></div>' +
          '<button type="button" class="marketing-secondary" data-sip-refresh' + (tokenState.configured ? '' : ' disabled') + '>' + esc(tx('Refresh accounts', 'تحديث الحسابات')) + '</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">' +
          rows.map(function (row) {
            return '<div class="marketing-inline-info" style="margin:0;"><strong style="display:block;font-size:11px;color:var(--dash-muted);">' + esc(row[0]) + '</strong><span>' + esc(row[1]) + '</span></div>';
          }).join('') +
        '</div>' +
      '</section>';
    }

    function sourceAccountsPanel() {
      if (!tokenState.configured) return '';
      var query = sourceQuery.toLowerCase();
      var filtered = availableAccounts.filter(function (source) {
        var haystack = [source.name, source.id, source.organizationName, source.currency].join(' ').toLowerCase();
        return !query || haystack.indexOf(query) !== -1;
      });
      var pageCount = Math.max(1, Math.ceil(filtered.length / sourcePageSize));
      sourcePage = Math.min(Math.max(1, sourcePage), pageCount);
      var pageRows = filtered.slice((sourcePage - 1) * sourcePageSize, sourcePage * sourcePageSize);
      var selectVisibleButton = pageCount > 1
        ? '<button type="button" class="marketing-secondary" data-sip-select-page' + (pageRows.length ? '' : ' disabled') + '>' + esc(tx('Select visible accounts', 'Select visible accounts')) + '</button>'
        : '';
      var mappingGridColumns = pageCount > 1 ? 'minmax(220px,1fr) auto' : 'minmax(220px,1fr)';
      var paginationMarkup = pageCount > 1
        ? '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;">' +
            '<span class="marketing-sync-note">' + esc(tx('Page ', 'Page ') + sourcePage + ' / ' + pageCount) + '</span>' +
            '<div style="display:flex;gap:8px;">' +
              '<button type="button" class="marketing-secondary marketing-page-button" data-sip-page-prev' + (sourcePage <= 1 ? ' disabled' : '') + '>&lsaquo;</button>' +
              '<button type="button" class="marketing-secondary marketing-page-button" data-sip-page-next' + (sourcePage >= pageCount ? ' disabled' : '') + '>&rsaquo;</button>' +
            '</div>' +
          '</div>'
        : '';
      var assigned = selectedSources;
      var assignedMarkup = assigned.length ? '<div class="marketing-inline-info">' +
        esc(tx('Assigned to this Taager account: ', 'معين لهذا الحساب: ')) +
        assigned.map(function (source) { return esc(source.name || source.id); }).join(', ') +
      '</div>' : '';
      var rows = pageRows.length ? pageRows.map(function (source) {
        var owner = ownerOfSource(source.id);
        var ownedElsewhere = owner && owner.id !== selectedAccountId;
        return '<label class="marketing-mapping-choice" style="display:grid;grid-template-columns:auto 1fr;align-items:start;gap:10px;' + (ownedElsewhere ? 'opacity:.72;' : '') + '">' +
          '<input type="checkbox" data-sip-source value="' + esc(source.id) + '"' + (sourceChecked(source) ? ' checked' : '') + (ownedElsewhere ? ' disabled' : '') + '>' +
          '<span class="marketing-source-copy"><strong>' + esc(source.name) + '</strong><small>' +
            esc((source.organizationName ? source.organizationName + ' · ' : '') + source.currency + (source.canManageCampaigns ? ' · manage campaigns' : '')) +
            '</small><small>' + esc(source.id) + '</small>' +
            (ownedElsewhere ? '<em>' + esc(tx('Assigned to ', 'معين إلى ') + owner.label) + '</em>' : '') +
          '</span>' +
        '</label>';
      }).join('') : '<div class="marketing-inline-warning">' + esc(availableAccounts.length
        ? tx('No accounts match this search.', 'لا توجد حسابات مطابقة للبحث.')
        : tx('No selected Snapchat accounts came back from Saudi iPick yet. Connect Snapchat on the website and select the ad accounts first.', 'لم تصل أي حسابات سناب شات محددة من Saudi iPick بعد. اربط سناب شات في الموقع وحدد الحسابات الإعلانية أولاً.')) + '</div>';

      return '<section class="marketing-mapping-board">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;"><div><h4>' + esc(tx('Map Snapchat ad accounts', 'تعيين حسابات سناب شات')) + '</h4>' +
        '<p class="marketing-sync-note">' + esc(tx('Choose which Saudi iPick ad accounts feed this Taager account. Accounts assigned elsewhere are locked.', 'اختر حسابات Saudi iPick التي تغذي حساب تاجر هذا. الحسابات المعينة في مكان آخر تكون مقفلة.')) + '</p></div>' +
        '<span class="marketing-status is-connected">' + esc(filtered.length + ' / ' + availableAccounts.length) + '</span></div>' +
        '<div class="marketing-token-row" style="display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;margin:14px 0;">' +
          '<input type="search" data-sip-source-search value="' + esc(sourceQuery) + '" placeholder="' + esc(tx('Search ad accounts', 'ابحث في الحسابات الإعلانية')) + '" style="min-width:0;border:1px solid var(--dash-border);border-radius:8px;background:var(--dash-surface);color:var(--dash-text);padding:10px 12px;">' +
          '<button type="button" class="marketing-secondary" data-sip-select-page' + (pageRows.length ? '' : ' disabled') + '>' + esc(tx('Select page', 'تحديد الصفحة')) + '</button>' +
          '<button type="button" class="marketing-secondary" data-sip-clear-selection>' + esc(tx('Clear', 'مسح')) + '</button>' +
        '</div>' +
        assignedMarkup +
        '<div class="marketing-account-map">' + rows + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;">' +
          '<span class="marketing-sync-note">' + esc(tx('Page ', 'صفحة ') + sourcePage + ' / ' + pageCount) + '</span>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="marketing-secondary" data-sip-page-prev' + (sourcePage <= 1 ? ' disabled' : '') + '>‹</button>' +
            '<button type="button" class="marketing-secondary" data-sip-page-next' + (sourcePage >= pageCount ? ' disabled' : '') + '>›</button>' +
          '</div>' +
        '</div>' +
        '<div class="marketing-actions">' +
          '<button type="button" class="marketing-primary" data-sip-save-mapping' + (availableAccounts.length && selectedAccountId && !allMode ? '' : ' disabled') + '>' + esc(tx('Assign to this account', 'تعيين لهذا الحساب')) + '</button>' +
          '<button type="button" class="marketing-sync-btn" data-sip-sync' + ((selectedSources.length || (status && status.mappedAccounts && status.mappedAccounts.length)) && !allMode ? '' : ' disabled') + '>' + esc(tx('Sync Snapchat spend', 'مزامنة إنفاق سناب شات')) + '</button>' +
          '<button type="button" class="marketing-secondary" data-sip-refresh>' + esc(tx('Refresh accounts', 'تحديث الحسابات')) + '</button>' +
        '</div>' +
        ((!selectedAccountId || allMode) ? '<p class="marketing-sync-note">' + esc(tx('Select a single Taager account from the top bar to assign and sync accounts.', 'اختر حساب تاجر واحد من الشريط العلوي للتعيين والمزامنة.')) + '</p>' : '') +
      '</section>';
    }

    function summaryPanel() {
      var summary = status && status.summary;
      var partial = status && status.partial;
      var sourceCount = summary && Array.isArray(summary.sourceBreakdown) ? summary.sourceBreakdown.length : 0;
      var campaignCount = summary && Array.isArray(summary.campaignBreakdown) ? summary.campaignBreakdown.length : 0;
      return '<article class="marketing-platform-card" data-marketing-platform="snapchat">' +
        '<div class="marketing-platform-head">' +
          '<div class="marketing-platform-brand"><span class="marketing-platform-mark snap">SC</span><div><strong>Snapchat Ads</strong><small>Saudi iPick API</small></div></div>' +
          '<span class="marketing-status ' + (summary ? (partial ? 'is-warning' : 'is-connected') : 'is-disconnected') + '">' + esc(summary ? (partial ? tx('Partial sync', 'مزامنة جزئية') : tx('Synced', 'متزامن')) : tx('Ready for sync', 'جاهز للمزامنة')) + '</span>' +
        '</div>' +
        '<div class="marketing-metric-grid">' +
          '<div class="marketing-spend-metric"><span>' + esc(tx('Ad spend', 'الإنفاق الإعلاني')) + '</span><strong>' + esc(fmtSpendSummary(summary)) + '</strong></div>' +
          '<div><span>' + esc(tx('Ad accounts', 'الحسابات الإعلانية')) + '</span><strong>' + esc(summary ? fmtNumber(sourceCount, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('Campaign rows', 'صفوف الحملات')) + '</span><strong>' + esc(summary ? fmtNumber(campaignCount || summary.campaignCount, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('Purchases', 'المشتريات')) + '</span><strong>' + esc(summary ? fmtNumber(summary.purchases, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('ROAS', 'العائد على الإنفاق')) + '</span><strong>' + esc(summary ? fmtNumber(summary.purchaseValue && summary.adSpend ? summary.purchaseValue / summary.adSpend : summary.roas, 2) + 'x' : '--') + '</strong></div>' +
        '</div>' +
        (partial ? '<div class="marketing-inline-warning" style="margin-top:12px;">' + esc(tx('Snapchat returned partial campaign stats. Account-level spend is still synced when available.', 'رجع سناب شات إحصائيات حملات جزئية. يتم مزامنة إنفاق الحساب عند توفره.')) + '</div>' : '') +
      '</article>';
    }

    function summaryPanel() {
      var platform = currentPlatform();
      var summary = status && status.summary;
      var partial = status && status.partial;
      var campaignCount = summary && Array.isArray(summary.campaignBreakdown) ? summary.campaignBreakdown.length : 0;
      var statusSources = status && (status.selectedSourceAccounts || status.mappedAccounts) || [];
      var mappedCount = selectedSources.length || statusSources.length;
      var roas = summary ? Number(summary.roas != null ? summary.roas : (Number(summary.adSpend || 0) ? Number(summary.purchaseValue || 0) / Number(summary.adSpend || 0) : 0)) : 0;
      var displayCurrency = commonSourceCurrency(selectedSources) || commonSourceCurrency(statusSources) || commonSourceCurrency(availableAccounts);
      var displaySummary = summary && displayCurrency ? Object.assign({}, summary, { currency: displayCurrency }) : summary;
      var connected = tokenState.configured && (availableAccounts.length > 0 || selectedSources.length > 0 || statusSources.length > 0 || !!summary);
      var selectedCount = selectedSources.length;
      var activeAccount = accountOptions.filter(function (account) { return account.id === selectedAccountId; })[0] || { id: selectedAccountId, label: selectedAccountId };
      var query = sourceQuery.toLowerCase();
      var filtered = availableAccounts.filter(function (source) {
        var haystack = [source.name, source.id, source.organizationName, source.currency].join(' ').toLowerCase();
        return !query || haystack.indexOf(query) !== -1;
      });
      var pageCount = Math.max(1, Math.ceil(filtered.length / sourcePageSize));
      sourcePage = Math.min(Math.max(1, sourcePage), pageCount);
      var pageRows = filtered.slice((sourcePage - 1) * sourcePageSize, sourcePage * sourcePageSize);
      var selectVisibleButton = pageCount > 1
        ? '<button type="button" class="marketing-secondary" data-sip-select-page' + (pageRows.length ? '' : ' disabled') + '>' + esc(tx('Select visible accounts', 'Select visible accounts')) + '</button>'
        : '';
      var mappingGridColumns = pageCount > 1 ? 'minmax(220px,1fr) auto' : 'minmax(220px,1fr)';
      var paginationMarkup = pageCount > 1
        ? '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;">' +
            '<span class="marketing-sync-note">' + esc(tx('Page ', 'Page ') + sourcePage + ' / ' + pageCount) + '</span>' +
            '<div style="display:flex;gap:8px;">' +
              '<button type="button" class="marketing-secondary marketing-page-button" data-sip-page-prev' + (sourcePage <= 1 ? ' disabled' : '') + '>&lsaquo;</button>' +
              '<button type="button" class="marketing-secondary marketing-page-button" data-sip-page-next' + (sourcePage >= pageCount ? ' disabled' : '') + '>&rsaquo;</button>' +
            '</div>' +
          '</div>'
        : '';
      var choices = pageRows.length ? pageRows.map(function (source) {
        var owner = ownerOfSource(source.id);
        var ownedElsewhere = owner && owner.id !== selectedAccountId;
        return '<label class="marketing-mapping-choice">' +
          '<input type="checkbox" data-sip-source value="' + esc(source.id) + '"' + (sourceChecked(source) ? ' checked' : '') + (ownedElsewhere ? ' disabled data-locked="1"' : '') + '>' +
          '<span class="marketing-source-copy"><strong>' + esc(source.name) + '</strong><small>' + esc(source.id) + '</small>' +
            (source.organizationName ? '<small>' + esc(source.organizationName) + '</small>' : '') +
            (ownedElsewhere ? '<em>' + esc(tx('Assigned to ', 'Assigned to ') + owner.label) + '</em>' : '') +
          '</span>' +
          '<select class="marketing-source-currency" disabled><option>' + esc(source.currency || 'SAR') + '</option></select>' +
        '</label>';
      }).join('') : '<div class="marketing-inline-warning">' + esc(availableAccounts.length ? tx('No accounts match this search.', 'No accounts match this search.') : tx('No ' + platform.shortLabel + ' ad accounts were returned from Saudi iPick yet.', 'No ' + platform.shortLabel + ' ad accounts were returned from Saudi iPick yet.')) + '</div>';
      var mappingBody = '<div class="marketing-token-row" style="display:grid;grid-template-columns:' + mappingGridColumns + ';gap:10px;margin:0 0 12px;">' +
          '<input type="search" data-sip-source-search value="' + esc(sourceQuery) + '" placeholder="' + esc(tx('Search ad accounts', 'Search ad accounts')) + '" style="min-width:0;border:1px solid var(--dash-border);border-radius:8px;background:var(--dash-surface);color:var(--dash-text);padding:10px 12px;">' +
          selectVisibleButton +
        '</div>' +
        '<details class="marketing-mapping-row" open data-sip-map-row="' + esc(activeAccount.id) + '">' +
          '<summary><span class="marketing-account-label">' + esc(activeAccount.label) + '</span><span class="marketing-assigned-pill">' + esc(selectedCount + ' assigned') + '</span></summary>' +
          '<div class="marketing-mapping-choices">' + choices + '</div>' +
          '<div class="marketing-limit-note"><strong>' + esc(tx('Assigned ', 'Assigned ') + selectedCount + ' / ' + availableAccounts.length + ' ' + platform.shortLabel + ' accounts') + '</strong><span>' + esc(tx('You can assign multiple ' + platform.shortLabel + ' accounts to this Taager account.', 'You can assign multiple ' + platform.shortLabel + ' accounts to this Taager account.')) + '</span></div>' +
          '<button class="marketing-secondary marketing-save-map-btn" type="button" data-sip-save-mapping' + (availableAccounts.length && selectedAccountId && !allMode ? '' : ' disabled') + '>' + esc(tx('Assign to this account', 'Assign to this account')) + '</button>' +
        '</details>' +
        paginationMarkup;
      var mappingContent = '<details class="marketing-mapping-board marketing-mapping-disclosure" open data-sip-mapping-disclosure>' +
        '<summary><span><strong>' + esc(tx('Map ' + platform.shortLabel + ' accounts to Taager accounts', 'Map ' + platform.shortLabel + ' accounts to Taager accounts')) + '</strong>' +
        '<small>' + esc(tx('One Taager account can use multiple ' + platform.shortLabel + ' ad accounts. Select all that belong to each account.', 'One Taager account can use multiple ' + platform.shortLabel + ' ad accounts. Select all that belong to each account.')) + '</small></span><i aria-hidden="true">&#9662;</i></summary>' +
        '<div class="marketing-mapping-disclosure-body">' + mappingBody + '</div></details>';
      var releaseOptions = selectedSources.length
        ? selectedSources.map(function (source) {
          return '<option value="' + esc(source.id) + '">' + esc((source.name || source.id) + ' (' + source.id + ')') + '</option>';
        }).join('')
        : '';
      var releaseMarkup = releaseOptions
        ? '<label><span>' + esc(tx('Assigned ad account', 'Assigned ad account')) + '</span><select data-sip-release-select>' + releaseOptions + '</select></label>' +
          '<button class="marketing-secondary is-danger marketing-claim-action" type="button" data-sip-release-selected>' + esc(tx('Disconnect & free slot', 'Disconnect & free slot')) + '</button>'
        : '<div class="marketing-inline-info">' + esc(tx('No assigned ad accounts to release.', 'No assigned ad accounts to release.')) + '</div>';
      var claimRelease = '<details class="marketing-mapping-board marketing-claim-source marketing-claim-disclosure">' +
        '<summary><span><strong>' + esc(tx('Claim or release ' + platform.shortLabel + ' ad account', 'Claim or release ' + platform.shortLabel + ' ad account')) + '</strong>' +
        '<small>' + esc(tx('Use an existing website account pool or free a connection slot.', 'Use an existing website account pool or free a connection slot.')) + '</small></span><i aria-hidden="true">&#9662;</i></summary>' +
        '<div class="marketing-claim-disclosure-body">' +
          '<div class="marketing-claim-tabs">' +
            '<input type="radio" id="marketing-claim-tab-sip-' + esc(platform.id) + '" name="sip-claim-tabs-' + esc(platform.id) + '" checked>' +
            '<label for="marketing-claim-tab-sip-' + esc(platform.id) + '">' + esc(tx('Claim', 'Claim')) + '</label>' +
            '<input type="radio" id="marketing-release-tab-sip-' + esc(platform.id) + '" name="sip-claim-tabs-' + esc(platform.id) + '">' +
            '<label for="marketing-release-tab-sip-' + esc(platform.id) + '">' + esc(tx('Release', 'Release')) + '</label>' +
            '<div class="marketing-claim-panel is-claim">' +
              '<p>' + esc(tx('Paste an existing ' + platform.shortLabel + ' ad account ID to connect it to this Taager account.', 'Paste an existing ' + platform.shortLabel + ' ad account ID to connect it to this Taager account.')) + '</p>' +
              '<div class="marketing-account-map">' +
                '<label><span>' + esc(tx('Ad account ID', 'Ad account ID')) + '</span><input type="text" data-sip-claim-input placeholder="' + esc(tx('Paste ad account ID', 'Paste ad account ID')) + '"></label>' +
                '<button class="marketing-secondary marketing-claim-action" type="button" data-sip-claim-account>' + esc(tx('Use existing account', 'Use existing account')) + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="marketing-claim-panel is-release">' +
              '<p>' + esc(tx('Release removes the assignment from this Taager account and frees one connection slot.', 'Release removes the assignment from this Taager account and frees one connection slot.')) + '</p>' +
              '<div class="marketing-account-map">' + releaseMarkup + '</div>' +
            '</div>' +
          '</div>' +
        '</div></details>';
      var diagnosticsMarkup = '<details class="marketing-diagnostics"><summary>' + esc(tx('Connection diagnostics', 'Connection diagnostics')) + '</summary>' +
        '<div class="marketing-diagnostic-stats">' +
          '<span>' + esc(tx('Step', 'Step')) + '</span><strong>' + esc(diagnostics.step || 'idle') + '</strong>' +
          '<span>' + esc(tx('Available accounts', 'Available accounts')) + '</span><strong>' + esc(String(diagnostics.availableCount || availableAccounts.length || 0)) + '</strong>' +
          '<span>' + esc(tx('Selected accounts', 'Selected accounts')) + '</span><strong>' + esc(String(selectedCount)) + '</strong>' +
          '<span>' + esc(tx('Mapped accounts', 'Mapped accounts')) + '</span><strong>' + esc(String(diagnostics.mappedCount || 0)) + '</strong>' +
        '</div>' +
        (diagnostics.summary ? '<p class="marketing-diagnostic-shape">' + esc(diagnostics.summary) + '</p>' : '') +
        (diagnostics.lastError ? '<p class="marketing-diagnostic-error">' + esc(diagnostics.lastError) + '</p>' : '') +
      '</details>';
      var lastSync = status && status.lastSyncAt ? String(status.lastSyncAt).replace('T', ' ').slice(0, 19) : tx('Not synced yet', 'Not synced yet');
      var canSync = selectedAccountId && !allMode && !loading && (selectedSources.length > 0 || statusSources.length > 0);

      return '<article class="marketing-platform-card" data-marketing-platform="' + esc(platform.id) + '">' +
        (error ? '<div class="marketing-message is-error">' + esc(error) + '</div>' : '') +
        (loading ? '<div class="marketing-loading"><span class="dash-preloader-spinner"></span><span>' + esc(tx('Working...', 'Working...')) + '</span></div>' : '') +
        '<div class="marketing-platform-head">' +
          '<div class="marketing-platform-brand"><span class="marketing-platform-mark ' + esc(platform.markClass) + '">' + esc(platform.mark) + '</span><div><strong>' + esc(platform.label) + '</strong><small>' + esc(tx('Available now', 'Available now')) + '</small></div></div>' +
          '<span class="marketing-status ' + (connected ? (partial ? 'is-warning' : 'is-connected') : 'is-disconnected') + '">' + esc(connected ? (partial ? tx('Partial sync', 'Partial sync') : tx('Connected', 'Connected')) : tx('Not connected', 'Not connected')) + '</span>' +
        '</div>' +
        '<div class="marketing-metric-grid">' +
          '<div class="marketing-spend-metric"><span>' + esc(tx('Ad spend', 'Ad spend')) + (displayCurrency ? ' (' + esc(displayCurrency) + ')' : '') + '</span><strong>' + esc(fmtSpendSummary(displaySummary)) + '</strong></div>' +
          '<div><span>' + esc(tx('Mapped accounts', 'Mapped accounts')) + '</span><strong>' + esc(mappedCount ? fmtNumber(mappedCount, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('Campaign rows', 'Campaign rows')) + '</span><strong>' + esc(summary ? fmtNumber(campaignCount || summary.campaignCount, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('Purchases', 'Purchases')) + '</span><strong>' + esc(summary ? fmtNumber(summary.purchases, 0) : '--') + '</strong></div>' +
          '<div><span>' + esc(tx('ROAS', 'ROAS')) + '</span><strong>' + esc(summary ? fmtNumber(roas, 2) + 'x' : '--') + '</strong></div>' +
        '</div>' +
        mappingContent +
        claimRelease +
        diagnosticsMarkup +
        '<div class="marketing-last-sync"><span>' + esc(tx('Last sync', 'Last sync')) + '</span><strong>' + esc(lastSync) + '</strong></div>' +
        '<div class="marketing-actions">' +
          '<button type="button" class="marketing-primary" data-sip-open-settings>' + esc(tx('Add account', 'Add account')) + '</button>' +
          '<button type="button" class="marketing-sync-btn" data-sip-sync' + (canSync ? '' : ' disabled') + '>' + esc(tx('Sync mapped ' + platform.shortLabel + ' accounts', 'Sync mapped ' + platform.shortLabel + ' accounts')) + '</button>' +
          '<button type="button" class="marketing-secondary" data-sip-full-sync' + (canSync ? '' : ' disabled') + '>' + esc(tx('Refresh all selected dates', 'Refresh all selected dates')) + '</button>' +
          '<button type="button" class="marketing-secondary" data-sip-refresh' + (tokenState.configured ? '' : ' disabled') + '>' + esc(tx('Refresh accounts', 'Refresh accounts')) + '</button>' +
        '</div>' +
        '<p class="marketing-sync-note">' + esc(tx('After renaming ' + platform.shortLabel + ' campaigns or adding SKUs, synced reports may remain cached for up to 6 hours. For historical changes, refresh the campaign data, then sync again.', 'After renaming ' + platform.shortLabel + ' campaigns or adding SKUs, synced reports may remain cached for up to 6 hours. For historical changes, refresh the campaign data, then sync again.')) + '</p>' +
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
      '</div>';
      bind();
    }

    function renderPlatformCard(platform) {
      var previous = platformCursor;
      switchPlatform(platform, false);
      var html = summaryPanel();
      saveActivePlatformState();
      restorePlatformState(previous, false);
      return html;
    }

    function render() {
      saveActivePlatformState();
      var activeSnapshot = platformCursor;
      var cardMarkup = platformOrder.map(renderPlatformCard).join('');
      restorePlatformState(activeSnapshot, false);
      mount.innerHTML = '<div class="marketing-section">' +
        '<header class="marketing-hero">' +
          '<div><p class="marketing-kicker">Saudi iPick API</p><h2>' + esc(tx('Native marketing connection', 'Native marketing connection')) + '</h2>' +
          '<p>' + esc(tx('Use Saudi iPick as the source for Snapchat and TikTok spend, campaigns, purchases, CPA, and ROAS inside this desktop dashboard.', 'Use Saudi iPick as the source for Snapchat and TikTok spend, campaigns, purchases, CPA, and ROAS inside this desktop dashboard.')) + '</p></div>' +
          '<aside class="marketing-security"><strong>' + esc(tx('Same calculators', 'Same calculators')) + '</strong><span>' + esc(tx('Each card syncs its own platform into the product, account, and level calculators after you press sync.', 'Each card syncs its own platform into the product, account, and level calculators after you press sync.')) + '</span></aside>' +
        '</header>' +
        tokenPanel() +
        '<div class="marketing-platform-grid">' + cardMarkup + '</div>' +
      '</div>';
      bind();
    }

    function setBusy(next) {
      loading = !!next;
      render();
    }

    function loadStatus() {
      var platform = currentPlatform();
      var requestPlatform = platform.id;
      if (!window.api || typeof window.api.getSaudiIPickMarketingStatus !== 'function') {
        error = tx('Saudi iPick desktop bridge is not available in this app build.', 'Saudi iPick desktop bridge is not available in this app build.');
        updateDiagnostics({ step: 'bridge-missing', tokenConfigured: tokenState.configured, lastError: error });
        render();
        return Promise.resolve();
      }
      updateDiagnostics({
        step: 'status-request',
        tokenConfigured: tokenState.configured,
        accountId: selectedAccountId,
        summary: tx('Requesting selected ' + platform.shortLabel + ' accounts from Saudi iPick...', 'Requesting selected ' + platform.shortLabel + ' accounts from Saudi iPick...'),
        lastError: ''
      });
      setBusy(true);
      return window.api.getSaudiIPickMarketingStatus(selectedAccountId, requestPlatform, { mode: 'force' }).then(function (result) {
        switchPlatform(requestPlatform, false);
        if (!result || !result.ok) throw new Error(result && result.error || 'Saudi iPick status failed.');
        availableAccounts = (result.availableAccounts || result.linkedAccounts || []).map(normalizeSource).filter(Boolean);
        selectedSources = (result.selectedSourceAccounts || result.mappedAccounts || []).map(normalizeSource).filter(Boolean);
        setStore(result);
        updateDiagnostics({
          step: 'status-ok',
          tokenConfigured: tokenState.configured,
          availableCount: availableAccounts.length,
          selectedCount: selectedSources.length,
          mappedCount: countOf(result.mappedAccounts),
          summary: availableAccounts.length
            ? tx('Accounts loaded. Select the ad accounts for this Taager account, then sync.', 'Accounts loaded. Select the ad accounts for this Taager account, then sync.')
            : tx('No selected ' + platform.shortLabel + ' accounts were returned. Check the website Accounts page and make sure ad accounts are selected.', 'No selected ' + platform.shortLabel + ' accounts were returned. Check the website Accounts page and make sure ad accounts are selected.'),
          lastError: result.error || ''
        });
        message = availableAccounts.length
          ? tx('Loaded ', 'Loaded ') + availableAccounts.length + ' ' + platform.shortLabel + ' account(s).'
          : tx('No selected ' + platform.shortLabel + ' accounts came back from Saudi iPick. Check website account selection, then refresh.', 'No selected ' + platform.shortLabel + ' accounts came back from Saudi iPick. Check website account selection, then refresh.');
        error = '';
      }).catch(function (err) {
        switchPlatform(requestPlatform, false);
        error = err && err.message ? err.message : String(err || '');
        updateDiagnostics({
          step: 'status-error',
          tokenConfigured: tokenState.configured,
          lastError: error,
          summary: tx('Could not load ' + platform.shortLabel + ' accounts from Saudi iPick.', 'Could not load ' + platform.shortLabel + ' accounts from Saudi iPick.')
        });
      }).finally(function () {
        switchPlatform(requestPlatform, false);
        loading = false;
        saveActivePlatformState();
        render();
      });
    }

    function bind() {
      var openButtons = mount.querySelectorAll('[data-sip-open-settings]');
      var saveTokenButton = mount.querySelector('[data-sip-save-token]');
      var clearTokenButton = mount.querySelector('[data-sip-clear-token]');
      var refreshButtons = mount.querySelectorAll('[data-sip-refresh]');
      var saveMappingButtons = mount.querySelectorAll('[data-sip-save-mapping]');
      var syncButtons = mount.querySelectorAll('[data-sip-sync], [data-sip-full-sync]');
      var sourceSearches = mount.querySelectorAll('[data-sip-source-search]');
      var sourceChecks = mount.querySelectorAll('[data-sip-source]');
      var selectPageButtons = mount.querySelectorAll('[data-sip-select-page]');
      var clearSelectionButtons = mount.querySelectorAll('[data-sip-clear-selection]');
      var claimButtons = mount.querySelectorAll('[data-sip-claim-account]');
      var releaseButtons = mount.querySelectorAll('[data-sip-release-selected]');
      var prevPageButtons = mount.querySelectorAll('[data-sip-page-prev]');
      var nextPageButtons = mount.querySelectorAll('[data-sip-page-next]');

      function activateFrom(element) {
        switchPlatform(platformFromElement(element), false);
        return currentPlatform();
      }

      Array.prototype.forEach.call(openButtons, function (openButton) {
        openButton.addEventListener('click', function () {
          if (window.api && typeof window.api.openExternalUrl === 'function') window.api.openExternalUrl(tokenState.connectUrl);
        });
      });

      if (saveTokenButton) saveTokenButton.addEventListener('click', function () {
        var input = mount.querySelector('[data-sip-token-input]');
        var token = input ? String(input.value || '').trim() : '';
        if (!token) { error = tx('Paste the desktop token first.', 'الصق رمز سطح المكتب أولاً.'); saveActivePlatformState(); render(); return; }
        updateDiagnostics({ step: 'token-save', tokenConfigured: false, summary: tx('Saving desktop token locally...', 'جارٍ حفظ رمز سطح المكتب محلياً...'), lastError: '' });
        setBusy(true);
        window.api.saveSaudiIPickMarketingToken(token).then(function (result) {
          if (!result || !result.ok) throw new Error(result && result.error || 'Could not save token.');
          tokenState.configured = true;
          tokenState.tokenPreview = result.tokenPreview || '';
          platformOrder.forEach(function (platform) {
            switchPlatform(platform, false);
            updateDiagnostics({ step: 'token-saved', tokenConfigured: true, summary: tx('Token saved. Loading account status...', 'Token saved. Loading account status...'), lastError: '' });
            saveActivePlatformState();
          });
          message = tx('Token saved. Loading Snapchat and TikTok accounts...', 'Token saved. Loading Snapchat and TikTok accounts...');
          return loadAllStatuses();
        }).catch(function (err) {
          switchPlatform(platform, false);
            error = err && err.message ? err.message : String(err || '');
          updateDiagnostics({ step: 'token-error', tokenConfigured: false, lastError: error, summary: tx('Could not save or validate the desktop token.', 'تعذر حفظ أو التحقق من رمز سطح المكتب.') });
          loading = false;
          saveActivePlatformState();
          render();
        });
      });

      if (clearTokenButton) clearTokenButton.addEventListener('click', function () {
        setBusy(true);
        window.api.clearSaudiIPickMarketingToken().then(function () {
          tokenState.configured = false;
          tokenState.tokenPreview = '';
          platformOrder.forEach(function (platform) {
            switchPlatform(platform, false);
            availableAccounts = [];
            selectedSources = [];
            updateDiagnostics({ step: 'token-cleared', tokenConfigured: false, availableCount: 0, selectedCount: 0, mappedCount: 0, summary: tx('Token cleared.', 'تم مسح الرمز.'), lastError: '' });
            message = tx('Token cleared.', 'تم مسح الرمز.');
            error = '';
            loading = false;
            saveActivePlatformState();
          });
        }).finally(function () {
          loading = false;
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(refreshButtons, function (button) {
        button.addEventListener('click', function () {
          activateFrom(button);
          loadStatus();
        });
      });

      Array.prototype.forEach.call(sourceChecks, function (input) {
        input.addEventListener('change', function () {
          activateFrom(input);
          var id = String(input.value || '');
          if (!id) return;
          if (input.checked) {
            var source = availableAccounts.filter(function (item) { return item.id === id; })[0];
            if (source && !selectedSources.some(function (item) { return item.id === id; })) selectedSources = selectedSources.concat([source]);
          } else {
            selectedSources = selectedSources.filter(function (item) { return item.id !== id; });
          }
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(sourceSearches, function (sourceSearch) {
        sourceSearch.addEventListener('input', function () {
          activateFrom(sourceSearch);
          sourceQuery = String(sourceSearch.value || '');
          sourcePage = 1;
          saveActivePlatformState();
          render();
          var nextSearch = mount.querySelector('[data-marketing-platform="' + platformCursor + '"] [data-sip-source-search]');
          if (nextSearch) {
            nextSearch.focus();
            try { nextSearch.setSelectionRange(sourceQuery.length, sourceQuery.length); } catch (_) {}
          }
        });
      });

      Array.prototype.forEach.call(selectPageButtons, function (button) {
        button.addEventListener('click', function () {
          activateFrom(button);
          var query = sourceQuery.toLowerCase();
          var filtered = availableAccounts.filter(function (source) {
            return !query || [source.name, source.id, source.organizationName, source.currency].join(' ').toLowerCase().indexOf(query) !== -1;
          });
          var pageRows = filtered.slice((sourcePage - 1) * sourcePageSize, sourcePage * sourcePageSize);
          var byId = {};
          selectedSources.forEach(function (source) { byId[source.id] = source; });
          pageRows.forEach(function (source) {
            var owner = ownerOfSource(source.id);
            if (!owner || owner.id === selectedAccountId) byId[source.id] = source;
          });
          selectedSources = Object.keys(byId).map(function (id) { return byId[id]; });
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(clearSelectionButtons, function (button) {
        button.addEventListener('click', function () {
          activateFrom(button);
          selectedSources = [];
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(claimButtons, function (button) {
        button.addEventListener('click', function () {
          activateFrom(button);
          var card = button.closest('[data-marketing-platform]') || mount;
          var input = card.querySelector('[data-sip-claim-input]');
          var sourceId = input ? String(input.value || '').trim() : '';
          var source = availableAccounts.filter(function (item) { return item.id === sourceId; })[0];
          if (!sourceId) { error = tx('Paste the ad account ID first.', 'Paste the ad account ID first.'); saveActivePlatformState(); render(); return; }
          if (!source) { error = tx('This ad account is not in the Saudi iPick website account pool. Add it on the website first, then refresh status.', 'This ad account is not in the Saudi iPick website account pool. Add it on the website first, then refresh status.'); saveActivePlatformState(); render(); return; }
          if (!selectedSources.some(function (item) { return item.id === source.id; })) selectedSources = selectedSources.concat([source]);
          error = '';
          message = tx('Account selected. Save mapping to assign it.', 'Account selected. Save mapping to assign it.');
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(releaseButtons, function (button) {
        button.addEventListener('click', function () {
          activateFrom(button);
          var card = button.closest('[data-marketing-platform]') || mount;
          var select = card.querySelector('[data-sip-release-select]');
          var sourceId = select ? String(select.value || '') : '';
          if (!sourceId) return;
          selectedSources = selectedSources.filter(function (item) { return item.id !== sourceId; });
          message = tx('Account removed from the draft mapping. Save mapping to free the slot.', 'Account removed from the draft mapping. Save mapping to free the slot.');
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(prevPageButtons, function (button) {
        button.addEventListener('click', function () {
          activateFrom(button);
          sourcePage = Math.max(1, sourcePage - 1);
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(nextPageButtons, function (button) {
        button.addEventListener('click', function () {
          activateFrom(button);
          sourcePage += 1;
          saveActivePlatformState();
          render();
        });
      });

      Array.prototype.forEach.call(saveMappingButtons, function (button) {
        button.addEventListener('click', function () {
          var platform = activateFrom(button).id;
          var sources = selectedSourceObjects();
          if (!sources.length && selectedSources.length) sources = selectedSources;
          updateDiagnostics({ step: 'mapping-save', selectedCount: sources.length, summary: tx('Saving selected ad account mapping...', 'جارٍ حفظ تعيين الحسابات الإعلانية المحددة...'), lastError: '' });
          setBusy(true);
          window.api.saveSaudiIPickMarketingMapping(selectedAccountId, platform, sources).then(function (result) {
            switchPlatform(platform, false);
            if (!result || !result.ok) throw new Error(result && result.error || 'Could not save mapping.');
            selectedSources = sources;
            setStore(result);
            updateDiagnostics({ step: 'mapping-saved', selectedCount: selectedSources.length, mappedCount: countOf(result.mappedAccounts), summary: tx('Mapping saved. You can sync now.', 'تم حفظ التعيين. يمكنك المزامنة الآن.'), lastError: '' });
            message = tx('Mapping saved. You can sync now.', 'تم حفظ التعيين. يمكنك المزامنة الآن.');
          }).catch(function (err) {
            switchPlatform(platform, false);
            error = err && err.message ? err.message : String(err || '');
            updateDiagnostics({ step: 'mapping-error', lastError: error, summary: tx('Could not save selected ad account mapping.', 'تعذر حفظ تعيين الحسابات الإعلانية المحددة.') });
          }).finally(function () {
            switchPlatform(platform, false);
            loading = false;
            saveActivePlatformState();
            render();
          });
        });
      });
      Array.prototype.forEach.call(syncButtons, function (syncButton) {
        syncButton.addEventListener('click', function () {
          var platformMetaItem = activateFrom(syncButton);
          var platform = platformMetaItem.id;
          var period = getPeriod(fullData);
          var roi = window.DashboardRoiState ? window.DashboardRoiState.get(selectedAccountId, {}) : {};
          var sources = selectedSourceObjects();
          if (!sources.length) sources = selectedSources;
          updateDiagnostics({ step: 'sync-request', selectedCount: sources.length, summary: tx('Syncing ' + platformMetaItem.shortLabel + ' spend from Saudi iPick...', 'Syncing ' + platformMetaItem.shortLabel + ' spend from Saudi iPick...'), lastError: '' });
          setBusy(true);
          window.api.syncSaudiIPickMarketingData(selectedAccountId, platform, {
            dateFrom: period.dateFrom,
            dateTo: period.dateTo,
            targetCurrency: roi.currency || window.dashboardActiveCurrency || 'SAR',
            sourceAccounts: sources
          }).then(function (result) {
            switchPlatform(platform, false);
            if (!result || !result.ok) throw new Error(result && result.error || 'Sync failed.');
            selectedSources = (result.selectedSourceAccounts || sources).map(normalizeSource).filter(Boolean);
            setStore(result);
            updateDiagnostics({ step: 'sync-ok', selectedCount: selectedSources.length, mappedCount: countOf(result.mappedAccounts), summary: tx(platformMetaItem.shortLabel + ' spend synced into the calculators.', platformMetaItem.shortLabel + ' spend synced into the calculators.'), lastError: '' });
            message = tx(platformMetaItem.shortLabel + ' spend synced into the calculators.', platformMetaItem.shortLabel + ' spend synced into the calculators.');
            if (window.DashboardRoiState && typeof window.DashboardRoiState.notify === 'function') window.DashboardRoiState.notify(selectedAccountId);
          }).catch(function (err) {
            switchPlatform(platform, false);
            error = err && err.message ? err.message : String(err || '');
            updateDiagnostics({ step: 'sync-error', lastError: error, summary: tx('Could not sync ' + platformMetaItem.shortLabel + ' spend.', 'Could not sync ' + platformMetaItem.shortLabel + ' spend.') });
          }).finally(function () {
            switchPlatform(platform, false);
            loading = false;
            saveActivePlatformState();
            render();
          });
        });
      });
    }
    function init() {
      platformOrder.forEach(function (platform) { switchPlatform(platform, true); });
      restorePlatformState('snapchat', false);
      render();
      if (!window.api || typeof window.api.getSaudiIPickMarketingTokenStatus !== 'function') return;
      window.api.getSaudiIPickMarketingTokenStatus().then(function (result) {
        tokenState = result || tokenState;
        platformOrder.forEach(function (platform) {
          switchPlatform(platform, false);
          updateDiagnostics({
            step: 'token-status',
            tokenConfigured: !!tokenState.configured,
            summary: tokenState.configured ? tx('Saved token found. Loading account status...', 'تم العثور على رمز محفوظ. جارٍ تحميل حالة الحسابات...') : tx('No saved desktop token.', 'لا يوجد رمز سطح مكتب محفوظ.'),
            lastError: ''
          });
          saveActivePlatformState();
        });
        restorePlatformState('snapchat', false);
        render();
        if (tokenState.configured) loadAllStatuses();
      }).catch(function (err) {
        error = err && err.message ? err.message : String(err || '');
        platformOrder.forEach(function (platform) {
          switchPlatform(platform, false);
          updateDiagnostics({ step: 'token-status-error', lastError: error, summary: tx('Could not read saved token status.', 'تعذر قراءة حالة الرمز المحفوظ.') });
          saveActivePlatformState();
        });
        restorePlatformState('snapchat', false);
        render();
      });
    }

    init();
    return function () {};
  };
})();
