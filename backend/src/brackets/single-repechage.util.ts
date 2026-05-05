export interface BracketMatch {
  round: number;
  poolPosition: number;
  competitor1Index: number | null;
  competitor2Index: number | null;
}

export function generateSingleRepechageMatches(competitorCount: number): BracketMatch[] {
  const bracketSize = nextPowerOfTwo(competitorCount);
  const firstRoundMatches = bracketSize / 2;
  const byes = bracketSize - competitorCount;
  const matches: BracketMatch[] = [];

  const seeds = generateSeedings(bracketSize);

  let poolPosition = 0;
  for (let i = 0; i < firstRoundMatches; i++) {
    const seed1 = seeds[i * 2];
    const seed2 = seeds[i * 2 + 1];

    const c1 = seed1 < competitorCount ? seed1 : null;
    const c2 = seed2 < competitorCount ? seed2 : null;

    if (c1 === null || c2 === null) continue;

    poolPosition++;
    matches.push({
      round: 1,
      poolPosition,
      competitor1Index: c1,
      competitor2Index: c2,
    });
  }

  return matches;
}

function nextPowerOfTwo(n: number): number {
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}

function generateSeedings(bracketSize: number): number[] {
  if (bracketSize === 1) return [0];
  if (bracketSize === 2) return [0, 1];

  const smaller = generateSeedings(bracketSize / 2);
  const result: number[] = [];

  for (const seed of smaller) {
    result.push(seed);
    result.push(bracketSize - 1 - seed);
  }

  return result;
}
