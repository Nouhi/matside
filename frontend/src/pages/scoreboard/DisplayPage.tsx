import { useParams } from 'react-router-dom';
import { useScoreboard } from '@/hooks/useScoreboard';
import type { OsaekomiState } from '@/hooks/useScoreboard';
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

  // Threshold cues match the IJF rule: 10s = waza-ari, 20s = ippon.
  // The matching score event arrives via socket from the server's
  // authoritative timer; the label change here is a visual heads-up so
  // spectators see it coming.
  const reachedIppon = elapsed >= 20;
  const reachedWazaAri = elapsed >= 10 && elapsed < 20;

  let label: string;
  let bg: string;
  if (reachedIppon) {
    label = `OSAEKOMI ${elapsed} · IPPON`;
    bg = 'bg-red-600 text-white';
  } else if (reachedWazaAri) {
    label = `OSAEKOMI ${elapsed} · +WAZA-ARI`;
    bg = 'bg-amber-400 text-black';
  } else {
    label = `OSAEKOMI ${elapsed}`;
    bg = 'bg-amber-500 text-black';
  }

  return (
    <div
      className={`absolute inset-x-0 top-1/2 -translate-y-1/2 py-3 flex items-center justify-center animate-pulse z-10 ${bg}`}
    >
      <span className="text-[clamp(28px,4vw,56px)] font-mono font-black tracking-widest tabular-nums">
        {label}
      </span>
    </div>
  );
}

function DisconnectBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="absolute inset-x-0 top-4 z-40 flex items-center justify-center pointer-events-none"
    >
      <div className="bg-red-600 text-white px-6 py-2 rounded-full font-bold uppercase shadow-lg flex items-center gap-3" style={{ fontSize: 'clamp(14px, 1.4vw, 22px)', letterSpacing: '0.18em' }}>
        <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
        Connection lost — reconnecting…
      </div>
    </div>
  );
}

function WinBanner({ winMethod }: { winMethod?: string }) {
  if (!winMethod) return null;

  const isHansoku = winMethod === 'HANSOKU_MAKE';
  const borderColor = isHansoku ? 'border-red-500' : 'border-yellow-400';
  const textColor = isHansoku ? 'text-red-500' : 'text-yellow-400';
  const glow = isHansoku
    ? 'drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]'
    : 'drop-shadow-[0_0_20px_rgba(250,204,21,0.55)]';

  return (
    <div className={`bg-black border-t-2 ${borderColor} flex items-center justify-center py-3 animate-pulse`}>
      <span
        className={`font-black ${textColor} uppercase ${glow}`}
        style={{ fontSize: 'clamp(36px, 6vw, 88px)', lineHeight: 1, letterSpacing: '0.32em' }}
      >
        {winMethod.replace(/_/g, ' ')}
      </span>
    </div>
  );
}

function IpponOverlay({ onDone }: { onDone: () => void }) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none ippon-overlay-bg"
      onAnimationEnd={onDone}
    >
      <div className="ippon-text-anim">
        <span
          className="font-black uppercase text-yellow-300"
          style={{
            fontSize: 'clamp(120px, 24vw, 420px)',
            lineHeight: 1,
            letterSpacing: '0.08em',
            WebkitTextStroke: '4px rgba(0,0,0,0.45)',
          }}
        >
          IPPON
        </span>
      </div>
    </div>
  );
}

function ScoreCell({
  label,
  value,
  competitorName,
  isWhiteRow,
}: {
  label: string;
  value: number;
  competitorName: string;
  isWhiteRow: boolean;
}) {
  const labelColor = isWhiteRow ? 'text-gray-600' : 'text-white';
  const valueColor = isWhiteRow ? 'text-gray-900' : 'text-white';
  const borderColor = isWhiteRow ? 'border-gray-300' : 'border-white/15';

  const fullLabel: Record<string, string> = {
    W: 'waza-ari',
    Y: 'yuko',
  };
  const announcement = `${competitorName}: ${fullLabel[label] ?? label} ${value}`;

  const prevValueRef = useRef(value);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (value > prevValueRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      prevValueRef.current = value;
      return () => clearTimeout(t);
    }
    prevValueRef.current = value;
  }, [value]);

  return (
    <div
      className={`flex flex-col items-center justify-center border-l ${borderColor} px-4 ${pulse ? 'score-cell-pulse' : ''}`}
      style={{ width: 'clamp(110px, 12vw, 220px)' }}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <div
        aria-hidden="true"
        className={`${labelColor} font-bold uppercase`}
        style={{ fontSize: 'clamp(18px, 1.9vw, 32px)', letterSpacing: '0.18em', opacity: 0.6 }}
      >
        {label}
      </div>
      <div
        aria-hidden="true"
        className={`${valueColor} font-black tabular-nums leading-none mt-2`}
        style={{ fontSize: 'clamp(70px, 11vw, 200px)' }}
      >
        {value}
      </div>
    </div>
  );
}

function ShidoCell({
  count,
  competitorName,
  isWhiteRow,
}: {
  count: number;
  competitorName: string;
  isWhiteRow: boolean;
}) {
  const labelColor = isWhiteRow ? 'text-amber-700' : 'text-amber-200';
  const filled = 'bg-amber-400 border-amber-400';
  const emptyBorder = isWhiteRow ? 'border-gray-400' : 'border-amber-400/45';
  const borderColor = isWhiteRow ? 'border-gray-300' : 'border-white/15';

  const prevCountRef = useRef(count);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (count > prevCountRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      prevCountRef.current = count;
      return () => clearTimeout(t);
    }
    prevCountRef.current = count;
  }, [count]);

  return (
    <div
      className={`flex flex-col items-center justify-center border-l ${borderColor} px-4 ${pulse ? 'score-cell-pulse' : ''}`}
      style={{ width: 'clamp(100px, 11vw, 180px)' }}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {competitorName}: shido {count} of 3
      </span>
      <div
        aria-hidden="true"
        className={`${labelColor} font-bold uppercase`}
        style={{ fontSize: 'clamp(18px, 1.9vw, 32px)', letterSpacing: '0.18em', opacity: 0.85 }}
      >
        S
      </div>
      <div aria-hidden="true" className="flex gap-2.5 mt-3">
        {count >= 3 ? (
          <div
            className="bg-red-600 border-2 border-red-700 shadow-[0_0_16px_rgba(220,38,38,0.75)]"
            style={{
              width: 'clamp(64px, 6.6vw, 110px)',
              height: 'clamp(36px, 4vw, 60px)',
              borderRadius: '4px',
            }}
          />
        ) : (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className={`border-2 ${i < count ? filled : `bg-transparent ${emptyBorder}`}`}
              style={{
                width: 'clamp(18px, 1.8vw, 30px)',
                height: 'clamp(36px, 4vw, 60px)',
                borderRadius: '3px',
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CompetitorRow({
  name,
  club,
  scores,
  isWinner,
  isBlue,
}: {
  name: string;
  club?: string;
  scores: { wazaAri: number; yuko: number; shido: number };
  isWinner: boolean;
  isBlue: boolean;
}) {
  const baseBg = isBlue ? 'bg-[#0a3a7a]' : 'bg-white';
  const baseText = isBlue ? 'text-white' : 'text-gray-900';
  const subText = isBlue ? 'text-blue-200' : 'text-gray-500';
  const stripeBg = isBlue ? 'bg-blue-400' : 'bg-gray-200';
  const winnerRing = isWinner ? 'ring-4 ring-inset ring-green-400' : '';

  return (
    <div className={`flex-1 flex items-stretch ${baseBg} ${baseText} ${winnerRing} min-h-0`}>
      <div className={`${stripeBg}`} style={{ width: 'clamp(8px, 0.8vw, 16px)' }} />
      <div className="flex-1 flex flex-col justify-center px-6 min-w-0">
        <h2
          className={`font-black uppercase tracking-wide truncate`}
          style={{ fontSize: 'clamp(48px, 7vw, 110px)', lineHeight: 1 }}
        >
          {name || '—'}
        </h2>
        {club && (
          <p
            className={`${subText} font-medium uppercase tracking-wider mt-2 truncate`}
            style={{ fontSize: 'clamp(16px, 1.6vw, 26px)' }}
          >
            {club}
          </p>
        )}
      </div>
      <ScoreCell label="W" value={scores.wazaAri} competitorName={name} isWhiteRow={!isBlue} />
      <ScoreCell label="Y" value={scores.yuko} competitorName={name} isWhiteRow={!isBlue} />
      <ShidoCell count={scores.shido} competitorName={name} isWhiteRow={!isBlue} />
    </div>
  );
}

function CenterBar({
  timer,
  goldenScore,
}: {
  timer: number;
  goldenScore: boolean;
}) {
  return (
    <div className="flex-1 bg-black flex items-center justify-center px-6 relative gap-8 min-h-0">
      {goldenScore && (
        <span
          className="font-black text-yellow-400 uppercase tracking-wider"
          style={{ fontSize: 'clamp(40px, 5vw, 80px)' }}
        >
          GS
        </span>
      )}
      <span
        className="font-mono font-black text-white tabular-nums"
        style={{ fontSize: 'clamp(120px, 22vw, 320px)', lineHeight: 1 }}
      >
        {formatTime(timer)}
      </span>
    </div>
  );
}

export function DisplayPage() {
  const { matId } = useParams<{ matId: string }>();
  const { matchState, osaekomi, isConnected } = useScoreboard(matId || '');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [ipponPlaying, setIpponPlaying] = useState(false);
  const lastIpponMatchRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      matchState?.status === 'COMPLETED' &&
      matchState.winMethod === 'IPPON' &&
      matchState.id !== lastIpponMatchRef.current
    ) {
      lastIpponMatchRef.current = matchState.id;
      setIpponPlaying(true);
    }
  }, [matchState?.id, matchState?.status, matchState?.winMethod]);

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

  const comp1Name = matchState?.competitor1
    ? `${matchState.competitor1.lastName} ${matchState.competitor1.firstName}`
    : '';
  const comp2Name = matchState?.competitor2
    ? `${matchState.competitor2.lastName} ${matchState.competitor2.firstName}`
    : '';

  // Bundle 1 / ENG-Q2: MatchState now declares these directly; backend's
  // getMatState include returns club and category, so the cast era is over.
  const comp1Club = matchState?.competitor1?.club;
  const comp2Club = matchState?.competitor2?.club;
  const categoryName = matchState?.category?.name;

  const winner1 = matchState?.winner?.id === matchState?.competitor1?.id;
  const winner2 = matchState?.winner?.id === matchState?.competitor2?.id;

  if (!matchState) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <span className="text-4xl text-gray-600 font-bold uppercase tracking-widest">Waiting for match</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col relative overflow-hidden">
      <CompetitorRow
        name={comp1Name}
        club={comp1Club}
        scores={scores.competitor1}
        isWinner={winner1}
        isBlue
      />

      <CenterBar timer={timerSeconds} goldenScore={!!matchState.goldenScore} />

      <CompetitorRow
        name={comp2Name}
        club={comp2Club}
        scores={scores.competitor2}
        isWinner={winner2}
        isBlue={false}
      />

      {categoryName && (
        <div
          className="bg-slate-800 text-slate-300 font-bold uppercase text-center py-2"
          style={{ fontSize: 'clamp(14px, 1.6vw, 24px)', letterSpacing: '0.3em' }}
        >
          {categoryName}
        </div>
      )}

      {matchState.status === 'COMPLETED' && !ipponPlaying && (
        <WinBanner winMethod={matchState.winMethod} />
      )}

      <OsaekomiBar osaekomi={osaekomi} />

      <DisconnectBanner visible={!isConnected} />

      {ipponPlaying && <IpponOverlay onDone={() => setIpponPlaying(false)} />}
    </div>
  );
}
