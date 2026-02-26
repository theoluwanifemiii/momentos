import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import { Button, Card, CardBody, Input, Select, cn } from "../../ui";
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
    setError("");
    try {
      await adminApi.call(`/templates/${id}/disable`, { method: "PATCH" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to disable template");
    }
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
      await load();
    } catch (err: any) {
      setCreateError(err.message || "Template create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminPage
      title="Templates"
      description="Review, create, and disable templates by organization."
      loading={loading}
      loadingLabel="Loading templates…"
      error={error}
    >
      <Card>
        <CardBody className="space-y-4 p-5">
          <div className="text-sm font-semibold text-slate-900">Create global template</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Template name"
            />
            <Select
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value }))
              }
            >
              <option value="PLAIN_TEXT">Plain text</option>
              <option value="HTML">HTML</option>
              <option value="CUSTOM_IMAGE">Custom image</option>
            </Select>
            <Input
              value={form.subject}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, subject: event.target.value }))
              }
              placeholder="Subject"
              className="md:col-span-2"
            />
            <textarea
              value={form.content}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, content: event.target.value }))
              }
              placeholder="Content"
              rows={4}
              className="ds-textarea md:col-span-2"
            />
            <Input
              value={form.imageUrl}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, imageUrl: event.target.value }))
              }
              placeholder="Image URL (optional)"
              className="md:col-span-2"
            />
          </div>
          <div className="admin-toolbar">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={assignAll}
                onChange={(event) => setAssignAll(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Assign to all organizations
            </label>
            {!assignAll ? (
              <Input
                value={assignOrgId}
                onChange={(event) => setAssignOrgId(event.target.value)}
                placeholder="Organization ID"
                className="min-w-[220px]"
              />
            ) : null}
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create template"}
            </Button>
          </div>
          {createError ? <div className="ds-alert ds-alert-error">{createError}</div> : null}
        </CardBody>
      </Card>

      <div className="admin-toolbar">
        <Input
          value={orgId}
          onChange={(event) => setOrgId(event.target.value)}
          placeholder="Org ID"
          className="min-w-[180px]"
        />
        <Button onClick={load} variant="secondary">
          Apply
        </Button>
      </div>

      <div className="admin-panel overflow-hidden">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead className="bg-slate-50">
              <tr>
                <th className="ds-th">Template</th>
                <th className="ds-th">Organization</th>
                <th className="ds-th">Type</th>
                <th className="ds-th">Default</th>
                <th className="ds-th">Active</th>
                <th className="ds-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {templates.map((template) => (
                <tr key={template.id} className="admin-table-row">
                  <td className="ds-td font-medium text-slate-700">{template.name}</td>
                  <td className="ds-td">{template.organization}</td>
                  <td className="ds-td">{template.type}</td>
                  <td className="ds-td">{template.isDefault ? "Yes" : "No"}</td>
                  <td className="ds-td">
                    <span
                      className={cn(
                        "admin-status-pill",
                        template.isActive ? "admin-status-pill-success" : "admin-status-pill-muted",
                      )}
                    >
                      {template.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="ds-td">
                    <div className="flex justify-end gap-2">
                      {template.isActive ? (
                        <Button
                          onClick={() => handleDisable(template.id)}
                          size="sm"
                          variant="secondary"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        >
                          Disable
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ds-td py-10 text-center text-slate-500">
                    No templates found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
