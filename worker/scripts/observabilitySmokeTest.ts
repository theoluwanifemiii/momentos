import 'dotenv/config';

import {
  DeliveryChannel,
  DeliveryStatus,
  ErrorSeverity,
  Prisma,
  PrismaClient,
  TemplateType,
} from '@prisma/client';
import { Resend } from 'resend';
import { whatsappService } from '../whatsappService';

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_ALERT_EMAIL = 'dev@usemomentos.xyz';
const DEFAULT_FROM_FALLBACK = 'birthday@mail.usemomentos.xyz';
const ALERT_FROM_NAME = process.env.ALERT_FROM_NAME || 'MomentOS Alerts';

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

const parseArg = (name: string) => {
  const token = process.argv.find((arg: string) => arg.startsWith(`--${name}=`));
  return token ? token.split('=').slice(1).join('=') : undefined;
};

const orgArg = parseArg('org-id') || process.env.SMOKE_TEST_ORG_ID;
const alertEmail = process.env.ALERT_EMAIL || DEFAULT_ALERT_EMAIL;
const alertFromEmail = resolveFromEmail(process.env.ALERT_FROM_EMAIL);

const fail = (message: string): never => {
  throw new Error(message);
};

type OrganizationRef = {
  id: string;
  name: string | null;
};

async function ensureOrg(): Promise<OrganizationRef> {
  if (orgArg) {
    const org = await prisma.organization.findUnique({
      where: { id: orgArg },
      select: { id: true, name: true },
    });
    if (!org) {
      throw new Error(`Organization not found for id: ${orgArg}`);
    }
    return org;
  }

  const org = await prisma.organization.findFirst({
    where: { isSuspended: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new Error('No organization found for smoke test.');
  }
  return org;
}

async function ensureTemplate(orgId: string) {
  const assigned = await prisma.organizationTemplate.findFirst({
    where: { organizationId: orgId, isActive: true },
    orderBy: { assignedAt: 'asc' },
    include: { template: true },
  });

  if (assigned?.template) return assigned.template;

  const template = await prisma.template.create({
    data: {
      name: 'Observability Smoke Template',
      type: TemplateType.PLAIN_TEXT,
      subject: 'Smoke test {{date}}',
      content: 'Smoke test message',
      isActive: true,
      channels: [DeliveryChannel.email, DeliveryChannel.whatsapp],
    },
  });

  await prisma.organizationTemplate.create({
    data: {
      organizationId: orgId,
      templateId: template.id,
      isDefault: true,
      isActive: true,
    },
  });

  return template;
}

async function ensurePerson(orgId: string) {
  const person = await prisma.person.findFirst({
    where: { organizationId: orgId, optedOut: false },
    orderBy: { createdAt: 'asc' },
  });
  if (person) return person;

  const nonce = Date.now();
  return prisma.person.create({
    data: {
      organizationId: orgId,
      fullName: 'Observability Smoke',
      firstName: 'Observability',
      email: `smoke-${nonce}@example.com`,
      phone: '+12025550199',
      birthday: new Date('1990-01-01T00:00:00.000Z'),
      optedOut: false,
    },
  });
}

async function writeFailureArtifacts(params: {
  orgId: string;
  templateId: string;
  personId: string;
  channel: DeliveryChannel;
  category: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const delivery = await prisma.deliveryLog.create({
    data: {
      organizationId: params.orgId,
      templateId: params.templateId,
      personId: params.personId,
      channel: params.channel,
      status: DeliveryStatus.FAILED,
      scheduledFor: new Date(),
      errorMessage: params.message,
    },
  });

  const systemError = await prisma.systemErrorLog.create({
    data: {
      source: 'worker.observability_smoke_test',
      category: params.category,
      severity: ErrorSeverity.ERROR,
      organizationId: params.orgId,
      channel: params.channel,
      message: params.message,
      metadata: params.metadata,
    },
  });

  return { deliveryId: delivery.id, systemErrorId: systemError.id };
}

async function forceEmailFailure(fromEmail: string) {
  if (!process.env.RESEND_API_KEY) {
    return 'RESEND_API_KEY is not configured';
  }

  try {
    await resend.emails.send({
      from: `${ALERT_FROM_NAME} <${fromEmail}>`,
      to: 'invalid-email-address',
      subject: 'MomentOS observability smoke test',
      text: 'This should fail due to invalid recipient.',
    });
    return 'Email provider unexpectedly accepted invalid recipient.';
  } catch (error: any) {
    return error?.message || 'Email provider send failed';
  }
}

async function forceWhatsAppFailure() {
  const result = await whatsappService.send({
    to: 'not-a-phone',
    message: 'MomentOS observability smoke test',
  });
  if (result.success) {
    return 'WhatsApp provider unexpectedly accepted invalid number.';
  }
  return result.error || 'WhatsApp provider returned failure status';
}

async function sendAlert(text: string, fromEmail: string) {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, reason: 'RESEND_API_KEY is not configured' };
  }

  try {
    const response = await resend.emails.send({
      from: `${ALERT_FROM_NAME} <${fromEmail}>`,
      to: alertEmail,
      subject: '[MomentOS Smoke] Observability failure test',
      text,
    });
    if (response.error) {
      return { ok: false, reason: response.error.message || 'Resend returned error' };
    }
    return { ok: true, id: response.data?.id || 'unknown' };
  } catch (error: any) {
    return { ok: false, reason: error?.message || 'Alert send failed' };
  }
}

async function main() {
  const fromEmail =
    alertFromEmail ??
    fail('Could not resolve alert sender email. Set ALERT_FROM_EMAIL or DEFAULT_FROM_EMAIL.');

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: any) {
    fail(`Database connectivity failed: ${error?.message || error}`);
  }

  try {
    await prisma.systemErrorLog.count();
  } catch (error: any) {
    fail(
      `system_error_logs is not available. Apply migration 20260213120000_add_system_error_logs first. Root error: ${
        error?.message || error
      }`
    );
  }

  const organization = await ensureOrg();
  const template = await ensureTemplate(organization.id);
  const person = await ensurePerson(organization.id);
  const startedAt = new Date();

  const emailError = await forceEmailFailure(fromEmail);
  const emailArtifacts = await writeFailureArtifacts({
    orgId: organization.id,
    templateId: template.id,
    personId: person.id,
    channel: DeliveryChannel.email,
    category: 'delivery_failure_smoke_email',
    message: emailError,
    metadata: {
      smokeTest: true,
      stage: 'email',
      createdAt: startedAt.toISOString(),
    } as Prisma.InputJsonValue,
  });

  const whatsappError = await forceWhatsAppFailure();
  const whatsappArtifacts = await writeFailureArtifacts({
    orgId: organization.id,
    templateId: template.id,
    personId: person.id,
    channel: DeliveryChannel.whatsapp,
    category: 'delivery_failure_smoke_whatsapp',
    message: whatsappError,
    metadata: {
      smokeTest: true,
      stage: 'whatsapp',
      createdAt: startedAt.toISOString(),
    } as Prisma.InputJsonValue,
  });

  const since = new Date(startedAt.getTime() - 5 * 60 * 1000);

  const [failedEmailCount, failedWhatsAppCount, smokeErrorCount] = await Promise.all([
    prisma.deliveryLog.count({
      where: {
        organizationId: organization.id,
        channel: DeliveryChannel.email,
        status: DeliveryStatus.FAILED,
        createdAt: { gte: since },
      },
    }),
    prisma.deliveryLog.count({
      where: {
        organizationId: organization.id,
        channel: DeliveryChannel.whatsapp,
        status: DeliveryStatus.FAILED,
        createdAt: { gte: since },
      },
    }),
    prisma.systemErrorLog.count({
      where: {
        organizationId: organization.id,
        source: 'worker.observability_smoke_test',
        createdAt: { gte: since },
      },
    }),
  ]);

  const alertText = [
    `Organization: ${organization.name} (${organization.id})`,
    `Smoke test started: ${startedAt.toISOString()}`,
    `Email delivery log id: ${emailArtifacts.deliveryId}`,
    `WhatsApp delivery log id: ${whatsappArtifacts.deliveryId}`,
    `Email system error id: ${emailArtifacts.systemErrorId}`,
    `WhatsApp system error id: ${whatsappArtifacts.systemErrorId}`,
    `Failed email logs in window: ${failedEmailCount}`,
    `Failed WhatsApp logs in window: ${failedWhatsAppCount}`,
    `System errors from smoke source in window: ${smokeErrorCount}`,
  ].join('\n');

  const alertResult = await sendAlert(alertText, fromEmail);

  console.log('--- Observability Smoke Test Result ---');
  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(`Email failure message: ${emailError}`);
  console.log(`WhatsApp failure message: ${whatsappError}`);
  console.log(`Email failure log id: ${emailArtifacts.deliveryId}`);
  console.log(`WhatsApp failure log id: ${whatsappArtifacts.deliveryId}`);
  console.log(`Email system error id: ${emailArtifacts.systemErrorId}`);
  console.log(`WhatsApp system error id: ${whatsappArtifacts.systemErrorId}`);
  console.log(`Failed email count (5m): ${failedEmailCount}`);
  console.log(`Failed WhatsApp count (5m): ${failedWhatsAppCount}`);
  console.log(`Smoke system error count (5m): ${smokeErrorCount}`);
  if (alertResult.ok) {
    console.log(`Alert send status: accepted (${alertResult.id})`);
  } else {
    console.log(`Alert send status: failed (${alertResult.reason})`);
  }

  if (!alertResult.ok) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('[SmokeTest:FAIL]', error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
