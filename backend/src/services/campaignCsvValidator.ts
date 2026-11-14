// Parses an uploaded campaign recipient list. Campaign contacts are stored
// against the campaign only and never enter the People table.
//
// Built for the lists churches and small teams actually export: missing header
// rows, local numbers with or without the leading 0, invisible Unicode marks
// copied from phones, two numbers in one cell, and ALL-CAPS names with titles.

import { parse } from "csv-parse/sync";
import { z } from "zod";

/** Hard cap on contacts per campaign; also bounds what one upload can cost. */
export const MAX_CAMPAIGN_CONTACTS = 2000;

/** Served by GET /api/campaigns/csv-template. */
export const CAMPAIGN_CSV_TEMPLATE =
  "first_name,last_name,email,phone\n" +
  "Ada,Obi,ada@example.com,08012345678\n" +
  "Tunde,Bakare,,+2348098765432\n";

/** Variables a campaign message may use. Mirrored in frontend/src/lib/campaignRender.ts. */
export const CAMPAIGN_PLACEHOLDERS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "campaign_name",
] as const;

export interface ParsedCampaignContact {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  /** Extra columns from the file (e.g. "group"), kept for reference. */
  attributes: Record<string, string> | null;
}

export interface CampaignCsvError {
  row: number;
  field?: string;
  message: string;
}

export interface CampaignCsvResult {
  valid: ParsedCampaignContact[];
  errors: CampaignCsvError[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    duplicateRows: number;
    withEmail: number;
    withPhone: number;
    /** True when the file had no header row and columns were detected from content. */
    headerInferred: boolean;
  };
}

export interface CampaignCsvOptions {
  /** Channels the campaign sends on. Each contact needs a usable value for at least one. */
  channels?: Array<"email" | "sms">;
  /** Digits only. Numbers without a country code are treated as this country. */
  defaultCountryCode?: string;
  maxContacts?: number;
}

/* ------------------------------------------------------------------ */
/* Phone numbers                                                       */
/* ------------------------------------------------------------------ */

// Bidi/zero-width marks phones add when a number is copied from contacts.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;

export type PhoneResult = { ok: true; phone: string } | { ok: false; error: string };

const normalizeSinglePhone = (raw: string, cc: string): PhoneResult => {
  let s = raw.replace(INVISIBLE, "").trim();
  if (!s) return { ok: false, error: "Phone number is empty" };
  if (/[a-z]/i.test(s)) return { ok: false, error: `"${raw.trim()}" is not a phone number` };

  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  // A "+" anywhere but the front is a typo; keep the digits.
  const hasPlus = s.startsWith("+");
  let digits = s.replace(/\+/g, "");

  if (hasPlus || digits.startsWith(cc)) {
    if (digits.startsWith(`${cc}0`)) digits = cc + digits.slice(cc.length + 1); // +2340803… → +234803…
  } else if (digits.startsWith("0")) {
    digits = cc + digits.slice(1); // 0803… → +234803…
  } else {
    digits = cc + digits; // 803… (leading 0 dropped by a spreadsheet) → +234803…
  }

  if (cc === "234" && digits.startsWith("234")) {
    const national = digits.slice(3);
    if (!/^[789]\d{9}$/.test(national)) {
      return {
        ok: false,
        error: `"${raw.trim()}" is not a valid Nigerian mobile number`,
      };
    }
    return { ok: true, phone: `+${digits}` };
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return { ok: false, error: `"${raw.trim()}" is not a valid phone number` };
  }
  return { ok: true, phone: `+${digits}` };
};

/**
 * Normalises one cell to E.164. A cell holding several numbers
 * ("0803 123 4567 / +234 805 …") yields the first valid one.
 */
export function normalizeCampaignPhone(raw: string, defaultCountryCode = "234"): PhoneResult {
  const cc = defaultCountryCode.replace(/\D/g, "") || "234";
  const parts = raw
    .replace(INVISIBLE, "")
    .split(/\s*(?:\/|;|\||,|\bor\b|&)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Phone number is empty" };

  let firstError: PhoneResult | null = null;
  for (const part of parts) {
    const result = normalizeSinglePhone(part, cc);
    if (result.ok) return result;
    firstError = firstError || result;
  }
  return firstError!;
}

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

const TITLES = new Set(
  [
    "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "engr", "barr", "rev",
    "pastor", "pst", "bro", "brother", "sis", "sister", "deacon", "dcn",
    "deaconess", "dcns", "elder", "evang", "evangelist", "minister", "min",
    "chief", "hon", "sir", "madam", "mummy", "daddy", "aunty", "uncle",
  ].map((t) => t.toLowerCase())
);

const cleanText = (value: unknown) =>
  String(value ?? "")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();

/** Title-cases names typed ALL CAPS or all lower; leaves mixed case alone. */
const tidyCase = (name: string) => {
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
};

const splitFullName = (fullName: string) => {
  const words = cleanText(fullName).split(" ").filter(Boolean);
  while (words.length > 1 && TITLES.has(words[0].toLowerCase().replace(/\.$/, ""))) {
    words.shift();
  }
  return {
    first: words[0] ? tidyCase(words[0]) : "",
    last: words.length > 1 ? tidyCase(words.slice(1).join(" ")) : "",
  };
};

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

type Field = "first_name" | "last_name" | "full_name" | "email" | "phone";

const HEADER_ALIASES: Record<string, Field> = {
  first_name: "first_name", firstname: "first_name", first: "first_name",
  given_name: "first_name", forename: "first_name",
  last_name: "last_name", lastname: "last_name", surname: "last_name",
  family_name: "last_name", last: "last_name",
  full_name: "full_name", fullname: "full_name", name: "full_name",
  names: "full_name", member: "full_name", member_name: "full_name",
  email: "email", email_address: "email", e_mail: "email", mail: "email",
  phone: "phone", phone_number: "phone", phonenumber: "phone",
  mobile: "phone", mobile_number: "phone", telephone: "phone", tel: "phone",
  whatsapp: "phone", whatsapp_number: "phone", number: "phone",
  numbers: "phone", phone_numbers: "phone", phones: "phone", phone_no: "phone",
  mobile_no: "phone", tel_no: "phone", contact: "phone", contacts: "phone",
  contact_number: "phone", gsm: "phone", gsm_number: "phone",
};

const headerKey = (value: string) =>
  cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const looksLikeName = (value: string) =>
  /^[\p{L}.'\- ]{2,}$/u.test(value) && value.split(" ").length <= 6;

interface ColumnMap {
  fields: Partial<Record<Field, number>>;
  extras: Array<{ index: number; key: string }>;
  hasHeader: boolean;
}

/**
 * Uses the header row when it names at least one known column. Otherwise the
 * file is treated as headerless: the phone column is the one whose values
 * mostly parse as numbers, and the name column is the left-most column of
 * mostly name-like text.
 */
const mapColumns = (rows: string[][], cc: string): ColumnMap | null => {
  const header = rows[0] || [];
  const fields: Partial<Record<Field, number>> = {};
  const extras: Array<{ index: number; key: string }> = [];

  header.forEach((cell, index) => {
    const key = headerKey(cell);
    const field = HEADER_ALIASES[key];
    if (field && fields[field] === undefined) fields[field] = index;
    else if (key) extras.push({ index, key });
  });

  const width = Math.max(...rows.map((r) => r.length));
  const share = (sample: string[][], index: number, test: (v: string) => boolean) => {
    const values = sample.map((r) => cleanText(r[index])).filter(Boolean);
    if (values.length === 0) return 0;
    return values.filter(test).length / values.length;
  };
  const isPhone = (v: string) => normalizeCampaignPhone(v, cc).ok;

  if (Object.keys(fields).length > 0) {
    // A header named something unexpected ("Telephone 1") still counts as the
    // phone column when its values are clearly phone numbers.
    if (fields.phone === undefined) {
      const body = rows.slice(1, 201);
      const candidate = extras.find((extra) => share(body, extra.index, isPhone) >= 0.8);
      if (candidate) {
        fields.phone = candidate.index;
        extras.splice(extras.indexOf(candidate), 1);
      }
    }
    return { fields, extras, hasHeader: true };
  }

  const sample = rows.slice(0, 200);
  let phoneCol = -1;
  let best = 0;
  for (let i = 0; i < width; i++) {
    const s = share(sample, i, isPhone);
    if (s > best) {
      best = s;
      phoneCol = i;
    }
  }
  if (phoneCol < 0 || best < 0.5) return null;

  let nameCol = -1;
  for (let i = 0; i < width; i++) {
    if (i !== phoneCol && share(sample, i, looksLikeName) >= 0.5) {
      nameCol = i;
      break;
    }
  }
  if (nameCol < 0) return null;

  return { fields: { phone: phoneCol, full_name: nameCol }, extras: [], hasHeader: false };
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const emailSchema = z.string().email();

export function validateCampaignCsv(
  csvContent: string,
  options: CampaignCsvOptions = {}
): CampaignCsvResult {
  const channels = options.channels?.length ? options.channels : ["email", "sms"];
  const needEmail = channels.includes("email");
  const needSms = channels.includes("sms");
  const cc = (options.defaultCountryCode || "234").replace(/\D/g, "") || "234";
  const maxContacts = options.maxContacts ?? MAX_CAMPAIGN_CONTACTS;

  const errors: CampaignCsvError[] = [];
  const valid: ParsedCampaignContact[] = [];
  const emptySummary = (errorRows: number) => ({
    totalRows: 0,
    validRows: 0,
    errorRows,
    duplicateRows: 0,
    withEmail: 0,
    withPhone: 0,
    headerInferred: false,
  });

  let rows: string[][];
  try {
    rows = parse(csvContent, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      bom: true,
    }) as string[][];
  } catch (err: any) {
    return {
      valid,
      errors: [{ row: 0, message: `Could not read the CSV: ${err.message}` }],
      summary: emptySummary(1),
    };
  }

  rows = rows.filter((r) => r.some((cell) => cleanText(cell)));
  if (rows.length === 0) {
    return {
      valid,
      errors: [{ row: 0, message: "The file has no rows." }],
      summary: emptySummary(1),
    };
  }

  const columns = mapColumns(rows, cc);
  if (!columns) {
    return {
      valid,
      errors: [
        {
          row: 1,
          message:
            "Could not find the name and phone columns. Add a header row with first_name and phone (or name and phone).",
        },
      ],
      summary: emptySummary(1),
    };
  }

  const { fields, extras, hasHeader } = columns;
  if (
    fields.first_name === undefined &&
    fields.full_name === undefined
  ) {
    return {
      valid,
      errors: [{ row: 1, message: "Add a first_name (or name) column so messages can greet people by name." }],
      summary: emptySummary(1),
    };
  }
  if (needSms && !needEmail && fields.phone === undefined) {
    return {
      valid,
      errors: [{ row: 1, message: "This campaign sends SMS, but the file has no phone column." }],
      summary: emptySummary(1),
    };
  }
  if (needEmail && !needSms && fields.email === undefined) {
    return {
      valid,
      errors: [{ row: 1, message: "This campaign sends email, but the file has no email column." }],
      summary: emptySummary(1),
    };
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const firstRowNumber = hasHeader ? 2 : 1;
  if (dataRows.length > maxContacts) {
    return {
      valid,
      errors: [
        {
          row: 0,
          message: `The file has ${dataRows.length} rows; a campaign can hold at most ${maxContacts} contacts.`,
        },
      ],
      summary: { ...emptySummary(1), totalRows: dataRows.length },
    };
  }

  const seenPhones = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  let duplicateRows = 0;
  const cell = (row: string[], field: Field) =>
    fields[field] === undefined ? "" : cleanText(row[fields[field]!]);

  dataRows.forEach((row, i) => {
    const rowNumber = firstRowNumber + i;
    const fail = (message: string, field?: string) =>
      errors.push({ row: rowNumber, ...(field ? { field } : {}), message });

    // Name
    const fromFull = splitFullName(cell(row, "full_name"));
    let firstName = cell(row, "first_name");
    if (firstName) {
      const split = splitFullName(firstName);
      firstName = split.first; // "PST. JOHN" → "John"
    } else {
      firstName = fromFull.first;
    }
    let lastName = cell(row, "last_name")
      ? tidyCase(cell(row, "last_name"))
      : fromFull.last && fromFull.first.toLowerCase() === firstName.toLowerCase()
        ? fromFull.last
        : "";
    if (!firstName) return fail("First name is missing", "first_name");
    if (firstName.length > 100) return fail("First name is too long", "first_name");
    if (/\d/.test(firstName)) return fail(`"${firstName}" does not look like a name`, "first_name");
    lastName = lastName.slice(0, 100);

    // Email
    const rawEmail = cell(row, "email").toLowerCase();
    let email: string | null = null;
    if (rawEmail) {
      if (emailSchema.safeParse(rawEmail).success) email = rawEmail;
      else if (needEmail) return fail(`"${rawEmail}" is not a valid email address`, "email");
    }

    // Phone
    const rawPhone = cell(row, "phone");
    let phone: string | null = null;
    if (rawPhone) {
      const result = normalizeCampaignPhone(rawPhone, cc);
      if (result.ok) phone = result.phone;
      else if (needSms) return fail(result.error, "phone");
    }

    const reachable = (needSms && phone) || (needEmail && email);
    if (!reachable) {
      const missing = needSms && needEmail ? "phone number or email" : needSms ? "phone number" : "email address";
      return fail(`Row has no ${missing}`, needSms ? "phone" : "email");
    }

    // Duplicates: one message per number / inbox per run.
    if (phone && seenPhones.has(phone)) {
      duplicateRows += 1;
      return fail(`Duplicate phone number (same as row ${seenPhones.get(phone)})`, "phone");
    }
    if (email && seenEmails.has(email)) {
      duplicateRows += 1;
      return fail(`Duplicate email (same as row ${seenEmails.get(email)})`, "email");
    }
    if (phone) seenPhones.set(phone, rowNumber);
    if (email) seenEmails.set(email, rowNumber);

    const attributes: Record<string, string> = {};
    for (const extra of extras) {
      const value = cleanText(row[extra.index]);
      if (value) attributes[extra.key] = value.slice(0, 200);
    }

    valid.push({
      firstName,
      lastName: lastName || null,
      email,
      phone,
      attributes: Object.keys(attributes).length ? attributes : null,
    });
  });

  return {
    valid,
    errors,
    summary: {
      totalRows: dataRows.length,
      validRows: valid.length,
      errorRows: errors.length,
      duplicateRows,
      withEmail: valid.filter((c) => c.email).length,
      withPhone: valid.filter((c) => c.phone).length,
      headerInferred: !hasHeader,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Message placeholders                                                */
/* ------------------------------------------------------------------ */

/**
 * Returns placeholders the sender would leave in the message literally:
 * unknown names ({{firstname}}) and padded ones ({{ first_name }}), which
 * the interpolator does not match.
 */
export function findInvalidPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const bad = new Set<string>();
  for (const match of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const inner = match[1];
    if (inner === "body") continue; // template slot, filled before interpolation
    if (!(CAMPAIGN_PLACEHOLDERS as readonly string[]).includes(inner)) bad.add(match[0]);
  }
  // A single-brace typo like {first_name} or a missing close also leaks.
  for (const match of text.matchAll(/(?<!\{)\{(first_name|last_name|full_name|email|phone|campaign_name)\}(?!\})/g)) {
    bad.add(match[0]);
  }
  return Array.from(bad);
}
