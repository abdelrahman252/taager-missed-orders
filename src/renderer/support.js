(function () {
  "use strict";

  var SUPPORT_PHONE_E164 = "201129965148";
  var SUPPORT_MESSAGE = "Hi, I need help with Taager Orders. My issue is:";

  function supportUrl() {
    return "https://wa.me/" + SUPPORT_PHONE_E164 + "?text=" + encodeURIComponent(SUPPORT_MESSAGE + " ");
  }

  function openSupport() {
    if (window.api && typeof window.api.openExternalUrl === "function") {
      return window.api.openExternalUrl(supportUrl()).catch(function () {});
    }
    return Promise.resolve({ ok: false, error: "OPEN_EXTERNAL_UNAVAILABLE" });
  }

  window.TaagerSupport = {
    phone: SUPPORT_PHONE_E164,
    message: SUPPORT_MESSAGE,
    url: supportUrl,
    open: openSupport
  };
})();
