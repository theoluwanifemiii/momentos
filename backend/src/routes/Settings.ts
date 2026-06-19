import { Express, Response } from "express";
import { SettingsUpdateSchema, validateUpdate } from "../middleware/validation";
import { authenticate, AuthRequest, getUserErrorMessage, prisma } from "../serverContext";
import posthog from "../lib/posthog";

export function registerSettingsRoutes(app: Express) {
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

      res.json({ organization: org });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
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

      posthog.capture({
        distinctId: req.userId!,
        event: "settings_updated",
        properties: {
          organization_id: req.organizationId,
          updated_fields: Object.keys(safeData),
        },
      });

      res.json({ organization: org });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  }
);
// ============================================================================
}
