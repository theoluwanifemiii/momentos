import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../api";

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
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Admin Invite
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mt-2">
            Complete Admin Signup
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Use the invite link sent to your email to unlock signup.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="dev@usemomentos.xyz"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          {tokenFromLink ? null : (
            <div>
              <label className="text-sm font-medium text-slate-700">
                Invite Token
              </label>
              <input
                type="password"
                required
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="Invite token"
              />
            </div>
          )}
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create admin"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/login")}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Back to login
          </button>
        </form>
      </div>
    </main>
  );
}
