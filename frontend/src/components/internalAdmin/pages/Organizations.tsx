import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { adminApi } from "../../../api";
import { Button, Input, Select, cn } from "../../ui";
import AdminPage from "../ui/AdminPage";

type AdminContext = {
  admin: { role: "SUPER_ADMIN" | "SUPPORT" } | null;
};

type Org = {
  id: string;
  name: string;
  plan: string;
  timezone: string;
  emailFromAddress: string | null;
  isSuspended: boolean;
  createdAt: string;
  counts: { users: number; people: number };
};

export default function AdminOrganizations() {
  const navigate = useNavigate();
  const { admin } = useOutletContext<AdminContext>();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    status: "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      const data = await adminApi.call(`/orgs?${params.toString()}`);
      setOrgs(data.organizations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSuspend = async (id: string) => {
    if (!window.confirm("Suspend this organization?")) return;
    setError("");
    try {
      await adminApi.call(`/orgs/${id}/suspend`, { method: "PATCH" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to suspend organization");
    }
  };

  const handleReactivate = async (id: string) => {
    setError("");
    try {
      await adminApi.call(`/orgs/${id}/reactivate`, { method: "PATCH" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to reactivate organization");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this organization permanently?")) return;
    setError("");
    try {
      await adminApi.call(`/orgs/${id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to delete organization");
    }
  };

  return (
    <AdminPage
      title="Organizations"
      description="Manage org status, activity, and user access."
      loading={loading}
      loadingLabel="Loading organizations…"
      error={error}
      actions={
        <div className="admin-toolbar">
          <Input
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
            placeholder="Search orgs"
            className="min-w-[190px]"
          />
          <Select
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value }))
            }
            className="min-w-[150px]"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
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
                <th className="ds-th">Organization</th>
                <th className="ds-th">Plan</th>
                <th className="ds-th">Timezone</th>
                <th className="ds-th">Users</th>
                <th className="ds-th">People</th>
                <th className="ds-th">Status</th>
                <th className="ds-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orgs.map((org) => (
                <tr key={org.id} className="admin-table-row">
                  <td className="ds-td">
                    <div className="font-medium text-slate-900">{org.name}</div>
                    <div className="text-xs text-slate-500">
                      {org.emailFromAddress || "Default sender"}
                    </div>
                  </td>
                  <td className="ds-td">{org.plan}</td>
                  <td className="ds-td">{org.timezone}</td>
                  <td className="ds-td">{org.counts.users}</td>
                  <td className="ds-td">{org.counts.people}</td>
                  <td className="ds-td">
                    <span
                      className={cn(
                        "admin-status-pill",
                        org.isSuspended
                          ? "admin-status-pill-danger"
                          : "admin-status-pill-success",
                      )}
                    >
                      {org.isSuspended ? "Suspended" : "Active"}
                    </span>
                  </td>
                  <td className="ds-td">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        onClick={() => navigate(`/admin/orgs/${org.id}`)}
                        size="sm"
                        variant="secondary"
                      >
                        View
                      </Button>
                      {org.isSuspended ? (
                        <Button
                          onClick={() => handleReactivate(org.id)}
                          size="sm"
                          variant="secondary"
                          className="border-green-200 text-green-700 hover:bg-green-100"
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleSuspend(org.id)}
                          size="sm"
                          variant="secondary"
                          className="border-red-200 text-red-700 hover:bg-red-100"
                        >
                          Suspend
                        </Button>
                      )}
                      {admin?.role === "SUPER_ADMIN" ? (
                        <Button
                          onClick={() => handleDelete(org.id)}
                          size="sm"
                          variant="ghost"
                          className="text-slate-500"
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ds-td py-10 text-center text-slate-500">
                    No organizations found.
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
