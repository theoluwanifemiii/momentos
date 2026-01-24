// Main API Server
// File: backend/src/index.ts

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { PrismaClient, OtpPurpose, Prisma, DeliveryStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DateTime } from "luxon";
import { z, ZodError } from "zod";
import { randomInt, randomBytes, createHash } from "crypto";
import { CSVValidator } from "./services/csvValidator";
import { EmailService } from "./services/emailService";
import {
  otpTemplate,
  waitlistWelcomeTemplate,
  welcomeTemplate,
} from "./services/internalEmailTemplates";
import {
  computeOnboardingState,
  markOnboardingStep,
} from "./services/onboarding";
import {
  PersonUpdateSchema,
  SettingsUpdateSchema,
  OrganizationTemplateUpdateSchema,
  validateUpdate,
} from "./middleware/validation";

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// JWT Secret (required via env)
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const DEFAULT_FROM_EMAIL =
  process.env.DEFAULT_FROM_EMAIL || "notifications@mail.usemomentos.xyz";
const DEFAULT_FROM_NAME = process.env.DEFAULT_FROM_NAME;
const WAITLIST_FROM_EMAIL =
  process.env.WAITLIST_FROM_EMAIL || "founder@mail.usemomentos.xyz";
const WAITLIST_FROM_NAME =
  process.env.WAITLIST_FROM_NAME || "Olu from MomentOS";
const WAITLIST_REPLY_TO =
  process.env.WAITLIST_REPLY_TO || "founder@usemomentos.xyz";
const WELCOME_FROM_EMAIL =
  process.env.WELCOME_FROM_EMAIL || "founder@mail.usemomentos.xyz";
const WELCOME_FROM_NAME =
  process.env.WELCOME_FROM_NAME || "Olu from MomentOS";
const WELCOME_REPLY_TO =
  process.env.WELCOME_REPLY_TO || "founder@usemomentos.xyz";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const ADMIN_EMAIL_DOMAIN = process.env.ADMIN_EMAIL_DOMAIN || "usemomentos.xyz";
const ADMIN_SESSION_TTL_DAYS = Number(
  process.env.ADMIN_SESSION_TTL_DAYS || 7
);
const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
const ADMIN_INVITE_TTL_HOURS = Number(
  process.env.ADMIN_INVITE_TTL_HOURS || 24
);
const ADMIN_INVITE_FROM_EMAIL =
  process.env.ADMIN_INVITE_FROM_EMAIL || "admin@mail.usemomentos.xyz";
const ADMIN_INVITE_FROM_NAME =
  process.env.ADMIN_INVITE_FROM_NAME || "MomentOS Admin";
const ADMIN_APP_URL =
  process.env.ADMIN_APP_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

type AdminRoleType = "SUPER_ADMIN" | "SUPPORT";

const adminSessionCache = new Map<
  string,
  { adminId: string; adminRole: AdminRoleType; expiresAt: number }
>();

const adminUserCache = new Map<
  string,
  { expiresAt: number; admin: { id: string; email: string; role: AdminRoleType } }
>();

const adminCacheStore = new Map<
  string,
  { expiresAt: number; status: number; body: unknown }
>();

const adminCache = (ttlSeconds: number) => {
  return (req: Request & { adminId?: string }, res: Response, next: any) => {
    if (req.method !== "GET") return next();
    const adminId = req.adminId || "unknown";
    const key = `${adminId}:${req.originalUrl}`;
    const cached = adminCacheStore.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("X-Admin-Cache", "HIT");
      return res.status(cached.status).json(cached.body);
    }
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      adminCacheStore.set(key, {
        expiresAt: Date.now() + ttlSeconds * 1000,
        status: res.statusCode || 200,
        body,
      });
      res.setHeader("X-Admin-Cache", "MISS");
      return originalJson(body);
    };
    next();
  };
};

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

function getOrgDateTime(timezone?: string) {
  const zone = timezone || "UTC";
  const orgNow = DateTime.now().setZone(zone);
  if (!orgNow.isValid) {
    return DateTime.now().setZone("UTC");
  }
  return orgNow;
}

function getNextBirthdayOccurrence(birthday: Date, reference: DateTime) {
  const base = DateTime.fromJSDate(birthday, { zone: reference.zone });
  let next = base.set({ year: reference.year });

  if (next < reference.startOf("day")) {
    next = next.plus({ years: 1 });
  }

  return next;
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

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function createAdminSession(
  adminId: string,
  adminRole: AdminRoleType,
  req: Request,
  res: Response
) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ADMIN_SESSION_TTL_DAYS);

  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash,
      expiresAt,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });

  adminSessionCache.set(tokenHash, {
    adminId,
    adminRole,
    expiresAt: Math.min(Date.now() + 15_000, expiresAt.getTime()),
  });

  const isProd = process.env.NODE_ENV === "production";
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    maxAge: ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

async function revokeAdminSession(token?: string) {
  if (!token) {
    return;
  }
  const tokenHash = hashToken(token);
  adminSessionCache.delete(tokenHash);
  await prisma.adminSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.JsonObject;
}) {
  await prisma.adminAuditLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ?? {},
    },
  });
}

async function createAdminInvite(params: {
  email: string;
  role: "SUPER_ADMIN" | "SUPPORT";
  createdBy: string;
}) {
  const token = randomBytes(24).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ADMIN_INVITE_TTL_HOURS);

  const invite = await prisma.adminInvite.create({
    data: {
      email: params.email,
      role: params.role,
      tokenHash,
      expiresAt,
      createdBy: params.createdBy,
    },
  });

  return { invite, token };
}

// Auth middleware
interface AuthRequest extends Request {
  userId?: string;
  organizationId?: string;
}

interface AdminAuthRequest extends Request {
  adminId?: string;
  adminRole?: "SUPER_ADMIN" | "SUPPORT";
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

async function authenticateAdmin(
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (!token) {
      return res.status(401).json({ error: "Admin authentication required" });
    }

    const tokenHash = hashToken(token);
    const cached = adminSessionCache.get(tokenHash);
    if (cached && cached.expiresAt > Date.now()) {
      req.adminId = cached.adminId;
      req.adminRole = cached.adminRole;
      return next();
    }

    const session = await prisma.adminSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { admin: true },
    });

    if (!session?.admin || !session.admin.isActive) {
      return res.status(401).json({ error: "Admin session invalid" });
    }

    req.adminId = session.adminId;
    req.adminRole = session.admin.role as AdminRoleType;
    adminSessionCache.set(tokenHash, {
      adminId: session.adminId,
      adminRole: session.admin.role as AdminRoleType,
      expiresAt: Math.min(Date.now() + 15_000, session.expiresAt.getTime()),
    });
    next();
  } catch (err) {
    res.status(401).json({ error: "Admin session invalid" });
  }
}

function requireSuperAdmin(req: AdminAuthRequest, res: Response) {
  if (req.adminRole !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Super admin access required" });
    return false;
  }
  return true;
}

// ============================================================================
// AUTH ROUTES
// ============================================================================

// Internal admin auth routes
app.post("/api/internal/admin/auth/login", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });

    const data = schema.parse(req.body);
    const normalizedEmail = data.email.toLowerCase();

    if (!normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) {
      return res.status(403).json({ error: "Admin email domain not allowed" });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    const valid = await bcrypt.compare(data.password, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await createAdminSession(admin.id, admin.role as AdminRoleType, req, res);

    res.json({
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Admin login failed" });
  }
});

app.post(
  "/api/internal/admin/auth/bootstrap",
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(["SUPER_ADMIN", "SUPPORT"]).default("SUPER_ADMIN"),
        token: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const normalizedEmail = data.email.toLowerCase();

      if (!normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) {
        return res.status(403).json({ error: "Admin email domain not allowed" });
      }

      const existingAdmins = await prisma.adminUser.count();
      const suppliedToken = data.token || req.headers["x-admin-bootstrap-token"];
      if (!ADMIN_BOOTSTRAP_TOKEN && existingAdmins > 0) {
        return res.status(403).json({ error: "Admin bootstrap disabled" });
      }
      if (existingAdmins > 0 && suppliedToken !== ADMIN_BOOTSTRAP_TOKEN) {
        return res.status(403).json({ error: "Invalid bootstrap token" });
      }

      const passwordHash = await bcrypt.hash(data.password, 10);
      const admin = await prisma.adminUser.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: data.role,
        },
      });

      await logAdminAction({
        adminId: admin.id,
        action: "ADMIN_BOOTSTRAP",
        targetType: "admin_user",
        targetId: admin.id,
        metadata: { email: admin.email, role: admin.role },
      });

      res.json({
        admin: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Admin bootstrap failed" });
    }
  }
);

app.post(
  "/api/internal/admin/auth/register",
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        token: z.string().min(16),
      });

      const data = schema.parse(req.body);
      const normalizedEmail = data.email.toLowerCase();

      if (!normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) {
        return res.status(403).json({ error: "Admin email domain not allowed" });
      }

      const tokenHash = hashToken(data.token);
      const invite = await prisma.adminInvite.findFirst({
        where: {
          tokenHash,
          email: normalizedEmail,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!invite) {
        return res.status(400).json({ error: "Invite token invalid or expired" });
      }

      const existing = await prisma.adminUser.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        return res.status(409).json({ error: "Admin already exists" });
      }

      const passwordHash = await bcrypt.hash(data.password, 10);
      const admin = await prisma.adminUser.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: invite.role,
        },
      });

      await prisma.adminInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      await logAdminAction({
        adminId: invite.createdBy,
        action: "ADMIN_INVITE_ACCEPTED",
        targetType: "admin_user",
        targetId: admin.id,
        metadata: { email: admin.email, role: admin.role },
      });

      res.json({
        admin: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Admin signup failed" });
    }
  }
);

app.post(
  "/api/internal/admin/auth/logout",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response) => {
    try {
      await revokeAdminSession(req.cookies?.[ADMIN_SESSION_COOKIE]);
      res.clearCookie(ADMIN_SESSION_COOKIE);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Logout failed" });
    }
  }
);

app.get(
  "/api/internal/admin/auth/me",
  authenticateAdmin,
  adminCache(10),
  async (req: AdminAuthRequest, res: Response) => {
    const cached = adminUserCache.get(req.adminId!);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ admin: cached.admin });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: req.adminId },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const payload = {
      id: admin.id,
      email: admin.email,
      role: admin.role as AdminRoleType,
    };
    adminUserCache.set(req.adminId!, {
      admin: payload,
      expiresAt: Date.now() + 30_000,
    });

    res.json({ admin: payload });
  }
);

// Register new organization + admin user
app.post("/api/auth/register", async (req: Request, res: Response) => {
  const requestId = req.headers["x-request-id"]?.toString();
  let safeEmail: string | undefined;

  try {
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

    safeEmail = data.email;

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

    console.log("Register outcome:", {
      email: safeEmail,
      organizationId: org.id,
      requestId,
      outcome: "success",
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
    console.error("Register outcome:", {
      email: safeEmail,
      organizationId: undefined,
      requestId,
      outcome: "failed",
    });
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

    if (user.isDisabled) {
      return res.status(403).json({ error: "User account disabled" });
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

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

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

    const welcomeFromEmail = org?.emailFromAddress || WELCOME_FROM_EMAIL;
    if (!welcomeFromEmail) {
      return res.status(400).json({ error: "Sender email not configured" });
    }

    const recipientName = user.email.split("@")[0];
    const { subject, html, text } = welcomeTemplate({
      organizationName: org?.name || "MomentOS",
      recipientName,
    });

    await EmailService.send({
      to: user.email,
      subject,
      html,
      text,
      from: {
        name: WELCOME_FROM_NAME,
        email: welcomeFromEmail,
      },
      replyTo: WELCOME_REPLY_TO,
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

// Waitlist signup (public)
app.post("/api/waitlist", async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      organization: z.string().min(1),
      role: z.string().optional(),
      teamSize: z.string().optional(),
      country: z.string().optional(),
    });

    const data = schema.parse(req.body);

    await prisma.waitlistEntry.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.toLowerCase(),
        organization: data.organization.trim(),
        role: data.role?.trim() || null,
        teamSize: data.teamSize?.trim() || null,
        country: data.country?.trim() || null,
      },
    });

    const { subject, text, html } = waitlistWelcomeTemplate({
      recipientName: data.firstName,
    });
    await EmailService.send({
      to: data.email.toLowerCase(),
      subject,
      text,
      html,
      from: {
        name: WAITLIST_FROM_NAME,
        email: WAITLIST_FROM_EMAIL,
      },
      replyTo: WAITLIST_REPLY_TO,
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "Email already on waitlist" });
      }
    }
    res.status(400).json({ error: err.message || "Waitlist signup failed" });
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

      let safeData = validateUpdate(PersonUpdateSchema, req.body);
      if ("email" in safeData && safeData.email) {
        safeData = { ...safeData, email: safeData.email.toLowerCase() };
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
      res.status(400).json({ error: err.message });
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
      const safeData = validateUpdate(SettingsUpdateSchema, req.body);

      const org = await prisma.organization.update({
        where: { id: req.organizationId! },
        data: safeData,
      });

      res.json({ organization: org });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
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
      const assignments = await prisma.organizationTemplate.findMany({
        where: {
          organizationId: req.organizationId!,
          isActive: true,
        },
        include: { template: true },
        orderBy: { assignedAt: "desc" },
      });

      res.json({
        templates: assignments.map((assignment) => ({
          ...assignment.template,
          isDefault: assignment.isDefault,
          isActive: assignment.isActive,
        })),
      });
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

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
          isActive: true,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json({
        template: {
          ...assignment.template,
          isDefault: assignment.isDefault,
          isActive: assignment.isActive,
        },
      });
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
      return res.status(403).json({
        error: "Custom templates are disabled. Use the default templates.",
      });
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

      const safeData = validateUpdate(
        OrganizationTemplateUpdateSchema,
        req.body
      );

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }

      let updatedAssignment;
      if (safeData?.isDefault === true) {
        const [updated] = await prisma.$transaction([
          prisma.organizationTemplate.update({
            where: { id: assignment.id },
            data: { isDefault: true, isActive: true },
          }),
          prisma.organizationTemplate.updateMany({
            where: {
              organizationId: req.organizationId!,
              id: { not: assignment.id },
              isDefault: true,
            },
            data: { isDefault: false },
          }),
        ]);
        updatedAssignment = updated;
      } else {
        updatedAssignment = await prisma.organizationTemplate.update({
          where: { id: assignment.id },
          data: {
            ...(safeData.isDefault !== undefined
              ? { isDefault: safeData.isDefault }
              : {}),
            ...(safeData.isActive !== undefined
              ? { isActive: safeData.isActive }
              : {}),
          },
        });
      }

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({
        template: {
          ...assignment.template,
          isDefault: updatedAssignment.isDefault,
          isActive: updatedAssignment.isActive,
        },
        onboarding,
      });
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
      return res.status(403).json({
        error: "Default templates cannot be deleted.",
      });
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

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
          isActive: true,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }
      const template = assignment.template;

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

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
          isActive: true,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }
      const template = assignment.template;

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
      const defaultTemplates = [
        {
          name: "Simple Birthday",
          type: "PLAIN_TEXT" as const,
          subject: "Happy Birthday {{first_name}}! 🎉",
          content: `Happy Birthday {{first_name}}!

Wishing you a wonderful day filled with joy and happiness.

From everyone at {{organization_name}}`,
          isSystem: true,
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
          isSystem: true,
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
          isSystem: true,
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
          isSystem: true,
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
          isSystem: true,
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
          isSystem: true,
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
          isSystem: true,
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
          isSystem: true,
        },
      ];

      const existingGlobals = await prisma.template.findMany({
        where: { name: { in: defaultTemplates.map((template) => template.name) } },
      });
      const existingByName = new Map(
        existingGlobals.map((template) => [template.name, template])
      );

      const createdGlobals = await Promise.all(
        defaultTemplates
          .filter((template) => !existingByName.has(template.name))
          .map((template) =>
            prisma.template.create({
              data: {
                ...template,
                isActive: true,
                isSystem: true,
              },
            })
          )
      );

      const globalTemplates = [
        ...existingGlobals,
        ...createdGlobals,
      ];

      const assignments = await prisma.organizationTemplate.findMany({
        where: { organizationId: req.organizationId! },
        select: { templateId: true, isDefault: true },
      });
      const assignedIds = new Set(assignments.map((row) => row.templateId));

      const assignmentData = globalTemplates
        .filter((template) => !assignedIds.has(template.id))
        .map((template) => ({
          organizationId: req.organizationId!,
          templateId: template.id,
          isDefault: template.name === "Simple Birthday",
          isActive: true,
        }));

      if (assignmentData.length > 0) {
        await prisma.organizationTemplate.createMany({
          data: assignmentData,
          skipDuplicates: true,
        });
      }

      const hasDefault = assignments.some((row) => row.isDefault);
      if (!hasDefault) {
        const fallback = globalTemplates.find(
          (template) => template.name === "Simple Birthday"
        );
        if (fallback) {
          await prisma.organizationTemplate.updateMany({
            where: {
              organizationId: req.organizationId!,
              templateId: fallback.id,
            },
            data: { isDefault: true, isActive: true },
          });
        }
      }

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({
        success: true,
        message: "Default templates assigned",
        count: assignmentData.length,
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
// INTERNAL ADMIN ROUTES (MomentOS staff only)
// ============================================================================

app.use("/api/internal/admin", (req: Request, _res: Response, next) => {
  if (req.method !== "GET") {
    adminCacheStore.clear();
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
      res.status(500).json({ error: err.message || "Overview failed" });
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
      res.status(500).json({ error: err.message || "Admin list failed" });
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
      res.status(400).json({ error: err.message || "Invite failed" });
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
      res.status(500).json({ error: err.message || "Org list failed" });
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
      res.status(500).json({ error: err.message || "Org fetch failed" });
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
      res.status(500).json({ error: err.message || "Suspend failed" });
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
      res.status(500).json({ error: err.message || "Reactivate failed" });
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
      res.status(500).json({ error: err.message || "Delete failed" });
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
      res.status(500).json({ error: err.message || "User list failed" });
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
      res.status(500).json({ error: err.message || "Disable failed" });
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
      res.status(500).json({ error: err.message || "Enable failed" });
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
      res.status(500).json({ error: err.message || "Verify failed" });
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
      res.status(500).json({ error: err.message || "People fetch failed" });
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
      res.status(500).json({ error: err.message || "Send failed" });
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
      res.status(500).json({ error: err.message || "Template fetch failed" });
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
      res.status(400).json({ error: err.message || "Template create failed" });
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
      res.status(500).json({ error: err.message || "Disable failed" });
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
      res.status(500).json({ error: err.message || "Logs fetch failed" });
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
      res.status(500).json({ error: err.message || "Retry failed" });
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
      res.status(500).json({ error: err.message || "Audit fetch failed" });
    }
  }
);

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
