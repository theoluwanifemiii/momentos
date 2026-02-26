import { Express, Response } from "express";
import { FeedbackType } from "@prisma/client";
import { z } from "zod";
import {
  authenticate,
  AuthRequest,
  DEFAULT_FROM_EMAIL,
  DEFAULT_FROM_NAME,
  WAITLIST_FROM_EMAIL,
  WAITLIST_REPLY_TO,
  getUserErrorMessage,
  prisma,
  resolveFromEmail,
} from "../serverContext";
import { EmailService } from "../services/emailService";

const FEEDBACK_TO_EMAIL =
  process.env.FEEDBACK_TO_EMAIL || WAITLIST_REPLY_TO || "founder@usemomentos.xyz";
const FEEDBACK_FROM_EMAIL =
  process.env.FEEDBACK_FROM_EMAIL || WAITLIST_FROM_EMAIL || DEFAULT_FROM_EMAIL;
const FEEDBACK_FROM_NAME =
  process.env.FEEDBACK_FROM_NAME || DEFAULT_FROM_NAME || "MomentOS Feedback";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const submitFeedbackSchema = z.object({
  type: z.nativeEnum(FeedbackType),
  subject: z.string().trim().min(3).max(120).optional(),
  message: z.string().trim().min(10).max(4000),
  pagePath: z.string().trim().max(300).optional(),
});

export function registerFeedbackRoutes(app: Express) {
  app.post("/api/feedback", authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const data = submitFeedbackSchema.parse(req.body);
      let emailNotificationSent = false;
      let emailNotificationError: string | null = null;

      const feedback = await prisma.feedbackEntry.create({
        data: {
          organizationId: req.organizationId!,
          userId: req.userId || null,
          type: data.type,
          subject: data.subject || null,
          message: data.message,
          pagePath: data.pagePath || null,
        },
        select: {
          id: true,
          type: true,
          createdAt: true,
        },
      });

      const [organization, user] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: req.organizationId! },
          select: { id: true, name: true },
        }),
        req.userId
          ? prisma.user.findUnique({
              where: { id: req.userId },
              select: { id: true, email: true },
            })
          : Promise.resolve(null),
      ]);

      const typeLabel =
        data.type === "BUG_REPORT"
          ? "Bug Report"
          : data.type === "FEATURE_REQUEST"
            ? "Feature Request"
            : "Suggestion";
      const safeTypeLabel = escapeHtml(typeLabel);
      const safeSubject = data.subject ? escapeHtml(data.subject) : "";
      const safeOrgName = escapeHtml(organization?.name || "Unknown");
      const safeOrgId = escapeHtml(organization?.id || req.organizationId || "N/A");
      const safeUserEmail = escapeHtml(user?.email || "Unknown");
      const safeUserId = escapeHtml(user?.id || req.userId || "N/A");
      const safePagePath = escapeHtml(data.pagePath || "N/A");
      const safeMessage = escapeHtml(data.message);

      const feedbackSubject = `[MomentOS Feedback] ${typeLabel}${organization?.name ? ` - ${organization.name}` : ""}`;
      const feedbackText = [
        `Type: ${typeLabel}`,
        data.subject ? `Subject: ${data.subject}` : null,
        `Organization: ${organization?.name || "Unknown"} (${organization?.id || req.organizationId || "N/A"})`,
        `User: ${user?.email || "Unknown"} (${user?.id || req.userId || "N/A"})`,
        `Page: ${data.pagePath || "N/A"}`,
        "",
        data.message,
      ]
        .filter(Boolean)
        .join("\n");

      const founderFromEmail = resolveFromEmail(FEEDBACK_FROM_EMAIL);
      const toEmail = FEEDBACK_TO_EMAIL.trim();
      const ccEmail =
        user?.email && user.email.toLowerCase() !== toEmail.toLowerCase()
          ? user.email
          : undefined;
      if (founderFromEmail && toEmail.includes("@")) {
        try {
          await EmailService.send({
            to: toEmail,
            cc: ccEmail,
            subject: feedbackSubject,
            text: feedbackText,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.5;">
              <h2 style="margin:0 0 12px;">New Feedback Submission</h2>
              <p><strong>Type:</strong> ${safeTypeLabel}</p>
              ${data.subject ? `<p><strong>Subject:</strong> ${safeSubject}</p>` : ""}
              <p><strong>Organization:</strong> ${safeOrgName} (${safeOrgId})</p>
              <p><strong>User:</strong> ${safeUserEmail} (${safeUserId})</p>
              <p><strong>Page:</strong> ${safePagePath}</p>
              <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0;" />
              <p style="white-space:pre-wrap;">${safeMessage}</p>
            </div>`,
            from: {
              name: FEEDBACK_FROM_NAME,
              email: founderFromEmail,
            },
            replyTo: user?.email || undefined,
          });
          emailNotificationSent = true;
        } catch (emailError: any) {
          emailNotificationError = emailError?.message || "Failed to send feedback notification email.";
          console.error("Feedback email notification failed:", emailNotificationError);
        }
      } else {
        emailNotificationError =
          "Feedback email config invalid: sender or recipient is not configured.";
      }

      return res.status(201).json({
        success: true,
        feedback,
        emailNotification: {
          sent: emailNotificationSent,
          error: emailNotificationError,
        },
      });
    } catch (err: any) {
      return res.status(400).json({ error: getUserErrorMessage(err) });
    }
  });
}
