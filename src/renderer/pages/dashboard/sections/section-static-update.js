(function () {
  'use strict';

  var state = window.StaticDashboardUpdateState = window.StaticDashboardUpdateState || { accounts: {}, busy: false, results: [] };

  function tr(key, fallback) {
    return window.dashboardI18n && typeof window.dashboardI18n.t === 'function'
      ? window.dashboardI18n.t(key)
      : fallback;
  }

  function esc(value) {
    return window.TaagerUI ? window.TaagerUI.esc(value) : String(value == null ? '' : value);
  }

  function period() {
    return window.DashboardPeriodState && window.DashboardPeriodState.get ? window.DashboardPeriodState.get() : {};
  }

  function accountCredentials(id) {
    return (window._kbotAccounts || []).find(function (account) { return account && account.id === id; }) || {};
  }

  function visibleAccounts(data) {
    var meta = data && data.meta || {};
    var activeId = String(meta.activeAccountId || '__all__');
    var options = (meta.accountOptions || window.dashboardAccountsList || []).filter(function (account) {
      return account && account.id && account.id !== '__all__';
    });
    return activeId === '__all__' ? options : options.filter(function (account) { return account.id === activeId; });
  }

  function accountState(id) {
    if (!state.accounts[id]) state.accounts[id] = { taager: null, easy: null, inspection: null, error: '', inspecting: false };
    return state.accounts[id];
  }

  function filePayload(account, allowSuspiciousReplacement) {
    var item = accountState(account.id);
    var range = period();
    return {
      accountId: account.id,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      taagerBuffer: item.taager && item.taager.buffer,
      easyOrdersBuffer: item.easy && item.easy.buffer,
      allowSuspiciousReplacement: allowSuspiciousReplacement === true
    };
  }

  function readFile(file) {
    return file.arrayBuffer().then(function (buffer) {
      return { name: file.name, size: file.size, buffer: new Uint8Array(buffer) };
    });
  }

  function resultText(item) {
    if (item.inspecting) return tr('static.inspecting', 'Checking workbook...');
    if (item.error) return item.error;
    if (!item.inspection) return tr('static.waiting', 'Upload a Taager sheet to inspect it.');
    var inspection = item.inspection;
    if (inspection.periodMismatch || inspection.canApply === false) return tr('static.periodMismatch', 'Sheet dates do not match the selected period.');
    var text = (inspection.orders || 0) + ' ' + tr('static.orders', 'orders') + ' / ' + (inspection.rows || 0) + ' ' + tr('static.rows', 'item rows');
    if (inspection.requiresConfirmation) text += ' - ' + tr('static.confirmationRequired', 'confirmation required');
    return text;
  }

  function renderCard(account) {
    var item = accountState(account.id);
    var creds = accountCredentials(account.id);
    var easyEnabled = creds.dashboardEnrichmentProvider === 'easyorders';
    var warning = item.inspection && item.inspection.warnings && item.inspection.warnings.length
      ? '<div class="static-update-warning">' + item.inspection.warnings.map(esc).join('<br>') + '</div>'
      : '';
    return '<article class="static-update-card" data-static-account="' + esc(account.id) + '">' +
      '<div class="static-update-card-head"><div><strong>' + esc(account.label || account.name || account.id) + '</strong><span>' + esc(account.email || account.taagerCountry || '') + '</span></div>' +
      '<span class="static-update-country">' + esc(String(account.taagerCountry || 'sa').toUpperCase()) + '</span></div>' +
      '<div class="static-update-files">' +
        '<label class="static-file-box"><span>' + tr('static.taagerSheet', 'Taager sheet') + ' *</span><strong>' + esc(item.taager ? item.taager.name : tr('static.chooseFile', 'Choose Excel file')) + '</strong>' +
          '<input type="file" accept=".xlsx,.xls" data-static-file="taager" data-account-id="' + esc(account.id) + '"></label>' +
        '<label class="static-file-box"><span>' + tr('static.easySheet', 'Easy Orders sheet') + (easyEnabled ? ' (' + tr('static.recommended', 'recommended') + ')' : '') + '</span><strong>' + esc(item.easy ? item.easy.name : tr('static.chooseFile', 'Choose Excel file')) + '</strong>' +
          '<input type="file" accept=".xlsx,.xls" data-static-file="easy" data-account-id="' + esc(account.id) + '"></label>' +
      '</div>' +
      '<div class="static-update-status ' + (item.error ? 'is-error' : item.inspection ? 'is-ready' : '') + '">' + esc(resultText(item)) + '</div>' +
      warning +
    '</article>';
  }

  function render(mount, data, ctx) {
    var accounts = visibleAccounts(data);
    var range = period();
    var periodKey = String(range.dateFrom || '') + '|' + String(range.dateTo || '');
    if (state.periodKey && state.periodKey !== periodKey) {
      Object.keys(state.accounts).forEach(function (id) {
        state.accounts[id].inspection = null;
        state.accounts[id].error = '';
      });
      state.results = [];
    }
    state.periodKey = periodKey;
    var results = state.results.length ? '<div class="static-update-results">' + state.results.map(function (result) {
      return '<div class="static-result ' + (result.ok ? 'is-success' : result.skipped ? 'is-skipped' : 'is-error') + '"><strong>' + esc(result.label) + '</strong><span>' + esc(result.message) + '</span></div>';
    }).join('') + '</div>' : '';
    mount.innerHTML = '<section class="static-update-section">' +
      '<header class="static-update-hero"><div><span class="static-update-kicker">' + tr('static.kicker', 'Offline dashboard import') + '</span><h2>' + tr('static.title', 'Static Update') + '</h2>' +
      '<p>' + tr('static.subtitle', 'Upload exported sheets and update saved dashboard data without opening Chrome.') + '</p></div>' +
      '<div class="static-update-period"><span>' + tr('static.selectedPeriod', 'Selected dashboard period') + '</span><strong>' + esc(range.dateFrom || '--') + ' - ' + esc(range.dateTo || '--') + '</strong></div></header>' +
      '<div class="static-update-note">' + tr('static.rangeNote', 'Only rows inside the selected dashboard period will be replaced. Taager is the order and profit source; Easy Orders only enriches product names and payment methods.') + '</div>' +
      '<div class="static-update-grid">' + accounts.map(renderCard).join('') + '</div>' +
      results +
      '<div class="static-update-actions"><span>' + tr('static.memoryNote', 'Uploaded workbooks stay in memory and are not saved to disk.') + '</span>' +
      '<button type="button" class="btn btn-primary" id="static-update-apply" ' + (state.busy || !accounts.some(function (account) { return !!accountState(account.id).taager; }) ? 'disabled' : '') + '>' +
      (state.busy ? tr('static.updating', 'Updating...') : tr('static.updateReady', 'Update ready accounts')) + '</button></div>' +
    '</section>';

    mount.querySelectorAll('[data-static-file]').forEach(function (input) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        var id = input.getAttribute('data-account-id');
        var kind = input.getAttribute('data-static-file');
        if (!file || !id) return;
        readFile(file).then(function (loaded) {
          var item = accountState(id);
          item[kind] = loaded;
          item.error = '';
          item.inspection = null;
          render(mount, data, ctx);
          var account = accounts.find(function (entry) { return entry.id === id; });
          if (kind === 'taager' && account) inspectAccount(account, mount, data, ctx);
          else if (accountState(id).taager && account) inspectAccount(account, mount, data, ctx);
        }).catch(function (error) {
          accountState(id).error = error.message;
          render(mount, data, ctx);
        });
      });
    });
    mount.querySelector('#static-update-apply')?.addEventListener('click', function () {
      applyReady(accounts, mount, data, ctx);
    });
  }

  function inspectAccount(account, mount, data, ctx) {
    var item = accountState(account.id);
    if (!item.taager || item.inspecting) return Promise.resolve(null);
    item.inspecting = true;
    item.error = '';
    render(mount, data, ctx);
    return window.api.inspectStaticDashboardUpdate(filePayload(account, false)).then(function (result) {
      item.inspecting = false;
      if (!result || !result.ok) {
        item.inspection = null;
        item.error = result && result.error || tr('static.inspectFailed', 'Workbook inspection failed.');
      } else {
        item.inspection = result;
      }
      render(mount, data, ctx);
      return result;
    }).catch(function (error) {
      item.inspecting = false;
      item.error = error.message;
      render(mount, data, ctx);
      return null;
    });
  }

  function confirmationMessage(prepared) {
    return prepared.map(function (entry) {
      var validation = entry.result.validation || {};
      return entry.account.label + ': ' +
        (validation.existing && validation.existing.rawOrders || 0) + ' -> ' +
        (validation.incoming && validation.incoming.rawOrders || 0) + ' ' + tr('static.orders', 'orders');
    }).join('\n');
  }

  async function applyReady(accounts, mount, data, ctx) {
    var ready = accounts.filter(function (account) { return !!accountState(account.id).taager; });
    if (!ready.length || state.busy) return;
    state.busy = true;
    state.results = accounts.filter(function (account) { return !accountState(account.id).taager; }).map(function (account) {
      return { ok: false, skipped: true, label: account.label || account.id, message: tr('static.skipped', 'Skipped: no Taager sheet uploaded.') };
    });
    render(mount, data, ctx);

    var inspected = [];
    for (var i = 0; i < ready.length; i++) {
      var inspection = await window.api.inspectStaticDashboardUpdate(filePayload(ready[i], false));
      if (inspection && inspection.ok && inspection.canApply !== false) inspected.push({ account: ready[i], result: inspection });
      else if (inspection && inspection.ok && inspection.canApply === false) state.results.push({
        ok: false,
        label: ready[i].label || ready[i].id,
        message: inspection.blockedReason || tr('static.periodMismatchHelp', 'Select the dashboard period that matches the uploaded sheet, then update again.')
      });
      else state.results.push({ ok: false, label: ready[i].label || ready[i].id, message: inspection && inspection.error || tr('static.inspectFailed', 'Workbook inspection failed.') });
    }
    var risky = inspected.filter(function (entry) { return entry.result.requiresConfirmation; });
    var allowRisky = false;
    if (risky.length) {
      allowRisky = await window.TaagerUI.confirm({
        title: tr('static.confirmTitle', 'Confirm dashboard replacement'),
        message: tr('static.confirmBody', 'Some uploads contain fewer or zero orders for the selected period. Review the counts, then confirm replacement.') + '\n\n' + confirmationMessage(risky),
        confirmText: tr('static.confirmAction', 'Replace selected period'),
        danger: true
      });
    }

    for (var j = 0; j < inspected.length; j++) {
      var entry = inspected[j];
      if (entry.result.requiresConfirmation && !allowRisky) {
        state.results.push({ ok: false, skipped: true, label: entry.account.label || entry.account.id, message: tr('static.confirmSkipped', 'Skipped because replacement was not confirmed.') });
        continue;
      }
      var applied = await window.api.applyStaticDashboardUpdate(filePayload(entry.account, allowRisky));
      if (applied && applied.ok && applied.saved) {
        state.results.push({ ok: true, label: entry.account.label || entry.account.id, message: (applied.orders || 0) + ' ' + tr('static.ordersUpdated', 'orders updated') });
        accountState(entry.account.id).inspection = applied;
      } else {
        state.results.push({ ok: false, label: entry.account.label || entry.account.id, message: applied && applied.error || tr('static.applyFailed', 'Static update failed.') });
      }
    }
    state.busy = false;
    if (state.results.some(function (result) { return result.ok; })) {
      if (window.invalidateDashboardCache) window.invalidateDashboardCache();
      if (ctx && ctx.options && typeof ctx.options.onStaticUpdateComplete === 'function') ctx.options.onStaticUpdateComplete();
      if (window.TaagerUI) window.TaagerUI.toast(tr('static.complete', 'Static dashboard update complete.'), { kind: 'success' });
    }
    render(mount, data, ctx);
  }

  window.renderSectionStaticUpdate = function (mount, data, ctx) {
    render(mount, data, ctx || {});
  };
})();
