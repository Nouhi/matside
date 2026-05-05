export interface BracketMatch {
  round: number;
  poolPosition: number;
  competitor1Index: number | null;
  competitor2Index: number | null;
}

export function generateRoundRobinMatches(competitorCount: number): BracketMatch[] {
  if (competitorCount < 2) return [];

  const n = competitorCount % 2 === 0 ? competitorCount : competitorCount + 1;
  const rounds = n - 1;
  const matchesPerRound = n / 2;
  const matches: BracketMatch[] = [];

  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(i);
  }

  for (let round = 0; round < rounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const home = indices[match];
      const away = indices[n - 1 - match];

      const isBye = (competitorCount % 2 !== 0) && (home >= competitorCount || away >= competitorCount);
      if (isBye) continue;

      matches.push({
        round: round + 1,
        poolPosition: match + 1,
        competitor1Index: home,
        competitor2Index: away,
      });
    }

    const last = indices.pop()!;
    indices.splice(1, 0, last);
  }

  return matches;
}
