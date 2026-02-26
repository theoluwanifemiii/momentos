import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import { Button, Input } from "../../ui";
import AdminPage from "../ui/AdminPage";

type AuditLogRow = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  admin: { email: string; role: string };
  metadata: Record<string, any> | null;
  createdAt: string;
};

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminId, setAdminId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (adminId) params.set("adminId", adminId);
      const data = await adminApi.call(`/audit-logs?${params.toString()}`);
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminPage
      title="Audit Logs"
      description="Immutable record of internal admin actions."
      loading={loading}
      loadingLabel="Loading audit logs…"
      error={error}
      actions={
        <div className="admin-toolbar">
          <Input
            value={adminId}
            onChange={(event) => setAdminId(event.target.value)}
            placeholder="Admin ID"
            className="min-w-[190px]"
          />
          <Button onClick={load} variant="secondary">
            Apply
          </Button>
        </div>
      }
    >
      <div className="admin-panel overflow-hidden">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead className="bg-slate-50">
              <tr>
                <th className="ds-th">Action</th>
                <th className="ds-th">Target</th>
                <th className="ds-th">Admin</th>
                <th className="ds-th">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => (
                <tr key={log.id} className="admin-table-row">
                  <td className="ds-td font-medium text-slate-700">{log.action}</td>
                  <td className="ds-td text-xs text-slate-500">
                    {log.targetType ? `${log.targetType}:${log.targetId}` : "—"}
                  </td>
                  <td className="ds-td">
                    <div>{log.admin.email}</div>
                    <div className="text-xs text-slate-400">{log.admin.role}</div>
                  </td>
                  <td className="ds-td">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="ds-td py-10 text-center text-slate-500">
                    No audit logs found.
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
