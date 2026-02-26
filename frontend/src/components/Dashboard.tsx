import { Suspense, lazy, useEffect, useState } from 'react';
import { OnboardingState } from '../types/onboarding';
import { Button, cn } from './ui';
import FeedbackWidget from './feedback/FeedbackWidget';

const CSVUpload = lazy(() => import('./people/CSVUpload.tsx'));
const PeopleList = lazy(() => import('./people/PeopleList.tsx'));
const UpcomingBirthdays = lazy(() => import('./people/UpcomingBirthdays.tsx'));
const Templates = lazy(() => import('./Templates.tsx'));
const Settings = lazy(() => import('./Settings.tsx'));
const AdminDashboard = lazy(() => import('./admin/AdminDashboard.tsx'));
const Moments = lazy(() => import('./Moments.tsx'));

type DashboardProps = {
  user: any;
  onLogout: () => void;
  api: {
    call: (endpoint: string, options?: RequestInit) => Promise<any>;
  };
};

// Dashboard: tabbed navigation for people, templates, and uploads.
export default function Dashboard({ onLogout, api }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'people' | 'upcoming' | 'templates' | 'moments' | 'settings'>('dashboard');
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [guidedMode, setGuidedMode] = useState(false);

  const refreshOnboarding = async () => {
    try {
      const data = await api.call('/onboarding/status');
      setOnboarding(data.onboarding || data);
    } catch (err) {
      console.error('Onboarding fetch failed', err);
    }
  };

  useEffect(() => {
    refreshOnboarding();
  }, []);

  const hasFirstSend = onboarding?.hasFirstSend ?? false;
  const hasTestSend = onboarding?.completedSteps?.includes('send_test_email') ?? false;

  useEffect(() => {
    if (!hasFirstSend && activeTab === 'upcoming') {
      setActiveTab('dashboard');
    }
  }, [hasFirstSend, activeTab]);

  const handleOnboardingUpdate = (next: OnboardingState) => {
    setOnboarding(next);
    if (next.progress.completed >= next.progress.total) {
      setGuidedMode(false);
    }
    if (guidedMode && next.progress.completed < next.progress.total && next.currentStepId) {
      const activeStep = next.steps.find((step) => step.id === next.currentStepId);
      if (activeStep) {
        setActiveTab(activeStep.route);
      }
    }
  };

  const renderFallback = (label: string) => (
    <div className="text-center py-8 text-sm text-gray-500">Loading {label}...</div>
  );

  const tabs: Array<{
    id: 'dashboard' | 'upload' | 'people' | 'upcoming' | 'templates' | 'moments' | 'settings';
    label: string;
    hidden?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'upload', label: 'Upload People' },
    { id: 'people', label: 'All People' },
    { id: 'upcoming', label: 'Upcoming Birthdays', hidden: !hasFirstSend },
    { id: 'templates', label: 'Email Templates' },
    { id: 'moments', label: 'Moments' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="ds-page">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
              MO
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">MomentOS</h1>
              <p className="text-xs text-slate-500">Celebration automation workspace</p>
            </div>
          </div>
          <Button onClick={onLogout} variant="secondary" size="sm">
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="mb-6 ds-tablist">
          {tabs.filter((tab) => !tab.hidden).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn('ds-tab', activeTab === tab.id && 'ds-tab-active')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <Suspense fallback={renderFallback('dashboard')}>
            <AdminDashboard
              onSelectTab={(tab) => setActiveTab(tab)}
              onboarding={onboarding}
              onRefreshOnboarding={refreshOnboarding}
              onStartGuided={() => {
                setGuidedMode(true);
                const nextStep = onboarding?.steps.find((step) => step.status === 'active');
                if (nextStep) {
                  setActiveTab(nextStep.route);
                } else {
                  setActiveTab('people');
                }
              }}
            />
          </Suspense>
        )}
        {activeTab === 'upload' && (
          <Suspense fallback={renderFallback('upload tools')}>
            <CSVUpload
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          </Suspense>
        )}
        {activeTab === 'people' && (
          <Suspense fallback={renderFallback('people')}>
            <PeopleList
              allowManualSend={hasFirstSend || hasTestSend}
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          </Suspense>
        )}
        {activeTab === 'upcoming' && (
          <Suspense fallback={renderFallback('upcoming birthdays')}>
            <UpcomingBirthdays />
          </Suspense>
        )}
        {activeTab === 'templates' && (
          <Suspense fallback={renderFallback('templates')}>
            <Templates
              api={api}
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          </Suspense>
        )}
        {activeTab === 'settings' && (
          <Suspense fallback={renderFallback('settings')}>
            <Settings
              api={api}
              onboarding={onboarding}
              onOnboardingUpdate={handleOnboardingUpdate}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          </Suspense>
        )}
        {activeTab === 'moments' && (
          <Suspense fallback={renderFallback('moments')}>
            <Moments api={api} onOpenPeople={() => setActiveTab('people')} />
          </Suspense>
        )}
      </main>
      <FeedbackWidget api={api} />
    </div>
  );
}
