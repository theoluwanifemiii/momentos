import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import AdminPage from "../ui/AdminPage";

type LogRow = {
  id: string;
  person: { name: string; email: string };
  template: { name: string; type: string };
  organization: string;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  retryCount: number;
  externalId: string | null;
  createdAt: string;
};

export default function AdminDeliveryLogs() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    dateFrom: "",
    dateTo: "",
    orgId: "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.orgId) params.set("orgId", filters.orgId);
      const data = await adminApi.call(`/delivery-logs?${params.toString()}`);
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRetry = async (id: string) => {
    await adminApi.call(`/delivery-logs/${id}/retry`, { method: "POST" });
    load();
  };

  return (
    <AdminPage
      title="Delivery Logs"
      description="Track email status, failures, and retries."
      loading={loading}
      loadingLabel="Loading logs…"
      error={error}
      actions={
        <>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value }))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Failed</option>
            <option value="QUEUED">Queued</option>
          </select>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, dateTo: event.target.value }))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            value={filters.orgId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, orgId: event.target.value }))
            }
            placeholder="Org ID"
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
              <th className="px-4 py-3 text-left">Recipient</th>
              <th className="px-4 py-3 text-left">Template</th>
              <th className="px-4 py-3 text-left">Org</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Sent</th>
              <th className="px-4 py-3 text-left">Error</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-700">{log.person.name}</div>
                  <div className="text-xs text-slate-500">{log.person.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {log.template.name}
                </td>
                <td className="px-4 py-3 text-slate-600">{log.organization}</td>
                <td className="px-4 py-3 text-slate-600">{log.status}</td>
                <td className="px-4 py-3 text-slate-600">
                  {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-rose-600">
                  {log.errorMessage || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    {log.status === "FAILED" ? (
                      <button
                        onClick={() => handleRetry(log.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  No logs found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
