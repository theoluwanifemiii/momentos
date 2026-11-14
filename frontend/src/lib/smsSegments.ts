// SMS length + segment accounting (GSM 03.38).
// Mirrors backend/src/services/smsSegments.ts so the composer can count live,
// without a round trip. Keep the two in sync.

// GSM-7 basic set. Every character here costs one septet.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

// GSM-7 extension set. Each of these costs two septets (escape + char).
const GSM7_EXTENDED = "\f^{}\\[~]|€";

const BASIC = new Set(GSM7_BASIC.split(""));
const EXTENDED = new Set(GSM7_EXTENDED.split(""));

export type SmsEncoding = "GSM_7BIT" | "UCS2";

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  /** Billable length: septets for GSM-7, UTF-16 code units for UCS-2. */
  length: number;
  segments: number;
  /** Capacity of the current segment count, so the UI can show "x / y". */
  capacity: number;
  /** Characters left before this message rolls into another segment. */
  remaining: number;
  /** Characters that forced UCS-2, so the UI can point at the culprit. */
  unsupportedCharacters: string[];
}

const GSM_SINGLE = 160;
const GSM_MULTI = 153;
const UCS2_SINGLE = 70;
const UCS2_MULTI = 67;

/**
 * Splits into visible characters rather than UTF-16 code units so that
 * astral-plane input (emoji) is reported to the user as one character,
 * while still being billed as the two code units the provider counts.
 */
const toCharacters = (text: string) => Array.from(text);

export function analyzeSms(rawText: string): SmsSegmentInfo {
  const text = rawText ?? "";
  const characters = toCharacters(text);

  const unsupported: string[] = [];
  let septets = 0;

  for (const char of characters) {
    if (BASIC.has(char)) {
      septets += 1;
    } else if (EXTENDED.has(char)) {
      septets += 2;
    } else {
      if (!unsupported.includes(char)) unsupported.push(char);
    }
  }

  if (unsupported.length > 0) {
    // A single out-of-charset character forces the whole message to UCS-2,
    // which cuts the per-segment budget from 160 down to 70.
    const length = text.length; // UTF-16 code units, which is what UCS-2 bills
    const segments =
      length === 0 ? 0 : length <= UCS2_SINGLE ? 1 : Math.ceil(length / UCS2_MULTI);
    const capacity = segments <= 1 ? UCS2_SINGLE : segments * UCS2_MULTI;
    return {
      encoding: "UCS2",
      length,
      segments,
      capacity,
      remaining: capacity - length,
      unsupportedCharacters: unsupported,
    };
  }

  const segments =
    septets === 0 ? 0 : septets <= GSM_SINGLE ? 1 : Math.ceil(septets / GSM_MULTI);
  const capacity = segments <= 1 ? GSM_SINGLE : segments * GSM_MULTI;

  return {
    encoding: "GSM_7BIT",
    length: septets,
    segments,
    capacity,
    remaining: capacity - septets,
    unsupportedCharacters: [],
  };
}

/**
 * Hard ceiling on a single campaign SMS. Providers accept more, but each
 * segment bills separately, so this stops an accidental wall of text from
 * costing 20x what the sender expected.
 */
export const MAX_SMS_SEGMENTS = 4;

export function assertSmsWithinLimit(text: string, maxSegments = MAX_SMS_SEGMENTS) {
  const info = analyzeSms(text);
  if (info.segments > maxSegments) {
    throw new Error(
      `SMS is ${info.segments} segments (${info.length} ${
        info.encoding === "UCS2" ? "characters" : "GSM-7 characters"
      }). The limit is ${maxSegments} segments. Shorten the message${
        info.encoding === "UCS2"
          ? ` or remove the characters that force Unicode: ${info.unsupportedCharacters
              .slice(0, 5)
              .join(" ")}`
          : ""
      }.`
    );
  }
  return info;
}
