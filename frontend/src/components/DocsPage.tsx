import { Link } from 'react-router-dom';

type Section = {
  id: string;
  title: string;
  content: React.ReactNode;
};

const sections: Section[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: (
      <div className="space-y-4">
        <p>MomentOS automates birthday and celebration emails for your team or organisation. Set it up once and every birthday, work anniversary, or special moment is handled automatically.</p>
        <ol className="space-y-3 list-none">
          {[
            ['Create an account', 'Sign up at usemomentos.xyz and verify your email address.'],
            ['Upload your people', 'Go to the Upload tab and import a CSV of your team members with their names, emails, and birthdays.'],
            ['Choose a template', 'Visit the Templates tab to pick or customise the email your team members will receive.'],
            ['Configure settings', 'Set your organisation\'s timezone and preferred send time under Settings.'],
            ['Go live', 'MomentOS runs automatically every day. Birthdays are sent at your configured time.'],
          ].map(([title, desc], i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white mt-0.5">{i + 1}</span>
              <div>
                <div className="font-medium text-slate-900">{title}</div>
                <div className="text-sm text-slate-600 mt-0.5">{desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    ),
  },
  {
    id: 'csv-upload',
    title: 'Uploading People via CSV',
    content: (
      <div className="space-y-4">
        <p>The CSV upload is the fastest way to add your team. Download the sample CSV from the Upload tab for the exact column format.</p>
        <h3 className="font-semibold text-slate-900">Required columns</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Column</th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Format</th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['fullName', 'Text', 'Ada Nwankwo'],
                ['email', 'Valid email address', 'ada@company.com'],
                ['birthday', 'YYYY-MM-DD', '1995-03-14'],
                ['phone', 'International format (optional)', '+2348012345678'],
                ['department', 'Text (optional)', 'Engineering'],
                ['role', 'Text (optional)', 'Designer'],
                ['workStartDate', 'YYYY-MM-DD (optional)', '2022-01-10'],
              ].map(([col, format, example]) => (
                <tr key={col} className="odd:bg-white even:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{col}</td>
                  <td className="px-4 py-2.5 text-slate-600">{format}</td>
                  <td className="px-4 py-2.5 text-slate-500">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Tip:</strong> If your CSV was saved from Excel on Windows, MomentOS automatically detects and handles Windows-1252 encoding so names with special characters (e.g. Yoruba diacritics) are preserved correctly.
        </div>
        <h3 className="font-semibold text-slate-900">What happens after upload</h3>
        <ul className="space-y-1.5 text-sm text-slate-600 list-disc list-inside">
          <li>Valid rows are imported immediately.</li>
          <li>Duplicate emails within your organisation are skipped.</li>
          <li>Invalid rows are listed with reasons so you can fix and re-upload.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'templates',
    title: 'Email Templates',
    content: (
      <div className="space-y-4">
        <p>Templates control the email your team members receive on their birthday. You can use one of the built-in templates or create your own.</p>
        <h3 className="font-semibold text-slate-900">Template variables</h3>
        <p className="text-sm text-slate-600">Use these placeholders in your subject or body — MomentOS fills them in automatically before sending.</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Variable</th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Replaced with</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['{{first_name}}', "Recipient's first name"],
                ['{{full_name}}', "Recipient's full name"],
                ['{{organization_name}}', 'Your organisation name'],
                ['{{date}}', "Today's date"],
                ['{{personalized_intro}}', 'AI-generated personal intro (HTML templates only)'],
              ].map(([variable, desc]) => (
                <tr key={variable} className="odd:bg-white even:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{variable}</td>
                  <td className="px-4 py-2.5 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="font-semibold text-slate-900">Setting a default template</h3>
        <p className="text-sm text-slate-600">Only the template marked as <strong>Default</strong> is used for automated sends. Open the ⋯ menu on any template and choose <em>Set as default</em>.</p>
        <h3 className="font-semibold text-slate-900">Template types</h3>
        <ul className="space-y-1.5 text-sm text-slate-600 list-disc list-inside">
          <li><strong>HTML</strong> — rich email with formatting, colours, and images.</li>
          <li><strong>Plain text</strong> — simple text email, works in all email clients.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'settings',
    title: 'Organisation Settings',
    content: (
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Setting</th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['Organisation name', 'Used in the {{organization_name}} variable and email sender name.'],
                ['Timezone', 'All scheduled sends use this timezone. Set it to where your team is based.'],
                ['Send time', 'The hour of day (24-hour) when birthday emails go out.'],
                ['Email sender name', 'The "From" name recipients see, e.g. "Acme HR".'],
                ['Email sender address', 'Must be a verified domain or a supported address. Contact support if unsure.'],
                ['SMS enabled', 'Toggle to allow SMS delivery on templates that support it.'],
                ['SMS sender ID', 'The name or number shown as sender on SMS messages (subject to carrier rules).'],
              ].map(([setting, desc]) => (
                <tr key={setting} className="odd:bg-white even:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{setting}</td>
                  <td className="px-4 py-2.5 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    id: 'manual-send',
    title: 'Manual Sends',
    content: (
      <div className="space-y-4">
        <p>You can send a birthday email or SMS to any person at any time — not just on their actual birthday.</p>
        <ol className="space-y-3 list-none">
          {[
            ['Open the People tab', 'Find the person you want to send to.'],
            ['Click the Send button', 'A dropdown appears with Email and SMS options.'],
            ['Choose a channel', 'Email sends through your configured sender. SMS requires the person to have a phone number and SMS to be enabled in Settings.'],
          ].map(([title, desc], i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white mt-0.5">{i + 1}</span>
              <div>
                <div className="font-medium text-slate-900">{title}</div>
                <div className="text-sm text-slate-600 mt-0.5">{desc}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Manual sends use your active default template, the same as automated sends.
        </div>
      </div>
    ),
  },
  {
    id: 'upcoming',
    title: 'Upcoming Celebrations',
    content: (
      <div className="space-y-4">
        <p>The <strong>Upcoming</strong> tab shows everyone in your organisation with a birthday or work anniversary in the next 30 days so you can plan ahead.</p>
        <ul className="space-y-1.5 text-sm text-slate-600 list-disc list-inside">
          <li>Birthdays are shown with the person's age they are turning.</li>
          <li>Work anniversaries show the number of years.</li>
          <li>You can trigger a manual send directly from this view.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'delivery',
    title: 'Delivery & Failures',
    content: (
      <div className="space-y-4">
        <p>MomentOS sends birthday emails automatically once per day at your configured send time. Here's how delivery works:</p>
        <ul className="space-y-1.5 text-sm text-slate-600 list-disc list-inside">
          <li>Each person only receives one automated send per day per channel — duplicate sends are blocked even if the scheduler runs more than once.</li>
          <li>People who have <strong>opted out</strong> are never sent to.</li>
          <li>If an email fails (e.g. invalid address), the failure is logged and no retry is attempted automatically — fix the email address then use a manual send.</li>
        </ul>
        <h3 className="font-semibold text-slate-900">Common failure reasons</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Error</th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">Fix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['Invalid `to` field / example.com domain', 'Update the person\'s email to a real address in the People tab.'],
                ['No default template found', 'Go to Templates and set one template as the default.'],
                ['Sender email not configured', 'Add a sender email address in Settings.'],
                ['SMS not enabled for this organisation', 'Enable SMS in Settings before sending SMS messages.'],
                ['Person has no phone number', 'Edit the person and add their phone number in international format.'],
              ].map(([error, fix]) => (
                <tr key={error} className="odd:bg-white even:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{error}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    id: 'moments',
    title: 'Moments (Custom Events)',
    content: (
      <div className="space-y-4">
        <p>Beyond birthdays, MomentOS supports <strong>Moments</strong> — custom events you define (e.g. "Team Retreat", "Product Launch") that can be sent to specific people or groups.</p>
        <ul className="space-y-1.5 text-sm text-slate-600 list-disc list-inside">
          <li>Create a Moment from the Moments tab and give it a name, date, and template.</li>
          <li>Add recipients individually or by department.</li>
          <li>Moments send once on the date you specify.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'faq',
    title: 'Frequently Asked Questions',
    content: (
      <div className="space-y-5">
        {[
          ['What time zone do birthday sends use?', 'Sends use the timezone configured in your organisation Settings. Make sure it matches where your team is located.'],
          ['Can I change the send time?', 'Yes — go to Settings and update the send hour. Changes take effect from the next scheduled run.'],
          ['What happens if two people share a birthday?', 'MomentOS sends to both. Each person receives their own personalised email.'],
          ['Can a person opt out?', 'Yes. Edit the person in the People tab and toggle the "Opted out" field. They will not receive any automated or manual sends.'],
          ['Are emails sent on weekends?', 'Yes. MomentOS runs every day including weekends and public holidays.'],
          ['Can I use my own domain for sending?', 'Yes, but the domain must be verified with your email provider (Resend). Contact support to set this up.'],
          ['What file formats are supported for upload?', 'CSV only. UTF-8 and Windows-1252 encodings are both supported.'],
          ['What happens if a send fails?', 'The failure is logged in your delivery history. Fix the underlying issue (e.g. bad email address) and use a manual send from the People tab.'],
        ].map(([q, a]) => (
          <div key={String(q)}>
            <div className="font-semibold text-slate-900 mb-1">{q}</div>
            <div className="text-sm text-slate-600">{a}</div>
          </div>
        ))}
      </div>
    ),
  },
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-700">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">M</div>
            <div className="text-sm font-semibold text-slate-900">MomentOS</div>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/changelog" className="hidden sm:block text-sm text-slate-500 hover:text-slate-900 transition-colors">Changelog</Link>
            <Link to="/login" className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12 lg:flex lg:gap-12">
        {/* Sidebar nav */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Documentation</div>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                {s.title}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-slate-900">Documentation</h1>
            <p className="mt-2 text-slate-500">Everything you need to set up and run MomentOS for your organisation.</p>
          </div>

          <div className="space-y-16">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-xl font-bold text-slate-900 mb-5 pb-3 border-b border-slate-200">{s.title}</h2>
                <div className="text-sm leading-relaxed text-slate-600">{s.content}</div>
              </section>
            ))}
          </div>

          <div className="mt-16 rounded-xl border border-slate-200 bg-white p-6 text-center">
            <div className="text-sm font-medium text-slate-900 mb-1">Still have questions?</div>
            <p className="text-sm text-slate-500 mb-4">Reach out and we'll help you get set up.</p>
            <a
              href="mailto:support@usemomentos.xyz"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Contact support
            </a>
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-200 mt-16">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400">
          <span>© {new Date().getFullYear()} MomentOS</span>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-slate-700 transition-colors">Home</Link>
            <Link to="/changelog" className="hover:text-slate-700 transition-colors">Changelog</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
