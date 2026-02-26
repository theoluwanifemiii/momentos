import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../api";
import AuthContainer from "../auth/AuthContainer";
import { Button, Input } from "../ui";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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

  return (
    <main className="ds-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.15),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_60%_85%,rgba(6,182,212,0.12),transparent_26%)]" />
      <div className="relative w-full max-w-md">
        <AuthContainer
          title="MomentOS Admin"
          subtitle="Sign in with your @usemomentos.xyz account."
          footer={
            <button type="button" className="ds-link" onClick={() => navigate("/admin/register")}>
              Create admin account
            </button>
          }
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
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
            <Button type="submit" disabled={loading} fullWidth>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </AuthContainer>
      </div>
    </main>
  );
}
