import { useState } from 'react';
import { api } from '../../api';

type ForgotPasswordFormProps = {
  onSuccess: (email: string) => void;
  onBackToLogin: () => void;
};

// Auth: request password reset OTP.
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
      await api.call('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage('If the account exists, a code was sent.');
      onSuccess(email);
    } catch (err: any) {
      setError(`Reset request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">Reset your password</h1>
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
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send reset code'}
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
