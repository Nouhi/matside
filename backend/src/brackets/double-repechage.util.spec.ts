import {
  generateDoubleRepechageMatches,
  halfFor,
  isDoubleRepechageBracketSize,
  totalRoundsFor,
} from './double-repechage.util';

describe('isDoubleRepechageBracketSize', () => {
  it('is false for fewer than 16 competitors', () => {
    [4, 8, 15].forEach((n) => expect(isDoubleRepechageBracketSize(n)).toBe(false));
  });

  it('is true for 16+ competitors', () => {
    [16, 32, 64].forEach((n) => expect(isDoubleRepechageBracketSize(n)).toBe(true));
  });
});

describe('totalRoundsFor', () => {
  it('returns 4 for 9-16 competitors (bracket size 16)', () => {
    expect(totalRoundsFor(16)).toBe(4);
    expect(totalRoundsFor(9)).toBe(4);
  });

  it('returns 5 for 17-32 (bracket size 32)', () => {
    expect(totalRoundsFor(17)).toBe(5);
    expect(totalRoundsFor(32)).toBe(5);
  });
});

describe('halfFor', () => {
  it('places top-half R1 positions in TOP', () => {
    // 16-bracket, round 1 has 8 matches, halfSize=4 → positions 1-4 = TOP
    expect(halfFor(1, 1, 4)).toBe('TOP');
    expect(halfFor(1, 4, 4)).toBe('TOP');
    expect(halfFor(1, 5, 4)).toBe('BOTTOM');
    expect(halfFor(1, 8, 4)).toBe('BOTTOM');
  });

  it('places top QFs in TOP, bottom QFs in BOTTOM', () => {
    // 16-bracket QFs are round 2, 4 matches, halfSize=2 → 1-2 TOP, 3-4 BOTTOM
    expect(halfFor(2, 1, 4)).toBe('TOP');
    expect(halfFor(2, 2, 4)).toBe('TOP');
    expect(halfFor(2, 3, 4)).toBe('BOTTOM');
    expect(halfFor(2, 4, 4)).toBe('BOTTOM');
  });

  it('places SF1 in TOP, SF2 in BOTTOM', () => {
    // 16-bracket SFs are round 3, 2 matches, halfSize=1
    expect(halfFor(3, 1, 4)).toBe('TOP');
    expect(halfFor(3, 2, 4)).toBe('BOTTOM');
  });
});

describe('generateDoubleRepechageMatches', () => {
  it('returns empty for fewer than 16 competitors', () => {
    expect(generateDoubleRepechageMatches(8)).toEqual([]);
    expect(generateDoubleRepechageMatches(15)).toEqual([]);
  });

  it('generates 15 main + 4 extras = 19 matches for n=16', () => {
    const matches = generateDoubleRepechageMatches(16);
    expect(matches).toHaveLength(19);

    const main = matches.filter((m) => m.phase === null);
    const repechage = matches.filter((m) => m.phase === 'REPECHAGE');
    const bronze = matches.filter((m) => m.phase === 'KNOCKOUT_BRONZE');

    expect(main).toHaveLength(15);          // R1(8) + QF(4) + SF(2) + Final(1)
    expect(repechage).toHaveLength(2);      // TOP + BOTTOM
    expect(bronze).toHaveLength(2);         // TOP + BOTTOM
  });

  it('main bracket positions match single-repechage util output', () => {
    const matches = generateDoubleRepechageMatches(16);
    const main = matches.filter((m) => m.phase === null);
    expect(main[0]).toMatchObject({ round: 1, poolPosition: 1, competitor1Index: 0, competitor2Index: 15 });
  });

  it('repechage and bronze slots are TOP+BOTTOM tagged via poolGroup', () => {
    const matches = generateDoubleRepechageMatches(16);
    const rep = matches.filter((m) => m.phase === 'REPECHAGE');
    const bronze = matches.filter((m) => m.phase === 'KNOCKOUT_BRONZE');
    expect(rep.map((m) => m.poolGroup).sort()).toEqual(['BOTTOM', 'TOP']);
    expect(bronze.map((m) => m.poolGroup).sort()).toEqual(['BOTTOM', 'TOP']);
  });

  it('repechage and bronze slots have no competitors initially', () => {
    const matches = generateDoubleRepechageMatches(16);
    const extras = matches.filter((m) => m.phase !== null);
    extras.forEach((m) => {
      expect(m.competitor1Index).toBeNull();
      expect(m.competitor2Index).toBeNull();
    });
  });

  it('handles n=17 (bracket size 32 with 15 byes)', () => {
    const matches = generateDoubleRepechageMatches(17);
    const repAndBronze = matches.filter((m) => m.phase !== null);
    expect(repAndBronze).toHaveLength(4);
  });
});
