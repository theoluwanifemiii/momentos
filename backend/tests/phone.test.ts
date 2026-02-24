import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOptionalPhone, normalizePhone } from "../src/services/phone";

const withDefaultCountryCode = async (countryCode: string, fn: () => void | Promise<void>) => {
  const previous = process.env.DEFAULT_PHONE_COUNTRY_CODE;
  process.env.DEFAULT_PHONE_COUNTRY_CODE = countryCode;
  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.DEFAULT_PHONE_COUNTRY_CODE;
    } else {
      process.env.DEFAULT_PHONE_COUNTRY_CODE = previous;
    }
  }
};

test("normalizePhone strips local trunk zero when adding default country code", async () => {
  await withDefaultCountryCode("234", () => {
    assert.equal(normalizePhone("09038313832"), "+2349038313832");
  });
});

test("normalizePhone fixes malformed +countryCode0 prefix", async () => {
  await withDefaultCountryCode("234", () => {
    assert.equal(normalizePhone("+23409038313832"), "+2349038313832");
    assert.equal(normalizePhone("23409038313832"), "+2349038313832");
  });
});

test("normalizePhone preserves valid international numbers", async () => {
  await withDefaultCountryCode("234", () => {
    assert.equal(normalizePhone("+14155552671"), "+14155552671");
  });
});

test("normalizeOptionalPhone returns null for empty values", () => {
  assert.equal(normalizeOptionalPhone(""), null);
  assert.equal(normalizeOptionalPhone("   "), null);
  assert.equal(normalizeOptionalPhone(null), null);
});

test("normalizePhone errors when DEFAULT_PHONE_COUNTRY_CODE is non-numeric", async () => {
  await withDefaultCountryCode("abc", () => {
    assert.throws(() => normalizePhone("09038313832"), /DEFAULT_PHONE_COUNTRY_CODE is invalid/);
  });
});
