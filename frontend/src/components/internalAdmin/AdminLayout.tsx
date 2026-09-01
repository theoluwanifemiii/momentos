import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { adminApi } from "../../api";
import { Button, cn, LogoMark } from "../ui";

type AdminInfo = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "SUPPORT";
};

function useSessionExpiryWarning(sessionExpiresAt: string | null) {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const expiresMs = new Date(sessionExpiresAt).getTime();

    const update = () => {
      const remaining = expiresMs - Date.now();
      if (remaining <= 0) {
        setWarning("Your session has expired. Please sign in again.");
      } else if (remaining < 60 * 60 * 1000) {
        const mins = Math.ceil(remaining / 60_000);
        setWarning(`Your session expires in ${mins} minute${mins === 1 ? "" : "s"}.`);
      } else if (remaining < 24 * 60 * 60 * 1000) {
        const hrs = Math.ceil(remaining / 3_600_000);
        setWarning(`Your session expires in ${hrs} hour${hrs === 1 ? "" : "s"}.`);
      } else {
        setWarning(null);
      }
    };

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [sessionExpiresAt]);

  return warning;
}

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
  { to: "/admin/docs", label: "Dev Docs" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const expiryWarning = useSessionExpiryWarning(sessionExpiresAt);

  useEffect(() => {
    const loadAdmin = async () => {
      setLoading(true);
      try {
        const data = await adminApi.call("/auth/me");
        setAdmin(data.admin);
        if (data.sessionExpiresAt) setSessionExpiresAt(data.sessionExpiresAt);
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
          <div className="flex items-center gap-2.5">
            <LogoMark size={22} />
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">MomentOS</div>
          </div>
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
          {expiryWarning ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {expiryWarning}
            </div>
          ) : null}
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
              <div className="flex items-center gap-2.5">
                <LogoMark size={20} />
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">MomentOS</div>
                  <div className="text-sm font-semibold text-slate-900">Internal Admin</div>
                </div>
              </div>
              <Button onClick={handleLogout} variant="secondary" size="sm">
                Sign out
              </Button>
            </div>
            {expiryWarning ? (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {expiryWarning}
              </div>
            ) : null}
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
