import { useEffect, useState } from 'react';

type ApiClient = {
  call: (endpoint: string, options?: RequestInit) => Promise<any>;
};

type TemplatesProps = {
  api: ApiClient;
};

// Templates: create, set default, preview, test, and delete email templates.
export default function Templates({ api }: TemplatesProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<'rendered' | 'code'>('rendered');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'PLAIN_TEXT',
    subject: '',
    content: '',
    imageUrl: '',
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.call('/templates');
      if (!data.templates || data.templates.length === 0) {
        await api.call('/templates/create-defaults', { method: 'POST' });
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

    setSaving(true);
    setError('');
    try {
      const payload: any = {
        name: form.name,
        type: form.type,
        subject: form.subject,
        content: form.content,
      };
      if (form.imageUrl) {
        payload.imageUrl = form.imageUrl;
      }

      await api.call('/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setForm({
        name: '',
        type: 'PLAIN_TEXT',
        subject: '',
        content: '',
        imageUrl: '',
      });
      setShowCreateModal(false);
      await loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this template?')) return;
    setSaving(true);
    setError('');
    try {
      await api.call(`/templates/${id}`, { method: 'DELETE' });
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
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          Templates error: {error}
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl font-bold">Templates</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            New Template
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="p-6 text-center text-gray-600">No templates yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      <span>{template.name}</span>
                      {/*
                      {template.isDefault && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Default
                        </span>
                      )}
                      */}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{template.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {template.subject}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <button
                          onClick={() => handlePreview(template.id)}
                          className="text-blue-600 hover:underline"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => handleTest(template.id)}
                          className="text-blue-600 hover:underline"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-bold">Create Template</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Close
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Template name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="PLAIN_TEXT">Plain Text</option>
                      <option value="HTML">HTML</option>
                      <option value="CUSTOM_IMAGE">Custom Image</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Subject</label>
                    <input
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Email subject"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Content</label>
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      className="w-full h-40 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="Template content (use {{first_name}} and {{organization_name}})"
                    />
                  </div>
                  {form.type === 'CUSTOM_IMAGE' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">Image URL</label>
                      <input
                        value={form.imageUrl}
                        onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://example.com/image.png"
                      />
                    </div>
                  )}
                </div>

                {error && <p className="mt-3 text-sm text-red-600">Template error: {error}</p>}

                <div className="mt-4 flex justify-end gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded text-sm text-gray-700 border hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Create Template'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPreview(null)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">Template Preview</h3>
              <button
                onClick={() => setPreview(null)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            <div className="px-6 pt-4">
              <div className="inline-flex rounded border">
                <button
                  onClick={() => setPreviewMode('rendered')}
                  className={`px-3 py-1 text-sm ${
                    previewMode === 'rendered'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Rendered
                </button>
                <button
                  onClick={() => setPreviewMode('code')}
                  className={`px-3 py-1 text-sm ${
                    previewMode === 'code'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Code
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto h-full">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Subject</p>
                <p className="text-sm text-gray-800">{preview.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Content</p>
                {previewMode === 'code' ? (
                  <pre className="border rounded p-4 bg-gray-50 text-sm whitespace-pre-wrap">
                    {preview.content}
                  </pre>
                ) : preview.type === 'HTML' ? (
                  <div
                    className="border rounded p-4 bg-white"
                    dangerouslySetInnerHTML={{ __html: preview.content }}
                  />
                ) : (
                  <div className="border rounded p-4 bg-gray-50 text-sm whitespace-pre-wrap">
                    {preview.content}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {testResult && (
        <div className="bg-green-50 text-green-800 p-4 rounded-lg">
          {testResult}
        </div>
      )}
    </div>
  );
}
