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
import { PublicCompetitionLayout } from '@/pages/public/PublicCompetitionPage';
import { PublicOverview } from '@/pages/public/PublicOverview';
import { PublicBrackets } from '@/pages/public/PublicBrackets';
import { PublicSchedule } from '@/pages/public/PublicSchedule';
import { PublicResults } from '@/pages/public/PublicResults';
import { AthleteProfilePage } from '@/pages/public/AthleteProfilePage';
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
        <Route path="/c/:id" element={<PublicCompetitionLayout />}>
          <Route index element={<PublicOverview />} />
          <Route path="brackets" element={<PublicBrackets />} />
          <Route path="schedule" element={<PublicSchedule />} />
          <Route path="results" element={<PublicResults />} />
        </Route>
        <Route path="/athlete/:id" element={<AthleteProfilePage />} />
      </Routes>
    </>
  );
}

export default App;
