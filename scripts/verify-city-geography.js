"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const geo = require("../src/shared/country-geo-core");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

const EXPECTED_COUNTS = { eg: 24, iq: 19, ae: 7, om: 53 };
const appSource = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");
const geoStart = appSource.indexOf("window.TaagerGeo = (() => {");
const geoEnd = appSource.indexOf("function applyTheme", geoStart);
const documentStub = {
  documentElement: {
    lang: "en",
    dir: "ltr",
    getAttribute() { return null; },
    setAttribute() {},
  },
  createElement() {
    return {
      style: {},
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
      removeEventListener() {},
    };
  },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
  head: { appendChild() {} },
  body: { appendChild() {}, contains() { return false; } },
};
const geoContext = vm.createContext({
  window: {
    TaagerCountryGeoCore: geo,
    document: documentStub,
    addEventListener() {},
    removeEventListener() {},
  },
  document: documentStub,
  setTimeout(callback) {
    if (typeof callback === "function") callback();
    return 0;
  },
  clearTimeout() {},
  console,
});
vm.runInContext(appSource.slice(geoStart, geoEnd), geoContext);

function outlinePolygons(pathData) {
  return String(pathData || "").split(/Z/i).map((segment) =>
    Array.from(segment.matchAll(/[ML]?\s*(-?\d+(?:\.\d+)?)[, ]+(-?\d+(?:\.\d+)?)/gi))
      .map((match) => [Number(match[1]), Number(match[2])])
  ).filter((polygon) => polygon.length > 2);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    if (((current[1] > point[1]) !== (previous[1] > point[1])) &&
        point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0]) {
      inside = !inside;
    }
  }
  return inside;
}

Object.entries(EXPECTED_COUNTS).forEach(([country, expectedCount]) => {
  const cities = geo.officialCities(country);
  assert.equal(cities.length, expectedCount, country.toUpperCase() + " official city count");
  assert.equal(new Set(cities.map((city) => city.name)).size, expectedCount, country.toUpperCase() + " city names are unique");
  assert.equal(new Set(cities.map((city) => city.x + "|" + city.y)).size, expectedCount, country.toUpperCase() + " city coordinates are unique");
  const polygons = outlinePolygons(geoContext.window.TaagerGeo.outline(country));
  cities.forEach((city) => {
    assert.notEqual(geo.resolveRegion(city.name, country), "other", country.toUpperCase() + " resolves " + city.name);
    assert.ok(geo.cityPoint(city.name, country), country.toUpperCase() + " has a point for " + city.name);
    assert.ok(polygons.some((polygon) => pointInPolygon([city.x, city.y], polygon)), country.toUpperCase() + " point is inside map for " + city.name);
  });
});

assert.equal(geo.canonicalCity("الإسكندرية", "eg"), "الأسكندرية", "Egypt historical spelling canonicalizes");
assert.equal(geo.canonicalCity("البصرة", "iq"), "بصرة", "Iraq historical spelling canonicalizes");
assert.equal(geo.canonicalCity("unspecified", "eg"), "", "Invalid city is rejected");
assert.equal(geo.resolveRegion("حلبجة", "iq"), "kurdistan", "Halabja is mapped");
assert.notEqual(geo.resolveRegion("دماء والطائين", "om"), "other", "All official Oman cities are mapped");

const accounts = {
  eg: {
    country: "eg",
    snapshot: [
      { taagerOrderNumber: "EG-1", taagerCountry: "eg", createdAt: "2026-05-01", orderStatusBucket: "delivered", city: "الإسكندرية" },
      { taagerOrderNumber: "EG-2", taagerCountry: "eg", createdAt: "2026-05-01", orderStatusBucket: "delivered", city: "unspecified" },
    ],
  },
  iq: {
    country: "iq",
    snapshot: [
      { taagerOrderNumber: "IQ-1", taagerCountry: "iq", createdAt: "2026-05-01", orderStatusBucket: "delivered", city: "حلبجة" },
    ],
  },
};
const service = createDashboardQueryService({
  getAccounts: () => accounts,
  getAllowedAccountIds: () => ["eg", "iq"],
  getRevision: () => 1,
});
const result = service.query({
  kind: "cities",
  accountIds: ["eg", "iq"],
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  isMixedCountry: true,
});
assert.equal(result.ok, true, "Cities query succeeds");
assert.equal(result.unmappedCityCount, 1, "Invalid city is counted but excluded from geography");
assert.ok(result.cities.some((city) => city.name === "الأسكندرية" && city.provinceId === "eg-alex"), "Egypt city is canonical and mapped");
assert.ok(result.cities.some((city) => city.name === "حلبجة" && city.provinceId === "iq-kurdistan"), "Iraq city is mapped");
assert.ok(!result.cities.some((city) => city.name === "unspecified"), "Invalid city is absent from city results");

const citiesSource = fs.readFileSync(path.join(__dirname, "../src/renderer/pages/dashboard/sections/section-cities.js"), "utf8");
const codSource = fs.readFileSync(path.join(__dirname, "../src/renderer/pages/dashboard/sections/section4-cod.js"), "utf8");
assert.ok(citiesSource.includes("TaagerGeo.officialCities"), "Cities map renders official baseline cities");
assert.ok(codSource.includes("TaagerGeo.officialCities"), "COD map renders official baseline cities");
assert.ok(codSource.includes("cities: cod.cities ?? cod.mapCities"), "COD prefers the complete city list");

console.log("City geography verification passed.");
