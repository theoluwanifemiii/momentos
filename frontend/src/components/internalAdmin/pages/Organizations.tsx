import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { adminApi } from "../../../api";
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
    await adminApi.call(`/orgs/${id}/suspend`, { method: "PATCH" });
    load();
  };

  const handleReactivate = async (id: string) => {
    await adminApi.call(`/orgs/${id}/reactivate`, { method: "PATCH" });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this organization permanently?")) return;
    await adminApi.call(`/orgs/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <AdminPage
      title="Organizations"
      description="Manage org status, activity, and user access."
      loading={loading}
      loadingLabel="Loading organizations…"
      error={error}
      actions={
        <>
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
            placeholder="Search orgs"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value }))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
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
              <th className="px-4 py-3 text-left">Organization</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Timezone</th>
              <th className="px-4 py-3 text-left">Users</th>
              <th className="px-4 py-3 text-left">People</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {orgs.map((org) => (
              <tr key={org.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{org.name}</div>
                  <div className="text-xs text-slate-500">
                    {org.emailFromAddress || "Default sender"}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{org.plan}</td>
                <td className="px-4 py-3 text-slate-600">{org.timezone}</td>
                <td className="px-4 py-3 text-slate-600">{org.counts.users}</td>
                <td className="px-4 py-3 text-slate-600">{org.counts.people}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      org.isSuspended
                        ? "bg-rose-50 text-rose-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {org.isSuspended ? "Suspended" : "Active"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => navigate(`/admin/orgs/${org.id}`)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      View
                    </button>
                    {org.isSuspended ? (
                      <button
                        onClick={() => handleReactivate(org.id)}
                        className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSuspend(org.id)}
                        className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Suspend
                      </button>
                    )}
                    {admin?.role === "SUPER_ADMIN" ? (
                      <button
                        onClick={() => handleDelete(org.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {orgs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-sm text-slate-500"
                >
                  No organizations found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
