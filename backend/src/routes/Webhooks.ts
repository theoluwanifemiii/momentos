import { DeliveryChannel, DeliveryStatus } from "@prisma/client";
import { Express, Request, Response } from "express";
import { prisma } from "../serverContext";

const getString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const pickFirstString = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = getString(payload[key]);
    if (value) {
      return value;
    }
  }
  return "";
};

const mapProviderStatus = (rawStatus: string) => {
  const value = rawStatus.trim().toLowerCase();
  if (!value) {
    return null;
  }

  const deliveredTokens = ["delivered", "deliver"];
  if (deliveredTokens.some((token) => value.includes(token))) {
    return DeliveryStatus.DELIVERED;
  }

  const failedTokens = [
    "failed",
    "fail",
    "rejected",
    "undeliver",
    "expired",
    "error",
    "invalid",
  ];
  if (failedTokens.some((token) => value.includes(token))) {
    return DeliveryStatus.FAILED;
  }

  return null;
};

export function registerWebhookRoutes(app: Express) {
  // ============================================================================
  // WEBHOOK ROUTES (provider callbacks)
  // ============================================================================
  app.post("/api/webhooks/termii/sms", async (req: Request, res: Response) => {
    try {
      const expectedToken = (process.env.TERMII_WEBHOOK_TOKEN || "").trim();
      if (expectedToken) {
        const queryToken =
          typeof req.query.token === "string" ? req.query.token.trim() : "";
        const bodyToken = getString(
          (req.body as Record<string, unknown>)?.webhook_token ||
            (req.body as Record<string, unknown>)?.token
        );
        const tokenHeader = req.headers["x-webhook-token"];
        const receivedToken = Array.isArray(tokenHeader)
          ? tokenHeader[0]
          : getString(tokenHeader);
        const providedToken = receivedToken || queryToken || bodyToken;
        if (providedToken !== expectedToken) {
          return res.status(401).json({ error: "Unauthorized webhook" });
        }
      }

      const payload =
        req.body && typeof req.body === "object"
          ? (req.body as Record<string, unknown>)
          : {};

      const externalId = pickFirstString(payload, [
        "message_id",
        "messageId",
        "id",
        "sms_id",
      ]);
      if (!externalId) {
        return res.status(400).json({ error: "Missing message identifier" });
      }

      const providerStatus = pickFirstString(payload, [
        "status",
        "delivery_status",
        "deliveryStatus",
        "message_status",
      ]);
      const mappedStatus = mapProviderStatus(providerStatus);
      if (!mappedStatus) {
        return res.status(202).json({ ignored: true, reason: "Unknown status" });
      }

      const failureReason = pickFirstString(payload, [
        "reason",
        "error",
        "description",
        "remarks",
        "message",
      ]);

      const log = await prisma.deliveryLog.findFirst({
        where: {
          channel: DeliveryChannel.sms,
          externalId,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!log) {
        return res.status(202).json({ ignored: true, reason: "Delivery log not found" });
      }

      if (log.status === DeliveryStatus.DELIVERED && mappedStatus === DeliveryStatus.FAILED) {
        return res.status(200).json({ ok: true, ignored: true, reason: "Already delivered" });
      }

      const now = new Date();
      await prisma.deliveryLog.update({
        where: { id: log.id },
        data: {
          status: mappedStatus,
          sentAt: log.sentAt || now,
          deliveredAt: mappedStatus === DeliveryStatus.DELIVERED ? now : null,
          errorMessage:
            mappedStatus === DeliveryStatus.FAILED
              ? failureReason || `Provider status: ${providerStatus || "failed"}`
              : null,
        },
      });

      return res.json({ ok: true, status: mappedStatus });
    } catch (error) {
      console.error("Termii SMS webhook error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });
  // ============================================================================
}
