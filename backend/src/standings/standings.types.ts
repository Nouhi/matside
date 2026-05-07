export interface MatchScores {
  competitor1: { wazaAri: number; yuko?: number; shido: number };
  competitor2: { wazaAri: number; yuko?: number; shido: number };
}

export interface StandingMatch {
  competitor1Id: string | null;
  competitor2Id: string | null;
  winnerId: string | null;
  winMethod: string | null;
  status: string;
  round: number;
  poolPosition: number;
  scores: MatchScores | null;
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
  bracketType: 'ROUND_ROBIN' | 'SINGLE_REPECHAGE' | 'DOUBLE_REPECHAGE';
  status: 'IN_PROGRESS' | 'COMPLETE' | 'PENDING_PLAYOFF';
  standings: RoundRobinStanding[];
}
