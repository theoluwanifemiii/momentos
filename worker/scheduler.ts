// Birthday Scheduler Worker
// File: worker/scheduler.ts
// Runs daily to check for birthdays and send emails.
// Automated Daily Scheduler:
// - Runs every day at 9:00 AM (org timezone)
// - Checks for today's birthdays
// - Sends birthday emails automatically
// - Sends admin notifications 2 days before
// - Logs all deliveries

import 'dotenv/config';

import { PrismaClient, TemplateType } from '@prisma/client';
import { DateTime } from 'luxon';
import cron from 'node-cron';
import { Resend } from 'resend';

const prisma = new PrismaClient();
const DEFAULT_FROM_EMAIL =
  process.env.DEFAULT_FROM_EMAIL || "birthday@mail.usemomentos.xyz";
const DEFAULT_FROM_NAME = process.env.DEFAULT_FROM_NAME;
const NOTIFICATIONS_FROM_EMAIL = process.env.NOTIFICATIONS_FROM_EMAIL;
const NOTIFICATIONS_FROM_NAME = process.env.NOTIFICATIONS_FROM_NAME;

// Email provider interface (to be implemented)
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
    // Sends via Resend using org-configured sender info.
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

/**
 * Main Scheduler Class
 */
class BirthdayScheduler {
  private emailProvider: EmailProvider;

  constructor(emailProvider: EmailProvider) {
    this.emailProvider = emailProvider;
  }

  /**
   * Check if today is someone's birthday
   */
  private getOrgNow(timezone: string) {
    const zone = timezone || 'UTC';
    const orgNow = DateTime.now().setZone(zone);
    if (!orgNow.isValid) {
      return DateTime.now().setZone('UTC');
    }
    return orgNow;
  }

  private isBirthdayToday(birthday: Date, timezone: string): boolean {
    const orgNow = this.getOrgNow(timezone);
    const bday = DateTime.fromJSDate(birthday, { zone: orgNow.zone });

    // Handle Feb 29 in non-leap years
    if (bday.month === 2 && bday.day === 29) {
      const isLeapYear = (year: number) =>
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

      if (!isLeapYear(orgNow.year)) {
        // Celebrate on Feb 28 in non-leap years
        return orgNow.month === 2 && orgNow.day === 28;
      }
    }

    return orgNow.month === bday.month && orgNow.day === bday.day;
  }

  /**
   * Get upcoming birthdays (for admin notifications)
   */
  private getUpcomingBirthdays(
    daysAhead: number,
    timezone: string
  ): (birthday: Date) => boolean {
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

  /**
   * Process birthdays for a single organization
   */
  async processOrganization(orgId: string) {
    console.log(`Processing organization: ${orgId}`);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        people: {
          where: { optedOut: false },
        },
        templates: {
          where: { isActive: true },
        },
        users: true,
      },
    });

    if (!org) return;

    const orgNow = this.getOrgNow(org.timezone || 'UTC');
    const runDate = orgNow.toISODate();
    if (!runDate) {
      console.error(`Invalid run date for organization ${org.id}`);
      return;
    }
    try {
      const alreadyRan = await prisma.schedulerRun.findUnique({
        where: {
          organizationId_runDate: {
            organizationId: org.id,
            runDate,
          },
        },
      });

      if (alreadyRan) {
        console.log(`Skipping ${org.id} - already processed for ${runDate}`);
        return;
      }

      await prisma.schedulerRun.create({
        data: {
          organizationId: org.id,
          runDate,
        },
      });
    } catch (error: any) {
      console.error(`Scheduler run check failed for ${org.id}:`, error.message);
      return;
    }

    const templates = await this.ensureTemplates(org);

    // Find today's birthdays
    const todaysBirthdays = org.people.filter((person) =>
      this.isBirthdayToday(person.birthday, org.timezone)
    );

    console.log(`Found ${todaysBirthdays.length} birthdays today`);

    // Send birthday emails
    for (const person of todaysBirthdays) {
      await this.sendBirthdayEmail(person, org, templates);
    }

    // Store last run time so per-org schedule only runs once per day.
    await prisma.organization.update({
      where: { id: org.id },
      data: { birthdayLastRunAt: new Date() },
    });

    // Check for upcoming birthdays (2 days ahead for admin notification)
    const upcomingBirthdays = org.people.filter((person: any) =>
      this.getUpcomingBirthdays(2, org.timezone)(person.birthday)
    );

    if (upcomingBirthdays.length > 0) {
      await this.sendAdminNotification(upcomingBirthdays, org);
    }
  }

  /**
   * Send birthday email to recipient
   */
  async sendBirthdayEmail(person: any, org: any, templates: any[]) {
    try {
      // Use the default template for all sends.
      const template = templates.find((item) => item.isDefault) || templates[0];

      if (!template) {
        console.error('No templates available for birthday email');
        return;
      }

      // Interpolate variables
      const content = this.interpolateTemplate(template.content, {
        first_name: person.firstName || person.fullName.split(' ')[0],
        full_name: person.fullName,
        organization_name: org.name,
        date: new Date().toLocaleDateString(),
      });

      const subject = this.interpolateTemplate(template.subject, {
        first_name: person.firstName || person.fullName.split(' ')[0],
        full_name: person.fullName,
      });

      // Send email via provider.
      const fromEmail = org.emailFromAddress || DEFAULT_FROM_EMAIL;

      if (!fromEmail) {
        throw new Error('DEFAULT_FROM_EMAIL is not configured');
      }

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

      // Log delivery
      await prisma.deliveryLog.create({
        data: {
          personId: person.id,
          templateId: template.id,
          organizationId: org.id,
          status: result.success ? 'DELIVERED' : 'FAILED',
          scheduledFor: new Date(),
          sentAt: result.success ? new Date() : null,
          deliveredAt: result.success ? new Date() : null,
          externalId: result.id,
        },
      });

      console.log(`✅ Birthday email sent to ${person.fullName}`);
    } catch (error: any) {
      console.error(`❌ Failed to send email to ${person.email}:`, error.message);

      // Log failure
      await prisma.deliveryLog.create({
        data: {
          personId: person.id,
          templateId: templates[0]?.id,
          organizationId: org.id,
          status: 'FAILED',
          scheduledFor: new Date(),
          errorMessage: error.message,
        },
      });
    }
  }

  /**
   * Send admin notification about upcoming birthdays
   */
  async sendAdminNotification(upcomingPeople: any[], org: any) {
    try {
      const adminEmails = org.users.map((u: any) => u.email);

      const peopleList = upcomingPeople
        .map((p) => `- ${p.fullName} (${new Date(p.birthday).toLocaleDateString()})`)
        .join('\n');

      const html = `
        <h2>Upcoming Birthdays - ${org.name}</h2>
        <p>The following birthdays are coming up in 2 days:</p>
        <pre>${peopleList}</pre>
        <p>These birthday emails are scheduled to be sent automatically.</p>
      `;

      const notificationFromEmail =
        NOTIFICATIONS_FROM_EMAIL || org.emailFromAddress || DEFAULT_FROM_EMAIL;

      if (!notificationFromEmail) {
        throw new Error('NOTIFICATIONS_FROM_EMAIL is not configured');
      }

      for (const email of adminEmails) {
        await this.emailProvider.send({
          to: email,
          subject: `Upcoming birthdays - ${org.name}`,
          html,
          from: {
            name: NOTIFICATIONS_FROM_NAME || org.name || DEFAULT_FROM_NAME || '',
            email: notificationFromEmail,
          },
        });
      }

      console.log(`📬 Admin notification sent to ${adminEmails.length} admins`);
    } catch (error: any) {
      console.error('Failed to send admin notification:', error.message);
    }
  }

  /**
   * Get default template
   */
  private async ensureTemplates(org: any) {
    const existing = await prisma.template.findMany({
      where: { organizationId: org.id },
    });

    if (existing.length > 0) {
      return existing.filter((template) => template.isActive || template.isDefault);
    }

    // Seed defaults for orgs without templates.
    const defaultTemplates = [
      {
        name: 'Simple Birthday',
        type: TemplateType.PLAIN_TEXT,
        subject: 'Happy Birthday {{first_name}}! 🎉',
        content: `Happy Birthday {{first_name}}!

Wishing you a wonderful day filled with joy and happiness.

From everyone at {{organization_name}}`,
        isDefault: true,
        isActive: true,
      },
      {
        name: 'Professional Birthday',
        type: TemplateType.HTML,
        subject: 'Happy Birthday {{first_name}}!',
        content: `<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 32px;">🎉 Happy Birthday! 🎉</h1>
  </div>
  <div style="background: white; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 18px; line-height: 1.6; color: #374151;">
      Dear {{first_name}},
    </p>
    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
      On behalf of everyone at {{organization_name}}, we want to wish you a very happy birthday!
      We hope your special day is filled with joy, laughter, and wonderful memories.
    </p>
    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
      Thank you for being such an important part of our community.
    </p>
    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 14px; color: #6b7280; margin: 0;">
        With warm wishes,<br>
        <strong>{{organization_name}}</strong>
      </p>
    </div>
  </div>
  <div style="text-align: center; margin-top: 20px;">
    <p style="font-size: 12px; color: #9ca3af;">
      This is an automated birthday message from MomentOS
    </p>
  </div>
</body>
</html>`,
        isDefault: false,
        isActive: false,
      },
      {
        name: 'Fun & Colorful',
        type: TemplateType.HTML,
        subject: '🎂 It\'s Your Special Day, {{first_name}}! 🎈',
        content: `<html>
<body style="font-family: 'Comic Sans MS', cursive, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fef3c7;">
  <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 64px; margin-bottom: 10px;">🎉🎂🎈</div>
      <h1 style="color: #dc2626; margin: 0; font-size: 36px; text-shadow: 2px 2px 4px rgba(0,0,0,0.1);">
        HAPPY BIRTHDAY!
      </h1>
    </div>
    <p style="font-size: 20px; text-align: center; color: #1f2937; line-height: 1.8;">
      Hey <strong>{{first_name}}</strong>! 🎊
    </p>
    <p style="font-size: 16px; text-align: center; color: #374151; line-height: 1.6;">
      Another trip around the sun completed! We hope your birthday is as amazing as you are.
      May your day be filled with cake, laughter, and everything that makes you smile!
    </p>
    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
      <p style="margin: 0; font-size: 18px; color: #92400e;">
        🎁 Make a wish! 🎁
      </p>
    </div>
    <p style="text-align: center; font-size: 14px; color: #6b7280; margin-top: 30px;">
      Cheers from all of us at<br>
      <strong style="color: #1f2937; font-size: 16px;">{{organization_name}}</strong>
    </p>
  </div>
</body>
</html>`,
        isDefault: false,
        isActive: false,
      },
    ];

    const created = await Promise.all(
      defaultTemplates.map((template) =>
        prisma.template.create({
          data: {
            ...template,
            organizationId: org.id,
          },
        })
      )
    );

    return created.filter((template) => template.isActive || template.isDefault);
  }

  /**
   * Interpolate template variables
   */
  private interpolateTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  private shouldRunForOrg(org: {
    timezone: string;
    birthdaySendHour: number;
    birthdaySendMinute: number;
    birthdayLastRunAt: Date | null;
  }) {
    // Run only when org-local time hits configured hour/minute.
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

  /**
   * Run the scheduler
   */
  async run() {
    console.log('🚀 Birthday Scheduler started');

    // Get all organizations
    const organizations = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        timezone: true,
        birthdaySendHour: true,
        birthdaySendMinute: true,
        birthdayLastRunAt: true,
      },
    });

    console.log(`Found ${organizations.length} organizations`);

    // Process each organization
    for (const org of organizations) {
      if (this.shouldRunForOrg(org)) {
        await this.processOrganization(org.id);
      }
    }

    console.log('✅ Scheduler run complete');
  }

  /**
   * Start cron job
   */
  startCron() {
    console.log('⏰ Scheduling daily birthday checks at 9:00 AM');

    // Check every minute; per-org time windows handled in shouldRunForOrg
    cron.schedule('* * * * *', async () => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Running scheduled birthday check - ${new Date().toISOString()}`);
      console.log('='.repeat(50));
      await this.run();
    });

    // Also run immediately on startup (for testing)
    console.log('Running initial check...');
    this.run();
  }
}

// ============================================================================
// START WORKER
// ============================================================================

const emailProvider = new ResendEmailProvider();

const scheduler = new BirthdayScheduler(emailProvider);

// Start the cron job
scheduler.startCron();

// Keep process alive
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down scheduler...');
  await prisma.$disconnect();
  process.exit(0);
});
