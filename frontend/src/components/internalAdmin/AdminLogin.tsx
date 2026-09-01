import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminApi } from "../../api";
import AuthContainer from "../auth/AuthContainer";
import { Button, Input } from "../ui";

type View = "login" | "forgot" | "reset";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");

  const [view, setView] = useState<View>(resetToken ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await adminApi.call("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data?.sessionToken) {
        localStorage.setItem("admin_session_token", data.sessionToken);
      }
      if (data?.csrfToken) {
        localStorage.setItem("admin_csrf_token", data.csrfToken);
      }
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminApi.call("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage("If that admin account exists, a reset link was sent.");
    } catch (err: any) {
      setError(err.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await adminApi.call("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      setMessage("Password updated. You can now sign in.");
      setView("login");
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (view === "forgot") {
    return (
      <main className="ds-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.15),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_60%_85%,rgba(6,182,212,0.12),transparent_26%)]" />
        <div className="relative w-full max-w-md">
          <AuthContainer
            title="Reset Admin Password"
            subtitle="Enter your admin email to receive a reset link."
            footer={
              <button type="button" className="ds-link" onClick={() => { setView("login"); setError(""); setMessage(""); }}>
                Back to sign in
              </button>
            }
          >
            {message ? (
              <p className="ds-alert ds-alert-success text-sm">{message}</p>
            ) : (
              <form className="space-y-4" onSubmit={handleForgot}>
                <div>
                  <label className="ds-label">Email</label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dev@usemomentos.xyz"
                  />
                </div>
                {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
                <Button type="submit" loading={loading} fullWidth>
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
              </form>
            )}
          </AuthContainer>
        </div>
      </main>
    );
  }

  if (view === "reset") {
    return (
      <main className="ds-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.15),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_60%_85%,rgba(6,182,212,0.12),transparent_26%)]" />
        <div className="relative w-full max-w-md">
          <AuthContainer
            title="Set New Password"
            subtitle="Choose a new password for your admin account."
            footer={
              <button type="button" className="ds-link" onClick={() => { setView("login"); setError(""); setMessage(""); }}>
                Back to sign in
              </button>
            }
          >
            {message ? (
              <p className="ds-alert ds-alert-success text-sm">{message}</p>
            ) : (
              <form className="space-y-4" onSubmit={handleReset}>
                <div>
                  <label className="ds-label">New password</label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                  />
                </div>
                {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
                <Button type="submit" loading={loading} fullWidth>
                  {loading ? "Updating..." : "Set new password"}
                </Button>
              </form>
            )}
          </AuthContainer>
        </div>
      </main>
    );
  }

  return (
    <main className="ds-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.15),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_60%_85%,rgba(6,182,212,0.12),transparent_26%)]" />
      <div className="relative w-full max-w-md">
        <AuthContainer
          title="MomentOS Admin"
          subtitle="Sign in with your @usemomentos.xyz account."
          footer={
            <div className="flex justify-between w-full">
              <button type="button" className="ds-link" onClick={() => navigate("/admin/register")}>
                Create admin account
              </button>
              <button type="button" className="ds-link" onClick={() => { setView("forgot"); setError(""); setMessage(""); }}>
                Forgot password?
              </button>
            </div>
          }
        >
          {message ? <p className="ds-alert ds-alert-success text-sm">{message}</p> : null}
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="ds-label">Email</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="dev@usemomentos.xyz"
              />
            </div>
            <div>
              <label className="ds-label">Password</label>
              <Input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
            <Button type="submit" loading={loading} fullWidth>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </AuthContainer>
      </div>
    </main>
  );
}
