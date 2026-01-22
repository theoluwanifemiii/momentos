import { useEffect, useMemo, useState } from 'react';
import { OnboardingState } from '../types/onboarding';
import NextStepPanel from './onboarding/NextStepPanel';
import OnboardingBanner from './onboarding/OnboardingBanner';

type SettingsProps = {
  api: {
    call: (endpoint: string, options?: RequestInit) => Promise<any>;
  };
  onboarding: OnboardingState | null;
  onOnboardingUpdate: (next: OnboardingState) => void;
  onSelectTab?: (tab: 'people' | 'templates' | 'settings' | 'upcoming' | 'dashboard') => void;
};

export default function Settings({ api, onboarding, onOnboardingUpdate, onSelectTab }: SettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [form, setForm] = useState({
    emailFromName: '',
    emailFromAddress: '',
    timezone: 'UTC',
    birthdaySendHour: 9,
    birthdaySendMinute: 0,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.call('/settings');
      const org = data.organization || {};
      setForm({
        emailFromName: org.emailFromName || '',
        emailFromAddress: org.emailFromAddress || '',
        timezone: org.timezone || 'UTC',
        birthdaySendHour: org.birthdaySendHour ?? 9,
        birthdaySendMinute: org.birthdaySendMinute ?? 0,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const data = await api.call('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          emailFromName: form.emailFromName || null,
          emailFromAddress: form.emailFromAddress || null,
          timezone: form.timezone,
          birthdaySendHour: Number(form.birthdaySendHour),
          birthdaySendMinute: Number(form.birthdaySendMinute),
        }),
      });
      if (data.onboarding) {
        onOnboardingUpdate(data.onboarding);
        setSuccessMessage('✅ Settings saved. Next: send a test email.');
      } else {
        const status = await api.call('/onboarding/status');
        if (status.onboarding) {
          onOnboardingUpdate(status.onboarding);
        }
      }
      setMessage('Settings saved.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isActivateStep = useMemo(() => {
    return onboarding?.currentStepId === 'activate_automation';
  }, [onboarding]);

  const handleActivateAutomation = async () => {
    setError('');
    setMessage('');
    try {
      const data = await api.call('/onboarding/mark-step', {
        method: 'POST',
        body: JSON.stringify({ stepId: 'activate_automation' }),
      });
      if (data.onboarding) {
        onOnboardingUpdate(data.onboarding);
        setSuccessMessage('🎉 Automation is now active.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      {successMessage && (
        <OnboardingBanner
          title="Success"
          message={successMessage}
          onDismiss={() => setSuccessMessage('')}
        />
      )}
      <NextStepPanel onboarding={onboarding} onSelectTab={onSelectTab} />
      <div className="bg-white p-6 rounded-lg shadow space-y-6">
        <div>
          <h2 className="text-xl font-bold">Organization Settings</h2>
          <p className="text-sm text-gray-600">
            Configure sender details, timezone, and daily send time.
          </p>
        </div>

        {message && <p className="text-green-700 text-sm">{message}</p>}
        {error && <p className="text-red-600 text-sm">Settings error: {error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">From Name</label>
            <input
              value={form.emailFromName}
              onChange={(e) => setForm({ ...form, emailFromName: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="MomentOS"
            />
          </div>
        <div>
          <label className="block text-sm font-medium mb-1">From Email</label>
          <input
            type="email"
            value={form.emailFromAddress}
            onChange={(e) => setForm({ ...form, emailFromAddress: e.target.value })}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="notifications@usemomentos.xyz"
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave blank to use notifications@usemomentos.xyz.
          </p>
        </div>
          <div>
            <label className="block text-sm font-medium mb-1">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="UTC">UTC</option>
              <option value="Africa/Lagos">Lagos (WAT)</option>
              <option value="America/New_York">New York (EST)</option>
              <option value="America/Los_Angeles">Los Angeles (PST)</option>
              <option value="Europe/London">London (GMT)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Daily Send Time</label>
            <div className="flex items-center gap-2">
              <select
                value={form.birthdaySendHour}
                onChange={(e) => setForm({ ...form, birthdaySendHour: Number(e.target.value) })}
                className="w-24 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 24 }).map((_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="text-gray-500">:</span>
              <select
                value={form.birthdaySendMinute}
                onChange={(e) => setForm({ ...form, birthdaySendMinute: Number(e.target.value) })}
                className="w-24 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 60 }).map((_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Uses your organization timezone.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          {isActivateStep && (
            <button
              onClick={handleActivateAutomation}
              className="bg-green-600 text-white px-5 py-2 rounded text-sm hover:bg-green-700"
            >
              Activate automation
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
