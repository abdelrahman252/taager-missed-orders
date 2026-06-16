/* ══════════════════════════════════════════════════════════════════════════════
   section-product-matrix.js  (T-23)
   Product Insight Table — displays top products with their overall performance 
   and highlights their best and worst-performing cities.

   Exposed on window:
     window.renderProductMatrix(mountEl, geoData, filterBus?)

   Depends on:
     window.CityIntelligenceDrawer.open()        — T-21
     window.DashboardFilterBus                   — T-13
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function getIsAr() {
    return window.dashboardI18n ? window.dashboardI18n.currentLocale === 'ar' : true;
  }
  function pick(en, ar) {
    var value = window.dashboardI18n && window.dashboardI18n.pick
      ? window.dashboardI18n.pick(en, ar)
      : (getIsAr() ? ar : en);
    return String(value == null ? '' : value)
      .replace(/\bTaager Profit\b/g, 'Profit')
      .replace(/\bTaager profit\b/g, 'profit')
      .replace(/\bTiger Profit\b/g, 'Profit')
      .replace(/\bTiger profit\b/g, 'profit')
      .replace(/ربح تاجر/g, 'الربح');
  }
  function s6Txt(en, ar) { return pick(en, ar); }
  function sTx(en, ar) { return pick(en, ar); }
  function tx(en, ar) { return pick(en, ar); }
  function dashText(en, ar) { return pick(en, ar); }

  var PAGE_SIZE = 5;
  var currentPage = 0;
  var productSearchQuery = '';

  function normalizeProductSearch(value) {
    return String(value || '')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .trim()
      .toLowerCase();
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function pctValue(value, decimals) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    return n.toFixed(decimals == null ? 2 : decimals)
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '');
  }

  function getAllProducts(geoData) {
    var rankedList = (geoData && geoData.products && geoData.products.rankedList) || [];
    return rankedList.slice().sort(function (a, b) { return (b.commission || 0) - (a.commission || 0); });
  }

  function renderTable(wrapper, geoData, provFilter) {
    var unfilteredProducts = getAllProducts(geoData);
    var activeCurrency = (geoData && geoData.meta && geoData.meta.activeCurrency) || window.dashboardActiveCurrency || 'SAR';
    var query = normalizeProductSearch(productSearchQuery);
    var allProducts = query
      ? unfilteredProducts.filter(function (p) {
          return normalizeProductSearch([p.name, p.sku, p.key].join(' ')).indexOf(query) !== -1;
        })
      : unfilteredProducts;
    var geoMap = (geoData && geoData.geo && geoData.geo.geoProductMap) || {};

    var totalProducts = allProducts.length;
    var totalPages = Math.ceil(totalProducts / PAGE_SIZE);
    
    if (currentPage >= totalPages && totalPages > 0) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;

    var startIdx = currentPage * PAGE_SIZE;
    var endIdx = startIdx + PAGE_SIZE;
    var pageProducts = allProducts.slice(startIdx, endIdx);

    // Clear previous contents
    wrapper.innerHTML = '';

    var titleBar = document.createElement('div');
    titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap';
    titleBar.innerHTML =
      '<div style="font-size:13px;font-weight:800;color:rgba(255,255,255,0.85)">' +
        sTx('📊 Performance of Products in Cities', '📊 أداء المنتجات في المدن') +
      '</div>' +
      '<input id="spm-product-search" type="text" value="' + escapeAttr(productSearchQuery) + '" placeholder="' + sTx('Search product name or SKU...', 'Search product name or SKU...') + '" style="' +
        'flex:1;min-width:220px;max-width:360px;background:#0b1120;border:1px solid rgba(255,255,255,0.1);border-radius:10px;' +
        'color:#fff;font-family:Cairo,sans-serif;font-size:12px;padding:8px 12px;outline:none;box-sizing:border-box;transition:border-color 0.2s;" />' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.3)">' +
        sTx('Total ', 'إجمالي ') + totalProducts + sTx(' products', ' منتجات') +
        (query ? ' <span style="color:rgba(255,255,255,0.18)">/ ' + unfilteredProducts.length + '</span>' : '') +
        (provFilter ? ' · <span style="color:#a855f7">' + sTx('Region Filter Active', 'فلتر المنطقة مُفعّل') + '</span>' : '') +
      '</div>';
    wrapper.appendChild(titleBar);

    var searchInput = titleBar.querySelector('#spm-product-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        productSearchQuery = searchInput.value;
        currentPage = 0;
        renderTable(wrapper, geoData, provFilter);
        var nextInput = wrapper.querySelector('#spm-product-search');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
      searchInput.addEventListener('focus', function () { searchInput.style.borderColor = '#14b8a6'; });
      searchInput.addEventListener('blur', function () { searchInput.style.borderColor = 'rgba(255,255,255,0.1)'; });
    }

    if (totalProducts === 0) {
      var noData = document.createElement('div');
      noData.style.cssText = 'padding:24px;text-align:center;color:rgba(255,255,255,0.3);font-size:13px';
      noData.innerHTML = sTx('Insufficient data to display performance', 'لا توجد بيانات كافية لعرض الأداء');
      wrapper.appendChild(noData);
      return;
    }

    var table = document.createElement('div');
    table.style.cssText = 'width:100%;min-width:750px;display:flex;flex-direction:column;gap:8px;';
    
    // Header
    table.innerHTML += '<div style="display:grid;grid-template-columns:2.5fr 0.8fr 0.8fr 1fr 1.25fr 1.25fr;gap:10px;padding:0 12px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);flex-shrink:0">' +
      '<div>' + sTx('Product', 'المنتج') + '</div><div style="text-align:center">' + sTx('Orders', 'الطلبات') + '</div><div style="text-align:center;color:#00e676">' + sTx('Net Orders', 'صافي الطلبات') + '</div><div style="text-align:center">' + sTx('Delivery', 'التسليم') + '</div><div style="text-align:center">' + sTx('Best City (NDR)', 'أفضل مدينة (NDR)') + '</div><div style="text-align:center">' + sTx('Worst City (NDR)', 'أسوأ مدينة (NDR)') + '</div>' +
    '</div>';

    pageProducts.forEach(function(p) {
      var productKey = (p.sku || p.name || '').toLowerCase();
      var validCities = [];
      Object.keys(geoMap).forEach(function(cityName) {
        if (provFilter) {
          var cs = (geoData && geoData.geo && geoData.geo.cityStats && geoData.geo.cityStats[cityName]) || {};
          if (cs.provinceId !== provFilter) return;
        }
        var cell = geoMap[cityName][productKey];
        if (cell && cell.orders > 0) {
          validCities.push({ name: cityName, ndr: cell.ndr, dr: cell.dr, orders: cell.orders, delivered: cell.delivered || 0 });
        }
      });
      
      var qualifiedCities = validCities.filter(function(c) { return c.orders >= 5; });
      var pool = qualifiedCities.length > 0 ? qualifiedCities : validCities;
      
      var bestCity = null, worstCity = null;
      if (pool.length > 0) {
        pool.sort(function(a, b) { return b.ndr - a.ndr; });
        bestCity = pool[0];
        worstCity = pool[pool.length - 1];
        if (pool.length === 1) {
          worstCity = null;
        }
      }

      var nameStr = p.name || p.sku || '؟';
      // Removed truncation to show full name
      var nameHtml = '<div data-i18n-preserve style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.85);word-break:break-word" title="' + nameStr + '">' + nameStr + '</div>';
      var skuHtml = (p.sku && p.sku !== p.name) ? '<div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.4);word-break:break-all;margin-top:2px" title="' + p.sku + '">' + p.sku + '</div>' : '';
      
      var overallDr = p.deliveryPct || 0;
      var drColor = window.dashboardRateColor ? window.dashboardRateColor(overallDr) : (overallDr >= 40 ? '#22d3ee' : overallDr >= 30 ? '#00e676' : overallDr >= 20 ? '#f59e0b' : '#ef4444');
      var activeDr = p.drRate || 0;
      var activeDrColor = window.dashboardRateColor ? window.dashboardRateColor(activeDr) : (activeDr >= 40 ? '#22d3ee' : activeDr >= 30 ? '#00e676' : activeDr >= 20 ? '#f59e0b' : '#ef4444');
      // Taager dashboard/status/NDR migration: p.commission is Taager profit.
      var productAvgCommission = (p.deliveredCount || 0) > 0 ? ((Number(p.commission) || 0) / p.deliveredCount) : 0;
      var productBreakEvenCpa = productAvgCommission * ((Number(p.ndrPct || p.deliveryRate || 0)) / 100);
      var drBadge = '<div style="display:flex;flex-direction:column;gap:4px;align-items:center">' +
          '<div style="font-size:10px;font-weight:700;color:' + drColor + ';background:' + drColor + '18;padding:2px 6px;border-radius:12px;border:1px solid ' + drColor + '44">' + pctValue(overallDr) + '% <span style="opacity:0.5;font-size:9px">NDR</span></div>' +
          '<div style="font-size:10px;font-weight:700;color:' + activeDrColor + ';background:' + activeDrColor + '18;padding:2px 6px;border-radius:12px;border:1px solid ' + activeDrColor + '44">' + activeDr.toFixed(1) + '% <span style="opacity:0.5;font-size:9px">DR</span></div>' +
          '<div style="font-size:9px;font-weight:800;color:#c084fc;margin-top:2px;" title="' + sTx('Break-even CPA = simulator profit after tax per delivered order × NDR', 'تكلفة التعادل = متوسط ربح تاجر × NDR') + '">BE: ' + productBreakEvenCpa.toFixed(2) + ' ' + activeCurrency + '</div>' +
        '</div>';

      function cityBadge(cityObj) {
        if (!cityObj) return '<span style="color:rgba(255,255,255,0.15);font-size:11px">-</span>';
        var cNdr = (cityObj.ndr * 100);
        var cNdrColor = window.dashboardRateColor ? window.dashboardRateColor(cNdr) : (cNdr >= 40 ? '#22d3ee' : cNdr >= 30 ? '#00e676' : cNdr >= 20 ? '#f59e0b' : '#ef4444');
        var cDr = (cityObj.dr * 100);
        var cDrColor = window.dashboardRateColor ? window.dashboardRateColor(cDr) : (cDr >= 40 ? '#22d3ee' : cDr >= 30 ? '#00e676' : cDr >= 20 ? '#f59e0b' : '#ef4444');
        return '<div class="insight-city-btn" data-city="' + cityObj.name + '" style="cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);padding:6px 12px;border-radius:6px;transition:background 0.2s">' +
          '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.85);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + cityObj.name + '">' + cityObj.name + '</div>' +
          '<div style="display:flex;gap:6px;margin-top:4px">' +
            '<div style="font-size:10px;font-weight:800;color:' + cNdrColor + '">' + pctValue(cNdr) + '% <span style="opacity:0.5;font-size:8px">NDR</span></div>' +
            '<div style="font-size:10px;font-weight:800;color:' + cDrColor + '">' + cDr.toFixed(1) + '% <span style="opacity:0.5;font-size:8px">DR</span></div>' +
          '</div>' +
        '</div>';
      }

      /* Net Orders = net placed orders for this product */
      var netOrders = p.netOrderCount !== undefined ? p.netOrderCount : (p.placedCount || 0);
      var netColor = window.dashboardRateColor ? window.dashboardRateColor(overallDr) : drColor;

      var rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:grid;grid-template-columns:2.5fr 0.8fr 0.8fr 1fr 1.25fr 1.25fr;gap:10px;align-items:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.03);transition:background 0.2s;flex-shrink:0';
      rowEl.onmouseenter = function() { this.style.background = 'rgba(255,255,255,0.04)'; };
      rowEl.onmouseleave = function() { this.style.background = 'rgba(255,255,255,0.02)'; };
      
      rowEl.innerHTML = 
        '<div style="display:flex;flex-direction:column;overflow:hidden">' + nameHtml + skuHtml + '</div>' +
        '<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.6);text-align:center">' + (p.placedCount || 0).toLocaleString('en-US') + '</div>' +
        '<div style="font-size:12px;font-weight:800;color:' + netColor + ';text-align:center">' + netOrders.toLocaleString('en-US') + '</div>' +
        '<div style="text-align:center">' + drBadge + '</div>' +
        '<div style="text-align:center">' + cityBadge(bestCity) + '</div>' +
        '<div style="text-align:center">' + cityBadge(worstCity) + '</div>';

      table.appendChild(rowEl);
    });

    var tableContainer = document.createElement('div');
    tableContainer.style.cssText = 'width:100%;overflow-x:auto;padding-bottom:8px;';
    tableContainer.appendChild(table);
    wrapper.appendChild(tableContainer);

    // Pagination controls
    if (totalPages > 1) {
      if (window.renderDashboardPagination) {
        var pagWrap = document.createElement('div');
        pagWrap.innerHTML = window.renderDashboardPagination({
          currentPage: currentPage + 1,
          totalPages: totalPages,
          totalItems: allProducts.length,
          startItem: startIdx + 1,
          endItem: Math.min(endIdx, allProducts.length),
          itemLabel: sTx('products', 'منتج'),
          pageButtonClass: 'spm-page-btn',
          prevClass: 'spm-page-prev',
          nextClass: 'spm-page-next',
          className: 'spm-dashboard-pagination'
        });
        wrapper.appendChild(pagWrap);
        window.bindDashboardPagination(pagWrap, {
          pageButtonSelector: '.spm-page-btn[data-page]',
          prevSelector: '.spm-page-prev',
          nextSelector: '.spm-page-next',
          onPage: function (page) {
            currentPage = Math.max(0, page - 1);
            renderTable(wrapper, geoData, provFilter);
          },
          onPrev: function () {
            if (currentPage > 0) {
              currentPage--;
              renderTable(wrapper, geoData, provFilter);
            }
          },
          onNext: function () {
            if (currentPage < totalPages - 1) {
              currentPage++;
              renderTable(wrapper, geoData, provFilter);
            }
          }
        });
      } else {
      var pagContainer = document.createElement('div');
      pagContainer.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:16px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)';
      
      var prevBtn = document.createElement('button');
      prevBtn.innerHTML = sTx('Previous', 'السابق');
      prevBtn.disabled = (currentPage === 0);
      prevBtn.style.cssText = 'padding:6px 16px;font-size:12px;font-weight:700;border-radius:6px;background:rgba(255,255,255,0.05);color:#fff;border:none;cursor:' + (currentPage === 0 ? 'not-allowed;opacity:0.3' : 'pointer');
      
      var nextBtn = document.createElement('button');
      nextBtn.innerHTML = sTx('Next', 'التالي');
      nextBtn.disabled = (currentPage === totalPages - 1);
      nextBtn.style.cssText = 'padding:6px 16px;font-size:12px;font-weight:700;border-radius:6px;background:rgba(255,255,255,0.05);color:#fff;border:none;cursor:' + (currentPage === totalPages - 1 ? 'not-allowed;opacity:0.3' : 'pointer');

      var pageInfo = document.createElement('div');
      pageInfo.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.5);font-weight:600';
      pageInfo.innerHTML = sTx('Page ', 'صفحة ') + (currentPage + 1) + sTx(' of ', ' من ') + totalPages;

      prevBtn.onclick = function() {
        if (currentPage > 0) {
          currentPage--;
          renderTable(wrapper, geoData, provFilter);
        }
      };
      
      nextBtn.onclick = function() {
        if (currentPage < totalPages - 1) {
          currentPage++;
          renderTable(wrapper, geoData, provFilter);
        }
      };

      pagContainer.appendChild(nextBtn); // Next on the right for RTL? Wait, in RTL "Next" (التالي) should probably be on the left logically, but let's just do Prev -> Info -> Next
      // Actually in RTL: right to left. So "Previous" (السابق) is to the right of "Next" (التالي).
      pagContainer.appendChild(prevBtn);
      pagContainer.appendChild(pageInfo);
      pagContainer.appendChild(nextBtn);
      
      wrapper.appendChild(pagContainer);
      }
    }

    var btns = wrapper.querySelectorAll('.insight-city-btn');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var cn = this.getAttribute('data-city');
        if (window.CityIntelligenceDrawer && cn) {
          window.CityIntelligenceDrawer.open(cn, window.dashboardGeoData);
        }
      });
      btn.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.08)'; });
      btn.addEventListener('mouseleave', function() { this.style.background = 'rgba(255,255,255,0.03)'; });
    });
  }

  function buildGrid(mountEl, geoData, filterBus) {
    var wrapper = document.createElement('div');
    wrapper.style.cssText = [
      'background:#0b1120',
      'border:1px solid rgba(255,255,255,0.06)',
      'border-radius:16px',
      'padding:20px 20px 14px',
      'flex-shrink:0'
    ].join(';');
    
    mountEl.innerHTML = '';
    mountEl.appendChild(wrapper);

    var bus = filterBus || window.DashboardFilterBus;
    var provFilter = bus ? (bus.getState().selectedProvince || null) : null;
    
    // Reset to page 0 when initially building grid
    currentPage = 0;
    
    renderTable(wrapper, geoData, provFilter);
  }

  window.renderProductMatrix = function (mountEl, geoData, filterBus) {
    if (!mountEl) return;

    var bus = filterBus || window.DashboardFilterBus;
    buildGrid(mountEl, geoData, bus);

    if (bus) {
      var _prevProvince = (bus.getState && bus.getState().selectedProvince) || null;

      var _onBusChange = function (state) {
        var newProv = state.selectedProvince || null;
        if (newProv !== _prevProvince) {
          _prevProvince = newProv;
          // Note: buildGrid resets currentPage to 0, which is good when changing filters.
          buildGrid(mountEl, geoData, bus);
        }
      };

      bus.subscribe(_onBusChange);

      var _observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.removedNodes.forEach(function (node) {
            if (node === mountEl || node.contains && node.contains(mountEl)) {
              bus.unsubscribe(_onBusChange);
              _observer.disconnect();
            }
          });
        });
      });
      if (mountEl.parentElement) {
        _observer.observe(mountEl.parentElement, { childList: true });
      }
    }
  };

})();
