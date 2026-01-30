import { Express, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { CSVValidator } from "../services/csvValidator";
import { EmailService } from "../services/emailService";
import { normalizeOptionalPhone } from "../services/phone";
import { computeOnboardingState } from "../services/onboarding";
import { PersonUpdateSchema, validateUpdate } from "../middleware/validation";
import { authenticate, AuthRequest, DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME, getNextBirthdayOccurrence, getOrgDateTime, getUserErrorMessage, interpolateTemplate, prisma } from "../serverContext";

export function registerPeopleRoutes(app: Express) {
// PEOPLE ROUTES
// ============================================================================

// Upload CSV
app.post(
  "/api/people/upload",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { csvContent } = req.body;

      if (!csvContent) {
        return res.status(400).json({ error: "CSV content is required" });
      }

      // Validate CSV
      const validation = await CSVValidator.validate(csvContent);

      // If there are valid rows, upsert them
      if (validation.valid.length > 0) {
        const orgId = req.organizationId!;

        // Upsert each person (update if email exists, create if not)
        for (const person of validation.valid) {
          await prisma.person.upsert({
            where: {
              organizationId_email: {
                organizationId: orgId,
                email: person.email,
              },
            },
            update: {
              fullName: person.fullName,
              firstName: person.firstName,
              phone: person.phone ?? null,
              birthday: person.birthday,
              department: person.department,
              role: person.role,
            },
            create: {
              organizationId: orgId,
              fullName: person.fullName,
              firstName: person.firstName,
              email: person.email,
              phone: person.phone ?? null,
              birthday: person.birthday,
              department: person.department,
              role: person.role,
            },
          });
        }
      }

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({
        success: true,
        summary: validation.summary,
        errors: validation.errors,
        onboarding,
      });
    } catch (err: any) {
      console.error("CSV upload error:", err);
      res.status(500).json({ error: "Upload failed", details: getUserErrorMessage(err) });
    }
  }
);

// List people
app.get(
  "/api/people",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const people = await prisma.person.findMany({
        where: {
          organizationId: req.organizationId!,
        },
        orderBy: {
          fullName: "asc",
        },
      });

      res.json({ people });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Export people as CSV
app.get(
  "/api/people/export",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const people = await prisma.person.findMany({
        where: { organizationId: req.organizationId! },
        orderBy: { fullName: "asc" },
      });

      const escape = (value: string | null | undefined) => {
        const safe = value ?? "";
        return `"${safe.replace(/"/g, '""')}"`;
      };

      const header = [
        "full_name",
        "first_name",
        "email",
        "phone",
        "birthday",
        "department",
        "role",
        "opted_out",
      ];

      const rows = people.map((person) => [
        escape(person.fullName),
        escape(person.firstName || ""),
        escape(person.email),
        escape(person.phone || ""),
        escape(person.birthday.toISOString().split("T")[0]),
        escape(person.department || ""),
        escape(person.role || ""),
        escape(person.optedOut ? "true" : "false"),
      ]);

      const csv = [header.join(","), ...rows.map((row) => row.join(","))].join(
        "\n"
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=people.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Get upcoming birthdays (next 30 days)
app.get(
  "/api/people/upcoming",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const people = await prisma.person.findMany({
        where: {
          organizationId: req.organizationId!,
          optedOut: false,
        },
      });

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
        select: { timezone: true },
      });

      const orgNow = getOrgDateTime(org?.timezone);
      const today = orgNow.startOf("day");
      const windowEnd = today.plus({ days: 30 }).endOf("day");

      // Filter by upcoming birthdays (check month/day only)
      const upcoming = people
        .filter((person) => {
          const nextOccurrence = getNextBirthdayOccurrence(
            person.birthday,
            today
          );
          return nextOccurrence <= windowEnd;
        })
        .sort((a, b) => {
          const aNext = getNextBirthdayOccurrence(a.birthday, today);
          const bNext = getNextBirthdayOccurrence(b.birthday, today);
          return aNext.toMillis() - bNext.toMillis();
        });

      res.json({ upcoming });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Download sample CSV
app.get("/api/people/sample-csv", (req: Request, res: Response) => {
  const csv = CSVValidator.generateSampleCSV();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=sample-people.csv"
  );
  res.send(csv);
});

// Create person manually (non-CSV).
app.post(
  "/api/people",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        fullName: z.string().optional(),
        email: z.string().email(),
        phone: z.string().optional(),
        birthday: z.string().min(1),
        department: z.string().optional(),
        role: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const birthday = new Date(data.birthday);
      let phone: string | null = null;
      try {
        phone = normalizeOptionalPhone(data.phone);
      } catch (error: any) {
        return res.status(400).json({ error: error?.message || "Invalid phone number" });
      }

      if (Number.isNaN(birthday.getTime())) {
        return res.status(400).json({ error: "Invalid birthday" });
      }

      let person;
      try {
        person = await prisma.person.create({
          data: {
            organizationId: req.organizationId!,
            fullName:
              data.fullName || `${data.firstName} ${data.lastName}`.trim(),
            firstName: data.firstName,
            email: data.email.toLowerCase(),
            phone,
            birthday,
            department: data.department,
            role: data.role,
          },
        });
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === "P2002") {
            return res
              .status(409)
              .json({ error: "Email already exists for this organization" });
          }
        }
        throw err;
      }

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({ person, onboarding });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Update person
app.put(
  "/api/people/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      let safeData = validateUpdate(PersonUpdateSchema, req.body);
      if ("email" in safeData && safeData.email) {
        safeData = { ...safeData, email: safeData.email.toLowerCase() };
      }
      if ("phone" in safeData) {
        try {
          const normalizedPhone = normalizeOptionalPhone(
            (safeData as any).phone
          );
          safeData = { ...safeData, phone: normalizedPhone };
        } catch (error: any) {
          return res
            .status(400)
            .json({ error: error?.message || "Invalid phone number" });
        }
      }

      const person = await prisma.person.update({
        where: {
          id,
          organizationId: req.organizationId!,
        },
        data: safeData,
      });

      res.json({ person });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Delete person
app.delete(
  "/api/people/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      await prisma.person.delete({
        where: {
          id,
          organizationId: req.organizationId!,
        },
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Bulk delete people
app.post(
  "/api/people/bulk-delete",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        ids: z.array(z.string().min(1)).min(1),
      });

      const { ids } = schema.parse(req.body);

      const result = await prisma.person.deleteMany({
        where: {
          organizationId: req.organizationId!,
          id: { in: ids },
        },
      });

      res.json({ success: true, deleted: result.count });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Bulk opt-out or opt-in people
app.post(
  "/api/people/bulk-opt-out",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        ids: z.array(z.string().min(1)).min(1),
        optedOut: z.boolean().default(true),
      });

      const { ids, optedOut } = schema.parse(req.body);

      const result = await prisma.person.updateMany({
        where: {
          organizationId: req.organizationId!,
          id: { in: ids },
        },
        data: { optedOut },
      });

      res.json({ success: true, updated: result.count });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Send birthday email now (manual trigger per person).
app.post(
  "/api/people/:id/send-birthday",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const person = await prisma.person.findFirst({
        where: {
          id,
          organizationId: req.organizationId!,
        },
      });

      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }

      if (person.optedOut) {
        return res.status(400).json({ error: "Person has opted out" });
      }

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      const templateAssignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
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
          organizationId: req.organizationId!,
          status: "SENT",
          scheduledFor: new Date(),
          sentAt: new Date(),
          externalId: result.id,
        },
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// ============================================================================
}
