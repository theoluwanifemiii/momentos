import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Button, Input } from '../ui';
import AuthContainer from './AuthContainer';

type VerifyFormProps = {
  email: string;
  onSuccess: () => void;
  onBackToLogin: () => void;
};

// Auth: verify account via magic link and allow resend.
export default function VerifyForm({ email, onSuccess, onBackToLogin }: VerifyFormProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [emailValue, setEmailValue] = useState(email);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setEmailValue(email);
  }, [email]);

  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    setError('');
    setMessage('');
    setVerifying(true);
    api
      .call('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      .then(() => {
        if (!isMounted) return;
        setMessage('Account verified. You can sign in.');
        onSuccess();
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError(`Verification failed: ${err.message}`);
      })
      .finally(() => {
        if (!isMounted) return;
        setVerifying(false);
      });
    return () => {
      isMounted = false;
    };
  }, [token, onSuccess]);

  const handleResend = async () => {
    setError('');
    setMessage('');
    const normalizedEmail = emailValue.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required to resend the link.');
      return;
    }
    setResending(true);
    try {
      await api.call('/auth/verify/send', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setMessage('Verification link sent.');
    } catch (err: any) {
      setError(`Resend failed: ${err.message}`);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthContainer
      title="Verify your account"
      subtitle={
        token
          ? 'We are verifying your link.'
          : `We sent a verification link to ${emailValue || 'your email'}.`
      }
      footer={(
        <button type="button" onClick={onBackToLogin} className="ds-link">
          Back to login
        </button>
      )}
    >
      {(!token || error) && (
        <div>
          <label className="ds-label">Email</label>
          <Input
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      )}
      {error && <p className="ds-alert ds-alert-error">{error}</p>}
      {message && <p className="ds-alert ds-alert-success">{message}</p>}
      {(!token || error) && (
        <Button onClick={handleResend} disabled={resending} fullWidth>
          {resending ? 'Sending...' : 'Resend verification link'}
        </Button>
      )}
      {token && verifying && <p className="text-sm text-slate-500">Verifying your account...</p>}
    </AuthContainer>
  );
}
