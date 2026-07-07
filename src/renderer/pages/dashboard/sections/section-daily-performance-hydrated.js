// section-daily-performance-hydrated.js - cached Daily Performance renderer.
window.renderSectionDailyPerformanceHydratedEntry = function (mountEl, data, ctx) {
  'use strict';

  var cancelled = false;
  var fullData = (ctx && ctx.data) || data || {};
  var activeCurrency = (fullData.meta && fullData.meta.activeCurrency) || window.dashboardActiveCurrency || 'SAR';
  var PAGE_SIZE = 7;
  var accountPage = Math.max(1, Number(mountEl._dailyPerformanceAccountPage) || 1);
  var productPage = Math.max(1, Number(mountEl._dailyPerformanceProductPage) || 1);
  var accountPanelOpen = mountEl._dailyPerformanceAccountOpen !== false;
  var productPanelOpen = mountEl._dailyPerformanceProductOpen === true;
  var requestSeq = 0;

  function isRtl() {
    return window.dashboardI18n ? window.dashboardI18n.isRtl() : false;
  }

  function pick(en, ar) {
    return window.dashboardI18n && typeof window.dashboardI18n.pick === 'function'
      ? window.dashboardI18n.pick(en, ar)
      : (isRtl() ? ar : en);
  }

  function tr(key, fallback) {
    var value = window.dashboardI18n ? window.dashboardI18n.t(key) : key;
    return value && value !== key ? value : fallback;
  }

  function esc(value) {
    if (window.TaagerUI && typeof window.TaagerUI.esc === 'function') return window.TaagerUI.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function icon(name) {
    return window.icon ? window.icon(name, { size: 15, color: 'currentColor' }) : '';
  }

  function num(value, decimals) {
    value = Number(value || 0);
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  }

  function money(value) {
    if (window.formatDashboardMoney) return window.formatDashboardMoney(Number(value || 0), activeCurrency, 2);
    return num(value, 2) + ' ' + activeCurrency;
  }

  function pct(value) {
    value = Number(value || 0);
    return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function toneFor(row) {
    row = row || {};
    if (Number(row.netOrders || 0) <= 0) return 'neutral';
    if (Number(row.netProfit || 0) < 0) return 'danger';
    if (Number(row.cpa || 0) > 0 && Number(row.breakEvenCpa || 0) > 0 && Number(row.cpa || 0) > Number(row.breakEvenCpa || 0)) return 'warn';
    if (Number(row.ndr || 0) >= 35 && Number(row.confirmationRate || 0) >= 65) return 'good';
    return 'info';
  }

  function verdict(row) {
    var tone = toneFor(row);
    if (tone === 'danger') return pick('Losing', '\u062e\u0627\u0633\u0631');
    if (tone === 'warn') return pick('CPA pressure', '\u0636\u063a\u0637 CPA');
    if (tone === 'good') return pick('Healthy', '\u0635\u062d\u064a');
    if (Number(row && row.netOrders || 0) <= 0) return pick('No orders', '\u0644\u0627 \u0637\u0644\u0628\u0627\u062a');
    return pick('Watch', '\u0631\u0627\u0642\u0628');
  }

  function productVerdict(row) {
    if (Number(row.netOrders || 0) < 3) return pick('Low sample', '\u0639\u064a\u0646\u0629 \u0642\u0644\u064a\u0644\u0629');
    if (Number(row.netProfit || 0) < 0) return pick('Review spend', '\u0631\u0627\u062c\u0639 \u0627\u0644\u0625\u0646\u0641\u0627\u0642');
    if (Number(row.confirmationRate || 0) < 45) return pick('Fix confirmation', '\u0623\u0635\u0644\u062d \u0627\u0644\u062a\u0623\u0643\u064a\u062f');
    if (Number(row.ndr || 0) < 20) return pick('Fix delivery', '\u0623\u0635\u0644\u062d \u0627\u0644\u062a\u0633\u0644\u064a\u0645');
    if (Number(row.cpa || 0) > 0 && Number(row.breakEvenCpa || 0) > 0 && Number(row.cpa || 0) <= Number(row.breakEvenCpa || 0)) return pick('Scale candidate', '\u0645\u0631\u0634\u062d \u0644\u0644\u062a\u0648\u0633\u0639');
    return pick('Watch', '\u0631\u0627\u0642\u0628');
  }

  function summaryCard(label, value, sub, tone) {
    return '<div class="dp-summary-card dp-tone-' + esc(tone || 'neutral') + '">' +
      '<span>' + esc(label) + '</span>' +
      '<strong>' + value + '</strong>' +
      '<small>' + esc(sub || '') + '</small>' +
    '</div>';
  }

  function sectionHeader(id, title, sub, open) {
    return '<button type="button" class="dp-panel-toggle" data-dp-panel-toggle="' + esc(id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="dp-panel-icon">' + icon(open ? 'chevronDown' : 'chevronDown') + '</span>' +
      '<span><strong>' + esc(title) + '</strong><small>' + esc(sub || '') + '</small></span>' +
    '</button>';
  }

  function platformChips(spend) {
    var rows = Object.keys(spend || {}).filter(function (key) { return Number(spend[key] || 0) > 0; });
    if (!rows.length) return '<span class="dp-empty-mini">' + esc(pick('No synced spend', '\u0644\u0627 \u064a\u0648\u062c\u062f \u0625\u0646\u0641\u0627\u0642 \u0645\u0632\u0627\u0645\u0646')) + '</span>';
    return rows.sort().map(function (key) {
      return '<span class="dp-chip"><bdi dir="auto">' + esc(key) + '</bdi><strong>' + esc(money(spend[key])) + '</strong></span>';
    }).join('');
  }

  function sourceChips(sources) {
    sources = Array.isArray(sources) ? sources.slice(0, 6) : [];
    if (!sources.length) return '<span class="dp-empty-mini">' + esc(pick('No source values', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0635\u0627\u062f\u0631')) + '</span>';
    return sources.map(function (source) {
      return '<span class="dp-chip"><bdi dir="auto">' + esc(source.label || 'Unknown') + '</bdi><strong>' + esc(num(source.netOrders || 0)) + '</strong></span>';
    }).join('');
  }

  function accountRow(day, index) {
    var m = day.metrics || {};
    var tone = toneFor(m);
    return '<tbody class="dp-day-group" data-dp-day-group="' + index + '">' +
      '<tr class="dp-account-row" data-dp-day-toggle="' + index + '">' +
        '<td><button type="button" class="dp-expand-btn" aria-expanded="false">' + icon('chevronDown') + '</button><strong>' + esc(day.date || '') + '</strong></td>' +
        '<td>' + num(m.netOrders || 0) + '</td>' +
        '<td>' + money(m.adSpend || 0) + '</td>' +
        '<td>' + money(m.cpa || 0) + '</td>' +
        '<td>' + num(m.confirmedOrders || 0) + ' <small>' + pct(m.confirmationRate) + '</small></td>' +
        '<td>' + num(m.deliveredOrders || 0) + ' <small>' + pct(m.ndr) + '</small></td>' +
        '<td>' + money(m.deliveredProfit || 0) + '</td>' +
        '<td class="' + (Number(m.netProfit || 0) >= 0 ? 'dp-good-text' : 'dp-danger-text') + '">' + money(m.netProfit || 0) + '</td>' +
        '<td><span class="dp-verdict dp-verdict-' + esc(tone) + '">' + esc(verdict(m)) + '</span></td>' +
      '</tr>' +
      '<tr class="dp-detail-row" hidden><td colspan="9">' +
        '<div class="dp-detail-grid">' +
          '<div><h4>' + esc(pick('Spend by platform', '\u0627\u0644\u0625\u0646\u0641\u0627\u0642 \u062d\u0633\u0628 \u0627\u0644\u0645\u0646\u0635\u0629')) + '</h4><div class="dp-chip-list">' + platformChips(day.platformSpend) + '</div></div>' +
          '<div><h4>' + esc(pick('Order sources', '\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u0637\u0644\u0628\u0627\u062a')) + '</h4><div class="dp-chip-list">' + sourceChips(day.sources) + '</div></div>' +
          '<div class="dp-status-strip">' +
            '<span>' + esc(pick('Failed', '\u0641\u0627\u0634\u0644')) + '<strong>' + num(m.failedOrders || 0) + '</strong></span>' +
            '<span>' + esc(pick('Pending', '\u0645\u0639\u0644\u0642')) + '<strong>' + num(m.pendingOrders || 0) + '</strong></span>' +
            '<span>' + esc(pick('Shipping', '\u0634\u062d\u0646')) + '<strong>' + num(m.shippingOrders || 0) + '</strong></span>' +
            '<span>' + esc(pick('Canceled by you', '\u0645\u0644\u063a\u064a \u0628\u0648\u0627\u0633\u0637\u062a\u0643')) + '<strong>' + num(m.canceledByYou || 0) + '</strong></span>' +
          '</div>' +
        '</div>' +
      '</td></tr>' +
    '</tbody>';
  }

  function productRows(day) {
    var products = Array.isArray(day.products) ? day.products : [];
    if (!products.length) {
      return '<tr><td colspan="10" class="dp-empty">' + esc(pick('No product rows for this day.', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0635\u0641\u0648\u0641 \u0645\u0646\u062a\u062c\u0627\u062a \u0644\u0647\u0630\u0627 \u0627\u0644\u064a\u0648\u0645.')) + '</td></tr>';
    }
    return products.map(function (p) {
      var tone = toneFor(p);
      var name = p.name || p.sku || 'Unknown Product';
      var sku = p.sku ? '<small dir="ltr">' + esc(p.sku) + '</small>' : '';
      return '<tr>' +
        '<td><bdi dir="auto">' + esc(name) + '</bdi>' + sku + '</td>' +
        '<td>' + num(p.netOrders || 0) + '</td>' +
        '<td>' + money(p.adSpend || 0) + '</td>' +
        '<td>' + money(p.cpa || 0) + '</td>' +
        '<td>' + num(p.confirmedOrders || 0) + ' <small>' + pct(p.confirmationRate) + '</small></td>' +
        '<td>' + num(p.deliveredOrders || 0) + ' <small>' + pct(p.ndr) + '</small></td>' +
        '<td>' + money(p.breakEvenCpa || 0) + '</td>' +
        '<td>' + money(p.deliveredProfit || 0) + '</td>' +
        '<td class="' + (Number(p.netProfit || 0) >= 0 ? 'dp-good-text' : 'dp-danger-text') + '">' + money(p.netProfit || 0) + '</td>' +
        '<td><span class="dp-verdict dp-verdict-' + esc(tone) + '">' + esc(productVerdict(p)) + '</span></td>' +
      '</tr>';
    }).join('');
  }

  function productDayRow(day, index) {
    var m = day.metrics || {};
    return '<tbody class="dp-product-day-group" data-dp-product-day-group="' + index + '">' +
      '<tr class="dp-product-day-row" data-dp-product-day-toggle="' + index + '">' +
        '<td><button type="button" class="dp-expand-btn" aria-expanded="false">' + icon('chevronDown') + '</button><strong>' + esc(day.date || '') + '</strong><small>' + esc(num(day.productCount || 0) + ' ' + pick('products', '\u0645\u0646\u062a\u062c')) + '</small></td>' +
        '<td>' + num(m.netOrders || 0) + '</td>' +
        '<td>' + money(m.adSpend || 0) + '</td>' +
        '<td>' + money(m.cpa || 0) + '</td>' +
        '<td>' + num(m.deliveredOrders || 0) + '</td>' +
        '<td>' + pct(m.ndr) + '</td>' +
        '<td class="' + (Number(m.netProfit || 0) >= 0 ? 'dp-good-text' : 'dp-danger-text') + '">' + money(m.netProfit || 0) + '</td>' +
      '</tr>' +
      '<tr class="dp-product-detail-row" hidden><td colspan="7">' +
        '<div class="dp-nested-table-wrap"><table class="dp-nested-table"><thead><tr>' +
          '<th>' + esc(pick('Product', '\u0627\u0644\u0645\u0646\u062a\u062c')) + '</th>' +
          '<th>' + esc(pick('Orders', '\u0627\u0644\u0637\u0644\u0628\u0627\u062a')) + '</th>' +
          '<th>' + esc(pick('Spend', '\u0627\u0644\u0625\u0646\u0641\u0627\u0642')) + '</th>' +
          '<th>CPA</th><th>' + esc(pick('Confirmed', '\u0645\u0624\u0643\u062f')) + '</th>' +
          '<th>' + esc(pick('Delivered', '\u0645\u0633\u0644\u0645')) + '</th>' +
          '<th>' + esc(pick('Break-even', '\u0627\u0644\u062a\u0639\u0627\u062f\u0644')) + '</th>' +
          '<th>' + esc(pick('Profit', '\u0627\u0644\u0631\u0628\u062d')) + '</th>' +
          '<th>P&L</th><th>' + esc(pick('Decision', '\u0627\u0644\u0642\u0631\u0627\u0631')) + '</th>' +
        '</tr></thead><tbody>' + productRows(day) + '</tbody></table></div>' +
      '</td></tr>' +
    '</tbody>';
  }

  function paginationHtml(part, pagination) {
    pagination = pagination || {};
    var totalPages = Math.max(1, Number(pagination.totalPages || 1));
    var page = Math.max(1, Math.min(totalPages, Number(pagination.page || 1)));
    if (totalPages <= 1) {
      return '<div class="dp-pagination dp-pagination-single"><span>' + esc(pick('Page 1 of 1', '\u0635\u0641\u062d\u0629 1 \u0645\u0646 1')) + '</span></div>';
    }
    var buttons = [];
    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, page + 2);
    if (start > 1) buttons.push({ page: 1, label: '1' });
    if (start > 2) buttons.push({ gap: true });
    for (var i = start; i <= end; i++) buttons.push({ page: i, label: String(i), active: i === page });
    if (end < totalPages - 1) buttons.push({ gap: true });
    if (end < totalPages) buttons.push({ page: totalPages, label: String(totalPages) });
    return '<div class="dp-pagination" role="navigation" aria-label="' + esc(pick('Daily Performance pages', '\u0635\u0641\u062d\u0627\u062a \u0627\u0644\u0623\u062f\u0627\u0621 \u0627\u0644\u064a\u0648\u0645\u064a')) + '">' +
      '<button type="button" data-dp-page-part="' + esc(part) + '" data-dp-page="' + Math.max(1, page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + '>' + esc(pick('Previous', '\u0627\u0644\u0633\u0627\u0628\u0642')) + '</button>' +
      buttons.map(function (item) {
        if (item.gap) return '<span class="dp-page-gap">...</span>';
        return '<button type="button" data-dp-page-part="' + esc(part) + '" data-dp-page="' + item.page + '" class="' + (item.active ? 'is-active' : '') + '" ' + (item.active ? 'aria-current="page"' : '') + '>' + esc(item.label) + '</button>';
      }).join('') +
      '<button type="button" data-dp-page-part="' + esc(part) + '" data-dp-page="' + Math.min(totalPages, page + 1) + '" ' + (page >= totalPages ? 'disabled' : '') + '>' + esc(pick('Next', '\u0627\u0644\u062a\u0627\u0644\u064a')) + '</button>' +
      '<span class="dp-page-count">' + esc(pick('Page', '\u0635\u0641\u062d\u0629')) + ' ' + num(page) + ' / ' + num(totalPages) + '</span>' +
    '</div>';
  }

  function renderModel(model) {
    var accountDays = Array.isArray(model && model.accountDays) ? model.accountDays : (Array.isArray(model && model.days) ? model.days : []);
    var productDays = Array.isArray(model && model.productDays) ? model.productDays : accountDays;
    var summary = model && model.summary || {};
    var accountPagination = model && model.accountPagination || model && model.pagination || { page: 1, totalPages: 1, total: accountDays.length };
    var productPagination = model && model.productPagination || { page: 1, totalPages: 1, total: productDays.length };
    activeCurrency = model && model.currency || activeCurrency;
    mountEl.innerHTML = '<section class="daily-performance-section" dir="' + (isRtl() ? 'rtl' : 'ltr') + '">' +
      '<div class="dp-header">' +
        '<div><p>' + esc(tr('nav.dailyPerformance', pick('Daily Performance', '\u0627\u0644\u0623\u062f\u0627\u0621 \u0627\u0644\u064a\u0648\u0645\u064a'))) + '</p><h2>' + esc(pick('Account and product calculator results per day', '\u0646\u062a\u0627\u0626\u062c \u062d\u0627\u0633\u0628\u0629 \u0627\u0644\u062d\u0633\u0627\u0628 \u0648\u0627\u0644\u0645\u0646\u062a\u062c \u064a\u0648\u0645\u0627 \u0628\u064a\u0648\u0645')) + '</h2></div>' +
        '<span class="dp-note">' + esc(pick('Read-only. Uses the selected dashboard period and calculator spend.', '\u0642\u0631\u0627\u0621\u0629 \u0641\u0642\u0637. \u064a\u0633\u062a\u062e\u062f\u0645 \u0641\u062a\u0631\u0629 \u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645 \u0648\u0625\u0646\u0641\u0627\u0642 \u0627\u0644\u062d\u0627\u0633\u0628\u0629.')) + '</span>' +
      '</div>' +
      '<div class="dp-summary-grid">' +
        summaryCard(pick('Days', '\u0627\u0644\u0623\u064a\u0627\u0645'), num(accountPagination.total || accountDays.length), pick('paginated daily rows', '\u0635\u0641\u0648\u0641 \u064a\u0648\u0645\u064a\u0629 \u0645\u0642\u0633\u0645\u0629'), 'info') +
        summaryCard(pick('Net orders', '\u0635\u0627\u0641\u064a \u0627\u0644\u0637\u0644\u0628\u0627\u062a'), num(summary.netOrders || 0), pick('raw minus canceled by you', '\u0627\u0644\u062e\u0627\u0645 \u0646\u0627\u0642\u0635 \u0645\u0644\u063a\u064a \u0628\u0648\u0627\u0633\u0637\u062a\u0643'), 'neutral') +
        summaryCard(pick('Ad spend', '\u0627\u0644\u0625\u0646\u0641\u0627\u0642'), money(summary.adSpend || 0), money(summary.cpa || 0) + ' CPA', 'info') +
        summaryCard(pick('Delivered', '\u0627\u0644\u0645\u0633\u0644\u0645'), num(summary.deliveredOrders || 0), pct(summary.ndr) + ' NDR', 'good') +
        summaryCard('P&L', money(summary.netProfit || 0), pct(summary.roi) + ' ROI', Number(summary.netProfit || 0) >= 0 ? 'good' : 'danger') +
      '</div>' +
      '<div class="dp-panel ' + (accountPanelOpen ? 'is-open' : '') + '" data-dp-panel="account">' +
        sectionHeader('account', pick('Daily Account Performance', '\u0623\u062f\u0627\u0621 \u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u064a\u0648\u0645\u064a'), pick('Account Calculator metrics without changing the date filter.', '\u0645\u0624\u0634\u0631\u0627\u062a \u062d\u0627\u0633\u0628\u0629 \u0627\u0644\u062d\u0633\u0627\u0628 \u0628\u062f\u0648\u0646 \u062a\u063a\u064a\u064a\u0631 \u0641\u0644\u062a\u0631 \u0627\u0644\u062a\u0627\u0631\u064a\u062e.'), accountPanelOpen) +
        '<div class="dp-panel-body" ' + (accountPanelOpen ? '' : 'hidden') + '><div class="dp-table-wrap"><table class="dp-table"><thead><tr>' +
          '<th>' + esc(pick('Date', '\u0627\u0644\u062a\u0627\u0631\u064a\u062e')) + '</th><th>' + esc(pick('Orders', '\u0627\u0644\u0637\u0644\u0628\u0627\u062a')) + '</th><th>' + esc(pick('Spend', '\u0627\u0644\u0625\u0646\u0641\u0627\u0642')) + '</th><th>CPA</th><th>' + esc(pick('Confirmed', '\u0645\u0624\u0643\u062f')) + '</th><th>' + esc(pick('Delivered', '\u0645\u0633\u0644\u0645')) + '</th><th>' + esc(pick('Profit', '\u0627\u0644\u0631\u0628\u062d')) + '</th><th>P&L</th><th>' + esc(pick('Status', '\u0627\u0644\u062d\u0627\u0644\u0629')) + '</th>' +
        '</tr></thead>' + (accountDays.length ? accountDays.map(accountRow).join('') : '<tbody><tr><td colspan="9" class="dp-empty">' + esc(pick('No daily dashboard data for this period.', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u064a\u0648\u0645\u064a\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0641\u062a\u0631\u0629.')) + '</td></tr></tbody>') + '</table></div>' + paginationHtml('account', accountPagination) + '</div>' +
      '</div>' +
      '<div class="dp-panel ' + (productPanelOpen ? 'is-open' : '') + '" data-dp-panel="products">' +
        sectionHeader('products', pick('Daily Product Performance', '\u0623\u062f\u0627\u0621 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u064a\u0648\u0645\u064a'), pick('Product Calculator metrics grouped by day.', '\u0645\u0624\u0634\u0631\u0627\u062a \u062d\u0627\u0633\u0628\u0629 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0645\u0642\u0633\u0645\u0629 \u062d\u0633\u0628 \u0627\u0644\u064a\u0648\u0645.'), productPanelOpen) +
        '<div class="dp-panel-body" ' + (productPanelOpen ? '' : 'hidden') + '><div class="dp-table-wrap"><table class="dp-table dp-product-day-table"><thead><tr>' +
          '<th>' + esc(pick('Date', '\u0627\u0644\u062a\u0627\u0631\u064a\u062e')) + '</th><th>' + esc(pick('Orders', '\u0627\u0644\u0637\u0644\u0628\u0627\u062a')) + '</th><th>' + esc(pick('Spend', '\u0627\u0644\u0625\u0646\u0641\u0627\u0642')) + '</th><th>CPA</th><th>' + esc(pick('Delivered', '\u0645\u0633\u0644\u0645')) + '</th><th>NDR</th><th>P&L</th>' +
        '</tr></thead>' + (productDays.length ? productDays.map(productDayRow).join('') : '<tbody><tr><td colspan="7" class="dp-empty">' + esc(pick('No product data for this period.', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0646\u062a\u062c\u0627\u062a \u0644\u0647\u0630\u0647 \u0627\u0644\u0641\u062a\u0631\u0629.')) + '</td></tr></tbody>') + '</table></div>' + paginationHtml('products', productPagination) + '</div>' +
      '</div>' +
    '</section>';

    bindInteractions();
  }

  function bindInteractions() {
    mountEl.querySelectorAll('[data-dp-panel-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        var panel = button.closest('[data-dp-panel]');
        var body = panel && panel.querySelector('.dp-panel-body');
        if (!body) return;
        var open = body.hidden;
        body.hidden = !open;
        panel.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (panel.getAttribute('data-dp-panel') === 'products') {
          productPanelOpen = open;
          mountEl._dailyPerformanceProductOpen = open;
        } else {
          accountPanelOpen = open;
          mountEl._dailyPerformanceAccountOpen = open;
        }
      });
    });
    mountEl.querySelectorAll('[data-dp-day-toggle], [data-dp-product-day-toggle]').forEach(function (row) {
      row.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('a,button:not(.dp-expand-btn)')) return;
        var group = row.closest('tbody');
        var detail = group && group.querySelector('.dp-detail-row, .dp-product-detail-row');
        var btn = row.querySelector('.dp-expand-btn');
        if (!detail) return;
        var opening = detail.hidden;
        detail.hidden = !opening;
        group.classList.toggle('is-open', opening);
        if (btn) btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      });
    });
    mountEl.querySelectorAll('[data-dp-page]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.disabled) return;
        var part = button.getAttribute('data-dp-page-part') || 'account';
        var page = Math.max(1, Number(button.getAttribute('data-dp-page')) || 1);
        if (part === 'products') {
          if (page === productPage) return;
          productPage = page;
          mountEl._dailyPerformanceProductPage = productPage;
        } else {
          if (page === accountPage) return;
          accountPage = page;
          mountEl._dailyPerformanceAccountPage = accountPage;
        }
        setPanelLoading(part, true);
        loadPages(part);
      });
    });
  }

  function setPanelLoading(part, loading) {
    var panel = mountEl.querySelector('[data-dp-panel="' + (part === 'products' ? 'products' : 'account') + '"]');
    if (!panel) return;
    panel.classList.toggle('is-page-loading', !!loading);
    panel.querySelectorAll('[data-dp-page]').forEach(function (button) {
      button.disabled = !!loading || button.disabled;
    });
  }

  function renderLoading() {
    mountEl.innerHTML = '<section class="daily-performance-section" dir="' + (isRtl() ? 'rtl' : 'ltr') + '">' +
      '<div class="dp-loading"><span class="dp-spinner" aria-hidden="true"></span><strong>' + esc(pick('Preparing daily performance...', '\u062c\u0627\u0631\u064a \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0623\u062f\u0627\u0621 \u0627\u0644\u064a\u0648\u0645\u064a...')) + '</strong><span>' + esc(pick('Only one page of each table is rendered.', '\u064a\u062a\u0645 \u0639\u0631\u0636 \u0635\u0641\u062d\u0629 \u0648\u0627\u062d\u062f\u0629 \u0641\u0642\u0637 \u0645\u0646 \u0643\u0644 \u062c\u062f\u0648\u0644.')) + '</span></div>' +
    '</section>';
  }

  function renderError(message) {
    mountEl.innerHTML = '<section class="daily-performance-section" dir="' + (isRtl() ? 'rtl' : 'ltr') + '">' +
      '<div class="dp-empty-state"><strong>' + esc(pick('Daily Performance is unavailable right now.', '\u0627\u0644\u0623\u062f\u0627\u0621 \u0627\u0644\u064a\u0648\u0645\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0627\u0644\u0622\u0646.')) + '</strong><span>' + esc(message || '') + '</span></div>' +
    '</section>';
  }

  var accountId = fullData && fullData.meta && fullData.meta.activeAccountId
    ? fullData.meta.activeAccountId
    : (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');
  var roiFallback = fullData && fullData.roi || { adSpend: 0, currency: activeCurrency, egpRate: 52 };
  var roiState = window.DashboardRoiState && typeof window.DashboardRoiState.get === 'function'
    ? window.DashboardRoiState.get(accountId, roiFallback)
    : roiFallback;

  function loadPages(loadingPart) {
    var seq = ++requestSeq;
    if (!loadingPart) renderLoading();
    if (!window.DashboardQueryRuntime || typeof window.DashboardQueryRuntime.query !== 'function') {
      renderError('DASHBOARD_QUERY_UNAVAILABLE');
      return;
    }
    window.DashboardQueryRuntime.query('daily-performance', {
      accountPage: accountPage,
      accountPageSize: PAGE_SIZE,
      productPage: productPage,
      productPageSize: PAGE_SIZE,
      accountAdSpend: Number(roiState && roiState.adSpend || 0),
      accountSpendCurrency: roiState && roiState.currency || activeCurrency,
      productFinancialCurrency: activeCurrency,
      egpRate: Number(roiState && roiState.egpRate || 52),
      timeoutMs: 12000,
      requestChannel: 'daily-performance'
    }, fullData).then(function (result) {
      if (cancelled || !mountEl.isConnected || seq !== requestSeq) return;
      if (!result || !result.ok) {
        renderError(result && (result.error || result.kind) || 'DASHBOARD_QUERY_FAILED');
        return;
      }
      var accountTotalPages = result.accountPagination && Number(result.accountPagination.totalPages || 1) || 1;
      var productTotalPages = result.productPagination && Number(result.productPagination.totalPages || 1) || 1;
      if (accountPage > accountTotalPages || productPage > productTotalPages) {
        accountPage = Math.min(accountPage, accountTotalPages);
        productPage = Math.min(productPage, productTotalPages);
        mountEl._dailyPerformanceAccountPage = accountPage;
        mountEl._dailyPerformanceProductPage = productPage;
        loadPages(loadingPart);
        return;
      }
      renderModel(result);
      mountEl.dataset.dashboardReady = 'dailyPerformance';
    }).catch(function (error) {
      if (!cancelled && seq === requestSeq) renderError(error && error.message ? error.message : String(error || 'DASHBOARD_QUERY_FAILED'));
    });
  }

  loadPages();

  mountEl._dashboardSectionCleanup = function () {
    cancelled = true;
  };
  return mountEl._dashboardSectionCleanup;
};
