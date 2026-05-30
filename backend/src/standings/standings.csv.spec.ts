import { buildStandingsCsv, slugify } from './standings.csv';
import type { CategoryStandings } from './standings.service';

function cat(over: Partial<CategoryStandings> = {}): CategoryStandings {
  return {
    categoryId: 'cat1',
    categoryName: '-60kg',
    bracketType: 'ROUND_ROBIN',
    status: 'COMPLETE',
    standings: [],
    ...over,
  };
}

describe('buildStandingsCsv', () => {
  it('emits a header row even with no categories', () => {
    const lines = buildStandingsCsv([]).split('\r\n');
    expect(lines[0].split(',')).toHaveLength(13);
    expect(lines[0]).toContain('Category');
    expect(lines[0]).toContain('Shidos');
  });

  it('emits one row per competitor across categories', () => {
    const cats = [
      cat({
        standings: [
          {
            rank: 1,
            competitor: { id: 'c1', firstName: 'Yuki', lastName: 'Tanaka', club: 'PDX Judo', athleteId: 'A-100' },
            wins: 3,
            losses: 0,
            ippons: 2,
            wazaAriWins: 1,
            shidosReceived: 0,
          },
          {
            rank: 2,
            competitor: { id: 'c2', firstName: 'Sam', lastName: 'Lee', club: 'Cascade', athleteId: null },
            wins: 2,
            losses: 1,
            ippons: 1,
            wazaAriWins: 0,
            shidosReceived: 1,
          },
        ],
      }),
    ];
    const lines = buildStandingsCsv(cats).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toBe('-60kg,ROUND_ROBIN,COMPLETE,1,Yuki,Tanaka,PDX Judo,A-100,3,0,2,1,0');
    expect(lines[2]).toBe('-60kg,ROUND_ROBIN,COMPLETE,2,Sam,Lee,Cascade,,2,1,1,0,1');
  });

  it('escapes commas and quotes per RFC 4180', () => {
    const quote = String.fromCharCode(34);
    const firstWithQuotes = 'Anne ' + quote + 'Ace' + quote; // Anne "Ace"
    const cats = [
      cat({
        categoryName: 'Open, Mixed',
        bracketType: 'POOLS',
        standings: [
          {
            rank: 1,
            competitor: { id: 'c2', firstName: firstWithQuotes, lastName: 'Lee', club: '', athleteId: null },
          },
        ],
      }),
    ];
    const row = buildStandingsCsv(cats).split('\r\n')[1];
    // A category containing a comma must be wrapped in quotes.
    expect(row).toContain(quote + 'Open, Mixed' + quote);
    // Embedded quotes are doubled and the field is wrapped.
    const escapedFirst = quote + 'Anne ' + quote + quote + 'Ace' + quote + quote + quote;
    expect(row).toContain(escapedFirst);
  });

  it('neutralizes formula-injection in untrusted competitor fields (CWE-1236)', () => {
    const cats = [
      cat({
        categoryName: '-66kg', // system-generated IJF class — must NOT be guarded
        standings: [
          {
            rank: 1,
            competitor: {
              id: 'evil',
              firstName: '=HYPERLINK("http://evil")',
              lastName: '+SUM(A1)',
              club: '-60kg Club',
              athleteId: '@cmd',
            },
          },
        ],
      }),
    ];
    const row = buildStandingsCsv(cats).split('\r\n')[1];
    // Untrusted competitor fields get an apostrophe so a spreadsheet treats them
    // as text. The = field is also RFC-4180 quoted for its parens/quotes.
    expect(row).toContain(`'=HYPERLINK`);
    expect(row).toContain(`'+SUM(A1)`);
    expect(row).toContain(`'-60kg Club`);
    expect(row).toContain(`'@cmd`);
    // The system-generated category name keeps its real value — no apostrophe.
    expect(row.startsWith('-66kg,')).toBe(true);
  });

  it('guards leading control chars (tab / CR / LF) before a formula', () => {
    const make = (first: string) =>
      cat({
        standings: [
          {
            rank: 1,
            competitor: { id: 'c', firstName: first, lastName: 'X', club: '', athleteId: null },
          },
        ],
      });
    // Each leading control char + formula must be apostrophe-prefixed so a
    // spreadsheet treats it as text. Assert against the raw output: the guarded
    // value `'<ctrl>=cmd` appears verbatim (quoting wraps it but doesn't alter
    // the apostrophe-then-ctrl-then-formula sequence).
    for (const ctrl of ['\t', '\r', '\n']) {
      const out = buildStandingsCsv([make(`${ctrl}=cmd`)]);
      expect(out.includes(`'${ctrl}=cmd`)).toBe(true);
      // And never a bare formula start right after the rank delimiter.
      expect(out.includes(`,1,${ctrl}=cmd`)).toBe(false);
    }
  });

  it('renders missing optional stats as empty cells, not undefined', () => {
    const cats = [
      cat({
        categoryName: '-73kg',
        bracketType: 'SINGLE_REPECHAGE',
        status: 'IN_PROGRESS',
        standings: [
          {
            rank: 1,
            competitor: { id: 'c3', firstName: 'Sam', lastName: 'Lee', club: 'Cascade', athleteId: null },
          },
        ],
      }),
    ];
    const row = buildStandingsCsv(cats).split('\r\n')[1];
    expect(row).toBe('-73kg,SINGLE_REPECHAGE,IN_PROGRESS,1,Sam,Lee,Cascade,,,,,,');
    expect(row).not.toContain('undefined');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Spring Open 2026')).toBe('spring-open-2026');
  });
  it('strips leading and trailing separators', () => {
    expect(slugify('  --Rio Cup!!  ')).toBe('rio-cup');
  });
  it('falls back when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('competition');
  });
});
