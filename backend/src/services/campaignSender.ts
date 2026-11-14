// Executes one "run" of a campaign: interpolate per contact, fan out across the
// selected channels, and record a CampaignDelivery row for every attempt.
//
// The unique index on (campaignId, contactId, channel, runDate) is what makes a
// run idempotent, so a retry or an overlapping worker tick cannot double-send.

import {
  Campaign,
  CampaignContact,
  CampaignTemplate,
  DeliveryChannel,
  DeliveryStatus,
  Organization,
  Prisma,
  Template,
} from "@prisma/client";
import {
  DEFAULT_FROM_NAME,
  MOMENT_FROM_EMAIL,
  interpolateTemplate,
  prisma,
  resolveFromEmail,
} from "../serverContext";
import { EmailService } from "./emailService";
import { smsService } from "./smsService";
import { analyzeSms } from "./smsSegments";

export type CampaignWithRelations = Campaign & {
  campaignTemplate?: CampaignTemplate | null;
  template?: Template | null;
  organization?: Organization | null;
};

export interface CampaignRunResult {
  runDate: string;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  byChannel: Record<string, { sent: number; failed: number }>;
}

const buildVariables = (contact: CampaignContact, campaign: Campaign) => ({
  first_name: contact.firstName,
  last_name: contact.lastName || "",
  full_name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
  email: contact.email || "",
  phone: contact.phone || "",
  campaign_name: campaign.name,
});

/**
 * Templates may carry a {{body}} slot. When present the template is a wrapper —
 * it supplies the header, styling and footer, and the campaign's own message is
 * injected into the slot. A template without the slot is a self-contained
 * design and is still sent exactly as authored, so existing campaigns keep
 * behaving as they did before the slot was introduced.
 *
 * Mirrored in worker/campaignRunner.ts and frontend/src/lib/campaignRender.ts —
 * change all three together or the preview stops matching what is sent.
 */
export const BODY_SLOT_PATTERN = /\{\{\s*body\s*\}\}/g;

export const hasBodySlot = (content: string) =>
  new RegExp(BODY_SLOT_PATTERN.source).test(content);

/** Escapes a plain-text body and preserves its paragraph breaks as HTML. */
export const textToHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;">${block.replace(/\n/g, "<br />")}</p>`
    )
    .join("\n");

/** Replaces every {{body}} slot. Uses a function so $-sequences stay literal. */
const fillBodySlot = (content: string, body: string) =>
  content.replace(BODY_SLOT_PATTERN, () => body);

const resolveEmailBody = (campaign: CampaignWithRelations) => {
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

    if (template.type === "PLAIN_TEXT") {
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

/** SMS falls back to the email plain text when no dedicated smsText is set. */
export const resolveSmsBody = (campaign: Campaign) =>
  (campaign.smsText && campaign.smsText.trim()) || campaign.bodyText;

/** Strips the provider prefix the email service adds (sometimes twice). */
const cleanErrorMessage = (message: string) =>
  message.replace(/^(EMAIL_SERVICE_ERROR:\s*)+/i, "").trim() || "Unknown error";

const recordDelivery = async (params: {
  campaignId: string;
  contactId: string;
  organizationId: string;
  channel: DeliveryChannel;
  runDate: string;
  status: DeliveryStatus;
  externalId?: string | null;
  errorMessage?: string | null;
  segments?: number | null;
}) => {
  try {
    await prisma.campaignDelivery.create({
      data: {
        campaignId: params.campaignId,
        contactId: params.contactId,
        organizationId: params.organizationId,
        channel: params.channel,
        runDate: params.runDate,
        status: params.status,
        scheduledFor: new Date(),
        sentAt:
          params.status === DeliveryStatus.SENT ? new Date() : null,
        externalId: params.externalId ?? null,
        errorMessage: params.errorMessage ?? null,
        segments: params.segments ?? null,
      },
    });
    return true;
  } catch (error: any) {
    // P2002 = this contact/channel already has a row for this run date.
    if (error?.code === "P2002") return false;
    throw error;
  }
};

/**
 * Claims a (contact, channel, runDate) slot before sending. Returns false when
 * another run already claimed it, which is the double-send guard.
 */
const claimSlot = async (params: {
  campaignId: string;
  contactId: string;
  organizationId: string;
  channel: DeliveryChannel;
  runDate: string;
}) => {
  try {
    await prisma.campaignDelivery.create({
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
    if (error?.code === "P2002") return false;
    throw error;
  }
};

const finishSlot = async (params: {
  campaignId: string;
  contactId: string;
  channel: DeliveryChannel;
  runDate: string;
  status: DeliveryStatus;
  externalId?: string | null;
  errorMessage?: string | null;
  segments?: number | null;
}) => {
  await prisma.campaignDelivery.updateMany({
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
      segments: params.segments ?? null,
    },
  });
};

export async function runCampaign(params: {
  campaign: CampaignWithRelations;
  contacts: CampaignContact[];
  organization: Organization;
  runDate: string;
  /** Overrides the recipient for a test send. */
  senderReplyTo?: string | null;
}): Promise<CampaignRunResult> {
  const { campaign, contacts, organization, runDate } = params;

  const senderEmail = resolveFromEmail(
    organization.emailFromAddress || MOMENT_FROM_EMAIL
  );
  if (!senderEmail) {
    throw new Error(
      "No verified sender address is configured, so this campaign cannot send email."
    );
  }
  const senderName =
    organization.emailFromName ||
    process.env.MOMENT_FROM_NAME ||
    DEFAULT_FROM_NAME ||
    "MomentOS";

  const channels = campaign.deliveryChannels.length
    ? campaign.deliveryChannels
    : [DeliveryChannel.email];

  const result: CampaignRunResult = {
    runDate,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    byChannel: {},
  };
  const bump = (channel: DeliveryChannel, key: "sent" | "failed") => {
    result.byChannel[channel] = result.byChannel[channel] || { sent: 0, failed: 0 };
    result.byChannel[channel][key] += 1;
  };

  const emailBody = resolveEmailBody(campaign);
  const smsBody = resolveSmsBody(campaign);

  for (const contact of contacts) {
    if (contact.optedOut) {
      result.skipped += 1;
      continue;
    }

    const variables = buildVariables(contact, campaign);

    for (const channel of channels) {
      if (channel === DeliveryChannel.email && !contact.email) {
        result.skipped += 1;
        continue;
      }
      if (channel === DeliveryChannel.sms && !contact.phone) {
        result.skipped += 1;
        continue;
      }
      if (channel === DeliveryChannel.whatsapp) {
        // WhatsApp campaign sends are not wired up yet; skip rather than fail.
        result.skipped += 1;
        continue;
      }
      if (channel === DeliveryChannel.sms && !organization.smsEnabled) {
        result.skipped += 1;
        continue;
      }

      const claimed = await claimSlot({
        campaignId: campaign.id,
        contactId: contact.id,
        organizationId: organization.id,
        channel,
        runDate,
      });
      if (!claimed) {
        result.skipped += 1;
        continue;
      }

      result.attempted += 1;

      try {
        if (channel === DeliveryChannel.email) {
          const sendResult = await EmailService.send({
            to: contact.email!,
            subject: interpolateTemplate(emailBody.subject, variables),
            text: interpolateTemplate(emailBody.text, variables),
            html: emailBody.html
              ? interpolateTemplate(emailBody.html, variables)
              : undefined,
            from: { name: senderName, email: senderEmail },
            replyTo: campaign.replyTo || params.senderReplyTo || undefined,
          });
          await finishSlot({
            campaignId: campaign.id,
            contactId: contact.id,
            channel,
            runDate,
            status: DeliveryStatus.SENT,
            externalId: sendResult.id,
          });
          result.sent += 1;
          bump(channel, "sent");
        } else {
          const message = interpolateTemplate(smsBody, variables);
          const info = analyzeSms(message);
          const sendResult = await smsService.send({
            to: contact.phone!,
            message,
            senderId: organization.senderId || undefined,
          });
          if (!sendResult.success) {
            throw new Error(sendResult.error || "SMS provider rejected the message");
          }
          await finishSlot({
            campaignId: campaign.id,
            contactId: contact.id,
            channel,
            runDate,
            status: DeliveryStatus.SENT,
            externalId: sendResult.messageId ?? null,
            segments: info.segments,
          });
          result.sent += 1;
          bump(channel, "sent");
        }
      } catch (error: any) {
        await finishSlot({
          campaignId: campaign.id,
          contactId: contact.id,
          channel,
          runDate,
          status: DeliveryStatus.FAILED,
          errorMessage: cleanErrorMessage(error?.message || "").slice(0, 500),
        });
        result.failed += 1;
        bump(channel, "failed");
      }
    }
  }

  return result;
}

export const __testables = { recordDelivery, buildVariables, resolveEmailBody };
export type { Prisma };
