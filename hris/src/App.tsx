import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useCurrentUser } from './lib/store';
import { Login } from './pages/Login';
import { EmployeeDashboard } from './pages/employee/Dashboard';
import { MyLeaves } from './pages/employee/MyLeaves';
import { AttendancePage } from './pages/employee/Attendance';
import { CalendarPage } from './pages/employee/Calendar';
import { AnalyticsPage } from './pages/employee/Analytics';
import { ReportsPage } from './pages/employee/Reports';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { LeaveRequestsPage } from './pages/admin/LeaveRequests';
import { EmployeesPage } from './pages/admin/Employees';
import { HolidayManager } from './pages/admin/HolidayManager';
import { AdminSettings } from './pages/admin/Settings';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminOnly({ children }: { children: React.ReactElement }) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')
    return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<EmployeeDashboard />} />
          <Route path="/leaves" element={<MyLeaves />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/reports" element={<ReportsPage />} />

          <Route
            path="/admin"
            element={
              <AdminOnly>
                <AdminDashboard />
              </AdminOnly>
            }
          />
          <Route
            path="/admin/requests"
            element={
              <AdminOnly>
                <LeaveRequestsPage />
              </AdminOnly>
            }
          />
          <Route
            path="/admin/employees"
            element={
              <AdminOnly>
                <EmployeesPage />
              </AdminOnly>
            }
          />
          <Route
            path="/admin/holidays"
            element={
              <AdminOnly>
                <HolidayManager />
              </AdminOnly>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminOnly>
                <AdminSettings />
              </AdminOnly>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
