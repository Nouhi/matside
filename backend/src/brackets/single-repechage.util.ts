export interface BracketMatch {
  round: number;
  poolPosition: number;
  competitor1Index: number | null;
  competitor2Index: number | null;
}

interface SlotState {
  competitor1Index: number | null;
  competitor2Index: number | null;
}

export function generateSingleRepechageMatches(competitorCount: number): BracketMatch[] {
  if (competitorCount < 2) return [];

  const bracketSize = nextPowerOfTwo(competitorCount);
  const totalRounds = Math.log2(bracketSize);
  const seeds = generateSeedings(bracketSize);

  const slots = new Map<string, SlotState>();
  const slotKey = (round: number, position: number) => `${round}:${position}`;

  function getOrCreateSlot(round: number, position: number): SlotState {
    const key = slotKey(round, position);
    let slot = slots.get(key);
    if (!slot) {
      slot = { competitor1Index: null, competitor2Index: null };
      slots.set(key, slot);
    }
    return slot;
  }

  function placeAdvancer(
    fromRound: number,
    fromPosition: number,
    competitorIndex: number,
  ) {
    const nextRound = fromRound + 1;
    const nextPosition = Math.ceil(fromPosition / 2);
    const slot = getOrCreateSlot(nextRound, nextPosition);
    if (fromPosition % 2 === 1) {
      slot.competitor1Index = competitorIndex;
    } else {
      slot.competitor2Index = competitorIndex;
    }
  }

  const r1MatchCount = bracketSize / 2;
  for (let position = 1; position <= r1MatchCount; position++) {
    const seed1 = seeds[(position - 1) * 2];
    const seed2 = seeds[(position - 1) * 2 + 1];
    const c1 = seed1 < competitorCount ? seed1 : null;
    const c2 = seed2 < competitorCount ? seed2 : null;

    // Always create the R1 slot when at least one competitor is real, even
    // when the opponent is a bye. This keeps the round-1 data dense so the
    // UI can show "MOLLAEI vs BYE" instead of bye-getters materializing in
    // round 2 with no R1 trail. The bye-getter is still pre-advanced into
    // the round-2 slot via placeAdvancer.
    if (c1 !== null && c2 !== null) {
      const slot = getOrCreateSlot(1, position);
      slot.competitor1Index = c1;
      slot.competitor2Index = c2;
    } else if (c1 !== null) {
      const slot = getOrCreateSlot(1, position);
      slot.competitor1Index = c1;
      slot.competitor2Index = null;
      placeAdvancer(1, position, c1);
    } else if (c2 !== null) {
      const slot = getOrCreateSlot(1, position);
      slot.competitor1Index = null;
      slot.competitor2Index = c2;
      placeAdvancer(1, position, c2);
    }
    // both null (only when bracketSize ≫ N): no slot — empty pair.
  }

  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let position = 1; position <= matchesInRound; position++) {
      getOrCreateSlot(round, position);
    }
  }

  const matches: BracketMatch[] = [];
  for (const [key, slot] of slots) {
    const [round, position] = key.split(':').map(Number);
    matches.push({
      round,
      poolPosition: position,
      competitor1Index: slot.competitor1Index,
      competitor2Index: slot.competitor2Index,
    });
  }
  matches.sort((a, b) => a.round - b.round || a.poolPosition - b.poolPosition);

  return matches;
}

export function getNextSlot(
  round: number,
  position: number,
): { round: number; position: number; isCompetitor1: boolean } {
  return {
    round: round + 1,
    position: Math.ceil(position / 2),
    isCompetitor1: position % 2 === 1,
  };
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
