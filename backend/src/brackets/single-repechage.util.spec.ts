import { generateSingleRepechageMatches, getNextSlot } from './single-repechage.util';

describe('generateSingleRepechageMatches', () => {
  it('returns 1 match (final) for 2 competitors', () => {
    const matches = generateSingleRepechageMatches(2);
    expect(matches).toHaveLength(1);
    expect(matches[0].round).toBe(1);
    expect(matches[0].competitor1Index).toBe(0);
    expect(matches[0].competitor2Index).toBe(1);
  });

  it('returns full bracket (2 R1 + 1 final) for 4 competitors', () => {
    const matches = generateSingleRepechageMatches(4);
    expect(matches).toHaveLength(3);
    const r1 = matches.filter((m) => m.round === 1);
    const r2 = matches.filter((m) => m.round === 2);
    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(1);
    expect(r1.every((m) => m.competitor1Index !== null && m.competitor2Index !== null)).toBe(true);
    expect(r2[0].competitor1Index).toBeNull();
    expect(r2[0].competitor2Index).toBeNull();
  });

  it('handles 5 competitors with explicit bye matches in R1', () => {
    const matches = generateSingleRepechageMatches(5);
    const r1 = matches.filter((m) => m.round === 1);
    const r2 = matches.filter((m) => m.round === 2);
    const r3 = matches.filter((m) => m.round === 3);

    // 5 competitors → 8-slot bracket → 4 R1 slots, of which 3 are byes (one
    // competitor + null) and 1 is a real match. Byes are explicit so the UI
    // can render them.
    expect(r1).toHaveLength(4);
    expect(r2).toHaveLength(2);
    expect(r3).toHaveLength(1);

    const realR1 = r1.filter(
      (m) => m.competitor1Index !== null && m.competitor2Index !== null,
    );
    const byeR1 = r1.filter(
      (m) => (m.competitor1Index === null) !== (m.competitor2Index === null),
    );
    expect(realR1).toHaveLength(1);
    expect(byeR1).toHaveLength(3);
  });

  it('returns 4 R1 + 2 SF + 1 final for 8 competitors', () => {
    const matches = generateSingleRepechageMatches(8);
    expect(matches).toHaveLength(7);
    const r1 = matches.filter((m) => m.round === 1);
    const r2 = matches.filter((m) => m.round === 2);
    const r3 = matches.filter((m) => m.round === 3);
    expect(r1).toHaveLength(4);
    expect(r2).toHaveLength(2);
    expect(r3).toHaveLength(1);
  });

  it('seeds correctly: R1 position 1 is seed 0 vs seed 7 for 8 competitors', () => {
    const matches = generateSingleRepechageMatches(8);
    const r1pos1 = matches.find((m) => m.round === 1 && m.poolPosition === 1)!;
    expect(r1pos1.competitor1Index).toBe(0);
    expect(r1pos1.competitor2Index).toBe(7);
  });

  it('every R1 match has both competitors when no byes (8 competitors)', () => {
    const count = 8;
    const matches = generateSingleRepechageMatches(count);
    for (const m of matches.filter((x) => x.round === 1)) {
      expect(m.competitor1Index).toBeGreaterThanOrEqual(0);
      expect(m.competitor1Index).toBeLessThan(count);
      expect(m.competitor2Index).toBeGreaterThanOrEqual(0);
      expect(m.competitor2Index).toBeLessThan(count);
    }
  });

  it('no competitor fights themselves in R1', () => {
    const matches = generateSingleRepechageMatches(8);
    for (const m of matches.filter((x) => x.round === 1)) {
      expect(m.competitor1Index).not.toBe(m.competitor2Index);
    }
  });

  it('every competitor appears exactly once in R1 + bye-pre-fills', () => {
    const count = 5;
    const matches = generateSingleRepechageMatches(count);
    const seen = new Set<number>();
    for (const m of matches.filter((x) => x.round === 1)) {
      if (m.competitor1Index !== null) seen.add(m.competitor1Index);
      if (m.competitor2Index !== null) seen.add(m.competitor2Index);
    }
    for (const m of matches.filter((x) => x.round === 2)) {
      if (m.competitor1Index !== null) seen.add(m.competitor1Index);
      if (m.competitor2Index !== null) seen.add(m.competitor2Index);
    }
    expect(seen.size).toBe(count);
  });

  it('every competitor that gets a bye has an R1 record (regression)', () => {
    // Regression: with 20 competitors in a 32-bracket, 12 get byes. Every
    // bye-getter must appear in an R1 match (with the other side null) so
    // the bracket UI can show them advancing — they should NOT appear only
    // in R2 with no R1 trail.
    const matches = generateSingleRepechageMatches(20);
    const r1Competitors = new Set<number>();
    for (const m of matches.filter((x) => x.round === 1)) {
      if (m.competitor1Index !== null) r1Competitors.add(m.competitor1Index);
      if (m.competitor2Index !== null) r1Competitors.add(m.competitor2Index);
    }
    // All 20 competitors must show up in R1 (real fight or bye record).
    for (let i = 0; i < 20; i++) {
      expect(r1Competitors.has(i)).toBe(true);
    }
  });

  it('produces sorted output by round then poolPosition', () => {
    const matches = generateSingleRepechageMatches(8);
    for (let i = 1; i < matches.length; i++) {
      const prev = matches[i - 1];
      const curr = matches[i];
      const prevKey = prev.round * 1000 + prev.poolPosition;
      const currKey = curr.round * 1000 + curr.poolPosition;
      expect(currKey).toBeGreaterThan(prevKey);
    }
  });
});

describe('getNextSlot', () => {
  it('R1 position 1 → R2 position 1 as competitor1', () => {
    expect(getNextSlot(1, 1)).toEqual({ round: 2, position: 1, isCompetitor1: true });
  });

  it('R1 position 2 → R2 position 1 as competitor2', () => {
    expect(getNextSlot(1, 2)).toEqual({ round: 2, position: 1, isCompetitor1: false });
  });

  it('R1 position 3 → R2 position 2 as competitor1', () => {
    expect(getNextSlot(1, 3)).toEqual({ round: 2, position: 2, isCompetitor1: true });
  });

  it('R2 position 2 → R3 position 1 as competitor2', () => {
    expect(getNextSlot(2, 2)).toEqual({ round: 3, position: 1, isCompetitor1: false });
  });
});
