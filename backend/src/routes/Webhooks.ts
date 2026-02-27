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

  const sentTokens = ["sent", "accepted", "queued", "pending", "submitted"];
  if (sentTokens.some((token) => value.includes(token))) {
    return DeliveryStatus.SENT;
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

const parseWebhookPayload = (body: unknown): Record<string, unknown> => {
  if (body && typeof body === "object") {
    return body as Record<string, unknown>;
  }

  if (typeof body !== "string") {
    return {};
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fallback to URL-encoded parsing below.
  }

  const params = new URLSearchParams(trimmed);
  if ([...params.keys()].length === 0) {
    return {};
  }

  const payload: Record<string, unknown> = {};
  params.forEach((value, key) => {
    payload[key] = value;
  });
  return payload;
};

export function registerWebhookRoutes(app: Express) {
  // ============================================================================
  // WEBHOOK ROUTES (provider callbacks)
  // ============================================================================
  const handleTermiiSmsWebhook = async (req: Request, res: Response) => {
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

      const payload = parseWebhookPayload(req.body);

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
        console.warn("Termii SMS webhook ignored unknown status:", {
          externalId,
          providerStatus,
          payload,
        });
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
        console.warn("Termii SMS webhook delivery log not found:", {
          externalId,
          providerStatus,
        });
        return res.status(202).json({ ignored: true, reason: "Delivery log not found" });
      }

      if (
        log.status === DeliveryStatus.DELIVERED &&
        (mappedStatus === DeliveryStatus.FAILED || mappedStatus === DeliveryStatus.SENT)
      ) {
        return res.status(200).json({ ok: true, ignored: true, reason: "Already delivered" });
      }

      const now = new Date();
      await prisma.deliveryLog.update({
        where: { id: log.id },
        data: {
          status: mappedStatus,
          sentAt:
            mappedStatus === DeliveryStatus.SENT ||
            mappedStatus === DeliveryStatus.DELIVERED
              ? log.sentAt || now
              : log.sentAt,
          deliveredAt:
            mappedStatus === DeliveryStatus.DELIVERED ? now : log.deliveredAt,
          errorMessage:
            mappedStatus === DeliveryStatus.FAILED
              ? failureReason || `Provider status: ${providerStatus || "failed"}`
              : log.errorMessage,
        },
      });

      return res.json({ ok: true, status: mappedStatus });
    } catch (error) {
      console.error("Termii SMS webhook error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  };

  // Primary endpoint.
  app.post("/api/webhooks/termii/sms", handleTermiiSmsWebhook);
  // Compatibility alias for deployments/proxies configured without /api prefix.
  app.post("/webhooks/termii/sms", handleTermiiSmsWebhook);
  // ============================================================================
}
