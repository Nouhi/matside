/**
 * Pool-play bracket generator (matches real-world IJF club / regional format).
 *
 * For 5-15 competitors:
 *   - Split into 2 pools (A and B), snake-distributed by registration order
 *     so seeded competitors don't all land in one pool.
 *   - Round-robin within each pool.
 *   - 5-8 competitors:  top 1 from each pool → final, 2nd-place → bronze fight.
 *   - 9-15 competitors: top 2 from each pool → 4-team knockout
 *                       (SF1 = A1 vs B2, SF2 = B1 vs A2 — cross-bracket).
 *
 * The util only generates the POOL stage matches. Knockout matches are created
 * dynamically by the scoreboard service once the pool stage completes (because
 * we need the actual standings to fill in competitor IDs).
 *
 * Pool stage layout (encoded in Match.round and Match.poolPosition):
 *
 *     A1 ┐
 *        ├─ POOL A round 1 pos 1
 *     A2 ┘
 *        ...
 *     POOL A round 2 pos 1, etc.
 *
 *     B1 ┐
 *        ├─ POOL B round 1 pos 1
 *     B2 ┘
 *
 * The {round, position} pair is unique only within a pool. The poolGroup
 * field disambiguates A vs B.
 */

import { generateRoundRobinMatches } from './round-robin.util';

export interface PoolStructure {
  poolGroup: string;
  competitorIndices: number[];
}

export interface PoolMatch {
  poolGroup: string;
  round: number;
  poolPosition: number;
  competitor1Index: number;
  competitor2Index: number;
}

export type KnockoutFormat = 'TWO_TEAM' | 'FOUR_TEAM';

export const POOLS_MIN_COMPETITORS = 5;
export const POOLS_MAX_COMPETITORS = 15;

export function isPoolsBracketSize(competitorCount: number): boolean {
  return (
    competitorCount >= POOLS_MIN_COMPETITORS &&
    competitorCount <= POOLS_MAX_COMPETITORS
  );
}

export function knockoutFormatFor(competitorCount: number): KnockoutFormat {
  return competitorCount <= 8 ? 'TWO_TEAM' : 'FOUR_TEAM';
}

/**
 * Snake-distribute competitor indices into two pools so that registration-order
 * neighbours don't all land in the same pool.
 *
 *   indices = [0, 1, 2, 3, 4, 5, 6, 7]
 *   →  pool A = [0, 2, 4, 6]    pool B = [1, 3, 5, 7]
 */
export function splitIntoPools(competitorCount: number): PoolStructure[] {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < competitorCount; i++) {
    if (i % 2 === 0) a.push(i);
    else b.push(i);
  }
  return [
    { poolGroup: 'A', competitorIndices: a },
    { poolGroup: 'B', competitorIndices: b },
  ];
}

export function generatePoolsMatches(competitorCount: number): PoolMatch[] {
  if (!isPoolsBracketSize(competitorCount)) return [];

  const pools = splitIntoPools(competitorCount);
  const matches: PoolMatch[] = [];

  for (const pool of pools) {
    const pairings = generateRoundRobinMatches(pool.competitorIndices.length);
    for (const p of pairings) {
      if (p.competitor1Index === null || p.competitor2Index === null) continue;
      matches.push({
        poolGroup: pool.poolGroup,
        round: p.round,
        poolPosition: p.poolPosition,
        competitor1Index: pool.competitorIndices[p.competitor1Index],
        competitor2Index: pool.competitorIndices[p.competitor2Index],
      });
    }
  }

  return matches;
}

export function expectedPoolMatchCount(competitorCount: number): number {
  if (!isPoolsBracketSize(competitorCount)) return 0;
  const pools = splitIntoPools(competitorCount);
  return pools.reduce((sum, pool) => {
    const n = pool.competitorIndices.length;
    return sum + (n * (n - 1)) / 2;
  }, 0);
}
