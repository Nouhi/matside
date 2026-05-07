import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Trophy, Medal, AlertTriangle, Loader } from 'lucide-react';

interface CompetitorRef {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
}

interface StandingEntry {
  rank: number;
  competitor: CompetitorRef;
  wins?: number;
  losses?: number;
  ippons?: number;
  wazaAriWins?: number;
  shidosReceived?: number;
  tiedWith?: string[];
}

interface CategoryStandings {
  categoryId: string;
  categoryName: string;
  bracketType: 'ROUND_ROBIN' | 'SINGLE_REPECHAGE' | 'DOUBLE_REPECHAGE';
  status: 'IN_PROGRESS' | 'COMPLETE' | 'PENDING_PLAYOFF';
  standings: StandingEntry[];
}

const STATUS_LABEL: Record<CategoryStandings['status'], string> = {
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
  PENDING_PLAYOFF: 'Tie — playoff needed',
};

const STATUS_STYLES: Record<CategoryStandings['status'], string> = {
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETE: 'bg-green-100 text-green-700',
  PENDING_PLAYOFF: 'bg-red-100 text-red-700',
};

const BRACKET_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round Robin',
  SINGLE_REPECHAGE: 'Single Repechage',
  DOUBLE_REPECHAGE: 'Double Repechage',
};

function rankBadge(rank: number) {
  if (rank === 1) return <Trophy size={20} className="text-amber-500" />;
  if (rank === 2) return <Medal size={20} className="text-gray-400" />;
  if (rank === 3) return <Medal size={20} className="text-amber-700" />;
  return <span className="inline-block text-center text-base font-semibold text-gray-500 tabular-nums">{rank}</span>;
}

function rankRowClass(rank: number) {
  if (rank === 1) return 'bg-amber-50/50';
  if (rank === 2) return 'bg-gray-50';
  if (rank === 3) return 'bg-orange-50/40';
  return '';
}

export function StandingsTab({ competitionId }: { competitionId: string }) {
  const { data, isLoading, error } = useQuery<CategoryStandings[]>({
    queryKey: ['standings', competitionId],
    queryFn: () => api.get(`/competitions/${competitionId}/standings`),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="p-12 flex items-center justify-center text-gray-500 text-sm">
        <Loader size={16} className="mr-2 animate-spin" /> Loading standings…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-red-600">
        Failed to load standings: {(error as Error).message}
      </div>
    );
  }

  const categories = data ?? [];
  if (categories.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        No categories yet. Generate categories and brackets first.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {categories.map((cat) => (
        <CategoryStandingsBlock key={cat.categoryId} category={cat} />
      ))}
    </div>
  );
}

function CategoryStandingsBlock({ category }: { category: CategoryStandings }) {
  const isRoundRobin = category.bracketType === 'ROUND_ROBIN';

  return (
    <div className="px-6 py-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="font-semibold text-gray-900">{category.categoryName}</h3>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
          {BRACKET_LABELS[category.bracketType] ?? category.bracketType}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[category.status]}`}>
          {category.status === 'PENDING_PLAYOFF' && (
            <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
          )}
          {STATUS_LABEL[category.status]}
        </span>
      </div>

      {category.standings.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No results yet.</p>
      ) : isRoundRobin ? (
        <RoundRobinTable entries={category.standings} />
      ) : (
        <EliminationList entries={category.standings} />
      )}
    </div>
  );
}

function RoundRobinTable({ entries }: { entries: StandingEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-base table-fixed">
        <colgroup>
          <col className="w-16" />
          <col />
          <col className="w-20" />
          <col className="w-20" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="text-left text-sm uppercase text-gray-500 border-b border-gray-200">
            <th className="px-4 py-3 font-bold tracking-wider">#</th>
            <th className="px-4 py-3 font-bold tracking-wider">Competitor</th>
            <th className="px-4 py-3 font-bold tracking-wider text-center">W</th>
            <th className="px-4 py-3 font-bold tracking-wider text-center">L</th>
            <th className="px-4 py-3 font-bold tracking-wider text-center">Ippon</th>
            <th className="px-4 py-3 font-bold tracking-wider text-center">Waza</th>
            <th className="px-4 py-3 font-bold tracking-wider text-center">Shido</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.competitor.id} className={`border-b border-gray-100 ${rankRowClass(e.rank)}`}>
              <td className="px-4 py-4 align-middle">
                <div className="flex items-center justify-center">{rankBadge(e.rank)}</div>
              </td>
              <td className="px-4 py-4">
                <div className="font-bold text-gray-900 text-lg uppercase tracking-wide">
                  {e.competitor.lastName} {e.competitor.firstName}
                </div>
                {e.competitor.club && (
                  <div className="text-sm text-gray-500 mt-0.5">{e.competitor.club}</div>
                )}
                {e.tiedWith && e.tiedWith.length > 0 && (
                  <div className="text-xs text-red-600 mt-1 font-semibold">Tied — playoff required</div>
                )}
              </td>
              <td className="px-4 py-4 text-center text-2xl font-black tabular-nums text-gray-900">{e.wins ?? 0}</td>
              <td className="px-4 py-4 text-center text-2xl font-black tabular-nums text-gray-400">{e.losses ?? 0}</td>
              <td className="px-4 py-4 text-center text-xl font-bold tabular-nums text-gray-700">{e.ippons ?? 0}</td>
              <td className="px-4 py-4 text-center text-xl font-bold tabular-nums text-gray-700">{e.wazaAriWins ?? 0}</td>
              <td className="px-4 py-4 text-center text-xl font-bold tabular-nums text-amber-700">{e.shidosReceived ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EliminationList({ entries }: { entries: StandingEntry[] }) {
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li
          key={e.competitor.id}
          className={`flex items-center gap-4 px-4 py-3 rounded ${rankRowClass(e.rank)}`}
        >
          <div className="w-10 flex justify-center">{rankBadge(e.rank)}</div>
          <div className="flex-1">
            <div className="font-bold text-gray-900 text-lg uppercase tracking-wide">
              {e.competitor.lastName} {e.competitor.firstName}
            </div>
            {e.competitor.club && (
              <div className="text-sm text-gray-500 mt-0.5">{e.competitor.club}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
