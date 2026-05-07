import { StandingMatch } from './standings.types';

export interface PoolsStandingEntry {
  rank: number;
  competitorId: string;
}

export interface PoolsResult {
  status: 'IN_PROGRESS' | 'COMPLETE';
  standings: PoolsStandingEntry[];
}

/**
 * Compute medal placements for a POOLS bracket category from the knockout
 * matches alone (the pool stage feeds the knockout — once the knockout is
 * decided, the pool standings are no longer needed for medals).
 *
 * Format depends on competitor count (encoded by which knockout phases exist):
 *   - TWO_TEAM (5-8 competitors): KNOCKOUT_FINAL + KNOCKOUT_BRONZE.
 *     Gold = final winner, silver = final loser, bronze = bronze winner,
 *     4th = bronze loser.
 *   - FOUR_TEAM (9-15 competitors): KNOCKOUT_SF (×2) + KNOCKOUT_FINAL +
 *     KNOCKOUT_BRONZE. Same medal positions as TWO_TEAM. SF losers become
 *     bronze fight competitors.
 */
export function computePoolsStandings(matches: StandingMatch[]): PoolsResult {
  const finalMatch = matches.find((m) => m.phase === 'KNOCKOUT_FINAL');
  const bronzeMatch = matches.find((m) => m.phase === 'KNOCKOUT_BRONZE');

  const standings: PoolsStandingEntry[] = [];

  const finalDone =
    !!finalMatch &&
    finalMatch.status === 'COMPLETED' &&
    !!finalMatch.winnerId &&
    !!finalMatch.competitor1Id &&
    !!finalMatch.competitor2Id;

  if (finalDone && finalMatch) {
    standings.push({ rank: 1, competitorId: finalMatch.winnerId! });
    const silverId =
      finalMatch.winnerId === finalMatch.competitor1Id
        ? finalMatch.competitor2Id
        : finalMatch.competitor1Id;
    if (silverId) standings.push({ rank: 2, competitorId: silverId });
  }

  const bronzeDone =
    !!bronzeMatch &&
    bronzeMatch.status === 'COMPLETED' &&
    !!bronzeMatch.winnerId &&
    !!bronzeMatch.competitor1Id &&
    !!bronzeMatch.competitor2Id;

  if (bronzeDone && bronzeMatch) {
    standings.push({ rank: 3, competitorId: bronzeMatch.winnerId! });
    const fourthId =
      bronzeMatch.winnerId === bronzeMatch.competitor1Id
        ? bronzeMatch.competitor2Id
        : bronzeMatch.competitor1Id;
    if (fourthId) standings.push({ rank: 4, competitorId: fourthId });
  }

  return {
    status: finalDone && bronzeDone ? 'COMPLETE' : 'IN_PROGRESS',
    standings,
  };
}
