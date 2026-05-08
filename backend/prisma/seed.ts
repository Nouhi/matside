/* eslint-disable no-console */
/**
 * Seeds 4 distinct tournaments to exercise every bracket type + edge case.
 *
 * Run:  npm run seed
 *
 *   1. "Local Club Cup"        — small, round-robin heavy (1-4 per category)
 *   2. "Regional Open"          — pools focus (5-15 per category)
 *   3. "World Championships"    — double-repechage focus (16-32 per category)
 *   4. "Live Demo"              — mixed sizes with ~60% of matches pre-played
 *                                 so you can see the standings + bracket views
 *                                 populated without manually running 100+ fights
 *
 * Each tournament gets its own organiser-readable name with timestamp so re-runs
 * don't conflict. Mats are pre-created with random PINs. The seed never touches
 * existing data — it only appends.
 */

import {
  PrismaClient,
  Gender,
  AgeGroup,
  Belt,
  RegistrationStatus,
  CompetitionStatus,
  BracketType,
  MatchPhase,
  WinMethod,
  MatchStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const COMPETITION_DATE = new Date('2026-06-15');
const TIMESTAMP = new Date().toISOString().slice(0, 16).replace('T', ' ');

// ─── Diverse name + club pools ───

const FIRST_NAMES_M = [
  'Hiroshi','Takeshi','Yuki','Daichi','Ren','Soma','Naohisa','Hifumi','Shohei',
  'Lucas','Mathieu','Quentin','Théo','Antoine','Romain','Julien','Bastien','Léo',
  'Ivan','Dmitri','Sergey','Aleksandr','Vladimir','Lasha','Beka','Giorgi','Tato',
  'Rafael','Gabriel','Mateus','Pedro','Felipe','Diego','Andrés',
  'Min-jun','Jae-hyun','Seung-ho','Tae-yang','Jin-woo',
  'Naidan','Bat','Tsogbayar','Tuvshinjargal',
  'Sven','Magnus','Niklas','Oskar',
  'Karim','Adel','Walid','Yousef','Saeid','Ramin',
];

const FIRST_NAMES_F = [
  'Sakura','Yui','Aiko','Riko','Mizuki','Akari','Rika','Funa','Tsukasa',
  'Clarisse','Margaux','Émilie','Camille','Manon','Léa','Chloé','Sarah',
  'Yulia','Anastasia','Mariya','Valeriya','Nino','Ketevan',
  'Ana','Beatriz','Mariana','Larissa','Rafaela','Sofía','Camila',
  'Ji-yoo','Min-seo','Soo-bin','Eun-bi','Hye-rim',
  'Sumya','Munkhsoyol','Tsetsegmaa',
  'Anna','Lena','Hanna','Mette',
  'Amal','Sara','Layla','Fatma',
];

const LAST_NAMES = [
  'Tanaka','Suzuki','Watanabe','Yamamoto','Kobayashi','Nakamura','Inoue','Maruyama','Abe',
  'Riner','Dupont','Martin','Bernard','Petit','Moreau','Lefevre','Garcia','Dubois',
  'Petrov','Ivanov','Sokolov','Volkov','Shavdatuashvili','Zantaraia','Liparteliani','Bekauri',
  'Silva','Santos','Costa','Pereira','Mendes','Lima','Almeida','Oliveira',
  'Kim','Lee','Park','Choi','Jung','Han',
  'Tsogtbaatar','Boldbaatar','Munkhbat','Khorloodoi',
  'Schmidt','Müller','Andersen','Bjornsen','van der Berg','Hansen',
  'Khoshroo','Mollaei','El Mansouri','Bouyacoub','Hatami',
  'Romero','Russo','Fernandez','Esposito','Conti',
];

const CLUBS = [
  'Kodokan Tokyo','Paris Judo Club','INEF Madrid','CR Vasco da Gama','Dynamo Moscow',
  'Tbilisi Judo Center','Ulaanbaatar Wrestling Palace','KSK Yongin','Munich Polizei JC',
  'Amsterdam Judo Bond','Tokai University','Nippon Sport Science','Tenri University',
  'Kano Cultural Society','Seoul National University','Belo Horizonte Dojo',
  'Rio de Janeiro Judo Federation','CSKA Moscow','Spartak Krasnodar','Levski Sofia',
  'Györ AC','Tashkent Olympic Center','JKS Esfahan','IRIB Tehran','Almaty Judo Academy',
  'Ho Chi Minh JC','Manila Judo Federation','NYAC','San Jose State Judo','Pedro\'s Judo Center',
  'Etobicoke Olympium','Mexico City Judo Hall','Havana Sports Complex','Buenos Aires Olímpico',
  'Sydney Judo Academy','Auckland JC','Casablanca Royal Club','Cairo Sporting Club',
  'JC Algiers','Tel Aviv Wingate','Athens Olympic Sports','Chișinău Olympic',
];

// ─── Weight classes ───

interface WeightBand { min: number; max: number; label: string; }
function bands(limits: number[]): WeightBand[] {
  return limits.map((limit, i) => {
    if (i === limits.length - 1) return { min: Math.abs(limit), max: 999, label: `+${Math.abs(limit)}` };
    const prev = i === 0 ? 0 : Math.abs(limits[i - 1]);
    return { min: prev, max: Math.abs(limit), label: `-${Math.abs(limit)}` };
  });
}

interface WeightTier { gender: Gender; ageGroup: AgeGroup; bands: WeightBand[]; }

const SENIOR_M: WeightTier = { gender: Gender.MALE,   ageGroup: AgeGroup.SENIOR, bands: bands([60, 66, 73, 81, 90, 100, 100]) };
const SENIOR_F: WeightTier = { gender: Gender.FEMALE, ageGroup: AgeGroup.SENIOR, bands: bands([48, 52, 57, 63, 70, 78, 78]) };
const JUNIOR_M: WeightTier = { gender: Gender.MALE,   ageGroup: AgeGroup.JUNIOR, bands: bands([55, 60, 66, 73, 81, 90, 100, 100]) };
const JUNIOR_F: WeightTier = { gender: Gender.FEMALE, ageGroup: AgeGroup.JUNIOR, bands: bands([44, 48, 52, 57, 63, 70, 78, 78]) };
const CADET_M:  WeightTier = { gender: Gender.MALE,   ageGroup: AgeGroup.CADET,  bands: bands([50, 55, 60, 66, 73, 81, 90, 90]) };
const CADET_F:  WeightTier = { gender: Gender.FEMALE, ageGroup: AgeGroup.CADET,  bands: bands([40, 44, 48, 52, 57, 63, 70, 70]) };

// ─── Helpers ───

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function randomDateInRange(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function dobForAgeGroup(ageGroup: AgeGroup, refDate: Date): Date {
  let minAge: number, maxAge: number;
  if (ageGroup === AgeGroup.CADET) { minAge = 15; maxAge = 17; }
  else if (ageGroup === AgeGroup.JUNIOR) { minAge = 18; maxAge = 20; }
  else { minAge = 21; maxAge = 30; }
  const earliest = new Date(refDate); earliest.setFullYear(refDate.getFullYear() - maxAge - 1); earliest.setDate(refDate.getDate() + 1);
  const latest = new Date(refDate); latest.setFullYear(refDate.getFullYear() - minAge);
  return randomDateInRange(earliest, latest);
}

function pickBelt(ageGroup: AgeGroup): Belt {
  if (ageGroup === AgeGroup.CADET) {
    const r = Math.random();
    if (r < 0.4) return Belt.GREEN;
    if (r < 0.75) return Belt.BLUE;
    return Belt.BROWN;
  }
  if (ageGroup === AgeGroup.JUNIOR) {
    const r = Math.random();
    if (r < 0.15) return Belt.BLUE;
    if (r < 0.45) return Belt.BROWN;
    if (r < 0.95) return Belt.BLACK_1DAN;
    return Belt.BLACK_2DAN;
  }
  const r = Math.random();
  if (r < 0.1) return Belt.BROWN;
  if (r < 0.5) return Belt.BLACK_1DAN;
  if (r < 0.8) return Belt.BLACK_2DAN;
  if (r < 0.95) return Belt.BLACK_3DAN;
  return Belt.BLACK_4DAN;
}

function weightInBand(min: number, max: number): number {
  if (max === 999) return Math.round((min + 0.5 + Math.random() * 28) * 10) / 10;
  const realisticMin = Math.max(min + 0.5, max - 6);
  return Math.round((realisticMin + Math.random() * (max - realisticMin)) * 10) / 10;
}

async function ensureOrganizer(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: 'test@matside.com' } });
  if (existing) return existing.id;
  const passwordHash = await bcrypt.hash('test1234', 10);
  const created = await prisma.user.create({
    data: { email: 'test@matside.com', passwordHash, name: 'Test Organizer', role: 'ORGANIZER' },
  });
  console.log('Created organizer test@matside.com (password: test1234)');
  return created.id;
}

async function createCompetition(
  organizerId: string,
  name: string,
  status: CompetitionStatus,
  matCount: number,
): Promise<string> {
  const competition = await prisma.competition.create({
    data: {
      name: `${name} (${TIMESTAMP})`,
      date: COMPETITION_DATE,
      location: 'Olympic Training Center',
      status,
      organizerId,
      matchDuration: 240,
    },
  });
  for (let i = 1; i <= matCount; i++) {
    await prisma.mat.create({
      data: {
        competitionId: competition.id,
        number: i,
        pin: String(Math.floor(100_000 + Math.random() * 900_000)),
      },
    });
  }
  return competition.id;
}

interface SeedSpec {
  tier: WeightTier;
  band: WeightBand;
  count: number;
}

async function seedCompetitors(competitionId: string, specs: SeedSpec[]): Promise<number> {
  let total = 0;
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const isMale = spec.tier.gender === Gender.MALE;
      const firstName = pick(isMale ? FIRST_NAMES_M : FIRST_NAMES_F);
      const lastName = pick(LAST_NAMES);
      const club = pick(CLUBS);
      const dob = dobForAgeGroup(spec.tier.ageGroup, COMPETITION_DATE);
      const weight = weightInBand(spec.band.min, spec.band.max);
      const belt = pickBelt(spec.tier.ageGroup);
      const emailUser = `${firstName.toLowerCase().replace(/\W/g, '')}.${lastName.toLowerCase().replace(/\W/g, '')}.${competitionId.slice(-6)}.${total}`;

      await prisma.competitor.create({
        data: {
          competitionId,
          firstName,
          lastName,
          email: `${emailUser}@example.com`,
          dateOfBirth: dob,
          gender: spec.tier.gender,
          weight,
          belt,
          club,
          registrationStatus: RegistrationStatus.WEIGHED_IN,
        },
      });
      total++;
    }
  }
  return total;
}

// ─── Scenarios ───

interface ScenarioResult { name: string; competitionId: string; competitors: number; }

async function scenarioLocalClubCup(organizerId: string): Promise<ScenarioResult> {
  const name = 'Local Club Cup';
  const competitionId = await createCompetition(organizerId, name, CompetitionStatus.WEIGH_IN, 2);

  // Round-robin focus: 2-4 competitors per category
  const specs: SeedSpec[] = [
    ...SENIOR_M.bands.slice(0, 4).map((b) => ({ tier: SENIOR_M, band: b, count: 2 + Math.floor(Math.random() * 3) })),
    ...SENIOR_F.bands.slice(0, 4).map((b) => ({ tier: SENIOR_F, band: b, count: 2 + Math.floor(Math.random() * 3) })),
    ...JUNIOR_M.bands.slice(0, 3).map((b) => ({ tier: JUNIOR_M, band: b, count: 2 + Math.floor(Math.random() * 3) })),
    ...JUNIOR_F.bands.slice(0, 3).map((b) => ({ tier: JUNIOR_F, band: b, count: 2 + Math.floor(Math.random() * 3) })),
  ];
  const total = await seedCompetitors(competitionId, specs);
  return { name, competitionId, competitors: total };
}

async function scenarioRegionalOpen(organizerId: string): Promise<ScenarioResult> {
  const name = 'Regional Open';
  const competitionId = await createCompetition(organizerId, name, CompetitionStatus.WEIGH_IN, 3);

  // POOLS focus: 5-15 competitors per category. Mix of TWO_TEAM (5-8) and FOUR_TEAM (9-15)
  const counts = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const specs: SeedSpec[] = [];
  // Senior + Junior, both genders, roughly half-half mix of small/large
  for (const tier of [SENIOR_M, SENIOR_F, JUNIOR_M, JUNIOR_F]) {
    for (const band of tier.bands.slice(0, 4)) {
      specs.push({ tier, band, count: pick(counts) });
    }
  }
  const total = await seedCompetitors(competitionId, specs);
  return { name, competitionId, competitors: total };
}

async function scenarioWorldChampionships(organizerId: string): Promise<ScenarioResult> {
  const name = 'World Championships';
  const competitionId = await createCompetition(organizerId, name, CompetitionStatus.WEIGH_IN, 4);

  // DOUBLE_REPECHAGE focus: 16+ competitors per category. Mix of bracket sizes:
  // 16 = R1+QF+SF+F (15 main), 17-32 → bracket 32 (with byes), 33+ → bracket 64
  const counts = [16, 17, 20, 24, 28, 32];
  const specs: SeedSpec[] = [];
  for (const tier of [SENIOR_M, SENIOR_F]) {
    for (const band of tier.bands) {
      specs.push({ tier, band, count: pick(counts) });
    }
  }
  const total = await seedCompetitors(competitionId, specs);
  return { name, competitionId, competitors: total };
}

async function scenarioLiveDemo(organizerId: string): Promise<ScenarioResult> {
  const name = 'Live Demo (matches in progress)';
  // Start at WEIGH_IN so Generate Categories + Generate Brackets work; we
  // advance to ACTIVE in simulateLiveDemo() after brackets are generated.
  const competitionId = await createCompetition(organizerId, name, CompetitionStatus.WEIGH_IN, 4);

  // Mixed sizes covering all bracket types — same shape as the original seed.
  const specs: SeedSpec[] = [
    ...SENIOR_M.bands.map((b) => ({ tier: SENIOR_M, band: b, count: 4 + Math.floor(Math.random() * 13) })),  // 4-16
    ...SENIOR_F.bands.map((b) => ({ tier: SENIOR_F, band: b, count: 4 + Math.floor(Math.random() * 13) })),
    ...JUNIOR_M.bands.slice(0, 5).map((b) => ({ tier: JUNIOR_M, band: b, count: 6 + Math.floor(Math.random() * 8) })),  // 6-13
    ...CADET_M.bands.slice(0, 4).map((b) => ({ tier: CADET_M, band: b, count: 3 + Math.floor(Math.random() * 4) })),    // 3-6
    ...CADET_F.bands.slice(0, 4).map((b) => ({ tier: CADET_F, band: b, count: 3 + Math.floor(Math.random() * 4) })),
  ];
  const total = await seedCompetitors(competitionId, specs);
  return { name, competitionId, competitors: total };
}

// ─── Match simulation (for Live Demo) ───

function pickWinMethodAndScores(): { winMethod: WinMethod; scores: { competitor1: { wazaAri: number; yuko: number; shido: number }; competitor2: { wazaAri: number; yuko: number; shido: number } }; comp1Wins: boolean } {
  const r = Math.random();
  const comp1Wins = Math.random() < 0.5;
  let winMethod: WinMethod;
  let winnerScores = { wazaAri: 0, yuko: 0, shido: 0 };
  let loserScores = { wazaAri: 0, yuko: 0, shido: 0 };
  if (r < 0.5) {
    winMethod = WinMethod.IPPON;
    winnerScores = { wazaAri: Math.random() < 0.4 ? 2 : 0, yuko: Math.floor(Math.random() * 2), shido: 0 };
    loserScores = { wazaAri: 0, yuko: Math.floor(Math.random() * 2), shido: Math.floor(Math.random() * 2) };
  } else if (r < 0.8) {
    winMethod = WinMethod.WAZA_ARI;
    winnerScores = { wazaAri: 1, yuko: Math.floor(Math.random() * 2), shido: 0 };
    loserScores = { wazaAri: 0, yuko: Math.floor(Math.random() * 3), shido: Math.floor(Math.random() * 2) };
  } else if (r < 0.95) {
    winMethod = WinMethod.DECISION;
    winnerScores = { wazaAri: 0, yuko: Math.floor(Math.random() * 3), shido: 0 };
    loserScores = { wazaAri: 0, yuko: Math.floor(Math.random() * 2), shido: Math.floor(Math.random() * 2) };
  } else {
    winMethod = WinMethod.HANSOKU_MAKE;
    winnerScores = { wazaAri: 0, yuko: 0, shido: Math.floor(Math.random() * 2) };
    loserScores = { wazaAri: 0, yuko: 0, shido: 3 };
  }
  return {
    winMethod,
    comp1Wins,
    scores: comp1Wins
      ? { competitor1: winnerScores, competitor2: loserScores }
      : { competitor1: loserScores, competitor2: winnerScores },
  };
}

/**
 * Mark a percentage of pool stage matches as completed in a category.
 * Skips knockout matches (which are created dynamically by the scoreboard
 * service when the pool stage finishes).
 */
async function simulatePoolStagePartial(categoryId: string, completionRate = 0.6): Promise<number> {
  const poolMatches = await prisma.match.findMany({
    where: { categoryId, phase: MatchPhase.POOL },
    orderBy: [{ round: 'asc' }, { poolPosition: 'asc' }],
  });
  let completed = 0;
  for (const m of poolMatches) {
    if (Math.random() > completionRate) continue;
    if (!m.competitor1Id || !m.competitor2Id) continue;
    const { winMethod, scores, comp1Wins } = pickWinMethodAndScores();
    const winnerId = comp1Wins ? m.competitor1Id : m.competitor2Id;
    await prisma.match.update({
      where: { id: m.id },
      data: { status: MatchStatus.COMPLETED, winnerId, winMethod, scores },
    });
    completed++;
  }
  return completed;
}

/**
 * Mark a percentage of round-robin matches as completed (no advancement to track).
 */
async function simulateRoundRobinPartial(categoryId: string, completionRate = 0.7): Promise<number> {
  const matches = await prisma.match.findMany({ where: { categoryId } });
  let completed = 0;
  for (const m of matches) {
    if (Math.random() > completionRate) continue;
    if (!m.competitor1Id || !m.competitor2Id) continue;
    const { winMethod, scores, comp1Wins } = pickWinMethodAndScores();
    const winnerId = comp1Wins ? m.competitor1Id : m.competitor2Id;
    await prisma.match.update({
      where: { id: m.id },
      data: { status: MatchStatus.COMPLETED, winnerId, winMethod, scores },
    });
    completed++;
  }
  return completed;
}

/**
 * Complete all R1 matches in an elimination/double-repechage bracket and
 * propagate winners to R2 (QF) competitor slots. Stops there — leaves QF
 * onwards untouched so the user sees a "QF in progress" state.
 */
async function simulateEliminationR1(categoryId: string): Promise<number> {
  const r1 = await prisma.match.findMany({
    where: { categoryId, phase: null, round: 1 },
    orderBy: { poolPosition: 'asc' },
  });
  let completed = 0;
  for (const m of r1) {
    if (!m.competitor1Id || !m.competitor2Id) continue;
    const { winMethod, scores, comp1Wins } = pickWinMethodAndScores();
    const winnerId = comp1Wins ? m.competitor1Id : m.competitor2Id;
    await prisma.match.update({
      where: { id: m.id },
      data: { status: MatchStatus.COMPLETED, winnerId, winMethod, scores },
    });
    // Advance winner to next slot (R2)
    const nextRound = 2;
    const nextPosition = Math.ceil(m.poolPosition / 2);
    const isCompetitor1 = m.poolPosition % 2 === 1;
    const nextMatch = await prisma.match.findFirst({
      where: { categoryId, phase: null, round: nextRound, poolPosition: nextPosition },
    });
    if (nextMatch) {
      await prisma.match.update({
        where: { id: nextMatch.id },
        data: isCompetitor1
          ? { competitor1Id: winnerId }
          : { competitor2Id: winnerId },
      });
    }
    completed++;
  }
  return completed;
}

async function simulateLiveDemo(competitionId: string): Promise<{ played: number; categories: number }> {
  // Generate categories and brackets via direct DB calls — mimicking what the
  // user clicks Generate Categories + Generate Brackets does, but inline.
  // (We can't call CategoriesService / BracketsService directly without
  // bootstrapping the Nest app, so we POST to the API instead.)
  console.log('  Generating categories + brackets via API...');
  const apiBase = process.env.API_BASE ?? 'http://localhost:3000';
  // Get a token by registering a throwaway user (easier than figuring out the
  // existing test@matside.com password)
  const seedToken = await getOrCreateSeedToken(apiBase);
  if (!seedToken) {
    console.log('  Backend not reachable — skipping match simulation. Click Generate Categories + Generate Brackets manually.');
    return { played: 0, categories: 0 };
  }

  // Reassign organiser to the seed user temporarily, then back
  const seedUser = await prisma.user.findUnique({ where: { email: 'matside-seed@example.com' } });
  if (!seedUser) {
    console.log('  Seed user not found, skipping simulation');
    return { played: 0, categories: 0 };
  }
  const originalOrganizer = await prisma.competition.findUnique({ where: { id: competitionId }, select: { organizerId: true } });
  await prisma.competition.update({ where: { id: competitionId }, data: { organizerId: seedUser.id } });

  try {
    await fetch(`${apiBase}/competitions/${competitionId}/categories/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seedToken}` },
    });
    await fetch(`${apiBase}/competitions/${competitionId}/brackets/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seedToken}` },
    });
  } finally {
    if (originalOrganizer) {
      await prisma.competition.update({ where: { id: competitionId }, data: { organizerId: originalOrganizer.organizerId } });
    }
  }

  // Now play partial matches
  const categories = await prisma.category.findMany({ where: { competitionId }, select: { id: true, bracketType: true, name: true } });
  let totalPlayed = 0;
  for (const cat of categories) {
    if (cat.bracketType === BracketType.ROUND_ROBIN) {
      totalPlayed += await simulateRoundRobinPartial(cat.id, 0.8);
    } else if (cat.bracketType === BracketType.POOLS) {
      totalPlayed += await simulatePoolStagePartial(cat.id, 0.7);
    } else if (cat.bracketType === BracketType.DOUBLE_REPECHAGE) {
      totalPlayed += await simulateEliminationR1(cat.id);
    }
  }

  // Advance the competition to ACTIVE now that matches are in flight.
  await prisma.competition.update({
    where: { id: competitionId },
    data: { status: CompetitionStatus.ACTIVE },
  });

  return { played: totalPlayed, categories: categories.length };
}

async function getOrCreateSeedToken(apiBase: string): Promise<string | null> {
  try {
    let resp = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'matside-seed@example.com', password: 'seed-secret-2026' }),
    });
    if (resp.ok) {
      const data = await resp.json() as { access_token: string };
      return data.access_token;
    }
    resp = await fetch(`${apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'matside-seed@example.com', password: 'seed-secret-2026', name: 'Seed Bot' }),
    });
    if (resp.ok) {
      const data = await resp.json() as { access_token: string };
      return data.access_token;
    }
  } catch {
    return null;
  }
  return null;
}

// ─── Main ───

async function main() {
  const organizerId = await ensureOrganizer();
  console.log('');
  console.log('Seeding 4 tournaments…');
  console.log('');

  const a = await scenarioLocalClubCup(organizerId);
  console.log(`✓ ${a.name}: ${a.competitors} competitors`);

  const b = await scenarioRegionalOpen(organizerId);
  console.log(`✓ ${b.name}: ${b.competitors} competitors`);

  const c = await scenarioWorldChampionships(organizerId);
  console.log(`✓ ${c.name}: ${c.competitors} competitors`);

  const d = await scenarioLiveDemo(organizerId);
  console.log(`✓ ${d.name}: ${d.competitors} competitors`);

  // Run the live-demo simulation (requires backend running)
  console.log('');
  console.log('Simulating in-progress matches for "Live Demo"…');
  const sim = await simulateLiveDemo(d.competitionId);
  if (sim.played > 0) {
    console.log(`  ✓ Played ${sim.played} matches across ${sim.categories} categories`);
  }

  console.log('');
  console.log('Done. Log in as test@matside.com to drive the tournaments through the dashboard.');
  console.log('Each scenario is in WEIGH_IN status (or ACTIVE for the live demo) — click');
  console.log('Generate Categories + Generate Brackets on the first three to set them up.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
