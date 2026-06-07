(function () {
  'use strict';

  var active = null;
  var promptPages = {};
  var pageOptions = {};

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isRtl() {
    if (window.dashboardI18n && typeof window.dashboardI18n.isRtl === 'function') return window.dashboardI18n.isRtl();
    return (window._kbotLang || document.documentElement.lang || 'en') === 'ar';
  }

  function t(page, key, fallback) {
    var full = 'tour.' + page + '.' + key;
    try {
      if (page === 'dashboard' && window.dashboardI18n && typeof window.dashboardI18n.t === 'function') {
        var value = window.dashboardI18n.t(full);
        if (value && value !== full) return value;
      }
      if (page === 'analytics' && typeof window.t_anl === 'function') {
        var a = window.t_anl(full);
        if (a && a !== full) return a;
      }
      if (page === 'operations' && typeof window.t_ops === 'function') {
        var o = window.t_ops(full);
        if (o && o !== full) return o;
      }
    } catch (e) {}
    return fallback || key;
  }

  function common(key) {
    var ar = isRtl();
    var map = {
      quickGuide: ar ? 'الدليل السريع' : 'Quick Guide',
      promptTitle: ar ? 'هل تريد جولة إرشادية لمدة دقيقة في مساحة عملك؟' : 'Would you like a 1-minute guided tour of your workspace?',
      promptBody: ar ? 'سنشير إلى أهم الأرقام، الجداول، واللوحات التي تحتاجها لاتخاذ قرارات أسرع.' : 'We will point out the key metrics, tables, and controls you need for faster decisions.',
      start: ar ? 'ابدأ الجولة' : 'Start tour',
      dismiss: ar ? 'ليس الآن' : 'Not now',
      back: ar ? 'السابق' : 'Back',
      next: ar ? 'التالي' : 'Next',
      finish: ar ? 'إنهاء' : 'Finish',
      skip: ar ? 'تخطي' : 'Skip',
      step: ar ? 'الخطوة' : 'Step',
      of: ar ? 'من' : 'of'
    };
    return map[key] || key;
  }

  function doneKey(page) {
    return 'kbot_tour_completed_' + page;
  }

  function readDone(page) {
    try { return localStorage.getItem(doneKey(page)) === 'true'; } catch (e) { return false; }
  }

  function setDone(page, value) {
    try { localStorage.setItem(doneKey(page), value ? 'true' : 'false'); } catch (e) {}
  }

  function visible(el) {
    if (!el || !document.body.contains(el)) return false;
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function selectTargets(step) {
    var selectors = Array.isArray(step.targets) ? step.targets : [step.target || step.targets || 'body'];
    var out = [];
    selectors.forEach(function (selector) {
      if (!selector) return;
      var nodes = [];
      try { nodes = Array.prototype.slice.call(document.querySelectorAll(selector)); } catch (e) { nodes = []; }
      for (var i = 0; i < nodes.length; i++) {
        if (visible(nodes[i])) {
          out.push(nodes[i]);
          break;
        }
      }
    });
    if (!out.length && step.fallback) {
      try {
        var fb = document.querySelector(step.fallback);
        if (visible(fb)) out.push(fb);
      } catch (e2) {}
    }
    if (!out.length) out.push(document.body);
    return out;
  }

  function unionRect(rects) {
    var left = Infinity;
    var top = Infinity;
    var right = -Infinity;
    var bottom = -Infinity;
    rects.forEach(function (r) {
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    if (!Number.isFinite(left)) return { left: 16, top: 16, right: 96, bottom: 96, width: 80, height: 80 };
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }

  function paddedRect(el) {
    var r = el.getBoundingClientRect();
    var pad = 10;
    return {
      left: Math.max(8, r.left - pad),
      top: Math.max(8, r.top - pad),
      right: Math.min(window.innerWidth - 8, r.right + pad),
      bottom: Math.min(window.innerHeight - 8, r.bottom + pad),
      width: Math.max(24, r.width + pad * 2),
      height: Math.max(24, r.height + pad * 2)
    };
  }

  function spotlightPath(rects) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var d = 'M0,0H' + w + 'V' + h + 'H0Z';
    rects.forEach(function (r) {
      var rad = 16;
      var x = Math.round(r.left);
      var y = Math.round(r.top);
      var rw = Math.round(r.width);
      var rh = Math.round(r.height);
      d += 'M' + (x + rad) + ',' + y + 'H' + (x + rw - rad) +
        'Q' + (x + rw) + ',' + y + ' ' + (x + rw) + ',' + (y + rad) +
        'V' + (y + rh - rad) + 'Q' + (x + rw) + ',' + (y + rh) + ' ' + (x + rw - rad) + ',' + (y + rh) +
        'H' + (x + rad) + 'Q' + x + ',' + (y + rh) + ' ' + x + ',' + (y + rh - rad) +
        'V' + (y + rad) + 'Q' + x + ',' + y + ' ' + (x + rad) + ',' + y + 'Z';
    });
    return d;
  }

  function positionCard(card, anchor) {
    var margin = 18;
    var maxLeft = Math.max(margin, window.innerWidth - card.offsetWidth - margin);
    var maxTop = Math.max(margin, window.innerHeight - card.offsetHeight - margin);
    var candidates = [
      { left: anchor.right + margin, top: anchor.top },
      { left: anchor.left - card.offsetWidth - margin, top: anchor.top },
      { left: anchor.left, top: anchor.bottom + margin },
      { left: anchor.left, top: anchor.top - card.offsetHeight - margin }
    ];
    var chosen = candidates.filter(function (c) {
      return c.left >= margin && c.top >= margin && c.left <= maxLeft && c.top <= maxTop;
    })[0] || candidates[2];
    card.style.left = Math.min(Math.max(margin, chosen.left), maxLeft) + 'px';
    card.style.top = Math.min(Math.max(margin, chosen.top), maxTop) + 'px';
  }

  function makeRoot(page) {
    var root = document.createElement('div');
    root.className = 'taager-tour-root';
    root.dir = isRtl() ? 'rtl' : 'ltr';
    root.innerHTML =
      '<div class="taager-tour-backdrop"></div>' +
      '<svg class="taager-tour-spotlight-svg" aria-hidden="true"><path class="taager-tour-spotlight-path" fill-rule="evenodd"></path></svg>' +
      '<section class="taager-tour-card" role="dialog" aria-modal="true" aria-live="polite">' +
        '<button type="button" class="taager-tour-skip" data-tour-skip>' + esc(common('skip')) + ' &times;</button>' +
        '<div class="taager-tour-progress-copy"></div>' +
        '<div class="taager-tour-progress-track"><span></span></div>' +
        '<h3 class="taager-tour-title"></h3>' +
        '<p class="taager-tour-body"></p>' +
        '<div class="taager-tour-actions">' +
          '<button type="button" class="taager-tour-btn is-secondary" data-tour-back>&lsaquo; ' + esc(common('back')) + '</button>' +
          '<button type="button" class="taager-tour-btn is-primary" data-tour-next>' + esc(common('next')) + ' &rsaquo;</button>' +
        '</div>' +
      '</section>';
    document.body.appendChild(root);
    return root;
  }

  function renderStep() {
    if (!active) return;
    var step = active.steps[active.index];
    active.root.dir = isRtl() ? 'rtl' : 'ltr';
    var targets = selectTargets(step);
    (active.lifted || []).forEach(function (el) { el.classList.remove('taager-tour-target-lift'); });
    active.lifted = [];
    targets.forEach(function (el) {
      if (el && el !== document.body) {
        el.classList.add('taager-tour-target-lift');
        active.lifted.push(el);
      }
    });
    var first = targets[0];
    if (first && first !== document.body && typeof first.scrollIntoView === 'function') {
      first.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    }
    setTimeout(function () {
      if (!active) return;
      var rects = targets.map(paddedRect);
      var anchor = unionRect(rects);
      active.path.setAttribute('d', spotlightPath(rects));
      active.title.textContent = step.title;
      active.body.textContent = step.body;
      active.progressCopy.textContent = common('step') + ' ' + (active.index + 1) + ' ' + common('of') + ' ' + active.steps.length;
      active.progressBar.style.inlineSize = (((active.index + 1) / active.steps.length) * 100) + '%';
      active.back.disabled = active.index === 0;
      active.next.innerHTML = active.index === active.steps.length - 1 ? esc(common('finish')) : esc(common('next')) + ' &rsaquo;';
      active.card.classList.remove('is-visible');
      positionCard(active.card, anchor);
      requestAnimationFrame(function () { if (active) active.card.classList.add('is-visible'); });
    }, 80);
  }

  function gotoStep(index) {
    if (!active) return;
    active.index = Math.max(0, Math.min(index, active.steps.length - 1));
    var step = active.steps[active.index];
    if (active.page === 'dashboard' && step.section) {
      var opts = active.options || {};
      if (typeof opts.navigate === 'function') opts.navigate(step.section);
      else {
        var btn = document.querySelector('.dash-nav-btn[data-section="' + step.section + '"]');
        if (btn) btn.click();
      }
    }
    renderStep();
  }

  function close(markDone) {
    if (!active) return;
    (active.lifted || []).forEach(function (el) { el.classList.remove('taager-tour-target-lift'); });
    window.removeEventListener('resize', active.update);
    window.removeEventListener('scroll', active.update, true);
    document.removeEventListener('keydown', active.keydown);
    if (markDone) setDone(active.page, true);
    active.root.remove();
    active = null;
  }

  function start(page, opts) {
    if (active) close(false);
    opts = opts || pageOptions[page] || {};
    pageOptions[page] = opts;
    var steps = getSteps(page);
    if (!steps.length) return;
    var root = makeRoot(page);
    active = {
      page: page,
      options: opts,
      steps: steps,
      index: 0,
      root: root,
      path: root.querySelector('.taager-tour-spotlight-path'),
      card: root.querySelector('.taager-tour-card'),
      title: root.querySelector('.taager-tour-title'),
      body: root.querySelector('.taager-tour-body'),
      progressCopy: root.querySelector('.taager-tour-progress-copy'),
      progressBar: root.querySelector('.taager-tour-progress-track span'),
      back: root.querySelector('[data-tour-back]'),
      next: root.querySelector('[data-tour-next]'),
      update: function () { renderStep(); },
      keydown: function (e) {
        if (e.key === 'Escape') close(true);
        if (e.key === 'ArrowRight' && !isRtl()) gotoStep(active.index + 1);
        if (e.key === 'ArrowLeft' && !isRtl()) gotoStep(active.index - 1);
      }
    };
    active.back.addEventListener('click', function () { gotoStep(active.index - 1); });
    active.next.addEventListener('click', function () {
      if (active.index >= active.steps.length - 1) close(true);
      else gotoStep(active.index + 1);
    });
    root.querySelector('[data-tour-skip]').addEventListener('click', function () { close(true); });
    window.addEventListener('resize', active.update);
    window.addEventListener('scroll', active.update, true);
    document.addEventListener('keydown', active.keydown);
    gotoStep(0);
  }

  function mountPrompt(page, opts) {
    opts = opts || {};
    pageOptions[page] = Object.assign({}, pageOptions[page] || {}, opts);
    if (readDone(page) || promptPages[page]) return;
    var host = opts.root || document.body;
    var prompt = document.createElement('div');
    prompt.className = 'taager-tour-prompt';
    prompt.dir = isRtl() ? 'rtl' : 'ltr';
    prompt.innerHTML =
      '<div class="taager-tour-prompt-card" role="dialog" aria-modal="false">' +
        '<div class="taager-tour-prompt-mark">?</div>' +
        '<div class="taager-tour-prompt-copy">' +
          '<h3>' + esc(common('promptTitle')) + '</h3>' +
          '<p>' + esc(common('promptBody')) + '</p>' +
        '</div>' +
        '<div class="taager-tour-prompt-actions">' +
          '<button type="button" class="taager-tour-btn is-primary" data-tour-start>' + esc(common('start')) + '</button>' +
          '<button type="button" class="taager-tour-btn is-secondary" data-tour-dismiss>' + esc(common('dismiss')) + '</button>' +
        '</div>' +
      '</div>';
    host.appendChild(prompt);
    promptPages[page] = prompt;
    prompt.querySelector('[data-tour-start]').addEventListener('click', function () {
      prompt.remove();
      promptPages[page] = null;
      start(page, pageOptions[page]);
    });
    prompt.querySelector('[data-tour-dismiss]').addEventListener('click', function () {
      setDone(page, true);
      prompt.remove();
      promptPages[page] = null;
    });
  }

  function dashboardStep(section, key, targets, title, body) {
    return {
      section: section,
      targets: ['#dash-section-pane'],
      fallback: '#dash-section-pane',
      title: t('dashboard', key + '.title', title),
      body: t('dashboard', key + '.body', body)
    };
  }

  function getSteps(page) {
    if (page === 'dashboard') return [
      dashboardStep('master', 'master', ['#dash-section-pane .s8-pipeline-stages, #dash-section-pane .s8-summary-grid, #dash-section-pane #s8-commission-chart'],
        'Master Dashboard Section', 'This section is the main business cockpit. In one view you can read total orders, sales, delivery health, AOV, average delivery time, pipeline movement, and the key KPIs that summarize the full account.'),
      dashboardStep('overview', 'overview', ['#s1-trend-chart, .s1-kpi-row, .s1-health-row'],
        'Overview Section', 'This section gives the quick health view for the selected period: high-level totals, trend charts, delivery signals, and performance movement so you can understand the account before drilling deeper.'),
      dashboardStep('pipeline', 'pipeline', ['.s2-stage-row, .s2-funnel-scroll, .s2-metrics-grid'],
        'Order Pipeline Section', 'This section explains how orders move through the business. You can see stage totals, conversion movement, NDR outcomes, and where orders slow down or drop off.'),
      dashboardStep('orders', 'orders', ['#s3-search, #s3-details-container, #s3-table-container, #s3-clear-sort'],
        'Orders Section', 'This section is the detailed order workspace. Use it to search, filter, inspect individual orders, open details, review statuses, and audit the exact rows behind the dashboard numbers.'),
      dashboardStep('cod', 'cod', ['#s4-gap, #s4-days, .s4-city-bar, #s4-cities-btn'],
        'COD Collection Section', 'This section shows the cash collection picture: collected COD, pending gaps, city-level delays, and delivery-duration patterns that explain where money is still stuck.'),
      dashboardStep('products', 'products', ['.s5-product-row, .s5-header-cols, #s5-view-toggle'],
        'Products Section', 'This section shows product performance across orders, delivery, revenue, ad spend, CPA, and profit or loss so you can decide what to scale, watch, or fix.'),
      dashboardStep('cities', 'cities', ['.sc-map, .sc-dot-inner, #sc-filter-bar, .sc-lb-row, #sc-product-matrix-mount'],
        'Cities Section', 'This section shows geographic performance. Use the map, filters, city rankings, delivery rates, and product matrix to understand which regions are strong or risky.'),
      dashboardStep('commission', 'commission', ['#s6-area-chart, #s6-period-tabs, #s6-total-countup'],
        'Commission Section', 'This section focuses on earned commission. It shows the trend, period breakdowns, best and weak days, and the signals that explain whether earnings are improving.'),
      dashboardStep('marketing', 'marketing', ['.marketing-platform-card, .marketing-mapping-board, #marketing-sync-now'],
        'Marketing Connections Section', 'This section connects marketing spend to dashboard performance. It handles TikTok connections, account mapping, currencies, sync status, and ad-spend values used by the calculators.'),
      dashboardStep('calculator', 'calculator', ['.s7-body, #s7-source-breakdown, #sfe-orders, .s7-rate-note'],
        'Account Calculator Section', 'This section helps you test account-level profitability. Change budget, calculator currency, delivery assumptions, and source inputs to see what must happen before scaling. Exchange rates are managed globally from the dashboard top bar.'),
      dashboardStep('productForecast', 'productForecast', ['.s9-row, [data-sim-panel], #s9-gauge-wrap, .s9-sim-spend-input'],
        'Product Calculator Section', 'This section models product-level scaling. It combines orders, NDR, commission, projected CPA, and budget simulations so each product can be evaluated before more spend.'),
      dashboardStep('prepaid', 'prepaid', ['#sp-city-rows-container, #sp-product-search, #sp-recs-tabs, .sp-city-row'],
        'Prepaid Data Section', 'This section compares prepaid behavior with COD performance. It brings together payment-method trends, card signals, city results, product ROI, and recommendations.'),
      dashboardStep('taagerAi', 'taagerAi', ['.aii-chat-panel, #aii-chat-input, .aii-streams-panel, .aii-feed-card'],
        'Taager Bot Section', 'This section is the AI workspace for the dashboard. Ask in English or Arabic to explain data, find risks, calculate scenarios, summarize anomalies, and turn the current section data into actions.')
    ];
    if (page === 'analytics') return [
      { target: '#analytics-kpi-section', title: t('analytics', 'kpis.title', 'Top KPI Blocks'), body: t('analytics', 'kpis.body', 'The KPI row aggregates orders, revenue, COD, delivery percentage, failed percentage, and time saved for the active date and account filters.') },
      { target: '#analytics-charts-root canvas, #analytics-charts-root', title: t('analytics', 'charts.title', 'Interactive Trend Curves'), body: t('analytics', 'charts.body', 'The Chart.js canvases show dynamic daily distributions. Hover over nodes and bars to inspect day-by-day order, revenue, status, city, and product patterns.') },
      { target: '#analytics-orders-explorer', title: t('analytics', 'table.title', 'Filterable Reporting Grid'), body: t('analytics', 'table.body', 'The table turns the chart data into custom reporting: filter, isolate runs, review order rows, and use it as the audit trail beneath the trend layer.') }
    ];
    if (page === 'operations') return [
      { targets: ['#ops-account-tabs', '#ops-order-details-panel'], title: t('operations', 'config.title', 'Runner Configuration and Targets'), body: t('operations', 'config.body', 'Use the account selector and order detail panel to choose the run scope, review platform/account targets, and understand which retries need operational attention.') },
      { target: '#ops-monitor-mount', title: t('operations', 'terminal.title', 'Live Execution Terminal'), body: t('operations', 'terminal.body', 'The live monitor streams runner status, runtime, submitted and failed counts, current account, current order, progress, and real-time success or error feed entries from the checkout flow.') },
      { target: '#ops-perf-mount', title: t('operations', 'accountPerformance.title', 'Account Performance'), body: t('operations', 'accountPerformance.body', 'Compare accounts by order volume and revenue so you can see which account is carrying the run and where attention is needed.') },
      { target: '#ops-insights-mount', title: t('operations', 'smartInsights.title', 'Run Smart Insights'), body: t('operations', 'smartInsights.body', 'Smart Insights turns run history into practical signals: demand shifts, failure clusters, top products, COD exposure, and timing recommendations.') },
      { target: '#ops-product-mount', title: t('operations', 'productPerformance.title', 'Product Performance'), body: t('operations', 'productPerformance.body', 'Use the product table to search, sort, and compare orders, revenue, delivered rate, failed rate, and performance bars across products.') },
      { target: '#ops-history-mount', title: t('operations', 'history.title', 'Historical Audit Logs'), body: t('operations', 'history.body', 'Run History is the searchable audit trail for completed executions. Select a run to load its order details, status timeline, submitted counts, failed counts, and downloaded-result context.') }
    ];
    return [];
  }

  window.TaagerGuidedTour = {
    start: start,
    close: close,
    mountPagePrompt: mountPrompt,
    isCompleted: readDone
  };
})();
