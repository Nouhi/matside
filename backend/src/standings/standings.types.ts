// MatchScores is owned by the scoreboard module (scoreboard writes the JSON,
// standings only reads it). Importing here keeps the two views in lock-step;
// previously two slightly-different shapes coexisted (yuko required vs
// optional) and were glued by an `as unknown as` cast in scoreboard.service.ts.
export type { MatchScores } from '../scoreboard/scoreboard.types';
import type { MatchScores } from '../scoreboard/scoreboard.types';

export interface StandingMatch {
  competitor1Id: string | null;
  competitor2Id: string | null;
  winnerId: string | null;
  winMethod: string | null;
  status: string;
  round: number;
  poolPosition: number;
  scores: MatchScores | null;
  phase?: string | null;
  poolGroup?: string | null;
}

export interface CompetitorStats {
  competitorId: string;
  wins: number;
  losses: number;
  ippons: number;
  wazaAriWins: number;
  shidosReceived: number;
  matchesPlayed: number;
}

export interface RoundRobinStanding extends CompetitorStats {
  rank: number;
  tiedWith: string[];
}

export interface CategoryStandings {
  categoryId: string;
  // Mirrors the Prisma BracketType enum. POOLS and GRAND_SLAM produce
  // post-pool elimination brackets; the standings service still has to
  // describe them even if the eliminator format is what spectators see.
  bracketType: 'ROUND_ROBIN' | 'POOLS' | 'SINGLE_REPECHAGE' | 'DOUBLE_REPECHAGE' | 'GRAND_SLAM';
  status: 'IN_PROGRESS' | 'COMPLETE' | 'PENDING_PLAYOFF';
  standings: RoundRobinStanding[];
}
