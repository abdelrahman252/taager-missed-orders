"use strict";

const assert = require("assert");
const {
  normalizePhone,
  normalizePhoneWithMeta,
  normalizePhoneCandidatesWithMeta,
  formatPhone,
} = require("../src/bot/phone");

const cases = [
  { country: "sa", local: "530817719", trailing: "530817719966", formatted: "966530817719" },
  { country: "sa", local: "555555555", trailing: "555555555966", formatted: "966555555555" },
  { country: "eg", local: "1001234567", trailing: "100123456720", formatted: "201001234567" },
  { country: "ae", local: "501234567", trailing: "501234567971", formatted: "971501234567" },
  { country: "iq", local: "7123456789", trailing: "7123456789964", formatted: "9647123456789" },
  { country: "om", local: "91234567", trailing: "91234567968", formatted: "96891234567" },
];

for (const item of cases) {
  assert.strictEqual(
    normalizePhone(item.trailing, item.country),
    item.local,
    `${item.country} trailing dial code should normalize to the local phone`
  );

  const meta = normalizePhoneWithMeta(item.trailing, item.country);
  assert.deepStrictEqual(
    meta,
    { digits: item.local, uncertain: false, correction: "trailing_dial_code" },
    `${item.country} trailing dial code should be classified explicitly`
  );

  assert.deepStrictEqual(
    normalizePhoneCandidatesWithMeta(item.trailing, item.country),
    [{ digits: item.local, uncertain: false, correction: "trailing_dial_code" }],
    `${item.country} candidate expansion should not emit shifted phone windows`
  );

  assert.strictEqual(
    formatPhone(item.trailing, item.country),
    item.formatted,
    `${item.country} formatted phone should move the dial code back to the front`
  );
}

console.log("Phone normalization trailing dial-code cases verified");
