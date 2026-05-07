/**
 * Double-repechage bracket generator (real IJF Olympic format for 16+ competitors).
 *
 * Layout for 16-competitor bracket:
 *
 *   TOP HALF                              BOTTOM HALF
 *   ────────                              ───────────
 *   R1 pos 1 ─┐                           R1 pos 5 ─┐
 *             ├─ QF1 (rd2 pos 1)─┐                  ├─ QF3 (rd2 pos 3)─┐
 *   R1 pos 2 ─┘                  │        R1 pos 6 ─┘                  │
 *                                ├─ SF1                                ├─ SF2
 *   R1 pos 3 ─┐                  │        R1 pos 7 ─┐                  │
 *             ├─ QF2 (rd2 pos 2)─┘                  ├─ QF4 (rd2 pos 4)─┘
 *   R1 pos 4 ─┘                           R1 pos 8 ─┘
 *                                │                                     │
 *                                └────── FINAL (gold) ─────────────────┘
 *
 * Repechage paths (one per half):
 *
 *   TOP REPECHAGE                         BOTTOM REPECHAGE
 *   QF1 loser ─┐                          QF3 loser ─┐
 *              ├─ REP-TOP ─┐                         ├─ REP-BOTTOM ─┐
 *   QF2 loser ─┘           │              QF4 loser ─┘              │
 *                          ├─ BRONZE-TOP                            ├─ BRONZE-BOTTOM
 *              SF1 loser ──┘                            SF2 loser ──┘
 *
 * Two distinct bronze medalists. matches the IJF Olympic format.
 *
 * The util generates: main bracket slots (existing logic) + 2 repechage placeholders
 * + 2 bronze placeholders. Repechage/bronze slots have null competitors. They get
 * filled by scoreboard.service when the feeding QF and SF matches complete.
 */

import { BracketMatch, generateSingleRepechageMatches } from './single-repechage.util';

export const DOUBLE_REPECHAGE_MIN_COMPETITORS = 16;

export type RepechageHalf = 'TOP' | 'BOTTOM';
export type ExtendedPhase = 'REPECHAGE' | 'KNOCKOUT_BRONZE';

export interface DoubleRepechageMatch extends BracketMatch {
  phase: ExtendedPhase | null;
  poolGroup: RepechageHalf | null;
}

export function isDoubleRepechageBracketSize(competitorCount: number): boolean {
  return competitorCount >= DOUBLE_REPECHAGE_MIN_COMPETITORS;
}

export function totalRoundsFor(competitorCount: number): number {
  if (competitorCount <= 1) return 0;
  return Math.ceil(Math.log2(competitorCount));
}

/**
 * Determine which half (TOP or BOTTOM) of the bracket a given main-bracket
 * match position belongs to.
 *
 * Top half spans the first half of the matches in any round; bottom half spans
 * the second. For example, in QF (round 2 of an 8-competitor bracket / round 3
 * of a 16-bracket), positions 1-2 are TOP and 3-4 are BOTTOM. In SF, position 1
 * is TOP and 2 is BOTTOM. In R1 of a 16-bracket, positions 1-4 are TOP, 5-8 are
 * BOTTOM.
 */
export function halfFor(
  round: number,
  position: number,
  totalRounds: number,
): RepechageHalf {
  const matchesInRound = Math.pow(2, totalRounds - round);
  const halfSize = matchesInRound / 2;
  return position <= halfSize ? 'TOP' : 'BOTTOM';
}

export function generateDoubleRepechageMatches(
  competitorCount: number,
): DoubleRepechageMatch[] {
  if (!isDoubleRepechageBracketSize(competitorCount)) return [];

  // Main bracket reuses the existing single-elimination generator
  const mainMatches: DoubleRepechageMatch[] = generateSingleRepechageMatches(
    competitorCount,
  ).map((m) => ({
    ...m,
    phase: null,
    poolGroup: null,
  }));

  // Add 2 repechage placeholder slots (TOP + BOTTOM) and 2 bronze placeholders.
  // round/position numbering is not meaningful for these — they live "outside"
  // the main-bracket round counter. We pick stable encoding for sort/lookup:
  //   REPECHAGE: round=999, position=1 (TOP), position=2 (BOTTOM)
  //   KNOCKOUT_BRONZE: round=1000, position=1 (TOP), position=2 (BOTTOM)
  const extras: DoubleRepechageMatch[] = [
    {
      round: 999,
      poolPosition: 1,
      competitor1Index: null,
      competitor2Index: null,
      phase: 'REPECHAGE',
      poolGroup: 'TOP',
    },
    {
      round: 999,
      poolPosition: 2,
      competitor1Index: null,
      competitor2Index: null,
      phase: 'REPECHAGE',
      poolGroup: 'BOTTOM',
    },
    {
      round: 1000,
      poolPosition: 1,
      competitor1Index: null,
      competitor2Index: null,
      phase: 'KNOCKOUT_BRONZE',
      poolGroup: 'TOP',
    },
    {
      round: 1000,
      poolPosition: 2,
      competitor1Index: null,
      competitor2Index: null,
      phase: 'KNOCKOUT_BRONZE',
      poolGroup: 'BOTTOM',
    },
  ];

  return [...mainMatches, ...extras];
}
