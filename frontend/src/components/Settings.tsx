import { useEffect, useMemo, useState } from 'react';
import { OnboardingState } from '../types/onboarding';
import NextStepPanel from './onboarding/NextStepPanel';
import OnboardingBanner from './onboarding/OnboardingBanner';
import { Button, Card, CardBody, Input, Select } from './ui';

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
    smsEnabled: false,
    whatsappEnabled: false,
    senderId: 'MomentOS',
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
        smsEnabled: Boolean(org.smsEnabled),
        whatsappEnabled: Boolean(org.whatsappEnabled),
        senderId: org.senderId || 'MomentOS',
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
          smsEnabled: form.smsEnabled,
          whatsappEnabled: form.whatsappEnabled,
          senderId: form.senderId || null,
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
      <Card>
        <CardBody className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">Organization Settings</h2>
          <p className="text-sm text-gray-600">
            Configure sender details, timezone, and daily send time.
          </p>
        </div>

        {message && <p className="ds-alert ds-alert-success">{message}</p>}
        {error && <p className="ds-alert ds-alert-error">Settings error: {error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="ds-label">From Name</label>
            <Input
              value={form.emailFromName}
              onChange={(e) => setForm({ ...form, emailFromName: e.target.value })}
              placeholder="MomentOS"
            />
          </div>
        <div>
          <label className="ds-label">From Email</label>
          <Input
            type="email"
            value={form.emailFromAddress}
            onChange={(e) => setForm({ ...form, emailFromAddress: e.target.value })}
            placeholder="notifications@mail.usemomentos.xyz"
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave blank to use notifications@mail.usemomentos.xyz.
          </p>
        </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.smsEnabled}
                onChange={(e) => setForm({ ...form, smsEnabled: e.target.checked })}
              />
              Enable SMS Delivery
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Sends birthday messages by SMS when a phone number is available.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.whatsappEnabled}
                onChange={(e) => setForm({ ...form, whatsappEnabled: e.target.checked })}
              />
              Enable WhatsApp Delivery
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Sends birthday messages to WhatsApp numbers when available.
            </p>
          </div>
          {form.smsEnabled && (
            <div className="md:col-span-2">
              <label className="ds-label">SMS Sender ID</label>
              <Input
                type="text"
                value={form.senderId}
                onChange={(e) =>
                  setForm({ ...form, senderId: e.target.value.substring(0, 11) })
                }
                placeholder="MomentOS"
                maxLength={11}
              />
              <p className="text-xs text-gray-500 mt-1">
                Max 11 characters. Sender ID must be approved by Termii.
              </p>
            </div>
          )}
          <div>
            <label className="ds-label">Timezone</label>
            <Select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              <option value="UTC">UTC</option>
              <option value="Africa/Lagos">Lagos (WAT)</option>
              <option value="America/New_York">New York (EST)</option>
              <option value="America/Los_Angeles">Los Angeles (PST)</option>
              <option value="Europe/London">London (GMT)</option>
            </Select>
          </div>
          <div>
            <label className="ds-label">Daily Send Time</label>
            <div className="flex items-center gap-2">
              <Select
                value={form.birthdaySendHour}
                onChange={(e) => setForm({ ...form, birthdaySendHour: Number(e.target.value) })}
                className="w-24"
              >
                {Array.from({ length: 24 }).map((_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </Select>
              <span className="text-gray-500">:</span>
              <Select
                value={form.birthdaySendMinute}
                onChange={(e) => setForm({ ...form, birthdaySendMinute: Number(e.target.value) })}
                className="w-24"
              >
                {Array.from({ length: 60 }).map((_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Uses your organization timezone.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          {isActivateStep && (
            <Button
              onClick={handleActivateAutomation}
              className="bg-green-600 hover:bg-green-700"
            >
              Activate automation
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
        </CardBody>
      </Card>
    </div>
  );
}
