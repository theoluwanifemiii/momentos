import { useState } from 'react';

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.8em] text-slate-800">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 px-5 py-4 text-xs leading-relaxed text-slate-100">
      {children}
    </pre>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-slate-600 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Section = { id: string; title: string; content: React.ReactNode };

const sections: Section[] = [
  {
    id: 'architecture',
    title: 'Architecture Overview',
    content: (
      <div className="space-y-5">
        <p>MomentOS is a monorepo split into three independent Node.js packages deployed as separate services.</p>
        <Pre>{`monorepo/
├── backend/    Express API — REST endpoints, auth, business logic
├── frontend/   React SPA — Vite, React Router, Tailwind
└── worker/     Standalone scheduler — cron-style birthday runner`}</Pre>
        <Table
          headers={['Package', 'Runtime', 'Deploy target', 'Entry point']}
          rows={[
            [<Code>backend/</Code>, 'Node 18 / tsx', 'Railway', <Code>src/index.ts</Code>],
            [<Code>frontend/</Code>, 'Browser', 'Vercel', <Code>src/main.tsx</Code>],
            [<Code>worker/</Code>, 'Node 18 / tsx', 'Railway (separate service)', <Code>scheduler.ts</Code>],
          ]}
        />
        <p>The backend and worker share the same PostgreSQL database via Prisma but maintain <strong>separate Prisma clients and schema copies</strong>. Always keep both in sync when adding models.</p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Dual-schema rule:</strong> Adding a model or field to <Code>backend/prisma/schema.prisma</Code> requires the same change in <Code>worker/prisma/schema.prisma</Code> + <Code>npx prisma generate</Code> in both directories.
        </div>
      </div>
    ),
  },
  {
    id: 'local-setup',
    title: 'Local Development Setup',
    content: (
      <div className="space-y-5">
        <h3 className="font-semibold text-slate-900">Prerequisites</h3>
        <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside">
          <li>Node 18+</li>
          <li>PostgreSQL (local or a free Railway/Neon instance)</li>
          <li>A Resend API key (free tier is fine for dev)</li>
        </ul>
        <h3 className="font-semibold text-slate-900">Steps</h3>
        <Pre>{`# 1. Clone and install
git clone <repo-url>
cd momentos

# 2. Copy and fill env files
cp backend/.env.example backend/.env
cp worker/.env.example worker/.env

# 3. Run migrations and generate client
cd backend
npx prisma migrate dev

# 4. Start backend (port 3001 by default)
npm run dev

# 5. Start frontend (separate terminal)
cd ../frontend
npm run dev        # http://localhost:5173

# 6. Start worker (optional — only needed for scheduler testing)
cd ../worker
npm run dev`}</Pre>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          The frontend proxies <Code>/api/*</Code> to <Code>localhost:3001</Code> via Vite's dev server. Check <Code>frontend/vite.config.ts</Code> if you need to change the port.
        </div>
      </div>
    ),
  },
  {
    id: 'env-vars',
    title: 'Environment Variables',
    content: (
      <div className="space-y-6">
        <h3 className="font-semibold text-slate-900">Backend (<Code>backend/.env</Code>)</h3>
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            [<Code>DATABASE_URL</Code>, '✓', 'PostgreSQL connection string'],
            [<Code>JWT_SECRET</Code>, '✓', 'Secret for signing user JWTs (32+ random chars)'],
            [<Code>RESEND_API_KEY</Code>, '✓', 'Resend email provider API key'],
            [<Code>TERMII_API_KEY</Code>, '✓ for SMS', 'Termii SMS provider API key'],
            [<Code>TERMII_SMS_FROM</Code>, '✓ for SMS', 'Termii sender ID'],
            [<Code>TERMII_SMS_CHANNEL</Code>, '', 'dnd / generic / whatsapp (default: generic)'],
            [<Code>OPENAI_API_KEY</Code>, '', 'Used for AI-personalised birthday intros'],
            [<Code>OPENAI_MODEL</Code>, '', 'Model override (default: gpt-4o-mini)'],
            [<Code>PORT</Code>, '', 'HTTP port (default: 3001)'],
            [<Code>FRONTEND_URL</Code>, '', 'CORS allowlist — your Vercel URL'],
            [<Code>APP_URL</Code>, '', 'Canonical API URL (used in email links)'],
            [<Code>DEFAULT_FROM_EMAIL</Code>, '', 'Fallback sender address'],
            [<Code>DEFAULT_FROM_NAME</Code>, '', 'Fallback sender name'],
            [<Code>POSTHOG_API_KEY</Code>, '', 'PostHog analytics (optional)'],
            [<Code>SMS_TEST_MODE</Code>, '', 'Set to "true" to mock SMS sends in dev'],
            [<Code>ADMIN_EMAIL_DOMAIN</Code>, '', 'Domain allowed to register admin accounts'],
            [<Code>ADMIN_BOOTSTRAP_TOKEN</Code>, '', 'One-time token to create first super admin'],
            [<Code>ADMIN_SESSION_TTL_MINUTES</Code>, '', 'Admin session lifetime (default: 20)'],
            [<Code>ENABLE_RATE_LIMITS</Code>, '', '"true" to enable rate limiting outside production'],
          ]}
        />

        <h3 className="font-semibold text-slate-900 pt-2">Worker (<Code>worker/.env</Code>)</h3>
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            [<Code>DATABASE_URL</Code>, '✓', 'Same DB as backend'],
            [<Code>RESEND_API_KEY</Code>, '✓', 'Same as backend'],
            [<Code>TERMII_API_KEY</Code>, '✓ for SMS', 'Same as backend'],
            [<Code>DEFAULT_FROM_EMAIL</Code>, '', 'Fallback sender'],
            [<Code>ALERT_EMAIL</Code>, '', 'Address to notify on scheduler failures'],
            [<Code>ALERT_FROM_EMAIL</Code>, '', 'From address for alert emails'],
            [<Code>FAILURE_ALERT_MIN_COUNT</Code>, '', 'Min failures before alert fires (default: 1)'],
            [<Code>ALERT_COOLDOWN_MINUTES</Code>, '', 'Minutes between repeat alerts (default: 60)'],
            [<Code>SMS_TEST_MODE</Code>, '', '"true" to mock SMS'],
            [<Code>SMOKE_TEST_ORG_ID</Code>, '', 'Org ID used in observability smoke tests'],
          ]}
        />
      </div>
    ),
  },
  {
    id: 'database',
    title: 'Database Schema',
    content: (
      <div className="space-y-5">
        <p>Postgres via Prisma ORM. Migrations live in <Code>backend/prisma/migrations/</Code>.</p>
        <Table
          headers={['Model', 'Key fields', 'Notes']}
          rows={[
            [<Code>Organization</Code>, 'id, name, timezone, birthdaySendHour, emailFromAddress, smsEnabled', 'One per customer account'],
            [<Code>User</Code>, 'id, email, organizationId, role', 'OWNER / MEMBER; auth via JWT'],
            [<Code>Person</Code>, 'id, fullName, email, birthday, phone, optedOut, organizationId', 'Unique on (organizationId, email)'],
            [<Code>Template</Code>, 'id, name, subject, content, type (HTML/PLAIN_TEXT), channels[]', 'Global — shared across orgs'],
            [<Code>OrganizationTemplate</Code>, 'organizationId, templateId, isDefault, isActive', "Junction: org's template assignments"],
            [<Code>DeliveryLog</Code>, 'id, personId, templateId, status, channel, sentAt, errorMessage', 'One row per send attempt'],
            [<Code>SchedulerRun</Code>, 'id, organizationId, runAt, successCount, failureCount', 'Audit trail for worker runs'],
            [<Code>AdminUser</Code>, 'id, email, role (SUPER_ADMIN/SUPPORT)', 'Internal staff — separate from User'],
            [<Code>AdminSession</Code>, 'id, adminId, tokenHash, expiresAt, revokedAt', 'Server-side sessions, 20 min TTL'],
            [<Code>Moment</Code>, 'id, name, scheduledFor, organizationId, templateId', 'Custom one-off events'],
            [<Code>MomentRecipient</Code>, 'momentId, personId', 'Junction: Moment → People'],
            [<Code>SystemErrorLog</Code>, 'id, source, message, organizationId', 'Worker error telemetry'],
          ]}
        />
        <h3 className="font-semibold text-slate-900">Migrations</h3>
        <Pre>{`# Create a new migration
cd backend
npx prisma migrate dev --name describe_your_change

# Deploy migrations in production (runs automatically on Railway start)
npx prisma migrate deploy

# Push schema without a migration file (dev only — use migrate dev instead)
npx prisma db push

# After changing schema, regenerate worker's Prisma client too
cd ../worker
npx prisma generate`}</Pre>
      </div>
    ),
  },
  {
    id: 'api-routes',
    title: 'API Routes',
    content: (
      <div className="space-y-6">
        <h3 className="font-semibold text-slate-900">User auth <span className="text-slate-400 font-normal text-xs ml-1">— no auth header required</span></h3>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['POST', '/api/auth/register', 'Create org + owner account; sends magic link'],
            ['POST', '/api/auth/login', 'Request magic sign-in link'],
            ['POST', '/api/auth/magic/verify', 'Verify magic link token → returns JWT'],
            ['POST', '/api/auth/verify/send', 'Re-send OTP email verification'],
            ['POST', '/api/auth/verify', 'Verify OTP code'],
            ['POST', '/api/auth/password/forgot', 'Send password-reset OTP'],
            ['POST', '/api/auth/password/reset', 'Reset password with OTP'],
            ['POST', '/api/waitlist', 'Join the public waitlist'],
          ]}
        />
        <h3 className="font-semibold text-slate-900 pt-2">People <span className="text-slate-400 font-normal text-xs ml-1">— Bearer JWT required</span></h3>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/api/people', "List org's people"],
            ['POST', '/api/people', 'Add single person'],
            ['PUT', '/api/people/:id', 'Update person'],
            ['DELETE', '/api/people/:id', 'Delete person'],
            ['POST', '/api/people/upload', 'Bulk CSV import'],
            ['GET', '/api/people/export', "Export org's people as CSV"],
            ['GET', '/api/people/sample-csv', 'Download blank sample CSV'],
            ['GET', '/api/people/upcoming', 'Birthdays in next 30 days'],
            ['GET', '/api/people/upcoming-anniversaries', 'Work anniversaries in next 30 days'],
            ['POST', '/api/people/bulk-delete', 'Delete array of person IDs'],
            ['POST', '/api/people/bulk-opt-out', 'Opt in/out array of person IDs'],
            ['POST', '/api/people/:id/send-birthday', 'Manual email send (body: { channel?: "email"|"sms" })'],
            ['POST', '/api/people/:id/send-sms', 'Manual SMS send (legacy route)'],
          ]}
        />
        <h3 className="font-semibold text-slate-900 pt-2">Templates, Settings, Moments</h3>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/api/templates', 'List templates assigned to org'],
            ['POST', '/api/templates', 'Create template'],
            ['PUT', '/api/templates/:id', 'Update template (isDefault triggers atomic reassign)'],
            ['DELETE', '/api/templates/:id', 'Delete template'],
            ['POST', '/api/templates/:id/preview', 'Render preview HTML'],
            ['POST', '/api/templates/:id/test-send', 'Send test email to authenticated user'],
            ['GET', '/api/settings', 'Get org settings'],
            ['PUT', '/api/settings', 'Update org settings'],
            ['GET/POST/PUT/DELETE', '/api/moments/*', 'Moments CRUD + recipient management'],
          ]}
        />
        <h3 className="font-semibold text-slate-900 pt-2">Internal Admin <span className="text-slate-400 font-normal text-xs ml-1">— X-Admin-Session + X-Admin-CSRF headers</span></h3>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['POST', '/api/internal/admin/auth/login', 'Admin password login'],
            ['POST', '/api/internal/admin/auth/bootstrap', 'Create first super admin (ADMIN_BOOTSTRAP_TOKEN)'],
            ['GET', '/api/internal/admin/auth/me', 'Current admin info + sessionExpiresAt'],
            ['POST', '/api/internal/admin/auth/logout', 'Revoke session'],
            ['GET', '/api/internal/admin/orgs', 'List all organizations'],
            ['GET', '/api/internal/admin/orgs/:id', 'Org detail + stats'],
            ['GET', '/api/internal/admin/people', 'Search people across all orgs'],
            ['POST', '/api/internal/admin/people/:id/send-birthday', 'Admin manual send (channel param supported)'],
            ['GET', '/api/internal/admin/delivery-logs', 'All delivery logs (filterable)'],
            ['GET', '/api/internal/admin/audit-logs', 'Admin action audit trail'],
          ]}
        />
      </div>
    ),
  },
  {
    id: 'auth',
    title: 'Auth System',
    content: (
      <div className="space-y-5">
        <h3 className="font-semibold text-slate-900">User auth (JWT)</h3>
        <p className="text-sm text-slate-600">Users authenticate via magic link email. On verify, the backend issues a signed JWT stored in <Code>localStorage</Code>. Every request sends it as <Code>Authorization: Bearer &lt;token&gt;</Code>. The JWT contains <Code>userId</Code>, <Code>organizationId</Code>, and <Code>exp</Code>.</p>
        <Pre>{`// Middleware: backend/src/serverContext.ts → authenticate()
// Reads JWT from Authorization header, verifies with JWT_SECRET,
// attaches req.userId and req.organizationId`}</Pre>

        <h3 className="font-semibold text-slate-900">Admin auth (server-side sessions + CSRF)</h3>
        <p className="text-sm text-slate-600">Internal admins use a double-submit cookie CSRF pattern because the admin app is cross-origin (Vercel → Railway).</p>
        <Table
          headers={['Token', 'Storage', 'Header sent']}
          rows={[
            ['Session token', 'HttpOnly cookie + localStorage', <Code>X-Admin-Session</Code>],
            ['CSRF token', 'Non-HttpOnly cookie + localStorage', <Code>X-Admin-CSRF</Code>],
          ]}
        />
        <Pre>{`// Flow:
// 1. POST /auth/login → server creates AdminSession row, sets both cookies,
//    returns sessionToken + csrfToken in body
// 2. Frontend stores both in localStorage (for header use)
// 3. Middleware checks:
//    - Cookie === X-Admin-CSRF header (CSRF double-submit)
//    - AdminSession.expiresAt > now and revokedAt is null
// 4. Sessions expire after ADMIN_SESSION_TTL_MINUTES (default 20 min)
// 5. Any 401 from adminApi.call() clears localStorage and redirects to /admin/login`}</Pre>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Cross-origin note:</strong> Cookies use <Code>SameSite=None; Secure</Code> for any non-localhost host. Detected by hostname, not <Code>NODE_ENV</Code>, so staging deployments get it automatically.
        </div>
      </div>
    ),
  },
  {
    id: 'worker',
    title: 'Scheduler / Worker',
    content: (
      <div className="space-y-5">
        <p>The worker (<Code>worker/scheduler.ts</Code>) is a long-running Node process that runs a birthday check every minute.</p>
        <Pre>{`// High-level flow (runs every 60 s):
for each Organization:
  1. shouldRunForOrg() — checks if org's birthdaySendHour matches
     current hour in org's timezone AND hasn't already run today
     (guards via birthdayLastRunAt on Organization row)
  2. findBirthdayPeople() — selects Person rows where
     month + day match today, optedOut = false
  3. For each person, resolveChannels() — reads template.channels
  4. sendEmailChannel() / sendSmsChannel() — sends via Resend / Termii
  5. Writes DeliveryLog row per channel per person
  6. Updates Organization.birthdayLastRunAt = now
  7. Writes SchedulerRun summary row`}</Pre>

        <h3 className="font-semibold text-slate-900">Idempotency guards</h3>
        <ul className="space-y-1.5 text-sm text-slate-600 list-disc list-inside">
          <li><Code>birthdayLastRunAt</Code> date is checked — if already today, org is skipped entirely.</li>
          <li>Before sending to a person, the worker checks <Code>DeliveryLog</Code> for an existing same-day, same-channel, non-failed record.</li>
          <li>Both guards together prevent duplicate sends even if the process restarts mid-run.</li>
        </ul>

        <h3 className="font-semibold text-slate-900">Failure alerting</h3>
        <p className="text-sm text-slate-600">If <Code>failureCount ≥ FAILURE_ALERT_MIN_COUNT</Code> in a run, the worker emails <Code>ALERT_EMAIL</Code>. Alert cooldown is controlled by <Code>ALERT_COOLDOWN_MINUTES</Code> to prevent spam.</p>
      </div>
    ),
  },
  {
    id: 'services',
    title: 'Third-party Services',
    content: (
      <div className="space-y-5">
        <Table
          headers={['Service', 'Used for', 'Key env vars', 'Test mode']}
          rows={[
            ['Resend', 'Transactional email', <><Code>RESEND_API_KEY</Code></>, 'Use a Resend test API key; only @resend.dev addresses work'],
            ['Termii', 'SMS delivery', <><Code>TERMII_API_KEY</Code>, <Code>TERMII_SMS_FROM</Code></>, <><Code>SMS_TEST_MODE=true</Code> mocks sends</>],
            ['OpenAI', 'Personalised birthday intro text', <><Code>OPENAI_API_KEY</Code>, <Code>OPENAI_MODEL</Code></>, 'Falls back silently if key is absent'],
            ['PostHog', 'Product analytics', <><Code>POSTHOG_API_KEY</Code>, <Code>POSTHOG_HOST</Code></>, 'No-op if key is absent'],
          ]}
        />
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <strong>Resend domain restriction:</strong> Resend rejects sends to <Code>@example.com</Code> and similar reserved domains. This causes real delivery failures when orgs import test data — flag these during CSV upload.
        </div>
      </div>
    ),
  },
  {
    id: 'deployment',
    title: 'Deployment',
    content: (
      <div className="space-y-5">
        <Table
          headers={['Service', 'Platform', 'Trigger', 'Notes']}
          rows={[
            ['Backend', 'Railway', 'Push to main', 'nixpacks.toml configures build; migrations run on start via prisma migrate deploy'],
            ['Worker', 'Railway (separate service)', 'Push to main', 'Same repo, different start command: npm run start in worker/'],
            ['Frontend', 'Vercel', 'Push to main', 'Vite build; no server-side rendering'],
          ]}
        />
        <h3 className="font-semibold text-slate-900">Railway start command</h3>
        <Pre>{`# backend (set in nixpacks.toml or Railway service settings):
npx prisma migrate deploy && npm run start

# worker (set in Railway service settings):
cd worker && npm run start`}</Pre>

        <h3 className="font-semibold text-slate-900">First admin account</h3>
        <Pre>{`# Set ADMIN_BOOTSTRAP_TOKEN in backend env, then:
POST /api/internal/admin/auth/bootstrap
{ "token": "<ADMIN_BOOTSTRAP_TOKEN>", "email": "you@usemomentos.xyz", "password": "..." }
# Creates first SUPER_ADMIN. Unset the token env var after.`}</Pre>
      </div>
    ),
  },
  {
    id: 'patterns',
    title: 'Code Patterns',
    content: (
      <div className="space-y-6">
        <h3 className="font-semibold text-slate-900">Adding a user-facing API route</h3>
        <Pre>{`// backend/src/routes/YourFeature.ts
export function registerYourFeatureRoutes(app: Express) {
  app.get("/api/your-feature", authenticate, async (req: AuthRequest, res) => {
    // req.organizationId — always scope queries to this
    const data = await prisma.someModel.findMany({
      where: { organizationId: req.organizationId! },
    });
    res.json({ data });
  });
}

// backend/src/index.ts — register it
registerYourFeatureRoutes(app);`}</Pre>

        <h3 className="font-semibold text-slate-900">Adding an admin route</h3>
        <Pre>{`// Inside registerInternalAdminRoutes() in InternalAdmin.ts
app.get(
  "/api/internal/admin/your-endpoint",
  authenticateAdmin,
  async (req: AdminAuthRequest, res) => {
    // req.adminId, req.adminRole available
    // No org scoping — admins see everything
  }
);`}</Pre>

        <h3 className="font-semibold text-slate-900">React Strict Mode + dropdown state</h3>
        <p className="text-sm text-slate-600">React 18 Strict Mode double-invokes state updater functions in development. Use direct value calls instead of the updater pattern for toggle state:</p>
        <Pre>{`// ❌ Breaks in Strict Mode dev — updater runs twice, toggles back to closed
setActionMenu(current => current ? null : { ... });

// ✓ Read from closure, call once
if (actionMenu?.id === id) { setActionMenu(null); return; }
setActionMenu({ id, top, left });`}</Pre>

        <h3 className="font-semibold text-slate-900">CSV encoding</h3>
        <p className="text-sm text-slate-600"><Code>CSVUpload.tsx</Code> reads files as <Code>ArrayBuffer</Code>, tries UTF-8 first, falls back to Windows-1252 if replacement characters appear. This preserves Yoruba and other non-Latin diacritics from Excel-generated CSVs.</p>
      </div>
    ),
  },
];

export default function AdminDocs() {
  const [active, setActive] = useState('architecture');

  return (
    <div className="flex gap-0 min-h-[calc(100vh-6rem)]">
      {/* Sidebar */}
      <aside className="hidden w-48 shrink-0 lg:block">
        <nav className="sticky top-6 space-y-0.5 pr-4">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Contents</div>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActive(s.id)}
              className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                active === s.id
                  ? 'bg-slate-100 font-medium text-slate-900'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {s.title}
            </a>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1 lg:pl-8">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">Developer Reference</h1>
          <p className="mt-1 text-sm text-slate-500">Internal documentation for engineers working on MomentOS.</p>
        </div>

        <div className="space-y-16">
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-6"
              onMouseEnter={() => setActive(s.id)}
            >
              <h2 className="mb-4 border-b border-slate-200 pb-3 text-base font-bold text-slate-900">{s.title}</h2>
              <div className="text-sm leading-relaxed text-slate-600 space-y-4">{s.content}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
