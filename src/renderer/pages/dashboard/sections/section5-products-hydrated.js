// ─────────────────────────────────────────────────────────────────────────────
// section5-products.js  -  Task 5: أفضل المنتجات
//
// FIXES vs v6:
//  Fix 1  - Rank badges preserve original rank; ascending sort no longer re-numbers
//  Fix 2  - Dropdown z-index raised to 99999 so it floats above all rows
//  Fix 3  - renderProductPage() re-renders filter bar so pills show active state
//  Product values render at their final value with no count-up or entry motion.
// ─────────────────────────────────────────────────────────────────────────────

function isActiveProductsPane(mountEl) {
  var shell = document.getElementById('db-shell-mount');
  return !!(mountEl && mountEl.isConnected && shell &&
    shell._dashboardActiveSection === 'products' &&
    shell._dashboardActivePane === mountEl && !mountEl.hidden);
}

function productsHydrationSkeleton() {
  return '<div class="dash-scroll" data-dashboard-hydrating="products" role="status" aria-live="polite" aria-label="Loading" ' +
    'style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dash-bg);">' +
      '<div aria-hidden="true" style="width:min(720px,78%);display:grid;gap:14px;">' +
        '<div style="height:28px;width:38%;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.07);"></div>' +
        '<div style="height:92px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.045);"></div>' +
        '<div style="height:160px;border-radius:var(--dash-radius-xl);background:rgba(255,255,255,0.035);"></div>' +
      '</div>' +
    '</div>';
}

function renderSection5Hydrated(mountEl, data, ctx) {
  const isAr = window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  function s5Txt(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (isAr ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }
  function cleanText(value) {
    if (window.dashboardI18n && window.dashboardI18n.clean) return window.dashboardI18n.clean(value);
    return String(value == null ? '' : value)
      .replace(/-|-/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u2193/g, '↓')
      .replace(/\u2191/g, '↑')
      .replace(/\u2195/g, '↕')
      .replace(/\u00d7/g, 'x');
  }
  function tx(key) {
    var str = window.dashboardI18n ? window.dashboardI18n.t(key) : key;
    return cleanText(str || key);
  }
  function p5Txt(key) { return tx('products.' + key); }

  if (!mountEl) return;

  var productCleanupTasks = [function () {
    mountEl._s5RenderToken = (mountEl._s5RenderToken || 0) + 1;
  }];
  function addProductCleanup(cleanup) {
    if (typeof cleanup === 'function') productCleanupTasks.push(cleanup);
  }
  mountEl._dashboardSectionCleanup = function () {
    productCleanupTasks.splice(0).forEach(function (fn) { fn(); });
  };

  const renderToken = (mountEl._s5RenderToken || 0) + 1;
  mountEl._s5RenderToken = renderToken;

  function esc(value) {
    return cleanText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attr(value) {
    return esc(value).replace(/`/g, '&#96;');
  }

  function skuCopyHtml(sku, opts) {
    opts = opts || {};
    if (window.dashboardSkuCopyHtml) return window.dashboardSkuCopyHtml(sku, opts);
    var value = String(sku || '').trim();
    if (!value && opts.hideEmpty) return '';
    var display = opts.text != null ? String(opts.text) : (value || opts.emptyText || 'N/A');
    var label = opts.label == null ? 'SKU' : String(opts.label || '');
    var prefix = opts.prefix === false || !label ? '' : label + (opts.separator == null ? ': ' : opts.separator);
    var tag = opts.block ? 'div' : 'span';
    var style = opts.style ? ' style="' + attr(opts.style) + '"' : '';
    return '<' + tag + ' dir="ltr"' + style + '>' + esc(prefix + display) + '</' + tag + '>';
  }

  function escData(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attrData(value) {
    return escData(value).replace(/`/g, '&#96;');
  }

  function productDisplayName(sku, fallback) {
    var key = String(sku || '').trim();
    var saved = window.TaagerProductNames && key && typeof window.TaagerProductNames.get === 'function'
      ? window.TaagerProductNames.get(key)
      : '';
    return String(saved || fallback || key || s5Txt('Unknown Product', 'منتج غير معروف')).trim();
  }

  // ── data defaults ────────────────────────────────────────────────────────
  const pd = (data && data.products) ? data.products : null;
  const forceProductsModel = true;
  const deferProductsModel = false;
  const activeCurrency = data && data.meta && data.meta.activeCurrency || window.dashboardActiveCurrency || 'SAR';

  const PRODUCTS_DEFAULT = [];

  const STAT_CARDS_DEFAULT = [
    { label: s5Txt('Total Products Sold', 'إجمالي المنتجات المباعة'),    value: 0, unit: s5Txt('unique products', 'منتج مختلف'),  color: '#a855f7', iconType: 'grid'   },
    { label: s5Txt('Total / Net Orders', 'إجمالي / صافي الطلبات'),    value: 0, displayValue: '0 / 0', unit: s5Txt('orders', 'طلب'),          color: '#14b8a6', iconType: 'box'    },
    { label: s5Txt('Total Pieces Sold', 'إجمالي القطع المُباعة'),       value: 0, unit: s5Txt('pieces', 'قطعة'),         color: '#3b82f6', iconType: 'pieces' },
    { label: s5Txt('Total Earned Taager Profit After Tax', 'إجمالي ربح تاجر المحقق بعد الضريبة'),      value: 0, unit: activeCurrency,          color: '#f59e0b', iconType: 'coins'  },
    { label: s5Txt('Products generating 80% of Taager Profit After Tax', 'منتجات تحقق 80% من ربح تاجر بعد الضريبة'), value: 0, unit: s5Txt('products only', 'منتجات فقط'),  color: '#ef4444', iconType: 'pie'    },
  ];

  const INSIGHTS_DEFAULT = [];

  let PRODUCTS_RAW = PRODUCTS_DEFAULT;
  let STAT_CARDS   = STAT_CARDS_DEFAULT;
  let INSIGHTS     = INSIGHTS_DEFAULT;
  const productAccountId = data && data.meta && data.meta.activeAccountId
    ? data.meta.activeAccountId
    : (window.getActiveAccountId ? window.getActiveAccountId() : '__all__');

  function totalNetOrdersDisplay(totalOrders, netOrders) {
    var raw = Number(totalOrders || 0);
    var net = Number(netOrders || 0);
    return raw.toLocaleString('en-US') + ' / ' + net.toLocaleString('en-US');
  }
  const roiFallback = (data && data.roi) || { adSpend: 0, currency: 'SAR', egpRate: 52 };
  let productFinancialSettings = window.DashboardRoiState
    ? window.DashboardRoiState.get(productAccountId, roiFallback)
    : roiFallback;
  let productMarketingState = window.DashboardMarketingState
    ? window.DashboardMarketingState.get(productAccountId)
    : null;
  let refreshProductModal = function () {};
  let refreshProductCompareModal = function () {};
  if (STAT_CARDS && STAT_CARDS[3]) {
    STAT_CARDS[3].unit = selectedCurrency();
  }

  function logProductNameEdit(step, payload) {
    if (window.__TAAGER_PERF_DIAGNOSTICS !== true) return;
    try {
      console.log('[S5 EditName] ' + step, payload || {});
    } catch (_) {}
  }

  function openProductNameEditDialog(options) {
    options = options || {};
    var sku = String(options.sku || '').trim();
    var currentName = String(options.currentName || sku || '').trim();
    logProductNameEdit('open dialog requested', { sku: sku, currentName: currentName });

    if (!sku) {
      logProductNameEdit('blocked: missing sku', options);
      if (window.showToast) window.showToast(s5Txt('Missing product SKU. Cannot edit this name.', 'كود المنتج غير موجود. لا يمكن تعديل الاسم.'), { kind: 'error' });
      return;
    }

    var existing = document.getElementById('s5-product-name-edit-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 's5-product-name-edit-modal';
    overlay.setAttribute('role', 'presentation');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:18px',
      'background:rgba(2,6,23,0.72)'
    ].join(';');
    overlay.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="s5-edit-name-title" style="width:min(440px,94vw);border-radius:var(--dash-radius-xl);background:var(--dash-surface);border:1px solid rgba(255,255,255,0.12);padding:18px;color:#fff;font-family:inherit">' +
        '<div id="s5-edit-name-title" style="font-size:var(--type-subtitle);font-weight:var(--weight-bold);margin-bottom:6px">' + esc(s5Txt('Edit product name', 'تعديل اسم المنتج')) + '</div>' +
        skuCopyHtml(sku, { block: true, prefix: false, style: 'font-size:var(--type-caption);color:rgba(255,255,255,0.48);font-weight:var(--weight-bold);margin-bottom:12px;direction:ltr;text-align:left' }) +
        '<input id="s5-product-name-edit-input" data-i18n-preserve type="text" value="' + attrData(currentName) + '" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#fff;font-family:inherit;font-size:var(--type-control);font-weight:var(--weight-bold);padding:11px 12px;outline:none" />' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;flex-wrap:wrap">' +
          '<button type="button" data-s5-edit-cancel style="border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.78);border-radius:var(--dash-radius-md);padding:9px 14px;font-family:inherit;font-size:var(--type-label);font-weight:var(--weight-bold);cursor:pointer">' + esc(s5Txt('Cancel', 'إلغاء')) + '</button>' +
          '<button type="button" data-s5-edit-clear style="border:1px solid rgba(248,113,113,0.28);background:rgba(248,113,113,0.10);color:#fca5a5;border-radius:var(--dash-radius-md);padding:9px 14px;font-family:inherit;font-size:var(--type-label);font-weight:var(--weight-bold);cursor:pointer">' + esc(s5Txt('Use SKU', 'استخدم الكود')) + '</button>' +
          '<button type="button" data-s5-edit-save style="border:1px solid rgba(56,189,248,0.38);background:#0284c7;color:#fff;border-radius:var(--dash-radius-md);padding:9px 16px;font-family:inherit;font-size:var(--type-label);font-weight:var(--weight-bold);cursor:pointer">' + esc(s5Txt('Save name', 'حفظ الاسم')) + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    var input = overlay.querySelector('#s5-product-name-edit-input');
    var previousFocus = document.activeElement;

    function closeDialog(reason) {
      logProductNameEdit('close dialog', { sku: sku, reason: reason });
      overlay.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try { previousFocus.focus(); } catch (_) {}
      }
    }

    function saveName(value) {
      var next = String(value || '').trim();
      logProductNameEdit('save requested', {
        sku: sku,
        nextName: next,
        hasApi: !!window.TaagerProductNames
      });
      if (!window.TaagerProductNames || typeof window.TaagerProductNames.set !== 'function') {
        logProductNameEdit('save failed: TaagerProductNames missing', { sku: sku });
        if (window.showToast) window.showToast(s5Txt('Product-name storage is not loaded yet.', 'تخزين أسماء المنتجات لم يتم تحميله بعد.'), { kind: 'error' });
        return;
      }
      try {
        window.TaagerProductNames.set(sku, next);
        logProductNameEdit('saved to TaagerProductNames', {
          sku: sku,
          savedName: window.TaagerProductNames.get ? window.TaagerProductNames.get(sku) : next
        });
        mountEl.querySelectorAll('.s5-product-name-edit').forEach(function (el) {
          if (String(el.getAttribute('data-product-sku') || '').trim() !== sku) return;
          el.setAttribute('data-product-name', next);
          if (el.classList.contains('s5-product-title')) {
            el.textContent = next || sku;
            el.setAttribute('title', s5Txt('Edit name: ', 'تعديل الاسم: ') + (next || sku));
          }
        });
        if (window.invalidateDashboardCache) {
          logProductNameEdit('invalidateDashboardCache called', { sku: sku });
          window.invalidateDashboardCache();
        }
        if (window.refreshDashboard) {
          logProductNameEdit('refreshDashboard called', { sku: sku });
          window.refreshDashboard();
        }
        if (window.showToast) window.showToast(s5Txt('Product name saved.', 'تم حفظ اسم المنتج.'), { kind: 'success' });
        closeDialog('saved');
      } catch (err) {
        console.error('[S5 EditName] save failed', err);
        if (window.showToast) window.showToast(s5Txt('Could not save product name.', 'تعذر حفظ اسم المنتج.'), { kind: 'error' });
      }
    }

    overlay.querySelector('[data-s5-edit-cancel]').addEventListener('click', function () { closeDialog('cancel'); });
    overlay.querySelector('[data-s5-edit-clear]').addEventListener('click', function () { saveName(''); });
    overlay.querySelector('[data-s5-edit-save]').addEventListener('click', function () { saveName(input ? input.value : ''); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDialog('backdrop');
    });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDialog('escape');
      if (e.key === 'Enter') saveName(input ? input.value : '');
    });
    if (input) {
      input.focus();
      input.select();
      logProductNameEdit('input focused', { sku: sku });
    }
  }

  function selectedCurrency() {
    var currency = String(productFinancialSettings.currency || 'SAR').toUpperCase();
    if (window.TaagerCurrency && window.TaagerCurrency.cleanCurrency) {
      return window.TaagerCurrency.cleanCurrency(currency, window.dashboardActiveCurrency || 'SAR');
    }
    return ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'].indexOf(currency) !== -1 ? currency : (window.dashboardActiveCurrency || 'SAR');
  }

  function supportedProductCurrencies() {
    if (window.TaagerCurrency && Array.isArray(window.TaagerCurrency.supported)) {
      return window.TaagerCurrency.supported.slice();
    }
    return ['SAR', 'USD', 'EGP', 'AED', 'IQD', 'OMR'];
  }

  function setProductCurrency(currency) {
    var nextCurrency = String(currency || selectedCurrency()).toUpperCase();
    if (window.TaagerCurrency && window.TaagerCurrency.cleanCurrency) {
      nextCurrency = window.TaagerCurrency.cleanCurrency(nextCurrency, selectedCurrency());
    }
    if (supportedProductCurrencies().indexOf(nextCurrency) === -1) {
      return;
    }
    if (nextCurrency === selectedCurrency()) {
      return;
    }

    if (window.DashboardRoiState) {
      productFinancialSettings = window.DashboardRoiState.set(
        { currency: nextCurrency },
        productAccountId,
        productFinancialSettings
      );
    } else {
      productFinancialSettings = Object.assign({}, productFinancialSettings, { currency: nextCurrency });
    }

    if (backendProductsEnabled) {
      refreshBackendProducts(true);
    } else {
      applyProductFinancials();
    }
    listCache = null;
    listCacheKey = '';
    clearProductDetailCache();
    updateProductCurrencyUIOnly();
    refreshProductModal();
    refreshProductCompareModal();
  }

  function commissionInCurrency(sarValue) {
    var currency = selectedCurrency();
    var sar = Number(sarValue) || 0;
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(sar, window.dashboardActiveCurrency || 'SAR', currency);
    }
    if (currency === 'USD') return sar / 3.75;
    if (currency === 'EGP') return (sar / 3.75) * (Number(productFinancialSettings.egpRate) || 52);
    return sar;
  }

  function sarToSelectedCurrency(sarValue) {
    return commissionInCurrency(sarValue);
  }

  function productMoney(value) {
    var n = Number(value) || 0;
    return n.toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' ' + selectedCurrency();
  }

  function productFinancialText(value, decimals) {
    return productCompactNumber(value || 0, decimals == null ? 2 : decimals, 10000);
  }

  function updateFinancialValue(row, field, value, color) {
    if (!row) return;
    var el = row.querySelector('[data-financial-value="' + field + '"]');
    if (!el) return;
    el.textContent = productFinancialText(value, field === 'revenue' ? 0 : 2);
    el.setAttribute('title', productMoney(value || 0));
    if (color) el.style.color = color;
  }

  function updateProductSummaryCurrencyUIOnly() {
    var currency = selectedCurrency();
    var totalComm = pd && pd.summary ? Number(pd.summary.totalComm || 0) : PRODUCTS_RAW.reduce(function (sum, p) {
      return sum + (Number(p.commission) || 0);
    }, 0);
    var totalProfit = commissionInCurrency(totalComm);
    if (STAT_CARDS && STAT_CARDS[3]) {
      STAT_CARDS[3].value = totalProfit;
      STAT_CARDS[3].unit = currency;
    }
    var statValue = mountEl.querySelector('#s5-stat-3');
    if (statValue) {
      statValue.textContent = productFinancialText(totalProfit, 0);
      statValue.setAttribute('title', productMoney(totalProfit));
    }
    var statUnit = mountEl.querySelector('[data-stat-unit="3"]');
    if (statUnit) statUnit.textContent = currency;

    INSIGHTS = forceProductsModel ? [] : buildInsights(PRODUCTS_RAW);
    var insightRow = mountEl.querySelector('.s5-insights-row');
    if (insightRow) {
      if (insightRow.children.length !== INSIGHTS.length) {
        insightRow.innerHTML = INSIGHTS.map(function (ins, i) { return insightCardHTML(ins, i); }).join('');
      } else {
        INSIGHTS.forEach(function (ins, i) {
          var valueEl = insightRow.querySelector('[data-insight-value="' + i + '"]');
          var detailEl = insightRow.querySelector('[data-insight-detail="' + i + '"]');
          if (valueEl) valueEl.textContent = ins.value;
          if (detailEl) {
            detailEl.textContent = ins.detail;
            detailEl.style.color = ins.detailColor;
          }
        });
      }
    }
  }

  function updateProductCurrencyUIOnly() {
    var currency = selectedCurrency();
    var byKey = {};
    PRODUCTS_RAW.forEach(function (p, index) {
      byKey[String(p.key || p.sku || p.name || index)] = p;
    });
    mountEl.querySelectorAll('.s5-product-row').forEach(function (row) {
      var product = byKey[String(row.getAttribute('data-product-key') || '')];
      if (!product) return;
      updateFinancialValue(row, 'averageProfit', product.averageProfit, '#38bdf8');
      updateFinancialValue(row, 'allocatedAdSpend', product.allocatedAdSpend, '#60a5fa');
      updateFinancialValue(row, 'cpa', product.cpa, '#a78bfa');
      updateFinancialValue(row, 'breakEvenCpa', product.breakEvenCpa, (Number(product.cpa) || 0) > (Number(product.breakEvenCpa) || 0) ? '#ef4444' : '#f59e0b');
      updateFinancialValue(row, 'profitLoss', product.profitLoss, product.profitLoss >= 0 ? '#00e676' : '#ef4444');
      var pnlCurrency = row.querySelector('[data-financial-currency="profitLoss"]');
      if (pnlCurrency) pnlCurrency.style.color = product.profitLoss >= 0 ? 'rgba(0,230,118,0.55)' : 'rgba(239,68,68,0.55)';
      var revenue = commissionInCurrency(product.revenue || 0);
      var revenueEl = row.querySelector('[data-financial-value="revenue"]');
      if (revenueEl) {
        revenueEl.textContent = productFinancialText(revenue, 0);
        revenueEl.setAttribute('title', productMoney(revenue) + (currency !== activeCurrency ? ' | Native: ' + productNumber(product.revenue || 0, 0) + ' ' + activeCurrency : ''));
      }
      row.querySelectorAll('[data-financial-currency]').forEach(function (label) {
        label.textContent = currency;
      });
    });
    updateProductSummaryCurrencyUIOnly();
    bindProductCurrencySelect();
  }

  function productNumber(value, decimals) {
    decimals = decimals == null ? 0 : decimals;
    var n = Number(value) || 0;
    return n.toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function productCompactNumber(value, decimals, threshold) {
    var n = Number(value) || 0;
    var abs = Math.abs(n);
    threshold = threshold == null ? 10000 : threshold;
    if (window.formatDashboardNumber && abs >= threshold) {
      return window.formatDashboardNumber(n, {
        decimals: decimals == null ? 0 : decimals,
        compact: true,
        compactThreshold: threshold
      });
    }
    return productNumber(n, decimals == null ? 0 : decimals);
  }

  function textKey(value) {
    var arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    return String(value || '').toLowerCase().normalize('NFKC')
      .replace(/[٠-٩]/g, function (digit) { return String(arabicDigits.indexOf(digit)); })
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
      .replace(/\u0640/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ىئ]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/[ةه]/g, 'ه')
      .replace(/[^\w\u0600-\u06ff]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function validSku(product) {
    var sku = textKey(product && product.sku || '');
    return sku && sku !== 'n a' && sku !== 'na' ? sku : '';
  }

  function hasTerm(text, term) {
    return !!term && (' ' + text + ' ').indexOf(' ' + term + ' ') !== -1;
  }

  function productTokens(name) {
    var stop = {
      ad: true, ads: true, campaign: true, tiktok: true, tik: true, tok: true,
      snapchat: true, snap: true, sc: true, facebook: true, fb: true, meta: true,
      ksa: true, saudi: true, sale: true, offer: true, new: true, test: true,
      flying: true, original: true, product: true,
      'منتج': true, 'عرض': true, 'جديد': true, 'اصلي': true, 'جهاز': true,
      'بعد': true, 'تعمل': true, 'يعمل': true, 'عدد': true, 'قطعه': true, 'حبه': true
    };
    return textKey(name).split(' ').filter(function (token) {
      return token.length >= 3 && !stop[token] && !/^x\d+$/i.test(token) && !/^\d+$/.test(token);
    });
  }

  function productPhrases(tokens) {
    var phrases = [];
    for (var size = 2; size <= Math.min(3, tokens.length); size++) {
      for (var start = 0; start <= tokens.length - size; start++) {
        phrases.push(tokens.slice(start, start + size).join(' '));
      }
    }
    return phrases;
  }

  function campaignSpendToSar(row) {
    var amount = Number(row && row.rawSpend || row && row.convertedSpend || 0);
    var currency = String(row && row.currency || 'SAR').toUpperCase();
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(amount, currency, window.dashboardActiveCurrency || 'SAR');
    }
    if (currency === 'USD') return amount * 3.75;
    if (currency === 'EGP') return (amount / (Number(productFinancialSettings.egpRate) || 52)) * 3.75;
    return amount;
  }

  function buildCampaignAssignments(campaignRows) {
    var sharedCache = window._dashboardProductCampaignAssignments;
    if (!sharedCache && typeof WeakMap === 'function') {
      sharedCache = window._dashboardProductCampaignAssignments = new WeakMap();
    }
    var attribution = window.TaagerProductAttribution;
    if (!attribution) return {};
    var overrides = window.TaagerProductNames && typeof window.TaagerProductNames.all === 'function'
      ? window.TaagerProductNames.all()
      : {};
    var stableKey = PRODUCTS_RAW.map(function (product) {
      return String(product.sku || '') + ':' + String(product.name || '');
    }).join('|');
    var cacheKey = [
      attribution.VERSION,
      stableKey,
      JSON.stringify(overrides),
      String(window.dashboardActiveCurrency || 'SAR'),
      String(productFinancialSettings.egpRate || '')
    ].join('|');
    var rowCache = sharedCache && sharedCache.get(campaignRows);
    if (rowCache && rowCache.key === cacheKey) return rowCache.value;

    var productIndex = attribution.createProductIndex(PRODUCTS_RAW, {
      productNameOverrides: overrides
    });
    var assignments = {};
    (campaignRows || []).forEach(function (row) {
      var result = attribution.matchCampaign(row, productIndex);
      if (result.status !== 'matched' || result.productIndex < 0) return;
      var idx = result.productIndex;
      if (!assignments[idx]) assignments[idx] = { spendSar: 0, methods: {}, details: {}, rowCount: 0 };
      assignments[idx].spendSar += campaignSpendToSar(row);
      assignments[idx].methods[result.method] = true;
      assignments[idx].details[result.matchDetail] = true;
      assignments[idx].rowCount++;
    });
    if (sharedCache) sharedCache.set(campaignRows, { key: cacheKey, value: assignments });
    return assignments;
  }

  function applyProductFinancials() {
    var totalPlaced = PRODUCTS_RAW.reduce(function (sum, p) {
      return sum + (window.DashboardOrderMetrics ? window.DashboardOrderMetrics.netOrders(p) : (Number(p.netOrderCount) || Number(p.placedCount) || 0));
    }, 0);
    var budget = Math.max(0, Number(productFinancialSettings.adSpend) || 0);
    var marketingSummary = productMarketingState && productMarketingState.summary || null;
    var campaignRows = marketingSummary && Array.isArray(marketingSummary.campaignBreakdown)
      ? marketingSummary.campaignBreakdown
      : [];
    var hasSyncedProductSpend = !!(campaignRows && campaignRows.length);
    var campaignAssignments = hasSyncedProductSpend ? buildCampaignAssignments(campaignRows) : {};
    PRODUCTS_RAW.forEach(function (p, idx) {
      var placed = window.DashboardOrderMetrics
        ? window.DashboardOrderMetrics.netOrders(p)
        : (Number(p.netOrderCount) || Number(p.placedCount) || 0);
      var synced = campaignAssignments[idx];
      p.syncedAdSpend = !!synced;
      p.syncMatchMethod = synced
        ? (synced.methods.sku && synced.methods.name ? 'sku+name' : (synced.methods.sku ? 'sku' : 'name'))
        : '';
      p.syncMatchDetail = synced ? Object.keys(synced.details || {}).join(',') : '';
      p.syncMatchedRows = synced ? synced.rowCount : 0;
      p.allocatedAdSpend = hasSyncedProductSpend
        ? (synced ? sarToSelectedCurrency(Number(synced.spendSar.toFixed(2))) : 0)
        : (totalPlaced > 0 ? budget * placed / totalPlaced : 0);
      p.cpa = placed > 0 ? p.allocatedAdSpend / placed : 0;
      var delivered = p.actualDeliveredCount !== undefined ? p.actualDeliveredCount : (Number(p.deliveredCount) || 0);
      var commissionVal = p.actualCommission !== undefined ? p.actualCommission : (Number(p.commission) || 0);
      var avgCommissionSar = window.DashboardOrderMetrics
        ? window.DashboardOrderMetrics.averageProfit(p)
        : (delivered > 0 ? (Number(commissionVal) || 0) / delivered : 0);
      p.averageProfitSource = window.DashboardOrderMetrics
        ? window.DashboardOrderMetrics.averageProfitSource(p)
        : (delivered > 0 ? 'delivered_orders' : (placed > 0 ? 'net_orders_fallback' : 'unavailable'));
      p.averageProfit = sarToSelectedCurrency(avgCommissionSar);
      var breakEvenSar = avgCommissionSar * ((Number(p.ndrPct) || 0) / 100);
      p.breakEvenCpa = sarToSelectedCurrency(breakEvenSar);
      p.profitLoss = commissionInCurrency(p.commission) - p.allocatedAdSpend;
      p.financialCurrency = selectedCurrency();
    });
  }

  // ── Build real data ───────────────────────────────────────────────────────
  if (!deferProductsModel && pd && (!pd.rankedList || pd.rankedList.length === 0)) {
    PRODUCTS_RAW = [];
    const summaryNetOrders = (pd.summary && (pd.summary.netOrderCount != null ? pd.summary.netOrderCount : pd.summary.totalOrders)) || 0;
    const summaryTotalOrders = (pd.summary && (pd.summary.totalOrderCount != null ? pd.summary.totalOrderCount : summaryNetOrders)) || 0;
    STAT_CARDS = [
      { label: s5Txt('Total Products Sold', 'إجمالي المنتجات المباعة'),    value: (pd.summary && pd.summary.uniqueProducts) || 0, unit: s5Txt('unique products', 'منتج مختلف'), color: '#a855f7', iconType: 'grid'   },
      { label: s5Txt('Total / Net Orders', 'إجمالي / صافي الطلبات'),    value: summaryNetOrders, displayValue: totalNetOrdersDisplay(summaryTotalOrders, summaryNetOrders), unit: s5Txt('orders', 'طلب'),        color: '#14b8a6', iconType: 'box'    },
      { label: s5Txt('Total Pieces Sold', 'إجمالي القطع المُباعة'),       value: (pd.summary && pd.summary.totalPieces)    || 0, unit: s5Txt('pieces', 'قطعة'),       color: '#3b82f6', iconType: 'pieces' },
      { label: s5Txt('Total Earned Taager Profit After Tax', 'إجمالي ربح تاجر المحقق بعد الضريبة'),      value: commissionInCurrency((pd.summary && pd.summary.totalComm) || 0), unit: selectedCurrency(),        color: '#f59e0b', iconType: 'coins'  },
      { label: s5Txt('Products generating 80% of Taager Profit After Tax', 'منتجات تحقق 80% من ربح تاجر بعد الضريبة'), value: 0,                                               unit: s5Txt('product', 'منتج'),       color: '#ef4444', iconType: 'pie'    },
    ];
    INSIGHTS = [];
  } else if (!deferProductsModel && pd && pd.rankedList && pd.rankedList.length > 0) {
    const totalDeliveries = pd.rankedList.reduce((acc, x) => acc + (x.deliveredCount || x.units || 0), 0) || 1;

    PRODUCTS_RAW = pd.rankedList.map((p, idx) => {
      const rank       = p.rank || (idx + 1);
      const units      = p.deliveredCount || p.units || 0;
      const commission = p.commission || 0;
      const sharePct   = parseFloat(((units / totalDeliveries) * 100).toFixed(1));

      const spark = [];
      for (let j = 0; j < 7; j++) {
        const factor = 0.4 + (j / 6) * 0.6;
        const noise  = 1 + (Math.sin(j + units) * 0.05);
        spark.push(Math.round(commission * factor * noise));
      }
      spark[6] = commission;

      const rankIdx = Math.min(rank - 1, 4);
      const styleCfg = [
        { sparkColor:'#00e676', accent:'#fbbf24' },
        { sparkColor:'#a855f7', accent:'#a855f7' },
        { sparkColor:'#14b8a6', accent:'#14b8a6' },
        { sparkColor:'#a855f7', accent:'#8892a4' },
        { sparkColor:'#7c3aed', accent:'#8892a4' },
      ][rankIdx];

      const productKey = p.key || p.sku || p.name || `product-${idx}`;

      return {
        key: productKey, sku: p.sku || '', rank, name: productDisplayName(p.sku, p.name), cat: `SKU: ${p.sku || 'N/A'}`,
        deliveries: units, placedCount: p.netOrderCount != null ? p.netOrderCount : (p.placedCount || 0), pieces: p.pieces || p.qty || 0,
        totalOrderCount: p.totalOrderCount != null ? p.totalOrderCount : (p.totalOrders || p.statusTotalCount || p.netOrderCount || p.placedCount || 0),
        sharePct, revenue: commission, delta: Number(p.delta || 0), spark, ...styleCfg,
        commission, deliveredCount: units,
        actualDeliveredCount: p.actualDeliveredCount,
        actualCommission: p.actualCommission,
        actualDeliveredQty: p.actualDeliveredQty,
        actualDeliveredSales: p.actualDeliveredSales,
        totalPieces:     p.totalPieces     || p.qty || 0,
        failedCount:     p.failedCount     || 0,
        canceledCount:   p.canceledByYouCount || p.canceledCount || 0,
        confirmedCount:  p.confirmedCount  || 0,
        shippingCount:   p.shippingCount   || 0,
        processingCount: p.processingCount || 0,
        statusTotalCount: p.statusTotalCount || p.netOrderCount || p.placedCount || 0,
        netOrderCount: p.netOrderCount != null ? p.netOrderCount : (p.placedCount || 0),
        confirmationStatusCount: p.confirmationStatusCount || p.confirmedCount || 0,
        cancelStatusCount: p.cancelStatusCount || p.canceledCount || 0,
        pendingStatusCount: p.pendingStatusCount || p.pendingCount || 0,
        pendingCount:     p.pendingStatusCount || p.pendingCount || 0,
        confirmationPct: p.confirmationPct || 0,
        cancelPct:       p.cancelPct       || 0,
        pendingPct:      p.pendingPct      || 0,
        ndrPct:          units > 0 ? (p.ndrPct || 0) : 0,
        drRate:          p.drRate          || 0,
        ndrBaseOrders: p.ndrBaseOrders || 0,
        ndrDeliveredOrders: p.ndrDeliveredOrders || 0,
        drBaseOrders: p.drBaseOrders || 0,
        drDeliveredOrders: p.drDeliveredOrders || 0,
        rateMode: p.rateMode || 'actual',
        rateSource: p.rateSource || 'product',
        scalingScore:    p.scalingScore    || Math.round((commission * (p.drRate || 0)) / 100),
        deliveryPct:     p.deliveryPct     || p.deliveryRate || 0,
        get cityBreakdown() { return p.cityBreakdown || []; },
        get piecesBreakdown() {
          return (p.piecesBreakdown || []).map(function (item) {
            var count = Number(item.count || item.orders || 0);
            var delivered = Number(item.delivered || item.deliveredCount || 0);
            var ndr = delivered > 0 && item.ndr !== undefined
              ? Number(item.ndr || 0)
              : (count > 0 ? parseFloat((delivered / count * 100).toFixed(1)) : 0);
            return Object.assign({}, item, { count: count, delivered: delivered, ndr: ndr });
          });
        },
        get quantityCityBreakdown() { return p.quantityCityBreakdown || []; },
      };
    });

    const sortedByComm = [...PRODUCTS_RAW].sort((a, b) => b.revenue - a.revenue);
    const target80 = (pd.summary.totalComm || 0) * 0.8;
    let runningSum = 0, count80 = 0;
    for (const p of sortedByComm) {
      runningSum += p.revenue; count80++;
      if (runningSum >= target80) break;
    }
    if (count80 === 0) count80 = 1;

    const summaryNetOrders = (pd.summary && (pd.summary.netOrderCount != null ? pd.summary.netOrderCount : pd.summary.totalOrders)) || 0;
    const summaryTotalOrders = (pd.summary && (pd.summary.totalOrderCount != null ? pd.summary.totalOrderCount : summaryNetOrders)) || 0;
    STAT_CARDS = [
      { label: s5Txt('Total Products Sold', 'إجمالي المنتجات المباعة'),    value: pd.summary.uniqueProducts || 0,  unit: s5Txt('unique products', 'منتج مختلف'),  color: '#a855f7', iconType: 'grid'   },
      { label: s5Txt('Total / Net Orders', 'إجمالي / صافي الطلبات'),    value: summaryNetOrders, displayValue: totalNetOrdersDisplay(summaryTotalOrders, summaryNetOrders),  unit: s5Txt('orders', 'طلب'),          color: '#14b8a6', iconType: 'box'    },
      { label: s5Txt('Total Pieces Sold', 'إجمالي القطع المُباعة'),       value: pd.summary.totalPieces    || 0,  unit: s5Txt('pieces', 'قطعة'),         color: '#3b82f6', iconType: 'pieces' },
      { label: s5Txt('Total Earned Taager Profit After Tax', 'إجمالي ربح تاجر المحقق بعد الضريبة'),      value: commissionInCurrency(pd.summary.totalComm || 0),  unit: selectedCurrency(),          color: '#f59e0b', iconType: 'coins'  },
      { label: s5Txt('Products generating 80% of Taager Profit After Tax', 'منتجات تحقق 80% من ربح تاجر بعد الضريبة'), value: count80,                         unit: s5Txt('products only', 'منتجات فقط'),  color: '#ef4444', iconType: 'pie'    },
    ];

    INSIGHTS = buildInsights(PRODUCTS_RAW);
  }

  applyProductFinancials();

  const PRODUCT_BY_KEY = {};
  PRODUCTS_RAW.forEach((p, idx) => {
    const key = p.key || p.sku || p.name || idx;
    PRODUCT_BY_KEY[key] = p;
  });

  // ── T8: Smart Insights ───────────────────────────────────────────────────
  function buildInsights(products) {
    if (!products || !products.length) return [];
    const insights = [];
    const SI = window.TaagerSmartInsights;
    const T = SI && SI.thresholds ? SI.thresholds() : { insightMinSample: 15, scaleMinOrders: 50, scaleMinDelivered: 10, dangerNdrPct: 20, scaleDrPct: 40 };
    const orderCount = (p) => Number(p.placedCount != null ? p.placedCount : p.orders != null ? p.orders : p.count || 0) || 0;
    const deliveredCount = (p) => Number(p.deliveredCount != null ? p.deliveredCount : p.delivered != null ? p.delivered : p.units || 0) || 0;
    const evidence = (label, n, d) => SI && SI.rateEvidence ? SI.rateEvidence(label, n, d) : (label + ' ' + n + '/' + d);
    const qualified = products.filter((p) => orderCount(p) >= T.insightMinSample);
    const scaleQualified = products.filter((p) => orderCount(p) >= T.scaleMinOrders && deliveredCount(p) >= T.scaleMinDelivered);

    if (!qualified.length) {
      const largest = products.reduce((prev, cur) => orderCount(cur) > orderCount(prev) ? cur : prev, products[0]);
      insights.push({ emoji:'i' , bg:'rgba(59,130,246,0.12)', border:'rgba(59,130,246,0.28)', iconGlow:'#3b82f6',
        label:s5Txt('Needs More Product Data', 'يحتاج بيانات منتجات أكثر'), value: largest.name,
        detail: s5Txt('Largest sample ', 'أكبر عينة ') + orderCount(largest) + ' / ' + T.insightMinSample + s5Txt(' orders - no best/scale claim yet', ' طلب - لا توجد توصية أفضل/توسع بعد'),
        detailColor:'#3b82f6', trust:'Measured', confidence:'limited' });
      return insights;
    }

    const worstCancel = qualified.reduce((prev, cur) => cur.cancelPct > prev.cancelPct ? cur : prev, qualified[0]);
    if (worstCancel && worstCancel.cancelPct >= 40) {
      insights.push({ emoji:'!' , bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.28)', iconGlow:'#ef4444',
        label:s5Txt('Warning: High Cancel Rate', 'تحذير: نسبة إلغاء عالية'), value: worstCancel.name,
        detail: worstCancel.cancelPct + s5Txt('% canceled - consider pausing', '٪ إلغاء - فكر في إيقافه مؤقتاً'), detailColor:'#ef4444' });
    }

    const bestDelivery = qualified.reduce((prev, cur) => (cur.drRate || 0) > (prev.drRate || 0) ? cur : prev, qualified[0]);
    if (bestDelivery) {
      const bestDeliveryColor = window.dashboardRateColor ? window.dashboardRateColor(bestDelivery.drRate || 0) : ((bestDelivery.drRate || 0) >= 40 ? '#22d3ee' : (bestDelivery.drRate || 0) >= 30 ? '#00e676' : (bestDelivery.drRate || 0) >= 20 ? '#f59e0b' : '#ef4444');
      insights.push({ emoji:'★' , bg:bestDeliveryColor + '1f', border:bestDeliveryColor + '47', iconGlow:bestDeliveryColor,
        label:s5Txt('Best Delivery Rate', 'أفضل نسبة تسليم'), value: bestDelivery.name,
        detail: (bestDelivery.drRate || 0) + s5Txt('% delivered - scalable', '٪ تسليم - قابل للتوسع'), detailColor:bestDeliveryColor });
    }

    const worstNdr = qualified.reduce((prev, cur) => cur.ndrPct < prev.ndrPct ? cur : prev, qualified[0]);
    if (worstNdr && worstNdr.ndrPct < T.dangerNdrPct) {
      insights.push({ emoji:'!' , bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.28)', iconGlow:'#ef4444',
        label:s5Txt('Potential Shipping Issue', 'مشكلة شحن محتملة'), value: worstNdr.name,
        detail: 'NDR ' + worstNdr.ndrPct + s5Txt('% - check responsible company', '٪ - تحقق من الشركة المسؤولة'), detailColor:'#ef4444' });
    }

    if (!scaleQualified.length) {
      insights.push({ emoji:'i' , bg:'rgba(59,130,246,0.12)', border:'rgba(59,130,246,0.28)', iconGlow:'#3b82f6',
        label:s5Txt('No Scale-Ready Product Yet', 'لا يوجد منتج جاهز للتوسع بعد'), value: s5Txt('Needs stronger sample', 'يحتاج عينة أقوى'),
        detail: T.scaleMinOrders + s5Txt(' orders and ', ' طلب و ') + T.scaleMinDelivered + s5Txt(' delivered orders required before scale claims.', ' طلبات مسلمة مطلوبة قبل توصيات التوسع.'),
        detailColor:'#3b82f6', trust:'Measured', confidence:'limited' });
      return insights;
    }

    const bestScale = scaleQualified.reduce((prev, cur) => {
      const scoreA = (cur.commission * (cur.drRate || 0)) / 100;
      const scoreB = (prev.commission * (prev.drRate || 0)) / 100;
      return scoreA > scoreB ? cur : prev;
    }, scaleQualified[0]);
    if (bestScale && (bestScale.drRate || 0) >= T.scaleDrPct) {
      insights.push({ emoji:'★' , bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.28)', iconGlow:'#f59e0b',
        label:s5Txt('Best Product for Scaling', 'أفضل منتج للتوسع'), value: bestScale.name,
        // Taager dashboard/status/NDR migration: commission is a compatibility key for Taager profit.
        detail: s5Txt('Taager Profit After Tax ', 'ربح تاجر بعد الضريبة ') + productNumber(commissionInCurrency(bestScale.commission || 0), 0) + ' ' + selectedCurrency() + ' * ' + (bestScale.drRate || 0) + s5Txt('% delivery', '٪ تسليم'),
        detailColor:'#f59e0b' });
    }

    if (insights.length === 0) {
      const topComm = qualified.reduce((prev, cur) => cur.revenue > prev.revenue ? cur : prev, qualified[0]);
      insights.push({ emoji:'★' , bg:bestDeliveryColor + '1f', border:bestDeliveryColor + '47', iconGlow:bestDeliveryColor,
        label:s5Txt('Best Taager Profit After Tax Performance', 'أفضل أداء ربح تاجر بعد الضريبة'), value: topComm.name,
        detail: productNumber(commissionInCurrency(topComm.revenue || 0), 0) + ' ' + selectedCurrency(), detailColor:'#fbbf24' });
    }
    return insights;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let filterState = { search: '', statusKey: 'all' };
  let sortState   = { field: 'deliveredCount', dir: 'desc' };
  let viewMode    = 'expanded';
  let listCacheKey = '';
  let listCache = null;
  let detailPanelCache = new Map();
  let _sortMenuCleanup = null;
  addProductCleanup(function () {
    if (_sortMenuCleanup) {
      _sortMenuCleanup();
      _sortMenuCleanup = null;
    }
  });
  let backendProductsEnabled = false;
  let backendProductsActive = false;
  let backendProductsLoading = false;
  let backendProductsRows = [];
  let backendProductsTotal = 0;
  let backendProductsTotalPages = 1;
  let backendProductsQueryKey = '';
  let backendProductsPendingKey = '';
  let backendProductsPendingPromise = null;
  let backendProductsRequest = 0;
  let backendProductsRefreshRevision = 0;
  let backendProductDetailsCache = new Map();
  let backendProductOptions = [];
  let backendProductOptionsKey = '';
  let backendDetailPrefetchTimer = null;
  let backendDetailPrefetchIdle = null;

  function cancelBackendDetailPrefetch() {
    if (backendDetailPrefetchTimer) {
      clearTimeout(backendDetailPrefetchTimer);
      backendDetailPrefetchTimer = null;
    }
    if (backendDetailPrefetchIdle != null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(backendDetailPrefetchIdle);
    }
    backendDetailPrefetchIdle = null;
  }
  addProductCleanup(cancelBackendDetailPrefetch);

  const STATUS_PILLS = [
    { key:'all',        label: s5Txt('All', 'الكل'),          color:'#fff'     },
    { key:'delivered',  label: s5Txt('Delivered', 'مُسلَّمة'),       color:'#00e676'  },
    { key:'failed',     label: p5Txt('failedOrders'), color:'#f97316' },
    { key:'canceled',   label: p5Txt('canceledOrders'), color:'#ef4444'  },
    { key:'shipping',   label: s5Txt('In Shipping', 'في الشحن'),       color:'#14b8a6'  },
    { key:'processing', label: s5Txt('Processing', 'قيد المعالجة'),   color:'#3b82f6'  },
  ];

  function s5SearchKey(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function productSearchKey(product) {
    if (!product) return '';
    var source = [
      product.name,
      product.displayName,
      product.productName,
      product.sku,
      product.key,
      product.id,
      product.cat,
      product.category
    ].join(' ');
    var key = s5SearchKey(source);
    product._s5SearchKey = key;
    return key;
  }

  function productValue(product, field) {
    if (!product || !field) return 0;
    var value = product[field];
    if (value == null && field === 'commission') value = product.revenue;
    if (value == null && field === 'deliveredCount') value = product.deliveries;
    if (field === 'firstOrderCreatedAt') {
      var time = Date.parse(String(value || '').slice(0, 10));
      return isFinite(time) ? time : 0;
    }
    var numeric = Number(value);
    return isFinite(numeric) ? numeric : 0;
  }

  function productsDataSignature() {
    var first = PRODUCTS_RAW[0] || {};
    var last = PRODUCTS_RAW[PRODUCTS_RAW.length - 1] || {};
    var totals = PRODUCTS_RAW.reduce(function (acc, product) {
      acc.orders += productValue(product, 'placedCount');
      acc.delivered += productValue(product, 'deliveredCount');
      acc.failed += productValue(product, 'failedCount');
      acc.canceled += productValue(product, 'canceledCount');
      acc.commission += Math.round(productValue(product, 'commission') * 100);
      return acc;
    }, { orders: 0, delivered: 0, failed: 0, canceled: 0, commission: 0 });
    return [
      PRODUCTS_RAW.length,
      first.key || first.sku || first.name || '',
      last.key || last.sku || last.name || '',
      totals.orders,
      totals.delivered,
      totals.failed,
      totals.canceled,
      totals.commission
    ].join('~');
  }

  // ── FIX 1: applyFilters - NEVER re-assigns rank ───────────────────────────
  function applyFilters() {
    const marketingSyncStamp = productMarketingState && (
      productMarketingState.lastSyncAt ||
      productMarketingState.summary && productMarketingState.summary.lastSyncAt
    ) || '';
    const cacheKey = [
      productsDataSignature(),
      s5SearchKey(filterState.search),
      filterState.statusKey,
      sortState.field,
      sortState.dir,
      productAccountId,
      marketingSyncStamp,
      selectedCurrency()
    ].join('|');
    if (listCache && listCacheKey === cacheKey) return listCache;

    let list = PRODUCTS_RAW.slice();

    if (filterState.search) {
      const q = s5SearchKey(filterState.search);
      list = list.filter(function (p) {
        return !q || productSearchKey(p).indexOf(q) !== -1;
      });
    }

    if (filterState.statusKey !== 'all') {
      list = list.filter(p => {
        if (filterState.statusKey === 'delivered')  return p.deliveredCount > 0;
        if (filterState.statusKey === 'failed')     return p.failedCount    > 0;
        if (filterState.statusKey === 'canceled')   return p.canceledCount  > 0;
        if (filterState.statusKey === 'shipping')   return p.shippingCount  > 0;
        if (filterState.statusKey === 'processing') return p.processingCount > 0;
        return true;
      });
    }

    list.sort((a, b) => {
      if (sortState.field === 'default') {
        const dir = sortState.dir === 'desc' ? -1 : 1;
        return dir * ((a.rank || 0) - (b.rank || 0));
      }
      const dir = sortState.dir === 'desc' ? 1 : -1;
      const primary = dir * (productValue(b, sortState.field) - productValue(a, sortState.field));
      if (primary !== 0) return primary;
      const byPlaced = productValue(b, 'placedCount') - productValue(a, 'placedCount');
      if (byPlaced !== 0) return byPlaced;
      const byCanceled = productValue(b, 'canceledCount') - productValue(a, 'canceledCount');
      if (byCanceled !== 0) return byCanceled;
      return productValue(b, 'commission') - productValue(a, 'commission');
    });

    // FIX 1: preserve the original rank from PRODUCTS_RAW - do NOT re-number
    listCacheKey = cacheKey;
    listCache = list;
    return listCache;
  }

  const PAGE_SIZE = 10;
  let currentPage = 1;
  let quantityCityPageByProduct = {};

  function quantityCityPageStateKey(p, scope) {
    return String(scope || 'detail') + '|' + productKeyForState(p);
  }

  function backendProductRow(row) {
    if (!row) return {};
    function roundTo(value, digits) {
      const n = Number(value || 0);
      const factor = Math.pow(10, digits == null ? 2 : digits);
      return isFinite(n) ? Math.round(n * factor) / factor : 0;
    }
    const placedCountVal = window.DashboardOrderMetrics
      ? window.DashboardOrderMetrics.netOrders(row)
      : Number(row.netOrderCount || row.placedCount || 0);
    const totalOrderCountVal = Number(row.totalOrderCount != null ? row.totalOrderCount : row.totalOrders || placedCountVal);
    const deliveriesVal = Number(row.deliveredCount || 0);
    const commissionVal = Number(row.commission || 0);
    const breakEvenCpaVal = Number(row.breakEvenCpa || 0);
    const profitLossVal = Number(row.profitLoss || row.netProfit || 0);
    const ndrPctVal = deliveriesVal > 0 ? Number(row.ndrPct || 0) : 0;

    const failedCountVal = Number(row.failedCount || 0);
    const canceledCountVal = Number(row.canceledCount || 0);
    const confirmedCountVal = Number(row.confirmedCount || 0);
    const shippingCountVal = Number(row.shippingCount || 0);
    const processingCountVal = Number(row.processingCount || 0);
    const waitingCountVal = Number(row.waitingCount || 0);
    const pendingCountVal = Number(row.pendingCount || 0);

    const drRateVal = roundTo(row.drRate || 0, 1);
    const deliveryPctVal = roundTo(row.deliveryPct || 0, 1);

    const rank = Number(row.rank || 0);
    const rankIdx = Math.min(Math.max(rank - 1, 0), 4);
    const styleCfg = [
      { sparkColor:'#00e676', accent:'#fbbf24' },
      { sparkColor:'#a855f7', accent:'#a855f7' },
      { sparkColor:'#14b8a6', accent:'#14b8a6' },
      { sparkColor:'#a855f7', accent:'#8892a4' },
      { sparkColor:'#7c3aed', accent:'#8892a4' },
    ][rankIdx];
    return Object.assign({
      key: row.key,
      legacyKey: row.legacyKey || row.sku || row.name,
      sku: row.sku || '',
      rank: rank,
      name: productDisplayName(row.sku, row.name),
      cat: 'SKU: ' + (row.sku || 'N/A'),
      deliveries: deliveriesVal,
      placedCount: placedCountVal,
      totalOrderCount: totalOrderCountVal,
      firstOrderCreatedAt: row.firstOrderCreatedAt || '',
      pieces: Number(row.totalPieces || 0),
      sharePct: 0,
      revenue: commissionVal,
      commission: commissionVal,
      deliveredCount: deliveriesVal,
      actualDeliveredCount: Number(row.actualDeliveredCount != null ? row.actualDeliveredCount : deliveriesVal),
      actualCommission: Number(row.actualCommission != null ? row.actualCommission : commissionVal),
      actualDeliveredSales: Number(row.actualDeliveredSales || 0),
      totalSales: Number(row.totalSales || 0),
      expectedDeliveriesExact: Number(row.expectedDeliveriesExact != null ? row.expectedDeliveriesExact : deliveriesVal),
      expectedDeliveriesDisplay: Number(row.expectedDeliveriesDisplay != null ? row.expectedDeliveriesDisplay : deliveriesVal),
      expectedTotalProfitBeforeAdSpend: Number(row.expectedTotalProfitBeforeAdSpend != null ? row.expectedTotalProfitBeforeAdSpend : commissionVal),
      expectedDeliveredSales: Number(row.expectedDeliveredSales || 0),
      expectedDeliveredCpa: row.expectedDeliveredCpa != null ? Number(row.expectedDeliveredCpa) : null,
      expectedNetProfit: row.expectedNetProfit != null ? Number(row.expectedNetProfit) : null,
      expectedNdrRate: row.expectedNdrRate != null ? Number(row.expectedNdrRate) : null,
      totalPieces: Number(row.totalPieces || 0),
      failedCount: failedCountVal,
      canceledCount: canceledCountVal,
      confirmedCount: confirmedCountVal,
      shippingCount: shippingCountVal,
      processingCount: processingCountVal,
      waitingCount: waitingCountVal,
      pendingCount: pendingCountVal,
      statusTotalCount: Number(row.statusTotalCount != null ? row.statusTotalCount : placedCountVal),
      netOrderCount: placedCountVal,
      confirmationStatusCount: Number(row.confirmationStatusCount || row.confirmedCount || 0),
      cancelStatusCount: Number(row.cancelStatusCount || row.canceledCount || 0),
      pendingStatusCount: Number(row.pendingStatusCount || row.pendingCount || 0),
      confirmationPct: roundTo(row.confirmationPct, 1),
      cancelPct: roundTo(row.cancelPct, 1),
      pendingPct: roundTo(row.pendingPct, 1),
      ndrPct: roundTo(ndrPctVal, 2),
      drRate: drRateVal,
      deliveryPct: deliveryPctVal,
      ndrBaseOrders: Number(row.ndrBaseOrders || 0),
      ndrDeliveredOrders: Number(row.ndrDeliveredOrders || 0),
      drBaseOrders: Number(row.drBaseOrders || 0),
      drDeliveredOrders: Number(row.drDeliveredOrders || 0),
      rateMode: row.rateMode || 'actual',
      rateSource: row.rateSource || 'product',
      scalingScore: Number(row.scalingScore || 0),
      allocatedAdSpend: roundTo(row.allocatedAdSpend || row.adSpend, 2),
      cpa: roundTo(row.cpa, 2),
      averageProfit: roundTo(row.averageProfit, 2),
      breakEvenCpa: roundTo(breakEvenCpaVal, 2),
      profitLoss: roundTo(profitLossVal, 2),
      cityBreakdown: [],
      piecesBreakdown: [],
      quantityCityBreakdown: [],
      spark: [],
      _backendProduct: true
    }, styleCfg);
  }

  function backendProductParams() {
    var currency = selectedCurrency();
    var egpRate = Number(productFinancialSettings.egpRate) || 52;
    return {
      page: currentPage,
      pageSize: PAGE_SIZE,
      sortBy: sortState.field === 'default' ? 'rank' : (sortState.field || 'deliveredCount'),
      sortDir: sortState.dir || 'desc',
      refreshRevision: backendProductsRefreshRevision,
      productFinancialCurrency: currency,
      productFinancialEgpRate: egpRate,
      filters: {
        search: filterState.search || '',
        statusKey: filterState.statusKey || 'all'
      }
    };
  }

  function backendProductScopeSignature() {
    var meta = data && data.meta ? data.meta : {};
    var period = window.DashboardPeriodState && typeof window.DashboardPeriodState.get === 'function'
      ? window.DashboardPeriodState.get()
      : (meta.period || {});
    var mode = window.DashboardDeliveredDateState && typeof window.DashboardDeliveredDateState.get === 'function'
      ? (window.DashboardDeliveredDateState.get() === 'expected' ? 'expected' : 'actual')
      : (meta.deliveredDateMode === 'expected' ? 'expected' : 'actual');
    var ndrPeriod = mode === 'expected' && window.DashboardExpectedNdrRangeState && typeof window.DashboardExpectedNdrRangeState.get === 'function'
      ? window.DashboardExpectedNdrRangeState.get()
      : (meta.ndrPeriod || period || {});
    return JSON.stringify({
      dataVersion: data && data._version != null ? data._version : '',
      accountId: productAccountId,
      dateFrom: period.dateFrom || period.from || '',
      dateTo: period.dateTo || period.to || '',
      deliveredDateMode: mode,
      ndrDateFrom: ndrPeriod.dateFrom || ndrPeriod.from || '',
      ndrDateTo: ndrPeriod.dateTo || ndrPeriod.to || '',
      reportingCurrency: meta.reportingCurrency || meta.activeCurrency || window.dashboardActiveCurrency || 'SAR'
    });
  }

  function backendProductQueryKey(params) {
    return backendProductScopeSignature() + '|' + JSON.stringify(params || {});
  }

  function requestBackendProductPage(force) {
    if (!backendProductsEnabled || !window.DashboardQueryRuntime || typeof window.DashboardQueryRuntime.query !== 'function') {
      return Promise.resolve(false);
    }
    const params = backendProductParams();
    const key = backendProductQueryKey(params);
    if (!force && backendProductsActive && backendProductsQueryKey === key) return Promise.resolve(true);
    if (!force && backendProductsPendingPromise && backendProductsPendingKey === key) return backendProductsPendingPromise;
    const requestId = ++backendProductsRequest;
    backendProductsPendingKey = key;
    backendProductsLoading = true;
    backendProductsPendingPromise = window.DashboardQueryRuntime.query('products', params, data).then(function (result) {
      if (requestId !== backendProductsRequest || !mountEl.isConnected || mountEl.hidden || mountEl._s5RenderToken !== renderToken) return false;
      backendProductsLoading = false;
      backendProductsPendingPromise = null;
      backendProductsPendingKey = '';
      if (result && result.stale) return backendProductsActive;
      if (!result || !result.ok) {
        backendProductsActive = false;
        return false;
      }
      backendProductsQueryKey = key;
      backendProductsRows = (result.rows || []).map(backendProductRow);
      backendProductsTotal = Number(result.pagination && result.pagination.total || backendProductsRows.length);
      backendProductsTotalPages = Number(result.pagination && result.pagination.totalPages || 1);
      currentPage = Number(result.pagination && result.pagination.page || currentPage);
      backendProductsRows.forEach(function (product) {
        PRODUCT_BY_KEY[product.key] = product;
        if (product.sku) PRODUCT_BY_KEY[product.sku] = product;
      });
      backendProductsActive = true;
      return true;
    }).catch(function (error) {
      backendProductsLoading = false;
      backendProductsPendingPromise = null;
      backendProductsPendingKey = '';
      backendProductsActive = false;
      console.warn('[Products] backend query failed; using legacy data', error && error.message ? error.message : error);
      return false;
    });
    return backendProductsPendingPromise;
  }

  function loadBackendProductDetails(productKeys) {
    if (!backendProductsActive || !window.DashboardQueryRuntime || typeof window.DashboardQueryRuntime.query !== 'function') {
      return Promise.resolve({});
    }
    const keys = (productKeys || []).filter(Boolean);
    const missing = keys.filter(function (key) { return !backendProductDetailsCache.has(key); });

    function applyDetails(targetKeys, detailsMap) {
      targetKeys.forEach(function (key) {
        const detail = detailsMap[key] || {};
        const product = PRODUCT_BY_KEY[key];
        if (product) {
          Object.assign(product, detail);
          // Invalidate any cached panel HTML that was built before details arrived
          if (detailPanelCache && detailPanelCache.size) {
            const stalePrefix = String(product.key || product.sku || product.name || key) + '|';
            detailPanelCache.forEach(function (_v, cacheKey) {
              if (String(cacheKey).startsWith(stalePrefix)) detailPanelCache.delete(cacheKey);
            });
          }
        }
      });
    }

    if (!missing.length) {
      const cached = {};
      keys.forEach(function (key) { cached[key] = backendProductDetailsCache.get(key); });
      applyDetails(keys, cached);
      return Promise.resolve(cached);
    }
    return window.DashboardQueryRuntime.query('product-details', { productKeys: missing }, data).then(function (result) {
      if (!result || !result.ok) return {};
      const newDetails = result.details || {};
      Object.keys(newDetails).forEach(function (key) {
        backendProductDetailsCache.set(key, newDetails[key] || {});
      });
      const allDetails = {};
      keys.forEach(function (key) {
        allDetails[key] = backendProductDetailsCache.get(key) || {};
      });
      applyDetails(keys, allDetails);
      return allDetails;
    }).catch(function () { return {}; });
  }

  function loadBackendProductOptions() {
    if (!backendProductsEnabled || !window.DashboardQueryRuntime || typeof window.DashboardQueryRuntime.query !== 'function') return Promise.resolve(false);
    var optionsKey = backendProductScopeSignature();
    if (backendProductOptions.length && backendProductOptionsKey === optionsKey) return Promise.resolve(true);
    return window.DashboardQueryRuntime.query('product-options', {}, data).then(function (result) {
      if (!result || !result.ok) return;
      backendProductOptions = (result.rows || []).map(function (row) {
        const existing = PRODUCT_BY_KEY[row.key];
        const product = existing || backendProductRow(row);
        PRODUCT_BY_KEY[row.key] = product;
        if (row.sku && !PRODUCT_BY_KEY[row.sku]) PRODUCT_BY_KEY[row.sku] = product;
        return product;
      });
      backendProductOptionsKey = optionsKey;
      return true;
    });
  }

  function productOptionSource() {
    return backendProductsActive && backendProductOptions.length ? backendProductOptions : PRODUCTS_RAW;
  }

  function currentList() { return backendProductsActive ? backendProductsRows : applyFilters(); }
  function totalProductPages(list) {
    return backendProductsActive
      ? Math.max(1, backendProductsTotalPages)
      : Math.max(1, Math.ceil((list || currentList()).length / PAGE_SIZE));
  }
  function pagedProducts(list) {
    list = list || currentList();
    if (backendProductsActive) return list;
    const start = (currentPage - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }

  function clearProductDetailCache() {
    if (detailPanelCache && detailPanelCache.clear) detailPanelCache.clear();
  }

  function refreshBackendProducts(force) {
    if (!backendProductsEnabled) return false;
    backendProductsRefreshRevision += 1;
    backendProductsQueryKey = '';
    backendProductsPendingKey = '';
    backendProductsPendingPromise = null;
    backendProductOptionsKey = '';
    backendProductOptions = [];
    backendProductDetailsCache.clear();
    requestBackendProductPage(force !== false).then(function (ok) {
      if (ok && mountEl.isConnected && mountEl._s5RenderToken === renderToken) {
        renderProductPage({ backendReady: true, keepFilterBar: true });
        refreshProductModal();
        refreshProductCompareModal();
      }
    });
    return true;
  }

  if (window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.flags === 'function') {
    window.DashboardQueryRuntime.flags().then(function (flags) {
      backendProductsEnabled = !!(flags && flags.products);
      if (!backendProductsEnabled || !mountEl.isConnected || mountEl._s5RenderToken !== renderToken) return;
      requestBackendProductPage(true).then(function (ok) {
        if (ok && mountEl.isConnected && mountEl._s5RenderToken === renderToken) {
          renderProductPage({ backendReady: true });
        }
      });
    });
  }

  // ── Health row styling ────────────────────────────────────────────────────
  function healthRowStyle(p) {
    const totalOrders = window.DashboardOrderMetrics
      ? window.DashboardOrderMetrics.netOrders(p)
      : (p.netOrderCount || p.placedCount || p.statusTotalCount || 0);
    if (totalOrders === 0) {
      return { border: 'rgba(255,255,255,0.05)', shadow: 'none', bg: 'rgba(255,255,255,0.012)', opacity: '0.45' };
    }
    if (p.rank <= 3) {
      const rankColors = [
        { border:'rgba(251,191,36,0.2)',  shadow:'0 0 0 1px rgba(251,191,36,0.12), 0 2px 20px rgba(251,191,36,0.08)', bg:'linear-gradient(to left, rgba(251,191,36,0.05), rgba(251,191,36,0.01) 60%, transparent)' },
        { border:'rgba(168,85,247,0.2)',  shadow:'0 0 0 1px rgba(168,85,247,0.12), 0 2px 16px rgba(168,85,247,0.07)', bg:'linear-gradient(to left, rgba(168,85,247,0.04), transparent 60%)' },
        { border:'rgba(20,184,166,0.18)', shadow:'0 0 0 1px rgba(20,184,166,0.10), 0 2px 14px rgba(20,184,166,0.06)', bg:'linear-gradient(to left, rgba(20,184,166,0.04), transparent 60%)' },
      ];
      return Object.assign({}, rankColors[p.rank - 1], { opacity: '1' });
    }
    if (p.placedCount >= 5) {
      if ((p.drRate || 0) >= 40)  return { border:'rgba(34,211,238,0.22)', shadow:'0 0 0 1px rgba(34,211,238,0.13), 0 2px 12px rgba(34,211,238,0.07)', bg:'linear-gradient(to left, rgba(34,211,238,0.035), transparent 60%)', opacity:'1' };
      if ((p.drRate || 0) >= 30)  return { border:'rgba(0,230,118,0.2)',  shadow:'0 0 0 1px rgba(0,230,118,0.12), 0 2px 12px rgba(0,230,118,0.06)',  bg:'linear-gradient(to left, rgba(0,230,118,0.03), transparent 60%)',  opacity:'1' };
      if (p.cancelPct  >= 40)  return { border:'rgba(239,68,68,0.2)',   shadow:'0 0 0 1px rgba(239,68,68,0.10), 0 2px 12px rgba(239,68,68,0.06)',   bg:'linear-gradient(to left, rgba(239,68,68,0.03), transparent 60%)',   opacity:'1' };
      if (p.ndrPct     < 20)   return { border:'rgba(239,68,68,0.2)',   shadow:'0 0 0 1px rgba(239,68,68,0.10), 0 2px 12px rgba(239,68,68,0.06)',   bg:'linear-gradient(to left, rgba(239,68,68,0.03), transparent 60%)',   opacity:'1' };
    }
    return { border:'rgba(255,255,255,0.07)', shadow:'none', bg:'rgba(255,255,255,0.018)', opacity:'1' };
  }

  // ── Rank badge ───────────────────────────────────────────────────────────
  const RANK_CFG = [
    { bg:'linear-gradient(135deg,#fcd34d,#d97706)', shadow:'0 0 10px rgba(251,191,36,0.6)',  color:'#1c1400' },
    { bg:'linear-gradient(135deg,#9ca3af,#6b7280)', shadow:'0 0 8px rgba(156,163,175,0.4)',  color:'#fff'    },
    { bg:'linear-gradient(135deg,#fb923c,#b45309)', shadow:'0 0 8px rgba(251,146,60,0.4)',   color:'#fff'    },
    { bg:'rgba(255,255,255,0.07)',                   shadow:'none',                            color:'rgba(255,255,255,0.4)' },
  ];
  function rankBadgeHTML(rank, deliveredCount, placedCount) {
    const hasDeliveries = (deliveredCount || 0) > 0;
    const hasOrders = (placedCount || 0) > 0;
    if (!hasDeliveries && !hasOrders) {
      return `<div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid var(--dash-border-soft);color:rgba(255,255,255,0.25);font-size:var(--type-control);font-weight:var(--weight-bold);display:flex;align-items:center;justify-content:center">${rank}</div>`;
    }
    const cfg = (rank <= 3) ? RANK_CFG[rank - 1] : RANK_CFG[3];
    return `<div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;background:${cfg.bg};color:${cfg.color};font-size:var(--type-body);font-weight:var(--weight-bold);display:flex;align-items:center;justify-content:center">${rank}</div>`;
  }

  // ── Stat card icons ──────────────────────────────────────────────────────
  function statIconHTML(type, color) {
    if (type === 'grid')   return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="display:block"><rect x="1" y="1" width="8" height="8" rx="2" fill="${color}"/><rect x="13" y="1" width="8" height="8" rx="2" fill="${color}" opacity="0.8"/><rect x="1" y="13" width="8" height="8" rx="2" fill="${color}" opacity="0.8"/><rect x="13" y="13" width="8" height="8" rx="2" fill="${color}" opacity="0.6"/></svg>`;
    if (type === 'box')    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="display:block"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="${color}"/><path d="M2 17l10 5 10-5" stroke="${color}" stroke-width="1.8" fill="none" opacity="0.7"/><path d="M2 12l10 5 10-5" stroke="${color}" stroke-width="1.8" fill="none" opacity="0.85"/></svg>`;
    if (type === 'pieces') return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="display:block"><rect x="2" y="7" width="6" height="10" rx="1" fill="${color}"/><rect x="9" y="4" width="6" height="13" rx="1" fill="${color}" opacity="0.8"/><rect x="16" y="9" width="6" height="8" rx="1" fill="${color}" opacity="0.6"/></svg>`;
    if (type === 'coins')  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="display:block"><ellipse cx="12" cy="18" rx="7" ry="2.5" fill="${color}" opacity="0.4"/><ellipse cx="12" cy="15" rx="7" ry="2.5" fill="${color}" opacity="0.6"/><ellipse cx="12" cy="12" rx="7" ry="2.5" fill="${color}" opacity="0.8"/><ellipse cx="12" cy="9" rx="7" ry="2.5" fill="${color}"/><path d="M5 9v9M19 9v9" stroke="${color}" stroke-width="0.8" opacity="0.5"/></svg>`;
    if (type === 'pie')    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="display:block"><circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.5" opacity="0.3"/><path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" fill="${color}"/><path d="M12 12 L21 12 A9 9 0 0 1 12 21 Z" fill="${color}" opacity="0.55"/><path d="M12 12 L12 21 A9 9 0 0 1 3 12 Z" fill="${color}" opacity="0.3"/></svg>`;
    return '';
  }

  // ── Rate badge ────────────────────────────────────────────────────────────
  function s5PctValue(value, decimals) {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toFixed(decimals == null ? 2 : decimals)
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '');
  }

  function rateBadgeHTML(value, type) {
    let color;
    if      (type === 'delivery')     color = ndrColor(value);
    else if (type === 'cancel')       color = value >= 40 ? '#ef4444' : value >= 30 ? '#f59e0b' : '#8892a4';
    else if (type === 'ndr')          color = ndrColor(value);
    else if (type === 'pending')      color = value >= 30 ? '#f59e0b' : value >= 15 ? '#a855f7' : '#8892a4';
    else if (type === 'confirmation') color = ndrColor(value);
    else color = '#8892a4';

    const capped = Math.min(Math.max(value, 0), 100);
    const label = s5PctValue(value);

    return `<div class="s5-rate-badge"><div style="font-size:var(--type-subtitle);font-weight:var(--weight-bold);color:${color};line-height:1;text-align:center">${label}٪</div>
<div class="s5-rate-track" style="width:100%;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;margin-top:6px">
  <div class="s5-rate-bar" data-target="${capped}" style="height:100%;width:100%;transform:scaleX(${capped / 100});transform-origin:${isAr ? 'right' : 'left'};background:${color};border-radius:2px;transition:none"></div>
</div></div>`;
  }

  // ── Funnel panel content ─────────────────────────────────────────────────
  function funnelHTML(p) {
    const total = p.totalOrderCount || p.statusTotalCount || p.netOrderCount || p.placedCount || 1;
    const stages = [
      { label:s5Txt('Total Orders', s5Txt('Total Orders', 'إجمالي الطلبات')), count: total, color:'#fff', pct: 100 },
      { label:s5Txt('Confirmed', 'مؤكدة'), count: p.confirmationStatusCount || p.confirmedCount, color:'#3b82f6', pct: p.confirmationPct },
      { label:s5Txt('Pending', 'قيد الانتظار'), count: p.pendingStatusCount || p.pendingCount || 0, color:'#a855f7', pct: p.pendingPct },
      { label:p5Txt('funnelCanceled'), count: p.cancelStatusCount || p.canceledCount, color:'#ef4444', pct: p.cancelPct },
      { label: s5Txt('In Shipping', 'في الشحن'),       count: p.shippingCount,  color:'#14b8a6', pct: parseFloat((p.shippingCount/total*100).toFixed(1)) },
      { label:s5Txt('Delivered ✓', 'مُسلَّمة ✓'),    count: p.deliveredCount, color:'#00e676', pct: p.deliveryPct },
      { label:p5Txt('funnelFailed'), count: p.failedCount, color:'#f97316', pct: parseFloat(((p.failedCount || 0)/total*100).toFixed(1)) },
    ];
    return stages.map((s, i) => {
      const indent = i * 14;
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding-right:${indent}px">
        <div style="width:${Math.max(4, s.pct)}%;max-width:160px;height:20px;border-radius:4px;background:${s.color}22;border:1px solid ${s.color}55;display:flex;align-items:center;padding:0 8px;min-width:56px">
          <div style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:${s.color};white-space:nowrap">${s.pct}٪</div>
        </div>
        <div style="font-size:var(--type-label);color:rgba(255,255,255,0.7);flex-shrink:0">${s.label}</div>
        <div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:#fff;margin-right:auto">${(s.count||0).toLocaleString('en-US')}</div>
      </div>`;
    }).join('');
  }

  // ── Pre-built per-product geoProductMap index (city name → cell) ─────────
  // Built lazily and cached so citiesHTML() does O(1) lookups instead of
  // O(cities) Object.keys().find() on every render.
  var _gpmProductIndexCache = null; // { productKey: { lowerCityName: cell } }
  var _gpmProductIndexGpm = null;   // reference to detect when gpm changes

  function _getGpmProductIndex(gpm, prodKey) {
    if (!gpm) return null;
    if (gpm !== _gpmProductIndexGpm) {
      // geoProductMap changed – clear cache
      _gpmProductIndexCache = {};
      _gpmProductIndexGpm = gpm;
    }
    if (!_gpmProductIndexCache) _gpmProductIndexCache = {};
    if (_gpmProductIndexCache[prodKey] !== undefined) return _gpmProductIndexCache[prodKey];
    // Build index for this product key across all cities
    var index = {};
    var cities = Object.keys(gpm);
    for (var ci = 0; ci < cities.length; ci++) {
      var cityKey = cities[ci];
      var cell = gpm[cityKey][prodKey];
      if (cell) index[cityKey] = cell;
    }
    _gpmProductIndexCache[prodKey] = index;
    return index;
  }

  function analysisPlaceholderHTML(label, loading) {
    return `<div class="${loading ? 's5-analysis-loading' : 's5-analysis-empty'}" style="color:rgba(255,255,255,0.3);font-size:var(--type-label);font-style:${loading ? 'italic' : 'normal'};padding:8px 0">${label}</div>`;
  }

  function citiesHTML(p) {
    if (!p || !p.cityBreakdown || !p.cityBreakdown.length) {
      return p && p._backendProduct
        ? analysisPlaceholderHTML(s5Txt('Loading city data...', 'جار تحميل بيانات المدن...'), true)
        : analysisPlaceholderHTML(s5Txt('No data', 'لا توجد بيانات'), false);
    }
    if (!p.cityBreakdown || !p.cityBreakdown.length) return `<div style="color:rgba(255,255,255,0.3);font-size:var(--type-label)">${s5Txt('No data', 'لا توجد بيانات')}</div>`;
    const topCities = p.cityBreakdown.slice(0, 5);
    const maxCount = topCities[0].count;

    // Pull per-city NDR/delivered for this product from geoProductMap
    const _geoD = window.dashboardGeoData;
    const _gpm  = _geoD && _geoD.geo && _geoD.geo.geoProductMap;
    const _prodKey = (p.key || p.sku || p.name || '').toLowerCase();
    // O(1) lookup index (city name → cell for this product)
    const _prodIndex = _gpm ? _getGpmProductIndex(_gpm, _prodKey) : null;

  function _getCityStats(cityRow) {
    var cityName = cityRow && cityRow.name ? cityRow.name : cityRow;
    if (cityRow && typeof cityRow === 'object' && cityRow.statusTotalCount != null) {
      const statusTotal = Number(cityRow.statusTotalCount || cityRow.count || 0);
      const netOrders = Number(cityRow.netOrderCount != null ? cityRow.netOrderCount : cityRow.count || 0);
      const confirmed = Number(cityRow.confirmationStatusCount != null ? cityRow.confirmationStatusCount : cityRow.confirmed || 0);
      return {
        orders: statusTotal,
        netOrders: netOrders,
        confirmed: confirmed,
        delivered: Number(cityRow.delivered || 0),
        confirmationRate: cityRow.confirmationPct != null
          ? Number(cityRow.confirmationPct)
          : (statusTotal ? confirmed / statusTotal * 100 : 0),
        ndr: cityRow.ndr != null
          ? Number(cityRow.ndr)
          : (netOrders ? Number(cityRow.delivered || 0) / netOrders * 100 : 0)
      };
    }
    if (!_prodIndex) return null;
    // O(1) direct hit
    var cityLower = cityName.toLowerCase();
    var cell = _prodIndex[cityLower] || _prodIndex[cityName];
    if (!cell) {
      // Fuzzy: check if any index key contains / is contained by cityName
      var keys = Object.keys(_prodIndex);
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        if (k.indexOf(cityLower) !== -1 || cityLower.indexOf(k) !== -1) { cell = _prodIndex[k]; break; }
      }
    }
    if (!cell || (!cell.orders && !cell.delivered)) return null;
    const confirmed = cell.confirmed || 0;
    const confirmationRate = cell.orders > 0 ? Math.round(confirmed / cell.orders * 1000) / 10 : null;
    const ndr = cell.orders > 0 ? Math.round((cell.delivered || 0) / cell.orders * 1000) / 10 : null;
    return { confirmed, confirmationRate, delivered: cell.delivered || 0, ndr };
  }

    const headerRow = `<div style="display:grid;grid-template-columns:1fr 42px 42px 42px 42px 42px;gap:5px;
      padding:3px 6px 6px;margin-bottom:2px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28)">${s5Txt('City','المدينة')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Orders','طلبات')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Conf.','مؤكد')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">CR</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Dlvrd','وصل')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">NDR</span>
    </div>`;

    const dataRows = topCities.map((c, i) => {
      const barPct = Math.round((c.count / maxCount) * 100);
      const colors = ['#f59e0b','#a855f7','#14b8a6'];
      const color  = colors[i] || '#8892a4';
      const stats  = _getCityStats(c);
      const confirmedDisplay = stats ? stats.confirmed.toLocaleString('en-US') : '-';
      const crVal = stats ? stats.confirmationRate : null;
      const crText = crVal === null ? '-' : crVal.toFixed(1) + '%';
      const crColor = crVal === null ? 'rgba(255,255,255,0.22)' : ndrColor(crVal);
      const deliveredDisplay = stats ? stats.delivered.toLocaleString('en-US') : '-';
      const ndrVal   = stats ? stats.ndr : null;
      const ndrTextColor = ndrVal === null ? 'rgba(255,255,255,0.22)' : ndrColor(ndrVal);
      const ndrText  = ndrVal === null ? '-' : s5PctValue(ndrVal) + '%';
      return `<div style="display:grid;grid-template-columns:1fr 42px 42px 42px 42px 42px;gap:5px;
        align-items:center;margin-bottom:7px;padding:5px 6px;border-radius:var(--dash-radius-sm);background:rgba(255,255,255,0.02);">
        <div>
          <div style="font-size:var(--type-caption);font-weight:var(--weight-bold);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</div>
          <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-top:4px">
            <div style="height:100%;width:${barPct}%;background:${color};border-radius:2px"></div>
          </div>
        </div>
        <div style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:${color}">${c.count}</div>
        <div style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:#3b82f6">${confirmedDisplay}</div>
        <div style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:${crColor}">${crText}</div>
        <div style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:rgba(255,255,255,0.65)">${deliveredDisplay}</div>
        <div style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:${ndrTextColor}">${ndrText}</div>
      </div>`;
    }).join('');

    return headerRow + dataRows;
  }

  function ndrColor(value) {
    return window.dashboardRateColor ? window.dashboardRateColor(value) : (value >= 40 ? '#22d3ee' : value >= 30 ? '#00e676' : value >= 20 ? '#f59e0b' : '#ef4444');
  }

  function piecesBreakdownHTML(p) {
    if (!p || !p.piecesBreakdown || !p.piecesBreakdown.length) {
      return p && p._backendProduct
        ? analysisPlaceholderHTML(s5Txt('Loading quantity data...', 'جار تحميل بيانات الكميات...'), true)
        : analysisPlaceholderHTML(s5Txt('No quantity data', 'لا توجد بيانات كميات'), false);
    }
    if (!p.piecesBreakdown || !p.piecesBreakdown.length) return '';
    const total = p.piecesBreakdown.reduce((s, x) => s + x.count, 0) || 1;
    const maxCount = p.piecesBreakdown.reduce((max, x) => Math.max(max, Number(x.count) || 0), 0) || 1;
    const headerRow = `<div style="display:grid;grid-template-columns:38px 46px 46px 46px 46px 46px;gap:5px;
      padding:3px 0 6px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28)">${s5Txt('Qty','Qty')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Orders','Orders')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Conf.','مؤكد')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">CR</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Delivered','Delivered')}</span>
      <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('NDR','NDR')}</span>
    </div>`;
    const rows = p.piecesBreakdown.map(item => {
      const pct = parseFloat((item.count / total * 100).toFixed(1));
      const barPct = Math.round((Number(item.count) || 0) / maxCount * 100);
      const delivered = Number(item.delivered || 0);
      const confirmed = Number(item.confirmed || 0);
      const hasOrders = (Number(item.count) || 0) > 0;
      const hasDeliveredMetric = hasOrders || delivered > 0;
      const crVal = item.confirmationPct !== undefined
        ? Number(item.confirmationPct || 0)
        : (hasOrders ? confirmed / Number(item.count) * 100 : 0);
      const crText = hasOrders ? crVal.toFixed(1) + '%' : '-';
      const crTextColor = hasOrders ? ndrColor(crVal) : 'rgba(255,255,255,0.45)';
      const ndrVal = item.ndr !== undefined
        ? Number(item.ndr || 0)
        : ((Number(item.count) || 0) > 0 ? delivered / Number(item.count) * 100 : 0);
      const ndrText = hasOrders ? s5PctValue(ndrVal) + '%' : '-';
      const ndrTextColor = hasOrders ? ndrColor(ndrVal) : 'rgba(255,255,255,0.45)';
      return `<div style="display:grid;grid-template-columns:38px 46px 46px 46px 46px 46px;gap:5px;align-items:center;margin-bottom:8px">
        <div>
          <div style="font-size:var(--type-control);font-weight:var(--weight-bold);color:#f59e0b">${esc(item.qty)}x</div>
          <div style="height:3px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;margin-top:4px">
            <div style="height:100%;width:${barPct || pct}%;background:#f59e0b;border-radius:2px"></div>
          </div>
        </div>
        <span style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:#f59e0b">${Number(item.count || 0).toLocaleString('en-US')}</span>
        <span style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:#3b82f6">${confirmed.toLocaleString('en-US')}</span>
        <span style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:${crTextColor}">${crText}</span>
        <span style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:#00e676">${hasDeliveredMetric ? delivered.toLocaleString('en-US') : '-'}</span>
        <span style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:${ndrTextColor}">${ndrText}</span>
      </div>`;
    }).join('');
    return headerRow + rows;
  }

  function productKeyForState(p) {
    return String((p && (p.key || p.sku || p.name)) || '');
  }

  function quantityCitiesHTML(p, options) {
    options = options || {};
    if (!p || !p.quantityCityBreakdown || !p.quantityCityBreakdown.length) {
      return p && p._backendProduct
        ? analysisPlaceholderHTML(s5Txt('Loading quantity-city data...', 'جار تحميل بيانات المدن حسب الكمية...'), true)
        : analysisPlaceholderHTML(s5Txt('No data', 'لا توجد بيانات'), false);
    }
    if (!p.quantityCityBreakdown || !p.quantityCityBreakdown.length) {
      return `<div style="color:rgba(255,255,255,0.3);font-size:var(--type-label)">${s5Txt('No data', 'لا توجد بيانات')}</div>`;
    }

    const PAGE_SIZE_QTY_CITIES = options.pageSize || 4;
    const totalItems = p.quantityCityBreakdown.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE_QTY_CITIES));
    const stateKey = quantityCityPageStateKey(p, options.scope || 'detail');
    const currentQtyPage = Math.min(
      totalPages,
      Math.max(1, Number(quantityCityPageByProduct[stateKey] || 1) || 1)
    );
    quantityCityPageByProduct[stateKey] = currentQtyPage;
    const startIndex = (currentQtyPage - 1) * PAGE_SIZE_QTY_CITIES;
    const pageItems = p.quantityCityBreakdown.slice(startIndex, startIndex + PAGE_SIZE_QTY_CITIES);
    const pageButtonClass = options.pageButtonClass || 's5-qty-city-page-btn';
    const prevClass = options.prevClass || 's5-qty-city-prev';
    const nextClass = options.nextClass || 's5-qty-city-next';
    const paginationHtml = totalPages > 1 && window.renderDashboardPagination
      ? `<div class="s5-qty-city-pagination-wrap" style="margin-top:10px;">${window.renderDashboardPagination({
          currentPage: currentQtyPage,
          totalPages: totalPages,
          totalItems: totalItems,
          startItem: startIndex + 1,
          endItem: Math.min(startIndex + PAGE_SIZE_QTY_CITIES, totalItems),
          itemLabel: s5Txt('quantity groups', 'مجموعات كمية'),
          pageButtonClass: pageButtonClass,
          prevClass: prevClass,
          nextClass: nextClass,
          className: options.className || 's5-qty-city-pagination'
        })}</div>`
      : '';

    const gridClassName = 's5-qty-city-grid' + (options.gridClassName ? ' ' + options.gridClassName : '');
    return `<div class="${gridClassName}" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">
      ${pageItems.map(item => {
        const cities = (item.cities || []).slice(0, 5);
        const maxCount = cities.length ? cities[0].count : 1;

        const colHdr = `<div style="display:grid;grid-template-columns:1fr 42px 42px 42px 42px 42px;gap:5px;
          padding:3px 6px 5px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28)">${s5Txt('City','المدينة')}</span>
          <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Orders','طلبات')}</span>
          <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Conf.','مؤكد')}</span>
          <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">CR</span>
          <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('Delivered','مُسلَّمة')}</span>
          <span style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.28);text-align:center">${s5Txt('NDR','NDR')}</span>
        </div>`;

        const cityRows = cities.length ? cities.map((city, i) => {
          const barPct = Math.round((city.count / maxCount) * 100);
          const hasDelivered = city.delivered !== undefined;
          const deliveredCell = hasDelivered
            ? city.delivered.toLocaleString('en-US')
            : '-';
          const confirmed = Number(city.confirmed || 0);
          const crVal = city.confirmationPct !== undefined
            ? Number(city.confirmationPct || 0)
            : (city.count > 0 ? confirmed / city.count * 100 : 0);
          const crCell = city.count > 0 ? crVal.toFixed(1) + '%' : '-';
          const crColor = city.count > 0
            ? (window.dashboardRateColor ? window.dashboardRateColor(crVal) : ndrColor(crVal))
            : 'rgba(255,255,255,0.45)';
          let ndrCell = '-';
          let ndrTextColor = 'rgba(255,255,255,0.45)';
          if (city.count > 0) {
            const ndrVal = city.delivered / city.count * 100;
            ndrCell = s5PctValue(ndrVal) + '%';
            ndrTextColor = ndrColor(ndrVal);
          }
          return `<div style="display:grid;grid-template-columns:1fr 42px 42px 42px 42px 42px;gap:5px;
            align-items:center;margin-bottom:${i === cities.length - 1 ? '0' : '7px'};
            padding:5px 6px;border-radius:var(--dash-radius-sm);background:rgba(255,255,255,0.02);">
            <div>
              <div style="font-size:var(--type-caption);color:rgba(255,255,255,0.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(city.name)}</div>
              <div style="height:2px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-top:3px">
                <div style="height:100%;width:${barPct}%;background:#f59e0b;border-radius:2px"></div>
              </div>
            </div>
            <span style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:#f59e0b">${city.count.toLocaleString('en-US')}</span>
            <span style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:#3b82f6">${confirmed.toLocaleString('en-US')}</span>
            <span style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:${crColor}">${crCell}</span>
            <span style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:#00e676">${deliveredCell}</span>
            <span style="text-align:center;font-size:var(--type-caption);font-weight:var(--weight-bold);color:${ndrTextColor}">${ndrCell}</span>
          </div>`;
        }).join('') : `<div style="color:rgba(255,255,255,0.3);font-size:var(--type-caption)">${s5Txt('No data', 'لا توجد بيانات')}</div>`;

        return `<div style="min-width:0;padding:12px;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06)">
          <div style="font-size:var(--type-control);font-weight:var(--weight-bold);color:#f59e0b;margin-bottom:10px">${esc(item.qty)}x</div>
          ${colHdr}${cityRows}
        </div>`;
      }).join('')}
    </div>${paginationHtml}`;
  }

  function detailPanelContent(p) {
    var aiHtml = window.renderProductAiAdvisor ? window.renderProductAiAdvisor(p) : '';
    var cardStyle = 'background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.06);border-radius:var(--dash-radius-md);padding:14px 16px;';
    var labelStyle = 'font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.35);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;';
    return (
      '<div style="display:grid;gap:12px;">' +
        /* AI Advisor — full width */
        (aiHtml ? '<div style="' + cardStyle + '">' + aiHtml + '</div>' : '') +
        /* Row 1: Funnel | Top Cities | Quantity Distribution */
        '<div class="s5-quick-analysis-grid" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;">' +
          '<div style="' + cardStyle + '">' +
            '<div style="' + labelStyle + '">' + s5Txt('Order Funnel', 'مسار الطلبات') + '</div>' +
            funnelHTML(p) +
          '</div>' +
          '<div style="' + cardStyle + '">' +
            '<div style="' + labelStyle + '">' + s5Txt('Top Cities', 'أبرز المدن') + '</div>' +
            citiesHTML(p) +
          '</div>' +
          '<div style="' + cardStyle + '">' +
            '<div style="' + labelStyle + '">' + s5Txt('Quantity Distribution', 'توزيع الكميات') + '</div>' +
            piecesBreakdownHTML(p) +
          '</div>' +
        '</div>' +
        /* Row 2: Top Cities by Quantity — full width */
        '<div style="' + cardStyle + '">' +
          '<div style="' + labelStyle + '">' + s5Txt('Top Cities by Quantity', 'أبرز المدن حسب الكمية') + '</div>' +
          quantityCitiesHTML(p) +
        '</div>' +
      '</div>'
    );
  }

  function cachedDetailPanelContent(product) {
    var stateKey = productKeyForState(product);
    var qtyStateKey = quantityCityPageStateKey(product, 'detail');
    var key = stateKey + '|' + selectedCurrency() + '|' + filterState.statusKey + '|' + (quantityCityPageByProduct[qtyStateKey] || 1);
    if (detailPanelCache.has(key)) return detailPanelCache.get(key);
    var html = detailPanelContent(product);
    detailPanelCache.set(key, html);
    return html;
  }

  function refreshDetailPanelContent(panel, product, detailToken) {
    if (!panel || !product) return;
    panel.innerHTML = cachedDetailPanelContent(product);
    if (!panel.isConnected || (detailToken && panel.dataset.detailToken !== detailToken)) return;
    panel.style.maxHeight = 'none';
  }

  function bindQuantityCityPagination(panel, product) {
    if (!panel || !product || !window.bindDashboardPagination) return;
    var key = quantityCityPageStateKey(product, 'detail');
    window.bindDashboardPagination(panel, {
      pageButtonSelector: '.s5-qty-city-page-btn',
      prevSelector: '.s5-qty-city-prev',
      nextSelector: '.s5-qty-city-next',
      onPage: function (page) {
        quantityCityPageByProduct[key] = page;
        refreshDetailPanelContent(panel, product, panel.dataset.detailToken || '');
      },
      onPrev: function () {
        quantityCityPageByProduct[key] = Math.max(1, Number(quantityCityPageByProduct[key] || 1) - 1);
        refreshDetailPanelContent(panel, product, panel.dataset.detailToken || '');
      },
      onNext: function () {
        quantityCityPageByProduct[key] = Number(quantityCityPageByProduct[key] || 1) + 1;
        refreshDetailPanelContent(panel, product, panel.dataset.detailToken || '');
      }
    });
  }

  const DIV = '<div class="s5-col-divider" style="width:1px;min-width:1px;flex:0 0 1px;align-self:stretch;background:rgba(255,255,255,0.05)"></div>';

  // ── Product row HTML ──────────────────────────────────────────────────────
  // Taager dashboard/status/NDR migration:
  // Taager exports SKU as product identity. Merchant-edited names are saved in
  // TaagerProductNames and shown here without changing the SKU.
  function productRowHTML(p, i) {
    const hs      = healthRowStyle(p);
    const compact = viewMode === 'compact';
    const minH    = compact ? '64px' : '88px';

    const productKey = p.key || p.sku || p.name || i;
    const totalPiecesText = productCompactNumber(p.totalPieces || 0, 0, 10000);
    const shippingText = productCompactNumber(p.shippingCount || 0, 0, 10000);
    const deliveredText = productCompactNumber(p.deliveredCount || 0, 0, 10000);
    const failedText = productCompactNumber(p.failedCount || 0, 0, 10000);
    const canceledText = productCompactNumber(p.canceledCount || 0, 0, 10000);
    const averageProfitText = productCompactNumber(p.averageProfit || 0, 2, 10000);
    const averageProfitFallback = p.averageProfitSource === 'net_orders_fallback';
    const adSpendText = productCompactNumber(p.allocatedAdSpend || 0, 2, 10000);
    const cpaText = productCompactNumber(p.cpa || 0, 2, 10000);
    const breakEvenText = productCompactNumber(p.breakEvenCpa || 0, 2, 10000);
    const pnlText = productCompactNumber(p.profitLoss || 0, 2, 10000);
    const displayOrderCount = p.totalOrderCount || p.statusTotalCount || p.placedCount || 0;
    const displayNetOrderCount = p.netOrderCount || p.placedCount || 0;
    const displayConfirmedCount = p.confirmationStatusCount || p.confirmedCount || 0;
    const firstOrderCreatedAt = String(p.firstOrderCreatedAt || '').slice(0, 10);
    const firstOrderCreatedAtText = firstOrderCreatedAt || '-';
    const placedText = productCompactNumber(displayOrderCount, 0, 10000);
    const netOrderText = productCompactNumber(displayNetOrderCount, 0, 10000);
    const confirmedText = productCompactNumber(displayConfirmedCount, 0, 10000);
    const revenueInFinancialCurrency = commissionInCurrency(p.revenue || 0);
    const revenueText = productCompactNumber(revenueInFinancialCurrency, 0, 10000);
    const productSkuLine = p.sku
      ? skuCopyHtml(p.sku, { block: true, style: 'font-size:var(--type-caption);color:rgba(255,255,255,0.32);margin-top:3px;font-weight:var(--weight-bold)' })
      : esc(p.cat);

    return `<div class="s5-product-row s5-metrics-track" data-idx="${i}" data-product-key="${attr(productKey)}"
         style="display:flex;align-items:center;border-radius:var(--dash-radius-lg);
                background:${hs.bg};
                 box-shadow:none;
                border:1px solid ${hs.border};
                opacity:${hs.opacity};
                 overflow:hidden;margin-bottom:8px;min-height:${minH};">

      <!-- Col 1: Identity -->
      <div class="s5-cell s5-cell-identity" style="flex:0 0 200px;min-width:200px;padding:10px 10px;display:flex;align-items:center;gap:9px">
        ${rankBadgeHTML(p.rank, p.deliveredCount, p.placedCount || p.statusTotalCount || p.totalOrderCount)}
        <div style="text-align:start;min-width:0">
          <div class="s5-product-title s5-product-name-edit" data-i18n-preserve data-product-sku="${attrData(p.sku || productKey)}" data-product-name="${attrData(p.name || '')}" title="${attrData(p.name || '')}" style="font-size:var(--type-body);font-weight:var(--weight-bold);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer">${escData(p.name)}</div>
          ${productSkuLine}
        </div>
      </div>
      ${DIV}

      <!-- Col 2: Total Orders -->
      <div class="s5-cell s5-cell-orders" style="flex:0 0 64px;min-width:64px;text-align:center;padding:0 5px">
        <div id="s5-placed-${i}" class="s5-number-fit" title="${attr(productNumber(displayOrderCount, 0))}" style="font-size:${compact?'15px':'17px'};font-weight:var(--weight-bold);color:rgba(255,255,255,0.8)">${placedText}</div>
      </div>
      ${DIV}

      <!-- Col 2b: Net Orders (excludes canceled-by-you) -->
      <div class="s5-cell s5-cell-net-orders" style="flex:0 0 64px;min-width:64px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" title="${attr(productNumber(displayNetOrderCount, 0))}" style="font-size:${compact?'15px':'17px'};font-weight:var(--weight-bold);color:#38bdf8">${netOrderText}</div>
      </div>
      ${DIV}

      <!-- Col 2c: First net order created date -->
      <div class="s5-cell s5-cell-first-order" title="${attr(firstOrderCreatedAt ? s5Txt('First net order created at', 'First net order created at') + ': ' + firstOrderCreatedAt : s5Txt('No net order creation date', 'No net order creation date'))}" style="flex:0 0 96px;min-width:96px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" style="font-size:${compact?'11px':'12px'};font-weight:var(--weight-bold);color:#fbbf24">${firstOrderCreatedAtText}</div>
      </div>
      ${DIV}

      <!-- Col 3: Quantity -->
      <div class="s5-cell s5-cell-pieces" style="flex:0 0 68px;min-width:68px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" title="${attr(productNumber(p.totalPieces || 0, 0))}" style="font-size:${compact?'14px':'16px'};font-weight:var(--weight-bold);color:#3b82f6">${totalPiecesText}</div>
      </div>
      ${DIV}

      <!-- Col 4: Confirmed Orders count -->
      <div class="s5-cell s5-cell-confirmed-count" style="flex:0 0 64px;min-width:64px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" title="${attr(productNumber(displayConfirmedCount, 0))}" style="font-size:${compact?'14px':'16px'};font-weight:var(--weight-bold);color:#3b82f6">${confirmedText}</div>
      </div>
      ${DIV}

      <!-- Col 5: In Shipping count -->
      <div class="s5-cell s5-cell-shipping" style="flex:0 0 64px;min-width:64px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" title="${attr(productNumber(p.shippingCount || 0, 0))}" style="font-size:${compact?'14px':'16px'};font-weight:var(--weight-bold);color:#14b8a6">${shippingText}</div>
      </div>
      ${DIV}

      <!-- Col 6: Delivered Orders count -->
      <div class="s5-cell s5-cell-delivered-count" style="flex:0 0 64px;min-width:64px;text-align:center;padding:0 5px">
        <div id="s5-del-${i}" class="s5-number-fit" title="${attr(productNumber(p.deliveredCount || 0, 0))}" style="font-size:${compact?'15px':'17px'};font-weight:var(--weight-bold);color:#14b8a6">${deliveredText}${window.supposedBadgeHtml('delivered')}</div>
      </div>
      ${DIV}

      <!-- Col 7: Failed Orders raw count -->
      <div class="s5-cell s5-cell-failed" style="flex:0 0 64px;min-width:64px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" title="${attr(productNumber(p.failedCount || 0, 0))}" style="font-size:${compact?'14px':'16px'};font-weight:var(--weight-bold);color:#f97316">${failedText}</div>
      </div>
      ${DIV}

      <!-- Col 8: Canceled Orders raw count -->
      <div class="s5-cell s5-cell-canceled-raw" style="flex:0 0 68px;min-width:68px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" title="${attr(productNumber(p.canceledCount || 0, 0))}" style="font-size:${compact?'14px':'16px'};font-weight:var(--weight-bold);color:#ef4444">${canceledText}</div>
      </div>
      ${DIV}

      <!-- Col 6: Confirmation % -->
      <div class="s5-cell s5-cell-confirmation" style="flex:0 0 ${compact?'66px':'70px'};min-width:${compact?'66px':'70px'};padding:0 5px">
        ${rateBadgeHTML(p.confirmationPct, 'confirmation')}
      </div>
      ${DIV}

      <!-- Col 7: Cancel % -->
      <div class="s5-cell s5-cell-cancel" style="flex:0 0 ${compact?'66px':'70px'};min-width:${compact?'66px':'70px'};padding:0 5px">
        ${rateBadgeHTML(p.cancelPct, 'cancel')}
      </div>
      ${DIV}

      <!-- Col 8: Pending % -->
      <div class="s5-cell s5-cell-pending" style="flex:0 0 ${compact?'66px':'70px'};min-width:${compact?'66px':'70px'};padding:0 5px">
        ${rateBadgeHTML(p.pendingPct, 'pending')}
      </div>
      ${DIV}

      <!-- Col 9: NDR % -->
      <div class="s5-cell s5-cell-ndr" style="flex:0 0 ${compact?'64px':'66px'};min-width:${compact?'64px':'66px'};padding:0 5px">
        ${rateBadgeHTML(p.deliveredCount > 0 ? p.ndrPct : 0, 'ndr')}
      </div>
      ${DIV}

      <!-- Col 10: Delivery % -->
      <div class="s5-cell s5-cell-delivery" style="flex:0 0 ${compact?'66px':'70px'};min-width:${compact?'66px':'70px'};padding:0 5px">
        ${rateBadgeHTML(p.drRate, 'delivery')}
      </div>
      ${DIV}

      <!-- Col 11: Average Profit -->
      <div class="s5-cell s5-cell-average-profit" title="${attr(averageProfitFallback ? s5Txt('Estimated average profit from net orders', 'متوسط ربح تقديري من صافي الطلبات') : s5Txt('Average profit per delivered order', 'متوسط الربح لكل طلب مسلم'))}" style="flex:0 0 80px;min-width:80px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" data-financial-value="averageProfit" title="${attr(productMoney(p.averageProfit || 0))}" style="font-size:${compact?'12px':'13px'};font-weight:var(--weight-bold);color:#38bdf8;white-space:nowrap">${averageProfitText}</div>
        <div data-financial-currency="averageProfit" style="font-size:var(--type-micro);color:rgba(56,189,248,0.55);font-weight:var(--weight-bold);margin-top:2px">${selectedCurrency()}</div>
        ${averageProfitFallback ? `<div style="font-size:9px;color:#f59e0b;margin-top:1px;white-space:nowrap">${s5Txt('from net orders', 'من صافي الطلبات')}</div>` : ''}
      </div>
      ${DIV}

      <!-- Col 12: Allocated Ad Spend -->
      <div class="s5-cell s5-cell-ad-spend" title="${attr(p5Txt('adSpendHelp'))}" style="flex:0 0 80px;min-width:80px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" data-financial-value="allocatedAdSpend" title="${attr(productMoney(p.allocatedAdSpend || 0))}" style="font-size:${compact?'12px':'13px'};font-weight:var(--weight-bold);color:#60a5fa;white-space:nowrap">${adSpendText}</div>
        <div data-financial-currency="allocatedAdSpend" style="font-size:var(--type-micro);color:rgba(96,165,250,0.55);font-weight:var(--weight-bold);margin-top:2px">${selectedCurrency()}</div>
      </div>
      ${DIV}

      <!-- Col 13: CPA -->
      <div class="s5-cell s5-cell-cpa" title="${attr(p5Txt('cpaHelp'))}" style="flex:0 0 68px;min-width:68px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" data-financial-value="cpa" title="${attr(productMoney(p.cpa || 0))}" style="font-size:${compact?'12px':'13px'};font-weight:var(--weight-bold);color:#a78bfa;white-space:nowrap">${cpaText}</div>
        <div data-financial-currency="cpa" style="font-size:var(--type-micro);color:rgba(167,139,250,0.55);font-weight:var(--weight-bold);margin-top:2px">${selectedCurrency()}</div>
      </div>
      ${DIV}

      <!-- Col 14: Break-even CPA -->
      <div class="s5-cell s5-cell-breakeven" title="${attr(p5Txt('breakEvenHelp'))}" style="flex:0 0 76px;min-width:76px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" data-financial-value="breakEvenCpa" title="${attr(productMoney(p.breakEvenCpa || 0))}" style="font-size:${compact?'12px':'13px'};font-weight:var(--weight-bold);color:${(Number(p.cpa)||0) > (Number(p.breakEvenCpa)||0) ? '#ef4444' : '#f59e0b'};white-space:nowrap">${breakEvenText}</div>
        <div data-financial-currency="breakEvenCpa" style="font-size:var(--type-micro);color:rgba(245,158,11,0.55);font-weight:var(--weight-bold);margin-top:2px">${selectedCurrency()}</div>
      </div>
      ${DIV}

      <!-- Col 15: P&L -->
      <div class="s5-cell s5-cell-pnl" title="${attr(p5Txt('pnlHelp'))}" style="flex:0 0 76px;min-width:76px;text-align:center;padding:0 5px">
        <div class="s5-number-fit" data-financial-value="profitLoss" title="${attr(productMoney(p.profitLoss || 0))}" style="font-size:${compact?'12px':'13px'};font-weight:var(--weight-bold);color:${p.profitLoss >= 0 ? '#00e676' : '#ef4444'};white-space:nowrap">${pnlText}${window.supposedBadgeHtml('profit')}</div>
        <div data-financial-currency="profitLoss" style="font-size:var(--type-micro);color:${p.profitLoss >= 0 ? 'rgba(0,230,118,0.55)' : 'rgba(239,68,68,0.55)'};font-weight:var(--weight-bold);margin-top:2px">${selectedCurrency()}</div>
      </div>
      ${DIV}

      <!-- Col 16: Taager profit (commission key retained for compatibility) -->
      <div class="s5-cell s5-cell-commission" style="flex:0 0 80px;min-width:80px;text-align:center;padding:0 5px">
        <div style="font-size:${compact?'16px':'18px'};font-weight:var(--weight-bold);color:${p.accent || '#f59e0b'};letter-spacing:-0.5px">
          <span id="s5-rev-${i}" class="s5-number-fit" data-financial-value="revenue" title="${attr(productMoney(revenueInFinancialCurrency) + (selectedCurrency() !== activeCurrency ? ' | Native: ' + productNumber(p.revenue || 0, 0) + ' ' + activeCurrency : ''))}">${revenueText}${window.supposedBadgeHtml('revenue')}</span>
        </div>
        <div data-financial-currency="revenue" style="font-size:var(--type-micro);color:rgba(255,255,255,0.35);font-weight:var(--weight-semibold);margin-top:2px">${selectedCurrency()}</div>
      </div>

      <!-- Actions cell -->
      <div class="s5-cell s5-cell-actions" style="width:72px;min-width:72px;height:100%;min-height:${minH};flex-shrink:0;display:grid;grid-template-columns:repeat(2, 28px);grid-auto-rows:28px;align-content:center;justify-content:center;gap:6px;
                  background:transparent;position:sticky;right:0;z-index:2;border-left:1px solid var(--dash-border-soft, rgba(255,255,255,0.08));
                  padding:5px;box-sizing:border-box;">
        
        <!-- T-22: Show on map button -->
        <button class="s5-map-btn" data-product-key="${attr(productKey)}" data-tooltip="${s5Txt('Analyze cities for this product', 'تحليل المدن لهذا المنتج')}"
                style="width:28px;height:28px;border-radius:var(--dash-radius-sm);border:1px solid rgba(20,184,166,0.3);
                background:rgba(20,184,166,0.1);color:#14b8a6;font-size:var(--type-label);
                       display:flex;align-items:center;justify-content:center;cursor:pointer;
                       flex-shrink:0;padding:0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M14.5 4.5 9.5 2 3 5.5v16l6.5-3.5 5 2.5 6.5-3.5v-16l-6.5 3.5Z"/><path d="M9.5 2v16"/><path d="M14.5 4.5v16"/></svg>
        </button>

        <!-- Modal Details Button -->
        <button class="s5-modal-btn" data-modal-open="1" data-product-key="${attr(productKey)}" data-tooltip="${s5Txt('View full product details', 'عرض تفاصيل المنتج كاملة')}"
                style="width:28px;height:28px;border-radius:var(--dash-radius-sm);border:1px solid rgba(139,92,246,0.3);
                background:rgba(139,92,246,0.1);color:#8b5cf6;
                       display:flex;align-items:center;justify-content:center;cursor:pointer;
                       flex-shrink:0;padding:0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </button>

        <!-- Compare product button -->
        <button class="s5-compare-row-btn" data-compare-open="1" data-product-key="${attr(productKey)}" data-tooltip="${s5Txt('Compare this product', 'قارن هذا المنتج')}"
                style="width:28px;height:28px;border-radius:var(--dash-radius-sm);border:1px solid rgba(245,158,11,0.38);
                background:rgba(245,158,11,0.12);color:#f59e0b;
                       display:flex;align-items:center;justify-content:center;cursor:pointer;
                       flex-shrink:0;padding:0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M6 7l-4 7h8L6 7z"/><path d="M18 7l-4 7h8l-4-7z"/></svg>
        </button>

        <!-- Expand accordion button -->
        <button class="s5-expand-btn" data-idx="${i}" data-tooltip="${s5Txt('Quick analysis (funnel / cities)', 'تحليل سريع (مسار / مدن)')}"
                style="width:28px;height:28px;border-radius:var(--dash-radius-sm);border:1px solid rgba(255,255,255,0.12);
                       background:rgba(255,255,255,0.05);color:var(--dash-text-muted);
                       display:flex;align-items:center;justify-content:center;cursor:pointer;
                       flex-shrink:0;padding:0;">
          <svg class="s5-expand-arrow" data-idx="${i}" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2.5"
               style="pointer-events:none">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Detail panel -->
    <div class="s5-detail-panel" id="s5-detail-${i}"
         style="display:none;max-height:none;overflow:hidden;opacity:1;
                padding:0;
                width:100%;max-width:var(--s5-detail-width, 100%);
                margin-bottom:0;border-radius:var(--dash-radius-lg);
                background:rgba(255,255,255,0.02);
                border:1px solid rgba(255,255,255,0);
                box-sizing:border-box">
    </div>`;
  }

  // ── Column header sort button ─────────────────────────────────────────────
  function colHeaderBtn(label, field, flexStyle) {
    const isActive = sortState.field === field;
    const arrow    = isActive ? (sortState.dir === 'desc' ? '↓' : '↑') : '↕';
    const arrowColor = isActive ? '#f59e0b' : 'rgba(255,255,255,0.2)';
    
    // Auto-generate min-width from flexStyle to support robust max-content container calculation
    let minWidthStyle = '';
    const match = flexStyle.match(/flex:\s*0\s+0\s+(\d+)px?/);
    if (match) {
      minWidthStyle = `;min-width:${match[1]}px`;
    }
    
    return `<button class="s5-sort-col" data-field="${field}"
        style="${flexStyle}${minWidthStyle};background:none;border:none;color:rgba(255,255,255,0.35);
               font-size:var(--type-micro);font-weight:var(--weight-bold);cursor:pointer;
               display:flex;align-items:center;justify-content:center;gap:4px;
               font-family:inherit;padding:0;width:100%;text-align:center">
      ${label}
      <span class="s5-sort-arrow" data-field="${field}" style="color:${arrowColor}">${arrow}</span>
    </button>`;
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function paginationHTML(list) {
    list = list || currentList();
    const total = totalProductPages(list);
    if (total <= 1) return '';

    const start = ((currentPage - 1) * PAGE_SIZE) + 1;
    const totalItems = backendProductsActive ? backendProductsTotal : list.length;
    const end   = Math.min(currentPage * PAGE_SIZE, totalItems);

    if (window.renderDashboardPagination) {
      return window.renderDashboardPagination({
        currentPage: currentPage,
        totalPages: total,
        totalItems: totalItems,
        startItem: start,
        endItem: end,
        itemLabel: s5Txt('product', '\u0645\u0646\u062a\u062c'),
        pageButtonClass: 's5-page-btn',
        prevId: 's5-prev-page',
        nextId: 's5-next-page',
        className: 's5-dashboard-pagination'
      });
    }

    function pageButtons() {
      const pages = [];
      const WINDOW = 2;

      for (let p = 1; p <= total; p++) {
        if (
          p === 1 || p === total ||
          (p >= currentPage - WINDOW && p <= currentPage + WINDOW)
        ) {
          pages.push(p);
        } else if (pages[pages.length - 1] !== '...') {
          pages.push('...');
        }
      }

      return pages.map(p => {
        if (p === '...') {
          return `<span style="width:32px;text-align:center;color:rgba(255,255,255,0.25);font-size:var(--type-control);font-weight:var(--weight-semibold);user-select:none">...</span>`;
        }
        const isActive = p === currentPage;
        return `<button class="s5-page-btn" data-page="${p}"
          style="width:32px;height:32px;border-radius:var(--dash-radius-sm);border:1px solid ${isActive ? '#f59e0b' : 'rgba(255,255,255,0.1)'};
                 background:${isActive ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.03)'};
                 color:${isActive ? '#f59e0b' : 'rgba(255,255,255,0.6)'};
                 font-size:var(--type-control);font-weight:${isActive ? '800' : '600'};
                 cursor:${isActive ? 'default' : 'pointer'};font-family:inherit;
                 display:inline-flex;align-items:center;justify-content:center">${p}</button>`;
      }).join('');
    }

    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= total;

    const arrowStyle = (disabled) =>
      `width:32px;height:32px;border-radius:var(--dash-radius-sm);border:1px solid ${disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'};
       background:${disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'};
       color:${disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.7)'};
       cursor:${disabled ? 'default' : 'pointer'};font-family:inherit;
       display:inline-flex;align-items:center;justify-content:center;
       flex-shrink:0`;

    return `<div id="s5-pagination" style="display:flex;align-items:center;justify-content:space-between;gap:10px;
              margin:14px 0 24px;padding:12px 16px;
              border:1px solid rgba(255,255,255,0.06);border-radius:var(--dash-radius-md);
              background:rgba(255,255,255,0.02);direction:${isAr ? 'ltr' : 'rtl'}">
      <button id="s5-prev-page" ${prevDisabled ? 'disabled' : ''} style="${arrowStyle(prevDisabled)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <div style="display:flex;align-items:center;gap:6px;flex:1;justify-content:center;flex-wrap:wrap">
        ${pageButtons()}
      </div>
      <button id="s5-next-page" ${nextDisabled ? 'disabled' : ''} style="${arrowStyle(nextDisabled)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
    <div style="text-align:center;font-size:var(--type-caption);color:rgba(255,255,255,0.3);font-weight:var(--weight-semibold);margin-bottom:8px;direction:${isAr ? 'rtl' : 'ltr'}">
      ${s5Txt(`Showing ${start}–${end} of ${totalItems} products`, `عرض ${start}–${end} من ${totalItems} منتج`)}
    </div>`;
  }

  // ── Stat card ─────────────────────────────────────────────────────────────
  function statCardHTML(c, i) {
    const displayValue = c.displayValue != null ? String(c.displayValue) : productCompactNumber(c.value, 0, 10000);
    const titleValue = c.displayValue != null ? String(c.displayValue) : productNumber(c.value, 0);
    return `<div class="s5-stat-card" style="min-height:112px;min-width:0;background:var(--dash-surface);border:1px solid ${c.color}28;border-radius:var(--dash-radius-lg);padding:16px 18px;direction:${isAr ? 'ltr' : 'rtl'};display:flex;flex-direction:row;align-items:center;gap:14px;position:relative;overflow:hidden;box-sizing:border-box">
      <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 20% 50%,${c.color}10 0%,transparent 65%)"></div>
      <div class="s5-stat-icon" style="width:46px;height:46px;border-radius:var(--dash-radius-md);flex-shrink:0;background:${c.color}22;border:1.5px solid ${c.color}35;display:flex;align-items:center;justify-content:center;position:relative;z-index:1">${statIconHTML(c.iconType, c.color)}</div>
      <div style="flex:1;min-width:0;text-align:right;direction:${isAr ? 'rtl' : 'ltr'};position:relative;z-index:1">
        <div class="s5-stat-label" style="min-height:32px;display:flex;align-items:flex-end;justify-content:flex-end;font-size:var(--type-micro);color:rgba(255,255,255,0.35);font-weight:var(--weight-semibold);margin-bottom:4px;line-height:1.3">${c.label}</div>
        <div id="s5-stat-${i}" class="s5-stat-value s5-number-fit" title="${attr(titleValue)}" style="font-size:var(--type-page-title);font-weight:var(--weight-bold);color:#fff;line-height:1;letter-spacing:0">${esc(displayValue)}</div>
        <div class="s5-stat-unit" data-stat-unit="${i}" style="font-size:var(--type-micro);color:${c.color};font-weight:var(--weight-bold);margin-top:4px;letter-spacing:0.3px">${c.unit}</div>
      </div>
    </div>`;
  }

  // ── Insight card ──────────────────────────────────────────────────────────
  function insightCardHTML(ins, i) {
    return `<div data-insight-card="${i}" style="flex:1;background:${ins.bg};border:1px solid ${ins.border};border-radius:var(--dash-radius-lg);padding:14px 16px;display:flex;align-items:center;gap:12px;direction:${isAr ? 'ltr' : 'rtl'}">
      <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;background:${ins.iconGlow}22;border:1.5px solid ${ins.iconGlow}35;display:flex;align-items:center;justify-content:center;font-size:var(--type-metric-sm)">${ins.emoji}</div>
      <div style="flex:1;text-align:right;direction:${isAr ? 'rtl' : 'ltr'}">
        <div style="font-size:var(--type-micro);color:var(--dash-text-faint);font-weight:var(--weight-semibold);margin-bottom:3px">${ins.label}</div>
        <div data-insight-value="${i}" style="font-size:var(--type-label);font-weight:var(--weight-bold);color:#fff;margin-bottom:4px;line-height:1.3">${esc(ins.value)}</div>
        <div data-insight-detail="${i}" style="font-size:var(--type-caption);font-weight:var(--weight-bold);color:${ins.detailColor}">${esc(ins.detail)}</div>
      </div>
    </div>`;
  }

  // ── Sort options ──────────────────────────────────────────────────────────
  const SORT_OPTIONS = [
    { value: 'deliveredCount',  label: s5Txt('Deliveries', 'عدد التسليمات'), icon: 'BOX' },
    { value: 'commission',      label: s5Txt('Taager Profit After Tax', 'ربح تاجر بعد الضريبة'),        icon: 'COD' },
    { value: 'ndrPct',          label: 'NDR', icon: '%' },
    { value: 'drRate',          label: s5Txt('Delivery Rate', 'نسبة التسليم'),   icon: '✅' },
    { value: 'scalingScore',    label: s5Txt('Scale Index', 'مؤشر التوسع'), icon: '*' },
    { value: 'cancelPct',       label: s5Txt('Cancellation Rate', 'نسبة الإلغاء'),   icon: '❌' },
    { value: 'pendingPct',      label: s5Txt('Pending Rate', 'نسبة قيد الانتظار'), icon: '...' },
    { value: 'netOrderCount', label: s5Txt('Net Orders', 'صافي الطلبات'), icon: '📋' },
    { value: 'firstOrderCreatedAt', label: s5Txt('First Net Order', 'First Net Order'), icon: '1st' },
    { value: 'totalPieces',     label: s5Txt('Quantity', 'القطع'), icon: 'BOX' },
    { value: 'confirmationPct', label: s5Txt('Confirmation Rate', 'نسبة التأكيد'),   icon: '☑️' },
    { value: 'failedCount',     label: p5Txt('failedOrders'), icon: '!' },
    { value: 'canceledCount',   label: s5Txt('Canceled by you', 'ملغي بواسطتك'),    icon: '🚫' },
    { value: 'averageProfit',   label: s5Txt('Average Profits', 'متوسط الأرباح'), icon: '$' },
    { value: 'allocatedAdSpend',label: p5Txt('adSpend'), icon: '$' },
    { value: 'cpa',             label: p5Txt('cpa'), icon: '$' },
    { value: 'breakEvenCpa',    label: p5Txt('breakEven'), icon: '$' },
    { value: 'profitLoss',      label: p5Txt('pnl'), icon: '$' },
    { value: 'shippingCount',   label: s5Txt('In Shipping', 'في الشحن'),       icon: '🚚' },
    { value: 'processingCount', label: s5Txt('Processing', 'قيد المعالجة'),   icon: '⏳' },
  ];

  function activeSortLabel() {
    if (sortState.field === 'default') return s5Txt('Default', 'الافتراضي');
    const opt = SORT_OPTIONS.find(o => o.value === sortState.field);
    return opt ? opt.label : s5Txt('Default', 'الافتراضي');
  }

  // ── FIX 3 helper: filter bar re-render needs to know the current dropdown state ──
  let _dropdownOpen = false;

  // ── Filter bar ────────────────────────────────────────────────────────────
  function filterBarHTML(list) {
    list = list || currentList();
    const pillsHTML = STATUS_PILLS.map(pill => {
      const isActive = filterState.statusKey === pill.key;
      const isAll    = pill.key === 'all';

      if (isAll) {
        return `<button class="s5-pill" data-key="all"
          style="display:flex;align-items:center;gap:6px;
                 padding:6px 14px;border-radius:var(--radius-pill);font-size:var(--type-label);font-weight:${isActive?'800':'600'};
                 border:1px solid ${isActive ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)'};
                 cursor:pointer;font-family:inherit;
                 background:${isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'};
                 color:${isActive ? '#fff' : 'rgba(255,255,255,0.5)'};
                 white-space:nowrap">
          ${s5Txt('All', 'الكل')}
          ${isActive ? `<span style="background:#f59e0b;color:#000;font-size:var(--type-micro);font-weight:var(--weight-bold);padding:1px 6px;border-radius:var(--radius-pill);line-height:1.5">${backendProductsActive ? backendProductsTotal : list.length}</span>` : ''}
        </button>`;
      }

      return `<button class="s5-pill" data-key="${pill.key}"
          style="display:flex;align-items:center;gap:6px;
                 padding:6px 14px;border-radius:var(--radius-pill);font-size:var(--type-label);font-weight:${isActive?'800':'600'};
                 border:1px solid ${isActive ? pill.color + '60' : 'rgba(255,255,255,0.08)'};
                 cursor:pointer;font-family:inherit;
                 background:${isActive ? pill.color + '18' : 'rgba(255,255,255,0.03)'};
                 color:${isActive ? pill.color : 'rgba(255,255,255,0.45)'};
                 white-space:nowrap">
        <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;
                     background:${isActive ? pill.color : 'rgba(255,255,255,0.2)'}"></span>
        ${pill.label}
      </button>`;
    }).join('');

    const sortMenuHTML = SORT_OPTIONS.map(opt => {
      const isActive = sortState.field === opt.value;
      return `<div class="s5-sort-option ${isActive ? 'active' : ''}" data-value="${opt.value}">
        <span class="s5-opt-dot"></span>
        <span style="font-size:var(--type-body);line-height:1">${opt.icon}</span>
        <span>${opt.label}</span>
        ${isActive ? `<svg style="margin-right:auto;flex-shrink:0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </div>`;
    }).join('');

    return `<div id="s5-filter-bar"
        style="margin-bottom:16px;
               background:linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%);
               border:1px solid rgba(255,255,255,0.09);
               border-radius:var(--dash-radius-xl);padding:14px 16px;direction:${isAr ? 'rtl' : 'ltr'};">

      <!-- Search bar -->
      <div style="position:relative;margin-bottom:12px">
        <svg style="position:absolute;right:14px;top:50%;transform:translateY(-50%);opacity:0.35;pointer-events:none;z-index:1"
             width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input id="s5-search" type="text" placeholder="${s5Txt('Search by Product name or SKU...', 'ابحث باسم المنتج أو SKU...')}" value="${attr(filterState.search)}"
          style="width:100%;padding:10px 42px 10px 42px;border-radius:var(--dash-radius-md);
                 border:1px solid rgba(255,255,255,0.1);
                 background:rgba(255,255,255,0.05);color:#fff;font-size:var(--type-control);font-family:inherit;
                 outline:none;box-sizing:border-box;direction:${isAr ? 'rtl' : 'ltr'};"/>
        ${filterState.search ? `<button id="s5-search-clear"
          style="position:absolute;left:12px;top:50%;transform:translateY(-50%);
                 width:20px;height:20px;border-radius:50%;border:none;cursor:pointer;
                 background:rgba(255,255,255,0.12);color:var(--dash-text-muted);
                 display:flex;align-items:center;justify-content:center;font-size:var(--type-micro);
                 line-height:1;padding:0;font-family:inherit">x</button>` : ''}
      </div>

      <!-- Row 2: pills + sort -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div id="s5-status-pills" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${pillsHTML}
          
          <div style="display:flex;align-items:center;gap:12px;margin-inline-start:12px;padding-inline-start:12px;border-inline-start:1px solid rgba(255,255,255,0.06);">
            <div style="display:flex;align-items:center;gap:4px;" title="${s5Txt('Delivery rate >= 40%', 'نسبة التسليم >= 40%')}">
               <div style="width:8px;height:8px;border-radius:50%;background:#22d3ee"></div>
               <span style="font-size:var(--type-micro);color:rgba(255,255,255,0.45);font-weight:var(--weight-semibold)">${s5Txt('Scalable', 'قابل للتوسع')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;" title="${s5Txt('Cancel rate >= 40%', 'نسبة الإلغاء >= 40%')}">
               <div style="width:8px;height:8px;border-radius:50%;background:#ef4444"></div>
               <span style="font-size:var(--type-micro);color:rgba(255,255,255,0.45);font-weight:var(--weight-semibold)">${s5Txt('Danger', 'خطر')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;" title="${s5Txt('NDR < 20%', 'نسبة التسليم الصافي < 20%')}">
               <div style="width:8px;height:8px;border-radius:50%;background:#ef4444"></div>
               <span style="font-size:var(--type-micro);color:rgba(255,255,255,0.45);font-weight:var(--weight-semibold)">${s5Txt('Warning', 'تحذير')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;" title="${s5Txt('Top 3 performing products', 'أفضل 3 منتجات أداء')}">
               <div style="width:8px;height:8px;border-radius:50%;background:#fbbf24"></div>
               <span style="font-size:var(--type-micro);color:rgba(255,255,255,0.45);font-weight:var(--weight-semibold)">${s5Txt('Top Products', 'أفضل المنتجات')}</span>
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button id="s5-compare-open" data-tooltip="${s5Txt('Compare Products', 'مقارنة المنتجات')}"
            style="height:34px;padding:0 12px;border-radius:var(--dash-radius-sm);border:1px solid rgba(245,158,11,0.28);
                   background:rgba(245,158,11,0.10);color:#fbbf24;display:flex;align-items:center;
                   justify-content:center;gap:7px;cursor:pointer;flex-shrink:0;
                   font-size:var(--type-caption);font-weight:var(--weight-bold);font-family:inherit;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M6 7l-4 7h8L6 7z"/><path d="M18 7l-4 7h8l-4-7z"/></svg>
            ${s5Txt('Compare Products', 'مقارنة المنتجات')}
          </button>

          <span style="font-size:var(--type-micro);color:rgba(255,255,255,0.28);font-weight:var(--weight-bold);
                       letter-spacing:0.5px;white-space:nowrap;text-transform:uppercase">${s5Txt("Sort", "ترتيب")}</span>

          <!-- Trigger only - menu is body-teleported in bindFilterBar to escape overflow:hidden -->
          <div class="s5-sort-dropdown" id="s5-sort-dropdown" style="position:relative">
            <div class="s5-sort-trigger" id="s5-sort-trigger" tabindex="0">
              <span id="s5-sort-label" style="direction:${isAr ? 'rtl' : 'ltr'}">${activeSortLabel()}</span>
              <svg class="s5-sort-chevron" width="12" height="12" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          <!-- Direction toggle -->
          <div style="display:flex;align-items:center;gap:4px;">
            ${sortState.field !== 'default' ? `
            <button id="s5-clear-sort" title="${s5Txt('Clear Sort', 'إلغاء الترتيب')}"
              style="width:34px;height:34px;border-radius:var(--dash-radius-sm);border:1px solid rgba(239,68,68,0.2);
                     background:rgba(239,68,68,0.05);color:#ef4444;display:flex;align-items:center;
                     justify-content:center;cursor:pointer;flex-shrink:0;padding:0;box-sizing:border-box;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>` : ''}
            
            <button id="s5-sort-dir-btn"
            style="width:34px;height:34px;border-radius:var(--dash-radius-sm);
                   border:1px solid rgba(255,255,255,0.1);
                   background:rgba(255,255,255,0.04);
                   color:var(--dash-text-muted);cursor:pointer;
                   display:flex;align-items:center;justify-content:center;
                   flex-shrink:0;padding:0;box-sizing:border-box;"
            title="${sortState.dir === 'desc' ? s5Txt('Ascending', 'تصاعدي') : s5Txt('Descending', 'تنازلي')}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              ${sortState.dir === 'desc'
                ? '<path d="M12 20V4M5 13l7 7 7-7"/>'
                : '<path d="M12 4v16M5 11l7-7 7 7"/>'}
            </svg>
          </button>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── Column headers ────────────────────────────────────────────────────────
  function columnHeadersHTML() {
    const compact = viewMode === 'compact';
    return `<div class="s5-header-cols s5-metrics-track" style="display:flex;align-items:center;padding:0 0 10px 0;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:10px;position:sticky;top:0;z-index:9;background:var(--dash-bg)">
      <div class="s5-header-product" style="flex:0 0 200px;min-width:200px;padding-inline-start:10px;font-size:var(--type-micro);color:rgba(255,255,255,0.42);font-weight:var(--weight-bold);text-align:start">${s5Txt('Product', 'المنتج')}</div>
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Orders', 'الطلبات'),'totalOrderCount','flex:0 0 64px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Net Orders', 'الطلبات الصافية'),'netOrderCount','flex:0 0 64px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('First Order', 'First Order'),'firstOrderCreatedAt','flex:0 0 96px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Quantity', 'القطع'),'totalPieces','flex:0 0 68px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Confirmed', 'مؤكد'),'confirmationStatusCount','flex:0 0 64px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('In Shipping', 'قيد الشحن'),'shippingCount','flex:0 0 64px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Delivered', 'تم التسليم'),'deliveredCount','flex:0 0 64px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(p5Txt('failedOrders'),'failedCount','flex:0 0 64px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(p5Txt('canceledOrders'),'canceledCount','flex:0 0 68px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Confirmation Rate', 'نسبة التأكيد'),'confirmationPct',`flex:0 0 ${compact?'66':'70'}px`)}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Cancel Rate', 'نسبة الإلغاء'),'cancelPct',`flex:0 0 ${compact?'66':'70'}px`)}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Pending Rate', 'نسبة قيد الانتظار'),'pendingPct',`flex:0 0 ${compact?'66':'70'}px`)}
      <div style="width:1px"></div>
      ${colHeaderBtn('NDR','ndrPct',`flex:0 0 ${compact?'64':'66'}px`)}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('DR', 'التسليم'),'drRate',`flex:0 0 ${compact?'66':'70'}px`)}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Average Profits', 'متوسط الأرباح'),'averageProfit','flex:0 0 80px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(p5Txt('adSpend'),'allocatedAdSpend','flex:0 0 80px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(p5Txt('cpa'),'cpa','flex:0 0 68px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(p5Txt('breakEven'),'breakEvenCpa','flex:0 0 76px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(p5Txt('pnl'),'profitLoss','flex:0 0 76px')}
      <div style="width:1px"></div>
      ${colHeaderBtn(s5Txt('Taager Profit After Tax', 'ربح تاجر بعد الضريبة'),'commission','flex:0 0 80px')}
      <div style="width:1px"></div>
      <div class="s5-header-actions" style="width:72px;flex:0 0 72px;text-align:center;font-size:var(--type-micro);color:rgba(255,255,255,0.3);font-weight:var(--weight-bold);position:sticky;right:0;background:var(--dash-bg, #080b12);z-index:10;border-left:1px solid var(--dash-border-soft, rgba(255,255,255,0.08));">${s5Txt('Actions', 'إجراءات')}</div>
    </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  const initialProductList = currentList();
  const initialPageProducts = pagedProducts(initialProductList);
  mountEl.innerHTML = `
    <style>
      .s5-root {
        --s5-track-width: 2200px;
        --s5-row-num-size: 13px;
        --s5-row-num-size-strong: 16px;
        --s5-name-size: 13px;
        --s5-sku-size: 10px;
      }
      #page-dashboard .dash-shell:not(.dash-size-sm):not(.dash-size-xs) .s5-metrics-track {
        min-width: var(--s5-track-width) !important;
        width: 100% !important;
      }
      #page-dashboard .dash-shell:not(.dash-size-sm):not(.dash-size-xs) .s5-product-row {
        max-width: none !important;
      }
      .s5-detail-panel {
        min-width: 0;
      }
      .s5-detail-panel > * {
        min-width: 0;
      }
      .s5-number-fit {
        display: inline-block;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        direction: ltr;
        unicode-bidi: isolate;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0 !important;
        line-height: 1.05;
      }
      .s5-cell {
        min-width: 0;
        box-sizing: border-box;
        overflow: hidden;
      }
      .s5-cell-identity { flex-basis:260px !important; min-width:260px !important; padding-inline:14px !important; }
      .s5-cell-orders,
      .s5-cell-net-orders,
      .s5-cell-first-order,
      .s5-cell-confirmed-count,
      .s5-cell-shipping,
      .s5-cell-delivered-count,
      .s5-cell-failed { flex-basis:78px !important; min-width:78px !important; }
      .s5-cell-first-order { flex-basis:96px !important; min-width:96px !important; }
      .s5-cell-pieces { flex-basis:82px !important; min-width:82px !important; }
      .s5-cell-canceled-raw { flex-basis:82px !important; min-width:82px !important; }
      .s5-cell-confirmation,
      .s5-cell-cancel,
      .s5-cell-pending,
      .s5-cell-delivery { flex-basis:88px !important; min-width:88px !important; }
      .s5-cell-ndr { flex-basis:82px !important; min-width:82px !important; }
      .s5-cell-average-profit,
      .s5-cell-ad-spend,
      .s5-cell-commission { flex-basis:104px !important; min-width:104px !important; }
      .s5-cell-cpa { flex-basis:90px !important; min-width:90px !important; }
      .s5-cell-breakeven,
      .s5-cell-pnl { flex-basis:100px !important; min-width:100px !important; }
      .s5-header-cols > .s5-header-product { flex-basis:260px !important; min-width:260px !important; }
      .s5-header-cols .s5-sort-col[data-field="totalOrderCount"],
      .s5-header-cols .s5-sort-col[data-field="netOrderCount"],
      .s5-header-cols .s5-sort-col[data-field="firstOrderCreatedAt"],
      .s5-header-cols .s5-sort-col[data-field="confirmationStatusCount"],
      .s5-header-cols .s5-sort-col[data-field="shippingCount"],
      .s5-header-cols .s5-sort-col[data-field="deliveredCount"],
      .s5-header-cols .s5-sort-col[data-field="failedCount"] { flex-basis:78px !important; min-width:78px !important; }
      .s5-header-cols .s5-sort-col[data-field="firstOrderCreatedAt"] { flex-basis:96px !important; min-width:96px !important; }
      .s5-header-cols .s5-sort-col[data-field="totalPieces"] { flex-basis:82px !important; min-width:82px !important; }
      .s5-header-cols .s5-sort-col[data-field="canceledCount"] { flex-basis:82px !important; min-width:82px !important; }
      .s5-header-cols .s5-sort-col[data-field="confirmationPct"],
      .s5-header-cols .s5-sort-col[data-field="cancelPct"],
      .s5-header-cols .s5-sort-col[data-field="pendingPct"],
      .s5-header-cols .s5-sort-col[data-field="drRate"] { flex-basis:88px !important; min-width:88px !important; }
      .s5-header-cols .s5-sort-col[data-field="ndrPct"] { flex-basis:82px !important; min-width:82px !important; }
      .s5-header-cols .s5-sort-col[data-field="averageProfit"],
      .s5-header-cols .s5-sort-col[data-field="allocatedAdSpend"],
      .s5-header-cols .s5-sort-col[data-field="commission"] { flex-basis:104px !important; min-width:104px !important; }
      .s5-header-cols .s5-sort-col[data-field="cpa"] { flex-basis:90px !important; min-width:90px !important; }
      .s5-header-cols .s5-sort-col[data-field="breakEvenCpa"],
      .s5-header-cols .s5-sort-col[data-field="profitLoss"] { flex-basis:100px !important; min-width:100px !important; }
      .s5-cell > div {
        max-width: 100%;
      }
      .s5-cell-identity button.s5-product-name-edit {
        font-size:var(--type-micro) !important;
        margin-top: 3px !important;
      }
      .s5-cell-identity div[style*="font-size:var(--type-caption)"] {
        font-size: var(--s5-sku-size) !important;
      }
      .s5-cell-actions button {
        width: 28px !important;
        height: 28px !important;
      }
      .s5-cell [data-financial-currency] {
        font-size:var(--type-micro) !important;
        margin-top: 1px !important;
      }
      .s5-cell .s5-number-fit,
      .s5-cell [data-financial-value] {
        display: block !important;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.05;
      }
      .s5-cell-confirmation,
      .s5-cell-cancel,
      .s5-cell-pending,
      .s5-cell-ndr,
      .s5-cell-delivery {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .s5-cell-confirmation .s5-rate-badge,
      .s5-cell-cancel .s5-rate-badge,
      .s5-cell-pending .s5-rate-badge,
      .s5-cell-ndr .s5-rate-badge,
      .s5-cell-delivery .s5-rate-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        max-width: 100%;
        min-width: 0;
        width: 100%;
      }
      .s5-empty-rate {
        width: 28px;
        height: 22px;
        margin-inline: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border: 1px dashed rgba(148,163,184,0.24);
        border-radius:var(--dash-radius-sm);
        background: rgba(148,163,184,0.055);
        color: rgba(203,213,225,0.5);
        font-size:var(--type-body);
        font-weight:var(--weight-bold);
        line-height: 1;
        cursor: help;
      }
      .s5-empty-rate:hover {
        border-color: rgba(148,163,184,0.42);
        background: rgba(148,163,184,0.1);
        color: rgba(226,232,240,0.75);
      }
      .s5-product-title {
        font-size: var(--s5-name-size) !important;
        max-width: 100%;
      }

      .s5-product-row { outline: none !important; -webkit-tap-highlight-color: transparent; }
      .s5-product-row:focus, .s5-product-row:active { outline: none !important; }
      .s5-product-row:hover {
        border-color: rgba(255,255,255,0.16) !important;
      }

      .s5-expand-btn:hover { background: rgba(255,255,255,0.07) !important; }
      .s5-expand-btn:hover .s5-expand-icon-wrap {
        background: rgba(255,255,255,0.1) !important;
        border-color: rgba(255,255,255,0.28) !important;
      }

      .s5-page-btn:hover:not([disabled]) {
        background: rgba(255,255,255,0.09) !important;
        border-color: rgba(255,255,255,0.25) !important;
        color: #fff !important;
      }
      #s5-prev-page:hover:not([disabled]),
      #s5-next-page:hover:not([disabled]) {
        background: rgba(255,255,255,0.09) !important;
        border-color: rgba(255,255,255,0.25) !important;
        color: #fff !important;
      }
      .s5-qty-city-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }
      .s5-detail-panel .s5-qty-city-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)) !important;
      }
      .s5-modal-analysis-wide {
        grid-column: 1 / -1 !important;
      }
      .s5-qty-city-grid.s5-modal-qty-city-grid {
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)) !important;
      }
      .s5-quick-analysis-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
      @media (max-width: 1180px) {
        .s5-qty-city-grid, .s5-quick-analysis-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .s5-detail-panel .s5-qty-city-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .s5-qty-city-grid.s5-modal-qty-city-grid { grid-template-columns: 1fr !important; }
      }
      @media (max-width: 760px) {
        .s5-qty-city-grid, .s5-quick-analysis-grid { grid-template-columns: 1fr !important; }
        .s5-detail-panel .s5-qty-city-grid { grid-template-columns: 1fr !important; }
        .s5-modal-analysis-grid { grid-template-columns: 1fr !important; padding: 16px !important; }
      }

      #s5-search:focus {
        border-color: rgba(245,158,11,0.5) !important;
        background: rgba(245,158,11,0.04) !important;
      }
      #s5-search-clear {
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        max-width: 28px !important;
        min-height: 28px !important;
        aspect-ratio: 1 / 1 !important;
        border-radius:var(--radius-pill) !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        flex: 0 0 28px !important;
        font-size: 0 !important;
      }
      #s5-search-clear svg { display: none !important; }
      #s5-search-clear::before,
      #s5-search-clear::after {
        content: "";
        position: absolute;
        width: 11px;
        height: 2px;
        border-radius:var(--radius-pill);
        background: currentColor;
        left: 50%;
        top: 50%;
      }
      #s5-search-clear::before { transform: translate(-50%, -50%) rotate(45deg); }
      #s5-search-clear::after { transform: translate(-50%, -50%) rotate(-45deg); }

      .s5-pill:hover { border-color: rgba(255,255,255,0.24) !important; }

      /* ── Custom dropdown - FIX 2: z-index 99999 ── */
      .s5-sort-dropdown { position: relative; user-select: none; }
      .s5-sort-trigger {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; border-radius:var(--dash-radius-md);
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: #fff; font-size:var(--type-label); font-weight:var(--weight-semibold);
        cursor: pointer; white-space: nowrap;
        font-family:var(--font-ui);
        min-width: 148px; justify-content: space-between;
      }
      .s5-sort-trigger:hover {
        background: rgba(255,255,255,0.09);
        border-color: rgba(255,255,255,0.22);
      }
      .s5-sort-trigger.open {
        background: rgba(245,158,11,0.1);
        border-color: rgba(245,158,11,0.45);
        color: #f59e0b;
      }
      .s5-sort-trigger.open .s5-sort-chevron { color: #f59e0b; }
      .s5-sort-chevron { color:var(--dash-text-faint); flex-shrink: 0; }

      /* ── Sort col header ── */
      .s5-sort-col:hover { color: rgba(255,255,255,0.7) !important; }

      [data-theme="light"] #page-dashboard .s5-sort-trigger {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        color: #334155 !important;
      }
      [data-theme="light"] #page-dashboard .s5-sort-trigger:hover {
        background: #f8fafc !important;
        border-color: #f59e0b !important;
      }
      [data-theme="light"] #page-dashboard .s5-sort-trigger.open {
        background: #fff7ed !important;
        border-color: #f59e0b !important;
        color: #c2410c !important;
      }
      [data-theme="light"] #page-dashboard .s5-sort-chevron {
        color: #64748b !important;
      }
      [data-theme="light"] #s5-body-sort-menu {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        box-shadow: 0 16px 32px rgba(15,23,42,0.14) !important;
      }
      [data-theme="light"] #s5-body-sort-menu .s5-sort-menu-title {
        border-bottom-color: #e2e8f0 !important;
        color: #64748b !important;
      }
      [data-theme="light"] #s5-body-sort-menu .s5-sort-option {
        border-bottom-color: #e2e8f0 !important;
        background: #ffffff !important;
        color: #334155 !important;
      }
      [data-theme="light"] #s5-body-sort-menu .s5-sort-option:hover {
        background: #f8fafc !important;
      }
      [data-theme="light"] #s5-body-sort-menu .s5-sort-option.active {
        background: #fff7ed !important;
        color: #c2410c !important;
      }

      /* ── Rate badge bar fill ── */
      .s5-rate-bar { transition: none !important; }

      .s5-stat-value {
        max-width: 100%;
      }

      .s5-compare-grid {
        display:grid;
        grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);
        gap:14px;
        align-items:stretch;
      }
      .s5-compare-card {
        border:1px solid rgba(255,255,255,0.09);
        border-radius:var(--dash-radius-xl);
        background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018));
        padding:14px;
        min-width:0;
      }
      .s5-compare-metric {
        padding:9px 10px;
        border-radius:var(--dash-radius-md);
        border:1px solid rgba(255,255,255,0.065);
        background:rgba(255,255,255,0.025);
      }
      .s5-compare-metric.is-winner {
        border-color:var(--cmp-win-border, rgba(0,230,118,0.45)) !important;
        background:var(--cmp-win-bg, rgba(0,230,118,0.08)) !important;
      }
      .s5-compare-metric.is-loser {
        border-color:rgba(245,158,11,0.3) !important;
        background:rgba(245,158,11,0.04) !important;
        opacity:0.84;
      }
      .s5-compare-metric.is-danger {
        border-color:rgba(239,68,68,0.55) !important;
        background:rgba(239,68,68,0.07) !important;
        opacity:1 !important;
      }
      .s5-cmp-dd-list::-webkit-scrollbar {
        width:12px;
      }
      .s5-cmp-dd-list::-webkit-scrollbar-thumb {
        background:rgba(245,158,11,0.35);
        border-radius:var(--radius-pill);
      }
      [data-theme="light"] #s5-compare-modal .s5-compare-modal-panel {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        color: #334155 !important;
      }
      [data-theme="light"] #s5-compare-modal .s5-cmp-dd-trigger {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        color: #334155 !important;
      }
      [data-theme="light"] #s5-compare-modal .s5-cmp-dd-panel {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        box-shadow: 0 18px 36px rgba(15,23,42,0.14) !important;
      }
      [data-theme="light"] #s5-compare-modal .s5-cmp-dd-panel input {
        background: #f8fafc !important;
        border-color: #cbd5e1 !important;
        color: #334155 !important;
      }
      [data-theme="light"] #s5-compare-modal .s5-cmp-dd-option {
        color: #334155 !important;
      }
      [data-theme="light"] #s5-compare-modal .s5-cmp-dd-option:hover {
        background: #f8fafc !important;
      }
      [data-theme="light"] #s5-compare-modal .s5-product-data-text {
        color: #334155 !important;
      }
      @media (max-width: 820px) {
        .s5-compare-grid { grid-template-columns:1fr !important; }
        .s5-compare-divider { min-height:34px !important; flex-direction:row !important; }
        .s5-compare-divider-line { width:100% !important; height:1px !important; }
      }
      @media (max-width: 1366px) {
        #page-dashboard .dash-shell:not(.dash-size-sm):not(.dash-size-xs) .s5-metrics-track {
          min-width: var(--s5-track-width) !important;
        }
        .s5-root {
          --s5-track-width: 2100px;
          --s5-row-num-size: 12px;
          --s5-row-num-size-strong: 14px;
          --s5-name-size: 12px;
          --s5-sku-size: 9px;
        }
        .s5-topbar {
          height: 60px !important;
          padding-inline: 18px !important;
        }
        .s5-status-chip {
          padding: 6px 10px !important;
          font-size:var(--type-caption) !important;
        }
        .s5-stat-row {
          gap: 9px !important;
          margin-bottom: 14px !important;
        }
        .s5-stat-card {
          padding: 11px 12px !important;
          gap: 10px !important;
          border-radius:var(--dash-radius-md) !important;
        }
        .s5-stat-icon {
          width: 38px !important;
          height: 38px !important;
          border-radius:var(--dash-radius-md) !important;
        }
        .s5-stat-value {
          font-size:var(--type-metric-sm) !important;
        }
        .s5-stat-label,
        .s5-stat-unit {
          font-size:var(--type-micro) !important;
        }
        .s5-product-row {
          border-radius:var(--dash-radius-md) !important;
          margin-bottom: 6px !important;
        }
        .s5-cell {
          padding-inline: 3px !important;
        }
        .s5-cell-identity {
          flex-basis: 260px !important;
          min-width: 260px !important;
          padding: 8px 14px !important;
          gap: 7px !important;
        }
        .s5-cell-identity button.s5-product-name-edit {
          font-size:var(--type-micro) !important;
          margin-top: 2px !important;
        }
        .s5-cell-identity div[style*="font-size:var(--type-caption)"] {
          font-size: var(--s5-sku-size) !important;
        }
        .s5-cell-orders,
        .s5-cell-net-orders,
        .s5-cell-confirmed-count,
        .s5-cell-shipping,
        .s5-cell-delivered-count { flex-basis: 78px !important; min-width: 78px !important; }
        .s5-cell-pieces { flex-basis: 82px !important; min-width: 82px !important; }
        .s5-cell-failed { flex-basis: 78px !important; min-width: 78px !important; }
        .s5-cell-canceled-raw { flex-basis: 82px !important; min-width: 82px !important; }
        .s5-cell-confirmation,
        .s5-cell-cancel,
        .s5-cell-pending,
        .s5-cell-delivery { flex-basis: 88px !important; min-width: 88px !important; }
        .s5-cell-ndr { flex-basis: 82px !important; min-width: 82px !important; }
        .s5-cell-average-profit { flex-basis: 104px !important; min-width: 104px !important; }
        .s5-cell-ad-spend { flex-basis: 104px !important; min-width: 104px !important; }
        .s5-cell-cpa { flex-basis: 90px !important; min-width: 90px !important; }
        .s5-cell-breakeven { flex-basis: 100px !important; min-width: 100px !important; }
        .s5-cell-pnl { flex-basis: 100px !important; min-width: 100px !important; }
        .s5-cell-commission { flex-basis: 104px !important; min-width: 104px !important; }
        .s5-cell-actions {
          width: 72px !important;
          min-width: 72px !important;
          grid-template-columns: repeat(2, 28px) !important;
          grid-auto-rows: 28px !important;
          gap: 6px !important;
          padding: 5px !important;
        }
        .s5-cell-actions button {
          width: 28px !important;
          height: 28px !important;
        }
        .s5-cell .s5-number-fit {
          font-size: var(--s5-row-num-size) !important;
        }
        .s5-cell-orders .s5-number-fit,
        .s5-cell-delivered-count .s5-number-fit,
        .s5-cell-commission .s5-number-fit {
          font-size: var(--s5-row-num-size-strong) !important;
        }
        .s5-header-cols > div:first-child {
          flex-basis: 260px !important;
          min-width: 260px !important;
          padding-inline-start: 14px !important;
          padding-right: 0 !important;
          font-size:var(--type-micro) !important;
          text-align: start !important;
        }
        .s5-header-cols .s5-sort-col {
          font-size:var(--type-micro) !important;
          gap: 3px !important;
        }
        .s5-header-cols .s5-sort-col[data-field="totalOrderCount"],
        .s5-header-cols .s5-sort-col[data-field="netOrderCount"],
        .s5-header-cols .s5-sort-col[data-field="confirmationStatusCount"],
        .s5-header-cols .s5-sort-col[data-field="shippingCount"],
        .s5-header-cols .s5-sort-col[data-field="deliveredCount"] { flex-basis: 78px !important; min-width: 78px !important; }
        .s5-header-cols .s5-sort-col[data-field="totalPieces"] { flex-basis: 82px !important; min-width: 82px !important; }
        .s5-header-cols .s5-sort-col[data-field="failedCount"] { flex-basis: 78px !important; min-width: 78px !important; }
        .s5-header-cols .s5-sort-col[data-field="canceledCount"] { flex-basis: 82px !important; min-width: 82px !important; }
        .s5-header-cols .s5-sort-col[data-field="confirmationPct"],
        .s5-header-cols .s5-sort-col[data-field="cancelPct"],
        .s5-header-cols .s5-sort-col[data-field="pendingPct"],
        .s5-header-cols .s5-sort-col[data-field="drRate"] { flex-basis: 88px !important; min-width: 88px !important; }
        .s5-header-cols .s5-sort-col[data-field="ndrPct"] { flex-basis: 82px !important; min-width: 82px !important; }
        .s5-header-cols .s5-sort-col[data-field="averageProfit"] { flex-basis: 104px !important; min-width: 104px !important; }
        .s5-header-cols .s5-sort-col[data-field="allocatedAdSpend"] { flex-basis: 104px !important; min-width: 104px !important; }
        .s5-header-cols .s5-sort-col[data-field="cpa"] { flex-basis: 90px !important; min-width: 90px !important; }
        .s5-header-cols .s5-sort-col[data-field="breakEvenCpa"] { flex-basis: 100px !important; min-width: 100px !important; }
        .s5-header-cols .s5-sort-col[data-field="profitLoss"] { flex-basis: 100px !important; min-width: 100px !important; }
        .s5-header-cols .s5-sort-col[data-field="commission"] { flex-basis: 104px !important; min-width: 104px !important; }
        .s5-header-cols > div:last-child {
          width: 72px !important;
          min-width: 72px !important;
          flex: 0 0 72px !important;
          font-size:var(--type-micro) !important;
        }
      }
      @media (max-width: 1180px) {
        .s5-topbar {
          gap: 10px !important;
        }
        .s5-status-chip {
          max-width: 150px;
        }
        .s5-status-chip span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .s5-stat-row {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .s5-stat-card {
          min-width: 0;
        }
      }
      @keyframes s5spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    </style>
    <div class="s5-root dash-scroll" dir="${isAr ? 'rtl' : 'ltr'}" style="flex:1 1 auto;display:flex;flex-direction:column;background:var(--dash-bg);color:#fff;font-family:var(--font-ui);overflow-y:auto;overflow-x:hidden;height:100%;min-height:0">

      <!-- Sticky topbar -->
      <div class="s5-topbar" style="display:flex;align-items:center;justify-content:space-between;padding:0 28px;height:68px;border-bottom:1px solid rgba(255,255,255,0.05);background:var(--dash-bg);position:sticky;top:0;z-index:10;flex-shrink:0">
        <div style="display:flex;gap:10px;align-items:center">
          <span class="s5-status-chip" aria-label="${s5Txt('Dashboard period', 'فترة لوحة التحكم')}" style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);font-size:var(--type-label);font-weight:var(--weight-semibold);font-family:inherit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="3" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/><path d="M8 2v4M16 2v4M3 10h18" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span style="color:#f59e0b">${(function(){ var M=['January','February','March','April','May','June','July','August','September','October','November','December']; var M_ar=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']; var n=new Date(); return (isAr ? M_ar[n.getMonth()] : M[n.getMonth()])+' '+n.getFullYear(); })()}</span>
          </span>
          <span class="s5-status-chip" aria-label="${s5Txt('Dashboard account', 'حساب لوحة التحكم')}" style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);font-size:var(--type-label);font-weight:var(--weight-semibold);font-family:inherit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span>${window.currentActiveAccountLabel || s5Txt('All Shared Accounts', 'كل الحسابات المشتركة')}</span>
          </span>
        </div>
        <div style="text-align:center;flex:1">
          <div style="font-size:var(--type-metric-sm);font-weight:var(--weight-bold);color:#fff;display:flex;align-items:center;justify-content:center;gap:8px">
            ${s5Txt('Top Products', 'أفضل المنتجات')}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6z" fill="#f59e0b"/></svg>
          </div>
          <div style="font-size:var(--type-caption);color:rgba(255,255,255,0.35);margin-top:3px">${s5Txt('Product Health Board', 'لوحة صحة المنتجات')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button id="s5-view-toggle" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--dash-radius-sm);border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.55);font-size:var(--type-caption);font-weight:var(--weight-bold);cursor:pointer;font-family:inherit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            ${s5Txt('Compact', 'مضغوط')}
          </button>
          <div style="font-size:var(--type-caption);color:rgba(255,255,255,0.35)">${s5Txt('Last update: Today', 'آخر تحديث: اليوم')}</div>
          <div style="font-size:var(--type-control);font-weight:var(--weight-bold);color:rgba(255,255,255,0.7)">${(function(){ var n=new Date(); return ('0'+n.getHours()).slice(-2)+':'+('0'+n.getMinutes()).slice(-2); })()}</div>
        </div>
      </div>

      <!-- Non-scrolling block -->
      <div style="padding:22px 28px 0;flex-shrink:0">
        <div class="s5-stat-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px;align-items:stretch">
          ${STAT_CARDS.map((c, i) => statCardHTML(c, i)).join('')}
        </div>
        ${filterBarHTML(initialProductList)}
      </div>

      <!-- Scroll wrapper -->
      <div id="s5-scroll-wrapper" style="flex:0 0 auto;overflow-x:auto;overflow-y:visible;min-height:0;width:100%">
        <div style="padding:0 28px 22px;min-width:100%;box-sizing:border-box">
          ${columnHeadersHTML()}
          <div id="s5-rows">
            ${initialPageProducts.length ? initialPageProducts.map((p, i) => productRowHTML(p, i)).join('') : `
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:var(--dash-radius-lg);margin-bottom:12px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" style="margin-bottom:16px;">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <div style="font-size:var(--type-subtitle);font-weight:var(--weight-bold);color:var(--dash-text-muted);margin-bottom:8px;">${s5Txt('No products available yet', 'لا توجد منتجات متاحة بعد')}</div>
                <div style="font-size:var(--type-label);color:rgba(255,255,255,0.3);">${s5Txt('Update the dashboard to load real product performance for this account and range.', 'حدّث لوحة التحكم لتحميل أداء المنتجات الحقيقي لهذا الحساب وهذه الفترة.')}</div>
              </div>`}
          </div>
          <div id="s5-pagination-wrap">${paginationHTML(initialProductList)}</div>

          ${INSIGHTS.length ? `
          <div>
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:14px">
              <span style="font-size:var(--type-component-title);font-weight:var(--weight-bold);color:rgba(255,255,255,0.82)">رؤى ذكية</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6z" fill="#f59e0b"/></svg>
            </div>
            <div class="s5-insights-row" style="display:flex;gap:12px;flex-wrap:wrap">
              ${INSIGHTS.map((ins, i) => insightCardHTML(ins, i)).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>`;

  // ── Sort arrows sync ──────────────────────────────────────────────────────
  function syncProductDetailWidth() {
    var wrapper = mountEl.querySelector('#s5-scroll-wrapper');
    var root = mountEl.querySelector('.s5-root') || mountEl;
    var available = (wrapper && wrapper.clientWidth) || mountEl.clientWidth || window.innerWidth || 0;
    var width = Math.max(320, available - 56);
    root.style.setProperty('--s5-detail-width', width + 'px');
  }

  function alignDetailPanelToViewport(panel) {
    if (!panel) return;
    var wrapper = mountEl.querySelector('#s5-scroll-wrapper');
    var scrollLeft = wrapper ? Number(wrapper.scrollLeft || 0) : 0;
    panel.style.marginInlineStart = Math.max(0, scrollLeft) + 'px';
  }

  syncProductDetailWidth();
  var s5ResizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    var resizeTarget = mountEl.querySelector('#s5-scroll-wrapper') || mountEl;
    s5ResizeObserver = new ResizeObserver(syncProductDetailWidth);
    s5ResizeObserver.observe(resizeTarget);
  } else {
    window.addEventListener('resize', syncProductDetailWidth);
  }
  addProductCleanup(function () {
    if (s5ResizeObserver) s5ResizeObserver.disconnect();
    else window.removeEventListener('resize', syncProductDetailWidth);
  });

  function updateSortArrows() {
    mountEl.querySelectorAll('.s5-sort-arrow').forEach(arrow => {
      if (arrow.dataset.field === sortState.field) {
        arrow.textContent = sortState.dir === 'desc' ? '↓' : '↑';
        arrow.style.color = '#f59e0b';
      } else {
        arrow.textContent = '↕';
        arrow.style.color = 'rgba(255,255,255,0.2)';
      }
    });
  }

  // ── FIX 3: renderProductPage re-renders filter bar + pills ────────────────
  let pageRenderToken = 0;
  let _scheduleRenderTimer = null;
  function scheduleProductPageRender(options) {
    if (_scheduleRenderTimer) clearTimeout(_scheduleRenderTimer);
    _scheduleRenderTimer = setTimeout(function () {
      _scheduleRenderTimer = null;
      if (!mountEl.isConnected || mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      renderProductPage(options || { keepFilterBar: true });
    }, 0);
  }

  function productSortRenderOptions() {
    return {
      keepFilterBar: true,
      interactionStartedAt: typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : null
    };
  }

  function renderProductPage(options) {
    options = options || {};
    if (backendProductsEnabled && !options.backendReady) {
      const params = backendProductParams();
      const key = backendProductQueryKey(params);
      const isCached = backendProductsActive && backendProductsQueryKey === key;
      if (isCached) {
        options.backendReady = true;
      } else {
        // Reflect the interaction immediately while the backend returns the
        // newly sorted page. This mirrors Section 9's instant table controls.
        const filterBarEl = mountEl.querySelector('#s5-filter-bar');
        if (filterBarEl) {
          const list = currentList();
          if (options.keepFilterBar) {
            _refreshFilterBarInPlace(list);
          } else {
            filterBarEl.outerHTML = filterBarHTML(list);
            bindFilterBar();
          }
        }
        updateSortArrows();

        requestBackendProductPage(false).then(function (ok) {
          if (ok && mountEl.isConnected && !mountEl.hidden && mountEl._s5RenderToken === renderToken) {
            renderProductPage(Object.assign({}, options, { backendReady: true }));
          }
        });

        const rowsEl = mountEl.querySelector('#s5-rows');
        if (rowsEl) {
          rowsEl.style.opacity = '0.5';
        }
        return;
      }
    }
    const token = ++pageRenderToken;
    const list = currentList();
    const pageCount = totalProductPages(list);
    if (currentPage > pageCount) currentPage = pageCount;
    if (currentPage < 1) currentPage = 1;
    const visibleProducts = pagedProducts(list);

    // Re-render filter bar so pills and dropdown show correct active state
    const filterBarEl = mountEl.querySelector('#s5-filter-bar');
    if (filterBarEl && !options.keepFilterBar) {
      // Clean up any previous sort-menu document listener before blowing away the DOM
      if (_sortMenuCleanup) { _sortMenuCleanup(); _sortMenuCleanup = null; }
      filterBarEl.outerHTML = filterBarHTML(list);
      bindFilterBar();
    } else if (options.keepFilterBar) {
      // Patch pills and sort controls in-place without rebuilding the filter bar
      _refreshFilterBarInPlace(list);
    }

    const rowsEl  = mountEl.querySelector('#s5-rows');
    const pagerEl = mountEl.querySelector('#s5-pagination-wrap');
    if (!mountEl.isConnected || mountEl._s5RenderToken !== renderToken || token !== pageRenderToken) return;
    if (rowsEl) {
      rowsEl.style.opacity = '1';
      if (visibleProducts.length === 0) {
        rowsEl.innerHTML = noProductsMatchHTML();
      } else {
        rowsEl.innerHTML = visibleProducts.map((p, i) => productRowHTML(p, i)).join('');
      }
    }
    if (pagerEl) {
      pagerEl.innerHTML = paginationHTML(list);
      pagerEl.style.opacity = '1';
    }

    updateSortArrows();
    _bindProductRowClicks();
    if (_s5SelectedProductKey) _selectS5Row(_s5SelectedProductKey);
    if (options.interactionStartedAt != null && typeof performance !== 'undefined' && performance.now) {
      mountEl._s5LastSortDurationMs = performance.now() - options.interactionStartedAt;
    }

    // ── Eager prefetch: load backend details for all visible products now ─────
    // So when a user clicks any row, loadBackendProductDetails returns from
    // cache (Promise.resolve) instead of firing a real query.
    cancelBackendDetailPrefetch();
    if (window.DashboardQueryRuntime && typeof window.DashboardQueryRuntime.query === 'function') {
      var _prefetchKeys = visibleProducts
        .filter(function (p) { return p && p.key && !backendProductDetailsCache.has(p.key); })
        .map(function (p) { return p.key; });
      if (_prefetchKeys.length) {
        var _doPrefetch = function () {
          backendDetailPrefetchIdle = null;
          if (mountEl.isConnected && !mountEl.hidden && mountEl._s5RenderToken === renderToken) {
            loadBackendProductDetails(_prefetchKeys);
          }
        };
        // A fresh sort/page interaction should win over speculative detail
        // work. Wait briefly, then use idle time; a subsequent render cancels
        // this task before it can compete with the visible table update.
        backendDetailPrefetchTimer = setTimeout(function () {
          backendDetailPrefetchTimer = null;
          if (typeof requestIdleCallback === 'function') {
            backendDetailPrefetchIdle = requestIdleCallback(_doPrefetch, { timeout: 1000 });
          } else {
            _doPrefetch();
          }
        }, 250);
      }
    }
  }

  function noProductsMatchHTML() {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:var(--dash-radius-lg);margin-bottom:12px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" style="margin-bottom:16px;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <div style="font-size:var(--type-subtitle);font-weight:var(--weight-bold);color:var(--dash-text-muted);margin-bottom:8px;">${s5Txt('No products match the filter', 'لا توجد منتجات تطابق الفلتر')}</div>
        <div style="font-size:var(--type-label);color:rgba(255,255,255,0.3);">${s5Txt('Try changing the filters or search to show results.', 'جرب تغيير خيارات التصفية أو البحث لعرض النتائج.')}</div>
      </div>`;
  }

  function applyImmediateProductSearchFeedback(query, startedAt) {
    var rowsEl = mountEl.querySelector('#s5-rows');
    if (!rowsEl) return;
    var q = s5SearchKey(query);
    if (!q) return;
    var source = backendProductsActive && backendProductsRows.length ? backendProductsRows : PRODUCTS_RAW;
    var hasVisibleMatch = source.some(function (product) {
      return productSearchKey(product).indexOf(q) !== -1;
    });
    if (hasVisibleMatch) return;
    rowsEl.innerHTML = noProductsMatchHTML();
    var pagerEl = mountEl.querySelector('#s5-pagination-wrap');
    if (pagerEl) pagerEl.innerHTML = '';
    mountEl._s5LastSearchDurationMs = performance && performance.now
      ? performance.now() - startedAt
      : 0;
  }

  function syncSearchClearButton() {
    const clearBtn = mountEl.querySelector('#s5-search-clear');
    if (!clearBtn) return;
    const active = !!filterState.search;
    clearBtn.style.opacity = active ? '1' : '0';
    clearBtn.style.pointerEvents = active ? 'auto' : 'none';
  }

  function ensureSearchClearButton(searchEl) {
    if (!searchEl || mountEl.querySelector('#s5-search-clear')) return;
    const clearBtn = document.createElement('button');
    clearBtn.id = 's5-search-clear';
    clearBtn.type = 'button';
    clearBtn.setAttribute('aria-label', s5Txt('Clear search', 'مسح البحث'));
    clearBtn.style.cssText = [
      'position:absolute',
      'left:12px',
      'top:50%',
      'transform:translateY(-50%)',
      'width:28px',
      'height:28px',
      'min-width:28px',
      'max-width:28px',
      'aspect-ratio:1/1',
      'border-radius:var(--radius-pill)',
      'border:none',
      'cursor:pointer',
      'box-sizing:border-box',
      'background:rgba(255,255,255,0.12)',
      'color:var(--dash-text-muted)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'line-height:1',
      'padding:0',
      'font-family:inherit'
    ].join(';');
    clearBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
    searchEl.parentNode.appendChild(clearBtn);
  }

  function bindProductCurrencySelect() {
    var wrap = mountEl.querySelector('#s5-currency-select');
    if (!wrap) return;
    var currencies = supportedProductCurrencies();
    var current = selectedCurrency();
    var options = currencies.map(function (currency) {
      return { value: currency, label: currency };
    });

    if (window.renderCustomSelect) {
      window.renderCustomSelect(wrap, options, current, function (value) {
        setProductCurrency(value);
      }, { maxHeight: '220px', ariaLabel: s5Txt('Products calculator currency', 'عملة حاسبة المنتجات') });
      return;
    }

    wrap.innerHTML = '<select id="s5-currency-native" style="width:100%;height:32px;border-radius:var(--dash-radius-sm);border:1px solid rgba(255,255,255,0.12);background:var(--dash-surface);color:#fff;font-size:var(--type-label);font-weight:var(--weight-bold);font-family:inherit;padding:0 8px">' +
      options.map(function (opt) {
        return '<option value="' + attr(opt.value) + '"' + (opt.value === current ? ' selected' : '') + '>' + esc(opt.label) + '</option>';
      }).join('') +
      '</select>';
    var nativeSel = wrap.querySelector('#s5-currency-native');
    if (nativeSel) {
      nativeSel.addEventListener('change', function (e) {
        e.stopPropagation();
        setProductCurrency(this.value);
      });
    }
  }

  // ── In-place filter bar refresh (used when keepFilterBar:true) ─────────────
  function _refreshFilterBarInPlace(list) {
    // Patch pill active states
    const pillsEl = mountEl.querySelector('#s5-status-pills');
    if (pillsEl) {
      pillsEl.querySelectorAll('.s5-pill').forEach(function (btn) {
        const key = btn.dataset.key || 'all';
        const pill = STATUS_PILLS.find(function (p) { return p.key === key; });
        const isActive = filterState.statusKey === key;
        const isAll = key === 'all';
        if (isAll) {
          btn.style.fontWeight = isActive ? '800' : '600';
          btn.style.border = '1px solid ' + (isActive ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)');
          btn.style.background = isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
          btn.style.color = isActive ? '#fff' : 'rgba(255,255,255,0.5)';
          // update count badge
          var badge = btn.querySelector('span');
          if (isActive) {
            var count = backendProductsActive ? backendProductsTotal : (list ? list.length : 0);
            if (!badge) {
              badge = document.createElement('span');
              badge.style.cssText = 'background:#f59e0b;color:#000;font-size:var(--type-micro);font-weight:var(--weight-bold);padding:1px 6px;border-radius:var(--radius-pill);line-height:1.5';
              btn.appendChild(badge);
            }
            badge.textContent = count;
          } else if (badge) {
            badge.remove();
          }
        } else if (pill) {
          var dot = btn.querySelector('span');
          btn.style.fontWeight = isActive ? '800' : '600';
          btn.style.border = '1px solid ' + (isActive ? pill.color + '60' : 'rgba(255,255,255,0.08)');
          btn.style.background = isActive ? pill.color + '18' : 'rgba(255,255,255,0.03)';
          btn.style.color = isActive ? pill.color : 'rgba(255,255,255,0.45)';
          if (dot) dot.style.background = isActive ? pill.color : 'rgba(255,255,255,0.2)';
        }
      });
    }
    // Patch sort label
    var sortLabel = mountEl.querySelector('#s5-sort-label');
    if (sortLabel) sortLabel.textContent = activeSortLabel();
    // Patch sort menu active states
    var existingMenu = document.getElementById('s5-body-sort-menu');
    if (existingMenu && mountEl._s5SortMenu === existingMenu) {
      existingMenu.querySelectorAll('.s5-sort-option').forEach(function (btn) {
        var isActive = sortState.field === btn.dataset.value;
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? 'rgba(245,158,11,0.12)' : 'transparent';
        btn.style.color = isActive ? '#f59e0b' : 'rgba(255,255,255,0.65)';
      });
    }
    syncSearchClearButton();
  }

  function refreshProductControls() {
    const searchEl = mountEl.querySelector('#s5-search');
    if (searchEl) ensureSearchClearButton(searchEl);
    syncSearchClearButton();
    bindProductCurrencySelect();

    // Reuse the existing sort menu instead of destroying and recreating it every time.
    // Only rebuild from scratch on first call or if it has been removed from DOM.
    var existingMenu = document.getElementById('s5-body-sort-menu');
    if (existingMenu && mountEl._s5SortMenu === existingMenu) {
      // Refresh active state + sort label
      existingMenu.querySelectorAll('.s5-sort-option').forEach(function (btn) {
        var isActive = sortState.field === btn.dataset.value;
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? 'rgba(245,158,11,0.12)' : 'transparent';
        btn.style.color = isActive ? '#f59e0b' : 'rgba(255,255,255,0.65)';
      });
      var sortLabel = mountEl.querySelector('#s5-sort-label');
      if (sortLabel) sortLabel.textContent = activeSortLabel();
      return; // Skip the expensive rebuild
    }

    if (_sortMenuCleanup) { _sortMenuCleanup(); _sortMenuCleanup = null; }
    const staleMenu = document.getElementById('s5-body-sort-menu');
    if (staleMenu) staleMenu.remove();

    const bodyMenu = document.createElement('div');
    bodyMenu.id = 's5-body-sort-menu';
    bodyMenu.className = 's5-body-sort-menu dash-overlay-scope';
    bodyMenu.innerHTML =
      '<div class="s5-sort-menu-title" style="padding:10px 14px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:var(--type-micro);font-weight:var(--weight-bold);color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.6px;direction:' + (isAr ? 'rtl' : 'ltr') + '">' +
        s5Txt('Sort By', 'ترتيب حسب') +
      '</div>' +
      SORT_OPTIONS.map(function (opt) {
        const active = sortState.field === opt.value;
        return '<button type="button" class="s5-sort-option' + (active ? ' active' : '') + '" data-value="' + attr(opt.value) + '" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;border:0;border-bottom:1px solid rgba(255,255,255,0.04);background:' + (active ? 'rgba(245,158,11,0.12)' : 'transparent') + ';color:' + (active ? '#f59e0b' : 'rgba(255,255,255,0.65)') + ';font-family:var(--font-ui);font-size:var(--type-label);font-weight:var(--weight-semibold);line-height:var(--leading-control);cursor:pointer;text-align:start;direction:' + (isAr ? 'rtl' : 'ltr') + '">' +
          '<span style="font-size:var(--type-body);line-height:1">' + opt.icon + '</span><span>' + opt.label + '</span>' +
        '</button>';
      }).join('');
    bodyMenu.style.cssText = 'position:fixed;display:none;background:#0f1523;border:1px solid rgba(255,255,255,0.14);border-radius:var(--dash-radius-md);overflow-y:auto;overflow-x:hidden;z-index:2147483647;min-width:180px;max-height:min(520px,calc(100vh - 96px));direction:' + (isAr ? 'rtl' : 'ltr');
    document.body.appendChild(bodyMenu);
    bodyMenu.addEventListener('click', function (event) {
      const option = event.target.closest('.s5-sort-option');
      if (!option) return;
      sortState.field = option.dataset.value || 'default';
      sortState.dir = sortState.field === 'default' ? 'asc' : 'desc';
      currentPage = 1;
      closeProductSortMenu();
      renderProductPage(productSortRenderOptions());
      updateSortArrows();
    });

    function outsideClick(event) {
      const trigger = mountEl.querySelector('#s5-sort-trigger');
      const target = event && event.target && typeof event.target.nodeType === 'number' ? event.target : null;
      if (target && (bodyMenu.contains(target) || (trigger && trigger.contains(target)))) return;
      closeProductSortMenu();
    }
    function outsideScroll(event) {
      const target = event && event.target && typeof event.target.nodeType === 'number' ? event.target : null;
      if (target && bodyMenu.contains(target)) return;
      if (_dropdownOpen) closeProductSortMenu();
    }
    document.addEventListener('click', outsideClick);
    document.addEventListener('scroll', outsideScroll, true);
    window.addEventListener('resize', outsideScroll);
    _sortMenuCleanup = function () {
      document.removeEventListener('click', outsideClick);
      document.removeEventListener('scroll', outsideScroll, true);
      window.removeEventListener('resize', outsideScroll);
      if (bodyMenu.parentNode) bodyMenu.remove();
      mountEl._s5SortMenu = null;
      _dropdownOpen = false;
    };
    mountEl._s5SortMenu = bodyMenu;
  }

  function openProductSortMenu() {
    const trigger = mountEl.querySelector('#s5-sort-trigger');
    const bodyMenu = mountEl._s5SortMenu;
    if (!trigger || !bodyMenu) return;
    const rect = trigger.getBoundingClientRect();
    bodyMenu.style.display = 'block';
    const menuWidth = bodyMenu.offsetWidth || 180;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
    const spaceBelow = Math.max(80, viewportHeight - rect.bottom - 14);
    const spaceAbove = Math.max(80, rect.top - 14);
    const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(140, Math.min(520, openAbove ? spaceAbove : spaceBelow));
    bodyMenu.style.maxHeight = availableHeight + 'px';
    bodyMenu.style.top = (openAbove ? Math.max(8, rect.top - availableHeight - 6) : rect.bottom + 6) + 'px';
    bodyMenu.style.left = Math.max(8, Math.min(rect.right - menuWidth, (window.innerWidth || document.documentElement.clientWidth || 1280) - menuWidth - 8)) + 'px';
    trigger.classList.add('open');
    _dropdownOpen = true;
  }

  function closeProductSortMenu() {
    const trigger = mountEl.querySelector('#s5-sort-trigger');
    const bodyMenu = mountEl._s5SortMenu;
    if (bodyMenu) bodyMenu.style.display = 'none';
    if (trigger) trigger.classList.remove('open');
    _dropdownOpen = false;
  }

  function bindFilterBar() {
    // bindFilterBar is kept for legacy compatibility but the sort menu
    // is now managed entirely by refreshProductControls.
    // Just wire up the search input debounce here.
    if (_sortMenuCleanup) {
      _sortMenuCleanup();
      _sortMenuCleanup = null;
    }

    const searchEl = mountEl.querySelector('#s5-search');
    if (searchEl) {
      ensureSearchClearButton(searchEl);
      var _searchDebounce = null;
      searchEl.addEventListener('input', function() {
        var searchStartedAt = performance && performance.now ? performance.now() : 0;
        const val = this.value.trim();
        filterState.search = val;
        currentPage = 1;
        syncSearchClearButton();
        applyImmediateProductSearchFeedback(val, searchStartedAt);
        // Debounce: wait 120ms after last keystroke before re-rendering
        if (_searchDebounce) clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(function () {
          _searchDebounce = null;
          renderProductPage({ keepFilterBar: true });
        }, 120);
      });
    }

    // Search clearing is handled by the root delegated listener. Keeping a
    // second listener here caused two renders and two backend requests.
    syncSearchClearButton();
    bindProductCurrencySelect();

    // Delegate sort menu creation to refreshProductControls (already called by renderProductPage)
    refreshProductControls();
  }


  bindFilterBar();

  // ── Expand buttons ────────────────────────────────────────────────────────
  // Lightweight skeleton shown while quick-analysis content renders in next rAF
  function _s5ExpandSkeleton() {
    var bar = function(w, h, mb) {
      return '<div style="height:' + (h||10) + 'px;width:' + (w||'100%') + ';border-radius:var(--dash-radius-sm);background:linear-gradient(90deg,rgba(255,255,255,0.06) 25%,rgba(255,255,255,0.12) 50%,rgba(255,255,255,0.06) 75%);background-size:400% 100%;animation:s5shimmer 1.2s ease infinite;margin-bottom:' + (mb||8) + 'px"></div>';
    };
    return '<style>@keyframes s5shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}</style>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:4px 0">' +
        '<div>' + bar('60%',8,10) + bar('85%',22,6) + bar('45%',8) + '</div>' +
        '<div>' + bar('55%',8,10) + bar('70%',22,6) + bar('40%',8) + '</div>' +
        '<div>' + bar('65%',8,10) + bar('80%',22,6) + bar('50%',8) + '</div>' +
      '</div>' +
      '<div style="margin-top:18px">' + bar('100%',10,10) + bar('100%',80) + '</div>';
  }

  function bindExpandButtons() {

    mountEl.querySelectorAll('.s5-expand-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const idx    = this.dataset.idx;
        const panel  = document.getElementById(`s5-detail-${idx}`);
        const isOpen = panel && panel.style.maxHeight && panel.style.maxHeight !== '0px' && panel.style.maxHeight !== '0' && panel.style.maxHeight !== '';

        mountEl.querySelectorAll('.s5-detail-panel').forEach(p => {
          p.dataset.detailToken = '';
          p.style.maxHeight    = '0';
          p.style.opacity      = '0';
          p.style.padding      = '0 24px';
          p.style.marginBottom = '0';
          p.style.borderColor  = 'rgba(255,255,255,0)';
        });
        mountEl.querySelectorAll('.s5-expand-arrow').forEach(a => {
          a.style.transform = 'rotate(0deg)';
          a.setAttribute('stroke', 'rgba(255,255,255,0.5)');
        });
        mountEl.querySelectorAll('.s5-expand-btn').forEach(b => {
          b.style.background = 'rgba(255,255,255,0.05)';
          b.style.borderColor = 'rgba(255,255,255,0.12)';
        });

        if (!isOpen && panel) {
          const product = pagedProducts()[parseInt(idx, 10)];
          const detailToken = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
          panel.dataset.detailToken = detailToken;

          // Show panel open immediately with skeleton — content fills in next frame
          panel.innerHTML = _s5ExpandSkeleton();
          panel.style.maxHeight    = '320px';
          panel.style.opacity      = '1';
          panel.style.padding      = '20px 24px';
          panel.style.marginBottom = '8px';
          panel.style.borderColor  = 'rgba(255,255,255,0.06)';

          const arrow = this.querySelector('.s5-expand-arrow');
          if (arrow) { arrow.style.transform = 'rotate(180deg)'; arrow.setAttribute('stroke', '#f59e0b'); }
          this.style.background = 'rgba(245,158,11,0.15)';
          this.style.borderColor = 'rgba(245,158,11,0.5)';

          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              if (!panel.isConnected || panel.dataset.detailToken !== detailToken) return;
              if (product) {
                panel.innerHTML = cachedDetailPanelContent(product);
                panel.style.maxHeight = (panel.scrollHeight + 40) + 'px';
                bindQuantityCityPagination(panel, product);
                if (backendProductsActive && product._backendProduct) {
                  loadBackendProductDetails([product.key]).then(function () {
                    if (!panel.isConnected || panel.dataset.detailToken !== detailToken) return;
                    refreshDetailPanelContent(panel, product, detailToken);
                  });
                }
              }
              if (product && window.TaagerUI) window.TaagerUI.enhance(panel);
            });
          });
        }
      });
    });
  }

  // ── T-22: Product-row FilterBus wiring ───────────────────────────────────
  var _s5SelectedProductKey = null;

  function _clearS5Selection() {
    mountEl.querySelectorAll('.s5-product-row').forEach(function (row) {
      if (row._origBorderColor !== undefined) {
        row.style.borderColor = row._origBorderColor;
      }
      if (row._origShadow !== undefined) {
        row.style.boxShadow = row._origShadow;
      }
    });
    _s5SelectedProductKey = null;
  }

  function resolveCitiesProductFilterKey(product, fallbackKey) {
    var candidates = [
      fallbackKey,
      product && product.key,
      product && product.sku,
      product && product.legacyKey,
      product && product.name
    ].filter(Boolean).map(function (value) {
      return String(value).trim().toLowerCase();
    });
    var normalizedCandidates = candidates.map(textKey).filter(Boolean);

    function candidateMatch(value) {
      value = String(value || '').trim().toLowerCase();
      if (!value) return false;
      if (candidates.indexOf(value) !== -1) return true;
      var normalized = textKey(value);
      return normalized && normalizedCandidates.some(function (candidate) {
        return candidate === normalized ||
          (candidate.length >= 3 && normalized.length >= 3 &&
            (candidate.indexOf(normalized) !== -1 || normalized.indexOf(candidate) !== -1));
      });
    }

    var geoData = window.dashboardGeoData || {};
    var geoMap = geoData.geo && geoData.geo.geoProductMap;
    if (geoMap) {
      var cities = Object.keys(geoMap);
      for (var c = 0; c < cities.length; c++) {
        var products = geoMap[cities[c]] || {};
        var keys = Object.keys(products);
        for (var k = 0; k < keys.length; k++) {
          var cell = products[keys[k]];
          if (candidateMatch(keys[k]) && cell && ((cell.orders || 0) > 0 || (cell.delivered || 0) > 0)) {
            return keys[k];
          }
        }
      }
    }

    var ranked = geoData.products && Array.isArray(geoData.products.rankedList)
      ? geoData.products.rankedList
      : [];
    for (var i = 0; i < ranked.length; i++) {
      var item = ranked[i] || {};
      if ([item.key, item.sku, item.name].some(candidateMatch)) {
        return item.key || item.sku || item.name || fallbackKey;
      }
    }

    return fallbackKey || '';
  }

  function _selectS5Row(productKey) {
    _clearS5Selection();
    _s5SelectedProductKey = productKey;
    mountEl.querySelectorAll('.s5-product-row').forEach(function (row) {
      if (row._origBorderColor === undefined) row._origBorderColor = row.style.borderColor;
      if (row._origShadow === undefined) row._origShadow = row.style.boxShadow;

      if (row.dataset.productKey === productKey) {
        row.style.borderColor = 'rgba(20,184,166,0.55)';
        row.style.boxShadow = 'none';
      }
    });
  }

  function _bindProductRowClicks() {
    // Guard: only bind the single delegated listener once per mount element
    if (mountEl._s5DelegatedBound) return;
    mountEl._s5DelegatedBound = true;

    function handleDelegatedClick(e) {
      const target = e.target && e.target.closest ? e.target : null;
      if (!target) return;

      const editNameBtn = target.closest('.s5-product-name-edit');
      if (editNameBtn && mountEl.contains(editNameBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const sku = editNameBtn.getAttribute('data-product-sku') || '';
        const current = editNameBtn.getAttribute('data-product-name') || sku;
        logProductNameEdit('click captured', {
          tag: editNameBtn.tagName,
          className: editNameBtn.className,
          sku: sku,
          currentName: current,
          hasApi: !!window.TaagerProductNames
        });
        openProductNameEditDialog({ sku: sku, currentName: current });
        return;
      }

      const sortTrigger = target.closest('#s5-sort-trigger');
      if (sortTrigger) {
        e.preventDefault();
        e.stopPropagation();
        if (_dropdownOpen) closeProductSortMenu(); else openProductSortMenu();
        return;
      }

      if (target.closest('#s5-search-clear')) {
        filterState.search = '';
        currentPage = 1;
        const searchInput = mountEl.querySelector('#s5-search');
        if (searchInput) searchInput.value = '';
        syncSearchClearButton();
        renderProductPage({ keepFilterBar: true });
        return;
      }

      const statusPill = target.closest('.s5-pill');
      if (statusPill) {
        const key = statusPill.dataset.key || 'all';
        filterState.statusKey = key;
        if (key === 'shipping') sortState = { field: 'shippingCount', dir: 'desc' };
        else if (key === 'processing') sortState = { field: 'processingCount', dir: 'desc' };
        else if (key === 'failed') sortState = { field: 'failedCount', dir: 'desc' };
        else if (key === 'canceled') sortState = { field: 'canceledCount', dir: 'desc' };
        else if (key === 'delivered') sortState = { field: 'deliveredCount', dir: 'desc' };
        else sortState = { field: 'default', dir: 'asc' };
        currentPage = 1;
        const headers = mountEl.querySelector('.s5-header-cols');
        if (headers) headers.outerHTML = columnHeadersHTML();
        renderProductPage(productSortRenderOptions());
        updateSortArrows();
        return;
      }

      const sortColumn = target.closest('.s5-sort-col');
      if (sortColumn) {
        const field = sortColumn.dataset.field;
        if (sortState.field === field && field !== 'default') {
          sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
        } else {
          sortState.field = field;
          sortState.dir   = 'desc';
        }
        currentPage = 1;
        renderProductPage(productSortRenderOptions());
        updateSortArrows();
        return;
      }

      if (target.closest('#s5-sort-dir-btn')) {
        sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
        currentPage = 1;
        renderProductPage(productSortRenderOptions());
        updateSortArrows();
        return;
      }

      if (target.closest('#s5-clear-sort')) {
        sortState = { field: 'default', dir: 'asc' };
        currentPage = 1;
        renderProductPage(productSortRenderOptions());
        updateSortArrows();
        return;
      }

      const qtyPage = target.closest('.s5-qty-city-page-btn,.s5-qty-city-prev,.s5-qty-city-next');
      if (qtyPage && !qtyPage.disabled) {
        const panel = qtyPage.closest('.s5-detail-panel');
        const row = panel && panel.previousElementSibling;
        const product = row && PRODUCT_BY_KEY[row.dataset.productKey];
        if (!panel || !product) return;
        const key = quantityCityPageStateKey(product, 'detail');
        if (qtyPage.classList.contains('s5-qty-city-page-btn')) quantityCityPageByProduct[key] = Number(qtyPage.dataset.page) || 1;
        else if (qtyPage.classList.contains('s5-qty-city-prev')) quantityCityPageByProduct[key] = Math.max(1, Number(quantityCityPageByProduct[key] || 1) - 1);
        else quantityCityPageByProduct[key] = Number(quantityCityPageByProduct[key] || 1) + 1;
        refreshDetailPanelContent(panel, product, panel.dataset.detailToken || '');
        return;
      }

      const pageButton = target.closest('.s5-page-btn,#s5-prev-page,#s5-next-page');
      if (pageButton && !pageButton.disabled) {
        if (pageButton.id === 's5-prev-page') currentPage = Math.max(1, currentPage - 1);
        else if (pageButton.id === 's5-next-page') currentPage = Math.min(totalProductPages(currentList()), currentPage + 1);
        else currentPage = Number(pageButton.dataset.page) || currentPage;
        renderProductPage();
        scrollToRows();
        return;
      }

      if (target.closest('#s5-view-toggle')) {
        viewMode = viewMode === 'expanded' ? 'compact' : 'expanded';
        const toggle = mountEl.querySelector('#s5-view-toggle');
        if (toggle) toggle.textContent = viewMode === 'compact' ? s5Txt('Expanded', 'موسّع') : s5Txt('Compact', 'مضغوط');
        const headers = mountEl.querySelector('.s5-header-cols');
        if (headers) headers.outerHTML = columnHeadersHTML();
        renderProductPage({ keepFilterBar: true });
        return;
      }

      const row = target.closest('.s5-product-row');
      const productKey = row && row.dataset.productKey;
      const expandButton = target.closest('.s5-expand-btn');
      if (expandButton && row) {
        e.stopPropagation();
        const panel = row.nextElementSibling;
        const isOpen = panel && panel.style.display !== 'none';
        mountEl.querySelectorAll('.s5-detail-panel').forEach(function (item) {
          item.style.display = 'none';
          item.style.padding = '0';
          item.style.marginInlineStart = '0';
          item.style.marginBottom = '0';
          item.style.borderColor = 'rgba(255,255,255,0)';
        });
        if (!isOpen && panel) {
          const product = PRODUCT_BY_KEY[productKey];
          const detailToken = String(Date.now());
          panel.dataset.detailToken = detailToken;

          // Show the panel open immediately with a skeleton, fill content next frame
          panel.innerHTML = _s5ExpandSkeleton();
          syncProductDetailWidth();
          alignDetailPanelToViewport(panel);
          panel.style.display = 'block';
          panel.style.padding = '20px 24px';
          panel.style.marginBottom = '8px';
          panel.style.borderColor = 'rgba(255,255,255,0.06)';

          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              if (!panel.isConnected || panel.dataset.detailToken !== detailToken) return;
              if (product) panel.innerHTML = cachedDetailPanelContent(product);
              if (backendProductsActive && product && product._backendProduct) {
                loadBackendProductDetails([product.key]).then(function () {
                  if (panel.isConnected && panel.dataset.detailToken === detailToken) refreshDetailPanelContent(panel, product, detailToken);
                });
              }
            });
          });
        }
        return;
      }

      const mapButton = target.closest('.s5-map-btn');
      if (mapButton) {
        e.stopPropagation();
        const key = mapButton.dataset.productKey || productKey;
        const product = PRODUCT_BY_KEY[key] || PRODUCT_BY_KEY[productKey] || null;
        const cityProductKey = resolveCitiesProductFilterKey(product, key);
        if (window.DashboardFilterBus) {
          window.DashboardFilterBus.setState({
            selectedProduct: cityProductKey,
            mapMode: window.DashboardFilterBus.MODES ? window.DashboardFilterBus.MODES.PRODUCT : 'product'
          });
        }
        if (ctx && typeof ctx.onNavigate === 'function') ctx.onNavigate('cities');
        else {
          const navBtn = document.querySelector('[data-section="cities"], [data-id="cities"]');
          if (navBtn) navBtn.click();
        }
        return;
      }

      if (target.closest('[data-modal-open]')) {
        e.stopPropagation();
        if (typeof window.openProductModal === 'function') window.openProductModal(productKey);
        return;
      }

      if (target.closest('[data-compare-open],#s5-compare-open')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.openProductCompareModal === 'function') window.openProductCompareModal(productKey || '');
        return;
      }

      if (!row || !productKey) return;
      if (_s5SelectedProductKey === productKey) {
        _clearS5Selection();
        if (window.DashboardFilterBus) window.DashboardFilterBus.setState({ selectedProduct: null, mapMode: 'orders' });
      } else {
        _selectS5Row(productKey);
        if (window.DashboardFilterBus) {
          window.DashboardFilterBus.setState({
            selectedProduct: productKey,
            mapMode: window.DashboardFilterBus.MODES ? window.DashboardFilterBus.MODES.PRODUCT : 'product'
          });
        }
      }
    }

    function handleDelegatedInput(e) {
      // Search is handled with debounce in bindFilterBar — skip duplicate here
      if (e.target.matches('#s5-search')) return;
    }

    function handleDelegatedChange(e) {
      if (e.target.matches('#s5-currency-native')) setProductCurrency(e.target.value);
    }

    mountEl.addEventListener('click', handleDelegatedClick);
    mountEl.addEventListener('input', handleDelegatedInput);
    mountEl.addEventListener('change', handleDelegatedChange);

    addProductCleanup(function () {
      mountEl.removeEventListener('click', handleDelegatedClick);
      mountEl.removeEventListener('input', handleDelegatedInput);
      mountEl.removeEventListener('change', handleDelegatedChange);
      mountEl._s5DelegatedBound = false;
    });
  }
  _bindProductRowClicks();

  // ── Pagination ────────────────────────────────────────────────────────────
  function bindPagination() {
    const prev = mountEl.querySelector('#s5-prev-page');
    const next = mountEl.querySelector('#s5-next-page');
    if (prev) prev.addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; renderProductPage(); scrollToRows(); }
    });
    if (next) next.addEventListener('click', () => {
      if (currentPage < totalProductPages()) { currentPage++; renderProductPage(); scrollToRows(); }
    });
  }

  function bindPageNumbers() {
    mountEl.querySelectorAll('.s5-page-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const p = parseInt(this.dataset.page, 10);
        if (p && p !== currentPage) {
          currentPage = p;
          renderProductPage();
          scrollToRows();
        }
      });
    });
  }

  function scrollToRows() {
    const root = mountEl.querySelector('.s5-root');
    const wrapper = mountEl.querySelector('#s5-scroll-wrapper');
    if (root) {
      root.scrollTop = 0;
    }
    if (wrapper) {
      wrapper.scrollTop = 0;
      wrapper.scrollLeft = 0;
    }
  }

  function aiTextKey(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findProductKeyForAi(query) {
    const needle = aiTextKey(query);
    if (!needle) return '';
    if (PRODUCT_BY_KEY[query]) return query;
    const normalizedNeedle = s5SearchKey(query);
    const sourceMap = new Map();
    PRODUCTS_RAW.concat(backendProductsRows || [], backendProductOptions || []).forEach(function (product) {
      if (!product) return;
      sourceMap.set(product.key || product.sku || product.name, product);
    });
    Object.keys(PRODUCT_BY_KEY).forEach(function (key) {
      var product = PRODUCT_BY_KEY[key];
      if (product) sourceMap.set(product.key || product.sku || product.name || key, product);
    });
    const source = Array.from(sourceMap.values());
    const exact = source.find(function (p) {
      return [p.key, p.sku, p.name, p.displayName, p.productName, p.cat].some(function (value) {
        return aiTextKey(value) === needle;
      });
    });
    if (exact) return exact.key || exact.sku || exact.name || '';
    const partial = source.find(function (p) {
      return [p.key, p.sku, p.name, p.displayName, p.productName, p.cat].some(function (value) {
        const haystack = aiTextKey(value);
        return haystack && (haystack.indexOf(needle) !== -1 || needle.indexOf(haystack) !== -1);
      }) || (normalizedNeedle && productSearchKey(p).indexOf(normalizedNeedle) !== -1);
    });
    return partial ? (partial.key || partial.sku || partial.name || '') : '';
  }

  function resetAiProductListCache() {
    listCache = null;
    listCacheKey = '';
    clearProductDetailCache();
    currentPage = 1;
  }

  function highlightAiProductRow(productKey) {
    const selector = '.s5-product-row[data-product-key="' + (window.CSS && CSS.escape ? CSS.escape(String(productKey)) : String(productKey).replace(/"/g, '\\"')) + '"]';
    const row = mountEl.querySelector(selector);
    if (!row) return;
    row.scrollIntoView({ behavior: 'auto', block: 'center' });
    _selectS5Row(productKey);
  }

  function applyAiProductFilter(filter, options) {
    options = options || {};
    const key = aiTextKey(filter || options.filter || options.sort || options.query);
    const productQuery = options.productKey || options.productId || options.productName || '';
    filterState.search = options.searchText || '';
    filterState.statusKey = 'all';

    if (productQuery) {
      const productKey = findProductKeyForAi(productQuery);
      const product = productKey ? PRODUCT_BY_KEY[productKey] : null;
      filterState.search = product ? (product.name || product.sku || product.key) : productQuery;
    } else if (key === 'failed' || key === 'failed_products') {
      filterState.statusKey = 'failed';
      sortState = { field: 'failedCount', dir: 'desc' };
    } else if (key === 'canceled' || key === 'cancelled' || key === 'canceled_products') {
      filterState.statusKey = 'canceled';
      sortState = { field: 'canceledCount', dir: 'desc' };
    } else if (key === 'delivered') {
      filterState.statusKey = 'delivered';
      sortState = { field: 'deliveredCount', dir: 'desc' };
    } else if (key === 'ranked' || key === 'rank') {
      sortState = { field: 'default', dir: 'asc' };
    } else if (key === 'loss' || key === 'losing' || key === 'pnl' || key === 'profit_loss') {
      sortState = { field: 'profitLoss', dir: 'asc' };
    } else if (key === 'cpa') {
      sortState = { field: 'cpa', dir: 'desc' };
    } else if (key === 'scale' || key === 'scale_candidates' || key === 'best_scale') {
      sortState = { field: 'scalingScore', dir: 'desc' };
    } else if (key === 'best' || key === 'best_products' || key === 'best_ndr') {
      sortState = { field: 'drRate', dir: 'desc' };
    } else if (key === 'commission' || key === 'top_commission') {
      sortState = { field: 'commission', dir: 'desc' };
    } else if (key === 'worst' || key === 'worst_ndr' || key === 'dangerous' || key === 'risk' || key === 'risky_products') {
      sortState = { field: 'ndrPct', dir: 'asc' };
    } else if (key) {
      filterState.search = filter || options.query || '';
    }

    resetAiProductListCache();
    renderProductPage();
    scrollToRows();
    return currentList().length;
  }

  function openAiProduct(query, options) {
    options = options || {};
    const productKey = findProductKeyForAi(query);
    if (!productKey) return false;
    const product = PRODUCT_BY_KEY[productKey];
    if (options.search) filterState.search = product ? (product.name || product.sku || product.key) : '';
    filterState.statusKey = 'all';
    resetAiProductListCache();
    const list = currentList();
    const idx = list.findIndex(function (p) { return (p.key || p.sku || p.name) === productKey; });
    if (idx >= 0) currentPage = Math.floor(idx / PAGE_SIZE) + 1;
    renderProductPage();
    highlightAiProductRow(productKey);
    if (window.DashboardFilterBus) {
      window.DashboardFilterBus.setState({
        selectedProduct: productKey,
        mapMode: window.DashboardFilterBus.MODES.PRODUCT
      });
    }
    if (typeof window.openProductModal === 'function') window.openProductModal(productKey);
    return true;
  }

  function onAiProductFilter(event) {
    if (mountEl.hidden) {
      mountEl._dashboardNeedsRefresh = true;
      return;
    }
    const detail = event && event.detail || {};
    if (detail.productKey || detail.productId || detail.productName) {
      openAiProduct(detail.productKey || detail.productId || detail.productName, { search: true });
      return;
    }
    applyAiProductFilter(detail.filter || detail.sort || detail.query || '', detail);
  }

  window.addEventListener('dashboard-ai-filter-products', onAiProductFilter);
  window.DashboardProductsActions = {
    findProductKey: findProductKeyForAi,
    applyAiFilter: applyAiProductFilter,
    openProduct: openAiProduct
  };
  addProductCleanup(function () {
    window.removeEventListener('dashboard-ai-filter-products', onAiProductFilter);
    if (window.DashboardProductsActions && window.DashboardProductsActions.openProduct === openAiProduct) {
      delete window.DashboardProductsActions;
    }
  });

  // ── Product Compare Modal ────────────────────────────────────────────────
  (function buildProductCompareModal() {
    if (!mountEl.isConnected || mountEl._s5RenderToken !== renderToken) return;
    var COMPARE_ID = 's5-compare-modal';
    var existingCompare = document.getElementById(COMPARE_ID);
    if (existingCompare) existingCompare.remove();

    var compareState = { mode: 'products', leftKey: '', rightKey: '' };
    var expectedCompareCache = new Map();
    var expectedComparePending = new Map();
    var compareOutsideClickHandler = null;
    var compareModal = document.createElement('div');
    compareModal.id = COMPARE_ID;
    compareModal.className = 'dash-overlay-scope';
    compareModal.style.cssText = [
      'position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;',
      'padding:18px;background:rgba(0,0,0,0.72);',
      'font-family:var(--font-ui);direction:' + (isAr ? 'rtl' : 'ltr') + ';box-sizing:border-box;'
    ].join('');
    document.body.appendChild(compareModal);

    function productKeyOf(product, idx) {
      return String(product && (product.key || product.sku || product.name) || idx || '');
    }
    function productIdentityMatches(product, candidate) {
      if (!product || !candidate) return false;
      var productKeys = [product.key, product.sku, product.legacyKey, product.name].map(function (value) {
        return textKey(value || '');
      }).filter(Boolean);
      var candidateKeys = [candidate.key, candidate.sku, candidate.legacyKey, candidate.name].map(function (value) {
        return textKey(value || '');
      }).filter(Boolean);
      return productKeys.some(function (key) {
        return candidateKeys.indexOf(key) !== -1;
      });
    }
    function cmpNum(value, decimals) {
      return (Number(value) || 0).toLocaleString(isAr ? 'ar-EG-u-nu-latn' : 'en-US', {
        minimumFractionDigits: decimals || 0,
        maximumFractionDigits: decimals || 0
      });
    }
    function cmpPct(value) {
      return cmpNum(value, 1) + '%';
    }
    function cmpMoney(value) {
      return productMoney(Number(value) || 0);
    }
    function headroom(product) {
      return (Number(product && product.breakEvenCpa) || 0) - (Number(product && product.cpa) || 0);
    }
    function deliveredCpa(product) {
      if (product && product.expectedDeliveredCpa != null) {
        return Number(product.expectedDeliveredCpa) || 0;
      }
      var delivered = Number(product && product.expectedDeliveriesExact) || Number(product && product.deliveredCount) || 0;
      var spend = Number(product && product.allocatedAdSpend) || 0;
      return delivered > 0 ? spend / delivered : 0;
    }
    function salesValue(product) {
      return Number(product && (
        product.deliveredSales != null ? product.deliveredSales :
        product.actualDeliveredSales != null ? product.actualDeliveredSales :
        product.totalDeliveredSales != null ? product.totalDeliveredSales : 0
      )) || 0;
    }
    function totalSalesValue(product) {
      return Number(product && (
        product.totalSales != null ? product.totalSales :
        product.revenue != null ? product.revenue :
        product.sales != null ? product.sales :
        salesValue(product)
      )) || 0;
    }
    function expectedRangeKey() {
      var range = window.DashboardExpectedNdrRangeState && typeof window.DashboardExpectedNdrRangeState.get === 'function'
        ? window.DashboardExpectedNdrRangeState.get()
        : (data && data.meta && data.meta.ndrPeriod) || {};
      return String(range.dateFrom || range.from || '') + ':' + String(range.dateTo || range.to || '');
    }
    function expectedRangeSnapshot() {
      return window.DashboardExpectedNdrRangeState && typeof window.DashboardExpectedNdrRangeState.get === 'function'
        ? window.DashboardExpectedNdrRangeState.get()
        : (data && data.meta && data.meta.ndrPeriod) || {};
    }
    function compareShortDate(value) {
      value = String(value || '');
      if (!value) return '--';
      var parts = value.split('-');
      if (parts.length === 3) return parts[1] + '/' + parts[2];
      return value;
    }
    function setExpectedCompareRangeDate(edge, nextDate) {
      if (!nextDate || !window.DashboardExpectedNdrRangeState || typeof window.DashboardExpectedNdrRangeState.setRange !== 'function') return;
      var current = expectedRangeSnapshot();
      var nextFrom = edge === 'from' ? nextDate : (current.dateFrom || current.from || nextDate);
      var nextTo = edge === 'to' ? nextDate : (current.dateTo || current.to || nextDate);
      if (nextFrom > nextTo) {
        if (edge === 'from') nextTo = nextFrom;
        else nextFrom = nextTo;
      }
      window.DashboardExpectedNdrRangeState.setRange(nextFrom, nextTo);
      refreshCompare();
    }
    function openExpectedCompareDatePicker(button, edge) {
      var range = expectedRangeSnapshot();
      var currentValue = edge === 'from' ? (range.dateFrom || range.from || '') : (range.dateTo || range.to || '');
      if (window.openDashboardDatePicker && window.DashboardPeriodState) {
        window.openDashboardDatePicker(button, currentValue, function (nextDate) {
          setExpectedCompareRangeDate(edge, nextDate);
        });
        return;
      }
      var input = document.createElement('input');
      input.type = 'date';
      input.value = currentValue;
      if (window.DashboardPeriodState) {
        if (typeof window.DashboardPeriodState.minDate === 'function') input.min = window.DashboardPeriodState.minDate();
        if (typeof window.DashboardPeriodState.maxDate === 'function') input.max = window.DashboardPeriodState.maxDate();
      }
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        setExpectedCompareRangeDate(edge, input.value);
        input.remove();
      });
      input.addEventListener('blur', function () {
        setTimeout(function () { if (input.parentNode) input.remove(); }, 120);
      });
      input.click();
    }
    function expectedCompareKey(product) {
      return [
        productAccountId,
        productKeyOf(product, ''),
        selectedCurrency(),
        expectedRangeKey(),
        Number(productFinancialSettings.adSpend || 0),
        String(productFinancialSettings.egpRate || '')
      ].join('|');
    }
    function cloneActualProduct(product) {
      var clone = Object.assign({}, product || {});
      clone.deliveredCount = Number(product && (
        product.actualDeliveredCount != null ? product.actualDeliveredCount : product.deliveredCount
      )) || 0;
      clone.ndrPct = clone.deliveredCount > 0 ? (Number(product && product.ndrPct) || 0) : 0;
      clone.expectedDeliveriesExact = clone.deliveredCount;
      clone.commission = Number(product && (
        product.actualCommission != null ? product.actualCommission : product.commission
      )) || 0;
      clone.revenue = clone.commission;
      clone.deliveredSales = Number(product && (
        product.actualDeliveredSales != null ? product.actualDeliveredSales : product.deliveredSales
      )) || salesValue(product);
      clone.profitLoss = commissionInCurrency(clone.commission) - (Number(product && product.allocatedAdSpend) || 0);
      clone.deliveredCpa = deliveredCpa(clone);
      clone.breakEvenCpa = Number(product && product.breakEvenCpa) || 0;
      return clone;
    }
    function projectExpectedProduct(product) {
      product = product || {};
      var placed = window.DashboardOrderMetrics
        ? window.DashboardOrderMetrics.netOrders(product)
        : (Number(product.netOrderCount) || Number(product.placedCount) || 0);
      var ndrRate = Math.max(0, Math.min(1, product.expectedNdrRate != null
        ? Number(product.expectedNdrRate)
        : (Number(product.ndrPct) || 0) / 100));
      var actualDelivered = Number(product.actualDeliveredCount != null ? product.actualDeliveredCount : product.deliveredCount) || 0;
      var actualCommission = Number(product.actualCommission != null ? product.actualCommission : product.commission) || 0;
      var calculation = window.TaagerDashboardFinancialCore.calculate({
        mode: 'expected',
        netOrders: placed,
        actualDeliveredOrders: actualDelivered,
        actualEarnedProfitAfterTax: actualCommission,
        netOrderProfitAfterTax: product.netOrderProfitAfterTax != null ? product.netOrderProfitAfterTax : product.totalPlacedCommission,
        currentTotalSales: totalSalesValue(product),
        expectedNdrRate: ndrRate,
        adSpend: Number(product.allocatedAdSpend) || 0
      });
      var clone = Object.assign({}, product, {
        _expectedProjected: true,
        deliveredCount: calculation.expectedDeliveriesDisplay,
        deliveries: calculation.expectedDeliveriesDisplay,
        expectedDeliveriesExact: calculation.expectedDeliveriesExact,
        commission: calculation.expectedTotalProfitBeforeAdSpend,
        expectedTotalProfitBeforeAdSpend: calculation.expectedTotalProfitBeforeAdSpend,
        averageProfit: calculation.averageProfit,
        averageProfitSource: calculation.averageProfitSource,
        revenue: calculation.expectedTotalProfitBeforeAdSpend,
        deliveredSales: calculation.expectedDeliveredSales,
        expectedDeliveredSales: calculation.expectedDeliveredSales,
        expectedDeliveredCpa: calculation.expectedDeliveredCpa,
        ndrPct: calculation.expectedDeliveriesDisplay > 0 ? (Number(product.ndrPct) || 0) : 0,
        drRate: Number(product.drRate || product.deliveryPct || product.ndrPct || 0),
        breakEvenCpa: sarToSelectedCurrency(calculation.breakEvenCpa),
        profitLoss: commissionInCurrency(calculation.expectedTotalProfitBeforeAdSpend) - (Number(product.allocatedAdSpend) || 0)
      });
      clone.deliveredCpa = deliveredCpa(clone);
      return clone;
    }
    function normalizeExpectedProduct(product, expectedRow) {
      var expected = Object.assign({}, product || {}, expectedRow || {});
      expected.key = (product && product.key) || expected.key;
      expected.sku = (product && product.sku) || expected.sku;
      expected.name = (product && product.name) || expected.name;
      expected.cat = (product && product.cat) || expected.cat;
      expected.rank = (product && product.rank) || expected.rank;
      expected.allocatedAdSpend = Number(product && product.allocatedAdSpend) || Number(expected.allocatedAdSpend) || 0;
      expected.cpa = Number(product && product.cpa) || Number(expected.cpa) || 0;
      expected.profitLoss = Number(expected.profitLoss != null ? expected.profitLoss : (commissionInCurrency(expected.commission || 0) - expected.allocatedAdSpend));
      if ((Number(expected.deliveredCount) || 0) <= 0) expected.ndrPct = 0;
      if (expected.expectedDeliveredCpa == null && expected.expectedDeliveriesExact != null) {
        var exactDeliveries = Number(expected.expectedDeliveriesExact) || 0;
        expected.expectedDeliveredCpa = exactDeliveries > 0 ? expected.allocatedAdSpend / exactDeliveries : 0;
      }
      expected.deliveredCpa = deliveredCpa(expected);
      expected._expectedProjected = false;
      return expected;
    }
    function loadExpectedProductComparison(product) {
      if (!product) return Promise.resolve(null);
      var cacheKey = expectedCompareKey(product);
      if (expectedCompareCache.has(cacheKey)) return Promise.resolve(expectedCompareCache.get(cacheKey));
      if (expectedComparePending.has(cacheKey)) return expectedComparePending.get(cacheKey);
      var fallback = projectExpectedProduct(product);
      if (!window.DashboardQueryRuntime || typeof window.DashboardQueryRuntime.query !== 'function') {
        expectedCompareCache.set(cacheKey, fallback);
        return Promise.resolve(fallback);
      }
      var range = window.DashboardExpectedNdrRangeState && typeof window.DashboardExpectedNdrRangeState.get === 'function'
        ? window.DashboardExpectedNdrRangeState.get()
        : (data && data.meta && data.meta.ndrPeriod) || {};
      var params = Object.assign({}, backendProductParams(), {
        page: 1,
        pageSize: 25,
        sortBy: 'rank',
        sortDir: 'asc',
        deliveredDateMode: 'expected',
        ndrDateFrom: range.dateFrom || range.from || '',
        ndrDateTo: range.dateTo || range.to || '',
        requestChannel: 'expected-product-compare',
        filters: {
          search: product.sku || product.legacyKey || product.name || product.key || '',
          statusKey: 'all'
        }
      });
      var pending = window.DashboardQueryRuntime.query('products', params, data).then(function (result) {
        var rows = result && result.ok && Array.isArray(result.rows) ? result.rows : [];
        var match = rows.map(backendProductRow).find(function (row) {
          return productIdentityMatches(product, row);
        }) || null;
        var expected = match ? normalizeExpectedProduct(product, match) : fallback;
        expectedCompareCache.set(cacheKey, expected);
        expectedComparePending.delete(cacheKey);
        return expected;
      }).catch(function () {
        expectedCompareCache.set(cacheKey, fallback);
        expectedComparePending.delete(cacheKey);
        return fallback;
      });
      expectedComparePending.set(cacheKey, pending);
      return pending;
    }
    function topCity(product) {
      var rows = product && product.cityBreakdown && product.cityBreakdown.length ? product.cityBreakdown.slice() : [];
      rows.sort(function (a, b) { return (Number(b.count) || 0) - (Number(a.count) || 0); });
      return rows[0] && rows[0].name ? rows[0].name : s5Txt('No data', 'لا توجد بيانات');
    }
    function productOptions(selectedKey) {
      return productOptionSource().map(function (product, idx) {
        var key = productKeyOf(product, idx);
        var label = (product.name || s5Txt('Unnamed product', 'منتج بدون اسم')) + (product.sku ? ' - ' + product.sku : '');
        return '<option value="' + attr(key) + '"' + (String(selectedKey) === key ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('');
    }
    function compareWinner(left, right, metric) {
      if (!left || !right || !metric || metric.compare === 'none') return '';
      var leftValue = Number(metric.get(left)) || 0;
      var rightValue = Number(metric.get(right)) || 0;
      if (Math.abs(leftValue - rightValue) < 0.0001) return '';
      return metric.compare === 'low'
        ? (leftValue < rightValue ? 'left' : 'right')
        : (leftValue > rightValue ? 'left' : 'right');
    }
    var metrics = [
      { group: s5Txt('Volume', 'الحجم'), label: s5Txt('Orders', 'الطلبات'), fmt: function (p) { return cmpNum(p.netOrderCount || p.placedCount); }, get: function (p) { return p.netOrderCount || p.placedCount; }, compare: 'high' },
      { group: s5Txt('Volume', 'الحجم'), label: s5Txt('Delivered', 'المسلم'), fmt: function (p) { return cmpNum(p.deliveredCount); }, get: function (p) { return p.deliveredCount; }, compare: 'high' },
      { group: s5Txt('Volume', 'الحجم'), label: s5Txt('Pieces', 'القطع'), fmt: function (p) { return cmpNum(p.totalPieces); }, get: function (p) { return p.totalPieces; }, compare: 'high' },
      { group: s5Txt('Rates', 'النسب'), label: s5Txt('Confirmation', 'التأكيد'), fmt: function (p) { return cmpPct(p.confirmationPct); }, get: function (p) { return p.confirmationPct; }, compare: 'high' },
      { group: s5Txt('Rates', 'النسب'), label: 'DR', fmt: function (p) { return cmpPct(p.drRate || p.deliveryPct); }, get: function (p) { return p.drRate || p.deliveryPct; }, compare: 'high' },
      { group: s5Txt('Rates', 'النسب'), label: s5Txt('Cancel', 'الإلغاء'), fmt: function (p) { return cmpPct(p.cancelPct); }, get: function (p) { return p.cancelPct; }, compare: 'low' },
      { group: s5Txt('Rates', 'النسب'), label: s5Txt('Pending', 'قيد الانتظار'), fmt: function (p) { return cmpPct(p.pendingPct); }, get: function (p) { return p.pendingPct; }, compare: 'low' },
      { group: s5Txt('Rates', 'النسب'), label: 'NDR', fmt: function (p) { return cmpPct(p.ndrPct); }, get: function (p) { return p.ndrPct; }, compare: 'high' },
      { group: s5Txt('Financials', 'الماليات'), label: p5Txt('adSpend'), fmt: function (p) { return cmpMoney(p.allocatedAdSpend); }, get: function (p) { return p.allocatedAdSpend; }, compare: 'low' },
      { group: s5Txt('Financials', 'الماليات'), label: s5Txt('Taager Profit After Tax', 'ربح تاجر بعد الضريبة'), fmt: function (p) { return cmpMoney(commissionInCurrency(p.commission)); }, get: function (p) { return commissionInCurrency(p.commission); }, compare: 'high' },
      { group: s5Txt('Financials', 'الماليات'), label: p5Txt('pnl'), fmt: function (p) { return cmpMoney(p.profitLoss); }, get: function (p) { return p.profitLoss; }, compare: 'high' },
      { group: s5Txt('Financials', 'الماليات'), label: 'CPA', fmt: function (p) { return cmpMoney(p.cpa); }, get: function (p) { return p.cpa; }, compare: 'low' },
      { group: s5Txt('Financials', 'الماليات'), label: s5Txt('CPA vs Break-even', 'CPA مقابل التعادل'), fmt: function (p) { return cmpMoney(p.cpa) + ' / ' + cmpMoney(p.breakEvenCpa); }, get: headroom, compare: 'high' },
      { group: s5Txt('Geography', 'المناطق'), label: s5Txt('Top city', 'أفضل مدينة'), fmt: function (p) { return esc(topCity(p)); }, get: function () { return 0; }, compare: 'none' }
    ];
    var scenarioMetrics = [
      { group: s5Txt('Volume', 'Volume'), label: s5Txt('Net Orders', 'Net Orders'), fmt: function (p) { return cmpNum(p.netOrderCount || p.placedCount); }, get: function (p) { return p.netOrderCount || p.placedCount; }, compare: 'none' },
      { group: s5Txt('Volume', 'Volume'), label: s5Txt('Delivered', 'Delivered'), fmt: function (p) { return cmpNum(p.deliveredCount); }, get: function (p) { return p.deliveredCount; }, compare: 'high' },
      { group: s5Txt('Rates', 'Rates'), label: 'NDR', fmt: function (p) { return cmpPct(p.ndrPct); }, get: function (p) { return p.ndrPct; }, compare: 'high' },
      { group: s5Txt('Rates', 'Rates'), label: 'DR', fmt: function (p) { return cmpPct(p.drRate || p.deliveryPct); }, get: function (p) { return p.drRate || p.deliveryPct; }, compare: 'high' },
      { group: s5Txt('Financials', 'Financials'), label: s5Txt('Average Profit', 'Average Profit'), fmt: function (p) { return cmpMoney(p.averageProfit); }, get: function (p) { return p.averageProfit; }, compare: 'none' },
      { group: s5Txt('Financials', 'Financials'), label: p5Txt('adSpend'), fmt: function (p) { return cmpMoney(p.allocatedAdSpend); }, get: function (p) { return p.allocatedAdSpend; }, compare: 'none' },
      { group: s5Txt('Financials', 'Financials'), label: 'CPA', fmt: function (p) { return cmpMoney(p.cpa); }, get: function (p) { return p.cpa; }, compare: 'none' },
      { group: s5Txt('Financials', 'Financials'), label: s5Txt('Delivered CPA', 'Delivered CPA'), fmt: function (p) { return cmpMoney(p.deliveredCpa || deliveredCpa(p)); }, get: function (p) { return p.deliveredCpa || deliveredCpa(p); }, compare: 'low' },
      { group: s5Txt('Financials', 'Financials'), label: s5Txt('Break-even CPA', 'Break-even CPA'), fmt: function (p) { return cmpMoney(p.breakEvenCpa); }, get: function (p) { return p.breakEvenCpa; }, compare: 'high' },
      { group: s5Txt('Financials', 'Financials'), label: s5Txt('Profit After Tax', 'Profit After Tax'), fmt: function (p) { return cmpMoney(commissionInCurrency(p.commission)); }, get: function (p) { return commissionInCurrency(p.commission); }, compare: 'high' },
      { group: s5Txt('Financials', 'Financials'), label: p5Txt('pnl'), fmt: function (p) { return cmpMoney(p.profitLoss); }, get: function (p) { return p.profitLoss; }, compare: 'high' },
      { group: s5Txt('Sales', 'Sales'), label: s5Txt('SP Sales', 'SP Sales'), fmt: function (p) { return cmpMoney(commissionInCurrency(salesValue(p))); }, get: function (p) { return commissionInCurrency(salesValue(p)); }, compare: 'high' }
    ];
    function comparisonSummary(left, right) {
      var leftWins = [];
      var rightWins = [];
      metrics.forEach(function (metric) {
        var winner = compareWinner(left, right, metric);
        if (winner === 'left') leftWins.push(metric.label);
        if (winner === 'right') rightWins.push(metric.label);
      });
      if (leftWins.length === rightWins.length) return { winner: '', wins: 0, total: leftWins.length + rightWins.length, reasons: [] };
      return leftWins.length > rightWins.length
        ? { winner: 'left', wins: leftWins.length, total: leftWins.length + rightWins.length, reasons: leftWins.slice(0, 4) }
        : { winner: 'right', wins: rightWins.length, total: leftWins.length + rightWins.length, reasons: rightWins.slice(0, 4) };
    }
    function verdict(left, right) {
      if (!left && !right) {
        return {
          color: '#f59e0b',
          title: s5Txt('Select two products to compare', 'اختر منتجين للمقارنة'),
          text: s5Txt('The verdict will weigh volume, delivery quality, and financial headroom once both sides are selected.', 'سيظهر الحكم بعد اختيار المنتجين بناء على الحجم والجودة والماليات.')
        };
      }
      if (!left || !right) {
        return {
          color: '#f59e0b',
          title: s5Txt('One product selected', 'تم اختيار منتج واحد'),
          text: s5Txt('Select the second product to unlock the final verdict.', 'اختر المنتج الثاني لإظهار الحكم النهائي.')
        };
      }
      var summary = comparisonSummary(left, right);
      if (!summary.winner) {
        return {
          color: '#f59e0b',
          title: s5Txt('Too close to call', 'النتيجة متقاربة'),
          text: s5Txt('Both products are tied across the key comparison metrics. Review the highlighted cards before changing spend.', 'المنتجان متقاربان عبر أهم مؤشرات المقارنة. راجع البطاقات المميزة قبل تغيير الإنفاق.')
        };
      }
      var winnerProduct = summary.winner === 'left' ? left : right;
      var loserProduct = summary.winner === 'left' ? right : left;
      var winnerLabel = summary.winner === 'left' ? s5Txt('Product A', 'المنتج A') : s5Txt('Product B', 'المنتج B');
      return {
        color: '#00e676',
        title: winnerLabel + ' ' + s5Txt('is better', 'هو الأفضل'),
        text: esc(winnerProduct.name || '') + ' ' + s5Txt('beats', 'يتفوق على') + ' ' + esc(loserProduct.name || '') + ' ' + s5Txt('by winning', 'في') + ' ' + cmpNum(summary.wins) + ' / ' + cmpNum(summary.total) + ' ' + s5Txt('metric checks. Strongest edges:', 'من المؤشرات. أقوى النقاط:') + ' ' + summary.reasons.map(esc).join(' | ') + '.'
      };
    }
    function scenarioVerdict(actual, expected, isLoading) {
      if (!actual) {
        return {
          color: '#f59e0b',
          title: s5Txt('Select one product', 'اختر منتجا واحدا'),
          text: s5Txt('Choose a product to compare its actual cycle with the expected NDR cycle.', 'اختر منتجا لمقارنة دورته الفعلية مع دورة NDR المتوقعة.')
        };
      }
      if (isLoading) {
        return {
          color: '#3b82f6',
          title: s5Txt('Loading expected cycle', 'جار تحميل الدورة المتوقعة'),
          text: s5Txt('Pulling the historical NDR version for this same product without changing the dashboard mode.', 'يتم جلب نسخة NDR التاريخية لنفس المنتج بدون تغيير وضع لوحة التحكم.')
        };
      }
      var actualProfit = Number(actual.profitLoss) || 0;
      var expectedProfit = Number(expected && expected.profitLoss) || 0;
      var diff = expectedProfit - actualProfit;
      var deliveredDiff = (Number(expected && expected.deliveredCount) || 0) - (Number(actual.deliveredCount) || 0);
      var color = diff >= 0 ? '#00e676' : '#ef4444';
      return {
        color: color,
        title: diff >= 0 ? s5Txt('Expected NDR improves this product', 'NDR المتوقع يحسن هذا المنتج') : s5Txt('Expected NDR weakens this product', 'NDR المتوقع يضعف هذا المنتج'),
        text: s5Txt('Expected cycle delta:', 'فرق الدورة المتوقعة:') + ' ' + cmpMoney(diff) + ' ' + s5Txt('profit/loss and', 'ربح/خسارة و') + ' ' + (deliveredDiff >= 0 ? '+' : '') + cmpNum(deliveredDiff) + ' ' + s5Txt('delivered orders versus the actual cycle.', 'طلبات مسلمة مقارنة بالدورة الفعلية.') +
          (expected && expected._expectedProjected ? ' ' + s5Txt('Fallback projection is shown until backend expected data is available.', 'يتم عرض توقع بديل حتى تتوفر بيانات التوقع من الخلفية.') : '')
      };
    }
    function getMetricColor(metric, value) {
      var n = Number(value) || 0;
      var label = String(metric && metric.label || '').toLowerCase();
      if (metric.compare === 'none') return 'rgba(255,255,255,0.55)';
      if (label.indexOf('cancel') !== -1 || label.indexOf('الإلغاء') !== -1) {
        return n >= 40 ? '#ef4444' : n >= 25 ? '#f59e0b' : '#00e676';
      }
      if (metric.label === 'NDR') return n < 20 ? '#ef4444' : n < 30 ? '#f59e0b' : '#00e676';
      if (label.indexOf('p&l') !== -1 || label.indexOf('pnl') !== -1 || label.indexOf('ربح') !== -1) {
        return n < 0 ? '#ef4444' : '#00e676';
      }
      return '#00e676';
    }
    function isDangerValue(metric, value) {
      var n = Number(value) || 0;
      var label = String(metric && metric.label || '').toLowerCase();
      if ((label.indexOf('cancel') !== -1 || label.indexOf('الإلغاء') !== -1) && n >= 40) return true;
      if (metric.label === 'NDR' && n < 20 && n > 0) return true;
      if ((label.indexOf('p&l') !== -1 || label.indexOf('pnl') !== -1 || label.indexOf('ربح') !== -1) && n < 0) return true;
      return false;
    }
    function dangerBadge(metric, product) {
      var value = Number(metric.get(product)) || 0;
      if (!isDangerValue(metric, value)) return '';
      return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:var(--type-micro);font-weight:var(--weight-bold);color:#ef4444;background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.35);border-radius:5px;padding:1px 5px;margin-inline-start:4px;vertical-align:middle;flex-shrink:0">!</span>';
    }
    function winnerCrown() {
      return '<svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="flex-shrink:0;margin-inline-start:3px;vertical-align:middle"><path d="M2 19h20v2H2zM2 8l5 6 5-8 5 8 5-6v9H2z"/></svg>';
    }
    function selectorHTML(side, product) {
      var sideColor = side === 'left' ? '#f59e0b' : '#14b8a6';
      var label = side === 'left' ? s5Txt('Product A', 'المنتج A') : s5Txt('Product B', 'المنتج B');
      var stateKey = side === 'left' ? compareState.leftKey : compareState.rightKey;
      var displayName = product ? esc(product.name || s5Txt('Unnamed', 'بدون اسم')) : '';
      var displaySku = product ? String(product.sku || '') : '';
      var placeholder = s5Txt('Search products...', 'ابحث عن منتج...');
      var triggerInner = product
        ? '<span style="display:flex;flex-direction:column;align-items:flex-start;min-width:0;max-width:100%;overflow:hidden;flex:1 1 0;gap:1px"><span class="s5-product-data-text" data-i18n-preserve style="font-size:var(--type-label);font-weight:var(--weight-bold);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + displayName + '</span>' +
          (displaySku ? skuCopyHtml(displaySku, { style: 'font-size:var(--type-micro);color:rgba(255,255,255,0.42);font-weight:var(--weight-bold)' }) : '') + '</span>'
        : '<span style="font-size:var(--type-label);color:rgba(255,255,255,0.35);font-weight:var(--weight-bold);flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + placeholder + '</span>';
      var options = productOptionSource().map(function (pr, idx) {
        var key = productKeyOf(pr, idx);
        var name = pr.name || s5Txt('Unnamed', 'بدون اسم');
        var sku = pr.sku || '';
        var selected = String(stateKey) === key;
        if (!pr._searchKey) {
          pr._searchKey = textKey(name + ' ' + sku);
        }
        return '<div class="s5-cmp-dd-option' + (selected ? ' selected' : '') + '" data-key="' + attr(key) + '" data-search="' + attr(pr._searchKey) + '" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--dash-radius-sm);cursor:pointer;background:' + (selected ? sideColor + '18' : 'transparent') + ';border:1px solid ' + (selected ? sideColor + '44' : 'transparent') + ';margin-bottom:3px">' +
          '<span style="min-width:0;flex:1"><span class="s5-product-data-text" data-i18n-preserve style="display:block;font-size:var(--type-label);font-weight:var(--weight-bold);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</span>' +
          (sku ? skuCopyHtml(sku, { block: true, style: 'font-size:var(--type-micro);color:rgba(255,255,255,0.38);font-weight:var(--weight-bold);margin-top:1px' }) : '') + '</span>' +
          (selected ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + sideColor + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
        '</div>';
      }).join('');
      return '<div class="s5-cmp-dd-wrap" data-side="' + side + '" style="margin-bottom:14px;position:relative;min-width:0">' +
        '<div style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:' + sideColor + ';margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px">' + label + '</div>' +
        '<div role="button" tabindex="0" class="s5-cmp-dd-trigger" data-side="' + side + '" style="width:100%;min-height:44px;min-width:0;border-radius:var(--dash-radius-md);border:1px solid ' + (product ? sideColor + '55' : 'rgba(255,255,255,0.12)') + ';background:' + (product ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.035)') + ';color:#fff;padding:0 12px;font-size:var(--type-label);font-weight:var(--weight-bold);font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:10px;text-align:start;box-sizing:border-box;outline:none;overflow:hidden">' +
          (product ? '<span style="width:28px;height:28px;border-radius:var(--dash-radius-sm);flex-shrink:0;background:' + sideColor + '22;border:1px solid ' + sideColor + '55;color:' + sideColor + ';display:flex;align-items:center;justify-content:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>' : '<span style="width:28px;height:28px;border-radius:var(--dash-radius-sm);flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid var(--dash-border-soft);color:rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>') +
          triggerInner +
          '<svg class="s5-cmp-dd-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:rgba(255,255,255,0.35)"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</div>' +
        '<div class="s5-cmp-dd-panel" data-side="' + side + '" style="display:none;position:absolute;top:calc(100% + 6px);inset-inline:0;z-index:30;background:#0d1526;border:1px solid rgba(255,255,255,0.13);border-radius:var(--dash-radius-lg);overflow:hidden;flex-direction:column;max-height:min(320px,42vh);width:100%;box-sizing:border-box;box-shadow:0 18px 36px rgba(0,0,0,0.38)">' +
          '<div style="padding:10px 10px 8px;border-bottom:1px solid rgba(255,255,255,0.07)"><input type="text" class="s5-cmp-dd-search" placeholder="' + attr(placeholder) + '" style="width:100%;height:36px;border-radius:var(--dash-radius-sm);border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:#fff;padding:0 10px;font-size:var(--type-label);font-weight:var(--weight-bold);font-family:inherit;outline:none;box-sizing:border-box;direction:' + (isAr ? 'rtl' : 'ltr') + '"></div>' +
          '<div class="s5-cmp-dd-list" style="max-height:min(250px,34vh);overflow-y:auto;padding:6px">' + options + '</div>' +
        '</div>' +
      '</div>';
    }
    function metricHTML(side, product, other, metric) {
      if (!product) return '';
      var productValue = Number(metric.get(product)) || 0;
      var otherValue = Number(other && metric.get(other)) || 0;
      var currentWins = false;
      var currentLoses = false;
      if (other && metric.compare !== 'none' && Math.abs(productValue - otherValue) >= 0.0001) {
        currentWins = metric.compare === 'low' ? productValue < otherValue : productValue > otherValue;
        currentLoses = !currentWins;
      }
      var danger = isDangerValue(metric, productValue);
      var winColor = getMetricColor(metric, productValue);
      var cls = danger ? ' is-danger' : (currentWins ? ' is-winner' : (currentLoses ? ' is-loser' : ''));
      var maxValue = Math.max(Math.abs(productValue), Math.abs(otherValue), metric.compare === 'none' ? 0 : 1);
      var barWidth = metric.compare === 'none' ? 0 : Math.min(100, Math.round((Math.abs(productValue) / maxValue) * 100));
      var barColor = danger ? '#ef4444' : (currentWins ? winColor : (currentLoses ? 'rgba(245,158,11,0.45)' : winColor));
      var styleVars = currentWins && !danger
        ? ';--cmp-win-border:' + winColor + '88;--cmp-win-bg:' + winColor + '14;--cmp-win-ring:' + winColor + '35;--cmp-win-glow:' + winColor + '22'
        : '';
      return '<div class="s5-compare-metric' + cls + '" style="' + styleVars + '">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
          '<div style="font-size:var(--type-micro);color:rgba(255,255,255,0.42);font-weight:var(--weight-bold);line-height:1.3;text-transform:uppercase;letter-spacing:.3px">' + metric.label + dangerBadge(metric, product) + '</div>' +
          '<div style="display:flex;align-items:center;gap:2px"><div style="font-size:var(--type-body);color:' + (danger ? '#ef4444' : (currentLoses ? '#f59e0b' : (currentWins ? winColor : '#fff'))) + ';font-weight:var(--weight-bold);text-align:end;line-height:1.25;overflow-wrap:anywhere">' + metric.fmt(product) + '</div>' + (currentWins && !danger ? winnerCrown() : '') + '</div>' +
        '</div>' +
        (metric.compare === 'none' ? '' : '<div style="height:5px;background:rgba(255,255,255,0.07);border-radius:var(--radius-pill);overflow:hidden;margin-top:7px"><div style="height:100%;width:' + barWidth + '%;background:' + barColor + ';border-radius:var(--radius-pill)"></div></div>') +
      '</div>';
    }
    function tabsHTML() {
      var tabs = [
        { id: 'products', label: s5Txt('Product vs Product', 'منتج مقابل منتج') },
        { id: 'ndr', label: s5Txt('Actual vs Expected NDR', 'NDR الفعلي مقابل المتوقع') }
      ];
      return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + tabs.map(function (tab) {
        var active = compareState.mode === tab.id;
        return '<button type="button" class="s5-compare-tab" data-mode="' + tab.id + '" style="border:1px solid ' + (active ? 'rgba(245,158,11,0.55)' : 'rgba(255,255,255,0.10)') + ';background:' + (active ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.04)') + ';color:' + (active ? '#fbbf24' : 'rgba(255,255,255,0.62)') + ';border-radius:var(--dash-radius-md);padding:7px 11px;font-size:var(--type-caption);font-weight:var(--weight-bold);font-family:inherit;cursor:pointer">' + tab.label + '</button>';
      }).join('') + '</div>';
    }
    function scenarioSelectorHTML(product) {
      var range = expectedRangeSnapshot();
      return '<div class="s5-compare-card" style="margin-bottom:12px">' +
        '<div style="display:grid;grid-template-columns:minmax(240px,1fr) minmax(260px,auto);gap:12px;align-items:end">' +
          '<div>' + selectorHTML('left', product) + '</div>' +
          '<div style="border:1px solid rgba(20,184,166,0.22);background:rgba(20,184,166,0.075);border-radius:var(--dash-radius-lg);padding:10px 11px">' +
            '<div style="font-size:var(--type-micro);color:#5eead4;font-weight:var(--weight-bold);text-transform:uppercase;letter-spacing:.4px;margin-bottom:7px">' + s5Txt('Expected NDR period', 'فترة NDR المتوقعة') + '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<button type="button" class="s5-expected-range-date" data-edge="from" title="' + attr(s5Txt('Expected NDR from date', 'بداية NDR المتوقعة')) + '" style="border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.20);color:#fff;border-radius:var(--dash-radius-md);padding:8px 10px;font-size:var(--type-label);font-weight:var(--weight-bold);font-family:inherit;cursor:pointer;min-width:82px;text-align:center">' + esc(compareShortDate(range.dateFrom || range.from)) + '</button>' +
              '<span style="font-size:var(--type-caption);color:rgba(255,255,255,0.35);font-weight:var(--weight-bold)">' + s5Txt('to', 'إلى') + '</span>' +
              '<button type="button" class="s5-expected-range-date" data-edge="to" title="' + attr(s5Txt('Expected NDR to date', 'نهاية NDR المتوقعة')) + '" style="border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.20);color:#fff;border-radius:var(--dash-radius-md);padding:8px 10px;font-size:var(--type-label);font-weight:var(--weight-bold);font-family:inherit;cursor:pointer;min-width:82px;text-align:center">' + esc(compareShortDate(range.dateTo || range.to)) + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:var(--type-caption);line-height:1.65;color:rgba(255,255,255,0.48);font-weight:var(--weight-bold);margin-top:10px">' +
          s5Txt('Same product, two calculation cycles. Actual uses the current dashboard product metrics; Expected uses the selected Expected NDR period without switching the whole dashboard.', 'نفس المنتج بدورتين حساب. الفعلي يستخدم مؤشرات المنتج الحالية، والمتوقع يستخدم فترة NDR المحددة بدون تغيير لوحة التحكم كلها.') +
        '</div>' +
      '</div>';
    }
    function scenarioColumnHTML(title, color, product, other, isExpected) {
      if (!product) {
        return '<div class="s5-compare-card" style="border-style:dashed;min-height:360px;display:flex;align-items:center;justify-content:center;text-align:center;color:rgba(255,255,255,0.32);font-size:var(--type-control);font-weight:var(--weight-bold)">' +
          s5Txt('Choose a product to load metrics', 'Choose a product to load metrics') +
        '</div>';
      }
      var groups = {};
      var order = [];
      scenarioMetrics.forEach(function (metric) {
        if (!groups[metric.group]) {
          groups[metric.group] = [];
          order.push(metric.group);
        }
        groups[metric.group].push(metric);
      });
      var sections = order.map(function (group) {
        return '<div style="display:flex;align-items:center;gap:6px;margin:14px 0 8px">' +
          '<div style="width:3px;height:12px;border-radius:var(--radius-pill);background:' + color + '"></div>' +
          '<div style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:' + color + ';text-transform:uppercase;letter-spacing:.6px">' + group + '</div>' +
        '</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">' +
          groups[group].map(function (metric) { return metricHTML(isExpected ? 'right' : 'left', product, other, metric); }).join('') +
        '</div>';
      }).join('');
      return '<div class="s5-compare-card">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--dash-radius-md);background:' + color + '10;border:1px solid ' + color + '44;margin-bottom:4px">' +
          '<div style="width:36px;height:36px;border-radius:var(--dash-radius-md);flex-shrink:0;background:' + color + '22;border:1px solid ' + color + '55;color:' + color + ';display:flex;align-items:center;justify-content:center;font-size:var(--type-control);font-weight:var(--weight-bold)">' + (isExpected ? 'EXP' : 'ACT') + '</div>' +
          '<div style="min-width:0"><div style="font-size:var(--type-control);font-weight:var(--weight-bold);color:#fff">' + title + '</div>' +
          '<div data-i18n-preserve style="font-size:var(--type-micro);color:rgba(255,255,255,0.38);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(product.name || '') + (product.sku ? ' - ' + skuCopyHtml(product.sku, { style: 'font-size:var(--type-micro);color:rgba(255,255,255,0.38);font-weight:var(--weight-bold)' }) : '') + '</div></div>' +
        '</div>' +
        sections +
      '</div>';
    }
    function columnHTML(side, product, other) {
      var sideColor = side === 'left' ? '#f59e0b' : '#14b8a6';
      if (!product) {
        return '<div class="s5-compare-card" style="border-style:dashed">' +
          selectorHTML(side, null) +
          '<div style="min-height:300px;display:flex;align-items:center;justify-content:center;text-align:center;color:rgba(255,255,255,0.32);font-size:var(--type-control);font-weight:var(--weight-bold)">' +
            s5Txt('Choose a product to load metrics', 'اختر منتجا لعرض المؤشرات') +
          '</div>' +
        '</div>';
      }
      var groups = {};
      var order = [];
      metrics.forEach(function (metric) {
        if (!groups[metric.group]) {
          groups[metric.group] = [];
          order.push(metric.group);
        }
        groups[metric.group].push(metric);
      });
      var sections = order.map(function (group) {
        return '<div style="display:flex;align-items:center;gap:6px;margin:14px 0 8px">' +
          '<div style="width:3px;height:12px;border-radius:var(--radius-pill);background:' + sideColor + '"></div>' +
          '<div style="font-size:var(--type-micro);font-weight:var(--weight-bold);color:' + sideColor + ';text-transform:uppercase;letter-spacing:.6px">' + group + '</div>' +
        '</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">' +
          groups[group].map(function (metric) { return metricHTML(side, product, other, metric); }).join('') +
        '</div>';
      }).join('');
      return '<div class="s5-compare-card">' +
        selectorHTML(side, product) +
        '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--dash-radius-md);background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);margin-bottom:4px">' +
          '<div style="width:36px;height:36px;border-radius:var(--dash-radius-md);flex-shrink:0;background:' + sideColor + '22;border:1px solid ' + sideColor + '55;color:' + sideColor + ';display:flex;align-items:center;justify-content:center;font-size:var(--type-body);font-weight:var(--weight-bold)">#' + cmpNum(product.rank) + '</div>' +
          '<div style="min-width:0"><div data-i18n-preserve style="font-size:var(--type-control);font-weight:var(--weight-bold);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(product.name || '') + '</div>' +
          skuCopyHtml(product.sku || '', { emptyText: '-', block: true, style: 'font-size:var(--type-micro);color:rgba(255,255,255,0.38);margin-top:2px;font-weight:var(--weight-bold)' }) + '</div>' +
        '</div>' +
        sections +
      '</div>';
    }
    function compareHTML() {
      var left = PRODUCT_BY_KEY[compareState.leftKey] || null;
      var right = PRODUCT_BY_KEY[compareState.rightKey] || null;
      var v = verdict(left, right);
      var actual = left ? cloneActualProduct(left) : null;
      var expectedKey = left ? expectedCompareKey(left) : '';
      var expected = left && expectedCompareCache.has(expectedKey) ? expectedCompareCache.get(expectedKey) : (left ? projectExpectedProduct(left) : null);
      var expectedLoading = !!(left && expectedComparePending.has(expectedKey));
      var sv = scenarioVerdict(actual, expected, expectedLoading);
      var productsBodyHtml = '<div style="padding:18px 20px 20px"><div class="s5-compare-grid">' +
        columnHTML('left', left, right) +
        '<div class="s5-compare-divider" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:rgba(255,255,255,0.32);align-self:stretch"><div class="s5-compare-divider-line" style="width:1px;flex:1;background:linear-gradient(180deg,transparent,rgba(245,158,11,0.45),transparent)"></div><div style="width:34px;height:34px;border-radius:50%;border:1px solid rgba(245,158,11,0.32);background:rgba(245,158,11,0.10);color:#fbbf24;display:flex;align-items:center;justify-content:center;font-size:var(--type-micro);font-weight:var(--weight-bold);flex-shrink:0">VS</div><div class="s5-compare-divider-line" style="width:1px;flex:1;background:linear-gradient(180deg,transparent,rgba(20,184,166,0.45),transparent)"></div></div>' +
        columnHTML('right', right, left) +
        '</div><div class="s5-compare-verdict" style="margin-top:16px;border-radius:var(--dash-radius-xl);border:1px solid ' + v.color + '66;background:' + v.color + '12;padding:18px 20px;display:flex;align-items:flex-start;gap:13px">' +
        '<div style="width:38px;height:38px;border-radius:var(--dash-radius-md);background:' + v.color + '22;border:1px solid ' + v.color + '66;color:' + v.color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' +
        '<div><div style="font-size:var(--type-component-title);font-weight:var(--weight-bold);color:#fff;margin-bottom:5px">' + v.title + '</div><div data-i18n-preserve style="font-size:var(--type-label);line-height:1.75;color:rgba(255,255,255,0.72);font-weight:var(--weight-bold)">' + v.text + '</div></div>' +
        '</div></div>';
      var scenarioBodyHtml = '<div style="padding:18px 20px 20px">' +
        scenarioSelectorHTML(left) +
        '<div class="s5-compare-grid">' +
        scenarioColumnHTML(s5Txt('Actual cycle', 'الدورة الفعلية'), '#f59e0b', actual, expected, false) +
        '<div class="s5-compare-divider" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:rgba(255,255,255,0.32);align-self:stretch"><div class="s5-compare-divider-line" style="width:1px;flex:1;background:linear-gradient(180deg,transparent,rgba(245,158,11,0.45),transparent)"></div><div style="width:34px;height:34px;border-radius:50%;border:1px solid rgba(245,158,11,0.32);background:rgba(245,158,11,0.10);color:#fbbf24;display:flex;align-items:center;justify-content:center;font-size:var(--type-micro);font-weight:var(--weight-bold);flex-shrink:0">VS</div><div class="s5-compare-divider-line" style="width:1px;flex:1;background:linear-gradient(180deg,transparent,rgba(20,184,166,0.45),transparent)"></div></div>' +
        scenarioColumnHTML(s5Txt('Expected NDR cycle', 'دورة NDR المتوقعة'), '#14b8a6', expected, actual, true) +
        '</div><div class="s5-compare-verdict" style="margin-top:16px;border-radius:var(--dash-radius-xl);border:1px solid ' + sv.color + '66;background:' + sv.color + '12;padding:18px 20px;display:flex;align-items:flex-start;gap:13px">' +
        '<div style="width:38px;height:38px;border-radius:var(--dash-radius-md);background:' + sv.color + '22;border:1px solid ' + sv.color + '66;color:' + sv.color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' +
        '<div><div style="font-size:var(--type-component-title);font-weight:var(--weight-bold);color:#fff;margin-bottom:5px">' + sv.title + '</div><div style="font-size:var(--type-label);line-height:1.75;color:rgba(255,255,255,0.72);font-weight:var(--weight-bold)">' + sv.text + '</div></div>' +
        '</div></div>';
      var bodyHtml = compareState.mode === 'ndr' ? scenarioBodyHtml : productsBodyHtml;
      return '<div class="s5-compare-modal-panel" style="width:min(1180px,96vw);max-height:92vh;overflow:auto;border-radius:var(--dash-radius-xl);background:var(--dash-surface);border:1px solid rgba(255,255,255,0.11);position:relative">' +
        '<div style="position:sticky;top:0;z-index:5;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.075);background:var(--dash-surface);display:flex;align-items:center;justify-content:space-between;gap:16px;border-radius:var(--dash-radius-xl) 22px 0 0">' +
          '<div style="display:flex;align-items:center;gap:12px"><div style="width:42px;height:42px;border-radius:var(--dash-radius-lg);background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.35);color:#fbbf24;display:flex;align-items:center;justify-content:center"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M6 7l-4 7h8L6 7z"/><path d="M18 7l-4 7h8l-4-7z"/></svg></div>' +
          '<div><div style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:#fff">' + s5Txt('Product Comparison', 'مقارنة المنتجات') + '</div><div style="font-size:var(--type-caption);color:rgba(255,255,255,0.38);font-weight:var(--weight-bold);margin-top:3px">' + s5Txt('Volumes, rates, financials, and scale verdict', 'الحجم والنسب والماليات وحكم الأداء') + '</div></div></div>' +
          tabsHTML() +
          '<button id="s5-compare-close" style="width:36px;height:36px;border-radius:var(--dash-radius-md);border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.65);cursor:pointer;font-size:var(--type-metric-sm);line-height:1;display:flex;align-items:center;justify-content:center;font-family:var(--font-ui);">&times;</button>' +
        '</div>' +
        bodyHtml +
      '</div>';
    }
    function closeOpenCompareDropdowns() {
      compareModal.querySelectorAll('.s5-cmp-dd-panel').forEach(function (panel) {
        panel.style.display = 'none';
        var arrow = panel.closest('.s5-cmp-dd-wrap') && panel.closest('.s5-cmp-dd-wrap').querySelector('.s5-cmp-dd-arrow');
        if (arrow) arrow.style.transform = '';
      });
    }
    function cleanupCompareOutsideClick() {
      if (!compareOutsideClickHandler) return;
      document.removeEventListener('click', compareOutsideClickHandler);
      compareOutsideClickHandler = null;
    }
    function bindCompareInputs() {
      cleanupCompareOutsideClick();
      compareModal.querySelectorAll('.s5-compare-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
          compareState.mode = btn.getAttribute('data-mode') || 'products';
          refreshCompare();
        });
      });
      compareModal.querySelectorAll('.s5-expected-range-date').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openExpectedCompareDatePicker(btn, btn.getAttribute('data-edge') || 'from');
        });
      });
      compareModal.querySelectorAll('.s5-cmp-dd-wrap').forEach(function (wrap) {
        var side = wrap.dataset.side;
        var trigger = wrap.querySelector('.s5-cmp-dd-trigger');
        var panel = wrap.querySelector('.s5-cmp-dd-panel');
        var search = wrap.querySelector('.s5-cmp-dd-search');
        var list = wrap.querySelector('.s5-cmp-dd-list');
        var arrow = wrap.querySelector('.s5-cmp-dd-arrow');
        if (!trigger || !panel) return;

        function closePanel() {
          panel.style.display = 'none';
          if (arrow) arrow.style.transform = '';
        }
        function filterOptions(query) {
          var needle = textKey(query || '');
          if (!list) return;
          list.querySelectorAll('.s5-cmp-dd-option').forEach(function (option) {
            var haystack = option.getAttribute('data-search') || '';
            option.style.display = !needle || haystack.indexOf(needle) !== -1 ? '' : 'none';
          });
        }
        function openPanel() {
          compareModal.querySelectorAll('.s5-cmp-dd-panel').forEach(function (otherPanel) {
            if (otherPanel !== panel) {
              otherPanel.style.display = 'none';
              var otherArrow = otherPanel.closest('.s5-cmp-dd-wrap') && otherPanel.closest('.s5-cmp-dd-wrap').querySelector('.s5-cmp-dd-arrow');
              if (otherArrow) otherArrow.style.transform = '';
            }
          });
          panel.style.display = 'flex';
          if (arrow) arrow.style.transform = 'rotate(180deg)';
          if (search) {
            search.value = '';
            filterOptions('');
            search.focus();
          }
        }

        trigger.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (panel.style.display === 'flex') closePanel();
          else openPanel();
        });
        trigger.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          if (panel.style.display === 'flex') closePanel();
          else openPanel();
        });
        if (search) {
          search.addEventListener('input', function () { filterOptions(search.value); });
          search.addEventListener('click', function (e) { e.stopPropagation(); });
        }
        if (list) {
          list.querySelectorAll('.s5-cmp-dd-option').forEach(function (option) {
            option.addEventListener('mouseenter', function () {
              if (!option.classList.contains('selected')) option.style.background = 'rgba(255,255,255,0.06)';
            });
            option.addEventListener('mouseleave', function () {
              if (!option.classList.contains('selected')) option.style.background = 'transparent';
            });
            option.addEventListener('click', function (e) {
              e.stopPropagation();
              if (side === 'left') compareState.leftKey = option.getAttribute('data-key') || '';
              else compareState.rightKey = option.getAttribute('data-key') || '';
              closePanel();
              refreshCompare();
              var selectedProduct = PRODUCT_BY_KEY[compareState.leftKey] || null;
              var compareLoads = [loadBackendProductDetails([compareState.leftKey, compareState.rightKey])];
              if (compareState.mode === 'ndr' && selectedProduct) compareLoads.push(loadExpectedProductComparison(selectedProduct));
              Promise.all(compareLoads).then(function () {
                if (compareModal.style.display !== 'none') refreshCompare();
              });
            });
          });
        }
      });
      compareOutsideClickHandler = function (e) {
        if (compareModal.style.display === 'none') {
          cleanupCompareOutsideClick();
          return;
        }
        if (!compareModal.contains(e.target)) return;
        if (!e.target.closest('.s5-cmp-dd-wrap')) closeOpenCompareDropdowns();
      };
      document.addEventListener('click', compareOutsideClickHandler);
      var closeBtn = compareModal.querySelector('#s5-compare-close');
      if (closeBtn) closeBtn.addEventListener('click', closeCompare);
    }
    function refreshCompare() {
      cleanupCompareOutsideClick();
      compareModal.innerHTML = compareHTML();
      bindCompareInputs();
      if (compareState.mode === 'ndr') {
        var selectedProduct = PRODUCT_BY_KEY[compareState.leftKey] || null;
        var expectedKey = selectedProduct ? expectedCompareKey(selectedProduct) : '';
        if (selectedProduct && !expectedCompareCache.has(expectedKey) && !expectedComparePending.has(expectedKey)) {
          loadExpectedProductComparison(selectedProduct).then(function () {
            if (compareModal.style.display !== 'none' && compareState.mode === 'ndr') refreshCompare();
          });
        }
      }
    }
    refreshProductCompareModal = function () {
      if (compareModal.style.display !== 'none') refreshCompare();
    };
    function openCompare(productKey) {
      compareState.leftKey = productKey || '';
      compareState.rightKey = '';
      refreshCompare();
      loadBackendProductOptions().then(function () {
        if (compareModal.style.display !== 'none') refreshCompare();
      });
      if (compareState.leftKey) {
        loadBackendProductDetails([compareState.leftKey]).then(function () {
          if (compareModal.style.display !== 'none') refreshCompare();
        });
      }
      compareModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
    function openExpectedNdrCompare(productKey) {
      compareState.mode = 'ndr';
      openCompare(productKey || '');
    }
    if (window.DashboardProductComparisonFocusTarget === 'expected_ndr' || window.DashboardProductCalculatorFocusTarget === 'expected_ndr') {
      window.DashboardProductComparisonFocusTarget = null;
      window.DashboardProductCalculatorFocusTarget = null;
      setTimeout(function () {
        if (mountEl.isConnected && compareModal.style.display === 'none') openExpectedNdrCompare('');
      }, 0);
    }
    function closeCompare() {
      cleanupCompareOutsideClick();
      compareModal.style.display = 'none';
      document.body.style.overflow = '';
    }
    compareModal.addEventListener('click', function (e) {
      if (e.target === compareModal) closeCompare();
    });
    function onCompareKeydown(e) {
      if (e.key === 'Escape' && compareModal.style.display !== 'none') closeCompare();
    }
    document.addEventListener('keydown', onCompareKeydown);
    function bindCompareRows(root) {
      root = root || mountEl;
      root.querySelectorAll('[data-compare-open], #s5-compare-open').forEach(function (el) {
        if (el.dataset.compareBound === '1') return;
        el.dataset.compareBound = '1';
        el.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openCompare(el.dataset.productKey || '');
        });
        if (el.id === 's5-compare-open') {
          el.addEventListener('mouseenter', function () {
            el.style.transform = 'translateY(-1px)';
            el.style.boxShadow = '0 0 28px rgba(245,158,11,0.28)';
          });
          el.addEventListener('mouseleave', function () {
            el.style.transform = 'translateY(0)';
            el.style.boxShadow = '0 0 20px rgba(245,158,11,0.16)';
          });
        }
      });
    }
    window.openProductCompareModal = openCompare;
    window.openProductExpectedNdrCompareModal = openExpectedNdrCompare;
    window.s5BindProductCompareRows = bindCompareRows;
    addProductCleanup(function () {
      cleanupCompareOutsideClick();
      document.removeEventListener('keydown', onCompareKeydown);
      if (window.openProductCompareModal === openCompare) delete window.openProductCompareModal;
      if (window.openProductExpectedNdrCompareModal === openExpectedNdrCompare) delete window.openProductExpectedNdrCompareModal;
      if (window.s5BindProductCompareRows === bindCompareRows) delete window.s5BindProductCompareRows;
      if (compareModal.parentNode) compareModal.remove();
    });
  })();

  // ── Phase 5: Full Product Modal ──────────────────────────────────────────
  (function buildProductModal() {
    if (!mountEl.isConnected || mountEl._s5RenderToken !== renderToken) return;
    var currentModalProductKey = null;
    var currentModalCityPage = 1;
    
    /* Create modal overlay once */
    var MODAL_ID = 's5-product-modal';
    var existingModal = document.getElementById(MODAL_ID);
    var reuseVisibleModal = existingModal &&
      existingModal.style.display !== 'none' &&
      existingModal.dataset &&
      existingModal.dataset.productKey;
    if (existingModal && !reuseVisibleModal) existingModal.remove();

    var modal = reuseVisibleModal ? existingModal : document.createElement('div');
    currentModalProductKey = reuseVisibleModal ? existingModal.dataset.productKey : null;
    modal.id = MODAL_ID;
    modal.className = 'dash-overlay-scope';
    modal.style.cssText = [
      'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.72);',
      'font-family:var(--font-ui);direction:' + (isAr ? 'rtl' : 'ltr') + ';'
    ].join('');
    if (!modal.parentNode) document.body.appendChild(modal);

    function shouldPreserveVisibleModal() {
      var shell = document.getElementById('db-shell-mount');
      var dashboardPage = document.getElementById('page-dashboard');
      return !!(modal &&
        modal.style.display !== 'none' &&
        currentModalProductKey &&
        shell &&
        shell._dashboardActiveSection === 'products' &&
        dashboardPage &&
        dashboardPage.classList.contains('active'));
    }

    function pct(n, d) { return (+(n || 0)).toFixed(d != null ? d : 1) + '%'; }
    function num(n)     { return Math.round(n || 0).toLocaleString('en-US'); }
    function sb(score, type) { return (window.scoreBadge ? window.scoreBadge(score, type) : '<span>' + score + '</span>'); }

    function ndrColor(v) { return window.dashboardRateColor ? window.dashboardRateColor(v) : (v >= 40 ? '#22d3ee' : v >= 30 ? '#00e676' : v >= 20 ? '#f59e0b' : '#ef4444'); }
    function drColor(v)  { return window.dashboardRateColor ? window.dashboardRateColor(v) : (v >= 40 ? '#22d3ee' : v >= 30 ? '#00e676' : v >= 20 ? '#f59e0b' : '#ef4444'); }

    function modalHTML(p) {
      if (!p) return '';
      var geoD = window.dashboardGeoData;
      var gpm  = null;
      // geoProductMap keys are lowercase (aggregator normalizes them) — match that.
      var prodKey = (p.legacyKey || p.sku || p.key || p.name || '').toLowerCase();

      /* City breakdown — prefer geoProductMap (richer data), fall back to cityBreakdown */
      var cityRows = '';
      var cityPaginationHtml = '';
      if (gpm) {
        var cityEntries = [];
        // Use pre-built product index for O(1) per-city lookup instead of
        // iterating ALL cities on every modal open
        var _modalProdIndex = _getGpmProductIndex ? _getGpmProductIndex(gpm, prodKey) : null;
        var _modalCityKeys = _modalProdIndex ? Object.keys(_modalProdIndex) : Object.keys(gpm);
        _modalCityKeys.forEach(function (cityName) {
          var cell = _modalProdIndex ? _modalProdIndex[cityName] : (gpm[cityName] && gpm[cityName][prodKey]);
          if (cell && ((cell.orders || 0) > 0 || (cell.delivered || 0) > 0)) {
            var cellNdr = (cell.orders || 0) > 0 ? (cell.delivered || 0) / (cell.orders || 0) * 100 : 0;
            cellNdr = isNaN(cellNdr) ? 0 : cellNdr;
            cityEntries.push({ name: cityName, orders: cell.orders, ndr: cellNdr,
              delivered: cell.delivered || 0, commission: cell.commission || 0,
              riskScore: cell.riskScore || 0, scalingScore: cell.scalingScore || 0 });
          }
        });
        cityEntries.sort(function (a, b) { return b.orders - a.orders; });

        var MODAL_CITY_PAGE_SIZE = 5;
        var totalCities = cityEntries.length;
        var totalPages = Math.ceil(totalCities / MODAL_CITY_PAGE_SIZE);
        var startIndex = (currentModalCityPage - 1) * MODAL_CITY_PAGE_SIZE;
        var pageEntries = cityEntries.slice(startIndex, startIndex + MODAL_CITY_PAGE_SIZE);

        pageEntries.forEach(function (c) {
          var barW = Math.min(100, Math.round(c.orders / (cityEntries[0] && cityEntries[0].orders || 1) * 100));
          cityRows += '<div style="display:grid;grid-template-columns:1fr 60px 60px 70px;gap:8px;align-items:center;' +
            'padding:8px 10px;border-radius:var(--dash-radius-sm);background:rgba(255,255,255,0.03);margin-bottom:4px;">' +
            '<div>' +
              '<div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:#fff;margin-bottom:3px">' + esc(c.name) + '</div>' +
              '<div style="height:3px;background:rgba(255,255,255,0.06);border-radius:3px">' +
                '<div style="height:100%;width:' + barW + '%;background:linear-gradient(90deg,#7c3aed,#14b8a6);border-radius:3px"></div>' +
              '</div>' +
            '</div>' +
            '<div style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:rgba(255,255,255,0.7)">' + num(c.orders) + '</div>' +
            '<div style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:' + ndrColor(c.ndr) + '">' + pct(c.ndr) + '</div>' +
            '<div style="text-align:center">' + sb(c.scalingScore, 'scale') + '</div>' +
          '</div>';
        });

        if (totalPages > 1 && window.renderDashboardPagination) {
          cityPaginationHtml = '<div style="margin-top:10px;">' + window.renderDashboardPagination({
            currentPage: currentModalCityPage,
            totalPages: totalPages,
            pageButtonClass: 's5-modal-city-page-btn',
            prevClass: 's5-modal-city-prev',
            nextClass: 's5-modal-city-next',
            className: 'dash-pagination-compact s5-modal-pagination',
            infoText: ''
          }) + '</div>';
        }
      }
      // Fallback to cityBreakdown returned by backend product-details query
      if (false && !cityRows && Array.isArray(p.cityBreakdown) && p.cityBreakdown.length) {
        p.cityBreakdown.slice(0, 8).forEach(function (c) {
          var orders = Number(c.count || c.orders || 0);
          var cityNdr = Number(c.ndr || 0);
          cityRows += '<div style="display:grid;grid-template-columns:1fr 60px 60px 70px;gap:8px;align-items:center;padding:8px 10px;border-radius:var(--dash-radius-sm);background:rgba(255,255,255,0.03);margin-bottom:4px;">' +
            '<div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:#fff">' + esc(c.name || '') + '</div>' +
            '<div style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:rgba(255,255,255,0.7)">' + num(orders) + '</div>' +
            '<div style="text-align:center;font-size:var(--type-label);font-weight:var(--weight-bold);color:' + ndrColor(cityNdr) + '">' + pct(cityNdr) + '</div>' +
            '<div style="text-align:center">' + sb(c.scalingScore || 0, 'scale') + '</div>' +
          '</div>';
        });
      }

      /* Pieces breakdown (Quantity Distribution) */
      var piecesHtml = '';
      if (false && Array.isArray(p.piecesBreakdown) && p.piecesBreakdown.length) {
        var totalPieces = p.piecesBreakdown.reduce(function (s, x) { return s + (Number(x.count) || 0); }, 0) || 1;
        var maxPiece = p.piecesBreakdown.reduce(function (m, x) { return Math.max(m, Number(x.count) || 0); }, 0) || 1;
        piecesHtml = p.piecesBreakdown.map(function (item) {
          var c = Number(item.count || 0);
          var d = Number(item.delivered || 0);
          var ndrV = Number(item.ndr || (c > 0 ? (d / c * 100) : 0));
          var barW = Math.round(c / maxPiece * 100);
          var pct2 = c > 0 ? (c / totalPieces * 100).toFixed(1) + '%' : '-';
          return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">' +
            '<span style="min-width:24px;font-size:var(--type-control);font-weight:var(--weight-bold);color:#f59e0b;text-align:center">' + esc(item.qty) + 'x</span>' +
            '<div style="flex:1">' +
              '<div style="height:5px;background:rgba(255,255,255,0.07);border-radius:5px;overflow:hidden">' +
                '<div style="height:100%;width:' + barW + '%;background:linear-gradient(90deg,#a855f7,#14b8a6);border-radius:5px"></div>' +
              '</div>' +
            '</div>' +
            '<span style="min-width:36px;text-align:right;font-size:var(--type-caption);font-weight:var(--weight-bold);color:rgba(255,255,255,0.65)">' + num(c) + '</span>' +
            '<span style="min-width:38px;text-align:right;font-size:var(--type-caption);color:rgba(255,255,255,0.35)">' + pct2 + '</span>' +
            '<span style="min-width:44px;text-align:right;font-size:var(--type-caption);color:' + ndrColor(ndrV) + '">' + pct(ndrV) + '</span>' +
          '</div>';
        }).join('');
      } else if (p._backendProduct) {
        piecesHtml = '<div style="color:rgba(255,255,255,0.25);font-size:var(--type-label);font-style:italic;padding:8px 0">' +
          s5Txt('Loading details\u2026', 'جار التحميل\u2026') + '</div>';
      }

      /* Quantity x City breakdown */
      var qtyCityHtml = '';
      if (false && Array.isArray(p.quantityCityBreakdown) && p.quantityCityBreakdown.length) {
        qtyCityHtml = p.quantityCityBreakdown.slice(0, 4).map(function (item) {
          var topCities = (item.cities || []).slice(0, 3).map(function (c) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;' +
              'padding:3px 6px;border-radius:5px;background:rgba(255,255,255,0.02);margin-bottom:2px;">' +
              '<span style="font-size:var(--type-caption);color:rgba(255,255,255,0.7)">' + esc(c.name) + '</span>' +
              '<span style="font-size:var(--type-caption);font-weight:var(--weight-bold);color:#f59e0b">' + num(c.count || c.statusTotalCount) + '</span>' +
            '</div>';
          }).join('');
          return '<div style="padding:10px 12px;border-radius:var(--dash-radius-md);background:rgba(255,255,255,0.025);' +
            'border:1px solid rgba(255,255,255,0.05);margin-bottom:8px;">' +
            '<div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:#f59e0b;margin-bottom:6px">' + esc(item.qty) + 'x</div>' +
            topCities +
          '</div>';
        }).join('');
      } else if (p._backendProduct) {
        qtyCityHtml = '<div style="color:rgba(255,255,255,0.25);font-size:var(--type-label);font-style:italic;padding:8px 0">' +
          s5Txt('Loading details\u2026', 'جار التحميل\u2026') + '</div>';
      }

      /* Funnel bars */
      var rawTotal = p.totalOrderCount || p.statusTotalCount || p.placedCount || 1;
      var netTotal = p.netOrderCount || p.placedCount || p.statusTotalCount || 0;
      var funnel = [
        { label: s5Txt('Confirmed', 'مؤكد'), count: p.confirmationStatusCount || p.confirmedCount || 0, color: '#3b82f6' },
        { label: s5Txt('Pending', 'قيد الانتظار'), count: p.pendingStatusCount || p.pendingCount || 0, color: '#a855f7' },
        { label: p5Txt('funnelCanceled'), count: p.cancelStatusCount || p.canceledCount || 0, color: '#ef4444' },
        { label: s5Txt('Delivered', 'تم التسليم'),  count: p.deliveredCount || 0, color: '#00e676' },
        { label: s5Txt('In Shipping', 'قيد الشحن'),   count: p.shippingCount  || 0, color: '#14b8a6' },
        { label: p5Txt('funnelFailed'), count: p.failedCount || 0, color: '#f97316' },
      ];

      var _fIsLight = document.documentElement.getAttribute('data-theme')==='light';
      var funnelRows = funnel.map(function (f) {
        var barW = Math.round((f.count / (f.base || rawTotal)) * 100);
        return '<div style="margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;font-size:var(--type-caption);margin-bottom:3px;">' +
            '<span style="color:' + (_fIsLight ? 'rgba(30,10,60,0.6)' : 'rgba(255,255,255,0.55)') + '">' + f.label + '</span>' +
            '<span style="font-weight:var(--weight-bold);color:' + (_fIsLight ? 'rgba(15,5,30,0.9)' : '#fff') + '">' + num(f.count) + ' <span style="color:' + (_fIsLight ? 'rgba(15,5,30,0.45)' : 'rgba(255,255,255,0.35)') + ';font-weight:var(--weight-medium)">(' + barW + '%)</span></span>' +
          '</div>' +
          '<div style="height:6px;background:' + (_fIsLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)') + ';border-radius:var(--dash-radius-sm);overflow:hidden">' +
            '<div style="height:100%;width:' + barW + '%;background:' + f.color + ';border-radius:var(--dash-radius-sm)"></div>' +
          '</div>' +
        '</div>';
      }).join('');

      var ndrVal = typeof p.ndr === 'number' ? p.ndr : (p.ndrPct || 0);
      var drVal  = typeof p.drRate === 'number' ? p.drRate : (typeof p.dr === 'number' ? p.dr : (p.deliveryPct || 0));
      var cancelVal = typeof p.cancelPct === 'number' ? p.cancelPct : (p.cancel || 0);
      var cnfVal = typeof p.confirmationPct === 'number' ? p.confirmationPct : (p.confirmation || 0);
      var pendingVal = typeof p.pendingPct === 'number' ? p.pendingPct : 0;

      var cityLoadingPlaceholder = p._backendProduct && !cityRows
        ? '<div style="color:rgba(255,255,255,0.25);font-size:var(--type-label);font-style:italic;padding:8px 0">' +
          s5Txt('Loading city data\u2026', 'جار تحميل بيانات المدن\u2026') + '</div>'
        : '<div style="color:rgba(255,255,255,0.25);font-size:var(--type-label);padding:20px 0">' + s5Txt('No geographical data available', 'لا توجد بيانات جغرافية متاحة') + '</div>';

      return '<div style="background:#0c1121;border:1px solid rgba(255,255,255,0.1);border-radius:var(--dash-radius-xl);' +
        'width:min(1040px,96vw);max-height:90vh;overflow-y:auto;position:relative;">' +

        /* Header */
        '<div style="padding:24px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.07);' +
          'display:flex;align-items:flex-start;justify-content:space-between;gap:16px;' +
          'position:sticky;top:0;background:#0c1121;z-index:10;border-radius:var(--dash-radius-xl) 22px 0 0;">' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<div style="width:46px;height:46px;border-radius:var(--dash-radius-lg);background:rgba(124,58,237,0.15);' +
              'border:1px solid rgba(124,58,237,0.3);display:flex;align-items:center;justify-content:center;">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' +
            '</div>' +
            '<div>' +
              '<div data-i18n-preserve style="font-size:var(--type-section-title);font-weight:var(--weight-bold);color:#fff">' + esc(p.name || s5Txt('product', 'منتج')) + '</div>' +
              '<div style="font-size:var(--type-caption);color:var(--dash-text-faint);margin-top:3px;display:flex;align-items:center;gap:7px;flex-wrap:wrap">' + skuCopyHtml(p.sku || '', { emptyText: '-', style: 'font-size:var(--type-caption);color:var(--dash-text-faint);font-weight:var(--weight-bold)' }) + '<span>· ' + s5Txt('Rank #', 'رتبة #') + esc(p.rank || '-') + '</span></div>' +
            '</div>' +
          '</div>' +
          '<button id="s5-modal-close" style="background:rgba(255,255,255,0.07);border:none;color:var(--dash-text-muted);' +
            'font-size:var(--type-section-title);width:34px;height:34px;border-radius:var(--dash-radius-md);cursor:pointer;flex-shrink:0;' +
            'display:flex;align-items:center;justify-content:center;font-family:inherit;' +
            'line-height:1;">x</button>' +
        '</div>' +

        /* KPI bar */
        '<div class="s5-modal-kpi-grid" style="padding:20px 28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;' +
          'border-bottom:1px solid rgba(255,255,255,0.06);">' +
          [
            { label: s5Txt('Total / Net Orders', 'إجمالي / صافي الطلبات'), value: totalNetOrdersDisplay(rawTotal, netTotal),          color: '#a855f7', badge: null },
            { label: s5Txt('NDR', 'NDR'),                      value: pct(ndrVal),          color: ndrColor(ndrVal), badge: null },
            { label: s5Txt('Delivery Rate', 'معدل التسليم'),   value: pct(drVal),          color: drColor(drVal), badge: null },
            { label: s5Txt('Cancel Rate', 'معدل الإلغاء'),   value: pct(cancelVal),      color: '#ef4444', badge: null },
            { label: s5Txt('Confirm Rate', 'التأكيد'),        value: pct(cnfVal),         color: '#14b8a6', badge: null },
            { label: s5Txt('Pending Rate', 'نسبة قيد الانتظار'), value: pct(pendingVal), color: '#a855f7', badge: null },
            { label: s5Txt('Scale Index', 'مؤشر التوسع'),    value: '',                  color: '#f59e0b', badge: sb(p.scalingScore || 0, 'scale') },
            { label: p5Txt('adSpend'), value: productMoney(p.allocatedAdSpend), color: '#60a5fa', badge: null, help: p5Txt('adSpendHelp') },
            { label: p5Txt('cpa'), value: productMoney(p.cpa), color: '#a78bfa', badge: null, help: p5Txt('cpaHelp') },
            { label: p5Txt('breakEven'), value: productMoney(p.breakEvenCpa), color: '#f59e0b', badge: null, help: p5Txt('breakEvenHelp') },
            { label: p5Txt('pnl'), value: productMoney(p.profitLoss), color: p.profitLoss >= 0 ? '#00e676' : '#ef4444', badge: null, help: p5Txt('pnlHelp') },
          ].map(function (k) {
            return '<div' + (k.help ? ' title="' + attr(k.help) + '"' : '') + ' style="background:#0b1423;border:1px solid rgba(255,255,255,0.06);border-radius:var(--dash-radius-md);padding:14px 10px;text-align:center">' +
              '<div style="font-size:' + (k.badge ? '0' : (k.help ? '13' : '18')) + 'px;font-weight:var(--weight-bold);color:' + k.color + ';line-height:1;margin-bottom:6px;white-space:nowrap">' + k.value + (k.badge || '') + '</div>' +
              '<div style="font-size:var(--type-micro);color:rgba(255,255,255,0.38);font-weight:var(--weight-bold)">' + k.label + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +

        /* Body: Funnel | Cities / Quantity Distribution / Qty x City */
        '<div class="s5-modal-analysis-grid" style="padding:24px 28px;display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +

          /* Funnel */
          '<div style="background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:var(--dash-radius-lg);padding:16px 18px;">' +
            '<div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:rgba(255,255,255,0.45);margin-bottom:14px;display:flex;align-items:center;gap:6px;">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg>' +
              s5Txt('Order Funnel', 'مسار الطلبات') +
            '</div>' +
            funnelHTML(p) +
          '</div>' +

          /* City breakdown */
          '<div style="background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:var(--dash-radius-lg);padding:16px 18px;">' +
            '<div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:rgba(255,255,255,0.45);margin-bottom:14px;display:flex;align-items:center;gap:6px;">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>' +
              s5Txt('Top Cities', 'أبرز المدن') +
            '</div>' +
            citiesHTML(p) +
          '</div>' +

          /* Quantity Distribution */
          '<div style="background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:var(--dash-radius-lg);padding:16px 18px;">' +
            '<div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:rgba(255,255,255,0.45);margin-bottom:14px;display:flex;align-items:center;gap:6px;">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="6" height="18"/><rect x="9" y="8" width="6" height="13"/><rect x="16" y="13" width="6" height="8"/></svg>' +
              s5Txt('Quantity Distribution', 'توزيع الكميات') +
            '</div>' +
            piecesBreakdownHTML(p) +
          '</div>' +

          /* Top Cities by Quantity */
          '<div class="s5-modal-analysis-wide" style="background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:var(--dash-radius-lg);padding:16px 18px;">' +
            '<div style="font-size:var(--type-label);font-weight:var(--weight-bold);color:rgba(255,255,255,0.45);margin-bottom:14px;display:flex;align-items:center;gap:6px;">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
              s5Txt('Top Cities by Quantity', 'أبرز المدن حسب الكمية') +
            '</div>' +
            quantityCitiesHTML(p, {
              scope: 'modal',
              pageButtonClass: 's5-modal-qty-city-page-btn',
              prevClass: 's5-modal-qty-city-prev',
              nextClass: 's5-modal-qty-city-next',
              gridClassName: 's5-modal-qty-city-grid',
              className: 'dash-pagination-compact s5-modal-qty-city-pagination'
            }) +
          '</div>' +

        '</div>' +
      '</div>';
    }


    function refreshModal() {
      var p = PRODUCT_BY_KEY[currentModalProductKey] || null;
      if (!p) return;
      if (!modal.parentNode && shouldPreserveVisibleModal()) document.body.appendChild(modal);
      modal.innerHTML = modalHTML(p);
      bindModalCityPagination();
      var closeBtn = modal.querySelector('#s5-modal-close');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
    }
    refreshProductModal = refreshModal;

    function onModalRoiChange(settings) {
      if (!settings || modal.style.display === 'none') return;
      if (String(settings.accountId) !== String(productAccountId)) return;
      productFinancialSettings = settings;
      refreshModal();
    }
    if (window.DashboardRoiState && typeof window.DashboardRoiState.subscribe === 'function') {
      window.DashboardRoiState.subscribe(onModalRoiChange);
      addProductCleanup(function () {
        if (window.DashboardRoiState && typeof window.DashboardRoiState.unsubscribe === 'function') {
          window.DashboardRoiState.unsubscribe(onModalRoiChange);
        }
      });
    }

    function bindModalCityPagination() {
      if (window.bindDashboardPagination) {
        var product = PRODUCT_BY_KEY[currentModalProductKey] || null;
        var qtyStateKey = product ? quantityCityPageStateKey(product, 'modal') : '';
        window.bindDashboardPagination(modal, {
          pageButtonSelector: '.s5-modal-qty-city-page-btn',
          prevSelector: '.s5-modal-qty-city-prev',
          nextSelector: '.s5-modal-qty-city-next',
          onPage: function (page) {
            if (qtyStateKey) quantityCityPageByProduct[qtyStateKey] = page;
            refreshModal();
          },
          onPrev: function () {
            if (qtyStateKey) quantityCityPageByProduct[qtyStateKey] = Math.max(1, Number(quantityCityPageByProduct[qtyStateKey] || 1) - 1);
            refreshModal();
          },
          onNext: function () {
            if (qtyStateKey) quantityCityPageByProduct[qtyStateKey] = Number(quantityCityPageByProduct[qtyStateKey] || 1) + 1;
            refreshModal();
          }
        });
      }
    }

    function openModal(productKey) {
      currentModalProductKey = productKey;

      var p = PRODUCT_BY_KEY[productKey] || null;
      if (!p) return;
      quantityCityPageByProduct[quantityCityPageStateKey(p, 'modal')] = 1;

      // Show the overlay immediately (feels instant) then paint content on next frame
      modal.style.display = 'flex';
      modal.dataset.productKey = productKey;
      document.body.style.overflow = 'hidden';
      // Show a lightweight skeleton so the modal appears open right away
      modal.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:min(1040px,96vw);height:220px;background:#0c1121;border:1px solid rgba(255,255,255,0.1);border-radius:var(--dash-radius-xl)"><div style="width:32px;height:32px;border:3px solid rgba(255,255,255,0.08);border-top-color:#a855f7;border-radius:50%;animation:s5spin 0.6s linear infinite"></div></div>';

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (modal.style.display === 'none' || currentModalProductKey !== productKey) return;
          modal.innerHTML = modalHTML(p);
          var closeBtn = modal.querySelector('#s5-modal-close');
          if (closeBtn) closeBtn.addEventListener('click', closeModal);
          bindModalCityPagination();
          if (backendProductsActive && p._backendProduct) {
            loadBackendProductDetails([p.key]).then(function () {
              if (modal.style.display !== 'none' && currentModalProductKey === productKey) refreshModal();
            });
          }
        });
      });
    }

    function closeModal() {
      modal.style.display = 'none';
      delete modal.dataset.productKey;
      document.body.style.overflow = '';
    }

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });

    function onModalKeydown(e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
    }
    document.addEventListener('keydown', onModalKeydown);

    function bindModalRows(root) {
      root = root || mountEl;
      root.querySelectorAll('.s5-product-row').forEach(function (row) {
        if (row.dataset.modalBound === '1') return;
        row.dataset.modalBound = '1';
      });

      root.querySelectorAll('.s5-product-row [data-modal-open]').forEach(function (el) {
        if (el.dataset.modalBound === '1') return;
        el.dataset.modalBound = '1';
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          var row = el.closest('.s5-product-row');
          if (row) openModal(row.dataset.productKey);
        });
      });
    }
    /* Expose globally so city drawer can open it */
    window.openProductModal = openModal;
    window.s5BindProductModalRows = bindModalRows;
    if (currentModalProductKey && modal.style.display !== 'none') refreshModal();

    var modalObserver = new MutationObserver(function () {
      if (!document.body.contains(mountEl)) {
        document.removeEventListener('keydown', onModalKeydown);
        if (!shouldPreserveVisibleModal() && modal.parentNode) modal.remove();
        modalObserver.disconnect();
      }
    });
    if (mountEl.parentNode) modalObserver.observe(mountEl.parentNode, { childList: true });
    addProductCleanup(function () {
      document.removeEventListener('keydown', onModalKeydown);
      if (!shouldPreserveVisibleModal() && modal.parentNode) modal.remove();
      modalObserver.disconnect();
    });
  })();

  if (window.DashboardRoiState) {
    if (mountEl._s5RoiListener) {
      window.DashboardRoiState.unsubscribe(mountEl._s5RoiListener);
    }
    mountEl._s5RoiListener = function (settings) {
      if (ctx && ctx.sectionId && ctx.sectionId !== 'products') return;
      if (String(settings.accountId) !== String(productAccountId)) return;
      if (mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      productFinancialSettings = settings;
      if (refreshBackendProducts(true)) {
        updateProductCurrencyUIOnly();
        refreshProductModal();
        refreshProductCompareModal();
        return;
      }
      applyProductFinancials();
      listCache = null;
      listCacheKey = '';
      clearProductDetailCache();
      updateProductCurrencyUIOnly();
      refreshProductModal();
      refreshProductCompareModal();
    };
    window.DashboardRoiState.subscribe(mountEl._s5RoiListener);
    var productSettingsObserver = new MutationObserver(function () {
      if (!document.body.contains(mountEl)) {
        window.DashboardRoiState.unsubscribe(mountEl._s5RoiListener);
        mountEl._s5RoiListener = null;
        productSettingsObserver.disconnect();
      }
    });
    if (mountEl.parentNode) productSettingsObserver.observe(mountEl.parentNode, { childList: true });
    addProductCleanup(function () {
      if (mountEl._s5RoiListener) {
        window.DashboardRoiState.unsubscribe(mountEl._s5RoiListener);
        mountEl._s5RoiListener = null;
      }
      productSettingsObserver.disconnect();
    });
  }

  // ── Compact toggle ────────────────────────────────────────────────────────
  if (window.DashboardMarketingState) {
    if (mountEl._s5MarketingListener) {
      window.DashboardMarketingState.unsubscribe(mountEl._s5MarketingListener);
    }
    var productMarketingKey = productMarketingState
      ? [productMarketingState.lastSyncAt || '', productMarketingState.summary && productMarketingState.summary.adSpend || 0, productMarketingState.manualOverride ? 1 : 0].join('|')
      : '';
    mountEl._s5MarketingListener = function (status) {
      if (ctx && ctx.sectionId && ctx.sectionId !== 'products') return;
      if (String(status.accountId) !== String(productAccountId)) return;
      if (mountEl.hidden) {
        mountEl._dashboardNeedsRefresh = true;
        return;
      }
      var nextMarketingKey = [status.lastSyncAt || '', status.summary && status.summary.adSpend || 0, status.manualOverride ? 1 : 0].join('|');
      if (nextMarketingKey === productMarketingKey) return;
      productMarketingKey = nextMarketingKey;
      productMarketingState = status;
      if (refreshBackendProducts(true)) return;
      applyProductFinancials();
      listCache = null;
      listCacheKey = '';
      clearProductDetailCache();
      scheduleProductPageRender({ keepFilterBar: true });
      refreshProductModal();
      refreshProductCompareModal();
    };
    window.DashboardMarketingState.subscribe(mountEl._s5MarketingListener);
    var productMarketingObserver = new MutationObserver(function () {
      if (!document.body.contains(mountEl)) {
        window.DashboardMarketingState.unsubscribe(mountEl._s5MarketingListener);
        mountEl._s5MarketingListener = null;
        productMarketingObserver.disconnect();
      }
    });
    if (mountEl.parentNode) productMarketingObserver.observe(mountEl.parentNode, { childList: true });
    addProductCleanup(function () {
      if (mountEl._s5MarketingListener) {
        window.DashboardMarketingState.unsubscribe(mountEl._s5MarketingListener);
        mountEl._s5MarketingListener = null;
      }
      productMarketingObserver.disconnect();
    });
    if (typeof window.DashboardMarketingState.load === 'function') {
      window.DashboardMarketingState.load(productAccountId);
    }
  }

  if (window.dashboardI18n) window.dashboardI18n.apply(mountEl);
  if (window.TaagerUI) window.TaagerUI.enhance(mountEl);
}

window.renderSection5HydratedEntry = function (mountEl, data, ctx) {
  if (!mountEl) return;
  var shouldDefer = !window._dashboardInteractiveSectionsReady && !!(data && data.meta && data.meta.lazyHeavyModels);
  if (!shouldDefer) {
    renderSection5Hydrated(mountEl, data, ctx);
    mountEl.dataset.dashboardReady = 'products';
    return mountEl._dashboardSectionCleanup;
  }

  var state = { cancelled: false, started: false, frame: null, cleanup: null };
  mountEl._s5HydrationState = state;
  mountEl.innerHTML = productsHydrationSkeleton();
  delete mountEl.dataset.dashboardReady;

  function hydrateProductsPane() {
    if (state.cancelled || state.started || mountEl._s5HydrationState !== state) return;
    if (!isActiveProductsPane(mountEl)) {
      if (mountEl.isConnected) mountEl._dashboardNeedsRefresh = true;
      return;
    }
    state.started = true;
    renderSection5Hydrated(mountEl, data, ctx);
    state.cleanup = mountEl._dashboardSectionCleanup;
    if (!state.cancelled && isActiveProductsPane(mountEl)) {
      mountEl.dataset.dashboardReady = 'products';
      mountEl.dataset.s5ProductsReady = mountEl.querySelector('.s5-product-row') ? '1' : '0';
    }
  }

  state.frame = window.requestAnimationFrame
    ? window.requestAnimationFrame(hydrateProductsPane)
    : window.setTimeout(hydrateProductsPane, 0);

  return function () {
    state.cancelled = true;
    if (!state.started && state.frame != null) {
      if (window.cancelAnimationFrame && window.requestAnimationFrame) window.cancelAnimationFrame(state.frame);
      else window.clearTimeout(state.frame);
    }
    if (typeof state.cleanup === 'function') state.cleanup();
    if (mountEl._s5HydrationState === state) mountEl._s5HydrationState = null;
  };
};
