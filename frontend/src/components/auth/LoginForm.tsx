import { useState } from 'react';
import { api } from '../../api';

type LoginFormProps = {
  onSuccess: (data: any) => void;
  onRequireVerification: (email: string) => void;
  onSwitchToRegister: () => void;
  onForgotPassword: () => void;
};

// Auth: sign in with backend, handle verification-required responses.
export default function LoginForm({
  onSuccess,
  onRequireVerification,
  onSwitchToRegister,
  onForgotPassword,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const data = await api.call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onSuccess(data);
    } catch (err: any) {
      if (err?.data?.requiresVerification) {
        onRequireVerification(email);
        return;
      }
      setError(`Sign in failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">Welcome to MomentOS</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
      <p className="mt-4 text-center text-sm">
        Don't have an account?{' '}
        <button onClick={onSwitchToRegister} className="text-blue-600 hover:underline">
          Register
        </button>
      </p>
      <p className="mt-2 text-center text-sm">
        <button onClick={onForgotPassword} className="text-blue-600 hover:underline">
          Forgot password?
        </button>
      </p>
    </div>
  );
}
