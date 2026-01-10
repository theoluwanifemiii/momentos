// Birthday Scheduler Worker
// File: worker/scheduler.ts
// Runs daily to check for birthdays and send emails

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';

const prisma = new PrismaClient();

// Email provider interface (to be implemented)
interface EmailProvider {
  send(params: {
    to: string;
    subject: string;
    html: string;
    from: { name: string; email: string };
  }): Promise<{ id: string; success: boolean }>;
}

// Placeholder email provider (replace with SendGrid/Resend)
class ConsoleEmailProvider implements EmailProvider {
  async send(params: any) {
    console.log(`
📧 EMAIL SENT
To: ${params.to}
Subject: ${params.subject}
From: ${params.from.name} <${params.from.email}>
---
${params.html}
---
    `);
    return { id: `email-${Date.now()}`, success: true };
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
  private isBirthdayToday(birthday: Date, timezone: string): boolean {
    const now = new Date();
    const bday = new Date(birthday);

    // Handle Feb 29 in non-leap years
    if (bday.getMonth() === 1 && bday.getDate() === 29) {
      const isLeapYear = (year: number) =>
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

      if (!isLeapYear(now.getFullYear())) {
        // Celebrate on Feb 28 in non-leap years
        return now.getMonth() === 1 && now.getDate() === 28;
      }
    }

    return now.getMonth() === bday.getMonth() && now.getDate() === bday.getDate();
  }

  /**
   * Get upcoming birthdays (for admin notifications)
   */
  private getUpcomingBirthdays(daysAhead: number): (birthday: Date) => boolean {
    return (birthday: Date) => {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + daysAhead);

      const bday = new Date(birthday);
      const thisYearBirthday = new Date(
        now.getFullYear(),
        bday.getMonth(),
        bday.getDate()
      );

      return (
        thisYearBirthday.getMonth() === futureDate.getMonth() &&
        thisYearBirthday.getDate() === futureDate.getDate()
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

    // Find today's birthdays
    const todaysBirthdays = org.people.filter((person) =>
      this.isBirthdayToday(person.birthday, org.timezone)
    );

    console.log(`Found ${todaysBirthdays.length} birthdays today`);

    // Send birthday emails
    for (const person of todaysBirthdays) {
      await this.sendBirthdayEmail(person, org);
    }

    // Check for upcoming birthdays (2 days ahead for admin notification)
    const upcomingBirthdays = org.people.filter(
      this.getUpcomingBirthdays(2)
    );

    if (upcomingBirthdays.length > 0) {
      await this.sendAdminNotification(upcomingBirthdays, org);
    }
  }

  /**
   * Send birthday email to recipient
   */
  async sendBirthdayEmail(person: any, org: any) {
    try {
      // Get template (use first active template or default)
      const template = org.templates[0] || this.getDefaultTemplate();

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

      // Send email
      const result = await this.emailProvider.send({
        to: person.email,
        subject,
        html: content,
        from: {
          name: org.emailFromName || org.name,
          email: org.emailFromAddress || 'noreply@momentos.dev',
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
          templateId: org.templates[0]?.id || 'default',
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

      for (const email of adminEmails) {
        await this.emailProvider.send({
          to: email,
          subject: `Upcoming birthdays - ${org.name}`,
          html,
          from: {
            name: 'MomentOS',
            email: 'notifications@momentos.dev',
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
  private getDefaultTemplate() {
    return {
      id: 'default',
      subject: 'Happy Birthday {{first_name}}! 🎉',
      content: `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb;">Happy Birthday {{first_name}}! 🎉</h1>
            <p style="font-size: 16px; line-height: 1.6;">
              Wishing you a wonderful birthday filled with joy and happiness!
            </p>
            <p style="font-size: 16px; line-height: 1.6;">
              From everyone at {{organization_name}}
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              This is an automated message from MomentOS.
            </p>
          </body>
        </html>
      `,
      type: 'HTML',
    };
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

  /**
   * Run the scheduler
   */
  async run() {
    console.log('🚀 Birthday Scheduler started');

    // Get all organizations
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    console.log(`Found ${organizations.length} organizations`);

    // Process each organization
    for (const org of organizations) {
      await this.processOrganization(org.id);
    }

    console.log('✅ Scheduler run complete');
  }

  /**
   * Start cron job
   */
  startCron() {
    console.log('⏰ Scheduling daily birthday checks at 9:00 AM');

    // Run every day at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
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

const emailProvider = new ConsoleEmailProvider();
// Replace with: new SendGridProvider() or new ResendProvider()

const scheduler = new BirthdayScheduler(emailProvider);

// Start the cron job
scheduler.startCron();

// Keep process alive
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down scheduler...');
  await prisma.$disconnect();
  process.exit(0);
});