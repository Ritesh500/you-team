import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { setSessionExpiredHandler } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth';
import { LoadingBlock } from '@/components/ui/States';
import { AppShell } from '@/components/layout/AppShell';
import type { Role } from '@/types/api';

import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { EmployeeDetailPage } from '@/pages/EmployeeDetailPage';
import { DepartmentsPage } from '@/pages/DepartmentsPage';
import { ChannelsPage } from '@/pages/ChannelsPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { LeavePage } from '@/pages/LeavePage';
import { PayrollPage } from '@/pages/PayrollPage';
import { PayrollRunPage } from '@/pages/PayrollRunPage';
import { AnnouncementsPage } from '@/pages/AnnouncementsPage';
import { AdminPage } from '@/pages/AdminPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** Redirects to /login, remembering where the user was headed. */
function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const user = useAuthStore((state) => state.user);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="grid min-h-dvh place-items-center bg-plane">
        <LoadingBlock label="Restoring your session…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

const HR_ONLY: Role[] = ['SUPER_ADMIN', 'HR_MANAGER'];

export function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // When a refresh fails, drop the cached session and bounce to the login page.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      queryClient.clear();
      navigate('/login', { replace: true });
    });
  }, [navigate, setUser]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="/departments" element={<DepartmentsPage />} />
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/leave" element={<LeavePage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route
          path="/payroll"
          element={
            <RequireAuth roles={HR_ONLY}>
              <PayrollPage />
            </RequireAuth>
          }
        />
        <Route
          path="/payroll/:id"
          element={
            <RequireAuth roles={HR_ONLY}>
              <PayrollRunPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth roles={HR_ONLY}>
              <AdminPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
