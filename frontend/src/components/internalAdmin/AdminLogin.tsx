import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../api";

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
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Internal Admin
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mt-2">
            MomentOS Admin
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Sign in with your @usemomentos.xyz account.
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/register")}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Create admin account
          </button>
        </form>
      </div>
    </main>
  );
}
