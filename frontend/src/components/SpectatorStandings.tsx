import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { bracketLabel } from '@/lib/bracket';
import { rankBadge } from './StandingsTab';

/**
 * Spectator standings panel (Bundle 3 / F7.D2).
 *
 * Phone-first card layout for "family member looks up their fighter."
 * Data flow matches the surrounding SpectatorPage: `api.get` + setInterval
 * polling, no TanStack Query. That's an intentional consistency choice —
 * mixing two data patterns on one page would be more confusion than reuse.
 *
 * UX choices come from /autoplan Phase 2 design review:
 *   - Top 3 by default; tappable "Show all rankings" footer for 4+ on
 *     COMPLETE categories. Mobile real estate is finite; family scans top
 *     of the page for podium, drills in only if their fighter's lower.
 *   - Spectator-friendly empty states. "Bracket coming soon" replaces the
 *     organizer copy ("Generate categories and brackets first") that
 *     would be scary on a phone in the bleachers.
 *   - aria-expanded on the expand button; aria-live on the polling refresh.
 *   - Uses the same rankBadge() icons as the desktop standings so the
 *     visual language stays consistent across surfaces.
 */

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
  bracketType: 'ROUND_ROBIN' | 'POOLS' | 'SINGLE_REPECHAGE' | 'DOUBLE_REPECHAGE' | 'GRAND_SLAM';
  status: 'IN_PROGRESS' | 'COMPLETE' | 'PENDING_PLAYOFF';
  standings: StandingEntry[];
}

const STATUS_COPY: Record<CategoryStandings['status'], string> = {
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
  PENDING_PLAYOFF: 'Tie — playoff pending',
};

export function SpectatorStandings({ competitionId }: { competitionId: string }) {
  const [data, setData] = useState<CategoryStandings[] | null>(null);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!competitionId) return;
    let cancelled = false;

    const fetchStandings = async () => {
      try {
        // Spectators aren't authenticated. /competitions/:id/standings is
        // JWT-guarded; the public projection at /public/competitions/:id/
        // standings is what we want. The public controller calls the same
        // standingsService under the hood, so the shape is identical, and
        // it adds light ETag-based caching for spectator URLs that go viral.
        const result = await api.get<CategoryStandings[]>(
          `/public/competitions/${competitionId}/standings`,
        );
        if (!cancelled) {
          setData(result);
          setError(false);
        }
      } catch {
        // Keep the last-known data on transient failures; the disconnect
        // banner in SpectatorPage already tells the user the connection
        // is degraded. Only flip our local error when we have NO data yet.
        if (!cancelled && data === null) setError(true);
      }
    };

    fetchStandings();
    intervalRef.current = setInterval(fetchStandings, 5000);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  if (data === null && error) {
    return (
      <div className="text-center py-12 px-6">
        <Trophy size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">Couldn't load standings — retrying.</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="text-center py-12 px-6">
        <span className="text-sm text-gray-500">Loading standings…</span>
      </div>
    );
  }

  if (data.length === 0) {
    // Spectator-friendly empty state. The organizer-flavored "Generate
    // categories" copy is reserved for the dashboard.
    return (
      <div className="text-center py-12 px-6">
        <Trophy size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-base text-gray-500">Bracket coming soon</p>
        <p className="text-sm text-gray-400 mt-1">
          Check back when matches start.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 max-w-lg mx-auto" aria-live="polite">
      <div className="flex flex-col gap-3">
        {data.map((cat) => (
          <CategoryCard key={cat.categoryId} category={cat} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryStandings }) {
  const [expanded, setExpanded] = useState(false);
  const isRoundRobin = category.bracketType === 'ROUND_ROBIN';
  const hasRankings = category.standings.length > 0;
  const showAll = expanded || category.standings.length <= 3;
  const visible = showAll ? category.standings : category.standings.slice(0, 3);
  const hiddenCount = category.standings.length - 3;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
        <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide truncate">
          {category.categoryName}
        </h3>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            category.status === 'COMPLETE'
              ? 'bg-green-100 text-green-700'
              : category.status === 'PENDING_PLAYOFF'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {STATUS_COPY[category.status]}
        </span>
      </div>

      {!hasRankings ? (
        // IN_PROGRESS with no rankings yet: spectator-flavored message
        // instead of "No results yet" (which reads as broken).
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Matches in progress — no rankings yet
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {visible.map((entry) => (
              <RankingRow
                key={entry.competitor.id}
                entry={entry}
                showStats={isRoundRobin}
              />
            ))}
          </ul>

          {hiddenCount > 0 && !expanded && category.status === 'COMPLETE' && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              className="w-full px-4 py-2.5 flex items-center justify-center gap-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 border-t border-gray-100 min-h-[44px]"
            >
              <ChevronRight size={14} />
              Show all rankings ({hiddenCount} more)
            </button>
          )}

          {hiddenCount > 0 && expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-expanded={true}
              className="w-full px-4 py-2.5 flex items-center justify-center gap-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 border-t border-gray-100 min-h-[44px]"
            >
              <ChevronDown size={14} />
              Show top 3 only
            </button>
          )}
        </>
      )}

      {category.bracketType !== 'ROUND_ROBIN' && (
        <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 text-center">
          {bracketLabel(category.bracketType)}
        </div>
      )}
    </div>
  );
}

function RankingRow({ entry, showStats }: { entry: StandingEntry; showStats: boolean }) {
  const isPodium = entry.rank <= 3;
  return (
    <li className={`px-4 py-3 ${isPodium ? 'bg-amber-50/30' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-7 flex justify-center">{rankBadge(entry.rank, 22)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-base uppercase tracking-wide truncate">
            {entry.competitor.lastName} {entry.competitor.firstName}
          </div>
          {entry.competitor.club && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">{entry.competitor.club}</div>
          )}
        </div>
      </div>
      {showStats && (
        <div className="mt-1.5 ml-10 text-xs text-gray-500 tabular-nums flex flex-wrap gap-x-3 gap-y-0.5">
          <span>
            <span className="font-semibold text-gray-700">{entry.wins ?? 0}W</span>{' '}
            <span className="text-gray-400">{entry.losses ?? 0}L</span>
          </span>
          <span>·</span>
          <span>{entry.ippons ?? 0} ippon</span>
          <span>·</span>
          <span>{entry.wazaAriWins ?? 0} waza-ari</span>
          {(entry.shidosReceived ?? 0) > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-700">{entry.shidosReceived} shido</span>
            </>
          )}
        </div>
      )}
      {entry.tiedWith && entry.tiedWith.length > 0 && (
        <div className="mt-1 ml-10 text-xs text-red-600 font-semibold">
          Tied — playoff pending
        </div>
      )}
    </li>
  );
}
