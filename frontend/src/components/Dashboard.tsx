import React, { useState } from 'react';
import CSVUpload from './people/CSVUpload.tsx';
import PeopleList from './people/PeopleList.tsx';
import UpcomingBirthdays from './people/UpcomingBirthdays.tsx';
import Templates from './Templates.tsx';
import Settings from './Settings.tsx';
import AdminDashboard from './admin/AdminDashboard.tsx';

type DashboardProps = {
  user: any;
  onLogout: () => void;
  api: {
    call: (endpoint: string, options?: RequestInit) => Promise<any>;
  };
};

// Dashboard: tabbed navigation for people, templates, and uploads.
export default function Dashboard({ user, onLogout, api }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'people' | 'upcoming' | 'templates' | 'settings'>('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">MomentOS</h1>
          <button
            onClick={onLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-2 sm:gap-4 mb-6 border-b overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-2 px-4 ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2 px-4 ${
              activeTab === 'upload'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upload People
          </button>
          <button
            onClick={() => setActiveTab('people')}
            className={`pb-2 px-4 ${
              activeTab === 'people'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All People
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`pb-2 px-4 ${
              activeTab === 'upcoming'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upcoming Birthdays
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-2 px-4 ${
              activeTab === 'templates'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Email Templates
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2 px-4 ${
              activeTab === 'settings'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Settings
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <AdminDashboard onSelectTab={(tab) => setActiveTab(tab)} />
        )}
        {activeTab === 'upload' && <CSVUpload />}
        {activeTab === 'people' && <PeopleList />}
        {activeTab === 'upcoming' && <UpcomingBirthdays />}
        {activeTab === 'templates' && <Templates api={api} />}
        {activeTab === 'settings' && <Settings api={api} />}
      </div>
    </div>
  );
}
