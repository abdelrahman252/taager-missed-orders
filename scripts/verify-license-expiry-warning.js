"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.listeners = {};
    this.classList = { add: (name) => { this.className = `${this.className || ""} ${name}`.trim(); } };
    this.closeElements = [new FakeControl(), new FakeControl(), new FakeControl()];
    this.supportElement = new FakeControl();
  }

  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelectorAll(selector) { return selector === "[data-lew-close]" ? this.closeElements : []; }
  querySelector(selector) { return selector === "#lew-support" ? this.supportElement : null; }
  remove() { this.removed = true; }
}

class FakeControl {
  constructor() { this.listeners = {}; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() { this.focused = true; }
}

const body = {
  children: [],
  appendChild(element) { this.children.push(element); },
};
const documentListeners = {};
const windowListeners = {};
let supportOpenCount = 0;
const translations = {
  en: {
    "warning.title": "Your license expires soon",
    "warning.contact": "Contact Support to Renew",
  },
  ar: {
    "warning.title": "ترخيصك على وشك الانتهاء",
    "warning.contact": "تواصل مع الدعم للتجديد",
  },
};
const windowObject = {
  _kbotLang: "en",
  _kbotUser: {},
  _t(key) { return (translations[this._kbotLang] || {})[key] || key; },
  api: {
    openExternalUrl() { return Promise.resolve({ ok: true }); },
  },
  TaagerSupport: {
    open() {
      supportOpenCount++;
      return Promise.resolve({ ok: true });
    },
  },
  setTimeout(callback) { callback(); },
  addEventListener(name, callback) { windowListeners[name] = callback; },
};
const documentObject = {
  body,
  documentElement: { lang: "en" },
  createElement(tagName) { return new FakeElement(tagName); },
  addEventListener(name, callback) { documentListeners[name] = callback; },
};

const context = vm.createContext({
  window: windowObject,
  document: documentObject,
  console,
  Number,
  String,
});
const source = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "pages", "license-expiry-warning.js"), "utf8");
new vm.Script(source, { filename: "license-expiry-warning.js" }).runInContext(context);

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

assert(windowObject.showLicenseExpiryWarning({ daysLeft: 4, licenseKey: "TAAGER-TEST" }) === false, "warning stays hidden with four days left");
assert(body.children.length === 0, "no modal is mounted outside the final three days");

assert(windowObject.showLicenseExpiryWarning({ daysLeft: 3, licenseKey: "TAAGER-TEST" }) === true, "warning opens with three days left");
let modal = body.children.at(-1);
assert(modal.innerHTML.includes("Your license expires soon"), "English warning copy is rendered");
assert(modal.innerHTML.includes("<strong>3</strong>"), "remaining-day count is rendered");
assert(modal.attributes.dir === "ltr", "English warning uses LTR layout");

modal.closeElements[0].listeners.click();
assert(windowObject.showLicenseExpiryWarning({ daysLeft: 3, licenseKey: "TAAGER-TEST" }) === false, "dismissed warning does not repeat for the same day count");
assert(windowObject.showLicenseExpiryWarning({ daysLeft: 2, licenseKey: "TAAGER-TEST" }) === true, "warning returns when the remaining-day count changes");
assert(windowObject.showLicenseExpiryWarning({ daysLeft: 1, licenseKey: "TAAGER-TEST" }) === true, "open warning refreshes when the remaining-day count changes");
assert(body.children.at(-1).innerHTML.includes("<strong>1</strong>"), "refreshed warning shows the latest remaining-day count");

windowObject._kbotLang = "ar";
windowObject._kbotUser = { daysLeft: 1, licenseKey: "TAAGER-TEST" };
windowListeners["taager-lang-change"]();
modal = body.children.at(-1);
assert(modal.innerHTML.includes("ترخيصك على وشك الانتهاء"), "Arabic warning copy is rendered after language switch");
assert(modal.attributes.dir === "rtl", "Arabic warning uses RTL layout");

modal.supportElement.listeners.click();
assert(supportOpenCount === 1, "renew button opens centralized support");

documentListeners.keydown({ key: "Escape" });
assert(windowObject.isLicenseExpiryWarningVisible() === false, "Escape dismisses the warning");

console.log("License expiry warning behavior verified.");
