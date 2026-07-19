(function () {
  'use strict';

  // Make sure TAAGER_LOCALES is initialized by the time this runs
  window.TAAGER_LOCALES = window.TAAGER_LOCALES || {};

  function getVal(obj, path, args) {
    var parts = path.split('.');
    var val = obj;
    for (var i = 0; i < parts.length; i++) {
      if (val == null) return null;
      val = val[parts[i]];
    }
    if (val == null) return null;

    if (typeof val === 'string' && args) {
      for (var key in args) {
        val = val.replace(new RegExp('\\{' + key + '\\}', 'g'), args[key]);
      }
    }
    return val;
  }

  function isQuestionMarkText(text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return false;
    var letters = text.replace(/[\s\d.,:;()[\]{}+\-*/%|_'"`~!@#$^&=<>\\]/g, '');
    return letters.length > 0 && /^[?؟]+$/.test(letters);
  }

  function hasMojibake(text) {
    return /[\u00c3\u00c2\u00d8\u00d9\u00d0\u00d1\u00f0\u00e2]/.test(String(text || ''));
  }

  function cp1252Byte(code) {
    if (code <= 0xff) return code;
    var map = {
      0x20ac: 0x80,
      0x201a: 0x82,
      0x0192: 0x83,
      0x201e: 0x84,
      0x2026: 0x85,
      0x2020: 0x86,
      0x2021: 0x87,
      0x02c6: 0x88,
      0x2030: 0x89,
      0x0160: 0x8a,
      0x2039: 0x8b,
      0x0152: 0x8c,
      0x017d: 0x8e,
      0x2018: 0x91,
      0x2019: 0x92,
      0x201c: 0x93,
      0x201d: 0x94,
      0x2022: 0x95,
      0x2013: 0x96,
      0x2014: 0x97,
      0x02dc: 0x98,
      0x2122: 0x99,
      0x0161: 0x9a,
      0x203a: 0x9b,
      0x0153: 0x9c,
      0x017e: 0x9e,
      0x0178: 0x9f
    };
    return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
  }

  function decodeMojibake(text) {
    text = String(text == null ? '' : text);
    if (window.dashboardI18n && typeof window.dashboardI18n.decodeMojibake === 'function') {
      return window.dashboardI18n.decodeMojibake(text);
    }
    if (!hasMojibake(text) || typeof TextDecoder !== 'function') return text;
    var current = text;
    for (var pass = 0; pass < 3; pass++) {
      if (!hasMojibake(current)) break;
      var bytes = [];
      var ok = true;
      for (var i = 0; i < current.length; i++) {
        var byte = cp1252Byte(current.charCodeAt(i));
        if (byte == null) {
          ok = false;
          break;
        }
        bytes.push(byte);
      }
      if (!ok) break;
      try {
        var decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
        if (!decoded || decoded === current) break;
        current = decoded;
      } catch (e) {
        break;
      }
    }
    return current;
  }

  function cleanText(value) {
    if (value == null) return value;
    if (window.dashboardI18n && typeof window.dashboardI18n.clean === 'function') {
      return window.dashboardI18n.clean(value);
    }
    var output = decodeMojibake(value);
    if (isQuestionMarkText(output)) return '';
    return output.replace(/[?؟]+/g, '').replace(/\uFFFD+/g, '').trim();
  }

  function cleanDom(root) {
    root = root || document.body;
    if (!root || typeof document.createTreeWalker !== 'function') return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|TEXTAREA)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return (hasMojibake(node.nodeValue) || isQuestionMarkText(node.nodeValue) || /\uFFFD|[?؟]+/.test(node.nodeValue || ''))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var next = cleanText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
    root.querySelectorAll && root.querySelectorAll('[title],[aria-label],[placeholder],[value]').forEach(function (el) {
      ['title', 'aria-label', 'placeholder', 'value'].forEach(function (attr) {
        if (!el.hasAttribute(attr)) return;
        var value = el.getAttribute(attr);
        if (!hasMojibake(value) && !isQuestionMarkText(value) && !/\uFFFD|[?؟]+/.test(value || '')) return;
        el.setAttribute(attr, cleanText(value));
      });
    });
  }

  function observePages() {
    if (!window.MutationObserver || window._taagerPageI18nObserver) return;
    window._taagerPageI18nObserver = new MutationObserver(function (mutations) {
      var roots = [];
      mutations.forEach(function (m) {
        var target = m.target && m.target.nodeType === 1 ? m.target : null;
        var root = target && target.closest ? target.closest('#page-analytics,#page-operations,#page-run-results') : null;
        if (root && roots.indexOf(root) === -1) roots.push(root);
      });
      roots.forEach(cleanDom);
    });
    window._taagerPageI18nObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder', 'value']
    });
    cleanDom(document.getElementById('page-analytics'));
    cleanDom(document.getElementById('page-operations'));
    cleanDom(document.getElementById('page-run-results'));
  }

  function translate(namespace, key, args) {
    var lang = window._kbotLang || 'ar'; // fallback to ar
    var langDict = window.TAAGER_LOCALES[lang];
    if (!langDict) return key;

    var nsDict = langDict[namespace];
    if (!nsDict) return key;

    var result = getVal(nsDict, key, args);
    if (result != null) return cleanText(result);
    if (args && args.default != null) return cleanText(args.default);
    return key;
  }

  window.t_anl = function(key, args) {
    return translate('analytics', key, args);
  };

  window.t_ops = function(key, args) {
    return translate('operations', key, args);
  };

  window.TaagerPageI18n = {
    clean: cleanText,
    apply: cleanDom,
    decodeMojibake: decodeMojibake
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observePages);
  } else {
    observePages();
  }

})();
