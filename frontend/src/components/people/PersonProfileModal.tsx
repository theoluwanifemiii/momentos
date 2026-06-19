import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '../ui';

type ApiClient = {
  call: (endpoint: string, options?: RequestInit) => Promise<any>;
};

type PersonRecord = {
  id: string;
  fullName: string;
  firstName?: string | null;
  email: string;
  phone?: string | null;
  birthday: string;
  workStartDate?: string | null;
  department?: string | null;
  role?: string | null;
};

type TemplateOption = {
  id: string;
  name: string;
  channels?: ('email' | 'sms' | 'whatsapp')[];
};

type MomentCategory = {
  key: string;
  label: string;
};

type PersonalMomentRecord = {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  recurrenceRule:
    | 'ONE_TIME'
    | 'ANNUAL'
    | 'DAILY'
    | 'MONTHLY'
    | 'QUARTERLY'
    | 'BI_YEARLY'
    | 'CUSTOM';
  customIntervalDays?: number | null;
  randomizeMessage?: boolean;
  deliveryChannels: ('email' | 'sms' | 'whatsapp')[];
  status: 'ACTIVE' | 'PAUSED';
};

type CreatePersonalMomentForm = {
  title: string;
  category: string;
  recurrenceRule: 'ANNUAL' | 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'BI_YEARLY' | 'CUSTOM';
  customIntervalDays: string;
  randomizeMessage: boolean;
  eventDate: string;
  templateId: string;
  deliveryChannels: ('email' | 'sms' | 'whatsapp')[];
};

type PersonProfileModalProps = {
  api: ApiClient;
  person: PersonRecord;
  onClose: () => void;
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

const initialForm: CreatePersonalMomentForm = {
  title: '',
  category: 'BIRTHDAY',
  recurrenceRule: 'MONTHLY',
  customIntervalDays: '',
  randomizeMessage: false,
  eventDate: '',
  templateId: '',
  deliveryChannels: ['email'],
};

const recurrenceOptions: Array<{ value: CreatePersonalMomentForm['recurrenceRule']; label: string }> = [
  { value: 'ANNUAL', label: 'Yearly' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'BI_YEARLY', label: 'Bi-yearly' },
  { value: 'CUSTOM', label: 'Custom (interval)' },
];

const recurrenceLabel: Record<PersonalMomentRecord['recurrenceRule'], string> = {
  ONE_TIME: 'One-time',
  ANNUAL: 'Yearly',
  DAILY: 'Daily',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  BI_YEARLY: 'Bi-yearly',
  CUSTOM: 'Custom',
};

const formatCategory = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function PersonProfileModal({ api, person, onClose }: PersonProfileModalProps) {
  const [categories, setCategories] = useState<MomentCategory[]>(categoryFallback);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [moments, setMoments] = useState<PersonalMomentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [form, setForm] = useState<CreatePersonalMomentForm>(initialForm);

  const personalMomentCount = useMemo(
    () => moments.length,
    [moments]
  );
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId) || null,
    [templates, form.templateId]
  );

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [categoryData, templateData, personalMomentsData] = await Promise.all([
        api.call('/moments/categories'),
        api.call('/templates'),
        api.call(`/moments/personal/${person.id}`),
      ]);

      const nextCategories = categoryData?.categories || categoryFallback;
      const nextTemplates = templateData?.templates || [];
      setCategories(nextCategories);
      setTemplates(nextTemplates);
      setMoments(personalMomentsData?.moments || []);
      setForm((prev) => ({
        ...prev,
        templateId: prev.templateId || nextTemplates[0]?.id || '',
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load profile moments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [person.id]);

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
    if (!form.title.trim()) return 'Add a title for this personal moment.';
    if (!form.category) return 'Choose a category.';
    if (!form.eventDate) return 'Choose an event date.';
    if (!form.templateId) return 'Choose a template.';
    if (form.deliveryChannels.length === 0) return 'Select at least one delivery channel.';
    if (form.recurrenceRule === 'CUSTOM') {
      const interval = Number(form.customIntervalDays);
      if (!Number.isInteger(interval) || interval < 1) {
        return 'Custom recurrence interval must be at least 1 day.';
      }
    }
    return null;
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

  const createPersonalMoment = async () => {
    const validationError = validateCreate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.call(`/moments/personal/${person.id}`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          eventDate: form.eventDate,
          recurrenceRule: form.recurrenceRule,
          customIntervalDays:
            form.recurrenceRule === 'CUSTOM' ? Number(form.customIntervalDays) : null,
          randomizeMessage: form.randomizeMessage,
          deliveryChannels: form.deliveryChannels,
          templateId: form.templateId || null,
        }),
      });
      setSuccess('Personal moment added.');
      setForm({
        ...initialForm,
        templateId: templates[0]?.id || '',
      });
      setAiPrompt('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create personal moment.');
    } finally {
      setSaving(false);
    }
  };

  const updateMomentStatus = async (
    moment: PersonalMomentRecord,
    status: 'ACTIVE' | 'PAUSED'
  ) => {
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

  const deleteMoment = async (moment: PersonalMomentRecord) => {
    if (!window.confirm(`Delete "${moment.title}"?`)) return;

    setError('');
    setSuccess('');
    try {
      await api.call(`/moments/${moment.id}`, { method: 'DELETE' });
      setSuccess('Moment deleted.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete moment.');
    }
  };

  return (
    <div className="ds-modal-shell">
      <div className="ds-modal-backdrop" onClick={onClose} />
      <div className="ds-modal-position">
        <div className="ds-modal-panel max-h-[90vh] max-w-5xl overflow-hidden flex flex-col">
          <div className="ds-modal-header">
            <div>
              <h3 className="text-lg font-bold">{person.fullName}</h3>
              <p className="text-sm text-slate-600">Relationship profile and personal moments</p>
            </div>
            <Button onClick={onClose} variant="ghost" size="sm">
              Close
            </Button>
          </div>

          <div className="ds-card-body flex-1 space-y-5 overflow-y-auto">
            {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
            {success ? <div className="ds-alert ds-alert-success">{success}</div> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="font-semibold text-slate-900">Contact</div>
                <div className="mt-2 space-y-1 text-slate-600">
                  <div>Email: {person.email}</div>
                  <div>Phone: {person.phone || '—'}</div>
                  <div>Birthday: {new Date(person.birthday).toLocaleDateString()}</div>
                  {person.workStartDate ? (
                    <div>Work anniversary: {new Date(person.workStartDate).toLocaleDateString()}</div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="font-semibold text-slate-900">Context</div>
                <div className="mt-2 space-y-1 text-slate-600">
                  <div>Department: {person.department || '—'}</div>
                  <div>Role: {person.role || '—'}</div>
                  <div>Personal Moments: {personalMomentCount}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900">Add Personal Moment</h4>
                  <p className="text-sm text-slate-600">
                    Create a moment for {person.firstName || person.fullName} directly from their profile.
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Personal
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="ds-label">Title</label>
                  <Input
                    value={form.title}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Birthday reminder"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="ds-label">Category</label>
                  <Select
                    value={form.category}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, category: event.target.value }))
                    }
                    className="mt-1"
                  >
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="ds-label">Date</label>
                  <Input
                    type="date"
                    value={form.eventDate}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, eventDate: event.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="ds-label">Recurrence</label>
                  <Select
                    value={form.recurrenceRule}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        recurrenceRule: event.target.value as CreatePersonalMomentForm['recurrenceRule'],
                      }))
                    }
                    className="mt-1"
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
                      className="mt-1"
                    />
                  </div>
                ) : null}
                <div className="md:col-span-2">
                  <label className="ds-label">Template</label>
                  <Select
                    value={form.templateId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, templateId: event.target.value }))
                    }
                    className="mt-1"
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
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={aiPrompt}
                      onChange={(event) => setAiPrompt(event.target.value)}
                      placeholder="Describe the tone or context and AI will generate the message"
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
                  <label className="ds-label">Channels</label>
                  <div className="mt-1 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
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
                <div className="md:col-span-2">
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
              <div className="mt-4 flex justify-end">
                <Button onClick={createPersonalMoment} disabled={saving}>
                  {saving ? 'Saving...' : 'Add Personal Moment'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h4 className="font-semibold text-slate-900">Personal Moment Timeline</h4>
              </div>
              {loading ? (
                <div className="p-4 text-sm text-slate-600">Loading personal moments...</div>
              ) : moments.length === 0 ? (
                <div className="p-4 text-sm text-slate-600">
                  No personal moments yet for this person.
                </div>
              ) : (
                <div className="ds-table-wrap">
                  <table className="min-w-[760px] w-full ds-table">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="ds-th">Title</th>
                        <th className="ds-th">Category</th>
                        <th className="ds-th">Date</th>
                        <th className="ds-th">Recurrence</th>
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
                              {moment.randomizeMessage ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
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
                            {moment.recurrenceRule === 'CUSTOM' && moment.customIntervalDays
                              ? ` (${moment.customIntervalDays}d)`
                              : ''}
                          </td>
                          <td className="ds-td text-slate-600">{moment.deliveryChannels.join(', ')}</td>
                          <td className="ds-td text-slate-600">{moment.status}</td>
                          <td className="ds-td">
                            <div className="flex items-center gap-2">
                              {moment.status === 'ACTIVE' ? (
                                <Button
                                  onClick={() => updateMomentStatus(moment, 'PAUSED')}
                                  variant="secondary"
                                  size="sm"
                                >
                                  Pause
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => updateMomentStatus(moment, 'ACTIVE')}
                                  variant="secondary"
                                  size="sm"
                                >
                                  Resume
                                </Button>
                              )}
                              <Button
                                onClick={() => deleteMoment(moment)}
                                variant="danger"
                                size="sm"
                              >
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
