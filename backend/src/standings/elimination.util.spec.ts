import { computeEliminationStandings, totalRoundsFor } from './elimination.util';
import { StandingMatch } from './standings.types';

function m(
  round: number,
  position: number,
  c1: string | null,
  c2: string | null,
  winner: string | null = null,
  status: string = winner ? 'COMPLETED' : 'SCHEDULED',
): StandingMatch {
  return {
    competitor1Id: c1,
    competitor2Id: c2,
    winnerId: winner,
    winMethod: winner ? 'IPPON' : null,
    status,
    round,
    poolPosition: position,
    scores: null,
  };
}

describe('totalRoundsFor', () => {
  it('returns 0 for 0 or 1 competitors', () => {
    expect(totalRoundsFor(0)).toBe(0);
    expect(totalRoundsFor(1)).toBe(0);
  });

  it('returns 1 for 2 competitors', () => {
    expect(totalRoundsFor(2)).toBe(1);
  });

  it('returns 2 for 3-4 competitors', () => {
    expect(totalRoundsFor(3)).toBe(2);
    expect(totalRoundsFor(4)).toBe(2);
  });

  it('returns 3 for 5-8 competitors', () => {
    expect(totalRoundsFor(5)).toBe(3);
    expect(totalRoundsFor(8)).toBe(3);
  });
});

describe('computeEliminationStandings', () => {
  it('shows bronze (SF losers) but not gold/silver while final is pending', () => {
    const matches = [
      m(1, 1, 'a', 'b', 'a'),
      m(1, 2, 'c', 'd', 'c'),
      m(2, 1, 'a', 'c'),
    ];
    const result = computeEliminationStandings(4, matches);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.standings.find((s) => s.rank === 1)).toBeUndefined();
    expect(result.standings.find((s) => s.rank === 2)).toBeUndefined();
    expect(result.standings.filter((s) => s.rank === 3).map((s) => s.competitorId).sort())
      .toEqual(['b', 'd']);
  });

  it('awards gold and silver from completed final', () => {
    const matches = [
      m(1, 1, 'a', 'b', 'a'),
      m(2, 1, 'a', 'b', 'a'),
    ];
    const result = computeEliminationStandings(2, matches);
    expect(result.status).toBe('COMPLETE');
    expect(result.standings).toEqual([
      { rank: 1, competitorId: 'a' },
      { rank: 2, competitorId: 'b' },
    ]);
  });

  it('awards bronze to both semi losers (4 competitors)', () => {
    const matches = [
      m(1, 1, 'a', 'b', 'a'),
      m(1, 2, 'c', 'd', 'c'),
      m(2, 1, 'a', 'c', 'a'),
    ];
    const result = computeEliminationStandings(4, matches);
    expect(result.status).toBe('COMPLETE');
    const goldSilver = result.standings.filter((s) => s.rank <= 2);
    const bronzes = result.standings.filter((s) => s.rank === 3);
    expect(goldSilver).toEqual([
      { rank: 1, competitorId: 'a' },
      { rank: 2, competitorId: 'c' },
    ]);
    expect(bronzes.map((s) => s.competitorId).sort()).toEqual(['b', 'd']);
  });

  it('handles 8-competitor bracket end-to-end', () => {
    const matches = [
      m(1, 1, 'a', 'h', 'a'),
      m(1, 2, 'd', 'e', 'd'),
      m(1, 3, 'c', 'f', 'c'),
      m(1, 4, 'g', 'b', 'b'),
      m(2, 1, 'a', 'd', 'a'),
      m(2, 2, 'c', 'b', 'b'),
      m(3, 1, 'a', 'b', 'a'),
    ];
    const result = computeEliminationStandings(8, matches);
    expect(result.status).toBe('COMPLETE');
    const gold = result.standings.find((s) => s.rank === 1)!;
    const silver = result.standings.find((s) => s.rank === 2)!;
    const bronzes = result.standings.filter((s) => s.rank === 3);
    expect(gold.competitorId).toBe('a');
    expect(silver.competitorId).toBe('b');
    expect(bronzes.map((s) => s.competitorId).sort()).toEqual(['c', 'd']);
  });

  it('returns no standings for 0 competitors', () => {
    const result = computeEliminationStandings(0, []);
    expect(result.standings).toEqual([]);
    expect(result.totalRounds).toBe(0);
  });

  it('skips bronze entries when semis incomplete (final somehow done — unlikely)', () => {
    const matches = [m(2, 1, 'a', 'b', 'a')];
    const result = computeEliminationStandings(4, matches);
    expect(result.standings.find((s) => s.rank === 1)?.competitorId).toBe('a');
    expect(result.standings.filter((s) => s.rank === 3)).toHaveLength(0);
  });
});
