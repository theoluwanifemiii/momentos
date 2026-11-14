import test from "node:test";
import assert from "node:assert/strict";
import {
  findInvalidPlaceholders,
  normalizeCampaignPhone,
  validateCampaignCsv,
} from "../src/services/campaignCsvValidator";

// All numbers below are made up.

test("normalizeCampaignPhone handles the shapes found in real church lists", () => {
  const cases: Array<[string, string]> = [
    ["08031234567", "+2348031234567"],
    ["8031234567", "+2348031234567"], // leading 0 dropped by a spreadsheet
    ["0803 123 4567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    ["+2340803123 4567", "+2348031234567"], // trunk 0 after country code
    ["002348031234567", "+2348031234567"],
    ["08031234567,", "+2348031234567"],
    ["‪08031234567‬", "+2348031234567"], // bidi marks from a phone
    ["0803 123 4567   / +234 805 765 4321", "+2348031234567"], // two numbers
    ["+447700900123", "+447700900123"],
  ];
  for (const [input, expected] of cases) {
    const result = normalizeCampaignPhone(input);
    assert.ok(result.ok, `${input} should be valid`);
    assert.equal(result.ok && result.phone, expected, input);
  }
});

test("normalizeCampaignPhone rejects numbers that cannot receive SMS", () => {
  for (const input of ["Unknown", "", "0123", "01234567890", "080312345678", "+234 1 234 5678"]) {
    assert.equal(normalizeCampaignPhone(input).ok, false, input);
  }
});

test("validateCampaignCsv reads a headed file and derives first names", () => {
  const csv = [
    "first_name,full_name,email,phone,group",
    "Ada,Ada Obi,,08031234567,Choir",
    ",PST. TUNDE BAKARE,,08051234567,Ushers",
    "Chi,Chi Okafor,chi@example.com,8061234567,",
  ].join("\n");
  const result = validateCampaignCsv(csv, { channels: ["sms"] });
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.deepEqual(
    result.valid.map((c) => [c.firstName, c.lastName, c.phone]),
    [
      ["Ada", "Obi", "+2348031234567"],
      ["Tunde", "Bakare", "+2348051234567"],
      ["Chi", "Okafor", "+2348061234567"],
    ]
  );
  assert.deepEqual(result.valid[0].attributes, { group: "Choir" });
  assert.equal(result.valid[2].email, "chi@example.com");
  assert.equal(result.summary.withPhone, 3);
});

test("validateCampaignCsv flags duplicates, bad numbers and missing names", () => {
  const csv = [
    "name,phone",
    "Ada Obi,08031234567",
    "Ada Again,+234 803 123 4567",
    "Bad Number,0123",
    ",08071234567",
    "No Phone,",
  ].join("\n");
  const result = validateCampaignCsv(csv, { channels: ["sms"] });
  assert.equal(result.valid.length, 1);
  assert.deepEqual(
    result.errors.map((e) => [e.row, e.field]),
    [
      [3, "phone"],
      [4, "phone"],
      [5, "first_name"],
      [6, "phone"],
    ]
  );
  assert.match(result.errors[0].message, /Duplicate phone number \(same as row 2\)/);
  assert.equal(result.summary.duplicateRows, 1);
});

test("validateCampaignCsv detects columns in a headerless file", () => {
  const csv = [
    "31/12/2024 21:39:39,Ada Obi ,University of Lagos ,08031234567,06-26,",
    "01/01/2025 10:00:00,Tunde Bakare,Yaba Tech,8051234567,01-02,",
  ].join("\n");
  const result = validateCampaignCsv(csv, { channels: ["sms"] });
  assert.equal(result.summary.headerInferred, true);
  assert.deepEqual(
    result.valid.map((c) => [c.firstName, c.phone]),
    [
      ["Ada", "+2348031234567"],
      ["Tunde", "+2348051234567"],
    ]
  );
});

test("validateCampaignCsv uses a header it does not recognise when its values are phones", () => {
  const csv = ["Names,Telephone 1", "Ada Obi,08031234567", "Tunde Bakare,08051234567"].join("\n");
  const result = validateCampaignCsv(csv, { channels: ["sms"] });
  assert.equal(result.valid.length, 2);
});

test("validateCampaignCsv enforces the contact limit", () => {
  const rows = ["first_name,phone"];
  for (let i = 0; i < 6; i++) rows.push(`P${"a".repeat(i + 1)},080312345${String(i).padStart(2, "0")}`);
  const result = validateCampaignCsv(rows.join("\n"), { channels: ["sms"], maxContacts: 5 });
  assert.equal(result.valid.length, 0);
  assert.match(result.errors[0].message, /at most 5 contacts/);
});

test("findInvalidPlaceholders catches tokens the sender would leave in the text", () => {
  assert.deepEqual(findInvalidPlaceholders("Hi {{first_name}}, see you Sunday"), []);
  assert.deepEqual(findInvalidPlaceholders("Hi {{firstname}}"), ["{{firstname}}"]);
  assert.deepEqual(findInvalidPlaceholders("Hi {{ first_name }}"), ["{{ first_name }}"]);
  assert.deepEqual(findInvalidPlaceholders("Hi {first_name}"), ["{first_name}"]);
  assert.deepEqual(findInvalidPlaceholders("<div>{{body}}</div>"), []);
});
