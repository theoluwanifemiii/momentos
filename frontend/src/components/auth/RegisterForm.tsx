import { useState } from 'react';
import { api } from '../../api';
import { Button, Input, Select } from '../ui';
import AuthContainer from './AuthContainer';

type RegisterFormProps = {
  onSwitchToLogin: () => void;
  onMagicLinkSent: (email: string) => void;
};

type AccountType = 'INDIVIDUAL' | 'ORGANIZATION';

// Auth: request passwordless signup magic link.
export default function RegisterForm({ onSwitchToLogin, onMagicLinkSent }: RegisterFormProps) {
  const [accountType, setAccountType] = useState<AccountType>('INDIVIDUAL');
  const [email, setEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const filledFieldClass = 'bg-slate-50 border-slate-200 focus:bg-white';

  const handleSubmit = async () => {
    if (accountType === 'ORGANIZATION' && (!organizationName || organizationName.trim() === '')) {
      setError('Organization or group name is required');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const data = await api.call('/auth/magic/request', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'REGISTER',
          accountType,
          email: normalizedEmail,
          organizationName: organizationName.trim() || undefined,
          timezone,
        }),
      });
      onMagicLinkSent(normalizedEmail);
      setMessage(data?.message || 'Check your email for a sign-up link to complete registration.');
    } catch (err: any) {
      setError(`Registration failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      title="Create your account"
      subtitle={
        accountType === 'ORGANIZATION'
          ? 'Set up your organization workspace and start automating celebrations.'
          : 'Set up your personal workspace and start automating celebrations.'
      }
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
        <label className="ds-label">Account Type</label>
        <Select
          value={accountType}
          onChange={(e) => {
            setAccountType(e.target.value as AccountType);
            setError('');
          }}
          className={filledFieldClass}
        >
          <option value="INDIVIDUAL">Individual</option>
          <option value="ORGANIZATION">Organization</option>
        </Select>
      </div>
      <div>
        <label className="ds-label">
          {accountType === 'ORGANIZATION' ? 'Organization or Group Name' : 'Workspace Name (Optional)'}
        </label>
        <Input
          type="text"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          className={filledFieldClass}
          placeholder={
            accountType === 'ORGANIZATION'
              ? 'Your team, church, or company'
              : "e.g. Ada's Workspace"
          }
          required={accountType === 'ORGANIZATION'}
        />
      </div>
      <div>
        <label className="ds-label">Email</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={filledFieldClass}
          placeholder="admin@example.com"
        />
      </div>
      <div>
        <label className="ds-label">Timezone</label>
        <Select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className={filledFieldClass}
        >
          <option value="UTC">UTC</option>
          <option value="Africa/Lagos">Lagos (WAT)</option>
          <option value="America/New_York">New York (EST)</option>
          <option value="America/Los_Angeles">Los Angeles (PST)</option>
          <option value="Europe/London">London (GMT)</option>
        </Select>
      </div>
      {error && <p className="ds-alert ds-alert-error">{error}</p>}
      {message && <p className="ds-alert ds-alert-success">{message}</p>}
      <Button onClick={handleSubmit} loading={loading} fullWidth>
        {loading ? 'Sending link...' : 'Send Sign-Up Link'}
      </Button>
    </AuthContainer>
  );
}
