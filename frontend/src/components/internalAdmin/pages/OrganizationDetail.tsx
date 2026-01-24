import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { adminApi } from "../../../api";
import AdminPage from "../ui/AdminPage";

type AdminContext = {
  admin: { role: "SUPER_ADMIN" | "SUPPORT" } | null;
};

type OrgDetail = {
  id: string;
  name: string;
  plan: string;
  timezone: string;
  emailFromName: string | null;
  emailFromAddress: string | null;
  isSuspended: boolean;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts: { users: number; people: number; templates: number };
};

type OrgUser = {
  id: string;
  email: string;
  role: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  isDisabled: boolean;
  createdAt: string;
};

export default function OrganizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin } = useOutletContext<AdminContext>();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [orgData, userData] = await Promise.all([
        adminApi.call(`/orgs/${id}`),
        adminApi.call(`/orgs/${id}/users`),
      ]);
      setOrg(orgData.organization);
      setUsers(userData.users || []);
    } catch (err: any) {
      setError(err.message || "Failed to load organization");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const toggleUser = async (userId: string, enabled: boolean) => {
    if (!id) return;
    await adminApi.call(`/orgs/${id}/users/${userId}/${enabled ? "enable" : "disable"}`, {
      method: "PATCH",
    });
    load();
  };

  const verifyUser = async (userId: string) => {
    if (!id) return;
    await adminApi.call(`/orgs/${id}/users/${userId}/verify`, { method: "PATCH" });
    load();
  };

  if (!org) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-slate-500">Organization not found.</div>
        <button
          onClick={() => navigate("/admin/orgs")}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <AdminPage
      title={org.name}
      description={`${org.emailFromAddress || "Default sender"} · ${org.timezone}`}
      loading={loading}
      loadingLabel="Loading org…"
      error={error}
      actions={
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            org.isSuspended
              ? "bg-rose-50 text-rose-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {org.isSuspended ? "Suspended" : "Active"}
        </span>
      }
    >
      <button
        onClick={() => navigate("/admin/orgs")}
        className="text-xs uppercase tracking-wider text-slate-400"
      >
        ← Back to organizations
      </button>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Plan", value: org.plan },
          { label: "Users", value: org.counts.users },
          { label: "People", value: org.counts.people },
          { label: "Templates", value: org.counts.templates },
          { label: "Created", value: new Date(org.createdAt).toLocaleDateString() },
          { label: "Updated", value: new Date(org.updatedAt).toLocaleDateString() },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400">{item.label}</div>
            <div className="text-lg font-semibold text-slate-900 mt-2">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Users</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Verified</th>
              <th className="px-4 py-3 text-left">Last Login</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 text-slate-700">{user.email}</td>
                <td className="px-4 py-3 text-slate-600">{user.role}</td>
                <td className="px-4 py-3 text-slate-600">
                  {user.emailVerifiedAt ? "Yes" : "No"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {user.isDisabled ? (
                    <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                      Disabled
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {!user.emailVerifiedAt ? (
                      <button
                        onClick={() => verifyUser(user.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Verify
                      </button>
                    ) : null}
                    <button
                      onClick={() => toggleUser(user.id, user.isDisabled)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {user.isDisabled ? "Enable" : "Disable"}
                    </button>
                    {admin?.role === "SUPER_ADMIN" ? (
                      <button className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-400">
                        Force Reset
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  No users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
