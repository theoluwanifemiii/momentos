import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../api";
import AuthContainer from "../auth/AuthContainer";
import { Button, Input } from "../ui";

export default function AdminRegister() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [tokenFromLink, setTokenFromLink] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    const emailParam = params.get("email");

    if (emailParam && !email) {
      setEmail(emailParam);
    }

    if (tokenParam && !token) {
      setToken(tokenParam);
      setTokenFromLink(true);
    }
  }, [email, token]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminApi.call("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, token }),
      });
      navigate("/admin/login", { replace: true });
    } catch (err: any) {
      setError(err.message || "Bootstrap failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="ds-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.15),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_60%_85%,rgba(6,182,212,0.12),transparent_26%)]" />
      <div className="relative w-full max-w-md">
        <AuthContainer
          title="Complete Admin Signup"
          subtitle="Use the invite link sent to your email to unlock signup."
          footer={
            <button type="button" className="ds-link" onClick={() => navigate("/admin/login")}>
              Back to login
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
            {tokenFromLink ? null : (
              <div>
                <label className="ds-label">Invite Token</label>
                <Input
                  type="password"
                  required
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Invite token"
                />
              </div>
            )}
            {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
            <Button type="submit" disabled={loading} fullWidth>
              {loading ? "Creating..." : "Create admin"}
            </Button>
          </form>
        </AuthContainer>
      </div>
    </main>
  );
}
