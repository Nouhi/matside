import type { CategoryStandings } from './standings.service';

const HEADERS = [
  'Category',
  'Bracket Type',
  'Status',
  'Rank',
  'First Name',
  'Last Name',
  'Club',
  'Athlete ID',
  'Wins',
  'Losses',
  'Ippons',
  'Waza-ari',
  'Shidos',
];

// RFC 4180 quoting — quote any field containing comma, quote, or newline, and
// double up embedded quotes.
function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Untrusted free-text fields (competitor / club names, athlete IDs) get an extra
// layer: CSV formula injection (CWE-1236). A cell whose first character is = + - @
// or a control char executes as a formula when the file opens in Excel / Sheets /
// LibreOffice — and the whole point of this file is for a federation official to
// open it in a spreadsheet. Prefix a leading apostrophe so it's treated as text,
// then apply RFC-4180 quoting. NOT applied to system-generated fields like the IJF
// category name (e.g. "-60kg"), which legitimately start with "-".
function escText(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return esc(s);
}

/**
 * Flatten competition standings into a single CSV — one row per competitor
 * placement across every category. CRLF line endings per RFC 4180 (Excel-safe).
 */
export function buildStandingsCsv(categories: CategoryStandings[]): string {
  const rows: string[] = [HEADERS.join(',')];

  for (const cat of categories) {
    for (const entry of cat.standings) {
      const cells = [
        // System-generated fields — RFC-4180 quoting only.
        esc(cat.categoryName),
        esc(cat.bracketType),
        esc(cat.status),
        esc(entry.rank),
        // Untrusted free text — formula-guarded.
        escText(entry.competitor.firstName),
        escText(entry.competitor.lastName),
        escText(entry.competitor.club ?? ''),
        escText(entry.competitor.athleteId ?? ''),
        // Numeric stats — RFC-4180 quoting only.
        esc(entry.wins ?? ''),
        esc(entry.losses ?? ''),
        esc(entry.ippons ?? ''),
        esc(entry.wazaAriWins ?? ''),
        esc(entry.shidosReceived ?? ''),
      ];
      rows.push(cells.join(','));
    }
  }

  return rows.join('\r\n') + '\r\n';
}

/** Turn a competition name into a safe download filename stem. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'competition'
  );
}
