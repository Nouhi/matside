import {
  computeRoundRobinStats,
  expectedRoundRobinMatchCount,
  isRoundRobinComplete,
  rankRoundRobin,
} from './round-robin.util';
import { StandingMatch } from './standings.types';

function match(
  c1: string,
  c2: string,
  winner: string,
  winMethod: 'IPPON' | 'WAZA_ARI' | 'DECISION' | 'HANSOKU_MAKE',
  shidos: { c1: number; c2: number } = { c1: 0, c2: 0 },
  status: string = 'COMPLETED',
): StandingMatch {
  return {
    competitor1Id: c1,
    competitor2Id: c2,
    winnerId: winner,
    winMethod,
    status,
    round: 1,
    poolPosition: 1,
    scores: {
      competitor1: { wazaAri: 0, yuko: 0, shido: shidos.c1 },
      competitor2: { wazaAri: 0, yuko: 0, shido: shidos.c2 },
    },
  };
}

describe('expectedRoundRobinMatchCount', () => {
  it('returns 0 for fewer than 2 competitors', () => {
    expect(expectedRoundRobinMatchCount(0)).toBe(0);
    expect(expectedRoundRobinMatchCount(1)).toBe(0);
  });

  it('returns n*(n-1)/2 for n competitors', () => {
    expect(expectedRoundRobinMatchCount(2)).toBe(1);
    expect(expectedRoundRobinMatchCount(3)).toBe(3);
    expect(expectedRoundRobinMatchCount(4)).toBe(6);
  });
});

describe('computeRoundRobinStats', () => {
  it('initialises zero stats for every competitor', () => {
    const stats = computeRoundRobinStats(['a', 'b'], []);
    expect(stats.get('a')).toMatchObject({ wins: 0, losses: 0, matchesPlayed: 0 });
    expect(stats.get('b')).toMatchObject({ wins: 0, losses: 0, matchesPlayed: 0 });
  });

  it('counts ippons and waza-ari wins separately', () => {
    const matches = [
      match('a', 'b', 'a', 'IPPON'),
      match('a', 'c', 'a', 'WAZA_ARI'),
    ];
    const stats = computeRoundRobinStats(['a', 'b', 'c'], matches);
    expect(stats.get('a')).toMatchObject({
      wins: 2,
      ippons: 1,
      wazaAriWins: 1,
    });
  });

  it('sums shidos received from match scores', () => {
    const matches = [
      match('a', 'b', 'a', 'DECISION', { c1: 1, c2: 2 }),
      match('a', 'b', 'a', 'DECISION', { c1: 0, c2: 1 }),
    ];
    const stats = computeRoundRobinStats(['a', 'b'], matches);
    expect(stats.get('a')!.shidosReceived).toBe(1);
    expect(stats.get('b')!.shidosReceived).toBe(3);
  });

  it('ignores incomplete matches', () => {
    const matches = [
      match('a', 'b', 'a', 'IPPON', { c1: 0, c2: 0 }, 'ACTIVE'),
    ];
    const stats = computeRoundRobinStats(['a', 'b'], matches);
    expect(stats.get('a')!.wins).toBe(0);
    expect(stats.get('a')!.matchesPlayed).toBe(0);
  });
});

describe('rankRoundRobin', () => {
  it('returns competitors in win order', () => {
    const matches = [
      match('a', 'b', 'a', 'IPPON'),
      match('a', 'c', 'a', 'IPPON'),
      match('b', 'c', 'b', 'IPPON'),
    ];
    const standings = rankRoundRobin(['a', 'b', 'c'], matches);
    expect(standings.map((s) => s.competitorId)).toEqual(['a', 'b', 'c']);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('breaks 2-way ties with head-to-head', () => {
    const matches = [
      match('a', 'b', 'b', 'IPPON'),
      match('a', 'c', 'a', 'IPPON'),
      match('b', 'c', 'c', 'IPPON'),
    ];
    const standings = rankRoundRobin(['a', 'b', 'c'], matches);
    expect(standings.map((s) => s.wins)).toEqual([1, 1, 1]);
    const a = standings.find((s) => s.competitorId === 'a')!;
    const b = standings.find((s) => s.competitorId === 'b')!;
    expect(b.rank).toBeLessThanOrEqual(a.rank);
  });

  it('uses ippon count to break 3-way ties', () => {
    const matches = [
      match('a', 'b', 'a', 'IPPON'),
      match('b', 'c', 'b', 'IPPON'),
      match('c', 'a', 'c', 'WAZA_ARI'),
    ];
    const standings = rankRoundRobin(['a', 'b', 'c'], matches);
    expect(standings[0].competitorId).toBe('a');
    expect(standings[1].competitorId).toBe('b');
    expect(standings[2].competitorId).toBe('c');
  });

  it('falls back to waza-ari count when ippons are equal', () => {
    const matches = [
      match('a', 'b', 'a', 'WAZA_ARI'),
      match('b', 'c', 'b', 'DECISION'),
      match('c', 'a', 'c', 'WAZA_ARI'),
    ];
    const standings = rankRoundRobin(['a', 'b', 'c'], matches);
    const a = standings.find((s) => s.competitorId === 'a')!;
    const b = standings.find((s) => s.competitorId === 'b')!;
    const c = standings.find((s) => s.competitorId === 'c')!;
    expect(a.wazaAriWins).toBe(1);
    expect(b.wazaAriWins).toBe(0);
    expect(c.wazaAriWins).toBe(1);
    expect(a.rank).toBeLessThan(b.rank);
    expect(c.rank).toBeLessThan(b.rank);
  });

  it('uses fewer shidos received as the final tiebreaker', () => {
    const matches = [
      match('a', 'b', 'a', 'DECISION', { c1: 1, c2: 0 }),
      match('b', 'c', 'b', 'DECISION', { c1: 0, c2: 1 }),
      match('c', 'a', 'c', 'DECISION', { c1: 2, c2: 0 }),
    ];
    const standings = rankRoundRobin(['a', 'b', 'c'], matches);
    expect(standings.every((s) => s.wins === 1)).toBe(true);
    const order = standings.map((s) => s.competitorId);
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
  });

  it('flags unbreakable ties with tiedWith', () => {
    const matches = [
      match('a', 'b', 'a', 'DECISION', { c1: 1, c2: 1 }),
      match('b', 'c', 'b', 'DECISION', { c1: 1, c2: 1 }),
      match('c', 'a', 'c', 'DECISION', { c1: 1, c2: 1 }),
    ];
    const standings = rankRoundRobin(['a', 'b', 'c'], matches);
    expect(standings.every((s) => s.wins === 1)).toBe(true);
    expect(standings.every((s) => s.rank === 1)).toBe(true);
    for (const s of standings) {
      expect(s.tiedWith.length).toBe(2);
    }
  });

  it('handles 4-competitor pool correctly', () => {
    const matches = [
      match('a', 'b', 'a', 'IPPON'),
      match('a', 'c', 'a', 'IPPON'),
      match('a', 'd', 'a', 'IPPON'),
      match('b', 'c', 'b', 'WAZA_ARI'),
      match('b', 'd', 'b', 'IPPON'),
      match('c', 'd', 'c', 'DECISION'),
    ];
    const standings = rankRoundRobin(['a', 'b', 'c', 'd'], matches);
    expect(standings.map((s) => s.competitorId)).toEqual(['a', 'b', 'c', 'd']);
    expect(standings.map((s) => s.wins)).toEqual([3, 2, 1, 0]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });

  it('treats no completed matches as a full tie at rank 1', () => {
    const standings = rankRoundRobin(['a', 'b', 'c'], []);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 1]);
    expect(standings[0].tiedWith).toEqual(['b', 'c']);
  });
});

describe('isRoundRobinComplete', () => {
  it('returns true when completed match count meets expected', () => {
    const matches = [
      match('a', 'b', 'a', 'IPPON'),
      match('a', 'c', 'a', 'IPPON'),
      match('b', 'c', 'b', 'IPPON'),
    ];
    expect(isRoundRobinComplete(3, matches)).toBe(true);
  });

  it('returns false when matches still pending', () => {
    const matches = [
      match('a', 'b', 'a', 'IPPON'),
      match('a', 'c', 'a', 'IPPON', { c1: 0, c2: 0 }, 'ACTIVE'),
    ];
    expect(isRoundRobinComplete(3, matches)).toBe(false);
  });
});
