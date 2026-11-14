const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

const GSM7_EXTENDED = "\f^{}\\[~]|€";

const BASIC = new Set(GSM7_BASIC.split(""));
const EXTENDED = new Set(GSM7_EXTENDED.split(""));

export type SmsEncoding = "GSM_7BIT" | "UCS2";

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  length: number;
  segments: number;
  capacity: number;
  remaining: number;
  unsupportedCharacters: string[];
}

const GSM_SINGLE = 160;
const GSM_MULTI = 153;
const UCS2_SINGLE = 70;
const UCS2_MULTI = 67;

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
  
  const length = text.length; 
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
