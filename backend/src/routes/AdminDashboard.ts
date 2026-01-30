import { Express, Response } from "express";
import { DeliveryStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate, AuthRequest, getNextBirthdayOccurrence, getOrgDateTime, getUserErrorMessage, prisma } from "../serverContext";
import { smsService } from "../services/smsService";

export function registerAdminDashboardRoutes(app: Express) {
// ADMIN DASHBOARD ROUTES
// ============================================================================

// Get dashboard overview stats
app.get(
  "/api/admin/overview",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const orgId = req.organizationId!;

      // Get counts
      const peopleCount = await prisma.person.count({
        where: { organizationId: orgId, optedOut: false },
      });

      const templateCount = await prisma.organizationTemplate.count({
        where: { organizationId: orgId },
      });

      const activeTemplateCount = await prisma.organizationTemplate.count({
        where: { organizationId: orgId, isActive: true },
      });

      // Get today's deliveries
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayDeliveries = await prisma.deliveryLog.count({
        where: {
          organizationId: orgId,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      const todaySuccessful = await prisma.deliveryLog.count({
        where: {
          organizationId: orgId,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
          status: { in: ["SENT", "DELIVERED"] },
        },
      });

      const todayFailed = await prisma.deliveryLog.count({
        where: {
          organizationId: orgId,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
          status: "FAILED",
        },
      });

      const totalSuccessful = await prisma.deliveryLog.count({
        where: {
          organizationId: orgId,
          status: { in: ["SENT", "DELIVERED"] },
        },
      });

      const totalDeliveries = await prisma.deliveryLog.count({
        where: { organizationId: orgId },
      });

      // Get upcoming birthdays (next 7 days)
      const people = await prisma.person.findMany({
        where: {
          organizationId: orgId,
          optedOut: false,
        },
      });

      const orgNow = getOrgDateTime(
        (
          await prisma.organization.findUnique({
            where: { id: orgId },
            select: { timezone: true },
          })
        )?.timezone
      );
      const orgToday = orgNow.startOf("day");
      const windowEnd = orgToday.plus({ days: 7 }).endOf("day");

      const upcomingBirthdays = people.filter((person) => {
        const nextOccurrence = getNextBirthdayOccurrence(
          person.birthday,
          orgToday
        );
        return nextOccurrence <= windowEnd;
      }).length;

      // Get recent activity (last 10 deliveries)
      const recentActivity = await prisma.deliveryLog.findMany({
        where: { organizationId: orgId },
        include: {
          person: true,
          template: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      res.json({
        stats: {
          totalPeople: peopleCount,
          totalTemplates: templateCount,
          activeTemplates: activeTemplateCount,
          upcomingBirthdays,
          totalDeliveries,
          totalSuccessfulDeliveries: totalSuccessful,
          todayDeliveries: {
            total: todayDeliveries,
            successful: todaySuccessful,
            failed: todayFailed,
          },
        },
        recentActivity: recentActivity.map((log) => ({
          id: log.id,
          personName: log.person.fullName,
          personEmail: log.person.email,
          templateName: log.template.name,
          status: log.status,
          scheduledFor: log.scheduledFor,
          sentAt: log.sentAt,
          errorMessage: log.errorMessage,
          createdAt: log.createdAt,
        })),
      });
    } catch (err: any) {
      console.error("Overview error:", err);
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Test SMS delivery (admin/org scope)
app.post(
  "/api/admin/test-sms",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        phone: z.string().min(1),
        message: z.string().optional(),
      });
      const data = schema.parse(req.body);

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      const result = await smsService.send({
        to: data.phone,
        message: data.message || "Test message from MomentOS",
        senderId: org?.senderId || "MomentOS",
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

app.get(
  "/api/admin/sms-balance",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const balance = await smsService.getBalance();
      res.json({ balance });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Get delivery logs with pagination and filters
app.get(
  "/api/admin/delivery-logs",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { page = "1", limit = "50", status, dateFrom, dateTo } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        organizationId: req.organizationId!,
      };

      if (status) {
        where.status = status;
      }

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = new Date(dateFrom as string);
        }
        if (dateTo) {
          const endDate = new Date(dateTo as string);
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
      console.error("Delivery logs error:", err);
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Export delivery logs as CSV
app.get(
  "/api/admin/delivery-logs/export",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { status, dateFrom, dateTo } = req.query;

      const where: any = {
        organizationId: req.organizationId!,
      };

      if (status) {
        where.status = status;
      }

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = new Date(dateFrom as string);
        }
        if (dateTo) {
          const endDate = new Date(dateTo as string);
          endDate.setHours(23, 59, 59, 999);
          where.createdAt.lte = endDate;
        }
      }

      const logs = await prisma.deliveryLog.findMany({
        where,
        include: {
          person: true,
          template: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const escape = (value: string | null | undefined) => {
        const safe = value ?? "";
        return `"${safe.replace(/"/g, '""')}"`;
      };

      const header = [
        "person_name",
        "person_email",
        "template_name",
        "template_type",
        "status",
        "scheduled_for",
        "sent_at",
        "delivered_at",
        "error_message",
        "retry_count",
        "external_id",
        "created_at",
      ];

      const rows = logs.map((log) => [
        escape(log.person.fullName),
        escape(log.person.email),
        escape(log.template.name),
        escape(log.template.type),
        escape(log.status),
        escape(log.scheduledFor?.toISOString() || ""),
        escape(log.sentAt?.toISOString() || ""),
        escape(log.deliveredAt?.toISOString() || ""),
        escape(log.errorMessage || ""),
        escape(String(log.retryCount ?? 0)),
        escape(log.externalId || ""),
        escape(log.createdAt.toISOString()),
      ]);

      const csv = [header.join(","), ...rows.map((row) => row.join(","))].join(
        "\n"
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=delivery-logs.csv"
      );
      res.send(csv);
    } catch (err: any) {
      console.error("Delivery logs export error:", err);
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Get delivery stats by date range
app.get(
  "/api/admin/delivery-stats",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query;

      const where: any = {
        organizationId: req.organizationId!,
      };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = new Date(dateFrom as string);
        }
        if (dateTo) {
          const endDate = new Date(dateTo as string);
          endDate.setHours(23, 59, 59, 999);
          where.createdAt.lte = endDate;
        }
      } else {
        // Default to last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        where.createdAt = { gte: thirtyDaysAgo };
      }

      const logs = await prisma.deliveryLog.findMany({
        where,
        select: {
          status: true,
          createdAt: true,
        },
      });

      // Count by status
      const statusCounts = logs.reduce((acc: any, log) => {
        acc[log.status] = (acc[log.status] || 0) + 1;
        return acc;
      }, {});

      // Group by date
      const byDate: any = {};
      logs.forEach((log) => {
        const date = log.createdAt.toISOString().split("T")[0];
        if (!byDate[date]) {
          byDate[date] = { total: 0, successful: 0, failed: 0 };
        }
        byDate[date].total++;
        if (["SENT", "DELIVERED"].includes(log.status)) {
          byDate[date].successful++;
        } else if (log.status === "FAILED") {
          byDate[date].failed++;
        }
      });

      res.json({
        total: logs.length,
        byStatus: statusCounts,
        byDate: Object.entries(byDate).map(([date, stats]) => ({
          date,
          ...(stats as Record<string, number>),
        })),
      });
    } catch (err: any) {
      console.error("Delivery stats error:", err);
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Retry failed delivery
app.post(
  "/api/admin/delivery-logs/:id/retry",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const log = await prisma.deliveryLog.findFirst({
        where: {
          id,
          organizationId: req.organizationId!,
        },
        include: {
          person: true,
          template: true,
        },
      });

      if (!log) {
        return res.status(404).json({ error: "Delivery log not found" });
      }

      if (log.status !== "FAILED") {
        return res
          .status(400)
          .json({ error: "Only failed deliveries can be retried" });
      }

      // Update status to queued for retry
      await prisma.deliveryLog.update({
        where: { id },
        data: {
          status: "QUEUED",
          retryCount: log.retryCount + 1,
          errorMessage: null,
        },
      });

      res.json({
        success: true,
        message: "Delivery queued for retry",
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);
}
