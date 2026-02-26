import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { adminApi } from "../../../api";
import { Button, Card, CardBody, cn } from "../../ui";
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
    setError("");
    try {
      await adminApi.call(`/orgs/${id}/users/${userId}/${enabled ? "enable" : "disable"}`, {
        method: "PATCH",
      });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to update user status");
    }
  };

  const verifyUser = async (userId: string) => {
    if (!id) return;
    setError("");
    try {
      await adminApi.call(`/orgs/${id}/users/${userId}/verify`, { method: "PATCH" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to verify user");
    }
  };

  return (
    <AdminPage
      title={org?.name || "Organization"}
      description={
        org
          ? `${org.emailFromAddress || "Default sender"} · ${org.timezone}`
          : "Organization details and account management."
      }
      loading={loading}
      loadingLabel="Loading org…"
      error={error}
      actions={
        org ? (
          <span
            className={cn(
              "admin-status-pill",
              org.isSuspended ? "admin-status-pill-danger" : "admin-status-pill-success",
            )}
          >
            {org.isSuspended ? "Suspended" : "Active"}
          </span>
        ) : null
      }
    >
      <Button onClick={() => navigate("/admin/orgs")} variant="ghost" size="sm" className="px-0">
        ← Back to organizations
      </Button>

      {org ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Plan", value: org.plan },
              { label: "Users", value: org.counts.users },
              { label: "People", value: org.counts.people },
              { label: "Templates", value: org.counts.templates },
              { label: "Created", value: new Date(org.createdAt).toLocaleDateString() },
              { label: "Updated", value: new Date(org.updatedAt).toLocaleDateString() },
            ].map((item) => (
              <Card key={item.label}>
                <CardBody className="space-y-2 p-5">
                  <div className="text-xs uppercase tracking-wider text-slate-400">{item.label}</div>
                  <div className="text-lg font-semibold text-slate-900">{item.value}</div>
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="admin-panel overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Users</h2>
            </div>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="ds-th">Email</th>
                    <th className="ds-th">Role</th>
                    <th className="ds-th">Verified</th>
                    <th className="ds-th">Last Login</th>
                    <th className="ds-th">Status</th>
                    <th className="ds-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((user) => (
                    <tr key={user.id} className="admin-table-row">
                      <td className="ds-td">{user.email}</td>
                      <td className="ds-td">{user.role}</td>
                      <td className="ds-td">{user.emailVerifiedAt ? "Yes" : "No"}</td>
                      <td className="ds-td">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="ds-td">
                        <span
                          className={cn(
                            "admin-status-pill",
                            user.isDisabled ? "admin-status-pill-danger" : "admin-status-pill-success",
                          )}
                        >
                          {user.isDisabled ? "Disabled" : "Active"}
                        </span>
                      </td>
                      <td className="ds-td">
                        <div className="flex justify-end gap-2">
                          {!user.emailVerifiedAt ? (
                            <Button
                              onClick={() => verifyUser(user.id)}
                              size="sm"
                              variant="secondary"
                            >
                              Verify
                            </Button>
                          ) : null}
                          <Button
                            onClick={() => toggleUser(user.id, user.isDisabled)}
                            size="sm"
                            variant="secondary"
                          >
                            {user.isDisabled ? "Enable" : "Disable"}
                          </Button>
                          {admin?.role === "SUPER_ADMIN" ? (
                            <Button size="sm" variant="ghost" className="text-slate-400" disabled>
                              Force Reset
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="ds-td py-10 text-center text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <Card>
          <CardBody className="p-5 text-sm text-slate-500">Organization not found.</CardBody>
        </Card>
      )}
    </AdminPage>
  );
}
