import { Suspense, lazy, useEffect, useState } from 'react';
import { api } from './api';

const Dashboard = lazy(() => import('./components/Dashboard.tsx'));
const LoginForm = lazy(() => import('./components/auth/LoginForm.tsx'));
const RegisterForm = lazy(() => import('./components/auth/RegisterForm.tsx'));
const VerifyForm = lazy(() => import('./components/auth/VerifyForm.tsx'));
const ForgotPasswordForm = lazy(() => import('./components/auth/ForgotPasswordForm.tsx'));
const ResetPasswordForm = lazy(() => import('./components/auth/ResetPasswordForm.tsx'));

type View = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'dashboard';

// App shell: auth flow switcher and dashboard entry point.
export default function MomentOSApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<View>('login');
  const [user, setUser] = useState<any>(null);
  const [pendingEmail, setPendingEmail] = useState('');

  useEffect(() => {
    setIsAuthenticated(false);
    setView('login');
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
    setView('login');
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
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
          </Suspense>
        </div>
      </main>
    );
  }

  return (
    <Suspense fallback={<div className="text-center py-8">Loading dashboard...</div>}>
      <Dashboard user={user} onLogout={handleLogout} api={api} />
    </Suspense>
  );
}
