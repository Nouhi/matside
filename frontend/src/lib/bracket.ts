// Single source of truth for bracket-type display.
//
// Three views need to render the bracket type (categories list,
// standings header, bracket panel header) and were each maintaining
// their own label map — drift was already showing (BracketView said
// "Pool Play" / "Grand Slam (4 pools)"; the other two omitted POOLS and
// GRAND_SLAM entirely and fell through to raw enum text + red pill).
//
// Bracket types mirror the Prisma enum in `backend/prisma/schema.prisma`.

export type BracketType =
  | 'ROUND_ROBIN'
  | 'POOLS'
  | 'SINGLE_REPECHAGE'
  | 'DOUBLE_REPECHAGE'
  | 'GRAND_SLAM';

export const BRACKET_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round Robin',
  POOLS: 'Pools',
  SINGLE_REPECHAGE: 'Single Repechage',
  DOUBLE_REPECHAGE: 'Double Repechage',
  GRAND_SLAM: 'Grand Slam',
};

// Pill background + text classes, tuned so each format is
// quickly distinguishable in a scan of the categories list.
export const BRACKET_PILL_CLASSES: Record<string, string> = {
  ROUND_ROBIN: 'bg-purple-100 text-purple-700',
  POOLS: 'bg-blue-100 text-blue-700',
  SINGLE_REPECHAGE: 'bg-orange-100 text-orange-700',
  DOUBLE_REPECHAGE: 'bg-red-100 text-red-700',
  GRAND_SLAM: 'bg-emerald-100 text-emerald-700',
};

export function bracketLabel(type: string): string {
  return BRACKET_LABELS[type] ?? type;
}

export function bracketPillClass(type: string): string {
  return BRACKET_PILL_CLASSES[type] ?? 'bg-gray-100 text-gray-700';
}
