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
  { country: "iq", local: "7712345678", trailing: "7712345678964", formatted: "9647712345678" },
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

assert.strictEqual(
  normalizePhone("8560212438", "sa"),
  "560212438",
  "sa overlong phone with a leading stray digit should keep the valid Saudi mobile window"
);
assert.deepStrictEqual(
  normalizePhoneCandidatesWithMeta("8560212438", "sa"),
  [{ digits: "560212438", uncertain: false, correction: "valid_sliding_window" }],
  "sa candidate expansion should remove the leading stray digit before upload/recovery"
);

const trailingExtraZeroCases = [
  { country: "sa", raw: "05012345670", local: "501234567", formatted: "966501234567" },
  { country: "eg", raw: "010012345670", local: "1001234567", formatted: "201001234567" },
  { country: "ae", raw: "05012345670", local: "501234567", formatted: "971501234567" },
  { country: "iq", raw: "077056656620", local: "7705665662", formatted: "9647705665662" },
  { country: "om", raw: "0912345670", local: "91234567", formatted: "96891234567" },
];

for (const item of trailingExtraZeroCases) {
  assert.deepStrictEqual(
    normalizePhoneWithMeta(item.raw, item.country),
    { digits: item.local, uncertain: false, correction: "trailing_extra_zero" },
    `${item.country} should rescue one extra trailing zero`
  );
  assert.deepStrictEqual(
    normalizePhoneCandidatesWithMeta(item.raw, item.country),
    [{ digits: item.local, uncertain: false, correction: "trailing_extra_zero" }],
    `${item.country} candidate expansion should rescue one extra trailing zero`
  );
  assert.strictEqual(
    formatPhone(item.raw, item.country),
    item.formatted,
    `${item.country} extra trailing zero rescue should format with the country dial code`
  );
}

for (const invalidIraqPhone of ["07123456789", "07612345678", "9647412345678"]) {
  assert.strictEqual(
    normalizePhone(invalidIraqPhone, "iq"),
    null,
    `iq should reject ${invalidIraqPhone} because only 75, 77, 78, and 79 are allowed`
  );
}

assert.strictEqual(
  normalizePhone("071234567890", "iq"),
  null,
  "iq extra trailing zero rescue should still reject disallowed prefixes"
);

console.log("Phone normalization trailing dial-code cases verified");
