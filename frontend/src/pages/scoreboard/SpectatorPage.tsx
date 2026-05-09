import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface MatState {
  id: string;
  number: number;
  currentMatchId: string | null;
  currentMatch?: {
    id: string;
    status: string;
    competitor1?: { firstName: string; lastName: string };
    competitor2?: { firstName: string; lastName: string };
    winner?: { firstName: string; lastName: string };
    winMethod?: string;
    scores?: {
      competitor1: { wazaAri: number; yuko?: number; shido: number };
      competitor2: { wazaAri: number; yuko?: number; shido: number };
    };
    goldenScore?: boolean;
  };
}

interface Competition {
  id: string;
  name: string;
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

function MatCard({ mat }: { mat: MatState }) {
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
  const winner1 = match?.winner?.lastName === match?.competitor1?.lastName;
  const winner2 = match?.winner?.lastName === match?.competitor2?.lastName;

  return (
    <div className="bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
        <span className="font-bold">Mat {mat.number}</span>
        {match && (
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

export function SpectatorPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [mats, setMats] = useState<MatState[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = async () => {
    if (!competitionId) return;
    try {
      const [compData, matsData] = await Promise.all([
        api.get<Competition>(`/competitions/${competitionId}`),
        api.get<MatState[]>(`/competitions/${competitionId}/mats`),
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

  const activeMats = mats.filter((m) => m.currentMatchId);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">
          {competition?.name || 'Competition'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Live Scores</p>
      </header>

      {offline && (
        <div role="alert" aria-live="assertive" className="bg-red-600 text-white px-4 py-2 text-center font-bold uppercase tracking-wider text-xs">
          Offline — reconnecting…
        </div>
      )}

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
          {mats
            .filter((m) => m.currentMatchId)
            .map((mat) => (
              <MatCard key={mat.id} mat={mat} />
            ))}
        </div>
      </div>
    </div>
  );
}
