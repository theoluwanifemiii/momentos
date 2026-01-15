import React, { useState } from 'react';
import { api } from '../../api';

type ResetPasswordFormProps = {
  email: string;
  onSuccess: () => void;
  onBackToLogin: () => void;
};

// Auth: reset password using OTP and new password.
export default function ResetPasswordForm({ email, onSuccess, onBackToLogin }: ResetPasswordFormProps) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
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
      await api.call('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ email, code, password }),
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
    <div className="bg-white p-8 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-2">Set a new password</h1>
      <p className="text-sm text-gray-600 mb-6">For {email}</p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Reset code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="123456"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update password'}
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
