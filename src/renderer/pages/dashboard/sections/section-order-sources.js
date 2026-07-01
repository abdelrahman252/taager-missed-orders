/*
   section-order-sources.js
   Compares Taager order source values from "order received by".
*/
(function () {
  'use strict';

  window.renderSectionOrderSources = function (mountEl, data, ctx) {
    var fullData = (ctx && ctx.data) || data || {};
    var model = fullData.orderSources || (fullData.roi && fullData.roi.orderSources) || { summary: {}, sources: [], minSample: 30 };
    var sources = Array.isArray(model.sources) ? model.sources : [];
    var summary = model.summary || {};
    var minSample = Number(model.minSample || 30);
    var activeCurrency = (fullData.meta && fullData.meta.activeCurrency) || window.dashboardActiveCurrency || 'SAR';

    function isRtl() {
      return window.dashboardI18n ? window.dashboardI18n.isRtl() : false;
    }

    function pick(en, ar) {
      if (window.dashboardI18n && typeof window.dashboardI18n.pick === 'function') {
        return window.dashboardI18n.pick(en, ar);
      }
      return isRtl() ? ar : en;
    }

    function t(key, fallback) {
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

    function pct(value) {
      value = Number(value || 0);
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    }

    function money(value) {
      return num(value, 2) + ' ' + esc(activeCurrency);
    }

    function sourceLabel(source) {
      var label = String(source && source.label || '').trim();
      if (label) return label;
      return pick('Unknown source', '\u0645\u0635\u062f\u0631 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641');
    }

    function confidenceInfo(source) {
      var net = Number(source && source.netOrders || 0);
      if (net >= Math.max(100, minSample * 3)) {
        return { tone: 'good', label: pick('High confidence', '\u062b\u0642\u0629 \u0639\u0627\u0644\u064a\u0629') };
      }
      if (net >= minSample) {
        return { tone: 'warn', label: pick('Medium confidence', '\u062b\u0642\u0629 \u0645\u062a\u0648\u0633\u0637\u0629') };
      }
      return { tone: 'danger', label: pick('Low sample', '\u0639\u064a\u0646\u0629 \u0642\u0644\u064a\u0644\u0629') };
    }

    function ndrTone(value, baseline) {
      value = Number(value || 0);
      baseline = Number(baseline || 0);
      if (value >= baseline + 4) return 'good';
      if (value >= baseline - 2) return 'warn';
      return 'danger';
    }

    function reliableScore(source) {
      var net = Number(source.netOrders || 0);
      var confidence = net >= 100 ? 1 : (net >= minSample ? 0.72 : 0.35);
      var volumeLift = Math.min(8, Math.log(Math.max(1, net)) / Math.log(10) * 2);
      return Number(source.ndr || 0) * confidence + volumeLift;
    }

    function insightItems() {
      if (!sources.length) return [];
      var overallNdr = Number(summary.ndr || 0);
      var byNdr = sources.slice().sort(function (a, b) { return Number(b.ndr || 0) - Number(a.ndr || 0) || Number(b.netOrders || 0) - Number(a.netOrders || 0); });
      var reliable = sources.filter(function (source) { return Number(source.netOrders || 0) >= minSample; });
      var balanced = reliable.slice().sort(function (a, b) { return reliableScore(b) - reliableScore(a); })[0] || null;
      var highest = byNdr[0] || null;
      var largest = sources.slice().sort(function (a, b) { return Number(b.netOrders || 0) - Number(a.netOrders || 0); })[0] || null;
      var weakest = sources.slice().sort(function (a, b) { return Number(a.ndr || 0) - Number(b.ndr || 0) || Number(b.netOrders || 0) - Number(a.netOrders || 0); })[0] || null;
      var items = [];

      if (highest) {
        var highConfidence = confidenceInfo(highest);
        var baselineDelta = Number(highest.ndr || 0) - overallNdr;
        items.push({
          tone: ndrTone(highest.ndr, overallNdr),
          iconName: 'trendingUp',
          title: pick('Highest NDR signal', '\u0623\u0642\u0648\u0649 \u0625\u0634\u0627\u0631\u0629 NDR'),
          metric: pct(highest.ndr),
          badge: highConfidence.label,
          badgeTone: highConfidence.tone,
          body: pick(
            sourceLabel(highest) + ' is ' + (baselineDelta >= 0 ? '+' : '') + num(baselineDelta, 2) + ' points vs overall NDR, from ' + num(highest.netOrders || 0) + ' net orders.',
            sourceLabel(highest) + ' \u0628\u0641\u0627\u0631\u0642 ' + (baselineDelta >= 0 ? '+' : '') + num(baselineDelta, 2) + ' \u0646\u0642\u0637\u0629 \u0639\u0646 \u0625\u062c\u0645\u0627\u0644\u064a NDR\u060c \u0645\u0646 ' + num(highest.netOrders || 0) + ' \u0637\u0644\u0628 \u0635\u0627\u0641\u064a.'
          )
        });
      }

      if (largest && highest && largest !== highest) {
        var largestDelta = Number(largest.ndr || 0) - Number(highest.ndr || 0);
        items.push({
          tone: largestDelta >= -3 ? 'warn' : 'info',
          iconName: 'barChart',
          title: pick('Volume anchor', '\u0645\u0635\u062f\u0631 \u0627\u0644\u062d\u062c\u0645 \u0627\u0644\u0623\u0643\u0628\u0631'),
          metric: num(largest.netOrders || 0),
          badge: pct(largest.ndr),
          badgeTone: ndrTone(largest.ndr, overallNdr),
          body: pick(
            sourceLabel(largest) + ' carries most volume. Its NDR is ' + num(Math.abs(largestDelta), 2) + ' points ' + (largestDelta >= 0 ? 'above' : 'below') + ' the highest-NDR source.',
            sourceLabel(largest) + ' \u064a\u062d\u0645\u0644 \u0645\u0639\u0638\u0645 \u0627\u0644\u062d\u062c\u0645. NDR \u0644\u062f\u064a\u0647 ' + (largestDelta >= 0 ? '\u0623\u0639\u0644\u0649' : '\u0623\u0642\u0644') + ' \u0628\u0641\u0627\u0631\u0642 ' + num(Math.abs(largestDelta), 2) + ' \u0646\u0642\u0637\u0629 \u0645\u0646 \u0623\u0639\u0644\u0649 \u0645\u0635\u062f\u0631.'
          )
        });
      }

      if (weakest && Number(weakest.netOrders || 0) > 0) {
        var failedShare = Number(weakest.netOrders || 0) > 0 ? (Number(weakest.failed || 0) / Number(weakest.netOrders || 0)) * 100 : 0;
        var pendingShare = Number(weakest.netOrders || 0) > 0 ? (Number(weakest.pending || 0) / Number(weakest.netOrders || 0)) * 100 : 0;
        items.push({
          tone: 'danger',
          iconName: 'circleXmark',
          title: pick('Weakest delivery source', '\u0623\u0636\u0639\u0641 \u0645\u0635\u062f\u0631 \u0641\u064a \u0627\u0644\u062a\u0633\u0644\u064a\u0645'),
          metric: pct(weakest.ndr),
          badge: pick('Failed ' + pct(failedShare), '\u0641\u0634\u0644 ' + pct(failedShare)),
          badgeTone: 'danger',
          body: pick(
            sourceLabel(weakest) + ' needs review first. Pending share is ' + pct(pendingShare) + ', so split the issue between confirmation delay and delivery failure.',
            sourceLabel(weakest) + ' \u064a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629 \u0623\u0648\u0644\u0627. \u0646\u0633\u0628\u0629 \u0627\u0644\u0645\u0639\u0644\u0642 ' + pct(pendingShare) + '\u060c \u0641\u0627\u0641\u0635\u0644 \u0628\u064a\u0646 \u062a\u0623\u062e\u064a\u0631 \u0627\u0644\u062a\u0623\u0643\u064a\u062f \u0648\u0641\u0634\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645.'
          )
        });
      }

      if (balanced) {
        var balancedConfidence = confidenceInfo(balanced);
        items.push({
          tone: balancedConfidence.tone === 'good' ? 'good' : 'warn',
          iconName: 'calculator',
          title: pick('Calculator recommendation', '\u062a\u0648\u0635\u064a\u0629 \u0627\u0644\u062d\u0627\u0633\u0628\u0629'),
          metric: pct(balanced.ndr),
          badge: balancedConfidence.label,
          badgeTone: balancedConfidence.tone,
          body: pick(
            'Use ' + sourceLabel(balanced) + ' as the practical NDR assumption. It balances delivery rate with sample size better than smaller spikes.',
            '\u0627\u0633\u062a\u062e\u062f\u0645 ' + sourceLabel(balanced) + ' \u0643\u0627\u0641\u062a\u0631\u0627\u0636 NDR \u0639\u0645\u0644\u064a. \u064a\u0648\u0627\u0632\u0646 \u0628\u064a\u0646 \u0645\u0639\u062f\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0648\u062d\u062c\u0645 \u0627\u0644\u0639\u064a\u0646\u0629 \u0623\u0641\u0636\u0644 \u0645\u0646 \u0627\u0644\u0642\u0641\u0632\u0627\u062a \u0627\u0644\u0635\u063a\u064a\u0631\u0629.'
          )
        });
      }

      return items.slice(0, 4);
    }

    function summaryCard(label, value, sub, tone) {
      return '<div class="os-summary-card os-tone-' + esc(tone || 'neutral') + '">' +
        '<span>' + esc(label) + '</span>' +
        '<strong>' + value + '</strong>' +
        '<small>' + esc(sub || '') + '</small>' +
      '</div>';
    }

    function miniList(items, emptyText) {
      items = Array.isArray(items) ? items : [];
      if (!items.length) return '<span class="os-empty-mini">' + esc(emptyText) + '</span>';
      return items.map(function (item) {
        return '<span class="os-mini-chip"><bdi dir="auto">' + esc(item.name) + '</bdi><strong>' + num(item.orders || 0) + '</strong></span>';
      }).join('');
    }

    function sourceInitial(source) {
      var label = sourceLabel(source).trim();
      var first = label.charAt(0) || '?';
      return first === '_' || first === '-' ? '#' : first.toUpperCase();
    }

    function sourceNdrTone(source) {
      return ndrTone(source && source.ndr, summary.ndr);
    }

    function sourceHealth(source) {
      var net = Number(source && source.netOrders || 0);
      var ndr = Number(source && source.ndr || 0);
      var overallNdr = Number(summary.ndr || 0);
      var confidence = confidenceInfo(source);
      var tone = sourceNdrTone(source);
      var failedShare = net > 0 ? (Number(source.failed || 0) / net) * 100 : 0;
      var pendingShare = net > 0 ? (Number(source.pending || 0) / net) * 100 : 0;
      var title = '';
      var issue = '';
      var calculatorUse = '';
      var action = '';

      if (net < minSample) {
        title = pick('Promising but low confidence', '\u0648\u0627\u0639\u062f \u0644\u0643\u0646 \u0627\u0644\u062b\u0642\u0629 \u0645\u0646\u062e\u0641\u0636\u0629');
        issue = pick('Low volume', '\u062d\u062c\u0645 \u0642\u0644\u064a\u0644');
        calculatorUse = pick('Use carefully', '\u0627\u0633\u062a\u062e\u062f\u0645\u0647 \u0628\u062d\u0630\u0631');
        action = pick(
          'Keep watching until it reaches ' + minSample + ' net orders before treating it as a default assumption.',
          '\u0631\u0627\u0642\u0628\u0647 \u062d\u062a\u0649 \u064a\u0635\u0644 \u0625\u0644\u0649 ' + minSample + ' \u0637\u0644\u0628 \u0635\u0627\u0641\u064a \u0642\u0628\u0644 \u0627\u0639\u062a\u0645\u0627\u062f\u0647 \u0643\u0627\u0641\u062a\u0631\u0627\u0636 \u0627\u0641\u062a\u0631\u0627\u0636\u064a.'
        );
      } else if (tone === 'good') {
        title = pick('Reliable delivery advantage', '\u0645\u064a\u0632\u0629 \u062a\u0633\u0644\u064a\u0645 \u0645\u0648\u062b\u0648\u0642\u0629');
        issue = pick('Healthy source', '\u0645\u0635\u062f\u0631 \u0635\u062d\u064a');
        calculatorUse = pick('Recommended', '\u0645\u0648\u0635\u0649 \u0628\u0647');
        action = pick(
          'This is a strong NDR assumption candidate because the delivery rate beats the account baseline with enough sample.',
          '\u0647\u0630\u0627 \u0645\u0631\u0634\u062d \u0642\u0648\u064a \u0644\u0627\u0641\u062a\u0631\u0627\u0636 NDR \u0644\u0623\u0646 \u0645\u0639\u062f\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u064a\u062a\u0641\u0648\u0642 \u0639\u0644\u0649 \u062e\u0637 \u0627\u0644\u062d\u0633\u0627\u0628 \u0645\u0639 \u0639\u064a\u0646\u0629 \u0643\u0627\u0641\u064a\u0629.'
        );
      } else if (failedShare >= Math.max(12, overallNdr * 0.45)) {
        title = pick('Delivery failure pressure', '\u0636\u063a\u0637 \u0641\u0634\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645');
        issue = pick('Delivery failures', '\u0641\u0634\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645');
        calculatorUse = pick('Avoid as default', '\u062a\u062c\u0646\u0628\u0647 \u0643\u0627\u0641\u062a\u0631\u0627\u0636 \u0623\u0633\u0627\u0633\u064a');
        action = pick(
          'Review delivery failures before scaling this source or using its NDR in forecast decisions.',
          '\u0631\u0627\u062c\u0639 \u0641\u0634\u0644 \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0642\u0628\u0644 \u062a\u0643\u0628\u064a\u0631 \u0647\u0630\u0627 \u0627\u0644\u0645\u0635\u062f\u0631 \u0623\u0648 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 NDR \u0627\u0644\u062e\u0627\u0635 \u0628\u0647 \u0641\u064a \u0627\u0644\u062a\u0648\u0642\u0639.'
        );
      } else if (pendingShare >= 20) {
        title = pick('Confirmation bottleneck', '\u0627\u062e\u062a\u0646\u0627\u0642 \u0641\u064a \u0627\u0644\u062a\u0623\u0643\u064a\u062f');
        issue = pick('Pending confirmation', '\u062a\u0623\u0643\u064a\u062f \u0645\u0639\u0644\u0642');
        calculatorUse = pick('Use carefully', '\u0627\u0633\u062a\u062e\u062f\u0645\u0647 \u0628\u062d\u0630\u0631');
        action = pick(
          'The source may improve if pending orders move faster through confirmation.',
          '\u0642\u062f \u064a\u062a\u062d\u0633\u0646 \u0627\u0644\u0645\u0635\u062f\u0631 \u0625\u0630\u0627 \u062a\u062d\u0631\u0643\u062a \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0645\u0639\u0644\u0642\u0629 \u0623\u0633\u0631\u0639 \u062e\u0644\u0627\u0644 \u0627\u0644\u062a\u0623\u0643\u064a\u062f.'
        );
      } else {
        title = pick('Stable but not leading', '\u0645\u0633\u062a\u0642\u0631 \u0644\u0643\u0646 \u0644\u064a\u0633 \u0627\u0644\u0623\u0642\u0648\u0649');
        issue = pick('Watch performance', '\u0631\u0627\u0642\u0628 \u0627\u0644\u0623\u062f\u0627\u0621');
        calculatorUse = pick('Secondary option', '\u062e\u064a\u0627\u0631 \u062b\u0627\u0646\u0648\u064a');
        action = pick(
          'Use this as a comparison source, but prefer the strongest reliable source for calculator assumptions.',
          '\u0627\u0633\u062a\u062e\u062f\u0645\u0647 \u0643\u0645\u0635\u062f\u0631 \u0645\u0642\u0627\u0631\u0646\u0629\u060c \u0648\u0641\u0636\u0644 \u0623\u0642\u0648\u0649 \u0645\u0635\u062f\u0631 \u0645\u0648\u062b\u0648\u0642 \u0644\u0627\u0641\u062a\u0631\u0627\u0636\u0627\u062a \u0627\u0644\u062d\u0627\u0633\u0628\u0629.'
        );
      }

      return {
        tone: tone,
        confidence: confidence,
        title: title,
        issue: issue,
        calculatorUse: calculatorUse,
        action: action,
        failedShare: failedShare,
        pendingShare: pendingShare,
        ndrDelta: ndr - overallNdr
      };
    }

    function healthChip(label, value, tone) {
      return '<span class="os-health-chip os-health-' + esc(tone || 'neutral') + '"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong></span>';
    }

    function statusSegments(source) {
      var net = Math.max(1, Number(source.netOrders || 0));
      var rows = [
        { key: 'delivered', label: pick('Delivered', '\u0645\u0633\u0644\u0645'), value: Number(source.delivered || 0), tone: 'good' },
        { key: 'shipping', label: pick('Shipping', '\u0634\u062d\u0646'), value: Number(source.shipping || 0), tone: 'info' },
        { key: 'confirmed', label: pick('Confirmed', '\u0645\u0624\u0643\u062f'), value: Number(source.confirmed || 0), tone: 'blue' },
        { key: 'pending', label: pick('Pending', '\u0645\u0639\u0644\u0642'), value: Number(source.pending || 0), tone: 'warn' },
        { key: 'failed', label: pick('Failed', '\u0641\u0634\u0644'), value: Number(source.failed || 0), tone: 'danger' }
      ];
      var bar = rows.map(function (item) {
        var width = Math.max(0, Math.min(100, (item.value / net) * 100));
        return item.value > 0
          ? '<span class="os-status-segment os-status-' + item.tone + '" style="width:' + width.toFixed(3) + '%" title="' + esc(item.label + ': ' + num(item.value)) + '"></span>'
          : '';
      }).join('');
      var legend = rows.map(function (item) {
        return '<span class="os-status-legend os-status-label-' + item.tone + '"><i></i>' + esc(item.label) + '<strong>' + num(item.value) + '</strong></span>';
      }).join('');
      return '<div class="os-status-panel"><div class="os-status-head"><span>' + esc(pick('Where orders are now', '\u0623\u064a\u0646 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0622\u0646')) + '</span><strong>' + esc(num(source.netOrders || 0) + ' ' + pick('net orders', '\u0637\u0644\u0628 \u0635\u0627\u0641\u064a')) + '</strong></div><div class="os-status-bar">' + bar + '</div><div class="os-status-legend-row">' + legend + '</div></div>';
    }

    function detailMetric(label, value, sub, tone) {
      return '<div class="os-detail-block os-detail-' + esc(tone || 'neutral') + '"><span>' + esc(label) + '</span><strong>' + value + '</strong><small>' + esc(sub || '') + '</small></div>';
    }

    function insightCardHtml(item) {
      var tone = item && item.tone || 'info';
      var badgeTone = item && item.badgeTone || tone;
      return '<article class="os-insight-card os-insight-' + esc(tone) + '">' +
        '<div class="os-insight-icon">' + icon(item.iconName || 'info') + '</div>' +
        '<div class="os-insight-copy">' +
          '<div class="os-insight-top">' +
            '<h4>' + esc(item.title || '') + '</h4>' +
            '<span class="os-insight-badge os-badge-' + esc(badgeTone) + '">' + esc(item.badge || '') + '</span>' +
          '</div>' +
          '<strong>' + esc(item.metric || '') + '</strong>' +
          '<p>' + esc(item.body || '') + '</p>' +
        '</div>' +
      '</article>';
    }

    function sourceRow(source, index) {
      var low = Number(source.netOrders || 0) < minSample;
      var health = sourceHealth(source);
      return '<tbody class="os-source-group" data-source-index="' + index + '">' +
        '<tr class="os-source-row" data-source-toggle="' + index + '">' +
          '<td><button type="button" class="os-expand-btn" aria-expanded="false">' + icon('chevronDown') + '</button><span class="os-source-mark">' + esc(sourceInitial(source)) + '</span><bdi dir="auto">' + esc(sourceLabel(source)) + '</bdi>' + (low ? '<span class="os-low-badge">' + esc(pick('Low sample', '\u0639\u064a\u0646\u0629 \u0642\u0644\u064a\u0644\u0629')) + '</span>' : '') + '</td>' +
          '<td>' + num(source.netOrders || 0) + '</td>' +
          '<td>' + num(source.delivered || 0) + '</td>' +
          '<td><strong class="os-ndr">' + pct(source.ndr) + '</strong></td>' +
          '<td>' + money(source.deliveredProfit || 0) + '</td>' +
          '<td>' + money(source.avgProfit || 0) + '</td>' +
        '</tr>' +
        '<tr class="os-detail-row" hidden><td colspan="6">' +
          '<div class="os-source-panel os-panel-' + esc(health.tone) + '">' +
            '<div class="os-verdict-row">' +
              '<div class="os-verdict-main">' +
                '<span class="os-verdict-icon">' + icon(health.tone === 'good' ? 'trendingUp' : (health.tone === 'danger' ? 'circleXmark' : 'activity')) + '</span>' +
                '<div><h3>' + esc(health.title) + '</h3><p>' + esc(health.action) + '</p></div>' +
              '</div>' +
              '<div class="os-health-strip">' +
                healthChip('NDR', pct(source.ndr), health.tone) +
                healthChip(pick('Confidence', '\u0627\u0644\u062b\u0642\u0629'), health.confidence.label, health.confidence.tone) +
                healthChip(pick('Main issue', '\u0627\u0644\u0646\u0642\u0637\u0629 \u0627\u0644\u0623\u0647\u0645'), health.issue, health.tone === 'danger' ? 'danger' : (health.tone === 'good' ? 'good' : 'warn')) +
                healthChip(pick('Calculator', '\u0627\u0644\u062d\u0627\u0633\u0628\u0629'), health.calculatorUse, health.tone) +
              '</div>' +
            '</div>' +
            statusSegments(source) +
            '<div class="os-details-grid">' +
              detailMetric(pick('Raw and excluded', '\u0627\u0644\u062e\u0627\u0645 \u0648\u0627\u0644\u0645\u0633\u062a\u0628\u0639\u062f'), num(source.rawOrders || 0) + ' / ' + num(source.canceledByYou || 0), pick('Raw orders / Canceled by you', '\u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u062e\u0627\u0645 / \u0645\u0644\u063a\u064a \u0628\u0648\u0627\u0633\u0637\u062a\u0643'), 'neutral') +
              detailMetric(pick('Confirmation rate', '\u0646\u0633\u0628\u0629 \u0627\u0644\u062a\u0623\u0643\u064a\u062f'), pct(source.confirmationRate), num(source.confirmationCount || 0) + ' ' + pick('confirmed-base orders', '\u0637\u0644\u0628 \u062f\u0627\u062e\u0644 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u062a\u0623\u0643\u064a\u062f'), 'info') +
              detailMetric('NDR', pct(source.ndr) + ' <small class="os-inline-delta">' + (health.ndrDelta >= 0 ? '+' : '') + num(health.ndrDelta, 2) + 'pp</small>', pick('Compared with account overall NDR', '\u0645\u0642\u0627\u0631\u0646\u0629 \u0628\u0625\u062c\u0645\u0627\u0644\u064a NDR \u0644\u0644\u062d\u0633\u0627\u0628'), health.tone) +
              detailMetric(pick('Delivered money', '\u0623\u0631\u0642\u0627\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645'), money(source.deliveredSales || 0), money(source.deliveredAov || 0) + ' ' + pick('delivered AOV', '\u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0645\u0633\u0644\u0645'), 'good') +
              detailMetric(pick('Failed pressure', '\u0636\u063a\u0637 \u0627\u0644\u0641\u0634\u0644'), pct(health.failedShare), num(source.failed || 0) + ' ' + pick('failed orders', '\u0637\u0644\u0628 \u0641\u0627\u0634\u0644'), health.failedShare > 10 ? 'danger' : 'neutral') +
            '</div>' +
            '<div class="os-top-grid">' +
              '<div><h4>' + esc(pick('Top products', '\u0623\u0641\u0636\u0644 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a')) + '</h4><div class="os-mini-list">' + miniList(source.topProducts, pick('No product data', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0646\u062a\u062c\u0627\u062a')) + '</div></div>' +
              '<div><h4>' + esc(pick('Top cities', '\u0623\u0641\u0636\u0644 \u0627\u0644\u0645\u062f\u0646')) + '</h4><div class="os-mini-list">' + miniList(source.topCities, pick('No city data', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u062f\u0646')) + '</div></div>' +
            '</div>' +
          '</div>' +
        '</td></tr>' +
      '</tbody>';
    }

    mountEl.innerHTML = '<section class="order-sources-section" dir="' + (isRtl() ? 'rtl' : 'ltr') + '">' +
      '<div class="os-header">' +
        '<div><p>' + esc(t('nav.orderSources', pick('Order Sources', '\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u0637\u0644\u0628\u0627\u062a'))) + '</p><h2>' + esc(pick('Source-level delivery performance', '\u0623\u062f\u0627\u0621 \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u062d\u0633\u0628 \u0645\u0635\u062f\u0631 \u0627\u0644\u0637\u0644\u0628')) + '</h2></div>' +
        '<span class="os-sample-note">' + esc(pick('Best source requires at least ' + minSample + ' net orders.', '\u062a\u062d\u062f\u064a\u062f \u0623\u0641\u0636\u0644 \u0645\u0635\u062f\u0631 \u064a\u062d\u062a\u0627\u062c \u0625\u0644\u0649 ' + minSample + ' \u0637\u0644\u0628 \u0635\u0627\u0641\u064a \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.')) + '</span>' +
      '</div>' +
      '<div class="os-summary-grid">' +
        summaryCard(pick('Sources used', '\u0627\u0644\u0645\u0635\u0627\u062f\u0631 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0629'), num(summary.sourceCount || sources.length), pick('Distinct raw source values', '\u0642\u064a\u0645 \u0645\u0635\u062f\u0631 \u062e\u0627\u0645 \u0645\u062e\u062a\u0644\u0641\u0629'), 'info') +
        summaryCard(pick('Total net orders', '\u0625\u062c\u0645\u0627\u0644\u064a \u0635\u0627\u0641\u064a \u0627\u0644\u0637\u0644\u0628\u0627\u062a'), num(summary.netOrders || 0), pick('Raw minus Canceled by you', '\u0627\u0644\u062e\u0627\u0645 \u0646\u0627\u0642\u0635 \u0645\u0644\u063a\u064a \u0628\u0648\u0627\u0633\u0637\u062a\u0643'), 'neutral') +
        summaryCard(pick('Delivered orders', '\u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0645\u0633\u0644\u0645\u0629'), num(summary.delivered || 0), money(summary.deliveredProfit || 0), 'good') +
        summaryCard(pick('Overall NDR', '\u0625\u062c\u0645\u0627\u0644\u064a NDR'), pct(summary.ndr || 0), pick('Delivered / Net orders', '\u0627\u0644\u0645\u0633\u0644\u0645 / \u0635\u0627\u0641\u064a \u0627\u0644\u0637\u0644\u0628\u0627\u062a'), 'warn') +
      '</div>' +
      '<div class="os-table-wrap">' +
        '<table class="os-table"><thead><tr>' +
          '<th>' + esc(pick('Source', '\u0627\u0644\u0645\u0635\u062f\u0631')) + '</th>' +
          '<th>' + esc(pick('Net Orders', '\u0635\u0627\u0641\u064a \u0627\u0644\u0637\u0644\u0628\u0627\u062a')) + '</th>' +
          '<th>' + esc(pick('Delivered', '\u0627\u0644\u0645\u0633\u0644\u0645')) + '</th>' +
          '<th>NDR</th>' +
          '<th>' + esc(pick('Delivered Profit', '\u0631\u0628\u062d \u0627\u0644\u0645\u0633\u0644\u0645')) + '</th>' +
          '<th>' + esc(pick('Avg. Profit', '\u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u0631\u0628\u062d')) + '</th>' +
        '</tr></thead>' +
        (sources.length ? sources.map(sourceRow).join('') : '<tbody><tr><td colspan="6" class="os-empty">' + esc(pick('No order source values found for this period.', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u064a\u0645 \u0645\u0635\u062f\u0631 \u0637\u0644\u0628 \u0644\u0647\u0630\u0647 \u0627\u0644\u0641\u062a\u0631\u0629.')) + '</td></tr></tbody>') +
        '</table>' +
      '</div>' +
      '<div class="os-insights"><h3>' + esc(pick('Insights', '\u0627\u0644\u0631\u0624\u0649')) + '</h3><div class="os-insight-grid">' +
        (insightItems().length ? insightItems().map(insightCardHtml).join('') : '<p class="os-empty-insight">' + esc(pick('Add more orders with source values to generate reliable comparisons.', '\u0623\u0636\u0641 \u0637\u0644\u0628\u0627\u062a \u0623\u0643\u062b\u0631 \u0628\u0642\u064a\u0645 \u0645\u0635\u062f\u0631 \u0644\u0625\u0646\u0634\u0627\u0621 \u0645\u0642\u0627\u0631\u0646\u0627\u062a \u0645\u0648\u062b\u0648\u0642\u0629.')) + '</p>') +
      '</div></div>' +
    '</section>';

    mountEl.querySelectorAll('[data-source-toggle]').forEach(function (row) {
      row.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('a')) return;
        var group = row.closest('.os-source-group');
        var detail = group && group.querySelector('.os-detail-row');
        var btn = row.querySelector('.os-expand-btn');
        if (!detail) return;
        var opening = detail.hidden;
        detail.hidden = !opening;
        if (btn) btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (group) group.classList.toggle('is-open', opening);
      });
    });
  };
})();
