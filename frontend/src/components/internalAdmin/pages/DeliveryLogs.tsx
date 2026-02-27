import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import { Button, Input, Select, cn } from "../../ui";
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

const statusClassMap: Record<string, string> = {
  SENT: "admin-status-pill-info",
  DELIVERED: "admin-status-pill-success",
  FAILED: "admin-status-pill-danger",
  QUEUED: "admin-status-pill-muted",
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
    setError("");
    try {
      await adminApi.call(`/delivery-logs/${id}/retry`, { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err.message || "Retry failed");
    }
  };

  return (
    <AdminPage
      title="Delivery Logs"
      description="Track email status, failures, and retries."
      loading={loading}
      loadingLabel="Loading logs…"
      error={error}
      actions={
        <div className="admin-toolbar">
          <Select
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value }))
            }
            className="min-w-[140px]"
          >
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Failed</option>
            <option value="QUEUED">Queued</option>
          </Select>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
            }
          />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, dateTo: event.target.value }))
            }
          />
          <Input
            value={filters.orgId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, orgId: event.target.value }))
            }
            placeholder="Org ID"
            className="min-w-[160px]"
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
                <th className="ds-th">Recipient</th>
                <th className="ds-th">Template</th>
                <th className="ds-th">Organization</th>
                <th className="ds-th">Status</th>
                <th className="ds-th">Sent</th>
                <th className="ds-th">Error</th>
                <th className="ds-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => (
                <tr key={log.id} className="admin-table-row">
                  <td className="ds-td">
                    <div className="font-medium text-slate-700">{log.person.name}</div>
                    <div className="text-xs text-slate-500">{log.person.email}</div>
                  </td>
                  <td className="ds-td">{log.template.name}</td>
                  <td className="ds-td">{log.organization}</td>
                  <td className="ds-td">
                    <span
                      className={cn(
                        "admin-status-pill",
                        statusClassMap[log.status] || "admin-status-pill-muted",
                      )}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="ds-td">
                    {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
                  </td>
                  <td className="ds-td text-xs text-red-700">{log.errorMessage || "—"}</td>
                  <td className="ds-td">
                    <div className="flex justify-end">
                      {log.status === "FAILED" ? (
                        <Button onClick={() => handleRetry(log.id)} size="sm" variant="secondary">
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ds-td py-10 text-center text-slate-500">
                    No logs found.
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
