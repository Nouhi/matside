import { useMemo, useState } from 'react';
import { bracketLabel, bracketPillClass } from '@/lib/bracket';

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
  phase?: string | null;
  poolGroup?: string | null;
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
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${bracketPillClass(activeCategory.bracketType)}`}>
              {bracketLabel(activeCategory.bracketType)}
            </span>
            <span className="text-sm text-gray-500">
              {activeCategory.competitors?.length ?? 0} competitors
            </span>
          </div>
          {activeCategory.bracketType === 'ROUND_ROBIN' ? (
            <RoundRobinGrid category={activeCategory} />
          ) : activeCategory.bracketType === 'POOLS' ? (
            <PoolsBracketView category={activeCategory} />
          ) : activeCategory.bracketType === 'GRAND_SLAM' ? (
            <GrandSlamBracketView category={activeCategory} />
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
      <table className="border-collapse w-full text-base">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-5 py-4 text-left text-sm font-bold uppercase tracking-wider text-gray-500 border border-gray-200 min-w-[280px]">
              Competitor
            </th>
            {competitors.map((_, i) => (
              <th
                key={i}
                className="bg-gray-50 px-3 py-4 text-center text-sm font-bold tabular-nums text-gray-500 border border-gray-200 min-w-[80px]"
              >
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {competitors.map((row, ri) => (
            <tr key={row.id}>
              <td className="sticky left-0 z-10 bg-white px-5 py-4 border border-gray-200 whitespace-nowrap">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm font-bold tabular-nums w-6">{ri + 1}</span>
                  <span className="font-bold text-lg uppercase tracking-wide text-gray-900">
                    {row.lastName} {row.firstName[0]}.
                  </span>
                </div>
                {row.club && (
                  <div className="text-xs text-gray-500 mt-0.5 ml-9">{row.club}</div>
                )}
              </td>
              {competitors.map((col, ci) => {
                if (ri === ci) {
                  return (
                    <td
                      key={col.id}
                      className="bg-gray-100 border border-gray-200"
                      style={{ minWidth: 80, height: 72 }}
                    />
                  );
                }
                const result = resultMap.get(`${row.id}-${col.id}`);
                return (
                  <td
                    key={col.id}
                    className="border border-gray-200 text-center"
                    style={{ minWidth: 80, height: 72 }}
                  >
                    {result ? (
                      <span
                        className={`text-2xl font-black ${
                          result.winner ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {result.winner ? 'W' : 'L'}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-2xl">·</span>
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

function PoolsBracketView({ category }: { category: Category }) {
  const competitors = category.competitors ?? [];
  const matches = category.matches ?? [];

  const poolMatches = matches.filter((m) => m.phase === 'POOL');
  const sfMatches = matches.filter((m) => m.phase === 'KNOCKOUT_SF').sort((a, b) => a.poolPosition - b.poolPosition);
  const finalMatch = matches.find((m) => m.phase === 'KNOCKOUT_FINAL');
  const bronzeMatch = matches.find((m) => m.phase === 'KNOCKOUT_BRONZE');

  const poolGroups = Array.from(new Set(poolMatches.map((m) => m.poolGroup ?? '').filter(Boolean))).sort();

  const competitorsByPool = useMemo(() => {
    const map = new Map<string, Competitor[]>();
    for (const group of poolGroups) map.set(group, []);
    const seen = new Set<string>();
    for (const m of poolMatches) {
      const group = m.poolGroup;
      if (!group) continue;
      const list = map.get(group) ?? [];
      for (const c of [m.competitor1, m.competitor2]) {
        if (c && !seen.has(`${group}-${c.id}`)) {
          list.push(c);
          seen.add(`${group}-${c.id}`);
        }
      }
      map.set(group, list);
    }
    return map;
  }, [poolMatches, poolGroups]);

  const knockoutFormat: 'TWO_TEAM' | 'FOUR_TEAM' = sfMatches.length > 0 ? 'FOUR_TEAM' : 'TWO_TEAM';

  return (
    <div className="space-y-6">
      {/* Pool stage */}
      <div className="grid gap-6" style={{ gridTemplateColumns: poolGroups.length > 1 ? `repeat(${poolGroups.length}, minmax(0, 1fr))` : '1fr' }}>
        {poolGroups.map((group) => (
          <PoolBlock
            key={group}
            group={group}
            competitors={competitorsByPool.get(group) ?? []}
            matches={poolMatches.filter((m) => m.poolGroup === group)}
          />
        ))}
      </div>

      {/* Knockout stage */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Knockout</h4>
        <div className="flex flex-wrap items-start gap-6">
          {knockoutFormat === 'FOUR_TEAM' && (
            <KnockoutColumn label="Semi-finals">
              {sfMatches.map((m) => (
                <KnockoutCard key={m.id} match={m} title={`SF ${m.poolPosition}`} />
              ))}
            </KnockoutColumn>
          )}
          <KnockoutColumn label="Final">
            <KnockoutCard match={finalMatch ?? null} title="Final" gold />
          </KnockoutColumn>
          <KnockoutColumn label="Bronze">
            <KnockoutCard match={bronzeMatch ?? null} title="Bronze" bronze />
          </KnockoutColumn>
        </div>
        {(competitors.length > 0 && poolMatches.length > 0 && finalMatch == null) && (
          <p className="mt-3 text-xs text-gray-500 italic">
            Knockout matches will be created automatically when both pools finish.
          </p>
        )}
      </div>
    </div>
  );
}

function PoolBlock({
  group,
  competitors,
  matches,
}: {
  group: string;
  competitors: Competitor[];
  matches: Match[];
}) {
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

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-baseline gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Pool</span>
        <span className="text-2xl font-black text-gray-900 leading-none">{group}</span>
        <span className="text-sm text-gray-500 ml-auto">{competitors.length} competitors</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200 min-w-[180px]">
                Competitor
              </th>
              {competitors.map((_, i) => (
                <th
                  key={i}
                  className="bg-gray-50 px-2 py-2 text-center text-xs font-bold tabular-nums text-gray-500 border-b border-gray-200 min-w-[44px]"
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {competitors.map((row, ri) => (
              <tr key={row.id}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                  <span className="text-gray-400 text-xs font-bold mr-2 tabular-nums">{ri + 1}</span>
                  <span className="font-bold text-base uppercase tracking-wide text-gray-900">
                    {row.lastName} {row.firstName[0]}.
                  </span>
                </td>
                {competitors.map((col, ci) => {
                  if (ri === ci) {
                    return (
                      <td key={col.id} className="bg-gray-100 border-b border-gray-100" style={{ minWidth: 44, height: 40 }} />
                    );
                  }
                  const result = resultMap.get(`${row.id}-${col.id}`);
                  return (
                    <td key={col.id} className="border-b border-gray-100 text-center" style={{ minWidth: 44, height: 40 }}>
                      {result ? (
                        <span className={`text-base font-black ${result.winner ? 'text-green-700' : 'text-red-600'}`}>
                          {result.winner ? 'W' : 'L'}
                        </span>
                      ) : (
                        <span className="text-gray-300">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KnockoutColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      {children}
    </div>
  );
}

function KnockoutCard({
  match,
  title,
  gold,
  bronze,
}: {
  match: Match | null;
  title: string;
  gold?: boolean;
  bronze?: boolean;
}) {
  const c1Name = match?.competitor1 ? `${match.competitor1.lastName.toUpperCase()} ${match.competitor1.firstName[0]}.` : null;
  const c2Name = match?.competitor2 ? `${match.competitor2.lastName.toUpperCase()} ${match.competitor2.firstName[0]}.` : null;
  const winner = match?.winner;
  const isCompleted = match?.status === 'COMPLETED';
  const isC1Winner = !!(winner && match?.competitor1 && winner.id === match.competitor1.id);
  const isC2Winner = !!(winner && match?.competitor2 && winner.id === match.competitor2.id);

  const borderClass = gold
    ? 'border-amber-400 bg-amber-50/30'
    : bronze
      ? 'border-amber-700/50 bg-orange-50/30'
      : 'border-gray-300 bg-white';

  return (
    <div className="flex flex-col" style={{ width: CARD_W }}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{title}</div>
      <div className={`rounded border ${borderClass} text-xs overflow-hidden`}>
        <div className={`flex items-center justify-between px-2 py-1.5 ${isC1Winner ? 'bg-green-50' : ''}`} style={{ minHeight: 28 }}>
          <span className={`truncate ${!c1Name ? 'text-gray-300 italic' : isC1Winner ? 'font-bold text-gray-900' : isCompleted ? 'text-gray-400' : 'text-gray-700'}`}>
            {c1Name ?? 'TBD'}
          </span>
          {isCompleted && isC1Winner && match?.winMethod && (
            <span className="ml-1 px-1 py-px rounded bg-green-100 text-green-700 text-[9px] font-bold leading-tight shrink-0">
              {WIN_METHOD_SHORT[match.winMethod] ?? match.winMethod}
            </span>
          )}
        </div>
        <div className="border-t border-gray-200" />
        <div className={`flex items-center justify-between px-2 py-1.5 ${isC2Winner ? 'bg-green-50' : ''}`} style={{ minHeight: 28 }}>
          <span className={`truncate ${!c2Name ? 'text-gray-300 italic' : isC2Winner ? 'font-bold text-gray-900' : isCompleted ? 'text-gray-400' : 'text-gray-700'}`}>
            {c2Name ?? 'TBD'}
          </span>
          {isCompleted && isC2Winner && match?.winMethod && (
            <span className="ml-1 px-1 py-px rounded bg-green-100 text-green-700 text-[9px] font-bold leading-tight shrink-0">
              {WIN_METHOD_SHORT[match.winMethod] ?? match.winMethod}
            </span>
          )}
        </div>
      </div>
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

    // Index by (round, poolPosition) so a sparse round (R1 with bye gaps)
    // renders into the right visual slot. Indexing by array order would
    // shift matches into wrong slots and break the bracket connector lines.
    const matchAt = new Map<string, Match>();
    for (const match of matches) {
      if (match.phase) continue; // skip repechage / bronze / pool — laid out elsewhere
      matchAt.set(`${match.round}:${match.poolPosition}`, match);
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
      const cards: CardPosition[] = [];

      if (r === 0) {
        for (let i = 0; i < slotsInRound; i++) {
          const y = HEADER_H + i * (CARD_H + ROW_GAP);
          // Slot i corresponds to poolPosition i+1 in the data.
          cards.push({
            x: 0,
            y,
            centerY: y + CARD_H / 2,
            match: matchAt.get(`1:${i + 1}`) ?? null,
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
            match: matchAt.get(`${r + 1}:${i + 1}`) ?? null,
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

        {roundCards.map((_, roundIndex) => (
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

      {showRepechage && category.bracketType === 'DOUBLE_REPECHAGE' ? (
        <RepechageBronzeFights category={category} />
      ) : showRepechage ? (
        <RepechageSection totalRounds={totalRounds} />
      ) : null}
    </div>
  );
}

function RepechageBronzeFights({ category }: { category: Category }) {
  const matches = category.matches ?? [];
  const repTop = matches.find((m) => m.phase === 'REPECHAGE' && m.poolGroup === 'TOP');
  const repBot = matches.find((m) => m.phase === 'REPECHAGE' && m.poolGroup === 'BOTTOM');
  const bronzeTop = matches.find((m) => m.phase === 'KNOCKOUT_BRONZE' && m.poolGroup === 'TOP');
  const bronzeBot = matches.find((m) => m.phase === 'KNOCKOUT_BRONZE' && m.poolGroup === 'BOTTOM');

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-bold uppercase tracking-widest text-amber-700">Repechage + Bronze Medal Fights</span>
        <div className="h-px flex-1 bg-amber-200" />
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <RepechagePath label="Top half" repechage={repTop ?? null} bronze={bronzeTop ?? null} />
        <RepechagePath label="Bottom half" repechage={repBot ?? null} bronze={bronzeBot ?? null} />
      </div>
    </div>
  );
}

function RepechagePath({
  label,
  repechage,
  bronze,
}: {
  label: string;
  repechage: Match | null;
  bronze: Match | null;
}) {
  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden">
      <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
        <span className="text-xs font-bold uppercase tracking-widest text-amber-700">{label}</span>
      </div>
      <div className="p-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Repechage</div>
          <div style={{ width: CARD_W }}>
            <MatchCard match={repechage} />
          </div>
        </div>
        <div className="text-amber-400 text-xl">→</div>
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Bronze</div>
          <div style={{ width: CARD_W }}>
            <MatchCard match={bronze} />
          </div>
        </div>
      </div>
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

  // A bye is a match record where exactly one competitor side is null. The
  // empty side renders as "BYE" instead of "TBD" so the user understands the
  // present competitor advanced without fighting.
  const isBye = !!match && (c1 == null) !== (c2 == null);

  const c1Name = c1 ? `${c1.lastName.toUpperCase()} ${c1.firstName[0]}.` : null;
  const c2Name = c2 ? `${c2.lastName.toUpperCase()} ${c2.firstName[0]}.` : null;
  const isC1Winner = !!(winner && c1 && winner.id === c1.id);
  const isC2Winner = !!(winner && c2 && winner.id === c2.id);

  const borderClass = isActive
    ? 'border-amber-400 bg-amber-50/50 shadow-sm shadow-amber-100'
    : isBye
      ? 'border-gray-200 bg-gray-50/40'
      : isCompleted
        ? 'border-gray-300 bg-white'
        : match
          ? 'border-gray-200 bg-white'
          : 'border-dashed border-gray-200 bg-gray-50/50';

  const emptyLabel = isBye ? 'BYE' : 'TBD';

  return (
    <div className={`w-full h-full rounded border text-xs overflow-hidden flex flex-col ${borderClass}`}>
      <div className={`flex items-center justify-between px-2 flex-1 min-h-0 ${isC1Winner ? 'bg-green-50' : ''}`}>
        <span
          className={`truncate ${
            !c1Name
              ? 'text-gray-400 italic uppercase tracking-wider text-[10px]'
              : isC1Winner
                ? 'font-semibold text-gray-900'
                : isCompleted
                  ? 'text-gray-400'
                  : 'text-gray-700'
          }`}
        >
          {c1Name ?? emptyLabel}
        </span>
        {isCompleted && isC1Winner && match?.winMethod && !isBye && (
          <span className="ml-1 px-1 py-px rounded bg-green-100 text-green-700 text-[10px] font-bold leading-tight shrink-0">
            {WIN_METHOD_SHORT[match.winMethod] ?? match.winMethod}
          </span>
        )}
        {isBye && isC1Winner && (
          <span className="ml-1 px-1 py-px rounded bg-gray-200 text-gray-600 text-[9px] font-bold leading-tight shrink-0 uppercase tracking-wider">
            adv
          </span>
        )}
      </div>
      <div className="border-t border-gray-200" />
      <div className={`flex items-center justify-between px-2 flex-1 min-h-0 ${isC2Winner ? 'bg-green-50' : ''}`}>
        <span
          className={`truncate ${
            !c2Name
              ? 'text-gray-400 italic uppercase tracking-wider text-[10px]'
              : isC2Winner
                ? 'font-semibold text-gray-900'
                : isCompleted
                  ? 'text-gray-400'
                  : 'text-gray-700'
          }`}
        >
          {c2Name ?? emptyLabel}
        </span>
        {isCompleted && isC2Winner && match?.winMethod && !isBye && (
          <span className="ml-1 px-1 py-px rounded bg-green-100 text-green-700 text-[10px] font-bold leading-tight shrink-0">
            {WIN_METHOD_SHORT[match.winMethod] ?? match.winMethod}
          </span>
        )}
        {isBye && isC2Winner && (
          <span className="ml-1 px-1 py-px rounded bg-gray-200 text-gray-600 text-[9px] font-bold leading-tight shrink-0 uppercase tracking-wider">
            adv
          </span>
        )}
      </div>
    </div>
  );
}

// ─── IJF Grand Slam 4-pool view ──────────────────────────────────────────
//
// Mirrors the IJF Grand Slam draw layout (see Qazaqstan Barysy 2026 PDF):
//
//   ┌─────────────────────────────────────────────────────────┐
//   │ POOL A [red]  ──tree──→ winner ─╮                       │
//   │                                 ├─ SF1 ──╮              │
//   │ POOL B [blue] ──tree──→ winner ─╯        │              │
//   │                                          ├─ FINAL → 🥇  │
//   │ POOL C [yellow]──tree──→ winner ─╮       │              │
//   │                                  ├─ SF2 ─╯              │
//   │ POOL D [green]──tree──→ winner ──╯                      │
//   └─────────────────────────────────────────────────────────┘
//   ┌─────────────────────────────────────────────────────────┐
//   │ REPECHAGE (full-width, below)                           │
//   │   Pool A loser ╮                                        │
//   │                ├─ REP TOP ─╮                            │
//   │   Pool B loser ╯           ├─ BRONZE TOP                │
//   │             SF2 loser ─────╯                            │
//   │   (mirror for BOTTOM half)                              │
//   └─────────────────────────────────────────────────────────┘
//
// Dimensions tuned to fit ~1280px wide layout with 4 pools of up to 6
// competitors each. SVG connectors flow rightward from pool finals into
// the SF column, then into the Final.

const GS_CARD_W = 184;
const GS_CARD_H = 40;
const GS_COL_GAP = 32;
const GS_ROW_GAP = 8;
const GS_POOL_VGAP = 32;
const GS_STRIPE_W = 4;
const GS_LABEL_W = 36;
const GS_MAIN_GAP = 64; // gap between pools and SF column
// Top padding inside the main canvas so the round/SF/Final labels — which
// sit ABOVE their cards — don't clip against the canvas edge.
const GS_HEADER_H = 24;

const POOL_COLORS: Record<
  'A' | 'B' | 'C' | 'D',
  { stripe: string; tint: string; text: string; ring: string }
> = {
  A: { stripe: 'bg-red-500',     tint: 'bg-red-50/30',     text: 'text-red-700',     ring: 'ring-red-200' },
  B: { stripe: 'bg-blue-500',    tint: 'bg-blue-50/30',    text: 'text-blue-700',    ring: 'ring-blue-200' },
  C: { stripe: 'bg-amber-500',   tint: 'bg-amber-50/30',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  D: { stripe: 'bg-emerald-500', tint: 'bg-emerald-50/30', text: 'text-emerald-700', ring: 'ring-emerald-200' },
};

interface Connector {
  x1: number; y1: number; x2: number; y2: number;
}

interface PoolLayout {
  poolGroup: 'A' | 'B' | 'C' | 'D';
  competitorCount: number;
  rounds: number;
  width: number;
  height: number;
  cards: { round: number; pos: number; x: number; y: number; centerY: number; match: Match | null }[];
  connectors: Connector[];
  finalCardCenterY: number; // y of the pool-final card (where the line exits to the right)
  finalCardX: number; // right edge x of the pool-final card
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Compute a single pool's bracket-tree layout. Cards positioned with (0,0)
// as the top-left of this pool's drawing area; caller offsets by the
// pool's stack y when composing.
function computePoolLayout(
  poolGroup: 'A' | 'B' | 'C' | 'D',
  poolMatches: Match[],
): PoolLayout | null {
  if (poolMatches.length === 0) return null;

  const competitorIds = new Set<string>();
  for (const m of poolMatches) {
    if (m.competitor1?.id) competitorIds.add(m.competitor1.id);
    if (m.competitor2?.id) competitorIds.add(m.competitor2.id);
  }
  const competitorCount = competitorIds.size;
  if (competitorCount < 2) return null;

  const bracketSize = nextPow2(competitorCount);
  const rounds = Math.log2(bracketSize);

  const matchAt = new Map<string, Match>();
  for (const m of poolMatches) {
    matchAt.set(`${m.round}:${m.poolPosition}`, m);
  }

  const colWidth = GS_CARD_W + GS_COL_GAP;
  const r1Slots = bracketSize / 2;
  const height = r1Slots * (GS_CARD_H + GS_ROW_GAP) - GS_ROW_GAP;
  const width = rounds * colWidth - GS_COL_GAP;

  const roundCards: { round: number; pos: number; x: number; y: number; centerY: number; match: Match | null }[][] = [];
  for (let r = 0; r < rounds; r++) {
    const slotsInRound = bracketSize / Math.pow(2, r + 1);
    const cards: typeof roundCards[number] = [];
    if (r === 0) {
      for (let i = 0; i < slotsInRound; i++) {
        const y = i * (GS_CARD_H + GS_ROW_GAP);
        cards.push({
          round: 1,
          pos: i + 1,
          x: 0,
          y,
          centerY: y + GS_CARD_H / 2,
          match: matchAt.get(`1:${i + 1}`) ?? null,
        });
      }
    } else {
      const prev = roundCards[r - 1];
      for (let i = 0; i < slotsInRound; i++) {
        const top = prev[i * 2];
        const bot = prev[i * 2 + 1];
        const midY = (top.centerY + bot.centerY) / 2;
        cards.push({
          round: r + 1,
          pos: i + 1,
          x: r * colWidth,
          y: midY - GS_CARD_H / 2,
          centerY: midY,
          match: matchAt.get(`${r + 1}:${i + 1}`) ?? null,
        });
      }
    }
    roundCards.push(cards);
  }

  const connectors: Connector[] = [];
  for (let r = 0; r < rounds - 1; r++) {
    const cur = roundCards[r];
    const nxt = roundCards[r + 1];
    for (let i = 0; i < nxt.length; i++) {
      const top = cur[i * 2];
      const bot = cur[i * 2 + 1];
      const target = nxt[i];
      const exitX = top.x + GS_CARD_W;
      const midX = exitX + GS_COL_GAP / 2;
      const entryX = target.x;
      connectors.push({ x1: exitX, y1: top.centerY, x2: midX, y2: top.centerY });
      connectors.push({ x1: exitX, y1: bot.centerY, x2: midX, y2: bot.centerY });
      connectors.push({ x1: midX, y1: top.centerY, x2: midX, y2: bot.centerY });
      connectors.push({ x1: midX, y1: target.centerY, x2: entryX, y2: target.centerY });
    }
  }

  const finalCard = roundCards[rounds - 1][0];

  return {
    poolGroup,
    competitorCount,
    rounds,
    width,
    height,
    cards: roundCards.flat(),
    connectors,
    finalCardCenterY: finalCard.centerY,
    finalCardX: finalCard.x + GS_CARD_W,
  };
}

function GrandSlamBracketView({ category }: { category: Category }) {
  const matches = category.matches ?? [];

  const poolMatches = matches.filter((m) => m.phase === 'POOL');
  const sfMatches = matches
    .filter((m) => m.phase === 'KNOCKOUT_SF')
    .sort((a, b) => a.poolPosition - b.poolPosition);
  const finalMatch = matches.find((m) => m.phase === 'KNOCKOUT_FINAL');
  const repTop = matches.find((m) => m.phase === 'REPECHAGE' && m.poolGroup === 'TOP');
  const repBottom = matches.find((m) => m.phase === 'REPECHAGE' && m.poolGroup === 'BOTTOM');
  const bronzeTop = matches.find(
    (m) => m.phase === 'KNOCKOUT_BRONZE' && m.poolGroup === 'TOP',
  );
  const bronzeBottom = matches.find(
    (m) => m.phase === 'KNOCKOUT_BRONZE' && m.poolGroup === 'BOTTOM',
  );

  const layout = useMemo(() => {
    const poolGroups: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const pools: (PoolLayout | null)[] = poolGroups.map((g) =>
      computePoolLayout(
        g,
        poolMatches.filter((m) => m.poolGroup === g),
      ),
    );
    const realPools = pools.filter((p): p is PoolLayout => p !== null);
    if (realPools.length === 0) return null;

    const poolWidth = Math.max(...realPools.map((p) => p.width));
    // Stack pool Y offsets:
    const poolYOffsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < pools.length; i++) {
      poolYOffsets.push(acc);
      const h = pools[i]?.height ?? 0;
      acc += h + GS_POOL_VGAP;
    }
    const stackHeight = acc - GS_POOL_VGAP;

    // Main bracket positions (right of pools).
    const sfX = GS_LABEL_W + poolWidth + GS_MAIN_GAP;
    const finalX = sfX + GS_CARD_W + GS_COL_GAP;

    // SF1 = midpoint of pool A final and pool B final centers.
    // SF2 = midpoint of pool C final and pool D final centers.
    function midOfPair(aIdx: number, bIdx: number): number | null {
      const a = pools[aIdx];
      const b = pools[bIdx];
      if (!a || !b) return null;
      return (
        (poolYOffsets[aIdx] + a.finalCardCenterY +
          poolYOffsets[bIdx] + b.finalCardCenterY) / 2
      );
    }
    const sf1Y = midOfPair(0, 1);
    const sf2Y = midOfPair(2, 3);

    const sfCards: { x: number; y: number; centerY: number; match: Match | null; pos: 1 | 2 }[] = [];
    if (sf1Y != null) {
      sfCards.push({
        x: sfX, y: sf1Y - GS_CARD_H / 2, centerY: sf1Y,
        match: sfMatches.find((m) => m.poolPosition === 1) ?? null,
        pos: 1,
      });
    }
    if (sf2Y != null) {
      sfCards.push({
        x: sfX, y: sf2Y - GS_CARD_H / 2, centerY: sf2Y,
        match: sfMatches.find((m) => m.poolPosition === 2) ?? null,
        pos: 2,
      });
    }

    let finalCard: { x: number; y: number; centerY: number } | null = null;
    if (sf1Y != null && sf2Y != null) {
      const finalY = (sf1Y + sf2Y) / 2;
      finalCard = { x: finalX, y: finalY - GS_CARD_H / 2, centerY: finalY };
    }

    // Connector lines: pool finals → SFs → Final.
    const mainConnectors: Connector[] = [];
    for (let i = 0; i < pools.length; i++) {
      const p = pools[i];
      if (!p) continue;
      const exitX = GS_LABEL_W + p.finalCardX;
      const exitY = poolYOffsets[i] + p.finalCardCenterY;
      const sfTarget = i < 2 ? sfCards[0] : sfCards[1];
      if (!sfTarget) continue;
      const midX = exitX + (sfX - exitX) / 2;
      mainConnectors.push({ x1: exitX, y1: exitY, x2: midX, y2: exitY });
      mainConnectors.push({ x1: midX, y1: exitY, x2: midX, y2: sfTarget.centerY });
      mainConnectors.push({ x1: midX, y1: sfTarget.centerY, x2: sfX, y2: sfTarget.centerY });
    }
    if (finalCard && sfCards.length === 2) {
      const exitX = sfX + GS_CARD_W;
      const midX = exitX + GS_COL_GAP / 2;
      mainConnectors.push({ x1: exitX, y1: sfCards[0].centerY, x2: midX, y2: sfCards[0].centerY });
      mainConnectors.push({ x1: exitX, y1: sfCards[1].centerY, x2: midX, y2: sfCards[1].centerY });
      mainConnectors.push({ x1: midX, y1: sfCards[0].centerY, x2: midX, y2: sfCards[1].centerY });
      mainConnectors.push({ x1: midX, y1: finalCard.centerY, x2: finalX, y2: finalCard.centerY });
    }

    const totalWidth = finalCard ? finalX + GS_CARD_W : sfX + GS_CARD_W;
    const totalHeight = stackHeight;

    return {
      pools,
      poolYOffsets,
      stackHeight,
      poolWidth,
      sfCards,
      finalCard,
      mainConnectors,
      totalWidth,
      totalHeight,
    };
  }, [poolMatches, sfMatches, finalMatch]);

  if (!layout) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        Pool brackets not generated yet.
      </div>
    );
  }

  // Total drawing height includes the header reserve so labels above cards
  // (R1, R2, SF, Final) render fully inside the canvas instead of clipping.
  const canvasHeight = layout.totalHeight + GS_HEADER_H;

  return (
    <div className="space-y-8">
      {/* Format badge tells the viewer what they're looking at — there are
          three different bracket formats in the app and they look very
          different from each other. */}
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider">
          IJF Grand Slam · 4 pools
        </span>
        <span className="text-gray-400">single-elim per pool · cross-half repechage · two bronzes</span>
      </div>

      {/* MAIN: pools + 4-team knockout, all in one connected SVG-overlaid canvas */}
      <div className="overflow-x-auto pb-2">
        <div
          className="relative"
          style={{ width: layout.totalWidth, height: canvasHeight }}
        >
          {/* Per-pool background tint — visually groups each pool block. */}
          {layout.pools.map((p, idx) => {
            if (!p) return null;
            const colors = POOL_COLORS[p.poolGroup];
            return (
              <div
                key={`pool-${p.poolGroup}-tint`}
                className={`absolute rounded-md ${colors.tint}`}
                style={{
                  left: GS_LABEL_W - 6,
                  top: GS_HEADER_H + layout.poolYOffsets[idx] - 6,
                  width: layout.poolWidth + 12,
                  height: p.height + 12,
                }}
              />
            );
          })}

          <svg
            className="absolute inset-0 pointer-events-none"
            width={layout.totalWidth}
            height={canvasHeight}
          >
            {/* Pool internal connectors */}
            {layout.pools.map((p, idx) =>
              p?.connectors.map((c, i) => (
                <line
                  key={`p${idx}c${i}`}
                  x1={GS_LABEL_W + c.x1}
                  y1={GS_HEADER_H + layout.poolYOffsets[idx] + c.y1}
                  x2={GS_LABEL_W + c.x2}
                  y2={GS_HEADER_H + layout.poolYOffsets[idx] + c.y2}
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                />
              )),
            )}
            {/* Pools → SF → Final connectors (slightly darker — flow lines) */}
            {layout.mainConnectors.map((c, i) => (
              <line
                key={`mc${i}`}
                x1={c.x1}
                y1={GS_HEADER_H + c.y1}
                x2={c.x2}
                y2={GS_HEADER_H + c.y2}
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
            ))}
          </svg>

          {/* Pool stripes + vertical labels — using writing-mode for reliable
              vertical text rendering instead of CSS rotate. */}
          {layout.pools.map((p, idx) => {
            if (!p) return null;
            const colors = POOL_COLORS[p.poolGroup];
            return (
              <div
                key={`pool-${p.poolGroup}-label`}
                className="absolute"
                style={{
                  left: 0,
                  top: GS_HEADER_H + layout.poolYOffsets[idx],
                  width: GS_LABEL_W,
                  height: p.height,
                }}
              >
                <div
                  className={`absolute left-0 top-0 bottom-0 rounded-l-md ${colors.stripe}`}
                  style={{ width: GS_STRIPE_W }}
                />
                <div
                  className={`absolute inset-0 flex items-center justify-center ${colors.text}`}
                  style={{
                    paddingLeft: GS_STRIPE_W + 2,
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: '0.2em',
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                  }}
                >
                  POOL {p.poolGroup}
                </div>
              </div>
            );
          })}

          {/* Pool match cards */}
          {layout.pools.map((p, idx) => {
            if (!p) return null;
            return p.cards.map((c) => (
              <div
                key={`pool-${p.poolGroup}-${c.round}-${c.pos}`}
                className="absolute"
                style={{
                  left: GS_LABEL_W + c.x,
                  top: GS_HEADER_H + layout.poolYOffsets[idx] + c.y,
                  width: GS_CARD_W,
                  height: GS_CARD_H,
                }}
              >
                <MatchCard match={c.match} />
              </div>
            ));
          })}

          {/* Round labels above each pool's columns. Only show on the first
              pool to keep the canvas clean. Now sit fully inside the canvas
              thanks to GS_HEADER_H. */}
          {layout.pools[0] &&
            Array.from({ length: layout.pools[0].rounds }).map((_, r) => {
              const colWidth = GS_CARD_W + GS_COL_GAP;
              return (
                <div
                  key={`r-label-${r}`}
                  className="absolute text-[10px] font-bold text-gray-500 uppercase tracking-wider"
                  style={{
                    left: GS_LABEL_W + r * colWidth,
                    top: 4,
                    width: GS_CARD_W,
                    textAlign: 'center',
                  }}
                >
                  Round {r + 1}
                </div>
              );
            })}

          {/* SF cards with title labels INSIDE the canvas */}
          {layout.sfCards.map((c) => (
            <div
              key={`sf-${c.pos}`}
              className="absolute"
              style={{
                left: c.x,
                top: GS_HEADER_H + c.y,
                width: GS_CARD_W,
                height: GS_CARD_H,
              }}
            >
              <MatchCard match={c.match} />
            </div>
          ))}
          {layout.sfCards.map((c) => (
            <div
              key={`sf-${c.pos}-label`}
              className="absolute text-[10px] font-bold uppercase tracking-wider text-gray-500"
              style={{
                left: c.x,
                top: GS_HEADER_H + c.y - 14,
                width: GS_CARD_W,
              }}
            >
              Semi-Final {c.pos}
            </div>
          ))}

          {/* Final card with gold ring on winner side, bordered amber */}
          {layout.finalCard && (
            <>
              <div
                className="absolute"
                style={{
                  left: layout.finalCard.x,
                  top: GS_HEADER_H + layout.finalCard.y,
                  width: GS_CARD_W,
                  height: GS_CARD_H,
                }}
              >
                <FinalMatchCard match={finalMatch ?? null} />
              </div>
              <div
                className="absolute text-[10px] font-bold uppercase tracking-wider text-amber-700 inline-flex items-center gap-1"
                style={{
                  left: layout.finalCard.x,
                  top: GS_HEADER_H + layout.finalCard.y - 14,
                  width: GS_CARD_W,
                }}
              >
                <span>Final</span>
                <span className="text-amber-500">·</span>
                <span>Gold / Silver</span>
              </div>
            </>
          )}

          {/* "Round 1" header label for SF/Final isn't needed since they're
              separate; the per-card labels above carry the meaning. */}
        </div>
      </div>

      {/* REPECHAGE: full-width, below the main bracket */}
      <RepechageGrandSlam
        repTop={repTop ?? null}
        repBottom={repBottom ?? null}
        bronzeTop={bronzeTop ?? null}
        bronzeBottom={bronzeBottom ?? null}
        sfTop={sfMatches.find((m) => m.poolPosition === 1) ?? null}
        sfBottom={sfMatches.find((m) => m.poolPosition === 2) ?? null}
      />
    </div>
  );
}

// Final match card with subtle gold ring on the winner row. Used only for
// KNOCKOUT_FINAL because the visual emphasis is meaningful there — gold/silver
// are the medal outcomes.
function FinalMatchCard({ match }: { match: Match | null }) {
  const c1 = match?.competitor1;
  const c2 = match?.competitor2;
  const winner = match?.winner;
  const isCompleted = match?.status === 'COMPLETED';
  const isC1Winner = !!(winner && c1 && winner.id === c1.id);
  const isC2Winner = !!(winner && c2 && winner.id === c2.id);
  const c1Name = c1 ? `${c1.lastName.toUpperCase()} ${c1.firstName[0] ?? ''}.` : null;
  const c2Name = c2 ? `${c2.lastName.toUpperCase()} ${c2.firstName[0] ?? ''}.` : null;

  return (
    <div
      className={`w-full h-full rounded-md border text-xs overflow-hidden flex flex-col ${
        isCompleted
          ? 'border-amber-400 bg-amber-50/60 shadow-sm shadow-amber-100'
          : 'border-amber-300 bg-amber-50/30'
      }`}
    >
      <div
        className={`flex items-center gap-1 px-2 flex-1 min-h-0 ${
          isC1Winner ? 'bg-amber-200/60' : isCompleted ? 'bg-slate-50' : ''
        }`}
      >
        {isC1Winner && <span className="text-amber-600 text-[10px]">🥇</span>}
        {isC2Winner && isCompleted && <span className="text-slate-400 text-[10px]">🥈</span>}
        <span
          className={`truncate flex-1 ${
            !c1Name
              ? 'text-gray-400 italic'
              : isC1Winner
                ? 'font-bold text-amber-900'
                : isCompleted
                  ? 'text-gray-500'
                  : 'text-gray-700'
          }`}
        >
          {c1Name ?? 'TBD'}
        </span>
      </div>
      <div className="border-t border-amber-200" />
      <div
        className={`flex items-center gap-1 px-2 flex-1 min-h-0 ${
          isC2Winner ? 'bg-amber-200/60' : isCompleted ? 'bg-slate-50' : ''
        }`}
      >
        {isC2Winner && <span className="text-amber-600 text-[10px]">🥇</span>}
        {isC1Winner && isCompleted && <span className="text-slate-400 text-[10px]">🥈</span>}
        <span
          className={`truncate flex-1 ${
            !c2Name
              ? 'text-gray-400 italic'
              : isC2Winner
                ? 'font-bold text-amber-900'
                : isCompleted
                  ? 'text-gray-500'
                  : 'text-gray-700'
          }`}
        >
          {c2Name ?? 'TBD'}
        </span>
      </div>
    </div>
  );
}

// Repechage rendered as two full-width tree fragments. Each half:
//
//   pool-finalist-loser ╮
//                       ├── REP ─╮
//   pool-finalist-loser ╯        ├── BRONZE
//             SF loser ──────────╯
//
function RepechageGrandSlam({
  repTop,
  repBottom,
  bronzeTop,
  bronzeBottom,
  sfTop,
  sfBottom,
}: {
  repTop: Match | null;
  repBottom: Match | null;
  bronzeTop: Match | null;
  bronzeBottom: Match | null;
  sfTop: Match | null;
  sfBottom: Match | null;
}) {
  function name(c: Competitor | null | undefined): string | null {
    return c ? `${c.lastName.toUpperCase()} ${c.firstName[0] ?? ''}.` : null;
  }
  // SF "loser" name is informational — we show it below the bronze card to
  // make the cross-half feed visible. The match itself doesn't need cards
  // for those because they already render in the main bracket.

  return (
    <div className="border-t border-amber-200 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-amber-700">
          Repechage + Bronze (cross-half)
        </span>
        <div className="h-px flex-1 bg-amber-200" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RepHalfTree
          label="Top half"
          rep={repTop}
          bronze={bronzeTop}
          crossSfLoserName={name(
            sfBottom?.winner && sfBottom.competitor1?.id === sfBottom.winner.id
              ? sfBottom.competitor2
              : sfBottom?.competitor1,
          )}
        />
        <RepHalfTree
          label="Bottom half"
          rep={repBottom}
          bronze={bronzeBottom}
          crossSfLoserName={name(
            sfTop?.winner && sfTop.competitor1?.id === sfTop.winner.id
              ? sfTop.competitor2
              : sfTop?.competitor1,
          )}
        />
      </div>
    </div>
  );
}

function RepHalfTree({
  label,
  rep,
  bronze,
  crossSfLoserName,
}: {
  label: string;
  rep: Match | null;
  bronze: Match | null;
  crossSfLoserName: string | null;
}) {
  const REP_CARD_W = 184;
  const REP_CARD_H = 40;
  const REP_GAP = 56;
  const REP_VGAP = 16;
  const HEADER_H = 18;

  // Layout: three cards laid out in a tree:
  //   REP card (top-left) ──┐
  //                          ├── BRONZE card (right)
  //   SF-loser feeder card (bottom-left) ──┘
  //
  // Vertical positioning: REP centerY = HEADER_H + CARD_H/2.
  //                        Feeder centerY = HEADER_H + CARD_H*1.5 + VGAP.
  //                        Bronze centerY = midpoint of REP and feeder.
  const repX = 0;
  const feederX = 0;
  const bronzeX = REP_CARD_W + REP_GAP;

  const repY = HEADER_H;
  const feederY = HEADER_H + REP_CARD_H + REP_VGAP;
  const repCenterY = repY + REP_CARD_H / 2;
  const feederCenterY = feederY + REP_CARD_H / 2;
  const bronzeCenterY = (repCenterY + feederCenterY) / 2;
  const bronzeY = bronzeCenterY - REP_CARD_H / 2;

  const totalW = bronzeX + REP_CARD_W;
  const totalH = feederY + REP_CARD_H + 8;

  const exitRepX = repX + REP_CARD_W;
  const exitFeederX = feederX + REP_CARD_W;
  const midX = exitRepX + REP_GAP / 2;

  return (
    <div className="border border-amber-200 rounded-lg bg-amber-50/30 p-4">
      <div className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-3">
        {label}
      </div>
      <div className="relative" style={{ width: totalW, height: totalH }}>
        <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH}>
          <line x1={exitRepX}    y1={repCenterY}    x2={midX}    y2={repCenterY}    stroke="#f59e0b" strokeWidth={1.5} />
          <line x1={exitFeederX} y1={feederCenterY} x2={midX}    y2={feederCenterY} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" />
          <line x1={midX}        y1={repCenterY}    x2={midX}    y2={feederCenterY} stroke="#f59e0b" strokeWidth={1.5} />
          <line x1={midX}        y1={bronzeCenterY} x2={bronzeX} y2={bronzeCenterY} stroke="#f59e0b" strokeWidth={1.5} />
        </svg>

        <div
          className="absolute text-[10px] font-bold uppercase tracking-wider text-amber-600"
          style={{ left: repX, top: repY - HEADER_H + 2, width: REP_CARD_W }}
        >
          Repechage
        </div>
        <div className="absolute" style={{ left: repX, top: repY, width: REP_CARD_W, height: REP_CARD_H }}>
          <MatchCard match={rep} />
        </div>

        <div
          className="absolute text-[10px] font-bold uppercase tracking-wider text-amber-600/70"
          style={{ left: feederX, top: feederY - HEADER_H + 2, width: REP_CARD_W }}
        >
          Cross-half SF loser
        </div>
        <div
          className="absolute"
          style={{ left: feederX, top: feederY, width: REP_CARD_W, height: REP_CARD_H }}
        >
          <FeederCard name={crossSfLoserName} />
        </div>

        <div
          className="absolute text-[10px] font-bold uppercase tracking-wider text-amber-700 inline-flex items-center gap-1"
          style={{ left: bronzeX, top: bronzeY - HEADER_H + 2, width: REP_CARD_W }}
        >
          <span>🥉</span>
          <span>Bronze</span>
        </div>
        <div
          className="absolute"
          style={{ left: bronzeX, top: bronzeY, width: REP_CARD_W, height: REP_CARD_H }}
        >
          <MatchCard match={bronze} />
        </div>
      </div>
    </div>
  );
}

// Visual placeholder card representing a competitor that flows in from
// elsewhere in the bracket (cross-half SF loser feeding bronze). Dashed
// border distinguishes it from a real match card.
function FeederCard({ name }: { name: string | null }) {
  return (
    <div className="w-full h-full rounded-md border border-dashed border-amber-300 bg-white/60 flex items-center px-2 text-xs">
      {name ? (
        <span className="text-amber-900 truncate">{name}</span>
      ) : (
        <span className="text-amber-600/60 italic uppercase tracking-wider text-[10px]">
          awaiting SF result
        </span>
      )}
    </div>
  );
}
