import { useParams } from 'react-router-dom';
import { useScoreboard, OsaekomiState } from '@/hooks/useScoreboard';
import { useState, useEffect, useRef } from 'react';

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function OsaekomiBar({ osaekomi }: { osaekomi: OsaekomiState }) {
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

  return (
    <div className="w-full bg-amber-500 py-3 flex items-center justify-center animate-pulse">
      <span className="text-4xl font-mono font-bold text-black">
        OSAEKOMI {elapsed}
      </span>
    </div>
  );
}

function WinOverlay({ winMethod }: { winMethod?: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [winMethod]);

  if (!visible || !winMethod) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
      <div className="text-[120px] font-black text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.5)] animate-pulse">
        {winMethod.replace('_', ' ')}
      </div>
    </div>
  );
}

function CompetitorRow({
  name,
  scores,
  isWinner,
  position,
}: {
  name: string;
  scores: { wazaAri: number; shido: number };
  isWinner: boolean;
  position: 'top' | 'bottom';
}) {
  return (
    <div
      className={`flex items-center justify-between px-8 transition-colors duration-500 ${
        isWinner
          ? 'bg-green-700'
          : position === 'top'
            ? 'bg-gray-900'
            : 'bg-gray-800'
      }`}
      style={{ height: '35%' }}
    >
      <h2 className="text-[clamp(36px,6vw,72px)] font-bold text-white uppercase tracking-wide truncate max-w-[60%]">
        {name}
      </h2>
      <div className="flex items-center gap-6">
        <div className="flex gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`w-[clamp(32px,4vw,56px)] h-[clamp(32px,4vw,56px)] rounded-full border-4 border-white ${
                i < scores.wazaAri ? 'bg-green-500' : 'bg-transparent'
              }`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-[clamp(20px,2.5vw,36px)] h-[clamp(32px,4vw,48px)] rounded-sm ${
                i < scores.shido ? 'bg-yellow-400' : 'border-2 border-yellow-400/30'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DisplayPage() {
  const { matId } = useParams<{ matId: string }>();
  const { matchState, osaekomi } = useScoreboard(matId || '');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (matchState?.status === 'ACTIVE') {
      if (!startedAtRef.current) {
        startedAtRef.current = Date.now();
        setTimerSeconds(matchState.duration || 240);
      }
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current!) / 1000);
        const remaining = (matchState.duration || 240) - elapsed;
        setTimerSeconds(Math.max(0, remaining));
      }, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (matchState?.status !== 'ACTIVE') {
        startedAtRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [matchState?.status, matchState?.id, matchState?.duration]);

  if (!matId) return null;

  const scores = matchState?.scores || {
    competitor1: { wazaAri: 0, shido: 0 },
    competitor2: { wazaAri: 0, shido: 0 },
  };

  const comp1Name = matchState?.competitor1
    ? `${matchState.competitor1.lastName} ${matchState.competitor1.firstName}`
    : '';
  const comp2Name = matchState?.competitor2
    ? `${matchState.competitor2.lastName} ${matchState.competitor2.firstName}`
    : '';

  const winner1 = matchState?.winner?.id === matchState?.competitor1?.id;
  const winner2 = matchState?.winner?.id === matchState?.competitor2?.id;

  if (!matchState) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <span className="text-4xl text-gray-600 font-bold">WAITING FOR MATCH</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col relative overflow-hidden">
      {matchState.status === 'COMPLETED' && <WinOverlay winMethod={matchState.winMethod} />}

      <CompetitorRow
        name={comp1Name}
        scores={scores.competitor1}
        isWinner={winner1}
        position="top"
      />

      <div className="flex-1 flex items-center justify-center relative bg-black">
        <OsaekomiBar osaekomi={osaekomi} />
        {!osaekomi.active && (
          <div className="flex items-center gap-6">
            <span className="text-[clamp(80px,12vw,140px)] font-mono font-bold text-white">
              {formatTime(timerSeconds)}
            </span>
            {matchState.goldenScore && (
              <span className="text-[clamp(32px,4vw,56px)] font-black text-yellow-400">
                GS
              </span>
            )}
          </div>
        )}
      </div>

      <CompetitorRow
        name={comp2Name}
        scores={scores.competitor2}
        isWinner={winner2}
        position="bottom"
      />
    </div>
  );
}
