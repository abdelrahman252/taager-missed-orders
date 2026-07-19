/*
   section-product-sources.js
   Product performance inside each Taager source or ad-platform source.
*/
(function () {
  'use strict';

  var PAGE_SIZE = 12;

  window.renderSectionProductSources = function (mountEl, data, ctx) {
    if (!mountEl) return;
    mountEl._productSourcesLatestData = data;
    mountEl._productSourcesLatestCtx = ctx;
    var fullData = (ctx && ctx.data) || data || {};
    var taagerModel = fullData.productSources || { summary: {}, sources: [], products: [], minSample: 30 };
    var platformModel = fullData.platformProductSources || { summary: {}, sources: [], products: [], minSample: 30, type: 'platform' };
    var taagerOrderModel = fullData.orderSources || (fullData.roi && fullData.roi.orderSources) || { summary: {}, sources: [] };
    var platformOrderModel = fullData.platformSources || (fullData.roi && fullData.roi.platformSources) || { summary: {}, sources: [] };
    var activeMode = mountEl._productSourcesMode === 'platform' ? 'platform' : 'taager';
    var model = activeMode === 'platform' ? platformModel : taagerModel;
    var orderModel = activeMode === 'platform' ? platformOrderModel : taagerOrderModel;
    var sources = Array.isArray(model.sources) ? model.sources : [];
    var orderSources = Array.isArray(orderModel.sources) ? orderModel.sources : [];
    var minSample = Number(model.minSample || 30);
    var activeCurrency = (fullData.meta && fullData.meta.activeCurrency) || window.dashboardActiveCurrency || 'SAR';
    var selectedKey = mountEl._productSourcesSelectedKey || '__all__';
    var page = Number(mountEl._productSourcesPage || 1);
    var searchQuery = String(mountEl._productSourcesSearch || '').trim();
    var renderCache = prepareRenderCache(model, orderModel, activeMode);
    var selectedSource = selectedKey === '__all__'
      ? null
      : renderCache.sourceByKey[String(selectedKey)] || null;
    if (selectedKey !== '__all__' && !selectedSource) {
      selectedKey = '__all__';
      mountEl._productSourcesSelectedKey = selectedKey;
    }

    function isRtl() {
      return window.dashboardI18n ? window.dashboardI18n.isRtl() : false;
    }

    function pick(en, ar) {
      if (window.dashboardI18n && typeof window.dashboardI18n.pick === 'function') return window.dashboardI18n.pick(en, ar);
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

    function attr(value) {
      return esc(value).replace(/`/g, '&#96;');
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

    function productLabel(product) {
      var label = String(product && product.name || product && product.sku || '').trim();
      return label || pick('Unknown product', 'منتج غير معروف');
    }

    function sourceLabel(source) {
      var label = String(source && source.label || '').trim();
      return label || pick('Unknown source', 'مصدر غير معروف');
    }

    function normalizedPlatformKey(value) {
      var raw = String(value == null ? '' : value).trim().toLowerCase().replace(/[_-]+/g, ' ');
      if (/\btik\s*tok\b|\btiktok\b|\btik\b/.test(raw)) return 'tiktok';
      if (/\bfacebook\b|\bmeta\b|\bfb\b/.test(raw)) return 'facebook';
      if (/\bsnap\s*chat\b|\bsnapchat\b|\bsnap\b|\bsc\b/.test(raw)) return 'snapchat';
      return raw || '__unknown__';
    }

    function orderSourceKey(source) {
      if (!source) return '';
      var key = String(source.key || source.rawSource || source.label || '').trim();
      return activeMode === 'platform' ? normalizedPlatformKey(key) : (key || '__unknown__');
    }

    function selectedOrderSummary() {
      if (selectedKey === '__all__') return orderModel.summary || model.summary || {};
      var wanted = activeMode === 'platform' ? normalizedPlatformKey(selectedKey) : selectedKey;
      var match = renderCache.orderSourceByKey[String(wanted)];
      return match || selectedSource || {};
    }

    function normalizeSearch(value) {
      return String(value || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[\u064b-\u065f\u0670]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/[ةه]/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function prepareRenderCache(productModel, sourceOrderModel, mode) {
      productModel = productModel || {};
      sourceOrderModel = sourceOrderModel || {};
      var productSourcesRef = Array.isArray(productModel.sources) ? productModel.sources : [];
      var productRowsRef = Array.isArray(productModel.products) ? productModel.products : [];
      var orderSourcesRef = Array.isArray(sourceOrderModel.sources) ? sourceOrderModel.sources : [];
      var cache = productModel._productSourcesRenderCache;
      if (
        cache &&
        cache.mode === mode &&
        cache.sourcesRef === productSourcesRef &&
        cache.productsRef === productRowsRef &&
        cache.orderSourcesRef === orderSourcesRef
      ) {
        return cache;
      }

      var sourceByKey = {};
      productSourcesRef.forEach(function (source) {
        if (!source) return;
        sourceByKey[String(source.key)] = source;
        (Array.isArray(source.products) ? source.products : []).forEach(prepareSearchText);
      });
      productRowsRef.forEach(prepareSearchText);

      var orderSourceByKey = {};
      orderSourcesRef.forEach(function (source) {
        if (!source) return;
        orderSourceByKey[String(orderSourceKey(source))] = source;
      });

      cache = {
        mode: mode,
        sourcesRef: productSourcesRef,
        productsRef: productRowsRef,
        orderSourcesRef: orderSourcesRef,
        sourceByKey: sourceByKey,
        orderSourceByKey: orderSourceByKey
      };
      try {
        Object.defineProperty(productModel, '_productSourcesRenderCache', {
          configurable: true,
          enumerable: false,
          value: cache
        });
      } catch (_) {
        productModel._productSourcesRenderCache = cache;
      }
      return cache;
    }

    function prepareSearchText(product) {
      if (!product || product._psSearchPrepared) return;
      product._psSearchText = normalizeSearch([product.name, product.sku, product.key].join(' '));
      try {
        Object.defineProperty(product, '_psSearchPrepared', {
          configurable: true,
          enumerable: false,
          value: true
        });
      } catch (_) {
        product._psSearchPrepared = true;
      }
    }

    function modeTab(mode, label, sub) {
      var active = activeMode === mode;
      return '<button type="button" class="ps-mode-tab' + (active ? ' is-active' : '') + '" data-ps-mode="' + esc(mode) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        '<span>' + esc(label) + '</span><small>' + esc(sub || '') + '</small>' +
      '</button>';
    }

    function sourceChip(key, label, count) {
      var active = String(selectedKey) === String(key);
      return '<button type="button" class="ps-source-chip' + (active ? ' is-active' : '') + '" data-ps-source="' + attr(key) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        '<span>' + esc(label) + '</span><strong>' + num(count || 0) + '</strong>' +
      '</button>';
    }

    function selectedProducts() {
      if (selectedSource) return Array.isArray(selectedSource.products) ? selectedSource.products : [];
      return Array.isArray(model.products) ? model.products : [];
    }

    function ndrTone(value, baseline) {
      value = Number(value || 0);
      baseline = Number(baseline || 0);
      if (value >= baseline + 4) return 'good';
      if (value >= baseline - 2) return 'warn';
      return 'danger';
    }

    function confidenceInfo(product) {
      var net = Number(product && product.netOrders || 0);
      if (net >= Math.max(100, minSample * 3)) return { tone: 'good', label: pick('High confidence', 'ثقة عالية') };
      if (net >= minSample) return { tone: 'warn', label: pick('Medium confidence', 'ثقة متوسطة') };
      return { tone: 'danger', label: pick('Needs more orders', 'تحتاج طلبات أكثر') };
    }

    function lowVolumeLabel() {
      return pick('Under ' + minSample + ' orders', 'أقل من ' + minSample + ' طلب');
    }

    function health(product, baselineNdr) {
      var net = Number(product && product.netOrders || 0);
      var failedShare = net > 0 ? Number(product.failed || 0) / net * 100 : 0;
      var pendingShare = net > 0 ? Number(product.pending || 0) / net * 100 : 0;
      var tone = ndrTone(product && product.ndr, baselineNdr);
      if (net < minSample) {
        return {
          tone: 'warn',
          title: pick('Needs more orders', 'يحتاج طلبات أكثر'),
          action: pick('Rates can swing until this product reaches ' + minSample + ' net orders in this source.', 'قد تتغير النسب بسرعة حتى يصل هذا المنتج إلى ' + minSample + ' طلب صافي داخل هذا المصدر.'),
          issue: lowVolumeLabel(),
          failedShare: failedShare,
          pendingShare: pendingShare
        };
      }
      if (tone === 'good') {
        return {
          tone: 'good',
          title: pick('Strong product for this source', 'منتج قوي داخل هذا المصدر'),
          action: pick('This product is beating the selected source baseline with enough orders.', 'هذا المنتج يتفوق على خط المصدر مع حجم طلبات كاف.'),
          issue: pick('Healthy', 'صحي'),
          failedShare: failedShare,
          pendingShare: pendingShare
        };
      }
      if (failedShare >= 12) {
        return {
          tone: 'danger',
          title: pick('Delivery failure pressure', 'ضغط فشل في التسليم'),
          action: pick('Review delivery failures before scaling this product inside the selected source.', 'راجع فشل التسليم قبل تكبير هذا المنتج داخل المصدر المحدد.'),
          issue: pick('Failed orders', 'طلبات فاشلة'),
          failedShare: failedShare,
          pendingShare: pendingShare
        };
      }
      if (pendingShare >= 20) {
        return {
          tone: 'warn',
          title: pick('Confirmation bottleneck', 'اختناق في التأكيد'),
          action: pick('The product may improve if pending orders move faster through confirmation.', 'قد يتحسن المنتج إذا تحركت الطلبات المعلقة أسرع خلال التأكيد.'),
          issue: pick('Pending orders', 'طلبات معلقة'),
          failedShare: failedShare,
          pendingShare: pendingShare
        };
      }
      return {
        tone: tone,
        title: pick('Stable but not leading', 'مستقر لكن ليس الأقوى'),
        action: pick('Use it as a comparison point, but prefer stronger product-source combinations for scaling.', 'استخدمه كنقطة مقارنة وفضل تركيبات المنتج والمصدر الأقوى عند التوسع.'),
        issue: pick('Watch performance', 'راقب الأداء'),
        failedShare: failedShare,
        pendingShare: pendingShare
      };
    }

    function summaryCard(label, value, sub, tone) {
      return '<div class="ps-summary-card ps-tone-' + esc(tone || 'neutral') + '">' +
        '<span>' + esc(label) + '</span>' +
        '<strong>' + value + '</strong>' +
        '<small>' + esc(sub || '') + '</small>' +
      '</div>';
    }

    function miniList(items, emptyText) {
      items = Array.isArray(items) ? items : [];
      if (!items.length) return '<span class="ps-empty-mini">' + esc(emptyText) + '</span>';
      return items.map(function (item) {
        return '<span class="ps-mini-chip"><bdi dir="auto">' + esc(item.name) + '</bdi><strong>' + num(item.orders || 0) + '</strong></span>';
      }).join('');
    }

    function statusSegments(product) {
      var net = Math.max(1, Number(product.netOrders || 0));
      var rows = [
        { key: 'delivered', label: pick('Delivered', 'مسلم'), value: Number(product.delivered || 0), tone: 'good' },
        { key: 'shipping', label: pick('Shipping', 'شحن'), value: Number(product.shipping || 0), tone: 'info' },
        { key: 'confirmed', label: pick('Confirmed', 'مؤكد'), value: Number(product.confirmed || 0), tone: 'blue' },
        { key: 'pending', label: pick('Pending', 'معلق'), value: Number(product.pending || 0), tone: 'warn' },
        { key: 'failed', label: pick('Failed', 'فشل'), value: Number(product.failed || 0), tone: 'danger' }
      ];
      var bar = rows.map(function (item) {
        var width = Math.max(0, Math.min(100, (item.value / net) * 100));
        return item.value > 0
          ? '<span class="ps-status-segment ps-status-' + item.tone + '" style="width:' + width.toFixed(3) + '%" title="' + esc(item.label + ': ' + num(item.value)) + '"></span>'
          : '';
      }).join('');
      var legend = rows.map(function (item) {
        return '<span class="ps-status-legend ps-status-label-' + item.tone + '"><i></i>' + esc(item.label) + '<strong>' + num(item.value) + '</strong></span>';
      }).join('');
      return '<div class="ps-status-panel"><div class="ps-status-head"><span>' + esc(pick('Product orders inside this source', 'طلبات المنتج داخل هذا المصدر')) + '</span><strong>' + esc(num(product.netOrders || 0) + ' ' + pick('net orders', 'طلب صافي')) + '</strong></div><div class="ps-status-bar">' + bar + '</div><div class="ps-status-legend-row">' + legend + '</div></div>';
    }

    function detailMetric(label, value, sub, tone) {
      return '<div class="ps-detail-block ps-detail-' + esc(tone || 'neutral') + '"><span>' + esc(label) + '</span><strong>' + value + '</strong><small>' + esc(sub || '') + '</small></div>';
    }

    function productInitial(product) {
      var label = productLabel(product).trim();
      var first = label.charAt(0) || '?';
      return first === '_' || first === '-' ? '#' : first.toUpperCase();
    }

    function productRow(product, index, baselineNdr) {
      var low = Number(product.netOrders || 0) < minSample;
      var verdict = health(product, baselineNdr);
      var conf = confidenceInfo(product);
      var lowTitle = pick('Fewer than ' + minSample + ' net orders in this product/source combination.', 'أقل من ' + minSample + ' طلب صافي لهذا المنتج داخل هذا المصدر.');
      return '<tbody class="ps-product-group" data-product-index="' + index + '">' +
        '<tr class="ps-product-row" data-product-toggle="' + index + '">' +
          '<td><button type="button" class="ps-expand-btn" aria-expanded="false">' + icon('chevronDown') + '</button><span class="ps-product-mark">' + esc(productInitial(product)) + '</span><div class="ps-product-name"><bdi dir="auto">' + esc(productLabel(product)) + '</bdi>' + (product.sku ? '<small dir="ltr">' + esc(product.sku) + '</small>' : '') + '</div>' + (low ? '<span class="ps-low-badge" title="' + attr(lowTitle) + '">' + esc(lowVolumeLabel()) + '</span>' : '') + '</td>' +
          '<td>' + num(product.netOrders || 0) + '</td>' +
          '<td><strong class="ps-cr">' + pct(product.confirmationRate) + '</strong></td>' +
          '<td>' + num(product.confirmationCount || 0) + '</td>' +
          '<td>' + num(product.delivered || 0) + '</td>' +
          '<td><strong class="ps-ndr">' + pct(product.ndr) + '</strong></td>' +
          '<td><strong class="ps-dr">' + pct(product.dr) + '</strong></td>' +
          '<td>' + num(product.failed || 0) + '</td>' +
          '<td>' + num(product.pending || 0) + '</td>' +
          '<td>' + money(product.deliveredSales || 0) + '</td>' +
          '<td>' + money(product.avgProfit || 0) + '</td>' +
        '</tr>' +
        '<tr class="ps-detail-row" hidden><td colspan="11">' +
          '<div class="ps-product-panel ps-panel-' + esc(verdict.tone) + '">' +
            '<div class="ps-verdict-row">' +
              '<div class="ps-verdict-main">' +
                '<span class="ps-verdict-icon">' + icon(verdict.tone === 'good' ? 'trendingUp' : (verdict.tone === 'danger' ? 'circleXmark' : 'activity')) + '</span>' +
                '<div><h3>' + esc(verdict.title) + '</h3><p>' + esc(verdict.action) + '</p></div>' +
              '</div>' +
              '<div class="ps-health-strip">' +
                '<span class="ps-health-chip ps-health-' + esc(verdict.tone) + '"><small>NDR</small><strong>' + pct(product.ndr) + '</strong></span>' +
                '<span class="ps-health-chip ps-health-' + esc(conf.tone) + '"><small>' + esc(pick('Confidence', 'الثقة')) + '</small><strong>' + esc(conf.label) + '</strong></span>' +
                '<span class="ps-health-chip ps-health-' + esc(verdict.tone) + '"><small>' + esc(pick('Main issue', 'النقطة الأهم')) + '</small><strong>' + esc(verdict.issue) + '</strong></span>' +
              '</div>' +
            '</div>' +
            statusSegments(product) +
            '<div class="ps-details-grid">' +
              detailMetric(pick('Confirmation rate', 'نسبة التأكيد'), pct(product.confirmationRate), num(product.confirmationCount || 0) + ' ' + pick('confirmed-base orders', 'طلب داخل قاعدة التأكيد'), 'info') +
              detailMetric('NDR', pct(product.ndr), pick('Delivered / net orders inside source', 'المسلم / صافي الطلبات داخل المصدر'), verdict.tone) +
              detailMetric('DR', pct(product.dr), pick('Delivered / confirmed orders', 'المسلم / الطلبات المؤكدة'), 'good') +
              detailMetric(pick('Net delivered sales', 'صافي مبيعات المسلم'), money(product.deliveredSales || 0), money(product.deliveredAov || 0) + ' ' + pick('delivered AOV', 'متوسط الطلب المسلم') + ' / ' + num(product.actualDelivered || product.delivered || 0) + ' ' + pick('actual delivered', 'مسلم فعلي'), 'good') +
              detailMetric(pick('Failed pressure', 'ضغط الفشل'), pct(verdict.failedShare), num(product.failed || 0) + ' ' + pick('failed orders', 'طلب فاشل'), verdict.failedShare > 10 ? 'danger' : 'neutral') +
              detailMetric(pick('Pending pressure', 'ضغط التعليق'), pct(verdict.pendingShare), num(product.pending || 0) + ' ' + pick('pending orders', 'طلب معلق'), verdict.pendingShare > 20 ? 'warn' : 'neutral') +
            '</div>' +
            '<div class="ps-top-grid">' +
              '<div><h4>' + esc(pick('Top cities', 'أفضل المدن')) + '</h4><div class="ps-mini-list">' + miniList(product.topCities, pick('No city data', 'لا توجد بيانات مدن')) + '</div></div>' +
              '<div><h4>' + esc(pick('Source context', 'سياق المصدر')) + '</h4><div class="ps-mini-list"><span class="ps-mini-chip"><bdi dir="auto">' + esc(selectedSource ? sourceLabel(selectedSource) : pick('All sources', 'كل المصادر')) + '</bdi><strong>' + num(product.netOrders || 0) + '</strong></span></div></div>' +
            '</div>' +
          '</div>' +
        '</td></tr>' +
      '</tbody>';
    }

    var products = selectedProducts();
    var query = normalizeSearch(searchQuery);
    var filteredProducts = query
      ? products.filter(function (product) {
        prepareSearchText(product);
        return String(product && product._psSearchText || '').indexOf(query) !== -1;
      })
      : products;
    var summary = selectedOrderSummary();
    var totalItems = filteredProducts.length;
    var totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    mountEl._productSourcesPage = page;
    var start = (page - 1) * PAGE_SIZE;
    var pageProducts = filteredProducts.slice(start, start + PAGE_SIZE);
    var baselineNdr = Number(summary.ndr || (model.summary && model.summary.ndr) || 0);
    var sourceChips = sourceChip('__all__', activeMode === 'platform' ? pick('All Platforms', 'كل المنصات') : pick('All Sources', 'كل المصادر'), products.length) +
      sources.map(function (source) {
        return sourceChip(source.key, sourceLabel(source), source.productCount || (source.products && source.products.length) || 0);
      }).join('');

    var tableBody = pageProducts.length
      ? pageProducts.map(function (product, idx) { return productRow(product, start + idx, baselineNdr); }).join('')
      : '<tbody><tr><td colspan="11" class="ps-empty">' + esc(activeMode === 'platform'
        ? pick('No product orders found for this platform source in the selected period.', 'لا توجد طلبات منتجات لهذا المصدر الإعلاني في الفترة المحددة.')
        : pick('No product orders found for this source in the selected period.', 'لا توجد طلبات منتجات لهذا المصدر في الفترة المحددة.')) + '</td></tr></tbody>';

    var paginationHtml = '';
    if (totalItems > PAGE_SIZE && window.renderDashboardPagination) {
      paginationHtml = window.renderDashboardPagination({
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
        startItem: start + 1,
        endItem: Math.min(start + PAGE_SIZE, totalItems),
        itemLabel: pick('products', 'منتج'),
        prevPage: Math.max(1, page - 1),
        nextPage: Math.min(totalPages, page + 1),
        pageButtonClass: 'ps-page-btn',
        prevClass: 'ps-page-prev',
        nextClass: 'ps-page-next',
        className: 'dash-pagination-compact ps-pagination'
      });
    }

    mountEl.innerHTML = '<section class="product-sources-section" dir="' + (isRtl() ? 'rtl' : 'ltr') + '">' +
      '<div class="ps-header">' +
        '<div><p>' + esc(t('nav.productSources', pick('Products by Source', 'المنتجات حسب المصدر'))) + '</p><h2>' + esc(activeMode === 'platform' ? pick('Product performance by ad platform', 'أداء المنتجات حسب المنصة الإعلانية') : pick('Product performance inside each source', 'أداء المنتجات داخل كل مصدر')) + '</h2></div>' +
        '<span class="ps-sample-note">' + esc(pick('Reliable product-source reads need at least ' + minSample + ' net orders.', 'قراءة المنتج داخل المصدر تحتاج إلى ' + minSample + ' طلب صافي على الأقل.')) + '</span>' +
      '</div>' +
      '<div class="ps-mode-tabs" role="tablist" aria-label="' + esc(pick('Product source mode', 'وضع مصادر المنتجات')) + '">' +
        modeTab('taager', pick('Taager Source', 'مصدر تاجر'), pick('Order received by', 'الطلب المستلم بواسطة')) +
        modeTab('platform', pick('Ad Platform', 'منصة الإعلان'), pick('TikTok, Facebook, Snapchat', 'تيك توك، فيسبوك، سناب شات')) +
      '</div>' +
      '<div class="ps-source-strip" aria-label="' + esc(pick('Choose source', 'اختر المصدر')) + '">' + sourceChips + '</div>' +
      '<div class="ps-toolbar">' +
        '<div class="ps-search-wrap">' +
          '<span class="ps-search-icon">' + icon('search') + '</span>' +
          '<input id="ps-product-search" type="text" value="' + attr(searchQuery) + '" placeholder="' + attr(pick('Search product name or SKU...', 'ابحث باسم المنتج أو SKU...')) + '" autocomplete="off" spellcheck="false" />' +
          (searchQuery ? '<button type="button" class="ps-search-clear" id="ps-product-search-clear" aria-label="' + attr(pick('Clear search', 'مسح البحث')) + '">×</button>' : '') +
        '</div>' +
        '<span class="ps-toolbar-count">' + esc(query ? pick('Matching products', 'المنتجات المطابقة') : pick('Visible products', 'المنتجات الظاهرة')) + ': <strong>' + num(totalItems) + '</strong>' + (query ? ' <small>/ ' + num(products.length) + '</small>' : '') + '</span>' +
      '</div>' +
      '<div class="ps-summary-grid">' +
        summaryCard(selectedSource ? pick('Selected products', 'المنتجات المحددة') : pick('Products', 'المنتجات'), num(totalItems), selectedSource ? sourceLabel(selectedSource) : pick('Across selected lens', 'ضمن العرض المحدد'), 'info') +
        summaryCard(pick('Net orders', 'صافي الطلبات'), num(summary.netOrders || 0), pick('Raw minus Canceled by you', 'الخام ناقص ملغي بواسطتك'), 'neutral') +
        summaryCard('CR', pct(summary.confirmationRate || 0), num(summary.confirmedOrders || 0) + ' ' + pick('confirmed', 'مؤكد'), 'info') +
        summaryCard(pick('Delivered', 'المسلم'), num(summary.delivered || 0), pick('Delivered orders in this source', 'الطلبات المسلمة داخل هذا المصدر'), 'good') +
        summaryCard('NDR', pct(summary.ndr || 0), pick('Delivered / net orders', 'المسلم / صافي الطلبات'), 'warn') +
        summaryCard('DR', pct(summary.dr || 0), pick('Delivered / confirmed', 'المسلم / المؤكد'), 'good') +
        summaryCard(pick('Net delivered sales', 'صافي مبيعات المسلم'), money(summary.deliveredSales || 0), num(summary.actualDelivered || summary.delivered || 0) + ' ' + pick('actual delivered orders', 'طلب مسلم فعلي'), 'good') +
      '</div>' +
      '<div class="ps-table-wrap">' +
        '<table class="ps-table"><thead><tr>' +
          '<th>' + esc(pick('Product', 'المنتج')) + '</th>' +
          '<th>' + esc(pick('Net Orders', 'صافي الطلبات')) + '</th>' +
          '<th>CR</th>' +
          '<th>' + esc(pick('Confirmed', 'المؤكد')) + '</th>' +
          '<th>' + esc(pick('Delivered', 'المسلم')) + '</th>' +
          '<th>NDR</th>' +
          '<th>DR</th>' +
          '<th>' + esc(pick('Failed', 'فشل')) + '</th>' +
          '<th>' + esc(pick('Pending', 'معلق')) + '</th>' +
          '<th>' + esc(pick('Net Delivered Sales', 'صافي مبيعات المسلم')) + '</th>' +
          '<th>' + esc(pick('Avg. Profit', 'متوسط الربح')) + '</th>' +
        '</tr></thead>' + tableBody + '</table>' +
      '</div>' +
      (paginationHtml ? '<div class="ps-pagination-wrap">' + paginationHtml + '</div>' : '') +
    '</section>';

    if (!mountEl._productSourcesDelegatedEvents) {
      mountEl._productSourcesDelegatedEvents = true;
      mountEl.addEventListener('click', function (event) {
        var modeButton = event.target && event.target.closest && event.target.closest('[data-ps-mode]');
        if (modeButton && mountEl.contains(modeButton)) {
          var mode = modeButton.getAttribute('data-ps-mode') === 'platform' ? 'platform' : 'taager';
          if (mode !== (mountEl._productSourcesMode === 'platform' ? 'platform' : 'taager')) {
            clearTimeout(mountEl._productSourcesSearchTimer);
            mountEl._productSourcesMode = mode;
            mountEl._productSourcesSelectedKey = '__all__';
            mountEl._productSourcesPage = 1;
            window.renderSectionProductSources(mountEl, mountEl._productSourcesLatestData, mountEl._productSourcesLatestCtx);
          }
          return;
        }

        var sourceButton = event.target && event.target.closest && event.target.closest('[data-ps-source]');
        if (sourceButton && mountEl.contains(sourceButton)) {
          var key = sourceButton.getAttribute('data-ps-source') || '__all__';
          if (key !== mountEl._productSourcesSelectedKey) {
            clearTimeout(mountEl._productSourcesSearchTimer);
            mountEl._productSourcesSelectedKey = key;
            mountEl._productSourcesPage = 1;
            window.renderSectionProductSources(mountEl, mountEl._productSourcesLatestData, mountEl._productSourcesLatestCtx);
          }
          return;
        }

        var clearSearch = event.target && event.target.closest && event.target.closest('#ps-product-search-clear');
        if (clearSearch && mountEl.contains(clearSearch)) {
          clearTimeout(mountEl._productSourcesSearchTimer);
          mountEl._productSourcesSearch = '';
          mountEl._productSourcesPage = 1;
          window.renderSectionProductSources(mountEl, mountEl._productSourcesLatestData, mountEl._productSourcesLatestCtx);
          return;
        }

        var row = event.target && event.target.closest && event.target.closest('[data-product-toggle]');
        if (!row || !mountEl.contains(row)) return;
        if (event.target && event.target.closest && event.target.closest('a,button.ps-expand-btn')) {
          if (!event.target.closest('button.ps-expand-btn')) return;
        }
        var group = row.closest('.ps-product-group');
        var detail = group && group.querySelector('.ps-detail-row');
        var btn = row.querySelector('.ps-expand-btn');
        if (!detail) return;
        var opening = detail.hidden;
        detail.hidden = !opening;
        if (btn) btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (group) group.classList.toggle('is-open', opening);
      });
    }

    var searchInput = mountEl.querySelector('#ps-product-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        mountEl._productSourcesSearch = searchInput.value;
        mountEl._productSourcesPage = 1;
        clearTimeout(mountEl._productSourcesSearchTimer);
        mountEl._productSourcesSearchTimer = setTimeout(function () {
          window.renderSectionProductSources(mountEl, data, ctx);
          var nextInput = mountEl.querySelector('#ps-product-search');
          if (nextInput) {
            nextInput.focus();
            try { nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length); } catch (_) {}
          }
        }, 90);
      });
    }

    if (totalItems > PAGE_SIZE && window.bindDashboardPagination) {
      window.bindDashboardPagination(mountEl, {
        currentPage: page,
        totalPages: totalPages,
        pageButtonSelector: '.ps-page-btn',
        prevSelector: '.ps-page-prev',
        nextSelector: '.ps-page-next',
        onPage: function (nextPage) {
          mountEl._productSourcesPage = nextPage;
          window.renderSectionProductSources(mountEl, data, ctx);
        },
        onPrev: function () {
          mountEl._productSourcesPage = Math.max(1, page - 1);
          window.renderSectionProductSources(mountEl, data, ctx);
        },
        onNext: function () {
          mountEl._productSourcesPage = Math.min(totalPages, page + 1);
          window.renderSectionProductSources(mountEl, data, ctx);
        }
      });
    }
  };
})();
