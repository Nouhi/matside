import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Activity, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { SpectatorStandings } from '@/components/SpectatorStandings';

// Shapes match the sanitized projections from PublicCompetitionsController.
// Keep these in lockstep with backend/src/competitions/competitions.public.controller.ts
// — if the schedule endpoint stops returning a field we render here, the UI
// silently degrades (e.g. scores → all-zeros) rather than crashing.
interface PublicCompetitor {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
  athleteId: string | null;
}

interface MatScores {
  competitor1: { wazaAri: number; yuko?: number; shido: number };
  competitor2: { wazaAri: number; yuko?: number; shido: number };
}

interface ScheduledMatch {
  id: string;
  round: number;
  poolPosition: number;
  status: string;
  scores: MatScores | null;
  winMethod: string | null;
  goldenScore: boolean;
  category: { id: string; name: string };
  competitor1: PublicCompetitor | null;
  competitor2: PublicCompetitor | null;
  winner: PublicCompetitor | null;
  etaSeconds: number | null;
}

interface MatSchedule {
  id: string;
  number: number;
  categories: { id: string; name: string; _count: { competitors: number } }[];
  currentMatch: ScheduledMatch | null;
  nextMatches: unknown[];
}

interface PublicCompetition {
  id: string;
  name: string;
  date?: string;
  location?: string | null;
  status?: string;
  competitorCount?: number;
  categoryCount?: number;
  matCount?: number;
}

function MiniScore({
  label,
  value,
  isBlue,
}: {
  label: string;
  value: number;
  isBlue: boolean;
}) {
  const labelColor = isBlue ? 'text-blue-200' : 'text-gray-500';
  const valueColor = isBlue ? 'text-white' : 'text-gray-900';
  return (
    <div className="flex flex-col items-center justify-center min-w-[36px]">
      <div className={`${labelColor} text-[9px] font-bold uppercase tracking-wider leading-none`}>
        {label}
      </div>
      <div className={`${valueColor} font-black tabular-nums leading-none mt-0.5 text-xl`}>{value}</div>
    </div>
  );
}

function MiniShido({ count, isBlue }: { count: number; isBlue: boolean }) {
  const labelColor = isBlue ? 'text-amber-300' : 'text-amber-700';
  const filled = 'bg-amber-400 border-amber-400';
  const emptyBorder = isBlue ? 'border-amber-300/40' : 'border-gray-400';
  return (
    <div className="flex flex-col items-center justify-center min-w-[42px]">
      <div className={`${labelColor} text-[9px] font-bold uppercase tracking-wider leading-none`}>S</div>
      <div className="flex gap-0.5 mt-1">
        {count >= 3 ? (
          <div className="w-7 h-4 rounded-sm border bg-red-600 border-red-700" />
        ) : (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-4 rounded-sm border ${i < count ? filled : `bg-transparent ${emptyBorder}`}`}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CompetitorBand({
  name,
  scores,
  isBlue,
  isWinner,
}: {
  name: string;
  scores: { wazaAri: number; yuko: number; shido: number };
  isBlue: boolean;
  isWinner: boolean;
}) {
  const baseBg = isBlue ? 'bg-[#0a3a7a]' : 'bg-white';
  const baseText = isBlue ? 'text-white' : 'text-gray-900';
  const stripeBg = isBlue ? 'bg-blue-400' : 'bg-gray-200';
  const winnerRing = isWinner ? 'ring-2 ring-inset ring-green-400' : '';
  const dividerBorder = isBlue ? 'border-blue-300/30' : 'border-gray-300';

  return (
    <div className={`flex items-stretch ${baseBg} ${baseText} ${winnerRing}`}>
      <div className={`${stripeBg} w-1.5`} />
      <div className="flex-1 flex items-center px-3 py-2 min-w-0">
        <span className="font-bold text-sm uppercase truncate">{name || '—'}</span>
      </div>
      <div className={`flex divide-x ${dividerBorder} px-1`}>
        <div className="px-2"><MiniScore label="W" value={scores.wazaAri} isBlue={isBlue} /></div>
        <div className="px-2"><MiniScore label="Y" value={scores.yuko} isBlue={isBlue} /></div>
        <div className="px-2"><MiniShido count={scores.shido} isBlue={isBlue} /></div>
      </div>
    </div>
  );
}

// Render the computed-on-read ETA. Generous rounding because the backend
// ticks ETAs by Competition.matchDuration, not real elapsed time — spurious
// precision would mislead spectators. Mirrors formatEta in PublicSchedule.tsx;
// kept inline rather than imported so this page stays self-contained.
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

function MatCard({ mat }: { mat: MatSchedule }) {
  const match = mat.currentMatch;
  const c1Name = match?.competitor1
    ? `${match.competitor1.lastName} ${match.competitor1.firstName}`
    : 'TBD';
  const c2Name = match?.competitor2
    ? `${match.competitor2.lastName} ${match.competitor2.firstName}`
    : 'TBD';
  const c1Scores = {
    wazaAri: match?.scores?.competitor1?.wazaAri ?? 0,
    yuko: match?.scores?.competitor1?.yuko ?? 0,
    shido: match?.scores?.competitor1?.shido ?? 0,
  };
  const c2Scores = {
    wazaAri: match?.scores?.competitor2?.wazaAri ?? 0,
    yuko: match?.scores?.competitor2?.yuko ?? 0,
    shido: match?.scores?.competitor2?.shido ?? 0,
  };
  // Compare by id, not lastName — two competitors can share a surname,
  // especially in clubs with siblings. The auth endpoint's old code used
  // lastName because it was convenient; the new shape gives us id everywhere.
  const winnerId = match?.winner?.id;
  const winner1 = !!winnerId && winnerId === match?.competitor1?.id;
  const winner2 = !!winnerId && winnerId === match?.competitor2?.id;

  // Only surface ETA on a SCHEDULED current match — "~3 min" alongside an
  // ACTIVE match would be misleading (it's already happening), and on a
  // COMPLETED card it's meaningless. null/undefined etaSeconds hides the pill.
  const showEta =
    match?.status === 'SCHEDULED' && typeof match.etaSeconds === 'number';

  return (
    <div className="bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
        <span className="font-bold">Mat {mat.number}</span>
        {match && (
          <div className="flex items-center gap-2">
            {showEta && (
              <span className="text-[10px] font-mono text-gray-400 tabular-nums">
                {formatEta(match.etaSeconds as number)}
              </span>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                match.status === 'ACTIVE'
                  ? 'bg-green-500 text-white'
                  : match.status === 'COMPLETED'
                    ? 'bg-gray-500 text-white'
                    : 'bg-blue-500 text-white'
              }`}
            >
              {match.status}
              {match.goldenScore && ' · GS'}
            </span>
          </div>
        )}
      </div>

      {!match && (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">No match in progress</div>
      )}

      {match && (
        <div>
          <CompetitorBand name={c1Name} scores={c1Scores} isBlue isWinner={winner1} />
          <CompetitorBand name={c2Name} scores={c2Scores} isBlue={false} isWinner={winner2} />
          {match.status === 'COMPLETED' && match.winMethod && (
            <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-200 text-xs font-bold text-amber-900 text-center uppercase tracking-wider">
              {match.winMethod.replace(/_/g, ' ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type SpectatorView = 'live' | 'standings';

export function SpectatorPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const [competition, setCompetition] = useState<PublicCompetition | null>(null);
  const [mats, setMats] = useState<MatSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  // F7.D2: in-page panel switching, not URL routing. Spectator stays on
  // the same /spectator/:id route across tab presses, so a refresh on
  // either panel returns to "Live Mats" — the most useful default.
  const [view, setView] = useState<SpectatorView>('live');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hit the public/anonymous projections so a spectator URL works without a
  // login. Both endpoints are PII-sanitized in PublicCompetitionsController
  // (no pin, no email) and ship Cache-Control headers for ETag-friendly
  // polling. See competitions.public.controller.ts for the full shape.
  const fetchData = async () => {
    if (!competitionId) return;
    try {
      const [compData, matsData] = await Promise.all([
        api.get<PublicCompetition>(`/public/competitions/${competitionId}`),
        api.get<MatSchedule[]>(`/public/competitions/${competitionId}/schedule`),
      ]);
      setCompetition(compData);
      setMats(matsData);
      setOffline(false);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = setTimeout(() => setOffline(true), 15_000);
    } catch {
      if (!offlineTimerRef.current) {
        offlineTimerRef.current = setTimeout(() => setOffline(true), 15_000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [competitionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  const activeMats = mats.filter((m) => m.currentMatch);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">
          {competition?.name || 'Competition'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {view === 'live' ? 'Live Scores' : 'Standings'}
        </p>
      </header>

      {offline && (
        <div role="alert" aria-live="assertive" className="bg-red-600 text-white px-4 py-2 text-center font-bold uppercase tracking-wider text-xs">
          Offline — reconnecting…
        </div>
      )}

      {/* pb-20 = 56px tab-bar + safe-area + breathing room so the last
          card isn't covered by the fixed nav. */}
      <div className="pb-20">
        {view === 'live' && (
          <div className="p-4 max-w-lg mx-auto">
            {mats.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                No mats configured for this competition
              </div>
            )}
            {mats.length > 0 && activeMats.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                Waiting for matches to begin
              </div>
            )}
            <div className="flex flex-col gap-4">
              {activeMats.map((mat) => (
                <MatCard key={mat.id} mat={mat} />
              ))}
            </div>
          </div>
        )}

        {view === 'standings' && competitionId && (
          <div className="pt-4">
            <SpectatorStandings competitionId={competitionId} />
          </div>
        )}
      </div>

      {/* F7.D2 — bottom-fixed navigation. Page-level navigation, not
          in-page tabs (URL stays the same, but the role is navigational).
          Each button is ≥ 44×44px per Apple HIG. The safe-area inset
          handles iOS notch / home indicator. */}
      <nav
        role="navigation"
        aria-label="Spectator views"
        className="fixed bottom-0 inset-x-0 z-30 flex items-stretch bg-[#0a0f1f] border-t border-gray-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <SpectatorTabButton
          icon={<Activity size={20} />}
          label="Live Mats"
          active={view === 'live'}
          onClick={() => setView('live')}
        />
        <SpectatorTabButton
          icon={<Trophy size={20} />}
          label="Standings"
          active={view === 'standings'}
          onClick={() => setView('standings')}
        />
      </nav>
    </div>
  );
}

function SpectatorTabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-colors"
      style={{
        // 3px top border in IJF gold marks the active tab. Inactive tabs
        // have a transparent border the same width so labels don't shift
        // between states.
        borderTop: active ? '3px solid #c9a64b' : '3px solid transparent',
        color: active ? '#c9a64b' : '#9ca3af',
      }}
    >
      {icon}
      <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
}
