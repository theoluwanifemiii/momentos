import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
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
        <>
          <input
            value={adminId}
            onChange={(event) => setAdminId(event.target.value)}
            placeholder="Admin ID"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Apply
          </button>
        </>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Target</th>
              <th className="px-4 py-3 text-left">Admin</th>
              <th className="px-4 py-3 text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-slate-700">{log.action}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {log.targetType ? `${log.targetType}:${log.targetId}` : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {log.admin.email}
                  <div className="text-xs text-slate-400">{log.admin.role}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  No audit logs found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
