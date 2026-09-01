import { Link } from 'react-router-dom';
import { LogoMark } from './ui';

type Release = {
  date: string;
  title: string;
  updates: string[];
};

const releases: Release[] = [
  {
    date: 'February 24, 2026',
    title: 'Celebration Automation Release',
    updates: [
      'Template lifecycle completed: create, edit, set default, activate/deactivate, and delete.',
      'Duplicate-safe default template assignment flow per organization.',
      'Channel-aware templates now support Email, SMS, and WhatsApp.',
      'Organization settings now include SMS and WhatsApp delivery toggles.',
      'CSV upload now includes AI suggestions for cleaner imports.',
      'International phone number normalization added to import workflow.',
      'Upcoming celebrations view and filtered people workflows added.',
      'Manual send routes added for Email and SMS.',
      'Scheduler automation now respects per-organization timezone and send-time settings.',
      'Same-day dedupe guard prevents duplicate automated sends per channel.',
      'Landing messaging refreshed to position MomentOS as celebration automation across channels.',
    ],
  },
  {
    date: 'February 24, 2026',
    title: 'Website Navigation Update',
    updates: [
      'Changelog moved to a dedicated page and linked from footer Product links.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-700">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <LogoMark size={28} />
            <div className="text-sm font-semibold text-slate-900">MomentOS</div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/docs" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
              Docs
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="max-w-2xl">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Changelog
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Product Updates
          </h1>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Complete record of shipped MomentOS updates.
          </p>
        </div>

        <div className="mt-10 space-y-6">
          {releases.map((release) => (
            <article
              key={`${release.date}-${release.title}`}
              className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold text-slate-900">{release.title}</h2>
                <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {release.date}
                </div>
              </div>
              <ul className="mt-6 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                {release.updates.map((update) => (
                  <li
                    key={update}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    {update}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
