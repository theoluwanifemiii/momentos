import { useState } from 'react';
import { api } from '../../api';
import { Button, Input } from '../ui';
import AuthContainer from './AuthContainer';

type ResetPasswordFormProps = {
  email: string;
  onSuccess: () => void;
  onBackToLogin: () => void;
};

// Auth: reset password using OTP and new password.
export default function ResetPasswordForm({ email, onSuccess, onBackToLogin }: ResetPasswordFormProps) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await api.call('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail, code, password }),
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
      subtitle={`For ${email}`}
      footer={(
        <button type="button" onClick={onBackToLogin} className="ds-link">
          Back to login
        </button>
      )}
    >
      <div>
        <label className="ds-label">Reset code</label>
        <Input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
      </div>
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
      <Button onClick={handleSubmit} disabled={loading} fullWidth>
        {loading ? 'Updating...' : 'Update password'}
      </Button>
    </AuthContainer>
  );
}
