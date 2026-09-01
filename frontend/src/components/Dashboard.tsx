import { Suspense, lazy, useEffect, useState } from 'react';
import { OnboardingState } from '../types/onboarding';
import { api } from '../api';
import { cn, LogoMark } from './ui';
import FeedbackWidget from './feedback/FeedbackWidget';

const CSVUpload = lazy(() => import('./people/CSVUpload.tsx'));
const PeopleList = lazy(() => import('./people/PeopleList.tsx'));
const Templates = lazy(() => import('./Templates.tsx'));
const Settings = lazy(() => import('./Settings.tsx'));
const AdminDashboard = lazy(() => import('./admin/AdminDashboard.tsx'));
const Moments = lazy(() => import('./Moments.tsx'));
const SavingsCampaign = lazy(() => import('./SavingsCampaign.tsx'));

type Tab = 'dashboard' | 'upload' | 'people' | 'upcoming' | 'templates' | 'moments' | 'savings' | 'settings';

type DashboardProps = {
  user: any;
  onLogout: () => void;
  api: {
    call: (endpoint: string, options?: RequestInit) => Promise<any>;
  };
};

function getEmailInitials(email: string): string {
  const local = email?.split('@')[0] ?? '';
  const parts = local.split(/[.\-_]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function getNameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const visibleTabs: Array<{ id: Tab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'people', label: 'People' },
  { id: 'moments', label: 'Moments' },
  { id: 'savings', label: 'Savings' },
  { id: 'templates', label: 'Templates' },
  { id: 'settings', label: 'Settings' },
];

export default function Dashboard({ user, onLogout, api: apiProp }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [orgName, setOrgName] = useState<string>('');

  const refreshOnboarding = async () => {
    try {
      const data = await apiProp.call('/onboarding/status');
      setOnboarding(data.onboarding || data);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    refreshOnboarding();
    api.call('/settings').then((d) => {
      setOrgName(d?.organization?.name || d?.organization?.emailFromName || '');
    }).catch(() => {});
  }, []);

  const handleOnboardingUpdate = (next: OnboardingState) => {
    setOnboarding(next);
  };

  const renderFallback = (label: string) => (
    <div className="py-10 text-center text-sm text-slate-400">Loading {label}…</div>
  );

  const initials = user?.email
    ? getEmailInitials(user.email)
    : orgName
      ? getNameInitials(orgName)
      : '?';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className="text-sm font-semibold text-slate-900">MomentOS</span>
          </div>
          <div className="flex items-center gap-3">
            {orgName && (
              <span className="text-sm text-slate-500">{orgName}</span>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {initials}
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mx-auto max-w-7xl px-6">
          <nav className="flex gap-1 pb-2">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Suspense fallback={renderFallback('dashboard')}>
          {activeTab === 'dashboard' && (
            <AdminDashboard
              onSelectTab={(tab) => setActiveTab(tab)}
              onboarding={onboarding}
              onRefreshOnboarding={refreshOnboarding}
              onStartGuided={() => setActiveTab('people')}
              onLogout={onLogout}
              userEmail={user?.email}
            />
          )}
        </Suspense>
        <Suspense fallback={renderFallback('upload')}>
          {activeTab === 'upload' && (
            <CSVUpload
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          )}
        </Suspense>
        <Suspense fallback={renderFallback('people')}>
          {activeTab === 'people' && (
            <PeopleList
              allowManualSend={true}
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          )}
        </Suspense>
        <Suspense fallback={renderFallback('templates')}>
          {activeTab === 'templates' && (
            <Templates
              api={apiProp}
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          )}
        </Suspense>
        <Suspense fallback={renderFallback('settings')}>
          {activeTab === 'settings' && (
            <Settings
              api={apiProp}
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          )}
        </Suspense>
        <Suspense fallback={renderFallback('moments')}>
          {activeTab === 'moments' && (
            <Moments api={apiProp} onOpenPeople={() => setActiveTab('people')} />
          )}
        </Suspense>
        <Suspense fallback={renderFallback('savings campaign')}>
          {activeTab === 'savings' && <SavingsCampaign api={apiProp} />}
        </Suspense>
      </main>

      <FeedbackWidget api={apiProp} />
    </div>
  );
}
