import { useState } from 'react';
import { api } from '../../api';
import { Button, Input } from '../ui';
import AuthContainer from './AuthContainer';

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const data = await api.call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      onSuccess(data);
    } catch (err: any) {
      if (err?.data?.requiresVerification) {
        onRequireVerification(email.trim().toLowerCase());
        return;
      }
      setError(`Sign in failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      title="Welcome back to MomentOS"
      subtitle="Sign in to manage automated celebrations."
      footer={(
        <div className="space-y-2 text-slate-600">
          <p>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={onSwitchToRegister} className="ds-link">
              Register
            </button>
          </p>
          <p>
            <button type="button" onClick={onForgotPassword} className="ds-link">
              Forgot password?
            </button>
          </p>
        </div>
      )}
    >
      <div>
        <label className="ds-label">Email</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label className="ds-label">Password</label>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-20"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-700"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {error && <p className="ds-alert ds-alert-error">{error}</p>}
      <Button onClick={handleSubmit} disabled={loading} fullWidth>
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
    </AuthContainer>
  );
}
