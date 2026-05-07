import { StandingMatch } from './standings.types';

export interface EliminationStanding {
  rank: number;
  competitorId: string;
}

export interface EliminationResult {
  status: 'IN_PROGRESS' | 'COMPLETE';
  standings: EliminationStanding[];
  totalRounds: number;
}

export function totalRoundsFor(competitorCount: number): number {
  if (competitorCount <= 1) return 0;
  return Math.ceil(Math.log2(competitorCount));
}

function getMatch(matches: StandingMatch[], round: number, position: number) {
  return matches.find((m) => m.round === round && m.poolPosition === position);
}

function getRoundMatches(matches: StandingMatch[], round: number) {
  return matches.filter((m) => m.round === round);
}

function loserId(match: StandingMatch): string | null {
  if (match.status !== 'COMPLETED' || !match.winnerId) return null;
  if (!match.competitor1Id || !match.competitor2Id) return null;
  return match.winnerId === match.competitor1Id
    ? match.competitor2Id
    : match.competitor1Id;
}

export function computeEliminationStandings(
  competitorCount: number,
  matches: StandingMatch[],
): EliminationResult {
  const totalRounds = totalRoundsFor(competitorCount);
  if (totalRounds === 0) return { status: 'COMPLETE', standings: [], totalRounds };

  const finalMatch = getMatch(matches, totalRounds, 1);
  const finalCompleted = !!finalMatch && finalMatch.status === 'COMPLETED' && !!finalMatch.winnerId;

  const standings: EliminationStanding[] = [];

  if (finalCompleted && finalMatch) {
    standings.push({ rank: 1, competitorId: finalMatch.winnerId! });
    const silver = loserId(finalMatch);
    if (silver) standings.push({ rank: 2, competitorId: silver });
  }

  if (totalRounds >= 2) {
    const semis = getRoundMatches(matches, totalRounds - 1).filter(
      (m) => m.status === 'COMPLETED',
    );
    for (const semi of semis) {
      const bronze = loserId(semi);
      if (bronze) standings.push({ rank: 3, competitorId: bronze });
    }
  }

  const status = finalCompleted ? 'COMPLETE' : 'IN_PROGRESS';
  return { status, standings, totalRounds };
}
