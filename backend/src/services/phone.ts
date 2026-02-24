export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Phone number is required');
  }

  let cleaned = trimmed.replace(/[^\d+]/g, '');
  const rawDefaultCountryCode = process.env.DEFAULT_PHONE_COUNTRY_CODE || '';
  const defaultCountryCode = rawDefaultCountryCode.replace(/\D/g, '');
  if (rawDefaultCountryCode && !defaultCountryCode) {
    throw new Error('DEFAULT_PHONE_COUNTRY_CODE is invalid');
  }

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.startsWith('+')) {
    let digits = cleaned.slice(1).replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone number');
    }
    // Normalize trunk prefix like +2340903... -> +234903...
    if (defaultCountryCode && digits.startsWith(`${defaultCountryCode}0`)) {
      digits = `${defaultCountryCode}${digits.slice(defaultCountryCode.length + 1)}`;
    }
    return `+${digits}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) {
    throw new Error('Invalid phone number');
  }

  if (defaultCountryCode) {
    if (digits.startsWith(`${defaultCountryCode}0`)) {
      return `+${defaultCountryCode}${digits.slice(defaultCountryCode.length + 1)}`;
    }
    if (digits.startsWith(defaultCountryCode)) {
      return `+${digits}`;
    }
    if (digits.startsWith('0')) {
      return `+${defaultCountryCode}${digits.slice(1)}`;
    }
    return `+${defaultCountryCode}${digits}`;
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
