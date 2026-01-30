import { Express, Request, Response } from "express";
import { z } from "zod";
import { Prisma, DeliveryStatus } from "@prisma/client";
import { EmailService } from "../services/emailService";
import { ADMIN_INVITE_FROM_EMAIL, ADMIN_INVITE_FROM_NAME, ADMIN_APP_URL, DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME, WAITLIST_REPLY_TO, adminCache, clearAdminCache, createAdminInvite, getNextBirthdayOccurrence, getOrgDateTime, getUserErrorMessage, interpolateTemplate, logAdminAction, prisma, requireSuperAdmin, authenticateAdmin, AdminAuthRequest, ADMIN_EMAIL_DOMAIN } from "../serverContext";

export function registerInternalAdminRoutes(app: Express) {
// INTERNAL ADMIN ROUTES (MomentOS staff only)
// ============================================================================

app.use("/api/internal/admin", (req: Request, _res: Response, next) => {
  if (req.method !== "GET") {
    clearAdminCache();
  }
  next();
});

app.get(
  "/api/internal/admin/overview",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const [orgCount, userCount, peopleCount] = await Promise.all([
        prisma.organization.count(),
        prisma.user.count(),
        prisma.person.count(),
      ]);

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);

      const [sentToday, sentWeek, failedToday] = await Promise.all([
        prisma.deliveryLog.count({
          where: {
            createdAt: { gte: todayStart },
            status: { in: ["SENT", "DELIVERED"] },
          },
        }),
        prisma.deliveryLog.count({
          where: {
            createdAt: { gte: weekStart },
            status: { in: ["SENT", "DELIVERED"] },
          },
        }),
        prisma.deliveryLog.count({
          where: { createdAt: { gte: todayStart }, status: "FAILED" },
        }),
      ]);

      const peopleWithOrg = await prisma.person.findMany({
        where: { optedOut: false },
        select: {
          birthday: true,
          organization: { select: { timezone: true } },
        },
      });

      const upcomingBirthdays = peopleWithOrg.filter((person) => {
        const orgNow = getOrgDateTime(person.organization?.timezone);
        const windowEnd = orgNow.plus({ days: 7 }).endOf("day");
        const nextOccurrence = getNextBirthdayOccurrence(
          person.birthday,
          orgNow.startOf("day")
        );
        return nextOccurrence <= windowEnd;
      }).length;

      res.json({
        stats: {
          totalOrganizations: orgCount,
          totalUsers: userCount,
          totalPeople: peopleCount,
          emailsSentToday: sentToday,
          emailsSentWeek: sentWeek,
          failedDeliveriesToday: failedToday,
          upcomingBirthdays,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Overview failed") });
    }
  }
);

app.get(
  "/api/internal/admin/admins",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const admins = await prisma.adminUser.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json({
        admins: admins.map((admin) => ({
          id: admin.id,
          email: admin.email,
          role: admin.role,
          isActive: admin.isActive,
          lastLoginAt: admin.lastLoginAt,
          createdAt: admin.createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Admin list failed") });
    }
  }
);

app.post(
  "/api/internal/admin/invites",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        role: z.enum(["SUPER_ADMIN", "SUPPORT"]).default("SUPPORT"),
      });
      const data = schema.parse(req.body);
      const normalizedEmail = data.email.toLowerCase();

      if (!normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) {
        return res.status(403).json({ error: "Admin email domain not allowed" });
      }

      const existing = await prisma.adminUser.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing) {
        return res.status(409).json({ error: "Admin already exists" });
      }

      const { invite, token } = await createAdminInvite({
        email: normalizedEmail,
        role: data.role,
        createdBy: req.adminId!,
      });

      const inviteLink = `${ADMIN_APP_URL}/admin/register?email=${encodeURIComponent(
        normalizedEmail
      )}&token=${encodeURIComponent(token)}`;

      await EmailService.send({
        to: normalizedEmail,
        subject: "MomentOS Admin Invite",
        text: `You have been invited to MomentOS admin. Click this link to create your account: ${inviteLink}\n\nInvite token (if prompted): ${token}`,
        html: `<p>You have been invited to MomentOS admin.</p><p><a href="${inviteLink}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f172a;color:#ffffff;text-decoration:none;">Create admin account</a></p><p>If you are prompted for a token, use:</p><p><strong>${token}</strong></p>`,
        from: {
          name: ADMIN_INVITE_FROM_NAME,
          email: ADMIN_INVITE_FROM_EMAIL,
        },
        replyTo: WAITLIST_REPLY_TO,
      });

      await logAdminAction({
        adminId: req.adminId!,
        action: "ADMIN_INVITE_SENT",
        targetType: "admin_invite",
        targetId: invite.id,
        metadata: { email: invite.email, role: invite.role },
      });

      res.json({
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err, "Invite failed") });
    }
  }
);

app.get(
  "/api/internal/admin/orgs",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const { page = "1", limit = "25", status, search } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit as string, 10) || 25);
      const skip = (pageNum - 1) * limitNum;

      const where: Prisma.OrganizationWhereInput = {};
      if (status === "suspended") {
        where.isSuspended = true;
      }
      if (status === "active") {
        where.isSuspended = false;
      }
      if (search) {
        where.name = { contains: String(search), mode: "insensitive" };
      }

      const [orgs, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { users: true, people: true, templateAssignments: true } },
          },
        }),
        prisma.organization.count({ where }),
      ]);

      res.json({
        organizations: orgs.map((org) => ({
          id: org.id,
          name: org.name,
          plan: org.plan,
          timezone: org.timezone,
          emailFromAddress: org.emailFromAddress,
          isSuspended: org.isSuspended,
          createdAt: org.createdAt,
          counts: {
            users: org._count.users,
            people: org._count.people,
            templates: org._count.templateAssignments,
          },
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Org list failed") });
    }
  }
);

app.get(
  "/api/internal/admin/orgs/:id",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.id },
        include: {
          _count: { select: { users: true, people: true, templateAssignments: true } },
        },
      });

      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json({
        organization: {
          id: org.id,
          name: org.name,
          plan: org.plan,
          timezone: org.timezone,
          emailFromName: org.emailFromName,
          emailFromAddress: org.emailFromAddress,
          isSuspended: org.isSuspended,
          suspendedAt: org.suspendedAt,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
          counts: {
            users: org._count.users,
            people: org._count.people,
            templates: org._count.templateAssignments,
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Org fetch failed") });
    }
  }
);

app.patch(
  "/api/internal/admin/orgs/:id/suspend",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const org = await prisma.organization.update({
        where: { id: req.params.id },
        data: { isSuspended: true, suspendedAt: new Date() },
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: "ORG_SUSPENDED",
        targetType: "organization",
        targetId: org.id,
      });
      res.json({ organization: org });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Suspend failed") });
    }
  }
);

app.patch(
  "/api/internal/admin/orgs/:id/reactivate",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const org = await prisma.organization.update({
        where: { id: req.params.id },
        data: { isSuspended: false, suspendedAt: null },
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: "ORG_REACTIVATED",
        targetType: "organization",
        targetId: org.id,
      });
      res.json({ organization: org });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Reactivate failed") });
    }
  }
);

app.delete(
  "/api/internal/admin/orgs/:id",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const org = await prisma.organization.delete({
        where: { id: req.params.id },
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: "ORG_DELETED",
        targetType: "organization",
        targetId: org.id,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Delete failed") });
    }
  }
);

app.get(
  "/api/internal/admin/orgs/:id/users",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        where: { organizationId: req.params.id },
        orderBy: { createdAt: "desc" },
      });
      res.json({
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
          lastLoginAt: user.lastLoginAt,
          isDisabled: user.isDisabled,
          createdAt: user.createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "User list failed") });
    }
  }
);

app.patch(
  "/api/internal/admin/orgs/:orgId/users/:id/disable",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id, organizationId: req.params.orgId },
        data: { isDisabled: true },
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: "USER_DISABLED",
        targetType: "user",
        targetId: user.id,
      });
      res.json({ user });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Disable failed") });
    }
  }
);

app.patch(
  "/api/internal/admin/orgs/:orgId/users/:id/enable",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id, organizationId: req.params.orgId },
        data: { isDisabled: false },
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: "USER_ENABLED",
        targetType: "user",
        targetId: user.id,
      });
      res.json({ user });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Enable failed") });
    }
  }
);

app.patch(
  "/api/internal/admin/orgs/:orgId/users/:id/verify",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id, organizationId: req.params.orgId },
        data: { emailVerifiedAt: new Date() },
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: "USER_VERIFIED",
        targetType: "user",
        targetId: user.id,
      });
      res.json({ user });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Verify failed") });
    }
  }
);

app.get(
  "/api/internal/admin/people",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const { page = "1", limit = "50", email, orgId } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit as string, 10) || 50);
      const skip = (pageNum - 1) * limitNum;

      const where: Prisma.PersonWhereInput = {};
      if (orgId) where.organizationId = String(orgId);
      if (email) where.email = { contains: String(email), mode: "insensitive" };

      const [people, total] = await Promise.all([
        prisma.person.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: "desc" },
          include: { organization: { select: { name: true } } },
        }),
        prisma.person.count({ where }),
      ]);

      res.json({
        people: people.map((person) => ({
          id: person.id,
          fullName: person.fullName,
          email: person.email,
          phone: person.phone,
          birthday: person.birthday,
          optedOut: person.optedOut,
          organization: person.organization.name,
          createdAt: person.createdAt,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "People fetch failed") });
    }
  }
);

app.post(
  "/api/internal/admin/people/:id/send-birthday",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const person = await prisma.person.findUnique({
        where: { id: req.params.id },
      });
      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }
      if (person.optedOut) {
        return res.status(400).json({ error: "Person has opted out" });
      }

      const org = await prisma.organization.findUnique({
        where: { id: person.organizationId },
      });
      const templateAssignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: person.organizationId,
          isDefault: true,
          isActive: true,
        },
        include: { template: true },
      });
      if (!templateAssignment) {
        return res.status(400).json({ error: "No default template found" });
      }
      const template = templateAssignment.template;

      const variables = {
        first_name: person.firstName || person.fullName.split(" ")[0],
        full_name: person.fullName,
        organization_name: org?.name || "Your Organization",
        date: new Date().toLocaleDateString(),
      };
      const subject = interpolateTemplate(template.subject, variables);
      const content = interpolateTemplate(template.content, variables);
      const fromEmail = org?.emailFromAddress || DEFAULT_FROM_EMAIL;
      if (!fromEmail) {
        return res.status(400).json({ error: "Sender email not configured" });
      }

      const result = await EmailService.send({
        to: person.email,
        subject,
        html: template.type === "HTML" ? content : undefined,
        text: template.type === "PLAIN_TEXT" ? content : undefined,
        from: {
          name: org?.emailFromName || org?.name || DEFAULT_FROM_NAME || "",
          email: fromEmail,
        },
      });

      await prisma.deliveryLog.create({
        data: {
          personId: person.id,
          templateId: template.id,
          organizationId: person.organizationId,
          status: "SENT",
          scheduledFor: new Date(),
          sentAt: new Date(),
          externalId: result.id,
        },
      });

      await logAdminAction({
        adminId: req.adminId!,
        action: "BIRTHDAY_SENT_MANUAL",
        targetType: "person",
        targetId: person.id,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Send failed") });
    }
  }
);

app.get(
  "/api/internal/admin/templates",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const { orgId } = req.query;
      const where: Prisma.OrganizationTemplateWhereInput = {};
      if (orgId) where.organizationId = String(orgId);

      const assignments = await prisma.organizationTemplate.findMany({
        where,
        orderBy: { assignedAt: "desc" },
        include: {
          template: true,
          organization: { select: { name: true } },
        },
      });

      res.json({
        templates: assignments.map((assignment) => ({
          id: assignment.id,
          templateId: assignment.templateId,
          name: assignment.template.name,
          type: assignment.template.type,
          isDefault: assignment.isDefault,
          isActive: assignment.isActive,
          updatedAt: assignment.template.updatedAt,
          organization: assignment.organization.name,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Template fetch failed") });
    }
  }
);

app.post(
  "/api/internal/admin/templates",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(["PLAIN_TEXT", "HTML", "CUSTOM_IMAGE"]),
        subject: z.string().min(1),
        content: z.string().min(1),
        imageUrl: z.string().optional(),
        assignAll: z.boolean().optional(),
        organizationId: z.string().optional(),
      });
      const data = schema.parse(req.body);

      const template = await prisma.template.create({
        data: {
          name: data.name,
          type: data.type,
          subject: data.subject,
          content: data.content,
          imageUrl: data.imageUrl,
          isActive: true,
          isSystem: false,
        },
      });

      let assignedCount = 0;
      if (data.assignAll) {
        const orgs = await prisma.organization.findMany({
          select: { id: true },
        });
        if (orgs.length > 0) {
          await prisma.organizationTemplate.createMany({
            data: orgs.map((org) => ({
              organizationId: org.id,
              templateId: template.id,
              isDefault: false,
              isActive: true,
            })),
            skipDuplicates: true,
          });
          assignedCount = orgs.length;
        }
      } else if (data.organizationId) {
        await prisma.organizationTemplate.create({
          data: {
            organizationId: data.organizationId,
            templateId: template.id,
            isDefault: false,
            isActive: true,
          },
        });
        assignedCount = 1;
      }

      await logAdminAction({
        adminId: req.adminId!,
        action: "TEMPLATE_CREATED",
        targetType: "template",
        targetId: template.id,
        metadata: {
          assignAll: Boolean(data.assignAll),
          organizationId: data.organizationId || null,
        },
      });

      res.json({ template, assignedCount });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err, "Template create failed") });
    }
  }
);

app.patch(
  "/api/internal/admin/templates/:id/disable",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const assignment = await prisma.organizationTemplate.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: "TEMPLATE_DISABLED",
        targetType: "organization_template",
        targetId: assignment.id,
      });
      res.json({ assignment });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Disable failed") });
    }
  }
);

app.get(
  "/api/internal/admin/delivery-logs",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const { page = "1", limit = "50", status, dateFrom, dateTo, orgId } =
        req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(200, parseInt(limit as string, 10) || 50);
      const skip = (pageNum - 1) * limitNum;

      const where: Prisma.DeliveryLogWhereInput = {};
      if (status) where.status = String(status) as DeliveryStatus;
      if (orgId) where.organizationId = String(orgId);
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = new Date(String(dateFrom));
        }
        if (dateTo) {
          const endDate = new Date(String(dateTo));
          endDate.setHours(23, 59, 59, 999);
          where.createdAt.lte = endDate;
        }
      }

      const [logs, total] = await Promise.all([
        prisma.deliveryLog.findMany({
          where,
          include: {
            person: true,
            template: true,
            organization: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.deliveryLog.count({ where }),
      ]);

      res.json({
        logs: logs.map((log) => ({
          id: log.id,
          person: {
            name: log.person.fullName,
            email: log.person.email,
          },
          template: {
            name: log.template.name,
            type: log.template.type,
          },
          organization: log.organization.name,
          status: log.status,
          scheduledFor: log.scheduledFor,
          sentAt: log.sentAt,
          deliveredAt: log.deliveredAt,
          errorMessage: log.errorMessage,
          retryCount: log.retryCount,
          externalId: log.externalId,
          createdAt: log.createdAt,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Logs fetch failed") });
    }
  }
);

app.post(
  "/api/internal/admin/delivery-logs/:id/retry",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const log = await prisma.deliveryLog.findUnique({
        where: { id: req.params.id },
      });

      if (!log) {
        return res.status(404).json({ error: "Delivery log not found" });
      }

      if (log.status !== "FAILED") {
        return res
          .status(400)
          .json({ error: "Only failed deliveries can be retried" });
      }

      await prisma.deliveryLog.update({
        where: { id: log.id },
        data: {
          status: "QUEUED",
          retryCount: log.retryCount + 1,
          errorMessage: null,
        },
      });

      await logAdminAction({
        adminId: req.adminId!,
        action: "DELIVERY_RETRY_QUEUED",
        targetType: "delivery_log",
        targetId: log.id,
      });

      res.json({ success: true, message: "Delivery queued for retry" });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Retry failed") });
    }
  }
);

app.get(
  "/api/internal/admin/audit-logs",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    try {
      const { page = "1", limit = "50", adminId } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(200, parseInt(limit as string, 10) || 50);
      const skip = (pageNum - 1) * limitNum;
      const where: Prisma.AdminAuditLogWhereInput = {};
      if (adminId) where.adminId = String(adminId);

      const [logs, total] = await Promise.all([
        prisma.adminAuditLog.findMany({
          where,
          include: { admin: { select: { email: true, role: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.adminAuditLog.count({ where }),
      ]);

      res.json({
        logs: logs.map((log) => ({
          id: log.id,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          admin: log.admin,
          metadata: log.metadata,
          createdAt: log.createdAt,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err, "Audit fetch failed") });
    }
  }
);

// ============================================================================
}
