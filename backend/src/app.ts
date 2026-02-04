import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { registerAuthRoutes } from "./routes/auth";
import { registerPeopleRoutes } from "./routes/People";
import { registerSettingsRoutes } from "./routes/Settings";
import { registerTemplatesRoutes } from "./routes/Templates";
import { registerOnboardingRoutes } from "./routes/Onboarding";
import { registerInternalAdminRoutes } from "./routes/InternalAdmin";
import { registerAdminDashboardRoutes } from "./routes/AdminDashboard";
import { registerAiRoutes } from "./routes/AI";

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

registerAuthRoutes(app);
registerPeopleRoutes(app);
registerSettingsRoutes(app);
registerTemplatesRoutes(app);
registerOnboardingRoutes(app);
registerInternalAdminRoutes(app);
registerAdminDashboardRoutes(app);
registerAiRoutes(app);

export default app;
