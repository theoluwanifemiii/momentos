import { Express, NextFunction, Response } from "express";
import {
  CampaignStatus,
  DeliveryChannel,
  MomentRecurrence,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import {
  authenticate,
  AuthRequest,
  DEFAULT_FROM_NAME,
  getOrgDateTime,
  getUserErrorMessage,
  interpolateTemplate,
  MOMENT_FROM_EMAIL,
  prisma,
  resolveFromEmail,
} from "../serverContext";
import { EmailService } from "../services/emailService";
import { smsService } from "../services/smsService";
import {
  CAMPAIGN_CSV_TEMPLATE,
  MAX_CAMPAIGN_CONTACTS,
  validateCampaignCsv,
} from "../services/campaignCsvValidator";
import {
  nextCampaignRuns,
  SUPPORTED_CAMPAIGN_RECURRENCES,
} from "../services/campaignSchedule";
import { runCampaign, resolveSmsBody } from "../services/campaignSender";
import { analyzeSms, assertSmsWithinLimit } from "../services/smsSegments";
import posthog from "../lib/posthog";

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const channelsSchema = z
  .array(z.nativeEnum(DeliveryChannel))
  .min(1, "Pick at least one channel.")
  .refine((channels) => new Set(channels).size === channels.length, {
    message: "Duplicate channels.",
  });

const campaignBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  bodyText: z.string().trim().min(1).max(20000),
  bodyHtml: z.string().max(200000).nullable().optional(),
  smsText: z.string().max(2000).nullable().optional(),
  replyTo: z.string().trim().email().nullable().optional(),
  templateId: z.string().min(1).nullable().optional(),
  campaignTemplateId: z.string().min(1).nullable().optional(),
  deliveryChannels: channelsSchema.default([DeliveryChannel.email]),
  recurrenceRule: z.nativeEnum(MomentRecurrence).default(MomentRecurrence.ONE_TIME),
  customIntervalDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  sendHour: z.coerce.number().int().min(0).max(23).default(9),
  sendMinute: z.coerce.number().int().min(0).max(59).default(0),
});

const createCampaignSchema = campaignBaseSchema;
const updateCampaignSchema = campaignBaseSchema.partial().strict();

const contactInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

const importSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  /** replace clears the existing list; append keeps it and adds new rows. */
  mode: z.enum(["append", "replace"]).default("append"),
});

// Legacy one-off endpoint kept for the existing hardcoded savings screen.
const legacySendSchema = z.object({
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().optional(),
  recipients: z
    .array(
      z.object({
        firstName: z.string().trim().min(1).max(100),
        email: z.string().trim().email(),
      })
    )
    .min(1)
    .max(1000),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * A validation failure whose message is meant for the person using the app.
 * `getUserErrorMessage` only lets a narrow allowlist of phrasings through, so
 * intentional messages are carried by this type and returned verbatim.
 */
class CampaignError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "CampaignError";
  }
}

const fail = (res: Response, err: any, fallbackStatus = 400) => {
  if (err instanceof CampaignError) {
    return res.status(err.status).json({ error: err.message });
  }
  return res.status(fallbackStatus).json({ error: getUserErrorMessage(err) });
};

const requireOrgAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.userRole === "ADMIN") return next();
    const user = await prisma.user.findFirst({
      where: { id: req.userId, organizationId: req.organizationId },
      select: { role: true },
    });
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (user.role !== UserRole.ADMIN) {
      return res
        .status(403)
        .json({ error: "Admin role is required to manage campaigns." });
    }
    return next();
  } catch (err: any) {
    return res.status(500).json({ error: getUserErrorMessage(err) });
  }
};

const ensureSupportedRecurrence = (rule: MomentRecurrence) => {
  if (!SUPPORTED_CAMPAIGN_RECURRENCES.includes(rule)) {
    throw new CampaignError("Unsupported recurrence for a campaign.");
  }
};

const resolveCustomInterval = (
  rule: MomentRecurrence,
  customIntervalDays?: number | null
) => {
  if (rule !== MomentRecurrence.CUSTOM) return null;
  if (!customIntervalDays || customIntervalDays < 1) {
    throw new CampaignError("A custom recurrence needs an interval in days.");
  }
  return customIntervalDays;
};

const assertTemplateBelongsToOrganization = async (
  organizationId: string,
  templateId?: string | null
) => {
  if (!templateId) return;
  const assignment = await prisma.organizationTemplate.findFirst({
    where: { organizationId, templateId, isActive: true },
    select: { id: true },
  });
  if (!assignment) {
    throw new CampaignError("Template is not available for this organization.");
  }
};

const assertCampaignTemplateBelongsToOrganization = async (
  organizationId: string,
  campaignTemplateId?: string | null
) => {
  if (!campaignTemplateId) return;
  const template = await prisma.campaignTemplate.findFirst({
    where: {
      id: campaignTemplateId,
      isActive: true,
      OR: [{ organizationId }, { isSystem: true }],
    },
    select: { id: true },
  });
  if (!template) {
    throw new CampaignError("Campaign template is not available for this organization.");
  }
};

/** Validates SMS length up front so a bad body fails at save, not at send. */
const assertSmsBodyValid = (campaign: {
  deliveryChannels: DeliveryChannel[];
  smsText?: string | null;
  bodyText: string;
}) => {
  if (!campaign.deliveryChannels.includes(DeliveryChannel.sms)) return;
  const body = (campaign.smsText && campaign.smsText.trim()) || campaign.bodyText;
  // Interpolation is measured with a representative name so the saved length
  // reflects what recipients actually get, not the shorter raw placeholder.
  const sample = interpolateTemplate(body, {
    first_name: "Oluwadamilola",
    last_name: "Adebayo",
    full_name: "Oluwadamilola Adebayo",
    email: "",
    phone: "",
    campaign_name: "",
  });
  try {
    assertSmsWithinLimit(sample);
  } catch (err: any) {
    throw new CampaignError(err.message);
  }
};

const serializeCampaign = (campaign: any, timezone: string) => {
  const orgNow = getOrgDateTime(timezone);
  const upcoming = nextCampaignRuns(
    {
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      recurrenceRule: campaign.recurrenceRule,
      customIntervalDays: campaign.customIntervalDays,
      sendHour: campaign.sendHour,
      sendMinute: campaign.sendMinute,
    },
    orgNow,
    3
  );

  const smsBody = resolveSmsBody(campaign);

  return {
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    bodyText: campaign.bodyText,
    bodyHtml: campaign.bodyHtml ?? null,
    smsText: campaign.smsText ?? null,
    replyTo: campaign.replyTo ?? null,
    deliveryChannels: campaign.deliveryChannels,
    recurrenceRule: campaign.recurrenceRule,
    customIntervalDays: campaign.customIntervalDays ?? null,
    startDate: campaign.startDate,
    endDate: campaign.endDate ?? null,
    sendHour: campaign.sendHour,
    sendMinute: campaign.sendMinute,
    status: campaign.status,
    lastRunAt: campaign.lastRunAt ?? null,
    lastRunDate: campaign.lastRunDate ?? null,
    runCount: campaign.runCount ?? 0,
    timezone,
    template: campaign.template
      ? {
          id: campaign.template.id,
          name: campaign.template.name,
          subject: campaign.template.subject,
          type: campaign.template.type,
          channels: campaign.template.channels,
        }
      : null,
    campaignTemplate: campaign.campaignTemplate
      ? {
          id: campaign.campaignTemplate.id,
          name: campaign.campaignTemplate.name,
          subject: campaign.campaignTemplate.subject,
          content: campaign.campaignTemplate.content,
        }
      : null,
    contactCount: campaign._count?.contacts ?? campaign.contacts?.length ?? 0,
    sms: campaign.deliveryChannels.includes(DeliveryChannel.sms)
      ? analyzeSms(smsBody)
      : null,
    nextRuns: upcoming.map((run) => run.toISO()),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
};

const loadCampaignForOrg = async (id: string, organizationId: string) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId },
    include: {
            campaignTemplate: true,
            template: true,
            _count: { select: { contacts: true } },
          },
  });
  if (!campaign) throw new CampaignError("Campaign not found.", 404);
  return campaign;
};

const getOrganization = async (organizationId: string) => {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!org) throw new CampaignError("Organization not found.", 404);
  return org;
};

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function registerCampaignRoutes(app: Express) {
  /* --- static paths first, so they are not captured by /:id --- */

  app.get(
    "/api/campaigns/csv-template",
    authenticate,
    async (_req: AuthRequest, res: Response) => {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="campaign-contacts-template.csv"'
      );
      res.send(CAMPAIGN_CSV_TEMPLATE);
    }
  );

  app.post(
    "/api/campaigns/sms-preview",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        const { text } = z.object({ text: z.string().max(5000) }).parse(req.body);
        res.json({ sms: analyzeSms(text) });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  /* --- campaign CRUD --- */

  app.get("/api/campaigns", authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const statusParam = req.query.status;
      const where: any = { organizationId: req.organizationId! };
      if (statusParam) {
        where.status = z.nativeEnum(CampaignStatus).parse(statusParam);
      }

      const [org, campaigns] = await Promise.all([
        getOrganization(req.organizationId!),
        prisma.campaign.findMany({
          where,
          include: {
            campaignTemplate: true,
            template: true,
            _count: { select: { contacts: true } },
          },
          orderBy: [{ createdAt: "desc" }],
        }),
      ]);

      res.json({
        campaigns: campaigns.map((campaign) =>
          serializeCampaign(campaign, org.timezone)
        ),
      });
    } catch (err: any) {
      fail(res, err, 400);
    }
  });

  app.post(
    "/api/campaigns",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = createCampaignSchema.parse(req.body);
        ensureSupportedRecurrence(data.recurrenceRule);
        const customIntervalDays = resolveCustomInterval(
          data.recurrenceRule,
          data.customIntervalDays
        );
        await assertTemplateBelongsToOrganization(
          req.organizationId!,
          data.templateId
        );
        await assertCampaignTemplateBelongsToOrganization(
          req.organizationId!,
          data.campaignTemplateId
        );
        assertSmsBodyValid(data);

        if (data.endDate && data.endDate < data.startDate) {
          throw new CampaignError("End date cannot be before the start date.");
        }

        const org = await getOrganization(req.organizationId!);
        if (
          data.deliveryChannels.includes(DeliveryChannel.sms) &&
          !org.smsEnabled
        ) {
          throw new CampaignError(
            "SMS is not enabled for this organization. Contact support to turn it on."
          );
        }

        const campaign = await prisma.campaign.create({
          data: {
            name: data.name,
            organizationId: req.organizationId!,
            createdByUserId: req.userId ?? null,
            subject: data.subject,
            bodyText: data.bodyText,
            bodyHtml: data.bodyHtml ?? null,
            smsText: data.smsText ?? null,
            replyTo: data.replyTo ?? null,
            templateId: data.templateId ?? null,
            campaignTemplateId: data.campaignTemplateId ?? null,
            deliveryChannels: data.deliveryChannels,
            recurrenceRule: data.recurrenceRule,
            customIntervalDays,
            startDate: data.startDate,
            endDate: data.endDate ?? null,
            sendHour: data.sendHour,
            sendMinute: data.sendMinute,
            status: CampaignStatus.DRAFT,
          },
          include: {
            campaignTemplate: true,
            template: true,
            _count: { select: { contacts: true } },
          },
        });

        posthog.capture({
          distinctId: req.userId!,
          event: "campaign_created",
          properties: {
            campaign_id: campaign.id,
            recurrence_rule: campaign.recurrenceRule,
            delivery_channels: campaign.deliveryChannels,
            organization_id: req.organizationId,
          },
        });

        res.status(201).json({ campaign: serializeCampaign(campaign, org.timezone) });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  app.get("/api/campaigns/:id", authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const [org, campaign] = await Promise.all([
        getOrganization(req.organizationId!),
        loadCampaignForOrg(req.params.id, req.organizationId!),
      ]);

      const [contacts, stats] = await Promise.all([
        prisma.campaignContact.findMany({
          where: { campaignId: campaign.id },
          orderBy: { createdAt: "asc" },
          take: 500,
        }),
        prisma.campaignDelivery.groupBy({
          by: ["status", "channel"],
          where: { campaignId: campaign.id },
          _count: { _all: true },
        }),
      ]);

      res.json({
        campaign: serializeCampaign(campaign, org.timezone),
        contacts,
        stats: stats.map((row) => ({
          status: row.status,
          channel: row.channel,
          count: row._count._all,
        })),
      });
    } catch (err: any) {
      fail(res, err, 404);
    }
  });

  app.patch(
    "/api/campaigns/:id",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = updateCampaignSchema.parse(req.body);
        const existing = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const org = await getOrganization(req.organizationId!);

        const recurrenceRule = data.recurrenceRule ?? existing.recurrenceRule;
        ensureSupportedRecurrence(recurrenceRule);
        const customIntervalDays = resolveCustomInterval(
          recurrenceRule,
          data.customIntervalDays ?? existing.customIntervalDays
        );

        if (data.templateId !== undefined) {
          await assertTemplateBelongsToOrganization(
            req.organizationId!,
            data.templateId
          );
        }

        if (data.campaignTemplateId !== undefined) {
          await assertCampaignTemplateBelongsToOrganization(
            req.organizationId!,
            data.campaignTemplateId
          );
        }

        const deliveryChannels = data.deliveryChannels ?? existing.deliveryChannels;
        if (deliveryChannels.includes(DeliveryChannel.sms) && !org.smsEnabled) {
          throw new CampaignError("SMS is not enabled for this organization.");
        }

        assertSmsBodyValid({
          deliveryChannels,
          smsText: data.smsText ?? existing.smsText,
          bodyText: data.bodyText ?? existing.bodyText,
        });

        const startDate = data.startDate ?? existing.startDate;
        const endDate =
          data.endDate === undefined ? existing.endDate : data.endDate;
        if (endDate && endDate < startDate) {
          throw new CampaignError("End date cannot be before the start date.");
        }

        const campaign = await prisma.campaign.update({
          where: { id: existing.id },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.subject !== undefined && { subject: data.subject }),
            ...(data.bodyText !== undefined && { bodyText: data.bodyText }),
            ...(data.bodyHtml !== undefined && { bodyHtml: data.bodyHtml }),
            ...(data.smsText !== undefined && { smsText: data.smsText }),
            ...(data.replyTo !== undefined && { replyTo: data.replyTo }),
            ...(data.templateId !== undefined && { templateId: data.templateId }),
            ...(data.campaignTemplateId !== undefined && {
              campaignTemplateId: data.campaignTemplateId,
            }),
            ...(data.deliveryChannels !== undefined && { deliveryChannels }),
            ...(data.recurrenceRule !== undefined && { recurrenceRule }),
            customIntervalDays,
            ...(data.startDate !== undefined && { startDate }),
            ...(data.endDate !== undefined && { endDate }),
            ...(data.sendHour !== undefined && { sendHour: data.sendHour }),
            ...(data.sendMinute !== undefined && { sendMinute: data.sendMinute }),
          },
          include: {
            campaignTemplate: true,
            template: true,
            _count: { select: { contacts: true } },
          },
        });

        res.json({ campaign: serializeCampaign(campaign, org.timezone) });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  app.post(
    "/api/campaigns/:id/status",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { status } = z
          .object({ status: z.nativeEnum(CampaignStatus) })
          .parse(req.body);
        const existing = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const org = await getOrganization(req.organizationId!);

        if (status === CampaignStatus.ACTIVE) {
          const contactCount = await prisma.campaignContact.count({
            where: { campaignId: existing.id, optedOut: false },
          });
          if (contactCount === 0) {
            throw new CampaignError("Add at least one contact before activating.");
          }
        }

        const campaign = await prisma.campaign.update({
          where: { id: existing.id },
          data: { status },
          include: {
            campaignTemplate: true,
            template: true,
            _count: { select: { contacts: true } },
          },
        });

        res.json({ campaign: serializeCampaign(campaign, org.timezone) });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  app.delete(
    "/api/campaigns/:id",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await loadCampaignForOrg(req.params.id, req.organizationId!);
        await prisma.campaign.delete({ where: { id: existing.id } });
        res.json({ success: true });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  /* --- contacts --- */

  app.get(
    "/api/campaigns/:id/contacts",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const contacts = await prisma.campaignContact.findMany({
          where: { campaignId: campaign.id },
          orderBy: { createdAt: "asc" },
        });
        res.json({ contacts, total: contacts.length });
      } catch (err: any) {
        fail(res, err, 404);
      }
    }
  );

  app.post(
    "/api/campaigns/:id/contacts",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { contacts } = z
          .object({ contacts: z.array(contactInputSchema).min(1).max(500) })
          .parse(req.body);
        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);

        const existingCount = await prisma.campaignContact.count({
          where: { campaignId: campaign.id },
        });
        if (existingCount + contacts.length > MAX_CAMPAIGN_CONTACTS) {
          throw new CampaignError(
            `A campaign can hold at most ${MAX_CAMPAIGN_CONTACTS} contacts.`
          );
        }

        const created = await prisma.campaignContact.createMany({
          data: contacts.map((contact) => ({
            campaignId: campaign.id,
            firstName: contact.firstName,
            lastName: contact.lastName ?? null,
            email: contact.email ? contact.email.toLowerCase() : null,
            phone: contact.phone ?? null,
          })),
          skipDuplicates: true,
        });

        res.status(201).json({ added: created.count });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  app.post(
    "/api/campaigns/:id/contacts/import",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = importSchema.parse(req.body);
        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);

        const result = validateCampaignCsv(data.csv, {
          requireEmail: campaign.deliveryChannels.includes(DeliveryChannel.email),
          requirePhone: campaign.deliveryChannels.includes(DeliveryChannel.sms),
        });

        if (result.valid.length === 0) {
          return res.status(400).json({
            error: "No valid rows found in the CSV.",
            errors: result.errors,
            summary: result.summary,
          });
        }

        if (data.mode === "replace") {
          await prisma.campaignContact.deleteMany({
            where: { campaignId: campaign.id },
          });
        }

        const existingCount =
          data.mode === "replace"
            ? 0
            : await prisma.campaignContact.count({
                where: { campaignId: campaign.id },
              });
        if (existingCount + result.valid.length > MAX_CAMPAIGN_CONTACTS) {
          throw new CampaignError(
            `That would put the campaign over the ${MAX_CAMPAIGN_CONTACTS} contact limit.`
          );
        }

        const created = await prisma.campaignContact.createMany({
          data: result.valid.map((contact) => ({
            campaignId: campaign.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
          })),
          skipDuplicates: true,
        });

        posthog.capture({
          distinctId: req.userId!,
          event: "campaign_contacts_imported",
          properties: {
            campaign_id: campaign.id,
            imported: created.count,
            rejected: result.errors.length,
            organization_id: req.organizationId,
          },
        });

        res.status(201).json({
          imported: created.count,
          skippedDuplicates: result.valid.length - created.count,
          errors: result.errors,
          summary: result.summary,
        });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  app.patch(
    "/api/campaigns/:id/contacts/:contactId",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = z
          .object({ optedOut: z.boolean() })
          .strict()
          .parse(req.body);
        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const updated = await prisma.campaignContact.updateMany({
          where: { id: req.params.contactId, campaignId: campaign.id },
          data: { optedOut: data.optedOut },
        });
        if (updated.count === 0) throw new CampaignError("Contact not found.", 404);
        res.json({ success: true });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  app.delete(
    "/api/campaigns/:id/contacts/:contactId",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const deleted = await prisma.campaignContact.deleteMany({
          where: { id: req.params.contactId, campaignId: campaign.id },
        });
        if (deleted.count === 0) throw new CampaignError("Contact not found.", 404);
        res.json({ success: true });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  /* --- sending --- */

  app.post(
    "/api/campaigns/:id/test",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = z
          .object({
            email: z.string().trim().email().optional(),
            phone: z.string().trim().max(40).optional(),
            firstName: z.string().trim().max(100).default("there"),
          })
          .parse(req.body);
        if (!data.email && !data.phone) {
          throw new CampaignError("Provide an email address or a phone number.");
        }

        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const org = await getOrganization(req.organizationId!);
        const variables = {
          first_name: data.firstName,
          last_name: "",
          full_name: data.firstName,
          email: data.email || "",
          phone: data.phone || "",
          campaign_name: campaign.name,
        };

        const sent: string[] = [];

        if (data.email) {
          const senderEmail = resolveFromEmail(
            org.emailFromAddress || MOMENT_FROM_EMAIL
          );
          if (!senderEmail) {
            throw new CampaignError("No verified sender address is configured.");
          }
          const senderName =
            org.emailFromName || DEFAULT_FROM_NAME || "MomentOS";
          await EmailService.send({
            to: data.email,
            subject: `[TEST] ${interpolateTemplate(campaign.subject, variables)}`,
            text: interpolateTemplate(campaign.bodyText, variables),
            html: campaign.bodyHtml
              ? interpolateTemplate(campaign.bodyHtml, variables)
              : undefined,
            from: { name: senderName, email: senderEmail },
            replyTo: campaign.replyTo || undefined,
          });
          sent.push("email");
        }

        if (data.phone) {
          if (!org.smsEnabled) throw new CampaignError("SMS is not enabled for this organization.");
          const message = interpolateTemplate(resolveSmsBody(campaign), variables);
          try {
            assertSmsWithinLimit(message);
          } catch (smsErr: any) {
            throw new CampaignError(smsErr.message);
          }
          const result = await smsService.send({
            to: data.phone,
            message,
            senderId: org.senderId || undefined,
          });
          if (!result.success) {
            throw new CampaignError(
              result.error || "SMS provider rejected the test message."
            );
          }
          sent.push("sms");
        }

        res.json({ success: true, sent });
      } catch (err: any) {
        fail(res, err, 400);
      }
    }
  );

  app.post(
    "/api/campaigns/:id/send-now",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const org = await getOrganization(req.organizationId!);

        const contacts = await prisma.campaignContact.findMany({
          where: { campaignId: campaign.id, optedOut: false },
          orderBy: { createdAt: "asc" },
        });
        if (contacts.length === 0) {
          throw new CampaignError("This campaign has no contacts to send to.");
        }

        const orgNow = getOrgDateTime(org.timezone);
        // A manual send gets its own run key so it never collides with (or
        // suppresses) the scheduled run for the same calendar day.
        const runDate = `${orgNow.toISODate()}:manual:${Date.now()}`;

        // Responds immediately; large lists would otherwise exceed the request
        // timeout. Progress is read back from the deliveries endpoint.
        res.status(202).json({
          accepted: true,
          runDate,
          contacts: contacts.length,
        });

        runCampaign({ campaign, contacts, organization: org, runDate })
          .then(async (result) => {
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                lastRunAt: new Date(),
                runCount: { increment: 1 },
              },
            });
            console.log(
              `[campaign ${campaign.id}] manual run ${runDate}: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`
            );
          })
          .catch((error) => {
            console.error(`[campaign ${campaign.id}] manual run failed:`, error);
          });
      } catch (err: any) {
        if (!res.headersSent) {
          fail(res, err);
        }
      }
    }
  );

  app.get(
    "/api/campaigns/:id/deliveries",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        const campaign = await loadCampaignForOrg(req.params.id, req.organizationId!);
        const runDate =
          typeof req.query.runDate === "string" ? req.query.runDate : undefined;
        const limit = Math.min(Number(req.query.limit) || 200, 1000);

        const deliveries = await prisma.campaignDelivery.findMany({
          where: { campaignId: campaign.id, ...(runDate ? { runDate } : {}) },
          include: {
            contact: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

        const runs = await prisma.campaignDelivery.groupBy({
          by: ["runDate"],
          where: { campaignId: campaign.id },
          _count: { _all: true },
          orderBy: { runDate: "desc" },
          take: 20,
        });

        res.json({
          deliveries,
          runs: runs.map((run) => ({ runDate: run.runDate, count: run._count._all })),
        });
      } catch (err: any) {
        fail(res, err, 404);
      }
    }
  );

  /* --- legacy one-off send (kept for the existing savings screen) --- */

  app.post(
    "/api/campaigns/send",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = legacySendSchema.parse(req.body);
        const senderEmail = resolveFromEmail(MOMENT_FROM_EMAIL);
        const senderName =
          process.env.MOMENT_FROM_NAME || DEFAULT_FROM_NAME || "MomentOS";
        const sender = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { email: true, role: true },
        });

        if (sender?.role !== "ADMIN") {
          return res
            .status(403)
            .json({ error: "Organization admin access required" });
        }
        if (!senderEmail || !sender.email) {
          return res.status(500).json({ error: "Campaign sender is not configured" });
        }

        const results = [];
        for (const recipient of data.recipients) {
          const variables = { first_name: recipient.firstName };
          const subject = interpolateTemplate(data.subject, variables);
          const text = interpolateTemplate(data.text, variables);
          const html = data.html
            ? interpolateTemplate(data.html, variables)
            : undefined;
          const result = await EmailService.send({
            to: recipient.email,
            subject,
            text,
            html,
            from: { name: senderName, email: senderEmail },
            replyTo: sender.email,
          });
          results.push({ email: recipient.email, id: result.id });
        }

        return res.status(202).json({ sent: results.length, results });
      } catch (err: any) {
        return fail(res, err, 400);
      }
    }
  );
}
