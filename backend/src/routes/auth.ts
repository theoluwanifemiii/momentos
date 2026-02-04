import { Express, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";
import { createHash } from "crypto";
import { EmailService } from "../services/emailService";
import {
  waitlistWelcomeTemplate,
  welcomeTemplate,
} from "../services/internalEmailTemplates";
import {
  ADMIN_BOOTSTRAP_TOKEN,
  ADMIN_EMAIL_DOMAIN,
  ADMIN_SESSION_COOKIE,
  AdminAuthRequest,
  AdminRoleType,
  JWT_SECRET,
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
  getUserErrorMessage,
  otpService,
  prisma,
  revokeAdminSession,
  OtpPurpose,
  logAdminAction,
} from "../serverContext";

export function registerAuthRoutes(app: Express) {
  app.post("/api/internal/admin/auth/login", async (req: Request, res: Response) => {
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

      const sessionToken = await createAdminSession(
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
        sessionToken,
      });
    } catch (err: any) {
      res
        .status(400)
        .json({ error: getUserErrorMessage(err, "Admin login failed") });
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

      const normalizedEmail = data.email.trim().toLowerCase();
      safeEmail = normalizedEmail;

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const org = await prisma.organization.create({
        data: {
          name: data.organizationName,
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

      await otpService.createAndSendOtp({
        email: user.email,
        userId: user.id,
        purpose: OtpPurpose.REGISTER_VERIFY,
        organization: {
          name: org.name,
          emailFromAddress: org.emailFromAddress,
        },
        asyncSend: true,
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
      res
        .status(400)
        .json({ error: getUserErrorMessage(err, "Registration failed") });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
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
      console.error("Login error:", err);
      res.status(500).json({ error: getUserErrorMessage(err, "Login failed") });
    }
  });

  app.post("/api/auth/verify/send", async (req: Request, res: Response) => {
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
        await otpService.createAndSendOtp({
          email: user.email,
          userId: user.id,
          purpose: OtpPurpose.REGISTER_VERIFY,
          organization: user.organization,
          asyncSend: true,
        });
      }

      res.json({
        success: true,
        message: "If the account exists, a code was sent.",
      });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  });

  app.post("/api/auth/verify", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        code: z.string().min(4),
      });

      const { email, code } = schema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.emailVerifiedAt) {
        return res.json({ success: true, message: "Account already verified" });
      }

      const result = await otpService.verifyOtpCode({
        email: normalizedEmail,
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
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  });

  app.post("/api/auth/password/forgot", async (req: Request, res: Response) => {
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

      if (user) {
        await otpService.createAndSendOtp({
          email: user.email,
          userId: user.id,
          purpose: OtpPurpose.PASSWORD_RESET,
          organization: user.organization,
          asyncSend: true,
        });
      }

      res.json({
        success: true,
        message: "If the account exists, a code was sent.",
      });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  });

  app.post("/api/auth/password/reset", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        code: z.string().min(4),
        password: z.string().min(8),
      });

      const { email, code, password } = schema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const result = await otpService.verifyOtpCode({
        email: normalizedEmail,
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
      res
        .status(400)
        .json({ error: getUserErrorMessage(err, "Waitlist signup failed") });
    }
  });
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
