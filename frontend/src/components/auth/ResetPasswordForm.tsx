import { useMemo, useState } from 'react';
import { api } from '../../api';
import { Button, Input } from '../ui';
import AuthContainer from './AuthContainer';

type ResetPasswordFormProps = {
  onSuccess: () => void;
  onBackToLogin: () => void;
};

// Auth: reset password using magic link token and new password.
export default function ResetPasswordForm({ onSuccess, onBackToLogin }: ResetPasswordFormProps) {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get('token')?.trim() || '',
    [],
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!token) {
      setError('Reset link is missing or invalid. Request a new reset link.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);
    try {
      await api.call('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setMessage('Password updated. You can sign in.');
      onSuccess();
    } catch (err: any) {
      setError(`Password reset failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      title="Set a new password"
      subtitle="Use the secure link from your email to set a new password."
      footer={(
        <button type="button" onClick={onBackToLogin} className="ds-link">
          Back to login
        </button>
      )}
    >
      {!token ? (
        <p className="ds-alert ds-alert-info">
          This reset link is invalid or missing. Request a new one from Forgot Password.
        </p>
      ) : null}
      <div>
        <label className="ds-label">New password</label>
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
      {message && <p className="ds-alert ds-alert-success">{message}</p>}
      <Button onClick={handleSubmit} loading={loading} disabled={!token} fullWidth>
        Update password
      </Button>
    </AuthContainer>
  );
}
