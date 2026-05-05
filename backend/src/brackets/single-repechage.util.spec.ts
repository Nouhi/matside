import { generateSingleRepechageMatches } from './single-repechage.util';

describe('generateSingleRepechageMatches', () => {
  it('returns 1 match (final) for 2 competitors', () => {
    const matches = generateSingleRepechageMatches(2);
    expect(matches).toHaveLength(1);
  });

  it('returns 2 first-round matches for 4 competitors', () => {
    const matches = generateSingleRepechageMatches(4);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.round === 1)).toBe(true);
  });

  it('generates fewer than 4 matches for 5 competitors (byes handled)', () => {
    const matches = generateSingleRepechageMatches(5);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(4);
  });

  it('returns 4 first-round matches for 8 competitors', () => {
    const matches = generateSingleRepechageMatches(8);
    expect(matches).toHaveLength(4);
  });

  it('seeds correctly: first match is seed 0 vs seed 7 for 8 competitors', () => {
    const matches = generateSingleRepechageMatches(8);
    expect(matches[0].competitor1Index).toBe(0);
    expect(matches[0].competitor2Index).toBe(7);
  });

  it('all competitor indices are within range [0, competitorCount-1]', () => {
    const count = 8;
    const matches = generateSingleRepechageMatches(count);
    for (const m of matches) {
      expect(m.competitor1Index).toBeGreaterThanOrEqual(0);
      expect(m.competitor1Index).toBeLessThan(count);
      expect(m.competitor2Index).toBeGreaterThanOrEqual(0);
      expect(m.competitor2Index).toBeLessThan(count);
    }
  });

  it('no competitor fights themselves', () => {
    const matches = generateSingleRepechageMatches(8);
    for (const m of matches) {
      expect(m.competitor1Index).not.toBe(m.competitor2Index);
    }
  });
});
