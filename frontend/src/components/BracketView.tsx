import { useMemo, useState } from 'react';

interface Competitor {
  id: string;
  firstName: string;
  lastName: string;
}

interface Match {
  id: string;
  round: number;
  poolPosition: number;
  status: string;
  competitor1?: Competitor | null;
  competitor2?: Competitor | null;
  winner?: Competitor | null;
  winMethod?: string | null;
}

interface Category {
  id: string;
  name: string;
  gender: string;
  ageGroup: string;
  bracketType: string;
  minWeight?: number;
  maxWeight?: number;
  competitors: Competitor[];
  matches: Match[];
  _count?: { competitors: number };
}

const BRACKET_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round Robin',
  SINGLE_REPECHAGE: 'Single Repechage',
  DOUBLE_REPECHAGE: 'Double Repechage',
};

const WIN_METHOD_SHORT: Record<string, string> = {
  IPPON: 'IPP',
  WAZA_ARI: 'WZA',
  DECISION: 'DEC',
  HANSOKU_MAKE: 'HNS',
  FUSEN_GACHI: 'FUS',
  KIKEN_GACHI: 'KIK',
};

const CARD_W = 184;
const CARD_H = 56;
const COL_GAP = 48;
const ROW_GAP = 12;
const HEADER_H = 28;

function extractWeight(name: string): string {
  const m = name.match(/(\+?\d+(?:\.\d+)?)\s*kg/i);
  if (m) return `${m[1]}kg`;
  const m2 = name.match(/([<>+-]?\d+(?:\.\d+)?)/);
  if (m2) return `${m2[1]}kg`;
  return name;
}

function parseGenderFromCategory(cat: Category): 'MALE' | 'FEMALE' {
  if (cat.gender === 'FEMALE' || cat.gender === 'F') return 'FEMALE';
  return 'MALE';
}

export function BracketView({ categories }: { categories: Category[] }) {
  const categoriesWithContent = categories.filter(
    (c) => (c.matches?.length ?? 0) > 0 || (c._count?.competitors ?? c.competitors?.length ?? 0) > 1
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const { male, female } = useMemo(() => {
    const m: Category[] = [];
    const f: Category[] = [];
    for (const cat of categoriesWithContent) {
      if (parseGenderFromCategory(cat) === 'FEMALE') {
        f.push(cat);
      } else {
        m.push(cat);
      }
    }
    return { male: m, female: f };
  }, [categoriesWithContent]);

  const activeCategory = useMemo(() => {
    if (selectedCategoryId) {
      return categoriesWithContent.find((c) => c.id === selectedCategoryId) ?? null;
    }
    return categoriesWithContent[0] ?? null;
  }, [selectedCategoryId, categoriesWithContent]);

  if (categoriesWithContent.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        No brackets generated yet. Generate categories first, then generate brackets.
      </div>
    );
  }

  return (
    <div className="p-4">
      <CategorySelector
        male={male}
        female={female}
        activeCategoryId={activeCategory?.id ?? null}
        onSelect={setSelectedCategoryId}
      />
      {activeCategory && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{activeCategory.name}</h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                activeCategory.bracketType === 'ROUND_ROBIN'
                  ? 'bg-purple-100 text-purple-700'
                  : activeCategory.bracketType === 'SINGLE_REPECHAGE'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {BRACKET_LABELS[activeCategory.bracketType] || activeCategory.bracketType}
            </span>
            <span className="text-sm text-gray-500">
              {activeCategory.competitors?.length ?? 0} competitors
            </span>
          </div>
          {activeCategory.bracketType === 'ROUND_ROBIN' ? (
            <RoundRobinGrid category={activeCategory} />
          ) : (
            <EliminationBracket category={activeCategory} />
          )}
        </div>
      )}
    </div>
  );
}

function CategorySelector({
  male,
  female,
  activeCategoryId,
  onSelect,
}: {
  male: Category[];
  female: Category[];
  activeCategoryId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {male.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-6 shrink-0">M</span>
          {male.map((cat) => (
            <CategoryPill
              key={cat.id}
              category={cat}
              isActive={activeCategoryId === cat.id}
              onClick={() => onSelect(cat.id)}
            />
          ))}
        </div>
      )}
      {female.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-6 shrink-0">F</span>
          {female.map((cat) => (
            <CategoryPill
              key={cat.id}
              category={cat}
              isActive={activeCategoryId === cat.id}
              onClick={() => onSelect(cat.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryPill({
  category,
  isActive,
  onClick,
}: {
  category: Category;
  isActive: boolean;
  onClick: () => void;
}) {
  const weight = extractWeight(category.name);
  const count = category._count?.competitors ?? category.competitors?.length ?? 0;

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? 'bg-gray-900 text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400 hover:text-gray-900'
      }`}
    >
      {weight}
      <span className={`ml-1.5 text-xs ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
        {count}
      </span>
    </button>
  );
}

function RoundRobinGrid({ category }: { category: Category }) {
  const competitors = category.competitors ?? [];
  const matches = category.matches ?? [];

  const resultMap = useMemo(() => {
    const map = new Map<string, { winner: boolean; method?: string | null }>();
    for (const match of matches) {
      if (match.status !== 'COMPLETED' || !match.winner) continue;
      const c1Id = match.competitor1?.id;
      const c2Id = match.competitor2?.id;
      if (!c1Id || !c2Id) continue;
      const winnerId = match.winner.id;
      map.set(`${c1Id}-${c2Id}`, { winner: winnerId === c1Id, method: match.winMethod });
      map.set(`${c2Id}-${c1Id}`, { winner: winnerId === c2Id, method: match.winMethod });
    }
    return map;
  }, [matches]);

  if (competitors.length === 0) {
    return <div className="text-sm text-gray-500">No competitors in this category.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 border border-gray-200 min-w-[160px]">
              Competitor
            </th>
            {competitors.map((_, i) => (
              <th
                key={i}
                className="bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-500 border border-gray-200 min-w-[48px]"
              >
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {competitors.map((row, ri) => (
            <tr key={row.id}>
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-900 border border-gray-200 whitespace-nowrap">
                <span className="text-gray-400 mr-2 text-xs">{ri + 1}</span>
                {row.lastName.toUpperCase()} {row.firstName[0]}.
              </td>
              {competitors.map((col, ci) => {
                if (ri === ci) {
                  return (
                    <td key={col.id} className="bg-gray-100 border border-gray-200 w-12 h-10" />
                  );
                }
                const result = resultMap.get(`${row.id}-${col.id}`);
                return (
                  <td key={col.id} className="border border-gray-200 text-center w-12 h-10">
                    {result ? (
                      <span
                        className={`text-xs font-bold ${
                          result.winner ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {result.winner ? 'W' : 'L'}
                      </span>
                    ) : (
                      <span className="text-gray-300">&mdash;</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CardPosition {
  x: number;
  y: number;
  centerY: number;
  match: Match | null;
}

function EliminationBracket({ category }: { category: Category }) {
  const competitors = category.competitors ?? [];
  const matches = category.matches ?? [];
  const competitorCount = competitors.length;

  const layout = useMemo(() => {
    if (competitorCount <= 1) return null;

    const totalRounds = Math.ceil(Math.log2(competitorCount));
    const bracketSize = Math.pow(2, totalRounds);

    const matchesByRound = new Map<number, Match[]>();
    for (const match of matches) {
      const existing = matchesByRound.get(match.round) ?? [];
      existing.push(match);
      matchesByRound.set(match.round, existing);
    }
    for (const [, arr] of matchesByRound) {
      arr.sort((a, b) => a.poolPosition - b.poolPosition);
    }

    const roundNames: string[] = [];
    for (let r = 1; r <= totalRounds; r++) {
      const matchesInRound = bracketSize / Math.pow(2, r);
      if (r === totalRounds) roundNames.push('Final');
      else if (matchesInRound === 2) roundNames.push('Semi-Finals');
      else if (matchesInRound === 4) roundNames.push('Quarter-Finals');
      else roundNames.push(`Round ${r}`);
    }

    const colWidth = CARD_W + COL_GAP;
    const firstRoundSlots = bracketSize / 2;
    const totalHeight = HEADER_H + firstRoundSlots * (CARD_H + ROW_GAP) - ROW_GAP;
    const totalWidth = totalRounds * colWidth - COL_GAP + CARD_W;

    const roundCards: CardPosition[][] = [];

    for (let r = 0; r < totalRounds; r++) {
      const slotsInRound = bracketSize / Math.pow(2, r + 1);
      const existingMatches = matchesByRound.get(r + 1) ?? [];
      const cards: CardPosition[] = [];

      if (r === 0) {
        for (let i = 0; i < slotsInRound; i++) {
          const y = HEADER_H + i * (CARD_H + ROW_GAP);
          cards.push({
            x: 0,
            y,
            centerY: y + CARD_H / 2,
            match: existingMatches[i] ?? null,
          });
        }
      } else {
        const prevCards = roundCards[r - 1];
        for (let i = 0; i < slotsInRound; i++) {
          const top = prevCards[i * 2];
          const bottom = prevCards[i * 2 + 1];
          const midY = (top.centerY + bottom.centerY) / 2;
          const y = midY - CARD_H / 2;
          cards.push({
            x: r * colWidth,
            y,
            centerY: midY,
            match: existingMatches[i] ?? null,
          });
        }
      }
      roundCards.push(cards);
    }

    const connectors: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let r = 0; r < totalRounds - 1; r++) {
      const currentCards = roundCards[r];
      const nextCards = roundCards[r + 1];
      for (let i = 0; i < nextCards.length; i++) {
        const top = currentCards[i * 2];
        const bottom = currentCards[i * 2 + 1];
        const target = nextCards[i];
        const exitX = top.x + CARD_W;
        const midX = exitX + COL_GAP / 2;
        const entryX = target.x;

        connectors.push({ x1: exitX, y1: top.centerY, x2: midX, y2: top.centerY });
        connectors.push({ x1: exitX, y1: bottom.centerY, x2: midX, y2: bottom.centerY });
        connectors.push({ x1: midX, y1: top.centerY, x2: midX, y2: bottom.centerY });
        connectors.push({ x1: midX, y1: target.centerY, x2: entryX, y2: target.centerY });
      }
    }

    return { totalRounds, roundNames, roundCards, connectors, totalWidth, totalHeight, colWidth };
  }, [competitorCount, matches]);

  if (!layout) {
    return <div className="text-sm text-gray-500">Not enough competitors for a bracket.</div>;
  }

  const { totalRounds, roundNames, roundCards, connectors, totalWidth, totalHeight, colWidth } = layout;
  const showRepechage = competitorCount >= 5;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
        <svg
          className="absolute inset-0 pointer-events-none"
          width={totalWidth}
          height={totalHeight}
        >
          {connectors.map((c, i) => (
            <line
              key={i}
              x1={c.x1}
              y1={c.y1}
              x2={c.x2}
              y2={c.y2}
              stroke="#d1d5db"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        {roundCards.map((cards, roundIndex) => (
          <div
            key={roundIndex}
            className="absolute text-xs font-semibold text-gray-400 uppercase tracking-wide"
            style={{ left: roundIndex * colWidth, top: 0 }}
          >
            {roundNames[roundIndex]}
          </div>
        ))}

        {roundCards.map((cards) =>
          cards.map((card, i) => (
            <div
              key={card.match?.id ?? `slot-${card.x}-${i}`}
              className="absolute"
              style={{ left: card.x, top: card.y, width: CARD_W, height: CARD_H }}
            >
              <MatchCard match={card.match} />
            </div>
          ))
        )}
      </div>

      {showRepechage && (
        <RepechageSection totalRounds={totalRounds} />
      )}
    </div>
  );
}

function RepechageSection({ totalRounds }: { totalRounds: number }) {
  const hasQuarters = totalRounds >= 3;

  const stepLabels = hasQuarters
    ? ['Repechage R1', 'Repechage R2', 'Bronze Medal']
    : ['Repechage', 'Bronze Medal'];
  const steps = stepLabels.length;
  const gap = 40;
  const rowH = CARD_H;
  const pathGap = 20;

  const pathHeight = hasQuarters ? HEADER_H + 2 * rowH + 12 : HEADER_H + rowH;
  const totalHeight = pathHeight * 2 + pathGap;
  const totalWidth = steps * (CARD_W + gap) - gap;

  function buildPath(yOffset: number) {
    const cards: { x: number; y: number; label: string }[] = [];
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    if (hasQuarters) {
      const topY = yOffset + HEADER_H;
      const botY = topY + rowH + 12;
      const midY = (topY + rowH / 2 + botY + rowH / 2) / 2;

      cards.push({ x: 0, y: topY, label: 'QF Loser' });
      cards.push({ x: 0, y: botY, label: 'QF Loser' });
      cards.push({ x: CARD_W + gap, y: midY - rowH / 2, label: 'vs SF Loser' });
      cards.push({ x: 2 * (CARD_W + gap), y: midY - rowH / 2, label: 'Bronze medalist' });

      const topCY = topY + rowH / 2;
      const botCY = botY + rowH / 2;
      const jX = CARD_W + gap / 2;
      lines.push({ x1: CARD_W, y1: topCY, x2: jX, y2: topCY });
      lines.push({ x1: CARD_W, y1: botCY, x2: jX, y2: botCY });
      lines.push({ x1: jX, y1: topCY, x2: jX, y2: botCY });
      lines.push({ x1: jX, y1: midY, x2: CARD_W + gap, y2: midY });

      const jX2 = 2 * CARD_W + gap + gap / 2;
      lines.push({ x1: 2 * CARD_W + gap, y1: midY, x2: jX2, y2: midY });
      lines.push({ x1: jX2, y1: midY, x2: 2 * (CARD_W + gap), y2: midY });
    } else {
      const y = yOffset + HEADER_H;
      const cy = y + rowH / 2;
      cards.push({ x: 0, y, label: 'SF Loser vs Loser' });
      cards.push({ x: CARD_W + gap, y, label: 'Bronze medalist' });

      const jX = CARD_W + gap / 2;
      lines.push({ x1: CARD_W, y1: cy, x2: jX, y2: cy });
      lines.push({ x1: jX, y1: cy, x2: CARD_W + gap, y2: cy });
    }

    return { cards, lines };
  }

  const pathA = buildPath(0);
  const pathB = buildPath(pathHeight + pathGap);
  const allCards = [...pathA.cards, ...pathB.cards];
  const allLines = [...pathA.lines, ...pathB.lines];

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-semibold text-amber-700">Bronze Medal Fights</span>
        <div className="h-px flex-1 bg-amber-200" />
      </div>

      <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
        <svg className="absolute inset-0 pointer-events-none" width={totalWidth} height={totalHeight}>
          {allLines.map((c, i) => (
            <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 3" />
          ))}
        </svg>

        {[0, pathHeight + pathGap].map((yOff, pi) => (
          stepLabels.map((sl, si) => (
            <div
              key={`h-${pi}-${si}`}
              className="absolute text-[10px] font-semibold text-amber-500 uppercase tracking-wide"
              style={{ left: si * (CARD_W + gap), top: yOff }}
            >
              {si === 0 && (pi === 0 ? '① ' : '② ')}{sl}
            </div>
          ))
        ))}

        {allCards.map((card, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: card.x, top: card.y, width: CARD_W, height: rowH }}
          >
            <div className="w-full h-full rounded border border-dashed border-amber-300 bg-amber-50/50 flex flex-col overflow-hidden">
              <div className="flex items-center px-2 flex-1 min-h-0">
                <span className="text-xs text-amber-600/70 italic truncate">{card.label}</span>
              </div>
              <div className="border-t border-amber-200" />
              <div className="flex items-center px-2 flex-1 min-h-0">
                <span className="text-xs text-amber-600/70 italic truncate">TBD</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: Match | null }) {
  const c1 = match?.competitor1;
  const c2 = match?.competitor2;
  const winner = match?.winner;
  const isCompleted = match?.status === 'COMPLETED';
  const isActive = match?.status === 'ACTIVE';

  const c1Name = c1 ? `${c1.lastName.toUpperCase()} ${c1.firstName[0]}.` : null;
  const c2Name = c2 ? `${c2.lastName.toUpperCase()} ${c2.firstName[0]}.` : null;
  const isC1Winner = !!(winner && c1 && winner.id === c1.id);
  const isC2Winner = !!(winner && c2 && winner.id === c2.id);

  const borderClass = isActive
    ? 'border-amber-400 bg-amber-50/50 shadow-sm shadow-amber-100'
    : isCompleted
      ? 'border-gray-300 bg-white'
      : match
        ? 'border-gray-200 bg-white'
        : 'border-dashed border-gray-200 bg-gray-50/50';

  return (
    <div className={`w-full h-full rounded border text-xs overflow-hidden flex flex-col ${borderClass}`}>
      <div className={`flex items-center justify-between px-2 flex-1 min-h-0 ${isC1Winner ? 'bg-green-50' : ''}`}>
        <span
          className={`truncate ${
            !c1Name
              ? 'text-gray-300 italic'
              : isC1Winner
                ? 'font-semibold text-gray-900'
                : isCompleted
                  ? 'text-gray-400'
                  : 'text-gray-700'
          }`}
        >
          {c1Name ?? (match ? 'TBD' : 'TBD')}
        </span>
        {isCompleted && isC1Winner && match?.winMethod && (
          <span className="ml-1 px-1 py-px rounded bg-green-100 text-green-700 text-[10px] font-bold leading-tight shrink-0">
            {WIN_METHOD_SHORT[match.winMethod] ?? match.winMethod}
          </span>
        )}
      </div>
      <div className="border-t border-gray-200" />
      <div className={`flex items-center justify-between px-2 flex-1 min-h-0 ${isC2Winner ? 'bg-green-50' : ''}`}>
        <span
          className={`truncate ${
            !c2Name
              ? 'text-gray-300 italic'
              : isC2Winner
                ? 'font-semibold text-gray-900'
                : isCompleted
                  ? 'text-gray-400'
                  : 'text-gray-700'
          }`}
        >
          {c2Name ?? (match ? 'TBD' : 'TBD')}
        </span>
        {isCompleted && isC2Winner && match?.winMethod && (
          <span className="ml-1 px-1 py-px rounded bg-green-100 text-green-700 text-[10px] font-bold leading-tight shrink-0">
            {WIN_METHOD_SHORT[match.winMethod] ?? match.winMethod}
          </span>
        )}
      </div>
    </div>
  );
}
