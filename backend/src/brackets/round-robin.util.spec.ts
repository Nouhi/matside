import { generateRoundRobinMatches } from './round-robin.util';

describe('generateRoundRobinMatches', () => {
  it('returns empty array for 0 competitors', () => {
    expect(generateRoundRobinMatches(0)).toEqual([]);
  });

  it('returns empty array for 1 competitor', () => {
    expect(generateRoundRobinMatches(1)).toEqual([]);
  });

  it('returns 1 match in round 1 for 2 competitors', () => {
    const matches = generateRoundRobinMatches(2);
    expect(matches).toHaveLength(1);
    expect(matches[0].round).toBe(1);
  });

  it('returns 3 matches for 3 competitors', () => {
    const matches = generateRoundRobinMatches(3);
    expect(matches).toHaveLength(3);
  });

  it('returns 6 matches across 3 rounds for 4 competitors', () => {
    const matches = generateRoundRobinMatches(4);
    expect(matches).toHaveLength(6);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
  });

  it('each competitor appears exactly 3 times with 4 competitors', () => {
    const matches = generateRoundRobinMatches(4);
    const appearances: Record<number, number> = {};
    for (const m of matches) {
      appearances[m.competitor1Index!] = (appearances[m.competitor1Index!] || 0) + 1;
      appearances[m.competitor2Index!] = (appearances[m.competitor2Index!] || 0) + 1;
    }
    for (let i = 0; i < 4; i++) {
      expect(appearances[i]).toBe(3);
    }
  });

  it('no competitor fights themselves with 4 competitors', () => {
    const matches = generateRoundRobinMatches(4);
    for (const m of matches) {
      expect(m.competitor1Index).not.toBe(m.competitor2Index);
    }
  });

  it('no duplicate pairings with 4 competitors', () => {
    const matches = generateRoundRobinMatches(4);
    const pairs = matches.map((m) => {
      const sorted = [m.competitor1Index!, m.competitor2Index!].sort((a, b) => a - b);
      return `${sorted[0]}-${sorted[1]}`;
    });
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('returns 10 matches with no byes for 5 competitors (odd)', () => {
    const matches = generateRoundRobinMatches(5);
    expect(matches).toHaveLength(10);
    for (const m of matches) {
      expect(m.competitor1Index).not.toBeNull();
      expect(m.competitor2Index).not.toBeNull();
    }
  });
});
