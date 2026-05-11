import {
  CompetitorStats,
  RoundRobinStanding,
  StandingMatch,
} from './standings.types';

export function computeRoundRobinStats(
  competitorIds: string[],
  matches: StandingMatch[],
): Map<string, CompetitorStats> {
  const stats = new Map<string, CompetitorStats>();
  for (const id of competitorIds) {
    stats.set(id, {
      competitorId: id,
      wins: 0,
      losses: 0,
      ippons: 0,
      wazaAriWins: 0,
      shidosReceived: 0,
      matchesPlayed: 0,
    });
  }

  for (const match of matches) {
    if (match.status !== 'COMPLETED') continue;
    if (!match.competitor1Id || !match.competitor2Id || !match.winnerId) continue;

    const c1 = stats.get(match.competitor1Id);
    const c2 = stats.get(match.competitor2Id);
    if (!c1 || !c2) continue;

    c1.matchesPlayed += 1;
    c2.matchesPlayed += 1;

    const winner = match.winnerId === match.competitor1Id ? c1 : c2;
    const loser = match.winnerId === match.competitor1Id ? c2 : c1;
    winner.wins += 1;
    loser.losses += 1;

    if (match.winMethod === 'IPPON') winner.ippons += 1;
    else if (match.winMethod === 'WAZA_ARI') winner.wazaAriWins += 1;

    if (match.scores) {
      c1.shidosReceived += match.scores.competitor1?.shido ?? 0;
      c2.shidosReceived += match.scores.competitor2?.shido ?? 0;
    }
  }

  return stats;
}

function compareByCriteria(a: CompetitorStats, b: CompetitorStats): number {
  if (a.ippons !== b.ippons) return b.ippons - a.ippons;
  if (a.wazaAriWins !== b.wazaAriWins) return b.wazaAriWins - a.wazaAriWins;
  return a.shidosReceived - b.shidosReceived;
}

function headToHeadWinner(
  a: string,
  b: string,
  matches: StandingMatch[],
): string | null {
  for (const match of matches) {
    if (match.status !== 'COMPLETED' || !match.winnerId) continue;
    const ids = [match.competitor1Id, match.competitor2Id];
    if (ids.includes(a) && ids.includes(b)) {
      return match.winnerId;
    }
  }
  return null;
}

/*
 * rankRoundRobin — IJF round-robin tiebreaker chain.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Step 1: WIN COUNT (more wins → higher rank)               │
 *   │   tied?                                                   │
 *   │   ▼                                                       │
 *   │ Step 2: HEAD-TO-HEAD — but ONLY when exactly 2 are tied.  │
 *   │         When 3+ tied, H2H produces ambiguous loops (A>B,  │
 *   │         B>C, C>A) and IJF rules drop straight to step 3.  │
 *   │         (Implemented via headToHeadWinner: returns the    │
 *   │         single winner of the direct match, or null.)      │
 *   │   tied?                                                   │
 *   │   ▼                                                       │
 *   │ Step 3: IPPONS scored (descending)                        │
 *   │   tied?                                                   │
 *   │   ▼                                                       │
 *   │ Step 4: WAZA-ARI count (descending)                       │
 *   │   tied?                                                   │
 *   │   ▼                                                       │
 *   │ Step 5: FEWEST shidos received (ascending)                │
 *   │   tied?                                                   │
 *   │   ▼                                                       │
 *   │ PENDING_PLAYOFF: cannot rank further; mark the cluster    │
 *   │ and surface the tie to the organizer. (status field on    │
 *   │ CategoryStandings.)                                       │
 *   └──────────────────────────────────────────────────────────┘
 */
export function rankRoundRobin(
  competitorIds: string[],
  matches: StandingMatch[],
): RoundRobinStanding[] {
  const stats = computeRoundRobinStats(competitorIds, matches);
  const entries: CompetitorStats[] = competitorIds
    .map((id) => stats.get(id)!)
    .filter(Boolean);

  entries.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return compareByCriteria(a, b);
  });

  const result: RoundRobinStanding[] = [];
  let i = 0;
  let rank = 1;
  while (i < entries.length) {
    let j = i + 1;
    while (
      j < entries.length &&
      entries[j].wins === entries[i].wins &&
      compareByCriteria(entries[i], entries[j]) === 0
    ) {
      j += 1;
    }

    const group = entries.slice(i, j);

    if (group.length === 2) {
      const h2h = headToHeadWinner(
        group[0].competitorId,
        group[1].competitorId,
        matches,
      );
      if (h2h) {
        const winnerFirst = group[0].competitorId === h2h ? group : [group[1], group[0]];
        result.push({ ...winnerFirst[0], rank, tiedWith: [] });
        result.push({ ...winnerFirst[1], rank: rank + 1, tiedWith: [] });
        rank += 2;
        i = j;
        continue;
      }
    }

    if (group.length === 1) {
      result.push({ ...group[0], rank, tiedWith: [] });
      rank += 1;
    } else {
      const tiedIds = group.map((g) => g.competitorId);
      for (const g of group) {
        result.push({
          ...g,
          rank,
          tiedWith: tiedIds.filter((id) => id !== g.competitorId),
        });
      }
      rank += group.length;
    }

    i = j;
  }

  return result;
}

export function isRoundRobinComplete(
  expectedMatchCount: number,
  matches: StandingMatch[],
): boolean {
  const completed = matches.filter((m) => m.status === 'COMPLETED').length;
  return completed >= expectedMatchCount;
}

export function expectedRoundRobinMatchCount(competitorCount: number): number {
  if (competitorCount < 2) return 0;
  return (competitorCount * (competitorCount - 1)) / 2;
}
