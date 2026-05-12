import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PublicCompetitor {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
  athleteId: string | null;
}

interface ScheduledMatch {
  id: string;
  round: number;
  poolPosition: number;
  // `sequenceNum` and `status` are only set on next-matches and current-match
  // respectively; the public schedule endpoint returns two different shapes
  // (see backend/src/competitions/competitions.public.controller.ts).
  sequenceNum?: number;
  status?: string;
  category: { id: string; name: string };
  competitor1: PublicCompetitor | null;
  competitor2: PublicCompetitor | null;
  // Live scoring fields — only present on `currentMatch`, never on
  // `nextMatches`. The PublicSchedule UI doesn't render these today, but
  // they're available if we ever want to show "1-0" next to the "Now" panel
  // or surface the GS badge here too.
  scores?: {
    competitor1: { wazaAri: number; yuko?: number; shido: number };
    competitor2: { wazaAri: number; yuko?: number; shido: number };
  } | null;
  winMethod?: string | null;
  goldenScore?: boolean;
  winner?: PublicCompetitor | null;
  // Computed-on-read ETA in seconds. 0 means "now / currently fighting".
  // null means the match isn't in any mat queue yet.
  etaSeconds: number | null;
}

interface MatSchedule {
  id: string;
  number: number;
  categories: { id: string; name: string; _count: { competitors: number } }[];
  currentMatch: ScheduledMatch | null;
  nextMatches: ScheduledMatch[];
}

export function PublicSchedule() {
  const { id } = useParams<{ id: string }>();
  const { data: mats = [], isLoading } = useQuery<MatSchedule[]>({
    queryKey: ['public-schedule', id],
    queryFn: () => api.get(`/public/competitions/${id}/schedule`),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
        Loading schedule…
      </div>
    );
  }

  if (mats.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <p className="text-gray-500">No mats configured yet.</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {mats.map((mat) => (
        <MatCard key={mat.id} mat={mat} />
      ))}
    </div>
  );
}

function MatCard({ mat }: { mat: MatSchedule }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-900 text-white flex items-center justify-between">
        <h3 className="font-bold text-lg">Mat {mat.number}</h3>
        {mat.currentMatch ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        ) : (
          <span className="text-xs text-gray-400 uppercase tracking-wide">Idle</span>
        )}
      </div>

      {mat.currentMatch && (
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-1">
            Now
          </p>
          <MatchRow match={mat.currentMatch} />
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {mat.nextMatches.length === 0 && !mat.currentMatch && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center italic">
            No upcoming matches
          </p>
        )}
        {mat.nextMatches.length > 0 && (
          <div className="px-4 py-2 bg-gray-50">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Up next ({mat.nextMatches.length})
            </p>
          </div>
        )}
        {mat.nextMatches.map((match, i) => (
          <div key={match.id} className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-medium tabular-nums w-4 shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <MatchRow match={match} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {mat.categories.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            <span className="font-medium">Categories on this mat:</span>{' '}
            {mat.categories.map((c) => c.name).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: ScheduledMatch }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-gray-500 truncate">{match.category.name}</p>
        <EtaPill etaSeconds={match.etaSeconds} status={match.status} />
      </div>
      <p className="text-sm font-semibold text-gray-900 truncate">
        <CompetitorName competitor={match.competitor1} />
        <span className="text-gray-400 mx-2 font-normal">vs</span>
        <CompetitorName competitor={match.competitor2} />
      </p>
    </div>
  );
}

// Render the computed-on-read ETA next to each match. ACTIVE → "now",
// 0 → "starting", < 90s → "<2 min", else minutes/hours. We deliberately
// round generously — the backend ticks by Competition.matchDuration not
// real elapsed time, so spurious precision would mislead.
function formatEta(seconds: number): string {
  if (seconds <= 0) return 'starting';
  if (seconds < 90) return '< 2 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (remMin === 0) return `~${hours}h`;
  return `~${hours}h ${remMin}m`;
}

function EtaPill({
  etaSeconds,
  status,
}: {
  etaSeconds: number | null;
  status?: string;
}) {
  if (status === 'ACTIVE') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 shrink-0">
        live
      </span>
    );
  }
  if (etaSeconds == null) return null;
  return (
    <span className="text-[10px] font-mono text-gray-400 tabular-nums shrink-0">
      {formatEta(etaSeconds)}
    </span>
  );
}

function CompetitorName({ competitor }: { competitor: PublicCompetitor | null }) {
  if (!competitor) return <span className="text-gray-400 italic">TBD</span>;
  const display = `${competitor.lastName.toUpperCase()} ${competitor.firstName[0] ?? ''}.`;
  if (competitor.athleteId) {
    return (
      <Link
        to={`/athlete/${competitor.athleteId}`}
        className="hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {display}
      </Link>
    );
  }
  return <span>{display}</span>;
}
