(function () {
  'use strict';

  function tr(key, fallback) {
    if (window.DashboardI18n && typeof window.DashboardI18n.t === 'function') {
      return window.DashboardI18n.t(key, fallback);
    }
    return fallback || key;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var LIVE_PLATFORMS = [
    { id: 'tiktok', name: 'TikTok Ads', mark: 'TT', connectKey: 'marketing.connectTiktok', connectFallback: 'Connect TikTok' },
    { id: 'snapchat', name: 'Snapchat Ads', mark: 'SC', markClass: 'snap', connectKey: 'marketing.connectSnapchat', connectFallback: 'Connect Snapchat' },
    { id: 'facebook', name: 'Facebook Ads', mark: 'FB', markClass: 'meta', connectKey: 'marketing.connectFacebook', connectFallback: 'Connect Facebook' }
  ];

  function platformLabel(platform) {
    return platform === 'snapchat' ? 'Snapchat' : platform === 'facebook' ? 'Facebook' : 'TikTok';
  }

  function formatError(error, platform, current) {
    var label = platformLabel(platform);
    if (!error) return '';
    var clean = String(error).trim();
    if (clean === 'supabase_function_timeout') {
      return tr('marketing.supabaseTimeout', 'Connection is slow. Please wait and try again later.');
    }
    if (clean === 'WINDSOR_RECONNECT_REQUIRED') {
      return tr('marketing.reconnectRequiredBody', label + ' authorization has expired or was revoked. Reconnect ' + label + ', then sync again.').replace(/\{platform\}/g, label);
    }
    if (clean === 'WINDSOR_AUTH_FAILED') {
      return tr('marketing.windsorAuthFailed', 'The ad data service rejected the marketing request. Refresh status or reconnect ' + label + '.').replace(/\{platform\}/g, label);
    }
    if (clean === 'PLATFORM_NOT_AVAILABLE') {
      return tr('marketing.platformNotAvailable', label + ' is not enabled on the deployed marketing service yet. Deploy the updated marketing function, then refresh status.').replace(/\{platform\}/g, label);
    }
    if (clean === 'MARKETING_ACCOUNT_LIMIT_EXCEEDED') {
      var limit = current && current.limit && typeof current.limit === 'object' ? current.limit : {};
      return tr('marketing.limitExceeded', 'This account can use up to {max} {platform} ad accounts. You selected {selected}. Contact support to increase the limit.')
        .replace(/\{platform\}/g, label)
        .replace(/\{max\}/g, limit.max || 2)
        .replace(/\{selected\}/g, limit.used || limit.selected || '--');
    }
    return clean;
  }

  function formatDate(value) {
    if (!value) return tr('marketing.neverSynced', 'Not synced yet');
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }

  function formatNumber(value, decimals) {
    if (value == null || value === '') return '--';
    var number = Number(value);
    if (!Number.isFinite(number)) return '--';
    return number.toLocaleString(undefined, {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  }

  function spendDisplay(summary) {
    if (!summary) {
      return {
        label: tr('marketing.spend', 'Ad spend'),
        value: '--',
        secondary: '',
        chips: ''
      };
    }
    var targetCurrency = String(summary.currency || '').toUpperCase();
    var sources = Array.isArray(summary.sourceBreakdown) ? summary.sourceBreakdown : [];
    var totals = {};
    sources.forEach(function (source) {
      var currency = String(source && source.currency || '').toUpperCase();
      var rawSpend = Number(source && source.rawSpend);
      if (!currency || !Number.isFinite(rawSpend)) return;
      totals[currency] = (totals[currency] || 0) + rawSpend;
    });
    var currencies = Object.keys(totals).filter(function (currency) {
      return Number.isFinite(totals[currency]);
    });
    var convertedText = formatNumber(summary.adSpend, 2) + (targetCurrency ? ' ' + targetCurrency : '');
    if (currencies.length === 1) {
      var sourceCurrency = currencies[0];
      var rawText = formatNumber(totals[sourceCurrency], 2) + ' ' + sourceCurrency;
      return {
        label: tr('marketing.spendWithCurrency', 'Ad spend ({currency})').replace(/\{currency\}/g, sourceCurrency),
        value: rawText,
        secondary: sourceCurrency !== targetCurrency && targetCurrency
          ? tr('marketing.calculatorSpend', 'For calculator: {amount}').replace(/\{amount\}/g, convertedText)
          : '',
        chips: ''
      };
    }
    return {
      label: targetCurrency
        ? tr('marketing.syncedSpendWithCurrency', 'Synced spend ({currency})').replace(/\{currency\}/g, targetCurrency)
        : tr('marketing.spend', 'Ad spend'),
      value: convertedText,
      secondary: currencies.length > 1 ? tr('marketing.mixedSourceCurrencies', 'Mixed source currencies') : '',
      chips: currencies.map(function (currency) {
        return '<em class="marketing-spend-chip">' + escapeHtml(formatNumber(totals[currency], 2) + ' ' + currency) + '</em>';
      }).join('')
    };
  }

  function accountIdOf(account) {
    return String(account && (account.id || account.accountId || account.key || '') || '');
  }

  function accountLabelOf(account) {
    // Taager account identity still accepts legacy taager* fields so saved mappings keep working.
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

  function accountMappingKey(account) {
    // Preserve legacy taager* lookup aliases; existing account mappings may be keyed by them.
    var merchantId = String(account && (account.taagerAffiliateCode || account.taager_affiliate_code) || '').trim().toLowerCase();
    var country = String(account && (account.taagerCountry || account.taager_country) || 'sa').trim().toLowerCase();
    if (merchantId) return 'taager:' + country + ':' + merchantId;
    var phone = String(account && (account.taagerPhone || account.taager_phone) || '').replace(/\D/g, '');
    if (phone) return 'phone:' + phone;
    return String(
      account && (account.taagerEmail || account.taager_email || account.easyEmail || account.easy_email || account.email) ||
      accountLabelOf(account) ||
      accountIdOf(account) ||
      ''
    ).trim().toLowerCase();
  }

  function accountMappingKeys(account) {
    var keys = [];
    function push(value) {
      var key = String(value || '').trim().toLowerCase();
      if (key && keys.indexOf(key) === -1) keys.push(key);
    }
    function pushPhone(value) {
      var phone = String(value || '').replace(/\D/g, '');
      if (phone) push('phone:' + phone);
      push(value);
    }
    if (typeof account === 'string') {
      push(account);
      return keys;
    }
    if (Array.isArray(account && account.keys)) account.keys.forEach(push);
    var source = account && account.source;
    var merchantId = String(account && (account.taagerAffiliateCode || account.taager_affiliate_code) || '').trim().toLowerCase();
    var country = String(account && (account.taagerCountry || account.taager_country) || 'sa').trim().toLowerCase();
    var sourceMerchantId = String(source && (source.taagerAffiliateCode || source.taager_affiliate_code) || '').trim().toLowerCase();
    var sourceCountry = String(source && (source.taagerCountry || source.taager_country) || country || 'sa').trim().toLowerCase();
    push(accountIdOf(account));
    push(accountMappingKey(account));
    if (merchantId) push('taager:' + country + ':' + merchantId);
    if (sourceMerchantId) push('taager:' + sourceCountry + ':' + sourceMerchantId);
    pushPhone(account && (account.taagerPhone || account.taager_phone));
    [
      account && account.memberName,
      account && account.easyEmail,
      account && account.easy_email,
      account && account.taagerEmail,
      account && account.taager_email,
      account && account.email,
      account && account.label,
      account && account.name,
      source && source.memberName,
      source && source.taagerPhone,
      source && source.taager_phone,
      source && source.easyEmail,
      source && source.easy_email,
      source && source.taagerEmail,
      source && source.taager_email,
      source && source.taagerAffiliateCode,
      source && source.taager_affiliate_code,
      source && source.email,
      source && source.label,
      source && source.name
    ].forEach(push);
    return keys;
  }

  function accountOwnsMappingKey(account, key) {
    var normalized = String(key || '').trim().toLowerCase();
    return !!normalized && accountMappingKeys(account).indexOf(normalized) !== -1;
  }

  function listTaagerAccounts(data, selectedAccountId) {
    var source = data && data.meta && Array.isArray(data.meta.accountOptions)
      ? data.meta.accountOptions
      : (Array.isArray(window.dashboardAccountsList) ? window.dashboardAccountsList : []);
    var seen = {};
    var accounts = source.map(function (account) {
      var id = accountIdOf(account);
      if (!id || id === '__all__' || seen[id]) return null;
      seen[id] = true;
      return {
        id: id,
        key: accountMappingKey(account),
        keys: accountMappingKeys(account),
        label: accountLabelOf(account) || id,
        source: account
      };
    }).filter(Boolean);

    if (selectedAccountId && selectedAccountId !== '__all__' && !seen[selectedAccountId]) {
      accounts.push({ id: selectedAccountId, key: String(selectedAccountId).toLowerCase(), keys: [String(selectedAccountId).toLowerCase()], label: selectedAccountId });
    }
    return accounts;
  }

  window.renderSectionMarketingConnections = function renderSectionMarketingConnections(mount, data, ctx) {
    var fullData = ctx && ctx.data ? ctx.data : (data || {});
    var selectedAccountId = String(
      fullData && fullData.meta && fullData.meta.activeAccountId ||
      (typeof window.getActiveAccountId === 'function' ? window.getActiveAccountId() : '__all__')
    );
    var allMode = selectedAccountId === '__all__';
    var taagerAccounts = listTaagerAccounts(fullData, selectedAccountId);
    var shownAccounts = allMode
      ? taagerAccounts
      : taagerAccounts.filter(function (account) { return account.id === selectedAccountId; });
    var store = window.DashboardMarketingState;
    var pollTimer = null;
    var pollPlatform = '';
    var pollStartedAt = 0;
    var pollAttempt = 0;
    var awaitingAuthorizationPlatform = '';
    var debugEvents = [];
    var busyLabel = '';
    var AUTO_REFRESH_DELAYS_MS = [3000, 5000, 10000, 15000, 20000];
    var AUTO_REFRESH_TIMEOUT_MS = 65000;

    function state(platform) {
      return store && typeof store.get === 'function'
        ? store.get(selectedAccountId, platform)
        : { status: 'disconnected', summary: null, linkedAccounts: [], mappedAccounts: [], availableAccounts: [], mappings: {}, loading: false, error: '' };
    }

    function log(event, data) {
      var entry = {
        at: new Date().toLocaleTimeString(),
        event: event,
        data: data || {}
      };
      debugEvents.unshift(entry);
      debugEvents = debugEvents.slice(0, 8);
      console.log('[Marketing][UI] ' + event, data || {});
    }

    function mappedAccounts(current, dashboardAccount) {
      var mappings = current.mappings && typeof current.mappings === 'object' ? current.mappings : {};
      var keys = accountMappingKeys(dashboardAccount);
      var assigned = [];
      keys.some(function (key) {
        if (!Array.isArray(mappings[key])) return false;
        assigned = mappings[key];
        return true;
      });
      if (!assigned.length && !allMode && current.selectedSourceAccounts && accountOwnsMappingKey(dashboardAccount, selectedAccountId)) {
        assigned = Array.isArray(current.selectedSourceAccounts) ? current.selectedSourceAccounts : [];
      }
      if (!assigned.length && !allMode && current.status === 'connected' && accountOwnsMappingKey(dashboardAccount, selectedAccountId)) {
        assigned = Array.isArray(current.mappedAccounts) ? current.mappedAccounts : [];
      }
      return assigned;
    }

    function ownerOfSource(current, sourceId) {
      var mappings = current.mappings && typeof current.mappings === 'object' ? current.mappings : {};
      var owner = '';
      Object.keys(mappings).some(function (dashboardAccountId) {
        var hasSource = Array.isArray(mappings[dashboardAccountId]) && mappings[dashboardAccountId].some(function (source) {
          return String(source.id || '') === sourceId;
        });
        if (hasSource) owner = dashboardAccountId;
        return hasSource;
      });
      return owner;
    }

    function currencyOptions(selectedCurrency) {
      var currencies = window.TaagerCurrency && Array.isArray(window.TaagerCurrency.supported)
        ? window.TaagerCurrency.supported
        : ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'];
      return '<option value="">' + escapeHtml(tr('marketing.selectCurrency', 'Select currency')) + '</option>' +
        currencies.map(function (currency) {
          return '<option value="' + currency + '"' + (selectedCurrency === currency ? ' selected' : '') + '>' + currency + '</option>';
        }).join('');
    }

    function platformLimit(current, assignedCount, accountId) {
      var limits = current && current.limits && typeof current.limits === 'object' ? current.limits : {};
      var limit = accountId && limits[accountId] && typeof limits[accountId] === 'object'
        ? limits[accountId]
        : (current && current.limit && typeof current.limit === 'object' ? current.limit : {});
      var max = Number(limit.max || 2) || 2;
      var used = limit.used == null ? Number(assignedCount || 0) : Number(limit.used || 0);
      return { max: max, used: used, remaining: Math.max(0, max - used) };
    }

    function limitMarkup(current, assignedCount, platform, accountId) {
      var label = platformLabel(platform);
      var limit = platformLimit(current, assignedCount, accountId);
      return '<div class="marketing-limit-note">' +
        '<strong>' + escapeHtml(tr('marketing.limitUsage', 'Assigned {used} / {max} {platform} accounts')
          .replace(/\{used\}/g, limit.used)
          .replace(/\{max\}/g, limit.max)
          .replace(/\{platform\}/g, label)) + '</strong>' +
        '<span>' + escapeHtml(tr('marketing.limitHelp', 'You can assign up to {max} accounts for this platform. Contact support to increase this limit.')
          .replace(/\{max\}/g, limit.max)
          .replace(/\{platform\}/g, label)) + '</span>' +
      '</div>';
    }

    function connectionGuideMarkup(platform) {
      var label = platformLabel(platform);
      var steps = [
        tr('marketing.guideStepConnect', 'Click Connect.'),
        tr('marketing.guideStepContinue', 'In the connection window, click Continue.'),
        tr('marketing.guideStepGrant', 'Grant {platform} access.').replace(/\{platform\}/g, label),
        tr('marketing.guideStepFinish', 'Click Finish in the top-right.'),
        tr('marketing.guideStepRefresh', 'Return here. Status refreshes automatically; Refresh Status stays available as backup.')
      ];
      return '<section class="marketing-connection-guide">' +
        '<strong>' + escapeHtml(tr('marketing.guideTitle', 'How to connect')) + '</strong>' +
        '<ol>' + steps.map(function (step) { return '<li>' + escapeHtml(step) + '</li>'; }).join('') + '</ol>' +
      '</section>';
    }

    function mappingRows(current, platform) {
      var linkedAccounts = Array.isArray(current.availableAccounts) && current.availableAccounts.length
        ? current.availableAccounts
        : (Array.isArray(current.linkedAccounts) ? current.linkedAccounts : []);
      if (!shownAccounts.length) {
        return '<p class="marketing-map-empty">' + escapeHtml(tr('marketing.noTaagerAccounts', 'No Taager accounts are available to map.')) + '</p>';
      }
      if (!linkedAccounts.length) {
        return '<p class="marketing-map-empty">' + escapeHtml(tr('marketing.noKnownAdAccounts', 'No known ad accounts yet. Connect accounts or claim an existing ad account ID.')) + '</p>';
      }

      return shownAccounts.map(function (dashboardAccount) {
        var assigned = mappedAccounts(current, dashboardAccount);
        var assignedIds = {};
        var assignedCurrencies = {};
        assigned.forEach(function (source) {
          assignedIds[String(source.id)] = true;
          assignedCurrencies[String(source.id)] = String(source.currency || '').toUpperCase();
        });
        var choices = linkedAccounts.map(function (source) {
          var id = String(source.id || '');
          var name = String(source.name || id);
          var detectedCurrency = String(source.currency || '').toUpperCase();
          var ownerId = ownerOfSource(current, id);
          var ownedElsewhere = !!ownerId && !accountOwnsMappingKey(dashboardAccount, ownerId);
          var ownerAccount = shownAccounts.concat(taagerAccounts).filter(function (account) {
            return accountOwnsMappingKey(account, ownerId);
          })[0];
          var currency = assignedCurrencies[id] || detectedCurrency || '';
          var currencyLocked = ownedElsewhere;
          return '<label class="marketing-mapping-choice">' +
            '<input type="checkbox" value="' + escapeHtml(id) + '"' + (assignedIds[id] ? ' checked' : '') +
              (ownedElsewhere ? ' disabled data-locked="1"' : '') + '>' +
            '<span class="marketing-source-copy"><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(id) + '</small>' +
              (ownedElsewhere ? '<em>' + escapeHtml(tr('marketing.assignedTo', 'Assigned to')) + ' ' + escapeHtml(ownerAccount ? ownerAccount.label : ownerId) + '</em>' : '') +
            '</span>' +
            '<select class="marketing-source-currency" data-source-currency="' + escapeHtml(id) + '"' + (detectedCurrency ? ' data-detected-currency="1"' : '') + (currencyLocked ? ' disabled' : '') + '>' +
              currencyOptions(currency) +
            '</select>' +
          '</label>';
        }).join('');

        return '<details class="marketing-mapping-row"' + (allMode ? '' : ' open') + ' data-marketing-map-row="' + escapeHtml(dashboardAccount.id) + '" data-marketing-map-key="' + escapeHtml(accountMappingKey(dashboardAccount)) + '">' +
          '<summary>' +
            '<span class="marketing-account-label">' + escapeHtml(dashboardAccount.label) + '</span>' +
            '<span class="marketing-assigned-pill">' + assigned.length + ' ' + escapeHtml(tr('marketing.assigned', 'assigned')) + '</span>' +
          '</summary>' +
          '<div class="marketing-mapping-choices">' + choices + '</div>' +
          limitMarkup(current, assigned.length, platform, dashboardAccount.id) +
          (allMode ? '' :
            '<button class="marketing-secondary marketing-save-map-btn" type="button" data-marketing-save-map="' + escapeHtml(dashboardAccount.id) + '"' +
              (current.loading ? ' disabled' : '') + '>' + escapeHtml(tr('marketing.saveMapping', 'Save mapping')) + '</button>') +
        '</details>';
      }).join('');
    }

    function assignedAccountsMarkup(current, assigned, platform) {
      var label = platformLabel(platform);
      return '<section class="marketing-mapping-board">' +
        '<h4>' + escapeHtml(tr('marketing.assignedTitle', 'Assigned ' + label + ' account').replace(/\{platform\}/g, label)) + '</h4>' +
        '<p>' + escapeHtml(tr('marketing.assignedBody', 'This Taager account is linked only to the ' + label + ' account assigned to it.').replace(/\{platform\}/g, label)) + '</p>' +
        '<p class="marketing-map-empty" hidden>' + escapeHtml(tr('marketing.assignmentMemberBody', 'No ' + label + ' ad account has been assigned to this Taager account yet. Connect ' + label + ' or ask an admin to assign the correct account.').replace(/\{platform\}/g, label)) + '</p>' +
        '<div class="marketing-mapping-choices">' + assigned.map(function (source) {
          var id = String(source.id || '');
          var name = String(source.name || id);
          var currency = String(source.currency || '').toUpperCase();
          return '<div class="marketing-mapping-choice is-readonly">' +
            '<span class="marketing-source-copy"><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(id) + '</small></span>' +
          (currency ? '<span class="marketing-source-currency is-readonly">' + escapeHtml(currency) + '</span>' : '') +
          '</div>';
        }).join('') + '</div>' +
        limitMarkup(current, assigned.length, platform) +
      '</section>';
    }

    function releaseOptionsMarkup(current, platform, allMode) {
      var rows = [];
      if (allMode) {
        var mappings = current.mappings && typeof current.mappings === 'object' ? current.mappings : {};
        Object.keys(mappings).forEach(function (ownerId) {
          var ownerAccount = shownAccounts.concat(taagerAccounts).filter(function (account) {
            return accountOwnsMappingKey(account, ownerId);
          })[0];
          (Array.isArray(mappings[ownerId]) ? mappings[ownerId] : []).forEach(function (source) {
            rows.push({
              ownerId: ownerAccount ? ownerAccount.id : ownerId,
              ownerLabel: ownerAccount ? ownerAccount.label : ownerId,
              sourceId: String(source.id || ''),
              sourceName: String(source.name || source.id || '')
            });
          });
        });
      } else {
        var activeAccount = shownAccounts.filter(function (account) { return account.id === selectedAccountId; })[0];
        mappedAccounts(current, activeAccount || selectedAccountId).forEach(function (source) {
          rows.push({
            ownerId: selectedAccountId,
            ownerLabel: activeAccount ? activeAccount.label : selectedAccountId,
            sourceId: String(source.id || ''),
            sourceName: String(source.name || source.id || '')
          });
        });
      }
      rows = rows.filter(function (row) { return row.ownerId && row.sourceId; });
      if (!rows.length) {
        return '<div class="marketing-inline-info">' + escapeHtml(tr('marketing.noReleaseAccounts', 'No assigned ad accounts to release.')) + '</div>';
      }
      return '<label><span>' + escapeHtml(tr('marketing.releaseAccountLabel', 'Assigned ad account')) + '</span>' +
        '<select data-marketing-release-select="' + escapeHtml(platform) + '">' +
          rows.map(function (row) {
            var value = encodeURIComponent(row.ownerId) + '|' + encodeURIComponent(row.sourceId);
            return '<option value="' + escapeHtml(value) + '">' + escapeHtml(row.ownerLabel + ' - ' + row.sourceName + ' (' + row.sourceId + ')') + '</option>';
          }).join('') +
        '</select></label>' +
        '<button class="marketing-secondary is-danger" type="button" data-marketing-release="' + escapeHtml(platform) + '">' + escapeHtml(tr('marketing.releaseAccount', 'Release account')) + '</button>';
    }

    function claimReleaseMarkup(current, platform, allMode) {
      var label = platformLabel(platform);
      return '<section class="marketing-mapping-board marketing-claim-source">' +
        '<h4>' + escapeHtml(tr('marketing.claimReleaseTitle', 'Claim or release ' + label + ' ad account').replace(/\{platform\}/g, label)) + '</h4>' +
        '<div class="marketing-claim-tabs">' +
          '<input type="radio" id="marketing-claim-tab-' + escapeHtml(platform) + '" name="marketing-claim-tabs-' + escapeHtml(platform) + '" checked>' +
          '<label for="marketing-claim-tab-' + escapeHtml(platform) + '">' + escapeHtml(tr('marketing.claimTab', 'Claim')) + '</label>' +
          '<input type="radio" id="marketing-release-tab-' + escapeHtml(platform) + '" name="marketing-claim-tabs-' + escapeHtml(platform) + '">' +
          '<label for="marketing-release-tab-' + escapeHtml(platform) + '">' + escapeHtml(tr('marketing.releaseTab', 'Release')) + '</label>' +
          '<div class="marketing-claim-panel is-claim">' +
            '<p>' + escapeHtml(allMode
              ? tr('marketing.claimAllBody', 'Paste an existing ' + label + ' ad account ID to add it to this app, then map it to the right Taager account.').replace(/\{platform\}/g, label)
              : tr('marketing.claimSingleBody', 'Paste an existing ' + label + ' ad account ID to connect it to this Taager account.').replace(/\{platform\}/g, label)) + '</p>' +
            '<div class="marketing-account-map">' +
              '<label><span>' + escapeHtml(tr('marketing.adAccountId', 'Ad account ID')) + '</span>' +
                '<input type="text" data-marketing-claim-input="' + escapeHtml(platform) + '" placeholder="' + escapeHtml(tr('marketing.adAccountIdPlaceholder', 'Paste ad account ID')) + '">' +
              '</label>' +
              '<button class="marketing-secondary" type="button" data-marketing-claim="' + escapeHtml(platform) + '">' + escapeHtml(tr('marketing.claimAccount', 'Claim account')) + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="marketing-claim-panel is-release">' +
            '<p>' + escapeHtml(tr('marketing.releaseBody', 'Release removes the assignment from this app and frees one slot.')) + '</p>' +
            '<div class="marketing-account-map">' + releaseOptionsMarkup(current, platform, allMode) + '</div>' +
          '</div>' +
        '</div>' +
      '</section>';
    }

    function unassignedMarkup(current, platform) {
      var label = platformLabel(platform);
      return '<section class="marketing-mapping-board">' +
        '<h4>' + escapeHtml(tr('marketing.noAccountTitle', 'No ' + label + ' ad account connected').replace(/\{platform\}/g, label)) + '</h4>' +
        '<div class="marketing-inline-warning">' + escapeHtml(tr('marketing.noAccountBody', 'No ' + label + ' ad account is connected to this Taager account yet. Connect a new account or claim an existing ad account ID.').replace(/\{platform\}/g, label)) + '</div>' +
      '</section>' + claimReleaseMarkup(current, platform, false);
    }

    function diagnosticMarkup(current) {
      var diagnostics = current.diagnostics || {};
      var events = debugEvents.map(function (event) {
        return '<div><span>' + escapeHtml(event.at) + '</span> ' + escapeHtml(event.event) + '</div>';
      }).join('');
      var lookup = diagnostics.optionsShape || {};
      return '<details class="marketing-diagnostics">' +
        '<summary>' + escapeHtml(tr('marketing.diagnostics', 'Connection diagnostics')) + '</summary>' +
        '<div class="marketing-diagnostic-stats">' +
          '<span>' + escapeHtml(tr('marketing.savedConnection', 'Saved link')) + '</span><strong>' + escapeHtml(diagnostics.hasSavedConnection ? tr('marketing.yes', 'Yes') : tr('marketing.no', 'No')) + '</strong>' +
          '<span>' + escapeHtml(tr('marketing.tokenStored', 'Link token stored')) + '</span><strong>' + escapeHtml(diagnostics.tokenPresent ? tr('marketing.yes', 'Yes') : tr('marketing.no', 'No')) + '</strong>' +
          '<span>' + escapeHtml(tr('marketing.windsorRows', 'Synced data rows')) + '</span><strong>' + escapeHtml(diagnostics.rawLinkedRows == null ? '--' : diagnostics.rawLinkedRows) + '</strong>' +
          '<span>' + escapeHtml(tr('marketing.optionsAccounts', 'Selectable accounts')) + '</span><strong>' + escapeHtml(current.linkedAccountCount == null ? '--' : current.linkedAccountCount) + '</strong>' +
        '</div>' +
        (lookup.lookup ? '<p class="marketing-diagnostic-shape">' + escapeHtml(tr('marketing.optionsShape', 'Ad account lookup')) + ': ' + escapeHtml(JSON.stringify(lookup)) + '</p>' : '') +
        (diagnostics.optionsError ? '<p class="marketing-diagnostic-error">' + escapeHtml(diagnostics.optionsError) + '</p>' : '') +
        '<div class="marketing-debug-events">' + events + '</div>' +
      '</details>';
    }

    function platformCard(config) {
      var platform = config.id;
      var label = platformLabel(platform);
      var current = state(platform);
      var summary = current.summary;
      var connectionClass = current.status === 'connected' ? ' is-connected' : ' is-disconnected';
      var statusLabel = current.reconnectRequired
        ? tr('marketing.reconnectRequired', 'Reconnect required')
        : current.status === 'connected'
        ? tr('marketing.connected', 'Connected')
        : tr('marketing.notConnected', 'Not connected');
      var activeAccount = shownAccounts.filter(function (account) { return account.id === selectedAccountId; })[0];
      var currentMapping = allMode ? [] : mappedAccounts(current, activeAccount || selectedAccountId);
      var spend = spendDisplay(summary);
      var canSync = !allMode && current.status === 'connected' && currentMapping.length > 0 && !current.loading;
      var syncButtonLabel = currentMapping.length > 1
        ? tr('marketing.syncMapped', 'Sync Mapped ' + label + ' Accounts').replace(/\{platform\}/g, label)
        : tr('marketing.syncNow', 'Sync Now');
      var canSyncAll = allMode && current.status === 'connected' &&
        Object.keys(current.mappings || {}).some(function (key) { return Array.isArray(current.mappings[key]) && current.mappings[key].length; }) &&
        !current.loading;
      var canConnect = shownAccounts.length > 0 && !current.loading;
      var connectedAccounts = allMode
        ? (Array.isArray(current.availableAccounts) ? current.availableAccounts : [])
        : (Array.isArray(current.mappedAccounts) && current.mappedAccounts.length ? current.mappedAccounts : current.linkedAccounts || []);
      var connectLabel = current.reconnectRequired
        ? tr('marketing.reconnectRequired', 'Reconnect required')
        : current.status === 'connected'
        ? tr('marketing.addAccount', 'Add account')
        : tr(config.connectKey, config.connectFallback);
      var canConnectNow = canConnect;
      var mappingContent = '';

      if (!allMode && currentMapping.length) {
        mappingContent =
          '<section class="marketing-mapping-board">' +
            '<h4>' + escapeHtml(tr('marketing.assignedTitle', 'Assigned ' + label + ' account').replace(/\{platform\}/g, label)) + '</h4>' +
            '<p>' + escapeHtml(tr('marketing.assignedBody', 'This Taager account is linked only to the ' + label + ' account assigned to it.').replace(/\{platform\}/g, label)) + '</p>' +
            mappingRows(current, platform) +
          '</section>' + claimReleaseMarkup(current, platform, false);
      } else if (allMode) {
        mappingContent =
          '<section class="marketing-mapping-board">' +
            '<h4>' + escapeHtml(tr('marketing.mappingTitle', 'Map known ' + label + ' accounts to Taager accounts').replace(/\{platform\}/g, label)) + '</h4>' +
            '<p>' + escapeHtml(tr('marketing.mappingBody', 'Only ad accounts known to this Taager app appear here. Select all that belong to each account.').replace(/\{platform\}/g, label)) + '</p>' +
            '<div class="marketing-inline-info">' + escapeHtml(tr('marketing.allModeHint', 'Connect accounts, claim existing ad account IDs, assign currencies, then sync mapped accounts.')) + '</div>' +
            mappingRows(current, platform) +
            '<div class="marketing-save-all-wrap"><button class="marketing-primary marketing-save-all-btn" data-marketing-save-all="' + escapeHtml(platform) + '" type="button"' +
              (current.loading ? ' disabled' : '') + '>' + escapeHtml(tr('marketing.saveAllMappings', 'Save all mappings')) + '</button></div>' +
          '</section>' + claimReleaseMarkup(current, platform, true);
      } else if (!allMode && current.status === 'connected' && connectedAccounts.length) {
        mappingContent =
          '<section class="marketing-mapping-board">' +
            '<h4>' + escapeHtml(tr('marketing.mappingTitle', 'Map known ' + label + ' accounts to Taager accounts').replace(/\{platform\}/g, label)) + '</h4>' +
            '<p>' + escapeHtml(tr('marketing.mappingBody', 'Only ad accounts known to this Taager app appear here. Select all that belong to each account.').replace(/\{platform\}/g, label)) + '</p>' +
            mappingRows(current, platform) +
          '</section>' + claimReleaseMarkup(current, platform, false);
      } else if (!allMode && current.status !== 'connected') {
        mappingContent = unassignedMarkup(current, platform);
      }

      return '<article class="marketing-platform-card" data-marketing-platform="' + escapeHtml(platform) + '">' +
          (current.error ? '<div class="marketing-message is-error">' + escapeHtml(formatError(current.error, platform, current)) + '</div>' : '') +
          (current.loading ? '<div class="marketing-loading"><span class="dash-preloader-spinner"></span><span>' + escapeHtml(busyLabel || tr('marketing.working', 'Working...')) + '</span></div>' : '') +
          '<div class="marketing-platform-head">' +
            '<div class="marketing-platform-brand"><span class="marketing-platform-mark ' + escapeHtml(config.markClass || '') + '">' + escapeHtml(config.mark) + '</span>' +
            '<div><strong>' + escapeHtml(config.name) + '</strong><small>' + escapeHtml(tr('marketing.liveFirst', 'Available now')) + '</small></div></div>' +
            '<span class="marketing-status' + connectionClass + '">' + escapeHtml(statusLabel) + '</span>' +
          '</div>' +
          '<div class="marketing-metric-grid">' +
            '<div class="marketing-spend-metric"><span>' + escapeHtml(spend.label) + '</span><strong>' + escapeHtml(spend.value) + '</strong>' +
              (spend.secondary ? '<small>' + escapeHtml(spend.secondary) + '</small>' : '') +
              (spend.chips ? '<p class="marketing-spend-chips">' + spend.chips + '</p>' : '') +
            '</div>' +
            '<div><span>' + escapeHtml(tr('marketing.campaigns', 'Campaign rows')) + '</span><strong>' + (summary ? formatNumber(summary.campaignCount, 0) : '--') + '</strong></div>' +
            '<div><span>' + escapeHtml(tr('marketing.impressions', 'Impressions')) + '</span><strong>' + (summary ? formatNumber(summary.impressions, 0) : '--') + '</strong></div>' +
            '<div><span>' + escapeHtml(tr('marketing.clicks', 'Clicks')) + '</span><strong>' + (summary ? formatNumber(summary.clicks, 0) : '--') + '</strong></div>' +
          '</div>' +
          mappingContent +
          diagnosticMarkup(current) +
          '<div class="marketing-last-sync"><span>' + escapeHtml(tr('marketing.lastSync', 'Last sync')) + '</span><strong>' + escapeHtml(formatDate(current.lastSyncAt)) + '</strong></div>' +
          '<div class="marketing-actions">' +
            '<button class="marketing-primary" data-marketing-connect="' + escapeHtml(platform) + '" type="button"' + (canConnectNow ? '' : ' disabled') + '>' + escapeHtml(connectLabel) + '</button>' +
            '<button class="marketing-secondary" data-marketing-sync="' + escapeHtml(platform) + '" type="button"' + (canSync ? '' : ' disabled') + '>' + escapeHtml(syncButtonLabel) + '</button>' +
            (allMode ? '<button class="marketing-secondary" data-marketing-sync-all="' + escapeHtml(platform) + '" type="button"' + (canSyncAll ? '' : ' disabled') + '>' + escapeHtml(tr('marketing.syncAll', 'Sync All Accounts')) + '</button>' : '') +
            (allMode
              ? '<button class="marketing-secondary" data-marketing-full-sync-all="' + escapeHtml(platform) + '" type="button"' + (canSyncAll ? '' : ' disabled') + '>' + escapeHtml(tr('marketing.fullRefresh', 'Refresh all selected dates')) + '</button>'
              : '<button class="marketing-secondary" data-marketing-full-sync="' + escapeHtml(platform) + '" type="button"' + (canSync ? '' : ' disabled') + '>' + escapeHtml(tr('marketing.fullRefresh', 'Refresh all selected dates')) + '</button>') +
            '<button class="marketing-secondary" data-marketing-refresh="' + escapeHtml(platform) + '" type="button"' + (shownAccounts.length && !current.loading ? '' : ' disabled') + '>' + escapeHtml(tr('marketing.refreshStatus', 'Refresh Status')) + '</button>' +
          '</div>' +
          (allMode ? '<p class="marketing-sync-note">' + escapeHtml(tr('marketing.syncSingleOnly', 'Sync all mapped accounts here, then select any account to view the same saved sync result without syncing again.')) + '</p>' : '') +
          '<p class="marketing-sync-note">' + escapeHtml(tr('marketing.windsorCacheNote', 'After renaming ' + label + ' campaigns or adding SKUs, synced reports may remain cached for up to 6 hours. For historical changes, refresh campaign data, then sync again.').replace(/\{platform\}/g, label)) + '</p>' +
        '</article>';
    }

    function render() {
      mount.innerHTML =
        '<div class="marketing-section">' +
          '<header class="marketing-hero">' +
            '<div>' +
              '<p class="marketing-kicker">' + escapeHtml(tr('marketing.kicker', 'Marketing Integrations')) + '</p>' +
              '<h2>' + escapeHtml(tr('marketing.title', 'Connect advertising data')) + '</h2>' +
              '<p>' + escapeHtml(tr('marketing.subtitle', 'Sync TikTok, Snapchat, and Facebook spend into your existing account calculator. Your operational order metrics stay unchanged.')) + '</p>' +
            '</div>' +
            '<aside class="marketing-security"><strong>' + escapeHtml(tr('marketing.secureTitle', 'Secure connection')) + '</strong><span>' + escapeHtml(tr('marketing.secureBody', 'Authorization and API secrets run through the protected backend, not this dashboard.')) + '</span></aside>' +
          '</header>' +
          '<div class="marketing-platform-grid">' +
            LIVE_PLATFORMS.map(platformCard).join('') +
          '</div>' +
        '</div>';
      bind();
    }

    function setBusy(label, platform) {
      busyLabel = label || '';
      if (store && typeof store.setLoading === 'function') {
        store.setLoading(true, selectedAccountId, platform);
      }
      render();
    }

    function invalidateStatus(accountId, platform) {
      if (store && typeof store.invalidate === 'function') store.invalidate(accountId, platform);
    }

    function hasUsableConnection(result) {
      return result && result.status === 'connected' && (
        (Array.isArray(result.mappedAccounts) && result.mappedAccounts.length) ||
        (Array.isArray(result.linkedAccounts) && result.linkedAccounts.length) ||
        (Array.isArray(result.availableAccounts) && result.availableAccounts.length)
      );
    }

    function stopAutoRefresh(reason, platform, result) {
      if (!pollTimer && !pollPlatform) return;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      log('connect:auto_refresh_stopped', {
        platform: platform || pollPlatform,
        reason: reason || '',
        status: result && result.status || '',
        error: result && result.error || ''
      });
      pollPlatform = '';
      pollStartedAt = 0;
      pollAttempt = 0;
    }

    function loadStatus(platform, options) {
      platform = platform || 'tiktok';
      options = options || {};
      var label = platformLabel(platform);
      if (!shownAccounts.length || !store || typeof store.load !== 'function') return Promise.resolve();
      log(options.autoRefresh ? 'connect:auto_refresh_tick' : 'refresh_status:started', { accountId: selectedAccountId, platform: platform });
      if (!options.cached && !options.background) {
        setBusy(tr('marketing.loadingStatus', 'Checking ' + label + ' connection...').replace(/\{platform\}/g, label), platform);
      }
      return store.load(selectedAccountId, platform, {
        force: !!options.force || !!options.autoRefresh,
        background: !!options.background
      }).then(function (result) {
        busyLabel = '';
        log('refresh_status:finished', {
          platform: platform,
          status: result && result.status,
          error: result && result.error || '',
          linkedAccountCount: result && result.linkedAccountCount || 0
        });
        var usableConnection = hasUsableConnection(result);
        if (awaitingAuthorizationPlatform === platform && (usableConnection || result && (result.error || result.reconnectRequired))) {
          awaitingAuthorizationPlatform = '';
        }
        if (options.autoRefresh && pollPlatform === platform) {
          if (usableConnection) {
            log('connect:auto_refresh_connected', { platform: platform, linkedAccountCount: result.linkedAccountCount || 0 });
            stopAutoRefresh('connected', platform, result);
          } else if (result && (result.error || result.reconnectRequired)) {
            stopAutoRefresh(result.reconnectRequired ? 'reconnect_required' : 'error', platform, result);
          } else if (Date.now() - pollStartedAt >= AUTO_REFRESH_TIMEOUT_MS) {
            log('connect:auto_refresh_timeout', { platform: platform });
            stopAutoRefresh('timeout', platform, result);
          }
        }
        render();
        return result;
      });
    }

    function startAutoRefresh(platform) {
      stopAutoRefresh('restart', platform);
      pollPlatform = platform;
      pollStartedAt = Date.now();
      pollAttempt = 0;
      log('connect:auto_refresh_started', { platform: platform, delaysMs: AUTO_REFRESH_DELAYS_MS, timeoutMs: AUTO_REFRESH_TIMEOUT_MS });
      function scheduleNext() {
        if (!pollPlatform || Date.now() - pollStartedAt >= AUTO_REFRESH_TIMEOUT_MS || pollAttempt >= AUTO_REFRESH_DELAYS_MS.length) {
          stopAutoRefresh('timeout', platform);
          return;
        }
        var delay = AUTO_REFRESH_DELAYS_MS[pollAttempt++];
        pollTimer = setTimeout(function () {
          pollTimer = null;
          loadStatus(platform, { autoRefresh: true, background: true }).then(function () {
            if (pollPlatform === platform) scheduleNext();
          });
        }, delay);
      }
      scheduleNext();
    }

    function refreshAfterAuthorizationFocus() {
      var platform = awaitingAuthorizationPlatform;
      if (!platform) return;
      log('connect:focus_refresh', { platform: platform });
      loadStatus(platform, { force: true, background: true }).then(function (result) {
        if (awaitingAuthorizationPlatform === platform && !hasUsableConnection(result) && !(result && (result.error || result.reconnectRequired))) {
          startAutoRefresh(platform);
        }
      });
    }

    function sourcesForRow(row) {
      return row ? Array.prototype.map.call(row.querySelectorAll('input[type="checkbox"]:checked'), function (input) {
        var currency = row.querySelector('[data-source-currency="' + CSS.escape(input.value) + '"]');
        return { id: input.value, currency: currency ? currency.value : '' };
      }) : [];
    }

    function mappingRowForAccount(accountId, platform) {
      var card = mount.querySelector('[data-marketing-platform="' + CSS.escape(platform || 'tiktok') + '"]');
      return (card || mount).querySelector('[data-marketing-map-row="' + CSS.escape(accountId || selectedAccountId) + '"]');
    }

    function missingCurrency(payloads) {
      return payloads.some(function (payload) {
        return payload.sourceAccounts.some(function (source) { return !source.currency; });
      });
    }

    function platformOfButton(button) {
      var card = button && button.closest ? button.closest('[data-marketing-platform]') : null;
      return card ? (card.getAttribute('data-marketing-platform') || 'tiktok') : (button && (button.getAttribute('data-marketing-save-all') || button.getAttribute('data-marketing-release') || button.getAttribute('data-marketing-claim') || button.getAttribute('data-marketing-connect') || button.getAttribute('data-marketing-sync') || button.getAttribute('data-marketing-sync-all') || button.getAttribute('data-marketing-full-sync') || button.getAttribute('data-marketing-full-sync-all') || button.getAttribute('data-marketing-refresh')) || 'tiktok');
    }

    function saveMapping(button) {
      var targetId = button.getAttribute('data-marketing-save-map') || '';
      var platform = platformOfButton(button);
      var label = platformLabel(platform);
      var card = button.closest('[data-marketing-platform]');
      var row = (card || mount).querySelector('[data-marketing-map-row="' + CSS.escape(targetId) + '"]');
      var sourceAccounts = sourcesForRow(row);
      if (missingCurrency([{ sourceAccounts: sourceAccounts }])) {
        store.set(Object.assign({}, state(platform), { loading: false, error: tr('marketing.currencyRequired', 'Select a currency for every assigned ' + label + ' account.').replace(/\{platform\}/g, label) }), selectedAccountId, platform);
        render();
        return Promise.resolve();
      }
      log('mapping:save_started', { dashboardAccountId: targetId, platform: platform, selectedCount: sourceAccounts.length });
      setBusy(tr('marketing.loadingSave', 'Saving mapping...'), platform);
      return window.api.saveMarketingMapping(targetId, platform, sourceAccounts).then(function (result) {
        busyLabel = '';
        log('mapping:save_finished', {
          platform: platform,
          dashboardAccountId: targetId,
          ok: !!(result && result.ok),
          selectedCount: sourceAccounts.length,
          error: result && result.error || ''
        });
        store.set(result && result.ok ? result : Object.assign({}, state(platform), {
          loading: false,
          error: result && result.error || tr('marketing.mappingFailed', 'Unable to save mapping.')
        }), selectedAccountId, platform);
        render();
        if (result && result.ok && !(result.cache && result.cache.unchanged)) {
          return loadStatus(platform, { force: true });
        }
      });
    }

    function saveAllMappings(platform) {
      platform = platform || 'tiktok';
      var label = platformLabel(platform);
      var card = mount.querySelector('[data-marketing-platform="' + CSS.escape(platform) + '"]');
      var rows = Array.prototype.slice.call((card || mount).querySelectorAll('[data-marketing-map-row]'));
      var payloads = rows.map(function (row) {
        return {
          dashboardAccountId: row.getAttribute('data-marketing-map-row') || '',
          dashboardAccountKey: row.getAttribute('data-marketing-map-key') || '',
          sourceAccounts: sourcesForRow(row)
        };
      }).filter(function (mapping) { return !!mapping.dashboardAccountId; });
      if (missingCurrency(payloads)) {
        store.set(Object.assign({}, state(platform), { loading: false, error: tr('marketing.currencyRequired', 'Select a currency for every assigned ' + label + ' account.').replace(/\{platform\}/g, label) }), selectedAccountId, platform);
        render();
        return Promise.resolve();
      }

      log('mapping:save_all_started', { platform: platform, accountCount: payloads.length });
      setBusy(tr('marketing.loadingSaveAll', 'Saving all mappings...'), platform);
      return window.api.saveAllMarketingMappings(platform, payloads).then(function (result) {
        if (!result || !result.ok) throw new Error(result && result.error || tr('marketing.mappingFailed', 'Unable to save mapping.'));
        log('mapping:save_all_finished', { platform: platform, accountCount: payloads.length, ok: true });
        busyLabel = '';
        store.set(result, selectedAccountId, platform);
        render();
        if (!(result.cache && result.cache.unchanged)) return loadStatus(platform, { force: true });
      }).catch(function (error) {
        busyLabel = '';
        log('mapping:save_all_finished', { platform: platform, accountCount: payloads.length, ok: false, error: error.message || String(error) });
        store.set(Object.assign({}, state(platform), {
          loading: false,
          error: error.message || tr('marketing.mappingFailed', 'Unable to save mapping.')
        }), selectedAccountId, platform);
        render();
      });
    }

    function bind() {
      var connectButtons = mount.querySelectorAll('[data-marketing-connect]');
      var syncButtons = mount.querySelectorAll('[data-marketing-sync], [data-marketing-full-sync]');
      var syncAllButtons = mount.querySelectorAll('[data-marketing-sync-all], [data-marketing-full-sync-all]');
      var refreshButtons = mount.querySelectorAll('[data-marketing-refresh]');
      var saveAllButtons = mount.querySelectorAll('[data-marketing-save-all]');
      var saveButtons = mount.querySelectorAll('[data-marketing-save-map]');
      var claimButtons = mount.querySelectorAll('[data-marketing-claim]');
      var releaseButtons = mount.querySelectorAll('[data-marketing-release]');

      Array.prototype.forEach.call(connectButtons, function (connectButton) {
        connectButton.addEventListener('click', function () {
          var platform = platformOfButton(connectButton);
          log('button:connect', { accountId: selectedAccountId, platform: platform });
          connectButton.disabled = true;
          connectButton.textContent = tr('marketing.loadingConnect', 'Connecting securely...');
          setBusy(tr('marketing.loadingConnect', 'Connecting securely...'), platform);
          window.api.connectMarketing(selectedAccountId, platform).then(function (result) {
            busyLabel = '';
            log('connect:finished', result || {});
            invalidateStatus(selectedAccountId, platform);
            store.set(result, selectedAccountId, platform);
            render();
            if (result && result.ok && result.authorizationUrl) {
              awaitingAuthorizationPlatform = platform;
              startAutoRefresh(platform);
            }
            if (result && result.authorizationUrl && typeof window.api.openExternalUrl === 'function') {
              window.api.openExternalUrl(result.authorizationUrl);
            }
          }).catch(function (error) {
            busyLabel = '';
            log('connect:failed', { platform: platform, error: error && error.message || String(error) });
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: error && error.message || tr('marketing.requestFailed', 'Marketing connection request failed.')
            }), selectedAccountId, platform);
            render();
          });
        });
      });

      Array.prototype.forEach.call(saveButtons, function (button) {
        button.addEventListener('click', function () {
          saveMapping(button);
        });
      });

      Array.prototype.forEach.call(claimButtons, function (claimButton) {
        claimButton.addEventListener('click', function () {
          var platform = platformOfButton(claimButton);
          var card = claimButton.closest('[data-marketing-platform]');
          var input = (card || mount).querySelector('[data-marketing-claim-input="' + CSS.escape(platform) + '"]');
          var sourceAccountId = input ? String(input.value || '').trim() : '';
          if (!sourceAccountId) {
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: tr('marketing.sourceAccountIdRequired', 'Paste the ad account ID first.')
            }), selectedAccountId, platform);
            render();
            return;
          }
          if (!window.api || typeof window.api.claimMarketingSourceAccount !== 'function') {
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: tr('marketing.claimApiMissing', 'Claim account is not available in this app build yet.')
            }), selectedAccountId, platform);
            render();
            return;
          }
          log('button:claim', { accountId: selectedAccountId, platform: platform, sourceAccountId: sourceAccountId });
          claimButton.disabled = true;
          setBusy(tr('marketing.loadingClaim', 'Claiming ad account...'), platform);
          window.api.claimMarketingSourceAccount(selectedAccountId, platform, sourceAccountId).then(function (result) {
            busyLabel = '';
            log('claim:finished', result || {});
            if (result && result.ok) invalidateStatus(selectedAccountId, platform);
            store.set(result, selectedAccountId, platform);
            render();
            if (result && result.ok) return loadStatus(platform, { force: true });
          }).catch(function (error) {
            busyLabel = '';
            log('claim:failed', { platform: platform, error: error && error.message || String(error) });
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: error && error.message || tr('marketing.claimFailed', 'Unable to claim ad account.')
            }), selectedAccountId, platform);
            render();
          });
        });
      });

      Array.prototype.forEach.call(releaseButtons, function (releaseButton) {
        releaseButton.addEventListener('click', function () {
          var platform = platformOfButton(releaseButton);
          var card = releaseButton.closest('[data-marketing-platform]');
          var select = (card || mount).querySelector('[data-marketing-release-select="' + CSS.escape(platform) + '"]');
          var value = select ? String(select.value || '') : '';
          var parts = value.split('|');
          var targetAccountId = parts.length > 1 ? decodeURIComponent(parts[0] || '') : selectedAccountId;
          var sourceAccountId = parts.length > 1 ? decodeURIComponent(parts[1] || '') : decodeURIComponent(parts[0] || '');
          if (!targetAccountId || !sourceAccountId) {
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: tr('marketing.releaseAccountRequired', 'Select an assigned ad account to release.')
            }), selectedAccountId, platform);
            render();
            return;
          }
          if (!window.api || typeof window.api.releaseMarketingSourceAccount !== 'function') {
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: tr('marketing.releaseApiMissing', 'Release account is not available in this app build yet.')
            }), selectedAccountId, platform);
            render();
            return;
          }
          var confirmed = window.confirm(tr('marketing.releaseConfirm', 'Release this ad account from this app? It will stop syncing here and free one slot.'));
          if (!confirmed) return;
          log('button:release', { accountId: targetAccountId, platform: platform, sourceAccountId: sourceAccountId });
          releaseButton.disabled = true;
          setBusy(tr('marketing.loadingRelease', 'Releasing ad account...'), platform);
          window.api.releaseMarketingSourceAccount(targetAccountId, platform, sourceAccountId).then(function (result) {
            busyLabel = '';
            log('release:finished', result || {});
            if (result && result.ok) {
              invalidateStatus(selectedAccountId, platform);
              if (targetAccountId !== selectedAccountId) invalidateStatus(targetAccountId, platform);
            }
            store.set(result, selectedAccountId, platform);
            if (targetAccountId !== selectedAccountId && result && result.ok) store.set(result, targetAccountId, platform);
            if (result && result.ok) return loadStatus(platform, { force: true });
            render();
          }).catch(function (error) {
            busyLabel = '';
            log('release:failed', { platform: platform, error: error && error.message || String(error) });
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: error && error.message || tr('marketing.releaseFailed', 'Unable to release ad account.')
            }), selectedAccountId, platform);
            render();
          });
        });
      });

      function applyDraftLocks() {
        Array.prototype.forEach.call(mount.querySelectorAll('[data-marketing-platform]'), function (card) {
          var platform = card.getAttribute('data-marketing-platform') || 'tiktok';
          var owners = {};
          var persistedMappings = state(platform).mappings || {};
          Object.keys(persistedMappings).forEach(function (ownerId) {
            (Array.isArray(persistedMappings[ownerId]) ? persistedMappings[ownerId] : []).forEach(function (source) {
              var sourceId = String(source && source.id || '');
              if (sourceId && !owners[sourceId]) owners[sourceId] = ownerId;
            });
          });
          Array.prototype.forEach.call(card.querySelectorAll('[data-marketing-map-row]'), function (row) {
            var ownerId = row.getAttribute('data-marketing-map-row') || '';
            Array.prototype.forEach.call(row.querySelectorAll('.marketing-mapping-choice input[type="checkbox"]:checked'), function (input) {
              if (!owners[input.value]) owners[input.value] = ownerId;
            });
          });
          Array.prototype.forEach.call(card.querySelectorAll('[data-marketing-map-row]'), function (row) {
            var ownerId = row.getAttribute('data-marketing-map-row') || '';
            var ownerAccount = shownAccounts.concat(taagerAccounts).filter(function (account) {
              return accountOwnsMappingKey(account, ownerId);
            })[0] || ownerId;
            Array.prototype.forEach.call(row.querySelectorAll('.marketing-mapping-choice input[type="checkbox"]'), function (input) {
              var locked = !!owners[input.value] && !accountOwnsMappingKey(ownerAccount, owners[input.value]);
              input.disabled = locked;
              var currencySelect = row.querySelector('[data-source-currency="' + CSS.escape(input.value) + '"]');
              if (currencySelect) currencySelect.disabled = locked;
            });
          });
        });
      }

      Array.prototype.forEach.call(mount.querySelectorAll('.marketing-mapping-choice input[type="checkbox"]'), function (input) {
        input.addEventListener('change', function () {
          if (input.checked) {
            Array.prototype.forEach.call(mount.querySelectorAll('.marketing-mapping-choice input[type="checkbox"]'), function (other) {
              if (other !== input && other.value === input.value && platformOfButton(other) === platformOfButton(input)) other.checked = false;
            });
          }
          applyDraftLocks();
        });
      });
      applyDraftLocks();

      Array.prototype.forEach.call(saveAllButtons, function (saveAllButton) {
        saveAllButton.addEventListener('click', function () {
          saveAllMappings(platformOfButton(saveAllButton));
        });
      });

      Array.prototype.forEach.call(syncButtons, function (syncButton) {
        syncButton.addEventListener('click', function () {
          var platform = platformOfButton(syncButton);
          var fullRefresh = syncButton.hasAttribute('data-marketing-full-sync');
          if (fullRefresh && !window.confirm(tr('marketing.fullRefreshConfirm', 'Refresh every selected date from the ad platform? This uses more provider requests.'))) return;
          log('button:sync', { accountId: selectedAccountId, platform: platform });
          var sourceAccounts = sourcesForRow(mappingRowForAccount(selectedAccountId, platform));
          if (!sourceAccounts.length) {
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: tr('marketing.mappingRequired', 'Assign an ad account before syncing.')
            }), selectedAccountId, platform);
            render();
            return;
          }
          if (missingCurrency([{ sourceAccounts: sourceAccounts }])) {
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: tr('marketing.currencyRequired', 'Select a currency for every assigned ' + platformLabel(platform) + ' account.').replace(/\{platform\}/g, platformLabel(platform))
            }), selectedAccountId, platform);
            render();
            return;
          }
          setBusy(tr('marketing.loadingSync', 'Syncing marketing data...'), platform);
          var period = fullData && fullData.meta && fullData.meta.period || {};
          var roi = window.DashboardRoiState ? window.DashboardRoiState.get(selectedAccountId, {}) : {};
          var syncPayload = {
            dateFrom: period.from || period.dateFrom || period.start || '',
            dateTo: period.to || period.dateTo || period.end || '',
            targetCurrency: roi.currency || window.dashboardActiveCurrency || 'SAR',
            egpRate: roi.egpRate || 52,
            sourceAccounts: sourceAccounts,
            mode: fullRefresh ? 'full' : 'incremental'
          };
          var syncRequest = store && typeof store.sync === 'function'
            ? store.sync(selectedAccountId, syncPayload, platform)
            : window.api.syncMarketingData(selectedAccountId, platform, syncPayload);
          syncRequest.then(function (result) {
            busyLabel = '';
            log('sync:finished', result || {});
            if (!store || typeof store.sync !== 'function') store.set(result, selectedAccountId, platform);
            render();
            if (result && result.ok && window.DashboardRoiState && typeof window.DashboardRoiState.notify === 'function') {
              window.DashboardRoiState.notify();
            }
          });
        });
      });

      Array.prototype.forEach.call(syncAllButtons, function (syncAllButton) {
        syncAllButton.addEventListener('click', function () {
          var platform = platformOfButton(syncAllButton);
          var fullRefresh = syncAllButton.hasAttribute('data-marketing-full-sync-all');
          if (fullRefresh && !window.confirm(tr('marketing.fullRefreshConfirm', 'Refresh every selected date from the ad platform? This uses more provider requests.'))) return;
          var label = platformLabel(platform);
          var period = fullData && fullData.meta && fullData.meta.period || {};
          var accountSettings = taagerAccounts.map(function (account) {
            var roi = window.DashboardRoiState ? window.DashboardRoiState.get(account.id, {}) : {};
            var nativeCurrency = account.taagerCountry && window.TaagerCountry && window.TaagerCountry.currency
              ? window.TaagerCountry.currency(account.taagerCountry)
              : (roi.currency || window.dashboardActiveCurrency || 'SAR');
            return { dashboardAccountId: account.id, dashboardAccountKey: account.key, dashboardAccountKeys: account.keys || [account.key], currency: roi.currency || nativeCurrency, egpRate: roi.egpRate || 52 };
          });
          var mappings = taagerAccounts.map(function (account) {
            return {
              dashboardAccountId: account.id,
              dashboardAccountKey: account.key,
              sourceAccounts: sourcesForRow(mappingRowForAccount(account.id, platform))
            };
          }).filter(function (mapping) { return mapping.sourceAccounts.length; });
          if (missingCurrency(mappings)) {
            store.set(Object.assign({}, state(platform), {
              loading: false,
              error: tr('marketing.currencyRequired', 'Select a currency for every assigned ' + label + ' account.').replace(/\{platform\}/g, label)
            }), selectedAccountId, platform);
            render();
            return;
          }
          log('button:sync_all', { platform: platform, accountCount: accountSettings.length });
          setBusy(tr('marketing.loadingSyncAll', 'Syncing all accounts...'), platform);
          window.api.syncAllMarketingData(platform, {
            dateFrom: period.from || period.dateFrom || period.start || '',
            dateTo: period.to || period.dateTo || period.end || '',
            accountSettings: accountSettings,
            mappings: mappings,
            mode: fullRefresh ? 'full' : 'incremental'
          }).then(function (result) {
            busyLabel = '';
            log('sync_all:finished', result || {});
            if (result && result.ok && result.accountStatuses) {
              Object.keys(result.accountStatuses).forEach(function (accountId) {
                store.set(result.accountStatuses[accountId], accountId, platform);
              });
            }
            store.set(result, selectedAccountId, platform);
            render();
          });
        });
      });

      Array.prototype.forEach.call(refreshButtons, function (refreshButton) {
        refreshButton.addEventListener('click', function () {
          var platform = platformOfButton(refreshButton);
          log('button:refresh', { accountId: selectedAccountId, platform: platform, status: state(platform).status });
          loadStatus(platform, { force: true });
        });
      });
    }

    var listener = function (status) {
      if (ctx && ctx.sectionId && ctx.sectionId !== 'marketing') return;
      if (String(status.accountId) !== String(selectedAccountId)) return;
      log('store:notified_update', { platform: status.platform, loading: status.loading });
      render();
    };
    if (store && typeof store.subscribe === 'function') {
      store.subscribe(listener);
    }

    log('section:mounted', { accountId: selectedAccountId, allMode: allMode, shownAccounts: shownAccounts.length });
    window.addEventListener('focus', refreshAfterAuthorizationFocus);
    render();
    LIVE_PLATFORMS.forEach(function (platform) { loadStatus(platform.id, { cached: true }); });

    return function cleanupMarketingConnections() {
      window.removeEventListener('focus', refreshAfterAuthorizationFocus);
      stopAutoRefresh('cleanup');
      if (store && typeof store.unsubscribe === 'function') {
        store.unsubscribe(listener);
      }
    };
  };
})();
