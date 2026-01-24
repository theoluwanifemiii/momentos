import { useEffect, useRef, useState } from "react";
import { adminApi } from "../../../api";
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
      load();
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
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900 mb-3">
          Send invite
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="staff@usemomentos.xyz"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="SUPPORT">Support</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
          <button
            onClick={sendInvite}
            className="rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Send invite
          </button>
        </div>
        {inviteMessage ? (
          <div className="mt-3 text-xs text-emerald-700">{inviteMessage}</div>
        ) : null}
      </div>
      {!loading ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Last Login</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-4 py-3 text-slate-700">{admin.email}</td>
                  <td className="px-4 py-3 text-slate-600">{admin.role}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {admin.isActive ? "Active" : "Disabled"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {admin.lastLoginAt
                      ? new Date(admin.lastLoginAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {admins.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No admins found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminPage>
  );
}
