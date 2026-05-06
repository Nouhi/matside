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
      competitor1: { wazaAri: number; shido: number };
      competitor2: { wazaAri: number; shido: number };
    };
    goldenScore?: boolean;
  };
}

interface Competition {
  id: string;
  name: string;
}

function ScoreIndicator({ wazaAri, shido }: { wazaAri: number; shido: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border border-gray-400 ${
              i < wazaAri ? 'bg-green-500 border-green-500' : ''
            }`}
          />
        ))}
      </div>
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`w-3 h-4 rounded-sm ${
              i < shido ? 'bg-yellow-400' : 'border border-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function MatCard({ mat }: { mat: MatState }) {
  const match = mat.currentMatch;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="font-bold text-gray-900">Mat {mat.number}</span>
        {match && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              match.status === 'ACTIVE'
                ? 'bg-green-100 text-green-700'
                : match.status === 'COMPLETED'
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-blue-100 text-blue-700'
            }`}
          >
            {match.status}
            {match.goldenScore && ' (GS)'}
          </span>
        )}
      </div>

      {!match && (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">No match in progress</div>
      )}

      {match && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span
              className={`font-medium text-sm ${
                match.winner?.lastName === match.competitor1?.lastName
                  ? 'text-green-700 font-bold'
                  : 'text-gray-900'
              }`}
            >
              {match.competitor1 ? `${match.competitor1.lastName} ${match.competitor1.firstName}` : 'TBD'}
            </span>
            {match.scores && (
              <ScoreIndicator
                wazaAri={match.scores.competitor1.wazaAri}
                shido={match.scores.competitor1.shido}
              />
            )}
          </div>
          <div className="flex items-center justify-between">
            <span
              className={`font-medium text-sm ${
                match.winner?.lastName === match.competitor2?.lastName
                  ? 'text-green-700 font-bold'
                  : 'text-gray-900'
              }`}
            >
              {match.competitor2 ? `${match.competitor2.lastName} ${match.competitor2.firstName}` : 'TBD'}
            </span>
            {match.scores && (
              <ScoreIndicator
                wazaAri={match.scores.competitor2.wazaAri}
                shido={match.scores.competitor2.shido}
              />
            )}
          </div>
          {match.status === 'COMPLETED' && match.winMethod && (
            <div className="mt-2 text-xs text-gray-500 text-center">
              {match.winMethod.replace('_', ' ')}
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async () => {
    if (!competitionId) return;
    try {
      const [compData, matsData] = await Promise.all([
        api.get<Competition>(`/competitions/${competitionId}`),
        api.get<MatState[]>(`/competitions/${competitionId}/mats`),
      ]);
      setCompetition(compData);
      setMats(matsData);
    } catch {
      // silently retry on next interval
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
