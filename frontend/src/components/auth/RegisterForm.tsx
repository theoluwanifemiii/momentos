import { useState } from 'react';
import { api } from '../../api';

type RegisterFormProps = {
  onSuccess: (data: any, email: string) => void;
  onSwitchToLogin: () => void;
};

// Auth: register org + admin, then route to verification if required.
export default function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!organizationName || organizationName.trim() === '') {
      setError('Organization name is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const data = await api.call('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, organizationName, timezone }),
      });
      onSuccess(data, email);
    } catch (err: any) {
      setError(`Registration failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">Create Account</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Organization Name</label>
          <input
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Your Church or Company"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password (min 8 characters)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="UTC">UTC</option>
            <option value="Africa/Lagos">Lagos (WAT)</option>
            <option value="America/New_York">New York (EST)</option>
            <option value="America/Los_Angeles">Los Angeles (PST)</option>
            <option value="Europe/London">London (GMT)</option>
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </div>
      <p className="mt-4 text-center text-sm">
        Already have an account?{' '}
        <button onClick={onSwitchToLogin} className="text-blue-600 hover:underline">
          Sign in
        </button>
      </p>
    </div>
  );
}
