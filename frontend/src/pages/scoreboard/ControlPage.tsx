import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useScoreboard } from '@/hooks/useScoreboard';
import type { MatchState, OsaekomiState } from '@/hooks/useScoreboard';
import { api } from '@/lib/api';

function PinEntry({ onVerified }: { onVerified: (pin: string) => void }) {
  const { matId } = useParams<{ matId: string }>();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ valid: boolean }>(`/mats/${matId}/verify-pin`, { pin });
      if (res.valid) {
        onVerified(pin);
      } else {
        setError('Invalid PIN');
      }
    } catch {
      setError('Failed to verify PIN');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Mat Control Access</h2>
        <p className="text-sm text-gray-500 mb-6">Enter the PIN to control this mat</p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Enter PIN"
          className="w-full text-center text-3xl tracking-[0.5em] px-4 py-4 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
          autoFocus
        />
        {error && <p className="text-red-600 text-sm mt-2 text-center">{error}</p>}
        <button
          type="submit"
          disabled={pin.length < 4 || loading}
          className="w-full mt-6 py-4 bg-blue-600 text-white font-bold rounded-lg text-lg disabled:opacity-40"
        >
          {loading ? 'Verifying...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Presentation-only timer. The countdown lives in ControlBoard so siblings
// (e.g., the Golden Score button) can react to remaining time hitting 0.
function MatchTimer({
  remainingSeconds,
  matchState,
  isRunning,
  onToggle,
}: {
  remainingSeconds: number;
  matchState: MatchState;
  isRunning: boolean;
  onToggle: () => void;
}) {
  const expired = remainingSeconds <= 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`text-5xl font-mono font-bold ${expired ? 'text-red-500' : 'text-white'}`}
      >
        {formatTime(remainingSeconds)}
      </div>
      {matchState.status === 'ACTIVE' && (
        <button
          onClick={onToggle}
          className={`px-6 py-2 rounded font-bold text-sm ${
            isRunning ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'
          }`}
        >
          {isRunning ? 'PAUSE' : 'RESUME'}
        </button>
      )}
    </div>
  );
}

function OsaekomiTimer({ osaekomi }: { osaekomi: OsaekomiState }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (osaekomi.active && osaekomi.startTime) {
      setElapsed(Math.floor((Date.now() - osaekomi.startTime) / 1000));
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - osaekomi.startTime!) / 1000));
      }, 100);
    } else {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [osaekomi.active, osaekomi.startTime]);

  if (!osaekomi.active) return null;

  // Threshold cues mirror the IJF rule:
  //  10s → waza-ari is awarded server-side
  //  20s → ippon and the match ends
  // Showing the "+WAZA-ARI" / "IPPON" hint pre-empts the server event so
  // organizers and competitors see what's about to happen, then the score
  // arrives via socket and the OsaekomiTimer disappears (osaekomi.active=false
  // for ippon, or stays running for waza-ari).
  const reachedIppon = elapsed >= 20;
  const reachedWazaAri = elapsed >= 10 && elapsed < 20;

  let label: string;
  let toneClasses: string;
  if (reachedIppon) {
    label = `OSAEKOMI ${elapsed}s · IPPON`;
    toneClasses = 'bg-red-600 text-white animate-pulse';
  } else if (reachedWazaAri) {
    label = `OSAEKOMI ${elapsed}s · +WAZA-ARI`;
    toneClasses = 'bg-amber-400 text-black animate-pulse';
  } else {
    label = `OSAEKOMI ${elapsed}s`;
    toneClasses = 'bg-amber-500 text-black';
  }

  return (
    <div
      className={`text-center py-3 px-4 rounded-lg font-bold text-2xl tabular-nums ${toneClasses}`}
    >
      {label}
    </div>
  );
}

function ScoreCell({
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
  const borderColor = isBlue ? 'border-blue-300/30' : 'border-gray-300';
  return (
    <div className={`flex flex-col items-center justify-center px-3 border-l ${borderColor} min-w-[64px]`}>
      <div className={`${labelColor} font-bold text-xs uppercase tracking-wider`}>{label}</div>
      <div className={`${valueColor} font-black tabular-nums leading-none mt-1 text-4xl`}>{value}</div>
    </div>
  );
}

function ShidoCell({ count, isBlue }: { count: number; isBlue: boolean }) {
  const labelColor = isBlue ? 'text-amber-300' : 'text-amber-700';
  const filled = 'bg-amber-400 border-amber-400';
  const emptyBorder = isBlue ? 'border-amber-300/40' : 'border-gray-400';
  const borderColor = isBlue ? 'border-blue-300/30' : 'border-gray-300';
  return (
    <div className={`flex flex-col items-center justify-center px-3 border-l ${borderColor} min-w-[64px]`}>
      <div className={`${labelColor} font-bold text-xs uppercase tracking-wider`}>S</div>
      <div className="flex gap-1 mt-2">
        {count >= 3 ? (
          <div className="w-12 h-6 rounded-sm border-2 bg-red-600 border-red-700 shadow-[0_0_10px_rgba(220,38,38,0.7)]" />
        ) : (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-3 h-6 rounded-sm border-2 ${i < count ? filled : `bg-transparent ${emptyBorder}`}`}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CompetitorColumn({
  competitor,
  scores,
  isBlue,
  isActive,
  onIppon,
  onWazaAri,
  onYuko,
  onShido,
}: {
  competitor?: { id: string; firstName: string; lastName: string };
  scores: { wazaAri: number; yuko: number; shido: number };
  isBlue: boolean;
  isActive: boolean;
  onIppon: () => void;
  onWazaAri: () => void;
  onYuko: () => void;
  onShido: () => void;
}) {
  const name = competitor ? `${competitor.lastName} ${competitor.firstName}` : 'TBD';
  const rowBg = isBlue ? 'bg-[#0a3a7a]' : 'bg-white';
  const rowText = isBlue ? 'text-white' : 'text-gray-900';
  const stripeBg = isBlue ? 'bg-blue-400' : 'bg-gray-300';
  const sideLabel = isBlue ? 'BLUE' : 'WHITE';
  const sideLabelColor = isBlue ? 'text-blue-200' : 'text-gray-500';

  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-stretch ${rowBg} ${rowText} rounded-lg overflow-hidden border border-gray-700`}>
        <div className={`${stripeBg} w-2`} />
        <div className="flex-1 flex flex-col justify-center px-3 py-2 min-w-0">
          <div className={`${sideLabelColor} text-[10px] font-bold uppercase tracking-widest`}>
            {sideLabel}
          </div>
          <h2 className="text-lg font-bold uppercase truncate leading-tight">{name}</h2>
        </div>
        <ScoreCell label="W" value={scores.wazaAri} isBlue={isBlue} />
        <ScoreCell label="Y" value={scores.yuko} isBlue={isBlue} />
        <ShidoCell count={scores.shido} isBlue={isBlue} />
      </div>
      <button
        onClick={onIppon}
        disabled={!isActive}
        className="w-full min-h-[60px] bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-30 text-white font-black text-xl rounded-lg transition-colors tracking-wider"
      >
        +IPPON
      </button>
      <div className="flex gap-2 w-full">
        <button
          onClick={onWazaAri}
          disabled={!isActive}
          className="flex-1 min-h-[64px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-30 text-white font-bold text-sm rounded-lg transition-colors"
        >
          +WAZA-ARI
        </button>
        <button
          onClick={onYuko}
          disabled={!isActive}
          className="flex-1 min-h-[64px] bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 disabled:opacity-30 text-white font-bold text-sm rounded-lg transition-colors"
        >
          +YUKO
        </button>
        <button
          onClick={onShido}
          disabled={!isActive}
          className="flex-1 min-h-[64px] bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 disabled:opacity-30 text-black font-bold text-sm rounded-lg transition-colors"
        >
          +SHIDO
        </button>
      </div>
    </div>
  );
}

function ControlBoard({
  matId,
  pin,
}: {
  matId: string;
  pin: string;
}) {
  const { matchState, role, isConnected, osaekomi, actions } = useScoreboard(matId, pin);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  // Timer countdown lives here (not in MatchTimer) so the Golden Score
  // button can be gated on regulation time having actually expired.
  // remainingSeconds: countdown from matchState.duration. 0 = regulation
  // expired (or no match active).
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = matchState?.status === 'ACTIVE';
  const buttonsEnabled = isActive && isConnected;
  // Golden Score is only meaningful AFTER regulation has run out. Hiding it
  // before then matches IJF practice (you can't enter golden score while
  // there's still official time on the clock) and prevents an organizer
  // misclick that would invalidate a referee decision.
  const regulationExpired = isActive && remainingSeconds <= 0;

  // Reset the timer to the match's duration whenever the match changes
  // or transitions into ACTIVE. Outside ACTIVE we hold remaining at 0.
  useEffect(() => {
    if (matchState?.status === 'ACTIVE') {
      setRemainingSeconds(matchState.duration || 240);
    } else {
      setRemainingSeconds(0);
    }
  }, [matchState?.id, matchState?.status, matchState?.duration]);

  // Run the countdown only while running AND active. Match leaving ACTIVE
  // (manual end OR osaekomi-triggered ippon) flips both flags via the
  // useEffect below — interval clears, remaining freezes.
  useEffect(() => {
    const shouldRun = timerRunning && matchState?.status === 'ACTIVE';
    if (shouldRun) {
      timerIntervalRef.current = setInterval(() => {
        setRemainingSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning, matchState?.status]);

  useEffect(() => {
    if (matchState && matchState.status !== 'ACTIVE') {
      setTimerRunning(false);
    }
  }, [matchState?.id, matchState?.status]);

  const handleStartMatch = useCallback(() => {
    if (matchState) {
      actions.startMatch(matchState.id);
      setTimerRunning(true);
    }
  }, [matchState, actions]);

  const handleEndMatch = useCallback(
    (winnerId: string, winMethod: string) => {
      if (matchState) {
        actions.endMatch(matchState.id, winnerId, winMethod);
        setTimerRunning(false);
        setShowEndModal(false);
      }
    },
    [matchState, actions],
  );

  const handleOsaekomi = useCallback(
    (competitorId: string) => {
      if (!matchState) return;
      if (osaekomi.active) {
        actions.stopOsaekomi(matchState.id);
      } else {
        actions.startOsaekomi(matchState.id, competitorId);
      }
    },
    [matchState, osaekomi.active, actions],
  );

  const handleGoldenScore = useCallback(() => {
    if (matchState) {
      actions.startGoldenScore(matchState.id);
      setTimerRunning(true);
    }
  }, [matchState, actions]);

  if (role === null) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center text-white text-xl">
        Connecting...
      </div>
    );
  }

  if (role === 'viewer') {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center text-white text-xl">
        Access denied. Invalid PIN.
      </div>
    );
  }

  const rawScores = matchState?.scores;
  const scores = {
    competitor1: {
      wazaAri: rawScores?.competitor1?.wazaAri ?? 0,
      yuko: rawScores?.competitor1?.yuko ?? 0,
      shido: rawScores?.competitor1?.shido ?? 0,
    },
    competitor2: {
      wazaAri: rawScores?.competitor2?.wazaAri ?? 0,
      yuko: rawScores?.competitor2?.yuko ?? 0,
      shido: rawScores?.competitor2?.shido ?? 0,
    },
  };

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-white font-bold">Mat {matId.slice(0, 6)}</span>
        <span className="text-sm text-gray-300">
          {matchState?.status || 'NO MATCH'}{' '}
          {matchState?.goldenScore && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-black font-bold rounded text-xs">
              GS
            </span>
          )}
        </span>
        <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
      </div>

      {!isConnected && (
        <div role="alert" aria-live="assertive" className="bg-red-600 text-white px-4 py-2 text-center font-bold uppercase tracking-widest text-sm">
          Connection lost — your scores will not save until reconnected
        </div>
      )}

      {!matchState && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-lg">
          No match assigned to this mat
        </div>
      )}

      {matchState && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          <div className="flex-1 grid grid-cols-2 gap-6">
            <CompetitorColumn
              competitor={matchState.competitor1}
              scores={scores.competitor1}
              isBlue
              isActive={buttonsEnabled}
              onIppon={() => matchState.competitor1 && actions.scoreIppon(matchState.competitor1.id)}
              onWazaAri={() => matchState.competitor1 && actions.scoreWazaAri(matchState.competitor1.id)}
              onYuko={() => matchState.competitor1 && actions.scoreYuko(matchState.competitor1.id)}
              onShido={() => matchState.competitor1 && actions.scoreShido(matchState.competitor1.id)}
            />
            <CompetitorColumn
              competitor={matchState.competitor2}
              scores={scores.competitor2}
              isBlue={false}
              isActive={buttonsEnabled}
              onIppon={() => matchState.competitor2 && actions.scoreIppon(matchState.competitor2.id)}
              onWazaAri={() => matchState.competitor2 && actions.scoreWazaAri(matchState.competitor2.id)}
              onYuko={() => matchState.competitor2 && actions.scoreYuko(matchState.competitor2.id)}
              onShido={() => matchState.competitor2 && actions.scoreShido(matchState.competitor2.id)}
            />
          </div>

          <div className="flex flex-col items-center gap-3">
            <MatchTimer
              remainingSeconds={remainingSeconds}
              matchState={matchState}
              isRunning={timerRunning}
              onToggle={() => setTimerRunning(!timerRunning)}
            />
            <OsaekomiTimer osaekomi={osaekomi} />
          </div>

          <div className="flex flex-col gap-3">
            {isActive && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => matchState.competitor1 && handleOsaekomi(matchState.competitor1.id)}
                  className={`min-h-[60px] font-bold text-base rounded-lg ${
                    osaekomi.active && osaekomi.competitorId === matchState.competitor1?.id
                      ? 'bg-amber-300 text-black'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {osaekomi.active && osaekomi.competitorId === matchState.competitor1?.id
                    ? 'STOP OSAEKOMI'
                    : `OSAEKOMI ${matchState.competitor1?.lastName || ''}`}
                </button>
                <button
                  onClick={() => matchState.competitor2 && handleOsaekomi(matchState.competitor2.id)}
                  className={`min-h-[60px] font-bold text-base rounded-lg ${
                    osaekomi.active && osaekomi.competitorId === matchState.competitor2?.id
                      ? 'bg-amber-300 text-black'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {osaekomi.active && osaekomi.competitorId === matchState.competitor2?.id
                    ? 'STOP OSAEKOMI'
                    : `OSAEKOMI ${matchState.competitor2?.lastName || ''}`}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {matchState.status === 'SCHEDULED' && (
                <button
                  onClick={handleStartMatch}
                  className="col-span-2 min-h-[60px] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-xl rounded-lg"
                >
                  START MATCH
                </button>
              )}
              {/* Golden Score is only shown after regulation time hits 0,
                  matching IJF practice — you can't enter golden score while
                  there's still official time on the clock. */}
              {isActive && regulationExpired && !matchState.goldenScore && (
                <button
                  onClick={handleGoldenScore}
                  className="min-h-[60px] bg-yellow-600 hover:bg-yellow-700 text-white font-bold text-base rounded-lg animate-pulse"
                >
                  GOLDEN SCORE
                </button>
              )}
              {isActive && (
                <button
                  onClick={() => setShowEndModal(true)}
                  className={`min-h-[60px] bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-base rounded-lg ${
                    regulationExpired && !matchState.goldenScore ? '' : 'col-span-2'
                  }`}
                >
                  END MATCH
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showEndModal && matchState && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">End Match - Select Winner</h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() =>
                  matchState.competitor1 &&
                  handleEndMatch(matchState.competitor1.id, 'DECISION')
                }
                className="py-4 bg-blue-600 text-white font-bold rounded-lg text-lg"
              >
                {matchState.competitor1?.lastName || 'Competitor 1'} WINS
              </button>
              <button
                onClick={() =>
                  matchState.competitor2 &&
                  handleEndMatch(matchState.competitor2.id, 'DECISION')
                }
                className="py-4 bg-blue-600 text-white font-bold rounded-lg text-lg"
              >
                {matchState.competitor2?.lastName || 'Competitor 2'} WINS
              </button>
              <button
                onClick={() => setShowEndModal(false)}
                className="py-3 bg-gray-600 text-white font-bold rounded-lg"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ControlPage() {
  const { matId } = useParams<{ matId: string }>();
  const [pin, setPin] = useState<string | null>(null);

  if (!matId) return null;

  if (!pin) {
    return <PinEntry onVerified={setPin} />;
  }

  return <ControlBoard matId={matId} pin={pin} />;
}
