/**
 * IJF Grand Slam 4-pool bracket generator.
 *
 * Topology (22 competitors, 6/6/5/5):
 *
 *   POOL A (6) ──────╮
 *      single-elim   │
 *      pool winner ──┤
 *                    ├── SF1 ──╮
 *   POOL B (6) ──────┤         │
 *      pool winner ──╯         │
 *                              │
 *                              ├── FINAL → Gold / Silver
 *                              │
 *   POOL C (5) ──────╮         │
 *      pool winner ──┤         │
 *                    ├── SF2 ──╯
 *   POOL D (5) ──────┤
 *      pool winner ──╯
 *
 *   Pool finalist-losers cross to repechage:
 *
 *      Pool A loser ─╮
 *                    ├── REP TOP ───╮
 *      Pool B loser ─╯              │
 *                                   ├── BRONZE TOP (3rd)
 *                  SF2 loser ───────╯
 *
 *      Pool C loser ─╮
 *                    ├── REP BOTTOM ─╮
 *      Pool D loser ─╯               │
 *                                    ├── BRONZE BOTTOM (3rd)
 *                  SF1 loser ────────╯
 *
 * The cross-half routing (TOP rep winner faces BOTTOM SF loser, and vice
 * versa) is the IJF rule that prevents a competitor from facing the same
 * opponent twice on the way to bronze.
 */

import { BracketMatch, generateSingleRepechageMatches } from './single-repechage.util';

export const GRAND_SLAM_MIN_COMPETITORS = 16;

export type GrandSlamPhase =
  | 'POOL'
  | 'KNOCKOUT_SF'
  | 'KNOCKOUT_FINAL'
  | 'KNOCKOUT_BRONZE'
  | 'REPECHAGE';

export type RepechageHalf = 'TOP' | 'BOTTOM';
export type PoolGroup = 'A' | 'B' | 'C' | 'D';

export interface GrandSlamMatch extends BracketMatch {
  phase: GrandSlamPhase;
  // For POOL phase: 'A' | 'B' | 'C' | 'D'
  // For REPECHAGE / KNOCKOUT_BRONZE: 'TOP' | 'BOTTOM'
  // For KNOCKOUT_SF / KNOCKOUT_FINAL: null
  poolGroup: PoolGroup | RepechageHalf | null;
}

export function isGrandSlamBracketSize(competitorCount: number): boolean {
  return competitorCount >= GRAND_SLAM_MIN_COMPETITORS;
}

/**
 * Distribute N competitors across 4 pools with smallest pools last.
 * 22 → [6, 6, 5, 5], 17 → [5, 4, 4, 4], 20 → [5, 5, 5, 5].
 *
 * Returns sizes for [A, B, C, D] in that order. Pools with the larger
 * count come first so a viewer scanning left-to-right sees the densest
 * brackets first.
 */
export function distributePoolSizes(competitorCount: number): [number, number, number, number] {
  const base = Math.floor(competitorCount / 4);
  const extra = competitorCount % 4;
  // Front-load the extras into A, B, ...
  return [
    base + (extra > 0 ? 1 : 0),
    base + (extra > 1 ? 1 : 0),
    base + (extra > 2 ? 1 : 0),
    base,
  ];
}

/**
 * Snake seeding across pools: top seed to A, then B, C, D, D, C, B, A, A,
 * B, C, D, ... so that the top 4 seeds are spread across pools and pool
 * strength stays balanced.
 *
 * Returns: indexInPool[i] = pool letter (0=A) and slot within that pool
 * for the i-th seeded competitor. Caller passes competitor IDs in seed
 * order (0 = top seed).
 */
export function snakeAssignToPools(
  competitorCount: number,
): { competitorIndex: number; pool: number; slotInPool: number }[] {
  const sizes = distributePoolSizes(competitorCount);
  const assignments: { competitorIndex: number; pool: number; slotInPool: number }[] = [];
  const slotCursors = [0, 0, 0, 0];

  let competitorIndex = 0;
  let pass = 0;
  // Snake the assignment until all competitors are placed.
  while (competitorIndex < competitorCount) {
    const order = pass % 2 === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    for (const pool of order) {
      if (slotCursors[pool] < sizes[pool] && competitorIndex < competitorCount) {
        assignments.push({ competitorIndex, pool, slotInPool: slotCursors[pool] });
        slotCursors[pool]++;
        competitorIndex++;
      }
    }
    pass++;
  }
  return assignments;
}

/**
 * Generate all matches for a Grand Slam bracket of N competitors.
 * Returns POOL matches (one set per pool) plus knockout/repechage/bronze
 * placeholder matches with null competitors (those get filled by the
 * scoreboard advanceWinner logic when feeders complete).
 */
export function generateGrandSlamMatches(competitorCount: number): GrandSlamMatch[] {
  if (!isGrandSlamBracketSize(competitorCount)) return [];

  const sizes = distributePoolSizes(competitorCount);
  const assignments = snakeAssignToPools(competitorCount);

  const matches: GrandSlamMatch[] = [];
  const poolLetters: PoolGroup[] = ['A', 'B', 'C', 'D'];

  // Build each pool's internal single-elimination bracket. We translate
  // pool-local indices (0..size-1) into competition-wide indices via the
  // snake assignment above.
  for (let pool = 0; pool < 4; pool++) {
    const poolSize = sizes[pool];
    if (poolSize < 2) {
      // 0 or 1 competitor — no internal matches; the lone competitor (if
      // any) auto-advances to the main SF. Caller must handle this edge.
      continue;
    }

    const localToGlobal = assignments
      .filter((a) => a.pool === pool)
      .sort((a, b) => a.slotInPool - b.slotInPool)
      .map((a) => a.competitorIndex);

    const poolMatches = generateSingleRepechageMatches(poolSize);
    for (const m of poolMatches) {
      matches.push({
        round: m.round,
        poolPosition: m.poolPosition,
        competitor1Index:
          m.competitor1Index !== null ? localToGlobal[m.competitor1Index] : null,
        competitor2Index:
          m.competitor2Index !== null ? localToGlobal[m.competitor2Index] : null,
        phase: 'POOL',
        poolGroup: poolLetters[pool],
      });
    }
  }

  // Knockout placeholders. Competitors get filled in by scoreboard
  // advanceWinner once the feeding pool finals complete.
  matches.push({
    round: 1,
    poolPosition: 1,
    competitor1Index: null,
    competitor2Index: null,
    phase: 'KNOCKOUT_SF',
    poolGroup: null,
  });
  matches.push({
    round: 1,
    poolPosition: 2,
    competitor1Index: null,
    competitor2Index: null,
    phase: 'KNOCKOUT_SF',
    poolGroup: null,
  });
  matches.push({
    round: 2,
    poolPosition: 1,
    competitor1Index: null,
    competitor2Index: null,
    phase: 'KNOCKOUT_FINAL',
    poolGroup: null,
  });

  // Repechage placeholders.
  matches.push({
    round: 1,
    poolPosition: 1,
    competitor1Index: null,
    competitor2Index: null,
    phase: 'REPECHAGE',
    poolGroup: 'TOP',
  });
  matches.push({
    round: 1,
    poolPosition: 2,
    competitor1Index: null,
    competitor2Index: null,
    phase: 'REPECHAGE',
    poolGroup: 'BOTTOM',
  });

  // Bronze placeholders.
  matches.push({
    round: 1,
    poolPosition: 1,
    competitor1Index: null,
    competitor2Index: null,
    phase: 'KNOCKOUT_BRONZE',
    poolGroup: 'TOP',
  });
  matches.push({
    round: 1,
    poolPosition: 2,
    competitor1Index: null,
    competitor2Index: null,
    phase: 'KNOCKOUT_BRONZE',
    poolGroup: 'BOTTOM',
  });

  return matches;
}
