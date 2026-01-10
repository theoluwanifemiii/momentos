import React, { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3001/api';

const api = {
  async call(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };
    
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  },
};

export default function MomentOSApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<'login' | 'register' | 'dashboard'>('login');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
      setView('dashboard');
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
    setView('login');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {view === 'login' ? (
            <LoginForm 
              onSuccess={(data) => {
                localStorage.setItem('token', data.token);
                setUser(data.user);
                setIsAuthenticated(true);
                setView('dashboard');
              }}
              onSwitchToRegister={() => setView('register')}
            />
          ) : (
            <RegisterForm 
              onSuccess={(data) => {
                localStorage.setItem('token', data.token);
                setUser(data.user);
                setIsAuthenticated(true);
                setView('dashboard');
              }}
              onSwitchToLogin={() => setView('login')}
            />
          )}
        </div>
      </div>
    );
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

function LoginForm({ onSuccess, onSwitchToRegister }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const data = await api.call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">Welcome to MomentOS</h1>
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
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
      <p className="mt-4 text-center text-sm">
        Don't have an account?{' '}
        <button onClick={onSwitchToRegister} className="text-blue-600 hover:underline">
          Register
        </button>
      </p>
    </div>
  );
}

function RegisterForm({ onSuccess, onSwitchToLogin }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
      onSuccess(data);
    } catch (err: any) {
      setError(err.message);
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

function Dashboard({ user, onLogout }: any) {
  const [activeTab, setActiveTab] = useState<'upload' | 'people' | 'upcoming'>('upload');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">MomentOS</h1>
          <button
            onClick={onLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex space-x-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2 px-4 ${
              activeTab === 'upload'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upload People
          </button>
          <button
            onClick={() => setActiveTab('people')}
            className={`pb-2 px-4 ${
              activeTab === 'people'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All People
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`pb-2 px-4 ${
              activeTab === 'upcoming'
                ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upcoming Birthdays
          </button>
        </div>

        {activeTab === 'upload' && <CSVUpload />}
        {activeTab === 'people' && <PeopleList />}
        {activeTab === 'upcoming' && <UpcomingBirthdays />}
      </div>
    </div>
  );
}

function CSVUpload() {
  const [csvContent, setCsvContent] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!csvContent) return;

    setLoading(true);
    setResult(null);

    try {
      const data = await api.call('/people/upload', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
      });
      setResult(data);
      setCsvContent('');
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const downloadSample = () => {
    window.open(`${API_URL}/people/sample-csv`, '_blank');
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Upload People</h2>
      
      <div className="mb-4">
        <button
          onClick={downloadSample}
          className="text-sm text-blue-600 hover:underline"
        >
          📥 Download sample CSV
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Select CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded file:border-0
              file:text-sm file:font-medium
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
        </div>

        {csvContent && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Preview</label>
              <textarea
                value={csvContent.slice(0, 500) + (csvContent.length > 500 ? '...' : '')}
                readOnly
                className="w-full h-32 px-3 py-2 border rounded bg-gray-50 text-sm font-mono"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Uploading...' : 'Upload & Validate'}
            </button>
          </>
        )}

        {result && (
          <div className={`p-4 rounded ${result.error ? 'bg-red-50' : 'bg-green-50'}`}>
            {result.error ? (
              <p className="text-red-800 font-medium">{result.error}</p>
            ) : (
              <div>
                <p className="text-green-800 font-medium mb-2">Upload Summary</p>
                <ul className="text-sm space-y-1">
                  <li>✅ Valid rows: {result.summary.validRows}</li>
                  <li>❌ Error rows: {result.summary.errorRows}</li>
                  <li>📊 Total processed: {result.summary.totalRows}</li>
                </ul>
                {result.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="font-medium text-sm mb-2">Errors:</p>
                    <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                      {result.errors.map((err: any, i: number) => (
                        <li key={i} className="text-red-700">
                          Row {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PeopleList() {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    try {
      const data = await api.call('/people');
      setPeople(data.people);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (people.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <p className="text-gray-600">No people added yet. Upload a CSV to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Birthday</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {people.map((person) => (
            <tr key={person.id}>
              <td className="px-6 py-4 whitespace-nowrap">{person.fullName}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{person.email}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {new Date(person.birthday).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {person.department || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingBirthdays() {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUpcoming();
  }, []);

  const loadUpcoming = async () => {
    try {
      const data = await api.call('/people/upcoming');
      setUpcoming(data.upcoming);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (upcoming.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <p className="text-gray-600">No upcoming birthdays in the next 30 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {upcoming.map((person) => (
        <div key={person.id} className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-medium">{person.fullName}</h3>
              <p className="text-sm text-gray-600">{person.email}</p>
              {person.department && (
                <p className="text-sm text-gray-500 mt-1">{person.department}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">
                {new Date(person.birthday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}