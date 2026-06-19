import { useEffect, useState } from 'react';
import { api } from '../../api';
import { cn } from '../ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type Person = {
  id: string;
  fullName: string;
  department?: string | null;
  birthday?: string | null;
  workStartDate?: string | null;
};

type CelebEvent = {
  key: string;
  name: string;
  dept: string;
  initials: string;
  shortName: string;
  anniv: boolean;
  years?: number;
  sub: string;
  color: string;
};

type DayCell = {
  day: number;
  iso: string;
  isToday: boolean;
  isPast: boolean;
  events: CelebEvent[];
  isBlank: false;
};

type BlankCell = { isBlank: true };

type Cell = DayCell | BlankCell;

type SelDay = {
  weekday: string;
  dateLabel: string;
  events: CelebEvent[];
};

type ListGroup = {
  dayNum: number;
  dateLabel: string;
  events: CelebEvent[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) {
  return n < 10 ? '0' + n : '' + n;
}

function toISO(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m: m - 1, d };
}

function ord(n: number) {
  const v = n % 100;
  const suffixes = ['th', 'st', 'nd', 'rd'];
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function getShortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
}

function buildEvents(
  people: Person[],
  year: number,
  month: number,
): Record<number, CelebEvent[]> {
  const byDay: Record<number, CelebEvent[]> = {};
  const add = (d: number, ev: CelebEvent) => {
    (byDay[d] = byDay[d] || []).push(ev);
  };

  people.forEach((p) => {
    if (p.birthday) {
      const b = parseISO(p.birthday.split('T')[0]);
      if (b.m === month) {
        add(b.d, {
          key: p.id + '-b',
          name: p.fullName,
          dept: p.department || '',
          initials: getInitials(p.fullName),
          shortName: getShortName(p.fullName),
          anniv: false,
          sub: 'Birthday',
          color: '#2563eb',
        });
      }
    }
    if (p.workStartDate) {
      const s = parseISO(p.workStartDate.split('T')[0]);
      const years = year - s.y;
      if (s.m === month && years >= 1) {
        add(s.d, {
          key: p.id + '-a',
          name: p.fullName,
          dept: p.department || '',
          initials: getInitials(p.fullName),
          shortName: getShortName(p.fullName),
          anniv: true,
          years,
          sub: ord(years) + ' work anniversary',
          color: '#7e22ce',
        });
      }
    }
  });

  return byDay;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ initials, anniv }: { initials: string; anniv: boolean }) {
  return (
    <span
      className="ds-avatar flex-shrink-0"
      style={{
        background: anniv ? '#f3e8ff' : '#dbeafe',
        color: anniv ? '#7e22ce' : '#1d4ed8',
      }}
    >
      {initials}
    </span>
  );
}

function EventPill({ ev, compact }: { ev: CelebEvent; compact?: boolean }) {
  const tint = ev.anniv ? '#f3e8ff' : '#dbeafe';
  const ink = ev.anniv ? '#7e22ce' : '#1d4ed8';
  return (
    <div
      className="flex items-center gap-1 overflow-hidden rounded-md px-1.5 py-0.5"
      style={{ background: tint, color: ink, fontSize: 11, fontWeight: 600, lineHeight: 1.35 }}
      title={ev.name + ' · ' + ev.sub}
    >
      <span
        className="flex-shrink-0 rounded-full"
        style={{ width: 6, height: 6, background: ev.color }}
      />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {compact ? ev.shortName : ev.shortName}
      </span>
      {ev.anniv && (
        <span className="ml-auto pl-1 opacity-70" style={{ fontSize: 10, fontWeight: 700 }}>
          {ev.years}yr
        </span>
      )}
    </div>
  );
}

function EventRow({ ev }: { ev: CelebEvent }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-[18px] py-[13px]">
      <Avatar initials={ev.initials} anniv={ev.anniv} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{ev.name}</div>
        <div className="mt-0.5 text-xs text-slate-500">{ev.sub}</div>
      </div>
      {ev.dept && (
        <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {ev.dept}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UpcomingCelebrations() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const today = new Date();
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selISO, setSelISO] = useState<string | null>(null);
  const [showB, setShowB] = useState(true);
  const [showA, setShowA] = useState(true);

  useEffect(() => {
    api
      .call('/people')
      .then((data) => setPeople(data.people || []))
      .catch(() => setError('Unable to load people.'))
      .finally(() => setLoading(false));
  }, []);

  function navMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m);
    setYear(y);
    setSelISO(null);
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelISO(null);
  }

  // Build grid
  const byDay = buildEvents(people, year, month);
  const passFilter = (e: CelebEvent) => (e.anniv ? showA : showB);
  const filteredByDay: Record<number, CelebEvent[]> = {};
  Object.entries(byDay).forEach(([d, evs]) => {
    const filtered = evs.filter(passFilter);
    if (filtered.length) filteredByDay[+d] = filtered;
  });

  const dim = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const cells: Cell[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ isBlank: true });
  for (let d = 1; d <= dim; d++) {
    const iso = toISO(year, month, d);
    cells.push({
      isBlank: false,
      day: d,
      iso,
      isToday: iso === todayISO,
      isPast: iso < todayISO,
      events: filteredByDay[d] || [],
    });
  }
  while (cells.length % 7 !== 0) cells.push({ isBlank: true });

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Selected day panel
  let selDay: SelDay | null = null;
  if (selISO) {
    const p = parseISO(selISO);
    if (p.y === year && p.m === month) {
      const evs = filteredByDay[p.d];
      if (evs?.length) {
        const dt = new Date(p.y, p.m, p.d);
        selDay = {
          weekday: dt.toLocaleDateString('en-US', { weekday: 'long' }),
          dateLabel: dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
          events: evs,
        };
      }
    }
  }

  // List groups
  const listGroups: ListGroup[] = [];
  for (let d = 1; d <= dim; d++) {
    const evs = filteredByDay[d];
    if (!evs?.length) continue;
    const dt = new Date(year, month, d);
    listGroups.push({
      dayNum: d,
      dateLabel: dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
      events: evs,
    });
  }

  // Counts (unfiltered for display in chips)
  let bCount = 0, aCount = 0;
  Object.values(byDay).forEach((arr) => arr.forEach((e) => { if (e.anniv) aCount++; else bCount++; }));
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthEmpty = Object.keys(filteredByDay).length === 0;

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ── Shared toolbar ──────────────────────────────────────────────────────────
  const NavBtn = ({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) => (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
      style={{ fontSize: 20, lineHeight: 1 }}
    >
      {children}
    </button>
  );

  const FilterChip = ({
    active, color, bg, border, dot, label, onClick,
  }: {
    active: boolean; color: string; bg: string; border: string; dot: string; label: string; onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition"
      style={{
        border: '1px solid ' + (active ? border : '#e2e8f0'),
        background: active ? bg : '#fff',
        color: active ? color : '#94a3b8',
        fontFamily: 'inherit',
      }}
    >
      <span
        className="flex-shrink-0 rounded-full"
        style={{ width: 9, height: 9, background: active ? dot : '#cbd5e1' }}
      />
      {label}
    </button>
  );

  const ViewToggle = ({ sm }: { sm?: boolean }) => (
    <div
      className="flex rounded-lg border border-slate-200 bg-white p-1"
    >
      {(['calendar', 'list'] as const).map((v) => (
        <button
          key={v}
          onClick={() => { setView(v); setSelISO(null); }}
          className="rounded-md px-3 border-none font-semibold transition"
          style={{
            padding: sm ? '5px 11px' : '7px 16px',
            fontSize: sm ? 12 : 14,
            fontFamily: 'inherit',
            background: view === v ? '#2563eb' : 'transparent',
            color: view === v ? '#fff' : '#64748b',
            cursor: 'pointer',
          }}
        >
          {sm ? (v === 'calendar' ? 'Cal' : 'List') : v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );

  // ── Loading / error states ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        Loading celebrations…
      </div>
    );
  }

  if (error) {
    return (
      <div className="ds-surface p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          className="ds-btn ds-btn-secondary ds-btn-sm mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────────
  const DesktopView = () => (
    <div className="hidden md:block">
      {/* Page header */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold text-slate-900"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.03em' }}
          >
            Upcoming Celebrations
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Birthdays and work anniversaries across your organization.
          </p>
        </div>
        <ViewToggle />
      </div>

      {/* Month nav row */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <NavBtn onClick={() => navMonth(-1)} label="Previous month">‹</NavBtn>
          <div
            className="min-w-[172px] text-center text-lg font-bold text-slate-900"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.02em' }}
          >
            {monthLabel}
          </div>
          <NavBtn onClick={() => navMonth(1)} label="Next month">›</NavBtn>
          <button className="ds-btn ds-btn-secondary ds-btn-sm ml-1" onClick={goToday}>
            Today
          </button>
        </div>
        <div className="text-sm text-slate-500">
          {bCount} {bCount === 1 ? 'birthday' : 'birthdays'} · {aCount} {aCount === 1 ? 'anniversary' : 'anniversaries'} this month
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <FilterChip
            active={showB} label="Birthdays"
            color="#1d4ed8" bg="#eff5ff" border="#bfdbfe" dot="#2563eb"
            onClick={() => setShowB((v) => !v)}
          />
          <FilterChip
            active={showA} label="Anniversaries"
            color="#7e22ce" bg="#faf5ff" border="#e9d5ff" dot="#7e22ce"
            onClick={() => setShowA((v) => !v)}
          />
        </div>
      </div>

      {/* Calendar / List body */}
      {view === 'calendar' ? (
        <div className="flex items-start gap-5">
          {/* Grid */}
          <div className="ds-card min-w-0 flex-1 p-3.5">
            {/* Weekday headers */}
            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className="pb-1 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400"
                >
                  {wd}
                </div>
              ))}
            </div>
            {/* Weeks */}
            <div className="flex flex-col gap-1.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {week.map((cell, ci) => {
                    if (cell.isBlank) {
                      return (
                        <div
                          key={ci}
                          className="min-h-[104px] rounded-[10px] border border-slate-100 bg-slate-50"
                        />
                      );
                    }
                    const c = cell as DayCell;
                    const selected = selISO === c.iso;
                    const hasEvts = c.events.length > 0;
                    const fade = c.isPast && !c.isToday;
                    const shown = c.events.slice(0, 2);
                    const more = c.events.length - 2;

                    return (
                      <div
                        key={ci}
                        onClick={hasEvts ? () => setSelISO(selected ? null : c.iso) : undefined}
                        className={cn(
                          'flex min-h-[104px] flex-col gap-1.5 overflow-hidden rounded-[10px] border p-2 transition',
                          hasEvts && 'cursor-pointer',
                          selected
                            ? 'border-blue-500 shadow-[0_0_0_2px_rgba(37,99,235,0.18)]'
                            : 'border-slate-200',
                          c.isToday ? 'bg-blue-50/60' : c.isPast ? 'bg-[#fcfdfe]' : 'bg-white',
                        )}
                      >
                        {/* Day number */}
                        <div className="flex items-center">
                          <span
                            className={cn(
                              'inline-flex items-center justify-center text-[13px] font-semibold',
                              c.isToday
                                ? 'h-[23px] w-[23px] rounded-full bg-blue-600 text-white font-bold'
                                : fade
                                  ? 'text-slate-400'
                                  : 'text-slate-700',
                            )}
                          >
                            {c.day}
                          </span>
                        </div>
                        {/* Pills */}
                        <div
                          className="flex flex-col gap-[3px]"
                          style={{ opacity: fade ? 0.5 : 1 }}
                        >
                          {shown.map((ev) => (
                            <EventPill key={ev.key} ev={ev} />
                          ))}
                          {more > 0 && (
                            <div className="pl-0.5 text-[11px] font-semibold text-slate-500">
                              +{more} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {monthEmpty && (
              <p className="py-6 text-center text-sm text-slate-400">
                No celebrations this month.
              </p>
            )}
          </div>

          {/* Day detail panel */}
          {selDay && (
            <div className="ds-card w-[330px] flex-shrink-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-[18px] py-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {selDay.weekday}
                  </div>
                  <div
                    className="mt-0.5 text-lg font-bold text-slate-900"
                    style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.02em' }}
                  >
                    {selDay.dateLabel}
                  </div>
                </div>
                <button
                  className="ds-icon-trigger"
                  aria-label="Close"
                  onClick={() => setSelISO(null)}
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-col">
                {selDay.events.map((ev) => (
                  <EventRow key={ev.key} ev={ev} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List view */
        <div className="ds-card overflow-hidden">
          {monthEmpty ? (
            <p className="py-10 text-center text-sm text-slate-400">No celebrations this month.</p>
          ) : (
            listGroups.map((g) => (
              <div key={g.dayNum}>
                {/* Group header */}
                <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-[18px] py-2.5">
                  <span
                    className="inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ background: '#eff5ff', color: '#1d4ed8' }}
                  >
                    {g.dayNum}
                  </span>
                  <span className="text-sm font-bold text-slate-700">{g.dateLabel}</span>
                </div>
                {g.events.map((ev) => (
                  <EventRow key={ev.key} ev={ev} />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────────
  const MobileView = () => (
    <div className="relative flex flex-col md:hidden" style={{ minHeight: '100vh' }}>
      {/* Mobile header */}
      <div className="border-b border-slate-200 bg-white pb-2.5 pt-3.5">
        <div className="flex items-center gap-2.5 px-4 mb-3">
          <span
            className="font-bold text-base text-slate-900"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.02em' }}
          >
            Upcoming
          </span>
          <div className="flex-1" />
          <ViewToggle sm />
        </div>
        <div className="flex items-center gap-2 px-4">
          <NavBtn onClick={() => navMonth(-1)} label="Previous month">‹</NavBtn>
          <div
            className="flex-1 text-center font-bold text-[17px] text-slate-900"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.02em' }}
          >
            {monthLabel}
          </div>
          <NavBtn onClick={() => navMonth(1)} label="Next month">›</NavBtn>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto px-4 pt-2.5 pb-0.5">
          <FilterChip
            active={showB} label="Birthdays"
            color="#1d4ed8" bg="#eff5ff" border="#bfdbfe" dot="#2563eb"
            onClick={() => setShowB((v) => !v)}
          />
          <FilterChip
            active={showA} label="Anniversaries"
            color="#7e22ce" bg="#faf5ff" border="#e9d5ff" dot="#7e22ce"
            onClick={() => setShowA((v) => !v)}
          />
        </div>
      </div>

      {/* Mobile body */}
      <div className="flex-1 overflow-y-auto px-3 py-3.5 pb-8">
        {view === 'calendar' ? (
          <>
            <p className="mb-2.5 ml-0.5 text-xs text-slate-500">
              {bCount} {bCount === 1 ? 'birthday' : 'birthdays'} · {aCount} {aCount === 1 ? 'anniversary' : 'anniversaries'} this month
            </p>
            {/* Compact dot grid */}
            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, i) => (
                <div key={i} className="text-center text-[10px] font-bold text-slate-400">
                  {wd}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-0.5">
                  {week.map((cell, ci) => {
                    if (cell.isBlank) {
                      return <div key={ci} className="h-[52px] rounded-[10px]" />;
                    }
                    const c = cell as DayCell;
                    const selected = selISO === c.iso;
                    const hasEvts = c.events.length > 0;
                    const fade = c.isPast && !c.isToday;

                    return (
                      <div
                        key={ci}
                        onClick={hasEvts ? () => setSelISO(selected ? null : c.iso) : undefined}
                        className={cn(
                          'flex h-[52px] flex-col items-center gap-1 rounded-[10px] pt-1.5',
                          hasEvts && 'cursor-pointer',
                          selected
                            ? 'bg-blue-50 shadow-[inset_0_0_0_1px_#93c5fd]'
                            : 'bg-transparent',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center text-[13px] font-semibold',
                            c.isToday
                              ? 'rounded-full bg-blue-600 text-white font-bold'
                              : fade
                                ? 'text-slate-400'
                                : 'text-slate-700',
                          )}
                        >
                          {c.day}
                        </span>
                        {/* Dots */}
                        <div className="flex h-1.5 items-center gap-0.5">
                          {c.events.slice(0, 4).map((ev, di) => (
                            <span
                              key={di}
                              className="rounded-full"
                              style={{
                                width: 5,
                                height: 5,
                                background: ev.color,
                                opacity: fade ? 0.5 : 1,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {monthEmpty && (
              <p className="py-6 text-center text-sm text-slate-400">No celebrations this month.</p>
            )}
          </>
        ) : (
          /* Mobile list */
          <div className="flex flex-col gap-3.5">
            {monthEmpty ? (
              <p className="py-10 text-center text-sm text-slate-400">No celebrations this month.</p>
            ) : (
              listGroups.map((g) => (
                <div key={g.dayNum}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                      style={{ background: '#eff5ff', color: '#1d4ed8' }}
                    >
                      {g.dayNum}
                    </span>
                    <span className="text-sm font-bold text-slate-700">{g.dateLabel}</span>
                  </div>
                  <div className="ds-card overflow-hidden">
                    {g.events.map((ev) => (
                      <div
                        key={ev.key}
                        className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-3"
                      >
                        <Avatar initials={ev.initials} anniv={ev.anniv} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900">{ev.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{ev.sub}</div>
                        </div>
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ background: ev.color }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {selDay && (
        <>
          <div
            className="absolute inset-0 z-20 bg-slate-900/40"
            onClick={() => setSelISO(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 z-30 flex max-h-[72%] flex-col rounded-t-[18px] bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.18)]">
            <div className="flex justify-center pt-2">
              <div className="h-1 w-9 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-[18px] pb-3 pt-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  {selDay.weekday}
                </div>
                <div
                  className="mt-0.5 text-lg font-bold text-slate-900"
                  style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.02em' }}
                >
                  {selDay.dateLabel}
                </div>
              </div>
              <button className="ds-icon-trigger" aria-label="Close" onClick={() => setSelISO(null)}>
                ✕
              </button>
            </div>
            <div className="overflow-y-auto">
              {selDay.events.map((ev) => (
                <EventRow key={ev.key} ev={ev} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <DesktopView />
      <MobileView />
    </>
  );
}
