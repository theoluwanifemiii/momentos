import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { adminApi } from "../../api";

type AdminInfo = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "SUPPORT";
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadAdmin = async () => {
      setLoading(true);
      try {
        const data = await adminApi.call("/auth/me");
        setAdmin(data.admin);
      } catch (err: any) {
        navigate("/admin/login", { replace: true });
      } finally {
        setLoading(false);
      }
    };
    loadAdmin();
  }, [navigate]);

  useEffect(() => {
    return adminApi.subscribe((count) => setBusy(count > 0));
  }, []);

  const handleLogout = async () => {
    setError("");
    try {
      await adminApi.call("/auth/logout", { method: "POST" });
      navigate("/admin/login", { replace: true });
    } catch (err: any) {
      setError(err.message || "Logout failed");
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-8">Loading admin…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {busy ? (
        <div className="fixed inset-x-0 top-0 z-50 h-1 bg-slate-900/80 animate-pulse" />
      ) : null}
      <aside className="w-72 border-r border-slate-200 bg-white px-6 py-6">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            MomentOS
          </div>
          <div className="text-lg font-semibold text-slate-900 mt-2">
            Internal Admin
          </div>
          {admin ? (
            <div className="mt-3 text-xs text-slate-500">
              {admin.email} · {admin.role}
            </div>
          ) : null}
        </div>
        <nav className="space-y-2 text-sm font-medium text-slate-600">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${
                isActive ? "bg-slate-900 text-white" : "hover:text-slate-900"
              }`
            }
          >
            Overview
          </NavLink>
          <NavLink
            to="/admin/orgs"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${
                isActive ? "bg-slate-900 text-white" : "hover:text-slate-900"
              }`
            }
          >
            Organizations
          </NavLink>
          <NavLink
            to="/admin/staff"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${
                isActive ? "bg-slate-900 text-white" : "hover:text-slate-900"
              }`
            }
          >
            Staff
          </NavLink>
          <NavLink
            to="/admin/people"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${
                isActive ? "bg-slate-900 text-white" : "hover:text-slate-900"
              }`
            }
          >
            People
          </NavLink>
          <NavLink
            to="/admin/templates"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${
                isActive ? "bg-slate-900 text-white" : "hover:text-slate-900"
              }`
            }
          >
            Templates
          </NavLink>
          <NavLink
            to="/admin/delivery-logs"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${
                isActive ? "bg-slate-900 text-white" : "hover:text-slate-900"
              }`
            }
          >
            Delivery Logs
          </NavLink>
          <NavLink
            to="/admin/audit-logs"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${
                isActive ? "bg-slate-900 text-white" : "hover:text-slate-900"
              }`
            }
          >
            Audit Logs
          </NavLink>
        </nav>
        <div className="mt-8">
          {error ? (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          ) : null}
          <button
            onClick={handleLogout}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet context={{ admin }} />
      </main>
    </div>
  );
}
