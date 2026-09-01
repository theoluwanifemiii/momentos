import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { OnboardingState } from '../../types/onboarding';
import OnboardingProgress from '../onboarding/OnboardingProgress';
import { Button } from '../ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type OverviewStats = {
  totalPeople: number;
  totalTemplates: number;
  activeTemplates: number;
  upcomingBirthdays: number;
  totalDeliveries: number;
  totalSuccessfulDeliveries: number;
  todayDeliveries: { total: number; successful: number; failed: number };
  deliveryFailures: {
    last24h: number;
    last7d: number;
    byChannel24h: { email: number; sms: number; whatsapp: number };
  };
  observability: { recentErrorCount: number; lastErrorAt: string | null };
};

type Person = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string | null;
  department?: string | null;
  birthday?: string | null;
  workStartDate?: string | null;
};

type AdminDashboardProps = {
  onSelectTab?: (tab: 'upload' | 'people' | 'upcoming' | 'templates' | 'settings') => void;
  onboarding: OnboardingState | null;
  onRefreshOnboarding?: () => void;
  onStartGuided?: () => void;
  onLogout?: () => void;
  userEmail?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-blue-100 text-blue-700',
  'bg-amber-100 text-amber-700',
];

function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function upcomingDateThisYear(dateStr: string): Date {
  const [, m, d] = dateStr.split('T')[0].split('-').map(Number);
  const now = new Date();
  const candidate = new Date(now.getFullYear(), m - 1, d);
  if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
  return candidate;
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const [, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return m - 1 === now.getMonth() && d === now.getDate();
}

function isThisMonth(dateStr: string): boolean {
  const [, m] = dateStr.split('T')[0].split('-').map(Number);
  return m - 1 === new Date().getMonth();
}

function isThisWeek(dateStr: string): boolean {
  const target = upcomingDateThisYear(dateStr);
  const now = new Date();
  const diff = (target.getTime() - now.getTime()) / 86400000;
  return diff >= 0 && diff <= 7;
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(new Date().getFullYear(), m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const dy = Math.floor(diff / 86400000);
  if (m < 2) return 'Just now';
  if (m < 60) return `${m} minutes ago`;
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  if (dy === 1) return 'Yesterday';
  return `${dy} days ago`;
}

function firstName(email?: string): string {
  if (!email) return 'there';
  const local = email.split('@')[0];
  const parts = local.split(/[.\-_]/);
  const name = parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function anniversaryLabel(dateStr: string): string {
  const year = Number(dateStr.split('T')[0].split('-')[0]);
  const years = new Date().getFullYear() - year;
  if (years <= 0) return 'Work anniversary';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = years % 100;
  return `${years}${s[(v - 20) % 10] || s[v] || s[0]} work anniversary`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <div className={`${sz} flex shrink-0 items-center justify-center rounded-full font-semibold ${avatarColor(name)}`}>
      {initials(name)}
    </div>
  );
}

type CelebEntry = {
  id: string;
  person: Person;
  type: 'Birthday' | 'Anniversary';
  date: string;
  upcomingDate: Date;
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard({
  onSelectTab,
  onboarding,
  onRefreshOnboarding,
  onStartGuided,
  userEmail,
}: AdminDashboardProps) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<Person[]>([]);
  const [anniversaries, setAnniversaries] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [celebFilter, setCelebFilter] = useState<'all' | 'birthday' | 'anniversary'>('all');

  useEffect(() => {
    load();
    onRefreshOnboarding?.();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [overview, bdays, annivs] = await Promise.all([
        api.call('/admin/overview'),
        api.call('/people/upcoming').catch(() => ({ upcoming: [] })),
        api.call('/people/upcoming-anniversaries').catch(() => ({ upcoming: [] })),
      ]);
      setStats(overview.stats);
      setRecentActivity(overview.recentActivity || []);
      setBirthdays(bdays.upcoming || []);
      setAnniversaries(annivs.upcoming || []);
    } catch {
      // stats stays null — empty state shown
    } finally {
      setLoading(false);
    }
  };

  // Computed stats
  const birthdaysThisMonth = useMemo(
    () => birthdays.filter((p) => p.birthday && isThisMonth(p.birthday)).length,
    [birthdays]
  );
  const anniversariesThisMonth = useMemo(
    () => anniversaries.filter((p) => p.workStartDate && isThisMonth(p.workStartDate)).length,
    [anniversaries]
  );
  const upcomingThisWeek = useMemo(() => {
    const b = birthdays.filter((p) => p.birthday && isThisWeek(p.birthday)).length;
    const a = anniversaries.filter((p) => p.workStartDate && isThisWeek(p.workStartDate)).length;
    return b + a;
  }, [birthdays, anniversaries]);

  // Combined upcoming list, sorted by date
  const allCelebrations = useMemo((): CelebEntry[] => {
    const entries: CelebEntry[] = [
      ...birthdays
        .filter((p) => p.birthday)
        .map((p) => ({
          id: p.id + '-b',
          person: p,
          type: 'Birthday' as const,
          date: p.birthday!,
          upcomingDate: upcomingDateThisYear(p.birthday!),
        })),
      ...anniversaries
        .filter((p) => p.workStartDate)
        .map((p) => ({
          id: p.id + '-a',
          person: p,
          type: 'Anniversary' as const,
          date: p.workStartDate!,
          upcomingDate: upcomingDateThisYear(p.workStartDate!),
        })),
    ];
    return entries.sort((a, b) => a.upcomingDate.getTime() - b.upcomingDate.getTime());
  }, [birthdays, anniversaries]);

  const filteredCelebrations = useMemo(() => {
    if (celebFilter === 'birthday') return allCelebrations.filter((e) => e.type === 'Birthday');
    if (celebFilter === 'anniversary') return allCelebrations.filter((e) => e.type === 'Anniversary');
    return allCelebrations;
  }, [allCelebrations, celebFilter]);

  // Today's celebrations
  const todayCelebrations = useMemo((): Array<{ name: string; label: string }> => {
    const result: Array<{ name: string; label: string }> = [];
    birthdays.filter((p) => p.birthday && isToday(p.birthday)).forEach((p) =>
      result.push({ name: p.fullName, label: 'Birthday today' })
    );
    anniversaries.filter((p) => p.workStartDate && isToday(p.workStartDate)).forEach((p) =>
      result.push({ name: p.fullName, label: anniversaryLabel(p.workStartDate!) })
    );
    return result;
  }, [birthdays, anniversaries]);

  const hasFirstSend = onboarding?.hasFirstSend ?? (stats?.totalSuccessfulDeliveries || 0) > 0;
  const hasPeople = onboarding?.hasPeople ?? (stats?.totalPeople || 0) > 0;

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">Loading dashboard…</div>
    );
  }

  // ── Onboarding: no people yet ──
  if (!hasPeople) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Let's send your first birthday</h2>
        <p className="text-slate-500">
          Upload your team and send your first automated birthday message in minutes.
        </p>
        <Button onClick={() => onSelectTab?.('people')}>Get started</Button>
        {onboarding && onboarding.progress.total > 0 && (
          <div className="mt-6">
            <OnboardingProgress onboarding={onboarding} />
          </div>
        )}
      </div>
    );
  }

  // ── Main dashboard layout ──
  return (
    <div className="space-y-6">
      {/* Onboarding banner */}
      {!hasFirstSend && onboarding && onboarding.progress.completed < onboarding.progress.total && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-blue-900">Complete your setup</p>
              <p className="text-sm text-blue-700">
                {onboarding.progress.completed}/{onboarding.progress.total} steps done
              </p>
            </div>
            <Button size="sm" onClick={onStartGuided}>Continue setup</Button>
          </div>
          <div className="mt-3">
            <OnboardingProgress onboarding={onboarding} />
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back, {firstName(userEmail)}. Here's what's coming up.
          </p>
        </div>
        <Button onClick={() => onSelectTab?.('people')} size="sm">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add Person
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total People" value={stats?.totalPeople ?? 0} />
        <StatCard label="Upcoming This Week" value={upcomingThisWeek} />
        <StatCard label="Birthdays This Month" value={birthdaysThisMonth} />
        <StatCard label="Anniversaries This Month" value={anniversariesThisMonth} />
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 items-start">
        {/* Left: Upcoming Celebrations table */}
        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* Card header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Upcoming Celebrations</h2>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {([['all', 'All'], ['birthday', 'Birthdays'], ['anniversary', 'Anniversaries']] as const).map(
                  ([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setCelebFilter(val)}
                      className={[
                        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                        celebFilter === val
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Channels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredCelebrations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                        No upcoming celebrations in the next 30 days.
                      </td>
                    </tr>
                  ) : (
                    filteredCelebrations.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={entry.person.fullName} />
                            <span className="font-medium text-slate-800">{entry.person.fullName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              entry.type === 'Birthday'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-violet-50 text-violet-700',
                            ].join(' ')}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3 text-slate-500">{entry.person.department || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {/* Email dot */}
                            <span className="h-2 w-2 rounded-full bg-blue-500" title="Email" />
                            {/* SMS dot — only if phone present */}
                            {entry.person.phone && (
                              <span className="h-2 w-2 rounded-full bg-emerald-500" title="SMS" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-72 shrink-0 space-y-4">
          {/* Today's Celebrations */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Today's Celebrations</h3>
            {todayCelebrations.length === 0 ? (
              <p className="text-xs text-slate-400">No celebrations today.</p>
            ) : (
              <div className="space-y-3">
                {todayCelebrations.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-slate-50">
                      <svg width="14" height="14" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                        <circle cx="24" cy="24" r="16.5" stroke="#64748b" strokeWidth="7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Quick Actions</h3>
            <div className="space-y-1">
              {[
                {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 1a4 4 0 1 1 0 8A4 4 0 0 1 8 1zm0 9c4 0 7 1.79 7 4v1H1v-1c0-2.21 3-4 7-4z" fill="currentColor" opacity=".7"/>
                    </svg>
                  ),
                  label: 'Add new person',
                  action: () => onSelectTab?.('people'),
                },
                {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 1v9M4 6l4 4 4-4M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                  label: 'Upload CSV',
                  action: () => onSelectTab?.('upload'),
                },
                {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ),
                  label: 'Manage templates',
                  action: () => onSelectTab?.('templates'),
                },
                {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="1" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M1 7h14M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ),
                  label: 'View upcoming',
                  action: () => onSelectTab?.('upcoming'),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <span className="text-slate-400">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Recent Activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-slate-400">No recent activity yet.</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map((log) => (
                  <div key={log.id}>
                    <p className="text-xs text-slate-700 leading-snug">
                      Birthday message sent to{' '}
                      <span className="font-medium">{log.personName}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">{relativeTime(log.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
