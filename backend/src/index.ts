// Main API Server
// File: backend/src/index.ts

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { PrismaClient, OtpPurpose } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";
import { randomInt } from "crypto";
import { CSVValidator } from "./services/csvValidator";
import { EmailService } from "./services/emailService";
import {
  otpTemplate,
  welcomeTemplate,
} from "./services/internalEmailTemplates";
import {
  computeOnboardingState,
  markOnboardingStep,
} from "./services/onboarding";

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// JWT Secret (required via env)
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const DEFAULT_FROM_EMAIL =
  process.env.DEFAULT_FROM_EMAIL || "birthday@mail.olusworks.xyz";
const DEFAULT_FROM_NAME = process.env.DEFAULT_FROM_NAME;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

// OTP helpers: create, send, and verify one-time codes for auth flows.
function generateOtpCode() {
  return randomInt(0, 1000000).toString().padStart(6, "0");
}

function interpolateTemplate(
  template: string,
  variables: Record<string, string>
) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

// Sends an OTP email and stores a hashed record with expiry/attempt limits.
async function createAndSendOtp(params: {
  email: string;
  userId?: string;
  purpose: OtpPurpose;
  organization?: { name?: string | null; emailFromAddress?: string | null };
}) {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.otp.create({
    data: {
      email: params.email,
      userId: params.userId,
      purpose: params.purpose,
      codeHash,
      expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
    },
  });

  const fromEmail = params.organization?.emailFromAddress || DEFAULT_FROM_EMAIL;
  const fromName = DEFAULT_FROM_NAME || "MomentOS";

  if (!fromEmail) {
    throw new Error("DEFAULT_FROM_EMAIL is not configured");
  }

  const { subject, text, html } = otpTemplate({
    code,
    ttlMinutes: OTP_TTL_MINUTES,
    purpose: params.purpose === OtpPurpose.REGISTER_VERIFY ? "VERIFY" : "RESET",
  });

  await EmailService.send({
    to: params.email,
    subject,
    text,
    html,
    from: {
      name: fromName,
      email: fromEmail,
    },
  });

  return { code };
}

// Verifies an OTP code and marks it as consumed on success.
async function verifyOtpCode(params: {
  email: string;
  purpose: OtpPurpose;
  code: string;
}) {
  const otp = await prisma.otp.findFirst({
    where: {
      email: params.email,
      purpose: params.purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return { valid: false, reason: "OTP expired or not found" };
  }

  if (otp.attempts >= otp.maxAttempts) {
    return { valid: false, reason: "OTP attempts exceeded" };
  }

  const matches = await bcrypt.compare(params.code, otp.codeHash);
  if (!matches) {
    await prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { valid: false, reason: "Invalid OTP code" };
  }

  await prisma.otp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  return { valid: true };
}

// Auth middleware
interface AuthRequest extends Request {
  userId?: string;
  organizationId?: string;
}

async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET as jwt.Secret) as unknown as {
      userId: string;
      organizationId: string;
    };
    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;

    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ============================================================================
// AUTH ROUTES
// ============================================================================

// Register new organization + admin user
app.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    // Debug: log what we're receiving
    console.log("Register request body:", JSON.stringify(req.body, null, 2));

    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      organizationName: z.string().min(1),
      timezone: z.string().default("UTC"),
    });

    let data;
    try {
      data = schema.parse(req.body);
    } catch (err: any) {
      if (err instanceof ZodError) {
        console.error("Validation error:", err.errors);
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }
      throw err;
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create organization and user
    const org = await prisma.organization.create({
      data: {
        name: data.organizationName,
        timezone: data.timezone,
        users: {
          create: {
            email: data.email,
            passwordHash,
            role: "ADMIN",
          },
        },
      },
      include: {
        users: true,
      },
    });

    const user = org.users[0];

    await createAndSendOtp({
      email: user.email,
      userId: user.id,
      purpose: OtpPurpose.REGISTER_VERIFY,
      organization: {
        name: org.name,
        emailFromAddress: org.emailFromAddress,
      },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      organization: {
        id: org.id,
        name: org.name,
        timezone: org.timezone,
      },
      requiresVerification: true,
      message: "Verification code sent to your email.",
    });
  } catch (err: any) {
    console.error("Register error:", err);
    res.status(400).json({ error: err.message || "Registration failed" });
  }
});

// Login
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const data = schema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { organization: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const valid = await bcrypt.compare(data.password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.emailVerifiedAt) {
      return res
        .status(403)
        .json({ error: "Email not verified", requiresVerification: true });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, organizationId: user.organizationId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        timezone: user.organization.timezone,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Login failed" });
  }
});

// Send verification OTP for account activation.
app.post("/api/auth/verify/send", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
    });

    const { email } = schema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (user && !user.emailVerifiedAt) {
      await createAndSendOtp({
        email: user.email,
        userId: user.id,
        purpose: OtpPurpose.REGISTER_VERIFY,
        organization: user.organization,
      });
    }

    res.json({
      success: true,
      message: "If the account exists, a code was sent.",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Verify account OTP and mark user as verified.
app.post("/api/auth/verify", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      code: z.string().min(4),
    });

    const { email, code } = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.emailVerifiedAt) {
      return res.json({ success: true, message: "Account already verified" });
    }

    const result = await verifyOtpCode({
      email,
      purpose: OtpPurpose.REGISTER_VERIFY,
      code,
    });

    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });

    const welcomeFromEmail = org?.emailFromAddress || DEFAULT_FROM_EMAIL;
    if (!welcomeFromEmail) {
      return res.status(400).json({ error: "Sender email not configured" });
    }

    const { subject, html, text } = welcomeTemplate({
      organizationName: org?.name || "MomentOS",
    });

    await EmailService.send({
      to: user.email,
      subject,
      html,
      text,
      from: {
        name: DEFAULT_FROM_NAME || "MomentOS",
        email: welcomeFromEmail,
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Send OTP for password reset.
app.post("/api/auth/password/forgot", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
    });

    const { email } = schema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (user) {
      await createAndSendOtp({
        email: user.email,
        userId: user.id,
        purpose: OtpPurpose.PASSWORD_RESET,
        organization: user.organization,
      });
    }

    res.json({
      success: true,
      message: "If the account exists, a code was sent.",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Reset password with OTP verification.
app.post("/api/auth/password/reset", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      code: z.string().min(4),
      password: z.string().min(8),
    });

    const { email, code, password } = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const result = await verifyOtpCode({
      email,
      purpose: OtpPurpose.PASSWORD_RESET,
      code,
    });

    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
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
              birthday: person.birthday,
              department: person.department,
              role: person.role,
            },
            create: {
              organizationId: orgId,
              fullName: person.fullName,
              firstName: person.firstName,
              email: person.email,
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
      res.status(500).json({ error: "Upload failed", details: err.message });
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
      res.status(500).json({ error: err.message });
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
        "birthday",
        "department",
        "role",
        "opted_out",
      ];

      const rows = people.map((person) => [
        escape(person.fullName),
        escape(person.firstName || ""),
        escape(person.email),
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
      res.status(500).json({ error: err.message });
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

      const today = new Date();
      const in30Days = new Date();
      in30Days.setDate(today.getDate() + 30);

      // Filter by upcoming birthdays (check month/day only)
      const upcoming = people
        .filter((person) => {
          const bday = new Date(person.birthday);
          const thisYearBirthday = new Date(
            today.getFullYear(),
            bday.getMonth(),
            bday.getDate()
          );

          return thisYearBirthday >= today && thisYearBirthday <= in30Days;
        })
        .sort((a, b) => {
          const aBday = new Date(a.birthday);
          const bBday = new Date(b.birthday);
          const aThisYear = new Date(
            today.getFullYear(),
            aBday.getMonth(),
            aBday.getDate()
          );
          const bThisYear = new Date(
            today.getFullYear(),
            bBday.getMonth(),
            bBday.getDate()
          );
          return aThisYear.getTime() - bThisYear.getTime();
        });

      res.json({ upcoming });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
        birthday: z.string().min(1),
        department: z.string().optional(),
        role: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const birthday = new Date(data.birthday);

      if (Number.isNaN(birthday.getTime())) {
        return res.status(400).json({ error: "Invalid birthday" });
      }

      const person = await prisma.person.create({
        data: {
          organizationId: req.organizationId!,
          fullName:
            data.fullName || `${data.firstName} ${data.lastName}`.trim(),
          firstName: data.firstName,
          email: data.email.toLowerCase(),
          birthday,
          department: data.department,
          role: data.role,
        },
      });

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({ person, onboarding });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
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

      const person = await prisma.person.update({
        where: {
          id,
          organizationId: req.organizationId!,
        },
        data: req.body,
      });

      res.json({ person });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(400).json({ error: err.message });
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
      res.status(400).json({ error: err.message });
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

      const template = await prisma.template.findFirst({
        where: {
          organizationId: req.organizationId!,
          isDefault: true,
        },
      });

      if (!template) {
        return res.status(400).json({ error: "No default template found" });
      }

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
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================================
// SETTINGS ROUTES
// ============================================================================

app.get(
  "/api/settings",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({ organization: org, onboarding });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.put(
  "/api/settings",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const org = await prisma.organization.update({
        where: { id: req.organizationId! },
        data: req.body,
      });

      res.json({ organization: org });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
// ============================================================================
// TEMPLATE ROUTES
// ============================================================================

// List templates
app.get(
  "/api/templates",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const templates = await prisma.template.findMany({
        where: {
          organizationId: req.organizationId!,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json({ templates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get single template
app.get(
  "/api/templates/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const template = await prisma.template.findFirst({
        where: {
          id,
          organizationId: req.organizationId!,
        },
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json({ template });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Create template (first template becomes default).
app.post(
  "/api/templates",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(["PLAIN_TEXT", "HTML", "CUSTOM_IMAGE"]),
        subject: z.string().min(1),
        content: z.string().min(1),
        imageUrl: z.string().optional(),
      });

      const data = schema.parse(req.body);

      const existingDefault = await prisma.template.findFirst({
        where: {
          organizationId: req.organizationId!,
          isDefault: true,
        },
      });

      const template = await prisma.template.create({
        data: {
          ...data,
          organizationId: req.organizationId!,
          isDefault: !existingDefault,
          isActive: true,
        },
      });

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({ template, onboarding });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Update template; default selection forces active and clears other defaults.
app.put(
  "/api/templates/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const data = req.body;

      let template;
      if (data?.isDefault === true) {
        const [updated] = await prisma.$transaction([
          prisma.template.update({
            where: {
              id,
              organizationId: req.organizationId!,
            },
            data: {
              ...data,
              isDefault: true,
              isActive: true,
            },
          }),
          prisma.template.updateMany({
            where: {
              organizationId: req.organizationId!,
              id: { not: id },
              isDefault: true,
            },
            data: { isDefault: false },
          }),
        ]);
        template = updated;
      } else {
        template = await prisma.template.update({
          where: {
            id,
            organizationId: req.organizationId!,
          },
          data,
        });

        if (data?.isDefault === false && template.isDefault === false) {
          const existingDefault = await prisma.template.findFirst({
            where: {
              organizationId: req.organizationId!,
              isDefault: true,
            },
          });

          if (!existingDefault) {
            await prisma.template.update({
              where: { id: template.id },
              data: { isDefault: true, isActive: true },
            });
            template = await prisma.template.findUnique({
              where: { id: template.id },
            });
          }
        }
      }

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({ template, onboarding });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Delete template; keep at least one default template per org.
app.delete(
  "/api/templates/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const existing = await prisma.template.findFirst({
        where: {
          id,
          organizationId: req.organizationId!,
        },
      });

      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }

      if (existing.isDefault) {
        const alternative = await prisma.template.findFirst({
          where: {
            organizationId: req.organizationId!,
            id: { not: id },
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        });

        if (!alternative) {
          return res
            .status(400)
            .json({ error: "Cannot delete the only default template" });
        }

        await prisma.$transaction([
          prisma.template.delete({
            where: {
              id,
              organizationId: req.organizationId!,
            },
          }),
          prisma.template.update({
            where: { id: alternative.id },
            data: { isDefault: true, isActive: true },
          }),
        ]);
      } else {
        await prisma.template.delete({
          where: {
            id,
            organizationId: req.organizationId!,
          },
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Preview template with sample data
app.post(
  "/api/templates/:id/preview",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const template = await prisma.template.findFirst({
        where: {
          id,
          organizationId: req.organizationId!,
        },
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      // Sample data for preview
      const sampleData = {
        first_name: "John",
        full_name: "John Doe",
        organization_name: org?.name || "Your Organization",
        date: new Date().toLocaleDateString(),
      };

      // Interpolate variables
      let previewSubject = template.subject;
      let previewContent = template.content;

      Object.entries(sampleData).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, "g");
        previewSubject = previewSubject.replace(regex, value);
        previewContent = previewContent.replace(regex, value);
      });

      res.json({
        subject: previewSubject,
        content: previewContent,
        type: template.type,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Test send template (sends to current user's email)
app.post(
  "/api/templates/:id/test",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const template = await prisma.template.findFirst({
        where: {
          id,
          organizationId: req.organizationId!,
        },
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
      });

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      // Sample data for test email
      const sampleData = {
        first_name: user?.email.split("@")[0] || "You",
        full_name: user?.email.split("@")[0] || "You",
        organization_name: org?.name || "Your Organization",
        date: new Date().toLocaleDateString(),
      };

      // Interpolate variables
      let emailSubject = template.subject;
      let emailContent = template.content;

      Object.entries(sampleData).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, "g");
        emailSubject = emailSubject.replace(regex, value);
        emailContent = emailContent.replace(regex, value);
      });

      // Send actual email via Resend
      const fromEmail = org?.emailFromAddress || DEFAULT_FROM_EMAIL;

      if (!fromEmail) {
        return res.status(400).json({ error: "Sender email not configured" });
      }

      const result = await EmailService.send({
        to: user!.email,
        subject: emailSubject,
        html: template.type === "HTML" ? emailContent : undefined,
        text: template.type === "PLAIN_TEXT" ? emailContent : undefined,
        from: {
          name: org?.name || DEFAULT_FROM_NAME || "",
          email: fromEmail,
        },
      });

      const onboarding = await markOnboardingStep(
        prisma,
        req.organizationId!,
        "send_test_email"
      );

      res.json({
        success: true,
        message: `Test email sent to ${user?.email}`,
        emailId: result.id,
        onboarding,
      });
    } catch (err: any) {
      console.error("Test send error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Create default templates on first login (helper endpoint)
app.post(
  "/api/templates/create-defaults",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const existing = await prisma.template.findMany({
        where: { organizationId: req.organizationId! },
        select: { name: true },
      });

      const existingNames = new Set(existing.map((template) => template.name));

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      const defaultTemplates = [
        {
          name: "Simple Birthday",
          type: "PLAIN_TEXT" as const,
          subject: "Happy Birthday {{first_name}}! 🎉",
          content: `Happy Birthday {{first_name}}!

Wishing you a wonderful day filled with joy and happiness.

From everyone at {{organization_name}}`,
          isDefault: true,
          isActive: true,
        },
        {
          name: "Professional Birthday",
          type: "HTML" as const,
          subject: "Happy Birthday {{first_name}}!",
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
          name: "Fun & Colorful",
          type: "HTML" as const,
          subject: "🎂 It's Your Special Day, {{first_name}}! 🎈",
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
        {
          name: "Modern Gradient Birthday",
          type: "HTML" as const,
          subject: "Happy Birthday {{first_name}}! 🎉",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Happy Birthday!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 30px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 36px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                Happy Birthday!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 20px; color: #1f2937; font-weight: 600;">
                Dear {{first_name}},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                On behalf of everyone at <strong>{{organization_name}}</strong>, we want to wish you the happiest of birthdays! 🎂
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                May your special day be filled with joy, laughter, and wonderful memories. We're grateful to have you as part of our community!
              </p>
              <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; margin: 30px 0; text-align: center;">
                <p style="margin: 0; font-size: 18px; color: #92400e; font-weight: 600;">
                  🎁 Make a wish! 🎁
                </p>
              </div>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                Thank you for being such an important part of our family. Here's to another amazing year ahead!
              </p>
              <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 16px; color: #6b7280;">
                  With warm wishes,<br>
                  <strong style="color: #1f2937;">{{organization_name}}</strong>
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #9ca3af;">
                This is an automated birthday message from MomentOS
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="{{unsubscribe_link}}" style="color: #6b7280; text-decoration: none;">Unsubscribe from birthday emails</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          isDefault: false,
          isActive: false,
        },
        {
          name: "Minimal & Elegant",
          type: "HTML" as const,
          subject: "Happy Birthday {{first_name}}",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Happy Birthday</title>
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 60px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          <tr>
            <td style="text-align: center; padding-bottom: 40px; border-bottom: 2px solid #000000;">
              <h1 style="margin: 0; font-size: 42px; font-weight: 400; letter-spacing: 2px; color: #000000;">
                HAPPY BIRTHDAY
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 0;">
              <p style="margin: 0 0 30px 0; font-size: 18px; line-height: 1.8; color: #333333; text-align: center;">
                Dear <strong>{{first_name}}</strong>,
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.8; color: #555555; text-align: center;">
                Wishing you a day filled with happiness and a year filled with joy.
              </p>
              <div style="text-align: center; margin: 40px 0;">
                <div style="display: inline-block; border: 2px solid #000000; border-radius: 50%; width: 100px; height: 100px; line-height: 100px; font-size: 48px;">
                  🎂
                </div>
              </div>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.8; color: #555555; text-align: center;">
                From all of us at <strong>{{organization_name}}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 40px; border-top: 1px solid #cccccc; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999999;">
                <a href="{{unsubscribe_link}}" style="color: #999999; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          isDefault: false,
          isActive: false,
        },
        {
          name: "Fun & Colorful (Party Theme)",
          type: "HTML" as const,
          subject: "It's Party Time, {{first_name}}! 🎉",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>It's Party Time!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Comic Sans MS', cursive, sans-serif; background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%);">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
          <tr>
            <td style="background: linear-gradient(135deg, #ff6b6b 0%, #feca57 25%, #48dbfb 50%, #ff9ff3 75%, #ff6b6b 100%); padding: 10px; text-align: center;">
              <div style="font-size: 64px; margin: 20px 0;">🎉🎂🎈🎁🎊</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0 0 20px 0; font-size: 48px; color: #ff6b6b; text-shadow: 3px 3px 0px #feca57, 6px 6px 0px #48dbfb;">
                HAPPY BIRTHDAY!
              </h1>
              <p style="margin: 0 0 30px 0; font-size: 24px; color: #2d3436; font-weight: bold;">
                Hey {{first_name}}! 🎊
              </p>
              <p style="margin: 0 0 25px 0; font-size: 18px; line-height: 1.6; color: #636e72;">
                Another trip around the sun completed! 🌞
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #636e72;">
                We hope your birthday is as <strong style="color: #ff6b6b;">AMAZING</strong> as you are! May your day be filled with cake, laughter, and everything that makes you smile! 😄
              </p>
              <div style="background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%); border-radius: 15px; padding: 25px; margin: 30px 0; border: 4px dashed #ff6b6b;">
                <p style="margin: 0; font-size: 20px; color: #2d3436; font-weight: bold;">
                  🎁 Make a wish! 🎁
                </p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #636e72;">
                  (But don't tell anyone or it won't come true!)
                </p>
              </div>
              <div style="margin: 30px 0;">
                <p style="margin: 0; font-size: 16px; color: #636e72;">
                  Party on! 🥳
                </p>
                <p style="margin: 10px 0 0 0; font-size: 18px; color: #2d3436; font-weight: bold;">
                  {{organization_name}}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 3px solid #ff6b6b;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #95a5a6;">
                This birthday message was sent with 💖 by MomentOS
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="{{unsubscribe_link}}" style="color: #95a5a6; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          isDefault: false,
          isActive: false,
        },
        {
          name: "Corporate Professional",
          type: "HTML" as const,
          subject: "Birthday Wishes, {{first_name}}",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Birthday Wishes</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e0e0e0;">
          <tr>
            <td style="background-color: #1a73e8; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: 0.5px;">
                Happy Birthday, {{first_name}}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 40px;">
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Dear {{first_name}},
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                On behalf of the entire team at {{organization_name}}, I would like to extend our warmest birthday wishes to you.
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                Your contributions to our organization are greatly valued, and we hope this special day brings you joy and happiness.
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #1a73e8; padding: 20px; margin: 30px 0;">
                <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; font-style: italic;">
                  "May your birthday mark the beginning of another wonderful year filled with success and prosperity."
                </p>
              </div>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                Wishing you all the best on your special day and throughout the coming year.
              </p>
              <div style="margin-top: 40px;">
                <p style="margin: 0 0 5px 0; font-size: 16px; color: #333333;">
                  Warm regards,
                </p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1a73e8;">
                  {{organization_name}}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; border-top: 1px solid #e0e0e0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center; padding-bottom: 15px;">
                    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.5;">
                      {{organization_name}}<br>
                      Automated Birthday Notification System
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #999999;">
                      <a href="{{unsubscribe_link}}" style="color: #999999; text-decoration: none;">Unsubscribe from birthday notifications</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          isDefault: false,
          isActive: false,
        },
        {
          name: "Warm & Personal (Community Style)",
          type: "HTML" as const,
          subject: "Birthday Blessings, {{first_name}}",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Birthday Blessings</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Georgia', serif; background-color: #fef6e4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef6e4; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 50px 30px; text-align: center;">
              <div style="font-size: 50px; margin-bottom: 15px;">🎂</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 400; font-family: 'Georgia', serif;">
                Celebrating You Today
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 35px;">
              <p style="margin: 0 0 25px 0; font-size: 18px; color: #2c3e50; font-weight: 600;">
                Dear {{first_name}},
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.8; color: #34495e;">
                On this special day, we want to take a moment to celebrate you and the blessing you are to our {{organization_name}} family.
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.8; color: #34495e;">
                Your presence in our community brings joy, and we are grateful for the unique gifts and talents you share with us.
              </p>
              <div style="background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 2px solid #f5576c;">
                <p style="margin: 0 0 15px 0; font-size: 20px; color: #c0392b; font-weight: 600;">
                  🙏 A Birthday Blessing 🙏
                </p>
                <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #7f8c8d; font-style: italic;">
                  May this year bring you abundant joy, peace, and countless reasons to smile. May you continue to grow in love and wisdom.
                </p>
              </div>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.8; color: #34495e;">
                We pray that your birthday is filled with wonderful moments and that the year ahead brings you closer to your dreams.
              </p>
              <div style="margin-top: 35px; padding-top: 30px; border-top: 1px solid #ecf0f1;">
                <p style="margin: 0 0 10px 0; font-size: 16px; color: #7f8c8d;">
                  With love and warm wishes,
                </p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #2c3e50;">
                  Your {{organization_name}} Family
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px; text-align: center; border-top: 1px solid #ecf0f1;">
              <p style="margin: 0 0 10px 0; font-size: 13px; color: #95a5a6;">
                This birthday message was sent with care by {{organization_name}}
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="{{unsubscribe_link}}" style="color: #95a5a6; text-decoration: none;">Unsubscribe from birthday messages</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          isDefault: false,
          isActive: false,
        },
      ];

      const toCreate = defaultTemplates.filter(
        (template) => !existingNames.has(template.name)
      );

      if (toCreate.length === 0) {
        const onboarding = await computeOnboardingState(
          prisma,
          req.organizationId!
        );
        return res.json({ message: "Default templates already exist", onboarding });
      }

      const created = await Promise.all(
        toCreate.map((template) =>
          prisma.template.create({
            data: {
              ...template,
              organizationId: req.organizationId!,
            },
          })
        )
      );

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({
        success: true,
        message: "Default templates created",
        count: created.length,
        onboarding,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================================
// ONBOARDING ROUTES
// ============================================================================

app.get(
  "/api/onboarding/status",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );
      res.json({ onboarding });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/api/onboarding/mark-step",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        stepId: z.string().min(1),
      });

      const { stepId } = schema.parse(req.body);
      const onboarding = await markOnboardingStep(
        prisma,
        req.organizationId!,
        stepId
      );
      res.json({ onboarding });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.post(
  "/api/onboarding/recompute",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );
      res.json({ onboarding });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================================
// START SERVER
// ============================================================================

// ============================================================================
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

      const templateCount = await prisma.template.count({
        where: { organizationId: orgId },
      });

      const activeTemplateCount = await prisma.template.count({
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

      const now = new Date();
      const in7Days = new Date();
      in7Days.setDate(now.getDate() + 7);

      const upcomingBirthdays = people.filter((person) => {
        const bday = new Date(person.birthday);
        const thisYearBirthday = new Date(
          now.getFullYear(),
          bday.getMonth(),
          bday.getDate()
        );
        return thisYearBirthday >= now && thisYearBirthday <= in7Days;
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  }
);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 MomentOS API running on http://localhost:${PORT}`);
});
