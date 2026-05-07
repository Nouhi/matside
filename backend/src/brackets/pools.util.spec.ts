import {
  expectedPoolMatchCount,
  generatePoolsMatches,
  isPoolsBracketSize,
  knockoutFormatFor,
  splitIntoPools,
} from './pools.util';

describe('isPoolsBracketSize', () => {
  it('is false for 1-4 competitors', () => {
    [1, 2, 3, 4].forEach((n) => expect(isPoolsBracketSize(n)).toBe(false));
  });

  it('is true for 5-15 competitors', () => {
    for (let n = 5; n <= 15; n++) expect(isPoolsBracketSize(n)).toBe(true);
  });

  it('is false for 16+ competitors', () => {
    [16, 20, 32].forEach((n) => expect(isPoolsBracketSize(n)).toBe(false));
  });
});

describe('knockoutFormatFor', () => {
  it('returns TWO_TEAM for 5-8 competitors', () => {
    [5, 6, 7, 8].forEach((n) => expect(knockoutFormatFor(n)).toBe('TWO_TEAM'));
  });

  it('returns FOUR_TEAM for 9-15 competitors', () => {
    [9, 10, 12, 15].forEach((n) => expect(knockoutFormatFor(n)).toBe('FOUR_TEAM'));
  });
});

describe('splitIntoPools', () => {
  it('produces two pools labelled A and B', () => {
    const pools = splitIntoPools(8);
    expect(pools).toHaveLength(2);
    expect(pools[0].poolGroup).toBe('A');
    expect(pools[1].poolGroup).toBe('B');
  });

  it('snake-distributes competitors (even-odd interleave)', () => {
    const pools = splitIntoPools(6);
    expect(pools[0].competitorIndices).toEqual([0, 2, 4]);
    expect(pools[1].competitorIndices).toEqual([1, 3, 5]);
  });

  it('handles odd counts: pool A gets the extra', () => {
    const pools = splitIntoPools(7);
    expect(pools[0].competitorIndices).toEqual([0, 2, 4, 6]);
    expect(pools[1].competitorIndices).toEqual([1, 3, 5]);
  });

  it('every competitor index lands in exactly one pool', () => {
    for (let n = 5; n <= 15; n++) {
      const pools = splitIntoPools(n);
      const all = pools.flatMap((p) => p.competitorIndices).sort((a, b) => a - b);
      expect(all).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it('pool sizes differ by at most 1', () => {
    for (let n = 5; n <= 15; n++) {
      const pools = splitIntoPools(n);
      const aSize = pools[0].competitorIndices.length;
      const bSize = pools[1].competitorIndices.length;
      expect(Math.abs(aSize - bSize)).toBeLessThanOrEqual(1);
    }
  });
});

describe('generatePoolsMatches', () => {
  it('returns empty array for non-pool sizes', () => {
    expect(generatePoolsMatches(4)).toEqual([]);
    expect(generatePoolsMatches(16)).toEqual([]);
  });

  it('generates the expected number of matches for n=8 (two pools of 4)', () => {
    const matches = generatePoolsMatches(8);
    // pool of 4 = 6 round-robin matches; two pools = 12 total
    expect(matches).toHaveLength(12);
  });

  it('generates the expected number of matches for n=12 (two pools of 6)', () => {
    const matches = generatePoolsMatches(12);
    // pool of 6 = 15 round-robin matches; two pools = 30 total
    expect(matches).toHaveLength(30);
  });

  it('generates 6 matches for n=5 (pool of 3 + pool of 2)', () => {
    const matches = generatePoolsMatches(5);
    // 3*2/2=3 + 2*1/2=1 = 4 matches
    expect(matches).toHaveLength(4);
  });

  it('every match has a poolGroup of A or B', () => {
    const matches = generatePoolsMatches(10);
    expect(matches.every((m) => m.poolGroup === 'A' || m.poolGroup === 'B')).toBe(true);
  });

  it('competitor indices match the pool they belong to', () => {
    const pools = splitIntoPools(8);
    const aSet = new Set(pools[0].competitorIndices);
    const bSet = new Set(pools[1].competitorIndices);
    const matches = generatePoolsMatches(8);
    for (const m of matches) {
      const set = m.poolGroup === 'A' ? aSet : bSet;
      expect(set.has(m.competitor1Index)).toBe(true);
      expect(set.has(m.competitor2Index)).toBe(true);
    }
  });

  it('no competitor fights themselves', () => {
    for (const n of [5, 8, 12, 15]) {
      const matches = generatePoolsMatches(n);
      for (const m of matches) {
        expect(m.competitor1Index).not.toBe(m.competitor2Index);
      }
    }
  });

  it('no duplicate pairings within a pool', () => {
    const matches = generatePoolsMatches(10);
    const pairs = matches.map((m) => {
      const sorted = [m.competitor1Index, m.competitor2Index].sort((a, b) => a - b);
      return `${m.poolGroup}-${sorted[0]}-${sorted[1]}`;
    });
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe('expectedPoolMatchCount', () => {
  it('returns 0 for non-pool sizes', () => {
    expect(expectedPoolMatchCount(4)).toBe(0);
    expect(expectedPoolMatchCount(16)).toBe(0);
  });

  it('matches generatePoolsMatches output for valid sizes', () => {
    for (let n = 5; n <= 15; n++) {
      expect(expectedPoolMatchCount(n)).toBe(generatePoolsMatches(n).length);
    }
  });
});
