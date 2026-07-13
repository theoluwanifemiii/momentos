import { Express, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";
import { createHash, randomBytes } from "crypto";
import { EmailService } from "../services/emailService";
import { createRateLimiter } from "../middleware/security";
import posthog from "../lib/posthog";
import {
  authMagicLinkTemplate,
  resetPasswordLinkTemplate,
  verifyEmailLinkTemplate,
  waitlistWelcomeTemplate,
  welcomeTemplate,
} from "../services/internalEmailTemplates";
import {
  APP_URL,
  ADMIN_APP_URL,
  ADMIN_BOOTSTRAP_TOKEN,
  ADMIN_CSRF_COOKIE,
  ADMIN_EMAIL_DOMAIN,
  ADMIN_SESSION_COOKIE,
  AdminAuthRequest,
  AdminRoleType,
  DEFAULT_FROM_EMAIL,
  DEFAULT_FROM_NAME,
  JWT_SECRET,
  VERIFY_LINK_TTL_MINUTES,
  WELCOME_FROM_EMAIL,
  WELCOME_FROM_NAME,
  WELCOME_REPLY_TO,
  WAITLIST_FROM_EMAIL,
  WAITLIST_FROM_NAME,
  WAITLIST_REPLY_TO,
  adminCache,
  adminUserCache,
  authenticateAdmin,
  createAdminSession,
  reissueAdminCsrfCookie,
  getUserErrorMessage,
  OtpPurpose,
  prisma,
  resolveFromEmail,
  revokeAdminSession,
  logAdminAction,
} from "../serverContext";

const buildAppUrl = (path: string) => {
  const base = APP_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const buildAdminUrl = (path: string) => {
  const base = (ADMIN_APP_URL || APP_URL).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const PASSWORD_RESET_LINK_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_LINK_TTL_MINUTES || 30
);
const MAGIC_AUTH_LINK_TTL_MINUTES = Number(
  process.env.MAGIC_AUTH_LINK_TTL_MINUTES || 20
);

const derivePersonalWorkspaceName = (email: string) => {
  const localPart = email.split("@")[0] || "";
  const cleanedLocalPart = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedLocalPart) {
    return "Personal Workspace";
  }

  const titleCased = cleanedLocalPart
    .split(" ")
    .filter(Boolean)
    .map(
      (segment) =>
        `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`
    )
    .join(" ");

  return `${titleCased}'s Workspace`;
};

const sendVerificationLink = async (params: {
  user: { id: string; email: string; organizationId: string };
}) => {
  const token = jwt.sign(
    {
      userId: params.user.id,
      email: params.user.email,
      purpose: "REGISTER_VERIFY",
    },
    JWT_SECRET,
    { expiresIn: `${VERIFY_LINK_TTL_MINUTES}m` }
  );

  const verifyUrl = `${buildAppUrl("/verify")}?token=${encodeURIComponent(token)}`;
  const fromEmail = resolveFromEmail(DEFAULT_FROM_EMAIL);
  const fromName = DEFAULT_FROM_NAME || "MomentOS";

  if (!fromEmail) {
    throw new Error("DEFAULT_FROM_EMAIL is not configured");
  }

  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + VERIFY_LINK_TTL_MINUTES * 60 * 1000);
  const now = new Date();

  // Invalidate earlier links so only the latest link can be used.
  await prisma.otp.updateMany({
    where: {
      email: params.user.email,
      userId: params.user.id,
      purpose: OtpPurpose.REGISTER_VERIFY,
      consumedAt: null,
    },
    data: { consumedAt: now },
  });

  await prisma.otp.create({
    data: {
      email: params.user.email,
      userId: params.user.id,
      purpose: OtpPurpose.REGISTER_VERIFY,
      codeHash: tokenHash,
      expiresAt,
      maxAttempts: 1,
    },
  });

  const { subject, text, html } = verifyEmailLinkTemplate({
    verifyUrl,
    ttlMinutes: VERIFY_LINK_TTL_MINUTES,
  });

  await EmailService.send({
    to: params.user.email,
    subject,
    text,
    html,
    from: {
      name: fromName,
      email: fromEmail,
    },
  });
};

const passwordResetFingerprint = (passwordHash: string | null) =>
  hashToken(passwordHash || "__NO_PASSWORD_SET__");

const sendPasswordResetLink = async (params: {
  user: { id: string; email: string; passwordHash: string | null };
}) => {
  const token = jwt.sign(
    {
      userId: params.user.id,
      email: params.user.email,
      purpose: "PASSWORD_RESET_LINK",
      fingerprint: passwordResetFingerprint(params.user.passwordHash),
    },
    JWT_SECRET,
    { expiresIn: `${PASSWORD_RESET_LINK_TTL_MINUTES}m` }
  );

  const resetUrl = `${buildAppUrl("/reset")}?token=${encodeURIComponent(token)}`;
  const fromEmail = resolveFromEmail(DEFAULT_FROM_EMAIL);
  const fromName = DEFAULT_FROM_NAME || "MomentOS";

  if (!fromEmail) {
    throw new Error("DEFAULT_FROM_EMAIL is not configured");
  }

  const { subject, text, html } = resetPasswordLinkTemplate({
    resetUrl,
    ttlMinutes: PASSWORD_RESET_LINK_TTL_MINUTES,
  });

  await EmailService.send({
    to: params.user.email,
    subject,
    text,
    html,
    from: {
      name: fromName,
      email: fromEmail,
    },
  });
};

const sendAuthMagicLink = async (params: {
  user: { id: string; email: string };
  mode: "LOGIN" | "REGISTER";
}) => {
  const token = jwt.sign(
    {
      userId: params.user.id,
      email: params.user.email,
      purpose: "AUTH_MAGIC_LINK",
      mode: params.mode,
    },
    JWT_SECRET,
    { expiresIn: `${MAGIC_AUTH_LINK_TTL_MINUTES}m` }
  );

  const authUrl = `${buildAppUrl("/app")}?token=${encodeURIComponent(token)}`;
  const fromEmail = resolveFromEmail(DEFAULT_FROM_EMAIL);
  const fromName = DEFAULT_FROM_NAME || "MomentOS";

  if (!fromEmail) {
    throw new Error("DEFAULT_FROM_EMAIL is not configured");
  }

  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_AUTH_LINK_TTL_MINUTES * 60 * 1000);
  const now = new Date();

  // Keep only the latest unconsumed auth link per user/email.
  await prisma.otp.updateMany({
    where: {
      email: params.user.email,
      userId: params.user.id,
      purpose: OtpPurpose.AUTH_MAGIC_LINK,
      consumedAt: null,
    },
    data: { consumedAt: now },
  });

  await prisma.otp.create({
    data: {
      email: params.user.email,
      userId: params.user.id,
      purpose: OtpPurpose.AUTH_MAGIC_LINK,
      codeHash: tokenHash,
      expiresAt,
      maxAttempts: 1,
    },
  });

  const { subject, text, html } = authMagicLinkTemplate({
    authUrl,
    ttlMinutes: MAGIC_AUTH_LINK_TTL_MINUTES,
    mode: params.mode,
  });

  await EmailService.send({
    to: params.user.email,
    subject,
    text,
    html,
    from: {
      name: fromName,
      email: fromEmail,
    },
  });
};

const authLoginRateLimit = createRateLimiter({
  keyPrefix: "auth-login",
  windowMs: 10 * 60 * 1000,
  max: 5,
});

const authRegisterRateLimit = createRateLimiter({
  keyPrefix: "auth-register",
  windowMs: 10 * 60 * 1000,
  max: 5,
});

const authVerifyRateLimit = createRateLimiter({
  keyPrefix: "auth-verify",
  windowMs: 10 * 60 * 1000,
  max: 6,
});

const authForgotPasswordRateLimit = createRateLimiter({
  keyPrefix: "auth-forgot",
  windowMs: 10 * 60 * 1000,
  max: 5,
});

const authResetPasswordRateLimit = createRateLimiter({
  keyPrefix: "auth-reset",
  windowMs: 10 * 60 * 1000,
  max: 10,
});

const authMagicRequestRateLimit = createRateLimiter({
  keyPrefix: "auth-magic-request",
  windowMs: 10 * 60 * 1000,
  max: 8,
});

const authMagicVerifyRateLimit = createRateLimiter({
  keyPrefix: "auth-magic-verify",
  windowMs: 10 * 60 * 1000,
  max: 12,
});

const adminAuthRateLimit = createRateLimiter({
  keyPrefix: "admin-auth",
  windowMs: 10 * 60 * 1000,
  max: 5,
});

const adminBootstrapRateLimit = createRateLimiter({
  keyPrefix: "admin-bootstrap",
  windowMs: 10 * 60 * 1000,
  max: 3,
});

export function registerAuthRoutes(app: Express) {
  app.post(
    "/api/internal/admin/auth/login",
    adminAuthRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        });

        const data = schema.parse(req.body);
        const normalizedEmail = data.email.trim().toLowerCase();

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

        const session = await createAdminSession(
          admin.id,
          admin.role as AdminRoleType,
          req,
          res
        );

        res.json({
          admin: {
            id: admin.id,
            email: admin.email,
            role: admin.role,
          },
          sessionToken: session.sessionToken,
          csrfToken: session.csrfToken,
        });
      } catch (err: any) {
        res
          .status(400)
          .json({ error: getUserErrorMessage(err, "Admin login failed") });
      }
    }
  );

  app.post(
    "/api/internal/admin/auth/bootstrap",
    adminBootstrapRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          email: z.string().email(),
          password: z.string().min(8),
          role: z.enum(["SUPER_ADMIN", "SUPPORT"]).default("SUPER_ADMIN"),
          token: z.string().optional(),
        });

        const data = schema.parse(req.body);
        const normalizedEmail = data.email.trim().toLowerCase();

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
        res
          .status(400)
          .json({ error: getUserErrorMessage(err, "Admin bootstrap failed") });
      }
    }
  );

  app.post(
    "/api/internal/admin/auth/register",
    adminAuthRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          email: z.string().email(),
          password: z.string().min(8),
          token: z.string().min(16),
        });

        const data = schema.parse(req.body);
        const normalizedEmail = data.email.trim().toLowerCase();

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
        res
          .status(400)
          .json({ error: getUserErrorMessage(err, "Admin signup failed") });
      }
    }
  );

  app.post(
    "/api/internal/admin/auth/logout",
    authenticateAdmin,
    async (req: AdminAuthRequest, res: Response) => {
      try {
        const headerToken = req.headers["x-admin-session"];
        const token =
          req.cookies?.[ADMIN_SESSION_COOKIE] ||
          (typeof headerToken === "string" ? headerToken : undefined);
        await revokeAdminSession(token);
        res.clearCookie(ADMIN_SESSION_COOKIE);
        res.clearCookie(ADMIN_CSRF_COOKIE);
        res.json({ success: true });
      } catch (err: any) {
        res
          .status(500)
          .json({ error: getUserErrorMessage(err, "Logout failed") });
      }
    }
  );

  app.get(
    "/api/internal/admin/auth/me",
    authenticateAdmin,
    adminCache(10),
    async (req: AdminAuthRequest, res: Response) => {
      const csrfToken =
        req.cookies?.[ADMIN_CSRF_COOKIE] || reissueAdminCsrfCookie(req, res);

      const cached = adminUserCache.get(req.adminId!);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json({
          admin: cached.admin,
          csrfToken,
        });
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

      res.json({
        admin: payload,
        csrfToken,
      });
    }
  );

  // ── Admin forgot / reset password ─────────────────────────────────────────
  const adminForgotPasswordRateLimit = createRateLimiter({
    keyPrefix: "admin-forgot",
    windowMs: 15 * 60 * 1000,
    max: 5,
  });

  const adminResetPasswordRateLimit = createRateLimiter({
    keyPrefix: "admin-reset",
    windowMs: 15 * 60 * 1000,
    max: 5,
  });

  app.post(
    "/api/internal/admin/auth/forgot-password",
    adminForgotPasswordRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({ email: z.string().trim().email() });
        const { email } = schema.parse(req.body);
        const normalizedEmail = email.toLowerCase();

        const admin = await prisma.adminUser.findUnique({
          where: { email: normalizedEmail },
        });

        // Always respond the same way to avoid email enumeration
        if (admin && admin.isActive) {
          const token = jwt.sign(
            {
              adminId: admin.id,
              email: admin.email,
              purpose: "ADMIN_PASSWORD_RESET",
              fingerprint: hashToken(admin.passwordHash || "__NO_PASSWORD__"),
            },
            JWT_SECRET,
            { expiresIn: "30m" }
          );

          const resetUrl = `${buildAdminUrl("/admin/login")}?token=${encodeURIComponent(token)}`;
          const fromEmail = resolveFromEmail(DEFAULT_FROM_EMAIL);
          const fromName = DEFAULT_FROM_NAME || "MomentOS";

          if (fromEmail) {
            await EmailService.send({
              to: admin.email,
              subject: "MomentOS Admin — Reset your password",
              text: `You requested a password reset for your MomentOS Admin account.\n\nClick the link below to set a new password (valid for 30 minutes):\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
              html: `<p>You requested a password reset for your <strong>MomentOS Admin</strong> account.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>`,
              from: { name: fromName, email: fromEmail },
            });
          }
        }

        res.json({ success: true, message: "If the account exists, a reset link was sent." });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.post(
    "/api/internal/admin/auth/reset-password",
    adminResetPasswordRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          token: z.string().min(20),
          password: z.string().min(8),
        });

        const { token, password } = schema.parse(req.body);

        let payload: { adminId: string; email: string; purpose: string; fingerprint: string };
        try {
          payload = jwt.verify(token, JWT_SECRET) as typeof payload;
        } catch {
          return res.status(400).json({ error: "Reset link is invalid or expired." });
        }

        if (payload.purpose !== "ADMIN_PASSWORD_RESET") {
          return res.status(400).json({ error: "Reset link is invalid." });
        }

        const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminId } });
        if (!admin || !admin.isActive) {
          return res.status(404).json({ error: "Admin account not found." });
        }

        if (admin.email.toLowerCase() !== payload.email.toLowerCase()) {
          return res.status(400).json({ error: "Reset link is invalid." });
        }

        const expectedFingerprint = hashToken(admin.passwordHash || "__NO_PASSWORD__");
        if (payload.fingerprint !== expectedFingerprint) {
          return res.status(400).json({ error: "Reset link has already been used." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash } });

        // Revoke all active sessions for this admin
        await prisma.adminSession.updateMany({
          where: { adminId: admin.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        res.json({ success: true });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );
  // ── End admin forgot / reset password ─────────────────────────────────────

  app.post(
    "/api/auth/magic/request",
    authMagicRequestRateLimit,
    async (req: Request, res: Response) => {
      let parsedInput:
        | {
          email: string;
          mode: "LOGIN" | "REGISTER";
          accountType?: "ORGANIZATION" | "INDIVIDUAL";
          organizationName?: string;
          timezone?: string;
        }
        | undefined;
      try {
        const schema = z.object({
          email: z.string().trim().email(),
          mode: z.enum(["LOGIN", "REGISTER"]).default("LOGIN"),
          accountType: z.enum(["ORGANIZATION", "INDIVIDUAL"]).optional(),
          organizationName: z.string().trim().optional(),
          timezone: z.string().default("UTC").optional(),
        });

        const data = schema.parse(req.body);
        parsedInput = data;
        const normalizedEmail = data.email.toLowerCase();

        if (data.mode === "LOGIN") {
          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (user && !user.isDisabled) {
            await sendAuthMagicLink({
              user: { id: user.id, email: user.email },
              mode: "LOGIN",
            });
          }

          return res.json({
            success: true,
            message: "If the account exists, a sign-in link was sent.",
          });
        }

        const existing = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (existing) {
          if (existing.isDisabled) {
            return res.status(403).json({ error: "User account disabled" });
          }

          await sendAuthMagicLink({
            user: { id: existing.id, email: existing.email },
            mode: existing.emailVerifiedAt ? "LOGIN" : "REGISTER",
          });

          return res.json({
            success: true,
            message: "Account already exists. A sign-in link was sent.",
          });
        }

        const accountType = data.accountType || "INDIVIDUAL";
        const submittedOrganizationName = data.organizationName?.trim() || "";

        if (accountType === "ORGANIZATION" && !submittedOrganizationName) {
          return res
            .status(400)
            .json({ error: "Organization name is required for organization accounts." });
        }

        const resolvedOrganizationName =
          submittedOrganizationName || derivePersonalWorkspaceName(normalizedEmail);
        const generatedPassword = randomBytes(24).toString("hex");
        const passwordHash = await bcrypt.hash(generatedPassword, 10);

        const org = await prisma.organization.create({
          data: {
            name: resolvedOrganizationName,
            timezone: data.timezone || "UTC",
            users: {
              create: {
                email: normalizedEmail,
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
        await sendAuthMagicLink({
          user: { id: user.id, email: user.email },
          mode: "REGISTER",
        });

        posthog.capture({
          distinctId: user.id,
          event: "magic_link_requested",
          properties: {
            mode: "REGISTER",
            account_type: accountType,
            organization_id: org.id,
            $set: { email: user.email, organization_id: org.id },
          },
        });

        return res.json({
          success: true,
          message: "Sign-up link sent. Check your email to continue.",
        });
      } catch (err: any) {
        const safeEmail = parsedInput?.email?.toLowerCase?.() || "";
        console.error("Magic link request failed:", {
          mode: parsedInput?.mode,
          email: safeEmail || undefined,
          error:
            err?.message ||
            err?.code ||
            (typeof err === "string" ? err : "unknown"),
        });

        if (err instanceof ZodError) {
          return res.status(400).json({
            error: getUserErrorMessage(err, "Invalid sign-in request."),
          });
        }

        const rawMessage = `${err?.message || ""}`.toLowerCase();
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          return res.status(409).json({
            error: "Email already registered. Use sign in instead.",
          });
        }

        if (
          rawMessage.includes("resend") ||
          rawMessage.includes("email_service_error") ||
          rawMessage.includes("sender") ||
          rawMessage.includes("from address") ||
          rawMessage.includes("from email") ||
          rawMessage.includes("domain not verified") ||
          rawMessage.includes("forbidden") ||
          rawMessage.includes("unauthorized") ||
          rawMessage.includes("api_key") ||
          rawMessage.includes("api key")
        ) {
          return res.status(503).json({
            error:
              "We couldn't send your sign-in email right now. Please try again shortly.",
          });
        }

        if (
          rawMessage.includes("prisma") ||
          rawMessage.includes("database") ||
          rawMessage.includes("p1001") ||
          rawMessage.includes("can't reach database")
        ) {
          return res.status(503).json({
            error: "Authentication is temporarily unavailable. Please try again shortly.",
          });
        }

        return res.status(500).json({
          error:
            "We couldn't process your sign-in link request right now. Please try again shortly.",
        });
      }
    }
  );

  app.post(
    "/api/auth/magic/verify",
    authMagicVerifyRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          token: z.string().min(20),
        });

        const { token } = schema.parse(req.body);
        let payload: {
          userId: string;
          email: string;
          purpose?: string;
          mode?: "LOGIN" | "REGISTER";
        };
        try {
          payload = jwt.verify(token, JWT_SECRET) as {
            userId: string;
            email: string;
            purpose?: string;
            mode?: "LOGIN" | "REGISTER";
          };
        } catch {
          return res
            .status(400)
            .json({ error: "Magic link is invalid or expired." });
        }

        if (payload.purpose !== "AUTH_MAGIC_LINK") {
          return res.status(400).json({ error: "Magic link is invalid." });
        }

        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          include: { organization: true },
        });

        if (!user) {
          return res.status(400).json({ error: "Magic link is invalid." });
        }

        if (user.email.toLowerCase() !== payload.email.toLowerCase()) {
          return res.status(400).json({ error: "Magic link is invalid." });
        }

        if (user.isDisabled) {
          return res.status(403).json({ error: "User account disabled" });
        }

        const tokenHash = hashToken(token);
        const magicLinkRecord = await prisma.otp.findFirst({
          where: {
            email: user.email,
            userId: user.id,
            purpose: OtpPurpose.AUTH_MAGIC_LINK,
            codeHash: tokenHash,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!magicLinkRecord) {
          return res
            .status(400)
            .json({ error: "Magic link is invalid or expired." });
        }

        const consumeResult = await prisma.otp.updateMany({
          where: { id: magicLinkRecord.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });

        if (consumeResult.count === 0) {
          return res
            .status(400)
            .json({ error: "Magic link is invalid or expired." });
        }

        const firstVerifiedLogin = !user.emailVerifiedAt;
        if (firstVerifiedLogin) {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerifiedAt: new Date() },
          });
        }

        if (!user.organization) {
          return res
            .status(400)
            .json({ error: "Organization not found for this account." });
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        if (firstVerifiedLogin) {
          const welcomeFromEmail = resolveFromEmail(
            user.organization.emailFromAddress || WELCOME_FROM_EMAIL
          );

          if (welcomeFromEmail) {
            const recipientName = user.email.split("@")[0];
            const { subject, html, text } = welcomeTemplate({
              organizationName: user.organization.name || "MomentOS",
              recipientName,
            });

            void EmailService.send({
              to: user.email,
              subject,
              html,
              text,
              from: {
                name: WELCOME_FROM_NAME,
                email: welcomeFromEmail,
              },
              replyTo: WELCOME_REPLY_TO,
            }).catch((error: any) => {
              console.error("Welcome email send failed on magic auth verify:", {
                userId: user.id,
                email: user.email,
                error: error?.message || error,
              });
            });
          }
        }

        const sessionToken = jwt.sign(
          {
            userId: user.id,
            organizationId: user.organizationId,
            userRole: user.role,
          },
          JWT_SECRET,
          { expiresIn: "7d" }
        );

        posthog.identify({
          distinctId: user.id,
          properties: {
            email: user.email,
            organization_id: user.organizationId,
            role: user.role,
          },
        });
        posthog.capture({
          distinctId: user.id,
          event: firstVerifiedLogin ? "user_registered" : "magic_link_verified",
          properties: {
            organization_id: user.organizationId,
            first_login: firstVerifiedLogin,
          },
        });

        return res.json({
          token: sessionToken,
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
        res
          .status(400)
          .json({ error: getUserErrorMessage(err, "Magic link verification failed") });
      }
    }
  );

  app.post("/api/auth/register", authRegisterRateLimit, async (req: Request, res: Response) => {
    const requestId = req.headers["x-request-id"]?.toString();
    let safeEmail: string | undefined;

    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        accountType: z.enum(["ORGANIZATION", "INDIVIDUAL"]).default("ORGANIZATION"),
        organizationName: z.string().trim().optional(),
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

      const normalizedEmail = data.email.trim().toLowerCase();
      safeEmail = normalizedEmail;
      const submittedOrganizationName = data.organizationName?.trim() || "";

      if (data.accountType === "ORGANIZATION" && !submittedOrganizationName) {
        return res
          .status(400)
          .json({ error: "Organization name is required for organization accounts." });
      }

      const resolvedOrganizationName =
        submittedOrganizationName || derivePersonalWorkspaceName(normalizedEmail);

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const org = await prisma.organization.create({
        data: {
          name: resolvedOrganizationName,
          timezone: data.timezone,
          users: {
            create: {
              email: normalizedEmail,
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

      await sendVerificationLink({ user });

      console.log("Register outcome:", {
        email: safeEmail,
        organizationId: org.id,
        accountType: data.accountType,
        requestId,
        outcome: "success",
      });

      posthog.identify({
        distinctId: user.id,
        properties: {
          email: user.email,
          organization_id: org.id,
          role: user.role,
        },
      });
      posthog.capture({
        distinctId: user.id,
        event: "user_registered",
        properties: {
          account_type: data.accountType,
          organization_id: org.id,
          requires_verification: true,
          auth_method: "password",
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
          accountType: data.accountType,
        },
        requiresVerification: true,
        message: "Verification link sent to your email.",
      });
    } catch (err: any) {
      console.error("Register outcome:", {
        email: safeEmail,
        organizationId: undefined,
        requestId,
        outcome: "failed",
      });
      res
        .status(400)
        .json({ error: getUserErrorMessage(err, "Registration failed") });
    }
  });

  app.post("/api/auth/login", authLoginRateLimit, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string(),
      });

      let data;
      try {
        data = schema.parse(req.body);
      } catch (err: any) {
        if (err instanceof ZodError) {
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
      const normalizedEmail = data.email.trim().toLowerCase();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { organization: true },
      });

      if (!user) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      if (user.isDisabled) {
        return res.status(403).json({ error: "User account disabled" });
      }

      if (!user.passwordHash) {
        return res.status(400).json({
          error: "Account has no password set. Please reset your password.",
        });
      }

      let valid = false;
      try {
        valid = await bcrypt.compare(data.password, user.passwordHash);
      } catch {
        return res.status(400).json({
          error: "We couldn't verify your password. Please reset it and try again.",
        });
      }

      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      if (!user.emailVerifiedAt) {
        return res
          .status(403)
          .json({ error: "Email not verified", requiresVerification: true });
      }

      prisma.user
        .update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })
        .catch((error) => {
          console.error("Failed to update lastLoginAt:", error);
        });

      if (!user.organization) {
        return res
          .status(400)
          .json({ error: "Organization not found for this account." });
      }

      const token = jwt.sign(
        {
          userId: user.id,
          organizationId: user.organizationId,
          userRole: user.role,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      posthog.identify({
        distinctId: user.id,
        properties: {
          email: user.email,
          organization_id: user.organizationId,
          role: user.role,
        },
      });
      posthog.capture({
        distinctId: user.id,
        event: "user_logged_in",
        properties: {
          organization_id: user.organizationId,
          auth_method: "password",
        },
      });

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
      console.error("Login error:", err);
      res.status(500).json({ error: getUserErrorMessage(err, "Login failed") });
    }
  });

  app.post("/api/auth/verify/send", authVerifyRateLimit, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
      });

      const { email } = schema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { organization: true },
      });

      if (user && !user.emailVerifiedAt) {
        await sendVerificationLink({ user });
      }

      res.json({
        success: true,
        message: "If the account exists, a verification link was sent.",
      });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  });

  app.post("/api/auth/verify", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        token: z.string().min(20),
      });

      const { token } = schema.parse(req.body);
      let payload: { userId: string; email: string; purpose?: string };
      try {
        payload = jwt.verify(token, JWT_SECRET) as {
          userId: string;
          email: string;
          purpose?: string;
        };
      } catch {
        return res
          .status(400)
          .json({ error: "Verification link is invalid or expired" });
      }

      if (payload.purpose !== "REGISTER_VERIFY") {
        return res.status(400).json({ error: "Verification link is invalid" });
      }

      const user = await prisma.user.findUnique({ where: { id: payload.userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.email.toLowerCase() !== payload.email.toLowerCase()) {
        return res.status(400).json({ error: "Verification link is invalid" });
      }

      const tokenHash = hashToken(token);
      const verifyLinkRecord = await prisma.otp.findFirst({
        where: {
          email: user.email,
          userId: user.id,
          purpose: OtpPurpose.REGISTER_VERIFY,
          codeHash: tokenHash,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!verifyLinkRecord) {
        return res
          .status(400)
          .json({ error: "Verification link is invalid or expired" });
      }

      const consumeResult = await prisma.otp.updateMany({
        where: { id: verifyLinkRecord.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      if (consumeResult.count === 0) {
        return res
          .status(400)
          .json({ error: "Verification link is invalid or expired" });
      }

      if (user.emailVerifiedAt) {
        return res.json({ success: true, message: "Account already verified" });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });

      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
      });

      const welcomeFromEmail = resolveFromEmail(
        org?.emailFromAddress || WELCOME_FROM_EMAIL
      );
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

      posthog.capture({
        distinctId: user.id,
        event: "email_verified",
        properties: { organization_id: user.organizationId },
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  });

  app.post(
    "/api/auth/password/forgot",
    authForgotPasswordRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          email: z.string().trim().email(),
        });

        const { email } = schema.parse(req.body);
        const normalizedEmail = email.toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (user) {
          await sendPasswordResetLink({ user });
        }

        res.json({
          success: true,
          message: "If the account exists, a reset link was sent.",
        });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    });

  app.post(
    "/api/auth/password/reset",
    authResetPasswordRateLimit,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          token: z.string().min(20),
          password: z.string().min(8),
        });

        const { token, password } = schema.parse(req.body);
        let payload: {
          userId: string;
          email: string;
          purpose?: string;
          fingerprint?: string;
        };
        try {
          payload = jwt.verify(token, JWT_SECRET) as {
            userId: string;
            email: string;
            purpose?: string;
            fingerprint?: string;
          };
        } catch {
          return res.status(400).json({ error: "Reset link is invalid or expired" });
        }

        if (payload.purpose !== "PASSWORD_RESET_LINK") {
          return res.status(400).json({ error: "Reset link is invalid" });
        }

        const user = await prisma.user.findUnique({ where: { id: payload.userId } });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        if (user.email.toLowerCase() !== payload.email.toLowerCase()) {
          return res.status(400).json({ error: "Reset link is invalid" });
        }

        if (
          payload.fingerprint &&
          payload.fingerprint !== passwordResetFingerprint(user.passwordHash)
        ) {
          return res.status(400).json({ error: "Reset link has already been used" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash },
        });

        posthog.capture({
          distinctId: user.id,
          event: "password_reset",
          properties: { email: user.email },
        });

        res.json({ success: true });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    });

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
      const waitlistFromEmail = resolveFromEmail(WAITLIST_FROM_EMAIL);
      if (!waitlistFromEmail) {
        return res
          .status(400)
          .json({ error: "Sender email not configured" });
      }

      await EmailService.send({
        to: data.email.toLowerCase(),
        subject,
        text,
        html,
        from: {
          name: WAITLIST_FROM_NAME,
          email: waitlistFromEmail,
        },
        replyTo: WAITLIST_REPLY_TO,
      });

      posthog.capture({
        distinctId: data.email.toLowerCase(),
        event: "waitlist_signup",
        properties: {
          email: data.email.toLowerCase(),
          organization: data.organization,
          role: data.role || null,
          team_size: data.teamSize || null,
          country: data.country || null,
        },
      });

      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return res.status(409).json({ error: "Email already on waitlist" });
        }
      }
      res
        .status(400)
        .json({ error: getUserErrorMessage(err, "Waitlist signup failed") });
    }
  });
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
