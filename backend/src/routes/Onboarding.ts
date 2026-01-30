import { Express, Response } from "express";
import { z } from "zod";
import { computeOnboardingState, markOnboardingStep } from "../services/onboarding";
import { authenticate, AuthRequest, getUserErrorMessage, prisma } from "../serverContext";

export function registerOnboardingRoutes(app: Express) {
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
      res.status(500).json({ error: getUserErrorMessage(err) });
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
      res.status(400).json({ error: getUserErrorMessage(err) });
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
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// ============================================================================
// START SERVER
// ============================================================================

// ============================================================================
}
