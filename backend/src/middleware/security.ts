import { NextFunction, Request, Response } from "express";

type RateLimiterOptions = {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const normalizeOrigin = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return null;
  }
};

const splitOriginEntries = (value?: string) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const addOriginWithVariants = (origin: string, target: Set<string>) => {
  target.add(origin);
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const labels = host.split(".");
    if (LOCALHOST_ORIGIN.test(origin)) {
      return;
    }

    if (labels.length === 2 && !host.startsWith("www.")) {
      parsed.hostname = `www.${host}`;
      target.add(`${parsed.protocol}//${parsed.host}`.toLowerCase());
      return;
    }

    if (labels.length === 3 && host.startsWith("www.")) {
      parsed.hostname = host.slice(4);
      target.add(`${parsed.protocol}//${parsed.host}`.toLowerCase());
    }
  } catch {
    // Ignore malformed URLs here; caller already normalized.
  }
};

export const buildAllowedOrigins = () => {
  const envOrigins = [
    ...splitOriginEntries(process.env.APP_URL),
    ...splitOriginEntries(process.env.FRONTEND_URL),
    ...splitOriginEntries(process.env.ADMIN_APP_URL),
    ...splitOriginEntries(process.env.CORS_ALLOWLIST),
  ];

  const raw =
    process.env.NODE_ENV === "production"
      ? [...envOrigins, ...DEFAULT_PRODUCTION_ORIGINS]
      : envOrigins;

  const normalized = new Set<string>();
  for (const value of raw) {
    const origin = normalizeOrigin(value);
    if (origin) {
      addOriginWithVariants(origin, normalized);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    normalized.add("http://localhost:5173");
    normalized.add("http://127.0.0.1:5173");
    normalized.add("http://localhost:4173");
    normalized.add("http://127.0.0.1:4173");
    normalized.add("http://localhost:3000");
    normalized.add("http://127.0.0.1:3000");
    normalized.add("https://www.usemomentos.xyz");
    normalized.add("https://usemomentos.xyz");
  }

  return normalized;
};

export const isTrustedOrigin = (
  origin: string | undefined,
  allowlist: Set<string>
) => {
  if (!origin) {
    return false;
  }
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }
  if (allowlist.has(normalized)) {
    return true;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    LOCALHOST_ORIGIN.test(normalized)
  ) {
    return true;
  }
  return false;
};

export const createRateLimiter = (options: RateLimiterOptions) => {
  const buckets = new Map<string, RateLimitBucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const baseKey = options.keyGenerator
      ? options.keyGenerator(req)
      : `${req.ip}:${req.path}`;
    const key = options.keyPrefix ? `${options.keyPrefix}:${baseKey}` : baseKey;
    const existing = buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (existing.count >= options.max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      );
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(429).json({
        error:
          options.message ||
          "Too many requests. Please wait before trying again.",
      });
    }

    existing.count += 1;
    return next();
  };
};

export const createAdminCsrfProtection = (options: {
  allowlist: Set<string>;
  cookieName: string;
}) => {
  const csrfBypassPaths = new Set([
    "/api/internal/admin/auth/login",
    "/api/internal/admin/auth/register",
    "/api/internal/admin/auth/bootstrap",
  ]);
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/internal/admin")) {
      return next();
    }

    if (safeMethods.has(req.method.toUpperCase())) {
      return next();
    }

    const origin = req.headers.origin;
    if (origin && !isTrustedOrigin(origin, options.allowlist)) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    if (csrfBypassPaths.has(req.path)) {
      return next();
    }

    const headerToken = req.headers["x-admin-csrf"];
    const csrfHeader = typeof headerToken === "string" ? headerToken : "";
    const csrfCookie = req.cookies?.[options.cookieName];

    if (
      !csrfHeader ||
      !csrfCookie ||
      csrfHeader.length < 16 ||
      csrfHeader !== csrfCookie
    ) {
      return res.status(403).json({ error: "CSRF validation failed" });
    }

    return next();
  };
};
