import { useState } from 'react';
import { api } from '../../api';
import { Button, Input, Select } from '../ui';
import AuthContainer from './AuthContainer';

type RegisterFormProps = {
  onSuccess: (data: any, email: string) => void;
  onSwitchToLogin: () => void;
};

// Auth: register org + admin, then route to verification if required.
export default function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const normalizedEmail = email.trim().toLowerCase();
      const data = await api.call('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          organizationName,
          timezone,
        }),
      });
      onSuccess(data, normalizedEmail);
    } catch (err: any) {
      setError(`Registration failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      title="Create your account"
      subtitle="Set up your organization and start automating celebrations."
      footer={(
        <p className="text-slate-600">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="ds-link">
            Sign in
          </button>
        </p>
      )}
    >
      <div>
        <label className="ds-label">Organization Name</label>
        <Input
          type="text"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          placeholder="Your church or company"
          required
        />
      </div>
      <div>
        <label className="ds-label">Email</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
        />
      </div>
      <div>
        <label className="ds-label">Password (min 8 characters)</label>
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
      <div>
        <label className="ds-label">Timezone</label>
        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="UTC">UTC</option>
          <option value="Africa/Lagos">Lagos (WAT)</option>
          <option value="America/New_York">New York (EST)</option>
          <option value="America/Los_Angeles">Los Angeles (PST)</option>
          <option value="Europe/London">London (GMT)</option>
        </Select>
      </div>
      {error && <p className="ds-alert ds-alert-error">{error}</p>}
      <Button onClick={handleSubmit} disabled={loading} fullWidth>
        {loading ? 'Creating account...' : 'Create Account'}
      </Button>
    </AuthContainer>
  );
}
