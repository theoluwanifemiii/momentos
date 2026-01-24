import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import AdminPage from "../ui/AdminPage";

type TemplateRow = {
  id: string;
  templateId: string;
  name: string;
  type: string;
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
  organization: string;
};

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orgId, setOrgId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [assignAll, setAssignAll] = useState(true);
  const [assignOrgId, setAssignOrgId] = useState("");
  const [form, setForm] = useState({
    name: "",
    type: "PLAIN_TEXT",
    subject: "",
    content: "",
    imageUrl: "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (orgId) params.set("orgId", orgId);
      const data = await adminApi.call(`/templates?${params.toString()}`);
      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDisable = async (id: string) => {
    await adminApi.call(`/templates/${id}/disable`, { method: "PATCH" });
    load();
  };

  const handleCreate = async () => {
    setCreateError("");
    setCreating(true);
    try {
      const payload: Record<string, any> = {
        name: form.name,
        type: form.type,
        subject: form.subject,
        content: form.content,
      };
      if (form.imageUrl) payload.imageUrl = form.imageUrl;
      if (assignAll) {
        payload.assignAll = true;
      } else if (assignOrgId) {
        payload.organizationId = assignOrgId;
      }

      await adminApi.call("/templates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setForm({
        name: "",
        type: "PLAIN_TEXT",
        subject: "",
        content: "",
        imageUrl: "",
      });
      setAssignOrgId("");
      setAssignAll(true);
      load();
    } catch (err: any) {
      setCreateError(err.message || "Template create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminPage
      title="Templates"
      description="Review and disable templates if needed."
      loading={loading}
      loadingLabel="Loading templates…"
      error={error}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-900">
          Create global template
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="Template name"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={form.type}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, type: event.target.value }))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="PLAIN_TEXT">Plain text</option>
            <option value="HTML">HTML</option>
            <option value="CUSTOM_IMAGE">Custom image</option>
          </select>
          <input
            value={form.subject}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, subject: event.target.value }))
            }
            placeholder="Subject"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2"
          />
          <textarea
            value={form.content}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, content: event.target.value }))
            }
            placeholder="Content"
            rows={4}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={form.imageUrl}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, imageUrl: event.target.value }))
            }
            placeholder="Image URL (optional)"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={assignAll}
              onChange={(event) => setAssignAll(event.target.checked)}
            />
            Assign to all organizations
          </label>
          {!assignAll ? (
            <input
              value={assignOrgId}
              onChange={(event) => setAssignOrgId(event.target.value)}
              placeholder="Organization ID"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          ) : null}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create template"}
          </button>
        </div>
        {createError ? (
          <div className="text-xs text-rose-600">{createError}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={orgId}
          onChange={(event) => setOrgId(event.target.value)}
          placeholder="Org ID"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <button
          onClick={load}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Apply
        </button>
      </div>
      {!loading ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Template</th>
                <th className="px-4 py-3 text-left">Organization</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Default</th>
                <th className="px-4 py-3 text-left">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="px-4 py-3 text-slate-700">{template.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {template.organization}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{template.type}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {template.isDefault ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3">
                    {template.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {template.isActive ? (
                        <button
                          onClick={() => handleDisable(template.id)}
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Disable
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    No templates found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminPage>
  );
}
