import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '../ui';
import CampaignPreview from './CampaignPreview';
import TemplatePicker from './TemplatePicker';
import VariableField from './VariableField';
import type {
  Campaign,
  CampaignTemplateOption,
  Channel,
  RecurrenceRule,
} from './types';
import { RECURRENCE_LABELS } from './types';

type ApiClient = { call: (endpoint: string, options?: RequestInit) => Promise<any> };

type CampaignEditorProps = {
  api: ApiClient;
  campaign?: Campaign | null;
  templates: CampaignTemplateOption[];
  smsEnabled: boolean;
  onSaved: (campaign: Campaign) => void;
  onCancel: () => void;
};

type FormState = {
  name: string;
  subject: string;
  bodyText: string;
  smsText: string;
  replyTo: string;
  campaignTemplateId: string;
  deliveryChannels: Channel[];
  recurrenceRule: RecurrenceRule;
  customIntervalDays: string;
  startDate: string;
  endDate: string;
  sendHour: string;
  sendMinute: string;
};

const toDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

const emptyForm = (): FormState => ({
  name: '',
  subject: '',
  bodyText: '',
  smsText: '',
  replyTo: '',
  campaignTemplateId: '',
  deliveryChannels: ['email'],
  recurrenceRule: 'ONE_TIME',
  customIntervalDays: '30',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  sendHour: '9',
  sendMinute: '0',
});

const fromCampaign = (campaign: Campaign): FormState => ({
  name: campaign.name,
  subject: campaign.subject,
  bodyText: campaign.bodyText,
  smsText: campaign.smsText || '',
  replyTo: campaign.replyTo || '',
  campaignTemplateId: campaign.campaignTemplate?.id || '',
  deliveryChannels: campaign.deliveryChannels,
  recurrenceRule: campaign.recurrenceRule,
  customIntervalDays: String(campaign.customIntervalDays ?? 30),
  startDate: toDateInput(campaign.startDate),
  endDate: toDateInput(campaign.endDate),
  sendHour: String(campaign.sendHour),
  sendMinute: String(campaign.sendMinute),
});

const CHANNELS: { value: Channel; label: string; hint: string }[] = [
  { value: 'email', label: 'Email', hint: 'Needs an email address per contact' },
  { value: 'sms', label: 'SMS', hint: 'Needs a phone number per contact' },
];

export default function CampaignEditor({
  api,
  campaign,
  templates,
  smsEnabled,
  onSaved,
  onCancel,
}: CampaignEditorProps) {
  const [form, setForm] = useState<FormState>(
    campaign ? fromCampaign(campaign) : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(campaign ? fromCampaign(campaign) : emptyForm());
  }, [campaign?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleChannel = (channel: Channel) => {
    setForm((prev) => {
      const has = prev.deliveryChannels.includes(channel);
      // At least one channel must stay selected.
      if (has && prev.deliveryChannels.length === 1) return prev;
      return {
        ...prev,
        deliveryChannels: has
          ? prev.deliveryChannels.filter((c) => c !== channel)
          : [...prev.deliveryChannels, channel],
      };
    });
  };

  const usesSms = form.deliveryChannels.includes('sms');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === form.campaignTemplateId) || null,
    [templates, form.campaignTemplateId]
  );

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        subject: form.subject.trim(),
        bodyText: form.bodyText,
        smsText: form.smsText.trim() ? form.smsText : null,
        replyTo: form.replyTo.trim() ? form.replyTo.trim() : null,
        campaignTemplateId: form.campaignTemplateId || null,
        deliveryChannels: form.deliveryChannels,
        recurrenceRule: form.recurrenceRule,
        customIntervalDays:
          form.recurrenceRule === 'CUSTOM' ? Number(form.customIntervalDays) : null,
        startDate: form.startDate,
        endDate: form.endDate || null,
        sendHour: Number(form.sendHour),
        sendMinute: Number(form.sendMinute),
      };

      const data = campaign
        ? await api.call(`/campaigns/${campaign.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await api.call('/campaigns', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      onSaved(data.campaign);
    } catch (err: any) {
      setError(err.message || 'Could not save the campaign.');
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    form.name.trim() && form.subject.trim() && form.bodyText.trim() && form.startDate;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)] xl:items-start">
      <div className="space-y-6">
      <section className="ds-surface p-5">
        <h3 className="text-sm font-semibold text-slate-900">Campaign details</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="ds-label">Campaign name</label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="₦50,000 Savings Challenge"
            />
          </div>
          <div>
            <label className="ds-label">Replies go to</label>
            <Input
              type="email"
              value={form.replyTo}
              onChange={(e) => set('replyTo', e.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>
        </div>
      </section>

      <section className="ds-surface p-5">
        <h3 className="text-sm font-semibold text-slate-900">Channels</h3>
        <p className="mt-1 text-xs text-slate-500">
          Contacts missing the detail a channel needs are skipped for that channel.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((channel) => {
            const disabled = channel.value === 'sms' && !smsEnabled;
            const active = form.deliveryChannels.includes(channel.value);
            return (
              <button
                key={channel.value}
                type="button"
                disabled={disabled}
                onClick={() => toggleChannel(channel.value)}
                className={
                  'rounded-lg border p-3 text-left transition ' +
                  (disabled
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                    : active
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300')
                }
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span
                    className={
                      'inline-block h-3.5 w-3.5 rounded-sm border ' +
                      (active ? 'border-blue-600 bg-blue-600' : 'border-slate-300')
                    }
                  />
                  {channel.label}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {disabled ? 'Not enabled for this organization' : channel.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ds-surface p-5">
        <h3 className="text-sm font-semibold text-slate-900">Design</h3>
        <p className="mt-1 text-xs text-slate-500">
          A template with a <code className="rounded bg-slate-100 px-1">{'{{body}}'}</code>{' '}
          slot supplies the styling and drops your message inside it.
        </p>
        <div className="mt-4">
          <TemplatePicker
            templates={templates}
            value={form.campaignTemplateId}
            onChange={(templateId) => set('campaignTemplateId', templateId)}
          />
        </div>
      </section>

      <section className="ds-surface p-5">
        <h3 className="text-sm font-semibold text-slate-900">Message</h3>

        <div className="mt-4 space-y-4">
          <VariableField
            label="Subject"
            value={form.subject}
            onChange={(value) => set('subject', value)}
            placeholder="Monthly contribution reminder"
          />

          <VariableField
            label="Message body"
            multiline
            rows={10}
            value={form.bodyText}
            onChange={(value) => set('bodyText', value)}
            placeholder={'Hi {{first_name}},\n\n...'}
          />

          {usesSms ? (
            <VariableField
              label="SMS text"
              multiline
              rows={4}
              value={form.smsText}
              onChange={(value) => set('smsText', value)}
              placeholder="Hi {{first_name}}, your monthly contribution is due today."
              hint="Optional — falls back to the message body."
            />
          ) : null}
        </div>
      </section>

      <section className="ds-surface p-5">
        <h3 className="text-sm font-semibold text-slate-900">Schedule</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="ds-label">Repeats</label>
            <Select
              value={form.recurrenceRule}
              onChange={(e) => set('recurrenceRule', e.target.value as RecurrenceRule)}
            >
              {(Object.keys(RECURRENCE_LABELS) as RecurrenceRule[]).map((rule) => (
                <option key={rule} value={rule}>
                  {RECURRENCE_LABELS[rule]}
                </option>
              ))}
            </Select>
          </div>

          {form.recurrenceRule === 'CUSTOM' ? (
            <div>
              <label className="ds-label">Every (days)</label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={form.customIntervalDays}
                onChange={(e) => set('customIntervalDays', e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="ds-label">
              {form.recurrenceRule === 'ONE_TIME' ? 'Send date' : 'First send'}
            </label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </div>

          {form.recurrenceRule !== 'ONE_TIME' ? (
            <div>
              <label className="ds-label">
                Stop after <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="ds-label">Send at</label>
            <div className="flex items-center gap-2">
              <Select value={form.sendHour} onChange={(e) => set('sendHour', e.target.value)}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, '0')}
                  </option>
                ))}
              </Select>
              <span className="text-slate-400">:</span>
              <Select
                value={form.sendMinute}
                onChange={(e) => set('sendMinute', e.target.value)}
              >
                {[0, 15, 30, 45].map((minute) => (
                  <option key={minute} value={minute}>
                    {String(minute).padStart(2, '0')}
                  </option>
                ))}
              </Select>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              In your organization's timezone. Sends are checked hourly, so the minute is a
              guide rather than an exact time.
            </p>
          </div>
        </div>
      </section>

      {error ? <p className="ds-alert ds-alert-error">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving} disabled={!canSave}>
          {campaign ? 'Save changes' : 'Continue to recipients'}
        </Button>
      </div>
      </div>

      <aside className="ds-surface p-5 xl:sticky xl:top-6">
        <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
        <p className="mt-1 text-xs text-slate-500">Updates as you type.</p>
        <div className="mt-4">
          <CampaignPreview
            name={form.name}
            subject={form.subject}
            bodyText={form.bodyText}
            smsText={form.smsText}
            replyTo={form.replyTo}
            template={selectedTemplate}
            channels={form.deliveryChannels}
          />
        </div>
      </aside>
    </div>
  );
}
