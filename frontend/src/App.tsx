import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { api } from './api';

const LandingPage = lazy(() => import('./components/LandingPage.tsx'));
const Dashboard = lazy(() => import('./components/Dashboard.tsx'));
const LoginForm = lazy(() => import('./components/auth/LoginForm.tsx'));
const RegisterForm = lazy(() => import('./components/auth/RegisterForm.tsx'));
const VerifyForm = lazy(() => import('./components/auth/VerifyForm.tsx'));
const ForgotPasswordForm = lazy(() => import('./components/auth/ForgotPasswordForm.tsx'));
const ResetPasswordForm = lazy(() => import('./components/auth/ResetPasswordForm.tsx'));

type View = 'landing' | 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'dashboard';

const routeMap: Record<View, string> = {
  landing: '/',
  login: '/login',
  register: '/register',
  verify: '/verify',
  forgot: '/forgot',
  reset: '/reset',
  dashboard: '/app',
};

const viewForPath = (path: string): View => {
  if (path.startsWith('/login')) return 'login';
  if (path.startsWith('/register')) return 'register';
  if (path.startsWith('/verify')) return 'verify';
  if (path.startsWith('/forgot')) return 'forgot';
  if (path.startsWith('/reset')) return 'reset';
  if (path.startsWith('/app')) return 'dashboard';
  return 'landing';
};

// App shell: auth flow switcher and dashboard entry point.
export default function MomentOSApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<View>('login');
  const [user, setUser] = useState<any>(null);
  const [pendingEmail, setPendingEmail] = useState('');

  const navigateTo = useCallback((nextView: View) => {
    const nextPath = routeMap[nextView];
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setView(nextView);
  }, []);

  useEffect(() => {
    setIsAuthenticated(false);
    setView(viewForPath(window.location.pathname));
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setView(viewForPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
    navigateTo('login');
  };

  if (!isAuthenticated) {
    if (view === 'dashboard') {
      navigateTo('login');
      return null;
    }

    if (view === 'landing') {
      return (
        <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
          <LandingPage
            onLogin={() => navigateTo('login')}
            onRegister={() => navigateTo('register')}
          />
        </Suspense>
      );
    }

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
                  navigateTo('dashboard');
                }}
                onRequireVerification={(email: string) => {
                  setPendingEmail(email);
                  navigateTo('verify');
                }}
                onSwitchToRegister={() => navigateTo('register')}
                onForgotPassword={() => navigateTo('forgot')}
              />
            )}
            {view === 'register' && (
              <RegisterForm
                onSuccess={(data, email: string) => {
                  if (data.requiresVerification) {
                    setPendingEmail(email);
                    navigateTo('verify');
                    return;
                  }
                  localStorage.setItem('token', data.token);
                  setUser(data.user);
                  setIsAuthenticated(true);
                  navigateTo('dashboard');
                }}
                onSwitchToLogin={() => navigateTo('login')}
              />
            )}
            {view === 'verify' && (
              <VerifyForm
                email={pendingEmail}
                onSuccess={() => navigateTo('login')}
                onBackToLogin={() => navigateTo('login')}
              />
            )}
            {view === 'forgot' && (
              <ForgotPasswordForm
                onSuccess={(email: string) => {
                  setPendingEmail(email);
                  navigateTo('reset');
                }}
                onBackToLogin={() => navigateTo('login')}
              />
            )}
            {view === 'reset' && (
              <ResetPasswordForm
                email={pendingEmail}
                onSuccess={() => navigateTo('login')}
                onBackToLogin={() => navigateTo('login')}
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
