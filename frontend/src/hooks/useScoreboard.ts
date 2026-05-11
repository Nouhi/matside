import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// MUST MATCH backend/src/scoreboard/scoreboard.types.ts. The frontend lives
// in a separate package; this monorepo has no shared types workspace yet.
// A type-mirror test in useScoreboard.test.ts compares this shape against
// the inferred backend shape so drift fails type-check.
export interface CompetitorScore {
  wazaAri: number;
  yuko: number;
  shido: number;
}

export interface MatchScores {
  competitor1: CompetitorScore;
  competitor2: CompetitorScore;
}

// MUST MATCH the Prisma `WinMethod` enum in backend/prisma/schema.prisma.
// Literal union (not `string`) so consumers (e.g. WinBanner switch in
// DisplayPage) can exhaustively branch with type-safety. The matching
// runtime validation lives at the socket boundary in scoreboard.gateway.ts.
export type WinMethod =
  | 'IPPON'
  | 'WAZA_ARI'
  | 'DECISION'
  | 'HANSOKU_MAKE'
  | 'FUSEN_GACHI'
  | 'KIKEN_GACHI';

interface MatchCompetitor {
  id: string;
  firstName: string;
  lastName: string;
  club?: string;
}

export interface MatchState {
  id: string;
  status: string;
  competitor1?: MatchCompetitor;
  competitor2?: MatchCompetitor;
  winner?: { id: string; firstName: string; lastName: string };
  winMethod?: WinMethod;
  scores: MatchScores;
  duration: number;
  goldenScore: boolean;
  category?: { name: string };
}

export interface OsaekomiState {
  active: boolean;
  competitorId?: string;
  startTime?: number;
}

export function useScoreboard(matId: string, pin?: string) {
  const socketRef = useRef<Socket | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [role, setRole] = useState<'controller' | 'viewer' | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [osaekomi, setOsaekomi] = useState<OsaekomiState>({ active: false });

  useEffect(() => {
    const wsUrl = import.meta.env.DEV ? 'http://localhost:3000/scoreboard' : '/scoreboard';
    const socket = io(wsUrl, {
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-mat', { matId, pin });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('role', (data: { role: 'controller' | 'viewer' }) => {
      setRole(data.role);
    });

    socket.on('match-state', (state: MatchState) => {
      setMatchState(state);
    });

    socket.on('score-update', (data: { matchId: string; scores: MatchScores }) => {
      setMatchState((prev) => {
        if (!prev || prev.id !== data.matchId) return prev;
        return { ...prev, scores: data.scores };
      });
    });

    socket.on('match-started', (_data: { matchId: string }) => {
      setMatchState((prev) => {
        if (!prev) return prev;
        return { ...prev, status: 'ACTIVE' };
      });
    });

    socket.on('match-ended', (data: { matchId: string; winnerId: string; winMethod: string }) => {
      setMatchState((prev) => {
        if (!prev || prev.id !== data.matchId) return prev;
        const winner =
          prev.competitor1?.id === data.winnerId
            ? prev.competitor1
            : prev.competitor2?.id === data.winnerId
              ? prev.competitor2
              : undefined;
        return { ...prev, status: 'COMPLETED', winner, winMethod: data.winMethod };
      });
      setOsaekomi({ active: false });
    });

    socket.on('osaekomi-started', (data: { matchId: string; competitorId: string; startTime: number }) => {
      setOsaekomi({ active: true, competitorId: data.competitorId, startTime: data.startTime });
    });

    socket.on('osaekomi-stopped', () => {
      setOsaekomi({ active: false });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matId, pin]);

  const scoreWazaAri = useCallback(
    (competitorId: string) => {
      socketRef.current?.emit('score-event', {
        matchId: matchState?.id,
        event: { type: 'WAZA_ARI', competitorId, timestamp: Date.now() },
      });
    },
    [matchState?.id],
  );

  const scoreYuko = useCallback(
    (competitorId: string) => {
      socketRef.current?.emit('score-event', {
        matchId: matchState?.id,
        event: { type: 'YUKO', competitorId, timestamp: Date.now() },
      });
    },
    [matchState?.id],
  );

  const scoreShido = useCallback(
    (competitorId: string) => {
      socketRef.current?.emit('score-event', {
        matchId: matchState?.id,
        event: { type: 'SHIDO', competitorId, timestamp: Date.now() },
      });
    },
    [matchState?.id],
  );

  const scoreIppon = useCallback(
    (competitorId: string) => {
      socketRef.current?.emit('score-event', {
        matchId: matchState?.id,
        event: { type: 'IPPON', competitorId, timestamp: Date.now() },
      });
    },
    [matchState?.id],
  );

  const startMatch = useCallback((matchId: string) => {
    socketRef.current?.emit('start-match', { matchId });
  }, []);

  const endMatch = useCallback((matchId: string, winnerId: string, winMethod: string) => {
    socketRef.current?.emit('end-match', { matchId, winnerId, winMethod });
  }, []);

  const startOsaekomi = useCallback((matchId: string, competitorId: string) => {
    socketRef.current?.emit('start-osaekomi', { matchId, competitorId });
  }, []);

  const stopOsaekomi = useCallback((matchId: string) => {
    socketRef.current?.emit('stop-osaekomi', { matchId });
  }, []);

  const startGoldenScore = useCallback((matchId: string) => {
    socketRef.current?.emit('start-golden-score', { matchId });
  }, []);

  return {
    matchState,
    role,
    isConnected,
    osaekomi,
    actions: {
      scoreWazaAri,
      scoreYuko,
      scoreShido,
      scoreIppon,
      startMatch,
      endMatch,
      startOsaekomi,
      stopOsaekomi,
      startGoldenScore,
    },
  };
}
