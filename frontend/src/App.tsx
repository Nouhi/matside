import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardLayout } from '@/components/DashboardLayout';
import { CompetitionsPage } from '@/pages/dashboard/CompetitionsPage';
import { CompetitionDetailPage } from '@/pages/dashboard/CompetitionDetailPage';
import { MyAthletesPage } from '@/pages/coach/MyAthletesPage';
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

// `area` is the dashboard this route belongs to. A coach hitting an organizer
// route (or vice versa) is redirected to their own home rather than shown an
// empty/forbidden screen.
function ProtectedRoute({
  children,
  area,
}: {
  children: React.ReactNode;
  area: 'organizer' | 'coach';
}) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role === 'COACH' && area === 'organizer') return <Navigate to="/coach" replace />;
  if (role !== 'COACH' && area === 'coach') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  const { isAuthenticated, role } = useAuth();
  const home = isAuthenticated ? (role === 'COACH' ? '/coach' : '/dashboard') : '/login';

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute area="organizer">
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="competitions" replace />} />
          <Route path="competitions" element={<CompetitionsPage />} />
          <Route path="competitions/:id" element={<CompetitionDetailPage />} />
        </Route>
        <Route
          path="/coach"
          element={
            <ProtectedRoute area="coach">
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<MyAthletesPage />} />
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
