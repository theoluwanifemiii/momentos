import { Express, Response } from "express";
import { computeOnboardingState } from "../services/onboarding";
import { SettingsUpdateSchema, validateUpdate } from "../middleware/validation";
import { authenticate, AuthRequest, getUserErrorMessage, prisma } from "../serverContext";

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

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({ organization: org, onboarding });
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

      res.json({ organization: org });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  }
);
// ============================================================================
}
