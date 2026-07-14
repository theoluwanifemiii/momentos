import "dotenv/config";
import { PrismaClient, OtpPurpose, Prisma, UserRole } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DateTime } from "luxon";
import { randomBytes, randomInt, createHash } from "crypto";
import { EmailService } from "./services/emailService";
import { otpTemplate } from "./services/internalEmailTemplates";

export const prisma = new PrismaClient();

export const JWT_SECRET = process.env.JWT_SECRET ?? "";
export const DEFAULT_FROM_EMAIL =
  process.env.DEFAULT_FROM_EMAIL || "notifications@mail.usemomentos.xyz";
export const DEFAULT_FROM_NAME = process.env.DEFAULT_FROM_NAME;
export const WAITLIST_FROM_EMAIL =
  process.env.WAITLIST_FROM_EMAIL || "founder@mail.usemomentos.xyz";
export const WAITLIST_FROM_NAME =
  process.env.WAITLIST_FROM_NAME || "Olu from MomentOS";
export const WAITLIST_REPLY_TO =
  process.env.WAITLIST_REPLY_TO || "founder@usemomentos.xyz";
export const WELCOME_FROM_EMAIL =
  process.env.WELCOME_FROM_EMAIL || "founder@mail.usemomentos.xyz";
export const WELCOME_FROM_NAME =
  process.env.WELCOME_FROM_NAME || "Olu from MomentOS";
export const WELCOME_REPLY_TO =
  process.env.WELCOME_REPLY_TO || "founder@usemomentos.xyz";
const extractDomain = (value?: string | null) => {
  if (!value) return null;
  const atIndex = value.lastIndexOf("@");
  if (atIndex === -1) return null;
  return value.slice(atIndex + 1).trim().toLowerCase();
};
const RESEND_ALLOWED_DOMAINS = (
  process.env.RESEND_ALLOWED_DOMAINS || extractDomain(DEFAULT_FROM_EMAIL) || ""
)
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);
const HAS_DOMAIN_ALLOWLIST = RESEND_ALLOWED_DOMAINS.length > 0;
const isAllowedSender = (email?: string | null) => {
  if (!email) return false;
  if (!HAS_DOMAIN_ALLOWLIST) return true;
  const domain = extractDomain(email);
  return domain ? RESEND_ALLOWED_DOMAINS.includes(domain) : false;
};
export const resolveFromEmail = (candidate?: string | null) => {
  const trimmed = candidate?.trim();
  if (trimmed && isAllowedSender(trimmed)) return trimmed;
  if (DEFAULT_FROM_EMAIL && isAllowedSender(DEFAULT_FROM_EMAIL)) {
    return DEFAULT_FROM_EMAIL;
  }
  if (RESEND_ALLOWED_DOMAINS.length > 0) {
    return `noreply@${RESEND_ALLOWED_DOMAINS[0]}`;
  }
  return trimmed || DEFAULT_FROM_EMAIL || null;
};

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const ADMIN_EMAIL_DOMAIN =
  process.env.ADMIN_EMAIL_DOMAIN || "usemomentos.xyz";
export const ADMIN_SESSION_TTL_DAYS = Number(
  process.env.ADMIN_SESSION_TTL_DAYS || 7
);
export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_CSRF_COOKIE = "admin_csrf";
export const ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
export const ADMIN_INVITE_TTL_HOURS = Number(
  process.env.ADMIN_INVITE_TTL_HOURS || 24
);
export const ADMIN_INVITE_FROM_EMAIL =
  process.env.ADMIN_INVITE_FROM_EMAIL || "admin@mail.usemomentos.xyz";
export const ADMIN_INVITE_FROM_NAME =
  process.env.ADMIN_INVITE_FROM_NAME || "MomentOS Admin";

const LOCALHOST_HOSTNAME = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const isLocalAppUrl = (value?: string | null) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return LOCALHOST_HOSTNAME.test(parsed.hostname);
  } catch {
    return true;
  }
};

const resolvePublicAppUrl = (primary?: string | null, fallback?: string | null) => {
  const trimmedPrimary = primary?.trim() || "";
  const trimmedFallback = fallback?.trim() || "";

  if (trimmedPrimary) {
    if (process.env.NODE_ENV === "production" && isLocalAppUrl(trimmedPrimary)) {
      console.warn(
        `[config] APP_URL points to a local origin in production: ${trimmedPrimary}`
      );
    }
    return trimmedPrimary;
  }

  if (trimmedFallback) {
    if (process.env.NODE_ENV === "production" && isLocalAppUrl(trimmedFallback)) {
      console.warn(
        `[config] FRONTEND_URL points to a local origin in production: ${trimmedFallback}`
      );
    }
    return trimmedFallback;
  }

  return process.env.NODE_ENV === "production"
    ? "https://usemomentos.xyz"
    : "http://localhost:5173";
};

export const ADMIN_APP_URL = resolvePublicAppUrl(
  process.env.ADMIN_APP_URL,
  process.env.FRONTEND_URL
);
export const APP_URL = resolvePublicAppUrl(
  process.env.APP_URL,
  process.env.FRONTEND_URL
);
export const VERIFY_LINK_TTL_MINUTES = Number(
  process.env.VERIFY_LINK_TTL_MINUTES || 60
);

export function getUserErrorMessage(
  error: any,
  fallback = "Something went wrong. Please try again."
) {
  const issues = error?.errors || error?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const details = issues
      .map((issue: any) =>
        issue?.message
          ? `${issue.path?.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`
          : null
      )
      .filter(Boolean)
      .join(", ");
    if (details) return `Validation failed: ${details}`;
  }

  const message = error?.message;
  if (message && typeof message === "string") {
    const lower = message.toLowerCase();
    if (message.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(message);
        if (Array.isArray(parsed)) {
          const details = parsed
            .map((issue: any) =>
              issue?.message
                ? `${issue.path?.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`
                : null
            )
            .filter(Boolean)
            .join(", ");
          if (details) return `Validation failed: ${details}`;
        }
      } catch {
        // fall through
      }
    }
    if (lower.includes("resend_api_key") || lower.includes("sender email not configured")) {
      return "Email sending is not configured. Please contact support.";
    }
    if (
      lower.includes("not authorized") ||
      lower.includes("unauthorized") ||
      lower.includes("forbidden")
    ) {
      return "We couldn't send the email from the configured sender. Please contact support.";
    }
    if (lower.includes("email send error") || lower.includes("email service error")) {
      return "We couldn't send the email right now. Please try again later.";
    }
    if (lower.includes("login failed")) {
      return "Invalid email or password.";
    }
    if (lower.includes("prisma")) return fallback;
    if (lower.includes("unique constraint")) {
      return "That already exists. Try a different value.";
    }
    if (lower.includes("invalid")) return message;
    if (lower.includes("not found")) return message;
    if (lower.includes("required")) return message;
  }
  return fallback;
}

export type AdminRoleType = "SUPER_ADMIN" | "SUPPORT";

const adminSessionCache = new Map<
  string,
  { adminId: string; adminRole: AdminRoleType; expiresAt: number; sessionExpiresAt?: Date }
>();

export const adminUserCache = new Map<
  string,
  { expiresAt: number; admin: { id: string; email: string; role: AdminRoleType } }
>();

const adminCacheStore = new Map<
  string,
  { expiresAt: number; status: number; body: unknown }
>();

export const adminCache = (ttlSeconds: number) => {
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

export function clearAdminCache() {
  adminCacheStore.clear();
}

export function generateOtpCode() {
  return randomInt(0, 1000000).toString().padStart(6, "0");
}

export function interpolateTemplate(
  template: string,
  variables: Record<string, string>
) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

export function getOrgDateTime(timezone?: string) {
  const zone = timezone || "UTC";
  const orgNow = DateTime.now().setZone(zone);
  if (!orgNow.isValid) {
    return DateTime.now().setZone("UTC");
  }
  return orgNow;
}

export function getNextBirthdayOccurrence(birthday: Date, reference: DateTime) {
  const base = DateTime.fromJSDate(birthday, { zone: reference.zone });
  let next = base.set({ year: reference.year });

  if (next < reference.startOf("day")) {
    next = next.plus({ years: 1 });
  }

  return next;
}

async function createAndSendOtp(params: {
  email: string;
  userId?: string;
  purpose: OtpPurpose;
  organization?: { name?: string | null; emailFromAddress?: string | null };
  asyncSend?: boolean;
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

  const fromEmail = resolveFromEmail(DEFAULT_FROM_EMAIL);
  const fromName = DEFAULT_FROM_NAME || "MomentOS";

  if (!fromEmail) {
    throw new Error("DEFAULT_FROM_EMAIL is not configured");
  }

  const { subject, text, html } = otpTemplate({
    code,
    ttlMinutes: OTP_TTL_MINUTES,
    purpose: params.purpose === OtpPurpose.REGISTER_VERIFY ? "VERIFY" : "RESET",
  });

  const sendPromise = EmailService.send({
    to: params.email,
    subject,
    text,
    html,
    from: {
      name: fromName,
      email: fromEmail,
    },
  });

  if (params.asyncSend) {
    void sendPromise.catch((error: any) => {
      console.error("OTP email async send failed:", {
        email: params.email,
        purpose: params.purpose,
        error: error?.message || error,
      });
    });
    return { code };
  }

  await sendPromise;

  return { code };
}

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

export const otpService = { createAndSendOtp, verifyOtpCode };

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createAdminSession(
  adminId: string,
  adminRole: AdminRoleType,
  req: Request,
  res: Response
) {
  const sessionToken = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(sessionToken);
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

  const host = String(req.headers.host || "").toLowerCase();
  const isLocalHost =
    host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");
  // Use SameSite=None; Secure for any non-local host regardless of NODE_ENV.
  // SameSite=Lax cookies are not sent on cross-origin requests (e.g. Vercel →
  // Railway), so relying on NODE_ENV meant missing cookies in deployments where
  // NODE_ENV wasn't explicitly set to "production".
  const secureCookie = !isLocalHost;

  res.cookie(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: secureCookie ? "none" : "lax",
    secure: secureCookie,
    maxAge: ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: secureCookie ? "none" : "lax",
    secure: secureCookie,
    maxAge: ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  return {
    sessionToken,
    csrfToken,
  };
}

export function reissueAdminCsrfCookie(req: Request, res: Response): string {
  const csrfToken = randomBytes(24).toString("hex");
  const host = String(req.headers.host || "").toLowerCase();
  const isLocalHost =
    host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");
  const secureCookie = !isLocalHost;
  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: secureCookie ? "none" : "lax",
    secure: secureCookie,
    maxAge: ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
  return csrfToken;
}

export async function revokeAdminSession(token?: string) {
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

export async function logAdminAction(params: {
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

export async function createAdminInvite(params: {
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

export interface AuthRequest extends Request {
  userId?: string;
  organizationId?: string;
  userRole?: UserRole;
}

export interface AdminAuthRequest extends Request {
  adminId?: string;
  adminRole?: AdminRoleType;
  sessionExpiresAt?: Date;
}

export async function authenticate(
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
      userRole?: UserRole;
    };
    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    req.userRole = decoded.userRole;

    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function authenticateAdmin(
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const headerToken = req.headers["x-admin-session"];
    const token =
      req.cookies?.[ADMIN_SESSION_COOKIE] ||
      (typeof headerToken === "string" ? headerToken : undefined);
    if (!token) {
      return res.status(401).json({ error: "Admin authentication required" });
    }

    const tokenHash = hashToken(token);
    const cached = adminSessionCache.get(tokenHash);
    if (cached && cached.expiresAt > Date.now()) {
      req.adminId = cached.adminId;
      req.adminRole = cached.adminRole;
      req.sessionExpiresAt = cached.sessionExpiresAt;
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
    req.sessionExpiresAt = session.expiresAt;
    adminSessionCache.set(tokenHash, {
      adminId: session.adminId,
      adminRole: session.admin.role as AdminRoleType,
      expiresAt: Math.min(Date.now() + 15_000, session.expiresAt.getTime()),
      sessionExpiresAt: session.expiresAt,
    });
    next();
  } catch (err) {
    res.status(401).json({ error: "Admin session invalid" });
  }
}

export function requireSuperAdmin(req: AdminAuthRequest, res: Response) {
  if (req.adminRole !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Super admin access required" });
    return false;
  }
  return true;
}

export { OtpPurpose };
