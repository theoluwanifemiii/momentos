import { Express, NextFunction, Response } from "express";
import {
  DeliveryChannel,
  MomentCategory,
  MomentOwnerType,
  MomentRecurrence,
  MomentStatus,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import {
  authenticate,
  AuthRequest,
  getUserErrorMessage,
  prisma,
} from "../serverContext";

const PhaseOneCategoryOrder: MomentCategory[] = [
  "BIRTHDAY",
  "ANNIVERSARY",
  "GRADUATION",
  "PROMOTION_CAREER_MILESTONE",
  "SPIRITUAL_MILESTONE",
  "REMEMBRANCE_DAY",
  "CUSTOM",
];

const createMomentSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.nativeEnum(MomentCategory),
  personIds: z.array(z.string().min(1)).min(1),
  eventDate: z.coerce.date(),
  recurrenceRule: z.nativeEnum(MomentRecurrence).default("MONTHLY"),
  customIntervalDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
  randomizeMessage: z.boolean().default(false),
  deliveryChannels: z.array(z.nativeEnum(DeliveryChannel)).min(1).default(["email"]),
  templateId: z.string().min(1).nullable().optional(),
  status: z.nativeEnum(MomentStatus).default("ACTIVE"),
  scope: z.enum(["BROADCAST", "PERSONAL"]).default("BROADCAST"),
});

const updateMomentSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    category: z.nativeEnum(MomentCategory).optional(),
    personIds: z.array(z.string().min(1)).min(1).optional(),
    eventDate: z.coerce.date().optional(),
    recurrenceRule: z.nativeEnum(MomentRecurrence).optional(),
    customIntervalDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
    randomizeMessage: z.boolean().optional(),
    deliveryChannels: z.array(z.nativeEnum(DeliveryChannel)).min(1).optional(),
    templateId: z.string().min(1).nullable().optional(),
    status: z.nativeEnum(MomentStatus).optional(),
  })
  .strict();

const updateMomentStatusSchema = z.object({
  status: z.nativeEnum(MomentStatus),
});

const createPersonalMomentSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.nativeEnum(MomentCategory),
  eventDate: z.coerce.date(),
  recurrenceRule: z.nativeEnum(MomentRecurrence).default("MONTHLY"),
  customIntervalDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
  randomizeMessage: z.boolean().default(false),
  deliveryChannels: z.array(z.nativeEnum(DeliveryChannel)).min(1).default(["email"]),
  templateId: z.string().min(1).nullable().optional(),
  status: z.nativeEnum(MomentStatus).default("ACTIVE"),
});

const serializeMoment = (moment: any) => {
  const recipientCount = (moment.recipients || []).length;
  const scope =
    moment.ownerType === "USER" && recipientCount === 1 ? "PERSONAL" : "BROADCAST";

  return {
    id: moment.id,
    title: moment.title,
    category: moment.category,
    eventDate: moment.eventDate,
    recurrenceRule: moment.recurrenceRule,
    customIntervalDays: moment.customIntervalDays ?? null,
    randomizeMessage: Boolean(moment.randomizeMessage),
    deliveryChannels: moment.deliveryChannels,
    status: moment.status,
    ownerType: moment.ownerType,
    scope,
    ownerOrganizationId: moment.ownerOrganizationId,
    ownerUserId: moment.ownerUserId,
    template: moment.template
      ? {
          id: moment.template.id,
          name: moment.template.name,
          subject: moment.template.subject,
          channels: moment.template.channels,
          type: moment.template.type,
        }
      : null,
    recipients: (moment.recipients || []).map((recipient: any) => ({
      id: recipient.person.id,
      fullName: recipient.person.fullName,
      firstName: recipient.person.firstName,
      email: recipient.person.email,
      phone: recipient.person.phone,
      optedOut: recipient.person.optedOut,
    })),
    createdAt: moment.createdAt,
    updatedAt: moment.updatedAt,
  };
};

const ensureSupportedRecurrence = (recurrenceRule: MomentRecurrence) => {
  const allowed = new Set<MomentRecurrence>([
    "ONE_TIME",
    "ANNUAL",
    "DAILY",
    "MONTHLY",
    "QUARTERLY",
    "BI_YEARLY",
    "CUSTOM",
  ]);
  if (!allowed.has(recurrenceRule)) {
    throw new Error("Invalid recurrence rule.");
  }
};

const resolveCustomInterval = (
  recurrenceRule: MomentRecurrence,
  customIntervalDays?: number | null
) => {
  if (recurrenceRule !== "CUSTOM") return null;
  if (!customIntervalDays || customIntervalDays < 1) {
    throw new Error("Custom recurrence requires a valid interval (in days).");
  }
  return customIntervalDays;
};

const normalizePersonIds = (ids: string[]) => Array.from(new Set(ids));

const assertPeopleBelongToOrganization = async (
  organizationId: string,
  personIds: string[]
) => {
  const uniqueIds = normalizePersonIds(personIds);
  const people = await prisma.person.findMany({
    where: {
      organizationId,
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  if (people.length !== uniqueIds.length) {
    throw new Error("One or more selected people are invalid for this organization.");
  }

  return uniqueIds;
};

const assertTemplateBelongsToOrganization = async (
  organizationId: string,
  templateId?: string | null
) => {
  if (templateId === undefined || templateId === null) {
    return;
  }

  const assignment = await prisma.organizationTemplate.findFirst({
    where: {
      organizationId,
      templateId,
      isActive: true,
    },
    select: { id: true },
  });

  if (!assignment) {
    throw new Error("Template not available for this organization.");
  }
};

const requireOrgAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tokenRole = req.userRole;
    if (tokenRole === "ADMIN") {
      return next();
    }

    const user = await prisma.user.findFirst({
      where: {
        id: req.userId,
        organizationId: req.organizationId,
      },
      select: { role: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (user.role !== UserRole.ADMIN) {
      return res.status(403).json({
        error: "Admin role is required to create or edit moments.",
      });
    }

    return next();
  } catch (err: any) {
    return res.status(500).json({ error: getUserErrorMessage(err) });
  }
};

export function registerMomentsRoutes(app: Express) {
  app.get(
    "/api/moments/categories",
    authenticate,
    async (_req: AuthRequest, res: Response) => {
      const labels: Record<MomentCategory, string> = {
        BIRTHDAY: "Birthdays",
        ANNIVERSARY: "Anniversaries",
        GRADUATION: "Graduation",
        PROMOTION_CAREER_MILESTONE: "Promotion / Career Milestone",
        SPIRITUAL_MILESTONE: "Spiritual Milestone",
        REMEMBRANCE_DAY: "Remembrance Day",
        CUSTOM: "Custom Moment",
      };

      res.json({
        categories: PhaseOneCategoryOrder.map((key) => ({
          key,
          label: labels[key],
        })),
      });
    }
  );

  app.get("/api/moments", authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const statusParam = req.query.status;
      const categoryParam = req.query.category;
      const personIdParam =
        typeof req.query.personId === "string" ? req.query.personId : undefined;
      const scopeParamRaw =
        typeof req.query.scope === "string" ? req.query.scope : "BROADCAST";
      const scopeParam = z
        .enum(["BROADCAST", "PERSONAL", "ALL"])
        .parse(scopeParamRaw);

      const where: any = {
        ownerOrganizationId: req.organizationId!,
      };

      if (scopeParam === "BROADCAST") {
        where.ownerType = "ORGANIZATION";
      } else if (scopeParam === "PERSONAL") {
        where.ownerType = "USER";
      }

      if (statusParam) {
        const parsedStatus = z.nativeEnum(MomentStatus).parse(statusParam);
        where.status = parsedStatus;
      }

      if (categoryParam) {
        const parsedCategory = z.nativeEnum(MomentCategory).parse(categoryParam);
        where.category = parsedCategory;
      }

      if (personIdParam) {
        where.recipients = {
          some: { personId: personIdParam },
        };
      }

      const moments = await prisma.moment.findMany({
        where,
        include: {
          template: true,
          recipients: {
            include: {
              person: true,
            },
          },
        },
        orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
      });

      res.json({ moments: moments.map(serializeMoment) });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  });

  app.get(
    "/api/moments/personal/:personId",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        const [personId] = await assertPeopleBelongToOrganization(req.organizationId!, [
          req.params.personId,
        ]);

        const moments = await prisma.moment.findMany({
          where: {
            ownerOrganizationId: req.organizationId!,
            ownerType: "USER",
            recipients: {
              some: { personId },
            },
          },
          include: {
            template: true,
            recipients: {
              include: {
                person: true,
              },
            },
          },
          orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
        });

        res.json({ moments: moments.map(serializeMoment) });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.post(
    "/api/moments/personal/:personId",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = createPersonalMomentSchema.parse(req.body);
        ensureSupportedRecurrence(data.recurrenceRule);
        const customIntervalDays = resolveCustomInterval(
          data.recurrenceRule,
          data.customIntervalDays
        );

        const [personId] = await assertPeopleBelongToOrganization(req.organizationId!, [
          req.params.personId,
        ]);
        await assertTemplateBelongsToOrganization(req.organizationId!, data.templateId);

        const moment = await prisma.moment.create({
          data: {
            title: data.title.trim(),
            category: data.category,
            eventDate: data.eventDate,
            recurrenceRule: data.recurrenceRule,
            customIntervalDays,
            randomizeMessage: data.randomizeMessage,
            deliveryChannels: data.deliveryChannels,
            templateId: data.templateId ?? null,
            ownerType: "USER",
            ownerOrganizationId: req.organizationId!,
            ownerUserId: req.userId!,
            status: data.status,
            recipients: {
              create: [{ personId }],
            },
          },
          include: {
            template: true,
            recipients: {
              include: {
                person: true,
              },
            },
          },
        });

        res.status(201).json({ moment: serializeMoment(moment) });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.get(
    "/api/moments/:id",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        const moment = await prisma.moment.findFirst({
          where: {
            id: req.params.id,
            ownerOrganizationId: req.organizationId!,
          },
          include: {
            template: true,
            recipients: {
              include: {
                person: true,
              },
            },
          },
        });

        if (!moment) {
          return res.status(404).json({ error: "Moment not found" });
        }

        res.json({ moment: serializeMoment(moment) });
      } catch (err: any) {
        res.status(500).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.post(
    "/api/moments",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = createMomentSchema.parse(req.body);
        ensureSupportedRecurrence(data.recurrenceRule);
        const customIntervalDays = resolveCustomInterval(
          data.recurrenceRule,
          data.customIntervalDays
        );

        const personIds = await assertPeopleBelongToOrganization(
          req.organizationId!,
          data.personIds
        );
        if (data.scope === "PERSONAL" && personIds.length !== 1) {
          return res.status(400).json({
            error: "Personal moments must target exactly one person.",
          });
        }
        await assertTemplateBelongsToOrganization(
          req.organizationId!,
          data.templateId
        );

        const ownerType: MomentOwnerType =
          data.scope === "PERSONAL" ? "USER" : "ORGANIZATION";

        const moment = await prisma.moment.create({
          data: {
            title: data.title.trim(),
            category: data.category,
            eventDate: data.eventDate,
            recurrenceRule: data.recurrenceRule,
            customIntervalDays,
            randomizeMessage: data.randomizeMessage,
            deliveryChannels: data.deliveryChannels,
            templateId: data.templateId ?? null,
            ownerType,
            ownerOrganizationId: req.organizationId!,
            ownerUserId: req.userId!,
            status: data.status,
            recipients: {
              create: personIds.map((personId) => ({ personId })),
            },
          },
          include: {
            template: true,
            recipients: {
              include: {
                person: true,
              },
            },
          },
        });

        res.status(201).json({ moment: serializeMoment(moment) });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.put(
    "/api/moments/:id",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = updateMomentSchema.parse(req.body);
        if (data.recurrenceRule) {
          ensureSupportedRecurrence(data.recurrenceRule);
        }

        const existing = await prisma.moment.findFirst({
          where: {
            id: req.params.id,
            ownerOrganizationId: req.organizationId!,
          },
          select: {
            id: true,
            ownerType: true,
            recurrenceRule: true,
            customIntervalDays: true,
          },
        });

        if (!existing) {
          return res.status(404).json({ error: "Moment not found" });
        }

        let nextPersonIds: string[] | null = null;
        if (data.personIds) {
          nextPersonIds = await assertPeopleBelongToOrganization(
            req.organizationId!,
            data.personIds
          );
          if (existing.ownerType === "USER" && nextPersonIds.length !== 1) {
            return res.status(400).json({
              error: "Personal moments must target exactly one person.",
            });
          }
        }

        if (data.templateId !== undefined) {
          await assertTemplateBelongsToOrganization(
            req.organizationId!,
            data.templateId
          );
        }

        const nextRecurrenceRule = data.recurrenceRule ?? existing.recurrenceRule;
        const nextCustomInterval =
          data.customIntervalDays !== undefined
            ? data.customIntervalDays
            : existing.customIntervalDays;
        const normalizedCustomInterval = resolveCustomInterval(
          nextRecurrenceRule,
          nextCustomInterval
        );

        await prisma.$transaction(async (tx) => {
          await tx.moment.update({
            where: { id: existing.id },
            data: {
              ...(data.title !== undefined ? { title: data.title.trim() } : {}),
              ...(data.category !== undefined ? { category: data.category } : {}),
              ...(data.eventDate !== undefined ? { eventDate: data.eventDate } : {}),
              ...(data.recurrenceRule !== undefined
                ? { recurrenceRule: data.recurrenceRule }
                : {}),
              ...(data.recurrenceRule !== undefined ||
              data.customIntervalDays !== undefined
                ? { customIntervalDays: normalizedCustomInterval }
                : {}),
              ...(data.randomizeMessage !== undefined
                ? { randomizeMessage: data.randomizeMessage }
                : {}),
              ...(data.deliveryChannels !== undefined
                ? { deliveryChannels: data.deliveryChannels }
                : {}),
              ...(data.templateId !== undefined ? { templateId: data.templateId } : {}),
              ...(data.status !== undefined ? { status: data.status } : {}),
            },
          });

          if (nextPersonIds) {
            await tx.momentRecipient.deleteMany({
              where: { momentId: existing.id },
            });

            await tx.momentRecipient.createMany({
              data: nextPersonIds.map((personId) => ({
                momentId: existing.id,
                personId,
              })),
              skipDuplicates: true,
            });
          }
        });

        const moment = await prisma.moment.findUnique({
          where: { id: existing.id },
          include: {
            template: true,
            recipients: {
              include: { person: true },
            },
          },
        });

        if (!moment) {
          return res.status(404).json({ error: "Moment not found" });
        }

        res.json({ moment: serializeMoment(moment) });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.patch(
    "/api/moments/:id/status",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = updateMomentStatusSchema.parse(req.body);

        const existing = await prisma.moment.findFirst({
          where: {
            id: req.params.id,
            ownerOrganizationId: req.organizationId!,
          },
          select: { id: true },
        });

        if (!existing) {
          return res.status(404).json({ error: "Moment not found" });
        }

        const moment = await prisma.moment.update({
          where: { id: existing.id },
          data: { status: data.status },
          include: {
            template: true,
            recipients: {
              include: { person: true },
            },
          },
        });

        res.json({ moment: serializeMoment(moment) });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.delete(
    "/api/moments/:id",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await prisma.moment.findFirst({
          where: {
            id: req.params.id,
            ownerOrganizationId: req.organizationId!,
          },
          select: { id: true },
        });

        if (!existing) {
          return res.status(404).json({ error: "Moment not found" });
        }

        await prisma.moment.delete({ where: { id: existing.id } });

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: getUserErrorMessage(err) });
      }
    }
  );
}
