import { Express, Response } from "express";
import { z } from "zod";
import {
  authenticate,
  AuthRequest,
  DEFAULT_FROM_NAME,
  getUserErrorMessage,
  interpolateTemplate,
  MOMENT_FROM_EMAIL,
  prisma,
  resolveFromEmail,
} from "../serverContext";
import { EmailService } from "../services/emailService";

const campaignSchema = z.object({
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().optional(),
  recipients: z
    .array(
      z.object({
        firstName: z.string().trim().min(1).max(100),
        email: z.string().trim().email(),
      })
    )
    .min(1)
    .max(1000),
});

export function registerCampaignRoutes(app: Express) {
  app.post(
    "/api/campaigns/send",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = campaignSchema.parse(req.body);
        const senderEmail = resolveFromEmail(
          MOMENT_FROM_EMAIL
        );
        const senderName = process.env.MOMENT_FROM_NAME || DEFAULT_FROM_NAME || "MomentOS";
        const sender = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { email: true, role: true },
        });

        if (sender?.role !== "ADMIN") {
          return res.status(403).json({ error: "Organization admin access required" });
        }
        if (!senderEmail || !sender.email) {
          return res.status(500).json({ error: "Campaign sender is not configured" });
        }

        const results = [];
        for (const recipient of data.recipients) {
          const variables = { first_name: recipient.firstName };
          const subject = interpolateTemplate(data.subject, variables);
          const text = interpolateTemplate(data.text, variables);
          const html = data.html ? interpolateTemplate(data.html, variables) : undefined;
          const result = await EmailService.send({
            to: recipient.email,
            subject,
            text,
            html,
            from: { name: senderName, email: senderEmail },
            replyTo: sender.email,
          });
          results.push({ email: recipient.email, id: result.id });
        }

        return res.status(202).json({ sent: results.length, results });
      } catch (err: any) {
        return res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );
}
