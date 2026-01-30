export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Phone number is required');
  }

  let cleaned = trimmed.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone number');
    }
    return `+${digits}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) {
    throw new Error('Invalid phone number');
  }

  const defaultCountryCode = process.env.DEFAULT_PHONE_COUNTRY_CODE;
  if (defaultCountryCode) {
    const countryCode = defaultCountryCode.replace(/\D/g, '');
    if (!countryCode) {
      throw new Error('DEFAULT_PHONE_COUNTRY_CODE is invalid');
    }
    return `+${countryCode}${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new Error('Phone number must include country code');
}

export function normalizeOptionalPhone(raw?: string | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return normalizePhone(trimmed);
}
