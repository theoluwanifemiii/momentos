import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { api } from './api';

const LandingPage = lazy(() => import('./components/LandingPage.tsx'));
const ChangelogPage = lazy(() => import('./components/ChangelogPage.tsx'));
const DocsPage = lazy(() => import('./components/DocsPage.tsx'));
const Dashboard = lazy(() => import('./components/Dashboard.tsx'));
const LoginForm = lazy(() => import('./components/auth/LoginForm.tsx'));
const RegisterForm = lazy(() => import('./components/auth/RegisterForm.tsx'));
const VerifyForm = lazy(() => import('./components/auth/VerifyForm.tsx'));
const AdminLogin = lazy(() => import('./components/internalAdmin/AdminLogin.tsx'));
const AdminRegister = lazy(() => import('./components/internalAdmin/AdminRegister.tsx'));
const AdminLayout = lazy(() => import('./components/internalAdmin/AdminLayout.tsx'));
const AdminOverview = lazy(() => import('./components/internalAdmin/pages/Overview.tsx'));
const AdminOrganizations = lazy(() => import('./components/internalAdmin/pages/Organizations.tsx'));
const AdminOrganizationDetail = lazy(
  () => import('./components/internalAdmin/pages/OrganizationDetail.tsx')
);
const AdminPeople = lazy(() => import('./components/internalAdmin/pages/People.tsx'));
const AdminTemplates = lazy(() => import('./components/internalAdmin/pages/Templates.tsx'));
const AdminDeliveryLogs = lazy(() => import('./components/internalAdmin/pages/DeliveryLogs.tsx'));
const AdminAuditLogs = lazy(() => import('./components/internalAdmin/pages/AuditLogs.tsx'));
const AdminStaff = lazy(() => import('./components/internalAdmin/pages/Staff.tsx'));
const AdminFeedback = lazy(() => import('./components/internalAdmin/pages/Feedback.tsx'));

// App shell: auth flow switcher and dashboard entry point.
export default function MomentOSApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
    navigate('/login', { replace: true });
  };

  const AuthLayout = ({ children }: { children: ReactNode }) => (
    <main className="ds-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.15),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_60%_85%,rgba(6,182,212,0.12),transparent_26%)]" />
      <div className="relative w-full max-w-md">
        <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
          {children}
        </Suspense>
      </div>
    </main>
  );

  const LoginGate = () => {
    const [searchParams] = useSearchParams();
    const tokenFromQuery = searchParams.get('token')?.trim() || '';
    const tokenFromHash = useMemo(() => {
      const hash = window.location.hash.replace(/^#/, '');
      return new URLSearchParams(hash).get('token')?.trim() || '';
    }, []);
    const token = tokenFromQuery || tokenFromHash;

    if (token) {
      return <Navigate to={`/app?token=${encodeURIComponent(token)}`} replace />;
    }

    return (
      <AuthLayout>
        <LoginForm
          onSuccess={(data) => {
            localStorage.setItem('token', data.token);
            setUser(data.user);
            setIsAuthenticated(true);
            navigate('/app');
          }}
          onSwitchToRegister={() => navigate('/register')}
          defaultEmail={pendingEmail}
        />
      </AuthLayout>
    );
  };

  const AppGate = () => {
    const [searchParams] = useSearchParams();
    const tokenFromQuery = searchParams.get('token')?.trim() || '';
    const tokenFromHash = useMemo(() => {
      const hash = window.location.hash.replace(/^#/, '');
      return new URLSearchParams(hash).get('token')?.trim() || '';
    }, []);
    const token = tokenFromQuery || tokenFromHash;
    const [verifying, setVerifying] = useState(Boolean(token));
    const [error, setError] = useState('');

    useEffect(() => {
      if (token || isAuthenticated) return;
      const stored = localStorage.getItem('token');
      if (!stored) return;
      try {
        const payload = JSON.parse(atob(stored.split('.')[1]));
        if (payload.exp && payload.exp * 1000 > Date.now()) {
          setUser({ id: payload.userId, role: payload.userRole });
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('token');
        }
      } catch {
        localStorage.removeItem('token');
      }
    }, []);

    useEffect(() => {
      if (!token || isAuthenticated) return;
      let isMounted = true;
      setVerifying(true);
      setError('');

      api
        .call('/auth/magic/verify', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
        .then((data) => {
          if (!isMounted) return;
          localStorage.setItem('token', data.token);
          setUser(data.user);
          setIsAuthenticated(true);
          navigate('/app', { replace: true });
        })
        .catch((err: any) => {
          if (!isMounted) return;
          setError(`Magic link sign-in failed: ${err.message}`);
        })
        .finally(() => {
          if (!isMounted) return;
          setVerifying(false);
        });

      return () => {
        isMounted = false;
      };
    }, [token, isAuthenticated]);

    if (isAuthenticated) {
      return <Dashboard user={user} onLogout={handleLogout} api={api} />;
    }

    if (token) {
      return (
        <AuthLayout>
          <div className="ds-surface p-6 text-center space-y-4">
            <h1 className="text-lg font-semibold text-slate-900">Signing you in</h1>
            {verifying ? (
              <p className="text-sm text-slate-600">Verifying your sign-in link...</p>
            ) : (
              <p className="text-sm text-slate-600">Sign-in could not be completed.</p>
            )}
            {error ? <p className="ds-alert ds-alert-error">{error}</p> : null}
          </div>
        </AuthLayout>
      );
    }

    return <Navigate to="/login" replace />;
  };

  return (
    <>
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
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/app" replace />
              ) : (
                <LoginGate />
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
                    onMagicLinkSent={(email: string) => {
                      setPendingEmail(email);
                    }}
                    onSwitchToLogin={() => {
                      navigate('/login');
                    }}
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
              <Navigate to="/login" replace />
            }
          />
          <Route
            path="/reset"
            element={
              <Navigate to="/login" replace />
            }
          />
          <Route
            path="/app"
            element={<AppGate />}
          />
          <Route
            path="/admin/login"
            element={
              <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
                <AdminLogin />
              </Suspense>
            }
          />
          <Route
            path="/admin/register"
            element={
              <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
                <AdminRegister />
              </Suspense>
            }
          />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
                <AdminLayout />
              </Suspense>
            }
          >
            <Route index element={<AdminOverview />} />
            <Route path="orgs" element={<AdminOrganizations />} />
            <Route path="orgs/:id" element={<AdminOrganizationDetail />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="people" element={<AdminPeople />} />
            <Route path="templates" element={<AdminTemplates />} />
            <Route path="delivery-logs" element={<AdminDeliveryLogs />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
            <Route path="feedback" element={<AdminFeedback />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Analytics />
    </>
  );
}
