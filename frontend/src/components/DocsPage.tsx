import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from './ui';

// ─── primitives ──────────────────────────────────────────────────────────────

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.82em] text-slate-800">
      {children}
    </code>
  );
}

function Pre({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
      {label && (
        <div className="border-b border-slate-700 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto px-5 py-4 text-xs leading-relaxed text-slate-200">{children}</pre>
    </div>
  );
}

function Callout({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    tip: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>{children}</div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-slate-600 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── nav structure ────────────────────────────────────────────────────────────

type NavGroup = { label: string; items: { id: string; title: string }[] };

const nav: NavGroup[] = [
  {
    label: 'Getting Started',
    items: [
      { id: 'overview', title: 'What is MomentOS?' },
      { id: 'quickstart', title: 'Quickstart' },
    ],
  },
  {
    label: 'Core Concepts',
    items: [
      { id: 'people', title: 'People' },
      { id: 'templates', title: 'Templates' },
      { id: 'moments', title: 'Moments' },
      { id: 'scheduler', title: 'Automated Delivery' },
    ],
  },
  {
    label: 'API Reference',
    items: [
      { id: 'auth-api', title: 'Authentication' },
      { id: 'people-api', title: 'People' },
      { id: 'templates-api', title: 'Templates' },
      { id: 'moments-api', title: 'Moments' },
      { id: 'settings-api', title: 'Settings' },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { id: 'email', title: 'Email (Resend)' },
      { id: 'sms', title: 'SMS (Termii)' },
      { id: 'csv', title: 'CSV Import' },
    ],
  },
  {
    label: 'Architecture',
    items: [
      { id: 'architecture', title: 'System Overview' },
      { id: 'delivery-flow', title: 'Delivery Flow' },
    ],
  },
  {
    label: 'Guides',
    items: [
      { id: 'guide-onboarding', title: 'Setting up an org' },
      { id: 'guide-templates', title: 'Customising templates' },
      { id: 'guide-failures', title: 'Debugging failures' },
    ],
  },
];

const allItems = nav.flatMap((g) => g.items);

// ─── section content ──────────────────────────────────────────────────────────

const sections: Record<string, React.ReactNode> = {
  overview: (
    <div className="space-y-5">
      <p className="text-base text-slate-600 leading-relaxed">
        MomentOS is a celebration automation platform that sends personalised birthday and
        anniversary messages to the people in your organisation — automatically, across email
        and SMS, on the right day, in the right timezone.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: 'Add your people', body: 'Import a CSV or add people one by one. MomentOS handles birthdays, work anniversaries, and custom moments.' },
          { title: 'Pick a template', body: 'Choose from pre-built HTML or plain-text templates, or write your own with dynamic variables.' },
          { title: 'It sends itself', body: 'The scheduler checks birthdays every hour and sends at the time and timezone you set per organisation.' },
        ].map((c) => (
          <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-2 text-sm font-semibold text-slate-900">{c.title}</div>
            <p className="text-sm text-slate-500">{c.body}</p>
          </div>
        ))}
      </div>
      <h3 className="pt-2 text-sm font-semibold text-slate-900">Channels</h3>
      <Table
        headers={['Channel', 'Provider', 'Configured via']}
        rows={[
          ['Email', 'Resend', <Code>RESEND_API_KEY</Code>],
          ['SMS', 'Termii', <Code>TERMII_API_KEY</Code>],
        ]}
      />
    </div>
  ),

  quickstart: (
    <div className="space-y-6">
      <p className="text-slate-600">Get MomentOS running and send your first birthday message in under 10 minutes.</p>
      <div className="space-y-4">
        {[
          { step: '1', title: 'Create an account', body: <>Go to the sign-up page and register your organisation. You'll receive a magic link to your inbox — click it to sign in.</> },
          { step: '2', title: 'Import your people', body: <>Head to <strong>People → Upload CSV</strong>. Download the sample CSV to see the expected columns: <Code>fullName</Code>, <Code>email</Code>, <Code>birthday</Code> (YYYY-MM-DD), <Code>phone</Code> (optional).</> },
          { step: '3', title: 'Choose a template', body: <>Go to <strong>Templates</strong> and set one as your default. The default template is what the scheduler uses for automated sends.</> },
          { step: '4', title: 'Configure settings', body: <>In <strong>Settings</strong>, set your organisation timezone and the hour you want birthday messages to go out (e.g. 9 for 9 AM).</> },
          { step: '5', title: 'Send manually to test', body: <>On any person's row in the People tab, click <strong>Send Birthday Email</strong> to trigger an immediate send outside the scheduler. Check their delivery log to confirm.</> },
        ].map((s) => (
          <div key={s.step} className="flex gap-4">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{s.step}</div>
            <div>
              <div className="mb-1 text-sm font-semibold text-slate-900">{s.title}</div>
              <p className="text-sm text-slate-600">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),

  people: (
    <div className="space-y-5">
      <p className="text-slate-600">A <strong>Person</strong> is anyone your organisation wants to celebrate. Each person belongs to exactly one organisation.</p>
      <h3 className="text-sm font-semibold text-slate-900">Fields</h3>
      <Table
        headers={['Field', 'Required', 'Notes']}
        rows={[
          ['fullName', '✓', 'Full display name, supports Unicode (Yoruba diacritics, etc.)'],
          ['email', '✓', 'Must be unique within the organisation'],
          ['birthday', '', 'ISO date (YYYY-MM-DD). Year is ignored — only month + day matters for scheduling.'],
          ['workAnniversary', '', 'ISO date. Same month+day matching logic as birthday.'],
          ['phone', '', 'International format recommended: +2348012345678'],
          ['optedOut', '', 'When true, person is excluded from all automated sends.'],
          ['department', '', 'Optional grouping field, not used by the scheduler.'],
        ]}
      />
      <h3 className="text-sm font-semibold text-slate-900">Opt-out behaviour</h3>
      <p className="text-sm text-slate-600">Setting <Code>optedOut: true</Code> on a person removes them from scheduler runs and prevents manual sends. It does not delete their record.</p>
    </div>
  ),

  templates: (
    <div className="space-y-5">
      <p className="text-slate-600">Templates define the content of birthday and anniversary messages. They are global — created once and shared across all organisations via the <Code>OrganizationTemplate</Code> assignment.</p>
      <h3 className="text-sm font-semibold text-slate-900">Template types</h3>
      <Table
        headers={['Type', 'Description']}
        rows={[
          ['HTML', 'Full HTML email. Supports inline styles. Rendered with dynamic variables.'],
          ['PLAIN_TEXT', 'Plain-text email body. Falls back gracefully in all email clients.'],
        ]}
      />
      <h3 className="text-sm font-semibold text-slate-900">Dynamic variables</h3>
      <p className="text-sm text-slate-600">Use double-brace syntax in subject and content:</p>
      <Pre label="variables">{`{{name}}           — person's full name
{{organization}}   — organisation name
{{message}}        — AI-generated personalised intro (if OpenAI is configured)`}</Pre>
      <h3 className="text-sm font-semibold text-slate-900">Default template</h3>
      <p className="text-sm text-slate-600">Each organisation has one default template per event type. The scheduler always uses the default. Changing the default is atomic — the previous default is unset in the same transaction.</p>
    </div>
  ),

  moments: (
    <div className="space-y-5">
      <p className="text-slate-600">A <strong>Moment</strong> is a one-off scheduled send — a team celebration, a company anniversary, a product launch message — sent to a specific list of people at a specific time.</p>
      <h3 className="text-sm font-semibold text-slate-900">How it works</h3>
      <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
        <li>Create a Moment with a name, template, and scheduled datetime.</li>
        <li>Add recipients from your People list.</li>
        <li>The scheduler picks it up when <Code>scheduledFor</Code> is in the past and status is <Code>PENDING</Code>.</li>
        <li>After sending, status moves to <Code>SENT</Code> and is not retried.</li>
      </ul>
      <Callout type="info">Moments use the same delivery pipeline as birthday sends — the same template variables, the same delivery log entries, the same channel selection.</Callout>
    </div>
  ),

  scheduler: (
    <div className="space-y-5">
      <p className="text-slate-600">MomentOS runs a background scheduler that checks for birthdays, anniversaries, and pending Moments every minute.</p>
      <h3 className="text-sm font-semibold text-slate-900">When does a send trigger?</h3>
      <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
        <li>The current UTC hour, converted to the org's timezone, matches the org's <Code>birthdaySendHour</Code> setting.</li>
        <li>The org has not already run today (checked via <Code>birthdayLastRunAt</Code>).</li>
        <li>The person has a birthday today (month + day match), is not opted out, and has not already received a send today on that channel.</li>
      </ul>
      <h3 className="text-sm font-semibold text-slate-900">Duplicate protection</h3>
      <p className="text-sm text-slate-600">Two guards prevent double-sends: (1) the org-level <Code>birthdayLastRunAt</Code> date check, and (2) a per-person <Code>DeliveryLog</Code> lookup before each send. Both must pass for a message to go out.</p>
      <Callout type="warn">If a person's birthday is today and the scheduler has already run, a <strong>manual send</strong> from the People tab is the only way to trigger a message for that person today.</Callout>
    </div>
  ),

  'auth-api': (
    <div className="space-y-5">
      <p className="text-slate-600">MomentOS uses magic-link authentication. There are no passwords — users receive a one-time sign-in link by email.</p>
      <h3 className="text-sm font-semibold text-slate-900">Flow</h3>
      <Pre label="1. request magic link">{`POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com" }`}</Pre>
      <Pre label="2. verify the link token">{`POST /api/auth/magic/verify
Content-Type: application/json

{ "token": "<token from email link>" }

// Response:
{ "token": "<JWT>", "user": { "id": "...", "email": "...", "role": "OWNER" } }`}</Pre>
      <Pre label="3. authenticated request">{`GET /api/people
Authorization: Bearer <JWT>`}</Pre>
      <Callout type="info">JWTs are valid for 7 days. Store them in <Code>localStorage</Code> and send as <Code>Authorization: Bearer &lt;token&gt;</Code> on every request.</Callout>
    </div>
  ),

  'people-api': (
    <div className="space-y-5">
      <p className="text-slate-600">All people endpoints are scoped to the authenticated user's organisation. You cannot access another organisation's people.</p>
      <Table
        headers={['Method', 'Path', 'Description']}
        rows={[
          ['GET', '/api/people', 'List all people'],
          ['POST', '/api/people', 'Create a person'],
          ['PUT', '/api/people/:id', 'Update a person'],
          ['DELETE', '/api/people/:id', 'Delete a person'],
          ['POST', '/api/people/upload', 'Bulk import via CSV'],
          ['GET', '/api/people/export', 'Export people as CSV'],
          ['GET', '/api/people/upcoming', 'Birthdays in the next 30 days'],
          ['POST', '/api/people/:id/send-birthday', 'Manual send (email or SMS)'],
        ]}
      />
      <Pre label="create a person">{`POST /api/people
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "fullName": "Amara Okonkwo",
  "email": "amara@company.com",
  "birthday": "1990-03-15",
  "phone": "+2348012345678"
}`}</Pre>
      <Pre label="manual send">{`POST /api/people/:id/send-birthday
Authorization: Bearer <JWT>
Content-Type: application/json

{ "channel": "email" }   // "email" | "sms" — defaults to "email"`}</Pre>
    </div>
  ),

  'templates-api': (
    <div className="space-y-5">
      <Table
        headers={['Method', 'Path', 'Description']}
        rows={[
          ['GET', '/api/templates', "List templates assigned to the org"],
          ['POST', '/api/templates', 'Create a template'],
          ['PUT', '/api/templates/:id', 'Update a template'],
          ['DELETE', '/api/templates/:id', 'Delete a template'],
          ['POST', '/api/templates/:id/preview', 'Render preview HTML (returns HTML string)'],
          ['POST', '/api/templates/:id/test-send', 'Send a test email to the logged-in user'],
        ]}
      />
      <Pre label="create a template">{`POST /api/templates
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "name": "Birthday Classic",
  "subject": "Happy Birthday, {{name}}!",
  "content": "<p>Wishing you a wonderful birthday, {{name}}!</p>",
  "type": "HTML",
  "channels": ["email"]
}`}</Pre>
    </div>
  ),

  'moments-api': (
    <div className="space-y-5">
      <Table
        headers={['Method', 'Path', 'Description']}
        rows={[
          ['GET', '/api/moments', 'List all moments for the org'],
          ['POST', '/api/moments', 'Create a moment'],
          ['GET', '/api/moments/:id', 'Get a moment and its recipients'],
          ['PUT', '/api/moments/:id', 'Update a moment'],
          ['DELETE', '/api/moments/:id', 'Delete a moment'],
          ['POST', '/api/moments/:id/recipients', 'Add recipients'],
          ['DELETE', '/api/moments/:id/recipients', 'Remove recipients'],
        ]}
      />
      <Pre label="create a moment">{`POST /api/moments
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "name": "Company 10th Anniversary",
  "templateId": "tpl_abc123",
  "scheduledFor": "2026-09-01T09:00:00.000Z"
}`}</Pre>
    </div>
  ),

  'settings-api': (
    <div className="space-y-5">
      <Table
        headers={['Method', 'Path', 'Description']}
        rows={[
          ['GET', '/api/settings', 'Get organisation settings'],
          ['PUT', '/api/settings', 'Update organisation settings'],
        ]}
      />
      <Pre label="update settings">{`PUT /api/settings
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "timezone": "Africa/Lagos",
  "birthdaySendHour": 9,
  "smsEnabled": true,
  "emailFromAddress": "birthdays@company.com",
  "emailFromName": "Company Celebrations"
}`}</Pre>
      <h3 className="text-sm font-semibold text-slate-900">Key settings</h3>
      <Table
        headers={['Field', 'Description']}
        rows={[
          ['timezone', 'IANA timezone string (e.g. Africa/Lagos, America/New_York). Controls when the scheduler fires for this org.'],
          ['birthdaySendHour', 'Hour of day (0–23) in the org timezone to send birthday messages.'],
          ['smsEnabled', 'Master toggle for SMS delivery. Individual templates also need the SMS channel enabled.'],
          ['emailFromAddress', 'Custom From address. Must be verified in your Resend account.'],
        ]}
      />
    </div>
  ),

  email: (
    <div className="space-y-5">
      <p className="text-slate-600">MomentOS sends email via <strong>Resend</strong>. Each organisation can configure a custom sender name and address.</p>
      <h3 className="text-sm font-semibold text-slate-900">Setup</h3>
      <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
        <li>Add your domain in Resend and verify DNS records.</li>
        <li>Set <Code>emailFromAddress</Code> and <Code>emailFromName</Code> in org Settings.</li>
        <li>If not set, the platform default (<Code>DEFAULT_FROM_EMAIL</Code>) is used.</li>
      </ul>
      <Callout type="warn">
        Resend blocks sends to reserved domains like <Code>@example.com</Code>. Imports containing these addresses will appear to succeed but the emails will fail at delivery time. Use real email addresses in production data.
      </Callout>
      <h3 className="text-sm font-semibold text-slate-900">Email open tracking</h3>
      <p className="text-sm text-slate-600">Resend provides open and click tracking by default. Delivery status is recorded in the <Code>DeliveryLog</Code> table per send.</p>
    </div>
  ),

  sms: (
    <div className="space-y-5">
      <p className="text-slate-600">SMS is delivered via <strong>Termii</strong>. It is optional — SMS sends only happen when the template has the SMS channel enabled and the org has <Code>smsEnabled: true</Code>.</p>
      <h3 className="text-sm font-semibold text-slate-900">Requirements</h3>
      <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
        <li>Person must have a <Code>phone</Code> field populated.</li>
        <li>Org must have <Code>smsEnabled: true</Code> in Settings.</li>
        <li>The assigned template must include <Code>"sms"</Code> in its <Code>channels</Code> array.</li>
      </ul>
      <h3 className="text-sm font-semibold text-slate-900">Phone number format</h3>
      <p className="text-sm text-slate-600">International format is recommended: <Code>+2348012345678</Code>. The platform normalises numbers during CSV import but explicit international format is safest.</p>
    </div>
  ),

  csv: (
    <div className="space-y-5">
      <p className="text-slate-600">The fastest way to add people in bulk is a CSV upload. Download the sample CSV from the People tab to get the correct column headers.</p>
      <h3 className="text-sm font-semibold text-slate-900">Expected columns</h3>
      <Table
        headers={['Column', 'Format', 'Notes']}
        rows={[
          ['fullName', 'Text', 'Required'],
          ['email', 'Email', 'Required; must be unique within the org'],
          ['birthday', 'YYYY-MM-DD', 'Optional; year is ignored'],
          ['workAnniversary', 'YYYY-MM-DD', 'Optional'],
          ['phone', 'International or local', 'Optional; used for SMS'],
          ['department', 'Text', 'Optional; not used by scheduler'],
        ]}
      />
      <Callout type="tip">
        <strong>Excel users:</strong> Save as CSV UTF-8 (not the default CSV) to preserve special characters like Yoruba diacritics. MomentOS also auto-detects Windows-1252 encoding as a fallback.
      </Callout>
      <h3 className="text-sm font-semibold text-slate-900">Duplicate handling</h3>
      <p className="text-sm text-slate-600">If a person with the same email already exists in the org, the upload will update their record (upsert) rather than creating a duplicate.</p>
    </div>
  ),

  architecture: (
    <div className="space-y-5">
      <p className="text-slate-600">MomentOS is built as a three-service system: an API, a frontend, and an asynchronous scheduler.</p>
      <Pre>{`┌─────────────────────────────────────────┐
│  Browser (React SPA — Vercel)           │
│  • User dashboard                       │
│  • Admin panel                          │
└───────────────┬─────────────────────────┘
                │ HTTPS REST
┌───────────────▼─────────────────────────┐
│  Backend API (Express — Railway)        │
│  • Auth, people, templates, settings    │
│  • Internal admin endpoints             │
└──────────┬────────────┬─────────────────┘
           │            │
┌──────────▼──┐  ┌──────▼──────────────────┐
│  PostgreSQL │  │  Worker (Railway)        │
│  (Prisma)   │  │  • Runs every 60 s      │
└─────────────┘  │  • Sends via Resend /   │
                 │    Termii               │
                 └─────────────────────────┘`}</Pre>
      <h3 className="text-sm font-semibold text-slate-900">Data isolation</h3>
      <p className="text-sm text-slate-600">Every database query on the backend is scoped to <Code>organizationId</Code> — drawn from the authenticated JWT. An org can never read or write another org's data.</p>
    </div>
  ),

  'delivery-flow': (
    <div className="space-y-5">
      <p className="text-slate-600">What happens when a birthday send triggers:</p>
      <div className="space-y-3">
        {[
          ['Scheduler fires', 'Every 60 seconds, the worker iterates all active organisations.'],
          ['Timezone check', "Converts UTC to the org's timezone. If the current hour matches birthdaySendHour and the org hasn't run today, proceed."],
          ['Find birthday people', 'Queries Person rows where month+day match today, optedOut = false.'],
          ['Resolve channels', 'Reads the default template to determine if email, SMS, or both should send.'],
          ['Duplicate check', 'Looks for an existing DeliveryLog entry for this person, this channel, today. Skips if found.'],
          ['Send', 'Calls Resend (email) or Termii (SMS). Writes a DeliveryLog row with status SENT or FAILED.'],
          ['Audit', 'Updates Organization.birthdayLastRunAt and writes a SchedulerRun summary row.'],
        ].map(([title, body], i) => (
          <div key={i} className="flex gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">{i + 1}</div>
            <div>
              <span className="text-sm font-semibold text-slate-900">{title} — </span>
              <span className="text-sm text-slate-600">{body}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),

  'guide-onboarding': (
    <div className="space-y-5">
      <p className="text-slate-600">Step-by-step guide to getting a new organisation ready to send its first automated birthday message.</p>
      {[
        { title: 'Register', body: 'Create an account at the sign-up page. One account = one organisation. Use your work email.' },
        { title: 'Import people', body: 'Download the sample CSV, fill in your team data, and upload it under People → Upload CSV. Start with a small test set of 2–3 people with real email addresses.' },
        { title: 'Set a template', body: 'Go to Templates, preview the available templates, and mark one as Default. The default is used for all automated sends.' },
        { title: 'Configure settings', body: 'Open Settings and set: your timezone, the hour to send (e.g. 9 for 9 AM local), and optionally a custom sender email/name.' },
        { title: 'Test manually', body: "Change one test person's birthday to today's date, then click Send Birthday Email on their row. Verify you receive it." },
        { title: 'Restore dates & go live', body: "Reset the test birthday, confirm your settings, and the scheduler takes over from here. No further action needed." },
      ].map((s, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{i + 1}</div>
          <div>
            <div className="mb-0.5 text-sm font-semibold text-slate-900">{s.title}</div>
            <p className="text-sm text-slate-600">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  ),

  'guide-templates': (
    <div className="space-y-5">
      <p className="text-slate-600">Templates control exactly what your recipients see. Here is how to make them your own.</p>
      <h3 className="text-sm font-semibold text-slate-900">Using variables</h3>
      <p className="text-sm text-slate-600">Add <Code>{'{{name}}'}</Code> anywhere in the subject or content to insert the recipient's full name. Use <Code>{'{{organization}}'}</Code> for your organisation name.</p>
      <h3 className="text-sm font-semibold text-slate-900">HTML tips</h3>
      <ul className="space-y-1.5 text-sm text-slate-600 list-disc list-inside">
        <li>Use inline styles — many email clients strip external stylesheets.</li>
        <li>Keep layouts single-column for best mobile compatibility.</li>
        <li>Use the <strong>Preview</strong> button to render the template with sample data before saving.</li>
        <li>Use <strong>Send Test</strong> to receive the email at your own address before setting it as default.</li>
      </ul>
      <Callout type="tip">Plain-text templates are reliable across all email clients and never land in spam. Consider using one as a fallback or for SMS-only sends.</Callout>
    </div>
  ),

  'guide-failures': (
    <div className="space-y-5">
      <p className="text-slate-600">When a send fails, a <Code>DeliveryLog</Code> row is written with <Code>status: FAILED</Code> and an error message. Here is how to investigate.</p>
      <h3 className="text-sm font-semibold text-slate-900">Common causes</h3>
      <Table
        headers={['Error', 'Cause', 'Fix']}
        rows={[
          ['Recipient address blocked', "Email is @example.com or another reserved domain", 'Update the person record with a real email address'],
          ['Phone number invalid', 'Phone field is malformatted or missing country code', 'Edit the person record, use international format'],
          ['No default template', "Org has no active default template assigned", 'Go to Templates and set a default'],
          ['Opted out', 'Person has optedOut = true', 'Re-enable in the person record if intentional'],
          ['Already sent today', 'Scheduler already ran for this person today', 'Use manual send if an additional send is needed'],
        ]}
      />
      <h3 className="text-sm font-semibold text-slate-900">Viewing delivery logs</h3>
      <p className="text-sm text-slate-600">Each person row in the People tab shows their last send status. The admin panel at <Code>/admin/delivery-logs</Code> has a full searchable log across all organisations.</p>
    </div>
  ),
};

// ─── layout ───────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeId, setActiveId] = useState('overview');

  const section = sections[activeId];
  const currentItem = allItems.find((i) => i.id === activeId);

  return (
    <div className="min-h-screen bg-white text-slate-700">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5">
              <LogoMark size={26} />
              <span className="text-sm font-semibold text-slate-900">MomentOS</span>
            </Link>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span className="hidden text-sm text-slate-500 sm:inline">Docs</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/changelog" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">Changelog</Link>
            <Link to="/login" className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors">Sign in</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-screen-xl">
        {/* Left sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-slate-100 lg:block">
          <nav className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-8 space-y-6">
            {nav.map((group) => (
              <div key={group.label}>
                <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.label}</div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveId(item.id)}
                      className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                        activeId === item.id
                          ? 'bg-slate-900 font-medium text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-6 py-10 lg:px-12 xl:px-16">
          {/* Mobile nav */}
          <div className="mb-6 lg:hidden">
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              {nav.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="max-w-2xl">
            <h1 className="mb-1 text-2xl font-bold text-slate-900">{currentItem?.title}</h1>
            <div className="mb-8 h-px bg-slate-100" />
            <div className="space-y-5 leading-relaxed">{section}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
