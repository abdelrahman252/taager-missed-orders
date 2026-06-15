// analytics-utils.js — shared helpers for analytics + operations pages
// NO import/export — plain globals for Electron renderer
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  "Pending":          { bg: "#2a2820", text: "#c9a84c", border: "#5a4a20" },
  "Confirmed":        { bg: "#0f2218", text: "#34c97a", border: "#0d3d22" },
  "Under processing": { bg: "#1a2535", text: "#4fa8e8", border: "#1e3a5a" },
  "Waiting":          { bg: "#1a2535", text: "#5bc4f5", border: "#1a3a50" },
  "In shipping":      { bg: "#2a1f10", text: "#e8963a", border: "#5a3a10" },
  "Delivered":        { bg: "#0f2a1e", text: "#2dd98a", border: "#0f4a2e" },
  "Failed":           { bg: "#2a1010", text: "#ff5c5c", border: "#5a1010" },
  "Canceled":         { bg: "#1e1e1e", text: "#888780", border: "#333" },
  "missed":           { bg: "#1e1a35", text: "#9b8ff0", border: "#3a2e6a" },
  "":                 { bg: "#1e1e1e", text: "#888780", border: "#333" },
};

const STATUS_COLORS_LIGHT = {
  "Pending":          { bg: "#fef9ec", text: "#92680a", border: "#f5d97a" },
  "Confirmed":        { bg: "#edfaf3", text: "#1a7a4a", border: "#7ddba8" },
  "Under processing": { bg: "#eff6ff", text: "#1d5fad", border: "#93c5fd" },
  "Waiting":          { bg: "#f0faff", text: "#0e6e95", border: "#7dd3f5" },
  "In shipping":      { bg: "#fff7ed", text: "#9a4c0a", border: "#fbb97a" },
  "Delivered":        { bg: "#ecfdf5", text: "#166534", border: "#6ee7b7" },
  "Failed":           { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  "Canceled":         { bg: "#f5f5f5", text: "#555555", border: "#d4d4d4" },
  "missed":           { bg: "#f5f3ff", text: "#5b21b6", border: "#c4b5fd" },
  "":                 { bg: "#f5f5f5", text: "#555555", border: "#d4d4d4" },
};

// Taager dashboard/status/NDR migration:
// Analytics and Operations share TaagerStatus so Arabic statuses, labels, and
// color buckets match the dashboard and AI data model.
function getStatusColor(status) {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  if (window.TaagerStatus) {
    const bucket = window.TaagerStatus.normalize(status).bucket;
    const palette = isLight ? {
      delivered: { bg: "#ecfdf5", text: "#166534", border: "#6ee7b7" },
      failed: { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
      return_verified: { bg: "#fff1f2", text: "#9f1239", border: "#fda4af" },
      canceled_by_you: { bg: "#f5f5f5", text: "#555555", border: "#d4d4d4" },
      received: { bg: "#eff6ff", text: "#1d5fad", border: "#93c5fd" },
      confirmed: { bg: "#edfaf3", text: "#1a7a4a", border: "#7ddba8" },
      shipping: { bg: "#fff7ed", text: "#9a4c0a", border: "#fbb97a" }
    } : {
      delivered: { bg: "#0f2a1e", text: "#2dd98a", border: "#0f4a2e" },
      failed: { bg: "#2a1010", text: "#ff5c5c", border: "#5a1010" },
      return_verified: { bg: "#2a1010", text: "#ff8a8a", border: "#5a1010" },
      canceled_by_you: { bg: "#1e1e1e", text: "#888780", border: "#333" },
      received: { bg: "#1a2535", text: "#4fa8e8", border: "#1e3a5a" },
      confirmed: { bg: "#0f2218", text: "#34c97a", border: "#0d3d22" },
      shipping: { bg: "#2a1f10", text: "#e8963a", border: "#5a3a10" }
    };
    return palette[bucket] || (isLight
      ? { bg: "#f5f5f5", text: "#555555", border: "#d4d4d4" }
      : { bg: "#1e1e1e", text: "#888780", border: "#333" });
  }
  const map = isLight ? STATUS_COLORS_LIGHT : STATUS_COLORS;
  return map[status] || map[""];
}

function formatSAR(amount) {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-SA", {
    style: "currency", currency: "SAR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function analyticsMoneyValue(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function analyticsTaagerProfit(order) {
  if (!order) return 0;
  if (window.TaagerStatus && typeof window.TaagerStatus.taagerProfit === "function") {
    return analyticsMoneyValue(window.TaagerStatus.taagerProfit(order));
  }
  return analyticsMoneyValue(
    order.profitAfterTax != null ? order.profitAfterTax :
    order.taagerProfit != null ? order.taagerProfit :
    order.profitAfterFees != null ? order.profitAfterFees :
    order.commission != null ? order.commission :
    order.marketerCommission
  );
}

function analyticsIsDeliveredOrder(order) {
  const status = order && order.orderStatus;
  if (window.TaagerStatus && typeof window.TaagerStatus.isDelivered === "function") {
    return window.TaagerStatus.isDelivered(status);
  }
  return String(status || "").toLowerCase() === "delivered";
}

function analyticsDashboardRevenueValue(order) {
  return analyticsIsDeliveredOrder(order) ? analyticsTaagerProfit(order) : 0;
}

function sumDashboardRevenue(orders) {
  return (orders || []).reduce((acc, order) => acc + analyticsDashboardRevenueValue(order), 0);
}

function formatTimeSaved(totalOrders, minutesPerOrder) {
  const mins = Math.round(totalOrders * (minutesPerOrder || 5));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getDateRange(filter) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filter) {
    case "today":     return { from: today, to: today };
    case "yesterday": { const y = new Date(today); y.setDate(y.getDate()-1); return { from: y, to: y }; }
    case "last2":     return { from: new Date(today.getTime() - 86400000), to: today };
    case "last7":     return { from: new Date(today.getTime() - 6*86400000), to: today };
    case "thisMonth": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: today };
    default:          return null;
  }
}

function shiftBack7(date) {
  const d = new Date(date); d.setDate(d.getDate() - 7); return d;
}

function countOrdersInRange(orders, from, to) {
  return orders.filter(o => {
    if (!o.date) return false;
    const d = new Date(o.date);
    return d >= from && d <= to;
  }).length;
}

function calcDelta(current, previous) {
  if (!previous || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.round(pct), positive: pct >= 0 };
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key] || "";
    if (!map[k]) map[k] = { key: k, items: [], count: 0 };
    map[k].items.push(item);
    map[k].count++;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function flattenRuns(runs) {
  return runs.flatMap(r =>
    (r.orders || []).map(o => ({
      ...o,
      accountEmail: r.accountEmail || "",
      accountId:    r.accountId    || "",
      accountLabel: r.accountLabel || r.accountEmail || "",
      taagerCountry: o.taagerCountry || r.taagerCountry || "sa",
      runId:        r.runId        || "",
      runDate:      r.runDate      || "",
      runTimestamp: r.runTimestamp || null,
      runStartedAt: r.runStartedAt || null,
      runEndedAt:   r.runEndedAt   || null,
    }))
  );
}

function analyticsEscapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
}

function accountCountry(item) {
  return String(item && item.taagerCountry || "sa").toLowerCase();
}

function countryFlagHtml(countryCode) {
  var country = window.TaagerCountry;
  var value = String(countryCode || "sa").toLowerCase();
  var item = country && country.get ? country.get(value) : { code: value.toUpperCase() };
  var flagCls = country && country.flagClass ? country.flagClass(value) : "taager-country-flag flag:SA";
  var label = country && country.label ? country.label(value) : (item.code || value.toUpperCase());
  return '<span class="' + analyticsEscapeHtml(flagCls) + '" title="' + analyticsEscapeHtml(label) + '" aria-label="' + analyticsEscapeHtml(label) + '" style="display:inline-block;width:18px;min-width:18px;height:13px;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.18);vertical-align:-2px"></span>';
}

function accountCountryLabel(item) {
  var country = window.TaagerCountry;
  var value = accountCountry(item);
  return country && country.label ? country.label(value) : value.toUpperCase();
}

function accountOptionLabelHtml(label, countryCode) {
  return '<span style="display:inline-flex;align-items:center;gap:7px;min-width:0">' +
    countryFlagHtml(countryCode) +
    '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + analyticsEscapeHtml(label) + '</span>' +
  '</span>';
}

function allAccountsCountryFlagsHtml(runs) {
  var seen = [];
  (runs || []).forEach(function (run) {
    var code = accountCountry(run);
    if (seen.indexOf(code) === -1) seen.push(code);
  });
  if (!seen.length) seen = ["sa"];
  return '<span style="display:inline-flex;align-items:center;gap:4px">' +
    seen.slice(0, 5).map(countryFlagHtml).join("") +
  '</span>';
}

function analyticsLocale() {
  return (window._kbotLang || "en") === "ar" ? "ar-EG-u-nu-latn" : "en-US";
}

function formatAnalyticsDate(value, opts) {
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(analyticsLocale(), opts || { month: "short", day: "numeric", year: "numeric" });
}

function analyticsStatusLabel(status) {
  if (window.TaagerStatus) {
    var meta = window.TaagerStatus.normalize(status);
    return (window._kbotLang || "en") === "ar" ? meta.ar : meta.en;
  }
  var isAr = (window._kbotLang || "en") === "ar";
  if (!isAr) return status || "—";
  var map = {
    "Pending": "قيد الانتظار",
    "Confirmed": "مؤكد",
    "Under processing": "قيد المعالجة",
    "Under Processing": "قيد المعالجة",
    "Waiting": "قيد الانتظار",
    "In shipping": "قيد الشحن",
    "In Shipping": "قيد الشحن",
    "Delivered": "تم التوصيل",
    "Failed": "فشل",
    "Canceled": "ملغي",
    "missed": "مفقود"
  };
  return map[status] || status || "—";
}

function accountKey(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.accountId || item.accountEmail || "";
}

function accountDisplay(item) {
  if (!item) return "—";
  if (typeof item === "string") return item === "__single__" ? "—" : item;
  return item.accountLabel || item.accountEmail || item.accountId || "—";
}

function accountMatches(item, key) {
  if (!key) return true;
  return item && (item.accountId === key || item.accountEmail === key || accountKey(item) === key);
}



function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return window.t_anl('utils.time.justNow');
  if (m < 60) return window.t_anl('utils.time.mAgo', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return window.t_anl('utils.time.hAgo', { h });
  return window.t_anl('utils.time.dAgo', { d: Math.floor(h/24) });
}

function sumField(orders, field) {
  return orders.reduce((acc, o) => acc + (Number(o[field]) || 0), 0);
}

function uniqueAccounts(runs) {
  const seen = new Set();
  return runs.filter(r => {
    const key = accountKey(r);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function renderCustomSelect(container, options, currentValue, onChange, config) {
  if (!container) return;
  config = config || {};
  const usePortal = config.portal !== false;
  if (typeof window._customSelectCloseActive === "function") window._customSelectCloseActive();

  const escapeSelectHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
  const optionLabel = option => option ? String(option.label ?? "") : "";
  const optionSubLabel = option => option ? String(option.subLabel || option.email || "") : "";
  const optionText = option => option && option.searchText ? String(option.searchText) : [optionLabel(option), optionSubLabel(option)].filter(Boolean).join(" ");
  const optionMarkup = (option, compact) => {
    const labelText = option && option.labelHtml ? String(option.labelHtml) : escapeSelectHtml(optionLabel(option));
    const subText = escapeSelectHtml(optionSubLabel(option));
    if (!subText) return `<span class="custom-select-label">${labelText}</span>`;
    return `
      <span class="custom-select-label-stack${compact ? " compact" : ""}">
        <span class="custom-select-label-main">${labelText}</span>
        <span class="custom-select-label-sub">${subText}</span>
      </span>
    `;
  };

  const currentOpt = options.find(o => o.value === currentValue) || options[0];
  const label = currentOpt ? optionText(currentOpt) : "";
  const dropdownStyle = config.maxHeight ? `style="max-height:${config.maxHeight};overflow-y:auto;"` : "";

  let searchHtml = "";
  if (config.searchable) {
    const searchPlaceholder = window.dashboardI18n && container.closest && container.closest('#page-dashboard')
      ? window.dashboardI18n.t('shell.search')
      : 'بحث...';
    const searchDir = (window.dashboardI18n && container.closest && container.closest('#page-dashboard'))
      ? window.dashboardI18n.dir()
      : (document.documentElement.getAttribute('dir') || 'rtl');
    searchHtml = `
      <div class="custom-select-search-wrap" style="padding: 8px; position: sticky; top: 0; background: #0b1120; z-index: 2; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <input type="text" class="custom-select-search-input" placeholder="${escapeSelectHtml(searchPlaceholder)}" style="width: 100%; padding: 6px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px; direction: ${searchDir}; text-align: start;" onclick="event.stopPropagation()" />
      </div>
    `;
  }

  container.innerHTML = `
    <div class="custom-select-container">
      <button class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeSelectHtml(config.ariaLabel || label)}">
        <span class="custom-select-value">${currentOpt ? optionMarkup(currentOpt, true) : escapeSelectHtml(label)}</span>
        <svg class="custom-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div class="custom-select-dropdown" role="listbox" ${dropdownStyle}>
        ${searchHtml}
        ${options.map(o => {
          const selected = o.value === currentValue ? "selected" : "";
          const checkmark = o.value === currentValue ? '<span class="custom-select-checkmark">✓</span>' : "";
          return `
            <div class="custom-select-option ${selected}" role="option" aria-selected="${o.value === currentValue ? "true" : "false"}" data-value="${escapeSelectHtml(o.value)}" data-search="${escapeSelectHtml(optionText(o).toLowerCase())}" tabindex="-1">
              ${optionMarkup(o, false)}
              ${checkmark}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  const trigger = container.querySelector(".custom-select-trigger");
  const dropdown = container.querySelector(".custom-select-dropdown");
  const wrapper = container.querySelector(".custom-select-container");
  const dropdownHome = document.createComment("custom-select-dropdown-home");
  dropdown.parentNode.insertBefore(dropdownHome, dropdown);
  let dropdownPortaled = false;
  let portalPreferredWidth = 0;

  const resetDropdownPosition = () => {
    dropdown.classList.remove("custom-select-portal-open");
    dropdown.classList.remove("custom-select-opens-up");
    dropdown.style.left = "";
    dropdown.style.right = "";
    dropdown.style.top = "";
    dropdown.style.bottom = "";
    dropdown.style.width = "";
    dropdown.style.maxHeight = config.maxHeight || "";
    dropdown.style.overflowY = config.maxHeight ? "auto" : "";
  };
  const restoreDropdown = () => {
    if (!dropdownPortaled) return;
    if (dropdownHome.parentNode) dropdownHome.parentNode.insertBefore(dropdown, dropdownHome.nextSibling);
    dropdownPortaled = false;
  };
  const closeSelect = () => {
    wrapper.classList.remove("open");
    wrapper.classList.remove("custom-select-fixed-open");
    trigger.setAttribute("aria-expanded", "false");
    resetDropdownPosition();
    restoreDropdown();
    if (window._customSelectPositionActive === positionDropdown) window._customSelectPositionActive = null;
    if (window._customSelectCloseActive === closeSelect) window._customSelectCloseActive = null;
  };
  const positionDropdown = () => {
    if (!usePortal) return;
    if (!wrapper.classList.contains("open")) return;
    if (!trigger.isConnected) {
      closeSelect();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const dropdownWidth = Math.min(
      Math.max(rect.width, portalPreferredWidth || dropdown.offsetWidth || rect.width),
      Math.max(140, viewportWidth - (margin * 2))
    );
    const isRtl = (document.documentElement.getAttribute("dir") || "").toLowerCase() === "rtl" ||
      (container.closest && container.closest("[dir='rtl']"));
    let left = isRtl ? rect.right - dropdownWidth : rect.left;

    left = Math.max(margin, Math.min(left, viewportWidth - dropdownWidth - margin));
    const configuredMaxHeight = Math.max(80, parseFloat(config.maxHeight) || viewportHeight);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - margin);
    const spaceAbove = Math.max(0, rect.top - gap - margin);
    const openAbove = spaceBelow < Math.min(configuredMaxHeight, dropdown.scrollHeight || configuredMaxHeight) && spaceAbove > spaceBelow;
    const availableHeight = Math.max(80, Math.min(configuredMaxHeight, openAbove ? spaceAbove : spaceBelow));
    const top = openAbove
      ? Math.max(margin, rect.top - gap - Math.min(dropdown.scrollHeight || availableHeight, availableHeight))
      : Math.min(viewportHeight - margin - availableHeight, rect.bottom + gap);

    dropdown.style.setProperty("left", `${left}px`, "important");
    dropdown.style.setProperty("right", "auto", "important");
    dropdown.style.setProperty("top", `${Math.max(margin, top)}px`, "important");
    dropdown.style.setProperty("bottom", "auto", "important");
    dropdown.style.setProperty("width", `${dropdownWidth}px`, "important");
    dropdown.style.setProperty("max-height", `${availableHeight}px`, "important");
    dropdown.style.setProperty("overflow-y", "auto", "important");
    dropdown.classList.toggle("custom-select-opens-up", openAbove);
  };
  const openSelect = () => {
    if (typeof window._customSelectCloseActive === "function" && window._customSelectCloseActive !== closeSelect) {
      window._customSelectCloseActive();
    }
    wrapper.classList.add("open");
    wrapper.classList.toggle("custom-select-fixed-open", usePortal);
    trigger.setAttribute("aria-expanded", "true");
    if (usePortal && !dropdownPortaled) {
      portalPreferredWidth = dropdown.offsetWidth || trigger.getBoundingClientRect().width;
      document.body.appendChild(dropdown);
      dropdownPortaled = true;
      dropdown.classList.add("custom-select-portal-open");
    }
    window._customSelectCloseActive = closeSelect;
    if (usePortal) window._customSelectPositionActive = positionDropdown;
    positionDropdown();
  };

  // Toggle open
  trigger.addEventListener("click", function(e) {
    e.stopPropagation();
    if (wrapper.classList.contains("open")) {
      closeSelect();
      return;
    }
    openSelect();
    const searchInput = dropdown.querySelector(".custom-select-search-input");
    if (searchInput) setTimeout(() => searchInput.focus(), 0);
  });

  trigger.addEventListener("keydown", function(e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown") return;
    e.preventDefault();
    openSelect();
    dropdown.querySelector(".custom-select-option:not([style*='display: none'])")?.focus();
  });

  // Option selection
  dropdown.querySelectorAll(".custom-select-option").forEach(opt => {
    opt.addEventListener("click", function(e) {
      e.stopPropagation();
      const val = opt.getAttribute("data-value");
      closeSelect();
      if (val !== currentValue) {
        currentValue = val;
        
        // Update trigger label
        const triggerLabel = container.querySelector(".custom-select-value");
        if (triggerLabel) {
          const selected = options.find(o => String(o.value) === String(val));
          if (selected) triggerLabel.innerHTML = optionMarkup(selected, true);
          else triggerLabel.textContent = opt.textContent || "";
        }
        
        // Update selected classes and checkmark
        dropdown.querySelectorAll(".custom-select-option").forEach(o => {
          o.classList.remove("selected");
          o.setAttribute("aria-selected", "false");
          const checkmark = o.querySelector(".custom-select-checkmark");
          if (checkmark) checkmark.remove();
        });
        opt.classList.add("selected");
        opt.setAttribute("aria-selected", "true");
        opt.insertAdjacentHTML("beforeend", '<span class="custom-select-checkmark">✓</span>');
        
        if (typeof onChange === "function") {
          onChange(val);
        }
      }
    });
    opt.addEventListener("keydown", function(e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        opt.click();
      } else if (e.key === "Escape") {
        closeSelect();
        trigger.focus();
      }
    });
  });

  // Search filtering logic
  if (config.searchable) {
    const searchInput = container.querySelector(".custom-select-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", function(e) {
        const val = e.target.value.toLowerCase();
        dropdown.querySelectorAll(".custom-select-option").forEach(opt => {
          const text = (opt.getAttribute("data-search") || opt.textContent || "").toLowerCase();
          if (text.includes(val)) {
            opt.style.display = "";
          } else {
            opt.style.display = "none";
          }
        });
        positionDropdown();
      });
    }
  }

}

window.renderTaagerDropdown = renderCustomSelect;

// Global click-outside listener to close any open custom selects
if (!window._customSelectInitialized) {
  window._customSelectInitialized = true;
  window._customSelectPositionActive = null;
  window._customSelectCloseActive = null;
  document.addEventListener("click", function() {
    if (typeof window._customSelectCloseActive === "function") {
      window._customSelectCloseActive();
      return;
    }
    document.querySelectorAll(".custom-select-container").forEach(el => {
      el.classList.remove("open");
      el.classList.remove("custom-select-fixed-open");
      el.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
      const dropdown = el.querySelector(".custom-select-dropdown");
      if (dropdown) {
        dropdown.style.left = "";
        dropdown.style.right = "";
        dropdown.style.top = "";
        dropdown.style.width = "";
      }
    });
    window._customSelectPositionActive = null;
  });
  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape" && typeof window._customSelectCloseActive === "function") {
      window._customSelectCloseActive();
    }
  });
  window.addEventListener("resize", function() {
    if (typeof window._customSelectPositionActive === "function") window._customSelectPositionActive();
  });
  window.addEventListener("scroll", function() {
    if (typeof window._customSelectPositionActive === "function") window._customSelectPositionActive();
  }, true);
}

// ── Shared sidebar ────────────────────────────────────────────────────────────
// Generates sidebar HTML identical to the setup/run page.
// activeNav: "accounts" | "run" | "analytics" | "operations" | "dashboard"
// Nav item labels are wrapped in <span class="sv3-nav-label"> for icon-only collapse.
function renderSharedSidebar(activeNav) {
  var t = window._t || function(k) { return k; };

  function itemClass(name) {
    var cls = 'sv3-nav-item';
    if (name === 'analytics' || name === 'operations' || name === 'dashboard') {
      var locked = (name === 'analytics'  && window._analyticsEnabled  === false) ||
                   (name === 'operations' && window._operationsEnabled === false) ||
                   (name === 'dashboard' && window._dashboardEnabled  === false);
      cls += ' sv3-nav-page';
      if (locked) cls += ' sv3-nav-preview';
    }
    if (name === activeNav) cls += ' active';
    return cls;
  }

  function lbl(text) { return '<span class="sv3-nav-label">' + text + '</span>'; }

  function previewBadge(flag) {
    return flag === false ? '<span class="sv3-nav-preview-badge">Preview</span>' : '';
  }

  return (
    '<div class="sv3-sidebar">' +

      '<div class="sv3-sb-logo">' +
        '<div class="sv3-sb-logo-icon">⚡</div>' +
        '<div>' +
          '<div class="sv3-sb-logo-text">Taager Bot</div>' +
          '<div class="sv3-sb-logo-sub">' + (t('setup.sub_title') || 'Setup') + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="' + itemClass('accounts') + '" id="nav-accounts" data-step="accounts">' +
        '<div class="sv3-step-num" style="font-size:14px">👤</div>' +
        lbl(t('setup.nav_accounts') || 'Accounts') +
      '</div>' +

      '<div class="' + itemClass('run') + '" id="nav-run" data-step="run">' +
        '<div class="sv3-step-num" style="font-size:14px">🚀</div>' +
        lbl(t('setup.nav_run') || 'Run') +
      '</div>' +

      '<div class="' + itemClass('analytics') + '" id="nav-analytics" data-page="analytics">' +
        '<div class="sv3-step-num" style="background:linear-gradient(135deg,#7c6bff,#4fa8e8)">📊</div>' +
        lbl((t('setup.nav_analytics') || 'Analytics') + previewBadge(window._analyticsEnabled)) +
      '</div>' +

      '<div class="' + itemClass('operations') + '" id="nav-operations" data-page="operations">' +
        '<div class="sv3-step-num" style="background:linear-gradient(135deg,#00d4aa,#4fa8e8)">⚙️</div>' +
        lbl((t('setup.nav_operations') || 'Operations') + previewBadge(window._operationsEnabled)) +
      '</div>' +

      '<div class="' + itemClass('dashboard') + '" id="nav-dashboard" data-page="dashboard">' +
        '<div class="sv3-step-num" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">📈</div>' +
        lbl((t('setup.nav_dashboard') || 'Dashboard') + previewBadge(window._dashboardEnabled)) +
      '</div>' +

      '<div class="sv3-sidebar-footer">' +
        '<button class="sv3-update-btn" id="sv3-update-btn" onclick="checkForUpdatesManual()" style="display:flex;align-items:center;justify-content:center;gap:6px">' +
          '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>' +
          '<span id="sv3-update-btn-label">' + (t('setup.check_updates_btn') || 'Check for Updates') + '</span>' +
        '</button>' +
        '<div id="sv3-app-version-label" style="font-size:11px;color:var(--text2);margin-top:4px;text-align:center;width:100%">' +
          (() => {
            const v = window._appVersion || "";
            if (!v) return "";
            const textFn = t("setup.app_version");
            return typeof textFn === 'function' ? textFn(v) : `App version is v${v}`;
          })() +
        '</div>' +
      '</div>' +

    '</div>'
  );
}

// Applies live sidebar state shared by app-level pages.
// Called by wireSharedSidebar for analytics / operations / dashboard pages.
function refreshSharedSidebarState(container) {
  function qs(id) {
    return container && container.querySelector
      ? container.querySelector('#' + id)
      : document.getElementById(id);
  }

  // Keep setup entries in their normal nav state on app-level pages.
  var accountsItem = qs('nav-accounts');
  if (accountsItem) {
    accountsItem.classList.remove('done');
    var an = accountsItem.querySelector('.sv3-step-num');
    if (an) an.textContent = '👤';
  }

  // Run should look like a regular destination, not a completed checklist item.
  var runItem = qs('nav-run');
  if (runItem) {
    runItem.classList.remove('done');
    var rn = runItem.querySelector('.sv3-step-num');
    if (rn) rn.textContent = '🚀';
  }

}

// Wires sidebar nav click handlers, applies live state, mounts the collapse handle.
// container: page root element to scope querySelector calls (never pass document — setup page shares the same IDs)
function wireSharedSidebar(container) {
  function qs(id) {
    return container && container.querySelector
      ? container.querySelector('#' + id)
      : document.getElementById(id);
  }
  function on(id, fn) {
    var el = qs(id);
    if (!el || el.dataset.sharedSidebarWired === '1') return;
    el.dataset.sharedSidebarWired = '1';
    el.addEventListener('click', fn);
  }
  on('nav-accounts',   function() { if (typeof goToSetup      === 'function') goToSetup('accounts'); });
  on('nav-run',        function() { if (typeof goToSetup      === 'function') goToSetup('run'); });
  on('nav-analytics',  function() { if (typeof goToAnalytics  === 'function') goToAnalytics(); });
  on('nav-operations', function() { if (typeof goToOperations === 'function') goToOperations(); });
  on('nav-dashboard',  function() { if (typeof goToDashboard  === 'function') goToDashboard(); });

  // Apply done-checkmarks
  refreshSharedSidebarState(container);

  // Mount the floating collapse handle centered on the sidebar divider
  var shell = (container === document || !container.querySelector)
    ? document.querySelector('.sv3-shell')
    : container.querySelector('.sv3-shell');
  if (shell) _mountCollapseHandle(shell);
}

// Floating circular handle that sits on the sidebar/content divider line.
// Collapse → 44 px icon-only mode; expand → 200 px full sidebar.
function _mountCollapseHandle(shell) {
  // Tear down any handle from a previous render of this page
  var prev = shell.querySelector('.sb-collapse-handle');
  if (prev) prev.remove();

  var sidebar = shell.querySelector('.sv3-sidebar');
  if (!sidebar) return;

  var EXPANDED_W  = 200; // matches main.css .sv3-sidebar { width: 200px }
  var COLLAPSED_W = 44;  // icon-only mode width
  var collapsed   = shell.classList.contains('dashboard-page-shell');
  var isRtl       = document.documentElement.getAttribute('dir') === 'rtl';

  function placeHandle(width) {
    handle.style.left = isRtl ? 'auto' : width + 'px';
    handle.style.right = isRtl ? width + 'px' : 'auto';
  }
  function handleTransform(rotated) {
    return 'translateX(' + (isRtl ? '50%' : '-50%') + ') translateY(-50%)' + (rotated ? ' rotate(180deg)' : '');
  }
  function applyCollapsedState(nextCollapsed) {
    collapsed = !!nextCollapsed;
    if (collapsed) {
      sidebar.classList.add('sv3-sb--icon');
      sidebar.style.width    = COLLAPSED_W + 'px';
      sidebar.style.minWidth = COLLAPSED_W + 'px';
      placeHandle(COLLAPSED_W);
      handle.style.transform = handleTransform(true);
    } else {
      sidebar.classList.remove('sv3-sb--icon');
      sidebar.style.width    = EXPANDED_W + 'px';
      sidebar.style.minWidth = EXPANDED_W + 'px';
      placeHandle(EXPANDED_W);
      handle.style.transform = handleTransform(false);
    }
  }

  // Sidebar animates width; overflow:hidden clips content during transition
  sidebar.style.transition = 'width 0.26s cubic-bezier(0.4,0,0.2,1), min-width 0.26s cubic-bezier(0.4,0,0.2,1)';
  sidebar.style.overflow   = 'hidden';

  // Build the handle button
  var handle = document.createElement('button');
  handle.className = 'sb-collapse-handle';
  handle.title     = 'Toggle sidebar';
  handle.setAttribute('aria-label', 'Toggle sidebar');
  handle.innerHTML = isRtl ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  // Start position: centered exactly on the sidebar/content divider.
  applyCollapsedState(collapsed);

  shell.appendChild(handle);

  handle.addEventListener('click', function () {
    collapsed = !collapsed;
    applyCollapsedState(collapsed);
    return;
    if (collapsed) {
      // Switch to icon-only CSS class (hides labels/footer, centers icons)
      sidebar.classList.add('sv3-sb--icon');
      sidebar.style.width    = COLLAPSED_W + 'px';
      sidebar.style.minWidth = COLLAPSED_W + 'px';
      // Handle rides the new right-border
      placeHandle(COLLAPSED_W);
      // ⫷ rotates 180° → points right (= "expand")
      handle.style.transform = handleTransform(true);
    } else {
      // Restore labels/footer before width animation completes
      sidebar.classList.remove('sv3-sb--icon');
      sidebar.style.width    = EXPANDED_W + 'px';
      sidebar.style.minWidth = EXPANDED_W + 'px';
      placeHandle(EXPANDED_W);
      handle.style.transform = handleTransform(false);
    }
  });
}
