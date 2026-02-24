# System Readiness Audit

Date: 2026-02-12  
Repository: `momentos`

## 1) Context used for this audit

Provided:

- Expected users in first 3 months: `1,000`
- Expected users by end of Year 1: `100,000`
- App type: `SaaS`
- User model: `B2B2C`
- Sensitive data: `all` (PII + financial + payment + health + children + biometric + location implied)
- Compliance: `Not sure`
- Geography: `Africa`
- DevOps expertise: `none`
- Launch timeline: `ASAP (weeks)`

Missing inputs (assumed unknown): peak concurrency, requests/day, uptime target, team size, infra budget, exact feature set commitments.

## 2) Tier classification

- Current launch posture (next weeks): **Tier 1 to early Tier 2**
- Year-1 target (100k users): **Tier 3**

Current codebase has solid product functionality, but core platform controls are incomplete for Tier 2/3 readiness.

## 3) Executive verdict

For an ASAP launch, this system is **not ready** without security and operational hardening.

If “sensitive data = all” is literal, this system is **not compliant-ready** for PCI/HIPAA/COPPA class workloads and should **not** process those data classes yet.

## 4) What is already in place

- Password hashing with bcrypt: `backend/src/routes/auth.ts:471`, `backend/src/routes/auth.ts:690`
- JWT auth middleware for user APIs: `backend/src/serverContext.ts:453`
- Admin session model + auth middleware: `backend/src/serverContext.ts:478`
- Input validation with Zod across routes: `backend/src/routes/auth.ts:428`, `backend/src/middleware/validation.ts:6`
- Prisma relational constraints and unique keys: `backend/prisma/schema.prisma:56`, `backend/prisma/schema.prisma:145`, `backend/prisma/schema.prisma:231`, `backend/prisma/schema.prisma:242`
- Request body size limit: `backend/src/app.ts:22`
- Security middleware (`helmet`) and HTTP request logging (`morgan`): `backend/src/app.ts:19`, `backend/src/app.ts:23`
- Frontend CSP/HSTS/X-Frame-Options headers in Vercel config: `frontend/vercel.json:10`, `frontend/vercel.json:22`
- Scheduler dedupe/run lock mechanics: `worker/scheduler.ts:760`, `worker/scheduler.ts:775`
- Admin audit log persistence: `backend/src/serverContext.ts:402`

## 5) Critical gaps (P0: block launch until fixed)

1. Overly permissive CORS with credentials enabled  
Evidence: `backend/src/app.ts:20` uses `cors({ origin: true, credentials: true })`.  
Risk: any origin can be reflected and allowed for credentialed cross-site requests.

2. CSRF exposure on admin auth path  
Evidence:
- Admin auth accepts cookie token: `backend/src/serverContext.ts:486`
- Admin cookie set to `SameSite=None` in production: `backend/src/serverContext.ts:382`
- Frontend sends credentialed admin requests: `frontend/src/api.ts:128`, `frontend/src/api.ts:131`  
Risk: cross-site request attacks against admin endpoints.

3. No rate limiting/brute-force protection for auth endpoints  
Evidence:
- Login endpoints are public: `backend/src/routes/auth.ts:426`, `backend/src/routes/auth.ts:88`
- No rate-limit middleware found in app pipeline (`backend/src/app.ts:19-23`)  
Risk: credential stuffing and password brute-force.

4. Secrets handling model is unsafe in frontend env conventions  
Evidence: frontend env contains secret-style keys (`VITE_RESEND_API_KEY`, `VITE_JWT_SECRET`) at `frontend/.env:2`, `frontend/.env:3`.  
Risk: anything under `VITE_*` is client-exposed by design.

5. No production observability baseline  
Evidence: no tracing/metrics/error tracking integration; logs are console-based (`backend/src/app.ts:23`, `backend/src/services/emailService.ts:41`, `worker/scheduler.ts:842`).  
Risk: slow incident detection and poor root-cause analysis.

## 6) High-priority gaps (P1: next 2-6 weeks)

1. Minimal automated test coverage  
Evidence: only onboarding tests present (`backend/tests/onboarding.test.ts:1`); no frontend/worker suites.

2. No CI/CD pipeline in repository  
Evidence: no `.github/workflows/*` present.

3. Token/session hardening gaps  
Evidence:
- User JWT is fixed 7-day token without refresh rotation: `backend/src/routes/auth.ts:503`
- No global session invalidation for user JWTs.

4. Missing resilience patterns around external providers  
Evidence:
- Email/SMS/WhatsApp provider calls do not implement backoff/circuit breaking.
- Failures are logged but retries are not systematic for all flows (`backend/src/services/emailService.ts:29`, `worker/whatsappService.ts:48`).

5. No formal backup/restore and disaster-recovery controls in code/config  
Evidence: no documented automated backup/restore workflow in repo.

## 7) Scale gaps for 100k users (P2: quarter roadmap)

1. Single-process sequential scheduler likely to bottleneck  
Evidence:
- Cron runs every minute in one process: `worker/scheduler.ts:867`
- Iterates all organizations sequentially: `worker/scheduler.ts:855`
- Loads full org data including all people on each due run: `worker/scheduler.ts:733`

2. Lack of queue-based async architecture for send pipeline  
Current model is direct in-process dispatch; no distributed queue for horizontal scaling.

3. No SLO/SLA instrumentation or alert thresholds  
No service-level metrics, latency/error dashboards, or alerting policies in repo.

4. No advanced protections expected at this tier  
Missing WAF/DDoS controls, incident runbooks, and formal change management.

## 8) Compliance impact assessment (given “sensitive data: all”)

Current implementation is not prepared for:

- PCI DSS (payment card handling)
- HIPAA (health data handling)
- COPPA (children under 13 data)

No evidence of required controls such as segmented card-data environments, BAAs/audit controls for HIPAA, or child-data parental consent workflows.

Recommendation: for launch, narrow scope to **PII only** and explicitly defer payment/health/children data until compliance architecture is implemented.

## 9) 30-day execution plan (minimum viable hardening)

Week 1:

1. Restrict CORS to explicit allowlist (`APP_URL`, admin origin), remove `origin: true`.
2. Enforce CSRF strategy for admin endpoints:
   - Prefer header token auth only, or
   - Keep cookie auth with CSRF token + strict origin checks.
3. Add rate limiting on `/api/auth/login`, `/api/auth/password/*`, `/api/internal/admin/auth/*`.
4. Remove secret-like `VITE_*` env usage from frontend and rotate exposed keys.

Week 2:

1. Add centralized error tracking (Sentry or equivalent) for backend + worker.
2. Add uptime checks and alerting for backend and worker.
3. Add auth and critical-route integration tests (register/login/verify/send/manual send/admin auth).

Week 3-4:

1. Add CI workflow for build + tests + migration checks.
2. Introduce provider retry policy (bounded retries + exponential backoff + timeout).
3. Create backup/restore runbook and test restore in staging.

## 10) 90-day path toward 100k readiness

1. Introduce queue-backed delivery execution (Redis/BullMQ or managed queue).
2. Split scheduler trigger from delivery workers for horizontal scaling.
3. Add metrics for queue depth, send latency, failure rate, and per-channel throughput.
4. Add incident response playbook and on-call alert routing.
5. Capacity test on representative org/people volumes.

## 11) Category snapshot

- Authentication: **Partial** (good baseline, missing hardening and anti-abuse)
- Authorization: **Partial** (tenant scoping + admin roles exist, needs stricter boundary tests)
- Data integrity/validation: **Good** (Prisma constraints + Zod)
- Security: **At risk** (CORS/CSRF/rate limit gaps)
- Resilience: **Partial** (basic error handling, weak retry/timeout patterns)
- Observability: **Weak**
- Testing/CI: **Weak**
- Scalability: **Early-stage only**
- Compliance: **Not ready for “all sensitive data”**

