import { useEffect, useRef, useState } from "react";
import { adminApi } from "../../../api";
import { Button, Card, CardBody, Input, Select, cn } from "../../ui";
import AdminPage from "../ui/AdminPage";

type AdminRow = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export default function AdminStaff() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("SUPPORT");
  const [inviteMessage, setInviteMessage] = useState("");
  const loadedRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminApi.call("/admins");
      setAdmins(data.admins || []);
    } catch (err: any) {
      setError(err.message || "Failed to load admins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    load();
  }, []);

  const sendInvite = async () => {
    setInviteMessage("");
    setError("");
    try {
      await adminApi.call("/invites", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteMessage("Invite sent.");
      setInviteEmail("");
      await load();
    } catch (err: any) {
      setError(err.message || "Invite failed");
    }
  };

  return (
    <AdminPage
      title="Admin Staff"
      description="Invite staff and review admin access."
      loading={loading}
      loadingLabel="Loading admins…"
      error={error}
    >
      <Card>
        <CardBody className="space-y-4 p-5">
          <div className="text-sm font-semibold text-slate-900">Send invite</div>
          <div className="admin-toolbar">
            <Input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="staff@usemomentos.xyz"
              className="min-w-[240px]"
            />
            <Select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
              className="min-w-[170px]"
            >
              <option value="SUPPORT">Support</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </Select>
            <Button onClick={sendInvite}>Send invite</Button>
          </div>
          {inviteMessage ? <div className="ds-alert ds-alert-success">{inviteMessage}</div> : null}
        </CardBody>
      </Card>

      <div className="admin-panel overflow-hidden">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead className="bg-slate-50">
              <tr>
                <th className="ds-th">Email</th>
                <th className="ds-th">Role</th>
                <th className="ds-th">Status</th>
                <th className="ds-th">Last Login</th>
                <th className="ds-th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {admins.map((admin) => (
                <tr key={admin.id} className="admin-table-row">
                  <td className="ds-td font-medium text-slate-700">{admin.email}</td>
                  <td className="ds-td">{admin.role}</td>
                  <td className="ds-td">
                    <span
                      className={cn(
                        "admin-status-pill",
                        admin.isActive ? "admin-status-pill-success" : "admin-status-pill-danger",
                      )}
                    >
                      {admin.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="ds-td">
                    {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="ds-td">{new Date(admin.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ds-td py-10 text-center text-slate-500">
                    No admins found.
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
