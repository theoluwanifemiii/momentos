import { Express, Response } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../serverContext";
import { aiEnabled, generateTemplateDraft } from "../services/ai";

export function registerAiRoutes(app: Express) {
  app.post(
    "/api/ai/template-draft",
    authenticate,
    async (req: AuthRequest, res: Response) => {
      const schema = z.object({
        message: z.string().min(5, "Message is required"),
      });

      try {
        if (!aiEnabled()) {
          return res.status(503).json({ error: "AI is not configured" });
        }

        const { message } = schema.parse(req.body);
        const draft = await generateTemplateDraft(message);

        if (!draft) {
          return res.status(500).json({ error: "AI draft generation failed" });
        }

        return res.json({
          subject: draft.subject,
          content: draft.content,
          type: "PLAIN_TEXT",
        });
      } catch (error: any) {
        return res.status(400).json({ error: error.message });
      }
    }
  );
}
