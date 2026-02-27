import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { ADMIN_CSRF_COOKIE } from "./serverContext";
import {
  buildAllowedOrigins,
  createAdminCsrfProtection,
  isTrustedOrigin,
} from "./middleware/security";
import { registerAuthRoutes } from "./routes/auth";
import { registerPeopleRoutes } from "./routes/People";
import { registerSettingsRoutes } from "./routes/Settings";
import { registerTemplatesRoutes } from "./routes/Templates";
import { registerOnboardingRoutes } from "./routes/Onboarding";
import { registerInternalAdminRoutes } from "./routes/InternalAdmin";
import { registerAdminDashboardRoutes } from "./routes/AdminDashboard";
import { registerAiRoutes } from "./routes/AI";
import { registerMomentsRoutes } from "./routes/Moments";
import { registerWebhookRoutes } from "./routes/Webhooks";
import { registerFeedbackRoutes } from "./routes/Feedback";

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = buildAllowedOrigins();
if (process.env.NODE_ENV === "production") {
  const hasNonLocalOrigin = [...allowedOrigins].some(
    (origin) =>
      !origin.includes("localhost") &&
      !origin.includes("127.0.0.1") &&
      !origin.includes("[::1]")
  );
  if (!hasNonLocalOrigin) {
    console.warn(
      "[security] No non-local allowed origins detected. Set APP_URL/FRONTEND_URL/CORS_ALLOWLIST for production."
    );
  }
}
const corsDelegate: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  const requestOrigin = req.headers.origin;
  const isAdminRoute = req.path.startsWith("/api/internal/admin");
  const hasHttpsOrigin =
    typeof requestOrigin === "string" &&
    requestOrigin.toLowerCase().startsWith("https://");
  const shouldAllowOrigin =
    isTrustedOrigin(requestOrigin, allowedOrigins) ||
    (!isAdminRoute && process.env.NODE_ENV === "production" && hasHttpsOrigin);

  if (shouldAllowOrigin) {
    return callback(null, {
      origin: requestOrigin,
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-Id",
        "X-Admin-Session",
        "X-Admin-CSRF",
      ],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    });
  }

  return callback(null, {
    origin: false,
    credentials: true,
  });
};

app.use(helmet());
app.use(cors(corsDelegate));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(
  createAdminCsrfProtection({
    allowlist: allowedOrigins,
    cookieName: ADMIN_CSRF_COOKIE,
  })
);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

registerAuthRoutes(app);
registerPeopleRoutes(app);
registerSettingsRoutes(app);
registerTemplatesRoutes(app);
registerMomentsRoutes(app);
registerOnboardingRoutes(app);
registerInternalAdminRoutes(app);
registerAdminDashboardRoutes(app);
registerAiRoutes(app);
registerWebhookRoutes(app);
registerFeedbackRoutes(app);

export default app;
