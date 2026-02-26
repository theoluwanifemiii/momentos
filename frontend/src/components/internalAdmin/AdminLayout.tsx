import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { adminApi } from "../../api";
import { Button, cn } from "../ui";

type AdminInfo = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "SUPPORT";
};

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

const navItems: NavItem[] = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/orgs", label: "Organizations" },
  { to: "/admin/staff", label: "Staff" },
  { to: "/admin/people", label: "People" },
  { to: "/admin/templates", label: "Templates" },
  { to: "/admin/delivery-logs", label: "Delivery Logs" },
  { to: "/admin/audit-logs", label: "Audit Logs" },
  { to: "/admin/feedback", label: "Feedback" },
];

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
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_csrf_token");
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
      localStorage.removeItem("admin_session_token");
      localStorage.removeItem("admin_csrf_token");
      navigate("/admin/login", { replace: true });
    } catch (err: any) {
      setError(err.message || "Logout failed");
    }
  };

  if (loading) {
    return (
      <div className="ds-page flex min-h-screen items-center justify-center p-8 text-sm text-slate-500">
        Loading admin…
      </div>
    );
  }

  return (
    <div className="ds-page flex min-h-screen">
      {busy ? (
        <div className="fixed inset-x-0 top-0 z-50 h-1 bg-slate-900/80 animate-pulse" />
      ) : null}
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white px-5 py-6 lg:flex lg:flex-col">
        <div className="mb-6 space-y-2">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">MomentOS</div>
          <div className="text-lg font-semibold text-slate-900">Internal Admin</div>
          {admin ? <div className="text-xs text-slate-500">{admin.email} · {admin.role}</div> : null}
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn("admin-nav-link", isActive && "admin-nav-link-active")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 pt-6">
          {error ? <div className="ds-alert ds-alert-error text-xs">{error}</div> : null}
          <Button onClick={handleLogout} variant="secondary" fullWidth>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="w-full px-3 py-4 sm:px-4 lg:px-6 lg:py-5">
          <header className="mb-3 rounded-xl border border-slate-200 bg-white p-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">MomentOS</div>
                <div className="text-sm font-semibold text-slate-900">Internal Admin</div>
              </div>
              <Button onClick={handleLogout} variant="secondary" size="sm">
                Sign out
              </Button>
            </div>
            {error ? <div className="mb-3 ds-alert ds-alert-error text-xs">{error}</div> : null}
            <nav className="ds-tablist">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn("ds-tab", isActive && "ds-tab-active")}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>
          <Outlet context={{ admin }} />
        </div>
      </main>
    </div>
  );
}
