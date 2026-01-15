import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';

type OverviewStats = {
  totalPeople: number;
  totalTemplates: number;
  activeTemplates: number;
  upcomingBirthdays: number;
  todayDeliveries: {
    total: number;
    successful: number;
    failed: number;
  };
};

type AdminDashboardProps = {
  onSelectTab?: (tab: 'upload' | 'people' | 'upcoming' | 'templates' | 'settings') => void;
};

export default function AdminDashboard({ onSelectTab }: AdminDashboardProps) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
    limit: 25,
  });

  useEffect(() => {
    loadOverview();
    loadSettings();
    loadTemplates();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [filters.page, filters.limit]);

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.call('/admin/overview');
      setStats(data.stats);
      setRecentActivity(data.recentActivity || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await api.call('/settings');
      setSettings(data.organization || {});
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.call('/templates');
      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set('page', String(filters.page));
    params.set('limit', String(filters.limit));
    if (filters.status) {
      params.set('status', filters.status);
    }
    if (filters.dateFrom) {
      params.set('dateFrom', filters.dateFrom);
    }
    if (filters.dateTo) {
      params.set('dateTo', filters.dateTo);
    }
    return params.toString();
  };

  const handleExportLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.status) {
        params.set('status', filters.status);
      }
      if (filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom);
      }
      if (filters.dateTo) {
        params.set('dateTo', filters.dateTo);
      }

      const response = await fetch(`/api/admin/delivery-logs/export?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'delivery-logs.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadLogs = async () => {
    setLogLoading(true);
    setError('');
    try {
      const data = await api.call(`/admin/delivery-logs?${buildQuery()}`);
      setLogs(data.logs || []);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLogLoading(false);
    }
  };

  const handleFilterApply = () => {
    setFilters((prev) => ({ ...prev, page: 1 }));
    loadLogs();
  };

  const handleRetry = async (id: string) => {
    try {
      await api.call(`/admin/delivery-logs/${id}/retry`, { method: 'POST' });
      loadLogs();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const summaryCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'People', value: stats.totalPeople },
      { label: 'Templates', value: stats.totalTemplates },
      { label: 'Active Templates', value: stats.activeTemplates },
      { label: 'Upcoming Birthdays', value: stats.upcomingBirthdays },
    ];
  }, [stats]);

  const checklist = useMemo(() => {
    const hasSender = Boolean(settings?.emailFromAddress);
    const hasPeople = (stats?.totalPeople || 0) > 0;
    const hasDefaultTemplate = templates.some((template) => template.isDefault);
    const hasSchedule =
      settings?.birthdaySendHour !== undefined && settings?.birthdaySendMinute !== undefined;

    return [
      {
        label: 'Set sender email',
        done: hasSender,
        action: () => onSelectTab?.('settings'),
      },
      {
        label: 'Add people',
        done: hasPeople,
        action: () => onSelectTab?.('people'),
      },
      {
        label: 'Choose default template',
        done: hasDefaultTemplate,
        action: () => onSelectTab?.('templates'),
      },
      {
        label: 'Confirm send time',
        done: hasSchedule,
        action: () => onSelectTab?.('settings'),
      },
    ];
  }, [settings, stats, templates, onSelectTab]);

  useEffect(() => {
    const dismissed = localStorage.getItem('onboardingDismissed') === 'true';
    const incomplete = checklist.some((item) => !item.done);
    setShowOnboarding(!dismissed && incomplete);
  }, [checklist]);

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          <strong>Something went wrong:</strong> {error}
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Welcome checklist</h2>
            <p className="text-sm text-gray-600">
              Complete these steps to finish setup.
            </p>
          </div>
          <span className="text-xs text-gray-500">
            {checklist.filter((item) => item.done).length}/{checklist.length} complete
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {checklist.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    item.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {item.done ? '✓' : '•'}
                </span>
                <span className={item.done ? 'text-gray-500' : 'text-gray-800'}>
                  {item.label}
                </span>
              </div>
              {!item.done && (
                <button
                  onClick={item.action}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Configure
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white p-4 rounded-lg shadow">
            <p className="text-xs uppercase text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
        {stats && (
          <div className="bg-white p-4 rounded-lg shadow md:col-span-2">
            <p className="text-xs uppercase text-gray-500 mb-2">Today Deliveries</p>
            <div className="flex gap-4">
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-lg font-semibold">{stats.todayDeliveries.total}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Successful</p>
                <p className="text-lg font-semibold">{stats.todayDeliveries.successful}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Failed</p>
                <p className="text-lg font-semibold">{stats.todayDeliveries.failed}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Recent Activity</h2>
        </div>
        <div className="divide-y">
          {recentActivity.length === 0 ? (
            <div className="p-6 text-sm text-gray-600">No recent deliveries.</div>
          ) : (
            recentActivity.map((log) => (
              <div key={log.id} className="px-6 py-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{log.personName}</p>
                    <p className="text-gray-500">{log.personEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-700">{log.templateName}</p>
                    <p className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                {log.errorMessage && (
                  <p className="mt-2 text-xs text-red-600">{log.errorMessage}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="px-3 py-2 border rounded text-sm"
            >
              <option value="">All</option>
              <option value="SENT">Sent</option>
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed</option>
              <option value="QUEUED">Queued</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              className="px-3 py-2 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="px-3 py-2 border rounded text-sm"
            />
          </div>
          <button
            onClick={handleFilterApply}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Apply Filters
          </button>
          <button
            onClick={handleExportLogs}
            className="text-sm text-blue-600 hover:underline"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Person</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logLoading ? (
                <tr>
                  <td className="px-6 py-4" colSpan={5}>
                    Loading...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-gray-600" colSpan={5}>
                    No delivery logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-4">
                      <p className="font-medium">{log.person.name}</p>
                      <p className="text-xs text-gray-500">{log.person.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium">{log.template.name}</p>
                      <p className="text-xs text-gray-500">{log.template.type}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium uppercase">{log.status}</span>
                      {log.errorMessage && (
                        <p className="text-xs text-red-600">{log.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {log.status === 'FAILED' && (
                        <button
                          onClick={() => handleRetry(log.id)}
                          className="text-blue-600 hover:underline"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination && (
          <div className="px-6 py-4 border-t flex items-center justify-between text-sm">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
                disabled={pagination.page <= 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: Math.min(prev.page + 1, pagination.totalPages),
                  }))
                }
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showOnboarding && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              localStorage.setItem('onboardingDismissed', 'true');
              setShowOnboarding(false);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl bg-white rounded-lg shadow-2xl">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-bold">Welcome to MomentOS</h3>
                <p className="text-sm text-gray-600">Complete the setup steps below.</p>
              </div>
              <div className="p-6 space-y-3">
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                          item.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.done ? '✓' : '•'}
                      </span>
                      <span className={item.done ? 'text-gray-500' : 'text-gray-800'}>
                        {item.label}
                      </span>
                    </div>
                    {!item.done && (
                      <button
                        onClick={() => {
                          item.action?.();
                          localStorage.setItem('onboardingDismissed', 'true');
                          setShowOnboarding(false);
                        }}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Go
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t flex justify-end">
                <button
                  onClick={() => {
                    localStorage.setItem('onboardingDismissed', 'true');
                    setShowOnboarding(false);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
