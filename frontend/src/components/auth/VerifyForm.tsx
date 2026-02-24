import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';

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
    <div className="bg-white p-8 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-2">Verify your account</h1>
      <p className="text-sm text-gray-600 mb-6">
        {token
          ? 'We are verifying your link.'
          : `We sent a verification link to ${emailValue || 'your email'}.`}
      </p>
      <div className="space-y-4">
        {(!token || error) && (
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
        {(!token || error) && (
          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {resending ? 'Sending...' : 'Resend verification link'}
          </button>
        )}
        {token && verifying && (
          <p className="text-sm text-gray-500">Verifying your account...</p>
        )}
      </div>
      <p className="mt-4 text-center text-sm">
        <button onClick={onBackToLogin} className="text-blue-600 hover:underline">
          Back to login
        </button>
      </p>
    </div>
  );
}
