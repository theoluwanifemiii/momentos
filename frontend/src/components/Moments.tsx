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
  ownerType?: string;
  template?: { id: string; name: string; subject?: string } | null;
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

type EditMomentForm = {
  title: string;
  category: string;
  personIds: string[];
  recurrenceRule: RecurrenceRule;
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

const allRecurrenceOptions: Array<{ value: RecurrenceRule; label: string }> = [
  { value: 'ONE_TIME', label: 'One-time' },
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

const toDateInput = (iso: string) => {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

export default function Moments({ api, onOpenPeople }: MomentsProps) {
  const [categories, setCategories] = useState<MomentCategory[]>(categoryFallback);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [moments, setMoments] = useState<MomentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [form, setForm] = useState<CreateBroadcastMomentForm>(initialForm);

  // View/edit modal
  const [viewMoment, setViewMoment] = useState<MomentRecord | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditMomentForm>({
    title: '',
    category: 'BIRTHDAY',
    personIds: [],
    recurrenceRule: 'MONTHLY',
    customIntervalDays: '',
    randomizeMessage: false,
    deliveryChannels: ['email'],
    templateId: '',
    eventDate: '',
  });

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

  const broadcastCount = useMemo(
    () => moments.filter((m) => m.scope === 'BROADCAST' || m.ownerType === 'ORGANIZATION').length,
    [moments]
  );
  const personalCount = useMemo(
    () => moments.filter((m) => m.scope === 'PERSONAL' || m.ownerType === 'USER').length,
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
        api.call('/moments?scope=ALL'),
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

  const openViewModal = (moment: MomentRecord) => {
    setViewMoment(moment);
    setEditMode(false);
    setEditForm({
      title: moment.title,
      category: moment.category,
      personIds: moment.recipients.map((r) => r.id),
      recurrenceRule: moment.recurrenceRule,
      customIntervalDays: moment.customIntervalDays ? String(moment.customIntervalDays) : '',
      randomizeMessage: moment.randomizeMessage ?? false,
      deliveryChannels: moment.deliveryChannels,
      templateId: moment.template?.id || templates[0]?.id || '',
      eventDate: toDateInput(moment.eventDate),
    });
  };

  const closeViewModal = () => {
    setViewMoment(null);
    setEditMode(false);
  };

  const toggleEditPerson = (personId: string) => {
    setEditForm((prev) => {
      const exists = prev.personIds.includes(personId);
      return {
        ...prev,
        personIds: exists
          ? prev.personIds.filter((id) => id !== personId)
          : [...prev.personIds, personId],
      };
    });
  };

  const toggleEditChannel = (channel: 'email' | 'sms' | 'whatsapp') => {
    setEditForm((prev) => {
      const exists = prev.deliveryChannels.includes(channel);
      if (exists && prev.deliveryChannels.length === 1) return prev;
      return {
        ...prev,
        deliveryChannels: exists
          ? prev.deliveryChannels.filter((c) => c !== channel)
          : [...prev.deliveryChannels, channel],
      };
    });
  };

  const handleSaveEdit = async () => {
    if (!viewMoment) return;
    if (!editForm.title.trim()) { setError('Title is required.'); return; }
    if (editForm.personIds.length === 0) { setError('Select at least one recipient.'); return; }
    if (!editForm.eventDate) { setError('Event date is required.'); return; }

    setEditSaving(true);
    setError('');
    try {
      await api.call(`/moments/${viewMoment.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editForm.title.trim(),
          category: editForm.category,
          personIds: editForm.personIds,
          recurrenceRule: editForm.recurrenceRule,
          customIntervalDays:
            editForm.recurrenceRule === 'CUSTOM' ? Number(editForm.customIntervalDays) : null,
          randomizeMessage: editForm.randomizeMessage,
          deliveryChannels: editForm.deliveryChannels,
          templateId: editForm.templateId || null,
          eventDate: editForm.eventDate,
        }),
      });
      setSuccess('Moment updated.');
      setEditMode(false);
      await loadData();
      // Update viewMoment with new data
      const fresh = await api.call(`/moments/${viewMoment.id}`).catch(() => null);
      if (fresh?.moment) setViewMoment(fresh.moment);
    } catch (err: any) {
      setError(err.message || 'Failed to update moment.');
    } finally {
      setEditSaving(false);
    }
  };

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
      if (viewMoment?.id === moment.id) closeViewModal();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete moment.');
    }
  };

  const isBroadcast = (m: MomentRecord) =>
    m.scope === 'BROADCAST' || m.ownerType === 'ORGANIZATION';

  return (
    <div className="space-y-6">
      {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
      {success ? <div className="ds-alert ds-alert-success">{success}</div> : null}

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Moments</h2>
            <p className="text-sm text-slate-600">
              Broadcast moments go to groups. Personal moments are tied to individual people.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {moments.length} total
              </span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                {activeMomentsCount} active
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                {broadcastCount} broadcast
              </span>
              <span className="rounded-full bg-purple-50 px-3 py-1 text-purple-700">
                {personalCount} personal
              </span>
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
            No moments yet. Create a broadcast moment above, or add personal moments from a person's profile.
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
                        <button
                          onClick={() => openViewModal(moment)}
                          className="text-left hover:text-blue-600 hover:underline transition-colors"
                        >
                          {moment.title}
                        </button>
                        {isBroadcast(moment) ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Broadcast
                          </span>
                        ) : (
                          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                            Personal
                          </span>
                        )}
                        {moment.randomizeMessage ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
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
                    <td className="ds-td text-slate-600">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          moment.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {moment.status === 'ACTIVE' ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="ds-td">
                      <div className="flex items-center gap-2">
                        <Button onClick={() => openViewModal(moment)} variant="secondary" size="sm">
                          View
                        </Button>
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

      {/* View / Edit Modal */}
      {viewMoment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{viewMoment.title}</h2>
                  {isBroadcast(viewMoment) ? (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Broadcast</span>
                  ) : (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">Personal</span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{formatCategory(viewMoment.category)}</p>
              </div>
              <button
                onClick={closeViewModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {editMode && isBroadcast(viewMoment) ? (
                /* Edit form */
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="ds-label">Title</label>
                      <Input
                        value={editForm.title}
                        onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="ds-label">Category</label>
                      <Select
                        value={editForm.category}
                        onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                        className="mt-1"
                      >
                        {categories.map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="ds-label">Event date</label>
                      <Input
                        type="date"
                        value={editForm.eventDate}
                        onChange={(e) => setEditForm((p) => ({ ...p, eventDate: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="ds-label">Recurrence</label>
                      <Select
                        value={editForm.recurrenceRule}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, recurrenceRule: e.target.value as RecurrenceRule }))
                        }
                        className="mt-1"
                      >
                        {allRecurrenceOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                    </div>
                    {editForm.recurrenceRule === 'CUSTOM' && (
                      <div>
                        <label className="ds-label">Custom interval (days)</label>
                        <Input
                          type="number"
                          min={1}
                          value={editForm.customIntervalDays}
                          onChange={(e) => setEditForm((p) => ({ ...p, customIntervalDays: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                    )}
                    <div>
                      <label className="ds-label">Template</label>
                      <Select
                        value={editForm.templateId}
                        onChange={(e) => setEditForm((p) => ({ ...p, templateId: e.target.value }))}
                        className="mt-1"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="ds-label mb-2 block">
                      Recipients ({editForm.personIds.length} selected)
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                      {people.map((person) => (
                        <label
                          key={person.id}
                          className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-sm last:border-b-0"
                        >
                          <span>
                            {person.fullName}
                            <span className="ml-2 text-slate-400">{person.email}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={editForm.personIds.includes(person.id)}
                            onChange={() => toggleEditPerson(person.id)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="ds-label mb-2 block">Channels</label>
                    <div className="flex gap-4 rounded-lg border border-slate-200 p-3 text-sm">
                      {(['email', 'sms', 'whatsapp'] as const).map((ch) => (
                        <label key={ch} className="inline-flex items-center gap-2 capitalize">
                          <input
                            type="checkbox"
                            checked={editForm.deliveryChannels.includes(ch)}
                            onChange={() => toggleEditChannel(ch)}
                          />
                          {ch}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editForm.randomizeMessage}
                      onChange={(e) => setEditForm((p) => ({ ...p, randomizeMessage: e.target.checked }))}
                    />
                    Randomize message for recurring sends
                  </label>

                  <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                    <Button onClick={() => setEditMode(false)} variant="secondary" disabled={editSaving}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveEdit} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save changes'}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Read-only view */
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Event date</p>
                      <p className="mt-1 text-sm text-slate-800">
                        {new Date(viewMoment.eventDate).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Recurrence</p>
                      <p className="mt-1 text-sm text-slate-800">
                        {recurrenceLabel[viewMoment.recurrenceRule] || viewMoment.recurrenceRule}
                        {viewMoment.recurrenceRule === 'CUSTOM' && viewMoment.customIntervalDays
                          ? ` (every ${viewMoment.customIntervalDays} days)`
                          : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Channels</p>
                      <p className="mt-1 text-sm text-slate-800 capitalize">
                        {viewMoment.deliveryChannels.join(', ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
                      <p className="mt-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            viewMoment.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {viewMoment.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </span>
                      </p>
                    </div>
                    {viewMoment.template && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Template</p>
                        <p className="mt-1 text-sm text-slate-800">{viewMoment.template.name}</p>
                        {viewMoment.template.subject && (
                          <p className="text-xs text-slate-500 mt-0.5">Subject: {viewMoment.template.subject}</p>
                        )}
                      </div>
                    )}
                    {viewMoment.randomizeMessage && (
                      <div className="sm:col-span-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          Message randomized on recurring sends
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">
                      Recipients ({viewMoment.recipients.length})
                    </p>
                    {viewMoment.recipients.length === 0 ? (
                      <p className="text-sm text-slate-500">No recipients</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                        {viewMoment.recipients.map((r) => (
                          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                              {r.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800">{r.fullName}</p>
                              <p className="text-xs text-slate-500">{r.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex gap-2">
                      {viewMoment.status === 'ACTIVE' ? (
                        <Button
                          onClick={() => { updateStatus(viewMoment, 'PAUSED'); closeViewModal(); }}
                          variant="secondary"
                          size="sm"
                        >
                          Pause
                        </Button>
                      ) : (
                        <Button
                          onClick={() => { updateStatus(viewMoment, 'ACTIVE'); closeViewModal(); }}
                          variant="secondary"
                          size="sm"
                        >
                          Resume
                        </Button>
                      )}
                      <Button
                        onClick={() => deleteMoment(viewMoment)}
                        variant="danger"
                        size="sm"
                      >
                        Delete
                      </Button>
                    </div>
                    {isBroadcast(viewMoment) && (
                      <Button onClick={() => setEditMode(true)}>
                        Edit moment
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
