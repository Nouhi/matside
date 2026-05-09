import { computePoolsStandings } from './pools.util';
import { StandingMatch } from './standings.types';

function knockoutMatch(
  phase: 'KNOCKOUT_FINAL' | 'KNOCKOUT_BRONZE' | 'KNOCKOUT_SF',
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
    round: 100,
    poolPosition: 1,
    scores: null,
    phase,
    poolGroup: null,
  };
}

describe('computePoolsStandings', () => {
  it('returns IN_PROGRESS with no standings when knockout matches missing', () => {
    const result = computePoolsStandings([]);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.standings).toEqual([]);
  });

  it('returns IN_PROGRESS when final and bronze are scheduled but not played', () => {
    const matches = [
      knockoutMatch('KNOCKOUT_FINAL', 'a', 'b'),
      knockoutMatch('KNOCKOUT_BRONZE', 'c', 'd'),
    ];
    const result = computePoolsStandings(matches);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.standings).toEqual([]);
  });

  it('awards gold + silver from completed final, leaves bronze IN_PROGRESS', () => {
    const matches = [
      knockoutMatch('KNOCKOUT_FINAL', 'a', 'b', 'a'),
      knockoutMatch('KNOCKOUT_BRONZE', 'c', 'd'),
    ];
    const result = computePoolsStandings(matches);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.standings).toEqual([
      { rank: 1, competitorId: 'a' },
      { rank: 2, competitorId: 'b' },
    ]);
  });

  it('awards bronze + 4th from completed bronze fight', () => {
    const matches = [
      knockoutMatch('KNOCKOUT_FINAL', 'a', 'b'),
      knockoutMatch('KNOCKOUT_BRONZE', 'c', 'd', 'c'),
    ];
    const result = computePoolsStandings(matches);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.standings.find((s) => s.rank === 3)?.competitorId).toBe('c');
    expect(result.standings.find((s) => s.rank === 4)?.competitorId).toBe('d');
  });

  it('returns COMPLETE with full top 4 when both final and bronze are done', () => {
    const matches = [
      knockoutMatch('KNOCKOUT_FINAL', 'a', 'b', 'a'),
      knockoutMatch('KNOCKOUT_BRONZE', 'c', 'd', 'c'),
    ];
    const result = computePoolsStandings(matches);
    expect(result.status).toBe('COMPLETE');
    expect(result.standings.map((s) => ({ rank: s.rank, id: s.competitorId }))).toEqual([
      { rank: 1, id: 'a' },
      { rank: 2, id: 'b' },
      { rank: 3, id: 'c' },
      { rank: 4, id: 'd' },
    ]);
  });

  it('ignores POOL stage matches', () => {
    const matches = [
      { ...knockoutMatch('KNOCKOUT_FINAL', 'a', 'b', 'a'), phase: null, poolGroup: 'A' },
      { ...knockoutMatch('KNOCKOUT_BRONZE', 'c', 'd', 'c'), phase: null, poolGroup: 'A' },
    ] as StandingMatch[];
    // No KNOCKOUT_FINAL phase tag → no medals
    const result = computePoolsStandings(matches);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.standings).toEqual([]);
  });
});
