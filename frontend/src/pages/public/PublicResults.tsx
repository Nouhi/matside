import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Medal } from 'lucide-react';
import { api } from '@/lib/api';

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
}

interface CategoryStandings {
  categoryId: string;
  categoryName: string;
  bracketType: string;
  status: 'IN_PROGRESS' | 'COMPLETE' | 'PENDING_PLAYOFF';
  standings: StandingEntry[];
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  PENDING_PLAYOFF: { label: 'Pending playoff', cls: 'bg-blue-100 text-blue-700' },
  COMPLETE: { label: 'Complete', cls: 'bg-emerald-100 text-emerald-700' },
};

export function PublicResults() {
  const { id } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<'ALL' | 'COMPLETE' | 'IN_PROGRESS'>('ALL');

  const { data: standings = [], isLoading } = useQuery<CategoryStandings[]>({
    queryKey: ['public-standings', id],
    queryFn: () => api.get(`/public/competitions/${id}/standings`),
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (filter === 'ALL') return standings;
    if (filter === 'COMPLETE') return standings.filter((s) => s.status === 'COMPLETE');
    return standings.filter((s) => s.status !== 'COMPLETE');
  }, [standings, filter]);

  const completeCount = standings.filter((s) => s.status === 'COMPLETE').length;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
        Loading results…
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <p className="text-gray-500">No results yet.</p>
        <p className="text-xs text-gray-400 mt-2">Categories will appear here as matches are played.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          All ({standings.length})
        </FilterChip>
        <FilterChip active={filter === 'COMPLETE'} onClick={() => setFilter('COMPLETE')}>
          Complete ({completeCount})
        </FilterChip>
        <FilterChip active={filter === 'IN_PROGRESS'} onClick={() => setFilter('IN_PROGRESS')}>
          In progress ({standings.length - completeCount})
        </FilterChip>
      </div>

      <div className="space-y-3">
        {filtered.map((cat) => (
          <CategoryStandingsCard key={cat.categoryId} category={cat} />
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  );
}

function CategoryStandingsCard({ category }: { category: CategoryStandings }) {
  const status = STATUS_LABELS[category.status] ?? STATUS_LABELS.IN_PROGRESS;
  const top3 = category.standings.slice(0, 3);
  const rest = category.standings.slice(3);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{category.categoryName}</h3>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
          {status.label}
        </span>
      </div>

      {top3.length > 0 ? (
        <div className="p-4 space-y-2">
          {top3.map((entry) => (
            <Podium key={entry.competitor.id} entry={entry} />
          ))}

          {rest.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                Show {rest.length} more competitor{rest.length === 1 ? '' : 's'}
              </summary>
              <div className="mt-2 space-y-1">
                {rest.map((entry) => (
                  <RestRow key={entry.competitor.id} entry={entry} />
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-gray-400 italic text-center">
          No standings yet
        </p>
      )}
    </div>
  );
}

function Podium({ entry }: { entry: StandingEntry }) {
  const Icon = entry.rank === 1 ? Trophy : Medal;
  const colorCls =
    entry.rank === 1
      ? 'text-amber-500'
      : entry.rank === 2
        ? 'text-gray-400'
        : 'text-orange-700';

  return (
    <div className="flex items-center gap-3">
      <Icon size={20} className={colorCls} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">
          {entry.competitor.lastName.toUpperCase()} {entry.competitor.firstName}
        </p>
        {entry.competitor.club && (
          <p className="text-xs text-gray-500 truncate">{entry.competitor.club}</p>
        )}
      </div>
      {(entry.wins !== undefined || entry.losses !== undefined) && (
        <span className="text-xs text-gray-500 tabular-nums shrink-0">
          {entry.wins ?? 0}-{entry.losses ?? 0}
        </span>
      )}
    </div>
  );
}

function RestRow({ entry }: { entry: StandingEntry }) {
  return (
    <div className="flex items-center gap-3 text-sm py-1">
      <span className="text-gray-400 font-medium tabular-nums w-6 shrink-0">
        {entry.rank}.
      </span>
      <span className="flex-1 min-w-0 truncate text-gray-700">
        {entry.competitor.lastName.toUpperCase()} {entry.competitor.firstName}
        {entry.competitor.club && (
          <span className="text-gray-400 ml-2">{entry.competitor.club}</span>
        )}
      </span>
      {(entry.wins !== undefined || entry.losses !== undefined) && (
        <span className="text-xs text-gray-400 tabular-nums shrink-0">
          {entry.wins ?? 0}-{entry.losses ?? 0}
        </span>
      )}
    </div>
  );
}
