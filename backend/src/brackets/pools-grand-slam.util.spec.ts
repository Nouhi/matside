import {
  distributePoolSizes,
  generateGrandSlamMatches,
  isGrandSlamBracketSize,
  snakeAssignToPools,
} from './pools-grand-slam.util';

describe('isGrandSlamBracketSize', () => {
  it('rejects under 16', () => {
    expect(isGrandSlamBracketSize(15)).toBe(false);
    expect(isGrandSlamBracketSize(8)).toBe(false);
  });
  it('accepts 16+', () => {
    expect(isGrandSlamBracketSize(16)).toBe(true);
    expect(isGrandSlamBracketSize(22)).toBe(true);
    expect(isGrandSlamBracketSize(64)).toBe(true);
  });
});

describe('distributePoolSizes — smallest pools last', () => {
  it('22 → 6/6/5/5 (matches the IJF Grand Slam example PDF)', () => {
    expect(distributePoolSizes(22)).toEqual([6, 6, 5, 5]);
  });
  it('17 → 5/4/4/4', () => {
    expect(distributePoolSizes(17)).toEqual([5, 4, 4, 4]);
  });
  it('20 → 5/5/5/5 (no extras)', () => {
    expect(distributePoolSizes(20)).toEqual([5, 5, 5, 5]);
  });
  it('16 → 4/4/4/4', () => {
    expect(distributePoolSizes(16)).toEqual([4, 4, 4, 4]);
  });
  it('19 → 5/5/5/4', () => {
    expect(distributePoolSizes(19)).toEqual([5, 5, 5, 4]);
  });
  it('every distribution sums to N', () => {
    for (let n = 16; n <= 64; n++) {
      const sizes = distributePoolSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
    }
  });
  it('distribution is non-increasing (smallest last invariant)', () => {
    for (let n = 16; n <= 64; n++) {
      const sizes = distributePoolSizes(n);
      expect(sizes[0]).toBeGreaterThanOrEqual(sizes[1]);
      expect(sizes[1]).toBeGreaterThanOrEqual(sizes[2]);
      expect(sizes[2]).toBeGreaterThanOrEqual(sizes[3]);
    }
  });
});

describe('snakeAssignToPools', () => {
  it('top 4 seeds spread across A/B/C/D in order', () => {
    const a = snakeAssignToPools(20);
    expect(a.find((x) => x.competitorIndex === 0)?.pool).toBe(0); // → A
    expect(a.find((x) => x.competitorIndex === 1)?.pool).toBe(1); // → B
    expect(a.find((x) => x.competitorIndex === 2)?.pool).toBe(2); // → C
    expect(a.find((x) => x.competitorIndex === 3)?.pool).toBe(3); // → D
  });
  it('seeds 5-8 snake back D/C/B/A', () => {
    const a = snakeAssignToPools(20);
    expect(a.find((x) => x.competitorIndex === 4)?.pool).toBe(3); // → D
    expect(a.find((x) => x.competitorIndex === 5)?.pool).toBe(2); // → C
    expect(a.find((x) => x.competitorIndex === 6)?.pool).toBe(1); // → B
    expect(a.find((x) => x.competitorIndex === 7)?.pool).toBe(0); // → A
  });
  it('every competitor gets exactly one assignment', () => {
    for (const n of [16, 19, 22, 32]) {
      const a = snakeAssignToPools(n);
      expect(a).toHaveLength(n);
      const seen = new Set(a.map((x) => x.competitorIndex));
      expect(seen.size).toBe(n);
    }
  });
});

describe('generateGrandSlamMatches', () => {
  it('returns empty for under 16', () => {
    expect(generateGrandSlamMatches(15)).toEqual([]);
  });

  it('produces all the structural placeholders for 22 competitors', () => {
    const matches = generateGrandSlamMatches(22);
    const phases = matches.map((m) => m.phase);

    expect(phases.filter((p) => p === 'KNOCKOUT_SF')).toHaveLength(2);
    expect(phases.filter((p) => p === 'KNOCKOUT_FINAL')).toHaveLength(1);
    expect(phases.filter((p) => p === 'REPECHAGE')).toHaveLength(2);
    expect(phases.filter((p) => p === 'KNOCKOUT_BRONZE')).toHaveLength(2);

    // Repechage and bronze each have one TOP and one BOTTOM half.
    const repHalves = matches
      .filter((m) => m.phase === 'REPECHAGE')
      .map((m) => m.poolGroup)
      .sort();
    expect(repHalves).toEqual(['BOTTOM', 'TOP']);
    const bronzeHalves = matches
      .filter((m) => m.phase === 'KNOCKOUT_BRONZE')
      .map((m) => m.poolGroup)
      .sort();
    expect(bronzeHalves).toEqual(['BOTTOM', 'TOP']);
  });

  it('every pool gets at least one POOL match for 22 competitors', () => {
    const matches = generateGrandSlamMatches(22);
    const poolGroups = new Set(
      matches.filter((m) => m.phase === 'POOL').map((m) => m.poolGroup),
    );
    expect(poolGroups).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('all 22 competitors are placed somewhere in pool R1 slots', () => {
    const matches = generateGrandSlamMatches(22);
    const placedIndices = new Set<number>();
    for (const m of matches.filter((m) => m.phase === 'POOL')) {
      if (m.competitor1Index !== null) placedIndices.add(m.competitor1Index);
      if (m.competitor2Index !== null) placedIndices.add(m.competitor2Index);
    }
    for (let i = 0; i < 22; i++) {
      expect(placedIndices.has(i)).toBe(true);
    }
  });
});
