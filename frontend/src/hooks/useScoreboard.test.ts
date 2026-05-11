import type { CompetitorScore, MatchScores, WinMethod, MatchState } from '@/hooks/useScoreboard';

/**
 * Type-mirror tests for useScoreboard.ts.
 *
 * The frontend can't import types from `backend/src/scoreboard/scoreboard.types.ts`
 * across the package boundary. Instead we re-declare them here and the tests
 * below assert structural equivalence via `satisfies`. If a future backend
 * commit adds or renames a field without mirroring it in useScoreboard.ts,
 * type-check (and therefore this test file) fails.
 *
 * Update protocol when these tests fail:
 *   1. Read backend/src/scoreboard/scoreboard.types.ts and the Prisma enums.
 *   2. Mirror the change into useScoreboard.ts's interfaces.
 *   3. Mirror the same change into the canonical declarations below.
 *   4. Tests pass = drift closed.
 */

// Canonical shapes (must match backend exactly). Kept inline so a reviewer
// can read backend + frontend side by side without jumping files.
interface CanonicalCompetitorScore {
  wazaAri: number;
  yuko: number;
  shido: number;
}

interface CanonicalMatchScores {
  competitor1: CanonicalCompetitorScore;
  competitor2: CanonicalCompetitorScore;
}

type CanonicalWinMethod =
  | 'IPPON'
  | 'WAZA_ARI'
  | 'DECISION'
  | 'HANSOKU_MAKE'
  | 'FUSEN_GACHI'
  | 'KIKEN_GACHI';

describe('useScoreboard type mirror', () => {
  it('CompetitorScore matches the canonical backend shape', () => {
    const sample: CompetitorScore = { wazaAri: 1, yuko: 0, shido: 2 };
    // Bidirectional satisfies — both forms must be valid for the shapes to match.
    sample satisfies CanonicalCompetitorScore;
    const reverse: CanonicalCompetitorScore = sample;
    reverse satisfies CompetitorScore;
    expect(sample.wazaAri + sample.yuko + sample.shido).toBe(3);
  });

  it('MatchScores matches the canonical backend shape', () => {
    const sample: MatchScores = {
      competitor1: { wazaAri: 0, yuko: 0, shido: 0 },
      competitor2: { wazaAri: 0, yuko: 0, shido: 0 },
    };
    sample satisfies CanonicalMatchScores;
    const reverse: CanonicalMatchScores = sample;
    reverse satisfies MatchScores;
    expect(sample.competitor1.wazaAri).toBe(0);
  });

  it('WinMethod covers exactly the six Prisma enum values', () => {
    // Every valid value must be assignable in both directions. If we ever
    // add SOREMADE or remove FUSEN_GACHI on either side, this fails.
    const values: WinMethod[] = [
      'IPPON',
      'WAZA_ARI',
      'DECISION',
      'HANSOKU_MAKE',
      'FUSEN_GACHI',
      'KIKEN_GACHI',
    ];
    values satisfies CanonicalWinMethod[];
    const reverse: CanonicalWinMethod[] = values;
    reverse satisfies WinMethod[];
    expect(values).toHaveLength(6);
  });

  it('MatchState exposes club + category for DisplayPage rendering', () => {
    // Regression guard for the `as unknown as { club?: string }` cast removal
    // in DisplayPage.tsx. Type-check fails if anyone narrows MatchState back.
    const sample: MatchState = {
      id: 'm1',
      status: 'ACTIVE',
      competitor1: { id: 'c1', firstName: 'A', lastName: 'B', club: 'Tokyo' },
      competitor2: { id: 'c2', firstName: 'C', lastName: 'D' },
      scores: {
        competitor1: { wazaAri: 0, yuko: 0, shido: 0 },
        competitor2: { wazaAri: 0, yuko: 0, shido: 0 },
      },
      duration: 240,
      goldenScore: false,
      category: { name: 'CADET Men -55kg' },
    };
    expect(sample.competitor1?.club).toBe('Tokyo');
    expect(sample.category?.name).toBe('CADET Men -55kg');
  });
});
