import 'dotenv/config';

import {
  DeliveryChannel,
  DeliveryStatus,
  ErrorSeverity,
  MomentRecurrence,
  Prisma,
  PrismaClient,
  TemplateType,
} from '@prisma/client';
import { DateTime } from 'luxon';
import cron from 'node-cron';
import { Resend } from 'resend';
import { smsService } from './smsService';
import { whatsappService } from './whatsappService';

const prisma = new PrismaClient();

const DEFAULT_FROM_EMAIL =
  process.env.DEFAULT_FROM_EMAIL || 'birthday@mail.usemomentos.xyz';
const DEFAULT_FROM_NAME = process.env.DEFAULT_FROM_NAME;
const NOTIFICATIONS_FROM_EMAIL = process.env.NOTIFICATIONS_FROM_EMAIL;
const NOTIFICATIONS_FROM_NAME = process.env.NOTIFICATIONS_FROM_NAME;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'dev@usemomentos.xyz';
const ALERT_FROM_NAME = process.env.ALERT_FROM_NAME || 'MomentOS Alerts';
const FAILURE_ALERT_MIN_COUNT = Number(process.env.FAILURE_ALERT_MIN_COUNT || 1);
const ALERT_COOLDOWN_MINUTES = Number(process.env.ALERT_COOLDOWN_MINUTES || 15);
const extractDomain = (value?: string | null) => {
  if (!value) return null;
  const atIndex = value.lastIndexOf('@');
  if (atIndex === -1) return null;
  return value.slice(atIndex + 1).trim().toLowerCase();
};
const RESEND_ALLOWED_DOMAINS = (
  process.env.RESEND_ALLOWED_DOMAINS || extractDomain(DEFAULT_FROM_EMAIL) || ''
)
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);
const HAS_DOMAIN_ALLOWLIST = RESEND_ALLOWED_DOMAINS.length > 0;
const isAllowedSender = (email?: string | null) => {
  if (!email) return false;
  if (!HAS_DOMAIN_ALLOWLIST) return true;
  const domain = extractDomain(email);
  return domain ? RESEND_ALLOWED_DOMAINS.includes(domain) : false;
};
const resolveFromEmail = (candidate?: string | null) => {
  const trimmed = candidate?.trim();
  if (trimmed && isAllowedSender(trimmed)) return trimmed;
  if (DEFAULT_FROM_EMAIL && isAllowedSender(DEFAULT_FROM_EMAIL)) {
    return DEFAULT_FROM_EMAIL;
  }
  if (RESEND_ALLOWED_DOMAINS.length > 0) {
    return `noreply@${RESEND_ALLOWED_DOMAINS[0]}`;
  }
  return trimmed || DEFAULT_FROM_EMAIL || null;
};

const DEDUPE_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.QUEUED,
  DeliveryStatus.SENDING,
  DeliveryStatus.SENT,
  DeliveryStatus.DELIVERED,
];

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type OrganizationForProcessing = Prisma.OrganizationGetPayload<{
  include: {
    people: {
      where: { optedOut: false };
    };
    templateAssignments: {
      where: { isActive: true };
      include: { template: true };
    };
    users: {
      select: { email: true };
    };
  };
}>;

type TemplateAssignmentWithTemplate =
  OrganizationForProcessing['templateAssignments'][number];
type PersonRecord = OrganizationForProcessing['people'][number];
type OrganizationDeliveryConfig = Pick<
  OrganizationForProcessing,
  | 'id'
  | 'name'
  | 'emailFromName'
  | 'emailFromAddress'
  | 'senderId'
  | 'smsEnabled'
  | 'whatsappEnabled'
>;
type OrganizationNotificationConfig = Pick<
  OrganizationForProcessing,
  'name' | 'emailFromAddress' | 'users'
>;
type TemplateRecord = {
  id: string;
  type: TemplateType;
  subject: string;
  content: string;
  channels: DeliveryChannel[];
};
type MomentForProcessing = Prisma.MomentGetPayload<{
  include: {
    template: true;
    recipients: {
      include: {
        person: true;
      };
    };
  };
}>;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toPlainText = (value: string, maxLength: number) =>
  value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);

const generatePersonalizedIntro = async (input: {
  fullName: string;
  firstName?: string | null;
  role?: string | null;
  department?: string | null;
  organizationName?: string | null;
}) => {
  if (!OPENAI_API_KEY) return null;

  const prompt = `
Write one short, friendly sentence to personalize a birthday email intro.
Use the person's role/department if provided. Do not include emojis.
Return JSON as {"intro": "..."}.
Person:
- Full name: ${input.fullName}
- First name: ${input.firstName || ''}
- Role: ${input.role || ''}
- Department: ${input.department || ''}
- Organization: ${input.organizationName || ''}
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You write short, tasteful personalization lines.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as { intro?: string };
    return parsed.intro ? String(parsed.intro).trim() : null;
  } catch {
    return null;
  }
};

interface EmailProvider {
  send(params: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    from: { name: string; email: string };
  }): Promise<{ id: string; success: boolean }>;
}

class ResendEmailProvider implements EmailProvider {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async send(params: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    from: { name: string; email: string };
  }) {
    const result = await this.resend.emails.send({
      from: `${params.from.name} <${params.from.email}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text ?? '',
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return { id: result.data?.id || 'unknown', success: true };
  }
}

class BirthdayScheduler {
  private emailProvider: EmailProvider;
  private alertCooldowns = new Map<string, number>();

  constructor(emailProvider: EmailProvider) {
    this.emailProvider = emailProvider;
  }

  private shouldSendAlert(key: string) {
    const now = Date.now();
    const cooldownMs = ALERT_COOLDOWN_MINUTES * 60 * 1000;
    const lastSentAt = this.alertCooldowns.get(key) || 0;
    if (now - lastSentAt < cooldownMs) {
      return false;
    }
    this.alertCooldowns.set(key, now);
    return true;
  }

  private isThrottleError(message?: string | null) {
    if (!message) return false;
    const text = message.toLowerCase();
    return (
      text.includes('429') ||
      text.includes('rate limit') ||
      text.includes('too many requests') ||
      text.includes('throttle')
    );
  }

  private async logSystemError(params: {
    category: string;
    message: string;
    severity?: ErrorSeverity;
    organizationId?: string | null;
    channel?: DeliveryChannel | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    const severity = params.severity || ErrorSeverity.ERROR;
    const prefix = `[${severity}] ${params.category}`;
    console.error(prefix, params.message, params.metadata || '');

    try {
      await prisma.systemErrorLog.create({
        data: {
          source: 'worker.scheduler',
          category: params.category,
          severity,
          message: params.message,
          organizationId: params.organizationId || null,
          channel: params.channel || null,
          metadata: params.metadata,
        },
      });
    } catch (error: any) {
      console.error('Failed to persist system error log:', error?.message || error);
    }
  }

  private async sendAlert(params: {
    subject: string;
    text: string;
    html?: string;
    alertKey: string;
  }) {
    if (!this.shouldSendAlert(params.alertKey)) {
      return;
    }

    const fromEmail = resolveFromEmail(process.env.ALERT_FROM_EMAIL || DEFAULT_FROM_EMAIL);
    if (!fromEmail) {
      console.error('Alert email skipped: sender email is not configured.');
      return;
    }

    try {
      await this.emailProvider.send({
        to: ALERT_EMAIL,
        subject: params.subject,
        text: params.text,
        html: params.html,
        from: {
          name: ALERT_FROM_NAME,
          email: fromEmail,
        },
      });
    } catch (error: any) {
      console.error('Failed to send alert email:', error?.message || error);
    }
  }

  private async reportDeliveryFailure(params: {
    org: OrganizationDeliveryConfig;
    person: PersonRecord;
    channel: DeliveryChannel;
    templateId: string;
    errorMessage: string;
    momentId?: string | null;
  }) {
    const message = `Delivery failed on ${params.channel} for ${params.person.email} in organization ${params.org.name}.`;
    await this.logSystemError({
      category: 'delivery_failure',
      message,
      severity: ErrorSeverity.ERROR,
      organizationId: params.org.id,
      channel: params.channel,
      metadata: {
        organizationName: params.org.name,
        personId: params.person.id,
        personEmail: params.person.email,
        templateId: params.templateId,
        momentId: params.momentId || null,
        errorMessage: params.errorMessage,
      } as Prisma.InputJsonValue,
    });

    if (this.isThrottleError(params.errorMessage)) {
      await this.logSystemError({
        category: 'provider_throttle',
        message: `Provider throttling detected on ${params.channel} for organization ${params.org.name}.`,
        severity: ErrorSeverity.CRITICAL,
        organizationId: params.org.id,
        channel: params.channel,
        metadata: {
          errorMessage: params.errorMessage,
        } as Prisma.InputJsonValue,
      });

      await this.sendAlert({
        alertKey: `provider-throttle:${params.org.id}:${params.channel}`,
        subject: `[MomentOS Alert] Provider throttling detected (${params.channel})`,
        text: [
          `Organization: ${params.org.name} (${params.org.id})`,
          `Channel: ${params.channel}`,
          `Person: ${params.person.fullName} <${params.person.email}>`,
          `Error: ${params.errorMessage}`,
          `Time: ${new Date().toISOString()}`,
        ].join('\n'),
      });
    }
  }

  private async sendFailureCountAlert(params: {
    org: OrganizationForProcessing;
    runStartedAt: Date;
  }) {
    const failures = await prisma.deliveryLog.findMany({
      where: {
        organizationId: params.org.id,
        status: DeliveryStatus.FAILED,
        createdAt: {
          gte: params.runStartedAt,
        },
      },
      select: {
        channel: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    if (failures.length < FAILURE_ALERT_MIN_COUNT) {
      return;
    }

    const byChannel = failures.reduce<Record<string, number>>((acc, log) => {
      const key = log.channel || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    await this.logSystemError({
      category: 'delivery_failure_count',
      message: `Scheduler run recorded ${failures.length} failed deliveries for ${params.org.name}.`,
      severity: ErrorSeverity.ERROR,
      organizationId: params.org.id,
      metadata: {
        runStartedAt: params.runStartedAt.toISOString(),
        failures: failures.length,
        byChannel,
      } as Prisma.InputJsonValue,
    });

    const sampleLines = failures
      .slice(0, 5)
      .map(
        (failure) =>
          `- ${failure.channel} | ${failure.createdAt.toISOString()} | ${failure.errorMessage || 'No error message'}`
      )
      .join('\n');

    await this.sendAlert({
      alertKey: `delivery-failures:${params.org.id}`,
      subject: `[MomentOS Alert] ${failures.length} delivery failures (${params.org.name})`,
      text: [
        `Organization: ${params.org.name} (${params.org.id})`,
        `Run started: ${params.runStartedAt.toISOString()}`,
        `Failure count: ${failures.length}`,
        `By channel: ${JSON.stringify(byChannel)}`,
        '',
        'Recent failures:',
        sampleLines || '- None',
      ].join('\n'),
    });
  }

  async reportSchedulerCrash(error: unknown, phase: string) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    await this.logSystemError({
      category: 'scheduler_crash',
      message: `Scheduler failure during ${phase}: ${message}`,
      severity: ErrorSeverity.CRITICAL,
      metadata: {
        phase,
      } as Prisma.InputJsonValue,
    });

    await this.sendAlert({
      alertKey: `scheduler-crash:${phase}`,
      subject: `[MomentOS CRITICAL] Scheduler failure (${phase})`,
      text: [
        `Phase: ${phase}`,
        `Time: ${new Date().toISOString()}`,
        '',
        message,
      ].join('\n'),
    });
  }

  private getOrgNow(timezone?: string | null) {
    const zone = timezone || 'UTC';
    const orgNow = DateTime.now().setZone(zone);
    if (!orgNow.isValid) {
      return DateTime.now().setZone('UTC');
    }
    return orgNow;
  }

  private isBirthdayToday(birthday: Date, timezone?: string | null): boolean {
    const orgNow = this.getOrgNow(timezone);
    const bday = DateTime.fromJSDate(birthday, { zone: orgNow.zone });

    if (bday.month === 2 && bday.day === 29) {
      const isLeapYear = (year: number) =>
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

      if (!isLeapYear(orgNow.year)) {
        return orgNow.month === 2 && orgNow.day === 28;
      }
    }

    return orgNow.month === bday.month && orgNow.day === bday.day;
  }

  private getUpcomingBirthdays(daysAhead: number, timezone?: string | null) {
    return (birthday: Date) => {
      const orgNow = this.getOrgNow(timezone);
      const futureDate = orgNow.plus({ days: daysAhead });
      const bday = DateTime.fromJSDate(birthday, { zone: orgNow.zone });
      const thisYearBirthday = bday.set({ year: orgNow.year });

      return (
        thisYearBirthday.month === futureDate.month &&
        thisYearBirthday.day === futureDate.day
      );
    };
  }

  private isLeapYear(year: number) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  private getMonthDelta(from: DateTime, to: DateTime) {
    return (to.year - from.year) * 12 + (to.month - from.month);
  }

  private resolveRecurringDay(anchorDay: number, target: DateTime) {
    const daysInMonth = target.daysInMonth || 31;
    return Math.min(anchorDay, daysInMonth);
  }

  private isMomentDueToday(moment: MomentForProcessing, orgNow: DateTime) {
    const eventDate = DateTime.fromJSDate(moment.eventDate, {
      zone: orgNow.zone,
    }).startOf('day');
    const today = orgNow.startOf('day');

    if (moment.recurrenceRule === MomentRecurrence.ONE_TIME) {
      return eventDate.toISODate() === today.toISODate();
    }

    if (eventDate > today) {
      return false;
    }

    if (moment.recurrenceRule === MomentRecurrence.ANNUAL) {
      if (eventDate.month === 2 && eventDate.day === 29 && !this.isLeapYear(today.year)) {
        return today.month === 2 && today.day === 28;
      }
      return eventDate.month === today.month && eventDate.day === today.day;
    }

    if (moment.recurrenceRule === MomentRecurrence.DAILY) {
      return true;
    }

    if (
      moment.recurrenceRule === MomentRecurrence.MONTHLY ||
      moment.recurrenceRule === MomentRecurrence.QUARTERLY ||
      moment.recurrenceRule === MomentRecurrence.BI_YEARLY
    ) {
      const monthDelta = this.getMonthDelta(eventDate, today);
      if (monthDelta < 0) return false;

      const interval =
        moment.recurrenceRule === MomentRecurrence.MONTHLY
          ? 1
          : moment.recurrenceRule === MomentRecurrence.QUARTERLY
            ? 3
            : 6;
      if (monthDelta % interval !== 0) return false;

      return today.day === this.resolveRecurringDay(eventDate.day, today);
    }

    if (moment.recurrenceRule === MomentRecurrence.CUSTOM) {
      const intervalDays = moment.customIntervalDays;
      if (!intervalDays || intervalDays < 1) return false;
      const elapsedDays = Math.floor(today.diff(eventDate, 'days').days);
      return elapsedDays >= 0 && elapsedDays % intervalDays === 0;
    }

    return false;
  }

  private async logDelivery(params: {
    personId: string;
    templateId: string;
    organizationId: string;
    channel: DeliveryChannel;
    status: DeliveryStatus;
    momentId?: string | null;
    externalId?: string | null;
    errorMessage?: string | null;
  }) {
    const now = new Date();
    const success = params.status === DeliveryStatus.SENT ||
      params.status === DeliveryStatus.DELIVERED;

    await prisma.deliveryLog.create({
      data: {
        personId: params.personId,
        templateId: params.templateId,
        organizationId: params.organizationId,
        momentId: params.momentId || null,
        channel: params.channel,
        status: params.status,
        scheduledFor: now,
        sentAt: success ? now : null,
        deliveredAt: params.status === DeliveryStatus.DELIVERED ? now : null,
        externalId: params.externalId || null,
        errorMessage: params.errorMessage || null,
      },
    });
  }

  private async alreadySentToday(params: {
    organizationId: string;
    personId: string;
    channel: DeliveryChannel;
    momentId?: string | null;
    orgNow: DateTime;
  }) {
    const dayStartUtc = params.orgNow.startOf('day').toUTC().toJSDate();
    const dayEndUtc = params.orgNow.endOf('day').toUTC().toJSDate();

    const existing = await prisma.deliveryLog.findFirst({
      where: {
        organizationId: params.organizationId,
        personId: params.personId,
        channel: params.channel,
        momentId:
          params.momentId === undefined ? undefined : params.momentId || null,
        status: { in: DEDUPE_STATUSES },
        scheduledFor: {
          gte: dayStartUtc,
          lte: dayEndUtc,
        },
      },
      select: { id: true },
    });

    return Boolean(existing);
  }

  private interpolateTemplate(template: string, variables: Record<string, string>) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  private async ensureDefaultAssignment(
    organizationId: string,
    assignments: TemplateAssignmentWithTemplate[]
  ) {
    if (assignments.length === 0) {
      return assignments;
    }

    const defaults = assignments.filter((assignment) => assignment.isDefault);
    if (defaults.length === 1) {
      return assignments;
    }

    const preferred = defaults[0] || assignments[0];

    await prisma.$transaction([
      prisma.organizationTemplate.updateMany({
        where: { organizationId, isDefault: true, id: { not: preferred.id } },
        data: { isDefault: false },
      }),
      prisma.organizationTemplate.update({
        where: { id: preferred.id },
        data: { isDefault: true, isActive: true },
      }),
    ]);

    return assignments.map((assignment) => ({
      ...assignment,
      isDefault: assignment.id === preferred.id,
      isActive: assignment.id === preferred.id ? true : assignment.isActive,
    }));
  }

  private async ensureTemplates(
    organizationId: string,
    assignments: TemplateAssignmentWithTemplate[]
  ) {
    const activeAssignments = assignments.filter(
      (assignment) => assignment.isActive && assignment.template.isActive
    );
    if (activeAssignments.length > 0) {
      return this.ensureDefaultAssignment(organizationId, activeAssignments);
    }

    let systemTemplates = await prisma.template.findMany({
      where: { isSystem: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (systemTemplates.length === 0) {
      const fallback = await prisma.template.create({
        data: {
          name: 'Simple Birthday',
          type: TemplateType.PLAIN_TEXT,
          subject: 'Happy Birthday {{first_name}}! 🎉',
          content: `Happy Birthday {{first_name}}!

Wishing you a wonderful day filled with joy and happiness.

From everyone at {{organization_name}}`,
          isSystem: true,
          isActive: true,
          channels: [DeliveryChannel.email],
        },
      });
      systemTemplates = [fallback];
    }

    const simpleTemplate = systemTemplates.find(
      (template) => template.name === 'Simple Birthday'
    );
    const defaultTemplateId = simpleTemplate?.id || systemTemplates[0].id;

    await prisma.organizationTemplate.createMany({
      data: systemTemplates.map((template) => ({
        organizationId,
        templateId: template.id,
        isDefault: template.id === defaultTemplateId,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    const hydratedAssignments = await prisma.organizationTemplate.findMany({
      where: {
        organizationId,
        isActive: true,
        template: {
          is: { isActive: true },
        },
      },
      include: { template: true },
      orderBy: { assignedAt: 'asc' },
    });

    return this.ensureDefaultAssignment(organizationId, hydratedAssignments);
  }

  private async sendEmailChannel(params: {
    person: PersonRecord;
    org: OrganizationDeliveryConfig;
    template: TemplateRecord;
    subject: string;
    content: string;
    orgNow: DateTime;
    momentId?: string | null;
  }) {
    const { person, org, template, subject, content, orgNow, momentId } = params;

    const alreadySent = await this.alreadySentToday({
      organizationId: org.id,
      personId: person.id,
      channel: DeliveryChannel.email,
      momentId,
      orgNow,
    });

    if (alreadySent) {
      console.log(`Skipping email for ${person.email}; already sent today.`);
      return;
    }

    const fromEmail = resolveFromEmail(
      org.emailFromAddress || DEFAULT_FROM_EMAIL
    );
    if (!fromEmail) {
      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        momentId,
        channel: DeliveryChannel.email,
        status: DeliveryStatus.FAILED,
        errorMessage: 'Sender email is not configured',
      });
      await this.reportDeliveryFailure({
        org,
        person,
        channel: DeliveryChannel.email,
        templateId: template.id,
        momentId,
        errorMessage: 'Sender email is not configured',
      });
      return;
    }

    try {
      const result = await this.emailProvider.send({
        to: person.email,
        subject,
        html: template.type === TemplateType.HTML ? content : undefined,
        text: template.type === TemplateType.PLAIN_TEXT ? content : undefined,
        from: {
          name: org.emailFromName || org.name || DEFAULT_FROM_NAME || '',
          email: fromEmail,
        },
      });

      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        momentId,
        channel: DeliveryChannel.email,
        status: result.success ? DeliveryStatus.DELIVERED : DeliveryStatus.FAILED,
        externalId: result.id,
      });
      if (!result.success) {
        await this.reportDeliveryFailure({
          org,
          person,
          channel: DeliveryChannel.email,
          templateId: template.id,
          momentId,
          errorMessage: 'Email provider returned failure status',
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Email send failed';
      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        momentId,
        channel: DeliveryChannel.email,
        status: DeliveryStatus.FAILED,
        errorMessage,
      });
      await this.reportDeliveryFailure({
        org,
        person,
        channel: DeliveryChannel.email,
        templateId: template.id,
        momentId,
        errorMessage,
      });
    }
  }

  private async sendSmsChannel(params: {
    person: PersonRecord;
    org: OrganizationDeliveryConfig;
    template: TemplateRecord;
    content: string;
    orgNow: DateTime;
    momentId?: string | null;
  }) {
    const { person, org, template, content, orgNow, momentId } = params;

    if (!org.smsEnabled || !person.phone) {
      return;
    }

    const alreadySent = await this.alreadySentToday({
      organizationId: org.id,
      personId: person.id,
      channel: DeliveryChannel.sms,
      momentId,
      orgNow,
    });

    if (alreadySent) {
      console.log(`Skipping SMS for ${person.fullName}; already sent today.`);
      return;
    }

    try {
      const smsResult = await smsService.send({
        to: person.phone,
        message: toPlainText(content, 160),
        senderId: org.senderId || 'MomentOS',
      });

      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        momentId,
        channel: DeliveryChannel.sms,
        status: smsResult.success ? DeliveryStatus.SENT : DeliveryStatus.FAILED,
        externalId: smsResult.messageId,
        errorMessage: smsResult.error,
      });
      if (!smsResult.success) {
        await this.reportDeliveryFailure({
          org,
          person,
          channel: DeliveryChannel.sms,
          templateId: template.id,
          momentId,
          errorMessage: smsResult.error || 'SMS provider returned failure status',
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'SMS send failed';
      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        momentId,
        channel: DeliveryChannel.sms,
        status: DeliveryStatus.FAILED,
        errorMessage,
      });
      await this.reportDeliveryFailure({
        org,
        person,
        channel: DeliveryChannel.sms,
        templateId: template.id,
        momentId,
        errorMessage,
      });
    }
  }

  private async sendWhatsappChannel(params: {
    person: PersonRecord;
    org: OrganizationDeliveryConfig;
    template: TemplateRecord;
    subject: string;
    content: string;
    orgNow: DateTime;
    momentId?: string | null;
  }) {
    const { person, org, template, subject, content, orgNow, momentId } = params;

    if (!org.whatsappEnabled || !person.phone) {
      return;
    }

    const alreadySent = await this.alreadySentToday({
      organizationId: org.id,
      personId: person.id,
      channel: DeliveryChannel.whatsapp,
      momentId,
      orgNow,
    });

    if (alreadySent) {
      console.log(`Skipping WhatsApp for ${person.fullName}; already sent today.`);
      return;
    }

    try {
      const message = toPlainText(`${subject}\n\n${content}`, 1000);
      const whatsappResult = await whatsappService.send({
        to: person.phone,
        message,
        from: org.senderId || process.env.TERMII_WHATSAPP_FROM || 'MomentOS',
      });

      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        momentId,
        channel: DeliveryChannel.whatsapp,
        status: whatsappResult.success
          ? DeliveryStatus.DELIVERED
          : DeliveryStatus.FAILED,
        externalId: whatsappResult.messageId,
        errorMessage: whatsappResult.error,
      });
      if (!whatsappResult.success) {
        await this.reportDeliveryFailure({
          org,
          person,
          channel: DeliveryChannel.whatsapp,
          templateId: template.id,
          momentId,
          errorMessage: whatsappResult.error || 'WhatsApp provider returned failure status',
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'WhatsApp send failed';
      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        momentId,
        channel: DeliveryChannel.whatsapp,
        status: DeliveryStatus.FAILED,
        errorMessage,
      });
      await this.reportDeliveryFailure({
        org,
        person,
        channel: DeliveryChannel.whatsapp,
        templateId: template.id,
        momentId,
        errorMessage,
      });
    }
  }

  async sendBirthdayMessage(
    person: PersonRecord,
    org: OrganizationDeliveryConfig,
    templateAssignments: TemplateAssignmentWithTemplate[],
    orgNow: DateTime
  ) {
    const templateAssignment =
      templateAssignments.find((assignment) => assignment.isDefault) ||
      templateAssignments[0];

    if (!templateAssignment) {
      console.error('No active template assignment found for organization', org.id);
      return;
    }

    const template = templateAssignment.template;

    let personalizedIntro: string | null = null;
    try {
      personalizedIntro = await generatePersonalizedIntro({
        fullName: person.fullName,
        firstName: person.firstName,
        role: person.role,
        department: person.department,
        organizationName: org.name,
      });
    } catch (error) {
      console.warn('AI personalization failed:', error);
    }

    const variables = {
      first_name: person.firstName || person.fullName.split(' ')[0],
      full_name: person.fullName,
      organization_name: org.name,
      date: new Date().toLocaleDateString(),
      personalized_intro: personalizedIntro || '',
    };

    let content = this.interpolateTemplate(template.content, variables);
    const subject = this.interpolateTemplate(template.subject, variables);

    if (personalizedIntro && !template.content.includes('{{personalized_intro}}')) {
      content =
        template.type === TemplateType.HTML
          ? `<p>${escapeHtml(personalizedIntro)}</p>${content}`
          : `${personalizedIntro}\n\n${content}`;
    }

    const channels = template.channels.length
      ? template.channels
      : [DeliveryChannel.email];

    for (const channel of channels) {
      if (channel === DeliveryChannel.email) {
        await this.sendEmailChannel({
          person,
          org,
          template,
          subject,
          content,
          orgNow,
          momentId: null,
        });
      } else if (channel === DeliveryChannel.sms) {
        await this.sendSmsChannel({
          person,
          org,
          template,
          content,
          orgNow,
          momentId: null,
        });
      } else if (channel === DeliveryChannel.whatsapp) {
        await this.sendWhatsappChannel({
          person,
          org,
          template,
          subject,
          content,
          orgNow,
          momentId: null,
        });
      }
    }
  }

  async sendMomentMessage(params: {
    person: PersonRecord;
    org: OrganizationDeliveryConfig;
    moment: MomentForProcessing;
    template: TemplateRecord;
    orgNow: DateTime;
  }) {
    const { person, org, moment, template, orgNow } = params;
    const variables = {
      first_name: person.firstName || person.fullName.split(' ')[0],
      full_name: person.fullName,
      organization_name: org.name,
      date: new Date().toLocaleDateString(),
      moment_title: moment.title,
      moment_category: moment.category,
      event_date: DateTime.fromJSDate(moment.eventDate, { zone: orgNow.zone }).toISODate() ||
        '',
      personalized_intro: '',
    };

    const subject = this.interpolateTemplate(template.subject, variables);
    const content = this.interpolateTemplate(template.content, variables);
    const channels = moment.deliveryChannels.length
      ? moment.deliveryChannels
      : template.channels.length
      ? template.channels
      : [DeliveryChannel.email];

    for (const channel of channels) {
      if (channel === DeliveryChannel.email) {
        await this.sendEmailChannel({
          person,
          org,
          template,
          subject,
          content,
          orgNow,
          momentId: moment.id,
        });
      } else if (channel === DeliveryChannel.sms) {
        await this.sendSmsChannel({
          person,
          org,
          template,
          content,
          orgNow,
          momentId: moment.id,
        });
      } else if (channel === DeliveryChannel.whatsapp) {
        await this.sendWhatsappChannel({
          person,
          org,
          template,
          subject,
          content,
          orgNow,
          momentId: moment.id,
        });
      }
    }
  }

  async sendAdminNotification(
    upcomingPeople: PersonRecord[],
    org: OrganizationNotificationConfig
  ) {
    const adminEmails = org.users.map((user) => user.email).filter(Boolean);
    if (adminEmails.length === 0) {
      return;
    }

    const peopleList = upcomingPeople
      .map((person) => `- ${person.fullName} (${person.birthday.toLocaleDateString()})`)
      .join('\n');

    const html = `
      <h2>Upcoming Birthdays - ${org.name}</h2>
      <p>The following birthdays are coming up in 2 days:</p>
      <pre>${peopleList}</pre>
      <p>These birthday messages are scheduled to be sent automatically.</p>
    `;

    const fromEmail = resolveFromEmail(
      NOTIFICATIONS_FROM_EMAIL || org.emailFromAddress || DEFAULT_FROM_EMAIL
    );
    if (!fromEmail) {
      console.error('Cannot send admin notifications; sender email is missing.');
      return;
    }

    for (const email of adminEmails) {
      try {
        await this.emailProvider.send({
          to: email,
          subject: `Upcoming birthdays - ${org.name}`,
          html,
          from: {
            name: NOTIFICATIONS_FROM_NAME || org.name || DEFAULT_FROM_NAME || '',
            email: fromEmail,
          },
        });
      } catch (error: any) {
        console.error(`Failed admin notification to ${email}:`, error?.message);
      }
    }
  }

  async processOrganization(orgId: string) {
    console.log(`Processing organization: ${orgId}`);
    const runStartedAt = new Date();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        people: {
          where: { optedOut: false },
        },
        templateAssignments: {
          where: { isActive: true },
          include: { template: true },
        },
        users: {
          select: { email: true },
        },
        moments: {
          where: {
            status: 'ACTIVE',
            ownerOrganizationId: orgId,
          },
          include: {
            template: true,
            recipients: {
              include: {
                person: true,
              },
            },
          },
        },
      },
    });

    if (!org) {
      return;
    }

    const orgNow = this.getOrgNow(org.timezone);
    const runDate = orgNow.toISODate();
    if (!runDate) {
      console.error(`Invalid run date for organization ${org.id}`);
      return;
    }

    const existingRun = await prisma.schedulerRun.findUnique({
      where: {
        organizationId_runDate: {
          organizationId: org.id,
          runDate,
        },
      },
      select: { id: true },
    });
    if (existingRun) {
      console.log(`Skipping ${org.id}; already processed for ${runDate}`);
      return;
    }

    try {
      await prisma.schedulerRun.create({
        data: {
          organizationId: org.id,
          runDate,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        console.log(`Skipping ${org.id}; run lock already exists for ${runDate}`);
        return;
      }
      console.error(`Failed to create run lock for ${org.id}:`, error?.message);
      await this.logSystemError({
        category: 'scheduler_run_lock_failed',
        message: `Failed to create scheduler run lock for organization ${org.id}: ${error?.message || error}`,
        severity: ErrorSeverity.ERROR,
        organizationId: org.id,
      });
      return;
    }

    const templateAssignments = await this.ensureTemplates(
      org.id,
      org.templateAssignments
    );

    const todaysBirthdays = org.people.filter((person) =>
      this.isBirthdayToday(person.birthday, org.timezone)
    );
    console.log(`Found ${todaysBirthdays.length} birthdays for organization ${org.id}`);

    for (const person of todaysBirthdays) {
      await this.sendBirthdayMessage(person, org, templateAssignments, orgNow);
    }

    const defaultTemplate = (
      templateAssignments.find((assignment) => assignment.isDefault) ||
      templateAssignments[0]
    )?.template as TemplateRecord | undefined;

    const dueMoments = org.moments.filter((moment) =>
      this.isMomentDueToday(moment as MomentForProcessing, orgNow)
    );
    console.log(`Found ${dueMoments.length} due moments for organization ${org.id}`);

    const availableTemplates = templateAssignments
      .map((assignment) => assignment.template as TemplateRecord)
      .filter(Boolean);

    for (const moment of dueMoments) {
      const fallbackMomentTemplate =
        (moment.template as TemplateRecord | null) || defaultTemplate;
      if (!fallbackMomentTemplate && availableTemplates.length === 0) {
        console.warn(`Skipping moment ${moment.id}; no template available.`);
        continue;
      }

      for (const recipient of moment.recipients) {
        if (!recipient.person || recipient.person.optedOut) {
          continue;
        }

        let messageTemplate = fallbackMomentTemplate;
        if (
          moment.randomizeMessage &&
          moment.recurrenceRule !== MomentRecurrence.ONE_TIME &&
          availableTemplates.length > 0
        ) {
          const randomIndex = Math.floor(Math.random() * availableTemplates.length);
          messageTemplate = availableTemplates[randomIndex];
        }

        if (!messageTemplate) {
          continue;
        }

        await this.sendMomentMessage({
          person: recipient.person as PersonRecord,
          org,
          moment: moment as MomentForProcessing,
          template: messageTemplate,
          orgNow,
        });
      }
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: { birthdayLastRunAt: new Date() },
    });

    const upcomingBirthdays = org.people.filter((person) =>
      this.getUpcomingBirthdays(2, org.timezone)(person.birthday)
    );

    if (upcomingBirthdays.length > 0) {
      await this.sendAdminNotification(upcomingBirthdays, org);
    }

    await this.sendFailureCountAlert({
      org,
      runStartedAt,
    });
  }

  private shouldRunForOrg(org: {
    timezone: string;
    birthdaySendHour: number;
    birthdaySendMinute: number;
    birthdayLastRunAt: Date | null;
  }) {
    const local = this.getOrgNow(org.timezone || 'UTC');

    if (local.hour !== org.birthdaySendHour || local.minute !== org.birthdaySendMinute) {
      return false;
    }

    if (!org.birthdayLastRunAt) {
      return true;
    }

    const lastLocal = DateTime.fromJSDate(org.birthdayLastRunAt, {
      zone: local.zone,
    }).toISODate();

    return lastLocal !== local.toISODate();
  }

  async run() {
    console.log('Birthday scheduler started.');

    const organizations = await prisma.organization.findMany({
      where: { isSuspended: false },
      select: {
        id: true,
        timezone: true,
        birthdaySendHour: true,
        birthdaySendMinute: true,
        birthdayLastRunAt: true,
      },
    });

    for (const org of organizations) {
      if (this.shouldRunForOrg(org)) {
        try {
          await this.processOrganization(org.id);
        } catch (error: any) {
          await this.logSystemError({
            category: 'organization_run_failed',
            message: `Organization run failed for ${org.id}: ${error?.message || error}`,
            severity: ErrorSeverity.ERROR,
            organizationId: org.id,
            metadata: {
              stack: error?.stack || null,
            } as Prisma.InputJsonValue,
          });
        }
      }
    }

    console.log('Scheduler run complete.');
  }

  startCron() {
    console.log('Scheduling birthday checks every minute.');

    cron.schedule('* * * * *', async () => {
      console.log(`Running scheduled birthday check: ${new Date().toISOString()}`);
      try {
        await this.run();
      } catch (error) {
        await this.reportSchedulerCrash(error, 'cron_tick');
      }
    });

    console.log('Running initial check.');
    void this.run().catch(async (error) => {
      await this.reportSchedulerCrash(error, 'initial_run');
    });
  }
}

const emailProvider = new ResendEmailProvider();
const scheduler = new BirthdayScheduler(emailProvider);

scheduler.startCron();

let shuttingDown = false;

const shutdown = async (exitCode: number) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down scheduler.');
  await prisma.$disconnect();
  process.exit(exitCode);
};

process.on('SIGINT', async () => {
  await shutdown(0);
});

process.on('SIGTERM', async () => {
  await shutdown(0);
});

process.on('uncaughtException', (error) => {
  void (async () => {
    await scheduler.reportSchedulerCrash(error, 'uncaught_exception');
    await shutdown(1);
  })();
});

process.on('unhandledRejection', (reason) => {
  void (async () => {
    const error =
      reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`);
    await scheduler.reportSchedulerCrash(error, 'unhandled_rejection');
    await shutdown(1);
  })();
});
