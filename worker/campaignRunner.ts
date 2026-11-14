import {
  Campaign,
  CampaignTemplate,
  CampaignContact,
  DeliveryChannel,
  DeliveryStatus,
  Organization,
  PrismaClient,
  Template,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { smsService } from './smsService';
import { isCampaignDueOn } from './campaignSchedule';

type CampaignWithTemplate = Campaign & {
  campaignTemplate: CampaignTemplate | null;
  template: Template | null;
};

export interface CampaignEmailSender {
  send(params: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    from: { name: string; email: string };
    replyTo?: string;
  }): Promise<{ id: string; success: boolean }>;
}

const interpolate = (template: string, variables: Record<string, string>) => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
};

const buildVariables = (contact: CampaignContact, campaign: Campaign) => ({
  first_name: contact.firstName,
  last_name: contact.lastName || '',
  full_name: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
  email: contact.email || '',
  phone: contact.phone || '',
  campaign_name: campaign.name,
});

const BODY_SLOT_PATTERN = /\{\{\s*body\s*\}\}/g;

const hasBodySlot = (content: string) =>
  new RegExp(BODY_SLOT_PATTERN.source).test(content);

/** Escapes a plain-text body and preserves its paragraph breaks as HTML. */
const textToHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;">${block.replace(/\n/g, '<br />')}</p>`
    )
    .join('\n');

const fillBodySlot = (content: string, body: string) =>
  content.replace(BODY_SLOT_PATTERN, () => body);

const resolveEmailBody = (campaign: CampaignWithTemplate) => {

  const campaignTemplate = campaign.campaignTemplate;
  if (campaignTemplate?.content) {
    return {
      subject: campaign.subject || campaignTemplate.subject || campaign.name,
      html: hasBodySlot(campaignTemplate.content)
        ? fillBodySlot(campaignTemplate.content, textToHtml(campaign.bodyText))
        : campaignTemplate.content,
      text: campaign.bodyText,
    };
  }

  const template = campaign.template;
  if (template?.content) {
    const subject = campaign.subject || template.subject;

    if (template.type === 'PLAIN_TEXT') {
      return {
        subject,
        html: undefined,
        text: hasBodySlot(template.content)
          ? fillBodySlot(template.content, campaign.bodyText)
          : template.content,
      };
    }

    return {
      subject,
      html: hasBodySlot(template.content)
        ? fillBodySlot(template.content, textToHtml(campaign.bodyText))
        : template.content,
      text: campaign.bodyText,
    };
  }

  return {
    subject: campaign.subject,
    html: campaign.bodyHtml || undefined,
    text: campaign.bodyText,
  };
};

/** Strips the provider prefix the email service adds (sometimes twice). */
const cleanErrorMessage = (message: string) =>
  message.replace(/^(EMAIL_SERVICE_ERROR:\s*)+/i, '').trim() || 'Unknown error';

const resolveSmsBody = (campaign: Campaign) =>
  (campaign.smsText && campaign.smsText.trim()) || campaign.bodyText;

/** How long after its send time a campaign may still go out. */
const SEND_WINDOW_MINUTES = 120;

export class CampaignRunner {
  private running = false;

  constructor(
    private prisma: PrismaClient,
    private emailProvider: CampaignEmailSender,
    private resolveFromEmail: (candidate?: string | null) => string | null,
    private defaults: { fromEmail: string; fromName: string }
  ) {}

  private getOrgNow(timezone?: string | null) {
    const zone = timezone || 'UTC';
    const now = DateTime.now().setZone(zone);
    return now.isValid ? now : DateTime.now().setZone('UTC');
  }

  /** Claims one (contact, channel) slot for this run; false when already taken. */
  private async claimSlot(params: {
    campaignId: string;
    contactId: string;
    organizationId: string;
    channel: DeliveryChannel;
    runDate: string;
  }) {
    try {
      await this.prisma.campaignDelivery.create({
        data: {
          campaignId: params.campaignId,
          contactId: params.contactId,
          organizationId: params.organizationId,
          channel: params.channel,
          runDate: params.runDate,
          status: DeliveryStatus.SENDING,
          scheduledFor: new Date(),
        },
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2002') return false;
      throw error;
    }
  }

  private async finishSlot(params: {
    campaignId: string;
    contactId: string;
    channel: DeliveryChannel;
    runDate: string;
    status: DeliveryStatus;
    externalId?: string | null;
    errorMessage?: string | null;
  }) {
    await this.prisma.campaignDelivery.updateMany({
      where: {
        campaignId: params.campaignId,
        contactId: params.contactId,
        channel: params.channel,
        runDate: params.runDate,
      },
      data: {
        status: params.status,
        sentAt: params.status === DeliveryStatus.SENT ? new Date() : null,
        externalId: params.externalId ?? null,
        errorMessage: params.errorMessage ?? null,
      },
    });
  }

  private async sendToContact(params: {
    campaign: CampaignWithTemplate;
    contact: CampaignContact;
    org: Organization;
    runDate: string;
    senderEmail: string;
    senderName: string;
  }) {
    const { campaign, contact, org, runDate, senderEmail, senderName } = params;
    const variables = buildVariables(contact, campaign);
    const channels = campaign.deliveryChannels.length
      ? campaign.deliveryChannels
      : [DeliveryChannel.email];

    for (const channel of channels) {
      if (channel === DeliveryChannel.whatsapp) continue;
      if (channel === DeliveryChannel.email && !contact.email) continue;
      if (channel === DeliveryChannel.sms && !contact.phone) continue;
      if (channel === DeliveryChannel.sms && !org.smsEnabled) continue;

      const claimed = await this.claimSlot({
        campaignId: campaign.id,
        contactId: contact.id,
        organizationId: org.id,
        channel,
        runDate,
      });
      if (!claimed) continue;

      try {
        if (channel === DeliveryChannel.email) {
          const body = resolveEmailBody(campaign);
          const result = await this.emailProvider.send({
            to: contact.email!,
            subject: interpolate(body.subject, variables),
            text: interpolate(body.text, variables),
            html: body.html ? interpolate(body.html, variables) : undefined,
            from: { name: senderName, email: senderEmail },
            replyTo: campaign.replyTo || undefined,
          });
          await this.finishSlot({
            campaignId: campaign.id,
            contactId: contact.id,
            channel,
            runDate,
            status: DeliveryStatus.SENT,
            externalId: result.id,
          });
        } else {
          const message = interpolate(resolveSmsBody(campaign), variables);
          const result = await smsService.send({
            to: contact.phone!,
            message,
            senderId: org.senderId || undefined,
          });
          if (!result.success) {
            throw new Error(result.error || 'SMS provider rejected the message');
          }
          await this.finishSlot({
            campaignId: campaign.id,
            contactId: contact.id,
            channel,
            runDate,
            status: DeliveryStatus.SENT,
            externalId: result.messageId ?? null,
          });
        }
      } catch (error: any) {
        await this.finishSlot({
          campaignId: campaign.id,
          contactId: contact.id,
          channel,
          runDate,
          status: DeliveryStatus.FAILED,
          errorMessage: cleanErrorMessage(error?.message || '').slice(0, 500),
        });
      }
    }
  }

  private async processCampaign(
    campaign: CampaignWithTemplate,
    org: Organization
  ) {
    const orgNow = this.getOrgNow(org.timezone);
    const runDate = orgNow.toISODate();
    if (!runDate) return;

    if (campaign.lastRunDate === runDate) return;
    if (!isCampaignDueOn(campaign, orgNow)) return;

    // Send at or after the chosen hour:minute, within a catch-up window so a
    // worker restart or a slow tick does not skip the day. Past the window the
    // day is missed rather than sent hours late.
    const sendAt = orgNow.set({
      hour: campaign.sendHour,
      minute: campaign.sendMinute,
      second: 0,
      millisecond: 0,
    });
    const minutesLate = orgNow.diff(sendAt, 'minutes').minutes;
    if (minutesLate < 0 || minutesLate >= SEND_WINDOW_MINUTES) return;

    const claimed = await this.prisma.campaign.updateMany({
      where: { id: campaign.id, lastRunDate: campaign.lastRunDate },
      data: { lastRunDate: runDate, lastRunAt: new Date() },
    });
    if (claimed.count === 0) {
      console.log(`[campaign ${campaign.id}] run for ${runDate} already claimed`);
      return;
    }

    // SMS-only campaigns do not need an email sender.
    const sendsEmail = campaign.deliveryChannels.includes(DeliveryChannel.email);
    const senderEmail = sendsEmail
      ? this.resolveFromEmail(org.emailFromAddress || this.defaults.fromEmail)
      : '';
    if (sendsEmail && !senderEmail) {
      console.error(
        `[campaign ${campaign.id}] no verified sender address; skipping run`
      );
      return;
    }
    const senderName =
      org.emailFromName || this.defaults.fromName || 'MomentOS';

    const contacts = await this.prisma.campaignContact.findMany({
      where: { campaignId: campaign.id, optedOut: false },
      orderBy: { createdAt: 'asc' },
    });

    console.log(
      `[campaign ${campaign.id}] running "${campaign.name}" for ${contacts.length} contacts on ${runDate}`
    );

    for (const contact of contacts) {
      await this.sendToContact({
        campaign,
        contact,
        org,
        runDate,
        senderEmail: senderEmail || '',
        senderName,
      });
    }

    const summary = await this.prisma.campaignDelivery.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id, runDate },
      _count: { _all: true },
    });
    console.log(
      `[campaign ${campaign.id}] run ${runDate} complete: ` +
        summary.map((row) => `${row.status}=${row._count._all}`).join(' ')
    );

    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { runCount: { increment: 1 } },
    });

    // A one-time campaign has nothing left to do after its single send.
    if (campaign.recurrenceRule === 'ONE_TIME') {
      await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED' },
      });
      return;
    }

    // Past its end date, it will never be due again.
    if (campaign.endDate) {
      const end = DateTime.fromJSDate(campaign.endDate, {
        zone: orgNow.zone,
      }).startOf('day');
      if (orgNow.startOf('day') >= end) {
        await this.prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'COMPLETED' },
        });
      }
    }
  }

  /** One pass over active campaigns. Overlapping calls return immediately. */
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } finally {
      this.running = false;
    }
  }

  private async runOnce() {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        organization: { isSuspended: false },
      },
      include: { campaignTemplate: true, template: true, organization: true },
    });

    if (campaigns.length === 0) return;
    console.log(`Checking ${campaigns.length} active campaign(s).`);

    for (const campaign of campaigns) {
      const { organization, ...rest } = campaign;
      try {
        await this.processCampaign(
          rest as CampaignWithTemplate,
          organization as Organization
        );
      } catch (error: any) {
        console.error(
          `[campaign ${campaign.id}] run failed:`,
          error?.message || error
        );
      }
    }
  }
}
