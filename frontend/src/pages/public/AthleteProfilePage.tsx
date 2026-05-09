import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trophy, Medal, Calendar, MapPin } from 'lucide-react';
import { api } from '@/lib/api';

interface AthleteProfile {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  competitions: AthleteCompetitionEntry[];
  lifetime: {
    competitionsEntered: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
    ippons: number;
  };
}

interface AthleteCompetitionEntry {
  competitorId: string;
  competition: {
    id: string;
    name: string;
    date: string;
    location: string;
    status: string;
  };
  category: { id: string; name: string } | null;
  club: string;
  belt: string;
  weight: number | null;
  registrationStatus: string;
  matches: { played: number; won: number; lost: number };
}

export function AthleteProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery<AthleteProfile>({
    queryKey: ['athlete', id],
    queryFn: () => api.get(`/public/athletes/${id}`),
  });

  useEffect(() => {
    if (data) document.title = `${data.firstName} ${data.lastName} · matside`;
    return () => {
      document.title = 'matside';
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Loading profile…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-500">
        <p className="text-lg">Athlete not found</p>
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          Go home
        </Link>
      </div>
    );
  }

  const winRate =
    data.lifetime.matchesPlayed > 0
      ? Math.round((data.lifetime.wins / data.lifetime.matchesPlayed) * 100)
      : 0;
  // Most recent club this athlete competed under (for display).
  const recentClub = data.competitions[0]?.club ?? '';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2"
          >
            <ArrowLeft size={12} />
            matside
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            {data.firstName} {data.lastName}
          </h1>
          {recentClub && (
            <p className="text-sm text-gray-500 mt-1">{recentClub}</p>
          )}

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <Stat label="Competitions" value={data.lifetime.competitionsEntered} />
            <Stat label="Matches played" value={data.lifetime.matchesPlayed} />
            <Stat
              label="Win rate"
              value={`${winRate}%`}
              sub={`${data.lifetime.wins}-${data.lifetime.losses}`}
            />
            <Stat label="Ippons" value={data.lifetime.ippons} />
          </dl>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Competition history
        </h2>
        {data.competitions.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            No competitions yet.
          </div>
        ) : (
          <div className="space-y-2">
            {data.competitions.map((entry) => (
              <CompetitionRow key={entry.competitorId} entry={entry} />
            ))}
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 sm:px-6 py-8 text-xs text-gray-400 text-center">
        Profile maintained by{' '}
        <Link to="/" className="hover:underline">matside</Link>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{value}</dd>
      {sub && <p className="text-xs text-gray-400 tabular-nums">{sub}</p>}
    </div>
  );
}

function CompetitionRow({ entry }: { entry: AthleteCompetitionEntry }) {
  const won = entry.matches.won;
  const lost = entry.matches.lost;
  const podium = won >= 1 && entry.competition.status === 'COMPLETED' && lost === 0;

  return (
    <Link
      to={`/c/${entry.competition.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {podium && <Trophy size={14} className="text-amber-500 shrink-0" />}
            <h3 className="font-semibold text-gray-900 truncate">
              {entry.competition.name}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              {new Date(entry.competition.date).toLocaleDateString()}
            </span>
            {entry.competition.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {entry.competition.location}
              </span>
            )}
            {entry.category && (
              <span className="inline-flex items-center gap-1">
                <Medal size={12} />
                {entry.category.name}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {entry.matches.played > 0 ? (
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {won}-{lost}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic">Not played</p>
          )}
          {entry.weight && (
            <p className="text-xs text-gray-500 tabular-nums">{entry.weight}kg</p>
          )}
        </div>
      </div>
    </Link>
  );
}
