"use strict";

function unionSet(left, right) {
  const values = (value) => value instanceof Set || Array.isArray(value) ? value : [];
  return new Set([...values(left), ...values(right)]);
}

function mergeTaagerOrderKeySets(primary, supplemental) {
  const merged = new Set([...(primary instanceof Set ? primary : []), ...(supplemental instanceof Set ? supplemental : [])]);
  const primaryStatuses = primary && primary.taagerStatusByKey instanceof Map ? primary.taagerStatusByKey : new Map();
  const supplementalStatuses = supplemental && supplemental.taagerStatusByKey instanceof Map ? supplemental.taagerStatusByKey : new Map();
  const statusByKey = new Map();
  for (const source of [primaryStatuses, supplementalStatuses]) {
    for (const [key, records] of source) {
      statusByKey.set(key, [...(statusByKey.get(key) || []), ...(Array.isArray(records) ? records : [])]);
    }
  }

  // Preserve report counts from the original selected-range export; the
  // supplemental set is for de-duplication only.
  for (const property of [
    "taagerOrderCount",
    "taagerUniqueOrderNumbers",
    "taagerRowOrderCount",
    "taagerUniquePhones",
    "taagerAllPhoneSkuKeys",
    "taagerBlockingPhoneSkuKeys",
    "taagerDeliveredOnlyPhoneSkuKeys",
    "taagerRepeatAllowedOnlyPhoneSkuKeys",
  ]) {
    if (primary && primary[property] != null) merged[property] = primary[property];
  }
  merged.taagerStatusByKey = statusByKey;
  for (const property of ["taagerPhones", "taagerBlockingPhones", "taagerDeliveredOnlyPhones", "taagerRepeatAllowedOnlyPhones", "taagerSourceOrderIds"]) {
    merged[property] = unionSet(primary && primary[property], supplemental && supplemental[property]);
  }
  return merged;
}

module.exports = { mergeTaagerOrderKeySets };
