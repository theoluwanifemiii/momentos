import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Button, Input } from '../ui';
import AuthContainer from './AuthContainer';

type LoginFormProps = {
  onSuccess: (data: any) => void;
  onSwitchToRegister: () => void;
  defaultEmail?: string;
};

// Auth: request and verify magic links for passwordless sign-in.
export default function LoginForm({
  onSuccess,
  onSwitchToRegister,
  defaultEmail = '',
}: LoginFormProps) {
  const [searchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get('token')?.trim() || '';
  const tokenFromHash = useMemo(() => {
    const hash = window.location.hash.replace(/^#/, '');
    return new URLSearchParams(hash).get('token')?.trim() || '';
  }, []);
  const token = tokenFromQuery || tokenFromHash;
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingLink, setVerifyingLink] = useState(false);

  useEffect(() => {
    setEmail(defaultEmail);
  }, [defaultEmail]);

  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    setError('');
    setMessage('');
    setVerifyingLink(true);
    api
      .call('/auth/magic/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      .then((data) => {
        if (!isMounted) return;
        onSuccess(data);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError(`Magic link sign-in failed: ${err.message}`);
      })
      .finally(() => {
        if (!isMounted) return;
        setVerifyingLink(false);
      });
    return () => {
      isMounted = false;
    };
  }, [token, onSuccess]);

  const handleSubmit = async () => {
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      await api.call('/auth/magic/request', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail, mode: 'LOGIN' }),
      });
      setMessage('If the account exists, a sign-in link has been sent to your email.');
    } catch (err: any) {
      setError(`Sign-in link request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      title="Welcome back to MomentOS"
      subtitle={
        token
          ? 'Verifying your magic link.'
          : 'Enter your email and we will send you a one-time sign-in link.'
      }
      footer={(
        <div className="text-slate-600">
          <p>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={onSwitchToRegister} className="ds-link">
              Register
            </button>
          </p>
        </div>
      )}
    >
      {!token ? (
        <div>
          <label className="ds-label">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      ) : null}
      {error && <p className="ds-alert ds-alert-error">{error}</p>}
      {message && <p className="ds-alert ds-alert-success">{message}</p>}
      {token ? (
        <p className="text-sm text-slate-500">Verifying your magic link...</p>
      ) : (
        <Button onClick={handleSubmit} disabled={loading || verifyingLink} fullWidth>
          {verifyingLink ? 'Verifying link...' : loading ? 'Sending link...' : 'Send Sign-In Link'}
        </Button>
      )}
    </AuthContainer>
  );
}
