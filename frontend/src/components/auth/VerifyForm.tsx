import React, { useState } from 'react';
import { api } from '../../api';

type VerifyFormProps = {
  email: string;
  onSuccess: () => void;
  onBackToLogin: () => void;
};

// Auth: verify account via OTP and allow resend.
export default function VerifyForm({ email, onSuccess, onBackToLogin }: VerifyFormProps) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await api.call('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      setMessage('Account verified. You can sign in.');
      onSuccess();
    } catch (err: any) {
      setError(`Verification failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    try {
      await api.call('/auth/verify/send', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage('Verification code sent.');
    } catch (err: any) {
      setError(`Resend failed: ${err.message}`);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-2">Verify your account</h1>
      <p className="text-sm text-gray-600 mb-6">We sent a code to {email}.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Verification code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="123456"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
        <button
          onClick={handleVerify}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>
        <button
          onClick={handleResend}
          className="w-full text-sm text-blue-600 hover:underline"
        >
          Resend code
        </button>
      </div>
      <p className="mt-4 text-center text-sm">
        <button onClick={onBackToLogin} className="text-blue-600 hover:underline">
          Back to login
        </button>
      </p>
    </div>
  );
}
