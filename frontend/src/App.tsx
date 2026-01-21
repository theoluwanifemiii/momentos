import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';

const LandingPage = lazy(() => import('./components/LandingPage.tsx'));
const Dashboard = lazy(() => import('./components/Dashboard.tsx'));
const LoginForm = lazy(() => import('./components/auth/LoginForm.tsx'));
const RegisterForm = lazy(() => import('./components/auth/RegisterForm.tsx'));
const VerifyForm = lazy(() => import('./components/auth/VerifyForm.tsx'));
const ForgotPasswordForm = lazy(() => import('./components/auth/ForgotPasswordForm.tsx'));
const ResetPasswordForm = lazy(() => import('./components/auth/ResetPasswordForm.tsx'));

// App shell: auth flow switcher and dashboard entry point.
export default function MomentOSApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setIsAuthenticated(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
    navigate('/login', { replace: true });
  };

  const AuthLayout = ({ children }: { children: ReactNode }) => (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
          {children}
        </Suspense>
      </div>
    </main>
  );

  return (
    <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              onLogin={() => navigate('/login')}
              onRegister={() => navigate('/register')}
            />
          }
        />
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <AuthLayout>
                <LoginForm
                  onSuccess={(data) => {
                    localStorage.setItem('token', data.token);
                    setUser(data.user);
                    setIsAuthenticated(true);
                    navigate('/app');
                  }}
                  onRequireVerification={(email: string) => {
                    setPendingEmail(email);
                    navigate('/verify');
                  }}
                  onSwitchToRegister={() => navigate('/register')}
                  onForgotPassword={() => navigate('/forgot')}
                />
              </AuthLayout>
            )
          }
        />
        <Route
          path="/register"
          element={
            isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <AuthLayout>
                <RegisterForm
                  onSuccess={(data, email: string) => {
                    if (data.requiresVerification) {
                      setPendingEmail(email);
                      navigate('/verify');
                      return;
                    }
                    localStorage.setItem('token', data.token);
                    setUser(data.user);
                    setIsAuthenticated(true);
                    navigate('/app');
                  }}
                  onSwitchToLogin={() => navigate('/login')}
                />
              </AuthLayout>
            )
          }
        />
        <Route
          path="/verify"
          element={
            isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <AuthLayout>
                <VerifyForm
                  email={pendingEmail}
                  onSuccess={() => navigate('/login')}
                  onBackToLogin={() => navigate('/login')}
                />
              </AuthLayout>
            )
          }
        />
        <Route
          path="/forgot"
          element={
            isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <AuthLayout>
                <ForgotPasswordForm
                  onSuccess={(email: string) => {
                    setPendingEmail(email);
                    navigate('/reset');
                  }}
                  onBackToLogin={() => navigate('/login')}
                />
              </AuthLayout>
            )
          }
        />
        <Route
          path="/reset"
          element={
            isAuthenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <AuthLayout>
                <ResetPasswordForm
                  email={pendingEmail}
                  onSuccess={() => navigate('/login')}
                  onBackToLogin={() => navigate('/login')}
                />
              </AuthLayout>
            )
          }
        />
        <Route
          path="/app"
          element={
            isAuthenticated ? (
              <Dashboard user={user} onLogout={handleLogout} api={api} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
