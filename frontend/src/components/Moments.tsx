import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Input, Select } from './ui';

type ApiClient = {
  call: (endpoint: string, options?: RequestInit) => Promise<any>;
};

type MomentCategory = {
  key: string;
  label: string;
};

type PersonOption = {
  id: string;
  fullName: string;
  email: string;
};

type TemplateOption = {
  id: string;
  name: string;
  channels?: ('email' | 'sms' | 'whatsapp')[];
};

type RecurrenceRule =
  | 'ONE_TIME'
  | 'ANNUAL'
  | 'DAILY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'BI_YEARLY'
  | 'CUSTOM';

type MomentRecord = {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  recurrenceRule: RecurrenceRule;
  customIntervalDays?: number | null;
  randomizeMessage?: boolean;
  deliveryChannels: ('email' | 'sms' | 'whatsapp')[];
  status: 'ACTIVE' | 'PAUSED';
  scope?: 'BROADCAST' | 'PERSONAL';
  recipients: PersonOption[];
};

type CreateBroadcastMomentForm = {
  title: string;
  category: string;
  personIds: string[];
  recurrenceRule: 'ANNUAL' | 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'BI_YEARLY' | 'CUSTOM';
  customIntervalDays: string;
  randomizeMessage: boolean;
  deliveryChannels: ('email' | 'sms' | 'whatsapp')[];
  templateId: string;
  eventDate: string;
};

type MomentsProps = {
  api: ApiClient;
  onOpenPeople?: () => void;
};

const categoryFallback: MomentCategory[] = [
  { key: 'BIRTHDAY', label: 'Birthdays' },
  { key: 'ANNIVERSARY', label: 'Anniversaries' },
  { key: 'GRADUATION', label: 'Graduation' },
  { key: 'PROMOTION_CAREER_MILESTONE', label: 'Promotion / Career Milestone' },
  { key: 'SPIRITUAL_MILESTONE', label: 'Spiritual Milestone' },
  { key: 'REMEMBRANCE_DAY', label: 'Remembrance Day' },
  { key: 'CUSTOM', label: 'Custom Moment' },
];

const recurrenceOptions: Array<{ value: CreateBroadcastMomentForm['recurrenceRule']; label: string }> = [
  { value: 'ANNUAL', label: 'Yearly' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'BI_YEARLY', label: 'Bi-yearly' },
  { value: 'CUSTOM', label: 'Custom (interval)' },
];

const recurrenceLabel: Record<RecurrenceRule, string> = {
  ONE_TIME: 'One-time',
  ANNUAL: 'Yearly',
  DAILY: 'Daily',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  BI_YEARLY: 'Bi-yearly',
  CUSTOM: 'Custom',
};

const initialForm: CreateBroadcastMomentForm = {
  title: '',
  category: 'BIRTHDAY',
  personIds: [],
  recurrenceRule: 'MONTHLY',
  customIntervalDays: '',
  randomizeMessage: false,
  deliveryChannels: ['email'],
  templateId: '',
  eventDate: '',
};

const formatCategory = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function Moments({ api, onOpenPeople }: MomentsProps) {
  const [categories, setCategories] = useState<MomentCategory[]>(categoryFallback);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [moments, setMoments] = useState<MomentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [form, setForm] = useState<CreateBroadcastMomentForm>(initialForm);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId) || null,
    [templates, form.templateId]
  );
  const selectedPeople = useMemo(
    () => people.filter((person) => form.personIds.includes(person.id)),
    [people, form.personIds]
  );

  const activeMomentsCount = useMemo(
    () => moments.filter((moment) => moment.status === 'ACTIVE').length,
    [moments]
  );

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [categoryData, peopleData, templateData, momentData] = await Promise.all([
        api.call('/moments/categories'),
        api.call('/people'),
        api.call('/templates'),
        api.call('/moments?scope=BROADCAST'),
      ]);

      setCategories(categoryData?.categories || categoryFallback);
      setPeople(peopleData?.people || []);
      setTemplates(templateData?.templates || []);
      setMoments(momentData?.moments || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load moments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (templates.length > 0 && !form.templateId) {
      setForm((prev) => ({ ...prev, templateId: templates[0].id }));
    }
  }, [templates, form.templateId]);

  const togglePerson = (personId: string) => {
    setForm((prev) => {
      const exists = prev.personIds.includes(personId);
      return {
        ...prev,
        personIds: exists
          ? prev.personIds.filter((id) => id !== personId)
          : [...prev.personIds, personId],
      };
    });
  };

  const toggleChannel = (channel: 'email' | 'sms' | 'whatsapp') => {
    setForm((prev) => {
      const exists = prev.deliveryChannels.includes(channel);
      if (exists) {
        if (prev.deliveryChannels.length === 1) return prev;
        return {
          ...prev,
          deliveryChannels: prev.deliveryChannels.filter((value) => value !== channel),
        };
      }
      return {
        ...prev,
        deliveryChannels: [...prev.deliveryChannels, channel],
      };
    });
  };

  const validateCreate = () => {
    if (!form.title.trim()) return 'Add a title for this broadcast moment.';
    if (!form.category) return 'Choose a category.';
    if (form.personIds.length === 0) return 'Select at least one recipient.';
    if (!form.eventDate) return 'Choose an event date.';
    if (form.deliveryChannels.length === 0) return 'Select at least one delivery channel.';
    if (!form.templateId) return 'Choose a template.';
    if (form.recurrenceRule === 'CUSTOM') {
      const interval = Number(form.customIntervalDays);
      if (!Number.isInteger(interval) || interval < 1) {
        return 'Custom recurrence interval must be at least 1 day.';
      }
    }
    return null;
  };

  const resetForm = () => {
    setForm({
      ...initialForm,
      templateId: templates[0]?.id || '',
    });
    setAiPrompt('');
    setShowCreate(false);
  };

  const handleGenerateTemplateFromAi = async () => {
    if (!aiPrompt.trim()) {
      setError('Add a message prompt for AI generation.');
      return;
    }

    setAiLoading(true);
    setError('');
    setSuccess('');
    try {
      const draft = await api.call('/ai/template-draft', {
        method: 'POST',
        body: JSON.stringify({ message: aiPrompt.trim() }),
      });

      const generatedTemplate = await api.call('/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: `AI ${formatCategory(form.category)} ${new Date().toISOString().slice(0, 10)}`,
          type: draft.type || 'PLAIN_TEXT',
          subject: draft.subject || `${form.title || 'Moment'} Message`,
          content: draft.content || '',
          channels: form.deliveryChannels.length ? form.deliveryChannels : ['email'],
        }),
      });

      if (generatedTemplate?.template?.id) {
        const newTemplate = generatedTemplate.template as TemplateOption;
        setTemplates((prev) =>
          prev.some((template) => template.id === newTemplate.id)
            ? prev
            : [newTemplate, ...prev]
        );
        setForm((prev) => ({ ...prev, templateId: newTemplate.id }));
      }

      setSuccess('AI generated a message template and selected it for this moment.');
    } catch (err: any) {
      setError(err.message || 'AI generation failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const createBroadcastMoment = async () => {
    const validationError = validateCreate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.call('/moments', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          personIds: form.personIds,
          recurrenceRule: form.recurrenceRule,
          customIntervalDays:
            form.recurrenceRule === 'CUSTOM' ? Number(form.customIntervalDays) : null,
          randomizeMessage: form.randomizeMessage,
          deliveryChannels: form.deliveryChannels,
          templateId: form.templateId || null,
          eventDate: form.eventDate,
          scope: 'BROADCAST',
        }),
      });
      setSuccess('Broadcast moment created.');
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create moment.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (moment: MomentRecord, status: 'ACTIVE' | 'PAUSED') => {
    setError('');
    setSuccess('');
    try {
      await api.call(`/moments/${moment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setSuccess(`Moment marked as ${status.toLowerCase()}.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update moment.');
    }
  };

  const deleteMoment = async (moment: MomentRecord) => {
    if (!window.confirm(`Delete "${moment.title}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.call(`/moments/${moment.id}`, {
        method: 'DELETE',
      });
      setSuccess('Moment deleted.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete moment.');
    }
  };

  return (
    <div className="space-y-6">
      {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
      {success ? <div className="ds-alert ds-alert-success">{success}</div> : null}

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Broadcast Moments</h2>
            <p className="text-sm text-slate-600">
              Create moments for groups from one place. Personal moments now live inside each person profile.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {moments.length} broadcast moments
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                {activeMomentsCount} active
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Type: Broadcast</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenPeople ? (
              <Button onClick={onOpenPeople} variant="secondary" size="sm">
                Open People Profiles
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setShowCreate((value) => !value);
                setError('');
              }}
            >
              {showCreate ? 'Close' : 'New Broadcast Moment'}
            </Button>
          </div>
        </CardHeader>

        {showCreate ? (
          <div className="space-y-5 border-b border-slate-200 bg-slate-50 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="ds-label">Title</label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Q2 Work Anniversary"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="ds-label">Category</label>
                <Select
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                  className="mt-2"
                >
                  {categories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="ds-label">Event date</label>
                <Input
                  type="date"
                  value={form.eventDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, eventDate: event.target.value }))
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <label className="ds-label">Recurrence</label>
                <Select
                  value={form.recurrenceRule}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      recurrenceRule: event.target.value as CreateBroadcastMomentForm['recurrenceRule'],
                    }))
                  }
                  className="mt-2"
                >
                  {recurrenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              {form.recurrenceRule === 'CUSTOM' ? (
                <div>
                  <label className="ds-label">Custom interval (days)</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.customIntervalDays}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, customIntervalDays: event.target.value }))
                    }
                    placeholder="e.g. 10"
                    className="mt-2"
                  />
                </div>
              ) : null}
              <div>
                <label className="ds-label">Template</label>
                <Select
                  value={form.templateId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, templateId: event.target.value }))
                  }
                  className="mt-2"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-2 text-xs text-slate-500">Selected: {selectedTemplate?.name || 'None'}</p>
              </div>
              <div className="md:col-span-2">
                <label className="ds-label">AI message prompt</label>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="Write the kind of message you want and AI will generate it"
                  />
                  <Button
                    onClick={handleGenerateTemplateFromAi}
                    variant="secondary"
                    disabled={aiLoading}
                  >
                    {aiLoading ? 'Generating...' : 'Generate Message'}
                  </Button>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="ds-label">Recipients ({selectedPeople.length} selected)</label>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {people.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">No people found. Add people first.</div>
                  ) : (
                    people.map((person) => (
                      <label
                        key={person.id}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                      >
                        <span>
                          {person.fullName}
                          <span className="ml-2 text-slate-500">{person.email}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={form.personIds.includes(person.id)}
                          onChange={() => togglePerson(person.id)}
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <label className="ds-label">Channels</label>
                <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  {(['email', 'sms', 'whatsapp'] as const).map((channel) => (
                    <label key={channel} className="inline-flex items-center gap-2 capitalize">
                      <input
                        type="checkbox"
                        checked={form.deliveryChannels.includes(channel)}
                        onChange={() => toggleChannel(channel)}
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.randomizeMessage}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, randomizeMessage: event.target.checked }))
                    }
                  />
                  Randomize message for recurring sends
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button onClick={resetForm} variant="secondary" disabled={saving}>
                Cancel
              </Button>
              <Button onClick={createBroadcastMoment} disabled={saving}>
                {saving ? 'Creating...' : 'Create Broadcast Moment'}
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <CardBody className="text-sm text-slate-600">Loading moments...</CardBody>
        ) : moments.length === 0 ? (
          <CardBody className="text-sm text-slate-600">
            No broadcast moments yet. Create one from this dashboard.
          </CardBody>
        ) : (
          <div className="ds-table-wrap">
            <table className="min-w-[980px] w-full ds-table">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="ds-th">Title</th>
                  <th className="ds-th">Category</th>
                  <th className="ds-th">Date</th>
                  <th className="ds-th">Recurrence</th>
                  <th className="ds-th">Recipients</th>
                  <th className="ds-th">Channels</th>
                  <th className="ds-th">Status</th>
                  <th className="ds-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {moments.map((moment) => (
                  <tr key={moment.id} className="border-b border-slate-100">
                    <td className="ds-td font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{moment.title}</span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Broadcast
                        </span>
                        {moment.randomizeMessage ? (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            Randomized
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="ds-td text-slate-600">{formatCategory(moment.category)}</td>
                    <td className="ds-td text-slate-600">
                      {new Date(moment.eventDate).toLocaleDateString()}
                    </td>
                    <td className="ds-td text-slate-600">
                      {recurrenceLabel[moment.recurrenceRule] || moment.recurrenceRule}
                      {moment.recurrenceRule === 'CUSTOM' && moment.customIntervalDays ? ` (${moment.customIntervalDays}d)` : ''}
                    </td>
                    <td className="ds-td text-slate-600">{moment.recipients.length}</td>
                    <td className="ds-td text-slate-600">{moment.deliveryChannels.join(', ')}</td>
                    <td className="ds-td text-slate-600">{moment.status}</td>
                    <td className="ds-td">
                      <div className="flex items-center gap-2">
                        {moment.status === 'ACTIVE' ? (
                          <Button onClick={() => updateStatus(moment, 'PAUSED')} variant="secondary" size="sm">
                            Pause
                          </Button>
                        ) : (
                          <Button onClick={() => updateStatus(moment, 'ACTIVE')} variant="secondary" size="sm">
                            Resume
                          </Button>
                        )}
                        <Button onClick={() => deleteMoment(moment)} variant="danger" size="sm">
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
