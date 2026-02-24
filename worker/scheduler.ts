import 'dotenv/config';

import {
  DeliveryChannel,
  DeliveryStatus,
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

  constructor(emailProvider: EmailProvider) {
    this.emailProvider = emailProvider;
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

  private async logDelivery(params: {
    personId: string;
    templateId: string;
    organizationId: string;
    channel: DeliveryChannel;
    status: DeliveryStatus;
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
    orgNow: DateTime;
  }) {
    const dayStartUtc = params.orgNow.startOf('day').toUTC().toJSDate();
    const dayEndUtc = params.orgNow.endOf('day').toUTC().toJSDate();

    const existing = await prisma.deliveryLog.findFirst({
      where: {
        organizationId: params.organizationId,
        personId: params.personId,
        channel: params.channel,
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
    templateAssignment: TemplateAssignmentWithTemplate;
    subject: string;
    content: string;
    orgNow: DateTime;
  }) {
    const { person, org, templateAssignment, subject, content, orgNow } = params;
    const template = templateAssignment.template;

    const alreadySent = await this.alreadySentToday({
      organizationId: org.id,
      personId: person.id,
      channel: DeliveryChannel.email,
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
        channel: DeliveryChannel.email,
        status: DeliveryStatus.FAILED,
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
        channel: DeliveryChannel.email,
        status: result.success ? DeliveryStatus.DELIVERED : DeliveryStatus.FAILED,
        externalId: result.id,
      });
    } catch (error: any) {
      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        channel: DeliveryChannel.email,
        status: DeliveryStatus.FAILED,
        errorMessage: error?.message || 'Email send failed',
      });
    }
  }

  private async sendSmsChannel(params: {
    person: PersonRecord;
    org: OrganizationDeliveryConfig;
    templateAssignment: TemplateAssignmentWithTemplate;
    content: string;
    orgNow: DateTime;
  }) {
    const { person, org, templateAssignment, content, orgNow } = params;
    const template = templateAssignment.template;

    if (!org.smsEnabled || !person.phone) {
      return;
    }

    const alreadySent = await this.alreadySentToday({
      organizationId: org.id,
      personId: person.id,
      channel: DeliveryChannel.sms,
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
        channel: DeliveryChannel.sms,
        status: smsResult.success ? DeliveryStatus.DELIVERED : DeliveryStatus.FAILED,
        externalId: smsResult.messageId,
        errorMessage: smsResult.error,
      });
    } catch (error: any) {
      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        channel: DeliveryChannel.sms,
        status: DeliveryStatus.FAILED,
        errorMessage: error?.message || 'SMS send failed',
      });
    }
  }

  private async sendWhatsappChannel(params: {
    person: PersonRecord;
    org: OrganizationDeliveryConfig;
    templateAssignment: TemplateAssignmentWithTemplate;
    subject: string;
    content: string;
    orgNow: DateTime;
  }) {
    const { person, org, templateAssignment, subject, content, orgNow } = params;
    const template = templateAssignment.template;

    if (!org.whatsappEnabled || !person.phone) {
      return;
    }

    const alreadySent = await this.alreadySentToday({
      organizationId: org.id,
      personId: person.id,
      channel: DeliveryChannel.whatsapp,
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
        channel: DeliveryChannel.whatsapp,
        status: whatsappResult.success
          ? DeliveryStatus.DELIVERED
          : DeliveryStatus.FAILED,
        externalId: whatsappResult.messageId,
        errorMessage: whatsappResult.error,
      });
    } catch (error: any) {
      await this.logDelivery({
        personId: person.id,
        templateId: template.id,
        organizationId: org.id,
        channel: DeliveryChannel.whatsapp,
        status: DeliveryStatus.FAILED,
        errorMessage: error?.message || 'WhatsApp send failed',
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
          templateAssignment,
          subject,
          content,
          orgNow,
        });
      } else if (channel === DeliveryChannel.sms) {
        await this.sendSmsChannel({
          person,
          org,
          templateAssignment,
          content,
          orgNow,
        });
      } else if (channel === DeliveryChannel.whatsapp) {
        await this.sendWhatsappChannel({
          person,
          org,
          templateAssignment,
          subject,
          content,
          orgNow,
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
        await this.processOrganization(org.id);
      }
    }

    console.log('Scheduler run complete.');
  }

  startCron() {
    console.log('Scheduling birthday checks every minute.');

    cron.schedule('* * * * *', async () => {
      console.log(`Running scheduled birthday check: ${new Date().toISOString()}`);
      await this.run();
    });

    console.log('Running initial check.');
    void this.run();
  }
}

const emailProvider = new ResendEmailProvider();
const scheduler = new BirthdayScheduler(emailProvider);

scheduler.startCron();

process.on('SIGINT', async () => {
  console.log('Shutting down scheduler.');
  await prisma.$disconnect();
  process.exit(0);
});
