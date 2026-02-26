import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import { Button, Input, Select, cn } from "../../ui";
import AdminPage from "../ui/AdminPage";

type FeedbackRow = {
  id: string;
  type: "BUG_REPORT" | "FEATURE_REQUEST" | "SUGGESTION";
  subject: string | null;
  message: string;
  pagePath: string | null;
  createdAt: string;
  organization: { id: string; name: string };
  user: { id: string; email: string } | null;
};

const typeLabel: Record<FeedbackRow["type"], string> = {
  BUG_REPORT: "Bug Report",
  FEATURE_REQUEST: "Feature Request",
  SUGGESTION: "Suggestion",
};

const typeBadgeClass: Record<FeedbackRow["type"], string> = {
  BUG_REPORT: "admin-status-pill-danger",
  FEATURE_REQUEST: "admin-status-pill-info",
  SUGGESTION: "admin-status-pill-success",
};

export default function AdminFeedback() {
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    type: "",
    orgId: "",
    search: "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.type) params.set("type", filters.type);
      if (filters.orgId) params.set("orgId", filters.orgId);
      if (filters.search) params.set("search", filters.search);
      const data = await adminApi.call(`/feedback?${params.toString()}`);
      setFeedback(data.feedback || []);
    } catch (err: any) {
      setError(err.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminPage
      title="Feedback"
      description="Bug reports, feature requests, and suggestions from users."
      loading={loading}
      loadingLabel="Loading feedback…"
      error={error}
      actions={
        <div className="admin-toolbar">
          <Select
            value={filters.type}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, type: event.target.value }))
            }
            className="min-w-[180px]"
          >
            <option value="">All types</option>
            <option value="BUG_REPORT">Bug Report</option>
            <option value="FEATURE_REQUEST">Feature Request</option>
            <option value="SUGGESTION">Suggestion</option>
          </Select>
          <Input
            value={filters.orgId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, orgId: event.target.value }))
            }
            placeholder="Org ID"
            className="min-w-[170px]"
          />
          <Input
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
            placeholder="Search message/email/org"
            className="min-w-[250px]"
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
                <th className="ds-th">Type</th>
                <th className="ds-th">Subject / Message</th>
                <th className="ds-th">User</th>
                <th className="ds-th">Organization</th>
                <th className="ds-th">Page</th>
                <th className="ds-th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {feedback.map((entry) => (
                <tr key={entry.id} className="admin-table-row">
                  <td className="ds-td">
                    <span className={cn("admin-status-pill", typeBadgeClass[entry.type])}>
                      {typeLabel[entry.type]}
                    </span>
                  </td>
                  <td className="ds-td">
                    {entry.subject ? (
                      <div className="font-medium text-slate-800">{entry.subject}</div>
                    ) : null}
                    <div className="whitespace-pre-wrap text-xs text-slate-500">{entry.message}</div>
                  </td>
                  <td className="ds-td">
                    {entry.user ? (
                      <div>
                        <div>{entry.user.email}</div>
                        <div className="text-xs text-slate-400">{entry.user.id}</div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="ds-td">
                    <div>{entry.organization.name}</div>
                    <div className="text-xs text-slate-400">{entry.organization.id}</div>
                  </td>
                  <td className="ds-td text-xs text-slate-500">{entry.pagePath || "—"}</td>
                  <td className="ds-td">{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {feedback.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ds-td py-10 text-center text-slate-500">
                    No feedback entries found.
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
