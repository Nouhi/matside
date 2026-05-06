import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardLayout } from '@/components/DashboardLayout';
import { CompetitionsPage } from '@/pages/dashboard/CompetitionsPage';
import { CompetitionDetailPage } from '@/pages/dashboard/CompetitionDetailPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ControlPage } from '@/pages/scoreboard/ControlPage';
import { DisplayPage } from '@/pages/scoreboard/DisplayPage';
import { SpectatorPage } from '@/pages/scoreboard/SpectatorPage';
import { ToastContainer } from '@/components/ToastContainer';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
        />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="competitions" replace />} />
          <Route path="competitions" element={<CompetitionsPage />} />
          <Route path="competitions/:id" element={<CompetitionDetailPage />} />
        </Route>
        <Route path="/competitions/:id/register" element={<RegisterPage />} />
        <Route path="/mat/:matId/control" element={<ControlPage />} />
        <Route path="/mat/:matId/display" element={<DisplayPage />} />
        <Route path="/competition/:competitionId/live" element={<SpectatorPage />} />
      </Routes>
    </>
  );
}

export default App;
