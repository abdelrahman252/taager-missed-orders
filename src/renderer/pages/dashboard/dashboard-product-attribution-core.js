(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TaagerProductAttribution = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = 3;
  var MAX_CANDIDATES = 5;
  var ARABIC_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
  var NAME_STOP_WORDS = {
    ad: true, ads: true, campaign: true, campaigns: true, sales: true, sale: true,
    lead: true, leads: true, tiktok: true, tik: true, tok: true, snapchat: true,
    snap: true, sc: true, facebook: true, fb: true, meta: true, ksa: true,
    saudi: true, offer: true, new: true, test: true, original: true, product: true,
    "\u0645\u0646\u062a\u062c": true,
    "\u0639\u0631\u0636": true,
    "\u062c\u062f\u064a\u062f": true,
    "\u0627\u0635\u0644\u064a": true,
    "\u062d\u0645\u0644\u0647": true,
    "\u062c\u0647\u0627\u0632": true,
    "\u0639\u062f\u062f": true,
    "\u0642\u0637\u0639\u0647": true,
    "\u062d\u0628\u0647": true
  };

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeText(value) {
    return text(value).toLowerCase().normalize("NFKC")
      .replace(/[\u0660-\u0669]/g, function (digit) { return String(ARABIC_DIGITS.indexOf(digit)); })
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
      .replace(/\u0640/g, "")
      .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
      .replace(/[\u0649\u0626]/g, "\u064a")
      .replace(/\u0624/g, "\u0648")
      .replace(/[\u0629\u0647]/g, "\u0647")
      .replace(/[^\w\u0600-\u06ff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactText(value) {
    return normalizeText(value).replace(/[^\w\u0600-\u06ff]+/g, "");
  }

  function hasTerm(normalizedText, normalizedTerm) {
    return !!normalizedTerm &&
      (" " + normalizedText + " ").indexOf(" " + normalizedTerm + " ") !== -1;
  }

  function parseSkuList(value) {
    var source = Array.isArray(value) ? value : [value];
    var seen = {};
    var list = [];
    source.forEach(function (item) {
      text(item).split(/[\r\n,|]+/).forEach(function (part) {
        var raw = text(part);
        var normalized = normalizeText(raw);
        var compact = compactText(raw);
        if (!compact || compact === "na" || compact.length < 2 || seen[compact]) return;
        seen[compact] = true;
        list.push({ raw: raw, normalized: normalized, compact: compact });
      });
    });
    return list;
  }

  function nameTokens(value) {
    return normalizeText(value).split(" ").filter(function (token) {
      return token.length >= 3 &&
        !NAME_STOP_WORDS[token] &&
        !/^x\d+$/i.test(token) &&
        !/^\d+$/.test(token);
    });
  }

  function productId(product, index) {
    return text(product && (product.id || product.key || product.legacyKey || product.sku || product.name)) || "product-" + index;
  }

  function productAccountIds(product) {
    var ids = [];
    var direct = text(product && (product.accountId || product.dashboardAccountId));
    if (direct) ids.push(direct);
    Object.keys(product && product.accounts || {}).forEach(function (id) {
      if (text(id) && ids.indexOf(text(id)) === -1) ids.push(text(id));
    });
    return ids;
  }

  function normalizeCountry(value) {
    var country = normalizeText(value);
    return country === "unknown" || country === "na" || country === "n a" ? "" : country;
  }

  function overrideName(product, skuList, overrides) {
    var map = overrides && typeof overrides === "object" ? overrides : {};
    for (var i = 0; i < skuList.length; i += 1) {
      var raw = skuList[i].raw;
      var exact = text(map[raw]);
      if (exact) return exact;
      var wanted = raw.toLowerCase();
      var keys = Object.keys(map);
      for (var j = 0; j < keys.length; j += 1) {
        if (keys[j].toLowerCase() === wanted && text(map[keys[j]])) return text(map[keys[j]]);
      }
    }
    return text(product && (product.displayName || product.productName || product.product || product.name));
  }

  function createProductIndex(products, options) {
    options = options || {};
    var entries = (Array.isArray(products) ? products : []).map(function (product, index) {
      var skus = parseSkuList(product && (product.skus || product.sku || product.sku_code || product.skuCode));
      var name = overrideName(product, skus, options.productNameOverrides);
      var normalizedName = normalizeText(name);
      var resolvedProduct = name
        ? Object.assign({}, product, { name: name, product: name })
        : product;
      return {
        id: productId(product, index),
        idx: index,
        product: resolvedProduct,
        accountIds: productAccountIds(product),
        country: normalizeCountry(product && (product.country || product.taagerCountry)),
        skus: skus,
        name: name,
        normalizedName: normalizedName,
        tokens: nameTokens(name)
      };
    });
    var tokenOwners = {};
    entries.forEach(function (entry) {
      entry.tokens.forEach(function (token) {
        tokenOwners[token] = (tokenOwners[token] || 0) + 1;
      });
    });
    return {
      version: VERSION,
      entries: entries,
      tokenOwners: tokenOwners
    };
  }

  function campaignName(value) {
    if (value && typeof value === "object") {
      return text(value.campaign || value.campaignName || value.name || value.campaign_name);
    }
    return text(value);
  }

  function hasUnknownSkuToken(value) {
    var raw = campaignName(value);
    if (/\bsku[-_][a-z0-9_-]{2,}\b/i.test(raw)) return true;
    return (raw.match(/[a-z0-9]+/gi) || []).some(function (token) {
      var letters = (token.match(/[a-z]/gi) || []).length;
      var digits = (token.match(/\d/g) || []).length;
      return token.length >= 8 && letters >= 2 && digits >= 3;
    });
  }

  function scopeFor(value, options) {
    options = options || {};
    var row = value && typeof value === "object" ? value : {};
    var accountId = text(options.accountId || row.dashboardAccountId || row.accountId);
    return {
      accountId: accountId === "__all__" ? "" : accountId,
      country: normalizeCountry(options.country || row.country || row.taagerCountry)
    };
  }

  function inScope(entry, scope) {
    if (scope.accountId && entry.accountIds.length && entry.accountIds.indexOf(scope.accountId) === -1) return false;
    if (scope.country && entry.country && scope.country !== entry.country) return false;
    return true;
  }

  function candidateIds(entries) {
    var seen = {};
    return entries.map(function (entry) { return entry.id; }).filter(function (id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    }).slice(0, MAX_CANDIDATES);
  }

  function unmatched(detail, entries) {
    return {
      status: "unmatched",
      product: null,
      productIndex: -1,
      method: "unmatched",
      matchDetail: detail || "no_match",
      confidence: "none",
      matchedSku: "",
      candidateIds: candidateIds(entries || [])
    };
  }

  function ambiguous(detail, entries) {
    return {
      status: "ambiguous",
      product: null,
      productIndex: -1,
      method: "ambiguous",
      matchDetail: detail || "multiple_skus",
      confidence: "none",
      matchedSku: "",
      candidateIds: candidateIds(entries || [])
    };
  }

  function matched(entry, method, detail, confidence, matchedSku) {
    return {
      status: "matched",
      product: entry.product,
      productIndex: entry.idx,
      method: method,
      matchDetail: detail,
      confidence: confidence,
      matchedSku: matchedSku || "",
      candidateIds: [entry.id]
    };
  }

  function pruneNestedSkuMatches(matches) {
    return matches.filter(function (candidate) {
      return !matches.some(function (other) {
        return other.sku.compact !== candidate.sku.compact &&
          other.sku.compact.length > candidate.sku.compact.length &&
          other.sku.compact.indexOf(candidate.sku.compact) !== -1;
      });
    });
  }

  function skuMatch(normalizedCampaign, compactCampaign, entries) {
    var matches = [];
    entries.forEach(function (entry) {
      entry.skus.forEach(function (sku) {
        var separated = hasTerm(normalizedCampaign, sku.normalized);
        if (separated || compactCampaign.indexOf(sku.compact) !== -1) {
          matches.push({ entry: entry, sku: sku, separated: separated });
        }
      });
    });
    if (!matches.length) return null;
    var maximal = pruneNestedSkuMatches(matches);
    var bySku = {};
    maximal.forEach(function (match) {
      if (!bySku[match.sku.compact]) bySku[match.sku.compact] = [];
      bySku[match.sku.compact].push(match);
    });
    var detectedSkus = Object.keys(bySku);
    if (detectedSkus.length > 1) {
      var multiEntries = [];
      var multiSeen = {};
      maximal.forEach(function (match) {
        if (multiSeen[match.entry.id]) return;
        multiSeen[match.entry.id] = true;
        multiEntries.push(match.entry);
      });
      if (multiEntries.length > 1) return ambiguous("multiple_skus", multiEntries);
      return matched(
        multiEntries[0],
        "sku",
        "multiple_skus_same_product",
        "high",
        maximal.map(function (match) { return match.sku.raw; }).join(", ")
      );
    }
    var skuMatches = bySku[detectedSkus[0]] || [];
    var uniqueEntries = [];
    var seenEntries = {};
    skuMatches.forEach(function (match) {
      if (seenEntries[match.entry.id]) return;
      seenEntries[match.entry.id] = true;
      uniqueEntries.push(match.entry);
    });
    if (uniqueEntries.length !== 1) return ambiguous("duplicate_sku_products", uniqueEntries);
    var winningEntry = uniqueEntries[0];
    var winningMatch = skuMatches.find(function (match) { return match.entry.id === winningEntry.id && match.separated; }) ||
      skuMatches.find(function (match) { return match.entry.id === winningEntry.id; });
    return matched(
      winningEntry,
      "sku",
      winningMatch.separated ? "separated_sku" : "glued_sku",
      "high",
      winningMatch.sku.raw
    );
  }

  function nameScore(normalizedCampaign, entry) {
    if (!entry.normalizedName) return null;
    var fullPhrase = hasTerm(normalizedCampaign, entry.normalizedName);
    if (fullPhrase) {
      return { score: 1000 + entry.normalizedName.length, detail: "name_phrase", confidence: "high" };
    }
    return null;
  }

  function nameMatch(normalizedCampaign, entries, index) {
    var scored = entries.map(function (entry) {
      var score = nameScore(normalizedCampaign, entry);
      return score ? { entry: entry, score: score } : null;
    }).filter(Boolean).sort(function (a, b) {
      return b.score.score - a.score.score;
    });
    if (!scored.length) return unmatched("no_match");
    if (scored[1] && scored[0].score.score === scored[1].score.score) {
      var tied = scored.filter(function (item) { return item.score.score === scored[0].score.score; });
      return unmatched("ambiguous_name", tied.map(function (item) { return item.entry; }));
    }
    return matched(scored[0].entry, "name", scored[0].score.detail, scored[0].score.confidence, "");
  }

  function matchCampaign(value, index, options) {
    index = index && Array.isArray(index.entries) ? index : createProductIndex([]);
    var rawCampaign = campaignName(value);
    var normalizedCampaign = normalizeText(rawCampaign);
    if (!normalizedCampaign) return unmatched("empty_campaign");
    var compactCampaign = compactText(rawCampaign);
    var scope = scopeFor(value, options);
    var entries = index.entries.filter(function (entry) { return inScope(entry, scope); });
    var skuResult = skuMatch(normalizedCampaign, compactCampaign, entries);
    if (skuResult) return skuResult;
    if (hasUnknownSkuToken(value)) return unmatched("unknown_sku");
    return nameMatch(normalizedCampaign, entries, index);
  }

  return {
    VERSION: VERSION,
    normalizeText: normalizeText,
    compactText: compactText,
    hasTerm: hasTerm,
    parseSkuList: parseSkuList,
    createProductIndex: createProductIndex,
    matchCampaign: matchCampaign
  };
});
