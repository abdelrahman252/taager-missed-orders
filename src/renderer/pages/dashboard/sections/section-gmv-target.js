window.renderSectionGmvTarget = function (mountEl, data, ctx) {
  'use strict';

  var d = (ctx && ctx.data) || data || {};
  var targetState = window.DashboardGmvTargetState;
  if (!targetState) {
    var loadingIsAr = (document.documentElement.getAttribute('lang') || window._kbotLang || 'ar') === 'ar';
    mountEl.innerHTML = '<div class="dash-coming-soon"><div class="dash-coming-soon-title">' + (loadingIsAr ? 'جاري تحميل مخطط هدف GMV' : 'GMV planner is loading') + '</div></div>';
    return;
  }

  var isAr = (document.documentElement.getAttribute('lang') || window._kbotLang || 'ar') === 'ar';
  var accountId = (d.meta && d.meta.activeAccountId) || (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');
  var country = String((d.meta && d.meta.activeCountry) || window.dashboardActiveCountry || 'mixed').toLowerCase();
  var currency = String((d.meta && (d.meta.activeCurrency || d.meta.reportingCurrency)) || window.dashboardActiveCurrency || 'SAR').toUpperCase();
  var draft = mountEl._gmvPlannerDraft || {};
  var base = targetState.snapshot(d);
  var initialTarget = draft.targetGmv != null ? draft.targetGmv : (base.targetGmv > 0 ? base.targetGmv : base.suggestedTargetGmv);
  var initialDeadline = draft.deadline || base.deadline;
  var initialNdr = draft.ndrPct != null ? draft.ndrPct : base.ndrPct;
  var initialAov = draft.deliveredAov != null ? draft.deliveredAov : base.deliveredAov;
  var initialCustomDaily = draft.customDailyOrders != null ? draft.customDailyOrders : Math.ceil(base.dailyOrdersNeeded || base.runRate || 0);
  var snap = targetState.snapshot(d, {
    targetGmv: initialTarget,
    deadline: initialDeadline,
    ndrPct: initialNdr,
    deliveredAov: initialAov,
    customDailyOrders: initialCustomDaily
  });

  function esc(value) {
    if (window.TaagerUI && typeof window.TaagerUI.esc === 'function') return window.TaagerUI.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function fmtMoney(value, decimals, compact) {
    if (window.formatDashboardMoney) return window.formatDashboardMoney(value, currency, decimals == null ? 0 : decimals, { compact: compact === true });
    return Math.round(Number(value || 0)).toLocaleString('en-US') + ' ' + currency;
  }

  function fmtNum(value, decimals) {
    var n = Number(value || 0);
    if (window.dashboardI18n && typeof window.dashboardI18n.number === 'function') {
      return window.dashboardI18n.number(n, {
        minimumFractionDigits: decimals || 0,
        maximumFractionDigits: decimals || 0
      });
    }
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  }

  function fmtRate(value) {
    var n = Number(value || 0);
    return n.toFixed(1).replace(/\.0$/, '');
  }

  function tr(key, fallback) {
    var value = window.dashboardI18n && window.dashboardI18n.t ? window.dashboardI18n.t(key) : key;
    return value && value !== key ? value : fallback;
  }

  function gmTxt(en, ar) {
    if (window.dashboardI18n && typeof window.dashboardI18n.pick === 'function') {
      return window.dashboardI18n.pick(en, ar || en);
    }
    return isAr ? (ar || en) : en;
  }

  function isoText(value) {
    return esc(value).replace(/\b(GMV|NDR|AOV|SAR|EGP|IQD|AED|KWD|QAR|BHD|OMR|USD)\b/g, '<bdi dir="ltr" class="gmv-ltr">$1</bdi>');
  }

  function txtHtml(en, ar) {
    return isoText(gmTxt(en, ar));
  }

  function ltrHtml(value, className) {
    return '<bdi dir="ltr" class="' + esc(className || 'gmv-ltr') + '">' + esc(value) + '</bdi>';
  }

  function moneyHtml(value, decimals, compact) {
    return ltrHtml(fmtMoney(value, decimals, compact), 'gmv-money-text');
  }

  function rateHtml(value, suffix) {
    return ltrHtml(fmtRate(value) + (suffix || ''), 'gmv-rate-text');
  }

  function progressMainHtml(model) {
    return moneyHtml(model.currentGmv, 0, true) + ' <span class="gmv-progress-sep">/</span> ' + moneyHtml(model.targetGmv, 0, true);
  }

  function tip(title, desc, formula) {
    var text = title + '\n' + desc + (formula ? '\n' + gmTxt('Formula', 'المعادلة') + ': ' + formula : '');
    return '<span class="gmv-tip taager-help" tabindex="0" role="button" data-preserve-question-mark="1" data-tooltip="' + esc(text) + '" aria-label="' + esc(title) + '"></span>';
  }

  function parseIsoDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10));
    if (!match) return null;
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return isNaN(date.getTime()) ? null : date;
  }

  function toIsoDate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function displayDate(iso) {
    var date = parseIsoDate(iso);
    if (!date) return String(iso || '');
    var locale = window.dashboardI18n && window.dashboardI18n.locale ? window.dashboardI18n.locale() : (isAr ? 'ar-EG-u-nu-latn' : 'en-US');
    return date.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function closeGmvDeadlinePicker() {
    var old = document.querySelector('.gmv-date-popover');
    if (!old) return;
    if (old._gmvOutside) document.removeEventListener('pointerdown', old._gmvOutside);
    if (old._gmvReposition) {
      window.removeEventListener('resize', old._gmvReposition);
      window.removeEventListener('scroll', old._gmvReposition, true);
    }
    old.remove();
  }

  function openGmvDeadlinePicker(anchor, value, onSelect) {
    closeGmvDeadlinePicker();
    if (window.closeDashboardDatePicker) window.closeDashboardDatePicker();
    var current = parseIsoDate(value) || new Date();
    var selected = toIsoDate(current);
    var view = new Date(current.getFullYear(), current.getMonth(), 1);
    var min = new Date();
    min = new Date(min.getFullYear(), min.getMonth(), 1);
    var max = new Date(min.getFullYear() + 2, min.getMonth(), 1);
    var pop = document.createElement('div');
    pop.className = 'dashboard-date-popover gmv-date-popover';
    document.body.appendChild(pop);

    function render() {
      var locale = window.dashboardI18n && window.dashboardI18n.locale ? window.dashboardI18n.locale() : 'en-US';
      var monthLabel = view.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
      var first = new Date(view.getFullYear(), view.getMonth(), 1);
      var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      var offset = first.getDay();
      var canBack = view > min;
      var canForward = view < max;
      var cells = '';
      for (var i = 0; i < offset; i++) cells += '<span class="dash-cal-cell is-empty"></span>';
      for (var day = 1; day <= days; day++) {
        var date = new Date(view.getFullYear(), view.getMonth(), day);
        var iso = toIsoDate(date);
        cells += '<button type="button" class="dash-cal-cell' + (iso === selected ? ' is-selected' : '') + '" data-date="' + esc(iso) + '">' + day + '</button>';
      }
      pop.innerHTML =
        '<div class="dash-cal-head">' +
          '<button type="button" class="dash-cal-nav' + (canBack ? '' : ' is-disabled') + '" data-dir="-1"' + (canBack ? '' : ' disabled') + '>&lsaquo;</button>' +
          '<strong>' + esc(monthLabel) + '</strong>' +
          '<button type="button" class="dash-cal-nav' + (canForward ? '' : ' is-disabled') + '" data-dir="1"' + (canForward ? '' : ' disabled') + '>&rsaquo;</button>' +
        '</div>' +
        '<div class="dash-cal-week"><span>' + esc(tr('calendar.weekdays.sun', 'Su')) + '</span><span>' + esc(tr('calendar.weekdays.mon', 'Mo')) + '</span><span>' + esc(tr('calendar.weekdays.tue', 'Tu')) + '</span><span>' + esc(tr('calendar.weekdays.wed', 'We')) + '</span><span>' + esc(tr('calendar.weekdays.thu', 'Th')) + '</span><span>' + esc(tr('calendar.weekdays.fri', 'Fr')) + '</span><span>' + esc(tr('calendar.weekdays.sat', 'Sa')) + '</span></div>' +
        '<div class="dash-cal-grid">' + cells + '</div>';
      pop.querySelectorAll('.dash-cal-nav').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var next = new Date(view.getFullYear(), view.getMonth() + Number(btn.getAttribute('data-dir')), 1);
          if (next < min || next > max) return;
          view = next;
          render();
          position();
        });
      });
      pop.querySelectorAll('.dash-cal-cell[data-date]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selected = btn.getAttribute('data-date');
          onSelect(selected);
          closeGmvDeadlinePicker();
        });
      });
    }

    function position() {
      var rect = anchor.getBoundingClientRect();
      pop.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 292)) + 'px';
      pop.style.top = Math.min(rect.bottom + 8, window.innerHeight - 330) + 'px';
    }

    pop._gmvOutside = function (event) {
      if (!pop.contains(event.target) && event.target !== anchor && !anchor.contains(event.target)) closeGmvDeadlinePicker();
    };
    pop._gmvReposition = position;
    setTimeout(function () { document.addEventListener('pointerdown', pop._gmvOutside); }, 0);
    window.addEventListener('resize', pop._gmvReposition);
    window.addEventListener('scroll', pop._gmvReposition, true);
    render();
    position();
  }

  function endOfMonthIso() {
    var now = new Date();
    var end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    var y = end.getFullYear();
    var m = String(end.getMonth() + 1).padStart(2, '0');
    var day = String(end.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function statusMeta(status) {
    if (status === 'overachieved') return { label: gmTxt('Overachieved', 'تم تجاوز الهدف'), color: '#10b981', tone: 'is-great' };
    if (status === 'achieved') return { label: gmTxt('Achieved', 'تم تحقيق الهدف'), color: '#22d3ee', tone: 'is-great' };
    if (status === 'on_track') return { label: gmTxt('On track', 'على المسار الصحيح'), color: '#3b82f6', tone: 'is-good' };
    if (status === 'watch') return { label: gmTxt('Close, needs push', 'قريب ويحتاج دفعة'), color: '#f59e0b', tone: 'is-watch' };
    if (status === 'ended') return { label: gmTxt('Period ended', 'انتهت الفترة'), color: '#94a3b8', tone: 'is-muted' };
    if (status === 'behind') return { label: gmTxt('Behind pace', 'أقل من الوتيرة المطلوبة'), color: '#ef4444', tone: 'is-bad' };
    return { label: gmTxt('Set a target', 'حدد هدفا'), color: '#a855f7', tone: 'is-muted' };
  }

  function cardHtml(label, value, sub, color, iconName, tipHtml) {
    return '<div class="gmv-kpi-card">' +
      '<div class="gmv-kpi-icon" style="color:' + color + ';background:' + color + '16;border-color:' + color + '38;">' +
        (window.icon ? window.icon(iconName || 'target', { size: 17, color: 'currentColor' }) : '') +
      '</div>' +
      '<div class="gmv-kpi-copy">' +
        '<div class="gmv-kpi-label">' + isoText(label) + (tipHtml ? tipHtml : '') + '</div>' +
        '<div class="gmv-kpi-value" data-gmv-key="' + esc(label) + '">' + value + '</div>' +
        '<div class="gmv-kpi-sub">' + isoText(sub || '') + '</div>' +
      '</div>' +
    '</div>';
  }

  function formulaText(model) {
    if (!(model.daysLeft > 0)) {
      return gmTxt(
        'deadline passed: remaining GMV / delivered AOV / NDR = ' + fmtRate(model.dailyOrdersNeeded) + ' catch-up placed orders',
        'انتهت المهلة: GMV المتبقي / متوسط قيمة الطلب المسلم / NDR = ' + fmtRate(model.dailyOrdersNeeded) + ' طلبات تعويض'
      );
    }
    return gmTxt(
      'daily = (' + fmtMoney(model.remainingGmv, 0, true) + ' / ' + fmtMoney(model.deliveredAov, 1) + ' / ' + fmtRate(model.ndrPct) + '%) / ' + model.daysLeft + ' days = ' + fmtRate(model.dailyOrdersNeeded) + '/day',
      'اليومي = (' + fmtMoney(model.remainingGmv, 0, true) + ' / ' + fmtMoney(model.deliveredAov, 1) + ' / ' + fmtRate(model.ndrPct) + '%) / ' + model.daysLeft + ' يوم = ' + fmtRate(model.dailyOrdersNeeded) + '/يوم'
    );
  }

  function formulaHtml(model) {
    if (!(model.daysLeft > 0)) {
      return txtHtml('deadline passed', 'انتهت المهلة') + ': ' +
        txtHtml('remaining GMV', 'GMV المتبقي') + ' / ' +
        txtHtml('delivered AOV', 'متوسط قيمة الطلب المسلم') + ' / ' +
        ltrHtml('NDR') + ' = ' +
        rateHtml(model.dailyOrdersNeeded) + ' ' +
        txtHtml('catch-up placed orders', 'طلبات تعويض');
    }
    return txtHtml('daily', 'اليومي') + ' = (' +
      moneyHtml(model.remainingGmv, 0, true) + ' / ' +
      moneyHtml(model.deliveredAov, 1) + ' / ' +
      rateHtml(model.ndrPct, '%') + ') / ' +
      ltrHtml(fmtNum(model.daysLeft)) + ' ' + txtHtml('days', 'يوم') + ' = ' +
      rateHtml(model.dailyOrdersNeeded, gmTxt('/day', '/يوم'));
  }

  function neededPaceText(model) {
    return model.daysLeft > 0 ? rateHtml(model.dailyOrdersNeeded, gmTxt('/day', '/يوم')) : rateHtml(model.dailyOrdersNeeded) + ' ' + txtHtml('now', 'الآن');
  }

  function impactHtml(model) {
    var custom = model.scenarios.filter(function (row) { return row.id === 'custom'; })[0];
    if (!custom) return txtHtml('Change NDR, AOV, or custom daily orders to test the target.', 'غيّر NDR أو متوسط قيمة الطلب أو الطلبات اليومية المخصصة لاختبار الهدف.');
    var compare = custom.targetCompare != null ? custom.targetCompare : (custom.delta > 0 ? 1 : (custom.delta === 0 ? 0 : -1));
    var gap = compare > 0
      ? txtHtml('overachieves by', 'يتجاوز الهدف بمقدار') + ' ' + moneyHtml(Math.abs(custom.delta), 0, true)
      : (compare === 0 ? txtHtml('achieves the target', 'يحقق الهدف بالضبط') : (txtHtml('misses by', 'ينقص بمقدار') + ' ' + moneyHtml(Math.abs(custom.delta), 0, true)));
    return txtHtml('Custom pace', 'الوتيرة المخصصة') + ': ' + rateHtml(custom.dailyOrders) + ' ' + txtHtml('placed orders/day', 'طلب صافي/يوم') + ' ' +
      '<span class="gmv-impact-sep">-&gt;</span> ' + ltrHtml(fmtNum(custom.expectedDeliveredOrders, 0)) + ' ' + txtHtml('delivered orders', 'طلب مسلم') + ' ' +
      '<span class="gmv-impact-sep">-&gt;</span> ' + moneyHtml(custom.expectedGmv, 0, true) + ' ' + ltrHtml('GMV') + '. ' + txtHtml('This', 'هذا') + ' ' + gap + '.';
  }

  function scenarioLabel(row) {
    var labels = {
      slower: gmTxt('Slower pace', 'وتيرة أبطأ'),
      current: gmTxt('Current pace', 'الوتيرة الحالية'),
      required: gmTxt('Required pace', 'الوتيرة المطلوبة'),
      push: gmTxt('Push mode', 'وضع الدفع'),
      custom: gmTxt('Custom pace', 'وتيرة مخصصة')
    };
    return labels[row.id] || row.label || '';
  }

  function scenarioRowsHtml(model) {
    return model.scenarios.map(function (row) {
      var compare = row.targetCompare != null ? row.targetCompare : (row.delta > 0 ? 1 : (row.delta === 0 ? 0 : -1));
      var result = compare > 0
        ? txtHtml('Overachieved', 'تم تجاوز الهدف')
        : (compare === 0 ? txtHtml('Achieved', 'تم تحقيق الهدف') : (txtHtml('Short by', 'ينقص') + ' ' + moneyHtml(Math.abs(row.delta), 0, true)));
      var resultClass = compare >= 0 ? 'is-hit' : 'is-miss';
      return '<tr>' +
        '<td><span class="gmv-scenario-dot" style="background:' + row.color + ';box-shadow:0 0 12px ' + row.color + '66;"></span>' + isoText(scenarioLabel(row)) + '</td>' +
        '<td>' + rateHtml(row.dailyOrders, gmTxt('/day', '/يوم')) + '</td>' +
        '<td>' + fmtNum(row.expectedDeliveredOrders, 0) + '</td>' +
        '<td>' + moneyHtml(row.expectedGmv, 0, true) + '</td>' +
        '<td><span class="gmv-result-pill ' + resultClass + '">' + result + '</span></td>' +
      '</tr>';
    }).join('');
  }

  function missingCopyHtml(model) {
    if (!model.hasTarget) return txtHtml('No saved target yet', 'لا يوجد هدف محفوظ بعد');
    if (!(model.remainingGmv > 0)) return txtHtml('No gap left', 'لا توجد فجوة متبقية');
    return moneyHtml(model.remainingGmv, 0, true) + ' ' + txtHtml('left to achieve target', 'متبقية لتحقيق الهدف');
  }

  var meta = statusMeta(snap.status);
  var missingCopy = missingCopyHtml(snap);
  var requiredOrders = Math.ceil(snap.neededNetOrders || 0);
  var requiredDelivered = Math.ceil(snap.neededDeliveredOrders || 0);
  var periodDeadline = (d.meta && d.meta.period && d.meta.period.dateTo) || base.deadline || initialDeadline;
  var monthDeadline = endOfMonthIso();

  mountEl.innerHTML =
    '<div class="dash-scroll gmv-body" dir="' + (isAr ? 'rtl' : 'ltr') + '">' +
      '<div class="gmv-shell">' +
        '<section class="gmv-hero">' +
          '<div class="gmv-hero-copy">' +
            '<div class="gmv-kicker">' + txtHtml('GMV TARGET PLANNER', 'مخطط هدف GMV') + '</div>' +
            '<h1>' + txtHtml('Turn your delivered-sales goal into daily orders.', 'حوّل هدف المبيعات المسلمة إلى وتيرة طلبات يومية واضحة.') + '</h1>' +
            '<p>' + txtHtml('Set a Net Total Delivered Sales target, then see the daily placed-order pace needed based on your current run rate, NDR, and delivered AOV.', 'حدد هدف صافي مبيعات الطلبات المسلمة، ثم اعرف وتيرة الطلبات اليومية المطلوبة بناء على وتيرتك الحالية وNDR ومتوسط قيمة الطلب المسلم.') + '</p>' +
          '</div>' +
          '<div class="gmv-target-panel">' +
            '<div class="gmv-panel-title">' +
              '<span>' + (window.icon ? window.icon('target', { size: 18, color: '#a855f7' }) : '') + '</span>' +
              '<strong>' + (snap.hasTarget ? txtHtml('Saved GMV target', 'هدف GMV محفوظ') : txtHtml('Set your GMV target', 'حدد هدف GMV')) + '</strong>' +
            '</div>' +
            '<div class="gmv-form-grid">' +
              '<label><span>' + txtHtml('Target GMV', 'هدف GMV') + '</span><div class="gmv-input-wrap"><input id="gmv-target-input" type="number" min="1" step="100" value="' + esc(Math.round(initialTarget)) + '"><em>' + ltrHtml(currency) + '</em></div></label>' +
              '<label><span>' + txtHtml('Deadline', 'الموعد النهائي') + '</span><input id="gmv-deadline-input" type="hidden" value="' + esc(initialDeadline) + '"><button type="button" class="gmv-date-button" id="gmv-deadline-button"><span>' + ltrHtml(displayDate(initialDeadline), 'gmv-date-text') + '</span>' + (window.icon ? window.icon('calendar', { size: 15, color: 'currentColor' }) : '') + '</button><div class="gmv-date-shortcuts"><button type="button" data-gmv-deadline="' + esc(periodDeadline) + '">' + txtHtml('Period end', 'نهاية الفترة') + '</button><button type="button" data-gmv-deadline="' + esc(monthDeadline) + '">' + txtHtml('Month end', 'نهاية الشهر') + '</button></div></label>' +
            '</div>' +
            '<div class="gmv-actions">' +
              '<button type="button" class="gmv-primary-btn" id="gmv-save-target">' + (snap.hasTarget ? txtHtml('Update goal', 'تحديث الهدف') : txtHtml('Set goal', 'حفظ الهدف')) + '</button>' +
              '<button type="button" class="gmv-secondary-btn" id="gmv-clear-target"' + (snap.hasTarget ? '' : ' disabled') + '>' + txtHtml('Clear', 'مسح') + '</button>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="gmv-progress-card ' + meta.tone + '">' +
          '<div class="gmv-progress-top">' +
            '<div>' +
              '<span class="gmv-progress-label">' + txtHtml('Progress', 'التقدم') + '</span>' +
              '<strong id="gmv-progress-main">' + progressMainHtml(snap) + '</strong>' +
            '</div>' +
            '<div class="gmv-status-pill" id="gmv-status-pill" style="color:' + meta.color + ';background:' + meta.color + '16;border-color:' + meta.color + '40;">' + esc(meta.label) + '</div>' +
          '</div>' +
          '<div class="gmv-progress-wrap">' +
            '<div class="gmv-progress-track" id="gmv-progress-track" style="--gmv-progress-pct:' + Math.min(100, snap.progressPct).toFixed(2) + '%;">' +
              '<div id="gmv-progress-fill" class="gmv-progress-fill"></div>' +
              '<span class="gmv-progress-tick" style="left:25%;"></span>' +
              '<span class="gmv-progress-tick" style="left:50%;"></span>' +
              '<span class="gmv-progress-tick" style="left:75%;"></span>' +
              '<span class="gmv-progress-tick is-goal" style="left:100%;"></span>' +
            '</div>' +
            '<div class="gmv-progress-marks" aria-hidden="true">' +
              '<span>25%</span><span>50%</span><span>75%</span><span>100%</span>' +
            '</div>' +
          '</div>' +
          '<div class="gmv-progress-foot">' +
            '<span id="gmv-progress-pct">' + rateHtml(snap.progressPct, '%') + ' ' + txtHtml('complete', 'مكتمل') + '</span>' +
            '<span id="gmv-missing-copy">' + missingCopy + '</span>' +
          '</div>' +
        '</section>' +

        '<section class="gmv-kpi-grid">' +
          cardHtml(gmTxt('Needed daily orders', 'الطلبات اليومية المطلوبة'), neededPaceText(snap), gmTxt('net placed orders per day', 'طلبات صافية يوميا'), '#8b5cf6', 'target', tip(gmTxt('Needed daily orders', 'الطلبات اليومية المطلوبة'), gmTxt('How many net placed orders per day you need from now until the deadline. If the deadline already passed, this becomes the catch-up placed orders needed now.', 'عدد الطلبات الصافية المطلوبة يوميا من الآن حتى الموعد النهائي. إذا انتهت المهلة تصبح طلبات تعويض مطلوبة الآن.'), '(target GMV - current GMV) / delivered AOV / NDR / days left')) +
          cardHtml(gmTxt('Current run rate', 'وتيرة التشغيل الحالية'), rateHtml(snap.runRate, gmTxt('/day', '/يوم')), fmtNum(snap.elapsedDays) + ' ' + gmTxt('elapsed day(s)', 'أيام منقضية'), '#3b82f6', 'activity', tip(gmTxt('Current run rate', 'وتيرة التشغيل الحالية'), gmTxt('Your average net placed orders per elapsed day in the selected dashboard period.', 'متوسط الطلبات الصافية لكل يوم منقض في فترة لوحة التحكم المحددة.'), 'net placed orders / elapsed days')) +
          cardHtml(gmTxt('Pace gap', 'فجوة الوتيرة'), snap.paceGap > 0 ? ltrHtml('+' + fmtRate(snap.paceGap) + gmTxt('/day', '/يوم'), 'gmv-rate-text') : rateHtml(0, gmTxt('/day', '/يوم')), gmTxt('extra placed orders needed daily', 'طلبات إضافية مطلوبة يوميا'), snap.paceGap > 0 ? '#ef4444' : '#22d3ee', 'trendingUp', tip(gmTxt('Pace gap', 'فجوة الوتيرة'), gmTxt('The extra daily placed orders needed compared with your current run rate. Zero means your current pace is enough for the target.', 'عدد الطلبات اليومية الإضافية المطلوبة مقارنة بوتيرتك الحالية. الصفر يعني أن وتيرتك الحالية كافية للهدف.'), 'needed daily orders - current run rate')) +
          cardHtml(gmTxt('Projected finish', 'النهاية المتوقعة'), moneyHtml(snap.projectedGmv, 0, true), gmTxt('if current pace stays the same', 'إذا استمرت الوتيرة الحالية'), snap.projectedGmv >= snap.targetGmv ? '#22d3ee' : '#f59e0b', 'barChart', tip(gmTxt('Projected finish', 'النهاية المتوقعة'), gmTxt('Where your GMV is expected to finish if you keep placing orders at the current run rate until the deadline.', 'القيمة المتوقعة لـ GMV إذا استمرت الطلبات بنفس الوتيرة الحالية حتى الموعد النهائي.'), 'current GMV + current run rate * days left * NDR * delivered AOV')) +
        '</section>' +

        '<section class="gmv-main-grid">' +
          '<div class="gmv-panel gmv-answer-panel">' +
            '<div class="gmv-panel-heading">' +
              '<span>' + txtHtml('Target answer', 'إجابة الهدف') + '</span>' +
              '<small>' + txtHtml('plain calculation', 'حساب مباشر') + '</small>' +
            '</div>' +
            '<div class="gmv-answer-line"><strong>' + moneyHtml(snap.remainingGmv, 0, true) + '</strong><span>' + txtHtml('remaining GMV', 'GMV المتبقي') + ' ' + tip(gmTxt('Remaining GMV', 'GMV المتبقي'), gmTxt('The delivered-sales amount still missing before you reach the target.', 'قيمة المبيعات المسلمة التي لا تزال مطلوبة للوصول إلى الهدف.'), 'target GMV - current Net Total Delivered Sales') + '</span></div>' +
            '<div class="gmv-answer-stack">' +
              '<div><b>' + fmtNum(requiredDelivered) + '</b><span>' + gmTxt('delivered orders needed', 'طلبات مسلمة مطلوبة') + ' ' + tip(gmTxt('Delivered orders needed', 'الطلبات المسلمة المطلوبة'), gmTxt('How many delivered orders are needed to cover the missing GMV at your Delivered AOV.', 'عدد الطلبات المسلمة المطلوبة لتغطية GMV المتبقي حسب متوسط قيمة الطلب المسلم.'), 'remaining GMV / delivered AOV') + '</span></div>' +
              '<div><b>' + fmtNum(requiredOrders) + '</b><span>' + gmTxt('placed net orders needed', 'طلبات صافية مطلوبة') + ' ' + tip(gmTxt('Placed net orders needed', 'الطلبات الصافية المطلوبة'), gmTxt('How many net placed orders are needed before delivery losses. NDR converts placed orders into expected delivered orders.', 'عدد الطلبات الصافية المطلوبة قبل خسائر التسليم. يحول NDR الطلبات الموضوعة إلى طلبات مسلمة متوقعة.'), 'delivered orders needed / NDR') + '</span></div>' +
              '<div><b>' + fmtNum(snap.daysLeft) + '</b><span>' + gmTxt('day(s) left', 'أيام متبقية') + ' ' + tip(gmTxt('Days left', 'الأيام المتبقية'), gmTxt('The number of calendar days from today until your deadline. The daily target divides the remaining order need across these days.', 'عدد الأيام من اليوم حتى الموعد النهائي. الهدف اليومي يقسم الطلبات المتبقية على هذه الأيام.'), 'deadline - today') + '</span></div>' +
            '</div>' +
            '<div class="gmv-formula-box">' +
              '<span>' + txtHtml('Formula', 'المعادلة') + '</span>' +
              '<code id="gmv-formula-code">' + formulaHtml(snap) + '</code>' +
            '</div>' +
          '</div>' +

          '<div class="gmv-panel">' +
            '<div class="gmv-panel-heading">' +
              '<span>' + txtHtml('Scenario controls', 'تحكم السيناريو') + '</span>' +
              '<small>' + txtHtml('safe local simulation', 'محاكاة محلية آمنة') + '</small>' +
            '</div>' +
            '<div class="gmv-control-grid">' +
              '<label><span>' + ltrHtml('NDR') + ' ' + tip('NDR', gmTxt('Net delivery rate. This is the percent of net placed orders that usually become delivered orders.', 'معدل التسليم الصافي. هذه نسبة الطلبات الصافية التي تتحول عادة إلى طلبات مسلمة.'), 'delivered orders / net placed orders') + '</span><div class="gmv-input-wrap"><input id="gmv-ndr-input" type="number" min="0" max="100" step="0.1" value="' + esc(fmtRate(initialNdr)) + '"><em>' + ltrHtml('%') + '</em></div></label>' +
              '<label><span>' + txtHtml('Delivered AOV', 'متوسط قيمة الطلب المسلم') + ' ' + tip(gmTxt('Delivered AOV', 'متوسط قيمة الطلب المسلم'), gmTxt('Average value of a delivered order. Higher AOV means fewer delivered orders are needed to reach the same GMV.', 'متوسط قيمة الطلب المسلم. كلما ارتفع هذا المتوسط احتجت إلى طلبات مسلمة أقل لتحقيق نفس GMV.'), 'Net Total Delivered Sales / delivered orders') + '</span><div class="gmv-input-wrap"><input id="gmv-aov-input" type="number" min="0" step="0.1" value="' + esc(fmtRate(initialAov)) + '"><em>' + ltrHtml(currency) + '</em></div></label>' +
              '<label><span>' + txtHtml('Custom daily orders', 'طلبات يومية مخصصة') + ' ' + tip(gmTxt('Custom daily orders', 'الطلبات اليومية المخصصة'), gmTxt('A what-if number. Use it to test what happens if you place this many net orders per day until the deadline.', 'رقم افتراضي لاختبار ما سيحدث إذا حققت هذا العدد من الطلبات الصافية يوميا حتى الموعد النهائي.'), 'custom daily orders * days left * NDR * delivered AOV') + '</span><div class="gmv-input-wrap"><input id="gmv-custom-daily-input" type="number" min="0" step="1" value="' + esc(Math.ceil(initialCustomDaily || 0)) + '"><em>' + ltrHtml(gmTxt('/day', '/يوم')) + '</em></div></label>' +
            '</div>' +
            '<div class="gmv-impact-box" id="gmv-impact-box">' + impactHtml(snap) + '</div>' +
            '<div class="gmv-mini-facts">' +
              '<span>' + txtHtml('Current GMV', 'GMV الحالي') + ': <b>' + moneyHtml(snap.currentGmv, 0, true) + '</b></span>' +
              '<span>' + txtHtml('Delivered AOV', 'متوسط قيمة الطلب المسلم') + ': <b>' + moneyHtml(snap.deliveredAov, 1) + '</b></span>' +
              '<span>' + ltrHtml('NDR') + ': <b>' + rateHtml(snap.ndrPct, '%') + '</b></span>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="gmv-panel gmv-scenarios-panel">' +
          '<div class="gmv-panel-heading">' +
            '<span>' + txtHtml('Run-rate scenarios', 'سيناريوهات وتيرة التشغيل') + '</span>' +
            '<small>' + txtHtml('daily placed orders -> expected GMV', 'الطلبات اليومية ← GMV المتوقع') + '</small>' +
          '</div>' +
          '<div class="gmv-table-wrap">' +
            '<table class="gmv-scenario-table">' +
              '<thead><tr><th>' + txtHtml('Scenario', 'السيناريو') + '</th><th>' + txtHtml('Daily orders', 'الطلبات اليومية') + '</th><th>' + txtHtml('Delivered', 'المسلمة') + '</th><th>' + txtHtml('Expected GMV', 'GMV المتوقع') + '</th><th>' + txtHtml('Result', 'النتيجة') + '</th></tr></thead>' +
              '<tbody id="gmv-scenario-body">' + scenarioRowsHtml(snap) + '</tbody>' +
            '</table>' +
          '</div>' +
        '</section>' +
      '</div>' +
    '</div>';

  function currentInputs() {
    var targetEl = mountEl.querySelector('#gmv-target-input');
    var deadlineEl = mountEl.querySelector('#gmv-deadline-input');
    var ndrEl = mountEl.querySelector('#gmv-ndr-input');
    var aovEl = mountEl.querySelector('#gmv-aov-input');
    var customEl = mountEl.querySelector('#gmv-custom-daily-input');
    return {
      targetGmv: Math.max(0, Number(targetEl && targetEl.value || 0)),
      deadline: String(deadlineEl && deadlineEl.value || initialDeadline || ''),
      ndrPct: Math.max(0, Math.min(100, Number(ndrEl && ndrEl.value || 0))),
      deliveredAov: Math.max(0, Number(aovEl && aovEl.value || 0)),
      customDailyOrders: Math.max(0, Number(customEl && customEl.value || 0))
    };
  }

  function updateModel() {
    mountEl._gmvPlannerDraft = currentInputs();
    var model = targetState.snapshot(d, mountEl._gmvPlannerDraft);
    var m = statusMeta(model.status);
    var fill = mountEl.querySelector('#gmv-progress-fill');
    var track = mountEl.querySelector('#gmv-progress-track');
    var status = mountEl.querySelector('#gmv-status-pill');
    var main = mountEl.querySelector('#gmv-progress-main');
    var pct = mountEl.querySelector('#gmv-progress-pct');
    var missing = mountEl.querySelector('#gmv-missing-copy');
    var rows = mountEl.querySelector('#gmv-scenario-body');
    var kpiVals = mountEl.querySelectorAll('.gmv-kpi-value');
    var answerMain = mountEl.querySelector('.gmv-answer-line strong');
    var answerNums = mountEl.querySelectorAll('.gmv-answer-stack b');
    var facts = mountEl.querySelectorAll('.gmv-mini-facts b');
    var formula = mountEl.querySelector('#gmv-formula-code');
    var impact = mountEl.querySelector('#gmv-impact-box');
    var deadlineButtonText = mountEl.querySelector('#gmv-deadline-button span');
    if (fill) {
      fill.style.clipPath = 'inset(0 ' + (100 - Math.min(100, model.progressPct)).toFixed(2) + '% 0 0)';
    }
    if (track) {
      track.style.setProperty('--gmv-progress-pct', Math.min(100, model.progressPct).toFixed(2) + '%');
    }
    if (status) {
      status.textContent = m.label;
      status.style.color = m.color;
      status.style.background = m.color + '16';
      status.style.borderColor = m.color + '40';
    }
    if (main) main.innerHTML = progressMainHtml(model);
    if (pct) pct.innerHTML = rateHtml(model.progressPct, '%') + ' ' + txtHtml('complete', 'مكتمل');
    if (missing) missing.innerHTML = missingCopyHtml(model);
    if (rows) rows.innerHTML = scenarioRowsHtml(model);
    if (kpiVals[0]) kpiVals[0].innerHTML = neededPaceText(model);
    if (kpiVals[1]) kpiVals[1].innerHTML = rateHtml(model.runRate, gmTxt('/day', '/يوم'));
    if (kpiVals[2]) kpiVals[2].innerHTML = model.paceGap > 0 ? ltrHtml('+' + fmtRate(model.paceGap) + gmTxt('/day', '/يوم'), 'gmv-rate-text') : rateHtml(0, gmTxt('/day', '/يوم'));
    if (kpiVals[3]) kpiVals[3].innerHTML = moneyHtml(model.projectedGmv, 0, true);
    if (answerMain) answerMain.innerHTML = moneyHtml(model.remainingGmv, 0, true);
    if (answerNums[0]) answerNums[0].textContent = fmtNum(Math.ceil(model.neededDeliveredOrders || 0));
    if (answerNums[1]) answerNums[1].textContent = fmtNum(Math.ceil(model.neededNetOrders || 0));
    if (answerNums[2]) answerNums[2].textContent = fmtNum(model.daysLeft);
    if (facts[0]) facts[0].innerHTML = moneyHtml(model.currentGmv, 0, true);
    if (facts[1]) facts[1].innerHTML = moneyHtml(model.deliveredAov, 1);
    if (facts[2]) facts[2].innerHTML = rateHtml(model.ndrPct, '%');
    if (formula) formula.innerHTML = formulaHtml(model);
    if (impact) impact.innerHTML = impactHtml(model);
    if (deadlineButtonText) deadlineButtonText.innerHTML = ltrHtml(displayDate(model.deadline), 'gmv-date-text');
  }

  ['#gmv-target-input', '#gmv-ndr-input', '#gmv-aov-input', '#gmv-custom-daily-input'].forEach(function (selector) {
    var el = mountEl.querySelector(selector);
    if (el) {
      el.addEventListener('input', updateModel);
      el.addEventListener('change', updateModel);
    }
  });

  var deadlineButton = mountEl.querySelector('#gmv-deadline-button');
  if (deadlineButton) {
    deadlineButton.addEventListener('click', function () {
      var deadlineEl = mountEl.querySelector('#gmv-deadline-input');
      openGmvDeadlinePicker(deadlineButton, deadlineEl && deadlineEl.value || initialDeadline, function (nextDate) {
        if (deadlineEl) deadlineEl.value = nextDate;
        updateModel();
      });
    });
  }

  mountEl.querySelectorAll('[data-gmv-deadline]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var deadlineEl = mountEl.querySelector('#gmv-deadline-input');
      var nextDate = btn.getAttribute('data-gmv-deadline') || '';
      if (!deadlineEl) return;
      deadlineEl.value = nextDate;
      closeGmvDeadlinePicker();
      updateModel();
    });
  });

  var saveBtn = mountEl.querySelector('#gmv-save-target');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      var values = currentInputs();
      targetState.set({
        targetGmv: values.targetGmv,
        currency: currency,
        deadline: values.deadline
      }, accountId, country);
      mountEl._gmvPlannerDraft = values;
      window.renderSectionGmvTarget(mountEl, data, ctx);
    });
  }

  var clearBtn = mountEl.querySelector('#gmv-clear-target');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      targetState.clear(accountId, country);
      mountEl._gmvPlannerDraft = {};
      window.renderSectionGmvTarget(mountEl, data, ctx);
    });
  }

  mountEl._dashboardSectionCleanup = function () {
    closeGmvDeadlinePicker();
  };
};
