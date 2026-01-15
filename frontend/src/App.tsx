import { useEffect, useState } from 'react';
import { api } from './api';
import Dashboard from './components/Dashboard.tsx';
import LoginForm from './components/auth/LoginForm.tsx';
import RegisterForm from './components/auth/RegisterForm.tsx';
import VerifyForm from './components/auth/VerifyForm.tsx';
import ForgotPasswordForm from './components/auth/ForgotPasswordForm.tsx';
import ResetPasswordForm from './components/auth/ResetPasswordForm.tsx';

type View = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'dashboard';

// App shell: auth flow switcher and dashboard entry point.
export default function MomentOSApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<View>('login');
  const [user, setUser] = useState<any>(null);
  const [pendingEmail, setPendingEmail] = useState('');

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
          {view === 'login' && (
            <LoginForm
              onSuccess={(data) => {
                localStorage.setItem('token', data.token);
                setUser(data.user);
                setIsAuthenticated(true);
                setView('dashboard');
              }}
              onRequireVerification={(email: string) => {
                setPendingEmail(email);
                setView('verify');
              }}
              onSwitchToRegister={() => setView('register')}
              onForgotPassword={() => setView('forgot')}
            />
          )}
          {view === 'register' && (
            <RegisterForm
              onSuccess={(data, email: string) => {
                if (data.requiresVerification) {
                  setPendingEmail(email);
                  setView('verify');
                  return;
                }
                localStorage.setItem('token', data.token);
                setUser(data.user);
                setIsAuthenticated(true);
                setView('dashboard');
              }}
              onSwitchToLogin={() => setView('login')}
            />
          )}
          {view === 'verify' && (
            <VerifyForm
              email={pendingEmail}
              onSuccess={() => setView('login')}
              onBackToLogin={() => setView('login')}
            />
          )}
          {view === 'forgot' && (
            <ForgotPasswordForm
              onSuccess={(email: string) => {
                setPendingEmail(email);
                setView('reset');
              }}
              onBackToLogin={() => setView('login')}
            />
          )}
          {view === 'reset' && (
            <ResetPasswordForm
              email={pendingEmail}
              onSuccess={() => setView('login')}
              onBackToLogin={() => setView('login')}
            />
          )}
        </div>
      </div>
    );
  }

  return <Dashboard user={user} onLogout={handleLogout} api={api} />;
}
