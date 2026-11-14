import { Express, Response } from "express";
import { z } from "zod";
import {
  authenticate,
  AuthRequest,
  getUserErrorMessage,
  prisma,
} from "../serverContext";
import { CAMPAIGN_TEMPLATE_STARTERS } from "../services/campaignTemplateStarters";
import { UserRole } from "@prisma/client";

// Campaign-only email designs. Separate from /api/templates because those rows
// are shared with Moments; see the CampaignTemplate model comment.

const upsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(200).nullable().optional(),
  content: z.string().min(1).max(200_000),
});

const requireOrgAdmin = (req: AuthRequest, res: Response, next: () => void) => {
  if (req.userRole !== UserRole.ADMIN) {
    return res.status(403).json({ error: "Organization admin access required" });
  }
  next();
};

/**
 * Seeds the starter designs the first time an organization asks for its list.
 * Done lazily so no backfill is needed for organizations that already exist.
 */
const ensureStarters = async (organizationId: string) => {
  const existing = await prisma.campaignTemplate.count({
    where: { organizationId },
  });
  if (existing > 0) return;

  await prisma.campaignTemplate.createMany({
    data: CAMPAIGN_TEMPLATE_STARTERS.map((starter) => ({
      organizationId,
      name: starter.name,
      subject: starter.subject,
      content: starter.content,
      isSystem: true,
    })),
  });
};

const serialize = (template: {
  id: string;
  name: string;
  subject: string | null;
  content: string;
  isSystem: boolean;
}) => ({
  id: template.id,
  name: template.name,
  subject: template.subject,
  content: template.content,
  isSystem: template.isSystem,
});

export function registerCampaignTemplateRoutes(app: Express) {
  app.get(
    "/api/campaign-templates",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      try {
        await ensureStarters(req.organizationId!);
        const templates = await prisma.campaignTemplate.findMany({
          where: { organizationId: req.organizationId!, isActive: true },
          orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
        });
        res.json({ campaignTemplates: templates.map(serialize) });
      } catch (err: any) {
        res.status(500).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.post(
    "/api/campaign-templates",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = upsertSchema.parse(req.body);
        const template = await prisma.campaignTemplate.create({
          data: {
            organizationId: req.organizationId!,
            name: data.name,
            subject: data.subject ?? null,
            content: data.content,
          },
        });
        res.status(201).json({ campaignTemplate: serialize(template) });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.patch(
    "/api/campaign-templates/:id",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = upsertSchema.partial().parse(req.body);
        const existing = await prisma.campaignTemplate.findFirst({
          where: { id: req.params.id, organizationId: req.organizationId! },
        });
        if (!existing) {
          return res.status(404).json({ error: "Campaign template not found." });
        }
        if (existing.isSystem) {
          return res.status(400).json({
            error:
              "Starter designs cannot be edited. Duplicate it first, then edit the copy.",
          });
        }

        const template = await prisma.campaignTemplate.update({
          where: { id: existing.id },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.subject !== undefined && { subject: data.subject }),
            ...(data.content !== undefined && { content: data.content }),
          },
        });
        res.json({ campaignTemplate: serialize(template) });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );

  app.delete(
    "/api/campaign-templates/:id",
    authenticate,
    requireOrgAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await prisma.campaignTemplate.findFirst({
          where: { id: req.params.id, organizationId: req.organizationId! },
        });
        if (!existing) {
          return res.status(404).json({ error: "Campaign template not found." });
        }
        if (existing.isSystem) {
          return res
            .status(400)
            .json({ error: "Starter designs cannot be deleted." });
        }

        // Soft delete: campaigns already pointing at it keep sending.
        await prisma.campaignTemplate.update({
          where: { id: existing.id },
          data: { isActive: false },
        });
        res.json({ success: true });
      } catch (err: any) {
        res.status(400).json({ error: getUserErrorMessage(err) });
      }
    }
  );
}
