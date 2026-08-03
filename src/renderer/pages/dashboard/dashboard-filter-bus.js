/* ------------------------------------------------------------------------------
   dashboard-filter-bus.js  (T-13)
   Global pub/sub state manager for cross-section filter synchronisation.
   No DOM dependencies — pure state object with subscriber notifications.

   Exposed on window:
     DashboardFilterBus.getState()
     DashboardFilterBus.setState(patch)
     DashboardFilterBus.subscribe(fn)
     DashboardFilterBus.unsubscribe(fn)
     DashboardFilterBus.reset()
     DashboardFilterBus.MODES  — valid mapMode values
   ------------------------------------------------------------------------------ */
(function () {
  'use strict';

  /* -- Valid map display modes ----------------------------------------------- */
  var MODES = {
    ORDERS:  'orders',    // Dot size = order volume (default)
    NDR:     'ndr',       // Province heatmap by NDR%
    REVENUE: 'revenue',   // Province heatmap by earned commission
    PREPAID: 'prepaid',   // Province heatmap by prepaid%
    PRODUCT: 'product'    // City dots coloured by selected product's NDR
  };

  /* -- Default state --------------------------------------------------------- */
  var _defaultState = {
    selectedProvince: null,   // provinceId string | null
    selectedCity:     null,   // cityName string   | null
    selectedProduct:  null,   // productKey string | null  (T-22: product focus)
    paymentFilter:    'all',  // 'all' | 'prepaid' | 'cod'
    mapMode:          MODES.ORDERS,
    ndrRange:         null    // [min, max] fraction | null
  };

  var _state = Object.assign({}, _defaultState);
  var _listeners = [];

  var MS_DAY = 24 * 60 * 60 * 1000;
  var PERIOD_STORAGE_KEY = 'taager_dashboard_period';
  var DELIVERED_DATE_MODE_STORAGE_KEY = 'taager_dashboard_delivered_date_mode';
  var EXPECTED_NDR_RANGE_STORAGE_KEY = 'taager_dashboard_expected_ndr_range';
  // Taager dashboard/status/NDR migration:
  // This state selects NDR display mode. Dashboard delivery and NDR counts are
  // anchored to the selected created-date period.
  var DELIVERED_DATE_MODES = {
    ACTUAL: 'actual',
    EXPECTED: 'expected'
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function toIso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function currentYearBounds() {
    var now = new Date();
    var max = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      min: new Date(max.getFullYear(), 0, 1),
      max: max
    };
  }
  function parseIso(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
    var parts = String(value).split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ||
      d.getFullYear() !== parts[0] ||
      d.getMonth() !== parts[1] - 1 ||
      d.getDate() !== parts[2]
      ? null
      : d;
  }
  function monthId(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function presetForMonth(d) {
    var now = new Date();
    var current = new Date(now.getFullYear(), now.getMonth(), 1);
    var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var twoBack = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    var id = monthId(d);
    if (id === monthId(current)) return 'thisMonth';
    if (id === monthId(prev)) return 'prevMonth';
    if (id === monthId(twoBack)) return 'twoMonthsAgo';
    return 'month:' + id;
  }
  function rangeForMonth(year, monthNumber) {
    var start = new Date(year, monthNumber - 1, 1);
    var end = new Date(year, monthNumber, 0);
    return clampRange({ dateFrom: toIso(start), dateTo: toIso(end) });
  }
  function rangeForPreset(preset) {
    var bounds = currentYearBounds();
    var today = bounds.max;
    var start;
    var monthMatch = /^month:(\d{4})-(\d{2})$/.exec(String(preset || ''));
    if (monthMatch) return rangeForMonth(Number(monthMatch[1]), Number(monthMatch[2]));
    if (preset === 'today') start = new Date(today.getTime());
    else if (preset === 'yesterday') {
      start = new Date(today.getTime() - MS_DAY);
      today = new Date(today.getTime() - MS_DAY);
    }
    else if (preset === 'last7') start = new Date(today.getTime() - 6 * MS_DAY);
    else if (preset === 'last14') start = new Date(today.getTime() - 13 * MS_DAY);
    else if (preset === 'last30') start = new Date(today.getTime() - 29 * MS_DAY);
    else if (preset === 'prevMonth') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      today = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (preset === 'twoMonthsAgo') {
      start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      today = new Date(today.getFullYear(), today.getMonth() - 1, 0);
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    return clampRange({ dateFrom: toIso(start), dateTo: toIso(today) });
  }
  function clampRange(range) {
    var bounds = currentYearBounds();
    var min = bounds.min;
    var max = bounds.max;
    var from = parseIso(range && range.dateFrom) || min;
    var to = parseIso(range && range.dateTo) || max;
    if (from < min) from = min;
    if (from > max) from = max;
    if (to < min) to = min;
    if (to > max) to = max;
    if (to < from) to = from;
    return { dateFrom: toIso(from), dateTo: toIso(to) };
  }
  function normalizeCustomRange(range, previousRange) {
    var bounds = currentYearBounds();
    var from = parseIso(range && range.dateFrom);
    var to = parseIso(range && range.dateTo);
    if (!from || !to) return clampRange(range);
    if (from < bounds.min) from = bounds.min;
    if (from > bounds.max) from = bounds.max;
    if (to < bounds.min) to = bounds.min;
    if (to > bounds.max) to = bounds.max;
    if (to < from) {
      var previousFrom = previousRange && previousRange.dateFrom;
      var previousTo = previousRange && previousRange.dateTo;
      var fromChanged = toIso(from) !== previousFrom;
      var toChanged = toIso(to) !== previousTo;
      if (toChanged && !fromChanged) from = to;
      else to = from;
    }
    return { dateFrom: toIso(from), dateTo: toIso(to) };
  }
  function availableMonths() {
    var bounds = currentYearBounds();
    var cursor = new Date(bounds.max.getFullYear(), bounds.max.getMonth(), 1);
    var first = new Date(bounds.min.getFullYear(), bounds.min.getMonth(), 1);
    var months = [];
    while (cursor >= first) {
      months.push({
        id: monthId(cursor),
        preset: presetForMonth(cursor),
        dateFrom: rangeForPreset(presetForMonth(cursor)).dateFrom,
        dateTo: rangeForPreset(presetForMonth(cursor)).dateTo,
        year: cursor.getFullYear(),
        monthIndex: cursor.getMonth()
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    }
    return months;
  }
  function defaultPeriod() {
    return Object.assign({ preset: 'thisMonth' }, rangeForPreset('thisMonth'));
  }
  function loadPeriod() {
    try {
      var stored = JSON.parse(localStorage.getItem(PERIOD_STORAGE_KEY) || 'null');
      if (stored && stored.preset) {
        if (stored.preset === 'custom') return Object.assign({ preset: 'custom' }, normalizeCustomRange(stored));
        return Object.assign({ preset: stored.preset }, clampRange(rangeForPreset(stored.preset)));
      }
    } catch (_) {}
    return defaultPeriod();
  }
  function rangesEqual(a, b) {
    return !!a && !!b && a.dateFrom === b.dateFrom && a.dateTo === b.dateTo;
  }
  function defaultExpectedNdrRange() {
    return normalizeCustomRange(_period || defaultPeriod());
  }
  function loadExpectedNdrRange() {
    try {
      var stored = JSON.parse(localStorage.getItem(EXPECTED_NDR_RANGE_STORAGE_KEY) || 'null');
      if (stored && (stored.dateFrom || stored.dateTo)) return normalizeCustomRange(stored);
    } catch (_) {}
    return defaultExpectedNdrRange();
  }
  function normalizeDeliveredDateMode(value) {
    value = String(value || DELIVERED_DATE_MODES.ACTUAL);
    if (value === 'createdAt') return DELIVERED_DATE_MODES.EXPECTED;
    if (value === 'updatedAt') return DELIVERED_DATE_MODES.ACTUAL;
    return value === DELIVERED_DATE_MODES.EXPECTED
      ? DELIVERED_DATE_MODES.EXPECTED
      : DELIVERED_DATE_MODES.ACTUAL;
  }
  function loadDeliveredDateMode() {
    try {
      return normalizeDeliveredDateMode(localStorage.getItem(DELIVERED_DATE_MODE_STORAGE_KEY));
    } catch (_) {
      return DELIVERED_DATE_MODES.ACTUAL;
    }
  }
  var _period = loadPeriod();
  var _periodListeners = [];
  var _deliveredDateMode = loadDeliveredDateMode();
  var _deliveredDateModeListeners = [];
  var _expectedNdrRangeManual = false;
  try {
    var _storedExpectedNdrRange = JSON.parse(localStorage.getItem(EXPECTED_NDR_RANGE_STORAGE_KEY) || 'null');
    _expectedNdrRangeManual = !!(
      _storedExpectedNdrRange &&
      (_storedExpectedNdrRange.dateFrom || _storedExpectedNdrRange.dateTo) &&
      !rangesEqual(normalizeCustomRange(_storedExpectedNdrRange), normalizeCustomRange(defaultPeriod()))
    );
  } catch (_) {}
  var _expectedNdrRange = loadExpectedNdrRange();
  var _expectedNdrRangeListeners = [];
  function notifyPeriod() {
    var snap = Object.assign({}, _period);
    _periodListeners.forEach(function (fn) {
      try { fn(snap); } catch (e) { console.warn('[FilterBus] Period subscriber threw:', e); }
    });
  }
  function notifyDeliveredDateMode() {
    var mode = _deliveredDateMode;
    _deliveredDateModeListeners.forEach(function (fn) {
      try { fn(mode); } catch (e) { console.warn('[FilterBus] Delivered date mode subscriber threw:', e); }
    });
  }
  function notifyExpectedNdrRange() {
    var snap = Object.assign({}, _expectedNdrRange);
    _expectedNdrRangeListeners.forEach(function (fn) {
      try { fn(snap); } catch (e) { console.warn('[FilterBus] Expected NDR range subscriber threw:', e); }
    });
  }
  function syncExpectedNdrRangeToPeriod() {
    if (_expectedNdrRangeManual) return;
    _expectedNdrRange = normalizeCustomRange(_period);
    try {
      localStorage.setItem(EXPECTED_NDR_RANGE_STORAGE_KEY, JSON.stringify(_expectedNdrRange));
    } catch (e) {
      console.warn('[FilterBus] Unable to persist expected NDR range:', e);
    }
    notifyExpectedNdrRange();
  }

  /* -- Internal: notify all subscribers ------------------------------------- */
  function _notify() {
    var snapshot = Object.assign({}, _state);
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](snapshot); }
      catch (e) { console.warn('[FilterBus] Subscriber threw:', e); }
    }
  }

  /* -- Public API ------------------------------------------------------------ */
  window.DashboardFilterBus = {

    MODES: MODES,

    /** Returns a shallow copy of the current filter state. */
    getState: function () {
      return Object.assign({}, _state);
    },

    /**
     * Merge a partial patch into state and notify all subscribers.
     * Only keys present in _defaultState are accepted (unknown keys ignored).
     * @param {object} patch
     */
    setState: function (patch) {
      if (!patch || typeof patch !== 'object') return;
      var changed = false;
      Object.keys(patch).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(_defaultState, key)) return;
        // Validate mapMode
        if (key === 'mapMode') {
          var validModes = Object.keys(MODES).map(function (k) { return MODES[k]; });
          if (validModes.indexOf(patch[key]) === -1) {
            console.warn('[FilterBus] Invalid mapMode:', patch[key]);
            return;
          }
        }
        // Validate paymentFilter
        if (key === 'paymentFilter') {
          if (['all', 'prepaid', 'cod'].indexOf(patch[key]) === -1) {
            console.warn('[FilterBus] Invalid paymentFilter:', patch[key]);
            return;
          }
        }
        if (_state[key] !== patch[key]) {
          _state[key] = patch[key];
          changed = true;
        }
      });
      if (changed) _notify();
    },

    /**
     * Register a subscriber function.
     * Called with a shallow copy of state whenever state changes.
     * @param {function} fn
     */
    subscribe: function (fn) {
      if (typeof fn !== 'function') return;
      if (_listeners.indexOf(fn) === -1) _listeners.push(fn);
    },

    /**
     * Remove a previously registered subscriber.
     * @param {function} fn
     */
    unsubscribe: function (fn) {
      _listeners = _listeners.filter(function (l) { return l !== fn; });
    },

    /** Reset all filters to defaults and notify subscribers. */
    reset: function () {
      _state = Object.assign({}, _defaultState);
      _notify();
    }
  };

  var ROI_CURRENCIES = { SAR: true, USD: true, EGP: true, AED: true, IQD: true, OMR: true };
  var _roiListeners = [];

  function roiAccountId(accountId) {
    if (accountId) return String(accountId);
    if (window.getActiveAccountId) return String(window.getActiveAccountId() || '__all__');
    return '__all__';
  }

  function roiStorageKey(accountId) {
    return 'taager_roi_settings_' + roiAccountId(accountId);
  }

  function dashboardAccountCurrency(accountId) {
    var id = roiAccountId(accountId);
    var accounts = Array.isArray(window.dashboardAccountsList) ? window.dashboardAccountsList : [];
    var account = accounts.filter(function (item) {
      return String(item && (item.id || item.value) || '') === id;
    })[0];
    var country = account && account.taagerCountry
      ? account.taagerCountry
      : (window.dashboardActiveCountry && window.dashboardActiveCountry !== 'mixed' ? window.dashboardActiveCountry : 'sa');
    return window.TaagerCountry && window.TaagerCountry.currency ? window.TaagerCountry.currency(country) : 'SAR';
  }

  function normalizeRoiSettings(value, fallback) {
    value = value || {};
    fallback = fallback || {};
    var adSpend = Number(value.adSpend != null ? value.adSpend : fallback.adSpend);
    var egpRate = Number(value.egpRate != null ? value.egpRate : fallback.egpRate);
    var currency = String(value.currency || fallback.currency || dashboardAccountCurrency(fallback.accountId || value.accountId)).toUpperCase();
    return {
      adSpend: isFinite(adSpend) && adSpend >= 0 ? adSpend : 0,
      currency: ROI_CURRENCIES[currency] ? currency : dashboardAccountCurrency(fallback.accountId || value.accountId),
      egpRate: isFinite(egpRate) && egpRate > 0 ? egpRate : 52
    };
  }

  function loadRoiSettings(accountId, fallback) {
    var stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(roiStorageKey(accountId)) || 'null');
    } catch (e) {
      console.warn('[FilterBus] Invalid ROI settings storage:', e);
    }
    return normalizeRoiSettings(stored || fallback, fallback);
  }

  function notifyRoiSettings(settings, accountId) {
    var snapshot = Object.assign({ accountId: roiAccountId(accountId) }, settings);
    _roiListeners.forEach(function (fn) {
      try { fn(Object.assign({}, snapshot)); }
      catch (e) { console.warn('[FilterBus] ROI subscriber threw:', e); }
    });
  }

  window.DashboardRoiState = {
    currencies: Object.keys(ROI_CURRENCIES),
    get: function (accountId, fallback) {
      return loadRoiSettings(accountId, fallback);
    },
    set: function (patch, accountId, fallback) {
      var current = loadRoiSettings(accountId, fallback);
      var next = normalizeRoiSettings(Object.assign({}, current, patch || {}), current);
      var changed = next.adSpend !== current.adSpend ||
        next.currency !== current.currency ||
        next.egpRate !== current.egpRate;
      try {
        localStorage.setItem(roiStorageKey(accountId), JSON.stringify(next));
      } catch (e) {
        console.warn('[FilterBus] Unable to persist ROI settings:', e);
      }
      if (changed) notifyRoiSettings(next, accountId);
      return Object.assign({}, next);
    },
    notify: function (accountId) {
      notifyRoiSettings(this.get(accountId || '__all__'), accountId || '__all__');
    },
    subscribe: function (fn) {
      if (typeof fn === 'function' && _roiListeners.indexOf(fn) === -1) _roiListeners.push(fn);
    },
    unsubscribe: function (fn) {
      _roiListeners = _roiListeners.filter(function (listener) { return listener !== fn; });
    },
    normalize: normalizeRoiSettings
  };

  var _marketingByAccount = {};
  var _marketingListeners = [];
  var MARKETING_PLATFORMS = ['tiktok', 'snapchat', 'facebook'];
  var _marketingSyncSeq = 0;
  var _marketingSyncRequests = {};
  var _marketingLoadRequests = {};
  var _marketingQueuedForceLoads = {};
  var _marketingLoadSeq = {};
  var _marketingLoadedAt = {};
  var MARKETING_STATUS_TTL = 15 * 60 * 1000;

  function marketingNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return isFinite(parsed) ? parsed : 0;
  }

  function cleanMarketingCurrency(currency, fallback) {
    var clean = String(currency || fallback || window.dashboardActiveCurrency || 'SAR').toUpperCase();
    var fallbackClean = String(fallback || window.dashboardActiveCurrency || 'SAR').toUpperCase();
    if (window.TaagerCurrency && typeof window.TaagerCurrency.cleanCurrency === 'function') {
      clean = window.TaagerCurrency.cleanCurrency(clean, fallbackClean);
    }
    return ROI_CURRENCIES[clean] ? clean : (ROI_CURRENCIES[fallbackClean] ? fallbackClean : 'SAR');
  }

  function convertMarketingSpendAmount(amount, fromCurrency, toCurrency, egpRate) {
    var value = marketingNumber(amount);
    var from = cleanMarketingCurrency(fromCurrency, toCurrency || 'SAR');
    var to = cleanMarketingCurrency(toCurrency, from);
    if (from === to) return value;
    if (window.TaagerCurrency && typeof window.TaagerCurrency.convert === 'function') {
      return window.TaagerCurrency.convert(value, from, to);
    }
    var rates = { USD: 1, SAR: 3.75, EGP: Number(egpRate || 52) || 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };
    if (!rates[from] || !rates[to]) return value;
    return (value / rates[from]) * rates[to];
  }

  function normalizeMarketingSpendSource(source, targetCurrency, options) {
    source = source || {};
    options = options || {};
    var target = cleanMarketingCurrency(targetCurrency, options.fallbackCurrency || options.summaryCurrency || 'SAR');
    var nativeCurrency = cleanMarketingCurrency(
      source.nativeRawCurrency ||
      source.rawCurrency ||
      source.sourceCurrency ||
      source.accountCurrency ||
      source.account_currency ||
      source.currency ||
      options.sourceCurrency ||
      options.summaryCurrency ||
      target,
      target
    );
    var convertedCurrency = cleanMarketingCurrency(
      source.targetCurrency ||
      source.reportingCurrency ||
      options.summaryCurrency ||
      target,
      target
    );
    var hasNativeSpend = source.rawSpend != null && source.rawSpend !== '';
    var hasNativeAlias = !hasNativeSpend && source.nativeRawSpend != null && source.nativeRawSpend !== '';
    var hasConvertedSpend = source.convertedSpend != null && source.convertedSpend !== '';
    var hasSpend = source.spend != null && source.spend !== '';
    var hasAdSpend = source.adSpend != null && source.adSpend !== '';
    var hasCost = source.cost != null && source.cost !== '';
    var amount = 0;
    var sourceAmount = 0;
    var sourceCurrency = nativeCurrency;
    var sourceKind = 'none';

    var nativeAmount = hasNativeSpend || hasNativeAlias
      ? marketingNumber(hasNativeSpend ? source.rawSpend : source.nativeRawSpend)
      : 0;
    var convertedAmount = hasConvertedSpend ? marketingNumber(source.convertedSpend) : 0;

    if ((hasNativeSpend || hasNativeAlias) && (nativeAmount > 0 || convertedAmount <= 0)) {
      sourceAmount = nativeAmount;
      sourceCurrency = nativeCurrency;
      amount = convertMarketingSpendAmount(sourceAmount, sourceCurrency, target, options.egpRate);
      sourceKind = 'raw';
    } else if (hasConvertedSpend) {
      sourceAmount = convertedAmount;
      sourceCurrency = convertedCurrency;
      amount = convertMarketingSpendAmount(sourceAmount, sourceCurrency, target, options.egpRate);
      sourceKind = 'converted';
    } else if (hasSpend) {
      sourceAmount = marketingNumber(source.spend);
      sourceCurrency = source.rawCurrency || source.nativeRawCurrency || source.sourceCurrency || source.accountCurrency || source.account_currency || source.currency ? nativeCurrency : convertedCurrency;
      amount = convertMarketingSpendAmount(sourceAmount, sourceCurrency, target, options.egpRate);
      sourceKind = source.rawCurrency || source.nativeRawCurrency || source.sourceCurrency || source.accountCurrency || source.account_currency || source.currency ? 'raw' : 'converted';
    } else if (hasAdSpend || hasCost) {
      sourceAmount = marketingNumber(hasAdSpend ? source.adSpend : source.cost);
      sourceCurrency = convertedCurrency;
      amount = convertMarketingSpendAmount(sourceAmount, sourceCurrency, target, options.egpRate);
      sourceKind = 'converted';
    }

    return {
      spend: Number(amount.toFixed(2)),
      currency: target,
      sourceAmount: Number(sourceAmount.toFixed(2)),
      sourceCurrency: cleanMarketingCurrency(sourceCurrency, target),
      rawSpend: sourceKind === 'raw' ? Number(sourceAmount.toFixed(2)) : null,
      rawCurrency: sourceKind === 'raw' ? cleanMarketingCurrency(sourceCurrency, target) : '',
      convertedSpend: sourceKind !== 'none' ? Number(amount.toFixed(2)) : null,
      hasSpend: sourceKind !== 'none',
      sourceKind: sourceKind,
    };
  }

  function aggregateMarketingSpendSummary(summary, targetCurrency, options) {
    summary = summary || {};
    options = options || {};
    var target = cleanMarketingCurrency(targetCurrency || summary.currency || window.dashboardActiveCurrency || 'SAR', 'SAR');
    var egpRate = options.egpRate || summary.egpRate || 52;
    var sources = Array.isArray(summary.sourceBreakdown) ? summary.sourceBreakdown : [];
    var rows = [];
    var spend = 0;
    var rawSpendByCurrency = {};
    sources.forEach(function (source) {
      var row = normalizeMarketingSpendSource(source, target, {
        egpRate: egpRate,
        summaryCurrency: summary.currency || target,
      });
      if (!row.hasSpend) return;
      spend += row.spend;
      if (row.rawCurrency) {
        rawSpendByCurrency[row.rawCurrency] = (rawSpendByCurrency[row.rawCurrency] || 0) + row.rawSpend;
      }
      rows.push(Object.assign({}, source, {
        normalizedSpend: row.spend,
        normalizedCurrency: row.currency,
        displaySpend: row.sourceAmount,
        displayCurrency: row.sourceCurrency,
        displaySpendKind: row.sourceKind,
      }));
    });
    if (!rows.length && summary.adSpend != null && summary.adSpend !== '') {
      var fallbackCurrency = cleanMarketingCurrency(summary.currency || target, target);
      spend = convertMarketingSpendAmount(summary.adSpend, fallbackCurrency, target, egpRate);
    }
    Object.keys(rawSpendByCurrency).forEach(function (currency) {
      rawSpendByCurrency[currency] = Number(rawSpendByCurrency[currency].toFixed(2));
    });
    return {
      spend: Number(spend.toFixed(2)),
      currency: target,
      sourceBreakdown: rows,
      rawSpendByCurrency: rawSpendByCurrency,
      hasSourceBreakdown: rows.length > 0,
    };
  }

  window.DashboardMarketingSpend = {
    aggregateSummary: aggregateMarketingSpendSummary,
    sourceSpend: normalizeMarketingSpendSource,
    convert: convertMarketingSpendAmount,
    cleanCurrency: cleanMarketingCurrency,
  };
  function normalizeMarketingPlatform(platform) {
    platform = String(platform || 'tiktok').toLowerCase();
    return MARKETING_PLATFORMS.indexOf(platform) === -1 ? 'tiktok' : platform;
  }

  function platformLabel(platform) {
    platform = normalizeMarketingPlatform(platform);
    return platform === 'snapchat' ? 'Snapchat' : platform === 'facebook' ? 'Facebook' : 'TikTok';
  }

  function marketingAccountId(accountId) {
    return roiAccountId(accountId);
  }

  function marketingAccountLabel(account) {
    return String(account && (
      account.memberName ||
      account.easyEmail ||
      account.easy_email ||
      account.taagerEmail ||
      account.taager_email ||
      account.email ||
      account.label ||
      account.name ||
      account.id ||
      ''
    ) || '');
  }

  function marketingAccountKeys(account) {
    var keys = [];
    function push(value) {
      var key = String(value || '').trim().toLowerCase();
      if (key && keys.indexOf(key) === -1) keys.push(key);
    }
    function phoneKey(value) {
      var phone = String(value || '').replace(/\D/g, '');
      return phone ? 'phone:' + phone : '';
    }
    if (typeof account === 'string') {
      push(account);
      return keys;
    }
    if (account && account.accountType === 'static') push('static:' + String(account.id || '').trim().toLowerCase());
    var merchantId = String(account && (account.taagerAffiliateCode || account.taager_affiliate_code) || '').trim().toLowerCase();
    var country = String(account && (account.taagerCountry || account.taager_country) || 'sa').trim().toLowerCase();
    if (Array.isArray(account && account.keys)) account.keys.forEach(push);
    push(account && account.id);
    if (merchantId) push('taager:' + country + ':' + merchantId);
    push(account && phoneKey(account.taagerPhone || account.taager_phone));
    push(account && (account.taagerPhone || account.taager_phone));
    push(account && account.taagerAffiliateCode);
    push(account && account.taager_affiliate_code);
    push(account && account.taagerEmail);
    push(account && account.taager_email);
    push(account && account.easyEmail);
    push(account && account.easy_email);
    push(account && account.email);
    push(account && account.label);
    push(account && account.name);
    push(account && account.memberName);
    push(marketingAccountLabel(account));
    return keys;
  }

  function marketingStableKey(account) {
    if (account && account.accountType === 'static') return 'static:' + String(account.id || '').trim().toLowerCase();
    var keys = marketingAccountKeys(account);
    var taager = keys.filter(function (key) {
      return key.indexOf('taager:') === 0;
    })[0];
    if (taager) return taager;
    var phone = keys.filter(function (key) {
      return key.indexOf('phone:') === 0;
    })[0];
    if (phone) return phone;
    return keys.filter(function (key) {
      return key.indexOf('@') !== -1;
    })[0] || keys[1] || keys[0] || '';
  }

  function dashboardMarketingAccounts() {
    var source = Array.isArray(window.dashboardAccountsList) && window.dashboardAccountsList.length
      ? window.dashboardAccountsList
      : (Array.isArray(window._kbotAccounts) ? window._kbotAccounts : []);
    var seen = {};
    return source.map(function (account) {
      var id = String(account && (account.id || account.accountId || account.key || '') || '');
      if (!id || id === '__all__' || seen[id]) return null;
      seen[id] = true;
      return account;
    }).filter(Boolean);
  }

  function buildMarketingSyncAllSettings(accountId, platform) {
    var summary = summarizeMarketingPlatforms(accountId);
    var platformStatus = platform ? normalizeMarketingStatus(marketingBucket(accountId)[normalizeMarketingPlatform(platform)], accountId, platform) : null;
    var mappings = (platformStatus && platformStatus.mappings) || (summary && summary.mappings) || {};
    var exchangeRates = window.TaagerCurrency && typeof window.TaagerCurrency.rates === 'function'
      ? window.TaagerCurrency.rates()
      : {};
    return dashboardMarketingAccounts().map(function (account) {
      var id = String(account && (account.id || account.accountId || account.key || '') || '');
      var keys = marketingAccountKeys(account);
      var mappedKey = keys.filter(function (key) {
        return Array.isArray(mappings[key]) && mappings[key].length;
      })[0];
      var roi = window.DashboardRoiState && typeof window.DashboardRoiState.get === 'function'
        ? window.DashboardRoiState.get(id, {})
        : {};
      return {
        dashboardAccountId: id,
        dashboardAccountKey: mappedKey || marketingStableKey(account) || id,
        dashboardAccountKeys: keys,
        currency: roi.currency || dashboardAccountCurrency(id),
        egpRate: Number(roi.egpRate) || 52,
        exchangeRates: exchangeRates
      };
    });
  }

  function manualMarketingKey(accountId) {
    return 'taager_marketing_manual_spend_' + marketingAccountId(accountId);
  }

  function readManualMarketingOverride(accountId) {
    try {
      return localStorage.getItem(manualMarketingKey(accountId)) === '1';
    } catch (e) {
      return false;
    }
  }

  function marketingMappingKeys(accountId) {
    var id = marketingAccountId(accountId);
    var keys = [id, String(id).toLowerCase()];
    var accounts = Array.isArray(window.dashboardAccountsList) ? window.dashboardAccountsList : [];
    var account = accounts.filter(function (candidate) {
      return String(candidate && candidate.id || '') === id;
    })[0];
    if (account) {
      marketingAccountKeys(account).forEach(function (key) {
        if (key && keys.indexOf(key) === -1) keys.push(key);
      });
    }
    return keys.filter(function (key, index) { return key && keys.indexOf(key) === index; });
  }

  function sourceAccountSignature(accounts) {
    return (Array.isArray(accounts) ? accounts : []).map(function (account) {
      return String(account && account.id || '');
    }).filter(Boolean).sort().join('|');
  }

  function mergeSourceAccounts() {
    var byId = {};
    var out = [];
    Array.prototype.forEach.call(arguments, function (list) {
      (Array.isArray(list) ? list : []).forEach(function (account) {
        var id = String(account && account.id || '');
        if (!id) return;
        if (byId[id]) {
          byId[id] = Object.assign({}, byId[id], account);
        } else {
          byId[id] = Object.assign({}, account);
          out.push(byId[id]);
        }
      });
    });
    return out;
  }

  function mergeMarketingMappings() {
    var merged = {};
    Array.prototype.forEach.call(arguments, function (mappings) {
      if (!mappings || typeof mappings !== 'object') return;
      Object.keys(mappings).forEach(function (key) {
        merged[key] = mergeSourceAccounts(merged[key], mappings[key]);
      });
    });
    return merged;
  }

  function hasMarketingConnectionPayload(value) {
    return !!(
      value &&
      (
        value.summary ||
        (Array.isArray(value.linkedAccounts) && value.linkedAccounts.length) ||
        (Array.isArray(value.mappedAccounts) && value.mappedAccounts.length) ||
        (Array.isArray(value.availableAccounts) && value.availableAccounts.length) ||
        (Array.isArray(value.selectedSourceAccounts) && value.selectedSourceAccounts.length) ||
        (value.mappings && typeof value.mappings === 'object' && Object.keys(value.mappings).length)
      )
    );
  }

  function hasMarketingAssignedPayload(value) {
    return !!(
      value &&
      (
        value.summary ||
        (Array.isArray(value.linkedAccounts) && value.linkedAccounts.length) ||
        (Array.isArray(value.mappedAccounts) && value.mappedAccounts.length) ||
        (Array.isArray(value.selectedSourceAccounts) && value.selectedSourceAccounts.length) ||
        (value.mappings && typeof value.mappings === 'object' && Object.keys(value.mappings).some(function (key) {
          return Array.isArray(value.mappings[key]) && value.mappings[key].length;
        }))
      )
    );
  }

  function marketingAuthorizationCancelKey(accountId, platform) {
    return 'taager_marketing_authorization_cancelled_' + marketingAccountId(accountId) + '_' + normalizeMarketingPlatform(platform);
  }

  function markMarketingAuthorizationCancelled(accountId, platform) {
    try {
      localStorage.setItem(marketingAuthorizationCancelKey(accountId, platform), String(Date.now()));
    } catch (e) {}
  }

  function clearMarketingAuthorizationCancelled(accountId, platform) {
    try {
      localStorage.removeItem(marketingAuthorizationCancelKey(accountId, platform));
    } catch (e) {}
  }

  function isMarketingAuthorizationCancelled(accountId, platform) {
    try {
      return !!localStorage.getItem(marketingAuthorizationCancelKey(accountId, platform));
    } catch (e) {
      return false;
    }
  }

  function isPendingMarketingUpdate(value) {
    var status = String(value && value.status || '').toLowerCase();
    return !!(value && (status === 'pending' || value.authorizationUrl || value.awaitingAuthorization));
  }

  function isPendingOnlyMarketingAuthorization(value) {
    return isPendingMarketingUpdate(value) && !hasMarketingAssignedPayload(value);
  }

  function mergePendingMarketingUpdate(previous, value) {
    if (!previous || !hasMarketingConnectionPayload(previous) || !isPendingMarketingUpdate(value) || hasMarketingConnectionPayload(value)) {
      return value;
    }
    return Object.assign({}, previous, value, {
      status: value.status || 'pending',
      summary: previous.summary || null,
      lastSyncAt: previous.lastSyncAt || null,
      sourceAccountName: value.sourceAccountName || previous.sourceAccountName || '',
      sourceAccountId: value.sourceAccountId || previous.sourceAccountId || '',
      linkedAccounts: previous.linkedAccounts || [],
      mappedAccounts: previous.mappedAccounts || [],
      availableAccounts: previous.availableAccounts || [],
      mappings: previous.mappings || {},
      selectedSourceAccounts: previous.selectedSourceAccounts || [],
      selectedSourceAccountIds: previous.selectedSourceAccountIds || []
    });
  }

  function latestMarketingDate(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return new Date(a) > new Date(b) ? a : b;
  }

  function oldestMarketingDate(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return new Date(a) < new Date(b) ? a : b;
  }

  function normalizeMarketingStatus(value, accountId, platform) {
    value = value || {};
    platform = normalizeMarketingPlatform(platform || value.platform);
    var summary = value.summary && typeof value.summary === 'object' ? value.summary : null;
    var adSpend = summary ? Number(summary.adSpend) : NaN;
    var purchases = summary ? Number(summary.purchases) : NaN;
    var linkedAccounts = Array.isArray(value.linkedAccounts) ? value.linkedAccounts.map(function (account) {
      return { id: String(account.id || ''), name: String(account.name || ''), currency: String(account.currency || '').toUpperCase() };
    }).filter(function (account) { return !!account.id; }) : [];
    var mappedAccounts = Array.isArray(value.mappedAccounts) ? value.mappedAccounts.map(function (account) {
      return { id: String(account.id || ''), name: String(account.name || ''), currency: String(account.currency || '').toUpperCase() };
    }).filter(function (account) { return !!account.id; }) : linkedAccounts;
    var availableAccounts = Array.isArray(value.availableAccounts) ? value.availableAccounts.map(function (account) {
      return { id: String(account.id || ''), name: String(account.name || ''), currency: String(account.currency || '').toUpperCase() };
    }).filter(function (account) { return !!account.id; }) : [];
    var mappings = value.mappings && typeof value.mappings === 'object' ? value.mappings : {};
    Object.keys(mappings).forEach(function (key) {
      mappings[key] = Array.isArray(mappings[key]) ? mappings[key].map(function (account) {
        return { id: String(account.id || ''), name: String(account.name || ''), currency: String(account.currency || '').toUpperCase() };
      }).filter(function (account) { return !!account.id; }) : [];
    });
    var selectedAccounts = [];
    marketingMappingKeys(accountId).some(function (key) {
      if (!Array.isArray(mappings[key])) return false;
      selectedAccounts = mappings[key];
      return true;
    });
    if (!selectedAccounts.length && value.status === 'connected' && mappedAccounts.length) selectedAccounts = mappedAccounts;
    var normalizedSummary = summary ? Object.assign({}, summary, {
      adSpend: isFinite(adSpend) && adSpend >= 0 ? adSpend : 0,
      purchases: isFinite(purchases) && purchases >= 0 ? purchases : 0,
      purchaseMetric: String(summary.purchaseMetric || ''),
      purchaseMetricAvailable: !!summary.purchaseMetricAvailable
    }) : null;
    if (normalizedSummary) {
      normalizedSummary.campaignBreakdown = (Array.isArray(normalizedSummary.campaignBreakdown) ? normalizedSummary.campaignBreakdown : []).map(function (row) {
        var cleanRow = Object.assign({}, row);
        cleanRow.purchases = Math.max(0, Number(cleanRow.purchases) || 0);
        cleanRow.purchaseMetric = String(cleanRow.purchaseMetric || '');
        cleanRow.purchaseMetricAvailable = !!cleanRow.purchaseMetricAvailable;
        return cleanRow;
      });
      normalizedSummary.sourceBreakdown = (Array.isArray(normalizedSummary.sourceBreakdown) ? normalizedSummary.sourceBreakdown : []).map(function (row) {
        var cleanRow = Object.assign({}, row);
        cleanRow.purchases = Math.max(0, Number(cleanRow.purchases) || 0);
        cleanRow.purchaseMetric = String(cleanRow.purchaseMetric || '');
        cleanRow.purchaseMetricAvailable = !!cleanRow.purchaseMetricAvailable;
        return cleanRow;
      });
    }
    return {
      accountId: marketingAccountId(accountId),
      platform: platform,
      provider: value.provider || '',
      platformLabel: platformLabel(platform),
      status: value.status || 'disconnected',
      sourceAccountId: value.sourceAccountId || '',
      sourceAccountName: value.sourceAccountName || '',
      linkedAccounts: linkedAccounts,
      linkedAccountCount: linkedAccounts.length,
      mappedAccounts: mappedAccounts,
      availableAccounts: availableAccounts,
      mappings: mappings,
      selectedSourceAccounts: selectedAccounts,
      selectedSourceAccountIds: selectedAccounts.map(function (account) { return String(account.id || ''); }).filter(Boolean),
      claimableAccounts: Array.isArray(value.claimableAccounts) ? value.claimableAccounts.map(function (account) {
        return { id: String(account.id || ''), name: String(account.name || ''), currency: String(account.currency || '').toUpperCase() };
      }).filter(function (account) { return !!account.id; }) : [],
      diagnostics: value.diagnostics || null,
      limit: value.limit && typeof value.limit === 'object' ? Object.assign({}, value.limit) : null,
      limits: value.limits && typeof value.limits === 'object' ? Object.assign({}, value.limits) : null,
      statusCheckedAt: value.statusCheckedAt || null,
      lastSyncAt: value.lastSyncAt || null,
      summary: normalizedSummary,
      cache: value.cache && typeof value.cache === 'object' ? Object.assign({}, value.cache) : null,
      stale: !!value.stale,
      offline: !!value.offline,
      error: value.error || '',
      errorCode: value.errorCode || value.error || '',
      reconnectRequired: !!value.reconnectRequired,
      loading: !!value.loading,
      manualOverride: readManualMarketingOverride(accountId)
    };
  }

  function marketingBucket(accountId) {
    var id = marketingAccountId(accountId);
    var bucket = _marketingByAccount[id];
    if (!bucket || typeof bucket !== 'object' || bucket.platform || bucket.status || bucket.summary) {
      bucket = bucket ? { tiktok: bucket } : {};
      _marketingByAccount[id] = bucket;
    }
    return bucket;
  }

  function limitForMarketingAccount(allStatus, accountId, account) {
    var limits = allStatus && allStatus.limits && typeof allStatus.limits === 'object' ? allStatus.limits : {};
    var keys = [accountId].concat(marketingAccountKeys(account || accountId));
    var found = null;
    keys.some(function (key) {
      key = String(key || '').trim();
      if (key && limits[key]) {
        found = limits[key];
        return true;
      }
      return false;
    });
    return found;
  }

  function hydrateMarketingAccountsFromAllStatus(allStatus, platform) {
    if (!allStatus || !allStatus.mappings || typeof allStatus.mappings !== 'object') return [];
    platform = normalizeMarketingPlatform(platform || allStatus.platform);
    var knownAccounts = mergeSourceAccounts(allStatus.availableAccounts, allStatus.linkedAccounts, allStatus.mappedAccounts);
    var changedIds = [];
    dashboardMarketingAccounts().forEach(function (account) {
      var id = String(account && (account.id || account.accountId || account.key || '') || '');
      if (!id) return;
      var assigned = [];
      marketingAccountKeys(account).some(function (key) {
        if (!Array.isArray(allStatus.mappings[key])) return false;
        assigned = allStatus.mappings[key];
        return true;
      });
      var bucket = marketingBucket(id);
      var previous = normalizeMarketingStatus(bucket[platform], id, platform);
      var sameAssigned = sourceAccountSignature(previous.selectedSourceAccounts) === sourceAccountSignature(assigned);
      var authorizationPending = allStatus.status === 'pending' && !assigned.length;
      var reconnectRequired = !!allStatus.reconnectRequired;
      var nextValue = Object.assign({}, previous, {
        platform: platform,
        status: assigned.length ? 'connected' : (authorizationPending ? 'pending' : 'disconnected'),
        mappedAccounts: assigned,
        linkedAccounts: assigned.length ? assigned : [],
        linkedAccountCount: assigned.length,
        availableAccounts: assigned.length ? [] : knownAccounts,
        mappings: allStatus.mappings,
        selectedSourceAccounts: assigned,
        selectedSourceAccountIds: assigned.map(function (source) { return String(source && source.id || ''); }).filter(Boolean),
        limit: limitForMarketingAccount(allStatus, id, account) || previous.limit,
        limits: null,
        loading: false,
        error: '',
        errorCode: '',
        reconnectRequired: reconnectRequired,
        summary: sameAssigned && assigned.length ? previous.summary : null,
        lastSyncAt: sameAssigned && assigned.length ? previous.lastSyncAt : null
      });
      var next = normalizeMarketingStatus(nextValue, id, platform);
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        bucket[platform] = next;
        changedIds.push(id);
      }
    });
    return changedIds;
  }

  function allPlatformStatus(platform) {
    platform = normalizeMarketingPlatform(platform);
    var stored = marketingBucket('__all__')[platform] || null;
    var aggregate = aggregateMarketingStatusForPlatform(platform);
    if (!stored) return aggregate;
    stored = normalizeMarketingStatus(stored, '__all__', platform);
    var storedHasConnectionData =
      stored.status === 'connected' ||
      stored.status === 'pending' ||
      stored.summary ||
      stored.linkedAccounts.length ||
      stored.availableAccounts.length ||
      stored.mappedAccounts.length ||
      Object.keys(stored.mappings || {}).length;
    var aggregateHasConnectionData =
      aggregate.status === 'connected' ||
      aggregate.status === 'pending' ||
      aggregate.summary ||
      aggregate.linkedAccounts.length ||
      aggregate.availableAccounts.length ||
      aggregate.mappedAccounts.length ||
      Object.keys(aggregate.mappings || {}).length;
    var accountListSource = aggregateHasConnectionData ? aggregate : stored;
    var status = aggregate.status === 'connected' || stored.status === 'connected'
      ? 'connected'
      : (aggregate.status === 'pending' || stored.status === 'pending' || aggregate.loading || stored.loading
        ? 'pending'
        : (storedHasConnectionData || aggregateHasConnectionData ? stored.status || aggregate.status : 'disconnected'));
    return Object.assign({}, stored, aggregate, {
      accountId: '__all__',
      platform: platform,
      platformLabel: platformLabel(platform),
      status: status,
      linkedAccounts: accountListSource.linkedAccounts,
      linkedAccountCount: accountListSource.linkedAccounts.length,
      mappedAccounts: accountListSource.mappedAccounts,
      availableAccounts: accountListSource.availableAccounts,
      mappings: accountListSource.mappings,
      selectedSourceAccounts: accountListSource.selectedSourceAccounts,
      selectedSourceAccountIds: accountListSource.selectedSourceAccounts.map(function (source) {
        return String(source && source.id || '');
      }).filter(Boolean),
      claimableAccounts: accountListSource.claimableAccounts,
      diagnostics: stored.diagnostics || aggregate.diagnostics,
      limit: stored.limit || aggregate.limit,
      limits: stored.limits || aggregate.limits,
      statusCheckedAt: oldestMarketingDate(stored.statusCheckedAt, aggregate.statusCheckedAt),
      lastSyncAt: latestMarketingDate(stored.lastSyncAt, aggregate.lastSyncAt),
      summary: aggregate.summary || stored.summary,
      cache: stored.cache || aggregate.cache,
      stale: !!(stored.stale || aggregate.stale),
      offline: !!(stored.offline || aggregate.offline),
      error: [stored.error, aggregate.error].filter(Boolean).join('; '),
      errorCode: [stored.errorCode, aggregate.errorCode].filter(Boolean).join('; '),
      reconnectRequired: !!(stored.reconnectRequired || aggregate.reconnectRequired),
      loading: !!(stored.loading || aggregate.loading),
      manualOverride: readManualMarketingOverride('__all__')
    });
  }

  function aggregateMarketingStatusForPlatform(platform) {
    platform = normalizeMarketingPlatform(platform);
    var accounts = dashboardMarketingAccounts();
    var individualStatuses = accounts.map(function (acc) {
      var accId = String(acc && (acc.id || acc.accountId || acc.key || '') || '');
      var bucket = _marketingByAccount[accId];
      return bucket && bucket[platform] ? bucket[platform] : null;
    }).filter(Boolean);

    if (individualStatuses.length === 0) {
      return normalizeMarketingStatus({
        platform: platform,
        status: 'disconnected',
        summary: null
      }, '__all__', platform);
    }

    var connectedStatuses = individualStatuses.filter(function (s) { return s.status === 'connected'; });
    if (connectedStatuses.length === 0) {
      var isAnyLoading = individualStatuses.some(function (s) { return s.loading || s.status === 'pending'; });
      var errorMsgs = individualStatuses.map(function (s) { return s.error; }).filter(Boolean).join('; ');
      return normalizeMarketingStatus({
        platform: platform,
        status: isAnyLoading ? 'pending' : 'disconnected',
        error: errorMsgs,
        loading: isAnyLoading
      }, '__all__', platform);
    }

    var latestSyncAt = null;
    var oldestStatusCheckedAt = null;
    var adSpend = 0;
    var impressions = 0;
    var clicks = 0;
    var purchases = 0;
    var campaignCount = 0;
    var rowCount = 0;
    var dateFrom = '';
    var dateTo = '';
    var sourceBreakdown = [];
    var campaignBreakdown = [];

    var reportingCurrency = window.dashboardActiveCurrency || 'SAR';

    connectedStatuses.forEach(function (s) {
      if (s.lastSyncAt) {
        if (!latestSyncAt || new Date(s.lastSyncAt) > new Date(latestSyncAt)) {
          latestSyncAt = s.lastSyncAt;
        }
      }
      if (s.statusCheckedAt) {
        if (!oldestStatusCheckedAt || new Date(s.statusCheckedAt) < new Date(oldestStatusCheckedAt)) {
          oldestStatusCheckedAt = s.statusCheckedAt;
        }
      }
      var source = s.summary || {};
      var sourceSpend = aggregateMarketingSpendSummary(source, reportingCurrency, { egpRate: source.egpRate || 52 });

      adSpend += Number(sourceSpend.spend || 0);
      impressions += Number(source.impressions || 0);
      clicks += Number(source.clicks || 0);
      purchases += Number(source.purchases || 0);
      campaignCount += Number(source.campaignCount || 0);
      rowCount += Number(source.rowCount || 0);

      if (source.dateFrom && (!dateFrom || new Date(source.dateFrom) < new Date(dateFrom))) {
        dateFrom = source.dateFrom;
      }
      if (source.dateTo && (!dateTo || new Date(source.dateTo) > new Date(dateTo))) {
        dateTo = source.dateTo;
      }

      if (Array.isArray(source.sourceBreakdown)) {
        source.sourceBreakdown.forEach(function (row) {
          sourceBreakdown.push(Object.assign({}, row));
        });
      }
      if (Array.isArray(source.campaignBreakdown)) {
        source.campaignBreakdown.forEach(function (row) {
          campaignBreakdown.push(Object.assign({}, row));
        });
      }
    });

    var summary = {
      adSpend: Number(adSpend.toFixed(2)),
      currency: reportingCurrency,
      impressions: impressions,
      clicks: clicks,
      purchases: Number(purchases.toFixed(2)),
      campaignCount: campaignCount,
      rowCount: rowCount,
      dateFrom: dateFrom,
      dateTo: dateTo,
      sourceBreakdown: sourceBreakdown,
      campaignBreakdown: campaignBreakdown
    };

    var linkedAccounts = [];
    var mappings = {};
    var mappedAccounts = [];
    var availableAccounts = [];
    var selectedSourceAccounts = [];
    var claimableAccounts = [];

    individualStatuses.forEach(function (s) {
      if (Array.isArray(s.linkedAccounts)) {
        s.linkedAccounts.forEach(function (acc) {
          linkedAccounts.push(Object.assign({}, acc));
        });
      }
      if (Array.isArray(s.mappedAccounts)) {
        s.mappedAccounts.forEach(function (acc) {
          mappedAccounts.push(Object.assign({}, acc));
        });
      }
      if (Array.isArray(s.availableAccounts)) {
        s.availableAccounts.forEach(function (acc) {
          availableAccounts.push(Object.assign({}, acc));
        });
      }
      if (Array.isArray(s.selectedSourceAccounts)) {
        s.selectedSourceAccounts.forEach(function (acc) {
          selectedSourceAccounts.push(Object.assign({}, acc));
        });
      }
      if (Array.isArray(s.claimableAccounts)) {
        s.claimableAccounts.forEach(function (acc) {
          claimableAccounts.push(Object.assign({}, acc));
        });
      }
      if (s.mappings) {
        Object.keys(s.mappings).forEach(function (key) {
          mappings[key] = (mappings[key] || []).concat(s.mappings[key] || []);
        });
      }
    });

    return {
      accountId: '__all__',
      platform: platform,
      platformLabel: platformLabel(platform),
      status: 'connected',
      sourceAccountId: '',
      sourceAccountName: connectedStatuses.length + ' connected accounts',
      linkedAccounts: linkedAccounts,
      linkedAccountCount: linkedAccounts.length,
      mappedAccounts: mappedAccounts,
      availableAccounts: availableAccounts,
      mappings: mappings,
      selectedSourceAccounts: selectedSourceAccounts,
      selectedSourceAccountIds: selectedSourceAccounts.map(function (acc) { return String(acc.id || ''); }).filter(Boolean),
      claimableAccounts: claimableAccounts,
      diagnostics: null,
      limit: null,
      limits: null,
      statusCheckedAt: oldestStatusCheckedAt,
      lastSyncAt: latestSyncAt,
      summary: summary,
      cache: null,
      stale: individualStatuses.some(function (s) { return !!s.stale; }),
      offline: individualStatuses.some(function (s) { return !!s.offline; }),
      error: individualStatuses.map(function (s) { return s.error; }).filter(Boolean).join('; '),
      errorCode: individualStatuses.map(function (s) { return s.errorCode; }).filter(Boolean).join('; '),
      reconnectRequired: individualStatuses.some(function (s) { return !!s.reconnectRequired; }),
      loading: individualStatuses.some(function (s) { return !!s.loading; }),
      manualOverride: readManualMarketingOverride('__all__')
    };
  }

  function summarizeMarketingPlatforms(accountId) {
    var id = marketingAccountId(accountId);
    var statuses;
    if (id === '__all__') {
      statuses = MARKETING_PLATFORMS.map(function (platform) {
        return window.DashboardMarketingState.get('__all__', platform);
      });
    } else {
      var bucket = marketingBucket(id);
      statuses = MARKETING_PLATFORMS.map(function (platform) {
        return normalizeMarketingStatus(bucket[platform], id, platform);
      });
    }
    var activeStatuses = statuses.filter(function (status) {
      return status.status === 'connected' && status.summary && !status.manualOverride;
    });
    var connectedStatuses = statuses.filter(function (status) { return status.status === 'connected'; });
    var linkedAccounts = [];
    var mappings = {};
    var selectedSourceAccounts = [];
    var sourceBreakdown = [];
    var campaignBreakdown = [];
    var reportingCurrency = window.dashboardActiveCurrency || dashboardAccountCurrency(id);
    var summary = activeStatuses.length ? {
      adSpend: 0,
      currency: reportingCurrency,
      egpRate: 52,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      campaignCount: 0,
      rowCount: 0,
      dateFrom: '',
      dateTo: '',
      sourceBreakdown: sourceBreakdown,
      campaignBreakdown: campaignBreakdown,
      platformBreakdown: []
    } : null;
    var latestSyncAt = null;

    statuses.forEach(function (status) {
      (status.linkedAccounts || []).forEach(function (account) {
        linkedAccounts.push(Object.assign({ platform: status.platform }, account));
      });
      Object.keys(status.mappings || {}).forEach(function (key) {
        var rows = Array.isArray(status.mappings[key]) ? status.mappings[key] : [];
        mappings[key] = (mappings[key] || []).concat(rows.map(function (row) {
          return Object.assign({ platform: status.platform }, row);
        }));
      });
      selectedSourceAccounts = selectedSourceAccounts.concat((status.selectedSourceAccounts || []).map(function (row) {
        return Object.assign({ platform: status.platform }, row);
      }));
      if (status.lastSyncAt && (!latestSyncAt || new Date(status.lastSyncAt) > new Date(latestSyncAt))) {
        latestSyncAt = status.lastSyncAt;
      }
      if (!summary || !(status.status === 'connected' && status.summary && !status.manualOverride)) return;
      var source = status.summary || {};
      var sourceSpend = aggregateMarketingSpendSummary(source, summary.currency, { egpRate: source.egpRate || summary.egpRate });
      summary.adSpend += Number(sourceSpend.spend || 0);
      summary.impressions += Number(source.impressions || 0);
      summary.clicks += Number(source.clicks || 0);
      summary.purchases += Number(source.purchases || 0);
      summary.campaignCount += Number(source.campaignCount || 0);
      summary.rowCount += Number(source.rowCount || 0);
      if (source.egpRate) summary.egpRate = Number(source.egpRate) || summary.egpRate;
      if (source.dateFrom && (!summary.dateFrom || new Date(source.dateFrom) < new Date(summary.dateFrom))) summary.dateFrom = source.dateFrom;
      if (source.dateTo && (!summary.dateTo || new Date(source.dateTo) > new Date(summary.dateTo))) summary.dateTo = source.dateTo;
      (Array.isArray(source.sourceBreakdown) ? source.sourceBreakdown : []).forEach(function (row) {
        sourceBreakdown.push(Object.assign({ platform: status.platform }, row));
      });
      (Array.isArray(source.campaignBreakdown) ? source.campaignBreakdown : []).forEach(function (row) {
        campaignBreakdown.push(Object.assign({ platform: status.platform }, row));
      });
      summary.platformBreakdown.push({
        platform: status.platform,
        label: status.platformLabel,
        adSpend: Number(sourceSpend.spend || 0),
        currency: summary.currency,
        impressions: Number(source.impressions || 0),
        clicks: Number(source.clicks || 0),
        purchases: Number(source.purchases || 0),
        purchaseMetric: String(source.purchaseMetric || ''),
        purchaseMetricAvailable: !!source.purchaseMetricAvailable,
        campaignCount: Number(source.campaignCount || 0),
        rowCount: Number(source.rowCount || 0),
        lastSyncAt: status.lastSyncAt || null
      });
    });
    if (summary) {
      summary.adSpend = Number(summary.adSpend.toFixed(2));
      summary.purchases = Number(summary.purchases.toFixed(2));
    }
    return {
      accountId: id,
      platform: 'combined',
      platformLabel: 'TikTok + Snapchat + Facebook',
      platforms: statuses,
      status: connectedStatuses.length ? 'connected' : (statuses.some(function (status) { return status.loading; }) ? 'pending' : 'disconnected'),
      sourceAccountId: '',
      sourceAccountName: connectedStatuses.length ? connectedStatuses.length + ' connected marketing platforms' : '',
      linkedAccounts: linkedAccounts,
      linkedAccountCount: linkedAccounts.length,
      mappedAccounts: linkedAccounts,
      availableAccounts: [],
      mappings: mappings,
      selectedSourceAccounts: selectedSourceAccounts,
      selectedSourceAccountIds: selectedSourceAccounts.map(function (account) { return String(account.id || ''); }).filter(Boolean),
      claimableAccounts: [],
      diagnostics: null,
      limit: null,
      limits: null,
      statusCheckedAt: statuses.map(function (status) { return status.statusCheckedAt; }).filter(Boolean).sort()[0] || null,
      lastSyncAt: latestSyncAt,
      summary: summary,
      cache: null,
      stale: statuses.some(function (status) { return !!status.stale; }),
      offline: statuses.some(function (status) { return !!status.offline; }),
      error: statuses.map(function (status) { return status.error || ''; }).filter(Boolean).join('; '),
      errorCode: statuses.map(function (status) { return status.errorCode || ''; }).filter(Boolean).join('; '),
      reconnectRequired: statuses.some(function (status) { return !!status.reconnectRequired; }),
      loading: statuses.some(function (status) { return !!status.loading; }),
      manualOverride: readManualMarketingOverride(accountId)
    };
  }

  function notifyMarketing(status) {
    _marketingListeners.forEach(function (fn) {
      try { fn(Object.assign({}, status, { summary: status.summary ? Object.assign({}, status.summary) : null })); }
      catch (e) { console.warn('[FilterBus] Marketing subscriber threw:', e); }
    });
  }

  function marketingStatusSignature(status) {
    try {
      return JSON.stringify(status || null);
    } catch (e) {
      return '';
    }
  }

  function marketingLogSummary(value) {
    value = value || {};
    return {
      ok: value.ok,
      accountId: value.accountId || value.dashboardAccountId || '',
      platform: value.platform || '',
      status: value.status || '',
      error: value.error || '',
      linkedAccountCount: value.linkedAccountCount || (Array.isArray(value.linkedAccounts) ? value.linkedAccounts.length : 0),
      mappedAccountCount: Array.isArray(value.mappedAccounts) ? value.mappedAccounts.length : 0,
      availableAccountCount: Array.isArray(value.availableAccounts) ? value.availableAccounts.length : 0,
      claimableAccountCount: Array.isArray(value.claimableAccounts) ? value.claimableAccounts.length : 0,
      selectedSourceAccountCount: Array.isArray(value.selectedSourceAccounts) ? value.selectedSourceAccounts.length : 0,
      accountStatusCount: value.accountStatuses && typeof value.accountStatuses === 'object' ? Object.keys(value.accountStatuses).length : 0,
      cacheStatus: value.cache && value.cache.status || '',
      providerRequestCount: value.cache && value.cache.providerRequestCount || 0,
      stale: !!value.stale,
      offline: !!value.offline
    };
  }

  window.DashboardMarketingState = {
    platforms: MARKETING_PLATFORMS.slice(),
    get: function (accountId, platform) {
      var id = marketingAccountId(accountId);
      if (id === '__all__') {
        if (!platform) return summarizeMarketingPlatforms('__all__');
        return allPlatformStatus(platform);
      }
      if (!platform) return summarizeMarketingPlatforms(id);
      var bucket = marketingBucket(id);
      return normalizeMarketingStatus(bucket[normalizeMarketingPlatform(platform)], id, platform);
    },
    set: function (value, accountId, platform) {
      var id = marketingAccountId(accountId);
      platform = normalizeMarketingPlatform(platform || value && value.platform);
      var bucket = marketingBucket(id);
      var previous = bucket[platform] || {};
      if (value && value.ok === false) {
        if (value.reconnectRequired) {
          value = Object.assign({}, previous, value, {
            status: 'disconnected',
            loading: false,
            reconnectRequired: true,
            errorCode: value.error || 'WINDSOR_RECONNECT_REQUIRED',
            error: value.error || 'WINDSOR_RECONNECT_REQUIRED'
          });
        } else {
        var previousHasConnectedState = previous.status && previous.status !== 'disconnected' ||
          !!previous.summary ||
          (Array.isArray(previous.linkedAccounts) && previous.linkedAccounts.length > 0) ||
          (previous.mappings && Object.keys(previous.mappings).length > 0);
        value = Object.assign({}, previousHasConnectedState ? previous : {}, value, {
          loading: false,
          error: value.error || 'MARKETING_REQUEST_FAILED'
        });
        }
      }
      value = mergePendingMarketingUpdate(previous, value);
      if (previous && previous.limit && !(value && value.limit)) {
        value = Object.assign({}, value, { limit: previous.limit });
      }
      if (previous && previous.limits && !(value && value.limits)) {
        value = Object.assign({}, value, { limits: previous.limits });
      }
      if (isMarketingAuthorizationCancelled(id, platform) && isPendingOnlyMarketingAuthorization(value)) {
        value = Object.assign({}, value, {
          status: 'disconnected',
          loading: false,
          error: '',
          errorCode: '',
          awaitingAuthorization: false,
          authorizationUrl: ''
        });
      } else if (hasMarketingAssignedPayload(value) || value && value.authorizationUrl) {
        clearMarketingAuthorizationCancelled(id, platform);
      }
      var next = normalizeMarketingStatus(value, id, platform);
      if (marketingStatusSignature(previous) === marketingStatusSignature(next)) {
        return next;
      }
      bucket[platform] = next;
      var hydratedAccountIds = id === '__all__' ? hydrateMarketingAccountsFromAllStatus(next, platform) : [];
      notifyMarketing(next);
      notifyMarketing(summarizeMarketingPlatforms(id));
      hydratedAccountIds.forEach(function (accountId) {
        notifyMarketing(window.DashboardMarketingState.get(accountId, platform));
        notifyMarketing(window.DashboardMarketingState.get(accountId));
      });
      if (id !== '__all__') {
        notifyMarketing(window.DashboardMarketingState.get('__all__', platform));
        notifyMarketing(window.DashboardMarketingState.get('__all__'));
      }
      return next;
    },
    setLoading: function (loading, accountId, platform) {
      var current = this.get(accountId, platform);
      current.loading = !!loading;
      if (loading) {
        current.error = '';
        current.errorCode = '';
        current.offline = false;
      }
      try {
        console.info('[Marketing][Store] loading', {
          accountId: marketingAccountId(accountId),
          platform: normalizeMarketingPlatform(platform || current.platform),
          loading: !!loading,
          status: current.status || '',
          error: current.error || ''
        });
      } catch (e) {}
      return this.set(current, accountId, platform);
    },
    beginAuthorization: function (accountId, platform) {
      var id = marketingAccountId(accountId);
      platform = normalizeMarketingPlatform(platform);
      clearMarketingAuthorizationCancelled(id, platform);
      if (id === '__all__') {
        dashboardMarketingAccounts().forEach(function (account) {
          var childId = String(account && (account.id || account.accountId || account.key || '') || '');
          if (childId) clearMarketingAuthorizationCancelled(childId, platform);
        });
      }
    },
    cancelAuthorization: function (accountId, platform) {
      var id = marketingAccountId(accountId);
      platform = normalizeMarketingPlatform(platform);
      markMarketingAuthorizationCancelled(id, platform);
      var loadKey = id + '|' + platform;
      _marketingLoadSeq[loadKey] = Number(_marketingLoadSeq[loadKey] || 0) + 1;
      delete _marketingLoadedAt[loadKey];
      if (id !== '__all__') {
        var allLoadKey = '__all__|' + platform;
        _marketingLoadSeq[allLoadKey] = Number(_marketingLoadSeq[allLoadKey] || 0) + 1;
        delete _marketingLoadedAt[allLoadKey];
      } else {
        dashboardMarketingAccounts().forEach(function (account) {
          var childId = String(account && (account.id || account.accountId || account.key || '') || '');
          if (!childId) return;
          markMarketingAuthorizationCancelled(childId, platform);
          var childLoadKey = childId + '|' + platform;
          _marketingLoadSeq[childLoadKey] = Number(_marketingLoadSeq[childLoadKey] || 0) + 1;
          delete _marketingLoadedAt[childLoadKey];
          var childBucket = marketingBucket(childId);
          var childCurrent = normalizeMarketingStatus(childBucket[platform], childId, platform);
          if (childCurrent.status !== 'pending' && !childCurrent.loading) return;
          var childHasPayload = hasMarketingAssignedPayload(childCurrent);
          childBucket[platform] = normalizeMarketingStatus(Object.assign({}, childCurrent, {
            status: childHasPayload && !childCurrent.reconnectRequired ? 'connected' : 'disconnected',
            loading: false,
            error: childCurrent.reconnectRequired ? childCurrent.error : '',
            errorCode: childCurrent.reconnectRequired ? childCurrent.errorCode : '',
            awaitingAuthorization: false,
            authorizationUrl: ''
          }), childId, platform);
          notifyMarketing(childBucket[platform]);
          notifyMarketing(summarizeMarketingPlatforms(childId));
        });
      }
      var current = this.get(id, platform);
      var hasPayload = hasMarketingAssignedPayload(current);
      var next = Object.assign({}, current, {
        status: hasPayload && !current.reconnectRequired ? 'connected' : 'disconnected',
        loading: false,
        error: current.reconnectRequired ? current.error : '',
        errorCode: current.reconnectRequired ? current.errorCode : '',
        reconnectRequired: !!current.reconnectRequired,
        awaitingAuthorization: false,
        authorizationUrl: ''
      });
      return this.set(next, id, platform);
    },
    invalidate: function (accountId, platform) {
      var id = marketingAccountId(accountId);
      var self = this;
      if (!platform) {
        MARKETING_PLATFORMS.forEach(function (item) { self.invalidate(id, item); });
        return;
      }
      platform = normalizeMarketingPlatform(platform);
      var loadKey = id + '|' + platform;
      _marketingLoadSeq[loadKey] = Number(_marketingLoadSeq[loadKey] || 0) + 1;
      delete _marketingLoadedAt[loadKey];
      if (id !== '__all__') {
        var allLoadKey = '__all__|' + platform;
        _marketingLoadSeq[allLoadKey] = Number(_marketingLoadSeq[allLoadKey] || 0) + 1;
        delete _marketingLoadedAt[allLoadKey];
      } else {
        dashboardMarketingAccounts().forEach(function (account) {
          var accId = String(account && (account.id || account.accountId || account.key || '') || '');
          if (!accId) return;
          var accountLoadKey = accId + '|' + platform;
          _marketingLoadSeq[accountLoadKey] = Number(_marketingLoadSeq[accountLoadKey] || 0) + 1;
          delete _marketingLoadedAt[accountLoadKey];
        });
      }
    },
    useManualSpend: function (manual, accountId) {
      var id = marketingAccountId(accountId);
      try { localStorage.setItem(manualMarketingKey(id), manual ? '1' : '0'); } catch (e) {}
      notifyMarketing(summarizeMarketingPlatforms(id));
      return this.get(id);
    },
    isSyncedSpendActive: function (accountId) {
      var current = this.get(accountId);
      return current.status === 'connected' && !!current.summary && !current.manualOverride;
    },
    load: function (accountId, platform, options) {
      var id = marketingAccountId(accountId);
      if (id === '__all__') {
        var self = this;
        if (!platform) {
          return Promise.all(MARKETING_PLATFORMS.map(function (item) {
            return self.load('__all__', item, options).catch(function () { return null; });
          })).then(function () {
            return self.get('__all__');
          });
        }
      }
      if (!platform) {
        var selfAll = this;
        return Promise.all(MARKETING_PLATFORMS.map(function (item) {
          return selfAll.load(id, item, options).catch(function () { return null; });
        })).then(function () { return selfAll.get(id); });
      }
      platform = normalizeMarketingPlatform(platform);
      options = options || {};
      var loadKey = id + '|' + platform;
      var current = this.get(id, platform);
      var checkedAt = current.statusCheckedAt ? new Date(current.statusCheckedAt).getTime() : 0;
      var providerStatusFresh = checkedAt > 0 && Date.now() - checkedAt < MARKETING_STATUS_TTL;
      var shouldRevalidate = (current.status === 'connected' || current.status === 'pending') && !providerStatusFresh;
      if (!options.force && !options.revalidate && _marketingLoadedAt[loadKey] &&
          Date.now() - _marketingLoadedAt[loadKey] < MARKETING_STATUS_TTL && !shouldRevalidate) {
        return Promise.resolve(current);
      }
      if (_marketingLoadRequests[loadKey]) {
        if (!options.force) return _marketingLoadRequests[loadKey];
        if (!_marketingQueuedForceLoads[loadKey]) {
          var queuedOptions = Object.assign({}, options, { force: true });
          var queuedSelf = this;
          _marketingQueuedForceLoads[loadKey] = _marketingLoadRequests[loadKey].catch(function () {
            return null;
          }).then(function () {
            delete _marketingQueuedForceLoads[loadKey];
            return queuedSelf.load(id, platform, queuedOptions);
          });
        }
        return _marketingQueuedForceLoads[loadKey];
      }
      var useSaudiIPickNative = (platform === 'snapchat' || platform === 'tiktok') &&
        current.provider === 'saudiipick' &&
        window.api &&
        typeof window.api.getSaudiIPickMarketingStatus === 'function';
      if (!useSaudiIPickNative && (!window.api || typeof window.api.getMarketingStatus !== 'function')) {
        return Promise.resolve(current);
      }
      var requestMode = options.force ? 'force' : (options.revalidate ? 'revalidate' : 'cached');
      var requestSeq = Number(_marketingLoadSeq[loadKey] || 0);
      // Even a local cached lookup is asynchronous across IPC. Mark it as
      // resolving so spend-derived UI never flashes a manual/default value
      // while the connection state is still unknown.
      if (!options.background) this.setLoading(true, id, platform);
      var self = this;
      console.info('[Marketing][Store] status request', { accountId: id, platform: platform, mode: requestMode });
      var statusRequest = useSaudiIPickNative
        ? window.api.getSaudiIPickMarketingStatus(id, platform, { mode: requestMode })
        : window.api.getMarketingStatus(id, platform, { mode: requestMode });
      _marketingLoadRequests[loadKey] = statusRequest.then(function (response) {
        console.info('[Marketing][Store] status response', marketingLogSummary(response));
        if (Number(_marketingLoadSeq[loadKey] || 0) !== requestSeq) return self.get(id, platform);
        _marketingLoadedAt[loadKey] = Date.now();
        var next = self.set(response && response.ok ? response : Object.assign({}, response || {}, {
          ok: false,
          error: response && response.error ? response.error : 'STATUS_UNAVAILABLE'
        }), id, platform);
        var nextCheckedAt = next.statusCheckedAt ? new Date(next.statusCheckedAt).getTime() : 0;
        var nextIsStale = !nextCheckedAt || Date.now() - nextCheckedAt >= MARKETING_STATUS_TTL;
        var shouldBackgroundRevalidate = requestMode === 'cached' && (
          ((next.status === 'connected' || next.status === 'pending') && nextIsStale) ||
          next.status === 'disconnected'
        );
        if (shouldBackgroundRevalidate) {
          setTimeout(function () {
            self.load(id, platform, { revalidate: true, background: true }).catch(function () {});
          }, 0);
        }
        return next;
      }).catch(function (error) {
        console.error('[Marketing][Store] status failed', error);
        if (Number(_marketingLoadSeq[loadKey] || 0) !== requestSeq) return self.get(id, platform);
        return self.set({ ok: false, error: error.message || String(error), platform: platform }, id, platform);
      }).finally(function () {
        delete _marketingLoadRequests[loadKey];
      });
      return _marketingLoadRequests[loadKey];
    },
    sync: function (accountId, range, platform) {
      var id = marketingAccountId(accountId);
      if (!platform) {
        var selfAll = this;
        var candidates = MARKETING_PLATFORMS.filter(function (item) {
          var current = selfAll.get(id, item);
          return current.status === 'connected' && (
            id === '__all__' ||
            (Array.isArray(current.selectedSourceAccountIds) && current.selectedSourceAccountIds.length) ||
            (current.mappings && Object.keys(current.mappings).length)
          );
        });
        if (!candidates.length) candidates = MARKETING_PLATFORMS.filter(function (item) {
          return selfAll.get(id, item).status === 'connected';
        });
        if (!candidates.length) return Promise.resolve(selfAll.get(id));
        return Promise.all(candidates.map(function (item) {
          return selfAll.sync(id, range, item).catch(function () { return null; });
        })).then(function () { return selfAll.get(id); });
      }
      platform = normalizeMarketingPlatform(platform);
      if (id !== '__all__' && !(range && Array.isArray(range.sourceAccounts))) {
        var currentStatus = this.get(id, platform);
        var sourceAccounts = (currentStatus && currentStatus.selectedSourceAccounts || []).map(function (acc) {
          return { id: acc.id, currency: acc.currency };
        });
        range = Object.assign({}, range || {}, { sourceAccounts: sourceAccounts });
      }
      range = Object.assign({ mode: 'incremental' }, range || {});
      var currentForSync = this.get(id, platform);
      var useSaudiIPickNativeSync = (platform === 'snapchat' || platform === 'tiktok') &&
        currentForSync.provider === 'saudiipick' &&
        window.api &&
        typeof window.api.syncSaudiIPickMarketingData === 'function';
      if (!useSaudiIPickNativeSync && (!window.api || typeof window.api.syncMarketingData !== 'function')) {
        return Promise.resolve(this.set({ ok: false, error: 'SYNC_UNAVAILABLE', platform: platform }, id, platform));
      }
      this.setLoading(true, id, platform);
      var self = this;
      var requestKey = id + '|' + platform;
      var requestSeq = ++_marketingSyncSeq;
      _marketingSyncRequests[requestKey] = requestSeq;
      console.info('[Marketing][Store] sync request', { accountId: id, platform: platform, range: range || {}, requestSeq: requestSeq });
      if (id === '__all__' && typeof window.api.syncAllMarketingData === 'function') {
        var allRange = Object.assign({}, range || {}, {
          accountSettings: Array.isArray(range && range.accountSettings) && range.accountSettings.length
            ? range.accountSettings
            : buildMarketingSyncAllSettings(id, platform)
        });
        return window.api.syncAllMarketingData(platform, allRange).then(function (response) {
          console.info('[Marketing][Store] sync_all response', marketingLogSummary(response));
          if (_marketingSyncRequests[requestKey] !== requestSeq) return self.get(id, platform);
          if (response && response.ok && response.accountStatuses) {
            Object.keys(response.accountStatuses).forEach(function (accountKey) {
              self.set(response.accountStatuses[accountKey], accountKey, platform);
            });
          }
          var next = self.set(response && response.ok ? response : Object.assign({}, response || {}, {
            ok: false,
            error: response && response.error ? response.error : 'SYNC_FAILED'
          }), id, platform);
          if (response && response.ok && window.DashboardRoiState && typeof window.DashboardRoiState.notify === 'function') {
            window.DashboardRoiState.notify(id);
          }
          return next;
        }).catch(function (error) {
          console.error('[Marketing][Store] sync_all failed', error);
          if (_marketingSyncRequests[requestKey] !== requestSeq) return self.get(id, platform);
          return self.set({ ok: false, error: error.message || String(error), platform: platform }, id, platform);
        });
      }
      var syncRequest = useSaudiIPickNativeSync
        ? window.api.syncSaudiIPickMarketingData(id, platform, range || {})
        : window.api.syncMarketingData(id, platform, range || {});
      return syncRequest.then(function (response) {
        console.info('[Marketing][Store] sync response', marketingLogSummary(response));
        if (_marketingSyncRequests[requestKey] !== requestSeq) return self.get(id, platform);
        var next = self.set(response && response.ok ? response : Object.assign({}, response || {}, {
          ok: false,
          error: response && response.error ? response.error : 'SYNC_FAILED'
        }), id, platform);
        if (response && response.ok && window.DashboardRoiState && typeof window.DashboardRoiState.notify === 'function') {
          window.DashboardRoiState.notify(id);
        }
        return next;
      }).catch(function (error) {
        console.error('[Marketing][Store] sync failed', error);
        if (_marketingSyncRequests[requestKey] !== requestSeq) return self.get(id, platform);
        return self.set({ ok: false, error: error.message || String(error), platform: platform }, id, platform);
      });
    },
    subscribe: function (fn) {
      if (typeof fn === 'function' && _marketingListeners.indexOf(fn) === -1) _marketingListeners.push(fn);
    },
    unsubscribe: function (fn) {
      _marketingListeners = _marketingListeners.filter(function (listener) { return listener !== fn; });
    }
  };

  window.DashboardPeriodState = {
    get: function () { return Object.assign({}, _period); },
    setPreset: function (preset) {
      _period = preset === 'custom'
        ? Object.assign({ preset: 'custom' }, clampRange(_period))
        : Object.assign({ preset: preset }, clampRange(rangeForPreset(preset)));
      localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(_period));
      syncExpectedNdrRangeToPeriod();
      if (window.invalidateDashboardCache) window.invalidateDashboardCache();
      notifyPeriod();
    },
    setCustomRange: function (dateFrom, dateTo) {
      _period = Object.assign({ preset: 'custom' }, normalizeCustomRange({ dateFrom: dateFrom, dateTo: dateTo }, _period));
      localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(_period));
      syncExpectedNdrRangeToPeriod();
      if (window.invalidateDashboardCache) window.invalidateDashboardCache();
      notifyPeriod();
    },
    subscribe: function (fn) {
      if (typeof fn === 'function' && _periodListeners.indexOf(fn) === -1) _periodListeners.push(fn);
    },
    unsubscribe: function (fn) {
      _periodListeners = _periodListeners.filter(function (l) { return l !== fn; });
    },
    rangeForPreset: rangeForPreset,
    clampRange: clampRange,
    availableMonths: availableMonths,
    minDate: function () {
      return toIso(currentYearBounds().min);
    },
    maxDate: function () {
      return toIso(currentYearBounds().max);
    }
  };

  window.DashboardDeliveredDateState = {
    MODES: DELIVERED_DATE_MODES,
    get: function () { return _deliveredDateMode; },
    set: function (mode) {
      var next = normalizeDeliveredDateMode(mode);
      if (next === _deliveredDateMode) return _deliveredDateMode;
      _deliveredDateMode = next;
      try {
        localStorage.setItem(DELIVERED_DATE_MODE_STORAGE_KEY, _deliveredDateMode);
      } catch (e) {
        console.warn('[FilterBus] Unable to persist delivered date mode:', e);
      }
      if (window.invalidateDashboardCache) window.invalidateDashboardCache();
      notifyDeliveredDateMode();
      return _deliveredDateMode;
    },
    subscribe: function (fn) {
      if (typeof fn === 'function' && _deliveredDateModeListeners.indexOf(fn) === -1) _deliveredDateModeListeners.push(fn);
    },
    unsubscribe: function (fn) {
      _deliveredDateModeListeners = _deliveredDateModeListeners.filter(function (l) { return l !== fn; });
    },
    normalize: normalizeDeliveredDateMode
  };

  window.DashboardExpectedNdrRangeState = {
    get: function () { return Object.assign({}, _expectedNdrRange); },
    setRange: function (dateFrom, dateTo) {
      _expectedNdrRangeManual = true;
      _expectedNdrRange = normalizeCustomRange({ dateFrom: dateFrom, dateTo: dateTo }, _expectedNdrRange);
      try {
        localStorage.setItem(EXPECTED_NDR_RANGE_STORAGE_KEY, JSON.stringify(_expectedNdrRange));
      } catch (e) {
        console.warn('[FilterBus] Unable to persist expected NDR range:', e);
      }
      if (window.invalidateDashboardCache) window.invalidateDashboardCache();
      notifyExpectedNdrRange();
      return Object.assign({}, _expectedNdrRange);
    },
    subscribe: function (fn) {
      if (typeof fn === 'function' && _expectedNdrRangeListeners.indexOf(fn) === -1) _expectedNdrRangeListeners.push(fn);
    },
    unsubscribe: function (fn) {
      _expectedNdrRangeListeners = _expectedNdrRangeListeners.filter(function (l) { return l !== fn; });
    }
  };

  window.DashboardSubscriptionDiagnostics = {
    snapshot: function () {
      return {
        filters: _listeners.length,
        roi: _roiListeners.length,
        marketing: _marketingListeners.length,
        period: _periodListeners.length,
        deliveredDate: _deliveredDateModeListeners.length,
        expectedNdrRange: _expectedNdrRangeListeners.length
      };
    }
  };

})();
