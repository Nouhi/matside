import { useEffect } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, MapPin, Users, Layers, Grid } from 'lucide-react';
import { api } from '@/lib/api';

interface PublicCompetition {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
  competitorCount: number;
  categoryCount: number;
  matCount: number;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-gray-200 text-gray-700' },
  REGISTRATION: { label: 'Registration open', cls: 'bg-blue-100 text-blue-700' },
  WEIGH_IN: { label: 'Weigh-in', cls: 'bg-amber-100 text-amber-700' },
  ACTIVE: { label: 'Live', cls: 'bg-emerald-100 text-emerald-700 animate-pulse' },
  COMPLETED: { label: 'Final results', cls: 'bg-slate-200 text-slate-700' },
};

export function PublicCompetitionLayout() {
  const { id } = useParams<{ id: string }>();
  const { data: competition, isLoading, error } = useQuery<PublicCompetition>({
    queryKey: ['public-competition', id],
    queryFn: () => api.get(`/public/competitions/${id}`),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (competition?.name) document.title = `${competition.name} · matside`;
    return () => {
      document.title = 'matside';
    };
  }, [competition?.name]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }
  if (error || !competition) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-500">
        <p className="text-lg">Competition not found</p>
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          Go home
        </Link>
      </div>
    );
  }

  const status = STATUS_LABELS[competition.status] ?? STATUS_LABELS.DRAFT;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
                matside
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                {competition.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={14} />
                  {new Date(competition.date).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                {competition.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={14} />
                    {competition.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Users size={14} />
                  {competition.competitorCount} competitors
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Layers size={14} />
                  {competition.categoryCount} categories
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Grid size={14} />
                  {competition.matCount} mats
                </span>
              </div>
            </div>
            <span
              className={`self-start px-3 py-1.5 rounded-full text-xs font-semibold ${status.cls}`}
            >
              {status.label}
            </span>
          </div>

          <nav className="flex gap-1 mt-6 -mb-px overflow-x-auto">
            <PublicTab to={`/c/${id}`} end>Overview</PublicTab>
            <PublicTab to={`/c/${id}/brackets`}>Brackets</PublicTab>
            <PublicTab to={`/c/${id}/schedule`}>Schedule</PublicTab>
            <PublicTab to={`/c/${id}/results`}>Results</PublicTab>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <Outlet context={{ competition }} />
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-xs text-gray-400 text-center">
        Tournament managed with{' '}
        <Link to="/" className="hover:underline">matside</Link>
      </footer>
    </div>
  );
}

function PublicTab({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          isActive
            ? 'border-gray-900 text-gray-900'
            : 'border-transparent text-gray-500 hover:text-gray-800'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
