import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OnboardingState } from '../types/onboarding';
import NextStepPanel from './onboarding/NextStepPanel';
import OnboardingBanner from './onboarding/OnboardingBanner';
import { Button, Card, CardBody, CardHeader, Input, Select } from './ui';

type ApiClient = {
  call: (endpoint: string, options?: RequestInit) => Promise<any>;
};

type TemplatesProps = {
  api: ApiClient;
  onboarding: OnboardingState | null;
  onOnboardingUpdate: (next: OnboardingState) => void;
  onSelectTab?: (tab: 'people' | 'templates' | 'settings' | 'upcoming' | 'dashboard') => void;
};

type DeliveryChannel = 'email' | 'sms' | 'whatsapp';

// Templates: create, set default, preview, test, and delete email templates.
export default function Templates({ api, onboarding, onOnboardingUpdate, onSelectTab }: TemplatesProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<'rendered' | 'code'>('rendered');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [editorMode, setEditorMode] = useState<'plain' | 'code'>('plain');
  const [actionMenu, setActionMenu] = useState<{
    template: any;
    top: number;
    left: number;
  } | null>(null);
  const [plainContent, setPlainContent] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const channelOptions: DeliveryChannel[] = ['email', 'sms', 'whatsapp'];
  const [form, setForm] = useState({
    name: '',
    type: 'PLAIN_TEXT',
    subject: '',
    content: '',
    imageUrl: '',
    channels: ['email'] as DeliveryChannel[],
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    const closeActionMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-action-menu-root="true"]')) {
        return;
      }
      setActionMenu(null);
    };

    const closeOnViewportChange = () => setActionMenu(null);

    window.addEventListener('click', closeActionMenu);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.removeEventListener('click', closeActionMenu);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, []);

  const stripHtml = (value: string) => value.replace(/<[^>]*>/g, '').trim();

  const formatPlainTextToHtml = (value: string) =>
    `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${value
      .split('\n')
      .map((line) => `<p>${line || '&nbsp;'}</p>`)
      .join('')}</div>`;

  const loadTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.call('/templates');
      if (!data.templates || data.templates.length === 0) {
        const created = await api.call('/templates/create-defaults', { method: 'POST' });
        if (created.onboarding) {
          onOnboardingUpdate(created.onboarding);
        }
        const refreshed = await api.call('/templates');
        setTemplates(refreshed.templates || []);
      } else {
        setTemplates(data.templates);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.subject || !form.content) {
      setError('Name, subject, and content are required.');
      return;
    }
    if (!form.channels.length) {
      setError('Select at least one delivery channel.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: any = {
        name: form.name,
        type: form.type,
        subject: form.subject,
        content:
          form.type === 'HTML' && editorMode === 'plain'
            ? formatPlainTextToHtml(plainContent)
            : editorMode === 'plain'
            ? plainContent
            : form.content,
        channels: form.channels,
      };
      if (form.imageUrl) {
        payload.imageUrl = form.imageUrl;
      }

      const data = await api.call('/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data.onboarding) {
        onOnboardingUpdate(data.onboarding);
        setSuccessMessage('✅ Template created. Next: choose it as default.');
      }
      setForm({
        name: '',
        type: 'PLAIN_TEXT',
        subject: '',
        content: '',
        imageUrl: '',
        channels: ['email'],
      });
      setPlainContent('');
      setEditorMode('plain');
      setAiPrompt('');
      setAiError('');
      setShowCreateModal(false);
      await loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setAiPrompt('');
    setAiError('');
  };

  const toggleChannel = (channel: DeliveryChannel) => {
    setForm((prev) => {
      const exists = prev.channels.includes(channel);
      if (exists) {
        if (prev.channels.length === 1) return prev;
        return { ...prev, channels: prev.channels.filter((item) => item !== channel) };
      }
      return { ...prev, channels: [...prev.channels, channel] };
    });
  };

  const handleGenerateDraft = async () => {
    if (!aiPrompt.trim()) {
      setAiError('Add a short message for the AI to draft from.');
      return;
    }

    setAiLoading(true);
    setAiError('');
    try {
      const data = await api.call('/ai/template-draft', {
        method: 'POST',
        body: JSON.stringify({ message: aiPrompt.trim() }),
      });
      setForm((prev) => ({
        ...prev,
        type: data.type || 'PLAIN_TEXT',
        subject: data.subject || prev.subject,
        content: data.content || prev.content,
      }));
      setPlainContent(data.content || '');
      setEditorMode('plain');
    } catch (err: any) {
      setAiError(err.message || 'AI draft failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleEdit = (template: any) => {
    setError('');
    setEditingTemplate(template);
    setForm({
      name: template.name || '',
      type: template.type || 'PLAIN_TEXT',
      subject: template.subject || '',
      content: template.content || '',
      imageUrl: template.imageUrl || '',
      channels:
        Array.isArray(template.channels) && template.channels.length > 0
          ? template.channels
          : ['email'],
    });
    setPlainContent(
      template.type === 'HTML' ? stripHtml(template.content || '') : template.content || ''
    );
    setEditorMode(template.type === 'HTML' ? 'plain' : 'plain');
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;
    if (!form.name || !form.subject || !form.content) {
      setError('Name, subject, and content are required.');
      return;
    }
    if (!form.channels.length) {
      setError('Select at least one delivery channel.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.call(`/templates/${editingTemplate.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          subject: form.subject,
          content:
            form.type === 'HTML' && editorMode === 'plain'
              ? formatPlainTextToHtml(plainContent)
              : editorMode === 'plain'
              ? plainContent
              : form.content,
          imageUrl: form.imageUrl || null,
          channels: form.channels,
        }),
      });
      setEditingTemplate(null);
      setForm({
        name: '',
        type: 'PLAIN_TEXT',
        subject: '',
        content: '',
        imageUrl: '',
        channels: ['email'],
      });
      setPlainContent('');
      setEditorMode('plain');
      setSuccessMessage('✅ Template updated.');
      await loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    const current = templates.find((template) => template.id === id);
    if (!current || current.isDefault) return;

    setSaving(true);
    setError('');
    try {
      const updates = [];
      updates.push(
        api.call(`/templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ isDefault: true }),
        })
      );

      const existingDefault = templates.find((template) => template.isDefault);
      if (existingDefault) {
        updates.push(
          api.call(`/templates/${existingDefault.id}`, {
            method: 'PUT',
            body: JSON.stringify({ isDefault: false }),
          })
        );
      }

      await Promise.all(updates);
      const onboardingResponse = await api.call('/onboarding/recompute', { method: 'POST' });
      if (onboardingResponse.onboarding) {
        onOnboardingUpdate(onboardingResponse.onboarding);
      }
      setSuccessMessage('✅ Default template selected. Next: configure send time.');
      await loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async (id: string) => {
    setPreview(null);
    setPreviewMode('rendered');
    setTestResult(null);
    setError('');
    try {
      const data = await api.call(`/templates/${id}/preview`, { method: 'POST' });
      setPreview({ id, ...data });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async (id: string) => {
    setTestResult(null);
    setError('');
    try {
      const data = await api.call(`/templates/${id}/test`, { method: 'POST' });
      setTestResult(data.message || 'Test email queued.');
      if (data.onboarding) {
        onOnboardingUpdate(data.onboarding);
        setSuccessMessage('✅ Test email sent. Next: activate automation.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this template?')) return;

    setSaving(true);
    setError('');
    try {
      const data = await api.call(`/templates/${id}`, { method: 'DELETE' });
      if (data?.onboarding) {
        onOnboardingUpdate(data.onboarding);
      }
      if (preview?.id === id) {
        setPreview(null);
      }
      setSuccessMessage('✅ Template deleted.');
      await loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActionMenu = (template: any, trigger: HTMLButtonElement) => {
    setActionMenu((current) => {
      if (current && String(current.template?.id) === String(template?.id)) {
        return null;
      }

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 176; // ds-dropdown width (w-44)
      const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
      const left = Math.max(8, Math.min(maxLeft, rect.right + 8));
      const top = Math.max(8, Math.min(window.innerHeight - 190, rect.top));

      return {
        template,
        top,
        left,
      };
    });
  };

  const actionTemplate = actionMenu?.template ?? null;

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
      {error && (
        <div className="ds-alert ds-alert-error">
          Templates error: {error}
        </div>
      )}
      <Card className="overflow-hidden">
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold">Templates</h2>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              MomentOS provides a curated set of templates.
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
            >
              Create Template
            </Button>
          </div>
        </CardHeader>

        {loading ? (
          <CardBody className="text-center">Loading templates...</CardBody>
        ) : templates.length === 0 ? (
          <CardBody className="text-center text-gray-600">No templates yet.</CardBody>
        ) : (
          <div className="ds-table-wrap">
            <table className="min-w-[800px] w-full ds-table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="ds-th">Name</th>
                  <th className="ds-th">Type</th>
                  <th className="ds-th">Subject</th>
                  <th className="ds-th">Channels</th>
                  <th className="ds-th">Default</th>
                  <th className="ds-th">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td className="ds-td font-medium">
                      <span>{template.name}</span>
                      {/*
                      {template.isDefault && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Default
                        </span>
                      )}
                      */}
                    </td>
                    <td className="ds-td text-gray-600">{template.type}</td>
                    <td className="ds-td text-gray-600">
                      {template.subject}
                    </td>
                    <td className="ds-td text-gray-600">
                      {(template.channels || ['email']).join(', ')}
                    </td>
                    <td className="ds-td">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="default-template"
                          checked={template.isDefault}
                          onChange={() => handleSetDefault(template.id)}
                        />
                        <span className="text-gray-600">Default</span>
                      </label>
                    </td>
                    <td className="ds-td">
                      <div className="relative inline-block text-left" data-action-menu-root="true">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActionMenu(template, e.currentTarget);
                          }}
                          className={`ds-icon-trigger ${
                            actionMenu && String(actionMenu.template?.id) === String(template.id)
                              ? 'bg-gray-50 text-gray-700'
                              : ''
                          }`}
                          aria-label="Open template actions"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <circle cx="3" cy="8" r="1.25" />
                            <circle cx="8" cy="8" r="1.25" />
                            <circle cx="13" cy="8" r="1.25" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {actionMenu && actionTemplate && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="ds-dropdown"
              style={{ top: actionMenu.top, left: actionMenu.left }}
              onClick={(e) => e.stopPropagation()}
              data-action-menu-root="true"
            >
              <button
                onClick={() => {
                  setActionMenu(null);
                  handlePreview(actionTemplate.id);
                }}
                className="ds-dropdown-item"
              >
                Preview
              </button>
              <button
                onClick={() => {
                  setActionMenu(null);
                  handleEdit(actionTemplate);
                }}
                className="ds-dropdown-item"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setActionMenu(null);
                  handleTest(actionTemplate.id);
                }}
                className="ds-dropdown-item"
              >
                Send Test
              </button>
              <button
                onClick={() => {
                  setActionMenu(null);
                  handleDelete(actionTemplate.id);
                }}
                disabled={saving}
                className="ds-dropdown-item text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </div>,
            document.body
          )
        : null}

      {showCreateModal && (
        <div className="ds-modal-shell">
          <div
            className="ds-modal-backdrop"
            onClick={closeCreateModal}
          />
          <div className="ds-modal-position">
            <div className="ds-modal-panel">
              <div className="ds-modal-header">
                <h3 className="text-lg font-bold">Create Template</h3>
                <Button
                  onClick={closeCreateModal}
                  variant="ghost"
                  size="sm"
                >
                  Close
                </Button>
              </div>
              <div className="ds-card-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="ds-label">Name</label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Template name"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Type</label>
                    <Select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                    >
                      <option value="PLAIN_TEXT">Plain Text</option>
                      <option value="HTML">HTML</option>
                      <option value="CUSTOM_IMAGE">Custom Image</option>
                    </Select>
                  </div>
                  <div>
                    <label className="ds-label">Editor</label>
                    <div className="flex items-center gap-3 text-sm">
                      <Button
                        type="button"
                        onClick={() => setEditorMode('plain')}
                        variant="secondary"
                        size="sm"
                        className={`${
                          editorMode === 'plain'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : ''
                        }`}
                      >
                        Plain Text
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setEditorMode('code')}
                        variant="secondary"
                        size="sm"
                        className={`${
                          editorMode === 'code'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : ''
                        }`}
                      >
                        Code
                      </Button>
                    </div>
                    {form.type === 'HTML' && editorMode === 'plain' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Plain text will be formatted into HTML automatically.
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="ds-label">Subject</label>
                    <Input
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      placeholder="Email subject"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="ds-label">AI Draft (optional)</label>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      className="ds-textarea h-24"
                      placeholder="Paste your message or notes. Example: Write a warm, faith-based birthday note for a church member."
                    />
                    <div className="mt-2 flex items-center gap-3">
                      <Button
                        type="button"
                        onClick={handleGenerateDraft}
                        disabled={aiLoading}
                        variant="secondary"
                        size="sm"
                        className="text-blue-700"
                      >
                        {aiLoading ? 'Generating...' : 'Generate with AI'}
                      </Button>
                      <span className="text-xs text-gray-500">
                        Drafts a subject + message in plain text.
                      </span>
                    </div>
                    {aiError && <p className="text-xs text-red-600 mt-2">{aiError}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="ds-label">Delivery Channels</label>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {channelOptions.map((channel) => (
                        <label key={channel} className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.channels.includes(channel)}
                            onChange={() => toggleChannel(channel)}
                          />
                          <span className="uppercase">{channel}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Email, SMS, and WhatsApp are sent only if enabled in Settings.
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="ds-label">Content</label>
                    <textarea
                      value={editorMode === 'plain' ? plainContent : form.content}
                      onChange={(e) =>
                        editorMode === 'plain'
                          ? setPlainContent(e.target.value)
                          : setForm({ ...form, content: e.target.value })
                      }
                      className="ds-textarea h-40 font-mono"
                      placeholder={
                        editorMode === 'plain'
                          ? 'Write a friendly message (no HTML needed)'
                          : 'Template content (use {{first_name}} and {{organization_name}})'
                      }
                    />
                  </div>
                  {form.type === 'CUSTOM_IMAGE' && (
                    <div className="md:col-span-2">
                      <label className="ds-label">Image URL</label>
                      <Input
                        value={form.imageUrl}
                        onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                        placeholder="https://example.com/image.png"
                      />
                    </div>
                  )}
                </div>

                {error && <p className="mt-3 text-sm text-red-600">Template error: {error}</p>}

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    onClick={closeCreateModal}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Create Template'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingTemplate && (
        <div className="ds-modal-shell">
          <div
            className="ds-modal-backdrop"
            onClick={() => setEditingTemplate(null)}
          />
          <div className="ds-modal-position">
            <div className="ds-modal-panel">
              <div className="ds-modal-header">
                <h3 className="text-lg font-bold">Edit Template</h3>
                <Button
                  onClick={() => setEditingTemplate(null)}
                  variant="ghost"
                  size="sm"
                >
                  Close
                </Button>
              </div>
              <div className="ds-card-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="ds-label">Name</label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Template name"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Type</label>
                    <Select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                    >
                      <option value="PLAIN_TEXT">Plain Text</option>
                      <option value="HTML">HTML</option>
                      <option value="CUSTOM_IMAGE">Custom Image</option>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="ds-label">Subject</label>
                    <Input
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      placeholder="Email subject"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="ds-label">Content</label>
                    <textarea
                      value={editorMode === 'plain' ? plainContent : form.content}
                      onChange={(e) =>
                        editorMode === 'plain'
                          ? setPlainContent(e.target.value)
                          : setForm({ ...form, content: e.target.value })
                      }
                      className="ds-textarea h-40 font-mono"
                      placeholder={
                        editorMode === 'plain'
                          ? 'Write a friendly message (no HTML needed)'
                          : 'Template content (use {{first_name}} and {{organization_name}})'
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="ds-label">Delivery Channels</label>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {channelOptions.map((channel) => (
                        <label key={channel} className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.channels.includes(channel)}
                            onChange={() => toggleChannel(channel)}
                          />
                          <span className="uppercase">{channel}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Email, SMS, and WhatsApp are sent only if enabled in Settings.
                    </p>
                  </div>
                  {form.type === 'CUSTOM_IMAGE' && (
                    <div className="md:col-span-2">
                      <label className="ds-label">Image URL</label>
                      <Input
                        value={form.imageUrl}
                        onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                        placeholder="https://example.com/image.png"
                      />
                    </div>
                  )}
                </div>

                {error && <p className="mt-3 text-sm text-red-600">Template error: {error}</p>}

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    onClick={() => setEditingTemplate(null)}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdate}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Update Template'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="ds-modal-shell">
          <div
            className="ds-modal-backdrop"
            onClick={() => setPreview(null)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl">
            <div className="ds-modal-header">
              <h3 className="text-lg font-bold">Template Preview</h3>
              <Button
                onClick={() => setPreview(null)}
                variant="ghost"
                size="sm"
              >
                Close
              </Button>
            </div>
            <div className="px-6 pt-4">
              <div className="inline-flex rounded-md border border-slate-200">
                <Button
                  onClick={() => setPreviewMode('rendered')}
                  variant="ghost"
                  size="sm"
                  className={`rounded-none border-r border-slate-200 ${
                    previewMode === 'rendered'
                      ? 'bg-blue-600 text-white'
                      : ''
                  }`}
                >
                  Rendered
                </Button>
                <Button
                  onClick={() => setPreviewMode('code')}
                  variant="ghost"
                  size="sm"
                  className={`rounded-none ${
                    previewMode === 'code'
                      ? 'bg-blue-600 text-white'
                      : ''
                  }`}
                >
                  Code
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto h-full">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Subject</p>
                <p className="text-sm text-gray-800">{preview.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Content</p>
                {previewMode === 'code' ? (
                  <pre className="rounded border border-slate-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                    {preview.content}
                  </pre>
                ) : preview.type === 'HTML' ? (
                  <div
                    className="rounded border border-slate-200 bg-white p-4"
                    dangerouslySetInnerHTML={{ __html: preview.content }}
                  />
                ) : (
                  <div className="rounded border border-slate-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                    {preview.content}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {testResult && (
        <div className="ds-alert ds-alert-success">
          {testResult}
        </div>
      )}
    </div>
  );
}
