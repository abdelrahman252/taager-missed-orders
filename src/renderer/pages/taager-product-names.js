// Taager dashboard/status/NDR migration helper.
// Future chats: Taager exports SKU but not a stable product name. Keep merchant
// edits here and read them through window.TaagerStatus.productName(row).
(function () {
  "use strict";
  var KEY = "taager_product_name_map_v1";
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (_) { return {}; }
  }
  function write(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map || {})); } catch (_) {}
  }
  var cache = read();
  window.TaagerProductNames = {
    get: function (sku) {
      var key = String(sku || "").trim();
      return key ? String(cache[key] || "").trim() : "";
    },
    set: function (sku, name) {
      var key = String(sku || "").trim();
      if (!key) return;
      var value = String(name || "").trim();
      if (value) cache[key] = value; else delete cache[key];
      write(cache);
      window.dispatchEvent(new CustomEvent("taager-product-names-change", { detail: { sku: key, name: value } }));
    },
    all: function () { return Object.assign({}, cache); }
  };
  window.addEventListener("storage", function (event) {
    if (event && event.key === KEY) cache = read();
  });
})();
