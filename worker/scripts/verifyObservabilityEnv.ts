import 'dotenv/config';

const DEFAULT_ALERT_EMAIL = 'dev@usemomentos.xyz';
const DEFAULT_FROM_FALLBACK = 'birthday@mail.usemomentos.xyz';

type Check = {
  level: 'OK' | 'WARN' | 'FAIL';
  message: string;
};

const extractDomain = (value?: string | null) => {
  if (!value) return null;
  const atIndex = value.lastIndexOf('@');
  if (atIndex === -1) return null;
  return value.slice(atIndex + 1).trim().toLowerCase();
};

const allowedDomains = (
  process.env.RESEND_ALLOWED_DOMAINS ||
  extractDomain(process.env.DEFAULT_FROM_EMAIL || DEFAULT_FROM_FALLBACK) ||
  ''
)
  .split(',')
  .map((domain: string) => domain.trim().toLowerCase())
  .filter(Boolean);

const hasDomainAllowlist = allowedDomains.length > 0;

const isAllowedSender = (email?: string | null) => {
  if (!email) return false;
  if (!hasDomainAllowlist) return true;
  const domain = extractDomain(email);
  return domain ? allowedDomains.includes(domain) : false;
};

const resolveFromEmail = (candidate?: string | null) => {
  const trimmed = candidate?.trim();
  const defaultFrom = process.env.DEFAULT_FROM_EMAIL || DEFAULT_FROM_FALLBACK;

  if (trimmed && isAllowedSender(trimmed)) return trimmed;
  if (defaultFrom && isAllowedSender(defaultFrom)) return defaultFrom;
  if (allowedDomains.length > 0) return `noreply@${allowedDomains[0]}`;
  return trimmed || defaultFrom || null;
};

const checks: Check[] = [];
const alertEmail = process.env.ALERT_EMAIL || DEFAULT_ALERT_EMAIL;
const resolvedFromEmail = resolveFromEmail(process.env.ALERT_FROM_EMAIL);

if (process.env.RESEND_API_KEY) {
  checks.push({ level: 'OK', message: 'RESEND_API_KEY is set.' });
} else {
  checks.push({ level: 'FAIL', message: 'RESEND_API_KEY is missing.' });
}

if (process.env.ALERT_EMAIL) {
  checks.push({
    level: 'OK',
    message: `ALERT_EMAIL is set to ${alertEmail}.`,
  });
} else {
  checks.push({
    level: 'WARN',
    message: `ALERT_EMAIL is not set; defaulting to ${DEFAULT_ALERT_EMAIL}.`,
  });
}

if (process.env.ALERT_FROM_EMAIL) {
  if (isAllowedSender(process.env.ALERT_FROM_EMAIL)) {
    checks.push({
      level: 'OK',
      message: `ALERT_FROM_EMAIL domain is allowed (${process.env.ALERT_FROM_EMAIL}).`,
    });
  } else {
    checks.push({
      level: 'FAIL',
      message:
        'ALERT_FROM_EMAIL is set but does not match RESEND_ALLOWED_DOMAINS.',
    });
  }
} else {
  checks.push({
    level: 'WARN',
    message:
      'ALERT_FROM_EMAIL is not set; worker will fall back to DEFAULT_FROM_EMAIL/RESEND_ALLOWED_DOMAINS.',
  });
}

if (resolvedFromEmail) {
  checks.push({
    level: 'OK',
    message: `Resolved alert sender: ${resolvedFromEmail}.`,
  });
} else {
  checks.push({
    level: 'FAIL',
    message: 'Could not resolve a valid sender email for alerts.',
  });
}

if (hasDomainAllowlist) {
  checks.push({
    level: 'OK',
    message: `RESEND_ALLOWED_DOMAINS is configured (${allowedDomains.join(', ')}).`,
  });
} else {
  checks.push({
    level: 'WARN',
    message:
      'RESEND_ALLOWED_DOMAINS is empty; sender domain validation is disabled.',
  });
}

for (const check of checks) {
  console.log(`[${check.level}] ${check.message}`);
}

const hasFailures = checks.some((check) => check.level === 'FAIL');
if (hasFailures) {
  process.exit(1);
}

console.log('[OK] Observability env verification passed.');
