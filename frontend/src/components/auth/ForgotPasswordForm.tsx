import { useState } from 'react';
import { api } from '../../api';
import { Button, Input } from '../ui';
import AuthContainer from './AuthContainer';

type ForgotPasswordFormProps = {
  onSuccess?: () => void;
  onBackToLogin: () => void;
};

// Auth: request password reset magic link.
export default function ForgotPasswordForm({ onSuccess, onBackToLogin }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await api.call('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setMessage('If the account exists, a reset link was sent to your email.');
      onSuccess?.();
    } catch (err: any) {
      setError(`Reset request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      title="Reset your password"
      subtitle="Enter your account email to receive a secure reset link."
      footer={(
        <button type="button" onClick={onBackToLogin} className="ds-link">
          Back to login
        </button>
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
      {error && <p className="ds-alert ds-alert-error">{error}</p>}
      {message && <p className="ds-alert ds-alert-success">{message}</p>}
      <Button onClick={handleSubmit} disabled={loading} fullWidth>
        {loading ? 'Sending...' : 'Send reset link'}
      </Button>
    </AuthContainer>
  );
}
